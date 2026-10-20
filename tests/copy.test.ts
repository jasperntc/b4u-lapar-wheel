import { describe, expect, it } from "vitest";
import { read, sourceFiles } from "./source-files";

const COPY_DIRS = ["app", "components", "content"];

describe("copy", () => {
  // Built4You, Built 4 You, built-for-you… in any case. The hostname
  // built4you.jasperntc.dev is lowercase by nature, so it doesn't count.
  const NAME = /built[\s_-]*(?:4|for)[\s_-]*you(?!\.jasperntc\.)/gi;
  const MAKAN_MANA = /makan[\s_-]*mana/i;

  it("the name pattern catches misspellings", () => {
    const found = (s: string) => s.match(NAME) ?? [];
    expect(found("Built4You #Built4You")).toEqual(["Built4You", "Built4You"]);
    expect(found("Built4you, Built 4 You, Built For You")).toHaveLength(3);
    expect(found("https://built4you.jasperntc.dev")).toEqual([]);
  });

  it("spells Built4You the same way everywhere", () => {
    const misspelled = sourceFiles(COPY_DIRS).flatMap((f) =>
      (read(f).match(NAME) ?? []).filter((m) => m !== "Built4You").map((m) => `${f}: ${m}`),
    );
    expect(misspelled).toEqual([]);
  });

  it("never says makan mana", () => {
    expect(MAKAN_MANA.test("Makan-mana")).toBe(true);
    const hits = sourceFiles(COPY_DIRS).filter((f) => MAKAN_MANA.test(read(f)));
    expect(hits).toEqual([]);
  });
});
