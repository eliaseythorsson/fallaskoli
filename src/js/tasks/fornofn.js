/* Fornöfn og greinir.

     tbl_fn    beygingartafla: a pronoun or the article, with a helper noun
     fn_eyda   a personal pronoun written in the right case ("Ég gaf ___ (hún) bókina")
     fn_stad   a noun in a bank sentence replaced by a personal pronoun
     fn_aftur  sér or honum, sína or hans — the reflexive or not
     fn_flokkar  which kind of pronoun a word of a bank sentence is (item 27)

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

/* ================= Hvers konar fornafn? (item 27) ======================== */

/* The six kinds Lesefni teaches (content/lessons.js, "Fornöfn"), with the
   words it names for each. A pronoun the lesson does not name (*sjálfur*,
   *sami*, *hvorugur*, *slíkur*, *einn*, *vor*) is not asked: grammars file
   some of them differently, and a pupil who learnt the page could not know.
   The order is the lesson's, and the options are always shown in it. */
export const PRONOUN_KINDS = [
  { k: "persónu", nm: "persónufornafn", lemmas: ["ég", "þú", "hann", "hún", "það"],
    why: "Persónufornöfnin sýna hver talar, við hvern er talað og um hvern er talað: *ég, þú, hann, hún, það*, í fleirtölu *við, þið, þeir, þær, þau*." },
  { k: "afturbeygt", nm: "afturbeygt fornafn", lemmas: ["sig"],
    why: "Afturbeygða fornafnið er bara eitt: *sig, sér, sín*. Það vísar aftur til frumlagsins og er ekki til í nefnifalli." },
  { k: "eignar", nm: "eignarfornafn", lemmas: ["minn", "þinn", "sinn"],
    why: "Eignarfornöfnin sýna hver á eitthvað: *minn, þinn, sinn*. Þau samræmast nafnorðinu: *bíllinn minn, bókin mín, húsið mitt*." },
  { k: "ábendingar", nm: "ábendingarfornafn", lemmas: ["sá", "þessi", "hinn"],
    why: "Ábendingarfornöfnin benda á eitthvað: *sá, þessi, hinn*." },
  { k: "spurnar", nm: "spurnarfornafn", lemmas: ["hver", "hvor", "hvaða", "hvílíkur"],
    why: "Með spurnarfornöfnum er spurt: *hver, hvor, hvaða, hvílíkur*." },
  { k: "óákveðið", nm: "óákveðið fornafn",
    lemmas: ["einhver", "enginn", "allur", "sumur", "annar", "báðir", "nokkur", "neinn", "sérhver"],
    why: "Óákveðin fornöfn segja ekki nákvæmlega hver eða hvað á í hlut: *einhver, enginn, allur, sumur, annar, báðir, nokkur, neinn, sérhver*." },
];
const KIND_OF = new Map(PRONOUN_KINDS.flatMap((x) => x.lemmas.map((l) => [l, x])));
/* The three kinds of the lesson's first half, and the only options at þyngd 1–2. */
const FIRST_KINDS = ["persónu", "eignar", "ábendingar"];
/* The genitive of a personal pronoun after a noun: *bókin hans*. The lesson's
   own warning — it is not an eignarfornafn. Asked from þyngd 5. */
const GEN_PERSONAL = new Set(["hans", "hennar", "okkar", "ykkar"]);

const lower = (w) => String(w || "").toLowerCase();

/* Which kinds of pronoun a written form can be. From two sources: every
   pronoun paradigm in the lexicon (BÍN), and every pronoun token of the
   parsed bank under its parsed lemma — the reflexive *sig* is not in the
   lexicon, and its forms must still count (*sín* is also a form of *sinn*).
   A lemma outside the six lists counts as a kind of its own ("?"), so that a
   form shared with *sjálfur* or *vor* is never taken as certain either. */
