/* The placement round and the record of the guided first run (critique item
 * 84, which replaces item 40).
 *
 * The defect: a new pupil landed on the picker with every skill at level 1
 * and no word of explanation, and a pupil who could do year-10 work spent
 * weeks being asked year-8 questions (the ordinary rule climbs half a step
 * for two right answers IN A SKILL). These tests hold core/placement.js:
 * which questions the round asks, how its one level moves, what it writes
 * into the saved levels (through `setSkillLevel`, source "placement"), that
 * a weak, a middle and a strong pupil end up in clearly different places,
 * which year it suggests — and the record that says the first run is over,
 * through a save, a merge and the server's guard. The screens themselves
 * are tools/tour-test.mjs. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MIN_QUESTIONS, MAX_QUESTIONS, MIN_ANSWERS, PLACEMENT_ORDER, PLACEMENT_TWICE, PLACEMENT_SKIP,
  FAST, UP, DOWN, START, START_UNKNOWN, NEAR, UNASKED, YEAR_SHARE,
  placementTypes, placementPlan, startPlacement, placementDone, placementQuestion,
  placementAnswer, placementDrop, placementResult, applyPlacement, SKILL_UP_MIN, shownBand,
  YEAR_FROM, yearOfLevel, suggestYear,
  TOUR_STEPS, cleanTour, mergeTour, isNewPupil, shouldOfferTour, noteTour,
} from "../src/js/core/placement.js";
import { MIN, MAX, storedLevel, levelRecord, cleanLevels, levelRanges, bumpDiff } from "../src/js/core/difficulty.js";
import { blankState, migrate, newSession, effectivePolicy } from "../src/js/core/state.js";
import { mergeStates } from "../src/js/core/merge.js";
import { cleanState } from "../server/guard.mjs";
import { createPolicy, presetPolicy, applyPreset, presetOf } from "../src/js/core/policy.js";
import { presetContent } from "../src/js/core/curriculum.js";
import { skillHasTypes } from "../src/js/core/catalogue.js";
import { SKILL_IDS } from "../src/js/core/skills.js";
import { TASKS } from "../src/js/tasks/index.js";
import { judge, retryAllowed } from "../src/js/core/answer.js";
import { simulatePlacement, meanLevel } from "../tools/sim/placement.mjs";
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { TEXT, PLACEMENT_TOPIC } from "../src/js/ui/tour.js";

const lex = buildLexicon(DATA);
const T0 = 1_800_000_000_000;
const year = (y) => createPolicy(null, presetPolicy(y));
/* The categories of a year the round can ask: not one with no question type
   yet (Námsorð before its first, #19), and not one none of whose types follows
   the level, which has nothing to place (Lesskilningur with its first three
   texts, #30). The app hands the round the keys of `placementTypes`, which
   leaves both out by itself. */
const FLAT = SKILL_IDS.filter((s) => skillHasTypes(s) && TASKS.filter((t) => t.skill === s).every((t) => t.bands.length === 1));
const askable = (y) => presetContent(y).skills.filter((s) => skillHasTypes(s) && !FLAT.includes(s));
const YEAR8 = askable(8), YEAR10 = askable(10);

/** Answer a round with the outcomes in `seq` ("1"/"0"); the rest right. */
function play(st, seq) {
  for (const c of seq) st = placementAnswer(st, c === "1");
  return st;
}
const round = (skills = YEAR8, o = {}) => startPlacement({ skills, ...o });

/* ---------- which questions --------------------------------------------------- */

test("the round is 12–15 questions: every category once, the three inflection skills twice", () => {
  const p8 = placementPlan(YEAR8), p10 = placementPlan(YEAR10);
  assert.equal(p8.length, 13);
  assert.equal(p10.length, 15);
  for (const p of [p8, p10]) assert.ok(p.length >= MIN_QUESTIONS && p.length <= MAX_QUESTIONS);
  /* Every category of the year is asked … */
  assert.deepEqual([...new Set(p8)].sort(), [...YEAR8].sort());
  assert.deepEqual([...new Set(p10)].sort(), [...YEAR10].sort());
  /* … nouns first, and nouns, verbs and adjectives a second time at the end. */
  assert.equal(p8[0], "nafnord");
  assert.deepEqual(p8.slice(-3), PLACEMENT_TWICE);
  for (const id of PLACEMENT_TWICE) assert.equal(p8.filter((x) => x === id).length, 2);
  /* The order is the same list whatever order the skills arrive in. */
  assert.deepEqual(placementPlan([...YEAR8].reverse()), p8);
});

test("the plan knows every skill there is, so a new category cannot be left out unnoticed", () => {
  assert.deepEqual([...PLACEMENT_ORDER].sort(), [...SKILL_IDS].sort());
});

test("a narrow curriculum still gets a round long enough to say something, and none gets none", () => {
  const three = placementPlan(["nafnord", "sagnord", "greining"]);
  assert.equal(three.length, MIN_QUESTIONS);
  assert.ok(["nafnord", "sagnord", "greining"].every((id) => three.filter((x) => x === id).length >= 3));
  assert.equal(placementPlan(["greining"]).length, MIN_QUESTIONS);
  assert.deepEqual(placementPlan([]), []);
  assert.deepEqual(placementPlan(["ekki-til"]), []);
  assert.ok(placementPlan(SKILL_IDS).length <= MAX_QUESTIONS);
});

