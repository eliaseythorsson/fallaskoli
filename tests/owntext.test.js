/* "The pupil's own text" (issue #49, ADR 0003; core/slices.js `ownText`).

   A slice marked `ownText: true` holds text the pupil wrote in their own
   words (the Orðakort word cards, #15/#18). It leaves the pupil's account only
   for their own syncing, their own export, and grading they ask for from the
   screen. It never reaches a classmate's, guardian's, teacher's or
   administrator's screen, the leaderboard, the roster, the badge statistics
   or any log; it is erased with the account.

   No real slice holds such text yet. This test adds a FIXTURE slice to the
   list, saves a pupil's progress carrying a marker in it through the real
   route, and then calls every server route that reads other pupils' progress
   as a classmate, a guardian and an administrator: the marker must not be in
   any answer, any log line or any file but the pupil's own progress.

   The last test counts the places in server/ that read progress
   (`stateRec`, `allStates`, `store.state`). A new one fails it until the
   route that uses it is called here. */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../server/server.mjs";
import { hashPassword, newId } from "../server/auth.mjs";
import { SLICES, checkSlices, ownTextKeys, withoutOwnText, keepOwnText } from "../src/js/core/slices.js";
import { migrate } from "../src/js/core/state.js";
import { mergeStates } from "../src/js/core/merge.js";
import { cleanState } from "../server/guard.mjs";
import { fullProgress } from "./fixtures/full-progress.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PW = "lykilordid-mitt";
const MARK = "LEYNIORD7c1f";          // in the pupil's own text, and nowhere else
const KEY = "ownTextFixture";

/* A slice as a word-card slice would be: { word: the pupil's explanation }. */
const str = (x) => (typeof x === "string" && x.length <= 200 ? x : null);
const cards = (raw) => Object.fromEntries(Object.entries(raw && typeof raw === "object" ? raw : {})
  .filter(([k, v]) => k.length <= 80 && str(v)).slice(0, 50));
const FIXTURE_SLICE = {
  key: KEY,
  blank: () => ({}),
  migrate: (raw) => cards(raw),
  merge: (base, local, remote) => ({ ...cards(remote), ...cards(local) }),
  clean: (value) => cards(value),
  ownText: true,
};
const CARDS = { "hestur|kk": `Dýr sem maður ríður á ${MARK}` };

let base, dir, app;
const logged = [];
const consoleWas = {};
const U = {};

function client() {
  let cookie = null;
  const call = async (method, p, body) => {
    const r = await fetch(base + p, {
      method,
      headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "manual",
    });
    const set = r.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const text = await r.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: r.status, data, text: text + JSON.stringify([...r.headers]) };
  };
  call.login = async (username) => {
    const r = await call("POST", "/auth/login", { username, password: PW });
    assert.equal(r.status, 200, `${username} could not log in`);
    return call;
  };
  return call;
}

async function makeUser(username, role = "learner") {
  const { salt, hash } = await hashPassword(PW);
  let user;
  await app.store.updateUsers((users) => {
    user = { id: newId(), username, name: username, role, status: "active", group: "default", salt, hash,
      created: new Date().toISOString(), share: { board: true, minutes: true },
      consent: { by: "self", over16: true, at: new Date().toISOString(), how: "admin" } };
    users.push(user);
    return users;
  });
  return user;
}

/** Every file under the data folder, but the pupil's own progress. */
async function filesHolding(mark, except = null) {
  const hits = [];
  const walk = async (d) => {
    for (const e of await fs.readdir(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else if (p !== except && (await fs.readFile(p, "utf8").catch(() => "")).includes(mark)) hits.push(path.relative(dir, p));
    }
  };
  await walk(dir);
  return hits;
}

before(async () => {
  SLICES.push(FIXTURE_SLICE);
  checkSlices();
  for (const k of ["log", "info", "warn", "error"]) {
    consoleWas[k] = console[k];
    console[k] = (...a) => { logged.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")); };
  }
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "fallaskoli-owntext-"));
  const html = path.join(dir, "app.html");
  await fs.writeFile(html, "<!DOCTYPE html><title>x</title>");
  app = createApp({ dataDir: path.join(dir, "data"), htmlFile: html, secureCookies: false,
    env: { FALLASKOLI_CONTROLLER: "Prófari", FALLASKOLI_CONTACT: "p@example.is" } });
  await app.store.init();
  await new Promise((r) => app.server.listen(0, r));
  base = "http://127.0.0.1:" + app.server.address().port;

  U.pupil = await makeUser("sol");
  for (const n of ["mani", "bjort", "dagur", "ari"]) U[n] = await makeUser(n);
  U.guardian = await makeUser("kennari", "guardian");
  U.admin = await makeUser("umsjon", "admin");
});

