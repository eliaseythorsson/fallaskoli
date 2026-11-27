/* The Orðakort: what the card of one word shows and asks (issue #15,
 * docs/DLD-PLAN.md §1 "First meeting"). The structured version: nothing here
 * is read by a model, and nothing the pupil types.
 *
 * `buildCard(lex, word)` → the card, a list of STEPS in the order they are
 * taken. What the pupil answered is kept by core/wordcard.js.
 *
 *   lesa      read: the ÍNO definition, up to three sentences, the syllables
 *             and a short inflection table
 *   mat       self-rating: aldrei heyrt / heyrt það / get notað það
 *   skyring   choose the right explanation of three — THE DEFINITION IS NOT ON
 *             THE SCREEN while this step is open (the card shows one step at
 *             a time, and only `lesa` holds the definition)
 *   setning   choose the sentence that uses the word correctly
 *   skyld     choose the words that mean nearly the same, from a list
 *   flokkur   the word class
 *   kyn       a noun's gender
 *   eigin     (#37) only for a pupil with server grading on: the word
 *             explained in their own words, read on the server against the
 *             card's ÍNO definition (`eiginTask`); it replaces `skyring`
 *
 * ---- every option is checked, or the step is dropped ---------------------
 *
 * No option is made up here. Each comes from BÍN (the lexicon's forms and
 * classes), from ÍNO (the definitions and examples the build joined on) or
 * from a hand-written list in content/. When a word does not have enough of
 * that for a step, THE STEP IS DROPPED FOR THAT WORD rather than filled with
 * something unchecked — a card with four steps is a good card, a card with a
 * wrong option is not. `lesa` and `mat` are always there. The rules, step by
 * step:
 *
 *   lesa     definition: the word's own, from ÍNO or the hand-written table,
 *            if it is a meaning and not a class label. ONE SENSE PER CARD:
 *            ÍNO's first sense, or — for a word with a line in the meaning
 *            list (below) — the sense that line names. An ÍNO entry whose own
 *            example does not hold a BÍN form of the word is not trusted (the
 *            entry was joined from another word: *mæla* "to speak" on the
 *            verb that measures, or a "see …" that gives the other word's
 *            text), and the card then shows no definition.
 *            Sentences: only those tied to that sense — ÍNO's example for it
 *            and the right sentence of the meaning list — so one or two, none
 *            written here. The sentence bank is NOT used: the build confirms
 *            the word's form there, not its sense (*heimild* "leyfi, réttur"
 *            beside a sentence about sources). Syllables: only for a word on
 *            the checked list (core/syllables.js). Table: BÍN's forms.
 *   skyring  right: the word's ÍNO definition. Wrong: the ÍNO definitions of
 *            the two OTHER words written down for this word in
 *            src/js/content/wordcards.js. Those pairs were proposed by
 *            `proposeFar` (LÍNO-2 words of the same class that are FAR from
 *            the word, `near` below) and then READ ONE BY ONE, and every pair
 *            where a pupil could argue was thrown out (*yfirleitt* beside
 *            "sér í lagi, aðallega"; *jákvæður* beside the definition of
 *            *bjartsýnn*): what the data cannot see, a reader can. (The
 *            first reading was the agent's that wrote the list; a native
 *            reader's is asked for in content/REVIEW-NOTES.md.) Dropped
 *            for a word that is not on that list, has no trusted ÍNO
 *            definition, or whose card is about another sense than the one
 *            the pair was read against.
 *   setning  the word's line in content/ordafordi/merking.tsv (issue #11,
 *            `EX.meaningChoice`): one right sentence and two where the word
 *            stands in another word's place, all written and checked there.
 *            Dropped for a word without a line, or whose line names no sense
 *            of ÍNO.
 *   skyld    right: the word's synonyms in content/ordafordi/samheiti.tsv.
 *            Wrong: three words of the same lists that are neither synonyms
 *            nor antonyms of the word or of its synonyms (the rule of
 *            `ordSynAnt`), and not `near` it. Dropped for a word that is in no
 *            synonym group.
 *   flokkur  the class BÍN files the word under, among the four open classes.
 *            Dropped for a lemma that is also a word of another class
 *            (*stefna* the noun and the verb): the question would have two
 *            right answers.
 *   kyn      nouns only: the gender BÍN gives. (The plan's "category": the
 *            hand-written noun classes call nearly every LÍNO-2 noun
 *            "abstract", which is not a category a pupil can be asked, so the
 *            grammatical one is asked instead.)
 *
 * The same word always gets the same card: which wrong options are drawn and
 * the order of the options come from a generator seeded by the word, so what
 * a reviewer reads (tests/wordcard.test.js prints any card) is exactly what
 * every pupil sees.
 *
 * ---- adding a step (#18, #37/#38) ----------------------------------------
 *
 * A step is one entry in STEPS: `{ id, build(ctx) }`, where `build` returns
 * the step or null when the word has no material for it. `kind` says how it
 * is drawn and answered (ui/wordcard.js KINDS): "read", "rate", "choice".
 * A free-text step graded by the server is a new kind there and a new entry
 * here, placed before the structured step it replaces; core/wordcard.js keeps
 * any step's answer by its id.
 *
 * Pure: no state, no clock, no random source of its own (the generator is seeded by the word).
 */

