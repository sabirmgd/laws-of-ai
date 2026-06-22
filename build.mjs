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
import { writeFileSync, mkdirSync, copyFileSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadBook } from "./lib/content.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const DIST = join(ROOT, "dist");
const YEAR = "2026";

// Single source of truth — shared with the PDF build (build-pdf.mjs).
const book = loadBook();
const DATA = { title: book.title, subtitle: book.subtitle, intro: book.intro, categories: book.categories, site: book.site };
const SITE = book.site;
const PRODUCT = SITE.product || {};

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

const catById = book.catById;
const laws = book.laws; // already enriched: slug, source, depth, signals, apply, example, sources, image
const refs = book.refs;

const flag = (name, fallback = false) => {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  if (/^(1|true|yes|on)$/i.test(value)) return true;
  if (/^(0|false|no|off)$/i.test(value)) return false;
  return fallback;
};
const productConfigured = () => PRODUCT.enabled !== false && Boolean(PRODUCT.name);
const productEnabled = () => productConfigured() && flag("PRODUCT_PUBLIC_ENABLED", true);
const paymentTestEnabled = () => productConfigured() && flag("PAYMENT_TEST_ENABLED", false);
const freeEditionEnabled = () => flag("FREE_EDITION_ENABLED", !productEnabled());
const productUrl = () => `${SITE.url}/${PRODUCT.slug || "ai-agent-audit-kit"}/`;
const productPath = () => `/${PRODUCT.slug || "ai-agent-audit-kit"}/`;
const sandboxProductUrl = () => `${SITE.url}/sandbox/${PRODUCT.slug || "ai-agent-audit-kit"}/`;
const sandboxProductPath = () => `/sandbox/${PRODUCT.slug || "ai-agent-audit-kit"}/`;
const editionEntryPath = () => freeEditionEnabled() ? "/edition.html" : "/access";
const productIsFree = () => PRODUCT.free === true || /^free\b/i.test(String(PRODUCT.price || "")) || flag("PRODUCT_FREE_ENABLED", false);
const checkoutHref = () => productIsFree() ? "/kit/START-HERE.md" : (PRODUCT.checkoutUrl || "#paypal-checkout");
const checkoutLabel = () => productIsFree() ? "Open the free kit" : `Get the kit — ${PRODUCT.price || "$14.90"}`;
const productPriceLabel = () => productIsFree() ? "Free" : (PRODUCT.price || "$14.90");
const productPriceSub = () => productIsFree() ? "Public during launch" : "skill + protected edition";
const productProviderLabel = () => productIsFree() ? "No checkout required" : `Checkout via ${PRODUCT.checkoutProvider || "PayPal"}`;

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
          <h2 class="card__name"><a href="/law/${l.slug}/" class="card__link">${esc(l.name)}</a></h2>
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

function newsletterHtml() {
  const n = SITE.newsletter;
  if (!n || !n.action) return ""; // off until an ESP action URL is configured
  const field = esc(n.field || "email");
  const action = esc(n.action);
  const target = /^https?:\/\//.test(n.action) ? ` target="_blank"` : "";
  const hidden = Object.entries(n.hidden || {})
    .filter(([, value]) => value !== undefined && value !== null && String(value) !== "")
    .map(([name, value]) => `<input type="hidden" name="${esc(name)}" value="${esc(value)}" />`)
    .join("\n        ");
  return `  <section class="signup" id="subscribe" aria-label="Newsletter signup">
    <div class="signup__in">
      <p class="signup__eyebrow">Free 5-day agent audit course</p>
      <h2 class="signup__title">Learn the failure modes before you buy the kit</h2>
      <p class="signup__sub">Five practical lessons on where AI agents break, each with a real example and a fix. No spam, unsubscribe anytime.</p>
      <form class="signup__form" action="${action}" method="post"${target}>
        ${hidden}
        <input class="signup__input" type="email" name="${field}" placeholder="you@company.com" autocomplete="email" required />
        <button class="signup__btn" type="submit">Start free</button>
      </form>
    </div>
  </section>`;
}

function heroCtaHtml() {
  if (!productEnabled() && !(SITE.newsletter && SITE.newsletter.action)) return "";
  return `      <div class="hero__actions">
        ${productEnabled() ? `<a class="hero__btn" href="${productPath()}">Get the audit kit ${arrow}</a>` : ""}
        ${SITE.newsletter?.action ? `<a class="hero__btn hero__btn--ghost" href="#subscribe">Free 5-day course</a>` : ""}
      </div>`;
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

// ---------- shared navigation (used by index + edition) ----------
const navMark = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12h4l2.4-7 4.2 14 2.4-7H21"/></svg>`;

function navHtml(active) {
  const link = (href, label, key) =>
    `<a class="nav__link${active === key ? " is-active" : ""}" href="${href}">${label}</a>`;
  return `  <a class="skip" href="#main">Skip to content</a>
  <header class="nav" id="nav">
    <div class="nav__in">
      <a class="nav__brand" href="/" aria-label="${esc(SITE.name)} — home">
        <span class="nav__mark">${navMark}</span>
        <span class="nav__brandtx">Laws of AI Agents</span>
      </a>
      <nav class="nav__links" aria-label="Primary">
        ${link("/#main", "All laws", "home")}
        ${productEnabled() ? link(productPath(), "Audit kit", "product") : ""}
        ${link(editionEntryPath(), "Digital edition", "edition")}
        ${link("/#references", "Sources", "refs")}
      </nav>
      <a class="nav__cta" href="${productEnabled() ? productPath() : editionEntryPath()}">${productEnabled() ? "Get the kit" : "Read the edition"} ${arrow}</a>
    </div>
  </header>`;
}

const backTopHtml = `  <button class="backtop" id="backtop" type="button" aria-label="Back to top">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg>
  </button>`;

function navCss() {
  return `/* Shared navigation, back-to-top, reading progress. Linked by index + edition. */
.skip{position:absolute;left:-999px;top:8px;z-index:200;background:var(--text,#f3f4f6);color:#0a0b0f;padding:8px 14px;border-radius:8px;font-family:var(--mono);font-size:13px}
.skip:focus{left:12px}
.nav{position:sticky;top:0;z-index:100;transition:background .25s ease,border-color .25s ease,backdrop-filter .25s ease;border-bottom:1px solid transparent}
.nav.is-scrolled{background:color-mix(in srgb,#0a0b0f 78%,transparent);backdrop-filter:blur(14px) saturate(1.2);-webkit-backdrop-filter:blur(14px) saturate(1.2);border-bottom-color:var(--border,#23262f)}
.nav__in{max-width:var(--maxw,1160px);margin:0 auto;padding:12px 24px;display:flex;align-items:center;gap:18px}
.nav__brand{display:inline-flex;align-items:center;gap:10px;flex:none}
.nav__mark{width:30px;height:30px;display:grid;place-items:center;border-radius:9px;color:#0a0b0f;background:linear-gradient(135deg,#7c9cff,#5ed3a8)}
.nav__mark svg{width:17px;height:17px}
.nav__brandtx{font-family:var(--serif,Georgia,serif);font-weight:500;font-size:17px;letter-spacing:-.01em;color:var(--text,#f3f4f6)}
.nav__links{display:flex;align-items:center;gap:4px;margin-left:6px}
.nav__link{font-family:var(--mono,monospace);font-size:13px;color:var(--text-dim,#9aa0ac);padding:7px 12px;border-radius:99px;transition:color .2s,background .2s}
.nav__link:hover{color:var(--text,#f3f4f6);background:color-mix(in srgb,#fff 6%,transparent)}
.nav__link.is-active{color:var(--text,#f3f4f6);background:color-mix(in srgb,var(--accent,#7c9cff) 16%,transparent)}
.nav__cta{margin-left:auto;display:inline-flex;align-items:center;gap:7px;font-family:var(--mono,monospace);font-size:13px;color:#0a0b0f;background:var(--text,#f3f4f6);border-radius:99px;padding:9px 16px;white-space:nowrap;transition:transform .2s var(--ease,ease),opacity .2s}
.nav__cta:hover{transform:translateY(-1px);opacity:.92;color:#0a0b0f}
.nav__cta .arw{width:12px;height:12px}
.backtop{position:fixed;right:22px;bottom:22px;z-index:90;width:44px;height:44px;display:grid;place-items:center;border-radius:50%;border:1px solid var(--border,#23262f);background:color-mix(in srgb,#14161d 88%,transparent);backdrop-filter:blur(8px);color:var(--text,#f3f4f6);cursor:pointer;opacity:0;transform:translateY(8px);pointer-events:none;transition:opacity .25s,transform .25s}
.backtop.is-on{opacity:1;transform:none;pointer-events:auto}
.backtop:hover{border-color:var(--accent,#7c9cff);color:var(--accent,#7c9cff)}
.backtop svg{width:19px;height:19px}
@media(max-width:680px){
  .nav__brandtx{display:none}
  .nav__cta{display:none}
  .nav__links{margin-left:auto;gap:2px}
  .nav__link{padding:7px 9px;font-size:12px}
}
`;
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
  <link rel="stylesheet" href="nav.css" />

  <script type="application/ld+json">${jsonLd()}</script>
${SITE.ga ? `  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=${SITE.ga}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${SITE.ga}');
  </script>
` : ""}</head>

<body>
  <div class="grain" aria-hidden="true"></div>

${navHtml("home")}

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
${heroCtaHtml()}
    </div>
  </header>

${productEnabled() ? productPromoHtml() : ""}

${editionPromoHtml()}

  <div class="filterbar" id="filterbar">
    <div class="filterbar__in">
      <nav class="filters" id="filters" aria-label="Filter laws by category">
        ${filterHtml()}
      </nav>
      <span class="filters__count" id="filtersCount">${laws.length} laws</span>
    </div>
  </div>

  <main class="grid" id="main" tabindex="-1">
${laws.map(cardHtml).join("\n")}
  </main>

${newsletterHtml()}

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

${backTopHtml}

  <script src="app.js"></script>
</body>
</html>
`;
}

// ---------- digital edition (the expandable full book; gate later) ----------
const lawsInCat = (id) => laws.filter((l) => l.category === id);

function editionImg(l) {
  if (!l.image) return "";
  return `<figure class="lw__fig"><img loading="lazy" decoding="async" width="${l.image.width}" height="${l.image.height}" src="assets/edition/${l.image.file}" alt="Diagram explaining ${esc(l.name)}" /></figure>`;
}

function editionLaw(l) {
  const cat = catById[l.category] || {};
  const signals = l.signals.map((s) => `<li>${esc(s)}</li>`).join("");
  const apply = l.apply.map((s) => `<li>${esc(s)}</li>`).join("");
  const sources = l.sources
    .map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}${s.author ? ` · ${esc(s.author)}` : ""} ${arrow}</a></li>`)
    .join("");
  return `      <details class="lw" id="${l.slug}" style="--ac:${cat.accent || "#888"}">
        <summary class="lw__sum">
          <span class="lw__no">${pad(l.number)}</span>
          <span class="lw__head">
            <span class="lw__name">${esc(l.name)}</span>
            <span class="lw__tag">${esc(l.tagline)}</span>
          </span>
          <span class="lw__chev" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
          </span>
        </summary>
        <div class="lw__open">
          ${editionImg(l)}
          <div class="lw__txt">
            <p class="lw__lbl">The principle</p>
            <p>${esc(l.principle)}</p>
            ${l.depth ? `<p class="lw__lbl">Why it happens</p><p>${esc(l.depth)}</p>` : ""}
            ${signals ? `<p class="lw__lbl">Watch for</p><ul class="lw__ul">${signals}</ul>` : ""}
            ${l.example ? `<div class="lw__call"><p class="lw__lbl lw__lbl--ac">In practice</p><p>${esc(l.example)}</p></div>` : ""}
            ${apply ? `<p class="lw__lbl lw__lbl--ac">Apply it</p><ol class="lw__ol">${apply}</ol>` : ""}
            <div class="lw__call lw__call--take"><p class="lw__lbl lw__lbl--ac">The takeaway</p><p>${esc(l.takeaway)}</p></div>
            ${sources ? `<p class="lw__lbl">Sources and further reading</p><ul class="lw__src">${sources}</ul>` : ""}
          </div>
        </div>
      </details>`;
}

