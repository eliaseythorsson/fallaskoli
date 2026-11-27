/* A pupil with words in learning — for the tests that build EVERY question
   type against a made-up pupil.

   Not a test file itself (no `.test.js`): any test imports it.

   Most types build for anybody. A type that asks about the pupil's own
   words in learning (tasks/recall.js, issue #14) builds nothing for a pupil
   who has none — in the app every pupil has six (`fillLearning` at load),
   but a blank test pupil does not. `giveWords(S, typeId)` puts six words in
   learning when the type is one of those, and does nothing otherwise: the
   other types keep meeting the pupil they always met, so nothing measured
   about them moves.

   The six are words the sentence bank can show, of every class a word in
   learning may have: two nouns of different genders, two verbs, an
   adjective and an adverb. */

import { enterLearning } from "../src/js/core/wordknowledge.js";

/** The types built only for a pupil who has words in learning. */
export const OWN_WORD_TYPES = new Set(["or_eyda"]);

export const LEARNER_WORDS = ["hugmynd|kvk", "völlur|kk", "útskýra|so", "lofa|so", "frægur|lo", "snemma|ao"];

/** Put the six in learning if `typeId` needs them (or is left out). Returns `S`. */
export function giveWords(S, typeId = null, today = "2026-01-05") {
  if (typeId === null || OWN_WORD_TYPES.has(typeId))
    for (const w of LEARNER_WORDS) enterLearning(S, w, today);
  return S;
}