import { EX } from "../../../data/exercises.js";
import { isGrammarGloss } from "../core/definitions.js";
import { syllablesOf } from "../core/syllables.js";
import { EXPLAIN_LIST } from "../content/wordcards.js";
import { seeded } from "../core/duel.js";
import { CLASSNAME, GENDERS } from "../core/marks.js";
import { RATINGS } from "../core/wordcard.js";
import { synonymsOf, antonymsOf } from "./ordaford.js";
import { shuffle, cap1 } from "./shared.js";

const NOUN = new Set(["kk", "kvk", "hk"]);
/** The lists of content/ordafordi/ a word class is in. */
const posOf = (c) => (NOUN.has(c) ? "no" : c);
const first = (w, m) => ((w.forms && w.forms[m]) || [])[0] || null;

/* A generator that is the same for the same word, on every machine. */
function rngFor(key) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  return seeded(h >>> 0);
}

/* ---------- lesa: the definition, the sentences, the table ---------------- */

/** The word's definition if it is a meaning (not a class label), or null. */
const meaningOf = (w) => (w && w.d && !isGrammarGloss(w.d) ? String(w.d).trim() : null);

/** Every BÍN form of the word, lower case. */
const formSet = (w) => new Set(Object.values(w.forms || {}).flat().map((f) => String(f).toLowerCase()));

/** Where a form of the word stands in a text: [from, to), or null. */
export function formIn(w, text) {
  const forms = formSet(w);
  for (const m of String(text || "").matchAll(/[\p{L}]+(?:-[\p{L}]+)*/gu))
    if (forms.has(m[0].toLowerCase())) return [m.index, m.index + m[0].length];
  return null;
}

/** The word's line of the meaning list (issue #11) if it names a sense with
    a definition, or null. */
function meaningItem(ex, w) {
  const x = ((ex && ex.meaningChoice) || []).find((y) => y.o === w.o && y.c === w.c);
  return x && typeof x.r === "string" && Array.isArray(x.w) && x.w.length >= 2
    && typeof x.d === "string" && x.d && formIn(w, x.r) ? x : null;
}

/**
 * The one sense the card is about: its definition, where it is from, and the
 * sentences tied to it (see `lesa` at the top).
 * @returns {{def: string|null, ino: boolean, sentences: {text: string, at: number[], src: string}[], item: any}}
 */
export function senseOf(w, ex) {
  const item = meaningItem(ex, w);
  /* ÍNO's entry is trusted when its own example holds the word. */
  const exampleAt = w.x ? formIn(w, w.x) : null;
  const own = w.ds !== "ino" || !w.x || exampleAt ? meaningOf(w) : null;
  const def = item ? String(item.d).trim() : own;
  const sentences = [];
  if (w.ds === "ino" && exampleAt && def === own) sentences.push({ text: String(w.x), at: exampleAt, src: "ÍNO" });
  if (item && item.r !== w.x) sentences.push({ text: item.r, at: formIn(w, item.r), src: "" });
  return { def, ino: !!def && (!!item || w.ds === "ino"), sentences, item };
}

