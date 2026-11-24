/* Óbeygjanleg orð: atviksorð, forsetningar, samtengingar, upphrópanir.

     indecl     which class is the marked word in
     ob_smella  click every adverb, preposition or conjunction in a sentence
     ob_fsao    preposition or adverb: the same word in two roles
     ob_st      choose the conjunction (hand-written, data/exercises.js)
     ob_tengiord  choose the connective of cause, time or contrast (issue #28)
     ob_skilja    what a sentence with hvorki … né or ekki aðeins … heldur
                  einnig says (issue #28)

   The hand-written items carry a level each and are chosen near the pupil's
   band, as the sentences of the bank are (critique item 13).
     ob_flokka  sort the indeclinable words of one sentence */

import { EX } from "../../../data/exercises.js";
import { wordKey } from "../core/state.js";
import { built, FX } from "./effects.js";
import { tapTask } from "./tap.js";
import { pairOf, pick, shuffle, bandFor, levelFor, sentPool, nearBand, itemsForBand, tokenKey, tokensOf, cap1, textSentence, lexWord,
         clean, forcedItem, fresh, cellWanted } from "./shared.js";

/** The fewest items or sentences a band chooses among (critique item 23):
    ob_st and ob_flokka have too few at the low levels for a window of the
    band alone. */
const POOL_FLOOR = 150;

/* ================= Which class =========================================== */

const INDECL = { atviksorð: "ao", forsetning: "fs", samtenging: "st",
                 upphrópun: "uh", nafnháttarmerki: "nhm" };

export function taskIndecl(lex, view, rng) {
  for (let k = 0; k < 40; k++) {
    const s = pick(sentPool(lex, view, "obeygjanleg"), rng);
    const idx = s.tok.map((t, j) => (INDECL[t.c] ? j : -1)).filter((j) => j >= 0);
    if (!idx.length) continue;
    const i = pick(idx, rng);
    return built({
      type: "indecl", skill: "obeygjanleg", s, i, t: s.tok[i],
      answer: s.tok[i].c, picked: null, base: 8,
      cell: "ofl:" + s.tok[i].c, word: tokenKey(lex, s.tok[i]), lvl: s.lvl,
    });
  }
  return null;
}

/* The word first, wherever it stands in the sentence bank — a rescue drill
   (tasks/drill.js). */
export function taskIndeclWord(lex, view, rng, entry) {
  const hits = tokensOf(lex, view, entry, (t) => !!INDECL[t.c]);
  if (!hits.length) return null;
  const { s, i, t } = pick(hits, rng);
  return built({
    type: "indecl", skill: "obeygjanleg", s, i, t, answer: t.c, picked: null, base: 8,
    cell: "ofl:" + t.c, word: wordKey(entry.o, entry.c), lvl: s.lvl,
  });
}

/* ================= Click, choose and sort (v6.11) ======================== */

const INDECL_CLASSES = ["atviksorð", "forsetning", "samtenging", "nafnháttarmerki", "upphrópun"];

export const obTap = (lex, view, rng) => tapTask(lex, view, rng, "obeygjanleg", ["atviksorð", "forsetning", "samtenging"]);

/* Preposition or adverb. The bank half takes only words the bank has in
   BOTH classes, so the question is never "is *frá* a preposition". */
let BOTH = null;
function bothClasses(lex) {
  if (BOTH && BOTH.lex === lex) return BOTH.set;
  const seen = {};
  lex.sentences.forEach((s) => s.tok.forEach((t) => {
    if (t.c === "atviksorð" || t.c === "forsetning") (seen[t.l] ||= new Set()).add(t.c);
  }));
  const set = new Set(Object.keys(seen).filter((l) => seen[l].size === 2 && l !== "að"));
  BOTH = { lex, set };
  return set;
}

/** The pairs of the hand-written bank: the same word once as a preposition
    (fs) and once as an adverb (ao), in two different sentences. */
