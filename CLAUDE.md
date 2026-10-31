# Lapar Wheel

Built4You episode 1. Allow location (or pick an area), set how far you'll go, filter by cuisine or JAKIM-certified halal, then spin. It lands on one real place that's open now, with a link to open it in Maps. Greater Kota Kinabalu only in v1. `docs/spec.md` is the source of truth for scope.

@AGENTS.md

## Stack

- Next.js and TypeScript with `strict: true`. No `any` and no `@ts-ignore` without a comment explaining why.
- The Next app is a static export (`output: "export"`), `basePath: "/lapar-wheel"`, `images: { unoptimized: true }`. It has no server code, API routes, middleware or ISR.
- The only server code is the API script in the same `b4u-lapar-wheel` Worker, which handles `/lapar-wheel/api/*` (see "Near me").
- Tailwind CSS v4 and Vitest, the same versions and config as the Built4You hub repo.
- Hosted on Cloudflare Workers static assets as the Worker `b4u-lapar-wheel`, deployed with Wrangler.

## Routing

- Two Worker routes, `built4you.jasperntc.dev/lapar-wheel` and `built4you.jasperntc.dev/lapar-wheel/*`, in zone `jasperntc.dev`. No custom domain: the hostname belongs to the hub, and everything outside `/lapar-wheel` falls through to it.
- The routes need the hub's DNS record, so the hub must be deployed before this Worker.
- `/lapar-wheel/api/*` runs the Worker script first (`run_worker_first`). Every other path is served from static assets.
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

## Near me (Places API)

- **Scope:** places come live from the Google Places API (New) at spin time. It's called only from the Worker, never from the browser.
- **Endpoints:** `POST /lapar-wheel/api/nearby`, with the location in the request body, and `GET /lapar-wheel/api/place/:id`.
- **Key:** the Wrangler secret `GOOGLE_PLACES_API_KEY`, restricted to Places API (New). Locally, a separate development key with a lower quota goes in `.dev.vars`, which is gitignored. The key never sits in the repo or the client.
- **Google data:**
  - Store only place IDs.
  - Never store names, addresses, hours, ratings or status in the repo, a database or logs.
  - Google coordinates may be cached for up to 30 days, then refreshed or deleted. For now there's no caching at all.
  - Never use Google results to keep or drop open-data entries, and never copy Google data into OpenStreetMap.
- **Privacy:**
  - The user's location is never stored, logged or put in a share link.
  - It's rounded to 3 decimals before it reaches Google.
  - It travels only in a request body, never in a URL.
- **Logging:**
  - Turn Workers logs off for the API routes, or make sure no request body is ever logged.
  - The Worker source never contains `console.log`. A test checks this.
- **Cost:**
  - Pro fields only, with no photos. The search field mask is `places.id`, `places.displayName`, `places.location`, `places.primaryType`.
  - The one Enterprise exception is `currentOpeningHours.openNow`, for halal-mode picks only.
  - Share links check `businessStatus` (Pro).
  - A per-IP rate limit of 20 requests a minute (friends often share an IP). When it's hit, show "Slow down, try again in a minute."
  - A hard cap of 150 Google calls a day across both endpoints, reset at midnight Malaysia time. Google's free trial allows no quota, so this counter is the real limit. I keep a budget alert in Google Cloud.
  - Both limits live in one Durable Object (`worker/limits.ts`), so the counts are exact. The per-IP counts are kept in memory only, never in storage.
  - When the cap is hit, near me shows "Lapar Wheel is out of spins for today". Halal mode still picks from the certified list by `jakimName`, without the open-now check, labelled "Couldn't check if it's open right now. Check Maps before you go." Share links show only an Open in Maps button (`query=restaurant` beside `query_place_id`).
- **Area:** greater KK only. Outside the box, show "Lapar Wheel only covers greater Kota Kinabalu for now."
- **Cuisine:** UI choices map to Google's Table A types: Chinese, Japanese, Korean, Thai, Indian, Indonesian, Seafood, Fast food, Cafe, and Malaysian (`malaysian_restaurant`). There's no Malay type. Never use `halal_restaurant`.
- **Attribution:** wherever Google results appear without a Google map, show the Google logo (16–19 px high), or the text "Google Maps" if space is tight, in the same container. Never draw Google results on a non-Google map.
- **Open in Maps:** `https://www.google.com/maps/search/?api=1&query=<name>&query_place_id=<placeId>`.
- **Testing:** CI uses a mocked `fetch`, never live Google calls. I run the first live call myself with the development key.

## Halal

