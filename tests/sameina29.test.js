/* Sameina og skipta (issue #29): two short sentences into one with a
   subordinate clause, and one such sentence into two.

   The issue's two criteria, and where each is held:

     "Both directions exist"
         every pair of content/malbeiting/sameina.tsv is asked both ways, and
         the builder asks both at every þyngd.

     "Answers accepted only when the result parses to the intended structure;
      otherwise the item gives a model answer, never a false 'wrong'"
         the browser has no parser, so the parse is asked at build time
         (pipeline/clause_shape.py) of every sentence an answer can be matched
         against. Here: an answer on the list is right; any other answer is
         NOT wrong — it is unjudged, the model is there to show, and nothing
         is written for or against the pupil; only what was shown, written
         back unchanged, is wrong. And, where Greynir is installed, that the
         build check refuses a pair whose sentences do not have the structure
         the pair names. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { DATA } from "../data/data_bundle.js";
import { EX } from "../data/exercises.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, newSession } from "../src/js/core/state.js";
import { normalise } from "../src/js/core/grading.js";
import { seeded } from "../src/js/core/duel.js";
import { judge, settle, gradeTransform, retryAllowed } from "../src/js/core/answer.js";
import { catalogueEntry, CATALOGUE_IDS } from "../src/js/core/catalogue.js";
import { exampleFor } from "../src/js/core/examples.js";
import { typeById, reviewTask, applyEffects, nextTask, buildTask, makeView } from "../src/js/tasks/index.js";
import { createPolicy } from "../src/js/core/policy.js";
import { duelPlan, duelTasks } from "../src/js/core/duel.js";
import { combineTask, taskCombine } from "../src/js/tasks/malbeiting.js";
import { freshView } from "./pools.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const lex = buildLexicon(DATA);
const PAIRS = EX.combine;
const KINDS = ["orsök", "tíð", "skýring", "tilvísun"];
const build = (band, seed, extra) => taskCombine(lex, freshView(band, extra), seeded(seed));

test("the catalogue: one new type, at the end, drawn by the Umritun renderer", () => {
  const c = catalogueEntry("sameina");
  assert.equal(c.skill, "malbeiting");
  assert.equal(c.renderer, "umritun");
  assert.equal(c.grader, "app");
  assert.equal(c.recall, false);
  assert.deepEqual(c.bands, [1, 2, 3]);
  /* after raeda, the last type before this issue; whatever is added later comes after */
  assert.ok(CATALOGUE_IDS.indexOf("sameina") > CATALOGUE_IDS.indexOf("raeda"));
  assert.equal(typeof typeById("sameina").build, "function");
});

test("the bank: short everyday pairs, each kind, each sentence one sentence", () => {
  assert.ok(PAIRS.length >= 40, `${PAIRS.length} pairs`);
  for (const k of KINDS) assert.ok(PAIRS.filter((x) => x.kind === k).length >= 8, k);
  const one = /^[A-ZÁÉÍÓÚÝÞÆÖÐ][^.?!]*\.$/;
  const seen = new Set();
  for (const x of PAIRS) {
    const at = `${x.a} ${x.b}`;
    assert.ok(!seen.has(at), `twice: ${at}`); seen.add(at);
    assert.ok(KINDS.includes(x.kind), at);
    assert.deepEqual(x.apart[0], [x.a, x.b], at);
    for (const t of [...x.joined, ...x.apart.flat()]) assert.match(t, one, t);
    /* short: a short sentence is at most 6 words, a joined one at most 11 */
    for (const t of x.apart.flat()) assert.ok(normalise(t).split(" ").length <= 6, t);
    for (const t of x.joined) assert.ok(normalise(t).split(" ").length <= 11, t);
    /* every joined sentence holds the conjunction; the first is the model */
    for (const t of x.joined) assert.ok(` ${normalise(t)} `.includes(` ${x.conj} `), `${t}: no "${x.conj}"`);
    /* a clause that opens the sentence is listed for every adverbial pair */
    if (x.kind === "orsök" || x.kind === "tíð")
      assert.ok(x.joined.some((t) => normalise(t).startsWith(x.conj + " ")), `${at}: the clause-first order is not listed`);
    /* one structure at a time, in the plan's order */
    assert.equal(x.lvl, { orsök: 1, tíð: 1, skýring: 2, tilvísun: 3 }[x.kind], at);
  }
});

