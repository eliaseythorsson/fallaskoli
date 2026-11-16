/* v6.13, items 37 and 65 — the teacher: the class's error patterns and
 * assignments. Through real HTTP requests, like tests/accounts.test.js.
 *
 * What these hold above all is WHO: a guardian sees the learners of their own
 * group and nobody else; another group's guardian, a pupil and somebody not
 * logged in get nothing. And WHAT: the figures the pupil sees, never the
 * examples, never a date, never anything typed. */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server/server.mjs";
import { hashPassword, newId } from "../server/auth.mjs";
import { blankState } from "../src/js/core/state.js";
import { standingOf } from "../src/js/core/diagnosis.js";
import { ASSIGN } from "../src/js/core/assignment.js";
import { teacherMap } from "../src/js/core/skillmap.js";
import { migrate } from "../src/js/core/state.js";
import { PRIVACY_VERSION } from "../server/privacy.mjs";

let base, dir, app;
const PW = "lykilordid-mitt";
const day = (ms = Date.now()) => new Date(ms).toISOString().slice(0, 10);
const inDays = (n) => day(Date.now() + n * 86400000);

before(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "fallaskoli-teach-"));
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
      redirect: "manual",
    });
    const set = r.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const text = await r.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: r.status, data, text, headers: r.headers };
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
      consent: { by: "self", over16: true, at: new Date().toISOString(), how: "admin" }, ...extra };
    users.push(user);
    return users;
  });
  return user;
}

/* A state with some diagnosis: `h` strings as the pupil's history. */
const withDiag = (diag) => ({ ...blankState(), diag });
const rec = (h, extra = {}) => ({ n: h.length + 4, w: [...h].filter((c) => c === "0").length + 1, h,
  last: "2026-11-01", ex: [{ w: "hestur|kk", m: "ÞGFET", o: "ÞFET" }], ...extra });

const U = {};
const C = {};
let GA, GB;

async function setup() {
  await app.store.updateGroups(() => ({ ga: { name: "Bekkur A" }, gb: { name: "Bekkur B" } }));
  GA = "ga"; GB = "gb";
  U.admin = await makeUser("stjori", { role: "admin", consent: undefined });
  U.kennA = await makeUser("kennari-a", { role: "guardian", group: GA, name: "Kennari A", consent: undefined });
  U.kennB = await makeUser("kennari-b", { role: "guardian", group: GB, name: "Kennari B", consent: undefined });
  U.anna = await makeUser("anna", { group: GA, name: "Anna" });
  U.bjarni = await makeUser("bjarni", { group: GA, name: "Bjarni" });
  U.dora = await makeUser("dora", { group: GA, name: "=Dóra" });      // a nickname a spreadsheet would run
  U.bidur = await makeUser("bidur", { group: GA, status: "pending", name: "Bíður" });
  U.lokad = await makeUser("lokad", { group: GA, status: "blocked", name: "Lokaður" });
  U.cecilia = await makeUser("cecilia", { group: GB, name: "Cecilía" });

  /* anna: þolfall/þágufall goes wrong a lot (active), ef a little.
     bjarni: þolfall/þágufall once, ending often (active).
     dora: has practised, with nothing wrong yet.
     cecilia (the other group): everything wrong — must never show in A. */
  await app.store.putState(U.anna.id, withDiag({
    thf_thgf: rec("0010010011"), ef: rec("1110111"), ogreint: { n: 6, w: 2, h: "110111", last: null, ex: [] },
  }));
  await app.store.putState(U.bjarni.id, withDiag({
    thf_thgf: rec("11101111"), ending: rec("000100"),
  }));
  await app.store.putState(U.dora.id, withDiag({ thf_thgf: { n: 3, w: 0, h: "111", last: null, ex: [] } }));
  await app.store.putState(U.cecilia.id, withDiag({ hljodvarp: rec("00000000") }));

  C.anon = client();
  C.admin = await client().login("stjori");
  C.kennA = await client().login("kennari-a");
  C.kennB = await client().login("kennari-b");
  C.anna = await client().login("anna");
  C.bjarni = await client().login("bjarni");
  C.cecilia = await client().login("cecilia");
}

/* ---------- item 37: the class's patterns --------------------------------- */

