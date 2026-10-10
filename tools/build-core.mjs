// Bundles core/src/index.ts into core/dist/core.js (embedded in the Rust binary).
import * as esbuild from "esbuild";
import fs from "node:fs";
fs.mkdirSync("core/dist", { recursive: true });
await esbuild.build({
  entryPoints: ["core/src/index.ts"],
  bundle: true,
  format: "iife",
  target: "chrome128",
  outfile: "core/dist/core.js",
  minify: process.argv.includes("--min"),
  legalComments: "none",
  // Names the core in profiler and long-frame reports, so its time is not shown as anonymous script.
  footer: { js: "//# sourceURL=MecordCore.js" },
  logLevel: "info",
});
