/* v6.7: duels — the rules (core/duel.js), the same questions for both, and
   the server's endpoints through real HTTP. */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, newSession } from "../src/js/core/state.js";
import { createPolicy } from "../src/js/core/policy.js";
import { nextTask, makeView, applyEffects } from "../src/js/tasks/index.js";
import { DUEL, DUEL_TOPICS, duelStatus, outcomeFor, prune, viewFor, duelTasks, signature,
         duelLevel, duelDifficulty, settleDuels, duelTotals } from "../src/js/core/duel.js";
import { skillNeed } from "../src/js/core/progress.js";
import { createApp } from "../server/server.mjs";
import { cleanState } from "../server/guard.mjs";
import { mergeStates } from "../src/js/core/merge.js";

const H = 3600000;
const deps = { nextTask, makeView, applyEffects, blankState, newSession, createPolicy };
const duel = (over = {}) => ({ id: "d1", a: "A", b: "B", topic: "nafnord", n: 10, seed: 7,
  level: 3, created: 0, deadline: 24 * H, res: { a: null, b: null }, ...over });

/* ---------- the rules ---------- */

test("a duel is open until both answer or the day is up", () => {
  assert.equal(duelStatus(duel(), H), "open");
  assert.equal(duelStatus(duel({ res: { a: { c: 5, n: 10 }, b: null } }), H), "open");
  assert.equal(duelStatus(duel({ res: { a: { c: 5, n: 10 }, b: { c: 6, n: 10 } } }), H), "done");
  assert.equal(duelStatus(duel({ res: { a: { c: 5, n: 10 }, b: null } }), 25 * H), "done");
  assert.equal(duelStatus(duel(), 25 * H), "void");
});

test("more right wins; the one who did not answer loses; equal is a tie", () => {
  const d = duel({ res: { a: { c: 7, n: 10 }, b: { c: 6, n: 10 } } });
  assert.equal(outcomeFor(d, "a", H), "w");
  assert.equal(outcomeFor(d, "b", H), "l");
  const t = duel({ res: { a: { c: 6, n: 10 }, b: { c: 6, n: 10 } } });
  assert.equal(outcomeFor(t, "a", H), "t");
  const f = duel({ res: { a: null, b: { c: 1, n: 10 } } });
  assert.equal(outcomeFor(f, "b", 25 * H), "w", "answering at all beats not answering");
  assert.equal(outcomeFor(f, "a", 25 * H), "l");
  assert.equal(outcomeFor(f, "a", H), null, "still open");
});

test("void duels are deleted at once, finished ones after a month", () => {
  const list = [duel({ id: "void" }),
    duel({ id: "old", res: { a: { c: 1, n: 10, at: 0 }, b: { c: 2, n: 10, at: H } } }),
    duel({ id: "open", deadline: 100 * 86400000 })];
  const now = 25 * H;
  assert.deepEqual(prune(list, now).map((d) => d.id), ["old", "open"]);
  assert.deepEqual(prune(list, (DUEL.keepDays + 2) * 86400000).map((d) => d.id), ["open"]);
});

test("the other score is hidden until you have answered", () => {
  const d = duel({ res: { a: { c: 9, n: 10, sig: "x" }, b: null } });
  const forB = viewFor(d, "B", { A: "Anna" }, H);
  assert.equal(forB.theirs, null);
  assert.equal(forB.theyPlayed, true);
  assert.equal(forB.opponent.name, "Anna");
  assert.equal(viewFor(d, "C", {}, H), null, "not a party, not shown");
});

test("the level is the mean of the two players', and never the easiest sentences", () => {
  const A = blankState(), B = blankState();
  A.skills.nafnord.xp = skillNeed(9);
  assert.equal(duelLevel(A, B, "nafnord"), 5);
  assert.ok(duelDifficulty(1) >= 2.5);
  assert.ok(duelDifficulty(10) > duelDifficulty(3));
});

/* ---------- the same questions for both ---------- */

test("two browsers build the same questions from the same seed, for every topic", () => {
  const l1 = buildLexicon(DATA, { hide: new Set(DATA.blocked || []) });
  const l2 = buildLexicon(DATA, { hide: new Set(DATA.blocked || []) });
  for (const t of DUEL_TOPICS) {
    const d = duel({ topic: t.id, n: 20, seed: 4242, level: 4 });
    const a = duelTasks(l1, d, deps);
    Math.random();                       // whatever happened in between
    const b = duelTasks(l2, d, deps);
    assert.equal(a.length, 20, t.id);
    assert.equal(signature(a), signature(b), t.id);
    assert.ok(a.every((x) => x.duel && x.counts !== false), t.id);
  }
  const other = duelTasks(l1, duel({ n: 20, seed: 4243 }), deps);
  assert.notEqual(signature(other), signature(duelTasks(l1, duel({ n: 20, seed: 4242 }), deps)));
});

