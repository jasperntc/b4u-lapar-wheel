/** n items picked without replacement by a seeded PRNG (mulberry32), so a report can be regenerated identically. */
export function seededSample<T>(items: readonly T[], n: number, seed: number): T[] {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
  const pool = [...items];
  // Partial Fisher-Yates: the first n slots end up as the sample.
  for (let i = 0; i < Math.min(n, pool.length); i++) {
    const j = i + Math.floor(next() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}
