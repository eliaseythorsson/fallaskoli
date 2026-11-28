/* New sentences for the LÍNO-2 words with fewer than 5 sentences (issue #23,
   docs/DLD-PLAN.md §2 step 4): tools/lino-frames/fillin.mjs,
   fillin-accept.mjs, fillin-lib.mjs, and parse_check.py's "written" kind.

   NO TEST HERE CALLS CLAUDE. The answers are recorded files written by hand
   (tools/lino-frames/fixtures/fillin/answers/, each says so in `_fake`), the
   parse is a recording of a real Greynir run (fixtures/fillin/parse.json);
   the commands run with --fake and --parsed and with ANTHROPIC_API_KEY
   removed. One test runs the real parse, only where the build's Python
   packages are installed, and fails if the recording is stale.

   What is held:
     - the words are the LÍNO-2 words with fewer than 5 sentences the app can
       show them in, every word class, and each is asked for at least 2
     - the prompt holds the repository's rules for writing a sentence
       verbatim, in a cached prefix that is the same for every word
     - a candidate is dropped, with its reason, unless it is new, passes
       Greynir, the guard and the build's length rule, and has the word once
     - every survivor goes to the owner; only a yes reaches setningar.tsv,
       in lines the build's own reader takes
     - the counts per word before and after are reported
     - nothing of this runs inside the build */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync, mkdtempSync, mkdirSync, cpSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as F from "../tools/lino-frames/fillin-lib.mjs";
import { collect, queueNote, fillinNote, attachNotes } from "../tools/review.mjs";
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const FX = path.join(root, "tools/lino-frames/fixtures/fillin");
const lex = buildLexicon(DATA);
const recorded = JSON.parse(readFileSync(path.join(FX, "parse.json"), "utf8"));
const WORDS = "einnig,hluti,mikilvægur,auka,heldur,mæla";
const tmp = () => mkdtempSync(path.join(tmpdir(), "lino-fillin-"));
const entry = (o, c) => lex.lemma(o).find((x) => x.c === c);
const read = (f) => readFileSync(path.join(root, f), "utf8");
const repoFiles = () => Object.fromEntries(F.RULE_SOURCES.map((r) => [r.file, read(r.file)]));

const cli = (script, ...args) => {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  return spawnSync(process.execPath, [path.join(root, "tools/lino-frames", script), ...args], { cwd: root, env, encoding: "utf8" });
};
const fakeRun = (out) => cli("fillin.mjs", "--fake", path.join(FX, "answers"), "--parsed", path.join(FX, "parse.json"),
  "--words", WORDS, "--out", out);
const judgeQueue = (file, verdict) => writeFileSync(file, readFileSync(file, "utf8").split("\n")
  .map((l) => (l.startsWith("\t") ? verdict(l) + l : l)).join("\n"));

/* ---------- outside the build ------------------------------------------------ */

test("the fill-in is outside the build, and only fillin-accept.mjs writes content", () => {
  for (const f of ["build.sh", "tools/build.mjs", "build-in-container.sh"]) {
    assert.doesNotMatch(read(f), /fillin|claude-fable|anthropic/i, f);
  }
  for (const f of readdirSync(path.join(root, "pipeline")).filter((x) => x.endsWith(".py"))) {
    assert.doesNotMatch(read(`pipeline/${f}`), /lino-frames|fillin/, f);
  }
  assert.doesNotMatch(read("tools/review.mjs"), /lino-frames\/|fillin-lib|anthropic/);
  const run = read("tools/lino-frames/fillin.mjs");
  assert.doesNotMatch(run, /writeFileSync\([^)]*(data\/|content\/)/);
  assert.match(read("tools/lino-frames/fillin-accept.mjs"), /content\/setningar\/setningar\.tsv/);
});

/* ---------- 1. which words ------------------------------------------------------- */