test("a guardian gets the patterns of the learners of their own group, worst first", async () => {
  const r = await C.kennA("GET", "/teacher/patterns");
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.group, { id: GA, name: "Bekkur A" });
  /* learners only, active only, in name order: no guardian, nobody pending or blocked */
  assert.deepEqual(r.data.pupils.map((p) => p.name), ["=Dóra", "Anna", "Bjarni"]
    .sort((a, b) => a.localeCompare(b, "is")));
  assert.ok(!r.data.pupils.some((p) => p.name === "Cecilía"), "another group's pupil is in the table");
  /* the two patterns that are "algengt núna" come first, then the rest */
  assert.deepEqual(r.data.columns.slice(0, 2).sort(), ["ending", "thf_thgf"]);
  assert.ok(r.data.columns.includes("ef"));
  assert.ok(!r.data.columns.includes("ogreint"), "Ógreint is a count, not a column of errors");
  assert.ok(!r.data.columns.includes("hljodvarp"), "a pattern only another group has is a column");
});

test("each cell is exactly what the pupil sees (standingOf), and nothing more", async () => {
  const r = await C.kennA("GET", "/teacher/patterns");
  const anna = r.data.pupils.find((p) => p.name === "Anna");
  const mine = standingOf(rec("0010010011"));
  const cell = anna.diag.thf_thgf;
  for (const k of ["n", "w", "seen", "misses", "trend", "active"]) assert.equal(cell[k], mine[k], k);
  assert.equal(cell.rate, Math.round(mine.rate * 1000) / 1000);
  /* not the examples, not the date of the last miss, not the raw history */
  assert.deepEqual(Object.keys(cell).sort(), ["active", "misses", "n", "rate", "seen", "trend", "w"]);
  const all = JSON.stringify(r.data);
  assert.ok(!/hestur|ÞGFET|2026-11-01|"ex"|"h"|"last"/.test(all), "the examples, a date or the history left the state");
  /* "Ógreint": both counts, never active */
  assert.equal(anna.diag.ogreint.n, 6);
  assert.equal(anna.diag.ogreint.w, 2);
  assert.equal(anna.diag.ogreint.active, false);
  /* and nothing about the account beyond the nickname */
  assert.deepEqual(Object.keys(anna).sort(), ["diag", "id", "name", "practised"]);
});

test("a pupil, another group's guardian and somebody not logged in get nothing", async () => {
  for (const p of ["/teacher/patterns", "/teacher/patterns.csv", "/teacher/assignments", "/teacher/groups"]) {
    const anon = await C.anon("GET", p + "?group=" + GA);
    assert.equal(anon.status, 401, "anonymous " + p);
    const pupil = await C.anna("GET", p + "?group=" + GA);
    assert.equal(pupil.status, 403, "pupil " + p);
    assert.ok(!/Bjarni|thf_thgf/.test(pupil.text), "a refusal carried data");
    if (p !== "/teacher/groups") {
      const other = await C.kennB("GET", p + "?group=" + GA);
      assert.equal(other.status, 403, "other group's guardian " + p);
      assert.ok(!/Anna|Bjarni|thf_thgf/.test(other.text), "a refusal carried data");
    }
  }
  /* A guardian asking about a group that does not exist learns nothing either. */
  assert.equal((await C.kennB("GET", "/teacher/patterns?group=nope")).status, 403);
  /* Their own group, by default and by name, is theirs. */
  const own = await C.kennB("GET", "/teacher/patterns");
  assert.equal(own.status, 200);
  assert.deepEqual(own.data.pupils.map((p) => p.name), ["Cecilía"]);
  assert.equal((await C.kennB("GET", "/teacher/patterns?group=" + GB)).status, 200);
});

test("the administrator may look at any group, and is told when it does not exist", async () => {
  const a = await C.admin("GET", "/teacher/patterns?group=" + GA);
  assert.equal(a.status, 200);
  assert.equal(a.data.pupils.length, 3);
  assert.equal((await C.admin("GET", "/teacher/patterns?group=nope")).status, 404);
  const g = await C.admin("GET", "/teacher/groups");
  assert.ok(g.data.groups.some((x) => x.id === GA && x.pupils === 3));
  assert.ok(g.data.groups.some((x) => x.id === GB && x.pupils === 1));
  const gk = await C.kennA("GET", "/teacher/groups");
  assert.deepEqual(gk.data.groups.map((x) => x.id), [GA], "a guardian is offered another group");
});

