/* What a builder may look at.

   A builder is a function of three things and nothing else:

       build(lex, view, rng)  →  { task, effects }  or  null

     lex    the lexicon and the sentence bank (core/lexicon.js)
     view   this file: the pupil's state and the session, lent READ-ONLY
     rng    the random source, a function returning a number in [0, 1).
            Never the global generator: a duel passes a seeded one, and so
            can a test or a bug report.

   Building a question changes nothing. Whatever showing it should change is
   returned beside it (tasks/effects.js). The view object is frozen; `S` and
   `sess` inside it are the live objects and are not frozen here (that would
   stop the app writing to them a moment later) — tests/purity.test.js freezes
   them all the way down and builds every type, which is what holds the rule.

     S           the saved state: skills (XP), words, cells, vocab
     sess        the session: diff per skill, seen, exSeen, sinceTable …
     policy      core/policy.js — what this child may meet, narrowed to the
                 session's topic by whoever builds the view
     today       the day as a key ("2026-11-16"); builders never read the clock
     forcedNoun  a noun to ask again in the next cloze, or null
     drillWord   the word of a rescue drill, or null (set by tasks/drill.js)
     mix         { n, counts } for the mix rule of a session, or null
     inRun       inside a practice session
     huntPrefer  the Villuveiðar error kinds this child misses              */

import { effectivePolicy, todayKey } from "../core/state.js";

export function makeView({ S, sess, policy = null, today = null, forcedNoun = null,
  drillWord = null, mix = null, inRun = false, huntPrefer = null }) {
  return Object.freeze({
    S, sess,
    policy: policy || effectivePolicy(S),
    today: today || todayKey(),
    forcedNoun: forcedNoun || null,
    drillWord: drillWord || null,
    mix: mix || null,
    inRun: !!inRun,
    huntPrefer: huntPrefer || [],
  });
}

/** The same view with something changed — a new object; the old one stands. */
export const withView = (view, changes) => Object.freeze({ ...view, ...changes });
