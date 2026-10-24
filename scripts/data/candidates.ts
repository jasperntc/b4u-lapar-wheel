import { nearestArea, type NamedPlace } from "./area.ts";
import { cuisineFromOsm, cuisineFromOverture } from "./cuisine.ts";
import { matchPlaces, type Match } from "./match.ts";

/** An Overpass element from `out center tags`. Ways and relations carry `center`. */
export type OsmElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

/** A row from data/queries/overture-kk.sql. */
export type OvertureRow = {
  id: string;
  name: string | null;
  basic_category: string;
  taxonomy_primary: string | null;
  taxonomy_hierarchy: string[] | null;
  confidence: number | null;
  operating_status: string | null;
  addresses: { locality?: string | null; freeform?: string | null }[] | null;
  sources: { dataset?: string | null; license?: string | null }[] | null;
  lat: number;
  lon: number;
};

export const CSV_COLUMNS = [
  "candidate_id", "sources", "osm_id", "overture_id", "name", "type", "lat", "lon",
  "proposed_area", "proposed_cuisine", "overture_confidence", "operating_status",
  "osm_opening_hours", "maps_link", "keep", "reason",
] as const;
export type Candidate = Record<(typeof CSV_COLUMNS)[number], string>;

export const OVERTURE_TYPE: Record<string, string> = {
  fast_food_restaurant: "fast_food",
  food_court: "food_court",
  cafe: "cafe",
  coffee_shop: "cafe",
};

export const overtureType = (r: OvertureRow) => OVERTURE_TYPE[r.basic_category] ?? "restaurant";
export const osmId = (e: OsmElement) => `${e.type}/${e.id}`;
export const osmPoint = (e: OsmElement) => ({ lat: e.lat ?? e.center?.lat ?? NaN, lon: e.lon ?? e.center?.lon ?? NaN });
export const osmName = (e: OsmElement) => e.tags?.name ?? e.tags?.["name:en"] ?? "";

/** The first part of an address area, or "" when it only names the whole region ("Kota Kinabalu, Sabah", typos included). */
export function usefulArea(s: string | null | undefined): string {
  const first = (s ?? "").split(",")[0].trim();
  return /^(kota\s*kina\w*|kk|sabah)$/i.test(first) ? "" : first;
}

function osmAddressArea(tags: Record<string, string> = {}): string {
  const keys = ["addr:suburb", "addr:neighbourhood", "addr:quarter", "addr:place", "addr:city"];
  for (const k of keys) if (usefulArea(tags[k])) return usefulArea(tags[k]);
  return "";
}