/* ---------- item 83 (d): one pupil's skill map -------------------------------- */

/* Anna's state with more in it than the diagnosis: answers by question type
   (three days ago), a review that is due on a word, XP. The diagnosis is the
   one `setup` gave her, so the tests of the class table read what they did. */
async function annaPractises() {
  const cur = (await app.store.stateRec(U.anna.id)).state;
  const S = { ...blankState(), diag: cur.diag };
  const at = Date.now() - 3 * 86400000;
  S.byType.fill = { n: 12, c: 7, h: "AAaAaAaAAaAa", at };
  S.byNode["so-tid"] = { n: 9, c: 8, h: "AAAAAAAaA", at };
  S.xp = { ...S.xp, nafnord: 54321 };
  S.cells = { ÞGFFT: { c: 2, w: 5 } };
  S.words = { "fjörður|kk": { c: 1, w: 4 } };
  const due = day();
  S.review.items.push({ k: "c:fill|ÞGFFT|fjörður|kk", t: "fill", sk: "nafnord", p: "thf_thgf", c: "ÞGFFT",
    w: "fjörður|kk", i: null, s: 0, due, add: inDays(-1), last: inDays(-1), l: 2, ok: 0 });
  await app.store.putState(U.anna.id, S);
  return { at, due };
}
const nodesIn = (map) => map.cats.flatMap((c) => c.groups.flatMap((g) => g.nodes));

test("a guardian opens the skill map of a pupil of their own group", async () => {
  const { at, due } = await annaPractises();
  const r = await C.kennA("GET", `/teacher/skillmap?pupil=${U.anna.id}`);
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.group, { id: GA, name: "Bekkur A" });
  assert.deepEqual(r.data.pupil, { id: U.anna.id, name: "Anna", practised: true });
  const map = r.data.map;
  assert.equal(map.teacher, true);
  /* The same map the pupil has, node for node (core/skillmap.js). */
  const own = teacherMap(migrate((await app.store.stateRec(U.anna.id)).state));
  assert.deepEqual(nodesIn(map).map((n) => [n.id, n.locked, n.mastery && n.mastery.level, n.due, n.active]),
    nodesIn(own).map((n) => [n.id, n.locked, n.mastery && n.mastery.level, n.due, n.active]));
  const foll = nodesIn(map).find((n) => n.id === "no-foll");
  assert.deepEqual([foll.mastery.level, foll.mastery.n, foll.mastery.right, foll.due, foll.active, foll.needsWork],
    [1, 12, 7, 1, ["thf_thgf"], true]);
  assert.deepEqual(map.details["no-foll"].cells.map((c) => [c.label, c.missed, c.due]),
    [["þágufall, fleirtala, án greinis", 2, 1]]);
  assert.ok(map.next.includes("no-foll"));
  /* And nothing the notice says a teacher does not see: no word, no example,
     no date or time of practice, no raw history, no XP. */
  for (const secret of ["fjörður", "hestur", "ÞGFET", due, inDays(-1), "2026-11-01", String(at), "54321",
    '"h":', '"ex":', '"at":', '"last"', "lastDays", '"words"', '"xp"', "anna\"", "lykilord"])
    assert.ok(!r.text.includes(secret), `the teacher's map carries ${secret}`);
  /* By name of the group too, and the administrator for any group. */
  assert.equal((await C.kennA("GET", `/teacher/skillmap?group=${GA}&pupil=${U.anna.id}`)).status, 200);
  assert.equal((await C.admin("GET", `/teacher/skillmap?group=${GA}&pupil=${U.anna.id}`)).status, 200);
});

test("a pupil who has not practised has a map too: every node 'Of fá svör'", async () => {
  const r = await C.kennB("GET", `/teacher/skillmap?pupil=${U.cecilia.id}`);
  assert.equal(r.status, 200);
  const fresh = await makeUser("nyr-nemandi", { group: GB, name: "Nýr" });
  const n = await C.kennB("GET", `/teacher/skillmap?pupil=${fresh.id}`);
  assert.equal(n.status, 200);
  assert.equal(n.data.pupil.practised, false);
  assert.ok(nodesIn(n.data.map).every((x) => x.locked || (x.mastery.level === 0 && !x.needsWork)));
  await app.store.updateUsers((users) => users.filter((u) => u.id !== fresh.id));
});

