/* Töluorð: frumtölur og raðtölur.

     tbl_to   beygingartafla
     to_samr  a cardinal 1–4 written to agree with its noun ("Ég á ___ (2) systur")
     to_val   the same item as a choice between forms
     to_dags  the ordinal in a date ("Í dag er ___ (3.) maí")
     to_flt   einir, tvennir, þrennir, fernir with a plural-only noun

   All but the table are hand-written items (data/exercises.js), each with
   its level; outside a review they are chosen near the pupil's band
   (shared.js `itemsForBand`, critique item 13).

   v6.13 (critique item 20): to_samr and to_flt are GRAMMAR, and are no
   longer spaced like vocabulary. Until now they went through `pickVocab`
   (tasks/shared.js): never the same item twice in a day, never within a
   week, a month after two showings. That suits the meaning of a word —
   known once, known — and is the opposite of what numeral agreement needs,
   which is to be met again. They were also filed in the vocabulary record
   under the key of another question type ("samhengi", which is or_samhengi),
   and their frequency rank was looked up on the list of answers instead of
   the word, so every item had rank 5000 and was only ever reached when the
   rank window had widened all the way. Now:

     - a missed item comes back through the review queue (core/review.js):
       the next day, then after 3, 7 and 21 days;
     - within a visit an item is not asked twice while others are left
       (`itemsForBand` + `FX.exSeen`, tasks/shared.js — the gate to_val always
       had), and near the pupil's band by the item's level;
     - nothing is written to the vocabulary record, and no rank is read: the
       items are numerals one to four, and all of them are for everybody.   */

import { EX } from "../../../data/exercises.js";
import { CASES, GENDERS } from "../core/marks.js";
import { wordKey } from "../core/state.js";
import { MORE_HELPER_NOUNS } from "../core/helpers.js";
import { showable } from "./frames.js";
import { built, FX } from "./effects.js";
import { pick, wpick, shuffle, randInt, bandFor, levelFor, forced, drilling, forcedCell,
         forcedItem, wordWeight, cellWeight, sameInEveryCell, cap1, caseWord, textSentence,
         itemsForBand, nearBand, lexWord } from "./shared.js";

/* What a review may ask of the hand-written numeral items (tasks/review.js):
   the cell ("to:KVK-ÞFFT") and the numeral (*tveir*). Both or nothing. */
const numeralAsked = (view) => {
  const fc = forcedCell(view), fw = forced(view, ["to"]);
  return (x) => (!fc || "to:" + x.m === fc) && (!fw || (x.l === fw.o && x.c === fw.c));
};

/* ================= Beygingartafla ======================================== */

/* What the table asks about at each difficulty (critique item 13; until
   v6.13 every numeral at every band): the cardinals that inflect (einn …
   fjórir) at þyngd 1; the five commonest ordinals (annar, þriðji, fjórði,
   sjötti, fimmti) join them from 2; every ordinal from 3. `r` is the rank
   within the class. */
const ORDINAL_RANK_BY_BAND = [0, 0, 5, Infinity];
const ordinalRankCap = (b) => ORDINAL_RANK_BY_BAND[Math.min(b, 3)];

