/* Nafnorð: föll, tala, greinir.

     fill     the cloze — a noun written in the form its sentence asks for;
              now and then with an adjective or *þessi* beside it, and the
              question then counts for that category
     no_val   the same cloze as a choice between the noun's case forms
     tbl_no   beygingartafla: all four cases of one column
     no_beyging  sterk or veik, by the genitive singular as Lesefni teaches
              it (item 27); from þyngd 5 the pupil writes the genitive too

   The cloze itself is in tasks/cloze.js (Fallstjórn uses it too). */

import { CASES, COLS, mark } from "../core/marks.js";
import { diffOf } from "../core/difficulty.js";
import { skillLevel } from "../core/progress.js";
import { wordKey } from "../core/state.js";
import { explainAdjective } from "./explain.js";
import { showable, fittingAdjectives } from "./frames.js";
import { built } from "./effects.js";
import { withView } from "./view.js";
import { nounCloze } from "./cloze.js";
import { pick, wpick, shuffle, askable, bandFor, forced, drilling, forcedCell, wordWeight,
         cellWeight, cap1, topByRank } from "./shared.js";

/* ================= Cloze — noun (± adjective) =========================== */

export function taskFill(lex, view, rng) {
  const { S, sess } = view;
  const pPhrase = Math.min(0.5, 0.05 * (diffOf(sess, "nafnord") - 1) +
    0.03 * (skillLevel(S.skills.nafnord.xp).level - 1));
  const pDem = Math.min(0.45, 0.25 + 0.05 * (diffOf(sess, "nafnord") - 1));

  const P = view.policy;
  const task = nounCloze(lex, view, rng, { noun: view.forcedNoun, balanced: true });
  if (!task) return null;
  const { s, n, a } = task;
  const t = s.tok[s.slot];

  /* An adjective or demonstrative is only added when that material is on —
     and only where one can stand. Beside a numeral, a pronoun, an adjective
     or the article it cannot: "Tveir þessir hestar", "Ég á góða þessa vini",
     "Sú góð kona". And *þessi* is not put before a word that is the
     predicative of *þetta* ("Þetta er þessi hugmynd"). */
  const mayAdj = P.skill("lysingarord");
  const mayDem = P.skill("fornofn");
  const MODIFIER = ["töluorð", "lýsingarorð", "fornafn", "greinir"];
  const prev = s.tok[s.slot - 1], next = s.tok[s.slot + 1];
  const crowded = s.fixed || (prev && (MODIFIER.includes(prev.c) || prev.rj))
    || (next && (MODIFIER.includes(next.c) || next.rj));
  const afterThetta = t.r === "sagnfylling";
  /* A review (tasks/review.js) asks for the noun as it was missed, bare. */
  if (!view.force && !crowded && (mayAdj || mayDem) && rng() < pPhrase) {
    const kyn = n.c.toUpperCase();
    const cn = (a.fall === "ÞG" ? "ÞGF" : a.fall) + (a.tala === "fleirtala" ? "FT" : "ET");
    if (mayDem && rng() < pDem && !a.greinir && !afterThetta) {
      const d = lex.lookup("þessi", "fn");
      const dm = `${kyn}-${cn}`;
      const f = d && askable(P, dm) && d.forms[dm];
      if (f) {
        task.extra = { lemma: "þessi", fl: "ábendingarfornafn", form: f[0] };
        task.answers = n.forms[t.m].map((x) => f[0] + " " + x);
        task.skill = "fornofn";
        task.base = 13;
        task.why = "Ábendingarfornafnið *þessi* lagar sig að nafnorðinu: það stendur í sama kyni, sömu tölu og sama falli. Nafnorð sem stendur með *þessi* fær ekki greini.";
      }
    } else if (mayAdj) {
      /* Not any adjective: one that suits this kind of noun. A random one
         out of 980 gave "óléttir lyklar". A noun of a class with no fitting
         adjective (an abstract, a body part, weather) is asked bare. */
      const pool = fittingAdjectives(n.s).map((o) => lex.lookup(o, "lo")).filter(Boolean);
      const adj = pool.length ? pick(pool, rng) : null;
      const deg = a.greinir ? "FVB" : "FSB";
      const am = `${deg}-${kyn}-${cn}`;
      const f = adj && askable(P, am) && adj.forms[am];
      if (f) {
        task.extra = { lemma: adj.o, fl: "lýsingarorð", form: f[0] };
        task.answers = n.forms[t.m].map((x) => f[0] + " " + x);
        task.skill = "lysingarord";
        task.base = 14;
        task.adjective = adj;
        task.why = explainAdjective(a);
      }
    }
  }
  return built(task);
}