test("the skill map of a pupil: nobody but the teacher of that pupil's group", async () => {
  const q = `/teacher/skillmap?pupil=${U.anna.id}`;
  const leak = /Anna|no-foll|thf_thgf|mastery/;
  /* Not logged in; a pupil — herself included, and a classmate. */
  const anon = await C.anon("GET", q + "&group=" + GA);
  assert.equal(anon.status, 401);
  for (const c of [C.anna, C.bjarni, C.cecilia]) {
    const r = await c("GET", q + "&group=" + GA);
    assert.equal(r.status, 403);
    assert.ok(!leak.test(r.text), "a refusal carried data");
  }
  /* Another group's guardian: refused for the group when they name it, and
     told "not in this group" when they ask under their own — the very answer
     an id that does not exist gets, so it says nothing about who exists. */
  const named = await C.kennB("GET", q + "&group=" + GA);
  assert.equal(named.status, 403);
  const own = await C.kennB("GET", q);
  const none = await C.kennB("GET", "/teacher/skillmap?pupil=enginn-slikur");
  assert.deepEqual([own.status, none.status], [404, 404]);
  assert.equal(own.text, none.text);
  for (const r of [named, own, none]) assert.ok(!leak.test(r.text), "a refusal carried data");
  /* Within the group: only learners who are active. Not the pending, not the
     blocked, not the guardian themself, not the administrator. */
  for (const u of [U.bidur, U.lokad, U.kennA, U.admin]) {
    const r = await C.kennA("GET", `/teacher/skillmap?pupil=${u.id}`);
    assert.equal(r.status, 404, u.username);
    assert.equal(r.text, none.text, u.username);
  }
  assert.equal((await C.kennA("GET", "/teacher/skillmap")).status, 404, "no pupil named");
  /* The administrator must name the pupil's own group as well. */
  assert.equal((await C.admin("GET", `${q}&group=${GB}`)).status, 404);
  assert.equal((await C.admin("GET", `${q}&group=nope`)).status, 404);
  /* And it is a read: nothing else answers there. */
  assert.notEqual((await C.kennA("POST", q, { x: 1 })).status, 200);
});

test("the CSV: semicolons, UTF-8 with a BOM, percentages, and no formula from a nickname", async () => {
  const r = await C.kennA("GET", "/teacher/patterns.csv");
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type"), /^text\/csv; charset=utf-8/);
  assert.match(r.headers.get("content-disposition"), /attachment; filename="villumynstur-\d{4}-\d{2}-\d{2}\.csv"/);
  assert.ok(r.headers.get("content-security-policy"));
  const text = r.text.replace(/^\uFEFF/, "");
  const lines = text.trim().split("\r\n");
  assert.equal(lines.length, 4, "a header and three pupils");
  assert.match(lines[0], /^Nemandi;/);
  assert.match(lines[0], /Þolfall og þágufall ruglast \(% rangt undanfarið\)/);
  const anna = lines.find((l) => l.startsWith("Anna;")).split(";");
  const col = lines[0].split(";").findIndex((h) => h.startsWith("Þolfall og þágufall"));
  assert.equal(anna[col], "60", "Anna missed 6 of her last 10");
  assert.deepEqual(anna.slice(-2), ["2", "6"], "the two Ógreint counts");
  assert.ok(lines.some((l) => l.startsWith("'=Dóra;")), "a nickname starting with = was not defused");
  assert.ok(!/Cecilía|hestur/.test(text));
});

/* ---------- item 65: assignments ----------------------------------------- */

