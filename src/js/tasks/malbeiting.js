/* Málbeiting — production questions (v6.9): the child writes Icelandic, not
   just recognises it.

     villur      Villuveiðar — two sentences, one above the other, with one
                 or two errors to find and fix: from þyngd 3 the slips
                 Icelandic teenagers really make (the hand-written bank,
                 exercises.py HUNT), below that a generated wrong case or
                 agreement form
     smidja      Setningasmiðja — word cards in their dictionary form
                 ("ég – gefa – vinur – bók"); build the sentence, inflecting
                 every word
     umritun     Umritun — put this sentence in the past tense, in the
                 plural, in the passive, or start it with *Í gær* / *Á morgun*;
                 from v6.13 also: a passive back to the active, a statement
                 to a yes/no question, two sentences joined with a given
                 conjunction, and direct speech to indirect

   The rule behind every builder here is the program's rule: a wrong question
   is worse than no question. Every form these builders produce is read out of
   BÍN through the lexicon; every token they change has been confirmed (its
   lemma is in the vocabulary, BÍN has the mark the parse gave, and the
   surface form in the sentence is one of BÍN's forms for it) and carries no
   feature the build marked as uncertain. A sentence that cannot meet that is
   skipped, never guessed at. Pure module, no DOM.

   Grading these three is in core/answer.js (`gradeHunt`, `gradeWorkshop`,
   `gradeTransform`); this file only builds. */

import { EX } from "../../../data/exercises.js";
import { readMark, caseName, GENDERS } from "../core/marks.js";
import { patternById } from "../core/diagnosis.js";
import { normalise } from "../core/grading.js";
import { wordKey } from "../core/state.js";
import { explainVerbForm } from "./explain.js";
import { built, FX } from "./effects.js";
import { pick, shuffle, askable, bandFor, sentPool, levelFor, fresh, forced, drilling, forcedCell } from "./shared.js";

/* ---------------------------------------------------------------- helpers */

const PUNCT = new Set([".", "?", "!", ","]);
const FINITE = /^(GM|MM)-(FH|VH)-(NT|ÞT)-([123]P)-(ET|FT)$/;
/* Prepositions that govern two cases: the case after them depends on what is
   meant, so a form after one of them is never made wrong on purpose and never
   asked for without the sentence that decides it. Same list as government.py. */
const TWO_CASE = new Set(["í", "á", "eftir", "fyrir", "með", "undir", "yfir"]);
const NOMINAL = new Set(["nafnorð", "lýsingarorð", "fornafn", "greinir", "töluorð"]);
const MODIFIER = new Set(["lýsingarorð", "fornafn", "greinir", "töluorð"]);

const isPunct = (t) => PUNCT.has(t.w);
const words = (s) => s.tok.filter((t) => !isPunct(t));

/** The lexicon entry behind a token, but only if the token is confirmed:
    BÍN has its mark and the form in the sentence is one of BÍN's forms. */
export function confirmed(lex, t) {
  if (!t || !t.m || t.rj || !t.c) return null;
  const e = lex.entryForToken(t);
  if (!e || !e.forms[t.m]) return null;
  const want = normalise(t.w);
  return e.forms[t.m].some((f) => normalise(f) === want) ? e : null;
}

/** No feature the build left open, apart from those listed. */
const firm = (t, allow = []) => (t.u || []).every((f) => allow.includes(f));

const formsOf = (e, m) => (e && e.forms[m]) || [];
const capFirst = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
/** Lower-case the first letter, unless the word is a name (its lemma is
    capitalised in BÍN: *Ísland*, *Reykjavík*). */
function lowerFirst(w, entry) {
  if (!w) return w;
  if (entry && /^[A-ZÁÐÉÍÓÚÝÞÆÖ]/.test(entry.o)) return w;
  return w.charAt(0).toLowerCase() + w.slice(1);
}

/** Tokens -> text, with punctuation against the word before it. */
export function joinTokens(list) {
  let out = "";
  list.forEach((w, j) => {
    if (PUNCT.has(w)) out += w;
    else out += (j === 0 ? "" : " ") + w;
  });
  return out;
}

/** Every combination of the variants, as finished sentences. Capped: BÍN lists
    at most two or three variants of a form, and a sentence changes a handful
    of words. */
function combinations(slots, cap = 48) {
  let acc = [[]];
  for (const opts of slots) {
    const next = [];
    for (const a of acc) for (const o of opts) {
      next.push([...a, o]);
      if (next.length >= cap) break;
    }
    acc = next;
  }
  return acc.map((parts) => capFirst(joinTokens(parts.flat())));
}

/** The person-number of a finite mark ("3P-ET"), or null. */
const pn = (m) => { const x = FINITE.exec(m || ""); return x ? `${x[4]}-${x[5]}` : null; };

/** Swap the case in a nominal mark: "ÞFETgr" -> "NFETgr", "FSB-KK-ÞFET" -> "FSB-KK-NFET". */
const withCase = (m, to) => m.replace(/(^|-)(NF|ÞF|ÞGF|EF)(ET|FT)/, (_, a, _c, n) => `${a}${to}${n}`);
/** Swap the number in a nominal mark. */
const withNumber = (m, to) => m.replace(/(NF|ÞF|ÞGF|EF)(ET|FT)/, (_, c) => c + to);
const caseOf = (m) => { const x = /(?:^|-)(NF|ÞF|ÞGF|EF)(ET|FT)/.exec(m || ""); return x ? x[1] : null; };
const numOf = (m) => { const x = /(?:^|-)(NF|ÞF|ÞGF|EF)(ET|FT)/.exec(m || ""); return x ? x[2] : null; };
const CASE_WORD = { NF: "nefnifall", ÞF: "þolfall", ÞGF: "þágufall", EF: "eignarfall" };
const caseIn = (k) => ({ NF: "nefnifalli", ÞF: "þolfalli", ÞGF: "þágufalli", EF: "eignarfalli" })[k];

/** Is every token of the sentence in one main clause? */
const oneClause = (s) => s.tok.every((t) => isPunct(t) || t.k === "aðalsetning");
/** Participles and the supine: BÍN gives this lexicon only three cells of the
    past participle, so a sentence that would need another is left alone. */
const hasParticiple = (s) => s.tok.some((t) => /^(LHÞT|LHNT)|SAGNB/.test(t.m || ""));
const endsPlain = (s) => s.tok.length && s.tok[s.tok.length - 1].w === "." &&
  !s.tok.slice(0, -1).some(isPunct);

/** The contiguous run of tokens carrying `role`, or null if it is broken up. */
function block(s, role) {
  const idx = s.tok.map((t, j) => (t.r === role ? j : -1)).filter((j) => j >= 0);
  if (!idx.length) return null;
  for (let k = 1; k < idx.length; k++) if (idx[k] !== idx[k - 1] + 1) return null;
  return { from: idx[0], to: idx[idx.length - 1] };
}

/* Time adverbials. A sentence that already says when (*í gær*, *á morgun*,
   *í dag*) or how often (*alltaf*, *á hverjum degi*) cannot be moved to
   another time without contradicting itself: v6.12 turned *Ég man vel eftir
   ferðinni í fyrra* into *Í gær mundi ég vel eftir ferðinni í fyrra* (critique
   item 29), because *í fyrra* was not on a list of strings.

   The test reads the parsed tokens, not the text. Greynir gives a time
   adverb of two words as ONE token (*í gær*, *á morgun*, *á kvöldin*, lemma
   and all), so TIME_ADVERBS is matched against the lemma; a time NOUN is
   caught wherever it stands — after a preposition (*í dag*, *um helgina*,
   *á hverjum degi*, *í síðustu viku*) or alone in the accusative (*allan
   daginn*, *næsta sumar*) — by its semantic class `time` (noun_classes.py)
   or, for the nouns that have no class (the weekdays, the months, the
   holidays), by TIME_NOUNS. *Í fyrra* is the one phrase Greynir leaves
   unanalysed (*fyrra* comes out without a mark), so it is matched as the two
   tokens it is. Over-matching costs a sentence; under-matching costs a
   nonsense question. */
const TIME_ADVERBS = new Set(["í gær", "í morgun", "í kvöld", "á morgun", "í gærkvöldi",
  "í fyrradag", "í fyrramálið", "í dag", "í nótt", "í ár", "í fyrra", "í vetur", "í sumar",
  "í vor", "í haust", "á morgnana", "á kvöldin", "á daginn", "á nóttunni", "á sumrin",
  "á veturna", "á vorin", "á haustin", "um helgina", "um helgar",
  "núna", "nú", "áðan", "bráðum", "brátt", "seinna", "síðar", "næst", "þá", "síðan",
  "loksins", "lengi", "enn", "ennþá", "aldrei", "strax", "nýlega", "nýverið"]);
/* How often: wrong beside *Í gær* (*Í gær borðaði ég epli daglega*), right
   in any tense (*Ég borðaði epli daglega*). So the past tense keeps them. */
const HABITUAL = new Set(["alltaf", "oft", "oftast", "stundum", "sjaldan", "sjaldnast",
  "daglega", "vikulega", "árlega", "yfirleitt", "venjulega", "þrisvar", "tvisvar",
  "einu sinni", "aftur og aftur", "áður", "fyrr"]);
const TIME_NOUNS = new Set(["mánudagur", "þriðjudagur", "miðvikudagur", "fimmtudagur",
  "föstudagur", "laugardagur", "sunnudagur", "janúar", "febrúar", "mars", "apríl", "maí",
  "júní", "júlí", "ágúst", "september", "október", "nóvember", "desember",
  "gamlárskvöld", "nýársdagur", "aðfangadagur", "hvítasunna", "morgundagur", "helgi",
  "dagur", "kvöld", "morgunn", "nótt", "vika", "mánuður", "ár", "sumar", "vetur", "vor",
  "haust", "hádegi"]);
export function timeAdverbial(lex, s, { habitual = true } = {}) {
  const isTime = (w) => TIME_ADVERBS.has(w) || (habitual && HABITUAL.has(w));
  return s.tok.some((t, j) => {
    const l = String(t.l || t.w).toLowerCase();
    /* The lemma, or the word itself where the parse gave no class: *þá* the
       pronoun ("them", lemma *hann*) is not *þá* the adverb ("then"). */
    if (isTime(l)) return true;
    if (!INFLECTED.has(t.c) && isTime(String(t.w).toLowerCase())) return true;
    if (t.c === "forsetning" && l === "í" && s.tok[j + 1] &&
        ["fyrra", "fyrri", "hitteðfyrra"].includes(String(s.tok[j + 1].w).toLowerCase())) return true;
    if (t.c === "nafnorð" || t.x === "no") {
      if (TIME_NOUNS.has(l)) return true;
      const e = lex.entryForToken(t);
      return !!e && (e.s === "time" || TIME_NOUNS.has(e.o));
    }
    return false;
  });
}
const INFLECTED = new Set(["nafnorð", "fornafn", "sagnorð", "lýsingarorð", "töluorð", "greinir"]);
const saysWhen = timeAdverbial;

/* ============================================================ UMRITUN === */

/* Verbs whose passive no one says, or says only in a special sense: states,
   possession, perception, modals and motion. */
const NO_PASSIVE = new Set(["eiga", "hafa", "fá", "vita", "kunna", "þekkja", "vilja",
  "hitta", "sjá", "heyra", "muna", "sakna", "langa", "vanta", "þurfa", "mega", "geta",
  "vera", "verða", "fara", "koma", "ganga", "líka", "þykja", "finnast", "eignast",
  "fylgja", "mæta", "ná", "trúa", "henta", "nægja", "líða", "kosta", "halda", "eyða",
  "missa", "týna", "gleyma", "eignast", "bíða", "standa", "liggja", "sitja",
  "taka", "skipta", "fá", "gera", "hafa", "eiga"]);
/* Sentence adverbs stand between *vera* and the participle in the passive:
   *Bókin er alltaf lesin*, not *Bókin er lesin alltaf*. */
const PARTICLES = new Set(["eftir", "upp", "út", "niður", "fram", "inn", "burt", "frá", "yfir", "undir"]);
const SENT_ADV = new Set(["alltaf", "oft", "aldrei", "ekki", "oftast", "stundum", "sjaldan",
  "líka", "einnig", "bara", "yfirleitt", "venjulega"]);

