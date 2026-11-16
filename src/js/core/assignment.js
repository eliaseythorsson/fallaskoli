/* Assignments (critique item 65): homework a teacher sets for a group.

   The teacher picks WHAT (a category, an error pattern, a node of the
   curriculum map or a whole year), HOW MANY questions and BY WHEN. The pupils
   of the group see it at the top of Æfa and start it with one tap; the
   session is narrowed to that material. The teacher sees who finished, their
   scores, and the class's error patterns on that material (core/classview.js).

   This module is the rules, shared by the server (which stores and checks)
   and the browser (which draws and runs): what a target may be, what it is
   called, which question types and patterns it covers, the limits, the
   deadline, and which of a pupil's attempts counts.

   What is stored per pupil is four numbers and two flags: questions answered,
   questions graded, how many were right, when, whether the whole assignment
   was done, and how many tries. Nothing the pupil typed.

   A pupil with no server (opened from a file, or from a plain web host) has no
   teacher and gets no assignments; nothing here is used then.

   Pure: no DOM; pure apart from the default clock arguments (`now =
   Date.now()`), which every caller that cares passes in, as difficulty.js does. */

import { SKILL_IDS, skillName } from "./skills.js";
import { PATTERNS, patternById, focusTypes } from "./diagnosis.js";
import { NODES, nodeById, nodeHasQuestions, presetContent, YEARS } from "./curriculum.js";
import { createPolicy, narrowPolicy } from "./policy.js";
import { chosenPolicy } from "./state.js";
import { utcDay as dayOf } from "./calendar.js";

/* ---------- limits ---------------------------------------------------------

   sizes     what a teacher may ask for. 5 is a warm-up; 30 a long homework.
   maxDays   how far ahead a deadline may lie: one term's half.
   maxOpen   open assignments per group at once. More is a to-do list, not
             homework, and the top of Æfa would be nothing but cards.
   keepDays  how long an assignment and its results are kept after the
             deadline, so the teacher can still look. Then it is erased.
   noteMax   the teacher's short note ("Fyrir þriðjudag").
   maxTries  results one pupil may send for one assignment. A pupil may do it
             again to do better; this only stops a loop from filling the file. */
export const ASSIGN = {
  sizes: [5, 10, 15, 20, 30],
  maxDays: 60,
  maxOpen: 12,
  keepDays: 30,
  noteMax: 80,
  maxTries: 50,
};

export const KINDS = ["skill", "pattern", "node", "year"];

/* ---------- targets ------------------------------------------------------- */

/* Patterns no question can be aimed at, at any level: a session "on" one
   would be a session of its question types that never tests it. Measured by
   tests/assignment.test.js, which fails the day the diagnosis learns to aim
   at one, so it can come back. (Many patterns are aimed at only from a
   certain level up — *hvor* from the error-hunt bank at þyngd 5, say. A
   pupil below it gets the pattern's own question types, as in "Villurnar
   mínar"; the teacher can set a node or a category instead.) */
export const NOT_AIMABLE = ["kyn"];

/** The patterns a teacher may set: every real one ("Ógreint" is a count)
    that a question can be aimed at. */
export const ASSIGNABLE_PATTERNS = PATTERNS.filter((p) => !p.meta && p.types.length &&
  !NOT_AIMABLE.includes(p.id));
/** The nodes: those with questions (a locked node has nothing to ask). */
export const ASSIGNABLE_NODES = NODES.filter(nodeHasQuestions);

/** Is `t` a target the program knows? */
export function validTarget(t) {
  if (!t || typeof t !== "object" || !KINDS.includes(t.kind)) return false;
  const id = t.id;
  switch (t.kind) {
    case "skill": return SKILL_IDS.includes(id);
    case "pattern": return ASSIGNABLE_PATTERNS.some((p) => p.id === id);
    case "node": return nodeHasQuestions(nodeById(id));
    case "year": return YEARS.includes(Number(id));
    default: return false;
  }
}

/** A clean copy of a target, or null: only the two fields, `id` a string. */
export function cleanTarget(t) {
  if (!t || typeof t !== "object") return null;
  const out = { kind: String(t.kind || ""), id: String(t.id ?? "") };
  return validTarget(out) ? out : null;
}

/** What the target is called, as the pupil and the teacher read it. */
export function targetName(t) {
  if (!t) return "";
  switch (t.kind) {
    case "skill": return skillName(t.id);
    case "pattern": return (patternById(t.id) || {}).nm || t.id;
    case "node": return (nodeById(t.id) || {}).nm || t.id;
    /* "Efni 8. bekkjar": bekkur, eignarfall bekkjar. */
    case "year": return `Efni ${Number(t.id)}. bekkjar`;
    default: return "";
  }
}

/** The word in front of the name, saying what kind of target it is. */
export const KIND_NAME = { skill: "Flokkur", pattern: "Villumynstur", node: "Námskrá", year: "Bekkur" };

/**
 * What a session on this target is narrowed to (core/run.js `runPolicy`):
 *   skills  categories, or null for any
 *   types   question types, or null for any of the categories'
 *   focus   error patterns the questions are aimed at (as in "Villurnar mínar")
 */
export function scopeOf(t) {
  if (!validTarget(t)) return null;
  switch (t.kind) {
    case "skill": return { skills: [t.id], types: null, focus: null };
    case "pattern": return { skills: null, types: [...focusTypes([t.id])], focus: [t.id] };
    /* A node's types may belong to another category (kyn og tala is asked
       inside the word-class analysis), so only the types narrow it. */
    case "node": return { skills: null, types: nodeById(t.id).types.slice(), focus: null };
    case "year": {
      const c = presetContent(Number(t.id));
      return { skills: c.skills.slice(), types: c.types.slice(), focus: null };
    }
    default: return null;
  }
}