test("the round leaves out whole tables, error hunts and the ungraded explanation — and types filed under several skills", () => {
  const P = year(10);
  const types = placementTypes(TASKS, P);
  const all = Object.values(types).flat();
  const byId = Object.fromEntries(TASKS.map((t) => [t.id, t]));
  assert.ok(all.length > 30, "the round has too little to ask from: " + all.length);
  for (const id of all) {
    assert.ok(!PLACEMENT_SKIP.has(byId[id].renderer), id + " is a shape the round leaves out");
    assert.ok(!byId[id].anyOf, id + " serves several skills");
  }
  for (const id of ["tbl_no", "tbl_so", "villur", "meaning", "revform"]) assert.ok(!all.includes(id), id);
  /* Each type under its own skill, and every category of the year has some. */
  for (const [skill, ids] of Object.entries(types)) for (const id of ids) assert.equal(byId[id].skill, skill);
  assert.deepEqual(Object.keys(types).sort(), [...YEAR10].sort());
});

test("the round asks only what the policy allows", () => {
  const types8 = placementTypes(TASKS, year(8));
  assert.deepEqual(Object.keys(types8).sort(), [...YEAR8].sort());
  assert.ok(!("setningafraedi" in types8) && !("setningagerd" in types8));
  const allowed = new Set(presetContent(8).types);
  for (const id of Object.values(types8).flat()) assert.ok(allowed.has(id), id + " is not year-8 material");
  /* Issue #30: Lesskilningur is on in year 8, and the round does not ask it —
     its types (#30, #32) build the same questions at every þyngd, so an answer
     places nothing. It is asked by itself once a type of it has bands. */
  assert.deepEqual(FLAT, ["lesskilningur", "frasogn"]);
  assert.ok(presetContent(8).skills.includes("lesskilningur") && !("lesskilningur" in types8));
  /* #35: Frásögn likewise */
  assert.ok(presetContent(8).skills.includes("frasogn") && !("frasogn" in types8));
  const banded = TASKS.map((t) => (t.id === "les_adal" ? { ...t, bands: [1, 3] } : t));
  assert.deepEqual(placementTypes(banded, year(8)).lesskilningur, ["les_adal", "les_hluti", "les_kort", "les_samantekt", "les_setning", "les_smaatridi", "les_kjarni"]);
  /* A ceiling that allows one category: one category is asked. */
  const cap = { skills: Object.fromEntries(SKILL_IDS.map((id) => [id, id === "nafnord"])), types: {}, levels: {} };
  assert.deepEqual(Object.keys(placementTypes(TASKS, createPolicy(cap, presetPolicy(8)))), ["nafnord"]);
});

/* ---------- the staircase ------------------------------------------------------- */

test("the round starts low — a little higher for a pupil who said a later year", () => {
  assert.equal(round().level, START_UNKNOWN);
  assert.equal(round(YEAR8, { year: 8 }).level, START[8]);
  assert.equal(round(YEAR10, { year: 10 }).level, START[10]);
  assert.ok(START[8] <= START[9] && START[9] <= START[10] && START[10] <= 3);
  /* … and never outside what may be asked. */
  const low = Object.fromEntries(YEAR8.map((id) => [id, [1, 2]]));
  assert.equal(round(YEAR8, { year: 10, ranges: low }).level, 2);
});

test("up after a right answer, down after a wrong one", () => {
  let st = round();
  const a = st.level;
  st = placementAnswer(st, true);
  assert.equal(st.level, a + FAST);
  st = placementAnswer(st, false);
  assert.equal(st.level, a + FAST - DOWN);
  st = placementAnswer(st, true);
  assert.equal(st.level, a + FAST - DOWN + UP);
  st = placementAnswer(st, false);
  assert.equal(st.level, a + FAST - DOWN + UP - DOWN);
});

test("whole steps until the first miss, then half a step up and a whole one down", () => {
  let st = play(round(), "111");
  assert.equal(st.level, START_UNKNOWN + 3 * FAST);
  assert.equal(st.fast, true);
  st = placementAnswer(st, false);
  assert.equal(st.fast, false);
  const after = st.level;
  st = play(st, "11");
  assert.equal(st.level, after + 2 * UP);
  /* The fast climb does not come back after a run of right answers. */
  assert.equal(st.fast, false);
  /* Unequal steps balance where UP·p = DOWN·(1−p): two answers in three. */
  assert.ok(Math.abs(DOWN / (UP + DOWN) - 2 / 3) < 1e-9);
});

test("the level stays inside the round's range, and each question inside its skill's", () => {
  const ranges = Object.fromEntries(YEAR8.map((id) => [id, [1, id === "toluord" ? 3 : 5]]));
  let st = round(YEAR8, { ranges });
  assert.equal(st.lo, 1); assert.equal(st.hi, 5);
  st = play(st, "1111111111111");
  assert.equal(st.level, 5);
  const tol = st.hist.find((h) => h.skill === "toluord");
  assert.equal(tol.level, 3, "Töluorð was asked above the highest level it knows");
  assert.ok(st.hist.every((h) => h.level >= 1 && h.level <= 5));
  let down = play(round(YEAR8, { ranges }), "0000000000000");
  assert.equal(down.level, 1);
  assert.ok(down.hist.every((h) => h.level >= 1));
});

