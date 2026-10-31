import { describe, expect, it } from "vitest";
import { matchPlaces, nameSimilarity, nameTokens } from "../../scripts/data/match.ts";

// One metre of latitude is 1 / 111,195 of a degree.
const at = (id: string, name: string, metersNorth: number) => ({ id, name, lat: 5.98 + metersNorth / 111_195, lon: 116.07 });

describe("names", () => {
  it("drop accents, punctuation and generic eatery words", () => {
    expect(nameTokens("Restoran Kedai Kopi Fook Yuen, Sdn. Bhd.")).toEqual(["fook", "yuen"]);
    expect(nameTokens("Café Ño")).toEqual(["no"]);
  });

  it("score 1 when one name contains the other, else shared words", () => {
    expect(nameSimilarity("Restoran Fook Yuen", "Fook Yuen Cafe")).toBe(1);
    expect(nameSimilarity("Welcome Seafood", "Welcome Seafood Restaurant Kepayan")).toBe(1);
    expect(nameSimilarity("Nasi Lemak Bumbung", "Nasi Kandar Bumbung")).toBe(0.5);
    expect(nameSimilarity("Sri Latha", "Yee Fung")).toBe(0);
    expect(nameSimilarity("Restoran", "Restaurant")).toBe(0);
  });
});

describe("matchPlaces", () => {
  it("matches the same place 40 m apart with a variant name", () => {
    expect(matchPlaces([at("o1", "Restoran Fook Yuen", 0)], [at("v1", "Fook Yuen Cafe", 40)])).toMatchObject([
      { osmId: "o1", overtureId: "v1", similarity: 1 },
    ]);
  });

  it("doesn't match the same name 120 m apart", () => {
    expect(matchPlaces([at("o1", "Fook Yuen", 0)], [at("v1", "Fook Yuen", 120)])).toEqual([]);
  });

  it("doesn't match different names 10 m apart", () => {
    expect(matchPlaces([at("o1", "Sri Latha", 0)], [at("v1", "Yee Fung", 10)])).toEqual([]);
  });

  it("pairs one-to-one, closest first", () => {
    const osm = [at("o1", "Fook Yuen", 0), at("o2", "Fook Yuen", 50)];
    const overture = [at("v1", "Fook Yuen", 45)];
    expect(matchPlaces(osm, overture).map((m) => [m.osmId, m.overtureId])).toEqual([["o2", "v1"]]);
  });
});
