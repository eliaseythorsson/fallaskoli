/* Team duels (critique item 67), on the server.
 *
 * The rules are in src/js/core/teamduel.js; the questions and the grading
 * are the duel's (core/duel.js). This file holds who may do what:
 *
 *   - A TEACHER of a group sets one: the group split in two (`vs: "split"`),
 *     or the group against another (`vs: <group id>`). Against another
 *     class, that class's teacher must say yes (`/accept`) — nobody can put
 *     another teacher's pupils in a game — unless the one who set it teaches
 *     both (the administrator). Either teacher may call it off.
 *   - A PUPIL in one of the teams presses play (`/start`: their seeds, no
 *     sooner) and sends their answers (`/result`), which are graded here and
 *     dropped. Once.
 *
 * Stored in teamduels.json (server/store.mjs), tidied on every read and
 * write (`prune`), erased with a pupil's account (`eraseUser`). */

import crypto from "node:crypto";
import { TEAM, HALF_NAMES, validTeamSize, validDays, splitTeams, teamOf, teamStatus, prune, openCount,
         viewForPupil, viewForTeacher } from "../src/js/core/teamduel.js";
import { roundScope, roundLevel } from "../src/js/core/live.js";
import { cleanTarget } from "../src/js/core/assignment.js";
import { duelTasks, gradeDuel, signature, ANSWER_LIMITS } from "../src/js/core/duel.js";

/**
 * @param o.store, o.lexFor, o.deps, o.judge, o.groupOf, o.ceiling, o.audit —
 *        as server/live.mjs
 * @param o.dataPrint  the fingerprint of the data the questions come from
 * @param o.groupsNow  async () → { id: { name } }
 * @param o.can        core/profile.js `can`
 */
