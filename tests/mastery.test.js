/* The mastery mark (critique item 44, core/mastery.js), and the answers per
   question type it reads: written by `settle`, kept through a reload, merged
   between devices and held in shape by the server. */

import test from "node:test";
import assert from "node:assert/strict";
import {
  HIST, WINDOW, MIN_ANSWERS, LABELS, noteTypeAnswer, answerChar, readChar, cleanByType,
  mergeByType, recentAtLevel, markFrom, masteryOf, masteryOfTypes, masteryLine, typesOfSkill,
} from "../src/js/core/mastery.js";
import { blankState, migrate, newSession } from "../src/js/core/state.js";
import { mergeStates } from "../src/js/core/merge.js";
import { cleanState } from "../server/guard.mjs";
import { noteReview, typeReviewStats, sanitiseReview, addDays } from "../src/js/core/review.js";
import { setSkillLevel } from "../src/js/core/difficulty.js";
import { settle } from "../src/js/core/answer.js";
import { TYPE_IDS } from "../src/js/core/policy.js";
import { SKILL_IDS } from "../src/js/core/skills.js";
import { skillHasTypes } from "../src/js/core/catalogue.js";
import { NODES } from "../src/js/core/curriculum.js";

const NOW = new Date(2026, 10, 16, 12).getTime();
const TODAY = "2026-11-16";

/** A pupil at `level` in `skill` whose type `id` has these answers ("1"/"0"),
    all asked at that level. */
function pupil({ skill = "nafnord", id = "fill", level = 3, answers = "", band = level } = {}) {
  const S = blankState();
  setSkillLevel(S, skill, level, { now: 1 });
  for (const ch of answers) noteTypeAnswer(S, id, band, ch === "1", NOW);
  return S;
}
const ones = (right, n) => "1".repeat(right) + "0".repeat(n - right);

/* ---------- the record ------------------------------------------------------- */

test("one answer is one letter: the step as A–G, capital when right; twenty kept", () => {
  assert.equal(answerChar(1, true), "A");
  assert.equal(answerChar(3, false), "c");
  assert.equal(answerChar(7.4, true), "G");
  assert.equal(answerChar(0, true), "A", "below the scale is step 1");
  assert.deepEqual(readChar("c"), { band: 3, ok: false });
  const S = blankState();
  for (let k = 0; k < 30; k++) noteTypeAnswer(S, "fill", 2, k % 2 === 0, NOW + k);
  assert.deepEqual([S.byType.fill.n, S.byType.fill.c, S.byType.fill.h.length], [30, 15, HIST]);
  assert.equal(S.byType.fill.at, NOW + 29);
  assert.equal(noteTypeAnswer(S, "no_such_type", 2, true), null);
  assert.equal(noteTypeAnswer(S, "fill", 2, null), null, "an answer with no right or wrong is not counted");
  assert.equal(S.byType.fill.n, 30);
});

test("settle writes one answer per question, at the step the pupil was at before it moved", () => {
  const S = blankState();
  const sess = newSession(S);
  sess.diff.nafnord = 3;
  const task = { type: "fill", typeId: "fill", skill: "nafnord", cell: "ÞGFET", word: "hestur|kk" };
  const j = (ok) => ({ ok, effects: [{ do: "bump", skill: "nafnord", ok }], finish: { correct: ok }, findings: [] });
  settle(S, sess, task, j(true));
  settle(S, sess, task, j(true));   // two right: the level rises half a step after this one
  settle(S, sess, task, j(false));
  assert.equal(S.byType.fill.h, "CCd", "asked at 3, 3, then at 3.5 → step 4");
  assert.deepEqual([S.byType.fill.n, S.byType.fill.c], [3, 2]);
  /* A duel is asked at the duel's level: not counted. A result that does not
     end a question (the bonus sentence) is not counted either. */
  settle(S, sess, { ...task, duel: true }, j(true));
  settle(S, sess, task, { ok: true, effects: [], findings: [] });
  assert.equal(S.byType.fill.n, 3);
});

/* ---------- the mark: thresholds ------------------------------------------------ */

