/* Lesskilningur: reading short stories and subject texts (issue #30,
   docs/DLD-PLAN.md §4).

     les_adal   what the text is mainly about — a question written with the
                text, one right answer among three or four

   The texts are hand-written, one plain-text file each in content/textar/
   (README.md, "Efnið", describes the format). The build reads them with the
   one reader (pipeline/content_io.py `texts`), parses every sentence with
   Greynir and hands them over as `EX.textar`:

     { id, lvl, k: "saga" | "fræðitexti", orð: [target words],
       s: [{ t, tok, cl?, ph?, ku?,        the sentence, as the bank holds one
             p,                            its story-map or main-idea part
             ref?: [{ i, to: [sentence, first token, last token] }] }],
                                           a pronoun (token i) and its referent
       q: [{ k: "aðalatriði", q, a, w: [wrong …], why }] }

   The story map (issue #31) — MAIN's six parts, core/storymap.js, with the
   icons of ui/storyicons.js — gives three more:

     les_hluti       which sentence is the vandi, or the markmið — the
                     sentences of the story (of one episode) are the options
     les_kort        fill the story map: each sentence of a story (of one
                     episode) to its part, the six icons as the buckets
     les_samantekt   the summary that follows the map, among wrong ones that
                     break it — all written in the text file (`? [samantekt]`)

   A sentence of a story with episodes carries `e` (1–3); a summary question
   carries `br`, what each wrong summary breaks (a part, or "röð").

   Subject texts (issue #32) give three more, from the marks:

     les_setning     which sentence of a subject text is its main idea:
                     tap it in the text (the [aðalatriði] mark)
     les_smaatridi   which sentences support the main idea: tap them all
                     (the [smáatriði] marks; an [annað] sentence is the
                     distractor, so only texts that have one are asked)
     les_kjarni      the best gist sentence of four: a [kjarni] question,
                     whose three wrong answers are one too narrow, one too
                     broad, one that contradicts or invents (its `br`:
                     þröngt / vítt / rangt) — the app says which, after
                     Brown & Day (1983)

   The pronoun references (`ref`) are there for #33. */

import { EX } from "../../../data/exercises.js";
import { built, FX } from "./effects.js";
import { pick, shuffle, levelFor, itemsForBand, forcedItem, cellWanted } from "./shared.js";
import { STORY_PART_IDS, storyPart, breakNote } from "../core/storymap.js";

/** @typedef {import("../types").View} View */

/** Every main-idea question, with its text. The key is the text's file name
    and the question's place in it: stable while the file keeps its name. */
const MAIN_IDEA = (EX.textar || []).flatMap((tx) => tx.q
  .map((q, n) => ({ tx, q, n, lvl: tx.lvl, key: `les:${tx.id}#${n}` }))
  .filter((x) => x.q.k === "aðalatriði"));

/** The cell is the kind of text: a story is read for what happened, a
    subject text for what it says. */
const mainIdeaCell = (x) => "adal:" + (x.tx.k === "saga" ? "saga" : "fraedi");

/** What is the text mainly about? The whole text is shown, then the question
    as it was written, with its answers shuffled.

    The item a review asks for, or one this pupil may meet, has not just seen
    and is near their band (`itemsForBand`: with four texts or fewer, any of
    them). @param {any} lex @param {View} view @param {() => number} rng */
export function taskMainIdea(lex, view, rng) {
  const want = forcedItem(view);
  const mine = MAIN_IDEA.filter((y) => cellWanted(view, mainIdeaCell(y)));
  const x = want ? MAIN_IDEA.find((y) => y.key === want)
    : pick(itemsForBand(view, "lesskilningur", mine, (y) => y.key), rng);
  if (!x) return null;
  const story = x.tx.k === "saga";
  return built({
    type: "choice", skill: "lesskilningur", i: -1,
    /* `text`: the sentences of the text, drawn as one paragraph above the
       question (ui/render-more.js) */
    text: x.tx.s.map((s) => s.t), kind: x.tx.k,
    title: story ? "Um hvað er sagan?" : "Um hvað er textinn?",
    question: x.q.q,
    options: shuffle([x.q.a, ...x.q.w], rng), answer: x.q.a, why: x.q.why,
    base: 10, lvl: levelFor(view.policy, x.lvl), cell: mainIdeaCell(x), word: null,
    item: x.key, tags: ["les"], miss: ["adalatridi"],
  }, [FX.exSeen(x.key)]);
}

/* ---------- the story map (issue #31) ----------------------------------------

   With few texts, every item at every band: `itemsForBand` would otherwise
   keep a band-1 pupil to the one or two stories of þyngd 1 and ask them over
   and over. Until a type has more items than this, it does not follow the
   band (its catalogue entry says bands: [1]); the policy's levels still
   apply. */
