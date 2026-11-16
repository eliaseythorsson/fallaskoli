// @ts-check
/* "Dagsins lota" — today's session (critique item 21).

   The picker used to offer ten categories and no advice. A pupil who did not
   think of choosing "Villurnar mínar" met their own error patterns in 6–22 %
   of mixed questions, and reviews only as the three a session opens with.
   Today's session is the one button that does the choosing for them:

     first   the reviews that are due              (core/review.js)
     then    the pupil's active error patterns     (core/diagnosis.js)
     last    new material                          (spread over several skills)

   about 3 / 4 / 3 of ten. This file only PLANS: it says which kind of
   question each of the ten is, which entry or pattern it is about, and
   nothing else. control/session.js `pickTask` builds each slot with the ordinary
   builders, so a slot that cannot be built falls back to new material and the
   session is still ten questions long.

   ---- how the ten are shared out, and why -----------------------------------

   The base share is 30 % reviews, 40 % patterns and the rest new. The shares
   bend when a source is empty or short, but never so far that the session
   stops being a mix:

   * Fewer reviews due than the share: half of what is missing goes to the
     patterns (they are the other thing that needs mending), the rest to new
     material — and the patterns never take more than half the session. Five
     questions in a row on the thing that keeps going wrong is the most a
     13-year-old should meet in one sitting before something they can do.
   * No active pattern: the reviews may take up to half the session (more
     reviews are due than three a session can clear), and the rest is new.
   * Neither: the whole session is new material — a mixed session of what is
     switched on, which is what the pupil would otherwise have picked.

       due   patterns   →  reviews / patterns / new     (n = 10)
       ≥3    yes            3 / 4 / 3
       2     yes            2 / 5 / 3
       0     yes            0 / 5 / 5
       ≥5    no             5 / 0 / 5
       0     no             0 / 0 / 10

   ---- where new material comes from ------------------------------------------

   `freshSkills` orders the switched-on skills, and the new slots are dealt
   out round the first few of them, one each in turn: never fewer than
   FRESH_MIN skills, and enough that no skill has more than FRESH_PER of the
   new questions. Three new questions are three skills; ten (a new pupil, or a
   day with nothing to mend) are five skills, two each, interleaved.

   The order: least practised first (by XP) — a pupil who has done forty
   sessions of nouns and none of verbs gets verbs. But a NEW pupil (fewer than
   NEW_PUPIL answers in all) gets the core skills first (CORE: nouns, verbs,
   adjectives, pronouns and case government), least practised among them
   first. Without that, the placement round decided: its XP lands in the
   skills answered right, so "least practised" meant the skills the pupil had
   just missed or that are farthest from the core, and one new pupil's first
   session was three Töluorð, three Málbeiting, three Orðaforði, one Sagnorð
   and no noun, adjective, pronoun or Fallstjórn at all (review of v6.13, S6).

   The plan respects the curriculum policy (the year preset and the switches):
   a review whose question type is switched off is not counted as due, a
   pattern no switched-on type can test is not counted as active, and new
   material comes only from switched-on skills. Whether a type may be asked is
   the caller's to say (`canType`): the registry lives in tasks/, and core/
   does not import it.

   Pure: no DOM, no clock, no random numbers.                                  */

import { dueEntries } from "./review.js";
import { activePatterns, focusTypes } from "./diagnosis.js";
import { SKILL_IDS } from "./skills.js";
import { QUESTION_TYPES } from "./policy.js";

/** The size of today's session. */
export const TODAY_SIZE = 10;
/** The base shares of reviews and patterns; new material is the rest. */
const SHARE = { review: 0.3, pattern: 0.4 };
/** At most this many patterns are worked on in one session. */
const TODAY_PATTERNS = 3;
/** New material comes from at least this many skills … */
const FRESH_MIN = 3;
/** … and enough of them that none has more than this many new questions. */
export const FRESH_PER = 2;
/** The core skills a new pupil's new material comes from first, in this order. */
export const CORE = ["nafnord", "sagnord", "lysingarord", "fornofn", "fallstjorn"];
/** Fewer answers than this, in all skills together: a new pupil. */
export const NEW_PUPIL = 100;

/** How many skills `fresh` new questions are spread over. */
export const freshSpread = (fresh) => Math.max(FRESH_MIN, Math.ceil(Math.max(0, fresh) / FRESH_PER));

/**
 * How many of `n` questions are reviews, patterns and new material.
 * @param {number} n         the size of the session
 * @param {number} due       how many reviews are due (and may be asked)
 * @param {number} patterns  how many active patterns can be practised
 * @returns {{review:number, pattern:number, fresh:number}}
 */
export function shares(n, due, patterns) {
  n = Math.max(0, Math.floor(n || 0));
  const half = Math.ceil(n / 2);
  const r0 = Math.round(n * SHARE.review);
  const p0 = Math.round(n * SHARE.pattern);
  let review, pattern;
  if (patterns > 0) {
    review = Math.min(due, r0);
    pattern = Math.min(p0 + Math.ceil((r0 - review) / 2), half);
  } else {
    review = Math.min(due, Math.min(r0 + Math.floor(p0 / 2), half));
    pattern = 0;
  }
  return { review, pattern, fresh: n - review - pattern };
}

