// @ts-check
/* The log of practice sessions (v6.10), `S.runs`: the last forty, newest
 * last — {at: ms, d: date, topic, n, c, j: judged, xp, top: [pattern ids]}.
 * core/run.js writes it when a session ends (`logRun`); the session screen
 * and the class goal read it.
 *
 * Its own small module because it is a slice of the saved state
 * (core/slices.js) and core/run.js imports core/state.js, which a module
 * with a slice must not (issue #50). Moved here unchanged from
 * core/state.js `migrate`, core/merge.js `mergeStates` and
 * server/guard.mjs `cleanState`.
 */

import { n, dayStr, isObj, short } from "./slicerules.js";

/** @type {import("../types").Slice} */
export const runsSlice = {
  key: "runs",
  blank: () => [],
  migrate: (raw) => (Array.isArray(raw) ? raw.filter((r) => r && typeof r === "object").slice(-40) : []),
  /* The union, by the moment each was finished. */
  merge(B, L, R) {
    const runs = new Map();
    [...(Array.isArray(R) ? R : []), ...(Array.isArray(L) ? L : [])]
      .forEach((x) => { if (x && x.at) runs.set(x.at, x); });
    return [...runs.values()].sort((a, b) => a.at - b.at).slice(-40);
  },
  clean: (value) => (Array.isArray(value) ? value : []).filter(isObj).slice(-40).map((r) => ({
    at: n(r.at, 1e13), d: dayStr(r.d), topic: short(r.topic, 40), n: n(r.n, 100), c: n(r.c, 100),
    j: n(r.j, 100), xp: n(r.xp, 100000),
    top: (Array.isArray(r.top) ? r.top : []).filter((x) => typeof x === "string" && x.length <= 40).slice(0, 5),
  })),
  ownText: false,
};