export function mapsLink(name: string, area: string): string {
  const query = [name, area].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

const SOURCE_ORDER: Record<string, number> = { "osm+overture": 0, osm: 1, overture: 2 };

/** Area A–Z (blank last), then places found in both sources, then name. */
export function compareCandidates(a: Candidate, b: Candidate): number {
  if (!a.proposed_area !== !b.proposed_area) return a.proposed_area ? -1 : 1;
  return (
    a.proposed_area.localeCompare(b.proposed_area) ||
    SOURCE_ORDER[a.sources] - SOURCE_ORDER[b.sources] ||
    a.name.localeCompare(b.name) ||
    a.candidate_id.localeCompare(b.candidate_id)
  );
}

export function buildCandidates(
  osm: readonly OsmElement[],
  overture: readonly OvertureRow[],
  areas: readonly NamedPlace[],
): { candidates: Candidate[]; matches: Match[] } {
  const matches = matchPlaces(
    osm.map((e) => ({ id: osmId(e), name: osmName(e), ...osmPoint(e) })),
    overture.map((r) => ({ id: r.id, name: r.name ?? "", lat: r.lat, lon: r.lon })),
  );
  const overtureFor = new Map(matches.map((m) => [m.osmId, m.overtureId]));
  const byOvertureId = new Map(overture.map((r) => [r.id, r]));
  const matchedOverture = new Set(matches.map((m) => m.overtureId));

  const row = (e: OsmElement | undefined, r: OvertureRow | undefined): Candidate => {
    const { lat, lon } = e ? osmPoint(e) : { lat: r!.lat, lon: r!.lon };
    const name = (e && osmName(e)) || r?.name || "";
    const area =
      osmAddressArea(e?.tags) || usefulArea(r?.addresses?.[0]?.locality) || nearestArea(lat, lon, areas);
    const cuisine =
      (e && cuisineFromOsm(e.tags ?? {})) || (r && cuisineFromOverture(r.taxonomy_hierarchy ?? [], r.name ?? "")) || "";
    return {
      candidate_id: e ? `osm:${osmId(e)}` : `overture:${r!.id}`,
      sources: e && r ? "osm+overture" : e ? "osm" : "overture",
      osm_id: e ? osmId(e) : "",
      overture_id: r?.id ?? "",
      name,
      type: e?.tags?.amenity ?? overtureType(r!),
      lat: lat.toFixed(6),
      lon: lon.toFixed(6),
      proposed_area: area,
      proposed_cuisine: cuisine,
      overture_confidence: r?.confidence == null ? "" : r.confidence.toFixed(2),
      operating_status: r?.operating_status ?? "",
      osm_opening_hours: e?.tags?.opening_hours ?? "",
      maps_link: mapsLink(name, area),
      keep: "",
      reason: "",
    };
  };

  const candidates = [
    ...osm.map((e) => {
      const vid = overtureFor.get(osmId(e));
      return row(e, vid ? byOvertureId.get(vid) : undefined);
    }),
    ...overture.filter((r) => !matchedOverture.has(r.id)).map((r) => row(undefined, r)),
  ].sort(compareCandidates);
  return { candidates, matches };
}

const csvCell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);

// A UTF-8 byte order mark, so Excel on Windows opens Chinese and Malay names correctly.
const BOM = "﻿";

export function toCsv(rows: readonly Record<string, string>[], columns: readonly string[] = CSV_COLUMNS): string {
  return BOM + [columns.join(","), ...rows.map((r) => columns.map((c) => csvCell(r[c] ?? "")).join(","))].join("\n") + "\n";
}

// UTF-8 text read as Windows-1252 and saved again: "é" becomes "Ã©", "’" becomes "â€™",
// and Chinese characters start with "å" (廣 becomes "å»£").
const MOJIBAKE = /Ã|â€|å/;

/** Throws with the line and a fix if `text` looks like UTF-8 saved with the wrong encoding. */
export function assertNoMojibake(text: string, file: string): void {
  const at = text.search(MOJIBAKE);
  if (at === -1) return;
  const line = text.slice(0, at).split("\n").length;
  const snippet = text.slice(Math.max(0, at - 20), at + 20).replaceAll("\n", " ");
  throw new Error(
    `${file} looks mis-encoded: line ${line} has "${text.slice(at, at + 3)}" in "…${snippet}…". ` +
      `It was probably saved as ANSI (Windows-1252) instead of UTF-8. Restore it with git, or in Excel use ` +
      `File > Save As > "CSV UTF-8 (Comma delimited)". Nothing was written.`,
  );
}

/** Parses CSV written by toCsv or a spreadsheet: a leading BOM, quoted cells, doubled quotes, newlines inside quotes, CRLF. */
export function parseCsv(input: string): { columns: string[]; rows: Record<string, string>[] } {
  const text = input.startsWith(BOM) ? input.slice(1) : input;
  const records: string[][] = [];
  let record: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') [cell, i] = [cell + '"', i + 1];
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") [record, cell] = [[...record, cell], ""];
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      records.push([...record, cell]);
      [record, cell] = [[], ""];
    } else cell += ch;
  }
  if (cell || record.length) records.push([...record, cell]);
  const [columns = [], ...data] = records.filter((r) => r.some((c) => c !== ""));
  return { columns, rows: data.map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i] ?? ""]))) };
}