/** Does the word have one and the same form in every cell BÍN gives it? */
const sameEverywhere = (w) => formSet(w).size === 1;

/** A short inflection table out of BÍN's forms: `{ head, rows }` or null. */
export function shortTable(w) {
  const row = (label, marks) => {
    const cells = marks.map((m) => first(w, m));
    return cells.every(Boolean) ? [label, ...cells] : null;
  };
  if (NOUN.has(w.c)) {
    const plural = ["NFFT", "ÞFFT", "ÞGFFT", "EFFT"].every((m) => first(w, m));
    const rows = [["nf.", "NF"], ["þf.", "ÞF"], ["þgf.", "ÞGF"], ["ef.", "EF"]]
      .map(([label, k]) => row(label, plural ? [k + "ET", k + "FT"] : [k + "ET"]));
    return rows.every(Boolean) ? { head: plural ? ["", "eintala", "fleirtala"] : ["", "eintala"], rows } : null;
  }
  if (w.c === "lo") {
    const rows = [["frumstig", "FSB"], ["miðstig", "MST"], ["efsta stig", "ESB"]]
      .map(([label, d]) => row(label, ["KK", "KVK", "HK"].map((g) => `${d}-${g}-NFET`)));
    /* An adjective with one form for everything (*mismunandi*) has no table. */
    return rows[0] && !sameEverywhere(w) ? { head: ["", "karlkyn", "kvenkyn", "hvorugkyn"], rows: rows.filter(Boolean) } : null;
  }
  if (w.c === "so") {
    /* The principal parts, each in a phrase a pupil can say. A verb used only
       in the third person (*rigna*) goes with *það*. */
    const p = w.t3 ? "3P" : "1P", who = w.t3 ? "það" : "ég", has = w.t3 ? "það hefur" : "ég hef";
    const v = w.forms["GM-NH"] ? "GM" : "MM";
    const nh = first(w, `${v}-NH`), nt = first(w, `${v}-FH-NT-${p}-ET`),
      th = first(w, `${v}-FH-ÞT-${p}-ET`), sb = first(w, `${v}-SAGNB`);
    const rows = [nh && ["nafnháttur", `að ${nh}`], nt && ["nútíð", `${who} ${nt}`],
      th && ["þátíð", `${who} ${th}`], sb && ["sagnbót", `${has} ${sb}`]].filter(Boolean);
    return rows.length >= 3 ? { head: null, rows } : null;
  }
  return null;
}

function stepRead({ w, sense }) {
  return {
    id: "lesa", kind: "read",
    def: sense.def, source: sense.ino ? "ÍNO" : null,
    sentences: sense.sentences,
    syllables: syllablesOf(w.o),
    table: shortTable(w),
    /* An adverb has no table (the lexicon files every adverb as
       indeclinable), nor has an adjective with one form for everything. */
    note: w.c === "ao" || sameEverywhere(w) ? "Orðið beygist ekki." : null,
  };
}

/* ---------- mat: the self-rating ------------------------------------------ */

const RATING_TEXT = { aldrei: "Ég hef aldrei heyrt það", heyrt: "Ég hef heyrt það", nota: "Ég get notað það" };

function stepRate({ w }) {
  return {
    id: "mat", kind: "rate",
    question: `Hversu vel þekkir þú orðið *${w.o}*?`,
    options: RATINGS.map((id) => ({ id, text: RATING_TEXT[id] })),
  };
}

/* ---------- eigin: in my own words (#37) ------------------------------------ */

/** The type id of the explanation in the pupil's own words: a question type
    of its own (core/catalogue.js, `grader: "server"`), asked on the card and
    in a session. */
