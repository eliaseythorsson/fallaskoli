/* Orðaforði.

     meaning      "Hvað þýðir orðið?" in your own words — no right or wrong.
                  In a session it is an optional bonus after the graded
                  questions (ui/render-more.js), not a question of its own;
                  it still comes in a rescue drill.
     or_heiti     synonym or antonym, four options
     or_samhengi  the one noun of four that makes sense in the sentence
     or_myndun    word formation: ó-, -ari, -ing/-un
     or_utundan   the odd one out

   Which word comes up, and how long it then waits, is core/spacing.js; the
   window of rarity per band is `pickVocab` in tasks/shared.js. Marking a word
   as asked is an effect: it happens when the question is shown. */

import { EX } from "../../../data/exercises.js";
import { wordKey } from "../core/state.js";
import { chooseWord, historyIfAsked } from "../core/spacing.js";
import { isGrammarGloss } from "../core/definitions.js";
import { built, FX } from "./effects.js";
import { pick, shuffle, bandFor, levelFor, cap1, textSentence, pickVocab } from "./shared.js";

/* ================= Word meaning ========================================== */

/* core/spacing.js decides which word may come up: a hard wait after each
   showing and new words first. Words met this session get priority WITHIN
   what is eligible; nothing eligible means null and another type steps in. */
/**
 * Which words the vocabulary question may be asked about: those with a
 * definition that is a meaning, not a class label ("óákveðið fornafn" for
 * *allur* would print the analysis answer). Same rule as `defBox`.
 */
export const meaningPool = (words) =>
  words.filter((x) => x.d && !isGrammarGloss(x.d));

export function taskMeaning(lex, view, rng) {
  const { sess, S } = view;
  const withDef = meaningPool(lex.all);
  if (!withDef.length) return null;
  const { today } = view;
  const pool = withDef.map((x) => ({ x, key: wordKey(x.o, x.c) }));

  const seen = sess.seen.slice(-14);
  const nearby = pool.filter((p) => seen.includes(p.x.o));
  const chosen = chooseWord(S, nearby, today, rng) || chooseWord(S, pool, today, rng);
  if (!chosen) return null;

  return built({
    type: "meaning", skill: "ordaford", n: chosen.x, base: 8, counts: false,
    word: chosen.key, lvl: 1,
    /* the word's history as it stands once this question has been shown */
    spacing: historyIfAsked(S, chosen.key, today),
  }, [FX.asked(chosen.key, today)]);
}

/** The meaning question on the drilled word, or null if it has no meaning in
    the dictionary (or only a grammatical gloss, which is not a meaning). */
export function drillMeaning(lex, view, entry) {
  const full = (lex.lookup && lex.lookup(entry.o, entry.c)) || entry;
  if (!meaningPool([full]).length) return null;
  const key = wordKey(full.o, full.c);
  return built({
    type: "meaning", skill: "ordaford", n: full, base: 8, counts: false,
    word: key, lvl: 1, spacing: historyIfAsked(view.S, key, view.today),
    typeId: "meaning", drill: true,
  }, [FX.asked(key, view.today)]);
}

/* ================= Graded questions (v6.11) ============================== */

/** Rank of a pair: the rarer word decides; a word the frequency list does
    not have (r 99999) counts only when both are missing. */
const pairRank = (...ws) => {
  const known = ws.map((w) => (w && w.r) || 99999).filter((r) => r < 99999);
  return known.length ? Math.max(...known) : 5000;
};

/** Every synonym of a word in the groups (exercises.py SYNONYMS). */
export function synonymsOf(o, pos) {
  const ps = pos ? [pos] : Object.keys(EX.synonyms);
  return ps.flatMap((p) => (EX.synonyms[p] || []).filter((g) => g.some((w) => w.o === o)).flat())
    .map((w) => w.o).filter((w) => w !== o);
}
/** Every antonym of a word (exercises.py ANTONYMS), and their synonyms. */
export function antonymsOf(o, pos) {
  const ps = pos ? [pos] : Object.keys(EX.antonyms);
  const direct = ps.flatMap((p) => (EX.antonyms[p] || []).filter((pr) => pr.some((w) => w.o === o))
    .map((pr) => pr.find((w) => w.o !== o)).filter(Boolean).map((w) => w.o));
  return [...new Set([...direct, ...direct.flatMap((w) => synonymsOf(w, pos))])];
}

/** Synonym or antonym, four options. Wrong options never come from the
    word's own group or from any group that is its opposite. */
