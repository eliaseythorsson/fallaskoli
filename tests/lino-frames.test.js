/* LÍNO-2 nouns in the noun frames: the authoring pass (issue #21),
   tools/lino-frames/.

   No test here calls Claude, and none can: the model's answers are recorded
   or written out below, and the command line is run only with --fake and
   --dry-run, with ANTHROPIC_API_KEY removed from its environment. Held here:
   - the pass is outside the build: nothing the build or the app runs names it;
   - the mechanical filter: only nouns go into noun frames, and a noun only
     into a frame whose grammar (gender, í/á, plural, article, the word
     already in the sentence) lets it in and which does not take it already;
     every other word on the list goes to the fill-in list;
   - the request: one noun, the frame list as a cached system prefix that is
     the same for every noun, the model and effort the plan names;
   - the answer: a frame not asked about is dropped, a broken answer keeps
     nothing; the cost comes from the API's usage fields;
   - the files: the candidates name word and frame exactly as
     content/setningar/lino-rammar.tsv does, so #22 can read them. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdtempSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as L from "../tools/lino-frames/lib.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

/* ---------- a small stand-in for the app's lexicon ------------------------ */

const FORMS = (stem) => Object.fromEntries(
  ["NFET", "ÞFET", "ÞGFET", "EFET", "NFETgr", "ÞFETgr", "ÞGFETgr", "EFETgr",
    "NFFT", "ÞFFT", "ÞGFFT", "EFFT", "NFFTgr", "ÞFFTgr", "ÞGFFTgr", "EFFTgr"].map((m) => [m, [`${stem}-${m}`]]));
const noun = (o, c, extra = {}) => ({ o, c, s: "abstract", forms: FORMS(o), ...extra });
const tok = (w, l, c, m) => ({ w, l, c, m });
const frame = (t, toks, slot, need, extra = {}) => ({ t, tok: toks, slot, fixed: false, need, ...extra });

const SENTENCES = [
  // 1: any noun, ÞFETgr
  frame("Við ræddum málið lengi.", [tok("Við", "við", "fornafn", "NFFT"), tok("ræddum", "ræða", "sagnorð", "x"),
    tok("málið", "mál", "nafnorð", "ÞFETgr"), tok("lengi", "lengi", "atviksorð", null), tok(".", ".", null, null)], 2, ["abstract", "text"]),
  // 2: only texts, gender pinned to hk
  frame("Þetta nýja blað er gott.", [tok("Þetta", "þessi", "fornafn", "x"), tok("nýja", "nýr", "lýsingarorð", "x"),
    tok("blað", "blað", "nafnorð", "NFET"), tok("er", "vera", "sagnorð", "x"), tok("gott", "góður", "lýsingarorð", "x"),
    tok(".", ".", null, null)], 2, ["text"], { rk: "hk" }),
  // 3: under í, plural
  frame("Við fórum í skólana.", [tok("Við", "við", "fornafn", "x"), tok("fórum", "fara", "sagnorð", "x"),
    tok("í", "í", "forsetning", null), tok("skólana", "skóli", "nafnorð", "ÞFFTgr"), tok(".", ".", null, null)], 3, ["building"], { ps: "í" }),
  // 4: a verb slot, not a noun frame
  frame("Hún hleypur.", [tok("Hún", "hún", "fornafn", "x"), tok("hleypur", "hlaupa", "sagnorð", "x"), tok(".", ".", null, null)], 1, ["abstract"]),
  // 5: fixed slot, never a frame
  frame("Gamla húsið stendur.", [tok("Gamla", "gamall", "lýsingarorð", "x"), tok("húsið", "hús", "nafnorð", "NFETgr"),
    tok("stendur", "standa", "sagnorð", "x"), tok(".", ".", null, null)], 1, ["building"], { fixed: true }),
  // 6: texts, and the sentence already holds "hugtak" in a compound
  frame("Kennarinn útskýrði dæmið um hugtakaforða.", [tok("Kennarinn", "kennari", "nafnorð", "NFETgr"),
    tok("útskýrði", "útskýra", "sagnorð", "x"), tok("dæmið", "dæmi", "nafnorð", "ÞFETgr"), tok("um", "um", "forsetning", null),
    tok("hugtakaforða", "hugtakaforði", "nafnorð", "ÞFET"), tok(".", ".", null, null)], 2, ["text", "book"]),
];

