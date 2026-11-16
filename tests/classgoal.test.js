/* v6.13, item 59 — a goal the class reaches together.
 *
 * What these hold: the goal's rules (core/classgoal.js), the one badge for
 * everybody, the bar's HTML, and on the server WHO may set it (the group's
 * guardian, the administrator; nobody else) and WHAT anybody gets back
 * (totals — no id, no name, no per-pupil figure; nothing at all in a group of
 * fewer than five). Real HTTP, like tests/teacher.test.js. */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server/server.mjs";
import { hashPassword, newId } from "../server/auth.mjs";
import { blankState, newSession, badgeContext } from "../src/js/core/state.js";
import { CLASS_GOAL, cleanGoal, cleanGoals, withGoal, goalFor, weekCorrect, weekSessions,
         progressOf, goalText, progressText, percentOf, GOAL_OPTIONS, goalWeekOf }
  from "../src/js/core/classgoal.js";
import { checkBadges, badgeById, ACTIVE_BADGES } from "../src/js/core/badges.js";
import { socialContext, weekKey, prevWeekKey } from "../src/js/core/social.js";
import { addDays } from "../src/js/core/review.js";
import { classGoalHTML } from "../src/js/ui/classgoal.js";
import { goalCardHTML } from "../src/js/ui/teacher.js";
import { PRIVACY_VERSION, CALIBRATION_NOTICE } from "../server/privacy.mjs";

const MON = "2026-11-16";                 // a Monday
const LAST = addDays(MON, -7);

/** A state with right answers on given days and sessions of given sizes. */
function st({ c = {}, runs = [] } = {}) {
  const S = blankState();
  for (const [d, n] of Object.entries(c)) S.days[d] = { a: n, c: n, xp: 0 };
  S.runs = runs.map(([d, n]) => ({ at: 0, d, topic: "x", n, c: n, j: n, xp: 0, top: [] }));
  return S;
}

/* ---------- the rules ------------------------------------------------------- */

test("only the goals on offer are accepted", () => {
  assert.deepEqual(cleanGoal({ kind: "rett", n: 2000 }), { kind: "rett", n: 2000 });
  assert.deepEqual(cleanGoal({ kind: "lotur", n: "3" }), { kind: "lotur", n: 3 });
  for (const bad of [null, {}, { kind: "rett", n: 1999 }, { kind: "lotur", n: 6 },
    { kind: "xp", n: 500 }, { kind: "rett", n: -200 }, ["rett", 200]]) {
    assert.equal(cleanGoal(bad), null, JSON.stringify(bad));
  }
  assert.equal(GOAL_OPTIONS.length, CLASS_GOAL.sizes.rett.length + CLASS_GOAL.sizes.lotur.length);
});

test("a goal holds from its Monday until changed; a second change that week replaces the first", () => {
  let list = withGoal([], { kind: "rett", n: 500 }, LAST);
  assert.deepEqual(goalFor(list, LAST), { kind: "rett", n: 500 });
  assert.deepEqual(goalFor(list, MON), { kind: "rett", n: 500 }, "it carries into the next week");
  assert.equal(goalFor(list, addDays(LAST, -7)), null, "not before it was set");
  list = withGoal(list, { kind: "lotur", n: 2 }, MON);
  list = withGoal(list, { kind: "lotur", n: 3 }, MON);
  assert.equal(list.length, 2);
  assert.deepEqual(goalFor(list, MON), { kind: "lotur", n: 3 });
  assert.deepEqual(goalFor(list, LAST), { kind: "rett", n: 500 }, "last week's is still known");
  list = withGoal(list, null, addDays(MON, 7));
  assert.equal(goalFor(list, addDays(MON, 7)), null, "removed");
  assert.deepEqual(goalFor(list, MON), { kind: "lotur", n: 3 });
  /* Only the last few are kept, and junk is dropped. */
  for (let i = 1; i <= 6; i++) list = withGoal(list, { kind: "rett", n: 200 }, addDays(MON, 7 * (i + 1)));
  assert.equal(list.length, CLASS_GOAL.keep);
  assert.deepEqual(cleanGoals([{ kind: "rett", n: 7, from: MON }, { kind: "off", from: "x" }, 5, null]), []);
});