export function ordSynAnt(lex, view, rng) {
  const P = view.policy;
  const ant = rng() < 0.5;
  const items = [];
  if (ant) {
    for (const [pos, prs] of Object.entries(EX.antonyms))
      for (const pr of prs) for (const k of [0, 1]) items.push({ pos, x: pr[k], right: pr[1 - k], g: pr });
  } else {
    for (const [pos, gs] of Object.entries(EX.synonyms))
      for (const g of gs) for (const x of g) for (const right of g) if (x !== right) items.push({ pos, x, right, g });
  }
  /* The key is the whole group (or pair): after *fimur → liðugur*,
     *liðugur → fimur* is the same question. */
  const v = pickVocab(view, rng, ant ? "andheiti" : "samheiti", items,
    (y) => y.g.map((w) => w.o).sort().join("|") + "|" + y.pos, (y) => pairRank(y.x, y.right));
  if (!v) return null;
  const it = v.x;
  const { pos, x } = it;
  const right = ant ? it.right : pick(items.filter((y) => y.x === x), rng).right;
  const all = [...(EX.synonyms[pos] || []).flat(), ...(EX.antonyms[pos] || []).flat()];
  const ban = new Set([x.o, right.o, ...synonymsOf(x.o, pos), ...synonymsOf(right.o, pos),
    ...antonymsOf(x.o, pos), ...antonymsOf(right.o, pos),
    ...synonymsOf(x.o, pos).flatMap((w) => antonymsOf(w, pos)),
    ...synonymsOf(right.o, pos).flatMap((w) => antonymsOf(w, pos)),
    /* A word built from the asked one with ó- is its antonym even where no
       list says so (kurteis – ókurteis). */
    "ó" + x.o, x.o.replace(/^ó/, "")]);
  const pool = [...new Map(all.filter((w) => !ban.has(w.o)).map((w) => [w.o, w])).values()];
  /* Wrong options near the right one in rarity, so the rare word is not
     the odd one out by its look alone. */
  const r0 = pairRank(right);
  const near = shuffle(pool, rng).sort((a, b) => Math.abs(pairRank(a) - r0) - Math.abs(pairRank(b) - r0)).slice(0, 8);
  const wrong = shuffle(near, rng).slice(0, 3);
  if (wrong.length < 3) return null;
  const xe = lex.lookup(x.o, x.c), re = lex.lookup(right.o, right.c);
  return built({
    type: "choice", skill: "ordaford", s: null,
    title: ant ? "Andheiti" : "Samheiti",
    question: ant ? `Hvaða orð merkir **hið gagnstæða** við *${x.o}*?` : `Hvaða orð merkir **það sama** og *${x.o}*?`,
    options: shuffle([right.o, ...wrong.map((w) => w.o)], rng), answer: right.o,
    why: ant ? `*${x.o}* og *${right.o}* eru **andheiti**: þau merkja hið gagnstæða.`
      : `*${x.o}* og *${right.o}* eru **samheiti**: þau merkja nánast það sama.`,
    defs: [xe, re].filter((e) => e && e.d),
    base: 8, lvl: levelFor(P, Math.min(5, bandFor(view, "ordaford"))), cell: ant ? "orð:andheiti" : "orð:samheiti",
    word: xe ? wordKey(xe.o, xe.c) : null, tags: ["vocab"], miss: ["merking"],
    bonus: xe || re || null,
  }, [v.fx]);
}

/* Word in context: a sentence where exactly one of four nouns makes sense
   (exercises.py WORD_IN_CONTEXT). All four stand in the same BÍN mark, so
   the grammar never gives the answer away. v6.11 first tried frames from the
   sentence bank with options from "far" noun classes, and reading the output
   killed it: *Grunnskólarnir eru gamlir*, *Ég sá sófa úti* and *Hönnuðurinn
   var tilbúinn* are all good Icelandic. Whether a noun fits a verb is not
   something a class label can settle; a person has to. */
export function ordContext(lex, view, rng) {
  const P = view.policy;
  const items = EX.wordInContext.filter((x) => x.a && P.mark(x.m));
  if (!items.length) return null;
  const v = pickVocab(view, rng, "samhengi", items, (y) => y.t,
    (y) => { const e = lex.lookup(y.a.o, y.a.c); return e && e.r ? e.r : 5000; });
  if (!v) return null;
  const x = v.x;
  const { s, i } = textSentence(x.t);
  const cap = i === 0;
  const fix = (f) => (cap ? cap1(f) : f);
  const right = lex.lookup(x.a.o, x.a.c);
  return built({
    type: "choice", skill: "ordaford", s, i,
    title: "Orð í samhengi", question: "Hvaða orð passar í setninguna?",
    options: shuffle([x.a, ...x.w].map((o) => fix(o.f)), rng), answer: fix(x.a.f),
    why: right && right.d ? `*${x.a.o}*: ${right.d}` : `Aðeins *${x.a.f}* gefur setningunni merkingu.`,
    base: 8, lvl: levelFor(P, 1), cell: "orð:samhengi", word: right ? wordKey(right.o, right.c) : null,
    tags: ["vocab"], miss: ["merking"], bonus: right,
  }, [v.fx]);
}