const FEW = 12;

/** The stories, each cut into its episodes: [{ tx, ep (1–3, or 0 for a
    story without episodes), s: [{ s, k }] (the sentence and its place in the
    whole text) }]. */
const EPISODES = (EX.textar || []).filter((tx) => tx.k === "saga").flatMap((tx) => {
  const eps = [...new Set(tx.s.map((s) => s.e || 0))];
  return eps.map((ep) => ({ tx, ep, s: tx.s.map((s, k) => ({ s, k })).filter((x) => (x.s.e || 0) === ep) }));
});

/** The sentences before an episode: what a pupil reads first, so that the
    second episode is not read without the first. */
const before = (x) => (x.ep > 1 ? x.tx.s.filter((s) => (s.e || 0) < x.ep).map((s) => s.t) : []);
const inEpisode = (x) => (x.ep ? ` í ${x.ep}. þætti` : "");

/** Why a sentence is the part it is: the part's name and its question. */
const partNote = (p) => {
  const part = storyPart(p);
  return part ? `Í sögukortinu er þessi setning **${part.nm.toLowerCase()}**: ${part.ask}`
    : "Þessi setning er ekki einn af hlutum sögukortsins.";
};

const ASKED = {
  vandi: { title: "Hvar er vandinn?", q: "Í hvaða setningu{ep} kemur vandinn fram?",
    why: "**Vandinn** er það sem gerist og kemur sögunni af stað, oft eitthvað sem fer úrskeiðis." },
  markmið: { title: "Hvar er markmiðið?", q: "Í hvaða setningu{ep} kemur markmiðið fram?",
    why: "**Markmiðið** er það sem persónan vill eða ætlar sér." },
};

/** Which sentence is the vandi / the markmið: one item per episode in which
    exactly one sentence is that part. */
const PART_ITEMS = EPISODES.flatMap((x) => Object.keys(ASKED)
  .filter((p) => x.s.filter((y) => y.s.p === p).length === 1)
  .map((p) => ({ ...x, part: p, lvl: x.tx.lvl, key: `les:${x.tx.id}/${p}${x.ep ? "/" + x.ep : ""}` })));

const partCell = (x) => "hluti:" + (x.part === "vandi" ? "vandi" : "markmid");

/** @param {any} lex @param {View} view @param {() => number} rng */
export function taskStoryPart(lex, view, rng) {
  const want = forcedItem(view);
  const mine = PART_ITEMS.filter((y) => cellWanted(view, partCell(y)));
  const x = want ? PART_ITEMS.find((y) => y.key === want)
    : pick(itemsForBand(view, "lesskilningur", mine, (y) => y.key, FEW), rng);
  if (!x) return null;
  const a = ASKED[x.part];
  const options = x.s.map((y) => y.s.t);
  const answer = x.s.find((y) => y.s.p === x.part).s.t;
  return built({
    type: "choice", skill: "lesskilningur", i: -1,
    text: before(x), kind: "saga", part: x.part, sentOpts: true,
    title: a.title, question: a.q.replace("{ep}", inEpisode(x)),
    /* the sentences in the story's order: the options ARE the story */
    options, answer, why: a.why,
    whyNot: Object.fromEntries(x.s.filter((y) => y.s.t !== answer).map((y) => [y.s.t, partNote(y.s.p)])),
    base: 10, lvl: levelFor(view.policy, x.lvl), cell: partCell(x), word: null,
    item: x.key, tags: ["sogukort"], miss: ["sogukort"],
  }, [FX.exSeen(x.key)]);
}

/** Fill the story map: every episode with at least two sentences of the map. */
const MAP_ITEMS = EPISODES
  .map((x) => ({ ...x, s: x.s.filter((y) => STORY_PART_IDS.includes(y.s.p)) }))
  .filter((x) => x.s.length >= 2)
  .map((x) => ({ ...x, lvl: x.tx.lvl, key: `les:${x.tx.id}/kort${x.ep ? "/" + x.ep : ""}` }));

/** @param {any} lex @param {View} view @param {() => number} rng */
export function taskStoryMap(lex, view, rng) {
  const want = forcedItem(view);
  const mine = MAP_ITEMS.filter(() => cellWanted(view, "kort"));
  const x = want ? MAP_ITEMS.find((y) => y.key === want)
    : pick(itemsForBand(view, "lesskilningur", mine, (y) => y.key, FEW), rng);
  if (!x) return null;
  return built({
    type: "sort", skill: "lesskilningur",
    text: before(x), long: true, icons: true,
    title: "Sögukortið",
    question: x.ep ? `Hér er ${x.ep}. þáttur sögunnar. Á hvaða stað í sögukortinu er hver setning?`
      : "Á hvaða stað í sögukortinu er hver setning?",
    items: x.s.map((y) => ({ w: y.s.t, cls: y.s.p })),
    buckets: [...STORY_PART_IDS],
    base: 12, lvl: levelFor(view.policy, x.lvl), cell: "kort", word: null,
    item: x.key, tags: ["sogukort"], miss: ["sogukort"],
  }, [FX.exSeen(x.key)]);
}

