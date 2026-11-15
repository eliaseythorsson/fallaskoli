/* The web server, tested through real HTTP requests.
 *
 * Not by calling the functions from inside: the route, the cookie, the rights
 * and the status codes are what can break, and they are only visible from
 * outside. The server is started on port 0 (the operating system picks a free
 * one) and the data goes into a temporary folder that is deleted afterwards, so
 * the test never touches real data.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server/server.mjs";
import { blankState } from "../src/js/core/state.js";

let base, dir, app;

before(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "fallaskoli-"));
  /* Open registration is the pre-v6.3 behaviour (anybody may ask, and waits).
     The default — invitation required — has its own tests in accounts.test.js. */
  app = createApp({ dataDir: dir, secureCookies: false,
    env: { FALLASKOLI_OPEN_REGISTRATION: "1" } });
  await app.store.init();
  await new Promise((r) => app.server.listen(0, r));
  base = "http://127.0.0.1:" + app.server.address().port;
});

after(async () => {
  await new Promise((r) => app.server.close(r));
  await fs.rm(dir, { recursive: true, force: true });
});

/* A small client that remembers the cookie, the way a browser does. */
function client() {
  let cookie = null;
  return async function call(method, p, body) {
    const r = await fetch(base + p, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "manual",
    });
    const set = r.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const text = await r.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: r.status, data };
  };
}

/** Notandi beint í geymsluna — jafngildir `admin.mjs nyr`. */
async function makeUser(username, role = "learner", status = "active") {
  const { hashPassword, newId } = await import("../server/auth.mjs");
  const { salt, hash } = await hashPassword("lykilordid-mitt");
  let user;
  await app.store.updateUsers((users) => {
    /* Shown on the board and consented, as a user who has said yes to both —
       the tests here are about what the board DOES with visible people. */
    user = { id: newId(), username, name: username, role, status, salt, hash,
      share: { board: true, minutes: true },
      consent: { by: "self", over16: true, at: new Date().toISOString(), how: "admin" } };
    users.push(user);
    return users;
  });
  return user;
}

test("registration yields pending, not access", async () => {
  const c = client();
  const reg = await c("POST", "/auth/register",
    { username: "nyr", password: "langtlykilord", over16: true, consent: true });
  assert.equal(reg.status, 200);
  assert.equal(reg.data.status, "pending");

  const login = await c("POST", "/auth/login",
    { username: "nyr", password: "langtlykilord" });
  assert.equal(login.status, 403, "pending-notandi komst inn");
  assert.equal(login.data.status, "pending");
});

test("a weak password is stopped on the server, not just in the browser", async () => {
  const c = client();
  const r = await c("POST", "/auth/register", { username: "veikur", password: "123" });
  assert.equal(r.status, 400);
});

test("a wrong password and an unknown name give the same answer", async () => {
  await makeUser("kata");
  const a = await client()("POST", "/auth/login", { username: "kata", password: "vitlaust123" });
  const b = await client()("POST", "/auth/login", { username: "ekkitil", password: "vitlaust123" });
  assert.equal(a.status, 401);
  assert.equal(b.status, 401);
  assert.deepEqual(a.data, b.data, "the answers must not be distinguishable — otherwise the names can be enumerated");
});

test("logging in sets a cookie and /auth/me answers", async () => {
  const u = await makeUser("jon");
  const c = client();
  const login = await c("POST", "/auth/login", { username: "jon", password: "lykilordid-mitt" });
  assert.equal(login.status, 200);
  assert.equal(login.data.profile.id, u.id);
  assert.equal(login.data.profile.role, "learner");
  assert.equal(login.data.profile.hash, undefined, "a password hash left the server");

  const me = await c("GET", "/auth/me");
  assert.equal(me.status, 200);
  assert.equal(me.data.profile.username, "jon");
  assert.equal(me.data.rights.canAdminUsers, false);
});

