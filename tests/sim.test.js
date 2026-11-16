/* The simulation as a test (critique item 72).

   The figures in the v6.12 critique came from scripts that were run once and
   read by eye. This runs a small version of them on every build, with fixed
   seeds, and holds the PROPERTIES the improvements were made to bring — as
   ranges, never decimals (a simulated pupil is a model: sizes, not digits).

   How the pupil answers. tools/sim/sim.mjs decides, with a probability that
   falls with the sentence level, whether the pupil "knows" the question; the
   test turns that into a right or a wrong RESPONSE (tests/helpers.js), and
   core/answer.js `judge` decides whether it was right and what it earns, and
   `settle` writes it exactly as the app does. Nothing here grades by hand.
   The builders get a seeded rng, so a run is the same every time.

   It is a smaller study than the critique's (fewer pupils and days, so the
   file takes about ten seconds); the README of tools/sim says how to run the
   full ones. Every ceiling below is the measured figure plus a margin, said
   next to it, so a failure means something moved, not that the dice did.

   Item 13 (no type starved at its declared bands) is held by the property
   test of the builders, tests/builders-property.test.js. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { simulate, SKILLS, TASKS } from "../tools/sim/sim.mjs";
import { rightResponse, wrongResponse } from "./helpers.js";
import { seeded } from "../src/js/core/duel.js";
import { migrate } from "../src/js/core/state.js";
import { cleanState, suspicion } from "../server/guard.mjs";

/* What a pupil who got it wrong says. Mostly the shared helper's; a syntax
   question needs a real token to point at (the screen never offers another). */
const respond = (t, knows) => {
  if (knows) return rightResponse(t);
  if (t.type === "syntax") return { picked: t.s.tok.findIndex((x) => x.r !== t.askRole) };
  return wrongResponse(t);
};
const run = (o) => simulate({ respond, allSkills: true, size: 10, ...o });
const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
const share = (a, f) => a.filter(f).length / Math.max(1, a.length);
const ABILITY = { weak: 0.5, strong: 0.9 };

/* ---- mixed sessions: 2 abilities × 2 pupils × 14 days × 2 sessions of 10 ---- */
const mixed = {};
for (const [name, ability] of Object.entries(ABILITY))
  mixed[name] = [0, 1].map((k) => run({ ability, days: 14, perDay: 2, seed: 100 + k, builderRng: seeded(900 + k) }));
const logOf = (name) => mixed[name].flatMap((r) => r.log);

/* Where a missed cell comes back: the share asked again on a LATER day, and the
   next one. A miss on the last day has had no time, so it is left out. */
function nextDayShare(runs) {
  const back = [];
  for (const r of runs) {
    const L = r.log, last = L[L.length - 1].d;
    for (let i = 0; i < L.length; i++) {
      if (L[i].ok || !L[i].cell || L[i].d >= last) continue;
      let j = i + 1;
      while (j < L.length && !(L[j].cell === L[i].cell && L[j].d > L[i].d)) j++;
      back.push(j < L.length ? L[j].d - L[i].d : Infinity);
    }
  }
  return { n: back.length, share: share(back, (x) => x <= 1) };
}

test("sessions never run dry, and the simulated pupils answer as modelled", () => {
  for (const name of Object.keys(ABILITY)) {
    assert.deepEqual(mixed[name].map((r) => r.nulls), [0, 0], `${name}: a pick found nothing`);
    assert.equal(logOf(name).length, 2 * 14 * 2 * 10);
  }
  /* The model says 50% and 90% at level 1, less higher up; the judge must
     agree with it to within a few points of what was drawn. */
  const acc = (n) => share(logOf(n), (x) => x.ok);
  assert.ok(acc("weak") > 0.35 && acc("weak") < 0.65, `weak pupils: ${acc("weak")} right`);
  assert.ok(acc("strong") > 0.75 && acc("strong") < 0.97, `strong pupils: ${acc("strong")} right`);
});

