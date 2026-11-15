/* Grading answers.

   The governing rule: we grade the word form that was asked for, not the
   packaging. The child may write "hér er fínn strákur, um fínan strák" when the
   adjective's inflection was asked for — helper words are allowed and stripped
   before grading. What is *not* allowed is writing several forms of the same
   word and hoping one of them is right; that is detected separately
   (`hedged`). */

export const normalise = (s) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFC")
    .replace(/[.,!?;:„“"'()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/* A slip of the finger is a missing or extra acute accent, and nothing else:
 * on an Icelandic layout the acute is a dead key, so *finum* for *fínum* is one
 * missed keystroke. ö, æ, þ and ð are letters of their own with their own keys,
 * so *hond* for *hönd* is a different word. */
const SLIP = { á: "a", é: "e", í: "i", ó: "o", ú: "u", ý: "y" };

/**
 * The answer with acute accents removed — and NOTHING else changed.
 * `stripAccents("fínum")` and `stripAccents("finum")` are both "finum";
 * `stripAccents("hönd")` is still "hönd" and `stripAccents("það")` still "það".
 */
export const stripAccents = (s) =>
  normalise(s).replace(/[áéíóúý]/g, (c) => SLIP[c]);

/** Strict whole-answer judgement, used where helpers make no sense. */
export function judge(input, accepted) {
  const a = normalise(input);
  if (!a) return "empty";
  const acc = [].concat(accepted || []);
  if (acc.some((f) => normalise(f) === a)) return "correct";
  if (acc.some((f) => stripAccents(f) === stripAccents(a))) return "accents";
  return "wrong";
}

const words = (s) => (normalise(s) ? normalise(s).split(" ") : []);

/** All contiguous word runs of `toks`, longest first, as [text, from, to). */
function ngrams(toks, maxLen) {
  const out = [];
  const top = Math.min(maxLen, toks.length);
  for (let len = top; len >= 1; len--)
    for (let i = 0; i + len <= toks.length; i++)
      out.push([toks.slice(i, i + len).join(" "), i, i + len]);
  return out;
}

/**
 * Every mark in `paradigm` whose forms include exactly this text, minus the
 * marks being asked for; `null` when there is no paradigm. Consulted BEFORE
 * the accent rule: *biðum* and *bíðum* are both forms of *bíða* (past and
 * present), and a child who wrote the past has not slipped on a key.
 * `core/leniency.js` decides what the other mark means.
 */
function otherMarksFor(text, paradigm, accepted) {
  if (!paradigm) return null;
  const t = normalise(text);
  const right = new Set(accepted.map(normalise));
  if (right.has(t)) return null;
  const marks = [];
  for (const [m, forms] of Object.entries(paradigm))
    for (const f of [].concat(forms || []))
      if (normalise(f) === t) { marks.push(m); break; }
  return marks.length ? marks : null;
}

/**
 * Grade one requested form, tolerating surrounding helper words.
 *
 * @param {string} input        what the child typed
 * @param {object} opts
 *   accepted   {string[]}      correct forms (BÍN variants are all correct)
 *   paradigm   {object}        mark -> forms for the same lemma, to spot hedging
 *                              and to recognise a different form of the word
 *   allowHelpers {boolean}     default true
 * @returns {{verdict:string, matched:?string, helpers:string[], hedged:string[],
 *            otherMarks:?string[]}}
 *   verdict ∈ empty | correct | otherform | accents | hedged | wrong
 *
 *   `otherform` — what they wrote is, exactly, another cell of this word's own
 *   paradigm. `otherMarks` says which. That is a grammatical answer, right or
 *   wrong, and never a spelling slip.
 */
export function gradeForm(input, { accepted, paradigm = null, allowHelpers = true } = {}) {
  const acc = [].concat(accepted || []).filter(Boolean);
  const toks = words(input);
  const none = { matched: null, helpers: [], hedged: [], otherMarks: null };
  if (!toks.length) return { ...none, verdict: "empty" };

  const whole = toks.join(" ");
  const exact = acc.find((f) => normalise(f) === whole);
  if (exact) return { ...none, verdict: "correct", matched: exact };

  /* Before the accent rule, not after it — see `otherMarksFor`. */
  const other = otherMarksFor(whole, paradigm, acc);
  if (other) return { ...none, verdict: "otherform", matched: whole, otherMarks: other };

  const loose = acc.find((f) => stripAccents(f) === stripAccents(whole));
  if (loose) return { ...none, verdict: "accents", matched: loose };

  if (!allowHelpers) return { ...none, verdict: "wrong", helpers: toks };

  const maxLen = Math.max(...acc.map((f) => words(f).length), 1);
  const grams = ngrams(toks, maxLen);

  const hit =
    grams.find(([g]) => acc.some((f) => normalise(f) === g)) ||
    grams.find(([g]) => acc.some((f) => stripAccents(f) === stripAccents(g)));

  if (!hit) return { ...none, verdict: "wrong", helpers: toks };

  const [gram, from, to] = hit;
  const rest = toks.filter((_, i) => i < from || i >= to);

  /* Did they also write a different form of the same word? That is hedging,
     not knowing, so it is not accepted — but it is not treated as wrong
     either; the child is asked to commit to one form. */
  const hedged = [];
  if (paradigm) {
    const right = new Set(acc.map(normalise));
    const others = new Set();
    for (const forms of Object.values(paradigm))
      for (const f of [].concat(forms || [])) {
        const n = normalise(f);
        if (n && !right.has(n)) others.add(n);
      }
    rest.forEach((t) => { if (others.has(t)) hedged.push(t); });
  }
  if (hedged.length)
    return { verdict: "hedged", matched: gram, helpers: rest, hedged, otherMarks: null };

  const exactHit = acc.some((f) => normalise(f) === gram);
  /* The same precedence inside a helper phrase as outside it: a word that is
     exactly another cell of the paradigm is that cell, not a mistyping of the
     one that was asked for. */
  if (!exactHit) {
    const inner = otherMarksFor(gram, paradigm, acc);
    if (inner)
      return { verdict: "otherform", matched: gram, helpers: rest, hedged: [],
               otherMarks: inner };
  }
  return {
    verdict: exactHit ? "correct" : "accents",
    matched: gram,
    helpers: rest,
    hedged: [],
    otherMarks: null,
  };
}

/**
 * Optional agreement check on the helper words the child supplied.
 * `analyse(form)` returns candidate marks for a surface form; if none of the
 * helper words can agree with the target mark we say so, kindly, without
 * marking the answer wrong.
 */
export function agreementNote(helpers, targetAttrs, analyse) {
  if (!analyse || !helpers.length || !targetAttrs || !targetAttrs.fall) return null;
  for (const h of helpers) {
    const cands = analyse(h) || [];
    if (!cands.length) continue;
    const fits = cands.some(
      (a) => a.fall === targetAttrs.fall && (!a.tala || !targetAttrs.tala || a.tala === targetAttrs.tala)
    );
    if (!fits && cands.some((a) => a.fall))
      return `Lýsingarorðið er rétt. Athugaðu samt *${h}* — það stendur ekki í sama falli.`;
  }
  return null;
}
