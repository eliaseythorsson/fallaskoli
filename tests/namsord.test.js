/* Námsorð (#19): the word track as a skill of its own — on the Færnikort,
   on in every year's preset, the þyngd the words in learning are chosen at,
   and one of the new skills that share about three of Lota dagsins' ten
   questions (core/today.js NEW_SKILLS, NEW_SKILLS_SHARE).

   Its question types (#11, #14, #15) are not here yet, so most of this file
   is about a skill that has none: it is shown and switched on, and nothing
   plans a question of it. The share itself is tested with a stand-in skill
   that has types, through `planToday`'s `newSkills`, and run through the
   builders the way control/session.js `pickTask` does, mix rule and all. */

import test from "node:test";
import assert from "node:assert/strict";
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, newSession, badgeContext } from "../src/js/core/state.js";
import { SKILL_IDS, skillById, defaultEnabled } from "../src/js/core/skills.js";
import { skillHasTypes } from "../src/js/core/catalogue.js";
import { createPolicy, narrowPolicy, presetPolicy } from "../src/js/core/policy.js";
import { presetContent, YEARS, nodesOfCategory } from "../src/js/core/curriculum.js";
import { keyFor, addDays } from "../src/js/core/review.js";
import { planToday, freshSkills, NEW_SKILLS, NEW_SKILLS_SHARE, TODAY_SIZE } from "../src/js/core/today.js";
import { mapOf } from "../src/js/core/skillmap.js";
import { placementTypes } from "../src/js/core/placement.js";
import { DUEL_TOPICS } from "../src/js/core/duel.js";
import { LEARNING_SKILL, learningLevel } from "../src/js/core/wordknowledge.js";
import { setSkillLevel } from "../src/js/core/difficulty.js";
import { lessonFor, lessonById } from "../src/js/core/lessons.js";
import { mixReport } from "../src/js/core/mix.js";
import { seeded } from "../src/js/core/duel.js";
import { TASKS, typeById, enabled, nextTask, makeView, withView } from "../src/js/tasks/index.js";
import { topics } from "../src/js/ui/session.js";
import { targetOptionsHTML } from "../src/js/ui/teacher.js";

const D0 = "2026-11-27";
const allOn = Object.fromEntries(SKILL_IDS.map((id) => [id, true]));
const ALL = createPolicy(null, { skills: allOn, types: {}, levels: {}, attrs: {}, safeVocab: null });
const P8 = createPolicy(null, presetPolicy(8));
const canType = (P) => (id) => { const t = typeById(id); return !!t && enabled(P, t); };

/* A pupil with `due` noun reviews waiting and the given patterns active. */
function pupil({ due = 0, active = [] } = {}) {
  const S = blankState();
  SKILL_IDS.forEach((id) => { S.enabled[id] = true; });
  const items = [];
  for (let k = 0; k < due; k++) {
    const e = { t: "fill", sk: "nafnord", p: "thf_thgf", c: "ÞGFFT", w: `w${k}|kk`, i: null };
    items.push({ k: keyFor(e), ...e, s: 0, due: addDays(D0, -1), add: addDays(D0, -2), last: addDays(D0, -2), l: 1, ok: 0 });
  }
  S.review = { items, stats: {} };
  S.diag = {};
  for (const id of active) S.diag[id] = { n: 10, w: 5, h: "0101010101", last: D0, ex: [] };
  return S;
}
const newOf = (plan) => plan.slots.filter((x) => x.kind === "new").map((x) => x.skill);

/* ---------- the skill ---------------------------------------------------------- */

test("Námsorð is a skill, and the word track's þyngd is its own", () => {
  const s = skillById("namsord");
  assert.equal(s.nm, "Námsorð");
  assert.equal(s.cur, "8.b");
  assert.equal(LEARNING_SKILL, "namsord");
  assert.deepEqual(NEW_SKILLS[0], "namsord");
});

test("Námsorð is on the Færnikort, with the usual level and mastery", () => {
  const lane = mapOf(blankState(), Date.parse(D0), P8).cats.find((c) => c.id === "namsord");
  assert.ok(lane, "no Námsorð lane on the map");
  assert.equal(lane.nm, "Námsorð");
  assert.equal(lane.on, true);
  assert.equal(lane.skill.level, 1);
  assert.ok(lane.mastery && "level" in lane.mastery, "no mastery on the lane");
  assert.equal(lane.band, 1);
  const nodes = lane.groups.flatMap((g) => g.nodes);
  assert.deepEqual(nodes.map((n) => n.id), nodesOfCategory("namsord").map((n) => n.id));
  assert.equal(nodes[0].id, "nams-ordin");
  assert.equal(nodes[0].year, 8);
  assert.equal(nodes[0].lesson, "namsord");
  /* No question type yet: the node is locked, as every node without one is. */
  assert.equal(nodes[0].locked, !skillHasTypes("namsord"));
});

