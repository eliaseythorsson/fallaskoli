/* What Claude is asked about a story the pupil wrote (issue #40: Frásögn
 * steps 4–6, DLD-PLAN §5 and §6 "story: the MAIN parts present, sensible
 * order, connectives, inner-state words").
 *
 *   fr_hluti      one part written into a model story, where it was taken out
 *   fr_hlidstaed  a new story on a model story's frame
 *   fr_eigin      the pupil's own story
 *
 * The pattern of rubric-eigin.mjs: the ids, labels and follow-up questions
 * are the task's (src/js/tasks/frasogn.js `partRubric`, `storyRubric`); this
 * file says what each id MEANS for the model, and gives it the ground truth
 * where a step has one: the model story from the server's OWN build data
 * (data/exercises.js `EX.textar`), each sentence with its story-map mark
 * (core/storymap.js), found by the ids the browser sends — `texti` and, for
 * step 4, `setning` (which sentence was taken out). The browser never sends
 * the story or its marks, so what a text is graded against cannot be
 * changed from the page. Step 6 has no source story: the rubric alone.
 *
 * The point ids of the six parts are the parts' own ids, so the browser can
 * draw each with its icon. Claude returns a finding per point — met or not,
 * with a quote — and nothing the pupil sees.
 *
 * From #39 (server/rubric-kjarni.mjs), not written again here: the
 * loader (`textFor`: a text of the build data by its id, of one kind), the
 * story's own names, which are not stripped (`namesIn`, the plug's `keep`:
 * a model story's characters are not somebody the pupil knows; the
 * pupil's own names still are), and the copy check (`copyCheck`): in step
 * 5 a whole sentence of the model story, or eight of its words in a row,
 * copied into the new story fails `ny`, whatever the model says. */

import { EX } from "../data/exercises.js";
import { STORY_PART_IDS } from "../src/js/core/storymap.js";
import { HLUTI, HLIDSTAED, EIGIN_SAGA } from "../src/js/tasks/frasogn.js";
import { ANSWER_RULES, pointLines } from "./rubric-eigin.mjs";
import { textFor, namesIn, copyCheck } from "./rubric-kjarni.mjs";

/** The parts in the model's words (MAIN, Stein & Glenn's story grammar). */
const PART_NAME = Object.freeze({
  "aðstæður": "SETTING", vandi: "PROBLEM", "markmið": "GOAL", tilraun: "ATTEMPT",
  "útkoma": "OUTCOME", "viðbrögð": "REACTION",
});

/** What each part is. Same ids as the parts in tasks/frasogn.js. */
export const PART_POINTS = Object.freeze({
  "aðstæður": "SETTING: the story says who it is about, and where or when it happens (the character and at "
    + "least one of where or when).",
  vandi: "PROBLEM (the initiating event): something happens that starts the story — a problem, a surprise or a "
    + "change the character has to deal with.",
  "markmið": "GOAL: the story says what the character wants, plans or decides to do, because of the problem.",
  tilraun: "ATTEMPT: the character does something to reach the goal or to solve the problem.",
  "útkoma": "OUTCOME: the story says how the attempt ended — whether it worked or not.",
  "viðbrögð": "REACTION: the story says how the character felt, or what they thought or decided, after the "
    + "outcome.",
});

/** The points of a whole story (steps 5 and 6). Same ids as `storyRubric`. */
export const STORY_POINTS = Object.freeze({
  heild: "A complete episode: the story has a PROBLEM, an ATTEMPT and an OUTCOME, in an order that makes sense — "
    + "the attempt answers the problem and the outcome follows from the attempt. Quote the words that show the "
    + "problem.",
  ...PART_POINTS,
  tengiord: "The story links at least two events with a connective of cause or time, such as af því að, vegna "
    + "þess að, þess vegna, svo að, þegar, síðan, þá, eftir að, áður en, en. Plain og does not count. Quote the "
    + "connective with a few words around it.",
  hugarastand: "The story uses at least one word for what a character thinks, wants or feels (an inner state), "
    + "such as vildi, langaði, hélt, vissi, ákvað, vonaði, varð hrædd, glaður, leið, fegin, stolt.",
});

/** Step 5's extra point. Same id as `storyRubric({ parallel: true })`. */
export const NEW_POINT = Object.freeze({
  ny: "The pupil's story is a NEW story on the model's frame: other characters and another problem than the "
    + "model story, though it follows the same parts. The model story retold, or copied with only the names or "
    + "a few words changed, does not meet this point.",
});

/** Step 4's second point. Same id as `partRubric`. */
export const FIT_POINT = Object.freeze({
  samhengi: "The pupil's text fits the story at the gap: it is about the same characters and situation, and "
    + "nothing in it contradicts what comes before or after it.",
});

