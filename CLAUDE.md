# Lapar Wheel

Built4You episode 1. Pick a region, filter by area, cuisine and halal, then spin. The wheel lands on one real restaurant and links to it in Maps. Kota Kinabalu only in v1.

@AGENTS.md

## Stack

- Next.js and TypeScript with `strict: true`. No `any` and no `@ts-ignore` without a comment explaining why.
- Static export (`output: "export"`), `basePath: "/lapar-wheel"`, `images: { unoptimized: true }`. No server code, API routes, middleware or ISR.
- Tailwind CSS v4 and Vitest, the same versions and config as the Built4You hub repo.
- Hosted on Cloudflare Workers static assets as the Worker `b4u-lapar-wheel`, deployed with Wrangler.

## Routing

- Two Worker routes, `built4you.jasperntc.dev/lapar-wheel` and `built4you.jasperntc.dev/lapar-wheel/*`, in zone `jasperntc.dev`. No custom domain: the hostname belongs to the hub, and everything outside `/lapar-wheel` falls through to it.
- The routes need the hub's DNS record, so the hub must be deployed before this Worker.
- Next writes `out/` at the root even with `basePath`, but requests arrive as `/lapar-wheel/...` and Workers static assets match the full path. `scripts/nest-out.mjs` (run by `postbuild`) copies `out/` into `dist/lapar-wheel/` and moves `_headers` to `dist/`, its only working place. Wrangler uploads `dist/`. A build test checks this layout.
- `html_handling` is `drop-trailing-slash`, so `/lapar-wheel` serves the app and `/lapar-wheel/` redirects to it, matching `next/link`.
- Links go through `next/link`, which adds the `basePath`. Plain paths don't get it: use `import.meta.env.BASE_URL` (`"/lapar-wheel/"`) for those, as `app/layout.tsx` does for icons and the font preload. CSS `url()`s don't get it either, so `app/globals.css` redeclares the brand fonts under `/lapar-wheel/fonts/`. A test checks this.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server, at http://localhost:3000/lapar-wheel |
| `npm run lint` | ESLint |
| `npm run typecheck` | `next typegen`, then `tsc --noEmit` |
| `npm test` | Vitest, including the data and copy checks |
| `npm run build` | Static export to `out/`, nested into `dist/lapar-wheel/`, then the build guard (`tests/postbuild/`): checks the layout and fails if `dist/` holds env files, keys, dumps, git data, backups, logs, or a private or live secret key |
| `npm run preview` | Build, then serve `dist/` with Wrangler at http://localhost:8787/lapar-wheel |
| `npm run deploy` | Build, then deploy. Only with my approval. |

CI runs audit, lint, typecheck, test and build on every PR. Run all of them before saying a PR is ready.

## Data rules

- Restaurant data is typed against `Restaurant`, `Region` and `Halal` from the spec, in `content/types.ts`. Change the types only with my approval. Data lives in `content/regions.ts` and `content/restaurants.ts`, and `tests/restaurants.test.ts` checks it.
- Each restaurant has `lat` and `lon`, read from OpenStreetMap or Overture, never from Google.
- Candidate data is pulled, compared and given rule-based suggestions by `npm run data:pull`, `npm run data:compare` and `npm run data:suggest`. See `docs/data/README.md`. `data:compare` overwrites `data/candidates-kk.csv`, including my `keep` and `reason`; never run it once I have started pruning without asking. DuckDB lives only in `scripts/data/`'s own package; never add it to the root `package.json`.
- `lib/filter.ts` (`filterRestaurants`) is mine to hand-code. Don't write or change its body. `tests/filter.test.ts` is its spec.
- Halal has three states: `certified` (with `source` and `checkedAt`), `not-halal` and `unknown`. The default is `unknown`.
- Halal is never inferred: not from cuisine, name, area or the OSM `diet:halal` tag. Only I set `certified`, after checking JAKIM's directory.
- A `certified` entry needs a non-empty `source` and a real `checkedAt` date (`YYYY-MM-DD`, not in the future). A test enforces this. Never weaken that test to make data pass.
- `unknown` and `not-halal` are labelled neutrally. No warning colours, no icons that read as a judgement.
- "Halal only" shows `certified` entries only.
- Results show: "Halal status checked on <date>. Certificates expire, so confirm with the restaurant."
- Restaurant `id`s are stable slugs. Share links depend on them, so never rename an id. Remove an entry instead.
- Restaurants are seeded from OpenStreetMap (`amenity=restaurant`) and pruned by me. Show "© OpenStreetMap contributors" in the app and the README. The data is ODbL and the code is MIT. Keep the two licenses separate.
- "Open in Maps" is a Google Maps search URL built from name and area. No API key, no Places API, and no Google data stored.

