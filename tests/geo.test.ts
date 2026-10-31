import { describe, expect, it } from "vitest";
import { haversineMeters } from "../lib/geo.ts";

describe("haversineMeters", () => {
  it("measures short distances", () => {
    expect(haversineMeters(5.98, 116.07, 5.98 + 75 / 111_195, 116.07)).toBeCloseTo(75, 0);
  });
});