let A1;
test("a guardian sets an assignment for their group; it is checked first", async () => {
  const good = { target: { kind: "pattern", id: "thf_thgf" }, n: 10, due: inDays(7), note: "Fyrir þriðjudag" };
  const bad = async (patch, code = 400) => {
    const r = await C.kennA("POST", "/teacher/assignments", { ...good, ...patch });
    assert.equal(r.status, code, JSON.stringify(patch) + " → " + JSON.stringify(r.data));
  };
  await bad({ target: { kind: "pattern", id: "ogreint" } });          // a count, not an error
  await bad({ target: { kind: "pattern", id: "ekkitil" } });
  await bad({ target: { kind: "skill", id: "<script>" } });
  await bad({ target: { kind: "node", id: "no-foll", extra: 1 }, n: 7 });
  await bad({ n: 1000 });
  await bad({ due: day(Date.now() - 86400000) });
  await bad({ due: inDays(ASSIGN.maxDays + 1) });
  await bad({ due: "2026-02-30" });
  await bad({ due: "á morgun" });
  await bad({ note: "<b>hæ</b>" });

  const r = await C.kennA("POST", "/teacher/assignments", good);
  assert.equal(r.status, 200);
  A1 = r.data.assignment.id;
  const stored = (await app.store.assignments()).find((a) => a.id === A1);
  assert.equal(stored.group, GA);
  assert.equal(stored.by, U.kennA.id);
  assert.deepEqual(stored.target, { kind: "pattern", id: "thf_thgf" });
  assert.equal(stored.note, "Fyrir þriðjudag");
  /* the trail has it, by id */
  assert.ok((await app.store.audit()).some((x) => x.by === U.kennA.id && x.act === "setti verkefni"));
});

test("nobody else can set or remove one for the group", async () => {
  const form = { group: GA, target: { kind: "skill", id: "nafnord" }, n: 10, due: inDays(3) };
  assert.equal((await C.anon("POST", "/teacher/assignments", form)).status, 401);
  assert.equal((await C.anna("POST", "/teacher/assignments", form)).status, 403);
  assert.equal((await C.kennB("POST", "/teacher/assignments", form)).status, 403);
  assert.equal((await C.anon("DELETE", "/teacher/assignments/" + A1)).status, 401);
  assert.equal((await C.anna("DELETE", "/teacher/assignments/" + A1)).status, 403);
  assert.equal((await C.kennB("DELETE", "/teacher/assignments/" + A1)).status, 403);
  assert.ok((await app.store.assignments()).some((a) => a.id === A1), "somebody else removed it");
  /* The administrator may, for any group. */
  const byAdmin = await C.admin("POST", "/teacher/assignments", { ...form, target: { kind: "year", id: "8" } });
  assert.equal(byAdmin.status, 200);
  assert.equal((await C.admin("DELETE", "/teacher/assignments/" + byAdmin.data.assignment.id)).status, 204);
});

test("the pupils of the group see it; nobody else does", async () => {
  const mine = await C.anna("GET", "/assignments");
  assert.equal(mine.status, 200);
  const a = mine.data.assignments.find((x) => x.id === A1);
  assert.ok(a, "the pupil does not see the assignment");
  assert.deepEqual(a.target, { kind: "pattern", id: "thf_thgf" });
  assert.equal(a.n, 10); assert.equal(a.open, true); assert.equal(a.mine, null);
  assert.ok(!("res" in a) && !("by" in a) && !("group" in a), "the pupil is sent others' results or who set it");
  assert.equal((await C.cecilia("GET", "/assignments")).data.assignments.length, 0);
  assert.equal((await C.kennA("GET", "/assignments")).data.assignments.length, 0, "a guardian is given homework");
  assert.equal((await C.anon("GET", "/assignments")).status, 401);
});

