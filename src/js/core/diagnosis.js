/* Error diagnosis (v6.10).

   A wrong answer says that something went wrong; this module says WHAT. It
   reads the answer against the question and sorts the miss into one of a
   couple of dozen patterns that Icelandic teachers recognise — the accusative
   and dative swapped, the genitive avoided, an adjective that does not agree,
   a strong verb given a weak past (*hlaupaði*), a forgotten vowel change
   (*bókur*), a preposition taken for an adverb, the verb not in second place
   after *Í gær* …

   For every pattern it keeps two numbers and a short history: how often the
   child has had the CHANCE to make the error (a question that tests it) and
   how often they made it. The rate, not the count, is what the summary of a
   session reports, and what decides which patterns are "active". Active
   patterns are fed back into the choice of questions (app.js `pickTask`):
   a question that tests one of them is preferred, so what goes wrong comes
   back until it stops going wrong.

   Nothing the child typed is stored. The state keeps counts, a string of
   hits and misses, and — as examples — the word, the cell that was asked for
   and the cell that was given: all of them BÍN marks. The words the child
   wrote are shown in the session summary and then forgotten.

   Pure: no DOM, no clock except through arguments.                         */

import { readMark } from "./marks.js";
import { normalise, stripAccents } from "./grading.js";

/* ---------- the patterns ------------------------------------------------- */

/*  id        stable key in the state
 *  nm        the name the child sees
 *  ok        the same thing said as a skill, for praise ("Rétt í öllu um …")
 *  rule      the one thing to remember (markdown-light, as `fmt` reads it)
 *  lesson    the Lesefni page that teaches it
 *  tags      which questions test it (see `tagsOf`)
 *  types     question types a session aimed at it is drawn from
 *  hunt      the Villuveiðar error kind that exercises it, if any            */
const CASE_TYPES = ["fill", "govern", "parse", "revform", "tbl_no", "villur", "smidja",
  "no_val", "fs_fsno", "fs_sogn", "fs_hreyf", "fn_eyda", "to_samr", "to_dags"];
const FORM_TYPES = ["fill", "verb", "verbslot", "tbl_no", "tbl_lo", "tbl_so", "tbl_fn", "smidja",
  "fn_eyda", "to_samr", "to_dags", "fs_sogn", "lo_beyging", "lo_stig", "lo_samr"];

