/* Setningagerðir (year 10): aðalsetning, aukasetning, nafnháttarsetning.

     clause       what kind of clause is the marked run of words
     gerd_finna   click every word of the subordinate clause
     gerd_upphaf  on which word does the clause begin
     gerd_tegund  what KIND of subordinate clause the marked one is (item 28)

   The clause type (`k` on each token) comes from the parse and passed the
   guard like everything else; the builders read it and infer nothing. */

import { built, FX } from "./effects.js";
import { pick, wpick, shuffle, bandFor, forcedCell, cellWanted, fresh, PUNCT } from "./shared.js";

const CLAUSE_KINDS = ["aðalsetning", "aukasetning", "nafnháttarsetning"];

/** Contiguous runs of tokens carrying the same clause type. */
function clauseSpans(s) {
  const out = [];
  let start = 0;
  for (let i = 1; i <= s.tok.length; i++) {
    const prev = s.tok[i - 1].k;
    const here = i < s.tok.length ? s.tok[i].k : null;
    if (here !== prev) {
      if (prev && i - start > 1) out.push({ from: start, to: i - 1, kind: prev });
      start = i;
    }
  }
  return out;
}

/* The sentences Setningagerðir may ask about at this difficulty.

   A question here is as hard as its sentence: "Ég veit að þú kemur" and a
   year-10 sentence with a relative clause inside indirect speech are not the
   same task. So the pool follows the session's difficulty like every other
   sentence pool (shared.js `sentPool`): the band's own level and the one
   below it. Until v6.13 it was every sentence up to level 5 whatever the
   band, and every question was stamped þyngd 6 — no gradation, and the
   þyngd-6 bonus on a six-word sentence (item 14).

   The floor is the one difference from `sentPool`. Clauses need room: the
   bank has one sentence with two clause types at level 1, one at level 2 and
   eleven at level 3, so a new pupil's band of 1 would mean the same sentence
   every time. Below band 4 the pool is the band-4 pool (levels 3-4, eighty
   sentences) — the label on the question still says what the sentence is.

   The policy is asked twice, as everywhere: the band never rises above the
   highest level that is switched on, and no sentence of a level that is
   switched off is used. If the window is empty (levels 3-4 off, say), the
   nearest allowed sentences below it are used, then any allowed. */
const FLOOR = 4;

/** Every sentence this pupil may be asked about clauses in, at any level. */
function clauseSentences(lex, view) {
  const P = view.policy;
  /* `ku`: the build could not vouch for where this sentence's clauses begin
     and end, so nothing is asked about them. */
  return lex.sentences.filter((s) => !s.ku && P.level(s.lvl)
    && new Set(s.tok.map((t) => t.k).filter(Boolean)).size > 1);
}

function clausePool(lex, view, usable = clauseSentences(lex, view)) {
  const band = Math.min(Math.max(FLOOR, bandFor(view, "setningagerd")), view.policy.maxLevel);
  const near = usable.filter((s) => s.lvl <= band && s.lvl >= band - 1);
  if (near.length) return near;
  const below = usable.filter((s) => s.lvl <= band);
  return below.length ? below : usable;
}

/* A review (tasks/review.js) asks for the kind of clause that was missed, and
   does not wait for the difficulty: the sentences that have it are taken from
   the band's pool if it has any, else from every sentence the pupil may meet. */
function withKind(lex, view, has) {
  const usable = clauseSentences(lex, view);
  const pool = clausePool(lex, view, usable);
  return pool.some(has) ? pool.filter(has) : usable.filter(has);
}

/** The spans of a sentence the clause question may be asked about. */
function askable(s) {
  /* A clause has a verb. A run of words without one is a phrase, whatever
     the label on it, and is not asked about. */
  const spans = clauseSpans(s).filter((x) =>
    s.tok.slice(x.from, x.to + 1).some((t) => t.x === "so"));
  /* The question is asked, by preference, about the part that is NOT the
     main clause: "where is the subordinate clause" is the question that
     teaches, not "what is the remainder called". */
  const interesting = spans.filter((x) => x.kind !== "aðalsetning");
  return interesting.length ? interesting : spans;
}

