/* Þyngd 6 and 7 (item 14).

   Until v6.13 the two levels were switches with nothing behind them: no
   sentence was above level 5, and Setningagerðir stamped every question
   þyngd 6 whatever its sentence. These tests hold what replaced that:

     - the bank has sentences at 6 and 7, and they are of the kind the levels
       promise (length, and the constructions of years 9 and 10);
     - a Setningagerðir question carries the level of its sentence;
     - at band 6 and 7 the builders that draw on the sentence bank use the
       level 6 and 7 sentences — and never where the policy has them off;
     - the session's difficulty reaches them, and only where the policy
       has them switched on. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, newSession, effectivePolicy } from "../src/js/core/state.js";
import { createPolicy, applyPreset, LEVELS } from "../src/js/core/policy.js";
import { SKILL_IDS } from "../src/js/core/skills.js";
import { bumpDiff, diffOf, levelRanges, applyRanges, MAX } from "../src/js/core/difficulty.js";
import { makeView, TASKS } from "../src/js/tasks/index.js";
import { typeById } from "../src/js/tasks/registry.js";
import { sentPool } from "../src/js/tasks/shared.js";
import { nounCloze } from "../src/js/tasks/cloze.js";
import { frameIndex } from "../src/js/tasks/frames.js";
import { computeXp } from "../src/js/core/progress.js";

const lex = buildLexicon(DATA);

/** A small seeded generator, so a failure can be reproduced. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const allSkills = Object.fromEntries(SKILL_IDS.map((id) => [id, true]));
const policyWith = (levels = {}) =>
  createPolicy(null, { skills: allSkills, types: {}, levels, attrs: {}, safeVocab: null });
const upTo = (top) => Object.fromEntries(LEVELS.map((n) => [String(n), n <= top]));

/** A new pupil with every skill's session difficulty at `band`. */
function viewAt(band, policy = policyWith()) {
  const S = blankState();
  const sess = newSession(S);
  Object.keys(sess.diff).forEach((k) => { sess.diff[k] = band; });
  return makeView({ S, sess, policy, today: "2026-01-15" });
}

/** Every task one type builds over `n` seeds at one band. */
function buildMany(id, band, policy, n = 150) {
  const spec = typeById(id);
  const out = [];
  for (let seed = 0; seed < n; seed++) {
    const b = spec.build(lex, viewAt(band, policy), seeded(7000 + seed));
    if (b && b.task) out.push(b.task);
  }
  return out;
}

const count = (lvl) => lex.sentences.filter((s) => s.lvl === lvl).length;
const words = (s) => s.t.split(/\s+/).length;
const kindsIn = (s) => new Set(s.tok.map((t) => t.k).filter(Boolean));

/* ---------- the bank ------------------------------------------------------- */

test("the bank has sentences at every level, 80 or more at 6 and 50 or more at 7", () => {
  for (const lvl of LEVELS) assert.ok(count(lvl) > 0, `no sentence at þyngd ${lvl}`);
  assert.ok(count(6) >= 80, `þyngd 6: ${count(6)} sentences, at least 80 were asked for`);
  assert.ok(count(7) >= 50, `þyngd 7: ${count(7)} sentences, at least 50 were asked for`);
  /* Exact, so that a sentence lost to a parse change is noticed here and not
     three releases later. Change the numbers when you add or drop sentences. */
  /* item 28: 91 short sentences at 2-5; item 24: 31 "any noun" frames at 1 and 9 at 2;
     item 23: 49 at 1 with a verb or preposition that governs one case;
     v6.13 review S2: "Bókin fjallar um eldfjall." at 1 */
  assert.deepEqual(LEVELS.map(count), [293, 207, 192, 133, 89, 139, 78]);
  assert.equal(Math.max(...lex.sentences.map((s) => s.lvl)), MAX, "a sentence above the top of the scale");
});

