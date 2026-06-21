# AI Agent Audit Kit Launch Runbook

## Goal

Launch one paid offer:

**AI Agent Audit Kit: 50 Laws Edition**

**Price:** $14.90
**Primary CTA:** Get the kit

The free newsletter stays free. The paid kit is the validation product.

## The Simple Story

I built this after building and reviewing many AI agents. The same failures kept showing up: the model was not the only problem. The agent broke because context was stale, tools were vague, retrieval missed the right facts, evals were missing, permissions were too broad, or nobody designed the handoff when the agent got stuck.

Agents are becoming an interface to real work. They read, decide, call tools, write into systems, and affect customers. A demo can look impressive while the system underneath is fragile.

This bundle turns the 50 Laws of AI Agents into a practical audit workflow. It helps builders inspect their agent before users, clients, or production traffic expose the weak points.

## What Buyers Get

- Installable `ai-agent-audit` skill.
- Full 50-law audit rubric.
- Extra worked examples.
- Agent audit intake checklist.
- Audit report template.
- Copy-paste audit prompt for users outside Codex/Claude.
- Sample audit of a broken agent.
- Protected access to the illustrated online digital edition.

No PDF is included. The digital edition stays online behind buyer access so we avoid distributing a single leakable book file.

## Product Page Copy

### Title

AI Agent Audit Kit: 50 Laws Edition

### Short Description

A field-tested bundle for builders who want AI agents that produce real results: installable audit skill, 50-law rubric, templates, examples, sample audit, and protected access to the illustrated digital edition.

### Long Description

Most AI agent failures do not come from the model alone.

They come from stale context, vague tools, weak retrieval, missing evals, unsafe permissions, bad handoffs, and systems that look complete before they are actually reliable.

I created this kit after building and reviewing many agent systems and seeing the same failure modes repeat. The AI Agent Audit Kit turns the online 50 Laws of AI Agents edition into a practical workflow you can run against an agent you are building.

Use it to inspect prompts, tools, retrieval, memory, evals, traces, security boundaries, and human handoffs. The output is a prioritized list of what is likely to break, why it matters, how to fix it, and how to verify the fix.

Included:

- Installable `ai-agent-audit` skill.
- Full 50-law audit rubric.
- Extra worked examples.
- Intake checklist.
- Audit report template.
- Copy-paste audit prompt.
- Sample audit of a broken agent.
- Protected access to the illustrated online digital edition.

No PDF is included. This is not a generic prompt pack or ebook download. It is a structured audit workflow plus a protected online edition for people building agents that need to do real work.

### Price

$14.90

### Buyer Access Copy

After checkout, tell buyers:

1. Open the protected edition: `https://laws.deleg8.dev/access`
2. Use the same email address they used at checkout.
3. Install the audit skill from the GitHub repo path or release link once published.

Do not distribute a PDF. The PayPal capture flow unlocks `/access` directly.

## Credentials And Values I Need From You

Put these into `.env.local` locally, or give them to me in chat if you want me to drive the setup during the session.

Use `marketing/offer.env.example` as the template.

### Required For Paid Checkout

- `PAYPAL_CLIENT_ID`: public PayPal REST app client id.
- `PAYPAL_CLIENT_SECRET`: server-side PayPal REST app secret.
- `PAYPAL_MODE`: `sandbox` first, then `live`.
- `PAYPAL_WEBHOOK_ID`: optional; `scripts/deploy.sh` can create/reuse the webhook and pass the id into Cloud Run.

### Required For Newsletter

Use one of these:

- `KIT_FORM_ACTION` and `KIT_EMAIL_FIELD`, if you copy them from Kit's embedded form.
- `KIT_FORM_ID` and `KIT_V3_PUBLIC_API_KEY`, if we use Kit's legacy public API subscribe endpoint.

Do not put `KIT_API_SECRET` or a Kit V4 API key into the static site. V4 keys are for local/server-side automation only.

If you give me a Kit V4 key, I can use it locally to inspect account resources and the deployed Cloud Run service can use it server-side through `/api/newsletter`. The key must never be embedded in generated HTML.

### PayPal Reality

The site uses PayPal direct checkout, not Payhip. The product page loads the PayPal JS SDK, calls `/api/paypal/create-order`, captures with `/api/paypal/capture-order`, then grants Firestore access and redirects to `/paid/edition.html`.

Webhook URL:

`https://laws.deleg8.dev/api/paypal/webhook`

Required webhook events:

- `PAYMENT.CAPTURE.COMPLETED`
- `PAYMENT.CAPTURE.REFUNDED`
- `PAYMENT.CAPTURE.REVERSED`
- `PAYMENT.CAPTURE.DENIED`

## Apply Config

From the repo root:

```bash
cp marketing/offer.env.example .env.local
# edit .env.local with the real public values
node scripts/apply-offer-config.mjs --dry-run
node scripts/apply-offer-config.mjs
node build.mjs
node scripts/build-product-kit.mjs
```

The script updates:

- `site.product.checkoutProvider`
- `site.product.price`
- `site.newsletter.action`
- `site.newsletter.field`
- optional public Kit hidden field for `api_key`

If `KIT_FORM_ID` and `KIT_V4_API_KEY` are present, the script sets the public form action to `/api/newsletter`. `scripts/deploy.sh` stores the V4 key in Secret Manager and mounts it into Cloud Run.
`scripts/deploy.sh` also stores `PAYPAL_CLIENT_SECRET` in Secret Manager, creates/reuses the PayPal webhook, creates/checks Firestore, uploads the protected edition to GCS, and configures Cloud Run with the entitlement settings.

## Local Test

```bash
node server.mjs
```

Open:

`http://localhost:8080/ai-agent-audit-kit/`

Check:

- CTA jumps to the on-page PayPal checkout.
- PayPal buttons render after the checkout email field.
- Newsletter form posts to Kit.
- Product page copy renders cleanly.
- Sitemap includes `/ai-agent-audit-kit/`.
- Public `/edition.html` redirects to `/access`.
- A sandbox PayPal capture grants local access to `/paid/edition.html`.

## Deploy

```bash
CF_API_EMAIL=sabirmgds@gmail.com CF_API_KEY=$(cat ~/.cloudflare-token) bash scripts/deploy.sh
```

After deploy:

- Open `https://laws.deleg8.dev/ai-agent-audit-kit/`.
- Click the paid CTA.
- Submit a real newsletter test email.
- Run a PayPal sandbox checkout.
- Switch to live credentials/mode only after sandbox works.
- Confirm `https://laws.deleg8.dev/access` unlocks with the checkout email.

## Validation Target

Do not add tiers before this is proven.

Minimum validation signal:

- 1,000 targeted visits.
- 50+ newsletter signups.
- 5-10 purchases.
- At least 2 buyer replies saying the kit helped them find or fix an agent issue.
