/* The builders are pure, and the random source is passed in (v6.13).

   Until v6.13 the app object was the builders' context and they wrote to it:
   the cached policy, the noun waiting for another cloze, the words the session
   had seen, and — worst — the vocabulary record. `pickTargeted` builds up to
   five candidates and keeps one, so over 30 simulated days 461 vocabulary
   items were marked as asked and at most 273 were shown; each discarded one
   was then locked for a week. And a duel made its questions the same for both
   players by swapping the global random generator while they were built.

   Now a builder is build(lex, view, rng) → { task, effects }:
     * the state it is shown is frozen here all the way down, so any write
       throws — not "is noticed later", throws;
     * the same state and the same seed give the same task, however often;
     * what showing the task changes is in `effects`, applied by whoever
       shows it, and only then;
     * the global generator is taken away while everything is built. */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DATA } from "../data/data_bundle.js";
import { EX } from "../data/exercises.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, newSession, wordKey, todayKey } from "../src/js/core/state.js";
import { SKILL_IDS } from "../src/js/core/skills.js";
import { createPolicy, narrowPolicy } from "../src/js/core/policy.js";
import { skillNeed } from "../src/js/core/progress.js";
import { seeded } from "../src/js/core/duel.js";
import { pickTargeted } from "../src/js/core/diagnosis.js";
import { wordsOf } from "../src/js/core/wordknowledge.js";
import { TASKS, typeById, nextTask, buildTask, drillTask, DRILL_PLAN, makeView, withView, applyEffects, FX }
  from "../src/js/tasks/index.js";
import { giveWords } from "./learner.js";

const lex = buildLexicon(DATA);
const TODAY = "2026-03-10";
const allOn = {};
SKILL_IDS.forEach((id) => { allOn[id] = true; });
const POLICY = createPolicy(null, { skills: allOn, types: {}, levels: {}, attrs: {}, safeVocab: null });

function deepFreeze(o, seen = new Set()) {
  if (!o || typeof o !== "object" || seen.has(o)) return o;
  seen.add(o);
  Object.values(o).forEach((v) => deepFreeze(v, seen));
  return Object.freeze(o);
}

const daysAgo = (n) => {
  const [y, m, d] = TODAY.split("-").map(Number);
  const x = new Date(Date.UTC(y, m - 1, d - n));
  return x.toISOString().slice(0, 10);
};

/** A state and a session with a past: words met, cells missed, vocabulary
    asked on other days, hand-written items remembered, six words in learning
    (tests/learner.js: a type that asks about them builds nothing without). `band` is the session
    difficulty of every skill. Not frozen. */
function pupil(band, seed = 1) {
  const g = seeded(4000 + seed);
  const ri = (n) => Math.floor(g() * n);
  const S = giveWords(blankState());
  SKILL_IDS.forEach((id) => { S.enabled[id] = true; S.skills[id].xp = skillNeed(1 + ri(6)); });
  for (let k = 0; k < 300; k++) {
    const w = lex.all[ri(lex.all.length)];
    S.words[wordKey(w.o, w.c)] = { c: ri(7), w: ri(5) };
    if (k < 40) Object.keys(w.forms || {}).forEach((m) => { S.cells[m] = { c: ri(6), w: ri(6) }; });
  }
  const sess = newSession(S);
  Object.keys(sess.diff).forEach((k) => { sess.diff[k] = band; });
  for (let k = 0; k < 10; k++) sess.seen.push(lex.all[ri(lex.all.length)].o);
  sess.exSeen = EX.pronounGap.filter(() => g() < 0.3).map((x) => x.t);
  sess.sinceTable = ri(6);
  sess.sinceMeaning = ri(4);
  return { S, sess };
}

const view = (p, extra = {}) => makeView({ S: p.S, sess: p.sess, policy: POLICY, today: TODAY, ...extra });
const copy = (x) => JSON.parse(JSON.stringify(x));

/** A task as plain data: what two builds must agree on, word for word. */
const plain = (b) => (b ? copy({ task: b.task, effects: b.effects }) : null);