const NOUNS = [
  noun("hugtak", "hk", { lino: 3, nx: 1, d: "hugmynd, skilgreint heiti" }),     // unread: in no class list
  noun("regla", "kvk", { lino: 1, d: "fyrirmæli" }),                           // abstract, read
  noun("bylgja", "kvk", { lino: 2, np: 1 }),                                    // never plural
  noun("skúr", "kk", { lino: 4, s: "building" }), noun("skúr", "kvk", { lino: 5, s: "building" }),
  noun("ógn", "kvk", { lino: 6, nx: 1 }),                                       // on EXCLUDE (below)
  noun("mamma", "kvk", { lino: 10, s: "person", na: 1 }),                       // takes no article
  noun("hestur", "kk", { s: "animal" }),                                        // not on LÍNO-2
];
const ADJ = { o: "mikilvægur", c: "lo", lino: 7 };

const fakeLex = () => ({
  sentences: SENTENCES,
  nouns: NOUNS,
  lemma: (l) => [...NOUNS, ADJ].filter((w) => w.o === l),
  entryForToken: (t) => [...NOUNS, ADJ].find((w) => w.o === t.l) || null,
});
const LINO = [["regla", ["hk", "kk", "kvk"], 1], ["bylgja", ["hk", "kk", "kvk"], 2], ["hugtak", ["hk", "kk", "kvk"], 3],
  ["skúr", ["hk", "kk", "kvk"], 4], ["ógn", ["hk", "kk", "kvk"], 6], ["mikilvægur", ["lo"], 7],
  ["varnarþing", ["hk", "kk", "kvk"], 8], ["einnig", ["ao"], 9], ["mamma", ["hk", "kk", "kvk"], 10]];

/* ---------- outside the build --------------------------------------------- */

