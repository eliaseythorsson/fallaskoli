/* The review queue (critique items 18, 19 and 20).

   core/review.js   the queue: what a wrong answer puts in, how a right answer
                    on a due entry moves it out (1 → 3 → 7 → 21 days), what is
                    kept, merged between devices and accepted by the server
   tasks/review.js  an entry turned back into a question, with the cell or
                    the word forced; the three reviews a session opens with;
                    the noun of a missed cloze, three to five questions on
   tasks/toluord.js the numeral items, out of the vocabulary gate

   The property under all of it: what was missed comes back — the next day,
   and as the thing that was missed. */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DATA } from "../data/data_bundle.js";
import { EX } from "../data/exercises.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, newSession, migrate, todayKey, wordKey } from "../src/js/core/state.js";
import { SKILL_IDS } from "../src/js/core/skills.js";
import { createPolicy, narrowPolicy } from "../src/js/core/policy.js";
import { seeded } from "../src/js/core/duel.js";
import { judge, settle, askedCells } from "../src/js/core/answer.js";
import { chancesIn } from "../src/js/core/diagnosis.js";
import { mergeStates } from "../src/js/core/merge.js";
import { maxOf } from "../src/js/core/mix.js";
import { cleanState } from "../server/guard.mjs";
import {
  INTERVALS, REVIEW_MAX, STATS_MAX, STALE_DAYS, OPENING_MAX, REASK_GAP,
  noteReview, readAnswer, keyFor, dueEntries, dueCount, openingSize, openingReviews,
  entryByKey, tidyReview, queuePattern, addDays, daysBetween, dayOf, reaskAt, blankReview, sanitiseReview,
  mergeReview, patternReviewStats, skillReviewStats, reviewSummary, reviewLine,
} from "../src/js/core/review.js";
import { TASKS, typeById, nextTask, makeView, withView, applyEffects,
  reviewTask, planOpening, nextOpening, scheduleReask, nextReask } from "../src/js/tasks/index.js";
import { substitutable, acceptsNoun, repeatsNoun } from "../src/js/tasks/frames.js";

const lex = buildLexicon(DATA);
const D0 = "2026-11-16";
const copy = (x) => JSON.parse(JSON.stringify(x));
const allOn = {};
SKILL_IDS.forEach((id) => { allOn[id] = true; });
const POLICY = createPolicy(null, { skills: allOn, types: {}, levels: {}, attrs: {}, safeVocab: null });

function pupil(band = 3) {
  const S = blankState();
  SKILL_IDS.forEach((id) => { S.enabled[id] = true; });
  const sess = newSession(S);
  Object.keys(sess.diff).forEach((k) => { sess.diff[k] = band; });
  return { S, sess };
}
const view = (p, extra = {}) => makeView({ S: p.S, sess: p.sess, policy: POLICY, today: D0, ...extra });

/** A judgement as `judge` makes it, as far as the queue reads it. */
const J = (ok, { p = null, recs = [] } = {}) => ({
  ok, findings: p ? [{ p }] : [],
  effects: recs.map((r) => ({ do: "record", ...r })),
});
const cloze = (cell = "ÞGFFT", word = "hestur|kk", typeId = "fill") =>
  ({ type: "fill", typeId, skill: "nafnord", cell, word });

/* ========================================================================
 * 1. The schedule
 * ====================================================================== */

test("a wrong answer puts an entry in the queue, due the next day", () => {
  const S = blankState();
  const out = noteReview(S, cloze(), J(false, { p: "thf_thgf" }), D0);
  assert.equal(S.review.items.length, 1);
  const e = S.review.items[0];
  assert.equal(out.added, e.k);
  assert.deepEqual(
    { t: e.t, sk: e.sk, p: e.p, c: e.c, w: e.w, s: e.s, due: e.due, add: e.add, last: e.last, l: e.l, ok: e.ok },
    { t: "fill", sk: "nafnord", p: "thf_thgf", c: "ÞGFFT", w: "hestur|kk", s: 0,
      due: "2026-11-17", add: D0, last: D0, l: 1, ok: 0 });
  assert.equal(dueCount(S, D0), 0, "not due on the day it was missed");
  assert.equal(dueCount(S, "2026-11-17"), 1);
});

test("a right answer on a due entry moves it out 1 → 3 → 7 → 21 days, and then it is done", () => {
  assert.deepEqual(INTERVALS, [1, 3, 7, 21]);
  const S = blankState();
  noteReview(S, cloze(), J(false, { p: "thf_thgf" }), D0);
  const k = S.review.items[0].k;
  let day = D0;
  const gaps = [];
  for (let n = 0; n < 4; n++) {
    const e = entryByKey(S, k);
    gaps.push(daysBetween(day, e.due));
    day = e.due;                                  // answered on the day it falls due
    const out = noteReview(S, cloze(), J(true), day);
    if (n < 3) assert.deepEqual(out.passed, [{ k, next: INTERVALS[n + 1] }]);
    else assert.deepEqual(out.done, [k]);
  }
  assert.deepEqual(gaps, [1, 3, 7, 21]);
  assert.equal(entryByKey(S, k), null, "after the fourth review the entry has done its work");
  assert.equal(day, addDays(D0, 32));
  const st = patternReviewStats(S, day).thf_thgf;
  assert.deepEqual([st.added, st.passed, st.onTime, st.learned, st.waiting], [1, 4, 4, 1, 0]);
});

test("a right answer on an entry that is not due yet changes nothing", () => {
  const S = blankState();
  noteReview(S, cloze(), J(false), D0);
  const before = copy(S.review);
  /* the same afternoon: short-term memory, not a review */
  const out = noteReview(S, cloze(), J(true), D0);
  assert.deepEqual(S.review, before);
  assert.deepEqual(out, { added: null, lapsed: [], passed: [], done: [] });
});

test("a wrong answer on an entry starts it again at one day", () => {
  const S = blankState();
  noteReview(S, cloze(), J(false), D0);
  const k = S.review.items[0].k;
  noteReview(S, cloze(), J(true), addDays(D0, 1));           // → stage 1, due +3
  noteReview(S, cloze(), J(true), addDays(D0, 4));           // → stage 2, due +7
  assert.equal(entryByKey(S, k).s, 2);
  const day = addDays(D0, 6);                                 // missed again, before it was even due
  const out = noteReview(S, cloze(), J(false), day);
  const e = entryByKey(S, k);
  assert.deepEqual(out.lapsed, [k]);
  assert.equal(out.added, null, "the same entry, not a second one");
  assert.deepEqual([e.s, e.due, e.l, e.ok, e.add], [0, addDays(day, 1), 2, 2, D0]);
  assert.equal(S.review.items.length, 1);
});

test("a review done late counts from the day it was done, and is on time within two days", () => {
  const S = blankState();
  noteReview(S, cloze(), J(false, { p: "ef" }), D0);
  const k = S.review.items[0].k;
  noteReview(S, cloze(), J(true), addDays(D0, 3));           // due +1, done +3: two days late
  assert.equal(entryByKey(S, k).due, addDays(D0, 6));
  assert.equal(patternReviewStats(S, D0).ef.onTime, 1);
  noteReview(S, cloze(), J(true), addDays(D0, 20));          // due +6, done +20
  assert.equal(entryByKey(S, k).due, addDays(D0, 27));
  const st = patternReviewStats(S, D0).ef;
  assert.deepEqual([st.passed, st.onTime], [2, 1]);
});

