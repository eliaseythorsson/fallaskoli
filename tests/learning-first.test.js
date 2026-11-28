/* Words in learning first (#13, docs/DLD-PLAN.md §1 "The intensive phase").

   In ordinary practice a question that could be about a word in learning is
   about one LEARNING_SHARE (about 1 in 3) of the time, in every category, by
   one rule in tasks/view.js (`preferLearning`, called from `pickByWord` and
   by the sentence-first builders). A word in learning may come from outside
   a builder's frequency pool when it fits the frame; one that fits no frame
   is never forced. Duels, live rounds, rescue drills and reviews have no
   preference. */

import test from "node:test";
import assert from "node:assert/strict";
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, newSession, wordKey } from "../src/js/core/state.js";
import { SKILL_IDS } from "../src/js/core/skills.js";
import { createPolicy, narrowPolicy } from "../src/js/core/policy.js";
import { seeded, duelTasks } from "../src/js/core/duel.js";
import { roundTasks } from "../src/js/core/live.js";
import { fillLearning, wordsInLearning, wordsOf } from "../src/js/core/wordknowledge.js";
import { queuePattern, entryByKey, addDays } from "../src/js/core/review.js";
import { questionSig } from "../src/js/core/run.js";
import { LEARNING_SHARE } from "../src/js/tasks/view.js";
import { topByRank, shareForLevel, tokenKey } from "../src/js/tasks/shared.js";
import { nextTask, buildTask, typeById, makeView, withView, applyEffects, drillTask, reviewTask, DRILL_PLAN }
  from "../src/js/tasks/index.js";

const lex = buildLexicon(DATA);
const TODAY = "2026-11-27";
const allOn = {};
SKILL_IDS.forEach((id) => { allOn[id] = true; });
const POLICY = createPolicy(null, { skills: allOn, types: {}, levels: {}, attrs: {}, safeVocab: null });

function pupil(band = 2) {
  const S = blankState();
  SKILL_IDS.forEach((id) => { S.enabled[id] = true; });
  const sess = newSession(S, TODAY);
  Object.keys(sess.diff).forEach((k) => { sess.diff[k] = band; });
  return { S, sess };
}
const view = (p, extra = {}) => makeView({ S: p.S, sess: p.sess, policy: POLICY, today: TODAY, inRun: true, ...extra });
const key = (w) => wordKey(w.o, w.c);
/** A random source that counts what it hands out. */
const counting = (seed) => {
  const g = seeded(seed);
  const r = () => { r.n++; return g(); };
  r.n = 0;
  return r;
};

/* ---------- the rule ----------------------------------------------------- */

test("the share is one named constant: about one in three", () => {
  assert.equal(LEARNING_SHARE, 1 / 3);
});

test("preferLearning draws nothing without words in learning, or when the items are all one side", () => {
  const p = pupil();
  const items = [1, 2, 3, 4, 5, 6];
  const isL = (x) => x === 2;
  for (const [v, list, f] of [
    [view(p), items, isL],                                   // no `learning`: a duel, a drill, a review
    [view(p, { learning: [] }), items, isL],                 // no words in learning yet
    [view(p, { learning: ["x|kk"] }), items, () => false],   // none of the items
    [view(p, { learning: ["x|kk"] }), [2], isL],             // all of them
  ]) {
    const rng = counting(1);
    assert.equal(v.preferLearning(list, f, rng), list);
    assert.equal(rng.n, 0);
  }
  assert.equal(view(p).learning, null);
  assert.equal(view(p, { learning: [] }).learning, null);
});

test("with both sides, one number: the learning side LEARNING_SHARE of the time", () => {
  const v = view(pupil(), { learning: ["x|kk"] });
  const items = [1, 2, 3, 4, 5, 6];
  const rng = counting(5);
  let yes = 0;
  for (let k = 0; k < 6000; k++) {
    const side = v.preferLearning(items, (x) => x === 2, rng);
    if (side.length === 1 && side[0] === 2) yes++;
    else assert.ok(!side.includes(2));
  }
  assert.equal(rng.n, 6000);
  assert.ok(Math.abs(yes / 6000 - LEARNING_SHARE) < 0.02, `share ${yes / 6000}`);
});

