/* A live class round (critique item 64): the rules, shared by the server
   (server/live.mjs, which runs the round) and the browser (ui/live.js, which
   draws it).

   The teacher starts a round of ten questions on the projector — a category,
   a node of the curriculum map or a whole year, and a time per question. The
   pupils of the group join from their own devices and answer against one
   clock; after each question the board shows how many got it right, and the
   round ends on the class's commonest error pattern with its rule.

   EVERY PUPIL GETS THE SAME QUESTIONS. A live round is the one place where
   identical questions are right (item 63 says so): everybody answers at the
   same moment, in the same room, with the teacher watching, and the board
   after each question is about one question the class can talk about. The
   questions are a duel's PLAN (core/duel.js `duelPlan`): the same builders,
   the same blank pupil, the same filtered vocabulary — and each question is
   sent to the pupils only when it opens, so nobody holds the next one.

   CORRECTNESS IS THE SCORE. A right answer is worth `LIVE.point`; speed adds
   a little, and so little that it can never be worth one right answer over
   the whole round (`LIVE.bonus × the largest size < LIVE.point`, held by
   tests/live.test.js). Speed only orders pupils with the same number right.
   A pupil who thinks and gets it right beats a quick one who gets it wrong,
   every time. A hinted answer is right but earns no speed bonus.

   Pure: no DOM, no clock except through arguments.                         */

import { SKILL_IDS, skillName } from "./skills.js";
import { skillLevel } from "./progress.js";
import { scopeOf, targetName } from "./assignment.js";
import { patternById, UNREAD } from "./diagnosis.js";
import { duelTasks } from "./duel.js";

/* ---------- limits --------------------------------------------------------

   sizes      questions in a round; 10 is a lesson's round, 5 a warm-up
   secs       the time per question a teacher may choose, in seconds
   point      a right answer
   bonus      at most this much more for answering quickly — see above
   grace      ms after the clock runs out in which an answer still counts:
              the network between a pupil's tablet and the server
   maxPupils  in one round. A class is 20–30.
   maxRounds  rounds the server holds at once, over every group
   maxStreams open event streams over every round; perUser in one round —
              a pupil with the program open in two tabs is fine, twenty is not
   lobbyMs    a round nobody starts is ended after this
   idleMs     a round the teacher stops touching is ended after this
   maxMs      no round lasts longer than a double lesson
   keepMs     a finished round stays this long, so a pupil who reloads still
              sees the end; then it is forgotten                              */
export const LIVE = {
  sizes: [5, 10, 15],
  n: 10,
  secs: [20, 30, 45, 60, 90],
  defSecs: 30,
  point: 100,
  bonus: 6,
  grace: 1500,
  maxPupils: 60,
  maxRounds: 40,
  maxStreams: 800,
  perUser: 3,
  lobbyMs: 30 * 60000,
  idleMs: 20 * 60000,
  maxMs: 2 * 3600000,
  keepMs: 10 * 60000,
};

export const validSize = (n) => LIVE.sizes.includes(n);
export const validSecs = (s) => LIVE.secs.includes(s);

/* ---------- the questions --------------------------------------------------- */

/** What a round on `target` may ask: `{ skills, types }`. A category is its
    skill; a node, a pattern or a year narrows to question types, which may
    belong to any category (core/assignment.js `scopeOf`). */
export function roundScope(target) {
  const sc = scopeOf(target);
  if (!sc) return null;
  return { skills: sc.skills ? sc.skills.slice() : SKILL_IDS.slice(), types: sc.types ? sc.types.slice() : null };
}

/**
 * The level a round is played at: the mean, over the pupils given, of each
 * one's mean level in the round's categories. One number for the class,
 * rounded to a tenth, as a duel's is. `states` are saved states (or null for
 * a pupil who has not practised: level 1).
 */
export function roundLevel(states, skills) {
  const ids = skills && skills.length ? skills : SKILL_IDS;
  const per = (states || []).map((S) =>
    ids.reduce((a, id) => a + skillLevel(((S && S.skills && S.skills[id]) || {}).xp || 0).level, 0) / ids.length);
  if (!per.length) return 1;
  return Math.round((per.reduce((a, b) => a + b, 0) / per.length) * 10) / 10;
}

/**
 * The round's questions: a duel plan (core/duel.js) on the round's material.
 * `round` is `{ seed, n, level, skills, types, allowed }`; `deps` as for
 * `duelTasks`. Every question is marked `live` (and, from the plan, `duel`:
 * no second try, which a race against a clock cannot have).
 */
