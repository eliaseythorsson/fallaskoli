/* Team duels (critique item 67): the rules in core/teamduel.js, and the
 * server's routes through real HTTP requests (server/teamduel.mjs).
 *
 * What matters: the teams are even, the score is the MEAN so everybody's
 * answers count, the server grades (the duel's own `gradeDuel` and `judge`),
 * a teacher can only put their own pupils in a game, and nobody sees a
 * classmate's or an opponent's score. */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server/server.mjs";
import { hashPassword, newId } from "../server/auth.mjs";
import { TEAM, splitTeams, teamScore, teamWinner, teamStatus, prune, viewForPupil, viewForTeacher, teamOf, openCount }
  from "../src/js/core/teamduel.js";
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { duelTasks, signature } from "../src/js/core/duel.js";
import { judge } from "../src/js/core/answer.js";
import { blankState, newSession } from "../src/js/core/state.js";
import { nextTask, buildTask, makeView, applyEffects } from "../src/js/tasks/index.js";
import { createPolicy } from "../src/js/core/policy.js";
import { skillNeed } from "../src/js/core/progress.js";

const H = 3600000, DAY = 86400000;

/* ---------- the rules ------------------------------------------------------- */

test("a class is split into two teams of equal strength", () => {
  const pupils = [9, 8, 7, 6, 5, 4, 3, 2].map((level, i) => ({ id: "p" + i, level }));
  const { a, b } = splitTeams(pupils, 1);
  assert.equal(a.length, 4);
  assert.equal(b.length, 4);
  const sum = (ids) => ids.reduce((s, id) => s + pupils.find((p) => p.id === id).level, 0);
  assert.equal(sum(a), sum(b), "dealt A B B A: the totals are equal");
  /* An odd number: the extra pupil goes to the weaker side, and nobody is lost. */
  const odd = splitTeams(pupils.slice(0, 7), 2);
  assert.equal(odd.a.length + odd.b.length, 7);
  assert.ok(Math.abs(odd.a.length - odd.b.length) === 1);
  /* The same seed, the same teams; equal levels are not always split the same way. */
  const flat = Array.from({ length: 10 }, (_, i) => ({ id: "f" + i, level: 3 }));
  assert.deepEqual(splitTeams(flat, 5), splitTeams(flat, 5));
  assert.notDeepEqual(splitTeams(flat, 5).a, splitTeams(flat, 6).a);
});

function duel(extra = {}) {
  return { id: "t1", kind: "split", groups: { a: "g", b: "g" }, names: { a: "Lið A", b: "Lið B" },
    target: { kind: "skill", id: "nafnord" }, n: 10, days: 2, seed: 1,
    teams: { a: ["a1", "a2", "a3"], b: ["b1", "b2"] }, keys: {}, lv: { a: 3, b: 3 }, level: 3,
    created: 0, accepted: 1, deadline: 2 * DAY, pendingUntil: 0, started: {}, res: {}, ...extra };
}

test("the score is the mean of those who played, so a bigger team does not win for its size", () => {
  const d = duel({ res: { a1: { c: 6, n: 10 }, a2: { c: 6, n: 10 }, a3: { c: 6, n: 10 }, b1: { c: 7, n: 10 }, b2: { c: 7, n: 10 } } });
  assert.deepEqual(teamScore(d, "a"), { played: 3, of: 3, mean: 6, plus: 0, score: 6 });
  assert.equal(teamScore(d, "b").score, 7);
  assert.equal(teamStatus(d, DAY), "done", "everybody has played: over before the deadline");
  assert.equal(teamWinner(d, DAY), "b", "18 right against 14, but the mean wins");
});

