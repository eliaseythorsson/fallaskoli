/* Explanations are derived from the parse and the mark, never written down as
   a claim about a particular word. If the data says nothing, we say nothing —
   and an explanation only names a governor (a preposition, a verb) that the
   build confirmed (`pg`, `g`). */

import { CASES, readMark, caseName } from "../core/marks.js";

const CASEWORD = { þf: "ÞF", þgf: "ÞG", ef: "EF" };
const dative = (k) => caseName(k) + "i";          // "þolfall" -> "þolfalli"

/* Words that stand between a governor and its noun and agree with the noun:
   "í [gamla] húsinu", "við [þrjár] stelpur", "eftir [þessum] manni". */
const MODIFIER = new Set(["lýsingarorð", "fornafn", "töluorð", "greinir"]);

/** The time-phrase explanation: *í dag*, *á hverjum degi*, *í síðustu viku*.
    The motion/location rule for *í* and *á* is about PLACE; applied to a time
    phrase it points the child at the wrong case ("í dag" is not motion, and
    "í síðustu viku" is not a location), so a time phrase gets this instead. */
export function explainTimePhrase(prep, fall) {
  const p = String(prep || "").toLowerCase();
  return `*${p} …* er hér tímaliður: hann segir *hvenær*. Reglan um hreyfingu (þolfall) og ` +
    `dvöl (þágufall) á aðeins við um stað, ekki tíma. Í tímaliðum fylgir fallið ` +
    `orðasambandinu sjálfu og þarf að læra það: *í dag*, *í kvöld*, *á morgun* (þolfall), ` +
    `*á hverjum degi*, *í síðustu viku* (þágufall). Hér er það ${dative(fall)}.`;
}

export function explainSlot(s, i, { time = false } = {}) {
  const t = s.tok[i];
  const a = readMark(t.m);
  if (!a.fall) return null;

  /* What stands right before the phrase this word heads? */
  let j = i - 1;
  while (j >= 0 && (MODIFIER.has(s.tok[j].c) || s.tok[j].rj)) j--;
  const before = j >= 0 ? s.tok[j] : null;

  /* 0. A time phrase after a preposition: its own explanation (see above). */
  if (time && before && before.c === "forsetning" && CASEWORD[before.pg] === a.fall)
    return explainTimePhrase(before.w, a.fall);

  /* 1. A preposition whose government the build confirmed. */
  if (before && before.c === "forsetning" && CASEWORD[before.pg] === a.fall)
    return `Forsetningin *${before.w.toLowerCase()}* stýrir hér ${dative(a.fall)}.`;

  /* 2. A genitive right after another noun says whose it is. An explanation
        that walked on past the noun used to credit the genitive to a
        preposition further back: "um mikilvægi *vináttu*" is not governed by
        *um*. */
  if (a.fall === "EF" && before && before.c === "nafnorð")
    return `Orðið er eignarfallseinkunn með nafnorðinu *${before.w.toLowerCase()}* — ` +
      "það stendur í eignarfalli og segir hverjum eða hverju hitt tilheyrir.";

  /* 3. An object: of a verb whose government is confirmed, when there is one
        in sight; otherwise just what it is. */
  if (t.r === "andlag" || t.r === "óbeint andlag") {
    const verb = s.tok.find((p, n) => p.c === "sagnorð" && p.k === t.k && Math.abs(n - i) <= 5
      && (p.g || []).length === 1 && CASEWORD[p.g[0]] === a.fall);
    if (verb) return `Sögnin *${verb.l}* stýrir ${dative(a.fall)}; orðið er andlag hennar.`;
    return t.r === "óbeint andlag"
      ? "Orðið er óbeint andlag. Óbeint andlag stendur oftast í þágufalli."
      : `Orðið er andlag og stendur hér í ${dative(a.fall)}.`;
  }

  /* 4. Subject and predicative — only when the case really is the nominative. */
  if (a.fall === "NF" && t.r === "frumlag")
    return "Orðið er frumlag. Frumlag stendur oftast í nefnifalli.";
  if (a.fall === "NF" && t.r === "sagnfylling")
    return "Orðið er sagnfylling. Sagnfylling með sögnum eins og *vera* og *verða* stendur í nefnifalli.";

  return `Orðið stendur hér í ${dative(a.fall)}.`;
}

/* "1. persóna" + "eintala" -> "í 1. persónu eintölu" */
const inPersonNumber = (a) =>
  `í ${a.persóna.replace("persóna", "persónu")} ${a.tala === "eintala" ? "eintölu" : "fleirtölu"}`;

const FINITE_MOODS = new Set(["framsöguháttur", "viðtengingarháttur"]);
const isFinite = (x) => x.c === "sagnorð" && x.m && FINITE_MOODS.has(readMark(x.m).háttur);

/**
 * The subject this verb agrees with: the nearest noun or pronoun marked
 * `frumlag` in the same kind of clause, with no other finite verb between the
 * two, and in the number the verb form has. Null rather than a guess — the
 * old version took the first subject within four words, which was the subject
 * of another clause as often as not.
 */
