/* v6.13, critique items 17 and 38 — the server's side (server/calibrate.mjs):
 * whose answers are counted, that what is kept is anonymous and bounded, that
 * a flood cannot move anything far, the weekly run, and the sample of wrong
 * answers a teacher may switch on for their own group.
 *
 * Routes are tested through real HTTP; the bulk (a month of answers) goes
 * through `app.calibration.accept` directly, with the day passed in.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server/server.mjs";
import { CALIBRATION_NOTICE, PRIVACY_VERSION, privacyPage, privacyConfig } from "../server/privacy.mjs";
import { hashPassword, newId } from "../server/auth.mjs";
import { CAL, cleanTable, typeShift } from "../src/js/core/calibration.js";
import { SAMPLE, cleanSample } from "../src/js/core/classifiercheck.js";

const DAY = 86400000;
const T0 = Date.parse("2026-11-17T09:00:00Z");
const open = [];

/** A server of its own, in a folder of its own. */
async function serve(env = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "fallaskoli-cal-"));
  const app = createApp({ dataDir: dir, secureCookies: false, env });
  await app.store.init();
  await new Promise((r) => app.server.listen(0, r));
  const base = "http://127.0.0.1:" + app.server.address().port;
  open.push({ app, dir });
  return { app, dir, base };
}

after(async () => {
  for (const { app, dir } of open) {
    await new Promise((r) => app.server.close(r));
    await fs.rm(dir, { recursive: true, force: true });
  }
});

function client(base) {
  let cookie = null;
  return async function call(method, p, body) {
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
    return { status: r.status, data };
  };
}

const PW = "lykilordid-mitt";
let pwHash = null;

/** A user straight into the store. `login: true` gives it the password PW. */
async function addUser(app, username, extra = {}, { login = false } = {}) {
  if (login) pwHash ||= await hashPassword(PW);
  let user;
  await app.store.updateUsers((users) => {
    user = { id: newId(), username, name: username, role: "learner", status: "active",
      lastSeen: new Date(T0).toISOString().slice(0, 10),
      consent: { by: "self", over16: true, at: new Date(T0).toISOString(), how: "admin", notice: PRIVACY_VERSION },
      ...(login ? pwHash : {}), ...extra };
    users.push(user);
    return users;
  });
  return user;
}

async function loggedIn(base, username) {
  const c = client(base);
  const r = await c("POST", "/auth/login", { username, password: PW });
  assert.equal(r.status, 200, "login " + username);
  return c;
}

const readJSON = async (dir, name) => {
  try { return JSON.parse(await fs.readFile(path.join(dir, name), "utf8")); } catch { return null; }
};
const ev = (t, l, ok, recs = []) => ({ t, l, ok, recs });
/** `n` answers to one type at one level, the share `p` of them right. */
const batch = (t, l, n, p) => Array.from({ length: n }, (_, k) => ev(t, l, k < Math.round(n * p)));

/* ---------- 1. whose answers are counted --------------------------------------- */

let S;                      // the default server most tests share
before(async () => { S = await serve(); });

test("consent off → nothing is stored: every way of not being counted", async () => {
  const { app, dir } = await serve();
  const events = batch("fill", 3, 10, 0.5).map((e) => ({ ...e, recs: [["ÞGFET", 2, 1]] }));
  const cases = {
    "switched it off": await addUser(app, "slokkt", { stats: false }),
    "no consent record": await addUser(app, "gamall", { consent: null }),
    "a guardian": await addUser(app, "kennari", { role: "guardian" }),
    "an administrator": await addUser(app, "stjori", { role: "admin" }),
    "held for review": await addUser(app, "skrytinn", { review: { at: "x", why: "y" } }),
    "blocked": await addUser(app, "lokadur", { status: "blocked" }),
  };
  for (const [why, u] of Object.entries(cases)) {
    assert.equal(app.calibration.counted(u), false, why);
    const r = await app.calibration.accept(u, { events }, T0);
    assert.deepEqual(r, { counted: 0, records: 0, samples: 0, collect: false }, why);
  }
  assert.equal(await readJSON(dir, "calibration.json"), null, "no counts were written");
  assert.equal(await readJSON(dir, "calibration-quota.json"), null, "and nobody's allowance");
  assert.equal(await readJSON(dir, "samples.json"), null);

  /* …and the one who IS counted */
  const yes = await addUser(app, "med");
  assert.equal(app.calibration.counted(yes), true);
  assert.equal((await app.calibration.accept(yes, { events }, T0)).counted, 10);
});

