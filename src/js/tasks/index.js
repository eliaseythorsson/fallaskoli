/* The question builders — the door the rest of the program comes in by.

   tasks/
     registry.js        the catalogue: every question type, declared (start here)
     <skill>.js         one file per category: nafnord, lysingarord, sagnord,
                        fornofn, toluord, obeygjanleg, greining, fallstjorn,
                        ordaford, setningafraedi, malbeiting, setningagerd
     view.js            what a builder may look at: (lex, view, rng)
     effects.js         what showing a question changes, as data
     next.js            choosing the next question of a session or a duel
     drill.js           the rescue drill: questions about one word
     shared.js          the random source, word choice, pools, small helpers
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

   A new type is one builder and one TYPES entry in its category's file, and a
   renderer in ui/ if no existing one draws its shape (see registry.js).     */

export { TASKS, CATEGORIES, typeById, enabled, weightOf } from "./registry.js";
export { nextTask } from "./next.js";
export { drillTask, DRILL_PLAN, DRILL_MEANING_TURN } from "./drill.js";
export { makeView, withView } from "./view.js";
export { applyEffects, built, FX } from "./effects.js";
