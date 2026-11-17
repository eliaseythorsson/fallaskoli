/* Getting better, counted (critique items 56 and 58).
 *
 * The rewards paid for turning up and collecting; almost nothing paid for
 * getting better at the thing that went wrong. This file keeps the two
 * figures that do, and nothing else:
 *
 *   MENDED      an error pattern (core/diagnosis.js) that was "algengt
 *               núna" — active — and has since been right MEND_RUN = 10
 *               times in a row, the last of them on a LATER DAY than the
 *               day it was first seen active.
 *   REVIEWS     reviews passed (core/review.js): an entry of the review
 *               queue that was due and answered right.
 *
 * Both feed badges (core/badges.js §14j) and the leaderboard's "Framfarir"
 * (core/leaderboard.js), which is this week's mendings and reviews.
 *
 * ---- why these rules -------------------------------------------------------
 *
 * TEN IN A ROW. The diagnosis keeps the last 16 answers that tested each
 * pattern ("1" right, "0" wrong). Ten trailing ones is the item's own rule
 * ("clean over ten chances"). It is deliberately stricter than "no longer
 * active": the activity test is a confidence bound, and a pattern with six
 * misses in its window of sixteen is still active after ten right answers —
 * so a pattern can be mended while still flagged, and that is right: the
 * flag is about the window, the mending about now.
 *
 * A LATER DAY. A pattern that went active this morning and was right ten
 * times this afternoon has been practised, not mended — the review queue
 * makes the same call (a right answer the same afternoon is short-term
 * memory, core/review.js). So the day a pattern went active is kept, and
 * the mending is credited on an answer given on a later day. This is also
 * what makes the figure hard to farm: missing on purpose and then answering
 * right costs at least two days per pattern.
 *
 * ONCE PER ACTIVATION. After a mending the pattern has to go active again
 * — several misses in a short window — before it can be mended again.
 *
 * ---- "Framfarir": what a week is worth, and why it cannot be farmed --------
 *
 *   framfarir(week) = MEND_POINTS × (different patterns mended in the week)
 *                   + Σ over its days of min(reviews passed, REVIEWS_PER_DAY)
 *
 * Answering more never raises it by itself: easy right answers mend nothing
 * (only an active pattern can be mended, and only misses make one active)
 * and pass no review (only an entry that is DUE can pass, and only a miss
 * makes an entry). The one way to raise it with volume would be to miss on
 * purpose today and pass the entries tomorrow; the cap per day bounds that
 * at what an honest pupil with a full queue reaches — two sessions a day,
 * each opening with up to three reviews — and a deliberate miss costs XP,
 * the run and the mastery mark. A mending is worth MEND_POINTS reviews: it
 * takes at least ten answers over two days, a review one.
 *
 * ---- the saved shape -----------------------------------------------------
 *
 *   S.mend = {
 *     open: { pattern: day },   active and not yet mended, since that day
 *     done: { pattern: n },     times each pattern has been mended
 *     log:  [ {p, d}, … ],      the last LOG_MAX mendings, oldest first
 *     rv:   { day: n },         reviews passed on each of the last RV_DAYS days
 *   }
 *
 * Pattern ids and day keys and counts — nothing the child typed, as
 * everywhere in the diagnosis. Pure: no DOM, no clock; "today" is passed in.
 */

import { standingOf, patternById } from "./diagnosis.js";
import { addDays, daysBetween } from "./review.js";

/** Right answers in a row that mend an active pattern. */
export const MEND_RUN = 10;
/** What one mending is worth in "Framfarir", in reviews. */
export const MEND_POINTS = 3;
/** Reviews passed that count towards "Framfarir" on one day. */
export const REVIEWS_PER_DAY = 6;
/** Mendings kept with their day (enough for any week's figure). */
export const LOG_MAX = 60;
/** Days of review counts kept: this week and last, with room to spare. */
export const RV_DAYS = 35;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[a-z][a-z0-9_]{0,39}$/;