test("an answer that is neither right nor wrong does not touch the queue", () => {
  const S = blankState();
  noteReview(S, cloze(), J(null), D0);
  noteReview(S, { type: "meaning", typeId: "meaning", skill: "ordaford", word: "hestur|kk" }, J(null), D0);
  assert.deepEqual(S.review, blankReview());
});

/* ========================================================================
 * 2. What is one entry
 * ====================================================================== */

test("the same word in the same cell is one entry, whatever shape the question had", () => {
  const S = blankState();
  noteReview(S, cloze("ÞGFFT", "hestur|kk", "fill"), J(false, { p: "thf_thgf" }), D0);
  noteReview(S, { type: "choice", typeId: "no_val", skill: "nafnord", cell: "ÞGFFT", word: "hestur|kk" },
    J(false, { p: "ef" }), D0);
  assert.equal(S.review.items.length, 1);
  const e = S.review.items[0];
  /* …and it now names the latest miss: that is the question to ask. */
  assert.deepEqual([e.t, e.p, e.l], ["no_val", "ef", 2]);
  /* another word, or another cell, is another entry */
  noteReview(S, cloze("ÞGFFT", "bók|kvk"), J(false), D0);
  noteReview(S, cloze("EFFT", "hestur|kk"), J(false), D0);
  assert.equal(S.review.items.length, 3);
  /* recognising the form is not producing it */
  noteReview(S, { type: "parse", typeId: "parse", skill: "greining", cell: "ÞGFFT", word: "hestur|kk" }, J(false), D0);
  assert.equal(S.review.items.length, 4);
  assert.notEqual(keyFor({ t: "parse", c: "ÞGFFT", w: "hestur|kk" }), keyFor({ t: "fill", c: "ÞGFFT", w: "hestur|kk" }));
  assert.equal(keyFor({ t: "tbl_no", c: "ÞGFFT", w: "hestur|kk" }), keyFor({ t: "fill", c: "ÞGFFT", w: "hestur|kk" }));
});

test("a question with no word is its type and cell; a hunt is its type and pattern; an item is itself", () => {
  const S = blankState();
  const syn = { type: "syntax", typeId: "syntax", skill: "setningafraedi", cell: "setn:andlag", word: null };
  noteReview(S, syn, J(false, { p: "setningalidir" }), D0);
  noteReview(S, syn, J(false, { p: "setningalidir" }), D0);
  noteReview(S, { ...syn, typeId: "setn_hlut", type: "choice" }, J(false, { p: "setningalidir" }), D0);
  assert.deepEqual(S.review.items.map((e) => [e.t, e.c, e.l]),
    [["syntax", "setn:andlag", 2], ["setn_hlut", "setn:andlag", 1]]);

  const hunt = { type: "villur", typeId: "villur", skill: "malbeiting", cell: "villur" };
  noteReview(S, hunt, J(false, { p: "kyn_samraemi" }), D0);
  noteReview(S, hunt, J(false, { p: "kyn_samraemi" }), D0);
  noteReview(S, hunt, J(false, { p: "fallstjorn_fs" }), D0);
  assert.deepEqual(S.review.items.filter((e) => e.t === "villur").map((e) => [e.p, e.c, e.l]),
    [["kyn_samraemi", null, 2], ["fallstjorn_fs", null, 1]]);

  const flt = (item) => ({ type: "gap", typeId: "to_flt", skill: "toluord", cell: "to:fleirtoluord", word: null, item });
  noteReview(S, flt("p2:Ég keypti ___ buxur í gær."), J(false, { p: "fleirtoluord" }), D0);
  noteReview(S, flt("p3:Ég keypti ___ buxur í gær."), J(false, { p: "fleirtoluord" }), D0);
  assert.equal(S.review.items.filter((e) => e.t === "to_flt").length, 2);
});

test("a table is one answer and makes one entry: its first wrong cell", () => {
  const S = blankState();
  const tbl = { type: "table", typeId: "tbl_no", skill: "nafnord", word: "hestur|kk" };
  const recs = [["NFFT", true], ["ÞFFT", false], ["ÞGFFT", false], ["EFFT", true]]
    .map(([cell, ok]) => ({ cell, word: "hestur|kk", ok }));
  const a = readAnswer(tbl, J(false, { recs }));
  assert.equal(a.miss.c, "ÞFFT");
  assert.equal(a.wrong.length, 2);
  assert.equal(a.right.length, 2);
  noteReview(S, tbl, J(false, { recs }), D0);
  assert.deepEqual(S.review.items.map((e) => [e.t, e.c, e.w]), [["tbl_no", "ÞFFT", "hestur|kk"]]);

  /* A cell of the table that already has an entry: wrong starts it again;
     right, once it is due, passes it. */
  noteReview(S, cloze("EFFT", "hestur|kk"), J(false), D0);
  const again = recs.map((r) => ({ ...r, ok: r.cell === "EFFT" }));
  const out = noteReview(S, tbl, J(false, { recs: again }), addDays(D0, 1));
  assert.deepEqual(out.passed.map((x) => x.k), [keyFor({ t: "fill", c: "EFFT", w: "hestur|kk" })]);
  assert.deepEqual(out.lapsed, [keyFor({ t: "fill", c: "ÞFFT", w: "hestur|kk" })]);
  assert.equal(S.review.items.length, 3, "and the table's first wrong cell this time is a new entry");
});

test("a real answer goes through settle: judged wrong it is queued, judged right when due it moves out", () => {
  const p = pupil();
  const spec = typeById("verb");
  const b = spec.build(lex, view(p), seeded(5));
  const t = b.task; t.typeId = "verb";
  const wrong = judge(t, { text: "xqzzy" }, p);
  assert.equal(wrong.ok, false);
  const fin = settle(p.S, p.sess, t, wrong, { ms: 0 });
  const today = todayKey();
  assert.equal(p.S.review.items.length, 1);
  const e = p.S.review.items[0];
  assert.deepEqual([e.t, e.c, e.w, e.due], ["verb", t.cell, t.word, addDays(today, 1)]);
  assert.equal(fin.review.added, e.k, "`settle` says what happened in the queue");
  assert.ok(e.p === null || chancesIn(t).includes(e.p) || typeof e.p === "string");

  /* right the same day: nothing */
  const right = judge(t, { text: t.answers[0] }, p);
  assert.equal(right.ok, true);
  assert.deepEqual(settle(p.S, p.sess, t, right, { ms: 0 }).review.passed, []);
  /* due today: it moves out three days */
  e.due = today;
  const fin2 = settle(p.S, p.sess, t, right, { ms: 0 });
  assert.deepEqual(fin2.review.passed, [{ k: e.k, next: 3 }]);
  assert.deepEqual([e.s, e.due], [1, addDays(today, 3)]);
  assert.equal(reviewLine(fin2.review), "Upprifjun tókst. Þetta kemur aftur eftir 3 daga.");
});

