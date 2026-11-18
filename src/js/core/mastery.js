// @ts-check
/* The mastery mark (critique item 44): how well a pupil knows something, not
 * how much they have practised it.
 *
 * A skill's "stig" is its XP, so it rises with any practice — a pupil who
 * gets half wrong climbs as surely as one who gets everything right, only a
 * little slower. A teacher and a parent want the other figure: is this
 * secure? This file answers that, for a skill and for any set of question
 * types (a curriculum node, core/curriculum.js — the skill map of item 83,
 * the badges of item 56 and the leaderboard of item 58 build on it).
 *
 * ---- what it is read from ---------------------------------------------------
 *
 *   1. Accuracy on RECENT answers AT THE PUPIL'S LEVEL. Each question type
 *      keeps its last HIST answers, each with the step of difficulty (þyngd,
 *      core/difficulty.js) the pupil was at when it was asked. The mark reads
 *      the last WINDOW = 20 of them that were asked within NEAR = 1 step of
 *      the pupil's level now. Why within one step and not exactly at it: the
 *      level moves in half steps and every visit starts half a step down
 *      (difficulty.js WARMUP), so a pupil who is steady at a level is served
 *      two neighbouring steps all the time. What was answered three steps
 *      below — easy questions from weeks ago — says nothing about now.
 *
 *   2. REVIEWS PASSED ON TIME (core/review.js): a wrong answer comes back
 *      after 1, 3, 7 and 21 days, and a review passed within two days of its
 *      day counts as on time. Accuracy says the pupil can do it today; a
 *      review passed a week later says it stayed.
 *
 * ---- the marks ----------------------------------------------------------------
 *
 *   0  Of fá svör    fewer than MIN_ANSWERS (8) recent answers at the level.
 *                    Said plainly instead of guessing: three right out of
 *                    three is not mastery, and one wrong out of two is not
 *                    a problem.
 *   1  Þarf æfingu   under 60% right
 *   2  Á góðri leið  60% – under 75%
 *   3  Gott vald     75% or more
 *   4  Fullt vald    90% or more over a full window of 20, AND the reviews
 *                    are kept: none overdue (more than two days past its
 *                    day), and at least REVIEWS_MIN (2) reviews passed on
 *                    time and no fewer than the reviews that were missed —
 *                    unless nothing in it was ever missed at all.
 *
 * How these sit with the difficulty: the level rises while the pupil does
 * well, and holds back when fewer than 80% of a skill's last dozen answers
 * were right, so a pupil whose level is still moving settles at about 79%
 * right AT THAT LEVEL — "Gott vald". That is the honest reading: they handle
 * the level they are at, and the level says how far that is (the þyngd is
 * shown beside the mark). 90% and "Fullt vald" come where the level has
 * stopped rising — at the top of what the policy allows, or of what the
 * questions know — and the pupil is still right nine times in ten, and keeps
 * it over the reviews.
 *
 * ---- the saved record -----------------------------------------------------------
 *
 *   S.byType[typeId] = { n, c, h, at }
 *     n   answers ever given to this type            (counts, add on merge)
 *     c   … of them right
 *     h   the last HIST (20) answers, oldest first, one letter each: the
 *         step of difficulty as a letter, A–G for 1–7, capital when right
 *         and small when wrong ("CCcD" = right at 3, right, wrong, right at 4)
 *     at  when the last one was given (ms) — the newer `h` wins a merge
 *   Known question types only (core/policy.js QUESTION_TYPES), so the record
 *   is bounded: about sixty entries of under forty bytes.
 *
 * Written once per answered question by core/answer.js `settle`, with the
 * step the pupil was at before the answer moved it. Duels are left out: a
 * duel is asked at the duel's level, not the pupil's.
 *
 * Pure: no DOM, no storage. The clock is an argument (`now`, default
 * Date.now()), as everywhere in core/. */

import { QUESTION_TYPES, TYPE_IDS } from "./policy.js";
import { storedLevel, MIN, MAX } from "./difficulty.js";
import { dayOf, daysBetween, ON_TIME_DAYS, STALE_DAYS } from "./review.js";