export const PATTERNS = [
  { id: "thf_thgf", ok: "þolfall og þágufall", nm: "Þolfall og þágufall ruglast",
    rule: "Spurðu þig: *um hvern?* → **þolfall**, *frá hverjum?* → **þágufall**. *Um, gegnum, kringum* stýra þolfalli; *frá, af, hjá, úr, að* stýra þágufalli.",
    lesson: "foll", tags: ["case:ÞF", "case:ÞGF"], types: CASE_TYPES, hunt: "fall" },
  { id: "ef", ok: "eignarfall", nm: "Eignarfallið forðast",
    rule: "Spurðu þig: *til hvers?* → **eignarfall**. Það kemur á eftir *til, án, vegna, milli, meðal* og sögnum eins og *sakna, leita, njóta* — ekki skipta því út fyrir þágufall.",
    lesson: "foll", tags: ["case:EF"], types: CASE_TYPES, hunt: "fall" },
  { id: "nf_aukafall", ok: "að beygja orðið í rétt fall", nm: "Nefnifall þar sem á að beygja",
    rule: "Orðið á spjaldinu eða í orðabókinni stendur í **nefnifalli**. Í setningunni ræður sögnin eða forsetningin fallinu — beygðu orðið áður en þú skrifar það.",
    lesson: "foll", tags: ["case:ÞF", "case:ÞGF", "case:EF"], types: CASE_TYPES, hunt: "fall" },
  { id: "fall_annad", ok: "föllin", nm: "Önnur fallavilla",
    rule: "Finndu fyrst hvað stýrir fallinu: forsetning, sögn eða hlutverk orðsins (frumlag er oftast í nefnifalli). Prófaðu svo *hestur – um hest – frá hesti – til hests*.",
    lesson: "foll", tags: ["case:NF", "case:ÞF", "case:ÞGF", "case:EF"], types: CASE_TYPES, hunt: "fall" },
  { id: "fallstjorn_fs", ok: "fallstjórn forsetninga", nm: "Fallstjórn forsetninga",
    rule: "Hver forsetning stýrir sínu falli: *um* þolfalli, *frá* þágufalli, *til* eignarfalli. Aðeins *í, á, undir, yfir, með, eftir, fyrir* geta stýrt tveimur.",
    lesson: "fallstjorn", tags: ["gov:fs"], types: ["govern", "villur", "fill", "fs_fsno", "fs_hreyf"], hunt: "fall" },
  { id: "fallstjorn_so", ok: "fallstjórn sagna", nm: "Fallstjórn sagna",
    rule: "Sögnin velur fall andlagsins: *sjá hest* (þf.), *hjálpa hesti* (þgf.), *sakna hests* (ef.). Prófaðu sögnina með *mig – mér – mín*.",
    lesson: "fallstjorn", tags: ["gov:so"], types: ["govern", "villur", "fs_sogn"], hunt: "fall" },
  { id: "tala", ok: "eintölu og fleirtölu", nm: "Eintala og fleirtala",
    rule: "Gáðu að tölunni áður en þú beygir: beygingarkortið, spjaldið eða setningin segir hvort orðið er í **eintölu** eða **fleirtölu**.",
    lesson: "kyn-tala", tags: ["num"], types: ["fill", "parse", "revform", "tbl_no", "smidja"] },
  { id: "greinir", ok: "greininn", nm: "Greinir gleymist eða bætist við",
    rule: "Lestu hvort orðið á að vera **með greini** (*hesturinn*) eða **án greinis** (*hestur*). Greinirinn beygist líka: *hestinum, hestanna*.",
    lesson: "greinir", tags: ["noun"], types: ["fill", "parse", "revform", "tbl_no"] },
  { id: "kyn", ok: "kyn nafnorða", nm: "Kyn nafnorða",
    rule: "Settu orðið á eftir *hann, hún, það* — eða *einn, ein, eitt*: *einn hestur, ein bók, eitt barn*.",
    lesson: "kyn-tala", tags: ["kyn"], types: ["parse", "revform"] },
  { id: "kyn_samraemi", ok: "samræmi í kyni", nm: "Samræmi í kyni",
    rule: "Lýsingarorð og fornöfn taka kyn, tölu og fall nafnorðsins sem þau standa með: *góður maður, góð kona, gott barn* — *gamalli konu, gömlum konum*.",
    lesson: "samraemi", tags: ["agree:kyn"], types: ["fill", "tbl_lo", "tbl_fn", "villur", "smidja", "lo_samr", "to_samr", "fn_stad"], hunt: "samræmi" },
  { id: "beyging_lo", ok: "sterka og veika beygingu", nm: "Sterk og veik beyging lýsingarorða",
    rule: "**Veik** beyging kemur á eftir greini eða ábendingarfornafni: *góði maðurinn, þessi góði maður*. Annars **sterk**: *góður maður*.",
    lesson: "lo-beyging", tags: ["adj"], types: ["tbl_lo", "parse", "revform", "lo_beyging"] },
  { id: "stig", ok: "stigbreytingu", nm: "Stigbreyting",
    rule: "**Frumstig** lýsir (*stór*), **miðstig** ber saman tvennt (*stærri en*), **efsta stig** er mest af öllum (*stærstur*).",
    lesson: "stigbreyting", tags: ["adj"], types: ["tbl_lo", "parse", "revform", "lo_stig"] },
  { id: "sogn_frumlag", ok: "persónu og tölu sagna", nm: "Persóna og tala sagnar",
    rule: "Finndu frumlagið fyrst. Sögnin lagar sig að því í persónu og tölu: *ég fer, við förum, kennarinn segir, kennararnir segja*.",
    lesson: "persona-tala", tags: ["verb:agree"], types: ["verb", "verbslot", "tbl_so", "villur", "umritun", "smidja"], hunt: "sögn" },
  { id: "tid", ok: "tíð sagna", nm: "Tíð sagnar",
    rule: "Lestu hvaða tíð er beðið um. **Nútíð**: *ég fer*. **Þátíð**: *ég fór*. Í gær → þátíð; á morgun → oftast nútíð.",
    lesson: "tid", tags: ["verb:tense"], types: ["verb", "verbslot", "tbl_so", "umritun"] },
  { id: "hattur", ok: "hætti sagna", nm: "Framsöguháttur og viðtengingarháttur",
    rule: "**Viðtengingarháttur** lýsir því sem er óvisst, ósk eða skilyrði: *ef ég væri, hún sagði að hann kæmi*. **Framsöguháttur** segir frá: *ég er, hann kom*.",
    lesson: "hattur", tags: ["verb:vh"], types: ["verb", "verbslot", "parse", "revform"] },
  { id: "mynd", ok: "germynd og miðmynd", nm: "Germynd og miðmynd",
    rule: "**Miðmynd** endar á *-st*: *hlakka – hlakkast*, *klæða – klæðast*, *gleðja – gleðjast*. Germynd hefur enga -st endingu.",
    lesson: "mynd", tags: ["verb:mm"], types: ["verb", "verbslot", "parse", "revform"] },
  { id: "sterk_veik_sogn", ok: "þátíð sterkra sagna", nm: "Sterk sögn beygð eins og veik",
    rule: "Sterkar sagnir fá **enga** endingu -aði, -ði eða -ti í þátíð; þær skipta um sérhljóð: *bíta – beit*, *hlaupa – hljóp*, *gefa – gaf*. Lærðu kennimyndirnar.",
    lesson: "sterkar-veikar", tags: ["verb:strongpast"], types: ["verb", "verbslot", "tbl_so"] },
  { id: "hljodvarp", ok: "sérhljóðabreytingar", nm: "Sérhljóð breytist í stofni",
    rule: "Mörg orð skipta um sérhljóð í beygingu: *bók – bækur, fjörður – firði, barn – börn, taka – tók*. Gáðu að stofninum, ekki bara endingunni.",
    lesson: "nafnord-beyging", tags: ["form"], types: FORM_TYPES },
  { id: "ending", ok: "endingar", nm: "Röng ending",
    rule: "Kennimyndirnar segja til um beyginguna: nefnifall og eignarfall eintölu og nefnifall fleirtölu (*hestur – hests – hestar*, *saga – sögu – sögur*).",
    lesson: "nafnord-beyging", tags: ["form"], types: FORM_TYPES },
  { id: "broddar", ok: "brodda", nm: "Broddar",
    rule: "*á, é, í, ó, ú, ý* eru sérstakir stafir, ekki skraut. Lestu svarið yfir áður en þú sendir það.",
    lesson: null, tags: ["form"], types: FORM_TYPES },
  { id: "stafsetning", ok: "stafsetningu", nm: "Stafsetning",
    rule: "Einn stafur var rangur, of mikið eða vantaði — í stofninum, ekki í endingunni (*villtuð*, ekki *viltuð*). Beygingin var rétt; lestu svarið yfir áður en þú sendir það.",
    lesson: null, tags: ["form"], types: FORM_TYPES },
  { id: "ordflokkur", ok: "orðflokka", nm: "Orðflokkar ruglast",
    rule: "Spurðu hvað orðið gerir: nafnorð nefnir, lýsingarorð lýsir og stigbreytist, sögn segir hvað gerist, fornafn kemur í stað nafnorðs.",
    lesson: "ordflokkar", tags: ["ofl"], types: ["parse", "indecl", "gr_smella", "gr_flokka", "ob_smella", "ob_flokka"] },
  { id: "ao_fs", ok: "atviksorð og forsetningar", nm: "Atviksorð eða forsetning",
    rule: "**Forsetning** stendur með fallorði og stýrir falli þess: *í húsinu*. **Atviksorð** stendur eitt og stýrir engu: *hann fór inn*.",
    lesson: "obeygjanleg", tags: ["ofl:ao_fs"], types: ["indecl", "parse", "ob_fsao", "ob_smella", "ob_flokka"] },
  { id: "setningalidir", ok: "setningarhluta", nm: "Frumlag, andlag og umsögn",
    rule: "Finndu sögnina (umsögnina) fyrst. Spurðu svo *hver/hvað gerir?* → frumlag, og *hvern/hvað?* → andlag.",
    lesson: "setningalidir", tags: ["syn"], types: ["syntax", "setn_hlut", "setn_flokka"] },
  { id: "setningagerd", ok: "setningagerðir", nm: "Setningagerðir",
    rule: "Aðalsetning getur staðið ein. Aukasetning hefst oftast á samtengingu (*að, sem, þegar, ef*) og er liður í annarri setningu.",
    lesson: "setningagerdir", tags: ["clause"], types: ["clause", "gerd_finna", "gerd_upphaf"] },
  { id: "v2", ok: "orðaröð: sögnin í öðru sæti", nm: "Sögnin í öðru sæti",
    rule: "Í íslenskri aðalsetningu er sögnin alltaf **annar liður**: *Í gær **fór** ég* — ekki *Í gær ég fór*.",
    lesson: "malbeiting", tags: ["v2"], types: ["umritun"] },
  { id: "tholmynd", ok: "þolmynd", nm: "Þolmynd",
    rule: "Andlagið verður frumlag, *vera* tekur tíðina og lýsingarhátturinn lagar sig að nýja frumlaginu: *Amma bakaði kökuna* → *Kakan var bökuð*.",
    lesson: "malbeiting", tags: ["passive"], types: ["umritun"] },
  { id: "ofleidretting", ok: "að láta rétt orð í friði", nm: "Rétt orðum breytt",
    rule: "Lestu setninguna fyrst í heild. Breyttu aðeins orði sem þú getur sagt **hvers vegna** er rangt.",
    lesson: "malbeiting", tags: ["hunt"], types: ["villur"] },
  /* v6.11 */
  { id: "afturbeyging", ok: "afturbeygð fornöfn", nm: "Afturbeygt fornafn eða persónufornafn",
    rule: "*Sig, sér, sín* og *sinn* vísa aftur til **frumlagsins** í sömu setningu: *Jón þvoði sér* (sjálfum sér), *Anna tók töskuna sína* (sína eigin). *Honum, hans, hennar* vísa til **einhvers annars**.",
    lesson: "fornofn", tags: ["reflex"], types: ["fn_aftur"] },
  { id: "fleirtoluord", ok: "töluorð með fleirtöluorðum", nm: "Töluorð með fleirtöluorðum",
    rule: "Orð sem eru aðeins til í fleirtölu (*buxur, skæri, gleraugu, tónleikar, dyr*) taka **einir, tvennir, þrennir, fernir**: *tvennar buxur*, ekki *tvær buxur*.",
    lesson: "toluord", tags: ["plnum"], types: ["to_flt"] },
  { id: "hreyfing", ok: "hreyfingu og kyrrstöðu", nm: "Hreyfing eða kyrrstaða (í, á)",
    rule: "*Í, á, undir, yfir*: **hreyfing** á stað (hvert?) → **þolfall**: *Ég lagði bókina á borðið*. **Kyrrstaða** (hvar?) → **þágufall**: *Bókin liggur á borðinu*.",
    lesson: "fallstjorn", tags: ["motion"], types: ["fs_hreyf", "govern"] },
  { id: "opersonuleg", ok: "ópersónulegar sagnir", nm: "Frumlag ópersónulegra sagna",
    rule: "Sumar sagnir vilja frumlag í **þolfalli** (*mig langar, mig vantar, mig dreymdi*) eða **þágufalli** (*mér finnst, mér líður vel, mér er kalt*). En *ég hlakka til* og *ég kvíði fyrir* — þar er nefnifall.",
    lesson: "fallstjorn", tags: ["impers"], types: ["fs_operson"] },
  { id: "samtengingar", ok: "samtengingar", nm: "Samtengingar",
    rule: "Óbein spurning hefst á *hvort* (ekki *ef*): *Ég veit ekki hvort hún kemur*. *Hvorki … né*, *annaðhvort … eða*, *bæði … og*. Á eftir miðstigi kemur *en*.",
    lesson: "obeygjanleg", tags: ["conj"], types: ["ob_st"] },
  { id: "merking", ok: "merkingu orða", nm: "Merking orða",
    rule: "Lestu alla setninguna og spurðu: hvað passar við merkinguna? Ef þú ert ekki viss, flettu orðinu upp — 📖 hnappurinn er við hverja spurningu.",
    lesson: "ordafordi", tags: ["vocab"], types: ["or_heiti", "or_samhengi", "or_utundan"] },
  { id: "ordmyndun", ok: "orðmyndun", nm: "Orðmyndun",
    rule: "Forskeyti og viðskeyti breyta orðum: *ó-* snýr merkingunni við (*heppinn – óheppinn*), *-ari* er sá sem gerir (*kenna – kennari*), *-ing/-un* gera nafnorð úr sögn (*æfa – æfing*).",
    lesson: "ordafordi", tags: ["wordform"], types: ["or_myndun"] },
];

