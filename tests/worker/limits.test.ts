import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DAILY_CAP, IP_DAILY_CAP, malaysiaDay, RATE_LIMIT } from "../../worker/limits.ts";
import { fakeEnv } from "./fake-env.ts";

beforeEach(() => vi.useFakeTimers({ now: new Date("2026-10-31T04:00:00Z") }));
afterEach(() => vi.useRealTimers());

describe("rate limit", () => {
  it(`allows ${RATE_LIMIT} requests a minute per IP, then limits that IP only`, async () => {
    const { limits } = fakeEnv();
    for (let i = 0; i < RATE_LIMIT; i++) expect(await limits.check("1.1.1.1")).toEqual({ ok: true });
    expect(await limits.check("1.1.1.1")).toEqual({ ok: false, error: "rate_limited", retryAfter: 60 });
    expect(await limits.check("2.2.2.2")).toEqual({ ok: true });
  });

  it("lets the IP back in once its oldest request is a minute old", async () => {
    const { limits } = fakeEnv();
    for (let i = 0; i < RATE_LIMIT; i++) await limits.check("1.1.1.1");
    vi.advanceTimersByTime(59_000);
    expect(await limits.check("1.1.1.1")).toMatchObject({ error: "rate_limited", retryAfter: 1 });
    vi.advanceTimersByTime(1_000);
    expect(await limits.check("1.1.1.1")).toEqual({ ok: true });
  });

  it("never writes an IP to storage", async () => {
    const { limits, store } = fakeEnv();
    await limits.check("203.0.113.7");
    expect([...store.keys()]).toEqual(["cap"]);
    expect(JSON.stringify([...store.values()])).not.toContain("203.0.113.7");
  });
});

describe("per-IP daily limit", () => {
  /** n allowed calls from one IP, spaced so the per-minute limit never applies. */
  const spendFrom = async (limits: ReturnType<typeof fakeEnv>["limits"], ip: string, n: number) => {
    for (let i = 0; i < n; i++) {
      expect(await limits.check(ip)).toEqual({ ok: true });
      vi.advanceTimersByTime(3_100);
    }
  };

  it(`allows ${IP_DAILY_CAP} Google calls a day per IP, then limits that IP only`, async () => {
    const { limits } = fakeEnv();
    await spendFrom(limits, "1.1.1.1", IP_DAILY_CAP);
    expect(await limits.check("1.1.1.1")).toMatchObject({ ok: false, error: "ip_daily_cap" });
    expect(await limits.check("2.2.2.2")).toEqual({ ok: true });
  });

  it("resets at 00:00 Malaysia time (16:00 UTC)", async () => {
    const { limits } = fakeEnv();
    vi.setSystemTime(new Date("2026-11-02T15:00:00Z"));
    await spendFrom(limits, "1.1.1.1", IP_DAILY_CAP);
    // 15:01:33 UTC: 58:27 to midnight in Malaysia.
    expect(await limits.check("1.1.1.1")).toEqual({ ok: false, error: "ip_daily_cap", retryAfter: 3600 - 93 });
    vi.setSystemTime(new Date("2026-11-02T16:00:00Z"));
    expect(await limits.check("1.1.1.1")).toEqual({ ok: true });
  });

  it("keeps per-IP counts in memory only", async () => {
    const { limits, store } = fakeEnv();
    await spendFrom(limits, "203.0.113.7", 3);
    expect([...store.keys()]).toEqual(["cap"]);
    expect(JSON.stringify([...store.values()])).not.toContain("203.0.113.7");
  });

  it("still stops everyone at the shared cap", async () => {
    const { limits } = fakeEnv();
    const ips = DAILY_CAP / IP_DAILY_CAP;
    for (let n = 0; n < IP_DAILY_CAP; n++) {
      for (let i = 0; i < ips; i++) expect(await limits.check(`10.1.0.${i}`)).toEqual({ ok: true });
      vi.advanceTimersByTime(3_100);
    }
    expect(await limits.check("10.1.0.99")).toMatchObject({ ok: false, error: "daily_cap" });
  });

  it("doesn't charge an IP for a call the shared cap refused", async () => {
    const { limits, store } = fakeEnv();
    store.set("cap", { day: malaysiaDay(Date.now()), count: DAILY_CAP });
    expect(await limits.check("1.1.1.1")).toMatchObject({ error: "daily_cap" });
    store.set("cap", { day: malaysiaDay(Date.now()), count: 0 });
    vi.advanceTimersByTime(60_000); // the refused request still counted toward the minute
    await spendFrom(limits, "1.1.1.1", IP_DAILY_CAP);
  });
});

describe("daily cap", () => {
  const spend = async (limits: ReturnType<typeof fakeEnv>["limits"], n: number) => {
    // A different IP each time, so the rate limit stays out of the way.
    for (let i = 0; i < n; i++) expect(await limits.check(`10.0.0.${i}`)).toEqual({ ok: true });
  };

  it(`allows ${DAILY_CAP} Google calls a day, then refuses until Malaysia midnight`, async () => {
    const { limits } = fakeEnv();
    await spend(limits, DAILY_CAP);
    // 04:00 UTC is 12:00 in Malaysia, so midnight there is 12 hours away.
    expect(await limits.check("10.0.1.1")).toEqual({ ok: false, error: "daily_cap", retryAfter: 12 * 3600 });
  });

  it("resets at 00:00 Malaysia time (16:00 UTC), not UTC midnight", async () => {
    const { limits } = fakeEnv();
    vi.setSystemTime(new Date("2026-10-31T15:59:59Z"));
    await spend(limits, DAILY_CAP);
    expect(await limits.check("10.0.1.1")).toMatchObject({ error: "daily_cap", retryAfter: 1 });
    vi.setSystemTime(new Date("2026-10-31T16:00:00Z"));
    expect(await limits.check("10.0.1.2")).toEqual({ ok: true });
  });

  it("dates the day in Malaysia", () => {
    expect(malaysiaDay(Date.parse("2026-10-31T15:59:59Z"))).toBe("2026-10-31");
    expect(malaysiaDay(Date.parse("2026-10-31T16:00:00Z"))).toBe("2026-11-01");
  });
});
