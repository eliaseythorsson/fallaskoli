// @ts-check
/* The catalogue: every question type, declared once.

   A question type is ONE entry here and ONE builder in its category's file
   (tasks/<skill>.js, exported as `BUILDERS.<id>`). tasks/registry.js joins
   the two and refuses to start if a declaration has no builder or a builder
   no declaration. A renderer in ui/ is needed only for a new shape.

   THE ORDER OF THIS LIST IS THE DUEL ORDER. The weighted choice in
   tasks/next.js walks it, so the order is part of what a seed MEANS: move a
   line and every duel builds other questions from the same seed, and two
   browsers on two versions disagree. A new type goes at the END of the file.
   tests/registry.test.js pins the order as it stands.

   Every entry:

     id        the stable key. The curriculum switches (core/policy.js), the
               mix rule (core/mix.js), the error diagnosis, word knowledge and
               the saved sessions all know a type by it. Never renamed.
     skill     the category it is filed under (core/skills.js) — and the file
               its builder lives in.
     anyOf     (one type only) the skills it serves; it may appear if any of
               them is switched on.
     nm, ds    its name and one line about it, for a person: the switches in
               Stillingar, the session summary, Lesefni.
     renderer  the key in RENDER (ui/render.js, ui/render-more.js) that draws
               it — the `type` of every task it builds.
     weight    how often it is chosen among the types that are on.
               `weightInRun`, if given, replaces it inside a practice session.
     recall    true if answering it means producing a word from its meaning
               or a sentence gap without seeing it (CONTEXT.md "Recall").
               Typing an inflected form of a word that is shown is not
               recall. Word knowledge stores the type id and looks this up
               (`isRecall`) when a rule needs it.
     grader    "app": the browser judges the answer (core/answer.js).
               "server": the answer is read on the server first
               (docs/adr/0002). Such a type exists for a pupil only when the
               program runs against a server whose grader is up AND the
               administrator has switched server grading on for that pupil —
               otherwise it is invisible everywhere (core/policy.js
               `createPolicy`, docs/adr/0004).
     tags      what the error diagnosis can read from one of its questions
               (core/diagnosis.js `tagsOf`): every tag any of its tasks can
               carry.
     bands     the steps of difficulty it knows, on the session's 1–7 scale
               (core/difficulty.js). [1, 3, 4] says: the same questions at
               þyngd 1 and 2, something new from 3, again from 4, and nothing
               new above that. [1] says the type ignores difficulty. (`lvl` on
               the task is not counted: it is a label, not a different
               question.) It says WHERE a type changes, not how much: for
               that, tools/sim/pools.mjs counts the distinct questions per
               band, and tests/pools.js holds a type to at least 150 at
               every band it declares (critique item 23).

   `tags`, `bands` and `renderer` are not notes: tests/registry.test.js builds
   every type at every band and holds each declaration to what was built.

   Core may import this file. It imports nothing from tasks/.             */

import { SKILL_IDS } from "./skills.js";

/** @typedef {import("../types").CatalogueEntry} CatalogueEntry */

/** Who judges an answer. */
export const GRADERS = Object.freeze(["app", "server"]);

