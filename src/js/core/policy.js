/* What material a particular child may meet.
 *
 * Two layers of the same shape, combined by intersection:
 *
 *     allowed   what the administrator permits   (kept on the server)
 *     chosen    what the child has switched on   (kept with the progress)
 *     effective allowed AND chosen
 *
 * Because it is an intersection, the child's own choices are never edited when
 * the ceiling changes: tighten it in October, loosen it in November, and every
 * child gets back exactly what they had chosen.
 *
 * A missing key means yes, so a blank policy is "everything" and nothing had to
 * be migrated. One exception, on purpose: `allowed.serverGrading`, the
 * administrator's per-pupil switch for server-graded question types, is OFF
 * unless written `true` (docs/adr/0004; see `createPolicy`). Four dimensions: skills, question types, difficulty levels, and
 * inflectional features — the last read off the BÍN mark itself (`featuresOf`),
 * never from a table of which question types involve which cases.
 *
 * Used by the builders in tasks/ (which types, sentences and cells may run),
 * ui/panels.js (the child's switches), ui/account.js (the administrator's)
 * and the server (stores `allowed`). */

import { readMark } from "./marks.js";
import { SKILLS } from "./skills.js";
import { MIN, MAX } from "./difficulty.js";
import { YEARS, presetContent } from "./curriculum.js";
import { CATALOGUE, graderOf } from "./catalogue.js";

/* ---------- the dimensions ---------------------------------------------- */

/**
 * The question types, named for a person rather than by their builder id,
 * in catalogue order. Declared in core/catalogue.js, with everything else
 * about a type; here only what the switches need. `skill` ties each one to
 * the category it belongs to, so the interface can group them the way the
 * child already understands; `grader` says whether it can exist without
 * server grading (`createPolicy`).
 */
export const QUESTION_TYPES = CATALOGUE.map(({ id, nm, skill, ds, grader }) => ({ id, nm, skill, ds, grader }));

export const TYPE_IDS = QUESTION_TYPES.map((t) => t.id);

/**
 * The inflectional features a question can be about.
 *
 * Every key is a piece of a BÍN mark, and `featuresOf` below is the only place
 * that knows how to get from one to the other. `term` is the glossary entry, so
 * the switch in the interface explains itself with the same words the exercises
 * use.
 */
export const ATTRIBUTES = [
  { id: "fall", nm: "Föll", term: "fall", keys: [
    { k: "NF", nm: "nefnifall", term: "nefnifall" },
    { k: "ÞF", nm: "þolfall", term: "tholfall" },
    { k: "ÞGF", nm: "þágufall", term: "thagufall" },
    { k: "EF", nm: "eignarfall", term: "eignarfall" },
  ] },
  { id: "tala", nm: "Tala", term: "tala", keys: [
    { k: "ET", nm: "eintala", term: "eintala" },
    { k: "FT", nm: "fleirtala", term: "fleirtala" },
  ] },
  { id: "greinir", nm: "Greinir", term: "greinir", keys: [
    { k: "MEÐ", nm: "með greini", term: "greinir" },
    { k: "ÁN", nm: "án greinis", term: "greinir" },
  ] },
  { id: "kyn", nm: "Kyn", term: "kyn", keys: [
    { k: "KK", nm: "karlkyn", term: "karlkyn" },
    { k: "KVK", nm: "kvenkyn", term: "kvenkyn" },
    { k: "HK", nm: "hvorugkyn", term: "hvorugkyn" },
  ] },
  { id: "stig", nm: "Stigbreyting", term: "stigbreyting", keys: [
    { k: "FRUM", nm: "frumstig", term: "frumstig" },
    { k: "MID", nm: "miðstig", term: "midstig" },
    { k: "EFST", nm: "efsta stig", term: "efstastig" },
  ] },
  { id: "beyging", nm: "Beyging lýsingarorðs", term: "beyging", keys: [
    { k: "SB", nm: "sterk beyging", term: "sterkbeyging" },
    { k: "VB", nm: "veik beyging", term: "veikbeyging" },
  ] },
  { id: "mynd", nm: "Mynd sagnar", term: "mynd", keys: [
    { k: "GM", nm: "germynd", term: "germynd" },
    { k: "MM", nm: "miðmynd", term: "midmynd" },
  ] },
  { id: "hattur", nm: "Háttur sagnar", term: "hattur", keys: [
    { k: "FH", nm: "framsöguháttur", term: "framsoguhattur" },
    { k: "VH", nm: "viðtengingarháttur", term: "vidtengingarhattur" },
    { k: "BH", nm: "boðháttur", term: "bodhattur" },
    { k: "NH", nm: "nafnháttur", term: "nafnhattur" },
    { k: "LHNT", nm: "lýsingarháttur nútíðar", term: "lhnt" },
    { k: "LHÞT", nm: "lýsingarháttur þátíðar", term: "lhtht" },
    { k: "SAGNB", nm: "sagnbót", term: "sagnbot" },
  ] },
  { id: "tid", nm: "Tíð", term: "tid", keys: [
    { k: "NT", nm: "nútíð", term: "nutid" },
    { k: "ÞT", nm: "þátíð", term: "thatid" },
  ] },
  { id: "persona", nm: "Persóna", term: "persona", keys: [
    { k: "1P", nm: "1. persóna", term: "persona" },
    { k: "2P", nm: "2. persóna", term: "persona" },
    { k: "3P", nm: "3. persóna", term: "persona" },
  ] },
];