let ADVPREP_PAIRS = null;
const advPrepPairs = () => {
  if (ADVPREP_PAIRS) return ADVPREP_PAIRS;
  const out = [];
  const by = new Map();
  for (const x of EX.advPrep) { if (!by.has(x.w)) by.set(x.w, []); by.get(x.w).push(x); }
  for (const xs of by.values())
    for (const f of xs.filter((x) => x.c === "fs"))
      for (const a of xs.filter((x) => x.c === "ao")) out.push({ fs: f, ao: a, lvl: Math.max(f.lvl, a.lvl) });
  return (ADVPREP_PAIRS = out);
};

/** Forsetning eða atviksorð? Asked as a pair (item 43): the same word in two
    sentences, once in each role; right only when both are. */
export function obAdvPrep(lex, view, rng) {
  const P = view.policy;
  const OPTS = ["atviksorð", "forsetning"];
  const why = (cls, w) => cls === "forsetning"
    ? `Hér stendur *${w}* með fallorði og stýrir falli þess — það er **forsetning**.`
    : `Hér stendur *${w}* eitt; ekkert fallorð fylgir því — það er **atviksorð**.`;
  const half = (s, i, answer) => ({
    s, i, mark: true, question: `Í hvaða orðflokki er *${s.tok[i].w}* hér?`,
    options: OPTS, answer, why: why(answer, s.tok[i].w), miss: ["ao_fs"],
  });
  const head = (A, extra) => ({
    type: "choice", skill: "obeygjanleg", s: A.s, i: A.i, mark: true,
    title: "Forsetning eða atviksorð?", question: A.question,
    options: A.options, answer: A.answer, why: A.why,
    base: 9, tags: ["ofl", "ofl:ao_fs"], miss: A.miss, ...extra,
  });
  if (rng() < 0.5) {
    const pr = pick(itemsForBand(view, "obeygjanleg", advPrepPairs(), (y) => y.fs.t + y.ao.t), rng);
    const mk = (x) => {
      const { s } = textSentence(x.t);
      return half(s, s.tok.findIndex((t) => t.w.toLowerCase() === x.w), x.c === "fs" ? "forsetning" : "atviksorð");
    };
    const [A, B] = shuffle([pr.fs, pr.ao], rng).map(mk);
    return built(pairOf(head(A, { lvl: levelFor(P, pr.lvl), cell: "ofl:" + A.answer, word: null }), B),
      [FX.exSeen(pr.fs.t + pr.ao.t)]);
  }
  const both = bothClasses(lex);
  const byWord = new Map();
  lex.sentences.forEach((s) => {
    if (!P.level(s.lvl)) return;
    s.tok.forEach((t, i) => {
      if (!(both.has(t.l) && OPTS.includes(t.c) && !t.rj)) return;
      if (!byWord.has(t.l)) byWord.set(t.l, { fs: [], ao: [] });
      byWord.get(t.l)[t.c === "forsetning" ? "fs" : "ao"].push({ s, i, t });
    });
  });
  const words = [...byWord.keys()].filter((l) => byWord.get(l).fs.length && byWord.get(l).ao.length);
  if (!words.length) return null;
  /* A word both of whose halves have a sentence near the band first: chosen
     blindly, a word whose only preposition sentence is at þyngd 6 put a
     þyngd-6 pair in front of a pupil at þyngd 1 (tools/sim, 6.13). */
  const band = bandFor(view, "obeygjanleg");
  const close = (xs) => xs.some((x) => x.s.lvl <= band + 1);
  const inBand = words.filter((w) => close(byWord.get(w).fs) && close(byWord.get(w).ao));
  const l = pick(inBand.length ? inBand : words, rng);
  /* Each half by the sentence's level, like the hand-written half by its
     items' (critique item 13); item 43 asks them as a pair. */
  const near = (xs) => pick(nearBand(xs, (x) => x.s.lvl, bandFor(view, "obeygjanleg"), 1), rng);
  const [A, B] = shuffle([near(byWord.get(l).fs), near(byWord.get(l).ao)], rng)
    .map((h) => ({ ...half(h.s, h.i, h.t.c), t: h.t }));
  return built(pairOf(head(A, {
    lvl: Math.max(A.s.lvl, B.s.lvl), cell: "ofl:" + A.answer,
    word: lexWord(lex, A.t.l, A.t.c === "forsetning" ? "fs" : "ao"),
  }), B));
}