export const blankMend = () => ({ open: {}, done: {}, log: [], rv: {} });

function book(S) {
  if (!S.mend || typeof S.mend !== "object" || Array.isArray(S.mend)) S.mend = blankMend();
  const m = S.mend;
  m.open ||= {}; m.done ||= {}; m.log ||= []; m.rv ||= {};
  return m;
}

/** How many right answers the pattern's recent history ends in. */
export function cleanRun(h) {
  const s = String(h || "");
  let n = 0;
  for (let i = s.length - 1; i >= 0 && s[i] === "1"; i--) n++;
  return n;
}

/**
 * After one answer has been written into the diagnosis (`noteDiagnosis`
 * returned `ids`, the patterns it wrote to): open the patterns that are
 * active now, and mend the open ones that have earned it. Changes `S.mend`.
 * @returns {string[]} the patterns mended by this answer
 */
export function noteMending(S, ids, today) {
  if (!ids || !ids.length || !DAY_RE.test(String(today))) return [];
  const m = book(S);
  const mended = [];
  for (const id of ids) {
    const p = patternById(id);
    if (!p || p.meta) continue;
    const rec = (S.diag || {})[id];
    if (!rec) continue;
    const since = m.open[id];
    if (since) {
      if (since < today && cleanRun(rec.h) >= MEND_RUN) {
        delete m.open[id];
        m.done[id] = (m.done[id] || 0) + 1;
        m.log.push({ p: id, d: today });
        if (m.log.length > LOG_MAX) m.log = m.log.slice(-LOG_MAX);
        mended.push(id);
      }
      continue;
    }
    if (standingOf(rec).active) m.open[id] = today;
  }
  return mended;
}

/** Count reviews passed today (core/review.js `noteReview` said how many). */
export function noteReviewsPassed(S, n, today) {
  if (!(n > 0) || !DAY_RE.test(String(today))) return;
  const m = book(S);
  m.rv[today] = (m.rv[today] || 0) + n;
  for (const k of Object.keys(m.rv)) if (daysBetween(k, today) >= RV_DAYS) delete m.rv[k];
}

/* ---------- reading --------------------------------------------------------- */

const mendOf = (S) => (S && S.mend && typeof S.mend === "object" ? S.mend : blankMend());

/** Different patterns ever mended — what the badges count. */
export const patternsMended = (S) =>
  Object.values(mendOf(S).done || {}).filter((n) => n > 0).length;

/** Patterns active now and waiting to be mended. */
export const openPatterns = (S) => Object.keys(mendOf(S).open || {});

/**
 * Reviews passed on time, ever: the per-type tallies of the review queue
 * (core/review.js `t`, a pass within two days of its day). Every entry has a
 * type, so the "t:" tallies add up to every review passed on time.
 */
export function reviewsOnTime(S) {
  const stats = (S && S.review && S.review.stats) || {};
  let n = 0;
  for (const [k, v] of Object.entries(stats)) if (k.startsWith("t:") && v) n += v.t || 0;
  return n;
}

/** The seven day keys of the week beginning on `monday`. */
const weekOf = (monday) => Array.from({ length: 7 }, (_, i) => addDays(monday, i));

/**
 * This week's "Framfarir", and its parts. `monday` is the day key that
 * begins the week (core/social.js `weekKey`).
 * @returns {{ points:number, mended:number, reviews:number, capped:number }}
 *   `reviews` all passed, `capped` the ones that count
 */
export function weekGains(S, monday) {
  if (!DAY_RE.test(String(monday))) return { points: 0, mended: 0, reviews: 0, capped: 0 };
  const m = mendOf(S);
  const days = weekOf(monday);
  const inWeek = new Set(days);
  const mended = new Set((m.log || []).filter((x) => x && inWeek.has(x.d)).map((x) => x.p)).size;
  let reviews = 0, capped = 0;
  for (const d of days) {
    const n = Math.max(0, Number((m.rv || {})[d]) || 0);
    reviews += n;
    capped += Math.min(n, REVIEWS_PER_DAY);
  }
  return { points: MEND_POINTS * mended + capped, mended, reviews, capped };
}

