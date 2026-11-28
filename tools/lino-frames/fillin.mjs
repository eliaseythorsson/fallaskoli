#!/usr/bin/env node
/* New sentences for the LÍNO-2 words the bank barely has (issue #23,
 * docs/DLD-PLAN.md §2 step 4): Fable 5.2 writes them, the build's own checks
 * and the owner decide which go in.
 *
 * OUTSIDE THE BUILD, like run.mjs and check.mjs. It reads the built data and
 * writes a batch folder for the owner; it never writes content/ or data/
 * (fillin-accept.mjs does, after the owner's verdicts). What it does and the
 * files it writes: tools/lino-frames/README.md, "The fill-in".
 *
 *   node tools/lino-frames/fillin.mjs --dry-run                  # no calls: the words, the prompt, an estimate
 *   node tools/lino-frames/fillin.mjs --fake DIR --parsed FILE   # recorded answers and parse, no calls, no Greynir
 *   ANTHROPIC_API_KEY=… node tools/lino-frames/fillin.mjs --count-tokens
 *   ANTHROPIC_API_KEY=… node tools/lino-frames/fillin.mjs --limit 20
 *   ANTHROPIC_API_KEY=… node tools/lino-frames/fillin.mjs        # every word with fewer than 5 sentences
 *
 * Options
 *   --out DIR          the batch folder (default review/lino-setningar/<keyrsla>; meant to be
 *                      committed with the batch's data PR. --dry-run: dist/lino-fillin)
 *   --limit N          only the N words best ranked on LÍNO-2
 *   --words a,b|so     only these words (lemma, or lemma|flokkur)
 *   --concurrency N    calls in flight after the first (default 4)
 *   --fake DIR         answers from DIR/<lemma>.<flokkur>.json instead of the API
 *   --parsed FILE      recorded parse verdicts (a parse.json this tool wrote) instead of
 *                      running Greynir; for tests and for machines without the Python deps
 *   --dry-run          no answers: the word list, the prompt, the requests and the estimate
 *   --count-tokens     ask POST /v1/messages/count_tokens (free) for the prefix and the
 *                      first word's request, then stop
 *
 * Run it again with the same --out at any time: answers in OUT/responses/ for
 * the same prefix, prompt version and word are reused (a stopped run resumes),
 * and verdicts the owner has already written in yfirferd.tsv are kept.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as F from "./fillin-lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const API = "https://api.anthropic.com/v1";

function args(argv) {
  const o = { out: null, limit: null, words: null, concurrency: 4, fake: null, parsed: null, dryRun: false, countTokens: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === "--out") o.out = path.resolve(next());
    else if (a === "--limit") o.limit = Number(next());
    else if (a === "--words") o.words = next().split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--concurrency") o.concurrency = Math.max(1, Number(next()));
    else if (a === "--fake") o.fake = path.resolve(next());
    else if (a === "--parsed") o.parsed = path.resolve(next());
    else if (a === "--dry-run") o.dryRun = true;
    else if (a === "--count-tokens") o.countTokens = true;
    else if (a === "-h" || a === "--help") { console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0]); process.exit(0); }
    else throw new Error(`unknown option ${a} (--help lists them)`);
  }
  return o;
}

/* LÍNO-2 as the build reads it (pipeline/lino.py, standard library only). */
function readLino() {
  const r = spawnSync("python3", ["-c", "import sys,json; sys.path.insert(0,'pipeline'); import lino; "
    + "json.dump([[l, sorted(c) if c else None, r] for l, c, r in lino.load(required=True)], sys.stdout, ensure_ascii=False)"],
  { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`python3 failed: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

/** Greynir and parse_guard through the build's annotate (parse_check.py). */
function parse(items) {
  if (!items.length) return [];
  const r = spawnSync("python3", [path.join(HERE, "parse_check.py")], { cwd: ROOT, input: JSON.stringify(items),
    encoding: "utf8", maxBuffer: 1 << 28, env: { ...process.env, PYTHONHASHSEED: "0", PYTHONDONTWRITEBYTECODE: "1" } });
  if (r.status !== 0) {
    throw new Error(`python3 tools/lino-frames/parse_check.py failed (it needs the build's Python packages, `
      + `requirements.txt; --parsed FILE uses recorded verdicts instead):\n${r.stderr}`);
  }
  return JSON.parse(r.stdout);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** POST to the Messages API, with retries on overload and rate limits (as run.mjs). */
async function post(endpoint, body, key) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}/${endpoint}`, {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": F.API_VERSION, "content-type": "application/json" },
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

const fileOf = (w) => `${w.o}.${w.c}.json`;

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
  const { words: all, full, missing } = F.targets(readLino(), lex);
  const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
  const rules = F.rulesFromRepo(Object.fromEntries(F.RULE_SOURCES.map((r) => [r.file, read(r.file)])));
  const prefix = F.prefixText(rules, lex.sentences);
  const hash = F.prefixHash(prefix);
  const id = `${hash}-v${F.PROMPT_VERSION}`;

  let words = all;
  if (o.words) {
    const want = new Set(o.words);
    words = all.filter((w) => want.has(w.o) || want.has(F.wordId(w)));
    const gone = o.words.filter((x) => !words.some((w) => w.o === x || F.wordId(w) === x));
    if (gone.length) console.warn(`not LÍNO-2 words with fewer than ${F.TARGET} sentences: ${gone.join(", ")}`);
  }
  if (o.limit != null) words = words.slice(0, o.limit);

  const out = o.out || path.join(ROOT, mode === "dry-run" ? "dist/lino-fillin" : `review/lino-setningar/${id}`);
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "prefix.txt"), prefix);
  console.log(`prefix ${hash} (${prefix.length} characters; rules from ${rules.map((r) => r.file).join(", ")})`);
  console.log(`${all.length} LÍNO-2 words have fewer than ${F.TARGET} sentences (${full.length} have ${F.TARGET} or more, `
    + `${missing.length} are not in the vocabulary); this selection: ${words.length}`);

  if (o.countTokens) {
    const a = await post("messages/count_tokens", { model: F.MODEL, system: [{ type: "text", text: prefix }],
      messages: [{ role: "user", content: "x" }] }, key);
    const { model, system, messages } = F.request(prefix, words[0]);
    const b = await post("messages/count_tokens", { model, system, messages }, key);
    console.log(`prefix (with a one-letter user turn): ${a.input_tokens ?? JSON.stringify(a)} tokens`);
    console.log(`first word's whole request (${F.wordId(words[0])}): ${b.input_tokens ?? JSON.stringify(b)} tokens`);
    return;
  }

  const run = { id, mode, model: F.MODEL, effort: F.EFFORT, promptVersion: F.PROMPT_VERSION, prefixHash: hash,
    prefixChars: prefix.length, reused: 0 };
  const est = (label, list) => ({ label, count: list.length, ...F.estimate(prefix, list), batch: F.estimate(prefix, list, { batch: true }) });
  const estimates = [est("this selection", words), est(`every word with fewer than ${F.TARGET} sentences`, all)];

  if (mode === "dry-run") {
    fs.mkdirSync(path.join(out, "requests"), { recursive: true });
    for (const w of words) fs.writeFileSync(path.join(out, "requests", fileOf(w)), JSON.stringify(F.request(prefix, w), null, 1));
    const rep = F.report(words, [], null, () => []);
    const md = F.reportMd(F.summary(rep, { full: full.length, missing: missing.length }), rep, run, { estimates });
    fs.writeFileSync(path.join(out, "report.md"), md);
    console.log(md.split("\n## Per word")[0]);
    return;
  }

  /* ---- 1. the sentences: a reused answer, a fixture, or a call ---- */
  if (mode === "api") fs.mkdirSync(path.join(out, "responses"), { recursive: true });
  async function ask(w) {
    const user = F.userText(w);
    const saved = path.join(out, "responses", fileOf(w));
    if (mode === "api" && fs.existsSync(saved)) {
      const r = JSON.parse(fs.readFileSync(saved, "utf8"));
      if (r.prefixHash === hash && r.promptVersion === F.PROMPT_VERSION && r.user === user && r.response?.type === "message") {
        run.reused++;
        return r.response;
      }
    }
    if (mode === "fake") {
      const f = path.join(o.fake, fileOf(w));
      if (!fs.existsSync(f)) return { type: "error", error: { message: `no fixture ${fileOf(w)}` } };
      const r = JSON.parse(fs.readFileSync(f, "utf8"));
      return r.type === "message" || r.type === "error" ? r : r.response;
    }
    const response = await post("messages", F.request(prefix, w), key);
    /* only a real answer is recorded: a fake run must never overwrite one */
    fs.writeFileSync(saved, JSON.stringify({ prefixHash: hash, promptVersion: F.PROMPT_VERSION, model: F.MODEL,
      key: F.wordId(w), user, response }, null, 1));
    return response;
  }
  const results = new Array(words.length);
  const one = async (i) => {
    const w = words[i];
    const response = await ask(w);
    const a = F.answer(response, w);
    results[i] = { w, a, cost: F.cost(response?.usage, F.PRICES) };
    console.log(`${F.wordId(w)}: ${a.error ? `ERROR ${a.error}` : `${a.sentences.length} of ${w.want}`}${a.note ? ` (${a.note})` : ""}`);
  };
  /* the first call alone, so the later ones read the cache it writes */
  if (words.length) await one(0);
  let next = 1;
  await Promise.all(Array.from({ length: Math.min(o.concurrency, Math.max(0, words.length - 1)) }, async () => {
    while (next < words.length) await one(next++);
  }));

  /* ---- 2. the checks ---- */
  const bank = new Set(lex.sentences.map((s) => s.t));
  let rows = F.precheck(results.flatMap(({ w, a }) => a.sentences.map((x) => ({ word: w, ...x }))), bank);
  const items = F.parseItems(rows);
  let parsedOf;
  if (o.parsed) {
    const rec = new Map(JSON.parse(fs.readFileSync(o.parsed, "utf8")).map((v) => [`${v.lemma}\t${v.level}\t${v.text}`, v]));
    parsedOf = (r) => rec.get(`${r.word.o}\t${r.lvl}\t${r.text}`);
  } else {
    const by = new Map(parse(items).map((v) => [v.id, v]));
    parsedOf = (_r, i) => by.get(String(i));
  }
  const entry = (w) => lex.lemma(w.o).find((x) => x.c === w.c);
  rows = rows.map((r, i) => {
    const machine = r.error ? { ok: false, why: r.error, gap: false } : F.judge(lex, entry(r.word), parsedOf(r, i));
    return { ...r, machine, status: machine.ok ? F.STATUS.review : F.STATUS.rejected };
  });
  fs.writeFileSync(path.join(out, "parse.json"), JSON.stringify(rows.filter((r) => !r.error).map((r) => {
    const v = parsedOf(r, rows.indexOf(r)) || { ok: false, why: "engin þáttun", rec: null };
    return { lemma: r.word.o, level: r.lvl, text: r.text, ok: v.ok, why: v.why || "", rec: v.rec || null };
  }), null, 1) + "\n");

  /* ---- 3. the queue, the files, the report ---- */
  const queueFile = path.join(out, F.QUEUE_FILE);
  const kept = fs.existsSync(queueFile) ? F.readQueue(fs.readFileSync(queueFile, "utf8")) : new Map();
  fs.writeFileSync(queueFile, F.queueTsv(rows, run, kept));
  fs.writeFileSync(path.join(out, "candidates.tsv"), F.candidatesTsv(rows, run));
  fs.writeFileSync(path.join(out, "checked.tsv"), F.checkedTsv(rows, run));
  const tokensOf = tokenWords(lex, rows, parsedOf);
  const rep = F.report(words, rows, null, tokensOf);
  const total = F.addCosts(results.map((r) => r.cost));
  const sum = F.summary(rep, { full: full.length, missing: missing.length });
  fs.writeFileSync(path.join(out, "report.tsv"), F.reportTsv(rep, run, false));
  fs.writeFileSync(path.join(out, "report.md"), F.reportMd(sum, rep, run, { estimates, total }));
  const errors = results.filter((r) => r.a.error);
  fs.writeFileSync(path.join(out, "batch.json"), JSON.stringify({
    ...run, status: errors.length ? "incomplete" : "review", prices: F.PRICES, total, summary: sum,
    words: results.map(({ w, a, cost }) => ({ key: F.wordId(w), lino: w.lino, before: w.before, want: w.want,
      written: a.sentences.length, dropped: a.dropped, note: a.note, error: a.error, cost })),
  }, null, 1) + "\n");

  const rel = (f) => path.relative(process.cwd(), path.join(out, f));
  console.log(`${rows.length} sentences written; ${sum.rejected} dropped by the machine (checked.tsv says why); ${sum.review} for the owner`);
  console.log(`words with ${F.TARGET}+ sentences: ${sum.reachBefore} -> ${sum.reachAfter} if all are accepted; `
    + `with a recall gap: ${sum.gapBefore} -> ${sum.gapAfter}`);
  if (mode === "fake") console.log("FAKE RUN: the answers are recorded fixtures; no call was made to Claude.");
  console.log(`${rel(F.QUEUE_FILE)}: ${sum.review} sentences for the owner (node tools/review.mjs shows them on dist/review.html)`);
  console.log(`${rel("report.md")}: the counts per word, and the cost`);
  if (errors.length) { console.error(`${errors.length} words failed (batch.json says why); run again to retry them`); process.exitCode = 1; }
}

/** text -> the ids of the words its tokens resolve to, from the parse. */
export function tokenWords(lex, rows, parsedOf) {
  const by = new Map();
  rows.forEach((r, i) => {
    const v = r.error ? null : parsedOf(r, i);
    const ids = new Set();
    for (const t of v?.rec?.tok || []) {
      const e = lex.entryForToken(t);
      if (e) ids.add(F.wordId(e));
    }
    by.set(r.text, ids);
  });
  return (text) => by.get(text) || new Set();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error(e.message || e); process.exit(2); });
}