test("level 6 and 7 sentences are long enough to hold what the levels promise", () => {
  for (const s of lex.sentences) {
    if (s.lvl === 6) assert.ok(words(s) >= 11, `þyngd 6 with ${words(s)} words: ${s.t}`);
    if (s.lvl === 7) assert.ok(words(s) >= 15, `þyngd 7 with ${words(s)} words: ${s.t}`);
  }
});

test("level 6 and 7 hold the year 9-10 constructions, in numbers", () => {
  const hard = lex.sentences.filter((s) => s.lvl >= 6);
  const has = (pred) => hard.filter((s) => s.tok.some(pred)).length;
  /* viðtengingarháttur þátíðar: "ef ég hefði vitað", "sagði að hún kæmi" */
  assert.ok(has((t) => /-VH-ÞT/.test(t.m || "")) >= 120, "too few with viðtengingarháttur þátíðar");
  /* þolmynd: a past participle ("var byggð") or, with a dative subject, a
     supine after *vera/verða* ("var frestað") — counted here by the participle */
  assert.ok(has((t) => (t.m || "") === "LHÞT") >= 60, "too few with a lýsingarháttur þátíðar");
  /* a subordinate clause in all but the long-noun-phrase sentences */
  const sub = hard.filter((s) => kindsIn(s).has("aukasetning")).length;
  assert.ok(sub >= hard.length - 15, `only ${sub} of ${hard.length} have a subordinate clause`);
  /* every level-7 sentence has more than one kind of clause, with the
     boundaries vouched for */
  for (const s of hard.filter((x) => x.lvl === 7)) {
    assert.ok(kindsIn(s).size > 1, `þyngd 7 without a subordinate clause: ${s.t}`);
    assert.ok(!s.ku, `þyngd 7 with unvouched clause boundaries: ${s.t}`);
  }
});

test("the build could vouch for the clauses of every level 6 and 7 sentence", () => {
  assert.deepEqual(lex.sentences.filter((s) => s.lvl >= 6 && s.ku).map((s) => s.t), []);
});

test("level 6 and 7 sentences can be asked as a cloze with their own noun", () => {
  /* The slot is `none` on all of them (pipeline/sentences.py), so the cloze needs the
     slot's own noun to be in the lexicon with the form the sentence uses. */
  for (const lvl of [6, 7]) {
    const withSlot = lex.sentences.filter((s) => s.lvl === lvl && s.slot != null);
    assert.ok(withSlot.length >= count(lvl) * 0.9, `þyngd ${lvl}: too few sentences name a slot`);
    for (const s of withSlot) {
      const t = s.tok[s.slot];
      const n = lex.lookup(t.l, t.c) || lex.lookup(t.l, "nafnorð");
      assert.ok(n, `${t.l} is the slot of "${s.t}" and is not in the lexicon`);
      assert.ok(n.forms[t.m] && n.forms[t.m].includes(t.w.toLowerCase()),
        `${t.w} is not the ${t.m} of ${t.l} in the lexicon ("${s.t}")`);
    }
  }
});

test("level 6 and 7 are not templates: no noun frame, and two adjective frames that read well", () => {
  /* A long sentence with one word swapped reads wrong more often than not
     ("í heilan mánuð" came back as "í langan mánuð", "Flestir vinir mínir" as
     "Bestir vinir mínir"). So the slots are `none`, and an adjective stands
     right before a noun only where any fitting adjective may. If this list
     changes, read what the new frame produces: node _grammar-audit/sample-adj.mjs */
  const idx = frameIndex(lex);
  const hard = (frames) => [...frames.values()].flat().filter((f) => f.lvl >= 6);
  assert.deepEqual(hard(idx.noun), []);
  assert.deepEqual(hard(idx.adj).map((f) => `${f.s.tok[f.i].w} ${f.s.tok[f.i + 1].w}`).sort(),
    ["Gamli maðurinn", "Litli hundurinn"]);
});

/* ---------- Setningagerðir takes its level from the sentence ---------------- */

const GERD = ["clause", "gerd_finna", "gerd_upphaf"];

