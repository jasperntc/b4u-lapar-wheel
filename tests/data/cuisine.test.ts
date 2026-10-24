import { describe, expect, it } from "vitest";
import { cuisineFromName, cuisineFromOsm, cuisineFromOverture } from "../../scripts/data/cuisine.ts";

describe("cuisineFromOsm", () => {
  it("maps known cuisine tags", () => {
    expect(cuisineFromOsm({ amenity: "restaurant", cuisine: "chinese;seafood" })).toBe("Chinese");
    expect(cuisineFromOsm({ amenity: "restaurant", cuisine: "Seafood" })).toBe("Seafood");
    expect(cuisineFromOsm({ amenity: "restaurant", cuisine: "kadazan" })).toBe("Sabahan");
  });

  it("leaves malaysian and unknown values blank", () => {
    expect(cuisineFromOsm({ amenity: "restaurant", cuisine: "malaysian" })).toBe("");
    expect(cuisineFromOsm({ amenity: "restaurant", cuisine: "regional;local" })).toBe("");
    expect(cuisineFromOsm({ amenity: "restaurant" })).toBe("");
  });

  it("sets Mamak only from an explicit tag or name", () => {
    expect(cuisineFromOsm({ amenity: "restaurant", cuisine: "nasi_kandar" })).toBe("Mamak");
    expect(cuisineFromOsm({ amenity: "restaurant", name: "Restoran Nasi Kandar Pelita" })).toBe("Mamak");
    expect(cuisineFromOsm({ amenity: "restaurant", cuisine: "indian", name: "Mamak Corner" })).toBe("Indian");
  });

  it("never reads halal tags", () => {
    expect(cuisineFromOsm({ amenity: "restaurant", "diet:halal": "yes" })).toBe("");
    expect(cuisineFromOsm({ amenity: "restaurant", "diet:halal": "only", cuisine: "malaysian" })).toBe("");
  });

  it("uses the kopitiam name rule before generic coffee tags", () => {
    expect(cuisineFromOsm({ amenity: "cafe", name: "Kedai Kopi Yee Fung", cuisine: "coffee_shop" })).toBe("Kopitiam");
    expect(cuisineFromOsm({ amenity: "cafe", name: "Starbucks", cuisine: "coffee_shop" })).toBe("Cafe");
  });

  it("falls back to the amenity for cafes and fast food", () => {
    expect(cuisineFromOsm({ amenity: "fast_food", name: "Somewhere" })).toBe("Fast food");
    expect(cuisineFromOsm({ amenity: "cafe" })).toBe("Cafe");
    expect(cuisineFromOsm({ amenity: "food_court" })).toBe("");
  });
});

describe("cuisineFromOverture", () => {
  const h = (...path: string[]) => ["food_and_drink", ...path];

  it("maps a category and its children", () => {
    const dimSum = h("restaurant", "asian_restaurant", "east_asian_restaurant", "chinese_restaurant", "dim_sum_restaurant");
    const pizza = h("restaurant", "european_restaurant", "mediterranean_restaurant", "italian_restaurant", "pizza_restaurant");
    expect(cuisineFromOverture(dimSum, "X")).toBe("Chinese");
    expect(cuisineFromOverture(pizza, "X")).toBe("Western");
  });

  it("leaves malaysian, halal and plain restaurants blank", () => {
    expect(cuisineFromOverture(h("restaurant", "asian_restaurant", "southeast_asian_restaurant", "malaysian_restaurant"), "X")).toBe("");
    expect(cuisineFromOverture(h("restaurant", "halal_restaurant"), "X")).toBe("");
    expect(cuisineFromOverture(h("restaurant"), "X")).toBe("");
    expect(cuisineFromOverture([], "X")).toBe("");
  });

  it("uses the name rules before generic categories", () => {
    expect(cuisineFromOverture(h("non_alcoholic_beverage_venue", "coffee_shop"), "Kopitiam Damai")).toBe("Kopitiam");
    expect(cuisineFromOverture(h("non_alcoholic_beverage_venue", "coffee_shop"), "Damai Coffee")).toBe("Cafe");
  });
});

describe("cuisineFromName", () => {
  it("only matches whole words", () => {
    expect(cuisineFromName("KOPITIAM 88")).toBe("Kopitiam");
    expect(cuisineFromName("Mamakan")).toBe("");
  });
});
