/* The placement round and the record of the guided first run (critique
   item 84, which replaces item 40).

   A new pupil used to land on the picker with every skill at level 1 and no
   word of explanation. The first run now does three things (ui/tour.js draws
   them): a welcome that asks which year the pupil is in, a short round of
   questions that finds where to begin, and four pointers at the parts of the
   screen. This file is the part of it that can be reasoned about and tested:
   which questions the round asks, how its level moves, what it writes into
   the saved levels, which year it suggests, and the small record that says
   the first run is over.

   ---- the round -------------------------------------------------------------

   Twelve to fifteen questions, one skill after another (`placementPlan`):
   every skill that can be graded once, in the order a pupil knows them, and
   then the three inflection skills — nouns, verbs, adjectives — a second
   time. With the ten categories of year 8 that is twelve questions; with the
   two of year 10 fourteen.

   ONE level runs through the whole round, not one per skill: with one or two
   questions in a skill there is nothing a staircase of its own could settle
   on. What a pupil can do in grammar hangs together well enough for one
   number to say where to begin, and the skill's own answers then move it a
   little (`placementResult`).

   The staircase (`placementAnswer`):
     * until the first wrong answer, a right answer raises the level a whole
       step (FAST): a strong pupil is at the top in five questions and is not
       kept at questions that say nothing about them;
     * from the first wrong answer on, a right answer raises it half a step
       (UP) and a wrong one lowers it a whole step (DOWN).
   Unequal steps are what choose the balance point: the level stops drifting
   where UP·p = DOWN·(1−p), which is two answers in three right. Equal steps
   would settle where every other answer is wrong — a discouraging place to
   start, and far above where the ordinary rule (core/difficulty.js: about
   four in five right) would then pull the pupil back down from.

   ---- what it writes ----------------------------------------------------------

   `placementResult` reads the general level G off the second half of the
   round (the mean of the levels asked there, rounded DOWN to a half step: a
   start that is a little too easy costs a day, one that is too hard costs the
   pupil's wish to come back). Then, per skill asked:
     * a wrong answer at or near G (no more than a step above it) takes a
       whole step off — this is something the pupil finds harder than the rest;
     * a wrong answer far above G says nothing: the staircase was still
       climbing;
     * a skill answered right every time gets half a step on.
   The result is held inside the skill's own range (`ranges`, from
   core/difficulty.js `levelRanges`). A skill that is switched on but could
   not be asked (Orðaforði is not graded) starts half a step under G.
   `applyPlacement` writes each through `setSkillLevel(…, {source:
   "placement"})` and nothing else: it is the one way in.

   Fewer than MIN_ANSWERS answers (the pupil left the round) place nothing.

   ---- the year ----------------------------------------------------------------

   `suggestYear`: the app's levels 1–5 are year 8, 6 is year 9 and 7 is year
   10 (core/curriculum.js). A pupil whose general level reaches the top of a
   year's range is offered the next year's material. A pupil who SAID which
   year they are in is never offered a lower one — the year is what their
   class is doing, and the levels inside it already start low — and at most
   one year higher. It is a suggestion: the pupil chooses (ui/tour.js).

   ---- the record ----------------------------------------------------------------

     S.tour = null | { st, at, d, placed, year }
       st      "open"     the first run has begun and is not over (a reload
                          offers it again from the start)
               "done"     it was finished
               "skipped"  it was left with "Sleppa"
       at      when that was (ms); d  the day
       placed  1 if a placement round set the levels
       year    the year preset chosen in it (8, 9 or 10), or null
   null is a pupil who has never met it: a NEW pupil (no answers at all) is
   offered it once; one with progress from before it existed is not, and can
   start it from Stillingar. Done or skipped, it is never offered again.

   Pure: no DOM, no clock (the caller passes `now` and `day`), no random
   numbers. core/ does not import tasks/: the catalogue is passed in.          */

import { SKILL_IDS } from "./skills.js";
import { MIN, MAX, clamp, setSkillLevel } from "./difficulty.js";
import { YEARS } from "./curriculum.js";

/* ---------- the plan ---------------------------------------------------------- */

/** The round is never shorter or longer than this. */
export const MIN_QUESTIONS = 12, MAX_QUESTIONS = 15;
/** Below this many answers a round that was left places nothing. */
export const MIN_ANSWERS = 6;

/* The order the skills are asked in: what a pupil has known longest first, so
   the round opens with something familiar, and the two production skills of
   later years last. */