/** Choose the conjunction: every wrong option makes the sentence wrong. */
export function obConj(lex, view, rng) {
  const P = view.policy;
  /* The hand-written items and the generated contrast sets (critique item
     23), the nearest 150 to the band at least; a review asks for the very
     item (`force.item`). */
  const want = forcedItem(view);
  const items = want ? EX.conjunction.filter((y) => y.t === want) : EX.conjunction;
  if (!items.length) return null;
  const x = pick(want ? items : itemsForBand(view, "obeygjanleg", items, (y) => y.t, POOL_FLOOR), rng);
  const { s, i } = textSentence(x.t);
  const cap = i === 0;
  const fix = (f) => (cap ? cap1(f) : f);
  return built({
    type: "choice", skill: "obeygjanleg", s, i,
    title: "Veldu samtenginguna", question: "Hvaða samtenging passar í eyðuna?",
    options: shuffle([x.a, ...x.w], rng).map(fix), answer: fix(x.a), why: x.why,
    base: 8, lvl: levelFor(P, x.lvl), cell: "ofl:samtenging", word: lexWord(lex, x.a, "st"),
    item: x.t, tags: ["conj"], miss: ["samtengingar"],
  }, [FX.exSeen(x.t)]);
}

/* ================= Connectives (issue #28, docs/DLD-PLAN.md §3) ==========
 *
 * Two types on hand-written, reviewed items only (content/obeygjanleg/
 * tengiord.tsv, tengiord-skilningur.tsv), written for pupils with
 * developmental language disorder: short everyday sentences, one option that
 * fits by meaning and by word order, and beside every wrong option the
 * reason it fails (`whyNot`), which the pupil who picks it reads.
 *
 * Neither follows the band. The lists are a few dozen sentences of one to
 * three lines' difficulty; a window by level would leave a pupil ten of them.
 * The item's level is still its label, and a curriculum that closes a level
 * closes its items. */

/** The item a review asks for, or one this pupil may meet and has not just
    seen; with a cell forced (a review, a duel), an item of that cell or
    nothing. @template {{t: string, lvl: number}} T
    @param {import("../types").View} view @param {T[]} items
    @param {(x: T) => string} cellOf @param {() => number} rng @returns {?T} */
function reviewedItem(view, items, cellOf, rng) {
  const want = forcedItem(view);
  if (want) return items.find((y) => y.t === want) || null;
  const mine = items.filter((y) => cellWanted(view, cellOf(y)));
  const allowed = mine.filter((y) => view.policy.level(y.lvl));
  const pool = fresh(view, (y) => y.t, allowed.length ? allowed : mine);
  return pool.length ? pick(pool, rng) : null;
}

/** Choose the connective: af því að, þess vegna, þegar, síðan or en. The
    cell is the connective that fits, so a review of one that was missed
    brings another sentence with the same one. */
const connectiveCell = (x) => "tengi:" + x.a;
export function obConnective(lex, view, rng) {
  const x = reviewedItem(view, EX.connective, connectiveCell, rng);
  if (!x) return null;
  const { s, i } = textSentence(x.t);
  /* first in the sentence — also in the second of two (*… bilaði. Þess vegna …*) */
  const cap = i === 0 || /^[.!?]$/.test(s.tok[i - 1].w);
  const fix = (f) => (cap ? cap1(f) : f);
  const whyNot = {};
  x.w.forEach((o) => { whyNot[fix(o)] = x.no[o]; });
  return built({
    type: "choice", skill: "obeygjanleg", s, i,
    title: "Veldu tengiorðið", question: "Hvaða orð passar í eyðuna?",
    options: shuffle([x.a, ...x.w], rng).map(fix), answer: fix(x.a), why: x.why, whyNot,
    base: 8, lvl: levelFor(view.policy, x.lvl), cell: connectiveCell(x), word: null,
    item: x.t, tags: ["tengi"], miss: ["tengiord"],
  }, [FX.exSeen(x.t)]);
}

/** What does the sentence say? *Hvorki A né B*, *ekki aðeins A heldur einnig
    B* and, beside them, *ekki A heldur B* and *A en ekki B*. The four answers
    stand in the same order every time — only the first, only the second,
    both, neither — so that the reading is of the sentence and not of the
    buttons. The cell is the pair of connectives the sentence is built on. */
