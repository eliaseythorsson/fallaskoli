/* The learned rule (issue #16, core/wordknowledge.js `learnedRule`).
 *
 *   1. the rule itself, pure, over a word's entries: four types by catalogue
 *      id, one of them recall, on two days, the last three right — and each
 *      way of falling short;
 *   2. only the entries since the word entered the six count;
 *   3. on an answer (core/answer.js `settle`) a learned word leaves the six,
 *      joins the review queue (core/review.js) and a new word takes its place
 *      at the next filling, card first (#15);
 *   4. the reason is in Icelandic and names the numbers (#43).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, newSession, todayKey } from "../src/js/core/state.js";
import { createPolicy } from "../src/js/core/policy.js";
import { seeded } from "../src/js/core/duel.js";
import { makeView } from "../src/js/tasks/index.js";
import { reviewTask } from "../src/js/tasks/review.js";
import { LEARNER_WORDS, giveWords } from "./learner.js";
import { SKILL_IDS } from "../src/js/core/skills.js";
import { settle } from "../src/js/core/answer.js";
import { isRecall } from "../src/js/core/catalogue.js";
import { dueEntries, entryByKey, addDays, noteReview, queueWord, INTERVALS } from "../src/js/core/review.js";
import {
  LEARNED_TYPES, LEARNED_RECALL, LEARNED_DAYS, LEARNED_LAST,
  learnedRule, checkLearned, noteLearned, fillLearning, enterLearning, leaveLearning, wordsInLearning,
  wordsLearned, isInLearning, learningStatus, LEARNING_SIZE,
} from "../src/js/core/wordknowledge.js";

const lex = buildLexicon(DATA);
const D1 = "2026-11-24", D2 = "2026-11-25", D3 = "2026-11-26";
const R = "r", W = "w", SEEN = "s";
/** An entry. */
const e = (day, type, outcome = R) => ({ day, type, outcome });
/** A history that just earns it: four types, one recall, two days, all right. */
const EARNED = [e(D1, "fill"), e(D1, "or_eyda"), e(D2, "no_val"), e(D2, "or_merking")];

test("the thresholds are the plan's (docs/DLD-PLAN.md §1 Learned)", () => {
  assert.deepEqual([LEARNED_TYPES, LEARNED_RECALL, LEARNED_DAYS, LEARNED_LAST], [4, 1, 2, 3]);
  assert.ok(isRecall("or_eyda") && !isRecall("fill") && !isRecall("or_merking"));
});

test("four types, one of them recall, on two days, the last three right: learned", () => {
  const r = learnedRule(EARNED);
  assert.equal(r.status, "learned");
  assert.equal(r.recallType, "or_eyda");
  assert.equal(r.why, "rétt í 4 gerðum spurninga, þar af 1 án þess að sjá orðið, á 2 dögum; síðustu 3 svör rétt");
});

test("all on one day is not learned, however many types", () => {
  const r = learnedRule([...EARNED.map((x) => ({ ...x, day: D1 })), e(D1, "umritun")]);
  assert.equal(r.status, "learning");
  assert.match(r.why, /á 1 af 2 dögum/);
});

test("without a recall type it is not learned", () => {
  const r = learnedRule([e(D1, "fill"), e(D1, "no_val"), e(D2, "or_merking"), e(D2, "umritun"), e(D3, "lo_beyging")]);
  assert.equal(r.status, "learning");
  assert.equal(r.recallType, null);
  assert.equal(r.why, "rétt í 5 gerðum spurninga, engin þeirra án þess að sjá orðið, á 3 dögum; síðustu 3 svör rétt");
  /* A recall answer that was wrong is no recall type. */
  assert.equal(learnedRule([e(D1, "or_eyda", W), e(D1, "fill"), e(D2, "no_val"), e(D2, "or_merking"),
    e(D2, "umritun"), e(D2, "fill"), e(D2, "fill")]).status, "learning");
});

