/* Item 43: the two-option questions (fs_hreyf, ob_fsao, fn_aftur) are asked in
   pairs — both sentences of the contrast on one card, right only when both
   are — because alone a guess is right half the time and paid full XP.
   Against the real data and the real grading. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { DATA } from "../data/data_bundle.js";
import { EX } from "../data/exercises.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, newSession } from "../src/js/core/state.js";
import { SKILL_IDS } from "../src/js/core/skills.js";
import { createPolicy } from "../src/js/core/policy.js";
import { judge } from "../src/js/core/answer.js";
import { fsMotion } from "../src/js/tasks/fallstjorn.js";
import { obAdvPrep } from "../src/js/tasks/obeygjanleg.js";
import { fnReflex } from "../src/js/tasks/fornofn.js";
import { show } from "./helpers.js";

const lex = buildLexicon(DATA);
function ctx(diff = 3) {
  const S = blankState();
  SKILL_IDS.forEach((id) => { S.enabled[id] = true; });
  const sess = newSession(S);
  Object.keys(sess.diff).forEach((k) => { sess.diff[k] = diff; });
  const all = {};
  SKILL_IDS.forEach((id) => { all[id] = true; });
  const policy = createPolicy(null, { skills: all, types: {}, levels: {}, attrs: {}, safeVocab: null });
  return { lex, S, sess, forcedNoun: null, run: {}, policy };
}
const BUILDERS = { fs_hreyf: fsMotion, ob_fsao: obAdvPrep, fn_aftur: fnReflex };
const many = (build, n = 150) => {
  const c = ctx(), out = [];
  for (let k = 0; k < n; k++) { const t = show(c, build); if (t) out.push(t); }
  return out;
};
const hist = () => ({ S: blankState(), sess: newSession(blankState()) });

for (const [id, build] of Object.entries(BUILDERS)) {
  test(`43: ${id} is always a pair of two real contrasting questions`, () => {
    const tasks = many(build);
    assert.ok(tasks.length > 50, `${id}: too few built`);
    for (const t of tasks) {
      assert.equal(t.type, "choice");
      assert.ok(t.second, `${id}: a single question`);
      for (const h of [t, t.second]) {
        assert.equal(h.options.length, 2, `${id}: ${h.s.t}`);
        assert.equal(new Set(h.options).size, 2);
        assert.ok(h.options.includes(h.answer), `${id}: answer not offered`);
        assert.ok(h.question && h.why && h.s, `${id}: half incomplete`);
      }
      /* A contrast: the two answers are different things, so the card teaches
         the difference and not the same fact twice. */
      assert.notEqual(t.answer, t.second.answer, `${id}: ${t.s.t} / ${t.second.s.t}`);
      assert.ok(t.lead && /Báðar/.test(t.lead));
    }
  });

  test(`43: ${id} pays only when both halves are right, and a half answer is pending`, () => {
    for (const t of many(build, 40)) {
      const a = t.answer, b = t.second.answer;
      const wa = t.options.find((o) => o !== a), wb = t.second.options.find((o) => o !== b);
      const both = judge(t, { picked: a, picked2: b }, hist());
      assert.equal(both.ok, true);
      assert.ok(both.xp > 0, "both right earns XP");
      for (const [p1, p2] of [[a, wb], [wa, b], [wa, wb]]) {
        const j = judge(t, { picked: p1, picked2: p2 }, hist());
        assert.equal(j.ok, false, `${p1}/${p2}`);
        assert.equal(j.xp, 0, "one half right is not paid");
      }
      assert.equal(judge(t, { picked: a }, hist()).pending, true, "second half missing");
      assert.equal(judge(t, { picked2: b }, hist()).pending, true, "first half missing");
      assert.equal(judge(t, { picked: a, picked2: "" }, hist()).pending, true);
    }
  });
}

test("43: of the four ways to answer a pair at random, exactly one is right", () => {
  for (const build of Object.values(BUILDERS)) {
    const t = many(build, 1)[0];
    let right = 0;
    for (const p1 of t.options) for (const p2 of t.second.options)
      if (judge(t, { picked: p1, picked2: p2 }, hist()).ok) right++;
    assert.equal(right, 1);
  }
});

test("43: the missed half is the one diagnosed (fs_hreyf names its own cell)", () => {
  for (const t of many(fsMotion, 30)) {
    const wb = t.second.options.find((o) => o !== t.second.answer);
    const j = judge(t, { picked: t.answer, picked2: wb }, hist());
    assert.equal(j.resp.kind, "form");
    assert.equal(j.resp.items[0].typed, wb, "the second half's wrong pick");
    assert.deepEqual(j.resp.items[0].accepted, [t.second.answer]);
    assert.equal(j.resp.ex.right, t.second.answer);
  }
});

test("43: only real contrasts are asked — no motion/rest sentence without its partner", () => {
  const lone = new Set();
  const by = new Map();
  for (const x of EX.motionRest) { const k = x.prep + "|" + x.noun; (by.get(k) || by.set(k, []).get(k)).push(x); }
  for (const xs of by.values()) if (xs.length < 2) xs.forEach((x) => lone.add(x.t));
  assert.ok(lone.size > 0, "the bank has loners (yfir girðing, yfir fjall)");
  for (const t of many(fsMotion, 300)) {
    assert.ok(!lone.has(t.s.t) && !lone.has(t.second.s.t), t.s.t);
    const [x, y] = [t.s.t, t.second.s.t].map((tx) => EX.motionRest.find((z) => z.t === tx));
    assert.equal(x.prep, y.prep); assert.equal(x.noun, y.noun); assert.notEqual(x.motion, y.motion);
  }
});

test("43: the reflexive pair is one sentence read two ways", () => {
  for (const t of many(fnReflex, 60)) {
    assert.equal(t.s.t, t.second.s.t);
    assert.notEqual(t.gloss, t.second.gloss);
  }
});

test("43: the verdict can show a pair — each half has what the renderer prints", () => {
  for (const build of Object.values(BUILDERS))
    for (const t of many(build, 20)) for (const h of [t, t.second]) {
      assert.ok(h.s && h.i >= 0 && h.s.tok[h.i], "the sentence and its target");
      assert.ok(typeof h.why === "string" && h.why.length > 10);
    }
});