test("the pass is outside the build: nothing the build or the app runs names tools/lino-frames", () => {
  const files = ["build.sh", "tools/build.mjs", "build-in-container.sh", "Dockerfile", "Dockerfile.build"];
  const walk = (d) => readdirSync(path.join(root, d), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  files.push(...walk("pipeline").filter((f) => f.endsWith(".py")), ...walk("src").filter((f) => /\.(m?js|html)$/.test(f)),
    ...walk("server").filter((f) => f.endsWith(".mjs") && !f.includes("/data/")));
  const naming = files.filter((f) => existsSync(path.join(root, f)) && readFileSync(path.join(root, f), "utf8").includes("lino-frames"));
  assert.deepEqual(naming, []);
  /* and the pass itself makes no claim on the data: it reads data/, never writes it */
  const run = readFileSync(path.join(root, "tools/lino-frames/run.mjs"), "utf8");
  assert.doesNotMatch(run, /writeFileSync\([^)]*(data\/|content\/)/);
});

/* ---------- the mechanical filter ------------------------------------------ */

test("noun frames: a noun slot others may replace; not a verb slot, not a fixed one", () => {
  const f = L.nounFrames(SENTENCES);
  assert.deepEqual(f.map((x) => [x.n, x.s.t]), [[1, SENTENCES[0].t], [2, SENTENCES[1].t], [3, SENTENCES[2].t], [4, SENTENCES[5].t]]);
  assert.deepEqual(f.map((x) => x.mark), ["ÞFETgr", "NFET", "ÞFFTgr", "ÞFETgr"]);
});

test("filter: the grammar decides where a noun is tried, its class decides where it is already", () => {
  const { nouns } = L.filter(LINO, fakeLex(), new Set(["ógn"]));
  const by = Object.fromEntries(nouns.map((n) => [n.key, n]));
  /* hugtak: nobody has read it, so no frame takes it yet; the grammar lets it
     into 1 (abstract/text, ÞFETgr) and 2 (hk pinned, hugtak is hk); not 3
     (í: no í/á convention recorded) and not 4 (the sentence has hugtakaforða) */
  assert.deepEqual(by.hugtak.eligible, [1, 2]);
  assert.deepEqual(by.hugtak.already, []);
  /* regla is abstract and read: frame 1 takes it already; 2 pins hk */
  assert.deepEqual(by.regla.already, [1]);
  assert.deepEqual(by.regla.eligible, [4]);
  /* bylgja is abstract like regla; frame 3 is plural and bylgja is never
     shown in the plural (and has no í) */
  assert.deepEqual([by.bylgja.already, by.bylgja.eligible], [[1], [4]]);
  /* skúr is a building, in two genders: a pair overrides the class, not the
     gender (2 pins hk) or í (no convention recorded for skúr) */
  assert.deepEqual(by["skúr|kk"].eligible, [1, 4]);
  assert.deepEqual(by["skúr|kvk"].eligible, [1, 4]);
  assert.deepEqual(nouns.map((n) => n.key), ["regla", "bylgja", "hugtak", "skúr|kk", "skúr|kvk"], "best LÍNO rank first");
  assert.equal(by.hugtak.d, "hugmynd, skilgreint heiti", "the definition goes with the word");
});

test("filter: everything else on the list goes to the fill-in, with the reason", () => {
  const { fillIn } = L.filter(LINO, fakeLex(), new Set(["ógn"]));
  const why = Object.fromEntries(fillIn.map((r) => [`${r.o}|${r.c}`, r.why]));
  assert.match(why["ógn|kvk"], /EXCLUDE/);
  assert.match(why["mamma|kvk"], /enginn rammi/, "every frame has the article, a pinned gender or í");
  assert.match(why["mikilvægur|lo"], /ekki nafnorð/);
  assert.match(why["varnarþing|hk/kk/kvk"], /ekki í orðaforðanum/);
  assert.match(why["einnig|ao"], /ekki nafnorð, og ekki í orðaforðanum/);
  assert.equal(fillIn.some((r) => r.o === "hestur"), false, "a word not on LÍNO-2 is in neither list");
  assert.equal(fillIn.some((r) => ["regla", "bylgja", "hugtak", "skúr"].includes(r.o)), false, "a noun that is tried is not in the fill-in");
});

test("a word is written as lino-rammar.tsv wants it: lemma, or lemma|kyn when it has two genders", () => {
  assert.equal(L.pairWord(NOUNS[0], NOUNS), "hugtak");
  assert.equal(L.pairWord(NOUNS[3], NOUNS), "skúr|kk");
  assert.equal(L.pairWord(NOUNS[4], NOUNS), "skúr|kvk");
});

/* ---------- the request ------------------------------------------------------ */

test("the prompt: frames numbered, the slot in brackets, its form, what it takes", () => {
  const frames = L.nounFrames(SENTENCES);
  const p = L.prefixText(frames);
  assert.match(p, /\n1\. Við ræddum \[málið\] lengi\. \(þf\. et\. með greini; takes: abstract, text\)\n/);
  assert.match(p, /\n3\. Við fórum í \[skólana\]\. \(þf\. ft\. með greini; takes: building\)\n/);
  assert.match(p, /MEANING ONLY/);
  assert.equal(L.markGloss("ÞGFFT"), "þgf. ft. án greinis");
  assert.equal(L.ranges([1, 2, 3, 5, 7, 8, 10]), "1-3, 5, 7-8, 10");
  assert.equal(L.ranges([]), "");
});

test("one request per noun: the cached prefix is the same for every noun; model and effort as planned", () => {
  const { frames, nouns } = L.filter(LINO, fakeLex(), new Set());
  const prefix = L.prefixText(frames);
  const a = L.request(prefix, nouns[0]), b = L.request(prefix, nouns[1]);
  assert.equal(a.model, "claude-opus-5-5");
  assert.equal(a.output_config.effort, "low");
  assert.deepEqual(a.system, b.system, "byte for byte the same prefix, so it is read from the cache");
  assert.deepEqual(a.system.at(-1).cache_control, { type: "ephemeral" });
  assert.deepEqual(a.output_config, b.output_config, "the format and effort do not change between calls");
  assert.equal(a.messages.length, 1);
  assert.match(a.messages[0].content, /^Noun: regla \(feminine\)\nDefinition: fyrirmæli\nFrames its grammar allows \(1\): 4$/);
  for (const k of ["temperature", "top_p", "top_k", "thinking"]) assert.equal(k in a, false, `${k} is not sent`);
  assert.equal(a.output_config.format.type, "json_schema");
  assert.equal(a.output_config.format.schema.additionalProperties, false);
});

/* ---------- the answer and the cost ------------------------------------------- */

const msg = (text, extra = {}) => ({ type: "message", role: "assistant", model: L.MODEL, stop_reason: "end_turn",
  content: [{ type: "thinking", thinking: "…" }, { type: "text", text }], usage: {}, ...extra });
const NOUN = { key: "hugtak", o: "hugtak", c: "hk", eligible: [1, 2, 7] };

test("answer: only frames that were asked about are kept; the rest are reported", () => {
  const a = L.answer(msg(JSON.stringify({ frames: [{ n: 7, why: "ok\tfine" }, { n: 2, why: "good" }, { n: 3, why: "?" }, { n: 2, why: "again" }] })), NOUN);
  assert.equal(a.error, null);
  assert.deepEqual(a.accepted, [{ n: 2, why: "good" }, { n: 7, why: "ok fine" }]);
  assert.deepEqual(a.dropped, [{ n: 3, why: "not among the frames asked about" }]);
  assert.deepEqual(L.answer(msg('{"frames": []}'), NOUN).accepted, [], "accepting none is an answer");
});

test("answer: a broken response keeps nothing and says why", () => {
  assert.match(L.answer(msg("Sure! Frames 1 and 2."), NOUN).error, /not JSON/);
  assert.match(L.answer(msg('{"frames":[{"n":1', { stop_reason: "max_tokens" }), NOUN).error, /max_tokens/);
  assert.match(L.answer(msg("", { stop_reason: "refusal" }), NOUN).error, /refused/);
  assert.match(L.answer({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } }, NOUN).error, /Overloaded/);
  assert.match(L.answer(msg('{"other": 1}'), NOUN).error, /no frames/);
});

