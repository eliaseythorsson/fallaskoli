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
 *             words: the Orðakort word cards (core/wordcard.js, #15/#18).
 *             See below.
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
 * ---- where the slices live -------------------------------------------------
 *
 * Every slice is described in the module that owns its concept (issue #50
 * moved the last of them out of state.js, merge.js and guard.mjs); the
 * imports below are the index. A slice core/state.js used to own has a
 * small module of its own: core/days.js, core/settings.js, core/runlog.js,
 * core/frametally.js. The rules most slices share (a counter both devices
 * add to, a setting whoever changed it wins, a bounded whole number, a day
 * key) are core/slicerules.js.
 *
 * So `blankState`, `migrate`, `mergeStates` and `cleanState` do nothing but
 * walk this list — except the checks across slices, which stay in
 * server/guard.mjs with their comment.
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

import { thisDevice } from "./slicerules.js";
import { reviewSlice } from "./review.js";
import { xpSlice, bestLevelSlice, runSlice, bestRunSlice, totalAnswersSlice, totalCorrectSlice,
  skillsSlice, cellsSlice } from "./progress.js";
import { badgesSlice, multiSessionRunSlice, lastSessionSkillsSlice, countersSlice,
  periodsSlice, settledSlice } from "./badges.js";
import { showcaseSlice, titleSlice, socialSlice } from "./social.js";
import { profileSlice } from "./profile.js";
import { duelsSlice } from "./duel.js";
import { diagSlice } from "./diagnosis.js";
import { readSlice } from "./lessons.js";
import { runsSlice } from "./runlog.js";
import { difficultySlice } from "./difficulty.js";
import { framesSlice } from "./frametally.js";
import { byTypeSlice } from "./mastery.js";
import { byNodeSlice, mapBandSlice } from "./skillmap.js";
import { seenTypesSlice } from "./examples.js";
import { mendSlice } from "./mending.js";
import { tourSlice } from "./placement.js";
import { enabledSlice, policySlice, allowedSlice } from "./policy.js";
import { settingsSlice } from "./settings.js";
import { daysSlice, goalSlice, weekGoalSlice, lastActiveSlice } from "./days.js";
import { wordKnowledgeSlice, wordsSlice, drillsSlice, drillDaysSlice, learningSlice } from "./wordknowledge.js";
import { wordCardsSlice } from "./wordcard.js";

/** @typedef {import("../types").Slice} Slice */
/** @typedef {import("../types").CleanContext} CleanContext */

/* ---------- the version of the saved file ---------- */

/* 12 (issue #8): word knowledge (core/wordknowledge.js). A copy saved
   before it starts word knowledge empty and the word records without their
   short history (`RESET_BEFORE` there). */
export const STATE_VERSION = 12;

/** `S.v`: the shape this program saves. A copy of any age is loaded into
    this shape, so a loaded copy always has it. @type {Slice} */
export const versionSlice = {
  key: "v",
  blank: () => STATE_VERSION,
  migrate: () => STATE_VERSION,
  merge: thisDevice,
  clean: (value) => value,
  ownText: false,
};

/**
 * Every key of the saved state, in the order of the saved file. Exported as
 * a plain array so that a test can add a fixture slice (tests/owntext.test.js);
 * nothing in the program changes it.
 * @type {Slice[]}
 */
export const SLICES = [
  versionSlice,
  profileSlice,
  xpSlice,
  bestLevelSlice,
  daysSlice,
  cellsSlice,
  wordsSlice,
  skillsSlice,
  badgesSlice,
  goalSlice,
  runSlice,
  bestRunSlice,
  weekGoalSlice,
  totalAnswersSlice,
  totalCorrectSlice,
  multiSessionRunSlice,
  lastSessionSkillsSlice,
  countersSlice,
  enabledSlice,
  policySlice,
  allowedSlice,
  settingsSlice,
  lastActiveSlice,
  periodsSlice,
  settledSlice,
  showcaseSlice,
  titleSlice,
  socialSlice,
  drillsSlice,
  drillDaysSlice,
  readSlice,
  duelsSlice,
  diagSlice,
  runsSlice,
  reviewSlice,
  difficultySlice,
  framesSlice,
  byTypeSlice,
  byNodeSlice,
  seenTypesSlice,
  mapBandSlice,
  mendSlice,
  tourSlice,
  wordKnowledgeSlice,
  learningSlice,
  wordCardsSlice,
];

/** The keys of the slices that hold the pupil's own text. @returns {string[]} */
export const ownTextKeys = () => SLICES.filter((s) => s.ownText).map((s) => s.key);

/* A description that is not whole is a mistake to find at load, not when a
   pupil's progress is merged. */
const FIELDS = ["blank", "migrate", "merge", "clean"];
/** @param {Slice[]} list */
export function checkSlices(list = SLICES) {
  const seen = new Set();
  for (const entry of list) {
    /** @type {any} */
    const s = entry;
    if (!s || typeof s.key !== "string" || !s.key) throw new Error("core/slices.js: an entry without a key");
    if (seen.has(s.key)) throw new Error(`core/slices.js: the slice "${s.key}" is in the list twice`);
    seen.add(s.key);
    if (typeof s.ownText !== "boolean") throw new Error(`core/slices.js: the slice "${s.key}" must say ownText: true or false`);
    for (const f of FIELDS)
      if (typeof s[f] !== "function") throw new Error(`core/slices.js: the slice "${s.key}" has no ${f}()`);
  }
}
checkSlices();

/* ---------- the four walks -------------------------------------------------
 * Each reads the list afresh: a test may have added a slice. */

/** `blankState`: every slice's `blank()`, in the list's order.
    @returns {Record<string, any>} */
export function blankSlices() {
  /** @type {Record<string, any>} */
  const out = {};
  for (const s of SLICES) out[s.key] = s.blank();
  return out;
}

/** `migrate`: every slice rebuilt from the saved copy, into `S`.
    @param {Record<string, any>} S  the state being built (from blankState)
    @param {Record<string, any>} raw  what was saved */
export function migrateSlices(S, raw) {
  for (const s of SLICES) S[s.key] = s.migrate(raw[s.key], raw);
}

/** `mergeStates`: every slice merged, into `out`.
    @param {Record<string, any>} out
    @param {Record<string, any>} B @param {Record<string, any>} L @param {Record<string, any>} R */
export function mergeSlices(out, B, L, R) {
  for (const s of SLICES) out[s.key] = s.merge(B[s.key], L[s.key], R[s.key]);
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

/** `cleanState`: every slice checked, in `S` (already migrated).
    @param {Record<string, any>} S @param {CleanContext} ctx */
export function cleanSlices(S, ctx) {
  for (const s of SLICES) S[s.key] = s.clean(S[s.key], ctx);
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
  for (const s of SLICES) {
    if (!s.ownText) continue;
    next[s.key] = prev && s.key in prev ? prev[s.key] : s.blank();
  }
  return next;
}
