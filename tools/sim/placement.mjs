/* The placement round of the guided first run (critique item 84), simulated.

   `node tools/sim/placement.mjs [pupils]` prints, for a weak, a middle and a
   strong pupil (the three abilities of mixed.mjs and levels.mjs), where the
   round places them: the general level, the levels written per skill, how
   many questions it took and which year it suggests — for a pupil who said
   8. bekkur, one who said 10. bekkur and one who said nothing.

   The round is driven as ui/tour.js `pick` drives it: the real builders, the
   skill the plan says, at the level the staircase stands at; and the pupil
   answers as in sim.mjs — right with probability
       ability − 0.04·(the question's level − 1) − a penalty for its shape.
   It is a model: read the output as sizes, not decimals.

   Unlike sim.mjs this file does not replace the clock and draws every random
   number from one seed, so `simulatePlacement` is also what
   tests/placement.test.js holds the round to.                                 */

import { DATA } from "../../data/data_bundle.js";
import { buildLexicon } from "../../src/js/core/lexicon.js";
import { blankState, newSession, effectivePolicy } from "../../src/js/core/state.js";
import { applyPreset, narrowPolicy } from "../../src/js/core/policy.js";
import { levelRanges, applyRanges } from "../../src/js/core/difficulty.js";
import { SKILL_IDS } from "../../src/js/core/skills.js";
import { TASKS, nextTask, makeView, applyEffects } from "../../src/js/tasks/index.js";
import {
  placementTypes, startPlacement, placementQuestion, placementAnswer, placementDrop,
  placementResult, applyPlacement, suggestYear,
} from "../../src/js/core/placement.js";

let LEX = null;
const lexicon = () => (LEX ||= buildLexicon(DATA));

/** A seeded source of random numbers (the one sim.mjs gives its learner). */
export function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** The shapes the simulated pupil finds harder, as in sim.mjs. */
const SHAPE_PENALTY = { table: 0.12, smidja: 0.15, umritun: 0.12, villur: 0.15, verb: 0.08, parse: 0.08 };

/** How likely this pupil is to answer this question right (sim.mjs's model). */
export const chance = (ability, task) =>
  Math.max(0.05, Math.min(0.98, ability - 0.04 * ((task.lvl || 1) - 1) - (SHAPE_PENALTY[task.type] || 0)));

/**
 * One new pupil through the placement round.
 *
 * @param {object} o
 * @param {number} o.ability   0–1: the share right at level 1
 * @param {number} [o.seed]
 * @param {?number} [o.year]   the year the pupil says (8, 9, 10), or null
 * @param {number} [o.now]     the time written on the levels
 * @returns {{ S, sess, st, result, suggested, asked: object[] }}
 */
export function simulatePlacement({ ability, seed = 1, year = null, now = 1_800_000_000_000 }) {
  const lex = lexicon();
  const rnd = seeded(seed);
  const S = blankState();
  if (year) applyPreset({ skills: S.enabled, types: (S.policy.types ||= {}), levels: (S.policy.levels ||= {}) }, year);
  const sess = newSession(S);
  const P = effectivePolicy(S);
  const ranges = levelRanges(P, TASKS, lex.sentences);
  applyRanges(sess, ranges);
  const types = placementTypes(TASKS, P);
  let st = startPlacement({ skills: Object.keys(types), ranges, year });
  const ctx = { lex, S, sess, forcedNoun: null };
  const asked = [];
  for (let guard = 0; guard < 60; guard++) {
    const q = placementQuestion(st);
    if (!q) break;
    sess.diff[q.skill] = q.level;
    const view = makeView({ S, sess, policy: narrowPolicy(P, { skills: [q.skill], types: types[q.skill] }), inRun: true, today: "2026-11-16" });
    let b = null;
    for (let k = 0; k < 4 && !b; k++) b = nextTask(lex, view, rnd);
    if (!b) { st = placementDrop(st); continue; }
    applyEffects(ctx, b.effects);
    const ok = rnd() < chance(ability, b.task);
    asked.push({ skill: q.skill, level: q.level, type: b.task.typeId || b.task.type, lvl: b.task.lvl || 1, ok });
    st = placementAnswer(st, ok);
  }
  const result = placementResult(st, { others: SKILL_IDS.filter((id) => P.skill(id)), ranges });
  applyPlacement(S, result, { sess, now });
  return { S, sess, st, result, suggested: suggestYear(result, { chosen: year }), asked };
}

/** The mean of the levels a simulated pupil was placed at, over the skills written. */
export const meanLevel = (run) => {
  const v = Object.values(run.result.levels).map((x) => x.level);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 1;
};

/* ---------- run as a script ---------------------------------------------------- */

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  const N = Number(process.argv[2]) || 200;
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const at = (a, f) => a.slice().sort((x, y) => x - y)[Math.floor(f * (a.length - 1))];
  for (const year of [8, 10, null]) {
    console.log(`\n##### ${year ? `the pupil says ${year}. bekkur` : "the pupil says no year"} — ${N} pupils each`);
    for (const [name, ability] of [["weak", 0.5], ["mid", 0.72], ["strong", 0.9]]) {
      const runs = Array.from({ length: N }, (_, s) => simulatePlacement({ ability, seed: 1000 + 7919 * s, year }));
      const G = runs.map((r) => r.result.general), L = runs.map(meanLevel);
      const years = { 8: 0, 9: 0, 10: 0 };
      runs.forEach((r) => { years[r.suggested]++; });
      const right = mean(runs.map((r) => r.result.right / r.result.answers));
      console.log(`${name.padEnd(6)} ability ${ability}: general level ${mean(G).toFixed(2)} (10%/50%/90%: ${at(G, 0.1)} / ${at(G, 0.5)} / ${at(G, 0.9)})` +
        ` | per skill ${mean(L).toFixed(2)} (${at(L, 0.1).toFixed(1)}–${at(L, 0.9).toFixed(1)})` +
        ` | ${mean(runs.map((r) => r.result.answers)).toFixed(1)} questions, ${(100 * right).toFixed(0)}% right` +
        ` | suggests 8/9/10: ${years[8]}/${years[9]}/${years[10]}`);
    }
  }
}