test("a child reads and writes only its own state", async () => {
  const a = await makeUser("barn-a");
  const b = await makeUser("barn-b");
  const ca = client();
  await ca("POST", "/auth/login", { username: "barn-a", password: "lykilordid-mitt" });

  const S = { ...blankState(), xp: 120 };
  assert.equal((await ca("PUT", `/state/${a.id}`, S)).status, 200);
  assert.equal((await ca("GET", `/state/${a.id}`)).data.xp, 120);

  const stolen = await ca("PUT", `/state/${b.id}`, S);
  assert.equal(stolen.status, 403, "a child overwrote another child's state");
  assert.equal((await ca("GET", `/state/${b.id}`)).status, 403);
});

test("somebody not logged in gets nowhere", async () => {
  const c = client();
  assert.equal((await c("GET", "/auth/me")).status, 401);
  assert.equal((await c("GET", "/leaderboard")).status, 401);
  assert.equal((await c("GET", "/admin/users")).status, 401);
});

test("the leaderboard orders and sends nothing the child wrote", async () => {
  const hi = await makeUser("stig-ha");
  const lo = await makeUser("stig-lag");
  await app.store.putState(hi.id, { ...blankState(), xp: 900 });
  await app.store.putState(lo.id, { ...blankState(), xp: 10 });

  const c = client();
  await c("POST", "/auth/login", { username: "stig-ha", password: "lykilordid-mitt" });
  const r = await c("GET", "/leaderboard?metric=xp");
  assert.equal(r.status, 200);
  const names = r.data.map((x) => x.name);
  assert.ok(names.indexOf("stig-ha") < names.indexOf("stig-lag"), "the ordering is not by XP");

  const card = r.data[0];
  for (const forbidden of ["days", "words", "answers", "badgesDates", "sess"])
    assert.equal(card[forbidden] === undefined || typeof card[forbidden] === "number", true,
      "unexpected field in the leaderboard: " + forbidden);
  assert.equal(card.badgeIds, undefined, "the badge list went out without being asked for");
});

test("the weekly board, the roster's shelf and last week's result", async () => {
  const { weekKey, prevWeekKey } = await import("../src/js/core/social.js");
  const week = weekKey(new Date()), last = prevWeekKey(week);
  const mk = async (name, thisWeek, lastWeek, badges = {}) => {
    const u = await makeUser(name);
    await app.store.putState(u.id, {
      ...blankState(), xp: 5000, badges,
      days: { [week]: { a: 1, c: 1, xp: thisWeek }, [last]: { a: 1, c: 1, xp: lastWeek } },
      showcase: ["s_night", "all_badges"], title: "badge:s_night",
    });
    return u;
  };
  const first = (date) => ({ n: 1, dates: [date], first: date, last: date });
  const a = await mk("vika-a", 10, 300, { s_night: first("2026-01-02"), run5: { ...first(week), n: 12 } });
  const b = await mk("vika-b", 80, 200, { s_night: first("2026-02-02") });
  const c3 = await mk("vika-c", 40, 100);

  const c = client();
  await c("POST", "/auth/login", { username: "vika-a", password: "lykilordid-mitt" });

  /* The default metric is the week, and it ranks by this week alone. */
  const board = (await c("GET", "/leaderboard")).data.filter((r) => r.name.startsWith("vika-"));
  assert.deepEqual(board.map((r) => r.name), ["vika-b", "vika-c", "vika-a"]);
  assert.equal(board[0].metric, "week");
  assert.equal(board[0].value, 80);
  assert.equal(board[0].newIds, undefined, "the feed belongs to the roster, not the board");

  const roster = (await c("GET", "/roster")).data;
  const ra = roster.find((r) => r.profile === a.id), rb = roster.find((r) => r.profile === b.id);
  assert.equal(ra.title, "badge:s_night");
  assert.deepEqual(ra.showcase, ["s_night"], "a pinned badge the child does not hold went out");
  assert.deepEqual(ra.tiers, { run5: 2 });
  assert.deepEqual(ra.newIds, ["run5"], "only the badge first won this week is new");
  assert.ok(ra.firstIds.includes("s_night") && !rb.firstIds.includes("s_night"));
  assert.equal(/"\d{4}-\d{2}-\d{2}"/.test(JSON.stringify(roster)), false, "a date left the server in the roster");

  /* Last week: a had the most. Ids and a head count, no scores. */
  assert.equal((await client()("GET", "/social")).status, 401);
  const soc = (await c("GET", "/social")).data;
  assert.equal(soc.week, week);
  assert.equal(soc.lastWeek.week, last);
  assert.deepEqual(soc.lastWeek.champions, [a.id]);
  assert.ok(soc.lastWeek.players >= 3);
  assert.deepEqual(Object.keys(soc.lastWeek).sort(), ["champions", "players", "podium", "week"]);

  /* Hidden from the board means hidden from all of it. */
  await app.store.setHidden([a.id]);
  const after = (await c("GET", "/social")).data;
  assert.ok(!after.lastWeek.champions.includes(a.id), "a hidden child was announced as champion");
  assert.ok(!(await c("GET", "/roster")).data.some((r) => r.profile === a.id));
  await app.store.setHidden([]);
  void c3;
});