test("a word in learning is not preferred in the type that just asked it (the spacing rule wins)", () => {
  const p = pupil();
  const hestur = lex.lookup("hestur", "kk");
  p.sess.lastAsked = { type: "tbl_no", words: [key(hestur)] };
  const v = view(p, { learning: [key(hestur)], typeId: "tbl_no" });
  assert.equal(v.inLearning(key(hestur)), false);
  assert.equal(withView(v, { typeId: "fill" }).inLearning(key(hestur)), true);
  const pool = lex.nouns.slice(0, 50).concat([hestur]);
  for (let s = 1; s <= 100; s++)
    assert.notEqual(v.pickWord(lex, pool, "nafnord", seeded(s), ["kk", "kvk", "hk"]), hestur);
});

test("a pool without a word in learning draws exactly as before", () => {
  const p = pupil();
  const plain = view(p);
  const learning = view(p, { learning: ["breyting|kvk"] });
  const pool = lex.nouns.slice(0, 40).filter((w) => key(w) !== "breyting|kvk");
  for (let s = 1; s <= 40; s++)
    assert.equal(learning.pickWord(lex, pool, "nafnord", seeded(s), ["kk", "kvk", "hk"]),
      plain.pickWord(lex, pool, "nafnord", seeded(s), ["kk", "kvk", "hk"]));
});

/* ---------- ordinary practice: about one in three ------------------------ */

test("over 2,400 practice questions, 30–40% of those that could be about a word in learning are", () => {
  const p = pupil(1);
  fillLearning(p.S, lex, { level: 1, today: TODAY });
  const L = wordsInLearning(p.S);
  assert.equal(L.length, 6);
  /* Nouns, adjectives and Orðaforði: the categories whose frames and items
     take this pupil's six words (LÍNO-2's commonest: *breyting*, *áhrif*,
     *mikilvægur*, *einnig* …). The sentence bank has almost none of them,
     so the sentence-first types are tested on their own below. */
  const policy = narrowPolicy(POLICY, { skills: ["nafnord", "lysingarord", "ordaford"] });
  const rng = seeded(13);
  const N = 2400;
  let could = 0, about = 0;
  const types = new Set();
  for (let q = 0; q < N; q++) {
    /* þyngd 1 to 5, a fifth of the questions each */
    Object.keys(p.sess.diff).forEach((k) => { p.sess.diff[k] = 1 + Math.floor((q * 5) / N); });
    /* "Could": the builder that made the question had a word in learning to
       choose from, the last time it chose (a builder that tries again after
       a word fails its frame chooses again). */
    const had = {};
    const v0 = makeView({ S: p.S, sess: p.sess, policy, today: TODAY, inRun: true, learning: wordsInLearning(p.S) });
    const v = Object.freeze({ ...v0, preferLearning(items, isL, r) {
      had[this.typeId] = items.some(isL);
      return v0.preferLearning.call(this, items, isL, r);
    } });
    const b = nextTask(lex, v, rng);
    assert.ok(b, `question ${q}`);
    applyEffects(p, b.effects);
    if (!had[b.task.typeId]) continue;
    could++;
    types.add(b.task.typeId);
    if (wordsOf(b.task).some((w) => L.includes(w))) about++;
  }
  const share = about / could;
  assert.ok(could >= 300, `only ${could} questions could take a word in learning`);
  assert.ok(share >= 0.30 && share <= 0.40, `share ${share.toFixed(3)} (${about}/${could})`);
  /* in more than one category: tables, the cloze, the reverse analysis … */
  assert.ok(types.size >= 4, [...types].join(" "));
});

/* ---------- outside the pool, and never forced --------------------------- */