export function tableNumeral(lex, view, rng) {
  const b = bandFor(view, "toluord");
  const pool = [...(lex.byClass.to || []),
    ...(lex.byClass.rt || []).filter((x) => x.r <= ordinalRankCap(b))];
  if (!pool.length) return null;
  if (drilling(view) && !forced(view, ["to", "rt"])) return null;
  /* A review (tasks/review.js) asks for the table its cell is in — of the
     review's own word, or of a numeral that has such a table (most ordinals
     have no plural worth asking: *þriðju* × 4). */
  const fc = forcedCell(view);
  const f = /^(KK|KVK|HK)-/.exec(fc || "");
  if (fc && !f) return null;
  const able = fc && !forced(view, ["to", "rt"]) ? pool.filter((x) => numeralCells(view, x, f[1], fc)) : pool;
  if (!able.length) return null;
  const w = forced(view, ["to", "rt"]) || wpick(able, (x) => wordWeight(lex, view, x, "toluord"), rng);
  const kyn = f ? f[1] : pick(["KK", "KVK", "HK"], rng);
  const made = numeralCells(view, w, kyn, fc);
  if (!made) return null;
  const { num } = made;
  /* A noun beside every cell, as in the adjective table (item 23): *tveir
     hestar, tvo hesta, tveimur hestum, tveggja hesta*. Until v6.13 the table
     was the bare numeral, and at þyngd 1 there were twelve tables in all.
     An ordinal stands with the article: *þriðji dagurinn*. A review asks for
     the cell, not the noun, so it gets one too. */
  const noun = pick(tableNouns(lex, kyn.toLowerCase(), num), rng);
  const gr = w.c === "rt" ? "gr" : "";
  const cells = made.cells.map((c) => {
    const f = noun && noun.forms[c.m.replace(/^(KK|KVK|HK)-/, "") + gr];
    return f ? { ...c, helper: f[0] } : c;
  });
  return built({
    type: "table", kind: "to", skill: "toluord", w, cells,
    title: `${w.o} · ${GENDERS[kyn.toLowerCase()]} ${num === "ET" ? "eintala" : "fleirtala"}`,
    base: 5, word: wordKey(w.o, w.c), lvl: bandFor(view, "toluord"), paradigm: w.forms,
  });
}

/* The nouns a numeral table may show: the everyday helper nouns of the
   pronoun table, and the commonest countable things and animals of the
   lexicon (noun_classes.py) that have the forms — never a mass noun or one
   nobody says in the plural. Once per lexicon, gender and number. */
const COUNTED = new Set(["animal", "object", "vehicle", "building", "furniture", "book"]);
const TABLE_NOUNS = new WeakMap();
function tableNouns(lex, g, num) {
  let m = TABLE_NOUNS.get(lex);
  if (!m) TABLE_NOUNS.set(lex, (m = new Map()));
  const key = g + num;
  if (!m.has(key)) {
    const named = MORE_HELPER_NOUNS[g].map((o) => lex.lookup(o, g)).filter(Boolean);
    const common = lex.nouns.filter((w) => w.c === g && COUNTED.has(w.s) && !w.nx && !w.np)
      .sort((a, b) => a.r - b.r).slice(0, 20);
    const all = [...new Map([...named, ...common].map((w) => [w.o, w])).values()]
      .filter((w) => showable(w, num) && ["NF", "ÞF", "ÞGF", "EF"].every((c) => w.forms[c + num] && w.forms[c + num + "gr"]));
    m.set(key, all);
  }
  return m.get(key);
}

/** The four cells of a numeral's table in one gender, or null. With `fc`,
    only the table that cell is in. */
function numeralCells(view, w, kyn, fc = null) {
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
    if (fc && !cells.some((c) => c.m === fc)) continue;
    if (sameInEveryCell(w, cells)) continue;
    if (!view.policy.marks(cells.map((c) => c.m))) continue;
    return { cells, num };
  }
  return null;
}

/* ================= In a sentence (v6.11) ================================= */

/* v6.13 (critique item 23): the hand-written items and the frames of
   exercises.py NUMERAL_FRAMES and PLURAL_ONLY_FRAMES, with nouns chosen by
   meaning (noun_classes.py) and every form out of BÍN (build_exercises.py).
   The frames are expanded here, once per data file, into items of the same
   shape as the hand-written ones, so everything below treats both alike. */
const CARD = { 1: ["einn", "to"], 2: ["tveir", "to"], 3: ["þrír", "to"], 4: ["fjórir", "to"] };
const KY = { kk: "KK", kvk: "KVK", hk: "HK" };