/** The summary that follows the map: the summary questions of the stories. */
const SUMMARY = (EX.textar || []).filter((tx) => tx.k === "saga").flatMap((tx) => tx.q
  .map((q, n) => ({ tx, q, n, lvl: tx.lvl, key: `les:${tx.id}#${n}` }))
  .filter((x) => x.q.k === "samantekt"));

/** @param {any} lex @param {View} view @param {() => number} rng */
export function taskSummary(lex, view, rng) {
  const want = forcedItem(view);
  const mine = SUMMARY.filter(() => cellWanted(view, "samantekt"));
  const x = want ? SUMMARY.find((y) => y.key === want)
    : pick(itemsForBand(view, "lesskilningur", mine, (y) => y.key, FEW), rng);
  if (!x) return null;
  return built({
    type: "choice", skill: "lesskilningur", i: -1,
    text: x.tx.s.map((s) => s.t), kind: "saga",
    title: "Samantekt sögunnar", question: x.q.q,
    options: shuffle([x.q.a, ...x.q.w], rng), answer: x.q.a, why: x.q.why,
    /* what each wrong summary breaks, as the text file says */
    whyNot: Object.fromEntries(x.q.w.map((w, k) => [w, (x.q.br || [])[k]])
      .filter(([, b]) => b).map(([w, b]) => [w, breakNote(b)])),
    base: 10, lvl: levelFor(view.policy, x.lvl), cell: "samantekt", word: null,
    item: x.key, tags: ["sogukort"], miss: ["sogukort"],
  }, [FX.exSeen(x.key)]);
}

/* ---------- subject texts: main idea, details, gist (issue #32) ----------

   Stevens 2019 and Brown & Day 1983 (docs/DLD-RESEARCH.md): find the
   sentence that says what the text is about, tell the sentences that support
   it from one that does not, then pick the summary that is neither too
   narrow, nor too broad, nor wrong. The answers are the marks of the file;
   the reader (pipeline/content_io.py) has checked them. */

const SUBJECT = (EX.textar || []).filter((tx) => tx.k === "fræðitexti");

/** The text as a `tap` question's sentence: each SENTENCE is one token to
    tap. `still`: the token that is shown marked and cannot be tapped. */
const tappableText = (tx, still = -1) => ({
  t: tx.s.map((s) => s.t).join(" "),
  tok: tx.s.map((s, j) => (j === still ? { w: s.t, still: true } : { w: s.t })),
});

const MAIN_SENTENCE = SUBJECT.map((tx) => ({ tx, lvl: tx.lvl, key: `les:${tx.id}:adal` }));
/* details: two or more, and one sentence that is not one, to leave out */
const DETAILS = SUBJECT
  .filter((tx) => tx.s.filter((s) => s.p === "smáatriði").length >= 2 && tx.s.some((s) => s.p === "annað"))
  .map((tx) => ({ tx, lvl: tx.lvl, key: `les:${tx.id}:smaatridi` }));
const GIST = SUBJECT.flatMap((tx) => tx.q
  .map((q, n) => ({ tx, q, n, lvl: tx.lvl, key: `les:${tx.id}#${n}` }))
  .filter((x) => x.q.k === "kjarni" && Array.isArray(x.q.br)));

/** One of `items` for this pupil: the one a review asks for, else one near
    their band they have not just seen. */
function pickItem(view, rng, items, cell) {
  const want = forcedItem(view);
  if (!cellWanted(view, cell)) return null;
  return want ? items.find((y) => y.key === want) || null
    : pick(itemsForBand(view, "lesskilningur", items, (y) => y.key, FEW), rng) || null;
}

const ORDINAL_DAT = ["fyrstu", "annarri", "þriðju", "fjórðu", "fimmtu", "sjöttu", "sjöundu", "áttundu", "níundu"];
const COUNT_FEM = { 2: "tvær", 3: "þrjár", 4: "fjórar" };

/** Which sentence is the main idea? The whole text, each sentence a button.
    @param {any} lex @param {View} view @param {() => number} rng */
