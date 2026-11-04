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

  it("gives every ?p= share link the page without p as its canonical url", async () => {
    const { metadata } = await import("../app/layout");
    expect(metadata.alternates?.canonical).toBe("https://built4you.jasperntc.dev/lapar-wheel");
  });

  it("routes the page, its share links and the API to this Worker, and nothing else", () => {
    // Cloudflare: a pattern ending in * is a prefix of host + path + query; any other pattern must match it exactly.
    const { routes } = JSON.parse(read("wrangler.jsonc").replace(/^\s*\/\/.*$/gm, "")) as { routes: { pattern: string }[] };
    const ours = (url: string) =>
      routes.some(({ pattern: p }) => (p.endsWith("*") ? url.startsWith(p.slice(0, -1)) : url === p));
    const host = "built4you.jasperntc.dev";
    for (const path of ["/lapar-wheel", "/lapar-wheel?p=ChIJN1t_tDeuEmsRUsoyG83frY4", "/lapar-wheel/", "/lapar-wheel/api/nearby"]) {
      expect(ours(host + path), path).toBe(true);
    }
    expect(ours(`${host}/lapar-wheel/api/place/ChIJN1t_tDeuEmsRUsoyG83frY4?check=status`)).toBe(true);
    for (const path of ["/", "/?p=x", "/about"]) expect(ours(host + path), path).toBe(false);
  });

  it("loads fonts from under the basePath", () => {
    // CSS url()s don't get the basePath, so globals.css spells it out.
    const urls = [...read("app/globals.css").matchAll(/url\("(\/[^"]+\.woff2)"\)/g)].map((m) => m[1]);
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) expect(u.startsWith(`${nextConfig.basePath}/fonts/`), u).toBe(true);
  });
});
