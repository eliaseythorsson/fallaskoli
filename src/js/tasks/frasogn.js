/* Frásögn: telling stories (issue #35, docs/DLD-PLAN.md §5) — the first
   two steps of the path, both graded by the app from the story-map marks of
   the stories in content/textar/ (the same files Lesskilningur reads):

     fr_rod       order a scrambled short story: each sentence gets its place
                  (1, 2, …) — the sort renderer, with places as buckets
     fr_vantar    one part of the story map is taken out of a story that has
                  all six; which part is missing? The six icons are the
                  options (choice renderer, `iconOpts`)
     fr_setning   one sentence is taken out and its place shown, with the
                  icon of its part; which sentence goes there? The right one
                  among sentences of the same part from other stories

   Every Frásögn question holds ONE complete story, and when it is answered
   the whole story is shown, in its order, each sentence with its icon
   (`story` on the task: ui/render-more.js draws it under the verdict). The
   session summary then shows the last story of the session's Frásögn part
   once more (core/run.js keeps it, ui/session.js draws it): CONTEXT.md,
   "Frásögn session".

   Step 3 (issue #36), from a gap marked in a story's file
   (pipeline/story_gaps.py, README "Efnið"):

     fr_tengiord  choose the connective in a story sentence: af því að,
                  þess vegna, þegar, síðan, en (issue #28's five)
     fr_innra     choose the word for what someone wants or feels there
                  (vildi, varð glöð, var fegin …)

   Each wrong option has its reason in the file (`whyNot`), as in ob_tengiord.
   Step 3 is unlocked by þyngd: below STEP3_FROM these two build nothing,
   and the skill's questions are steps 1 and 2 (bands [1, 3] in the
   catalogue). A review of an item already met is built at any þyngd, and
   so is step 3 in a session that may not ask steps 1 and 2 (a teacher's
   assignment of node fras-tengsl).

   Steps 4–6 (issue #40), written by the pupil and read on the server
   (grader "server": only for a pupil whose administrator switched server
   grading on, on a server whose grader is up — invisible to everybody
   else, core/policy.js):

     fr_hluti      step 4: one part is taken out of a model story, its icon
                   shown in the gap; the pupil writes it
     fr_hlidstaed  step 5: a model story with its icon frame (each sentence
                   with its part); the pupil writes a new story on the frame
     fr_eigin      step 6: the pupil's own story, with the six icons as the
                   checklist

   The rubric is the story map (server/rubric-frasogn.mjs): the six parts,
   a whole episode in a sensible order, connectives, inner-state words. The
   server reads the source story itself from its build data by the ids the
   browser sends (`read.context`); the browser never sends the story or its
   marks. Feedback is the checklist — the icons of the parts that are there
   ticked — and ONE question of ours about a part still missing; never a
   rewrite (core/answer.js). They are drawn by the `meaning` renderer, a
   box under the prompt, with the story above it (ui/render.js). Each step is unlocked by þyngd like step 3
   (STEP_FROM: 4, 5, 6), and nothing the pupil writes is kept.

   With nine stories none of the types follows the band further (bands: [1],
   as tasks/lesskilningur.js `FEW`); the policy's levels still apply. */

import { EX } from "../../../data/exercises.js";
import { built, FX } from "./effects.js";
import { pick, shuffle, levelFor, itemsForBand, forcedItem, cellWanted, bandFor } from "./shared.js";
import { STORY_PART_IDS, storyPart } from "../core/storymap.js";

/** @typedef {import("../types").View} View */

const SKILL = "frasogn";
/** Fewer items than this: every one at every band (tasks/shared.js). */
const FEW = 80;   /* 40 until #36: two more stories gave fr_setning 59 items */

/** The stories: every saga of content/textar/, whole (all its episodes). */
const STORIES = (EX.textar || []).filter((tx) => tx.k === "saga");

/** The story as it is shown when the question is answered: each sentence
    and its part, in order. @type {(tx: any) => { t: string, p: string }[]} */
export const storyOf = (tx) => tx.s.map((s) => ({ t: s.t, p: s.p }));

/** What the pupil carries away: the story, whole. */
const whole = (tx) => ({ story: storyOf(tx), storyId: tx.id });

