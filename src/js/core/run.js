// @ts-check
/* A practice session, the parts with no screen (critique item 76).

   app.js used to hold all of a session in one object with the drills, the
   duels and the wiring. What a session IS — the record it keeps, the policy
   its questions are asked under, what an answer adds to it and what its
   summary says — is pure and lives here, where a test can reach it. Starting
   one, drawing its questions and showing its screens is the session
   controller's (control/session.js), which calls these.

   The record (`Run`, types.d.ts) is not saved: a session abandoned by closing
   the tab is simply not written down. A finished one goes into `S.runs`
   (`writeRun`), and its summary is kept until the pupil picks something else.

   Nothing here reads the clock or draws a random number: the day and the time
   are handed in. */

import { effectivePolicy, chosenPolicy } from "./state.js";
import { createPolicy, narrowPolicy, openFor } from "./policy.js";
import { assignmentPolicy } from "./assignment.js";
import { activePatterns, focusTypes, runReport } from "./diagnosis.js";
import { SKILL_IDS } from "./skills.js";
import { nodeSession } from "./skillmap.js";
import { nodeById } from "./curriculum.js";
import { practiceSkills } from "./lessons.js";

/** @typedef {import("../types").State} State */
/** @typedef {import("../types").Policy} Policy */
/** @typedef {import("../types").Run} Run */
/** @typedef {import("../types").Task} Task */
/** @typedef {import("../types").TaskType} TaskType */

/**
 * The session topics that are not a skill. Their names and icons are the
 * picker's (ui/session.js MIXED, MINE, TODAY, ASSIGNED); the ids are here
 * because what a session does depends on them.
 */
export const TOPIC = Object.freeze({
  MIXED: "blandad",       // everything switched on
  MINE: "villur",         // "Villurnar mínar": the pupil's own error patterns
  TODAY: "dagsins",       // "Lota dagsins" (item 21, core/today.js)
  ASSIGNED: "verkefni",   // an assignment the teacher set (item 65)
});

/** The question types of one skill, including those that may ask about it
    among others (`anyOf`). */
export function typesOfSkill(id, TASKS) {
  return new Set(TASKS.filter((t) => t.skill === id || (t.anyOf || []).includes(id)).map((t) => t.id));
}

/**
 * The record of a session about to begin.
 *
 * `focus`: pattern ids, for a session aimed at them ("Villurnar mínar" with
 * none given aims at the three most active). `today`: the plan of today's
 * session (core/today.js `planToday`) when this is one — its reviews are the
 * opening and its slots what each question after them is about.
 * `opening(run)`: the due reviews an ordinary session opens with
 * (tasks/review.js `planOpening`), asked only when neither the plan nor
 * `opts.review` says otherwise.
 *
 * `opts`: `review: false` (no opening reviews), or a list of review keys to
 * open with exactly; `types` (with `skills`, `attrs`) narrows the session to
 * exactly those question types and `label` names it in the bar; `lesson` the
 * Lesefni page it came from; `assignment` the homework it answers (item 65);
 * `placement` the first run's placement round (item 84).
 *
 * @param {State} S
 * @param {string} topic @param {number} n @param {string[]|null} focus
 * @param {{review?: boolean|string[], types?: string[], skills?: string[], attrs?: any,
 *          label?: string, lesson?: string, assignment?: any, placement?: any}} opts
 * @param {{ n: number, reviews: string[], slots: any[] }|null} today
 * @param {(run: Run) => string[]} opening
 * @param {number} now
 * @returns {Run}
 */
