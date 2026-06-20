# Laws of AI Agents

A clean, slick card site of hard-won heuristics for building AI agents — field notes, not theorems. Inspired by the format of [Laws of UX](https://lawsofux.com).

**Live:** https://laws.deleg8.dev

---

## What this is

A static, data-driven card deck. Every law lives in [`public/laws.json`](public/laws.json):
adding a new law is a one-line append to the `laws` array — no code changes, no rebuild logic.

```
public/
  index.html     # markup shell
  styles.css     # the whole design system
  app.js         # renders cards + modal from laws.json
  laws.json      # ← the content. edit this to add/change laws
  favicon.svg
```

### Adding a law

Append an object to `laws` in `public/laws.json`:

```json
{
  "number": 11,
  "name": "Your New Law",
  "category": "context-reliability",
  "tagline": "One punchy sentence.",
  "principle": "Why it's true, from experience.",
  "takeaway": "What to do about it."
}
```

`category` must match one of the `categories[].id` values
(`context-reliability`, `scope-design`, `trust-coordination`). Add a new category to that
array if you need one.

---

## Run locally

Any static server works:

```bash
cd public && python3 -m http.server 8080
# open http://localhost:8080
```

Or build the production container (nginx on :8080, same as Cloud Run):

```bash
docker build -t laws-of-ai .
docker run --rm -p 8080:8080 laws-of-ai
```

---

## Deploy

Hosted on **Google Cloud Run** (`deleg8-dev`, region `us-central1`), scale-to-zero
(`min-instances=0`, `max-instances=1`), fronted by Cloudflare DNS at `laws.deleg8.dev`.

### Automatic (CI/CD)

Every push to `main` triggers [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml),
which builds from source and deploys to Cloud Run. Requires one repo secret:

- `GCP_SA_KEY` — a JSON key for a service account with `roles/run.admin`,
  `roles/cloudbuild.builds.editor`, `roles/artifactregistry.writer`, and
  `roles/iam.serviceAccountUser` on `deleg8-dev`.

### Manual (first deploy / from your machine)

```bash
./scripts/deploy.sh
```

This deploys the service and (idempotently) sets up the Cloud Run domain mapping and the
Cloudflare DNS records for `laws.deleg8.dev`.

---

## Design notes

- Dark, editorial aesthetic — `Fraunces` (display serif) over `Inter` (UI sans).
- Three categories, each with an accent color, drawn straight from the data.
- Cards rise in on load, lift on hover; click opens a detail modal (Esc / backdrop to close).
- Zero framework, zero build step, zero JS dependencies. Loads instantly, scales to zero.

Inspired by the format of [Laws of UX](https://lawsofux.com) by Jon Yablonski.
