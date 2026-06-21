#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_FILE = join(ROOT, "data", "laws.json");
const LOCAL_ENV = join(ROOT, ".env.local");
const DRY_RUN = process.argv.includes("--dry-run");

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const env = {};
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function first(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== "");
}

function assertUrl(name, value) {
  if (!value) return;
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("not http(s)");
  } catch {
    throw new Error(`${name} must be an absolute http(s) URL, got: ${value}`);
  }
}

const env = { ...process.env, ...parseEnvFile(LOCAL_ENV) };
let source = readFileSync(DATA_FILE, "utf8");
const data = JSON.parse(source);
data.site ||= {};
data.site.product ||= {};
data.site.newsletter ||= {};

const changed = [];
const updates = [];

function jsonString(value) {
  return JSON.stringify(String(value));
}

function findObjectRange(text, objectName) {
  const marker = `"${objectName}": {`;
  const start = text.indexOf(marker);
  if (start === -1) return null;
  const brace = text.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < text.length; i += 1) {
    if (text[i] === "{") depth += 1;
    else if (text[i] === "}") {
      depth -= 1;
      if (depth === 0) return { start, end: i + 1 };
    }
  }
  return null;
}

function replaceObjectProperty(text, objectName, key, value) {
  const range = findObjectRange(text, objectName);
  if (!range) throw new Error(`Missing object: ${objectName}`);
  const before = text.slice(0, range.start);
  let block = text.slice(range.start, range.end);
  const after = text.slice(range.end);
  const re = new RegExp(`("${key}"\\s*:\\s*)"[^"]*"`);
  if (!re.test(block)) throw new Error(`Missing ${objectName}.${key}`);
  block = block.replace(re, `$1${jsonString(value)}`);
  return `${before}${block}${after}`;
}

function removeObjectProperty(text, objectName, key) {
  const range = findObjectRange(text, objectName);
  if (!range) return text;
  const before = text.slice(0, range.start);
  let block = text.slice(range.start, range.end);
  const after = text.slice(range.end);
  block = block
    .replace(new RegExp(`,\\n\\s+"${key}"\\s*:\\s*\\{[^}]*\\}`), "")
    .replace(new RegExp(`\\n\\s+"${key}"\\s*:\\s*\\{[^}]*\\},?`), "");
  return `${before}${block}${after}`;
}

function insertNewsletterHidden(text, hidden) {
  const range = findObjectRange(text, "newsletter");
  if (!range) throw new Error("Missing object: newsletter");
  const before = text.slice(0, range.start);
  let block = text.slice(range.start, range.end);
  const after = text.slice(range.end);
  block = removeObjectProperty(`${block}`, "newsletter", "hidden");
  const fieldLine = /("field"\s*:\s*"[^"]*")/.exec(block);
  if (!fieldLine) throw new Error("Missing newsletter.field");
  block = block.replace(fieldLine[1], `${fieldLine[1]},\n      "hidden": ${JSON.stringify(hidden)}`);
  return `${before}${block}${after}`;
}
const productCheckoutUrl = first(env.PRODUCT_CHECKOUT_URL, env.PAYPAL_CHECKOUT_URL);
assertUrl("PRODUCT_CHECKOUT_URL", productCheckoutUrl);

if (productCheckoutUrl) {
  updates.push((text) => replaceObjectProperty(text, "product", "checkoutUrl", productCheckoutUrl));
  changed.push("site.product.checkoutUrl");
}

if (first(env.PRODUCT_CHECKOUT_PROVIDER, env.CHECKOUT_PROVIDER)) {
  const value = first(env.PRODUCT_CHECKOUT_PROVIDER, env.CHECKOUT_PROVIDER);
  updates.push((text) => replaceObjectProperty(text, "product", "checkoutProvider", value));
  changed.push("site.product.checkoutProvider");
}

if (first(env.PRODUCT_PRICE)) {
  updates.push((text) => replaceObjectProperty(text, "product", "price", first(env.PRODUCT_PRICE)));
  changed.push("site.product.price");
}

const newsletterAction = first(env.NEWSLETTER_FORM_ACTION, env.KIT_FORM_ACTION);
const kitFormId = first(env.KIT_FORM_ID);
const kitV3PublicApiKey = first(env.KIT_V3_PUBLIC_API_KEY, env.KIT_PUBLIC_API_KEY);
const kitV4ApiKey = first(env.KIT_V4_API_KEY, env.KIT_API_KEY);

if (newsletterAction) {
  assertUrl("NEWSLETTER_FORM_ACTION", newsletterAction);
  const field = first(env.NEWSLETTER_EMAIL_FIELD, env.KIT_EMAIL_FIELD, data.site.newsletter.field, "email");
  updates.push((text) => replaceObjectProperty(text, "newsletter", "action", newsletterAction));
  updates.push((text) => replaceObjectProperty(text, "newsletter", "field", field));
  updates.push((text) => removeObjectProperty(text, "newsletter", "hidden"));
  changed.push("site.newsletter.action");
  changed.push("site.newsletter.field");
} else if (kitFormId && kitV3PublicApiKey) {
  updates.push((text) => replaceObjectProperty(text, "newsletter", "action", `https://api.convertkit.com/v3/forms/${kitFormId}/subscribe`));
  updates.push((text) => replaceObjectProperty(text, "newsletter", "field", "email"));
  updates.push((text) => insertNewsletterHidden(text, { api_key: kitV3PublicApiKey }));
  changed.push("site.newsletter.action");
  changed.push("site.newsletter.field");
  changed.push("site.newsletter.hidden.api_key");
} else if (kitFormId && kitV4ApiKey) {
  updates.push((text) => replaceObjectProperty(text, "newsletter", "action", "/api/newsletter"));
  updates.push((text) => replaceObjectProperty(text, "newsletter", "field", "email"));
  updates.push((text) => removeObjectProperty(text, "newsletter", "hidden"));
  changed.push("site.newsletter.action");
  changed.push("site.newsletter.field");
}

if (!changed.length) {
  console.log("No offer config values found.");
  console.log("Create .env.local from marketing/offer.env.example, then run this script again.");
  process.exit(0);
}

for (const update of updates) source = update(source);
if (!DRY_RUN) writeFileSync(DATA_FILE, source.endsWith("\n") ? source : `${source}\n`);
console.log(`${DRY_RUN ? "Would update" : "Updated"} ${DATA_FILE}`);
for (const key of changed) console.log(`  - ${key}`);

if (kitV4ApiKey && !newsletterAction && !kitV3PublicApiKey) {
  console.log("Note: KIT_V4_API_KEY / KIT_API_KEY is local/server-side only and was not written into static site config.");
}
if (kitV3PublicApiKey && !kitFormId && !newsletterAction) {
  console.log("Note: KIT_V3_PUBLIC_API_KEY was set, but KIT_FORM_ID was missing, so newsletter config was not changed.");
}
