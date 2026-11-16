/* Helper nouns alongside pronouns — and, further down, alongside adjectives.
 *
 * *sá* on its own is not Icelandic a child has heard; *sá maður* is. One helper
 * noun per gender — maður / kona / barn — inflected from BÍN like everything
 * else; this module only decides WHEN a helper applies and WHICH one. Personal
 * and reflexive pronouns get none (*ég maður* is not anything). */

export const HELPER_NOUNS = { kk: "maður", kvk: "kona", hk: "barn" };

/* v6.13 (critique item 23): the pronoun table at þyngd 1 was the same 32
   tables over and over — eight pronouns, three genders, always *maður /
   kona / barn*. These everyday nouns, a person, an animal and things, stand
   beside every pronoun that takes a noun (*þessi hundur, enginn bíll, allar
   bækur, hinn strákurinn*) as naturally as *maður* does. The possessives
   keep *maður / kona / barn* (`helperChoices`). Every one must be in the
   lexicon with all sixteen forms (tests/pools23.test.js). */
export const MORE_HELPER_NOUNS = {
  kk: ["maður", "strákur", "vinur", "hundur", "köttur", "hestur", "fugl", "bíll", "bolti", "stóll",
    "sími", "dagur"],
  kvk: ["kona", "stelpa", "vinkona", "kisa", "kýr", "mús", "bók", "taska", "peysa", "mynd", "borg",
    "saga"],
  hk: ["barn", "dýr", "lamb", "hús", "hjól", "borð", "epli", "bréf", "lag", "skip", "tré", "land"],
};
/* *minn maður*, *þinn maður*: the possessive before its noun is a style of
   its own; with any other noun it reads as poetry. */
const OWN_HELPER_ONLY = new Set(["minn", "þinn", "sinn"]);

/** The nouns that may stand beside this pronoun in its table, in this gender. */
export function helperChoices(entry, kyn) {
  const g = String(kyn).toLowerCase();
  return entry && OWN_HELPER_ONLY.has(entry.o) ? [HELPER_NOUNS[g]] : MORE_HELPER_NOUNS[g] || [HELPER_NOUNS[g]];
}

/* Pronouns that never take a noun with them. Personal pronouns (pfn) are
   excluded by their word class alone; these are the ones filed under `fn` that
   behave like nouns themselves — they stand *instead of* the noun, not with
   it. */
export const NO_HELPER = new Set([
  "sitthvað",     // *sitthvað barn* is not Icelandic
  "öllsömul",     // stands on its own
  "mestallur",    // *mestallur maður*: it wants a mass or a whole, not a person
  "vor",          // *land vort*: formal, and the noun comes first
]);

/* Pronouns whose noun takes the article: *hinn maðurinn*, *hvor maðurinn*,
   *hvorugur maðurinn*, *sjálfur maðurinn*. "Hinn maður" is not Icelandic. */
export const DEFINITE_HELPER = new Set(["hinn", "hvor", "hvorugur", "sjálfur"]);

/* Pronouns that stand with a countable noun only in the plural: *allir
   menn*, *sumir menn* — but not "allur maður", "sumur maður". In the singular
   they are declined on their own. */
export const HELPER_IN_PLURAL_ONLY = new Set(["allur", "sumur"]);

/* ...and the other way round: *einn maður*, but *einir* goes only with nouns
   that have no singular (*einar buxur*). */
export const HELPER_IN_SINGULAR_ONLY = new Set(["einn"]);

/**
 * Should this word get a helper noun? Pronouns and the article only — nouns,
 * adjectives and verbs have no business here.
 */
export function wantsHelper(entry, num = null) {
  if (!entry) return false;
  if (entry.c === "pfn") return false;             // ég, þú, hann, hún, það (personal)
  if (entry.c === "abfn") return false;            // sig (reflexive)
  /* The free article needs an adjective between it and the noun (*hinn góði
     maður*); "hinn maður" is the pronoun with its article missing. It is
     declined on its own. */
  if (entry.c !== "fn") return false;
  if (num === "ET" && HELPER_IN_PLURAL_ONLY.has(entry.o)) return false;
  if (num === "FT" && HELPER_IN_SINGULAR_ONLY.has(entry.o)) return false;
  return !NO_HELPER.has(entry.o);
}

