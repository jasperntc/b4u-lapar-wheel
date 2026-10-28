# Lapar Wheel (Built4You episode 1)

## What it does
Lapar Wheel picks a place to eat near you when nobody can decide. Allow location (or pick an area), set how far you'll go, filter by cuisine or JAKIM-certified halal, then spin. It lands on one real place that's open now, with a link to open it in Maps. It's for groups of friends who can't agree on where to eat, starting with Crystal, who sent the idea. She agreed on 2026-10-28 to be credited by name and filmed.

**Changed 2026-10-28:** "near me" is the core of v1. Places come live from the Google Places API at spin time, and nothing from Google is stored except place IDs. The curated OpenStreetMap/Overture list (PR3a) is parked; that data now only supplies coordinates for certified places and gaps to add to OpenStreetMap later.

**Success:** the friend group still uses it weekly a month after launch.

## MVP
Must:
- **Near me spin:** a Cloudflare Worker calls Places API (New) Text Search live with the user's location, a radius box, `openNow: true`, `minRating`, and an optional cuisine type (`includedType` + `strictTypeFiltering`). One Pro request per spin; fields limited to id, display name, location, primary type.
- **Halal mode (JAKIM-certified):** picks only from my certified list within the radius. Each pick makes one Place Details call for `currentOpeningHours.openNow` (Enterprise, 1,000 free a month) and re-spins up to 3 times if it's closed. Labelled "JAKIM-certified, expires [date]", never just "halal". Uncertified places get no halal label at all.
- **Location:** browser geolocation, asked only when the user taps "Near me". If refused, pick an area (City centre, Likas, Inanam, Menggatal, Luyang, Damai, Tanjung Aru, Kepayan, Penampang, Putatan) as the search centre.
- **Filters:** radius (1 / 2 / 5 / 10 km), cuisine, minimum rating (default 4.0, can switch off), halal mode.
- **Spin:** uniform pick with `pickIndex` (`crypto.getRandomValues`, rejection sampling), and the animation lands on it. Spins are real.
- **Result card:** live name, distance, Maps link (`https://www.google.com/maps/search/?api=1&query=<name>&query_place_id=<placeId>`), JAKIM label and expiry when certified.
- **Share link:** carries the place ID only (never anyone's location). Opening it makes one live Place Details call for the name; if Google returns closed or not found, show "this place isn't available anymore".
- **Empty results:** "Nothing open within 2 km. Try 5 km?"
- **Attribution:** Google attribution wherever Google results show; "© OpenStreetMap contributors" where OSM coordinates are used.

Nice-to-have: price levels filter, a "report closed / suggest a place" link that creates an OpenStreetMap note.

Won't (v1): logins, live multiplayer rooms, storing any Google data except place IDs, scraping anything, reviews, regions beyond greater KK.

## Google data rules
- Store only place IDs, permanently. Never store names, addresses, hours, ratings or status, in the repo, a database or a log.
- Coordinates: from OSM/Overture when matched; Google coordinates only cached up to 30 days, then refreshed or deleted.
- Never use Google results to decide which OSM/Overture entries to keep or delete, and never copy Google data into OpenStreetMap.
- Places that look closed are skipped live at spin time; nothing about them is stored.

## Privacy
- The user's location goes from the phone to the Worker to Google for that one search. It's never stored, logged or put in a share link.
- No accounts, no stored user data.

## Cost limits
- Google Cloud: a daily quota cap on Places API (e.g. 150 requests/day) as the hard stop, plus a budget alert. Budgets only alert; quotas stop.
- Worker: per-IP rate limit, no photos fetched, Pro fields only. One exception: `currentOpeningHours.openNow` (Enterprise) for halal-mode picks. Share links check `businessStatus` (Pro).

## Data model
```ts
// The only stored list: JAKIM-certified premises in greater KK.
type Certified = {
  placeId: string;        // Google place ID, matched by IDs-only search + checked by eye
  jakimName: string;      // premises name as listed on MyeHalal
  address: string;        // from MyeHalal
  expiry: string;         // YYYY-MM-DD, certified only while not expired
  checkedAt: string;      // YYYY-MM-DD, re-checked monthly
  lat: number; lon: number;
  coordsSource: "osm" | "overture" | "google";
  coordsFetchedAt?: string; // required when coordsSource is "google" (30-day limit)
};
```
- Certification is never inferred from a name, cuisine or Google category.
- Tests fail if an entry lacks `expiry` or `checkedAt`, or if Google-sourced coordinates are older than 30 days.

## Build order
1. Planning PR: update `CLAUDE.md` (scope, Google data rules, privacy, cost limits) and this spec in `docs/`.
2. Google Cloud setup (me): project, Places API (New), server key restricted to Places API, daily quota cap, budget alert.
3. Worker PR: `POST /lapar-wheel/api/nearby` and `GET /lapar-wheel/api/place/:id`, rate limit, no logging of location, key as a secret.
4. JAKIM list: certified premises for KK, Penampang and Putatan from MyeHalal, matched to place IDs, with expiry.
5. `pickIndex` hand-coding session.
6. Wheel UI: location flow and area fallback, filters, spin, result card, share link, attribution.
7. Test on my phone, then film with friends.

## Logins and hosting
No logins and no stored user data. The page lives at `built4you.jasperntc.dev/lapar-wheel` (separate repo, `basePath: /lapar-wheel`, storage keys prefixed `lapar-wheel:`), plus one Cloudflare Worker route for the API.

## Naming
Keep "makan mana" out of in-app copy and marketing: an existing app uses that name.

## Moments to film

1. The pick: the real wheel spin from 2026-10-13 (already filmed), with a voice-over of the ask. Blur any idea-giver names on the wheel.
2. Reviewing Claude Code's plan, and pushing back on what it got wrong.
3. Open data first: the OpenStreetMap and Overture pins, the count, and a place I know is missing from the map.
4. The pivot to near me: the phone asking for location, setting 2 km, spinning onto a place that's open right now.
5. Halal: searching MyeHalal for KK, a certificate's expiry date, and the test failing on an entry with no expiry.
6. Tuning the spin: before and after, tested on my phone.
7. The first real spin with friends, then eating wherever it lands.
8. A friend opening the share link and seeing the same pick.
9. Launch day: handing the phone to Crystal to spin, if she agrees to be filmed and credited.
10. The hub's Building stamp changing to Shipped.
11. A "What should I build next?" story with the suggestion sticker.
