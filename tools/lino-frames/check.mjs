#!/usr/bin/env node
/* LÍNO-2 pairs: the self-check, the second opinion and the review queue
 * (issue #22, docs/DLD-PLAN.md §2 steps 3 and 5).
 *
 * OUTSIDE THE BUILD, like run.mjs. It reads run.mjs's candidates.tsv and the
 * built data, and writes a batch folder for the owner to review; it never
 * writes content/ or data/. What it does: tools/lino-frames/README.md.
 *
 *   node tools/lino-frames/check.mjs --no-second          # fill + parse only: free, no key
 *   node tools/lino-frames/check.mjs --fake DIR --parsed FILE   # recorded answers, no calls, no Greynir
 *   ANTHROPIC_API_KEY=… node tools/lino-frames/check.mjs  # the real thing
 *
 * Options
 *   --candidates FILE  the first pass's output (default dist/lino-frames/candidates.tsv)
 *   --out DIR          the batch folder (default review/lino-rammar/<keyrsla>, from the
 *                      candidates' own run id; this one IS meant to be committed)
 *   --no-second        stop after the parse: checked.tsv says what passed, no model is asked
 *   --fake DIR         the second model's answers from DIR/<lemma>.<kyn>.json, not the API
 *   --parsed FILE      recorded parse verdicts (a parse.json this tool wrote) instead of
 *                      running Greynir; for tests and for machines without the Python deps
 *   --concurrency N    calls in flight (default 4)
 *
 * Run it again on the same folder at any time: answers in OUT/responses/ for
 * the same sentences and prompt version are reused, and verdicts the owner
 * has already written in yfirferd.tsv are kept.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readTsv } from "./lib.mjs";
import * as C from "./check-lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const API = "https://api.anthropic.com/v1";

function args(argv) {
  const o = { candidates: path.join(ROOT, "dist/lino-frames/candidates.tsv"), out: null, second: true,
    fake: null, parsed: null, concurrency: 4 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === "--candidates") o.candidates = path.resolve(next());
    else if (a === "--out") o.out = path.resolve(next());
    else if (a === "--no-second") o.second = false;
    else if (a === "--fake") o.fake = path.resolve(next());
    else if (a === "--parsed") o.parsed = path.resolve(next());
    else if (a === "--concurrency") o.concurrency = Math.max(1, Number(next()));
    else if (a === "-h" || a === "--help") { console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0]); process.exit(0); }
    else throw new Error(`unknown option ${a} (--help lists them)`);
  }
  return o;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** POST to the Messages API, with retries on overload and rate limits (as run.mjs). */
async function post(body, key) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}/messages`, {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": C.API_VERSION, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({ type: "error", error: { message: `HTTP ${res.status}, no JSON` } }));
    if (res.ok) return json;
    const retry = [408, 429, 500, 502, 503, 504, 529].includes(res.status);
    if (!retry || attempt >= 6) return json.type === "error" ? json : { type: "error", error: { message: `HTTP ${res.status}` } };
    const after = Number(res.headers.get("retry-after"));
    await sleep(after > 0 ? after * 1000 : Math.min(60000, 2000 * 2 ** attempt));
  }
}

/** The parse of every filled sentence: Greynir and parse_guard, through the
    build's own annotate (parse_check.py). */
function parse(items) {
  const r = spawnSync("python3", [path.join(HERE, "parse_check.py")], { cwd: ROOT, input: JSON.stringify(items),
    encoding: "utf8", maxBuffer: 1 << 28, env: { ...process.env, PYTHONHASHSEED: "0", PYTHONDONTWRITEBYTECODE: "1" } });
  if (r.status !== 0) {
    throw new Error(`python3 tools/lino-frames/parse_check.py failed (it needs the build's Python packages, `
      + `requirements.txt; --parsed FILE uses recorded verdicts instead):\n${r.stderr}`);
  }
  return JSON.parse(r.stdout);
}