/**
 * The helper word in a given gender and number, inflected by BÍN. Returns
 * `null` if the word or the mark does not exist — no help is given rather than
 * a guess made.
 */
export function helperForm(lex, kyn, mark, noun = null) {
  const lemma = noun || HELPER_NOUNS[String(kyn).toLowerCase()];
  if (!lemma || !mark) return null;
  const w = lex.lookup(lemma, String(kyn).toLowerCase());
  if (!w) return null;
  const f = w.forms[mark];
  return f && f[0] ? { lemma, form: f[0], entry: w, mark } : null;
}

/* ---------- adjectives -----------------------------------------------------
 *
 * An adjective is not said of everything. Until v6.13 the adjective table put
 * *maður / kona / barn* beside every adjective there is — "ferskustu börnin",
 * "augljós kona", "hálf börn". Now every adjective carries the nouns it is
 * shown with (`h`, written by adj_classes.py: "ávöxtur/appelsína/epli", one
 * per gender, "-" for a gender it is not said of), and an adjective that
 * carries none is shown on its own. Nothing is guessed here: no `h`, no
 * helper. */

const GENDER_INDEX = { kk: 0, kvk: 1, hk: 2 };

/** The helper noun's lemma for this adjective in this gender, or null. */
export function adjectiveHelperLemma(adj, kyn) {
  if (!adj || !adj.h) return null;
  const lemma = String(adj.h).split("/")[GENDER_INDEX[String(kyn).toLowerCase()]];
  return lemma && lemma !== "-" ? lemma : null;
}

/** The genders an adjective table may be asked in: those it has a helper
    noun for (*ólétt kona* only), or all three when it is shown without one. */
export function adjectiveGenders(adj) {
  const all = ["KK", "KVK", "HK"];
  if (!adj || !adj.h) return all;
  const have = all.filter((k) => adjectiveHelperLemma(adj, k));
  return have.length ? have : all;
}

/**
 * The helper noun of an adjective in a given gender and noun mark, inflected
 * by BÍN: `{ lemma, form, entry, mark }`, or null when the adjective has no
 * helper in that gender or the noun lacks the form.
 */
export function adjectiveHelperForm(lex, adj, kyn, mark) {
  const lemma = adjectiveHelperLemma(adj, kyn);
  if (!lemma || !mark) return null;
  const w = lex.lookup(lemma, String(kyn).toLowerCase());
  if (!w) return null;
  const f = w.forms[mark];
  return f && f[0] ? { lemma, form: f[0], entry: w, mark } : null;
}

/**
 * The pronoun and its helper word together in one case: `{ text: "sá maður" }`.
 *
 * `pmark` is the pronoun's mark (e.g. `KK-NFET`); the noun's matching mark is
 * `NFET`. The agreement is not computed here from a rule — it is read out of
 * the mark itself, which is the same mark the question is built on.
 */
export function phrase(lex, entry, pmark, noun = null) {
  const pf = entry.forms?.[pmark];
  if (!pf || !pf[0]) return null;
  const m = /^(KK|KVK|HK)-(NF|ÞF|ÞGF|EF)(ET|FT)$/.exec(pmark);
  if (!m || !wantsHelper(entry, m[3])) return { text: pf[0], pronoun: pf[0], helper: null };
  const h = helperForm(lex, m[1], m[2] + m[3] + (DEFINITE_HELPER.has(entry.o) ? "gr" : ""), noun);
  if (!h) return { text: pf[0], pronoun: pf[0], helper: null };
  return { text: `${pf[0]} ${h.form}`, pronoun: pf[0], helper: h.form, helperLemma: h.lemma };
}

/**
 * All four cases with the helper word — what is shown *after* the child has
 * answered: the question asks about gender and number without showing how the
 * helper changes; the change is shown in the explanation.
 */
export function paradigmWithHelper(lex, entry, kyn, num, noun = null) {
  const out = [];
  for (const c of ["NF", "ÞF", "ÞGF", "EF"]) {
    const pmark = `${kyn}-${c}${num}`;
    const p = phrase(lex, entry, pmark, noun);
    if (p) out.push({ mark: pmark, fall: c, ...p });
  }
  return out;
}