/** The story with one sentence taken out: the lines shown above the
    question, the gap where it was. `icon`: the gap shows its part. */
const withGap = (tx, k, icon) => tx.s.map((s, j) => (j === k
  ? { gap: true, ...(icon ? { p: s.p } : {}) } : { t: s.t }));

/* ---------- step 1: order the story ------------------------------------- */

/** Every story of three sentences or more. */
const ORDER_ITEMS = STORIES.filter((tx) => tx.s.length >= 3)
  .map((tx) => ({ tx, lvl: tx.lvl, key: `fr:${tx.id}/rod` }));

/** The places a sentence can have: "1", "2", … (the verdict says "er 3,
    ekki 2."). */
const places = (n) => Array.from({ length: n }, (_, k) => `${k + 1}`);

/** @param {any} lex @param {View} view @param {() => number} rng */
export function taskOrder(lex, view, rng) {
  const want = forcedItem(view);
  const mine = ORDER_ITEMS.filter(() => cellWanted(view, "rod"));
  const x = want ? ORDER_ITEMS.find((y) => y.key === want)
    : pick(itemsForBand(view, SKILL, mine, (y) => y.key, FEW), rng);
  if (!x) return null;
  const items = x.tx.s.map((s, k) => ({ w: s.t, cls: `${k + 1}` }));
  /* scrambled, and never in the story's own order */
  let mixed = shuffle(items, rng);
  if (mixed.every((it, k) => it === items[k])) mixed = [...items.slice(1), items[0]];
  return built({
    type: "sort", skill: SKILL, long: true,
    title: "Raðaðu sögunni",
    question: "Setningarnar eru í rangri röð. Í hvaða röð gerist sagan? Gefðu hverri setningu sitt númer.",
    items: mixed, buckets: places(items.length),
    ...whole(x.tx),
    base: 6 + 2 * items.length, lvl: levelFor(view.policy, x.lvl), cell: "rod", word: null,
    item: x.key, tags: ["fras"], miss: ["sogubygging"],
  }, [FX.exSeen(x.key)]);
}

/* ---------- step 2: the missing part ------------------------------------ */

/** A sentence whose part is the only one of its kind in a story that has
    all six parts: taken out, exactly one part of the map is missing, so the
    answer follows from the marks alone. */
const PART_ITEMS = STORIES
  .filter((tx) => STORY_PART_IDS.every((p) => tx.s.some((s) => s.p === p)))
  .flatMap((tx) => tx.s.map((s, k) => ({ s, k }))
    .filter(({ s }) => tx.s.filter((y) => y.p === s.p).length === 1)
    .map(({ s, k }) => ({ tx, k, part: s.p, lvl: tx.lvl, key: `fr:${tx.id}/vantar/${k}` })));

/** @param {any} lex @param {View} view @param {() => number} rng */
export function taskMissingPart(lex, view, rng) {
  const want = forcedItem(view);
  const mine = PART_ITEMS.filter(() => cellWanted(view, "vantar"));
  const x = want ? PART_ITEMS.find((y) => y.key === want)
    : pick(itemsForBand(view, SKILL, mine, (y) => y.key, FEW), rng);
  if (!x) return null;
  const part = storyPart(x.part);
  return built({
    type: "choice", skill: SKILL, i: -1,
    lines: withGap(x.tx, x.k, false), kind: "saga", iconOpts: true,
    title: "Hvað vantar í söguna?",
    question: "Einn hluta sögukortsins vantar í söguna. Hvaða hluta vantar?",
    /* the six parts, always in the map's order: the icons are the options */
    options: [...STORY_PART_IDS], answer: x.part,
    why: `Setningin sem vantaði er **${part.nm.toLowerCase()}**: ${part.ask} Allir hinir hlutarnir eru í sögunni.`,
    ...whole(x.tx),
    base: 10, lvl: levelFor(view.policy, x.lvl), cell: "vantar", word: null,
    item: x.key, tags: ["fras"], miss: ["sogubygging"],
  }, [FX.exSeen(x.key)]);
}

/* ---------- step 2: the missing sentence -------------------------------- */

/** May a sentence of another story stand as a wrong option? Not one that
    opens with a pronoun (*Hún kom samt of seint …*): without its own story
    it could seem to fit anywhere. */