test("building a duel never touches Math.random: the seed is its only random source", () => {
  /* Until v6.13 Math.random was swapped for the seeded generator while the
     questions were built. Now it is not even called: with it taken away, the
     duel builds — and builds the same questions. */
  const lexicon = buildLexicon(DATA);
  const before = Math.random;
  const usual = signature(duelTasks(lexicon, duel({ n: 20 }), deps));
  let calls = 0;
  Math.random = () => { calls++; throw new Error("a builder called Math.random"); };
  let without;
  try { without = signature(duelTasks(lexicon, duel({ n: 20 }), deps)); } finally { Math.random = before; }
  assert.equal(calls, 0);
  assert.equal(without, usual);
  assert.equal(Math.random, before);
});

/* ---------- this device's side ---------- */

test("a result is settled once, with XP only for the one who answered", () => {
  const S = blankState();
  const views = [
    { id: "x", outcome: "w", mine: { c: 10, n: 10 }, theirs: { c: 3, n: 10 } },
    { id: "y", outcome: "l", mine: null, theirs: { c: 3, n: 10 } },
    { id: "z", outcome: null, mine: { c: 1, n: 10 } },
  ];
  const s = settleDuels(S, views);
  assert.equal(s.length, 2);
  assert.equal(s[0].xp, DUEL.xpPlay + DUEL.xpWin);
  assert.equal(s[0].perfect, true);
  assert.equal(s[1].outcome, "f");
  assert.equal(s[1].xp, 0);
  assert.equal(settleDuels(S, views).length, 0, "the second time, nothing");
  assert.deepEqual(duelTotals(S), { played: 1, wins: 1, losses: 1, ties: 0 });
});

test("settled duels survive the server's guard and a merge between devices", () => {
  const S = blankState();
  S.duels = { a1: "w", b2: "f", bad: "<script>" };
  S.read = { foll: true };
  const clean = cleanState(S);
  assert.deepEqual(clean.duels, { a1: "w", b2: "f" });
  assert.deepEqual(clean.read, { foll: true });
  const L = blankState(), R = blankState();
  L.duels = { a1: "w" }; R.duels = { c3: "t" };
  assert.deepEqual(mergeStates(blankState(), L, R).duels, { a1: "w", c3: "t" });
});

/* ---------- the server ---------- */

let base, dir, app;
before(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "fallaskoli-duel-"));
  app = createApp({ dataDir: dir, secureCookies: false, env: { FALLASKOLI_OPEN_REGISTRATION: "1" } });
  await app.store.init();
  await new Promise((r) => app.server.listen(0, r));
  base = "http://127.0.0.1:" + app.server.address().port;
});
after(async () => {
  await new Promise((r) => app.server.close(r));
  await fs.rm(dir, { recursive: true, force: true });
});