/** @typedef {import("../types").State} State */
/** @typedef {import("../types").AnswerRecord} AnswerRecord */
/** @typedef {import("../types").ReviewEntry} ReviewEntry */
/** @typedef {import("../types").When} When */
/**
 * The mark (`markFrom`); `masteryOf` adds `band`.
 * @typedef {{level:number, label:string, accuracy:?number, n:number, right:number,
 *   reviewsOnTime:number, reviewsPassed:number, lapsed:number, overdue:number,
 *   reviewsKept:boolean, band?: ?number}} Mark
 */
/** The review figures a mark reads; a missing one counts as 0.
    @typedef {{added?:number, passed?:number, onTime?:number, lapsed?:number, overdue?:number}} ReviewFigures */

/** Answers each question type keeps. */
export const HIST = 20;
/** Recent answers at the level the mark reads. */
export const WINDOW = 20;
/** How far from the pupil's level an answer may have been asked and count. */
export const NEAR = 1;
/** Fewer recent answers than this: "Of fá svör". */
export const MIN_ANSWERS = 8;
/** The share right for marks 2, 3 and 4. */
export const AT_2 = 0.6, AT_3 = 0.75, AT_4 = 0.9;
/** Reviews passed on time that mark 4 asks for. */
export const REVIEWS_MIN = 2;

export const LABELS = ["Of fá svör", "Þarf æfingu", "Á góðri leið", "Gott vald", "Fullt vald"];

const KNOWN = new Set(TYPE_IDS);
const SKILL_OF = new Map(QUESTION_TYPES.map((t) => [t.id, t.skill]));
const isObj = (x) => x && typeof x === "object" && !Array.isArray(x);
const int = (x, max = 1e9) =>
  (typeof x === "number" && Number.isFinite(x) ? Math.min(Math.max(0, Math.round(x)), max) : 0);
const H_RE = /^[A-Ga-g]*$/;

/* ---------- one answer ------------------------------------------------------ */

/** The letter of one answer: the step as A–G, capital when right.
    @param {number} band @param {boolean} ok @returns {string} */
export const answerChar = (band, ok) => {
  const b = Math.min(MAX, Math.max(MIN, Math.round(Number(band) || MIN)));
  const ch = String.fromCharCode(64 + b);
  return ok ? ch : ch.toLowerCase();
};

/** One letter read back: { band, ok }.
    @type {(ch: string) => {band: number, ok: boolean}} */
export const readChar = (ch) => ({ band: ch.toUpperCase().charCodeAt(0) - 64, ok: ch === ch.toUpperCase() });

/** The question types of one category, as the curriculum switch files them.
    @type {(skill: string) => string[]} */
export const typesOfSkill = (skill) => QUESTION_TYPES.filter((t) => t.skill === skill).map((t) => t.id);

/**
 * Write one answered question into `S.byType`. `band` is the step of
 * difficulty the pupil was at in the question's skill when it was asked;
 * `ok` must be true or false (anything else is not an answer and changes
 * nothing). An unknown type changes nothing. Returns the record, or null.
 *
 * @param {State} S @param {string} typeId @param {number} band
 * @param {boolean|null} ok @param {number} [now]  ms
 * @returns {?AnswerRecord}
 */
export function noteTypeAnswer(S, typeId, band, ok, now = Date.now()) {
  if (!S || !KNOWN.has(typeId) || typeof ok !== "boolean") return null;
  const all = isObj(S.byType) ? S.byType : (S.byType = {});
  const r = isObj(all[typeId]) ? all[typeId] : { n: 0, c: 0, h: "", at: 0 };
  all[typeId] = {
    n: (r.n || 0) + 1,
    c: (r.c || 0) + (ok ? 1 : 0),
    h: (String(r.h || "") + answerChar(band, ok)).slice(-HIST),
    at: now,
  };
  return all[typeId];
}

/* ---------- saved, loaded, merged ------------------------------------------- */

/**
 * `S.byType` as it may be trusted: known types only, every field bounded,
 * `c` never above `n`. Used by `migrate` (core/state.js) and the server's
 * guard (server/guard.mjs). Never throws. `ids`: the keys that may be kept —
 * the question types, or for the same record kept per curriculum node
 * (`S.byNode`, core/skillmap.js) the nodes that have one.
 *
 * @param {any} raw @param {string[]} [ids]
 * @returns {Record<string, AnswerRecord>}
 */