test("building a question changes nothing: every type, on a frozen state", () => {
  for (const band of [1, 3, 5]) {
    const p = pupil(band);
    const before = copy(p);
    deepFreeze(p.S); deepFreeze(p.sess);
    for (const spec of TASKS) {
      let builtSome = false;
      for (let seed = 0; seed < 12; seed++) {
        /* A write to the frozen state throws a TypeError here. */
        const b = spec.build(lex, view(p), seeded(seed));
        if (!b) continue;
        builtSome = true;
        assert.ok(b.task && Array.isArray(b.effects), `${spec.id}: a builder returns { task, effects }`);
      }
      assert.ok(builtSome, `${spec.id} built nothing at band ${band}`);
    }
    assert.deepEqual(copy(p), before, `the state moved at band ${band}`);
  }
});

test("the same state and the same seed give the same task, every time", () => {
  const p = pupil(3, 2);
  deepFreeze(p.S); deepFreeze(p.sess);
  for (const spec of TASKS) {
    for (let seed = 0; seed < 6; seed++) {
      const a = plain(spec.build(lex, view(p), seeded(900 + seed)));
      /* …whatever was built in between */
      TASKS[(seed * 7) % TASKS.length].build(lex, view(p), seeded(seed));
      const b = plain(spec.build(lex, view(p), seeded(900 + seed)));
      assert.deepEqual(a, b, `${spec.id}, seed ${900 + seed}`);
    }
  }
  /* …and another seed gives another question, so the seed is really used. */
  const fill = typeById("fill");
  const two = new Set([1, 2, 3, 4, 5, 6].map((s) => JSON.stringify(plain(fill.build(lex, view(p), seeded(s))))));
  assert.ok(two.size > 3);
});

test("choosing the next question is pure too, with a noun waiting or without", () => {
  const p = pupil(3, 3);
  const before = copy(p);
  deepFreeze(p.S); deepFreeze(p.sess);
  const noun = lex.lookup("hestur", "kk");
  for (let seed = 0; seed < 60; seed++) {
    const v = view(p, { inRun: true, mix: { n: 10, counts: { fill: 1 } }, forcedNoun: seed % 4 ? null : noun });
    const a = nextTask(lex, v, seeded(seed));
    const b = nextTask(lex, v, seeded(seed));
    assert.ok(a, "no question");
    assert.deepEqual(plain(a), plain(b), `seed ${seed}`);
    assert.ok(Object.isFrozen(v), "the view itself is frozen");
    /* a noun that was waiting has had its turn, whatever came out */
    assert.equal(a.effects.some((e) => e.op === "clearForcedNoun"), seed % 4 === 0);
  }
  assert.deepEqual(copy(p), before);
});

test("a rescue drill builds its questions without touching the state", () => {
  const p = pupil(3, 4);
  const before = copy(p);
  deepFreeze(p.S); deepFreeze(p.sess);
  for (const cls of Object.keys(DRILL_PLAN)) {
    const w = (lex.byClass[cls] || [])[0];
    if (!w) continue;
    for (let turn = 0; turn < 7; turn++) {
      const v = view(p);
      const a = drillTask(lex, v, seeded(turn), w, turn);
      const b = drillTask(lex, v, seeded(turn), w, turn);
      assert.deepEqual(plain(a), plain(b), `${w.o}, turn ${turn}`);
      if (a) assert.equal(a.task.word, wordKey(w.o, w.c));
      assert.equal(v.mustAsk, null, "the drilled word is in a view of the drill's own");
    }
  }
  assert.deepEqual(copy(p), before);
});

test("the view is read-only, and deriving one leaves the first as it was", () => {
  const p = pupil(2);
  const v = view(p);
  assert.throws(() => { v.mustAsk = { word: lex.nouns[0], strict: false }; }, TypeError);
  assert.throws(() => { v.policy = null; }, TypeError);
  const w = withView(v, { mustAsk: { word: lex.nouns[0], strict: true } });
  assert.equal(v.mustAsk, null);
  assert.equal(w.mustAsk.word, lex.nouns[0]);
  assert.ok(Object.isFrozen(w.mustAsk));
  assert.equal(w.S, v.S);
  /* with nothing given, the policy is the child's own and the day is today */
  const bare = makeView({ S: p.S, sess: p.sess });
  assert.equal(typeof bare.policy.skill, "function");
  assert.equal(bare.today, todayKey());
  assert.deepEqual(bare.huntPrefer, []);
});