export const EIGIN = "or_eigin";

/**
 * The rubric the server's reader ticks (core/answer.js `checklistOf`). The
 * labels and the follow-up questions are OUR words: nothing a model writes
 * is shown to the pupil as a question. `merking` is the main point: it alone
 * decides right or wrong. The server's prompt (server/rubric-eigin.mjs)
 * says what each id means.
 * @param {string} lemma
 */
export const eiginRubric = (lemma) => ({
  main: "merking",
  points: [
    { id: "merking", label: "Merkingin er rétt",
      ask: `Hvert er aðalatriðið í merkingu orðsins ${lemma}?` },
    { id: "eigin", label: "Með þínum eigin orðum",
      ask: `Geturðu sagt þetta á annan hátt, án þess að nota orðið ${lemma} sjálft?` },
  ],
});

/**
 * The explanation question on one word, graded against the card's sense
 * (`senseOf`). Null for a word without a trusted ÍNO definition: there is
 * nothing to grade it against. The server looks the definition up again by
 * the word key (server/rubric-eigin.mjs): what the browser sends is the word,
 * never the definition.
 * @param {any} w  a lexicon entry @param {{ex?: any}} [o]
 */
export function eiginTask(w, { ex = EX } = {}) {
  const sense = w ? senseOf(w, ex) : null;
  if (!sense || !sense.def || !sense.ino) return null;
  const word = `${w.o}|${w.c}`;
  return {
    type: "meaning", typeId: EIGIN, grader: "server", skill: "ordaford",
    n: w, word, base: 10, lvl: 1,
    /* What the answer is graded against; shown after the reading. */
    def: sense.def,
    read: { kind: EIGIN, context: { word } },
    rubric: eiginRubric(w.o),
  };
}

/* With server grading on for this pupil (`ctx.eigin`) the pupil explains
   the word in their own words, and the structured choice of the right
   explanation (`skyring`) is left out (DLD-PLAN §1: steps 3–5 are free text
   with the LLM on). The definition is not on the screen while they write. */
function stepOwn({ w, ex, eigin }) {
  const task = eigin ? eiginTask(w, { ex }) : null;
  if (!task) return null;
  return { id: "eigin", kind: "server", task, def: task.def,
    question: `Hvað merkir orðið *${w.o}*? Segðu það með þínum eigin orðum.` };
}

/* ---------- skyring: the right explanation -------------------------------- */

/* Words of a definition that say nothing about what it means. */
const EMPTY = new Set(("vera hafa verða sem eða það þess þegar sína sinn einhver einhvers einhverju eitthvað "
  + "einhverjum þetta þessi hann hún þeir").split(" "));
const OPEN = new Set(["kk", "kvk", "hk", "lo", "so", "ao"]);

/** What a definition is made of: its words of four letters or more as they
    stand, and the open-class lemmas BÍN gives them. */
function glossOf(lex, def) {
  const out = new Set();
  for (const t of String(def || "").toLowerCase().match(/[\p{L}]+/gu) || []) {
    if (t.length < 4 || EMPTY.has(t)) continue;
    out.add(t);
    for (const a of lex.analyse(t)) if (OPEN.has(a.cls) && !EMPTY.has(a.lemma)) out.add(a.lemma);
  }
  return out;
}

/* Per lexicon: every word's gloss, and per lemma the glosses of its entries. */
const glossCache = new WeakMap();
function glosses(lex) {
  let g = glossCache.get(lex);
  if (g) return g;
  g = { of: new Map(), byLemma: new Map() };
  for (const w of lex.all) {
    if (!w.d) continue;
    const set = glossOf(lex, w.d);
    g.of.set(w, set);
    const all = g.byLemma.get(w.o) || new Set();
    set.forEach((x) => all.add(x));
    g.byLemma.set(w.o, all);
  }
  glossCache.set(lex, g);
  return g;
}

const meet = (a, b) => { for (const x of a) if (b.has(x)) return true; return false; };
const NONE = new Set();