async function main() {
  const o = args(process.argv.slice(2));
  const key = process.env.ANTHROPIC_API_KEY;
  const mode = !o.second ? "parse-only" : o.fake ? "fake" : "api";
  if (mode === "api" && !key) {
    throw new Error("ANTHROPIC_API_KEY is not set. Use --no-second (parse only) or --fake DIR to run without the API.");
  }
  if (!fs.existsSync(o.candidates)) throw new Error(`no candidates at ${o.candidates} (run tools/lino-frames/run.mjs first, or pass --candidates)`);
  const candidates = readTsv(fs.readFileSync(o.candidates, "utf8"));
  const runs = [...new Set(candidates.map((c) => c["keyrsla"]))];
  if (runs.length !== 1) throw new Error(`the candidates must come from one run; found ${runs.length}: ${runs.join(", ")}`);
  const batch = runs[0];
  if (!/^[\w.-]+$/.test(batch)) throw new Error(`not a run id: ${batch}`);
  const out = o.out || path.join(ROOT, "review/lino-rammar", batch);
  fs.mkdirSync(out, { recursive: true });

  const { DATA } = await import(path.join(ROOT, "data/data_bundle.js"));
  const { buildLexicon } = await import(path.join(ROOT, "src/js/core/lexicon.js"));
  const lex = buildLexicon(DATA);

  /* ---- 1. fill, and parse ---- */
  const filled = C.fill(candidates, lex);
  const items = C.parseItems(filled);
  let verdictOf;
  if (o.parsed) {
    const rec = new Map(JSON.parse(fs.readFileSync(o.parsed, "utf8")).map((v) => [`${v.frame}\t${v.text}`, v]));
    verdictOf = (r, x) => rec.get(`${r.frame}\t${x.text}`);
  } else {
    const by = new Map(parse(items).map((v) => [v.id, v]));
    verdictOf = (_r, _x, id) => by.get(id);
  }
  let rows = C.withParse(filled, verdictOf);
  /* parse.json: what the parse said, sentence by sentence, in the shape --parsed reads */
  fs.writeFileSync(path.join(out, "parse.json"), JSON.stringify(items.map((it) => {
    const [i, k] = it.id.split(".").map(Number);
    const v = verdictOf(filled[i], filled[i].sentences[k], it.id) || { ok: false, why: "engin þáttun" };
    return { frame: it.frame, text: it.text, lemma: it.lemma, mark: it.mark, ok: v.ok, why: v.why || "" };
  }), null, 1) + "\n");
  const passed = rows.filter((r) => r.machine.ok).length;
  console.log(`${batch}: ${rows.length} candidate pairs, ${passed} pass the parse, ${rows.length - passed} refused`);

  /* ---- 2. the second opinion ---- */
  const groups = C.nounGroups(rows);
  const answers = new Array(groups.length).fill(null), usage = [];
  let reused = 0, errors = 0;
  if (mode !== "parse-only") {
    if (mode === "api") fs.mkdirSync(path.join(out, "responses"), { recursive: true });
    const fileOf = (g) => `${g.o}.${g.c}.json`;
    const ask = async (g) => {
      const user = C.secondUserText(g);
      const saved = path.join(out, "responses", fileOf(g));
      if (mode === "api" && fs.existsSync(saved)) {
        const r = JSON.parse(fs.readFileSync(saved, "utf8"));
        if (r.promptVersion === C.SECOND_PROMPT_VERSION && r.model === C.SECOND_MODEL && r.user === user
          && r.response?.type === "message") { reused++; return r.response; }
      }
      if (mode === "fake") {
        const f = path.join(o.fake, fileOf(g));
        if (!fs.existsSync(f)) return { type: "error", error: { message: `no fixture ${fileOf(g)}` } };
        const r = JSON.parse(fs.readFileSync(f, "utf8"));
        return r.type === "message" || r.type === "error" ? r : r.response;
      }
      const response = await post(C.secondRequest(g), key);
      /* only a real answer is recorded: a fake run must never overwrite one */
      fs.writeFileSync(saved, JSON.stringify({ promptVersion: C.SECOND_PROMPT_VERSION, model: C.SECOND_MODEL,
        key: `${g.o}|${g.c}`, user, response }, null, 1));
      return response;
    };
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(o.concurrency, groups.length) }, async () => {
      while (next < groups.length) {
        const i = next++, g = groups[i];
        const response = await ask(g);
        answers[i] = C.secondAnswer(response, g);
        usage.push(response?.usage);
        if (answers[i].error) errors++;
        const no = [...answers[i].verdicts.values()].filter((v) => !v.ok).length;
        console.log(`${g.o} (${g.c}): ${answers[i].error ? `ERROR ${answers[i].error}` : `${g.items.length - no} já, ${no} nei`}`);
      }
    }));
  }
  rows = C.withSecond(rows, groups, answers);

  /* ---- 3. the queue ---- */
  const queueFile = path.join(out, C.QUEUE_FILE);
  const kept = fs.existsSync(queueFile) ? C.readQueue(fs.readFileSync(queueFile, "utf8")) : new Map();
  if (mode === "parse-only") {
    rows = rows.map((r) => ({ ...r, status: r.machine.ok ? C.STATUS.unchecked : C.STATUS.rejected }));
  } else {
    rows = C.classify(rows, batch, kept);
    fs.writeFileSync(queueFile, C.queueTsv(rows, batch, kept));
  }
  fs.copyFileSync(o.candidates, path.join(out, "candidates.tsv"));
  fs.writeFileSync(path.join(out, "checked.tsv"), C.checkedTsv(rows, batch));
  const count = (st) => rows.filter((r) => r.status === st).length;
  const counts = Object.fromEntries(Object.entries(C.STATUS).map(([k, st]) => [k, count(st)]));
  fs.writeFileSync(path.join(out, "batch.json"), JSON.stringify({
    id: batch, status: mode === "parse-only" ? "parsed" : errors ? "incomplete" : "review",
    second: mode === "parse-only" ? null : { mode, model: C.SECOND_MODEL, effort: C.SECOND_EFFORT,
      promptVersion: C.SECOND_PROMPT_VERSION, nouns: groups.length, reused, errors, usage: C.addUsage(usage) },
    sampleRate: C.SAMPLE_RATE, minSample: C.MIN_SAMPLE, sampleSeed: C.SAMPLE_SEED, redoThreshold: C.REDO_THRESHOLD,
    pairs: rows.length, counts,
  }, null, 1) + "\n");

  const rel = (f) => path.relative(process.cwd(), path.join(out, f));
  console.log(Object.entries(C.STATUS).map(([k, st]) => `${st}: ${counts[k]}`).join(" · "));
  if (mode === "fake") console.log("FAKE RUN: the second model's answers are recorded fixtures; no call was made to Claude.");
  if (mode === "parse-only") { console.log(`${rel("checked.tsv")} (no model was asked)`); return; }
  console.log(`${rel("checked.tsv")}: every pair`);
  console.log(`${rel(C.QUEUE_FILE)}: ${counts.disagree + counts.sample} pairs for the owner `
    + `(node tools/review.mjs shows them on dist/review.html)`);
  if (errors) { console.error(`${errors} nouns have no usable second opinion; run this again`); process.exitCode = 1; }
}

main().catch((e) => { console.error(e.message || e); process.exit(2); });
