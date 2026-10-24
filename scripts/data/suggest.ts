// Adds `suggested` and `suggest_reason` to data/candidates-kk.csv by rule, then
// re-sorts it. Run with `npm run data:suggest`. Jasper's `keep` and `reason`
// columns are carried through untouched. No network.
import { readFileSync, writeFileSync } from "node:fs";
import { assertNoMojibake, parseCsv, toCsv } from "./candidates.ts";
import { compareSuggested, suggest, type SuggestInput, type Suggestion } from "./suggest-rules.ts";

const FILE = "data/candidates-kk.csv";
const NEW_COLUMNS = ["suggested", "suggest_reason"];

const text = readFileSync(FILE, "utf8");
assertNoMojibake(text, FILE);
const { columns, rows } = parseCsv(text);
const needed = ["candidate_id", "name", "keep", "reason", "sources", "lat", "lon", "proposed_area", "proposed_cuisine", "overture_confidence", "operating_status", "osm_opening_hours"];
const missing = needed.filter((c) => !columns.includes(c));
if (missing.length) throw new Error(`${FILE} is missing columns: ${missing.join(", ")}`);

// The suggestion columns go just before `keep`, so they sit beside your decision.
const out = columns.filter((c) => !NEW_COLUMNS.includes(c));
out.splice(out.indexOf("keep"), 0, ...NEW_COLUMNS);

const before = new Map(rows.map((r) => [r.candidate_id, `${r.keep}\u0000${r.reason}`]));
type Row = Record<string, string> & ReturnType<typeof suggest>;
const suggested: Row[] = rows.map((r) => ({ ...r, ...suggest(r as SuggestInput) }));
suggested.sort(compareSuggested);

// Self-check: same rows, and every keep and reason exactly as it was.
if (suggested.length !== rows.length || suggested.some((r) => before.get(r.candidate_id) !== `${r.keep}\u0000${r.reason}`)) {
  throw new Error("keep or reason would change. Nothing was written.");
}
writeFileSync(FILE, toCsv(suggested, out));

const KINDS: Suggestion[] = ["keep", "unsure", "drop"];
const perArea = new Map<string, Record<Suggestion, number>>();
for (const r of suggested) {
  const area = r.proposed_area || "(no area)";
  const counts = perArea.get(area) ?? { keep: 0, unsure: 0, drop: 0 };
  counts[r.suggested]++;
  perArea.set(area, counts);
}
const total = { keep: 0, unsure: 0, drop: 0 };
for (const c of perArea.values()) for (const k of KINDS) total[k] += c[k];
const pad = (s: string | number, n: number) => String(s).padStart(n);
const width = Math.max(...[...perArea.keys()].map((a) => a.length), 5);
console.log(`${"Area".padEnd(width)}  ${KINDS.map((k) => pad(k, 6)).join("  ")}`);
for (const [area, c] of perArea) console.log(`${area.padEnd(width)}  ${KINDS.map((k) => pad(c[k], 6)).join("  ")}`);
console.log(`${"Total".padEnd(width)}  ${KINDS.map((k) => pad(total[k], 6)).join("  ")}`);
console.log(`Wrote ${FILE}: ${suggested.length} rows. Your keep and reason columns are unchanged.`);
