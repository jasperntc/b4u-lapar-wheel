# Review log

Mistakes caught during review, mine and the AI's. Newest first.

| Date | Where | Mistake | Caught by | Fix |
|---|---|---|---|---|
| 2026-10-31 | `lib/pick.ts` | `pickIndex` wasn't hand-coded as the build order planned: Claude Code wrote it in rush mode for the near me demo | Me, rush mode decision | Tests cover range, rejection of biased draws and uniformity; read it before launch. |
| 2026-10-31 | `docs/dev-key-quota` branch | Committed the `CLAUDE.md` fix to local `main`: the checkout was switched back to `main` between creating the branch and committing, and the commit didn't check the branch first. Nothing reached `origin/main` | Claude Code, `git status` after `gh pr create` failed | Commit moved to the branch and local `main` reset to `origin/main`; check the current branch right before committing. |
| 2026-10-31 | `worker/index.ts` | Exported constants (`SEARCH_FIELDS`, `CUISINES`) from the Worker entry for tests; workerd treats every entry export as an entrypoint and refused to start. Mocked tests passed and the dry run bundled fine | Claude Code, `wrangler dev` routing check | Handler and constants moved to `worker/api.ts`; `index.ts` exports only the handler and `Limits`, and a test checks the entry's exports. |
| 2026-10-23 | `scripts/data/candidates.ts` | Area cleanup only dropped an exact "Kota Kinabalu", so Overture localities like "Penampang, Kota Kinabalu, Sabah" and the typo "Kota Kinablau" became areas; the first fix also lost its regex backslashes in a JS string | Claude Code, reading the first CSV | First comma part only, region-only values dropped (typos included); regex written directly and tested. |
| 2026-10-23 | `data/queries/osm-kk-areas.overpassql` | The area query ended in `out tags;`, which returns no coordinates, so the nearest-area fallback matched nothing and 3,325 of 4,246 candidates had a blank area | Claude Code, sanity-checking the first CSV | `out;`, and `data:compare` now stops if any named place lacks coordinates. Needs a re-pull. |
| 2026-10-20 | `.github/dependabot.yml` | Dependabot bumped `react` and `react-dom` in separate PRs; `react-dom@19.3.1` needs `react@^19.3.1`, so its PR failed `npm ci` | Dependabot PR #4 CI | Merged the react bump first, rebased #4, and grouped `react` with `react-dom`. |
| 2026-10-20 | `eslint.config.mjs` | The hub's config ignores `out/` only, so after the first build ESLint linted the bundled JS in `dist/` (11 errors, 1849 warnings) | Claude Code, final lint run | Ignore `dist/**`. |
| 2026-10-20 | `wrangler.jsonc` | Default `html_handling` redirected `/lapar-wheel` to `/lapar-wheel/` (307) | Claude Code, `wrangler dev` routing check | `drop-trailing-slash`, matching `next/link`. |
| 2026-10-20 | `app/globals.css` | The copied brand tokens load fonts from `/fonts/`, which under the basePath is the hub's path, not this Worker's | Claude Code, reading the hub before copying | Fonts redeclared under `/lapar-wheel/fonts/`; a test checks it. |
| 2026-10-20 | `lib/brand-tokens.ts` | `\s` inside a template literal is just `s`, so the token regex only worked because of `.trim()` (also in the hub) | Claude Code, copying from the hub | `\\s`. |