export const PLACEMENT_ORDER = [
  "nafnord", "sagnord", "lysingarord", "greining", "fornofn", "fallstjorn",
  "toluord", "obeygjanleg", "malbeiting", "setningafraedi", "setningagerd",
];
/** The skills asked a second time: where most of the practice will be. */
export const PLACEMENT_TWICE = ["nafnord", "sagnord", "lysingarord"];

/* Shapes of question the round leaves out: a whole table is six answers and
   two minutes, an error hunt is a text to read, and an explanation in the
   pupil's own words has no right answer to learn from. */
export const PLACEMENT_SKIP = new Set(["table", "villur", "meaning"]);

/**
 * The question types the round may ask, per skill: { skill: [typeId …] }.
 * A type that serves several skills (`anyOf`) is left out — its questions
 * would be counted for a skill that was not the one asked.
 *
 * @param {object[]} types  tasks/registry.js TASKS: { id, skill, renderer, anyOf? }
 * @param {object} P        the effective policy (core/policy.js createPolicy)
 */
export function placementTypes(types, P) {
  const out = {};
  for (const t of types || []) {
    if (t.anyOf || PLACEMENT_SKIP.has(t.renderer)) continue;
    if (!P.skill(t.skill) || !P.type(t.id)) continue;
    (out[t.skill] ||= []).push(t.id);
  }
  return out;
}

/**
 * The skills of the round, one per question, in order.
 * @param {string[]} skills  the skills that can be asked (any order)
 * @returns {string[]} twelve to fifteen skill ids, or [] when none can be asked
 */
export function placementPlan(skills) {
  const can = new Set(skills || []);
  const once = PLACEMENT_ORDER.filter((id) => can.has(id));
  if (!once.length) return [];
  const twice = PLACEMENT_TWICE.filter((id) => can.has(id));
  const plan = [...once, ...twice];
  /* A narrow curriculum (an administrator who allows three categories): go
     round again until the round is long enough to say something. */
  for (let k = 0; plan.length < MIN_QUESTIONS; k++) plan.push(once[k % once.length]);
  return plan.slice(0, MAX_QUESTIONS);
}

/* ---------- the staircase ------------------------------------------------------- */

/** The steps: up before the first miss, up after it, and down. */
export const FAST = 1, UP = 0.5, DOWN = 1;
/** Where the round begins, by the year the pupil said (null: did not say). */
export const START = { 8: 2, 9: 2.5, 10: 3 };
export const START_UNKNOWN = 2;

const half = (x) => Math.round(x * 2) / 2;
const floorHalf = (x) => Math.floor(x * 2 + 1e-9) / 2;
const isObj = (x) => x && typeof x === "object" && !Array.isArray(x);

/**
 * A round, about to begin.
 *
 * @param {object} o
 * @param {string[]} o.skills   the skills that can be asked
 * @param {object} [o.ranges]   { skill: [lo, hi] } (core/difficulty.js levelRanges)
 * @param {?number} [o.year]    the year the pupil chose, or null
 * @returns {{plan, i, level, fast, hist, ranges, lo, hi, year}}
 */
export function startPlacement({ skills, ranges = null, year = null } = {}) {
  const plan = placementPlan(skills);
  const R = {};
  plan.forEach((id) => {
    const r = ranges && Array.isArray(ranges[id]) ? ranges[id] : [MIN, MAX];
    R[id] = [clamp(r[0]), clamp(Math.max(r[0], r[1]))];
  });
  /* The one level moves between the lowest floor and the highest ceiling of
     the skills asked; each question is then held to its own skill's range. */
  const ids = Object.keys(R);
  const lo = ids.length ? Math.min(...ids.map((id) => R[id][0])) : MIN;
  const hi = ids.length ? Math.max(...ids.map((id) => R[id][1])) : MAX;
  const start = START[year] ?? START_UNKNOWN;
  return { plan, i: 0, level: clamp(start, lo, hi), fast: true, hist: [], ranges: R, lo, hi, year: YEARS.includes(year) ? year : null };
}

/** Is the round over? */
export const placementDone = (st) => !st || st.i >= st.plan.length;

/**
 * The next question to ask: its skill, and the level to ask it at — the
 * round's level, held to what that skill knows.
 * @returns {{skill: string, level: number, n: number, of: number} | null}
 */
export function placementQuestion(st) {
  if (placementDone(st)) return null;
  const skill = st.plan[st.i];
  const [lo, hi] = st.ranges[skill] || [MIN, MAX];
  return { skill, level: clamp(st.level, lo, hi), n: st.i + 1, of: st.plan.length };
}

