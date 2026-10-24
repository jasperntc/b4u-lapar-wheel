import { describe, expect, it } from "vitest";
import { nearestArea } from "../../scripts/data/area.ts";
import {
  buildCandidates,
  CSV_COLUMNS,
  mapsLink,
  toCsv,
  usefulArea,
  type Candidate,
  type OsmElement,
  type OvertureRow,
} from "../../scripts/data/candidates.ts";
import { seededSample } from "../../scripts/data/sample.ts";

const areas = [
  { name: "Damai", lat: 5.97, lon: 116.09 },
  { name: "Likas", lat: 5.988, lon: 116.102 },
];

const osm: OsmElement[] = [
  {
    type: "node", id: 1, lat: 5.9701, lon: 116.0901,
    tags: { amenity: "restaurant", name: "Restoran Fook Yuen", cuisine: "chinese", opening_hours: "Mo-Su 06:30-22:00" },
  },
  {
    type: "way", id: 2, center: { lat: 5.9881, lon: 116.1021 },
    tags: { amenity: "cafe", name: "Kedai Kopi Likas", "addr:suburb": "Likas Bay" },
  },
];

const overture = (over: Partial<OvertureRow>): OvertureRow => ({
  id: "v", name: "X", basic_category: "restaurant", taxonomy_primary: null, taxonomy_hierarchy: null,
  confidence: 0.5, operating_status: "open", addresses: null, sources: null, lat: 5.97, lon: 116.09, ...over,
});

describe("usefulArea", () => {
  it("keeps the first part of an address and drops region-only values", () => {
    expect(usefulArea("Penampang, Kota Kinabalu, Sabah")).toBe("Penampang");
    expect(usefulArea("Damai Plaza Phase III")).toBe("Damai Plaza Phase III");
    for (const s of ["Kota Kinabalu", "kota kinabalu, Sabah", "Kota Kinablau", "KotaKinabalu", "Sabah", "", null, undefined]) {
      expect(usefulArea(s), String(s)).toBe("");
    }
  });
});

describe("nearestArea", () => {
  it("picks the closest named place", () => {
    expect(nearestArea(5.986, 116.1, areas)).toBe("Likas");
    expect(nearestArea(5.97, 116.09, [])).toBe("");
  });
});

describe("buildCandidates", () => {
  const { candidates, matches } = buildCandidates(
    osm,
    [
      overture({ id: "v1", name: "Fook Yuen Cafe", lat: 5.9703, lon: 116.0901, confidence: 0.91 }),
      overture({
        id: "v2", name: "Warung Damai", basic_category: "fast_food_restaurant", lat: 5.9705, lon: 116.0905,
        operating_status: "permanently_closed", addresses: [{ locality: "Kota Kinabalu" }],
      }),
    ],
    areas,
  );

  it("merges matched places into one row", () => {
    expect(matches).toHaveLength(1);
    expect(candidates).toHaveLength(3);
    expect(candidates.find((c) => c.osm_id === "node/1")).toMatchObject({
      candidate_id: "osm:node/1", sources: "osm+overture", overture_id: "v1", name: "Restoran Fook Yuen",
      type: "restaurant", proposed_area: "Damai", proposed_cuisine: "Chinese", overture_confidence: "0.91",
      operating_status: "open", osm_opening_hours: "Mo-Su 06:30-22:00",
    });
  });

  it("prefers address areas, ignores 'Kota Kinabalu', and falls back to the nearest place", () => {
    expect(candidates.find((c) => c.osm_id === "way/2")?.proposed_area).toBe("Likas Bay");
    expect(candidates.find((c) => c.overture_id === "v2")).toMatchObject({
      proposed_area: "Damai", type: "fast_food", sources: "overture", operating_status: "permanently_closed",
    });
  });

  it("sorts by area, then places found in both sources first", () => {
    expect(candidates.map((c) => [c.proposed_area, c.sources])).toEqual([
      ["Damai", "osm+overture"],
      ["Damai", "overture"],
      ["Likas Bay", "osm"],
    ]);
  });

  it("links only to a Google Maps search, has no halal column, and leaves keep and reason empty", () => {
    for (const c of candidates) {
      expect(c.maps_link.startsWith("https://www.google.com/maps/search/?api=1&query=")).toBe(true);
      expect([c.keep, c.reason]).toEqual(["", ""]);
    }
    expect(CSV_COLUMNS.join()).not.toMatch(/halal/i);
    expect(mapsLink("Fook Yuen", "Damai")).toBe("https://www.google.com/maps/search/?api=1&query=Fook%20Yuen%2C%20Damai");
  });
});

describe("toCsv", () => {
  it("quotes cells with commas and quotes", () => {
    const empty = Object.fromEntries(CSV_COLUMNS.map((c) => [c, ""])) as Candidate;
    const csv = toCsv([{ ...empty, name: 'Ah "Lee", Damai' }]);
    expect(csv.split("\n")[1]).toContain('"Ah ""Lee"", Damai"');
  });
});

describe("seededSample", () => {
  it("is repeatable and picks without replacement", () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    expect(seededSample(items, 20, 7)).toEqual(seededSample(items, 20, 7));
    expect(new Set(seededSample(items, 20, 7)).size).toBe(20);
    expect(seededSample(items, 99, 7)).toHaveLength(50);
  });
});