const clauseTask = (s, span) => built({
  type: "clause", skill: "setningagerd", s, span,
  answer: span.kind, picked: null,
  options: CLAUSE_KINDS,
  base: 14, cell: "gerd:" + span.kind,
  lvl: s.lvl,                   // the sentence's own level, as in every sentence question
});

export function taskClause(lex, view, rng) {
  const fc = forcedCell(view);
  if (fc) {
    const kind = fc.startsWith("gerd:") ? fc.slice(5) : null;
    if (!CLAUSE_KINDS.includes(kind)) return null;
    const of = (s) => askable(s).filter((x) => x.kind === kind);
    const from = withKind(lex, view, (s) => of(s).length > 0);
    if (!from.length) return null;
    const s = pick(from, rng);
    return clauseTask(s, pick(of(s), rng));
  }
  const pool = clausePool(lex, view);
  if (!pool.length) return null;
  for (const s of shuffle(pool, rng).slice(0, 12)) {
    const span = pick(askable(s), rng);
    if (!span) continue;
    return clauseTask(s, span);
  }
  return null;
}

/* ================= Find it (v6.11) ======================================= */

/** The subordinate or infinitive clauses of a sentence that are the only one
    of their kind in it, so that "the" clause is unambiguous. */
function loneClauses(s) {
  const spans = clauseSpans(s).filter((x) => x.kind !== "aðalsetning"
    && s.tok.slice(x.from, x.to + 1).some((t) => t.x === "so"));
  const kinds = spans.map((x) => x.kind);
  return spans.filter((x) => kinds.filter((k) => k === x.kind).length === 1);
}

/** A sentence and one such clause in it. `kind`: only that kind (a review). */
function subClause(lex, view, rng, kind = null) {
  if (kind) {
    const of = (s) => loneClauses(s).filter((x) => x.kind === kind);
    const from = withKind(lex, view, (s) => of(s).length > 0);
    if (!from.length) return null;
    const s = pick(from, rng);
    return { s, span: pick(of(s), rng) };
  }
  const pool = shuffle(clausePool(lex, view), rng);
  for (const s of pool.slice(0, 30)) {
    const one = loneClauses(s);
    if (one.length) return { s, span: pick(one, rng) };
  }
  return null;
}

export function clFind(lex, view, rng) {
  const fc = forcedCell(view);
  if (fc && !fc.startsWith("gerd:finna-")) return null;
  const c = subClause(lex, view, rng, fc ? fc.slice("gerd:finna-".length) : null);
  if (!c) return null;
  const { s, span } = c;
  const targets = [];
  for (let j = span.from; j <= span.to; j++) if (!PUNCT.has(s.tok[j].w)) targets.push(j);
  return built({
    type: "tap", skill: "setningagerd", s, cls: span.kind, targets, whole: true,
    title: `Finndu ${span.kind}una`,
    question: `Smelltu á **öll orðin** í ${span.kind}unni.`,
    base: 14, lvl: s.lvl, cell: "gerd:finna-" + span.kind, word: null, tags: ["clause"],
  });
}

export function clStart(lex, view, rng) {
  if (!cellWanted(view, "gerd:upphaf")) return null;
  const c = subClause(lex, view, rng);
  if (!c) return null;
  const { s, span } = c;
  const first = s.tok[span.from];
  const others = shuffle(s.tok.filter((t, j) => !PUNCT.has(t.w) && (j < span.from || j > span.to) && t.w !== first.w)
    .map((t) => t.w), rng).filter((w, k, a) => a.indexOf(w) === k).slice(0, 3);
  if (others.length < 2) return null;
  return built({
    type: "choice", skill: "setningagerd", s, i: -1, span,
    title: "Hvar hefst setningin?", question: `Á hvaða orði hefst ${span.kind}in?`,
    options: shuffle([first.w, ...others], rng), answer: first.w,
    why: span.kind === "aukasetning"
      ? `Aukasetningin hefst á *${first.w}*. Aukasetningar hefjast oftast á samtengingu (*að, sem, þegar, ef, af því að …*).`
      : `Nafnháttarsetningin hefst á *${first.w}*: *að* + sögn í nafnhætti.`,
    base: 12, lvl: s.lvl, cell: "gerd:upphaf", word: null, tags: ["clause"], miss: ["setningagerd"],
  });
}

