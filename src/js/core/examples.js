/* Worked examples, and which question types a pupil has met (item 41).

   The first time a pupil meets a type of question, its card opens with one
   example done for them (content/examples.js). `S.seenTypes` is
   { typeId: day } — the day the type was first shown. It only ever grows: a
   type met on either device is met (core/merge.js), on the earlier day.

   Who sees one: anybody meeting a type for the first time, including a pupil
   with progress from before this existed (they meet each example once).
   Not in a duel — a duel is timed and the same for both sides.

   Pure. No DOM. */

import { EXAMPLES } from "../content/examples.js";
import { TYPE_IDS } from "./policy.js";

export { EXAMPLES };

const KNOWN = new Set(TYPE_IDS);
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isObj = (x) => x && typeof x === "object" && !Array.isArray(x);

/** The worked example of a question type, or null. */
export const exampleFor = (typeId) => (KNOWN.has(typeId) && EXAMPLES[typeId]) || null;

/** Has this pupil met this type before? */
export const hasSeenType = (S, typeId) => !!(S && isObj(S.seenTypes) && S.seenTypes[typeId]);

/**
 * Should this question open with its worked example? Only for a type with an
 * example that this pupil has not met, and never in a duel.
 */
export function firstMeeting(S, task) {
  if (!task || task.duel) return null;
  const id = task.typeId;
  if (!id || hasSeenType(S, id)) return null;
  return exampleFor(id);
}

/** Write down that the pupil has met this type (today). True if it is new. */
export function markTypeSeen(S, typeId, day) {
  if (!S || !KNOWN.has(typeId) || !DAY.test(String(day))) return false;
  const seen = isObj(S.seenTypes) ? S.seenTypes : (S.seenTypes = {});
  if (seen[typeId]) return false;
  seen[typeId] = day;
  return true;
}

/** `S.seenTypes` as it may be trusted: known types, one day each. Bounded by
    the number of question types. Used by `migrate` and the server's guard. */
export function cleanSeenTypes(raw) {
  const out = {};
  if (!isObj(raw)) return out;
  for (const id of TYPE_IDS) if (typeof raw[id] === "string" && DAY.test(raw[id])) out[id] = raw[id];
  return out;
}

/** Two devices: the union, each type on the earlier day. */
export function mergeSeenTypes(local, remote) {
  const L = cleanSeenTypes(local), R = cleanSeenTypes(remote);
  const out = { ...R };
  for (const [k, d] of Object.entries(L)) out[k] = !out[k] || d < out[k] ? d : out[k];
  return out;
}