/**
 * Could the definition of `b` be taken for the meaning of `a`? True when the
 * two words are related in any way the data can see: the hand-written
 * synonym and antonym lists, the same word family (one lemma inside the
 * other, or the same first five letters), one named in the other's
 * definition, the two definitions sharing a word, or — one step further —
 * a word named in one definition whose own definition names the other word
 * or shares a word with its definition (*einungis* "bara, eingöngu" and
 * *aðeins* meet in *bara*). Symmetric. Errs on the side of "near": a far word
 * wrongly called near only costs one distractor.
 * @param {any} lex @param {any} a @param {any} b  lexicon entries
 * @param {Set<string>|null} [glossA]  what `a`'s definition is made of, if not its own `d`
 */
export function near(lex, a, b, glossA = null) {
  if (a.o === b.o) return true;
  const [s, l] = a.o.length <= b.o.length ? [a.o, b.o] : [b.o, a.o];
  if ((s.length >= 4 && l.includes(s)) || (s.length >= 5 && s.slice(0, 5) === l.slice(0, 5))) return true;
  if (synonymsOf(a.o).includes(b.o) || antonymsOf(a.o).includes(b.o)
    || synonymsOf(b.o).includes(a.o) || antonymsOf(b.o).includes(a.o)) return true;
  const G = glosses(lex);
  /* `glossA`: the card's definition, when it is not the word's first sense. */
  const ga = glossA || G.of.get(a) || NONE, gb = G.of.get(b) || NONE;
  if (ga.has(b.o) || gb.has(a.o) || meet(ga, gb)) return true;
  const hop = (from, to, toWord) => {
    for (const x of from) {
      const gx = G.byLemma.get(x);
      if (gx && (gx.has(toWord.o) || meet(gx, to))) return true;
    }
    return false;
  };
  return hop(ga, gb, b) || hop(gb, ga, a);
}

