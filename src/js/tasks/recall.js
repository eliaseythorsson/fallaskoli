/* Recall in a sentence gap (issue #14, docs/DLD-PLAN.md §1 "The intensive
   phase"): one of the pupil's words in learning is taken out of a sentence
   and the pupil types it — first with its first letter shown, then without.
   The first question type that is RECALL (CONTEXT.md): the word is produced,
   not seen. Filed under Orðaforði as `or_eyda` (tasks/ordaford.js BUILDERS).

   The pupil is told one thing: "one of your words is missing here". The
   words are the ones under *Orðin mín*; that is what makes a gap have ONE
   answer, and everything below follows from it.

   ---- which word -----------------------------------------------------------

   A word in learning (core/wordknowledge.js `wordsInLearning`) that has a
   sentence it can be asked in now. The view chooses among them
   (`view.pickWord`, tasks/view.js), so the spacing rule (#10) and whatever
   #13 does to the weights reach this type too. A review or a drill that
   asks for one word (`mustAsk`, strict) gets it if it is in learning or
   learned, and nothing otherwise. A pupil with no such word is built no
   question: the type is silent in a duel (built against a blank pupil), and
   for a pupil none of whose six words stands in a usable sentence yet.
   Without a word in learning it is not even drawn (`recallReady`), so a
   seed gives a duel the questions it gave before this type existed.

   No definition is shown. The lexicon keeps only a word's FIRST dictionary
   sense, and a bank sentence may mean another (*heimild* "leyfi, réttur"
   beside *leita að heimildum*): the v6.13 review (M1) took such a line out
   of "Orð í samhengi", and it is not put back here.

   ---- which sentences (`recallGaps`) ---------------------------------------

   From the sentence bank only, in two ways:
     1  a sentence written with the word, at a token the lexicon confirms
        (`lex.occurrencesOf`: the mark is BÍN's and the form is one of BÍN's
        forms for it); an adverb has no mark and is taken by its lemma;
     2  for a noun, a frame whose slot takes it (tasks/frames.js: by its
        class, or by name from content/setningar/lino-rammar.tsv), with the
        BÍN form of the frame's mark — the sentences the cloze shows.

   A sentence is NOT used when
     - the word stands in it twice — as itself, as another of its forms, or
       inside a compound (*hlaup* beside *hlaupa*): the sentence would give
       the answer away or have two gaps' worth of it;
     - the case could not be settled by the parse (`u` has "fall"), or the
       case after the preposition depends on what is meant (`nf`);
     - the answer would be more than one word;
     - the grammar rules below cannot say which forms are right there.

   ---- which forms are right (`gapForms`) ------------------------------------

   The gap asks for the form the sentence was written with: that form (and
   BÍN's variants of the same cell) is the answer shown. But the pupil sees
   no instruction about number, article, tense or degree, as a cloze gives,
   so every other form of the word that is equally right IN THAT SENTENCE
   must count as right too — a right answer is never marked wrong. Where the
   sentence fixes a feature, only the sentence's value is right; where it
   cannot be told, the sentence is left out. Being generous can only accept
   a form that is odd there (and the verdict still shows the sentence as it
   was written); being strict would mark a pupil wrong who was right.

   NOUNS — the case is always the sentence's. Of the four forms of that case
   (singular/plural × with/without the article), all are right, except:
     - an adjective right before it that agrees with it fixes both number
       and article (*góðrar heilsu*, never *góðrar heilsunnar*): only the
       sentence's cell;
     - a pronoun, numeral or article right before it that agrees, or a
       possessive or a genitive pronoun right after it: whether the noun
       then takes the article depends on the word (*allar hugmyndirnar* and
       *margar hugmyndir*, *bókin mín* and *mamma mín*) — the sentence is
       LEFT OUT;
     - a genitive noun right after a noun without the article (*upphaf
       dagsins*, *mikilvægi vináttu*) keeps it without (never *upphafið
       dagsins*); if the parse calls the gap an indirect object the two
       nouns are not one phrase (*óska strák gengis*) and the sentence is
       left out;
     - a nominative subject or predicate takes the number of its verb when
       the nearest third-person verb of that number shows it (*hugmyndin
       skiptir*, *hugmyndirnar skipta*). A verb that looks the same in both
       numbers (*að tillagan komi*) fixes nothing.
   So in *Ég sagði frá ___* (breytingunni), *breytingu*, *breytingum* and
   *breytingunum* are right as well.

   VERBS — active voice only (a middle form is often another meaning:
   *safna* and *safnast*). The infinitive and the supine are fixed. A finite
   form keeps its person and number (the subject fixes them); the other
   tense is right too (nothing says "í gær"), and in a subordinate clause the
   other mood as well (*áður en mótið hefst / hæfist*). In a main clause an
   indicative stays indicative. Imperatives and participles that decline
   are left out.

   ADJECTIVES — the positive degree only, where gender, case, number and
   strong/weak are all fixed by the noun. The comparative of the same cell
   is right too (*frægur / frægari skákmaður*), and so is the superlative
   where it stands the same way: strong as a predicate (*varð frægastur*),
   weak before a noun with the article (*stóra / stærsta bókin*). A sentence
   whose adjective is itself compared is left out (*strangari en …* takes
   nothing else).

   ADVERBS — the word as it stands.

   ---- no other word fits as well (`rivalsOf`) --------------------------------

   The program cannot judge meaning, so it assumes the worst: any OTHER word
   the pupil has in learning, of the same word class (noun, verb, adjective,
   adverb), would fit the gap as well. (Gender is not used to rule a noun
   out: a frame's `rk` pins a gender on a coincidence too, the build says,
   and an adjective's form is often the same in two genders.)
     - WITHOUT the letter, a gap is used only if the word has no rival.
     - WITH the letter, only if no rival has a form that begins with it.
     - Otherwise the sentence is not used for that word now.
   A word that has earned the question without the letter but has a rival is
   asked with the letter: unambiguous comes first. In practice a pupil with
   three nouns among the six meets the nouns with the letter until one of
   them is learned; a lone verb, adjective or adverb loses it at once.

   ---- with the letter, or without (`recallStage`) ----------------------------

   Read from the word's entries in Word knowledge: its judged answers in
   recall types (`isRecallEntry`). The two constants are below.

   Like every builder this is pure: build(lex, view, rng) → { task, effects }
   or null. Showing the question marks its sentence as used this session
   (`FX.frame`), and a sentence is not used twice in one.                    */

