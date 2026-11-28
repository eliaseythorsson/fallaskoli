/* The self-check, the second opinion and the review queue for the LÍNO-2
   pairs (issue #22, docs/DLD-PLAN.md §2 steps 3 and 5): tools/lino-frames/
   check.mjs, accept.mjs, check-lib.mjs and parse_check.py.

   NO TEST HERE CALLS CLAUDE, and none needs Greynir. The second model's
   answers are recorded files (tools/lino-frames/fixtures/check/second/, fakes
   written by hand, each says so) and the parse's verdicts are a recording of
   a real Greynir run (fixtures/check/parse.json); the commands are run with
   --fake and --parsed and with ANTHROPIC_API_KEY removed. One test does run
   the real parse, and only where the build's Python packages are installed.

   What is held:
     - the pair is filled the way the app fills it, form from BÍN, and judged
       as a whole sentence
     - every disagreement and a seeded sample of the rest reach the queue, and
       the review page shows the queue
     - the owner's verdicts decide: an error rate over the threshold marks the
       batch for redo and keeps the unread pairs out
     - what is accepted is lines of lino-rammar.tsv that the build's own
       reader takes, and nothing of this runs inside the build */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync, mkdtempSync, mkdirSync, cpSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readTsv } from "../tools/lino-frames/lib.mjs";
import * as C from "../tools/lino-frames/check-lib.mjs";
import { collect, queueNote, attachNotes, build } from "../tools/review.mjs";
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const FX = path.join(root, "tools/lino-frames/fixtures/check");
const lex = buildLexicon(DATA);
const candidates = readTsv(readFileSync(path.join(FX, "candidates.tsv"), "utf8"));
const recorded = JSON.parse(readFileSync(path.join(FX, "parse.json"), "utf8"));
const BATCH = "1ea0754103aa7832-v1";
const tmp = () => mkdtempSync(path.join(tmpdir(), "lino-check-"));

const EXPLAIN = "Kennarinn útskýrði dæmið fyrir bekknum í rólegheitum.";
const cand = (word, frame, extra = {}) => ({ "orð": word, kyn: "", rammi: frame, mynd: "", "rök": "r", keyrsla: "t-v1", ...extra });

/* ---------- outside the build --------------------------------------------- */