const BY_ID = new Map(PATTERNS.map((p) => [p.id, p]));
export const patternById = (id) => BY_ID.get(id) || null;

/* ---------- what a question tests ---------------------------------------- */

const caseKey = (f) => (f === "ÞG" ? "ÞGF" : f);
const AO_FS = new Set(["atviksorð", "forsetning"]);

/** The tags of a question: what it gives the child a chance to get wrong. */
export function tagsOf(t) {
  const tags = new Set();
  if (!t) return tags;
  const addMark = (m) => {
    if (!m || typeof m !== "string" || m.includes(":")) return;
    const a = readMark(m);
    if (a.fall) tags.add("case:" + caseKey(a.fall));
    if (a.tala) tags.add("num");
    if (a.fall && !a.kyn && !a.beyging && !a.stig) tags.add("noun");
    if (a.kyn && a.fall) tags.add("agree:kyn");
    if (a.beyging || a.stig) tags.add("adj");
    if (a.tíð) tags.add("verb:tense");
    if (a.háttur === "viðtengingarháttur") tags.add("verb:vh");
    if (a.mynd === "miðmynd") tags.add("verb:mm");
    if (a.persóna) tags.add("verb:agree");
  };
  switch (t.type) {
    case "fill":
      addMark(t.m); tags.add("form");
      if (t.extra) tags.add("agree:kyn");
      break;
    case "verb": case "verbslot":
      addMark(t.m); tags.add("form");
      if (t.conj === "sterk" && readMark(t.m).tíð === "þátíð") tags.add("verb:strongpast");
      break;
    case "table":
      (t.cells || []).forEach((c) => addMark(c.m)); tags.add("form");
      if (t.kind === "no") tags.delete("agree:kyn");
      if (t.kind === "so" && t.conj === "sterk" && (t.cells || []).some((c) => /ÞT/.test(c.m))) tags.add("verb:strongpast");
      break;
    case "parse": {
      addMark(t.t && t.t.m);
      tags.delete("agree:kyn");
      tags.add("ofl");
      if (t.t && AO_FS.has(t.t.c)) tags.add("ofl:ao_fs");
      if (t.a && t.a.kyn && t.t && t.t.c === "nafnorð") tags.add("kyn");
      break;
    }
    case "govern":
      tags.add(t.t && t.t.c === "sagnorð" ? "gov:so" : "gov:fs");
      if (t.fall) tags.add("case:" + caseKey(t.fall));
      break;
    case "indecl":
      tags.add("ofl");
      if (AO_FS.has(t.answer)) tags.add("ofl:ao_fs");
      break;
    case "syntax": tags.add("syn"); break;
    /* v6.11 shapes (tasks/more.js): the mark, if the question has one, and
       the tags the builder gives. A pronoun has no article to forget. */
    case "gap": case "choice":
      if (t.m) addMark(t.m);
      if (t.skill === "fornofn" || t.skill === "toluord") tags.delete("noun");
      if (t.type === "gap" && t.paradigm) tags.add("form");
      (t.tags || []).forEach((x) => tags.add(x));
      break;
    case "tap": case "sort":
      (t.tags || []).forEach((x) => tags.add(x));
      break;
    case "clause": tags.add("clause"); break;
    case "villur":
      tags.add("hunt");
      huntErrors(t).forEach((e) => {
        if (e.kind === "fall") {
          const a = readMark(e.m);
          if (a.fall) tags.add("case:" + caseKey(a.fall));
          tags.add(e.gov === "so" ? "gov:so" : "gov:fs");
        } else if (e.kind === "samræmi") tags.add("agree:kyn");
        else if (e.kind === "sögn") tags.add("verb:agree");
      });
      break;
    case "smidja":
      (t.cards || []).forEach((c) => { if (!c.fixed) addMark(c.m); });
      tags.add("form");
      break;
    case "umritun":
      if (t.kind === "past") tags.add("verb:tense");
      if (t.kind === "plural") { tags.add("verb:agree"); tags.add("num"); }
      if (t.kind === "passive") tags.add("passive");
      if (t.kind === "igaer" || t.kind === "amorgun") { tags.add("v2"); tags.add("verb:tense"); }
      break;
    default: break;
  }
  return tags;
}