/* ================= Kinds of subordinate clause (item 28) ==================
 *
 * "Hvers konar aukasetning?" — a subordinate clause of a bank sentence is
 * underlined and the pupil names its kind.
 *
 * The kind is never worked out here. The build writes it on the sentence
 * (`cl`, phrases.py) and only where two things that do not depend on each
 * other agree: the parser's own node for the clause, and a closed table of
 * the conjunctions that have ONE reading. *Þar sem* (cause or place), *svo*
 * without *að*, *því að* and comparisons are not in the data at all, and for
 * *svo að* the verb must SHOW its mood (*komst* / *kæmist*), because that is
 * the whole difference between result and purpose.
 *
 * Three steps of difficulty, and each asks something else:
 *
 *   þyngd 1–3  the three main classes of Málvísir: fallsetning,
 *              tilvísunarsetning, atvikssetning. Sentences up to level 5,
 *              no clause with another clause inside it.
 *   þyngd 4–5  the kinds by name: skýringar-, spurnar-, tilvísunar-, tíðar-,
 *              skilyrðis-, orsakar- and viðurkenningarsetning. Sentences up
 *              to level 6.
 *   þyngd 6–7  also tilgangssetning and afleiðingarsetning, which share the
 *              conjunction *svo að* and differ in the mood of the verb; every
 *              sentence, and clauses with a clause inside them.
 */

/* `nm` is the kind as the build writes it; `grp` its main class. `ask` is
   the question the clause answers, `why` the rule in the words of the
   Lesefni page (content/lessons.js "aukasetningar"). */
const SUB_KINDS = [
  { nm: "skýringarsetning", grp: "fallsetning", from: 4,
    why: "**Skýringarsetning** stendur oftast sem andlag sagna eins og *segja, halda, vita* og *vona* og svarar spurningunni *hvað?* Tengingin er *að*." },
  { nm: "spurnarsetning", grp: "fallsetning", from: 4,
    why: "**Spurnarsetning** er spurning sem er orðin hluti af annarri setningu (óbein spurning). Hún hefst á *hvort* eða spurnarorði: *hver, hvað, hvar, hvenær, hvernig, hvert, hvaðan, af hverju*." },
  { nm: "tilvísunarsetning", grp: "tilvísunarsetning", from: 1,
    why: "**Tilvísunarsetning** vísar til orðs sem stendur rétt á undan henni og segir nánar frá því. Tengingin er *sem*." },
  { nm: "tíðarsetning", grp: "atvikssetning", from: 4,
    why: "**Tíðarsetning** segir **hvenær** eitthvað gerist. Hún hefst á tíðartengingu: *þegar, áður en, eftir að, á meðan, þangað til, um leið og, fyrr en*." },
  { nm: "skilyrðissetning", grp: "atvikssetning", from: 4,
    why: "**Skilyrðissetning** segir með hvaða **skilyrði** eitthvað gerist. Hún hefst á *ef* eða *nema*." },
  { nm: "orsakarsetning", grp: "atvikssetning", from: 4,
    why: "**Orsakarsetning** segir **af hverju** eitthvað gerist. Hún hefst á *af því að* eða *vegna þess að*." },
  { nm: "viðurkenningarsetning", grp: "atvikssetning", from: 4,
    why: "**Viðurkenningarsetning** segir frá einhverju sem hefði getað komið í veg fyrir það sem aðalsetningin segir, en gerði það ekki. Hún hefst á *þótt*, *þó að* eða *enda þótt* og sögnin er í viðtengingarhætti." },
  { nm: "tilgangssetning", grp: "atvikssetning", from: 6,
    why: "**Tilgangssetning** segir **til hvers** eitthvað er gert. Hún hefst á *svo að* eða *til þess að* og sögnin er í **viðtengingarhætti**." },
  { nm: "afleiðingarsetning", grp: "atvikssetning", from: 6,
    why: "**Afleiðingarsetning** segir hvað **leiddi af** því sem aðalsetningin segir. Hún hefst á *svo að* og sögnin er í **framsöguhætti**." },
];
const SUB_BY_NM = new Map(SUB_KINDS.map((k) => [k.nm, k]));
const SUB_GROUPS = ["fallsetning", "tilvísunarsetning", "atvikssetning"];
const GROUP_WHY = {
  fallsetning: "**Fallsetning** gegnir sama hlutverki og fallorð: hún er oftast andlag sagnarinnar (*Ég veit **hvað**?*). Fallsetningar hefjast á *að*, *hvort* eða spurnarorði.",
  tilvísunarsetning: "**Tilvísunarsetning** vísar til orðs sem stendur rétt á undan henni og segir nánar frá því. Tengingin er *sem*.",
  atvikssetning: "**Atvikssetning** gegnir sama hlutverki og atviksorð: hún segir hvenær, hvers vegna, með hvaða skilyrði, til hvers eða þrátt fyrir hvað eitthvað gerist.",
};
/* The step a session is on: 1 (the three classes), 4 (seven kinds), 6 (nine). */
const subStep = (band) => (band >= 6 ? 6 : band >= 4 ? 4 : 1);
const SUB_TOP_LEVEL = { 1: 5, 4: 6, 6: 7 };

