/**
 * Single source of truth for the book content.
 *
 * Both the website (build.mjs) and the PDF (build-pdf.mjs) import loadBook()
 * from here, so editing data/*.json or the images updates BOTH outputs.
 *
 * Returns RAW strings (no escaping / no em-dash stripping) — each builder
 * applies its own text transform (the PDF strips em dashes, the site keeps them).
 */
import { readFileSync, existsSync, openSync, readSync, closeSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---------- text helpers ----------
export const esc = (s = "") =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export const noEm = (s = "") => String(s).replace(/\s*—\s*/g, ", ");
export const slugify = (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
export const pad = (n) => String(n).padStart(2, "0");

// ---------- category icons (line, currentColor) ----------
export const ICON_PATHS = {
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
export const icon = (id) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[id] || ""}</svg>`;

// ---------- image resolution ----------
// Hero art lives under pdf/assets/. The explanatory diagram is primary; the
// abstract line-art is the fallback. Returns null if neither exists yet.
const EXPLAIN_DIR = join(ROOT, "pdf/assets/explain");
const ABSTRACT_DIR = join(ROOT, "pdf/assets");
// Read intrinsic dimensions from a PNG (IHDR) or JPEG (SOFn) file header.
// Some files in this repo end in .png but are actually JPEG — sniff the magic.
function readImageSize(absPath) {
  const fd = openSync(absPath, "r");
  const buf = Buffer.alloc(65536);
  const n = readSync(fd, buf, 0, 65536, 0);
  closeSync(fd);
  // PNG: 0x89 0x50 0x4E 0x47, IHDR width@16 height@20 (BE u32)
  if (n >= 24 && buf[0] === 0x89 && buf[1] === 0x50) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  // JPEG: 0xFF 0xD8, walk markers until an SOFn (FFC0-CF, skipping DHT/JPG/DAC).
  if (n >= 4 && buf[0] === 0xFF && buf[1] === 0xD8) {
    let i = 2;
    while (i < n - 9) {
      if (buf[i] !== 0xFF) break;
      const m = buf[i + 1];
      const isSOF =
        (m >= 0xC0 && m <= 0xC3) ||
        (m >= 0xC5 && m <= 0xC7) ||
        (m >= 0xC9 && m <= 0xCB) ||
        (m >= 0xCD && m <= 0xCF);
      if (isSOF) {
        return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
      }
      const len = buf.readUInt16BE(i + 2);
      i += 2 + len;
    }
  }
  return null;
}
function resolveImage(number) {
  const file = `law-${pad(number)}.png`;
  let absPath, variant;
  if (existsSync(join(EXPLAIN_DIR, file))) {
    absPath = join(EXPLAIN_DIR, file);
    variant = "explain";
  } else if (existsSync(join(ABSTRACT_DIR, file))) {
    absPath = join(ABSTRACT_DIR, file);
    variant = "abstract";
  } else {
    return null;
  }
  const size = readImageSize(absPath) || { width: 1024, height: 1024 };
  return { file, variant, absPath, width: size.width, height: size.height };
}

// ---------- loader ----------
export function loadBook() {
  const data = JSON.parse(readFileSync(join(ROOT, "data/laws.json"), "utf8"));
  const examples = JSON.parse(readFileSync(join(ROOT, "data/examples.json"), "utf8"));
  const deep = JSON.parse(readFileSync(join(ROOT, "data/deep.json"), "utf8"));
  const catById = Object.fromEntries(data.categories.map((c) => [c.id, c]));

  const laws = data.laws.map((l) => {
    const d = deep[l.name] || {};
    const sources = [];
    if (l.source?.url) sources.push(l.source);
    (d.extra_refs || []).forEach((r) => sources.push(r));
    return {
      number: l.number,
      name: l.name,
      category: l.category,
      tagline: l.tagline,
      principle: l.principle,
      takeaway: l.takeaway,
      source: l.source || null,
      slug: slugify(l.name),
      depth: d.depth || "",
      signals: d.signals || [],
      apply: d.apply || [],
      example: examples[l.name] || "",
      sources,
      image: resolveImage(l.number),
    };
  });

  return {
    title: data.title,
    subtitle: data.subtitle,
    intro: data.intro,
    site: data.site,
    categories: data.categories,
    catById,
    laws,
    refs: data.references || [],
  };
}

// Laws belonging to a category, in order.
export const lawsInCategory = (laws, catId) => laws.filter((l) => l.category === catId);
