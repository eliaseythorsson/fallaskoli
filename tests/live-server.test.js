/* A live class round (critique item 64), on the server: through real HTTP
 * requests and real event streams, as tests/teacher.test.js does.
 *
 * WHO may run a round, join one and answer; that the SERVER grades, with
 * `judge`, whatever the browser claims; the clock (an injected one, so no
 * test waits half a minute); reconnects and late joiners; and the limits
 * that keep the memory bounded. The scoring rules themselves are in
 * tests/live.test.js. */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server/server.mjs";
import { hashPassword, newId } from "../server/auth.mjs";
import { judge } from "../src/js/core/answer.js";
import { LIVE } from "../src/js/core/live.js";

const PW = "lykilordid-mitt";
const day = () => new Date().toISOString().slice(0, 10);
const clock = { t: Date.now(), now() { return this.t; } };
const NODE = { kind: "node", id: "no-beyging" };

/* ---------- a server, its users and clients ---------- */

async function startApp(liveOptions = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "fallaskoli-live-"));
  const html = path.join(dir, "app.html");
  await fs.writeFile(html, "<!DOCTYPE html><title>x</title>");
  const app = createApp({ dataDir: path.join(dir, "data"), htmlFile: html, secureCookies: false,
    env: { FALLASKOLI_CONTROLLER: "Prófari", FALLASKOLI_CONTACT: "p@example.is" }, liveOptions });
  await app.store.init();
  await new Promise((r) => app.server.listen(0, r));
  const ctx = { app, dir, base: "http://127.0.0.1:" + app.server.address().port, U: {}, C: {} };
  await app.store.updateGroups(() => ({ ga: { name: "Bekkur A" }, gb: { name: "Bekkur B" } }));
  return ctx;
}

async function stopApp(ctx) {
  await new Promise((r) => ctx.app.server.close(r));
  await fs.rm(ctx.dir, { recursive: true, force: true });
}

async function makeUser(ctx, username, extra = {}) {
  const { salt, hash } = await hashPassword(PW);
  let user;
  await ctx.app.store.updateUsers((users) => {
    user = { id: newId(), username, name: username, role: "learner", status: "active",
      group: "ga", salt, hash, created: new Date().toISOString(), lastSeen: day(),
      share: { board: true, minutes: false },
      consent: { by: "self", over16: true, at: new Date().toISOString(), how: "admin" }, ...extra };
    users.push(user);
    return users;
  });
  return user;
}

