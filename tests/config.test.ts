import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";
import { read } from "./source-files";

describe("next.config", () => {
  it("exports static HTML for Workers static assets", () => {
    expect(nextConfig.output).toBe("export");
  });

  it("turns off the image optimizer, which needs a server", () => {
    expect(nextConfig.images?.unoptimized).toBe(true);
  });

  it("mounts the app at /lapar-wheel", () => {
    expect(nextConfig.basePath).toBe("/lapar-wheel");
  });

  it("loads fonts from under the basePath", () => {
    // CSS url()s don't get the basePath, so globals.css spells it out.
    const urls = [...read("app/globals.css").matchAll(/url\("(\/[^"]+\.woff2)"\)/g)].map((m) => m[1]);
    expect(urls).toHaveLength(2);
    for (const u of urls) expect(u.startsWith(`${nextConfig.basePath}/fonts/`), u).toBe(true);
  });
});