/* Word formation, three kinds, every pair checked in the lexicon (both
   words in BÍN) and against the dictionary's own definition: *óheppinn* is
   defined with "ekki", *kennari* with "kennir", *æfing* with "æfa". */
let FORM_CACHE = null;
function formationPairs(lex) {
  if (FORM_CACHE && FORM_CACHE.lex === lex) return FORM_CACHE;
  const neg = [], agent = [], ing = [];
  for (const w of lex.adjectives) {
    if (!w.o.startsWith("ó") || w.o.length < 5 || !w.d) continue;
    const base = lex.lookup(w.o.slice(1), "lo");
    if (base && base.r <= 2500 && /\bekki\b/.test(w.d)) neg.push({ from: base, to: w });
  }
  for (const w of lex.byClass.kk || []) {
    if (!w.o.endsWith("ari") || !w.d || !["job", "person"].includes(w.s)) continue;
    const v = lex.lookup(w.o.slice(0, -3) + "a", "so");
    const f3 = v && (v.forms["GM-FH-NT-3P-ET"] || [])[0];
    if (v && f3 && (w.d.includes(f3) || w.d.includes(v.o))) agent.push({ from: v, to: w, f3 });
  }
  for (const w of lex.byClass.kvk || []) {
    if (!/(ing|un)$/.test(w.o) || !w.d) continue;
    const stem = w.o.replace(/(ing|un)$/, "");
    const v = lex.lookup(stem + "a", "so");
    if (v && v.r <= 4000 && w.d.includes(v.o)) ing.push({ from: v, to: w, sfx: w.o.endsWith("ing") ? "-ing" : "-un" });
  }
  FORM_CACHE = { lex, neg, agent, ing };
  return FORM_CACHE;
}

/* The prompt does not name the prefix or the suffix: "Búðu til andheiti
   með forskeytinu ó-: kurteis → ?" gave the answer away. The affix is the
   hint (Vísbending, which costs some XP), and every answer that is right is
   accepted: for kurteis both ókurteis and dónalegur. */
export function ordFormation(lex, view, rng) {
  const P = view.policy;
  const F = formationPairs(lex);
  const kinds = ["neg", "agent", "ing"].filter((k) => F[k].length);
  if (!kinds.length) return null;
  const kind = pick(kinds, rng);
  const v = pickVocab(view, rng, "myndun", F[kind], (y) => y.to.o, (y) => pairRank(y.from, y.to));
  if (!v) return null;
  const x = v.x;
  let answers = [x.to.o];
  if (kind === "neg") answers = [x.to.o, ...synonymsOf(x.to.o, "lo"), ...antonymsOf(x.from.o, "lo")];
  if (kind === "ing") answers = [x.to.o, ...F.ing.filter((y) => y.from === x.from).map((y) => y.to.o)];
  answers = [...new Set(answers)];
  const text = {
    neg: [`Skrifaðu **andheiti** orðsins *${x.from.o}*: ___`, "Prófaðu forskeytið **ó-**.",
      "Forskeytið *ó-* snýr merkingunni við: *heppinn – óheppinn*."],
    agent: [`Sá sem *${x.f3}* er ___ (nafnorð).`, "Nafnorðið endar á **-ari**.",
      "Viðskeytið *-ari* myndar nafnorð um þann sem gerir eitthvað: *kenna – kennari*, *baka – bakari*."],
    ing: [`Myndaðu nafnorð af sögninni *${x.from.o}*: ___`, `Notaðu viðskeytið **${x.sfx}**.`,
      "Viðskeytin *-ing* og *-un* mynda nafnorð af sögnum: *æfa – æfing*, *mennta – menntun*."],
  }[kind];
  const others = answers.slice(1);
  return built({
    type: "gap", skill: "ordaford", mode: "free", s: null, i: -1, prompt: text[0],
    cue: null, answers, m: null, paradigm: null,
    title: "Orðmyndun", hint: null, tip: text[1],
    why: `${text[2]}${x.to.d ? ` *${x.to.o}*: ${x.to.d}` : ""}`
      + (others.length ? ` Líka rétt: ${others.map((o) => `*${o}*`).join(", ")}.` : ""),
    base: 9, lvl: levelFor(P, kind === "neg" ? 1 : 2), cell: "orð:myndun-" + kind,
    word: wordKey(x.to.o, x.to.c), tags: ["wordform"], missOther: ["ordmyndun"],
    bonus: x.to,
  }, [v.fx]);
}

