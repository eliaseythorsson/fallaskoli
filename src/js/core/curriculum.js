// @ts-check
/* The curriculum map as data (item 39). The prose, the sources and what could
 * and could not be verified are in docs/CURRICULUM.md; read that first.
 *
 * Three things live here:
 *
 *   CRITERIA  the official hæfniviðmið the app can be measured against. The
 *             aðalnámskrá (greinasvið 2024, kafli 19) sets them only for the
 *             END of year 10 (and 4 and 7). There are six under "Mál og
 *             málnotkun" and one on spelling under "Ritun". Nothing official
 *             exists per year for years 8 and 9.
 *
 *   NODES     the fine-grained things a pupil actually learns, each tied to
 *             one criterion, one category, the question types that test it
 *             and the Lesefni page that teaches it. The skill map of item 83
 *             draws one node per entry. A node with no question types is
 *             material the app does not ask about yet: the backlog of items
 *             27 and 28, drawn as a locked node.
 *
 *   PRESETS   8., 9. and 10. bekkur, derived from the nodes (never typed by
 *             hand): which categories and question types a year switches on.
 *
 * Why `year` is on the node and not in the aðalnámskrá: the national text
 * does not say in which year anything is taught. The year here follows the
 * textbooks for years 8–10 and published school plans (see the document),
 * and schools differ. It is a sensible default, not a rule; the switches
 * stay available to the adult.
 *
 * Node ids are STABLE. Saved progress will be keyed by them (item 83), so an
 * id is never renamed or reused; a node that is no longer wanted is removed
 * and its id retired. tests/curriculum-map.test.js pins the list.
 *
 * Pure data and pure functions. This file imports nothing, so that
 * skills.js, policy.js and the server can all read it without a cycle; the
 * tests check every reference against the real catalogues. */

/** @typedef {import("../types").Node} Node */

/* ---------- the official criteria ---------------------------------------- */

/**
 * `nm` is the heading the aðalnámskrá gives the criterion. The full wording
 * is quoted in docs/CURRICULUM.md, not here: it was read through a fetch tool
 * and should be compared with the official page before it is shown to anyone.
 * `scope` says how much of the criterion a drill program can reach at all.
 */
export const CRITERIA = [
  { id: "ordflokkar", flokkur: "Mál og málnotkun", nm: "Orðflokkar", scope: "core" },
  { id: "einkenni",   flokkur: "Mál og málnotkun", nm: "Einkenni málsins", scope: "core" },
  { id: "fjolbreytt", flokkur: "Mál og málnotkun", nm: "Fjölbreytt málnotkun", scope: "part" },
  { id: "skopun",     flokkur: "Mál og málnotkun", nm: "Sköpunarkraftur", scope: "part" },
  { id: "ordtok",     flokkur: "Mál og málnotkun", nm: "Orðtök og málshættir", scope: "part" },
  { id: "gogn",       flokkur: "Mál og málnotkun", nm: "Gögn og hjálpartæki", scope: "outside" },
  { id: "stafsetning", flokkur: "Ritun", nm: "Stafsetning og greinarmerkjasetning", scope: "part" },
  /* Issue #30: the texts of Lesskilningur. The heading and the section are
     the aðalnámskrá's; the wording was read in a school's plan, not on the
     official page (docs/CURRICULUM.md says so beside it). */
  { id: "lesskilningur", flokkur: "Lestur og bókmenntir", nm: "Lesskilningur", scope: "part" },
];

export const YEARS = [8, 9, 10];

/**
 * Categories the nodes need that are not skills yet. Spelling has an official
 * criterion and no category in the app; item 28 decides whether it gets one.
 */
export const PLANNED_CATEGORIES = [
  { id: "stafsetning", nm: "Stafsetning og greinarmerki" },
];

/* ---------- the nodes ---------------------------------------------------- */

