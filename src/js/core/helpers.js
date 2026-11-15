/* Helper nouns alongside pronouns.
 *
 * *sá* on its own is not Icelandic a child has heard; *sá maður* is. One helper
 * noun per gender — maður / kona / barn — inflected from BÍN like everything
 * else; this module only decides WHEN a helper applies and WHICH one. Personal
 * and reflexive pronouns get none (*ég maður* is not anything). */

export const HELPER_NOUNS = { kk: "maður", kvk: "kona", hk: "barn" };

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
export function helperForm(lex, kyn, mark) {
  const lemma = HELPER_NOUNS[String(kyn).toLowerCase()];
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
export function phrase(lex, entry, pmark) {
  const pf = entry.forms?.[pmark];
  if (!pf || !pf[0]) return null;
  const m = /^(KK|KVK|HK)-(NF|ÞF|ÞGF|EF)(ET|FT)$/.exec(pmark);
  if (!m || !wantsHelper(entry, m[3])) return { text: pf[0], pronoun: pf[0], helper: null };
  const h = helperForm(lex, m[1], m[2] + m[3] + (DEFINITE_HELPER.has(entry.o) ? "gr" : ""));
  if (!h) return { text: pf[0], pronoun: pf[0], helper: null };
  return { text: `${pf[0]} ${h.form}`, pronoun: pf[0], helper: h.form, helperLemma: h.lemma };
}

/**
 * All four cases with the helper word — what is shown *after* the child has
 * answered: the question asks about gender and number without showing how the
 * helper changes; the change is shown in the explanation.
 */
export function paradigmWithHelper(lex, entry, kyn, num) {
  const out = [];
  for (const c of ["NF", "ÞF", "ÞGF", "EF"]) {
    const pmark = `${kyn}-${c}${num}`;
    const p = phrase(lex, entry, pmark);
    if (p) out.push({ mark: pmark, fall: c, ...p });
  }
  return out;
}