test("a blocked user disappears from the leaderboard but loses nothing", async () => {
  const u = await makeUser("lokadur");
  await app.store.putState(u.id, { ...blankState(), xp: 5000 });
  await app.store.updateUsers((users) => {
    users.find((x) => x.username === "lokadur").status = "blocked";
    return users;
  });
  const c = client();
  await c("POST", "/auth/login", { username: "stig-ha", password: "lykilordid-mitt" });
  const r = await c("GET", "/leaderboard");
  assert.equal(r.data.some((x) => x.name === "lokadur"), false);
  assert.ok((await app.store.state(u.id)).xp === 5000, "the progress was deleted on blocking");
});

test("rarity reports itself unmeasurable and states both thresholds", async () => {
  const c = client();
  await c("POST", "/auth/login", { username: "stig-ha", password: "lykilordid-mitt" });
  const r = await c("GET", "/badges/stats");
  assert.equal(r.status, 200);
  assert.equal(typeof r.data.users, "number");
  assert.equal(typeof r.data.qualified, "number");
  assert.equal(typeof r.data.measurable, "boolean");
  assert.equal(r.data.measurable, false, "the test data is far below the threshold");
  /* Both numbers go out, because the interface tells the child what is
     missing: ten users who have each used the site for ten days. */
  assert.equal(r.data.minUsers, 10);
  assert.equal(r.data.minDays, 10);
  assert.ok(r.data.qualified <= r.data.users);
});

test("only an administrator sees users and admits them", async () => {
  const admin = await makeUser("umsjon", "admin");
  const pending = await makeUser("bidur", "learner", "pending");

  const learner = client();
  await learner("POST", "/auth/login", { username: "jon", password: "lykilordid-mitt" });
  assert.equal((await learner("GET", "/admin/users")).status, 403);

  const c = client();
  await c("POST", "/auth/login", { username: "umsjon", password: "lykilordid-mitt" });
  const list = await c("GET", "/admin/users");
  assert.equal(list.status, 200);
  assert.ok(list.data.some((u) => u.username === "bidur"));
  assert.equal(list.data.every((u) => u.hash === undefined), true, "a password hash in the user list");

  const open = await c("POST", `/admin/users/${pending.id}`, { status: "active" });
  assert.equal(open.status, 200);
  assert.equal(open.data.user.status, "active");

  const now = await client()("POST", "/auth/login",
    { username: "bidur", password: "lykilordid-mitt" });
  assert.equal(now.status, 200, "an approved user could not get in");
  assert.ok(admin.id);
});

test("an administrator cannot lock themselves out", async () => {
  const users = await app.store.users();
  const admin = users.find((u) => u.role === "admin");
  const c = client();
  await c("POST", "/auth/login", { username: "umsjon", password: "lykilordid-mitt" });
  assert.equal((await c("POST", `/admin/users/${admin.id}`, { status: "blocked" })).status, 400);
  assert.equal((await c("POST", `/admin/users/${admin.id}`, { role: "learner" })).status, 400);
  assert.equal((await c("DELETE", `/admin/users/${admin.id}`)).status, 400);
});