test("the line under a passed review: the days in the right number, and nothing when nothing moved", () => {
  assert.equal(reviewLine({ passed: [{ k: "a", next: 7 }], done: [] }), "Upprifjun tókst. Þetta kemur aftur eftir 7 daga.");
  assert.equal(reviewLine({ passed: [{ k: "a", next: 21 }], done: [] }), "Upprifjun tókst. Þetta kemur aftur eftir 21 dag.");
  assert.equal(reviewLine({ passed: [], done: ["a"] }), "Upprifjun lokið — þetta kanntu núna.");
  assert.equal(reviewLine({ added: "a", lapsed: [], passed: [], done: [] }), "");
  assert.equal(reviewLine(null), "");
});

/* ========================================================================
 * 3. Which reviews, and how many
 * ====================================================================== */

const entry = (n, over = {}) => ({
  k: "f:mynd|ÞGFFT|orð" + n + "|hk", t: "fill", sk: "nafnord", p: "thf_thgf", c: "ÞGFFT",
  w: "orð" + n + "|hk", i: null, s: 0, due: D0, add: "2026-11-01", last: "2026-11-01", l: 1, ok: 0, ...over,
});

test("due entries: the lowest stage first, then the one that fell due most recently", () => {
  const S = blankState();
  S.review.items = [
    entry(1, { s: 2, due: "2026-11-10" }),
    entry(2, { s: 0, due: "2026-11-09" }),
    entry(3, { s: 0, due: "2026-11-16" }),
    entry(4, { s: 1, due: "2026-11-15" }),
    entry(5, { s: 0, due: "2026-11-17" }),            // tomorrow: not due
    entry(6, { s: 0, due: "2026-11-16", l: 3 }),      // same day as 3, missed more often
  ];
  assert.deepEqual(dueEntries(S, D0).map((e) => e.w), ["orð6|hk", "orð3|hk", "orð2|hk", "orð4|hk", "orð1|hk"]);
  assert.equal(dueCount(S, D0), 5);
  assert.equal(dueCount(S, new Date(2026, 10, 16, 23, 30)), 5, "a Date is read as its local day");
  assert.equal(dayOf(new Date(2026, 10, 16, 0, 5)), D0);
  assert.equal(dueCount(S, "2026-11-17"), 6);
  assert.equal(dueCount(S, D0, (e) => e.s === 0), 3, "only what this pupil may be asked");
  assert.deepEqual(reviewSummary(S, D0), { waiting: 6, due: 5, next: "2026-11-09" });
});

test("a session opens with up to three reviews, and never more than a third of it", () => {
  assert.equal(OPENING_MAX, 3);
  assert.deepEqual([0, 1, 3, 5, 6, 10, 15, 20].map(openingSize), [0, 1, 1, 2, 2, 3, 3, 3]);
  const S = blankState();
  S.review.items = [1, 2, 3, 4, 5].map((n) => entry(n));
  assert.equal(openingReviews(S, D0, 10).length, 3);
  assert.equal(openingReviews(S, D0, 5).length, 2);
  S.review.items = [entry(1), entry(2, { due: "2026-11-17" })];
  assert.equal(openingReviews(S, D0, 10).length, 1, "only what is due");
});

test("stale entries expire, and a full queue gives up what is furthest along", () => {
  const S = blankState();
  S.review.items = [
    entry(1, { due: addDays(D0, -STALE_DAYS) }),
    entry(2, { due: addDays(D0, -STALE_DAYS - 1) }),
  ];
  assert.equal(dueCount(S, D0), 1, "a stale entry is not counted even before it is dropped");
  const dropped = tidyReview(S, D0);
  assert.deepEqual(dropped.map((e) => e.w), ["orð2|hk"]);
  assert.deepEqual(S.review.items.map((e) => e.w), ["orð1|hk"]);
  assert.equal(patternReviewStats(S, D0).thf_thgf.dropped, 1);

  S.review.items = [];
  for (let n = 0; n < REVIEW_MAX; n++)
    S.review.items.push(entry(n, { s: n < 3 ? 3 : 0, due: addDays(D0, 5), last: n === 1 ? "2026-10-01" : "2026-11-10" }));
  noteReview(S, cloze("EFET", "nýtt|hk"), J(false), D0);
  assert.equal(S.review.items.length, REVIEW_MAX, "held to its size");
  assert.ok(entryByKey(S, keyFor({ t: "fill", c: "EFET", w: "nýtt|hk" })), "the new miss is in");
  assert.equal(entryByKey(S, entry(1).k), null, "the stage-3 entry untouched for longest made room");
  assert.ok(entryByKey(S, entry(0).k) && entryByKey(S, entry(2).k));
});

test("figures per error pattern and per category, for the screens that will show them", () => {
  const S = blankState();
  noteReview(S, cloze("ÞGFFT", "hestur|kk"), J(false, { p: "thf_thgf" }), D0);
  noteReview(S, cloze("EFFT", "hestur|kk"), J(false, { p: "ef" }), D0);
  noteReview(S, { type: "verb", typeId: "verb", skill: "sagnord", cell: "GM-FH-ÞT-1P-ET", word: "fara|so" },
    J(false, { p: "tid" }), D0);
  noteReview(S, cloze("ÞGFFT", "hestur|kk"), J(true), addDays(D0, 1));
  const day = addDays(D0, 1);
  const byP = patternReviewStats(S, day);
  assert.deepEqual(byP.thf_thgf, { waiting: 1, due: 0, added: 1, lapsed: 0, passed: 1, onTime: 1, learned: 0, dropped: 0 });
  assert.deepEqual(byP.ef, { waiting: 1, due: 1, added: 1, lapsed: 0, passed: 0, onTime: 0, learned: 0, dropped: 0 });
  const byS = skillReviewStats(S, day);
  assert.deepEqual([byS.nafnord.waiting, byS.nafnord.due, byS.nafnord.added, byS.nafnord.passed], [2, 1, 2, 1]);
  assert.deepEqual([byS.sagnord.waiting, byS.sagnord.due], [1, 1]);
  assert.deepEqual(patternReviewStats(blankState(), day), {});
});

test("a pattern can be queued without a miss, and is asked as a question that tests it", () => {
  const p = pupil(3);
  const k = queuePattern(p.S, { p: "thf_thgf", t: "fill", sk: "nafnord" }, addDays(D0, -1));
  assert.equal(queuePattern(p.S, { p: "thf_thgf", t: "fill", sk: "nafnord" }, D0), k, "once");
  assert.equal(p.S.review.items.length, 1);
  assert.deepEqual([entryByKey(p.S, k).due, entryByKey(p.S, k).l], [D0, 0]);
  assert.equal(patternReviewStats(p.S, D0).thf_thgf.due, 1);
  const b = reviewTask(lex, view(p), seeded(2), entryByKey(p.S, k));
  assert.deepEqual([b.hit, b.task.typeId, b.task.review], ["pattern", "fill", k]);
  assert.ok(chancesIn(b.task).includes("thf_thgf"));
  /* answered right as that review, it moves out like any other */
  noteReview(p.S, b.task, J(true), D0);
  assert.deepEqual([entryByKey(p.S, k).s, entryByKey(p.S, k).due], [1, addDays(D0, 3)]);
});