/** Odd one out: three nouns of one kind and one of a kind far from it. */
const KIND_NAME = {
  animal: "dýr", drink: "drykkir", food: "matur", vehicle: "farartæki", clothing: "föt",
  furniture: "húsgögn", body: "líkamshlutar", plant: "plöntur", job: "störf",
  weather: "veðurfyrirbæri", building: "byggingar",
};
const ODD_FAR = {
  animal: ["furniture", "vehicle", "clothing", "drink", "building", "weather"],
  drink: ["animal", "vehicle", "clothing", "furniture", "body", "building", "job"],
  food: ["vehicle", "clothing", "furniture", "body", "building", "job", "weather"],
  vehicle: ["animal", "drink", "food", "clothing", "body", "plant", "job"],
  clothing: ["animal", "drink", "food", "vehicle", "furniture", "plant", "weather"],
  furniture: ["animal", "drink", "food", "clothing", "body", "plant", "weather", "job"],
  body: ["drink", "food", "vehicle", "furniture", "building", "weather", "job"],
  plant: ["vehicle", "clothing", "furniture", "body", "building", "drink", "job"],
  job: ["drink", "food", "vehicle", "clothing", "furniture", "plant", "weather"],
  weather: ["animal", "food", "vehicle", "clothing", "furniture", "body", "job"],
  building: ["animal", "drink", "food", "clothing", "body", "plant", "weather", "job"],
};
export function ordOdd(lex, view, rng) {
  const P = view.policy;
  const b = bandFor(view, "ordaford");
  const maxR = 600 + 500 * b;
  const by = {};
  lex.nouns.forEach((w) => { if (w.r <= maxR && !w.nx && KIND_NAME[w.s]) (by[w.s] ||= []).push(w); });
  const kinds = Object.keys(KIND_NAME).filter((k) => (by[k] || []).length >= 3);
  for (let k = 0; k < 10; k++) {
    const A = pick(kinds, rng);
    if (!A) return null;
    const Bs = ODD_FAR[A].filter((x) => (by[x] || []).length);
    if (!Bs.length) continue;
    const three = shuffle(by[A], rng).slice(0, 3);
    const odd = pick(by[pick(Bs, rng)], rng);
    return built({
      type: "choice", skill: "ordaford", s: null,
      title: "Hvert á ekki heima í hópnum?", question: "Þrjú orðanna eiga eitthvað sameiginlegt. Hvert á **ekki** heima í hópnum?",
      options: shuffle([...three, odd].map((w) => w.o), rng), answer: odd.o,
      why: `*${three.map((w) => w.o).join(", ")}* eru öll ${KIND_NAME[A]} — *${odd.o}* ekki.`,
      defs: [odd].filter((e) => e.d),
      base: 7, lvl: levelFor(P, 1), cell: "orð:útundan", word: wordKey(odd.o, odd.c),
      tags: ["vocab"], miss: ["merking"], bonus: odd,
    });
  }
  return null;
}

export const TYPES = [
  /* v6.11: in a session the free-text meaning question is an optional bonus
     after the graded Orðaforði questions (ui/render-more.js), not a question
     of its own — hence no weight inside one. It still comes in a rescue
     drill. */
  { id: "meaning", skill: "ordaford", weight: 4, weightInRun: 0, renderer: "meaning",
    tags: [],
    bands: [1],
    build: taskMeaning },
  { id: "or_heiti", skill: "ordaford", weight: 4, renderer: "choice",
    tags: ["vocab"],
    bands: [1, 2, 3, 4, 5, 6, 7],
    build: ordSynAnt },
  { id: "or_samhengi", skill: "ordaford", weight: 4, renderer: "choice",
    tags: ["vocab"],
    bands: [1, 2, 3, 4, 5, 7],
    build: ordContext },
  { id: "or_myndun", skill: "ordaford", weight: 3, renderer: "gap",
    tags: ["wordform"],
    bands: [1, 2, 3, 4],
    build: ordFormation },
  { id: "or_utundan", skill: "ordaford", weight: 3, renderer: "choice",
    tags: ["vocab"],
    bands: [1, 2],
    build: ordOdd },
];