test("a wrong answer among the last three keeps it in learning, until three right follow", () => {
  for (const at of [0, 1, 2]) {
    const tail = [e(D2, "fill"), e(D2, "fill"), e(D2, "fill")];
    tail[at] = e(D2, "fill", W);
    const r = learnedRule([...EARNED, ...tail]);
    assert.equal(r.status, "learning", `wrong at ${at}`);
    assert.match(r.why, /2 af síðustu 3 rétt/);
  }
  /* The wrong answer may be in any type: the last three are of any type. */
  assert.equal(learnedRule([...EARNED, e(D2, "villur", W)]).status, "learning");
  /* Three right after it: learned. */
  assert.equal(learnedRule([...EARNED, e(D2, "fill", W), e(D3, "fill"), e(D3, "fill"), e(D3, "fill")]).status, "learned");
});

test("fewer than three judged answers is never learned", () => {
  assert.equal(learnedRule([]).status, "learning");
  assert.match(learnedRule([]).why, /ekkert svar enn/);
  assert.match(learnedRule([e(D1, "or_eyda"), e(D2, "fill")]).why, /aðeins 2 svör/);
});

test("types are counted by catalogue id: the same type twice is one, an unknown id is none", () => {
  const same = [e(D1, "or_eyda"), e(D1, "fill"), e(D2, "fill"), e(D2, "fill"), e(D2, "no_val")];
  assert.equal(learnedRule(same).status, "learning");
  assert.match(learnedRule(same).why, /rétt í 3 af 4 gerðum/);
  const gone = [e(D1, "or_eyda"), e(D1, "fill"), e(D2, "no_val"), e(D2, "not_a_type")];
  assert.equal(learnedRule(gone).status, "learning", "an id the catalogue lacks counts for nothing");
});

test("seen, not judged, counts for nothing: neither a type nor one of the last three", () => {
  const r = learnedRule([...EARNED, e(D3, "meaning", SEEN), e(D3, "meaning", SEEN)]);
  assert.equal(r.status, "learned");
  const onlySeen = [e(D1, "or_eyda"), e(D1, "fill"), e(D2, "no_val"), e(D2, "meaning", SEEN)];
  assert.equal(learnedRule(onlySeen).status, "learning");
});

test("a right answer the same day as the first does not make a second day", () => {
  const r = learnedRule([e(D1, "fill"), e(D1, "or_eyda"), e(D1, "no_val"), e(D1, "or_merking"), e(D2, "fill", W),
    e(D2, "fill", W), e(D2, "fill", W)]);
  assert.match(r.why, /á 1 af 2 dögum/, "wrong answers on day two do not count as a day");
});

/* ---------- in the state ---------------------------------------------------- */

const WORD = "hluti|kk";
function pupilWith(entries, entered = D1) {
  const S = blankState();
  SKILL_IDS.forEach((id) => { S.enabled[id] = true; });
  enterLearning(S, WORD, entered);
  S.wordKnowledge = { [WORD]: { c: 0, w: 0, e: entries.map((x) => [x.day, x.type, x.outcome]) } };
  return S;
}

test("only the entries since the word entered the six count", () => {
  assert.equal(checkLearned(pupilWith(EARNED, D1), WORD).status, "learned");
  /* Entered on the second day: the first day's answers were before. */
  assert.equal(checkLearned(pupilWith(EARNED, D2), WORD).status, "learning");
  assert.equal(checkLearned(blankState(), WORD), null, "not in learning: no rule");
});

test("noteLearned moves a learned word out of the six, and leaves the rest", () => {
  const S = pupilWith(EARNED);
  enterLearning(S, "tími|kk", D1);
  const out = noteLearned(S, D3);
  assert.deepEqual(out.map((x) => [x.word, x.recallType]), [[WORD, "or_eyda"]]);
  assert.ok(!isInLearning(S, WORD) && isInLearning(S, "tími|kk"));
  assert.deepEqual(wordsLearned(S), [WORD]);
  assert.equal(learningStatus(S, WORD).status, "learned");
  assert.deepEqual(noteLearned(S, D3), [], "once");
});