const huntErrors = (t) => (t && t.hunt ? t.hunt.lines.flatMap((l) => l.toks.filter((x) => x.err).map((x) => x.err)) : []);

/** The patterns a question gives a chance to get wrong. */
export function chancesIn(task) {
  const tags = tagsOf(task);
  return PATTERNS.filter((p) => p.tags.some((x) => tags.has(x))).map((p) => p.id);
}

/** Does this question test any of these patterns? */
export const targets = (task, ids) => {
  if (!ids || !ids.length) return false;
  const c = new Set(chancesIn(task));
  return ids.some((id) => c.has(id));
};

/* ---------- reading one answer ------------------------------------------- */

/** Which pattern a case mix-up belongs to. Cases as NF/ÞF/ÞGF/EF (or ÞG). */
export function casePattern(right, given) {
  const r = caseKey(right), g = caseKey(given);
  if (!r || !g || r === g) return null;
  if ((r === "ÞF" && g === "ÞGF") || (r === "ÞGF" && g === "ÞF")) return "thf_thgf";
  if (r === "EF") return "ef";
  if (g === "NF") return "nf_aukafall";
  return "fall_annad";
}

const FEATURES = ["fall", "kyn", "persóna", "tala", "greinir", "beyging", "stig", "tíð", "háttur", "mynd"];

