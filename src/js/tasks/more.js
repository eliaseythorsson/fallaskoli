/* Question types added in v6.11 — at least three kinds of question in every
   category, so a session is never ten beygingartöflur in a row.

   Two sources, and nothing else:
     * data/exercises.js — hand-written items whose every answer, option and
       cue is a BÍN form (build_exercises.py looks each one up and stops the
       build if one is missing). Fornöfn, Töluorð, Fallstjórn and the
       Orðaforði word groups.
     * the sentence bank — parsed by Greynir and checked against BÍN and
       government.py by the build (sentences.json). Every new type built on
       it reads the analysis the build vouched for and infers nothing.

   Four renderers carry all of them (ui/render-more.js):
     gap     a sentence with a blank (or an underlined word) and a text box
     choice  a sentence or a question, and two to four options
     tap     click every word of one kind in a sentence
     sort    put each word in its class

   A builder returns null rather than guess, like every builder in index.js. */

import { EX } from "../../../data/exercises.js";
import { readMark, CASES, GENDERS } from "../core/marks.js";
import { wordKey, todayKey, effectivePolicy } from "../core/state.js";
import { chooseWord, markAsked } from "../core/spacing.js";
import { bandOf } from "../core/difficulty.js";
import { settled, adjectiveSentence } from "./frames.js";
import { taskFill, headsTimePhrase, isTimeNoun } from "./index.js";

/* ---------- small helpers ---------------------------------------------- */

const rand = (n) => Math.floor(Math.random() * n);
const pickOne = (a) => a[rand(a.length)];
export function shuffled(a) {
  const x = [...a];
  for (let i = x.length - 1; i > 0; i--) { const j = rand(i + 1); [x[i], x[j]] = [x[j], x[i]]; }
  return x;
}
const pol = (ctx) => (ctx.policy ||= effectivePolicy(ctx.S));
const band = (ctx, skill) => Math.min(bandOf(ctx.sess, skill), pol(ctx).maxLevel);
/** A level this child may meet: the item's own, or the nearest allowed. */
const levelFor = (P, want) => (P.level(want) ? want
  : P.levels.reduce((b, x) => (Math.abs(x - want) < Math.abs(b - want) ? x : b), P.levels[0]));
const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const caseWord = (k) => ({ NF: "nefnifall", ÞF: "þolfall", ÞGF: "þágufall", ÞG: "þágufall", EF: "eignarfall" }[k] || k);
const caseOf = (m) => { const f = readMark(m).fall; return f === "ÞG" ? "ÞGF" : f; };

/** Words or punctuation, with "___" as one token: a hand-written sentence in
    the same shape as a bank sentence, so one renderer draws both. */
export function textSentence(text) {
  const tok = (text.match(/___|[\p{L}\p{N}]+|[.,!?;:]/gu) || []).map((w) => ({ w }));
  return { s: { tok, t: text }, i: tok.findIndex((t) => t.w === "___") };
}

/* Recently asked hand-written items are not asked again straight away. */
function fresh(ctx, key, list) {
  const seen = (ctx.sess.exSeen ||= []);
  const ok = list.filter((x) => !seen.includes(key(x)));
  return ok.length ? ok : list;
}
function remember(ctx, k) {
  const seen = (ctx.sess.exSeen ||= []);
  seen.push(k);
  if (seen.length > 40) seen.splice(0, seen.length - 40);
}

const lexWord = (ctx, l, c) => { const w = ctx.lex.lookup(l, c); return w ? wordKey(w.o, w.c) : null; };
const PUNCT = new Set([".", ",", "!", "?", ";", ":"]);

/* ================= Fornöfn ============================================= */

