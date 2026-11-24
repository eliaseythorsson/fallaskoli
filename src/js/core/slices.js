// @ts-check
/* The saved state, slice by slice: one list (issue #49).
 *
 * A pupil's progress (the "state") is made of slices: XP, the days, the
 * badges, the review queue, the word records … one top-level key each. Every
 * slice is handled in FOUR places:
 *
 *   blankState   core/state.js     what a new pupil starts with
 *   migrate      core/state.js     an old or odd saved copy brought up to date
 *   mergeStates  core/merge.js     two devices' copies put together
 *   cleanState   server/guard.mjs  what the server will store
 *
 * ---- the trap -------------------------------------------------------------
 *
 * `migrate` starts from a blank state and copies only the slices it names.
 * A slice that is forgotten there is SILENTLY DELETED every time progress is
 * loaded, in the browser and on the server, with no error: the pupil's work
 * is there until the next reload, and then it is not. `cleanState` (which
 * calls `migrate`) does the same to everything the server stores, and a
 * slice forgotten in `mergeStates` follows whichever device spoke last.
 *
 * Two things stop that now:
 *
 *   - this list. Every key of the saved state is named here, in the order of
 *     the saved file. `blankState` is assembled from it and throws if it
 *     makes a key the list does not have; `migrate`, `mergeStates` and
 *     `cleanState` walk it.
 *   - tests/slices.test.js, the safety net. It fills EVERY slice with
 *     realistic data (tests/fixtures/full-progress.js), sends the progress
 *     through migrate, merge (both directions, and with a base) and
 *     cleanState, and fails, naming the slice and the file to fix, if any
 *     slice comes out missing or emptied. A slice in `blankState` that the
 *     fixture does not fill fails too, so a new slice cannot skip the test.
 *
 * ---- a slice description --------------------------------------------------
 *
 * A converted slice owns its shape. The module that owns the slice exports
 * one small object (`Slice` in src/js/types.d.ts); core/review.js
 * `reviewSlice` is the worked example:
 *
 *   key       the top-level key in the state: "review"
 *   blank()   what a new pupil has. A fresh object every call.
 *   migrate(raw, whole)
 *             the slice rebuilt from what was saved: `raw` is `whole[key]`,
 *             of any age and any shape, or undefined; `whole` is the whole
 *             saved copy, for a slice that once lived under another name or
 *             is first worked out from another slice. Never throws, never
 *             returns undefined, and keeps everything real: this is where
 *             the trap was.
 *   merge(base, local, remote)
 *             the three-way merge of core/merge.js for this slice: `base`
 *             is what this device and the server last agreed on (or
 *             undefined), `local` this device now, `remote` the server now.
 *             Nothing either side did since `base` may be lost; nothing may
 *             be counted twice. Pure: never mutates its arguments.
 *   clean(value, ctx)
 *             the server's check (server/guard.mjs), called with what
 *             `migrate` returned. It must still not trust it: it is the
 *             last line between an upload and the disk. Bounds sizes,
 *             drops what the program does not have (an unknown skill or
 *             question type), and holds dates to the calendar: `ctx.today`
 *             is the server's Date, `ctx.limit` the last day key a saved
 *             day may have (tomorrow, for time zones). Drops, never rejects:
 *             a child's real progress is never refused for one odd key.
 *   ownText   true if the slice holds text the pupil wrote in their own
 *             words (the Orðakort word cards, #15/#18). See below.
 *
 * A slice sees only itself. A check that reads two slices (XP may not rise
 * faster than the days' records; the showcase holds only badges the pupil
 * has) belongs to no slice and stays in server/guard.mjs.
 *
 * ---- "the pupil's own text" (ownText: true) --------------------------------
 *
 * Such a slice leaves the pupil's account ONLY for (1) the pupil's own
 * syncing between their devices, (2) their own export and (3) a grading
 * request the pupil makes themselves — and that is sent from the screen
 * through the text reader, never read from the saved progress. It is never
 * sent to a teacher's, guardian's, classmate's or administrator's screen, the
 * leaderboard, the roster, the badge statistics or any log (ADR 0003,
 * docs/PRIVACY.md §1g). The server routes that hand progress to anybody but
 * its pupil pass it through `withoutOwnText`; a write by anybody but the
 * pupil keeps the stored text with `keepOwnText`. tests/owntext.test.js
 * checks every route that reads other pupils' progress with a fixture slice.
 *
 * ---- slices not converted yet -----------------------------------------------
 *
 * `notYet(key)` below: the key is named (so the list is whole and the safety
 * net covers it), but its four pieces of code are still where they were —
 * the literal in `blankState`, a line in `migrate`, a line in `mergeStates`,
 * a block in `cleanState`. Issue #50 converts them, one at a time:
 *
 *   1. In the module that owns the slice (core/mastery.js for `byType` …;
 *      for a slice core/state.js owns, a module of its own under core/),
 *      export a `Slice` built from the code in those four places — moved,
 *      not rewritten, so nothing about the saved file changes.
 *   2. Replace `notYet("key")` here with it, in the same place in the list.
 *   3. Delete the four old pieces of code. `blankState` throws if the
 *      literal still has the key; the safety net fails if a piece is lost.
 *   4. `node --test tests/slices.test.js tests/merge.test.js
 *      tests/state*.test.js tests/state-property.test.js`.
 *
 * A module with a slice must not import core/state.js or core/merge.js:
 * they import this list, and the cycle would leave the list half-built.
 *
 * Adding a NEW slice: write its `Slice`, add it here (at the end unless it
 * belongs beside another), add it to `State` in src/js/types.d.ts, and give
 * it realistic data in tests/fixtures/full-progress.js — the safety net
 * fails until you do. Nothing in state.js, merge.js or guard.mjs changes.
 *
 * Pure: no DOM, no clock (the server hands `cleanContext` its date).
 */