export const ATTRIBUTE_IDS = ATTRIBUTES.map((a) => a.id);

export const LEVELS = Array.from({ length: MAX - MIN + 1 }, (_, i) => MIN + i);

/* ---------- a mark, decomposed into policy keys -------------------------- */

const HATTUR_KEY = {
  "framsöguháttur": "FH", "viðtengingarháttur": "VH", "boðháttur": "BH",
  "nafnháttur": "NH", "lýsingarháttur nútíðar": "LHNT",
  "lýsingarháttur þátíðar": "LHÞT", "sagnbót": "SAGNB",
};
const STIG_KEY = { "frumstig": "FRUM", "miðstig": "MID", "efsta stig": "EFST" };
const PERSON_KEY = { "1. persóna": "1P", "2. persóna": "2P", "3. persóna": "3P" };

/**
 * Which policy keys a BÍN mark carries: `{ fall: "ÞGF", tala: "FT", … }`.
 * A mark with no features (a syntax cell, an indeclinable) yields `{}` and is
 * therefore never blocked by an attribute — there is no attribute in it to
 * block.
 */
export function featuresOf(mark) {
  if (!mark || typeof mark !== "string") return {};
  /* Cells that are not inflection at all: "setn:frumlag", "ofl:atviksorð",
     "gerd:aukasetning", "stjórn:hjálpa". They carry no features. */
  if (mark.includes(":")) return {};
  const a = readMark(mark);
  const out = {};
  if (a.fall) out.fall = a.fall === "ÞG" ? "ÞGF" : a.fall;
  if (a.tala) out.tala = a.tala === "eintala" ? "ET" : "FT";
  /* Definiteness is only a feature of a mark that has a case. `readMark`
     reports `greinir: false` for a verb too, and a verb has no article. */
  if (a.fall) out.greinir = a.greinir ? "MEÐ" : "ÁN";
  if (a.kyn) out.kyn = a.kyn.toUpperCase();
  if (a.stig) out.stig = STIG_KEY[a.stig];
  if (a.beyging) out.beyging = a.beyging === "sterk" ? "SB" : "VB";
  if (a.mynd) out.mynd = a.mynd === "germynd" ? "GM" : "MM";
  if (a.háttur) out.hattur = HATTUR_KEY[a.háttur];
  if (a.tíð) out.tid = a.tíð === "nútíð" ? "NT" : "ÞT";
  if (a.persóna) out.persona = PERSON_KEY[a.persóna];
  return out;
}

/* ---------- the policy object -------------------------------------------- */

/** An empty policy: everything permitted, nothing written down. */
export const blankPolicy = () => ({
  skills: {}, types: {}, levels: {}, attrs: {}, safeVocab: null,
});

/** `true` unless somebody has explicitly written `false`. */
const on = (map, key) => !map || map[key] !== false;

/**
 * Merge two layers. A `false` anywhere wins, because "allowed" is a ceiling and
 * "chosen" is a preference underneath it.
 */
function bothOn(a, b, key) {
  return on(a, key) && on(b, key);
}

/**
 * May server-graded question types exist for this pupil? Only with BOTH: a
 * server whose grader is up (`serverGrader`, which the caller knows and this
 * module does not), and the administrator's per-pupil switch written `true`.
 *
 * THE EXCEPTION to this file's rule. Every other key of `allowed` is on
 * unless somebody wrote `false`; this one is OFF unless somebody wrote
 * `true` — missing, null, or any other value is off. It sends a child's
 * writing to an outside grader and costs money, so nobody gets it by not
 * having been asked (docs/adr/0004).
 *
 * @param {?object} allowed  the administrator's ceiling
 * @param {boolean} serverGrader  is a server grader available to this program?
 */
