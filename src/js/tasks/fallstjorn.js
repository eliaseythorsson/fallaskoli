/* Fallstjórn: hvaða falli sögn eða forsetning stýrir.

     govern      which case does the marked verb or preposition govern
     fs_fsno     the noun cloze right after a preposition (tasks/cloze.js)
     fs_hreyf    í/á: motion (þolfall) or rest (þágufall)
     fs_sogn     a noun written in the case its verb governs
     fs_operson  the subject of an impersonal verb ("___ (ég) langar í ís")

   The last three are hand-written items (data/exercises.js), each with its
   level: they are chosen near the pupil's band (shared.js `itemsForBand`). */

import { EX } from "../../../data/exercises.js";
import { wordKey } from "../core/state.js";
import { built, FX } from "./effects.js";
import { nounCloze } from "./cloze.js";
import { pairOf, pick, shuffle, levelFor, sentPool, tokenKey, tokensOf, cap1, caseWord, textSentence,
         itemsForBand, lexWord, headsTimePhrase, forcedItem, forcedCell } from "./shared.js";

const CASEWORD = { þf: "ÞF", þgf: "ÞG", ef: "EF" };

/* ================= Which case ============================================ */

/* Every verb and preposition in these sentences whose case the build
   confirmed. */
function governed(lex, sentences) {
  const cands = [];
  sentences.forEach((s) =>
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
  return cands;
}

export function taskGovern(lex, view, rng) {
  const P = view.policy;
  /* From the sentences at the pupil's difficulty, like every other sentence
     question (shared.js `sentPool`). Until v6.13 it drew from the whole bank
     at every band, so a beginner met level-5 sentences as often as level-1
     ones (critique item 13). The whole bank stays the fallback: the window
     never leaves a pupil without a question. */
  let cands = governed(lex, sentPool(lex, view, "fallstjorn"));
  if (!cands.length) cands = governed(lex, lex.sentences.filter((s) => P.level(s.lvl)));
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
   not asked on its own any more: alone it is a coin toss.

   Two sources (critique item 23): the hand-written pairs of MOTION_REST, and
   the sets of MOTION_SETS — every motion sentence of a set × every rest
   sentence × every noun, each sentence with every noun checked by the build.
   Fifteen pairs became some six hundred. */
let MOTION_PAIRS = null;
export const motionPairs = () => {
  if (MOTION_PAIRS) return MOTION_PAIRS;
  const by = new Map();
  for (const x of EX.motionRest) {
    const k = x.prep + "|" + x.noun;
    if (!by.has(k)) by.set(k, {});
    by.get(k)[x.motion ? "go" : "stay"] = x;
  }
  /* A pair is as hard as its harder sentence (item 13: chosen by band). */
  const out = [...by.values()].filter((p) => p.go && p.stay)
    .map((p) => ({ ...p, lvl: Math.max(p.go.lvl, p.stay.lvl), key: p.go.t + p.stay.t }));
  for (const set of EX.motionSets || []) {
    for (const n of set.nouns) {
      const half = (f, motion) => ({ t: f.t, noun: n.noun, g: n.g, col: set.col, motion,
        thf: n.thf, thgf: n.thgf, prep: set.prep, lvl: f.lvl });
      for (const go of set.go) for (const stay of set.stay)
        out.push({ go: half(go, true), stay: half(stay, false), lvl: Math.max(go.lvl, stay.lvl),
          key: `${go.t}${stay.t}|${n.noun}` });
    }
  }
  return (MOTION_PAIRS = out);
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
  /* A review asks for the very pair (`force.item`), or one about the same
     preposition (`force.cell`) or noun (`view.drillWord`). */
  const want = forcedItem(view), cell = forcedCell(view), dw = view.drillWord;
  const pairs = motionPairs().filter((y) => (!want || y.key === want) &&
    (!cell || cell === "stjórn:" + y.go.prep) && (!dw || (dw.o === y.go.noun && dw.c === y.go.g)));
  if (!pairs.length) return null;
  const pr = pick(want ? pairs : itemsForBand(view, "fallstjorn", pairs, (y) => y.key), rng);
  const [a, b] = shuffle([pr.go, pr.stay], rng).map(motionHalf);
  const part = (h) => ({ ...h, options: shuffle([h.right, h.wrong], rng) });
  const [A, B] = [part(a), part(b)];
  const x = pr.go;
  return built(pairOf({
    type: "choice", skill: "fallstjorn", s: A.s, i: A.i,
    title: "Hreyfing eða kyrrstaða?", question: A.question,
    options: A.options, answer: A.answer, why: A.why,
    base: 9, lvl: levelFor(P, pr.lvl), cell: "stjórn:" + x.prep, word: lexWord(lex, x.noun, x.g),
    m: A.m, paradigm: A.paradigm, optMarks: A.optMarks, item: pr.key,
    tags: ["motion", "gov:fs"], miss: A.miss,
  }, B), [FX.exSeen(pr.key)]);
}

/** A verb that governs a case: "Ég hjálpaði ___ (kennarinn)". */
export function fsVerb(lex, view, rng) {
  const P = view.policy;
  /* VERB_CASE by hand and VERB_FRAMES × noun groups (critique item 23). A
     review asks for the very item, the verb (`force.cell`) or the noun. */
  const want = forcedItem(view), cell = forcedCell(view), dw = view.drillWord;
  const key = (y) => y.t + y.noun;
  const items = EX.verbCase.filter((x) => P.mark(x.m) && (!want || key(x) === want) &&
    (!cell || cell === "stjórn:" + x.verb) && (!dw || (dw.o === x.noun && dw.c === x.g)));
  if (!items.length) return null;
  const x = pick(want ? items : itemsForBand(view, "fallstjorn", items, key), rng);
  const { s, i } = textSentence(x.t);
  return built({
    type: "gap", skill: "fallstjorn", s, i, cue: x.cue, answers: x.a, m: x.m,
    paradigm: EX.para[`${x.noun}|${x.g}`] || null,
    title: "Sögnin ræður fallinu", lemmaLabel: "nafnorð",
    hint: `Hvaða falli stýrir sögnin *${x.verb}*?`,
    why: `Sögnin *${x.verb}* stýrir **${caseWord(x.case)}i**: *${x.a[0]}*. Prófaðu: *${x.verb} ${{ ÞF: "mig", ÞGF: "mér", EF: "mín" }[x.case]}*.`,
    base: 11, lvl: levelFor(P, x.lvl), cell: "stjórn:" + x.verb,
    word: lexWord(lex, x.noun, x.g), item: key(x), tags: ["gov:so"], cap: false,
  }, [FX.exSeen(key(x))]);
}

/* ---------- the impersonal subject (critique item 23) -----------------------
 *
 * Until v6.13 twenty hand-written sentences, and a pupil met the same ones
 * again within a week. Now frames × subjects × tense (exercises.py
 * IMPERSONAL_FRAMES, IMPERSONAL_SUBJECTS): build_exercises.py took every
 * form from BÍN — the verb in each tense (and, for the two traps, in each
 * person), the subject in each case — and checked that the case of the
 * subject is the one BÍN gives the impersonal verb. Here they are put
 * together, once.
 *
 * A subject whose form in the asked case is its nominative (*barnið
 * langar*, *þær vantar*) is left out unless the answer IS the nominative —
 * the two traps, *ég hlakka til*: copying the cue is not knowing the case. */
const CASE_IS = { ÞF: "þolfall", ÞGF: "þágufall", NF: "nefnifall" };
let IMPERSONAL = null;
export function impersonalItems() {
  if (IMPERSONAL) return IMPERSONAL;
  const { frames, subjects } = EX.impersonal;
  const out = [];
  for (const f of frames) {
    for (const sb of subjects) {
      const a = sb.f[f.case], cue = sb.f.NF[0];
      if (f.case !== "NF" && a.includes(cue)) continue;
      /* *Barninu er kalt* — but *barnið er kalt* (cold to the touch) is good
         Icelandic too: the adjective agrees with a neuter singular subject.
         So no neuter singular in the frames of *vera* or *verða* + adjective
         (`f.x`, the ones BÍN has no impersonal form for). */
      if (f.x && sb.c === "hk" && sb.col.startsWith("ET")) continue;
      const vf = f.v["*"] || f.v[sb.p];
      const t = f.t.replace("{V}", vf);
      const why = f.case === "NF"
        ? `${CASE_IS.NF}: *${cue} ${vf}* — ekki *${sb.f.ÞGF[0]} ${f.v["3ET"]}*. Sögnin lagar sig að frumlaginu.`
        : `${CASE_IS[f.case]}: *${a[0]} ${vf}${f.x ? " " + f.x : ""}*.`;
      out.push({
        key: `${t}|${sb.l}|${sb.col}`, t, verb: f.verb, l: sb.l, c: sb.c,
        m: f.case + sb.col, a, cue, why, trap: f.case === "NF",
        lvl: Math.min(5, f.lvl + sb.add),
      });
    }
  }
  return (IMPERSONAL = out);
}

/** "___ (ég) langar í ís." → Mig. Two traps take the nominative. A review
    (tasks/review.js) asks for the very item (`view.force.item`), one of the
    same verb (`force.cell`, "stjórn:langa"), or the same subject
    (`view.drillWord`, which a review sets for `force.word`). */
export function fsImpers(lex, view, rng) {
  const P = view.policy;
  const want = forcedItem(view), cell = forcedCell(view), dw = view.drillWord;
  const items = impersonalItems().filter((x) => P.mark(x.m) &&
    (!want || x.key === want) && (!cell || "stjórn:" + x.verb === cell) &&
    (!dw || (dw.o === x.l && dw.c === x.c)));
  if (!items.length) return null;
  const x = pick(want ? items : itemsForBand(view, "fallstjorn", items, (y) => y.key), rng);
  const { s, i } = textSentence(x.t);
  return built({
    type: "gap", skill: "fallstjorn", s, i, cue: x.cue, answers: x.a.map(cap1), m: x.m,
    paradigm: EX.para[`${x.l}|${x.c}`] || null,
    title: "Frumlag í réttu falli", lemmaLabel: x.c === "pfn" ? "fornafn" : "nafnorð",
    hint: "Sumar sagnir vilja ekki frumlag í nefnifalli.",
    why: `*${x.verb}*: ${x.why}`,
    base: 11, lvl: levelFor(P, x.lvl), cell: "stjórn:" + x.verb, word: lexWord(lex, x.l, x.c),
    item: x.key,
    tags: ["impers"], cap: true, missOther: ["opersonuleg"],
  }, [FX.exSeen(x.key)]);
}

export const TYPES = [
  { id: "govern", skill: "fallstjorn", weight: 8, renderer: "govern",
    tags: ["case:EF", "case:ÞF", "case:ÞGF", "gov:fs", "gov:so"],
    bands: [1, 2, 3, 4, 5, 6, 7],
    build: taskGovern, drill: taskGovernWord },
  { id: "fs_fsno", skill: "fallstjorn", weight: 6, renderer: "fill",
    tags: ["case:EF", "case:ÞF", "case:ÞGF", "form", "noun", "num"],
    bands: [1, 2, 3, 4, 5, 6, 7],
    build: fsPrepNoun },
  { id: "fs_hreyf", skill: "fallstjorn", weight: 5, renderer: "choice",
    tags: ["case:ÞF", "case:ÞGF", "gov:fs", "motion", "noun", "num"],
    bands: [1, 2, 3],
    build: fsMotion },
  { id: "fs_sogn", skill: "fallstjorn", weight: 6, renderer: "gap",
    tags: ["case:EF", "case:ÞF", "case:ÞGF", "form", "gov:so", "noun", "num"],
    bands: [1, 3, 4],
    build: fsVerb },
  { id: "fs_operson", skill: "fallstjorn", weight: 5, renderer: "gap",
    tags: ["case:NF", "case:ÞF", "case:ÞGF", "form", "impers", "noun", "num"],
    bands: [1, 3, 4, 5],
    build: fsImpers },
];