test("the kill switch: nothing counted, no table published, whatever is stored", async () => {
  const { app, dir, base } = await serve({ FALLASKOLI_CALIBRATION: "0" });
  const u = await addUser(app, "anna", {}, { login: true });
  /* a table left over from before the switch was thrown */
  await app.store.updateCalibration(() => ({ v: 1, table: { v: 1, types: { fill: { 3: -0.25 } }, cells: {}, irr: {} } }));
  assert.equal(app.calibration.counted(u), false);
  const c = await loggedIn(base, "anna");
  const got = await c("GET", "/calibration");
  assert.equal(got.status, 200);
  assert.deepEqual([got.data.on, got.data.table, got.data.collect, got.data.samples], [false, null, false, false]);
  const sent = await c("POST", "/calibration/answers", { events: batch("fill", 3, 5, 1) });
  assert.equal(sent.data.counted, 0);
  assert.equal(await app.calibration.run(T0, { force: true }), null, "and no run");
  assert.equal(await readJSON(dir, "calibration-quota.json"), null);
  assert.equal((await readJSON(dir, "calibration.json")).counts, undefined, "what was stored is left alone");
  /* the teacher's switch for the sample is refused too */
  await addUser(app, "kennari", { role: "guardian" }, { login: true });
  const t = await loggedIn(base, "kennari");
  assert.equal((await t("GET", "/teacher/samples")).data.available, false);
  assert.equal((await t("POST", "/teacher/samples", { on: true })).status, 409);
});

test("strict: only consent given to the notice that describes the counting, or the account's own yes", async () => {
  const { app } = await serve({ FALLASKOLI_CALIBRATION: "strict" });
  const old = await addUser(app, "eldri", { consent: { by: "Jóna", at: "x", how: "invite", notice: "2026-11-16" } });
  const none = await addUser(app, "elstur", { consent: { by: "self", over16: true, at: "x", how: "admin" } });
  const cur = await addUser(app, "nyr");
  const said = await addUser(app, "sagdi-ja", { stats: true,
    consent: { by: "self", over16: true, at: "x", how: "admin", notice: "2026-11-16" } });
  assert.equal(CALIBRATION_NOTICE <= PRIVACY_VERSION, true);
  assert.deepEqual([old, none, cur, said].map(app.calibration.counted), [false, false, true, true]);
  /* without `strict` the notice covers all of them */
  assert.deepEqual([old, none, cur, said].map(S.app.calibration.counted), [true, true, true, true]);
});

/* ---------- 2. anonymous, and the one place that is not ------------------------ */

test("the counts name nobody; today's allowance does, for a day, and goes with the account", async () => {
  const { app, dir } = await serve();
  await app.store.updateGroups((g) => { g.hbekkur8 = { name: "8. bekkur" }; return g; });
  const u = await addUser(app, "sigga-litla", { name: "Sigga", group: "hbekkur8" });
  const r = await app.calibration.accept(u, { events: [
    ev("fill", 3, true, [["ÞGFET", 2, 1]]), ev("tbl_no", 3, false, [["NFET", 1, 1], ["EFFT", 1, 0]]),
  ] }, T0);
  assert.deepEqual([r.counted, r.records, r.collect], [2, 3, true]);

  const text = await fs.readFile(path.join(dir, "calibration.json"), "utf8");
  for (const secret of [u.id, "sigga", "Sigga", "hbekkur8", "8. bekkur", "2026-11-17"])
    assert.ok(!text.includes(secret), `calibration.json contains ${secret}`);
  const c = JSON.parse(text);
  assert.deepEqual(c.counts.types, { "fill|3": [1, 1], "tbl_no|3": [0, 1] });
  assert.deepEqual(c.counts.cells, { "fill|3|ÞGFET|2": [1, 1], "tbl_no|3|NFET|1": [1, 1], "tbl_no|3|EFFT|1": [0, 1] });
  assert.deepEqual(Object.keys(c).sort(), ["counts", "lastRun", "log", "runs", "since", "table", "v"]);
  /* every key is made of a type, a level, a mark and a score — nothing else fits */
  for (const k of Object.keys(c.counts.cells)) assert.match(k, /^[a-z_]+\|[1-7]\|[A-ZÞÐÆÖa-z0-9-]*\|[0-5]$/);

  /* the allowance: the account, today */
  const q = await readJSON(dir, "calibration-quota.json");
  assert.equal(q.day, "2026-11-17");
  assert.deepEqual(Object.keys(q.by), [u.id]);
  assert.deepEqual([q.by[u.id].q, q.by[u.id].recs], [2, 3]);

  /* tomorrow it is replaced, not added to */
  const other = await addUser(app, "onnur");
  await app.calibration.accept(other, { events: [ev("fill", 3, true)] }, T0 + DAY);
  const q2 = await readJSON(dir, "calibration-quota.json");
  assert.equal(q2.day, "2026-11-18");
  assert.deepEqual(Object.keys(q2.by), [other.id], "yesterday's allowances are gone");

  /* erasing the account takes it out at once; the anonymous counts stay */
  await app.store.eraseUser(other.id);
  assert.deepEqual((await readJSON(dir, "calibration-quota.json")).by, {});
  assert.equal((await readJSON(dir, "calibration.json")).counts.types["fill|3"][1], 2);

  /* a backup carries the counts, and not the allowance */
  const all = await app.store.exportAll();
  assert.ok(all.calibration.counts && all.samples);
  assert.ok(!JSON.stringify(all.calibration).includes(u.id));
  assert.equal(Object.keys(all).some((k) => /quota/i.test(k)), false);
});