export function createTeamDuels(o) {
  const { store, lexFor, deps, judge, groupOf, ceiling, audit, dataPrint, groupsNow, can } = o;
  const newSeed = () => crypto.randomBytes(4).readUInt32BE(0);

  /* One pupil's questions, remembered between /start and /result, as a
     duel's (server.mjs `questionsFor`). Nothing depends on the memory. */
  const built = new Map();
  const BUILT_MAX = 200;
  function questionsFor(d, uid) {
    const k = `${d.id}/${uid}`;
    let q = built.get(k);
    if (!q) {
      const tasks = duelTasks(lexFor(), { topic: "blandad", n: d.n, level: d.level, seed: d.seed,
        skills: d.skills, types: d.types, allowed: d.allowed, side: teamOf(d, uid), key: d.keys[uid] }, deps);
      q = { tasks, sig: signature(tasks) };
      built.set(k, q);
      if (built.size > BUILT_MAX) built.delete(built.keys().next().value);
    }
    return q;
  }

  async function listNow(now = Date.now()) {
    let list = await store.teamDuels();
    const kept = prune(list, now);
    if (kept.length !== list.length) {
      list = (await store.updateTeamDuels((cur) => {
        const k = prune(cur, now);
        return k.length !== cur.length ? k : null;
      })) || kept;
    }
    return list;
  }

  const learnersOf = async (group) => (await store.users()).filter((u) =>
    u.role === "learner" && u.status === "active" && groupOf(u) === group);

  /** The level of each pupil in the material, and of the team. */
  async function levels(ids, skills) {
    const per = [];
    for (const id of ids) {
      const rec = await store.stateRec(id);
      per.push({ id, level: roundLevel([rec ? rec.state : null], skills) });
    }
    return per;
  }
  const meanOf = (list) => (list.length ? Math.round((list.reduce((a, p) => a + p.level, 0) / list.length) * 10) / 10 : 1);

  /** Fix team b, the levels and the clock: when a duel starts. */
  async function begin(d, teamB, now) {
    const lb = await levels(teamB, d.skills);
    const la = await levels(d.teams.a, d.skills);
    d.teams.b = teamB;
    for (const id of teamB) d.keys[id] = newSeed();
    d.lv = { a: meanOf(la), b: meanOf(lb) };
    d.level = Math.round(((d.lv.a + d.lv.b) / 2) * 10) / 10;
    d.accepted = now;
    d.deadline = now + d.days * 86400000;
  }

  async function namesOf(group) {
    const out = {};
    (await store.users()).filter((u) => groupOf(u) === group).forEach((u) => { out[u.id] = u.name || u.username; });
    return out;
  }

  function routes({ on, json, readBody, needUser, needTeacher, securityHeaders }) {

    /* --- the teacher --- */

    on("GET", "/teacher/teamduels", async (req, res, { url }) => {
      const t = await needTeacher(req, res, url.searchParams.get("group"));
      if (!t) return;
      const now = Date.now();
      const names = await namesOf(t.group);
      const list = (await listNow(now)).filter((d) => d.groups.a === t.group || d.groups.b === t.group)
        .sort((x, y) => y.created - x.created)
        .map((d) => viewForTeacher(d, t.group, names, now));
      /* The other classes one could challenge: their names and size, no
         more. A class too small for a team is not offered. */
      const groups = await groupsNow();
      const users = await store.users();
      const others = Object.entries(groups).filter(([id]) => id !== t.group).map(([id, g]) => ({ id, name: g.name,
        pupils: users.filter((u) => u.role === "learner" && u.status === "active" && groupOf(u) === id).length }))
        .filter((g) => g.pupils >= TEAM.minSide);
      return json(res, 200, { group: { id: t.group, name: t.name }, list, others,
        pupils: (await learnersOf(t.group)).length,
        limits: { sizes: TEAM.sizes, days: TEAM.days, defDays: TEAM.defDays, minSide: TEAM.minSide } });
    });

    on("POST", "/teacher/teamduels", async (req, res) => {
      const body = await readBody(req, 4096);
      const t = await needTeacher(req, res, body?.group);
      if (!t) return;
      const target = cleanTarget(body?.target);
      if (!target) return json(res, 400, { error: "Veldu efni einvígisins." });
      const n = Number(body?.n), days = Number(body?.days ?? TEAM.defDays);
      if (!validTeamSize(n)) return json(res, 400, { error: `Fjöldi spurninga: ${TEAM.sizes.join(", ")}.` });
      if (!validDays(days)) return json(res, 400, { error: `Tími: ${TEAM.days.join(", ")} dagar.` });
      const vs = String(body?.vs || "split");
      const groups = await groupsNow();
      const now = Date.now();
      const scope = roundScope(target);
      const mine = (await learnersOf(t.group)).map((u) => u.id);
      const d = {
        id: crypto.randomBytes(9).toString("base64url"), by: t.me.id, target, n, days,
        seed: newSeed(), keys: {}, skills: scope.skills, types: scope.types, allowed: await ceiling(),
        data: dataPrint, created: now, accepted: 0, deadline: 0, pendingUntil: 0,
        started: {}, res: {},
      };
      if (vs === "split") {
        if (mine.length < 2 * TEAM.minSide)
          return json(res, 400, { error: `Til að skipta hópnum í tvö lið þarf að minnsta kosti ${2 * TEAM.minSide} nemendur.` });
        const halves = splitTeams(await levels(mine, scope.skills), d.seed);
        Object.assign(d, { kind: "split", groups: { a: t.group, b: t.group }, names: { ...HALF_NAMES },
          teams: { a: halves.a, b: [] } });
        for (const id of halves.a) d.keys[id] = newSeed();
        await begin(d, halves.b, now);
      } else {
        /* Membership before existence, as `needTeacher`: the list of other
           groups is offered by GET above, and nothing else is told. */
        if (vs === t.group || !groups[vs]) return json(res, 400, { error: "Veldu hóp til að keppa við." });
        const theirs = (await learnersOf(vs)).map((u) => u.id);
        if (mine.length < TEAM.minSide || theirs.length < TEAM.minSide)
          return json(res, 400, { error: `Hvor hópur þarf að minnsta kosti ${TEAM.minSide} nemendur.` });
        Object.assign(d, { kind: "class", groups: { a: t.group, b: vs },
          names: { a: groups[t.group].name, b: groups[vs].name }, teams: { a: mine, b: [] } });
        for (const id of mine) d.keys[id] = newSeed();
        /* The administrator teaches both; anybody else asks the other class. */
        if (can(t.me, "canAdminUsers")) await begin(d, theirs, now);
        else d.pendingUntil = now + TEAM.pendingDays * 86400000;
      }
      let problem = null;
      await store.updateTeamDuels((cur) => {
        const list = prune(cur, now);
        for (const g of new Set([d.groups.a, d.groups.b])) {
          if (openCount(list, g, now) >= TEAM.maxOpen) {
            problem = `${groups[g].name}: ${TEAM.maxOpen} bekkjareinvígi eru þegar opin eða bíða svars.`; return null;
          }
        }
        return [...list, d];
      });
      if (problem) return json(res, 409, { error: problem });
      await audit(t.me.id, "setti bekkjareinvígi", null, `${d.groups.a}–${d.groups.b}: ${target.kind} ${target.id}`);
      return json(res, 200, { ok: true, duel: viewForTeacher(d, t.group, await namesOf(t.group), now) });
    });

    /* The other class's teacher says yes: their pupils become team b. */
    on("POST", /^\/teacher\/teamduels\/([A-Za-z0-9_-]{6,40})\/accept$/, async (req, res, { params }) => {
      const now = Date.now();
      const found = (await listNow(now)).find((x) => x.id === params[0]);
      const t = await needTeacher(req, res, found ? found.groups.b : null);
      if (!t) return;
      if (!found || found.groups.b !== t.group) return json(res, 404, { error: "Einvígið er ekki til." });
      if (teamStatus(found, now) !== "pending") return json(res, 409, { error: "Einvígið bíður ekki svars." });
      const theirs = (await learnersOf(t.group)).map((u) => u.id);
      if (theirs.length < TEAM.minSide) return json(res, 400, { error: `Hópurinn þarf að minnsta kosti ${TEAM.minSide} nemendur.` });
      let problem = null, view = null;
      const d0 = JSON.parse(JSON.stringify(found));
      await begin(d0, theirs, now);
      await store.updateTeamDuels((cur) => {
        const list = prune(cur, now);
        const d = list.find((x) => x.id === found.id);
        if (!d || teamStatus(d, now) !== "pending") { problem = "Einvígið bíður ekki svars."; return null; }
        Object.assign(d, { teams: d0.teams, keys: d0.keys, lv: d0.lv, level: d0.level,
          accepted: d0.accepted, deadline: d0.deadline });
        view = viewForTeacher(d, t.group, {}, now);
        return list;
      });
      if (problem) return json(res, 409, { error: problem });
      await audit(t.me.id, "samþykkti bekkjareinvígi", null, `${found.groups.a}–${found.groups.b}`);
      return json(res, 200, { ok: true, duel: view });
    });

    /* Either class's teacher calls it off: it is erased, results and all. */
    on("DELETE", /^\/teacher\/teamduels\/([A-Za-z0-9_-]{6,40})$/, async (req, res, { params }) => {
      const found = (await store.teamDuels()).find((x) => x.id === params[0]);
      /* A teacher of either group; another group's teacher gets the 403 of
         asking about another group. */
      let group = found ? found.groups.a : null;
      if (found) {
        const me = await needUser(req, res);
        if (!me) return;
        if (groupOf(me) === found.groups.b) group = found.groups.b;
      }
      const t = await needTeacher(req, res, group);
      if (!t) return;
      if (!found) return json(res, 404, { error: "Einvígið er ekki til." });
      await store.updateTeamDuels((list) => {
        const rest = list.filter((x) => x.id !== found.id);
        return rest.length !== list.length ? rest : null;
      });
      await audit(t.me.id, "hætti við bekkjareinvígi", null, `${found.groups.a}–${found.groups.b}`);
      res.writeHead(204, securityHeaders(req)); res.end();
    });

    /* --- the pupil --- */

    on("GET", "/teamduels", async (req, res) => {
      const u = await needUser(req, res);
      if (!u) return;
      const now = Date.now();
      const list = (await listNow(now)).map((d) => viewForPupil(d, u.id, now)).filter(Boolean)
        .sort((x, y) => y.created - x.created);
      return json(res, 200, { duels: list });
    });

    on("POST", /^\/teamduels\/([A-Za-z0-9_-]{6,40})\/start$/, async (req, res, { params }) => {
      const u = await needUser(req, res);
      if (!u) return;
      const now = Date.now();
      let problem = null, duel = null;
      await store.updateTeamDuels((cur) => {
        const list = prune(cur, now);
        const d = list.find((x) => x.id === params[0]);
        if (!d || !teamOf(d, u.id) || !d.accepted) { problem = [404, "Einvígið er ekki til."]; return null; }
        if (teamStatus(d, now) !== "open") { problem = [409, "Einvígið er búið."]; return null; }
        if (d.res[u.id]) { problem = [409, "Þú hefur þegar skilað í þessu einvígi."]; return null; }
        duel = d;
        if (d.started[u.id]) return null;
        d.started[u.id] = now;
        return list;
      });
      if (problem) return json(res, problem[0], { error: problem[1] });
      const q = questionsFor(duel, u.id);
      return json(res, 200, { ok: true, duel: viewForPupil(duel, u.id, now),
        seed: duel.seed, key: duel.keys[u.id], sig: q.sig });
    });

    on("POST", /^\/teamduels\/([A-Za-z0-9_-]{6,40})\/result$/, async (req, res, { params }) => {
      const u = await needUser(req, res);
      if (!u) return;
      const body = await readBody(req, 20 * ANSWER_LIMITS.bytes + 4096);
      const answers = body?.answers;
      const sig = typeof body?.sig === "string" ? body.sig.slice(0, 40) : null;
      if (!Array.isArray(answers) || !sig) return json(res, 400, { error: "Ógild niðurstaða." });
      const now = Date.now();
      const check = (list) => {
        const d = list.find((x) => x.id === params[0]);
        if (!d || !teamOf(d, u.id) || !d.accepted) return { problem: [404, "Einvígið er ekki til."] };
        if (teamStatus(d, now) !== "open") return { problem: [409, "Einvígið er búið."] };
        if (d.res[u.id]) return { problem: [409, "Þú hefur þegar skilað í þessu einvígi."] };
        if (!d.started[u.id]) return { problem: [409, "Einvígið er ekki hafið."] };
        if (answers.length > d.n) return { problem: [400, "Ógild niðurstaða."] };
        return { d };
      };
      const first = check(prune(await store.teamDuels(), now));
      if (first.problem) return json(res, first.problem[0], { error: first.problem[1] });
      const q = questionsFor(first.d, u.id);
      if (sig !== q.sig) {
        return json(res, 409, { error: "Spurningarnar stemma ekki við þjóninn. Endurhladdu síðuna (F5) og spilaðu einvígið aftur." });
      }
      const { c, n } = gradeDuel(q.tasks, answers, judge);
      let problem = null, view = null;
      await store.updateTeamDuels((cur) => {
        const list = prune(cur, now);
        const again = check(list);
        if (again.problem) { problem = again.problem; return null; }
        again.d.res[u.id] = { c, n, at: now };
        view = viewForPupil(again.d, u.id, now);
        return list;
      });
      if (problem) return json(res, problem[0], { error: problem[1] });
      built.delete(`${params[0]}/${u.id}`);
      return json(res, 200, { ok: true, duel: view });
    });
  }

  return { routes, listNow };
}
