import { describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "../../scripts/data/candidates.ts";
import { compareSuggested, onGayaIsland, suggest, type SuggestInput } from "../../scripts/data/suggest-rules.ts";

const row = (over: Partial<SuggestInput> = {}): SuggestInput => ({
  sources: "osm+overture", lat: "5.970000", lon: "116.090000", proposed_area: "Damai", proposed_cuisine: "Chinese",
  overture_confidence: "0.50", operating_status: "", osm_opening_hours: "", ...over,
});
const verdict = (over: Partial<SuggestInput>) => suggest(row(over)).suggested;

describe("suggest", () => {
  it("drops places Overture says aren't open, whatever else is true", () => {
    expect(suggest(row({ operating_status: "permanently_closed" }))).toEqual({
      suggested: "drop", suggest_reason: "Overture status: permanently_closed",
    });
    expect(verdict({ operating_status: "temporarily_closed", sources: "overture", overture_confidence: "0.99" })).toBe("drop");
  });

  it("treats a blank status as unknown, not closed", () => {
    expect(verdict({ operating_status: "" })).toBe("keep");
    expect(verdict({ operating_status: "open" })).toBe("keep");
  });

  it("drops places on Gaya Island, but not the mainland across the strait", () => {
    expect(suggest(row({ lat: "6.017510", lon: "116.047066" })).suggest_reason).toBe("on Gaya Island");
    expect(verdict({ lat: "6.017510", lon: "116.070000" })).toBe("keep");
    expect(onGayaIsland(5.9835, 116.077)).toBe(false); // Gaya Street, on the mainland
  });

  it("keeps places in both sources", () => {
    expect(suggest(row())).toEqual({ suggested: "keep", suggest_reason: "in both sources" });
  });

  it("keeps Overture-only places at confidence 0.7 or more", () => {
    expect(verdict({ sources: "overture", overture_confidence: "0.70" })).toBe("keep");
    expect(verdict({ sources: "overture", overture_confidence: "0.69" })).toBe("unsure");
    expect(suggest(row({ sources: "overture", overture_confidence: "" })).suggest_reason).toBe("Overture only, confidence missing");
  });

  it("keeps OSM-only places with opening hours", () => {
    expect(verdict({ sources: "osm", overture_confidence: "", osm_opening_hours: "Mo-Su 07:00-22:00" })).toBe("keep");
    expect(suggest(row({ sources: "osm", overture_confidence: "" }))).toEqual({
      suggested: "unsure", suggest_reason: "OSM only, no opening hours",
    });
  });

  it("flags a missing area or cuisine in the reason", () => {
    expect(suggest(row({ proposed_area: "", proposed_cuisine: "" })).suggest_reason).toBe("in both sources; needs area; needs cuisine");
    expect(suggest(row({ proposed_cuisine: "", operating_status: "closed" })).suggest_reason).toBe("Overture status: closed; needs cuisine");
  });
});

describe("compareSuggested", () => {
  const r = (candidate_id: string, proposed_area: string, suggested: string, overture_confidence: string) =>
    ({ candidate_id, name: candidate_id, proposed_area, suggested, overture_confidence });

  it("sorts by area, then keep, unsure, drop, then highest confidence (blank last)", () => {
    const rows = [
      r("a", "Likas", "keep", "0.90"),
      r("b", "", "keep", "0.99"),
      r("c", "Damai", "drop", "0.99"),
      r("d", "Damai", "unsure", "0.40"),
      r("e", "Damai", "keep", ""),
      r("f", "Damai", "keep", "0.80"),
      r("g", "Damai", "unsure", "0.60"),
    ];
    expect(rows.sort(compareSuggested).map((x) => x.candidate_id)).toEqual(["f", "e", "g", "d", "c", "a", "b"]);
  });
});

describe("parseCsv", () => {
  it("round-trips toCsv, including quotes, commas, newlines and your keep and reason edits", () => {
    const columns = ["candidate_id", "name", "keep", "reason"];
    const rows = [
      { candidate_id: "osm:node/1", name: 'Ah "Lee", Damai', keep: "yes", reason: "" },
      { candidate_id: "osm:node/2", name: "Two\nlines", keep: "no", reason: "closed, saw it in 2026" },
      { candidate_id: "osm:node/3", name: "廣東仔燒烤", keep: "", reason: "" },
    ];
    expect(parseCsv(toCsv(rows, columns))).toEqual({ columns, rows });
  });

  it("reads Windows line endings from a spreadsheet save", () => {
    expect(parseCsv("a,b\r\n1,2\r\n").rows).toEqual([{ a: "1", b: "2" }]);
  });
});