test("targets: every class, fewer than 5 sentences the app can show, at least 2 asked; nouns count their frames", () => {
  const lino = [["einnig", ["ao"], 1], ["hluti", ["kk"], 2], ["breyting", ["kvk"], 3], ["mikilvægur", ["lo"], 5],
    ["auka", ["so"], 9], ["heldur", ["st"], 10], ["nema", ["st"], 35], ["mæla", ["so"], 31], ["ekkiorðxyz", null, 99]];
  const t = F.targets(lino, lex);
  const by = Object.fromEntries(t.words.map((w) => [F.wordId(w), w]));
  for (const k of ["einnig|ao", "hluti|kk", "mikilvægur|lo", "auka|so", "heldur|st", "nema|st", "mæla|so"]) assert.ok(by[k], k);
  for (const w of t.words) {
    assert.ok(w.before < F.TARGET, w.o);
    assert.equal(w.want, Math.max(F.MIN_NEW, F.TARGET - w.before));
    assert.equal(w.bank.length, w.before);
  }
  /* *breyting* is taken by enough noun frames already: not asked */
  assert.deepEqual(t.full.map((w) => w.o), ["breyting"]);
  assert.ok(t.full[0].before >= F.TARGET);
  assert.deepEqual(t.missing.map((w) => w.o), ["ekkiorðxyz"]);
  /* a word written in the bank counts those sentences: *nema* stands in three */
  assert.equal(by["nema|st"].before, 3);
  assert.equal(by["nema|st"].want, 2);
  assert.ok(by["nema|st"].bank.includes("Við förum ekki út nema veðrið batni."));
});

/* ---------- 2. the prompt ---------------------------------------------------------- */