test("items 11 and 12: strong pupils are served clearly higher levels than weak ones", () => {
  /* Measured (2 pupils × 14 days): after the first week the strong pupils'
     questions average level 2.3 and the weak ones' 1.6; session difficulty
     2.3 against 1.1. */
  const late = (n) => logOf(n).filter((x) => x.d >= 7);
  const lv = (n) => mean(late(n).map((x) => x.lvl));
  assert.ok(lv("strong") - lv("weak") >= 0.4, `level ${lv("strong")} (strong) vs ${lv("weak")} (weak)`);
  assert.ok(lv("strong") >= 1.8, `strong pupils stay low: ${lv("strong")}`);
  assert.ok(lv("weak") <= 2.0, `weak pupils are served too much: ${lv("weak")}`);
  const diff = (n) => mean(late(n).map((x) => x.diff));
  assert.ok(diff("strong") - diff("weak") >= 0.7, `difficulty ${diff("strong")} vs ${diff("weak")}`);
  assert.ok(diff("weak") < 1.8, `weak difficulty ${diff("weak")}`);
  /* It does not start from zero each day: the strong pupil's first questions
     of a later day are not lower than the weak pupil's. */
  const first = (n) => mean(logOf(n).filter((x) => x.d >= 3 && x.i < 2).map((x) => x.diff));
  assert.ok(first("strong") > first("weak") + 0.5, `${first("strong")} vs ${first("weak")}`);
});

/* Item 12 is read below, from the single-topic runs. */

test("item 18: most missed cells come back the next day", () => {
  /* Measured: 62% for the weak pupils (who miss ten a day and cannot all be
     reviewed: the queue asks the freshest first), 84% for the strong. */
  const weak = nextDayShare(mixed.weak), strong = nextDayShare(mixed.strong);
  assert.ok(weak.n > 100 && strong.n > 50, `too few misses to say: ${weak.n}, ${strong.n}`);
  assert.ok(weak.share >= 0.5, `weak: ${weak.share} of ${weak.n} misses came back the next day`);
  assert.ok(strong.share >= 0.7, `strong: ${strong.share} of ${strong.n}`);
});

test("item 18: without the queue it is a small minority (so the figure above is the queue's)", () => {
  /* Measured 16% (strong) — the cell comes up by chance, as the old rule had it. */
  const old = [0, 1].map((k) => run({ ability: 0.9, days: 14, perDay: 2, seed: 100 + k, builderRng: seeded(900 + k), review: false }));
  const o = nextDayShare(old);
  assert.ok(o.share < 0.35, `without review: ${o.share}`);
  assert.ok(nextDayShare(mixed.strong).share - o.share >= 0.3, "the queue adds under 30 points");
});

/* ---- single-topic sessions: 12 categories × 2 pupils × 4 days × 2 sessions --- */
const topics = {};
for (const s of SKILLS) {
  let rows = [], nulls = 0, repeats = 0, own = 0;
  for (let k = 0; k < 2; k++) {
    const r = run({ ability: 0.8, days: 4, perDay: 2, topic: s.id, seed: 7 + k, builderRng: seeded(50 + k) });
    nulls += r.nulls;
    const seen = new Set();
    for (const x of r.log) {
      /* A review or a re-ask is a repeat ON PURPOSE (item 18); it is not the
         builder running out of questions, and is counted apart. */
      if (seen.has(x.sig)) { repeats++; if (!x.review && !x.reask) own++; }
      seen.add(x.sig);
    }
    rows = rows.concat(r.log);
  }
  topics[s.id] = { rows, n: rows.length, nulls, all: repeats / rows.length, own: own / rows.length };
}

test("item 12 (and 11): in a single-topic session a pupil who knows the work climbs, and starts the next day where they left off", () => {
  /* Measured (ability 0.8): on the first day the level goes 1.5 → 1.7 over the
     ten questions; from the third day on, a session starts at 2.6 — not at 1.3
     as in v6.12, which spent the first half of every session below the pupil. */
  const rows = SKILLS.flatMap((s) => topics[s.id].rows);
  const at = (f, from, to) => mean(rows.filter((x) => f(x) && x.i >= from && x.i <= to).map((x) => x.lvl));
  const day0 = (x) => x.d === 0 && x.r === 0, later = (x) => x.d >= 2;
  assert.ok(at(day0, 4, 9) - at(day0, 0, 1) >= 0.1, `day 0: ${at(day0, 0, 1)} → ${at(day0, 4, 9)}`);
  assert.ok(at(later, 0, 1) - at(day0, 0, 1) >= 0.5, `later days start at ${at(later, 0, 1)}, the first at ${at(day0, 0, 1)}`);
  assert.ok(at(later, 0, 1) >= 2.0, `later days start at ${at(later, 0, 1)}`);
});

/* Item 23. The ceilings are what the pools gave when this was written, plus
   about ten points; a category that spends its questions faster than that has
   lost pool. (The critique's target for 30 sessions was under 10%; here a
   pupil sees 80 questions, and the share grows with the count.) */
