import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  // Same "@/..." alias as tsconfig.json, so component tests can import components.
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  // tests/postbuild/ checks out/, so it runs after the build (see vitest.build.config.ts).
  // .claude/ can hold other sessions' git worktrees; their tests aren't ours.
  test: { exclude: [...configDefaults.exclude, ".claude/**", "tests/postbuild/**"] },
});