const standsAlone = (s) => !(s.ref || []).some((r) => r.i === 0);

/** Every sentence of a story of three sentences or more, with the wrong
    options it may have: sentences of the same part from other stories
    first, then any other sentence of another story. */
const SENTENCE_ITEMS = STORIES.filter((tx) => tx.s.length >= 3).flatMap((tx) => tx.s.map((s, k) => {
  const other = STORIES.filter((o) => o !== tx).flatMap((o) => o.s)
    .filter((o) => standsAlone(o) && !tx.s.some((y) => y.t === o.t));
  return { tx, k, s, lvl: tx.lvl, key: `fr:${tx.id}/setning/${k}`,
    same: other.filter((o) => o.p === s.p).map((o) => o.t),
    rest: other.filter((o) => o.p !== s.p).map((o) => o.t) };
})).filter((x) => STORY_PART_IDS.includes(x.s.p) && x.same.length + x.rest.length >= 2);

/** @param {any} lex @param {View} view @param {() => number} rng */
export function taskMissingSentence(lex, view, rng) {
  const want = forcedItem(view);
  const mine = SENTENCE_ITEMS.filter(() => cellWanted(view, "setning"));
  const x = want ? SENTENCE_ITEMS.find((y) => y.key === want)
    : pick(itemsForBand(view, SKILL, mine, (y) => y.key, FEW), rng);
  if (!x) return null;
  const wrong = [...shuffle(x.same, rng), ...shuffle(x.rest, rng)].slice(0, 2);
  const part = storyPart(x.s.p);
  return built({
    type: "choice", skill: SKILL, i: -1,
    lines: withGap(x.tx, x.k, true), kind: "saga", sentOpts: true, part: x.s.p,
    title: "Hvaða setning vantar?",
    question: `Eina setningu vantar í söguna. Hún er **${part.nm.toLowerCase()}** í sögukortinu. Hvaða setning á heima þar?`,
    options: shuffle([x.s.t, ...wrong], rng), answer: x.s.t,
    why: "Rétta setningin passar við það sem kemur á undan og á eftir: sömu persónur, sami vandi.",
    whyNot: Object.fromEntries(wrong.map((w) => [w, "Þessi setning er úr annarri sögu. Hún passar ekki við persónurnar og það sem gerist hér."])),
    ...whole(x.tx),
    base: 10, lvl: levelFor(view.policy, x.lvl), cell: "setning", word: null,
    item: x.key, tags: ["fras"], miss: ["sogubygging"],
  }, [FX.exSeen(x.key)]);
}

/* ---------- step 3: connectives and inner-state words in a story ------- */

/** The þyngd from which step 3 is asked (docs/DLD-PLAN.md §5: the path is
    unlocked by þyngd, after steps 1 and 2). */
export const STEP3_FROM = 3;

/** Is step 3 still shut? Below STEP3_FROM, while steps 1 and 2 are there to
    be done. A session that may ask neither (a teacher who set exactly this
    node, a curriculum without them) has no path to follow, so no door. */
const STEPS_1_2 = ["fr_rod", "fr_vantar", "fr_setning"];
const locked = (view) => shut(view, STEP3_FROM, STEPS_1_2);
/** The door of a step at þyngd `from`, shut while any step before it is
    there to be done (steps 4–6, issue #40, use it too). */
const shut = (view, from, before) => bandFor(view, SKILL) < from && before.some((id) => view.policy.type(id));

/** Every gap of a kind ("tengi" | "innra") in every story. */
const gapItems = (k) => STORIES.flatMap((tx) => tx.s.map((s, j) => ({ tx, j, g: s.g }))
  .filter((x) => x.g && x.g.k === k)
  .map((x) => ({ ...x, lvl: x.tx.lvl, key: `fr:${x.tx.id}/${k}/${x.j}` })));
const CONNECTIVE_ITEMS = gapItems("tengi");
const INNER_ITEMS = gapItems("innra");

const GAP_ASK = {
  tengi: { title: "Tengiorð í sögu", cell: "tengi",
    question: "Hvaða orð tengir setninguna best við söguna? Lestu það sem kemur á undan og á eftir." },
  innra: { title: "Hvað vildi persónan, hvernig leið henni?", cell: "innra",
    question: "Hvaða orð passar við söguna á þessum stað? Hugsaðu um hvað hefur gerst og hvað gerist næst." },
};