/** @type {CatalogueEntry[]} */
const LIST = [
  { id: "fill", skill: "nafnord",
    nm: "Settu orðið í rétt horf",
    ds: "Nafnorð (og stundum lýsingarorð eða fornafn) sett í eyðu í setningu",
    renderer: "fill", weight: 26, recall: false, grader: "app",
    tags: ["agree:kyn", "case:EF", "case:NF", "case:ÞF", "case:ÞGF", "form", "noun", "num"],
    bands: [1, 2, 3, 4, 5, 6, 7] },
  { id: "verbslot", skill: "sagnord",
    nm: "Sögn í setningu",
    ds: "Sögn sett í eyðu í heilli setningu",
    renderer: "verbslot", weight: 14, recall: false, grader: "app",
    tags: ["form", "num", "verb:agree", "verb:mm", "verb:strongpast", "verb:tense", "verb:vh"],
    bands: [1, 2, 3, 4, 5, 6, 7] },
  { id: "verb", skill: "sagnord",
    nm: "Beygðu sögnina",
    ds: "Sögn beygð eftir persónu, tíð, hætti og mynd",
    renderer: "verb", weight: 8, recall: false, grader: "app",
    tags: ["form", "num", "verb:agree", "verb:mm", "verb:strongpast", "verb:tense", "verb:vh"],
    bands: [1, 2, 3, 4, 5] },
  { id: "parse", skill: "greining",
    nm: "Greindu orðið sem er merkt",
    ds: "Orðflokkur og öll beygingaratriði orðs í setningu",
    renderer: "parse", weight: 11, recall: false, grader: "app",
    tags: ["adj", "case:EF", "case:NF", "case:ÞF", "case:ÞGF", "noun", "num", "ofl", "verb:agree",
      "verb:mm", "verb:tense", "verb:vh"],
    bands: [1, 2, 3, 4, 5, 6, 7] },
  { id: "revform", skill: "lysingarord", anyOf: ["lysingarord", "sagnord", "nafnord"],
    nm: "Greindu beygðu myndina",
    ds: "Beygð mynd greind — í setningu þegar hún er til, annars ein og sér",
    renderer: "parse", weight: 7, recall: false, grader: "app",
    tags: ["adj", "case:EF", "case:NF", "case:ÞF", "case:ÞGF", "noun", "num", "ofl", "verb:agree",
      "verb:mm", "verb:tense", "verb:vh"],
    bands: [1, 2, 3, 4, 5] },
  { id: "govern", skill: "fallstjorn",
    nm: "Hvaða falli stýrir orðið?",
    ds: "Fallstjórn sagna og forsetninga",
    renderer: "govern", weight: 8, recall: false, grader: "app",
    tags: ["case:EF", "case:ÞF", "case:ÞGF", "gov:fs", "gov:so"],
    bands: [1, 2, 3, 4, 5, 6, 7] },
  { id: "indecl", skill: "obeygjanleg",
    nm: "Í hvaða orðflokki er orðið?",
    ds: "Óbeygjanleg orð þekkt í setningu",
    renderer: "indecl", weight: 5, recall: false, grader: "app",
    tags: ["ofl", "ofl:ao_fs"],
    bands: [1, 2, 3, 4, 5, 6, 7] },
  { id: "syntax", skill: "setningafraedi",
    nm: "Smelltu á rétta orðið",
    ds: "Frumlag, umsögn, andlag og sagnfylling fundin í setningu",
    renderer: "syntax", weight: 8, recall: false, grader: "app",
    tags: ["syn"],
    bands: [1, 3, 4, 5, 6, 7] },
  { id: "clause", skill: "setningagerd",
    nm: "Hvers konar setning er þetta?",
    ds: "Aðalsetning, aukasetning og nafnháttarsetning",
    renderer: "clause", weight: 8, recall: false, grader: "app",
    tags: ["clause"],
    bands: [1, 5, 6, 7] },
  { id: "tbl_no", skill: "nafnord",
    nm: "Beygingartafla — nafnorð",
    ds: "Öll fjögur föllin í einum dálki",
    renderer: "table", weight: 5, recall: false, grader: "app",
    tags: ["case:EF", "case:NF", "case:ÞF", "case:ÞGF", "form", "noun", "num"],
    bands: [1, 2, 3, 4, 5] },
  { id: "tbl_lo", skill: "lysingarord",
    nm: "Beygingartafla — lýsingarorð",
    ds: "Stigbreyting, sterk og veik beyging",
    renderer: "table", weight: 6, recall: false, grader: "app",
    tags: ["adj", "agree:kyn", "case:EF", "case:NF", "case:ÞF", "case:ÞGF", "form", "num"],
    bands: [1, 2, 3, 4, 5] },
  { id: "tbl_so", skill: "sagnord",
    nm: "Beygingartafla — sagnorð",
    ds: "Sögn beygð í öllum persónum",
    renderer: "table", weight: 5, recall: false, grader: "app",
    tags: ["form", "num", "verb:agree", "verb:mm", "verb:tense", "verb:vh"],
    bands: [1, 2, 3, 4, 5] },
  { id: "tbl_fn", skill: "fornofn",
    nm: "Beygingartafla — fornöfn",
    ds: "Fornöfn og greinir beygð",
    renderer: "table", weight: 4, recall: false, grader: "app",
    tags: ["agree:kyn", "case:EF", "case:NF", "case:ÞF", "case:ÞGF", "form", "noun", "num"],
    bands: [1, 2, 3, 4] },
  { id: "tbl_to", skill: "toluord",
    nm: "Beygingartafla — töluorð",
    ds: "Frumtölur og raðtölur beygðar",
    renderer: "table", weight: 3, recall: false, grader: "app",
    tags: ["agree:kyn", "case:EF", "case:NF", "case:ÞF", "case:ÞGF", "form", "num"],
    bands: [1, 2, 3] },
  /* v6.11: in a session the free-text meaning question is an optional bonus
     after the graded Orðaforði questions (ui/render-more.js), not a question
     of its own — hence no weight inside one. It still comes in a rescue
     drill. */
  { id: "meaning", skill: "ordaford",
    nm: "Hvað þýðir orðið?",
    ds: "Merking orðs með eigin orðum — í lotu sem valfrjáls bónus",
    renderer: "meaning", weight: 4, weightInRun: 0, recall: false, grader: "app",
    tags: [],
    bands: [1] },
  /* v6.9: production. Writing the Icelandic tests understanding rather than
     recall, so these three together weigh about as much as the cloze. */
  { id: "umritun", skill: "malbeiting",
    nm: "Umritun",
    ds: "Settu setningu í þátíð, fleirtölu eða þolmynd, eða byrjaðu hana á Í gær / Á morgun",
    renderer: "umritun", weight: 10, recall: false, grader: "app",
    tags: ["num", "passive", "speech", "v2", "verb:agree", "verb:tense", "verb:vh"],
    bands: [1, 2, 3, 4, 5, 6, 7] },
  { id: "smidja", skill: "malbeiting",
    nm: "Setningasmiðja",
    ds: "Búðu til setningu úr orðum í orðabókarmynd og beygðu hvert orð",
    renderer: "smidja", weight: 8, recall: false, grader: "app",
    tags: ["adj", "agree:kyn", "case:EF", "case:NF", "case:ÞF", "case:ÞGF", "form", "noun", "num",
      "verb:agree", "verb:mm", "verb:tense", "verb:vh"],
    bands: [1, 2, 3] },
  { id: "villur", skill: "malbeiting",
    nm: "Villuveiðar",
    ds: "Finndu og lagaðu eina eða tvær villur í tveimur setningum: fall og samræmi, og frá þyngd 3 algengar málvillur (mér langar, ég vill)",
    renderer: "villur", weight: 8, recall: false, grader: "app",
    /* The `bank:` tags are the patterns the hand-written bank files its items
       under (core/diagnosis.js BANK_PATTERNS); the rest are the generator's. */
    tags: ["agree:kyn", "case:EF", "case:ÞF", "case:ÞGF", "gov:fs", "gov:so", "hunt", "verb:agree",
      "bank:ad_af", "bank:ef", "bank:ending", "bank:fallstjorn_fs", "bank:fallstjorn_so",
      "bank:fleirtoluord", "bank:hattur", "bank:hljodvarp", "bank:hvor", "bank:kyn_samraemi",
      "bank:n_nn", "bank:nf_aukafall", "bank:opersonuleg", "bank:samtengingar",
      "bank:sogn_frumlag", "bank:sterk_veik_sogn", "bank:thf_thgf", "bank:tholmynd", "bank:y_i"],
    /* 1–2: the generator, on the sentences of that þyngd. 3, 4, 5: the bank,
       each step adding the items written for it. Nothing new above 5. */
    bands: [1, 2, 3, 4, 5] },
  /* v6.11: at least three kinds of question in every category */
  { id: "no_val", skill: "nafnord",
    nm: "Veldu rétt fall",
    ds: "Nafnorð í setningu: valið milli falla",
    renderer: "choice", weight: 8, recall: false, grader: "app",
    tags: ["case:EF", "case:NF", "case:ÞF", "case:ÞGF", "noun", "num"],
    bands: [1, 2, 3, 4, 5, 6, 7] },
  /* lo_beyging, lo_stig and lo_samr choose a bank sentence near the band
     (`adjSlot`), and the rank cap on the adjectives tried in a frame lets in
     more words at each step. Until v6.13 only the cap read the band, and the
     critique (item 13) rightly counted these three as ignoring difficulty. */
  { id: "lo_beyging", skill: "lysingarord",
    nm: "Sterk eða veik beyging",
    ds: "Lýsingarorð skrifað í eyðu, með eða án greinis",
    renderer: "gap", weight: 8, recall: false, grader: "app",
    tags: ["adj", "agree:kyn", "case:EF", "case:NF", "case:ÞF", "case:ÞGF", "form", "num"],
    bands: [1, 2, 3, 4, 5, 6, 7] },
  { id: "lo_stig", skill: "lysingarord",
    nm: "Stigbreyting í setningu",
    ds: "Miðstig og efsta stig skrifað í eyðu",
    renderer: "gap", weight: 6, recall: false, grader: "app",
    tags: ["adj", "agree:kyn", "case:NF", "case:ÞF", "form", "num"],
    bands: [1, 2, 3, 4, 5, 6] },
  { id: "lo_samr", skill: "lysingarord",
    nm: "Samræmi lýsingarorðs",
    ds: "Lýsingarorð lagað að nafnorði eða frumlagi",
    renderer: "gap", weight: 7, recall: false, grader: "app",
    tags: ["adj", "agree:kyn", "case:EF", "case:NF", "case:ÞF", "case:ÞGF", "form", "num"],
    bands: [1, 2, 3, 4, 5, 6, 7] },
  { id: "fn_eyda", skill: "fornofn",
    nm: "Fornafn í eyðu",
    ds: "Persónufornafn í réttu falli: Ég gaf ___ (hún) bókina",
    renderer: "gap", weight: 7, recall: false, grader: "app",
    tags: ["case:EF", "case:ÞF", "case:ÞGF", "form", "num"],
    bands: [1, 2, 3, 4] },
  { id: "fn_stad", skill: "fornofn",
    nm: "Fornafn í stað nafnorðs",
    ds: "Nafnorð í setningu leyst af hólmi með persónufornafni",
    renderer: "gap", weight: 6, recall: false, grader: "app",
    tags: ["agree:kyn", "case:EF", "case:NF", "case:ÞF", "case:ÞGF", "form", "num"],
    bands: [1, 2, 3, 4, 5, 6] },
  { id: "fn_aftur", skill: "fornofn",
    nm: "Afturbeygt eða ekki",
    ds: "sér eða honum, sína eða hans — merkingin ræður",
    renderer: "choice", weight: 5, recall: false, grader: "app",
    tags: ["reflex"],
    bands: [1, 3, 4] },
  { id: "to_samr", skill: "toluord",
    nm: "Töluorð í eyðu",
    ds: "Frumtala 1–4 löguð að nafnorði: Ég á ___ (2) systur",
    renderer: "gap", weight: 5, recall: false, grader: "app",
    tags: ["agree:kyn", "case:EF", "case:NF", "case:ÞF", "case:ÞGF", "form", "num"],
    bands: [1, 2, 3, 4] },
  { id: "to_val", skill: "toluord",
    nm: "Veldu mynd töluorðs",
    ds: "Valið milli mynda af tveir, þrír, fjórir",
    renderer: "choice", weight: 3, recall: false, grader: "app",
    tags: ["agree:kyn", "case:EF", "case:NF", "case:ÞF", "case:ÞGF", "num"],
    bands: [1, 2, 3, 4] },
  { id: "to_dags", skill: "toluord",
    nm: "Dagsetningar",
    ds: "Raðtölur í dagsetningum: ___ (3.) maí",
    renderer: "gap", weight: 4, recall: false, grader: "app",
    tags: ["agree:kyn", "case:EF", "case:NF", "case:ÞF", "case:ÞGF", "form", "num"],
    bands: [1, 2, 3] },
  { id: "to_flt", skill: "toluord",
    nm: "Töluorð með fleirtöluorðum",
    ds: "tvennar buxur, þrenn skæri",
    renderer: "gap", weight: 3, recall: false, grader: "app",
    tags: ["agree:kyn", "case:NF", "case:ÞF", "case:ÞGF", "num", "plnum"],
    bands: [1, 3, 4] },
  { id: "ob_smella", skill: "obeygjanleg",
    nm: "Smelltu á orðin",
    ds: "Öll atviksorð, forsetningar eða samtengingar í setningu",
    renderer: "tap", weight: 4, recall: false, grader: "app",
    tags: ["ofl", "ofl:ao_fs"],
    bands: [1, 2, 3, 4, 5, 6] },
  { id: "ob_fsao", skill: "obeygjanleg",
    nm: "Forsetning eða atviksorð",
    ds: "Sama orð, ólíkt hlutverk: hljóp upp stigann / leit upp",
    renderer: "choice", weight: 4, recall: false, grader: "app",
    tags: ["ofl", "ofl:ao_fs"],
    bands: [1, 2, 3, 4, 5, 6, 7] },
  { id: "ob_st", skill: "obeygjanleg",
    nm: "Veldu samtenginguna",
    ds: "hvort eða ef, sem, né, þótt …",
    renderer: "choice", weight: 4, recall: false, grader: "app",
    tags: ["conj"],
    bands: [1, 4] },
  { id: "ob_flokka", skill: "obeygjanleg",
    nm: "Flokkaðu óbeygjanleg orð",
    ds: "Orð úr setningu sett í orðflokk",
    renderer: "sort", weight: 3, recall: false, grader: "app",
    tags: ["ofl", "ofl:ao_fs"],
    bands: [1, 5, 6, 7] },
  { id: "gr_smella", skill: "greining",
    nm: "Smelltu á orðflokkinn",
    ds: "Öll nafnorð, sagnir, lýsingarorð … í setningu",
    renderer: "tap", weight: 5, recall: false, grader: "app",
    tags: ["ofl", "ofl:ao_fs"],
    bands: [1, 2, 3, 4, 5, 6] },
  { id: "gr_flokka", skill: "greining",
    nm: "Flokkaðu orðin",
    ds: "Orð í orðabókarmynd sett í orðflokk",
    renderer: "sort", weight: 4, recall: false, grader: "app",
    tags: ["ofl"],
    bands: [1, 2, 3, 4, 5] },
  { id: "fs_fsno", skill: "fallstjorn",
    nm: "Forsetning + nafnorð",
    ds: "Nafnorð í réttu falli á eftir forsetningu",
    renderer: "fill", weight: 6, recall: false, grader: "app",
    tags: ["case:EF", "case:ÞF", "case:ÞGF", "form", "noun", "num"],
    bands: [1, 2, 3, 4, 5, 6, 7] },
  { id: "fs_hreyf", skill: "fallstjorn",
    nm: "Hreyfing eða kyrrstaða",
    ds: "í/á með þolfalli eða þágufalli: á borðið / á borðinu",
    renderer: "choice", weight: 5, recall: false, grader: "app",
    tags: ["case:ÞF", "case:ÞGF", "gov:fs", "motion", "noun", "num"],
    bands: [1, 2, 3] },
  { id: "fs_sogn", skill: "fallstjorn",
    nm: "Sögn stýrir falli",
    ds: "hjálpa, sakna, bíða … með nafnorði í réttu falli",
    renderer: "gap", weight: 6, recall: false, grader: "app",
    tags: ["case:EF", "case:ÞF", "case:ÞGF", "form", "gov:so", "noun", "num"],
    bands: [1, 3, 4] },
  { id: "fs_operson", skill: "fallstjorn",
    nm: "Ópersónulegar sagnir",
    ds: "Mig langar, mér finnst — og ég hlakka til",
    renderer: "gap", weight: 5, recall: false, grader: "app",
    tags: ["case:NF", "case:ÞF", "case:ÞGF", "form", "impers", "noun", "num"],
    bands: [1, 3, 4, 5] },
  { id: "or_heiti", skill: "ordaford",
    nm: "Samheiti og andheiti",
    ds: "Orð sem merkir það sama eða hið gagnstæða",
    renderer: "choice", weight: 4, recall: false, grader: "app",
    tags: ["vocab"],
    bands: [1, 2, 3, 4, 5, 6, 7] },
  { id: "or_samhengi", skill: "ordaford",
    nm: "Orð í samhengi",
    ds: "Veldu orðið sem passar í setninguna",
    renderer: "choice", weight: 4, recall: false, grader: "app",
    tags: ["vocab"],
    bands: [1, 3] },
  { id: "or_myndun", skill: "ordaford",
    nm: "Orðmyndun",
    ds: "ó-, -ari, -ing, -un",
    renderer: "gap", weight: 3, recall: false, grader: "app",
    tags: ["wordform"],
    bands: [1, 3, 4, 5] },
  { id: "or_utundan", skill: "ordaford",
    nm: "Hvert á ekki heima?",
    ds: "Fjögur orð, eitt sker sig úr",
    renderer: "choice", weight: 3, recall: false, grader: "app",
    tags: ["vocab"],
    bands: [1, 2, 3, 4, 5] },
  { id: "setn_hlut", skill: "setningafraedi",
    nm: "Hvaða setningarhluti?",
    ds: "Hlutverk undirstrikaðs orðs",
    renderer: "choice", weight: 5, recall: false, grader: "app",
    tags: ["syn"],
    bands: [1, 3, 4, 5, 6, 7] },
  { id: "setn_flokka", skill: "setningafraedi",
    nm: "Flokkaðu setningarhluta",
    ds: "Frumlag, umsögn, andlag, sagnfylling",
    renderer: "sort", weight: 4, recall: false, grader: "app",
    tags: ["syn"],
    bands: [1, 3, 4, 5, 6, 7] },
  { id: "gerd_finna", skill: "setningagerd",
    nm: "Finndu aukasetninguna",
    ds: "Smelltu á öll orð aukasetningar eða nafnháttarsetningar",
    renderer: "tap", weight: 5, recall: false, grader: "app",
    tags: ["clause"],
    bands: [1, 5, 6, 7] },
  { id: "gerd_upphaf", skill: "setningagerd",
    nm: "Hvar hefst setningin?",
    ds: "Fyrsta orð aukasetningar",
    renderer: "choice", weight: 4, recall: false, grader: "app",
    tags: ["clause"],
    bands: [1, 5, 6, 7] },
  /* item 27: what Lesefni teaches and practice did not ask.
     fn_flokkar: six kinds from þyngd 3, the genitive trap from 5, and bank
     sentences up to one level above the band — like fn_stad, so at 6 the
     level-7 sentences (item 14) come in, and 7 adds nothing new. */
  { id: "fn_flokkar", skill: "fornofn",
    nm: "Hvers konar fornafn?",
    ds: "Persónu-, afturbeygt, eignar-, ábendingar-, spurnar- eða óákveðið fornafn í setningu",
    renderer: "choice", weight: 5, recall: false, grader: "app",
    tags: ["fnkind", "fnkind:gen"],
    bands: [1, 2, 3, 4, 5, 6] },
  /* no_beyging: its own steps are 3 (every noun, the traps) and 5 (write the
     genitive); the word is chosen by `wordWeight`, which since item 16 reads
     the level at every step to 5 (regular words first), so 2 and 4 move too.
     The same is true of so_beyging and so_bodhattur below. */
  { id: "no_beyging", skill: "nafnord",
    nm: "Sterkt eða veikt nafnorð",
    ds: "Sterk eða veik beyging af eignarfalli eintölu: til hests, til pabba. Frá þyngd 5 er eignarfallið skrifað",
    renderer: "kenni", weight: 5, recall: false, grader: "app",
    tags: ["case:EF", "form", "nobeyg", "nobeyg:nf"],
    bands: [1, 2, 3, 4, 5] },
  { id: "so_beyging", skill: "sagnord",
    nm: "Sterk eða veik sögn?",
    ds: "Sterk eða veik sögn eftir þátíðinni: í gær kallaði ég, í gær tók ég. Frá þyngd 3 er þátíðin skrifuð, frá þyngd 5 kennimyndirnar",
    renderer: "slots", weight: 5, recall: false, grader: "app",
    tags: ["form", "sobeyg", "sobeyg:hljod", "verb:strongpast"],
    bands: [1, 2, 3, 4, 5] },
  { id: "so_mynd", skill: "sagnord",
    nm: "Germynd, miðmynd eða þolmynd?",
    ds: "Mynd sagnar í setningu: hittust, var byggt — og þú lest, sem er germynd þótt það endi á -st",
    renderer: "choice", weight: 5, recall: false, grader: "app",
    tags: ["somynd", "somynd:st"],
    bands: [1, 3, 5] },
  { id: "so_bodhattur", skill: "sagnord",
    nm: "Boðháttur",
    ds: "Boðháttur skrifaður: komdu, lestu, farðu — og frá þyngd 3 fleirtalan: komið",
    renderer: "slots", weight: 5, recall: false, grader: "app",
    tags: ["bodh", "bodh:nh", "bodh:st", "form"],
    bands: [1, 2, 3, 4, 5] },
  /* item 28: years 9 and 10 */
  { id: "gerd_tegund", skill: "setningagerd",
    nm: "Hvers konar aukasetning?",
    ds: "Fall-, tilvísunar- eða atvikssetning; frá þyngd 4 skýringar-, spurnar-, tíðar-, skilyrðis-, orsakar- og viðurkenningarsetning; frá þyngd 6 líka tilgangs- og afleiðingarsetning",
    renderer: "choice", weight: 7, recall: false, grader: "app",
    tags: ["subkind", "subkind:svo"],
    bands: [1, 4, 6] },
  { id: "setn_lidir", skill: "setningafraedi",
    nm: "Hvers konar liður?",
    ds: "Nafnliður, sagnliður eða forsetningarliður í setningu; frá þyngd 3 líka atviksliður",
    renderer: "choice", weight: 6, recall: false, grader: "app",
    tags: ["lidir", "lidir:fl"],
    bands: [1, 3, 5, 6] },
  { id: "lid_finna", skill: "setningafraedi",
    nm: "Finndu forsetningarliðinn",
    ds: "Smelltu á öll orð forsetningarliðar; frá þyngd 4 geta þeir verið tveir",
    renderer: "tap", weight: 4, recall: false, grader: "app",
    tags: ["lidir"],
    bands: [1, 3, 4, 6] },
  /* raeda (item 28): bein og óbein ræða, on its own */
  { id: "raeda", skill: "malbeiting",
    nm: "Bein og óbein ræða",
    ds: "Settu orð annarra í óbeina ræðu: Hún sagði að hún væri þreytt. Frá þyngd 4 er beina ræðan í þátíð: hefði farið",
    renderer: "umritun", weight: 5, recall: false, grader: "app",
    tags: ["speech", "verb:vh"],
    bands: [1, 4] },
  /* issue #28 (docs/DLD-PLAN.md §3): connectives, on reviewed items only. A
     few dozen short sentences each, so neither follows the band. */
  { id: "ob_tengiord", skill: "obeygjanleg",
    nm: "Veldu tengiorðið",
    ds: "Orsök, tími og andstæða: af því að, þess vegna, þegar, síðan, en",
    renderer: "choice", weight: 3, recall: false, grader: "app",
    tags: ["tengi"],
    bands: [1] },
  { id: "ob_skilja", skill: "obeygjanleg",
    nm: "Hvað segir setningin?",
    ds: "Að skilja hvorki … né og ekki aðeins … heldur einnig",
    renderer: "choice", weight: 2, recall: false, grader: "app",
    tags: ["tengi"],
    bands: [1] },
  /* issue 27: comprehension — who did what to whom. One structure at a time:
     1 the passive, 3 relative clauses whose *sem* is the doer, 5 those whose
     *sem* is the one it is done to. 6 is where the structure hint goes
     (core/hint.js: shown to þyngd 2, offered to 5 — which is also a step at 3). */
  { id: "hver_gerdi", skill: "setningafraedi",
    nm: "Hver gerði hvað?",
    ds: "Hver gerði það og hver varð fyrir því? Fyrst í þolmynd (var bitinn af …), frá þyngd 3 í tilvísunarsetningum (sem …), frá þyngd 5 þegar sem er þolandinn",
    renderer: "hver", weight: 6, recall: false, grader: "app",
    tags: [],
    bands: [1, 3, 5, 6] },
  /* sameina (issue #29): two short sentences into one with a subordinate
     clause, and one into two. An answer the build did not list is shown the
     model and counted neither right nor wrong (tasks/malbeiting.js). */
  { id: "sameina", skill: "malbeiting",
    nm: "Sameina og skipta setningum",
    ds: "Gerðu eina setningu úr tveimur stuttum (af því að, þegar, að, sem) eða skiptu einni setningu í tvær",
    renderer: "umritun", weight: 6, recall: false, grader: "app",
    tags: [],
    bands: [1, 2, 3] },
  /* #14: the first RECALL type (CONTEXT.md). One of the pupil's words in
     learning, typed into a gap in a sentence — with its first letter until
     the word has been recalled once, then without (tasks/recall.js). Built
     only for a pupil who has such a word in a sentence that can be used, so
     a duel, which is built against a blank pupil, never holds it. The band
     chooses the sentence: none harder than the session's level if the word
     has one. The tags are the marks of the forms asked for; a miss is filed
     under no vocabulary pattern, because a wrong case is not a wrong word. */
  { id: "or_eyda", skill: "ordaford",
    nm: "Hvaða orð vantar?",
    ds: "Eitt af orðunum þínum (Orðin mín) skrifað í eyðu í setningu — fyrst með fyrsta stafnum, síðan án hans",
    renderer: "gap", weight: 6, recall: true, grader: "app",
    tags: ["adj", "agree:kyn", "case:EF", "case:NF", "case:ÞF", "case:ÞGF", "form", "noun", "num",
      "verb:agree", "verb:tense", "verb:vh"],
    bands: [1, 2, 3, 4, 5, 6, 7] },
  /* #11 (DLD-PLAN §1 "Meaning question"): the meaning question the app can
     grade, so it counts toward the session — the free-text `meaning` above
     stays the ungraded one. Recognition: the word is shown. Its weight is
     about three times that of each other Orðaforði type. */
  { id: "or_merking", skill: "ordaford",
    nm: "Merking orðs í setningu",
    ds: "Í hvaða setningu af þremur er orðið notað rétt?",
    renderer: "choice", weight: 10, recall: false, grader: "app",
    tags: ["vocab"],
    bands: [1, 3, 4] },
  /* les_adal (issue #30): the first question type on the texts of
     content/textar/ — what a short story or subject text is mainly about,
     on a question written with the text. Three texts so far, so it does not
     follow the band yet (tasks/lesskilningur.js); when there are more than
     four, tests/registry.test.js will ask for the bands here. */
  { id: "les_adal", skill: "lesskilningur",
    nm: "Um hvað er textinn?",
    ds: "Lestu stutta sögu eða fræðitexta og veldu aðalatriðið",
    renderer: "choice", weight: 6, recall: false, grader: "app",
    tags: ["les"],
    bands: [1] },
  /* #37 (DLD-PLAN §6): the explanation in the pupil's own words, read by
     the server against the ÍNO definition. Only for a pupil whose
     administrator switched server grading on, on a server whose grader is
     up (docs/adr/0004); invisible to everybody else. Also the Orðakort's
     free-text step (tasks/wordcard.js). The word is shown: not recall. */
  { id: "or_eigin", skill: "ordaford",
    nm: "Orð útskýrt með eigin orðum",
    ds: "Merking orðs skrifuð með eigin orðum og lesin yfir á þjóninum",
    renderer: "meaning", weight: 4, recall: false, grader: "server",
    tags: [],
    bands: [1] },
  /* #31: the story map — MAIN's six parts (core/storymap.js) and their
     icons (ui/storyicons.js), marked in the text files. Few stories yet, so
     none follows the band (tasks/lesskilningur.js `FEW`). */
  { id: "les_hluti", skill: "lesskilningur",
    nm: "Hvar er vandinn?",
    ds: "Í hvaða setningu sögunnar kemur vandinn eða markmiðið fram?",
    renderer: "choice", weight: 4, recall: false, grader: "app",
    tags: ["sogukort"],
    bands: [1] },
  { id: "les_kort", skill: "lesskilningur",
    nm: "Sögukortið",
    ds: "Hver setning sögunnar á sinn stað í sögukortinu: aðstæður, vandi, markmið, tilraun, útkoma, viðbrögð",
    renderer: "sort", weight: 4, recall: false, grader: "app",
    tags: ["sogukort"],
    bands: [1] },
  { id: "les_samantekt", skill: "lesskilningur",
    nm: "Samantekt sögunnar",
    ds: "Veldu samantektina sem fylgir sögukortinu",
    renderer: "choice", weight: 4, recall: false, grader: "app",
    tags: ["sogukort"],
    bands: [1] },
  /* #38 (DLD-PLAN §1 "Meaning question", §6): the meaning question
     "Hvað þýðir orðið?" graded — the server reads the explanation against
     the ÍNO definition (the same rubric as or_eigin). Asked about a word
     met in this session first, as the free-text `meaning` is, so it counts
     where the bonus did not. Server grading only; or_merking, the one the
     app grades, is unchanged for everybody. */
  { id: "or_skyring", skill: "ordaford",
    nm: "Hvað þýðir orðið? (lesið yfir)",
    ds: "Merking orðs úr lotunni skrifuð með eigin orðum og lesin yfir á þjóninum",
    renderer: "meaning", weight: 6, recall: false, grader: "server",
    tags: [],
    bands: [1] },
  /* #38: the Orðakort's other two free-text steps, also asked in practice
     (DLD-PLAN §1 "The intensive phase": the pupil's own sentence). Server
     grading only. The word is shown: not recall. */
  { id: "or_setning", skill: "ordaford",
    nm: "Mín setning",
    ds: "Setning um eigið líf með orðinu, lesin yfir á þjóninum",
    renderer: "meaning", weight: 4, recall: false, grader: "server",
    tags: [],
    bands: [1] },
  { id: "or_tengsl", skill: "ordaford",
    nm: "Þrjú skyld orð",
    ds: "Þrjú orð sem tengjast orðinu og hvernig hvert tengist því, lesin yfir á þjóninum",
    renderer: "meaning", weight: 2, recall: false, grader: "server",
    tags: [],
    bands: [1] },
  /* #35 (DLD-PLAN §5): Frásögn, steps 1 and 2 — order a story, find the
     part or the sentence that is missing. The stories of content/textar/,
     graded from their story-map marks; every question holds one whole
     story and shows it, with the icons, once answered. Six stories, so none
     follows the band (tasks/frasogn.js `FEW`). */
  { id: "fr_rod", skill: "frasogn",
    nm: "Raðaðu sögunni",
    ds: "Setningar stuttrar sögu í rangri röð: gefðu hverri sitt númer",
    renderer: "sort", weight: 5, recall: false, grader: "app",
    tags: ["fras"],
    bands: [1] },
  { id: "fr_vantar", skill: "frasogn",
    nm: "Hvað vantar í söguna?",
    ds: "Einn hluta sögukortsins vantar: aðstæður, vanda, markmið, tilraun, útkomu eða viðbrögð",
    renderer: "choice", weight: 4, recall: false, grader: "app",
    tags: ["fras"],
    bands: [1] },
  { id: "fr_setning", skill: "frasogn",
    nm: "Hvaða setning vantar?",
    ds: "Veldu setninguna sem á heima í eyðunni í sögunni",
    renderer: "choice", weight: 4, recall: false, grader: "app",
    tags: ["fras"],
    bands: [1] },
  /* les_setning, les_smaatridi, les_kjarni (issue #32): subject texts —
     the main-idea sentence, the details that support it, the best gist of
     four (tasks/lesskilningur.js). Few texts yet, so the band is not
     followed. les_adal asks what a text is about in a question written for
     it; les_setning asks which SENTENCE says it, from the marks. */
  { id: "les_setning", skill: "lesskilningur",
    nm: "Hvar er aðalatriðið?",
    ds: "Smelltu á setninguna sem segir aðalatriði fræðitexta",
    renderer: "tap", weight: 4, recall: false, grader: "app",
    tags: ["les"],
    bands: [1] },
  { id: "les_smaatridi", skill: "lesskilningur",
    nm: "Hvað styður aðalatriðið?",
    ds: "Smelltu á smáatriðin sem styðja aðalatriði fræðitexta",
    renderer: "tap", weight: 4, recall: false, grader: "app",
    tags: ["les"],
    bands: [1] },
  { id: "les_kjarni", skill: "lesskilningur",
    nm: "Besta samantektin",
    ds: "Veldu þá setningu af fjórum sem segir best í stuttu máli hvað stendur í textanum",
    renderer: "choice", weight: 4, recall: false, grader: "app",
    tags: ["les"],
    bands: [1] },
  /* #36 (DLD-PLAN §5): Frásögn, step 3 — a connective and a word for an
     inner state, each in a gap marked in a story's file, with the reason
     each wrong option fails. Unlocked by þyngd: nothing below 3
     (tasks/frasogn.js STEP3_FROM), the same questions from 3 up. */
  { id: "fr_tengiord", skill: "frasogn",
    nm: "Tengiorð í sögu",
    ds: "Veldu tengiorðið sem passar í söguna: af því að, þess vegna, þegar, síðan eða en",
    renderer: "choice", weight: 4, recall: false, grader: "app",
    tags: ["sogumal"],
    bands: [1, 3] },
  { id: "fr_innra", skill: "frasogn",
    nm: "Hvað vildi persónan, hvernig leið henni?",
    ds: "Veldu orðið um hugsanir eða tilfinningar sem passar í söguna: vildi, glöð, fegin …",
    renderer: "choice", weight: 4, recall: false, grader: "app",
    tags: ["sogumal"],
    bands: [1, 3] },
  /* #39 (DLD-PLAN §4, §6): the main idea of a subject text, and a story's
     summary, in the pupil's own words — read on the server against the
     text's marks (server/rubric-kjarni.mjs, server/rubric-saga.mjs). Server
     grading only; few texts, so the band is not followed. */
  { id: "les_kjarni_eigin", skill: "lesskilningur",
    nm: "Aðalatriðið með þínum orðum",
    ds: "Aðalatriði fræðitexta skrifað í einni setningu með eigin orðum og lesið yfir á þjóninum",
    renderer: "meaning", weight: 3, recall: false, grader: "server",
    tags: [],
    bands: [1] },
  { id: "les_saga_eigin", skill: "lesskilningur",
    nm: "Sagan með þínum orðum",
    ds: "Stutt samantekt sögu skrifuð með eigin orðum og lesin yfir á þjóninum",
    renderer: "meaning", weight: 3, recall: false, grader: "server",
    tags: [],
    bands: [1] },
  /* les_visun (issue #33): which word a pronoun points at, tapped in the
     text — the answer from the referent mark of the file, the other options
     from the build (pipeline/pronoun_options.py). From þyngd 2 of the TEXT
     every option agrees with the pronoun, so meaning decides; the text's
     þyngd, not the band, says which (tasks/lesskilningur.js `SAME_FROM`). */
  { id: "les_visun", skill: "lesskilningur",
    nm: "Til hvers vísar fornafnið?",
    ds: "Smelltu á orðið sem fornafn eins og hann, hún eða þau vísar til í texta",
    renderer: "tap", weight: 4, recall: false, grader: "app",
    tags: ["visun"],
    bands: [1] },
  /* #40 (DLD-PLAN §5, §6): Frásögn, steps 4–6 — the pupil writes, and the
     server reads it against the story map (server/rubric-frasogn.mjs): one
     part into a model story, a new story on a model's frame, their own
     story. Server grading only (docs/adr/0004). Each unlocked by þyngd
     after step 3: nothing below 4, 5 and 6 (tasks/frasogn.js STEP_FROM),
     the same questions from there up. */
  { id: "fr_hluti", skill: "frasogn",
    nm: "Skrifaðu hlutann sem vantar",
    ds: "Einn hluta sögukortsins vantar í sögu: skrifaðu hann, lesið yfir á þjóninum",
    renderer: "meaning", weight: 4, recall: false, grader: "server",
    tags: [],
    bands: [1, 4] },
  { id: "fr_hlidstaed", skill: "frasogn",
    nm: "Ný saga með sama sniði",
    ds: "Ný saga með sömu sex hlutum og fyrirmyndin, lesin yfir á þjóninum",
    renderer: "meaning", weight: 3, recall: false, grader: "server",
    tags: [],
    bands: [1, 5] },
  { id: "fr_eigin", skill: "frasogn",
    nm: "Þín eigin saga",
    ds: "Eigin saga með sögukortið sem gátlista, lesin yfir á þjóninum",
    renderer: "meaning", weight: 3, recall: false, grader: "server",
    tags: [],
    bands: [1, 6] },
];