/* The words the clause opens with, for the explanation: the conjunction is
   what the pupil is to look at. Longest first. */
const SUB_OPENERS = ["um leið og", "af því að", "vegna þess að", "til þess að", "enda þótt",
  "þangað til", "áður en", "eftir að", "á meðan", "fyrr en", "þó að", "svo að", "af hverju"];
function openerOf(s, c) {
  const words = [];
  for (let j = c.a; j <= c.b; j++) words.push(...s.tok[j].w.toLowerCase().split(" "));
  const text = words.join(" ") + " ";
  return SUB_OPENERS.find((o) => text.startsWith(o + " ")) || words[0];
}

/* Every clause of the bank whose kind the build vouches for, once per lexicon. */
const SUB_SLOTS = new WeakMap();
function subSlots(lex) {
  if (SUB_SLOTS.has(lex)) return SUB_SLOTS.get(lex);
  const list = [];
  for (const s of lex.sentences) {
    if (s.ku) continue;
    for (const c of s.cl || []) {
      const kind = SUB_BY_NM.get(c.t);
      if (!kind) continue;
      list.push({ s, c, kind, nested: !!c.n, key: `tegund:${s.t}#${c.a}` });
    }
  }
  SUB_SLOTS.set(lex, list);
  return list;
}

function subWhy(x, step) {
  const opener = openerOf(x.s, x.c);
  const head = `Aukasetningin hefst á *${opener}*. `;
  if (step === 1) {
    return head + GROUP_WHY[x.kind.grp]
      + (x.kind.grp === x.kind.nm ? "" : ` Nánar tiltekið er þetta **${x.kind.nm}**.`);
  }
  let tail = "";
  if (x.kind.nm === "tilgangssetning" && opener === "svo að")
    tail = " Með framsöguhætti væri þetta afleiðingarsetning.";
  if (x.kind.nm === "afleiðingarsetning")
    tail = " Með viðtengingarhætti væri þetta tilgangssetning.";
  return head + x.kind.why + tail;
}

