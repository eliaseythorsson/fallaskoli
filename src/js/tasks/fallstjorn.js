/* Fallstjórn: hvaða falli sögn eða forsetning stýrir.

     govern      which case does the marked verb or preposition govern
     fs_fsno     the noun cloze right after a preposition (tasks/cloze.js)
     fs_hreyf    í/á: motion (þolfall) or rest (þágufall)
     fs_sogn     a noun written in the case its verb governs
     fs_operson  the subject of an impersonal verb ("___ (ég) langar í ís")

   The last three are hand-written items (data/exercises.js). */

import { EX } from "../../../data/exercises.js";
import { wordKey } from "../core/state.js";
import { built, FX } from "./effects.js";
import { nounCloze } from "./cloze.js";
import { pairOf, pick, shuffle, levelFor, tokenKey, tokensOf, cap1, caseWord, textSentence, fresh,
         lexWord, headsTimePhrase } from "./shared.js";

const CASEWORD = { þf: "ÞF", þgf: "ÞG", ef: "EF" };

/* ================= Which case ============================================ */

export function taskGovern(lex, view, rng) {
  const P = view.policy;
  const cands = [];
  lex.sentences.filter((s) => P.level(s.lvl)).forEach((s) =>
    s.tok.forEach((t, i) => {
      /* Verbs: only government the guard confirmed against government.py, and
         only when it is unambiguous (a single governed case). */
      if (t.c === "sagnorð" && t.g && t.g.length === 1) cands.push({ s, i, t });
      /* Prepositions: `pg` is set during the build and only where the case is
         confirmed — either by the table (a preposition governing one case) or by
         an unambiguous surface form. This used to be read off the next mark,
         which meant a preposition governing two cases could produce a wrong
         question whenever the form was ambiguous. */
      if (t.c === "forsetning" && t.pg && !headsTimePhrase(lex, s, i)) {
        cands.push({ s, i, t, fall: CASEWORD[t.pg] });
      }
    })
  );
  if (!cands.length) return null;
  const c = pick(cands, rng);
  const fall = c.fall || CASEWORD[c.t.g[0]];
  if (!fall) return null;
  return built({
    type: "govern", skill: "fallstjorn", ...c, fall, picked: null,
    base: 10, cell: "stjórn:" + c.t.l, word: tokenKey(lex, c.t), lvl: c.s.lvl,
  });
}

/* The word first, wherever it stands in the sentence bank — a rescue drill
   (tasks/drill.js). */
export function taskGovernWord(lex, view, rng, entry) {
  const hits = tokensOf(lex, view, entry, (t) =>
    (t.c === "sagnorð" && t.g && t.g.length === 1) || (t.c === "forsetning" && t.pg))
    .filter((h) => !headsTimePhrase(lex, h.s, h.i));
  if (!hits.length) return null;
  const c = pick(hits, rng);
  const fall = c.t.c === "forsetning" ? CASEWORD[c.t.pg] : CASEWORD[c.t.g[0]];
  if (!fall) return null;
  return built({
    type: "govern", skill: "fallstjorn", ...c, fall, picked: null,
    base: 10, cell: "stjórn:" + c.t.l, word: wordKey(entry.o, entry.c), lvl: c.s.lvl,
  });
}

/* ================= In a sentence (v6.11) ================================= */

/** Preposition + noun in the right case: the cloze, only where the slot
    stands right after a preposition whose case the build confirmed. */
export function fsPrepNoun(lex, view, rng) {
  const only = (s, i) => {
    const p = s.tok[i - 1];
    return !!p && p.c === "forsetning" && !!p.pg && !headsTimePhrase(lex, s, i - 1);
  };
  const t = nounCloze(lex, view, rng, { noun: view.forcedNoun, only });
  if (!t || !only(t.s, t.i)) return null;
  const p = t.s.tok[t.i - 1].w.toLowerCase();
  return built({
    ...t, skill: "fallstjorn", noRepeat: true, base: 11,
    label: `forsetning + nafnorð`,
    lead: `Forsetningin *${p}* ræður fallinu.`,
    tags: ["gov:fs"],
  });
}

/* The motion/rest sentences that come in a contrast: the same preposition and
   noun once with motion (þolfall) and once at rest (þágufall). Item 43 asks
   them as that pair. A sentence with no partner (yfir girðing, yfir fjall) is
   not asked on its own any more: alone it is a coin toss. */
let MOTION_PAIRS = null;
const motionPairs = () => {
  if (MOTION_PAIRS) return MOTION_PAIRS;
  const by = new Map();
  for (const x of EX.motionRest) {
    const k = x.prep + "|" + x.noun;
    if (!by.has(k)) by.set(k, {});
    by.get(k)[x.motion ? "go" : "stay"] = x;
  }
  return (MOTION_PAIRS = [...by.values()].filter((p) => p.go && p.stay));
};

/** One half of the pair: the question of one sentence. */
function motionHalf(x) {
  const { s, i } = textSentence(x.t);
  const right = (x.motion ? x.thf : x.thgf)[0];
  const wrong = (x.motion ? x.thgf : x.thf)[0];
  return {
    s, i, right, wrong,
    question: `Hvort á að standa á eftir *${x.prep}*?`,
    answer: right,
    why: x.motion
      ? `Hér er **hreyfing** á stað (hvert?) — þá stýrir *${x.prep}* **þolfalli**: *${right}*.`
      : `Hér er **kyrrstaða** á stað (hvar?) — þá stýrir *${x.prep}* **þágufalli**: *${right}*.`,
    m: (x.motion ? "ÞF" : "ÞGF") + x.col, paradigm: EX.para[`${x.noun}|${x.g}`] || null,
    optMarks: ["ÞF" + x.col, "ÞGF" + x.col],
    miss: ["hreyfing"],
  };
}

