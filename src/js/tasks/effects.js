/* What showing a question does to the state — as data.

   A builder changes nothing (tasks/view.js). What used to be written on the
   way — the vocabulary word marked as asked, the hand-written item remembered
   so it is not asked again straight away, the words the session has met — is
   returned beside the task as a list of effects, and whoever SHOWS the task
   applies them: the app (control/*.js) for practice, core/duel.js for a duel.

   This is what stops a candidate that is built and thrown away from using
   anything up. Until v6.13 `pickTargeted` built up to five candidates and
   each one marked its vocabulary item as asked; over 30 simulated days 461
   items were marked and at most 273 shown, and every discarded one was then
   locked for a week (critique items 4 and 70).

   An effect is a plain object, so a test can read it and a server can ignore
   it:
     { op: "asked", key, day }       core/spacing.js: this word was asked today
     { op: "exSeen", key }           this hand-written item was just used
     { op: "seen", words }           lemmas the session has now met
     { op: "since", table, meaning } the gaps between tables and between
                                     meaning questions (tasks/next.js)
     { op: "clearForcedNoun" }       the noun waiting to be asked again has
                                     had its turn
     { op: "frame", key }            this bank sentence carried a question:
                                     not again this session, and one more in
                                     the pupil's tally (S.frames)            */

import { markAsked } from "../core/spacing.js";

/** How many hand-written items a session remembers having asked. */
export const EX_SEEN_MAX = 40;
/** How many sentences a session remembers having used as frames. */
export const FRAMES_SEEN_MAX = 200;

export const FX = {
  asked: (key, day) => ({ op: "asked", key, day }),
  exSeen: (key) => ({ op: "exSeen", key }),
  seen: (words) => ({ op: "seen", words }),
  since: (table, meaning) => ({ op: "since", table: !!table, meaning: !!meaning }),
  clearForcedNoun: () => ({ op: "clearForcedNoun" }),
  frame: (key) => ({ op: "frame", key }),
};

/** What every builder returns: the task, and what showing it does. */
export const built = (task, effects = []) => ({ task, effects });

/**
 * Apply the effects of the ONE task that is shown.
 * @param host  whoever holds the state: { S, sess, forcedNoun } — the app, or
 *              the private state a duel is built against.
 */
export function applyEffects(host, effects) {
  for (const e of effects || []) {
    switch (e.op) {
      case "asked":
        markAsked(host.S, e.key, e.day);
        break;
      case "exSeen": {
        const seen = (host.sess.exSeen ||= []);
        seen.push(e.key);
        if (seen.length > EX_SEEN_MAX) seen.splice(0, seen.length - EX_SEEN_MAX);
        break;
      }
      case "seen":
        host.sess.seen.push(...e.words);
        break;
      case "since":
        host.sess.sinceTable = e.table ? 0 : host.sess.sinceTable + 1;
        host.sess.sinceMeaning = e.meaning ? 0 : host.sess.sinceMeaning + 1;
        break;
      case "clearForcedNoun":
        host.forcedNoun = null;
        break;
      case "frame": {
        /* critique item 24: a sentence carries one question a session, and
           the ones this pupil has met least are preferred next time */
        const used = (host.sess.frames ||= []);
        used.push(e.key);
        if (used.length > FRAMES_SEEN_MAX) used.splice(0, used.length - FRAMES_SEEN_MAX);
        const tally = (host.S.frames ||= {});
        tally[e.key] = (tally[e.key] || 0) + 1;
        break;
      }
      default:
        /* A builder that invents an effect nobody applies has a bug; say so
           rather than lose it quietly. */
        throw new Error("unknown effect: " + e.op);
    }
  }
}
