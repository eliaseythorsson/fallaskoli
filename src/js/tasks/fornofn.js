/* Fornöfn og greinir.

     tbl_fn    beygingartafla: a pronoun or the article, with a helper noun
     fn_eyda   a personal pronoun written in the right case ("Ég gaf ___ (hún) bókina")
     fn_stad   a noun in a bank sentence replaced by a personal pronoun
     fn_aftur  sér or honum, sína or hans — the reflexive or not

   fn_eyda and fn_aftur are hand-written items (data/exercises.js: every
   answer, option and cue a BÍN form, checked by build_exercises.py). */

import { EX } from "../../../data/exercises.js";
import { CASES, GENDERS, readMark } from "../core/marks.js";
import { wordKey } from "../core/state.js";
import { wantsHelper, phrase, paradigmWithHelper } from "../core/helpers.js";
import { settled } from "./frames.js";
import { built, FX } from "./effects.js";
import { pick, wpick, shuffle, bandFor, levelFor, forced, drilling, forcedCell, wordWeight, sameInEveryCell,
         cap1, caseWord, caseOf, textSentence, fresh, lexWord, isTimeNoun, headsTimePhrase } from "./shared.js";

/* ================= Beygingartafla ======================================== */

const SINGULAR_TABLE_ONLY = new Set(["sérhver"]);

/* Pronouns with a helper noun: *sá maður* rather than *sá* (core/helpers.js).
   The question asks about gender and number without showing the helper's
   forms; the paradigm with the helper is shown after the answer. */
/* Real pronouns, but odd for 8th grade: *vor* (archaic "our") came up more
   than any other table, *mestallur* four times in one test (v6.10). */
const PRONOUN_TABLE_SKIP = new Set(["vor", "mestallur"]);

export function tablePronoun(lex, view, rng) {
  const { sess } = view;
  const pool = [...(lex.byClass.fn || []), ...(lex.byClass.pfn || []), ...(lex.byClass.gr || [])]
    .filter((x) => !PRONOUN_TABLE_SKIP.has(x.o));
  if (!pool.length) return null;
  if (drilling(view) && !forced(view, ["fn", "pfn", "gr"])) return null;
  const w = forced(view, ["fn", "pfn", "gr"]) || wpick(pool, (x) => wordWeight(lex, view, x, "fornofn"), rng);
  /* A review (tasks/review.js) asks for the table its cell is in. */
  const fc = forcedCell(view);
  const f = /^(?:(KK|KVK|HK)-)?(?:NF|ÞF|ÞGF|EF)(ET|FT)$/.exec(fc || "");
  if (fc && (!f || (f[2] === "FT" && SINGULAR_TABLE_ONLY.has(w.o)))) return null;
  const kyn = f && f[1] ? f[1] : pick(["KK", "KVK", "HK"], rng);
  /* *sérhver* has a plural in BÍN and none in use. */
  const num = f ? f[2] : SINGULAR_TABLE_ONLY.has(w.o) ? "ET" : pick(["ET", "FT"], rng);
  for (const withKyn of [true, false]) {
    const cells = CASES
      .map((cs) => {
        const c = (cs.k === "ÞG" ? "ÞGF" : cs.k) + num;
        return { m: withKyn ? `${kyn}-${c}` : c, label: cs.name };
      })
      .filter((c) => w.forms[c.m]);
    if (cells.length < 4) continue;
    if (fc && !cells.some((c) => c.m === fc)) continue;
    /* Four cells with the same word in them are not a declension: *hvaða*. */
    if (sameInEveryCell(w, cells)) continue;
    if (!view.policy.marks(cells.map((c) => c.m))) continue;
    const withHelper = withKyn && wantsHelper(w, num);
    const lead = withHelper ? phrase(lex, w, `${kyn}-${(num === "ET" ? "NFET" : "NFFT")}`) : null;
    return built({
      type: "table", kind: w.c === "gr" ? "gr" : "fn", skill: "fornofn", w, cells,
      title: `${lead?.text || w.o} · ${withKyn ? GENDERS[kyn.toLowerCase()] + " " : ""}${num === "ET" ? "eintala" : "fleirtala"}`,
      base: 5, word: wordKey(w.o, w.c), lvl: bandFor(view, "fornofn"), paradigm: w.forms,
      helperRows: withHelper ? paradigmWithHelper(lex, w, kyn, num) : null,
      helperLemma: lead?.helperLemma || null,
    });
  }
  return null;
}