test("Námsorð is on in the 8., 9. and 10. bekkur presets, and for a new pupil", () => {
  for (const y of YEARS) {
    assert.ok(presetContent(y).skills.includes("namsord"), `${y}. bekkur`);
    assert.equal(presetPolicy(y).skills.namsord, true, `${y}. bekkur`);
    assert.equal(createPolicy(null, presetPolicy(y)).skill("namsord"), true, `${y}. bekkur`);
  }
  assert.equal(defaultEnabled().namsord, true);
  assert.equal(blankState().enabled.namsord, true);
});

test("its lesson page is short, and says nothing of a diagnosis", () => {
  const page = lessonById("namsord");
  assert.ok(page && page.skill === "namsord");
  assert.equal(lessonFor({ skill: "namsord", type: "choice" }), "namsord");
  const text = JSON.stringify(page);
  assert.ok(!/DLD|málþroska|röskun/i.test(text), "a label on the page");
  assert.ok(text.length < 1500, "a long page: " + text.length);
});

/* ---------- the words in learning are chosen at Námsorð's þyngd ------------------- */

test("learningLevel: Námsorð's saved þyngd, and Orðaforði's until Námsorð has one", () => {
  const S = blankState();
  assert.equal(learningLevel(S), 1);
  setSkillLevel(S, "ordaford", 3.5, { source: "placement" });
  assert.equal(learningLevel(S), 3.5, "an existing pupil keeps the words of their Orðaforði þyngd");
  setSkillLevel(S, "namsord", 2, { source: "placement" });
  assert.equal(learningLevel(S), 2, "once Námsorð has a level, it decides");
});

/* ---------- with no question type, nothing plans Námsorð ------------------------- */

test("an empty Námsorð is never planned: Lota dagsins is what it was without it", { skip: skillHasTypes("namsord") }, () => {
  for (const P of [ALL, P8]) {
    for (const opts of [{}, { due: 6, active: ["thf_thgf"] }, { active: ["ef"] }, { due: 9 }]) {
      const S = pupil(opts);
      /* Námsorð alone: the other new skills (Lesskilningur, #30) take their
         share whatever Námsorð has */
      const plan = planToday(S, P, D0, { canType: canType(P), newSkills: ["namsord"] });
      const without = planToday(S, P, D0, { canType: canType(P), newSkills: [] });
      assert.equal(plan.n, TODAY_SIZE);
      assert.equal(plan.counts.newSkill, 0);
      assert.ok(!plan.slots.some((x) => x.skill === "namsord"), JSON.stringify(plan.slots));
      assert.deepEqual(plan.slots, without.slots, "the plan moved with an empty new skill");
    }
  }
});

test("an empty Námsorð is offered nowhere: picker, placement, duels, assignments, badges", { skip: skillHasTypes("namsord") }, () => {
  const S = blankState();
  assert.ok(!topics({ S }).some((t) => t.id === "namsord"), "a Námsorð session in the picker");
  assert.ok(!("namsord" in placementTypes(TASKS, P8)), "Námsorð in the placement round");
  assert.ok(!freshSkills(S, ALL, canType(ALL), 99).includes("namsord"));
  assert.ok(!targetOptionsHTML().includes("skill:namsord"), "an assignment on Námsorð");
  const c = badgeContext(S, newSession(S));
  assert.ok(!c.enabledSkills.includes("namsord"), "a badge for every skill would wait for Námsorð");
});

test("Námsorð is never a duel topic: its questions are about the pupil's own words", () => {
  assert.ok(!DUEL_TOPICS.some((t) => t.id === "namsord"));
});

/* ---------- the shared share, with a stand-in that has types ----------------------- */

/* Orðaforði plays a new skill here: it has question types and is on in
   every preset. Námsorð, Lesskilningur and Frásögn take its place by being
   in NEW_SKILLS. */
const STAND_IN = ["ordaford"];

