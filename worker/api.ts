// The near me API, behind worker/index.ts. wrangler.jsonc runs the Worker first for
// /lapar-wheel/api/*; every other path is served from static assets.
//
// POST /lapar-wheel/api/nearby
//   Body: { lat, lon, radiusKm: 1|2|5|10, cuisine?, minRating? }. Anywhere on Earth: lat −90 to 90, lon −180 to 180.
//   minRating: absent = 4, null = off, else 0–5 in 0.5 steps.
//   200: [{ id, name, lat, lon, primaryType, distanceM }], open now, within the circle.
// GET /lapar-wheel/api/place/:id?check=status|openNow (default status)
//   200: { id, name, available }. name is null and available false when Google doesn't know the place.
// Errors: { error } with 400 bad_request, 429 rate_limited | ip_daily_cap | daily_cap (with Retry-After),
// 502 upstream, 404 not_found, 405 method_not_allowed. Every response is no-store.
//
// Privacy: the location is rounded to 3 decimals on arrival and only ever sent to Google.
// Nothing here logs: no console calls, and Workers Logs are off in wrangler.jsonc.
import { EARTH_RADIUS_M, haversineMeters } from "../lib/geo.ts";
import { PLACE_ID } from "../lib/share.ts";
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

const RADII_KM = [1, 2, 5, 10];
const DEFAULT_MIN_RATING = 4;

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

type ApiError = "bad_request" | "rate_limited" | "ip_daily_cap" | "daily_cap" | "upstream" | "not_found" | "method_not_allowed";
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
  Response.json(body, {
    status,
    // Response.json alone sends no charset, and some clients then misread Chinese names.
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
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
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
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

type LatLng = { latitude: number; longitude: number };

/**
 * The smallest Text Search rectangle holding every point within `radiusM` of (lat, lon), on the same sphere
 * as haversineMeters. Across the 180° line, low.longitude > high.longitude, which Google reads as crossing it.
 */
export function rectangleAround(lat: number, lon: number, radiusM: number): { low: LatLng; high: LatLng } {
  const deg = 180 / Math.PI;
  const dLat = (radiusM / EARTH_RADIUS_M) * deg;
  const south = Math.max(lat - dLat, -90);
  const north = Math.min(lat + dLat, 90);
  // A circle that reaches a pole spans every longitude (and asin below would get a value over 1).
  if (Math.abs(lat) + dLat >= 90) return { low: { latitude: south, longitude: -180 }, high: { latitude: north, longitude: 180 } };
  // The circle is widest slightly poleward of its centre, which asin(sin / cos) accounts for.
  const dLon = Math.asin(Math.sin(dLat / deg) / Math.cos(lat / deg)) * deg;
  const wrap = (x: number) => (x > 180 ? x - 360 : x < -180 ? x + 360 : x);
  return { low: { latitude: south, longitude: wrap(lon - dLon) }, high: { latitude: north, longitude: wrap(lon + dLon) } };
}

async function nearby(request: Request, env: Env): Promise<Response> {
  const q = parseNearby(await request.text());
  if (!q) return fail("bad_request", 400);
  const limited = await overLimit(request, env);
  if (limited) return limited;

  // Text Search only takes a rectangle, so ask for the box around the circle and trim to the circle below.
  const radiusM = q.radiusKm * 1000;
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
      locationRestriction: { rectangle: rectangleAround(q.lat, q.lon, radiusM) },
      languageCode: "en",
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