export const serverGradingOn = (allowed, serverGrader) =>
  serverGrader === true && !!allowed && allowed.serverGrading === true;

/**
 * Build the effective policy.
 *
 * @param allowed  the administrator's ceiling (may be null)
 * @param chosen   the child's own switches (may be null)
 * @param opts.serverGrader  is a server grader available (default no). With
 *   it off, or the ceiling's `serverGrading` not `true`, every type whose
 *   catalogue `grader` is "server" is switched off here — and so is invisible
 *   to every caller that asks `type` (sessions, Lota dagsins, duels, live
 *   rounds, the switches).
 */
export function createPolicy(allowed, chosen, { serverGrader = false } = {}) {
  const A = allowed || blankPolicy();
  const C = chosen || blankPolicy();

  const serverGrading = serverGradingOn(A, serverGrader);
  /** May a question judged by this grader appear? */
  const grader = (/** @type {string} */ g) => (g === "server" ? serverGrading : true);
  const skill = (id) => bothOn(A.skills, C.skills, id);
  const type = (id) => bothOn(A.types, C.types, id) && grader(graderOf(id));
  const level = (n) => bothOn(A.levels, C.levels, String(n));
  const attr = (group, key) =>
    bothOn(A.attrs && A.attrs[group], C.attrs && C.attrs[group], key);

  const levelsOn = LEVELS.filter(level);
  /* If every level has been switched off the policy is unusable, and the
     honest answer is to behave as though none had been: a child staring at
     "ekkert efni" because of a stray click has learned nothing about grammar.
     The interface prevents it; this is the belt to that pair of braces. */
  const usableLevels = levelsOn.length ? levelsOn : LEVELS.slice();

  return {
    skill, type, level: (n) => usableLevels.includes(n), attr,
    /** May a word of this class ("nafnorð", "sagnorð" …) be the one a
        question is about? Always yes here; a session on one node of the
        skill map narrows it (`narrowPolicy`, attrs.ofl). */
    wordClass: (/** @type {string} */ _c) => true,
    /** Was the session asked for this feature by name (a node of the skill
        map, a Lesefni page)? Then a builder's "later, at a higher þyngd" rule
        must not hold it back: a pupil who opens "Viðtengingarháttur" gets
        the subjunctive at any þyngd. `key` omitted: any key of the group.
        Never, here; `narrowPolicy` with `attrs` says yes. */
    focus: (/** @type {string} */ _group, /** @type {string} */ _key = undefined) => false,
    levels: usableLevels,
    minLevel: usableLevels[0],
    maxLevel: usableLevels[usableLevels.length - 1],

    /**
     * May a question about this inflection cell be asked?
     * Decomposes the mark and checks every feature in it; a cell with no
     * features (syntax, word class) is always allowed.
     */
    mark(m) {
      const f = featuresOf(m);
      for (const [group, key] of Object.entries(f)) {
        if (key && !attr(group, key)) return false;
      }
      return true;
    },

    /** Every mark in a list allowed — for a beygingartafla, which asks several
        cells at once and must not be built if one of them is switched off. */
    marks(list) {
      return (list || []).every((m) => this.mark(m));
    },

    /** Whether the coarse vocabulary filter is on for this child. The child
        cannot turn it off: it is the administrator's switch alone, which is
        the point of it.

        ON unless an administrator has explicitly written `false` (v6.13,
        item 9). Before v6.13 it was off unless written `true`, and the
        subtitle corpus served *píka* and *tík* to a pupil whose teacher had
        never opened the settings. A saved ceiling carries `safeVocab` only
        when somebody clicked the box (`sanitisePolicy` keeps booleans and
        nothing else, and the editor writes it only on a change), so `null`
        means "never decided" and becomes on, and an administrator who
        unticked it keeps that choice. */
    safeVocab: A.safeVocab !== false,

    /** Server grading for this pupil: see `serverGradingOn`. */
    serverGrading, grader,

    /** For the interface: is this switch the administrator's to explain? */
    allowedBy: {
      skill: (id) => on(A.skills, id),
      type: (id) => on(A.types, id),
      level: (n) => on(A.levels, String(n)),
      attr: (group, key) => on(A.attrs && A.attrs[group], key),
    },
    chosenBy: {
      skill: (id) => on(C.skills, id),
      type: (id) => on(C.types, id),
      level: (n) => on(C.levels, String(n)),
      attr: (group, key) => on(C.attrs && C.attrs[group], key),
    },
  };
}

