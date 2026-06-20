// Detect explain diagrams whose dominant accent hue drifted from the category accent.
// Dependency-free PNG decode (zlib inflate + unfilter). Prints flagged law numbers.
import { readFileSync, existsSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadBook } from "../lib/content.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const book = loadBook();
const accentOf = Object.fromEntries(book.categories.map((c) => [c.id, c.accent]));

function hexToHsv(hex) {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16) / 255, g = parseInt(m.slice(2, 4), 16) / 255, b = parseInt(m.slice(4, 6), 16) / 255;
  return rgbToHsv(r * 255, g * 255, b * 255);
}
function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}
function hueDelta(a, b) { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; }

const paeth = (a, b, c) => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

function decodePng(buf) {
  let pos = 8, w = 0, h = 0, ct = 0, bd = 0; const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos); const type = buf.toString("ascii", pos + 4, pos + 8); const start = pos + 8;
    if (type === "IHDR") { w = buf.readUInt32BE(start); h = buf.readUInt32BE(start + 4); bd = buf[start + 8]; ct = buf[start + 9]; }
    else if (type === "IDAT") idat.push(buf.subarray(start, start + len));
    else if (type === "IEND") break;
    pos = start + len + 4;
  }
  if (bd !== 8 || (ct !== 2 && ct !== 6)) throw new Error(`unsupported png ct=${ct} bd=${bd}`);
  const bpp = ct === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  let rp = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[rp++];
    for (let x = 0; x < stride; x++) {
      const v = raw[rp++];
      const a = x >= bpp ? out[y * stride + x - bpp] : 0;
      const bb = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0;
      let val;
      switch (f) {
        case 0: val = v; break;
        case 1: val = v + a; break;
        case 2: val = v + bb; break;
        case 3: val = v + ((a + bb) >> 1); break;
        case 4: val = v + paeth(a, bb, c); break;
        default: val = v;
      }
      out[y * stride + x] = val & 0xff;
    }
  }
  return { w, h, bpp, data: out };
}

// Files are JPEG (despite the .png name); downscale-convert to a true PNG first.
function loadAsPng(src) {
  const tmp = join(tmpdir(), "acc-" + src.split("/").pop());
  execSync(`sips -s format png -z 48 48 ${JSON.stringify(src)} --out ${JSON.stringify(tmp)}`, { stdio: "ignore" });
  return decodePng(readFileSync(tmp));
}

function dominantHue(img) {
  const bins = new Array(36).fill(0);
  const { w, h, bpp, data } = img;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * bpp;
      const { h: hue, s, v } = rgbToHsv(data[i], data[i + 1], data[i + 2]);
      if (s > 0.18 && v > 0.2 && v < 0.98) bins[Math.floor(hue / 10) % 36] += s;
    }
  }
  let max = 0, bi = -1;
  for (let i = 0; i < 36; i++) if (bins[i] > max) { max = bins[i]; bi = i; }
  return { hue: bi < 0 ? null : bi * 10 + 5, weight: max };
}

const flagged = [];
for (const l of book.laws) {
  const p = join(ROOT, "pdf/assets/explain", `law-${String(l.number).padStart(2, "0")}.png`);
  if (!existsSync(p)) continue;
  let dom;
  try { dom = dominantHue(loadAsPng(p)); } catch (e) { console.error(`law ${l.number}: ${e.message}`); continue; }
  const accentHue = hexToHsv(accentOf[l.category]).h;
  const delta = dom.hue == null ? 999 : hueDelta(dom.hue, accentHue);
  const bad = delta > 38;
  if (bad) flagged.push(l.number);
  console.log(`${bad ? "✗" : "✓"} law-${String(l.number).padStart(2, "0")}  accent=${accentOf[l.category]}(${accentHue.toFixed(0)}°)  img=${dom.hue == null ? "none" : dom.hue + "°"}  Δ=${delta === 999 ? "—" : delta.toFixed(0) + "°"}`);
}
console.log(`\nFLAGGED (${flagged.length}): ${flagged.join(" ")}`);