test("too little data says so: under eight recent answers at the level is 'Of fá svör'", () => {
  assert.equal(masteryOf(blankState(), "nafnord", NOW).level, 0);
  assert.equal(masteryOf(blankState(), "nafnord", NOW).label, "Of fá svör");
  const seven = masteryOf(pupil({ answers: ones(7, 7) }), "nafnord", NOW);
  assert.deepEqual([seven.level, seven.n, seven.accuracy], [0, 7, 1], "seven right of seven is not mastery");
  assert.match(masteryLine(seven), /7 svör á þyngd 3 — vantar 1 svar enn/);
  assert.equal(masteryLine(masteryOf(blankState(), "sagnord", NOW)), "Engin svör á þyngd 1 enn");
  assert.equal(masteryOf(pupil({ answers: ones(0, 8) }), "nafnord", NOW).level, 1, "eight is enough");
});

test("the thresholds: under 60% → 1, under 75% → 2, 75% and over → 3", () => {
  const at = (right, n) => masteryOf(pupil({ answers: ones(right, n) }), "nafnord", NOW);
  assert.equal(at(5, 10).level, 1);           // 50%
  assert.equal(at(59, 100).level, 1, "only the last twenty count: 0 of the last 20");
  assert.equal(at(6, 10).level, 2);           // 60% exactly
  assert.equal(at(7, 10).level, 2);           // 70%
  assert.equal(at(9, 12).level, 3);           // 75% exactly
  assert.equal(at(10, 10).level, 3, "all right, but not a full window of 20: 3, not 4");
  assert.deepEqual(LABELS, ["Of fá svör", "Þarf æfingu", "Á góðri leið", "Gott vald", "Fullt vald"]);
});

test("4 'Fullt vald' needs 90% of a full twenty AND the reviews kept", () => {
  /* Never missed anything: there was nothing to review. */
  const clean = pupil({ answers: ones(20, 20) });
  assert.equal(masteryOf(clean, "nafnord", NOW).level, 4);
  /* 18 of 20, and misses went into the queue but no review has been passed yet. */
  const S = pupil({ answers: "11111111111111111100" });
  S.review = sanitiseReview({ items: [], stats: { "s:nafnord": { a: 2, l: 0, p: 0, t: 0 } } });
  assert.equal(masteryOf(S, "nafnord", NOW).level, 3);
  S.review.stats["s:nafnord"] = { a: 2, l: 0, p: 2, t: 2, g: 0, x: 0 };
  assert.equal(masteryOf(S, "nafnord", NOW).level, 4, "two reviews passed on time");
  S.review.stats["s:nafnord"] = { a: 4, l: 3, p: 2, t: 2, g: 0, x: 0 };
  assert.equal(masteryOf(S, "nafnord", NOW).level, 3, "more reviews missed than passed on time");
  S.review.stats["s:nafnord"] = { a: 2, l: 0, p: 3, t: 2, g: 0, x: 0 };
  /* A review waiting more than two days past its day. */
  S.review.items.push({ k: "x", t: "fill", sk: "nafnord", p: null, c: "ÞGFET", w: "hestur|kk", i: null,
    s: 0, due: addDays(TODAY, -5), add: addDays(TODAY, -6), last: addDays(TODAY, -6), l: 1, ok: 0 });
  const m = masteryOf(S, "nafnord", NOW);
  assert.deepEqual([m.level, m.overdue], [3, 1]);
  assert.match(masteryLine(m), /1 upprifjun bíður of lengi/);
  /* Due today or yesterday is not overdue. */
  S.review.items[0].due = addDays(TODAY, -1);
  assert.equal(masteryOf(S, "nafnord", NOW).level, 4);
  assert.match(masteryLine(masteryOf(S, "nafnord", NOW)), /^18 af 20 rétt á þyngd 3 · 2 upprifjanir á réttum tíma$/);
  /* 17 of 20 is 85%: not 4 whatever the reviews. */
  assert.equal(masteryOf(pupil({ answers: ones(17, 20) }), "nafnord", NOW).level, 3);
});

test("only answers near the pupil's level count", () => {
  /* Twenty right at step 1, and the pupil is now at step 4: easy questions
     from earlier say nothing about now. */
  const S = pupil({ level: 4, answers: ones(20, 20), band: 1 });
  assert.equal(masteryOf(S, "nafnord", NOW).n, 0);
  /* One step either side counts: the level moves in halves and a visit
     starts half a step down. */
  for (const band of [3, 4, 5]) assert.equal(masteryOf(pupil({ level: 4, answers: ones(8, 8), band }), "nafnord", NOW).n, 8);
  assert.equal(masteryOf(pupil({ level: 4, answers: ones(8, 8), band: 2 }), "nafnord", NOW).n, 0);
  /* The level saved in halves is read as its whole step. */
  assert.equal(masteryOf(pupil({ level: 3.5, answers: "" }), "nafnord", NOW).band, 4);
});

