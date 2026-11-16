/* v6.13: the hand-written items in exercises.py, read as a native reader would.
   Three defects the critique found (items 5, 6, 25) and the rules that keep
   them from coming back:
     5  a VERB_CASE item whose case is set by a preposition (hlakka TIL e-s)
        was explained as "Sögnin hlakka stýrir eignarfalli … hlakka mín";
     6  two motion-or-rest items had both cases right (flaug yfir fjallið /
        fjallinu, skreið undir borðið / borðinu);
    25  the conjunction distractors were nearly always né, sem, hvort, so a
        pupil could cross them out without reading the sentence. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { DATA } from "../data/data_bundle.js";
import { EX } from "../data/exercises.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, newSession } from "../src/js/core/state.js";
import { SKILL_IDS } from "../src/js/core/skills.js";
import { createPolicy } from "../src/js/core/policy.js";
import * as MORE from "../src/js/tasks/more.js";

const lex = buildLexicon(DATA);
function ctx(diff = 2) {
  const S = blankState();
  SKILL_IDS.forEach((id) => { S.enabled[id] = true; });
  const sess = newSession(S);
  Object.keys(sess.diff).forEach((k) => { sess.diff[k] = diff; });
  const all = {};
  SKILL_IDS.forEach((id) => { all[id] = true; });
  return { lex, S, sess, forcedNoun: null, run: {},
    policy: createPolicy(null, { skills: all, types: {}, levels: {}, attrs: {}, safeVocab: null }) };
}
const words = (t) => t.toLowerCase().match(/___|[\p{L}]+/gu);

/* ---------------------------------------------------------------- item 5 */

/* Prepositions that can stand right before a noun. If one of them is the
   word before the blank, the preposition decides the case and the verb's
   explanation ("Sögnin X stýrir …") would be false. */
const PREPS = new Set(["á", "af", "að", "án", "eftir", "fyrir", "frá", "gegn", "hjá", "í", "með",
  "meðal", "milli", "til", "um", "undir", "úr", "vegna", "við", "yfir", "handa", "gegnum", "auk"]);

test("item 5: no VERB_CASE item has a preposition right before the blank", () => {
  for (const x of EX.verbCase) {
    const w = words(x.t);
    const before = w[w.indexOf("___") - 1];
    assert.ok(!PREPS.has(before), `${x.t}: '${before}' governs the case, not the verb '${x.verb}'`);
  }
});

test("item 5: hlakka til is not explained as a verb that governs the genitive", () => {
  assert.ok(!EX.verbCase.some((x) => x.verb === "hlakka"), "hlakka is back in VERB_CASE");
  /* and the explanation the pupil reads never says so */
  for (let k = 0; k < 400; k++) {
    const t = MORE.fsVerb(ctx(1 + (k % 5)));
    if (!t) continue;
    assert.doesNotMatch(t.why, /hlakka/, t.why);
    assert.ok(t.why.startsWith(`Sögnin *${EX.verbCase.find((x) => x.t === t.s.t).verb}*`), t.why);
  }
});

test("item 5: hlakka til ___ is asked by the preposition cloze, with til named", () => {
  let hits = 0;
  for (let k = 0; k < 3000 && hits < 3; k++) {
    const t = MORE.fsPrepNoun(ctx(1 + (k % 3)));
    if (!t || !t.s.tok.some((x) => /^hlakka$/i.test(x.w))) continue;
    hits++;
    assert.equal(t.s.tok[t.i - 1].w.toLowerCase(), "til");
    assert.match(t.lead, /\*til\*/);
    assert.match(t.why, /eignarfall/);
  }
  assert.ok(hits > 0, "no hlakka til ___ question from the preposition cloze");
});

/* ---------------------------------------------------------------- item 6 */

test("item 6: the two motion-or-rest items with two right answers are gone", () => {
  const ts = EX.motionRest.map((x) => x.t);
  assert.ok(!ts.includes("Flugvélin flaug yfir ___."), "flaug yfir fjallið / fjallinu");
  assert.ok(!ts.includes("Hundurinn skreið undir ___."), "skreið undir borðið / borðinu");
  assert.ok(!ts.includes("Boltinn rúllaði undir ___."), "rúllaði undir sófann / sófanum — the same flaw");
});

