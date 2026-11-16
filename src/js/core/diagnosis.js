// @ts-check
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
   patterns are fed back into the choice of questions (control/session.js `pickTask`):
   a question that tests one of them is preferred, so what goes wrong comes
   back until it stops going wrong.

   Nothing the child typed is stored. The state keeps counts, a string of
   hits and misses, and — as examples — the word, the cell that was asked for
   and the cell that was given: all of them BÍN marks. The words the child
   wrote are shown in the session summary and then forgotten.

   Pure: no DOM, no clock except through arguments.                         */

import { readMark } from "./marks.js";
import { normalise, stripAccents } from "./grading.js";

/** @typedef {import("../types").State} State */
/** @typedef {import("../types").Task} Task */
/** @typedef {import("../types").Finding} Finding */
/** @typedef {import("../types").DiagRecord} DiagRecord */

/* ---------- the patterns ------------------------------------------------- */

/*  id        stable key in the state
 *  nm        the name the child sees
 *  ok        the same thing said as a skill, for praise ("Rétt í öllu um …")
 *  rule      the one thing to remember (markdown-light, as `fmt` reads it)
 *  lesson    the Lesefni page that teaches it
 *  tags      which questions test it (see `tagsOf`)
 *  types     question types a session aimed at it is drawn from
 *  hunt      the Villuveiðar error kind that exercises it, if any: one of the
 *            generator's three ("fall", "samræmi", "sögn"), or — for a
 *            pattern only the hand-written bank exercises — "bank:<id>"
 *            (see BANK_PATTERNS below)                                        */
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
    rule: "Hver forsetning stýrir sínu falli: *um* þolfalli, *frá* þágufalli, *til* eignarfalli. Aðeins *í, á, undir, yfir, með, eftir, fyrir* og *við* geta stýrt tveimur: *við húsið* (þf.) en *taka við bréfinu* (þgf.).",
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
  /* v6.13 (critique 34): the verb's twin of "Nefnifall þar sem á að beygja" —
     the dictionary form copied off the card where a finite form was asked. */
  { id: "sogn_obeygd", ok: "að beygja sögnina", nm: "Sögnin ekki beygð",
    rule: "Sögnin á spjaldinu eða í orðabókinni stendur í **nafnhætti** (*hlaupa, klæðast*). Í setningunni lagar hún sig að frumlaginu og tíðinni — beygðu hana áður en þú skrifar hana: *ég hleyp, hún hljóp*.",
    lesson: "persona-tala", tags: ["verb:agree"], types: ["verb", "verbslot", "tbl_so", "smidja"] },
  { id: "tid", ok: "tíð sagna", nm: "Tíð sagnar",
    rule: "Lestu hvaða tíð er beðið um. **Nútíð**: *ég fer*. **Þátíð**: *ég fór*. Í gær → þátíð; á morgun → oftast nútíð.",
    lesson: "tid", tags: ["verb:tense"], types: ["verb", "verbslot", "tbl_so", "umritun"] },
  { id: "hattur", ok: "hætti sagna", nm: "Framsöguháttur og viðtengingarháttur",
    rule: "**Viðtengingarháttur** lýsir því sem er óvisst, ósk eða skilyrði: *ef ég væri, hún sagði að hann kæmi*. **Framsöguháttur** segir frá: *ég er, hann kom*.",
    lesson: "hattur", tags: ["verb:vh"], types: ["verb", "verbslot", "parse", "revform", "umritun", "raeda"] },
  { id: "mynd", ok: "germynd og miðmynd", nm: "Germynd og miðmynd",
    rule: "**Miðmynd** endar á *-st*: *klæða – klæðast*, *gleðja – gleðjast*, *sjá – sjást*. Germynd hefur enga -st endingu.",
    lesson: "mynd", tags: ["verb:mm"], types: ["verb", "verbslot", "parse", "revform"] },
  { id: "sterk_veik_sogn", ok: "þátíð sterkra sagna", nm: "Sterk sögn beygð eins og veik",
    rule: "Sterkar sagnir fá **enga** endingu -aði, -ði eða -ti í þátíð; þær skipta um sérhljóð: *bíta – beit*, *hlaupa – hljóp*, *gefa – gaf*. Lærðu kennimyndirnar.",
    lesson: "sterkar-veikar", tags: ["verb:strongpast"], types: ["verb", "verbslot", "tbl_so", "so_beyging"] },
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
  /* v6.13 (critique 32): three spelling patterns of their own. Each is a word
     inflected right and spelt wrong in one known way, so it is told apart
     from "Stafsetning" (any one-letter slip) and, above all, from the vowel
     and ending patterns it used to be filed under: *firir* is not a vowel
     change, *kalladi* is not a wrong ending. */
  { id: "y_i", ok: "y, ý og ey", nm: "y, ý og ey",
    rule: "*y, ý* og *ey* hljóma eins og *i, í* og *ei*. Leitaðu að skyldu orði: ef þar er *u, o, ú, jú, jó* eða *au* er skrifað **y, ý** eða **ey**: *fullur – fylla, hús – hýsa, ljós – lýsa, hlaupa – hleypur*. Sum orð þarf bara að læra: *fyrir, yfir*.",
    lesson: null, tags: ["form"], types: FORM_TYPES },
  { id: "n_nn", ok: "n og nn", nm: "n eða nn",
    rule: "Greinirinn hefur **tvö n** í nefnifalli og þolfalli eintölu í karlkyni (*hesturinn, hestinn*) en **eitt n** í nefnifalli eintölu í kvenkyni (*bókin, konan*). Hvorugkynið hefur *-ið* (*barnið*).",
    lesson: "greinir", tags: ["form"], types: FORM_TYPES },
  { id: "dh_d", ok: "ð og d", nm: "ð eða d",
    rule: "Í þátíð veikra sagna: **-ði** á eftir sérhljóði og *r, f, g* (*náði, heyrði, hafði, sagði*), **-di** oftast á eftir *l, m, n* (*taldi, dæmdi, kenndi*), **-ti** á eftir *p, t, k, s* (*keypti, mætti, vakti, kyssti*). *-aði* er alltaf með ð (*kallaði*). Segðu orðið upphátt: **ð** er mjúkt, **d** er hart.",
    lesson: "sterkar-veikar", tags: ["form"], types: FORM_TYPES },
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
    rule: "Í íslenskri fullyrðingarsetningu er sögnin **annar liður**: *Í gær **fór** ég* — ekki *Í gær ég fór*.",
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
  /* item 27: two question types the lessons taught and practice never asked.
     Each has its general pattern and the one mistake its Lesefni page warns
     about by name. */
  { id: "fn_flokkar", ok: "flokka fornafna", nm: "Flokkar fornafna",
    rule: "**Persónufornöfn**: *ég, þú, hann, hún, það*. **Afturbeygt**: *sig, sér, sín*. **Eignarfornöfn**: *minn, þinn, sinn*. **Ábendingarfornöfn**: *sá, þessi, hinn*. **Spurnarfornöfn**: *hver, hvor, hvaða*. **Óákveðin**: *einhver, enginn, allur, sumur, annar, báðir, nokkur*. Finndu orðabókarmyndina fyrst: *mér* → *ég*, *sína* → *sinn*.",
    lesson: "fornofn", tags: ["fnkind"], types: ["fn_flokkar"] },
  { id: "eignarfall_pfn", ok: "eignarfall persónufornafna", nm: "Eignarfall persónufornafns tekið fyrir eignarfornafn",
    rule: "*Hans, hennar, okkar, ykkar* og *þeirra* eru **eignarfall af persónufornöfnum**, ekki eignarfornöfn. Þau breytast ekki: *bíllinn hans, bókin hans, húsið hans*. Eignarfornöfnin *minn, þinn, sinn* lagast að nafnorðinu: *bíllinn minn, bókin mín*.",
    lesson: "fornofn", tags: ["fnkind:gen"], types: ["fn_flokkar"] },
  { id: "beyging_no", ok: "sterka og veika beygingu nafnorða", nm: "Sterk og veik beyging nafnorða",
    rule: "Skoðaðu **eignarfall eintölu** (*til …*). Endar það á samhljóði, oftast *-s* eða *-ar*, er beygingin **sterk**: *til hests, til bókar*. Endar orðið á sérhljóði í öllum föllum eintölu er hún **veik**: *pabbi, pabba, pabba, pabba*.",
    lesson: "nafnord-beyging", tags: ["nobeyg"], types: ["no_beyging"] },
  { id: "beyging_no_nf", ok: "að láta eignarfallið ráða", nm: "Nefnifallið látið ráða beygingunni",
    rule: "Ekki horfa bara á nefnifallið. *Herbergi* endar á sérhljóði, en eignarfallið er *herbergis*: það endar á *-s* og þess vegna er beygingin **sterk**.",
    lesson: "nafnord-beyging", tags: ["nobeyg:nf"], types: ["no_beyging"] },
  /* item 27, second half: strong and weak verbs, the three myndir, the
     boðháttur — each with the mistake its Lesefni page warns of. */
  { id: "beyging_so", ok: "sterkar og veikar sagnir", nm: "Sterk og veik sögn",
    rule: "Segðu *í gær* og sögnina með *ég*. Fær þátíðin endingu með *ð*, *d* eða *t* (*kallaði, heyrði, kenndi, keypti*)? Þá er sögnin **veik**. Engin ending, og sérhljóðið breytist (*tók, fór, beit*)? Þá er hún **sterk**.",
    lesson: "sterkar-veikar", tags: ["sobeyg"], types: ["so_beyging"] },
  { id: "beyging_so_hljod", ok: "að láta endinguna ráða", nm: "Sérhljóðið látið ráða",
    rule: "Sérhljóðið breytist líka í sumum veikum sögnum: *kaupa – keypti*, *telja – taldi*, *spyrja – spurði*. Þær eru samt **veikar**, því að þær fá endingu. Það er endingin sem ræður.",
    lesson: "sterkar-veikar", tags: ["sobeyg:hljod"], types: ["so_beyging"] },
  { id: "mynd_greina", ok: "myndir sagna", nm: "Germynd, miðmynd og þolmynd",
    rule: "Endar sögnin á *-st* í nafnhætti (*að hittast*)? **Miðmynd**. Er *vera* eða *verða* með lýsingarhætti þátíðar og frumlagið gerir ekkert sjálft (*Húsið var byggt*)? **Þolmynd**. Annars er það **germynd**.",
    lesson: "mynd", tags: ["somynd"], types: ["so_mynd"] },
  { id: "mynd_st", ok: "að prófa nafnháttinn", nm: "Germynd á -st tekin fyrir miðmynd",
    rule: "Ekki eru öll orð sem enda á *-st* í miðmynd. *Þú lest* og *þú veist* eru germynd í 2. persónu. Prófaðu nafnháttinn: *að lesa* endar ekki á *-st*, en *að hittast* gerir það.",
    lesson: "mynd", tags: ["somynd:st"], types: ["so_mynd"] },
  { id: "bodhattur", ok: "boðhátt", nm: "Boðháttur",
    rule: "Boðháttur er skipun. Við einn er *þú* fest aftan á sögnina: *kom* + *þú* → *komdu*, *les* + *þú* → *lestu*, *far* + *þú* → *farðu*. Við fleiri en einn: *komið, lesið, farið*.",
    lesson: "hattur", tags: ["bodh"], types: ["so_bodhattur"] },
  { id: "bodh_styfdur", ok: "boðhátt með þú", nm: "Stýfður boðháttur í stað boðháttar",
    rule: "*Kom* og *far* eru **stýfður boðháttur**, gömul mynd sem sést helst í ljóðum. Í venjulegu máli er *þú* fest aftan á: *komdu*, *farðu*, *lestu*.",
    lesson: "hattur", tags: ["bodh:st"], types: ["so_bodhattur"] },
  { id: "bodh_nh", ok: "að mynda boðhátt", nm: "Boðháttur myndaður af nafnhætti",
    rule: "Boðhátturinn er ekki nafnhátturinn með *-ðu*: ekki *komaðu* heldur *komdu*, ekki *lesaðu* heldur *lestu*. Taktu *-a* af nafnhættinum (*kom-*, *les-*) og festu *þú* aftan á. Sagnir eins og *kalla* halda *a*-inu: *kallaðu*.",
    lesson: "hattur", tags: ["bodh:nh"], types: ["so_bodhattur"] },
  /* item 28: material for years 9 and 10. As with item 27, each new type has
     its general pattern and the one mistake its Lesefni page warns of. */
  { id: "aukasetn_tegund", ok: "tegundir aukasetninga", nm: "Tegundir aukasetninga",
    rule: "Horfðu á **tenginguna** sem aukasetningin hefst á. *Að* → skýringarsetning, *hvort* eða spurnarorð → spurnarsetning (báðar eru **fallsetningar**). *Sem* → **tilvísunarsetning**. Hinar eru **atvikssetningar**: *þegar, áður en* (tíð), *ef, nema* (skilyrði), *af því að* (orsök), *þótt* (viðurkenning), *svo að, til þess að* (tilgangur eða afleiðing).",
    lesson: "aukasetningar", tags: ["subkind"], types: ["gerd_tegund"] },
  { id: "svo_ad", ok: "tilgang og afleiðingu", nm: "Tilgangur eða afleiðing: svo að",
    rule: "Á eftir *svo að* ræður **hátturinn**. Viðtengingarháttur → **tilgangssetning**, það sem átti að gerast: *Ég vaknaði snemma svo að ég **kæmi** ekki of seint.* Framsöguháttur → **afleiðingarsetning**, það sem gerðist: *Ég gleymdi lyklunum svo að ég **komst** ekki inn.*",
    lesson: "aukasetningar", tags: ["subkind:svo"], types: ["gerd_tegund"] },
  { id: "lidir", ok: "setningarliði", nm: "Nafnliður, sagnliður og forsetningarliður",
    rule: "Finndu **aðalorðið**. Nafnorð eða fornafn → **nafnliður** (*litli strákurinn*). Liðurinn byrjar á forsetningu → **forsetningarliður** (*á borðinu*). Sögn ásamt andlagi eða sagnfyllingu → **sagnliður** (*las bókina*). Eitt atviksorð → **atviksliður** (*oft*).",
    lesson: "lidir", tags: ["lidir"], types: ["setn_lidir", "lid_finna"] },
  { id: "lidir_fl", ok: "nafnlið inni í forsetningarlið", nm: "Nafnliður inni í forsetningarlið",
    rule: "Forsetningarliður er **forsetning + nafnliður**: *á [gamla borðinu]*. Ef forsetningin er ekki með í því sem spurt er um er það nafnliðurinn einn.",
    lesson: "lidir", tags: ["lidir:fl"], types: ["setn_lidir"] },
  { id: "obein_raeda", ok: "óbeina ræðu", nm: "Bein og óbein ræða",
    rule: "Í óbeinni ræðu hverfa gæsalappirnar, *ég* verður *hann* eða *hún* og sögnin fer í **viðtengingarhátt**. Á eftir *sagði*: *væri, kæmi, hefði farið*. Á eftir *segir*: *sé, komi, hafi farið*.",
    lesson: "raeda", tags: ["speech"], types: ["raeda", "umritun"] },
  /* v6.13 (critique 26): two patterns that only the hand-written error hunt
     (exercises.py HUNT) exercises. Both are among the best-known slips of
     Icelandic teenagers and nothing above describes them: neither is a wrong
     case or a wrong form — the words are right and the choice between them
     is not. */
  { id: "hvor", ok: "hvor, hvor annar og hvorugur", nm: "Hvor, hvor annar og hvorugur",
    rule: "Um **tvo** er notað *hvor*, um fleiri *hver*. Í vönduðu máli beygjast *hvor* og *annar* ekki saman: *hvor* fylgir frumlaginu og *annar* tekur fallið — *þeir hjálpuðu hvor öðrum*, *þær töluðu hvor við aðra*. *Hvorugur* er eintala: *hvorugur þeirra kom*.",
    lesson: "fornofn", tags: [], types: [] },
  { id: "ad_af", ok: "að og af", nm: "Að eða af",
    rule: "*Að* og *af* hljóma líkt en eru tvö orð. Með *að*: *leita að, hlæja að, spyrja að, gera grín að, dást að, komast að því, að mínu mati, að sjálfsögðu*. Með *af*: *stoltur af, hafa gaman af, nóg af, mikið af, missa af*.",
    lesson: "obeygjanleg", tags: [], types: [] },
  /* v6.13 (critique 31): not an error of the child's but a count of the
     classifier's blind spot. A wrong answer nothing above could read is
     written here and NOWHERE else — before, it counted as a success for every
     pattern the question tested. `n` is every wrong answer, `w` the ones left
     unread, so the rate is the share of misses the diagnosis cannot explain.
     `meta`: no question tests it, it is never "active", nothing practises it. */
  { id: "ogreint", ok: "", nm: "Ógreint",
    rule: "Svarið var rangt en villugreiningin kunni ekki að flokka villuna. Talan sýnir hve oft það gerist — þetta er ekki villa sem þú þarft að æfa sérstaklega.",
    lesson: null, tags: [], types: [], meta: true },
];

