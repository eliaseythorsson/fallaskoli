// @ts-check
/* The days and the goals: four slices of the saved state (core/slices.js).
 *
 *   days        one record per day the program was used:
 *               { "2026-11-18": {a, c, xp, ms, nw, sk, g, lg, wg} }
 *   goal        the daily goal, in answers (default 10)
 *   weekGoal    the weekly goal (item 57): days of seven on which the daily
 *               goal is met. The main streak counts weeks in which it was met
 *               (core/state.js `weekStreak`).
 *   lastActive  the last day something was answered, or null
 *
 * What a day means — the streaks, the week, `dayRec` that writes one — is in
 * core/state.js; this file is what is saved of them, and how it is loaded,
 * merged and checked (issue #50: moved here from state.js, merge.js and
 * server/guard.mjs, unchanged).
 */

import { SKILL_IDS } from "./skills.js";
import { obj, keys, add, counters, choice, later, n, dayStr, isObj, pairs, DAY } from "./slicerules.js";

/** @typedef {import("../types").Slice} Slice */

const SKILLS = new Set(SKILL_IDS);

/* ---------- days ---------- */

function mergeDay(b, l, r) {
  if (!l) return r;
  if (!r && !b) return l;
  const out = counters(b, l, r, ["a", "c", "xp", "ms", "nw"]);
  out.sk = {};
  for (const k of keys(obj(l).sk, obj(r).sk))
    out.sk[k] = add(obj(obj(b).sk)[k], obj(obj(l).sk)[k], obj(obj(r).sk)[k]);
  out.g = obj(l).g ?? obj(r).g ?? null;
  out.lg = obj(l).lg || obj(r).lg ? 1 : 0;
  /* The weekly goal in force that day (item 57): the lower, as `weekGoalFor`
     judges a week by the lowest stamped on it. */
  const wl = obj(l).wg, wr = obj(r).wg;
  if (wl || wr) out.wg = wl && wr ? Math.min(wl, wr) : (wl || wr);
  return out;
}

/** `S.days`. @type {Slice} */
export const daysSlice = {
  key: "days",
  blank: () => ({}),
  /* `g` is the daily goal as it stood on that day, so a day is judged
     against the goal in force then rather than today's setting. Days
     recorded before it existed get null and fall back to the current goal. */
  migrate: (raw) => Object.fromEntries(Object.entries(raw || {}).map(([k, d]) => [k, {
    a: d.a || 0, c: d.c || 0, xp: d.xp || 0, ms: d.ms || 0, nw: d.nw || 0,
    sk: d.sk || {}, g: d.g ?? null,
    /* `lg` — the program was opened on this day, whether or not anything was
       answered. A day with answers also counts as opened (`loginStreak`). */
    lg: d.lg ? 1 : 0,
    /* `wg` — the weekly goal in force on that day, as `g` is for the daily
       one: raising the goal later must not un-meet a week already won. */
    wg: d.wg ?? null,
  }])),
  merge(B, L, R) {
    const out = {};
    for (const k of keys(L, R)) out[k] = mergeDay(obj(B)[k], obj(L)[k], obj(R)[k]);
    return out;
  },
  /* Real days only, not after tomorrow, with known skills and bounded counts. */
  clean(value, { limit }) {
    const days = {};
    for (const [k, d] of pairs(value, 5000, 10)) {
      if (!DAY.test(k) || k > limit || !isObj(d)) continue;
      const sk = {};
      for (const [id, v] of pairs(d.sk, 40)) if (SKILLS.has(id)) sk[id] = n(v);
      days[k] = { a: n(d.a), c: n(d.c), xp: n(d.xp), ms: n(d.ms, 86400000), nw: n(d.nw),
        sk, g: d.g == null ? null : n(d.g, 499), lg: d.lg ? 1 : 0,
        wg: d.wg == null ? null : Math.min(Math.max(n(d.wg, 7), 2), 7) };
    }
    return days;
  },
  ownText: false,
};

/* ---------- the daily goal ---------- */

/** `S.goal`. @type {import("../types").Slice<number>} */
export const goalSlice = {
  key: "goal",
  blank: () => 10,
  migrate: (raw) => raw || 10,
  /* The child's own switch: whichever device changed it. */
  merge: choice,
  clean: (value) => Math.min(Math.max(n(value, 499), 1), 499),
  ownText: false,
};

/* ---------- the weekly goal (critique item 57) ---------- */

export const WEEK_GOAL_DEFAULT = 4, WEEK_GOAL_MIN = 2, WEEK_GOAL_MAX = 7;

/** A saved or typed weekly goal as a whole number from 2 to 7. */
export function cleanWeekGoal(v) {
  const x = Math.round(Number(v));
  if (!Number.isFinite(x) || x < 1) return WEEK_GOAL_DEFAULT;
  return Math.max(WEEK_GOAL_MIN, Math.min(WEEK_GOAL_MAX, x));
}

/** `S.weekGoal`. @type {import("../types").Slice<number>} */
export const weekGoalSlice = {
  key: "weekGoal",
  blank: () => WEEK_GOAL_DEFAULT,
  migrate: (raw) => cleanWeekGoal(raw),
  merge: choice,
  /* `migrate` has made it a whole number from 2 to 7. */
  clean: (value) => value,
  ownText: false,
};

/* ---------- the last day active ---------- */

/** `S.lastActive`. @type {import("../types").Slice<?string>} */
export const lastActiveSlice = {
  key: "lastActive",
  blank: () => null,
  migrate: (raw) => raw || null,
  merge: (base, local, remote) => later(local, remote),
  clean: (value) => dayStr(value),
  ownText: false,
};
