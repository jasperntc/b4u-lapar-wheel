// Copies the static export into dist/lapar-wheel/. Next writes out/ at the root
// even with basePath, but requests arrive as /lapar-wheel/..., and Workers static
// assets match the full path. _headers only works at the assets root.
import { cpSync, renameSync, rmSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });
cpSync("out", "dist/lapar-wheel", { recursive: true });
renameSync("dist/lapar-wheel/_headers", "dist/_headers");