after(async () => {
  Object.assign(console, consoleWas);
  SLICES.splice(SLICES.indexOf(FIXTURE_SLICE), 1);
  await new Promise((r) => app.server.close(r));
  await fs.rm(dir, { recursive: true, force: true });
});

test("the fixture slice goes through migrate, merge and the server's check like any other", () => {
  assert.deepEqual(ownTextKeys(), [KEY]);
  const S = { ...fullProgress(), [KEY]: CARDS };
  assert.deepEqual(migrate(S)[KEY], CARDS);
  assert.deepEqual(mergeStates(null, migrate(S), migrate(fullProgress()))[KEY], CARDS);
  assert.deepEqual(cleanState(S)[KEY], CARDS);
  const shown = withoutOwnText(S);
  assert.equal(KEY in shown, false);
  assert.equal(KEY in S, true, "withoutOwnText must not change what it is given");
  assert.deepEqual(keepOwnText({ xp: 1, [KEY]: { x: "other" } }, S)[KEY], CARDS);
  assert.deepEqual(keepOwnText({ xp: 1 }, null)[KEY], {});
});

test("the pupil's own text reaches the pupil, and nobody else", async () => {
  const pupil = await client().login("sol");
  const id = U.pupil.id;
  const put = await pupil("PUT", `/state/${id}`, { ...fullProgress(), [KEY]: CARDS });
  assert.equal(put.status, 200, put.text);

  /* Not vacuous: it was stored, and the pupil gets it back — synced, and in
     their own export. */
  assert.ok((await pupil("GET", `/state/${id}`)).text.includes(MARK), "the pupil's own copy lost the text");
  assert.ok((await pupil("GET", "/account/export")).text.includes(MARK), "the pupil's own export lost the text");

  const mani = await client().login("mani");
  const kennari = await client().login("kennari");
  const umsjon = await client().login("umsjon");
  const bjort = await client().login("bjort");
  await bjort("PUT", `/state/${U.bjort.id}`, fullProgress());

  /* Things that make the routes below read progress: an assignment, a class
     goal, a duel, a team duel, a live round. */
  const due = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const made = [
    await kennari("POST", "/teacher/assignments", { target: { kind: "pattern", id: "thf_thgf" }, n: 10, due }),
    await kennari("POST", "/teacher/classgoal", { group: "default", kind: "rett", n: 500 }),
    await kennari("POST", "/teacher/live", { target: { kind: "node", id: "no-beyging" }, n: 5, secs: 30, replace: true }),
    await kennari("POST", "/teacher/teamduels", { target: { kind: "node", id: "no-beyging" }, n: 10, days: 2, vs: "split" }),
    await mani("POST", "/duels", { opponent: id, topic: "lysingarord", n: 10 }),
    await pupil("POST", "/duels", { opponent: U.bjort.id, topic: "lysingarord", n: 10 }),
  ];
  for (const r of made) assert.equal(r.status, 200, r.text);

  const as = { mani, kennari, umsjon };
  const calls = [
    /* A classmate. */
    ["mani", "GET", "/leaderboard"], ["mani", "GET", "/leaderboard?include=badges"],
    ["mani", "GET", "/leaderboard?metric=xp"], ["mani", "GET", "/leaderboard?metric=minutes"],
    ["mani", "GET", "/roster"], ["mani", "GET", "/social"], ["mani", "GET", "/badges/stats"],
    ["mani", "GET", "/badges/history"], ["mani", "GET", "/duels"], ["mani", "GET", "/classgoal"],
    ["mani", "GET", "/teamduels"], ["mani", "GET", "/assignments"], ["mani", "GET", "/live"],
    ["mani", "GET", `/state/${id}`],
    /* A guardian of the pupil's group. */
    ["kennari", "GET", "/teacher/groups"], ["kennari", "GET", "/teacher/patterns"],
    ["kennari", "GET", "/teacher/patterns.csv"], ["kennari", "GET", `/teacher/skillmap?pupil=${id}`],
    ["kennari", "GET", "/teacher/assignments"], ["kennari", "GET", "/teacher/classgoal"],
    ["kennari", "GET", "/teacher/live"], ["kennari", "GET", "/teacher/teamduels"],
    ["kennari", "GET", "/teacher/writing"], ["kennari", "GET", "/teacher/samples"],
    ["kennari", "GET", "/leaderboard"], ["kennari", "GET", "/roster"], ["kennari", "GET", `/state/${id}`],
    ["kennari", "POST", "/teacher/live", { target: { kind: "node", id: "no-beyging" }, n: 5, secs: 30, replace: true }],
    /* The administrator: may read and write a pupil's progress, and answers
       access requests — still without the pupil's own text. */
    ["umsjon", "GET", `/state/${id}`], ["umsjon", "GET", `/admin/users/${id}/export`],
    ["umsjon", "GET", "/admin/users"], ["umsjon", "GET", "/admin/audit"], ["umsjon", "GET", "/admin/leaderboard"],
    ["umsjon", "GET", "/admin/calibration"], ["umsjon", "GET", "/admin/reports"],
    ["umsjon", "GET", `/teacher/skillmap?pupil=${id}`], ["umsjon", "GET", "/teacher/patterns?group=default"],
  ];
  const leaks = [], refused = [];
  for (const [who, method, p, body] of calls) {
    const r = await as[who](method, p, body);
    if (r.text.includes(MARK)) leaks.push(`${who} ${method} ${p}`);
    if (r.status >= 500) refused.push(`${who} ${method} ${p} → ${r.status}`);
  }
  assert.deepEqual(refused, []);
  assert.deepEqual(leaks, [], "the pupil's own text reached somebody else");

  /* These must have answered with what they read, or the test proves nothing. */
  assert.equal((await umsjon("GET", `/state/${id}`)).status, 200);
  assert.equal((await umsjon("GET", `/admin/users/${id}/export`)).status, 200);
  assert.equal((await mani("GET", "/leaderboard")).data.length, 2);
  assert.equal((await kennari("GET", `/teacher/skillmap?pupil=${id}`)).status, 200);

  /* An administrator's write can neither replace nor erase it. */
  const adminCopy = (await umsjon("GET", `/state/${id}`));
  const w1 = await umsjon("PUT", `/state/${id}`, adminCopy.data);
  assert.equal(w1.status, 200, w1.text);
  assert.ok((await pupil("GET", `/state/${id}`)).text.includes(MARK), "an administrator's write erased the pupil's text");
  const w2 = await umsjon("PUT", `/state/${id}`, { ...adminCopy.data, [KEY]: { "hestur|kk": "skrifað af öðrum" } });
  assert.equal(w2.status, 200, w2.text);
  const after = await pupil("GET", `/state/${id}`);
  assert.deepEqual(after.data[KEY], CARDS, "an administrator's write replaced the pupil's text");

  /* No log line, no file but the pupil's own progress. */
  assert.deepEqual(logged.filter((l) => l.includes(MARK)), [], "a log line carried the pupil's text");
  const own = (await fs.readdir(path.join(dir, "data"), { recursive: true }))
    .map((f) => path.join(dir, "data", f)).filter((f) => f.includes(id) && f.endsWith(".json"));
  assert.equal(own.length, 1, "where is the pupil's progress file? " + own.join(", "));
  assert.deepEqual(await filesHolding(MARK, own[0]), [], "a file other than the pupil's progress holds the text");
});