test("the data set goes up in one piece and the status is visible", async () => {
  const c = client();
  await c("POST", "/auth/login", { username: "umsjon", password: "lykilordid-mitt" });

  const before = await c("GET", "/admin/dataset");
  assert.equal(before.data.uploaded, false);

  const up = await c("PUT", "/admin/dataset", {
    name: "ÍNO-útdráttur", source: "ÍNO",
    entries: {
      7181: { def: "karlmaður sem laðast að körlum", lemma: "hommi", cls: "kk" },
      9999: { def: "tími dagsins eftir sólsetur", lemma: "kvöld", example: "gott kvöld", cls: "hk" },
      478812: { def: "dreifa fræi, sáðkorni, í jörð", lemma: "sá", cls: "so" },
      1: { ekkert: true },                       // should be omitted
    },
  });
  assert.equal(up.status, 200);
  assert.equal(up.data.count, 3, "a malformed entry was counted");
  assert.equal(up.data.uploaded, true);

  const after = await c("GET", "/admin/dataset");
  assert.equal(after.data.count, 3);
  assert.ok(after.data.at, "no date on the upload");

  const d = await c("GET", "/definitions?bin_id=9999");
  assert.equal(d.status, 200);
  assert.equal(d.data.example, "gott kvöld");
  const byLemma = await c("GET", "/definitions?lemma=hommi&cls=kk");
  assert.equal(byLemma.status, 200);
  assert.equal((await c("GET", "/definitions?bin_id=404404")).status, 404);

  /* v5.8 — the *sá* fault, at the endpoint this time.
   *
   * The lemma fallback is the one route by which a definition can reach a word
   * of another class: one lemma, two word classes, one entry. It is now refused
   * unless the class agrees, and refused outright for an entry that does not
   * say what class it is — which is exactly what a file written by the old
   * tools/ino.mjs looks like. */
  assert.equal((await c("GET", "/definitions?lemma=sá&cls=fn")).status, 404,
    "the verb sá was handed to the pronoun sá");
  assert.equal((await c("GET", "/definitions?lemma=sá&cls=so")).status, 200);
  assert.equal((await c("GET", "/definitions?bin_id=478812&cls=fn")).status, 404,
    "a bin_id hit with the wrong class was served anyway");
});

test("the curriculum ceiling is the administrator's and only the administrator's", async () => {
  const admin = client();
  await admin("POST", "/auth/login", { username: "umsjon", password: "lykilordid-mitt" });
  const child = client();
  await child("POST", "/auth/login", { username: "jon", password: "lykilordid-mitt" });

  /* A child may read the ceiling that applies to them, and may not set one. */
  assert.equal((await child("GET", "/policy")).status, 200);
  assert.equal((await child("PUT", "/admin/policy", { policy: {} })).status, 403);

  const set = await admin("PUT", "/admin/policy", {
    policy: { attrs: { fall: { EF: false } }, levels: { 5: false }, junk: 1 },
  });
  assert.equal(set.status, 200);
  assert.deepEqual(set.data.policy.attrs, { fall: { EF: false } });
  assert.equal(set.data.policy.junk, undefined, "unknown keys were stored");

  const mine = await child("GET", "/policy");
  assert.equal(mine.data.policy.attrs.fall.EF, false);
  assert.equal(mine.data.own, false, "a default was reported as the child's own");

  /* A ceiling for one child overrides the default for that child alone. */
  const users = (await admin("GET", "/admin/users")).data;
  const jon = users.find((u) => u.username === "jon");
  await admin("PUT", `/admin/users/${jon.id}/policy`, { policy: { types: { fill: false } } });
  const now = await child("GET", "/policy");
  assert.equal(now.data.own, true);
  assert.equal(now.data.policy.types.fill, false);
  assert.equal(now.data.policy.attrs.fall, undefined, "the default leaked through");

  /* And the child cannot raise it by editing their own saved progress. */
  await child("PUT", `/state/${jon.id}`, { xp: 1, allowed: { types: {} } });
  const saved = (await child("GET", `/state/${jon.id}`)).data;
  assert.equal(saved.allowed.types.fill, false,
    "a child rewrote their own ceiling through the state");

  /* Removing it hands them back to the default. */
  await admin("PUT", `/admin/users/${jon.id}/policy`, { policy: null });
  const back = await child("GET", "/policy");
  assert.equal(back.data.own, false);
  assert.equal(back.data.policy.attrs.fall.EF, false);
});