test("cost: from the usage fields, at the stated prices", () => {
  const first = L.cost({ input_tokens: 200, cache_creation_input_tokens: 15000, cache_read_input_tokens: 0, output_tokens: 500,
    cache_creation: { ephemeral_5m_input_tokens: 15000, ephemeral_1h_input_tokens: 0 } });
  assert.deepEqual(first.tokens, { input: 200, cacheWrite: 15000, cacheRead: 0, output: 500 });
  assert.equal(first.usd, (200 * 4 + 15000 * 5 + 500 * 20) / 1e6);
  const later = L.cost({ input_tokens: 200, cache_creation_input_tokens: 0, cache_read_input_tokens: 15000, output_tokens: 500 });
  assert.equal(later.usd, (200 * 4 + 15000 * 0.2 + 500 * 20) / 1e6);
  const hour = L.cost({ cache_creation_input_tokens: 1000, cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 1000 } });
  assert.equal(hour.usd, 1000 * 8 / 1e6, "a one-hour write is priced as one");
  const sum = L.addCosts([first, later]);
  assert.deepEqual(sum.tokens, { input: 400, cacheWrite: 15000, cacheRead: 15000, output: 1000 });
  assert.equal(L.cost(undefined).usd, 0);
});

test("estimate: the prefix written once and read for every later noun", () => {
  const { frames, nouns } = L.filter(LINO, fakeLex(), new Set());
  const prefix = L.prefixText(frames);
  const e = L.estimate(prefix, nouns, { charsPerToken: [4, 4], outputPerNoun: [100, 100] });
  const p = Math.ceil(prefix.length / 4), u = nouns.reduce((a, n) => a + Math.ceil(L.userText(n).length / 4), 0);
  assert.equal(e.low.usd, (p * 5 + p * (nouns.length - 1) * 0.2 + u * 4 + 100 * nouns.length * 20) / 1e6);
  assert.ok(L.estimate(prefix, nouns).high.usd > L.estimate(prefix, nouns).low.usd);
  assert.equal(L.estimate(prefix, []).low.usd, 0);
});

/* ---------- the files -------------------------------------------------------------- */

