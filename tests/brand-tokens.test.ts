import { describe, expect, it } from "vitest";
import { brandToken } from "../lib/brand-tokens";

describe("brandToken", () => {
  it("reads light and dark values from app/brand-tokens.css", () => {
    const kraft = brandToken("surface-kraft");
    expect(kraft.light).toMatch(/^#[0-9a-f]{6}$/i);
    expect(kraft.dark).toMatch(/^#[0-9a-f]{6}$/i);
    expect(kraft.dark).not.toBe(kraft.light);
  });

  it("throws on an unknown token", () => {
    expect(() => brandToken("no-such-token")).toThrow(/no-such-token/);
  });
});
