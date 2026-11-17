/* Every question type, at every band it declares, over many seeds (critique
   item 75) — properties, not examples.

   An example test says "this seed builds this question". These say what must
   hold for ANY question a builder can make, and run each type at each band of
   its `bands` (tasks/registry.js) over 30 seeds, for pupils with and without
   a past (tests/property.js). A failure names the type, the band and the seed,
   so the question can be rebuilt:

       TASKS-entry.build(lex, makeView({ S, sess }), seeded(seed))
       with pupilAt(lex, band, seed) from tests/property.js.

   The properties:
     1  a builder is not starved: it builds a question at most bands, most seeds
     2  building changes nothing (state and session as they were), and the same
        seed builds the same question
     3  a choice: the right answer is among the options, there are no two the
        same, a sort's items fit its buckets, a tap's targets are words
     4  a typed answer the judge accepts is a real BÍN form of the cell asked,
        checked against the lexicon, and no other cell's form is accepted
     5  judge(task, the right answer) is right; every wrong option is wrong
     6  `view.force`: honoured, or nothing — by the types that read the hook —
        and for ALL types a review never turns up the wrong cell or word
        (tasks/review.js)

   The sentence-and-judging halves reuse tests/helpers.js `rightResponse`. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { normalise, stripAccents } from "../src/js/core/grading.js";
import { seeded } from "../src/js/core/duel.js";
import { judge, askedCells } from "../src/js/core/answer.js";
import { TASKS, makeView, withView } from "../src/js/tasks/index.js";
import { reviewTask } from "../src/js/tasks/review.js";
import { rightResponse, wrongResponse } from "./helpers.js";
import { seedsOf, pupilAt, forAll } from "./property.js";

const lex = buildLexicon(DATA);
const SEEDS = seedsOf(30);
const TODAY = "2026-11-16";

/* ---- the cases: built once, every property reads them ------------------- */
const cases = [];      // { type, band, seed, T, task, effects, view, before }
const attempts = [];   // { type, band, seed, built }
for (const T of TASKS) {
  for (const band of T.bands) {
    for (const seed of SEEDS) {
      const { S, sess } = pupilAt(lex, band, seed);
      const view = makeView({ S, sess, today: TODAY });
      const before = JSON.stringify([S, sess]);
      const b = T.build(lex, view, seeded(seed));
      attempts.push({ type: T.id, band, seed, built: !!b });
      if (b) cases.push({ type: T.id, band, seed, T, view, before, after: JSON.stringify([S, sess]),
        task: b.task, effects: b.effects });
    }
  }
}

/* ---- 1 ---------------------------------------------------------------- */
test("no type is starved at a band it declares (item 13): it builds on most seeds", () => {
  /* A builder may build nothing — "a wrong question is worse than no question",
     and the caller tries another type. But one that builds nothing half the
     time at a band it claims is not serving it. Measured: the worst is 68%
     built (tbl_to at þyngd 3, which needs a numeral with four whole cells). */
  const by = {};
  for (const a of attempts) {
    const k = `${a.type} @ band ${a.band}`;
    by[k] ||= { n: 0, ok: 0 };
    by[k].n++; if (a.built) by[k].ok++;
  }
  const starved = Object.entries(by).filter(([, v]) => v.ok / v.n < 0.5).map(([k, v]) => `${k}: ${v.ok}/${v.n}`);
  assert.deepEqual(starved, []);
  assert.equal(Object.keys(by).length, TASKS.reduce((n, T) => n + T.bands.length, 0));
});

/* ---- 2 ---------------------------------------------------------------- */
test("building is pure: the state and the session are as they were, and a seed builds one question", () => {
  forAll(cases, (c) => {
    if (c.before !== c.after) return "the state or the session changed while building";
    if (!Array.isArray(c.effects)) return "effects is not a list";
  });
  /* same seed, same question (every fifth case: it is a rebuild each) */
  const sample = cases.filter((_, k) => k % 5 === 0);
  forAll(sample, (c) => {
    const { S, sess } = pupilAt(lex, c.band, c.seed);
    const again = c.T.build(lex, makeView({ S, sess, today: TODAY }), seeded(c.seed));
    const key = (t) => JSON.stringify(t, (k, v) => (k === "forms" ? undefined : v));
    if (!again) return "built the first time and not the second";
    if (key(again.task) !== key(c.task)) return "the same seed built another question";
  });
});

