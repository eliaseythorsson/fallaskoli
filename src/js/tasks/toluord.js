/* Töluorð: frumtölur og raðtölur.

     tbl_to   beygingartafla
     to_samr  a cardinal 1–4 written to agree with its noun ("Ég á ___ (2) systur")
     to_val   the same item as a choice between forms
     to_dags  the ordinal in a date ("Í dag er ___ (3.) maí")
     to_flt   einir, tvennir, þrennir, fernir with a plural-only noun

   All but the table are hand-written items (data/exercises.js). to_samr and
   to_flt are spaced like vocabulary (`pickVocab` in tasks/shared.js). */

import { EX } from "../../../data/exercises.js";
import { CASES, GENDERS } from "../core/marks.js";
import { wordKey } from "../core/state.js";
import { built, FX } from "./effects.js";
import { pick, wpick, shuffle, randInt, bandFor, levelFor, forced, drilling, wordWeight,
         sameInEveryCell, cap1, caseWord, textSentence, fresh, lexWord, pickVocab } from "./shared.js";

/* ================= Beygingartafla ======================================== */

export function tableNumeral(lex, view, rng) {
  const { sess } = view;
  const pool = [...(lex.byClass.to || []), ...(lex.byClass.rt || [])];
  if (!pool.length) return null;
  if (drilling(view) && !forced(view, ["to", "rt"])) return null;
  const w = forced(view, ["to", "rt"]) || wpick(pool, (x) => wordWeight(lex, view, x, "toluord"), rng);
  const kyn = pick(["KK", "KVK", "HK"], rng);
  /* The singular where the word has one — *einn*, *annar*, *þriðji* — and
     the plural for *tveir*, *þrír*, *fjórir*, which have nothing else. The
     order used to be the other way round, so *einn* was only ever asked as
     *einir* and every ordinal as four identical cells (*þriðju* × 4); a
     table like that is skipped now, whichever number it is. */
  for (const num of ["ET", "FT"]) {
    const cells = CASES
      .map((cs) => ({ m: `${kyn}-${(cs.k === "ÞG" ? "ÞGF" : cs.k)}${num}`, label: cs.name }))
      .filter((c) => w.forms[c.m]);
    if (cells.length < 4) continue;
    if (sameInEveryCell(w, cells)) continue;
    if (!view.policy.marks(cells.map((c) => c.m))) continue;
    return built({
      type: "table", kind: "to", skill: "toluord", w, cells,
      title: `${w.o} · ${GENDERS[kyn.toLowerCase()]} ${num === "ET" ? "eintala" : "fleirtala"}`,
      base: 5, word: wordKey(w.o, w.c), lvl: bandFor(view, "toluord"), paradigm: w.forms,
    });
  }
  return null;
}

/* ================= In a sentence (v6.11) ================================= */

/** "Ég á ___ (2) systur." → tvær */
export function toAgree(lex, view, rng) {
  const P = view.policy;
  const b = bandFor(view, "toluord");
  const items = EX.numeralAgree.filter((x) => P.mark(x.m) && (b >= 2 || x.case !== "EF"));
  if (!items.length) return null;
  const v = pickVocab(view, rng, "samhengi", items, (y) => y.t,
    (y) => { const e = lex.lookup(y.a.o, y.a.c); return e && e.r ? e.r : 5000; });
  if (!v) return null;
  const x = v.x;
  const { s, i } = textSentence(x.t);
  const cap = i === 0;
  const noun = s.tok[i + 1].w;
  return built({
    type: "gap", skill: "toluord", s, i, cue: String(x.n),
    answers: x.a.map((f) => (cap ? cap1(f) : f)), m: x.m, paradigm: EX.para[`${x.l}|${x.c}`] || null,
    title: "Skrifaðu töluna með bókstöfum", lemmaLabel: "frumtala",
    hint: "Töluorðið lagar sig að nafnorðinu á eftir því.",
    why: `*${noun}* er ${GENDERS[x.g]}, ${caseWord(x.case)}, ${x.n === 1 ? "eintala" : "fleirtala"} — og töluorðið líka: **${x.a[0]}**.`,
    base: 10, lvl: levelFor(P, x.case === "EF" ? 3 : x.case === "ÞGF" ? 2 : 1),
    cell: "to:" + x.m, word: lexWord(lex, x.l, x.c), tags: [], cap, numeral: x,
  }, [v.fx]);
}

/** The same item as a choice between forms of the numeral. */
export function toChoice(lex, view, rng) {
  const P = view.policy;
  const items = EX.numeralAgree.filter((x) => P.mark(x.m) && x.n > 1);
  if (!items.length) return null;
  const x = pick(fresh(view, (y) => "c" + y.t, items), rng);
  const para = EX.para[`${x.l}|${x.c}`] || {};
  const right = new Set(x.a);
  /* Wrong options a pupil actually writes: another gender in the same case,
     another case in the same gender. */
  const kyn = x.m.split("-")[0];
  /* One form per cell: *tveimur* and *tveim* are the same answer. */
  const near = Object.entries(para)
    .filter(([m]) => m.startsWith(kyn + "-") || m.endsWith("-" + x.case + "FT"))
    .map(([, ff]) => ff[0]).filter((f) => !right.has(f));
  const others = Object.values(para).map((ff) => ff[0]).filter((f) => !right.has(f));
  const opts = [...new Set([...shuffle(near, rng), ...shuffle(others, rng)])].slice(0, 3);
  if (opts.length < 2) return null;
  const { s, i } = textSentence(x.t);
  const cap = i === 0;
  const fix = (f) => (cap ? cap1(f) : f);
  return built({
    type: "choice", skill: "toluord", s, i, cue: String(x.n),
    title: "Veldu rétta mynd töluorðsins", question: `Hvaða mynd af *${x.l}* passar í eyðuna?`,
    options: shuffle([x.a[0], ...opts], rng).map(fix), answer: fix(x.a[0]),
    why: `Nafnorðið er ${GENDERS[x.g]}, ${caseWord(x.case)}, fleirtala — töluorðið líka: **${x.a[0]}**.`,
    base: 8, lvl: levelFor(P, 2), cell: "to:" + x.m, word: lexWord(lex, x.l, x.c),
    m: x.m, paradigm: para, tags: [],
  }, [FX.exSeen("c" + x.t)]);
}