/**
 * One answer. Returns a NEW state; the old one stands.
 * `ok` that is not true or false (a question nobody could grade) is passed
 * over: the question is dropped from the plan and the level does not move.
 */
export function placementAnswer(st, ok) {
  const q = placementQuestion(st);
  if (!q) return st;
  if (typeof ok !== "boolean") return placementDrop(st);
  let level = st.level, fast = st.fast;
  if (ok) level += fast ? FAST : UP;
  else { level -= DOWN; fast = false; }
  return {
    ...st, i: st.i + 1, fast,
    level: half(clamp(level, st.lo, st.hi)),
    hist: [...st.hist, { skill: q.skill, level: q.level, ok }],
  };
}

/** The current question cannot be built: take it out of the plan. */
export function placementDrop(st) {
  if (placementDone(st)) return st;
  const plan = st.plan.slice();
  plan.splice(st.i, 1);
  return { ...st, plan };
}

/* ---------- the result ---------------------------------------------------------- */

/** How far above G a wrong answer still counts against its skill. */
export const NEAR = 1;
/** What a skill's own answers may move it by, from G. */
export const SKILL_DOWN = 1, SKILL_UP = 0.5, SKILL_FLOOR = -1.5;
/** A switched-on skill that was not asked starts this far under G. */
export const UNASKED = 0.5;

/**
 * What the round found.
 *
 * @param {object} st             the round's state (finished or left)
 * @param {object} [o]
 * @param {string[]} [o.others]   switched-on skills the round could not ask
 * @param {object} [o.ranges]     ranges for `others` ({ skill: [lo, hi] })
 * @returns {{ placed: boolean, answers: number, right: number, general: number|null,
 *            levels: { [skill]: { level:number, history:string, asked:boolean } } }}
 */
export function placementResult(st, { others = [], ranges = null } = {}) {
  const hist = (st && st.hist) || [];
  const right = hist.filter((h) => h.ok).length;
  const out = { placed: false, answers: hist.length, right, general: null, levels: {} };
  if (hist.length < MIN_ANSWERS) return out;

  /* The second half of what was answered: by then the staircase has stopped
     climbing and is moving around the pupil's level. */
  const tail = hist.slice(Math.floor(hist.length / 2));
  const G = floorHalf(tail.reduce((a, h) => a + h.level, 0) / tail.length);
  out.placed = true;
  out.general = G;

  const bySkill = {};
  hist.forEach((h) => (bySkill[h.skill] ||= []).push(h));
  for (const [skill, list] of Object.entries(bySkill)) {
    let adj = 0;
    if (list.every((h) => h.ok)) adj = SKILL_UP;
    else list.forEach((h) => { if (!h.ok && h.level <= G + NEAR) adj -= SKILL_DOWN; });
    adj = Math.max(SKILL_FLOOR, adj);
    const [lo, hi] = (st.ranges && st.ranges[skill]) || [MIN, MAX];
    out.levels[skill] = {
      level: half(clamp(G + adj, lo, hi)),
      history: list.map((h) => (h.ok ? "1" : "0")).join(""),
      asked: true,
    };
  }
  for (const skill of others || []) {
    if (out.levels[skill] || !SKILL_IDS.includes(skill)) continue;
    const r = ranges && Array.isArray(ranges[skill]) ? ranges[skill] : [MIN, MAX];
    out.levels[skill] = { level: half(clamp(G - UNASKED, r[0], Math.max(r[0], r[1]))), history: "", asked: false };
  }
  return out;
}

/**
 * Write the result into the saved levels — through `setSkillLevel` with the
 * source "placement", and nothing else. With the live session passed, the
 * levels take effect at once.
 * @returns {string[]} the skills written
 */
export function applyPlacement(S, result, { sess = null, now = Date.now() } = {}) {
  if (!result || !result.placed) return [];
  const done = [];
  for (const [skill, v] of Object.entries(result.levels)) {
    if (!SKILL_IDS.includes(skill)) continue;
    setSkillLevel(S, skill, v.level, { source: "placement", sess, now, history: v.history });
    done.push(skill);
  }
  return done;
}

/* ---------- the year ------------------------------------------------------------ */

/** The general level from which the next year's material is offered: the
    top of year 8's range is 5 and of year 9's is 6 (core/curriculum.js). */
export const YEAR_FROM = { 9: 4.5, 10: 6 };

