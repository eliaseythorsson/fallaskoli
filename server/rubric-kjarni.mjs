/* What Claude is asked about the main idea of a subject text, written in the
 * pupil's own words (issue #39: the type `les_kjarni_eigin`; DLD-PLAN §4
 * "write a gist of at most about 15 words", §6 "summary: main point, key
 * points, nothing invented, own words").
 *
 * The pattern of rubric-eigin.mjs: the ids, labels and follow-up questions
 * are the task's (src/js/tasks/lesskilningur.js `kjarniRubric`); this file
 * says what each id MEANS for the model, and gives it the ground truth to
 * grade against — the text itself with the marks it was written with
 * ([aðalatriði], [smáatriði], [annað]) and the gist written with it, if any.
 * The server reads the text from its own build data (`EX.textar`, the same
 * data/exercises.js the browser has) by the id the browser sends; the
 * browser never sends the text or its marks.
 *
 * Also here, shared with rubric-saga.mjs, the two things a text adds:
 *   - THE COPY CHECK (`copyCheck`): a whole sentence of the text, or a run
 *     of COPY_RUN of its words, copied into the answer is not the pupil's own
 *     words, whatever the model says. Decided here, on the text as the pupil
 *     wrote it: the `eigin` point gets one finding, not met, quoting what
 *     was copied — so the reader's quote check holds it to the pupil's text
 *     like any other finding.
 *   - THE TEXT'S OWN NAMES (`namesIn`) are not stripped (reader-claude.mjs
 *     `keep`): a character of a story is not somebody the pupil knows. */

import { EX } from "../data/exercises.js";
import { KJARNI_EIGIN } from "../src/js/tasks/lesskilningur.js";
import { ANSWER_RULES, pointLines } from "./rubric-eigin.mjs";

/** The text a request is about, by its id alone, if it is of `kind`.
    @param {any[]} textar @param {any} context @param {string} kind */
export function textFor(textar, context, kind) {
  const id = context && typeof context.texti === "string" ? context.texti : "";
  const tx = id ? textar.find((t) => t.id === id) : null;
  return tx && tx.k === kind ? tx : null;
}

/** Words with a capital letter in the text: its names, and the first word of
    each sentence (common words, harmless to keep). @param {any} tx */
export const namesIn = (tx) => [...new Set(tx.s.flatMap((s) => s.t.match(/\p{Lu}\p{L}*/gu) || []))];

/** How many words of the text in a row, copied, are no longer the pupil's
    own; and the shortest sentence that counts when copied whole. */
export const COPY_RUN = 8;
export const COPY_MIN_SENTENCE = 4;

const WORDS = /[\p{L}\p{N}]+/gu;

/**
 * What of `answer` is copied from one of `sentences` (strings): the piece of
 * the answer, as written, or null. Copied is a whole sentence of at least
 * COPY_MIN_SENTENCE words, or COPY_RUN words in a row, word for word (case
 * and punctuation aside).
 * @param {string} answer @param {string[]} sentences
 */
export function copiedPart(answer, sentences) {
  const a = [...String(answer).matchAll(WORDS)];
  const aw = a.map((m) => m[0].toLowerCase());
  let best = null;
  for (const s of sentences) {
    const sw = (String(s).match(WORDS) || []).map((w) => w.toLowerCase());
    if (sw.length < COPY_MIN_SENTENCE) continue;
    const need = Math.min(COPY_RUN, sw.length);
    /* the longest run of words the two share (dynamic programming) */
    let prev = new Array(sw.length + 1).fill(0);
    for (let i = 1; i <= aw.length; i++) {
      const row = new Array(sw.length + 1).fill(0);
      for (let j = 1; j <= sw.length; j++) {
        if (aw[i - 1] !== sw[j - 1]) continue;
        row[j] = prev[j - 1] + 1;
        if (row[j] >= need && (!best || row[j] > best.n)) best = { n: row[j], end: i };
      }
      prev = row;
    }
  }
  if (!best) return null;
  const first = a[best.end - best.n], last = a[best.end - 1];
  return answer.slice(first.index, last.index + last[0].length);
}

/**
 * The rubric's `check`: the copy check on the `eigin` point (see the header).
 * @param {any[]} textar @param {string} kind
 */
export const copyCheck = (textar, kind, point = "eigin") => (findings, text, context) => {
  const tx = textFor(textar, context, kind);
  const copied = tx ? copiedPart(text, tx.s.map((s) => s.t)) : null;
  if (!copied) return findings;
  return [...findings.filter((f) => f.point !== point), { point, met: false, quote: copied }];
};

/** What each point means. Same ids as `kjarniRubric` in tasks/lesskilningur.js. */
export const POINTS = Object.freeze({
  adal: "The answer states the main idea of the whole text in substance, as the sentence marked MAIN IDEA gives "
    + "it: what the text as a whole is about. It may be shorter, simpler or worded quite differently, and may add a "
    + "reason the details give. An answer that gives only one detail (too narrow), only the sentence marked OTHER, "
    + "or something so general that it could be said of many texts (too broad) does not meet this point.",
  rett: "Nothing in the answer contradicts the text or adds a fact the text does not say; something the pupil "
    + "knows from elsewhere but the text does not say counts as added. An answer about something else does not "
    + "meet this point.",
  eigin: "The answer is in the pupil's own words: it does not copy a sentence of the text, or a long run of its "
    + "words, word for word. Using the text's key words (the topic, a name) is fine.",
});

const MARK = { "aðalatriði": "MAIN IDEA", "smáatriði": "detail", "annað": "OTHER (not part of the main idea)" };

const SYSTEM = `You check a short answer written by an Icelandic pupil aged 12 to 16 who read a short subject text and was asked to write its main idea in one sentence of their own (a gist of about 15 words). You grade by the rubric only. The length of the answer does not matter.\n\n` + ANSWER_RULES;

/**
 * The rubric for the Claude plug (server/reader-claude.mjs).
 * @param {{textar?: any[]}} [ex]  the build's exercises (data/exercises.js)
 */
export function kjarniRubric(ex = EX) {
  const textar = ex.textar || [];
  return {
    kind: KJARNI_EIGIN,
    points: Object.keys(POINTS),
    keep: (context) => { const tx = textFor(textar, context, "fræðitexti"); return tx ? namesIn(tx) : []; },
    check: copyCheck(textar, "fræðitexti"),
    /** The prompt for one answer, or null for a text the server does not have. */
    prompt(text, context) {
      const tx = textFor(textar, context, "fræðitexti");
      if (!tx) return null;
      const gist = tx.q.find((q) => q.k === "kjarni");
      const user = `The text, one sentence per line, each marked by the teacher:
${tx.s.map((s) => `[${MARK[s.p] || "detail"}] ${s.t}`).join("\n")}
${gist ? `\nA good gist written by the teacher (one of many; the pupil need not match it): ${gist.a}\n` : ""}
The rubric:
${pointLines(POINTS)}

The pupil's main idea:
<answer>
${text}
</answer>`;
      return { system: SYSTEM, user };
    },
  };
}
