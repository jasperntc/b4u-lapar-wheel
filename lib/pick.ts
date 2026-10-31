const RANGE = 2 ** 32;

/**
 * A uniform random index in [0, n), from `crypto.getRandomValues`.
 * Draws above the largest multiple of n are rejected and drawn again, so
 * `x % n` has no modulo bias. Never `Math.random`.
 */
export function pickIndex(n: number): number {
  if (!Number.isInteger(n) || n < 1 || n > RANGE) throw new RangeError(`pickIndex needs a whole number from 1 to 2^32, got ${n}`);
  const limit = RANGE - (RANGE % n);
  const draw = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(draw);
    if (draw[0] < limit) return draw[0] % n;
  }
}
