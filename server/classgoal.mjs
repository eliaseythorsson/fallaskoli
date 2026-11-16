/* The class goal on the server (v6.13, critique item 59).
 *
 * What the goal is, how progress is counted and why only totals are shown:
 * src/js/core/classgoal.js. This file is who may set it, where it is kept,
 * and the routes — kept apart from server.mjs, which lends it the helpers
 * that say who is logged in and who teaches whom (as server/calibrate.mjs).
 *
 *   GET    /classgoal                     anybody logged in: their own group's
 *                                         goal and the group's total this week
 *   GET    /teacher/classgoal?group=g     the group's guardian or the
 *                                         administrator: the same, and the choices
 *   POST   /teacher/classgoal             { group, kind, n } — set it
 *   DELETE /teacher/classgoal?group=g     remove it
 *
 * WHO sets it: `needTeacher` (server.mjs), the one check every teacher route
 * uses — the guardian of the group, or the administrator for any group.
 * Setting and removing are written to the audit trail, by id.
 *
 * WHO is counted: the learners of the group who are active and not held for
 * review (implausible numbers, as for the board). Not only those on
 * the board: the goal is for the whole class, and the pupils who keep off the
 * board are the ones it is for. Nobody sees what anybody put in (only the
 * total), and with fewer than CLASS_GOAL.minPupils learners nothing is shown.
 */

import { CLASS_GOAL, cleanGoal, cleanGoals, withGoal, goalFor, progressOf } from "../src/js/core/classgoal.js";
import { weekKey, prevWeekKey } from "../src/js/core/social.js";

export function createClassGoal({ store, groupOf, groupsNow, audit }) {
  /** The states of the group's active learners (null for one who never
      practised). A learner held for review — implausible numbers, kept off
      the board until the administrator has looked (server.mjs) — is left
      out of the sum too, so an edited state cannot fill the bar for all. */
  async function statesOf(group) {
    const users = (await store.users()).filter((u) =>
      u.role === "learner" && u.status === "active" && groupOf(u) === group && !u.review);
    const out = [];
    for (const u of users) {
      const rec = await store.stateRec(u.id);
      out.push(rec ? rec.state : null);
    }
    return out;
  }

  /** This week's goal and total for a group, and whether last week's was met. */
  async function statusOf(group, now = new Date()) {
    const groups = await groupsNow();
    const list = cleanGoals(groups[group] && groups[group].goals);
    const week = weekKey(now);
    const last = prevWeekKey(week);
    const goal = goalFor(list, week);
    const lastGoal = goalFor(list, last);
    if (!goal && !lastGoal) return { week, goal: null, progress: null, last: null };
    const states = await statesOf(group);
    const lastProgress = progressOf(lastGoal, states, last);
    return {
      week, goal, progress: progressOf(goal, states, week),
      /* Only whether it was met: last week's numbers are nobody's business
         now, and the badge needs no more. */
      last: lastGoal ? { week: last, met: !!(lastProgress && lastProgress.met) } : null,
    };
  }

  function routes({ on, json, readBody, needUser, needTeacher }) {
    on("GET", "/classgoal", async (req, res) => {
      const u = await needUser(req, res);
      if (!u) return;
      const s = await statusOf(groupOf(u));
      /* `member`: a learner of the group, who gets the badge. The group's
         teacher sees the same bar but is not given the pupils' badge. */
      return json(res, 200, { ...s, member: u.role === "learner" });
    });

    on("GET", "/teacher/classgoal", async (req, res, { url }) => {
      const t = await needTeacher(req, res, url.searchParams.get("group"));
      if (!t) return;
      const pupils = (await statesOf(t.group)).length;
      return json(res, 200, { group: { id: t.group, name: t.name }, pupils,
        limits: CLASS_GOAL, ...(await statusOf(t.group)) });
    });

    on("POST", "/teacher/classgoal", async (req, res) => {
      const body = await readBody(req, 2048);
      const t = await needTeacher(req, res, body && body.group);
      if (!t) return;
      const goal = cleanGoal(body);
      if (!goal) return json(res, 400, { error: "Veldu markmið af listanum." });
      if ((await statesOf(t.group)).length < CLASS_GOAL.minPupils) {
        return json(res, 409, { error:
          `Hópurinn þarf að hafa að minnsta kosti ${CLASS_GOAL.minPupils} nemendur til að fá sameiginlegt markmið.` });
      }
      const week = weekKey(new Date());
      await store.updateGroups((g) => {
        const rec = g[t.group] || { name: t.name };
        g[t.group] = { ...rec, goals: withGoal(rec.goals, goal, week) };
        return g;
      });
      await audit(t.me.id, "setti markmið hópsins", null, `${t.group}: ${goal.kind} ${goal.n}`);
      return json(res, 200, { ok: true, ...(await statusOf(t.group)) });
    });

    on("DELETE", "/teacher/classgoal", async (req, res, { url }) => {
      const t = await needTeacher(req, res, url.searchParams.get("group"));
      if (!t) return;
      const week = weekKey(new Date());
      await store.updateGroups((g) => {
        const rec = g[t.group] || { name: t.name };
        g[t.group] = { ...rec, goals: withGoal(rec.goals, null, week) };
        return g;
      });
      await audit(t.me.id, "fjarlægði markmið hópsins", null, t.group);
      return json(res, 200, { ok: true, ...(await statusOf(t.group)) });
    });
  }

  return { statusOf, routes };
}
