// Pure helpers for the near me page: the API call, copy and wheel maths. Contract: the top of worker/api.ts.

export type Place = { id: string; name: string; lat: number; lon: number; primaryType: string; distanceM: number };
export type NearbyRequest = { lat: number; lon: number; radiusKm: number; cuisine?: string; minRating?: null };
export type NearbyResult = { ok: true; places: Place[] } | { ok: false; error: string };

export type SpinCache = { key: string; places: Place[] };

/**
 * The places to re-pick from without a new Google call, or null to fetch. Only a non-empty result
 * for the same request is reused: Google sometimes answers an identical search with nothing, so an
 * empty result must not stick.
 */
export function cachedPlaces(cache: SpinCache | null, key: string): Place[] | null {
  return cache && cache.key === key && cache.places.length ? cache.places : null;
}

export const RADII_KM = [1, 2, 5, 10] as const;
export const DEFAULT_RADIUS_KM = 2;

/** "" is Any. The other keys are the Worker's CUISINES keys; a test keeps them in step. */
export const CUISINE_LABELS: Record<string, string> = {
  "": "Any",
  chinese: "Chinese",
  japanese: "Japanese",
  korean: "Korean",
  thai: "Thai",
  indian: "Indian",
  indonesian: "Indonesian",
  seafood: "Seafood",
  "fast-food": "Fast food",
  cafe: "Cafe",
  malaysian: "Malaysian",
};

const MESSAGES: Record<string, string> = {
  rate_limited: "Slow down, try again in a minute.",
  ip_daily_cap: "You’ve used today’s spins. Try again tomorrow.",
  daily_cap: "Lapar Wheel is out of spins for today.",
};

export function errorMessage(code: string): string {
  return Object.hasOwn(MESSAGES, code) ? MESSAGES[code] : "Something went wrong, try again.";
}

/** Shown when location is refused. The KK area picker is offered only when we don't know the user is elsewhere. */
export function refusedMessage(outsideKK: boolean): string {
  return outsideKK ? "Allow location to spin near you." : "Allow location to spin near you, or pick an area in Kota Kinabalu.";
}

export function emptyMessage(radiusKm: number): string {
  return `Nothing open within ${radiusKm} km.`;
}

/** The next radius up, or null at the largest. */
export function nextRadius(radiusKm: number): number | null {
  return RADII_KM.find((r) => r > radiusKm) ?? null;
}

export function formatDistance(meters: number): string {
  const rounded = Math.round(meters / 10) * 10;
  return rounded < 1000 ? `${rounded} m` : `${(meters / 1000).toFixed(1)} km`;
}

export function mapsUrl(name: string, placeId: string): string {
  return `https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query: name, query_place_id: placeId })}`;
}

/**
 * The wheel's next rotation in degrees, clockwise. Segment i spans [i, i + 1] × 360/n from the top;
 * the result turns forward at least 5 full turns and puts the centre of `index` under the top pointer.
 */
export function wheelRotation(current: number, index: number, n: number): number {
  const target = (((360 - ((index + 0.5) * 360) / n) % 360) + 360) % 360;
  const delta = (((target - current) % 360) + 360) % 360;
  return current + 5 * 360 + delta;
}

/** POST /lapar-wheel/api/nearby. Network failures and unreadable replies count as upstream. */
export async function searchNearby(body: NearbyRequest, base = "/lapar-wheel/"): Promise<NearbyResult> {
  try {
    const res = await fetch(`${base}api/nearby`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data: unknown = await res.json();
    if (res.ok && Array.isArray(data)) return { ok: true, places: data as Place[] };
    const error = (data as { error?: unknown } | null)?.error;
    return { ok: false, error: typeof error === "string" ? error : "upstream" };
  } catch {
    return { ok: false, error: "upstream" };
  }
}