test("what one state puts in: right answers of the week, sessions of ten or more", () => {
  const S = st({
    c: { [addDays(MON, -1)]: 50, [MON]: 12, [addDays(MON, 6)]: 8, [addDays(MON, 7)]: 99 },
    runs: [[MON, 10], [addDays(MON, 2), 9], [addDays(MON, 3), 20], [addDays(MON, -1), 10]],
  });
  assert.equal(weekCorrect(S, MON), 20);
  assert.equal(weekSessions(S, MON), 2, "a session stopped after nine questions does not count");
  assert.equal(weekCorrect(null, MON), 0);
  assert.equal(weekSessions({}, MON), 0);
});

test("progress: the sum for right answers; for sessions how many got there; nothing below five", () => {
  const a = st({ c: { [MON]: 300 }, runs: [[MON, 10], [MON, 10], [MON, 15]] });
  const b = st({ c: { [addDays(MON, 1)]: 150 }, runs: [[MON, 10]] });
  const c = null;                                                // never practised
  const five = [a, b, c, null, st()];
  const rett = progressOf({ kind: "rett", n: 500 }, five, MON);
  assert.deepEqual(rett, { kind: "rett", n: 500, done: 450, target: 500, met: false, small: false });
  assert.equal(percentOf(rett), 90);
  assert.equal(progressOf({ kind: "rett", n: 200 }, five, MON).met, true);
  const lotur = progressOf({ kind: "lotur", n: 3 }, five, MON);
  assert.deepEqual(lotur, { kind: "lotur", n: 3, done: 1, target: 5, met: false, small: false });
  assert.equal(progressOf({ kind: "lotur", n: 1 }, [a, b, a, b, a], MON).met, true);
  const small = progressOf({ kind: "rett", n: 200 }, [a, b, a, b], MON);
  assert.equal(small.small, true);
  assert.equal(small.done, 0, "four learners: no total");
  assert.equal(small.met, false);
  assert.equal(progressText(small), "");
  assert.equal(progressOf(null, five, MON), null);
});

test("the words: every number reads right, nothing agrees with a count", () => {
  assert.equal(goalText({ kind: "rett", n: 2000 }), "2.000 rétt svör saman");
  assert.equal(goalText({ kind: "lotur", n: 1 }), "Allir ljúka einni lotu");
  assert.equal(goalText({ kind: "lotur", n: 3 }), "Allir ljúka þremur lotum");
  assert.deepEqual(CLASS_GOAL.sizes.lotur.map((n) => goalText({ kind: "lotur", n })), [
    "Allir ljúka einni lotu", "Allir ljúka tveimur lotum", "Allir ljúka þremur lotum",
    "Allir ljúka fjórum lotum", "Allir ljúka fimm lotum"]);
  assert.equal(progressText({ kind: "rett", n: 2000, done: 1234, target: 2000 }),
    "Rétt svör hópsins í vikunni: 1.234 af 2.000.");
  assert.equal(progressText({ kind: "lotur", n: 3, done: 1, target: 21 }),
    "Nemendur sem hafa lokið þremur lotum í vikunni: 1 af 21.");
});

/* ---------- the badge ---------------------------------------------------------- */

test("the badge: owed this week when the bar is full, else last week's if met; learners only", () => {
  const full = { week: MON, member: true, progress: { met: true }, last: null };
  assert.equal(goalWeekOf(full), MON);
  assert.equal(goalWeekOf({ ...full, progress: { met: false }, last: { week: LAST, met: true } }), LAST);
  assert.equal(goalWeekOf({ ...full, progress: { met: false }, last: { week: LAST, met: false } }), null);
  assert.equal(goalWeekOf({ ...full, member: false }), null, "the teacher sees the bar, not the badge");
  assert.equal(goalWeekOf(null), null);
});

test("everybody in the group wins it once per week met, on the board or not", () => {
  const b = badgeById("soc_classgoal");
  assert.ok(b && !b.retired && b.social && b.when === "social" && !b.hidden);
  assert.ok(ACTIVE_BADGES.includes(b));
  const judge = (S, goal, periods) => {
    /* No roster, no board: a pupil who keeps off the board. */
    const { ctx } = socialContext({ me: "p1", goal, week: MON });
    return checkBadges({ ...badgeContext(S, newSession(S)), when: "social", social: ctx },
      S.badges, {}, [b], periods).map((x) => x.id);
  };
  const S = blankState();
  const periods = {};
  const goal = { week: MON, member: true, progress: { met: true }, last: null };
  assert.deepEqual(judge(S, goal, periods), ["soc_classgoal"]);
  S.badges.soc_classgoal = { n: 1 };
  assert.deepEqual(judge(S, goal, periods), [], "the same week again: nothing");
  const next = { week: addDays(MON, 7), member: true, progress: { met: true }, last: { week: MON, met: true } };
  assert.deepEqual(judge(S, next, periods), ["soc_classgoal"], "next week, met again: once more");
  assert.deepEqual(judge(blankState(), { ...goal, progress: { met: false } }, {}), []);
  assert.deepEqual(judge(blankState(), null, {}), []);
});