test("the round walks its plan in order and ends when the plan does", () => {
  let st = round();
  const plan = st.plan.slice();
  const seen = [];
  while (!placementDone(st)) {
    const q = placementQuestion(st);
    assert.equal(q.n, seen.length + 1);
    assert.equal(q.of, plan.length);
    seen.push(q.skill);
    st = placementAnswer(st, seen.length % 2 === 0);
  }
  assert.deepEqual(seen, plan);
  assert.equal(placementQuestion(st), null);
  assert.equal(placementAnswer(st, true), st, "an answer after the end changed something");
  assert.equal(st.hist.length, plan.length);
});

test("an answer makes a new state and leaves the old one as it was", () => {
  const st = Object.freeze({ ...round(), hist: Object.freeze([]), plan: Object.freeze(round().plan) });
  const next = placementAnswer(st, true);
  assert.notEqual(next, st);
  assert.equal(st.i, 0); assert.equal(st.hist.length, 0);
  assert.equal(next.i, 1); assert.equal(next.hist.length, 1);
});

test("a question that cannot be built, or that nobody graded, is dropped and moves nothing", () => {
  const st = round();
  const dropped = placementDrop(st);
  assert.equal(dropped.plan.length, st.plan.length - 1);
  assert.equal(dropped.plan[0], st.plan[1]);
  assert.equal(dropped.level, st.level);
  const ungraded = placementAnswer(st, null);
  assert.equal(ungraded.plan.length, st.plan.length - 1);
  assert.equal(ungraded.level, st.level);
  assert.equal(ungraded.hist.length, 0);
});

/* ---------- what it writes ------------------------------------------------------ */

test("too few answers place nothing", () => {
  const st = play(round(), "1".repeat(MIN_ANSWERS - 1));
  const r = placementResult(st);
  assert.equal(r.placed, false);
  assert.equal(r.general, null);
  assert.deepEqual(r.levels, {});
  const S = blankState();
  assert.deepEqual(applyPlacement(S, r), []);
  assert.deepEqual(S.difficulty, {});
  assert.equal(placementResult(play(round(), "1".repeat(MIN_ANSWERS))).placed, true);
});

test("the general level is read off the second half, rounded down to a half step", () => {
  /* 2,3,4,5 right; then 6 wrong→5; 5 right→5.5; 5.5 wrong→4.5; then right, right … */
  const st = play(round(), "1111" + "0" + "1" + "0" + "111111");
  const asked = st.hist.map((h) => h.level);
  const tail = asked.slice(Math.floor(asked.length / 2));
  const mean = tail.reduce((a, b) => a + b, 0) / tail.length;
  const r = placementResult(st);
  assert.equal(r.general, Math.floor(mean * 2) / 2);
  assert.ok(r.general <= mean && mean - r.general < 0.5);
  assert.equal(r.answers, 13);
  assert.equal(r.right, 11);
});

test("a skill answered wrong near the pupil's level starts a step lower; one answered right twice, half a step higher", () => {
  /* Climb to the top (5), then keep it there: every later answer right,
     except the two we choose. */
  const ranges = Object.fromEntries(YEAR8.map((id) => [id, [1, 7]]));
  const plan = placementPlan(YEAR8);
  const seq = plan.map((_, i) => (i === 8 ? "0" : "1")).join("");
  const st = play(round(YEAR8, { ranges }), seq);
  const r = placementResult(st);
  const missed = plan[8];
  const G = r.general;
  assert.equal(r.levels[missed].level, G - 1, "the skill that went wrong is not a step under the rest");
  assert.equal(r.levels[missed].history, "0");
  const fine = plan[9];
  assert.equal(plan.filter((s) => s === fine).length, 1);
  assert.equal(r.levels[fine].level, G, "one right answer is no evidence: no half step (review S5)");
  assert.equal(r.levels.nafnord.history, "11");
  assert.equal(r.levels.nafnord.level, Math.min(7, G + 0.5), "two right answers earn the half step");
  /* Every skill asked has a level, in halves, inside 1–7. */
  for (const id of new Set(plan)) {
    const v = r.levels[id];
    assert.ok(v && v.asked);
    assert.equal(v.level * 2, Math.round(v.level * 2));
    assert.ok(v.level >= MIN && v.level <= MAX);
  }
});

test("a wrong answer far above the pupil's level says nothing about the skill", () => {
  /* Three right take the level to 5; the fourth skill (greining) is asked
     there and missed; from then on everything is wrong and the pupil ends
     at the bottom. The miss at 5 was the climb, not the skill. */
  const st = play(round(), "111" + "0" + "000000000");
  const r = placementResult(st);
  assert.ok(r.general <= 1.5);
  const g = st.hist.find((h) => h.skill === "greining");
  assert.ok(g.level > r.general + NEAR);
  /* greining: one miss, far above → not lowered below the general level;
     it cannot be raised either (it was not right). */
  assert.equal(r.levels.greining.level, Math.max(MIN, r.general));
  /* A skill missed AT the pupil's level is lowered, down to the floor. */
  assert.equal(r.levels.malbeiting.level, MIN);
});

