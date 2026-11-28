#!/usr/bin/env node
/* LÍNO-2 pairs: the owner's verdicts (issue #22, docs/DLD-PLAN.md §2 step 5).
 *
 * OUTSIDE THE BUILD. Reads a batch folder check.mjs wrote, after the owner
 * has written já or nei on every line of its yfirferd.tsv, and
 *
 *   - works out the sample's error rate; over REDO_THRESHOLD (check-lib.mjs)
 *     the batch is MARKED FOR REDO (batch.json "status": "redo", exit code 3)
 *     and the pairs nobody read are left out;
 *   - appends the accepted pairs to content/setningar/lino-rammar.tsv, the
 *     one file the build reads. No model is involved from here on: run
 *     ./build.sh, which checks every pair like one written by hand.
 *
 *   node tools/lino-frames/accept.mjs --by "eigandi, 28.11.2026"
 *   node tools/lino-frames/accept.mjs --batch review/lino-rammar/<keyrsla> --by "…" --dry-run
 *
 * Options
 *   --batch DIR   the batch folder (default: the only folder under review/lino-rammar/)
 *   --by TEXT     who read the queue, as lino-rammar.tsv's column "yfirfarið af" is written
 *   --to FILE     the allowlist to append to (default content/setningar/lino-rammar.tsv)
 *   --dry-run     say what would happen; write nothing
 *
 * Running it twice adds nothing twice: a pair the file already has is skipped.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as C from "./check-lib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REDO_EXIT = 3;

function args(argv) {
  const o = { batch: null, by: null, to: path.join(ROOT, "content/setningar/lino-rammar.tsv"), dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === "--batch") o.batch = path.resolve(next());
    else if (a === "--by") o.by = next();
    else if (a === "--to") o.to = path.resolve(next());
    else if (a === "--dry-run") o.dryRun = true;
    else if (a === "-h" || a === "--help") { console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0]); process.exit(0); }
    else throw new Error(`unknown option ${a} (--help lists them)`);
  }
  return o;
}

function main() {
  const o = args(process.argv.slice(2));
  if (!o.batch) {
    const dir = path.join(ROOT, "review/lino-rammar");
    const all = fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : [];
    if (all.length !== 1) throw new Error(`${all.length} batches under review/lino-rammar/; name one with --batch DIR`);
    o.batch = path.join(dir, all[0]);
  }
  if (!o.by || !o.by.trim()) throw new Error('say who read the queue: --by "eigandi, 28.11.2026"');
  const file = (f) => path.join(o.batch, f);
  for (const f of ["batch.json", "checked.tsv", C.QUEUE_FILE]) {
    if (!fs.existsSync(file(f))) throw new Error(`${file(f)} is missing: run tools/lino-frames/check.mjs (not --no-second) first`);
  }
  const batch = JSON.parse(fs.readFileSync(file("batch.json"), "utf8"));
  if (batch.second?.mode !== "api") {
    console.warn(`ATHUGIÐ: í þessari keyrslu svaraði Claude ekki (${batch.second?.mode}); svörin eru upptökur til prófunar.`);
    if (!o.dryRun) throw new Error("a batch whose second opinion is not from the API is not written into content/ (use --dry-run to see what would happen)");
  }
  const checked = C.readRows(fs.readFileSync(file("checked.tsv"), "utf8"));
  const queue = C.readQueue(fs.readFileSync(file(C.QUEUE_FILE), "utf8"));
  const d = C.decide(checked, queue);
  if (d.problems.length) {
    console.error(`Ekki er hægt að ljúka yfirferðinni (${d.problems.length} atriði):`);
    for (const p of d.problems.slice(0, 30)) console.error("  " + p);
    if (d.problems.length > 30) console.error(`  … og ${d.problems.length - 30} í viðbót`);
    process.exit(2);
  }
  for (const l of C.verdictSummary(d)) console.log(l);

  const existing = C.readRows(fs.readFileSync(o.to, "utf8"));
  const { lines, added, skipped } = C.allowlistLines(d, existing, { by: o.by, batch: batch.id });
  console.log(`${added} pör bætast við ${path.relative(process.cwd(), o.to)}${skipped ? ` (${skipped} voru þar fyrir)` : ""}`);
  if (o.dryRun) {
    console.log("--dry-run: ekkert skrifað. Línurnar:");
    for (const l of lines) console.log("  " + l);
  } else {
    if (lines.length) {
      const now = fs.readFileSync(o.to, "utf8");
      fs.writeFileSync(o.to, now + (now.endsWith("\n") ? "" : "\n") + lines.join("\n") + "\n");
    }
    fs.writeFileSync(file("batch.json"), JSON.stringify({ ...batch, status: d.redo ? "redo" : "accepted",
      verdicts: { by: o.by, sample: d.sample, disagreements: d.disagreements, redo: d.redo, added, skipped } }, null, 1) + "\n");
    if (added) console.log("Næst: ./build.sh (smíðin athugar hvert par; handfestan breytist, sjá README í tools/lino-frames).");
  }
  if (d.redo) {
    console.log("Endurgerð: hertu fyrirmælin í tools/lino-frames/lib.mjs (INSTRUCTIONS), hækkaðu PROMPT_VERSION og keyrðu run.mjs og check.mjs aftur.");
    process.exitCode = REDO_EXIT;
  }
}

try { main(); } catch (e) { console.error(e.message || e); process.exit(2); }
