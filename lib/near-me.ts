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
  "": "Any cuisine",
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

/** The filters in one line, for the summary button: "Near you, within 2 km, any cuisine, rated 4.0 and up". */
export function filterSummary(f: { areaName: string | null; radiusKm: number; cuisine: string; ratingOn: boolean }): string {
  const where = f.areaName ? `In ${f.areaName}` : "Near you";
  const kind = (CUISINE_LABELS[f.cuisine] ?? CUISINE_LABELS[""]).toLowerCase();
  return `${where}, within ${f.radiusKm} km, ${kind}, ${f.ratingOn ? "rated 4.0 and up" : "any rating"}`;
}

export type Filters = { radiusKm: number; cuisine: string; ratingOn: boolean };

/** What a failed search shows. A cap gets the picture, the reset time and a Maps link; the rest get "Try again". */
export type ErrorNotice = { headline: string; body: string | null; cap: boolean };

const ERRORS: Record<string, ErrorNotice> = {
  rate_limited: { headline: "Slow down", body: "Try again in a minute.", cap: false },
  daily_cap: {
    headline: "Out of spins for today",
    body: "Lapar Wheel has a daily limit so it stays free. Spins come back at 12 am Malaysia time.",
    cap: true,
  },
  ip_daily_cap: {
    headline: "You’ve used today’s spins",
    body: "Everyone gets 30 a day. They come back at 12 am Malaysia time.",
    cap: true,
  },
};

export function errorNotice(code: string): ErrorNotice {
  return Object.hasOwn(ERRORS, code) ? ERRORS[code] : { headline: "Something went wrong", body: null, cap: false };
}

/** The nothing-open kicker: the active filters only, like "Within 10 km, Japanese, rated 4.0 and up". */
export function emptyKicker(f: Filters): string {
  return [`Within ${f.radiusKm} km`, f.cuisine && CUISINE_LABELS[f.cuisine], f.ratingOn && "rated 4.0 and up"]
    .filter(Boolean)
    .join(", ");
}

export function emptyBody(radiusKm: number): string | null {
  return nextRadius(radiusKm) ? null : "That’s as far as it goes. Loosen a filter to see more.";
}

/** Each loosens one filter and spins at once, except maps, the way out when nothing is left to loosen. */
export type EmptyAction = { kind: "radius"; km: number } | { kind: "cuisine" } | { kind: "rating" } | { kind: "maps" };

/** The nothing-open buttons, in order, at most two: a bigger radius, any cuisine, any rating, else Google Maps. */
export function emptyActions(f: Filters): EmptyAction[] {
  const next = nextRadius(f.radiusKm);
  const actions: EmptyAction[] = [
    ...(next ? [{ kind: "radius", km: next } as const] : []),
    ...(f.cuisine ? [{ kind: "cuisine" } as const] : []),
    ...(f.ratingOn ? [{ kind: "rating" } as const] : []),
  ];
  return actions.length ? actions.slice(0, 2) : [{ kind: "maps" }];
}

export function actionLabel(a: EmptyAction): string {
  return a.kind === "radius" ? `Try ${a.km} km` : a.kind === "cuisine" ? "Any cuisine" : a.kind === "rating" ? "Any rating" : FIND_FOOD;
}

export const FIND_FOOD = "Find food in Google Maps";

/** A plain Google Maps search for food nearby: no API call, nothing stored. */
export function foodSearchUrl(cuisine: string): string {
  const query = cuisine && CUISINE_LABELS[cuisine] ? `${CUISINE_LABELS[cuisine]} restaurants` : "restaurants";
  return `https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query })}`;
}

const DAY_MS = 86_400_000;
const MALAYSIA_MS = 8 * 3_600_000; // UTC+8, no daylight saving, as worker/limits.ts resets the caps

/**
 * When spins come back, as the cap notice's kicker: the next 00:00 in Malaysia, said as "Back at midnight"
 * where the device's clock agrees, otherwise as the device's local time ("Back at 5 pm your time").
 * `timeZone` and `locale` default to the device's; tests pass them.
 */
export function resetKicker(now: Date, timeZone?: string, locale?: string): string {
  const reset = new Date((Math.floor((now.getTime() + MALAYSIA_MS) / DAY_MS) + 1) * DAY_MS - MALAYSIA_MS);
  const format = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { timeZone, ...o });
  const parts = format({ hour: "numeric", minute: "2-digit", hourCycle: "h23" }).formatToParts(reset);
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const minute = Number(parts.find((p) => p.type === "minute")?.value);
  // Offsets differ by less than a day, so 00:00 on the device's clock means the same offset as Malaysia's.
  if (hour % 24 === 0 && minute === 0) return "Back at midnight";
  // "5 pm" in 12-hour locales; a 24-hour locale keeps its minutes ("17:00"), since a bare "17" reads oddly.
  const twelveHour = /h1[12]/.test(format({ hour: "numeric" }).resolvedOptions().hourCycle ?? "");
  const time = format({ hour: "numeric", ...((minute || !twelveHour) && { minute: "2-digit" }) }).format(reset);
  return `Back at ${time} your time`;
}

/** Shown when location is refused. The KK area picker is offered only when we don't know the user is elsewhere. */
export function refusedMessage(outsideKK: boolean): string {
  return outsideKK ? "Allow location to spin near you." : "Allow location to spin near you, or pick an area in Kota Kinabalu.";
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

/** How long the wheel turns. The Wheel's transition and the fallback timer both use it. */
export const SPIN_MS = 4000;

/**
 * Starts waiting for a spin's result and returns the wheel's transitionend handler. `show` runs exactly once:
 * straight away when the animation is skipped (a hidden page or reduced motion), otherwise on transitionend or
 * SPIN_MS + 300 ms later, whichever comes first. The timer covers a transitionend that never fires.
 */
export function awaitSpin(show: () => void, skip: { hidden: boolean; reducedMotion: boolean }): () => void {
  let shown = false;
  const once = () => {
    if (shown) return;
    shown = true;
    clearTimeout(timer);
    show();
  };
  const timer = skip.hidden || skip.reducedMotion ? undefined : setTimeout(once, SPIN_MS + 300);
  if (timer === undefined) once();
  return once;
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