/** The cloze on one given noun — a rescue drill (tasks/drill.js). */
const fillWord = (lex, view, rng, entry) => taskFill(lex, withView(view, { forcedNoun: entry }), rng);

/* ================= Choice between case forms (v6.11) ==================== */

/** The cloze as a choice between the noun's case forms. */
export function noChoice(lex, view, rng) {
  const t = nounCloze(lex, view, rng);
  if (!t) return null;
  const col = t.m.replace(/^(NF|ÞF|ÞGF|EF)/, "");
  const right = new Set(t.answers);
  const opts = [...new Set(["NF", "ÞF", "ÞGF", "EF"].map((c) => (t.n.forms[c + col] || [])[0])
    .filter((f) => f && !right.has(f)))];
  if (opts.length < 2) return null;
  const cap = t.i === 0;
  const fix = (f) => (cap ? cap1(f) : f);
  return built({
    type: "choice", skill: "nafnord", s: t.s, i: t.i, cue: t.n.o,
    title: "Veldu rétt fall", question: `Í hvaða mynd á *${t.n.o}* að standa?`,
    options: shuffle([t.answers[0], ...opts.slice(0, 3)], rng).map(fix), answer: fix(t.answers[0]),
    why: t.why, base: 7, lvl: t.lvl, cell: t.cell, word: t.word,
    m: t.m, paradigm: t.n.forms, tags: [],
  });
}

/* ================= Beygingartafla ======================================== */

/* A beygingartafla asks four or six cells at once, so it is only built when
   EVERY cell in it is allowed. Filtering the rows instead would produce a table
   with a hole in it, which teaches the wrong shape of the paradigm — the point
   of the table is that it is complete. */
export function tableNoun(lex, view, rng) {
  const { S } = view;
  const P = view.policy;
  if (drilling(view) && !forced(view, ["kk", "kvk", "hk"])) return null;
  /* The columns of one noun that may be asked: all four cases must exist,
     the column must be showable for the word (no plural of *friður*), and
     the policy must allow every cell in it. */
  const colsOf = (n) => COLS.filter((c) => CASES.every((cs) => n.forms[mark(cs.k, c.k)])
    && showable(n, mark("NF", c.k))
    && P.marks(CASES.map((cs) => mark(cs.k, c.k))));
  /* A review asks for the column its cell is in. */
  const fc = forcedCell(view);
  const hasCell = (c) => CASES.some((cs) => mark(cs.k, c.k) === fc);
  /* When a review asks for a cell, the noun is chosen AMONG THE NOUNS THAT
     HAVE IT. Picking any noun first and then finding it has no plural turned
     a large share of reviews into nothing once the frequency ranks favoured
     singular-only abstract nouns (item 9) — a pupil's mistake in the plural
     then waited for a lucky draw. A forced word is still honoured as it is. */
  const n = forced(view, ["kk", "kvk", "hk"]) || wpick(
    fc ? lex.nouns.filter((x) => colsOf(x).some(hasCell)) : lex.nouns,
    (x) => wordWeight(lex, view, x, "nafnord"), rng);
  if (!n) return null;
  const cols = colsOf(n);
  if (!cols.length) return null;
  const mine = fc ? cols.filter(hasCell) : cols;
  if (!mine.length) return null;
  const col = fc ? mine[0]
    : wpick(cols, (c) => CASES.reduce((a, cs) => a + cellWeight(S, mark(cs.k, c.k)), 0), rng);
  return built({
    type: "table", kind: "no", skill: "nafnord", w: n,
    cells: CASES.map((cs) => ({ m: mark(cs.k, col.k), label: cs.name })),
    title: `${n.o} · ${col.name}`, base: 5, word: wordKey(n.o, n.c),
    lvl: bandFor(view, "nafnord"), paradigm: n.forms,
  });
}

/* ================= Sterk eða veik beyging (item 27) ===================== */