test("the self-check is outside the build, and only accept.mjs writes content", () => {
  for (const f of ["build.sh", "tools/build.mjs", "build-in-container.sh"]) {
    const text = readFileSync(path.join(root, f), "utf8");
    assert.doesNotMatch(text, /check\.mjs|accept\.mjs|parse_check|claude-fable|anthropic/i, f);
  }
  /* the review page is part of the build and shows the queue; it must not
     run or import the pass */
  assert.doesNotMatch(readFileSync(path.join(root, "tools/review.mjs"), "utf8"), /lino-frames\/|import .*check-lib|anthropic/);
  const check = readFileSync(path.join(root, "tools/lino-frames/check.mjs"), "utf8");
  assert.doesNotMatch(check, /writeFileSync\([^)]*(data\/|content\/)/);
  /* the Python part uses the build's annotate and writes nothing */
  const py = readFileSync(path.join(root, "tools/lino-frames/parse_check.py"), "utf8");
  assert.doesNotMatch(py, /open\([^)]*["']w/);
});

/* ---------- 1. the pair as a sentence ---------------------------------------- */

test("fill: the word stands in the frame in the form BÍN has under the frame's mark", () => {
  const rows = C.fill(candidates, lex);
  assert.equal(rows.length, 14);
  assert.ok(rows.every((r) => !r.error), JSON.stringify(rows.filter((r) => r.error)));
  const text = (word, frame) => rows.find((r) => r.key === word && r.frame.startsWith(frame)).sentences.map((x) => x.text);
  assert.deepEqual(text("breyting", "Þetta gerðist allt vegna"), ["Þetta gerðist allt vegna breytingarinnar."]);   // EFETgr
  assert.deepEqual(text("samningur", "Kennarinn útskýrði dæmið fyrir"), ["Kennarinn útskýrði samninginn fyrir bekknum í rólegheitum."]);
  assert.deepEqual(text("heimild", "Við bíðum eftir"), ["Við bíðum eftir heimild frá skólanum."]);                 // ÞGFET
  assert.deepEqual(text("tillaga", "Þetta gerðist allt vegna"), ["Þetta gerðist allt vegna tillögunnar."]);
  /* the definition goes along for the second model */
  assert.ok(rows.find((r) => r.o === "breyting").d.length > 0);
});

test("fill: a pair the app could never show is refused, in words", () => {
  const [unknown, reworded, moved, repeated, ok] = C.fill([
    cand("xyzzy", EXPLAIN, { kyn: "kk" }),
    cand("breyting", "Kennarinn útskýrði dæmið fyrir bekknum.", { kyn: "kvk" }),
    cand("breyting", EXPLAIN, { kyn: "kvk", mynd: "NFET" }),
    cand("kennari", EXPLAIN, { kyn: "kk" }),
    cand("breyting", EXPLAIN, { kyn: "kvk", mynd: "ÞFETgr" }),
  ], lex);
  assert.match(unknown.error, /ekki nafnorð í orðaforðanum/);
  assert.match(reworded.error, /ekki \(lengur\) setning í setningabankanum/);
  assert.match(moved.error, /eyðan er nú ÞFETgr en var NFET/);
  assert.match(repeated.error, /stendur þegar í setningunni/);
  assert.equal(ok.error, null);
  /* and a refused pair fails the machine check without being parsed */
  const rows = C.withParse([unknown, ok], () => ({ ok: true }));
  assert.deepEqual(rows.map((r) => r.machine.ok), [false, true]);
  assert.equal(C.parseItems([unknown, ok]).length, 1);
});

test("fill: a frame that pins a gender, or stands under í/á, refuses a word that does not fit", () => {
  const pinned = lex.sentences.find((s) => s.rk === "kk" && s.slot != null && !s.fixed && s.need.length && s.tok[s.slot].c === "nafnorð");
  const [r] = C.fill([cand("breyting", pinned.t, { kyn: "kvk" })], lex);
  assert.match(r.error, /málfræðin leyfir orðið ekki/);
});

test("a pair passes the parse only if every one of its sentences does, and one without a verdict fails", () => {
  const row = { key: "hönd", o: "hönd", c: "kvk", frame: "F", mark: "ÞGFET", slot: 1, error: null,
    sentences: [{ form: "hendi", text: "A hendi." }, { form: "hönd", text: "A hönd." }] };
  assert.equal(C.withParse([row], () => ({ ok: true }))[0].machine.ok, true);
  const one = C.withParse([row], (_r, x) => ({ ok: x.form === "hendi", why: "lesið sem ÞFET" }))[0].machine;
  assert.deepEqual(one, { ok: false, why: "lesið sem ÞFET" });
  assert.match(C.withParse([row], () => undefined)[0].machine.why, /engin þáttun/);
});

test("the recorded parse covers every sentence of the fixture candidates", () => {
  const items = C.parseItems(C.fill(candidates, lex));
  const have = new Set(recorded.map((v) => `${v.frame}\t${v.text}`));
  for (const it of items) assert.ok(have.has(`${it.frame}\t${it.text}`), `no recorded parse for: ${it.text} (re-record fixtures/check/parse.json)`);
});

/* parse_check.compare is pure (standard library only): what "the same
   sentence with another word" means, held without a parser. */
const py = ["python3", "python"].find((p) => spawnSync(p, ["-c", "import sys; sys.exit(sys.version_info < (3, 8))"], { cwd: root }).status === 0);
const runPy = (code, input) => spawnSync(py, ["-c", code], { cwd: root, encoding: "utf8", input,
  env: { ...process.env, PYTHONHASHSEED: "0", PYTHONDONTWRITEBYTECODE: "1" } });

test("parse_check.compare: the slot must be that noun in the frame's mark, and nothing else may move", { skip: py ? false : "no Python 3" }, () => {
  const tok = (w, l, c, m, r, extra = {}) => ({ w, l, c, m, r, k: "aðalsetning", x: c === "nafnorð" ? "no" : c === "sagnorð" ? "so" : "", ...extra });
  const frame = { tok: [tok("Ég", "ég", "fornafn", "NFET", "frumlag"), tok("sá", "sjá", "sagnorð", "GM-FH-ÞT-1P-ET", "umsögn"),
    tok("bílinn", "bíll", "nafnorð", "ÞFETgr", "andlag"), tok(".", ".", null, null, null)] };
  const filled = (slot, other = {}) => ({ tok: frame.tok.map((t, j) => (j === 2 ? slot : j === 1 ? { ...t, ...other } : t)) });
  const item = { lemma: "brú", mark: "ÞFETgr", slot: 2 };
  const good = tok("brúna", "brú", "nafnorð", "ÞFETgr", "andlag");
  const cases = [
    ["ok", filled(good), []],
    ["noparse", null, []],
    ["hard", filled(good), ["BÍN hefur aðeins …"]],
    ["verb", filled(tok("brúna", "brúna", "sagnorð", "GM-NH", null)), []],
    ["case", filled(tok("brúna", "brú", "nafnorð", "NFETgr", "andlag")), []],
    ["role", filled(tok("brúna", "brú", "nafnorð", "ÞFETgr", null)), []],
    ["withdrawn", filled({ ...good, m: null, rj: true }), []],
    ["moved", filled(good, { m: "GM-FH-ÞT-3P-ET" }), []],
    ["unsure", { ...filled(good), ku: true }, []],
    ["length", { tok: filled(good).tok.slice(0, 3) }, []],
  ];
  const r = runPy(`
import sys, json
sys.path.insert(0, 'tools/lino-frames')
import parse_check
d = json.load(sys.stdin)
print(json.dumps({name: parse_check.compare(d['item'], rec, d['frame'], hard) for name, rec, hard in d['cases']}, ensure_ascii=False))`,
  JSON.stringify({ item, frame, cases }));
  assert.equal(r.status, 0, r.stderr);
  const got = JSON.parse(r.stdout);
  assert.deepEqual(got.ok, [true, ""]);
  for (const [name, re] of [["noparse", /þáttar ekki/], ["hard", /vörðurinn/], ["verb", /ekki sem nafnorðið „brú“/],
    ["case", /lesið sem NFETgr en ramminn biður um ÞFETgr/], ["role", /hlutverkið/], ["withdrawn", /tekin úr umferð/],
    ["moved", /markið á „sá“ breyttist/], ["unsure", /setningaskipanin/], ["length", /tákn/]]) {
    assert.equal(got[name][0], false, name);
    assert.match(got[name][1], re, name);
  }
});

const haveGreynir = !!py && runPy("import reynir, islenska").status === 0;

test("parse_check.py, the real parse: the recording is what Greynir says now, and an ambiguous sentence is refused",
  { skip: haveGreynir ? false : "the build's Python packages (reynir, islenska) are not installed" }, () => {
    const items = C.parseItems(C.fill(candidates, lex));
    /* two sentences BÍN fills correctly and the parse cannot vouch for:
       *brúna* is also a verb, and *kertið* is the same in nominative and accusative */
    const extra = C.parseItems(C.fill([cand("brú", "Ég sá höndina á myndinni.", { kyn: "kvk" }),
      cand("kerti", "Hvað kostar bókin?", { kyn: "hk" })], lex)).map((it, k) => ({ ...it, id: `x.${k}` }));
    assert.deepEqual(extra.map((x) => x.text), ["Ég sá brúna á myndinni.", "Hvað kostar kertið?"]);
    const r = spawnSync(py, [path.join(root, "tools/lino-frames/parse_check.py")], { cwd: root, encoding: "utf8",
      input: JSON.stringify([...items, ...extra]), env: { ...process.env, PYTHONHASHSEED: "0", PYTHONDONTWRITEBYTECODE: "1" } });
    assert.equal(r.status, 0, r.stderr);
    const got = new Map(JSON.parse(r.stdout).map((v) => [v.id, v]));
    const rec = new Map(recorded.map((v) => [`${v.frame}\t${v.text}`, v]));
    for (const it of items) {
      const want = rec.get(`${it.frame}\t${it.text}`);
      assert.deepEqual([got.get(it.id).ok, got.get(it.id).why], [want.ok, want.why], it.text);
    }
    assert.equal(got.get("x.0").ok, false);
    assert.match(got.get("x.0").why, /sagnorð/);
    assert.equal(got.get("x.1").ok, false);
    assert.match(got.get("x.1").why, /ÞFETgr en ramminn biður um NFETgr/);
  });

/* ---------- 2. the second opinion ---------------------------------------------- */

const parsedRows = () => {
  const rec = new Map(recorded.map((v) => [`${v.frame}\t${v.text}`, v]));
  return C.withParse(C.fill(candidates, lex), (r, x) => rec.get(`${r.frame}\t${x.text}`));
};
const fixture = (g) => JSON.parse(readFileSync(path.join(FX, "second", `${g.o}.${g.c}.json`), "utf8"));
const msg = (obj) => ({ type: "message", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(obj) }] });

