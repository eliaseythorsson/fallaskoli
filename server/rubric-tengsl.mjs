/* What Claude is asked about three words the pupil relates to a word
 * (issue #38: the type `or_tengsl`, and the Orðakort's "tengsl" step —
 * "three related words, and how each one connects", docs/DLD-PLAN.md §1;
 * the plan's rubric for the card: "links real").
 *
 * The pattern of rubric-eigin.mjs: the ids, labels and follow-up questions
 * are the task's (src/js/tasks/wordcard.js `tengslRubric`); this file says
 * what each id MEANS for the model. The browser sends the three rows as one
 * numbered text ("1. orð – hvernig", `linksText`), and the word key; the
 * definition, when the word has a trusted one, is looked up here. Step 5 is
 * never skipped, so a word without one is graded too: the model is then
 * told the word and its class only. Claude returns a finding per point and
 * nothing the pupil sees. */

import { tengslTask, TENGSL } from "../src/js/tasks/wordcard.js";
import { ANSWER_RULES, CLASSES, lookupWord, pointLines } from "./rubric-eigin.mjs";

/** What each point means. Same ids as `tengslRubric`. */
export const POINTS = Object.freeze({
  tengsl: "Each of the three words the pupil gives is really related to the word: it means nearly the same, "
    + "the opposite, is of the same word family, is a kind or a part of it, or is something it is commonly "
    + "used with, for or about. A misspelled word counts as the word it is meant to be. If even one of the "
    + "three has no real link to the word, or the three are the same word, this point is not met; quote the "
    + "line that fails.",
  hvernig: "For each of the three words the pupil says how it connects to the word, and nothing they say about "
    + "a connection is wrong. A word with nothing written after it does not meet this point.",
});

const SYSTEM = `You check a short answer written by an Icelandic pupil aged 12 to 16 who was asked to give three words related to an Icelandic word and say how each one connects to it. The answer has one numbered line per word: the related word, then a dash and how it connects. You grade by the rubric only.\n\n` + ANSWER_RULES;

/**
 * The rubric for the Claude plug (server/reader-claude.mjs).
 * @param {any} lex  the server's lexicon (core/lexicon.js)
 */
export function tengslRubric(lex) {
  return {
    kind: TENGSL,
    points: Object.keys(POINTS),
    /** The prompt for one text, or null for a word the server does not know. */
    prompt(text, context) {
      const w = lookupWord(lex, context);
      const task = w ? tengslTask(w) : null;
      if (!task) return null;
      const def = task.def ? `\nThe dictionary definition (Íslensk nútímamálsorðabók): ${task.def}` : "";
      const user = `The word: ${w.o} (${CLASSES[w.c] || w.c})${def}

The rubric:
${pointLines(POINTS)}

The pupil's three words:
<answer>
${text}
</answer>`;
      return { system: SYSTEM, user };
    },
  };
}
