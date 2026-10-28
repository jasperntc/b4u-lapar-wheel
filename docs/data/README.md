# Restaurant data

> **Parked on 2026-10-28.** Near me (Places API) is v1, so pruning is paused (see [`docs/spec.md`](../spec.md)). The data in `data/` and the scripts in `scripts/data/` are kept as they are, and every rule below still applies if pruning resumes. This open data now only supplies coordinates for JAKIM-certified places, plus gaps to add to OpenStreetMap later.

How Lapar Wheel's restaurant list is made for the `kota-kinabalu` region. This is PR3a: pull, compare, and a candidates CSV to prune by hand. PR3b merges in `data/manual-kk.csv` and turns the pruned list into `content/restaurants.ts`.

## Area

One bounding box covering greater Kota Kinabalu, all within the single `kota-kinabalu` region:

- south 5.865, west 116.035, north 6.050, east 116.175 (about 20 × 15 km)
- It covers the city centre, Likas, Inanam, Menggatal, Luyang, Damai, Tanjung Aru, Kepayan, Penampang (Donggongon) and Putatan.
- The airport, 1Borneo, UMS and the eastern half of Gaya Island (resorts and the water village) are also inside. A box can't leave the island out, so prune those by hand.

## Sources

- **OpenStreetMap**, through the Overpass API. `amenity` is `restaurant`, `fast_food`, `cafe` or `food_court`. The query is [`data/queries/osm-kk.overpassql`](../../data/queries/osm-kk.overpassql), which you can paste into [Overpass Turbo](https://overpass-turbo.eu). Named places for the area column come from [`osm-kk-areas.overpassql`](../../data/queries/osm-kk-areas.overpassql).
- **Overture Maps**, release `2026-10-21.0`, queried with DuckDB in [`data/queries/overture-kk.sql`](../../data/queries/overture-kk.sql).
  - `basic_category` is one of `restaurant`, `casual_eatery`, `fast_food_restaurant`, `food_court`, `food_truck_stand`, `cafe` or `coffee_shop`.
  - There's no confidence filter. Confidence is recorded instead.
  - `categories` was removed in the September 2026 release, so the query uses `taxonomy` and `basic_category`.

The raw responses are kept in `data/raw/`, with the pull date or release in the file name.

## Running

```bash
npm run data:pull
npm run data:compare
```

- `data:pull` installs DuckDB into `scripts/data/` (its own package and lock file), then writes `data/raw/`. It needs the network.
- `data:compare` reads only `data/raw/`. It writes [`kk-comparison.md`](kk-comparison.md) and `data/candidates-kk.csv`.
- Neither runs in CI or the build, and the app's own install never includes DuckDB.
- The matching, cuisine and area rules are pure functions in `scripts/data/`, with tests in `tests/data/`.

## The candidates CSV

There's one row per place. A place found in both sources is merged into one row. Rows are sorted by `proposed_area`, then places found in both sources first.

| Column | What it holds |
|---|---|
| `candidate_id` | `osm:<type>/<id>`, or `overture:<id>` for Overture-only places |
| `sources` | `osm`, `overture` or `osm+overture` |
| `osm_id`, `overture_id` | The ids in each source |
| `name`, `type`, `lat`, `lon` | OSM's values when the place is in OSM |
| `proposed_area` | From address tags, else the nearest OSM suburb, neighbourhood, village or town |
| `proposed_cuisine` | One of the short list below, or blank |
| `overture_confidence`, `operating_status` | From Overture |
| `osm_opening_hours` | From OSM |
| `maps_link` | A Google Maps search URL for name and area. No Google data is stored. |
| `keep`, `reason` | Empty, for you to fill in |

There's no halal column. Halal stays `unknown` until it's checked in JAKIM's directory, and it's never inferred from a name, cuisine or tag.

`proposed_cuisine` is one of: Malay, Chinese, Kopitiam, Mamak, Seafood, Indian, Western, Japanese, Korean, Thai, Indonesian, Sabahan, Fast food, Cafe, Bakery and dessert.
- It comes from OSM `cuisine` tags or the Overture taxonomy.
- Kopitiam also comes from a name containing "kopitiam" or "kedai kopi". Mamak comes only from an explicit `mamak` or `nasi_kandar` tag, or a name containing "mamak" or "nasi kandar".
- `malaysian` stays blank, because it could mean Malay, Chinese or mamak. Anything unclear stays blank and is never guessed.

## Manual additions

Add places yourself to `data/manual-kk.csv`:
- It uses the same columns, with `sources` set to `manual`.
- Read coordinates off openstreetmap.org, never off Google Maps.

## Pruning rules

Follow these by hand in `data/candidates-kk.csv`. The scripts don't apply them.

- Keep only places that are real, open now, and serve meals.
- Drop:
  - drinks-only cafes
  - closed places
  - duplicates
- Give every dropped row a short `reason`.
- **Duplicates:** check for them yourself. Names written in Chinese characters don't match their Latin-named duplicates, so the same place can appear twice, once in each source.

## Licences

- **OpenStreetMap** data is © OpenStreetMap contributors, available under the [Open Database Licence (ODbL)](https://opendatacommons.org/licenses/odbl/). A list derived from it is ODbL too. The app's code stays MIT.
- **Overture Maps** licences are per source dataset. The datasets and licences in this pull are listed in [`kk-comparison.md`](kk-comparison.md#overture-licences).
- **Attribution:** the app needs an attribution line before launch. At least "© OpenStreetMap contributors", plus whatever the Overture sources that survive pruning require.
- **Google:** no Google Places API, and no Google data stored or copied, coordinates included.
