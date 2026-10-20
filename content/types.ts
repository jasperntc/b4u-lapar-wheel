// The data model from the spec. Change it only with Jasper's approval.

/** Never inferred from cuisine, name, area or OSM tags. `unknown` is the default. */
export type Halal =
  | { status: "certified"; source: string; checkedAt: string } // YYYY-MM-DD
  | { status: "not-halal" }
  | { status: "unknown" };

export type Region = { id: string; name: string };

export type Restaurant = {
  id: string; // stable slug: share links depend on it
  name: string;
  regionId: string;
  area: string;
  cuisine: string;
  halal: Halal;
  priceLevel?: 1 | 2 | 3; // stored, not filtered in v1
  osmId?: string; // OSM-seeded entries
};
