/* A goal the class reaches together (v6.13, critique item 59).
 *
 * Every social feature until now ranked pupils against each other, and a
 * pupil near the bottom has every reason to stay off a board. This is the
 * one thing on the server where nobody is ranked: the group's teacher sets a
 * weekly target, the whole group fills ONE bar, and when it is full every
 * learner in the group gets the same badge (core/badges.js "soc_classgoal"),
 * whatever each of them put in.
 *
 * Two kinds, the two the critique names:
 *
 *   rett    "2.000 rétt svör saman" — the right answers of the whole group
 *           this week (Monday to Sunday), added up from the day records.
 *   lotur   "Allir ljúka þremur lotum" — every learner in the group finishes
 *           n sessions this week. A session counts when at least LOTA_MIN
 *           questions of it were answered (the shortest session a pupil can
 *           pick, ui/session.js RUN_SIZES), so stopping after two questions
 *           is not a session finished.
 *
 * WHAT ANYBODY SEES is the total and nothing else: for `rett` the sum, for
 * `lotur` how many learners have got there and how many there are. Never who.
 * A total of a very small group says too much about each child in it, so a
 * goal needs at least CLASS_GOAL.minPupils learners, and below that nothing
 * is shown.
 * docs/PRIVACY.md §1c says this, and why it counts learners who are not on the
 * board (the point is that the ones who stay off it are in it too).
 *
 * WHERE IT IS KEPT: on the group's record in groups.json, as a short list of
 * goals with the Monday from which each applies, newest last
 * (`{ kind, n, from }`, kind "off" when the teacher removed it). A goal holds
 * every week until it is changed, so the teacher sets it once; last week's
 * goal is still known after a change this week, so last week's badge can
 * still be given to a pupil who opens the program on Monday.
 *
 * Pure: no DOM, no clock — the week is passed in. The server
 * (server/classgoal.mjs) and the browser (ui/classgoal.js, ui/teacher.js)
 * both use it.
 */

import { addDays } from "./review.js";

export const CLASS_GOAL = {
  kinds: ["rett", "lotur"],
  /* What a teacher can choose. Right answers: a class of 20 doing two
     ten-question sessions a week at 80% reaches about 320; 2.000 is a class
     that practises most days. Sessions: one to five each. */
  sizes: { rett: [200, 500, 1000, 2000, 3000, 5000], lotur: [1, 2, 3, 4, 5] },
  /* Fewer learners than this and a total says too much about somebody:
     with three, "2 af 3" tells a pupil who did not get there that both the
     others did. Five, the program's figure for "nobody else here"
     (core/social.js MIN_UNIQUE); a real class has far more. */
  minPupils: 5,
  /* Questions answered for a session to count as finished. */
  lotaMin: 10,
  /* Goals kept on a group's record: the one in force and the ones before. */
  keep: 3,
};

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const isObj = (x) => !!x && typeof x === "object" && !Array.isArray(x);

/** A goal as a teacher sent it, or null if it is not one we offer. */
export function cleanGoal(raw) {
  if (!isObj(raw)) return null;
  const kind = String(raw.kind || "");
  const n = Number(raw.n);
  if (!CLASS_GOAL.kinds.includes(kind) || !CLASS_GOAL.sizes[kind].includes(n)) return null;
  return { kind, n };
}

/** The saved list, rebuilt field by field: known kinds, real Mondays-or-days. */
export function cleanGoals(list) {
  return (Array.isArray(list) ? list : [])
    .filter((g) => isObj(g) && DAY_RE.test(String(g.from)))
    .map((g) => (g.kind === "off" ? { kind: "off", from: g.from } : { ...cleanGoal(g), from: g.from }))
    .filter((g) => g.kind)
    .sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0))
    .slice(-CLASS_GOAL.keep);
}

/**
 * The list after the teacher sets (`goal`) or removes (`null`) the goal from
 * the week beginning `monday`. A second change in the same week replaces the
 * first, so a slip of the finger is not last week's goal.
 */
export function withGoal(list, goal, monday) {
  const rest = cleanGoals(list).filter((g) => g.from !== monday);
  const entry = goal ? { ...goal, from: monday } : { kind: "off", from: monday };
  return cleanGoals([...rest, entry]);
}

