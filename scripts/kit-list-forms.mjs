#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOCAL_ENV = join(ROOT, ".env.local");

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const env = {};
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
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

const env = { ...process.env, ...parseEnvFile(LOCAL_ENV) };
const apiKey = env.KIT_V4_API_KEY || env.KIT_API_KEY;

if (!apiKey) {
  console.error("Missing KIT_V4_API_KEY in .env.local or the process environment.");
  process.exit(1);
}

const url = new URL("https://api.kit.com/v4/forms");
if (process.argv.includes("--all")) url.searchParams.set("status", "all");

const response = await fetch(url, {
  headers: {
    "Content-Type": "application/json",
    "X-Kit-Api-Key": apiKey,
  },
});

if (!response.ok) {
  const body = await response.text();
  throw new Error(`Kit forms request failed: ${response.status} ${response.statusText}\n${body}`);
}

const data = await response.json();
const forms = data.forms || [];
if (!forms.length) {
  console.log("No active Kit forms found.");
  process.exit(0);
}

for (const form of forms) {
  const type = form.type || "unknown";
  const status = form.status || "unknown";
  const name = form.name || form.title || "(untitled)";
  const url = form.url || form.hosted_url || "";
  console.log(`${form.id}\t${status}\t${type}\t${name}${url ? `\t${url}` : ""}`);
}