test("levels are held to each skill's own range, and a skill that could not be asked starts a little under the rest", () => {
  const ranges = Object.fromEntries(SKILL_IDS.map((id) => [id, [1, id === "toluord" ? 3 : 7]]));
  const st = play(round(YEAR8, { ranges }), "1111111111111");
  const r = placementResult(st, { others: ["setningafraedi", "nafnord", "ekki-til"], ranges });
  assert.ok(r.general >= 6);
  assert.equal(r.levels.toluord.level, 3);
  assert.equal(r.levels.setningafraedi.level, r.general - UNASKED);
  assert.equal(r.levels.setningafraedi.asked, false);
  assert.equal(r.levels.nafnord.asked, true, "a skill that was asked was overwritten as one that was not");
  assert.ok(!("ekki-til" in r.levels));
});

test("the result is written through setSkillLevel with the source \"placement\", and takes effect at once", () => {
  const S = blankState(), sess = newSession(S);
  /* What the round's own answers did to the levels on the way is replaced. */
  bumpDiff(sess, S, "nafnord", true, T0 - 5);
  const st = play(round(), "1101101101101");
  const r = placementResult(st, { others: YEAR8 });
  const done = applyPlacement(S, r, { sess, now: T0 });
  assert.deepEqual(done.sort(), [...YEAR8].sort());
  for (const id of YEAR8) {
    const rec = levelRecord(S, id);
    assert.equal(rec.src, "placement", id);
    assert.equal(rec.at, T0);
    assert.equal(rec.d, r.levels[id].level);
    assert.equal(rec.r, 0);
    assert.equal(rec.h, r.levels[id].history);
    assert.equal(sess.diff[id], rec.d, id + ": the live level did not follow");
    assert.ok(!(id in sess.warm), id + ": a warm-up was left on a level just set");
  }
  /* Categories of later years, which the round did not ask and the pupil
     has not switched on, are not touched. */
  assert.equal(storedLevel(S, "setningafraedi"), MIN);
  assert.ok(!("setningafraedi" in S.difficulty));
});

test("a level the round wrote survives a save, the loader and the server's guard as a placement", () => {
  const S = blankState();
  applyPlacement(S, placementResult(play(round(), "1111011011011"), { others: YEAR8 }), { now: T0 });
  const wrote = S.difficulty.nafnord;
  assert.equal(wrote.src, "placement");
  const back = migrate(JSON.parse(JSON.stringify(S)));
  assert.deepEqual(back.difficulty.nafnord, wrote);
  assert.equal(cleanLevels(S.difficulty).nafnord.src, "placement");
  const stored = cleanState(JSON.parse(JSON.stringify(S)), { today: new Date(T0) });
  assert.deepEqual(stored.difficulty.nafnord, wrote);
  /* An invented source is still not believed. */
  assert.equal(cleanLevels({ nafnord: { d: 3, src: "töfrar" } }).nafnord.src, "play");
});

/* ---------- three simulated pupils (tools/sim/placement.mjs) -------------------- */

const ABILITY = { weak: 0.5, mid: 0.72, strong: 0.9 };
const PUPILS = 60;
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const cohort = (ability, yearSaid) =>
  Array.from({ length: PUPILS }, (_, s) => simulatePlacement({ ability, seed: 4000 + 7919 * s, year: yearSaid, now: T0 }));

for (const said of [8, null]) {
  test(`a weak, a middle and a strong pupil are placed at clearly different levels (${said ? said + ". bekkur" : "no year said"})`, () => {
    const runs = Object.fromEntries(Object.entries(ABILITY).map(([k, a]) => [k, cohort(a, said)]));
    const lvl = Object.fromEntries(Object.entries(runs).map(([k, rs]) => [k, mean(rs.map(meanLevel))]));
    const gen = Object.fromEntries(Object.entries(runs).map(([k, rs]) => [k, mean(rs.map((r) => r.result.general))]));
    const say = JSON.stringify({ lvl, gen });
    /* Each a good three quarters of a level above the one below — measured:
       about 1.4 / 2.7 / 3.9 with 8. bekkur said, 1.4 / 2.8 / 4.5 with none.
       (#35: over the skills the round asked — tools/sim/placement.mjs.) */
    assert.ok(lvl.mid - lvl.weak >= 0.75, "weak and middle are not apart: " + say);
    assert.ok(lvl.strong - lvl.mid >= 0.75, "middle and strong are not apart: " + say);
    assert.ok(gen.mid - gen.weak >= 0.75 && gen.strong - gen.mid >= 0.75, say);
    /* A pupil who gets half of level 1 right is not sent above level 2; one
       who gets nine in ten right is not left near the bottom. */
    assert.ok(lvl.weak < 2, "the weak pupil starts too high: " + say);
    assert.ok(lvl.strong >= 3.25, "the strong pupil starts too low: " + say);
    /* Hardly any strong pupil ends below where the typical weak one does. */
    const weakMedian = runs.weak.map(meanLevel).sort((a, b) => a - b)[PUPILS / 2];
    const low = runs.strong.filter((r) => meanLevel(r) <= weakMedian).length;
    assert.ok(low <= PUPILS * 0.05, `${low} of ${PUPILS} strong pupils were placed with the weak ones`);
  });
}