import { normalise } from "../core/grading.js";
import { wordKey } from "../core/state.js";
import { entriesOf, isRecallEntry, isJudged, RIGHT, WRONG, wordsInLearning, wordsLearned,
         LEARNING_SKILL, LEARNING_CLASSES } from "../core/wordknowledge.js";
import { built, FX } from "./effects.js";
import { frameIndex, acceptsNoun, fillFrame, frameKey, sharesStem } from "./frames.js";
import { pick, askable, bandFor, levelFor, cap1, forcedCell } from "./shared.js";

/* ---------- the constants ---------------------------------------------------- */

/** The first letter is shown until the pupil has typed the word right this
    many times in a recall question. ONE: the plan asks for "first-letter
    hint, then none", and the learned rule (four question types, one of them
    recall, two days) leaves room for only a few recall questions per word —
    with two the question without the letter would often never come. One
    right answer with the letter is the proof the form is within reach. */
export const LETTER_UNTIL_RIGHT = 1;

/** The letter comes back when the last this-many judged recall answers
    about the word were all wrong, and goes again with the next right one.
    ONE: retrieval that fails teaches less than retrieval that succeeds with
    help (DLD-RESEARCH: retrieval WITH feedback; more trials, not harder
    ones), so a single miss without the letter is answered with the letter
    next time rather than with the same bare gap again. */
export const LETTER_BACK_AFTER = 1;

/** What an answer is filed under in the cell records. One key for every
    form: a miss here says the word was not recalled, not that a case is
    weak, so it must not send the cloze after the dative. */
export const RECALL_CELL = "orð:eyða";

/* The Icelandic the pupil reads. */
const ASK = "Hvaða orð vantar? Það er eitt af orðunum þínum.";
const letterLine = (letter) => `Það byrjar á **${letter}**.`;

/* ---------- with the letter, or without --------------------------------------- */

/**
 * How far along the word is: "letter" (the first letter is shown) or "bare".
 * Pure; reads the word's entries only.
 * @param {import("../types").State} S @param {string} word  a `wordKey`
 * @returns {"letter"|"bare"}
 */
export function recallStage(S, word) {
  const tries = entriesOf(S, word).filter((e) => isRecallEntry(e) && isJudged(e));
  if (tries.filter((e) => e.outcome === RIGHT).length < LETTER_UNTIL_RIGHT) return "letter";
  const last = tries.slice(-LETTER_BACK_AFTER);
  return last.length === LETTER_BACK_AFTER && last.every((e) => e.outcome === WRONG) ? "letter" : "bare";
}

/* ---------- which forms are right in a gap ------------------------------------ */