/**
 * A policy narrowed for one practice session (v6.10): only `skills` (if
 * given) and only `types` (if given), inside what `P` already allows.
 */
export function narrowPolicy(P, { skills = null, types = null, attrs = null } = {}) {
  const S = skills ? new Set(skills) : null;
  const T = types ? new Set(types) : null;
  const out = {
    ...P,
    skill: (id) => (!S || S.has(id)) && P.skill(id),
    type: (id) => (!T || T.has(id)) && P.type(id),
  };
  /* `attrs` (item 41, and the nodes of item 83): { group: [keys] } — only
     these keys of these groups, e.g. { tid: ["ÞT"] } for a session on the
     past tense. `mark` reads the features itself, as the policy's own does,
     so a cell is held to both. */
  const A = attrs && Object.keys(attrs).length
    ? Object.fromEntries(Object.entries(attrs).map(([g, keys]) => [g, new Set(keys)])) : null;
  /* `attrs.ofl` (owner feedback, 6.13): the word classes the question may be
     about, e.g. { ofl: ["nafnorð"] } for "Kyn og tala nafnorða", which is
     asked inside the word-class analysis. Not an inflectional feature, so the
     marks below never see it. */
  if (A && A.ofl) {
    const O = A.ofl;
    out.wordClass = (c) => O.has(c) && P.wordClass(c);
  }
  if (A) {
    out.focus = (group, key = undefined) => !!A[group] && (key === undefined || A[group].has(key));
    out.attr = (group, key) => (!A[group] || A[group].has(key)) && P.attr(group, key);
    out.mark = (m) => P.mark(m) &&
      Object.entries(featuresOf(m)).every(([g, k]) => !k || !A[g] || A[g].has(k));
    out.marks = (list) => (list || []).every((m) => out.mark(m));
  }
  return out;
}

/**
 * The child's own switches with these categories and question types switched
 * ON — for a session the child asked for by name ("Æfa þetta" on a Lesefni
 * page, item 41): reading a page and pressing its button is a clearer choice
 * than a box left unticked in the settings. Only the child's layer: the
 * administrator's ceiling still applies (`createPolicy(allowed, …)`). Levels
 * and attributes stay as the child set them. Pure; returns a new policy.
 */
export function openFor(chosen, { skills = [], types = [] } = {}) {
  const C = chosen || blankPolicy();
  const out = { ...C, skills: { ...(C.skills || {}) }, types: { ...(C.types || {}) } };
  for (const k of skills) out.skills[k] = true;
  for (const k of types) delete out.types[k];
  return out;
}

/* ---------- one switch ---------------------------------------------------- */

/**
 * Write one switch into a layer.
 *
 * Types and levels keep the rule of this file: a missing key means yes, so
 * switching something back on deletes the `false` and a blank policy stays
 * blank. Skills are written out as `true` or `false`. The child's skills live
 * in `S.enabled`, which starts from defaults that say `false` for the
 * categories of later years, and loading a saved state lays the saved keys
 * over those defaults: a deleted key there does not mean yes, it means
 * "whatever the default says". Before v6.13 the editor deleted the key, so a
 * child who switched Setningafræði on found it off again after a reload.
 */
export function setPolicyFlag(policy, dim, key, value) {
  const bag = (policy[dim] ||= {});
  if (dim === "skills") bag[key] = !!value;
  else if (value) delete bag[key];
  else bag[key] = false;
}

/* ---------- the three year presets (item 39) ------------------------------ */

/* What each year switches on is not written here: it is read off the
 * curriculum nodes (core/curriculum.js), so the map in docs/CURRICULUM.md and
 * the buttons cannot drift apart. Only the words are. A test pins what each
 * year adds, so these sentences are revisited when the nodes change. */
const PRESET_TEXT = {
  8: "Fallorð, sagnorð, óbeygjanleg orð, orðflokkagreining, fallstjórn, orðaforði og málbeiting.",
  9: "Allt úr 8. bekk og að auki afturbeygt fornafn, samtengingar, forsetning eða atviksorð, ópersónulegar sagnir, sterkar og veikar sagnir, þolmynd og boðháttur.",
  10: "Allt úr 9. bekk og að auki setningafræði (setningarhlutar og liðir), setningagerðir, tegundir aukasetninga og bein og óbein ræða.",
};

export const PRESETS = YEARS.map((year) => ({
  year, nm: `${year}. bekkur`, ds: PRESET_TEXT[year],
}));

/**
 * The policy a year stands for: every category, question type and level
 * spelt out as on or off. Features (föll, hættir …) are not part of a preset:
 * they are the adult's fine adjustment and a preset leaves them alone.
 *
 * @returns {{ skills, types, levels }} of booleans, or null for an unknown year
 */