- A place is "JAKIM-certified" only when it's on my certified list (`content/certified.ts`, the `Certified` type in `docs/spec.md`) and its `expiry` hasn't passed.
- The label is "JAKIM-certified, expires [date]", never just "halal". Uncertified places get no halal label at all.
- Never inferred: not from a name, cuisine, area, the OSM `diet:halal` tag, or any Google type or category, including `halal_restaurant`. Only I add entries, after checking JAKIM's MyeHalal directory.
- "Halal only" picks only certified, unexpired places within the radius. A pick that's closed right now re-spins, up to 3 times.
- Tests fail if an entry lacks `expiry` or `checkedAt`, or if Google-sourced coordinates are older than 30 days. Never weaken those tests to make data pass.

## Open data (parked)

Parked on 2026-10-28: see `docs/data/README.md`. The data and scripts stay. The list now only supplies coordinates for certified places, plus gaps to add to OpenStreetMap later. These rules still apply to it:

- Restaurant data is typed against `Restaurant`, `Region` and `Halal` in `content/types.ts`. Change the types only with my approval. Data lives in `content/regions.ts` and `content/restaurants.ts`, and `tests/restaurants.test.ts` checks it.
- Each restaurant has `lat` and `lon`, read from OpenStreetMap or Overture, never from Google.
- Candidate data is pulled, compared and given rule-based suggestions by `npm run data:pull`, `npm run data:compare` and `npm run data:suggest`. See `docs/data/README.md`. `data:compare` overwrites `data/candidates-kk.csv`, including my `keep` and `reason`; never run it once I have started pruning without asking. DuckDB lives only in `scripts/data/`'s own package; never add it to the root `package.json`.
- `lib/filter.ts` (`filterRestaurants`) is mine to hand-code. Don't write or change its body. `tests/filter.test.ts` is its spec.
- Its `Halal` type has three states: `certified` (with `source` and `checkedAt`), `not-halal` and `unknown`. The default is `unknown`.
  - A `certified` entry needs a non-empty `source` and a real `checkedAt` date. A test enforces this.
  - `unknown` and `not-halal` are labelled neutrally.
  - If this list is ever shown, results say "Halal status checked on [date]. Certificates expire, so confirm with the restaurant."
- Restaurant `id`s are stable slugs. Never rename one; remove the entry instead.
- Seeded from OpenStreetMap and Overture, pruned by me. Show "© OpenStreetMap contributors" wherever OSM data or coordinates are used, and in the README. The data is ODbL and the code is MIT. Keep the two licenses separate.
- Open in Maps for these entries is a Google Maps search URL built from name and area.

## Spins

- The pick is uniform over the filtered list. It uses `pickIndex` (`crypto.getRandomValues` with rejection sampling), so there is no modulo bias. Never use `Math.random`.
- `pickIndex` is mine to hand-code, as step 5 of the spec's build order. Don't write its body.
- Pick first, then animate. The animation is computed from the picked index and always lands on it. It never decides the result.
- Respect `prefers-reduced-motion` with a short or no animation that still shows the same pick.

## Share links

- A share link carries the place ID only, never anyone's location.
- Opening one makes a single live Place Details call. If Google returns closed or not found, show "this place isn't available anymore". Never quietly re-spin.
- Unknown or malformed params fall back to defaults. They never throw.

## Storage

- No logins, cookies or stored user data.
- Episodes and the hub share the `built4you.jasperntc.dev` origin. Any `localStorage` or `sessionStorage` key starts with `lapar-wheel:`. Wrap reads and writes in `try`/`catch`.

## Copy

- Keep "makan mana" out of all copy. An existing app uses that name. A test checks this.
- The series name is spelled `Built4You`. A test checks this.
- Crystal sent the idea. She agreed on 2026-10-28 to be credited by name and filmed. If she ever withdraws, remove her name everywhere. Never name anyone else without their consent, and never infer a name from notes, commits or other repos.
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

Logins, live multiplayer rooms, storing any Google data except place IDs, scraping anything, reviews, and regions beyond greater KK. Point it out instead of building it if a task drifts into one of these. Nice-to-have: a price level filter, and a "report closed / suggest a place" link that creates an OpenStreetMap note.

## Workflow

- Small PRs, one concern each, on a branch. I review every one.
- Never merge, deploy or push to `main` without my approval.
- When a mistake is caught in review, by me or by you, add a row to `REVIEW_LOG.md`: date, where, mistake, caught by, fix. Newest first.
- No secrets, tokens or `.env` files in commits. No absolute local paths in committed files, including docs, scripts and config.
- Tell me when we reach one of the spec's "moments to film" before doing it, so I can start recording.