const senseCell = (x) => "skilja:" + (/hvorki/.test(x.t) ? "hvorki" : /ekki aðeins/.test(x.t) ? "ekki-adeins"
  : / en ekki /.test(x.t) ? "en-ekki" : "ekki-heldur");
export function obSense(lex, view, rng) {
  const x = reviewedItem(view, EX.connectiveSense, senseCell, rng);
  if (!x) return null;
  const { s } = textSentence(x.t);
  const only = [x.a, ...x.w].filter((o) => o.startsWith("bara "))
    .sort((a, b) => x.t.indexOf(a.slice(5)) - x.t.indexOf(b.slice(5)));
  return built({
    type: "choice", skill: "obeygjanleg", s, i: -1,
    title: "Hvað segir setningin?", question: x.q,
    options: [...only, "bæði", "hvorugt"], answer: x.a, why: x.why, whyNot: x.no,
    base: 8, lvl: levelFor(view.policy, x.lvl), cell: senseCell(x), word: null,
    item: x.t, tags: ["tengi"], miss: ["tengiord"],
  }, [FX.exSeen(x.t)]);
}

/* Sort words into classes: the words of one sentence, which settles what
   each one is. */
/* The words of a sentence that may be sorted: at least three indeclinable
   words of at least two classes. The same word twice (*að … að*) would leave
   the child guessing which row is which: only its first occurrence is
   asked. Null when the sentence has too few. */
function sortable(s) {
  const idx = s.tok.map((t, j) => (INDECL_CLASSES.includes(t.c) ? j : -1)).filter((j) => j >= 0);
  const kinds = new Set(idx.map((j) => s.tok[j].c));
  if (idx.length < 3 || kinds.size < 2) return null;
  const once = idx.filter((j, k) => idx.findIndex((x) => s.tok[x].w.toLowerCase() === s.tok[j].w.toLowerCase()) === k);
  return once.length < 3 ? null : once;
}
let SORTABLE = null;
const sortableSentences = (lex) => {
  if (!SORTABLE || SORTABLE.lex !== lex) SORTABLE = { lex, list: lex.sentences.filter((s) => clean(s) && sortable(s)) };
  return SORTABLE.list;
};

export function obSort(lex, view, rng) {
  const P = view.policy;
  /* The sentences near the band (critique item 13: until v6.13 any sentence
     of the bank, level 1 or 5, at every band) — the nearest 150 at least
     (critique item 23). A short sentence seldom holds three indeclinable
     words: the bank has about thirty at levels 1-3, and a window of twelve
     gave a pupil the same thirty sentences week after week. So a low band
     reaches up to the longer sentences until it has 150 to choose from,
     and the higher bands keep to their own levels. */
  const pool = nearBand(sortableSentences(lex).filter((s) => P.level(s.lvl)), (s) => s.lvl,
    bandFor(view, "obeygjanleg"), POOL_FLOOR);
  for (let k = 0; k < 60; k++) {
    const s = pick(pool, rng);
    if (!s) return null;
    const once = sortable(s);
    if (!once) continue;
    const items = once.slice(0, 5).map((j) => ({ w: s.tok[j].w, j, cls: s.tok[j].c }));
    return built({
      type: "sort", skill: "obeygjanleg", s, items, buckets: INDECL_CLASSES,
      title: "Flokkaðu óbeygjanlegu orðin",
      question: "Í hvaða orðflokki er hvert undirstrikað orð?",
      base: 4 + 2 * items.length, lvl: s.lvl, cell: "sort:obeygjanleg", word: null,
      tags: ["ofl", "ofl:ao_fs"],
    });
  }
  return null;
}

/** The builders of this category, by question type id. What each type is —
   its name, renderer, tags, bands and weight — is declared in
   core/catalogue.js; tasks/registry.js joins the two.
   @type {Record<string, import("../types").Builder>} */
export const BUILDERS = {
  indecl: { build: taskIndecl, drill: taskIndeclWord },
  ob_smella: { build: obTap },
  ob_fsao: { build: obAdvPrep },
  ob_st: { build: obConj },
  ob_flokka: { build: obSort },
  ob_tengiord: { build: obConnective },
  ob_skilja: { build: obSense },
};
