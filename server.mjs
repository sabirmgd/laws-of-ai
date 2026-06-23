#!/usr/bin/env node
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const DIST = join(ROOT, "dist");
const PRODUCT_BUNDLE_ROOT = join(ROOT, "product", "ai-agent-audit-kit", "build", "ai-agent-audit-kit-50-laws-edition");
const PRODUCT_RELEASE_ZIP = join(ROOT, "product", "ai-agent-audit-kit", "releases", "ai-agent-audit-kit-50-laws-edition.zip");

function loadLocalEnv() {
  const envPath = join(ROOT, ".env.local");
  if (!existsSync(envPath)) return;
  if (!statSync(envPath).isFile()) return;
  const text = readFileSync(envPath, "utf8");
  for (const lineRaw of text.split(/\r?\n/)) {
    const line = lineRaw.trim();
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

loadLocalEnv();

function flag(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  if (/^(1|true|yes|on)$/i.test(value)) return true;
  if (/^(0|false|no|off)$/i.test(value)) return false;
  return fallback;
}

const PORT = Number(process.env.PORT || 8080);
const SITE_URL = process.env.SITE_URL || "https://laws.deleg8.dev/";
const PROJECT_ID = process.env.FIRESTORE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT || "deleg8-dev";
const FIRESTORE_DATABASE = process.env.FIRESTORE_DATABASE || "(default)";
const PROTECTED_BUCKET = process.env.PROTECTED_BUCKET || "";
const ENTITLEMENT_COLLECTION = process.env.ENTITLEMENT_COLLECTION || "lawsAiEntitlements";
const SESSION_COLLECTION = process.env.SESSION_COLLECTION || "lawsAiSessions";
const ORDER_COLLECTION = process.env.ORDER_COLLECTION || "lawsAiOrders";
const SESSION_COOKIE = "loa_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const LOCAL_ACCESS_STORE = process.env.LOCAL_ACCESS_STORE || (!process.env.K_SERVICE && !process.env.GOOGLE_OAUTH_ACCESS_TOKEN ? join(ROOT, ".local", "paid-access-store.json") : "");
const PAYPAL_MODE = process.env.PAYPAL_MODE === "live" ? "live" : "sandbox";
const PAYPAL_BASE_URL = PAYPAL_MODE === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || "";
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || "";
const PAYPAL_WEBHOOK_ID = process.env.PAYPAL_WEBHOOK_ID || "";
const PRODUCT_NAME = process.env.PRODUCT_NAME || "AI Agent Audit Kit: 50 Laws Edition";
const PRODUCT_CURRENCY = process.env.PRODUCT_CURRENCY || "USD";
const PRODUCT_PRICE = process.env.PRODUCT_PRICE || process.env.PRODUCT_PRICE_USD || "14.90";
const PRODUCT_PUBLIC_ENABLED = flag("PRODUCT_PUBLIC_ENABLED", true);
const FREE_EDITION_ENABLED = flag("FREE_EDITION_ENABLED", !PRODUCT_PUBLIC_ENABLED);
const PAYMENT_TEST_ENABLED = flag("PAYMENT_TEST_ENABLED", false);
let paypalTokenCache = null;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".yaml": "text/yaml; charset=utf-8",
  ".yml": "text/yaml; charset=utf-8",
  ".zip": "application/zip",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(body);
}

function wantsJson(req) {
  return String(req.headers.accept || "").includes("application/json");
}

function nowIso() {
  return new Date().toISOString();
}

function futureIso(seconds) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function emailId(email) {
  return sha256(String(email).trim().toLowerCase());
}

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || "").split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (!rawName) continue;
    out[rawName] = decodeURIComponent(rawValue.join("=") || "");
  }
  return out;
}

function setSessionCookie(res, token, req) {
  const host = String(req.headers.host || "");
  const secure = host.includes("localhost") || host.startsWith("127.0.0.1") ? "" : "; Secure";
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SECONDS}${secure}`
  );
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

function htmlPage(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    body{font-family:Inter,system-ui,sans-serif;background:#0a0b0f;color:#f3f4f6;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;line-height:1.6}
    main{max-width:560px}
    a{color:#bdf4df}
  </style>
</head>
<body><main>${body}</main></body>
</html>`;
}

async function googleAccessToken() {
  if (process.env.GOOGLE_OAUTH_ACCESS_TOKEN) return process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
  const response = await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token", {
    headers: { "Metadata-Flavor": "Google" },
  });
  if (!response.ok) throw new Error(`Metadata token failed: ${response.status}`);
  const json = await response.json();
  return json.access_token;
}

function firestoreBase() {
  return `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${encodeURIComponent(FIRESTORE_DATABASE)}/documents`;
}

function toFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === "object") return { mapValue: { fields: toFirestoreFields(value) } };
  if (/^\d{4}-\d{2}-\d{2}T/.test(String(value))) return { timestampValue: String(value) };
  return { stringValue: String(value) };
}

function toFirestoreFields(obj) {
  return Object.fromEntries(Object.entries(obj).map(([key, value]) => [key, toFirestoreValue(value)]));
}

function fromFirestoreValue(value = {}) {
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(fromFirestoreValue);
  if ("mapValue" in value) return fromFirestoreFields(value.mapValue.fields || {});
  return undefined;
}

function fromFirestoreFields(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, fromFirestoreValue(value)]));
}

function localStoreRead() {
  if (!LOCAL_ACCESS_STORE || !existsSync(LOCAL_ACCESS_STORE)) return {};
  try {
    return JSON.parse(readFileSync(LOCAL_ACCESS_STORE, "utf8"));
  } catch {
    return {};
  }
}

function localStoreWrite(store) {
  if (!LOCAL_ACCESS_STORE) return;
  mkdirSync(dirname(LOCAL_ACCESS_STORE), { recursive: true });
  writeFileSync(LOCAL_ACCESS_STORE, `${JSON.stringify(store, null, 2)}\n`);
}

function localStoreKey(collection, id) {
  return `${collection}/${id}`;
}