test("every simulated round is 12–15 real questions and writes every switched-on skill as a placement, inside its range", () => {
  for (const [said, n] of [[8, 13], [10, 15], [null, 13]]) {
    for (const ability of Object.values(ABILITY)) {
      const r = simulatePlacement({ ability, seed: 77 + n, year: said, now: T0 });
      assert.equal(r.asked.length, n, `${said}: ${r.asked.length} questions`);
      assert.ok(r.result.placed);
      const P = effectivePolicy(r.S);
      const ranges = levelRanges(P, TASKS, lex.sentences);
      const on = SKILL_IDS.filter((id) => P.skill(id));
      assert.deepEqual(Object.keys(r.S.difficulty).sort(), [...on].sort());
      for (const id of on) {
        const rec = r.S.difficulty[id];
        assert.equal(rec.src, "placement");
        assert.ok(rec.d >= ranges[id][0] && rec.d <= ranges[id][1], `${id}: ${rec.d} outside ${ranges[id]}`);
        assert.equal(r.sess.diff[id], rec.d);
      }
      /* Every question was of a shape the round may ask, in the skill asked. */
      const byId = Object.fromEntries(TASKS.map((t) => [t.id, t]));
      for (const q of r.asked) {
        assert.equal(byId[q.type].skill, q.skill);
        assert.ok(!PLACEMENT_SKIP.has(byId[q.type].renderer));
      }
    }
  }
});

test("the simulated round is the same round from the same seed", () => {
  const a = simulatePlacement({ ability: 0.72, seed: 5, year: 8, now: T0 });
  const b = simulatePlacement({ ability: 0.72, seed: 5, year: 8, now: T0 });
  assert.deepEqual(a.asked, b.asked);
  assert.deepEqual(a.S.difficulty, b.S.difficulty);
});

/* ---------- the year ------------------------------------------------------------ */

test("the year suggested follows the level: 1–5 is year 8, 6 year 9, 7 year 10", () => {
  assert.equal(yearOfLevel(1), 8);
  assert.equal(yearOfLevel(4), 8);
  assert.equal(yearOfLevel(YEAR_FROM[9]), 9);
  assert.equal(yearOfLevel(5.5), 9);
  assert.equal(yearOfLevel(YEAR_FROM[10]), 10);
  assert.equal(yearOfLevel(7), 10);
  assert.equal(yearOfLevel(NaN), 8);
  /* The thresholds sit at the top of each year's own range of levels. */
  assert.ok(YEAR_FROM[9] <= presetContent(8).topLevel && YEAR_FROM[9] > presetContent(8).topLevel - 1);
  assert.ok(YEAR_FROM[10] <= presetContent(9).topLevel && YEAR_FROM[10] > presetContent(9).topLevel - 1);
});

test("a pupil who said no year is suggested the year their level sits in", () => {
  const at = (general) => ({ placed: true, general, answers: 13, right: 12, levels: {} });
  assert.equal(suggestYear(at(1)), 8);
  assert.equal(suggestYear(at(3.5)), 8);
  assert.equal(suggestYear(at(5)), 9);
  assert.equal(suggestYear(at(6.5)), 10);
});

test("a pupil who said a year is never suggested a lower one, and one year higher at most", () => {
  const at = (general) => ({ placed: true, general, answers: 13, right: 12, levels: {} });
  assert.equal(suggestYear(at(1), { chosen: 10 }), 10);
  assert.equal(suggestYear(at(1), { chosen: 9 }), 9);
  assert.equal(suggestYear(at(3), { chosen: 8 }), 8);
  assert.equal(suggestYear(at(5), { chosen: 8 }), 9);
  assert.equal(suggestYear(at(7), { chosen: 8 }), 9, "two years up in one step");
  assert.equal(suggestYear(at(7), { chosen: 9 }), 10);
  assert.equal(suggestYear(at(7), { chosen: 10 }), 10);
});

test("a year ahead is suggested only when three answers in four were right", () => {
  const at = (right) => ({ placed: true, general: 6.5, answers: 12, right, levels: {} });
  assert.equal(YEAR_SHARE, 0.75);
  assert.equal(suggestYear(at(9)), 10);
  assert.equal(suggestYear(at(8)), 8, "a lucky climb sent a pupil two years ahead");
  assert.equal(suggestYear(at(8), { chosen: 8 }), 8);
  assert.equal(suggestYear(at(9), { chosen: 8 }), 9);
  /* The year the pupil said is kept whatever the share. */
  assert.equal(suggestYear(at(2), { chosen: 10 }), 10);
});

test("the suggestion stays under the administrator's ceiling, and with nothing to go on there is none", () => {
  const at = (general) => ({ placed: true, general, answers: 13, right: 12, levels: {} });
  assert.equal(suggestYear(at(7), { cap: 8 }), 8);
  assert.equal(suggestYear(at(7), { chosen: 9, cap: 9 }), 9);
  assert.equal(suggestYear(at(7), { chosen: 10, cap: 9 }), 9);
  const none = { placed: false, general: null, answers: 3, right: 3, levels: {} };
  assert.equal(suggestYear(none), null);
  assert.equal(suggestYear(null), null);
  assert.equal(suggestYear(none, { chosen: 9 }), 9);
});