/* ---------- effects: applied for the task that is shown, and only then ---- */

test("the question just shown is remembered when it is shown, not when it is built", () => {
  /* The spacing rule (#10) compares the next question with the one shown
     last (`sess.lastAsked`, tasks/effects.js "last"). Five candidates, as
     pickTargeted builds them, change nothing; the one shown is remembered. */
  for (const id of ["meaning", "or_heiti", "or_samhengi", "or_myndun", "fill", "tbl_no"]) {
    const p = pupil(3, 5);
    p.sess.lastAsked = null;
    const cands = [];
    for (let seed = 0; seed < 5; seed++) {
      const b = buildTask(lex, view(p), seeded(70 + seed), id);
      if (b) cands.push(b);
    }
    assert.ok(cands.length >= 3, `${id}: too few candidates to say anything`);
    assert.equal(p.sess.lastAsked, null, `${id}: building remembered something`);
    cands.forEach((b) => assert.equal(b.effects.filter((e) => e.op === "last").length, 1, `${id}: one question, one "last"`));
    const shown = cands[cands.length - 1];
    applyEffects(p, shown.effects);
    assert.deepEqual(p.sess.lastAsked, { type: id, words: wordsOf(shown.task) });
    if (shown.task.word) assert.ok(p.sess.lastAsked.words.includes(shown.task.word), `${id}: its word is remembered`);
  }
});

test("a hand-written item is remembered when it is shown, and at most forty of them", () => {
  for (const id of ["fn_eyda", "fn_stad", "fn_aftur", "to_val", "ob_st", "fs_hreyf", "fs_sogn", "fs_operson",
    "ob_tengiord", "ob_skilja"]) {
    const p = pupil(3, 7);
    p.sess.exSeen = [];
    const b = typeById(id).build(lex, view(p), seeded(11));
    assert.ok(b, id);
    const fx = b.effects.filter((e) => e.op === "exSeen");
    assert.equal(fx.length, 1, `${id}: one item, one memory`);
    assert.deepEqual(p.sess.exSeen, [], `${id}: remembered before it was shown`);
    applyEffects(p, b.effects);
    assert.deepEqual(p.sess.exSeen, [fx[0].key]);
  }
  const host = { S: blankState(), sess: { exSeen: [] }, forcedNoun: null };
  for (let k = 0; k < 55; k++) applyEffects(host, [FX.exSeen("k" + k)]);
  assert.equal(host.sess.exSeen.length, 40);
  assert.equal(host.sess.exSeen[0], "k15");
  assert.equal(host.sess.exSeen[39], "k54");
});

test("the session learns what it has met only from the question that is shown", () => {
  const p = pupil(2, 8);
  p.sess.sinceTable = 2; p.sess.sinceMeaning = 1;
  const seen0 = [...p.sess.seen];
  let b = null;
  for (let seed = 0; seed < 200 && !(b && b.task.typeId === "tbl_no"); seed++)
    b = nextTask(lex, view(p, { policy: narrowPolicy(POLICY, { skills: ["nafnord"] }) }), seeded(seed));
  assert.equal(b.task.typeId, "tbl_no");
  assert.deepEqual(p.sess.seen, seen0);
  assert.equal(p.sess.sinceTable, 2);
  applyEffects(p, b.effects);
  assert.equal(p.sess.sinceTable, 0, "a table was shown");
  assert.equal(p.sess.sinceMeaning, 2);
  assert.deepEqual(p.sess.seen, [...seen0, b.task.w.o]);
});

test("a noun waiting for another cloze is let go by the question that takes its turn", () => {
  const p = pupil(2, 9);
  const host = { S: p.S, sess: p.sess, forcedNoun: lex.lookup("hestur", "kk") };
  const b = nextTask(lex, view(p, { forcedNoun: host.forcedNoun }), seeded(3));
  assert.ok(b);
  assert.equal(host.forcedNoun.o, "hestur", "not while the question is only built");
  applyEffects(host, b.effects);
  assert.equal(host.forcedNoun, null);
  if (b.task.type === "fill") assert.equal(b.task.n.o, "hestur");
});