test("the second opinion: one request a noun to claude-fable-5-2, the whole inflected sentences in it", () => {
  const groups = C.nounGroups(parsedRows());
  assert.equal(groups.length, 9);
  const g = groups.find((x) => x.o === "tillaga");
  const req = C.secondRequest(g);
  assert.equal(req.model, "claude-fable-5-2");
  assert.equal(req.output_config.format.type, "json_schema");
  assert.match(req.system[0].text, /EXACTLY AS WRITTEN/);
  const user = req.messages[0].content;
  assert.match(user, /^Noun: tillaga \(feminine\)\nDefinition: \S/);
  assert.match(user, /1\. Þetta gerðist allt vegna tillögunnar\. \(tillögunnar: ef\. et\. með greini\)/);
  assert.match(user, /2\. Kennarinn útskýrði tillöguna fyrir bekknum í rólegheitum\. \(tillöguna: þf\. et\. með greini\)/);
  /* it is not told what the first model said */
  assert.doesNotMatch(user + req.system[0].text, /a proposal can cause|Opus/);
  /* a pair the parse refused is not asked about */
  const rows = parsedRows();
  rows[0] = { ...rows[0], machine: { ok: false, why: "x" } };
  assert.equal(C.nounGroups(rows).find((x) => x.o === "breyting").items.length, 1);
});

test("the second opinion's answer: every sentence answered once with a boolean, or the noun is not judged", () => {
  const g = C.nounGroups(parsedRows()).find((x) => x.o === "tillaga");
  const a = C.secondAnswer(fixture(g), g);
  assert.equal(a.error, null);
  assert.deepEqual([...a.verdicts].map(([n, v]) => [n, v.ok]), [[1, false], [2, true]]);
  const bad = (r) => { const x = C.secondAnswer(r, g); assert.equal(x.verdicts.size, 0); return x.error; };
  assert.match(bad(msg({ sentences: [{ n: 1, ok: true, why: "" }] })), /no verdict for sentence 2/);
  assert.match(bad(msg({ sentences: [{ n: 1, ok: true, why: "" }, { n: 1, ok: false, why: "" }, { n: 2, ok: true, why: "" }] })), /twice/);
  assert.match(bad(msg({ sentences: [{ n: 1, ok: "yes", why: "" }, { n: 2, ok: true, why: "" }] })), /no verdict for sentence 1/);
  assert.match(bad({ type: "message", stop_reason: "end_turn", content: [{ type: "text", text: "Sure! Here" }] }), /not JSON/);
  assert.match(bad({ type: "message", stop_reason: "refusal", content: [] }), /refused/);
  assert.match(bad({ type: "message", stop_reason: "max_tokens", content: [] }), /max_tokens/);
  assert.match(bad({ type: "error", error: { message: "overloaded" } }), /overloaded/);
  /* a number that was not asked about is ignored, not an error */
  assert.equal(C.secondAnswer(msg({ sentences: [{ n: 1, ok: true, why: "" }, { n: 2, ok: true, why: "" }, { n: 9, ok: false, why: "" }] }), g).error, null);
});

