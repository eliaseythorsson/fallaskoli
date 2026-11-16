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