/* ---------- 3. the routes -------------------------------------------------------- */

test("the routes: a logged-in learner sends answers and reads the table; nobody else's business", async () => {
  const { app, base } = S;
  await addUser(app, "jon", {}, { login: true });
  assert.equal((await client(base)("GET", "/calibration")).status, 401);
  assert.equal((await client(base)("POST", "/calibration/answers", { events: [] })).status, 401);
  assert.equal((await client(base)("GET", "/admin/calibration")).status, 401);

  const c = await loggedIn(base, "jon");
  const got = await c("GET", "/calibration");
  assert.deepEqual(got.data, { on: true, table: null, collect: true, samples: false,
    canCount: true, choice: null, byDefault: true });

  const sent = await c("POST", "/calibration/answers", { events: [
    ev("fill", 3, true, [["ÞGFET", 2, 1]]),
    { t: "fill", l: 3, ok: true, recs: [], typed: "ég heiti Jón", name: "Jón" },     // extra fields are not read
    { t: "<script>", l: 3, ok: true }, "rusl",
  ], somethingElse: "x" });
  assert.equal(sent.status, 200);
  assert.deepEqual([sent.data.counted, sent.data.records, sent.data.samples], [2, 1, 0]);
  assert.ok(!JSON.stringify(await app.store.calibration()).includes("heiti"));

  for (const junk of [{}, { events: "x" }, { events: [null, 3] }, []])
    assert.deepEqual([(await c("POST", "/calibration/answers", junk)).data.counted], [0]);

  assert.equal((await c("GET", "/admin/calibration")).status, 403, "the record is the administrator's");
  assert.equal((await c("GET", "/admin/classifier/samples.json")).status, 403);
  assert.equal((await c("DELETE", "/admin/classifier/samples")).status, 403);
});

test("the account's own switch: off stops the counting at once, and it is in their export", async () => {
  const { app, base } = S;
  await addUser(app, "gudrun", {}, { login: true });
  const c = await loggedIn(base, "gudrun");
  assert.equal((await c("POST", "/calibration/answers", { events: [ev("verb", 2, true)] })).data.counted, 1);

  const off = await c("POST", "/account/stats", { on: false });
  assert.deepEqual(off.data, { ok: true, choice: false, collect: false });
  const sent = await c("POST", "/calibration/answers", { events: [ev("verb", 2, true)] });
  assert.deepEqual([sent.data.counted, sent.data.collect], [0, false]);
  const got = await c("GET", "/calibration");
  assert.deepEqual([got.data.collect, got.data.choice, got.data.byDefault], [false, false, true]);
  assert.equal((await c("GET", "/account/export")).data.account.countedInStatistics, false);

  const on = await c("POST", "/account/stats", { on: true });
  assert.deepEqual(on.data, { ok: true, choice: true, collect: true });
  /* anything but `true` is off */
  assert.equal((await c("POST", "/account/stats", { on: "yes" })).data.choice, false);
});

/* ---------- 4. bounded ----------------------------------------------------------- */