test("a pair is a yes from the second model only when every one of its sentences is", () => {
  const row = { key: "hönd", o: "hönd", c: "kvk", d: "", frame: "F", mark: "ÞGFET", machine: { ok: true },
    sentences: [{ form: "hendi", text: "A hendi." }, { form: "hönd", text: "A hönd." }] };
  const groups = C.nounGroups([row]);
  assert.equal(groups[0].items.length, 2);
  const ans = (a, b) => C.secondAnswer(msg({ sentences: [{ n: 1, ok: a, why: "one" }, { n: 2, ok: b, why: "two" }] }), groups[0]);
  assert.deepEqual(C.withSecond([row], groups, [ans(true, true)])[0].second, { ok: true, why: "one / two" });
  assert.deepEqual(C.withSecond([row], groups, [ans(true, false)])[0].second, { ok: false, why: "two" });
  /* an error for the noun leaves its pairs unjudged */
  assert.equal(C.withSecond([row], groups, [{ verdicts: new Map(), error: "x" }])[0].second, null);
});

/* ---------- 3. the queue -------------------------------------------------------- */

const fakeRows = (n, { no = [], bad = [], err = [] } = {}) => Array.from({ length: n }, (_, i) => ({
  key: `orð${i}`, o: `orð${i}`, c: "kk", frame: `Rammi ${i % 7}.`, mark: "NFET", opus: "why", run: "b-v1",
  sentences: [{ form: `orð${i}`, text: `Setning ${i}.` }],
  machine: { ok: !bad.includes(i), why: bad.includes(i) ? "þáttast ekki" : "" },
  second: bad.includes(i) || err.includes(i) ? null : { ok: !no.includes(i), why: no.includes(i) ? "odd" : "fine" },
}));
const statuses = (rows) => Object.fromEntries(Object.values(C.STATUS).map((st) => [st, rows.filter((r) => r.status === st).length]));

test("the constants the issue names: 5% sample, never under 20 pairs, redo over 5%", () => {
  assert.equal(C.SAMPLE_RATE, 0.05);
  assert.equal(C.REDO_THRESHOLD, 0.05);
  assert.deepEqual([0, 11, 20, 400, 401, 1000, 2000].map(C.sampleSize), [0, 11, 20, 20, 21, 50, 100]);
});

test("classify: every disagreement and a seeded sample of the rest go to the owner", () => {
  const rows = fakeRows(1000, { no: [3, 4, 5], bad: [0, 1], err: [2] });
  const a = C.classify(rows, "b-v1");
  assert.deepEqual(statuses(a), { "vél hafnar": 2, "óathugað": 1, "ósammála": 3, "úrtak": 50, "samþykkt": 944 });
  assert.deepEqual(a.filter((r) => r.status === "ósammála").map((r) => r.key), ["orð3", "orð4", "orð5"]);
  /* the same batch, the same sample, whatever order the rows come in */
  const again = C.classify([...rows].reverse(), "b-v1");
  const sampled = (x) => x.filter((r) => r.status === "úrtak").map((r) => r.key).sort();
  assert.deepEqual(sampled(again), sampled(a));
  /* another batch, another sample */
  assert.notDeepEqual(sampled(C.classify(rows, "c-v2")), sampled(a));
  /* not the first fifty, and spread over the batch */
  const idx = a.map((r, i) => (r.status === "úrtak" ? i : -1)).filter((i) => i >= 0);
  assert.ok(idx.some((i) => i > 500) && idx.some((i) => i < 500), idx.join(","));
});

test("classify: a small batch is read whole, and a verdict already given keeps its pair in the sample", () => {
  assert.deepEqual(statuses(C.classify(fakeRows(14, { no: [1] }), "b-v1")),
    { "vél hafnar": 0, "óathugað": 0, "ósammála": 1, "úrtak": 13, "samþykkt": 0 });
  /* the batch grows from 30 to 600 pairs: the pairs judged in the first sample stay in it */
  const first = C.classify(fakeRows(30), "b-v1");
  const queue = C.readQueue(C.queueTsv(first, "b-v1").replace(/^\t(Setning \d+\.)/gm, "já\t$1"));
  const judged = first.filter((r) => r.status === "úrtak").map((r) => r.key);
  assert.equal(judged.length, 20);
  const grown = C.classify(fakeRows(600), "b-v1", queue);
  const now = new Set(grown.filter((r) => r.status === "úrtak").map((r) => r.key));
  assert.ok(judged.every((k) => now.has(k)));
  assert.equal(now.size, 30);                                  // 5% of 600
  const kept = C.readQueue(C.queueTsv(grown, "b-v1", queue));
  assert.equal([...kept.values()].filter((q) => q.verdict === "já").length, 20);
});