function subjectOf(s, i) {
  const v = s.tok[i];
  const a = readMark(v.m);
  /* The noun of the subject phrase if it has one, a pronoun only when it
     stands alone: in "Bróðir minn kemur" the subject named is *bróðir*, not
     the possessive beside the verb. */
  const nearest = (cls) => {
    let best = null;
    s.tok.forEach((x, j) => {
      if (j === i || x.r !== "frumlag" || x.k !== v.k || x.c !== cls) return;
      const [lo, hi] = j < i ? [j, i] : [i, j];
      if (s.tok.slice(lo + 1, hi).some(isFinite)) return;
      const n = readMark(x.m).tala;
      if (n && a.tala && n !== a.tala) return;
      const d = Math.abs(j - i);
      if (!best || d < best.d) best = { x, d };
    });
    return best ? best.x : null;
  };
  return nearest("nafnorð") || nearest("fornafn");
}

/* Conjunctions after which the subjunctive is the expected mood. */
const VH_CONJ = ["að", "ef", "þótt", "þó", "hvort", "nema", "svo"];

/**
 * Why the verb takes this form, read out of the parse and nothing else.
 */
export function explainVerbForm(s, i) {
  const t = s.tok[i];
  const a = readMark(t.m);
  const bits = [];

  if (a.persóna && a.tala) {
    const subj = subjectOf(s, i);
    bits.push(subj
      ? `Sögnin lagar sig að frumlaginu *${subj.w.toLowerCase()}* og stendur því ${inPersonNumber(a)}.`
      : `Sögnin stendur ${inPersonNumber(a)}.`);
  }

  if (a.háttur === "viðtengingarháttur") {
    /* The conjunction that opens the verb's OWN clause: walk back while the
       clause type stays the same. In "Ef veðrið yrði betra myndum við fara
       út" the verb *myndum* is in the main clause, and *ef* is not its
       conjunction. */
    let conj = null;
    if (t.k === "aukasetning") {
      let j = i;
      while (j > 0 && s.tok[j - 1].k === t.k) j--;
      const open = s.tok.slice(j, i).filter((x) => x.c === "samtenging");
      const last = open[open.length - 1];
      if (last && VH_CONJ.includes(last.w.toLowerCase())) conj = last.w.toLowerCase();
    }
    bits.push(conj
      ? `Hún stendur í viðtengingarhætti í aukasetningu sem hefst á *${conj}*.`
      : "Hún stendur í viðtengingarhætti. Hann er notaður um það sem er óvíst, skilyrt eða óskað.");
  }
  if (a.mynd === "miðmynd")
    bits.push("Sögnin er í miðmynd. Miðmynd endar á **-st**.");
  return bits.length ? bits.join(" ") : null;
}

export function explainAdjective(attrs) {
  return attrs.greinir
    ? "Þegar nafnorðið er með greini beygist lýsingarorðið veikt: *fallegi hesturinn*, *fallega konan*, *fallega barnið*."
    : "Þegar nafnorðið er án greinis beygist lýsingarorðið sterkt og endingin fer eftir kyni: *fallegur hestur*, *falleg kona*, *fallegt barn*.";
}

export function explainDegree(stig) {
  if (stig === "miðstig")
    return "Miðstig er notað þegar tvennt er borið saman: *stærri*, *betri*. Það beygist alltaf veikt.";
  if (stig === "efsta stig")
    return "Efsta stig sýnir það sem er mest eða best af öllu. Það getur beygst sterkt (*stærstur*) eða veikt (*stærsti*).";
  return "Frumstig er grunnmynd lýsingarorðsins, án samanburðar.";
}

/** One sentence on how a verb is conjugated, or null. */
/** `conjugationNote` where it says something about the form asked (v6.13
    review, S1): the strong/weak note is about how the PAST indicative is
    made, so it goes under a past-indicative form only; the núþáleg note is
    about the present. Under *ég fer* (present) "þátíðin er mynduð með
    hljóðskiptum" answered a question nobody asked, and under *þótt ég
    tæki* "fær enga endingu" was untrue. */
export function conjugationNoteFor(lemma, conj, m) {
  if (conj === "núþáleg") return /^GM-..-NT-/.test(m || "") ? conjugationNote(lemma, conj) : null;
  return /^GM-FH-ÞT-/.test(m || "") ? conjugationNote(lemma, conj) : null;
}

export function conjugationNote(lemma, conj) {
  if (conj === "sterk")
    return `Sögnin *${lemma}* er sterk sögn: þátíðin er mynduð með hljóðskiptum (sérhljóðið í stofninum breytist) og fær enga endingu í 1. og 3. persónu eintölu.`;
  if (conj === "veik")
    return `Sögnin *${lemma}* er veik sögn: þátíðin er mynduð með endingu, *-aði*, *-ði*, *-di* eða *-ti*.`;
  if (conj === "núþáleg")
    return `Sögnin *${lemma}* er núþáleg sögn: nútíð hennar beygist eins og þátíð sterkra sagna.`;
  return null;
}