function kindsByForm(lex) {
  const by = new Map();
  const add = (f, k) => {
    const key = lower(f);
    if (!by.has(key)) by.set(key, new Set());
    by.get(key).add(k);
  };
  for (const w of [...(lex.byClass.fn || []), ...(lex.byClass.pfn || [])]) {
    const k = KIND_OF.get(w.o)?.k || "?";
    Object.values(w.forms).flat().forEach((f) => add(f, k));
  }
  /* *hinn* the article has the forms of *hinn* the pronoun: see `certainKind`. */
  for (const w of lex.byClass.gr || []) Object.values(w.forms).flat().forEach((f) => add(f, "greinir"));
  lex.sentences.forEach((s) => s.tok.forEach((t) => {
    if (t.c === "fornafn" && t.l) add(t.w, KIND_OF.get(t.l)?.k || "?");
  }));
  return by;
}

const agrees = (pron, noun, nounEntry) => {
  const a = readMark(pron.m || ""), b = readMark(noun.m || "");
  return !!(nounEntry && a.kyn && a.fall && a.tala
    && nounEntry.c === a.kyn && a.fall === b.fall && a.tala === b.tala);
};

/**
 * The kind of the pronoun at `s.tok[i]`, when it is certain — or null.
 *
 * Certain means: the parser calls it a pronoun, its lemma is one the lesson
 * names, and no other kind of pronoun has this form. Measured on the bank,
 * the parser is not to be trusted where two kinds share a form: it read
 * *Það eru fjögur börn* as the demonstrative *sá*. So *það, því, þess, þeir,
 * þær, þau, þá, þeim, þeirra* are never asked. Three shared forms are let
 * through where the sentence itself decides:
 *   - *mín, þín, sín* right after a noun they agree with: *bókin mín* is the
 *     eignarfornafn; after a preposition that takes the genitive (*heim til
 *     sín*) it is the genitive of *ég, þú, sig*;
 *   - *hinn* standing alone (*stærri en hinn*), not before an adjective,
 *     where it would be the article (*hinn góði maður*);
 *   - *hver, hvor, hvaða, hvílíkur* only in a direct question that opens
 *     with them (or with a preposition and them). *Á hverjum degi* is "each
 *     day", which the lesson does not teach, and an indirect question
 *     (*af hverju litur himinsins breytist*) is left out.
 */
function certainKind(lex, s, i, byForm) {
  const t = s.tok[i];
  if (!t || t.c !== "fornafn" || t.rj || !t.l) return null;
  const kind = KIND_OF.get(t.l);
  if (!kind) return null;
  const prev = s.tok[i - 1], next = s.tok[i + 1];
  const kinds = byForm.get(lower(t.w)) || new Set();
  if (kind.k === "spurnar") {
    const opens = i === 0 || (i === 1 && prev.c === "forsetning");
    if (!opens || !/\?$/.test(s.t)) return null;
  }
  if (t.l === "hinn" && next && ["lýsingarorð", "töluorð"].includes(next.c)) return null;
  const others = [...kinds].filter((k) => k !== kind.k && !(t.l === "hinn" && k === "greinir"));
  if (!others.length) return kind;
  const w = lower(t.w);
  if (/^(mín|þín|sín)$/.test(w)) {
    if (kind.k === "eignar" && prev && prev.c === "nafnorð" && agrees(t, prev, lex.entryForToken(prev))) return kind;
    if (kind.k !== "eignar" && prev && prev.c === "forsetning" && prev.pg === "ef") return kind;
  }
  return null;
}

/* Every pronoun of the bank whose kind is certain, once per lexicon. */
const KIND_SLOTS = new WeakMap();
function kindSlots(lex) {
  if (KIND_SLOTS.has(lex)) return KIND_SLOTS.get(lex);
  const byForm = kindsByForm(lex);
  const list = [];
  lex.sentences.forEach((s) => s.tok.forEach((t, i) => {
    const kind = certainKind(lex, s, i, byForm);
    if (!kind) return;
    const prev = s.tok[i - 1];
    const gen = kind.k === "persónu" && GEN_PERSONAL.has(lower(t.w)) && prev && prev.c === "nafnorð";
    list.push({ s, i, t, kind, gen, key: `${s.t}#${i}` });
  }));
  KIND_SLOTS.set(lex, list);
  return list;
}

/** The explanation under the answer, in the words of the lesson. */
/* BÍN files *við, okkur, okkar* under *ég* and *þið, ykkur, ykkar* under
   *þú*; the lesson, and the pupil, call them by the plural. */
