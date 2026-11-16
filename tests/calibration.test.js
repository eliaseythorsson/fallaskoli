/* v6.13, critique item 17: calibration from real answers — the arithmetic
   (core/calibration.js) and what the browser does with a table. The server's
   side (who is counted, the caps, the weekly run) is in
   tests/calibration-server.test.js. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, newSession } from "../src/js/core/state.js";
import { createPolicy, blankPolicy, QUESTION_TYPES } from "../src/js/core/policy.js";
import { nextTask, makeView, TASKS } from "../src/js/tasks/index.js";
import { judge } from "../src/js/core/answer.js";
import { askedCells } from "../src/js/core/answer.js";
import { duelTasks } from "../src/js/core/duel.js";
import { applyEffects } from "../src/js/tasks/index.js";
import { hardnessWeight } from "../src/js/core/difficulty.js";
import {
  CAL, eventOf, cleanEvents, estimate, decayCounts, cleanTable, tableIsEmpty, typeShift, lexHardness,
} from "../src/js/core/calibration.js";

const lex = buildLexicon(DATA);
const typeIds = new Set(TASKS.map((t) => t.id));
const marks = new Set(Object.values(DATA.lex.orders).flat());

/** A seeded random source, so a failure can be reproduced. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** [right, total] for `n` answers of which the share `p` was right. */
const at = (n, p) => [Math.round(n * p), n];
/** Every unit has been contributed to by plenty of pupils. */
const MANY = new Proxy({}, { get: () => 9 });

/* ---------- 1. the event ------------------------------------------------------ */

/** A policy that leaves one question type on. */
function only(typeId) {
  const p = blankPolicy();
  p.types = Object.fromEntries(QUESTION_TYPES.map((t) => [t.id, t.id === typeId]));
  return createPolicy(p);
}

function freshTask(typeId, level, seed, cal = { v: 1, types: {}, cells: {}, irr: {} }, range = null) {
  const S = blankState(), sess = newSession(S);
  /* Every skill at the level: a type may build for a skill other than the
     one it is filed under (the cloze also asks adjectives and pronouns). */
  for (const sk of Object.keys(sess.diff)) sess.diff[sk] = level;
  if (range) sess.range = range;
  const view = makeView({ S, sess, policy: only(typeId), today: "2026-11-17", inRun: true, cal });
  const b = nextTask(lex, view, seeded(seed));
  return b ? { task: b.task, S, sess } : null;
}

test("an event carries a type, a level, cells and scores — and nothing the pupil typed", () => {
  const { task, S, sess } = freshTask("fill", 3, 11);
  assert.equal(task.typeId, "fill");
  assert.equal(task.calBand, 3, "the level the skill really stood at");
  const j = judge(task, { text: "þetta er alls ekki rétt svar" }, { S, sess });
  assert.equal(j.ok, false);
  const e = eventOf(task, j, lex);
  assert.deepEqual(Object.keys(e).sort(), ["l", "ok", "recs", "t"]);
  assert.equal(e.t, "fill"); assert.equal(e.l, 3); assert.equal(e.ok, false);
  assert.ok(e.recs.length === 1 && e.recs[0][0] === task.m, "the cell asked for");
  assert.ok(!JSON.stringify(e).includes("alls ekki"), "what was typed is not in the event");
  assert.ok(!JSON.stringify(e).includes(task.n ? task.n.o : "\u0000"), "nor the word");
  /* the same event passes the server's gate unchanged */
  assert.deepEqual(cleanEvents([e], { types: typeIds, marks }), [e]);
});

test("a table is one question and one record per cell", () => {
  const { task, S, sess } = freshTask("tbl_no", 2, 5);
  const cells = askedCells(task);
  const j = judge(task, { cells: cells.map((c, k) => (k ? "xx" : task.w.forms[c.m][0])) }, { S, sess });
  const e = eventOf(task, j, lex);
  assert.equal(e.ok, false);
  assert.equal(e.recs.length, cells.length);
  assert.deepEqual(e.recs.map((r) => r[2]), cells.map((_, k) => (k ? 0 : 1)));
  assert.ok(e.recs.every((r) => r[1] === task.w.irr), "each with the word's irregularity score");
});