const STORY_SYSTEM = (what, model = false) => `You check a short story written by an Icelandic pupil aged 12 to 16 ${what}. `
  + (model ? "The names of the model story's characters are not replaced; a character's name in another form may be. " : "")
  + "You grade by the rubric only: the story map of MAIN (setting, problem, goal, attempt, outcome, reaction), "
  + "the order of events, connectives and words for inner states. A part may be told in any words and in more "
  + "or fewer sentences than one; a part is met when the story tells it, however simply.\n\n" + ANSWER_RULES;

/** The story a request is about, by its id alone: a saga of the build data.
    @param {any[]} textar @param {any} context */
const storyFor = (textar, context) => textFor(textar, context, "saga");

/** The story, a line per sentence with its part; `gap`: the sentence taken
    out (step 4), shown as the missing part. @param {any} tx @param {number} [gap] */
export function storyLines(tx, gap = -1) {
  return tx.s.map((s, k) => (k === gap
    ? `[${PART_NAME[s.p] || "other"}] ___ (missing: the pupil writes this part)`
    : `[${PART_NAME[s.p] || "other"}] ${s.t}`)).join("\n");
}

/** The sentence step 4 took out, if the request names one the story has
    and its part is one of the six. @param {any} tx @param {any} context */
function gapOf(tx, context) {
  const k = context && Number.isInteger(context.setning) ? context.setning : -1;
  return k >= 0 && k < tx.s.length && STORY_PART_IDS.includes(tx.s[k].p) ? k : -1;
}

const answer = (text, what) => `${what}:\n<answer>\n${text}\n</answer>`;

/**
 * Step 4: one part written into a model story. The points are the six parts
 * and `samhengi`; the prompt asks only for the part that was taken out (the
 * browser's rubric has only that one).
 * @param {{textar?: any[]}} [ex]  the build's exercises (data/exercises.js)
 */
export function hlutiRubric(ex = EX) {
  const textar = ex.textar || [];
  return {
    kind: HLUTI,
    points: [...STORY_PART_IDS, ...Object.keys(FIT_POINT)],
    keep: (context) => { const tx = storyFor(textar, context); return tx ? namesIn(tx) : []; },
    /** The prompt for one answer, or null for a story or gap the server does not have. */
    prompt(text, context) {
      const tx = storyFor(textar, context);
      const k = tx ? gapOf(tx, context) : -1;
      if (k < 0) return null;
      const part = tx.s[k].p;
      const user = `The story, one sentence per line, each marked with its part of the story map. One sentence was taken out; the pupil was asked to write it:
${storyLines(tx, k)}

The sentence the author wrote there (one of many good answers; the pupil need not match it): ${tx.s[k].t}

The rubric (give a finding for these two points only):
${pointLines({ [part]: `The pupil's text is the missing part, the ${PART_POINTS[part]}`, ...FIT_POINT })}

${answer(text, "The pupil's text for the gap")}`;
      return { system: STORY_SYSTEM("who was asked to write one missing part of a short story", true), user };
    },
  };
}

/**
 * Step 5: a new story on a model story's frame.
 * @param {{textar?: any[]}} [ex]
 */
export function hlidstaedRubric(ex = EX) {
  const textar = ex.textar || [];
  const points = { ...STORY_POINTS, ...NEW_POINT };
  return {
    kind: HLIDSTAED,
    points: Object.keys(points),
    keep: (context) => { const tx = storyFor(textar, context); return tx ? namesIn(tx) : []; },
    check: copyCheck(textar, "saga", "ny"),
    prompt(text, context) {
      const tx = storyFor(textar, context);
      if (!tx) return null;
      const user = `The model story, one sentence per line, each marked with its part of the story map. The pupil saw it, with the six parts as icons, and was asked to write a NEW story with the same six parts in the same order, about other characters and another problem:
${storyLines(tx)}

The rubric:
${pointLines(points)}

${answer(text, "The pupil's story")}`;
      return { system: STORY_SYSTEM("on the frame of a model story", true), user };
    },
  };
}

/**
 * Step 6: the pupil's own story, with the six parts as a checklist. No
 * source story: nothing to look up, and nothing of it but the text is sent.
 */
export function eiginSagaRubric() {
  return {
    kind: EIGIN_SAGA,
    points: Object.keys(STORY_POINTS),
    prompt(text) {
      const user = `The pupil was asked to write their own short story, with the six parts of the story map as a checklist.

The rubric:
${pointLines(STORY_POINTS)}

${answer(text, "The pupil's story")}`;
      return { system: STORY_SYSTEM("of their own"), user };
    },
  };
}

/** The three rubrics, for server.mjs and tools/record-grading.mjs. */
export const frasognRubrics = (ex = EX) => [hlutiRubric(ex), hlidstaedRubric(ex), eiginSagaRubric()];
