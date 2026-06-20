// Batch-generate one hero image per law via Gemini 3 Pro Image.
// Two styles:
//   STYLE=abstract -> minimal line-art metaphor   (data/art.json        -> pdf/assets/law-NN.png)
//   STYLE=explain  -> explanatory labeled diagram  (data/art-explain.json -> pdf/assets/explain/law-NN.png)
// Usage: GOOGLE_API_KEY=... STYLE=explain node scripts/gen-all.mjs [onlyNumber|from-to]
// Skips images that already exist. Re-run to fill gaps.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const KEY = process.env.GOOGLE_API_KEY;
const MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-3-pro-image";
const STYLE = process.env.STYLE || "abstract";
if (!KEY) { console.error("GOOGLE_API_KEY missing"); process.exit(1); }

const laws = JSON.parse(readFileSync(join(ROOT, "data/laws.json"), "utf8"));
const accent = Object.fromEntries(laws.categories.map((c) => [c.id, c.accent]));
const pad = (n) => String(n).padStart(2, "0");

const CFG = {
  abstract: {
    art: "data/art.json",
    out: "pdf/assets",
    build: (ac, scene) =>
      `Minimal editorial line-art concept illustration for a premium book about AI agents. ` +
      `Clean thin vector line work, flat 2D, generous off-white #faf9f7 background, lots of negative space. ` +
      `A single accent color ${ac} used sparingly for the key element, with soft greys for secondary elements. ` +
      `Calm, intelligent, confident, timeless editorial style. Centered square composition. ` +
      `Absolutely no text, no words, no letters, no numbers, no labels anywhere in the image. ` +
      `Concept to depict: ${scene}.`,
  },
  explain: {
    art: "data/art-explain.json",
    out: "pdf/assets/explain",
    build: (ac, scene) =>
      `Clean editorial infographic diagram that clearly EXPLAINS a concept from a book about AI agents, ` +
      `like a beautiful didactic explainer. Off-white #faf9f7 background, thin precise line work, generous spacing, ` +
      `square 1:1 composition. Accent color ${ac} for emphasis, dark grey #33363f for text, soft greys for secondary detail. ` +
      `Use arrows to show flow and cause-and-effect. ` +
      `Use ONLY the short functional text labels specified below (1 to 3 words each, modern sans-serif, spelled correctly). ` +
      `Do NOT add any title, heading, subtitle, caption, author name, book name, source citation, copyright line, ` +
      `watermark, page number, or any extra text beyond the specified labels. ` +
      `Make the mechanism obvious at a glance. Diagram: ${scene}`,
  },
};

const cfg = CFG[STYLE];
if (!cfg) { console.error(`unknown STYLE '${STYLE}'`); process.exit(1); }
const art = JSON.parse(readFileSync(join(ROOT, cfg.art), "utf8"));
const OUT = join(ROOT, cfg.out);
mkdirSync(OUT, { recursive: true });

const arg = process.argv[2];
let want = () => true;
if (arg && /^\d+$/.test(arg)) want = (n) => n === +arg;
else if (arg && /^\d+-\d+$/.test(arg)) { const [a, b] = arg.split("-").map(Number); want = (n) => n >= a && n <= b; }

async function gen(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(j).slice(0, 300)}`);
  const part = (j.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData || p.inline_data);
  const d = part?.inlineData || part?.inline_data;
  if (!d) throw new Error("no image: " + JSON.stringify(j).slice(0, 300));
  return Buffer.from(d.data, "base64");
}

console.log(`style=${STYLE} model=${MODEL} -> ${cfg.out}`);
let done = 0, skip = 0, fail = 0;
for (const l of laws.laws) {
  if (!want(l.number)) continue;
  const out = join(OUT, `law-${pad(l.number)}.png`);
  if (existsSync(out)) { skip++; continue; }
  const scene = art[String(l.number)];
  if (!scene) { console.warn(`! no metaphor for ${l.number}`); continue; }
  const prompt = cfg.build(accent[l.category], scene);
  try {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try { writeFileSync(out, await gen(prompt)); break; }
      catch (e) { if (attempt === 3) throw e; await new Promise((r) => setTimeout(r, 2000 * attempt)); }
    }
    done++;
    console.log(`✓ ${pad(l.number)} ${l.name}`);
  } catch (e) { fail++; console.error(`✗ ${pad(l.number)} ${l.name}: ${e.message}`); }
}
console.log(`\nDone (${STYLE}). generated ${done}, skipped ${skip}, failed ${fail}.`);