test("the prompt: the repository's rules verbatim, in a cached prefix that is the same for every word", () => {
  const files = repoFiles();
  const rules = F.rulesFromRepo(files);
  assert.deepEqual(rules.map((r) => r.file), ["pipeline/sentences.py", "content/setningar/setningar.tsv", "README.md", "docs/DLD-PLAN.md"]);
  for (const r of rules) assert.ok(files[r.file].includes(r.text), `${r.file}: verbatim`);
  /* the pieces that matter, each from its file */
  assert.match(rules[0].text, /Three rules learned the hard way/);
  assert.match(rules[0].text, /WRITING FOR LEVELS 6 AND 7/);
  assert.match(rules[0].text, /lvl 1 {2}3-5 words/);
  assert.match(rules[1].text, /^# Setningabankinn/);
  assert.match(rules[2].text, /use the past tense for a transitive/);
  assert.match(rules[3].text, /Fixed sentences only/);
  const prefix = F.prefixText(rules, lex.sentences);
  for (const r of rules) assert.ok(prefix.includes(r.text));
  assert.ok(prefix.startsWith(F.INSTRUCTIONS));
  const w1 = { o: "einnig", c: "ao", d: "líka", want: 5, bank: [] };
  const w2 = { o: "nema", c: "st", d: "", want: 2, bank: ["Við förum ekki út nema veðrið batni."] };
  const a = F.request(prefix, w1), b = F.request(prefix, w2);
  assert.equal(a.model, "claude-fable-5-2");
  assert.equal(a.output_config.effort, "medium");
  assert.equal(a.output_config.format.type, "json_schema");
  assert.deepEqual(a.system, b.system, "the prefix is byte-identical for every word");
  assert.deepEqual(a.system[0].cache_control, { type: "ephemeral" });
  assert.match(a.messages[0].content, /Word: einnig \(adverb\)/);
  assert.match(a.messages[0].content, /Write 5 new sentences\./);
  assert.match(b.messages[0].content, /Write 2 new sentences\./);
  assert.match(b.messages[0].content, /- Við förum ekki út nema veðrið batni\./);
  /* a marker that moved stops the run instead of sending half the rules */
  assert.throws(() => F.rulesFromRepo({ ...files, "README.md": "nothing here" }), /README\.md/);
});

test("answer: the sentences, each with a level 1–7, no more than asked; anything else is an error or dropped", () => {
  const w = { o: "einnig", c: "ao", want: 2 };
  const msg = (obj, extra = {}) => ({ type: "message", content: [{ type: "text", text: JSON.stringify(obj) }], stop_reason: "end_turn", ...extra });
  const s = (level, text) => ({ level, text, form: "einnig", why: "w" });
  const a = F.answer(msg({ sentences: [s(2, "Hún kom einnig."), s(9, "Of hátt."), s(3, " Ég\tkom einnig. "), s(2, "Ein enn einnig.")], note: "" }), w);
  assert.equal(a.error, null);
  assert.deepEqual(a.sentences.map((x) => [x.lvl, x.text]), [[2, "Hún kom einnig."], [3, "Ég kom einnig."]]);
  assert.deepEqual(a.dropped.map((x) => x.why), ["þyngdin „9“ er ekki 1–7", "fleiri en beðið var um (2)"]);
  assert.match(F.answer({ type: "error", error: { message: "overloaded" } }, w).error, /overloaded/);
  assert.equal(F.answer(msg({}, { stop_reason: "max_tokens" }), w).error, "stopped at max_tokens");
  assert.match(F.answer({ type: "message", content: [{ type: "text", text: "nei" }] }, w).error, /not JSON/);
  assert.equal(F.answer(msg({ sentences: [], note: "cannot" }), w).note, "cannot");
});

/* ---------- 3. the checks -------------------------------------------------------------- */

test("precheck: a sentence the bank has, one written twice, and one that is not a sentence are dropped with the reason", () => {
  const word = { o: "x", c: "ao" };
  const rows = F.precheck([
    { word, lvl: 1, text: "Á túninu stendur hestur." },
    { word, lvl: 2, text: "Hún kom einnig." },
    { word, lvl: 2, text: "Hún kom einnig." },
    { word, lvl: 2, text: "hún kom einnig." },
    { word, lvl: 2, text: "Hún kom einnig" },
  ], new Set(lex.sentences.map((s) => s.t)));
  assert.deepEqual(rows.map((r) => r.error), ["setningin er þegar í setningabankanum", null, "sama setningin kom tvisvar í keyrslunni",
    "setningin byrjar ekki á hástaf", "setningin endar ekki á punkti, spurningarmerki eða upphrópunarmerki"]);
  /* what the parse gets: a noun is its own slot, with need none */
  const items = F.parseItems([{ word: { o: "hluti", c: "kk" }, lvl: 2, text: "A.", error: null },
    { word: { o: "auka", c: "so" }, lvl: 3, text: "B.", error: null }, { word, lvl: 3, text: "C.", error: "x" }]);
  assert.deepEqual(items.map((x) => [x.id, x.slot, x.kind]), [["0", "hluti", "written"], ["1", null, "written"]]);
});

test("judge: the word once, as the app reads it, and a noun as the slot; the recall gap is reported", () => {
  const rec = (text) => recorded.find((v) => v.text === text);
  const ok = F.judge(lex, entry("einnig", "ao"), rec("Systir mín kemur einnig með okkur."));
  assert.deepEqual([ok.ok, ok.gap], [true, true]);
  const noun = F.judge(lex, entry("hluti", "kk"), rec("Ég las fyrsta hluta bókarinnar í gærkvöldi."));
  assert.equal(noun.ok, true);
  /* the same parse judged for a word that is not in it */
  const not = F.judge(lex, entry("auka", "so"), rec("Systir mín kemur einnig með okkur."));
  assert.match(not.why, /finnst ekki í setningunni/);
  /* twice: the token duplicated */
  const r = structuredClone(rec("Systir mín kemur einnig með okkur."));
  r.rec.tok.splice(4, 0, { ...r.rec.tok[3] });
  assert.match(F.judge(lex, entry("einnig", "ao"), r).why, /oftar en einu sinni/);
  /* a noun that is not the slot */
  const n = structuredClone(rec("Ég las fyrsta hluta bókarinnar í gærkvöldi."));
  n.rec.slot = null;
  assert.match(F.judge(lex, entry("hluti", "kk"), n).why, /eyða setningarinnar/);
  /* a withdrawn reading, and a parse that failed */
  const w = structuredClone(rec("Systir mín kemur einnig með okkur."));
  w.rec.tok[3].rj = "x";
  assert.match(F.judge(lex, entry("einnig", "ao"), w).why, /tekin úr umferð/);
  assert.match(F.judge(lex, entry("einnig", "ao"), rec("Það er mikilvægt að borða hollan mat á hverjum degi.")).why, /hámark 9/);
  assert.equal(F.judge(lex, entry("einnig", "ao"), undefined).ok, false);
});

const py = ["python3", "python"].find((p) => spawnSync(p, ["-c", "import sys; sys.exit(sys.version_info < (3, 8))"], { cwd: root }).status === 0);
const haveGreynir = !!py && spawnSync(py, ["-c", "import reynir, islenska"], { cwd: root }).status === 0;

test("parse_check.py, a written sentence: the recording is what the build's checks say now",
  { skip: haveGreynir ? false : "the build's Python packages (reynir, islenska) are not installed" }, () => {
    const items = recorded.map((v, i) => ({ id: String(i), kind: "written", text: v.text, level: v.level, lemma: v.lemma,
      slot: v.lemma === "hluti" ? v.lemma : null }));   // the one noun of the fixtures
    /* and one the parser cannot read, one too long for level 6's floor */
    items.push({ id: "x0", kind: "written", text: "Hestur hestur hestur sem.", level: 1, lemma: "hestur", slot: null },
      { id: "x1", kind: "written", text: "Hún kom einnig.", level: 6, lemma: "einnig", slot: null });
    const r = spawnSync(py, [path.join(root, "tools/lino-frames/parse_check.py")], { cwd: root, encoding: "utf8",
      input: JSON.stringify(items), env: { ...process.env, PYTHONHASHSEED: "0", PYTHONDONTWRITEBYTECODE: "1" } });
    assert.equal(r.status, 0, r.stderr);
    const got = JSON.parse(r.stdout);
    recorded.forEach((v, i) => {
      assert.equal(got[i].ok, v.ok, v.text);
      assert.equal(got[i].why, v.why, v.text);
      assert.deepEqual(got[i].rec, v.rec, `${v.text}: the recorded parse is stale; re-record fixtures/fillin/parse.json`);
    });
    assert.equal(got.at(-2).ok, false);
    assert.match(got.at(-1).why, /lágmark 11/);
  });

/* ---------- the command, with recorded answers ----------------------------------------------- */

test("fillin.mjs --fake --parsed: the batch folder, every survivor in the queue, the counts, and no call", () => {
  const out = path.join(tmp(), "b");
  const r = fakeRun(out);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /FAKE RUN/);
  for (const f of ["prefix.txt", "candidates.tsv", "parse.json", "checked.tsv", "yfirferd.tsv", "report.tsv", "report.md", "batch.json"]) {
    assert.ok(existsSync(path.join(out, f)), f);
  }
  assert.equal(existsSync(path.join(out, "responses")), false, "a fake run records nothing as an answer");
  const checked = F.readRows(readFileSync(path.join(out, "checked.tsv"), "utf8"));
  assert.equal(checked.length, 11);
  const dropped = checked.filter((x) => x["staða"] === F.STATUS.rejected);
  assert.deepEqual(dropped.map((x) => x["setning"]), ["Það er mikilvægt að borða hollan mat á hverjum degi."]);
  assert.match(dropped[0]["vél: rök"], /hámark 9/);
  const queue = F.readQueue(readFileSync(path.join(out, "yfirferd.tsv"), "utf8"));
  assert.equal(queue.size, 10, "every sentence that passed goes to the owner");
  assert.ok([...queue.values()].every((q) => !q.verdict));
  const batch = JSON.parse(readFileSync(path.join(out, "batch.json"), "utf8"));
  assert.equal(batch.mode, "fake");
  assert.equal(batch.status, "review");
  assert.equal(batch.model, "claude-fable-5-2");
  /* the counts per word */
  const rep = F.readRows(readFileSync(path.join(out, "report.tsv"), "utf8"));
  assert.deepEqual(rep.map((x) => x["orð"]), WORDS.split(","));
  const mik = rep.find((x) => x["orð"] === "mikilvægur");
  assert.deepEqual([mik["fyrir"], mik["skrifaðar"], mik["vél hafnaði"], mik["til yfirferðar"], mik["samþykktar"], mik["eftir"]],
    ["0", "2", "1", "1", "", "1"]);
  const maela = rep.find((x) => x["orð"] === "mæla");
  assert.deepEqual([maela["fyrir"], maela["beðið um"], maela["eftir"]], ["1", "4", "2"]);
  assert.match(readFileSync(path.join(out, "report.md"), "utf8"), /recall gap.*before 0, after 4/);
  /* again: the owner's verdicts are kept */
  judgeQueue(path.join(out, "yfirferd.tsv"), (l) => (l.includes("Svefn") ? "nei" : ""));
  assert.equal(fakeRun(out).status, 0);
  const again = F.readQueue(readFileSync(path.join(out, "yfirferd.tsv"), "utf8"));
  assert.deepEqual([...again.values()].map((q) => q.verdict).filter(Boolean), ["nei"]);
});