/** The features in which two marks differ. */
export function markDiff(target, other) {
  const a = readMark(target), b = readMark(other);
  return FEATURES.filter((f) => (a[f] ?? null) !== (b[f] ?? null));
}

/** Patterns for "they wrote another cell of the same word". */
export function patternsForCells(target, others) {
  if (!target || !others || !others.length) return [];
  /* A form usually belongs to several cells; the nearest reading is the one
     the child most likely meant. */
  const best = others.map((m) => ({ m, d: markDiff(target, m) }))
    .filter((x) => x.d.length).sort((x, y) => x.d.length - y.d.length)[0];
  if (!best) return [];
  const a = readMark(target), b = readMark(best.m);
  const out = [];
  for (const f of best.d) {
    if (f === "fall") out.push(casePattern(a.fall, b.fall));
    else if (f === "kyn") out.push(a.fall ? "kyn_samraemi" : null);
    else if (f === "persóna") out.push("sogn_frumlag");
    else if (f === "tala") out.push(a.persóna ? "sogn_frumlag" : "tala");
    else if (f === "greinir") out.push("greinir");
    /* Strong/weak declension is an adjective's (or a participle's used as
       one): not "sofin" for "sváfu", where the target does not decline. */
    else if (f === "beyging") out.push(a.fall ? "beyging_lo" : null);
    else if (f === "stig") out.push("stig");
    else if (f === "tíð") out.push("tid");
    else if (f === "háttur") out.push("hattur");
    else if (f === "mynd") out.push("mynd");
  }
  return [...new Set(out.filter(Boolean))].slice(0, 2).map((p) => ({ p, other: best.m }));
}

const VOWELS = /[aáeéiíoóuúyýæö]/g;
const WEAK_PAST = /(aði|aðir|uðu|uð|aðist|uðust|ði|ðir|ðu|ðist|ðust|di|dir|du|dist|dust|ti|tir|tu|tist|tust)$/;

const commonPrefix = (a, b) => { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i; };

/** The word in what was typed that is nearest the right form. */
function nearest(typed, right) {
  const toks = normalise(typed).split(" ").filter(Boolean);
  if (!toks.length) return null;
  const r = normalise(right).split(" ").pop();
  return toks.map((w) => ({ w, p: commonPrefix(w, r) }))
    .sort((x, y) => y.p - x.p)[0].w;
}

/**
 * Patterns for a form that is not in the word's paradigm at all.
 * `conj` is "sterk" | "veik" | … for a verb, when the builder knows.
 */
