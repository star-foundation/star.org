# Star.org — a publicly verifiable star claim service (MVP)

**English** · [中文](README.zh-CN.md)

Claim a real star and receive a PDF certificate carrying real astronomical data plus a
permanent link. Every claim is written to a public registry, so **anyone can verify for
themselves that a star has been claimed only once**.

> **Positioning: the sale is the means, the structure is the end.**
> Star.org does not sell stars, and is not merely a commemorative keepsake shop — it aims to build a verifiable, permanently citable, openly inspectable structure for "what humanity has recorded."
> Claiming a star is the first kind of record on that structure, and currently its only source of funding; **neither the product's form nor the compliance framework changes**.
> Three boundaries: (1) **we do not hold the information, we only register and trace it** — a registrar, not an owner; (2) **information with no owner can be carried, information with an owner requires consent** — the sky and the physical Earth have no owner, while a mind's information does and can only be registered by that mind or with its consent (see §4.4 of the philosophy document); (3) **the product is a keepsake, the structure is a public good** — what you pay for is a commemorative claim record, while the registry, data format and whitepaper are public, login-free and freely citable.
> The full argument is in `docs/Star.org-Core-Philosophy.md` §8.

This repository is a runnable implementation of the fully GitHub-hosted plan in the
*Star.org MVP Technical Requirements v0.4*: no self-hosted server, no separate database,
no Vercel or Supabase. Everything is compressed into the GitHub ecosystem — GitHub Pages
plus GitHub Actions — with only two external dependencies: Lemon Squeezy (payments) and an
email provider (both have free tiers).

The public site is bilingual. **English is the default**, with a client-side switch to
Chinese that does not change the URL (so permanent links stay stable); the marketing pages
carry both languages, and star pages also get a Chinese-default entry at `/zh/s/{slug}/`.

---

## 1. What it delivers

| Module | Implementation | Reference |
|---|---|---|
| Star pool | `data/stars_pool.json` — 800 real stars from the HYG catalogue (magnitude −1.44 to 4.4) | Tech 4.1 |
| Allocation and duplicate checking | `scripts/allocate.mjs` — uniform random pick, mkdir atomic lock, pool re-read under lock, deterministic idempotent slug | Tech 4.2 / TC-ALLOC-01~08 |
| Landing page | `site/index.html` — value proposition, philosophy section, trust section, live sample, purchase entry, FAQ | PRD 4.1 / TC-LP-01~05 |
| PDF certificate | `templates/certificate.html` rendered by headless Chrome → `certificates/{slug}.pdf` | Tech 4.5 / TC-PDF-01~05 |
| Permanent link page | `/s/{slug}/` per claim, with an OG card and share buttons | Tech 4.6 / TC-PAGE-01~05 |
| OG share image | `scripts/lib/artifacts.mjs` renders a 1200×630 PNG → `og/{slug}.png` | Tech 4.6 |
| Public registry | `/registry/` + `data/registrations/*.json` + `data/registry-index.json` | Tech 4.7 / TC-REG-01~05 |
| Email notification | `scripts/lib/email.mjs` (Resend / Postmark; writes to `outbox/` when unconfigured) | Tech 4.8 / TC-MAIL-01~04 |
| Bilingual copy | `site/i18n/{en,zh}.json` — all UI text, with key sets enforced to match (see `DECISIONS.md` D9) | — |
| Bundled CJK fonts | `fonts/` — a ~12.5MB trimmed subset, so rendering does not depend on the runner | `DECISIONS.md` D10 |
| Failure handling | Sold-out alerts, failure alerts, manual re-issue, order reconciliation | PRD 6 / TC-ERR-01~04 |
| Compliance controls | `scripts/check-compliance.mjs` scans banned wording and payment channels; CI enforces it | Tech 5 / TC-COMP-01~04 |
| Philosophy page | `/philosophy/` — all five core ideas plus whitepaper (PDF) downloads; also linked from the landing hero and the nav | TC-PHIL-01~05 |
| Philosophy whitepaper | `docs/whitepaper/*.tex` (TeX source) → `site/assets/whitepaper/*.pdf` (Chinese + English, committed) | TC-PHIL-03 |

## 2. Architecture

```
Landing page (GitHub Pages)
   │ buy
   ▼
Lemon Squeezy hosted checkout (Merchant of Record, fiat only)
   │ webhook (payment succeeded)
   ▼
Zapier / Make (turns the webhook into a GitHub API call)
   │ repository_dispatch
   ▼
GitHub Actions (serialised by a concurrency group)
   ├─ allocate a star (lock + re-read pool; no overselling)
   ├─ render the PDF certificate and OG image
   ├─ write data/registrations/{slug}.json (commit)
   └─ send the email (certificate link + permanent link)
   │ commit
   ▼
GitHub Pages rebuilds → /s/{slug}/ goes live
```

