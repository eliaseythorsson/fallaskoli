/* Hard words (issue #17, core/wordknowledge.js `hardRule`).
 *
 *   1. the rule, pure, over a word's entries: three wrong answers in any
 *      question types within fourteen days; only misses after the last
 *      detection count toward the next; when it stops being hard;
 *   2. its reason is Icelandic, names the numbers and never a day (#43; the
 *      guardian reads it);
 *   3. on an answer (core/answer.js `settle`): the first detection is handed
 *      to the screen as "Þrjár í röð", the second sends the word back to the
 *      intensive phase with its Orðakort owed again — for every word;
 *   4. "Þrjár í röð" on a word can be built (tasks/drill.js `wordStreakTasks`);
 *   5. the guardian's list (`hardWords`, ui/skillmap.js `hardWordsHTML`).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, newSession, todayKey } from "../src/js/core/state.js";
import { createPolicy } from "../src/js/core/policy.js";
import { seeded } from "../src/js/core/duel.js";
import { makeView, wordStreakTasks } from "../src/js/tasks/index.js";
import { SKILL_IDS } from "../src/js/core/skills.js";
import { settle } from "../src/js/core/answer.js";
import { addDays } from "../src/js/core/review.js";
import { saveCard } from "../src/js/core/wordcard.js";
import { startWordStreak, stepStreak, streakEntry, STREAK_N } from "../src/js/core/streak.js";
import { hardWordsHTML } from "../src/js/ui/skillmap.js";
import {
  HARD_WRONG, HARD_DAYS, HARD_CLEAR, LEARNED_LAST,
  hardDetections, hardRule, hardStatus, hardWords, noteHard, comeBack, owesCard,
  enterLearning, leaveLearning, wordsInLearning, isInLearning, learningStatus, fillLearning,
  sanitiseLearning, mergeLearning, LEARNING_SIZE,
} from "../src/js/core/wordknowledge.js";

const lex = buildLexicon(DATA);
const D = (k) => addDays("2026-11-01", k);
const R = "r", W = "w", SEEN = "s";
const e = (day, type, outcome = W) => ({ day, type, outcome });

/* ---------- 1. the rule ------------------------------------------------------ */

test("the constants are the plan's (docs/DLD-PLAN.md §1 Hard words)", () => {
  assert.deepEqual([HARD_WRONG, HARD_DAYS], [3, 14]);
  assert.equal(HARD_CLEAR, LEARNED_LAST, "it stops being hard by the learned rule's own line");
});

test("three wrong answers within fourteen days, in any types: hard", () => {
  const list = [e(D(0), "fill"), e(D(0), "fill", R), e(D(5), "tbl_no"), e(D(13), "or_eyda")];
  const r = hardRule(list);
  assert.equal(r.status, "hard");
  assert.equal(r.times, 1);
  assert.equal(r.fresh, true, "the last entry made it");
  assert.deepEqual(hardDetections(list), [{ at: 3, day: D(13), types: ["fill", "tbl_no", "or_eyda"] }]);
  assert.equal(r.why, "3 röng svör innan 14 daga, í 3 gerðum spurninga; ekkert svar síðan");
});

test("three in one type count as well: across types means whatever type", () => {
  const r = hardRule([e(D(0), "fill"), e(D(0), "fill"), e(D(1), "fill")]);
  assert.equal(r.status, "hard");
  assert.match(r.why, /í 1 gerð spurninga/);
});

test("misses further apart than fourteen days are not hard", () => {
  /* Day 0 and day 14 are fifteen days: the window is 14 days, both ends in. */
  const r = hardRule([e(D(0), "fill"), e(D(7), "fill"), e(D(14), "fill")], D(14));
  assert.equal(r.status, "not-hard");
  assert.equal(r.times, 0);
  assert.equal(r.why, "2 röng svör síðustu 14 daga; orð er erfitt eftir 3 röng svör");
  assert.equal(hardRule([e(D(1), "fill"), e(D(7), "fill"), e(D(14), "fill")]).status, "hard", "day 1 to day 14 is in");
});

