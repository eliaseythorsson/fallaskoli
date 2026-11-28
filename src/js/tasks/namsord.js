// @ts-check
/* Námsorð (#19): questions about the pupil's words in learning
   (core/wordknowledge.js, "Orðin mín").

   No question type is filed here yet. The first are being built:
     #11  the graded meaning question  (which sentence uses the word rightly)
     #14  the recall gap               (type the word into a sentence)
     #15  the Orðakort                 (the first meeting with a word)
   Each moves here by the rule of tasks/registry.js: `skill: "namsord"` on its
   catalogue entry, its builder under BUILDERS below (it may stay in the file
   it was written in and be imported), `skill: "namsord"` on the task it
   builds, and its id on the node `nams-ordin` in core/curriculum.js.

   Until then the skill has no types (core/catalogue.js `skillHasTypes`):
   it is on the Færnikort and in the presets, and nothing plans a question of
   it — not Lota dagsins, the picker, a duel or the placement round. */

/** @type {Record<string, import("../types").Builder>} */
export const BUILDERS = {};