const BY_ID = new Map(PATTERNS.map((p) => [p.id, p]));
export const patternById = (id) => BY_ID.get(id) || null;

/* ---------- the hand-written error hunt ------------------------------------
 *
 * Every item of the Villuveiðar bank (exercises.py HUNT) names the patterns
 * it is filed under; these are all of them (tests/hunt-bank.test.js holds the
 * list to the bank). An item is ONE chance to make ONE known slip, so it must
 * count for its own patterns and no others — *læknirar* is a chance for
 * "Röng ending", not for every pattern that reads the tag "form" (accents,
 * y/ý, n/nn …). Hence a tag of its own per pattern, `bank:<id>`, which only
 * a bank item carries (`tagsOf`). Each listed pattern also gets:
 *   types  "villur" — a session aimed at the pattern may draw an error hunt;
 *   hunt   "bank:<id>" unless the generator already exercises it — the kind
 *          `huntPreferFor` hands the builder, which then picks the bank's
 *          items for this pattern first.
 * Written here rather than into each entry above so that the list is in one
 * place and reads as what it is. */
export const BANK_PATTERNS = ["opersonuleg", "sogn_frumlag", "ef", "fallstjorn_fs", "fallstjorn_so",
  "thf_thgf", "nf_aukafall", "hattur", "hvor", "kyn_samraemi", "tholmynd", "fleirtoluord",
  "ending", "hljodvarp", "sterk_veik_sogn", "ad_af", "samtengingar", "y_i", "n_nn"];
