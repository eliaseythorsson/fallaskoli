/* The word collection — a trophy case.

   Every word the child has met is an exhibit. Words it has not seen are not
   shown; this is not a list of what is missing but a collection that grows.
   The share of the vocabulary is the carrot.                               */

import { CLASSNAME } from "./marks.js";
import { wordKey } from "./state.js";
import { wordTier, isRareScore } from "./rarity.js";
import { statusOf, recentOf, vocabScore, rescueCount, keptAfloat } from "./wordhealth.js";
import { readSets } from "./wordsets.js";

export const COLLECT_ORDER = [
  "kk", "kvk", "hk", "lo", "so", "fn", "pfn", "gr", "to", "rt",
  "ao", "fs", "st", "uh", "nhm",
];

export const CLASS_LABEL = {
  kk: "Nafnorð — karlkyn", kvk: "Nafnorð — kvenkyn", hk: "Nafnorð — hvorugkyn",
  lo: "Lýsingarorð", so: "Sagnorð", fn: "Fornöfn", pfn: "Persónufornöfn",
  gr: "Greinir", to: "Frumtölur", rt: "Raðtölur", ao: "Atviksorð",
  fs: "Forsetningar", st: "Samtengingar", uh: "Upphrópanir",
  nhm: "Nafnháttarmerki",
};

/* Rarity comes from the corpus frequency score (`q`, core/rarity.js), not
 * from rank inside a word class. Coverage badges count only classes large
 * enough for a percentage to mean anything: the article and the infinitive
 * marker are classes of one word, and meeting *hinn* must not be 100% of
 * anything. */

/** Coverage badges ignore any word class with fewer words than this. At 25
    three prepositions were a twentieth of the vocabulary; at 100 what remains
    are the real classes — the noun genders, adjectives, verbs and adverbs. */
export const COVERAGE_MIN_CLASS = 100;

/** How many words of each class exist in the corpus at all. */
export function corpusTotals(lex) {
  const out = {};
  lex.all.forEach((w) => { out[w.c] = (out[w.c] || 0) + 1; });
  return out;
}

/** A word counts as collected once it has been answered at least once. */
export function collectionByClass(S, lex) {
  const totals = corpusTotals(lex);
  const held = new Map();

  for (const [key, rec] of Object.entries(S.words)) {
    const [lemma, cls] = key.split("|");
    if (!cls) continue;
    const n = (rec.c || 0) + (rec.w || 0);
    if (!n) continue;
    const entry = lex.lookup(lemma, cls);
    const list = held.get(cls) || [];
    const q = entry && entry.q != null ? entry.q : null;
    list.push({
      lemma, cls, key, n,
      correct: rec.c || 0,
      pct: Math.round(100 * (rec.c || 0) / n),
      rank: entry ? entry.r : null,
      q,
      tier: wordTier(q),
      rare: isRareScore(q),
      def: entry ? entry.d : null,
      s: entry ? entry.s || null : null,
      /* v6.6: how the word is doing now (core/wordhealth.js), and whether a
         rescue drill has ever saved it. */
      status: statusOf(rec),
      recent: recentOf(rec).acc,
      rescued: !!(S.drills && S.drills[key] && S.drills[key].p),
    });
    held.set(cls, list);
  }

  return COLLECT_ORDER
    .filter((c) => totals[c])
    .map((c) => {
      const words = (held.get(c) || []).sort((a, b) => a.lemma.localeCompare(b.lemma, "is"));
      return {
        cls: c,
        label: CLASS_LABEL[c] || c,
        fl: CLASSNAME[c] || c,
        words,
        seen: words.length,
        total: totals[c],
        pct: totals[c] ? words.length / totals[c] : 0,
        mastered: words.filter((w) => w.n >= 3 && w.pct >= 80).length,
        weak: words.filter((w) => w.status === "weak").length,
        strong: words.filter((w) => w.status === "strong").length,
      };
    });
}

/** Flat summary the badge tests read. */
export function collectionSummary(S, lex) {
  const groups = collectionByClass(S, lex);
  const byClass = {}, coverage = {};
  let total = 0, rare = 0, mastered = 0;
  groups.forEach((g) => {
    byClass[g.cls] = g.seen;
    if (g.total >= COVERAGE_MIN_CLASS) coverage[g.cls] = g.pct;
    total += g.seen;
    mastered += g.mastered;
    rare += g.words.filter((w) => w.rare).length;
  });
  const corpus = groups.reduce((a, g) => a + g.total, 0);
  /* The alphabet badges: over the letters that begin a word in THIS
     vocabulary, so the target can always be reached. */
  const initial = (lemma) => String(lemma || "").trim().toLowerCase().charAt(0);
  const isLetter = (ch) => /\p{L}/u.test(ch);
  const lettersAll = new Set(lex.all.map((w) => initial(w.o)).filter(isLetter));
  const lettersHeld = new Set(groups.flatMap((g) => g.words.map((w) => initial(w.lemma)))
    .filter((ch) => lettersAll.has(ch)));
  /* v6.6: which words, not how many — themes, sayings, opposites, oddities —
     and how the collection is doing (core/wordsets.js, core/wordhealth.js). */
  const held = groups.flatMap((g) => g.words);
  const health = vocabScore(S, lex);
  const drills = S.drills || {};
  return {
    sets: readSets(held),
    weak: health.weak, strong: health.strong, judged: health.judged,
    health: health.health, score: health.score,
    rescued: rescueCount(S),
    kept: Object.entries(drills).filter(([k, d]) => keptAfloat(S.words[k], d)).length,
    letters: lettersHeld.size, lettersTotal: lettersAll.size,
    total, rare, mastered, byClass, coverage,
    classesTouched: groups.filter((g) => g.seen > 0).length,
    fl: new Set(groups.filter((g) => g.seen > 0).map((g) => g.fl)).size,
    corpus,
    /* The crown badge requires that *every single* word has been met. Counted
       here rather than in the badge, so that the condition and the number the
       collection shows are one and the same. */
    everyWord: corpus > 0 && total >= corpus,
  };
}

/** Is this the first time the child has met this word? Call before record(). */
export function isNewWord(S, lemma, cls) {
  return !S.words[wordKey(lemma, cls)];
}