test("a skill's mark reads all its types; a node's mark reads exactly its types", () => {
  const S = blankState();
  setSkillLevel(S, "nafnord", 2, { now: 1 });
  for (let k = 0; k < 10; k++) noteTypeAnswer(S, "fill", 2, true, NOW);
  for (let k = 0; k < 10; k++) noteTypeAnswer(S, "tbl_no", 2, false, NOW);
  assert.deepEqual(typesOfSkill("nafnord").sort(), ["fill", "no_beyging", "no_val", "tbl_no"]);
  const all = masteryOf(S, "nafnord", NOW);
  assert.deepEqual([all.n, all.right, all.level], [20, 10, 1]);
  assert.equal(masteryOfTypes(S, ["fill"], NOW).level, 3);
  assert.equal(masteryOfTypes(S, ["tbl_no"], NOW).level, 1);
  /* Taken in turn from each type, newest first, up to twenty. */
  for (let k = 0; k < 15; k++) noteTypeAnswer(S, "no_val", 2, true, NOW);
  const r = recentAtLevel(S, ["fill", "tbl_no", "no_val"]);
  assert.equal(r.length, WINDOW);
  assert.deepEqual(r.slice(0, 3).map((x) => x.ok), [true, false, true]);
  /* Every curriculum node with questions can be asked for its mark. */
  for (const n of NODES.filter((x) => x.types.length)) {
    const m = masteryOfTypes(S, n.types, NOW);
    assert.ok(m.level >= 0 && m.level <= 4 && typeof m.label === "string", n.id);
  }
  /* Unknown types are ignored, an empty node has too little. */
  assert.equal(masteryOfTypes(S, ["nope"], NOW).level, 0);
  assert.equal(masteryOfTypes(S, [], NOW).n, 0);
});

test("the review queue tallies per question type, and a node's mark reads them", () => {
  const S = blankState();
  const task = { type: "fill", typeId: "fill", skill: "nafnord", cell: "ÞGFET", word: "hestur|kk" };
  const wrong = { ok: false, effects: [], findings: [] }, right = { ok: true, effects: [], findings: [] };
  noteReview(S, task, wrong, "2026-11-01");
  noteReview(S, task, right, "2026-11-02");     // due on the 2nd: on time
  noteReview(S, task, right, "2026-11-05");     // due on the 5th: on time
  const t = typeReviewStats(S, "2026-11-05").fill;
  assert.deepEqual([t.added, t.passed, t.onTime], [1, 2, 2]);
  assert.equal(S.review.stats["t:fill"].t, 2);
  for (let k = 0; k < 20; k++) noteTypeAnswer(S, "fill", 1, k !== 0, NOW);
  /* The entry is next due on the 12th (seven days on). */
  const on6th = new Date(2026, 10, 6, 12).getTime();
  assert.equal(masteryOfTypes(S, ["fill"], on6th).level, 4);
  assert.equal(masteryOfTypes(S, ["fill"], on6th).reviewsOnTime, 2);
  assert.equal(masteryOfTypes(S, ["fill"], NOW).level, 3, "four days past its day on the 16th: overdue");
  /* The tallies survive a reload and the server. */
  assert.deepEqual(migrate(JSON.parse(JSON.stringify(S))).review.stats["t:fill"], S.review.stats["t:fill"]);
  const raw = JSON.parse(JSON.stringify(S));
  raw.review.stats["t:no_such_type"] = { a: 1 };
  const kept = cleanState(raw, { today: new Date(NOW) });
  assert.deepEqual(kept.review.stats["t:fill"], S.review.stats["t:fill"]);
  assert.equal(kept.review.stats["t:no_such_type"], undefined);
});

/* ---------- saved, merged, guarded ----------------------------------------------- */