/* ---------- the HTML ------------------------------------------------------------ */

test("the bar in Skólastofan: the goal, the total, a progressbar; nothing without a goal", () => {
  const status = { week: MON, member: true, goal: { kind: "rett", n: 2000 },
    progress: { kind: "rett", n: 2000, done: 500, target: 2000, met: false, small: false }, last: null };
  const html = classGoalHTML(status);
  assert.match(html, /Markmið vikunnar/);
  assert.match(html, /2\.000 rétt svör saman/);
  assert.match(html, /role="progressbar"[^>]*aria-valuemax="2000"[^>]*aria-valuenow="500"/s);
  assert.match(html, /width:25%/);
  assert.match(html, /Saman í mark/);
  assert.match(classGoalHTML({ ...status, progress: { ...status.progress, done: 2100, met: true } }), /náð!/);
  assert.match(classGoalHTML({ ...status, last: { week: LAST, met: true } }), /náði markmiðinu í síðustu viku/);
  assert.equal(classGoalHTML({ ...status, goal: null, progress: null }), "");
  assert.equal(classGoalHTML({ ...status, progress: { ...status.progress, small: true } }), "");
  assert.equal(classGoalHTML(null), "");
});

test("the teacher's card: the choices, the current goal, and why a small group gets none", () => {
  const info = { pupils: 12, goal: { kind: "lotur", n: 3 },
    progress: { kind: "lotur", n: 3, done: 4, target: 12, met: false, small: false } };
  const html = goalCardHTML(info);
  assert.match(html, /<option value="lotur:3" selected>Allir ljúka þremur lotum<\/option>/);
  assert.match(html, /4 af 12/);
  assert.match(html, /id="tc-goal-off"/);
  assert.match(html, /líka þeir sem eru ekki á stigatöflunni/);
  const small = goalCardHTML({ pupils: 2, goal: null, progress: null });
  assert.doesNotMatch(small, /tc-goal-set/);
  assert.match(small, /að minnsta kosti 5 nemendur/);
});

/* ---------- the server ------------------------------------------------------------ */

let base, dir, app;
const PW = "lykilordid-mitt";
const day = () => new Date().toISOString().slice(0, 10);

before(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "fallaskoli-goal-"));
  const html = path.join(dir, "app.html");
  await fs.writeFile(html, "<!DOCTYPE html><title>x</title>");
  app = createApp({ dataDir: path.join(dir, "data"), htmlFile: html, secureCookies: false,
    env: { FALLASKOLI_CONTROLLER: "Prófari", FALLASKOLI_CONTACT: "p@example.is" } });
  await app.store.init();
  await new Promise((r) => app.server.listen(0, r));
  base = "http://127.0.0.1:" + app.server.address().port;
  await setup();
});

after(async () => {
  await new Promise((r) => app.server.close(r));
  await fs.rm(dir, { recursive: true, force: true });
});

