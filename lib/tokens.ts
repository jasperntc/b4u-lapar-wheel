import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Reads a token's day and night values from app/lapar-tokens.css at build time, for the few places
 * that can't use a CSS variable (the theme-color meta tag, contrast tests). A token set only in
 * :root has the same value in both looks.
 */
export function laparToken(name: string): { day: string; night: string } {
  const css = readFileSync(join(process.cwd(), "app", "lapar-tokens.css"), "utf8");
  const block = (selector: string) => css.slice(css.indexOf(selector)).match(/\{([^}]*)\}/)?.[1] ?? "";
  const find = (body: string) => body.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1].trim();
  const shared = find(block(":root {"));
  const day = find(block('[data-look="day"]')) ?? shared;
  const night = find(block('[data-look="night"]')) ?? shared;
  if (!day || !night) throw new Error(`Token --${name} not found in both looks in app/lapar-tokens.css`);
  return { day, night };
}
