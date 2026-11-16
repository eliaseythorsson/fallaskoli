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
                 plural, in the passive, or start it with *Í gær* / *Á morgun*

   The rule behind every builder here is the program's rule: a wrong question
   is worse than no question. Every form these builders produce is read out of
   BÍN through the lexicon; every token they change has been confirmed (its
   lemma is in the vocabulary, BÍN has the mark the parse gave, and the
   surface form in the sentence is one of BÍN's forms for it) and carries no
   feature the build marked as uncertain. A sentence that cannot meet that is
   skipped, never guessed at. Pure module, no DOM.

   Grading these three is in tasks/production.js (on its way to
   core/answer.js); this file only builds. */

import { EX } from "../../../data/exercises.js";
import { readMark, caseName, GENDERS } from "../core/marks.js";
import { patternById } from "../core/diagnosis.js";
import { normalise } from "../core/grading.js";
import { wordKey } from "../core/state.js";
import { explainVerbForm } from "./explain.js";
import { built, FX } from "./effects.js";
import { pick, shuffle, askable, bandFor, sentPool, levelFor, fresh } from "./shared.js";

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

/* Time words. A sentence that already says when (*í gær*, *á morgun*,
   *í dag*) cannot be moved to another time without contradicting itself. */
const TIME_WORDS = new Set(["í gær", "í morgun", "í kvöld", "á morgun", "í gærkvöldi",
  "á morgnana", "á kvöldin", "í ár", "núna", "nú", "áðan", "bráðum", "brátt", "seinna",
  "næst", "þá", "síðan", "loksins", "lengi", "enn", "ennþá", "aldrei", "strax"]);
const saysWhen = (lex, s) => s.tok.some((t, j) => {
  if (TIME_WORDS.has(String(t.w).toLowerCase())) return true;
  if (t.c === "nafnorð") {
    const e = lex.entryForToken(t);
    return !!e && e.s === "time";
  }
  return false;
});

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
  if (!endsPlain(s) || hasParticiple(s) || saysWhen(lex, s)) return null;
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
  return {
    kind: "passive", s,
    instruction: "Settu setninguna í **þolmynd**: láttu andlagið byrja setninguna.",
    answers, model: shown,
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
    why: "Í íslenskri aðalsetningu stendur sögnin sem beygist alltaf í öðru sæti. " +
      `Þegar *${opener.toLowerCase()}* er komið fremst fer frumlagið aftur fyrir sögnina: ` +
      `*${opener} ${verbs.get(vi).forms[0]} ${subj.map((x) => x[0]).join(" ")}*.` +
      (changes.length ? ` Sögnin fer líka í ${when}: ${verbLine(s, changes)}` : ""),
    marks: [...verbs.values()].map((vv) => ({ m: vv.to, word: wordKey(vv.e.o, "so") })),
  };
}

const OPENER_SKIP_VERB = new Set(["vera", "heita", "standa", "liggja", "kosta", "búa", "eiga"]);

export const TRANSFORMS = {
  past: { nm: "þátíð", build: transformPast },
  plural: { nm: "fleirtala", build: transformPlural },
  passive: { nm: "þolmynd", build: transformPassive, minLevel: 2 },
  igaer: { nm: "Í gær …", build: (lex, s) => transformOpener(lex, s, "Í gær") },
  amorgun: { nm: "Á morgun …", build: (lex, s) => transformOpener(lex, s, "Á morgun") },
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

export function taskTransform(lex, view, rng) {
  const P = view.policy;
  const band = bandFor(view, PROD);
  const pool = sentPool(lex, view, PROD);
  const kinds = transformKinds(band);
  /* The kind first, so a rare one (the passive: about thirty sentences) is
     asked as often as a common one. */
  for (const kind of shuffle(kinds, rng)) {
    for (const s of shuffle(pool, rng).slice(0, 150)) {
      const r = TRANSFORMS[kind].build(lex, s);
      if (!r || !r.answers.length) continue;
      if (!(r.marks || []).every((c) => askable(P, c.m))) continue;
      return built({
        type: "umritun", skill: PROD, ...r, kind,
        base: kind === "passive" ? 16 : 13, lvl: s.lvl, cell: "umritun:" + kind, word: null,
      });
    }
  }
  return null;
}

export const TYPES = [
  /* v6.9: production. Writing the Icelandic tests understanding rather than
     recall, so these three together weigh about as much as the cloze. */
  { id: "umritun", skill: "malbeiting", weight: 10, renderer: "umritun",
    tags: ["num", "passive", "v2", "verb:agree", "verb:tense"],
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
];