/* A definition that can stand as an option: ÍNO's, a meaning, one line. */
const DEF_MAX = 120;
const optionDef = (w) => (w.ds === "ino" && meaningOf(w) && w.d.length <= DEF_MAX && !/^\(|[<>]/.test(w.d)
  && (!w.x || formIn(w, w.x)) ? meaningOf(w) : null);

/**
 * Two far definitions for the word's explanation step, PROPOSED: other
 * LÍNO-2 words of the same word class whose ÍNO definitions are far from the
 * word and from each other — first those of the same kind of noun (an
 * abstract word among abstract words), then the nearest in length, so the
 * right one stands out neither by its subject nor by its size. This is what
 * tools/wordcards.mjs prints for a person to read; the card itself only uses
 * pairs that were read and written down (src/js/content/wordcards.js).
 * @param {any} lex @param {any} w  a lexicon entry @param {() => number} rng
 * @returns {any[]} two lexicon entries, or fewer when there are not two
 */
export function proposeFar(lex, w, rng) {
  const right = meaningOf(w);
  if (!right) return [];
  const sameClass = (x) => (NOUN.has(w.c) ? NOUN.has(x.c) : x.c === w.c);
  const far = lex.all.filter((x) => x !== w && typeof x.lino === "number" && sameClass(x)
    && optionDef(x) && optionDef(x) !== right && !near(lex, w, x));
  const kind = (x) => (NOUN.has(w.c) && x.s !== w.s ? 1 : 0);
  const pool = [...far].sort((x, y) => kind(x) - kind(y)
    || Math.abs(x.d.length - right.length) - Math.abs(y.d.length - right.length)
    || (x.o < y.o ? -1 : x.o > y.o ? 1 : 0)).slice(0, 12);
  const out = [];
  for (const x of shuffle(pool, rng)) {
    if (out.length === 2) break;
    if (out.every((y) => y.d !== x.d && !near(lex, x, y))) out.push(x);
  }
  return out;
}

/** word key → the two word keys whose definitions are its wrong options. */
const EXPLAIN = new Map(EXPLAIN_LIST.split("\n").map((ln) => ln.trim().split(/\s+/))
  .filter((f) => f.length === 3).map(([k, a, b]) => [k, [a, b]]));

/** The checked pairs, for the tests and tools/wordcards.mjs. */
export const explainPairs = () => new Map(EXPLAIN);

function stepExplain({ lex, w, key, rng, sense }) {
  /* Only the sense the pairs were read against: the word's own definition. */
  const right = sense.ino && sense.def === meaningOf(w) ? sense.def : null;
  const pair = EXPLAIN.get(key);
  if (!right || !pair) return null;
  const wrong = pair.map((k) => { const at = k.lastIndexOf("|"); return lex.lookup(k.slice(0, at), k.slice(at + 1)); });
  /* A listed word this pupil's lexicon does not have (the vocabulary
     filter), or whose definition is gone from the data: no step. */
  if (!wrong.every((x) => x && optionDef(x) && optionDef(x) !== right) || optionDef(wrong[0]) === optionDef(wrong[1])) return null;
  return {
    id: "skyring", kind: "choice", multi: false,
    question: `Hvað merkir orðið *${w.o}*?`,
    options: shuffle([{ id: key, text: right }, ...wrong.map((x) => ({ id: `${x.o}|${x.c}`, text: optionDef(x) }))], rng),
    answer: [key],
    why: `*${w.o}*: ${right}`,
  };
}

/* ---------- setning: the sentence that uses the word correctly ------------ */

function stepSentence({ w, rng, sense }) {
  const x = sense.item;
  if (!x) return null;
  const wrong = shuffle(x.w, rng).slice(0, 2);
  return {
    id: "setning", kind: "choice", multi: false,
    question: `Í hvaða setningu er orðið *${w.o}* notað rétt?`,
    options: shuffle([x.r, ...wrong], rng).map((t) => ({ id: t, text: t })),
    answer: [x.r],
    why: `Rétta setningin er: *${x.r}* Í hinum tveimur passar orðið ekki.`,
  };
}

/* ---------- skyld: words that mean nearly the same ------------------------ */

function stepRelated({ lex, w, ex, rng }) {
  const pos = posOf(w.c);
  const groups = ((ex.synonyms || {})[pos] || []).filter((g) => g.some((y) => y.o === w.o && y.c === w.c));
  if (!groups.length) return null;
  /* Every option is a word of this pupil's lexicon (the vocabulary filter). */
  const known = (y) => !!lex.lookup(y.o, y.c);
  const right = [...new Map(groups.flat().filter((y) => y.o !== w.o && known(y)).map((y) => [y.o, y])).values()];
  if (!right.length) return null;
  const shown = shuffle(right, rng).slice(0, 2);
  /* The rule of `ordSynAnt`: nothing from the word's own group, from the
     groups of its synonyms, or from what is the opposite of either. */
  const mine = [w.o, ...right.map((y) => y.o)];
  const ban = new Set([...mine, ...mine.flatMap((o) => [...synonymsOf(o, pos), ...antonymsOf(o, pos)]),
    ...mine.flatMap((o) => antonymsOf(o, pos).flatMap((a) => synonymsOf(a, pos))),
    ...mine.flatMap((o) => ["ó" + o, o.replace(/^ó/, "")])]);
  const all = [...((ex.synonyms || {})[pos] || []).flat(), ...((ex.antonyms || {})[pos] || []).flat()];
  const pool = [...new Map(all.filter((y) => !ban.has(y.o) && known(y)).map((y) => [y.o, y])).values()]
    .filter((y) => [w, ...right.map((r) => lex.lookup(r.o, r.c))].every((m) => !near(lex, m, lex.lookup(y.o, y.c))));
  const wrong = shuffle(pool, rng).slice(0, 3);
  if (wrong.length < 3) return null;
  const names = shown.map((y) => `*${y.o}*`).join(" og ");
  return {
    id: "skyld", kind: "choice", multi: true,
    question: `Hvaða orð merkja nánast það sama og *${w.o}*? Veldu öll sem passa.`,
    options: shuffle([...shown, ...wrong], rng).map((y) => ({ id: y.o, text: y.o })),
    answer: shown.map((y) => y.o),
    why: `*${cap1(w.o)}* og ${names} merkja nánast það sama.`,
  };
}

/* ---------- flokkur, kyn: what BÍN says ----------------------------------- */

const CLASS_OPTIONS = [["no", "nafnorð"], ["so", "sagnorð"], ["lo", "lýsingarorð"], ["ao", "atviksorð"]];
/** A lemma that is one word only, as far as this lexicon knows. */
const oneWord = (lex, w) => lex.homographClasses(w.o).length === 1;

function stepClass({ lex, w }) {
  if (!oneWord(lex, w) || !CLASS_OPTIONS.some(([id]) => id === posOf(w.c))) return null;
  return {
    id: "flokkur", kind: "choice", multi: false,
    question: `Hvaða orðflokki tilheyrir orðið *${w.o}*?`,
    options: CLASS_OPTIONS.map(([id, nm]) => ({ id, text: cap1(nm) })),
    answer: [posOf(w.c)],
    why: `*${cap1(w.o)}* er ${CLASSNAME[w.c]}.`,
  };
}

function stepGender({ lex, w }) {
  if (!NOUN.has(w.c) || !oneWord(lex, w)) return null;
  const withArticle = first(w, "NFETgr");
  return {
    id: "kyn", kind: "choice", multi: false,
    question: `Í hvaða kyni er nafnorðið *${w.o}*?`,
    options: Object.entries(GENDERS).map(([id, nm]) => ({ id, text: cap1(nm) })),
    answer: [w.c],
    why: `*${cap1(w.o)}* er ${GENDERS[w.c]}sorð` + (withArticle && !w.na ? `: *${withArticle}*.` : "."),
  };
}

/* ---------- the card -------------------------------------------------------- */

/** The steps of a card, in the order they are taken. A step is added here
    (see "adding a step" at the top). */
export const STEPS = [
  { id: "lesa", build: stepRead },
  { id: "mat", build: stepRate },
  { id: "eigin", build: stepOwn },
  { id: "skyring", build: stepExplain },
  { id: "setning", build: stepSentence },
  { id: "skyld", build: stepRelated },
  { id: "flokkur", build: stepClass },
  { id: "kyn", build: stepGender },
];

/**
 * The card of one word, or null for a word the lexicon does not have.
 * @param {any} lex  the pupil's lexicon (core/lexicon.js)
 * @param {string} word  a `wordKey`, "breyting|kvk"
 * @param {{ex?: any, eigin?: boolean}} [o]  `ex`: the exercise lists (data/exercises.js), for a
 *   test. `eigin`: the pupil may have their own explanation read by the
 *   server (core/policy.js: the type `or_eigin` is on for them).
 * @returns {{word: string, lemma: string, cls: string, steps: any[]} | null}
 */
export function buildCard(lex, word, { ex = EX, eigin = false } = {}) {
  const at = String(word || "").lastIndexOf("|");
  const w = at > 0 ? lex.lookup(word.slice(0, at), word.slice(at + 1)) : null;
  if (!w || `${w.o}|${w.c}` !== word) return null;
  const ctx = { lex, w, key: word, ex, eigin, sense: senseOf(w, ex) };
  /* Each step draws from its own stream, so adding a step later does not
     change the options of the others. */
  let steps = STEPS.map((s) => s.build({ ...ctx, rng: rngFor(`${word}/${s.id}`) })).filter(Boolean);
  /* The free-text step replaces the structured one after it (#37). */
  if (steps.some((s) => s.id === "eigin")) steps = steps.filter((s) => s.id !== "skyring");
  return { word, lemma: w.o, cls: w.c, steps };
}

/**
 * Is this answer to a choice step right? Exactly the right options, no more.
 * @param {{answer: string[]}} step @param {string[]} chosen
 */
export function judgeStep(step, chosen) {
  const want = new Set(step.answer), got = new Set(chosen);
  return want.size === got.size && [...want].every((x) => got.has(x));
}