test("one account, one day: a cap on requests, on answers, and on answers towards any one number", async () => {
  const { app } = await serve();
  const u = await addUser(app, "akafur");
  /* 40 answers to ONE type-and-level, each with the same cell: only the
     per-number caps' worth is counted. */
  const same = batch("fill", 3, CAL.perPost, 0).map((e) => ({ ...e, recs: [["ÞGFET", 2, 0]] }));
  const r1 = await app.calibration.accept(u, { events: same }, T0);
  assert.equal(r1.counted, CAL.unitType);
  assert.equal(r1.records, CAL.unitCell);
  const r2 = await app.calibration.accept(u, { events: same }, T0);
  assert.deepEqual([r2.counted, r2.records], [0, 0], "the same number again today: nothing more");
  let c = await app.store.calibration();
  assert.deepEqual(c.counts.types, { "fill|3": [0, CAL.unitType] });

  /* different types and levels: up to the day's total, and no further */
  const types = ["fill", "verb", "tbl_no", "govern", "parse", "tbl_so", "tbl_lo", "indecl", "syntax", "clause"];
  let counted = 0;
  for (let k = 0; k < 30; k++) {
    const events = Array.from({ length: CAL.perPost }, (_, i) => ev(types[(k + i) % 10], 1 + ((k * 7 + i) % 7), true));
    counted += (await app.calibration.accept(u, { events }, T0)).counted;
  }
  const q = (await app.store.calibrationQuota()).by[u.id];
  assert.equal(q.q, CAL.perDay, "questions looked at today");
  assert.ok(counted + CAL.unitType <= CAL.perDay);
  c = await app.store.calibration();
  const total = Object.values(c.counts.types).reduce((n, v) => n + v[1], 0);
  assert.ok(total <= CAL.perDay, `${total} answers from one account in one day`);
  for (const [k, v] of Object.entries(c.counts.types)) assert.ok(v[1] <= CAL.unitType, `${k}: ${v[1]}`);

  /* …and requests: after CAL.postsPerDay the door is shut until tomorrow */
  let last = null;
  for (let k = 0; k < CAL.postsPerDay; k++) last = await app.calibration.accept(u, { events: [] }, T0);
  assert.deepEqual(last, { limit: true });
  assert.equal((await app.calibration.accept(u, { events: [ev("fill", 1, true)] }, T0 + DAY)).counted, 1);
});

test("the table of counts cannot grow past its size, whatever is sent", async () => {
  const { app } = await serve();
  const marks = Object.values((await import("../data/data_bundle.js")).DATA.lex.orders).flat();
  const types = ["fill", "verb", "tbl_no", "tbl_so", "tbl_lo", "tbl_fn", "revform"];
  let made = 0;
  /* Twelve accounts, each a day's worth of records on keys nobody has used. */
  for (let a = 0; a < 12; a++) {
    const u = await addUser(app, "fjoldi" + a);
    for (let p = 0; p < 4; p++) {
      const events = Array.from({ length: CAL.perPost }, (_, i) => {
        const n = a * 4 * CAL.perPost + p * CAL.perPost + i;
        return ev(types[n % 7], 1 + (Math.floor(n / 7) % 7), true,
          Array.from({ length: CAL.recsPerQuestion }, (_, k) => [marks[(n * 31 + k * 7) % marks.length], 0, 1]));
      });
      made += (await app.calibration.accept(u, { events }, T0 + a * DAY)).records;
    }
  }
  const c = await app.store.calibration();
  const keys = Object.keys(c.counts.cells).length;
  assert.ok(made > CAL.maxKeys, `the test did send more new keys than fit (${made})`);
  assert.equal(keys, CAL.maxKeys, "full, and not one key over");
  /* and the weekly run shrinks it: counts fade and faded keys are dropped */
  for (let w = 1; w <= 12; w++) await app.calibration.run(T0 + (20 + 7 * w) * DAY, { force: true });
  assert.ok(Object.keys((await app.store.calibration()).counts.cells).length < keys / 2);
});

/* ---------- 5. the run, and a flood ------------------------------------------------ */

const PEERS = ["verb", "tbl_no", "govern", "parse"];

/** A day of honest practice: each pupil answers every type at level 3. */
async function honestDay(app, pupils, when, fillShare = 0.8) {
  for (const u of pupils) {
    const events = [...batch("fill", 3, CAL.unitType, fillShare)];
    for (const t of PEERS) events.push(...batch(t, 3, CAL.unitType, 0.8));
    await app.calibration.accept(u, { events: events.slice(0, CAL.perPost) }, when);
    await app.calibration.accept(u, { events: events.slice(CAL.perPost) }, when);
  }
}

