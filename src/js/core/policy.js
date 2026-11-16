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
 * be migrated. Four dimensions: skills, question types, difficulty levels, and
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

/* ---------- the dimensions ---------------------------------------------- */

/**
 * The question types, named for a person rather than by their builder id.
 * `skill` ties each one to the category it belongs to, so the interface can
 * group them the way the child already understands.
 */
export const QUESTION_TYPES = [
  { id: "fill",     nm: "Settu orðið í rétt horf",     skill: "nafnord",
    ds: "Nafnorð (og stundum lýsingarorð eða fornafn) sett í eyðu í setningu" },
  { id: "verbslot", nm: "Sögn í setningu",             skill: "sagnord",
    ds: "Sögn sett í eyðu í heilli setningu" },
  { id: "verb",     nm: "Beygðu sögnina",              skill: "sagnord",
    ds: "Sögn beygð eftir persónu, tíð, hætti og mynd" },
  { id: "parse",    nm: "Greindu orðið sem er merkt",  skill: "greining",
    ds: "Orðflokkur og öll beygingaratriði orðs í setningu" },
  { id: "revform",  nm: "Greindu beygðu myndina",      skill: "lysingarord",
    ds: "Beygð mynd greind — í setningu þegar hún er til, annars ein og sér" },
  { id: "govern",   nm: "Hvaða falli stýrir orðið?",   skill: "fallstjorn",
    ds: "Fallstjórn sagna og forsetninga" },
  { id: "indecl",   nm: "Í hvaða orðflokki er orðið?", skill: "obeygjanleg",
    ds: "Óbeygjanleg orð þekkt í setningu" },
  { id: "syntax",   nm: "Smelltu á rétta orðið",       skill: "setningafraedi",
    ds: "Frumlag, umsögn, andlag og sagnfylling fundin í setningu" },
  { id: "clause",   nm: "Hvers konar setning er þetta?", skill: "setningagerd",
    ds: "Aðalsetning, aukasetning og nafnháttarsetning" },
  { id: "tbl_no",   nm: "Beygingartafla — nafnorð",    skill: "nafnord",
    ds: "Öll fjögur föllin í einum dálki" },
  { id: "tbl_lo",   nm: "Beygingartafla — lýsingarorð", skill: "lysingarord",
    ds: "Stigbreyting, sterk og veik beyging" },
  { id: "tbl_so",   nm: "Beygingartafla — sagnorð",    skill: "sagnord",
    ds: "Sögn beygð í öllum persónum" },
  { id: "tbl_fn",   nm: "Beygingartafla — fornöfn",    skill: "fornofn",
    ds: "Fornöfn og greinir beygð" },
  { id: "tbl_to",   nm: "Beygingartafla — töluorð",    skill: "toluord",
    ds: "Frumtölur og raðtölur beygðar" },
  { id: "meaning",  nm: "Hvað þýðir orðið?",           skill: "ordaford",
    ds: "Merking orðs með eigin orðum — í lotu sem valfrjáls bónus" },
  { id: "villur",   nm: "Villuveiðar",                 skill: "malbeiting",
    ds: "Finndu og lagaðu eina eða tvær villur í tveimur setningum: fall og samræmi, og frá þyngd 3 algengar málvillur (mér langar, ég vill)" },
  { id: "smidja",   nm: "Setningasmiðja",              skill: "malbeiting",
    ds: "Búðu til setningu úr orðum í orðabókarmynd og beygðu hvert orð" },
  { id: "umritun",  nm: "Umritun",                     skill: "malbeiting",
    ds: "Settu setningu í þátíð, fleirtölu eða þolmynd, eða byrjaðu hana á Í gær / Á morgun" },
  /* v6.11 */
  { id: "no_val",     nm: "Veldu rétt fall",            skill: "nafnord",
    ds: "Nafnorð í setningu: valið milli falla" },
  { id: "lo_beyging", nm: "Sterk eða veik beyging",     skill: "lysingarord",
    ds: "Lýsingarorð skrifað í eyðu, með eða án greinis" },
  { id: "lo_stig",    nm: "Stigbreyting í setningu",    skill: "lysingarord",
    ds: "Miðstig og efsta stig skrifað í eyðu" },
  { id: "lo_samr",    nm: "Samræmi lýsingarorðs",       skill: "lysingarord",
    ds: "Lýsingarorð lagað að nafnorði eða frumlagi" },
  { id: "fn_eyda",    nm: "Fornafn í eyðu",             skill: "fornofn",
    ds: "Persónufornafn í réttu falli: Ég gaf ___ (hún) bókina" },
  { id: "fn_stad",    nm: "Fornafn í stað nafnorðs",    skill: "fornofn",
    ds: "Nafnorð í setningu leyst af hólmi með persónufornafni" },
  { id: "fn_aftur",   nm: "Afturbeygt eða ekki",        skill: "fornofn",
    ds: "sér eða honum, sína eða hans — merkingin ræður" },
  { id: "to_samr",    nm: "Töluorð í eyðu",             skill: "toluord",
    ds: "Frumtala 1–4 löguð að nafnorði: Ég á ___ (2) systur" },
  { id: "to_val",     nm: "Veldu mynd töluorðs",        skill: "toluord",
    ds: "Valið milli mynda af tveir, þrír, fjórir" },
  { id: "to_dags",    nm: "Dagsetningar",               skill: "toluord",
    ds: "Raðtölur í dagsetningum: ___ (3.) maí" },
  { id: "to_flt",     nm: "Töluorð með fleirtöluorðum", skill: "toluord",
    ds: "tvennar buxur, þrenn skæri" },
  { id: "ob_smella",  nm: "Smelltu á orðin",            skill: "obeygjanleg",
    ds: "Öll atviksorð, forsetningar eða samtengingar í setningu" },
  { id: "ob_fsao",    nm: "Forsetning eða atviksorð",   skill: "obeygjanleg",
    ds: "Sama orð, ólíkt hlutverk: hljóp upp stigann / leit upp" },
  { id: "ob_st",      nm: "Veldu samtenginguna",        skill: "obeygjanleg",
    ds: "hvort eða ef, sem, né, þótt …" },
  { id: "ob_flokka",  nm: "Flokkaðu óbeygjanleg orð",   skill: "obeygjanleg",
    ds: "Orð úr setningu sett í orðflokk" },
  { id: "gr_smella",  nm: "Smelltu á orðflokkinn",      skill: "greining",
    ds: "Öll nafnorð, sagnir, lýsingarorð … í setningu" },
  { id: "gr_flokka",  nm: "Flokkaðu orðin",             skill: "greining",
    ds: "Orð í orðabókarmynd sett í orðflokk" },
  { id: "fs_fsno",    nm: "Forsetning + nafnorð",       skill: "fallstjorn",
    ds: "Nafnorð í réttu falli á eftir forsetningu" },
  { id: "fs_hreyf",   nm: "Hreyfing eða kyrrstaða",     skill: "fallstjorn",
    ds: "í/á með þolfalli eða þágufalli: á borðið / á borðinu" },
  { id: "fs_sogn",    nm: "Sögn stýrir falli",          skill: "fallstjorn",
    ds: "hjálpa, sakna, bíða … með nafnorði í réttu falli" },
  { id: "fs_operson", nm: "Ópersónulegar sagnir",       skill: "fallstjorn",
    ds: "Mig langar, mér finnst — og ég hlakka til" },
  { id: "or_heiti",   nm: "Samheiti og andheiti",       skill: "ordaford",
    ds: "Orð sem merkir það sama eða hið gagnstæða" },
  { id: "or_samhengi", nm: "Orð í samhengi",            skill: "ordaford",
    ds: "Veldu orðið sem passar í setninguna" },
  { id: "or_myndun",  nm: "Orðmyndun",                  skill: "ordaford",
    ds: "ó-, -ari, -ing, -un" },
  { id: "or_utundan", nm: "Hvert á ekki heima?",        skill: "ordaford",
    ds: "Fjögur orð, eitt sker sig úr" },
  { id: "setn_hlut",  nm: "Hvaða setningarhluti?",      skill: "setningafraedi",
    ds: "Hlutverk undirstrikaðs orðs" },
  { id: "setn_flokka", nm: "Flokkaðu setningarhluta",   skill: "setningafraedi",
    ds: "Frumlag, umsögn, andlag, sagnfylling" },
  { id: "gerd_finna", nm: "Finndu aukasetninguna",      skill: "setningagerd",
    ds: "Smelltu á öll orð aukasetningar eða nafnháttarsetningar" },
  { id: "gerd_upphaf", nm: "Hvar hefst setningin?",     skill: "setningagerd",
    ds: "Fyrsta orð aukasetningar" },
  /* item 27 */
  { id: "fn_flokkar", nm: "Hvers konar fornafn?",       skill: "fornofn",
    ds: "Persónu-, afturbeygt, eignar-, ábendingar-, spurnar- eða óákveðið fornafn í setningu" },
  { id: "no_beyging", nm: "Sterkt eða veikt nafnorð",   skill: "nafnord",
    ds: "Sterk eða veik beyging af eignarfalli eintölu: til hests, til pabba. Frá þyngd 5 er eignarfallið skrifað" },
  { id: "so_beyging", nm: "Sterk eða veik sögn?",      skill: "sagnord",
    ds: "Sterk eða veik sögn eftir þátíðinni: í gær kallaði ég, í gær tók ég. Frá þyngd 3 er þátíðin skrifuð, frá þyngd 5 kennimyndirnar" },
  { id: "so_mynd",   nm: "Germynd, miðmynd eða þolmynd?", skill: "sagnord",
    ds: "Mynd sagnar í setningu: hittust, var byggt — og þú lest, sem er germynd þótt það endi á -st" },
  { id: "so_bodhattur", nm: "Boðháttur",               skill: "sagnord",
    ds: "Boðháttur skrifaður: komdu, lestu, farðu — og frá þyngd 3 fleirtalan: komið" },
  /* item 28: years 9 and 10 */
  { id: "gerd_tegund", nm: "Hvers konar aukasetning?", skill: "setningagerd",
    ds: "Fall-, tilvísunar- eða atvikssetning; frá þyngd 4 skýringar-, spurnar-, tíðar-, skilyrðis-, orsakar- og viðurkenningarsetning; frá þyngd 6 líka tilgangs- og afleiðingarsetning" },
  { id: "setn_lidir", nm: "Hvers konar liður?",         skill: "setningafraedi",
    ds: "Nafnliður, sagnliður eða forsetningarliður í setningu; frá þyngd 3 líka atviksliður" },
  { id: "lid_finna", nm: "Finndu forsetningarliðinn",   skill: "setningafraedi",
    ds: "Smelltu á öll orð forsetningarliðar; frá þyngd 4 geta þeir verið tveir" },
  { id: "raeda", nm: "Bein og óbein ræða",              skill: "malbeiting",
    ds: "Settu orð annarra í óbeina ræðu: Hún sagði að hún væri þreytt. Frá þyngd 4 er beina ræðan í þátíð: hefði farið" },
];

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
 * Build the effective policy.
 *
 * @param allowed  the administrator's ceiling (may be null)
 * @param chosen   the child's own switches (may be null)
 */
export function createPolicy(allowed, chosen) {
  const A = allowed || blankPolicy();
  const C = chosen || blankPolicy();

  const skill = (id) => bothOn(A.skills, C.skills, id);
  const type = (id) => bothOn(A.types, C.types, id);
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
export function narrowPolicy(P, { skills = null, types = null } = {}) {
  const S = skills ? new Set(skills) : null;
  const T = types ? new Set(types) : null;
  return {
    ...P,
    skill: (id) => (!S || S.has(id)) && P.skill(id),
    type: (id) => (!T || T.has(id)) && P.type(id),
  };
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