/** One gap in a story: the story one sentence a line, the gapped sentence
    with ___, its options; the reason for each wrong one (`whyNot`). */
function gapTask(view, rng, items, k) {
  const want = forcedItem(view);
  if (!want && locked(view)) return null;
  const ask = GAP_ASK[k];
  const mine = items.filter(() => cellWanted(view, ask.cell));
  const x = want ? items.find((y) => y.key === want)
    : pick(itemsForBand(view, SKILL, mine, (y) => y.key, FEW), rng);
  if (!x) return null;
  const { g } = x;
  return built({
    type: "choice", skill: SKILL, i: -1,
    lines: x.tx.s.map((s, j) => (j === x.j ? { t: g.t, blank: true } : { t: s.t })), kind: "saga",
    title: ask.title, question: ask.question,
    options: shuffle([g.a, ...g.w], rng), answer: g.a, why: g.why, whyNot: { ...g.no },
    ...whole(x.tx),
    base: 8, lvl: levelFor(view.policy, x.lvl), cell: ask.cell, word: null,
    item: x.key, tags: ["sogumal"], miss: ["sogumal"],
  }, [FX.exSeen(x.key)]);
}

/** @param {any} lex @param {View} view @param {() => number} rng */
export const taskConnective = (lex, view, rng) => gapTask(view, rng, CONNECTIVE_ITEMS, "tengi");
/** @param {any} lex @param {View} view @param {() => number} rng */
export const taskInnerState = (lex, view, rng) => gapTask(view, rng, INNER_ITEMS, "innra");

/* ---------- steps 4–6: written, read on the server (issue #40) ---------

   The checklist lines and the follow-up questions are OUR words: the task's
   `rubric` (core/answer.js `checklistOf`). A point whose id is a part of the
   story map is drawn with its icon (ui/serverask.js), so the parts the
   pupil's story has are the icons ticked. What each point MEANS for the
   model, and the source story it is graded against, are the server's
   (server/rubric-frasogn.mjs, which imports the ids below). */

/** The type ids, which are also the kinds the server's reader knows. */
export const HLUTI = "fr_hluti";
export const HLIDSTAED = "fr_hlidstaed";
export const EIGIN_SAGA = "fr_eigin";

/** The þyngd from which each written step is asked: after step 3, one
    step at a time (DLD-PLAN §5: the path is unlocked by þyngd). */
export const STEP_FROM = Object.freeze({ [HLUTI]: 4, [HLIDSTAED]: 5, [EIGIN_SAGA]: 6 });
const STEPS_1_3 = [...STEPS_1_2, "fr_tengiord", "fr_innra"];
const BEFORE = { [HLUTI]: STEPS_1_3, [HLIDSTAED]: [...STEPS_1_3, HLUTI],
  [EIGIN_SAGA]: [...STEPS_1_3, HLUTI, HLIDSTAED] };

/** The most the pupil may write: the server's reader takes no more
    (server/grading.mjs GRADER.maxChars; tests/frasogn40.test.js holds the
    two together). The box stops there. */
export const STORY_MAX_CHARS = 1200;
export const PART_MAX_CHARS = 400;

/** The question each part asks when it is still missing: what the pupil
    reads as the ONE follow-up. */
export const PART_ASK = Object.freeze({
  "aðstæður": "Hver er í sögunni, og hvar og hvenær gerist hún?",
  vandi: "Hvað gerist sem kemur sögunni af stað? Hvaða vandi kemur upp?",
  "markmið": "Hvað vill persónan gera eða ná fram?",
  tilraun: "Hvað gerir persónan til að leysa vandann?",
  "útkoma": "Hvernig fer að lokum? Tekst það eða ekki?",
  "viðbrögð": "Hvernig líður persónunni á eftir, eða hvað hugsar hún þá?",
});

/** A point for each part of the map: its icon (by id), name and question. */
const partPoint = (id) => {
  const part = /** @type {any} */ (storyPart(id));
  return { id, label: `**${part.nm}**: ${part.ask}`, ask: PART_ASK[id] };
};

