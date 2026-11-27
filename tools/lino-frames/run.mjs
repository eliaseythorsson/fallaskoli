#!/usr/bin/env node
/* LÍNO-2 nouns in the noun frames: the authoring pass (issue #21).
 *
 * OUTSIDE THE BUILD. Nothing in build.sh, tools/build.mjs or the app imports
 * or runs this; it writes candidates for a person to review, never data.
 * What it does and the files it writes: tools/lino-frames/README.md.
 *
 *   node tools/lino-frames/run.mjs --dry-run              # no calls: filter + estimate
 *   node tools/lino-frames/run.mjs --fake DIR --limit 20  # recorded answers, no calls
 *   ANTHROPIC_API_KEY=… node tools/lino-frames/run.mjs --count-tokens
 *   ANTHROPIC_API_KEY=… node tools/lino-frames/run.mjs --limit 20
 *   ANTHROPIC_API_KEY=… node tools/lino-frames/run.mjs    # every noun
 *
 * Options
 *   --out DIR          where to write (default dist/lino-frames; dist/ is not committed)
 *   --limit N          only the N nouns best ranked on LÍNO-2
 *   --words a,b,c      only these nouns (lemma, or lemma|kyn)
 *   --concurrency N    calls in flight after the first (default 4)
 *   --fake DIR         answers from DIR/<lemma>.<kyn>.json instead of the API
 *   --dry-run          no answers at all: the filter, the prompt and the estimate
 *   --count-tokens     ask POST /v1/messages/count_tokens (free) for the prefix
 *                      and the first noun's request, then stop
 *
 * Answers already in OUT/responses/ for the same prompt (prefix hash and
 * prompt version) are reused, so a run that stopped can be started again.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as L from "./lib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const API = "https://api.anthropic.com/v1";

function args(argv) {
  const o = { out: path.join(ROOT, "dist/lino-frames"), limit: null, words: null, concurrency: 4,
    fake: null, dryRun: false, countTokens: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === "--out") o.out = path.resolve(next());
    else if (a === "--limit") o.limit = Number(next());
    else if (a === "--words") o.words = next().split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--concurrency") o.concurrency = Math.max(1, Number(next()));
    else if (a === "--fake") o.fake = path.resolve(next());
    else if (a === "--dry-run") o.dryRun = true;
    else if (a === "--count-tokens") o.countTokens = true;
    else if (a === "-h" || a === "--help") { console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0]); process.exit(0); }
    else throw new Error(`unknown option ${a} (--help lists them)`);
  }
  return o;
}

/* LÍNO-2 as the build reads it, and noun_classes.EXCLUDE: both from the
   pipeline's own Python (standard library only), so there is one reader. */
function python(code) {
  const r = spawnSync("python3", ["-c", code], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`python3 failed: ${r.stderr}`);
  return JSON.parse(r.stdout);
}
const readLino = () => python("import sys,json; sys.path.insert(0,'pipeline'); import lino; "
  + "json.dump([[l, sorted(c) if c else None, r] for l, c, r in lino.load(required=True)], sys.stdout, ensure_ascii=False)");
const readExclude = () => new Set(python("import sys,json; sys.path.insert(0,'pipeline'); import noun_classes; "
  + "json.dump(sorted(noun_classes.EXCLUDE), sys.stdout, ensure_ascii=False)"));

