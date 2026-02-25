#!/usr/bin/env node
/**
 * Bundle widget into a single IIFE so Figma's sandbox (no CommonJS) can run it.
 */
import * as esbuild from "esbuild";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes("--watch");

const ctx = await esbuild.context({
  entryPoints: [join(__dirname, "widget-src", "code.tsx")],
  bundle: true,
  format: "iife",
  target: "es6",
  outfile: join(__dirname, "dist", "code.js"),
  jsxFactory: "figma.widget.h",
  jsxFragment: "figma.widget.Fragment",
  logLevel: "info",
});

if (watch) {
  await ctx.watch();
} else {
  await ctx.rebuild();
  ctx.dispose();
}
