// @ts-check
/* Which bank sentences have carried a question for this pupil, and how
 * often: `S.frames`, { frame key: count } (tasks/frames.js `frameKey`). The
 * reverse analysis prefers the ones seen least (v6.13, critique item 24).
 *
 * A slice of the saved state (core/slices.js), in a module of its own:
 * moved here unchanged from core/state.js (which re-exports `cleanFrames`,
 * `FRAME_KEY` and `FRAMES_MAX`), core/merge.js and server/guard.mjs
 * (issue #50).
 */

import { keys, counters, n, pairs } from "./slicerules.js";

/** The frame tally: short keys and whole counts, nothing else. */
export const FRAME_KEY = /^f[0-9a-z]{1,7}$/;
export const FRAMES_MAX = 4000;
export function cleanFrames(raw) {
  const out = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw).slice(0, FRAMES_MAX)) {
    const c = Number.isFinite(v) ? Math.floor(v) : 0;
    if (FRAME_KEY.test(k) && c >= 1) out[k] = Math.min(c, 100000);
  }
  return out;
}

/** @type {import("../types").Slice} */
export const framesSlice = {
  key: "frames",
  blank: () => ({}),
  migrate: (raw) => cleanFrames(raw),
  /* Counts that only ever grow, added like any counter. */
  merge: (B, L, R) => counters(B, L, R, keys(L, R)),
  /* `migrate` has already kept only short keys and whole counts; here the
     counts are held to the same ceiling as every other counter. */
  clean: (value) => Object.fromEntries(pairs(value, FRAMES_MAX, 8).map(([k, v]) => [k, n(v, 100000)])),
  ownText: false,
};