/* A verb of moving can also mean moving about IN a place, and then the
   dative is right too. Every motion item must carry something that fixes the
   direction: a directional adverb right before the preposition, a verb of
   placing, or a goal later in the sentence. The few left are listed here by
   hand, each read and found to have one answer. */
const PLACING = /(?<![\p{L}])(lagði|setti|hengdi|stakk|hellti)(?![\p{L}])/u;
const READ_BY_HAND = new Set([
  "Við fórum í ___ eftir skóla.",   // *fórum í búðinni* is not Icelandic
  "Hesturinn stökk yfir ___.",      // over the fence; *yfir girðingunni* would hover above it
]);
test("item 6: every motion item fixes the direction", () => {
  for (const x of EX.motionRest.filter((y) => y.motion)) {
    const ok = /(?<![\p{L}])(inn|út|upp|niður)\s+(í|á|undir|yfir)\s+___/u.test(x.t) || PLACING.test(x.t)
      || READ_BY_HAND.has(x.t);
    assert.ok(ok, `${x.t}: nothing settles motion; the dative may be right too`);
  }
});

test("item 6: the motion-or-rest pool stays balanced and every pair differs", () => {
  assert.equal(EX.motionRest.length, 32);
  assert.equal(EX.motionRest.filter((x) => x.motion).length, 16);
  assert.equal(new Set(EX.motionRest.map((x) => x.t)).size, 32, "a sentence twice");
  for (const x of EX.motionRest) assert.notEqual(x.thf[0], x.thgf[0], x.t);
});

test("item 6: the built question offers exactly the two forms and the right one fits", () => {
  for (let k = 0; k < 200; k++) {
    const t = MORE.fsMotion(ctx());
    if (!t) continue;
    const x = EX.motionRest.find((y) => y.t === t.s.t);
    assert.deepEqual([...t.options].sort(), [x.thf[0], x.thgf[0]].sort());
    assert.equal(t.answer, (x.motion ? x.thf : x.thgf)[0]);
  }
});

/* ---------------------------------------------------------------- item 25 */

test("item 25: no conjunction distractor appears in more than a third of the items", () => {
  const n = EX.conjunction.length;
  const count = new Map();
  EX.conjunction.forEach((x) => x.w.forEach((w) => count.set(w, (count.get(w) || 0) + 1)));
  for (const [w, c] of count) assert.ok(c <= n / 3, `'${w}' is a wrong option in ${c} of ${n} items`);
});

test("item 25: every item has four different options and one right answer", () => {
  assert.ok(EX.conjunction.length >= 16);
  for (const x of EX.conjunction) {
    assert.equal(x.w.length, 3, x.t);
    assert.equal(new Set([x.a, ...x.w]).size, 4, x.t);
    assert.ok(!x.w.includes(x.a), x.t);
    assert.equal(x.t.split("___").length, 2, x.t);
    assert.ok(x.why && x.why.length > 5, x.t);
  }
});

test("item 25: the contrast sets are there — each member is a right answer somewhere", () => {
  const right = new Set(EX.conjunction.map((x) => x.a));
  for (const set of [["ef", "þegar", "þótt", "nema"], ["af því að", "enda", "svo að", "til þess að"],
    ["hvort", "hvort sem"], ["né", "eða", "og"]]) {
    set.forEach((c) => assert.ok(right.has(c), `'${c}' is never the right answer`));
  }
  /* and the wrong options come from the same sets, not only né / sem / hvort */
  const old = EX.conjunction.filter((x) => x.w.every((w) => ["né", "sem", "hvort", "ef", "að"].includes(w)));
  assert.equal(old.length, 0, old.map((x) => x.t).join(" | "));
});

test("item 25: the question is built with a multi-word conjunction, capitalised at the start", () => {
  const seen = new Set();
  for (let k = 0; k < 600; k++) {
    const t = MORE.obConj(ctx());
    assert.ok(t && t.options.length === 4);
    assert.ok(t.options.includes(t.answer));
    if (t.i === 0) t.options.forEach((o) => assert.match(o, /^\p{Lu}/u, o));
    seen.add(t.answer.toLowerCase());
  }
  assert.ok(seen.has("af því að") && seen.has("til þess að"), [...seen].join(", "));
});