test("a child may not upload a data set", async () => {
  const c = client();
  await c("POST", "/auth/login", { username: "jon", password: "lykilordid-mitt" });
  assert.equal((await c("PUT", "/admin/dataset", { entries: { 1: { def: "x" } } })).status, 403);
});

test("útskráning ógildir lotuna", async () => {
  const c = client();
  await c("POST", "/auth/login", { username: "jon", password: "lykilordid-mitt" });
  assert.equal((await c("GET", "/auth/me")).status, 200);
  await c("POST", "/auth/logout");
  assert.equal((await c("GET", "/auth/me")).status, 401);
});

test("Google login says plainly that it is unconfigured", async () => {
  const r = await client()("GET", "/auth/google");
  assert.equal(r.status, 501);
  assert.match(r.data.error, /Google/);
});

test("too many attempts are stopped", async () => {
  const c = client();
  let last = null;
  for (let i = 0; i < 12; i++)
    last = await c("POST", "/auth/login", { username: "jon", password: "rangtrangtrangt" });
  assert.equal(last.status, 429, "no limit on guesses");
});

/* ---------- `Secure` on the session cookie -------------------------------
 *
 * Every test above builds the app with `secureCookies: false`, and so does
 * `tools/server-test.mjs`. That is convenient — and it is exactly why nobody
 * noticed that the flag the REAL server uses was broken for the whole of §1.5
 * of docs/SERVER.md: the cookie went out with `Secure` on `http://localhost`,
 * Safari discarded it without a word, the page reloaded, `/auth/me` found no
 * cookie, and the owner was looking at an empty login form having typed the
 * right password. A green build said nothing about it, because the green build
 * never once ran the code path the owner runs.
 *
 * So these tests use the DEFAULT, on a second server with its own data.
 * The rule being pinned: `Secure` follows the evidence of TLS in front of the
 * request, and nothing else. This process never speaks TLS itself.
 */

const secureCase = async (opts, headers = {}) => {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), "fallaskoli-sec-"));
  const a = createApp({ dataDir: d, ...opts });
  await a.store.init();
  const { hashPassword, newId } = await import("../server/auth.mjs");
  const { salt, hash } = await hashPassword("lykilordid-mitt");
  await a.store.updateUsers((users) => {
    users.push({ id: newId(), username: "jon", name: "jon", role: "learner",
      status: "active", salt, hash });
    return users;
  });
  await new Promise((r) => a.server.listen(0, r));
  const url = "http://127.0.0.1:" + a.server.address().port + "/auth/login";
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ username: "jon", password: "lykilordid-mitt" }),
  });
  const set = r.headers.get("set-cookie") || "";
  await new Promise((res) => a.server.close(res));
  await fs.rm(d, { recursive: true, force: true });
  assert.equal(r.status, 200, "innskráningin sjálf brást");
  assert.match(set, /^fallaskoli=[0-9a-f]{64}/, "no session cookie at all");
  return /;\s*Secure/i.test(set);
};

test("plain http and no proxy: the cookie is NOT marked Secure", async () => {
  /* This is the owner on a laptop, §1.5. A Secure cookie here is not stored by
     Safari, so marking it Secure does not protect the login — it prevents it. */
  assert.equal(await secureCase({ env: {} }), false);
});