/** "Ég gaf ___ (hún) bókina." → henni */
export function fnGap(ctx) {
  const P = pol(ctx);
  const items = EX.pronounGap.filter((x) => P.mark(x.m));
  if (!items.length) return null;
  const b = band(ctx, "fornofn");
  /* Singular first; the plural and the genitive from þyngd 2. */
  const easy = (x) => /ET$/.test(x.m) && !/^EF/.test(x.m);
  const pool = fresh(ctx, (x) => x.t, b < 2 ? items.filter(easy) : items);
  const x = pickOne(pool.length ? pool : items);
  remember(ctx, x.t);
  const { s, i } = textSentence(x.t);
  return {
    type: "gap", skill: "fornofn", s, i, cue: x.cue, answers: x.a, m: x.m,
    paradigm: EX.para[`${x.l}|${x.c}`] || null,
    title: "Settu fornafnið í rétt fall", lemmaLabel: "persónufornafn",
    hint: "Hvað stýrir fallinu — sögnin eða forsetningin?",
    why: x.why.replace(/^([^:]+):/, "*$1*:"),
    base: 10, lvl: levelFor(P, easy(x) ? 1 : 2), cell: "fn:" + x.m,
    word: lexWord(ctx, x.l, x.c), tags: [], cap: i === 0,
  };
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

export function fnReplace(ctx) {
  const P = pol(ctx);
  const b = band(ctx, "fornofn");
  const all = replaceSlots(ctx.lex).filter((r) => P.level(r.s.lvl) && P.mark(r.pm));
  if (!all.length) return null;
  const near = all.filter((r) => r.s.lvl <= b + 1);
  const r = pickOne(fresh(ctx, (x) => x.s.t + x.i, near.length ? near : all));
  remember(ctx, r.s.t + r.i);
  const cap = r.i === 0;
  const answers = r.forms.map((f) => (cap ? cap1(f) : f));
  const g = GENDERS[r.e.c];
  return {
    type: "gap", mode: "replace", skill: "fornofn", s: r.s, i: r.i, cue: null,
    answers, m: r.pm, paradigm: r.pr.forms,
    title: "Settu fornafn í stað nafnorðsins",
    hint: "Skrifaðu persónufornafnið (hann, hún, það …) sem kemur í stað undirstrikaða orðsins.",
    why: `*${r.t.w}* er ${g}, ${caseWord(caseOf(r.t.m))}, ${readMark(r.t.m).tala} — `
      + `persónufornafnið fær sama kyn, tölu og fall: **${answers[0]}**.`,
    base: 10, lvl: r.s.lvl, cell: "fn:" + r.pm, word: wordKey(r.pr.o, "pfn"),
    tags: ["agree:kyn"], cap,
  };
}

/** sér / honum, sína / hans — the line under the sentence decides. */
export function fnReflex(ctx) {
  const P = pol(ctx);
  const x = pickOne(fresh(ctx, (y) => y.t + y.gloss, EX.reflexive));
  remember(ctx, x.t + x.gloss);
  const { s, i } = textSentence(x.t);
  return {
    type: "choice", skill: "fornofn", s, i, gloss: x.gloss,
    title: "Afturbeygt eða ekki?", question: "Hvort orðið á við hér?",
    options: shuffled([x.a, x.w]), answer: x.a,
    why: x.reflexive
      ? `*${x.a}* vísar aftur til frumlagsins: ${x.gloss.replace(/\.$/, "")}. Afturbeygða fornafnið (*sig, sér, sín*) og *sinn* vísa til frumlags sömu setningar.`
      : `*${x.a}* vísar til einhvers annars en frumlagsins: ${x.gloss.replace(/\.$/, "")}. *${x.w}* myndi vísa aftur til frumlagsins.`,
    base: 11, lvl: levelFor(P, 3), cell: "fn:afturbeyging", word: null,
    tags: ["reflex"], miss: ["afturbeyging"],
  };
}

/* ================= Töluorð ============================================= */

/** "Ég á ___ (2) systur." → tvær */
export function toAgree(ctx) {
  const P = pol(ctx);
  const b = band(ctx, "toluord");
  const items = EX.numeralAgree.filter((x) => P.mark(x.m) && (b >= 2 || x.case !== "EF"));
  if (!items.length) return null;
  const x = pickVocab(ctx, "samhengi", items, (y) => y.t,
    (y) => { const e = ctx.lex.lookup(y.a.o, y.a.c); return e && e.r ? e.r : 5000; });
  if (!x) return null;
  const { s, i } = textSentence(x.t);
  const cap = i === 0;
  const noun = s.tok[i + 1].w;
  return {
    type: "gap", skill: "toluord", s, i, cue: String(x.n),
    answers: x.a.map((f) => (cap ? cap1(f) : f)), m: x.m, paradigm: EX.para[`${x.l}|${x.c}`] || null,
    title: "Skrifaðu töluna með bókstöfum", lemmaLabel: "frumtala",
    hint: "Töluorðið lagar sig að nafnorðinu á eftir því.",
    why: `*${noun}* er ${GENDERS[x.g]}, ${caseWord(x.case)}, ${x.n === 1 ? "eintala" : "fleirtala"} — og töluorðið líka: **${x.a[0]}**.`,
    base: 10, lvl: levelFor(P, x.case === "EF" ? 3 : x.case === "ÞGF" ? 2 : 1),
    cell: "to:" + x.m, word: lexWord(ctx, x.l, x.c), tags: [], cap, numeral: x,
  };
}

/** The same item as a choice between forms of the numeral. */
export function toChoice(ctx) {
  const P = pol(ctx);
  const items = EX.numeralAgree.filter((x) => P.mark(x.m) && x.n > 1);
  if (!items.length) return null;
  const x = pickOne(fresh(ctx, (y) => "c" + y.t, items));
  remember(ctx, "c" + x.t);
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
  const opts = [...new Set([...shuffled(near), ...shuffled(others)])].slice(0, 3);
  if (opts.length < 2) return null;
  const { s, i } = textSentence(x.t);
  const cap = i === 0;
  const fix = (f) => (cap ? cap1(f) : f);
  return {
    type: "choice", skill: "toluord", s, i, cue: String(x.n),
    title: "Veldu rétta mynd töluorðsins", question: `Hvaða mynd af *${x.l}* passar í eyðuna?`,
    options: shuffled([x.a[0], ...opts]).map(fix), answer: fix(x.a[0]),
    why: `Nafnorðið er ${GENDERS[x.g]}, ${caseWord(x.case)}, fleirtala — töluorðið líka: **${x.a[0]}**.`,
    base: 8, lvl: levelFor(P, 2), cell: "to:" + x.m, word: lexWord(ctx, x.l, x.c),
    m: x.m, paradigm: para, tags: [],
  };
}

/** "Í dag er ___ (3.) maí." → þriðji */
export function toDate(ctx) {
  const P = pol(ctx);
  const b = band(ctx, "toluord");
  const D = EX.dates;
  const frames = D.frames.filter((f) => P.mark(`KK-${f.case}ET`));
  if (!frames.length) return null;
  const f = pickOne(frames);
  const mi = rand(12);
  /* Up to 20 at first; the compounds (21., 22. …) from þyngd 2. */
  const top = b >= 2 ? D.days[mi] : Math.min(20, D.days[mi]);
  const d = 1 + rand(top);
  const answers = D.ord[d][f.case];
  const { s, i } = textSentence(f.t.replace("{M}", D.months[mi]));
  const cap = i === 0;
  const para = {};
  ["NF", "ÞF", "ÞGF", "EF"].forEach((c) => { para[`KK-${c}ET`] = D.ord[d][c]; });
  const m = `KK-${f.case}ET`;
  return {
    type: "gap", skill: "toluord", s, i, cue: `${d}.`,
    answers: answers.map((x) => (cap ? cap1(x) : x)), m, paradigm: para,
    title: "Skrifaðu dagsetninguna", lemmaLabel: "raðtala",
    hint: "Raðtalan í dagsetningu er í karlkyni (dagurinn). Fallið fer eftir setningunni.",
    why: `${f.why} ${d === 2 || d === 22 ? "*Annar* beygist sterkt: annar, annan, öðrum, annars." : "Raðtölur beygjast eins og veik lýsingarorð: *þriðji, þriðja*."}`,
    base: 10, lvl: levelFor(P, d > 20 ? 3 : f.case === "NF" ? 1 : 2),
    cell: "to:dags-" + f.case, word: null, tags: [], cap,
  };
}

/** "Ég keypti ___ (2) buxur." → tvennar */
export function toPlural(ctx) {
  const P = pol(ctx);
  const KY = { kk: "KK", kvk: "KVK", hk: "HK" };
  const items = EX.pluralOnly.filter((x) => P.mark(`${KY[x.g]}-${x.case}FT`));
  if (!items.length) return null;
  const x = pickVocab(ctx, "samhengi", items, (y) => y.t,
    (y) => { const e = ctx.lex.lookup(y.a.o, y.a.c); return e && e.r ? e.r : 5000; });
  if (!x) return null;
  const { s, i } = textSentence(x.t);
  const cap = i === 0;
  const noun = s.tok[i + 1].w;
  return {
    type: "gap", skill: "toluord", s, i, cue: String(x.n),
    answers: x.a.map((f) => (cap ? cap1(f) : f)), m: `${KY[x.g]}-${x.case}FT`, paradigm: null,
    plain: x.plain,
    title: "Töluorð með fleirtöluorði", lemmaLabel: "töluorð",
    hint: `*${x.noun}* er aðeins til í fleirtölu.`,
    why: `Orð sem eru aðeins til í fleirtölu (*buxur, skæri, gleraugu, tónleikar*) taka **einir, tvennir, þrennir, fernir**: *${x.a[0]} ${noun}*${x.plain.length ? ` — ekki *${x.plain[0]} ${noun}*` : ""}.`,
    base: 12, lvl: levelFor(P, 3), cell: "to:fleirtoluord", word: null,
    tags: ["plnum"], cap,
  };
}

/* ================= Óbeygjanleg orð og orðflokkar ======================= */

const INDECL_CLASSES = ["atviksorð", "forsetning", "samtenging", "nafnháttarmerki", "upphrópun"];
const ALL_CLASSES = ["nafnorð", "lýsingarorð", "fornafn", "greinir", "töluorð", "sagnorð",
  "atviksorð", "forsetning", "samtenging", "nafnháttarmerki", "upphrópun"];
const PLURAL_OF = {
  "nafnorð": "öll nafnorðin", "lýsingarorð": "öll lýsingarorðin", "fornafn": "öll fornöfnin",
  "töluorð": "öll töluorðin", "sagnorð": "allar sagnirnar", "atviksorð": "öll atviksorðin",
  "forsetning": "allar forsetningarnar", "samtenging": "allar samtengingarnar",
};

/** A sentence every word of which has a class the build vouched for. */
const clean = (s) => s.tok.every((t) => PUNCT.has(t.w) || (t.c && !t.rj));

function tapTask(ctx, skill, classes, weights) {
  const P = pol(ctx);
  const b = band(ctx, skill);
  const pool = ctx.lex.sentences.filter((s) => P.level(s.lvl) && s.lvl <= Math.max(2, b + 1) && clean(s)
    && s.tok.filter((t) => !PUNCT.has(t.w)).length >= 4);
  for (let k = 0; k < 40; k++) {
    const cls = weights ? pickWeighted(classes, weights) : pickOne(classes);
    const s = pickOne(pool);
    if (!s) return null;
    const targets = s.tok.map((t, j) => (t.c === cls ? j : -1)).filter((j) => j >= 0);
    if (!targets.length || targets.length > 4) continue;
    return {
      type: "tap", skill, s, cls, targets,
      title: `Smelltu á ${PLURAL_OF[cls]}`,
      question: `Smelltu á **${PLURAL_OF[cls]}** í setningunni. Smelltu aftur til að afvelja.`,
      base: 6 + 2 * targets.length, lvl: s.lvl, cell: "tap:" + cls, word: null,
      tags: ["ofl", ...(cls === "atviksorð" || cls === "forsetning" ? ["ofl:ao_fs"] : [])],
    };
  }
  return null;
}
function pickWeighted(items, w) {
  const tot = items.reduce((a, x) => a + (w[x] || 1), 0);
  let r = Math.random() * tot;
  for (const x of items) { r -= w[x] || 1; if (r <= 0) return x; }
  return items[items.length - 1];
}

export const obTap = (ctx) => tapTask(ctx, "obeygjanleg", ["atviksorð", "forsetning", "samtenging"]);
export const grTap = (ctx) => tapTask(ctx, "greining",
  ["nafnorð", "lýsingarorð", "sagnorð", "fornafn", "atviksorð", "forsetning", "töluorð"],
  { "nafnorð": 3, "sagnorð": 3, "lýsingarorð": 2.5, "fornafn": 2, "atviksorð": 1.5, "forsetning": 1.5, "töluorð": 0.6 });

/* Preposition or adverb. The bank half takes only words the bank has in
   BOTH classes, so the question is never "is *frá* a preposition". */
let BOTH = null;
function bothClasses(lex) {
  if (BOTH && BOTH.lex === lex) return BOTH.set;
  const seen = {};
  lex.sentences.forEach((s) => s.tok.forEach((t) => {
    if (t.c === "atviksorð" || t.c === "forsetning") (seen[t.l] ||= new Set()).add(t.c);
  }));
  const set = new Set(Object.keys(seen).filter((l) => seen[l].size === 2 && l !== "að"));
  BOTH = { lex, set };
  return set;
}

export function obAdvPrep(ctx) {
  const P = pol(ctx);
  const OPTS = ["atviksorð", "forsetning"];
  const why = (cls, w) => cls === "forsetning"
    ? `Hér stendur *${w}* með fallorði og stýrir falli þess — það er **forsetning**.`
    : `Hér stendur *${w}* eitt; ekkert fallorð fylgir því — það er **atviksorð**.`;
  if (Math.random() < 0.5) {
    const x = pickOne(fresh(ctx, (y) => y.t + y.w, EX.advPrep));
    remember(ctx, x.t + x.w);
    const { s } = textSentence(x.t);
    const i = s.tok.findIndex((t) => t.w.toLowerCase() === x.w);
    const answer = x.c === "fs" ? "forsetning" : "atviksorð";
    return {
      type: "choice", skill: "obeygjanleg", s, i, mark: true,
      title: "Forsetning eða atviksorð?", question: `Í hvaða orðflokki er *${s.tok[i].w}* hér?`,
      options: OPTS, answer, why: why(answer, s.tok[i].w),
      base: 9, lvl: levelFor(P, 2), cell: "ofl:" + answer, word: null,
      tags: ["ofl", "ofl:ao_fs"], miss: ["ao_fs"],
    };
  }
  const both = bothClasses(ctx.lex);
  const hits = [];
  ctx.lex.sentences.forEach((s) => {
    if (!P.level(s.lvl)) return;
    s.tok.forEach((t, i) => { if (both.has(t.l) && OPTS.includes(t.c) && !t.rj) hits.push({ s, i, t }); });
  });
  if (!hits.length) return null;
  const h = pickOne(hits);
  return {
    type: "choice", skill: "obeygjanleg", s: h.s, i: h.i, mark: true,
    title: "Forsetning eða atviksorð?", question: `Í hvaða orðflokki er *${h.t.w}* hér?`,
    options: OPTS, answer: h.t.c, why: why(h.t.c, h.t.w),
    base: 9, lvl: h.s.lvl, cell: "ofl:" + h.t.c, word: lexWord(ctx, h.t.l, h.t.c === "forsetning" ? "fs" : "ao"),
    tags: ["ofl", "ofl:ao_fs"], miss: ["ao_fs"],
  };
}

/** Choose the conjunction: every wrong option makes the sentence wrong. */
export function obConj(ctx) {
  const P = pol(ctx);
  const x = pickOne(fresh(ctx, (y) => y.t, EX.conjunction));
  remember(ctx, x.t);
  const { s, i } = textSentence(x.t);
  const cap = i === 0;
  const fix = (f) => (cap ? cap1(f) : f);
  return {
    type: "choice", skill: "obeygjanleg", s, i,
    title: "Veldu samtenginguna", question: "Hvaða samtenging passar í eyðuna?",
    options: shuffled([x.a, ...x.w]).map(fix), answer: fix(x.a), why: x.why,
    base: 8, lvl: levelFor(P, 2), cell: "ofl:samtenging", word: lexWord(ctx, x.a, "st"),
    tags: ["conj"], miss: ["samtengingar"],
  };
}

/* Sort words into classes. Óbeygjanleg: the words of one sentence, which
   settles what each one is. Greining: dictionary forms that are one class
   whatever BÍN entry they are read as (build_exercises.py), so a bare word
   is never a trick question. */
export function obSort(ctx) {
  const P = pol(ctx);
  const pool = ctx.lex.sentences.filter((s) => P.level(s.lvl) && clean(s));
  for (let k = 0; k < 60; k++) {
    const s = pickOne(pool);
    if (!s) return null;
    const idx = s.tok.map((t, j) => (INDECL_CLASSES.includes(t.c) ? j : -1)).filter((j) => j >= 0);
    const kinds = new Set(idx.map((j) => s.tok[j].c));
    if (idx.length < 3 || kinds.size < 2) continue;
    /* The same word twice (*að … að*) would leave the child guessing which
       row is which: only its first occurrence is asked. */
    const once = idx.filter((j, k) => idx.findIndex((x) => s.tok[x].w.toLowerCase() === s.tok[j].w.toLowerCase()) === k);
    if (once.length < 3) continue;
    const items = once.slice(0, 5).map((j) => ({ w: s.tok[j].w, j, cls: s.tok[j].c }));
    return {
      type: "sort", skill: "obeygjanleg", s, items, buckets: INDECL_CLASSES,
      title: "Flokkaðu óbeygjanlegu orðin",
      question: "Í hvaða orðflokki er hvert undirstrikað orð?",
      base: 4 + 2 * items.length, lvl: s.lvl, cell: "sort:obeygjanleg", word: null,
      tags: ["ofl", "ofl:ao_fs"],
    };
  }
  return null;
}

export function grSort(ctx) {
  const P = pol(ctx);
  const src = EX.sortable;
  const CLS = { "nafnorð": ["kk", "kvk", "hk"], "lýsingarorð": ["lo"], "sagnorð": ["so"],
    "fornafn": ["fn", "pfn"], "töluorð": ["to", "rt"], "atviksorð": ["ao"] };
  const usable = Object.keys(CLS).filter((c) => (src[c] || []).some((o) => CLS[c].some((x) => ctx.lex.lookup(o, x))));
  if (usable.length < 3) return null;
  const chosen = shuffled(usable).slice(0, 3);
  const items = [];
  chosen.forEach((c) => {
    const words = shuffled((src[c] || []).slice(0, 15 + 10 * band(ctx, "greining"))
      .filter((o) => CLS[c].some((x) => ctx.lex.lookup(o, x))));
    words.slice(0, 2).forEach((w) => items.push({ w, cls: c }));
  });
  if (items.length < 6) return null;
  const extra = shuffled(Object.keys(CLS).filter((c) => !chosen.includes(c)))[0];
  return {
    type: "sort", skill: "greining", s: null, items: shuffled(items),
    buckets: Object.keys(CLS).filter((c) => chosen.includes(c) || c === extra),
    title: "Flokkaðu orðin", question: "Í hvaða orðflokki er hvert orð? Orðin standa í orðabókarmynd.",
    base: 12, lvl: levelFor(P, 1), cell: "sort:greining", word: null, tags: ["ofl"],
  };
}

/* ================= Fallstjórn ========================================== */

/** Preposition + noun in the right case: the cloze, only where the slot
    stands right after a preposition whose case the build confirmed. */
export function fsPrepNoun(ctx) {
  const only = (s, i) => {
    const p = s.tok[i - 1];
    return !!p && p.c === "forsetning" && !!p.pg && !headsTimePhrase(ctx.lex, s, i - 1);
  };
  ctx.fillOnly = only;
  let t;
  try { t = taskFill(ctx); } finally { ctx.fillOnly = null; }
  if (!t || !only(t.s, t.i)) return null;
  const p = t.s.tok[t.i - 1].w.toLowerCase();
  return {
    ...t, skill: "fallstjorn", noRepeat: true, base: 11,
    label: `forsetning + nafnorð`,
    lead: `Forsetningin *${p}* ræður fallinu.`,
    tags: ["gov:fs"],
  };
}

/** í/á + motion (þolfall) or rest (þágufall). */
export function fsMotion(ctx) {
  const P = pol(ctx);
  if (!P.attr("fall", "ÞF") || !P.attr("fall", "ÞGF")) return null;
  const x = pickOne(fresh(ctx, (y) => y.t, EX.motionRest));
  remember(ctx, x.t);
  const { s, i } = textSentence(x.t);
  const right = (x.motion ? x.thf : x.thgf)[0];
  const wrong = (x.motion ? x.thgf : x.thf)[0];
  return {
    type: "choice", skill: "fallstjorn", s, i,
    title: "Hreyfing eða kyrrstaða?", question: `Hvort á að standa á eftir *${x.prep}*?`,
    options: shuffled([right, wrong]), answer: right,
    why: x.motion
      ? `Hér er **hreyfing** á stað (hvert?) — þá stýrir *${x.prep}* **þolfalli**: *${right}*.`
      : `Hér er **kyrrstaða** á stað (hvar?) — þá stýrir *${x.prep}* **þágufalli**: *${right}*.`,
    base: 9, lvl: levelFor(P, 1), cell: "stjórn:" + x.prep, word: lexWord(ctx, x.noun, x.g),
    m: (x.motion ? "ÞF" : "ÞGF") + x.col, paradigm: EX.para[`${x.noun}|${x.g}`] || null,
    optMarks: ["ÞF" + x.col, "ÞGF" + x.col],
    tags: ["motion", "gov:fs"], miss: ["hreyfing"],
  };
}

/** A verb that governs a case: "Ég hjálpaði ___ (kennarinn)". */
export function fsVerb(ctx) {
  const P = pol(ctx);
  const items = EX.verbCase.filter((x) => P.mark(x.m));
  if (!items.length) return null;
  const x = pickOne(fresh(ctx, (y) => y.t + y.noun, items));
  remember(ctx, x.t + x.noun);
  const { s, i } = textSentence(x.t);
  return {
    type: "gap", skill: "fallstjorn", s, i, cue: x.cue, answers: x.a, m: x.m,
    paradigm: EX.para[`${x.noun}|${x.g}`] || null,
    title: "Sögnin ræður fallinu", lemmaLabel: "nafnorð",
    hint: `Hvaða falli stýrir sögnin *${x.verb}*?`,
    why: `Sögnin *${x.verb}* stýrir **${caseWord(x.case)}i**: *${x.a[0]}*. Prófaðu: *${x.verb} ${{ ÞF: "mig", ÞGF: "mér", EF: "mín" }[x.case]}*.`,
    base: 11, lvl: levelFor(P, x.case === "EF" ? 3 : 2), cell: "stjórn:" + x.verb,
    word: lexWord(ctx, x.noun, x.g), tags: ["gov:so"], cap: false,
  };
}

/** "___ (ég) langar í ís." → Mig. Two traps take the nominative. */
export function fsImpers(ctx) {
  const P = pol(ctx);
  const items = EX.impersonal.filter((x) => P.mark(x.m));
  if (!items.length) return null;
  const x = pickOne(fresh(ctx, (y) => y.t, items));
  remember(ctx, x.t);
  const { s, i } = textSentence(x.t);
  return {
    type: "gap", skill: "fallstjorn", s, i, cue: x.cue, answers: x.a.map(cap1), m: x.m,
    paradigm: EX.para[`${x.l}|${x.c}`] || null,
    title: "Frumlag í réttu falli", lemmaLabel: "fornafn",
    hint: "Sumar sagnir vilja ekki frumlag í nefnifalli.",
    why: `*${x.verb}*: ${x.why}`,
    base: 11, lvl: levelFor(P, 2), cell: "stjórn:" + x.verb, word: lexWord(ctx, x.l, x.c),
    tags: ["impers"], cap: true, missOther: ["opersonuleg"],
  };
}

/* ================= Orðaforði =========================================== */

const POS_NAME = { lo: "lýsingarorð", so: "sögn", no: "nafnorð", ao: "atviksorð" };

/* Which word an Orðaforði question is about, across sessions and days.
   Two rules, both from what children said: (1) the same word must not keep
   coming back — knowing a word's meaning once is knowing it, so the
   vocabulary question's gate applies (core/spacing.js: never twice in a day,
   never within a week, new words first), under a key of its own per kind
   of question; (2) the words get rarer as the level rises. A word's rank is
   its place in the frequency list (1 = commonest). The band picks a window
   of ranks; when nothing in it may be asked, the window widens, commonest
   first, so a question still comes. */
export const RANK_CAP = [0, 700, 1500, 2600, 4000, 6000, 9000, Infinity];
export function pickVocab(ctx, kind, items, keyOf, rankOf) {
  if (!items.length) return null;
  const b = band(ctx, "ordaford");
  const cap = RANK_CAP[b] ?? Infinity, floor = b > 2 ? RANK_CAP[b - 2] : 0;
  const today = todayKey();
  const wrap = items.map((x) => ({ x, key: `${kind}:${keyOf(x)}`, r: rankOf(x) }));
  const tiers = [wrap.filter((p) => p.r > floor && p.r <= cap), wrap.filter((p) => p.r <= cap)];
  RANK_CAP.slice(b + 1).forEach((c) => tiers.push(wrap.filter((p) => p.r <= c)));
  for (const t of tiers) {
    if (!t.length) continue;
    const c = ctx.S ? chooseWord(ctx.S, t, today) : pickOne(t);
    if (c) {
      if (ctx.S) markAsked(ctx.S, c.key, today);
      return c.x;
    }
  }
  return null;
}
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
export function ordSynAnt(ctx) {
  const P = pol(ctx);
  const ant = Math.random() < 0.5;
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
  const it = pickVocab(ctx, ant ? "andheiti" : "samheiti", items,
    (y) => y.g.map((w) => w.o).sort().join("|") + "|" + y.pos, (y) => pairRank(y.x, y.right));
  if (!it) return null;
  const { pos, x } = it;
  const right = ant ? it.right : pickOne(items.filter((y) => y.x === x)).right;
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
  const near = shuffled(pool).sort((a, b) => Math.abs(pairRank(a) - r0) - Math.abs(pairRank(b) - r0)).slice(0, 8);
  const wrong = shuffled(near).slice(0, 3);
  if (wrong.length < 3) return null;
  const xe = ctx.lex.lookup(x.o, x.c), re = ctx.lex.lookup(right.o, right.c);
  return {
    type: "choice", skill: "ordaford", s: null,
    title: ant ? "Andheiti" : "Samheiti",
    question: ant ? `Hvaða orð merkir **hið gagnstæða** við *${x.o}*?` : `Hvaða orð merkir **það sama** og *${x.o}*?`,
    options: shuffled([right.o, ...wrong.map((w) => w.o)]), answer: right.o,
    why: ant ? `*${x.o}* og *${right.o}* eru **andheiti**: þau merkja hið gagnstæða.`
      : `*${x.o}* og *${right.o}* eru **samheiti**: þau merkja nánast það sama.`,
    defs: [xe, re].filter((e) => e && e.d),
    base: 8, lvl: levelFor(P, Math.min(5, band(ctx, "ordaford"))), cell: ant ? "orð:andheiti" : "orð:samheiti",
    word: xe ? wordKey(xe.o, xe.c) : null, tags: ["vocab"], miss: ["merking"],
    bonus: xe || re || null,
  };
}

/* Word in context: a sentence where exactly one of four nouns makes sense
   (exercises.py WORD_IN_CONTEXT). All four stand in the same BÍN mark, so
   the grammar never gives the answer away. v6.11 first tried frames from the
   sentence bank with options from "far" noun classes, and reading the output
   killed it: *Grunnskólarnir eru gamlir*, *Ég sá sófa úti* and *Hönnuðurinn
   var tilbúinn* are all good Icelandic. Whether a noun fits a verb is not
   something a class label can settle; a person has to. */
export function ordContext(ctx) {
  const P = pol(ctx);
  const items = EX.wordInContext.filter((x) => x.a && P.mark(x.m));
  if (!items.length) return null;
  const x = pickVocab(ctx, "samhengi", items, (y) => y.t,
    (y) => { const e = ctx.lex.lookup(y.a.o, y.a.c); return e && e.r ? e.r : 5000; });
  if (!x) return null;
  const { s, i } = textSentence(x.t);
  const cap = i === 0;
  const fix = (f) => (cap ? cap1(f) : f);
  const right = ctx.lex.lookup(x.a.o, x.a.c);
  return {
    type: "choice", skill: "ordaford", s, i,
    title: "Orð í samhengi", question: "Hvaða orð passar í setninguna?",
    options: shuffled([x.a, ...x.w].map((o) => fix(o.f))), answer: fix(x.a.f),
    why: right && right.d ? `*${x.a.o}*: ${right.d}` : `Aðeins *${x.a.f}* gefur setningunni merkingu.`,
    base: 8, lvl: levelFor(P, 1), cell: "orð:samhengi", word: right ? wordKey(right.o, right.c) : null,
    tags: ["vocab"], miss: ["merking"], bonus: right,
  };
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
export function ordFormation(ctx) {
  const P = pol(ctx);
  const F = formationPairs(ctx.lex);
  const kinds = ["neg", "agent", "ing"].filter((k) => F[k].length);
  if (!kinds.length) return null;
  const kind = pickOne(kinds);
  const x = pickVocab(ctx, "myndun", F[kind], (y) => y.to.o, (y) => pairRank(y.from, y.to));
  if (!x) return null;
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
  return {
    type: "gap", skill: "ordaford", mode: "free", s: null, i: -1, prompt: text[0],
    cue: null, answers, m: null, paradigm: null,
    title: "Orðmyndun", hint: null, tip: text[1],
    why: `${text[2]}${x.to.d ? ` *${x.to.o}*: ${x.to.d}` : ""}`
      + (others.length ? ` Líka rétt: ${others.map((o) => `*${o}*`).join(", ")}.` : ""),
    base: 9, lvl: levelFor(P, kind === "neg" ? 1 : 2), cell: "orð:myndun-" + kind,
    word: wordKey(x.to.o, x.to.c), tags: ["wordform"], missOther: ["ordmyndun"],
    bonus: x.to,
  };
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
export function ordOdd(ctx) {
  const P = pol(ctx);
  const b = band(ctx, "ordaford");
  const maxR = 600 + 500 * b;
  const by = {};
  ctx.lex.nouns.forEach((w) => { if (w.r <= maxR && !w.nx && KIND_NAME[w.s]) (by[w.s] ||= []).push(w); });
  const kinds = Object.keys(KIND_NAME).filter((k) => (by[k] || []).length >= 3);
  for (let k = 0; k < 10; k++) {
    const A = pickOne(kinds);
    if (!A) return null;
    const Bs = ODD_FAR[A].filter((x) => (by[x] || []).length);
    if (!Bs.length) continue;
    const three = shuffled(by[A]).slice(0, 3);
    const odd = pickOne(by[pickOne(Bs)]);
    return {
      type: "choice", skill: "ordaford", s: null,
      title: "Hvert á ekki heima í hópnum?", question: "Þrjú orðanna eiga eitthvað sameiginlegt. Hvert á **ekki** heima í hópnum?",
      options: shuffled([...three, odd].map((w) => w.o)), answer: odd.o,
      why: `*${three.map((w) => w.o).join(", ")}* eru öll ${KIND_NAME[A]} — *${odd.o}* ekki.`,
      defs: [odd].filter((e) => e.d),
      base: 7, lvl: levelFor(P, 1), cell: "orð:útundan", word: wordKey(odd.o, odd.c),
      tags: ["vocab"], miss: ["merking"], bonus: odd,
    };
  }
  return null;
}

/* ================= Lýsingarorð ========================================= */

/* Adjective fill-ins from the sentence bank (confirmed tokens: BÍN has the
   mark and the surface form is one of BÍN's forms for it) and from frames
   with a frequent adjective substituted in (tasks/frames.js). The cue names
   the degree, so the context only has to settle gender, number, case and
   strong/weak — which it always does. */
const DEG = { FSB: "frumstig", FVB: "frumstig", MST: "miðstig", ESB: "efsta stig", EVB: "efsta stig" };
/* "Ég sá ___ (hár) tré": *tré* is singular and plural alike, so *hátt* and
   *há* are both right. A slot is used only when the noun after it settles
   the number (and the article) by its form. */
function headSettles(lex, s, i) {
  const n = s.tok[i + 1];
  if (!n || n.c !== "nafnorð") return true;
  const e = lex.entryForToken ? lex.entryForToken(n) : null;
  if (!e) return false;
  const marks = Object.entries(e.forms).filter(([, ff]) => ff.includes(n.w)).map(([m]) => readMark(m));
  return new Set(marks.map((a) => a.tala)).size <= 1 && new Set(marks.map((a) => !!a.greinir)).size <= 1;
}

function adjSlot(ctx, want, { pred = null, frames = true } = {}) {
  const P = pol(ctx);
  const b = band(ctx, "lysingarord");
  const firm = (t) => !(t.u || []).length && !t.rj;
  const bank = ctx.lex.slotsFor("lýsingarorð").filter((r) => want.test(r.t.m) && firm(r.t)
    && P.level(r.s.lvl) && P.mark(r.t.m) && (!pred || pred(r)) && headSettles(ctx.lex, r.s, r.i));
  if (bank.length && (!frames || Math.random() < 0.55)) {
    const r = pickOne(bank);
    return { s: r.s, i: r.i, w: r.w, m: r.t.m, lvl: r.s.lvl };
  }
  if (!frames) return null;
  const pool = ctx.lex.adjectives.filter((w) => w.r <= 300 + 150 * b);
  for (let k = 0; k < 25; k++) {
    const w = pickOne(pool);
    const marks = Object.keys(w.forms).filter((m) => want.test(m) && P.mark(m));
    if (!marks.length) continue;
    const m = pickOne(marks);
    const made = adjectiveSentence(ctx.lex, w, m, w.forms[m][0], { maxLvl: b + 1, levelOk: (n) => P.level(n) });
    if (made && headSettles(ctx.lex, made.s, made.i)) return { s: made.s, i: made.i, w, m, lvl: made.lvl };
  }
  if (bank.length) { const r = pickOne(bank); return { s: r.s, i: r.i, w: r.w, m: r.t.m, lvl: r.s.lvl }; }
  return null;
}

function adjGap(ctx, slot, opts) {
  const { s, i, w, m, lvl } = slot;
  const a = readMark(m);
  const deg = DEG[m.split("-")[0]];
  const cap = i === 0;
  return {
    type: "gap", skill: "lysingarord", s, i, cue: `${w.o} · ${deg}`,
    answers: w.forms[m].map((f) => (cap ? cap1(f) : f)), m, paradigm: w.forms,
    lemmaLabel: "lýsingarorð", base: 12, lvl, word: wordKey(w.o, w.c), cell: m, cap,
    ...opts(a, w),
  };
}

export function loStrongWeak(ctx) {
  const slot = adjSlot(ctx, /^(FSB|FVB)-/, { pred: (r) => r.t.r !== "sagnfylling" });
  if (!slot) return null;
  return adjGap(ctx, slot, (a) => ({
    title: "Sterk eða veik beyging?",
    hint: "Hefur nafnorðið greini — eða stendur *þessi*, *sá* eða *hinn* á undan?",
    why: a.beyging === "veik"
      ? "**Veik beyging**: lýsingarorðið stendur með nafnorði með greini (eða á eftir *þessi, sá, hinn*): *stóri hesturinn*."
      : "**Sterk beyging**: nafnorðið er án greinis: *stór hestur, stórum hesti*.",
    tags: ["adj"],
  }));
}

export function loDegree(ctx) {
  const slot = adjSlot(ctx, /^(MST|ESB|EVB)-/);
  if (!slot) return null;
  return adjGap(ctx, slot, (a) => ({
    title: "Stigbreyting í setningu",
    hint: a.stig === "miðstig" ? "Miðstig ber saman tvennt." : "Efsta stig: mest af öllu.",
    why: a.stig === "miðstig"
      ? "**Miðstig** ber saman tvennt og beygist alltaf veikt: *stærri, stærri, stærra*."
      : `**Efsta stig** — ${a.beyging === "veik" ? "hér veikt, því nafnorðið hefur greini" : "hér sterkt"}: *stærstur / stærsti*.`,
    tags: ["adj"],
  }));
}

export function loAgree(ctx) {
  /* The predicative (*Stelpurnar eru þreyttar*) first; otherwise a strong
     adjective before a feminine or neuter noun, where the ending shows. */
  const pred = Math.random() < 0.6;
  const slot = pred
    ? adjSlot(ctx, /^FSB-/, { pred: (r) => r.t.r === "sagnfylling", frames: false })
    : adjSlot(ctx, /^FSB-(KVK|HK)-/, { pred: (r) => r.t.r !== "sagnfylling" });
  const use = slot || adjSlot(ctx, /^FSB-(KVK|HK)-/, {});
  if (!use) return null;
  return adjGap(ctx, use, (a) => ({
    title: "Samræmi lýsingarorðs",
    hint: "Að hverju lagar lýsingarorðið sig? Finndu nafnorðið eða frumlagið.",
    why: `Lýsingarorðið stendur í sama kyni, tölu og falli og orðið sem það á við: ${GENDERS[a.kyn]}, ${a.tala}, ${caseWord(a.fall)}.`,
    tags: ["adj", "agree:kyn"],
  }));
}

/* ================= Nafnorð ============================================= */

/** The cloze as a choice between the noun's case forms. */
export function noChoice(ctx) {
  const t = taskFill({ ...ctx, noExtras: true, forcedNoun: null });
  if (!t || t.extra) return null;
  const col = t.m.replace(/^(NF|ÞF|ÞGF|EF)/, "");
  const right = new Set(t.answers);
  const opts = [...new Set(["NF", "ÞF", "ÞGF", "EF"].map((c) => (t.n.forms[c + col] || [])[0])
    .filter((f) => f && !right.has(f)))];
  if (opts.length < 2) return null;
  const cap = t.i === 0;
  const fix = (f) => (cap ? cap1(f) : f);
  return {
    type: "choice", skill: "nafnord", s: t.s, i: t.i, cue: t.n.o,
    title: "Veldu rétt fall", question: `Í hvaða mynd á *${t.n.o}* að standa?`,
    options: shuffled([t.answers[0], ...opts.slice(0, 3)]).map(fix), answer: fix(t.answers[0]),
    why: t.why, base: 7, lvl: t.lvl, cell: t.cell, word: t.word,
    m: t.m, paradigm: t.n.forms, tags: [],
  };
}

/* ================= Setningafræði og setningagerð ======================= */

const ROLES = ["frumlag", "umsögn", "andlag", "sagnfylling"];
/* The head of the part, not a word inside it: *miklu* in *miklu máli* carries
   the role of the phrase, and naming it "andlag" on its own teaches the
   wrong thing. A predicative adjective is the head of its part. */
const roleHead = (t, s, i) => !t.rn && !(t.ra || []).length && ROLES.concat("óbeint andlag").includes(t.r)
  && (["nafnorð", "sagnorð"].includes(t.c) || (t.c === "lýsingarorð" && t.r === "sagnfylling")
    /* a pronoun on its own (*Ég*, *þeim*), not one beside a noun (*verkefnið sitt*) */
    || (t.c === "fornafn" && !["nafnorð"].includes((s.tok[i - 1] || {}).c) && (s.tok[i + 1] || {}).c !== "nafnorð"));

export function synRole(ctx) {
  const P = pol(ctx);
  const b = Math.max(3, band(ctx, "setningafraedi"));
  const roles = b >= 4 ? [...ROLES, "óbeint andlag"] : ROLES;
  const hits = [];
  ctx.lex.sentences.forEach((s) => {
    if (!P.level(s.lvl) || s.lvl > b) return;
    s.tok.forEach((t, i) => { if (roles.includes(t.r) && roleHead(t, s, i)) hits.push({ s, i, t }); });
  });
  if (!hits.length) return null;
  const h = pickOne(hits);
  return {
    type: "choice", skill: "setningafraedi", s: h.s, i: h.i, mark: true,
    title: "Hvaða setningarhluti?", question: `Hvert er hlutverk orðsins *${h.t.w}* í setningunni?`,
    options: roles, answer: h.t.r,
    why: { frumlag: "Frumlagið er sá eða það sem gerir eitthvað eða er eitthvað (*hver/hvað?*).",
      umsögn: "Umsögnin er sögnin sem segir hvað frumlagið gerir.",
      andlag: "Andlagið er það sem sögnin beinist að (*hvern/hvað?*), oft í aukafalli.",
      sagnfylling: "Sagnfylling fylgir sögnum eins og *vera, verða, heita* og lýsir frumlaginu.",
      "óbeint andlag": "Óbeint andlag er sá sem fær eitthvað (*gaf **henni** bókina*), oftast í þágufalli." }[h.t.r],
    base: 10, lvl: h.s.lvl, cell: "setn:" + h.t.r, word: null, tags: ["syn"], miss: ["setningalidir"],
  };
}

export function synSort(ctx) {
  const P = pol(ctx);
  const b = Math.max(3, band(ctx, "setningafraedi"));
  for (let k = 0; k < 40; k++) {
    const s = pickOne(ctx.lex.sentences.filter((x) => P.level(x.lvl) && x.lvl <= b));
    if (!s) return null;
    const idx = s.tok.map((t, j) => (ROLES.includes(t.r) && roleHead(t, s, j) ? j : -1)).filter((j) => j >= 0);
    const kinds = new Set(idx.map((j) => s.tok[j].r));
    if (idx.length < 3 || kinds.size < 3 || idx.length > 5) continue;
    return {
      type: "sort", skill: "setningafraedi", s, items: idx.map((j) => ({ w: s.tok[j].w, j, cls: s.tok[j].r })),
      buckets: ROLES, title: "Flokkaðu setningarhlutana",
      question: "Hvert er hlutverk hvers undirstrikaðs orðs?",
      base: 4 + 3 * idx.length, lvl: s.lvl, cell: "sort:setn", word: null, tags: ["syn"],
    };
  }
  return null;
}

function clauseSpans(s) {
  const out = [];
  let start = 0;
  for (let i = 1; i <= s.tok.length; i++) {
    const prev = s.tok[i - 1].k, here = i < s.tok.length ? s.tok[i].k : null;
    if (here !== prev) { if (prev && i - start > 1) out.push({ from: start, to: i - 1, kind: prev }); start = i; }
  }
  return out;
}
function subClause(ctx) {
  const P = pol(ctx);
  const b = Math.max(5, band(ctx, "setningagerd"));
  const pool = shuffled(ctx.lex.sentences.filter((s) => !s.ku && P.level(s.lvl) && s.lvl <= b
    && new Set(s.tok.map((t) => t.k).filter(Boolean)).size > 1));
  for (const s of pool.slice(0, 30)) {
    const spans = clauseSpans(s).filter((x) => x.kind !== "aðalsetning"
      && s.tok.slice(x.from, x.to + 1).some((t) => t.x === "so"));
    /* One subordinate clause of that kind, so "the" clause is unambiguous. */
    const kinds = spans.map((x) => x.kind);
    const one = spans.filter((x) => kinds.filter((k) => k === x.kind).length === 1);
    if (one.length) return { s, span: pickOne(one) };
  }
  return null;
}

export function clFind(ctx) {
  const c = subClause(ctx);
  if (!c) return null;
  const { s, span } = c;
  const targets = [];
  for (let j = span.from; j <= span.to; j++) if (!PUNCT.has(s.tok[j].w)) targets.push(j);
  return {
    type: "tap", skill: "setningagerd", s, cls: span.kind, targets, whole: true,
    title: `Finndu ${span.kind}una`,
    question: `Smelltu á **öll orðin** í ${span.kind}unni.`,
    base: 14, lvl: Math.max(6, s.lvl), cell: "gerd:finna-" + span.kind, word: null, tags: ["clause"],
  };
}

export function clStart(ctx) {
  const c = subClause(ctx);
  if (!c) return null;
  const { s, span } = c;
  const first = s.tok[span.from];
  const others = shuffled(s.tok.filter((t, j) => !PUNCT.has(t.w) && (j < span.from || j > span.to) && t.w !== first.w)
    .map((t) => t.w)).filter((w, k, a) => a.indexOf(w) === k).slice(0, 3);
  if (others.length < 2) return null;
  return {
    type: "choice", skill: "setningagerd", s, i: -1, span,
    title: "Hvar hefst setningin?", question: `Á hvaða orði hefst ${span.kind}in?`,
    options: shuffled([first.w, ...others]), answer: first.w,
    why: span.kind === "aukasetning"
      ? `Aukasetningin hefst á *${first.w}*. Aukasetningar hefjast oftast á samtengingu (*að, sem, þegar, ef, af því að …*).`
      : `Nafnháttarsetningin hefst á *${first.w}*: *að* + sögn í nafnhætti.`,
    base: 12, lvl: Math.max(6, s.lvl), cell: "gerd:upphaf", word: null, tags: ["clause"], miss: ["setningagerd"],
  };
}