test("simulated: the weak pupil is kept at the year they said; the strong one is sometimes offered the next, never two up", () => {
  const weak = cohort(ABILITY.weak, 8), strong = cohort(ABILITY.strong, 8);
  /* A pupil who gets half right would need ten of thirteen by luck. */
  const lucky = weak.filter((r) => r.suggested !== 8).length;
  assert.ok(lucky <= 1, `${lucky} of ${PUPILS} weak pupils were offered year 9`);
  assert.ok(strong.every((r) => r.suggested === 8 || r.suggested === 9));
  assert.ok(strong.some((r) => r.suggested === 9), "no strong pupil was offered year 9");
  /* With no year said, a weak pupil is suggested year 8. */
  const open = cohort(ABILITY.weak, null);
  assert.ok(open.filter((r) => r.suggested === 8).length >= PUPILS * 0.95);
});

test("choosing a year for the round sets that year's preset on the pupil's own switches", () => {
  for (const y of [8, 9, 10]) {
    const S = blankState();
    const view = { skills: S.enabled, types: S.policy.types, levels: S.policy.levels };
    applyPreset(view, y);
    assert.equal(presetOf(view), y);
    const P = effectivePolicy(S);
    assert.equal(P.maxLevel ?? MAX, presetContent(y).topLevel);
  }
});

/* ---------- the record of the first run ------------------------------------------ */

test("a new pupil has no record, and is offered the first run", () => {
  const S = blankState();
  assert.equal(S.tour, null);
  assert.equal(isNewPupil(S), true);
  assert.equal(shouldOfferTour(S), true);
  assert.equal(shouldOfferTour(migrate(null)), true);
  assert.equal(shouldOfferTour(migrate({})), true);
});

test("a pupil with progress from before it existed is not walked through it", () => {
  /* What every state saved before this version looks like: answers, no record. */
  const old = migrate({ v: 11, xp: 420, totalAnswers: 40, totalCorrect: 31,
    days: { "2026-10-01": { a: 40, c: 31, xp: 420 } }, skills: { nafnord: { xp: 420, c: 31, w: 9 } } });
  assert.equal(old.tour, null);
  assert.equal(isNewPupil(old), false);
  assert.equal(shouldOfferTour(old), false);
  /* Any one sign of having practised is enough. */
  assert.equal(shouldOfferTour(migrate({ totalAnswers: 1 })), false);
  assert.equal(shouldOfferTour(migrate({ xp: 5 })), false);
  assert.equal(shouldOfferTour(migrate({ days: { "2026-10-01": { a: 3 } } })), false);
  assert.equal(shouldOfferTour(migrate({ runs: [{ at: 1, n: 10 }] })), false);
  /* A day that was only opened is not practice. */
  assert.equal(shouldOfferTour(migrate({ days: { "2026-10-01": { a: 0, lg: 1 } } })), true);
});

test("the first run is offered once: begun it comes back after a reload; done or skipped, never", () => {
  const S = blankState();
  noteTour(S, "open", { now: T0, day: "2026-11-16" });
  assert.deepEqual(S.tour, { st: "open", at: T0, d: "2026-11-16", placed: 0, year: null });
  assert.equal(shouldOfferTour(S), true);
  /* The round's answers do not end the offer: the pupil is no longer "new",
     and the record is what says the first run is still open. */
  S.totalAnswers = 7; S.xp = 60;
  assert.equal(shouldOfferTour(migrate(JSON.parse(JSON.stringify(S)))), true);
  noteTour(S, "open", { now: T0 + 1, placed: 1, year: 9 });
  assert.equal(S.tour.placed, 1); assert.equal(S.tour.year, 9); assert.equal(S.tour.d, "2026-11-16");
  noteTour(S, "done", { now: T0 + 2 });
  assert.equal(S.tour.st, "done");
  assert.equal(S.tour.placed, 1, "ending the first run forgot the placement");
  assert.equal(S.tour.year, 9);
  assert.equal(shouldOfferTour(S), false);
  assert.equal(shouldOfferTour(migrate(JSON.parse(JSON.stringify(S)))), false);
  const K = blankState();
  noteTour(K, "skipped", { now: T0, day: "2026-11-16" });
  assert.equal(shouldOfferTour(K), false);
  /* Opening it again from Stillingar does not un-end it. */
  noteTour(K, "open", { now: T0 + 9 });
  assert.equal(K.tour.st, "skipped");
  assert.equal(K.tour.at, T0);
  assert.throws(() => noteTour(K, "kannski"));
});

test("a teacher and an administrator are not placed; a pupil on a server is", () => {
  const S = blankState();
  assert.equal(shouldOfferTour(S, { role: "teacher" }), false);
  assert.equal(shouldOfferTour(S, { role: "admin" }), false);
  assert.equal(shouldOfferTour(S, { role: "learner" }), true);
  assert.equal(shouldOfferTour(S, { role: null }), true);
});

test("only a real record is believed", () => {
  assert.equal(cleanTour(null), null);
  assert.equal(cleanTour("done"), null);
  assert.equal(cleanTour([]), null);
  assert.equal(cleanTour({ st: "kannski", at: 5 }), null);
  assert.deepEqual(cleanTour({ st: "done", at: 1e99, d: "í gær", placed: "já", year: 11, extra: "x".repeat(999) }),
    { st: "done", at: 1e13, d: null, placed: 1, year: null });
  assert.deepEqual(cleanTour({ st: "skipped", at: -4, d: "2026-11-16", year: 10 }),
    { st: "skipped", at: 0, d: "2026-11-16", placed: 0, year: 10 });
  assert.equal(migrate({ tour: { st: "done" } }).tour.st, "done");
  assert.equal(migrate({ tour: { st: "?" } }).tour, null);
  assert.equal(migrate({ tour: "done" }).tour, null);
});