export const bankTag = (id) => "bank:" + id;
for (const id of BANK_PATTERNS) {
  const p = BY_ID.get(id);
  p.tags = [...p.tags, bankTag(id)];
  if (!p.types.includes("villur")) p.types = [...p.types, "villur"];
  if (!p.hunt) p.hunt = bankTag(id);
}

/* ---------- what a question tests ---------------------------------------- */

const caseKey = (f) => (f === "ÞG" ? "ÞGF" : f);
const AO_FS = new Set(["atviksorð", "forsetning"]);

/** The tags of a question: what it gives the child a chance to get wrong.
    @param {?Task} t @returns {Set<string>} */
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
    /* v6.11 shapes (gap, choice, tap, sort): the mark, if the question has one, and
       the tags the builder gives. A pronoun has no article to forget. */
    case "gap": case "choice":
      if (t.m) addMark(t.m);
      if (t.skill === "fornofn" || t.skill === "toluord") tags.delete("noun");
      if (t.type === "gap" && t.paradigm) tags.add("form");
      (t.tags || []).forEach((x) => tags.add(x));
      break;
    case "tap": case "sort":
    /* item 27: the builder says what it tests (the typed genitive only from
       þyngd 5; the written kennimyndir from þyngd 3). */
    case "kenni": case "slots":
      (t.tags || []).forEach((x) => tags.add(x));
      break;
    case "clause": tags.add("clause"); break;
    case "villur":
      tags.add("hunt");
      huntErrors(t).forEach((e) => {
        /* An item of the hand-written bank says itself what it tests. */
        if (e.patterns) e.patterns.forEach((id) => tags.add(bankTag(id)));
        else if (e.kind === "fall") {
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
      /* v6.13 (item 29) */
      if (t.kind === "active") tags.add("passive");
      if (t.kind === "question" || t.kind === "join") tags.add("v2");
      if (t.kind === "indirect") { tags.add("verb:vh"); tags.add("speech"); }
      break;
    default: break;
  }
  return tags;
}

const huntErrors = (t) => (t && t.hunt ? t.hunt.lines.flatMap((l) => l.toks.filter((x) => x.err).map((x) => x.err)) : []);

/** The patterns a question gives a chance to get wrong.
    @param {?Task} task @returns {string[]} */
export function chancesIn(task) {
  const tags = tagsOf(task);
  return PATTERNS.filter((p) => p.tags.some((x) => tags.has(x))).map((p) => p.id);
}

/** Does this question test any of these patterns?
    @type {(task: Task, ids: ?string[]) => boolean} */
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
     the child most likely meant. On a tie, a dative target prefers the
     accusative reading (v6.13, critique 33): *barn* for *barni* is both
     nominative and accusative, and the error teachers see there is the
     accusative and dative confused, not a word left in the nominative. */
  const tgtCase = caseKey(readMark(target).fall);
  const pref = (m) => (tgtCase === "ÞGF" && caseKey(readMark(m).fall) === "ÞF" ? 0 : 1);
  const best = others.map((m) => ({ m, d: markDiff(target, m) }))
    .filter((x) => x.d.length).sort((x, y) => x.d.length - y.d.length || pref(x.m) - pref(y.m))[0];
  if (!best) return [];
  const a = readMark(target), b = readMark(best.m);
  /* v6.13 (critique 34): the infinitive — the form on the card — typed where
     a finite verb was asked is one error, "not inflected", not a wrong person
     plus a wrong tense. *hlaupa* for *hljóp*. */
  const inf = others.find((m) => /(^|-)NH$/.test(m));
  if (inf && FINITE.has(a.háttur)) return [{ p: "sogn_obeygd", other: inf }];
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

const FINITE = new Set(["framsöguháttur", "viðtengingarháttur", "boðháttur"]);

const VOWELS = /[aáeéiíoóuúyýæö]/g;
/* The endings of the weak past, every person and number, active and middle:
   -aði/-ði/-di/-ti and their plurals. Until v6.13 the plural persons were
   missing (*-uðum, -uðuð, -ðum, -dum, -tum* …), so a regularised strong past
   like *ganguðum* or *hefjuðuð* got no diagnosis at all (critique 8). The
   regex finds the LONGEST weak ending at the end of a word: the engine tries
   the earliest start first. */
const WEAK_PAST = new RegExp("(" + [
  "aði", "aðir", "aðist",
  "uðu", "uðum", "uðuð", "uðust", "uðumst", "uð",
  "ði", "ðir", "ðist", "ðu", "ðum", "ðuð", "ðust", "ðumst",
  "di", "dir", "dist", "du", "dum", "duð", "dust", "dumst",
  "ti", "tir", "tist", "tu", "tum", "tuð", "tust", "tumst",
].join("|") + ")$");

/* Vowel pairs that alternate inside a stem by i- or u-umlaut (hljóðvarp):
   *barn – börn, kennari – kennurum, bók – bækur, koma – kemur, sonur –
   synir, hús – hýsa, köttur – ketti, hlaupa – hleypur*. Used to tell a
   vowel change in the stem from a wrong vowel in an ending (*börninum* for
   *börnunum* is the ending). Ablaut (*bíta – beit, finna – fundum*) is in the
   root syllable, which `vowelChange` accepts whatever the pair. */
const UMLAUT = new Set(["a|ö", "a|u", "a|e", "á|æ", "o|e", "ó|æ", "o|y", "u|y", "ú|ý", "ö|e", "au|ey"]
  .flatMap((x) => { const [p, q] = x.split("|"); return [`${p}|${q}`, `${q}|${p}`]; }));

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
  if (strongMadeWeak(w, r, target, conj)) return ["sterk_veik_sogn"];
  /* v6.13 (critique 32): the spelling patterns come before the vowel test,
     which would otherwise read *firir* as a vowel change. */
  const sp = spellingPattern(w, r);
  if (sp) return [sp];
  const skel = (x) => x.replace(VOWELS, "");
  const first = commonPrefix(w, r);
  if (skel(w) === skel(r) && first < Math.max(2, r.length - 3) && vowelChange(w, r)) return ["hljodvarp"];
  if (first >= 2 && r.length - first <= 5 && Math.abs(w.length - r.length) <= 4) return ["ending"];
  return [];
}