test("a pupil who did not play is not a nought; a team nobody played for loses", () => {
  const d = duel({ res: { a1: { c: 8, n: 10 }, b1: { c: 5, n: 10 }, b2: { c: 5, n: 10 } } });
  assert.equal(teamStatus(d, DAY), "open");
  assert.equal(teamScore(d, "a").mean, 8);
  assert.equal(teamWinner(d, 3 * DAY), "a");
  const none = duel({ res: { b1: { c: 1, n: 10 } } });
  assert.equal(teamWinner(none, 3 * DAY), "b");
  /* Nobody at all: void, and gone at the next tidy-up. */
  const empty = duel();
  assert.equal(teamStatus(empty, 3 * DAY), "void");
  assert.equal(prune([empty], 3 * DAY).length, 0);
});

test("the team on the lower level gets the duel's handicap, per player, on its mean", () => {
  const d = duel({ lv: { a: 2, b: 5 }, res: { a1: { c: 5, n: 10 }, a2: { c: 5, n: 10 }, a3: { c: 5, n: 10 }, b1: { c: 6, n: 10 }, b2: { c: 6, n: 10 } } });
  const A = teamScore(d, "a");
  assert.ok(A.plus > 0);
  assert.equal(teamScore(d, "b").plus, 0);
  assert.equal(A.score, 5 + A.plus);
});

test("a challenge to another class waits for a yes, and lapses", () => {
  const d = duel({ kind: "class", groups: { a: "g", b: "h" }, accepted: 0, deadline: 0, pendingUntil: DAY, teams: { a: ["a1", "a2"], b: [] } });
  assert.equal(teamStatus(d, H), "pending");
  assert.equal(openCount([d], "h", H), 1);
  assert.equal(viewForPupil(d, "a1", H), null, "a pupil sees nothing before it starts");
  assert.equal(teamStatus(d, 2 * DAY), "void");
  assert.equal(viewForTeacher(d, "h", {}, H).canAccept, true);
  assert.equal(viewForTeacher(d, "g", {}, H).canAccept, false, "not the one who asked");
});

test("a pupil sees their own result and their team's figures — no names, and no means before playing", () => {
  const d = duel({ res: { a1: { c: 6, n: 10 }, b1: { c: 7, n: 10 } } });
  const before = viewForPupil(d, "a2", H);
  assert.equal(before.mine, null);
  assert.deepEqual(before.us, { played: 1, of: 3 });
  assert.deepEqual(before.them, { played: 1, of: 2 });
  assert.equal(before.opponent.name, "Lið B");
  const after = viewForPupil(d, "a1", H);
  assert.equal(after.us.mean, 6);
  assert.equal(after.them.mean, 7);
  assert.ok(!JSON.stringify(after).match(/a2|a3|b1|b2/), "no other pupil's id");
  assert.equal(viewForPupil(d, "stranger", H), null);
  /* The teacher of the group sees their pupils by name; of another class only the figures. */
  const vt = viewForTeacher(duel({ kind: "class", groups: { a: "g", b: "h" } }), "g", { a1: "Anna" }, H);
  assert.equal(vt.teams.a.pupils[0].name, "Anna");
  assert.equal(vt.teams.b.pupils, null);
});

test("the outcome is settled only for a pupil who played", () => {
  const d = duel({ res: { a1: { c: 6, n: 10 }, b1: { c: 3, n: 10 } } });
  assert.equal(viewForPupil(d, "a1", 3 * DAY).outcome, "w");
  assert.equal(viewForPupil(d, "b1", 3 * DAY).outcome, "l");
  assert.equal(viewForPupil(d, "a2", 3 * DAY).outcome, null);
});

/* ---------- the server ------------------------------------------------------ */

const PW = "lykilordid-mitt";
let base, dir, app;
const U = {}, C = {};
const deps = { nextTask, buildTask, makeView, applyEffects, blankState, newSession, createPolicy };
let lexCache = null;
const lex = () => (lexCache ||= buildLexicon(DATA, { hide: new Set(DATA.blocked || []) }));

function client() {
  let cookie = null;
  const call = async (method, p, body) => {
    const r = await fetch(base + p, { method, redirect: "manual",
      headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined });
    const set = r.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const text = await r.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: r.status, data };
  };
  call.login = async (username) => {
    const r = await call("POST", "/auth/login", { username, password: PW });
    assert.equal(r.status, 200, username);
    return call;
  };
  return call;
}

