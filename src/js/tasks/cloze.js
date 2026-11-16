/* The noun cloze: a sentence from the bank with its noun slot blanked, and a
   noun the sentence accepts (tasks/frames.js) to be written in the right
   form.

   In a file of its own because two categories ask for it: Nafnorð (the cloze
   itself, and the same thing as a choice between case forms) and Fallstjórn
   (the cloze only where the slot stands right after a preposition). */

import { readMark } from "../core/marks.js";
import { wordKey } from "../core/state.js";
import { explainSlot } from "./explain.js";
import { substitutable, acceptsNoun, candidateNouns, settled, repeatsNoun } from "./frames.js";
import { pick, wpick, askable, sentPool, drilling, wordWeight, isTimeNoun } from "./shared.js";

/**
 * The bare cloze task, or null.
 * @param noun  ask about this noun (the same word again after a wrong answer,
 *              or the word of a drill) — in a sentence that accepts it
 * @param only  (s, i) => boolean: use only slots this accepts
 */
export function nounCloze(lex, view, rng, { noun = null, only = null } = {}) {
  const P = view.policy;
  let s = null, n = null, a = null;
  const pool0 = sentPool(lex, view, "nafnord");
  if (!pool0.length) return null;
  for (let k = 0; k < 60; k++) {
    s = pick(pool0, rng);
    /* `nf`: the case after the preposition depends on what is meant ("koma
       með hundinn" / "koma með hundinum"), so the sentence is never a cloze. */
    if (s.slot == null || s.nf) continue;
    /* v6.11: a builder may ask for one kind of slot only (Fallstjórn: the
       noun right after a preposition). */
    if (only && !only(s, s.slot)) continue;
    const t = s.tok[s.slot];
    /* The case has to be settled whether or not the slot is a template:
       "eftir vinnu" was marked dative by a guess, and the cloze then showed
       the dative cell as the answer. */
    if (!settled(t) || (t.u || []).includes("fall")) continue;
    a = readMark(t.m);
    if (!a.fall) continue;
    if (!askable(P, t.m)) continue;
    const open = substitutable(s);
    /* A drill wants its own word, so a sentence with its noun fixed is no use. */
    if (drilling(view) && !open) continue;
    if (noun && open) {
      /* The same word again after a wrong answer — but only in a sentence
         that accepts it. */
      if (!acceptsNoun({ rk: s.rk, need: s.need, ps: s.ps || null }, noun, t.m)
          || repeatsNoun(s, s.slot, noun)) continue;
      n = noun;
    } else if (!open) {
      /* Not a template: asked with the noun it was written with. */
      n = lex.lookup(t.l, t.c) || lex.lookup(t.l, "nafnorð");
      if (!n) continue;
    } else {
      const pool = candidateNouns(lex, s);
      if (!pool.length) continue;
      n = wpick(pool, (x) => wordWeight(lex, view, x, "nafnord"), rng);
    }
    if (!n || !n.forms[t.m]) continue;
    break;
  }
  if (!n) return null;
  /* The loop can end on a sentence that was turned down after a noun was
     chosen for it; never build a question whose cell the noun does not have. */
  if (!s || s.slot == null || !n.forms[s.tok[s.slot].m]) return null;

  const t = s.tok[s.slot];
  return {
    type: "fill", skill: "nafnord", s, i: s.slot, n, m: t.m, a,
    answers: n.forms[t.m], lvl: s.lvl, base: 10,
    cell: t.m, word: wordKey(n.o, n.c),
    why: explainSlot(s, s.slot, { time: isTimeNoun(n) }),
    paradigm: n.forms,
  };
}