/** What is wrong with a list of declarations, as sentences; empty when
    nothing is. Read as untrusted: a test passes broken ones.
    @param {readonly any[]} [list] @returns {string[]} */
export function catalogueFaults(list = LIST) {
  const faults = [];
  const seen = new Set();
  for (const t of list) {
    const at = `core/catalogue.js ${t && t.id}`;
    if (!t || typeof t.id !== "string" || !t.id) { faults.push("core/catalogue.js: an entry without an id"); continue; }
    if (seen.has(t.id)) faults.push(`${at}: declared twice`);
    seen.add(t.id);
    if (!SKILL_IDS.includes(t.skill)) faults.push(`${at}: ${t.skill} is not a skill (core/skills.js)`);
    if (t.anyOf && !(Array.isArray(t.anyOf) && t.anyOf.includes(t.skill))) faults.push(`${at}: anyOf leaves out its own skill`);
    if (t.anyOf && t.anyOf.some((s) => !SKILL_IDS.includes(s))) faults.push(`${at}: anyOf names something that is not a skill`);
    if (typeof t.nm !== "string" || !t.nm) faults.push(`${at}: no name (nm)`);
    if (typeof t.ds !== "string" || !t.ds) faults.push(`${at}: no description (ds)`);
    if (!(typeof t.weight === "number" && t.weight > 0)) faults.push(`${at}: no weight`);
    if (t.weightInRun != null && !(typeof t.weightInRun === "number" && t.weightInRun >= 0))
      faults.push(`${at}: weightInRun must be a number, 0 or more`);
    if (typeof t.renderer !== "string" || !t.renderer) faults.push(`${at}: no renderer`);
    if (typeof t.recall !== "boolean") faults.push(`${at}: recall must be true or false`);
    if (!GRADERS.includes(t.grader)) faults.push(`${at}: grader must be "app" or "server"`);
    if (!Array.isArray(t.tags)) faults.push(`${at}: no tags`);
    if (!Array.isArray(t.bands) || t.bands[0] !== 1 ||
        t.bands.some((b, k) => !Number.isInteger(b) || b < 1 || b > 7 || (k && b <= t.bands[k - 1])))
      faults.push(`${at}: bands must be rising whole numbers from 1 to 7, starting at 1`);
  }
  return faults;
}