/* ---- 3 ---------------------------------------------------------------- */
const lists = (t) => [t, t.second].filter((x) => x && Array.isArray(x.options));

test("a choice: the right answer is among the options, no two options are alike, none is empty", () => {
  let n = 0;
  forAll(cases, (c) => {
    for (const q of lists(c.task)) {
      n++;
      const keys = q.options.map((o) => normalise(o));
      if (keys.some((k) => !k)) return `an empty option in ${JSON.stringify(q.options)}`;
      if (new Set(keys).size !== keys.length) return `two options alike: ${JSON.stringify(q.options)}`;
      if (q.options.length < 2) return `fewer than two options: ${JSON.stringify(q.options)}`;
      if (!q.options.includes(q.answer)) return `the answer ${JSON.stringify(q.answer)} is not among ${JSON.stringify(q.options)}`;
    }
  });
  assert.ok(n > 800, `only ${n} choices were looked at`);
});

test("a sort fits its buckets and a tap points at words", () => {
  let sorts = 0, taps = 0;
  forAll(cases, (c) => {
    const t = c.task;
    if (t.type === "sort") {
      sorts++;
      if (new Set(t.buckets).size !== t.buckets.length) return "two buckets alike";
      if (t.items.length < 2) return "fewer than two items to sort";
      for (const it of t.items) if (!t.buckets.includes(it.cls)) return `${it.w} belongs to ${it.cls}, which is no bucket`;
    }
    if (t.type === "tap") {
      taps++;
      const toks = t.s.tok;
      if (!t.targets.length) return "nothing to tap";
      if (new Set(t.targets).size !== t.targets.length) return "a target twice";
      for (const i of t.targets) if (!(Number.isInteger(i) && i >= 0 && i < toks.length)) return `target ${i} is not a word of the sentence`;
      if (t.targets.some((i) => toks[i].punct || !String(toks[i].w || "").trim())) return "a target is not a word";
    }
  });
  assert.ok(sorts > 100 && taps > 100, `${sorts} sorts, ${taps} taps`);
});

/* ---- 4 ---------------------------------------------------------------- */
const key = (s) => normalise(s);

/** The entries of the lexicon a task is about: its own word object, or what
    its `word` key ("lemma|class") names. */
function entriesOf(t) {
  const own = [t.n, t.v, t.type === "table" ? t.w : null].filter((x) => x && x.forms);
  if (own.length) return own;
  if (!t.word) return [];
  const at = t.word.lastIndexOf("|");
  return lex.lemma(t.word.slice(0, at)).filter((w) => w.c === t.word.slice(at + 1));
}

/** Is `form` a BÍN form of mark `m`? Of one of `entries`' own cells when it
    has one; otherwise of any word at all (a numeral item names no word). */
function isFormOf(form, m, entries, paradigm = null) {
  /* An item the build wrote by hand (the dates' ordinals: *þann sautjánda*)
     names no word, and the in-app lexicon is a school vocabulary that has
     not got *sautjándi*. Its forms come out of BÍN when the data is built
     (pipeline/build_exercises.py, which fails on a form BÍN lacks); here the answer
     must be the form its own paradigm gives for the cell. */
  if (m && !entries.length && paradigm && (paradigm[m] || []).some((f) => key(f) === key(form))) {
    if (!lex.analyse(form).length) BY_PARADIGM.add(CURRENT);
    return true;
  }
  /* A phrase ("góðu sýningarinnar": adjective and noun) is right when its LAST
     word is the form asked and every word in front is a word of the lexicon. */
  const parts = key(form).split(" ");
  if (parts.length > 1) {
    return parts.slice(0, -1).every((p) => lex.analyse(p).length > 0) && isFormOf(parts[parts.length - 1], m, entries, paradigm);
  }
  const k = key(form);
  if (m && entries.length && entries.some((w) => w.forms[m])) {
    return entries.some((w) => (w.forms[m] || []).some((f) => key(f) === k));
  }
  const hits = lex.analyse(form);
  /* a numeral's cell is named without the adjective's FSB- (tvennur: HK-NFFT) */
  return m ? hits.some((a) => a.mark === m || a.mark === "FSB-" + m) : hits.length > 0;
}
/* Which types were let through on their own paradigm because the lexicon has
   not got the form: only the dates' ordinals (*sautjánda*) and a few hand-written
   items of fs_sogn (*bakarann*), whose words pipeline/build_exercises.py checks against
   BÍN and stops on a form BÍN lacks. Nothing else may. */
