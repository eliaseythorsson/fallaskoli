/* Team duels (critique item 67): half the class against the other half, or
   one class against another, scored on the mean so that everybody's answers
   count. Set by a teacher; played by each pupil on their own, whenever they
   like before the deadline, exactly as a duel is.

   BUILT ON THE DUEL (core/duel.js). A team duel is a duel with two TEAMS for
   sides:
     - the duel's seed makes one PLAN for both teams (`duelPlan`);
     - each pupil is built their own questions of the plan's weight from their
       own key (`duelTasks` with the team as the side), about words and
       sentences of their TEAM's half of the vocabulary (`halfOf`) — so a
       pupil can pass nothing useful to the other team, and teammates do not
       all get the same questions either;
     - the server grades the answers (`gradeDuel` with `judge`) and keeps the
       numbers, never the answers;
     - the team on the lower level is given right answers in advance
       (`handicap`, item 66), per player, on the team's mean.

   THE MEAN. A team's score is the mean number of right answers of the
   pupils who played, plus its handicap. The mean and not the sum, so a team
   with one pupil more does not win for that, and every pupil's answers move
   it: a careful 6 out of 10 helps the team as much as anybody's. A pupil who
   does not play is not counted as nought — a pupil off sick must not lose the
   class the duel — but the board says how many of each team played. A team
   nobody played for loses; when neither team played, the duel is void and
   disappears, as a duel does.

   WHO SEES WHAT. A pupil sees their own result, their team's name and mean
   and how many have played — never a teammate's or an opponent's name or
   score. The teacher of a group sees the results of their own pupils, by
   name, as for an assignment; of the other class only the team's figures.

   Pure: no DOM, no network, no clock except through arguments.             */

import { DUEL, handicap, seeded } from "./duel.js";
import { targetName } from "./assignment.js";

/* ---------- limits ---------------------------------------------------------

   sizes        questions per pupil, as a duel
   days         how long the teams have, from the start; a class meets a
                few times a week, so a duel between classes may need a week
   minSide      pupils in a team at least; a team of one is a duel
   maxOpen      team duels a group may have open or waiting at once
   pendingDays  a challenge to another class nobody answered is dropped
   keepDays     a finished team duel is kept this long, then erased        */
export const TEAM = {
  sizes: DUEL.sizes,
  days: [1, 2, 3, 7],
  defDays: 2,
  minSide: 2,
  maxOpen: 4,
  pendingDays: 3,
  keepDays: 30,
};

export const validTeamSize = (n) => TEAM.sizes.includes(n);
export const validDays = (d) => TEAM.days.includes(d);

/** The two teams' names when one class is split in two. */
export const HALF_NAMES = { a: "Lið A", b: "Lið B" };

/*  A team duel as the server stores it (data/teamduels.json):
 *    { id, kind: "split" | "class",
 *      groups: { a, b },            the group of each team (the same for a split)
 *      names: { a, b },             the teams' names
 *      by,                          the teacher who set it
 *      target, n, days,             what is asked, and for how long
 *      seed,                        the plan both teams share
 *      teams: { a: [ids], b: [ids] }
 *      keys: { [uid]: seed },       each pupil's own questions
 *      lv: { a, b }, level,         the teams' levels, and the duel's (their mean)
 *      skills, types, allowed,      the material (core/live.js `roundScope`)
 *      data,                        the data fingerprint (core/duel.js `dataPrint`)
 *      created, accepted, deadline, pendingUntil,     ms
 *      started: { [uid]: ms },
 *      res: { [uid]: { c, n, at } } }                 as the SERVER graded them
 */

/** Which team pupil `uid` is on, or null. */
export const teamOf = (d, uid) =>
  (d && d.teams ? (d.teams.a.includes(uid) ? "a" : d.teams.b.includes(uid) ? "b" : null) : null);

/**
 * Split a class into two teams of equal strength. `pupils` is
 * `[{ id, level }]`; they are ranked by level and dealt A, B, B, A, A, B, B,
 * A … (the strongest and the weakest pair up on the same side), pupils on
 * the same level in an order drawn from `seed`. With an odd number the
 * extra pupil goes to the team with the lower total. Returns `{ a, b }`.
 */
export function splitTeams(pupils, seed) {
  const rng = seeded(seed >>> 0);
  const list = (pupils || []).map((p) => ({ ...p, r: rng() }))
    .sort((x, y) => (y.level || 0) - (x.level || 0) || x.r - y.r);
  const a = [], b = [];
  let sa = 0, sb = 0;
  list.forEach((p, i) => {
    const pair = Math.floor(i / 2), first = i % 2 === 0;
    let side = (pair % 2 === 0) === first ? "a" : "b";
    /* The last one of an odd number: to the weaker side. */
    if (i === list.length - 1 && list.length % 2 === 1) side = sa <= sb ? "a" : "b";
    (side === "a" ? a : b).push(p.id);
    if (side === "a") sa += p.level || 0; else sb += p.level || 0;
  });
  return { a, b };
}

/** "pending" | "open" | "done" | "void" at time `now`. */
export function teamStatus(d, now) {
  if (!d.accepted) return now < (d.pendingUntil || 0) ? "pending" : "void";
  const played = playedOf(d);
  if (played.a === d.teams.a.length && played.b === d.teams.b.length) return "done";
  if (now < d.deadline) return "open";
  return played.a + played.b ? "done" : "void";
}