/** The year whose range a general level sits in. */
export function yearOfLevel(general) {
  if (typeof general !== "number" || !Number.isFinite(general)) return 8;
  return general >= YEAR_FROM[10] ? 10 : general >= YEAR_FROM[9] ? 9 : 8;
}

/**
 * The year preset to suggest.
 *
 * @param {object} result          `placementResult`
 * @param {object} [o]
 * @param {?number} [o.chosen]     the year the pupil said, or null
 * @param {?number} [o.cap]        the highest year the administrator allows, or null
 * @returns {?number} 8, 9 or 10 — or null when there is nothing to go on
 *                    (no placement and no year said)
 */
export function suggestYear(result, { chosen = null, cap = null } = {}) {
  const said = YEARS.includes(chosen) ? chosen : null;
  const top = YEARS.includes(cap) ? cap : YEARS[YEARS.length - 1];
  if (!result || !result.placed) return said ? Math.min(said, top) : null;
  const fit = yearOfLevel(result.general);
  /* Never below the year the pupil is in, and one year above it at most. */
  const year = said ? Math.max(said, Math.min(fit, said + 1)) : fit;
  return Math.min(year, top);
}

/* ---------- the record of the first run ---------------------------------------- */

export const TOUR_STATES = ["open", "done", "skipped"];
/** The pointers, in order (ui/tour.js says what each points at). */
export const TOUR_STEPS = ["today", "lessons", "map", "line"];

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** `S.tour` as it may be trusted: one of three states, a time, a day, a flag
    and a year. Used by `migrate` (core/state.js) and the server's guard. */
export function cleanTour(raw) {
  if (!isObj(raw) || !TOUR_STATES.includes(raw.st)) return null;
  return {
    st: raw.st,
    at: typeof raw.at === "number" && Number.isFinite(raw.at) ? Math.min(Math.max(0, Math.round(raw.at)), 1e13) : 0,
    d: typeof raw.d === "string" && DAY.test(raw.d) ? raw.d : null,
    placed: raw.placed ? 1 : 0,
    year: YEARS.includes(raw.year) ? raw.year : null,
  };
}

/* An ended first run outranks one that is only open, whatever the clocks of
   the two devices say: a pupil who finished it on the phone is not walked
   through it again on the laptop. */
const RANK = { open: 1, skipped: 2, done: 2 };

/** Two devices (core/merge.js): the one that got further; of two that ended
    it, the one that ended it last; and a placement made on either is kept. */
export function mergeTour(local, remote) {
  const l = cleanTour(local), r = cleanTour(remote);
  if (!l || !r) return l || r;
  const w = RANK[l.st] !== RANK[r.st] ? (RANK[l.st] > RANK[r.st] ? l : r) : (r.at > l.at ? r : l);
  return { ...w, placed: l.placed || r.placed ? 1 : 0, year: w.year ?? l.year ?? r.year ?? null };
}

/** Has this pupil never answered anything? */
export function isNewPupil(S) {
  if (!S) return true;
  return !(S.totalAnswers > 0) && !(S.xp > 0) && !((S.runs || []).length) &&
    !Object.values(S.days || {}).some((d) => d && d.a > 0);
}

/**
 * Should the first run open by itself? Once for a new pupil, again after a
 * reload while it is still open — and never for anybody else: not for a
 * pupil with progress from before it existed, not once it is done or
 * skipped, and not for a teacher or an administrator (`role`: the server's
 * role, or null when there is no server).
 */
export function shouldOfferTour(S, { role = null } = {}) {
  if (role && role !== "learner") return false;
  const t = cleanTour(S && S.tour);
  if (t) return t.st === "open";
  return isNewPupil(S);
}

/** Write the record. `how`: "open", "done" or "skipped". An ended first run
    stays ended: opening it again from Stillingar does not un-end it. */
export function noteTour(S, how, { now = Date.now(), day = null, placed = null, year = undefined } = {}) {
  if (!TOUR_STATES.includes(how)) throw new Error("Óþekkt staða kynningar: " + how);
  const old = cleanTour(S.tour);
  if (how === "open" && old && old.st !== "open") return old;
  S.tour = {
    st: how, at: Math.round(now), d: day && DAY.test(day) ? day : (old ? old.d : null),
    placed: (placed ?? (old ? old.placed : 0)) ? 1 : 0,
    year: year === undefined ? (old ? old.year : null) : (YEARS.includes(year) ? year : null),
  };
  return S.tour;
}