/** Present -> past for every finite verb; null if any of them cannot go. */
function pastVerbs(lex, s, { toTense = "ÞT", fromTense = null } = {}) {
  const out = new Map();
  for (let j = 0; j < s.tok.length; j++) {
    const t = s.tok[j];
    if (t.c !== "sagnorð") continue;
    if (!FINITE.test(t.m || "")) {
      if (/^(GM|MM)-NH$/.test(t.m || "")) continue;      // an infinitive stays
      return null;
    }
    const e = confirmed(lex, t);
    if (!e) return null;
    /* The mood of a past form is often the same in both moods (*keypti*), so
       `háttur` is tolerated in a main clause; nothing else is. */
    if (!firm(t, t.k === "aðalsetning" ? ["háttur"] : [])) return null;
    if (["munu", "skulu"].includes(e.o)) return null;   // future and "shall": no past
    const x = FINITE.exec(t.m);
    if (fromTense && x[3] !== fromTense) return null;
    const m = t.m.replace(/-(NT|ÞT)-/, `-${toTense}-`);
    const f = formsOf(e, m);
    if (!f.length) return null;
    out.set(j, { e, from: t.m, to: m, forms: f });
  }
  return out.size ? out : null;
}

/** Settu í þátíð. Every finite verb goes to the past, nothing else moves. */
export function transformPast(lex, s) {
  if (!endsPlain(s) || hasParticiple(s) || saysWhen(lex, s, { habitual: false })) return null;
  const verbs = pastVerbs(lex, s, { fromTense: "NT" });
  if (!verbs) return null;
  const slots = s.tok.map((t, j) => (verbs.has(j) ? verbs.get(j).forms : [t.w]));
  const changes = [...verbs.entries()].map(([j, v]) => ({
    i: j, from: s.tok[j].w, to: v.forms[0], why: "þátíð",
  }));
  return {
    kind: "past", s,
    instruction: "Settu setninguna í **þátíð**.",
    answers: combinations(slots),
    changes,
    why: "Í þátíð breytast aðeins sagnirnar sem beygjast í persónu. Þær halda persónu, tölu og hætti; " +
      "allt annað í setningunni stendur óbreytt. " + verbLine(s, changes),
    marks: changes.map((c) => ({ m: verbs.get(c.i).to, word: wordKey(verbs.get(c.i).e.o, "so") })),
  };
}

const verbLine = (s, changes) =>
  changes.map((c) => `*${String(c.from).toLowerCase()}* → *${String(c.to).toLowerCase()}*`).join(", ") + ".";

/* Nouns whose plural no one uses in a sentence like this: mass nouns, weather
   and the abstract. */
const NO_PLURAL_CLASS = new Set(["substance", "weather", "abstract", "money", "time", "sky"]);
const PLURAL_PRONOUN = new Set(["ég", "þú", "hann", "hún"]);
/* Kinship words used as names (*Mamma les blaðið*): the plural is a
   different sentence, not the same one in the plural. */
const NAME_LIKE = new Set(["mamma", "pabbi", "amma", "afi"]);

/** Settu frumlagið í fleirtölu — and everything that agrees with it. */
export function transformPlural(lex, s) {
  if (!endsPlain(s) || !oneClause(s) || hasParticiple(s)) return null;
  const F = block(s, "frumlag");
  if (!F) return null;
  const subj = s.tok.slice(F.from, F.to + 1);
  /* The head: one noun, or one personal pronoun that has a plural. */
  const heads = subj.filter((t) => t.c === "nafnorð" ||
    (t.c === "fornafn" && t.x === "pfn"));
  if (heads.length !== 1) return null;
  const head = heads[0];
  const he = confirmed(lex, head);
  if (!he) return null;
  if (head.c === "fornafn" && !PLURAL_PRONOUN.has(he.o)) return null;
  if (head.c === "nafnorð") {
    if (he.np || NO_PLURAL_CLASS.has(he.s) || /^[A-ZÁÐÉÍÓÚÝÞÆÖ]/.test(he.o)) return null;
    if (NAME_LIKE.has(he.o)) return null;
  }
  /* *Ég sá vin minn* in the plural is *Við sáum vin okkar*: a possessive
     that belongs to the subject would have to change word, not form. */
  if (head.c === "fornafn" && s.tok.some((t, j) => (j < F.from || j > F.to) &&
      ["minn", "þinn"].includes(String(t.l)))) return null;
  /* Anything else in the sentence that points back at the subject would have
     to change too, and the parse does not say what points where. */
  if (s.tok.some((t, j) => (j < F.from || j > F.to) && t.c === "fornafn" && t.x === "pfn" &&
      ["hann", "hún", "það"].includes((lex.entryForToken(t) || {}).o))) return null;

  const change = new Map();
  for (let j = F.from; j <= F.to; j++) {
    const t = s.tok[j];
    if (!NOMINAL.has(t.c) || t.c === "töluorð") return null;
    const e = confirmed(lex, t);
    if (!e || !firm(t) || caseOf(t.m) !== "NF" || numOf(t.m) !== "ET") return null;
    const m = withNumber(t.m, "FT");
    const f = formsOf(e, m);
    if (!f.length) return null;
    change.set(j, { e, to: m, forms: f.map((x) => (j === 0 ? capFirst(x) : x)) });
  }
  const person = head.c === "nafnorð" ? "3P" : null;
  for (let j = 0; j < s.tok.length; j++) {
    const t = s.tok[j];
    if (j >= F.from && j <= F.to) continue;
    if (t.c === "sagnorð" && FINITE.test(t.m || "")) {
      const e = confirmed(lex, t);
      if (!e || !firm(t, ["háttur"])) return null;
      if (!/-ET$/.test(t.m)) return null;
      if (person && !t.m.includes(`-${person}-`)) return null;
      const m = t.m.replace(/-ET$/, "-FT");
      const f = formsOf(e, m);
      if (!f.length) return null;
      change.set(j, { e, to: m, forms: f });
    } else if (t.r === "sagnfylling") {
      if (!NOMINAL.has(t.c)) return null;
      const e = confirmed(lex, t);
      if (!e || !firm(t, ["tala"]) || caseOf(t.m) !== "NF") return null;
      if (t.c === "nafnorð" && (e.np || NO_PLURAL_CLASS.has(e.s))) return null;
      const m = withNumber(t.m, "FT");
      const f = formsOf(e, m);
      if (!f.length) return null;
      change.set(j, { e, to: m, forms: f });
    }
  }
  if (![...change.keys()].some((j) => s.tok[j].c === "sagnorð")) return null;
  const slots = s.tok.map((t, j) => (change.has(j) ? change.get(j).forms : [t.w]));
  const changes = [...change.entries()].map(([j, c]) => ({ i: j, from: s.tok[j].w, to: c.forms[0] }));
  const subjText = joinTokens(subj.map((t) => t.w));
  return {
    kind: "plural", s, focus: { from: F.from, to: F.to },
    instruction: `Settu frumlagið **${subjText}** í **fleirtölu**. Breyttu öllu sem þarf að breytast með því.`,
    answers: combinations(slots),
    changes,
    why: "Þegar frumlagið fer í fleirtölu fylgja öll orð sem laga sig að því: " +
      "fornöfn og lýsingarorð með nafnorðinu, sögnin (sem lagar sig að frumlaginu í persónu og tölu) " +
      "og sagnfylling með *vera* eða *verða*. " + verbLine(s, changes),
    marks: changes.map((c) => ({ m: change.get(c.i).to,
      word: wordKey(change.get(c.i).e.o, change.get(c.i).e.c) })),
  };
}

/** Settu í þolmynd. "Strákurinn borðaði kökuna" -> "Kakan var borðuð (af stráknum)". */
export function transformPassive(lex, s) {
  if (!endsPlain(s) || !oneClause(s) || hasParticiple(s)) return null;
  if (s.tok.some((t) => ["sagnfylling", "óbeint andlag"].includes(t.r))) return null;
  const verbs = s.tok.map((t, j) => (t.c === "sagnorð" ? j : -1)).filter((j) => j >= 0);
  if (verbs.length !== 1) return null;
  const vi = verbs[0], v = s.tok[vi];
  const x = FINITE.exec(v.m || "");
  if (!x || x[1] !== "GM" || x[2] !== "FH" || !firm(v, ["háttur"])) return null;
  const ve = confirmed(lex, v);
  if (!ve || NO_PASSIVE.has(ve.o)) return null;
  if (!v.g || v.g.length !== 1 || !["þf", "þgf"].includes(v.g[0])) return null;
  const objCase = v.g[0] === "þf" ? "ÞF" : "ÞGF";

  const F = block(s, "frumlag");
  const O = block(s, "andlag");
  if (!F || !O || F.from !== 0 || F.to !== vi - 1 || O.from !== vi + 1) return null;

  /* The subject becomes the agent after *af*, in the dative. */
  const agent = [];
  for (let j = F.from; j <= F.to; j++) {
    const t = s.tok[j];
    if (!NOMINAL.has(t.c) || t.c === "töluorð") return null;
    const e = confirmed(lex, t);
    if (!e || !firm(t, ["tala"]) || caseOf(t.m) !== "NF") return null;
    const f = formsOf(e, withCase(t.m, "ÞGF"));
    if (!f.length) return null;
    agent.push(f.map((y) => lowerFirst(y, e)));
  }
  /* The object: one noun with its modifiers, in the case the verb governs. */
  const objHeads = [];
  const object = [];
  for (let j = O.from; j <= O.to; j++) {
    const t = s.tok[j];
    if (!NOMINAL.has(t.c) || t.c === "töluorð") return null;
    const e = confirmed(lex, t);
    if (!e || !firm(t) || caseOf(t.m) !== objCase) return null;
    if (t.c === "nafnorð") objHeads.push({ t, e });
    if (t.c === "fornafn" && t.x === "pfn") return null;
    if (objCase === "ÞF") {
      /* Only the singular: the lexicon has the participle in NFET only. */
      if (numOf(t.m) !== "ET") return null;
      const f = formsOf(e, withCase(t.m, "NF"));
      if (!f.length) return null;
      object.push(f.map((y) => lowerFirst(y, e)));
    } else object.push([lowerFirst(t.w, e)]);
  }
  if (objHeads.length !== 1) return null;
  const head = objHeads[0].e;
  if (!GENDERS[head.c]) return null;

  /* A genitive right after the object belongs to it and goes with it:
     *Kennarinn safnaði verkefnum nemenda í möppu* → *Verkefnum nemenda var
     safnað …*. v6.11 left *nemenda* behind as if it were an adverbial and
     held up *Verkefnum var safnað nemenda í möppu* as the right answer. */
  let oEnd = O.to;
  while (s.tok[oEnd + 1] && NOMINAL.has(s.tok[oEnd + 1].c) && caseOf(s.tok[oEnd + 1].m || "") === "EF") {
    const t = s.tok[oEnd + 1];
    const e = confirmed(lex, t);
    if (!e || (t.c === "fornafn" && t.x === "pfn")) return null;
    object.push([lowerFirst(t.w, e)]);
    oEnd++;
  }
  const rest = s.tok.slice(oEnd + 1);
  if (rest.some((t) => t.r && t.r !== "")) return null;       // adverbials only
  /* What is left is adverbs and prepositional phrases. A noun phrase that
     is not inside one is something the parse did not place, and moving the
     object away from it could change what it belongs to. */
  for (let k = 0; k < rest.length; k++) {
    if (NOMINAL.has(rest[k].c) && !rest.slice(0, k).some((t) => t.c === "forsetning")) return null;
  }
  if (rest.some((t) => t.c === "sagnorð")) return null;
  if (rest.some((t) => String(t.w).toLowerCase() === "saman")) return null;   // "saman" is about the agents
  let restWords = rest.map((t) => t.w);
  let adv = [];
  if (restWords.length > 1 && SENT_ADV.has(String(restWords[0]).toLowerCase())) {
    adv = [restWords[0]];
    restWords = restWords.slice(1);
  }

  const vera = lex.lookup("vera", "so");
  const veraForm = formsOf(vera, `GM-FH-${x[3]}-3P-ET`);
  const pm = `LHÞT-SB-${objCase === "ÞF" ? head.c.toUpperCase() : "HK"}-NFET`;
  const part = formsOf(ve, pm);
  if (!veraForm.length || !part.length) return null;

  const A = adv.map((w) => [w]);
  const particle = rest.length > 1 && rest[adv.length] && rest[adv.length].c === "atviksorð" &&
    PARTICLES.has(String(rest[adv.length].w).toLowerCase());
  const R = restWords.map((w) => [w]);
  const variants = [];
  /* With the adverb before the participle (the natural place) and, if the
     sentence had one, after it as it stood; with and without the agent, and
     the agent either straight after the participle or at the end. */
  for (const advFirst of adv.length ? [true, false] : [true]) {
    const head = advFirst ? [...object, veraForm, ...A, part] : [...object, veraForm, part, ...A];
    variants.push([...head, ...R]);
    /* A particle belongs to the verb (*skilin eftir*), so the agent comes
       after it, never between. */
    const lead = particle ? R.slice(0, 1) : [];
    const tail = particle ? R.slice(1) : R;
    variants.push([...head, ...lead, ["af"], ...agent, ...tail]);
    if (R.length > 1) variants.push([...head, ...R.slice(0, -1), ["af"], ...agent, ["."]]);
    /* … and before any prepositional phrase in what follows: *Verkefnum var
       safnað í möppu af kennaranum á föstudaginn* is as good as the rest. */
    const restToks = rest.slice(adv.length);
    restToks.forEach((t, k) => {
      if (t.c !== "forsetning" || k < lead.length) return;
      variants.push([...head, ...R.slice(0, k), ["af"], ...agent, ...R.slice(k)]);
    });
  }
  const answers = [...new Set(variants.flatMap((v) => combinations(v)))];
  /* The model is shown WITHOUT the agent (v6.10): *Glugginn er opnaður* is
     the natural passive; *… af mér* is accepted but not held up as the model. */
  const shown = capFirst(joinTokens([...object.map((o) => o[0]), veraForm[0], ...adv, part[0],
    ...restWords]));
  const dat = objCase === "ÞGF";
  /* The same passive WITH its agent, at the end — what `transformActive`
     shows and asks to turn back (*Bíllinn er keyrður heim af pabba*; the
     agent before *heim* or *upphátt* reads stiffly). Only where nothing else
     could move on the way back: no sentence adverb (*Amma bakaði ekki
     kökuna* / *… kökuna ekki*) and no particle (*skildi töskuna eftir* /
     *skildi eftir töskuna*). */
  const withAgent = adv.length || particle ? null
    : capFirst(joinTokens([...object.map((o) => o[0]), veraForm[0], part[0],
      ...restWords.slice(0, -1), "af", ...agent.map((a) => a[0]), "."]));
  return {
    kind: "passive", s,
    instruction: "Settu setninguna í **þolmynd**: láttu andlagið byrja setninguna.",
    answers, model: shown, withAgent, objCase,
    /* For the notes of the way back: the words the passive is made of. */
    pieces: { subject: object.map((o) => o[0]), vera: veraForm[0], participle: part[0],
      agent: agent.map((a) => a[0]) },
    why: dat
      ? `Sögnin *${ve.o}* stýrir þágufalli, og andlag í þágufalli *heldur fallinu* í þolmynd: ` +
        `*${object.map((o) => o[0]).join(" ")}*. Þolmyndin er mynduð með *vera* og lýsingarhætti þátíðar, ` +
        `sem stendur þá í hvorugkyni eintölu: *${veraForm[0]} ${part[0]}*. Gerandinn má fylgja með *af* + þágufalli, en þarf þess ekki.`
      : `Í þolmynd verður andlagið að frumlagi og fer í nefnifall: *${object.map((o) => o[0]).join(" ")}*. ` +
        `Sögnin verður *vera* + lýsingarháttur þátíðar, og hann lagar sig að nýja frumlaginu í kyni og tölu ` +
        `(${GENDERS[head.c]}, eintala): *${veraForm[0]} ${part[0]}*. Gerandinn má fylgja með *af* + þágufalli, en þarf þess ekki.`,
    marks: [{ m: pm, word: wordKey(ve.o, "so") }],
  };
}