/** "Í dag er ___ (3.) maí." → þriðji */
export function toDate(lex, view, rng) {
  const P = view.policy;
  const b = bandFor(view, "toluord");
  const D = EX.dates;
  const frames = D.frames.filter((f) => P.mark(`KK-${f.case}ET`));
  if (!frames.length) return null;
  const f = pick(frames, rng);
  const mi = randInt(12, rng);
  /* Up to 20 at first; the compounds (21., 22. …) from þyngd 2. */
  const top = b >= 2 ? D.days[mi] : Math.min(20, D.days[mi]);
  const d = 1 + randInt(top, rng);
  const answers = D.ord[d][f.case];
  const { s, i } = textSentence(f.t.replace("{M}", D.months[mi]));
  const cap = i === 0;
  const para = {};
  ["NF", "ÞF", "ÞGF", "EF"].forEach((c) => { para[`KK-${c}ET`] = D.ord[d][c]; });
  const m = `KK-${f.case}ET`;
  return built({
    type: "gap", skill: "toluord", s, i, cue: `${d}.`,
    answers: answers.map((x) => (cap ? cap1(x) : x)), m, paradigm: para,
    title: "Skrifaðu dagsetninguna", lemmaLabel: "raðtala",
    hint: "Raðtalan í dagsetningu er í karlkyni (dagurinn). Fallið fer eftir setningunni.",
    why: `${f.why} ${d === 2 || d === 22 ? "*Annar* beygist sterkt: annar, annan, öðrum, annars." : "Raðtölur beygjast eins og veik lýsingarorð: *þriðji, þriðja*."}`,
    base: 10, lvl: levelFor(P, d > 20 ? 3 : f.case === "NF" ? 1 : 2),
    cell: "to:dags-" + f.case, word: null, tags: [], cap,
  });
}

/** "Ég keypti ___ (2) buxur." → tvennar */
export function toPlural(lex, view, rng) {
  const P = view.policy;
  const KY = { kk: "KK", kvk: "KVK", hk: "HK" };
  const items = EX.pluralOnly.filter((x) => P.mark(`${KY[x.g]}-${x.case}FT`));
  if (!items.length) return null;
  const v = pickVocab(view, rng, "samhengi", items, (y) => y.t,
    (y) => { const e = lex.lookup(y.a.o, y.a.c); return e && e.r ? e.r : 5000; });
  if (!v) return null;
  const x = v.x;
  const { s, i } = textSentence(x.t);
  const cap = i === 0;
  const noun = s.tok[i + 1].w;
  return built({
    type: "gap", skill: "toluord", s, i, cue: String(x.n),
    answers: x.a.map((f) => (cap ? cap1(f) : f)), m: `${KY[x.g]}-${x.case}FT`, paradigm: null,
    plain: x.plain,
    title: "Töluorð með fleirtöluorði", lemmaLabel: "töluorð",
    hint: `*${x.noun}* er aðeins til í fleirtölu.`,
    why: `Orð sem eru aðeins til í fleirtölu (*buxur, skæri, gleraugu, tónleikar*) taka **einir, tvennir, þrennir, fernir**: *${x.a[0]} ${noun}*${x.plain.length ? ` — ekki *${x.plain[0]} ${noun}*` : ""}.`,
    base: 12, lvl: levelFor(P, 3), cell: "to:fleirtoluord", word: null,
    tags: ["plnum"], cap,
  }, [v.fx]);
}

export const TYPES = [
  { id: "tbl_to", skill: "toluord", weight: 3, renderer: "table",
    tags: ["agree:kyn", "case:EF", "case:NF", "case:ÞF", "case:ÞGF", "form", "num"],
    bands: [1],
    build: tableNumeral },
  { id: "to_samr", skill: "toluord", weight: 5, renderer: "gap",
    tags: ["agree:kyn", "case:EF", "case:NF", "case:ÞF", "case:ÞGF", "form", "num"],
    bands: [1, 2],
    build: toAgree },
  { id: "to_val", skill: "toluord", weight: 3, renderer: "choice",
    tags: ["agree:kyn", "case:EF", "case:NF", "case:ÞF", "case:ÞGF", "num"],
    bands: [1],
    build: toChoice },
  { id: "to_dags", skill: "toluord", weight: 4, renderer: "gap",
    tags: ["agree:kyn", "case:EF", "case:NF", "case:ÞF", "case:ÞGF", "form", "num"],
    bands: [1, 2],
    build: toDate },
  { id: "to_flt", skill: "toluord", weight: 3, renderer: "gap",
    tags: ["agree:kyn", "case:NF", "case:ÞF", "case:ÞGF", "num", "plnum"],
    bands: [1],
    build: toPlural },
];