test("a pupil sends a result: checked, and the better complete attempt counts", async () => {
  const send = (c, body) => c("POST", `/assignments/${A1}/result`, body);
  assert.equal((await send(C.anon, { i: 10, j: 10, c: 9 })).status, 401);
  assert.equal((await send(C.cecilia, { i: 10, j: 10, c: 9 })).status, 404, "another group's pupil");
  assert.equal((await send(C.kennA, { i: 10, j: 10, c: 9 })).status, 404, "a guardian");
  for (const body of [{ i: 11, j: 10, c: 9 }, { i: 10, j: 10, c: 11 }, { i: 10, j: 11, c: 1 },
    { i: 0, j: 0, c: 0 }, { i: 5.5, j: 5, c: 5 }, { i: -1, j: 0, c: 0 }, {}]) {
    assert.equal((await send(C.anna, body)).status, 400, JSON.stringify(body));
  }
  /* half-way, then all of it, then a worse go (kept: the better one), then a better */
  let r = await send(C.anna, { i: 4, j: 4, c: 3 });
  assert.equal(r.status, 200);
  assert.deepEqual({ ...r.data.assignment.mine, at: 0 }, { i: 4, j: 4, c: 3, done: false, at: 0 });
  r = await send(C.anna, { i: 10, j: 10, c: 6 });
  assert.equal(r.data.assignment.mine.done, true);
  r = await send(C.anna, { i: 10, j: 10, c: 4 });
  assert.equal(r.data.assignment.mine.c, 6, "a worse attempt replaced a better one");
  r = await send(C.anna, { i: 3, j: 3, c: 3 });
  assert.equal(r.data.assignment.mine.done, true, "an unfinished attempt undid a finished one");
  r = await send(C.anna, { i: 10, j: 10, c: 9 });
  assert.equal(r.data.assignment.mine.c, 9);
  const stored = (await app.store.assignments()).find((a) => a.id === A1).res[U.anna.id];
  assert.equal(stored.tries, 5);
  assert.deepEqual(Object.keys(stored).sort(), ["at", "c", "done", "i", "j", "tries"], "something else was stored");
  await send(C.bjarni, { i: 6, j: 6, c: 2 });
});

test("the teacher sees who finished, the scores, and the class's patterns on that material", async () => {
  const r = await C.kennA("GET", "/teacher/assignments");
  assert.equal(r.status, 200);
  const a = r.data.assignments.find((x) => x.id === A1);
  const by = Object.fromEntries(a.results.map((x) => [x.name, x.res]));
  assert.deepEqual(by.Anna, { i: 10, j: 10, c: 9, done: true }, "no date, no count of tries");
  assert.deepEqual(by.Bjarni, { i: 6, j: 6, c: 2, done: false });
  assert.equal(by["=Dóra"], null);
  assert.equal(a.results.length, 3, "somebody outside the group, or not a learner, is listed");
  /* the material is one pattern: its column, and only it */
  assert.deepEqual(a.columns, ["thf_thgf"]);
  assert.ok(r.data.pupils.every((p) => !("ex" in (p.diag.thf_thgf || {}))));
  /* another group's guardian sees none of it */
  const other = await C.kennB("GET", "/teacher/assignments");
  assert.equal(other.data.assignments.length, 0);
});

test("a category assignment shows the patterns its question types test", async () => {
  const r = await C.kennA("POST", "/teacher/assignments",
    { target: { kind: "skill", id: "nafnord" }, n: 5, due: inDays(1) });
  assert.equal(r.status, 200);
  const list = await C.kennA("GET", "/teacher/assignments");
  const a = list.data.assignments.find((x) => x.id === r.data.assignment.id);
  assert.ok(a.columns.includes("thf_thgf") && a.columns.includes("ending"),
    "the noun assignment does not show the noun patterns: " + a.columns);
  assert.ok(!a.columns.includes("hljodvarp"));
  await C.kennA("DELETE", "/teacher/assignments/" + r.data.assignment.id);
});

test("limits: open assignments per group, tries per pupil", async () => {
  const made = [];
  let r;
  for (let k = 0; k < ASSIGN.maxOpen + 1; k++) {
    r = await C.kennB("POST", "/teacher/assignments", { target: { kind: "skill", id: "nafnord" }, n: 5, due: inDays(2) });
    if (r.status === 200) made.push(r.data.assignment.id);
  }
  assert.equal(made.length, ASSIGN.maxOpen);
  assert.equal(r.status, 409);
  /* group A is not affected by group B's count */
  const a = await C.kennA("POST", "/teacher/assignments", { target: { kind: "skill", id: "toluord" }, n: 5, due: inDays(2) });
  assert.equal(a.status, 200);
  await C.kennA("DELETE", "/teacher/assignments/" + a.data.assignment.id);

  await app.store.updateAssignments((list) => {
    list.find((x) => x.id === made[0]).res[U.cecilia.id] = { i: 5, j: 5, c: 5, done: true, at: 1, tries: ASSIGN.maxTries };
    return list;
  });
  const t = await C.cecilia("POST", `/assignments/${made[0]}/result`, { i: 5, j: 5, c: 5 });
  assert.equal(t.status, 429);
  for (const id of made) assert.equal((await C.kennB("DELETE", "/teacher/assignments/" + id)).status, 204);
  assert.equal((await C.kennB("DELETE", "/teacher/assignments/" + made[0])).status, 404);
});

