import { describe, expect, it } from "vitest";
import { regions } from "../content/regions";
import { restaurants } from "../content/restaurants";
import type { Halal } from "../content/types";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Today in Kota Kinabalu, where halal checks are dated, whatever the machine's time zone. */
function today(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
}

function isRealDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Why a halal entry is invalid, or null if it's fine. */
function halalProblem(halal: Halal): string | null {
  if (halal.status !== "certified") return null;
  if (!halal.source.trim()) return "certified without a source";
  if (!isRealDate(halal.checkedAt)) return `checkedAt "${halal.checkedAt}" isn't a real YYYY-MM-DD date`;
  if (halal.checkedAt > today()) return `checkedAt ${halal.checkedAt} is in the future`;
  return null;
}

describe("halal check", () => {
  it("accepts certified entries with a source and a past date, and the other states", () => {
    expect(halalProblem({ status: "certified", source: "JAKIM directory", checkedAt: "2026-10-01" })).toBeNull();
    expect(halalProblem({ status: "not-halal" })).toBeNull();
    expect(halalProblem({ status: "unknown" })).toBeNull();
  });

  it("rejects certified entries without a source or a valid checkedAt", () => {
    const bad = [
      { source: "", checkedAt: "2026-10-01" },
      { source: "   ", checkedAt: "2026-10-01" },
      { source: "JAKIM directory", checkedAt: "" },
      { source: "JAKIM directory", checkedAt: "2026-02-30" },
      { source: "JAKIM directory", checkedAt: "1/10/2026" },
      { source: "JAKIM directory", checkedAt: "9999-12-31" },
    ];
    for (const h of bad) {
      expect(halalProblem({ status: "certified", ...h }), JSON.stringify(h)).not.toBeNull();
    }
  });
});

describe("regions", () => {
  it("have unique, well-formed ids and a name", () => {
    const ids = regions.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of regions) {
      expect(r.id).toMatch(SLUG);
      expect(r.name.trim(), r.id).not.toBe("");
    }
  });

  it("launch with Kota Kinabalu", () => {
    expect(regions.map((r) => r.id)).toContain("kota-kinabalu");
  });
});

describe("restaurants", () => {
  it("have unique, well-formed ids", () => {
    const ids = restaurants.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(SLUG);
  });

  it("belong to a known region", () => {
    const known = regions.map((r) => r.id);
    for (const r of restaurants) expect(known, r.id).toContain(r.regionId);
  });

  it("fill in name, area and cuisine", () => {
    for (const r of restaurants) {
      expect(r.name.trim(), r.id).not.toBe("");
      expect(r.area.trim(), r.id).not.toBe("");
      expect(r.cuisine.trim(), r.id).not.toBe("");
    }
  });

  it("mark certified halal only with a source and a real, past checkedAt", () => {
    const problems = restaurants.flatMap((r) => {
      const p = halalProblem(r.halal);
      return p ? [`${r.id}: ${p}`] : [];
    });
    expect(problems).toEqual([]);
  });
});
