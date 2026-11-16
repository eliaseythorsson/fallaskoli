/* "Þrjár í röð" (critique item 36): core/streak.js and tasks/drill.js
   `patternTask` / `streakTasks`.

   The property under it: after a diagnosed miss the pupil can practise THAT
   pattern three times at once — every one of the three really tests it —
   and the pattern then comes back tomorrow through the review queue. */

import test from "node:test";
import assert from "node:assert/strict";
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, newSession } from "../src/js/core/state.js";
import { SKILL_IDS } from "../src/js/core/skills.js";
import { createPolicy, narrowPolicy } from "../src/js/core/policy.js";
import { targets, patternById } from "../src/js/core/diagnosis.js";
import { queuePattern, dueEntries, addDays } from "../src/js/core/review.js";
import { STREAK_N, streakPattern, startStreak, stepStreak, streakEntry, streakLine,
  streakAnswered } from "../src/js/core/streak.js";
import { patternTask, streakTasks, reviewTask, makeView, applyEffects } from "../src/js/tasks/index.js";
import { seeded } from "../src/js/core/duel.js";

const lex = buildLexicon(DATA);
const D0 = "2026-11-16";
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
const view = (p, policy = POLICY) => makeView({ S: p.S, sess: p.sess, policy, today: D0 });

/* ---------- when it is offered ----------------------------------------------- */

test("offered only after a wrong answer with a real finding", () => {
  const f = [{ p: "thf_thgf" }];
  assert.equal(streakPattern(f, false), "thf_thgf");
  assert.equal(streakPattern(f, true), null, "after a right answer");
  assert.equal(streakPattern(f, null), null, "after a question with no right answer");
  assert.equal(streakPattern([], false), null, "after a miss the diagnosis could not read");
  assert.equal(streakPattern([{ p: "thf_thgf", soft: true }], false), null, "for a soft finding");
});

test("not for a slip of one letter or an accent, nor for 'Ógreint'", () => {
  for (const p of ["broddar", "stafsetning", "ogreint"]) assert.equal(streakPattern([{ p }], false), null, p);
  /* … but the next real pattern in the findings is */
  assert.equal(streakPattern([{ p: "broddar" }, { p: "ending" }], false), "ending");
});

test("once per pattern in a session, and only what the policy lets be practised", () => {
  assert.equal(streakPattern([{ p: "ef" }], false, { done: ["ef"] }), null);
  assert.equal(streakPattern([{ p: "ef" }, { p: "tala" }], false, { done: ["ef"] }), "tala");
  assert.equal(streakPattern([{ p: "ef" }], false, { canPractise: () => false }), null);
});

/* ---------- the three ---------------------------------------------------------- */

test("three steps: the count, the score and the end", () => {
  const st = startStreak("thf_thgf", { t: "fill", sk: "nafnord" });
  assert.equal(st.n, STREAK_N);
  assert.equal(STREAK_N, 3);
  assert.ok(st.intro, "the rule comes first");
  assert.equal(streakAnswered(st), false);
  assert.equal(streakEntry(st), null, "nothing answered: nothing for the queue");
  stepStreak(st, true);
  stepStreak(st, null);                       // a question with no right answer: not counted
  assert.equal(st.i, 1);
  stepStreak(st, false);
  assert.equal(st.done, false);
  stepStreak(st, true);
  assert.deepEqual({ i: st.i, c: st.c, done: st.done, marks: st.marks }, { i: 3, c: 2, done: true, marks: [1, 0, 1] });
  stepStreak(st, true);                       // nothing after the end
  assert.equal(st.i, 3);
  assert.deepEqual(streakEntry(st), { p: "thf_thgf", t: "fill", sk: "nafnord" });
});

test("the line under the last of the three is kind, whatever the score", () => {
  const done = (c) => ({ n: 3, c, done: true });
  assert.equal(streakLine(done(3)), "Allar þrjár réttar — vel gert! Þetta kemur aftur í upprifjun á morgun svo að það festist.");
  assert.equal(streakLine(done(2)), "2 af 3 rétt. Þetta kemur aftur í upprifjun á morgun.");
  assert.equal(streakLine(done(0)), "0 af 3 rétt. Þetta er snúið, en það lagast með æfingu. Þetta kemur aftur í upprifjun á morgun.");
  assert.equal(streakLine({ n: 3, c: 1, done: false }), "", "nothing before the end");
});

/* ---------- the questions ------------------------------------------------------- */

const PRACTISED = ["thf_thgf", "ef", "nf_aukafall", "fallstjorn_fs", "fallstjorn_so", "tala", "greinir",
  "kyn_samraemi", "beyging_lo", "stig", "sogn_frumlag", "sogn_obeygd", "tid", "hljodvarp", "ending",
  "ordflokkur", "ao_fs", "setningalidir"];