test("it is erased with the account", async () => {
  const pupil = await client().login("sol");
  const r = await pupil("POST", "/account/delete", { password: PW });
  assert.ok(r.status < 300, r.text);
  assert.equal(await app.store.state(U.pupil.id), null);
  assert.deepEqual(await filesHolding(MARK), [], "the pupil's text outlived the account");
});

test("every place in server/ that reads progress is called by the test above", () => {
  /* file → how many times it reads somebody's progress. A change here means a
     route was added or changed: call it in the test above, as whoever may
     use it, then update the count. */
  const KNOWN = {
    "server/server.mjs": 8,      // dossier (both exports), GET and PUT /state, visibleStates (board,
                                 // roster, social, duels), rarity (/badges/stats), POST /duels,
                                 // pupilsOf (patterns, assignments), /teacher/skillmap
    "server/guard.mjs": 1,       // /health: the size of the largest file, no content (#44)
    "server/classgoal.mjs": 1,   // GET /classgoal, /teacher/classgoal
    "server/live.mjs": 1,        // POST /teacher/live
    "server/teamduel.mjs": 1,    // POST /teacher/teamduels and its accept
  };
  const found = {};
  for (const f of fsSync.readdirSync(path.join(ROOT, "server")).filter((x) => x.endsWith(".mjs") && x !== "store.mjs")) {
    const src = fsSync.readFileSync(path.join(ROOT, "server", f), "utf8");
    const n = (src.match(/\.stateRec\(|\.allStates\(|store\.state\(/g) || []).length;
    if (n) found["server/" + f] = n;
  }
  assert.deepEqual(found, KNOWN,
    "a place that reads pupils' progress was added or removed in server/: call its route in tests/owntext.test.js, then update KNOWN");
});
