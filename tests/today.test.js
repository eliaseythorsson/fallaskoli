/* "Lota dagsins" — today's session (critique item 21), core/today.js.

   The planner says what each of the ten questions is about: the due reviews
   first, then the active error patterns, then new material, about 3 / 4 / 3,
   bending when a source is empty — and always inside the curriculum policy.
   The last test runs a plan through the builders the way control/session.js `pickTask`
   does, so a plan is not only a list of good intentions. */

import test from "node:test";
import assert from "node:assert/strict";
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, newSession } from "../src/js/core/state.js";
import { SKILL_IDS } from "../src/js/core/skills.js";
import { createPolicy, narrowPolicy, presetPolicy } from "../src/js/core/policy.js";
import { keyFor, addDays, dueEntries } from "../src/js/core/review.js";
import { activePatterns, focusTypes, huntPreferFor, pickTargeted, targets } from "../src/js/core/diagnosis.js";
import { planToday, shares, freshSkills, todayLine, TODAY_SIZE, CORE, NEW_PUPIL, FRESH_PER, freshSpread } from "../src/js/core/today.js";
import { typeById, enabled, nextTask, makeView, withView, nextOpening } from "../src/js/tasks/index.js";
import { seeded } from "../src/js/core/duel.js";

const D0 = "2026-11-16";
const allOn = {};
SKILL_IDS.forEach((id) => { allOn[id] = true; });
const POLICY = createPolicy(null, { skills: allOn, types: {}, levels: {}, attrs: {}, safeVocab: null });
const canType = (P) => (id) => { const t = typeById(id); return !!t && enabled(P, t); };

/* A pupil with `due` reviews waiting (nouns, a day overdue) and the given
   patterns active: ten answers lately, half of them wrong. */
function pupil({ due = 0, active = [], xp = {} } = {}) {
  const S = blankState();
  SKILL_IDS.forEach((id) => { S.enabled[id] = true; });
  const items = [];
  for (let k = 0; k < due; k++) {
    const e = { t: "fill", sk: "nafnord", p: "thf_thgf", c: "ÞGFFT", w: `w${k}|kk`, i: null };
    items.push({ k: keyFor(e), ...e, s: 0, due: addDays(D0, -1), add: addDays(D0, -2),
      last: addDays(D0, -2), l: 1, ok: 0 });
  }
  S.review = { items, stats: {} };
  S.diag = {};
  for (const id of active) S.diag[id] = { n: 10, w: 5, h: "0101010101", last: D0, ex: [] };
  for (const [id, v] of Object.entries(xp)) S.skills[id] = { ...(S.skills[id] || {}), xp: v };
  return S;
}
const kinds = (plan) => plan.slots.map((x) => x.kind);
const tally = (plan) => [plan.counts.review, plan.counts.pattern, plan.counts.fresh];

/* ---------- the shares ---------------------------------------------------- */

test("the shares of ten: 3 / 4 / 3, bending when a source is empty or short", () => {
  assert.deepEqual(shares(10, 9, 2), { review: 3, pattern: 4, fresh: 3 });
  assert.deepEqual(shares(10, 3, 1), { review: 3, pattern: 4, fresh: 3 });
  assert.deepEqual(shares(10, 2, 1), { review: 2, pattern: 5, fresh: 3 });
  assert.deepEqual(shares(10, 1, 1), { review: 1, pattern: 5, fresh: 4 });
  assert.deepEqual(shares(10, 0, 1), { review: 0, pattern: 5, fresh: 5 });
  assert.deepEqual(shares(10, 9, 0), { review: 5, pattern: 0, fresh: 5 });
  assert.deepEqual(shares(10, 2, 0), { review: 2, pattern: 0, fresh: 8 });
  assert.deepEqual(shares(10, 0, 0), { review: 0, pattern: 0, fresh: 10 });
});

test("the shares always add up, and patterns never take more than half", () => {
  for (const n of [1, 3, 5, 10, 15, 20]) {
    for (let due = 0; due <= 25; due++) {
      for (const pats of [0, 1, 3]) {
        const s = shares(n, due, pats);
        assert.equal(s.review + s.pattern + s.fresh, n, `n=${n} due=${due} pats=${pats}`);
        assert.ok(s.review <= due && s.review >= 0 && s.fresh >= 0);
        assert.ok(s.pattern <= Math.ceil(n / 2), `patterns ${s.pattern} of ${n}`);
        if (!pats) assert.equal(s.pattern, 0);
      }
    }
  }
});