## 3. Directory layout

```
data/stars_pool.json          star pool (with status: available / assigned)
data/registrations/*.json     public claim records (no personal data)
data/registry-index.json      public registry index (for the pages and external tools)
certificates/{slug}.pdf       certificates
og/{slug}.png                 OG share images
site/                         site sources (landing / registry / permanent / 404 / assets)
site/assets/whitepaper/        Philosophy whitepaper PDFs (zh + en; build output, committed)
docs/whitepaper/              Whitepaper TeX sources + build.sh (output goes to site/assets/whitepaper/)
site/i18n/{en,zh}.json        all UI copy (single source of truth)
fonts/                        bundled CJK font subset + manifest + OFL license
templates/                    certificate, OG image and email templates
scripts/                      build and business scripts (see below)
tests/                        automated tests (numbered after the test-case spec)
.github/workflows/            three pipelines: claim registration, deploy, verify
.github/actions/              shared composite actions
docs/                         product / technical / test docs, deploy and ops guides
```

## 4. Common commands

```bash
npm run build:pool       # rebuild the pool from the HYG catalogue (--input <csv> --limit 800 --max-mag 6.5)
npm run build:whitepaper # compile the philosophy whitepaper (zh + en) with xelatex → site/assets/whitepaper/
npm run allocate         # allocation only (order JSON on stdin)
npm run register         # full pipeline: allocate → certificate → OG image → record → email
npm run build:site       # build the static site into _site/
npm run serve            # preview _site/ locally
npm run demo             # one-command local demo (see section 5)
npm run verify           # registry self-check (duplicates / private fields / artifact hashes)
npm run check            # everything CI enforces: verify + compliance + secrets + launch readiness
npm test                 # full test suite (97 tests, including 3 rounds of the oversell concurrency test)
npm run test:concurrency # only the oversell concurrency test
node scripts/fetch-fonts.mjs --check   # verify bundled fonts match their manifest
node scripts/rerender-artifacts.mjs --dry-run    # re-render existing certificates/OG images in the site's current default language
node scripts/manual-order.mjs --order-id 123456 --name "For Anna" --email a@b.com   # manual re-issue
node scripts/reconcile.mjs                                                          # reconcile orphaned orders
```

The whole pipeline runs locally without any credentials: emails are written to `outbox/`,
and the site can be previewed with `npm run serve`.

## 5. Running locally

### 5.1 One-command demo (start here)

```bash
npm run demo
```

It does three things: runs a **real, complete claim** in a temporary sandbox (allocate a
star → render the certificate PDF and OG image → write the claim record → drop the email
on disk), builds the static site from that data, and starts a local preview.

Open http://127.0.0.1:4321/ to see the landing page, the public registry, and that claim's
permanent page, certificate PDF and share image. No email is actually sent
(`EMAIL_PROVIDER=outbox`); it is written to the sandbox's `outbox/` directory.

All demo data lives in a system temp directory (e.g. `/tmp/starorg-demo`) and **never
touches the repository's `data/registrations/`, `certificates/` or `og/`**, so you can run
it as often as you like.

Optional flags (note that everything after `--` is passed through to the script):

```bash
npm run demo -- --name "For Anna" --dedication "Happy birthday"   # change name and dedication
npm run demo -- --anonymous                                       # claim anonymously
npm run demo -- --keep                                            # keep the previous demo data and add another claim
npm run demo -- --port 5000                                       # use another port
npm run demo -- --no-serve                                        # generate only, do not start the preview
```

### 5.2 Site only (no claim data)

```bash
npm run build:site      # build _site/
npm run serve           # http://127.0.0.1:4321/
```

The registry is empty and the purchase entry shows "coming soon" (no checkout URL in
`site.config.json` yet). This is the fast loop for copy and styling work: edit files under
`site/`, re-run `npm run build:site`, then refresh.

### 5.3 Writing into the repository (simulating a real order)

```bash
STARORG_SLUG_SECRET=dev-secret EMAIL_PROVIDER=outbox \
  node scripts/manual-order.mjs --order-id LOCAL-1 --name "For Anna" --email a@b.com
npm run build:site && npm run serve
```