test("yfirferd.tsv: the owner's file round-trips, verdicts and comments survive a re-run", () => {
  const rows = C.classify(fakeRows(25, { no: [2] }), "b-v1");
  const text = C.queueTsv(rows, "b-v1");
  assert.match(text, /^# Dálkar: dómur/m);
  assert.match(text, /^dómur\tsetning\torð\trammi\tástæða\tOpus\tFable\tathugasemd$/m);
  const q = C.readQueue(text);
  assert.equal(q.size, 21);                                    // 1 disagreement + 20 sampled
  assert.ok([...q.values()].every((x) => x.verdict === ""));
  /* disagreements come first */
  assert.equal([...q.values()][0].reason, "ósammála");
  assert.match(text, /\tnei: odd\t/);
  /* the owner writes verdicts (one in capitals, one with the trailing tabs stripped by an editor) */
  const lines = text.split("\n");
  const at = lines.findIndex((l) => l.startsWith("\tSetning 2."));
  lines[at] = ("Nei" + lines[at]).replace(/\t$/, "\tekki íslenska");
  lines[at + 1] = ("já" + lines[at + 1]).replace(/\t+$/, "");
  const edited = C.readQueue(lines.join("\n"));
  assert.deepEqual([edited.get("orð2\tRammi 2.").verdict, edited.get("orð2\tRammi 2.").comment], ["nei", "ekki íslenska"]);
  const rerun = C.readQueue(C.queueTsv(rows, "b-v1", edited));
  assert.equal(rerun.get("orð2\tRammi 2.").verdict, "nei");
  assert.equal(rerun.get("orð2\tRammi 2.").comment, "ekki íslenska");
  assert.equal([...rerun.values()].filter((x) => x.verdict).length, 2);
  /* a verdict does not carry over to a sentence that has changed */
  const changed = rows.map((r) => (r.key === "orð2" ? { ...r, sentences: [{ form: "x", text: "Önnur setning." }] } : r));
  assert.equal(C.readQueue(C.queueTsv(changed, "b-v1", edited)).get("orð2\tRammi 2.").verdict, "");
});

/* ---------- 4. the owner's verdicts ----------------------------------------------- */

/* A batch of `n` pairs, `no` disagreements; the owner says nei to `wrongSample`
   of the sample and já to `yesDisagree` of the disagreements. */
function judgedBatch(n, { no = [], wrongSample = 0, yesDisagree = 0, blank = 0 } = {}) {
  const rows = C.classify(fakeRows(n, { no }), "b-v1");
  let ws = wrongSample, yd = yesDisagree, bl = blank;
  const text = C.queueTsv(rows, "b-v1").split("\n").map((l) => {
    if (!l.startsWith("\t")) return l;
    if (bl-- > 0) return l;
    const disagree = l.includes("\tósammála\t");
    const v = disagree ? (yd-- > 0 ? "já" : "nei") : (ws-- > 0 ? "nei" : "já");
    return v + l;
  }).join("\n");
  return { checked: C.readRows(C.checkedTsv(rows, "b-v1")), queue: C.readQueue(text), rows };
}

test("decide: the sample's error rate; at the threshold the batch stands, over it the batch is redone", () => {
  /* 400 agreed pairs -> a sample of 20: one wrong is exactly 5%, which is not over */
  const one = judgedBatch(403, { no: [0, 1, 2], wrongSample: 1, yesDisagree: 2 });
  const d1 = C.decide(one.checked, one.queue);
  assert.deepEqual(d1.problems, []);
  assert.deepEqual(d1.sample, { n: 20, wrong: 1, rate: 0.05 });
  assert.equal(d1.redo, false);
  assert.deepEqual(d1.disagreements, { n: 3, yes: 2 });
  assert.equal(d1.read.length, 19 + 2);            // the yeses of the sample and of the disagreements
  assert.equal(d1.unread.length, 380);             // both models agreed, nobody read them
  assert.match(C.verdictSummary(d1).join("\n"), /úrtak: 20 pör lesin, nei: 1 \(5%; mörkin eru 5%\)[\s\S]*keyrslan stenst: 380 pör/);

  const two = judgedBatch(403, { no: [0, 1, 2], wrongSample: 2, yesDisagree: 2 });
  const d2 = C.decide(two.checked, two.queue);
  assert.equal(d2.sample.rate, 0.1);
  assert.equal(d2.redo, true);
  assert.equal(d2.unread.length, 0, "a batch to be redone lets no unread pair through");
  assert.equal(d2.read.length, 18 + 2, "what the owner read and accepted is kept");
  assert.match(C.verdictSummary(d2).join("\n"), /MERKT TIL ENDURGERÐAR/);
});

test("decide: the disagreements do not count toward the error rate", () => {
  const b = judgedBatch(60, { no: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], wrongSample: 0, yesDisagree: 0 });
  const d = C.decide(b.checked, b.queue);
  assert.deepEqual(d.sample, { n: 20, wrong: 0, rate: 0 });
  assert.deepEqual(d.disagreements, { n: 10, yes: 0 });
  assert.equal(d.redo, false);
  assert.equal(d.unread.length, 30);
});

