import { describe, expect, it } from "vitest";
import { assertNoMojibake, CSV_COLUMNS, parseCsv, toCsv } from "../../scripts/data/candidates.ts";

describe("CSV encoding", () => {
  const columns = ["candidate_id", "name", "proposed_area"];
  const rows = [
    { candidate_id: "osm:node/1", name: "廣東仔燒烤（加雅街）", proposed_area: "Kampung Air" },
    { candidate_id: "osm:node/2", name: "Restoran Café Ño", proposed_area: "Taman Sri Kepayan" },
  ];

  it("writes a UTF-8 BOM so Excel on Windows reads it as UTF-8", () => {
    const csv = toCsv(rows, columns);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(Buffer.from(csv, "utf8").subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
  });

  it("round-trips a Chinese name through write and parse, as bytes on disk", () => {
    const bytes = Buffer.from(toCsv(rows, columns), "utf8");
    const parsed = parseCsv(bytes.toString("utf8"));
    expect(parsed.columns).toEqual(columns); // the BOM isn't glued to the first column name
    expect(parsed.rows).toEqual(rows);
  });

  it("parses files with or without a BOM the same way", () => {
    expect(parseCsv("﻿a,b\n1,2\n")).toEqual(parseCsv("a,b\n1,2\n"));
  });

  it("writes the default columns with a BOM too", () => {
    expect(toCsv([]).startsWith(`﻿${CSV_COLUMNS[0]},`)).toBe(true);
  });
});

describe("assertNoMojibake", () => {
  it("passes clean UTF-8, including Chinese, accents and curly quotes", () => {
    expect(() => assertNoMojibake(toCsv([{ name: "廣東仔燒烤 · Café Ño · Ah Lee’s" }], ["name"]), "x.csv")).not.toThrow();
  });

  it("fails on UTF-8 that was saved as Windows-1252", () => {
    const cases = [
      "Restoran CafÃ© Ño", // é
      "Ah Leeâ€™s Kitchen", // ’
      Buffer.from("廣東仔燒烤", "utf8").toString("latin1"), // Chinese becomes å»£æ±...
    ];
    for (const name of cases) {
      expect(() => assertNoMojibake(`name\nfine\n${name}\n`, "data/candidates-kk.csv"), name).toThrow(
        /data\/candidates-kk\.csv looks mis-encoded: line 3 .*CSV UTF-8/,
      );
    }
  });
});