/* ---------- the plan -------------------------------------------------------- */

test("a plan of ten: due reviews first, then the active patterns, then new material", () => {
  const S = pupil({ due: 6, active: ["thf_thgf", "sogn_frumlag"] });
  const plan = planToday(S, POLICY, D0, { canType: canType(POLICY) });
  assert.equal(plan.n, TODAY_SIZE);
  assert.deepEqual(tally(plan), [3, 4, 3]);
  assert.deepEqual(kinds(plan), ["review", "review", "review", "pattern", "pattern", "pattern", "pattern", "new", "new", "new"]);
  /* the three most urgent, in the queue's own order */
  assert.deepEqual(plan.reviews, dueEntries(S, D0).slice(0, 3).map((e) => e.k));
  assert.deepEqual(plan.slots.slice(0, 3).map((x) => x.k), plan.reviews);
  /* two patterns share the four slots, worst first, round the list */
  const worst = activePatterns(S, 3).map((p) => p.id);
  assert.deepEqual(plan.slots.slice(3, 7).map((x) => x.p), [worst[0], worst[1], worst[0], worst[1]]);
  assert.deepEqual([...plan.patterns].sort(), ["sogn_frumlag", "thf_thgf"]);
});

test("no reviews due: more patterns and more new material", () => {
  const plan = planToday(pupil({ active: ["ef"] }), POLICY, D0, { canType: canType(POLICY) });
  assert.deepEqual(tally(plan), [0, 5, 5]);
  assert.equal(plan.slots[0].kind, "pattern");
  assert.ok(plan.slots.filter((x) => x.kind === "pattern").every((x) => x.p === "ef"));
});

test("no active pattern: up to half reviews, the rest new", () => {
  assert.deepEqual(tally(planToday(pupil({ due: 12 }), POLICY, D0, { canType: canType(POLICY) })), [5, 0, 5]);
  assert.deepEqual(tally(planToday(pupil({ due: 2 }), POLICY, D0, { canType: canType(POLICY) })), [2, 0, 8]);
});

test("a new pupil: ten questions of new material", () => {
  const plan = planToday(pupil(), POLICY, D0, { canType: canType(POLICY) });
  assert.deepEqual(tally(plan), [0, 0, 10]);
  assert.ok(plan.slots.every((x) => x.kind === "new" && x.skill));
});

test("an entry not yet due is not a review today", () => {
  const S = pupil({ due: 2 });
  S.review.items[0].due = addDays(D0, 1);
  assert.equal(planToday(S, POLICY, D0).counts.review, 1);
});

test("the plan respects the policy: switched-off types are not due, untestable patterns not active", () => {
  /* Only verbs: the noun reviews cannot be asked, and a pattern only the
     case questions test ("Fallstjórn forsetninga") cannot be practised; a
     verb pattern can. */
  const S = pupil({ due: 5, active: ["fallstjorn_fs", "tid"] });
  const verbs = narrowPolicy(POLICY, { skills: ["sagnord"] });
  const plan = planToday(S, verbs, D0, { canType: canType(verbs) });
  assert.equal(plan.counts.review, 0, "a noun review in a verbs-only policy");
  assert.deepEqual(plan.patterns, ["tid"]);
  assert.ok(plan.slots.filter((x) => x.kind === "new").every((x) => x.skill === "sagnord"));
});

test("the year preset decides what new material comes from", () => {
  const S = pupil();
  const P8 = createPolicy(null, presetPolicy(8));
  const fresh = freshSkills(S, P8, canType(P8));
  assert.ok(fresh.length > 0);
  assert.ok(fresh.every((id) => P8.skill(id)), "a skill outside the preset: " + fresh.join(","));
  const plan = planToday(S, P8, D0, { canType: canType(P8) });
  assert.ok(plan.slots.every((x) => !x.skill || P8.skill(x.skill)));
});

test("new material comes from the least-practised skills first", () => {
  const xp = {};
  SKILL_IDS.forEach((id, k) => { xp[id] = 1000 - k; });      // the last in the catalogue has least
  xp.sagnord = 0;
  const S = pupil({ xp });
  S.skills.nafnord.c = NEW_PUPIL;                             // not a new pupil: XP alone decides
  const fresh = freshSkills(S, POLICY, canType(POLICY));
  assert.equal(fresh[0], "sagnord");
  assert.equal(fresh.length, 3);
  const plan = planToday(S, POLICY, D0, { canType: canType(POLICY) });
  assert.equal(plan.slots[0].skill, "sagnord");
});