export function newRun(S, topic, n, focus, opts, today, opening, now) {
  if (topic === TOPIC.MINE && !(focus && focus.length))
    focus = activePatterns(S, 3).map((p) => p.id);
  if (today) { n = today.n; focus = null; }
  /** @type {Run} */
  const run = {
    topic, n, focus: focus && focus.length ? focus : null,
    /* item 65: the assignment this session answers, with its scope. */
    assignment: opts.assignment || null,
    i: 0, c: 0, j: 0, xp0: S.xp, badges: [], items: [],
    chances: {}, misses: {}, found: [],
    before: activePatterns(S, 6).map((p) => p.id),
    startedAt: now,
    /* The review queue (core/review.js, tasks/review.js): `review` is the
       keys of the due entries this session opens with, `reask` the nouns of
       missed clozes waiting for their turn three to five questions on. */
    review: [], reask: [],
    /* item 21: the slots after the opening ({kind: "pattern", p} or
       {kind: "new", skill}), taken one per question; null outside today's
       session. item 36: the patterns offered "Þrjár í röð" in this session
       (once each), and how each run of three went. */
    plan: today ? today.slots.filter((x) => x.kind !== "review") : null,
    streaked: [], streaks: [],
    /* Item 41: a session on given question types, and its name. */
    types: opts.types || null, skills: opts.skills || null, attrs: opts.attrs || null,
    label: opts.label || null, lesson: opts.lesson || null,
    /* Item 84: the placement round of the first run (ui/tour.js). */
    placement: opts.placement || null,
  };
  if (today) run.review = today.reviews.slice();
  else if (Array.isArray(opts.review)) run.review = opts.review.slice();
  else if (opts.review !== false) run.review = opening(run);
  return run;
}

/**
 * The picker remembers the CATEGORY last chosen there, and its size; neither
 * today's session, an assignment, "Villurnar mínar" nor a Lesefni page's five
 * (item 41, `opts.types`) is one. Writes into `S.settings`.
 * @param {State} S @param {string} topic @param {number} n
 * @param {{types?: any, placement?: any}} opts
 */
export function notePick(S, topic, n, opts) {
  const picked = !opts.types && !opts.placement && topic !== TOPIC.TODAY && topic !== TOPIC.ASSIGNED;
  if (picked && topic !== TOPIC.MINE) S.settings.runTopic = topic;
  if (picked) S.settings.runSize = n;
}

/** The policy a session on these types runs under — the pupil's own
    switches give way, the administrator's ceiling does not (`runPolicy`).
    @param {State} S
    @param {{skills?: string[]|null, types: string[], attrs?: any}} on
    @returns {Policy} */
export function typesPolicy(S, { skills, types, attrs }) {
  const open = createPolicy(S.allowed || null,
    openFor(chosenPolicy(S), { skills: skills || [], types }));
  return narrowPolicy(open, { skills, types, attrs });
}

/** The curriculum policy, narrowed to what this session is about.
    @param {State} S @param {Run|null} r @returns {Policy} */
export function runPolicy(S, r) {
  /* item 65: an assignment's material, whatever the pupil has switched off
     (the teacher chose it), within the ceiling (core/assignment.js). */
  if (r && r.assignment) return narrowPolicy(assignmentPolicy(S, r.assignment.target),
    { types: r.focus ? [...focusTypes(r.focus)] : null });
  const P = effectivePolicy(S);
  if (!r) return P;
  /* Item 41: asked for by name, so the child's own switches give way for
     these types (core/policy.js openFor); the administrator's do not. */
  if (r.types) return typesPolicy(S, r);
  return narrowPolicy(P, {
    skills: SKILL_IDS.includes(r.topic) ? [r.topic] : null,
    types: r.focus ? [...focusTypes(r.focus)] : null,
  });
}

/**
 * The policy a review is asked under: the session's topic, but not the
 * narrowing to the question types of the patterns it is aimed at — a review
 * is asked in the type it was missed in.
 * @param {State} S @param {Run|null} r @returns {Policy}
 */
export function reviewPolicy(S, r) {
  return narrowPolicy(effectivePolicy(S), {
    skills: r && SKILL_IDS.includes(r.topic) ? [r.topic] : null, types: null,
  });
}

/** Can a session on this node of the skill map ask anything at all? No for a
    locked node, and for one the administrator's ceiling leaves nothing of.
    @param {State} S @param {string} id @param {TaskType[]} TASKS */
export function canPractiseNode(S, id, TASKS) {
  const s = nodeSession(nodeById(id), S);
  if (!s) return false;
  const skills = practiceSkills(s, TASKS);
  const P = typesPolicy(S, { skills, types: s.types, attrs: s.attrs });
  return TASKS.some((t) => s.types.includes(t.id) && P.type(t.id) &&
      (t.anyOf ? t.anyOf.some((x) => P.skill(x)) : P.skill(t.skill))) &&
    Object.entries(s.attrs || {}).every(([g, keys]) => keys.some((k) => P.attr(g, k)));
}