function editionBody() {
  return DATA.categories
    .map((c, i) => {
      const ls = lawsInCat(c.id);
      const divider = `      <section class="part" id="cat-${c.id}" style="--ac:${c.accent}">
        <span class="part__ic">${icon(c.icon)}</span>
        <div>
          <p class="part__eyebrow">Part ${i + 1} · Laws ${pad(ls[0].number)}–${pad(ls[ls.length - 1].number)}</p>
          <h2 class="part__name">${esc(c.name)}</h2>
          <p class="part__blurb">${esc(c.blurb)}</p>
        </div>
      </section>`;
      return divider + "\n" + ls.map(editionLaw).join("\n");
    })
    .join("\n");
}

function editionToc() {
  return DATA.categories
    .map((c, i) => {
      const ls = lawsInCat(c.id);
      return `        <a href="#cat-${c.id}" data-target="cat-${c.id}" style="--ac:${c.accent}"><span>Part ${i + 1} · ${pad(ls[0].number)}–${pad(ls[ls.length - 1].number)}</span>${esc(c.name)}</a>`;
    })
    .join("\n");
}

function buyerResourcesHtml() {
  if (!productConfigured()) return "";
  const resources = [
    ["Start here", "/paid/kit/START-HERE.md", "What is included and how to use it."],
    ["Install skill", "/paid/kit/ai-agent-audit/assets/install-codex-claude.md", "Copy the skill into Codex or Claude."],
    ["Copy-paste prompt", "/paid/kit/ai-agent-audit/assets/copy-paste-audit-prompt.md", "Use the workflow without installing a skill."],
    ["Sample audit", "/paid/kit/ai-agent-audit/assets/sample-audit.md", "See the expected output shape."],
    ["Intake checklist", "/paid/kit/ai-agent-audit/assets/intake-checklist.md", "Gather the right prompts, tools, traces, and evals."],
    ["Report template", "/paid/kit/ai-agent-audit/assets/audit-report-template.md", "Turn findings into an implementation plan."],
  ];
  return `  <section class="buyer" aria-label="Buyer resources">
    <div>
      <p class="buyer__eyebrow">Buyer resources</p>
      <h2>Use the audit skill with the protected edition.</h2>
      <p>The online book stays protected here. The skill files, rubric, templates, and examples are available behind the same buyer access.</p>
    </div>
    <nav class="buyer__links" aria-label="Audit kit files">
${resources.map(([label, href, note]) => `      <a href="${href}"><span>${esc(label)}</span><small>${esc(note)}</small></a>`).join("\n")}
    </nav>
  </section>
`;
}

function kitResourceLinks() {
  return [
    ["Download zip", "/kit.zip", "Download the full skill bundle."],
    ["Start here", "/kit/START-HERE.md", "What the kit is and how to use it."],
    ["Skill prompt", "/kit/ai-agent-audit/SKILL.md", "The installable ai-agent-audit skill."],
    ["Full rubric", "/kit/ai-agent-audit/references/50-laws-audit-rubric.md", "All 50 laws as an audit rubric."],
    ["Platform intake", "/kit/ai-agent-audit/assets/platform-intake.md", "Repo, workflow, SDK/API, black-box, and client-report inputs."],
    ["Install guide", "/kit/ai-agent-audit/assets/install-codex-claude.md", "Install in Codex or Claude."],
    ["Copy-paste prompt", "/kit/ai-agent-audit/assets/copy-paste-audit-prompt.md", "Use it without installable skill support."],
    ["Sample audit", "/kit/ai-agent-audit/assets/sample-audit.md", "Example output for a flawed support agent."],
    ["Intake checklist", "/kit/ai-agent-audit/assets/intake-checklist.md", "Gather prompts, tools, traces, and evals."],
    ["Report template", "/kit/ai-agent-audit/assets/audit-report-template.md", "Turn findings into a fix plan."],
  ];
}

function publicKitResourcesHtml() {
  return `    <section class="buyer product__resources" aria-label="Free audit skill files">
      <div>
        <p class="buyer__eyebrow">Free during launch</p>
        <h2>Use the skill files now.</h2>
        <p>The audit kit is public while we decide what should become paid. Install the skill, download the bundle, or use the copy-paste prompt where your agent already lives.</p>
      </div>
      <nav class="buyer__links" aria-label="Free audit kit files">
${kitResourceLinks().map(([label, href, note]) => `        <a href="${href}"><span>${esc(label)}</span><small>${esc(note)}</small></a>`).join("\n")}
      </nav>
    </section>
`;
}

function editionHtml({ buyerResources = false } = {}) {
  const canonical = SITE.url + "/edition.html";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(SITE.name)} — The Expanded Digital Edition</title>
  <meta name="description" content="The expanded digital edition of ${esc(SITE.name)}: all ${laws.length} laws in full — the mechanism, warning signs, a worked example, an apply-it recipe, and sources, each with an explanatory diagram." />
  <meta name="author" content="${esc(SITE.author)}" />
  <link rel="canonical" href="${canonical}" />
  <meta name="theme-color" content="#0b0c10" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${esc(SITE.name)} — The Expanded Digital Edition" />
  <meta property="og:description" content="All ${laws.length} laws in full, each with an explanatory diagram." />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:image" content="${esc(SITE.ogImage)}" />
  <link rel="icon" href="favicon.svg" type="image/svg+xml" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;450;500;600&family=JetBrains+Mono:wght@500;600&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="edition.css" />
  <link rel="stylesheet" href="nav.css" />
${SITE.ga ? `  <script async src="https://www.googletagmanager.com/gtag/js?id=${SITE.ga}"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${SITE.ga}');</script>
` : ""}</head>
<body class="ed">
  <div class="grain" aria-hidden="true"></div>

${navHtml("edition")}
  <div class="progress" aria-hidden="true"><span id="progressBar"></span></div>

  <header class="ed__hero">
    <p class="ed__eyebrow">The Expanded Digital Edition · ${esc(SITE.version || "v1")}</p>
    <h1 class="ed__title">${esc(DATA.title)}</h1>
    <p class="ed__sub">${esc(DATA.subtitle)}</p>
    <p class="ed__intro">${esc(DATA.intro)}</p>
    <div class="ed__meta">
      <span>${laws.length} laws</span><span>·</span>
      <span>the mechanism</span><span>·</span>
      <span>worked examples</span><span>·</span>
      <span>apply-it recipes</span><span>·</span>
      <span>${refs.length}+ sources</span>
    </div>
    <div class="ed__controls">
      <button class="ed__btn" id="expandAll">Expand all</button>
      <button class="ed__btn ed__btn--ghost" id="collapseAll">Collapse all</button>
    </div>
  </header>

${buyerResources ? buyerResourcesHtml() : ""}

  <aside class="ed__toc" id="edToc" aria-label="Contents">
    <p class="ed__toc-h">Contents</p>
    <nav>
${editionToc()}
    </nav>
  </aside>
  <div class="ed__toc-backdrop" id="tocBackdrop"></div>
  <button class="tocfab" id="tocFab" type="button" aria-label="Open contents" aria-expanded="false">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>
    Contents
  </button>

  <main class="ed__main" id="main">
${editionBody()}
  </main>

  <footer class="ed__foot">
    <p>${esc(SITE.name)} · The Expanded Digital Edition · by ${esc(SITE.author)} · ${YEAR}</p>
    <p class="ed__foot-sub"><a href="index.html">Back to the free overview</a> · Inspired by the format of <a href="https://lawsofux.com" target="_blank" rel="noopener">Laws of UX</a></p>
  </footer>