test("right and seen answers count for nothing toward hard", () => {
  const r = hardRule([e(D(0), "fill"), e(D(0), "meaning", SEEN), e(D(0), "meaning", SEEN), e(D(1), "fill", R),
    e(D(1), "parse")]);
  assert.equal(r.status, "not-hard");
  assert.equal(hardRule([], D(3)).why, "ekkert rangt svar síðustu 14 daga; orð er erfitt eftir 3 röng svör");
});

test("after a detection only new misses count: the fourth is not a second detection", () => {
  const first = [e(D(0), "fill"), e(D(0), "fill"), e(D(0), "fill")];
  const four = hardRule([...first, e(D(0), "parse")]);
  assert.equal(four.times, 1);
  assert.equal(four.fresh, false, "the fourth miss is not a new detection");
  const six = hardRule([...first, e(D(1), "parse"), e(D(2), "parse"), e(D(3), "tbl_no")]);
  assert.equal(six.times, 2);
  assert.equal(six.fresh, true);
  assert.match(six.why, /\(2\. skiptið\)/);
});

test("it stops being hard after three right in a row since, one of them on a later day", () => {
  const hard = [e(D(0), "fill"), e(D(0), "fill"), e(D(0), "fill")];
  /* The three of "Þrjár í röð" the same afternoon: still hard. */
  const same = hardRule([...hard, e(D(0), "fill", R), e(D(0), "parse", R), e(D(0), "tbl_no", R)]);
  assert.equal(same.status, "hard");
  assert.equal(same.why, "3 röng svör innan 14 daga, í 1 gerð spurninga; síðan síðustu 3 svör rétt, en öll sama dag");
  const later = hardRule([...hard, e(D(0), "fill", R), e(D(0), "parse", R), e(D(2), "tbl_no", R)]);
  assert.equal(later.status, "not-hard");
  assert.equal(later.times, 1, "the detection is not forgotten");
  assert.equal(later.why, "var erfitt: 3 röng svör innan 14 daga, í 1 gerð spurninga; síðan síðustu 3 svör rétt");
  const mixed = hardRule([...hard, e(D(1), "fill", R), e(D(2), "parse"), e(D(3), "tbl_no", R)]);
  assert.equal(mixed.status, "hard");
  assert.match(mixed.why, /síðan 2 af síðustu 3 rétt$/);
  assert.match(hardRule([...hard, e(D(1), "fill", R)]).why, /síðan 1 af 1 svar rétt$/);
});

test("the reason never names a day (the guardian reads it)", () => {
  const list = [e(D(0), "fill"), e(D(3), "parse"), e(D(4), "tbl_no"), e(D(9), "fill", R)];
  const { why } = hardRule(list);
  assert.doesNotMatch(why, /\d{4}|\d+\.\d+\./);
});

/* ---------- 3. on an answer ------------------------------------------------- */

const WORD = "hluti|kk";
const allOn = () => { const S = blankState(); SKILL_IDS.forEach((id) => { S.enabled[id] = true; }); return S; };
/** A pupil whose history of WORD is `entries`. */
function pupilWith(entries, word = WORD) {
  const S = allOn();
  S.wordKnowledge = { [word]: { c: 0, w: 0, e: entries.map((x) => [x.day, x.type, x.outcome]) } };
  return S;
}
/** A wrong answer about `word`, settled today. */
function missToday(S, word = WORD, typeId = "fill") {
  const task = { type: "gap", typeId, skill: "nafnord", word };
  const j = { ok: false, findings: [], xp: 0, finish: { correct: false },
    effects: [{ do: "record", skill: "nafnord", word, ok: false }] };
  return settle(S, newSession(S), task, j);
}

test("settle: the first detection asks the screen for 'Þrjár í röð', and changes nothing saved but the entry", () => {
  const today = todayKey();
  const S = pupilWith([e(today, "fill"), e(today, "parse")]);
  const before = JSON.stringify(S.learning || {});
  const out = missToday(S);
  assert.equal(out.hard.length, 1);
  assert.deepEqual([out.hard[0].word, out.hard[0].times, out.hard[0].action], [WORD, 1, "streak"]);
  assert.equal(JSON.stringify(S.learning || {}), before, "the six are untouched");
  assert.equal(hardStatus(S, WORD).status, "hard");
  /* The next miss is not a detection. */
  assert.equal(missToday(S).hard, undefined);
});