test("not counted: a question that was not marked, a hinted answer, an unfinished one", () => {
  const { task, S, sess } = freshTask("fill", 2, 3);
  const right = judge(task, { text: task.answers[0] }, { S, sess });
  assert.ok(eventOf(task, right, lex));
  assert.equal(eventOf({ ...task, calBand: undefined }, right, lex), null, "a review, a drill, a duel");
  assert.equal(eventOf(task, judge(task, { text: task.answers[0], hinted: true }, { S, sess }), lex), null);
  assert.equal(eventOf(task, judge(task, { text: "" }, { S, sess }), lex), null, "pending");
  assert.equal(eventOf(task, null, lex), null);
});

test("only ordinary practice marks a question: no table on the view, no mark", () => {
  const S = blankState(), sess = newSession(S);
  const view = makeView({ S, sess, policy: only("fill"), today: "2026-11-17" });
  const b = nextTask(lex, view, seeded(4));
  assert.equal(b.task.calBand, undefined);
  /* …and a duel, which builds through the same `nextTask`, marks none */
  const tasks = duelTasks(lex, { seed: "abc", topic: "blandad", n: 5, level: 2 },
    { nextTask, makeView, applyEffects, blankState, newSession, createPolicy });
  assert.ok(tasks.length && tasks.every((t) => t.calBand === undefined));
});

test("the server's gate drops what is not a known type, level, cell or score", () => {
  const good = { t: "fill", l: 3, ok: true, recs: [["ÞGFET", 2, 1]] };
  const out = cleanEvents([
    good,
    { t: "nosuchtype", l: 3, ok: true, recs: [] },
    { t: "fill", l: 9, ok: true, recs: [] },
    { t: "fill", l: 2.5, ok: true, recs: [] },
    { t: "fill", l: 3, ok: "yes", recs: [] },
    { t: "fill", l: 3, ok: false, recs: [["Jón Jónsson", 0, 0], ["ÞGFET", 77, 1], ["stjórn:um", 3, 0], "x", ["EFFT", 1]] },
    "text", null, 7,
  ], { types: typeIds, marks });
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], good);
  /* a cell that is not a BÍN mark is blanked; with no score either, the record goes */
  assert.deepEqual(out[1].recs, [["ÞGFET", 0, 1], ["", 3, 0]]);
  assert.ok(!JSON.stringify(out).includes("Jón"));
  assert.deepEqual(cleanEvents("nonsense", { types: typeIds, marks }), []);
  /* bounded */
  const many = Array.from({ length: 500 }, () => ({ ...good, recs: Array.from({ length: 200 }, () => ["ÞGFET", 2, 1]) }));
  const cut = cleanEvents(many, { types: typeIds, marks });
  assert.equal(cut.length, CAL.perPost);
  assert.equal(cut[0].recs.length, CAL.recsPerQuestion);
});

/* ---------- 2. the types: shrinkage, the gate, the clamp ----------------------- */

const cellHard = (m) => lex.cellHardness(m);
const run = (counts, prev = null) => estimate({ distinct: MANY, types: {}, cells: {}, ...counts },
  { prev, cellHard, typeIds, now: Date.parse("2026-11-17T00:00:00Z") });

/* Band 3: four other types, 300 answers each, 80 % right. */
const others = { "verb|3": at(300, 0.8), "tbl_no|3": at(300, 0.8), "govern|3": at(300, 0.8),
  "parse|3": at(300, 0.8) };

test("few answers change nothing; the same share over many answers moves the type one step", () => {
  const few = run({ types: { ...others, "fill|3": at(30, 0.5) } });
  assert.deepEqual(few.table.types, {}, "30 answers are below the minimum");
  assert.deepEqual(few.changes, []);

  /* 45 answers at 73 %: above the minimum, but shrunk towards the prior the
     difference is inside the noise. */
  const some = run({ types: { ...others, "fill|3": at(45, 0.73) } });
  assert.deepEqual(some.table.types, {});

  const many = run({ types: { ...others, "fill|3": at(300, 0.6) } });
  assert.deepEqual(many.table.types, { fill: { 3: -CAL.step } }, "harder than its label: a step lower");
  assert.equal(many.changes.length, 1);
  assert.deepEqual(many.reset, ["fill|3"], "and measured afresh from here");
  const c = many.changes[0];
  assert.deepEqual([c.k, c.id, c.band, c.from, c.to, c.n], ["type", "fill", 3, 0, -0.25, 300]);

  const easy = run({ types: { ...others, "fill|3": at(300, 0.95) } });
  assert.deepEqual(easy.table.types, { fill: { 3: CAL.step } }, "easier than its label: a step higher");
});