function client() {
  let cookie = null;
  return async (method, p, body) => {
    const r = await fetch(base + p, { method,
      headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
    const set = r.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const text = await r.text();
    let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: r.status, data };
  };
}
async function person(username, { board = true, group } = {}) {
  const { hashPassword, newId } = await import("../server/auth.mjs");
  const { salt, hash } = await hashPassword("lykilordid-mitt");
  let user;
  await app.store.updateUsers((users) => {
    user = { id: newId(), username, name: username, role: "learner", status: "active", salt, hash,
      share: { board, minutes: false }, ...(group ? { group } : {}),
      consent: { by: "self", over16: true, at: new Date().toISOString(), how: "admin" } };
    users.push(user); return users;
  });
  await app.store.putState(user.id, blankState());
  const c = client();
  const r = await c("POST", "/auth/login", { username, password: "lykilordid-mitt" });
  assert.equal(r.status, 200);
  return { user, c };
}

test("server: a challenge, two answers, one winner", async () => {
  const anna = await person("anna"), bjorn = await person("bjorn");
  const list = await anna.c("GET", "/duels");
  assert.equal(list.status, 200);
  assert.ok(list.data.canChallenge.some((p) => p.id === bjorn.user.id));
  const made = await anna.c("POST", "/duels", { opponent: bjorn.user.id, topic: "lysingarord", n: 20 });
  assert.equal(made.status, 200);
  const id = made.data.duel.id;
  assert.equal(typeof made.data.duel.seed, "number");

  const forB = (await bjorn.c("GET", "/duels")).data.duels.find((d) => d.id === id);
  assert.equal(forB.challenger, false);
  assert.equal(forB.seed, made.data.duel.seed, "both get the same seed");

  assert.equal((await anna.c("POST", `/duels/${id}/result`, { c: 15, n: 20, sig: "s" })).status, 200);
  assert.equal((await anna.c("POST", `/duels/${id}/result`, { c: 20, n: 20 })).status, 409, "once only");
  const midB = (await bjorn.c("GET", "/duels")).data.duels.find((d) => d.id === id);
  assert.equal(midB.theirs, null, "Björn does not see the number to beat");
  assert.equal((await bjorn.c("POST", `/duels/${id}/result`, { c: 25, n: 20 })).status, 400);
  assert.equal((await bjorn.c("POST", `/duels/${id}/result`, { c: 12, n: 20, sig: "s" })).status, 200);

  const endA = (await anna.c("GET", "/duels")).data.duels.find((d) => d.id === id);
  const endB = (await bjorn.c("GET", "/duels")).data.duels.find((d) => d.id === id);
  assert.equal(endA.outcome, "w");
  assert.equal(endB.outcome, "l");
  assert.deepEqual(endB.theirs, { c: 15, n: 20 });
  assert.equal(endA.sameQuestions, true);
});

test("server: only people on the board, in the same group, and never yourself", async () => {
  const me = await person("kata");
  const hidden = await person("leynd", { board: false });
  const elsewhere = await person("fjarri", { group: "annar" });
  assert.equal((await me.c("POST", "/duels", { opponent: hidden.user.id, topic: "nafnord", n: 10 })).status, 404);
  assert.equal((await me.c("POST", "/duels", { opponent: elsewhere.user.id, topic: "nafnord", n: 10 })).status, 404);
  assert.equal((await me.c("POST", "/duels", { opponent: me.user.id, topic: "nafnord", n: 10 })).status, 400);
  const other = await person("lilja");
  assert.equal((await me.c("POST", "/duels", { opponent: other.user.id, topic: "ordaford", n: 10 })).status, 400,
    "no duel on a topic with no wrong answers");
  assert.equal((await me.c("POST", "/duels", { opponent: other.user.id, topic: "nafnord", n: 30 })).status, 400);
  assert.equal((await hidden.c("POST", "/duels", { opponent: other.user.id, topic: "nafnord", n: 10 })).status, 403,
    "somebody not on the board cannot challenge either");
});

test("server: ten open duels at most", async () => {
  const a = await person("margir"), b = await person("motherji");
  for (let i = 0; i < DUEL.maxOpen; i++)
    assert.equal((await a.c("POST", "/duels", { opponent: b.user.id, topic: "nafnord", n: 10 })).status, 200);
  assert.equal((await a.c("POST", "/duels", { opponent: b.user.id, topic: "nafnord", n: 10 })).status, 409);
});

test("server: a duel nobody answered is gone after the day; erasing a user erases their duels", async () => {
  const a = await person("gleymin"), b = await person("gleymdur");
  const made = await a.c("POST", "/duels", { opponent: b.user.id, topic: "sagnord", n: 10 });
  const id = made.data.duel.id;
  await app.store.updateDuels((list) => { list.find((d) => d.id === id).deadline = Date.now() - 1; return list; });
  assert.equal((await a.c("GET", "/duels")).data.duels.some((d) => d.id === id), false);
  assert.equal((await app.store.duels()).some((d) => d.id === id), false, "deleted from the file too");

  const c = await person("hverfur");
  await a.c("POST", "/duels", { opponent: c.user.id, topic: "sagnord", n: 10 });
  await app.store.eraseUser(c.user.id);
  assert.equal((await app.store.duels()).some((d) => d.a === c.user.id || d.b === c.user.id), false);
});

test("v6.10: a duel asks only about what both players have switched on", async () => {
  const { duelSkills } = await import("../src/js/core/duel.js");
  const on = (off) => ({ skill: (id) => !off.includes(id) });
  const mix = duelSkills("blandad", on(["setningafraedi", "setningagerd"]), on([]));
  assert.ok(mix.length > 3);
  assert.ok(!mix.includes("setningafraedi") && !mix.includes("setningagerd"));
  assert.deepEqual(duelSkills("setningagerd", on([]), on(["setningagerd"])), []);
  assert.deepEqual(duelSkills("nafnord", null, null), ["nafnord"]);
});