export function patternsForForm(typed, accepted, target, conj = null) {
  const right = normalise([].concat(accepted || [])[0] || "");
  if (!right) return [];
  const w = nearest(typed, right);
  if (!w) return [];
  const r = right.split(" ").pop();
  if (w === r) return [];
  const a = readMark(target || "");
  if (conj === "sterk" && a.tíð === "þátíð" && WEAK_PAST.test(w) && !WEAK_PAST.test(r)) return ["sterk_veik_sogn"];
  const skel = (x) => x.replace(VOWELS, "");
  const first = commonPrefix(w, r);
  if (skel(w) === skel(r) && first < Math.max(2, r.length - 3)) return ["hljodvarp"];
  if (first >= 2 && r.length - first <= 5 && Math.abs(w.length - r.length) <= 4) return ["ending"];
  return [];
}

const VOWEL1 = /^[aáeéiíoóuúyýæö]$/;
/**
 * A spelling slip, not an inflection error (v6.12): one letter too many, too
 * few or wrong, or two swapped — a consonant, inside the word, with the last
 * letter right. *viltuð* for *villtuð* and *færi* for *fæði* are the word
 * inflected right and spelt wrong; calling them "Röng ending" was wrong.
 * A vowel is not a slip (*hestir*, *bókur* are inflection), and neither is
 * the end of the word (*kennara* for *kennarar*) or a d/ð/t near the end
 * (the weak past: *-ði, -di, -ti*).
 */
export function spellingSlip(w, r) {
  w = normalise(w); r = normalise(r);
  if (!w || !r || w === r || w.includes(" ") || r.includes(" ")) return false;
  if (w[w.length - 1] !== r[r.length - 1] || Math.abs(w.length - r.length) > 1) return false;
  let p = 0;
  while (p < w.length && p < r.length && w[p] === r[p]) p++;
  const cons = (c) => c && !VOWEL1.test(c);
  const dentalEnd = (a, b, at) => at >= r.length - 3 && /[dðt]/.test(a) && /[dðt]/.test(b);
  if (w.length === r.length) {
    if (w.slice(p + 1) === r.slice(p + 1)) {                      // one letter wrong
      return cons(w[p]) && cons(r[p]) && !dentalEnd(w[p], r[p], p);
    }
    return w[p] === r[p + 1] && w[p + 1] === r[p] && w.slice(p + 2) === r.slice(p + 2)   // two swapped
      && cons(w[p]) && cons(w[p + 1]);
  }
  const [long, short] = w.length > r.length ? [w, r] : [r, w];
  if (long.slice(p + 1) !== short.slice(p)) return false;       // one letter in or out
  const c = long[p];
  return cons(c) || c === long[p - 1] || c === long[p + 1];      // a consonant, or a doubled letter
}

/** Diagnose one written cell: `g` is the result of `gradeForm`. */
function formItem(it) {
  const { g, m, typed, accepted, conj } = it;
  if (!g || g.verdict === "correct" || g.verdict === "empty" || g.verdict === "hedged") return [];
  const ex = { said: String(typed || "").trim(), right: [].concat(accepted || [])[0] || "" };
  if (g.verdict === "accents") return [{ p: "broddar", soft: true, ex }];
  if (g.verdict === "otherform")
    return patternsForCells(m, g.otherMarks).map((x) => ({ ...x, ex, m }));
  if (g.verdict === "wrong" && [].concat(accepted || []).some((a) => spellingSlip(typed, a)))
    return [{ p: "stafsetning", ex, m }];
  return patternsForForm(typed, accepted, m, conj).map((p) => ({ p, ex, m }));
}

const ROW_PATTERN = {
  tala: () => "tala", greinir: () => "greinir", kyn: () => "kyn",
  beyging: () => "beyging_lo", stig: () => "stig", "tíð": () => "tid",
  "háttur": () => "hattur", mynd: () => "mynd", "persóna": () => "sogn_frumlag",
};

/**
 * Everything that went wrong in one answer, as findings
 * `{ p, soft?, ex?: {said, right}, m?, other? }`. `resp` is what the submit
 * handler saw (ui/render.js); a question with nothing to diagnose gives [].
 */