test("a flood from one account moves nothing by itself, and at most one step with a class behind it", async () => {
  /* (a) the flooder alone on the server */
  const A = await serve();
  const bad = await addUser(A.app, "flod");
  for (let d = 0; d < 30; d++)
    for (let k = 0; k < 5; k++) await A.app.calibration.accept(bad, { events: batch("fill", 3, CAL.perPost, 0) }, T0 + d * DAY);
  let c = await A.app.store.calibration();
  assert.equal(c.counts.types["fill|3"][1], 30 * CAL.unitType, "6000 sent, 360 counted");
  const alone = await A.app.calibration.run(T0 + 30 * DAY, { force: true });
  assert.deepEqual(alone.changes, []);
  assert.equal(alone.note, "of fáir nemendur", "one pupil is not a measurement");
  assert.equal((await A.app.calibration.table()), null);

  /* (b) four honest pupils for a week, and the same flooder every day */
  const B = await serve();
  const pupils = [];
  for (let k = 0; k < 4; k++) pupils.push(await addUser(B.app, "nemandi" + k));
  const flooder = await addUser(B.app, "flod");
  for (let d = 0; d < 7; d++) {
    await honestDay(B.app, pupils, T0 + d * DAY);
    for (let k = 0; k < 10; k++)
      await B.app.calibration.accept(flooder, { events: batch("fill", 3, CAL.perPost, 0) }, T0 + d * DAY);
  }
  c = await B.app.store.calibration();
  const [right, n] = c.counts.types["fill|3"];
  assert.equal(n, 7 * 5 * CAL.unitType, "the flooder is one account among five, not 2800 answers");
  assert.ok(right / n > 0.6, `the share right is still ${right / n}`);
  const run1 = await B.app.calibration.run(T0 + 7 * DAY, { force: true });
  const table = cleanTable(await B.app.calibration.table());
  const shift = typeShift(table, "fill", 3);
  assert.ok(shift === 0 || shift === -CAL.step, `one step at the very most, got ${shift}`);
  assert.ok(run1.changes.every((x) => x.id === "fill"), "and no other type is touched");
  for (const t of PEERS) assert.equal(typeShift(table, t, 3), 0);
});

test("the run: a class that finds one type hard moves it a step; logged, audited, published, and not again for a week", async () => {
  const { app, base } = await serve();
  const pupils = [];
  for (let k = 0; k < 4; k++) pupils.push(await addUser(app, "nemandi" + k, {}, { login: k === 0 }));
  await addUser(app, "stjori", { role: "admin" }, { login: true });

  /* the first look sets the clock and changes nothing */
  const first = await app.calibration.run(T0);
  assert.deepEqual([first.run, first.changes.length], [1, 0]);
  assert.equal(await app.calibration.run(T0 + DAY), null, "not due");
  assert.equal(await app.calibration.run(T0 + 6.9 * DAY), null, "still not due");

  for (let d = 0; d < 6; d++) await honestDay(app, pupils, T0 + d * DAY, 0.4);
  const before = await app.store.calibration();
  assert.equal(before.counts.types["fill|3"][1], 6 * 4 * CAL.unitType);
  assert.equal(before.counts.distinct["T:fill|3"], 4, "four accounts on one day");

  const entry = await app.calibration.run(T0 + 7 * DAY);
  assert.ok(entry, "due after seven days");
  assert.equal(entry.pupils, 4);
  assert.equal(entry.changes.length, 1);
  const ch = entry.changes[0];
  assert.deepEqual([ch.k, ch.id, ch.band, ch.from, ch.to], ["type", "fill", 3, 0, -0.25]);
  assert.equal(ch.n, 288);
  assert.ok(Math.abs(ch.p - 5 / 12) < 0.01 && Math.abs(ch.base - 10 / 12) < 0.01, "the log says why");

  const after = await app.store.calibration();
  assert.equal(after.counts.types["fill|3"], undefined, "the moved type is measured afresh");
  assert.ok(after.counts.types["verb|3"][1] < before.counts.types["verb|3"][1], "the rest has faded a little");
  assert.equal(after.log.length, 2);
  assert.ok((await app.store.audit()).some((a) => a.by === "kerfi" && a.act === "kvörðun"), "in the audit trail");

  /* a browser gets it */
  const c = await loggedIn(base, "nemandi0");
  const got = await c("GET", "/calibration");
  assert.equal(typeShift(cleanTable(got.data.table), "fill", 3), -0.25);
  assert.equal(got.data.table.at, new Date(T0 + 7 * DAY).toISOString());

  /* and the administrator's record says what happened, without a name in it */
  const admin = await loggedIn(base, "stjori");
  const rep = (await admin("GET", "/admin/calibration")).data;
  assert.equal(rep.on, true);
  assert.equal(rep.runs, 2);
  assert.equal(rep.log[0].changes[0].id, "fill");
  assert.equal(rep.periodDays, CAL.periodDays);
  for (const u of pupils) assert.ok(!JSON.stringify(rep).includes(u.id) && !JSON.stringify(rep).includes(u.username));
});

