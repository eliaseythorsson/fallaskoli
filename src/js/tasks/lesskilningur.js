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

   With server grading on for the pupil (issue #39; DLD-PLAN §4, §6), two
   more, written in the pupil's own words and read on the server against
   the text's marks (server/rubric-kjarni.mjs, server/rubric-saga.mjs):

     les_kjarni_eigin  the main idea of a subject text, in one sentence
     les_saga_eigin    a short summary of a story

   The browser sends the text's id and the answer, never the text or its
   marks: the server reads both from its own build data.

   Pronoun reference (issue #33) gives one more, from the referent marks
   (`ref`, with the other words the build found beside each — `same`,
   `other`):

     les_visun       which word a pronoun points at: tap it in the text */

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
const FEW = 24;   /* 12 until #36 and #33: their four stories gave les_hluti 17 items */

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

/* ---------- in the pupil's own words, read on the server (issue #39) -------

   Brown & Day's rules again, now written instead of picked: say what the
   whole text is about (not one detail, not something that fits any text),
   add nothing it does not say, and say it in your own words — not a
   sentence of the text copied. The checklist lines and the one follow-up
   question are OUR words (core/answer.js `checklistOf`); what each point
   means for the model, and the copy check, are the server's. Nothing the
   pupil writes here is kept, in progress or on the server (DLD-PLAN §6). */

/** The type ids, which are also the kinds the server's reader knows. */
export const KJARNI_EIGIN = "les_kjarni_eigin";
export const SAGA_EIGIN = "les_saga_eigin";

/** About how many words a gist is (DLD-PLAN §4: "at most about 15"). Said
    to the pupil, not graded. */
export const GIST_WORDS = 15;

/** The rubric of a subject text's main idea. `adal` is the main point: it
    alone decides right or wrong. */
export const kjarniRubric = () => ({
  main: "adal",
  points: [
    { id: "adal", label: "Aðalatriði textans er komið",
      ask: "Um hvað fjalla flestar setningarnar í textanum? Hvað segja hinar setningarnar nánar frá?" },
    { id: "rett", label: "Ekkert sem stendur ekki í textanum",
      ask: "Lestu textann aftur. Stendur allt sem þú skrifaðir í honum?" },
    { id: "eigin", label: "Með þínum eigin orðum",
      ask: "Geturðu sagt þetta með þínum eigin orðum, í stað þess að afrita setningu úr textanum?" },
  ],
});

/** The rubric of a story's summary. `adal` — the problem and how it
    ended — is the main point. */
export const sagaRubric = () => ({
  main: "adal",
  points: [
    { id: "adal", label: "Þú segir frá vandanum og hvernig fór",
      ask: "Hvaða vandi kom upp í sögunni, og hvernig fór að lokum?" },
    { id: "hlutar", label: "Það helsta sem gerðist er með, í réttri röð",
      ask: "Hvað gerðu persónurnar til að leysa vandann? Segðu frá því í sömu röð og í sögunni." },
    { id: "rett", label: "Ekkert sem stendur ekki í sögunni",
      ask: "Lestu söguna aftur. Stendur allt sem þú skrifaðir í henni?" },
    { id: "eigin", label: "Með þínum eigin orðum",
      ask: "Geturðu sagt þetta með þínum eigin orðum, í stað þess að afrita setningar úr sögunni?" },
  ],
});

/** Every subject text (each has exactly one [aðalatriði]: the reader's rule). */
const OWN_GIST = SUBJECT.map((tx) => ({ tx, lvl: tx.lvl, key: `les:${tx.id}:eigin` }));
/** Stories of a paragraph or more (þyngd 2 and up): a story of two or three
    sentences is retold by copying it. */
const OWN_SUMMARY = (EX.textar || []).filter((tx) => tx.k === "saga" && tx.lvl >= 2)
  .map((tx) => ({ tx, lvl: tx.lvl, key: `les:${tx.id}:endursogn` }));

/** A question read on the server: the text above, a box below (the
    `meaning` renderer with `text` and `prompt`). */
function ownWords(view, x, { typeId, rubric, prompt, base, cell, after }) {
  return built({
    type: "meaning", typeId, grader: "server", skill: "lesskilningur", i: -1,
    n: null, word: null,
    text: x.tx.s.map((s) => s.t), kind: x.tx.k,
    prompt,
    /* What the server is told: which text — never the text, never its marks. */
    read: { kind: typeId, context: { texti: x.tx.id } },
    rubric,
    /* Shown with the verdict, once the answer has been read. */
    after,
    base, lvl: levelFor(view.policy, x.lvl), cell, item: x.key,
  }, [FX.exSeen(x.key)]);
}

/** The main idea of a subject text, in one sentence of the pupil's own.
    @param {any} lex @param {View} view @param {() => number} rng */
export function taskOwnGist(lex, view, rng) {
  const x = pickItem(view, rng, OWN_GIST, "kjarni:eigin");
  if (!x) return null;
  const main = x.tx.s.find((s) => s.p === "aðalatriði");
  return ownWords(view, x, {
    typeId: KJARNI_EIGIN, rubric: kjarniRubric(), base: 10, cell: "kjarni:eigin",
    prompt: {
      eyebrow: "Aðalatriðið með þínum orðum",
      question: "Hvað er aðalatriði textans? Skrifaðu það í einni setningu með þínum eigin orðum.",
      hint: `Ekki meira en um ${GIST_WORDS} orð. Ekki afrita setningu úr textanum.`,
      placeholder: "",
    },
    after: main ? { label: "Aðalatriðið í textanum", text: main.t } : null,
  });
}

/** A story retold in short, in the pupil's own words.
    @param {any} lex @param {View} view @param {() => number} rng */
export function taskOwnSummary(lex, view, rng) {
  const x = pickItem(view, rng, OWN_SUMMARY, "samantekt:eigin");
  if (!x) return null;
  /* The summary written with the story, if it has one (`? [samantekt]`). */
  const model = x.tx.q.find((q) => q.k === "samantekt");
  return ownWords(view, x, {
    typeId: SAGA_EIGIN, rubric: sagaRubric(), base: 12, cell: "samantekt:eigin",
    prompt: {
      eyebrow: "Sagan með þínum orðum",
      question: "Segðu frá sögunni í stuttu máli með þínum eigin orðum.",
      hint: "Tvær til fjórar setningar: hver vandinn var, hvað persónurnar gerðu og hvernig fór. Ekki afrita setningar úr sögunni.",
      placeholder: "",
    },
    after: model ? { label: "Ein leið til að segja söguna stutt", text: model.a } : null,
  });
}

/* ---------- pronoun reference (issue #33) ----------------------------------

   Til hvers vísar fornafnið? The text up to the pronoun's sentence, the
   pronoun marked, and only the candidate words tappable: the referent and up
   to three others. The answer is the mark of the file (`Hann{Jón}`); the
   others are found by the build (pipeline/pronoun_options.py) and stored on
   the reference:

     same    the text's characters in the pronoun's gender and number
     other   nouns in another gender or number

   Which of the two the question offers depends on the text's þyngd
   (DLD-PLAN §4: "at higher þyngd there are same-gender distractors"):

     þyngd 1      `other`: the form of the pronoun is enough (*Hún* … *Sara*,
                  not *strætó*) — the first lesson, that a pronoun follows
                  the grammatical gender of what it points at;
     þyngd 2 and up   `same` only: every option agrees with the pronoun, so the
                  pupil must read for meaning (*Pétur lánaði honum* — not
                  Pétur himself, so Gunnar).

   A reference with no option of the kind its þyngd asks for is not asked
   (*Hann{Ari}* while Ari is the only boy in the story). One question per
   referent and sentence: the second *hún* of *Hún var svo glöð að hún …*
   asks nothing new. Genuinely ambiguous pronouns are not asked at all; the
   texts are written so that the meaning settles every mark. */

/** From this þyngd the options agree with the pronoun (`same`). */
export const SAME_FROM = 2;

const VISUN = (EX.textar || []).flatMap((tx) => tx.s.flatMap((s, si) => {
  const seen = new Set();
  return (s.ref || []).flatMap((r) => {
    const to = r.to.join(".");
    if (seen.has(to)) return [];
    seen.add(to);
    const others = ((tx.lvl >= SAME_FROM ? r.same : r.other) || []).slice(0, 3);
    if (!others.length) return [];
    return [{ tx, si, r, others, same: tx.lvl >= SAME_FROM, lvl: tx.lvl, key: `les:${tx.id}/vis/${si}.${r.i}` }];
  });
}));

const KYN = { KK: "karlkyni", KVK: "kvenkyni", HK: "hvorugkyni" };

/** The words of a span [sentence, first, last] of a text, as one string. */
const spanWords = (tx, [k, a, b]) => tx.s[k].tok.slice(a, b + 1).map((t) => t.w).join(" ");

/** The text up to the pronoun's sentence as tap tokens: each option one
    token (a span of several words joined), the pronoun `still` (marked),
    every other word `plain`. Returns the tokens and the index of each
    option's token, in the order of `spans`.
    @param {any} tx @param {number} upTo @param {number[][]} spans @param {number[]} pro */
function referenceTokens(tx, upTo, spans, pro) {
  /** @type {{w: string, still?: boolean, plain?: boolean}[]} */
  const tok = [];
  const at = spans.map(() => -1);
  for (let k = 0; k <= upTo; k++) {
    const words = tx.s[k].tok;
    for (let j = 0; j < words.length; j++) {
      const n = spans.findIndex(([sk, a]) => sk === k && a === j);
      if (n >= 0) {
        at[n] = tok.length;
        tok.push({ w: spanWords(tx, spans[n]) });
        j = spans[n][2];
      } else if (k === pro[0] && j === pro[1]) tok.push({ w: words[j].w, still: true });
      else tok.push({ w: words[j].w, plain: true });
    }
  }
  return { tok, at };
}

/** Which word does the pronoun point at?
    @param {any} lex @param {View} view @param {() => number} rng */
export function taskPronounReference(lex, view, rng) {
  const x = pickItem(view, rng, VISUN, "visun");
  if (!x) return null;
  const pro = x.tx.s[x.si].tok[x.r.i];
  const p = pro.w.toLowerCase();
  const order = shuffle([x.r.to, ...x.others], rng);
  const { tok, at } = referenceTokens(x.tx, x.si, order, [x.si, x.r.i]);
  const answer = spanWords(x.tx, x.r.to);
  const [g, n] = (pro.m || "").split("-");
  const form = `í ${KYN[g] || "sama kyni"} og ${/FT/.test(n || "") ? "fleirtölu" : "eintölu"}`;
  const why = x.same
    ? `${order.length === 2 ? "Bæði" : "Öll"} orðin sem þú gast smellt á eru ${form}, eins og *${p}*. Þá segir kynið ekki til hvers fornafnið vísar, heldur merkingin: hugsaðu um hver gerir hvað. Hér vísar *${p}* til orðsins *${answer}*.`
    : `Fornafnið *${p}* er ${form}, eins og *${answer}*. ${order.length === 2 ? "Hitt orðið er ekki í sama kyni og tölu, svo að fornafnið getur ekki vísað til þess."
      : "Hin orðin eru ekki í sama kyni og tölu, svo að fornafnið getur ekki vísað til þeirra."}`;
  return built({
    type: "tap", skill: "lesskilningur", i: -1,
    s: { t: tok.map((t) => t.w).join(" "), tok }, targets: [at[order.indexOf(x.r.to)]],
    cls: "rétt", whole: true, what: `„${p}“ vísar til`, unit: "eitt orð",
    title: "Til hvers vísar fornafnið?",
    question: `Til hvers vísar fornafnið **${p}**? Smelltu á orðið.`,
    why,
    base: 10, lvl: levelFor(view.policy, x.lvl), cell: "visun", word: null,
    item: x.key, tags: ["visun"], miss: ["visun"],
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
  les_setning: { build: taskMainSentence },
  les_smaatridi: { build: taskDetails },
  les_kjarni: { build: taskGist },
  les_kjarni_eigin: { build: taskOwnGist },
  les_saga_eigin: { build: taskOwnSummary },
  les_visun: { build: taskPronounReference },
};