export function roundTasks(lex, round, deps) {
  return duelTasks(lex, {
    topic: "blandad", n: round.n, level: round.level, seed: round.seed,
    skills: round.skills, types: round.types, allowed: round.allowed || null,
  }, deps).map((t) => Object.assign(t, { live: true }));
}

/* ---------- the score ------------------------------------------------------- */

/** The speed bonus of a right answer `ms` after the question opened, with
    `secs` on the clock: all of `LIVE.bonus` at once, nothing at the end. */
export function speedBonus(ms, secs) {
  const frac = Math.min(1, Math.max(0, (ms || 0) / (Math.max(1, secs) * 1000)));
  return Math.round(LIVE.bonus * (1 - frac));
}

/** What one answer is worth. */
export const pointsFor = (ok, ms, secs, hinted = false) =>
  (ok ? LIVE.point + (hinted ? 0 : speedBonus(ms, secs)) : 0);

/**
 * The board: `players` is `[{ id, name, right, points, … }]`. Most points
 * first — which is most right first, since speed can never make up a right
 * answer — then the name. Equal points share a place (`rank`).
 */
export function standings(players) {
  const list = [...(players || [])].sort((a, b) =>
    b.points - a.points || b.right - a.right || String(a.name).localeCompare(String(b.name), "is"));
  let rank = 0, prev = null;
  return list.map((p, i) => {
    if (prev === null || p.points !== prev) { rank = i + 1; prev = p.points; }
    return { ...p, rank };
  });
}

/* ---------- the class's commonest error ---------------------------------------

   Every wrong answer is diagnosed by `judge` (core/answer.js → diagnosis.js);
   the round adds up, per error pattern, how many PUPILS made it and how many
   times. The commonest is the one most pupils made, then the most misses.
   "Ógreint" is a count of what could not be read, not a pattern, and a meta
   pattern teaches nothing: neither is ever the answer. */

/** Add one wrong answer's findings to the tally `{ [pattern]: { pupils:
    Set, misses } }`. Returns the tally. */
export function notePatterns(tally, uid, findings) {
  for (const f of findings || []) {
    const id = f && f.p;
    if (!id || id === UNREAD) continue;
    const p = patternById(id);
    if (!p || p.meta) continue;
    const t = (tally[id] ||= { pupils: new Set(), misses: 0 });
    t.pupils.add(uid);
    t.misses += 1;
  }
  return tally;
}

/** The commonest pattern in a tally, with its name and its rule — or null
    when nothing went wrong that the diagnosis could name. */
export function commonest(tally) {
  let best = null;
  for (const [id, t] of Object.entries(tally || {})) {
    const n = t.pupils instanceof Set ? t.pupils.size : (t.pupils || 0);
    if (!best || n > best.pupils || (n === best.pupils && t.misses > best.misses) ||
        (n === best.pupils && t.misses === best.misses && id < best.id)) {
      best = { id, pupils: n, misses: t.misses };
    }
  }
  if (!best) return null;
  const p = patternById(best.id);
  return { ...best, nm: p.nm, rule: p.rule || "", lesson: p.lesson || null };
}

/* ---------- words ----------------------------------------------------------- */

/** What the round is about, as the pupils and the board read it. */
export const roundName = (target) => targetName(target);

/** The category a question belongs to, for the board ("Nafnorð"). */
export const questionTopic = (task) => skillName(task && task.skill);

/** A pupil who did not choose to be shown by name: "Leikmaður 4", by the
    order of joining. The number belongs to this round only. */
export const alias = (k) => `Leikmaður ${k}`;

/** "1 rétt", "2 rétt" — *rétt* does not change with the number. */
export const rightText = (n) => `${n} rétt`;

/** The name a player is shown by on the board and on the other pupils'
    screens: their own nickname only if they have chosen to be on the
    leaderboard (server.mjs `visibleStates` is the same rule), otherwise the
    round's alias. The teacher's projector is a screen the whole class sees. */
export const displayName = (p) => (p && p.shown ? p.name : alias(p ? p.k : 0));

/**
 * The right answer of a question as a line of text for the board, after the
 * question has closed — or null where there is no one form to show (a table,
 * a text to correct, words to sort or tap): there the board shows the
 * question's own explanation (`task.why`) and the pupils' screens the full
 * verdict. Never anything the question does not already carry.
 */
export function answerText(task) {
  if (!task) return null;
  if (Array.isArray(task.answers) && task.answers.length) return String(task.answers[0]);
  if (typeof task.answer === "string" && task.answer) return task.answer;
  return null;
}

