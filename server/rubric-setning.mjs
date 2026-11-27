/* What Claude is asked about the pupil's own sentence with a word (issue #38:
 * the type `or_setning`, and the Orðakort's "min" step — "use the word in a
 * sentence about my own life", docs/DLD-PLAN.md §1).
 *
 * The pattern of rubric-eigin.mjs: the ids, labels and follow-up questions
 * are the task's (src/js/tasks/wordcard.js `setningRubric`); this file says
 * what each id MEANS for the model, and gives it the sense to grade against,
 * looked up here by the word key — never sent by the browser. Claude returns
 * a finding per point and nothing the pupil sees. */

import { setningTask, SETNING } from "../src/js/tasks/wordcard.js";
import { ANSWER_RULES, CLASSES, lookupWord, pointLines } from "./rubric-eigin.mjs";

/** What each point means. Same ids as `setningRubric`. */
export const POINTS = Object.freeze({
  notkun: "The sentence uses the word (in any inflected form) correctly, with the meaning the dictionary "
    + "definition gives, so that a reader can see from the sentence what the word means or at least that it is "
    + "used in that meaning. A sentence that only names the word, uses it in a different sense, or in which "
    + "the word does not make sense, does not meet this point.",
  eigin: "The sentence is about the pupil's own life: something they did, saw, think, feel or want, their "
    + "family, friends, school or free time. A general statement that could come from a dictionary or a "
    + "textbook does not meet this point.",
});

const SYSTEM = `You check a short answer written by an Icelandic pupil aged 12 to 16 who was asked to write a sentence about their own life that uses an Icelandic word. You grade by the rubric only.\n\n` + ANSWER_RULES;

/**
 * The rubric for the Claude plug (server/reader-claude.mjs).
 * @param {any} lex  the server's lexicon (core/lexicon.js)
 */
export function setningRubric(lex) {
  return {
    kind: SETNING,
    points: Object.keys(POINTS),
    /** The prompt for one text, or null for a word the server cannot grade. */
    prompt(text, context) {
      const w = lookupWord(lex, context);
      const task = w ? setningTask(w) : null;
      if (!task) return null;
      const user = `The word: ${w.o} (${CLASSES[w.c] || w.c})
The dictionary definition (Íslensk nútímamálsorðabók): ${task.def}

The rubric:
${pointLines(POINTS)}

The pupil's sentence:
<answer>
${text}
</answer>`;
      return { system: SYSTEM, user };
    },
  };
}