This really writes the record into `data/registrations/` and the certificate into
`certificates/`, which is how you verify the "repository as database" shape end to end.
Afterwards use `git status` to find and delete those demo files — do not commit them.

### 5.4 Tests and self-checks

```bash
npm test                # 97 tests, roughly 1-2 minutes (includes 3 rounds of the oversell concurrency test)
npm run check           # registry self-check + compliance scan + secrets scan + launch readiness
```

### 5.5 Requirements

- **Node ≥ 20** (the runner image ships Node 22). The repository has **zero npm
  dependencies**, so there is no `npm install`;
- **Google Chrome** for rendering the certificate PDF and OG image. If it lives somewhere
  non-standard, point `CHROME_PATH=/path/to/chrome` at it; the demo script tells you
  clearly when it is missing. Chinese fonts are **bundled** (`fonts/`), so nothing needs to
  be installed for CJK rendering;
- Optional: copy `.env.example` to `.env` and fill in the checkout URL and email keys. The
  scripts read process environment variables, so load it with
  `export $(grep -v '^#' .env | xargs)`.

### 5.7 Core philosophy and whitepaper

The intellectual source of the site lives in two same-source documents, and is now reflected in both the website and a PDF:

- `docs/Star.org-Core-Philosophy.md` (English) / `docs/Star.org-核心理念.md` (Chinese) — the full argument for the five core ideas;
- `docs/whitepaper/*.tex` → `site/assets/whitepaper/*.pdf` — the same content typeset as an A4 whitepaper, in Chinese and English.

The whitepaper is deliberately given the most prominent positions on the site, in three places:

1. **Landing page hero** — a core-philosophy entry button;
2. **Navigation bar** — `Philosophy` / `核心理念`;
3. **The `/philosophy/` page** — the whitepaper download card sits **above** the five ideas, in the first screen of body content.

It is compiled with `xelatex` using the repository's bundled Noto Sans/Serif SC subsets (`fonts/`), so no CJK font needs to be installed locally (the same approach as certificate rendering — see `DECISIONS.md` D10). CI does not guarantee a TeX installation, so **the PDFs are committed as deliverables** and `npm run build:site` merely copies them into `_site/`:

```bash
npm run build:whitepaper   # requires xelatex locally; regenerate after editing the .tex sources
```

The whitepaper PDFs deliberately use phrasing such as "makes nothing into a financial product." They belong to `docs/` and to the typeset artifact, whereas the compliance scan targets the site's public copy (html/txt/json/css/js/xml/svg under `site/**`); `docs/` and `.tex` files were never in scope, because those files must be able to discuss those very words.

## 6. Deployment

See `docs/DEPLOY.md` for the step-by-step path (Lemon Squeezy → Zapier → GitHub Secrets →
domain). Day-to-day operations, manual re-issues, sold-out handling and privacy enforcement
are in `docs/OPERATIONS.md`.

For progress tracking, open `docs/star-org-checklist.html` in a browser. Its checked state
reflects the repository's real implementation status, and every item names the file or test
case behind it; the "next steps" panel at the top summarises what still needs a human
(external accounts, real payments, real domain).

## 7. Design decisions worth knowing

Behavior that is easy to misread lives in `docs/DECISIONS.md`. The most relevant ones:

- **D8 — allocation is uniformly random**, not brightest-first. Every claim has the same
  chance and nobody can predict which star they will get. The pool file is still ordered by
  magnitude, but only for browsing; it no longer drives allocation.
- **D9 — bilingual site with client-side switching.** UI copy lives only in
  `site/i18n/{en,zh}.json`; templates contain `{{t.key}}` and nothing else. A build fails
  if the two catalogs disagree on keys, and tests read copy through the catalog rather than
  hardcoding strings, so changing the default language never breaks the suite.
- **D10 — CJK fonts are bundled** rather than installed in CI, so the certificate renders
  identically everywhere. Font bytes are part of the deliverable, so their SHA-256 is
  checked in CI.

## 8. Compliance red lines (enforced automatically)

- Banned wording (investment / appreciation / asset / trading / ownership certificate /
  digital currency, and so on) is scanned by `check-compliance.mjs`; a hit fails CI.
- The landing page must contain the "not official IAU naming" clarification and a refund
  policy, verified by the same script — **per language**, because both languages share one
  HTML file and a single scan would let one language's copy satisfy the other's rules.
- Lemon Squeezy (fiat) is the only permitted payment channel; any crypto payment host
  domain fails the scan.
- Public claim records must never contain email addresses, order numbers or other private
  fields, enforced by `verify-registry.mjs` (including regex scanning).