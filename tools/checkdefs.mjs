/* Where did the definitions stop?
 *
 *   node tools/check-defs.mjs
 *
 * A definition has to survive four hand-offs before a child sees it:
 *
 *   data/ino.json  ->  data/data_bundle.js  ->  fallaskoli-v5.6.html  ->  screen
 *
 * When the screen says "skýring ekki komin" the interesting question is which
 * of those four still had it. This walks them in order and stops being polite
 * at the first one that does not. It changes nothing.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { htmlPath } from "./version.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);
const p = (...x) => path.join(ROOT, ...x);

const ok = (s) => console.log("  ✓ " + s);
const no = (s) => console.log("  ✗ " + s);
const read = (f) => fs.readFile(f, "utf8").then((s) => s, () => null);

let sample = null;      // a definition we can hunt for further down the chain
let stopped = null;

console.log("\n1. data/ino.json — what tools/ino.mjs wrote");
{
  const raw = await read(p("data", "ino.json"));
  if (!raw) { no("there is no data/ino.json. Run tools/ino.mjs first."); stopped = 1; }
  else {
    const j = JSON.parse(raw);
    const entries = j.entries && typeof j.entries === "object" ? j.entries : j;
    const usable = Object.entries(entries).filter(([, v]) => v && typeof v === "object" && v.def);
    if (!usable.length) { no("the file has no entries with a `def` field."); stopped = 1; }
    else {
      ok(`${usable.length.toLocaleString("is-IS")} definitions, ${j.entries ? "wrapped in {entries: …}" : "as a flat map"}`);
      sample = usable[0][1].def;
      console.log(`    e.g. ${usable[0][0]} -> ${JSON.stringify(sample).slice(0, 70)}`);
    }
  }
}

console.log("\n2. data/data_bundle.js — what pipeline/build_bundle.py attached");
if (!stopped) {
  const raw = await read(p("data", "data_bundle.js"));
  if (!raw) { no("no data/data_bundle.js. Run ./build.sh."); stopped = 2; }
  else {
    const n = (raw.match(/"ds":\s*"ino"/g) || []).length;
    if (!n) {
      no("not one word carries an ÍNO definition.");
      console.log("    pipeline/build_bundle.py read data/ino.json and matched nothing. If step 3");
      console.log("    of ./build.sh printed a tiny number after `ÍNO found:`, that is this.");
      stopped = 2;
    } else ok(`${n.toLocaleString("is-IS")} words carry an ÍNO definition`);
  }
}

console.log("\n3. the built file — what the child actually opens");
if (!stopped) {
  const file = htmlPath();
  const raw = await read(file);
  if (!raw) { no(`${path.basename(file)} is missing. Run ./build.sh.`); stopped = 3; }
  else {
    /* Space-tolerant on purpose: pipeline/build_bundle.py writes JSON with no spaces
       after the colons, esbuild re-prints the same object with them. A pattern
       that matches only one of the two reports a fault that is not there. */
    const MARK = /"ds":\s*"ino"/g;
    const n = (raw.match(MARK) || []).length;
    const bundle = await read(p("data", "data_bundle.js"));
    const bn = (bundle.match(MARK) || []).length;
    if (!n) {
      no(`${path.basename(file)} contains no ÍNO definitions, though the bundle does.`);
      console.log("    The file is older than the bundle: step 6 of ./build.sh did not run,");
      console.log("    or it failed. Run ./build.sh again and watch for `built …`.");
      stopped = 3;
    } else if (n < bn) {
      no(`${path.basename(file)} has ${n} but the bundle has ${bn} — the file is out of date.`);
      stopped = 3;
    } else {
      ok(`${n.toLocaleString("is-IS")} in ${path.basename(file)}`);
      const st2 = await fs.stat(file);
      ok(`built ${st2.mtime.toISOString().replace("T", " ").slice(0, 16)} UTC`);
      if (sample && !raw.includes(sample))
        no(`but the first definition from ino.json is not in it — look at ${path.basename(file)} by hand`);
    }
  }
}

console.log("\n4. the renderer's own question — would a definition be drawn?");
if (!stopped) {
  /* This is the call ui/dom.js makes for the word a question is about. Nothing
     is mocked: same bundle, same lexicon, same source list as the file-only
     case. If this prints definitions and the screen does not, the screen is
     showing an older copy of the file. */
  const { DATA } = await import("../data/data_bundle.js");
  const { buildLexicon } = await import("../src/js/core/lexicon.js");
  const { createDefinitions, bundledSource } = await import("../src/js/core/definitions.js");
  const lex = buildLexicon(DATA);
  const defs = createDefinitions([bundledSource(lex)]);
  const withDef = lex.all.filter((w) => w.ds === "ino");
  const step = Math.max(1, Math.floor(withDef.length / 3));
  for (let i = 0; i < withDef.length && i < step * 3; i += step) {
    const e = withDef[i];
    const d = defs.getSync(e);
    console.log(`  ${d ? "✓" : "✗"} ${e.o} (${e.c}) -> ${d ? d.def.slice(0, 60) : "skýring ekki komin"}`);
  }
  const none = lex.all.filter((w) => !defs.getSync(w)).length;
  console.log(`    ${none.toLocaleString("is-IS")} of ${lex.all.length.toLocaleString("is-IS")} words would still say "skýring ekki komin"`);
  console.log("    Those three words are worth trying in the program: if THEY say");
  console.log("    it too, the browser is showing an older file.");
}

console.log("\n5. the server's own copy, if one was uploaded on the Gögn tab");
{
  const raw = await read(p("server", "data", "dataset.json"));
  const st = await read(p("server", "data", "dataset-status.json"));
  if (!raw) console.log("  – none uploaded (that is fine if the definitions are in the file above)");
  else {
    const map = JSON.parse(raw);
    ok(`${Object.keys(map).length.toLocaleString("is-IS")} keys in server/data/dataset.json`);
    if (st) console.log("    status: " + st.trim().slice(0, 160));
  }
}

console.log(stopped
  ? `\nThe chain breaks at step ${stopped}. Everything above it is fine.\n`
  : `\nAll four are in order. If a word still says "skýring ekki komin":

  - reload the page properly — ⌘⇧R in the browser, or quit and reopen it;
  - check that the word is one of the ${""}ones ÍNO actually has (tools/ino.mjs
    reports how many of the 6.518 it matched, and the rest keep the
    hand-written definitions or none);
  - make sure the page open in the browser is this file and not an older copy
    somewhere else on the disk.\n`);