test("after the deadline: no more results, off the pupil's list, still the teacher's; erased later", async () => {
  const r = await C.kennA("POST", "/teacher/assignments", { target: { kind: "node", id: "no-foll" }, n: 5, due: day() });
  const id = r.data.assignment.id;
  /* move the deadline back two days, then forty */
  const setDue = (d) => app.store.updateAssignments((list) => { list.find((x) => x.id === id).due = d; return list; });
  await setDue(day(Date.now() - 2 * 86400000));
  assert.equal((await C.anna("POST", `/assignments/${id}/result`, { i: 5, j: 5, c: 5 })).status, 409);
  assert.ok(!(await C.anna("GET", "/assignments")).data.assignments.some((a) => a.id === id));
  const t = (await C.kennA("GET", "/teacher/assignments")).data.assignments.find((a) => a.id === id);
  assert.equal(t.open, false);
  await setDue(day(Date.now() - (ASSIGN.keepDays + 2) * 86400000));
  await C.kennA("GET", "/teacher/assignments");
  assert.ok(!(await app.store.assignments()).some((a) => a.id === id), "an old assignment was not erased");
});

test("a pupil's page names the group's teacher; their export holds their results", async () => {
  const acc = await C.anna("GET", "/account");
  assert.deepEqual(acc.data.teachers, ["Kennari A"]);
  assert.deepEqual((await C.cecilia("GET", "/account")).data.teachers, ["Kennari B"]);
  const ex = await C.anna("GET", "/account/export");
  const mine = ex.data.assignments.find((a) => a.id === A1);
  assert.equal(mine.result.c, 9);
  assert.ok(!JSON.stringify(ex.data.assignments).includes(U.bjarni.id), "another pupil's result is in the export");
});

test("the privacy notice says what the teacher sees, and the version moved", async () => {
  const r = await C.anon("GET", "/personuvernd");
  assert.match(r.text, /Kennari eða forsjáraðili hópsins þíns/);
  assert.match(r.text, /villumynstrin þín/);
  assert.match(r.text, /aldrei það sem þú skrifar í svörin/);
  assert.match(r.text, new RegExp(`eyðist ${ASSIGN.keepDays} dögum eftir skiladag`));
  assert.doesNotMatch(r.text, /Síðast breytt 2026-11-11/);
  /* Item 83: the teacher can open the skill map, in the same version. */
  assert.match(r.text, /opnað færnikortið þitt/);
  assert.match(r.text, /ekki hvaða orð\s+fóru úrskeiðis hjá þér/);
  assert.ok(PRIVACY_VERSION > "2026-11-11" && r.text.includes(`Síðast breytt ${PRIVACY_VERSION}`));
});

test("erasure: a pupil's results go; an assignment a guardian set stays, nameless", async () => {
  await app.store.eraseUser(U.anna.id);
  const a = (await app.store.assignments()).find((x) => x.id === A1);
  assert.ok(!(U.anna.id in a.res), "an erased pupil's result survived");
  assert.ok(U.bjarni.id in a.res);
  await app.store.eraseUser(U.kennA.id);
  const b = (await app.store.assignments()).find((x) => x.id === A1);
  assert.equal(b.by, null);
  assert.ok(!JSON.stringify(await app.store.assignments()).includes(U.anna.id));
  /* in the backup, and back out of it */
  const all = await app.store.exportAll();
  assert.ok(Array.isArray(all.assignments) && all.assignments.some((x) => x.id === A1));
});

test("deleting a group deletes its assignments", async () => {
  await app.store.updateUsers((users) => users.filter((u) => u.group !== GB));
  await C.admin("POST", "/teacher/assignments", { group: GB, target: { kind: "skill", id: "nafnord" }, n: 5, due: inDays(2) });
  assert.ok((await app.store.assignments()).some((a) => a.group === GB));
  assert.equal((await C.admin("DELETE", "/admin/groups/" + GB)).status, 204);
  assert.ok(!(await app.store.assignments()).some((a) => a.group === GB));
});
