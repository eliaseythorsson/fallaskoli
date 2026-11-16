/* "Smelltu á orðin": click every word of one class in a sentence.

   In a file of its own because two categories ask for it: Óbeygjanleg orð
   (adverbs, prepositions, conjunctions) and Orðflokkagreining (any class). */

import { built } from "./effects.js";
import { pick, wpick, bandFor, PUNCT, clean } from "./shared.js";

const PLURAL_OF = {
  "nafnorð": "öll nafnorðin", "lýsingarorð": "öll lýsingarorðin", "fornafn": "öll fornöfnin",
  "töluorð": "öll töluorðin", "sagnorð": "allar sagnirnar", "atviksorð": "öll atviksorðin",
  "forsetning": "allar forsetningarnar", "samtenging": "allar samtengingarnar",
};

/**
 * @param classes  the word classes to choose between
 * @param weights  { class: weight } — how often each is asked; all alike if null
 */
export function tapTask(lex, view, rng, skill, classes, weights) {
  const P = view.policy;
  const b = bandFor(view, skill);
  const pool = lex.sentences.filter((s) => P.level(s.lvl) && s.lvl <= Math.max(2, b + 1) && clean(s)
    && s.tok.filter((t) => !PUNCT.has(t.w)).length >= 4);
  for (let k = 0; k < 40; k++) {
    const cls = weights ? wpick(classes, (x) => weights[x] || 1, rng) : pick(classes, rng);
    const s = pick(pool, rng);
    if (!s) return null;
    const targets = s.tok.map((t, j) => (t.c === cls ? j : -1)).filter((j) => j >= 0);
    if (!targets.length || targets.length > 4) continue;
    return built({
      type: "tap", skill, s, cls, targets,
      title: `Smelltu á ${PLURAL_OF[cls]}`,
      question: `Smelltu á **${PLURAL_OF[cls]}** í setningunni. Smelltu aftur til að afvelja.`,
      base: 6 + 2 * targets.length, lvl: s.lvl, cell: "tap:" + cls, word: null,
      tags: ["ofl", ...(cls === "atviksorð" || cls === "forsetning" ? ["ofl:ao_fs"] : [])],
    });
  }
  return null;
}