test("planning changes nothing", () => {
  const S = pupil({ due: 4, active: ["thf_thgf"] });
  const before = JSON.stringify(S);
  planToday(S, POLICY, D0, { canType: canType(POLICY) });
  assert.equal(JSON.stringify(S), before);
});

/* ---------- what the button says --------------------------------------------- */

test("the line under the button, in correct Icelandic", () => {
  const line = (r, p, f) => todayLine({ counts: { review: r, pattern: p, fresh: f } });
  assert.equal(line(3, 4, 3), "3 upprifjanir, 4 spurningar um villurnar þínar og 3 nýjar spurningar.");
  assert.equal(line(1, 5, 4), "1 upprifjun, 5 spurningar um villurnar þínar og 4 nýjar spurningar.");
  assert.equal(line(0, 5, 5), "5 spurningar um villurnar þínar og 5 nýjar spurningar.");
  assert.equal(line(5, 0, 5), "5 upprifjanir og 5 nýjar spurningar.");
  assert.equal(line(9, 1, 0), "9 upprifjanir og 1 spurning um villurnar þínar.");
  assert.equal(line(2, 0, 8), "2 upprifjanir og 8 nýjar spurningar.");
  assert.equal(line(0, 0, 10), "10 nýjar spurningar úr efninu þínu. Ekkert bíður upprifjunar í dag.");
});

/* ---------- the plan, built ---------------------------------------------------- */

test("a plan runs: reviews, then questions that test the pattern, then new material", () => {
  const lex = buildLexicon(DATA);
  const S = pupil({ due: 3, active: ["thf_thgf"] });
  /* real reviews this time: nouns the lexicon has */
  S.review.items = ["hestur", "bók", "barn"].map((w, k) => {
    const cls = ["kk", "kvk", "hk"][k];
    const e = { t: "fill", sk: "nafnord", p: "thf_thgf", c: "ÞGFFT", w: `${w}|${cls}`, i: null };
    return { k: keyFor(e), ...e, s: 0, due: D0, add: addDays(D0, -1), last: addDays(D0, -1), l: 1, ok: 0 };
  });
  const sess = newSession(S);
  Object.keys(sess.diff).forEach((k) => { sess.diff[k] = 3; });
  const plan = planToday(S, POLICY, D0, { canType: canType(POLICY) });
  assert.deepEqual(tally(plan), [3, 4, 3]);
  const rng = seeded(21);
  const view = makeView({ S, sess, policy: POLICY, today: D0, inRun: true });
  const run = { review: plan.reviews.slice() };
  const asked = [];
  /* as control/session.js pickTask: the opening first, then one slot per question */
  for (let b; (b = nextOpening(lex, view, rng, run));) asked.push({ kind: "review", task: b.task });
  assert.equal(asked.length, 3, "the session did not open with its three reviews");
  assert.ok(asked.every((x) => x.task.review), "an opening question is not a review");
  for (const slot of plan.slots.filter((x) => x.kind !== "review")) {
    let t = null;
    if (slot.kind === "pattern") {
      const pv = withView(view, { policy: narrowPolicy(POLICY, { types: [...focusTypes([slot.p])] }),
        huntPrefer: huntPreferFor([slot.p]) });
      t = pickTargeted(() => { const b = nextTask(lex, pv, rng); return b && b.task; }, [slot.p], { p: 1, tries: 8, rnd: rng });
      assert.ok(t && targets(t, [slot.p]), `a pattern slot did not test ${slot.p}: ${t && t.typeId}`);
    } else {
      const sv = withView(view, { policy: narrowPolicy(POLICY, { skills: [slot.skill] }) });
      const b = nextTask(lex, sv, rng);
      t = b && b.task;
      assert.ok(t, "nothing new could be built in " + slot.skill);
    }
    asked.push({ kind: slot.kind, task: t });
  }
  assert.deepEqual(asked.map((x) => x.kind), kinds(plan));
});

/* ---------- review of v6.13, S6: a new pupil's first session -------------------- */