const playedOf = (d) => ({
  a: d.teams.a.filter((id) => d.res && d.res[id]).length,
  b: d.teams.b.filter((id) => d.res && d.res[id]).length,
});

/** The handicap of a team duel: right answers per player, for the team on
    the lower level (core/duel.js `handicap`, on the teams' levels). */
export const teamHandicap = (d) => handicap({ lv: d.lv, n: d.n });

const tenth = (x) => Math.round(x * 10) / 10;

/**
 * One team's figures: `{ played, of, mean, plus, score }` — `mean` the mean
 * of right answers of those who played (0 when nobody has), `plus` the
 * handicap, `score` the two together. Rounded to a tenth, which is what is
 * shown and what is compared.
 */
export function teamScore(d, side) {
  const ids = d.teams[side];
  const done = ids.map((id) => d.res && d.res[id]).filter(Boolean);
  const mean = done.length ? done.reduce((a, r) => a + r.c, 0) / done.length : 0;
  const plus = teamHandicap(d)[side];
  return { played: done.length, of: ids.length, mean: tenth(mean), plus, score: tenth(mean + plus) };
}

/** The winner of a finished team duel: "a" | "b" | "t" (a tie), or null
    while it is not finished. A team nobody played for loses. */
export function teamWinner(d, now) {
  if (teamStatus(d, now) !== "done") return null;
  const A = teamScore(d, "a"), B = teamScore(d, "b");
  if (!A.played && B.played) return "b";
  if (A.played && !B.played) return "a";
  if (A.score !== B.score) return A.score > B.score ? "a" : "b";
  return "t";
}

/** When it finished: the last result, or the deadline. */
function finishedAt(d) {
  const all = [...d.teams.a, ...d.teams.b];
  if (all.every((id) => d.res && d.res[id])) return Math.max(...all.map((id) => d.res[id].at || 0));
  return d.deadline;
}

/** The tidy-up before every read and write: void ones go at once (a
    challenge nobody accepted, a duel nobody played), finished ones after
    `keepDays`. */
export function prune(list, now) {
  return (list || []).filter((d) => {
    const st = teamStatus(d, now);
    if (st === "void") return false;
    if (st === "done" && now - finishedAt(d) > TEAM.keepDays * 86400000) return false;
    return true;
  });
}

/** Open or waiting team duels a group is part of. */
export const openCount = (list, group, now) => (list || []).filter((d) =>
  (d.groups.a === group || d.groups.b === group) && ["open", "pending"].includes(teamStatus(d, now))).length;

/**
 * What pupil `uid` is shown of a team duel — shaped as a duel's view
 * (core/duel.js `viewFor`), so the duel strip and the duel run serve both:
 * `opponent.name` is the other team's name, `team` says it is a team duel.
 * The team's means are shown once the pupil has played or the duel is over
 * (as a duel withholds the other score); how many have played, always.
 * Null for somebody not in it, and before it has been accepted.
 */
export function viewForPupil(d, uid, now) {
  const side = teamOf(d, uid);
  if (!side || !d.accepted) return null;
  const other = side === "a" ? "b" : "a";
  const status = teamStatus(d, now);
  const mine = d.res && d.res[uid] ? { c: d.res[uid].c, n: d.res[uid].n } : null;
  const show = !!mine || status === "done";
  const fig = (s) => { const t = teamScore(d, s); return show ? t : { played: t.played, of: t.of }; };
  const h = teamHandicap(d);
  const w = teamWinner(d, now);
  return {
    id: d.id, team: true, side, challenger: false,
    myTeam: d.names[side],
    opponent: { id: null, name: d.names[other] },
    topic: "blandad", name: targetName(d.target), target: d.target,
    n: d.n, level: d.level, data: d.data,
    ...(d.skills ? { skills: d.skills } : {}), ...(d.types ? { types: d.types } : {}),
    ...(d.allowed ? { allowed: d.allowed } : {}),
    created: d.created, deadline: d.deadline, status,
    mine, theyPlayed: false,
    us: fig(side), them: fig(other),
    handicap: { mine: h[side], theirs: h[other] },
    /* Settled on the pupil's device only if they played (core/duel.js
       `settleDuels`): a pupil who did not play has nothing to settle. */
    outcome: w && mine ? (w === "t" ? "t" : w === side ? "w" : "l") : null,
  };
}

/**
 * What the teacher of `group` is shown. `names` maps user ids to nicknames —
 * of the teacher's OWN group only; the other class's pupils appear only in
 * their team's figures.
 */
export function viewForTeacher(d, group, names, now) {
  const mine = ["a", "b"].filter((s) => d.groups[s] === group);
  const status = teamStatus(d, now);
  const fig = (s) => ({ name: d.names[s], group: d.groups[s], ...teamScore(d, s),
    pupils: mine.includes(s) ? d.teams[s].map((id) => ({ name: names[id] || "?",
      res: d.res && d.res[id] ? { c: d.res[id].c, n: d.res[id].n } : null })) : null });
  return {
    id: d.id, kind: d.kind, name: targetName(d.target), target: d.target, n: d.n, days: d.days,
    created: d.created, deadline: d.deadline || null, status, winner: teamWinner(d, now),
    handicap: teamHandicap(d),
    /* A challenge from another class, waiting for this teacher's yes. */
    canAccept: status === "pending" && d.groups.b === group && d.groups.a !== group,
    teams: { a: fig("a"), b: fig("b") },
  };
}
