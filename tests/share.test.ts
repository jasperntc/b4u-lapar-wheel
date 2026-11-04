import { afterEach, describe, expect, it, vi } from "vitest";
import {
  capMapsUrl,
  checkPlace,
  COPIED,
  flashCopied,
  readShareId,
  sharedView,
  sharePick,
  shareUrl,
  withoutP,
} from "../lib/share";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const ID = "ChIJN1t_tDeuEmsRUsoyG83frY4";

describe("readShareId", () => {
  it("accepts a place ID of 16 to 256 URL-safe characters", () => {
    expect(readShareId(`?p=${ID}`)).toEqual({ id: ID });
    expect(readShareId(`?p=${"a".repeat(16)}`)).toEqual({ id: "a".repeat(16) });
    expect(readShareId(`?p=${"a".repeat(256)}`)).toEqual({ id: "a".repeat(256) });
  });

  it.each([
    ["too short", "a".repeat(15)],
    ["too long", "a".repeat(257)],
    ["a dot", `${ID}.x`],
    ["a slash", `${ID}%2Fx`],
    ["a percent sign", `${ID}%25`],
    ["a space", `${ID}%20x`],
    ["an emoji", `${ID}%F0%9F%8D%9C`],
    ["empty", ""],
  ])("drops %s", (_, p) => {
    expect(readShareId(`?p=${p}`)).toEqual({ drop: true });
  });

  it("is null without p, and reads only the first of two", () => {
    expect(readShareId("")).toBeNull();
    expect(readShareId("?q=1")).toBeNull();
    expect(readShareId(`?p=${ID}&p=x`)).toEqual({ id: ID });
  });

  it("never throws on junk", () => {
    expect(() => readShareId("?p=%E0%A4%A&&==")).not.toThrow();
  });
});

describe("shareUrl", () => {
  it("is the production page with only p", () => {
    const url = new URL(shareUrl(ID));
    expect(url.origin + url.pathname).toBe("https://built4you.jasperntc.dev/lapar-wheel");
    expect([...url.searchParams.keys()]).toEqual(["p"]);
    expect(url.searchParams.get("p")).toBe(ID);
  });
});

describe("withoutP", () => {
  it("removes p and keeps the rest", () => {
    expect(withoutP(`https://x.test/lapar-wheel?p=${ID}`)).toBe("https://x.test/lapar-wheel");
    expect(withoutP(`https://x.test/lapar-wheel?a=1&p=${ID}#top`)).toBe("https://x.test/lapar-wheel?a=1#top");
  });
});

describe("capMapsUrl", () => {
  it("searches by place ID, with restaurant as the query", () => {
    const url = new URL(capMapsUrl(ID));
    expect(url.origin + url.pathname).toBe("https://www.google.com/maps/search/");
    expect(Object.fromEntries(url.searchParams)).toEqual({ api: "1", query: "restaurant", query_place_id: ID });
  });
});

describe("checkPlace and sharedView (mocked fetch)", () => {
  const reply = (body: unknown, status = 200) => {
    const fetch = vi.fn(async () => Response.json(body, { status }));
    vi.stubGlobal("fetch", fetch);
    return fetch;
  };

  it("makes one GET to the status check under the base path, with no body", async () => {
    const fetch = reply({ id: ID, name: "Kedai", available: true });
    await checkPlace(ID, "/lapar-wheel/");
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit | undefined];
    expect(url).toBe(`/lapar-wheel/api/place/${ID}?check=status`);
    expect(init?.method ?? "GET").toBe("GET");
    expect(init?.body).toBeUndefined();
  });

  it.each([
    ["available", { id: ID, name: "Kedai", available: true }, 200, "shared"],
    ["not available", { id: ID, name: "Kedai", available: false }, 200, "gone"],
    ["unknown to Google", { id: ID, name: null, available: false }, 200, "gone"],
    ["open but nameless", { id: ID, name: null, available: true }, 200, "gone"],
    ["daily_cap", { error: "daily_cap" }, 429, "cap"],
    ["ip_daily_cap", { error: "ip_daily_cap" }, 429, "cap"],
    ["rate_limited", { error: "rate_limited" }, 429, "error"],
    ["upstream", { error: "upstream" }, 502, "error"],
    ["bad_request", { error: "bad_request" }, 400, "error"],
    ["an odd 200", { hello: 1 }, 200, "error"],
  ])("%s shows %s", async (_, body, status, view) => {
    reply(body, status);
    expect(sharedView(await checkPlace(ID))).toBe(view);
  });

  it("keeps the error code for the notice", async () => {
    reply({ error: "rate_limited" }, 429);
    expect(await checkPlace(ID)).toEqual({ ok: false, error: "rate_limited" });
  });

  it("treats a network failure or an unreadable reply as upstream", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("offline"))));
    expect(await checkPlace(ID)).toEqual({ ok: false, error: "upstream" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 502 })));
    expect(await checkPlace(ID)).toEqual({ ok: false, error: "upstream" });
  });
});

describe("sharePick", () => {
  const pick = { name: "Kedai Kopi", url: shareUrl(ID) };
  const abort = () => Object.assign(new Error("dismissed"), { name: "AbortError" });

  it("opens the share sheet with the title, text and url", async () => {
    const share = vi.fn(async () => {});
    const writeText = vi.fn(async () => {});
    expect(await sharePick({ share, clipboard: { writeText } }, pick)).toBe("shared");
    expect(share).toHaveBeenCalledWith({ title: "Lapar Wheel", text: "The wheel picked Kedai Kopi.", url: pick.url });
    expect(writeText).not.toHaveBeenCalled();
  });

  it("treats a dismissed sheet as cancelled, not an error, and doesn't copy", async () => {
    const writeText = vi.fn(async () => {});
    const share = vi.fn(async () => Promise.reject(abort()));
    expect(await sharePick({ share, clipboard: { writeText } }, pick)).toBe("cancelled");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("copies the url when there's no share sheet", async () => {
    const writeText = vi.fn(async () => {});
    expect(await sharePick({ clipboard: { writeText } }, pick)).toBe("copied");
    expect(writeText).toHaveBeenCalledWith(pick.url);
  });

  it("copies when the share sheet fails for another reason", async () => {
    const writeText = vi.fn(async () => {});
    const share = vi.fn(async () => Promise.reject(Object.assign(new Error("no"), { name: "NotAllowedError" })));
    expect(await sharePick({ share, clipboard: { writeText } }, pick)).toBe("copied");
  });

  it("fails when copying fails or there's no clipboard, so the field shows", async () => {
    const writeText = vi.fn(async () => Promise.reject(new Error("denied")));
    expect(await sharePick({ clipboard: { writeText } }, pick)).toBe("failed");
    expect(await sharePick({}, pick)).toBe("failed");
  });
});

describe("flashCopied", () => {
  it("reads Link copied for 2 s, then puts the label back", () => {
    vi.useFakeTimers();
    const set = vi.fn();
    flashCopied(set);
    expect(set).toHaveBeenLastCalledWith(COPIED);
    vi.advanceTimersByTime(1999);
    expect(set).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(set).toHaveBeenLastCalledWith(null);
  });

  it("stops when cancelled, as a second tap does", () => {
    vi.useFakeTimers();
    const set = vi.fn();
    flashCopied(set)();
    vi.advanceTimersByTime(5000);
    expect(set).toHaveBeenCalledTimes(1);
  });
});
