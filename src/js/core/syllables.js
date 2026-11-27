// @ts-check
/* Syllables (atkvæði) of an Icelandic word, as the Orðakort shows them
 * (issue #15): ein·stak·ling·ur.
 *
 * THE RULE is the one Icelandic schools and the official spelling rules use
 * for dividing a word (Ritreglur Íslenskrar málnefndar, greinarmerki, §33):
 *
 *   1. a compound or prefixed word is divided at its joints (borð-dúkar,
 *      for-maður, á-stríða), and so is a suffix that is felt as a unit of its
 *      own (sann-leikur, list-rænn, strák-lingur) and a long loanword
 *      (krókó-díll);
 *   2. inside a part, every syllable after the first BEGINS WITH ITS VOWEL:
 *      the consonants between two vowels stay with the first (hest-ur,
 *      vænst-ur, hundarn-ir, skip-un).
 *
 * A syllable has one vowel sound. The letters *au*, *ei* and *ey* are one
 * sound; any other two vowels side by side are two syllables (þró-un, bú-a).
 *
 * Step 2 is mechanical. Step 1 is not: nothing in the spelling of *áhrif*
 * says that it is á + hrif (the rule alone gives "áhr-if"), and no list of
 * prefixes can tell *sam-vinna* from *samn-ingur*. So the joints are NOT
 * guessed: a word's division is shown only when the word is on the list
 * src/js/content/syllables.js, where its joints are written down by hand
 * (`á+hrif`, `mikil+vægur`) and were read one by one (a native reader's check is asked
 * for in content/REVIEW-NOTES.md). A word that is not
 * on the list has no syllables on its card — a wrong division is worse than
 * none. tests/syllables.test.js holds the rule to tricky words and reads
 * every line of the list.
 *
 * Pure: no DOM, no clock.
 */

import { SYLLABLE_LIST } from "../content/syllables.js";

const VOWELS = new Set("aáeéiíoóuúyýæö");
const DIPHTHONGS = new Set(["au", "ei", "ey"]);

/** Where each vowel sound of `part` starts. @param {string} part @returns {number[]} */
function nuclei(part) {
  const at = [];
  const p = part.toLowerCase();
  for (let i = 0; i < p.length; i++) {
    if (!VOWELS.has(p[i])) continue;
    at.push(i);
    if (DIPHTHONGS.has(p.slice(i, i + 2))) i++;
  }
  return at;
}

/** One part without joints, by rule 2. @param {string} part @returns {string[]} */
function divide(part) {
  const at = nuclei(part);
  const out = [];
  let from = 0;
  for (const i of at.slice(1)) { out.push(part.slice(from, i)); from = i; }
  out.push(part.slice(from));
  return out;
}

/**
 * The syllables of a word whose joints are marked with `+`: "á+hrif" →
 * ["á", "hrif"], "mikil+vægur" → ["mik", "il", "væg", "ur"], "hestur" →
 * ["hest", "ur"]. A part without a vowel stays with the part before it.
 * @param {string} marked @returns {string[]}
 */
export function syllabify(marked) {
  /** @type {string[]} */
  const out = [];
  for (const part of String(marked || "").split("+").filter(Boolean)) {
    if (!nuclei(part).length && out.length) out[out.length - 1] += part;
    else out.push(...divide(part));
  }
  return out;
}

/** How many syllables a word has: its vowel sounds. Needs no joints.
    @param {string} word @returns {number} */
export const syllableCount = (word) => nuclei(String(word || "").replace(/\+/g, "")).length;

/** lemma → the line of the list, joints marked. */
const LIST = new Map(SYLLABLE_LIST.split(/\s+/).filter(Boolean).map((m) => [m.replace(/\+/g, ""), m]));

/** The lemmas on the checked list. @returns {string[]} */
export const syllableWords = () => [...LIST.keys()];

/**
 * The syllables of a lemma on the checked list, or null for a word that is
 * not on it (the card then shows none).
 * @param {string} lemma @returns {string[] | null}
 */
export function syllablesOf(lemma) {
  const m = LIST.get(String(lemma || ""));
  return m ? syllabify(m) : null;
}
