#!/usr/bin/env node
/* New sentences for the LÍNO-2 words: the owner's verdicts (issue #23,
 * docs/DLD-PLAN.md §2 steps 4–5).
 *
 * OUTSIDE THE BUILD. Reads a batch folder fillin.mjs wrote, after the owner
 * has written já or nei on every line of its yfirferd.tsv, and
 *
 *   - appends every sentence the owner said yes to to
 *     content/setningar/setningar.tsv, under a comment that names the batch:
 *     the one file the build reads. No model is involved from here on:
 *     ./build.sh parses and checks each sentence like one written by hand;
 *   - rewrites the batch's report.tsv / report.md with the counts per word
 *     after the review;
 *   - says whether the share of nei is over REDO_THRESHOLD (check-lib.mjs):
 *     then the batch is marked "redo" (exit code 3) and the prompt should be
 *     made stricter before the next batch. Every sentence in the queue was
 *     read, so the ones that got a yes go in either way.
 *
 *   node tools/lino-frames/fillin-accept.mjs --by "eigandi, 28.11.2026" --dry-run
 *   node tools/lino-frames/fillin-accept.mjs --by "eigandi, 28.11.2026"
 *
 * Options
 *   --batch DIR   the batch folder (default: the only folder under review/lino-setningar/)
 *   --by TEXT     who read the queue, as the comment of each line will say
 *   --to FILE     the bank to append to (default content/setningar/setningar.tsv)
 *   --dry-run     say what would happen; write nothing
 *
 * Running it twice adds nothing twice: a sentence the bank has is skipped.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as F from "./fillin-lib.mjs";
import { tokenWords } from "./fillin.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REDO_EXIT = 3;

function args(argv) {
  const o = { batch: null, by: null, to: path.join(ROOT, "content/setningar/setningar.tsv"), dryRun: false };
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

async function main() {
  const o = args(process.argv.slice(2));
  if (!o.batch) {
    const dir = path.join(ROOT, "review/lino-setningar");
    const all = fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : [];
    if (all.length !== 1) throw new Error(`${all.length} batches under review/lino-setningar/; name one with --batch DIR`);
    o.batch = path.join(dir, all[0]);
  }
  if (!o.by || !o.by.trim()) throw new Error('say who read the queue: --by "eigandi, 28.11.2026"');
  const file = (f) => path.join(o.batch, f);
  for (const f of ["batch.json", "checked.tsv", "parse.json", F.QUEUE_FILE]) {
    if (!fs.existsSync(file(f))) throw new Error(`${file(f)} is missing: run tools/lino-frames/fillin.mjs (not --dry-run) first`);
  }
  const batch = JSON.parse(fs.readFileSync(file("batch.json"), "utf8"));
  if (batch.mode !== "api") {
    console.warn(`ATHUGIÐ: í þessari keyrslu skrifaði Claude ekki setningarnar (${batch.mode}); þær eru upptökur til prófunar.`);
    if (!o.dryRun) throw new Error("a batch whose sentences are not from the API is not written into content/ (use --dry-run to see what would happen)");
  }
  if (batch.status === "incomplete") throw new Error("the batch is incomplete (some words have no answer): run fillin.mjs again first");
  const checked = F.readRows(fs.readFileSync(file("checked.tsv"), "utf8"));
  const queue = F.readQueue(fs.readFileSync(file(F.QUEUE_FILE), "utf8"));
  const d = F.decide(checked, queue);
  if (d.problems.length) {
    console.error(`Ekki er hægt að ljúka yfirferðinni (${d.problems.length} atriði):`);
    for (const p of d.problems.slice(0, 30)) console.error("  " + p);
    if (d.problems.length > 30) console.error(`  … og ${d.problems.length - 30} í viðbót`);
    process.exit(2);
  }
  const pct = (x) => `${(Math.round(x * 1000) / 10).toString().replace(".", ",")}%`;
  console.log(`lesnar: ${d.read}, já: ${d.accepted.length}, nei: ${d.rejected} (${pct(d.rate)}; mörkin eru ${pct(F.REDO_THRESHOLD)})`);

  const bankText = fs.readFileSync(o.to, "utf8");
  const existing = new Set(F.readRows(bankText).map((r) => r["setning"]));
  const { lines, added, skipped } = F.bankLines(d, existing, { by: o.by, batch: batch.id });
  console.log(`${added} setningar bætast við ${path.relative(process.cwd(), o.to)}${skipped ? ` (${skipped} voru þar fyrir)` : ""}`);

  /* the counts after: the words of the batch, from the rows and the parse */
  const { DATA } = await import(path.join(ROOT, "data/data_bundle.js"));
  const { buildLexicon } = await import(path.join(ROOT, "src/js/core/lexicon.js"));
  const lex = buildLexicon(DATA);
  const parsed = new Map(JSON.parse(fs.readFileSync(file("parse.json"), "utf8")).map((v) => [v.text, v]));
  const rows = checked.map((r) => ({ word: { o: r["orð"], c: r["flokkur"] }, lvl: Number(r["þyngd"]), text: r["setning"],
    status: r["staða"], machine: { ok: r["vél"] === "já", gap: r["eyða"] === "já" } }));
  const words = (batch.words || []).map((w) => {
    const [o2, c] = w.key.split("|");
    return { o: o2, c, lino: w.lino, before: w.before, want: w.want, gaps: 0 };
  });
  const old = new Map(F.readRows(fs.readFileSync(file("report.tsv"), "utf8")).map((r) => [`${r["orð"]}|${r["flokkur"]}`, Number(r["eyður fyrir"])]));
  for (const w of words) w.gaps = old.get(F.wordId(w)) || 0;
  const tokensOf = tokenWords(lex, rows, (r) => parsed.get(r.text));
  const rep = F.report(words, rows, new Set(d.accepted.map((a) => a.text)), tokensOf);
  const sum = F.summary(rep, { full: batch.summary?.full || 0, missing: batch.summary?.missing || 0, reviewed: true });
  console.log(`orð með ${F.TARGET}+ setningar: ${sum.reachBefore} -> ${sum.reachAfter}; án setningar: ${sum.zeroBefore} -> ${sum.zeroAfter}; `
    + `með eyðu í „Hvaða orð vantar?“: ${sum.gapBefore} -> ${sum.gapAfter}`);

  if (o.dryRun) {
    console.log("--dry-run: ekkert skrifað. Línurnar:");
    for (const l of lines) console.log("  " + l);
  } else {
    if (lines.length) fs.writeFileSync(o.to, bankText + (bankText.endsWith("\n") ? "" : "\n") + lines.join("\n") + "\n");
    const run = { ...batch };
    fs.writeFileSync(file("report.tsv"), F.reportTsv(rep, run, true));
    fs.writeFileSync(file("report.md"), F.reportMd(sum, rep, run, { total: batch.total }));
    fs.writeFileSync(file("batch.json"), JSON.stringify({ ...batch, status: d.redo ? "redo" : "accepted", summary: sum,
      verdicts: { by: o.by, read: d.read, yes: d.accepted.length, no: d.rejected, rate: d.rate, redo: d.redo, added, skipped } }, null, 1) + "\n");
    if (added) console.log("Næst: ./build.sh (smíðin þáttar hverja setningu; handfestan breytist, sjá README í tools/lino-frames).");
  }
  if (d.redo) {
    console.log("MÆLT MEÐ ENDURGERÐ: of margar setningar fengu nei. Hertu INSTRUCTIONS í tools/lino-frames/fillin-lib.mjs, "
      + "hækkaðu PROMPT_VERSION og keyrðu fillin.mjs aftur fyrir orðin sem eftir eru.");
    process.exitCode = REDO_EXIT;
  }
}

main().catch((e) => { console.error(e.message || e); process.exit(2); });
