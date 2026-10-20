import { describe, expect, it } from "vitest";
import { read, sourceFiles } from "./source-files";

// The --space-* steps in app/brand-tokens.css, plus 0.
const STEPS = new Set(["0", "1", "2", "3", "4", "6", "8", "12", "16"]);

// A padding, margin, gap or space utility with a number: p-5, md:px-10,
// hover:-mt-7, gap-x-5, space-y-0.5, p-5!. The class must start a token or
// follow a variant colon, so top-5 or scroll-mt-5 don't count. Sizing (w-, h-,
// size-) and arbitrary values like p-[10px] are out of scope.
const SPACING_CLASS =
  /(?<=^|[\s"'`{(:!])-?(?:p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|gap-x|gap-y|space-x|space-y)-(\d+(?:\.\d+)?)(?![\w.])/g;

function offScale(text: string): string[] {
  return [...text.matchAll(SPACING_CLASS)]
    .filter((m) => !STEPS.has(m[1]))
    .map((m) => m[0]);
}

describe("spacing classes", () => {
  it("the pattern catches off-scale spacing and ignores sizing", () => {
    expect(
      offScale('className="p-5 md:px-10 hover:-mt-7 gap-x-5 space-y-0.5 pb-7! m-20"'),
    ).toEqual(["p-5", "px-10", "-mt-7", "gap-x-5", "space-y-0.5", "pb-7", "m-20"]);
    expect(
      offScale('className="p-4 -mx-16 gap-y-12 sm:space-x-6 m-0 w-5 h-10 size-7 top-5 scroll-mt-5 p-px"'),
    ).toEqual([]);
  });

  it("use only the brand steps (0, 1, 2, 3, 4, 6, 8, 12, 16)", () => {
    const files = sourceFiles();
    expect(files.length).toBeGreaterThan(0);

    const offenders = files.flatMap((f) => offScale(read(f)).map((c) => `${f}: ${c}`));
    expect(offenders).toEqual([]);
  });
});