test("the shrunk estimate lies between the prior and the data, nearer the prior for fewer answers", () => {
  /* The step is fixed, so shrinkage shows in WHEN the gate opens: the same
     observed share needs more answers than a naive test would. */
  const opensAt = (p) => {
    for (let n = CAL.minTypeN; n <= 2000; n += 10)
      if (run({ types: { ...others, "fill|3": at(n, p) } }).changes.length) return n;
    return Infinity;
  };
  const far = opensAt(0.55), near = opensAt(0.72), tiny = opensAt(0.78);
  assert.ok(far <= 60, `25 points off: moves almost at once (${far})`);
  assert.ok(near > far && near <= 600, `8 points off: needs more answers (${near})`);
  assert.equal(tiny, Infinity, "2 points off is inside the deadband, however many answers");
});

test("a value moves one step per run and never further than one level from the built-in", () => {
  let table = null;
  const seen = [];
  for (let k = 0; k < 8; k++) {
    const r = run({ types: { ...others, "fill|3": at(400, 0.3) } }, table);
    table = r.table;
    seen.push(typeShift(table, "fill", 3));
  }
  assert.deepEqual(seen, [-0.25, -0.5, -0.75, -1, -1, -1, -1, -1]);
  /* and it comes back the same way when the evidence turns */
  const back = run({ types: { ...others, "fill|3": at(400, 0.97) } }, table);
  assert.equal(typeShift(back.table, "fill", 3), -0.75);
  /* with nothing new to say, what stood stays */
  assert.equal(typeShift(run({ types: others }, table).table, "fill", 3), -1);
});

test("nothing moves on the answers of fewer than three accounts", () => {
  const types = { ...others, "fill|3": at(400, 0.3) };
  const lonely = estimate({ types, cells: {}, distinct: { "T:fill|3": 2, "T:verb|3": 9, "T:tbl_no|3": 9 } },
    { cellHard, typeIds });
  assert.deepEqual(lonely.changes, []);
  assert.deepEqual(lonely.table.types, {});
  const three = estimate({ types, cells: {}, distinct: { "T:fill|3": 3 } }, { cellHard, typeIds });
  assert.equal(typeShift(three.table, "fill", 3), -0.25);
});

test("a band with too little to compare with is left alone", () => {
  assert.deepEqual(run({ types: { "fill|3": at(400, 0.3) } }).table.types, {}, "the only type at its band");
  assert.deepEqual(run({ types: { "fill|3": at(400, 0.3), "verb|3": at(400, 0.8), "parse|3": at(400, 0.8) } })
    .table.types, {}, "two other types are not enough to say what is typical");
  assert.deepEqual(run({ types: { "fill|3": at(400, 0.3), "verb|3": at(20, 0.8), "parse|3": at(20, 0.8),
    "govern|3": at(20, 0.8) } }).table.types, {}, "nor three with a handful of answers each");
});

test("one very hard type — or one somebody flooded — moves only itself, not the others", () => {
  /* The mean of 'everything else' would drop when fill collapses, and every
     other type would look easy against it. The median does not. */
  const r = run({ types: { ...others, "fill|3": at(5000, 0.0) } });
  assert.deepEqual(r.table.types, { fill: { 3: -CAL.step } });
  assert.equal(r.changes.length, 1);
});

/* ---------- 3. cells and irregularity ------------------------------------------ */

/* Noun cells the build scores alike, all asked in one type at one level. */
const sameScore = (() => {
  const by = {};
  for (const m of DATA.lex.orders.no) (by[lex.cellHardness(m)] ||= []).push(m);
  return Object.values(by).sort((a, b) => b.length - a.length)[0];
})();
const cellKey = (m, i = 0) => `tbl_no|3|${m}|${i}`;

test("a cell answered clearly worse than cells of the same score becomes harder, a quarter at a time", () => {
  assert.ok(sameScore.length >= 4, "the bundle has four noun cells of one score");
  const [x, ...peers] = sameScore;
  const h = lex.cellHardness(x);
  const cells = { [cellKey(x)]: at(400, 0.45) };
  peers.forEach((m) => { cells[cellKey(m)] = at(400, 0.8); });
  const r = run({ cells });
  assert.equal(r.table.cells[x], h + CAL.step);
  const c = r.changes.find((y) => y.k === "cell" && y.id === x);
  assert.deepEqual([c.from, c.to, c.builtIn, c.n], [h, h + 0.25, h, 400]);

  assert.deepEqual(Object.keys(r.table.cells), [x], "its peers stay where they are");

  /* run after run: never beyond one point, never off the 1–5 scale */
  let table = r.table;
  for (let k = 0; k < 8; k++) table = run({ cells }, table).table;
  assert.equal(table.cells[x], Math.min(5, h + CAL.max));

  /* the evidence gone: it walks back to the built-in and leaves the table */
  for (let k = 0; k < 8; k++) table = run({ cells: {} }, table).table;
  assert.equal(table.cells[x], undefined);
});