test("two devices: a first run ended on one is ended on both", () => {
  const open = { st: "open", at: T0 + 5000, d: "2026-11-16", placed: 0, year: null };
  const done = { st: "done", at: T0, d: "2026-11-15", placed: 1, year: 9 };
  const skipped = { st: "skipped", at: T0 + 100, d: "2026-11-16", placed: 0, year: null };
  /* The one that ended wins over the one that is only open, though it is older. */
  assert.equal(mergeTour(open, done).st, "done");
  assert.equal(mergeTour(done, open).st, "done");
  assert.equal(mergeTour(open, skipped).st, "skipped");
  /* Of two that ended it, the later; and a placement made on either is kept. */
  const m = mergeTour(done, skipped);
  assert.equal(m.st, "skipped");
  assert.equal(m.placed, 1);
  assert.equal(m.year, 9);
  assert.deepEqual(mergeTour(null, done), done);
  assert.deepEqual(mergeTour(done, null), done);
  assert.equal(mergeTour(null, null), null);
  assert.equal(mergeTour({ st: "bull" }, null), null);
});

test("the record goes through the three-way merge, in both directions", () => {
  const base = blankState();
  const phone = JSON.parse(JSON.stringify(base)), laptop = JSON.parse(JSON.stringify(base));
  noteTour(phone, "done", { now: T0, day: "2026-11-16", placed: 1, year: 8 });
  /* The laptop was opened too, and the welcome is on its screen. */
  noteTour(laptop, "open", { now: T0 + 60000, day: "2026-11-16" });
  for (const [l, r] of [[laptop, phone], [phone, laptop]]) {
    const m = migrate(mergeStates(base, l, r));
    assert.equal(m.tour.st, "done");
    assert.equal(m.tour.placed, 1);
    assert.equal(shouldOfferTour(m), false);
  }
  /* Neither device has met it: still nothing. */
  assert.equal(mergeStates(base, blankState(), blankState()).tour, null);
  /* An old device that knows nothing of the record does not erase it. */
  const oldDevice = JSON.parse(JSON.stringify(base));
  delete oldDevice.tour;
  assert.equal(mergeStates(base, oldDevice, phone).tour.st, "done");
  assert.equal(mergeStates(base, phone, oldDevice).tour.st, "done");
});

test("the server keeps the record, and nothing else in its place", () => {
  const S = blankState();
  noteTour(S, "done", { now: T0, day: "2026-11-16", placed: 1, year: 9 });
  const today = new Date(T0);
  const stored = cleanState(JSON.parse(JSON.stringify(S)), { today });
  assert.deepEqual(stored.tour, S.tour);
  assert.equal(shouldOfferTour(stored), false, "after a round trip through the server the first run would open again");
  /* A pupil who has not met it stays one who has not. */
  assert.equal(cleanState(JSON.parse(JSON.stringify(blankState())), { today }).tour, null);
  /* Junk is dropped; a day and a time in the future are held to the calendar. */
  assert.equal(cleanState({ ...JSON.parse(JSON.stringify(S)), tour: { st: "done", html: "<script>" } }, { today }).tour.html, undefined);
  assert.equal(cleanState({ ...JSON.parse(JSON.stringify(S)), tour: "done" }, { today }).tour, null);
  const future = cleanState({ ...JSON.parse(JSON.stringify(S)), tour: { st: "done", at: T0 + 400 * 86400000, d: "2031-01-01" } }, { today });
  assert.equal(future.tour.st, "done");
  assert.equal(future.tour.d, null);
  assert.ok(future.tour.at <= T0 + 2 * 86400000);
});

/* ---------- the round inside the app's rules -------------------------------------- */

test("a question of the round is not offered a second try", () => {
  /* A written cloze answered wrong: the ordinary session offers a retry … */
  const task = { type: "fill", typeId: "fill", skill: "nafnord" };
  const wrong = { ok: false, pending: false };
  const usual = retryAllowed(task, wrong);
  assert.equal(usual, true, "the test's cloze is not one a session would offer a second try on");
  /* … the round does not: the first answer is the one it learns from. */
  assert.equal(retryAllowed({ ...task, placement: true }, wrong), false);
  assert.equal(typeof judge, "function");
});

test("the round's topic is not a skill or a topic of the picker, so it can never be saved as one", () => {
  assert.ok(!SKILL_IDS.includes(PLACEMENT_TOPIC));
  assert.ok(!["blandad", "villur", "dagsins", "verkefni"].includes(PLACEMENT_TOPIC));
});

/* ---------- the words ------------------------------------------------------------- */

const allText = (o) => Object.values(o).flatMap((v) =>
  typeof v === "string" ? [v] : Array.isArray(v) ? v : typeof v === "function" ? [String(v(3, 12))] : allText(v));

