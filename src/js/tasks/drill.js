/* The rescue drill (v6.6): ten to twenty questions about ONE word.

   The general builders choose their sentence or their word themselves. In a
   drill the word is given: the view carries it (`drillWord`), and every
   builder that chooses a word asks `forced(view, …)` first (tasks/shared.js).
   Four types have a variant that starts from the word instead — the cloze,
   the analysis, the word-class question and the case a word governs; each
   declares it as `drill` in its category's TYPES. */

import { wordKey } from "../core/state.js";
import { built, FX } from "./effects.js";
import { withView } from "./view.js";
import { typeById, enabled } from "./registry.js";
import { drillMeaning } from "./ordaford.js";

/** What a drill may ask, by word class, in the order it rotates through. */
const NOUN_PLAN = ["fill", "tbl_no", "revform", "parse"];
export const DRILL_PLAN = {
  kk: NOUN_PLAN, kvk: NOUN_PLAN, hk: NOUN_PLAN,
  so: ["verb", "verbslot", "tbl_so", "revform", "govern"],
  lo: ["tbl_lo", "revform", "parse"],
  fn: ["tbl_fn", "parse"], pfn: ["tbl_fn", "parse"], gr: ["tbl_fn", "parse"],
  to: ["tbl_to", "parse"], rt: ["tbl_to", "parse"],
  ao: ["indecl", "parse"], fs: ["indecl", "govern"], st: ["indecl"],
  uh: ["indecl"], nhm: ["indecl"],
};

/** Which turn of a drill (0-based) is the meaning question: the fifth. */
export const DRILL_MEANING_TURN = 4;

/**
 * One question of a rescue drill on `entry`: { task, effects } or null.
 * Rotates through the kinds of question the word's class allows, skipping any
 * the curriculum has switched off, so twenty questions on one noun are not
 * twenty identical clozes. Returns null if nothing at all can be asked — the
 * drill then ends without counting against anybody.
 */
export function drillTask(lex, view, rng, entry, turn = 0) {
  const plan = DRILL_PLAN[entry && entry.c] || [];
  if (!plan.length) return null;
  const P = view.policy;
  const key = wordKey(entry.o, entry.c);
  /* The fifth question is always "Orðaforði": say in your own words what the
     word means — as long as the dictionary has a meaning to show afterwards.
     It has no wrong answer (`correct: null`), so it does not count toward the
     drill's ten to twenty; and the rotation below skips over it, so no other
     kind of question loses its turn. */
  if (turn === DRILL_MEANING_TURN) {
    const b = drillMeaning(lex, view, entry);
    if (b) return b;
  }
  const slot = turn > DRILL_MEANING_TURN ? turn - 1 : turn;
  /* The drilled word is the only word there is; a noun left waiting by an
     earlier cloze has no say here, and is let go when the question is shown. */
  const dv = withView(view, { drillWord: entry, forcedNoun: null });
  for (let k = 0; k < plan.length * 3; k++) {
    const id = plan[(slot + k) % plan.length];
    const spec = typeById(id);
    if (!spec || !enabled(P, spec)) continue;
    const b = (spec.drill || spec.build)(lex, dv, rng, entry);
    if (!b) continue;
    const { task } = b;
    if (task.word !== key) continue;
    if (task.answers !== undefined && !(task.answers && task.answers.length)) continue;
    task.typeId = id;
    task.drill = true;
    return built(task, [...b.effects, FX.clearForcedNoun()]);
  }
  return null;
}