test("cells: few records, or a small difference, change nothing", () => {
  const [x, ...peers] = sameScore;
  const base = {};
  peers.forEach((m) => { base[cellKey(m)] = at(400, 0.8); });
  assert.deepEqual(run({ cells: { ...base, [cellKey(x)]: at(40, 0.3) } }).table.cells, {}, "40 records");
  assert.deepEqual(run({ cells: { ...base, [cellKey(x)]: at(400, 0.78) } }).table.cells, {}, "2 points");
  const lonely = estimate({ types: {}, cells: { ...base, [cellKey(x)]: at(400, 0.3) },
    distinct: { ["C:" + x]: 1 } }, { cellHard, typeIds });
  assert.equal(lonely.table.cells[x], undefined, "one account's cell");
});

test("a cell is not blamed for the type it is asked in", () => {
  /* x is only ever asked in a hard type, where everything is at 50 %. */
  const [x, a, b, c] = sameScore;
  const cells = {
    [`tbl_no|3|${x}|0`]: at(400, 0.5), [`tbl_no|3|${a}|0`]: at(400, 0.5),
    [`fill|3|${b}|0`]: at(400, 0.9), [`fill|3|${c}|0`]: at(400, 0.9), [`fill|3|${a}|0`]: at(400, 0.9),
  };
  assert.deepEqual(run({ cells }).table.cells, {});
});

test("irregularity: a bucket off the line through the five is moved; the order of the scores is kept", () => {
  /* Share right falls 5 points per score — except score 3, which is as bad as 5. */
  const share = { 1: 0.9, 2: 0.85, 3: 0.7, 4: 0.75, 5: 0.7 };
  const cells = {};
  for (const [k, p] of Object.entries(share)) cells[`fill|3||${k}`] = at(600, p);
  const r = run({ cells });
  assert.ok(r.table.irr[3] > 3, "score 3 counts for more than 3");
  assert.ok(r.table.irr[3] <= 3 + CAL.step);
  let table = r.table;
  for (let k = 0; k < 10; k++) table = run({ cells }, table).table;
  const worth = [1, 2, 3, 4, 5].map((k) => table.irr[k] ?? k);
  assert.ok(worth.every((v, k) => v >= 1 && v <= 5 && Math.abs(v - (k + 1)) <= CAL.max), worth.join(" "));
  assert.ok(worth.every((v, k) => !k || v >= worth[k - 1]), "never out of order: " + worth.join(" "));

  /* if irregular words are not answered worse at all, nothing is moved */
  const flat = {};
  for (let k = 1; k <= 5; k++) flat[`fill|3||${k}`] = at(600, k === 3 ? 0.6 : 0.8);
  assert.deepEqual(run({ cells: flat }).table.irr, {});
});

test("counts fade: every run multiplies them, and a faded key is dropped", () => {
  const out = decayCounts({ a: [80, 100], b: [0.4, 0.5], c: "x", d: [1, 0] });
  assert.deepEqual(out, { a: [68, 85] });
  let m = { a: [80, 100] };
  for (let k = 0; k < 40; k++) m = decayCounts(m);
  assert.deepEqual(m, {}, "nothing is kept for ever");
});

/* ---------- 4. the browser: reading and applying a table ------------------------ */

