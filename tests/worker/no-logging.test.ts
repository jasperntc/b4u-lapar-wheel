import { describe, expect, it } from "vitest";
import { read, sourceFiles } from "../source-files";

describe("the Worker never logs", () => {
  it("has no console calls at all, not just console.log", () => {
    const files = sourceFiles(["worker"]);
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) expect(read(f), f).not.toMatch(/console\./);
  });

  it("turns Workers Logs off and runs only for /lapar-wheel/api/*", () => {
    // wrangler.jsonc only has whole-line comments.
    const config = JSON.parse(read("wrangler.jsonc").replace(/^\s*\/\/.*$/gm, ""));
    expect(config.observability).toEqual({ enabled: false });
    expect(config.assets.run_worker_first).toEqual(["/lapar-wheel/api/*"]);
  });
});
