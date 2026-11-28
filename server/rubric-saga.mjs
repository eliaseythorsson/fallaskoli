/* What Claude is asked about a story retold in short in the pupil's own
 * words (issue #39: the type `les_saga_eigin`; DLD-PLAN §6 "summary: main
 * point, key points, nothing invented, own words", on MAIN's story map, §4).
 *
 * The pattern of rubric-kjarni.mjs: the ids, labels and follow-up questions
 * are the task's (src/js/tasks/lesskilningur.js `sagaRubric`); this file
 * says what each id MEANS for the model, and gives it the ground truth: the
 * story from the server's own build data, each sentence with its story-map
 * mark (core/storymap.js), its episodes, and the summary written with it if
 * there is one. The copy check and the story's own names are rubric-kjarni's. */

import { EX } from "../data/exercises.js";
import { SAGA_EIGIN } from "../src/js/tasks/lesskilningur.js";
import { ANSWER_RULES, pointLines } from "./rubric-eigin.mjs";
import { textFor, namesIn, copyCheck } from "./rubric-kjarni.mjs";

/** What each point means. Same ids as `sagaRubric` in tasks/lesskilningur.js. */
export const POINTS = Object.freeze({
  adal: "The summary says, in substance, what the problem of the story was (the sentence marked PROBLEM) and how "
    + "it ended (OUTCOME). In a story of several episodes, the problem and outcome of the story as a whole: the "
    + "first problem and the last outcome are enough. A summary that tells only the setting, or stops before the "
    + "end, does not meet this point.",
  hlutar: "The summary gives the main thing the characters did about the problem (ATTEMPT), and tells the events "
    + "in the order they happen in the story. Small details, the setting and the reaction may be left out.",
  rett: "Nothing in the summary contradicts the story or adds an event, a person or a fact the story does not "
    + "have. Saying the same thing in other words is not adding. A summary of something else does not meet "
    + "this point.",
  eigin: "The summary is in the pupil's own words: it does not copy sentences of the story, or long runs of its "
    + "words, word for word. Using the characters' names and the story's key words is fine.",
});

const PART = {
  "aðstæður": "SETTING", vandi: "PROBLEM", kveikja: "PROBLEM", "markmið": "GOAL", tilraun: "ATTEMPT",
  "útkoma": "OUTCOME", "viðbrögð": "REACTION", tilfinning: "REACTION", "annað": "other",
};

const SYSTEM = `You check a short answer written by an Icelandic pupil aged 12 to 16 who read a short story and was asked to retell it in short, in two to four sentences of their own. You grade by the rubric only. The names of the story's characters are not replaced; a character's name in another form may be.\n\n` + ANSWER_RULES;

/** The story, a line per sentence with its part, and a line per episode. */
function storyLines(tx) {
  let ep = 0;
  const out = [];
  for (const s of tx.s) {
    if (s.e && s.e !== ep) { ep = s.e; out.push(`(Episode ${ep})`); }
    out.push(`[${PART[s.p] || "other"}] ${s.t}`);
  }
  return out.join("\n");
}

/**
 * The rubric for the Claude plug (server/reader-claude.mjs).
 * @param {{textar?: any[]}} [ex]  the build's exercises (data/exercises.js)
 */
export function sagaRubric(ex = EX) {
  const textar = ex.textar || [];
  return {
    kind: SAGA_EIGIN,
    points: Object.keys(POINTS),
    keep: (context) => { const tx = textFor(textar, context, "saga"); return tx ? namesIn(tx) : []; },
    check: copyCheck(textar, "saga"),
    /** The prompt for one answer, or null for a story the server does not have. */
    prompt(text, context) {
      const tx = textFor(textar, context, "saga");
      if (!tx) return null;
      const model = tx.q.find((q) => q.k === "samantekt");
      const user = `The story, one sentence per line, each marked with its part of the story map:
${storyLines(tx)}
${model ? `\nA good summary written by the teacher (one of many; the pupil need not match it): ${model.a}\n` : ""}
The rubric:
${pointLines(POINTS)}

The pupil's summary:
<answer>
${text}
</answer>`;
      return { system: SYSTEM, user };
    },
  };
}