/**
 * A strong verb's past given a weak ending — one the right form does not
 * itself end in (*sátum* ends in -tum and is strong; *sitjuðum* or *sittum*
 * for it is not), or one that adds a syllable (*bjóðuðum* for *buðum*, whose
 * stem happens to end in ð). Checked before the spelling patterns, so
 * *gengdum* for *gengum* is the strong verb made weak, not a letter too many.
 */
function strongMadeWeak(w, r, target, conj) {
  if (conj !== "sterk" || readMark(target || "").tíð !== "þátíð") return false;
  /* Only the vowels differ (*staði* for *stæði*): a vowel error, not a
     weak ending. */
  if (w.replace(VOWELS, "") === r.replace(VOWELS, "")) return false;
  const weak = WEAK_PAST.exec(w);
  return !!weak && (!r.endsWith(weak[1]) || w.length - r.length >= 2);
}

/**
 * Is the difference between two words with the same consonants a vowel
 * change in the stem? Yes if it falls in the first vowel group (the root:
 * *bókur/bækur*, *tók/taka*), or if every vowel that differs is an umlaut
 * pair (*kennarum/kennurum*). No for *börninum/börnunum*: *i/u* in the
 * second syllable is the article's ending, not hljóðvarp (critique 32).
 */
export function vowelChange(w, r) {
  /* One vowel letter is one group, but for the diphthongs au, ei, ey:
     *sjóunum* is ó-u-u, so *sjóinum* differs in the ending, not the root. */
  const groups = (x) => x.match(/au|ei|ey|[aáeéiíoóuúyýæö]/g) || [];
  const gw = groups(w), gr = groups(r);
  if (gw.length !== gr.length) return false;
  const diff = gr.map((g, k) => (g === gw[k] ? null : k)).filter((k) => k !== null);
  if (!diff.length) return false;
  if (diff.every((k) => k === 0)) return true;
  return diff.every((k) => UMLAUT.has(`${gw[k]}|${gr[k]}`));
}

