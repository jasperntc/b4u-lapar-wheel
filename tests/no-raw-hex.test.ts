import { describe, expect, it } from "vitest";
import { read, sourceFiles } from "./source-files";

// The one place hex values may live.
const ALLOWED = new Set(["app/brand-tokens.css"]);

// #rgb, #rgba, #rrggbb or #rrggbbaa, not followed by another word character.
// "#Built4You" and "#episodes" don't match. An anchor made only of hex letters
// (like "#feed" or "#add") would; rename the anchor if that ever happens.
const HEX_COLOUR = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b/gi;

describe("raw hex colours", () => {
  it("the pattern catches hex colours and ignores hashtags and anchors", () => {
    const found = (s: string) => s.match(HEX_COLOUR) ?? [];
    expect(found("color: #3B3C8C;")).toEqual(["#3B3C8C"]);
    expect(found("color: #fff")).toEqual(["#fff"]);
    expect(found("#fafaf6cc")).toEqual(["#fafaf6cc"]);
    expect(found("#Built4You")).toEqual([]);
    expect(found('href="#episodes"')).toEqual([]);
  });

  it("appear only in app/brand-tokens.css", () => {
    const files = sourceFiles();
    expect(files.length).toBeGreaterThan(0);

    const offenders = files
      .filter((f) => !ALLOWED.has(f))
      .flatMap((f) => (read(f).match(HEX_COLOUR) ?? []).map((hex) => `${f}: ${hex}`));
    expect(offenders).toEqual([]);
  });
});