/** v6.11: what the session has had so far, per question type — the mix rule
    (core/mix.js) reads it. @param {Run} r @returns {Record<string, number>} */
export function mixCounts(r) {
  const counts = {};
  r.items.forEach((it) => { counts[it.type] = (counts[it.type] || 0) + 1; });
  return counts;
}

/**
 * One question of the session answered: counted, once. `correct` is the
 * verdict on the question as a whole (true, false, or null for one with no
 * right answer); `chances` the error patterns it tested and `findings` those
 * it found (core/diagnosis.js). A question outside the session's count — a
 * drill's, one of "Þrjár í röð", one already counted — changes nothing.
 * @param {Run|null} r @param {Task|null} cur @param {boolean|null} correct
 * @param {string[]} chances @param {{p: string, ex?: any}[]} findings
 * @returns {boolean} was it counted
 */
export function countAnswer(r, cur, correct, chances, findings) {
  if (!(r && cur && cur.inRun && !cur.closed)) return false;
  cur.closed = true;
  r.i++;
  if (correct === true) { r.c++; r.j++; }
  else if (correct === false) r.j++;
  chances.forEach((id) => { r.chances[id] = (r.chances[id] || 0) + 1; });
  findings.forEach((f) => {
    r.misses[f.p] = (r.misses[f.p] || 0) + 1;
    r.found.push({ p: f.p, ex: f.ex || null });
  });
  r.items.push({ type: cur.typeId || cur.type, skill: cur.skill, ok: correct ?? null });
  return true;
}

/**
 * Which question types this session could ask: a pattern none of them tests
 * is not "the one thing to remember" (v6.11). Null: any.
 * @param {Run} r @param {TaskType[]} TASKS @returns {Set<string>|null}
 */
export function topicTypesOf(r, TASKS) {
  return r.assignment
    ? (r.assignment.scope.types ? new Set(r.assignment.scope.types)
      : r.assignment.scope.skills ? new Set(r.assignment.scope.skills.flatMap((x) => [...typesOfSkill(x, TASKS)])) : null)
    : r.types ? new Set(r.types)
    : SKILL_IDS.includes(r.topic) ? typesOfSkill(r.topic, TASKS) : null;
}

/** The error-pattern report on a finished session (core/diagnosis.js
    `runReport`), held to what its topic could test.
    @param {Run} r @param {State} S @param {TaskType[]} TASKS */
export function reportOf(r, S, TASKS) {
  const topicTypes = topicTypesOf(r, TASKS);
  return runReport(r, S, topicTypes ? (p) => p.types.some((x) => topicTypes.has(x)) : null);
}

/**
 * Write a finished session into `S.runs` (the last forty are kept).
 * @param {State} S @param {Run} r @param {{found: {id: string}[]}} report
 * @param {string} day @param {number} now
 * @returns {number} the XP the session earned
 */
export function writeRun(S, r, report, day, now) {
  const xp = Math.max(0, S.xp - r.xp0);
  (S.runs ||= []).push({
    at: now, d: day, topic: r.topic, n: r.i, c: r.c, j: r.j, xp,
    top: report.found.slice(0, 3).map((f) => f.id),
  });
  S.runs = S.runs.slice(-40);
  return xp;
}

/**
 * The summary of a finished session (`app.runDone`), what ui/session.js
 * `renderSummary` draws. `early`: stopped before its last question.
 * @param {Run} r @param {any} report @param {number} xp
 * @param {boolean} early @param {number} now
 */
export function summaryOf(r, report, xp, early, now) {
  return {
    assignment: r.assignment ? { id: r.assignment.id, target: r.assignment.target, sent: null } : null,
    topic: r.topic, n: r.n, i: r.i, c: r.c, j: r.j, xp, focus: r.focus,
    badges: r.badges, items: r.items, report, early,
    ms: now - r.startedAt, streaks: r.streaks || [],
    /* Item 41: "Önnur lota" repeats a page's session as it was. */
    label: r.label, again: r.types
      ? { review: false, types: r.types, skills: r.skills, attrs: r.attrs, label: r.label, lesson: r.lesson }
      : null,
  };
}