test("a word in learning rarer than the builder's frequency pool is asked", () => {
  const p = pupil(1);
  /* Sagnorð at level 1 asks the commonest verbs only (`taskVerb`). */
  const pool = new Set(topByRank(lex.verbs, shareForLevel(1, 0.21, 0.09)));
  const rare = lex.verbs.filter((v) => !pool.has(v) && !v.t3 && (v.irr || 0) <= 1).sort((a, b) => b.r - a.r)[0];
  assert.ok(rare, "a rare regular verb");
  const verb = typeById("verb");
  const count = (v) => {
    let n = 0;
    for (let s = 0; s < 300; s++) {
      const b = buildTask(lex, v, seeded(s), "verb");
      if (b && wordsOf(b.task).includes(key(rare))) n++;
    }
    return n;
  };
  assert.ok(verb);
  assert.equal(count(view(p)), 0, `${rare.o} is outside the pool`);
  const n = count(view(p, { learning: [key(rare)] }));
  assert.ok(n >= 60 && n <= 140, `${rare.o} asked ${n} times in 300`);
});

test("a word in learning that fits no frame is never forced: the builder builds as usual", () => {
  const p = pupil(3);
  /* A verb said only of the weather has no table (`tableVerb`), and an
     adverb has none at all. (In "verb" the weather verb does fit: it is
     asked in the third person, as any such verb is.) */
  const weather = lex.verbs.find((v) => v.t3);
  const L = [key(weather), "einnig|ao"];
  for (const id of ["tbl_so", "tbl_no", "tbl_lo"]) {
    let plainN = 0, withN = 0;
    for (let s = 0; s < 150; s++) {
      const a = buildTask(lex, view(p), seeded(s), id);
      const b = buildTask(lex, view(p, { learning: L }), seeded(s), id);
      if (a) plainN++;
      if (b) {
        withN++;
        assert.ok(!wordsOf(b.task).some((w) => L.includes(w)), `${id}: ${questionSig(b.task)}`);
        assert.equal(questionSig(b.task), questionSig(a.task), `${id}, seed ${s}: the same question as without`);
      }
    }
    assert.equal(withN, plainN, id);
  }
  /* A word whose cell is missing is not asked in it either: every cloze built
     with the six words in learning has its noun's form in the slot. */
  fillLearning(p.S, lex, { level: 1, today: TODAY });
  const v = view(p, { learning: wordsInLearning(p.S) });
  for (let s = 0; s < 300; s++) {
    const b = buildTask(lex, v, seeded(s), "fill");
    if (b) assert.ok(b.task.n.forms[b.task.m] || b.task.answers.length, questionSig(b.task));
  }
});

/* ---------- sentence-first builders -------------------------------------- */

/** The word a sentence-first type asks most rarely-but-often-enough, without a preference. */
function someWordOf(id, p) {
  const n = new Map();
  for (let s = 0; s < 300; s++) {
    const b = buildTask(lex, view(p), seeded(s), id);
    const w = b && b.task.word;
    if (w) n.set(w, (n.get(w) || 0) + 1);
  }
  return [...n.entries()].filter(([, c]) => c >= 3 && c <= 20).sort((a, b) => b[1] - a[1])[0][0];
}

for (const id of ["parse", "govern"]) {
  test(`${id}: sentences with a word in learning are preferred, about one in three`, () => {
    const p = pupil(3);
    const w = someWordOf(id, p);
    const count = (v) => {
      let n = 0, built = 0;
      for (let s = 1000; s < 1600; s++) {
        const b = buildTask(lex, v, seeded(s), id);
        if (!b) continue;
        built++;
        if (b.task.word === w) n++;
      }
      return n / built;
    };
    const plain = count(view(p));
    const pref = count(view(p, { learning: [w] }));
    assert.ok(plain < 0.08, `${w} without a preference: ${plain}`);
    assert.ok(pref > 0.27 && pref < 0.42, `${w} in learning: ${pref}`);
  });
}

