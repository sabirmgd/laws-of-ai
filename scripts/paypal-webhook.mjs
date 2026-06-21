#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_FILE = join(ROOT, ".env.local");
const DEFAULT_EVENTS = [
  "PAYMENT.CAPTURE.COMPLETED",
  "PAYMENT.CAPTURE.REFUNDED",
  "PAYMENT.CAPTURE.REVERSED",
  "PAYMENT.CAPTURE.DENIED",
];

function loadLocalEnv() {
  if (!existsSync(ENV_FILE)) return;
  for (const raw of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [key, ...parts] = line.split("=");
    if (process.env[key]) continue;
    let value = parts.join("=").trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function apiBase() {
  return process.env.PAYPAL_MODE === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

async function paypalToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID || "";
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET || "";
  if (!clientId || !clientSecret) throw new Error("PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are required");
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(`${apiBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: "grant_type=client_credentials",
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(`PayPal auth failed: ${response.status} ${json.error_description || text}`);
  return json.access_token;
}

async function paypalRequest(method, path, body) {
  const token = await paypalToken();
  const response = await fetch(`${apiBase()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(`PayPal API failed: ${response.status} ${json.message || text}`);
  return json;
}

async function main() {
  loadLocalEnv();
  const webhookUrl = process.argv[2] || process.env.PAYPAL_WEBHOOK_URL;
  if (!webhookUrl || !/^https:\/\//.test(webhookUrl)) {
    throw new Error("Usage: node scripts/paypal-webhook.mjs https://example.com/api/paypal/webhook");
  }

  const existing = await paypalRequest("GET", "/v1/notifications/webhooks");
  const match = (existing.webhooks || []).find((webhook) => webhook.url === webhookUrl);
  if (match?.id) {
    console.error(`Reusing PayPal webhook ${match.id}`);
    console.log(match.id);
    return;
  }

  const created = await paypalRequest("POST", "/v1/notifications/webhooks", {
    url: webhookUrl,
    event_types: DEFAULT_EVENTS.map((name) => ({ name })),
  });
  console.error(`Created PayPal webhook ${created.id}`);
  console.log(created.id);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