/** "Hvers konar aukasetning er undirstrikaði hlutinn?" */
export function clKind(lex, view, rng) {
  const P = view.policy;
  const step = subStep(bandFor(view, "setningagerd"));
  const fc = forcedCell(view);
  if (fc && !fc.startsWith("tegund:")) return null;
  const avoid = view.force && view.force.avoid;
  const usable = subSlots(lex).filter((x) => P.level(x.s.lvl) && x.s.t !== avoid);
  let pool;
  if (fc) {
    /* A review asks for the kind that was missed and does not wait for the
       difficulty: from the step's own sentences if they have it, else any. */
    const of = usable.filter((x) => "tegund:" + x.kind.nm === fc);
    const near = of.filter((x) => x.s.lvl <= SUB_TOP_LEVEL[step] && (step === 6 || !x.nested));
    pool = near.length ? near : of;
  } else {
    pool = usable.filter((x) => x.s.lvl <= SUB_TOP_LEVEL[step]
      && (step === 6 || !x.nested)
      /* A kind that is not among the options of this step is not asked. */
      && (step === 1 || x.kind.from <= step));
  }
  if (!pool.length) return null;
  /* A kind first, then a clause of that kind: a third of the clauses are
     tíðarsetningar, and ten of those running teach nothing. The square root
     keeps the common kinds commoner without drowning the rest. */
  const groups = new Map();
  /* At the first step the answer is one of three classes, so the class is
     drawn first: six of the nine kinds are atvikssetningar. */
  const keyOf = (x) => (step === 1 && !fc ? x.kind.grp : x.kind.nm);
  for (const x of pool) {
    if (!groups.has(keyOf(x))) groups.set(keyOf(x), []);
    groups.get(keyOf(x)).push(x);
  }
  const g = wpick([...groups.keys()], (k) => Math.sqrt(groups.get(k).length), rng);
  const x = pick(fresh(view, (y) => y.key, groups.get(g)), rng);
  /* The options of the step — and if a review brought a kind from a higher
     step, the options that have it. */
  const optStep = step === 1 ? 1 : Math.max(step, x.kind.from);
  const options = optStep === 1 ? SUB_GROUPS
    : SUB_KINDS.filter((k) => k.from <= optStep).map((k) => k.nm);
  const answer = optStep === 1 ? x.kind.grp : x.kind.nm;
  const svo = ["tilgangssetning", "afleiðingarsetning"];
  return built({
    type: "choice", skill: "setningagerd", s: x.s, i: -1,
    span: { from: x.c.a, to: x.c.b, kind: "aukasetning" }, markSpan: true,
    title: "Hvers konar aukasetning?",
    question: "Hvers konar aukasetning er **undirstrikaði** hlutinn?",
    options, answer, sub: x.kind.nm,
    why: subWhy(x, optStep),
    base: optStep === 1 ? 12 : optStep === 4 ? 14 : 16,
    lvl: x.s.lvl, cell: "tegund:" + x.kind.nm, word: null,
    tags: optStep === 6 && svo.includes(x.kind.nm) ? ["subkind", "subkind:svo"] : ["subkind"],
    miss: ["aukasetn_tegund"],
    /* Purpose taken for result or the other way round is the mistake the
       lesson warns of: the mood decides. */
    missFor: optStep === 6 && svo.includes(x.kind.nm)
      ? { [svo.find((k) => k !== x.kind.nm)]: ["aukasetn_tegund", "svo_ad"] } : null,
  }, [FX.exSeen(x.key)]);
}

export const TYPES = [
  { id: "clause", skill: "setningagerd", weight: 8, renderer: "clause",
    tags: ["clause"],
    bands: [1, 5, 6, 7],
    build: taskClause },
  { id: "gerd_finna", skill: "setningagerd", weight: 5, renderer: "tap",
    tags: ["clause"],
    bands: [1, 5, 6, 7],
    build: clFind },
  { id: "gerd_upphaf", skill: "setningagerd", weight: 4, renderer: "choice",
    tags: ["clause"],
    bands: [1, 5, 6, 7],
    build: clStart },
  /* item 28 */
  { id: "gerd_tegund", skill: "setningagerd", weight: 7, renderer: "choice",
    tags: ["subkind", "subkind:svo"],
    bands: [1, 4, 6],
    build: clKind },
];