test("decide: nothing is decided until every line has já or nei, and the queue is the batch's own", () => {
  const b = judgedBatch(30, { blank: 2 });
  const d = C.decide(b.checked, b.queue);
  assert.equal(d.problems.length, 2);
  assert.match(d.problems[0], /yfirferd\.tsv:\d+: enginn dómur/);
  assert.deepEqual([d.read.length, d.unread.length, d.redo], [0, 0, false]);
  /* a typo is not a verdict */
  const typo = judgedBatch(30);
  typo.queue.values().next().value.verdict = "jà";
  assert.match(C.decide(typo.checked, typo.queue).problems[0], /hvorki já né nei/);
  /* a line from somewhere else, and a line that went missing */
  const other = judgedBatch(30);
  other.queue.set("x\ty", { verdict: "já", word: "x", frame: "y", line: 99 });
  assert.match(C.decide(other.checked, other.queue).problems[0], /ekki í röðinni/);
  const lost = judgedBatch(30);
  lost.queue.delete(lost.queue.keys().next().value);
  assert.match(C.decide(lost.checked, lost.queue).problems[0], /vantar í yfirferd\.tsv/);
  /* a noun the second model never answered for blocks the batch */
  const rows = C.classify(fakeRows(30, { err: [4] }), "b-v1");
  const text = C.queueTsv(rows, "b-v1").replace(/^\t/gm, "já\t");
  assert.match(C.decide(C.readRows(C.checkedTsv(rows, "b-v1")), C.readQueue(text)).problems[0], /óathugað/);
});

test("allowlistLines: lino-rammar.tsv lines, who read what, and no pair twice", () => {
  const b = judgedBatch(403, { no: [0, 1, 2], wrongSample: 1, yesDisagree: 1 });
  const d = C.decide(b.checked, b.queue);
  const firstRead = d.read[0];
  const existing = [{ "orð": firstRead.word, rammi: firstRead.frame }];
  const { lines, added, skipped } = C.allowlistLines(d, existing, { by: "eigandi, 28.11.2026", batch: "b-v1" });
  assert.equal(skipped, 1);
  assert.equal(added, d.read.length + d.unread.length - 1);
  const data = lines.filter((l) => !l.startsWith("#")).map((l) => l.split("\t"));
  assert.equal(data.length, added);
  assert.ok(data.every((c) => c.length === 3 && c.every((x) => x && x === x.trim())));
  assert.equal(data.filter((c) => c[2] === "eigandi, 28.11.2026").length, d.read.length - 1);
  assert.equal(data.filter((c) => c[2] === "Opus 5.5 og Fable 5.2; úrtak lesið: eigandi, 28.11.2026").length, d.unread.length);
  assert.ok(lines.some((l) => /^# ---- Úrtak úr þeim var lesið: 20 pör, nei: 1\. ----$/.test(l)));
  /* nothing the owner said nei to */
  const nei = new Set([...b.queue.values()].filter((q) => q.verdict === "nei").map((q) => `${q.word}\t${q.frame}`));
  assert.equal(nei.size, 3);
  assert.ok(data.every((c) => !nei.has(`${c[0]}\t${c[1]}`)));
});

/* ---------- the commands, with recorded answers -------------------------------------- */

const cli = (script, ...args) => {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  return spawnSync(process.execPath, [path.join(root, "tools/lino-frames", script), ...args], { cwd: root, env, encoding: "utf8" });
};
const fakeCheck = (out) => cli("check.mjs", "--candidates", path.join(FX, "candidates.tsv"), "--parsed", path.join(FX, "parse.json"),
  "--fake", path.join(FX, "second"), "--out", out);
const judge = (file, verdict) => writeFileSync(file, readFileSync(file, "utf8").split("\n")
  .map((l) => (l.startsWith("\t") ? verdict(l) + l : l)).join("\n"));

test("check.mjs --fake --parsed: the batch folder, the queue, and no call", () => {
  const out = path.join(tmp(), BATCH);
  const r = fakeCheck(out);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /FAKE RUN/);
  for (const f of ["candidates.tsv", "parse.json", "checked.tsv", "yfirferd.tsv", "batch.json"]) assert.ok(existsSync(path.join(out, f)), f);
  assert.equal(existsSync(path.join(out, "responses")), false, "a fake run records nothing as an answer");
  const batch = JSON.parse(readFileSync(path.join(out, "batch.json"), "utf8"));
  assert.equal(batch.id, BATCH);
  assert.equal(batch.status, "review");
  assert.deepEqual([batch.second.mode, batch.second.model, batch.second.nouns, batch.second.errors], ["fake", "claude-fable-5-2", 9, 0]);
  assert.deepEqual(batch.counts, { rejected: 0, unchecked: 0, disagree: 3, sample: 11, agreed: 0 });
  assert.ok(batch.second.usage.input > 0 && batch.second.usage.output > 0);
  const checked = C.readRows(readFileSync(path.join(out, "checked.tsv"), "utf8"));
  assert.equal(checked.length, 14);
  const saga = checked.find((x) => x["orð"] === "þjóð");
  assert.deepEqual([saga.setning, saga["vél"], saga.Fable, saga["staða"]], ["Þetta er saga um þjóð.", "já", "nei", "ósammála"]);
  const queue = C.readQueue(readFileSync(path.join(out, "yfirferd.tsv"), "utf8"));
  assert.equal(queue.size, 14);
  assert.deepEqual([...queue.values()].slice(0, 3).map((q) => q.sentence),
    ["Þetta er saga um þjóð.", "Þetta gerðist allt vegna tillögunnar.", "Þetta gerðist allt vegna þróunarinnar."]);

  /* a verdict written by the owner survives running the check again */
  judge(path.join(out, "yfirferd.tsv"), (l) => (l.includes("saga um þjóð") ? "nei" : ""));
  assert.equal(fakeCheck(out).status, 0);
  const again = C.readQueue(readFileSync(path.join(out, "yfirferd.tsv"), "utf8"));
  assert.deepEqual([...again.values()].map((q) => q.verdict).filter(Boolean), ["nei"]);
});

test("check.mjs: no key and no --fake stops before any call; a missing fixture leaves the noun unjudged", () => {
  const out = path.join(tmp(), BATCH);
  const r = cli("check.mjs", "--candidates", path.join(FX, "candidates.tsv"), "--parsed", path.join(FX, "parse.json"), "--out", out);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /ANTHROPIC_API_KEY is not set/);
  assert.equal(existsSync(path.join(out, "checked.tsv")), false);

  const some = tmp();
  for (const f of ["breyting.kvk.json", "starf.hk.json"]) cpSync(path.join(FX, "second", f), path.join(some, f));
  const r2 = cli("check.mjs", "--candidates", path.join(FX, "candidates.tsv"), "--parsed", path.join(FX, "parse.json"), "--fake", some, "--out", out);
  assert.equal(r2.status, 1);
  const batch = JSON.parse(readFileSync(path.join(out, "batch.json"), "utf8"));
  assert.equal(batch.status, "incomplete");
  assert.deepEqual([batch.counts.unchecked, batch.counts.sample], [11, 3]);
  /* and such a batch cannot be accepted, whatever the verdicts */
  judge(path.join(out, "yfirferd.tsv"), () => "já");
  const a = cli("accept.mjs", "--batch", out, "--by", "prófun", "--dry-run");
  assert.equal(a.status, 2);
  assert.match(a.stderr, /óathugað/);
});

