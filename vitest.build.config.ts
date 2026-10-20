import { defineConfig } from "vitest/config";

// Checks on the static export in out/. Runs as `postbuild`, so every
// `npm run build` (and so every preview and deploy) is guarded.
export default defineConfig({
  test: { include: ["tests/postbuild/**/*.test.ts"] },
});