export function diagnose(task, resp) {
  if (!task || !resp) return [];
  const out = [];
  const push = (p, extra = {}) => { if (p && !out.some((x) => x.p === p)) out.push({ p, ...extra }); };
  switch (resp.kind) {
    case "form":
      (resp.items || []).forEach((it) => formItem(it).forEach((f) => push(f.p, f)));
      break;
    case "cards": {
      /* A card that missed: was one of the leftover words a form of it? */
      const left = (resp.extra || []).slice();
      (resp.cards || []).forEach((c, k) => {
        if (c.fixed || !resp.per[k] || resp.per[k].ok || !c.e) return;
        let best = null;
        /* gradeWorkshop already paired a wrongly inflected word with its card. */
        const cands = resp.per[k].typed ? [resp.per[k].typed, ...left] : left;
        for (const w of cands) {
          const n = normalise(w);
          const others = Object.entries(c.e.forms).filter(([, fs]) => fs.some((f) => normalise(f) === n)).map(([mm]) => mm);
          if (others.length) { best = { w, others }; break; }
        }
        const ex = { said: best ? best.w : (cands[0] || "—"), right: c.answers[0] };
        if (best) patternsForCells(c.m, best.others).forEach((x) => push(x.p, { ...x, ex, m: c.m }));
        else if (cands.length) {
          const near = cands.map((w) => ({ w, p: commonPrefix(normalise(w), normalise(c.answers[0])) }))
            .sort((x, y) => y.p - x.p)[0];
          if (near && near.p >= 2) patternsForForm(near.w, c.answers, c.m).forEach((p) => push(p, { ex: { ...ex, said: near.w }, m: c.m }));
        }
      });
      break;
    }
    case "rows":
      (resp.rows || []).forEach((r) => {
        if (!r.picked || r.picked === r.answer) return;
        const ex = { said: r.picked, right: r.answer, row: r.key };
        if (r.key === "fall") push(casePattern(r.answer, r.picked), { ex });
        else if (r.key === "fl") push(AO_FS.has(r.answer) && AO_FS.has(r.picked) ? "ao_fs" : "ordflokkur", { ex });
        else if (ROW_PATTERN[r.key]) push(ROW_PATTERN[r.key](), { ex });
      });
      break;
    case "govern":
      if (resp.picked && resp.picked !== resp.answer) {
        const ex = { said: resp.picked, right: resp.answer };
        push(resp.so ? "fallstjorn_so" : "fallstjorn_fs", { ex });
        push(casePattern(resp.answer, resp.picked), { ex });
      }
      break;
    case "class":
      if (resp.picked && resp.picked !== resp.answer)
        push(AO_FS.has(resp.answer) && AO_FS.has(resp.picked) ? "ao_fs" : "ordflokkur",
          { ex: { said: resp.picked, right: resp.answer } });
      break;
    case "syntax": if (resp.ok === false) push("setningalidir", { ex: resp.ex || null }); break;
    case "clause": if (resp.ok === false) push("setningagerd", { ex: resp.ex || null }); break;
    case "hunt": {
      const g = resp.g;
      if (!g || !task.hunt) break;
      task.hunt.lines.forEach((ln, li) => ln.toks.forEach((tk, ti) => {
        const key = `${li}:${ti}`;
        if (!tk.err || g.fixed.includes(key)) return;
        const e = tk.err;
        const ex = { said: tk.w, right: e.answers[0] };
        if (e.kind === "fall") {
          push(casePattern(readMark(e.m).fall, readMark(e.wrongMark).fall), { ex });
          push(e.gov === "so" ? "fallstjorn_so" : "fallstjorn_fs", { ex });
        } else if (e.kind === "samræmi") push("kyn_samraemi", { ex });
        else if (e.kind === "sögn") push("sogn_frumlag", { ex });
      }));
      if (g.falseAlarm.length) push("ofleidretting", { ex: null });
      break;
    }
    case "patterns":
      (resp.ids || []).forEach((id) => push(id, { ex: resp.ex || null }));
      break;
    case "transform": {
      if (resp.ok) break;
      const ex = { said: String(resp.typed || "").trim(), right: task.model || (task.answers || [])[0] || "" };
      if (task.kind === "igaer" || task.kind === "amorgun") {
        const typed = normalise(resp.typed).split(" ");
        const model = normalise(ex.right).split(" ");
        /* The opener is two words; the verb belongs in third place. */
        const verbWord = model[2];
        const at = typed.indexOf(verbWord);
        if (verbWord && at > 2) push("v2", { ex });
        else push("tid", { ex });
      } else if (task.kind === "passive") push("tholmynd", { ex });
      else if (task.kind === "past") push("tid", { ex });
      else if (task.kind === "plural") push("sogn_frumlag", { ex });
      break;
    }
    default: break;
  }
  /* A pattern the question itself knows was missed (v6.11: the builder's
     `miss`), on top of what the answer shows. */
  (resp.also || []).forEach((id) => push(id, { ex: resp.ex || null }));
  return out;
}

/* ---------- keeping track ------------------------------------------------ */

export const HISTORY = 16;      // hits and misses kept per pattern
const EXAMPLES = 3;

/**
 * Write one answer into `S.diag`. Every pattern the question tested gets a
 * chance (`n`) and a hit or a miss in its history (`h`, "1" right, "0"
 * wrong); every pattern found gets a miss (`w`). A soft finding (a missing
 * accent on an answer accepted as right) counts as a miss of its own
 * pattern and nothing else. `verdict` is the question's: true, false or null.
 */
export function noteDiagnosis(S, task, findings, verdict, today) {
  if (verdict !== true && verdict !== false) return [];
  const book = (S.diag ||= {});
  const missed = new Set(findings.map((f) => f.p));
  const chances = new Set([...chancesIn(task), ...missed]);
  for (const id of chances) {
    if (!BY_ID.has(id)) continue;
    const r = (book[id] ||= { n: 0, w: 0, h: "", last: null, ex: [] });
    r.n++;
    const miss = missed.has(id);
    if (miss) {
      r.w++;
      r.last = today || r.last;
      const f = findings.find((x) => x.p === id);
      if (f && task.word && f.m) {
        r.ex = [{ w: task.word, m: f.m, o: f.other || null },
          ...(r.ex || []).filter((x) => !(x.w === task.word && x.m === f.m))].slice(0, EXAMPLES);
      }
    }
    r.h = ((r.h || "") + (miss ? "0" : "1")).slice(-HISTORY);
  }
  return [...chances].filter((id) => BY_ID.has(id));
}