/* ================= In a sentence (v6.11) ================================= */

/** "Ég gaf ___ (hún) bókina." → henni */
export function fnGap(lex, view, rng) {
  const P = view.policy;
  const items = EX.pronounGap.filter((x) => P.mark(x.m));
  if (!items.length) return null;
  const b = bandFor(view, "fornofn");
  /* Singular first; the plural and the genitive from þyngd 2. */
  const easy = (x) => /ET$/.test(x.m) && !/^EF/.test(x.m);
  const pool = fresh(view, (x) => x.t, b < 2 ? items.filter(easy) : items);
  const x = pick(pool.length ? pool : items, rng);
  const { s, i } = textSentence(x.t);
  return built({
    type: "gap", skill: "fornofn", s, i, cue: x.cue, answers: x.a, m: x.m,
    paradigm: EX.para[`${x.l}|${x.c}`] || null,
    title: "Settu fornafnið í rétt fall", lemmaLabel: "persónufornafn",
    hint: "Hvað stýrir fallinu — sögnin eða forsetningin?",
    why: x.why.replace(/^([^:]+):/, "*$1*:"),
    base: 10, lvl: levelFor(P, easy(x) ? 1 : 2), cell: "fn:" + x.m,
    word: lexWord(lex, x.l, x.c), tags: [], cap: i === 0,
  }, [FX.exSeen(x.t)]);
}

/* Replace the noun with a pronoun: generated from the sentence bank. A noun
   qualifies only when the swap leaves a sentence a teacher would accept:
   definite (it refers to something), nothing in front of it that would be
   left stranded, no genitive or relative clause after it, not a time
   phrase, not a predicative ("Hann er kennari" → *Hann er hann). */
const MODIFIER = new Set(["lýsingarorð", "fornafn", "töluorð", "greinir"]);
const PRONOUN_OF = { kk: "hann", kvk: "hún", hk: "það" };
let REPLACE_CACHE = null;
function replaceSlots(lex) {
  if (REPLACE_CACHE && REPLACE_CACHE.lex === lex) return REPLACE_CACHE.list;
  const list = [];
  lex.sentences.forEach((s) => {
    s.tok.forEach((t, i) => {
      if (t.c !== "nafnorð" || !t.m || t.rj || !settled(t)) return;
      if ((t.u || []).some((f) => f === "fall" || f === "tala")) return;
      if (!/gr$/.test(t.m)) return;
      if (t.r === "sagnfylling") return;
      const prev = s.tok[i - 1], next = s.tok[i + 1];
      if (prev && (MODIFIER.has(prev.c) || prev.rj || prev.c === "nafnorð")) return;
      if (next && (next.c === "nafnorð" || MODIFIER.has(next.c) || /^sem$/i.test(next.w) || next.rj)) return;
      if (prev && prev.c === "forsetning" && headsTimePhrase(lex, s, i - 1)) return;
      /* *á leiðinni heim* → *á henni heim*: a set phrase does not survive. */
      if (prev && prev.c === "forsetning" && next && next.c === "atviksorð") return;
      const e = lex.entryForToken(t);
      if (!e || isTimeNoun(e) || !PRONOUN_OF[e.c]) return;
      const pr = lex.lookup(PRONOUN_OF[e.c], "pfn");
      const a = readMark(t.m);
      const pm = caseOf(t.m) + (a.tala === "fleirtala" ? "FT" : "ET");
      const forms = pr && pr.forms[pm];
      if (!forms || !forms.length) return;
      /* The same noun twice in the sentence: which one is meant? */
      if (s.tok.some((u, j) => j !== i && u.l === t.l)) return;
      list.push({ s, i, t, e, pm, forms, pr });
    });
  });
  REPLACE_CACHE = { lex, list };
  return list;
}