/** í/á + motion (þolfall) or rest (þágufall) — both sentences of the contrast
    on one card; right only when both are (item 43). */
export function fsMotion(lex, view, rng) {
  const P = view.policy;
  if (!P.attr("fall", "ÞF") || !P.attr("fall", "ÞGF")) return null;
  const pr = pick(fresh(view, (y) => y.go.t + y.stay.t, motionPairs()), rng);
  const [a, b] = shuffle([pr.go, pr.stay], rng).map(motionHalf);
  const part = (h) => ({ ...h, options: shuffle([h.right, h.wrong], rng) });
  const [A, B] = [part(a), part(b)];
  const x = pr.go;
  return built(pairOf({
    type: "choice", skill: "fallstjorn", s: A.s, i: A.i,
    title: "Hreyfing eða kyrrstaða?", question: A.question,
    options: A.options, answer: A.answer, why: A.why,
    base: 9, lvl: levelFor(P, 1), cell: "stjórn:" + x.prep, word: lexWord(lex, x.noun, x.g),
    m: A.m, paradigm: A.paradigm, optMarks: A.optMarks,
    tags: ["motion", "gov:fs"], miss: A.miss,
  }, B), [FX.exSeen(pr.go.t + pr.stay.t)]);
}

/** A verb that governs a case: "Ég hjálpaði ___ (kennarinn)". */
export function fsVerb(lex, view, rng) {
  const P = view.policy;
  const items = EX.verbCase.filter((x) => P.mark(x.m));
  if (!items.length) return null;
  const x = pick(fresh(view, (y) => y.t + y.noun, items), rng);
  const { s, i } = textSentence(x.t);
  return built({
    type: "gap", skill: "fallstjorn", s, i, cue: x.cue, answers: x.a, m: x.m,
    paradigm: EX.para[`${x.noun}|${x.g}`] || null,
    title: "Sögnin ræður fallinu", lemmaLabel: "nafnorð",
    hint: `Hvaða falli stýrir sögnin *${x.verb}*?`,
    why: `Sögnin *${x.verb}* stýrir **${caseWord(x.case)}i**: *${x.a[0]}*. Prófaðu: *${x.verb} ${{ ÞF: "mig", ÞGF: "mér", EF: "mín" }[x.case]}*.`,
    base: 11, lvl: levelFor(P, x.case === "EF" ? 3 : 2), cell: "stjórn:" + x.verb,
    word: lexWord(lex, x.noun, x.g), tags: ["gov:so"], cap: false,
  }, [FX.exSeen(x.t + x.noun)]);
}

/** "___ (ég) langar í ís." → Mig. Two traps take the nominative. */
export function fsImpers(lex, view, rng) {
  const P = view.policy;
  const items = EX.impersonal.filter((x) => P.mark(x.m));
  if (!items.length) return null;
  const x = pick(fresh(view, (y) => y.t, items), rng);
  const { s, i } = textSentence(x.t);
  return built({
    type: "gap", skill: "fallstjorn", s, i, cue: x.cue, answers: x.a.map(cap1), m: x.m,
    paradigm: EX.para[`${x.l}|${x.c}`] || null,
    title: "Frumlag í réttu falli", lemmaLabel: "fornafn",
    hint: "Sumar sagnir vilja ekki frumlag í nefnifalli.",
    why: `*${x.verb}*: ${x.why}`,
    base: 11, lvl: levelFor(P, 2), cell: "stjórn:" + x.verb, word: lexWord(lex, x.l, x.c),
    tags: ["impers"], cap: true, missOther: ["opersonuleg"],
  }, [FX.exSeen(x.t)]);
}

export const TYPES = [
  { id: "govern", skill: "fallstjorn", weight: 8, renderer: "govern",
    tags: ["case:EF", "case:ÞF", "case:ÞGF", "gov:fs", "gov:so"],
    bands: [1],
    build: taskGovern, drill: taskGovernWord },
  { id: "fs_fsno", skill: "fallstjorn", weight: 6, renderer: "fill",
    tags: ["case:EF", "case:ÞF", "case:ÞGF", "form", "noun", "num"],
    bands: [1, 2, 3, 4, 5, 6, 7],
    build: fsPrepNoun },
  { id: "fs_hreyf", skill: "fallstjorn", weight: 5, renderer: "choice",
    tags: ["case:ÞF", "case:ÞGF", "gov:fs", "motion", "noun", "num"],
    bands: [1],
    build: fsMotion },
  { id: "fs_sogn", skill: "fallstjorn", weight: 6, renderer: "gap",
    tags: ["case:EF", "case:ÞF", "case:ÞGF", "form", "gov:so", "noun", "num"],
    bands: [1],
    build: fsVerb },
  { id: "fs_operson", skill: "fallstjorn", weight: 5, renderer: "gap",
    tags: ["case:NF", "case:ÞF", "case:ÞGF", "form", "impers", "noun", "num"],
    bands: [1],
    build: fsImpers },
];
