/* Difficulty is tracked per skill.

   Doing well at declining nouns should not hand out harder verb moods. Each
   skill has its own number, 1-5, inside the session, and it starts where that
   skill's level warrants.                                                 */

import { SKILL_IDS } from "./skills.js";
import { skillLevel } from "./progress.js";

/* Difficulty runs 1-7: 1-5 is year 8, 6-7 is room for years 9 and 10. No
 * sentence at level 6-7 exists yet; the builders clip to what exists. */
export const MIN = 1, MAX = 7;
export const clamp = (v, a = MIN, b = MAX) => Math.max(a, Math.min(b, v));

/* Deliberately asymmetric: sentences grow longer faster than they shrink. */
export const upStep = (level) => 0.20 + 0.05 * level;
export const downStep = (level) => 0.75 / (1 + 0.20 * (level - 1));

export function startingDiff(skillXp) {
  const L = skillLevel(skillXp || 0).level;
  return clamp(1 + (L - 1) * 0.3, 1, 3.5);
}

/** Fresh per-session difficulty map seeded from saved per-skill XP. */
export function initDiff(S) {
  const out = {};
  SKILL_IDS.forEach((id) => { out[id] = startingDiff((S.skills[id] || {}).xp || 0); });
  return out;
}

export function bumpDiff(sess, S, skill, ok) {
  const L = skillLevel((S.skills[skill] || {}).xp || 0).level;
  const cur = sess.diff[skill] ?? 1;
  sess.diff[skill] = clamp(cur + (ok ? upStep(L) : -downStep(L)));
  return sess.diff[skill];
}

export const diffOf = (sess, skill) => sess.diff[skill] ?? 1;
export const bandOf = (sess, skill) => clamp(Math.round(diffOf(sess, skill)), MIN, MAX);