${backTopHtml}

  <script>
    (function () {
      var accessType = location.pathname.indexOf('/paid/') === 0 ? 'paid' : 'free';
      function track(name, params) {
        if (window.gtag) {
          try { window.gtag('event', name, params || {}); } catch (_) {}
        }
      }
      track('edition_view', { page_path: location.pathname, edition_access: accessType });

      var all = function () { return Array.prototype.slice.call(document.querySelectorAll('details.lw')); };
      var ea = document.getElementById('expandAll');
      var ca = document.getElementById('collapseAll');
      if (ea) ea.addEventListener('click', function () { all().forEach(function (d) { d.open = true; }); });
      if (ca) ca.addEventListener('click', function () { all().forEach(function (d) { d.open = false; }); });
      all().forEach(function (d) {
        d.addEventListener('toggle', function () {
          if (d.open) track('edition_law_open', { law_id: d.id || '', edition_access: accessType });
        });
      });

      function openHash() {
        if (!location.hash) return;
        var el = document.querySelector(location.hash);
        if (el && el.tagName === 'DETAILS') { el.open = true; el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      }
      window.addEventListener('hashchange', openHash);
      openHash();

      // Reading progress + sticky-nav shadow + back-to-top
      var nav = document.getElementById('nav');
      var bar = document.getElementById('progressBar');
      var backtop = document.getElementById('backtop');
      var fired75 = false;
      function onScroll() {
        var doc = document.documentElement;
        var max = (doc.scrollHeight - doc.clientHeight) || 1;
        var y = window.scrollY || window.pageYOffset || 0;
        var progress = Math.min(100, (y / max) * 100);
        if (bar) bar.style.width = progress + '%';
        if (!fired75 && progress >= 75) {
          fired75 = true;
          track('scroll_75', { page_path: location.pathname, edition_access: accessType });
        }
        if (nav) nav.classList.toggle('is-scrolled', y > 8);
        if (backtop) backtop.classList.toggle('is-on', y > 560);
        spy(y);
      }
      if (backtop) backtop.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });

      // Scrollspy: highlight the category in the sidebar TOC
      var tocLinks = Array.prototype.slice.call(document.querySelectorAll('.ed__toc a'));
      var parts = tocLinks.map(function (a) { return document.getElementById(a.dataset.target); });
      function spy(y) {
        if (!tocLinks.length) return;
        var idx = 0;
        for (var i = 0; i < parts.length; i++) {
          if (parts[i] && parts[i].getBoundingClientRect().top <= 120) idx = i;
        }
        tocLinks.forEach(function (a, i) { a.classList.toggle('is-active', i === idx); });
      }
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();

      // Mobile Contents drawer
      var toc = document.getElementById('edToc');
      if (toc) toc.classList.add('is-ready');
      var fab = document.getElementById('tocFab');
      var backdrop = document.getElementById('tocBackdrop');
      if (backdrop) backdrop.classList.add('is-ready');
      function setDrawer(open) {
        if (!toc) return;
        toc.classList.toggle('is-open', open);
        if (backdrop) backdrop.classList.toggle('is-open', open);
        if (fab) fab.setAttribute('aria-expanded', open ? 'true' : 'false');
        document.body.style.overflow = open ? 'hidden' : '';
      }
      if (fab) fab.addEventListener('click', function () { setDrawer(!toc.classList.contains('is-open')); });
      if (backdrop) backdrop.addEventListener('click', function () { setDrawer(false); });
      tocLinks.forEach(function (a) { a.addEventListener('click', function () { setDrawer(false); }); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setDrawer(false); });
    })();
  </script>
</body>
</html>
`;
}

function editionPromoHtml() {
  return `  <section class="promo" aria-label="Digital edition">
    <div class="promo__in">
      <p class="promo__eyebrow">${productEnabled() && !productIsFree() ? "Protected Buyer Edition" : "The Expanded Digital Edition"}</p>
      <h2 class="promo__title">Every law, in full — with a diagram for each.</h2>
      <p class="promo__sub">The mechanism underneath, the warning signs, a worked example, an apply-it recipe, and the sources. ${laws.length} laws, expandable in one place${productEnabled() && !productIsFree() ? " for paid buyers" : ""}.</p>
      <a class="promo__btn" href="${editionEntryPath()}">${productEnabled() && !productIsFree() ? "Unlock the digital edition" : "Open the digital edition"} ${arrow}</a>
    </div>
  </section>`;
}

function productPromoHtml() {
  return `  <section class="promo promo--product" aria-label="${esc(PRODUCT.shortName || PRODUCT.name)}">
    <div class="promo__in">
      <p class="promo__eyebrow">${productIsFree() ? "Free kit" : "Paid kit"} · ${esc(productPriceLabel())}</p>
      <h2 class="promo__title">${esc(PRODUCT.name)}</h2>
      <p class="promo__sub">I built this after building and reviewing real agents. Use the installable audit skill and rubric to inspect prompts, tools, retrieval, evals, security, and handoffs.</p>
      <a class="promo__btn" href="${productPath()}">See what is inside ${arrow}</a>
    </div>
  </section>`;
}

function editionCss() {
  return `/* The Expanded Digital Edition — self-contained, dark, premium. */