/* The letters each spelling pattern swaps: i/í for y/ý (ei for ey follows),
   ð for d. */
const Y_I = { i: "y", í: "ý", y: "i", ý: "í" };
const sameBut = (w, r, ok) => w.length === r.length && w !== r &&
  [...w].every((c, k) => c === r[k] || ok(c, r[k]));

/**
 * A known spelling error, not an inflection error (v6.13, critique 32):
 *   y_i   only i ↔ y and í ↔ ý differ (*firir, lísa, heira*)
 *   dh_d  only ð ↔ d differ (*kalladi, dæmði*)
 *   n_nn  one n doubled or undoubled (*hestin, konann*)
 *   stafsetning  any other one-letter slip (see `spellingSlip`)
 * or null. Both words are single, normalised forms.
 */
export function spellingPattern(w, r) {
  w = normalise(w); r = normalise(r);
  if (!w || !r || w === r || w.includes(" ") || r.includes(" ")) return null;
  if (sameBut(w, r, (c, d) => Y_I[c] && (Y_I[c] === d || stripAccents(Y_I[c]) === stripAccents(d)))) return "y_i";
  if (sameBut(w, r, (c, d) => (c === "ð" && d === "d") || (c === "d" && d === "ð"))) return "dh_d";
  if (Math.abs(w.length - r.length) === 1) {
    const [long, short] = w.length > r.length ? [w, r] : [r, w];
    const p = commonPrefix(long, short);
    if (long[p] === "n" && (long[p - 1] === "n" || long[p + 1] === "n") && long.slice(p + 1) === short.slice(p)) return "n_nn";
  }
  return spellingSlip(w, r) ? "stafsetning" : null;
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
  if (g.verdict === "wrong") {
    const r0 = normalise([].concat(accepted || [])[0] || "").split(" ").pop();
    if (strongMadeWeak(nearest(typed, r0) || "", r0, m, conj)) return [{ p: "sterk_veik_sogn", ex, m }];
    /* Against every accepted form, not only the first. */
    for (const a of [].concat(accepted || [])) {
      const sp = spellingPattern(nearest(typed, a) || "", a);
      if (sp) return [{ p: sp, ex, m }];
    }
  }
  return patternsForForm(typed, accepted, m, conj).map((p) => ({ p, ex, m }));
}