let NUMERAL_ITEMS = null;
export function numeralItems() {
  if (NUMERAL_ITEMS) return NUMERAL_ITEMS;
  const out = [...EX.numeralAgree];
  const have = new Set(out.map(agreeKey));
  for (const f of EX.numeralFrames || []) {
    for (const [noun, g, sg, pl] of f.nouns) {
      for (const n of f.ns) {
        const num = n === 1 ? "ET" : "FT";
        const nf = n === 1 ? sg : pl;
        if (!nf) continue;                       // no plural anyone says
        const [l, c] = CARD[n];
        const m = `${KY[g]}-${f.case}${num}`;
        const a = (EX.para[`${l}|${c}`] || {})[m];
        if (!a) continue;
        const x = { t: f.t.replace("{N}", nf), n, noun, g, case: f.case, l, c, m, a, lvl: f.lvl };
        if (have.has(agreeKey(x))) continue;
        have.add(agreeKey(x));
        out.push(x);
      }
    }
  }
  return (NUMERAL_ITEMS = out);
}

let PLURAL_ITEMS = null;
export function pluralItems() {
  if (PLURAL_ITEMS) return PLURAL_ITEMS;
  const out = [...EX.pluralOnly];
  const have = new Set(out.map(pluralKey));
  const N = EX.pluralNumerals || {};
  for (const f of EX.pluralFrames || []) {
    for (const [noun, g, nf] of f.nouns) {
      for (const n of f.ns) {
        const cell = `${n}|${KY[g]}-${f.case}`;
        if (!N[cell]) continue;
        const x = { t: f.t.replace("{N}", nf), n, noun, g, case: f.case, a: N[cell],
          plain: n > 1 ? N[cell + "|plain"] || [] : [], lvl: f.lvl };
        if (have.has(pluralKey(x))) continue;
        have.add(pluralKey(x));
        out.push(x);
      }
    }
  }
  return (PLURAL_ITEMS = out);
}

/** "Ég á ___ (2) systur." → tvær */
export function toAgree(lex, view, rng) {
  const P = view.policy;
  if (drilling(view) && !forced(view, ["to"])) return null;
  const reviewing = !!(forcedCell(view) || forced(view, ["to"]));
  /* A review asks for what was missed, whatever its level; otherwise the
     items near the band (the genitive frames are level 3, so a beginner
     meets them only once the easier ones are used up). */
  const items = numeralItems().filter((x) => P.mark(x.m) && (!reviewing || numeralAsked(view)(x)));
  if (!items.length) return null;
  /* Not the same sentence twice in a visit while others are left, near the
     band; among those, the cells this pupil gets wrong come up more often
     (`cellWeight`: up to five times as often as one always right). */
  const near = reviewing ? items : itemsForBand(view, "toluord", items, agreeKey, 8);
  const x = wpick(near, (y) => cellWeight(view.S, "to:" + y.m), rng);
  const { s, i } = textSentence(x.t);
  const cap = i === 0;
  const noun = s.tok[i + 1].w;
  return built({
    type: "gap", skill: "toluord", s, i, cue: String(x.n),
    answers: x.a.map((f) => (cap ? cap1(f) : f)), m: x.m, paradigm: EX.para[`${x.l}|${x.c}`] || null,
    title: "Skrifaðu töluna með bókstöfum", lemmaLabel: "frumtala",
    hint: "Töluorðið lagar sig að nafnorðinu á eftir því.",
    why: `*${noun}* er ${GENDERS[x.g]}, ${caseWord(x.case)}, ${x.n === 1 ? "eintala" : "fleirtala"} — og töluorðið líka: **${x.a[0]}**.`,
    base: 10, lvl: levelFor(P, x.lvl),
    cell: "to:" + x.m, word: lexWord(lex, x.l, x.c), tags: [], cap, numeral: x,
  }, [FX.exSeen(agreeKey(x))]);
}

/* The keys the session remembers these items by (`sess.exSeen`). One sentence
   carries four items — "Ég á ___ (1/2/3/4) systur" — so the number is part of
   the key. to_val shares the sentences and has its own keys ("c" + …). */
const agreeKey = (x) => `a${x.n}:${x.t}`;
const pluralKey = (x) => `p${x.n}:${x.t}`;