function client() {
  let cookie = null;
  const call = async (method, p, body) => {
    const r = await fetch(base + p, {
      method,
      headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = r.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const text = await r.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: r.status, data, text };
  };
  call.login = async (username) => {
    const r = await call("POST", "/auth/login", { username, password: PW });
    assert.equal(r.status, 200, `${username} could not log in`);
    return call;
  };
  return call;
}

async function makeUser(username, extra = {}) {
  const { salt, hash } = await hashPassword(PW);
  let user;
  await app.store.updateUsers((users) => {
    user = { id: newId(), username, name: username, role: "learner", status: "active",
      group: "default", salt, hash, created: new Date().toISOString(), lastSeen: day(),
      share: { board: false, minutes: false },
      consent: { by: "self", over16: true, at: new Date().toISOString(), how: "admin" }, ...extra };
    users.push(user);
    return users;
  });
  return user;
}

const U = {}, C = {};
const WEEK = weekKey(new Date());
const PREV = prevWeekKey(WEEK);

async function setup() {
  await app.store.updateGroups(() => ({ ga: { name: "Bekkur A" }, gb: { name: "Bekkur B" },
    gc: { name: "Fjölskylda" } }));
  U.admin = await makeUser("stjori", { role: "admin", consent: undefined });
  U.kennA = await makeUser("kennari-a", { role: "guardian", group: "ga", consent: undefined });
  U.kennB = await makeUser("kennari-b", { role: "guardian", group: "gb", consent: undefined });
  U.kennC = await makeUser("kennari-c", { role: "guardian", group: "gc", consent: undefined });
  /* Group A: five active learners — one on the board, four not — and three
     who must not count. */
  U.anna = await makeUser("anna", { group: "ga", name: "Anna", share: { board: true, minutes: false } });
  U.bjarni = await makeUser("bjarni", { group: "ga", name: "Bjarni" });
  U.dora = await makeUser("dora", { group: "ga", name: "Dóra" });
  U.eir = await makeUser("eir", { group: "ga", name: "Eir" });
  U.fannar = await makeUser("fannar", { group: "ga", name: "Fannar" });
  U.bidur = await makeUser("bidur", { group: "ga", status: "pending" });
  U.lokad = await makeUser("lokad", { group: "ga", status: "blocked" });
  U.grunur = await makeUser("grunur", { group: "ga", review: { at: new Date().toISOString(), why: "test" } });
  U.cecilia = await makeUser("cecilia", { group: "gb", name: "Cecilía" });
  U.einn = await makeUser("einn", { group: "gc" });
  U.tveir = await makeUser("tveir", { group: "gc" });

  await app.store.putState(U.anna.id, st({ c: { [WEEK]: 300, [PREV]: 400 }, runs: [[WEEK, 10]] }));
  await app.store.putState(U.bjarni.id, st({ c: { [WEEK]: 150 }, runs: [[WEEK, 10]] }));
  /* dora has never practised. The two who do not count have a great deal. */
  await app.store.putState(U.bidur.id, st({ c: { [WEEK]: 5000 } }));
  await app.store.putState(U.lokad.id, st({ c: { [WEEK]: 5000 } }));
  await app.store.putState(U.grunur.id, st({ c: { [WEEK]: 5000 } }));      // held for review
  await app.store.putState(U.cecilia.id, st({ c: { [WEEK]: 5000 } }));

  C.anon = client();
  C.admin = await client().login("stjori");
  C.kennA = await client().login("kennari-a");
  C.kennB = await client().login("kennari-b");
  C.kennC = await client().login("kennari-c");
  C.anna = await client().login("anna");
  C.bjarni = await client().login("bjarni");
  C.cecilia = await client().login("cecilia");
}

test("no goal yet: everybody gets an empty status", async () => {
  const r = await C.anna("GET", "/classgoal");
  assert.equal(r.status, 200);
  assert.deepEqual(r.data, { week: WEEK, goal: null, progress: null, last: null, member: true });
  assert.equal((await C.anon("GET", "/classgoal")).status, 401);
});

test("only the group's guardian or the administrator sets it", async () => {
  const body = { group: "ga", kind: "rett", n: 500 };
  assert.equal((await C.anon("POST", "/teacher/classgoal", body)).status, 401);
  assert.equal((await C.anna("POST", "/teacher/classgoal", body)).status, 403, "a pupil");
  assert.equal((await C.kennB("POST", "/teacher/classgoal", body)).status, 403, "another group's guardian");
  assert.equal((await C.kennB("GET", "/teacher/classgoal?group=ga")).status, 403);
  assert.equal((await C.kennB("DELETE", "/teacher/classgoal?group=ga")).status, 403);
  assert.equal((await C.kennA("POST", "/teacher/classgoal", { ...body, n: 499 })).status, 400);
  assert.equal((await C.kennA("POST", "/teacher/classgoal", { ...body, kind: "xp" })).status, 400);
  const r = await C.kennA("POST", "/teacher/classgoal", body);
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.goal, { kind: "rett", n: 500 });
  /* Kept on the group's record, without anybody's id. */
  const g = (await app.store.groups()).ga;
  assert.equal(g.name, "Bekkur A");
  assert.deepEqual(g.goals, [{ kind: "rett", n: 500, from: WEEK }]);
  const trail = await app.store.audit();
  assert.ok(trail.some((x) => x.by === U.kennA.id && x.act === "setti markmið hópsins"));
  /* The administrator, for any group. */
  assert.equal((await C.admin("POST", "/teacher/classgoal", { group: "gb", kind: "lotur", n: 1 })).status, 409,
    "group B has one learner: too few");
});

