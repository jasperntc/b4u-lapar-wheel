// The near me API, behind worker/index.ts. wrangler.jsonc runs the Worker first for
// /lapar-wheel/api/*; every other path is served from static assets.
//
// POST /lapar-wheel/api/nearby
//   Body: { lat, lon, radiusKm: 1|2|5|10, cuisine?, minRating? }. minRating: absent = 4, null = off, else 0–5 in 0.5 steps.
//   200: [{ id, name, lat, lon, primaryType, distanceM }], open now, within the circle.
// GET /lapar-wheel/api/place/:id?check=status|openNow (default status)
//   200: { id, name, available }. name is null and available false when Google doesn't know the place.
// Errors: { error } with 400 bad_request | outside_area, 429 rate_limited | daily_cap (with Retry-After),
// 502 upstream, 404 not_found, 405 method_not_allowed. Every response is no-store.
//
// Privacy: the location is rounded to 3 decimals on arrival and only ever sent to Google.
// Nothing here logs: no console calls, and Workers Logs are off in wrangler.jsonc.
import { haversineMeters } from "../lib/geo.ts";
import type { LimitResult } from "./limits.ts";

// shortcut: bindings typed by hand, because the root tsconfig's DOM lib clashes with the Workers types;
// give worker/ its own tsconfig and `wrangler types` if the Worker grows.
export type Env = {
  GOOGLE_PLACES_API_KEY: string;
  LIMITS: { idFromName(name: string): unknown; get(id: unknown): { fetch(request: Request): Promise<Response> } };
  ASSETS: { fetch(request: Request): Promise<Response> };
};

const API = "/lapar-wheel/api/";
const PLACES = "https://places.googleapis.com/v1/places";
/** Pro fields only. Anything else Google sends is dropped before the response. */
export const SEARCH_FIELDS = "places.id,places.displayName,places.location,places.primaryType";
export const DETAILS_FIELDS = {
  status: "id,displayName,businessStatus", // Pro, for share links
  openNow: "id,displayName,currentOpeningHours.openNow", // Enterprise, for halal picks only
} as const;

/** Greater Kota Kinabalu: the same box as the data pull (docs/data/README.md). */
export const KK_BOX = { south: 5.865, west: 116.035, north: 6.05, east: 116.175 };
const RADII_KM = [1, 2, 5, 10];
const DEFAULT_MIN_RATING = 4;
const PLACE_ID = /^[A-Za-z0-9_-]{1,512}$/;

/** UI cuisine -> Google Table A type. Never `halal_restaurant`: halal is never inferred. */
export const CUISINES: Record<string, { type: string; query: string }> = {
  chinese: { type: "chinese_restaurant", query: "chinese restaurant" },
  japanese: { type: "japanese_restaurant", query: "japanese restaurant" },
  korean: { type: "korean_restaurant", query: "korean restaurant" },
  thai: { type: "thai_restaurant", query: "thai restaurant" },
  indian: { type: "indian_restaurant", query: "indian restaurant" },
  indonesian: { type: "indonesian_restaurant", query: "indonesian restaurant" },
  seafood: { type: "seafood_restaurant", query: "seafood restaurant" },
  "fast-food": { type: "fast_food_restaurant", query: "fast food" },
  cafe: { type: "cafe", query: "cafe" },
  malaysian: { type: "malaysian_restaurant", query: "malaysian restaurant" },
};

type ApiError = "bad_request" | "outside_area" | "rate_limited" | "daily_cap" | "upstream" | "not_found" | "method_not_allowed";
type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  location?: { latitude?: number; longitude?: number };
  primaryType?: string;
  businessStatus?: string;
  currentOpeningHours?: { openNow?: boolean };
};
export type NearbyQuery = { lat: number; lon: number; radiusKm: number; cuisine?: string; minRating: number | null };

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
const fail = (error: ApiError, status: number, headers?: Record<string, string>) => json({ error }, status, headers);
const round3 = (x: number) => Math.round(x * 1000) / 1000;

export async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(API)) return env.ASSETS.fetch(request);
  const route = url.pathname.slice(API.length);
  if (route === "nearby") return request.method === "POST" ? nearby(request, env) : fail("method_not_allowed", 405);
  if (route.startsWith("place/")) {
    if (request.method !== "GET") return fail("method_not_allowed", 405);
    return place(route.slice("place/".length), url.searchParams.get("check"), request, env);
  }
  return fail("not_found", 404);
}