test("check.mjs --no-second: fill and parse only, nobody asked, no queue", () => {
  const out = path.join(tmp(), BATCH);
  const r = cli("check.mjs", "--no-second", "--candidates", path.join(FX, "candidates.tsv"), "--parsed", path.join(FX, "parse.json"), "--out", out);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(existsSync(path.join(out, "yfirferd.tsv")), false);
  assert.equal(JSON.parse(readFileSync(path.join(out, "batch.json"), "utf8")).status, "parsed");
});

/* A batch as a real run would leave it: the fake one, relabelled. Only the
   test does this; accept.mjs refuses to write content from a fake batch. */
function realLookingBatch() {
  const out = path.join(tmp(), BATCH);
  assert.equal(fakeCheck(out).status, 0);
  const f = path.join(out, "batch.json");
  const b = JSON.parse(readFileSync(f, "utf8"));
  writeFileSync(f, JSON.stringify({ ...b, second: { ...b.second, mode: "api" } }));
  const to = path.join(path.dirname(out), "lino-rammar.tsv");
  cpSync(path.join(root, "content/setningar/lino-rammar.tsv"), to);
  return { out, to };
}

test("accept.mjs: verdicts in, lines of lino-rammar.tsv out, and the build's own reader takes them", () => {
  const { out, to } = realLookingBatch();
  /* not before every line is judged */
  const early = cli("accept.mjs", "--batch", out, "--by", "prófun", "--to", to);
  assert.equal(early.status, 2);
  assert.match(early.stderr, /enginn dómur/);
  const before = readFileSync(to, "utf8");
  judge(path.join(out, "yfirferd.tsv"), (l) => (l.includes("\tósammála\t") ? "nei" : "já"));
  const dry = cli("accept.mjs", "--batch", out, "--by", "prófun, 1.1.2027", "--to", to, "--dry-run");
  assert.equal(dry.status, 0, dry.stderr);
  assert.equal(readFileSync(to, "utf8"), before, "--dry-run writes nothing");
  const r = cli("accept.mjs", "--batch", out, "--by", "prófun, 1.1.2027", "--to", to);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /úrtak: 11 pör lesin, nei: 0/);
  const after = readFileSync(to, "utf8");
  assert.ok(after.startsWith(before));
  const added = after.slice(before.length).split("\n").filter((l) => l && !l.startsWith("#"));
  assert.equal(added.length, 11);
  assert.ok(added.includes("heimild\tVið bíðum eftir svari frá skólanum.\tprófun, 1.1.2027"));
  assert.ok(!added.some((l) => l.startsWith("þjóð\t")), "a pair the owner refused is not written");
  const batch = JSON.parse(readFileSync(path.join(out, "batch.json"), "utf8"));
  assert.deepEqual([batch.status, batch.verdicts.redo, batch.verdicts.added], ["accepted", false, 11]);
  /* twice adds nothing twice */
  assert.equal(cli("accept.mjs", "--batch", out, "--by", "prófun, 1.1.2027", "--to", to).status, 0);
  assert.equal(readFileSync(to, "utf8"), after);

  /* the build's reader and every check it makes on a pair (pipeline/frame_allow.py) */
  if (py) {
    const p = runPy(`
import sys, json
sys.path.insert(0, 'pipeline')
import sentences, frame_allow, noun_classes
pairs = frame_allow.read(sentences.S, sys.argv[1])
allow, _ = frame_allow.resolve(pairs, json.load(open('data/sentences.json', encoding='utf-8')),
                               json.load(open('data/lexicon.json', encoding='utf-8')), noun_classes)
print(json.dumps([len(pairs), allow["Við bíðum eftir svari frá skólanum."]], ensure_ascii=False))`.replace("sys.argv[1]", JSON.stringify(to)));
    assert.equal(p.status, 0, p.stderr);
    const [n, allowed] = JSON.parse(p.stdout);
    assert.equal(n, C.readRows(before).length + 11);
    assert.ok(allowed.includes("heimild|kvk"));
  }
});