/* ---------- 6. the sample of wrong answers (item 38) ------------------------------- */

const hest = { t: "fill", w: "hestur|kk", m: "ÞGFET", typed: "hest", right: "hesti", p: ["thf_thgf"] };

test("the sample is off until the group's own teacher switches it on, and that is audited", async () => {
  const { app, base, dir } = await serve();
  await app.store.updateGroups((g) => { g.h8a = { name: "8.A" }; g.h8b = { name: "8.B" }; return g; });
  const pupil = await addUser(app, "nemi", { group: "h8a" }, { login: true });
  const teacher = await addUser(app, "kennari-a", { role: "guardian", group: "h8a" }, { login: true });
  await addUser(app, "kennari-b", { role: "guardian", group: "h8b" }, { login: true });
  await addUser(app, "stjori", { role: "admin" }, { login: true });

  /* default: off — a sample sent anyway is not kept */
  const p = await loggedIn(base, "nemi");
  assert.equal((await p("GET", "/calibration")).data.samples, false);
  const r0 = await p("POST", "/calibration/answers", { events: [ev("fill", 3, false)], samples: [hest] });
  assert.deepEqual([r0.data.counted, r0.data.samples], [1, 0]);
  assert.equal(await readJSON(dir, "samples.json"), null);

  /* who may switch it: not the pupil, not another group's teacher */
  assert.equal((await p("POST", "/teacher/samples", { group: "h8a", on: true })).status, 403);
  const tb = await loggedIn(base, "kennari-b");
  assert.equal((await tb("POST", "/teacher/samples", { group: "h8a", on: true })).status, 403);
  assert.equal((await tb("GET", "/teacher/samples?group=h8a")).status, 403);
  assert.equal((await client(base)("POST", "/teacher/samples", { group: "h8a", on: true })).status, 401);

  const ta = await loggedIn(base, "kennari-a");
  assert.deepEqual((await ta("GET", "/teacher/samples")).data,
    { group: { id: "h8a", name: "8.A" }, on: false, available: true });
  assert.deepEqual((await ta("POST", "/teacher/samples", { group: "h8a", on: true })).data, { ok: true, on: true });
  assert.equal((await app.store.groups()).h8a.name, "8.A", "the group keeps its name");
  assert.equal((await app.store.groups()).h8b.samples, undefined, "the other group is untouched");
  const trail = await app.store.audit();
  assert.ok(trail.some((a) => a.by === teacher.id && a.act === "kveikti á svarasýni" && a.note === "h8a"));

  /* now the pupil's page is told, and a wrong form is kept */
  assert.equal((await p("GET", "/calibration")).data.samples, true);
  const r1 = await p("POST", "/calibration/answers", { events: [], samples: [hest] });
  assert.equal(r1.data.samples, 1);
  const kept = await readJSON(dir, "samples.json");
  assert.deepEqual(kept.list, [{ ...hest, mo: new Date().toISOString().slice(0, 7) }]);
  const text = JSON.stringify(kept);
  for (const secret of [pupil.id, "nemi", "h8a", "8.A"]) assert.ok(!text.includes(secret), secret);

  /* the pupil's own switch takes them out of it */
  await p("POST", "/account/stats", { on: false });
  assert.equal((await p("GET", "/calibration")).data.samples, false);
  assert.equal((await p("POST", "/calibration/answers", { events: [], samples: [hest] })).data.samples, 0);
  await p("POST", "/account/stats", { on: true });

  /* a pupil of the other group: still off */
  const other = await addUser(app, "annar", { group: "h8b" });
  assert.equal(await app.calibration.sampled(other), false);
  assert.equal((await app.calibration.accept(other, { events: [], samples: [hest] }, T0)).samples, 0);

  /* the administrator may switch it for any group; off again stops it */
  const ad = await loggedIn(base, "stjori");
  assert.equal((await ad("POST", "/teacher/samples", { group: "h8a", on: false })).data.on, false);
  assert.equal((await ad("POST", "/teacher/samples", { group: "ekki-til", on: true })).status, 404);
  assert.equal((await p("POST", "/calibration/answers", { events: [], samples: [hest] })).data.samples, 0);
  assert.equal((await readJSON(dir, "samples.json")).list.length, 1);

  /* FALLASKOLI_SAMPLES=0 overrides every group */
  const off = await serve({ FALLASKOLI_SAMPLES: "0" });
  await off.app.store.updateGroups((g) => { g.default = { name: "Aðalhópur", samples: true }; return g; });
  const u = await addUser(off.app, "x1");
  assert.equal(off.app.calibration.counted(u), true, "the counting is still on");
  assert.equal(await off.app.calibration.sampled(u), false);
});