/** The same item as a choice between forms of the numeral. */
export function toChoice(lex, view, rng) {
  const P = view.policy;
  if (drilling(view) && !forced(view, ["to"])) return null;
  const items = numeralItems().filter((x) => P.mark(x.m) && x.n > 1 && numeralAsked(view)(x));
  if (!items.length) return null;
  const reviewing = !!(forcedCell(view) || forced(view, ["to"]));
  const x = pick(reviewing ? items : itemsForBand(view, "toluord", items, (y) => "c" + y.t, 8), rng);
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
    base: 8, lvl: levelFor(P, x.lvl), cell: "to:" + x.m, word: lexWord(lex, x.l, x.c),
    m: x.m, paradigm: para, tags: [],
  }, [FX.exSeen("c" + x.t)]);
}

/** "Í dag er ___ (3.) maí." → þriðji */
export function toDate(lex, view, rng) {
  const P = view.policy;
  const b = bandFor(view, "toluord");
  const D = EX.dates;
  if (drilling(view)) return null;
  /* A review (tasks/review.js) asks for the case that was missed. */
  const frames = D.frames.filter((f) => P.mark(`KK-${f.case}ET`) &&
    (!forcedCell(view) || forcedCell(view) === "to:dags-" + f.case));
  if (!frames.length) return null;
  const f = pick(forcedCell(view) ? frames : nearBand(frames, (y) => y.lvl, b, 2), rng);
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
    /* the frame's level, and one more for a compound ordinal */
    base: 10, lvl: levelFor(P, Math.min(5, f.lvl + (d > 20 ? 1 : 0))),
    cell: "to:dags-" + f.case, word: null, tags: [], cap,
  });
}

/** "Ég keypti ___ (2) buxur." → tvennar */
export function toPlural(lex, view, rng) {
  const P = view.policy;
  if (drilling(view)) return null;
  /* A review (tasks/review.js) asks for the very item that was missed:
     *tvennar buxur* is known noun by noun. */
  const want = forcedItem(view);
  const items = pluralItems().filter((x) => P.mark(`${KY[x.g]}-${x.case}FT`) &&
    (!want || pluralKey(x) === want));
  if (!items.length) return null;
  if (!want && forcedCell(view) && forcedCell(view) !== "to:fleirtoluord") return null;
  const x = pick(want ? items : itemsForBand(view, "toluord", items, pluralKey), rng);
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
    base: 12, lvl: levelFor(P, x.lvl), cell: "to:fleirtoluord", word: null,
    /* What the review queue knows this item by (core/review.js `i`). */
    item: pluralKey(x),
    tags: ["plnum"], cap,
  }, [FX.exSeen(pluralKey(x))]);
}

export const TYPES = [
  { id: "tbl_to", skill: "toluord", weight: 3, renderer: "table",
    tags: ["agree:kyn", "case:EF", "case:NF", "case:ÞF", "case:ÞGF", "form", "num"],
    bands: [1, 2, 3],
    build: tableNumeral },
  { id: "to_samr", skill: "toluord", weight: 5, renderer: "gap",
    tags: ["agree:kyn", "case:EF", "case:NF", "case:ÞF", "case:ÞGF", "form", "num"],
    bands: [1, 2, 3, 4],
    build: toAgree },
  { id: "to_val", skill: "toluord", weight: 3, renderer: "choice",
    tags: ["agree:kyn", "case:EF", "case:NF", "case:ÞF", "case:ÞGF", "num"],
    bands: [1, 2, 3, 4],
    build: toChoice },
  { id: "to_dags", skill: "toluord", weight: 4, renderer: "gap",
    tags: ["agree:kyn", "case:EF", "case:NF", "case:ÞF", "case:ÞGF", "form", "num"],
    bands: [1, 2, 3],
    build: toDate },
  { id: "to_flt", skill: "toluord", weight: 3, renderer: "gap",
    tags: ["agree:kyn", "case:NF", "case:ÞF", "case:ÞGF", "num", "plnum"],
    bands: [1, 3, 4],
    build: toPlural },
];
