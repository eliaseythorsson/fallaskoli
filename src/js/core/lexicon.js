/* Looking things up in the vocabulary.

   The same surface form can belong to more than one word class — *ljós* is both
   a noun and an adjective, *á* is a noun, a verb and a preposition. The corpus
   is therefore keyed by bin_id, and a lemma points at a list, not at one
   word.                                                                    */

import { ordKey, CLASSNAME, readMark } from "./marks.js";
import { normalise } from "./grading.js";

/* The scores of the second difficulty axis (critique item 16) are read here
   and nowhere else:

     w.irr                 how irregular the word's paradigm is, 1–5 (nouns,
                           adjectives, verbs; absent on the closed classes)
     lex.cellHardness(m)   how hard the cell with BÍN mark `m` is, 1–5

   Both come out of the build (irregularity.py explains how they are
   measured; `DATA.lex.cellh` is the cell table). Item 17 — calibration from
   what pupils actually get wrong — changes them by passing `hardness` below:
   the builders never see where a score came from. */
const HARD_LO = 1, HARD_HI = 5;
const hardScore = (v) => (typeof v === "number" && Number.isFinite(v)
  ? Math.max(HARD_LO, Math.min(HARD_HI, v)) : null);

/**
 * @param DATA          the bundle
 * @param opts.hide     words to leave out entirely — the vocabulary filter
 *                      (`DATA.blocked`, on unless the administrator's
 *                      `safeVocab` says false). An entry is a lemma, which
 *                      hides it in every word class, or "lemma|class", which
 *                      hides one reading of a homograph (*drulla* the verb,
 *                      not the noun). Removed before anything indexes the
 *                      corpus, so they are absent from the exercises, the
 *                      collection and the totals alike.
 * @param opts.hardness scores that replace the build's (item 17):
 *                      { words: { "maður|kk": 4.5 }, cells: { "EFFT": 4 } } —
 *                      a word by `wordKey` (lemma|class), a cell by its BÍN
 *                      mark. Fractions are fine; values are held to 1–5 and
 *                      anything that is not a number is ignored.
 */
