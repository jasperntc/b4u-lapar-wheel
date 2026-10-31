import { afterEach, describe, expect, it, vi } from "vitest";
import { WHEEL_COLOURS, WHEEL_TEXT, segmentColour } from "../components/Wheel";
import { brandToken } from "../lib/brand-tokens";
import {
  cachedPlaces,
  CUISINE_LABELS,
  emptyMessage,
  errorMessage,
  formatDistance,
  mapsUrl,
  nextRadius,
  RADII_KM,
  searchNearby,
  wheelRotation,
} from "../lib/near-me";
import { CUISINES } from "../worker/api";

afterEach(() => vi.unstubAllGlobals());

describe("formatDistance", () => {
  it.each([
    [0, "0 m"],
    [44, "40 m"],
    [994, "990 m"],
    [995, "1.0 km"],
    [1000, "1.0 km"],
    [12_345, "12.3 km"],
  ])("%s m reads %s", (m, text) => {
    expect(formatDistance(m)).toBe(text);
  });
});

describe("mapsUrl", () => {
  it("searches by name with the place ID, encoding the name", () => {
    const url = new URL(mapsUrl("Kedai Kopi & Mee 亚庇", "ChIJabc"));
    expect(`${url.origin}${url.pathname}`).toBe("https://www.google.com/maps/search/");
    expect(url.searchParams.get("api")).toBe("1");
    expect(url.searchParams.get("query")).toBe("Kedai Kopi & Mee 亚庇");
    expect(url.searchParams.get("query_place_id")).toBe("ChIJabc");
    expect([...url.searchParams.keys()]).toEqual(["api", "query", "query_place_id"]);
  });
});

describe("messages", () => {
  it.each([
    ["outside_area", "Lapar Wheel only covers greater Kota Kinabalu for now."],
    ["rate_limited", "Slow down, try again in a minute."],
    ["daily_cap", "Lapar Wheel is out of spins for today."],
    ["upstream", "Something went wrong, try again."],
    ["bad_request", "Something went wrong, try again."],
    ["toString", "Something went wrong, try again."],
  ])("%s reads %s", (code, text) => {
    expect(errorMessage(code)).toBe(text);
  });

  it("suggests the next radius up when nothing is open", () => {
    const copy = (r: number) => [emptyMessage(r), nextRadius(r) && `Try ${nextRadius(r)} km?`].filter(Boolean).join(" ");
    expect(copy(1)).toBe("Nothing open within 1 km. Try 2 km?");
    expect(copy(2)).toBe("Nothing open within 2 km. Try 5 km?");
    expect(copy(5)).toBe("Nothing open within 5 km. Try 10 km?");
    expect(copy(10)).toBe("Nothing open within 10 km.");
  });

  it("offers exactly the Worker's cuisines, plus Any", () => {
    expect(Object.keys(CUISINE_LABELS).filter(Boolean).sort()).toEqual(Object.keys(CUISINES).sort());
    expect(CUISINE_LABELS[""]).toBe("Any");
    expect(JSON.stringify(CUISINE_LABELS)).not.toMatch(/halal/i);
  });

  it("offers the Worker's radii", () => {
    expect([...RADII_KM]).toEqual([1, 2, 5, 10]);
  });
});

describe("cachedPlaces", () => {
  const place = { id: "a", name: "A", lat: 5.97, lon: 116.09, primaryType: "restaurant", distanceM: 120 };

  it("reuses a non-empty result for the same request, so Spin again costs no Google call", () => {
    expect(cachedPlaces({ key: "k", places: [place] }, "k")).toEqual([place]);
  });

  it("fetches again after an empty result, because Google sometimes answers the same search with nothing", () => {
    expect(cachedPlaces({ key: "k", places: [] }, "k")).toBeNull();
  });

  it("fetches when the request changed or nothing was fetched yet", () => {
    expect(cachedPlaces({ key: "k", places: [place] }, "other")).toBeNull();
    expect(cachedPlaces(null, "k")).toBeNull();
  });
});

describe("wheelRotation", () => {
  it("always lands the picked segment's centre under the pointer, turning forward", () => {
    for (const n of [1, 2, 3, 7, 8, 13, 20]) {
      let current = 0;
      for (let index = 0; index < n; index++) {
        const next = wheelRotation(current, index, n);
        expect(next - current).toBeGreaterThanOrEqual(5 * 360);
        expect(next - current).toBeLessThan(6 * 360);
        // Where the segment's centre ends up, clockwise from the top.
        const centre = (((index + 0.5) * 360) / n + next) % 360;
        expect(Math.min(centre, 360 - centre)).toBeCloseTo(0, 6);
        current = next;
      }
    }
  });
});

describe("wheel colours", () => {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  it.each(WHEEL_COLOURS)("text on %s meets AA in both themes", (colour) => {
    const fill = brandToken(`wheel-${colour}`);
    const text = brandToken(WHEEL_TEXT[colour]);
    expect(contrast(fill.light, text.light)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(fill.dark, text.dark)).toBeGreaterThanOrEqual(4.5);
  });

  it("never gives neighbouring segments the same colour, including last and first", () => {
    for (let n = 2; n <= 20; n++) {
      for (let i = 0; i < n; i++) expect(segmentColour(i, n)).not.toBe(segmentColour((i + 1) % n, n));
    }
  });
});

describe("searchNearby (mocked fetch)", () => {
  const reply = (body: unknown, status = 200) => vi.stubGlobal("fetch", vi.fn(async () => Response.json(body, { status })));
  const ask = () => searchNearby({ lat: 5.97, lon: 116.09, radiusKm: 2 });

  it("posts the body to the API under the base path", async () => {
    const fetch = vi.fn(async () => Response.json([]));
    vi.stubGlobal("fetch", fetch);
    await searchNearby({ lat: 5.97, lon: 116.09, radiusKm: 2, minRating: null }, "/lapar-wheel/");
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/lapar-wheel/api/nearby");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ lat: 5.97, lon: 116.09, radiusKm: 2, minRating: null });
  });

  it("returns the places", async () => {
    const place = { id: "a", name: "A", lat: 5.97, lon: 116.09, primaryType: "restaurant", distanceM: 120 };
    reply([place]);
    expect(await ask()).toEqual({ ok: true, places: [place] });
  });

  it("passes on the Worker's error code", async () => {
    reply({ error: "daily_cap" }, 429);
    expect(await ask()).toEqual({ ok: false, error: "daily_cap" });
  });

  it("treats a network failure or an unreadable reply as upstream", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("offline"))));
    expect(await ask()).toEqual({ ok: false, error: "upstream" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 502 })));
    expect(await ask()).toEqual({ ok: false, error: "upstream" });
  });
});
