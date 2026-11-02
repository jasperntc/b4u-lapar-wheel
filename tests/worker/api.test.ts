import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EARTH_RADIUS_M, haversineMeters } from "../../lib/geo.ts";
import { KK_BOX } from "../../content/areas.ts";
import { CUISINES, DETAILS_FIELDS, handle, rectangleAround, SEARCH_FIELDS, type Env } from "../../worker/api.ts";
import * as entry from "../../worker/index.ts";
import { DAILY_CAP, IP_DAILY_CAP, malaysiaDay, RATE_LIMIT } from "../../worker/limits.ts";
import { fakeEnv } from "./fake-env.ts";

// Mocked fetch only: no test ever reaches Google.
const google = vi.fn<typeof fetch>();
beforeEach(() => {
  google.mockReset();
  // A fresh Response per call: a body can only be read once.
  google.mockImplementation(async () => Response.json({ places: [] }));
  vi.stubGlobal("fetch", google);
});
afterEach(() => vi.unstubAllGlobals());

const BASE = "https://built4you.jasperntc.dev/lapar-wheel/api/";
const DAMAI = { lat: 5.97, lon: 116.09 };
const nearby = (env: Env, body: unknown, ip = "198.51.100.1") =>
  handle(
    new Request(`${BASE}nearby`, {
      method: "POST",
      headers: { "CF-Connecting-IP": ip },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    env,
  );
const place = (env: Env, path: string) => handle(new Request(`${BASE}place/${path}`), env);
/** The JSON body of the n-th call to Google. */
const sent = (n = 0) => JSON.parse(google.mock.calls[n][1]?.body as string);
const sentHeaders = (n = 0) => new Headers(google.mock.calls[n][1]?.headers);
/** A point `north` and `east` metres from Damai. */
const offset = (north: number, east: number) => ({
  latitude: DAMAI.lat + north / 111_195,
  longitude: DAMAI.lon + east / (111_195 * Math.cos((DAMAI.lat * Math.PI) / 180)),
});

describe("POST /nearby input", () => {
  it.each([
    ["not JSON", "{lat:"],
    ["an array", [5.97, 116.09]],
    ["a string lat", { ...DAMAI, lat: "5.97", radiusKm: 2 }],
    ["a missing lon", { lat: 5.97, radiusKm: 2 }],
    ["a null lat", { ...DAMAI, lat: null, radiusKm: 2 }],
    ["a 3 km radius", { ...DAMAI, radiusKm: 3 }],
    ["a missing radius", { ...DAMAI }],
    ["an unknown cuisine", { ...DAMAI, radiusKm: 2, cuisine: "halal" }],
    ["an inherited key as cuisine", { ...DAMAI, radiusKm: 2, cuisine: "toString" }],
    ["a rating off the 0.5 steps", { ...DAMAI, radiusKm: 2, minRating: 4.2 }],
    ["a rating above 5", { ...DAMAI, radiusKm: 2, minRating: 5.5 }],
    ["a body over 1 KB", { ...DAMAI, radiusKm: 2, pad: "x".repeat(1024) }],
    ["a latitude above 90", { lat: 90.5, lon: 0, radiusKm: 2 }],
    ["a latitude below -90", { lat: -91, lon: 0, radiusKm: 2 }],
    ["a longitude above 180", { lat: 0, lon: 180.1, radiusKm: 2 }],
    ["a longitude below -180", { lat: 0, lon: -181, radiusKm: 2 }],
  ])("rejects %s without calling Google", async (_, body) => {
    const res = await nearby(fakeEnv().env, body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request" });
    expect(google).not.toHaveBeenCalled();
  });

  it.each([
    ["London", { lat: 51.5, lon: -0.12 }],
    ["Taipei", { lat: 25.033, lon: 121.565 }],
    ["Kudat, outside greater KK", { lat: 6.88, lon: 116.85 }],
    ["the north pole", { lat: 90, lon: 0 }],
    ["the south pole", { lat: -90, lon: 0 }],
    ["longitude 180", { lat: 0, lon: 180 }],
    ["longitude -180", { lat: 0, lon: -180 }],
  ])("searches anywhere: %s", async (_, at) => {
    const res = await nearby(fakeEnv().env, { ...at, radiusKm: 2 });
    expect(res.status).toBe(200);
    expect(google).toHaveBeenCalledTimes(1);
  });

  it("only allows POST", async () => {
    const res = await handle(new Request(`${BASE}nearby`), fakeEnv().env);
    expect(res.status).toBe(405);
  });
});

describe("POST /nearby request to Google", () => {
  it("sends only a location rounded to 3 decimals", async () => {
    await nearby(fakeEnv().env, { lat: 5.983_49, lon: 116.072_51, radiusKm: 2 });
    const { low, high } = sent().locationRestriction.rectangle;
    expect((low.latitude + high.latitude) / 2).toBeCloseTo(5.983, 9);
    expect((low.longitude + high.longitude) / 2).toBeCloseTo(116.073, 9);
    expect(google.mock.calls[0][1]?.body).not.toMatch(/5\.98349|116\.07251/);
  });

  it("asks Text Search for open places with the exact field mask and the key in a header", async () => {
    await nearby(fakeEnv().env, { ...DAMAI, radiusKm: 2 });
    expect(google.mock.calls[0][0]).toBe("https://places.googleapis.com/v1/places:searchText");
    expect(sentHeaders().get("X-Goog-FieldMask")).toBe("places.id,places.displayName,places.location,places.primaryType");
    expect(SEARCH_FIELDS).toBe(sentHeaders().get("X-Goog-FieldMask"));
    expect(sentHeaders().get("X-Goog-Api-Key")).toBe("test-key");
    expect(sent()).toMatchObject({ textQuery: "restaurant", openNow: true, minRating: 4, pageSize: 20 });
    expect(sent()).not.toHaveProperty("includedType");
  });

  it("asks for a rectangle that just holds the circle", async () => {
    await nearby(fakeEnv().env, { ...DAMAI, radiusKm: 5 });
    const { low, high } = sent().locationRestriction.rectangle;
    expect((high.latitude - low.latitude) * 111_195).toBeCloseTo(10_000, -2);
  });

  it("maps a cuisine to its Table A type with strict filtering", async () => {
    await nearby(fakeEnv().env, { ...DAMAI, radiusKm: 2, cuisine: "malaysian" });
    expect(sent()).toMatchObject({
      textQuery: "malaysian restaurant",
      includedType: "malaysian_restaurant",
      strictTypeFiltering: true,
    });
  });

  it("never uses halal_restaurant, and has no Malay type", () => {
    expect(Object.values(CUISINES).map((c) => c.type)).not.toContain("halal_restaurant");
    expect(Object.keys(CUISINES)).not.toContain("malay");
    expect(Object.keys(CUISINES).sort()).toEqual(
      ["cafe", "chinese", "fast-food", "indian", "indonesian", "japanese", "korean", "malaysian", "seafood", "thai"],
    );
  });

  it("sends minRating 4 by default, the chosen value, or none when switched off", async () => {
    const { env } = fakeEnv();
    await nearby(env, { ...DAMAI, radiusKm: 2, minRating: 3.5 }, "a");
    await nearby(env, { ...DAMAI, radiusKm: 2, minRating: null }, "b");
    expect(sent(0).minRating).toBe(3.5);
    expect(sent(1)).not.toHaveProperty("minRating");
  });
});

describe("POST /nearby response", () => {
  it("keeps only places inside the circle, with their distance", async () => {
    google.mockResolvedValue(
      Response.json({
        places: [
          { id: "near", displayName: { text: "Near" }, location: offset(500, 0), primaryType: "chinese_restaurant" },
          { id: "far", displayName: { text: "Far" }, location: offset(1_200, 0), primaryType: "restaurant" },
          // In the rectangle's corner, but 1.27 km away.
          { id: "corner", displayName: { text: "Corner" }, location: offset(900, 900), primaryType: "cafe" },
          { id: "nowhere", displayName: { text: "No location" } },
        ],
      }),
    );
    const res = await nearby(fakeEnv().env, { ...DAMAI, radiusKm: 1 });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.json();
    expect(body.map((p: { id: string }) => p.id)).toEqual(["near"]);
    expect(body[0].distanceM).toBeGreaterThanOrEqual(499);
    expect(body[0].distanceM).toBeLessThanOrEqual(501);
  });

  it("passes on no Google field beyond the mask", async () => {
    google.mockResolvedValue(
      Response.json({
        places: [
          {
            id: "abc",
            displayName: { text: "Kedai Kopi", languageCode: "en" },
            location: offset(100, 0),
            primaryType: "cafe",
            rating: 4.6,
            formattedAddress: "1 Jalan Secret, Damai",
            nationalPhoneNumber: "088-000000",
            businessStatus: "OPERATIONAL",
          },
        ],
        nextPageToken: "token",
      }),
    );
    const body = await (await nearby(fakeEnv().env, { ...DAMAI, radiusKm: 1 })).json();
    expect(body).toHaveLength(1);
    expect(Object.keys(body[0]).sort()).toEqual(["distanceM", "id", "lat", "lon", "name", "primaryType"]);
    expect(body[0]).toMatchObject({ id: "abc", name: "Kedai Kopi", primaryType: "cafe" });
    expect(JSON.stringify(body)).not.toMatch(/4\.6|Secret|088|OPERATIONAL|token|languageCode/);
  });

  it("returns upstream on a Google error, passing none of Google's body through", async () => {
    google.mockResolvedValue(new Response("API key not valid: secret detail", { status: 400 }));
    const res = await nearby(fakeEnv().env, { ...DAMAI, radiusKm: 1 });
    expect(res.status).toBe(502);
    expect(await res.text()).toBe('{"error":"upstream"}');
  });
});

describe("POST /nearby radius", () => {
  const RADII = [1, 2, 5, 10];
  /** The point `meters` from (lat, lon) on `bearing` degrees, on the same sphere as haversineMeters. */
  const destination = (lat: number, lon: number, bearing: number, meters: number) => {
    const rad = Math.PI / 180;
    const a = meters / EARTH_RADIUS_M;
    const [p1, l1, b] = [lat * rad, lon * rad, bearing * rad];
    const p2 = Math.asin(Math.sin(p1) * Math.cos(a) + Math.cos(p1) * Math.sin(a) * Math.cos(b));
    const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(a) * Math.cos(p1), Math.cos(a) - Math.sin(p1) * Math.sin(p2));
    return { latitude: p2 / rad, longitude: l2 / rad };
  };

  /** Whether a longitude falls in Google's range, which wraps across 180 degrees when low > high. */
  const inLongitudes = (lon: number, low: number, high: number) => {
    const x = ((((lon + 180) % 360) + 360) % 360) - 180;
    return low <= high ? x >= low && x <= high : x >= low || x <= high;
  };

  it.each([
    ["Damai", DAMAI.lat, DAMAI.lon],
    ["KK's south edge", KK_BOX.south, DAMAI.lon],
    ["KK's north edge", KK_BOX.north, DAMAI.lon],
    ["Taipei", 25.033, 121.565],
    ["latitude 80", 80, 15],
    ["the date line, in Fiji", -16.5, 179.99],
    ["the date line, from the west", 65, -179.995],
  ])("asks Google for a rectangle that holds the whole circle at every radius, at %s", async (_, lat, lon) => {
    for (const radiusKm of RADII) {
      google.mockClear();
      await nearby(fakeEnv().env, { lat, lon, radiusKm, minRating: null });
      const { low, high } = sent().locationRestriction.rectangle;
      for (const corner of [low, high]) {
        expect(Math.abs(corner.latitude)).toBeLessThanOrEqual(90);
        expect(Math.abs(corner.longitude)).toBeLessThanOrEqual(180);
      }
      for (let bearing = 0; bearing < 360; bearing += 0.5) {
        const p = destination(lat, lon, bearing, radiusKm * 1000 * (1 - 1e-9));
        expect(p.latitude).toBeGreaterThanOrEqual(low.latitude);
        expect(p.latitude).toBeLessThanOrEqual(high.latitude);
        expect(inLongitudes(p.longitude, low.longitude, high.longitude)).toBe(true);
      }
    }
  });

  it("asks for no more than the circle needs: the box's edges are the radius away", () => {
    for (const radiusKm of RADII) {
      const { high } = rectangleAround(DAMAI.lat, DAMAI.lon, radiusKm * 1000);
      expect(haversineMeters(DAMAI.lat, DAMAI.lon, high.latitude, DAMAI.lon)).toBeCloseTo(radiusKm * 1000, 3);
    }
  });

  it("wraps across the date line instead of producing an invalid box", () => {
    const fiji = rectangleAround(-16.5, 179.99, 10_000);
    expect(fiji.low.longitude).toBeGreaterThan(fiji.high.longitude);
    expect(fiji.low.longitude).toBeCloseTo(179.896, 3);
    expect(fiji.high.longitude).toBeCloseTo(-179.916, 3);
    const clear = rectangleAround(0, 175, 10_000);
    expect(clear.low.longitude).toBeLessThan(clear.high.longitude);
  });

  it("returns a place across the date line, with its distance", async () => {
    const across = { id: "east", displayName: { text: "Across" }, location: { latitude: -16.5, longitude: -179.995 }, primaryType: "restaurant" };
    google.mockResolvedValue(Response.json({ places: [across] }));
    const res = await nearby(fakeEnv().env, { lat: -16.5, lon: 179.99, radiusKm: 5 });
    const [p] = await res.json();
    expect(p.id).toBe("east");
    // 0.015 degrees of longitude at 16.5 S is about 1.6 km.
    expect(p.distanceM).toBeGreaterThan(1_500);
    expect(p.distanceM).toBeLessThan(1_700);
  });

  it.each([
    ["north", 89.995],
    ["south", -89.995],
  ])("covers every longitude near the %s pole, with no NaN", async (_, lat) => {
    await nearby(fakeEnv().env, { lat, lon: 0, radiusKm: 10 });
    const body = google.mock.calls[0][1]?.body as string;
    expect(body).not.toMatch(/NaN|null/);
    const { low, high } = sent().locationRestriction.rectangle;
    expect([low.longitude, high.longitude]).toEqual([-180, 180]);
    expect(lat > 0 ? high.latitude : low.latitude).toBe(lat > 0 ? 90 : -90);
  });

  it("finds places in Taipei, and sends no region code", async () => {
    google.mockResolvedValue(
      Response.json({
        places: [
          { id: "tp1", displayName: { text: "鼎泰豐" }, location: { latitude: 25.0335, longitude: 121.5645 }, primaryType: "chinese_restaurant" },
          { id: "far", displayName: { text: "Far" }, location: { latitude: 25.2, longitude: 121.565 }, primaryType: "restaurant" },
        ],
      }),
    );
    const res = await nearby(fakeEnv().env, { lat: 25.033, lon: 121.565, radiusKm: 2 });
    expect(res.status).toBe(200);
    expect((await res.json()).map((p: { id: string }) => p.id)).toEqual(["tp1"]);
    expect(sent()).not.toHaveProperty("regionCode");
    expect(sent().languageCode).toBe("en");
  });

  it("never returns fewer places for a larger radius, given the same Google reply", async () => {
    // Places from 50 m to 12 km out on every bearing, including just inside and outside each radius.
    const distances = [50, 400, 999, 1001, 1500, 1999, 2001, 3500, 4999, 5001, 7500, 9999, 10_001, 12_000];
    const places = distances.flatMap((m, i) =>
      [0, 45, 90, 135, 180, 225, 270, 315].map((bearing) => ({
        id: `p${i}-${bearing}`,
        displayName: { text: `${m} m at ${bearing}°` },
        location: destination(DAMAI.lat, DAMAI.lon, bearing + i, m),
        primaryType: "japanese_restaurant",
      })),
    );
    const ids: string[][] = [];
    for (const radiusKm of RADII) {
      google.mockImplementation(async () => Response.json({ places }));
      const res = await nearby(fakeEnv().env, { ...DAMAI, radiusKm, cuisine: "japanese" });
      ids.push((await res.json()).map((p: { id: string }) => p.id));
    }
    for (let i = 1; i < ids.length; i++) {
      expect(ids[i].length).toBeGreaterThanOrEqual(ids[i - 1].length);
      expect(ids[i]).toEqual(expect.arrayContaining(ids[i - 1]));
    }
    // And each radius keeps exactly the places within it.
    expect(ids.map((list) => list.length)).toEqual([3, 6, 9, 12].map((n) => n * 8));
  });
});

describe("limits", () => {
  it(`returns rate_limited after ${RATE_LIMIT} requests a minute from one IP`, async () => {
    const { env } = fakeEnv();
    for (let i = 0; i < RATE_LIMIT; i++) expect((await nearby(env, { ...DAMAI, radiusKm: 1 })).status).toBe(200);
    const res = await nearby(env, { ...DAMAI, radiusKm: 1 });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    expect(await res.json()).toEqual({ error: "rate_limited" });
    expect(google).toHaveBeenCalledTimes(RATE_LIMIT);
  });

  it(`returns ip_daily_cap after ${IP_DAILY_CAP} Google calls in a day from one IP, without blocking another`, async () => {
    vi.useFakeTimers({ now: new Date("2026-11-02T04:00:00Z") });
    try {
      const { env } = fakeEnv();
      for (let i = 0; i < IP_DAILY_CAP; i++) {
        expect((await nearby(env, { ...DAMAI, radiusKm: 1 }, "198.51.100.9")).status).toBe(200);
        vi.advanceTimersByTime(3_100); // under 20 a minute, so only the daily limit applies
      }
      const res = await nearby(env, { ...DAMAI, radiusKm: 1 }, "198.51.100.9");
      expect(res.status).toBe(429);
      expect(await res.json()).toEqual({ error: "ip_daily_cap" });
      // 30 calls 3.1 s apart end at 04:01:33 UTC, 12:01:33 in Malaysia: 11:58:27 to midnight there.
      expect(res.headers.get("Retry-After")).toBe(String(12 * 3600 - 93));
      expect(google).toHaveBeenCalledTimes(IP_DAILY_CAP);
      expect((await nearby(env, { ...DAMAI, radiusKm: 1 }, "198.51.100.10")).status).toBe(200);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns daily_cap once today's Google calls are used, on both endpoints", async () => {
    const { env, store } = fakeEnv();
    store.set("cap", { day: malaysiaDay(Date.now()), count: DAILY_CAP });
    for (const res of [await nearby(env, { ...DAMAI, radiusKm: 1 }), await place(env, "ChIJabc")]) {
      expect(res.status).toBe(429);
      expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
      expect(await res.json()).toEqual({ error: "daily_cap" });
    }
    expect(google).not.toHaveBeenCalled();
  });

  it("counts both endpoints toward the cap", async () => {
    const { env, store } = fakeEnv();
    await nearby(env, { ...DAMAI, radiusKm: 1 });
    await place(env, "ChIJabc");
    expect(store.get("cap")).toMatchObject({ count: 2 });
  });
});

describe("GET /place/:id", () => {
  it("checks businessStatus (Pro) by default, for share links", async () => {
    google.mockResolvedValue(Response.json({ id: "ChIJabc", displayName: { text: "Kedai" }, businessStatus: "OPERATIONAL" }));
    const res = await place(fakeEnv().env, "ChIJabc");
    expect(google.mock.calls[0][0]).toBe("https://places.googleapis.com/v1/places/ChIJabc?languageCode=en");
    expect(sentHeaders().get("X-Goog-FieldMask")).toBe("id,displayName,businessStatus");
    expect(await res.json()).toEqual({ id: "ChIJabc", name: "Kedai", available: true });
  });

  it("marks a closed place unavailable", async () => {
    google.mockResolvedValue(Response.json({ displayName: { text: "Kedai" }, businessStatus: "CLOSED_PERMANENTLY" }));
    expect(await (await place(fakeEnv().env, "ChIJabc?check=status")).json()).toMatchObject({ available: false });
  });

  it("checks openNow (Enterprise) only when asked, for halal picks", async () => {
    google.mockResolvedValue(Response.json({ displayName: { text: "Kedai" }, currentOpeningHours: { openNow: true } }));
    const res = await place(fakeEnv().env, "ChIJabc?check=openNow");
    expect(sentHeaders().get("X-Goog-FieldMask")).toBe(DETAILS_FIELDS.openNow);
    expect(DETAILS_FIELDS.openNow).toBe("id,displayName,currentOpeningHours.openNow");
    expect(await res.json()).toEqual({ id: "ChIJabc", name: "Kedai", available: true });
  });

  it.each([
    ["closed now", { currentOpeningHours: { openNow: false } }],
    ["with no hours", {}],
  ])("marks a place %s unavailable", async (_, extra) => {
    google.mockResolvedValue(Response.json({ displayName: { text: "Kedai" }, ...extra }));
    expect(await (await place(fakeEnv().env, "ChIJabc?check=openNow")).json()).toMatchObject({ available: false });
  });

  it("answers not available when Google doesn't know the place", async () => {
    google.mockResolvedValue(Response.json({ error: { code: 404 } }, { status: 404 }));
    expect(await (await place(fakeEnv().env, "ChIJgone")).json()).toEqual({ id: "ChIJgone", name: null, available: false });
  });

  it("returns upstream for other Google errors, such as a bad key", async () => {
    google.mockResolvedValue(new Response("API key not valid", { status: 400 }));
    const res = await place(fakeEnv().env, "ChIJabc");
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "upstream" });
  });

  it("passes on only id, name and available", async () => {
    google.mockResolvedValue(
      Response.json({ displayName: { text: "Kedai" }, businessStatus: "OPERATIONAL", rating: 4.9, formattedAddress: "Secret" }),
    );
    expect(Object.keys(await (await place(fakeEnv().env, "ChIJabc")).json()).sort()).toEqual(["available", "id", "name"]);
  });

  it.each([["%24bad"], ["a/b"], ["ChIJabc?check=rating"], ["ChIJabc?check="]])("rejects %s without calling Google", async (path) => {
    const res = await place(fakeEnv().env, path);
    expect(res.status).toBe(400);
    expect(google).not.toHaveBeenCalled();
  });
});

describe("encoding", () => {
  const JSON_UTF8 = "application/json; charset=utf-8";
  const NAME = "亚庇海鲜餐厅";
  /** Google's reply as raw UTF-8 bytes, the way it arrives on the wire. */
  const bytes = (body: unknown) =>
    new Response(new TextEncoder().encode(JSON.stringify(body)), { headers: { "Content-Type": JSON_UTF8 } });
  /** Our reply decoded strictly as UTF-8, so a mis-encoded byte throws. */
  const decoded = async (res: Response) =>
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await res.arrayBuffer()));

  it.each([
    ["nearby", () => nearby(fakeEnv().env, { ...DAMAI, radiusKm: 1 })],
    ["place", () => place(fakeEnv().env, "ChIJabc")],
    ["bad_request", () => nearby(fakeEnv().env, "{lat:")],
    ["method_not_allowed", () => handle(new Request(`${BASE}nearby`), fakeEnv().env)],
    ["not_found", () => handle(new Request(`${BASE}spin`), fakeEnv().env)],
  ])("sends %s as JSON in UTF-8", async (_, call) => {
    expect((await call()).headers.get("Content-Type")).toBe(JSON_UTF8);
  });

  it("round-trips a Chinese name through /nearby", async () => {
    google.mockResolvedValue(
      bytes({ places: [{ id: "cn", displayName: { text: NAME }, location: offset(100, 0), primaryType: "chinese_restaurant" }] }),
    );
    const res = await nearby(fakeEnv().env, { ...DAMAI, radiusKm: 1 });
    expect((await decoded(res))[0].name).toBe(NAME);
  });

  it("round-trips a Chinese name through /place", async () => {
    google.mockResolvedValue(bytes({ id: "cn", displayName: { text: NAME }, businessStatus: "OPERATIONAL" }));
    expect(await decoded(await place(fakeEnv().env, "cn"))).toEqual({ id: "cn", name: NAME, available: true });
  });
});

describe("routing", () => {
  it("exports only the handler and the Durable Object from the entry, or workerd refuses to start", () => {
    expect(Object.keys(entry).sort()).toEqual(["Limits", "default"]);
  });

  it("hands every non-API path to static assets", async () => {
    const res = await handle(new Request("https://built4you.jasperntc.dev/lapar-wheel"), fakeEnv().env);
    expect(await res.text()).toBe("static asset");
  });

  it("answers not_found for unknown API paths", async () => {
    const res = await handle(new Request(`${BASE}spin`), fakeEnv().env);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });
});