/* ========================================================================
 * 4. Forced builds: the entry's own question, with its cell and word
 * ====================================================================== */

/* The types whose builders know the hook: asked for a cell and a word they
   have just built, they build exactly that again. */
const HOOKED = ["fill", "no_val", "fs_fsno", "verb", "verbslot", "revform",
  "tbl_no", "tbl_lo", "tbl_so", "tbl_fn", "tbl_to",
  "lo_beyging", "lo_stig", "lo_samr", "to_samr", "to_val"];

const entryOf = (t, id) => {
  const c = t.type === "table" ? askedCells(t)[askedCells(t).length - 1].m : t.cell;
  const e = { t: id, sk: t.skill, p: null, c, w: t.word || null, i: t.item || null };
  return { ...e, k: keyFor(e) };
};

test("a review of a word in a cell is built as that word in that cell", () => {
  for (const id of HOOKED) {
    const spec = typeById(id);
    let asked = 0;
    for (const band of [1, 3, 5]) {
      const p = pupil(band);
      for (let seed = 0; seed < 12; seed++) {
        const first = spec.build(lex, view(p), seeded(900 + seed));
        if (!first) continue;
        const e = entryOf(first.task, id);
        const b = reviewTask(lex, view(p), seeded(40 + seed), e);
        assert.ok(b, `${id}: nothing built for ${e.c} of ${e.w}`);
        asked++;
        assert.equal(b.hit, "both", `${id}: ${e.c} of ${e.w} came back as "${b.hit}"`);
        assert.equal(b.task.word, e.w, id);
        if (b.task.type === "table") assert.ok(b.task.cells.some((c) => c.m === e.c), `${id}: the table has the cell`);
        else assert.equal(b.task.cell, e.c, id);
        assert.equal(b.task.typeId, id);
        assert.equal(b.task.review, e.k, "tied to its entry");
        assert.ok(!b.task.answers || b.task.answers.length, `${id}: has an answer`);
        /* and the answer is the word's own form in that cell, straight from BÍN */
        if (["fill", "verb", "verbslot"].includes(id)) {
          const [lemma, cls] = e.w.split("|");
          assert.deepEqual(b.task.answers, lex.lookup(lemma, cls).forms[e.c], id);
        }
      }
    }
    assert.ok(asked >= 10, `${id}: too few to say anything (${asked})`);
  }
});

test("asked for a cell only, a builder that knows the hook builds that cell or nothing", () => {
  const cells = { fill: "ÞGFFTgr", no_val: "EFET", fs_fsno: "ÞGFET", verb: "GM-VH-ÞT-2P-FT",
    verbslot: "GM-FH-ÞT-3P-FT", tbl_no: "EFFTgr", tbl_lo: "MST-KVK-ÞGFFT", tbl_so: "GM-VH-ÞT-1P-FT",
    tbl_fn: "KVK-ÞGFFT", tbl_to: "HK-EFFT", lo_beyging: "FVB-KK-ÞGFET", lo_stig: "ESB-KK-NFFT", lo_samr: "FSB-KVK-ÞGFET",
    to_samr: "to:KVK-ÞGFFT", to_val: "to:HK-ÞFFT", to_dags: "to:dags-EF", revform: "ÞGFFT",
    syntax: "setn:sagnfylling", setn_hlut: "setn:andlag" };
  for (const [id, cell] of Object.entries(cells)) {
    const spec = typeById(id);
    const p = pupil(1);                     // þyngd 1: the review does not wait for the difficulty
    let made = 0;
    for (let seed = 0; seed < 25; seed++) {
      const b = spec.build(lex, view(p, { force: { cell } }), seeded(seed));
      if (!b) continue;
      made++;
      if (b.task.type === "table") assert.ok(b.task.cells.some((c) => c.m === cell), `${id}: another table`);
      else assert.equal(b.task.cell, cell, `${id}: built another cell`);
    }
    /* no_val needs a noun with two other forms to offer beside the right
       one, so it turns down most nouns in the genitive — as it always did. */
    assert.ok(made >= (id === "no_val" ? 3 : 15), `${id}: ${cell} was built only ${made} times of 25`);
  }
  /* a cell that does not exist is nothing — never some other question */
  for (const id of Object.keys(cells))
    for (let seed = 0; seed < 5; seed++)
      assert.equal(typeById(id).build(lex, view(pupil(3), { force: { cell: "XX-ekki-til" } }), seeded(seed)), null, id);
});

test("a review for a plural table cell is built every time: the noun is chosen among those that have the cell", () => {
  /* Singular-only nouns (friður, áhugi) are about two fifths of the pool and
     common words are drawn first, so a noun picked at random before the cell
     was known gave no plural table in many draws. Nouns that have the cell
     exist, so nothing here may be null. */
  for (const cell of ["EFFTgr", "NFFT", "ÞGFFT"]) {
    for (let seed = 0; seed < 40; seed++) {
      const b = typeById("tbl_no").build(lex, view(pupil(1), { force: { cell } }), seeded(seed));
      assert.ok(b, `${cell}: nothing built at seed ${seed}`);
      assert.ok(b.task.cells.some((c) => c.m === cell), `${cell}: another column`);
      assert.ok(!b.task.w.np, `${cell}: ${b.task.w.o} has no plural`);
    }
  }
});

test("a forced cloze is the bare noun in a sentence that takes it, and not the sentence just missed", () => {
  const p = pupil(4);
  p.S.enabled.lysingarord = true; p.S.enabled.fornofn = true;
  const hestur = lex.lookup("hestur", "kk");
  const e = { t: "fill", c: "ÞGFFT", w: wordKey(hestur.o, hestur.c), p: null, k: "x" };
  const sentences = new Set();
  for (let seed = 0; seed < 40; seed++) {
    const b = reviewTask(lex, view(p), seeded(seed), e);
    assert.equal(b.hit, "both");
    assert.deepEqual(b.task.answers, hestur.forms["ÞGFFT"]);
    assert.equal(b.task.extra, undefined, "no adjective or *þessi* beside a review");
    assert.equal(b.task.skill, "nafnord");
    sentences.add(b.task.s.t);
  }
  assert.ok(sentences.size >= 3, "not one sentence over and over");
  const avoid = [...sentences][0];
  for (let seed = 0; seed < 40; seed++)
    assert.notEqual(reviewTask(lex, view(p), seeded(seed), e, { avoid }).task.s.t, avoid);
});

