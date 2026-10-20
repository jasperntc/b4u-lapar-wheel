import { describe, expect, it } from "vitest";
import type { Restaurant } from "../content/types";
import { filterRestaurants, type Filters } from "../lib/filter";

// Jasper hand-codes filterRestaurants. Remove `.skip` when you start.
describe.skip("filterRestaurants", () => {
  const certified = { status: "certified", source: "JAKIM directory", checkedAt: "2026-10-01" } as const;

  const list: Restaurant[] = [
    { id: "a", name: "A", regionId: "kota-kinabalu", area: "Gaya Street", cuisine: "Malay", halal: certified },
    { id: "b", name: "B", regionId: "kota-kinabalu", area: "Gaya Street", cuisine: "Chinese", halal: { status: "not-halal" } },
    { id: "c", name: "C", regionId: "kota-kinabalu", area: "Damai", cuisine: "Malay", halal: { status: "unknown" } },
    { id: "d", name: "D", regionId: "kota-kinabalu", area: "Damai", cuisine: "Chinese", halal: certified },
    { id: "e", name: "E", regionId: "sandakan", area: "Gaya Street", cuisine: "Malay", halal: certified },
  ];

  const ids = (filters: Filters) => filterRestaurants(list, filters).map((r) => r.id);
  const kk: Filters = { regionId: "kota-kinabalu", halalOnly: false };

  it("keeps only the chosen region", () => {
    expect(ids(kk)).toEqual(["a", "b", "c", "d"]);
  });

  it("filters by area", () => {
    expect(ids({ ...kk, area: "Damai" })).toEqual(["c", "d"]);
  });

  it("filters by cuisine", () => {
    expect(ids({ ...kk, cuisine: "Malay" })).toEqual(["a", "c"]);
  });

  it("keeps only certified places when halal only is on", () => {
    expect(ids({ ...kk, halalOnly: true })).toEqual(["a", "d"]);
  });

  it("keeps every halal status when halal only is off", () => {
    const statuses = filterRestaurants(list, kk).map((r) => r.halal.status);
    expect(new Set(statuses)).toEqual(new Set(["certified", "not-halal", "unknown"]));
  });

  it("combines every filter", () => {
    expect(ids({ ...kk, area: "Gaya Street", cuisine: "Malay", halalOnly: true })).toEqual(["a"]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(ids({ ...kk, area: "Nowhere" })).toEqual([]);
    expect(ids({ regionId: "tawau", halalOnly: false })).toEqual([]);
    expect(filterRestaurants([], kk)).toEqual([]);
  });

  it("matches area and cuisine exactly", () => {
    expect(ids({ ...kk, area: "damai" })).toEqual([]);
    expect(ids({ ...kk, cuisine: "Mala" })).toEqual([]);
  });

  it("doesn't change the list it was given", () => {
    const before = structuredClone(list);
    filterRestaurants(list, { ...kk, area: "Damai", halalOnly: true });
    expect(list).toEqual(before);
  });
});