export function buildLexicon(DATA, { hide = null, hardness = null } = {}) {
  const ORD = DATA.lex.orders;
  const skip = hide && hide.size ? hide : null;
  const adjWord = (hardness && hardness.words) || {};
  const adjCell = (hardness && hardness.cells) || {};

  /* mark → hardness. The same mark means the same cell wherever it stands
     (a noun's NFET and a personal pronoun's), and the build gives it the
     same score, so one flat table serves every class. */
  const cellHard = new Map();
  Object.entries(DATA.lex.cellh || {}).forEach(([key, digits]) =>
    (ORD[key] || []).forEach((m, i) => {
      const h = hardScore(Number(String(digits)[i]));
      if (h != null) cellHard.set(m, h);
    }));
  Object.entries(adjCell).forEach(([m, v]) => {
    const h = hardScore(v);
    if (h != null) cellHard.set(m, h);
  });

  const hidden = (w) => skip.has(w.o) || skip.has(`${w.o}|${w.c}`);
  const W = (skip ? DATA.lex.w.filter((w) => !hidden(w)) : DATA.lex.w).map((w) => {
    const key = ordKey(w.c);
    const cells = String(w.f).split(";");
    const forms = {};
    if (key && ORD[key]) {
      ORD[key].forEach((m, i) => { if (cells[i]) forms[m] = cells[i].split("|"); });
    } else {
      forms.OBEYGJANLEGT = [w.f];
    }
    const out = { ...w, lemma: w.o, forms, fl: CLASSNAME[w.c] || w.c };
    const adj = hardScore(adjWord[`${w.o}|${w.c}`]);
    if (adj != null) out.irr = adj;
    return out;
  });

  const byClass = {};
  const byLemma = new Map();     // lemma -> [word, ...]  (samhljóða orð haldast)
  const byId = new Map();

  W.forEach((w) => {
    (byClass[w.c] ||= []).push(w);
    const list = byLemma.get(w.o) || [];
    list.push(w);
    byLemma.set(w.o, list);
    if (w.i != null) byId.set(String(w.i), w);
  });

  const nouns = [...(byClass.kk || []), ...(byClass.kvk || []), ...(byClass.hk || [])];

  /* Looking up by surface form is expensive in memory, so the index is built
     on first use and only then.                                           */
  let surfaceIndex = null;
  function surfaces() {
    if (surfaceIndex) return surfaceIndex;
    surfaceIndex = new Map();
    for (const w of W) {
      for (const [m, forms] of Object.entries(w.forms)) {
        for (const f of forms) {
          const k = normalise(f);
          if (!k) continue;
          const list = surfaceIndex.get(k) || [];
          list.push({ w, mark: m });
          surfaceIndex.set(k, list);
        }
      }
    }
    return surfaceIndex;
  }

  /* ---------- confirmed tokens in the sentence bank ---------------------
     A second safety net, independent of the build's guard. A token is usable in
     a question only if its lemma is in the vocabulary under this class, BÍN has
     the mark the parse produced, and the surface form in the sentence is one of
     BÍN's forms for that mark — so a question cannot ask for a form that does
     not belong in its own sentence. */

  /* Greynir names a word class ("nafnorð"); the lexicon files it by BÍN code
     ("kk"). One Greynir name covers three noun classes and the mark carries no
     gender, so the entry is found by asking which class has the mark. */
  const CLS_OF_FL = {
    "nafnorð": ["kk", "kvk", "hk"], "lýsingarorð": ["lo"], "sagnorð": ["so"],
    "fornafn": ["fn", "pfn"], "greinir": ["gr"], "töluorð": ["to", "rt"],
    "atviksorð": ["ao"], "forsetning": ["fs"], "samtenging": ["st"],
    "upphrópun": ["uh"], "nafnháttarmerki": ["nhm"],
  };

  let confirmed = null;
  function buildConfirmed() {
    confirmed = { byFl: {}, byWord: new Map() };
    (DATA.sent || []).forEach((s) => {
      s.tok.forEach((t, i) => {
        if (!t.m || t.rj || !t.c) return;
        const classes = CLS_OF_FL[t.c];
        if (!classes) return;
        let entry = null;
        for (const c of classes) {
          const cand = (byLemma.get(t.l) || []).find((w) => w.c === c);
          if (cand && cand.forms[t.m]) { entry = cand; break; }
        }
        if (!entry) return;
        const want = normalise(t.w);
        if (!entry.forms[t.m].some((f) => normalise(f) === want)) return;
        const rec = { s, i, t, w: entry };
        (confirmed.byFl[t.c] ||= []).push(rec);
        const k = `${entry.o}|${entry.c}`;
        const list = confirmed.byWord.get(k) || [];
        list.push(rec);
        confirmed.byWord.set(k, list);
      });
    });
    return confirmed;
  }
  const conf = () => confirmed || buildConfirmed();

  let tokenKeys = null;
  const api = {
    all: W,
    /** Which lemmas were left out, if any. The interface says so rather than
        letting a child wonder why a word they met yesterday has gone. */
    hidden: skip ? [...skip] : [],
    byClass,
    nouns,
    adjectives: byClass.lo || [],
    verbs: byClass.so || [],
    sentences: DATA.sent,

    /** How hard the cell with this BÍN mark is, 1–5, or null if it has no
        score (see the top of this file). */
    cellHardness: (m) => cellHard.get(m) ?? null,

    /** Sentence tokens of a word class that are safe to build a question on. */
    slotsFor: (fl) => conf().byFl[fl] || [],

    /** Confirmed sentence occurrences of one particular lemma+class. */
    occurrencesOf: (lemma, cls) => conf().byWord.get(`${lemma}|${cls}`) || [],

    /** Every entry sharing this lemma, across word classes. */
    lemma: (l) => byLemma.get(l) || [],

    /** One entry: lemma plus class, or lemma plus a class predicate. */
    lookup(l, cls) {
      const list = byLemma.get(l) || [];
      if (!cls) return list[0] || null;
      return list.find((w) => w.c === cls)
        || list.find((w) => CLASSNAME[w.c] === cls)
        || null;
    },

    byId: (id) => byId.get(String(id)) || null,

    /**
     * The lexicon entry a parsed sentence token refers to, resolved through
     * the word class name and, for nouns, the mark — so the key written is
     * `vindur|kk`, never Greynir's `vindur|no`, which nothing could look up.
     */
    entryForToken(t) {
      if (!t || !t.l) return null;
      const classes = CLS_OF_FL[t.c];
      if (classes) {
        const list = byLemma.get(t.l) || [];
        if (t.m) {
          const exact = list.find((w) => classes.includes(w.c) && w.forms[t.m]);
          if (exact) return exact;
        }
        const any = list.find((w) => classes.includes(w.c));
        if (any) return any;
      }
      return api.lookup(t.l, t.x) || api.lookup(t.l, t.c) || null;
    },

    /** Does this word stand anywhere in the sentence bank? (v6.6: the rescue
        drill can only ask about an indeclinable word in a sentence.) Built
        the first time it is asked. */
    inSentences(lemma, cls) {
      if (!tokenKeys) {
        tokenKeys = new Set();
        (DATA.sent || []).forEach((s) => s.tok.forEach((t) => {
          const e = api.entryForToken(t);
          if (e) tokenKeys.add(`${e.o}|${e.c}`);
        }));
      }
      return tokenKeys.has(`${lemma}|${cls}`);
    },

    /** Is this lemma a homograph across classes? */
    homographClasses: (l) => [...new Set((byLemma.get(l) || []).map((w) => w.c))],

    /** Candidate analyses for a surface form, for agreement hints. */
    analyse(form) {
      const hits = surfaces().get(normalise(form)) || [];
      return hits.map(({ w, mark }) => ({
        lemma: w.o, cls: w.c, fl: w.fl, mark, ...readMark(mark),
      }));
    },

    /** True if this surface form is ambiguous across word classes. */
    ambiguousClass(form) {
      const hits = surfaces().get(normalise(form)) || [];
      return new Set(hits.map((h) => h.w.c)).size > 1;
    },
  };

  return api;
}