const PLURAL_NAME = { ég: "við", þú: "þið" };
const nameOf = (t) =>
  (PLURAL_NAME[t.l] && readMark(t.m || "").tala === "fleirtala" ? PLURAL_NAME[t.l] : t.l);

function kindWhy(x) {
  const { t, kind, gen } = x;
  const w = lower(t.w);
  const l = nameOf(t);
  const of = w === l ? "" : ` (mynd af *${l}*)`;
  if (gen) {
    return `*${w}* er eignarfall af persónufornafninu *${l}* — ekki eignarfornafn. `
      + `Það breytist ekki með nafnorðinu: *bíllinn ${w}, bókin ${w}, húsið ${w}*. `
      + `Eignarfornöfnin eru aðeins *minn, þinn, sinn* (og *vor*).`;
  }
  return `*${w}* er **${kind.nm}**${of}. ${kind.why}`;
}

/** "Hvers konar fornafn er *sína*?" — a pronoun of a bank sentence, its kind. */
export function fnKind(lex, view, rng) {
  const P = view.policy;
  const b = bandFor(view, "fornofn");
  if (drilling(view) && !forced(view, ["fn", "pfn"])) return null;
  const fw = forced(view, ["fn", "pfn"]);
  const fc = forcedCell(view);
  const avoid = view.force && view.force.avoid;
  const six = b >= 3;
  let pool = kindSlots(lex).filter((x) => P.level(x.s.lvl)
    && (six || FIRST_KINDS.includes(x.kind.k))
    /* The genitive of a personal pronoun is the lesson's warning: from 5. */
    && (b >= 5 || !x.gen)
    && (!fc || fc === "fnflokkur:" + x.kind.k)
    && (!fw || x.t.l === fw.o)
    && x.s.t !== avoid);
  if (!pool.length) return null;
  const near = pool.filter((x) => x.s.lvl <= b + 1);
  if (near.length) pool = near;
  /* A kind first, then a pronoun of that kind: *ég* is half the bank, and
     a pupil asked "persónufornafn" ten times running learns nothing. The
     square root keeps the big kinds commoner without drowning the rest; at
     þyngd 5 and above the genitive trap is a kind of its own. */
  const groups = new Map();
  for (const x of pool) {
    const g = x.gen ? "gen" : x.kind.k;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(x);
  }
  const g = wpick([...groups.keys()], (k) => Math.sqrt(groups.get(k).length) * (k === "gen" ? 3 : 1), rng);
  const x = pick(fresh(view, (y) => y.key, groups.get(g)), rng);
  const kinds = six ? PRONOUN_KINDS : PRONOUN_KINDS.filter((k) => FIRST_KINDS.includes(k.k));
  const w = lower(x.t.w);
  const e = lex.entryForToken(x.t);
  return built({
    type: "choice", skill: "fornofn", s: x.s, i: x.i, mark: true,
    title: "Hvers konar fornafn?",
    question: `Hvers konar fornafn er *${w}*?`,
    options: kinds.map((k) => k.nm), answer: x.kind.nm,
    why: kindWhy(x),
    base: six ? 9 : 7, lvl: x.s.lvl, cell: "fnflokkur:" + x.kind.k,
    word: e ? wordKey(e.o, e.c) : null,
    tags: x.gen ? ["fnkind", "fnkind:gen"] : ["fnkind"],
    miss: ["fn_flokkar"],
    /* Taking *hans* for an eignarfornafn is the mistake the lesson warns of. */
    missFor: x.gen ? { eignarfornafn: ["fn_flokkar", "eignarfall_pfn"] } : null,
  }, [FX.exSeen(x.key)]);
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
    bands: [1, 2, 3, 4],
    build: fnReplace },
  { id: "fn_aftur", skill: "fornofn", weight: 5, renderer: "choice",
    tags: ["reflex"],
    bands: [1],
    build: fnReflex },
  /* item 27 */
  { id: "fn_flokkar", skill: "fornofn", weight: 5, renderer: "choice",
    tags: ["fnkind", "fnkind:gen"],
    bands: [1, 2, 3, 4, 5],
    build: fnKind },
];