test("a Setningagerðir question carries the level of its sentence, at every band", () => {
  for (const id of GERD) {
    for (const band of LEVELS) {
      const tasks = buildMany(id, band, policyWith(), 60);
      assert.ok(tasks.length > 0, `${id} built nothing at band ${band}`);
      for (const t of tasks)
        assert.equal(t.lvl, t.s.lvl, `${id} at band ${band}: þyngd ${t.lvl} on a level-${t.s.lvl} sentence`);
    }
  }
});

test("Setningagerðir has gradation: the sentences get harder with the band", () => {
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  for (const id of GERD) {
    const at = (band) => buildMany(id, band, policyWith()).map((t) => t.lvl);
    const low = at(1), mid = at(5), high = at(7);
    assert.ok(Math.max(...low) <= 4, `${id}: a new pupil met a level-${Math.max(...low)} sentence`);
    assert.ok(mean(low) < mean(mid) && mean(mid) < mean(high),
      `${id}: mean level ${mean(low).toFixed(2)} → ${mean(mid).toFixed(2)} → ${mean(high).toFixed(2)} does not rise`);
    /* never above the band, and from band 4 up never more than one below it */
    for (const band of [4, 5, 6, 7])
      for (const lvl of at(band)) assert.ok(lvl <= band && lvl >= band - 1, `${id} at band ${band}: level ${lvl}`);
  }
});

test("Setningagerðir no longer pays the þyngd-6 bonus on a short sentence", () => {
  const tasks = GERD.flatMap((id) => buildMany(id, 1, policyWith(), 60));
  assert.ok(tasks.every((t) => t.lvl < 6));
  const t = tasks[0];
  const was = computeXp({ base: t.base, lvl: Math.max(6, t.s.lvl) });
  const is = computeXp({ base: t.base, lvl: t.lvl });
  assert.ok(is < was, `the same question pays ${is} XP, and paid ${was}`);
});

test("a review asks Setningagerðir for one kind of clause and gets it, at any difficulty", () => {
  /* tasks/review.js brings back what was missed. Now that the pool follows
     the band, the kind that was missed may be rare in it — so the builders
     honour `view.force.cell` instead of leaving the review to luck. */
  const forced = (id, cell, band, seed) => {
    const S = blankState(), sess = newSession(S);
    Object.keys(sess.diff).forEach((k) => { sess.diff[k] = band; });
    return typeById(id).build(lex, makeView({ S, sess, policy: policyWith(), today: "2026-01-15",
      force: { cell } }), seeded(seed));
  };
  for (const band of [1, 4, 7]) {
    for (const kind of ["aukasetning", "nafnháttarsetning", "aðalsetning"]) {
      for (let seed = 0; seed < 20; seed++) {
        const b = forced("clause", "gerd:" + kind, band, seed);
        /* The main clause is asked about only in a sentence with no other
           clause to ask about, and the bank may have none: then nothing. */
        if (!b && kind === "aðalsetning") continue;
        assert.ok(b, `clause: no ${kind} at band ${band}`);
        assert.equal(b.task.answer, kind);
        assert.equal(b.task.cell, "gerd:" + kind);
        assert.equal(b.task.lvl, b.task.s.lvl);
      }
    }
    for (const kind of ["aukasetning", "nafnháttarsetning"]) {
      for (let seed = 0; seed < 20; seed++) {
        const b = forced("gerd_finna", "gerd:finna-" + kind, band, seed);
        assert.ok(b, `gerd_finna: no ${kind} at band ${band}`);
        assert.equal(b.task.cls, kind);
        assert.equal(b.task.cell, "gerd:finna-" + kind);
      }
    }
    assert.ok(forced("gerd_upphaf", "gerd:upphaf", band, 1));
    /* a cell of another type, or one that does not exist: nothing */
    for (const id of GERD) assert.equal(forced(id, "XX-ekki-til", band, 1), null, id);
    assert.equal(forced("clause", "gerd:finna-aukasetning", band, 1), null);
    assert.equal(forced("gerd_finna", "gerd:aukasetning", band, 1), null);
    assert.equal(forced("gerd_upphaf", "gerd:aukasetning", band, 1), null);
  }
  /* and never from a level that is switched off */
  const S = blankState(), sess = newSession(S);
  Object.keys(sess.diff).forEach((k) => { sess.diff[k] = 7; });
  for (let seed = 0; seed < 40; seed++) {
    const b = typeById("clause").build(lex, makeView({ S, sess, policy: policyWith(upTo(5)),
      today: "2026-01-15", force: { cell: "gerd:nafnháttarsetning" } }), seeded(seed));
    assert.ok(b && b.task.s.lvl <= 5);
  }
});