function client(ctx) {
  let cookie = null;
  const call = async (method, p, body) => {
    const r = await fetch(ctx.base + p, {
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
    return { status: r.status, data, headers: r.headers };
  };
  call.login = async (username) => {
    const r = await call("POST", "/auth/login", { username, password: PW });
    assert.equal(r.status, 200, `${username} could not log in`);
    return call;
  };
  /** An event stream, read as a browser's EventSource would. `until(pred)`
      waits for the first state from now on that `pred` accepts. */
  call.events = (p) => {
    const ctrl = new AbortController();
    const got = [];
    let cursor = 0, wake = null, status = null, ended = false, headers = null;
    const poke = () => { if (wake) { const w = wake; wake = null; w(); } };
    let isOpen;
    const opened = new Promise((r) => { isOpen = r; });
    fetch(ctx.base + p, { headers: cookie ? { Cookie: cookie } : {}, signal: ctrl.signal })
      .then(async (r) => {
        status = r.status; headers = r.headers;
        isOpen();
        if (r.status !== 200) { ended = true; poke(); return; }
        const rd = r.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        try {
          for (;;) {
            const { done, value } = await rd.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            let i;
            while ((i = buf.indexOf("\n\n")) >= 0) {
              const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
              const ev = /^event: (.*)$/m.exec(chunk), data = /^data: (.*)$/m.exec(chunk);
              if (ev && data) got.push({ event: ev[1], data: JSON.parse(data[1]) });
            }
            poke();
          }
        } catch { /* aborted */ }
        ended = true; poke();
      }).catch(() => { ended = true; isOpen(); poke(); });
    return {
      get status() { return status; }, get headers() { return headers; }, opened, got,
      async until(pred, what = "a state", ms = 4000) {
        const end = Date.now() + ms;
        for (;;) {
          while (cursor < got.length) {
            const e = got[cursor++];
            if (pred(e.data, e.event)) return e.data;
          }
          if (ended) throw new Error(`stream ended before ${what}`);
          if (Date.now() > end) throw new Error(`no ${what} within ${ms} ms; last: ${JSON.stringify(got.at(-1))}`);
          await new Promise((r) => { wake = r; setTimeout(r, 50); });
        }
      },
      close() { ctrl.abort(); },
    };
  };
  return call;
}

/** A right response to a question that has one written form or one pick. */
function rightOf(task) {
  if (Array.isArray(task.answers) && task.answers.length) return { text: task.answers[0] };
  if (typeof task.answer === "string") return { picked: task.answer };
  return null;
}
function wrongOf(task) {
  return Array.isArray(task.answers) ? { text: "xqzw" } : { picked: "xqzw" };
}

/* ---------- the main server ---------- */

let M;
const streams = [];
const watch = (c, p) => { const s = c.events(p); streams.push(s); return s; };

before(async () => {
  M = await startApp({ clock });
  const { U, C } = M;
  U.admin = await makeUser(M, "stjori", { role: "admin", consent: undefined, group: "default" });
  U.kennA = await makeUser(M, "kennari-a", { role: "guardian", consent: undefined, name: "Kennari A" });
  U.kennB = await makeUser(M, "kennari-b", { role: "guardian", group: "gb", consent: undefined });
  U.anna = await makeUser(M, "anna", { name: "Anna" });
  U.bjarni = await makeUser(M, "bjarni", { name: "Bjarni", share: { board: false } });
  U.dora = await makeUser(M, "dora", { name: "Dóra" });
  U.cecilia = await makeUser(M, "cecilia", { group: "gb", name: "Cecilía" });
  for (const k of Object.keys(U)) C[k] = await client(M).login(U[k].username);
  C.anon = client(M);
});

after(async () => {
  streams.forEach((s) => s.close());
  await stopApp(M);
});

/** Start a round in group A and return its id; any running one is replaced. */
async function start(body = {}) {
  const r = await M.C.kennA("POST", "/teacher/live", { target: NODE, n: 5, secs: 30, replace: true, ...body });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data.round.id;
}

test("only a teacher of the group starts and runs a round", async () => {
  const { C } = M;
  assert.equal((await C.anon("POST", "/teacher/live", { target: NODE })).status, 401);
  assert.equal((await C.anna("POST", "/teacher/live", { target: NODE })).status, 403);
  assert.equal((await C.kennB("POST", "/teacher/live", { group: "ga", target: NODE })).status, 403);
  const id = await start();
  /* Another group's guardian and a pupil can do nothing with it, and learn nothing. */
  for (const act of ["next", "close", "end"]) {
    assert.equal((await C.kennB("POST", `/teacher/live/${id}/${act}`)).status, 403, act);
    assert.equal((await C.anna("POST", `/teacher/live/${id}/${act}`)).status, 403, act);
  }
  const s = C.kennB.events(`/teacher/live/${id}/events`);
  await s.opened;
  assert.equal(s.status, 403);
  /* The administrator may run any group's. */
  const g = await C.admin("GET", "/teacher/live?group=ga");
  assert.equal(g.status, 200);
  assert.equal(g.data.round.id, id);
  assert.deepEqual(g.data.limits.sizes, LIVE.sizes);
});

test("what a teacher may ask for is checked", async () => {
  const { C } = M;
  const bad = [
    { target: { kind: "skill", id: "nope" } },
    { target: NODE, n: 7 },
    { target: NODE, secs: 5 },
    { target: NODE, secs: "30; rm" },
  ];
  for (const b of bad) assert.equal((await C.kennA("POST", "/teacher/live", { replace: true, ...b })).status, 400, JSON.stringify(b));
});

test("a group has one round at a time: a second is refused unless it replaces the first", async () => {
  const { C } = M;
  const id = await start();
  const s = watch(C.anna, `/live/${id}/events`);
  const again = await C.kennA("POST", "/teacher/live", { target: NODE, n: 5, secs: 30 });
  assert.equal(again.status, 409);
  assert.equal(again.data.running, id);
  const id2 = await start();
  assert.notEqual(id2, id);
  /* The old round's screens are told it is gone. */
  await s.until((d, ev) => ev === "end", "the end of the replaced round");
  assert.equal((await C.anna("POST", `/live/${id}/join`)).status, 404);
});

test("pupils of the group join; nobody else can", async () => {
  const { C } = M;
  const id = await start();
  assert.equal((await C.anon("POST", `/live/${id}/join`)).status, 401);
  assert.equal((await C.cecilia("POST", `/live/${id}/join`)).status, 404, "another group's pupil");
  assert.equal((await C.kennA("POST", `/live/${id}/join`)).status, 404, "a teacher does not play");
  assert.equal((await C.cecilia("GET", "/live")).data.round, null);
  assert.equal((await C.kennA("GET", "/live")).data.round, null);
  const mine = await C.anna("GET", "/live");
  assert.equal(mine.data.round.id, id);
  assert.equal(mine.data.round.joined, false);
  const j = await C.anna("POST", `/live/${id}/join`);
  assert.equal(j.status, 200);
  assert.equal(j.data.round.joined, true);
  /* Joining twice is still one player. */
  await C.anna("POST", `/live/${id}/join`);
  assert.equal(M.app.live.rounds.get(id).players.size, 1);
  /* A stream for somebody else's group is refused. */
  const s = C.cecilia.events(`/live/${id}/events`);
  await s.opened;
  assert.equal(s.status, 404);
});

test("a whole round: the same questions for everyone, graded by the server, the board after each, the commonest error at the end", async () => {
  const { C } = M;
  const id = await start({ n: 5 });
  const board = watch(C.kennA, `/teacher/live/${id}/events`);
  const a = watch(C.anna, `/live/${id}/events`);
  const b = watch(C.bjarni, `/live/${id}/events`);
  await board.opened; await a.opened; await b.opened;
  assert.equal(board.headers.get("content-type"), "text/event-stream; charset=utf-8");
  assert.ok(board.headers.get("content-security-policy"), "the stream carries the security headers");
  await C.anna("POST", `/live/${id}/join`);
  await C.bjarni("POST", `/live/${id}/join`);
  await board.until((d) => d.joined === 2, "two players on the board");

  const tasks = M.app.live.rounds.get(id).tasks;
  for (let q = 0; q < 5; q++) {
    assert.equal((await C.kennA("POST", `/teacher/live/${id}/next`)).status, 200);
    const qa = await a.until((d) => d.phase === "open" && d.q === q && d.task, `question ${q} for Anna`);
    const qb = await b.until((d) => d.phase === "open" && d.q === q && d.task, `question ${q} for Bjarni`);
    /* The same question for both — a live round is the one place for that. */
    assert.deepEqual(qa.task, qb.task);
    assert.deepEqual(qa.task, JSON.parse(JSON.stringify(tasks[q])));
    const right = rightOf(qa.task);
    assert.ok(right && judge(qa.task, right).ok === true, `question ${q} has an answer the test can give`);
    clock.t += 3000;
    /* Anna right; Bjarni wrong, and claiming otherwise changes nothing. */
    assert.equal((await C.anna("POST", `/live/${id}/answer`, { q, response: right })).status, 200);
    const said = await C.bjarni("POST", `/live/${id}/answer`, { q, response: { ...wrongOf(qa.task) }, ok: true, points: 999 });
    assert.equal(said.status, 200);
    assert.equal(said.data.correct, undefined, "the verdict waits for the question to close");
    /* Both connected pupils have answered: the question closes by itself. */
    const shown = await board.until((d) => d.phase === "shown" && d.q === q, `the result of ${q}`);
    assert.equal(shown.result.right, 1);
    assert.equal(shown.result.wrong, 1);
    const ra = await a.until((d) => d.phase === "shown" && d.q === q, "Anna's result");
    assert.equal(ra.result.mine.ok, true);
    assert.ok(ra.result.mine.points > LIVE.point && ra.result.mine.points <= LIVE.point + LIVE.bonus);
    const rb = await b.until((d) => d.phase === "shown" && d.q === q, "Bjarni's result");
    assert.deepEqual(rb.result.mine, { ok: false, points: 0 });
    assert.equal(rb.task, undefined, "nobody is sent a question after it closes");
  }
  await C.kennA("POST", `/teacher/live/${id}/next`);
  const end = await board.until((d) => d.phase === "done", "the end");
  assert.equal(end.end.asked, 5);
  assert.equal(end.end.podium[0].name, "Anna");
  assert.equal(end.end.podium[0].right, 5);
  /* Bjarni is not on the leaderboard: his name never reaches the board. */
  assert.ok(!JSON.stringify(end).includes("Bjarni"));
  assert.equal(end.end.podium[1].name, "Leikmaður 2");
  /* Ten wrong noun forms leave a pattern the class can be taught — or, if
     the diagnosis could read none of them, nothing (never "Ógreint"). */
  if (end.end.commonest) {
    assert.notEqual(end.end.commonest.id, "ogreint");
    assert.ok(end.end.commonest.rule);
  }
  const pa = await a.until((d) => d.phase === "done", "Anna's end");
  assert.equal(pa.me.rank, 1);
  assert.equal(pa.me.as, "Anna", "a pupil on the leaderboard is shown by name");
  /* Nothing of the round was written to disk. */
  const files = await fs.readdir(path.join(M.dir, "data"));
  assert.ok(!files.some((f) => /live/i.test(f)), files.join(","));
});

test("an answer is taken once, only to the open question, and not after the clock", async () => {
  const { C } = M;
  const id = await start({ n: 5, secs: 20 });
  await C.anna("POST", `/live/${id}/join`);
  await C.dora("POST", `/live/${id}/join`);
  /* Both connected, so the question waits for both. */
  await watch(C.anna, `/live/${id}/events`).until(() => true, "Anna's stream");
  await watch(C.dora, `/live/${id}/events`).until(() => true, "Dóra's stream");
  /* Before the first question: nothing to answer. */
  assert.equal((await C.anna("POST", `/live/${id}/answer`, { q: 0, response: { text: "x" } })).status, 409);
  await C.kennA("POST", `/teacher/live/${id}/next`);
  const task = M.app.live.rounds.get(id).tasks[0];
  /* Not joined: Bjarni cannot answer. */
  assert.equal((await C.bjarni("POST", `/live/${id}/answer`, { q: 0, response: rightOf(task) })).status, 403);
  /* The wrong question. */
  assert.equal((await C.anna("POST", `/live/${id}/answer`, { q: 1, response: rightOf(task) })).status, 409);
  /* Garbage is an answer, and a wrong one — it cannot stop the round. */
  assert.equal((await C.anna("POST", `/live/${id}/answer`, { q: 0, response: { text: { $gt: "" }, evil: 1 } })).status, 200);
  assert.equal((await C.anna("POST", `/live/${id}/answer`, { q: 0, response: rightOf(task) })).status, 409, "twice");
  const p = M.app.live.rounds.get(id).players.get(M.U.anna.id);
  assert.deepEqual(p.marks[0], { ok: false, points: 0 });
  /* Too big a body is refused before anything is read into the round. */
  const big = await C.dora("POST", `/live/${id}/answer`, { q: 0, response: { text: "x".repeat(5000) } });
  assert.equal(big.status, 413);
  /* The clock runs out; within the grace an answer still counts, after it not. */
  clock.t += 20000 + LIVE.grace - 1;
  assert.equal((await C.dora("POST", `/live/${id}/answer`, { q: 0, response: rightOf(task) })).status, 200);
  const d = M.app.live.rounds.get(id).players.get(M.U.dora.id);
  assert.deepEqual(d.marks[0], { ok: true, points: LIVE.point }, "right at the very end: no bonus, but every point");
});

test("the clock closes a question nobody finished, and a pupil who said nothing has a blank", async () => {
  const { C } = M;
  const id = await start({ n: 5, secs: 20 });
  await C.anna("POST", `/live/${id}/join`);
  await C.dora("POST", `/live/${id}/join`);
  const a = watch(C.anna, `/live/${id}/events`);
  const d = watch(C.dora, `/live/${id}/events`);
  await C.kennA("POST", `/teacher/live/${id}/next`);
  await a.until((x) => x.phase === "open" && x.task, "the question");
  const task = M.app.live.rounds.get(id).tasks[0];
  await C.anna("POST", `/live/${id}/answer`, { q: 0, response: rightOf(task) });
  /* Dóra is connected and has not answered: still open. */
  assert.equal(M.app.live.rounds.get(id).phase, "open");
  clock.t += 20000 + LIVE.grace + 1;
  assert.equal((await C.dora("POST", `/live/${id}/answer`, { q: 0, response: rightOf(task) })).status, 409);
  M.app.live.tick();
  const r = await d.until((x) => x.phase === "shown", "the close");
  assert.equal(r.result.mine, null);
  assert.equal(r.result.none, 1);
  /* The teacher can also close a question before the clock. */
  await C.kennA("POST", `/teacher/live/${id}/next`);
  assert.equal((await C.kennA("POST", `/teacher/live/${id}/close`)).status, 200);
  assert.equal((await C.kennA("POST", `/teacher/live/${id}/close`)).status, 409);
  assert.equal(M.app.live.rounds.get(id).phase, "shown");
});

test("a closed tab is not waited for, a reload sees the round as it is, and a late joiner plays the rest", async () => {
  const { C } = M;
  const id = await start({ n: 5 });
  await C.anna("POST", `/live/${id}/join`);
  await C.bjarni("POST", `/live/${id}/join`);
  const a = watch(C.anna, `/live/${id}/events`);
  const b = C.bjarni.events(`/live/${id}/events`);
  await a.opened; await b.opened;
  await C.kennA("POST", `/teacher/live/${id}/next`);
  await b.until((x) => x.task, "Bjarni's question");
  b.close();                                              // Bjarni closes the tab
  const task = M.app.live.rounds.get(id).tasks[0];
  await C.anna("POST", `/live/${id}/answer`, { q: 0, response: rightOf(task) });
  await a.until((x) => x.phase === "shown", "closed without waiting for the closed tab");

  await C.kennA("POST", `/teacher/live/${id}/next`);
  /* Anna reloads: the new stream's first message is the whole picture. */
  const a2 = watch(C.anna, `/live/${id}/events`);
  const first = await a2.until(() => true, "the first message");
  assert.equal(first.phase, "open");
  assert.equal(first.q, 1);
  assert.equal(first.me.right, 1);
  assert.ok(first.task);

  /* Dóra joins during question 2 of 5 and is sent it at once. */
  const dj = await C.dora("POST", `/live/${id}/join`);
  assert.equal(dj.data.round.q, 1);
  assert.ok(dj.data.round.task, "the open question comes with the join");
  assert.equal(dj.data.round.me.right, 0);
  const d = watch(C.dora, `/live/${id}/events`);
  await d.until((x) => x.task, "Dóra's question");

  await C.anna("POST", `/live/${id}/answer`, { q: 1, response: rightOf(M.app.live.rounds.get(id).tasks[1]) });
  const again = watch(C.anna, `/live/${id}/events`);
  const st = await again.until(() => true, "after answering");
  assert.equal(st.phase, "open", "Dóra is connected and has not answered");
  assert.equal(st.answered, true);
  assert.equal(st.task, undefined, "answered: the question is not sent again");
  await C.dora("POST", `/live/${id}/answer`, { q: 1, response: wrongOf(M.app.live.rounds.get(id).tasks[1]) });
  const end = await d.until((x) => x.phase === "shown", "the result");
  assert.equal(end.me.right, 0);
  assert.equal(end.top.length, 3);
});

test("rounds end by themselves: nobody starts, the teacher leaves, then they are forgotten", async () => {
  const { C } = M;
  const id = await start();
  await C.anna("POST", `/live/${id}/join`);
  const s = watch(C.anna, `/live/${id}/events`);
  clock.t += LIVE.lobbyMs + 1;
  M.app.live.tick();
  const done = await s.until((x) => x.phase === "done", "the end of an unstarted round");
  assert.equal(done.end.asked, 0);
  assert.equal((await C.anna("POST", `/live/${id}/join`)).status, 409);
  clock.t += LIVE.keepMs + 1;
  M.app.live.tick();
  await s.until((x, ev) => ev === "end", "forgotten");
  assert.equal(M.app.live.rounds.has(id), false);
  assert.equal((await C.anna("GET", "/live")).data.round, null);

  const id2 = await start();
  await C.kennA("POST", `/teacher/live/${id2}/next`);
  clock.t += LIVE.idleMs + 1;
  M.app.live.tick();
  assert.equal(M.app.live.rounds.get(id2).phase, "done");
  assert.equal(M.app.live.rounds.get(id2).why, "idle");
});

test("the teacher ends a round; the board shows the questions there were", async () => {
  const { C } = M;
  const id = await start({ n: 5 });
  await C.anna("POST", `/live/${id}/join`);
  await C.kennA("POST", `/teacher/live/${id}/next`);
  const r = await C.kennA("POST", `/teacher/live/${id}/end`);
  assert.equal(r.status, 200);
  assert.equal(r.data.round.phase, "done");
  assert.equal(r.data.round.end.asked, 1);
  assert.equal((await C.kennA("POST", `/teacher/live/${id}/next`)).status, 409);
});

/* ---------- the limits, on a server of their own ---------- */

test("the limits: pupils per round, streams per pupil, streams in all, rounds in all", async () => {
  const S = await startApp({ clock, limits: { maxPupils: 1, perUser: 1, maxStreams: 2, maxRounds: 1 } });
  try {
    await makeUser(S, "kennari-a", { role: "guardian", consent: undefined });
    await makeUser(S, "kennari-b", { role: "guardian", group: "gb", consent: undefined });
    await makeUser(S, "anna"); await makeUser(S, "bjarni");
    const k = await client(S).login("kennari-a"), kb = await client(S).login("kennari-b");
    const a = await client(S).login("anna"), b = await client(S).login("bjarni");
    const r = await k("POST", "/teacher/live", { target: NODE, n: 5, secs: 30 });
    const id = r.data.round.id;
    assert.equal((await kb("POST", "/teacher/live", { target: NODE, n: 5, secs: 30 })).status, 503, "rounds in all");
    assert.equal((await a("POST", `/live/${id}/join`)).status, 200);
    assert.equal((await b("POST", `/live/${id}/join`)).status, 409, "the round is full");
    const s1 = a.events(`/live/${id}/events`);
    await s1.until(() => true, "a first stream");
    const s2 = a.events(`/live/${id}/events`);
    await s2.opened;
    assert.equal(s2.status, 429, "streams per pupil");
    const s3 = k.events(`/teacher/live/${id}/events`);
    await s3.until(() => true, "the board");
    const s4 = b.events(`/live/${id}/events`);
    await s4.opened;
    assert.equal(s4.status, 503, "streams in all");
    assert.equal(S.app.live.streams(), 2);
    s1.close(); s3.close();
    await new Promise((res) => setTimeout(res, 100));
    assert.equal(S.app.live.streams(), 0, "a closed stream is counted off");
  } finally { await stopApp(S); }
});