/** How a pattern stands: totals, the recent window and the direction. */
export function standingOf(rec) {
  const h = (rec && rec.h) || "";
  const misses = [...h].filter((c) => c === "0").length;
  const rate = h.length ? misses / h.length : 0;
  let trend = null;
  if (h.length >= 8) {
    const half = Math.floor(h.length / 2);
    const miss = (s) => [...s].filter((c) => c === "0").length / s.length;
    const old = miss(h.slice(0, half)), now = miss(h.slice(half));
    trend = now < old - 0.15 ? "betra" : now > old + 0.15 ? "verra" : "jafnt";
  }
  return {
    n: (rec && rec.n) || 0, w: (rec && rec.w) || 0,
    seen: h.length, misses, rate, trend,
    /* Active: missed at least twice lately, and at least one time in five. */
    active: misses >= 2 && rate >= 0.2,
    score: misses * 2 + Math.min(10, ((rec && rec.w) || 0) * 0.2) + rate * 4,
  };
}

/** Every pattern this child has met, worst first. */
export function standings(S) {
  return Object.entries((S && S.diag) || {})
    .filter(([id]) => BY_ID.has(id))
    .map(([id, rec]) => ({ id, ...BY_ID.get(id), ...standingOf(rec), ex: rec.ex || [] }))
    .sort((a, b) => b.score - a.score);
}

/** The patterns that are going wrong now, worst first (at most `limit`). */
export function activePatterns(S, limit = 3, only = null) {
  return standings(S).filter((p) => p.active && (!only || only(p))).slice(0, limit);
}

/** The Villuveiðar error kinds that exercise these patterns. */
export function huntPreferFor(ids) {
  return [...new Set((ids || []).map((id) => (BY_ID.get(id) || {}).hunt).filter(Boolean))];
}

/** The question types a session aimed at these patterns is drawn from. */
export function focusTypes(ids) {
  return new Set((ids || []).flatMap((id) => (BY_ID.get(id) || {}).types || []));
}

/**
 * Build a question, preferring one that tests a pattern in `ids`: with
 * chance `p`, up to `tries` candidates are built and the first that tests one
 * is kept (marked `targeted`); otherwise the first candidate. A vocabulary
 * question is never thrown away — it marks its word as asked — so it ends
 * the search. `next` builds one question or returns null.
 */
export function pickTargeted(next, ids, { p = 0.4, tries = 5, rnd = Math.random } = {}) {
  if (!ids || !ids.length || rnd() >= p) return next();
  let first = null;
  for (let k = 0; k < tries; k++) {
    const t = next();
    if (!t) break;
    if (t.type === "meaning") return t;
    if (targets(t, ids)) { t.targeted = true; return t; }
    first ||= t;
  }
  return first || next();
}

/* ---------- one session ---------------------------------------------------- */

/**
 * The report on a finished session. `run` is app.js's record of it:
 * { chances: {id: n}, misses: {id: n}, found: [{p, ex}] , before: [ids] }.
 * Returns what the summary screen shows; pure.
 */
export function runReport(run, S, only = null) {
  const chances = run.chances || {}, misses = run.misses || {};
  const missedIds = Object.keys(misses).filter((id) => BY_ID.has(id))
    .sort((a, b) => misses[b] - misses[a] || (chances[b] || 0) - (chances[a] || 0));
  const found = missedIds.map((id) => ({
    id, ...BY_ID.get(id), count: misses[id], chances: chances[id] || misses[id],
    ex: (run.found || []).filter((f) => f.p === id && f.ex).map((f) => f.ex).slice(0, 3),
    standing: standingOf((S.diag || {})[id]),
  }));
  /* Mended: a pattern that was active when the session began, came up in it,
     and did not go wrong once. */
  const mended = (run.before || []).filter((id) => (chances[id] || 0) >= 2 && !misses[id])
    .map((id) => ({ id, ...BY_ID.get(id), chances: chances[id] }));
  /* Clean: tested at least three times in the session without a miss. */
  const clean = Object.keys(chances).filter((id) => BY_ID.has(id) && chances[id] >= 3 && !misses[id]
    && !mended.some((m) => m.id === id) &&
    !["broddar", "stafsetning", "hljodvarp", "ending", "nf_aukafall", "fall_annad", "ofleidretting"].includes(id))
    .map((id) => ({ id, ...BY_ID.get(id), chances: chances[id] }))
    .sort((a, b) => b.chances - a.chances);
  /* The one thing to remember: the worst real (not soft) pattern of the
     session; if nothing went wrong, the worst still-active one overall. */
  const hard = found.filter((f) => !["broddar", "stafsetning"].includes(f.id));
  /* v6.11: an old pattern is brought in only if this session's topic can
     test it — no verb tip after an Orðaforði session. `only` says which. */
  const old = activePatterns(S, 1, only)[0];
  const focus = hard[0] || found[0] || (old ? { ...old, fromBefore: true } : null);
  return { found, mended, clean, focus };
}