test("the new skills take about 3 of 10, and the rest is shared out as before", () => {
  assert.equal(NEW_SKILLS_SHARE, 0.3);
  const tally = (plan) => [plan.counts.review, plan.counts.pattern, plan.counts.fresh - plan.counts.newSkill, plan.counts.newSkill];
  const plan = (o, n) => planToday(pupil(o), ALL, D0, { canType: canType(ALL), newSkills: STAND_IN, n });
  assert.deepEqual(tally(plan({ due: 6, active: ["thf_thgf", "sogn_frumlag"] })), [2, 3, 2, 3]);
  assert.deepEqual(tally(plan({ active: ["ef"] })), [0, 4, 3, 3]);
  assert.deepEqual(tally(plan({ due: 9 })), [3, 0, 4, 3]);
  assert.deepEqual(tally(plan({})), [0, 0, 7, 3]);
  assert.deepEqual(tally(plan({ due: 9, active: ["ef"] }, 20)), [4, 6, 4, 6]);
  for (const o of [{}, { due: 6, active: ["ef"] }]) {
    const p = plan(o);
    assert.equal(p.n, TODAY_SIZE);
    assert.equal(newOf(p).filter((s) => s === "ordaford").length, 3, "the stand-in outside its share");
    assert.ok(p.counts.pattern <= Math.ceil(p.n / 2), "patterns over half the session");
  }
});

test("the share is dealt round the new skills and spread among the ordinary new questions", () => {
  const two = ["ordaford", "fallstjorn"];
  const p = planToday(pupil({ due: 6, active: ["ef"] }), ALL, D0, { canType: canType(ALL), newSkills: two });
  const got = newOf(p);
  assert.deepEqual(got.filter((s) => two.includes(s)), ["ordaford", "fallstjorn", "ordaford"]);
  /* 2 ordinary and 3 new-skill questions: new, ordinary, new, ordinary, new */
  assert.deepEqual(got.map((s) => two.includes(s)), [true, false, true, false, true]);
  const fresh7 = newOf(planToday(pupil(), ALL, D0, { canType: canType(ALL), newSkills: STAND_IN }));
  fresh7.forEach((s, k) => assert.ok(k === 0 || !(s === "ordaford" && fresh7[k - 1] === "ordaford"), fresh7.join(",")));
});

test("a new skill switched off, or with every type off, takes no share", () => {
  const off = narrowPolicy(ALL, { skills: SKILL_IDS.filter((id) => id !== "ordaford") });
  const S = pupil({ due: 6, active: ["thf_thgf"] });
  const plan = planToday(S, off, D0, { canType: canType(off), newSkills: STAND_IN });
  assert.equal(plan.counts.newSkill, 0);
  assert.deepEqual(plan.slots, planToday(S, off, D0, { canType: canType(off), newSkills: [] }).slots);
  const typesOff = planToday(S, ALL, D0, { canType: (id) => typeById(id).skill !== "ordaford", newSkills: STAND_IN });
  assert.equal(typesOff.counts.newSkill, 0);
});

/* ---------- the mix rule still holds ------------------------------------------------ */

test("a Lota dagsins with the new skills' share keeps the mix rule (as control/session.js builds it)", () => {
  const lex = buildLexicon(DATA);
  for (const [o, seed] of [[{}, 3], [{ active: ["thf_thgf"] }, 5], [{}, 8], [{ active: ["tid"] }, 13]]) {
    const S = pupil(o);
    const sess = newSession(S);
    Object.keys(sess.diff).forEach((k) => { sess.diff[k] = 3; });
    const plan = planToday(S, ALL, D0, { canType: canType(ALL), newSkills: STAND_IN });
    assert.equal(plan.counts.newSkill, 3);
    const rng = seeded(seed);
    const types = [];
    for (const slot of plan.slots) {
      const counts = {};
      types.forEach((x) => { counts[x] = (counts[x] || 0) + 1; });
      const view = makeView({ S, sess, policy: ALL, today: D0, inRun: true, mix: { n: plan.n, counts } });
      const narrowed = slot.kind === "pattern" ? null : narrowPolicy(ALL, { skills: [slot.skill] });
      const b = nextTask(lex, narrowed ? withView(view, { policy: narrowed }) : view, rng)
        || nextTask(lex, view, rng);
      assert.ok(b, `nothing built for ${JSON.stringify(slot)}`);
      if (slot.kind === "new" && STAND_IN.includes(slot.skill)) assert.equal(b.task.skill, "ordaford");
      types.push(b.task.typeId);
    }
    const rep = mixReport(types);
    assert.deepEqual(rep.over, [], `over the cap: ${JSON.stringify(rep.counts)}`);
    assert.ok(rep.kinds >= 3, `only ${rep.kinds} kinds: ${JSON.stringify(rep.counts)}`);
  }
});