const BY_PARADIGM = new Set();
let CURRENT = null;

test("every typed answer the judge accepts is a BÍN form of the cell asked", () => {
  let looked = 0;
  forAll(cases, (c) => {
    const t = c.task, entries = entriesOf(t);
    CURRENT = c.type;
    if (["fill", "verb", "verbslot", "gap"].includes(t.type)) {
      if (!t.answers || !t.answers.length) return "no accepted answer";
      for (const a of t.answers) {
        looked++;
        if (!isFormOf(a, t.m, entries, t.paradigm)) return `"${a}" is not a form of ${t.m || "any word"} of ${t.word || "the item"}`;
        if (!judge(t, { text: a }).ok) return `the judge does not accept its own answer "${a}"`;
      }
    } else if (t.type === "slots") {
      for (const sl of t.slots) for (const a of sl.accepted) {
        looked++;
        if (!isFormOf(a, sl.m, entries)) return `"${a}" is not a form of ${sl.m} of ${t.word}`;
      }
    } else if (t.type === "kenni" && t.askGen) {
      for (const a of t.gen) { looked++; if (!isFormOf(a, "EFET", entries)) return `"${a}" is not the genitive singular of ${t.word}`; }
    } else if (t.type === "table") {
      for (const cell of askedCells(t)) {
        const forms = t.w.forms[cell.m];
        if (!forms || !forms.length) return `the lexicon has no ${cell.m} for ${t.word}`;
        for (const f of forms) { looked++; if (!lex.analyse(f).some((a) => a.mark === cell.m)) return `"${f}" is not analysed as ${cell.m}`; }
      }
    }
  });
  assert.ok(looked > 3000, `only ${looked} answers were looked at`);
  assert.deepEqual([...BY_PARADIGM].sort(), ["fs_sogn", "to_dags"], "a type was let through without being found in the lexicon");
});

test("the judge accepts the forms of the cell asked and no other cell's form", () => {
  let probed = 0;
  forAll(cases, (c) => {
    const t = c.task;
    if (!["fill", "verb", "verbslot"].includes(t.type) || !t.paradigm) return;
    const right = new Set(t.answers.map((a) => stripAccents(a)));
    for (const [m, forms] of Object.entries(t.paradigm)) {
      if (m === t.m) continue;
      for (const f of forms) {
        /* the same letters in another cell (*stúlku*) are right, and a missing
           accent is a slip the judge forgives: neither is "another form" */
        if (right.has(stripAccents(f))) continue;
        probed++;
        const j = judge(t, { text: f });
        if (j.ok) return `"${f}" (${m}) was accepted for ${t.m}`;
      }
    }
  });
  assert.ok(probed > 2000, `only ${probed} wrong forms were tried`);
});

/* ---- 5 ---------------------------------------------------------------- */
/** A wrong response that is not nonsense: the one the screen can produce. */
function wrongOnes(t) {
  const r = rightResponse(t);
  const wrongs = [];
  if (Array.isArray(t.options) && t.answer != null && ["choice", "clause", "kenni", "slots"].includes(t.type)) {
    for (const o of t.options) if (o !== t.answer) wrongs.push({ ...r, picked: o });
  } else if (t.type === "syntax") {
    const k = t.s.tok.findIndex((x, i) => x.r !== t.askRole && !x.punct);
    if (k >= 0) wrongs.push({ picked: k });
  } else {
    wrongs.push(wrongResponse(t));
  }
  return wrongs;
}

test("judge(task, the right answer) is right, and every wrong option is wrong", () => {
  let right = 0, wrong = 0;
  forAll(cases, (c) => {
    const t = c.task;
    if (t.type === "meaning") return;                        // there is no wrong answer
    const j = judge(t, rightResponse(t));
    right++;
    if (j.ok !== true) return `the right answer was judged ${j.ok} (${j.verdict})`;
    for (const w of wrongOnes(t)) {
      wrong++;
      const jw = judge(t, w);
      if (jw.ok === true) return `${JSON.stringify(w).slice(0, 120)} was judged right`;
    }
  });
  assert.ok(right > 4000 && wrong > 4000, `${right} right answers, ${wrong} wrong ones`);
});

