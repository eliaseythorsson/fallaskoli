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

   This file uses the sentences as text and the questions. The parts (`p`)
   and the pronoun references (`ref`) are there for the question types that
   come next: the story map (#31), subject texts (#32), pronoun reference
   (#33). */

import { EX } from "../../../data/exercises.js";
import { built, FX } from "./effects.js";
import { pick, shuffle, levelFor, itemsForBand, forcedItem, cellWanted } from "./shared.js";

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

/** The builders of this category, by question type id. What each type is —
   its name, renderer, tags, bands and weight — is declared in
   core/catalogue.js; tasks/registry.js joins the two.
   @type {Record<string, import("../types").Builder>} */
export const BUILDERS = {
  les_adal: { build: taskMainIdea },
};
