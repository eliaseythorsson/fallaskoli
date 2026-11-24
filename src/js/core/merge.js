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
import { obj } from "./slicerules.js";

/** @typedef {import("../types").State} State */

/* The rules — counters add, bests take the larger, dates the later, a setting
   follows the device that changed it — are said once in core/slicerules.js,
   and each slice of the state says which of them it follows, in the module
   that owns it (core/slices.js lists them). */

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
  /* A key that is not a slice follows this device, else the server. */
  const out = { ...R, ...L };
  /* Every slice (core/slices.js) merges itself. */
  mergeSlices(out, B, L, R);
  return out;
}