/* ---------- bands 6 and 7 draw on the new sentences -------------------------- */

/* The builders that take a sentence from the bank: the noun cloze (as a gap
   and as a choice), the analysis, and the three of Setningagerðir. */
const SENTENCE_TYPES = ["fill", "no_val", "parse", ...GERD];

test("at band 7 the sentence builders use level 6 and 7 sentences only", () => {
  for (const id of SENTENCE_TYPES) {
    const lvls = buildMany(id, 7, policyWith()).map((t) => t.s.lvl);
    assert.ok(lvls.length >= 50, `${id} built only ${lvls.length} tasks at band 7`);
    assert.deepEqual([...new Set(lvls)].sort(), [6, 7], `${id} at band 7 used levels ${[...new Set(lvls)].sort()}`);
  }
});

test("at band 6 the sentence builders use level 5 and 6 sentences, and reach 6", () => {
  for (const id of SENTENCE_TYPES) {
    const lvls = buildMany(id, 6, policyWith()).map((t) => t.s.lvl);
    assert.ok(lvls.length >= 50, `${id} built only ${lvls.length} tasks at band 6`);
    assert.deepEqual([...new Set(lvls)].sort(), [5, 6], `${id} at band 6 used levels ${[...new Set(lvls)].sort()}`);
  }
});

test("the task's þyngd is the sentence's, so band 6 and 7 are labelled 6 and 7", () => {
  for (const id of SENTENCE_TYPES)
    for (const t of buildMany(id, 7, policyWith(), 60)) assert.equal(t.lvl, t.s.lvl, id);
});

test("at band 5 and below nothing changed: no level 6 or 7 sentence is used", () => {
  for (const id of SENTENCE_TYPES)
    for (const band of [1, 3, 5])
      for (const t of buildMany(id, band, policyWith(), 60))
        assert.ok(t.s.lvl <= 5, `${id} at band ${band} used a level-${t.s.lvl} sentence`);
});

test("the shared pool and the cloze reach the new sentences directly", () => {
  for (const [band, want] of [[6, [5, 6]], [7, [6, 7]]]) {
    const pool = sentPool(lex, viewAt(band), "nafnord");
    assert.deepEqual([...new Set(pool.map((s) => s.lvl))].sort(), want);
    let hits = 0;
    for (let seed = 0; seed < 80; seed++) {
      const t = nounCloze(lex, viewAt(band), seeded(seed));
      if (t && t.s.lvl === band) hits++;
    }
    assert.ok(hits >= 20, `the cloze met a level-${band} sentence only ${hits} times in 80 at band ${band}`);
  }
});

/* ---------- only where the policy enables them ------------------------------ */

test("with levels 6 and 7 switched off, no builder uses them however high the difficulty", () => {
  const P = policyWith(upTo(5));
  assert.equal(P.maxLevel, 5);
  for (const id of SENTENCE_TYPES) {
    const tasks = buildMany(id, 7, P);
    assert.ok(tasks.length > 0, `${id} built nothing`);
    for (const t of tasks) {
      assert.ok(t.s.lvl <= 5, `${id} used a level-${t.s.lvl} sentence with 6 and 7 off`);
      assert.ok(t.lvl <= 5, `${id} is labelled þyngd ${t.lvl} with 6 and 7 off`);
    }
  }
});