test("the answers per type survive a reload, bounded and of the right shape", () => {
  const S = pupil({ answers: ones(12, 25) });
  const back = migrate(JSON.parse(JSON.stringify(S)));
  assert.deepEqual(back.byType, S.byType);
  assert.deepEqual(blankState().byType, {});
  assert.deepEqual(migrate({}).byType, {}, "a state from before item 44 starts empty");
  const odd = cleanByType({
    fill: { n: 3, c: 9, h: "AAxBB" + "C".repeat(40), at: -5 },
    nope: { n: 1, c: 1, h: "A", at: 1 },
    tbl_no: "not an object",
    no_val: { n: 2.6, c: "x", h: 7 },
  });
  assert.deepEqual(Object.keys(odd).sort(), ["fill", "no_val"]);
  assert.deepEqual(odd.fill, { n: 3, c: 3, h: "", at: 0 }, "a history with a stray letter is dropped");
  assert.equal(cleanByType({ fill: { n: 40, c: 1, h: "C".repeat(40) } }).fill.h, "C".repeat(HIST));
  assert.deepEqual(odd.no_val, { n: 3, c: 0, h: "", at: 0 });
});

test("two devices: the counts add, the recent history is the side answered last", () => {
  const base = { fill: { n: 10, c: 8, h: "AAAAAAAAaa", at: 100 } };
  const local = { fill: { n: 12, c: 10, h: "AAAAAAAAaaBB", at: 300 }, no_val: { n: 1, c: 1, h: "B", at: 250 } };
  const remote = { fill: { n: 13, c: 8, h: "AAAAAAAAaaccc", at: 200 }, tbl_no: { n: 2, c: 0, h: "aa", at: 50 } };
  const m = mergeByType(base, local, remote);
  assert.deepEqual(m.fill, { n: 15, c: 10, h: "AAAAAAAAaaBB", at: 300 });
  assert.deepEqual(m.no_val, local.no_val);
  assert.deepEqual(m.tbl_no, remote.tbl_no);
  /* Through the whole-state merge. */
  const L = blankState(), R = blankState(), B = blankState();
  B.byType = base; L.byType = local; R.byType = remote;
  assert.deepEqual(mergeStates(B, L, R).byType, m);
});

test("the server keeps the answers per type and the types met, and nothing else", () => {
  const S = pupil({ answers: ones(5, 9) });
  S.seenTypes = { fill: "2026-11-01" };
  const raw = JSON.parse(JSON.stringify(S));
  raw.byType.made_up = { n: 1e9, c: 1, h: "A", at: 1 };
  raw.byType.fill.h = "<script>" + raw.byType.fill.h;
  raw.seenTypes.made_up = "2026-11-01";
  raw.seenTypes.no_val = "not a day";
  raw.seenTypes.tbl_no = "2099-01-01";
  const kept = cleanState(raw, { today: new Date(NOW) });
  assert.deepEqual(Object.keys(kept.byType), ["fill"]);
  assert.equal(kept.byType.fill.h, "", "not read for the letters it happens to contain");
  assert.equal(kept.byType.fill.n, 9);
  assert.deepEqual(kept.seenTypes, { fill: "2026-11-01" }, "known types, real days, not in the future");
  /* Bounded: every type answered and met is still a small record. */
  const big = blankState();
  for (const id of TYPE_IDS) for (let k = 0; k < 30; k++) noteTypeAnswer(big, id, 7, true, NOW);
  assert.ok(JSON.stringify(cleanState(big, { today: new Date(NOW) }).byType).length < 100 * TYPE_IDS.length, "under 100 bytes a type");
  /* … but for a skill with no question type yet (Námsorð before its first, #19). */
  assert.ok(SKILL_IDS.filter(skillHasTypes).every((s) => typeesOk(s)));
});

/* Every category has at least one type to read its mark from. */
const typeesOk = (s) => typesOfSkill(s).length > 0;

test("markFrom is pure arithmetic on what it is given", () => {
  const r = (right, n) => Array.from({ length: n }, (_, k) => ({ ok: k < right }));
  assert.equal(markFrom(r(0, MIN_ANSWERS - 1), {}).level, 0);
  assert.equal(markFrom(r(18, 20), { added: 0 }).level, 4);
  assert.equal(markFrom(r(18, 20), { added: 1, onTime: 1 }).level, 3);
  assert.equal(markFrom(r(18, 20), { added: 1, onTime: 2, overdue: 1 }).level, 3);
  assert.equal(markFrom(r(18, 20), { added: 5, onTime: 2, lapsed: 2 }).level, 4);
});