test("the proxy says https: the cookie IS marked Secure", async () => {
  /* This is Caddy in §2.7, which is where the flag has to be right. */
  assert.equal(
    await secureCase({ env: {} }, { "X-Forwarded-Proto": "https" }), true);
  assert.equal(
    await secureCase({ env: {} }, { Forwarded: "proto=https" }), true);
  assert.equal(
    await secureCase({ env: {} }, { "X-Forwarded-Ssl": "on" }), true);
});

test("the proxy says http: the cookie is not marked Secure", async () => {
  assert.equal(
    await secureCase({ env: {} }, { "X-Forwarded-Proto": "http" }), false);
});

test("FALLASKOLI_FORCE_SECURE overrides, for a proxy that says nothing", async () => {
  assert.equal(
    await secureCase({ env: { FALLASKOLI_FORCE_SECURE: "1" } }), true);
});

test("FALLASKOLI_INSECURE=1 still wins over everything", async () => {
  assert.equal(
    await secureCase({ secureCookies: false, env: { FALLASKOLI_FORCE_SECURE: "1" } },
      { "X-Forwarded-Proto": "https" }), false);
});

/* ---------- the handover from guessed rarity to measured rarity ----------
 *
 * The owner: *"I really worry about the rarity function on the badges. We have
 * decided that it will update when enough users have used the app … Can you
 * verify that this procedure, the transition from our guessed levels of rarity
 * to true levels of rarity, actually works?"*
 *
 * These tests take a real server up to the threshold one user at a time and
 * watch it cross. Nothing is mocked: real states go into the real store and the
 * real endpoint adds them up.
 */

/** A state with `days` active days, holding `badges`. */
function seedState(days, badges) {
  const S = blankState();
  for (let i = 0; i < days; i++) {
    const k = `2026-03-${String(i + 1).padStart(2, "0")}`;
    S.days[k] = { a: 5, c: 4, xp: 10, ms: 0, nw: 0, sk: {}, g: 10 };
  }
  badges.forEach((id) => { S.badges[id] = { n: 1, dates: [], first: "2026-03-01", last: "2026-03-01" }; });
  return S;
}

test("nine qualified users is a guess; the tenth makes it a measurement", async () => {
  /* A server of its own, so the users above do not count towards the threshold
     and this test says what it looks like it says. */
  const d2 = await fs.mkdtemp(path.join(os.tmpdir(), "fallaskoli-rar-"));
  const a2 = createApp({ dataDir: d2, secureCookies: false, env: {} });
  await a2.store.init();
  await new Promise((r) => a2.server.listen(0, r));
  const b2 = "http://127.0.0.1:" + a2.server.address().port;

  const { hashPassword, newId } = await import("../server/auth.mjs");
  const add = async (n, days, badges) => {
    const { salt, hash } = await hashPassword("lykilordid-mitt");
    const id = newId();
    await a2.store.updateUsers((users) => {
      users.push({ id, username: n, name: n, role: "learner", status: "active", salt, hash });
      return users;
    });
    await a2.store.putState(id, seedState(days, badges));
    return id;
  };

  const ask = async () => {
    const r = await fetch(b2 + "/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "u1", password: "lykilordid-mitt" }),
      redirect: "manual",
    });
    const cookie = (r.headers.get("set-cookie") || "").split(";")[0];
    const s = await fetch(b2 + "/badges/stats", { headers: { Cookie: cookie } });
    return s.json();
  };

  try {
    /* Nine users with twelve active days each. Four of them hold `run5`. */
    for (let i = 1; i <= 9; i++) await add("u" + i, 12, i <= 4 ? ["run5"] : []);
    let s = await ask();
    assert.equal(s.qualified, 9);
    assert.equal(s.measurable, false, "nine is not ten");

    /* A tenth user who signed up yesterday changes nothing: the day count is
       what qualifies, not the head count. This is the trap the whole rule
       exists to avoid. */
    await add("u10", 1, ["run5"]);
    s = await ask();
    assert.equal(s.users, 10);
    assert.equal(s.qualified, 9);
    assert.equal(s.measurable, false, "ten users but nine qualified — still a guess");

    /* An eleventh who HAS used it for long enough tips it over. */
    await add("u11", 15, []);
    s = await ask();
    assert.equal(s.qualified, 10);
    assert.equal(s.measurable, true, "ten qualified users and it is still guessing");

    /* And the share is over the qualified users only: 4 of 10, not 4 of 11 and
       not 5 of 11 (u10 holds the badge but does not qualify). */
    assert.equal(s.badges.run5, 4);
    assert.equal(s.badges.run5 / s.qualified, 0.4);

    /* The monthly record exists the moment the measurement does. */
    const hist = await a2.store.rarityHistory();
    assert.equal(hist.length, 1, "one snapshot for this calendar month");
    assert.match(hist[0].month, /^\d{4}-\d{2}$/);
    assert.equal(hist[0].qualified, 10);
    assert.ok(s.nextRefresh > s.refreshedAt, "the next refresh is in the future");
  } finally {
    await new Promise((r) => a2.server.close(r));
    await fs.rm(d2, { recursive: true, force: true });
  }
});