/* Fields:
 *   id      stable, never reused
 *   nm      what the pupil sees on the map (Icelandic)
 *   cat     a skill id (core/skills.js) or a planned category above
 *   year    8, 9 or 10: the year it is usually first taught (see above)
 *   hv      the criterion it serves (CRITERIA)
 *   types   question types that test it (core/policy.js QUESTION_TYPES);
 *           empty = no questions yet
 *   lesson  the Lesefni page (content/lessons.js), or null = no page yet
 *   cover   "full"  a question type is about exactly this
 *           "part"  it is asked only inside broader questions; a type of its
 *                   own is backlog
 *           "none"  nothing asks it
 *   attrs   optional: the inflectional features that single this node out
 *           inside its types, in the keys of policy.js ATTRIBUTES. A session
 *           on the node narrows to these (item 83).
 *   item    for backlog nodes: the improvement item that would close the gap
 *   classes optional: the word classes a question on the node may be about,
 *           for a node asked inside a broader type (Kyn og tala nafnorða is
 *           "Greindu orðið" on nouns only). A session on the node narrows to
 *           these (`attrs.ofl` of the session, core/policy.js narrowPolicy).
 */
/** @type {Node[]} */
export const NODES = [
  /* ---- Nafnorð ---- */
  { id: "no-foll", nm: "Föllin fjögur", cat: "nafnord", year: 8, hv: "ordflokkar",
    types: ["fill", "no_val", "tbl_no"], lesson: "foll", cover: "full" },
  { id: "no-kyn-tala", nm: "Kyn og tala nafnorða", cat: "nafnord", year: 8, hv: "ordflokkar",
    types: ["parse"], lesson: "kyn-tala", cover: "part", item: 27, classes: ["nafnorð"] },
  { id: "no-beyging", nm: "Sterk og veik beyging nafnorða og kenniföll", cat: "nafnord",
    year: 8, hv: "ordflokkar", types: ["no_beyging"], lesson: "nafnord-beyging", cover: "full" },

  /* ---- Lýsingarorð ---- */
  { id: "lo-beyging", nm: "Sterk og veik beyging lýsingarorða", cat: "lysingarord", year: 8,
    hv: "ordflokkar", types: ["lo_beyging", "tbl_lo", "revform"], lesson: "lo-beyging", cover: "full" },
  { id: "lo-stig", nm: "Stigbreyting", cat: "lysingarord", year: 8, hv: "ordflokkar",
    types: ["lo_stig", "tbl_lo"], lesson: "stigbreyting", cover: "full",
    attrs: { stig: ["MID", "EFST"] } },
  { id: "lo-samraemi", nm: "Samræmi lýsingarorðs og nafnorðs", cat: "lysingarord", year: 8,
    hv: "ordflokkar", types: ["lo_samr"], lesson: "samraemi", cover: "full" },

  /* ---- Fornöfn og greinir ---- */
  { id: "fn-personu", nm: "Persónufornöfn í öllum föllum", cat: "fornofn", year: 8,
    hv: "ordflokkar", types: ["fn_eyda", "fn_stad", "tbl_fn"], lesson: "fornofn", cover: "full" },
  { id: "fn-greinir", nm: "Laus og viðskeyttur greinir", cat: "fornofn", year: 8,
    hv: "ordflokkar", types: ["tbl_fn"], lesson: "greinir", cover: "part", item: 27 },
  { id: "fn-flokkar", nm: "Flokkar fornafna", cat: "fornofn", year: 8, hv: "ordflokkar",
    types: ["fn_flokkar"], lesson: "fornofn", cover: "full" },
  { id: "fn-afturbeygt", nm: "Afturbeygt fornafn: sér eða honum, sinn eða hans", cat: "fornofn",
    year: 9, hv: "ordflokkar", types: ["fn_aftur"], lesson: "fornofn", cover: "full" },

  /* ---- Töluorð ---- */
  { id: "to-frumtolur", nm: "Frumtölur og beyging þeirra", cat: "toluord", year: 8,
    hv: "ordflokkar", types: ["to_samr", "to_val", "tbl_to"], lesson: "toluord", cover: "full" },
  { id: "to-radtolur", nm: "Raðtölur og dagsetningar", cat: "toluord", year: 8,
    hv: "ordflokkar", types: ["to_dags", "tbl_to"], lesson: "toluord", cover: "full" },
  { id: "to-fleirtolu", nm: "Töluorð með fleirtöluorðum", cat: "toluord", year: 8,
    hv: "ordflokkar", types: ["to_flt"], lesson: "toluord", cover: "full" },

  /* ---- Sagnorð ----
     One set of types (verb, verbslot, tbl_so) carries person, tense, mood and
     voice alike; what separates the nodes is the feature asked, hence `attrs`.
     Measured, not assumed: these types ask framsöguháttur and
     viðtengingarháttur in germynd and miðmynd, and never the boðháttur. */
  { id: "so-persona-tala", nm: "Persóna og tala sagna", cat: "sagnord", year: 8,
    hv: "ordflokkar", types: ["verb", "verbslot", "tbl_so"], lesson: "persona-tala", cover: "full" },
  { id: "so-tid", nm: "Nútíð og þátíð", cat: "sagnord", year: 8, hv: "ordflokkar",
    types: ["verb", "verbslot", "tbl_so"], lesson: "tid", cover: "full",
    attrs: { tid: ["ÞT"] } },
  { id: "so-samsettar-tidir", nm: "Samsettar tíðir", cat: "sagnord", year: 9,
    hv: "ordflokkar", types: [], lesson: "tid", cover: "none", item: 27 },
  { id: "so-vidtengingarhattur", nm: "Framsöguháttur og viðtengingarháttur", cat: "sagnord",
    year: 9, hv: "ordflokkar", types: ["verb", "verbslot", "tbl_so"], lesson: "hattur",
    cover: "full", attrs: { hattur: ["VH"] } },
  { id: "so-bodhattur", nm: "Boðháttur", cat: "sagnord", year: 9, hv: "ordflokkar",
    types: ["revform", "so_bodhattur"], lesson: "hattur", cover: "full",
    attrs: { hattur: ["BH"] } },
  { id: "so-fallhaettir", nm: "Fallhættir: nafnháttur, lýsingarhættir og sagnbót",
    cat: "sagnord", year: 9, hv: "ordflokkar", types: ["revform", "parse"], lesson: "hattur",
    cover: "part", item: 27, attrs: { hattur: ["NH", "LHNT", "LHÞT", "SAGNB"] },
    /* "Greindu orðið" on verbs in a sentence too: a nafnháttur is the same
       form as the 3rd person plural (*koma*), so the bare-form question can
       hardly ever ask it; in *Ég ætla að koma* it is plain (owner feedback, 6.13). */
    classes: ["sagnorð"] },
  { id: "so-midmynd", nm: "Germynd og miðmynd", cat: "sagnord", year: 9, hv: "ordflokkar",
    types: ["verb", "verbslot", "tbl_so"], lesson: "mynd", cover: "full",
    attrs: { mynd: ["MM"] } },
  { id: "so-tholmynd", nm: "Þolmynd", cat: "sagnord", year: 9, hv: "ordflokkar",
    types: ["umritun", "so_mynd"], lesson: "mynd", cover: "full" },
  { id: "so-sterkar-veikar", nm: "Sterkar og veikar sagnir og kennimyndir", cat: "sagnord",
    year: 9, hv: "ordflokkar", types: ["so_beyging"], lesson: "sterkar-veikar", cover: "full" },

  /* ---- Óbeygjanleg orð ---- */
  { id: "ob-flokkar", nm: "Að þekkja óbeygjanleg orð", cat: "obeygjanleg", year: 8,
    hv: "ordflokkar", types: ["indecl", "ob_smella", "ob_flokka"], lesson: "obeygjanleg",
    cover: "full" },
  { id: "ob-fs-ao", nm: "Forsetning eða atviksorð", cat: "obeygjanleg", year: 9,
    hv: "ordflokkar", types: ["ob_fsao"], lesson: "obeygjanleg", cover: "full" },
  { id: "ob-samtengingar", nm: "Samtengingar", cat: "obeygjanleg", year: 9,
    hv: "ordflokkar", types: ["ob_st"], lesson: "obeygjanleg", cover: "full" },
  /* issue #28: what a connective MEANS — cause, time, contrast, and the
     paired ones. Year 8: it is the easiest thing in the category, written
     for pupils with developmental language disorder (docs/DLD-PLAN.md §3). */
  { id: "ob-tengiord", nm: "Tengiorð: orsök, tími og andstæða", cat: "obeygjanleg", year: 8,
    hv: "ordflokkar", types: ["ob_tengiord", "ob_skilja"], lesson: "obeygjanleg", cover: "full" },
  { id: "ob-atviksord", nm: "Flokkar atviksorða og stigbreyting þeirra", cat: "obeygjanleg",
    year: 9, hv: "ordflokkar", types: [], lesson: null, cover: "none", item: 28 },

  /* ---- Orðflokkagreining ---- */
  { id: "gr-ordflokkar", nm: "Orðflokkagreining", cat: "greining", year: 8,
    hv: "ordflokkar", types: ["parse", "gr_smella", "gr_flokka"], lesson: "ordflokkar",
    cover: "full" },

  /* ---- Fallstjórn ---- */
  { id: "fs-forsetningar", nm: "Fallstjórn forsetninga", cat: "fallstjorn", year: 8,
    hv: "ordflokkar", types: ["govern", "fs_fsno"], lesson: "fallstjorn", cover: "full" },
  { id: "fs-hreyfing", nm: "Hreyfing eða kyrrstaða", cat: "fallstjorn", year: 8,
    hv: "ordflokkar", types: ["fs_hreyf"], lesson: "fallstjorn", cover: "full" },
  { id: "fs-sagnir", nm: "Fallstjórn sagna", cat: "fallstjorn", year: 8, hv: "ordflokkar",
    types: ["govern", "fs_sogn"], lesson: "fallstjorn", cover: "full" },
  { id: "fs-operson", nm: "Ópersónulegar sagnir", cat: "fallstjorn", year: 9,
    hv: "ordflokkar", types: ["fs_operson"], lesson: "fallstjorn", cover: "full" },

  /* ---- Orðaforði ---- */
  { id: "or-merking", nm: "Merking orða, samheiti og andheiti", cat: "ordaford", year: 8,
    hv: "fjolbreytt", types: ["meaning", "or_heiti", "or_samhengi", "or_utundan", "or_eyda", "or_merking", "or_eigin",
      "or_skyring", "or_setning", "or_tengsl"],
    lesson: "ordafordi", cover: "full" },
  { id: "or-myndun", nm: "Orðmyndun með forskeytum og viðskeytum", cat: "ordaford", year: 8,
    hv: "skopun", types: ["or_myndun"], lesson: "ordafordi", cover: "full" },
  { id: "or-ordtok", nm: "Orðtök, málshættir og föst orðasambönd", cat: "ordaford", year: 8,
    hv: "ordtok", types: [], lesson: null, cover: "none", item: 28 },
  { id: "or-ordhlutar", nm: "Orðhlutar og samsett orð", cat: "ordaford", year: 10,
    hv: "einkenni", types: [], lesson: null, cover: "none", item: 28 },
  { id: "or-hljodbreytingar", nm: "Hljóðbreytingar og skyldleiki orða", cat: "ordaford",
    year: 10, hv: "einkenni", types: [], lesson: null, cover: "none", item: 28 },

  /* ---- Námsorð (#19): the six words in learning (core/wordknowledge.js) ----
     No question type yet: #11 (the graded meaning question), #14 (the
     recall gap) and #15 (the Orðakort) add theirs to `types` here when they
     file them under Námsorð, and set `cover` to "full". */
  { id: "nams-ordin", nm: "Orðin sem ég er að læra", cat: "namsord", year: 8,
    hv: "fjolbreytt", types: [], lesson: "namsord", cover: "none", item: 28 },

  /* ---- Málbeiting ---- */
  { id: "mb-villur", nm: "Villuveiðar", cat: "malbeiting", year: 8, hv: "einkenni",
    types: ["villur"], lesson: "malbeiting", cover: "full" },
  { id: "mb-smidja", nm: "Setningasmiðja", cat: "malbeiting", year: 8, hv: "einkenni",
    types: ["smidja"], lesson: "malbeiting", cover: "full" },
  { id: "mb-umritun", nm: "Umritun", cat: "malbeiting", year: 8, hv: "einkenni",
    types: ["umritun"], lesson: "malbeiting", cover: "full" },
  { id: "mb-malsnid", nm: "Málsnið: talmál og ritmál", cat: "malbeiting", year: 9,
    hv: "fjolbreytt", types: [], lesson: null, cover: "none", item: 28 },
  { id: "mb-raeda", nm: "Bein og óbein ræða", cat: "malbeiting", year: 10, hv: "einkenni",
    types: ["raeda"], lesson: "raeda", cover: "full" },
  /* Issue #29: two short sentences into one and one into two. Year 8 with
     the rest of Málbeiting: it is writing, not naming the clause. */
  { id: "mb-sameina", nm: "Að sameina og skipta setningum", cat: "malbeiting", year: 8, hv: "einkenni",
    types: ["sameina"], lesson: "malbeiting", cover: "full" },

  /* ---- Setningafræði ---- */
  { id: "setn-hlutar", nm: "Frumlag, umsögn, andlag og sagnfylling", cat: "setningafraedi",
    year: 10, hv: "einkenni", types: ["syntax", "setn_hlut", "setn_flokka", "hver_gerdi"],
    lesson: "setningarhlutar", cover: "full" },
  { id: "setn-ordarod", nm: "Orðaröð", cat: "setningafraedi", year: 10, hv: "einkenni",
    types: ["umritun"], lesson: "malbeiting", cover: "part", item: 28 },
  { id: "setn-lidir", nm: "Nafnliður, sagnliður og forsetningarliður", cat: "setningafraedi",
    year: 10, hv: "einkenni", types: ["setn_lidir", "lid_finna"], lesson: "lidir", cover: "full" },

  /* ---- Setningagerðir ---- */
  { id: "gerd-adal-auka", nm: "Aðalsetning, aukasetning og nafnháttarsetning",
    cat: "setningagerd", year: 10, hv: "einkenni",
    types: ["clause", "gerd_finna", "gerd_upphaf"], lesson: "setningagerdir", cover: "full" },
  { id: "gerd-tegundir", nm: "Tegundir aukasetninga", cat: "setningagerd", year: 10,
    hv: "einkenni", types: ["gerd_tegund"], lesson: "aukasetningar", cover: "full" },

  /* ---- Lesskilningur (issue #30, docs/DLD-PLAN.md §4) ---- */
  /* Year 8, so in the presets of all three years: reading a short text for
     what it is mainly about is not tied to a year. #32 adds the subject-text
     types (main-idea sentence, details, gist) to the same node: they test
     the same error pattern, and a pattern sits on one node. */
  { id: "les-adalatridi", nm: "Aðalatriði texta", cat: "lesskilningur", year: 8,
    hv: "lesskilningur", types: ["les_adal", "les_setning", "les_smaatridi", "les_kjarni"],
    lesson: "lesskilningur", cover: "full" },
  /* issue #31: MAIN's story map — the parts of a story, and a summary that follows them */
  { id: "les-sogukort", nm: "Sögukort: hlutar sögu", cat: "lesskilningur", year: 8,
    hv: "lesskilningur", types: ["les_hluti", "les_kort", "les_samantekt"], lesson: "lesskilningur", cover: "full" },

  /* ---- Frásögn (issue #35, docs/DLD-PLAN.md §5) ---- */
  /* Year 8, so in every preset. Under Sköpunarkraftur: the criterion that
     names using the language in writing, speech and skáldskapur; ordering a
     story and finding its missing part are the first steps toward telling
     one (steps 4–6, written stories, come with the server grader). */
  { id: "fras-bygging", nm: "Bygging sögu: röð og hlutar", cat: "frasogn", year: 8,
    hv: "skopun", types: ["fr_rod", "fr_vantar", "fr_setning"], lesson: "frasogn", cover: "full" },
  /* #36: step 3 of the path — the words that hold a story together and say
     what its people want and feel (DLD-PLAN §5: taught directly). */
  { id: "fras-tengsl", nm: "Tengiorð og orð um hugsanir í sögu", cat: "frasogn", year: 8,
    hv: "skopun", types: ["fr_tengiord", "fr_innra"], lesson: "frasogn", cover: "full" },

  /* ---- Stafsetning og greinarmerki: a criterion with no category yet ---- */
  { id: "st-n-nn", nm: "n eða nn", cat: "stafsetning", year: 8, hv: "stafsetning",
    types: [], lesson: null, cover: "none", item: 28 },
  { id: "st-y", nm: "y, ý og ey", cat: "stafsetning", year: 8, hv: "stafsetning",
    types: [], lesson: null, cover: "none", item: 28 },
  { id: "st-stor-stafur", nm: "Stór og lítill stafur", cat: "stafsetning", year: 8,
    hv: "stafsetning", types: [], lesson: null, cover: "none", item: 28 },
  { id: "st-greinarmerki", nm: "Greinarmerki", cat: "stafsetning", year: 8,
    hv: "stafsetning", types: [], lesson: null, cover: "none", item: 28 },
];

