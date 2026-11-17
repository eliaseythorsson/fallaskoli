/* Round-trip properties of the saved state (critique item 75): the merge of two
   devices (core/merge.js) and the server's guard (server/guard.mjs).

   tests/merge.test.js holds cases written by hand. These hold what must be
   true for ANY two devices: each starts from a common past, does some work
   (the real `record`, over 30 seeds; tests/property.js) and the two are put
   together. What is checked:

     merge     nothing either device did is missing, and nothing is counted
               twice (the sums of the answers, XP, words, cells and skills);
               a device with nothing new takes the other's state whole (so
               syncing twice changes nothing); the order of the two devices
               does not matter for what is ADDED (it does for what is merely
               chosen: `run`, the settings, a word's last dozen outcomes);
               and merging a merged state with itself is itself.
     guard     what a client saves is stored as it is — `cleanState` drops
               nothing of real progress and `suspicion` stays quiet about
               practice — and is stable: cleaning twice is cleaning once.
               And the guard is not a rubber stamp: invented progress is
               cut or flagged (the last tests).

   (The round trip through the SIMULATED play of a pupil — fourteen days of
   sessions, reviews, levels — is in tests/sim.test.js.) */

import { test } from "node:test";
import assert from "node:assert/strict";
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { mergeStates } from "../src/js/core/merge.js";
import { migrate } from "../src/js/core/state.js";
import { cleanState, suspicion, LIMITS } from "../server/guard.mjs";
import { seedsOf, pastOf, workOn, backDays, copy, canon } from "./property.js";

const lex = buildLexicon(DATA);
const SEEDS = seedsOf(30);

/** The common past, and two devices that each did some work on top of it. */
function twoDevices(seed) {
  const base = pastOf(lex, seed);
  const a = copy(base), b = copy(base);
  workOn(lex, a, seed + 100, 4 + (seed % 7));
  workOn(lex, b, seed + 200, 3 + (seed % 5));
  if (seed % 3 === 0) { backDays(b, 4); b.lastActive = base.lastActive; }   // another device, a day this one has no record of
  return { base, a, b };
}

/** What a state counts, flat: "days.2026-11-13.a" → 7. */
function sums(S) {
  const o = { xp: S.xp, answers: S.totalAnswers, correct: S.totalCorrect };
  for (const [k, d] of Object.entries(S.days)) { o[`day ${k} a`] = d.a; o[`day ${k} c`] = d.c; o[`day ${k} xp`] = d.xp; }
  for (const [k, w] of Object.entries(S.words)) { o[`word ${k} c`] = w.c; o[`word ${k} w`] = w.w; }
  for (const [k, w] of Object.entries(S.cells)) { o[`cell ${k} c`] = w.c; o[`cell ${k} w`] = w.w; }
  for (const [k, w] of Object.entries(S.skills)) { o[`skill ${k} xp`] = w.xp; o[`skill ${k} c`] = w.c; o[`skill ${k} w`] = w.w; }
  return o;
}
/** base + (a − base) + (b − base), key by key. */
const expected = (base, a, b) => {
  const B = sums(base), A = sums(a), C = sums(b), out = {};
  for (const k of new Set([...Object.keys(A), ...Object.keys(C), ...Object.keys(B)]))
    out[k] = (B[k] || 0) + ((A[k] || 0) - (B[k] || 0)) + ((C[k] || 0) - (B[k] || 0));
  return out;
};
/* the part of a state that is chosen rather than added */
const chosen = (S) => {
  const o = copy(S);
  delete o.run;                                  // this device's streak of right answers
  Object.values(o.words).forEach((w) => { delete w.h; });   // a word's last dozen, whichever side answered last
  return o;
};

const fail = (seed, msg) => assert.fail(`seed ${seed}: ${msg}`);

test("merge: nothing either device did is missing, and nothing is counted twice", () => {
  for (const seed of SEEDS) {
    const { base, a, b } = twoDevices(seed);
    const M = mergeStates(base, a, b);
    /* what each device added to the common past, summed, plus the past */
    assert.deepEqual(sums(M), expected(base, a, b), `seed ${seed}`);
  }
});