test("every type can be reviewed: the same cell where the type has few, else the same type and pattern", () => {
  const hits = {};
  for (const spec of TASKS) {
    if (spec.id === "meaning") continue;            // has no wrong answer, so never an entry
    const p = pupil(3);
    for (let seed = 0; seed < 6; seed++) {
      const first = spec.build(lex, view(p), seeded(500 + seed));
      if (!first) continue;
      first.task.typeId = spec.id;
      const pats = chancesIn(first.task);
      const e = { ...entryOf(first.task, spec.id), p: pats[0] || null };
      const b = reviewTask(lex, view(p), seeded(seed), e);
      assert.ok(b, `${spec.id}: no review could be built`);
      assert.equal(b.task.typeId, spec.id, "always the type that was missed");
      assert.equal(b.task.review, e.k);
      (hits[spec.id] ||= []).push(b.hit);
      if (b.hit === "pattern") assert.ok(chancesIn(b.task).includes(e.p), `${spec.id}: the fall-back tests the pattern`);
      if (b.hit === "cell" || b.hit === "both") assert.ok(b.task.cell === e.c || b.task.type === "table");
    }
  }
  /* The types with a handful of cells find theirs without a hook. */
  for (const id of ["syntax", "clause", "umritun", "indecl", "setn_hlut", "gerd_finna", "to_dags", "fn_aftur"])
    assert.ok(hits[id].every((h) => h === "cell" || h === "both"), `${id}: ${hits[id]}`);
  /* A hunt tests several words at once: the same type and pattern is all there is. */
  assert.ok(hits.villur.every((h) => h === "pattern" || h === "cell"), String(hits.villur));
});

test("where the entry cannot be honoured: the same type and pattern, or nothing — never another type", () => {
  const p = pupil(3);
  /* a word that is not in the lexicon, in a cell no noun has */
  const lost = { t: "fill", c: "ekki-til", w: "ekkitil|kk", p: "thf_thgf", k: "x" };
  const b = reviewTask(lex, view(p), seeded(1), lost);
  assert.ok(b);
  assert.equal(b.hit, "pattern");
  assert.equal(b.task.typeId, "fill");
  assert.ok(chancesIn(b.task).includes("thf_thgf"), "a cloze in the accusative or dative");
  /* a pattern the type never tests */
  assert.equal(reviewTask(lex, view(p), seeded(1), { ...lost, p: "setningagerd" }), null);
  /* a type that is switched off, or that no longer exists */
  const noNouns = narrowPolicy(POLICY, { skills: ["sagnord"], types: null });
  assert.equal(reviewTask(lex, view(p, { policy: noNouns }), seeded(1),
    { t: "fill", c: "ÞGFFT", w: "hestur|kk", p: null, k: "x" }), null);
  assert.equal(reviewTask(lex, view(p), seeded(1), { t: "horfin_tegund", c: null, w: null, p: null, k: "x" }), null);
});

test("building a review changes nothing; the same seed builds the same review", () => {
  const p = pupil(3);
  noteReview(p.S, cloze("ÞGFFT", "hestur|kk"), J(false), addDays(D0, -1));
  const e = p.S.review.items[0];
  const before = copy(p);
  const a = reviewTask(lex, view(p), seeded(11), e);
  const b = reviewTask(lex, view(p), seeded(11), e);
  assert.deepEqual(copy(p), before);
  assert.deepEqual(copy(a.task), copy(b.task));
  assert.ok(a.effects.some((x) => x.op === "since") && a.effects.some((x) => x.op === "seen"),
    "it tells the session what every question tells it");
});

/* ========================================================================
 * 5. A session: it opens with what is due; a missed noun comes back later
 * ====================================================================== */

/** A session as control/session.js `pickTask` runs it, with `answer(task, i)` → right? */
function session(p, n, answer, { today = D0, rng = seeded(77), topic = null, focus = null } = {}) {
  const policy = topic ? narrowPolicy(POLICY, { skills: [topic], types: null }) : POLICY;
  const run = { n, i: 0, items: [], review: planOpening(p.S, today, n, policy, focus), reask: [] };
  const host = { S: p.S, sess: p.sess, forcedNoun: null };
  const asked = [];
  while (run.i < n) {
    const counts = {};
    run.items.forEach((it) => { counts[it.type] = (counts[it.type] || 0) + 1; });
    const v = makeView({ S: p.S, sess: p.sess, policy, today, mix: { n, counts }, inRun: true });
    const rv = withView(v, { mix: null });
    const b = nextOpening(lex, rv, rng, run)
      || nextReask(lex, rv, rng, run, (counts.fill || 0) + 1 <= maxOf("fill", n))
      || nextTask(lex, v, rng);
    assert.ok(b, "the session ran dry");
    applyEffects(host, b.effects);
    const t = b.task;
    const ok = answer(t, run.i);
    if (!ok) scheduleReask(run, t, rng);
    const recs = t.type === "table" ? t.cells.map((c, k) => ({ cell: c.m, word: t.word, ok: ok || k > 0 })) : [];
    noteReview(p.S, t, J(ok, { recs }), today);
    run.items.push({ type: t.typeId || t.type });
    asked.push({ t, ok, i: run.i });
    run.i++;
  }
  return asked;
}

test("a session opens with the entries that are due, built with their cell and word", () => {
  const p = pupil(3);
  const yesterday = addDays(D0, -1);
  const missed = [
    cloze("ÞGFFT", "hestur|kk"),
    { type: "verb", typeId: "verb", skill: "sagnord", cell: "GM-FH-ÞT-1P-ET", word: "fara|so" },
    { type: "gap", typeId: "to_samr", skill: "toluord", cell: "to:KVK-ÞFFT", word: "tveir|to" },
    { type: "table", typeId: "tbl_lo", skill: "lysingarord", word: "góður|lo" },
  ];
  missed.slice(0, 3).forEach((t) => noteReview(p.S, t, J(false), yesterday));
  noteReview(p.S, missed[3], J(false, { recs: [{ cell: "FSB-KVK-ÞGFET", word: "góður|lo", ok: false }] }), yesterday);
  noteReview(p.S, cloze("EFFT", "bók|kvk"), J(false), D0);         // missed today: not due
  assert.equal(dueCount(p.S, D0), 4);

  const asked = session(p, 10, () => true);
  const reviews = asked.filter((x) => x.t.review);
  assert.deepEqual(reviews.map((x) => x.i), [0, 1, 2], "the first three questions, and no more");
  for (const { t } of reviews) {
    assert.equal(t.reviewHit, "both");
    const e = [...missed.map((m, k) => (k < 3 ? [m.cell, m.word] : ["FSB-KVK-ÞGFET", m.word]))]
      .find(([, w]) => w === t.word);
    assert.ok(e, `${t.word} was not due`);
    if (t.type === "table") assert.ok(t.cells.some((c) => c.m === e[0]));
    else assert.equal(t.cell, e[0]);
  }
  /* which three of the four is the queue's business; if the numeral is among
     them, its answer is BÍN's form for that cell */
  const num = reviews.find((x) => x.t.typeId === "to_samr");
  if (num) assert.deepEqual(num.t.answers.map((f) => f.toLowerCase()), lex.lookup("tveir", "to").forms["KVK-ÞFFT"]);
  /* answered right: each moved out to three days; the fourth is still due */
  const moved = p.S.review.items.filter((e) => e.s === 1);
  assert.equal(moved.length, 3);
  moved.forEach((e) => assert.equal(e.due, addDays(D0, 3)));
  assert.equal(dueCount(p.S, D0), 1);
  /* …and it opens the next session */
  const next = session(p, 10, () => true, { rng: seeded(78) });
  assert.deepEqual(next.filter((x) => x.t.review).map((x) => x.i), [0]);
  assert.equal(dueCount(p.S, D0), 0);
});