test("both directions exist: every pair is a question each way", () => {
  for (const x of PAIRS) {
    const c = combineTask(x, "combine"), s = combineTask(x, "split");
    /* combine: the two short sentences are shown, the joined ones answer */
    assert.deepEqual(c.lines, [x.a, x.b]);
    assert.deepEqual(c.answers, x.joined);
    assert.equal(c.model, x.joined[0]);
    assert.match(c.instruction, new RegExp(`\\*\\*${x.conj}\\*\\*`));
    /* split: a joined sentence is shown, the two short ones answer, in either order */
    assert.equal(s.from, x.joined[0]);
    assert.equal(s.model, `${x.a} ${x.b}`);
    for (const [a, b] of x.apart) {
      assert.ok(s.answers.includes(`${a} ${b}`), `${a} ${b}`);
      assert.ok(s.answers.includes(`${b} ${a}`), `${b} ${a}`);
    }
    for (const t of [c, s]) {
      assert.equal(t.open, true);
      assert.ok(t.hint && t.why && t.copyNote && t.title, x.a);
      /* no answer is what was shown: a copy can never pass */
      for (const a of t.answers) assert.notEqual(normalise(a), normalise(t.from), a);
    }
    /* any listed joined sentence can be the one shown for a split */
    x.joined.forEach((j, k) => assert.equal(combineTask(x, "split", k).from, j));
  }
});

test("the builder asks both directions at every þyngd, one structure at a time", () => {
  const kindsAt = (band) => {
    const dirs = new Set(), kinds = new Set(), keys = new Set();
    for (let s = 0; s < 400; s++) {
      const b = build(band, 9000 + s);
      assert.ok(b, `nothing built at þyngd ${band}`);
      const t = b.task;
      assert.equal(t.type, "umritun");
      assert.equal(t.skill, "malbeiting");
      assert.equal(t.cell, "sameina:" + t.kind);
      assert.deepEqual(b.effects, [{ op: "exSeen", key: t.item }]);
      dirs.add(t.kind); kinds.add(t.clause); keys.add(t.item);
    }
    return { dirs: [...dirs].sort(), kinds: [...kinds].sort(), n: keys.size };
  };
  const at1 = kindsAt(1), at2 = kindsAt(2), at3 = kindsAt(3), at7 = kindsAt(7);
  for (const k of [at1, at2, at3, at7]) assert.deepEqual(k.dirs, ["combine", "split"]);
  assert.deepEqual(at1.kinds, ["orsök", "tíð"]);                        // adverbial first
  assert.deepEqual(at2.kinds, ["orsök", "skýring", "tíð"]);            // then complement
  assert.deepEqual(at3.kinds, ["skýring", "tilvísun"]);                // then relative
  assert.deepEqual(at7.kinds, at3.kinds);
  /* every pair of the band, both ways */
  assert.equal(at1.n, 2 * PAIRS.filter((x) => x.lvl === 1).length);
  /* below þyngd 3 a sentence to split is the model; from 3 it may open with its clause */
  for (let s = 0; s < 200; s++) {
    const t = build(2, 400 + s).task;
    if (t.kind === "split") assert.equal(t.from, PAIRS.find((x) => `split|${x.a} ${x.b}` === t.item).joined[0]);
  }
  /* a rescue drill is about one word: not this type */
  assert.equal(build(3, 1, { drillWord: lex.lookup("hestur", "kk") }), null);
});