export function taskMainSentence(lex, view, rng) {
  const x = pickItem(view, rng, MAIN_SENTENCE, "adalsetning");
  if (!x) return null;
  const at = x.tx.s.findIndex((s) => s.p === "aðalatriði");
  const where = at === x.tx.s.length - 1 ? "Hér stendur það aftast og dregur textann saman."
    : at === 0 ? "Hér stendur það fremst."
    : `Hér stendur það í ${ORDINAL_DAT[at]} setningunni.`;
  return built({
    type: "tap", skill: "lesskilningur", i: -1, readtext: true,
    s: tappableText(x.tx), targets: [at],
    cls: "aðalatriði", whole: true, what: "Aðalatriðið", unit: "eina setningu",
    title: "Hvar er aðalatriðið?",
    question: "Smelltu á setninguna sem segir aðalatriði textans: það sem allur textinn fjallar um.",
    why: `Aðalatriðið er setningin sem hinar setningarnar segja nánar frá. Það stendur oft fremst, en ekki alltaf. ${where}`,
    base: 10, lvl: levelFor(view.policy, x.lvl), cell: "adalsetning", word: null,
    item: x.key, tags: ["les"], miss: ["adalatridi"],
  }, [FX.exSeen(x.key)]);
}

/** Which sentences support the main idea? The main idea is shown marked;
    the pupil taps every detail and leaves out the sentence about something
    else. @param {any} lex @param {View} view @param {() => number} rng */
export function taskDetails(lex, view, rng) {
  const x = pickItem(view, rng, DETAILS, "smaatridi");
  if (!x) return null;
  const main = x.tx.s.findIndex((s) => s.p === "aðalatriði");
  const targets = x.tx.s.map((s, j) => (s.p === "smáatriði" ? j : -1)).filter((j) => j >= 0);
  const n = COUNT_FEM[targets.length] || String(targets.length);
  return built({
    type: "tap", skill: "lesskilningur", i: -1, readtext: true,
    s: tappableText(x.tx, main), targets,
    cls: "smáatriði", whole: true, what: "Smáatriðin", unit: "eina setningu",
    title: "Hvað styður aðalatriðið?",
    question: `Aðalatriðið er merkt. Smelltu á þær ${n} setningar sem styðja það.`,
    why: "Smáatriðin segja nánar frá aðalatriðinu: þau gefa dæmi, ástæður eða skýringar. Setning sem segir frá öðru styður það ekki, þótt hún fjalli um sama efni, og á ekki heima í samantekt.",
    base: 10, lvl: levelFor(view.policy, x.lvl), cell: "smaatridi", word: null,
    item: x.key, tags: ["les"], miss: ["adalatridi"],
  }, [FX.exSeen(x.key)]);
}

/** Why a wrong gist does not fit, by its kind (GIST_KINDS in
    pipeline/content_io.py; Brown & Day 1983). */
export const GIST_WHY_NOT = Object.freeze({
  "þröngt": "Þetta er bara eitt smáatriði. Góð samantekt nær yfir allan textann.",
  "vítt": "Þetta er of almennt. Það gæti átt við marga aðra texta og segir ekki hvað stendur í þessum.",
  "rangt": "Þetta segir textinn ekki. Góð samantekt bætir engu við og stangast ekki á við textann.",
});

/** The best gist sentence of four. @param {any} lex @param {View} view @param {() => number} rng */
export function taskGist(lex, view, rng) {
  const x = pickItem(view, rng, GIST, "kjarni");
  if (!x) return null;
  /** @type {Record<string, string>} */
  const whyNot = {};
  x.q.w.forEach((w, k) => { whyNot[w] = GIST_WHY_NOT[x.q.br[k]]; });
  return built({
    type: "choice", skill: "lesskilningur", i: -1,
    text: x.tx.s.map((s) => s.t), kind: x.tx.k,
    title: "Besta samantektin",
    question: x.q.q,
    options: shuffle([x.q.a, ...x.q.w], rng), answer: x.q.a, why: x.q.why, whyNot,
    base: 10, lvl: levelFor(view.policy, x.lvl), cell: "kjarni", word: null,
    item: x.key, tags: ["les"], miss: ["adalatridi"],
  }, [FX.exSeen(x.key)]);
}

/** The builders of this category, by question type id. What each type is —
   its name, renderer, tags, bands and weight — is declared in
   core/catalogue.js; tasks/registry.js joins the two.
   @type {Record<string, import("../types").Builder>} */
export const BUILDERS = {
  les_adal: { build: taskMainIdea },
  les_hluti: { build: taskStoryPart },
  les_kort: { build: taskStoryMap },
  les_samantekt: { build: taskSummary },
  }, [FX.exSeen(x.key)]);
}

  les_setning: { build: taskMainSentence },
  les_smaatridi: { build: taskDetails },
  les_kjarni: { build: taskGist },
};