const NOUN = new Set(["kk", "kvk", "hk"]);
/** Noun, verb, adjective or adverb: what "the same word class" means for a rival. */
const broadClass = (c) => (NOUN.has(c) ? "no" : c);

const CELL_RE = /^(NF|ÞF|ÞGF|EF)(ET|FT)(gr)?$/;
/** The case and number a token's mark ends in (a noun's whole mark, the last
    part of an adjective's or a pronoun's), or null. */
function caseCell(tok) {
  const mm = tok && tok.m ? CELL_RE.exec(String(tok.m).split("-").pop()) : null;
  return mm ? { fall: mm[1], tala: mm[2], gr: !!mm[3] } : null;
}

/** Words that stand before a noun and agree with it, and after which the
    article depends on the word. */
const DETERMINER = new Set(["fornafn", "töluorð", "greinir"]);

const FINITE_3P = /^(?:GM|MM)-(?:FH|VH)-(?:NT|ÞT)-3P-(ET|FT)$/;

/** Does the verb nearest the token at `i` — third person, of number `tala` —
    look different in the other number? Then it fixes the number of its
    subject or predicate. */
function verbShowsNumber(lex, s, i, tala) {
  let best = null;
  s.tok.forEach((v, j) => {
    const mm = v.c === "sagnorð" && v.m && !v.rj ? FINITE_3P.exec(v.m) : null;
    if (!mm || mm[1] !== tala) return;
    const d = Math.abs(j - i) - (j > i ? 0.5 : 0);         // of two as near, the one after
    if (!best || d < best.d) best = { v, d };
  });
  if (!best || (best.v.u || []).some((f) => f === "tala" || f === "persóna")) return false;
  const entry = lex.entryForToken(best.v);
  const other = entry && entry.forms[best.v.m.replace(/(ET|FT)$/, tala === "ET" ? "FT" : "ET")];
  return !!other && !other.some((f) => normalise(f) === normalise(best.v.w));
}

/** The cells of a noun that are right at `i`, the sentence's own first; null
    when the sentence cannot be used. */
function nounCells(lex, s, i) {
  const t = s.tok[i];
  const own = caseCell(t);
  if (!own || (t.u || []).includes("fall")) return null;
  const prev = s.tok[i - 1], next = s.tok[i + 1];
  const p = caseCell(prev), n = caseCell(next);
  if (prev && DETERMINER.has(prev.c) && p && p.fall === own.fall) return null;
  if (next && next.c === "fornafn" && n && (n.fall === own.fall || n.fall === "EF")) return null;
  let numbers = ["ET", "FT"], articles = ["", "gr"];
  if (prev && prev.c === "lýsingarorð" && p && p.fall === own.fall) {
    numbers = [own.tala]; articles = [own.gr ? "gr" : ""];
  }
  if (!own.gr && next && next.c === "nafnorð" && n && n.fall === "EF") {
    if (t.r === "óbeint andlag") return null;
    articles = [""];
  }
  if (numbers.length > 1 && own.fall === "NF" && (t.r === "frumlag" || t.r === "sagnfylling")
      && !(t.u || []).includes("tala") && verbShowsNumber(lex, s, i, own.tala)) numbers = [own.tala];
  const cells = [t.m];
  for (const num of numbers) for (const art of articles) {
    const m = own.fall + num + art;
    if (m !== t.m) cells.push(m);
  }
  return cells;
}

function adjectiveCells(s, i) {
  const t = s.tok[i];
  const [degree, ...rest] = String(t.m).split("-");
  if (rest.length !== 2 || (degree !== "FSB" && degree !== "FVB")) return null;
  if ((t.u || []).some((f) => f !== "tala")) return null;
  const cell = rest.join("-");
  const cells = [t.m, `MST-${cell}`];
  if (degree === "FVB") cells.push(`EVB-${cell}`);
  else if (t.r === "sagnfylling") cells.push(`ESB-${cell}`);
  return cells;
}

function verbCells(s, i) {
  const t = s.tok[i];
  if (t.m === "GM-NH" || t.m === "GM-SAGNB") return [t.m];
  const mm = /^GM-(FH|VH)-(NT|ÞT)-([123]P-(?:ET|FT))$/.exec(String(t.m));
  if (!mm) return null;
  const [, mood, , who] = mm;
  const moods = t.k === "aðalsetning" && mood === "FH" ? ["FH"] : ["FH", "VH"];
  const cells = [t.m];
  for (const h of moods) for (const tense of ["NT", "ÞT"]) {
    const m = `GM-${h}-${tense}-${who}`;
    if (m !== t.m) cells.push(m);
  }
  return cells;
}