async function makeUser(username, extra = {}) {
  const { salt, hash } = await hashPassword(PW);
  let user;
  await app.store.updateUsers((users) => {
    user = { id: newId(), username, name: username, role: "learner", status: "active", group: "ga", salt, hash,
      created: new Date().toISOString(), lastSeen: new Date().toISOString().slice(0, 10),
      consent: { by: "self", over16: true, at: new Date().toISOString(), how: "admin" }, ...extra };
    users.push(user);
    return users;
  });
  return user;
}

before(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "fallaskoli-team-"));
  const html = path.join(dir, "app.html");
  await fs.writeFile(html, "<!DOCTYPE html><title>x</title>");
  app = createApp({ dataDir: path.join(dir, "data"), htmlFile: html, secureCookies: false,
    env: { FALLASKOLI_CONTROLLER: "Prófari", FALLASKOLI_CONTACT: "p@example.is" } });
  await app.store.init();
  await new Promise((r) => app.server.listen(0, r));
  base = "http://127.0.0.1:" + app.server.address().port;
  await app.store.updateGroups(() => ({ ga: { name: "8. A" }, gb: { name: "8. B" }, gc: { name: "Lítill" } }));
  U.admin = await makeUser("stjori", { role: "admin", group: "default", consent: undefined });
  U.kA = await makeUser("kennari-a", { role: "guardian", consent: undefined });
  U.kB = await makeUser("kennari-b", { role: "guardian", group: "gb", consent: undefined });
  for (const n of ["a1", "a2", "a3", "a4"]) U[n] = await makeUser(n);
  for (const n of ["b1", "b2"]) U[n] = await makeUser(n, { group: "gb" });
  U.c1 = await makeUser("c1", { group: "gc" });
  /* a1 is strong in nouns: the split must not put a1 and a2 together. */
  const S = blankState(); S.skills.nafnord.xp = skillNeed(6);
  await app.store.putState(U.a1.id, S);
  const S2 = blankState(); S2.skills.nafnord.xp = skillNeed(5);
  await app.store.putState(U.a2.id, S2);
  for (const k of Object.keys(U)) C[k] = await client().login(U[k].username);
  C.anon = client();
});

after(async () => {
  await new Promise((r) => app.server.close(r));
  await fs.rm(dir, { recursive: true, force: true });
});

const NOUNS = { kind: "node", id: "no-beyging" };

test("only a teacher sets a team duel, and only for their own group", async () => {
  const body = { target: NOUNS, n: 10, days: 2, vs: "split" };
  assert.equal((await C.anon("POST", "/teacher/teamduels", body)).status, 401);
  assert.equal((await C.a1("POST", "/teacher/teamduels", body)).status, 403);
  assert.equal((await C.kB("POST", "/teacher/teamduels", { ...body, group: "ga" })).status, 403);
  assert.equal((await C.kA("POST", "/teacher/teamduels", { ...body, n: 7 })).status, 400);
  assert.equal((await C.kA("POST", "/teacher/teamduels", { ...body, days: 30 })).status, 400);
  assert.equal((await C.kA("POST", "/teacher/teamduels", { ...body, target: { kind: "x", id: "y" } })).status, 400);
  assert.equal((await C.kA("POST", "/teacher/teamduels", { ...body, vs: "nope" })).status, 400);
  /* A group too small to split, or to meet. */
  assert.equal((await C.kB("POST", "/teacher/teamduels", body)).status, 400);
  assert.equal((await C.kA("POST", "/teacher/teamduels", { ...body, vs: "gc" })).status, 400);
  const g = await C.kA("GET", "/teacher/teamduels");
  assert.equal(g.status, 200);
  assert.deepEqual(g.data.others.map((x) => x.id), ["gb"], "only classes big enough are offered; never the own");
});

