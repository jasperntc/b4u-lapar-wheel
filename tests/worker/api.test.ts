import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CUISINES, DETAILS_FIELDS, handle, SEARCH_FIELDS, type Env } from "../../worker/api.ts";
import * as entry from "../../worker/index.ts";
import { DAILY_CAP, malaysiaDay, RATE_LIMIT } from "../../worker/limits.ts";
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
  ])("rejects %s without calling Google", async (_, body) => {
    const res = await nearby(fakeEnv().env, body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request" });
    expect(google).not.toHaveBeenCalled();
  });

  it.each([
    ["London", { lat: 51.5, lon: -0.12 }],
    ["Kudat", { lat: 6.88, lon: 116.85 }],
    ["just west of the box", { lat: 5.95, lon: 116.03 }],
  ])("rejects a location in %s as outside_area, without calling Google", async (_, at) => {
    const res = await nearby(fakeEnv().env, { ...at, radiusKm: 2 });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "outside_area" });
    expect(google).not.toHaveBeenCalled();
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
    ["outside_area", () => nearby(fakeEnv().env, { lat: 51.5, lon: -0.12, radiusKm: 1 })],
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