/**
 * Today's session, planned.
 *
 * @param {import("../types").State} S  the saved state
 * @param {?import("../types").Policy} P  the curriculum policy (core/policy.js, the effective one)
 * @param {import("../types").When} now   today: a day key, a Date or milliseconds
 * @param {object} [opts]
 * @param {number} [opts.n]  the size (default ten)
 * @param {((typeId: string) => boolean)|null} [opts.canType]  may a question of
 *                      this type be asked under `P`? Default: `P.type`.
 *                      app.js passes the registry's `enabled`, which also
 *                      checks the type's skill.
 * @returns {{ n: number, slots: TodaySlot[], reviews: string[], patterns: string[],
 *             counts: {review: number, pattern: number, fresh: number} }}
 *   slots     one per question, in order: { kind: "review", k } |
 *             { kind: "pattern", p } | { kind: "new", skill }
 *   reviews   the keys of the review slots, most urgent first
 *   patterns  the ids of the patterns worked on, worst first
 *   counts    { review, pattern, fresh }
 */
/** @typedef {{kind: "review", k: string} | {kind: "pattern", p: string}
              | {kind: "new", skill: ?string}} TodaySlot */
export function planToday(S, P, now, { n = TODAY_SIZE, canType = null } = {}) {
  const may = canType || ((id) => !!P && P.type(id));

  const due = dueEntries(S, now, (e) => may(e.t));
  const pats = activePatterns(S, TODAY_PATTERNS, (p) => [...focusTypes([p.id])].some(may))
    .map((p) => p.id);
  const counts = shares(n, due.length, pats.length);

  /** @type {TodaySlot[]} */
  const slots = [];
  const reviews = due.slice(0, counts.review).map((e) => e.k);
  reviews.forEach((k) => slots.push({ kind: "review", k }));
  /* The worst pattern first, and round the list: with two patterns and four
     slots each comes twice, never four of one and none of the other. */
  for (let k = 0; k < counts.pattern; k++) slots.push({ kind: "pattern", p: pats[k % pats.length] });
  const fresh = freshSkills(S, P, may, freshSpread(counts.fresh));
  for (let k = 0; k < counts.fresh; k++)
    slots.push({ kind: "new", skill: fresh.length ? fresh[k % fresh.length] : null });

  return { n: slots.length, slots, reviews, patterns: pats.slice(0, Math.min(pats.length, counts.pattern)), counts };
}

/**
 * The skills new material comes from: the switched-on skills that have a
 * switched-on question type, least practised first (by XP) — and for a new
 * pupil (fewer than NEW_PUPIL answers) the CORE skills before the rest (see
 * the head of this file). Ties keep the catalogue's order, so the plan never
 * depends on how the state is stored. At most `limit` (planToday passes
 * `freshSpread`), so that a few new questions are not as many categories.
 *
 * @param {import("../types").State} S
 * @param {?Pick<import("../types").Policy, "skill"|"type">} P
 * @param {((typeId: string) => boolean)|null} [canType]
 * @param {number} [limit]
 * @returns {string[]}
 */
export function freshSkills(S, P, canType = null, limit = 3) {
  if (!P) return [];
  const may = canType || ((id) => P.type(id));
  const skills = (S && S.skills) || {};
  const xp = (id) => (skills[id] || {}).xp || 0;
  const answers = Object.values(skills).reduce((a, v) => a + ((v && v.c) || 0) + ((v && v.w) || 0), 0);
  const core = (id) => (answers < NEW_PUPIL && CORE.includes(id) ? 0 : 1);
  return SKILL_IDS
    .filter((id) => P.skill(id) && QUESTION_TYPES.some((q) => q.skill === id && may(q.id)))
    .map((id, at) => ({ id, at, xp: xp(id), core: core(id) }))
    .sort((a, b) => a.core - b.core || a.xp - b.xp || a.at - b.at)
    .slice(0, limit)
    .map((x) => x.id);
}

/* ---------- what the button says --------------------------------------------- */

const join = (parts) => (parts.length < 2 ? parts.join("")
  : `${parts.slice(0, -1).join(", ")} og ${parts[parts.length - 1]}`);
/* A number ending in 1 (but not 11) takes the singular: 1 upprifjun,
   21 upprifjun — the same rule as core/review.js `dueLine`. */
const one = (k) => k % 10 === 1 && k % 100 !== 11;

/**
 * The line under the button: what today's session holds.
 * "3 upprifjanir, 4 spurningar um villurnar þínar og 3 nýjar spurningar."
 */
export function todayLine(plan) {
  const c = (plan && plan.counts) || { review: 0, pattern: 0, fresh: 0 };
  if (!c.review && !c.pattern) {
    return `${c.fresh} ${one(c.fresh) ? "ný spurning" : "nýjar spurningar"} úr efninu þínu. Ekkert bíður upprifjunar í dag.`;
  }
  const parts = [];
  if (c.review) parts.push(`${c.review} ${one(c.review) ? "upprifjun" : "upprifjanir"}`);
  if (c.pattern) parts.push(`${c.pattern} ${one(c.pattern) ? "spurning" : "spurningar"} um villurnar þínar`);
  if (c.fresh) parts.push(`${c.fresh} ${one(c.fresh) ? "ný spurning" : "nýjar spurningar"}`);
  return join(parts) + ".";
}