test("an answer on the list is right — every one of them, capitals and stops aside", () => {
  let n = 0;
  for (const x of PAIRS) for (const dir of ["combine", "split"]) {
    const t = { type: "umritun", skill: "malbeiting", base: 12, lvl: 1, ...combineTask(x, dir) };
    for (const a of t.answers) {
      for (const typed of [a, a.toLowerCase(), a.replace(/\./g, ""), a.replace(/\.$/, "") + " "]) {
        const j = judge(t, { text: typed });
        assert.equal(j.ok, true, `${dir}: "${typed}"`);
        assert.equal(j.verdict, "right");
        assert.ok(j.xp > 0);
        n++;
      }
    }
  }
  assert.ok(n > 800, String(n));
  /* a missing acute accent is a slip, as everywhere */
  const x = PAIRS.find((y) => y.a === "Við fórum inn.");
  const t = { type: "umritun", skill: "malbeiting", base: 12, lvl: 1, ...combineTask(x, "combine") };
  const slip = judge(t, { text: "Við forum inn þegar bjallan hringdi." });
  assert.equal(slip.ok, true);
  assert.equal(slip.verdict, "near");
  /* two sentences without a full stop between them: right, with a word about the stop */
  const s = { type: "umritun", skill: "malbeiting", base: 12, lvl: 1, ...combineTask(x, "split") };
  assert.equal(judge(s, { text: "Við fórum inn. Bjallan hringdi." }).detail.note, null);
  assert.match(judge(s, { text: "við fórum inn bjallan hringdi" }).detail.note, /punkti á milli/);
});

test("an answer that is not on the list is never wrong: the model is shown and nothing is counted", () => {
  const x = PAIRS.find((y) => y.a === "Hundurinn drakk vatn.");
  const t = { type: "umritun", typeId: "sameina", skill: "malbeiting", base: 14, lvl: 1, ...combineTask(x, "combine") };
  /* right Icelandic that the list does not hold: another conjunction, another order of words */
  const unlisted = [
    "Hundurinn drakk vatn vegna þess að hann var þyrstur.",
    "Hundurinn drakk vatn því að hann var þyrstur.",
    "Hundurinn var þyrstur og drakk vatn.",
    "Hundurinn sem var þyrstur drakk vatn.",
    "eitthvað allt annað",
  ];
  for (const typed of unlisted) {
    assert.equal(gradeTransform(typed, t), "unlisted", typed);
    const j = judge(t, { text: typed });
    assert.equal(j.ok, null, typed);
    assert.equal(j.verdict, "unjudged", typed);
    assert.equal(j.pending, false);                 // it ends the question
    assert.equal(j.xp, 0);
    assert.deepEqual(j.findings, []);
    assert.equal(retryAllowed(t, j), false);        // a second try is for a wrong answer
    assert.equal(t.model, "Hundurinn drakk vatn af því að hann var þyrstur.");
    /* nothing is written for or against the pupil */
    const S = blankState(), sess = newSession(S);
    S.run = 4;
    const kept = () => JSON.stringify([S.cells, S.words, S.skills, S.xp, S.run, S.totalAnswers, S.totalCorrect,
      S.review, S.counters, sess.diff, sess.answers, sess.correct, sess.wrongRun, sess.skillRun, sess.skillsOk]);
    const before = kept();
    const out = settle(S, sess, t, j, { ms: 3000 });
    assert.equal(out.correct, null);
    /* no cell, no word, no skill tally, no XP; the run of right answers is
       not broken; the þyngd does not move; the review queue hears nothing */
    assert.equal(kept(), before, typed);
    assert.deepEqual(out.review.added || [], []);
  }
  /* the note under an unjudged answer says what the question asked for */
  assert.match(judge(t, { text: "Hundurinn var þyrstur og drakk vatn." }).detail.note, /af því að/);
  /* a split that still holds the conjunction */
  const s = { type: "umritun", typeId: "sameina", skill: "malbeiting", base: 12, lvl: 1, ...combineTask(x, "split") };
  const still = judge(s, { text: "Af því að hann var þyrstur. Hundurinn drakk vatn." });
  assert.equal(still.verdict, "unjudged");
  assert.match(still.detail.note, /Slepptu \*af því að\*/);
  /* a full stop put into the sentence and nothing else changed is the
     sentence as it was shown: *Af því að hann var þyrstur.* does not stand alone */
  const dot = judge(s, { text: "Hundurinn drakk vatn. Af því að hann var þyrstur." });
  assert.equal(dot.ok, false);
  assert.equal(dot.detail.note, s.copyNote);
});