test("fillin.mjs: no key and no --fake stops before any call; --dry-run writes the requests and the estimate", () => {
  const out = path.join(tmp(), "b");
  const r = cli("fillin.mjs", "--words", "einnig", "--out", out);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /ANTHROPIC_API_KEY is not set/);
  const d = cli("fillin.mjs", "--dry-run", "--limit", "3", "--out", out);
  assert.equal(d.status, 0, d.stderr);
  assert.equal(readdirSync(path.join(out, "requests")).length, 3);
  const md = readFileSync(path.join(out, "report.md"), "utf8");
  assert.match(md, /DRY RUN/);
  assert.match(md, /## Estimate for \d+ words \(every word with fewer than 5 sentences\)/);
  assert.match(md, /Batch API/);
});

/* ---------- 4. the owner's verdicts ---------------------------------------------------------- */

function judgedBatch(verdict) {
  const out = path.join(tmp(), "b");
  assert.equal(fakeRun(out).status, 0);
  judgeQueue(path.join(out, "yfirferd.tsv"), verdict);
  const f = path.join(out, "batch.json");
  const b = JSON.parse(readFileSync(f, "utf8"));
  writeFileSync(f, JSON.stringify({ ...b, mode: "api" }));          // as if Claude had written them
  const to = path.join(path.dirname(out), "setningar.tsv");
  cpSync(path.join(root, "content/setningar/setningar.tsv"), to);
  return { out, to };
}

