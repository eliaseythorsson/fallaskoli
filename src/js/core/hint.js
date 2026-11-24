// @ts-check
/* The structure hint in Setningafræði, and how it fades with þyngd (item 26).

   Item 25 marks a sentence's structure from its parse (core/structure.js).
   Here it becomes a hint on EVERY Setningafræði question: what the hint may
   show on a given question, and whether it is shown, offered or left out at
   the pupil's þyngd. Pure: no DOM, no clock, no state; the builders call
   `planHint` (tasks/setningafraedi.js) and the renderers draw what
   `hintMarks` returns.

   ---- the fading rule ------------------------------------------------------

     þyngd 1–2   SHOWN     the structure is drawn from the start. At this
                           step it is part of the question, not something the
                           pupil asked for: full XP, not recorded as a hint.
     þyngd 3–5   OFFERED   a "Vísbending" button; using it halves the XP and
                           is not an error — the rule of every hint in the
                           program (core/progress.js `computeXp`).
     þyngd 6–7   NONE      no hint: the pupil finds the structure alone.

   Why: the evidence for visual coding of structure (docs/DLD-RESEARCH.md §C:
   Ebbels 2007, 2014) is for coding that is taught and then used less as the
   pupil masters the structure, and docs/DLD-PLAN.md §3 asks that "the colours
   fade as þyngd rises". Þyngd is the program's own measure of where the
   pupil now stands in the skill (core/difficulty.js: it rises with about
   80% right and falls with a wrong answer), so the scaffold follows it both
   ways: a pupil who starts to miss at þyngd 6 drops back to where the hint
   is offered again. The steps are those of the skill's own builders (the
   simplest sentences up to þyngd 2, the hard ones from 5–6). The exact
   cut-offs are a choice, not a measurement — nobody has compared fading
   schedules for teenagers (DLD-RESEARCH.md, "Limits") — so they are kept
   here, in one place, to be changed.

   ---- never the answer -------------------------------------------------------

   A hint that marks the answer, or leaves only the answer unmarked, is the
   answer. So a hint is planned for one question, and is left out when:
     1. a mark of any kind the question asks for would be shown (`hide`:
        a kind is hidden EVERYWHERE in the sentence, so that the missing
        mark on the asked words tells nothing either);
     2. a mark would sit on the words the question points at (`pointed`) —
        such marks are taken out;
     3. a word that is a right answer (`right`) would be marked as something
        else, or every word left unmarked is a right answer — the pupil
        would only have to click what is left. Then more kinds are hidden,
        one at a time, until that is no longer so;
     4. nothing is left to show.
   After the answer everything is marked: it is then the explanation. */

import { sentenceStructure, withoutMarks, hasMarks, STRUCTURE_ROLES } from "./structure.js";

/** The steps by þyngd: up to `shownUpTo` the structure is shown, up to
    `offeredUpTo` it is offered, above it there is none. */
export const HINT_FADE = Object.freeze({ shownUpTo: 2, offeredUpTo: 5 });

/** The setningarhlutar the marking names (all of STRUCTURE_ROLES but the
    phrase and the conjunction). */
export const SETNINGARHLUTAR = Object.freeze(STRUCTURE_ROLES.filter((r) => r !== "forsetningarliður" && r !== "samtenging"));

/**
 * The step of the hint at a þyngd: "shown", "offered", or null (no hint).
 * @param {number} thyngd the pupil's þyngd in the skill, 1–7 (halves are rounded as bands are)
 * @returns {"shown"|"offered"|null}
 */
export function hintStep(thyngd) {
  const b = Math.round(Number(thyngd) || 1);
  if (b <= HINT_FADE.shownUpTo) return "shown";
  if (b <= HINT_FADE.offeredUpTo) return "offered";
  return null;
}

const PUNCT = new Set([".", "!", "?", ",", ":", ";", "„", "“", "”", "\"", "–", "—", "(", ")"]);

/** @typedef {import("./structure.js").Sentence} Sentence */
/** @typedef {import("./structure.js").Structure} Structure */
/** @typedef {{ step: "shown"|"offered", hide: string[], pointed: number[], clauses: boolean }} Coding */

/**
 * The marks a hint shows: the structure without the hidden kinds and without
 * any mark on the pointed words. With `after`, everything (the answer is in).
 * @param {Sentence} s
 * @param {{ hide?: string[], pointed?: number[], clauses?: boolean }} coding
 * @param {{ after?: boolean }} [opts]
 * @returns {Structure}
 */
export function hintMarks(s, coding, opts = {}) {
  const full = sentenceStructure(s);
  if (opts.after) return full;
  const st = withoutMarks(full, { hide: coding.hide || [], clauses: coding.clauses });
  const pointed = new Set(coding.pointed || []);
  if (!pointed.size) return st;
  const off = (p) => { for (let j = p.a; j <= p.b; j++) if (pointed.has(j)) return true; return false; };
  return {
    parts: st.parts.filter((p) => !off(p)),
    clauses: st.clauses,
    roleAt: st.roleAt.map((r, j) => (r && st.parts.some((p) => off(p) && j >= p.a && j <= p.b) ? null : r)),
  };
}

/**
 * Would these marks give the answer away? (Rules 1–3 above; rule 1 is
 * `hide` itself, checked here once more.)
 * @param {Sentence} s
 * @param {Structure} st the marks as the hint shows them
 * @param {{ hide?: string[], pointed?: number[], right?: number[]|null }} q
 */
export function givesAway(s, st, q) {
  const hide = new Set(q.hide || []);
  if (st.parts.some((p) => hide.has(p.role))) return true;
  const covered = (j) => st.parts.some((p) => j >= p.a && j <= p.b);
  if ((q.pointed || []).some(covered)) return true;
  if (q.right) {
    const right = new Set(q.right);
    if (q.right.some(covered)) return true;
    const open = s.tok.map((t, j) => j).filter((j) => !PUNCT.has(s.tok[j].w) && !covered(j));
    if (open.every((j) => right.has(j))) return true;
  }
  return false;
}

/**
 * The hint for one question, or null when it has none: at this þyngd, with
 * nothing to show, or because it would give the answer away.
 *
 * @param {Sentence} s the question's sentence
 * @param {object} q
 * @param {number} q.thyngd the pupil's þyngd in the skill
 * @param {string[]} q.hide the kinds of mark the question asks about
 * @param {number[]} [q.pointed] the words the question marks for the pupil
 * @param {number[]|null} [q.right] for a question answered by clicking words:
 *   every word that is a right click
 * @param {boolean} [q.clauses] false: no boxes
 * @returns {Coding|null}
 */
export function planHint(s, { thyngd, hide, pointed = [], right = null, clauses = true }) {
  const step = hintStep(thyngd);
  if (!step || !s || !s.tok) return null;
  /* Where marking everything else would leave only the answer open (*Á
     túninu stendur **hestur***, asked for the frumlag), a hint that marks
     less is still a hint: more kinds are hidden, one at a time in the order
     of STRUCTURE_ROLES, until a word that is not the answer stays open. */
  const more = STRUCTURE_ROLES.filter((r) => !hide.includes(r));
  for (let k = 0; k <= more.length; k++) {
    const coding = { step, hide: [...hide, ...more.slice(0, k)], pointed: [...pointed], clauses };
    const st = hintMarks(s, coding);
    if (!hasMarks(st)) return null;
    if (!givesAway(s, st, { hide: coding.hide, pointed, right })) return coding;
  }
  return null;
}