test("with level 7 off and 6 on, band 7 stops at the level 6 sentences", () => {
  const P = policyWith(upTo(6));
  for (const id of SENTENCE_TYPES) {
    const lvls = buildMany(id, 7, P).map((t) => t.s.lvl);
    assert.deepEqual([...new Set(lvls)].sort(), [5, 6], `${id} used levels ${[...new Set(lvls)].sort()}`);
  }
});

/* The session's difficulty is core/difficulty.js's business (items 11 and
   12): `levelRanges` gives every skill the span it may move in, from the
   policy, the bands its types declare and the sentences the policy allows,
   and the app hands that to the session (`applyRanges`). What is held here is
   that the new sentences are reached through it exactly where the policy has
   them on — which rests on the `bands` lines this change updated. */
const sessionFor = (S) => {
  const sess = newSession(S);
  applyRanges(sess, levelRanges(effectivePolicy(S), TASKS, lex.sentences));
  return sess;
};
const climb = (S, skill) => {
  const sess = sessionFor(S);
  for (let i = 0; i < 120; i++) bumpDiff(sess, S, skill, true, 1000 + i);
  return diffOf(sess, skill);
};
const allOn = (S) => { SKILL_IDS.forEach((id) => { S.enabled[id] = true; }); return S; };

test("the year presets: 8. bekkur stops at þyngd 5, 9. at 6, 10. at 7", () => {
  for (const [year, top] of [[8, 5], [9, 6], [10, 7]]) {
    const S = blankState();
    applyPreset({ skills: S.enabled, types: S.policy.types, levels: S.policy.levels }, year);
    assert.equal(effectivePolicy(S).maxLevel, top);
    for (const skill of ["nafnord", "greining"])
      assert.equal(climb(S, skill), top, `${year}. bekkur, ${skill}: the difficulty rose to ${climb(S, skill)}`);
  }
  /* Setningagerðir is on in the year-10 preset only, and reaches 7 there */
  const S = blankState();
  applyPreset({ skills: S.enabled, types: S.policy.types, levels: S.policy.levels }, 10);
  assert.equal(climb(S, "setningagerd"), 7);
});

test("the session's difficulty stops at the policy's ceiling, the adult's or the pupil's", () => {
  assert.equal(climb(allOn(blankState()), "greining"), 7, "with nothing switched off the difficulty reaches 7");

  const adult = allOn(blankState());
  adult.allowed = { skills: {}, types: {}, levels: upTo(5), attrs: {}, safeVocab: null };
  assert.equal(climb(adult, "greining"), 5, "the adult's ceiling");
  assert.equal(climb(adult, "setningagerd"), 5);

  const pupil = allOn(blankState());
  pupil.policy.levels = upTo(6);
  assert.equal(climb(pupil, "greining"), 6, "the pupil's own switches");
  assert.equal(climb(pupil, "nafnord"), 6);
});

test("every skill that asks about bank sentences may now rise to 7", () => {
  /* `levelRanges` stops a skill at the highest band its types declare, so a
     skill whose types said [1] stood still — Setningagerðir did, until this
     change. The skills whose builders take sentences by level must reach 7,
     or the level 6-7 sentences would be in the bank and never met. */
  const ranges = levelRanges(policyWith(), TASKS, lex.sentences);
  for (const skill of ["nafnord", "greining", "sagnord", "setningafraedi", "setningagerd", "malbeiting"])
    assert.deepEqual(ranges[skill], [1, 7], skill);
  /* and with 6 and 7 off, none of them goes past 5 */
  const capped = levelRanges(policyWith(upTo(5)), TASKS, lex.sentences);
  for (const [skill, [, hi]] of Object.entries(capped)) assert.ok(hi <= 5, `${skill} may reach ${hi}`);
});

test("a session never serves a level above the ceiling, whatever was saved", () => {
  const S = allOn(blankState());
  S.difficulty = Object.fromEntries(SKILL_IDS.map((id) => [id, { d: 7, r: 0, h: "", at: 1, src: "play" }]));
  S.policy.levels = upTo(2);
  for (const d of Object.values(sessionFor(S).diff)) assert.ok(d <= 2, `served at ${d}`);
});