import { reviewSlice } from "./review.js";

/** @typedef {import("../types").Slice} Slice */
/** @typedef {import("../types").SliceEntry} SliceEntry */
/** @typedef {import("../types").CleanContext} CleanContext */

/** A slice whose code is still in the four places (until #50).
    @param {string} key @returns {SliceEntry} */
const notYet = (key) => ({ key, notYet: true, ownText: false });

/**
 * Every key of the saved state, in the order of the saved file. Exported as
 * a plain array so that a test can add a fixture slice (tests/owntext.test.js);
 * nothing in the program changes it.
 * @type {SliceEntry[]}
 */
export const SLICES = [
  notYet("v"),
  notYet("profile"),
  notYet("xp"),
  notYet("bestLevel"),
  notYet("days"),
  notYet("cells"),
  notYet("words"),
  notYet("skills"),
  notYet("badges"),
  notYet("vocab"),
  notYet("goal"),
  notYet("run"),
  notYet("bestRun"),
  notYet("weekGoal"),
  notYet("totalAnswers"),
  notYet("totalCorrect"),
  notYet("multiSessionRun"),
  notYet("lastSessionSkills"),
  notYet("counters"),
  notYet("enabled"),
  notYet("policy"),
  notYet("allowed"),
  notYet("settings"),
  notYet("lastActive"),
  notYet("periods"),
  notYet("settled"),
  notYet("showcase"),
  notYet("title"),
  notYet("social"),
  notYet("drills"),
  notYet("drillDays"),
  notYet("read"),
  notYet("duels"),
  notYet("diag"),
  notYet("runs"),
  reviewSlice,
  notYet("difficulty"),
  notYet("frames"),
  notYet("byType"),
  notYet("byNode"),
  notYet("seenTypes"),
  notYet("mapBand"),
  notYet("mend"),
  notYet("tour"),
];

/** Is this entry a converted slice (rather than one named by `notYet`)?
    @param {SliceEntry} s @returns {s is Slice} */
export const isSlice = (s) => !("notYet" in s && s.notYet);

/** The converted slices, in order. Read the list afresh each time: a test
    may have added one. @returns {Slice[]} */
export const convertedSlices = () => SLICES.filter(isSlice);

/** The keys of the slices that hold the pupil's own text. @returns {string[]} */
export const ownTextKeys = () => SLICES.filter((s) => s.ownText).map((s) => s.key);

/* A description that is not whole is a mistake to find at load, not when a
   pupil's progress is merged. */