/** The goal in force in the week beginning `monday`, or null. */
export function goalFor(list, monday) {
  let cur = null;
  for (const g of cleanGoals(list)) if (g.from <= monday) cur = g;
  return cur && cur.kind !== "off" ? { kind: cur.kind, n: cur.n } : null;
}

/* ---------- what one state puts in ------------------------------------- */

const weekDays = (monday) => Array.from({ length: 7 }, (_, i) => addDays(monday, i));

/** Right answers in the week beginning `monday`, from the day records. */
export function weekCorrect(S, monday) {
  const days = (S && S.days) || {};
  return weekDays(monday).reduce((a, k) => a + Math.max(0, Number(days[k] && days[k].c) || 0), 0);
}

/** Sessions of LOTA_MIN or more questions finished in that week (S.runs). */
export function weekSessions(S, monday) {
  const days = new Set(weekDays(monday));
  return ((S && S.runs) || []).filter((r) =>
    r && days.has(r.d) && (Number(r.n) || 0) >= CLASS_GOAL.lotaMin).length;
}

/**
 * The group's progress on `goal` in the week beginning `monday`, from the
 * states of its learners (an account that has never practised is `null` and
 * puts in nothing). Totals only.
 *
 * @returns {null | {kind, n, done, target, met, small}}
 *   rett:  done = right answers, target = n
 *   lotur: done = learners who have finished n sessions, target = learners
 *   small: too few learners to show anything; done and target are then 0
 */
export function progressOf(goal, states, monday) {
  if (!goal) return null;
  const list = states || [];
  if (list.length < CLASS_GOAL.minPupils) {
    return { kind: goal.kind, n: goal.n, done: 0, target: 0, met: false, small: true };
  }
  let done, target;
  if (goal.kind === "rett") {
    done = list.reduce((a, S) => a + weekCorrect(S, monday), 0);
    target = goal.n;
  } else {
    done = list.filter((S) => weekSessions(S, monday) >= goal.n).length;
    target = list.length;
  }
  return { kind: goal.kind, n: goal.n, done, target, met: done >= target, small: false };
}

/* ---------- words ----------------------------------------------------------
 * Every form checked against BÍN: lota (kvk) ÞGF ET "lotu", ÞGF FT "lotum";
 * einn KVK-ÞGFET "einni"; tveir/þrír/fjórir ÞGF "tveimur", "þremur",
 * "fjórum". `ljúka` takes the dative. */

const LOTUR = { 1: "einni lotu", 2: "tveimur lotum", 3: "þremur lotum", 4: "fjórum lotum", 5: "fimm lotum" };
const num = (n) => Number(n).toLocaleString("is-IS");

/** "2.000 rétt svör saman" / "Allir ljúka þremur lotum". */
export function goalText(goal) {
  if (!goal) return "";
  return goal.kind === "rett" ? `${num(goal.n)} rétt svör saman` : `Allir ljúka ${LOTUR[goal.n]}`;
}

/** The line under the bar. Built so that no word has to agree with the number. */
export function progressText(p) {
  if (!p || p.small) return "";
  return p.kind === "rett"
    ? `Rétt svör hópsins í vikunni: ${num(p.done)} af ${num(p.target)}.`
    : `Nemendur sem hafa lokið ${LOTUR[p.n]} í vikunni: ${num(p.done)} af ${num(p.target)}.`;
}

/** How full the bar is, 0–100. */
export const percentOf = (p) =>
  (!p || p.small || !p.target ? 0 : Math.max(0, Math.min(100, Math.round((100 * p.done) / p.target))));

/** Every option a teacher has, for a select: [value, label]. */
export const GOAL_OPTIONS = CLASS_GOAL.kinds.flatMap((kind) =>
  CLASS_GOAL.sizes[kind].map((n) => [`${kind}:${n}`, goalText({ kind, n })]));

/**
 * The week whose badge this pupil is owed, or null (core/badges.js
 * "soc_classgoal", `period: "goalweek"`). This week if the bar is full;
 * otherwise last week's, if that one was met — so a pupil who was away when
 * the class got there has it when they come back on Monday.
 */
export function goalWeekOf(status) {
  if (!status || !status.member) return null;
  if (status.progress && status.progress.met && DAY_RE.test(String(status.week))) return status.week;
  if (status.last && status.last.met && DAY_RE.test(String(status.last.week))) return status.last.week;
  return null;
}