test("every one of the three really tests the pattern", () => {
  const rng = seeded(36);
  for (const p of PRACTISED) {
    const pp = pupil(3);
    for (let k = 0; k < 4; k++) {
      const b = patternTask(lex, view(pp), rng, p);
      assert.ok(b, `nothing could be built for ${p}`);
      assert.ok(targets(b.task, [p]), `${p}: ${b.task.typeId} does not test it`);
      assert.equal(b.task.streak, p);
      assert.notEqual(b.task.type, "meaning");
    }
  }
});

test("the three are built on other words than the one just missed, where it can be helped", () => {
  const rng = seeded(7);
  const pp = pupil(3);
  for (let round = 0; round < 6; round++) {
    const three = streakTasks(lex, view(pp), rng, "thf_thgf", { word: "hestur|kk", typeId: "fill" });
    assert.ok(three && three.length === 3);
    const words = three.map((b) => b.task.word).filter(Boolean);
    assert.ok(!words.includes("hestur|kk"), "the missed word came straight back: " + words);
    assert.equal(new Set(words).size, words.length, "the same word twice in three: " + words);
  }
});

test("the miss's own type is tried first: a rare pattern is found through it", () => {
  /* The subjunctive: tested by one verb question in many in the general mix. */
  const rng = seeded(11);
  const pp = pupil(4);
  let found = 0;
  for (let k = 0; k < 6; k++) if (patternTask(lex, view(pp), rng, "hattur", [], "verb")) found++;
  assert.ok(found >= 5, `the subjunctive was found ${found} times in 6`);
});

test("nothing outside the policy, and null rather than some other question", () => {
  const rng = seeded(3);
  const pp = pupil(3);
  const verbs = narrowPolicy(POLICY, { skills: ["sagnord"] });
  for (let k = 0; k < 5; k++) {
    const b = patternTask(lex, view(pp, verbs), rng, "tid");
    assert.ok(b && b.task.skill === "sagnord");
  }
  /* "Fallstjórn forsetninga" has no verb question: nothing, never a stand-in */
  assert.equal(patternTask(lex, view(pp, verbs), rng, "fallstjorn_fs"), null);
  assert.equal(streakTasks(lex, view(pp, verbs), rng, "fallstjorn_fs", {}), null);
});

test("building the three changes nothing; showing one applies its effects", () => {
  const pp = pupil(3);
  const before = JSON.stringify(pp.S) + JSON.stringify(pp.sess);
  const three = streakTasks(lex, view(pp), seeded(5), "ef", { typeId: "fill" });
  assert.ok(three);
  assert.equal(JSON.stringify(pp.S) + JSON.stringify(pp.sess), before);
  const ctx = { ...pp, forcedNoun: null };
  applyEffects(ctx, three[0].effects);       // as app.js does when it is shown
  assert.ok(Array.isArray(three[0].effects));
});

/* ---------- and then the review queue ------------------------------------------- */

test("after the three, the pattern is due tomorrow and comes back as a question on it", () => {
  const pp = pupil(3);
  const st = startStreak("thf_thgf", { t: "fill", sk: "nafnord" });
  [true, true, false].forEach((ok) => stepStreak(st, ok));
  const k = queuePattern(pp.S, streakEntry(st), D0);
  assert.equal(dueEntries(pp.S, D0).length, 0, "due the same day");
  const due = dueEntries(pp.S, addDays(D0, 1));
  assert.deepEqual(due.map((e) => e.k), [k]);
  assert.deepEqual({ t: due[0].t, p: due[0].p, sk: due[0].sk }, { t: "fill", p: "thf_thgf", sk: "nafnord" });
  /* tomorrow's review: the same type, a question that tests the pattern */
  const v = makeView({ S: pp.S, sess: pp.sess, policy: POLICY, today: addDays(D0, 1) });
  const b = reviewTask(lex, v, seeded(9), due[0]);
  assert.ok(b, "the queued pattern could not be asked");
  assert.equal(b.task.typeId, "fill");
  assert.ok(targets(b.task, ["thf_thgf"]));
  assert.equal(b.task.review, k);
});

test("the three stopped after one still send the pattern to the queue; none answered does not", () => {
  const st = startStreak("tid", { t: "verb", sk: "sagnord" });
  stepStreak(st, false);
  assert.deepEqual(streakEntry(st), { p: "tid", t: "verb", sk: "sagnord" });
  assert.equal(streakEntry(startStreak("tid", { t: "verb" })), null);
  assert.ok(patternById("tid").rule.length > 20, "the rule to show before the first");
});
