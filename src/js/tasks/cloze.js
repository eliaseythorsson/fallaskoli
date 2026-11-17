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
import { pick, wpick, shuffle, askable, sentPool, drilling, forced, forcedCell, wordWeight,
         isTimeNoun, bandFor, caseCellEase } from "./shared.js";

/* How often a slot of each case is let through when the cloze is `balanced`
   (critique item 15). The bank is full of subjects, so left alone 37% of the
   clozes asked for the nominative, which a child hardly ever gets wrong, and
   the dative and genitive, which are the hard cases, came to 18% and 15%.
   These are acceptance odds for a randomly drawn sentence, not shares. */
const CASE_ODDS = { NF: 0.12, "ÞF": 0.45, "ÞG": 0.9, EF: 1 };

/**
 * The bare cloze task, or null.
 * @param noun  ask about this noun (the same word again after a wrong answer,
 *              or the word of a drill) — in a sentence that accepts it
 * @param only  (s, i) => boolean: use only slots this accepts
 * @param balanced  ask for the hard cases more and the nominative less, and
 *              (above þyngd 1) never where the answer is the word on the card
 */
export function nounCloze(lex, view, rng, { noun = null, only = null, balanced = false } = {}) {
  if (forcedCell(view)) return forcedCloze(lex, view, rng, { noun, only });
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
    /* Not in a drill: that asks about one word and takes the sentence it can get. */
    const weigh = balanced && !drilling(view);
    /* Two intents, one each: item 15 decides HOW OFTEN each case is asked
       (CASE_ODDS), and the second axis (item 16) decides WHICH CELL of that
       case — at a low level the plural and the article are kept less often
       (*hestanna* after *hests*), never shut out (a floor). The cell is
       scored within its case (`caseCellEase`): scored on its own, the
       genitive singular already sat at the floor at þyngd 1 and the genitive
       became the rarest case again. Not in a drill, and not for the word
       asked again after a wrong answer: those take the sentence they can get. */
    const ease = drilling(view) || noun ? 1 : caseCellEase(lex, view, "nafnord", t.m);
    const odds = (weigh ? CASE_ODDS[a.fall] : 1) * ease;
    if (odds < 1 && rng() >= odds) continue;
    const open = substitutable(s);
    /* A drill wants its own word, so a sentence with its noun fixed is no
       use — nor is it to the word asked again after a wrong answer: the
       sentence's own noun would be asked instead, the word let go, and the
       pupil never asked it again. */
    if ((drilling(view) || noun) && !open) continue;
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
    /* The card prints the dictionary form; a slot whose answer is that very
       form asks for nothing. At þyngd 1 it stays: the child is still learning
       what the question is. */
    if (weigh && bandFor(view, "nafnord") > 1 && n.forms[t.m].some((f) => f === n.o)) continue;
    break;
  }
  if (!n) return null;
  /* The loop can end on a sentence that was turned down after a noun was
     chosen for it; never build a question whose cell the noun does not have. */
  if (!s || s.slot == null || !n.forms[s.tok[s.slot].m]) return null;

  return clozeTask(s, n, a);
}

const clozeTask = (s, n, a) => {
  const t = s.tok[s.slot];
  return {
    type: "fill", skill: "nafnord", s, i: s.slot, n, m: t.m, a,
    answers: n.forms[t.m], lvl: s.lvl, base: 10,
    cell: t.m, word: wordKey(n.o, n.c),
    why: explainSlot(s, s.slot, { time: isTimeNoun(n) }),
    paradigm: n.forms,
  };
};

/**
 * The cloze a review asks for (tasks/review.js): THIS cell — and this noun,
 * if one is given — or nothing.
 *
 * The loop above draws sentences until one fits, which is right when any
 * cell will do and hopeless when one in sixteen will: here every sentence
 * whose slot stands in the cell is listed first, and one of them is chosen.
 * The sentences near the pupil's level are tried before the rest of what the
 * policy allows, so a review is not suddenly two steps harder than the
 * session — but it is asked rather than dropped.
 *
 * Every rule of the loop above that is about CORRECTNESS holds here too (the
 * case is settled, the cell is allowed, the sentence accepts the noun). The
 * two that are about variety do not: the odds per case, and "not where the
 * answer is the word on the card" — the review asks for what was missed.
 */
function forcedCloze(lex, view, rng, { noun = null, only = null }) {
  const P = view.policy;
  const cell = forcedCell(view);
  const avoid = view.force.avoid || null;
  const want = noun || forced(view, ["kk", "kvk", "hk"]);
  /* A word that is not a noun cannot be put in a noun's slot. */
  if (!want && drilling(view)) return null;
  if (!askable(P, cell)) return null;
  const fits = (s) => {
    if (s.slot == null || s.nf || s.t === avoid) return false;
    if (only && !only(s, s.slot)) return false;
    const t = s.tok[s.slot];
    return t.m === cell && settled(t) && !(t.u || []).includes("fall") && !!readMark(t.m).fall;
  };
  const near = sentPool(lex, view, "nafnord");
  const pools = [near, lex.sentences.filter((s) => P.level(s.lvl) && !near.includes(s))];
  for (const pool of pools) {
    for (const s of shuffle(pool.filter(fits), rng)) {
      const t = s.tok[s.slot];
      const open = substitutable(s);
      const own = open ? null : (lex.lookup(t.l, t.c) || lex.lookup(t.l, "nafnorð"));
      let n = null;
      if (want) {
        if (open) {
          if (acceptsNoun({ rk: s.rk, need: s.need, ps: s.ps || null }, want, t.m)
              && !repeatsNoun(s, s.slot, want)) n = want;
        } else if (own && own.o === want.o && own.c === want.c) n = own;
      } else if (open) {
        const cands = candidateNouns(lex, s);
        if (cands.length) n = wpick(cands, (x) => wordWeight(lex, view, x, "nafnord"), rng);
      } else n = own;
      if (n && n.forms[t.m]) return clozeTask(s, n, readMark(t.m));
    }
  }
  return null;
}