test("accept.mjs: too many errors in the sample marks the batch for redo", () => {
  const { out, to } = realLookingBatch();
  /* 11 pairs sampled; the owner refuses one: 9% is over 5% */
  let refused = false;
  judge(path.join(out, "yfirferd.tsv"), (l) => {
    if (l.includes("\tósammála\t")) return l.includes("saga um þjóð") ? "já" : "nei";
    if (!refused) { refused = true; return "nei"; }
    return "já";
  });
  const r = cli("accept.mjs", "--batch", out, "--by", "prófun", "--to", to);
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.match(r.stdout, /MERKT TIL ENDURGERÐAR/);
  const batch = JSON.parse(readFileSync(path.join(out, "batch.json"), "utf8"));
  assert.equal(batch.status, "redo");
  assert.deepEqual(batch.verdicts.sample, { n: 11, wrong: 1, rate: 1 / 11 });
  /* what the owner read and accepted is still written; here nothing was unread */
  const added = readFileSync(to, "utf8").split("\n").filter((l) => l.endsWith("\tprófun"));
  assert.equal(added.length, 10 + 1);
});

test("accept.mjs: a batch whose answers are fixtures is never written into content", () => {
  const out = path.join(tmp(), BATCH);
  assert.equal(fakeCheck(out).status, 0);
  judge(path.join(out, "yfirferd.tsv"), () => "já");
  const to = path.join(path.dirname(out), "lino-rammar.tsv");
  cpSync(path.join(root, "content/setningar/lino-rammar.tsv"), to);
  const r = cli("accept.mjs", "--batch", out, "--by", "prófun", "--to", to);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /not from the API/);
  assert.equal(readFileSync(to, "utf8"), readFileSync(path.join(root, "content/setningar/lino-rammar.tsv"), "utf8"));
  assert.equal(cli("accept.mjs", "--batch", out, "--by", "prófun", "--to", to, "--dry-run").status, 0);
});

/* ---------- the review page ---------------------------------------------------------- */

test("review page: the queue is on it, each pair with its file and line, the unjudged ones marked", async () => {
  const dir = tmp();
  const out = path.join(dir, "q", BATCH);
  mkdirSync(path.dirname(out), { recursive: true });
  assert.equal(fakeCheck(out).status, 0);
  judge(path.join(out, "yfirferd.tsv"), (l) => (l.includes("saga um þjóð") ? "nei" : ""));
  const col = await collect({ queueDir: path.join(dir, "q") });
  const items = col.items.filter((it) => it.kind === "yfirferd");
  assert.equal(items.length, 14);
  assert.equal(col.items[0].kind, "yfirferd", "the queue comes first on the page");
  const lines = readFileSync(path.join(out, "yfirferd.tsv"), "utf8").split("\n");
  for (const it of items) assert.ok(lines[it.line - 1].includes(`\t${it.text}\t`), it.text);
  const saga = items.find((it) => it.text === "Þetta er saga um þjóð.");
  assert.deepEqual(Object.fromEntries(saga.fields)["ástæða"], "ósammála");
  assert.equal(Object.fromEntries(saga.fields)["dómur"], "nei");
  assert.match(Object.fromEntries(saga.fields).Fable, /^nei: /);
  const note = queueNote(col.items);
  attachNotes(col.items, [note]);
  assert.equal(saga.notes.length, 0, "a judged pair is no longer marked");
  assert.equal(items.filter((it) => it.notes.length).length, 13);
  assert.ok(col.items.filter((it) => it.kind !== "yfirferd").every((it) => !it.notes.length));
  /* and the page itself */
  const page = path.join(dir, "review.html");
  await build(page, { queueDir: path.join(dir, "q") });
  const html = readFileSync(page, "utf8");
  assert.ok(html.includes("LÍNO-2: pör til yfirferðar") && html.includes("LÍNO-2-par sem bíður dóms") && html.includes("Þetta er saga um þjóð."));
  /* with every pair judged, nothing is marked and there is no note */
  judge(path.join(out, "yfirferd.tsv"), () => "já");
  assert.equal(queueNote((await collect({ queueDir: path.join(dir, "q") })).items), null);
});

test("review page: no batch is waiting in the repository (a real one arrives with its own data PR)", async () => {
  const col = await collect();
  const waiting = col.items.filter((it) => it.kind === "yfirferd" && it.pending);
  /* a committed queue is allowed; a committed fake one is not */
  for (const it of waiting) assert.doesNotMatch(it.file, new RegExp(BATCH));
});