/** The validated, rounded query, or null for anything malformed. */
export function parseNearby(text: string): NearbyQuery | null {
  if (text.length > 1024) return null;
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof body !== "object" || body === null) return null;
  const { lat, lon, radiusKm, cuisine, minRating = DEFAULT_MIN_RATING } = body as Record<string, unknown>;
  if (typeof lat !== "number" || typeof lon !== "number" || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (typeof radiusKm !== "number" || !RADII_KM.includes(radiusKm)) return null;
  if (cuisine !== undefined && (typeof cuisine !== "string" || !Object.hasOwn(CUISINES, cuisine))) return null;
  if (minRating !== null && (typeof minRating !== "number" || minRating < 0 || minRating > 5 || !Number.isInteger(minRating * 2))) {
    return null;
  }
  return { lat: round3(lat), lon: round3(lon), radiusKm, cuisine, minRating };
}

/** A 429 when the caller is over the rate limit or today's Google calls are used up; else one call is reserved. */
async function overLimit(request: Request, env: Env): Promise<Response | null> {
  const stub = env.LIMITS.get(env.LIMITS.idFromName("limits"));
  const ip = request.headers.get("CF-Connecting-IP") ?? "";
  const result = (await (await stub.fetch(new Request("https://limits/", { headers: { "x-client-ip": ip } }))).json()) as LimitResult;
  return result.ok ? null : fail(result.error, 429, { "Retry-After": String(result.retryAfter) });
}

async function nearby(request: Request, env: Env): Promise<Response> {
  const q = parseNearby(await request.text());
  if (!q) return fail("bad_request", 400);
  if (q.lat < KK_BOX.south || q.lat > KK_BOX.north || q.lon < KK_BOX.west || q.lon > KK_BOX.east) {
    return fail("outside_area", 400);
  }
  const limited = await overLimit(request, env);
  if (limited) return limited;

  // Text Search only takes a rectangle, so ask for the box around the circle and trim to the circle below.
  const radiusM = q.radiusKm * 1000;
  const dLat = radiusM / 111_320;
  const dLon = radiusM / (111_320 * Math.cos((q.lat * Math.PI) / 180));
  const cuisine = q.cuisine === undefined ? undefined : CUISINES[q.cuisine];
  const res = await fetch(`${PLACES}:searchText`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": env.GOOGLE_PLACES_API_KEY,
      "X-Goog-FieldMask": SEARCH_FIELDS,
    },
    body: JSON.stringify({
      textQuery: cuisine?.query ?? "restaurant",
      ...(cuisine ? { includedType: cuisine.type, strictTypeFiltering: true } : {}),
      openNow: true,
      ...(q.minRating === null ? {} : { minRating: q.minRating }),
      pageSize: 20,
      locationRestriction: {
        rectangle: {
          low: { latitude: q.lat - dLat, longitude: q.lon - dLon },
          high: { latitude: q.lat + dLat, longitude: q.lon + dLon },
        },
      },
      languageCode: "en",
      regionCode: "my",
    }),
  });
  const data = res.ok ? ((await res.json().catch(() => null)) as { places?: GooglePlace[] } | null) : null;
  if (!data) return fail("upstream", 502);

  const places = [];
  for (const p of data.places ?? []) {
    const lat = p.location?.latitude;
    const lon = p.location?.longitude;
    if (!p.id || lat === undefined || lon === undefined) continue;
    const meters = haversineMeters(q.lat, q.lon, lat, lon);
    if (meters > radiusM) continue;
    places.push({ id: p.id, name: p.displayName?.text ?? "", lat, lon, primaryType: p.primaryType ?? null, distanceM: Math.round(meters) });
  }
  return json(places);
}

async function place(id: string, check: string | null, request: Request, env: Env): Promise<Response> {
  const mode = check ?? "status";
  if (!PLACE_ID.test(id) || (mode !== "status" && mode !== "openNow")) return fail("bad_request", 400);
  const limited = await overLimit(request, env);
  if (limited) return limited;

  const res = await fetch(`${PLACES}/${id}?languageCode=en`, {
    headers: { "X-Goog-Api-Key": env.GOOGLE_PLACES_API_KEY, "X-Goog-FieldMask": DETAILS_FIELDS[mode] },
  });
  // Only 404 means "no such place". A 400 can also mean a bad key, which must not read as "closed".
  if (res.status === 404) return json({ id, name: null, available: false });
  const p = res.ok ? ((await res.json().catch(() => null)) as GooglePlace | null) : null;
  if (!p) return fail("upstream", 502);
  const available = mode === "status" ? p.businessStatus === "OPERATIONAL" : p.currentOpeningHours?.openNow === true;
  return json({ id, name: p.displayName?.text ?? null, available });
}
