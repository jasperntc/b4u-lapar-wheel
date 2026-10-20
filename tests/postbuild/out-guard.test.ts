import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// dist/ is what Wrangler uploads: the export nested under lapar-wheel/.
const DIST = join(__dirname, "..", "..", "dist");

/** Names that must never ship: env files, dumps, keys, git data, backups, logs. */
const FORBIDDEN_NAME = /(^|\/)\.env[^/]*$|\.(sql|pem|key|bak|log)$|(^|\/)\.git(\/|$)/i;
/** Contents that must never ship: private keys and live Stripe secret keys. */
const FORBIDDEN_TEXT = ["PRIVATE KEY", "sk_live"];

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => join(e.parentPath, e.name).slice(dir.length + 1).replaceAll("\\", "/"));
}

describe("dist/ build guard", () => {
  it("the name pattern catches secrets and leaves normal files alone", () => {
    const bad = [".env", ".env.local", "a/.env.production", "dump.sql", "cert.pem", "id.key",
      ".git/config", "x/.git/HEAD", "page.bak", "debug.log"];
    const ok = ["index.html", "_headers", "fonts/OFL-Caveat.txt", "brand/b4u-favicon.svg",
      "keyboard.js", "environment.txt", "a.git.txt"];
    for (const f of bad) expect(FORBIDDEN_NAME.test(f), f).toBe(true);
    for (const f of ok) expect(FORBIDDEN_NAME.test(f), f).toBe(false);
  });

  it("has a build to check", () => {
    expect(existsSync(join(DIST, "lapar-wheel", "index.html")), "run `npm run build` first").toBe(true);
  });

  it("serves everything under lapar-wheel/, with only _headers at the root", () => {
    expect(readdirSync(DIST).sort()).toEqual(["_headers", "lapar-wheel"]);
    expect(existsSync(join(DIST, "lapar-wheel", "404.html"))).toBe(true);
    expect(existsSync(join(DIST, "lapar-wheel", "_next"))).toBe(true);
  });

  it("ships no env files, dumps, keys, git data, backups or logs", () => {
    expect(filesUnder(DIST).filter((f) => FORBIDDEN_NAME.test(f))).toEqual([]);
  });

  it("ships no file containing a private key or a live secret key", () => {
    const hits = filesUnder(DIST).flatMap((f) => {
      // latin1 reads binary files (fonts, images) without throwing.
      const text = readFileSync(join(DIST, f), "latin1");
      return FORBIDDEN_TEXT.filter((s) => text.includes(s)).map((s) => `${f}: ${s}`);
    });
    expect(hits).toEqual([]);
  });
});
