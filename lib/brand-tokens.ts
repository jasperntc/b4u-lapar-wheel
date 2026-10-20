import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Reads a token's light and dark values from app/brand-tokens.css at build
 * time, for the few places that can't use a CSS variable (like the
 * theme-color meta tag). Keeps brand-tokens.css the only source of values.
 */
export function brandToken(name: string): { light: string; dark: string } {
  const css = readFileSync(join(process.cwd(), "app", "brand-tokens.css"), "utf8");
  const [lightBlock, darkBlock = ""] = css.split("@media (prefers-color-scheme: dark)");
  const find = (block: string) => block.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1].trim();
  const light = find(lightBlock);
  if (!light) throw new Error(`Token --${name} not found in app/brand-tokens.css`);
  return { light, dark: find(darkBlock) ?? light };
}
