import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SEGMENT_COLOURS, segmentColour } from "../components/Wheel";
import {
  awaitSpin,
  cachedPlaces,
  CUISINE_LABELS,
  emptyMessage,
  errorMessage,
  filterSummary,
  formatDistance,
  mapsUrl,
  nextRadius,
  RADII_KM,
  refusedMessage,
  searchNearby,
  SPIN_MS,
  wheelRotation,
} from "../lib/near-me";
import { laparToken } from "../lib/tokens";
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
    ["rate_limited", "Slow down, try again in a minute."],
    ["ip_daily_cap", "You’ve used today’s spins. Try again tomorrow."],
    ["daily_cap", "Lapar Wheel is out of spins for today."],
    ["upstream", "Something went wrong, try again."],
    ["bad_request", "Something went wrong, try again."],
    ["outside_area", "Something went wrong, try again."],
    ["toString", "Something went wrong, try again."],
  ])("%s reads %s", (code, text) => {
    expect(errorMessage(code)).toBe(text);
  });

  it("offers the KK area picker on refusal only when we don't know the user is elsewhere", () => {
    expect(refusedMessage(false)).toBe("Allow location to spin near you, or pick an area in Kota Kinabalu.");
    expect(refusedMessage(true)).toBe("Allow location to spin near you.");
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
    expect(CUISINE_LABELS[""]).toBe("Any cuisine");
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

describe("filterSummary", () => {
  const f = { areaName: null, radiusKm: 2, cuisine: "", ratingOn: true };

  it.each([
    [f, "Near you, within 2 km, any cuisine, rated 4.0 and up"],
    [{ ...f, areaName: "Likas", radiusKm: 5 }, "In Likas, within 5 km, any cuisine, rated 4.0 and up"],
    [{ ...f, cuisine: "fast-food", ratingOn: false }, "Near you, within 2 km, fast food, any rating"],
  ])("%o reads %s", (filters, text) => {
    expect(filterSummary(filters)).toBe(text);
  });
});

describe("colours", () => {
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
  const looks = ["day", "night"] as const;

  it.each(Array.from({ length: SEGMENT_COLOURS }, (_, i) => i + 1))("text on wheel segment %i meets AA in both looks", (k) => {
    const fill = laparToken(`seg-${k}`);
    const text = laparToken(`seg-${k}-text`);
    for (const look of looks) expect(contrast(fill[look], text[look]), look).toBeGreaterThanOrEqual(4.5);
  });

  // Every text and background pair in docs/redesign.md's token tables.
  it.each([
    ["ink", "ground"],
    ["ink-soft", "ground"],
    ["ink", "panel"],
    ["ink-soft", "panel"],
    ["ink", "field"],
    ["accent", "panel"],
    ["on-accent", "accent"],
    ["on-spin", "spin"],
    ["on-maps", "maps"],
  ])("%s on %s meets AA in both looks", (text, background) => {
    for (const look of looks) {
      expect(contrast(laparToken(text)[look], laparToken(background)[look]), look).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("the title meets AA on the day signboard and the night ground", () => {
    const title = laparToken("title-ink");
    expect(contrast(title.day, laparToken("sign").day)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(title.night, laparToken("ground").night)).toBeGreaterThanOrEqual(4.5);
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

describe("awaitSpin", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const animated = { hidden: false, reducedMotion: false };

  it("shows the result at once on a hidden page, and only once", () => {
    const show = vi.fn();
    const onTransitionEnd = awaitSpin(show, { hidden: true, reducedMotion: false });
    expect(show).toHaveBeenCalledTimes(1);
    onTransitionEnd();
    vi.runAllTimers();
    expect(show).toHaveBeenCalledTimes(1);
  });

  it("shows the result at once under reduced motion, and only once", () => {
    const show = vi.fn();
    const onTransitionEnd = awaitSpin(show, { hidden: false, reducedMotion: true });
    expect(show).toHaveBeenCalledTimes(1);
    onTransitionEnd();
    vi.runAllTimers();
    expect(show).toHaveBeenCalledTimes(1);
  });

  it("still shows the result when transitionend never fires", () => {
    const show = vi.fn();
    awaitSpin(show, animated);
    vi.advanceTimersByTime(SPIN_MS + 299);
    expect(show).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(show).toHaveBeenCalledTimes(1);
  });

  it("shows the result on transitionend, and once only when the timer fires too", () => {
    const show = vi.fn();
    const onTransitionEnd = awaitSpin(show, animated);
    vi.advanceTimersByTime(SPIN_MS);
    onTransitionEnd();
    expect(show).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1_000);
    onTransitionEnd();
    expect(show).toHaveBeenCalledTimes(1);
  });

  it("shows the result once when the timer wins and transitionend comes late", () => {
    const show = vi.fn();
    const onTransitionEnd = awaitSpin(show, animated);
    vi.advanceTimersByTime(SPIN_MS + 300);
    onTransitionEnd();
    expect(show).toHaveBeenCalledTimes(1);
  });
});