test("a session on one category opens with that category's reviews; one aimed at a pattern, with that pattern's", () => {
  const p = pupil(3);
  const y = addDays(D0, -1);
  noteReview(p.S, cloze("ÞGFFT", "hestur|kk"), J(false, { p: "thf_thgf" }), y);
  noteReview(p.S, cloze("EFFT", "hestur|kk"), J(false, { p: "ef" }), y);
  noteReview(p.S, { type: "verb", typeId: "verb", skill: "sagnord", cell: "GM-FH-ÞT-1P-ET", word: "fara|so" },
    J(false, { p: "tid" }), y);
  const verbs = narrowPolicy(POLICY, { skills: ["sagnord"], types: null });
  assert.deepEqual(planOpening(p.S, D0, 10, verbs).map((k) => entryByKey(p.S, k).t), ["verb"]);
  assert.equal(planOpening(p.S, D0, 10, POLICY).length, 3);
  assert.deepEqual(planOpening(p.S, D0, 10, POLICY, ["ef"]).map((k) => entryByKey(p.S, k).c), ["EFFT"]);
  /* asked in a session on Sagnorð, the opening is a verb and the rest stays put */
  const asked = session(p, 10, () => true, { topic: "sagnord" });
  assert.deepEqual(asked.filter((x) => x.t.review).map((x) => x.t.typeId), ["verb"]);
  assert.equal(dueCount(p.S, D0), 2);
});

test("a review answered wrong starts again; one that cannot be built waits in the queue", () => {
  const p = pupil(3);
  const y = addDays(D0, -4);
  noteReview(p.S, cloze("ÞGFFT", "hestur|kk"), J(false), y);
  noteReview(p.S, cloze("ÞGFFT", "hestur|kk"), J(true), addDays(y, 1));     // stage 1, due y+4 = today
  p.S.review.items.push({ ...entry(9), t: "horfin_tegund", k: "c:horfin_tegund|x", due: D0 });
  const asked = session(p, 10, (t) => !t.review);
  assert.equal(asked.filter((x) => x.t.review).length, 1);
  const e = entryByKey(p.S, keyFor({ t: "fill", c: "ÞGFFT", w: "hestur|kk" }));
  assert.deepEqual([e.s, e.due, e.l], [0, addDays(D0, 1), 2]);
  assert.ok(entryByKey(p.S, "c:horfin_tegund|x"), "left alone, not dropped and not asked as something else");
});

test("item 19: after a wrong cloze the noun is not the next question; it comes back 3–5 questions on", () => {
  assert.deepEqual(REASK_GAP, [3, 5]);
  /* the rule itself */
  const g = seeded(3);
  const seen = new Set();
  for (let k = 0; k < 200; k++) {
    const at = reaskAt(2, 20, g);
    seen.add(at - 2);
  }
  assert.deepEqual([...seen].sort(), [3, 4, 5]);
  assert.equal(reaskAt(7, 10, () => 0.99), null, "two questions left: not this session");
  assert.equal(reaskAt(6, 10, () => 0.99), 9, "three left: as the last question");
  assert.equal(reaskAt(5, 10, () => 0), 8);
  assert.equal(reaskAt(9, 10, () => 0), null);

  /* in sessions: miss the first plain cloze that comes, answer everything else right */
  let checked = 0, sameCell = 0;
  /* Can some other sentence show this noun in this cell? */
  const elsewhere = (n, cell, not) => lex.sentences.some((s) => s.t !== not && s.slot != null && !s.nf
    && s.tok[s.slot].m === cell
    && (substitutable(s)
      ? acceptsNoun({ rk: s.rk, need: s.need, ps: s.ps || null }, n, cell) && !repeatsNoun(s, s.slot, n)
      : s.tok[s.slot].l === n.o));
  for (let seed = 0; seed < 60; seed++) {
    const p = pupil(3);
    let missed = null;
    const asked = session(p, 15, (t, i) => {
      if (!missed && t.type === "fill" && !t.noRepeat && !t.reask && i <= 9) { missed = { t, i }; return false; }
      return true;
    }, { rng: seeded(600 + seed) });
    if (!missed) continue;
    const next = asked[missed.i + 1].t;
    assert.ok(!(next.type === "fill" && next.word === missed.t.word), "the very next question is another one");
    const back = asked.filter((x) => x.t.reask);
    const shareLeft = asked.slice(0, missed.i + 6).filter((x) => x.t.typeId === "fill").length < maxOf("fill", 15);
    if (!back.length) { assert.ok(!shareLeft, "only the mix rule may let it go"); continue; }
    checked++;
    assert.equal(back.length, 1);
    const gap = back[0].i - missed.i;
    assert.ok(gap >= 3 && gap <= 5, `came back after ${gap}`);
    assert.equal(back[0].t.word, missed.t.word, "the same noun");
    /* In the cell that was missed — where another sentence can show the noun
       in it. Where none can, the same noun in another cell (tasks/review.js
       nextReask). Since v6.13 (item 30) that happens: the genitive plural of
       a time word had "Þetta gengur ekki án ___" as its second sentence, and
       "án mánaða" is not asked any more. */
    if (elsewhere(missed.t.n, missed.t.cell, missed.t.s.t)) {
      sameCell++;
      assert.equal(back[0].t.cell, missed.t.cell, "in the cell that was missed");
    }
    assert.notEqual(back[0].t.s.t, missed.t.s.t, "in another sentence");
    assert.equal(back[0].t.review, undefined, "the repeat within a session is not the review");
    /* …and once more through the queue the next day: the right answer the
       same day did not move the entry */
    const e = entryByKey(p.S, keyFor({ t: "fill", c: missed.t.cell, w: missed.t.word }));
    assert.deepEqual([e.s, e.due], [0, addDays(D0, 1)]);
    const tomorrow = session(p, 10, () => true, { today: addDays(D0, 1), rng: seeded(seed) });
    assert.equal(tomorrow[0].t.review, e.k);
    assert.equal(tomorrow[0].t.word, missed.t.word);
  }
  assert.ok(checked >= 15, `too few sessions to say anything (${checked})`);
  /* A share, over sixty sessions: an absolute allowance over thirty moved
     with every question type added to the catalogue (a new type changes what
     a seed draws). Measured over 120 sessions: 94–97% in the same cell. */
  assert.ok(sameCell >= Math.ceil(checked * 0.85),
    `the same cell is the rule, another cell the exception (${sameCell} of ${checked})`);
});