/* ---------- the round, as each screen sees it --------------------------------

   The server holds a round as
     { id, group, target, n, secs, phase, q, opened, closes, tasks,
       players: Map uid → { id, name, shown, k, right, points, marks: [] },
       perQ: [{ right, wrong, none }], tally, ended, why }
   with `phase` "lobby" (waiting for the teacher to start), "open" (question
   `q` is being answered), "shown" (question `q` has closed and its result is
   on the board) or "done". The functions below are what the board and each
   pupil are SENT — nothing else of the round leaves the server. */

const playersOf = (r) => [...((r && r.players && r.players.values) ? r.players.values() : (r && r.players) || [])];

/** How many on the board. Enough to cheer the top of the class, few enough
    that nobody is shown at the bottom of a list on the wall (item 59: the
    pupils near the bottom have every reason to stay away). */
export const BOARD_TOP = 5;

/** The board's rows, with display names: the first `top` of the standings. */
export function boardRows(r, top = BOARD_TOP) {
  return standings(playersOf(r).map((p) => ({ id: p.id, name: displayName(p), right: p.right, points: p.points })))
    .slice(0, top).map(({ id, ...row }) => row);
}

/** The class's tally of question `q`: right, wrong, and no answer. */
function questionStats(r, q) {
  const s = (r.perQ && r.perQ[q]) || { right: 0, wrong: 0 };
  const joined = playersOf(r).length;
  return { right: s.right, wrong: s.wrong, none: Math.max(0, joined - s.right - s.wrong), of: joined };
}

const msLeft = (r, now) => (r.phase === "open" ? Math.max(0, r.closes - now) : 0);

/** The projector (and the teacher's controls). */
export function boardView(r, now) {
  const players = playersOf(r);
  const q = r.q;
  const task = (r.phase === "open" || r.phase === "shown") && r.tasks ? r.tasks[q] : null;
  const out = {
    id: r.id, name: roundName(r.target), target: r.target, n: r.n, secs: r.secs,
    phase: r.phase, q, left: msLeft(r, now),
    joined: players.length,
    answered: r.phase === "open" ? players.filter((p) => p.marks[q] !== undefined).length : 0,
    task: task ? { ...task } : null,
    topic: task ? questionTopic(task) : null,
    top: boardRows(r),
  };
  if (r.phase === "shown" || r.phase === "done") {
    const last = r.phase === "shown" ? q : r.perQ.length - 1;
    if (last >= 0 && r.tasks && r.tasks[last]) {
      out.result = { q: last, ...questionStats(r, last), answer: answerText(r.tasks[last]), why: r.tasks[last].why || null };
    }
  }
  if (r.phase === "done") out.end = endView(r);
  return out;
}

/** How the round ended: the podium, the class's figures per question and
    its commonest error pattern with the rule. */
function endView(r) {
  const asked = (r.perQ || []).length;
  const per = (r.perQ || []).map((_, i) => questionStats(r, i));
  const right = per.reduce((a, s) => a + s.right, 0);
  const tries = per.reduce((a, s) => a + s.of, 0);
  return {
    asked, why: r.why || "",
    podium: boardRows(r, 3),
    perQ: per.map((s) => ({ right: s.right, of: s.of })),
    share: tries ? Math.round((100 * right) / tries) : 0,
    commonest: commonest(r.tally),
  };
}

/** One pupil's screen. `task` only while the question is open and only to a
    pupil who has joined; after it closes, only what the board shows. */
export function pupilView(r, uid, now) {
  const players = playersOf(r);
  const me = r.players && r.players.get ? r.players.get(uid) : players.find((p) => p.id === uid);
  const q = r.phase === "lobby" ? -1 : r.q;
  const out = {
    id: r.id, name: roundName(r.target), n: r.n, secs: r.secs,
    phase: r.phase, q, left: msLeft(r, now), joined: !!me,
    players: players.length,
  };
  if (!me) return out;
  const ranked = standings(players);
  const mine = ranked.find((p) => p.id === uid);
  out.me = { as: displayName(me), shown: !!me.shown, right: me.right, points: me.points,
    rank: mine ? mine.rank : null };
  if (r.phase === "open") {
    out.answered = me.marks[q] !== undefined;
    if (!out.answered && r.tasks) out.task = { ...r.tasks[q] };
  }
  if (r.phase === "shown" || r.phase === "done") {
    const last = r.phase === "shown" ? q : (r.perQ || []).length - 1;
    if (last >= 0 && r.tasks && r.tasks[last]) {
      const m = me.marks[last];
      out.result = { q: last, mine: m ? { ok: m.ok, points: m.points } : null,
        ...questionStats(r, last), answer: answerText(r.tasks[last]) };
    }
    out.top = boardRows(r);
  }
  if (r.phase === "done") out.end = endView(r);
  return out;
}