test("candidates.tsv: word and frame as lino-rammar.tsv writes them, readable back", () => {
  const frames = L.nounFrames(SENTENCES);
  const text = L.candidatesTsv([{ key: "skúr|kk", c: "kk", frame: frames[0], why: "a\tb" }], { model: L.MODEL, id: "abc-v1" });
  assert.match(text, /^# Tillögur/);
  const rows = L.readTsv(text);
  assert.deepEqual(rows, [{ "orð": "skúr|kk", kyn: "kk", rammi: "Við ræddum málið lengi.", nr: "1", mynd: "ÞFETgr",
    "í eyðunni": "málið", "rök": "a b", "líkan": "claude-opus-5-5", keyrsla: "abc-v1" }]);
  assert.deepEqual(Object.keys(rows[0]), L.CANDIDATE_COLUMNS);
  const pairs = L.readTsv(readFileSync(path.join(root, "content/setningar/lino-rammar.tsv"), "utf8"));
  assert.ok(pairs.length && "orð" in pairs[0] && "rammi" in pairs[0], "the two columns have the same names there");
});

test("cost.md says plainly when nothing was measured", () => {
  const run = { mode: "fake", model: L.MODEL, effort: "low", promptVersion: 1, prefixHash: "x", prefixChars: 9, frames: 1 };
  assert.match(L.costReport({ run, perNoun: [], total: null }), /FAKE RUN: no call was made to Claude/);
  assert.match(L.costReport({ run: { ...run, mode: "dry-run" }, perNoun: [], total: null }), /DRY RUN/);
  assert.doesNotMatch(L.costReport({ run: { ...run, mode: "api" }, perNoun: [], total: null }), /no call/);
});

/* ---------- the command, on the real data, with recorded answers ------------------ */

const haveLino = existsSync(path.join(root, "sources/lino2.csv"));
const cli = (...args) => {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  return spawnSync(process.execPath, [path.join(root, "tools/lino-frames/run.mjs"), ...args], { cwd: root, env, encoding: "utf8" });
};

test("run.mjs --fake: the recorded dry run gives candidates of real frames and a cost report", { skip: !haveLino && "sources/lino2.csv is not in this checkout" }, () => {
  const out = mkdtempSync(path.join(tmpdir(), "lino-frames-"));
  const r = cli("--fake", "tools/lino-frames/fixtures/dry-run", "--limit", "20", "--out", out);
  assert.equal(r.status, 0, r.stderr);
  for (const f of ["candidates.tsv", "cost.md", "run.json", "fill-in.tsv", "prefix.txt"]) assert.ok(existsSync(path.join(out, f)), f);
  assert.equal(existsSync(path.join(out, "responses")), false, "a fake run records nothing as an answer");
  const bank = new Set(JSON.parse(readFileSync(path.join(root, "data/sentences.json"), "utf8")).map((s) => s.t));
  const rows = L.readTsv(readFileSync(path.join(out, "candidates.tsv"), "utf8"));
  for (const row of rows) assert.ok(bank.has(row.rammi), `a sentence of the bank: ${row.rammi}`);
  const run = JSON.parse(readFileSync(path.join(out, "run.json"), "utf8"));
  assert.equal(run.mode, "fake");
  assert.equal(run.nouns.length, 20);
  assert.equal(run.nouns.filter((n) => n.error).length, 0);
  assert.match(readFileSync(path.join(out, "cost.md"), "utf8"), /FAKE RUN/);
  const fill = L.readTsv(readFileSync(path.join(out, "fill-in.tsv"), "utf8"));
  assert.ok(fill.some((x) => x.flokkur === "so") && fill.some((x) => x.flokkur === "lo"), "verbs and adjectives are listed for the fill-in");
  assert.ok(fill.every((x) => !run.nouns.some((n) => n.o === x["orð"] && n.c === x.flokkur)), "no noun that was tried is in the fill-in");
});

test("run.mjs: with no key and no --fake/--dry-run it stops before any call", { skip: !haveLino && "sources/lino2.csv is not in this checkout" }, () => {
  const r = cli("--limit", "1", "--out", mkdtempSync(path.join(tmpdir(), "lino-frames-")));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /ANTHROPIC_API_KEY is not set/);
});

test("run.mjs --dry-run: the requests it would send, and an estimate", { skip: !haveLino && "sources/lino2.csv is not in this checkout" }, () => {
  const out = mkdtempSync(path.join(tmpdir(), "lino-frames-"));
  const r = cli("--dry-run", "--words", "hugmynd,tillaga", "--out", out);
  assert.equal(r.status, 0, r.stderr);
  const req = JSON.parse(readFileSync(path.join(out, "requests/hugmynd.kvk.json"), "utf8"));
  assert.equal(req.model, "claude-opus-5-5");
  assert.equal(req.system[0].text, readFileSync(path.join(out, "prefix.txt"), "utf8"));
  assert.match(readFileSync(path.join(out, "cost.md"), "utf8"), /## Estimate for 2 nouns/);
});