/* The rule exactly as Lesefni teaches it (content/lessons.js,
   "nafnord-beyging"): decline the word in the singular without the article
   and look at the GENITIVE SINGULAR (til …).
     - it ends in a consonant, usually -s or -ar  → sterk
     - the word ends in a vowel in every case of the singular → veik
   Every noun is sorted by that rule from its BÍN forms. Measured over the
   lexicon, the two cases cover all but four nouns (strætó, helgi, byrði,
   fiskveiði, each with a second genitive of the other kind); those, and the
   five the lesson calls irregular and says are learnt on their own, are
   never asked. */
const VOWEL_END = /[aeiouyáéíóúýæö]$/i;
const NOUN_IRREGULAR = new Set(["faðir", "móðir", "bróðir", "systir", "dóttir"]);
/* BÍN lists a singular for these, but they are used in the plural:
   "hér er viðskipti" is not Icelandic. The data has no general mark for such
   words; this list holds the ones found in the pool by reading it. */
const NOUN_PLURAL_IN_USE = new Set(["viðskipti", "áhrif"]);
const SG = ["NFET", "ÞFET", "ÞGFET", "EFET"];
/* The helper words of the lesson's own examples: hér er hestur — til hests. */
const SG_HELPER = { NFET: "hér er", ÞFET: "um", ÞGFET: "frá", EFET: "til" };

/** sterk / veik by the lesson's rule, or null when the rule does not settle it. */
export function nounDeclension(n) {
  if (!n || NOUN_IRREGULAR.has(n.o) || NOUN_PLURAL_IN_USE.has(n.o)) return null;
  const sg = SG.map((m) => n.forms[m] || []);
  if (sg.some((f) => !f.length)) return null;
  const gen = sg[3];
  if (gen.every((f) => !VOWEL_END.test(f))) return "sterk";
  if (sg.every((fs) => fs.every((f) => VOWEL_END.test(f)))) return "veik";
  return null;
}

/* The nouns the question may ask, once per lexicon. `trap`: the nominative
   ends in a vowel and the word is strong all the same — the lesson's
   warning, *herbergi – herbergis*. */
const DECL_POOL = new WeakMap();
function declensionPool(lex) {
  if (DECL_POOL.has(lex)) return DECL_POOL.get(lex);
  const list = [];
  for (const n of lex.nouns) {
    if (n.nx || !showable(n, "NFET")) continue;
    const kind = nounDeclension(n);
    if (!kind) continue;
    const trap = kind === "sterk" && n.forms.NFET.some((f) => VOWEL_END.test(f));
    list.push({ n, kind, trap });
  }
  DECL_POOL.set(lex, list);
  return list;
}

/* The ending of the genitive, said the way the lesson says it. */
const genEnding = (f) => (/ar$/.test(f) ? "-ar" : /ur$/.test(f) ? "-ur" : /s$/.test(f) ? "-s" : `*${f.slice(-1)}*`);

/** The kenniföll — nf. et., ef. et., nf. ft. — as the lesson writes them. */
export function kenniföll(n) {
  const out = [n.forms.NFET[0], n.forms.EFET.join(" / ")];
  if (showable(n, "NFFT") && n.forms.NFFT) out.push(n.forms.NFFT[0]);
  return out;
}

function declensionWhy(x) {
  const { n, kind, trap } = x;
  const nf = n.forms.NFET[0], gen = n.forms.EFET;
  const k = kenniföll(n);
  const kenni = k.length === 3 ? `Kenniföllin eru *${k.join(", ")}*.`
    : `Nefnifall og eignarfall eintölu eru *${k.join(", ")}*.`;
  if (kind === "veik") {
    const sg = SG.map((m) => n.forms[m][0]).join(", ");
    return `*til ${gen[0]}*: orðið endar á **sérhljóði** í öllum föllum eintölu (*${sg}*), `
      + `og þá er beygingin **veik**. ${kenni}`;
  }
  const head = `Eignarfall eintölu er *til ${gen.join(" / ")}*. Það endar á **samhljóði** (${genEnding(gen[0])}), `
    + `og þá er beygingin **sterk**.`;
  const warn = trap ? ` Nefnifallið *${nf}* endar á sérhljóði, en það er eignarfallið sem ræður.` : "";
  return `${head}${warn} ${kenni}`;
}

/**
 * Sterk eða veik? A noun, and the pupil decides by the genitive singular.
 *
 *   þyngd 1–2  the four singular forms are shown (hér er … um … frá … til …),
 *              common words, no word whose nominative misleads
 *   þyngd 3–4  only the nominative: the pupil says *til …* in their head.
 *              About one question in three is a word like *herbergi*
 *   þyngd 5–   the pupil writes the genitive singular, then decides; rarer
 *              words
 */
