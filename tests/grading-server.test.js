/* The server's grader routes (issue #48; server/grading.mjs).

   GET /grader and POST /grader/read, through the real HTTP server, with the
   text reader's FAKE plug (server/reader-fake.mjs) and the browser's own
   client and loop (core/server.js, control/serverask.js). No network beyond
   this machine.

   - only a pupil the administrator switched on may have a text read, and only
     the switch on their OWN ceiling counts (docs/adr/0004);
   - what comes back is findings, never a verdict or XP (docs/adr/0002);
   - the text is forgotten: no file under the data folder and no log line
     holds it afterwards (docs/adr/0003). */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server/server.mjs";
import { hashPassword, newId } from "../server/auth.mjs";
import { fakePlug } from "../server/reader-fake.mjs";
import { fault } from "../server/reader.mjs";
import { GRADER } from "../server/grading.mjs";
import { createServer } from "../src/js/core/server.js";
import { serverQuestion, serverReader } from "../src/js/control/serverask.js";
import { blankState, newSession } from "../src/js/core/state.js";
import { settle } from "../src/js/core/answer.js";

const PW = "lykilordid-mitt";
const MARK = "HESTURLEYND93";       // in the pupil's answer, and nowhere after

let base, dir, app;
const logged = [];
const consoleWas = {};
let mode = "ok";
const plug = fakePlug({
  answer: (text) => {
    if (mode === "down") throw fault("unavailable");
    /* A plug that tries to say more than findings: the route passes on findings only. */
    return { findings: [{ point: "meaning", met: /dýr/.test(text), ...( /dýr/.test(text) ? { quote: "dýr" } : {}) }],
      verdict: "right", xp: 999 };
  },
});

function client() {
  let cookie = null;
  const fetchImpl = async (url, opts = {}) => {
    const r = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), ...(cookie ? { Cookie: cookie } : {}) } });
    const set = r.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    return r;
  };
  return createServer(base, { fetchImpl });
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

const U = {};
before(async () => {
  for (const k of ["log", "info", "warn", "error"]) {
    consoleWas[k] = console[k];
    console[k] = (...a) => { logged.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")); };
  }
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "fallaskoli-grader-"));
  const html = path.join(dir, "app.html");
  await fs.writeFile(html, "<!DOCTYPE html><title>x</title>");
  app = createApp({ dataDir: path.join(dir, "data"), htmlFile: html, secureCookies: false,
    graderPlugs: { fixture: plug } });
  await app.store.init();
  await new Promise((r) => app.server.listen(0, r));
  base = "http://127.0.0.1:" + app.server.address().port;
  U.on = await makeUser("sol");
  U.off = await makeUser("mani");
  /* The administrator's per-pupil switch, and a default that tries to switch
     it on for everybody (it never counts: server.mjs `ceilingFor`). */
  await app.store.updatePolicies((p) => ({ ...p, [U.on.id]: { serverGrading: true }, "*": { serverGrading: true } }));
});

after(async () => {
  Object.assign(console, consoleWas);
  await new Promise((r) => app.server.close(r));
  await fs.rm(dir, { recursive: true, force: true });
});

test("only the pupil switched on has the grader up, and may have a text read", async () => {
  const on = client(); await on.login("sol", PW);
  const off = client(); await off.login("mani", PW);
  assert.deepEqual(await on.grader(), { up: true });
  assert.deepEqual(await off.grader(), { up: false }, "the default's switch is not lent");
  await assert.rejects(off.graderRead("fixture", "Hestur er dýr", null), (e) => e.status === 403 && e.data.fault === "off");
  await assert.rejects(client().grader(), (e) => e.status === 401);
  await assert.rejects(on.graderRead("ekki-til", "Hestur er dýr", null), (e) => e.data.fault === "off");
  await assert.rejects(on.graderRead("fixture", "x".repeat(GRADER.maxChars + 1), null), (e) => e.data.fault === "failed");
});

test("findings come back, and nothing else: no verdict, no XP", async () => {
  const on = client(); await on.login("sol", PW);
  const out = await on.graderRead("fixture", "Hestur er dýr", { word: "hestur" });
  assert.deepEqual(Object.keys(out), ["findings"]);
  assert.deepEqual(out.findings, [{ point: "meaning", met: true, quote: "dýr", start: 10, end: 13 }]);
});

test("the whole loop over HTTP: judged in the browser, settled once", async () => {
  const on = client(); await on.login("sol", PW);
  const task = { type: "meaning", typeId: "fixture_server", grader: "server", skill: "ordaford",
    word: "hestur|kk", base: 10, read: { kind: "fixture", context: { word: "hestur" } },
    rubric: { main: "meaning", points: [{ id: "meaning", label: "Merkingin", ask: "Hvað er hestur?" }] } };
  const S = blankState(); const sess = newSession(S);
  const q = serverQuestion(task, { read: serverReader(on), pupil: { S, sess } });
  const first = await q.send({ text: `Hann hleypur ${MARK}` });
  assert.equal(first.pending, "revise");
  const j = await q.send({ text: `Hestur er dýr ${MARK}` });
  assert.equal(j.verdict, "right");
  assert.ok(settle(S, sess, task, j));
  mode = "down";
  const q2 = serverQuestion(task, { read: serverReader(on), pupil: { S, sess } });
  const nj = await q2.send({ text: `Hestur er dýr ${MARK}` });
  mode = "ok";
  assert.equal(nj.verdict, "notjudged");
});

test("the text is forgotten: no file and no log line holds it", async () => {
  const hits = [];
  const walk = async (d) => {
    for (const e of await fs.readdir(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else if ((await fs.readFile(p, "utf8").catch(() => "")).includes(MARK)) hits.push(p);
    }
  };
  await walk(dir);
  assert.deepEqual(hits, []);
  assert.deepEqual(logged.filter((l) => l.includes(MARK)), []);
});