/** Byrjaðu á *Í gær* / *Á morgun*: the verb stays second, the subject moves
    behind it, and the tense follows the time. */
export function transformOpener(lex, s, opener = "Í gær") {
  if (!endsPlain(s) || !oneClause(s) || hasParticiple(s) || saysWhen(lex, s)) return null;
  const F = block(s, "frumlag");
  if (!F || F.from !== 0) return null;
  const vi = F.to + 1;
  const v = s.tok[vi];
  if (!v || v.c !== "sagnorð" || !FINITE.test(v.m || "")) return null;
  /* *Í gær var húsið stórt*, *Í gær var þetta saga bæjanna*: states and
     demonstrative subjects make sentences nobody would say with a time. */
  if (OPENER_SKIP_VERB.has(v.l)) return null;
  if (s.tok.slice(F.from, F.to + 1).some((t) => ["þessi", "sá", "það"].includes(String(t.l)) && t.x !== "pfn"
      || ["þetta", "það"].includes(String(t.w).toLowerCase()))) return null;
  for (let j = F.from; j <= F.to; j++) {
    if (!NOMINAL.has(s.tok[j].c) && !(s.tok[j].c === "fornafn")) return null;
  }
  const tense = opener === "Í gær" ? "ÞT" : "NT";
  const verbs = pastVerbs(lex, s, { toTense: tense });
  if (!verbs || !verbs.has(vi)) return null;
  /* A present tense that is already about the future, or a past already in
     the past, is still a fair question: the word order is what is asked. */
  const subj = [];
  for (let j = F.from; j <= F.to; j++) {
    const t = s.tok[j];
    const e = lex.entryForToken(t);
    subj.push([j === 0 ? lowerFirst(t.w, e) : t.w]);
  }
  const after = s.tok.slice(vi + 1).map((t, k) => {
    const j = vi + 1 + k;
    return verbs.has(j) ? verbs.get(j).forms : [t.w];
  });
  const slots = [[opener], verbs.get(vi).forms, ...subj, ...after];
  const changes = [...verbs.entries()]
    .filter(([j, vv]) => vv.from !== vv.to)
    .map(([j, vv]) => ({ i: j, from: s.tok[j].w, to: vv.forms[0] }));
  const when = tense === "ÞT" ? "þátíð" : "nútíð";
  return {
    kind: "opener", s, opener,
    instruction: `Byrjaðu setninguna á **${opener} …**`,
    answers: combinations(slots),
    why: "Í íslenskri fullyrðingarsetningu er sögnin sem beygist í öðru sæti. " +
      `Þegar *${opener.toLowerCase()}* er komið fremst fer frumlagið aftur fyrir sögnina: ` +
      `*${opener} ${verbs.get(vi).forms[0]} ${subj.map((x) => x[0]).join(" ")}*.` +
      (changes.length ? ` Sögnin fer líka í ${when}: ${verbLine(s, changes)}` : ""),
    marks: [...verbs.values()].map((vv) => ({ m: vv.to, word: wordKey(vv.e.o, "so") })),
  };
}

const OPENER_SKIP_VERB = new Set(["vera", "heita", "standa", "liggja", "kosta", "búa", "eiga"]);

/* ----------------------------------------- v6.13: four more kinds (item 29)

   Each of these is built from a sentence of the bank, which Greynir parsed
   and the build checked; what changes is read out of BÍN. Where the answer
   cannot be pinned down — another word order would be as right, a pronoun
   could point two ways, a meaning would shift — the sentence is skipped.
   Each task carries `checks`: the mistakes a pupil is likely to make with
   it, each with the sentence that explains it (core/answer.js
   `transformNote` reads them). */

/** A small, stable number from the text: which speaker and which tense a
    direct-speech item uses. Not a random draw, so that the same sentence
    always makes the same question — a reader can check it once. */