export function noDeclension(lex, view, rng) {
  if (drilling(view) && !forced(view, ["kk", "kvk", "hk"])) return null;
  const b = bandFor(view, "nafnord");
  const fw = forced(view, ["kk", "kvk", "hk"]);
  const fc = forcedCell(view);
  if (fc && !/^beyging:(sterk|veik)$/.test(fc)) return null;
  const all = declensionPool(lex);
  let x;
  if (fw) {
    x = all.find((y) => y.n === fw);
    if (!x || (fc && fc !== "beyging:" + x.kind)) return null;
  } else {
    /* Common words at þyngd 1–2 (the commonest fifth of the nouns), every
       noun from 3. */
    let pool = all.filter((y) => !fc || fc === "beyging:" + y.kind);
    if (b < 3) pool = topByRank(pool, 0.2);
    if (b < 3) pool = pool.filter((y) => !y.trap);
    else if (rng() < 0.35) {
      const traps = pool.filter((y) => y.trap);
      if (traps.length) pool = traps;
    }
    if (!pool.length) return null;
    /* Strong and weak about equally often: the lexicon has twice as many
       strong nouns, and "sterk" every time would be a guess that pays. */
    if (!fc && !(b >= 3 && pool.every((y) => y.trap))) {
      const want = rng() < 0.5 ? "sterk" : "veik";
      const side = pool.filter((y) => y.kind === want);
      if (side.length) pool = side;
    }
    /* `wordWeight` makes common words many times likelier. From þyngd 5 that
       falloff is undone, so the rarer words come up as often as the common
       ones; what the pupil gets wrong still comes back sooner. */
    const flat = b >= 5 ? (y) => 1 + y.n.r / 150 : () => 1;
    x = wpick(pool, (y) => wordWeight(lex, view, y.n, "nafnord") * flat(y), rng);
  }
  const { n, kind } = x;
  const ask = b >= 5;
  return built({
    type: "kenni", skill: "nafnord", n, word: wordKey(n.o, n.c),
    title: "Sterkt eða veikt nafnorð?",
    question: ask
      ? `Skrifaðu eignarfall eintölu og veldu svo: er beygingin sterk eða veik?`
      : `Er beygingin sterk eða veik? Skoðaðu eignarfall eintölu.`,
    show: (b < 3 ? SG : ["NFET"]).map((m) => ({ h: SG_HELPER[m], f: n.forms[m].join(" / ") })),
    askGen: ask, gen: n.forms.EFET, m: ask ? "EFET" : null, paradigm: ask ? n.forms : null,
    options: ["sterk", "veik"], answer: kind,
    why: declensionWhy(x),
    base: ask ? 10 : 6, lvl: b, cell: "beyging:" + kind,
    tags: [...(x.trap ? ["nobeyg", "nobeyg:nf"] : ["nobeyg"]), ...(ask ? ["form", "case:EF"] : [])],
    miss: ["beyging_no"],
    missFor: x.trap ? { veik: ["beyging_no", "beyging_no_nf"] } : null,
  });
}

export const TYPES = [
  { id: "fill", skill: "nafnord", weight: 26, renderer: "fill",
    tags: ["agree:kyn", "case:EF", "case:NF", "case:ÞF", "case:ÞGF", "form", "noun", "num"],
    bands: [1, 2, 3, 4, 5, 6, 7],
    build: taskFill, drill: fillWord },
  { id: "tbl_no", skill: "nafnord", weight: 5, renderer: "table",
    tags: ["case:EF", "case:NF", "case:ÞF", "case:ÞGF", "form", "noun", "num"],
    bands: [1],
    build: tableNoun },
  { id: "no_val", skill: "nafnord", weight: 8, renderer: "choice",
    tags: ["case:EF", "case:NF", "case:ÞF", "case:ÞGF", "noun", "num"],
    bands: [1, 2, 3, 4, 5, 6, 7],
    build: noChoice },
  /* item 27 */
  { id: "no_beyging", skill: "nafnord", weight: 5, renderer: "kenni",
    tags: ["case:EF", "form", "nobeyg", "nobeyg:nf"],
    bands: [1, 3, 5],
    build: noDeclension },
];
