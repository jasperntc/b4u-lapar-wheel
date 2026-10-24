// Pulls candidate places to eat in greater KK into data/raw/. Run with
// `npm run data:pull`, which installs DuckDB here first. Never runs in CI or the build.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { DuckDBInstance } from "@duckdb/node-api";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const write = (path, text) => {
  writeFileSync(new URL(path, root), text);
  console.log(`  wrote ${path} (${(Buffer.byteLength(text) / 1024).toFixed(0)} KB)`);
};

// Dates are Kota Kinabalu's, whatever the machine's time zone.
const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
const USER_AGENT = "lapar-wheel-data/0.1 (+https://github.com/jasperntc/b4u-lapar-wheel)";

mkdirSync(new URL("data/raw/", root), { recursive: true });

// Overpass asks clients to back off when it's busy (429, 502, 503, 504).
const BUSY = new Set([429, 502, 503, 504]);
const WAITS_SECONDS = [30, 60, 120, 240];

async function overpass(queryFile, outFile) {
  let res, text;
  for (let attempt = 0; ; attempt++) {
    res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ data: read(queryFile) }),
    });
    text = await res.text();
    if (!BUSY.has(res.status) || attempt === WAITS_SECONDS.length) break;
    console.log(`  Overpass busy (${res.status}), retrying in ${WAITS_SECONDS[attempt]} s`);
    await new Promise((resolve) => setTimeout(resolve, WAITS_SECONDS[attempt] * 1000));
  }
  if (!res.ok) throw new Error(`Overpass returned ${res.status} for ${queryFile}: ${text.slice(0, 300)}`);
  const { elements, remark } = JSON.parse(text);
  // Overpass reports timeouts and memory errors in `remark` with a 200 status.
  if (remark) throw new Error(`Overpass remark for ${queryFile}: ${remark}`);
  console.log(`OSM ${queryFile}: ${elements.length} elements`);
  write(outFile, text);
}

console.log(`Pulling on ${today}`);
await overpass("data/queries/osm-kk.overpassql", `data/raw/osm-kk-${today}.json`);
await overpass("data/queries/osm-kk-areas.overpassql", `data/raw/osm-kk-areas-${today}.json`);

// The release is pinned in the query file; read it from there so it lives in one place.
const sql = read("data/queries/overture-kk.sql");
const release = sql.match(/\/release\/([\w.-]+)\//)?.[1];
if (!release) throw new Error("No Overture release found in data/queries/overture-kk.sql");

const db = await DuckDBInstance.create(":memory:");
const conn = await db.connect();
await conn.run("INSTALL httpfs; LOAD httpfs; SET s3_region = 'us-west-2';");
console.log(`Overture ${release}: querying (this reads remote Parquet and can take a few minutes)`);
const rows = (await conn.runAndReadAll(sql)).getRowObjectsJson();
console.log(`Overture ${release}: ${rows.length} places`);
// One row per line, so diffs between pulls stay readable.
write(
  `data/raw/overture-kk-${release}.json`,
  `{"release":${JSON.stringify(release)},"pulledAt":${JSON.stringify(today)},"query":"data/queries/overture-kk.sql","rows":[\n` +
    rows.map((r) => JSON.stringify(r)).join(",\n") +
    "\n]}\n",
);