/** Every form of a word, as typed (lower case), with its lemma. */
const FORMS = new WeakMap();
function formsOf(w) {
  let set = FORMS.get(w);
  if (!set) {
    set = new Set([normalise(w.o), ...Object.values(w.forms || {}).flat().map(normalise)].filter(Boolean));
    FORMS.set(w, set);
  }
  return set;
}

/** Does the word stand in the sentence only at `i`? Not as itself, not as
    another of its forms, not inside a compound. */
const standsOnce = (s, i, w) => !s.tok.some((x, j) => j !== i && x.l
  && (x.l === w.o || sharesStem(x.l, w.o) || formsOf(w).has(normalise(x.w))));

/**
 * The forms of `w` that are right in the gap at token `i` of `s`: see "which
 * forms are right" at the top. Pure.
 * @returns {?{m: ?string, answers: string[]}}  `answers[0]` is the form the
 *   sentence has; `m` its BÍN mark (null for an adverb). Null: the sentence
 *   is not used.
 */
export function gapForms(lex, s, i, w) {
  const t = s && s.tok[i];
  if (!t || !w || t.rj || /\s/.test(t.w) || !standsOnce(s, i, w)) return null;
  if (i === s.slot && s.nf) return null;
  const typed = normalise(t.w);
  if (w.c === "ao") {
    if (t.c !== "atviksorð" || !formsOf(w).has(typed)) return null;
    return { m: null, answers: [typed] };
  }
  if (!t.m || !(w.forms[t.m] || []).some((f) => normalise(f) === typed)) return null;
  const cells = NOUN.has(w.c) ? nounCells(lex, s, i) : w.c === "lo" ? adjectiveCells(s, i)
    : w.c === "so" ? verbCells(s, i) : null;
  if (!cells) return null;
  /* The sentence's own form first, then BÍN's variants of its cell, then the
     other cells that are right here. */
  const answers = [typed];
  for (const m of cells) for (const f of w.forms[m] || []) {
    const k = normalise(f);
    if (k && !/\s/.test(k) && !answers.includes(k)) answers.push(k);
  }
  return { m: t.m, answers };
}

/* ---------- the sentences a word can be asked in ------------------------------- */

/** @typedef {{s: any, i: number, m: ?string, answers: string[], lvl: number,
               key: string}} RecallGap */

const GAPS = new WeakMap();        // lexicon -> Map(wordKey -> RecallGap[])

/**
 * Every gap `w` can be asked in, whatever the pupil and the policy: see
 * "which sentences" at the top. Worked out once per lexicon and word.
 * `key` is the bank sentence's key (frames.js `frameKey`).
 * @returns {RecallGap[]}
 */
export function recallGaps(lex, w) {
  let byWord = GAPS.get(lex);
  if (!byWord) GAPS.set(lex, (byWord = new Map()));
  const id = wordKey(w.o, w.c);
  const hit = byWord.get(id);
  if (hit) return hit;
  /** @type {RecallGap[]} */
  const out = [];
  /* Two frames can read the same once the word is in them (*Ég sagði frá
     ___ í gær* was written with two nouns): one gap, the first. */
  const texts = new Set();
  const add = (s, i, bank) => {
    const f = !texts.has(s.t + "\t" + i) && gapForms(lex, s, i, w);
    texts.add(s.t + "\t" + i);
    if (f) out.push({ s, i, m: f.m, answers: f.answers, lvl: bank.lvl, key: frameKey(bank) });
  };
  if (w.c === "ao") {
    for (const s of lex.sentences || [])
      s.tok.forEach((t, i) => { if (t.c === "atviksorð" && lex.entryForToken(t) === w) add(s, i, s); });
  } else {
    for (const o of lex.occurrencesOf(w.o, w.c)) add(o.s, o.i, o.s);
  }
  if (NOUN.has(w.c)) {
    for (const [m, frames] of frameIndex(lex).noun) {
      if (!w.forms[m]) continue;
      for (const f of frames) {
        /* A frame written with this very noun is a sentence of the first kind. */
        if (f.s.nf || lex.entryForToken(f.s.tok[f.i]) === w || !acceptsNoun(f, w, m)) continue;
        add(fillFrame(f, w, w.forms[m][0]), f.i, f.s);
      }
    }
  }
  byWord.set(id, out);
  return out;
}

/* ---------- no other word fits as well ------------------------------------------ */

/** The pupil's other words in learning of the same word class as `w`, as
    lexicon entries: the words that might fit a gap of `w` as well. */