/** The leaderboard figure alone. */
export const framfarir = (S, monday) => weekGains(S, monday).points;

/* ---------- what may be saved ---------------------------------------------- */

const int = (x, max) =>
  (typeof x === "number" && Number.isFinite(x) ? Math.min(Math.max(0, Math.round(x)), max) : 0);
const isObj = (x) => !!x && typeof x === "object" && !Array.isArray(x);

/**
 * The record rebuilt field by field out of whatever was saved: known shapes,
 * bounded sizes. Used by `migrate` (core/state.js) and by the server
 * (server/guard.mjs). Never throws. Pattern ids are kept by shape, not
 * checked against today's list, so a pattern renamed later is not erased.
 */
export function sanitiseMend(raw) {
  const out = blankMend();
  if (!isObj(raw)) return out;
  for (const [k, v] of Object.entries(isObj(raw.open) ? raw.open : {}).slice(0, 80))
    if (ID_RE.test(k) && DAY_RE.test(String(v))) out.open[k] = v;
  for (const [k, v] of Object.entries(isObj(raw.done) ? raw.done : {}).slice(0, 80)) {
    const n = int(v, 10000);
    if (ID_RE.test(k) && n > 0) out.done[k] = n;
  }
  out.log = (Array.isArray(raw.log) ? raw.log : [])
    .filter((x) => isObj(x) && ID_RE.test(String(x.p)) && DAY_RE.test(String(x.d)))
    .map((x) => ({ p: x.p, d: x.d }))
    .sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0))
    .slice(-LOG_MAX);
  /* Newest days first when cutting, so the week being counted survives. */
  const days = Object.entries(isObj(raw.rv) ? raw.rv : {})
    .filter(([k]) => DAY_RE.test(k)).sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, RV_DAYS);
  for (const [k, v] of days) { const n = int(v, 1000); if (n > 0) out.rv[k] = n; }
  return out;
}

/* ---------- two devices ------------------------------------------------------
 *
 * The three-way merge of core/merge.js:
 *
 *   open   on either side, unless one side has closed it since `base` (it
 *          was open then and is not now: mended there). Both open: the
 *          earlier day.
 *   done   counts, added like every other counter
 *   log    the union, by pattern and day
 *   rv     counts per day, added
 */
export function mergeMend(base, local, remote) {
  const B = sanitiseMend(base), L = sanitiseMend(local), R = sanitiseMend(remote);
  const out = blankMend();
  for (const k of new Set([...Object.keys(L.open), ...Object.keys(R.open)])) {
    const l = L.open[k], r = R.open[k], b = B.open[k];
    if (b && (!l || !r)) continue;           // closed on one side since base
    out.open[k] = l && r ? (l < r ? l : r) : l || r;
  }
  const add = (b, l, r) => Math.max(0, (r || 0) + ((l || 0) - (b || 0)));
  for (const k of new Set([...Object.keys(L.done), ...Object.keys(R.done)])) {
    const n = add(B.done[k], L.done[k], R.done[k]);
    if (n > 0) out.done[k] = n;
  }
  const seen = new Map();
  [...R.log, ...L.log].forEach((x) => seen.set(x.p + "|" + x.d, x));
  out.log = [...seen.values()]
    .sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.p < b.p ? -1 : a.p > b.p ? 1 : 0))
    .slice(-LOG_MAX);
  for (const k of new Set([...Object.keys(L.rv), ...Object.keys(R.rv)])) {
    const n = add(B.rv[k], L.rv[k], R.rv[k]);
    if (n > 0) out.rv[k] = n;
  }
  return sanitiseMend(out);
}