test("queueWord: a learned word is a review entry due tomorrow, asked by name in its recall type", () => {
  const S = blankState();
  const k = queueWord(S, { w: WORD, t: "or_eyda", sk: "ordaford" }, D3);
  assert.equal(k, `w:or_eyda|${WORD}`);
  assert.deepEqual(dueEntries(S, D3), [], "not today");
  const [due] = dueEntries(S, addDays(D3, INTERVALS[0]));
  assert.equal(due.k, k);
  assert.equal(due.w, WORD);
  assert.equal(due.s, 0);
  assert.equal(queueWord(S, { w: WORD, t: "or_eyda" }, D3), k);
  assert.equal(S.review.items.length, 1, "not twice");
  /* Asked as that review and answered right: it moves on, 1 → 3. */
  const task = { type: "gap", typeId: "or_eyda", skill: "ordaford", word: WORD, cell: "orð:eyða", review: k };
  const r = noteReview(S, task, { ok: true, findings: [], effects: [] }, addDays(D3, 1));
  assert.deepEqual(r.passed, [{ k, next: INTERVALS[1] }]);
});

test("settle: the answer that earns it moves the word to 'Ég kann' and into the review queue; a new word follows its card", () => {
  const today = todayKey();
  const before = addDays(today, -1);
  /* Three types (one recall) yesterday; today's fourth type finishes it. */
  const S = pupilWith([e(before, "fill"), e(before, "or_eyda"), e(before, "no_val")], before);
  fillLearning(S, lex, { level: 3, today: before });
  assert.equal(wordsInLearning(S).length, LEARNING_SIZE);
  const sess = newSession(S);
  const task = { type: "choice", typeId: "or_merking", skill: "ordaford", word: WORD };
  const j = { ok: true, findings: [], xp: 0, finish: { correct: true },
    effects: [{ do: "record", skill: "ordaford", word: WORD, ok: true }] };
  const out = settle(S, sess, task, j);
  assert.deepEqual(out.learned, [WORD]);
  assert.ok(!isInLearning(S, WORD));
  assert.deepEqual(wordsLearned(S), [WORD], "'Orðin mín' shows it under Ég kann");
  assert.equal(wordsInLearning(S).length, LEARNING_SIZE - 1, "the new word waits for the next filling");
  const entry = S.review.items.find((x) => x.w === WORD);
  assert.ok(entry, "in the review queue");
  assert.equal(entry.t, "or_eyda");
  assert.equal(entry.due, addDays(today, 1));
  /* The next filling: a word enters only when its card is done (#15). */
  const next = fillLearning(S, lex, { level: 3, today, ready: () => false });
  assert.deepEqual(next.entered, [], "no card, no word");
  const filled = fillLearning(S, lex, { level: 3, today });
  assert.equal(filled.entered.length, 1);
  assert.notEqual(filled.entered[0], WORD, "the learned word does not come back");
  assert.equal(wordsInLearning(S).length, LEARNING_SIZE);
});

test("settle: an answer that does not finish it changes nothing in the six", () => {
  const today = todayKey();
  const S = pupilWith([e(today, "fill"), e(today, "or_eyda"), e(today, "no_val")], today);
  const task = { type: "choice", typeId: "or_merking", skill: "ordaford", word: WORD };
  const j = { ok: true, findings: [], xp: 0, finish: { correct: true },
    effects: [{ do: "record", skill: "ordaford", word: WORD, ok: true }] };
  const out = settle(S, newSession(S), task, j);
  assert.ok(!("learned" in out));
  assert.ok(isInLearning(S, WORD), "all on one day");
  assert.ok(!S.review.items.some((x) => x.w === WORD));
});

test("the review of a learned word is built: the recall question, about that word", () => {
  const S = giveWords(blankState());
  SKILL_IDS.forEach((id) => { S.enabled[id] = true; });
  const word = LEARNER_WORDS[1];
  assert.ok(leaveLearning(S, word, D2));
  const k = queueWord(S, { w: word, t: "or_eyda", sk: "ordaford" }, D2);
  const sess = newSession(S);
  Object.keys(sess.diff).forEach((x) => { sess.diff[x] = 3; });
  const allOn = Object.fromEntries(SKILL_IDS.map((id) => [id, true]));
  const policy = createPolicy(null, { skills: allOn, types: {}, levels: {}, attrs: {}, safeVocab: null });
  const view = makeView({ S, sess, policy, today: D3 });
  const b = reviewTask(lex, view, seeded(3), entryByKey(S, k));
  assert.ok(b, "built");
  assert.equal(b.task.typeId, "or_eyda");
  assert.equal(b.task.word, word);
  assert.equal(b.task.review, k);
});