export const NODE_IDS = NODES.map((n) => n.id);

const BY_ID = new Map(NODES.map((n) => [n.id, n]));
/** @type {(id: string) => ?Node} */
export const nodeById = (id) => BY_ID.get(id) || null;

/** Is there anything to practise on this node today? A locked node is not.
    @type {(n: ?Node) => boolean} */
export const nodeHasQuestions = (n) => !!(n && n.types.length);

/** The nodes of one category, youngest year first, in the order written.
    @type {(cat: string) => Node[]} */
export const nodesOfCategory = (cat) =>
  NODES.filter((n) => n.cat === cat).sort((a, b) => a.year - b.year);

/** The nodes a year adds (not the ones it inherits).
    @type {(year: number) => Node[]} */
export const nodesOfYear = (year) => NODES.filter((n) => n.year === year);

/** Every node a question type tests: one type can serve several nodes.
    @type {(type: string) => Node[]} */
export const nodesOfType = (type) => NODES.filter((n) => n.types.includes(type));

/** The backlog: everything that is not fully covered, for items 27 and 28.
    @type {(item?: ?number) => Node[]} */
export const backlog = (item = null) =>
  NODES.filter((n) => n.cover !== "full" && (item == null || n.item === item));

/* ---------- the presets, derived ----------------------------------------- */

