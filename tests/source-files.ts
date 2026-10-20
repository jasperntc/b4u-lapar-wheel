import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

export const root = join(__dirname, "..");
const TEXT_FILE = /\.(css|tsx?|jsx?|mjs|md|svg|json)$/;

/** Text files under app/ and components/, as repo-relative paths with forward slashes. */
export function sourceFiles(dirs = ["app", "components"]): string[] {
  return dirs.flatMap((d) => {
    const dir = join(root, d);
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true, recursive: true })
      .filter((e) => e.isFile() && TEXT_FILE.test(e.name))
      .map((e) => relative(root, join(e.parentPath, e.name)).replaceAll("\\", "/"));
  });
}

export function read(file: string): string {
  return readFileSync(join(root, file), "utf8");
}