test("the round is framed gently: not a test, no grade, and not a word about XP", () => {
  assert.match(TEXT.intro.body, /ekki próf/);
  assert.match(TEXT.intro.body, /enga einkunn/);
  assert.match(TEXT.intro.body, /bara til að finna réttan byrjunarstað/);
  assert.match(TEXT.intro.how, /eðlilegt að kunna ekki allt/);
  const every = allText(TEXT).join(" \n ");
  assert.doesNotMatch(every, /\bXP\b/);
  assert.doesNotMatch(every, /einkunnin þín|féll|fall á prófi|mistókst/i);
  assert.match(TEXT.intro.lead(13), /13 stuttar spurningar/);
});

test("the welcome declines \"þú\" as BÍN does", () => {
  const w = lex.lookup("þú", "pfn");
  const forms = ["NFET", "ÞFET", "ÞGFET", "EFET"].map((m) => w.forms[m][0]);
  assert.deepEqual(forms, ["þú", "þig", "þér", "þín"]);
  const c = TEXT.welcome.chant;
  assert.deepEqual([c[1], c[3], c[5], c[7]], forms);
  /* um + þolfall, frá + þágufall, til + eignarfall — the page's own tagline. */
  assert.deepEqual([c[2], c[4], c[6]], ["um", "frá", "til"]);
});

test("there is a pointer text for each of the four parts, and each names its part", () => {
  assert.deepEqual(TOUR_STEPS, ["today", "lessons", "map", "line"]);
  assert.deepEqual(Object.keys(TEXT.steps), TOUR_STEPS);
  assert.match(TEXT.steps.today.title, /Lota dagsins/);
  assert.match(TEXT.steps.lessons.title, /Lesefni/);
  assert.match(TEXT.steps.map.title, /Færnikort/);
  assert.match(TEXT.steps.map.body, /fyrsta flipanum, Færnikort/);
  assert.match(TEXT.steps.line.body, /×/);
  for (const s of Object.values(TEXT.steps)) assert.ok(s.body.length < 260, "a pointer's text is too long to read on a phone");
});

test("what the pointers name is what the page calls it", () => {
  const body = readFileSync(new URL("../src/body.html", import.meta.url), "utf8");
  const session = readFileSync(new URL("../src/js/ui/session.js", import.meta.url), "utf8");
  const lessons = readFileSync(new URL("../src/js/ui/lessons.js", import.meta.url), "utf8");
  assert.match(session, /nm: "Lota dagsins"/);
  assert.match(body, /data-view="lessons">Lesefni</);
  assert.match(body, /data-pane="stats"[^>]*>Framvinda</);
  assert.match(body, /data-view="map">Færnikort</);
  assert.match(lessons, /Æfa þetta/);
  assert.match(TEXT.steps.lessons.body, /„Æfa þetta“/);
  /* Stillingar has the way back in, by the name the skipped notice gives it. */
  assert.match(body, /id="tour-again">Sýna kynninguna aftur</);
  assert.match(TEXT.skipped, /„Sýna kynninguna aftur“/);
});

/* ---------- review of v6.13, S5: one answer is not evidence -------------------- */

test("S5: SKILL_UP needs two answers in the skill; the reviewer's pupil is no longer shown þyngd 5 in seven skills", () => {
  assert.equal(SKILL_UP_MIN, 2);
  /* 10 of 13 right, the level never above 4.5: what the reviewer saw. Find
     such a round among all answer strings with three misses. */
  const plan = placementPlan(YEAR8);
  let seen = 0;
  for (let a = 0; a < plan.length; a++) for (let b = a + 1; b < plan.length; b++) for (let c = b + 1; c < plan.length; c++) {
    const seq = plan.map((_, i) => (i === a || i === b || i === c ? "0" : "1")).join("");
    const st = play(round(YEAR8), seq);
    const r = placementResult(st);
    const by = {};
    st.hist.forEach((h) => (by[h.skill] ||= []).push(h));
    for (const [skill, list] of Object.entries(by)) {
      const v = r.levels[skill];
      if (list.length === 1) assert.ok(v.level <= r.general, `${seq} ${skill}: one answer raised it`);
      /* Never shown above the highest level the round asked anything at. */
      const top = Math.max(...st.hist.map((h) => h.level));
      assert.ok(shownBand(v.level) <= top, `${seq} ${skill}: shown ${shownBand(v.level)}, round asked at most ${top}`);
    }
    if (Math.max(...st.hist.map((h) => h.level)) <= 4.5) {
      seen++;
      const fives = Object.values(r.levels).filter((v) => shownBand(v.level) >= 5).length;
      assert.equal(fives, 0, `${seq}: shown þyngd 5 in ${fives} skills, never asked above 4.5`);
    }
  }
  assert.ok(seen > 0, "the reviewer's case is among the rounds tried");
});

test("S5: a placed level is shown rounded down, inside 1…top", () => {
  assert.deepEqual([1, 1.5, 2, 4.5, 5, 6.5, 7].map((l) => shownBand(l)), [1, 1, 2, 4, 5, 6, 7]);
  assert.equal(shownBand(6.5, 5), 5, "held under the policy's top");
  assert.equal(shownBand(0.5), 1);
  /* The result card draws it with this function, not Math.round. */
  const ui = readFileSync(new URL("../src/js/ui/tour.js", import.meta.url), "utf8");
  assert.match(ui, /shownBand\(result\.levels\[s\.id\]\.level, top\)/);
  assert.doesNotMatch(ui, /Math\.round\(result\.levels/);
});