async function firestoreRequest(path, init = {}) {
  const token = await googleAccessToken();
  const response = await fetch(`${firestoreBase()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!response.ok) {
    const msg = json.error?.message || json.raw || `${response.status} ${response.statusText}`;
    throw new Error(`Firestore request failed: ${msg}`);
  }
  return json;
}

async function firestoreSet(collection, id, data) {
  if (LOCAL_ACCESS_STORE) {
    const store = localStoreRead();
    const key = localStoreKey(collection, id);
    store[key] = { ...(store[key] || {}), ...data };
    localStoreWrite(store);
    return { local: true };
  }
  const encodedId = encodeURIComponent(id);
  return firestoreRequest(`/${collection}/${encodedId}`, {
    method: "PATCH",
    body: JSON.stringify({ fields: toFirestoreFields(data) }),
  });
}

async function firestoreGet(collection, id) {
  if (LOCAL_ACCESS_STORE) {
    const store = localStoreRead();
    return store[localStoreKey(collection, id)] || null;
  }
  try {
    const encodedId = encodeURIComponent(id);
    const json = await firestoreRequest(`/${collection}/${encodedId}`, { method: "GET" });
    return fromFirestoreFields(json.fields || {});
  } catch (err) {
    if (String(err.message).includes("NOT_FOUND")) return null;
    throw err;
  }
}

async function readBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > 65_536) throw new Error("Request body too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function parseSignup(req) {
  const raw = await readBody(req);
  const type = String(req.headers["content-type"] || "");
  if (type.includes("application/json")) {
    const json = JSON.parse(raw || "{}");
    return {
      email: json.email || json.email_address || "",
      referrer: json.referrer || "",
    };
  }
  const params = new URLSearchParams(raw);
  return {
    email: params.get("email") || params.get("email_address") || "",
    referrer: params.get("referrer") || "",
  };
}

function validEmail(email) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

async function kitRequest(path, body) {
  const apiKey = process.env.KIT_V4_API_KEY || process.env.KIT_API_KEY;
  if (!apiKey) throw new Error("KIT_V4_API_KEY is not configured");
  const response = await fetch(`https://api.kit.com/v4${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Kit-Api-Key": apiKey,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  return { ok: response.ok, status: response.status, json };
}

async function subscribeToKit(email, referrer) {
  const formId = process.env.KIT_FORM_ID;
  if (!formId) throw new Error("KIT_FORM_ID is not configured");

  const direct = await kitRequest(`/forms/${formId}/subscribers`, {
    email_address: email,
    referrer: referrer || SITE_URL,
  });
  if (direct.ok) return direct.json;

  const create = await kitRequest("/subscribers", {
    email_address: email,
    state: "active",
  });
  if (!create.ok) {
    const errors = create.json.errors || direct.json.errors || [`Kit returned ${create.status}`];
    throw new Error(Array.isArray(errors) ? errors.join("; ") : String(errors));
  }

  const subscriberId = create.json.subscriber?.id;
  if (!subscriberId) return create.json;

  const attach = await kitRequest(`/forms/${formId}/subscribers/${subscriberId}`, {
    referrer: referrer || SITE_URL,
  });
  if (!attach.ok) {
    const errors = attach.json.errors || [`Kit returned ${attach.status}`];
    throw new Error(Array.isArray(errors) ? errors.join("; ") : String(errors));
  }
  return attach.json;
}

async function handleNewsletter(req, res) {
  if (req.method !== "POST") {
    send(res, 405, "Method Not Allowed", { Allow: "POST", "Content-Type": "text/plain; charset=utf-8" });
    return;
  }

  try {
    const { email, referrer } = await parseSignup(req);
    if (!validEmail(email)) {
      if (wantsJson(req)) send(res, 400, JSON.stringify({ ok: false, error: "Valid email required" }), { "Content-Type": "application/json; charset=utf-8" });
      else send(res, 400, htmlPage("Email Required", "<h1>Email required</h1><p>Please go back and enter a valid email address.</p><p><a href=\"/\">Back to Laws of AI Agents</a></p>"), { "Content-Type": "text/html; charset=utf-8" });
      return;
    }

    await subscribeToKit(email, referrer || req.headers.referer || SITE_URL);
    if (wantsJson(req)) send(res, 200, JSON.stringify({ ok: true }), { "Content-Type": "application/json; charset=utf-8" });
    else send(res, 200, htmlPage("Subscribed", "<h1>You are in.</h1><p>Check your inbox for the free agent audit course.</p><p><a href=\"/\">Back to Laws of AI Agents</a></p>"), { "Content-Type": "text/html; charset=utf-8" });
  } catch (err) {
    console.error("newsletter_signup_failed", err.message);
    if (wantsJson(req)) send(res, 502, JSON.stringify({ ok: false, error: "Newsletter signup failed" }), { "Content-Type": "application/json; charset=utf-8" });
    else send(res, 502, htmlPage("Signup Failed", "<h1>Signup failed</h1><p>The email service did not accept the request. Please try again in a minute.</p><p><a href=\"/\">Back to Laws of AI Agents</a></p>"), { "Content-Type": "text/html; charset=utf-8" });
  }
}

async function readJson(req) {
  const raw = await readBody(req);
  return raw ? JSON.parse(raw) : {};
}

function productPriceValue() {
  const raw = String(PRODUCT_PRICE).replace(/[^0-9.]/g, "");
  const value = Number(raw || "14.90");
  if (!Number.isFinite(value) || value <= 0) return "14.90";
  return value.toFixed(2);
}

function publicOrigin(req) {
  const configured = SITE_URL.replace(/\/+$/, "");
  if (configured.startsWith("https://")) return configured;
  const host = req.headers.host || "localhost";
  const proto = host.includes("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  return `${proto}://${host}`;
}

function paypalConfigured() {
  return paymentsEnabled() && Boolean(PAYPAL_CLIENT_ID && PAYPAL_CLIENT_SECRET);
}

function paymentsEnabled() {
  return PRODUCT_PUBLIC_ENABLED || PAYMENT_TEST_ENABLED;
}

function sendPaymentDisabled(res) {
  send(res, 404, JSON.stringify({ ok: false, error: "payments disabled" }), { "Content-Type": "application/json; charset=utf-8" });
}

function checkoutCancelUrl(origin) {
  if (PRODUCT_PUBLIC_ENABLED) return `${origin}/ai-agent-audit-kit/`;
  if (PAYMENT_TEST_ENABLED) return `${origin}/sandbox/ai-agent-audit-kit/`;
  return `${origin}/edition.html`;
}

async function paypalAccessToken() {
  if (
    paypalTokenCache &&
    Date.now() - paypalTokenCache.fetchedAt < (paypalTokenCache.expires_in - 60) * 1000
  ) {
    return paypalTokenCache.access_token;
  }

  if (!paypalConfigured()) throw new Error("PayPal is not configured");
  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString("base64");
  const response = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
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
  paypalTokenCache = { ...json, fetchedAt: Date.now() };
  return json.access_token;
}

async function paypalRequest(method, path, body, requestId = randomUUID()) {
  const token = await paypalAccessToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (method !== "GET" && requestId) headers["PayPal-Request-Id"] = requestId;
  const response = await fetch(`${PAYPAL_BASE_URL}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!response.ok) {
    const detail = json.message || json.error_description || json.raw || text;
    const err = new Error(`PayPal API failed: ${response.status} ${detail}`);
    err.status = response.status;
    err.paypal = json;
    err.paypalName = String(json.name || json.error || "");
    err.paypalIssue = String((json.details || []).map((item) => item.issue).find(Boolean) || "");
    err.paypalDebugId = String(json.debug_id || "");
    throw err;
  }
  return json;
}

function captureRecordFromOrder(order) {
  for (const unit of order.purchase_units || []) {
    const capture = unit.payments?.captures?.[0];
    if (capture) return { unit, capture };
  }
  return { unit: {}, capture: {} };
}

function buyerEmailFromOrder(order, fallback = "") {
  return String(order.payer?.email_address || fallback || "").trim().toLowerCase();
}

async function rememberPayPalTransaction(email, orderId, captureId, data = {}) {
  const record = {
    provider: "paypal",
    email,
    orderId: String(orderId || ""),
    captureId: String(captureId || ""),
    updatedAt: nowIso(),
    ...data,
  };
  if (orderId) await firestoreSet(ORDER_COLLECTION, String(orderId), record);
  if (captureId) await firestoreSet(ORDER_COLLECTION, String(captureId), record);
}

async function grantPayPalEntitlement(order, fallbackEmail = "") {
  const { unit, capture } = captureRecordFromOrder(order);
  const email = buyerEmailFromOrder(order, fallbackEmail);
  if (!validEmail(email)) throw new Error("PayPal order missing buyer email");

  const orderId = String(order.id || "");
  const captureId = String(capture.id || orderId || `${email}-${Date.now()}`);
  const buyerId = emailId(email);
  const amount = capture.amount || unit.amount || {};
  const access = {
    active: true,
    provider: "paypal",
    email,
    buyerId,
    transactionId: captureId,
    orderId,
    captureId,
    payerId: String(order.payer?.payer_id || ""),
    productKey: "ai-agent-audit-kit",
    productName: PRODUCT_NAME,
    price: Number(amount.value || productPriceValue()),
    currency: String(amount.currency_code || PRODUCT_CURRENCY),
    paymentType: "paypal",
    updatedAt: nowIso(),
    createdAt: nowIso(),
  };

  await firestoreSet(ENTITLEMENT_COLLECTION, buyerId, access);
  await firestoreSet(`${ENTITLEMENT_COLLECTION}/${buyerId}/transactions`, captureId, {
    ...access,
    rawType: "paypal_capture",
  });
  await rememberPayPalTransaction(email, orderId, captureId, {
    buyerId,
    status: String(capture.status || order.status || "COMPLETED"),
  });
  return { email, buyerId, orderId, captureId };
}

async function findPayPalTransaction(resource = {}) {
  const related = resource.supplementary_data?.related_ids || {};
  const ids = [
    related.order_id,
    related.capture_id,
    resource.invoice_id,
    resource.custom_id,
    resource.id,
  ].filter(Boolean);
  for (const id of ids) {
    const record = await firestoreGet(ORDER_COLLECTION, String(id));
    if (record?.email) return record;
  }
  return null;
}

async function revokeEntitlementForEmail(email, reason, transactionId = "") {
  const normalized = String(email || "").trim().toLowerCase();
  if (!validEmail(normalized)) throw new Error("Missing buyer email for entitlement revoke");
  const buyerId = emailId(normalized);
  const existing = (await firestoreGet(ENTITLEMENT_COLLECTION, buyerId)) || {};
  await firestoreSet(ENTITLEMENT_COLLECTION, buyerId, {
    ...existing,
    active: false,
    email: normalized,
    revokedAt: nowIso(),
    revokeReason: reason,
    updatedAt: nowIso(),
    refundTransactionId: String(transactionId || ""),
  });
  return { email: normalized, buyerId };
}

async function handlePaypalConfig(req, res) {
  if (req.method !== "GET") {
    send(res, 405, "Method Not Allowed", { Allow: "GET", "Content-Type": "text/plain; charset=utf-8" });
    return;
  }
  if (!paymentsEnabled()) {
    send(res, 200, JSON.stringify({
      configured: false,
      mode: PAYPAL_MODE,
      currency: PRODUCT_CURRENCY,
      price: productPriceValue(),
      productName: PRODUCT_NAME,
    }), { "Content-Type": "application/json; charset=utf-8" });
    return;
  }
  send(res, 200, JSON.stringify({
    configured: paypalConfigured(),
    clientId: paypalConfigured() ? PAYPAL_CLIENT_ID : "",
    mode: PAYPAL_MODE,
    currency: PRODUCT_CURRENCY,
    price: productPriceValue(),
    productName: PRODUCT_NAME,
  }), { "Content-Type": "application/json; charset=utf-8" });
}

async function handlePaypalCreateOrder(req, res) {
  if (req.method !== "POST") {
    send(res, 405, "Method Not Allowed", { Allow: "POST", "Content-Type": "text/plain; charset=utf-8" });
    return;
  }
  if (!paymentsEnabled()) {
    sendPaymentDisabled(res);
    return;
  }

  try {
    const body = await readJson(req);
    const email = String(body.email || "").trim().toLowerCase();
    if (!validEmail(email)) {
      send(res, 400, JSON.stringify({ ok: false, error: "valid email required" }), { "Content-Type": "application/json; charset=utf-8" });
      return;
    }

    const origin = publicOrigin(req);
    const order = await paypalRequest("POST", "/v2/checkout/orders", {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: "ai-agent-audit-kit",
          custom_id: emailId(email),
          description: PRODUCT_NAME,
          amount: {
            currency_code: PRODUCT_CURRENCY,
            value: productPriceValue(),
          },
        },
      ],
      application_context: {
        brand_name: "Laws of AI Agents",
        landing_page: "BILLING",
        shipping_preference: "NO_SHIPPING",
        user_action: "PAY_NOW",
        return_url: `${origin}/paid/edition.html`,
        cancel_url: checkoutCancelUrl(origin),
      },
    });

    await rememberPayPalTransaction(email, order.id, "", {
      status: String(order.status || "CREATED"),
      buyerId: emailId(email),
    });
    send(res, 200, JSON.stringify({ id: order.id }), { "Content-Type": "application/json; charset=utf-8" });
  } catch (err) {
    console.error("paypal_create_order_failed", err.message);
    send(res, 502, JSON.stringify({ ok: false, error: "PayPal order creation failed" }), { "Content-Type": "application/json; charset=utf-8" });
  }
}

async function handlePaypalCaptureOrder(req, res) {
  if (req.method !== "POST") {
    send(res, 405, "Method Not Allowed", { Allow: "POST", "Content-Type": "text/plain; charset=utf-8" });
    return;
  }
  if (!paymentsEnabled()) {
    sendPaymentDisabled(res);
    return;
  }

  try {
    const body = await readJson(req);
    const orderId = String(body.orderID || body.orderId || "").trim();
    if (!/^[A-Z0-9-]+$/i.test(orderId)) {
      send(res, 400, JSON.stringify({ ok: false, error: "valid orderID required" }), { "Content-Type": "application/json; charset=utf-8" });
      return;
    }

    const pending = (await firestoreGet(ORDER_COLLECTION, orderId)) || {};
    const order = await paypalRequest("POST", `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, undefined, orderId);
    if (order.status !== "COMPLETED") {
      send(res, 402, JSON.stringify({ ok: false, error: "payment not completed", status: order.status }), { "Content-Type": "application/json; charset=utf-8" });
      return;
    }

    const result = await grantPayPalEntitlement(order, pending.email || body.email || "");
    const token = await createSession(result.email, { transactionId: result.captureId });
    setSessionCookie(res, token, req);
    send(res, 200, JSON.stringify({ ok: true, accessUrl: "/paid/edition.html" }), { "Content-Type": "application/json; charset=utf-8" });
  } catch (err) {
    console.error("paypal_capture_order_failed", err.message);
    if (err.paypalIssue === "INSTRUMENT_DECLINED") {
      send(res, 422, JSON.stringify({
        ok: false,
        error: "INSTRUMENT_DECLINED",
        message: "The sandbox payment method was declined by PayPal. Use a different sandbox buyer account or generated test card.",
      }), { "Content-Type": "application/json; charset=utf-8" });
      return;
    }
    if (err.status === 422) {
      send(res, 422, JSON.stringify({
        ok: false,
        error: "PAYPAL_CAPTURE_REJECTED",
        message: "PayPal rejected the capture. Check the sandbox buyer account or test card and try again.",
      }), { "Content-Type": "application/json; charset=utf-8" });
      return;
    }
    send(res, 502, JSON.stringify({ ok: false, error: "PayPal capture failed" }), { "Content-Type": "application/json; charset=utf-8" });
  }
}

async function paypalWebhookSignatureIsValid(headers, raw) {
  if (!PAYPAL_WEBHOOK_ID) throw new Error("PAYPAL_WEBHOOK_ID is not configured");
  const result = await paypalRequest("POST", "/v1/notifications/verify-webhook-signature", {
    auth_algo: headers["paypal-auth-algo"],
    cert_url: headers["paypal-cert-url"],
    transmission_id: headers["paypal-transmission-id"],
    transmission_sig: headers["paypal-transmission-sig"],
    transmission_time: headers["paypal-transmission-time"],
    webhook_id: PAYPAL_WEBHOOK_ID,
    webhook_event: JSON.parse(raw),
  });
  return result.verification_status === "SUCCESS";
}

async function handlePaypalWebhook(req, res) {
  if (req.method !== "POST") {
    send(res, 405, "Method Not Allowed", { Allow: "POST", "Content-Type": "text/plain; charset=utf-8" });
    return;
  }
  if (!paymentsEnabled()) {
    sendPaymentDisabled(res);
    return;
  }

  try {
    const raw = await readBody(req);
    const valid = await paypalWebhookSignatureIsValid(req.headers, raw);
    if (!valid) {
      send(res, 401, JSON.stringify({ ok: false, error: "invalid signature" }), { "Content-Type": "application/json; charset=utf-8" });
      return;
    }

    const event = JSON.parse(raw);
    const resource = event.resource || {};
    const eventType = String(event.event_type || "");

    if (eventType === "PAYMENT.CAPTURE.COMPLETED") {
      const orderId = resource.supplementary_data?.related_ids?.order_id;
      if (orderId) {
        const order = await paypalRequest("GET", `/v2/checkout/orders/${encodeURIComponent(orderId)}`);
        const record = await firestoreGet(ORDER_COLLECTION, orderId);
        await grantPayPalEntitlement(order, record?.email || "");
      }
      send(res, 200, JSON.stringify({ ok: true }), { "Content-Type": "application/json; charset=utf-8" });
      return;
    }

    if (["PAYMENT.CAPTURE.REFUNDED", "PAYMENT.CAPTURE.REVERSED", "PAYMENT.CAPTURE.DENIED"].includes(eventType)) {
      const record = await findPayPalTransaction(resource);
      if (record?.email) {
        const result = await revokeEntitlementForEmail(record.email, eventType, resource.id || event.id);
        send(res, 200, JSON.stringify({ ok: true, ...result }), { "Content-Type": "application/json; charset=utf-8" });
        return;
      }
      send(res, 200, JSON.stringify({ ok: true, ignored: true, reason: "transaction not found" }), { "Content-Type": "application/json; charset=utf-8" });
      return;
    }

    send(res, 200, JSON.stringify({ ok: true, ignored: true }), { "Content-Type": "application/json; charset=utf-8" });
  } catch (err) {
    console.error("paypal_webhook_failed", err.message);
    send(res, 500, JSON.stringify({ ok: false, error: "webhook failed" }), { "Content-Type": "application/json; charset=utf-8" });
  }
}

function accessForm(message = "") {
  const backHref = PRODUCT_PUBLIC_ENABLED
    ? "/ai-agent-audit-kit/"
    : PAYMENT_TEST_ENABLED
      ? "/sandbox/ai-agent-audit-kit/"
      : "/edition.html";
  return htmlPage(
    "Access The Digital Edition",
    `<h1>Access the digital edition</h1>
      <p>Enter the email address you used at PayPal checkout. If your payment is active, this browser will be unlocked.</p>
      ${message ? `<p><strong>${message}</strong></p>` : ""}
      <form method="post" action="/access">
        <p><input style="width:100%;box-sizing:border-box;padding:12px;border-radius:8px;border:1px solid #334;background:#11141b;color:#fff" type="email" name="email" placeholder="you@example.com" autocomplete="email" required></p>
        <p><button style="padding:10px 16px;border-radius:999px;border:0;background:#bdf4df;color:#07110d;font-weight:700" type="submit">Unlock edition</button></p>
      </form>
      <p><a href="${backHref}">Back</a></p>`
  );
}

function handleLogout(req, res) {
  if (!["GET", "POST", "HEAD"].includes(req.method || "")) {
    send(res, 405, "Method Not Allowed", { Allow: "GET, POST, HEAD", "Content-Type": "text/plain; charset=utf-8" });
    return;
  }
  clearSessionCookie(res);
  res.writeHead(303, { Location: "/access", "Cache-Control": "no-store" });
  res.end();
}

async function createSession(email, entitlement) {
  const token = randomBytes(32).toString("base64url");
  const sessionId = sha256(token);
  await firestoreSet(SESSION_COLLECTION, sessionId, {
    active: true,
    email,
    buyerId: emailId(email),
    transactionId: String(entitlement.transactionId || ""),
    createdAt: nowIso(),
    expiresAt: futureIso(SESSION_TTL_SECONDS),
  });
  return token;
}

async function sessionFromRequest(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const session = await firestoreGet(SESSION_COLLECTION, sha256(token));
  if (!session || !session.active) return null;
  if (session.expiresAt && new Date(session.expiresAt).getTime() < Date.now()) return null;
  const entitlement = await firestoreGet(ENTITLEMENT_COLLECTION, session.buyerId);
  if (!entitlement || !entitlement.active) return null;
  return { session, entitlement };
}

async function handleAccess(req, res) {
  if (req.method === "GET") {
    send(res, 200, accessForm(), { "Content-Type": "text/html; charset=utf-8" });
    return;
  }
  if (req.method !== "POST") {
    send(res, 405, "Method Not Allowed", { Allow: "GET, POST", "Content-Type": "text/plain; charset=utf-8" });
    return;
  }

  try {
    const raw = await readBody(req);
    const params = new URLSearchParams(raw);
    const email = String(params.get("email") || "").trim().toLowerCase();
    if (!validEmail(email)) {
      send(res, 400, accessForm("Enter a valid email."), { "Content-Type": "text/html; charset=utf-8" });
      return;
    }
    const entitlement = await firestoreGet(ENTITLEMENT_COLLECTION, emailId(email));
    if (!entitlement || !entitlement.active) {
      send(res, 403, accessForm("No active PayPal purchase found for that email yet."), { "Content-Type": "text/html; charset=utf-8" });
      return;
    }
    const token = await createSession(email, entitlement);
    setSessionCookie(res, token, req);
    res.writeHead(303, { Location: "/paid/edition.html", "Cache-Control": "no-store" });
    res.end();
  } catch (err) {
    console.error("access_failed", err.message);
    send(res, 500, accessForm("Access check failed. Try again in a minute."), { "Content-Type": "text/html; charset=utf-8" });
  }
}

function resolveStaticPath(pathname) {
  const decoded = decodeURIComponent(pathname);
  const normalized = normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  let filePath = join(DIST, normalized);
  if (!filePath.startsWith(DIST)) return null;
  if (existsSync(filePath) && statSync(filePath).isDirectory()) filePath = join(filePath, "index.html");
  if (!existsSync(filePath) && !extname(filePath)) filePath = join(filePath, "index.html");
  if (!existsSync(filePath)) return null;
  return filePath;
}

function protectedObjectPath(pathname) {
  let objectPath = pathname.replace(/^\/paid\/?/, "");
  if (!objectPath || objectPath === "/") objectPath = "edition.html";
  objectPath = objectPath.replace(/^\/+/, "");
  if (objectPath.endsWith("/")) objectPath += "index.html";
  if (!objectPath || objectPath.includes("..")) return null;
  return objectPath;
}

function publicKitObjectPath(pathname) {
  let objectPath = pathname.replace(/^\/kit\/?/, "");
  if (!objectPath || objectPath === "/") objectPath = "START-HERE.md";
  objectPath = objectPath.replace(/^\/+/, "");
  if (objectPath.endsWith("/")) objectPath += "START-HERE.md";
  if (!objectPath || objectPath.includes("..")) return null;
  return objectPath;
}

function publicKitFilePath(objectPath) {
  const normalizedObject = normalize(objectPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(PRODUCT_BUNDLE_ROOT, normalizedObject);
  if (!filePath.startsWith(PRODUCT_BUNDLE_ROOT)) return null;
  return filePath;
}

// ---------- markdown rendering for kit pages ----------

const KIT_NAV_LINKS = [
  ["Start here", "/kit/START-HERE.md", "What the kit is and how to use it."],
  ["Skill prompt", "/kit/ai-agent-audit/SKILL.md", "The installable ai-agent-audit skill."],
  ["Full rubric", "/kit/ai-agent-audit/references/50-laws-audit-rubric.md", "All 50 laws as an audit rubric."],
  ["Platform intake", "/kit/ai-agent-audit/assets/platform-intake.md", "Platform-specific evidence checklist."],
  ["Install guide", "/kit/ai-agent-audit/assets/install-codex-claude.md", "Install in Codex or Claude."],
  ["Copy-paste prompt", "/kit/ai-agent-audit/assets/copy-paste-audit-prompt.md", "Use without installable skill support."],
  ["Sample audit", "/kit/ai-agent-audit/assets/sample-audit.md", "Example output for a flawed support agent."],
  ["Intake checklist", "/kit/ai-agent-audit/assets/intake-checklist.md", "Gather prompts, tools, traces, and evals."],
  ["Report template", "/kit/ai-agent-audit/assets/audit-report-template.md", "Turn findings into a fix plan."],
];

function escHtml(s = "") {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function mdInline(text) {
  return escHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(?<!\w)\*(.+?)\*(?!\w)/g, "<em>$1</em>")
    .replace(/(?<!\w)_(.+?)_(?!\w)/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

function renderMarkdown(raw) {
  const md = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
  const lines = md.split(/\r?\n/);
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (/^```/.test(line)) {
      const lang = line.slice(3).trim();
      const code = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) { code.push(lines[i]); i++; }
      if (i < lines.length) i++;
      out.push(`<pre><code${lang ? ` class="language-${escHtml(lang)}"` : ""}>${escHtml(code.join("\n"))}</code></pre>`);
      continue;
    }

    // Heading
    const hm = line.match(/^(#{1,6})\s+(.+)/);
    if (hm) { out.push(`<h${hm[1].length}>${mdInline(hm[2])}</h${hm[1].length}>`); i++; continue; }

    // Horizontal rule
    if (/^(---+|\*\*\*+|___+)\s*$/.test(line)) { out.push("<hr>"); i++; continue; }

    // Blockquote
    if (/^>\s?/.test(line)) {
      const q = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { q.push(lines[i].replace(/^>\s?/, "")); i++; }
      out.push(`<blockquote>${renderMarkdown(q.join("\n"))}</blockquote>`);
      continue;
    }

    // Unordered list
    if (/^[-*+]\s/.test(line)) {
      out.push("<ul>");
      while (i < lines.length) {
        if (/^[-*+]\s/.test(lines[i])) {
          const text = lines[i].replace(/^[-*+]\s/, "");
          i++;
          const sub = [];
          while (i < lines.length && /^\s{2,}/.test(lines[i]) && lines[i].trim()) {
            if (/^\s{2,}[-*+]\s/.test(lines[i])) sub.push(lines[i].trim().replace(/^[-*+]\s/, ""));
            else sub.push(null); // continuation of parent
            i++;
          }
          if (sub.length && sub.some(s => s !== null)) {
            const nested = sub.filter(s => s !== null).map(s => `<li>${mdInline(s)}</li>`).join("");
            out.push(`<li>${mdInline(text)}<ul>${nested}</ul></li>`);
          } else {
            out.push(`<li>${mdInline(text)}</li>`);
          }
        } else if (!lines[i].trim()) {
          if (i + 1 < lines.length && (/^[-*+]\s/.test(lines[i + 1]) || /^\s{2,}/.test(lines[i + 1]))) { i++; } else break;
        } else break;
      }
      out.push("</ul>");
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      out.push("<ol>");
      while (i < lines.length) {
        if (/^\d+\.\s/.test(lines[i])) {
          const text = lines[i].replace(/^\d+\.\s/, "");
          i++;
          const sub = [];
          while (i < lines.length && /^\s{2,}/.test(lines[i]) && lines[i].trim()) {
            if (/^\s{2,}[-*+]\s/.test(lines[i])) sub.push(lines[i].trim().replace(/^[-*+]\s/, ""));
            else sub.push(null);
            i++;
          }
          if (sub.length && sub.some(s => s !== null)) {
            const nested = sub.filter(s => s !== null).map(s => `<li>${mdInline(s)}</li>`).join("");
            out.push(`<li>${mdInline(text)}<ul>${nested}</ul></li>`);
          } else {
            out.push(`<li>${mdInline(text)}</li>`);
          }
        } else if (!lines[i].trim()) {
          if (i + 1 < lines.length && (/^\d+\.\s/.test(lines[i + 1]) || /^\s{2,}/.test(lines[i + 1]))) { i++; } else break;
        } else break;
      }
      out.push("</ol>");
      continue;
    }

    // Empty line
    if (!line.trim()) { i++; continue; }

    // Paragraph
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|[-*+]\s|\d+\.\s|>\s?|---+$|\*\*\*+$|___+$)/.test(lines[i])) {
      para.push(lines[i]); i++;
    }
    if (para.length) out.push(`<p>${mdInline(para.join(" "))}</p>`);
  }

  return out.join("\n");
}

function kitPageTitle(objectPath, rendered) {
  const h1 = rendered.match(/<h1>([^<]+)<\/h1>/);
  if (h1) return h1[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
  const name = objectPath.split("/").pop().replace(/\.md$/, "").replace(/[-_]/g, " ");
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function kitBreadcrumb(objectPath) {
  const fileName = objectPath.split("/").pop();
  return `<a href="/">Home</a>
    <span aria-hidden="true">\u203a</span>
    <a href="/ai-agent-audit-kit/">Audit Kit</a>
    <span aria-hidden="true">\u203a</span>
    <span aria-current="page">${escHtml(fileName)}</span>`;
}

function kitPageHtml(objectPath, rawContent) {
  const rendered = renderMarkdown(rawContent);
  const title = kitPageTitle(objectPath, rendered);
  const currentHref = `/kit/${objectPath}`;
  const navMark = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12h4l2.4-7 4.2 14 2.4-7H21"/></svg>';
  const arrow = '<svg class="arw" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg>';

  const kitLinksHtml = KIT_NAV_LINKS
    .map(([label, href, note]) => {
      const active = href === currentHref ? ' class="kit__link--active"' : "";
      return `        <a href="${href}"${active}><span>${escHtml(label)}</span><small>${escHtml(note)}</small></a>`;
    })
    .join("\n");

  const body = rendered.replace(/<h1>[^<]*<\/h1>\n?/, "");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(title)} \u00b7 AI Agent Audit Kit | Laws of AI Agents</title>
  <meta name="description" content="${escHtml(title)}, part of the AI Agent Audit Kit from Laws of AI Agents.">
  <meta name="robots" content="index, follow">
  <meta name="theme-color" content="#0b0c10">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;450;500;600&family=JetBrains+Mono:wght@500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/edition.css">
  <link rel="stylesheet" href="/law.css">
  <link rel="stylesheet" href="/nav.css">
  <style>
.kit__body{margin-top:8px}
.kit__body p{margin:10px 0;line-height:1.7}
.kit__body h2{font-family:var(--serif);font-weight:500;font-size:clamp(22px,3.5vw,28px);letter-spacing:-.01em;margin-top:32px;margin-bottom:8px}
.kit__body h3{font-family:var(--serif);font-weight:500;font-size:clamp(17px,2.5vw,21px);margin-top:24px;margin-bottom:6px}
.kit__body h4{font-family:var(--mono);font-size:13px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--accent);margin-top:20px;margin-bottom:4px}
.kit__body ul,.kit__body ol{margin:10px 0;padding-left:24px}
.kit__body li{margin:5px 0;line-height:1.6}
.kit__body li ul{margin:4px 0 4px 0}
.kit__body code{font-family:var(--mono);font-size:.88em;background:color-mix(in srgb,var(--accent) 12%,var(--card));padding:2px 6px;border-radius:4px;color:var(--text)}
.kit__body pre{margin:14px 0;padding:16px 18px;border-radius:10px;border:1px solid var(--border);background:var(--card);overflow-x:auto;line-height:1.55}
.kit__body pre code{background:none;padding:0;font-size:13px;color:var(--dim)}
.kit__body blockquote{margin:14px 0;padding:12px 18px;border-left:3px solid var(--accent);background:color-mix(in srgb,var(--accent) 6%,transparent);border-radius:0 8px 8px 0}
.kit__body blockquote p{margin:4px 0;color:var(--dim)}
.kit__body hr{border:none;border-top:1px solid var(--border);margin:28px 0}
.kit__body a{color:var(--accent);text-decoration:underline;text-underline-offset:3px}
.kit__body a:hover{color:var(--text)}
.kit__body strong{color:var(--text);font-weight:600}
.kit__actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:32px;padding-top:24px;border-top:1px solid var(--border)}
.kit__btn{font-family:var(--mono);font-size:13px;border-radius:99px;padding:10px 18px;display:inline-flex;align-items:center;gap:7px;transition:transform .2s var(--ease),opacity .2s;cursor:pointer;border:none}
.kit__btn--copy{color:#0a0b0f;background:var(--text)}
.kit__btn--copy:hover{transform:translateY(-1px);opacity:.92}
.kit__btn--copy.is-copied{background:#5ed3a8}
.kit__btn--dl{color:var(--text);background:transparent;border:1px solid var(--border);text-decoration:none}
.kit__btn--dl:hover{border-color:var(--dim);transform:translateY(-1px)}
.kit__sibling{margin-top:32px;padding-top:24px;border-top:1px solid var(--border)}
.kit__sibling h2{font-family:var(--serif);font-weight:500;font-size:20px;margin-bottom:12px}
.kit__sibling nav{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.kit__sibling a{display:block;min-height:60px;border:1px solid var(--border);border-radius:8px;background:color-mix(in srgb,#14161d 82%,transparent);padding:12px;transition:border-color .2s,background .2s,transform .2s var(--ease);text-decoration:none}
.kit__sibling a:hover{border-color:var(--accent);background:var(--card-hover);transform:translateY(-1px)}
.kit__sibling a.kit__link--active{border-color:color-mix(in srgb,#5ed3a8 50%,var(--border));background:color-mix(in srgb,#5ed3a8 10%,var(--card))}
.kit__sibling span{display:block;font-family:var(--mono);font-size:12px;color:var(--text);font-weight:600}
.kit__sibling small{display:block;margin-top:4px;color:var(--dim);font-size:12px;line-height:1.35}
@media(max-width:720px){.kit__sibling nav{grid-template-columns:1fr}}
  </style>
</head>
<body class="ed law">
  <div class="grain" aria-hidden="true"></div>
  <a class="skip" href="#main">Skip to content</a>
  <header class="nav" id="nav">
    <div class="nav__in">
      <a class="nav__brand" href="/" aria-label="Laws of AI Agents, home">
        <span class="nav__mark">${navMark}</span>
        <span class="nav__brandtx">Laws of AI Agents</span>
      </a>
      <nav class="nav__links" aria-label="Primary">
        <a class="nav__link" href="/#main">All laws</a>
        <a class="nav__link is-active" href="/ai-agent-audit-kit/">Audit kit</a>
        <a class="nav__link" href="/edition.html">Digital edition</a>
        <a class="nav__link" href="/#references">Sources</a>
      </nav>
      <a class="nav__cta" href="/ai-agent-audit-kit/">Audit your agent ${arrow}</a>
    </div>
  </header>

  <nav class="crumb" aria-label="Breadcrumb">
    ${kitBreadcrumb(objectPath)}
  </nav>

  <article class="law__page" id="main" style="--ac:#5ed3a8">
    <header class="law__hero">
      <p class="law__eyebrow">Audit Kit \u00b7 Free during launch</p>
      <h1 class="law__title">${escHtml(title)}</h1>
    </header>

    <section class="law__body kit__body">
${body}
    </section>

    <div class="kit__actions">
      <button class="kit__btn kit__btn--copy" id="copyBtn" type="button">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        Copy markdown
      </button>
      <a class="kit__btn kit__btn--dl" href="${escHtml(currentHref)}?raw">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        View raw
      </a>
      <a class="kit__btn kit__btn--dl" href="/kit.zip">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Download zip
      </a>
    </div>

    <section class="kit__sibling">
      <h2>All kit files</h2>
      <nav aria-label="Audit kit files">
${kitLinksHtml}
      </nav>
    </section>
  </article>

  <button class="backtop" id="backtop" type="button" aria-label="Back to top">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg>
  </button>

  <script>
  (function(){
    var btn=document.getElementById('copyBtn');
    if(btn) btn.addEventListener('click',function(){
      fetch(location.pathname+'?raw').then(function(r){return r.text();}).then(function(t){
        return navigator.clipboard.writeText(t);
      }).then(function(){
        btn.classList.add('is-copied');
        btn.innerHTML='<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Copied!';
        setTimeout(function(){
          btn.classList.remove('is-copied');
          btn.innerHTML='<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy markdown';
        },2000);
      });
    });
    var nav=document.getElementById('nav'),bt=document.getElementById('backtop');
    function s(){var y=window.scrollY||0;if(nav)nav.classList.toggle('is-scrolled',y>8);if(bt)bt.classList.toggle('is-on',y>560);}
    window.addEventListener('scroll',s,{passive:true});s();
    if(bt) bt.addEventListener('click',function(){window.scrollTo({top:0,behavior:'smooth'});});
  })();
  </script>
</body>
</html>`;
}

function serveFilePath(req, res, filePath, { privateCache = false } = {}) {
  const ext = extname(filePath);
  const headers = {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control": privateCache ? "private, no-store" : "public, max-age=300",
  };
  res.writeHead(200, headers);
  if (req.method === "HEAD") res.end();
  else createReadStream(filePath).pipe(res);
}

function localProtectedFilePath(objectPath) {
  const normalizedObject = normalize(objectPath).replace(/^(\.\.[/\\])+/, "");
  const base = normalizedObject.startsWith("kit/")
    ? PRODUCT_BUNDLE_ROOT
    : DIST;
  let rel = normalizedObject.startsWith("kit/")
    ? normalizedObject.slice("kit/".length)
    : normalizedObject;
  if (!normalizedObject.startsWith("kit/") && normalizedObject === "edition.html" && existsSync(join(DIST, "paid-edition.html"))) {
    rel = "paid-edition.html";
  }
  const filePath = join(base, rel);
  if (!filePath.startsWith(base)) return null;
  return filePath;
}

function rewriteProtectedHtml(html) {
  return html
    .replace(/<link rel="canonical" href="https:\/\/laws\.deleg8\.dev\/edition\.html" \/>/, '<meta name="robots" content="noindex, nofollow" />')
    .replaceAll('href="/edition.html"', 'href="/paid/edition.html"')
    .replaceAll('href="edition.html"', 'href="/paid/edition.html"')
    .replaceAll('href="edition.css"', 'href="/paid/edition.css"')
    .replaceAll('href="nav.css"', 'href="/paid/nav.css"')
    .replaceAll('href="favicon.svg"', 'href="/favicon.svg"')
    .replaceAll('src="assets/edition/', 'src="/paid/assets/edition/');
}

async function protectedGcsObject(objectPath) {
  const token = await googleAccessToken();
  const encoded = encodeURIComponent(objectPath).replaceAll("%2F", "/");
  const response = await fetch(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(PROTECTED_BUCKET)}/o/${encoded}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`GCS object failed: ${response.status} ${response.statusText}`);
  }
  return response;
}

async function serveProtectedFile(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const objectPath = protectedObjectPath(url.pathname);
  if (!objectPath) {
    send(res, 404, "Not Found", { "Content-Type": "text/plain; charset=utf-8" });
    return;
  }

  const ext = extname(objectPath);
  const headers = {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control": "private, no-store",
  };

  if (PROTECTED_BUCKET) {
    const object = await protectedGcsObject(objectPath);
    if (!object) {
      send(res, 404, "Not Found", { "Content-Type": "text/plain; charset=utf-8" });
      return;
    }
    if (ext === ".html") {
      const html = rewriteProtectedHtml(await object.text());
      send(res, 200, html, headers);
      return;
    }
    res.writeHead(200, headers);
    if (req.method === "HEAD") res.end();
    else Readable.fromWeb(object.body).pipe(res);
    return;
  }

  const localPath = localProtectedFilePath(objectPath);
  if (!localPath || !existsSync(localPath)) {
    send(res, 404, "Not Found", { "Content-Type": "text/plain; charset=utf-8" });
    return;
  }
  if (ext === ".html") {
    const html = rewriteProtectedHtml(readFileSync(localPath, "utf8"));
    send(res, 200, html, headers);
    return;
  }
  serveFilePath(req, res, localPath, { privateCache: true });
}

function servePublicKit(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (url.pathname === "/kit.zip") {
    if (!existsSync(PRODUCT_RELEASE_ZIP)) {
      send(res, 404, "Not Found", { "Content-Type": "text/plain; charset=utf-8" });
      return;
    }
    serveFilePath(req, res, PRODUCT_RELEASE_ZIP);
    return;
  }

  const objectPath = publicKitObjectPath(url.pathname);
  if (!objectPath) {
    send(res, 404, "Not Found", { "Content-Type": "text/plain; charset=utf-8" });
    return;
  }
  const filePath = publicKitFilePath(objectPath);
  if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
    send(res, 404, "Not Found", { "Content-Type": "text/plain; charset=utf-8" });
    return;
  }

  if (extname(filePath) === ".md" && !url.searchParams.has("raw")) {
    const rawContent = readFileSync(filePath, "utf8");
    const html = kitPageHtml(objectPath, rawContent);
    send(res, 200, html, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" });
    return;
  }

  serveFilePath(req, res, filePath);
}

async function handlePaid(req, res) {
  if (req.method === "GET" && (req.url === "/paid" || req.url === "/paid/")) {
    res.writeHead(303, { Location: "/paid/edition.html", "Cache-Control": "no-store" });
    res.end();
    return;
  }
  const access = await sessionFromRequest(req);
  if (!access) {
    clearSessionCookie(res);
    res.writeHead(303, { Location: "/access", "Cache-Control": "no-store" });
    res.end();
    return;
  }
  await serveProtectedFile(req, res);
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (url.pathname === "/edition.html" || url.pathname === "/edition") {
    if (FREE_EDITION_ENABLED && url.pathname === "/edition") {
      res.writeHead(303, { Location: "/edition.html", "Cache-Control": "public, max-age=300" });
      res.end();
      return;
    }
    if (!FREE_EDITION_ENABLED) {
      res.writeHead(303, { Location: "/access", "Cache-Control": "no-store" });
      res.end();
      return;
    }
  }
  if (!PRODUCT_PUBLIC_ENABLED && (url.pathname === "/ai-agent-audit-kit" || url.pathname.startsWith("/ai-agent-audit-kit/"))) {
    res.writeHead(303, { Location: "/edition.html", "Cache-Control": "public, max-age=300" });
    res.end();
    return;
  }
  if (url.pathname === "/paid-edition.html" || (url.pathname.startsWith("/sandbox/") && !PAYMENT_TEST_ENABLED)) {
    send(res, 404, "Not Found", { "Content-Type": "text/plain; charset=utf-8" });
    return;
  }
  const filePath = resolveStaticPath(url.pathname);
  if (!filePath) {
    send(res, 404, "Not Found", { "Content-Type": "text/plain; charset=utf-8" });
    return;
  }
  const ext = extname(filePath);
  const immutable = [".css", ".js", ".png", ".jpg", ".jpeg", ".webp", ".svg", ".ico"].includes(ext);
  const headers = {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "public, max-age=300",
  };
  if (url.pathname.startsWith("/sandbox/")) headers["X-Robots-Tag"] = "noindex, nofollow";
  res.writeHead(200, headers);
  if (req.method === "HEAD") res.end();
  else createReadStream(filePath).pipe(res);
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (url.pathname === "/healthz") {
      send(res, 200, "ok", { "Content-Type": "text/plain; charset=utf-8" });
      return;
    }

    if (url.pathname === "/api/newsletter") {
      await handleNewsletter(req, res);
      return;
    }

    if (url.pathname === "/api/paypal/config") {
      await handlePaypalConfig(req, res);
      return;
    }

    if (url.pathname === "/api/paypal/create-order") {
      await handlePaypalCreateOrder(req, res);
      return;
    }

    if (url.pathname === "/api/paypal/capture-order") {
      await handlePaypalCaptureOrder(req, res);
      return;
    }

    if (url.pathname === "/api/paypal/webhook") {
      await handlePaypalWebhook(req, res);
      return;
    }

    if (url.pathname === "/access") {
      await handleAccess(req, res);
      return;
    }

    if (url.pathname === "/logout") {
      handleLogout(req, res);
      return;
    }

    if (url.pathname === "/paid" || url.pathname.startsWith("/paid/")) {
      if (!["GET", "HEAD"].includes(req.method || "")) {
        send(res, 405, "Method Not Allowed", { Allow: "GET, HEAD", "Content-Type": "text/plain; charset=utf-8" });
        return;
      }
      await handlePaid(req, res);
      return;
    }

    if (url.pathname === "/kit.zip" || url.pathname === "/kit" || url.pathname.startsWith("/kit/")) {
      if (!["GET", "HEAD"].includes(req.method || "")) {
        send(res, 405, "Method Not Allowed", { Allow: "GET, HEAD", "Content-Type": "text/plain; charset=utf-8" });
        return;
      }
      servePublicKit(req, res);
      return;
    }

    if (!["GET", "HEAD"].includes(req.method || "")) {
      send(res, 405, "Method Not Allowed", { Allow: "GET, HEAD, POST", "Content-Type": "text/plain; charset=utf-8" });
      return;
    }

    serveStatic(req, res);
  } catch (err) {
    console.error("request_failed", err.message);
    if (!res.headersSent) {
      send(res, 500, "Server Error", { "Content-Type": "text/plain; charset=utf-8" });
    } else {
      res.end();
    }
  }
}).listen(PORT, () => {
  console.log(`laws-of-ai server listening on :${PORT}`);
  if (LOCAL_ACCESS_STORE) console.log(`using local paid access store: ${LOCAL_ACCESS_STORE}`);
});