export function presetPolicy(year) {
  const c = presetContent(Number(year));
  if (!c) return null;
  const S = new Set(c.skills), T = new Set(c.types);
  return {
    skills: Object.fromEntries(SKILLS.map((s) => [s.id, S.has(s.id)])),
    types: Object.fromEntries(TYPE_IDS.map((t) => [t, T.has(t)])),
    levels: Object.fromEntries(LEVELS.map((n) => [String(n), n <= c.topLevel])),
  };
}

/**
 * Set a layer to a year, in place. Works on either layer and on the view the
 * child's settings hand the editor (whose `skills` is `S.enabled`).
 * `attrs` and `safeVocab` are not touched.
 *
 * @returns the same object, or null (and no change) for an unknown year
 */
export function applyPreset(policy, year) {
  const want = presetPolicy(year);
  if (!want || !policy) return null;
  for (const dim of ["skills", "types", "levels"]) {
    /* Emptied rather than replaced: the child's view shares these objects
       with the saved state, and a new object would be edited and then lost. */
    const bag = (policy[dim] ||= {});
    for (const k of Object.keys(bag)) delete bag[k];
    for (const [k, v] of Object.entries(want[dim])) setPolicyFlag(policy, dim, k, v);
  }
  return policy;
}

/**
 * Which year a layer is set to, or null when the switches match none. A
 * blank layer permits everything and so reads as year 10: that is what an
 * administrator who has restricted nothing has in fact allowed.
 */
export function presetOf(policy) {
  const P = policy || blankPolicy();
  for (const year of YEARS) {
    const want = presetPolicy(year);
    const same = ["skills", "types", "levels"].every((dim) =>
      Object.entries(want[dim]).every(([k, v]) => on(P[dim], k) === v));
    if (same) return year;
  }
  return null;
}

/* ---------- validating what arrives from outside ------------------------- */

const KNOWN = {
  skills: new Set(SKILLS.map((s) => s.id)),
  types: new Set(TYPE_IDS),
  levels: new Set(LEVELS.map(String)),
};

/**
 * Keep only keys the program actually knows, and only booleans.
 *
 * The server stores what an administrator sends; an unknown key would sit in
 * the file for ever and a `"maybe"` would be truthy. This is the one gate, used
 * by the server on the way in and by the interface on the way out, so the two
 * cannot disagree about what a policy is.
 */
export function sanitisePolicy(raw) {
  const out = blankPolicy();
  if (!raw || typeof raw !== "object") return out;
  for (const dim of ["skills", "types", "levels"]) {
    const src = raw[dim];
    if (!src || typeof src !== "object") continue;
    for (const [k, v] of Object.entries(src)) {
      if (KNOWN[dim].has(String(k)) && typeof v === "boolean") out[dim][String(k)] = v;
    }
  }
  const attrs = raw.attrs;
  if (attrs && typeof attrs === "object") {
    for (const group of ATTRIBUTES) {
      const src = attrs[group.id];
      if (!src || typeof src !== "object") continue;
      const keys = new Set(group.keys.map((x) => x.k));
      for (const [k, v] of Object.entries(src)) {
        if (keys.has(k) && typeof v === "boolean") {
          (out.attrs[group.id] ||= {})[k] = v;
        }
      }
    }
  }
  if (typeof raw.safeVocab === "boolean") out.safeVocab = raw.safeVocab;
  /* Kept only as a boolean, and only when present: missing means off
     (`serverGradingOn`), so there is nothing to fill in. */
  if (typeof raw.serverGrading === "boolean") out.serverGrading = raw.serverGrading;
  return out;
}

/**
 * Is there anything left to ask about?
 *
 * A policy that switches off every case, or every skill, produces a program
 * with no questions in it. The interface uses this to refuse the last click
 * rather than letting somebody lock a child out of their own homework.
 */
export function policyProblem(allowed, chosen) {
  const p = createPolicy(allowed, chosen);
  if (!SKILLS.some((s) => p.skill(s.id))) return "Að minnsta kosti einn flokkur verður að vera kveiktur.";
  if (!TYPE_IDS.some((t) => p.type(t))) return "Að minnsta kosti ein tegund spurninga verður að vera kveikt.";
  for (const g of ATTRIBUTES) {
    if (!g.keys.some((x) => p.attr(g.id, x.k)))
      return `Að minnsta kosti eitt atriði verður að vera kveikt undir „${g.nm}“.`;
  }
  return null;
}
