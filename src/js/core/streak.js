/* "Þrjár í röð" — three questions on a pattern, at once (critique item 36).

   Until v6.13 a diagnosed miss put the pattern's name under the wrong answer
   ("🔎 Villugreining: Þolfall og þágufall ruglast") and the session moved on.
   The pupil had been told WHAT went wrong at the one moment they cared, and
   was given nothing to do about it. Now the line carries an offer: three
   questions on that pattern, the rule shown before the first, and the
   pattern put in the review queue for tomorrow (core/review.js
   `queuePattern`).

   ---- inside the session, but not counted in it -------------------------------

   The choice was between (a) three questions inserted now, and (b) a short
   drill after the session. (a), because for a 13-year-old the reason to do
   it is the miss they have just made: the rule makes sense against the
   answer still on the screen, and after seven more questions it would be a
   lecture about something half forgotten. But the three are NOT questions of
   the session. "Spurning 6 af 10" must never become "6 af 13", or count
   backwards: a pupil who chose to do extra work should not see their session
   grow longer for it. So the session's own line steps aside for a line of
   the three's own — "💪 Þrjár í röð · 2/3" — and when they are done the
   session picks up where it was, at the same count. They are offered, never
   imposed: Áfram still goes straight on.

   They count everywhere else, like any answer: XP, the error diagnosis, the
   review queue. A pattern is offered once per session; a miss inside the
   three offers nothing (the pupil is already working on it).

   Pure: no DOM, no clock, no random numbers. control/drill.js keeps the record.  */

import { patternById } from "./diagnosis.js";

/** How many questions. The name says three, so it is three. */
export const STREAK_N = 3;

/* Patterns three questions cannot practise: a slip of one letter or a
   missing accent can happen in any typed form, so "three questions on it"
   would be three typed forms about nothing in particular. The review queue
   and the summary still have them. */
const NOT_PRACTISED = new Set(["broddar", "stafsetning"]);

/**
 * The pattern to offer three questions on, after an answer — or null.
 *
 * @param findings  what the diagnosis found (core/diagnosis.js `diagnose`)
 * @param verdict   the answer's verdict: only a wrong answer (false) offers
 * @param opts.done      patterns already offered in this session
 * @param opts.canPractise  (id) → can questions on it be built under the
 *                       curriculum policy? (ui/session.js `usable`)
 */
export function streakPattern(findings, verdict, { done = [], canPractise = () => true } = {}) {
  if (verdict !== false) return null;
  for (const f of findings || []) {
    if (!f || f.soft) continue;
    const p = patternById(f.p);
    if (!p || p.meta || NOT_PRACTISED.has(p.id) || done.includes(p.id)) continue;
    if (!canPractise(p.id)) continue;
    return p.id;
  }
  return null;
}

/**
 * A new run of three. `from` is the question the miss was made in: its type
 * is what the pattern is asked in when it comes back as a review tomorrow.
 */
export function startStreak(p, from = {}) {
  return { p, n: STREAK_N, i: 0, c: 0, marks: [], intro: true, done: false,
    t: from.t || null, sk: from.sk || null };
}

/**
 * A new run of three on one WORD (#17): the first time a word is hard
 * (core/wordknowledge.js `noteHard`), three questions on it straight away —
 * the rescue drill's kinds of question for its word class (tasks/drill.js
 * `wordStreakTasks`), three of them rather than ten to twenty. No rule comes
 * first: a word has no rule, and the miss is on the screen. `nm` is the word
 * as the line names it. Nothing is queued when they end: the miss that made
 * the word hard is already in the review queue (core/answer.js).
 * @param {string} word  a `wordKey` @param {string} nm
 */
export function startWordStreak(word, nm) {
  return { p: null, w: word, nm: nm || String(word).split("|")[0], n: STREAK_N, i: 0, c: 0,
    marks: [], intro: false, done: false, t: null, sk: null };
}

/** One of the three answered. A question with no right answer does not count. */
export function stepStreak(st, ok) {
  if (!st || st.done || (ok !== true && ok !== false)) return st;
  st.marks.push(ok ? 1 : 0);
  st.i += 1;
  if (ok) st.c += 1;
  st.done = st.i >= st.n;
  return st;
}

/** Has any of the three been answered — is there something to put in the queue? */
export const streakAnswered = (st) => !!st && st.i > 0;

/**
 * What the review queue is told when the three are over (or stopped after
 * one or two): the pattern, in the type of question it was missed in.
 * null if nothing was answered.
 */
export function streakEntry(st) {
  if (!streakAnswered(st) || !st.t) return null;
  return { p: st.p, t: st.t, sk: st.sk };
}

/**
 * The line under the last of the three. Kind whatever the score: the pupil
 * chose to do extra work on the thing they find hardest.
 */
export function streakLine(st) {
  if (!st || !st.done) return "";
  const back = "Þetta kemur aftur í upprifjun á morgun";
  if (st.c === st.n) return `Allar þrjár réttar — vel gert! ${back} svo að það festist.`;
  if (st.c === st.n - 1) return `${st.c} af ${st.n} rétt. ${back}.`;
  return `${st.c} af ${st.n} rétt. Þetta er snúið, en það lagast með æfingu. ${back}.`;
}