test("only an attempt at the word is kept: one word, letters, near a form of it", () => {
  const lex = S.app.lex;
  assert.deepEqual(cleanSample(lex, hest), hest);
  assert.deepEqual(cleanSample(lex, { ...hest, typed: "  Hest. ", extra: "x", name: "Jón" }), hest, "tidied, extras dropped");
  const refuse = {
    "a sentence": "ég veit það ekki", "a name": "sigurður", "a number": "112", "an address": "jon@example.is",
    "nothing like the word": "bíll", "empty": "", "the right answer": "hesti", "too long": "hest" + "a".repeat(40),
    "markup": "<b>hest</b>",
  };
  for (const [why, typed] of Object.entries(refuse)) assert.equal(cleanSample(lex, { ...hest, typed }), null, why);
  assert.equal(cleanSample(lex, { ...hest, w: "ekkiorð|kk" }), null, "not a word of the lexicon");
  assert.equal(cleanSample(lex, { ...hest, m: "GM-NH" }), null, "not a cell of the word");
  assert.equal(cleanSample(lex, { ...hest, right: "eitthvað annað" }), null, "the expected form is one of the cell's");
  assert.equal(cleanSample(lex, { ...hest, t: "x".repeat(50) }), null);
  assert.deepEqual(cleanSample(lex, { ...hest, p: ["thf_thgf", "ekki-mynstur", 7, "ogreint"] }).p, ["thf_thgf"]);
  /* a made-up form of the word is exactly what the sample is for */
  assert.equal(cleanSample(lex, { ...hest, typed: "hestinu", p: ["ending"] }).typed, "hestinu");
  assert.equal(cleanSample(lex, { t: "verb", w: "hlaupa|so", m: "GM-FH-ÞT-3P-ET", typed: "hlaupaði",
    right: "hljóp", p: ["sterk_veik_sogn"], conj: "sterk" }).conj, "sterk");
});

test("the sample is bounded: per account per day, in all, and in time", async () => {
  const { app } = await serve();
  await app.store.updateGroups((g) => { g.default = { name: "Aðalhópur", samples: true }; return g; });
  /* plenty of real wrong forms: the nominative where the dative was asked */
  const pool = [];
  for (const w of app.lex.nouns) {
    const nf = (w.forms.NFET || [])[0], dat = (w.forms["ÞGFET"] || [])[0];
    if (!nf || !dat || nf === dat || /\s/.test(nf)) continue;
    const s = cleanSample(app.lex, { t: "fill", w: `${w.o}|${w.c}`, m: "ÞGFET", typed: nf, right: dat, p: ["nf_aukafall"] });
    if (s) pool.push(s);
    if (pool.length >= 900) break;
  }
  assert.ok(pool.length >= 700, `the lexicon gives ${pool.length} samples`);

  const u = await addUser(app, "idinn");
  let kept = 0;
  for (let k = 0; k < 6; k++)
    kept += (await app.calibration.accept(u, { events: [], samples: pool.slice(k * 10, k * 10 + 10) }, T0)).samples;
  assert.equal(kept, SAMPLE.perDay, "per request " + SAMPLE.perPost + ", per day " + SAMPLE.perDay);

  /* a month of it from one account: the sample fills up and stops growing */
  let at = SAMPLE.perDay;
  for (let d = 1; d <= 34; d++)
    for (let k = 0; k < 4; k++, at += SAMPLE.perPost)
      await app.calibration.accept(u, { events: [], samples: pool.slice(at % 690, (at % 690) + SAMPLE.perPost) }, T0 + d * DAY);
  let s = await app.store.samples();
  assert.equal(s.list.length, SAMPLE.keep);
  assert.ok(s.seen > SAMPLE.keep);
  assert.deepEqual([...new Set(s.list.flatMap((x) => Object.keys(x)))].sort(), ["m", "mo", "p", "right", "t", "typed", "w"]);

  /* thirteen months on, one new answer: everything older has expired */
  const later = new Date(T0); later.setUTCMonth(later.getUTCMonth() + SAMPLE.months + 2);
  await app.calibration.accept(u, { events: [], samples: [pool[0]] }, later.getTime());
  s = await app.store.samples();
  assert.equal(s.list.length, 1);
});