test("settle: the second detection sends the word back to the intensive phase, its card owed again", () => {
  const today = todayKey();
  const yesterday = addDays(today, -1);
  /* Detected once yesterday, then two more misses: this is the third. */
  const S = pupilWith([e(yesterday, "fill"), e(yesterday, "fill"), e(yesterday, "fill"),
    e(today, "parse"), e(today, "tbl_no")]);
  saveCard(S, WORD, { rating: 1, answers: {} }, yesterday);
  enterLearning(S, WORD, addDays(today, -30));
  leaveLearning(S, WORD, addDays(today, -20));
  const out = missToday(S);
  assert.deepEqual([out.hard[0].times, out.hard[0].action], [2, "learning"]);
  assert.ok(isInLearning(S, WORD), "back in the six");
  assert.equal(S.learning[WORD].d, today, "its learned rule counts from today");
  assert.equal(owesCard(S, WORD, 1), true, "the card it did once is owed again");
  assert.equal(owesCard(S, WORD, 2), false, "and done again, it is not");
  assert.match(learningStatus(S, WORD).why, /kom aftur af því að það var erfitt/);
});

test("every word, not only LÍNO-2: a word the six never had comes into them too", () => {
  const word = "hestur|kk";
  const S = allOn();
  assert.equal(comeBack(S, word, D(0), 0), true);
  assert.ok(isInLearning(S, word));
  assert.equal(owesCard(S, word, 0), true);
});

test("a word in learning already, or of a class never in learning, gets 'Þrjár í röð' again", () => {
  const today = todayKey();
  const misses = [e(today, "fill"), e(today, "fill"), e(today, "fill"), e(today, "fill"), e(today, "fill")];
  const S = pupilWith(misses);
  enterLearning(S, WORD, today);
  const out = missToday(S);
  assert.deepEqual([out.hard[0].times, out.hard[0].action], [2, "streak"]);
  const P = pupilWith(misses, "hann|pfn");
  const outP = missToday(P, "hann|pfn", "tbl_fn");
  assert.deepEqual([outP.hard[0].times, outP.hard[0].action], [2, "streak"]);
  assert.ok(!isInLearning(P, "hann|pfn"), "a pronoun is not vocabulary of the six");
});

test("the six stay six: the word that entered last is put back, and enters again when there is room", () => {
  const S = allOn();
  fillLearning(S, lex, { level: 7, today: D(0) });
  const six = wordsInLearning(S);
  assert.equal(six.length, LEARNING_SIZE);
  /* The last to enter, by day: make one newer. */
  enterLearning(S, "tími|kk", D(1));
  assert.equal(wordsInLearning(S).length, LEARNING_SIZE + 1);
  fillLearning(S, lex, { level: 7, today: D(1) });          // trims back to six
  const before = wordsInLearning(S);
  assert.equal(before.length, LEARNING_SIZE);
  const newest = before[before.length - 1];
  assert.ok(comeBack(S, "hestur|kk", D(2), 0));
  const after = wordsInLearning(S);
  assert.equal(after.length, LEARNING_SIZE);
  assert.ok(after.includes("hestur|kk"));
  assert.ok(!after.includes(newest), "the newest other word made room");
  assert.equal(learningStatus(S, newest).status, "put-back");
  /* A merge that leaves seven never puts the word that came back out. */
  enterLearning(S, newest, D(3));
  fillLearning(S, lex, { level: 7, today: D(3) });
  assert.ok(isInLearning(S, "hestur|kk"));
  assert.equal(wordsInLearning(S).length, LEARNING_SIZE);
});

test("the card owed is kept through a load and a merge", () => {
  const S = allOn();
  comeBack(S, WORD, D(0), 2);
  assert.equal(S.learning[WORD].c, 3);
  assert.deepEqual(sanitiseLearning(S.learning)[WORD], S.learning[WORD]);
  assert.deepEqual(mergeLearning({}, S.learning, {})[WORD], S.learning[WORD]);
  /* Only a word in learning owes one. */
  assert.equal(sanitiseLearning({ [WORD]: { s: "k", d: D(0), n: 2, c: 3 } })[WORD].c, undefined);
});