test("fillin-accept.mjs: nothing is decided until every line has já or nei; a fake batch never reaches content", () => {
  const out = path.join(tmp(), "b");
  assert.equal(fakeRun(out).status, 0);
  judgeQueue(path.join(out, "yfirferd.tsv"), (l) => (l.includes("Svefn") ? "kannski" : l.includes("hluti") ? "já" : ""));
  const r = cli("fillin-accept.mjs", "--batch", out, "--by", "prófun", "--dry-run");
  assert.equal(r.status, 2);
  assert.match(r.stderr, /„kannski“ er hvorki já né nei/);
  assert.match(r.stderr, /enginn dómur/);
  const o2 = path.join(tmp(), "b");
  assert.equal(fakeRun(o2).status, 0);
  judgeQueue(path.join(o2, "yfirferd.tsv"), () => "já");
  const to = path.join(tmp(), "setningar.tsv");
  cpSync(path.join(root, "content/setningar/setningar.tsv"), to);
  const w = cli("fillin-accept.mjs", "--batch", o2, "--by", "prófun", "--to", to);
  assert.equal(w.status, 2);
  assert.match(w.stderr, /not from the API/);
  assert.equal(readFileSync(to, "utf8"), read("content/setningar/setningar.tsv"));
  assert.equal(cli("fillin-accept.mjs", "--batch", o2, "--by", "prófun", "--to", to, "--dry-run").status, 0);
});

