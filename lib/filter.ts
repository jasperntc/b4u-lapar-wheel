import type { Restaurant } from "@/content/types";

export type Filters = {
  regionId: string;
  /** Exact match. Leave it out for every area. */
  area?: string;
  /** Exact match. Leave it out for every cuisine. */
  cuisine?: string;
  /** Keep `certified` entries only. */
  halalOnly: boolean;
};

/**
 * The restaurants that match every filter, in their original order.
 * Hand-coded by Jasper: tests/filter.test.ts is the spec.
 */
export function filterRestaurants(list: readonly Restaurant[], filters: Filters): Restaurant[] {
  throw new Error("filterRestaurants isn’t written yet");
}