const ROW_PATTERN = {
  tala: () => "tala", greinir: () => "greinir", kyn: () => "kyn",
  beyging: () => "beyging_lo", stig: () => "stig", "tíð": () => "tid",
  "háttur": () => "hattur", mynd: () => "mynd", "persóna": () => "sogn_frumlag",
};

/**
 * Everything that went wrong in one answer, as findings
 * `{ p, soft?, ex?: {said, right}, m?, other? }`. `resp` is the answer as the
 * judge saw it (core/answer.js); a question with nothing to diagnose gives [].
 *
 * @param {?Task} task @param {?Record<string, any>} resp @returns {Finding[]}
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
        /* An item of the hand-written bank names its patterns; one filed
           under none is left unread ("Ógreint"), which is what it is. */
        if (e.patterns) e.patterns.forEach((id) => push(id, { ex }));
        else if (e.kind === "fall") {
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
      } else if (task.kind === "passive" || task.kind === "active") push("tholmynd", { ex });
      else if (task.kind === "question" || task.kind === "join") push("v2", { ex });
      else if (task.kind === "indirect") { push("hattur", { ex }); push("obein_raeda", { ex }); }
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
export const UNREAD = "ogreint";

/**
 * Write one answer into `S.diag`. Every pattern the question tested gets a
 * chance (`n`) and a hit or a miss in its history (`h`, "1" right, "0"
 * wrong); every pattern found gets a miss (`w`). A soft finding (a missing
 * accent on an answer accepted as right) counts as a miss of its own
 * pattern and nothing else. `verdict` is the question's: true, false or null.
 *
 * v6.13 (critique 31): a WRONG answer with no real finding says nothing
 * about the patterns the question tested — the child got something wrong
 * that the classifier could not read, and that is not a success for each of
 * them. Nothing is written to them; the miss is counted under "ogreint"
 * instead. Every wrong answer is a chance for "ogreint", so its rate is the
 * share of wrong answers left unread. Returns the patterns the question
 * tested and that were written — never "ogreint", which belongs to no
 * session report.
 *
 * @param {State} S @param {Task} task @param {Finding[]} findings
 * @param {?boolean} verdict @param {?string} today  a day key
 * @returns {string[]}
 */