export function rivalsOf(lex, S, w) {
  const mine = wordKey(w.o, w.c);
  return wordsInLearning(S).filter((k) => k !== mine).map((k) => entryOf(lex, k))
    .filter((o) => o && broadClass(o.c) === broadClass(w.c));
}

const entryOf = (lex, key) => {
  const at = String(key).lastIndexOf("|");
  return at > 0 ? lex.lookup(key.slice(0, at), key.slice(at + 1)) : null;
};

const firstLetter = (form) => [...String(form)][0].toLowerCase();

/** How this gap may be asked given the rivals: "bare", "letter" or null. */
function stageFor(gap, rivals, wanted) {
  if (wanted === "bare" && !rivals.length) return "bare";
  const letter = firstLetter(gap.answers[0]);
  return rivals.some((o) => [...formsOf(o)].some((f) => f.startsWith(letter))) ? null : "letter";
}

/* ---------- the builder -------------------------------------------------------- */

/** The gaps of `w` this pupil can be asked now, each with its stage. */
function gapsNow(lex, view, w) {
  const P = view.policy;
  const used = new Set(view.sess.frames || []);
  const avoid = (view.force && view.force.avoid) || null;
  const rivals = rivalsOf(lex, view.S, w);
  const wanted = recallStage(view.S, wordKey(w.o, w.c));
  const out = [];
  for (const g of recallGaps(lex, w)) {
    if (!P.level(g.lvl) || used.has(g.key) || (avoid && g.s.t === avoid)) continue;
    if (g.m && !askable(P, g.m)) continue;
    const stage = stageFor(g, rivals, wanted);
    if (stage) out.push({ g, stage, wanted: stage === wanted });
  }
  return out;
}

/** Can anything be built for this pupil at all? Not without a word in
    learning, unless one is asked for by name (tasks/registry.js `ready`). */
export const recallReady = (view) => wordsInLearning(view.S).length > 0 || !!view.askedWord();

export function recallGap(lex, view, rng) {
  const cell = forcedCell(view);
  if (cell && cell !== RECALL_CELL) return null;
  const { S } = view;
  /* A word asked for by name may also be one already learned. */
  const asked = view.askedWord();
  const keys = asked ? [...wordsInLearning(S), ...wordsLearned(S)].filter((k) => k === wordKey(asked.o, asked.c))
    : wordsInLearning(S);
  const now = new Map();          // wordKey -> { w, gaps }
  for (const k of keys) {
    const w = entryOf(lex, k);
    if (!w || !LEARNING_CLASSES.has(w.c)) continue;
    const gaps = gapsNow(lex, view, w);
    if (gaps.length) now.set(wordKey(w.o, w.c), { w, gaps });
  }
  const got = view.pickWord(lex, [...now.values()].map((x) => x.w), LEARNING_SKILL, rng, [...LEARNING_CLASSES]);
  const chosen = got && now.get(wordKey(got.o, got.c));
  if (!chosen) return null;
  const { w } = chosen;
  /* The stage the word has earned if a sentence allows it; then a sentence
     no harder than the session's level, or the easiest there is. */
  let pool = chosen.gaps;
  if (pool.some((x) => x.wanted)) pool = pool.filter((x) => x.wanted);
  const band = bandFor(view, LEARNING_SKILL);
  const low = Math.max(band, Math.min(...pool.map((x) => x.g.lvl)));
  const { g, stage } = pick(pool.filter((x) => x.g.lvl <= low), rng);

  const cap = /^\p{Lu}/u.test(g.s.tok[g.i].w);
  const letter = firstLetter(g.answers[0]);
  return built({
    type: "gap", skill: LEARNING_SKILL, s: g.s, i: g.i, cue: null,
    answers: cap ? g.answers.map(cap1) : g.answers, m: g.m, paradigm: g.m ? w.forms : null,
    title: "Orð í eyðu", stage,
    hint: stage === "letter" ? `${ASK} ${letterLine(letter)}` : ASK,
    /* After the answer, under the sentence with the right form in it: the
       word itself, labelled "orðið". A second try must not be shown it
       (ui/render-more.js `submitGap`), so it gets the letter instead — or,
       when the letter was there from the start, nothing more. */
    why: `*${w.o}*`, whyLabel: "orðið",
    retryWhy: stage === "letter" ? null : letterLine(letter),
    base: 10, lvl: levelFor(view.policy, g.lvl), cell: RECALL_CELL, word: wordKey(w.o, w.c), cap,
  }, [FX.frame(g.key)]);
}
