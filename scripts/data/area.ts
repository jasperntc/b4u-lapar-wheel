import { haversineMeters } from "../../lib/geo.ts";

export type NamedPlace = { name: string; lat: number; lon: number };

/** The name of the closest OSM place node (suburb, neighbourhood, village, town), or "". */
export function nearestArea(lat: number, lon: number, places: readonly NamedPlace[]): string {
  let best = "";
  let bestMeters = Infinity;
  for (const p of places) {
    const m = haversineMeters(lat, lon, p.lat, p.lon);
    if (m < bestMeters) [best, bestMeters] = [p.name, m];
  }
  return best;
}