export function noteDiagnosis(S, task, findings, verdict, today) {
  if (verdict !== true && verdict !== false) return [];
  const book = (S.diag ||= {});
  const missed = new Set(findings.map((f) => f.p));
  const unread = verdict === false && !findings.some((f) => !f.soft);
  if (verdict === false) {
    const r = (book[UNREAD] ||= { n: 0, w: 0, h: "", last: null, ex: [] });
    r.n++;
    if (unread) { r.w++; r.last = today || r.last; }
    r.h = ((r.h || "") + (unread ? "0" : "1")).slice(-HISTORY);
  }
  /* Unread: only what was found (a soft accent miss) is written. */
  const chances = new Set(unread ? [...missed] : [...chancesIn(task), ...missed]);
  chances.delete(UNREAD);
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

/* When is a pattern "active"? (v6.13, critique 35.) Until v6.12: two misses
   in the window and a rate of at least one in five — so two slips in ten
   questions flagged a pattern. Now the window needs at least MIN_CHANCES
   answers, and the LOWER bound of the miss rate must clear ACTIVE_RATE: we
   want to be fairly sure the child misses it at least one time in five, not
   merely that they did so lately.

   The bound is Wilson's score interval, one-sided at 95 % (z = 1.645). It is
   the usual choice for a proportion from few trials: unlike the plain
   p ± z·√(p(1−p)/n) it stays inside 0…1 and does not collapse to zero width
   at 0 or n misses. What it asks for in practice (window of 16 at most):
       5 answers → 3 misses     8 answers → 4     12 answers → 5     16 → 6
   Two slips are never enough on their own. */
export const MIN_CHANCES = 5;
export const ACTIVE_RATE = 0.2;
const Z = 1.645;

/** Lower bound of the Wilson score interval for k misses in n answers.
    @param {number} k @param {number} n @param {number} [z] @returns {number} */
export function wilsonLower(k, n, z = Z) {
  if (!n) return 0;
  const p = k / n, z2 = z * z;
  const centre = p + z2 / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return Math.max(0, (centre - margin) / (1 + z2 / n));
}

/** How a pattern stands: totals, the recent window and the direction.
    @param {?Partial<DiagRecord>} rec
    @returns {{n: number, w: number, seen: number, misses: number, rate: number,
               trend: ?("betra"|"verra"|"jafnt"), active: boolean, score: number}} */
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
    /* Active: enough answers lately, and a miss rate we are fairly sure
       is at least one in five (see MIN_CHANCES above). */
    active: h.length >= MIN_CHANCES && wilsonLower(misses, h.length) > ACTIVE_RATE,
    score: misses * 2 + Math.min(10, ((rec && rec.w) || 0) * 0.2) + rate * 4,
  };
}