const FIELDS = ["blank", "migrate", "merge", "clean"];
/** @param {SliceEntry[]} list */
export function checkSlices(list = SLICES) {
  const seen = new Set();
  for (const entry of list) {
    /** @type {any} */
    const s = entry;
    if (!s || typeof s.key !== "string" || !s.key) throw new Error("core/slices.js: an entry without a key");
    if (seen.has(s.key)) throw new Error(`core/slices.js: the slice "${s.key}" is in the list twice`);
    seen.add(s.key);
    if (typeof s.ownText !== "boolean") throw new Error(`core/slices.js: the slice "${s.key}" must say ownText: true or false`);
    if (!isSlice(s)) continue;
    for (const f of FIELDS)
      if (typeof s[f] !== "function") throw new Error(`core/slices.js: the slice "${s.key}" has no ${f}()`);
  }
}
checkSlices();

/* ---------- the four walks ------------------------------------------------- */

/**
 * `blankState`: the whole state, in the list's order — each converted slice's
 * `blank()`, each one not yet converted from `legacy` (the literal still in
 * core/state.js). Throws if `legacy` has a key the list does not name, or
 * lacks one it should have: that is the trap, caught where it is made.
 * @param {Record<string, any>} legacy
 * @returns {Record<string, any>}
 */
export function assembleBlank(legacy) {
  const named = new Set(SLICES.map((s) => s.key));
  for (const k of Object.keys(legacy))
    if (!named.has(k)) throw new Error(`blankState has "${k}", which core/slices.js does not list: add it there`);
  /** @type {Record<string, any>} */
  const out = {};
  for (const s of SLICES) {
    if (isSlice(s)) {
      if (s.key in legacy) throw new Error(`blankState still has "${s.key}", which is a converted slice: delete it from the literal`);
      out[s.key] = s.blank();
    } else {
      if (!(s.key in legacy)) throw new Error(`blankState has no "${s.key}", which core/slices.js lists as not converted yet`);
      out[s.key] = legacy[s.key];
    }
  }
  return out;
}

/** `migrate`: every converted slice rebuilt from the saved copy, into `S`.
    @param {Record<string, any>} S  the state being built (from blankState)
    @param {Record<string, any>} raw  what was saved */
export function migrateSlices(S, raw) {
  for (const s of convertedSlices()) S[s.key] = s.migrate(raw[s.key], raw);
}

/** `mergeStates`: every converted slice merged, into `out`.
    @param {Record<string, any>} out
    @param {Record<string, any>} B @param {Record<string, any>} L @param {Record<string, any>} R */
export function mergeSlices(out, B, L, R) {
  for (const s of convertedSlices()) out[s.key] = s.merge(B[s.key], L[s.key], R[s.key]);
}

/**
 * What a slice's `clean` is told: the server's date and the last day a saved
 * day may have — tomorrow is allowed (time zones); the day after is not a day
 * yet.
 * @param {Date} today @returns {CleanContext}
 */
export function cleanContext(today) {
  return { today, limit: new Date(today.getTime() + 36 * 3600000).toISOString().slice(0, 10) };
}

/** `cleanState`: every converted slice checked, in `S` (already migrated).
    @param {Record<string, any>} S @param {CleanContext} ctx */
export function cleanSlices(S, ctx) {
  for (const s of convertedSlices()) S[s.key] = s.clean(S[s.key], ctx);
}

/* ---------- the pupil's own text ------------------------------------------- */

/**
 * Progress as it may be shown to anybody but its pupil: the same object if it
 * holds none of the pupil's own text, otherwise a shallow copy without it.
 * @template T
 * @param {T} state @returns {T}
 */
export function withoutOwnText(state) {
  if (!state || typeof state !== "object") return state;
  const keys = ownTextKeys().filter((k) => k in state);
  if (!keys.length) return state;
  const out = { ...state };
  for (const k of keys) delete out[k];
  return out;
}

/**
 * A write by somebody other than the pupil (an administrator): whatever it
 * carries, the pupil's own text stays what was stored — it can be neither
 * replaced nor erased that way. Mutates and returns `next`.
 * @param {Record<string, any>} next  the state about to be stored
 * @param {Record<string, any>|null} prev  what is stored now, or null
 */
export function keepOwnText(next, prev) {
  /* Only a converted slice can say ownText: true (`notYet` says false). */
  for (const s of convertedSlices()) {
    if (!s.ownText) continue;
    next[s.key] = prev && s.key in prev ? prev[s.key] : s.blank();
  }
  return next;
}