test("item 19: the renderer no longer makes the missed noun the next question", () => {
  const src = readFileSync(new URL("../src/js/ui/render.js", import.meta.url), "utf8");
  assert.ok(!/app\.forcedNoun\s*=/.test(src), "ui/render.js still sets app.forcedNoun");
  assert.ok(!src.includes("Næst kemur sama orð"), "and still says so");
  assert.ok(src.includes("app.planReask"));
  /* a cloze asked for Fallstjórn does not bring its noun back as a Nafnorð question */
  const run = { n: 10, i: 2 };
  assert.equal(scheduleReask(run, { type: "fill", noRepeat: true, word: "hestur|kk", cell: "ÞGFFT" }, () => 0), false);
  assert.equal(scheduleReask(run, { type: "verb", word: "fara|so", cell: "x" }, () => 0), false);
  assert.equal(scheduleReask(run, { type: "fill", word: "hestur|kk", cell: "ÞGFFT", s: { t: "S." } }, () => 0), true);
  assert.deepEqual(run.reask, [{ at: 5, w: "hestur|kk", c: "ÞGFFT", avoid: "S." }]);
});

/* ========================================================================
 * 6. Item 20: the numeral items are grammar, not vocabulary
 * ====================================================================== */

test("item 20: to_samr and to_flt write nothing to the vocabulary record and wait for nothing", () => {
  for (const id of ["to_samr", "to_flt"]) {
    const spec = typeById(id);
    const p = pupil(3);
    const host = { S: p.S, sess: p.sess, forcedNoun: null };
    const pool = id === "to_samr" ? EX.numeralAgree : EX.pluralOnly;
    const shown = [];
    for (let seed = 0; seed < 30; seed++) {
      const b = spec.build(lex, view(p), seeded(seed));
      assert.ok(b, `${id}: nothing built`);
      assert.deepEqual(b.effects.map((e) => e.op), ["exSeen"], `${id}: remembered by the session, and nothing else`);
      applyEffects(host, b.effects);
      shown.push(b.effects[0].key);
    }
    assert.deepEqual(p.S.vocab, {}, `${id}: the vocabulary record is not theirs`);
    assert.ok(!Object.keys(p.S.vocab).some((k) => k.startsWith("samhengi:")));
    /* the short gate: within a visit no item twice while others are left */
    assert.equal(new Set(shown).size, Math.min(30, pool.length), `${id}: an item was repeated within the visit`);
    /* …and the next day (a new visit) the same items may come again: no week's wait */
    const p2 = { S: p.S, sess: newSession(p.S) };
    Object.keys(p2.sess.diff).forEach((k) => { p2.sess.diff[k] = 3; });
    const again = new Set();
    for (let seed = 0; seed < 60; seed++) {
      const b = spec.build(lex, view(p2, { today: addDays(D0, 1) }), seeded(seed));
      assert.ok(b, `${id}: locked the day after`);
      again.add(b.effects[0].key);
    }
    assert.ok([...again].some((k) => shown.includes(k)), `${id}: yesterday's items are still locked`);
  }
});