/** The points of a whole story (steps 5 and 6). `heild` — a problem, what
    was done about it and how it ended, in an order that holds — is the
    main point: it alone decides right or wrong (MAIN's complete episode). */
const STORY_POINTS = [
  { id: "heild", label: "Heil saga: vandi, tilraun og útkoma, í röð sem gengur upp",
    ask: "Hvaða vandi kemur upp í sögunni þinni, hvað gerir persónan við honum og hvernig fer?" },
  ...STORY_PART_IDS.map(partPoint),
  { id: "tengiord", label: "Orð sem tengja atburði: *af því að, þess vegna, þegar, síðan* …",
    ask: "Geturðu tengt tvo atburði í sögunni saman með orði eins og *af því að*, *þess vegna*, *þegar* eða *síðan*?" },
  { id: "hugarastand", label: "Orð um hugsanir eða tilfinningar: *vildi, hélt, varð hrædd* …",
    ask: "Hvað hugsaði persónan eða hvernig leið henni? Geturðu sagt frá því með orði eins og *vildi*, *hélt* eða *varð glöð*?" },
];

/** The rubric of a written story: step 6, and step 5 with `ny`. */
export const storyRubric = ({ parallel = false } = {}) => ({
  main: "heild",
  points: [...STORY_POINTS, ...(parallel ? [{ id: "ny", label: "Ný saga: aðrar persónur og annar vandi",
    ask: "Geturðu breytt sögunni meira, svo að hún fjalli um aðrar persónur og annan vanda en sagan hér fyrir ofan?" }] : [])],
});

/** The rubric of one part written into a story (step 4): the part itself
    (the main point, with its icon), and that it fits the story. */
export const partRubric = (id) => {
  const part = /** @type {any} */ (storyPart(id));
  return {
    main: id,
    points: [
      { id, label: `**${part.nm}**: ${part.ask}`, ask: `Hér vantar ${part.acc}. ${PART_ASK[id]}` },
      { id: "samhengi", label: "Passar við söguna á undan og á eftir",
        ask: "Lestu setninguna á undan eyðunni og á eftir henni. Passar það sem þú skrifaðir við persónurnar og það sem gerist?" },
    ],
  };
};

/** Step 4's items: the same gaps as step 2's missing part (one part, the
    only one of its kind, out of a story that has all six). */
const HLUTI_ITEMS = PART_ITEMS.map((x) => ({ ...x, key: `fr:${x.tx.id}/hluti/${x.k}` }));

/** Step 5's items: every one-episode story with all six parts — the frame
    the pupil's story follows. */
const HLIDSTAED_ITEMS = STORIES
  .filter((tx) => !tx.s.some((s) => s.e) && STORY_PART_IDS.every((p) => tx.s.some((s) => s.p === p)))
  .map((tx) => ({ tx, lvl: tx.lvl, key: `fr:${tx.id}/hlidstaed` }));

/** Step 6 has one item: the pupil's own story. */
const EIGIN_ITEMS = [{ lvl: 1, key: "fr:eigin" }];

/** Pick a written step's item, behind its door. */
function writtenItem(view, rng, id, items, cell) {
  const want = forcedItem(view);
  if (!want && shut(view, STEP_FROM[id], BEFORE[id])) return null;
  const mine = items.filter(() => cellWanted(view, cell));
  return want ? items.find((y) => y.key === want) || null
    : pick(itemsForBand(view, SKILL, mine, (y) => y.key, FEW), rng) || null;
}

/** What every written step shares: the renderer, the grader, the reader. */
const written = (view, x, id, o) => ({
  type: "meaning", typeId: id, grader: "server", skill: SKILL, i: -1, n: null, word: null,
  /* What the server is told: which story and where — never the story. */
  read: { kind: id, context: o.context },
  lvl: levelFor(view.policy, x.lvl), item: x.key, tags: [],
});

/** Step 4: write the part that is missing from a model story.
    @param {any} lex @param {View} view @param {() => number} rng */
