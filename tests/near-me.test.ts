import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SEGMENT_COLOURS, segmentColour } from "../components/Wheel";
import {
  awaitSpin,
  cachedPlaces,
  actionLabel,
  CUISINE_LABELS,
  emptyActions,
  emptyBody,
  emptyKicker,
  errorNotice,
  filterSummary,
  foodSearchUrl,
  formatDistance,
  mapsUrl,
  RADII_KM,
  refusedMessage,
  resetKicker,
  searchNearby,
  SPIN_MS,
  wheelRotation,
} from "../lib/near-me";
import { laparToken } from "../lib/tokens";
import { CUISINES } from "../worker/api";
import { IP_DAILY_CAP } from "../worker/limits";

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
    ["rate_limited", "Slow down", "Try again in a minute.", false],
    ["ip_daily_cap", "You’ve used today’s spins", "Everyone gets 30 a day. They come back at 12\u00a0am Malaysia time.", true],
    [
      "daily_cap",
      "Out of spins for today",
      "Lapar Wheel has a daily limit so it stays free. Spins come back at 12\u00a0am Malaysia time.",
      true,
    ],
    ["upstream", "Something went wrong", null, false],
    ["bad_request", "Something went wrong", null, false],
    ["outside_area", "Something went wrong", null, false],
    ["toString", "Something went wrong", null, false],
  ])("%s reads %s", (code, headline, body, cap) => {
    expect(errorNotice(code)).toEqual({ headline, body, cap });
  });

  it("states the Worker's per-IP daily limit", () => {
    expect(errorNotice("ip_daily_cap").body).toContain(`${IP_DAILY_CAP} a day`);
  });

  it("offers the KK area picker on refusal only when we don't know the user is elsewhere", () => {
    expect(refusedMessage(false)).toBe("Allow location to spin near you, or pick an area in Kota Kinabalu.");
    expect(refusedMessage(true)).toBe("Allow location to spin near you.");
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
  it("reaches the same segment backwards, by negative rotation, when told to", () => {
    for (const n of [1, 3, 8, 20]) {
      for (let index = 0; index < n; index++) {
        const current = 123.4;
        const back = wheelRotation(current, index, n, -1);
        expect(current - back).toBeGreaterThanOrEqual(5 * 360);
        expect(current - back).toBeLessThan(6 * 360);
        const centre = ((((index + 0.5) * 360) / n + back) % 360 + 360) % 360;
        expect(Math.min(centre, 360 - centre)).toBeCloseTo(0, 6);
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

describe("nothing open", () => {
  const f = { radiusKm: 2, cuisine: "", ratingOn: false };

  it.each([
    [f, "Within 2 km"],
    [{ ...f, ratingOn: true }, "Within 2 km, rated 4.0 and up"],
    [{ ...f, radiusKm: 5, cuisine: "fast-food" }, "Within 5 km, Fast food"],
    [{ radiusKm: 10, cuisine: "japanese", ratingOn: true }, "Within 10 km, Japanese, rated 4.0 and up"],
  ])("the kicker for %o reads %s", (filters, text) => {
    expect(emptyKicker(filters)).toBe(text);
  });

  it("says it's as far as it goes only at 10 km", () => {
    for (const r of [1, 2, 5]) expect(emptyBody(r)).toBeNull();
    expect(emptyBody(10)).toBe("That’s as far as it goes. Loosen a filter to see more.");
  });

  const labels = (filters: typeof f) => emptyActions(filters).map(actionLabel);
  it.each([
    [{ radiusKm: 1, cuisine: "", ratingOn: false }, ["Try 2 km"]],
    [{ radiusKm: 2, cuisine: "", ratingOn: true }, ["Try 5 km", "Any rating"]],
    [{ radiusKm: 5, cuisine: "thai", ratingOn: false }, ["Try 10 km", "Any cuisine"]],
    [{ radiusKm: 5, cuisine: "thai", ratingOn: true }, ["Try 10 km", "Any cuisine"]],
    [{ radiusKm: 10, cuisine: "thai", ratingOn: true }, ["Any cuisine", "Any rating"]],
    [{ radiusKm: 10, cuisine: "thai", ratingOn: false }, ["Any cuisine"]],
    [{ radiusKm: 10, cuisine: "", ratingOn: true }, ["Any rating"]],
    [{ radiusKm: 10, cuisine: "", ratingOn: false }, ["Find food in Google Maps"]],
  ])("the buttons for %o are %o", (filters, expected) => {
    expect(labels(filters)).toEqual(expected);
  });

  it("searches Google Maps for the cuisine, or just restaurants", () => {
    const query = (cuisine: string) => {
      const url = new URL(foodSearchUrl(cuisine));
      expect(`${url.origin}${url.pathname}`).toBe("https://www.google.com/maps/search/");
      expect([...url.searchParams.keys()]).toEqual(["api", "query"]);
      expect(url.searchParams.get("api")).toBe("1");
      return url.searchParams.get("query");
    };
    expect(query("")).toBe("restaurants");
    expect(query("japanese")).toBe("Japanese restaurants");
    expect(query("fast-food")).toBe("Fast food restaurants");
  });
});

describe("resetKicker", () => {
  // 2026-11-04 02:00 UTC is 10:00 in Malaysia, so spins come back at 2026-11-04 16:00 UTC.
  const morning = new Date(Date.UTC(2026, 10, 4, 2));

  it.each([
    ["Asia/Kuala_Lumpur", "en-MY", "Back at midnight"],
    ["Asia/Taipei", "en-MY", "Back at midnight"],
    ["Europe/Berlin", "en-MY", "Back at 5 pm your time"],
    ["Europe/Berlin", "en-GB", "Back at 17:00 your time"],
    // Still 3 November there: spins come back the next calendar day, at 8 am.
    ["America/Los_Angeles", "en-US", "Back at 8 AM your time"],
    ["Asia/Kolkata", "en-MY", "Back at 9:30 pm your time"],
  ])("in %s (%s) reads %s", (timeZone, locale, text) => {
    expect(resetKicker(morning, timeZone, locale)).toBe(text);
  });

  it("is the coming midnight in Malaysia, even a minute before or after one", () => {
    // 15:59 UTC is 23:59 in Malaysia: one minute to go. 16:01 UTC is just past it: a full day.
    expect(resetKicker(new Date(Date.UTC(2026, 10, 4, 15, 59)), "Europe/Berlin", "en-MY")).toBe("Back at 5 pm your time");
    expect(resetKicker(new Date(Date.UTC(2026, 10, 4, 16, 1)), "Europe/Berlin", "en-MY")).toBe("Back at 5 pm your time");
    expect(resetKicker(new Date(Date.UTC(2026, 10, 4, 16, 1)), "Asia/Kuala_Lumpur", "en-MY")).toBe("Back at midnight");
  });

  it("follows daylight saving where the device has it", () => {
    // In July Berlin is UTC+2, so Malaysian midnight (16:00 UTC) is 6 pm there.
    expect(resetKicker(new Date(Date.UTC(2026, 6, 1, 2)), "Europe/Berlin", "en-MY")).toBe("Back at 6 pm your time");
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

  // The paper is the same cream in both looks.
  it.each([
    ["paper-ink", "paper"],
    ["paper-kicker", "paper"],
    ["on-paper-action", "paper-action"],
  ])("%s on %s meets AA in both looks", (text, background) => {
    for (const look of looks) {
      expect(contrast(laparToken(text)[look], laparToken(background)[look]), look).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("the paper's pairs match the spec's ratios", () => {
    const paper = laparToken("paper").day;
    expect(contrast(laparToken("paper-ink").day, paper)).toBeCloseTo(13.9, 1);
    expect(contrast(laparToken("paper-kicker").day, paper)).toBeCloseTo(5.3, 1);
    expect(contrast(laparToken("paper-kicker").night, paper)).toBeCloseTo(5.5, 1);
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
    const onLanded = awaitSpin(show, { hidden: true, reducedMotion: false });
    expect(show).toHaveBeenCalledTimes(1);
    onLanded();
    vi.runAllTimers();
    expect(show).toHaveBeenCalledTimes(1);
  });

  it("shows the result at once under reduced motion, and only once", () => {
    const show = vi.fn();
    const onLanded = awaitSpin(show, { hidden: false, reducedMotion: true });
    expect(show).toHaveBeenCalledTimes(1);
    onLanded();
    vi.runAllTimers();
    expect(show).toHaveBeenCalledTimes(1);
  });

  it("still shows the result when the landing never finishes (a hidden tab pauses frames)", () => {
    const show = vi.fn();
    awaitSpin(show, animated);
    vi.advanceTimersByTime(SPIN_MS + 299);
    expect(show).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(show).toHaveBeenCalledTimes(1);
  });

  it("shows the result when the landing finishes, and once only when the timer fires too", () => {
    const show = vi.fn();
    const onLanded = awaitSpin(show, animated);
    vi.advanceTimersByTime(SPIN_MS);
    onLanded();
    expect(show).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1_000);
    onLanded();
    expect(show).toHaveBeenCalledTimes(1);
  });

  it("shows the result once when the timer wins and the landing finishes late", () => {
    const show = vi.fn();
    const onLanded = awaitSpin(show, animated);
    vi.advanceTimersByTime(SPIN_MS + 300);
    onLanded();
    expect(show).toHaveBeenCalledTimes(1);
  });
});
