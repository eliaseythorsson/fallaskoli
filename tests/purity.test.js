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
import { TASKS, typeById, nextTask, drillTask, DRILL_PLAN, makeView, withView, applyEffects, FX }
  from "../src/js/tasks/index.js";

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
    asked on other days, hand-written items remembered. `band` is the session
    difficulty of every skill. Not frozen. */
function pupil(band, seed = 1) {
  const g = seeded(4000 + seed);
  const ri = (n) => Math.floor(g() * n);
  const S = blankState();
  SKILL_IDS.forEach((id) => { S.enabled[id] = true; S.skills[id].xp = skillNeed(1 + ri(6)); });
  for (let k = 0; k < 300; k++) {
    const w = lex.all[ri(lex.all.length)];
    S.words[wordKey(w.o, w.c)] = { c: ri(7), w: ri(5) };
    if (k < 40) Object.keys(w.forms || {}).forEach((m) => { S.cells[m] = { c: ri(6), w: ri(6) }; });
  }
  S.vocab = {};
  const defined = lex.all.filter((x) => x.d);
  for (let k = 0; k < 200; k++) {
    const w = defined[ri(defined.length)];
    const last = daysAgo([0, 3, 10, 40][ri(4)]);
    S.vocab[wordKey(w.o, w.c)] = { n: 1 + ri(2), dates: [last], first: last, last };
  }
  EX.wordInContext.forEach((x) => {
    if (g() < 0.3) S.vocab[`samhengi:${x.t}`] = { n: 1, dates: [daysAgo(3)], first: daysAgo(3), last: daysAgo(3) };
  });
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

test("a vocabulary item is marked as asked when its question is shown, not when it is built", () => {
  /* Not to_samr and to_flt: since v6.13 the numeral items are grammar, not
     vocabulary, and are not marked at all (tests/review.test.js). */
  for (const id of ["meaning", "or_heiti", "or_samhengi", "or_myndun"]) {
    const p = pupil(3, 5);
    const spec = typeById(id);
    const before = copy(p.S.vocab);
    /* five candidates, as pickTargeted builds them … */
    const cands = [];
    for (let seed = 0; seed < 5; seed++) {
      const b = spec.build(lex, view(p), seeded(70 + seed));
      if (b) cands.push(b);
    }
    assert.ok(cands.length >= 3, `${id}: too few candidates to say anything`);
    assert.deepEqual(p.S.vocab, before, `${id}: building marked something`);
    cands.forEach((b) => {
      const asked = b.effects.filter((e) => e.op === "asked");
      assert.equal(asked.length, 1, `${id}: one item, one mark`);
      assert.equal(asked[0].day, TODAY);
    });
    /* … and one is shown. */
    const shown = cands[cands.length - 1];
    const key = shown.effects.find((e) => e.op === "asked").key;
    const n0 = (before[key] || { n: 0 }).n;
    applyEffects(p, shown.effects);
    assert.equal(p.S.vocab[key].n, n0 + 1);
    assert.equal(p.S.vocab[key].last, TODAY);
    const moved = Object.keys(p.S.vocab).filter((k) => JSON.stringify(p.S.vocab[k]) !== JSON.stringify(before[k]));
    assert.deepEqual(moved, [key], `${id}: only the item that was shown is marked`);
    /* the item just shown is not chosen again today */
    for (let seed = 0; seed < 20; seed++) {
      const again = spec.build(lex, view(p), seeded(300 + seed));
      if (again) assert.notEqual(again.effects.find((e) => e.op === "asked").key, key, `${id}: asked twice in a day`);
    }
  }
});

test("the meaning question shows the word's history as it stands once it is shown", () => {
  const p = pupil(3, 6);
  const b = typeById("meaning").build(lex, view(p), seeded(5));
  const key = b.task.word;
  const had = (p.S.vocab[key] || { n: 0 }).n;
  assert.equal(b.task.spacing.n, had + 1);
  assert.equal(b.task.spacing.last, TODAY);
  applyEffects(p, b.effects);
  assert.equal(p.S.vocab[key].n, b.task.spacing.n);
  assert.deepEqual(p.S.vocab[key].dates, b.task.spacing.dates);
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
     of the one it returns. Every vocabulary mark must belong to a question
     that was shown — the simulation behind critique item 4 counted 461 marks
     for at most 273 questions. */
  const p = pupil(3, 10);
  p.S.vocab = {};
  const rng = seeded(2024);
  const ids = ["merking", "ef", "thf_thgf"];
  let shown = 0, candidates = 0;
  const shownKeys = [];
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
    effects.get(t).filter((e) => e.op === "asked").forEach((e) => shownKeys.push(e.key));
    applyEffects(p, effects.get(t));
  }
  assert.ok(candidates > shown * 1.5, `only ${candidates} candidates for ${shown} questions: nothing was thrown away`);
  const marks = Object.values(p.S.vocab).reduce((a, r) => a + r.n, 0);
  assert.ok(shownKeys.length > 10, "no vocabulary question came up");
  assert.equal(marks, shownKeys.length, "marked as asked without being shown");
  assert.deepEqual(Object.keys(p.S.vocab).sort(), [...new Set(shownKeys)].sort());
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