function stableHash(text) {
  let h = 0;
  for (const ch of String(text)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h;
}

const lower = (w) => String(w || "").toLowerCase();
const hasConjunction = (s) => s.tok.some((t) => t.c === "samtenging");
/** Main clauses only — an infinitive (*að fara*) is part of one. */
const mainOnly = (s) => s.tok.every((t) => isPunct(t) || t.k === "aðalsetning" || t.k === "nafnháttarsetning");

/** The contiguous run of subject tokens that starts at `from` and ends
    before `to`, or null. */
function subjectRun(lex, s, from, to = s.tok.length) {
  let j = from;
  while (j < to && s.tok[j].r === "frumlag") j++;
  if (j === from) return null;
  /* A genitive right after the subject belongs to it (*nöfn allra
     barnanna*); the parse leaves it without a role. */
  while (j < to && NOMINAL.has(s.tok[j].c) && caseOf(s.tok[j].m || "") === "EF") j++;
  for (let k = from; k < j; k++) {
    const t = s.tok[k];
    if (!NOMINAL.has(t.c)) return null;
    if (!confirmedWord(lex, t)) return null;
  }
  return { from, to: j - 1 };
}
/** `confirmed`, and for a personal pronoun the same test without the
    gender: the parse marks *hann* "KK-NFET", BÍN's paradigm of *hann* has
    it as "NFET". Only for words that stand as they stood. */
function confirmedWord(lex, t) {
  if (confirmed(lex, t)) return true;
  if (!(t.c === "fornafn" && t.x === "pfn") || !t.m || t.rj) return false;
  const e = lex.entryForToken(t);
  const m = t.m.replace(/^(KK|KVK|HK)-/, "");
  return !!e && formsOf(e, m).some((f) => normalise(f) === normalise(t.w));
}

const isFinite = (t) => !!t && t.c === "sagnorð" && FINITE.test(t.m || "");
const pfnLemma = (lex, t) => (t && t.c === "fornafn" && t.x === "pfn" ? (lex.entryForToken(t) || {}).o || t.l : null);

/* ---- germynd: the passive, with its agent, back to the active ---------- */

/** Settu í germynd. *Kakan var bökuð af ömmu* → *Amma bakaði kökuna*.
    The passive is the one transformPassive makes from a bank sentence, and
    the answer is that bank sentence: nothing here is guessed. */
export function transformActive(lex, s) {
  const p = transformPassive(lex, s);
  if (!p || !p.withAgent) return null;
  const F = block(s, "frumlag");
  const subj = s.tok.slice(F.from, F.to + 1);
  /* *af þeim* is *þeir*, *þær* or *þau*, and *af því* would make *það* a
     subject: the way back is not one sentence. */
  /* A pronoun as the agent is how no one speaks (*Glugginn er opnaður af
     mér*), and *af þeim* would be *þeir*, *þær* or *þau* on the way back.
     A time adverbial would leave the agent after it (*… í dag af ömmu*). */
  if (subj.some((t) => t.c === "fornafn" && t.x === "pfn")) return null;
  if (saysWhen(lex, s)) return null;
  const vi = F.to + 1, v = s.tok[vi];
  const ve = confirmed(lex, v);
  if (!ve) return null;
  /* Every form BÍN gives for the verb's cell is right (*mundi/myndi*); the
     rest of the sentence stands as it stood. */
  const slots = s.tok.map((t, j) => (j === vi ? formsOf(ve, v.m) : [t.w]));
  const answers = combinations(slots);
  if (!answers.length) return null;
  const O = block(s, "andlag");
  const objWords = s.tok.slice(O.from, O.to + 1).map((t) => t.w);
  const subjText = lower(joinTokens(subj.map((t) => t.w)));
  const past = /-ÞT-/.test(v.m);
  const { pieces } = p;
  const dat = p.objCase === "ÞGF";
  const checks = [
    { has: [pieces.vera, pieces.participle],
      note: `Í germynd er hvorki *${pieces.vera}* né lýsingarháttur: sögnin sjálf beygist — *${lower(v.w)}*.` },
    { has: ["af", pieces.agent[0]],
      note: `Gerandinn verður frumlag og stendur fremst í nefnifalli: *${subjText}*. Orðið *af* fellur burt.` },
  ];
  if (!dat && normalise(pieces.subject.join(" ")) !== normalise(objWords.join(" ")))
    checks.push({ has: pieces.subject, lacks: objWords,
      note: `Frumlag þolmyndarinnar verður andlag og fer í þolfall: *${objWords.join(" ")}*, ekki *${pieces.subject.join(" ")}*.` });
  return {
    kind: "active", s, from: p.withAgent, model: s.t,
    instruction: "Settu setninguna í **germynd**: gerandinn (sá sem kemur á eftir *af*) verður frumlag og byrjar setninguna.",
    answers,
    why: `Í germynd er gerandinn frumlag og stendur í nefnifalli: *${subjText}*. ` +
      `Sögnin fær tíðina frá *${pieces.vera}* (${past ? "þátíð" : "nútíð"}) og lagar sig að nýja frumlaginu: *${lower(v.w)}*. ` +
      (dat
        ? `Sögnin *${ve.o}* stýrir þágufalli, svo það sem var frumlag í þolmynd heldur fallinu sem andlag: *${objWords.join(" ")}*.`
        : `Það sem var frumlag í þolmynd verður andlag og fer í þolfall: *${objWords.join(" ")}*.`),
    checks,
    marks: [{ m: v.m, word: wordKey(ve.o, "so") }],
  };
}

/* ---- spurning: a statement to a yes/no question ------------------------ */

/** Breyttu í já/nei-spurningu: the finite verb goes first, the subject
    straight after it, and nothing else moves. Only a sentence that begins
    with its subject — a sentence that begins with something else would
    leave that something nowhere certain to go. */
export function transformQuestion(lex, s) {
  if (!endsPlain(s) || hasConjunction(s) || !mainOnly(s)) return null;
  const F = subjectRun(lex, s, 0);
  if (!F) return null;
  const vi = F.to + 1, v = s.tok[vi];
  if (!isFinite(v) || !confirmed(lex, v)) return null;
  const subj = s.tok.slice(0, vi);
  /* *Það er kalt* → *Er kalt?*: an empty *það* drops out of a question, and
     the parse does not say which *það* is empty. *Ég*: a question to
     oneself (*Fer ég heim?*) is not what anyone asks. */
  const l0 = pfnLemma(lex, subj[0]);
  if (subj.length === 1 && (l0 === "það" || l0 === "ég")) return null;
  /* *Mátt þú koma?* is how no one asks: it is *Máttu koma?*, and BÍN does
     not list the verb with *-tu* grown onto it. *Gat sjálfur kennarinn …?*
     wants *kennarinn sjálfur*. */
  if (subj.some((t) => ["þú", "sjálfur"].includes(pfnLemma(lex, t) || lower(t.l)))) return null;
  if (subj.some((t) => ["þetta", "það"].includes(lower(t.w)))) return null;
  const subjWords = subj.map((t, j) => (j === 0 ? lowerFirst(t.w, lex.entryForToken(t)) : t.w));
  const rest = s.tok.slice(vi + 1, -1).map((t) => t.w);
  const answer = capFirst(joinTokens([v.w, ...subjWords, ...rest, "?"]));
  const verb = lower(v.w), subjText = subjWords.join(" ");
  return {
    kind: "question", s, endMark: "?",
    instruction: "Breyttu fullyrðingunni í **já/nei-spurningu**.",
    answers: [answer],
    why: "Í já/nei-spurningu skipta sögnin sem beygist og frumlagið um sæti: sögnin fer **fremst** og " +
      `frumlagið kemur strax á eftir henni — *${capFirst(verb)} ${subjText} …?* ` +
      "Annað í setningunni stendur óbreytt, og spurningin endar á spurningarmerki.",
    checks: [
      { starts: [subjWords[0]],
        note: `Í já/nei-spurningu stendur sögnin **fremst**, á undan frumlaginu: *${capFirst(verb)} ${subjText} …?*` },
      { starts: ["hvort"],
        note: "*Hvort* byrjar óbeina spurningu (*Ég veit ekki hvort …*). Bein já/nei-spurning byrjar á sögninni." },
      { starts: [verb], notStarts: [verb, ...subjWords],
        note: `Frumlagið kemur strax á eftir sögninni: *${capFirst(verb)} ${subjText} …?*` },
    ],
  };
}

/* ---- tenging: two sentences joined with a given conjunction ------------ */

/* The joins asked for. Subordinating: an adverbial clause whose verb stays
   in the indicative, so each half is a sentence of its own. Left out on
   purpose: *að*, *sem*, *hvort* (the clause is part of the other one and
   cannot stand alone), *þótt*, *svo að*, *til þess að* and mostly *áður en*
   with the subjunctive (the verb changes mood when the clause stands
   alone), *eins og* (*Ég lofaði.* is not a sentence). */
const JOIN_SUB = new Set(["þegar", "ef", "áður en", "þangað til", "fyrr en", "eftir að",
  "af því að", "um leið og", "meðan", "á meðan"]);
const JOIN_CO = new Set(["og", "en", "eða"]);

/** A clause that stands as a sentence: subject first (or the empty *það*
    of *Það rigndi*), then the finite verb in the indicative. The subject
    run and the verb, or null. */
function plainClause(lex, s, from, to) {
  let F = subjectRun(lex, s, from, to + 1);
  if (!F && pfnLemma(lex, s.tok[from]) === "það") F = { from, to: from };
  if (!F) return null;
  const vi = F.to + 1;
  if (vi > to || !isFinite(s.tok[vi])) return null;
  return { F, vi };
}
/* Verbs that do not make a sentence without what they are about: *Ég man.*,
   *Ég veit.* The parse gives *muna* no government, so the list says it. */
const NEEDS_COMPLEMENT = new Set(["muna", "vita", "halda", "segja", "telja", "vona", "finnast",
  "gleyma", "lofa", "ákveða", "spyrja", "skilja", "þekkja", "sjá", "heyra", "finna", "langa",
  "vilja", "ætla", "þurfa", "mega", "geta", "kunna", "eiga", "hafa", "verða", "vera", "fá"]);
/** Every finite verb in [from, to] is in the indicative, and a verb that
    needs an object or a complement is not the last word (*Ég man.* is not
    a sentence).
    In a main clause the parse may leave the mood open — a past form is
    often the same in both moods (*ætlaði*) and a main clause says what is
    — but in a subordinate clause the mood must be certain: on its own the
    clause would be read in the indicative, and a subjunctive there
    (*þótt hann væri*, *ef ég keypti*) means something else. */
function indicative(lex, s, from, to) {
  for (let j = from; j <= to; j++) {
    const t = s.tok[j];
    if (t.c !== "sagnorð") continue;
    if (!FINITE.test(t.m || "")) continue;
    const x = FINITE.exec(t.m);
    const e = confirmed(lex, t);
    if (!e || x[2] !== "FH" || !firm(t, t.k === "aðalsetning" ? ["háttur"] : [])) return false;
    /* Something must follow such a verb in its clause: *Ég man.*, *… en
       ég hélt.* are not sentences. */
    if (((t.g && t.g.length) || NEEDS_COMPLEMENT.has(e.o)) && j === to) return false;
  }
  return true;
}

/** Tengdu saman með *þegar* …: the bank's own sentence, split in two. */
export function transformJoin(lex, s) {
  if (!endsPlain(s)) return null;
  const n = s.tok.length - 1;                       // the tokens before the full stop
  const conj = s.tok.map((t, j) => (t.c === "samtenging" ? j : -1)).filter((j) => j >= 0);
  if (conj.length !== 1) return null;
  const c = conj[0];
  const sub = s.tok.slice(0, n).map((t, j) => (t.k === "aukasetning" ? j : -1)).filter((j) => j >= 0);
  let A, B, cFrom, first;            // A main clause, B the joined clause: [from, to]
  if (s.tok[c].k === "aðalsetning") {
    if (sub.length || !JOIN_CO.has(lower(s.tok[c].l))) return null;
    cFrom = c; A = [0, c - 1]; B = [c + 1, n - 1]; first = "main";
  } else {
    const from = sub[0], to = sub[sub.length - 1];
    if (to - from + 1 !== sub.length) return null;           // one unbroken clause
    for (let j = from; j < c; j++) if (isPunct(s.tok[j]) || s.tok[j].r) return null;
    cFrom = from;
    B = [c + 1, to];
    if (from === 0) { A = [to + 1, n - 1]; first = "sub"; }
    else if (to === n - 1) { A = [0, from - 1]; first = "main"; }
    else return null;
  }
  const conjText = lower(joinTokens(s.tok.slice(cFrom, c + 1).map((t) => t.w)));
  if (!(JOIN_SUB.has(conjText) || (first === "main" && cFrom === c && JOIN_CO.has(conjText)))) return null;
  if (A[1] < A[0] || B[1] < B[0]) return null;
  /* *Ég man vel eftir deginum þegar …*, *frá því þegar …*: the clause
     belongs to the word before it, not to the sentence. A comparative
     before *en* (*stærri en …*) is a comparison, not two sentences. */
  if (first === "main") {
    const before = s.tok[cFrom - 1];
    if (before && (before.c === "fornafn" || (before.c === "nafnorð" && saysWhen(lex, { tok: [before] })))) return null;
  }
  if (s.tok.slice(A[0], A[1] + 1).some((t) => /MST/.test(t.m || ""))) return null;

  const b = plainClause(lex, s, B[0], B[1]);
  if (!b || !indicative(lex, s, B[0], B[1])) return null;
  if (!indicative(lex, s, A[0], A[1])) return null;
  const word = (t, j, at) => (j === at ? lowerFirst(t.w, lex.entryForToken(t)) : t.w);
  const wordsOf = (from, to) => s.tok.slice(from, to + 1).map((t, j) => word(t, from + j, from));
  const bWords = wordsOf(B[0], B[1]);
  const bSentence = capFirst(joinTokens([...bWords, "."]));
  let aSentence, aSubj, aVerb, aInv;
  if (first === "main") {
    const a = plainClause(lex, s, A[0], A[1]);
    if (!a) return null;
    aSentence = capFirst(joinTokens([...wordsOf(A[0], A[1]), "."]));
    aSubj = wordsOf(a.F.from, a.F.to);
    aVerb = lower(s.tok[a.vi].w);
  } else {
    /* *… var maturinn tilbúinn*: the verb, then the subject — on its own
       the clause is *Maturinn var tilbúinn.* */
    const vi = A[0];
    if (!isFinite(s.tok[vi])) return null;
    const F = subjectRun(lex, s, vi + 1, A[1] + 1);
    if (!F) return null;
    aSubj = s.tok.slice(F.from, F.to + 1).map((t, k) => (k === 0 ? lowerFirst(t.w, lex.entryForToken(t)) : t.w));
    aVerb = lower(s.tok[vi].w);
    aSentence = capFirst(joinTokens([...aSubj, aVerb, ...s.tok.slice(F.to + 1, A[1] + 1).map((t) => t.w), "."]));
    aInv = true;
  }
  const answers = [s.t];
  const bSubj = wordsOf(b.F.from, b.F.to);
  const bVerb = lower(s.tok[b.vi].w);
  /* *… en ég gleymdi því* or *… en gleymdi því*: with the same subject in
     both, an *og*, *en* or *eða* may leave the second one out. */
  if (JOIN_CO.has(conjText) && normalise(aSubj.join(" ")) === normalise(bSubj.join(" ")))
    answers.push(capFirst(joinTokens([...wordsOf(A[0], A[1]), conjText,
      ...s.tok.slice(b.vi, B[1] + 1).map((t) => t.w), "."])));
  const coord = JOIN_CO.has(conjText);
  const Conj = capFirst(conjText);
  /* The order first: halves the wrong way round are the plainer mistake. */
  const checks = [aInv
    ? { notStarts: [conjText], note: `Byrjaðu á *${Conj}* og fyrri setningunni; aðalsetningin kemur á eftir.` }
    : { starts: [conjText], note: `Byrjaðu á fyrri setningunni og settu *${conjText}* á milli setninganna.` }];
  if (aInv) checks.push({ has: [...aSubj, aVerb],
    note: `Þegar aukasetningin stendur fremst er hún fyrsti liðurinn, og sögnin í aðalsetningunni kemur strax á eftir henni — á undan frumlaginu: *${aVerb} ${aSubj.join(" ")}*.` });
  if (!coord && b.F.from !== b.vi) checks.push({ has: [conjText, bVerb, ...bSubj],
    note: `Í aukasetningu á eftir *${conjText}* stendur frumlagið á undan sögninni, eins og í venjulegri fullyrðingu: *${conjText} ${bSubj.join(" ")} ${bVerb}*.` });
  return {
    kind: "join", s, conj: conjText,
    lines: aInv ? [bSentence, aSentence] : [aSentence, bSentence],
    from: aInv ? `${bSentence} ${aSentence}` : `${aSentence} ${bSentence}`,
    instruction: aInv
      ? `Tengdu setningarnar saman með **${conjText}**. Byrjaðu á *${Conj}* og fyrri setningunni.`
      : `Tengdu setningarnar saman með **${conjText}**: fyrri setningin fyrst, svo *${conjText}* og seinni setningin.`,
    answers, model: s.t,
    why: coord
      ? `*${capFirst(conjText)}* er aðaltenging: hún tengir tvær aðalsetningar og breytir engu í orðaröð þeirra.` +
        (answers.length > 1 ? " Þegar frumlagið er það sama í báðum má sleppa því í seinni setningunni." : "")
      : aInv
        ? `*${Conj}* er aukatenging. Aukasetningin *${conjText} ${bWords.join(" ")}* er einn liður. Standi hún fremst ` +
          `kemur sögnin í aðalsetningunni strax á eftir henni, á undan frumlaginu: *${aVerb} ${aSubj.join(" ")}*. ` +
          `Inni í aukasetningunni stendur frumlagið á undan sögninni: *${conjText} ${bSubj.join(" ")} ${bVerb}*.`
        : `*${Conj}* er aukatenging. Á eftir henni er orðaröðin sú sama og í venjulegri fullyrðingu, frumlagið fyrst og svo sögnin: ` +
          `*${conjText} ${bSubj.join(" ")} ${bVerb}*. Aðalsetningin stendur óbreytt.`,
    checks,
  };
}

/* ---- óbein ræða: direct to indirect speech ----------------------------- */

/* Words that point at the speaker, the listener, here or now. Turned into
   indirect speech they change to something the sentence does not settle
   (*hér* → *þar*? *þetta* → *það*?), so a sentence with one is left out.
   *Ég* as the subject is the one that is changed: to *hann* or *hún*. */
const SPEAKER_WORDS = new Set(["ég", "þú", "við", "þið", "minn", "þinn", "okkar", "ykkar", "vor"]);
const DEIXIS = new Set(["hér", "hérna", "hingað", "héðan", "þessi", "þetta"]);
const PERSON_3 = new Set(["hann", "hún", "það", "sig", "sinn"]);
const GENDER_OF = (m) => { const x = /(?:^|-)(KK|KVK|HK)-/.exec(m || ""); return x ? x[1] : null; };

/** Settu í óbeina ræðu. *Hann sagði: „Ég er þreyttur.“* → *Hann sagði að
    hann væri þreyttur.* The quoted sentence is a bank sentence in the
    present tense; its finite verbs go to the subjunctive — of the past
    after *sagði*, of the present after *segir* — and *ég* becomes the
    speaker. */
export function transformIndirect(lex, s, opts = {}) {
  /* `opts.frame` ("past" | "present") fixes the tense of *segja*; without it
     the sentence's own hash chooses, as Umritun has it. `opts.quote: "past"`
     asks for a quote in the PAST tense instead (item 28): see below. */
  const quotePast = opts.quote === "past";
  if (!endsPlain(s) || hasConjunction(s) || !mainOnly(s) || saysWhen(lex, s)) return null;
  if (s.tok.some((t) => DEIXIS.has(lower(t.l)) || DEIXIS.has(lower(t.w)))) return null;
  const F = subjectRun(lex, s, 0);
  if (!F) return null;
  const subj = s.tok.slice(F.from, F.to + 1);
  const eg = subj.length === 1 && pfnLemma(lex, subj[0]) === "ég" && subj[0].m === "NFET";
  const genders = new Set();
  const others = new Set();          // the genders of *hann* and *hún* in the quote
  for (let j = 0; j < s.tok.length; j++) {
    const t = s.tok[j];
    if (isPunct(t)) continue;
    if (!t.c || t.rj) return null;                     // a word the parse left open
    const l = t.c === "fornafn" ? (lex.entryForToken(t) || {}).o || t.l : t.l;
    if (!(eg && j === 0) && (SPEAKER_WORDS.has(lower(l)) || SPEAKER_WORDS.has(lower(t.l)))) return null;
    /* With *ég* turned into *hann*, another *hann* would leave the reader
       guessing who is who. */
    if (eg && j > 0 && t.c === "fornafn" && PERSON_3.has(lower(l))) return null;
    if (t.c === "fornafn" && t.x === "pfn" && lower(l) === "hann") others.add("KK");
    if (t.c === "fornafn" && t.x === "pfn" && lower(l) === "hún") others.add("KVK");
    if (eg && j > 0 && caseOf(t.m) === "NF") {
      /* What agrees with *ég* says whether the speaker is a man or a woman
         (*Ég er þreyttur*); a noun (*Ég er kennari*) does not, safely. */
      if (t.c === "nafnorð") return null;
      const g = GENDER_OF(t.m);
      if (g) genders.add(g);
    }
  }
  if (genders.has("HK") || genders.size > 1) return null;
  /* *Hann sagði: „Hann er sterkastur.“* leaves the reader guessing who is
     who: the speaker is of the other gender than a *hann* or *hún* in the
     quote, and a quote with both is left out. */
  if (others.size > 1) return null;
  const h = stableHash(s.t);
  const gender = genders.size ? [...genders][0]
    : others.size ? (others.has("KK") ? "KVK" : "KK")
      : (h % 2 ? "KVK" : "KK");
  const pastFrame = opts.frame ? opts.frame === "past"
    : h % 3 !== 0;                         // two in three after *sagði*, one after *segir*
  const speaker = lex.lookup(gender === "KK" ? "hann" : "hún", "pfn");
  const segja = lex.lookup("segja", "so");
  const sp = formsOf(speaker, "NFET")[0];
  const say = formsOf(segja, `GM-FH-${pastFrame ? "ÞT" : "NT"}-3P-ET`)[0];
  if (!sp || !say) return null;

  const slots = [];
  const changes = [];
  const checks = [];
  let finite = 0;
  /* A quote in the past tense (item 28). What was said in the past is over
     when it is reported, so the verb becomes *hafa* in the subjunctive and
     the supine: *„Ég fór heim.“* → *að hún hefði farið heim* (after *segir*:
     *hafi farið*). One finite verb only, and nothing after it that would
     have to stand between *hefði* and the supine: a sentence adverb (*fór
     ekki* → *hefði ekki farið*) or a floating *allir*. A sentence that has a
     supine already (*hafði lesið*) is left out. */
  const hafa = quotePast ? lex.lookup("hafa", "so") : null;
  if (quotePast && (!hafa || s.tok.some((t) => /SAGNB/.test(t.m || "")))) return null;
  for (let j = 0; j < s.tok.length - 1; j++) {
    const t = s.tok[j];
    if (eg && j === 0) { slots.push([sp]); continue; }
    if (quotePast && t.c === "sagnorð" && FINITE.test(t.m || "")) {
      const x = FINITE.exec(t.m);
      const e = confirmed(lex, t);
      /* The mood of a past form is often the same in both moods (*keypti*);
         in a main clause that stands alone it is the indicative. */
      if (!e || finite || x[3] !== "ÞT" || x[2] !== "FH" || !firm(t, ["háttur"])) return null;
      if (["skulu", "munu", "hafa"].includes(e.o)) return null;
      let p = x[4];
      if (p === "1P") { if (!eg || x[5] !== "ET") return null; p = "3P"; }
      if (p === "2P") return null;
      const next = s.tok[j + 1];
      const follows = !next || isPunct(next) || ["nafnorð", "lýsingarorð", "töluorð", "greinir",
        "forsetning", "nafnháttarmerki"].includes(next.c) || (next.c === "fornafn" && next.x === "pfn");
      if (!follows) return null;
      const supine = formsOf(e, `${x[1]}-SAGNB`);
      const cell = (tense) => `GM-VH-${tense}-${p}-${x[5]}`;
      const aux = formsOf(hafa, cell(pastFrame ? "ÞT" : "NT"));
      const otherAux = formsOf(hafa, cell(pastFrame ? "NT" : "ÞT"));
      const plain = [...formsOf(e, `${x[1]}-VH-ÞT-${p}-${x[5]}`), ...formsOf(e, `${x[1]}-FH-ÞT-${p}-${x[5]}`)];
      if (!supine.length || !aux.length || !otherAux.length) return null;
      slots.push(aux, supine);
      finite++;
      changes.push({ i: j, from: lower(t.w), to: `${aux[0]} ${supine[0]}`, m: cell(pastFrame ? "ÞT" : "NT"), e: hafa });
      checks.push({ hasAny: [lower(t.w), ...plain].filter((w) => !supine.includes(w) && !aux.includes(w)), lacks: supine,
        note: `Það sem sagt var í þátíð er liðið þegar sagt er frá því. Þá er notuð sögnin *hafa* í viðtengingarhætti og sagnbót: *${aux[0]} ${supine[0]}*, ekki *${lower(t.w)}*.` });
      const hafaFh = [...formsOf(hafa, `GM-FH-ÞT-${p}-${x[5]}`), ...formsOf(hafa, `GM-FH-NT-${p}-${x[5]}`)];
      checks.push({ hasAny: hafaFh.filter((w) => !aux.includes(w)), lacks: aux,
        note: `Í óbeinni ræðu fer hjálparsögnin í **viðtengingarhátt**: *${aux[0]} ${supine[0]}*.` });
      checks.push({ hasAny: otherAux.filter((w) => !aux.includes(w)), lacks: aux,
        note: pastFrame
          ? `Á eftir *${say}* (þátíð) fer hjálparsögnin í viðtengingarhátt **þátíðar**: *${aux[0]}*, ekki *${otherAux[0]}*.`
          : `Á eftir *${say}* (nútíð) fer hjálparsögnin í viðtengingarhátt **nútíðar**: *${aux[0]}*, ekki *${otherAux[0]}*.` });
      continue;
    }
    if (t.c === "sagnorð" && FINITE.test(t.m || "")) {
      const x = FINITE.exec(t.m);
      const e = confirmed(lex, t);
      if (!e || x[2] !== "FH" || x[3] !== "NT" || !firm(t, ["háttur"])) return null;
      if (["skulu", "munu"].includes(e.o)) return null;   // *skal* is a promise; *mun* already looks ahead
      let p = x[4];
      if (p === "1P") { if (!eg || x[5] !== "ET") return null; p = "3P"; }
      if (p === "2P") return null;
      const cell = (tense) => `${x[1]}-VH-${tense}-${p}-${x[5]}`;
      const want = formsOf(e, cell(pastFrame ? "ÞT" : "NT"));
      const other = formsOf(e, cell(pastFrame ? "NT" : "ÞT"));
      if (!want.length || !other.length) return null;
      slots.push(want);
      finite++;
      changes.push({ i: j, from: lower(t.w), to: want[0], m: cell(pastFrame ? "ÞT" : "NT"), e });
      const fh = formsOf(e, `${x[1]}-FH-NT-${p}-${x[5]}`);
      checks.push({ hasAny: [lower(t.w), ...fh].filter((w) => !want.includes(w)), lacks: want,
        note: `Í óbeinni ræðu fer sögnin í **viðtengingarhátt**: *${want[0]}*, ekki *${lower(t.w)}*.` });
      checks.push({ hasAny: other.filter((w) => !want.includes(w)), lacks: want,
        note: pastFrame
          ? `Á eftir *${say}* (þátíð) fer sögnin í viðtengingarhátt **þátíðar**: *${want[0]}*, ekki *${other[0]}*.`
          : `Á eftir *${say}* (nútíð) fer sögnin í viðtengingarhátt **nútíðar**: *${want[0]}*, ekki *${other[0]}*.` });
      continue;
    }
    slots.push([j === 0 ? lowerFirst(t.w, lex.entryForToken(t)) : t.w]);
  }
  if (!finite) return null;
  if (eg) checks.unshift({ hasAny: ["ég"],
    note: `Í óbeinni ræðu er sagt frá því sem ${sp} ${say}, svo *ég* verður *${sp}*.` });
  const Sp = capFirst(sp);
  const withAd = combinations([[Sp], [say], ["að"], ...slots, ["."]]);
  const without = combinations([[Sp], [say], ...slots, ["."]]);
  const tenseWord = pastFrame ? "þátíðar, af því að *" + say + "* er í þátíð" : "nútíðar, af því að *" + say + "* er í nútíð";
  return {
    kind: "indirect", s, frame: pastFrame ? "past" : "present", quote: quotePast ? "past" : "present",
    from: `${Sp} ${say}: „${s.t}“`,
    instruction: "Settu orðin í **óbeina ræðu**: án gæsalappa, í aukasetningu sem byrjar á *að*.",
    answers: [...withAd, ...without], model: withAd[0], speaker: sp,
    why: "Í óbeinni ræðu segjum við frá orðum annarra án gæsalappa, í aukasetningu sem hefst á *að*. " +
      (quotePast
        ? `Það sem sagt var í **þátíð** er liðið þegar sagt er frá því. Þá kemur sögnin *hafa* í viðtengingarhætti ${tenseWord}, og aðalsögnin í sagnbót: ${changes.map((c) => `*${c.from}* → *${c.to}*`).join(", ")}.`
        : `Sögnin fer í **viðtengingarhátt** ${tenseWord}: ${changes.map((c) => `*${c.from}* → *${c.to}*`).join(", ")}.`) +
      (eg ? ` Persónan breytist líka: sá sem sagði *ég* er nú *${sp}*, og sögnin fer í 3. persónu.` : "") +
      " *Að* má sleppa, en í rituðu máli er það oftast haft með.",
    checks,
    marks: changes.map((c) => ({ m: c.m, word: wordKey(c.e.o, "so") })),
  };
}

export const TRANSFORMS = {
  past: { nm: "þátíð", build: transformPast },
  plural: { nm: "fleirtala", build: transformPlural },
  passive: { nm: "þolmynd", build: transformPassive, minLevel: 2 },
  igaer: { nm: "Í gær …", build: (lex, s) => transformOpener(lex, s, "Í gær") },
  amorgun: { nm: "Á morgun …", build: (lex, s) => transformOpener(lex, s, "Á morgun") },
  /* v6.13 (item 29) */
  active: { nm: "germynd", build: transformActive, minLevel: 2 },
  question: { nm: "spurning", build: transformQuestion },
  join: { nm: "tenging", build: transformJoin, minLevel: 2 },
  indirect: { nm: "óbein ræða", build: transformIndirect, minLevel: 3 },
};

/* ======================================================= SETNINGASMIÐJA === */

/** The card a token is shown as, and the forms that answer it. */
/** Is there a noun within two words that this word agrees with? */
function nounBeside(s, j, t) {
  for (let k = Math.max(0, j - 2); k <= Math.min(s.tok.length - 1, j + 2); k++) {
    const n = s.tok[k];
    if (k !== j && n.c === "nafnorð" && caseOf(n.m) === caseOf(t.m) && numOf(n.m) === numOf(t.m)) return true;
  }
  return false;
}

function cardFor(lex, s, t, j) {
  if (!t.c || ["atviksorð", "forsetning", "samtenging", "nafnháttarmerki", "upphrópun"].includes(t.c)) {
    if (t.c === "forsetning" && TWO_CASE.has(String(t.l || t.w).toLowerCase())) return null;
    const e = t.l ? lex.entryForToken(t) : null;
    const shown = lowerFirst(t.w, e);
    return { text: shown, tags: [], answers: [t.w], fixed: true, c: t.c };
  }
  const e = confirmed(lex, t);
  if (!e) return null;
  const a = readMark(t.m);
  const answers = formsOf(e, t.m);
  if (t.c === "nafnorð") {
    if (!firm(t, ["tala"])) return null;
    const tags = [];
    if (a.tala === "fleirtala") tags.push("ft.");
    if (a.greinir) tags.push("með greini");
    return { text: e.o, tags, answers, e, m: t.m };
  }
  if (t.c === "lýsingarorð") {
    if (!firm(t, ["tala"])) return null;
    const tags = [];
    if (a.stig === "miðstig") tags.push("miðstig");
    if (a.stig === "efsta stig") tags.push("efsta stig");
    return { text: e.o, tags, answers, e, m: t.m };
  }
  if (t.c === "sagnorð") {
    const x = FINITE.exec(t.m);
    if (x) {
      if (!firm(t, t.k === "aðalsetning" ? ["háttur"] : [])) return null;
      const inf = x[1] === "MM" ? (formsOf(e, "MM-NH")[0] || null) : e.o;
      if (!inf) return null;
      const tags = [x[3] === "NT" ? "nútíð" : "þátíð"];
      if (x[2] === "VH") tags.push("viðtengingarháttur");
      return { text: inf, tags, answers, e, m: t.m, finite: true };
    }
    if (/^GM-NH$/.test(t.m)) return { text: e.o, tags: [], answers, e, m: t.m };
    return null;
  }
  if (t.c === "fornafn" || t.c === "greinir" || t.c === "töluorð") {
    if (!firm(t)) return null;
    if (t.x === "pfn") {
      /* A personal pronoun is shown in the nominative of its own number:
         *okkur* is the card *við*, *honum* the card *hann*. */
      const nf = formsOf(e, withCase(t.m, "NF").replace(/gr$/, ""))[0];
      if (!nf) return null;
      return { text: nf, tags: [], answers, e, m: t.m };
    }
    if (t.x === "abfn") return null;                 // *sig* has no nominative
    /* A pronoun or numeral that stands alone (*Þetta er…*, *stærri en
       þennan*) takes its gender from what is meant, not from a word on the
       cards, so the answer would be a guess. */
    if (!nounBeside(s, j, t)) return null;
    return { text: e.o, tags: [], answers, e, m: t.m };
  }
  return null;
}

/** One sentence as word cards, or null if it cannot be built safely. */
export function workshop(lex, s) {
  if (!endsPlain(s) || hasParticiple(s) || s.nf) return null;
  const toks = s.tok.filter((t) => !isPunct(t));
  if (toks.length < 3 || toks.length > 8) return null;
  /* Every finite verb needs a subject in the nominative to agree with, or
     its person and number would be a guess from the cards. */
  const finite = s.tok.filter((t) => t.c === "sagnorð" && FINITE.test(t.m || ""));
  if (!finite.length) return null;
  for (const v of finite) {
    const subj = s.tok.some((t) => t.r === "frumlag" && t.k === v.k && caseOf(t.m) === "NF");
    if (!subj) return null;
  }
  const cards = [];
  for (let j = 0; j < s.tok.length; j++) {
    const t = s.tok[j];
    if (isPunct(t)) continue;
    const c = cardFor(lex, s, t, j);
    if (!c) return null;
    cards.push({ ...c, i: j, w: t.w });
  }
  /* Worth asking: at least two words must change from their card. */
  const changing = cards.filter((c) => !c.fixed &&
    !c.answers.some((f) => normalise(f) === normalise(c.text)));
  if (changing.length < 2) return null;
  return {
    s, cards,
    answers: combinations(cards.map((c) => c.answers).concat([["."]])),
  };
}

/* ========================================================== VILLUVEIÐAR === */

/* Two sources of errors (v6.13, critique item 26).

   THE BANK — exercises.py HUNT, built into EX.hunt: sentences written by hand,
   each with one slip a native teenager really makes (*mér langar*, *ég vill*,
   *til drottningu*, *tvær buxur*, *læknirar*), its correction checked against
   BÍN by the build, and an explanation. `bankHunt` below.

   THE GENERATOR — the rest of this section: a form BÍN has for the same word
   in a cell the sentence does not allow. Much of what it makes no native
   speaker would say (*Stelpan hlaupa*), which is exactly what a beginner and
   a pupil with Icelandic as a second language do get wrong. `errorHunt`.

   `huntSource` decides which one a pupil meets.

   The generator makes three kinds of error:
     fall      a noun in the wrong case, where the case is fixed by a
               preposition of one case or a verb whose government the build
               confirmed, or the nominative of a subject
     samræmi   an adjective in the wrong gender beside its noun
     sögn      a finite verb in the wrong number for its subject
   The wrong form must not be a form of the RIGHT cell under another reading
   (*bók* is nominative and accusative alike), or the child could be marked
   wrong for leaving a correct word alone. */

function governorOf(s, i) {
  let j = i - 1;
  while (j >= 0 && (MODIFIER.has(s.tok[j].c) || s.tok[j].rj)) j--;
  return j >= 0 ? s.tok[j] : null;
}

/** Every form of `e` whose mark matches `test` — the forms that would be
    correct in this slot under some reading. */
const formsWhere = (e, test) => {
  const out = new Set();
  for (const [m, fs] of Object.entries(e.forms)) if (test(m)) fs.forEach((f) => out.add(normalise(f)));
  return out;
};

function caseError(lex, s, i) {
  const t = s.tok[i];
  if (t.c !== "nafnorð" || !firm(t, ["tala"])) return null;
  const e = confirmed(lex, t);
  if (!e) return null;
  const k = caseOf(t.m);
  /* A noun with a word beside it that agrees (*þrír hestar*, *bróður minn*)
     could be "fixed" by changing that word instead; only a bare noun, or one
     with its article, is made wrong. */
  const prev = s.tok[i - 1], next = s.tok[i + 1];
  if ((prev && MODIFIER.has(prev.c)) || (next && MODIFIER.has(next.c))) return null;
  const gov = governorOf(s, i);
  let why = null, prefer = null, govKind = null;
  if (gov && gov.c === "forsetning" && gov.pg && !TWO_CASE.has(String(gov.l || gov.w).toLowerCase())
      && k === { þf: "ÞF", þgf: "ÞGF", ef: "EF" }[gov.pg]) {
    why = `Forsetningin *${String(gov.w).toLowerCase()}* stýrir alltaf ${caseIn(k)}.`;
    /* The slips people actually make: the accusative for the dative and the
       other way round; the dative or accusative where the genitive belongs. */
    prefer = { ÞGF: ["ÞF"], ÞF: ["ÞGF"], EF: ["ÞGF", "ÞF"] }[k];
    govKind = "fs";
  } else if (t.r === "andlag") {
    const v = s.tok.find((p) => p.c === "sagnorð" && p.k === t.k && (p.g || []).length === 1 &&
      { þf: "ÞF", þgf: "ÞGF", ef: "EF" }[p.g[0]] === k);
    if (v) why = `Sögnin *${v.l}* stýrir ${caseIn(k)}; orðið er andlag hennar.`;
    prefer = { ÞGF: ["ÞF"], ÞF: ["ÞGF"], EF: ["ÞF", "ÞGF"] }[k];
    govKind = "so";
  }
  /* Not the subject: "Hestanna standa þarna" is not a mistake anyone makes. */
  if (!why || !prefer) return null;
  const right = formsWhere(e, (m) => caseOf(m) === k);
  for (const c of prefer) {
    const m = withCase(t.m, c);
    const f = formsOf(e, m)[0];
    if (!f || right.has(normalise(f))) continue;
    return { i, kind: "fall", wrong: f, wrongMark: m, why, gov: govKind,
      label: `fall: ${CASE_WORD[k]}, ekki ${CASE_WORD[c]}` };
  }
  return null;
}

/* ---------- the other half of an agreement error (v6.10) ----------
 *
 * An agreement error is a MISMATCH between two words, and a mismatch can be
 * mended at either end. *Kennarinn sögðu mér frá bókinni* is put right by
 * *sagði* and just as well by *Kennararnir*; *Ég hjálpaði gömlum konu* by
 * *gamalli konu* and by *gömlum konum*. Until v6.10 only the word the
 * builder had broken was accepted, and a child who mended the other end was
 * told they had changed a correct word.
 *
 * The other end is accepted only when changing THAT ONE WORD leaves a correct
 * sentence: nothing else may agree with it (*Kennarinn minn*, *er stór*,
 * a second verb), and its number must be one people use. Where that cannot be
 * guaranteed the sentence has exactly one one-word fix, and that is the one
 * the error count promises. */

const touches = (s, j) => {
  const a = s.tok[j - 1], b = s.tok[j + 1];
  const near = (x) => x && !isPunct(x) && (!x.c || MODIFIER.has(x.c) || x.rj);
  return near(a) || near(b);
};

/** The noun beside a wrong adjective, put in the number the adjective's
    wrong form fits — or null. */
function nounAlt(lex, s, i, adj, wrongForm) {
  const n = s.tok[i + 1];
  const ne = confirmed(lex, n);
  if (!ne || ["frumlag", "sagnfylling"].includes(n.r) || ne.np || NO_PLURAL_CLASS.has(ne.s)) return null;
  if (!firm(n)) return null;
  const before = s.tok[i - 1], after = s.tok[i + 2];
  const near = (x) => x && !isPunct(x) && (!x.c || MODIFIER.has(x.c) || x.rj);
  if (near(before) || near(after)) return null;
  /* *gömlu manninum sem bjó*: a relative clause agrees with the noun too. */
  if (s.tok.slice(i + 2).some((x) => ["sem", "er"].includes(String(x.w).toLowerCase()) && x.c === "samtenging")) return null;
  if (after && String(after.w).toLowerCase() === "sem") return null;
  const other = numOf(n.m) === "ET" ? "FT" : "ET";
  const fits = formsOf(adj, withNumber(s.tok[i].m, other)).map(normalise);
  if (!fits.includes(normalise(wrongForm))) return null;
  const answers = formsOf(ne, withNumber(n.m, other));
  return answers.length ? { i: i + 1, answers } : null;
}

/* A personal pronoun as the subject, in the other number. The third person
   has three genders; any of them makes the sentence correct. */
const PRON_FLIP = {
  ET: { "ég": ["við"], "þú": ["þið"], "hann": ["þeir", "þær", "þau"], "hún": ["þeir", "þær", "þau"] },
  FT: { "við": ["ég"], "þið": ["þú"], "þeir": ["hann", "hún"], "þær": ["hann", "hún"], "þau": ["hann", "hún"] },
};

/** The subject of a wrong verb, put in the number the verb's wrong form
    fits — or null. */
function subjectAlt(lex, s, verb, subj, flip) {
  const j = s.tok.indexOf(subj);
  if (j < 0 || touches(s, j)) return null;
  /* Anything else in the clause that agrees with the subject would be left
     wrong by changing it: a predicative (*er stór*), a second verb, *sinn*. */
  if (s.tok.some((p) => p.k === verb.k && p.r === "sagnfylling")) return null;
  /* …and so might a word the build could not analyse (*Strákurinn er
     þreyttur*: the guard withdrew *þreyttur*), or any other nominative or
     adjective in the clause. Better one fix than a wrong second one. */
  if (s.tok.some((p) => p !== subj && p.k === verb.k && !isPunct(p) &&
      (!p.c || p.c === "lýsingarorð" || (["nafnorð", "fornafn"].includes(p.c) && caseOf(p.m) === "NF")))) return null;
  if (s.tok.filter((p) => p.k === verb.k && p.c === "sagnorð" && FINITE.test(p.m || "")).length !== 1) return null;
  if (s.tok.some((p) => p.c === "fornafn" && (p.l === "sinn" || p.x === "abfn"))) return null;
  /* a relative clause on the subject agrees with it as well */
  if (s.tok.some((p) => String(p.w).toLowerCase() === "sem")) return null;
  const cap = (f) => (j === 0 ? capFirst(f) : f);
  if (subj.c === "fornafn") {
    const list = (PRON_FLIP[numOf(subj.m)] || {})[String(subj.w).toLowerCase()];
    return list ? { i: j, answers: list.map(cap) } : null;
  }
  const ne = confirmed(lex, subj);
  if (!ne || ne.np || NO_PLURAL_CLASS.has(ne.s) || NAME_LIKE.has(ne.o)) return null;
  const m1 = withNumber(subj.m, flip);
  const m2 = /gr$/.test(m1) ? m1.replace(/gr$/, "") : m1 + "gr";
  const answers = [...new Set([...formsOf(ne, m1), ...formsOf(ne, m2)])].map(cap);
  return answers.length ? { i: j, answers } : null;
}

function adjectiveError(lex, s, i, rng) {
  const t = s.tok[i];
  if (t.c !== "lýsingarorð" || !firm(t)) return null;
  const n = s.tok[i + 1];
  if (!n || n.c !== "nafnorð" || caseOf(n.m) !== caseOf(t.m) || numOf(n.m) !== numOf(t.m)) return null;
  const e = confirmed(lex, t), ne = confirmed(lex, n);
  if (!e || !ne || !GENDERS[ne.c]) return null;
  const g = ne.c.toUpperCase();
  if (!new RegExp(`-${g}-`).test(t.m)) return null;
  const k = caseOf(t.m), num = numOf(t.m);
  const right = formsWhere(e, (m) => m.includes(`-${g}-`) && caseOf(m) === k && numOf(m) === num);
  for (const other of shuffle(["KK", "KVK", "HK"].filter((x) => x !== g), rng)) {
    const m = t.m.replace(`-${g}-`, `-${other}-`);
    const f = formsOf(e, m)[0];
    if (!f || right.has(normalise(f))) continue;
    const alt = nounAlt(lex, s, i, e, f);
    return { i, kind: "samræmi", wrong: f, wrongMark: m, alt,
      why: `Lýsingarorðið lagar sig að nafnorðinu *${n.w.toLowerCase()}* í kyni, tölu og falli: ` +
        `${GENDERS[ne.c]}, ${readMark(t.m).tala}, ${caseName(readMark(t.m).fall)}.`,
      altWhy: alt ? `Hér má líka setja nafnorðið í ${num === "ET" ? "fleirtölu" : "eintölu"}: ` +
        `*${f} ${alt.answers[0]}* er líka rétt. Aðalatriðið er að orðin tvö samræmist.` : null,
      label: "samræmi: kyn lýsingarorðs" };
  }
  return null;
}

const COLLECTIVE = new Set(["fjöldi", "hópur", "hluti", "meirihluti", "helmingur", "fólk",
  "mannfjöldi", "fjölskylda", "bekkur", "lið"]);

/* *vera* is in most sentences of the bank, so a verb error picked at random
   was *er/eru* far more often than anything else (v6.10). It is still made
   wrong now and then — it is a real mistake — but rarely. */
const VERA_SHARE = 0.2;

function verbError(lex, s, i, rng) {
  const t = s.tok[i];
  if (t.c !== "sagnorð" || !FINITE.test(t.m || "")) return null;
  if (!firm(t, t.k === "aðalsetning" ? ["háttur"] : [])) return null;
  const e = confirmed(lex, t);
  if (!e) return null;
  if (e.o === "vera" && rng() > VERA_SHARE) return null;
  /* A subject in the nominative, in the same clause, that says the number. */
  const subj = s.tok.find((p) => p.r === "frumlag" && p.k === t.k && caseOf(p.m) === "NF" &&
    (p.c === "nafnorð" || (p.c === "fornafn" && p.x === "pfn")) && firm(p));
  if (!subj) return null;
  /* *Fjöldi bíla sást* / *sáust*: with a collective noun both numbers are
     heard and defended, so neither is made the error. */
  if (COLLECTIVE.has(String(subj.l))) return null;
  if (s.tok.some((p) => p.r === "frumlag" && p.k === t.k && p !== subj && p.c === "nafnorð")) return null;
  const x = FINITE.exec(t.m);
  const flip = x[5] === "ET" ? "FT" : "ET";
  const m = t.m.replace(/-(ET|FT)$/, "-" + flip);
  const f = formsOf(e, m)[0];
  const right = formsWhere(e, (mm) => pn(mm) === pn(t.m));
  if (!f || right.has(normalise(f))) return null;
  const alt = subjectAlt(lex, s, t, subj, flip);
  return { i, kind: "sögn", wrong: f, wrongMark: m, alt,
    why: explainVerbForm(s, i) || `Sögnin lagar sig að frumlaginu *${subj.w.toLowerCase()}*.`,
    altWhy: alt ? `Hér má líka breyta frumlaginu: *${alt.answers[0]} … ${f}* er líka rétt. ` +
      `Aðalatriðið er að frumlag og sögn séu í sömu tölu.` : null,
    label: "samræmi: sögn og frumlag" };
}

/**
 * Other forms that put the error right just as well, though the sentence
 * as it stood had another (v6.12):
 *  - the other tense, when nothing in the sentence says when: *Þrjú börn
 *    ___ úti* is right with *biðu* and with *bíða*;
 *  - the noun with or without the article, when nothing beside it decides:
 *    *Ég sagði frá hestunum* is as right as *frá hestum*. Not next to an
 *    adjective (strong or weak goes with it), a pronoun, a numeral or a
 *    genitive, and not a name.
 * Person, number, mood, case and gender stay as they were: those are what
 * the errors are about.
 */
export function alsoRight(lex, s, i) {
  const t = s.tok[i];
  const e = confirmed(lex, t);
  if (!e) return [];
  const out = [];
  if (t.c === "sagnorð" && FINITE.test(t.m || "") && !saysWhen(lex, s) &&
      s.tok.filter((p) => p.c === "sagnorð" && FINITE.test(p.m || "")).length === 1) {
    const m = t.m.replace(/-(NT|ÞT)-/, (_, x) => (x === "NT" ? "-ÞT-" : "-NT-"));
    if (m !== t.m) out.push(...formsOf(e, m));
  }
  if (t.c === "nafnorð" && caseOf(t.m) && !/^[A-ZÁÐÉÍÓÚÝÞÆÖ]/.test(e.o)) {
    const busy = (x) => x && ["lýsingarorð", "fornafn", "greinir", "töluorð"].includes(x.c);
    const prev = s.tok[i - 1], next = s.tok[i + 1];
    const genAfter = next && NOMINAL.has(next.c) && caseOf(next.m || "") === "EF";
    if (!busy(prev) && !busy(next) && !genAfter) {
      const m = /gr$/.test(t.m) ? t.m.replace(/gr$/, "") : t.m + "gr";
      out.push(...formsOf(e, m));
    }
  }
  return out;
}

/** Every error that can safely be made in this sentence. */
export function errorCandidates(lex, s, rng) {
  if (s.nf || hasParticiple(s)) return [];
  const out = [];
  s.tok.forEach((t, i) => {
    const c = caseError(lex, s, i) || adjectiveError(lex, s, i, rng) || verbError(lex, s, i, rng);
    if (c) out.push(c);
  });
  return out;
}

/**
 * Two sentences, one above the other, with `count` errors (1 or 2) — at most
 * one in each sentence and at most one verb ending. v6.10: the chat thread,
 * news snippet and game log are gone; the frame was noise around the grammar.
 *
 * `prefer` lists the kinds ("fall", "samræmi", "sögn") to choose first — the
 * error diagnosis (core/diagnosis.js) passes the kinds this child misses.
 * `rng` is the random source; every draw below goes through it.
 * Returns null if it cannot.
 */
export function errorHunt(lex, pool, rng, { count = 1, prefer = [] } = {}) {
  const usable = pool.filter((s) => s.tok.length <= 14 && endsPlainish(s));
  if (usable.length < 2) return null;
  const nErr = count >= 2 ? 2 : 1;
  const RANK = { "samræmi": 0, "fall": 1, "sögn": 2 };
  const rank = (c) => (prefer.includes(c.kind) ? -1 : RANK[c.kind]);
  for (let attempt = 0; attempt < 30; attempt++) {
    const seed = pick(usable, rng);
    /* A little coherence: the second sentence shares a noun with the first
       when the bank has one. */
    const nouns = new Set(seed.tok.filter((t) => t.c === "nafnorð").map((t) => t.l));
    const related = usable.filter((s) => s !== seed && s.t !== seed.t &&
      s.tok.some((t) => t.c === "nafnorð" && nouns.has(t.l)));
    const rest = related.length ? related : usable.filter((s) => s !== seed && s.t !== seed.t);
    if (!rest.length) continue;
    const sents = shuffle([seed, pick(rest, rng)], rng);
    const cands = sents.flatMap((s, si) => errorCandidates(lex, s, rng).map((c) => ({ ...c, si })));
    /* One error per sentence: two in one clause can hide each other (a
       subject and its verb both wrong agree with each other again). */
    const chosen = [];
    for (const c of shuffle(cands, rng).sort((a, b) => rank(a) - rank(b))) {
      if (chosen.length >= nErr) break;
      if (chosen.some((x) => x.si === c.si)) continue;
      if (c.kind === "sögn" && chosen.some((x) => x.kind === "sögn")) continue;
      chosen.push(c);
    }
    if (chosen.length < nErr) continue;
    const lines = sents.map((s, si) => ({
      s,
      toks: s.tok.map((t, i) => {
        const err = chosen.find((c) => c.si === si && c.i === i);
        const e = err ? confirmed(lex, t) : null;
        return {
          w: err ? (i === 0 ? capFirst(err.wrong) : err.wrong) : t.w,
          right: t.w,
          punct: isPunct(t),
          err: err ? {
            kind: err.kind, why: err.why, label: err.label, gov: err.gov || null,
            answers: [...new Set([...formsOf(e, t.m),
              ...alsoRight(lex, s, i).filter((f) => normalise(f) !== normalise(err.wrong))])]
              .map((f) => (i === 0 ? capFirst(f) : f)),
            m: t.m, wrongMark: err.wrongMark,
            word: e ? wordKey(e.o, e.c) : null,
            alt: err.alt ? { key: `${si}:${err.alt.i}`, answers: err.alt.answers,
              w: s.tok[err.alt.i].w } : null,
            altWhy: err.altWhy || null,
          } : null,
        };
      }),
    }));
    return {
      lines,
      errors: chosen.length,
      lvl: Math.max(...sents.map((s) => s.lvl)),
    };
  }
  return null;
}
const endsPlainish = (s) => s.tok.length && [".", "!", "?"].includes(s.tok[s.tok.length - 1].w);

/* ============================================= THE THREE QUESTION TYPES === */

/* Where the builders above meet the level, the policy and the catalogue. */

const PROD = "malbeiting";

/* ---------- which errors: the bank or the generator ----------------------
 *
 * The bank from þyngd 3, the generator below it. Þyngd 1–2 is where a pupil
 * is still learning the cases and the agreement the generator breaks; from 3
 * the sentences are long enough that its errors read as nonsense, and the
 * pupil is ready for the slips heard in every school corridor.
 *
 * THE HOOK FOR A SECOND-LANGUAGE PROFILE (critique item 45). A pupil learning
 * Icelandic as a second language makes the generator's errors, not the
 * bank's, at every þyngd. Nothing sets this yet: item 45 adds the profile
 * switch, and all it has to do for Villuveiðar is make `secondLanguage`
 * true — by saving `settings.secondLanguage` or by changing this one
 * function to read wherever the profile is kept. Nothing else in this file
 * asks who the pupil is. */
export const BANK_FROM_BAND = 3;
export const secondLanguage = (view) =>
  !!(view && view.S && view.S.settings && view.S.settings.secondLanguage);

/** "bank" or "generated": the kind of error hunt this pupil gets at this þyngd. */
export function huntSource(view, band) {
  if (secondLanguage(view)) return "generated";
  return band >= BANK_FROM_BAND ? "bank" : "generated";
}

/* ---------- the bank ------------------------------------------------------ */

/** The key an item of the bank is remembered by within a session. */
const bankKey = (x) => "villa:" + x.t;

/** The items of the bank a pupil may meet at this þyngd: those written for it
    or for a lower one, whose inflection (where the correction is an inflected
    form) the curriculum has switched on. */
export function bankPool(view, band) {
  const P = view.policy;
  return EX.hunt.filter((x) => x.b <= band && x.ms.every((m) => askable(P, m)));
}

/** One item of the bank as a line of a hunt: its tokens, with the wrong form
    shown in place of the right one. The correction may be two words that
    change places (*við hvorn* → *hvor við*); they are one token, mended in
    one box. */
function bankLine(x) {
  return {
    s: { t: x.t, bank: true },
    toks: x.toks.map((w, i) => (i !== x.i
      ? { w, right: w, punct: PUNCT.has(w), err: null }
      : {
        w: x.w, right: w, punct: false,
        err: {
          kind: "mál", why: x.why, label: "málnotkun", gov: null,
          answers: x.a,
          /* Not one cell of one word: nothing is written to the cell and word
             statistics. What it IS, is the error patterns it is filed under
             (core/diagnosis.js reads `patterns` before `kind`). */
          m: null, wrongMark: null, word: null,
          patterns: x.p,
          alt: null, altWhy: null,
        },
      })),
  };
}

/**
 * Two sentences from the bank, one error in each — the same shape as
 * `errorHunt`, so one renderer and one judge serve both.
 *
 * `prefer`: the Villuveiðar kinds the error diagnosis asks for (the `hunt` of
 * the pupil's active patterns); an item filed under such a pattern is chosen
 * first. The second sentence is about something else than the first: two
 * *mér langar* in one question would give the second away.
 * Returns { hunt, items } or null when the pupil may meet fewer than two.
 */
export function bankHunt(view, rng, { band = 7, prefer = [] } = {}) {
  const pool = bankPool(view, band);
  if (pool.length < 2) return null;
  const wanted = (x) => x.p.some((id) => prefer.includes((patternById(id) || {}).hunt));
  const unseen = fresh(view, bankKey, pool);
  const aimed = unseen.filter(wanted);
  const first = pick(aimed.length ? aimed : unseen, rng);
  const apart = (x) => x !== first && !x.p.some((id) => first.p.includes(id)) &&
    !(x.w === first.w && x.a[0] === first.a[0]);
  const others = [unseen.filter(apart), pool.filter(apart), pool.filter((x) => x !== first)]
    .find((list) => list.length);
  const items = shuffle([first, pick(others, rng)], rng);
  return {
    items,
    hunt: {
      lines: items.map(bankLine),
      errors: items.length,
      lvl: Math.max(...items.map((x) => x.b)),
      /* For whoever draws the question: these are slips of usage, spelling
         and the written norm, not only "villa í falli eða samræmi". */
      source: "bank",
    },
  };
}

export function taskHunt(lex, view, rng) {
  const P = view.policy;
  const band = bandFor(view, PROD);
  if (huntSource(view, band) === "bank") {
    const b = bankHunt(view, rng, { band, prefer: view.huntPrefer });
    if (b) {
      return built({
        type: "villur", skill: PROD, hunt: b.hunt, edits: {},
        base: 6 + 4 * b.hunt.errors, lvl: levelFor(P, b.hunt.lvl), cell: "villur", word: null,
      }, b.items.map((x) => FX.exSeen(bankKey(x))));
    }
    /* Fewer than two items allowed (a curriculum with most inflection
       switched off): the generator, as below þyngd 3. */
  }
  const pool = sentPool(lex, view, PROD);
  if (pool.length < 6) return null;
  for (let k = 0; k < 6; k++) {
    /* v6.10: two sentences; one error below þyngd 3, two from there. The
       error diagnosis may ask for the kinds this child misses (`huntPrefer`). */
    const h = errorHunt(lex, pool, rng, { count: band >= 3 ? 2 : 1, prefer: view.huntPrefer });
    if (!h) return null;
    /* Every error is a cell; the policy must allow both the right one and the
       wrong one that is shown. */
    const errs = h.lines.flatMap((l) => l.toks.filter((t) => t.err).map((t) => t.err));
    if (!errs.every((e) => askable(P, e.m) && askable(P, e.wrongMark))) continue;
    return built({
      type: "villur", skill: PROD, hunt: h, edits: {},
      base: 6 + 4 * h.errors, lvl: h.lvl, cell: "villur", word: null,
    });
  }
  return null;
}

const WORKSHOP_TOP_BAND = 3;

export function taskWorkshop(lex, view, rng) {
  const P = view.policy;
  /* From þyngd 4 the sentences are nine words and more, mostly with a clause
     or a two-case preposition that cannot be put on a card, and only three
     were buildable (critique item 3). Grouping the unchanging words on one
     card was tried and gave four. So the higher bands draw from the pool of
     þyngd 2–3, which has about eighty. */
  const pool = sentPool(lex, view, PROD, Math.min(bandFor(view, PROD), WORKSHOP_TOP_BAND)).filter((s) => !s.nf);
  for (const s of shuffle(pool, rng).slice(0, 120)) {
    const w = workshop(lex, s);
    if (!w) continue;
    if (!w.cards.every((c) => !c.m || askable(P, c.m))) continue;
    return built({
      type: "smidja", skill: PROD, s, cards: w.cards, answers: w.answers,
      base: 8 + 2 * w.cards.filter((c) => !c.fixed).length, lvl: s.lvl, cell: "smidja", word: null,
    });
  }
  return null;
}

/** Which rewrites a band may ask for: the passive from þyngd 2. */
const transformKinds = (band) => Object.entries(TRANSFORMS)
  .filter(([, t]) => !t.minLevel || band >= t.minLevel).map(([k]) => k);

/* What a rewrite is worth: the passive and the two kinds that rebuild a
   whole sentence more than a verb swapped or moved. */
const BASE = { passive: 16, active: 14, join: 15, indirect: 16, question: 11 };

export function taskTransform(lex, view, rng) {
  const P = view.policy;
  const band = bandFor(view, PROD);
  const pool = sentPool(lex, view, PROD);
  /* A review (tasks/review.js) asks for the kind of rewrite that was missed:
     "umritun:passive". Until item 28 the builder did not know the hook and
     the review built at random until the kind came up — or did not. */
  const fc = forcedCell(view);
  const wanted = fc && fc.startsWith("umritun:") ? fc.slice(8) : null;
  if (fc && !(wanted && TRANSFORMS[wanted])) return null;
  const kinds = wanted ? [wanted] : transformKinds(band);
  /* The kind first, so a rare one (the passive: about thirty sentences) is
     asked as often as a common one. */
  for (const kind of shuffle(kinds, rng)) {
    /* A review does not wait for the difficulty: the band's sentences first,
       all of them, then every sentence the pupil may meet. */
    const from = wanted
      ? [...shuffle(pool, rng), ...shuffle(lex.sentences.filter((s) => P.level(s.lvl) && !pool.includes(s)), rng)]
      : shuffle(pool, rng).slice(0, 150);
    for (const s of from) {
      if (wanted && view.force.avoid === s.t) continue;
      const r = TRANSFORMS[kind].build(lex, s);
      if (!r || !r.answers.length) continue;
      if (!(r.marks || []).every((c) => askable(P, c.m))) continue;
      return built({
        type: "umritun", skill: PROD, ...r, kind,
        base: BASE[kind] || 13, lvl: s.lvl, cell: "umritun:" + kind, word: null,
      });
    }
  }
  return null;
}

/* ============================================ BEIN OG ÓBEIN RÆÐA (item 28) ==
 *
 * "Settu í óbeina ræðu" as a question type of its own, so that the node
 * *Bein og óbein ræða* (core/curriculum.js `mb-raeda`) can be practised on
 * its own. Nothing is made here: every question is `transformIndirect`
 * above, which Umritun also draws from þyngd 3 — the same sentences, the
 * same accepted answers, the same notes under a wrong one.
 *
 * What this type adds is the other tense and both frames:
 *
 *   þyngd 1–3  the quote is in the PRESENT tense. The verb goes to the
 *              subjunctive — of the past after *sagði*, of the present
 *              after *segir*. Each sentence is asked in both frames.
 *   þyngd 4–7  the quote is in the PAST tense: *„Ég fór heim.“* → *að hún
 *              hefði farið heim* (after *segir*: *hafi farið*). About one
 *              question in four is still of the first kind.
 *
 * The cell is the subjunctive cell the answer needs and the word its verb,
 * so the review queue (tasks/review.js) can ask for either again. */

/* Every way a sentence can be asked, once per lexicon: which sentences pass
   is decided by `transformIndirect` and by nothing else. */
const SPEECH = new WeakMap();
function speechItems(lex) {
  if (SPEECH.has(lex)) return SPEECH.get(lex);
  const list = [];
  for (const s of lex.sentences) {
    for (const quote of ["present", "past"]) for (const frame of ["past", "present"]) {
      const r = transformIndirect(lex, s, { frame, quote });
      if (r && r.answers.length) list.push({ s, quote, frame, marks: r.marks, key: `raeda:${quote}:${frame}:${s.t}` });
    }
  }
  SPEECH.set(lex, list);
  return list;
}

export function taskSpeech(lex, view, rng) {
  const P = view.policy;
  const fw = forced(view, ["so"]);
  if (drilling(view) && !fw) return null;
  const fc = forcedCell(view);
  const avoid = view.force && view.force.avoid;
  const hard = bandFor(view, PROD) >= 4;
  const usable = speechItems(lex).filter((x) => P.level(x.s.lvl) && x.s.t !== avoid
    && x.marks.every((c) => askable(P, c.m)));
  let pool;
  if (fc || fw) {
    /* A review: the subjunctive cell that was missed, the verb, or both. */
    pool = usable.filter((x) => x.marks.some((c) => (!fc || c.m === fc)
      && (!fw || c.word === wordKey(fw.o, "so"))));
  } else {
    const past = usable.filter((x) => x.quote === "past");
    const present = usable.filter((x) => x.quote === "present");
    pool = !hard ? present : (past.length && (!present.length || rng() < 0.75)) ? past : present;
    if (!pool.length) pool = usable;
  }
  if (!pool.length) return null;
  const x = pick(fresh(view, (y) => y.key, pool), rng);
  const r = transformIndirect(lex, x.s, { frame: x.frame, quote: x.quote });
  const past = x.quote === "past";
  return built({
    type: "umritun", skill: PROD, ...r, kind: "indirect",
    title: "Bein og óbein ræða",
    hint: past
      ? "Byrjaðu á *… að* og slepptu gæsalöppunum. Orðin voru sögð í þátíð: notaðu *hafa* í viðtengingarhætti og sagnbót (*hefði farið*, *hafi farið*)."
      : null,
    base: past ? 18 : 16, lvl: x.s.lvl,
    cell: r.marks[0].m, word: r.marks[0].word,
  }, [FX.exSeen(x.key)]);
}

export const TYPES = [
  /* v6.9: production. Writing the Icelandic tests understanding rather than
     recall, so these three together weigh about as much as the cloze. */
  { id: "umritun", skill: "malbeiting", weight: 10, renderer: "umritun",
    tags: ["num", "passive", "speech", "v2", "verb:agree", "verb:tense", "verb:vh"],
    bands: [1, 2, 3, 4, 5, 6, 7],
    build: taskTransform },
  { id: "smidja", skill: "malbeiting", weight: 8, renderer: "smidja",
    tags: ["adj", "agree:kyn", "case:EF", "case:NF", "case:ÞF", "case:ÞGF", "form", "noun",
      "num", "verb:agree", "verb:mm", "verb:tense", "verb:vh"],
    bands: [1, 2, 3],
    build: taskWorkshop },
  { id: "villur", skill: "malbeiting", weight: 8, renderer: "villur",
    /* The `bank:` tags are the patterns the hand-written bank files its items
       under (core/diagnosis.js BANK_PATTERNS); the rest are the generator's. */
    tags: ["agree:kyn", "case:EF", "case:ÞF", "case:ÞGF", "gov:fs", "gov:so", "hunt",
      "verb:agree",
      "bank:ad_af", "bank:ef", "bank:ending", "bank:fallstjorn_fs", "bank:fallstjorn_so",
      "bank:fleirtoluord", "bank:hattur", "bank:hljodvarp", "bank:hvor", "bank:kyn_samraemi",
      "bank:n_nn", "bank:nf_aukafall", "bank:opersonuleg", "bank:samtengingar",
      "bank:sogn_frumlag", "bank:sterk_veik_sogn", "bank:thf_thgf", "bank:tholmynd", "bank:y_i"],
    /* 1–2: the generator, on the sentences of that þyngd. 3, 4, 5: the bank,
       each step adding the items written for it. Nothing new above 5. */
    bands: [1, 2, 3, 4, 5],
    build: taskHunt },
  /* item 28: bein og óbein ræða, on its own */
  { id: "raeda", skill: "malbeiting", weight: 5, renderer: "umritun",
    tags: ["speech", "verb:vh"],
    bands: [1, 4],
    build: taskSpeech },
];