test("the one wrong answer: what was shown, written back unchanged", () => {
  for (const x of PAIRS) for (const dir of ["combine", "split"]) {
    const t = { type: "umritun", typeId: "sameina", skill: "malbeiting", base: 12, lvl: 1, ...combineTask(x, dir) };
    const j = judge(t, { text: t.from.toLowerCase() });
    assert.equal(j.ok, false, t.from);
    assert.equal(j.verdict, "wrong");
    assert.equal(j.detail.note, t.copyNote);
    assert.equal(retryAllowed(t, j), true);
  }
});

test("only an open task is lenient: Umritun's own kinds are graded as before", () => {
  const t = { type: "umritun", skill: "malbeiting", kind: "igaer", base: 12, lvl: 1,
    s: { t: "Ég fór í bíó." }, answers: ["Í gær fór ég í bíó."], model: "Í gær fór ég í bíó." };
  assert.equal(gradeTransform("Í gær ég fór í bíó.", t), "wrong");
  assert.equal(judge(t, { text: "Í gær ég fór í bíó." }).ok, false);
});

test("a review asks for the very pair, the same way round", () => {
  const x = PAIRS.find((y) => y.kind === "tilvísun");
  for (const dir of ["combine", "split"]) {
    const item = `${dir}|${x.a} ${x.b}`;
    const entry = { t: "sameina", c: "sameina:" + dir, w: null, i: item, p: null, k: "k1" };
    const b = reviewTask(lex, freshView(1), seeded(3), entry);
    assert.ok(b, dir);
    assert.equal(b.task.item, item);
    assert.equal(b.hit, "item");
    /* and without the item, the same direction */
    const c = reviewTask(lex, freshView(3), seeded(4), { ...entry, i: null });
    assert.equal(c.task.kind, dir);
  }
});

test("a pair is not asked twice the same way in one visit while others are left", () => {
  const S = blankState(), sess = newSession(S);
  Object.keys(sess.diff).forEach((k) => { sess.diff[k] = 1; });
  const host = { S, sess };
  const seen = [];
  const lvl1 = 2 * PAIRS.filter((x) => x.lvl === 1).length;
  for (let k = 0; k < 30; k++) {
    const view = freshView(1);
    const b = taskCombine(lex, { ...view, S, sess }, seeded(700 + k));
    applyEffects(host, b.effects);
    seen.push(b.task.item);
  }
  assert.ok(lvl1 >= 30);
  assert.equal(new Set(seen).size, seen.length);
});

test("not in a duel: there an answer that is not judged would lose the point", () => {
  for (const x of PAIRS.slice(0, 5)) for (const dir of ["combine", "split"])
    assert.equal(combineTask(x, dir).counts, false);
  const deps = { nextTask, buildTask, makeView, applyEffects, blankState, newSession, createPolicy };
  let n = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const d = { seed, n: 20, topic: "malbeiting", level: 1 + (seed % 5) };
    for (const t of [...duelPlan(lex, d, deps), ...duelTasks(lex, { ...d, side: "a", key: 11 }, deps)]) {
      assert.notEqual(t.typeId, "sameina");
      assert.notEqual(t.open, true);
      n++;
    }
  }
  assert.ok(n > 200, String(n));
});

test("the worked example goes the way the question goes", () => {
  assert.match(exampleFor("sameina", "combine").q, /eina setningu/);
  assert.match(exampleFor("sameina", "split").q, /tvær stuttar setningar/);
  const x = PAIRS.find((y) => y.a === "Við fórum inn.");
  assert.equal(exampleFor("sameina", "combine").a, x.joined[0]);
  assert.equal(exampleFor("sameina", "split").a, `${x.a} ${x.b}`);
});