export function taskWritePart(lex, view, rng) {
  const x = writtenItem(view, rng, HLUTI, HLUTI_ITEMS, "hluti");
  if (!x) return null;
  const part = /** @type {any} */ (storyPart(x.part));
  return built({
    ...written(view, x, HLUTI, { context: { texti: x.tx.id, setning: x.k } }),
    title: "Skrifaðu hlutann sem vantar",
    lines: withGap(x.tx, x.k, true),
    prompt: { eyebrow: "Skrifaðu hlutann sem vantar",
      question: `Eina setningu vantar í söguna. Hún er **${part.nm.toLowerCase()}** í sögukortinu: ${part.ask} Skrifaðu setningu sem passar þar.`,
      hint: "Ein eða tvær setningar. Lestu það sem kemur á undan og á eftir.", placeholder: "" },
    max: PART_MAX_CHARS, rows: 3,
    rubric: partRubric(x.part),
    ...whole(x.tx),
    base: 10, cell: "hluti",
  }, [FX.exSeen(x.key)]);
}

/** Step 5: a new story on a model story's frame.
    @param {any} lex @param {View} view @param {() => number} rng */
export function taskParallelStory(lex, view, rng) {
  const x = writtenItem(view, rng, HLIDSTAED, HLIDSTAED_ITEMS, "hlidstaed");
  if (!x) return null;
  return built({
    ...written(view, x, HLIDSTAED, { context: { texti: x.tx.id } }),
    title: "Ný saga með sama sniði",
    /* the frame: the model story, each sentence with its part's icon */
    frame: storyOf(x.tx),
    prompt: { eyebrow: "Ný saga með sama sniði",
      question: "Hér er saga og sögukortið hennar. Skrifaðu nýja sögu með sömu sex hlutum í sömu röð, en um aðrar persónur og annan vanda.",
      hint: "Ein eða tvær setningar fyrir hvern hluta. Persónurnar mega heita hvað sem er, en notaðu ekki nöfn fólks sem þú þekkir.",
      placeholder: "" },
    max: STORY_MAX_CHARS, rows: 8,
    rubric: storyRubric({ parallel: true }),
    ...whole(x.tx),
    base: 16, cell: "hlidstaed",
  }, [FX.exSeen(x.key)]);
}

/** Step 6: the pupil's own story, the six icons the checklist.
    @param {any} lex @param {View} view @param {() => number} rng */
export function taskOwnStory(lex, view, rng) {
  const x = writtenItem(view, rng, EIGIN_SAGA, EIGIN_ITEMS, "eigin");
  if (!x) return null;
  return built({
    ...written(view, x, EIGIN_SAGA, { context: {} }),
    title: "Þín eigin saga",
    map: true,
    prompt: { eyebrow: "Þín eigin saga",
      question: "Skrifaðu þína eigin sögu. Notaðu sögukortið sem gátlista: aðstæður, vandi, markmið, tilraun, útkoma og viðbrögð.",
      hint: "Sex til tíu setningar. Persónurnar mega heita hvað sem er, en notaðu ekki nöfn fólks sem þú þekkir.",
      placeholder: "" },
    max: STORY_MAX_CHARS, rows: 8,
    rubric: storyRubric(),
    /* No `story`: the pupil's own is not kept, not even for the summary. */
    base: 16, cell: "eigin",
  }, [FX.exSeen(x.key)]);
}

/** For tests and tools: the items of each type. */
export const FRASOGN_ITEMS = Object.freeze({ fr_rod: ORDER_ITEMS, fr_vantar: PART_ITEMS, fr_setning: SENTENCE_ITEMS,
  fr_tengiord: CONNECTIVE_ITEMS, fr_innra: INNER_ITEMS,
  [HLUTI]: HLUTI_ITEMS, [HLIDSTAED]: HLIDSTAED_ITEMS, [EIGIN_SAGA]: EIGIN_ITEMS });

/** The builders of this category, by question type id. What each type is —
   its name, renderer, tags, bands and weight — is declared in
   core/catalogue.js; tasks/registry.js joins the two.
   @type {Record<string, import("../types").Builder>} */
export const BUILDERS = {
  fr_rod: { build: taskOrder },
  fr_vantar: { build: taskMissingPart },
  fr_setning: { build: taskMissingSentence },
  fr_tengiord: { build: taskConnective },
  fr_innra: { build: taskInnerState },
  [HLUTI]: { build: taskWritePart },
  [HLIDSTAED]: { build: taskParallelStory },
  [EIGIN_SAGA]: { build: taskOwnStory },
};
