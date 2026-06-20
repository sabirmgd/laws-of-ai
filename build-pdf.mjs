#!/usr/bin/env node
/**
 * Builds the expanded paid PDF for Laws of AI Agents.
 * Reads data/laws.json + data/examples.json, emits pdf/laws-of-ai.html
 * (dark cover, clean light interior). Render to PDF with headless Chrome.
 *
 * No em dashes in output: principle/takeaway/tagline text is de-em-dashed.
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadBook } from "./lib/content.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUTDIR = join(ROOT, "pdf");

// Single source of truth — shared with the website build (build.mjs).
const book = loadBook();
const cats = book.categories;
const catById = book.catById;
const SITE = book.site;

const esc = (s = "") => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const noEm = (s = "") => String(s).replace(/\s*—\s*/g, ", ");
const txt = (s = "") => esc(noEm(s));
const pad = (n) => String(n).padStart(2, "0");

const ICON = {
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
const icon = (id, cls = "") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICON[id] || ""}</svg>`;

const lawsByCat = (id) => book.laws.filter((l) => l.category === id);

function lawBlock(l) {
  const c = catById[l.category];
  const signals = l.signals.map((s) => `<li>${txt(s)}</li>`).join("");
  const apply = l.apply.map((s) => `<li>${txt(s)}</li>`).join("");
  const sourcesHtml = l.sources
    .map((s) => `<li><a href="${esc(s.url)}">${txt(s.title)}${s.author ? " · " + txt(s.author) : ""}</a></li>`)
    .join("");
  const heroFile = l.image
    ? (l.image.variant === "explain" ? `assets/explain/${l.image.file}` : `assets/${l.image.file}`)
    : "";
  const hero = heroFile ? `<figure class="law__hero"><img src="${heroFile}" alt="" /></figure>` : "";
  return `<article class="law" style="--ac:${c.accent}">
    <div class="law__head">
      <span class="law__no">${pad(l.number)}</span>
      <span class="law__tag">${esc(c.name)}</span>
    </div>
    <h3 class="law__name">${txt(l.name)}</h3>
    <p class="law__tagline">${txt(l.tagline)}</p>
    ${hero}
    <div class="law__body">
      <p class="lbl">The principle</p>
      <p class="bd">${txt(l.principle)}</p>
      ${l.depth ? `<p class="lbl">Why it happens</p><p class="bd">${txt(l.depth)}</p>` : ""}
      ${signals ? `<p class="lbl">Watch for</p><ul class="ul">${signals}</ul>` : ""}
      <div class="practice">
        <p class="lbl lbl--ac">In practice</p>
        <p class="bd">${txt(l.example)}</p>
      </div>
      ${apply ? `<p class="lbl lbl--ac">Apply it</p><ol class="ol">${apply}</ol>` : ""}
      <div class="takeaway">
        <p class="lbl lbl--ac">The takeaway</p>
        <p class="bd">${txt(l.takeaway)}</p>
      </div>
      ${sourcesHtml ? `<p class="lbl">Sources and further reading</p><ul class="srcs">${sourcesHtml}</ul>` : ""}
    </div>
  </article>`;
}

function sectionDivider(c, i) {
  const range = lawsByCat(c.id).map((l) => l.number);
  return `<section class="divider" style="--ac:${c.accent}">
    <span class="divider__ic">${icon(c.icon, "dic")}</span>
    <p class="divider__part">Part ${i + 1}</p>
    <h2 class="divider__name">${esc(c.name)}</h2>
    <p class="divider__blurb">${esc(c.blurb)}</p>
    <p class="divider__range">Laws ${pad(range[0])} to ${pad(range[range.length - 1])}</p>
  </section>`;
}

const tocRows = cats
  .map((c, i) => {
    const ls = lawsByCat(c.id);
    return `<div class="toc__row" style="--ac:${c.accent}">
      <span class="toc__ic">${icon(c.icon, "tic")}</span>
      <span class="toc__name">${esc(c.name)}</span>
      <span class="toc__range">${pad(ls[0].number)} - ${pad(ls[ls.length - 1].number)}</span>
    </div>`;
  })
  .join("\n");

const refsRows = book.refs
  .map((r, i) => `<li><span class="rn">${pad(i + 1)}</span><span><strong>${txt(r.title)}</strong> · ${txt(r.source)}<br/><a href="${esc(r.url)}">${esc(r.url)}</a><br/><em>${txt(r.note)}</em></span></li>`)
  .join("\n");

const dots = '<span class="dot" style="background:#7c9cff"></span><span class="dot" style="background:#c98cff"></span><span class="dot" style="background:#f5817a"></span><span class="dot" style="background:#f59e6b"></span><span class="dot" style="background:#a3d65c"></span><span class="dot" style="background:#4fd1c5"></span>';

const html = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;450;500;600&family=JetBrains+Mono:wght@500;600&display=swap" rel="stylesheet" />
<style>
  * { margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  @page { size: A4; margin: 16mm 15mm; }
  :root { --serif:"Fraunces",Georgia,serif; --sans:"Inter",system-ui,sans-serif; --mono:"JetBrains Mono",monospace;
    --ink:#1a1c22; --muted:#5b6170; --line:#e7e8ec; --bg:#fbfbf9; }
  html { font-family:var(--sans); color:#1a1c22; background:#fbfbf9; font-size:10.4pt; line-height:1.5; }
  a { color:inherit; text-decoration:none; }
  svg { width:1em; height:1em; }

  /* COVER */
  .cover { background:#0b0c10; color:#f3f4f6; height:265mm; margin:-16mm -15mm 0; padding:34mm 22mm; position:relative; page-break-after:always; overflow:hidden; }
  .cover::before { content:""; position:absolute; inset:0; background:
    radial-gradient(60% 45% at 10% 0%, rgba(124,156,255,0.22), transparent 70%),
    radial-gradient(50% 40% at 95% 12%, rgba(201,140,255,0.18), transparent 70%),
    radial-gradient(55% 45% at 60% 108%, rgba(95,211,168,0.16), transparent 70%); }
  .cover__in { position:relative; height:100%; display:flex; flex-direction:column; }
  .cover__eyebrow { font-family:var(--mono); font-size:11pt; letter-spacing:0.22em; text-transform:uppercase; color:#8b91a0; }
  .cover__title { font-family:var(--serif); font-weight:500; font-size:58pt; line-height:0.96; letter-spacing:-0.02em; margin-top:14mm;
    color:#eef1f8; }
  .cover__sub { font-family:var(--serif); font-size:18pt; color:#cdd2dc; margin-top:9mm; max-width:150mm; line-height:1.3; }
  .cover__meta { font-family:var(--mono); font-size:10pt; color:#8b91a0; margin-top:7mm; }
  .cover__dots { display:flex; gap:7px; margin-top:auto; }
  .cover__dots .dot { width:13px; height:13px; border-radius:50%; }
  .cover__by { margin-top:8mm; font-size:11pt; color:#9aa0ac; display:flex; justify-content:space-between; font-family:var(--mono); }

  h2.page-h { font-family:var(--serif); font-weight:500; font-size:26pt; letter-spacing:-0.015em; margin-bottom:5mm; }
  .lead { font-size:11pt; color:#42454f; max-width:160mm; margin-bottom:4mm; line-height:1.6; }
  .intro { page-break-after:always; padding-top:6mm; }
  .intro h3 { font-family:var(--serif); font-size:14pt; margin:7mm 0 2mm; }
  .intro p { color:#42454f; margin-bottom:3mm; max-width:165mm; }

  /* TOC */
  .toc { page-break-after:always; padding-top:6mm; }
  .toc__row { display:flex; align-items:center; gap:5mm; padding:3.4mm 0; border-bottom:1px solid #e7e8ec; }
  .toc__ic { width:7mm; height:7mm; color:var(--ac); display:grid; place-items:center; }
  .toc__ic .tic { width:5mm; height:5mm; }
  .toc__name { font-family:var(--serif); font-size:13pt; flex:1; }
  .toc__range { font-family:var(--mono); font-size:9.5pt; color:#8a8f9c; }

  /* DIVIDER */
  .divider { page-break-before:always; height:235mm; display:flex; flex-direction:column; justify-content:center; }
  .divider__ic { width:20mm; height:20mm; border-radius:6mm; display:grid; place-items:center; color:var(--ac);
    background:color-mix(in srgb, var(--ac) 14%, transparent); border:1.5px solid color-mix(in srgb, var(--ac) 32%, transparent); margin-bottom:8mm; }
  .divider__ic .dic { width:11mm; height:11mm; }
  .divider__part { font-family:var(--mono); font-size:10pt; letter-spacing:0.2em; text-transform:uppercase; color:var(--ac); }
  .divider__name { font-family:var(--serif); font-weight:500; font-size:40pt; letter-spacing:-0.02em; margin-top:3mm; }
  .divider__blurb { font-family:var(--serif); font-size:15pt; color:#5b6170; margin-top:4mm; max-width:140mm; }
  .divider__range { font-family:var(--mono); font-size:9.5pt; color:#9aa0ac; margin-top:6mm; }

  /* LAW */
  .law { page-break-before:always; padding-top:3mm; }
  .law__head { display:flex; align-items:center; gap:4mm; margin-bottom:2mm; }
  .law__no { font-family:var(--mono); font-weight:600; font-size:11pt; color:var(--ac); }
  .law__tag { font-family:var(--mono); font-size:7.6pt; letter-spacing:0.05em; text-transform:uppercase; font-weight:600;
    color:var(--ac); background:color-mix(in srgb, var(--ac) 13%, transparent); border:1px solid color-mix(in srgb, var(--ac) 26%, transparent); padding:1mm 2.4mm; border-radius:99px; }
  .law__name { font-family:var(--serif); font-weight:500; font-size:19pt; letter-spacing:-0.01em; line-height:1.1; }
  .law__tagline { font-family:var(--serif); font-style:italic; font-size:12.5pt; color:var(--ac); margin-top:1.5mm; margin-bottom:3.5mm; }
  .law__hero { margin:1mm 0 4mm; padding:3mm; border-radius:3mm; break-inside:avoid;
    background:color-mix(in srgb, var(--ac) 4%, #faf9f7); border:1px solid color-mix(in srgb, var(--ac) 13%, transparent); }
  .law__hero img { display:block; width:100%; max-height:92mm; object-fit:contain; }
  .lbl { font-family:var(--mono); font-size:7.8pt; letter-spacing:0.1em; text-transform:uppercase; color:#9298a4; font-weight:600; margin-top:3.4mm; margin-bottom:1.2mm; break-after:avoid; }
  .lbl--ac { color:var(--ac); }
  .bd { font-size:10.2pt; color:#33363f; line-height:1.55; }
  .ul, .ol { margin:0 0 0 4.5mm; }
  .ul li, .ol li { font-size:10pt; color:#33363f; line-height:1.5; margin-bottom:1mm; padding-left:1mm; }
  .ul li { list-style:none; position:relative; }
  .ul li::before { content:""; position:absolute; left:-3mm; top:2.1mm; width:1.5mm; height:1.5mm; border-radius:50%; background:var(--ac); }
  .ol { list-style:none; counter-reset:ap; margin-left:0; }
  .ol li { position:relative; padding-left:7mm; margin-bottom:1.4mm; }
  .ol li::before { counter-increment:ap; content:counter(ap); position:absolute; left:0; top:0; width:4.6mm; height:4.6mm; border-radius:50%;
    background:color-mix(in srgb, var(--ac) 16%, transparent); color:var(--ac); font-family:var(--mono); font-size:7.5pt; font-weight:600; display:grid; place-items:center; }
  .practice { margin-top:3.5mm; padding:3.5mm 4mm; border-radius:3mm; background:color-mix(in srgb, var(--ac) 7%, #fff);
    border:1px solid color-mix(in srgb, var(--ac) 20%, transparent); border-left:2.5pt solid var(--ac); break-inside:avoid; }
  .practice .bd { color:#3a3d46; }
  .takeaway { margin-top:3.5mm; padding:3.2mm 4mm; border-radius:3mm; background:#f4f5f7; border-left:2.5pt solid var(--ac); break-inside:avoid; }
  .takeaway .bd { color:#2a2d35; font-weight:450; }
  .srcs { list-style:none; margin:1mm 0 0; }
  .srcs li { font-family:var(--mono); font-size:8pt; color:#8a8f9c; line-height:1.45; margin-bottom:0.8mm; padding-left:4mm; position:relative; }
  .srcs li::before { content:"\\2197"; position:absolute; left:0; color:var(--ac); }
  .srcs a { color:var(--ac); }

  /* REFS */
  .refs { page-break-before:always; padding-top:6mm; }
  .refs ol { list-style:none; }
  .refs li { display:flex; gap:4mm; padding:3mm 0; border-bottom:1px solid #ececef; break-inside:avoid; }
  .refs .rn { font-family:var(--mono); font-size:9pt; color:#a3a8b3; font-weight:600; }
  .refs strong { font-family:var(--serif); font-weight:500; font-size:11.5pt; }
  .refs a { font-family:var(--mono); font-size:8pt; color:#7c9cff; }
  .refs em { color:#5b6170; font-size:9.4pt; }

  /* CLOSING */
  .closing { page-break-before:always; background:#0b0c10; color:#f3f4f6; height:265mm; margin:0 -15mm -16mm; padding:40mm 22mm; display:flex; flex-direction:column; justify-content:center; }
  .closing h2 { font-family:var(--serif); font-weight:500; font-size:34pt; letter-spacing:-0.02em; line-height:1.05; }
  .closing p { color:#cdd2dc; font-size:12.5pt; margin-top:6mm; max-width:150mm; line-height:1.6; }
  .closing .cta { margin-top:9mm; font-family:var(--mono); font-size:11pt; color:#7c9cff; }
  .closing .fine { margin-top:auto; font-family:var(--mono); font-size:9pt; color:#6b7180; }
</style></head>
<body>

  <div class="cover"><div class="cover__in">
    <p class="cover__eyebrow">The Expanded Field Guide</p>
    <h1 class="cover__title">Laws of AI&nbsp;Agents</h1>
    <p class="cover__sub">${esc(book.subtitle)}</p>
    <p class="cover__meta">50 laws · the mechanism · warning signs · apply-it recipes · 100+ sources</p>
    <div class="cover__dots">${dots}</div>
    <div class="cover__by"><span>By ${esc(SITE.author)}</span><span>laws.deleg8.dev</span></div>
  </div></div>

  <div class="intro">
    <h2 class="page-h">What this is</h2>
    <p class="lead">${txt(book.intro)}</p>
    <h3>How to read it</h3>
    <p>Each law is laid out the same way. <strong>The principle</strong> is why it is true. <strong>Why it happens</strong> is the mechanism underneath, grounded in real research. <strong>Watch for</strong> lists the warning signs you are violating it. <strong>In practice</strong> is a concrete scenario where it bites and how to handle it. <strong>Apply it</strong> is a short, framework-independent recipe. <strong>The takeaway</strong> is the one-line version. <strong>Sources and further reading</strong> point you deeper.</p>
    <h3>How to use it</h3>
    <p>You do not need to read it cover to cover. Skim the categories, find the failure mode you are living right now, and apply the takeaway. Come back when the next one bites. These are heuristics earned from shipping agents, not theorems, so treat them as defaults you can override with good reason.</p>
    <h3>The ten parts</h3>
    <p>Context and Reliability, Reasoning and Planning, Retrieval and Memory, Scope and Design, Instruction and Output, Evaluation and Measurement, Safety and Security, Architecture and Operations, Humans and Autonomy, and Trust and Coordination.</p>
  </div>

  <div class="toc">
    <h2 class="page-h">Contents</h2>
    ${tocRows}
  </div>

  ${cats.map((c, i) => sectionDivider(c, i) + "\n" + lawsByCat(c.id).map(lawBlock).join("\n")).join("\n")}

  <div class="refs">
    <h2 class="page-h">Further reading</h2>
    <p class="lead">The thinking these laws lean on. Foundational essays, papers, and docs worth your time.</p>
    <ol>${refsRows}</ol>
  </div>

  <div class="closing">
    <h2>Build agents people actually trust.</h2>
    <p>These fifty laws are the short version. The real work is applying them under pressure, on your own stack, when the demo meets production. Keep this guide close and revisit it the next time something breaks in a way you have seen before.</p>
    <p class="cta">Read the living deck at laws.deleg8.dev<br/>New laws are added as they earn their place.</p>
    <p class="fine">Laws of AI Agents · The Expanded Field Guide · by ${esc(SITE.author)} · ${"2026"}. Inspired by the format of Laws of UX.</p>
  </div>

</body></html>`;

if (!existsSync(OUTDIR)) mkdirSync(OUTDIR, { recursive: true });
writeFileSync(join(OUTDIR, "laws-of-ai.html"), html);
console.log(`✓ PDF source built -> pdf/laws-of-ai.html (${book.laws.length} laws, ${book.refs.length} refs)`);