/* ---------- the build check (needs Greynir: the build container has it, the
   plain test job does not) ---------------------------------------------------- */

const py = ["python3", "python"].find((p) =>
  spawnSync(p, ["-c", "import reynir"], { encoding: "utf8" }).status === 0);

test("the build refuses a pair whose sentences do not parse to the structure it names",
  { skip: py ? false : "no Python with Greynir (reynir) here" }, () => {
    const cases = {
      good_tid: { kind: "tíð", conj: "þegar", joined: ["Við fórum inn þegar bjallan hringdi.", "Þegar bjallan hringdi fórum við inn."],
        apart: [["Við fórum inn.", "Bjallan hringdi."]] },
      good_orsok: { kind: "orsök", conj: "af því að", joined: ["Hundurinn drakk vatn af því að hann var þyrstur."],
        apart: [["Hundurinn drakk vatn.", "Hann var þyrstur."]] },
      good_skyring: { kind: "skýring", conj: "að", joined: ["Ég sá að hurðin var opin."], apart: [["Hurðin var opin.", "Ég sá það."]] },
      good_tilvisun: { kind: "tilvísun", conj: "sem", joined: ["Ég á hund sem heitir Kátur."], apart: [["Ég á hund.", "Hann heitir Kátur."]] },
      /* a joined sentence that is two main clauses, not one with a subordinate clause */
      coordinated: { kind: "tíð", conj: "þegar", joined: ["Við fórum inn og bjallan hringdi."], apart: [["Við fórum inn.", "Bjallan hringdi."]] },
      /* the wrong kind of clause for the pair */
      wrong_kind: { kind: "tilvísun", conj: "sem", joined: ["Við fórum inn þegar bjallan hringdi."], apart: [["Við fórum inn.", "Bjallan hringdi."]] },
      /* the right kind, another conjunction */
      wrong_conj: { kind: "tíð", conj: "þegar", joined: ["Ég las bók á meðan pabbi eldaði matinn."], apart: [["Ég las bók.", "Pabbi eldaði matinn."]] },
      /* a "short sentence" that has a subordinate clause of its own */
      not_short: { kind: "tíð", conj: "þegar", joined: ["Við fórum inn þegar bjallan hringdi."],
        apart: [["Við fórum inn.", "Ég sá að bjallan hringdi."]] },
      /* two sentences where one is asked for */
      two_in_one: { kind: "tíð", conj: "þegar", joined: ["Við fórum inn. Bjallan hringdi."], apart: [["Við fórum inn.", "Bjallan hringdi."]] },
      /* a known misparse of *af því að* is refused, not waved through */
      misparse: { kind: "orsök", conj: "af því að", joined: ["Við vorum inni af því að það rigndi."], apart: [["Við vorum inni.", "Það rigndi."]] },
    };
    const r = spawnSync(py, ["-c", `
import sys, json
sys.path.insert(0, "pipeline")
import clause_shape as CS
cases = json.loads(sys.stdin.read())
print(json.dumps({k: CS.problems(v) for k, v in cases.items()}, ensure_ascii=False))`],
    { cwd: root, encoding: "utf8", input: JSON.stringify(cases), env: { ...process.env, PYTHONHASHSEED: "0", PYTHONDONTWRITEBYTECODE: "1" } });
    assert.equal(r.status, 0, r.stderr);
    const got = JSON.parse(r.stdout);
    for (const k of ["good_tid", "good_orsok", "good_skyring", "good_tilvisun"]) assert.deepEqual(got[k], [], k);
    assert.match(got.coordinated.join(" "), /exactly one subordinate clause/);
    assert.match(got.wrong_kind.join(" "), /must hold a CP-REL clause/);
    assert.match(got.wrong_conj.join(" "), /must open with 'þegar'/);
    assert.match(got.not_short.join(" "), /without a subordinate clause/);
    assert.match(got.two_in_one.join(" "), /must be one sentence/);
    assert.ok(got.misparse.length > 0);
  });