const P8 = createPolicy(null, presetPolicy(8));
const newOf = (plan) => plan.slots.filter((x) => x.kind === "new").map((x) => x.skill);
const countOf = (list) => list.reduce((m, id) => m.set(id, (m.get(id) || 0) + 1), new Map());

test("S6: a blank pupil's ten new questions are the five core skills, two each, interleaved", () => {
  for (const P of [POLICY, P8]) {
    const plan = planToday(pupil(), P, D0, { canType: canType(P) });
    const got = newOf(plan);
    assert.equal(got.length, 10);
    assert.deepEqual([...countOf(got).keys()].sort(), [...CORE].sort());
    assert.ok([...countOf(got).values()].every((c) => c === FRESH_PER));
    got.forEach((id, k) => assert.ok(k === 0 || id !== got[k - 1], "the same skill twice in a row: " + got.join(",")));
  }
});

test("S6: after the placement round, the skills the pupil missed do not take the whole session (the reviewer's seed 4242)", () => {
  /* XP where the round's answers were right, none in Töluorð, Málbeiting and
     Orðaforði: the old plan gave those three, three questions each. */
  const S = pupil();
  for (const id of ["nafnord", "lysingarord", "sagnord", "fornofn", "obeygjanleg", "greining", "fallstjorn"])
    Object.assign(S.skills[id], { xp: 30, c: 1, w: 0 });
  Object.assign(S.skills.sagnord, { xp: 60, c: 2 });
  for (const id of ["toluord", "malbeiting", "ordaford"]) Object.assign(S.skills[id], { xp: 0, c: 0, w: 1 });
  const got = newOf(planToday(S, P8, D0, { canType: canType(P8) }));
  for (const id of ["nafnord", "lysingarord", "fornofn", "fallstjorn", "sagnord"]) assert.ok(got.includes(id), id + ": " + got.join(","));
  assert.ok(!got.includes("toluord") && !got.includes("malbeiting") && !got.includes("ordaford"), got.join(","));
});

test("S6: across 300 seeded new pupils the new part is spread, at most two a skill, and core first", () => {
  const plan8 = ["nafnord", "lysingarord", "sagnord", "fornofn", "toluord", "obeygjanleg", "greining",
    "fallstjorn", "ordaford", "malbeiting", "nafnord", "sagnord", "lysingarord"];
  for (let seed = 1; seed <= 300; seed++) {
    const rnd = seeded(seed);
    const S = pupil({ active: rnd() < 0.3 ? ["thf_thgf"] : [] });
    const p = 0.3 + 0.65 * rnd();
    for (const id of plan8) {
      const ok = rnd() < p, sk = S.skills[id];
      if (ok) { sk.c++; sk.xp += 5 + Math.floor(rnd() * 20); } else sk.w++;
    }
    const plan = planToday(S, P8, D0, { canType: canType(P8) });
    const got = newOf(plan);
    const per = countOf(got);
    assert.equal(got.length, plan.counts.fresh);
    assert.ok(per.size >= Math.min(freshSpread(got.length), got.length), `seed ${seed}: ${got.join(",")}`);
    assert.ok([...per.values()].every((c) => c <= FRESH_PER), `seed ${seed}: ${got.join(",")}`);
    assert.ok(got.every((id) => CORE.includes(id)), `seed ${seed}: a new pupil's new material outside the core: ${got.join(",")}`);
  }
});

test("S6: an experienced pupil's new material is spread too, least practised first", () => {
  const S = pupil();
  SKILL_IDS.forEach((id, k) => Object.assign(S.skills[id], { xp: 100 * (k + 1), c: 50, w: 10 }));
  const got = newOf(planToday(S, POLICY, D0, { canType: canType(POLICY) }));
  assert.deepEqual([...countOf(got).keys()], SKILL_IDS.slice(0, 5), "least XP first, five skills for ten questions");
  assert.ok([...countOf(got).values()].every((c) => c === 2));
});

test("S6: three new questions are three skills, one each, as before", () => {
  const plan = planToday(pupil({ due: 3, active: ["thf_thgf"] }), POLICY, D0, { canType: canType(POLICY) });
  assert.equal(plan.counts.fresh, 3);
  assert.equal(new Set(newOf(plan)).size, 3);
  assert.deepEqual([freshSpread(0), freshSpread(3), freshSpread(5), freshSpread(8), freshSpread(10)], [3, 3, 3, 4, 5]);
});