test("the automatic check: agreement between classifier and rule, by pattern, on the administrator's page", async () => {
  const { app, base } = await serve();
  await app.store.updateGroups((g) => { g.default = { name: "Aðalhópur", samples: true }; return g; });
  const u = await addUser(app, "nemi");
  await addUser(app, "stjori", { role: "admin" }, { login: true });
  const samples = [
    hest,                                                                       // agrees
    { t: "fill", w: "hestur|kk", m: "EFET", typed: "hestur", right: "hests", p: ["ef"] },      // agrees
    { t: "tbl_no", w: "hestur|kk", m: "NFET", typed: "hestar", right: "hestur", p: ["tala"] }, // agrees
    { t: "fill", w: "hestur|kk", m: "ÞGFETgr", typed: "hestinu", right: "hestinum", p: ["ending"] }, // no form: agrees
    { t: "fill", w: "hestur|kk", m: "ÞGFET", typed: "hest", right: "hesti", p: ["tala"] },     // a wrong reading
    { t: "fill", w: "hestur|kk", m: "ÞGFET", typed: "hestur", right: "hesti", p: ["ending"] }, // a cell called a misspelling
  ];
  const r = await app.calibration.accept(u, { events: [], samples }, T0);
  assert.equal(r.samples, 6);

  const admin = await loggedIn(base, "stjori");
  const c = (await admin("GET", "/admin/calibration")).data.classifier;
  assert.deepEqual([c.kept, c.cap, c.groupsOn, c.n, c.disagree], [6, SAMPLE.keep, 1, 6, 2]);
  const row = (p) => c.byPattern.find((x) => x.p === p);
  assert.deepEqual([row("tala").n, row("tala").disagree, row("tala").rate], [2, 1, 0.5]);
  assert.deepEqual([row("ending").n, row("ending").disagree], [2, 1]);
  assert.deepEqual([row("thf_thgf").n, row("thf_thgf").disagree, row("ef").disagree], [1, 0, 0]);
  assert.equal(row("tala").name, "Eintala og fleirtala", "named as the pupil sees it");

  /* the same samples as a file, in the fixture's format — and nothing else in it */
  const file = (await admin("GET", "/admin/classifier/samples.json")).data;
  assert.equal(file.v, 1);
  assert.equal(file.samples.length, 6);
  assert.deepEqual(Object.keys(file.samples.find((x) => x.typed === "hestar")).sort(), ["m", "p", "right", "t", "typed", "w"]);
  for (const x of file.samples) assert.deepEqual(cleanSample(app.lex, x), x, "every exported sample is a clean one");

  assert.deepEqual((await admin("DELETE", "/admin/classifier/samples")).data, { ok: true });
  assert.equal((await admin("GET", "/admin/calibration")).data.classifier.kept, 0);
  assert.ok((await app.store.audit()).some((a) => a.act === "eyddi svarasýni"));
});

/* ---------- 7. the notice says so ---------------------------------------------------- */

test("the privacy notice describes the counting and the sample, with the server's own numbers", () => {
  const html = privacyPage(privacyConfig({ FALLASKOLI_CONTROLLER: "X", FALLASKOLI_CONTACT: "x@x.is" }));
  assert.ok(PRIVACY_VERSION >= "2026-11-17", "a new version for new processing");
  assert.ok(html.includes(`Síðast breytt ${PRIVACY_VERSION}`));
  assert.ok(html.includes("Nafnlaus talning"));
  assert.ok(html.includes("Aðeins ef kennari hópsins þíns kveikir á því"));
  assert.ok(html.includes(`mest ${SAMPLE.keep} svör`));
  assert.ok(html.includes(`eftir ${SAMPLE.months} mánuði`));
  assert.ok(html.includes("slökkt á því fyrir þig"), "the short version says it can be switched off");
  /* items 62/63/66: a duel's answers go to the server to be graded, and are not kept */
  assert.ok(/Í einvígi eru svörin þín send á þjóninn/.test(html) && /ekki svörin sjálf/.test(html));
});
