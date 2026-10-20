# Review log

Mistakes caught during review, mine and the AI's. Newest first.

| Date | Where | Mistake | Caught by | Fix |
|---|---|---|---|---|
| 2026-10-20 | `eslint.config.mjs` | The hub's config ignores `out/` only, so after the first build ESLint linted the bundled JS in `dist/` (11 errors, 1849 warnings) | Claude Code, final lint run | Ignore `dist/**`. |
| 2026-10-20 | `wrangler.jsonc` | Default `html_handling` redirected `/lapar-wheel` to `/lapar-wheel/` (307) | Claude Code, `wrangler dev` routing check | `drop-trailing-slash`, matching `next/link`. |
| 2026-10-20 | `app/globals.css` | The copied brand tokens load fonts from `/fonts/`, which under the basePath is the hub's path, not this Worker's | Claude Code, reading the hub before copying | Fonts redeclared under `/lapar-wheel/fonts/`; a test checks it. |
| 2026-10-20 | `lib/brand-tokens.ts` | `\s` inside a template literal is just `s`, so the token regex only worked because of `.trim()` (also in the hub) | Claude Code, copying from the hub | `\\s`. |