const fileOf = (n) => `${n.o}.${n.c}.json`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** POST to the Messages API, with retries on overload and rate limits. */
async function post(endpoint, body, key) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}/${endpoint}`, {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": L.API_VERSION, "content-type": "application/json" },
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

async function main() {
  const o = args(process.argv.slice(2));
  const key = process.env.ANTHROPIC_API_KEY;
  const mode = o.dryRun ? "dry-run" : o.fake ? "fake" : "api";
  if ((mode === "api" || o.countTokens) && !key) {
    throw new Error("ANTHROPIC_API_KEY is not set. Use --dry-run or --fake DIR to run without the API.");
  }

  const { DATA } = await import(path.join(ROOT, "data/data_bundle.js"));
  const { buildLexicon } = await import(path.join(ROOT, "src/js/core/lexicon.js"));
  const lex = buildLexicon(DATA);
  const { frames, nouns: all, fillIn } = L.filter(readLino(), lex, readExclude());
  const prefix = L.prefixText(frames);
  const hash = L.prefixHash(prefix);

  let nouns = all;
  if (o.words) {
    const want = new Set(o.words);
    nouns = all.filter((n) => want.has(n.key) || want.has(n.o) || want.has(`${n.o}|${n.c}`));
    const missing = o.words.filter((w) => !nouns.some((n) => n.key === w || n.o === w || `${n.o}|${n.c}` === w));
    if (missing.length) console.warn(`not LÍNO-2 nouns that can be tried: ${missing.join(", ")}`);
  }
  if (o.limit != null) nouns = nouns.slice(0, o.limit);

  fs.mkdirSync(o.out, { recursive: true });
  if (mode === "api") fs.mkdirSync(path.join(o.out, "responses"), { recursive: true });
  fs.writeFileSync(path.join(o.out, "fill-in.tsv"), L.fillInTsv(fillIn));
  fs.writeFileSync(path.join(o.out, "prefix.txt"), prefix);
  console.log(`${frames.length} noun frames, prefix ${hash} (${prefix.length} characters)`);
  console.log(`${all.length} LÍNO-2 nouns can be tried; ${fillIn.length} words for the fill-in (fill-in.tsv)`);

  if (o.countTokens) {
    const sys = { model: L.MODEL, system: [{ type: "text", text: prefix }], messages: [{ role: "user", content: "x" }] };
    const a = await post("messages/count_tokens", sys, key);
    /* The structured-output format adds tokens of its own that this count
       does not include; the real run's usage does. */
    const { model, system, messages } = L.request(prefix, nouns[0]);
    const b = await post("messages/count_tokens", { model, system, messages }, key);
    console.log(`prefix (with a one-letter user turn): ${a.input_tokens ?? JSON.stringify(a)} tokens`);
    console.log(`first noun's whole request (${nouns[0].key}): ${b.input_tokens ?? JSON.stringify(b)} tokens`);
    return;
  }

  const run = { id: `${hash}-v${L.PROMPT_VERSION}`, mode, model: L.MODEL, effort: L.EFFORT,
    promptVersion: L.PROMPT_VERSION, prefixHash: hash, prefixChars: prefix.length, frames: frames.length, reused: 0 };
  const estimateAll = { label: "every noun that can be tried", count: all.length, ...L.estimate(prefix, all) };
  const estimateThis = { label: "this selection", count: nouns.length, ...L.estimate(prefix, nouns) };

  if (mode === "dry-run") {
    fs.mkdirSync(path.join(o.out, "requests"), { recursive: true });
    for (const n of nouns) {
      fs.writeFileSync(path.join(o.out, "requests", fileOf(n)), JSON.stringify(L.request(prefix, n), null, 1));
    }
    const report = L.costReport({ run, perNoun: [], total: null, estimates: [estimateThis, estimateAll] });
    fs.writeFileSync(path.join(o.out, "cost.md"), report);
    console.log(report);
    return;
  }

  /* One noun: a reused answer, a fixture, or a call. */
  const record = (n, response) => ({ prefixHash: hash, promptVersion: L.PROMPT_VERSION, model: L.MODEL,
    key: n.key, user: L.userText(n), response });
  async function ask(n) {
    const saved = path.join(o.out, "responses", fileOf(n));
    if (mode === "api" && fs.existsSync(saved)) {
      const r = JSON.parse(fs.readFileSync(saved, "utf8"));
      if (r.prefixHash === hash && r.promptVersion === L.PROMPT_VERSION && r.response?.type === "message") {
        run.reused++;
        return r.response;
      }
    }
    let response;
    if (mode === "fake") {
      const f = path.join(o.fake, fileOf(n));
      if (!fs.existsSync(f)) response = { type: "error", error: { message: `no fixture ${fileOf(n)}` } };
      else {
        const r = JSON.parse(fs.readFileSync(f, "utf8"));
        response = r.type === "message" || r.type === "error" ? r : r.response;
      }
    } else {
      response = await post("messages", L.request(prefix, n), key);
    }
    /* Only a real answer is recorded: a fake run must never overwrite one. */
    if (mode === "api") fs.writeFileSync(saved, JSON.stringify(record(n, response), null, 1));
    return response;
  }

  const results = new Array(nouns.length);
  const one = async (i) => {
    const n = nouns[i];
    const response = await ask(n);
    const a = L.answer(response, n);
    results[i] = { n, a, cost: L.cost(response?.usage) };
    console.log(`${n.key}: ${a.error ? `ERROR ${a.error}` : `${a.accepted.length} of ${n.eligible.length}`}`);
  };
  /* The first call alone: the cache entry exists only once its response has
     started, and every later call should read it, not write it again. */
  if (nouns.length) await one(0);
  let next = 1;
  await Promise.all(Array.from({ length: Math.min(o.concurrency, Math.max(0, nouns.length - 1)) }, async () => {
    while (next < nouns.length) await one(next++);
  }));

  const byN = new Map(frames.map((f) => [f.n, f]));
  const rows = results.flatMap(({ n, a }) => a.accepted.map((x) => ({ key: n.key, c: n.c, frame: byN.get(x.n), why: x.why })));
  fs.writeFileSync(path.join(o.out, "candidates.tsv"), L.candidatesTsv(rows, run));
  const perNoun = results.map(({ n, a, cost }) => ({ key: n.key, asked: n.eligible.length, accepted: a.accepted.length, cost }));
  const total = L.addCosts(results.map((r) => r.cost));
  fs.writeFileSync(path.join(o.out, "run.json"), JSON.stringify({
    ...run, prices: L.PRICES, total,
    nouns: results.map(({ n, a, cost }) => ({ key: n.key, o: n.o, c: n.c, lino: n.lino,
      asked: n.eligible, already: n.already.length, accepted: a.accepted.map((x) => x.n),
      dropped: a.dropped, error: a.error, cost })),
  }, null, 1));
  const report = L.costReport({ run, perNoun, total, estimates: [estimateThis, estimateAll] });
  fs.writeFileSync(path.join(o.out, "cost.md"), report);
  console.log(`\n${rows.length} candidate pairs -> ${path.relative(ROOT, path.join(o.out, "candidates.tsv"))}`);
  console.log(report.split("\n").filter((l) => l.startsWith("| **total**") || l.startsWith("Per noun")).join("\n"));
  const errors = results.filter((r) => r.a.error);
  if (errors.length) {
    console.error(`${errors.length} nouns failed (run.json says why); run again to retry them`);
    process.exitCode = 1;
  }
}

main().catch((e) => { console.error(e.message || e); process.exit(2); });