test("candidates that are thrown away use nothing up (the session as app.pickTask runs it)", () => {
  /* What the app does: several candidates through pickTargeted, the effects
     of the one it returns. Until #10 this counted the vocabulary marks (the
     simulation behind critique item 4 found 461 marks for at most 273
     questions); the session's memory of the last question is held the same
     way now: it is always the question shown, never a candidate. */
  const p = pupil(3, 10);
  const rng = seeded(2024);
  const ids = ["merking", "ef", "thf_thgf"];
  let shown = 0, candidates = 0;
  for (let q = 0; q < 300; q++) {
    const v = view(p, { inRun: true });
    const effects = new Map();
    const t = pickTargeted(() => {
      const b = nextTask(lex, v, rng);
      if (!b) return null;
      candidates++;
      effects.set(b.task, b.effects);
      return b.task;
    }, ids, { p: 0.85, tries: 8, rnd: rng });
    assert.ok(t);
    shown++;
    applyEffects(p, effects.get(t));
    assert.deepEqual(p.sess.lastAsked, { type: t.typeId, words: wordsOf(t) }, "remembered a question that was not shown");
  }
  assert.ok(candidates > shown * 1.5, `only ${candidates} candidates for ${shown} questions: nothing was thrown away`);
});

test("an effect nobody knows is an error, not a silence", () => {
  assert.throws(() => applyEffects({ S: blankState(), sess: {} }, [{ op: "eitthvað" }]), /unknown effect/);
  assert.doesNotThrow(() => applyEffects({ S: blankState(), sess: {} }, []));
  assert.doesNotThrow(() => applyEffects({ S: blankState(), sess: {} }, undefined));
});

/* ---------- the random source --------------------------------------------- */

test("no file under src/js/tasks names Math.random", () => {
  const dir = new URL("../src/js/tasks/", import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith(".js"));
  assert.ok(files.length >= 20, "the task files have moved; point this test at them");
  for (const f of files) {
    const text = readFileSync(new URL(f, dir), "utf8");
    assert.ok(!/Math\s*\.\s*random/.test(text), `src/js/tasks/${f} names Math.random`);
    /* the usual ways round it */
    assert.ok(!/crypto\s*\.\s*getRandomValues|Date\s*\.\s*now\s*\(|new Date\s*\(/.test(text),
      `src/js/tasks/${f} reads the clock or another random source`);
  }
});

test("with Math.random taken away, every builder, the chooser and the drill still work", () => {
  const p = pupil(4, 11);
  const real = Math.random;
  let calls = 0;
  Math.random = () => { calls++; throw new Error("Math.random was called while a question was built"); };
  try {
    for (const spec of TASKS) {
      for (let seed = 0; seed < 8; seed++) spec.build(lex, view(p), seeded(seed));
    }
    for (let seed = 0; seed < 40; seed++) nextTask(lex, view(p, { inRun: true }), seeded(seed));
    for (const cls of Object.keys(DRILL_PLAN)) {
      const w = (lex.byClass[cls] || [])[0];
      if (w) for (let turn = 0; turn < 6; turn++) drillTask(lex, view(p), seeded(turn), w, turn);
    }
  } finally {
    Math.random = real;
  }
  assert.equal(calls, 0);
});

test("a builder without a random source fails at once instead of finding its own", () => {
  const p = pupil(2, 12);
  assert.throws(() => typeById("fill").build(lex, view(p)), TypeError);
  assert.throws(() => nextTask(lex, view(p)), TypeError);
});

test("the word asked again after a wrong answer is never swapped for a fixed sentence's own noun", () => {
  /* v6.13: a sentence that takes no other noun ("Þið komið of seint í
     tímann aftur.") was asked with its own noun, and the waiting word was
     let go unasked. */
  const fn = lex.lookup("hestur", "kk");
  for (let k = 1; k <= 300; k++) {
    const p = pupil(2, k);
    const b = typeById("fill").build(lex, view(p, { forcedNoun: fn }), seeded(k));
    if (b) assert.equal(b.task.n.o, "hestur", `seed ${k}: "${b.task.s.t}" asks ${b.task.n.o}`);
  }
});
