import { describe, expect, it } from "vitest";
import { laparToken } from "../lib/tokens";

describe("laparToken", () => {
  it("reads day and night values from app/lapar-tokens.css", () => {
    const ground = laparToken("ground");
    expect(ground.day).toMatch(/^#[0-9a-f]{6}$/i);
    expect(ground.night).toMatch(/^#[0-9a-f]{6}$/i);
    expect(ground.night).not.toBe(ground.day);
  });

  it("gives a :root token the same value in both looks", () => {
    const sign = laparToken("sign");
    expect(sign.night).toBe(sign.day);
  });

  it("throws on an unknown token", () => {
    expect(() => laparToken("no-such-token")).toThrow(/no-such-token/);
  });
});