test("a table is rebuilt field by field; anything else is no table", () => {
  for (const bad of [null, undefined, "x", 7, [], {}, { v: 2, types: {} }, { error: "Engin slík slóð." }])
    assert.equal(cleanTable(bad), null);
  const t = cleanTable({
    v: 1, at: "2026-11-17T00:00:00.000Z", junk: "<script>",
    types: { fill: { 3: -0.25, 9: 1, x: 1, 4: -7, 5: "1" }, verb: "no" },
    cells: { EFFT: 4.25, NFET: 0, ÞFET: 99, ["x".repeat(60)]: 3, ÞGFET: "4" },
    irr: { 3: 3.5, 8: 2, 2: -1 },
  });
  assert.deepEqual(t, { v: 1, at: "2026-11-17T00:00:00.000Z",
    types: { fill: { 3: -0.25 } }, cells: { EFFT: 4.25 }, irr: { 3: 3.5 } });
  assert.equal(typeShift(t, "fill", 3), -0.25);
  assert.equal(typeShift(t, "fill", 4), 0);
  assert.equal(typeShift(null, "fill", 3), 0);
  assert.equal(tableIsEmpty(t), false);
  assert.equal(tableIsEmpty(cleanTable({ v: 1 })), true);
  assert.equal(tableIsEmpty(null), true);
});

test("with no table, or an empty one, the lexicon is the built-in one", () => {
  assert.equal(lexHardness(null), null);
  assert.equal(lexHardness(cleanTable({ v: 1, types: { fill: { 3: 1 } } })), null, "type shifts are not scores");
});

test("the table's scores reach the lexicon: a cell by its mark, words by what their score is worth", () => {
  const table = cleanTable({ v: 1, cells: { EFFT: 5 }, irr: { 1: 1.5 } });
  const cal = buildLexicon(DATA, { hardness: lexHardness(table) });
  assert.equal(cal.cellHardness("EFFT"), 5);
  assert.equal(cal.cellHardness("NFET"), lex.cellHardness("NFET"), "other cells untouched");
  const h = cal.lookup("hestur", "kk");
  assert.equal(lex.lookup("hestur", "kk").irr, 1);
  assert.equal(h.irr, 1.5);
  assert.equal(h.irrBuilt, 1, "the build's score stays readable — it is what is counted");
  assert.equal(cal.lookup("maður", "kk").irr, lex.lookup("maður", "kk").irr, "other scores untouched");
  /* and the weight follows: at level 1 a word worth 1.5 is a little rarer */
  assert.ok(hardnessWeight(1, h.irr) < hardnessWeight(1, 1));
  /* the event still reports the build's bucket */
  const { task, S, sess } = freshTask("tbl_no", 2, 5);
  const j = judge(task, { cells: askedCells(task).map(() => "xx") }, { S, sess });
  const viaCal = eventOf(task, j, cal), viaBuilt = eventOf(task, j, lex);
  assert.deepEqual(viaCal.recs.map((r) => r[1]), viaBuilt.recs.map((r) => r[1]));
});

test("a shifted type is built a step lower, inside the skill's range, and the pupil's level is untouched", () => {
  const levels = (cal, range = null) => {
    const out = [];
    for (let seed = 1; seed <= 60; seed++) {
      const b = freshTask("fill", 4, seed, cal, range);
      if (!b) continue;
      assert.ok(Object.values(b.sess.diff).every((d) => d === 4), "the session's levels are not written to");
      assert.equal(b.task.calBand, 4, "counted at the level the pupil is at");
      out.push(b.task.s.lvl);
    }
    return out;
  };
  const empty = { v: 1, types: {}, cells: {}, irr: {} };
  const plain = levels(empty);
  const lower = levels({ ...empty, types: { fill: { 4: -1 } } });
  assert.ok(Math.max(...plain) === 4, "at þyngd 4 the cloze reaches sentences of level 4");
  assert.ok(Math.max(...lower) <= 3, "moved one level down it does not");
  /* a shift for another band, or another type, changes nothing */
  assert.deepEqual(levels({ ...empty, types: { fill: { 3: -1 }, verb: { 4: -1 } } }), plain);
  /* the range holds: skills that may not go below 4 are not taken below it */
  const held = Object.fromEntries(Object.keys(newSession(blankState()).diff).map((k) => [k, [4, 7]]));
  assert.deepEqual(levels({ ...empty, types: { fill: { 4: -1 } } }, held), levels(empty, held));
});

test("the same seed builds the same question with an empty table as with none", () => {
  for (const id of ["fill", "verb", "tbl_no", "govern"]) {
    for (let seed = 1; seed <= 8; seed++) {
      const a = freshTask(id, 3, seed, null), b = freshTask(id, 3, seed);
      const strip = (x) => { if (!x) return null; const { calBand, ...t } = x.task; return JSON.stringify(t); };
      assert.equal(strip(a), strip(b), `${id} seed ${seed}`);
    }
  }
});
