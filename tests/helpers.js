/* How the tests ask for a question.

   A builder is pure: build(lex, view, rng) → { task, effects } (tasks/view.js).
   The tests mostly want what the app wants — the question, shown — so these
   helpers do what `app.pickTask` does: make the view, build, and apply the
   effects of the task to the test's own little context
   ({ lex, S, sess, forcedNoun, policy?, run?, mix?, huntPrefer? }).

   Tests of purity itself (tests/purity.test.js) call the builders directly. */

import { effectivePolicy } from "../src/js/core/state.js";
import { nextTask, drillTask, makeView, applyEffects } from "../src/js/tasks/index.js";

/** The test suite's random source. Only the builders are forbidden Math.random. */
export const rng = () => Math.random();

/** The view of a test context. The policy is worked out once and kept on the
    context, as the app keeps it. */
export const viewOf = (ctx, extra = {}) => makeView({
  S: ctx.S, sess: ctx.sess, policy: (ctx.policy ||= effectivePolicy(ctx.S)),
  forcedNoun: ctx.forcedNoun, mix: ctx.mix, inRun: !!ctx.run, huntPrefer: ctx.huntPrefer,
  ...extra,
});

/** Build with one builder and show the result: the task, or null. */
export function show(ctx, build, random = rng, ...more) {
  const b = build(ctx.lex, viewOf(ctx), random, ...more);
  if (!b) return null;
  applyEffects(ctx, b.effects);
  return b.task;
}

/** The next question of a session, shown. */
export const ask = (ctx, random = rng) => show(ctx, nextTask, random);

/** One question of a rescue drill, shown. */
export const drill = (ctx, entry, turn, random = rng) => show(ctx, drillTask, random, entry, turn);

/* ---------- answering a question ------------------------------------------
 *
 * The response that is RIGHT for any task, in the shape core/answer.js
 * `judge` reads — what a pupil who knew everything would give. The duel
 * tests answer whole duels with it, in Node (tests/duel.test.js) and through
 * a real browser (tools/server-test.mjs). tests/answer.test.js keeps its own
 * copy beside the wrong responses it is paired with; if a response changes
 * shape, both say so.
 */
import { askedCells, parseRows } from "../src/js/core/answer.js";

export function rightResponse(t) {
  switch (t.type) {
    case "fill": case "verb": case "verbslot": case "gap": case "umritun": case "smidja":
      return { text: t.answers[0] };
    case "table": return { cells: askedCells(t).map((c) => t.w.forms[c.m][0]) };
    case "parse": return { picks: Object.fromEntries(parseRows(t.a, t.t).map((r) => [r.key, r.answer])) };
    case "syntax": return { picked: t.s.tok.findIndex((x) => x.r === t.askRole) };
    case "govern": return { picked: t.fall };
    case "indecl": case "clause": return { picked: t.answer };
    case "choice": return t.second ? { picked: t.answer, picked2: t.second.answer } : { picked: t.answer };
    case "kenni": return t.askGen ? { picked: t.answer, text: t.gen[0] } : { picked: t.answer };
    case "slots": return { ...(t.options ? { picked: t.answer } : {}), texts: t.slots.map((sl) => sl.accepted[0]) };
    case "tap": return { sel: t.targets.slice() };
    case "sort": return { picks: Object.fromEntries(t.items.map((it, k) => [k, it.cls])) };
    case "villur": {
      const edits = {};
      t.hunt.lines.forEach((ln, li) => ln.toks.forEach((tk, ti) => { if (tk.err) edits[`${li}:${ti}`] = tk.err.answers[0]; }));
      return { edits };
    }
    default: throw new Error("no right response for " + t.type);
  }
}

/** A response that is wrong for any task: an answer nobody would accept. */
export function wrongResponse(t) {
  switch (t.type) {
    case "table": return { cells: askedCells(t).map(() => "xq") };
    case "parse": return { picks: { fl: "xq" } };
    case "syntax": case "govern": case "indecl": case "clause": case "choice": return { picked: "xq" };
    case "kenni": return { picked: "xq", text: "xq" };
    case "slots": return { picked: "xq", texts: t.slots.map(() => "xq") };
    case "tap": return { sel: [] };
    case "sort": return { picks: {} };
    case "villur": return { edits: {} };
    /* One word: several would read as "choose one form", which is not an
       answer at all. */
    default: return { text: "xq" };
  }
}