test("the monthly record keeps one row per month and compares against the last", async () => {
  const d3 = await fs.mkdtemp(path.join(os.tmpdir(), "fallaskoli-hist-"));
  const a3 = createApp({ dataDir: d3, secureCookies: false, env: {} });
  await a3.store.init();
  try {
    /* Two asks in the same month must not become two rows. */
    await a3.store.appendRarity({ month: "2026-07", at: "2026-07-01T00:00:00Z", users: 12, qualified: 11, badges: { run5: 5 } });
    await a3.store.appendRarity({ month: "2026-07", at: "2026-07-20T00:00:00Z", users: 14, qualified: 13, badges: { run5: 6 } });
    let h = await a3.store.rarityHistory();
    assert.equal(h.length, 1, "the month is the key");
    assert.equal(h[0].qualified, 13, "the last ask of the month is the one that stands");

    await a3.store.appendRarity({ month: "2026-08", at: "2026-08-01T00:00:00Z", users: 15, qualified: 14, badges: { run5: 6 } });
    h = await a3.store.rarityHistory();
    assert.deepEqual(h.map((x) => x.month), ["2026-07", "2026-08"], "and they stay in order");

    /* Two years and no more. */
    for (let i = 0; i < 40; i++)
      await a3.store.appendRarity({ month: `20${30 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`, at: "x", users: 1, qualified: 1, badges: {} });
    h = await a3.store.rarityHistory();
    assert.equal(h.length, 24, "the record is bounded");
  } finally {
    await fs.rm(d3, { recursive: true, force: true });
  }
});


/* ================= the probe: is there a server here at all? ============ */

import { createServer } from "../src/js/core/server.js";

const fakeFetch = (status, type, body) => async () => ({
  ok: status >= 200 && status < 300, status,
  headers: { get: (k) => (k.toLowerCase() === "content-type" ? type : null) },
  json: async () => JSON.parse(body),
});

test("a static host (404 page, HTML) means: no server, run locally", async () => {
  const s = createServer("", { fetchImpl: fakeFetch(404, "text/html", "<html>") });
  assert.deepEqual(await s.probe(), { server: false });
});

test("a network failure means: no server", async () => {
  const s = createServer("", { fetchImpl: async () => { throw new Error("offline"); } });
  assert.deepEqual(await s.probe(), { server: false });
});

test("a Fallaskóli server answers 401 in JSON when nobody is logged in", async () => {
  const s = createServer("", { fetchImpl: fakeFetch(401, "application/json", '{"error":"x"}') });
  assert.deepEqual(await s.probe(), { server: true, me: null });
});

test("and 200 with a profile when somebody is", async () => {
  const s = createServer("", { fetchImpl: fakeFetch(200, "application/json; charset=utf-8",
    '{"profile":{"id":"u1","name":"Jón"},"rights":{}}') });
  const r = await s.probe();
  assert.equal(r.server, true);
  assert.equal(r.me.profile.id, "u1");
});
