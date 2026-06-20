# Laws of AI Agents

A clean, slick, **SEO-optimized** card site of hard-won heuristics for building AI agents — field notes, not theorems. Inspired by the format of [Laws of UX](https://lawsofux.com).

**Live:** https://laws.deleg8.dev

---

## What this is

A static, data-driven card deck. Every law lives in [`data/laws.json`](data/laws.json):
adding a new law is a one-line append to the `laws` array — no code changes.

A tiny zero-dependency build step ([`build.mjs`](build.mjs)) pre-renders that data into a
fully crawlable static site, so search engines and social cards see real content (not an
empty JS shell).

```
data/laws.json     # ← the content + site SEO metadata. edit this.
src/
  styles.css       # the whole design system
  app.js           # progressive enhancement: filters, modal, #deep-links
  favicon.svg
  og-image.png     # 1200x630 social share image
build.mjs          # reads data/ + src/ -> emits dist/
dist/              # generated (gitignored): index.html, sitemap.xml, robots.txt, ...
```

### Adding a law

Append an object to `laws` in `data/laws.json`, then rebuild:

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

`category` must match a `categories[].id`
(`context-reliability`, `scope-design`, `trust-coordination`).

---

## SEO

Built in, regenerated on every build from the data:

- **Pre-rendered HTML** — all laws are real `<article>` elements in the initial markup,
  crawlable with zero JS. Principle + takeaway text ships in the DOM.
- **JSON-LD structured data** — `WebSite` + `DefinedTermSet` (each law a `DefinedTerm`) +
  `ItemList`, so Google can read the deck as structured content.
- **Full meta** — description, keywords, author, canonical, robots, theme-color.
- **Open Graph + Twitter Card** — with a generated 1200×630 `og-image.png`.
- **`sitemap.xml`** — home + a deep link per law. **`robots.txt`** points to it.
- **Shareable deep links** — every law has a stable `#slug`; the modal opens from the URL
  hash and updates it (`laws.deleg8.dev/#the-escape-hatch-law`).
- **Semantic, accessible markup** — proper heading hierarchy, landmarks, ARIA.

---

## Run locally

```bash
node build.mjs                       # generates dist/
cd dist && python3 -m http.server 8080
# open http://localhost:8080
```

Or build the production container (nginx on :8080, exactly what Cloud Run runs):

```bash
docker build -t laws-of-ai .
docker run --rm -p 8080:8080 laws-of-ai
```

---

## Deploy

Hosted on **Google Cloud Run** (`deleg8-dev`, region `us-central1`), scale-to-zero
(`min-instances=0`, `max-instances=1`), fronted by Cloudflare DNS at `laws.deleg8.dev`.
The Dockerfile runs `build.mjs` in a Node stage, then serves `dist/` with nginx.

### Automatic (CI/CD)

Every push to `main` triggers [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml),
which builds from source and deploys to Cloud Run. Requires one repo secret:

- `GCP_SA_KEY` — JSON key for a deployer service account on `deleg8-dev`.

### Manual (first deploy / from your machine)

```bash
./scripts/deploy.sh        # deploy + domain mapping + Cloudflare DNS
./scripts/setup-ci.sh      # one-time: deployer SA + GCP_SA_KEY secret
```

---

## Design notes

- Dark, editorial aesthetic — `Fraunces` (display serif) over `Inter` (UI sans).
- Three categories, each with an accent color, drawn straight from the data.
- Cards rise in on load, lift on hover; click opens a detail modal (Esc / backdrop to close).
- Zero runtime dependencies. Loads instantly, scales to zero.

Inspired by the format of [Laws of UX](https://lawsofux.com) by Jon Yablonski.