export function cleanByType(raw, ids = TYPE_IDS) {
  const out = {};
  if (!isObj(raw)) return out;
  for (const id of ids) {
    const v = raw[id];
    if (!isObj(v)) continue;
    const n = int(v.n), c = Math.min(int(v.c), n);
    /* A history with anything but the fourteen letters in it was not written
       by this program: dropped whole rather than read for what letters it
       happens to contain. The counts are kept. */
    const h = typeof v.h === "string" && H_RE.test(v.h) ? v.h.slice(-HIST) : "";
    out[id] = { n, c, h, at: int(v.at, 1e13) };
  }
  return out;
}

/**
 * Two devices (core/merge.js): the counts add like every counter; the recent
 * history is a position, not a count, and the side answered last wins it
 * whole (`at`), as a saved level does (core/difficulty.js mergeLevels).
 *
 * @param {any} base @param {any} local @param {any} remote @param {string[]} [ids]
 * @returns {Record<string, AnswerRecord>}
 */
export function mergeByType(base, local, remote, ids = TYPE_IDS) {
  const B = cleanByType(base, ids), L = cleanByType(local, ids), R = cleanByType(remote, ids);
  const out = {};
  for (const k of new Set([...Object.keys(R), ...Object.keys(L)])) {
    const b = B[k] || { n: 0, c: 0 }, l = L[k], r = R[k];
    if (!l || !r) { out[k] = { ...(l || r) }; continue; }
    const n = Math.max(0, r.n + (l.n - b.n)), c = Math.min(n, Math.max(0, r.c + (l.c - b.c)));
    const w = r.at > l.at ? r : l;
    out[k] = { n, c, h: w.h, at: w.at };
  }
  return out;
}

/* ---------- the mark ------------------------------------------------------- */

/** The step a skill is at now, as a whole number (the level moves in halves).
    @type {(S: State, skill: string) => number} */
const bandNow = (S, skill) => Math.min(MAX, Math.max(MIN, Math.round(storedLevel(S, skill))));

/**
 * The recent answers at the pupil's level, newest first, across `typeIds`:
 * from each type the answers asked within NEAR of the level of that type's
 * skill now, then taken in turn from each type, newest first, up to WINDOW.
 * In turn because the saved history has no clock per answer, and in a mixed
 * session the types come interleaved; it also keeps one type answered fifty
 * times from drowning the others of a node.
 *
 * @param {State} S @param {Iterable<string>} typeIds
 * @param {{window?: number, bandOf?: ?((skill: string) => number)}} [opts]
 * @returns {{band: number, ok: boolean}[]}
 */
export function recentAtLevel(S, typeIds, { window = WINDOW, bandOf = null } = {}) {
  const lanes = [];
  for (const id of new Set(typeIds || [])) {
    const r = S && isObj(S.byType) ? S.byType[id] : null;
    if (!isObj(r) || !r.h) continue;
    /* `bandOf(skill)`: the step to read at, when it is not the level now —
       the skill map reads at the highest step it has shown (core/skillmap.js
       `ringBand`), so a ring does not move with every half step. */
    const cur = bandOf ? bandOf(SKILL_OF.get(id)) : bandNow(S, SKILL_OF.get(id));
    const lane = [...String(r.h)].reverse().map(readChar)
      .filter((x) => Math.abs(x.band - cur) <= NEAR);
    if (lane.length) lanes.push(lane);
  }
  const out = [];
  for (let k = 0; out.length < window && lanes.some((l) => k < l.length); k++)
    for (const l of lanes) if (k < l.length && out.length < window) out.push(l[k]);
  return out;
}

/** The review figures the mark reads, out of S.review: tallies under the given
   stats keys, and the live entries that match, of which the overdue ones.
   @param {State} S @param {When} now @param {string[]} keys
   @param {(e: ReviewEntry) => boolean} match
   @returns {Required<ReviewFigures>} */
function reviewFigures(S, now, keys, match) {
  /** @type {Partial<import("../types").ReviewState>} */
  const R = (S && S.review) || {};
  const stats = isObj(R.stats) ? R.stats : {};
  const out = { added: 0, passed: 0, onTime: 0, lapsed: 0, overdue: 0 };
  for (const k of keys) {
    const v = stats[k];
    if (!isObj(v)) continue;
    out.added += v.a || 0; out.passed += v.p || 0; out.onTime += v.t || 0; out.lapsed += v.l || 0;
  }
  const today = dayOf(now);
  for (const e of Array.isArray(R.items) ? R.items : []) {
    if (!e || !match(e)) continue;
    const late = daysBetween(e.due, today);
    if (late > ON_TIME_DAYS && late <= STALE_DAYS) out.overdue++;
  }
  return out;
}

