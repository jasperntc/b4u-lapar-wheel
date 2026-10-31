import { afterEach, describe, expect, it, vi } from "vitest";
import { pickIndex } from "../lib/pick";

afterEach(() => vi.restoreAllMocks());

/** Makes crypto.getRandomValues hand out these uint32 draws in order. */
function draws(...values: number[]) {
  return vi.spyOn(crypto, "getRandomValues").mockImplementation((array) => {
    (array as Uint32Array)[0] = values.shift() ?? 0;
    return array;
  });
}

describe("pickIndex", () => {
  it("stays in range, and n = 1 always gives 0", () => {
    for (const n of [1, 2, 3, 7, 20]) {
      for (let i = 0; i < 500; i++) {
        const k = pickIndex(n);
        expect(Number.isInteger(k) && k >= 0 && k < n).toBe(true);
      }
    }
    expect(pickIndex(1)).toBe(0);
  });

  it.each([0, -1, 2.5, NaN, Infinity, 2 ** 32 + 1])("throws for n = %s", (n) => {
    expect(() => pickIndex(n)).toThrow(RangeError);
  });

  it("rejects draws past the last whole multiple of n and draws again", () => {
    // n = 3: 2^32 mod 3 = 1, so only the very top draw (2^32 - 1) is biased.
    const spy = draws(2 ** 32 - 1, 4);
    expect(pickIndex(3)).toBe(1);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("keeps the top draw when n divides 2^32", () => {
    const spy = draws(2 ** 32 - 1);
    expect(pickIndex(4)).toBe(3);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("is roughly uniform", () => {
    const n = 3;
    const runs = 30_000;
    const counts = Array<number>(n).fill(0);
    for (let i = 0; i < runs; i++) counts[pickIndex(n)]++;
    const expected = runs / n;
    const chiSquare = counts.reduce((sum, c) => sum + (c - expected) ** 2 / expected, 0);
    // 2 degrees of freedom: p < 0.0001 above 18.4, so this only fails on a real bias.
    expect(chiSquare).toBeLessThan(18.4);
  });

  it("never calls Math.random", () => {
    const random = vi.spyOn(Math, "random");
    for (let i = 0; i < 100; i++) pickIndex(20);
    expect(random).not.toHaveBeenCalled();
  });
});
