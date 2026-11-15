/* The build: ES modules -> one HTML file that works on a double click.

   esbuild resolves the imports; none of that leaks into the document. The
   result is a single file that makes no network request at all: since v6.3
   the typefaces are inside it too (src/fonts/, as data: URLs), where before
   they were fetched from Google on every visit.                            */

import { build } from "esbuild";
import { readFile, writeFile, stat, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { htmlPath, VERSION } from "./version.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const p = (...x) => path.join(root, ...x);

const OUT = process.argv[2] || htmlPath();

const result = await build({
  entryPoints: [p("src/js/app.js")],
  bundle: true,
  format: "iife",
  target: ["es2022"],
  charset: "utf8",
  legalComments: "none",
  minify: process.env.FALLASKOLI_MINIFY === "1",
  write: false,
  logLevel: "warning",
  define: { __APP_VERSION__: JSON.stringify(VERSION) },
});

const js = result.outputFiles[0].text;

if (js.includes("</script")) {
  throw new Error("The bundled script contains </script — that would close the block too early.");
}

/* ---------- the typefaces, inlined ----------
   One @font-face per file in this table. The families and weights are the ones
   the stylesheet asks for (`--display`, `--body`, `--mono` in src/head.html).
   Latin subset only: it covers Icelandic; anything else falls back to the
   system font, as it did when the fonts came from a CDN. */
const FONTS = [
  { family: "Bricolage Grotesque", file: "bricolage-grotesque-latin-opsz-normal.woff2",
    weight: "200 800", style: "normal", variable: true },
  { family: "Public Sans", file: "public-sans-latin-wght-normal.woff2",
    weight: "100 900", style: "normal", variable: true },
  { family: "Public Sans", file: "public-sans-latin-wght-italic.woff2",
    weight: "100 900", style: "italic", variable: true },
  { family: "IBM Plex Mono", file: "ibm-plex-mono-latin-400-normal.woff2", weight: "400", style: "normal" },
  { family: "IBM Plex Mono", file: "ibm-plex-mono-latin-500-normal.woff2", weight: "500", style: "normal" },
  { family: "IBM Plex Mono", file: "ibm-plex-mono-latin-600-normal.woff2", weight: "600", style: "normal" },
];

async function fontCSS() {
  const rules = [];
  for (const f of FONTS) {
    const data = (await readFile(p("src/fonts", f.file))).toString("base64");
    rules.push(`@font-face{font-family:"${f.family}";font-style:${f.style};font-weight:${f.weight};`
      + `font-display:swap;src:url(data:font/woff2;base64,${data}) `
      + `format("${f.variable ? "woff2-variations" : "woff2"}")}`);
  }
  return rules.join("\n");
}

const FONT_MARK = "/*@@FONTS@@*/";
const headRaw = await readFile(p("src/head.html"), "utf8");
if (!headRaw.includes(FONT_MARK))
  throw new Error("src/head.html has lost its " + FONT_MARK + " marker — the fonts have nowhere to go.");
const head = headRaw.replace(FONT_MARK, await fontCSS());
if (/fonts\.(googleapis|gstatic)\.com/.test(head + js))
  throw new Error("The page asks Google for fonts again. They are bundled; see src/fonts/.");
const body = await readFile(p("src/body.html"), "utf8");
const tail = await readFile(p("src/tail.html"), "utf8");

await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, head + body + js + "\n" + tail, "utf8");

const { size } = await stat(OUT);
console.log(`built ${path.relative(root, OUT)} — ${(size / 1024).toFixed(0)} KB`);
