// Matching OpenStreetMap and Overture places that are the same restaurant.
// Rule: within MAX_METERS of each other and names at least MIN_SIMILARITY alike,
// paired one-to-one, closest pairs first.

import { haversineMeters } from "../../lib/geo.ts";

export const MAX_METERS = 75;
export const MIN_SIMILARITY = 0.5;

export type Point = { id: string; name: string; lat: number; lon: number };
export type Match = { osmId: string; overtureId: string; meters: number; similarity: number };

// Words that say "this is a place to eat" rather than which place it is.
const GENERIC = new Set([
  "restoran", "restaurant", "rest", "kedai", "makan", "cafe", "café", "kafe",
  "coffee", "kopi", "shop", "kopitiam", "the", "and", "dan", "sdn", "bhd", "enterprise",
]);

/** Lowercase words with accents, punctuation and generic eatery words removed. */
export function nameTokens(name: string): string[] {
  return name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w && !GENERIC.has(w));
}

/** 1 when one name's words contain the other's, else the share of words in common. */
export function nameSimilarity(a: string, b: string): number {
  const ta = new Set(nameTokens(a));
  const tb = new Set(nameTokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  const common = [...ta].filter((w) => tb.has(w)).length;
  if (common === Math.min(ta.size, tb.size)) return 1;
  return common / new Set([...ta, ...tb]).size;
}

/** One-to-one matches under the rule above, closest pairs first. */
export function matchPlaces(osm: readonly Point[], overture: readonly Point[]): Match[] {
  const pairs: Match[] = [];
  for (const o of osm) {
    for (const v of overture) {
      const meters = haversineMeters(o.lat, o.lon, v.lat, v.lon);
      if (meters > MAX_METERS) continue;
      const similarity = nameSimilarity(o.name, v.name);
      if (similarity >= MIN_SIMILARITY) pairs.push({ osmId: o.id, overtureId: v.id, meters, similarity });
    }
  }
  pairs.sort((a, b) => a.meters - b.meters || b.similarity - a.similarity);
  const usedOsm = new Set<string>();
  const usedOverture = new Set<string>();
  return pairs.filter((p) => {
    if (usedOsm.has(p.osmId) || usedOverture.has(p.overtureId)) return false;
    usedOsm.add(p.osmId);
    usedOverture.add(p.overtureId);
    return true;
  });
}
