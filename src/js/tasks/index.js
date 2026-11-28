/* The question builders — the door the rest of the program comes in by.

   tasks/
     registry.js        the catalogue (core/catalogue.js) joined with the
                        builders: every question type, ready to build
     <skill>.js         one file per category, its BUILDERS by type id: nafnord, lysingarord, sagnord,
                        fornofn, toluord, obeygjanleg, greining, fallstjorn,
                        ordaford, setningafraedi, malbeiting, setningagerd,
                        lesskilningur, frasogn
     view.js            what a builder may look at: (lex, view, rng); and
                        which word it asks about (`view.pickWord`)
     effects.js         what showing a question changes, as data
     next.js            choosing the next question of a session or a duel
     drill.js           the rescue drill: questions about one word; and
                        "Þrjár í röð", three questions on one error pattern
     review.js          a review: an entry of the queue (core/review.js) asked
                        again, with its cell or word forced
     shared.js          the random source, a word's weight, pools, small helpers
     cloze.js, tap.js   the two builders more than one category asks for
     frames.js          sentence frames: one word lifted out, another put in
     explain.js         the explanation under an answer

   Grading is not in this folder: core/answer.js judges every question type.

   A builder is pure: build(lex, view, rng) → { task, effects } or null. It
   changes nothing and draws only from the `rng` it is handed — the global
   generator is not named anywhere in this folder, and tests/purity.test.js
   greps for it. Whoever shows the task applies its effects:

       const b = nextTask(lex, makeView({ S, sess, policy }), rng);
       if (b) { applyEffects(app, b.effects); show(b.task); }

   A new type is one entry at the end of core/catalogue.js and one builder in
   its category's BUILDERS, and a renderer in ui/ if no existing one draws its
   shape (see registry.js).                                                  */

export { TASKS, CATEGORIES, typeById, enabled, weightOf } from "./registry.js";
export { nextTask, buildTask } from "./next.js";
export { drillTask, patternTask, streakTasks, wordStreakTasks, DRILL_PLAN, DRILL_MEANING_TURN } from "./drill.js";
export { makeView, withView } from "./view.js";
export { applyEffects, built, FX } from "./effects.js";
export { reviewTask, planOpening, nextOpening, scheduleReask, nextReask } from "./review.js";