test("noteHard is pure apart from S.learning, and acts only on a fresh detection", () => {
  const S = pupilWith([e(D(0), "fill"), e(D(0), "fill"), e(D(0), "fill"), e(D(0), "fill", R)]);
  const was = JSON.stringify(S);
  assert.deepEqual(noteHard(S, [{ word: WORD, outcome: R }], D(0)), [], "a right answer detects nothing");
  assert.deepEqual(noteHard(S, [{ word: WORD, outcome: W }], D(0)), [], "the last entry made no detection");
  assert.equal(JSON.stringify(S), was);
});

/* ---------- 4. "Þrjár í röð" on a word ----------------------------------------- */

test("'Þrjár í röð' on a word: three questions, each about that word, none of them the meaning question", () => {
  const S = allOn();
  const sess = newSession(S);
  Object.keys(sess.diff).forEach((x) => { sess.diff[x] = 3; });
  const all = Object.fromEntries(SKILL_IDS.map((id) => [id, true]));
  const policy = createPolicy(null, { skills: all, types: {}, levels: {}, attrs: {}, safeVocab: null });
  const entry = lex.lookup("hestur", "kk");
  const tasks = wordStreakTasks(lex, makeView({ S, sess, policy, today: D(0) }), seeded(5), entry, STREAK_N);
  assert.ok(tasks, "built");
  assert.equal(tasks.length, STREAK_N);
  for (const { task } of tasks) {
    assert.equal(task.word, "hestur|kk");
    assert.equal(task.streak, "hestur|kk");
    assert.notEqual(task.type, "meaning");
    assert.equal(task.drill, false, "not reported as a rescue drill");
  }
  for (let k = 1; k < tasks.length; k++) assert.notEqual(tasks[k].task.typeId, tasks[k - 1].task.typeId,
    "never the same word in the same type twice in a row (#10)");
});

test("the run of three on a word: counted like a pattern's, nothing queued when it ends", () => {
  const st = startWordStreak(WORD, "hluti");
  assert.deepEqual([st.w, st.nm, st.intro, st.n], [WORD, "hluti", false, STREAK_N]);
  stepStreak(st, true); stepStreak(st, false); stepStreak(st, true);
  assert.deepEqual([st.done, st.c], [true, 2]);
  assert.equal(streakEntry(st), null, "the miss is in the review queue already");
});

/* ---------- 5. the guardian's list ------------------------------------------- */

test("hardWords lists the words hard now, the one hard most often first; not one that stopped", () => {
  const S = allOn();
  const miss3 = (d) => [e(d, "fill"), e(d, "fill"), e(d, "fill")];
  S.wordKnowledge = {
    "hestur|kk": { c: 0, w: 3, e: miss3(D(0)).map((x) => [x.day, x.type, x.outcome]) },
    "hluti|kk": { c: 0, w: 6, e: [...miss3(D(0)), ...miss3(D(1))].map((x) => [x.day, x.type, x.outcome]) },
    "kona|kvk": { c: 3, w: 3, e: [...miss3(D(0)), e(D(1), "fill", R), e(D(1), "fill", R), e(D(2), "fill", R)]
      .map((x) => [x.day, x.type, x.outcome]) },
    "bók|kvk": { c: 0, w: 1, e: [[D(0), "fill", W]] },
  };
  const list = hardWords(S);
  assert.deepEqual(list.map((x) => [x.word, x.lemma, x.times]), [["hluti|kk", "hluti", 2], ["hestur|kk", "hestur", 1]]);
  const html = hardWordsHTML(list.map(({ lemma, word, why }) => ({ lemma, cls: word.split("|")[1], why })), "Anna");
  assert.match(html, /Erfið orð/);
  assert.match(html, /<b>hluti<\/b>/);
  assert.match(html, /Anna sér ekki þennan lista/);
  assert.match(hardWordsHTML([], "Anna"), /Ekkert orð er erfitt núna/);
  assert.doesNotMatch(html, /2026-/, "no date");
});