## Spins

- The pick is uniform over the filtered list and uses `crypto.getRandomValues` with rejection sampling, so there is no modulo bias. Never use `Math.random`.
- Pick first, then animate. The animation is computed from the picked index and always lands on it. It never decides the result.
- Respect `prefers-reduced-motion` with a short or no animation that still shows the same pick.

## Share links

- Region, filters and the picked id live in the URL query string, so friends see the same pick.
- If the shared id isn't in the data, show "this place isn't on the wheel anymore". Never quietly re-spin.
- Unknown or malformed params fall back to defaults. They never throw.

## Storage

- No logins, cookies or stored user data.
- Episodes and the hub share the `built4you.jasperntc.dev` origin. Any `localStorage` or `sessionStorage` key starts with `lapar-wheel:`. Wrap reads and writes in `try`/`catch`.

## Copy

- Keep "makan mana" out of all copy. An existing app uses that name. A test checks this.
- The series name is spelled `Built4You`. A test checks this.
- The friend who sent the idea stays unnamed until she consents. Until then, describe her: "the friend who can't decide". Never infer a name from notes, commits or other repos.
- Spins are real and never rigged. Don't write copy that implies otherwise.

## Brand

- docs/brand.md and docs/brand-logos.md are the rules for colour, type, logo and copy, copied from the hub. They win over any skill's defaults.
- Use only the CSS variables in app/brand-tokens.css, which is copied as-is from the hub. Don't edit it here. No raw hex values anywhere else. A test checks this.
- Use the frontend-design skill for layout, hierarchy, copy and motion decisions inside those rules.
- Spacing uses only the steps in app/brand-tokens.css (1, 2, 3, 4, 6, 8, 12, 16). A test checks this.
- Type sizes are the roles in app/globals.css (`text-display-xl`, `text-display`, `text-title`, `text-stamp-text`, `text-body`, `text-body-sm`, `text-button`, `text-hand`). Use only these roles.
- The seven `wheel-*` colours are for the wheel, which is the one multicolour thing in the series. `radius-pill` is only for the spin button.
- The spin is this page's one motion. No fade-up on scroll.
- Body copy sits on `surface-label` labels on the kraft ground. Only the headline sits directly on kraft.
- It must not look like the portfolio.
- Works at phone width first. Most visitors come from an Instagram story.

## Won't (v1)

Logins, live multiplayer rooms, the Places API, user-submitted places, reviews or ratings, and regions beyond KK. Point it out instead of building it if a task drifts into one of these. Price filter is nice-to-have: `priceLevel` is stored but not filtered.

## Workflow

- Small PRs, one concern each, on a branch. I review every one.
- Never merge, deploy or push to `main` without my approval.
- When a mistake is caught in review, by me or by you, add a row to `REVIEW_LOG.md`: date, where, mistake, caught by, fix. Newest first.
- No secrets, tokens or `.env` files in commits. No absolute local paths in committed files, including docs, scripts and config.
- Tell me when we reach one of the spec's "moments to film" before doing it, so I can start recording.
