#!/usr/bin/env node
/**
 * Build step for Laws of AI Agents.
 *
 * Reads data/laws.json and the static assets in src/, then emits a fully
 * pre-rendered, SEO-optimized site into dist/:
 *   - index.html   server-rendered cards + references (crawlable) + meta + JSON-LD
 *   - sitemap.xml  home + one deep-link per law + references
 *   - robots.txt   allow-all, points at the sitemap
 *   - laws.json    raw data (handy as a tiny public API)
 *   - styles.css / app.js / favicon.svg / og-image.png  copied through
 *
 * Zero dependencies — pure Node. Edit data/laws.json, rebuild, done.
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const DATA = JSON.parse(readFileSync(join(ROOT, "data/laws.json"), "utf8"));
const DIST = join(ROOT, "dist");
const SITE = DATA.site;
const YEAR = "2026";

// ---------- helpers ----------
const esc = (s = "") =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const slugify = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const pad = (n) => String(n).padStart(2, "0");

const catById = Object.fromEntries(DATA.categories.map((c) => [c.id, c]));
const laws = DATA.laws.map((l) => ({ ...l, slug: slugify(l.name) }));
const refs = DATA.references || [];

// ---------- category icons (line, currentColor) ----------
const ICON_PATHS = {
  pulse: '<path d="M3 12h4l2.4-7 4.2 14 2.4-7H21"/>',
  branch: '<circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="8" r="2"/><path d="M6 8v8"/><path d="M6 13h5a4 4 0 0 0 4-4v-0.6"/>',
  database: '<ellipse cx="12" cy="6" rx="7" ry="2.6"/><path d="M5 6v6c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V6"/><path d="M5 12v6c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6v-6"/>',
  target: '<circle cx="12" cy="12" r="8.2"/><circle cx="12" cy="12" r="3.6"/><circle cx="12" cy="12" r="0.9" fill="currentColor" stroke="none"/>',
  command: '<path d="M5 8.5l3.8 3.5L5 15.5"/><path d="M12.5 16h6.5"/>',
  chart: '<path d="M3 21h18"/><path d="M6.5 21V11"/><path d="M12 21V5"/><path d="M17.5 21v-7"/>',
  shield: '<path d="M12 3l7 3v5c0 4.4-3 7.7-7 9-4-1.3-7-4.6-7-9V6z"/><path d="M9.4 12l1.8 1.8 3.6-3.7"/>',
  cube: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5"/><path d="M12 12v9"/>',
  person: '<circle cx="12" cy="8" r="3.4"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/>',
  nodes: '<circle cx="6" cy="7" r="2.2"/><circle cx="18" cy="7" r="2.2"/><circle cx="12" cy="17" r="2.2"/><path d="M7.8 8.6l2.6 6.4M16.2 8.6l-2.6 6.4M8.2 7h7.6"/>',
};
const icon = (id) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[id] || ""}</svg>`;

const arrow = '<svg class="arw" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg>';

// ---------- JSON-LD structured data ----------
function jsonLd() {
  const defined = laws.map((l) => ({
    "@type": "DefinedTerm",
    "@id": `${SITE.url}/#${l.slug}`,
    name: l.name,
    description: l.tagline,
    inDefinedTermSet: `${SITE.url}/#termset`,
    termCode: String(l.number),
    additionalProperty: [
      { "@type": "PropertyValue", name: "Principle", value: l.principle },
      { "@type": "PropertyValue", name: "Takeaway", value: l.takeaway },
      { "@type": "PropertyValue", name: "Category", value: catById[l.category]?.name || "" },
    ],
    ...(l.source?.url
      ? { subjectOf: { "@type": "CreativeWork", name: l.source.title, url: l.source.url } }
      : {}),
  }));

  const graph = [
    {
      "@type": "WebSite",
      "@id": `${SITE.url}/#website`,
      url: SITE.url + "/",
      name: SITE.name,
      description: SITE.description,
      inLanguage: "en",
      author: { "@type": "Person", name: SITE.author },
      citation: refs.map((r) => ({ "@type": "CreativeWork", name: r.title, url: r.url })),
    },
    {
      "@type": "DefinedTermSet",
      "@id": `${SITE.url}/#termset`,
      name: SITE.name,
      description: SITE.description,
      url: SITE.url + "/",
      hasDefinedTerm: defined,
    },
    {
      "@type": "ItemList",
      "@id": `${SITE.url}/#list`,
      name: SITE.name,
      numberOfItems: laws.length,
      itemListElement: laws.map((l) => ({
        "@type": "ListItem",
        position: l.number,
        url: `${SITE.url}/#${l.slug}`,
        name: l.name,
      })),
    },
  ];

  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph });
}

// ---------- card markup (pre-rendered, crawlable) ----------
function cardHtml(l) {
  const cat = catById[l.category] || {};
  const accent = cat.accent || "#888";
  const src = l.source || {};
  return `        <article class="card" id="${l.slug}"
          data-category="${esc(l.category)}"
          data-source-title="${esc(src.title || "")}"
          data-source-author="${esc(src.author || "")}"
          data-source-url="${esc(src.url || "")}"
          style="--card-accent:${accent};--tag-color:${accent}">
          <div class="card__top">
            <span class="card__icon">${icon(cat.icon)}</span>
            <span class="card__number">${pad(l.number)}</span>
          </div>
          <h2 class="card__name"><a href="#${l.slug}" class="card__link">${esc(l.name)}</a></h2>
          <p class="card__tagline">${esc(l.tagline)}</p>
          <div class="card__detail" hidden>
            <h3>The principle</h3>
            <p class="card__principle">${esc(l.principle)}</p>
            <h3>The takeaway</h3>
            <p class="card__takeaway">${esc(l.takeaway)}</p>
          </div>
          <div class="card__foot">
            <span class="tag">${esc(cat.name || "")}</span>
            <span class="card__cue" aria-hidden="true">Read the law ${arrow}</span>
          </div>
        </article>`;
}

function filterHtml() {
  const pills = [
    `<button class="filter is-active" data-filter="all"><span>All laws</span></button>`,
    ...DATA.categories.map(
      (c) =>
        `<button class="filter" data-filter="${esc(c.id)}" style="--tag-color:${c.accent}"><span class="filter__ic">${icon(c.icon)}</span><span>${esc(c.name)}</span></button>`
    ),
  ];
  return pills.join("\n      ");
}

function refsHtml() {
  if (!refs.length) return "";
  const items = refs
    .map(
      (r, i) => `      <li class="ref">
        <a class="ref__link" href="${esc(r.url)}" target="_blank" rel="noopener">
          <span class="ref__index">${pad(i + 1)}</span>
          <span class="ref__body">
            <span class="ref__title">${esc(r.title)} ${arrow}</span>
            <span class="ref__source">${esc(r.source)}</span>
            <span class="ref__note">${esc(r.note)}</span>
          </span>
        </a>
      </li>`
    )
    .join("\n");
  return `  <section class="refs" id="references" aria-label="Further reading">
    <div class="refs__head">
      <h2 class="refs__title">Further reading</h2>
      <p class="refs__sub">The thinking these laws lean on — foundational essays, papers, and docs worth your time.</p>
    </div>
    <ol class="refs__list">
${items}
    </ol>
  </section>`;
}

// ---------- page ----------
function indexHtml() {
  const canonical = SITE.url + "/";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(SITE.name)} — ${esc(DATA.subtitle)}</title>
  <meta name="description" content="${esc(SITE.description)}" />
  <meta name="keywords" content="${esc(SITE.keywords)}" />
  <meta name="author" content="${esc(SITE.author)}" />
  <meta name="robots" content="index, follow, max-image-preview:large" />
  <meta name="theme-color" content="#0b0c10" />
  <link rel="canonical" href="${canonical}" />

  <!-- Open Graph -->
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="${esc(SITE.name)}" />
  <meta property="og:title" content="${esc(SITE.name)}" />
  <meta property="og:description" content="${esc(SITE.description)}" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:locale" content="${esc(SITE.locale)}" />
  <meta property="og:image" content="${esc(SITE.ogImage)}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="${esc(SITE.name)}" />

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(SITE.name)}" />
  <meta name="twitter:description" content="${esc(SITE.description)}" />
  <meta name="twitter:image" content="${esc(SITE.ogImage)}" />
  <meta name="twitter:creator" content="${esc(SITE.twitter)}" />

  <link rel="icon" href="favicon.svg" type="image/svg+xml" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;450;500;600&family=JetBrains+Mono:wght@500;600&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="styles.css" />

  <script type="application/ld+json">${jsonLd()}</script>
</head>
<body>
  <div class="grain" aria-hidden="true"></div>

  <header class="hero">
    <div class="hero__inner">
      <p class="hero__eyebrow">Field notes · ${esc(SITE.version || "v1")}</p>
      <h1 class="hero__title">${esc(DATA.title)}</h1>
      <p class="hero__subtitle">${esc(DATA.subtitle)}</p>
      <p class="hero__intro">${esc(DATA.intro)}</p>
      <div class="hero__meta">
        <span class="hero__count">${laws.length} laws</span>
        <span class="hero__dot">·</span>
        <span>${DATA.categories.length} categories</span>
        <span class="hero__dot">·</span>
        <span>Inspired by <a href="https://lawsofux.com" target="_blank" rel="noopener">Laws of UX</a></span>
      </div>
    </div>
  </header>

  <nav class="filters" id="filters" aria-label="Filter laws by category">
      ${filterHtml()}
  </nav>

  <main class="grid" id="grid">
${laws.map(cardHtml).join("\n")}
  </main>

${refsHtml()}

  <footer class="footer">
    <p>Built by ${esc(SITE.author)}. A living list — more laws as they earn their place.</p>
    <p class="footer__sub">Inspired by the format of <a href="https://lawsofux.com" target="_blank" rel="noopener">Laws of UX</a> · ${YEAR}</p>
  </footer>

  <div class="modal" id="modal" role="dialog" aria-modal="true" aria-labelledby="modal-name" hidden>
    <div class="modal__backdrop" data-close></div>
    <article class="modal__card">
      <button class="modal__close" data-close aria-label="Close">&times;</button>
      <div class="modal__head">
        <span class="modal__icon" id="modal-icon"></span>
        <span class="modal__number" id="modal-number"></span>
        <span class="tag" id="modal-tag"></span>
      </div>
      <h2 class="modal__name" id="modal-name"></h2>
      <p class="modal__tagline" id="modal-tagline"></p>
      <div class="modal__body">
        <div class="modal__block">
          <h3>The principle</h3>
          <p id="modal-principle"></p>
        </div>
        <div class="modal__block">
          <h3>The takeaway</h3>
          <p id="modal-takeaway"></p>
        </div>
      </div>
      <a class="modal__source" id="modal-source" target="_blank" rel="noopener" hidden></a>
    </article>
  </div>

  <script src="app.js"></script>
</body>
</html>
`;
}

function sitemapXml() {
  const urls = [
    { loc: SITE.url + "/", priority: "1.0" },
    ...laws.map((l) => ({ loc: `${SITE.url}/#${l.slug}`, priority: "0.7" })),
    { loc: `${SITE.url}/#references`, priority: "0.5" },
  ];
  const body = urls
    .map(
      (u) =>
        `  <url>\n    <loc>${u.loc}</loc>\n    <changefreq>monthly</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

function robotsTxt() {
  return `User-agent: *\nAllow: /\n\nSitemap: ${SITE.url}/sitemap.xml\n`;
}

// ---------- emit ----------
if (existsSync(DIST)) rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

writeFileSync(join(DIST, "index.html"), indexHtml());
writeFileSync(join(DIST, "sitemap.xml"), sitemapXml());
writeFileSync(join(DIST, "robots.txt"), robotsTxt());
writeFileSync(join(DIST, "laws.json"), JSON.stringify(DATA, null, 2));

for (const asset of ["styles.css", "app.js", "favicon.svg"]) {
  copyFileSync(join(ROOT, "src", asset), join(DIST, asset));
}
const og = join(ROOT, "src", "og-image.png");
if (existsSync(og)) copyFileSync(og, join(DIST, "og-image.png"));

console.log(`✓ Built ${laws.length} laws + ${refs.length} references -> dist/`);