test("fillin-accept.mjs: the yes sentences are appended in lines the build's reader takes, once; the counts after", () => {
  const { out, to } = judgedBatch((l) => (l.includes("heldur brosti") ? "nei" : "já"));
  const r = cli("fillin-accept.mjs", "--batch", out, "--by", "eigandi, 28.11.2026", "--to", to);
  /* one nei in ten is 10%, over the 5% threshold: the yes ones go in, and the batch says redo */
  assert.equal(r.status, 3, r.stderr);
  assert.match(r.stdout, /lesnar: 10, já: 9, nei: 1/);
  assert.match(r.stdout, /MÆLT MEÐ ENDURGERÐ/);
  const added = readFileSync(to, "utf8").slice(read("content/setningar/setningar.tsv").length);
  const rows = F.readRows("þyngd\tsetning\torð\tþörf\tekki eyða\tathugasemd\n" + added);
  assert.equal(rows.length, 9);
  assert.ok(!added.includes("heldur brosti"));
  const hluti = rows.find((x) => x["setning"] === "Stór hluti bekkjarins fór í ferðina.");
  assert.deepEqual([hluti["þyngd"], hluti["orð"], hluti["þörf"]], ["2", "hluti", "none"], "a noun is its own slot, need none");
  const einnig = rows.find((x) => x["setning"] === "Systir mín kemur einnig með okkur.");
  assert.deepEqual([einnig["orð"], einnig["þörf"]], ["", ""]);
  assert.match(einnig["athugasemd"], /LÍNO-2: einnig \(Fable 5\.2, keyrsla .*; lesið: eigandi, 28\.11\.2026\)/);
  /* the build's own reader takes the file */
  if (py) {
    const dir = tmp();
    mkdirSync(path.join(dir, "content/setningar"), { recursive: true });
    const code = "import sys; sys.path.insert(0, sys.argv[1]); import content_io; content_io.ROOT = sys.argv[2]\n"
      + "rows = list(content_io.rows('setningar/setningar.tsv', [('þyngd','int'),('setning','text'),('orð','opt'),('þörf','opt'),('ekki eyða','flag'),('athugasemd','str')]))\n"
      + "print(len(rows))";
    cpSync(to, path.join(dir, "content/setningar/setningar.tsv"));
    const c = spawnSync(py, ["-c", code, path.join(root, "pipeline"), path.join(dir, "content")], { encoding: "utf8" });
    assert.equal(c.status, 0, c.stderr);
    assert.equal(Number(c.stdout.trim()), lex.sentences.length + 9);
  }
  const batch = JSON.parse(readFileSync(path.join(out, "batch.json"), "utf8"));
  assert.equal(batch.status, "redo");
  assert.deepEqual([batch.verdicts.yes, batch.verdicts.no, batch.verdicts.added], [9, 1, 9]);
  const rep = F.readRows(readFileSync(path.join(out, "report.tsv"), "utf8"));
  const heldur = rep.find((x) => x["orð"] === "heldur");
  assert.deepEqual([heldur["fyrir"], heldur["samþykktar"], heldur["eftir"]], ["0", "1", "1"]);
  assert.match(readFileSync(path.join(out, "report.md"), "utf8"), /accepted: 9/);
  /* again: nothing twice */
  const again = cli("fillin-accept.mjs", "--batch", out, "--by", "eigandi, 28.11.2026", "--to", to);
  assert.match(again.stdout, /0 setningar bætast við .*\(9 voru þar fyrir\)/);
  assert.equal(readFileSync(to, "utf8").length, read("content/setningar/setningar.tsv").length + added.length);
});

test("fillin-accept.mjs: all yes passes; a sentence edited in the queue is refused", () => {
  const { out, to } = judgedBatch(() => "já");
  const r = cli("fillin-accept.mjs", "--batch", out, "--by", "eigandi", "--to", to);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(readFileSync(path.join(out, "batch.json"), "utf8")).status, "accepted");
  const { out: o2, to: t2 } = judgedBatch(() => "já");
  const f = path.join(o2, "yfirferd.tsv");
  writeFileSync(f, readFileSync(f, "utf8").replace("Svefn er mikilvægur fyrir heilsuna.", "Svefn er mjög mikilvægur."));
  const e = cli("fillin-accept.mjs", "--batch", o2, "--by", "eigandi", "--to", t2);
  assert.equal(e.status, 2);
  assert.match(e.stderr, /breyttu ekki setningunum sjálfum/);
});

/* ---------- the review page ---------------------------------------------------------------- */

test("review page: the new sentences are on it with their own note, separate from the pairs' note", async () => {
  const dir = tmp();
  const out = path.join(dir, "s", "b");
  mkdirSync(path.dirname(out), { recursive: true });
  assert.equal(fakeRun(out).status, 0);
  judgeQueue(path.join(out, "yfirferd.tsv"), (l) => (l.includes("Svefn") ? "já" : ""));
  const col = await collect({ queueDir: path.join(dir, "none"), fillinDir: path.join(dir, "s") });
  const items = col.items.filter((it) => it.kind === "yfirferd");
  assert.equal(items.length, 10);
  assert.equal(col.items[0].kind, "yfirferd", "the queue comes first on the page");
  assert.ok(items.every((it) => it.queue === "setningar" && /nýjar setningar til yfirferðar/.test(it.list)));
  const svefn = items.find((it) => it.text === "Svefn er mikilvægur fyrir heilsuna.");
  assert.equal(svefn.level, "2");
  assert.equal(queueNote(col.items), null, "the pairs' note is not about these");
  const note = fillinNote(col.items);
  attachNotes(col.items, [note]);
  assert.equal(svefn.notes.length, 0);
  assert.equal(items.filter((it) => it.notes.length).length, 9);
});

test("review page: no fake fill-in batch is committed", async () => {
  const col = await collect();
  for (const f of new Set(col.items.filter((x) => x.queue === "setningar").map((x) => x.file))) {
    const batch = JSON.parse(readFileSync(path.join(root, path.dirname(f), "batch.json"), "utf8"));
    assert.notEqual(batch.mode, "fake", f);
  }
});