test("the pupils see the total of every active learner — on the board or not — and nothing else", async () => {
  const r = await C.bjarni("GET", "/classgoal");
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.progress,
    { kind: "rett", n: 500, done: 450, target: 500, met: false, small: false },
    "anna 300 + bjarni 150 + dora, eir, fannar 0; not the pending, blocked, held-for-review or other group's thousands");
  assert.equal(r.data.member, true);
  const text = r.text;
  for (const u of [U.anna, U.bjarni, U.dora, U.eir, U.fannar, U.kennA])
    assert.ok(!text.includes(u.id) && !text.includes(u.name) && !text.includes(u.username), u.username);
  assert.ok(!text.includes("300") && !text.includes("150"), "no pupil's own figure");
  /* The teacher sees the same total, and is not owed the badge. */
  const t = await C.kennA("GET", "/classgoal");
  assert.equal(t.data.member, false);
  assert.equal(t.data.progress.done, 450);
  const tv = await C.kennA("GET", "/teacher/classgoal");
  assert.equal(tv.data.pupils, 5);
  assert.deepEqual(tv.data.limits.sizes, CLASS_GOAL.sizes);
  /* Another group sees none of it. */
  assert.equal((await C.cecilia("GET", "/classgoal")).data.goal, null);
});

test("the bar fills; changing the goal the same week replaces it; removing it empties the bar", async () => {
  const r = await C.kennA("POST", "/teacher/classgoal", { kind: "rett", n: 200 });   // default group: their own
  assert.equal(r.data.progress.met, true);
  assert.equal((await C.anna("GET", "/classgoal")).data.progress.met, true);
  assert.equal((await app.store.groups()).ga.goals.length, 1, "the same week: replaced, not added");
  const lotur = await C.kennA("POST", "/teacher/classgoal", { group: "ga", kind: "lotur", n: 1 });
  assert.deepEqual(lotur.data.progress, { kind: "lotur", n: 1, done: 2, target: 5, met: false, small: false },
    "dora, eir and fannar have finished no session");
  const off = await C.kennA("DELETE", "/teacher/classgoal?group=ga");
  assert.equal(off.status, 200);
  assert.equal(off.data.goal, null);
  assert.equal((await C.anna("GET", "/classgoal")).data.goal, null);
  const trail = await app.store.audit();
  assert.ok(trail.some((x) => x.by === U.kennA.id && x.act === "fjarlægði markmið hópsins"));
});

test("last week's goal: only whether it was met, so the badge comes on Monday", async () => {
  await app.store.updateGroups((g) => {
    g.ga.goals = [{ kind: "rett", n: 200, from: PREV }, { kind: "off", from: WEEK }];
    return g;
  });
  const r = await C.bjarni("GET", "/classgoal");
  assert.equal(r.data.goal, null);
  assert.deepEqual(r.data.last, { week: PREV, met: true }, "anna's 400 last week");
  assert.ok(!r.text.includes("400"));
  assert.equal(goalWeekOf(r.data), PREV);
});

test("a group of two: no goal can be set and nothing is shown", async () => {
  const r = await C.kennC("POST", "/teacher/classgoal", { kind: "rett", n: 200 });
  assert.equal(r.status, 409);
  assert.match(r.data.error, /að minnsta kosti 5 nemendur/);
  /* Even a goal that got onto the record (a pupil left) shows nothing. */
  await app.store.updateGroups((g) => { g.gc.goals = [{ kind: "rett", n: 200, from: WEEK }]; return g; });
  const t = await C.kennC("GET", "/teacher/classgoal");
  assert.equal(t.data.progress.small, true);
  assert.equal(t.data.progress.done, 0);
});

test("renaming a group keeps its goal", async () => {
  await app.store.updateGroups((g) => { g.gb.goals = [{ kind: "rett", n: 200, from: WEEK }]; return g; });
  assert.equal((await C.admin("POST", "/admin/groups/gb", { name: "Bekkur B2" })).status, 200);
  assert.equal((await app.store.groups()).gb.goals.length, 1);
});

test("the privacy notice says the group sees one total, and the version moved", async () => {
  const r = await C.anon("GET", "/personuvernd");
  assert.match(r.text, /sameiginlegt markmið/);
  assert.match(r.text, /Enginn sér hvað þú lagðir til/);
  assert.match(r.text, new RegExp(`færri en\\s+${CLASS_GOAL.minPupils} nemendum`));
  assert.ok(PRIVACY_VERSION > "2026-11-11", "a new recipient: newer than v6.12's notice");
  assert.ok(CALIBRATION_NOTICE <= PRIVACY_VERSION);
  assert.ok(r.text.includes(`Síðast breytt ${PRIVACY_VERSION}`));
});