/**
 * The mark, from the recent answers and the review figures. Pure; exported
 * for the tests and for anything that has its own figures.
 *
 * @param {{ok:boolean}[]} recent  the answers (`recentAtLevel`)
 * @param {?ReviewFigures} rev  the figures; any left out count as 0
 * @returns {Mark}
 */
export function markFrom(recent, rev) {
  const n = recent.length;
  const right = recent.filter((x) => x.ok).length;
  const accuracy = n ? right / n : null;
  const r = { added: 0, passed: 0, onTime: 0, lapsed: 0, overdue: 0, ...(rev || {}) };
  const reviewsKept = r.overdue === 0 &&
    (r.added === 0 || (r.onTime >= REVIEWS_MIN && r.onTime >= r.lapsed));
  let level;
  if (n < MIN_ANSWERS) level = 0;
  else if (accuracy < AT_2) level = 1;
  else if (accuracy < AT_3) level = 2;
  else if (accuracy >= AT_4 && n >= WINDOW && reviewsKept) level = 4;
  else level = 3;
  return { level, label: LABELS[level], accuracy, n, right,
    reviewsOnTime: r.onTime, reviewsPassed: r.passed, lapsed: r.lapsed, overdue: r.overdue, reviewsKept };
}

/**
 * The mark for any set of question types — a curriculum node is its `types`.
 * Reviews are read from the per-type tallies of the review queue
 * (core/review.js, kept since v6.13 item 44) and from the entries of these
 * types waiting in it.
 *
 * @param {State} S @param {Iterable<string>} typeIds @param {When} [now]
 * @param {{bandOf?: ?((skill: string) => number)}} [opts]  see `recentAtLevel`
 * @returns {Mark}
 */
export function masteryOfTypes(S, typeIds, now = Date.now(), { bandOf = null } = {}) {
  const ids = [...new Set(typeIds || [])].filter((id) => KNOWN.has(id));
  const set = new Set(ids);
  const rev = reviewFigures(S, now, ids.map((id) => "t:" + id), (e) => set.has(e.t));
  return markFrom(recentAtLevel(S, ids, { bandOf }), rev);
}

/**
 * The mark of one category: its question types' recent answers, and the
 * category's own review tallies (kept from the start of the review queue, so
 * they hold more history than the per-type ones). `band` is the step the
 * skill is at now, for the line beside the mark.
 *
 * @param {State} S @param {string} skill
 * @param {When} [now]  ms, a Date (core/state.js badgeContext) or a day key
 * @param {{bandOf?: ?((skill: string) => number)}} [opts]  see `recentAtLevel`
 * @returns {Mark}
 */
export function masteryOf(S, skill, now = Date.now(), { bandOf = null } = {}) {
  const ids = typesOfSkill(skill);
  const rev = reviewFigures(S, now, ["s:" + skill], (e) => e.sk === skill);
  return { ...markFrom(recentAtLevel(S, ids, { bandOf }), rev), band: bandOf ? bandOf(skill) : bandNow(S, skill) };
}

/**
 * One line that says what the mark rests on, for a title or under the mark:
 * "17 af 20 rétt á þyngd 3 · 4 upprifjanir á réttum tíma". With too little,
 * how many answers are still missing.
 *
 * @param {?Mark} m @returns {string}
 */
export function masteryLine(m) {
  if (!m) return "";
  const lvl = m.band ? ` á þyngd ${m.band}` : "";
  if (m.level === 0) {
    const left = MIN_ANSWERS - m.n;
    return m.n
      ? `${m.n} ${m.n === 1 ? "svar" : "svör"}${lvl} — vantar ${left} ${left === 1 ? "svar" : "svör"} enn`
      : `Engin svör${lvl} enn`;
  }
  const bits = [`${m.right} af ${m.n} rétt${lvl}`];
  if (m.reviewsOnTime) {
    const k = m.reviewsOnTime;
    bits.push(`${k} ${k % 10 === 1 && k % 100 !== 11 ? "upprifjun" : "upprifjanir"} á réttum tíma`);
  }
  if (m.overdue) bits.push(`${m.overdue} ${m.overdue % 10 === 1 && m.overdue % 100 !== 11 ? "upprifjun bíður" : "upprifjanir bíða"} of lengi`);
  return bits.join(" · ");
}
