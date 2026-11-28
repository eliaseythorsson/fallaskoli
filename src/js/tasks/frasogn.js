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
   catalogue). A review of an item already met is built at any þyngd.

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
  if (!want && bandFor(view, SKILL) < STEP3_FROM) return null;
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

/** For tests and tools: the items of each type. */
export const FRASOGN_ITEMS = Object.freeze({ fr_rod: ORDER_ITEMS, fr_vantar: PART_ITEMS, fr_setning: SENTENCE_ITEMS,
  fr_tengiord: CONNECTIVE_ITEMS, fr_innra: INNER_ITEMS });

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
};