export function fnReplace(lex, view, rng) {
  const P = view.policy;
  const b = bandFor(view, "fornofn");
  const all = replaceSlots(lex).filter((r) => P.level(r.s.lvl) && P.mark(r.pm));
  if (!all.length) return null;
  const near = all.filter((r) => r.s.lvl <= b + 1);
  const r = pick(fresh(view, (x) => x.s.t + x.i, near.length ? near : all), rng);
  const cap = r.i === 0;
  const answers = r.forms.map((f) => (cap ? cap1(f) : f));
  const g = GENDERS[r.e.c];
  return built({
    type: "gap", mode: "replace", skill: "fornofn", s: r.s, i: r.i, cue: null,
    answers, m: r.pm, paradigm: r.pr.forms,
    title: "Settu fornafn í stað nafnorðsins",
    hint: "Skrifaðu persónufornafnið (hann, hún, það …) sem kemur í stað undirstrikaða orðsins.",
    why: `*${r.t.w}* er ${g}, ${caseWord(caseOf(r.t.m))}, ${readMark(r.t.m).tala} — `
      + `persónufornafnið fær sama kyn, tölu og fall: **${answers[0]}**.`,
    base: 10, lvl: r.s.lvl, cell: "fn:" + r.pm, word: wordKey(r.pr.o, "pfn"),
    tags: ["agree:kyn"], cap,
  }, [FX.exSeen(r.s.t + r.i)]);
}

/** sér / honum, sína / hans — the line under the sentence decides. */
export function fnReflex(lex, view, rng) {
  const P = view.policy;
  const x = pick(fresh(view, (y) => y.t + y.gloss, EX.reflexive), rng);
  const { s, i } = textSentence(x.t);
  return built({
    type: "choice", skill: "fornofn", s, i, gloss: x.gloss,
    title: "Afturbeygt eða ekki?", question: "Hvort orðið á við hér?",
    options: shuffle([x.a, x.w], rng), answer: x.a,
    why: x.reflexive
      ? `*${x.a}* vísar aftur til frumlagsins: ${x.gloss.replace(/\.$/, "")}. Afturbeygða fornafnið (*sig, sér, sín*) og *sinn* vísa til frumlags sömu setningar.`
      : `*${x.a}* vísar til einhvers annars en frumlagsins: ${x.gloss.replace(/\.$/, "")}. *${x.w}* myndi vísa aftur til frumlagsins.`,
    base: 11, lvl: levelFor(P, 3), cell: "fn:afturbeyging", word: null,
    tags: ["reflex"], miss: ["afturbeyging"],
  }, [FX.exSeen(x.t + x.gloss)]);
}

export const TYPES = [
  { id: "tbl_fn", skill: "fornofn", weight: 4, renderer: "table",
    tags: ["agree:kyn", "case:EF", "case:NF", "case:ÞF", "case:ÞGF", "form", "noun", "num"],
    bands: [1],
    build: tablePronoun },
  { id: "fn_eyda", skill: "fornofn", weight: 7, renderer: "gap",
    tags: ["case:EF", "case:ÞF", "case:ÞGF", "form", "num"],
    bands: [1, 2],
    build: fnGap },
  { id: "fn_stad", skill: "fornofn", weight: 6, renderer: "gap",
    tags: ["agree:kyn", "case:EF", "case:NF", "case:ÞF", "case:ÞGF", "form", "num"],
    bands: [1, 2, 3, 4, 5, 6],
    build: fnReplace },
  { id: "fn_aftur", skill: "fornofn", weight: 5, renderer: "choice",
    tags: ["reflex"],
    bands: [1],
    build: fnReflex },
];
