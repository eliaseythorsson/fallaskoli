// @ts-check
/* Two devices, one child: putting two copies of the progress back together.
 *
 * Until v6.3 the whole state went up and the last write won, so a phone left
 * open since breakfast could erase an evening's work on the laptop with one
 * answer. The server now refuses a write that is not based on what it holds
 * (`PUT /state/:id`, 409), and this module is what the program does next.
 *
 * It is a THREE-way merge, and the third copy is what makes it safe:
 *
 *   base    what this device last agreed with the server about
 *   local   what this device has now
 *   remote  what the server has now (another device's work)
 *
 * Everything this device did since `base` is the difference local − base, and
 * that difference is added to `remote`. Nothing is ever taken from either
 * side: counters add, bests take the larger, dates take the later, and the
 * child's own switches follow whichever device actually changed them.
 *
 * Pure: no DOM, no requests, never mutates its arguments.
 */

import { mergeSlices } from "./slices.js";
import { mergeMend } from "./mending.js";
import { mergeLevels } from "./difficulty.js";
import { mergeByType } from "./mastery.js";
import { mergeByNode } from "./skillmap.js";
import { mergeSeenTypes } from "./examples.js";
import { mergeMapBand } from "./skillmap.js";
import { mergeTour } from "./placement.js";

/** @typedef {import("../types").State} State */

const num = (x) => (typeof x === "number" && Number.isFinite(x) ? x : 0);
const obj = (x) => (x && typeof x === "object" && !Array.isArray(x) ? x : {});
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const later = (a, b) => (!a ? b ?? null : !b ? a : (String(a) > String(b) ? a : b));
const earlier = (a, b) => (!a ? b ?? null : !b ? a : (String(a) < String(b) ? a : b));

/** A counter both sides only ever add to. */
const add = (b, l, r) => Math.max(0, num(r) + (num(l) - num(b)));

/** A pot that can also shrink (XP fades over a break). If BOTH sides shrank it
    is the same fading seen twice, and it must not be taken twice. */
const pot = (b, l, r) =>
  (num(l) < num(b) && num(r) < num(b)) ? Math.min(num(l), num(r)) : add(b, l, r);

/** A setting: whoever changed it since `base` wins; if both did, this device. */
const choice = (b, l, r) => (same(l, b) ? (r === undefined ? l : r) : l);

const keys = (...os) => [...new Set(os.flatMap((o) => Object.keys(obj(o))))];

function counters(b, l, r, fields) {
  const out = { ...obj(r), ...obj(l) };
  for (const f of fields) out[f] = add(obj(b)[f], obj(l)[f], obj(r)[f]);
  return out;
}

/** dates in `l` that were not already in `b`, as a multiset. */
function newDates(b, l) {
  const left = [...(Array.isArray(b) ? b : [])];
  const out = [];
  for (const d of (Array.isArray(l) ? l : [])) {
    const i = left.indexOf(d);
    if (i >= 0) left.splice(i, 1); else out.push(d);
  }
  return out;
}

function mergeBadge(b, l, r, keep = 80) {
  if (!l) return r;
  if (!r) return l;
  /* Won on both devices with no common past: it is one badge, not two. */
  const n = b ? add(b.n, l.n, r.n) : Math.max(num(l.n), num(r.n));
  const dates = b
    ? [...(r.dates || []), ...newDates(b.dates, l.dates)]
    : ((l.dates || []).length >= (r.dates || []).length ? l.dates || [] : r.dates || []);
  return {
    ...r, ...l,
    n: Math.max(1, n),
    dates: [...dates].sort().slice(-keep),
    first: earlier(l.first, r.first),
    last: later(l.last, r.last),
  };
}

/**
 * The arguments are typed as the current State, but the code reads every
 * part of them defensively (`obj`, `num`): a copy may come from an older
 * build on another device.
 *
 * @param {?State} base   the last state this device and the server agreed on
 * @param {State} local       this device's state now
 * @param {State} remote      the server's state now
 * @returns {State} a new state holding the work of both
 */
export function mergeStates(base, local, remote) {
  if (!remote) return local;
  if (!local) return remote;
  const B = obj(base), L = obj(local), R = obj(remote);
  const out = { ...R, ...L };


  /* The converted slices (core/slices.js) merge themselves — the review
     queue (core/review.js `mergeReview`): one entry per thing missed,
     whichever device missed it. */
  mergeSlices(out, B, L, R);


  return out;
}