const CEILING = {   // measured % of the questions that repeat one asked before, outside reviews
  nafnord: 0.20,         // 10.6
  lysingarord: 0.15,     // 6.3
  sagnord: 0.20,         // 11.3
  obeygjanleg: 0.18,     // 8.8
  fallstjorn: 0.15,      // 6.3
};                       // every other category: measured 0–3%; ceiling 8%
test("item 23: exact repeats in single-topic sessions stay under a ceiling per category", () => {
  for (const s of SKILLS) {
    const t = topics[s.id];
    assert.equal(t.nulls, 0, `${s.id}: ran out of questions`);
    assert.equal(t.n, 160, `${s.id}: ${t.n} questions`);
    const ceil = CEILING[s.id] ?? 0.08;
    assert.ok(t.own <= ceil, `${s.id}: ${(100 * t.own).toFixed(1)}% exact repeats (ceiling ${100 * ceil}%)`);
    /* Reviews and re-asks are repeats on purpose, three at most to a session
       of ten; counting them too, nothing passes a third (measured 26% at most). */
    assert.ok(t.all <= 0.36, `${s.id}: ${(100 * t.all).toFixed(1)}% repeats, reviews included`);
  }
});

/* ---- the level curve (item 60): one session on four days a week --------- */
test("item 60: the level curve reaches level 5 in the window progress.js promises", () => {
  /* progress.js: level 5 after about 18 sessions, 4.6 weeks (typical). Three
     pupils at 72%, one session of ten on four days of every seven, 50 days. */
  const on = new Set([0, 1, 3, 4]);
  const sessionsToL5 = [0, 1, 2].map((k) => {
    const r = run({ ability: 0.72, days: 50, perDay: 1, seed: 300 + k, builderRng: seeded(70 + k), activeDays: (d) => on.has(d % 7) });
    let n = 0;
    for (let d = 0; d < r.dayXp.length; d++) {
      if (r.dayXp[d] > 0) n++;
      if (r.lvlByDay[d] >= 5) return { n, day: d + 1, xp: mean(r.dayXp.filter((x) => x > 0)) };
    }
    return { n: Infinity, day: Infinity, xp: 0 };
  });
  const sessions = sessionsToL5.map((x) => x.n).sort((a, b) => a - b)[1];   // the median
  /* Measured 17, 18 and 20 sessions (days 28–32). The comment promises ~18. */
  assert.ok(sessions >= 11 && sessions <= 28, `level 5 after ${sessions} sessions: ${JSON.stringify(sessionsToL5)}`);
  const weeks = sessionsToL5.map((x) => x.day / 7).sort((a, b) => a - b)[1];
  assert.ok(weeks >= 3 && weeks <= 7, `level 5 in week ${weeks}`);
  /* And it is not a handful of questions: the pupil earns about 90 XP a day. */
  const xp = mean(sessionsToL5.map((x) => x.xp));
  assert.ok(xp >= 60 && xp <= 140, `${xp} XP per active day`);
});

test("the simulation is repeatable: the same seeds give the same questions", () => {
  const a = run({ ability: 0.7, days: 2, perDay: 1, seed: 5, builderRng: seeded(5) });
  const b = run({ ability: 0.7, days: 2, perDay: 1, seed: 5, builderRng: seeded(5) });
  assert.deepEqual(a.log.map((x) => x.sig + x.ok), b.log.map((x) => x.sig + x.ok));
  assert.ok(TASKS.length > 40);
});

test("what a simulated pupil saves after fourteen days, the server's guard stores as it is and does not doubt", () => {
  /* The whole state of real play — review queue, saved levels, per-type
     counts, diagnosis — not a hand-made one (tests/state-property.test.js). */
  for (const [name, runs] of Object.entries(mixed)) for (const [k, r] of runs.entries()) {
    const S = JSON.parse(JSON.stringify(r.S));
    const today = new Date(S.lastActive + "T12:00:00Z");      // the sim's last day, not the real one
    const want = migrate(JSON.parse(JSON.stringify(S)));
    want.profile = { id: "local", name: "" };
    const got = cleanState(JSON.parse(JSON.stringify(S)), { today });
    assert.deepEqual(got, want, `${name} ${k}: the guard changed a state the client saved`);
    assert.deepEqual(cleanState(JSON.parse(JSON.stringify(got)), { today }), got, `${name} ${k}: cleaning twice`);
    assert.equal(suspicion(got, null, { today }), null, `${name} ${k}: a first upload looked like cheating`);
  }
});