test("half the class against the other half: even teams, graded by the server, scored on the mean", async () => {
  const r = await C.kA("POST", "/teacher/teamduels", { target: NOUNS, n: 10, days: 2, vs: "split" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const d = (await app.store.teamDuels()).find((x) => x.id === r.data.duel.id);
  assert.equal(d.teams.a.length, 2);
  assert.equal(d.teams.b.length, 2);
  assert.notEqual(teamOf(d, U.a1.id), teamOf(d, U.a2.id), "the two strongest are on different teams");
  assert.equal(r.data.duel.status, "open");
  assert.ok((await app.store.audit()).some((x) => x.act === "setti bekkjareinvígi"));

  /* Each pupil sees it, as a duel to play. */
  const list = await C.a1("GET", "/teamduels");
  const v = list.data.duels.find((x) => x.id === d.id);
  assert.equal(v.team, true);
  assert.equal(v.status, "open");
  assert.equal(v.seed, undefined, "no seed before play");
  assert.equal((await C.b1("GET", "/teamduels")).data.duels.length, 0, "another class's pupil");

  /* Every pupil plays: their own questions, answers graded on the server. */
  const scores = {};
  for (const name of ["a1", "a2", "a3", "a4"]) {
    const st = await C[name]("POST", `/teamduels/${d.id}/start`);
    assert.equal(st.status, 200);
    const side = teamOf(d, U[name].id);
    const tasks = duelTasks(lex(), { ...st.data.duel, topic: "blandad", seed: st.data.seed, key: st.data.key, side }, deps);
    assert.equal(signature(tasks), st.data.sig, "the browser builds what the server will grade");
    /* a1 answers everything right, the others half. */
    const answers = tasks.map((t, i) => {
      const right = Array.isArray(t.answers) && t.answers.length ? { text: t.answers[0] }
        : typeof t.answer === "string" ? { picked: t.answer } : null;
      return name === "a1" || i % 2 === 0 ? right : { text: "xqzw", picked: "xqzw" };
    });
    const expect = tasks.reduce((n, t, i) => n + (answers[i] && judge(t, answers[i]).ok === true ? 1 : 0), 0);
    /* Claiming a score does nothing: only the answers are read. */
    const res = await C[name]("POST", `/teamduels/${d.id}/result`, { answers, sig: st.data.sig, c: 10, n: 10 });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal(res.data.duel.mine.c, expect, name);
    scores[name] = expect;
    assert.equal((await C[name]("POST", `/teamduels/${d.id}/result`, { answers, sig: st.data.sig })).status, 409, "once");
  }
  const after = (await app.store.teamDuels()).find((x) => x.id === d.id);
  const mean = (s) => Math.round((after.teams[s].reduce((a, id) => a + after.res[id].c, 0) / after.teams[s].length) * 10) / 10;
  const now = Date.now();
  assert.equal(teamStatus(after, now), "done");
  const view = (await C.a1("GET", "/teamduels")).data.duels.find((x) => x.id === d.id);
  const side = teamOf(after, U.a1.id), other = side === "a" ? "b" : "a";
  assert.equal(view.us.mean, mean(side));
  assert.equal(view.them.mean, mean(other));
  assert.ok(["w", "l", "t"].includes(view.outcome));
  /* The teacher sees each of their pupils by name. */
  const t = (await C.kA("GET", "/teacher/teamduels")).data.list.find((x) => x.id === d.id);
  assert.equal(t.teams.a.pupils.length + t.teams.b.pupils.length, 4);
  assert.ok(t.winner);
});

test("a wrong signature grades nothing; a pupil who has not pressed play cannot send", async () => {
  const r = await C.kA("POST", "/teacher/teamduels", { target: NOUNS, n: 10, days: 1, vs: "split" });
  const id = r.data.duel.id;
  assert.equal((await C.a1("POST", `/teamduels/${id}/result`, { answers: [], sig: "x.10" })).status, 409, "not started");
  await C.a1("POST", `/teamduels/${id}/start`);
  assert.equal((await C.a1("POST", `/teamduels/${id}/result`, { answers: [], sig: "x.10" })).status, 409, "other questions");
  assert.equal((await C.a1("POST", `/teamduels/${id}/result`, { c: 10 })).status, 400, "a score instead of answers");
  assert.equal((await C.b1("POST", `/teamduels/${id}/start`)).status, 404, "not in it");
  /* Called off by the teacher: gone. */
  assert.equal((await C.kB("DELETE", `/teacher/teamduels/${id}`)).status, 403);
  assert.equal((await C.kA("DELETE", `/teacher/teamduels/${id}`)).status, 204);
  assert.equal((await app.store.teamDuels()).some((x) => x.id === id), false);
});

test("class against class: the other class's teacher must say yes; then both classes play", async () => {
  const r = await C.kA("POST", "/teacher/teamduels", { target: NOUNS, n: 10, days: 7, vs: "gb" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const id = r.data.duel.id;
  assert.equal(r.data.duel.status, "pending");
  assert.equal((await C.a1("POST", `/teamduels/${id}/start`)).status, 404, "nobody plays before the yes");
  /* Only the other class's teacher may accept: not the one who asked, not a pupil. */
  assert.equal((await C.kA("POST", `/teacher/teamduels/${id}/accept`)).status, 403);
  assert.equal((await C.b1("POST", `/teacher/teamduels/${id}/accept`)).status, 403);
  const seen = (await C.kB("GET", "/teacher/teamduels")).data.list.find((x) => x.id === id);
  assert.equal(seen.canAccept, true);
  assert.equal(seen.teams.a.pupils, null, "teacher B does not see class A's names");
  const ok = await C.kB("POST", `/teacher/teamduels/${id}/accept`);
  assert.equal(ok.status, 200);
  assert.equal(ok.data.duel.status, "open");
  const d = (await app.store.teamDuels()).find((x) => x.id === id);
  assert.deepEqual(new Set(d.teams.b), new Set([U.b1.id, U.b2.id]));
  assert.equal(d.teams.a.length, 4);
  assert.ok(d.deadline > Date.now() + 6 * DAY);
  assert.equal((await C.b1("GET", "/teamduels")).data.duels[0].opponent.name, "8. A");
  assert.equal((await C.kB("POST", `/teacher/teamduels/${id}/accept`)).status, 409, "once");
  /* The administrator teaches both: no yes needed. */
  const adm = await C.admin("POST", "/teacher/teamduels", { group: "ga", target: NOUNS, n: 10, days: 1, vs: "gb" });
  assert.equal(adm.data.duel.status, "open");
});

test("a pupil's team duels are in their own export, and go with their account", async () => {
  const exp = await C.a3("GET", "/account/export");
  assert.ok(Array.isArray(exp.data.teamDuels) && exp.data.teamDuels.length > 0);
  assert.ok(!JSON.stringify(exp.data.teamDuels).includes("seed"));
  await app.store.eraseUser(U.a3.id);
  const left = JSON.stringify(await app.store.teamDuels());
  assert.ok(!left.includes(U.a3.id), "the erased pupil is still in a team duel");
  const all = await app.store.exportAll();
  assert.ok(Array.isArray(all.teamDuels), "team duels are in the backup");
});

test("the limit of open team duels per group", async () => {
  const now = Date.now();
  const list = await app.store.teamDuels();
  const open = openCount(prune(list, now), "ga", now);
  for (let k = open; k < TEAM.maxOpen; k++) {
    /* A challenge waiting for a yes counts as open, too. */
    assert.equal((await C.kA("POST", "/teacher/teamduels", { target: NOUNS, n: 10, days: 1, vs: "gb" })).status, 200);
  }
  assert.equal((await C.kA("POST", "/teacher/teamduels", { target: NOUNS, n: 10, days: 1, vs: "gb" })).status, 409);
});
