/* The rescue drill (v6.6): ten to twenty questions about ONE word.

   The general builders choose their sentence or their word themselves. In a
   drill the word is given: the view carries it (`mustAsk`, strict), and
   every builder that chooses a word asks the view for it (`pickWord`,
   `askedWord`, `cannotAsk` in tasks/view.js).
   Four types have a variant that starts from the word instead — the cloze,
   the analysis, the word-class question and the case a word governs; each
   exports it as `drill` beside `build` in its category's BUILDERS. */

import { wordKey } from "../core/state.js";
import { built, FX } from "./effects.js";
import { withView } from "./view.js";
import { typeById, enabled } from "./registry.js";
import { drillMeaning } from "./ordaford.js";
import { nextTask } from "./next.js";
import { narrowPolicy } from "../core/policy.js";
import { focusTypes, huntPreferFor, targets } from "../core/diagnosis.js";

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
  const dv = withView(view, { mustAsk: { word: entry, strict: true }, learning: null });
  for (let k = 0; k < plan.length * 3; k++) {
    const id = plan[(slot + k) % plan.length];
    const spec = typeById(id);
    if (!spec || !enabled(P, spec)) continue;
    const b = (spec.drill || spec.build)(lex, withView(dv, { typeId: id }), rng, entry);
    if (!b) continue;
    const { task } = b;
    if (task.word !== key) continue;
    if (task.answers !== undefined && !(task.answers && task.answers.length)) continue;
    /* The spacing rule (#10): the drilled word is in every question, so the
       type just asked is skipped and the rotation moves on. A class with one
       kind of question left (an indeclinable word with `parse` switched off)
       ends its drill here rather than ask the same thing twice in a row. */
    if (dv.repeatsLast({ ...task, typeId: id })) continue;
    task.typeId = id;
    task.drill = true;
    return built(task, [...b.effects, FX.last(task), FX.clearForcedNoun()]);
  }
  return null;
}

/* ---------- "Þrjár í röð": three questions on one error pattern ------------
 *
 * The rescue drill above is about one WORD; this is about one error pattern
 * (critique item 36, core/streak.js). It asks what a session aimed at the
 * pattern asks — the pattern's question types, and the Villuveiðar items
 * that exercise it — but keeps only a question that really tests the
 * pattern: a candidate that does not is built again, and if none comes the
 * answer is null and the three end early. Never some unrelated question
 * under the pattern's name. */

/** How many candidates are built before giving up on one question. */
const PATTERN_TRIES = 24;

/**
 * One question on the error pattern `p`: { task, effects } or null.
 * @param avoid  word keys already asked in this run of three (and the one
 *               just missed): another word is preferred while one can be had
 * @param prefer the question type the miss was made in. Some patterns are
 *               tested by one type in fifty draws of the mix (the gender of a
 *               noun, by the analysis question; the subjunctive, by the verb
 *               question at a high þyngd), and the miss has just shown that
 *               this type can test it at this pupil's level — so every other
 *               candidate is built by it.
 */
export function patternTask(lex, view, rng, p, avoid = [], prefer = null) {
  const types = [...focusTypes([p])];
  if (!types.length) return null;
  const pv = withView(view, {
    policy: narrowPolicy(view.policy, { types }),
    huntPrefer: huntPreferFor([p]), mustAsk: null, mix: null, force: null,
  });
  const own = prefer && types.includes(prefer) ? typeById(prefer) : null;
  const ownOk = !!own && enabled(pv.policy, own);
  const skip = new Set(avoid.filter(Boolean));
  let fallback = null;
  for (let k = 0; k < PATTERN_TRIES; k++) {
    let b;
    if (ownOk && k % 2 === 0) {
      b = own.build(lex, withView(pv, { typeId: own.id }), rng);
      if (b) {
        /* What the session knows once it is shown — as tasks/next.js adds. */
        b.task.typeId = own.id;
        const words = [b.task.n, b.task.w, b.task.v].filter(Boolean).map((x) => x.o);
        b = built(b.task, [...b.effects, FX.since(own.id.startsWith("tbl"), false),
          ...(words.length ? [FX.seen(words)] : []), FX.last(b.task)]);
        /* the spacing rule (#10), as tasks/next.js keeps it */
        if (pv.repeatsLast(b.task)) b = null;
      }
    } else b = nextTask(lex, pv, rng);
    if (!b) { if (ownOk) continue; return fallback; }
    const { task } = b;
    if (task.type === "meaning" || !targets(task, [p])) continue;
    task.targeted = true;
    task.streak = p;
    if (task.word && skip.has(task.word)) { fallback ||= b; continue; }
    return b;
  }
  return fallback;
}

/**
 * All of "Þrjár í röð" at once: `n` questions on the pattern `p`, each on
 * another word where one can be had, or null if not all `n` can be built —
 * the offer is made only when the three are there (control/drill.js `offerStreak`).
 * Pure like the rest: nothing is applied until a question is shown.
 * @param from  the question the miss was made in: its word is not asked
 *              again at once, and its type is tried first
 */
export function streakTasks(lex, view, rng, p, from = {}, n = 3) {
  const out = [], avoid = [from.word || null];
  const type = from.typeId || from.type || null;
  let v = view;
  for (let k = 0; k < n; k++) {
    const b = patternTask(lex, v, rng, p, avoid, type);
    if (!b) return null;
    out.push(b);
    avoid.push(b.task.word || null);
    /* The three are built before any is shown: each is built against the one
       before it, as the session will have it then (the spacing rule, #10). */
    const last = b.effects.find((e) => e.op === "last");
    if (last) v = withView(v, { sess: { ...v.sess, lastAsked: { type: last.type, words: last.words } } });
  }
  return out;
}

/* ---------- "Þrjár í röð" on one word (#17) ---------------------------------
 *
 * The first time a word is hard (core/wordknowledge.js `noteHard`), three
 * questions on that word: the rescue drill's own questions (`drillTask`,
 * the word asked by name, strict), three of them, without its meaning
 * question, which has no wrong answer and so could not count as one of
 * the three. */

/**
 * All three at once, or null if three cannot be built — the offer is made
 * only when they are there (control/drill.js `offerWordStreak`). Pure like
 * the rest: nothing is applied until a question is shown.
 * @param entry  the word's lexicon entry
 */
export function wordStreakTasks(lex, view, rng, entry, n = 3) {
  const out = [];
  const key = entry ? wordKey(entry.o, entry.c) : null;
  let v = view;
  const plan = DRILL_PLAN[entry && entry.c] || [];
  for (let turn = 0; out.length < n && turn < n + plan.length + 1; turn++) {
    if (turn === DRILL_MEANING_TURN) continue;
    const b = drillTask(lex, v, rng, entry, turn);
    if (!b || b.task.word !== key) continue;
    b.task.drill = false;
    b.task.streak = key;
    out.push(b);
    /* Each is built against the one before it, as the session will have it
       then (the spacing rule, #10). */
    const last = b.effects.find((e) => e.op === "last");
    if (last) v = withView(v, { sess: { ...v.sess, lastAsked: { type: last.type, words: last.words } } });
  }
  return out.length === n ? out : null;
}