test("merge: a device with nothing new takes the other state whole, so a second sync changes nothing", () => {
  for (const seed of SEEDS) {
    const { base, a, b } = twoDevices(seed);
    assert.equal(canon(mergeStates(base, a, base)), canon(a), `seed ${seed}: the server had nothing new`);
    assert.equal(canon(chosen(mergeStates(base, base, b))), canon(chosen(b)), `seed ${seed}: this device had nothing new`);
    /* a word this device did not answer keeps the other device's last dozen */
    const m = mergeStates(base, base, b);
    for (const [k, w] of Object.entries(b.words)) assert.equal(m.words[k].h, w.h, `seed ${seed}: ${k}`);
    const M = mergeStates(base, a, b);
    assert.equal(canon(mergeStates(M, M, M)), canon(M), `seed ${seed}: merging a merged state with itself`);
    assert.equal(canon(mergeStates(M, M, null)), canon(M));
    assert.equal(canon(mergeStates(base, a, null)), canon(a));
  }
});

test("merge: the order of the two devices does not change what is added", () => {
  for (const seed of SEEDS) {
    const { base, a, b } = twoDevices(seed);
    assert.equal(canon(chosen(mergeStates(base, a, b))), canon(chosen(mergeStates(base, b, a))), `seed ${seed}`);
  }
});

test("merge: the result is a state the server stores as it is", () => {
  for (const seed of SEEDS) {
    const { base, a, b } = twoDevices(seed);
    const M = mergeStates(base, a, b);
    assert.equal(canon(cleanState(copy(M))), canon(asStored(M)), `seed ${seed}`);
    assert.equal(suspicion(copy(M), copy(b)), null, `seed ${seed}: the merge looked like cheating`);
  }
});

/* ---- the guard --------------------------------------------------------- */
/** What the server should hold for a state: the same state, its profile set
    to what the guard puts there (the name comes from the user record). */
function asStored(S) {
  const o = migrate(copy(S));
  o.profile = { id: "local", name: "" };
  return o;
}

test("guard: whatever the client saves is stored as it is, and cleaning twice is cleaning once", () => {
  for (const seed of SEEDS) {
    const { base, a, b } = twoDevices(seed);
    for (const S of [base, a, b, mergeStates(base, a, b)]) {
      const c = cleanState(copy(S));
      assert.equal(canon(c), canon(asStored(S)), `seed ${seed}: the guard changed a real state`);
      assert.equal(canon(cleanState(copy(c))), canon(c), `seed ${seed}: cleaning is not stable`);
    }
  }
});

test("guard: a day of practice, and the days after it, do not look like cheating", () => {
  for (const seed of SEEDS) {
    const { base, a } = twoDevices(seed);
    assert.equal(suspicion(copy(base), null), null, `seed ${seed}: the first upload`);
    assert.equal(suspicion(copy(a), copy(base)), null, `seed ${seed}: more work the same day`);
    /* the same work a few hundred times over a day is still practice */
    const keen = copy(base);
    workOn(lex, keen, seed + 300, 300);
    assert.equal(suspicion(keen, copy(base)), null, `seed ${seed}: 300 answers in a day`);
  }
});

test("guard: it is not a rubber stamp — invented progress is cut or flagged", () => {
  const { base, a } = twoDevices(7);
  /* XP typed in by hand: not backed by any day */
  const rich = copy(a); rich.xp += 50000;
  assert.match(suspicion(rich, copy(base)) || "", /XP/);
  /* an impossible day */
  const day = copy(a); day.days[Object.keys(day.days)[0]].xp = LIMITS.dayXp + 1;
  assert.ok(suspicion(day, copy(base)));
  /* an old day rewritten */
  const old = copy(a); const k = Object.keys(old.days).sort()[0];
  old.days[k].xp += 500; old.days[k].a += 5;
  const ancient = Object.fromEntries(Object.entries(old.days).map(([d, v]) => [d.replace(/^\d{4}/, "2025"), v]));
  const hist = { ...copy(old), days: ancient };
  const prev = { ...copy(base), days: Object.fromEntries(Object.entries(base.days).map(([d, v]) => [d.replace(/^\d{4}/, "2025"), { ...v, xp: 1 }])) };
  assert.ok(suspicion(hist, prev), "an old day grew by hundreds of XP");
  /* what is not progress is dropped, and a negative or fractional count is mended */
  const junk = copy(a);
  junk.hax = "x".repeat(10); junk.xp = -5; junk.badges.invented = { n: 99, dates: [], first: "2026-01-01", last: "2026-01-01" };
  const c = cleanState(junk);
  assert.equal(c.hax, undefined);
  assert.equal(c.xp, 0);
  assert.equal(c.badges.invented, undefined);
  assert.equal(cleanState("not a state"), null);
});