/* ---- 6 ---------------------------------------------------------------- */
const hasCell = (task, m) =>
  task.cell === m || (task.type === "table" && (task.cells || []).some((x) => x.m === m));
const cellOf = (t) => (t.type === "table" ? (t.cells[0] || {}).m : t.cell);

/* The types whose builders READ the hook (`forcedCell`, `cellWanted`,
   `view.force`): with a cell forced they build that cell or nothing. The
   other twelve — parse, govern, indecl, fn_stad, ob_smella, ob_fsao,
   gr_smella, fs_hreyf, fs_sogn, fs_operson, or_heiti, or_myndun — build as
   they always do, which tasks/view.js says is allowed, and tasks/review.js
   checks every candidate against the entry for exactly that reason (the next
   test). Giving one of them the hook is a gain for reviews: move it here. */
const IGNORES_FORCE = new Set(["parse", "govern", "indecl", "fn_stad", "ob_smella", "ob_fsao",
  "gr_smella", "fs_hreyf", "fs_sogn", "fs_operson", "or_heiti", "or_myndun"]);

test("view.force: a type that reads the hook builds the cell asked, or nothing", () => {
  let asked = 0;
  const some = cases.filter((c) => !IGNORES_FORCE.has(c.type) && cellOf(c.task) && c.seed <= 8);
  forAll(some, (c) => {
    const m = cellOf(c.task);
    const { S, sess } = pupilAt(lex, c.band, c.seed);
    const view = makeView({ S, sess, today: TODAY, force: { cell: m } });
    const b = c.T.build(lex, view, seeded(c.seed + 1000));
    asked++;
    if (b && !hasCell(b.task, m)) return `asked for ${m} and built ${cellOf(b.task)}`;
  });
  assert.ok(asked > 400, `${asked} forced builds`);
});

test("view.force with a word: a type's drill builds that word or nothing", () => {
  let asked = 0;
  const some = cases.filter((c) => !IGNORES_FORCE.has(c.type) && c.task.word && c.seed <= 8 &&
    typeof c.T.drill === "function");
  forAll(some, (c) => {
    const at = c.task.word.lastIndexOf("|");
    const word = lex.lookup(c.task.word.slice(0, at), c.task.word.slice(at + 1));
    if (!word) return `${c.task.word} is not in the lexicon`;
    const { S, sess } = pupilAt(lex, c.band, c.seed);
    /* as tasks/review.js: a word is asked for through the type's `drill` */
    const view = makeView({ S, sess, today: TODAY, force: { word }, drillWord: word });
    const b = c.T.drill(lex, view, seeded(c.seed + 2000), word);
    asked++;
    if (b && b.task.word !== c.task.word) return `asked for ${c.task.word} and built ${b.task.word}`;
  });
  assert.ok(asked > 40, `${asked} forced builds`);
});

test("a review of any type is the cell and the word asked, or nothing", () => {
  let reviewed = 0;
  const some = cases.filter((c) => cellOf(c.task) && c.seed <= 5);
  forAll(some, (c) => {
    const { S, sess } = pupilAt(lex, c.band, c.seed);
    const view = makeView({ S, sess, today: TODAY });
    const entry = { t: c.type, c: cellOf(c.task), w: c.task.word || null, i: c.task.item || null, p: null, k: "x" };
    const r = reviewTask(lex, view, seeded(c.seed + 3000), entry);
    if (!r) return;
    reviewed++;
    const t = r.task;
    if (r.hit === "both" && !(hasCell(t, entry.c) && t.word === entry.w)) return `hit "both" but built ${cellOf(t)} / ${t.word}`;
    if (r.hit === "cell" && !hasCell(t, entry.c)) return `hit "cell" but built ${cellOf(t)}`;
    if (r.hit === "word" && t.word !== entry.w) return `hit "word" but built ${t.word}`;
    if (r.hit === "item" && t.item !== entry.i) return `hit "item" but built item ${t.item}`;
    if (t.typeId !== c.type) return `a ${c.type} review built a ${t.typeId}`;
  });
  assert.ok(reviewed > 200, `${reviewed} reviews were built`);
});
