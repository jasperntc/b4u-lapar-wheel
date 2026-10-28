// Rule-based keep/drop/unsure suggestions for candidates. Rules only: no
// network, no Google data, no judgement calls. Jasper's `keep` and `reason`
// columns are never read or written here.

export type Suggestion = "keep" | "unsure" | "drop";
export type SuggestInput = {
  sources: string;
  lat: string;
  lon: string;
  proposed_area: string;
  proposed_cuisine: string;
  overture_confidence: string;
  operating_status: string;
  osm_opening_hours: string;
};

/** Pulau Gaya's bounding box from OpenStreetMap. No mainland candidate falls inside it. */
export const GAYA_ISLAND = { south: 5.9917, west: 116.0049, north: 6.0441, east: 116.0663 };
export const KEEP_CONFIDENCE = 0.7;

export function onGayaIsland(lat: number, lon: number): boolean {
  const g = GAYA_ISLAND;
  return lat >= g.south && lat <= g.north && lon >= g.west && lon <= g.east;
}

/** The first matching rule, in order: drop, then keep, then unsure. */
export function suggest(c: SuggestInput): { suggested: Suggestion; suggest_reason: string } {
  const confidence = c.overture_confidence === "" ? NaN : Number(c.overture_confidence);
  let suggested: Suggestion;
  let reason: string;

  // A blank status means Overture doesn't know, not that the place is closed.
  if (c.operating_status && c.operating_status !== "open") {
    [suggested, reason] = ["drop", `Overture status: ${c.operating_status}`];
  } else if (onGayaIsland(Number(c.lat), Number(c.lon))) {
    [suggested, reason] = ["drop", "on Gaya Island"];
  } else if (c.sources === "osm+overture") {
    [suggested, reason] = ["keep", "in both sources"];
  } else if (c.sources === "overture" && confidence >= KEEP_CONFIDENCE) {
    [suggested, reason] = ["keep", `Overture only, confidence ${c.overture_confidence}`];
  } else if (c.sources === "osm" && c.osm_opening_hours) {
    [suggested, reason] = ["keep", "OSM only, has opening hours"];
  } else if (c.sources === "overture") {
    [suggested, reason] = ["unsure", `Overture only, confidence ${c.overture_confidence || "missing"}`];
  } else if (c.sources === "osm") {
    [suggested, reason] = ["unsure", "OSM only, no opening hours"];
  } else {
    [suggested, reason] = ["unsure", `source "${c.sources}"`];
  }

  const needs = [!c.proposed_area && "needs area", !c.proposed_cuisine && "needs cuisine"].filter(Boolean);
  return { suggested, suggest_reason: [reason, ...needs].join("; ") };
}

const RANK: Record<Suggestion, number> = { keep: 0, unsure: 1, drop: 2 };

/** Area A–Z (blank last), then keep, unsure, drop, then highest confidence first (blank last). */
export function compareSuggested(a: Readonly<Record<string, string>>, b: Readonly<Record<string, string>>): number {
  if (!a.proposed_area !== !b.proposed_area) return a.proposed_area ? -1 : 1;
  const conf = (r: Readonly<Record<string, string>>) => (r.overture_confidence === "" ? -1 : Number(r.overture_confidence));
  return (
    a.proposed_area.localeCompare(b.proposed_area) ||
    RANK[a.suggested as Suggestion] - RANK[b.suggested as Suggestion] ||
    conf(b) - conf(a) ||
    a.name.localeCompare(b.name) ||
    a.candidate_id.localeCompare(b.candidate_id)
  );
}