/* Difficulty by year. This is the app's own convention, written down in
 * core/difficulty.js long before this file: 1–5 is year 8, 6 is year 9 and
 * 7 is year 10. Since v6.13 the bank has sentences at 6 and 7 (pipeline/sentences.py),
 * so the three presets differ in how hard the sentences get as well as in
 * categories and types. */
const TOP_LEVEL = { 8: 5, 9: 6, 10: 7 };

/* A node that puts its category in a year: one with questions — or any
   node of a skill that has no questions anywhere yet (Námsorð until its
   first type, #19). Such a skill is switched on by the presets like the
   rest, so it is on the day its first type arrives, and everything that
   plans questions passes it by until then (core/catalogue.js
   `skillHasTypes`). A planned category is never switched on. */
const PLANNED = new Set(PLANNED_CATEGORIES.map((c) => c.id));
const counts = (n) => !PLANNED.has(n.cat) &&
  (n.types.length > 0 || !NODES.some((m) => m.cat === n.cat && m.types.length));

/**
 * What a year covers, read off the nodes: a year includes everything from
 * the years below it. A category is in if any of its nodes that has
 * questions is (or, for a skill with none yet, any of its nodes); a type is
 * in if any such node lists it.
 *
 * @param {number} year
 * @returns {?{ year: number, skills: string[], types: string[], topLevel: number }}
 *          null for a year that is not 8, 9 or 10
 */
export function presetContent(year) {
  if (!YEARS.includes(year)) return null;
  const live = NODES.filter((n) => n.year <= year && counts(n));
  /* A node's types may come from another category (kyn og tala is asked
     inside the word-class analysis), so the categories are taken from the
     nodes and never from the types. */
  const skills = [...new Set(live.map((n) => n.cat))];
  const types = [...new Set(live.flatMap((n) => n.types))];
  return { year, skills, types, topLevel: TOP_LEVEL[year] };
}

/** The label a category carries in the interface: the year it starts. */
export function firstYearOf(cat) {
  const live = NODES.filter((n) => n.cat === cat && counts(n));
  return live.length ? Math.min(...live.map((n) => n.year)) : null;
}