{
  /* A catalogue with a hole in it is a programming error, and the place to
     hear about it is here, at once. */
  const faults = catalogueFaults();
  if (faults.length) throw new Error(faults.join("; "));
}

/** Every question type, in duel order.
    @type {readonly Readonly<CatalogueEntry>[]} */
export const CATALOGUE = Object.freeze(LIST.map((t) => Object.freeze(t)));

/** Every type id, in duel order. */
export const CATALOGUE_IDS = Object.freeze(CATALOGUE.map((t) => t.id));

const BY_ID = new Map(CATALOGUE.map((t) => [t.id, t]));

/** @type {(id: string) => ?Readonly<CatalogueEntry>} */
export const catalogueEntry = (id) => BY_ID.get(id) || null;

/** Does any question type serve this skill (its own, or through `anyOf`)?
    A skill can exist before its first type: Námsorð (#19) is on the map and
    in the presets while its types are being built. Whatever plans or offers
    questions — Lota dagsins, the topics a pupil picks, duels, the badges
    that ask for every skill — passes such a skill by.
    @type {(id: string) => boolean} */
export const skillHasTypes = (id) => CATALOGUE.some((t) => t.skill === id || (t.anyOf || []).includes(id));

/** Is answering this type recall (CONTEXT.md)? An unknown id is not.
    @type {(id: string) => boolean} */
export const isRecall = (id) => !!(BY_ID.get(id) || {}).recall;

/** Who grades this type; an unknown id is "app".
    @type {(id: string) => "app"|"server"} */
export const graderOf = (id) => (BY_ID.get(id) || {}).grader || "app";
