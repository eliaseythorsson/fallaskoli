/* Óbeygjanleg orð: atviksorð, forsetningar, samtengingar, upphrópanir.

     indecl     which class is the marked word in
     ob_smella  click every adverb, preposition or conjunction in a sentence
     ob_fsao    preposition or adverb: the same word in two roles
     ob_st      choose the conjunction (hand-written, data/exercises.js)
     ob_flokka  sort the indeclinable words of one sentence */

import { EX } from "../../../data/exercises.js";
import { wordKey } from "../core/state.js";
import { built, FX } from "./effects.js";
import { tapTask } from "./tap.js";
import { pairOf, pick, shuffle, levelFor, sentPool, tokenKey, tokensOf, cap1, textSentence, fresh, lexWord,
         clean } from "./shared.js";

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
      for (const a of xs.filter((x) => x.c === "ao")) out.push({ fs: f, ao: a });
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
    const pr = pick(fresh(view, (y) => y.fs.t + y.ao.t, advPrepPairs()), rng);
    const mk = (x) => {
      const { s } = textSentence(x.t);
      return half(s, s.tok.findIndex((t) => t.w.toLowerCase() === x.w), x.c === "fs" ? "forsetning" : "atviksorð");
    };
    const [A, B] = shuffle([pr.fs, pr.ao], rng).map(mk);
    return built(pairOf(head(A, { lvl: levelFor(P, 2), cell: "ofl:" + A.answer, word: null }), B),
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
  const l = pick(words, rng);
  const [A, B] = shuffle([pick(byWord.get(l).fs, rng), pick(byWord.get(l).ao, rng)], rng)
    .map((h) => ({ ...half(h.s, h.i, h.t.c), t: h.t }));
  return built(pairOf(head(A, {
    lvl: Math.max(A.s.lvl, B.s.lvl), cell: "ofl:" + A.answer,
    word: lexWord(lex, A.t.l, A.t.c === "forsetning" ? "fs" : "ao"),
  }), B));
}

/** Choose the conjunction: every wrong option makes the sentence wrong. */
export function obConj(lex, view, rng) {
  const P = view.policy;
  const x = pick(fresh(view, (y) => y.t, EX.conjunction), rng);
  const { s, i } = textSentence(x.t);
  const cap = i === 0;
  const fix = (f) => (cap ? cap1(f) : f);
  return built({
    type: "choice", skill: "obeygjanleg", s, i,
    title: "Veldu samtenginguna", question: "Hvaða samtenging passar í eyðuna?",
    options: shuffle([x.a, ...x.w], rng).map(fix), answer: fix(x.a), why: x.why,
    base: 8, lvl: levelFor(P, 2), cell: "ofl:samtenging", word: lexWord(lex, x.a, "st"),
    tags: ["conj"], miss: ["samtengingar"],
  }, [FX.exSeen(x.t)]);
}

/* Sort words into classes: the words of one sentence, which settles what
   each one is. */
export function obSort(lex, view, rng) {
  const P = view.policy;
  const pool = lex.sentences.filter((s) => P.level(s.lvl) && clean(s));
  for (let k = 0; k < 60; k++) {
    const s = pick(pool, rng);
    if (!s) return null;
    const idx = s.tok.map((t, j) => (INDECL_CLASSES.includes(t.c) ? j : -1)).filter((j) => j >= 0);
    const kinds = new Set(idx.map((j) => s.tok[j].c));
    if (idx.length < 3 || kinds.size < 2) continue;
    /* The same word twice (*að … að*) would leave the child guessing which
       row is which: only its first occurrence is asked. */
    const once = idx.filter((j, k) => idx.findIndex((x) => s.tok[x].w.toLowerCase() === s.tok[j].w.toLowerCase()) === k);
    if (once.length < 3) continue;
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

export const TYPES = [
  { id: "indecl", skill: "obeygjanleg", weight: 5, renderer: "indecl",
    tags: ["ofl", "ofl:ao_fs"],
    bands: [1, 2, 3, 4, 5, 6, 7],
    build: taskIndecl, drill: taskIndeclWord },
  { id: "ob_smella", skill: "obeygjanleg", weight: 4, renderer: "tap",
    tags: ["ofl", "ofl:ao_fs"],
    bands: [1, 2, 3, 4, 5, 6],
    build: obTap },
  { id: "ob_fsao", skill: "obeygjanleg", weight: 4, renderer: "choice",
    tags: ["ofl", "ofl:ao_fs"],
    bands: [1],
    build: obAdvPrep },
  { id: "ob_st", skill: "obeygjanleg", weight: 4, renderer: "choice",
    tags: ["conj"],
    bands: [1],
    build: obConj },
  { id: "ob_flokka", skill: "obeygjanleg", weight: 3, renderer: "sort",
    tags: ["ofl", "ofl:ao_fs"],
    bands: [1],
    build: obSort },
];