test("item 20: every numeral item can be reached at þyngd 1, whatever a frequency rank would say", () => {
  const p = pupil(1);
  const host = { S: p.S, sess: p.sess, forcedNoun: null };
  const seen = new Set();
  for (let seed = 0; seed < EX.pluralOnly.length; seed++) {
    const b = typeById("to_flt").build(lex, view(p), seeded(seed));
    applyEffects(host, b.effects);
    seen.add(b.task.item);
  }
  assert.equal(seen.size, EX.pluralOnly.length, "each plural-only item once before any comes twice");
  /* the source no longer goes through the vocabulary gate, with its key and its rank */
  const src = readFileSync(new URL("../src/js/tasks/toluord.js", import.meta.url), "utf8");
  assert.ok(!/pickVocab\s*\(/.test(src), "tasks/toluord.js still calls pickVocab");
  assert.ok(!src.includes("y.a.o"), "the rank was looked up on the list of answers");
  /* to_samr: the genitive still waits for þyngd 2 */
  for (let seed = 0; seed < 60; seed++)
    assert.notEqual(typeById("to_samr").build(lex, view(p), seeded(seed)).task.numeral.case, "EF");
});

test("item 20: a missed numeral item comes back through the queue — the form, and the very item", () => {
  const p = pupil(3);
  const y = addDays(D0, -1);
  /* to_samr: the numeral in its cell (tvær), with whatever noun */
  const a = typeById("to_samr").build(lex, view(p), seeded(4)).task; a.typeId = "to_samr";
  noteReview(p.S, a, J(false, { p: "kyn_samraemi" }), y);
  /* to_flt: the very sentence */
  const f = typeById("to_flt").build(lex, view(p), seeded(9)).task; f.typeId = "to_flt";
  noteReview(p.S, f, J(false, { p: "fleirtoluord" }), y);
  assert.deepEqual(p.S.review.items.map((e) => [e.t, e.c, e.w, e.i]),
    [["to_samr", a.cell, a.word, null], ["to_flt", "to:fleirtoluord", null, f.item]]);

  const asked = session(p, 10, () => true);
  const [ra, rf] = [asked[0].t, asked[1].t];
  assert.deepEqual([ra.typeId, ra.reviewHit, ra.cell, ra.word], ["to_samr", "both", a.cell, a.word]);
  assert.deepEqual(ra.answers.map((x) => x.toLowerCase()), a.answers.map((x) => x.toLowerCase()));
  assert.deepEqual([rf.typeId, rf.reviewHit, rf.item], ["to_flt", "item", f.item]);
  assert.equal(rf.s.t, f.s.t, "the same sentence");
  assert.deepEqual(rf.answers, f.answers);
  p.S.review.items.forEach((e) => assert.deepEqual([e.s, e.due], [1, addDays(D0, 3)]));
});

/* ========================================================================
 * 7. Saved, merged between two devices, accepted by the server
 * ====================================================================== */

test("an older state gets an empty queue; a saved queue survives a load unchanged", () => {
  assert.deepEqual(migrate({ xp: 10 }).review, blankReview());
  assert.deepEqual(blankState().review, blankReview());
  const S = blankState();
  noteReview(S, cloze(), J(false, { p: "thf_thgf" }), D0);
  noteReview(S, cloze("EFFT", "bók|kvk"), J(false), D0);
  noteReview(S, cloze(), J(true), addDays(D0, 1));
  const back = migrate(copy(S));
  assert.deepEqual(back.review, S.review);
  /* nonsense is dropped, not loaded */
  assert.deepEqual(migrate({ review: "x" }).review, blankReview());
  assert.deepEqual(migrate({ review: { items: [null, 3, { k: "a" }, { k: "b", t: "fill", due: "soon" }] } }).review, blankReview());
});

test("two devices: every miss on either is in the merged queue, once", () => {
  const B = blankState();
  noteReview(B, cloze("ÞGFFT", "hestur|kk"), J(false, { p: "thf_thgf" }), D0);
  const phone = copy(B), laptop = copy(B);
  noteReview(phone, cloze("EFFT", "bók|kvk"), J(false, { p: "ef" }), addDays(D0, 1));
  noteReview(laptop, { type: "verb", typeId: "verb", skill: "sagnord", cell: "GM-FH-ÞT-1P-ET", word: "fara|so" },
    J(false, { p: "tid" }), addDays(D0, 1));
  const M = mergeStates(B, phone, laptop);
  assert.deepEqual(M.review.items.map((e) => e.w).sort(), ["bók|kvk", "fara|so", "hestur|kk"]);
  /* the order does not depend on which device merges */
  assert.deepEqual(mergeStates(B, laptop, phone).review, M.review);
  /* the tallies add, and what both had at the start is not counted twice */
  assert.deepEqual([M.review.stats["s:nafnord"].a, M.review.stats["s:sagnord"].a, M.review.stats["p:thf_thgf"].a], [2, 1, 1]);
  /* merging again changes nothing */
  assert.deepEqual(mergeStates(M, M, M).review, M.review);
  assert.deepEqual(mergeStates(null, phone, laptop).review.items.length, 3, "with no common past: the union");
});

test("two devices, one entry: the review done on one device counts; a miss is never erased by a pass", () => {
  const B = blankState();
  noteReview(B, cloze(), J(false, { p: "thf_thgf" }), D0);
  const k = B.review.items[0].k;
  const d1 = addDays(D0, 1);

  /* passed on the phone, untouched on the laptop */
  let phone = copy(B), laptop = copy(B);
  noteReview(phone, cloze(), J(true), d1);
  let M = mergeStates(B, phone, laptop);
  assert.deepEqual([entryByKey(M, k).s, entryByKey(M, k).due], [1, addDays(d1, 3)]);
  assert.deepEqual(mergeStates(B, laptop, phone).review, M.review);
  assert.equal(M.review.stats["p:thf_thgf"].p, 1);

  /* passed on the phone, missed on the laptop the same day: the miss stands */
  laptop = copy(B);
  noteReview(laptop, cloze(), J(false), d1);
  M = mergeStates(B, phone, laptop);
  assert.deepEqual([entryByKey(M, k).s, entryByKey(M, k).due], [0, addDays(d1, 1)]);
  assert.deepEqual(mergeStates(B, laptop, phone).review.items, M.review.items);
  assert.deepEqual([M.review.stats["p:thf_thgf"].p, M.review.stats["p:thf_thgf"].l], [1, 1], "both happened");

  /* missed on the phone on Monday, passed on the laptop on Thursday: the later answer */
  phone = copy(B); laptop = copy(B);
  noteReview(phone, cloze(), J(false), d1);
  noteReview(laptop, cloze(), J(true), addDays(D0, 4));
  M = mergeStates(B, phone, laptop);
  assert.deepEqual([entryByKey(M, k).s, entryByKey(M, k).last], [1, addDays(D0, 4)]);
});

test("two devices: an entry finished on one stays finished — unless the other has missed it since", () => {
  const B = blankState();
  noteReview(B, cloze(), J(false, { p: "thf_thgf" }), D0);
  const k = B.review.items[0].k;
  B.review.items[0].s = 3; B.review.items[0].due = addDays(D0, 30);
  const done = copy(B);
  noteReview(done, cloze(), J(true), addDays(D0, 30));
  assert.equal(entryByKey(done, k), null);
  /* the other device has not touched it */
  assert.equal(entryByKey(mergeStates(B, done, copy(B)), k), null);
  assert.equal(entryByKey(mergeStates(B, copy(B), done), k), null);
  assert.equal(mergeStates(B, done, copy(B)).review.stats["p:thf_thgf"].g, 1);
  /* the other device missed it in the meantime: it is back */
  const missed = copy(B);
  noteReview(missed, cloze(), J(false), addDays(D0, 29));
  assert.equal(entryByKey(mergeStates(B, done, missed), k).s, 0);
  assert.equal(entryByKey(mergeStates(B, missed, done), k).s, 0);
});

test("a merged queue is held to its size", () => {
  const mk = (from) => {
    const q = blankReview();
    for (let n = from; n < from + 100; n++) q.items.push(entry(n, { s: n % 4 }));
    return q;
  };
  const M = mergeReview(null, mk(0), mk(100));
  assert.equal(M.items.length, REVIEW_MAX);
  assert.ok(M.items.filter((e) => e.s === 0).length === 50, "what is given up is what is furthest along");
});

test("the server keeps the queue, field by field, and bounds it", () => {
  const S = blankState();
  noteReview(S, cloze(), J(false, { p: "thf_thgf" }), D0);
  noteReview(S, cloze("EFFT", "bók|kvk"), J(false, { p: "ef" }), D0);
  noteReview(S, cloze(), J(true), addDays(D0, 1));
  const now = new Date(Date.UTC(2026, 10, 17, 12));
  const clean = cleanState(copy(S), { today: now });
  assert.deepEqual(clean.review, S.review, "an honest queue is stored as it is");

  const dirty = copy(S);
  const good = dirty.review.items[0];
  dirty.review.items = [
    good,
    { ...good },                                              // the same key twice
    { ...good, k: "x".repeat(400) },                          // a key of any length
    { ...good, k: "k2", t: "<script>" },                      // not a question type
    { ...good, k: "k3", due: "2031-01-01" },                  // due in five years
    { ...good, k: "k4", last: "2027-06-01" },                 // answered next summer
    { ...good, k: "k5", sk: "galdrar" },                      // not a category
    { ...good, k: "k6", s: 99, l: -4, ok: 1e12, c: "y".repeat(500), w: 7, p: {}, evil: "<b>", typed: "það sem barnið skrifaði" },
    "text", null, 7,
  ];
  dirty.review.stats = { "p:thf_thgf": { a: 3, l: "x", p: -1, t: 2.6, junk: "y" }, "s:galdrar": { a: 1 },
    "__proto__x": { a: 1 }, "p:ok": "nei" };
  dirty.review.more = "x".repeat(10000);
  const out = cleanState(dirty, { today: now }).review;
  assert.deepEqual(Object.keys(out).sort(), ["items", "stats"]);
  assert.deepEqual(out.items.map((e) => e.k), [good.k, "k6"]);
  const k6 = out.items[1];
  assert.deepEqual(Object.keys(k6).sort(), ["add", "c", "due", "i", "k", "l", "last", "ok", "p", "s", "sk", "t", "w"]);
  assert.deepEqual([k6.s, k6.l, k6.ok, k6.c, k6.w, k6.p], [3, 0, 9999, null, null, null]);
  assert.deepEqual(out.stats, { "p:thf_thgf": { a: 3, l: 0, p: 0, t: 3, g: 0, x: 0 } });

  /* size: a thousand entries arrive, REVIEW_MAX are kept, and they are small */
  const big = copy(S);
  big.review.items = [];
  for (let n = 0; n < 1000; n++) big.review.items.push(entry(n, { due: "2026-11-18", c: "c".repeat(60), w: "w".repeat(80), i: "i".repeat(120), p: "p".repeat(40) }));
  for (let n = 0; n < 500; n++) big.review.stats["p:m" + n] = { a: 1 };
  const kept = cleanState(big, { today: now }).review;
  assert.equal(kept.items.length, REVIEW_MAX);
  /* Item 44 added a tally per question type, so the cap is STATS_MAX
     (patterns, categories and types with room to spare), not 100. */
  assert.ok(Object.keys(kept.stats).length <= STATS_MAX);
  assert.ok(JSON.stringify(kept).length < 100000, `the queue can be at most ${JSON.stringify(kept).length} bytes`);
  /* what the server stored loads in the browser as it is */
  assert.deepEqual(sanitiseReview(copy(kept)), kept);
});
