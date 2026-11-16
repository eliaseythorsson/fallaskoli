/* Orðflokkagreining.

     parse      "Greindu orðið": a word in a bank sentence, its class and every
                inflectional feature
     gr_smella  click every word of one class in a sentence
     gr_flokka  sort dictionary forms into their classes

   The analysis of a form out of BÍN (revform) is in lysingarord.js. */

import { EX } from "../../../data/exercises.js";
import { readMark } from "../core/marks.js";
import { wordKey } from "../core/state.js";
import { built } from "./effects.js";
import { tapTask } from "./tap.js";
import { pick, wpick, shuffle, askable, bandFor, levelFor, sentPool, tokenKey } from "./shared.js";

/* ================= Greining ============================================== */

/* The reverse question: the word stands inflected in the sentence and the child
   analyses it. Which word is chosen matters — if it were random, 80% of the
   questions would land on nouns and verb moods and comparison would barely be
   seen. The choice is therefore weighted by word class and by what has turned
   out to be difficult. */
const PARSE_PREF = {
  "lýsingarorð": 5, "sagnorð": 3.2, "fornafn": 1.6, "nafnorð": 1.4,
  "töluorð": 2.5, "greinir": 2, "atviksorð": 0.8, "forsetning": 0.6,
  "samtenging": 0.5, "upphrópun": 0.5, "nafnháttarmerki": 0.5,
};

export function taskParse(lex, view, rng) {
  const { sess, S } = view;
  for (let k = 0; k < 80; k++) {
    const s = pick(sentPool(lex, view, "greining"), rng);
    const cands = s.tok
      .map((t, j) => ({ t, j }))
      .filter(({ t }) => t.c && !t.rj && !isAmbiguousForm(lex, t) && askable(view.policy, t.m));
    if (!cands.length) continue;

    const chosen = wpick(cands, ({ t }) => {
      let w = PARSE_PREF[t.c] ?? 1;
      const cell = t.m || "ofl:" + t.c;
      const rec = S.cells[cell];
      if (rec) {
        const n = rec.c + rec.w;
        if (n >= 3) w *= 0.6 + 2.4 * (rec.w / n);   // what goes wrong comes back
      } else w *= 1.5;                              // ósnert kemur fyrr
      return w;
    }, rng);

    const { t, j: i } = chosen;
    return built({
      type: "parse", skill: "greining", s, i, t,
      a: t.m ? readMark(t.m) : {}, picks: {}, base: 4,
      cell: t.m || "ofl:" + t.c, word: tokenKey(lex, t),
      lvl: s.lvl,
      homograph: lex.homographClasses(t.l).length > 1 ? lex.homographClasses(t.l) : null,
    });
  }
  return null;
}

/** Skip forms that are ambiguous about number or definiteness — a question
    with two defensible answers is worse than no question. */
function isAmbiguousForm(lex, t) {
  if (!t.m) return false;
  const w = lex.lookup(t.l, t.x) || lex.lookup(t.l, t.c);
  if (!w || !w.forms) return false;
  const a = readMark(t.m);
  return Object.entries(w.forms).some(([mm, ff]) => {
    if (!ff.includes(t.w)) return false;
    const b = readMark(mm);
    return b.tala && (b.tala !== a.tala || b.greinir !== a.greinir);
  });
}

/* The word first, wherever it stands in the sentence bank — a rescue drill
   (tasks/drill.js). The general builder above chooses its sentence first. */
export function taskParseWord(lex, view, rng, entry) {
  const P = view.policy;
  const occ = lex.occurrencesOf(entry.o, entry.c).filter((r) =>
    askable(P, r.t.m) && !(r.t.u || []).length && !r.t.rj && P.level(r.s.lvl) &&
    !isAmbiguousForm(lex, r.t));
  if (!occ.length) return null;
  const r = pick(occ, rng);
  return built({
    type: "parse", skill: "greining", s: r.s, i: r.i, t: r.t, a: readMark(r.t.m),
    picks: {}, base: 4, cell: r.t.m, word: wordKey(entry.o, entry.c), lvl: r.s.lvl,
    lemmaWord: entry,
    homograph: lex.homographClasses(entry.o).length > 1 ? lex.homographClasses(entry.o) : null,
  });
}

/* ================= Click and sort (v6.11) ================================ */

export const grTap = (lex, view, rng) => tapTask(lex, view, rng, "greining",
  ["nafnorð", "lýsingarorð", "sagnorð", "fornafn", "atviksorð", "forsetning", "töluorð"],
  { "nafnorð": 3, "sagnorð": 3, "lýsingarorð": 2.5, "fornafn": 2, "atviksorð": 1.5, "forsetning": 1.5, "töluorð": 0.6 });

/* Sort words into classes: dictionary forms that are one class whatever BÍN
   entry they are read as (build_exercises.py), so a bare word is never a
   trick question. */
export function grSort(lex, view, rng) {
  const P = view.policy;
  const src = EX.sortable;
  const CLS = { "nafnorð": ["kk", "kvk", "hk"], "lýsingarorð": ["lo"], "sagnorð": ["so"],
    "fornafn": ["fn", "pfn"], "töluorð": ["to", "rt"], "atviksorð": ["ao"] };
  const usable = Object.keys(CLS).filter((c) => (src[c] || []).some((o) => CLS[c].some((x) => lex.lookup(o, x))));
  if (usable.length < 3) return null;
  const chosen = shuffle(usable, rng).slice(0, 3);
  const items = [];
  /* The lists run from the commonest word; each step of difficulty lets in
     ten more. The question is labelled by its rarest word: within the first
     25 → 1, then a level for every ten (v6.13: it said þyngd 1 at every
     band, critique item 13). */
  let deepest = 0;
  chosen.forEach((c) => {
    const words = shuffle((src[c] || []).slice(0, 15 + 10 * bandFor(view, "greining"))
      .filter((o) => CLS[c].some((x) => lex.lookup(o, x))), rng);
    words.slice(0, 2).forEach((w) => {
      items.push({ w, cls: c });
      deepest = Math.max(deepest, src[c].indexOf(w));
    });
  });
  if (items.length < 6) return null;
  const extra = shuffle(Object.keys(CLS).filter((c) => !chosen.includes(c)), rng)[0];
  return built({
    type: "sort", skill: "greining", s: null, items: shuffle(items, rng),
    buckets: Object.keys(CLS).filter((c) => chosen.includes(c) || c === extra),
    title: "Flokkaðu orðin", question: "Í hvaða orðflokki er hvert orð? Orðin standa í orðabókarmynd.",
    base: 12, lvl: levelFor(P, Math.min(5, 1 + Math.max(0, Math.ceil((deepest + 1 - 25) / 10)))),
    cell: "sort:greining", word: null, tags: ["ofl"],
  });
}

export const TYPES = [
  { id: "parse", skill: "greining", weight: 11, renderer: "parse",
    tags: ["adj", "case:EF", "case:NF", "case:ÞF", "case:ÞGF", "noun", "num", "ofl",
      "verb:agree", "verb:mm", "verb:tense", "verb:vh"],
    bands: [1, 2, 3, 4, 5, 6, 7],
    build: taskParse, drill: taskParseWord },
  { id: "gr_smella", skill: "greining", weight: 5, renderer: "tap",
    tags: ["ofl", "ofl:ao_fs"],
    bands: [1, 2, 3, 4, 5, 6],
    build: grTap },
  { id: "gr_flokka", skill: "greining", weight: 4, renderer: "sort",
    tags: ["ofl"],
    bands: [1, 2, 3, 4, 5],
    build: grSort },
];
