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
  return list.filter((restaurant) => {
    if (restaurant.regionId !== filters.regionId){
      return false;
    }
    if (filters.area && restaurant.area !== filters.area){
      return false;
    }
    if (filters.cuisine && restaurant.cuisine !== filters.cuisine){
      return false;
    }
    if (filters.halalOnly && restaurant.halal.status !== "certified"){
      return false;
    }
    return true;
  })
}
