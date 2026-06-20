// Usage: node scripts/gen-image.mjs "<prompt>" <out.png> [model]
import { writeFileSync } from "node:fs";
const KEY = process.env.GOOGLE_API_KEY;
const [, , prompt, out, model = "gemini-3-pro-image"] = process.argv;
if (!KEY) { console.error("GOOGLE_API_KEY missing"); process.exit(1); }
const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`;
const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
});
const j = await res.json();
if (!res.ok) { console.error("ERR", res.status, JSON.stringify(j).slice(0, 800)); process.exit(1); }
const parts = j.candidates?.[0]?.content?.parts || [];
const img = parts.find((p) => p.inlineData || p.inline_data);
const d = img?.inlineData || img?.inline_data;
if (!d) { console.error("No image in response:", JSON.stringify(j).slice(0, 800)); process.exit(1); }
writeFileSync(out, Buffer.from(d.data, "base64"));
console.log("saved", out);