/**
 * The patterns this material tests: the columns of the teacher's table under
 * an assignment. A pattern target is just itself; otherwise every real
 * pattern whose question types the material can ask.
 *
 * `typesOfSkill(id)` → the question types of a category. The registry lives
 * in tasks/, which core/ does not import, so the caller passes it in; without
 * it a category target falls back to the patterns' own types.
 */
export function patternsOf(t, typesOfSkill = null) {
  const sc = scopeOf(t);
  if (!sc) return [];
  if (t.kind === "pattern") return [t.id];
  let types = sc.types ? new Set(sc.types) : null;
  if (!types && typesOfSkill) types = new Set(sc.skills.flatMap((s) => [...typesOfSkill(s)]));
  if (!types) return [];
  return ASSIGNABLE_PATTERNS.filter((p) => p.types.some((x) => types.has(x))).map((p) => p.id);
}

/**
 * The curriculum policy of an assignment session. The TEACHER chose the
 * material, so the pupil's own on/off switches for categories and question
 * types do not shut it out — a pupil on 8. bekkur can be set a year-9 node.
 * The ceiling the administrator or the guardian set (`S.allowed`) still
 * holds, and so do the pupil's levels and inflection features.
 */
export function assignmentPolicy(S, t) {
  const sc = scopeOf(t);
  const chosen = { ...chosenPolicy(S), skills: {}, types: {} };
  const P = createPolicy(S.allowed || null, chosen);
  return sc ? narrowPolicy(P, { skills: sc.skills, types: sc.types }) : P;
}

/* ---------- the deadline -------------------------------------------------- */

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The moment a deadline passes: the end of that day. Iceland keeps UTC all
    year, so the end of the day in UTC is the end of the day in Iceland. */
export const dueEnd = (due) => Date.parse(due + "T23:59:59.999Z");

/** A deadline the server will take: a real date, today or later, at most
    `maxDays` ahead. Returns a problem in Icelandic, or null. */
export function dueProblem(due, now = Date.now()) {
  if (typeof due !== "string" || !DAY.test(due) || Number.isNaN(dueEnd(due)) || dayOf(dueEnd(due)) !== due)
    return "Veldu skiladag.";
  if (due < dayOf(now)) return "Skiladagurinn er liðinn.";
  if (due > dayOf(now + ASSIGN.maxDays * 86400000))
    return `Skiladagur má vera í mesta lagi ${ASSIGN.maxDays} daga fram í tímann.`;
  return null;
}

export const isOpen = (a, now = Date.now()) => now <= dueEnd(a.due);

/** Assignments to keep: open ones, and closed ones for `keepDays` after. */
export const prune = (list, now = Date.now()) =>
  (list || []).filter((a) => now <= dueEnd(a.due) + ASSIGN.keepDays * 86400000);

export const openCount = (list, group, now = Date.now()) =>
  (list || []).filter((a) => a.group === group && isOpen(a, now)).length;

/* The day as a time, so in the accusative with the article: "skil
   fimmtudaginn 19. nóvember". The forms are BÍN's (ÞFETgr of each weekday). */
const WEEKDAYS = ["sunnudaginn", "mánudaginn", "þriðjudaginn", "miðvikudaginn", "fimmtudaginn",
  "föstudaginn", "laugardaginn"];
const MONTHS = ["janúar", "febrúar", "mars", "apríl", "maí", "júní", "júlí", "ágúst",
  "september", "október", "nóvember", "desember"];

/** After "skil": "í dag", "á morgun", or "fimmtudaginn 19. nóvember". */
export function dueText(due, now = Date.now()) {
  const today = dayOf(now), tomorrow = dayOf(now + 86400000);
  if (due === today) return "í dag";
  if (due === tomorrow) return "á morgun";
  const d = new Date(due + "T12:00:00Z");
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()}. ${MONTHS[d.getUTCMonth()]}`;
}

/* ---------- results ------------------------------------------------------- */

/**
 * A result as the server takes it: `i` questions answered, `j` of them
 * graded, `c` right; 0 ≤ c ≤ j ≤ i ≤ n. Returns the clean record or null.
 */
export function cleanResult(body, n) {
  const i = body && body.i, j = body && body.j, c = body && body.c;
  const int = (x) => typeof x === "number" && Number.isInteger(x) && x >= 0;
  if (!int(i) || !int(j) || !int(c) || c > j || j > i || i > n || i < 1) return null;
  return { i, j, c };
}

/** Share right, for comparing two attempts; an ungraded one counts as done. */
const share = (r) => (r.j ? r.c / r.j : r.i ? 1 : 0);

/**
 * Which attempt counts. Once the pupil has done the whole assignment, a
 * later complete attempt replaces it only if it went better — doing it again
 * to do better is encouraged, and can never make the record worse. Before
 * that, the latest attempt is shown (how far they got).
 */
export function better(prev, next) {
  if (!prev) return next;
  if (!prev.done) return next.done || next.i >= prev.i ? next : prev;
  if (!next.done) return prev;
  return share(next) > share(prev) ? next : prev;
}

/** The record of one more attempt, from the previous record. */
export function recordResult(prev, r, n, now = Date.now()) {
  const next = { ...r, done: r.i >= n, at: now };
  const kept = better(prev, next);
  return { ...kept, tries: ((prev && prev.tries) || 0) + 1 };
}

/** What a pupil is told about an assignment. */
export function viewForPupil(a, uid, now = Date.now()) {
  const mine = (a.res || {})[uid] || null;
  return {
    id: a.id, target: a.target, n: a.n, due: a.due, note: a.note || "",
    created: a.created, open: isOpen(a, now),
    mine: mine ? { i: mine.i, j: mine.j, c: mine.c, done: !!mine.done, at: mine.at } : null,
  };
}