/** Every pattern this child has met, worst first; "Ógreint" (a count, not
    an error of the child's) last, and never active.
    @param {?State} S */
export function standings(S) {
  return Object.entries((S && S.diag) || {})
    .filter(([id]) => BY_ID.has(id))
    .map(([id, rec]) => {
      const p = { id, ...BY_ID.get(id), ...standingOf(rec), ex: rec.ex || [] };
      if (p.meta) p.active = false;
      return p;
    })
    .sort((a, b) => (a.meta ? 1 : 0) - (b.meta ? 1 : 0) || b.score - a.score);
}

/** The patterns that are going wrong now, worst first (at most `limit`).
    @param {?State} S @param {number} [limit] @param {((p: any) => boolean)|null} [only] */
export function activePatterns(S, limit = 3, only = null) {
  return standings(S).filter((p) => p.active && (!only || only(p))).slice(0, limit);
}

/** The Villuveiðar error kinds that exercise these patterns.
    @param {?string[]} ids @returns {string[]} */
export function huntPreferFor(ids) {
  return [...new Set((ids || []).map((id) => (BY_ID.get(id) || {}).hunt).filter(Boolean))];
}

/** The question types a session aimed at these patterns is drawn from.
    @param {?string[]} ids @returns {Set<string>} */
export function focusTypes(ids) {
  return new Set((ids || []).flatMap((id) => (BY_ID.get(id) || {}).types || []));
}

/**
 * Build a question, preferring one that tests a pattern in `ids`: with
 * chance `p`, up to `tries` candidates are built and the first that tests one
 * is kept (marked `targeted`); otherwise the first candidate. A vocabulary
 * question is never thrown away, so it ends the search. `next` builds one
 * question or returns null; since v6.13 building changes nothing (the
 * builders are pure, tasks/view.js), so the candidates that are dropped use
 * nothing up — the caller applies the effects of the one that is returned.
 *
 * @param {() => ?Task} next @param {?string[]} ids
 * @param {{p?: number, tries?: number, rnd?: () => number}} [opts]
 * @returns {?Task}
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

const NO_PRAISE = new Set(["broddar", "stafsetning", "y_i", "n_nn", "dh_d", "hljodvarp", "ending",
  "nf_aukafall", "sogn_obeygd", "fall_annad", "ofleidretting", UNREAD]);

/**
 * The report on a finished session. `run` is the session's record of it
 * (core/run.js `newRun`):
 * { chances: {id: n}, misses: {id: n}, found: [{p, ex}] , before: [ids] }.
 * Returns what the summary screen shows; pure.
 *
 * @param {{chances?: Record<string, number>, misses?: Record<string, number>,
 *          found?: {p: string, ex?: any}[], before?: string[]}} run
 * @param {State} S @param {((p: any) => boolean)|null} [only]
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
  /* Clean: tested at least three times in the session without a miss.
     Not the catch-alls and slips, which every written form "tests" — no
     "Rétt í öllu um y, ý og ey" after ten nouns without a y (v6.13). */
  const clean = Object.keys(chances).filter((id) => BY_ID.has(id) && chances[id] >= 3 && !misses[id]
    && !mended.some((m) => m.id === id) && !NO_PRAISE.has(id))
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