test("a token of a sentence: the parse question is about the word in learning, not another in its sentence", () => {
  const p = pupil(3);
  const w = someWordOf("parse", p);
  const v = view(p, { learning: [w] });
  for (let s = 0; s < 200; s++) {
    const b = buildTask(lex, v, seeded(s), "parse");
    if (!b) continue;
    const inIt = b.task.s.tok.some((t) => tokenKey(lex, t) === w);
    if (b.task.word !== w && inIt) {
      /* the other side of the draw: a sentence WITHOUT the word was meant */
      assert.fail(`seed ${s}: a sentence with ${w} asked about ${b.task.word}`);
    }
  }
});

/* ---------- no preference outside ordinary practice ---------------------- */

test("duels and live rounds: every view they build has no words in learning", () => {
  const seen = [];
  const deps = {
    nextTask, buildTask, applyEffects, newSession, createPolicy,
    makeView: (o) => { const v = makeView(o); seen.push(v.learning); return v; },
    /* even a host whose blank pupil had words in learning */
    blankState: () => { const S = blankState(); fillLearning(S, lex, { level: 1, today: TODAY }); return S; },
  };
  const duel = { id: "d", a: "A", b: "B", topic: "nafnord", n: 10, seed: 7, created: 0 };
  duelTasks(lex, duel, deps);
  duelTasks(lex, { ...duel, side: "a", key: 5 }, deps);
  roundTasks(lex, { seed: 3, n: 8, level: 2, skills: ["nafnord", "lysingarord"], types: null }, deps);
  assert.ok(seen.length > 20);
  assert.ok(seen.every((x) => x === null));
});

test("a rescue drill asks the same questions whatever the words in learning", () => {
  const p = pupil(2);
  fillLearning(p.S, lex, { level: 1, today: TODAY });
  const L = wordsInLearning(p.S);
  const words = [lex.lookup("hestur", "kk"), lex.lookup("koma", "so"), lex.lookup("góður", "lo"), lex.lookup("breyting", "kvk")]
    .filter((w) => w && DRILL_PLAN[w.c]);
  assert.ok(words.length >= 3);
  for (const w of words)
    for (let turn = 0; turn < 6; turn++)
      for (let s = 0; s < 5; s++) {
        const a = drillTask(lex, view(p), seeded(s), w, turn);
        const b = drillTask(lex, view(p, { learning: L }), seeded(s), w, turn);
        assert.equal(b && questionSig(b.task), a && questionSig(a.task), `${w.o} turn ${turn} seed ${s}`);
      }
});

test("a review asks the same question whatever the words in learning", () => {
  const p = pupil(2);
  fillLearning(p.S, lex, { level: 1, today: TODAY });
  const L = wordsInLearning(p.S);
  /* A pattern review chooses its own word (no word was missed): the place a
     preference could have crept in. */
  const keys = [
    queuePattern(p.S, { p: "thf_thgf", t: "fill", sk: "nafnord" }, addDays(TODAY, -1)),
    queuePattern(p.S, { p: "thf_thgf", t: "tbl_no", sk: "nafnord" }, addDays(TODAY, -1)),
  ].filter(Boolean);
  assert.ok(keys.length);
  let differs = 0;
  for (const k of keys)
    for (let s = 0; s < 60; s++) {
      const e = entryByKey(p.S, k);
      const a = reviewTask(lex, view(p), seeded(s), e);
      const b = reviewTask(lex, view(p, { learning: L }), seeded(s), e);
      assert.equal(b && questionSig(b.task), a && questionSig(a.task), `${k} seed ${s}`);
    }
  /* …while the same view in ordinary practice does prefer them */
  for (let s = 0; s < 60; s++) {
    const a = buildTask(lex, view(p), seeded(s), "tbl_no");
    const b = buildTask(lex, view(p, { learning: L }), seeded(s), "tbl_no");
    if ((a && questionSig(a.task)) !== (b && questionSig(b.task))) differs++;
  }
  assert.ok(differs > 0);
});
