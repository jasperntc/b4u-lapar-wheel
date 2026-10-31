// The one Durable Object: a per-IP rate limit and the daily cap on Google calls.
// A single instance sees every API request, one at a time, so both counts are exact.
// A plain class with a fetch handler (no `cloudflare:workers` import), so Vitest can load it in Node.

export const RATE_LIMIT = 20; // requests a minute per IP: friends often share one through CGNAT or Wi-Fi
export const DAILY_CAP = 150; // Google calls a day, both endpoints together
const MINUTE = 60_000;
const DAY = 86_400_000;
const MALAYSIA = 8 * 3_600_000; // UTC+8, no daylight saving

/** Today's date in Malaysia, so the cap resets at midnight there. */
export const malaysiaDay = (now: number) => new Date(now + MALAYSIA).toISOString().slice(0, 10);

type Storage = {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
};

export type LimitResult = { ok: true } | { ok: false; error: "rate_limited" | "daily_cap"; retryAfter: number };

export class Limits {
  // IP -> request times in the last minute. Memory only: never written to storage.
  private recent = new Map<string, number[]>();

  constructor(private state: { storage: Storage }) {}

  async fetch(request: Request): Promise<Response> {
    return Response.json(await this.check(request.headers.get("x-client-ip") ?? ""));
  }

  /** Counts one request from `ip` and, if it's allowed, reserves one Google call for today. */
  async check(ip: string): Promise<LimitResult> {
    const now = Date.now();
    for (const [key, times] of this.recent) {
      const kept = times.filter((t) => now - t < MINUTE);
      if (kept.length) this.recent.set(key, kept);
      else this.recent.delete(key);
    }
    const times = this.recent.get(ip) ?? [];
    if (times.length >= RATE_LIMIT) {
      return { ok: false, error: "rate_limited", retryAfter: Math.ceil((times[0] + MINUTE - now) / 1000) };
    }
    this.recent.set(ip, [...times, now]);

    const day = malaysiaDay(now);
    const saved = await this.state.storage.get<{ day: string; count: number }>("cap");
    const count = saved?.day === day ? saved.count : 0;
    if (count >= DAILY_CAP) {
      return { ok: false, error: "daily_cap", retryAfter: Math.ceil((DAY - ((now + MALAYSIA) % DAY)) / 1000) };
    }
    await this.state.storage.put("cap", { day, count: count + 1 });
    return { ok: true };
  }
}