:root{--bg:#0a0b0f;--card:#14161d;--card-hover:#181b24;--border:#23262f;--text:#f3f4f6;--dim:#9aa0ac;--faint:#6b7180;--accent:#7c9cff;--serif:"Fraunces",Georgia,serif;--sans:"Inter",system-ui,sans-serif;--mono:"JetBrains Mono",ui-monospace,monospace;--maxw:840px;--ease:cubic-bezier(.16,1,.3,1)}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body.ed{font-family:var(--sans);background:var(--bg);color:var(--text);line-height:1.65;-webkit-font-smoothing:antialiased;position:relative}
body.ed::before{content:"";position:fixed;inset:0;background:radial-gradient(60% 50% at 12% -5%,rgba(124,156,255,.13),transparent 70%),radial-gradient(48% 45% at 88% 6%,rgba(184,156,255,.10),transparent 70%),radial-gradient(55% 50% at 50% 105%,rgba(94,211,168,.07),transparent 70%);pointer-events:none;z-index:0}
.grain{position:fixed;inset:0;z-index:1;pointer-events:none;opacity:.022;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}
a{color:inherit;text-decoration:none}
.arw{width:13px;height:13px;flex:none}
.ed__hero,.ed__main,.ed__foot{position:relative;z-index:2;max-width:var(--maxw);margin:0 auto;padding-left:24px;padding-right:24px}
.ed__hero{padding-top:clamp(40px,8vw,84px);padding-bottom:clamp(28px,5vw,48px)}
.ed__back{font-family:var(--mono);font-size:13px;color:var(--dim)}
.ed__back:hover{color:var(--accent)}
.ed__eyebrow{font-family:var(--mono);font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--accent);margin-top:22px}
.ed__title{font-family:var(--serif);font-weight:500;font-size:clamp(34px,6vw,56px);line-height:1.02;letter-spacing:-.02em;margin-top:14px}
.ed__sub{font-family:var(--serif);font-size:clamp(17px,2.5vw,21px);color:#cdd2dc;margin-top:14px}
.ed__intro{color:var(--dim);margin-top:16px;max-width:680px}
.ed__meta{display:flex;flex-wrap:wrap;gap:10px;font-family:var(--mono);font-size:12px;color:var(--faint);margin-top:18px}
.ed__controls{display:flex;gap:10px;margin-top:24px}
.ed__btn{font-family:var(--mono);font-size:13px;color:#0a0b0f;background:var(--text);border:1px solid var(--text);border-radius:99px;padding:9px 16px;cursor:pointer;transition:transform .2s var(--ease),opacity .2s}
.ed__btn:hover{transform:translateY(-1px);opacity:.92}
.ed__btn--ghost{color:var(--text);background:transparent;border-color:var(--border)}
.ed__btn--ghost:hover{border-color:var(--dim)}
.buyer{position:relative;z-index:2;max-width:var(--maxw);margin:0 auto 28px;padding:0 24px}
.buyer>div{padding:20px 0 14px;border-top:1px solid var(--border)}
.buyer__eyebrow{font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--accent);font-weight:600}
.buyer h2{font-family:var(--serif);font-size:24px;font-weight:500;letter-spacing:-.01em;margin-top:4px}
.buyer p:not(.buyer__eyebrow){color:var(--dim);margin-top:6px;max-width:660px}
.buyer__links{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px}
.buyer__links a{display:block;min-height:76px;border:1px solid var(--border);border-radius:8px;background:color-mix(in srgb,#14161d 82%,transparent);padding:12px;transition:border-color .2s,background .2s,transform .2s var(--ease)}
.buyer__links a:hover{border-color:var(--accent);background:var(--card-hover);transform:translateY(-1px)}
.buyer__links span{display:block;font-family:var(--mono);font-size:12px;color:var(--text);font-weight:600}
.buyer__links small{display:block;margin-top:4px;color:var(--dim);font-size:12px;line-height:1.35}
.part{display:flex;gap:16px;align-items:flex-start;margin:54px 0 18px;padding-top:26px;border-top:1px solid var(--border)}
.part:first-of-type{border-top:none;margin-top:8px}
.part__ic{width:40px;height:40px;flex:none;display:grid;place-items:center;border-radius:12px;color:var(--ac);background:color-mix(in srgb,var(--ac) 14%,transparent);border:1px solid color-mix(in srgb,var(--ac) 30%,transparent)}
.part__ic svg{width:20px;height:20px}
.part__eyebrow{font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--ac)}
.part__name{font-family:var(--serif);font-weight:500;font-size:26px;letter-spacing:-.01em;margin-top:4px}
.part__blurb{color:var(--dim);margin-top:4px}
.lw{border:1px solid var(--border);border-radius:16px;background:var(--card);margin:10px 0;overflow:hidden;transition:border-color .2s,background .2s}
.lw[open]{border-color:color-mix(in srgb,var(--ac) 40%,var(--border));background:var(--card-hover)}
.lw__sum{display:flex;align-items:center;gap:16px;padding:18px 20px;cursor:pointer;list-style:none}
.lw__sum::-webkit-details-marker{display:none}
.lw__no{font-family:var(--mono);font-weight:600;font-size:14px;color:var(--ac);flex:none;width:28px}
.lw__head{flex:1;min-width:0}
.lw__name{display:block;font-family:var(--serif);font-weight:500;font-size:19px;letter-spacing:-.01em}
.lw__tag{display:block;font-family:var(--serif);font-style:italic;font-size:14px;color:var(--ac);margin-top:2px}
.lw__chev{flex:none;color:var(--faint);transition:transform .25s var(--ease)}
.lw__chev svg{width:18px;height:18px}
.lw[open] .lw__chev{transform:rotate(180deg)}
.lw__open{padding:0 20px 22px;border-top:1px solid var(--border)}
.lw__fig{margin:18px 0;border-radius:12px;overflow:hidden;background:color-mix(in srgb,var(--ac) 6%,#0e1016);border:1px solid color-mix(in srgb,var(--ac) 16%,transparent)}
.lw__fig img{display:block;width:100%;height:auto;max-height:520px;object-fit:contain}
.lw__txt>p,.lw__txt ul,.lw__txt ol{font-size:15.5px;color:#dfe2e8}
.lw__lbl{font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--faint);margin-top:18px;margin-bottom:4px;font-weight:600}
.lw__lbl--ac{color:var(--ac)}
.lw__ul,.lw__ol{margin:6px 0 0 2px;padding:0}
.lw__ul li,.lw__ol li{margin:0 0 6px 0;padding-left:24px;position:relative;list-style:none}
.lw__ul li::before{content:"";position:absolute;left:6px;top:10px;width:5px;height:5px;border-radius:50%;background:var(--ac)}
.lw__ol{counter-reset:ap}
.lw__ol li::before{counter-increment:ap;content:counter(ap);position:absolute;left:0;top:1px;width:17px;height:17px;border-radius:50%;background:color-mix(in srgb,var(--ac) 18%,transparent);color:var(--ac);font-family:var(--mono);font-size:10px;font-weight:600;display:grid;place-items:center}
.lw__call{margin-top:16px;padding:14px 16px;border-radius:12px;background:color-mix(in srgb,var(--ac) 7%,#0e1016);border:1px solid color-mix(in srgb,var(--ac) 18%,transparent);border-left:2.5px solid var(--ac)}
.lw__call .lw__lbl{margin-top:0}
.lw__src{margin:6px 0 0;padding:0;list-style:none}
.lw__src li{margin:0 0 6px}
.lw__src a{font-family:var(--mono);font-size:13px;color:var(--ac);display:inline-flex;align-items:center;gap:6px}
.lw__src a:hover{text-decoration:underline}
.ed__foot{padding:48px 24px 64px;border-top:1px solid var(--border);margin-top:54px;color:var(--faint);font-family:var(--mono);font-size:12.5px;text-align:center}
.ed__foot-sub{margin-top:8px}
.ed__foot a:hover{color:var(--accent)}
.progress{position:fixed;top:0;left:0;right:0;height:3px;z-index:120;pointer-events:none}
.progress span{display:block;height:100%;width:0;background:linear-gradient(90deg,#7c9cff,#5ed3a8)}
.part{scroll-margin-top:84px}
.lw{scroll-margin-top:84px}
/* Contents: a slide-in drawer on small screens, a fixed sidebar on large ones. */
.ed__toc{display:none;position:fixed;top:0;left:0;z-index:130;width:286px;max-width:84vw;height:100%;overflow:auto;padding:74px 18px 28px;background:#0e1016;border-right:1px solid var(--border);transform:translateX(-100%);visibility:hidden}
.ed__toc.is-ready{display:block;transition:transform .28s var(--ease),visibility .28s}
.ed__toc.is-open{transform:none;visibility:visible}
.ed__toc-h{font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--faint);margin-bottom:10px}
.ed__toc nav{display:flex;flex-direction:column;gap:2px}
.ed__toc a{font-size:13px;color:var(--dim);padding:7px 10px;border-radius:8px;border-left:2px solid transparent;line-height:1.3;transition:color .2s,border-color .2s,background .2s}
.ed__toc a span{display:block;font-family:var(--mono);font-size:10px;color:var(--faint);margin-bottom:1px}
.ed__toc a:hover{color:var(--text)}
.ed__toc a.is-active{color:var(--text);border-left-color:var(--ac,#7c9cff);background:color-mix(in srgb,#fff 5%,transparent)}
.ed__toc-backdrop{display:none;position:fixed;inset:0;z-index:125;background:rgba(0,0,0,.55);opacity:0;visibility:hidden}
.ed__toc-backdrop.is-ready{display:block;transition:opacity .25s,visibility .25s}
.ed__toc-backdrop.is-open{opacity:1;visibility:visible}
.tocfab{position:fixed;left:22px;bottom:22px;z-index:90;display:inline-flex;align-items:center;gap:8px;height:44px;padding:0 16px;border-radius:99px;border:1px solid var(--border);background:color-mix(in srgb,#14161d 92%,transparent);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);color:var(--text);font-family:var(--mono);font-size:13px;cursor:pointer;transition:border-color .2s,color .2s}
.tocfab svg{width:16px;height:16px}
.tocfab:hover{border-color:var(--accent);color:var(--accent)}
@media(min-width:1300px){
  .ed__toc{display:block;position:fixed;top:104px;left:calc((100vw - 840px)/2 - 240px);width:212px;max-width:none;height:auto;max-height:calc(100vh - 150px);padding:0;background:none;border:none;transform:none;visibility:visible;z-index:80}
  .tocfab,.ed__toc-backdrop{display:none}
}
@media(max-width:720px){.buyer__links{grid-template-columns:1fr}}
@media(max-width:560px){.lw__sum{gap:12px;padding:15px 16px}.lw__open{padding:0 16px 18px}.lw__name{font-size:17px}}
`;
}

// ---------- per-law page (one URL per law, fully crawlable) ----------
function relatedLaws(law, n = 3) {
  // Same category first, excluding self; pad with numeric neighbors if needed.
  const sib = laws.filter((x) => x.category === law.category && x.slug !== law.slug);
  const pool = sib.slice(0, n);
  if (pool.length < n) {
    const extras = laws
      .filter((x) => x.slug !== law.slug && !pool.find((p) => p.slug === x.slug))
      .sort((a, b) => Math.abs(a.number - law.number) - Math.abs(b.number - law.number));
    for (const e of extras) {
      if (pool.length >= n) break;
      pool.push(e);
    }
  }
  return pool.slice(0, n);
}

function lawJsonLd(l) {
  const cat = catById[l.category] || {};
  const url = `${SITE.url}/law/${l.slug}/`;
  const graph = [
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: SITE.url + "/" },
        { "@type": "ListItem", position: 2, name: cat.name || "Category", item: `${SITE.url}/category/${l.category}/` },
        { "@type": "ListItem", position: 3, name: l.name, item: url },
      ],
    },
    {
      "@type": "DefinedTerm",
      "@id": url + "#term",
      name: l.name,
      description: l.tagline,
      inDefinedTermSet: `${SITE.url}/#termset`,
      termCode: String(l.number),
      url,
      additionalProperty: [
        { "@type": "PropertyValue", name: "Principle", value: l.principle },
        { "@type": "PropertyValue", name: "Takeaway", value: l.takeaway },
        { "@type": "PropertyValue", name: "Category", value: cat.name || "" },
      ],
      ...(l.source?.url
        ? { subjectOf: { "@type": "CreativeWork", name: l.source.title, url: l.source.url } }
        : {}),
    },
    {
      "@type": "Article",
      "@id": url + "#article",
      headline: `${l.name} — ${l.tagline}`,
      description: l.principle.slice(0, 280),
      url,
      mainEntityOfPage: url,
      author: { "@type": "Person", name: SITE.author, url: `${SITE.url}/sabir/` },
      publisher: { "@type": "Organization", name: SITE.name, url: SITE.url + "/" },
      inLanguage: "en",
      isPartOf: `${SITE.url}/#website`,
      image: l.image ? `${SITE.url}/assets/edition/${l.image.file}` : SITE.ogImage,
    },
  ];
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph });
}

function lawPageHtml(l) {
  const cat = catById[l.category] || {};
  const accent = cat.accent || "#7c9cff";
  const url = `${SITE.url}/law/${l.slug}/`;
  const signals = (l.signals || []).map((s) => `<li>${esc(s)}</li>`).join("");
  const apply = (l.apply || []).map((s) => `<li>${esc(s)}</li>`).join("");
  const sources = (l.sources || [])
    .map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener" data-track="source_click" data-source-url="${esc(s.url)}">${esc(s.title)}${s.author ? ` · ${esc(s.author)}` : ""} ${arrow}</a></li>`)
    .join("");
  const img = l.image
    ? `<figure class="lw__fig"><img loading="lazy" decoding="async" width="${l.image.width}" height="${l.image.height}" src="/assets/edition/${l.image.file}" alt="Diagram explaining ${esc(l.name)}" /></figure>`
    : "";
  const related = relatedLaws(l, 3)
    .map((r) => {
      const rcat = catById[r.category] || {};
      return `        <a class="rel__card" href="/law/${r.slug}/" style="--ac:${rcat.accent || "#7c9cff"}">
          <span class="rel__no">${pad(r.number)}</span>
          <span class="rel__body">
            <span class="rel__name">${esc(r.name)}</span>
            <span class="rel__tag">${esc(r.tagline)}</span>
            <span class="rel__cat">${esc(rcat.name || "")}</span>
          </span>
        </a>`;
    })
    .join("\n");

  const description = (l.tagline + " " + l.principle).slice(0, 300);
  const title = `${l.name} — ${l.tagline} | ${SITE.name}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <meta name="author" content="${esc(SITE.author)}" />
  <meta name="robots" content="index, follow, max-image-preview:large" />
  <meta name="theme-color" content="#0b0c10" />
  <link rel="canonical" href="${url}" />

  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="${esc(SITE.name)}" />
  <meta property="og:title" content="${esc(l.name)} — ${esc(l.tagline)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:locale" content="${esc(SITE.locale)}" />
  <meta property="og:image" content="${l.image ? `${SITE.url}/assets/edition/${l.image.file}` : esc(SITE.ogImage)}" />
  <meta property="og:image:alt" content="${esc(l.name)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(l.name)} — ${esc(l.tagline)}" />
  <meta name="twitter:description" content="${esc(description)}" />
  <meta name="twitter:image" content="${l.image ? `${SITE.url}/assets/edition/${l.image.file}` : esc(SITE.ogImage)}" />
  <meta name="twitter:creator" content="${esc(SITE.twitter)}" />

  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;450;500;600&family=JetBrains+Mono:wght@500;600&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/edition.css" />
  <link rel="stylesheet" href="/law.css" />
  <link rel="stylesheet" href="/nav.css" />

  <script type="application/ld+json">${lawJsonLd(l)}</script>
${SITE.ga ? `  <script async src="https://www.googletagmanager.com/gtag/js?id=${SITE.ga}"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${SITE.ga}');</script>
` : ""}</head>

<body class="ed law">
  <div class="grain" aria-hidden="true"></div>
${navHtml("home")}
  <div class="progress" aria-hidden="true"><span id="progressBar"></span></div>

  <nav class="crumb" aria-label="Breadcrumb">
    <a href="/">Home</a>
    <span aria-hidden="true">›</span>
    <a href="/category/${l.category}/">${esc(cat.name || "")}</a>
    <span aria-hidden="true">›</span>
    <span aria-current="page">${esc(l.name)}</span>
  </nav>

  <article class="law__page" id="main" style="--ac:${accent}">
    <header class="law__hero">
      <p class="law__eyebrow">Law ${pad(l.number)} · ${esc(cat.name || "")}</p>
      <h1 class="law__title">${esc(l.name)}</h1>
      <p class="law__sub">${esc(l.tagline)}</p>
    </header>

    ${img}

    <section class="law__body">
      <h2 class="lw__lbl">The principle</h2>
      <p>${esc(l.principle)}</p>
      ${l.depth ? `<h2 class="lw__lbl">Why it happens</h2><p>${esc(l.depth)}</p>` : ""}
      ${signals ? `<h2 class="lw__lbl">Watch for</h2><ul class="lw__ul">${signals}</ul>` : ""}
      ${l.example ? `<div class="lw__call"><p class="lw__lbl lw__lbl--ac">In practice</p><p>${esc(l.example)}</p></div>` : ""}
      ${apply ? `<h2 class="lw__lbl lw__lbl--ac">Apply it</h2><ol class="lw__ol">${apply}</ol>` : ""}
      <div class="lw__call lw__call--take"><p class="lw__lbl lw__lbl--ac">The takeaway</p><p>${esc(l.takeaway)}</p></div>
      ${sources ? `<h2 class="lw__lbl">Sources and further reading</h2><ul class="lw__src">${sources}</ul>` : ""}
    </section>

    <section class="rel" aria-label="Related laws">
      <h2 class="rel__h">Related laws</h2>
      <div class="rel__grid">
${related}
      </div>
    </section>

    <section class="law__more">
      ${productEnabled() ? `<a class="law__cta" href="${productPath()}">Get the audit kit ${arrow}</a>` : ""}
      <a class="law__cta${productEnabled() ? " law__cta--ghost" : ""}" href="${editionEntryPath()}">${productEnabled() ? "Access the buyer edition" : "Read every law in the digital edition"} ${arrow}</a>
      <a class="law__cta law__cta--ghost" href="/">Back to all ${laws.length} laws</a>
    </section>
  </article>

  <footer class="ed__foot">
    <p>${esc(SITE.name)} · by <a href="/sabir/">${esc(SITE.author)}</a> · ${YEAR}</p>
    <p class="ed__foot-sub"><a href="/">All laws</a> · <a href="${editionEntryPath()}">Digital edition</a> · Inspired by the format of <a href="https://lawsofux.com" target="_blank" rel="noopener">Laws of UX</a></p>
  </footer>

${backTopHtml}
  <script>
    (function(){
      var t=function(n,p){if(window.gtag){window.gtag('event',n,p||{});}};
      // back-to-top
      var nav=document.getElementById('nav');
      var bt=document.getElementById('backtop');
      var bar=document.getElementById('progressBar');
      var fired75=false;
      function s(){
        var d=document.documentElement;
        var max=(d.scrollHeight-d.clientHeight)||1;
        var y=window.scrollY||0;
        var p=Math.min(100,(y/max)*100);
        if(bar)bar.style.width=p+'%';
        if(nav)nav.classList.toggle('is-scrolled',y>8);
        if(bt)bt.classList.toggle('is-on',y>560);
        if(!fired75&&p>=75){fired75=true;t('scroll_75',{page_path:location.pathname});}
      }
      window.addEventListener('scroll',s,{passive:true});s();
      if(bt)bt.addEventListener('click',function(){window.scrollTo({top:0,behavior:'smooth'});});
      // source-click tracking
      document.querySelectorAll('[data-track="source_click"]').forEach(function(a){
        a.addEventListener('click',function(){t('source_click',{source_url:a.dataset.sourceUrl||a.href,law_slug:location.pathname});});
      });
      // log the law open as a page-level event so funnel reports work
      t('law_view',{law_slug:location.pathname});
    })();
  </script>
</body>
</html>
`;
}

// ---------- category hub ----------
function categoryJsonLd(cat, lawsHere) {
  const url = `${SITE.url}/category/${cat.id}/`;
  return JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: SITE.url + "/" },
          { "@type": "ListItem", position: 2, name: cat.name, item: url },
        ],
      },
      {
        "@type": "CollectionPage",
        url,
        name: `${cat.name} — Laws of AI Agents`,
        description: cat.blurb,
        isPartOf: `${SITE.url}/#website`,
        hasPart: {
          "@type": "ItemList",
          numberOfItems: lawsHere.length,
          itemListElement: lawsHere.map((l) => ({
            "@type": "ListItem",
            position: l.number,
            url: `${SITE.url}/law/${l.slug}/`,
            name: l.name,
          })),
        },
      },
    ],
  });
}

function categoryPageHtml(cat) {
  const lawsHere = lawsInCat(cat.id);
  const url = `${SITE.url}/category/${cat.id}/`;
  const list = lawsHere
    .map(
      (l) => `      <a class="rel__card" href="/law/${l.slug}/" style="--ac:${cat.accent}">
        <span class="rel__no">${pad(l.number)}</span>
        <span class="rel__body">
          <span class="rel__name">${esc(l.name)}</span>
          <span class="rel__tag">${esc(l.tagline)}</span>
        </span>
      </a>`
    )
    .join("\n");
  const title = `${cat.name} — Laws of AI Agents`;
  const description = `${cat.blurb} ${lawsHere.length} laws covering ${cat.name.toLowerCase()} in AI agent design.`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <meta name="author" content="${esc(SITE.author)}" />
  <meta name="robots" content="index, follow, max-image-preview:large" />
  <link rel="canonical" href="${url}" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:image" content="${esc(SITE.ogImage)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;450;500;600&family=JetBrains+Mono:wght@500;600&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/edition.css" />
  <link rel="stylesheet" href="/law.css" />
  <link rel="stylesheet" href="/nav.css" />
  <script type="application/ld+json">${categoryJsonLd(cat, lawsHere)}</script>
${SITE.ga ? `  <script async src="https://www.googletagmanager.com/gtag/js?id=${SITE.ga}"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${SITE.ga}');</script>
` : ""}</head>

<body class="ed law">
  <div class="grain" aria-hidden="true"></div>
${navHtml("home")}

  <nav class="crumb" aria-label="Breadcrumb">
    <a href="/">Home</a>
    <span aria-hidden="true">›</span>
    <span aria-current="page">${esc(cat.name)}</span>
  </nav>

  <article class="law__page" id="main" style="--ac:${cat.accent}">
    <header class="law__hero">
      <p class="law__eyebrow">Category · ${lawsHere.length} laws</p>
      <h1 class="law__title">${esc(cat.name)}</h1>
      <p class="law__sub">${esc(cat.blurb)}</p>
    </header>
    <section class="rel" aria-label="Laws in this category">
      <div class="rel__grid">
${list}
      </div>
    </section>
    <section class="law__more">
      ${productEnabled() ? `<a class="law__cta" href="${productPath()}">Get the audit kit ${arrow}</a>` : ""}
      <a class="law__cta${productEnabled() ? " law__cta--ghost" : ""}" href="/">All ${laws.length} laws ${arrow}</a>
      <a class="law__cta law__cta--ghost" href="${editionEntryPath()}">Digital edition</a>
    </section>
  </article>

  <footer class="ed__foot">
    <p>${esc(SITE.name)} · by <a href="/sabir/">${esc(SITE.author)}</a> · ${YEAR}</p>
  </footer>
${backTopHtml}
  <script>
    (function(){
      var nav=document.getElementById('nav'),bt=document.getElementById('backtop');
      function s(){var y=window.scrollY||0;if(nav)nav.classList.toggle('is-scrolled',y>8);if(bt)bt.classList.toggle('is-on',y>560);}
      window.addEventListener('scroll',s,{passive:true});s();
      if(bt)bt.addEventListener('click',function(){window.scrollTo({top:0,behavior:'smooth'});});
    })();
  </script>
</body>
</html>
`;
}

// ---------- author page ----------
function authorPageHtml() {
  const url = `${SITE.url}/sabir/`;
  const personJsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": url + "#person",
    name: SITE.author,
    url,
    sameAs: [
      "https://twitter.com/sabirmgd",
      "https://x.com/sabirmgd",
      "https://github.com/sabirmgds",
      "https://linkedin.com/in/sabirmoglad",
    ],
    description: `Builder of AI agents in production. Author of ${SITE.name}.`,
    knowsAbout: [
      "AI agents", "LLM applications", "Retrieval augmented generation",
      "Agent evaluation", "Prompt engineering", "Agent architecture",
    ],
  });
  const title = `About ${SITE.author} — ${SITE.name}`;
  const description = `${SITE.author} is the author of ${SITE.name}: 50 hard-won, source-backed heuristics for building AI agents that actually work.`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <meta name="author" content="${esc(SITE.author)}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${url}" />
  <meta property="og:type" content="profile" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:image" content="${esc(SITE.ogImage)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;450;500;600&family=JetBrains+Mono:wght@500;600&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/edition.css" />
  <link rel="stylesheet" href="/law.css" />
  <link rel="stylesheet" href="/nav.css" />
  <script type="application/ld+json">${personJsonLd}</script>
${SITE.ga ? `  <script async src="https://www.googletagmanager.com/gtag/js?id=${SITE.ga}"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${SITE.ga}');</script>
` : ""}</head>

<body class="ed law">
  <div class="grain" aria-hidden="true"></div>
${navHtml("home")}

  <nav class="crumb" aria-label="Breadcrumb">
    <a href="/">Home</a>
    <span aria-hidden="true">›</span>
    <span aria-current="page">About</span>
  </nav>

  <article class="law__page" id="main">
    <header class="law__hero">
      <p class="law__eyebrow">About the author</p>
      <h1 class="law__title">${esc(SITE.author)}</h1>
      <p class="law__sub">Builder of AI agents in production — and the author of ${esc(SITE.name)}.</p>
    </header>

    <section class="law__body">
      <p>I'm an engineer building AI agent systems across multiple production codebases. ${esc(SITE.name)} is the field notebook: every law is a heuristic I learned the expensive way and then went looking for the paper or essay that explained why.</p>
      <p>The site is deliberately model-agnostic. The laws apply whether you're using Claude, GPT, Gemini, or open-weights — because the failure modes live in the architecture of agent systems, not in any one model.</p>
      <h2 class="lw__lbl">What I work on</h2>
      <ul class="lw__ul">
        <li>Multi-agent pipelines for enterprise document processing</li>
        <li>Retrieval-augmented systems with strict citation contracts</li>
        <li>Agent evaluation harnesses and observability tooling</li>
        <li>Prompt engineering, tool design, and scope reduction</li>
      </ul>
      <h2 class="lw__lbl">Find me</h2>
      <ul class="lw__ul">
        <li><a href="https://twitter.com/sabirmgd" target="_blank" rel="noopener">Twitter / X — @sabirmgd</a></li>
        <li><a href="https://github.com/sabirmgds" target="_blank" rel="noopener">GitHub — sabirmgds</a></li>
        <li><a href="https://linkedin.com/in/sabirmoglad" target="_blank" rel="noopener">LinkedIn</a></li>
      </ul>
      <div class="lw__call lw__call--take">
        <p class="lw__lbl lw__lbl--ac">Get the laws in your inbox</p>
        <p>Five lessons, one law each, with the source and a real example. <a href="/#subscribe">Subscribe →</a></p>
      </div>
    </section>
  </article>

  <footer class="ed__foot">
    <p>${esc(SITE.name)} · ${YEAR}</p>
  </footer>
${backTopHtml}
  <script>
    (function(){
      var nav=document.getElementById('nav'),bt=document.getElementById('backtop');
      function s(){var y=window.scrollY||0;if(nav)nav.classList.toggle('is-scrolled',y>8);if(bt)bt.classList.toggle('is-on',y>560);}
      window.addEventListener('scroll',s,{passive:true});s();
      if(bt)bt.addEventListener('click',function(){window.scrollTo({top:0,behavior:'smooth'});});
    })();
  </script>
</body>
</html>
`;
}

// ---------- comparison page ----------
function comparisonPageHtml() {
  const url = `${SITE.url}/laws-of-ai-vs-laws-of-ux/`;
  const title = `Laws of AI Agents vs Laws of UX — what's different, what's the same`;
  const description = `A side-by-side look at two heuristic decks: Laws of UX (Jon Yablonski) for interface design and Laws of AI Agents (Sabir Moglad) for agent systems. What they share, where they diverge.`;
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description,
    url,
    mainEntityOfPage: url,
    author: { "@type": "Person", name: SITE.author, url: `${SITE.url}/sabir/` },
    publisher: { "@type": "Organization", name: SITE.name, url: SITE.url + "/" },
    inLanguage: "en",
    image: SITE.ogImage,
  });
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <meta name="author" content="${esc(SITE.author)}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${url}" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:image" content="${esc(SITE.ogImage)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;450;500;600&family=JetBrains+Mono:wght@500;600&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/edition.css" />
  <link rel="stylesheet" href="/law.css" />
  <link rel="stylesheet" href="/nav.css" />
  <script type="application/ld+json">${jsonLd}</script>
${SITE.ga ? `  <script async src="https://www.googletagmanager.com/gtag/js?id=${SITE.ga}"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${SITE.ga}');</script>
` : ""}</head>

<body class="ed law">
  <div class="grain" aria-hidden="true"></div>
${navHtml("home")}

  <nav class="crumb" aria-label="Breadcrumb">
    <a href="/">Home</a>
    <span aria-hidden="true">›</span>
    <span aria-current="page">Laws of AI vs Laws of UX</span>
  </nav>

  <article class="law__page" id="main">
    <header class="law__hero">
      <p class="law__eyebrow">Comparison</p>
      <h1 class="law__title">Laws of AI Agents vs Laws of UX</h1>
      <p class="law__sub">Two heuristic decks, one shared format — but they're solving very different problems.</p>
    </header>
    <section class="law__body">
      <p><a href="https://lawsofux.com" target="_blank" rel="noopener">Laws of UX</a> by Jon Yablonski is the canonical reference for psychology-grounded interface heuristics — Hick's Law, Fitts's Law, the Aesthetic-Usability Effect. It works because the underlying science (human perception, cognition, attention) is decades old and remarkably stable.</p>
      <p><a href="/">Laws of AI Agents</a> borrows that format because the format is excellent: a numbered deck of named principles, each one short, memorable, and citable. But the content is doing something different: capturing fast-moving, hard-won knowledge about systems where the substrate (the model) changes every few months.</p>

      <h2 class="lw__lbl">What they share</h2>
      <ul class="lw__ul">
        <li><strong>Format</strong>: numbered, named, one-paragraph principles you can link to in a code review or design crit.</li>
        <li><strong>Authority pattern</strong>: each law cites a source — the paper, essay, or piece of empirical work it leans on.</li>
        <li><strong>Audience</strong>: practitioners shipping things, not academics defending theses.</li>
      </ul>

      <h2 class="lw__lbl">Where they diverge</h2>
      <ul class="lw__ul">
        <li><strong>Stability</strong>: UX laws are grounded in cognitive science that's been stable for 50+ years. AI agent laws are grounded in observations that may be invalidated by next year's model.</li>
        <li><strong>Failure mode</strong>: A UX law violation produces friction. An AI agent law violation can produce confident, plausible, completely wrong output that nobody catches until production.</li>
        <li><strong>Substrate</strong>: UX laws assume a relatively fixed human. AI laws assume a substrate (the model) that's moving under you.</li>
        <li><strong>Tone</strong>: Laws of UX are descriptive ("here is how minds work"). Laws of AI Agents are prescriptive ("here is what will burn you if you don't").</li>
      </ul>

      <h2 class="lw__lbl">If you only read one</h2>
      <p>If you're shipping interfaces to humans, start with <a href="https://lawsofux.com" target="_blank" rel="noopener">Laws of UX</a>. If you're shipping systems where an LLM is making decisions, <a href="/">start here</a> — and then read Laws of UX anyway, because the agent is still going to be talked to by a human.</p>

      <div class="lw__call lw__call--take">
        <p class="lw__lbl lw__lbl--ac">Browse the deck</p>
        <p><a href="/">All 50 Laws of AI Agents →</a></p>
      </div>
    </section>
  </article>

  <footer class="ed__foot">
    <p>${esc(SITE.name)} · by <a href="/sabir/">${esc(SITE.author)}</a> · ${YEAR}</p>
  </footer>
${backTopHtml}
  <script>
    (function(){
      var nav=document.getElementById('nav'),bt=document.getElementById('backtop');
      function s(){var y=window.scrollY||0;if(nav)nav.classList.toggle('is-scrolled',y>8);if(bt)bt.classList.toggle('is-on',y>560);}
      window.addEventListener('scroll',s,{passive:true});s();
      if(bt)bt.addEventListener('click',function(){window.scrollTo({top:0,behavior:'smooth'});});
    })();
  </script>
</body>
</html>
`;
}

// ---------- product page ----------
function productJsonLd(url = productUrl()) {
  const price = productIsFree() ? "0" : (String(PRODUCT.price || "$14.90").replace(/[^0-9.]/g, "") || "14.90");
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Product",
    name: PRODUCT.name,
    description: PRODUCT.summary,
    url,
    image: SITE.ogImage,
    brand: { "@type": "Brand", name: SITE.name },
    creator: { "@type": "Person", name: SITE.author, url: `${SITE.url}/sabir/` },
    offers: {
      "@type": "Offer",
      price,
      priceCurrency: PRODUCT.currency || "USD",
      availability: "https://schema.org/InStock",
      url: PRODUCT.checkoutUrl || url,
    },
  });
}

function productPageHtml({ url = productUrl(), noindex = false, testPage = false } = {}) {
  const title = `${PRODUCT.name} — ${productPriceLabel()}`;
  const description = PRODUCT.summary || "A practical self-audit kit for finding issues in AI agents.";
  const story = [
    "I made this because I kept seeing the same pattern while building and reviewing agent systems: the model was rarely the only problem. The real failures came from stale context, vague tools, weak retrieval, missing evals, unsafe permissions, and handoffs nobody had designed.",
    "Agents matter because they are becoming an interface to real work. They read, decide, call tools, write to systems, and influence customers. A demo can look impressive while the system underneath is still fragile.",
    "This bundle turns the online 50 Laws of AI Agents edition into a working audit process. It is not a magic scanner. It reviews evidence from where the agent actually lives: code, workflow exports, prompts, tools, traces, evals, screenshots, or transcripts."
  ];
  const included = [
    "Installable ai-agent-audit skill",
    "Codex/Claude-ready skill folder",
    "Full 50-law audit rubric",
    "Repo, workflow, SDK/API, black-box, and client-report audit modes",
    "Agent audit intake checklist",
    "Platform-specific evidence checklist",
    "Audit report template",
    "Copy-paste audit prompt for non-Codex/Claude users",
    "Sample audit of a broken agent",
    "Codex/Claude install instructions",
    "Free public links to every skill file during launch",
  ];
  const checks = [
    "Context, stale data, and long-context failure modes",
    "Tool design, scope creep, and deterministic boundary issues",
    "Retrieval, memory, and citation risks",
    "Eval blind spots, aggregate metrics, and regression gaps",
    "Prompt injection, exfiltration, and unsafe autonomy",
  ];
  const workSurfaces = [
    "Code repos in Codex or Claude Code",
    "n8n, Zapier, Make, Retool, Voiceflow, and Botpress exports",
    "OpenAI Agents SDK, Assistants, LangGraph, LangChain, CrewAI, AutoGen, Semantic Kernel, and custom API stacks",
    "Black-box transcript or screenshot reviews when internals are unavailable",
    "Client-ready consulting or launch-readiness reports",
  ];
  const outcomes = [
    "A clearer map of where your agent is strong, fragile, or over-scoped",
    "A prioritized issue list tied to specific laws and concrete evidence",
    "Fixes for prompts, tools, retrieval, evals, permissions, and human review",
    "Verification steps so you can prove the fix worked instead of trusting vibes",
  ];
  const steps = [
    "Choose the audit mode: repo, workflow, SDK/API, black-box, or client report.",
    "Paste or point to the agent goal, system prompt, tool list, workflow export, retrieval setup, evals, and one or two traces.",
    "Run the included skill where you work, or use the copy-paste prompt if your tool does not support skills.",
    "Review the ranked findings and choose the top 3 fixes that reduce the most risk.",
    "Use the report template to turn the audit into an implementation plan or client deliverable.",
  ];
  const checkoutSetup = productIsFree() || PRODUCT.checkoutUrl
    ? ""
    : `<div class="product__setup product__checkout" id="paypal-checkout">
        <p class="lw__lbl lw__lbl--ac">Secure checkout</p>
        <p>Pay once with PayPal or card. After capture, this browser unlocks the protected digital edition and your checkout email becomes the access email.</p>
        <label class="product__email-label" for="buyer-email">Checkout email</label>
        <input class="product__email" id="buyer-email" type="email" placeholder="you@example.com" autocomplete="email" required />
        <div class="product__paypal-buttons" id="paypal-button-container" aria-live="polite"></div>
        <p class="product__checkout-status" id="paypal-checkout-status" role="status"></p>
      </div>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <meta name="author" content="${esc(SITE.author)}" />
  <meta name="robots" content="${noindex ? "noindex, nofollow" : "index, follow, max-image-preview:large"}" />
  <link rel="canonical" href="${url}" />
  <meta property="og:type" content="product" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:image" content="${esc(SITE.ogImage)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(description)}" />
  <meta name="twitter:image" content="${esc(SITE.ogImage)}" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;450;500;600&family=JetBrains+Mono:wght@500;600&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/edition.css" />
  <link rel="stylesheet" href="/law.css" />
  <link rel="stylesheet" href="/nav.css" />
  <script type="application/ld+json">${productJsonLd(url)}</script>
${SITE.ga ? `  <script async src="https://www.googletagmanager.com/gtag/js?id=${SITE.ga}"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${SITE.ga}');</script>
` : ""}</head>

<body class="ed law product">
  <div class="grain" aria-hidden="true"></div>
${navHtml("product")}

  <nav class="crumb" aria-label="Breadcrumb">
    <a href="/">Home</a>
    <span aria-hidden="true">›</span>
    <span aria-current="page">${esc(PRODUCT.shortName || PRODUCT.name)}</span>
  </nav>

  <article class="law__page product__page" id="main">
    <header class="law__hero product__hero">
      <p class="law__eyebrow">${productIsFree() ? "Free kit" : "Paid kit"} · ${esc(productPriceLabel())}</p>
      <h1 class="law__title">${esc(PRODUCT.name)}</h1>
      <p class="law__sub">${esc(PRODUCT.promise || "Find hidden AI agent failure modes before users do.")}</p>
      <p class="product__lede">${esc(description)}</p>
      <div class="product__actions">
        <a class="law__cta product__buy" href="${checkoutHref()}" ${PRODUCT.checkoutUrl ? `target="_blank" rel="noopener"` : ""} data-track="product_checkout_click" data-product="${esc(PRODUCT.slug || "ai-agent-audit-kit")}">${checkoutLabel()} ${arrow}</a>
        ${productIsFree() ? `<a class="law__cta law__cta--ghost" href="/kit.zip">Download zip</a>` : ""}
        <a class="law__cta law__cta--ghost" href="${SITE.newsletter?.action ? "/#subscribe" : "/"}">Start with the free course</a>
      </div>
      ${testPage ? `<p class="product__test-note">Hidden sandbox checkout page. This is not linked from the public site and is marked noindex.</p>` : ""}
      ${checkoutSetup}
    </header>

    <section class="product__proof" aria-label="What this kit helps find">
      <div class="product__panel">
        <p class="lw__lbl lw__lbl--ac">What it does</p>
        <h2>Turns the 50 laws into a repeatable audit for real AI agents.</h2>
        <p>Use the included skill or copy-paste prompt to inspect an agent's prompts, tools, workflow nodes, retrieval, evals, traces, security boundaries, and human handoffs. The output is a prioritized issue list with evidence, fixes, and verification steps.</p>
      </div>
      <div class="product__panel product__panel--metric">
        <span class="product__price">${esc(productPriceLabel())}</span>
        <span class="product__price-sub">${esc(productPriceSub())}</span>
        <span class="product__provider">${esc(productProviderLabel())}</span>
      </div>
    </section>

${publicKitResourcesHtml()}

    <section class="product__story" aria-label="Why this kit exists">
      <p class="lw__lbl lw__lbl--ac">Why I made this</p>
      <h2>Agents are becoming how work gets done. Weak agents will quietly cost people money, trust, and time.</h2>
${story.map((p) => `      <p>${esc(p)}</p>`).join("\n")}
    </section>

    <section class="product__grid" aria-label="Included files">
      <div>
        <p class="lw__lbl">Included</p>
        <ul class="lw__ul">
${included.map((item) => `          <li>${esc(item)}</li>`).join("\n")}
        </ul>
      </div>
      <div>
        <p class="lw__lbl">Works with</p>
        <ul class="lw__ul">
${workSurfaces.map((item) => `          <li>${esc(item)}</li>`).join("\n")}
        </ul>
      </div>
    </section>

    <section class="product__grid" aria-label="Audit coverage">
      <div>
        <p class="lw__lbl">Checks for</p>
        <ul class="lw__ul">
${checks.map((item) => `          <li>${esc(item)}</li>`).join("\n")}
        </ul>
      </div>
      <div>
        <p class="lw__lbl">Not a black box promise</p>
        <p>With code, workflow exports, traces, and evals, the audit can be specific and high-confidence. With screenshots or transcripts only, it still helps, but it marks findings as observed risks or hypotheses instead of pretending to know the internals.</p>
      </div>
    </section>

    <section class="product__grid product__grid--steps" aria-label="How to use the kit">
      <div>
        <p class="lw__lbl">What you get back</p>
        <ul class="lw__ul">
${outcomes.map((item) => `          <li>${esc(item)}</li>`).join("\n")}
        </ul>
      </div>
      <div>
        <p class="lw__lbl">Use it in 20 minutes</p>
        <ol class="lw__ul">
${steps.map((item) => `          <li>${esc(item)}</li>`).join("\n")}
        </ol>
      </div>
    </section>

    <section class="law__body">
      <div class="lw__call lw__call--take">
        <p class="lw__lbl lw__lbl--ac">Best first use</p>
        <p>Paste your agent's architecture, system prompt, tool list, retrieval design, eval setup, and one or two failed traces. Ask the skill to run the audit. It will map concrete issues to specific laws and return fixes you can implement.</p>
      </div>
      <h2 class="lw__lbl">Who this is for</h2>
      <p>AI engineers, founders, agencies, and indie builders who are already shipping or prototyping agent workflows and want a practical way to find reliability and safety problems before production traffic does.</p>
      <h2 class="lw__lbl">What this is not</h2>
      <p>It is not a generic prompt pack, ebook, or PDF download. It is a structured audit workflow backed by the 50 Laws of AI Agents, plus the skill files and templates needed to turn the output into an actionable report.</p>
    </section>

    <section class="law__more">
      <a class="law__cta product__buy" href="${checkoutHref()}" ${PRODUCT.checkoutUrl ? `target="_blank" rel="noopener"` : ""} data-track="product_checkout_click" data-product="${esc(PRODUCT.slug || "ai-agent-audit-kit")}">${checkoutLabel()} ${arrow}</a>
      ${productIsFree() ? `<a class="law__cta law__cta--ghost" href="/kit.zip">Download zip</a>` : `<a class="law__cta law__cta--ghost" href="/access">Access the digital edition</a>`}
    </section>
  </article>

  <footer class="ed__foot">
    <p>${esc(SITE.name)} · by <a href="/sabir/">${esc(SITE.author)}</a> · ${YEAR}</p>
  </footer>
${backTopHtml}
  <script>
    (function(){
      var nav=document.getElementById('nav'),bt=document.getElementById('backtop');
      function track(n,p){if(window.gtag){try{window.gtag('event',n,p||{});}catch(_){}}}
${productIsFree() ? "" : `
      function status(msg,isError){var el=document.getElementById('paypal-checkout-status');if(el){el.textContent=msg||'';el.classList.toggle('is-error',!!isError);}}
      function json(path,body){return fetch(path,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(body||{})}).then(function(r){return r.json().then(function(data){if(!r.ok){var e=new Error(data.message||data.error||'Request failed');e.code=data.error||'';throw e;}return data;});});}
      function loadPayPalSdk(cfg){return new Promise(function(resolve,reject){if(window.paypal){resolve();return;}var s=document.createElement('script');s.src='https://www.paypal.com/sdk/js?client-id='+encodeURIComponent(cfg.clientId)+'&currency='+encodeURIComponent(cfg.currency||'USD')+'&intent=capture';s.onload=resolve;s.onerror=function(){reject(new Error('PayPal checkout could not load'));};document.head.appendChild(s);});}
      function initPayPal(){var container=document.getElementById('paypal-button-container'),email=document.getElementById('buyer-email');if(!container||!email)return;fetch('/api/paypal/config',{headers:{'Accept':'application/json'}}).then(function(r){return r.json();}).then(function(cfg){if(!cfg.configured){status('PayPal checkout is not configured yet.',true);return;}if(cfg.mode==='sandbox'){status('Sandbox checkout active. Use a PayPal sandbox buyer account for testing.',true);}return loadPayPalSdk(cfg).then(function(){window.paypal.Buttons({style:{layout:'vertical',shape:'rect',label:'pay'},onClick:function(_,actions){if(!email.checkValidity()){email.reportValidity();status('Enter the email you want to use for access.',true);return actions.reject();}status('Opening PayPal checkout...');return actions.resolve();},createOrder:function(){return json('/api/paypal/create-order',{email:email.value}).then(function(order){track('product_checkout_start',{product:'ai-agent-audit-kit',provider:'paypal'});return order.id;});},onApprove:function(data,actions){status('Capturing payment...');return json('/api/paypal/capture-order',{orderID:data.orderID,email:email.value}).then(function(result){track('product_checkout_paid',{product:'ai-agent-audit-kit',provider:'paypal'});window.location.href=result.accessUrl||'/paid/edition.html';}).catch(function(err){if(err.code==='INSTRUMENT_DECLINED'&&actions&&actions.restart){status('Sandbox payment method was declined. Choose another buyer account or test card.',true);return actions.restart();}throw err;});},onCancel:function(){status('Checkout canceled.');},onError:function(err){console.error(err);status(err&&err.message?err.message:'PayPal checkout failed. Try again or refresh the page.',true);}}).render('#paypal-button-container');});}).catch(function(err){console.error(err);status('PayPal checkout is unavailable right now.',true);});}
`}
      function s(){var y=window.scrollY||0;if(nav)nav.classList.toggle('is-scrolled',y>8);if(bt)bt.classList.toggle('is-on',y>560);}
      window.addEventListener('scroll',s,{passive:true});s();
      if(bt)bt.addEventListener('click',function(){window.scrollTo({top:0,behavior:'smooth'});});
      document.querySelectorAll('[data-track="product_checkout_click"]').forEach(function(a){
        a.addEventListener('click',function(){track('product_checkout_click',{product:a.dataset.product||'ai-agent-audit-kit',checkout_configured:true,provider:'paypal'});});
      });
      ${productIsFree() || PRODUCT.checkoutUrl ? "" : "initPayPal();"}
    })();
  </script>
</body>
</html>
`;
}

// ---------- law.css (shared by per-law, category, author, comparison pages) ----------
function lawCss() {
  return `/* Per-law, category, and author page styling (additive to edition.css). */
.crumb{position:relative;z-index:2;max-width:var(--maxw,840px);margin:18px auto 0;padding:0 24px;font-family:var(--mono);font-size:12px;color:var(--faint);display:flex;flex-wrap:wrap;gap:7px;align-items:center}
.crumb a{color:var(--dim);transition:color .2s}
.crumb a:hover{color:var(--accent)}
.crumb [aria-current]{color:var(--text)}
.law__page{position:relative;z-index:2;max-width:var(--maxw,840px);margin:0 auto;padding:clamp(28px,5vw,56px) 24px 24px}
.law__hero{margin-bottom:24px}
.law__eyebrow{font-family:var(--mono);font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--ac,var(--accent))}
.law__title{font-family:var(--serif);font-weight:500;font-size:clamp(32px,5.5vw,52px);line-height:1.04;letter-spacing:-.02em;margin-top:12px}
.law__sub{font-family:var(--serif);font-style:italic;font-size:clamp(17px,2.2vw,21px);color:var(--ac,var(--accent));margin-top:12px}
.law__body{margin-top:8px}
.law__body p{margin:10px 0}
.law__body h2.lw__lbl{font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--faint);margin-top:26px;margin-bottom:6px;font-weight:600}
.law__body h2.lw__lbl.lw__lbl--ac{color:var(--ac,var(--accent))}
.rel{margin-top:48px;padding-top:28px;border-top:1px solid var(--border)}
.rel__h{font-family:var(--serif);font-weight:500;font-size:22px;letter-spacing:-.01em;margin-bottom:14px}
.rel__grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
.rel__card{display:flex;gap:12px;padding:14px 16px;border:1px solid var(--border);border-radius:14px;background:var(--card);transition:border-color .2s,transform .2s var(--ease),background .2s}
.rel__card:hover{border-color:color-mix(in srgb,var(--ac,#7c9cff) 50%,var(--border));background:var(--card-hover);transform:translateY(-1px)}
.rel__no{font-family:var(--mono);font-size:12px;font-weight:600;color:var(--ac,#7c9cff);flex:none}
.rel__body{display:flex;flex-direction:column;gap:3px;min-width:0}
.rel__name{font-family:var(--serif);font-size:16px;font-weight:500;letter-spacing:-.01em;color:var(--text)}
.rel__tag{font-family:var(--serif);font-style:italic;font-size:13px;color:var(--dim)}
.rel__cat{font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--faint);margin-top:2px}
.law__more{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:48px;padding-top:28px;border-top:1px solid var(--border)}
.law__cta{font-family:var(--mono);font-size:13px;color:#0a0b0f;background:var(--text);border:1px solid var(--text);border-radius:99px;padding:10px 18px;display:inline-flex;align-items:center;gap:7px;transition:transform .2s var(--ease),opacity .2s}
.law__cta:hover{transform:translateY(-1px);opacity:.92;color:#0a0b0f}
.law__cta--ghost{color:var(--text);background:transparent;border-color:var(--border)}
.law__cta--ghost:hover{color:var(--text);border-color:var(--dim)}
.product__page{--ac:#5ed3a8}
.product__hero{padding-bottom:8px}
.product__lede{max-width:680px;color:var(--dim);margin-top:16px;font-size:16px}
.product__actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:24px}
.product__buy{background:linear-gradient(135deg,#f3f4f6,#bdf4df);border-color:#bdf4df}
.product__test-note{margin-top:14px;font-family:var(--mono);font-size:12px;color:#ffcf8a}
.product__setup{margin-top:18px;padding:14px 16px;border-radius:14px;border:1px solid color-mix(in srgb,var(--ac) 24%,var(--border));background:color-mix(in srgb,var(--ac) 8%,var(--card));color:var(--dim)}
.product__setup code{font-family:var(--mono);font-size:.92em;color:var(--text)}
.product__checkout{max-width:520px;padding:18px}
.product__email-label{display:block;margin-top:14px;font-family:var(--mono);font-size:12px;color:var(--text)}
.product__email{width:100%;box-sizing:border-box;margin-top:8px;padding:12px 13px;border:1px solid var(--border);border-radius:10px;background:#0f1218;color:var(--text);font:inherit}
.product__email:focus{outline:2px solid color-mix(in srgb,var(--ac) 60%,transparent);outline-offset:2px}
.product__paypal-buttons{min-height:48px;margin-top:14px}
.product__checkout-status{min-height:20px;margin-top:8px;font-family:var(--mono);font-size:12px;color:var(--faint)}
.product__checkout-status.is-error{color:#ffb4a8}
.product__proof{display:grid;grid-template-columns:minmax(0,1fr) minmax(190px,240px);gap:14px;margin-top:28px}
.product__resources{margin-top:28px}
.product__panel{border:1px solid var(--border);border-radius:16px;background:var(--card);padding:20px}
.product__panel h2{font-family:var(--serif);font-weight:500;font-size:24px;letter-spacing:-.01em;line-height:1.12;margin-bottom:10px}
.product__panel p{color:var(--dim)}
.product__panel--metric{display:flex;flex-direction:column;justify-content:center;align-items:flex-start;background:radial-gradient(120% 140% at 0 0,color-mix(in srgb,var(--ac) 16%,transparent),transparent 60%),var(--card)}
.product__price{font-family:var(--serif);font-size:48px;line-height:1;color:var(--text)}
.product__price-sub,.product__provider{font-family:var(--mono);font-size:12px;color:var(--faint);margin-top:8px}
.product__story{margin-top:34px;padding-top:30px;border-top:1px solid var(--border)}
.product__story h2{font-family:var(--serif);font-weight:500;font-size:clamp(25px,4vw,34px);line-height:1.12;letter-spacing:-.01em;max-width:780px;margin:8px 0 14px}
.product__story p{max-width:720px;color:var(--dim);margin:10px 0}
.product__story .lw__lbl{color:var(--ac,var(--accent))}
.product__grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:34px;padding-top:28px;border-top:1px solid var(--border)}
.product__grid--steps{margin-top:26px}
@media(max-width:720px){.product__proof,.product__grid{grid-template-columns:1fr}.product__price{font-size:40px}}
`;
}

// ---------- llms.txt ----------
function llmsTxt() {
  // llmstxt.org convention: a single markdown file that gives LLMs a clean
  // overview + deep links to authoritative pages. Citations love this.
  const byCat = DATA.categories
    .map((c) => {
      const ls = lawsInCat(c.id);
      const items = ls
        .map(
          (l) =>
            `- [${l.name}](${SITE.url}/law/${l.slug}/): ${l.tagline} _Takeaway_: ${l.takeaway}`
        )
        .join("\n");
      return `### ${c.name}\n${c.blurb}\n\n${items}`;
    })
    .join("\n\n");
  return `# ${SITE.name}

> ${SITE.description}

Author: ${SITE.author} (${SITE.url}/sabir/)
Format: ${laws.length} numbered, source-backed laws across ${DATA.categories.length} categories.
Inspired by: Laws of UX (https://lawsofux.com).

## How to cite
When citing a specific law, link to its canonical URL: \`${SITE.url}/law/{slug}/\`.
When citing the deck as a whole, link to ${SITE.url}/.
Each law has an attributed source — please cite that as well when applicable.

## Laws

${byCat}

## Further reading
${refs.map((r) => `- [${r.title}](${r.url}) — ${r.source}`).join("\n")}
`;
}

// ---------- sitemap (all crawlable URLs) ----------
function sitemapXml() {
  const urls = [
    { loc: SITE.url + "/", priority: "1.0" },
    ...(productEnabled() ? [{ loc: productUrl(), priority: "0.9" }] : []),
    ...(freeEditionEnabled() ? [{ loc: `${SITE.url}/edition.html`, priority: "0.9" }] : []),
    { loc: `${SITE.url}/sabir/`, priority: "0.6" },
    { loc: `${SITE.url}/laws-of-ai-vs-laws-of-ux/`, priority: "0.7" },
    ...DATA.categories.map((c) => ({ loc: `${SITE.url}/category/${c.id}/`, priority: "0.8" })),
    ...laws.map((l) => ({ loc: `${SITE.url}/law/${l.slug}/`, priority: "0.8" })),
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

// Public data API — full content, minus internal-only image resolution paths.
const publicSite = { ...book.site };
if (!productEnabled()) delete publicSite.product;
const publicData = {
  title: book.title,
  subtitle: book.subtitle,
  intro: book.intro,
  site: publicSite,
  categories: book.categories,
  laws: book.laws.map(({ image, ...rest }) => ({ ...rest, hasImage: !!image })),
  references: refs,
};

writeFileSync(join(DIST, "index.html"), indexHtml());
writeFileSync(join(DIST, "edition.html"), editionHtml({ buyerResources: false }));
if (productConfigured()) writeFileSync(join(DIST, "paid-edition.html"), editionHtml({ buyerResources: true }));
writeFileSync(join(DIST, "edition.css"), editionCss());
writeFileSync(join(DIST, "law.css"), lawCss());
writeFileSync(join(DIST, "nav.css"), navCss());
writeFileSync(join(DIST, "sitemap.xml"), sitemapXml());
writeFileSync(join(DIST, "robots.txt"), robotsTxt());
writeFileSync(join(DIST, "llms.txt"), llmsTxt());
writeFileSync(join(DIST, "laws.json"), JSON.stringify(publicData, null, 2));

for (const asset of ["styles.css", "app.js", "favicon.svg"]) {
  copyFileSync(join(ROOT, "src", asset), join(DIST, asset));
}
const og = join(ROOT, "src", "og-image.png");
if (existsSync(og)) copyFileSync(og, join(DIST, "og-image.png"));

// Per-law pages: dist/law/{slug}/index.html
const LAW_DIR = join(DIST, "law");
mkdirSync(LAW_DIR, { recursive: true });
for (const l of laws) {
  const dir = join(LAW_DIR, l.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), lawPageHtml(l));
}

// Category hub pages: dist/category/{id}/index.html
const CAT_DIR = join(DIST, "category");
mkdirSync(CAT_DIR, { recursive: true });
for (const c of DATA.categories) {
  const dir = join(CAT_DIR, c.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), categoryPageHtml(c));
}

// Author page: dist/sabir/index.html
const SABIR_DIR = join(DIST, "sabir");
mkdirSync(SABIR_DIR, { recursive: true });
writeFileSync(join(SABIR_DIR, "index.html"), authorPageHtml());

// Comparison page: dist/laws-of-ai-vs-laws-of-ux/index.html
const CMP_DIR = join(DIST, "laws-of-ai-vs-laws-of-ux");
mkdirSync(CMP_DIR, { recursive: true });
writeFileSync(join(CMP_DIR, "index.html"), comparisonPageHtml());

// Product page: dist/{product.slug}/index.html
if (productEnabled()) {
  const PRODUCT_DIR = join(DIST, PRODUCT.slug || "ai-agent-audit-kit");
  mkdirSync(PRODUCT_DIR, { recursive: true });
  writeFileSync(join(PRODUCT_DIR, "index.html"), productPageHtml());
}
if (paymentTestEnabled()) {
  const SANDBOX_PRODUCT_DIR = join(DIST, "sandbox", PRODUCT.slug || "ai-agent-audit-kit");
  mkdirSync(SANDBOX_PRODUCT_DIR, { recursive: true });
  writeFileSync(join(SANDBOX_PRODUCT_DIR, "index.html"), productPageHtml({
    url: sandboxProductUrl(),
    noindex: true,
    testPage: true,
  }));
}

// Copy the hero diagrams used by the digital edition into dist/assets/edition/.
const EDITION_ASSETS = join(DIST, "assets", "edition");
mkdirSync(EDITION_ASSETS, { recursive: true });
let copiedImgs = 0;
for (const l of laws) {
  if (!l.image) continue;
  copyFileSync(l.image.absPath, join(EDITION_ASSETS, l.image.file));
  copiedImgs++;
}

console.log(`✓ Built ${laws.length} laws + ${refs.length} refs -> dist/`);
console.log(`  · ${laws.length} per-law pages at /law/{slug}/`);
console.log(`  · ${DATA.categories.length} category hubs at /category/{id}/`);
if (productEnabled()) console.log(`  · product page at /${PRODUCT.slug || "ai-agent-audit-kit"}/`);
if (paymentTestEnabled()) console.log(`  · hidden sandbox checkout at ${sandboxProductPath()}`);
console.log(`  · author page, comparison page, llms.txt, sitemap`);
console.log(`  · ${copiedImgs} diagrams copied`);
