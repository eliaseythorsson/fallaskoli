/* v6.3 — people: who gets in, who agreed, who sees whom, and how they leave.
 *
 * Through real HTTP requests, like tests/server.test.js, and with the server's
 * DEFAULTS: an invitation is required, and nobody is shown to anybody.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server/server.mjs";
import { hashPassword, newId } from "../server/auth.mjs";
import { seal, open } from "../server/backup.mjs";
import { blankState } from "../src/js/core/state.js";

let base, dir, app, html;
const PW = "lykilordid-mitt";
const today = () => new Date().toISOString().slice(0, 10);

before(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "fallaskoli-acc-"));
  html = path.join(dir, "app.html");
  await fs.writeFile(html, "<!DOCTYPE html><title>x</title>" + "orð ".repeat(5000));
  app = createApp({ dataDir: path.join(dir, "data"), htmlFile: html, secureCookies: false,
    env: { FALLASKOLI_TRUST_PROXY: "1", FALLASKOLI_CONTROLLER: "Prófari", FALLASKOLI_CONTACT: "p@example.is" } });
  await app.store.init();
  await new Promise((r) => app.server.listen(0, r));
  base = "http://127.0.0.1:" + app.server.address().port;
});

after(async () => {
  await new Promise((r) => app.server.close(r));
  await fs.rm(dir, { recursive: true, force: true });
});

let ipSeq = 10;
/** A browser: remembers its cookie, and has its own address (so the per-address
    limits in one test do not spill into the next). */
function client(ip = "10.0.0." + (ipSeq++)) {
  let cookie = null;
  const call = async (method, p, body, headers = {}) => {
    const r = await fetch(base + p, {
      method,
      headers: {
        "Fly-Client-IP": ip,
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
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
  call.login = (username, password = PW) => call("POST", "/auth/login", { username, password });
  return call;
}

async function makeUser(username, extra = {}) {
  const { salt, hash } = await hashPassword(PW);
  let user;
  await app.store.updateUsers((users) => {
    user = { id: newId(), username, name: username, role: "learner", status: "active",
      group: "default", salt, hash, created: new Date().toISOString(), lastSeen: today(),
      consent: { by: "self", over16: true, at: new Date().toISOString(), how: "admin" },
      ...extra };
    users.push(user);
    return users;
  });
  return user;
}

let adminClient = null;
async function admin() {
  if (adminClient) return adminClient;
  await makeUser("stjori", { role: "admin", consent: undefined });
  adminClient = client();
  assert.equal((await adminClient.login("stjori")).status, 200);
  return adminClient;
}

/* ---------- getting in ---------------------------------------------------- */

test("without an invitation there is no registering", async () => {
  const r = await client()("POST", "/auth/register",
    { username: "gestur", password: "langtlykilord", over16: true, consent: true });
  assert.equal(r.status, 403);
  assert.equal((await app.store.users()).some((u) => u.username === "gestur"), false);
});

test("an invitation lets a family in, into its group, with the guardian's name as the consent", async () => {
  const a = await admin();
  const g = await a("POST", "/admin/groups", { name: "Fjölskyldan á 12" });
  assert.equal(g.status, 200);
  const inv = await a("POST", "/admin/invites", { group: g.data.group.id, max: 2, days: 7, note: "nr. 12" });
  assert.equal(inv.status, 200);
  const code = inv.data.invite.code;
  assert.match(code, /^\S+-\S+-\S+-\d{3}$/);

  /* under sixteen and nobody has signed: refused, and nothing is created */
  const c = client();
  const bare = await c("POST", "/auth/register",
    { invite: code, username: "anna", password: "langtlykilord", over16: false, consent: true });
  assert.equal(bare.status, 400);
  assert.match(bare.data.error, /forsjáraðili/);

  /* the box not ticked: refused */
  const unticked = await c("POST", "/auth/register",
    { invite: code, username: "anna", password: "langtlykilord", over16: false, guardian: "Guðrún Jónsdóttir" });
  assert.equal(unticked.status, 400);

  const ok = await c("POST", "/auth/register", {
    invite: code, username: "anna", name: "Anna Banana", password: "langtlykilord",
    over16: false, guardian: "Guðrún Jónsdóttir", consent: true });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.status, "active", "an invited user should not have to wait");
  assert.equal((await c.login("anna", "langtlykilord")).status, 200);

  const u = (await app.store.users()).find((x) => x.username === "anna");
  assert.equal(u.group, g.data.group.id);
  assert.equal(u.consent.by, "Guðrún Jónsdóttir");
  assert.equal(u.consent.over16, false);
  assert.ok(u.consent.at && u.consent.notice, "consent must say when, and to which notice");
  assert.equal(u.name, "Anna Banana");

  /* good for two accounts and no more */
  const second = await client()("POST", "/auth/register",
    { invite: code, username: "bjarni", password: "langtlykilord", over16: true, consent: true });
  assert.equal(second.status, 200);
  assert.equal((await app.store.users()).find((x) => x.username === "bjarni").consent.by, "self");
  const third = await client()("POST", "/auth/register",
    { invite: code, username: "dora", password: "langtlykilord", over16: true, consent: true });
  assert.equal(third.status, 400, "a used-up invitation still worked");
});

test("a made-up invitation code is refused, and guessing is limited per address", async () => {
  const c = client("10.9.9.9");
  let last = null;
  for (let i = 0; i < 12; i++) {
    last = await c("POST", "/auth/register",
      { invite: "hestur-fjall-alda-" + (100 + i), username: "giskari" + i, password: "langtlykilord",
        over16: true, consent: true });
  }
  assert.equal(last.status, 429);
  assert.equal((await app.store.users()).some((u) => u.username.startsWith("giskari")), false);
});

test("the administrator makes an account from the page; a learner needs consent recorded", async () => {
  const a = await admin();
  const bad = await a("POST", "/admin/users", { username: "ekkert-samthykki" });
  assert.equal(bad.status, 400);

  const ok = await a("POST", "/admin/users", { username: "kari", name: "Kári", guardian: "Sigga pabbi" });
  assert.equal(ok.status, 200);
  assert.match(ok.data.password, /^\S+-\S+-\S+-\S+$/, "a generated, readable password");
  assert.equal(ok.data.user.hash, undefined);
  assert.equal(ok.data.user.consent.by, "Sigga pabbi");
  assert.equal((await client().login("kari", ok.data.password)).status, 200);
});

test("nobody under the consent age is admitted on the administrator's say-so alone", async () => {
  const a = await admin();
  const u = await makeUser("bidur-samthykkis", { status: "pending", consent: undefined });
  const no = await a("POST", `/admin/users/${u.id}`, { status: "active" });
  assert.equal(no.status, 400);
  assert.match(no.data.error, /samþykkti/);
  const yes = await a("POST", `/admin/users/${u.id}`,
    { consent: { guardian: "Mamma hans" }, status: "active" });
  assert.equal(yes.status, 200);
  assert.equal(yes.data.user.status, "active");
  assert.equal(yes.data.user.consent.by, "Mamma hans");
});

test("two administrators at most", async () => {
  const a = await admin();
  const b = await makeUser("vara-stjori"), c = await makeUser("thridji");
  assert.equal((await a("POST", `/admin/users/${b.id}`, { role: "admin" })).status, 200);
  const third = await a("POST", `/admin/users/${c.id}`, { role: "admin" });
  assert.equal(third.status, 400);
  await a("POST", `/admin/users/${b.id}`, { role: "learner" });
});

/* ---------- who sees whom -------------------------------------------------- */

test("nobody is on the board until they choose to be, and then only for their own group", async () => {
  const a = await admin();
  const other = (await a("POST", "/admin/groups", { name: "Hinn hópurinn" })).data.group.id;
  const me = await makeUser("sjalf"), friend = await makeUser("vinur");
  const stranger = await makeUser("okunnug", { group: other });
  for (const u of [me, friend, stranger])
    await app.store.putState(u.id, { ...blankState(), xp: 500, days: { [today()]: { a: 5, c: 5, xp: 500, ms: 600000 } } });

  const c = client(); await c.login("sjalf");
  const names = async () => (await c("GET", "/leaderboard?metric=xp")).data.map((r) => r.name);
  assert.deepEqual(await names(), [], "somebody was shown without having chosen it");

  const cf = client(); await cf.login("vinur");
  const cs = client(); await cs.login("okunnug");
  assert.equal((await cf("POST", "/account/share", { board: true })).status, 200);
  assert.equal((await cs("POST", "/account/share", { board: true })).status, 200);
  assert.deepEqual(await names(), ["vinur"], "the other group leaked onto the board, or the friend is missing");
  assert.deepEqual((await c("GET", "/roster")).data.map((r) => r.name), ["vinur"]);

  /* minutes are a separate switch */
  let row = (await c("GET", "/leaderboard?metric=xp")).data[0];
  assert.equal(row.minutes, null, "time at the screen was shown without being switched on");
  assert.equal("updated" in row, false, "the last-active date is back on the board");
  assert.deepEqual((await c("GET", "/leaderboard?metric=minutes")).data, []);
  await cf("POST", "/account/share", { board: true, minutes: true });
  row = (await c("GET", "/leaderboard?metric=minutes")).data[0];
  assert.equal(row.minutes, 10);

  /* and off again */
  await cf("POST", "/account/share", { board: false });
  assert.deepEqual(await names(), []);
});

/* ---------- two devices ---------------------------------------------------- */

test("a stale device cannot overwrite a fresh one", async () => {
  const u = await makeUser("tvo-taeki");
  const phone = client(), laptop = client();
  await phone.login("tvo-taeki"); await laptop.login("tvo-taeki");

  const first = await phone("PUT", `/state/${u.id}`, { ...blankState(), xp: 10 });
  assert.equal(first.status, 200);
  const rev = first.data.rev;
  assert.equal((await phone("GET", `/state/${u.id}`)).headers.get("x-state-rev"), String(rev));

  /* the laptop writes, based on what both saw */
  const lap = await laptop("PUT", `/state/${u.id}`, { ...blankState(), xp: 300 }, { "If-Match": `"${rev}"` });
  assert.equal(lap.status, 200);

  /* the phone, still on the old revision, is refused — and handed what is stored */
  const stale = await phone("PUT", `/state/${u.id}`, { ...blankState(), xp: 20 }, { "If-Match": `"${rev}"` });
  assert.equal(stale.status, 409);
  assert.equal(stale.data.state.xp, 300);
  assert.equal(stale.data.rev, lap.data.rev);
  assert.equal((await laptop("GET", `/state/${u.id}`)).data.xp, 300, "the stale write went through");
});

/* ---------- what is stored, and what is believed --------------------------- */

test("only progress is stored: junk is dropped, the name comes from the account, and size is bounded", async () => {
  const u = await makeUser("hreinn");
  const c = client(); await c.login("hreinn");
  const dirty = { ...blankState(), xp: 50, essay: "x".repeat(5000),
    profile: { id: "someone-else", name: "<b>Kennarinn</b>" },
    badges: { not_a_badge: { n: 1, dates: [today()] } },
    days: { [today()]: { a: 3, c: 3, xp: 50 }, "ekki-dagur": { xp: 9 }, "2999-01-01": { xp: 9 } } };
  assert.equal((await c("PUT", `/state/${u.id}`, dirty)).status, 200);
  const stored = (await c("GET", `/state/${u.id}`)).data;
  assert.equal(stored.essay, undefined);
  assert.deepEqual(stored.profile, { id: u.id, name: "hreinn" });
  assert.deepEqual(Object.keys(stored.badges), []);
  assert.deepEqual(Object.keys(stored.days), [today()]);

  const huge = await c("PUT", `/state/${u.id}`, { ...blankState(), pad: "x".repeat(3 * 1024 * 1024) });
  assert.equal(huge.status, 413);
});

test("an XP figure practice cannot produce is stored but kept off the board until looked at", async () => {
  const a = await admin();
  const u = await makeUser("svindl", { share: { board: true, minutes: false } });
  const watcher = await makeUser("ahorfandi", { share: { board: true, minutes: false } });
  const c = client(); await c.login("svindl");
  const w = client(); await w.login("ahorfandi");
  await w("PUT", `/state/${watcher.id}`, { ...blankState(), xp: 1 });

  const honest = { ...blankState(), xp: 200, days: { [today()]: { a: 20, c: 18, xp: 200 } } };
  const r1 = await c("PUT", `/state/${u.id}`, honest);
  assert.equal(r1.status, 200);
  const onBoard = async () => (await w("GET", "/leaderboard?metric=xp")).data.some((r) => r.name === "svindl");
  assert.equal(await onBoard(), true);

  /* XP typed in by hand: the total jumps and no day accounts for it */
  const r2 = await c("PUT", `/state/${u.id}`, { ...honest, xp: 999999 }, { "If-Match": `"${r1.data.rev}"` });
  assert.equal(r2.status, 200, "the write itself must not be refused — nothing is taken from the child");
  assert.equal(await onBoard(), false, "an impossible score is on the board");
  assert.equal((await c("GET", "/auth/me")).data.profile.review, true);

  const row = (await a("GET", "/admin/users")).data.find((x) => x.id === u.id);
  assert.match(row.review.why, /XP/);
  assert.equal((await a("POST", `/admin/users/${u.id}`, { review: false })).status, 200);
  assert.equal(await onBoard(), true);
});

/* ---------- the rights in the notice --------------------------------------- */

test("a user can see everything held about them, rename themselves and change the password", async () => {
  const u = await makeUser("rettindi");
  const c = client(), other = client();
  await c.login("rettindi"); await other.login("rettindi");
  await c("PUT", `/state/${u.id}`, { ...blankState(), xp: 77 });

  const exp = await c("GET", "/account/export");
  assert.equal(exp.status, 200);
  assert.match(exp.headers.get("content-disposition"), /attachment/);
  assert.equal(exp.data.account.username, "rettindi");
  assert.equal(exp.data.account.consent.by, "self");
  assert.equal(exp.data.progress.xp, 77);
  assert.equal(JSON.stringify(exp.data).includes(u.hash), false, "the password hash is in the export");

  assert.equal((await c("POST", "/account/name", { name: "Réttindi R" })).status, 200);
  assert.equal((await c("GET", "/auth/me")).data.profile.name, "Réttindi R");
  assert.equal((await c("POST", "/account/name", { name: "x" })).status, 400);

  assert.equal((await c("POST", "/account/password", { current: "rangt", password: "nytt-lykilord-1" })).status, 403);
  assert.equal((await c("POST", "/account/password", { current: PW, password: "nytt-lykilord-1" })).status, 200);
  assert.equal((await c("GET", "/auth/me")).status, 200, "the device that changed it was logged out");
  assert.equal((await other("GET", "/auth/me")).status, 401, "the other device is still logged in");
  assert.equal((await client().login("rettindi", "nytt-lykilord-1")).status, 200);
});

test("deleting an account leaves nothing that names the person", async () => {
  const a = await admin();
  const u = await makeUser("hverfur", { name: "Hverfandi Hildur" });
  const c = client(); await c.login("hverfur");
  await c("PUT", `/state/${u.id}`, { ...blankState(), xp: 5 });
  await a("PUT", `/admin/users/${u.id}/policy`, { policy: {} });
  await a("POST", "/admin/leaderboard", { hidden: [u.id] });

  assert.equal((await c("POST", "/account/delete", { password: "rangt" })).status, 403);
  assert.equal((await c("POST", "/account/delete", { password: PW })).status, 204);
  assert.equal((await c("GET", "/auth/me")).status, 401);
  assert.equal((await client().login("hverfur")).status, 401);

  const files = await fs.readdir(path.join(dir, "data"), { recursive: true });
  for (const f of files) {
    const full = path.join(dir, "data", f);
    if ((await fs.stat(full)).isDirectory()) continue;
    const text = await fs.readFile(full, "utf8");
    assert.equal(text.includes("Hverfandi Hildur"), false, "the name survives in " + f);
    assert.equal(text.includes("hverfur"), false, "the username survives in " + f);
    if (!f.endsWith("audit.json")) assert.equal(text.includes(u.id), false, "the id survives in " + f);
  }
  assert.equal((await app.store.state(u.id)), null);
});

test("the administrator's erase is the same erase, and the trail keeps ids, not names", async () => {
  const a = await admin();
  const u = await makeUser("eytt-af-stjora", { name: "Eydd Eva" });
  await app.store.putState(u.id, { ...blankState(), xp: 5 });
  assert.equal((await a("DELETE", `/admin/users/${u.id}`)).status, 204);
  assert.equal(await app.store.state(u.id), null);
  const trail = (await a("GET", "/admin/audit")).data;
  assert.ok(trail.some((e) => e.act === "eyddi aðgangi" && e.target === u.id));
  assert.equal(JSON.stringify(trail).includes("Eydd Eva"), false);
});

test("a new password from the administrator logs the user out everywhere", async () => {
  const a = await admin();
  const u = await makeUser("gleyminn");
  const c = client(); await c.login("gleyminn");
  const r = await a("POST", `/admin/users/${u.id}/password`);
  assert.equal(r.status, 200);
  assert.equal((await c("GET", "/auth/me")).status, 401);
  assert.equal((await client().login("gleyminn", r.data.password)).status, 200);
});

/* ---------- nothing is kept for ever ---------------------------------------- */

test("retention: unanswered requests and unused accounts are erased; administrators and fresh accounts are not", async () => {
  const old = (days) => new Date(Date.now() - days * 86400000).toISOString();
  const stale = await makeUser("gamall", { lastSeen: old(600).slice(0, 10) });
  const waiting = await makeUser("osvarad", { status: "pending", created: old(45), lastSeen: undefined });
  const recent = await makeUser("nylegur", { lastSeen: old(100).slice(0, 10) });
  const legacy = await makeUser("fyrir-v63", { lastSeen: undefined, created: old(900) });
  const oldAdmin = await makeUser("gamall-stjori", { role: "learner", lastSeen: old(900).slice(0, 10) });
  await app.store.updateUsers((users) => { users.find((u) => u.id === oldAdmin.id).role = "admin"; return users; });
  await app.store.putState(stale.id, { ...blankState(), xp: 5 });

  const out = await app.sweep();
  const gone = out.erased.map((e) => e.id);
  assert.ok(gone.includes(stale.id) && gone.includes(waiting.id));
  const left = (await app.store.users()).map((u) => u.id);
  assert.equal(left.includes(stale.id), false);
  assert.equal(left.includes(waiting.id), false);
  assert.ok(left.includes(recent.id) && left.includes(oldAdmin.id) && left.includes(legacy.id));
  assert.equal(await app.store.state(stale.id), null);
  assert.equal((await app.store.users()).find((u) => u.id === legacy.id).lastSeen, today(),
    "an account from before 'last seen' existed must get today's date, not be judged on none");
  await app.store.eraseUser(oldAdmin.id);
});

/* ---------- the guardian's reach -------------------------------------------- */

test("a guardian sets the ceiling of children in their own group, and nobody else's", async () => {
  const a = await admin();
  const g = (await a("POST", "/admin/groups", { name: "Bekkur B" })).data.group.id;
  await makeUser("forsja", { role: "guardian" });
  const mine = await makeUser("mitt-barn");
  const theirs = await makeUser("annarra-barn", { group: g });
  const c = client(); await c.login("forsja");
  assert.equal((await c("PUT", `/admin/users/${mine.id}/policy`, { policy: {} })).status, 200);
  assert.equal((await c("PUT", `/admin/users/${theirs.id}/policy`, { policy: {} })).status, 403);
  assert.equal((await c("PUT", "/admin/policy", { policy: {} })).status, 403,
    "a guardian changed the default for the whole server");
  assert.equal((await c("GET", "/admin/users")).status, 403);
});

/* ---------- the door --------------------------------------------------------- */

test("wrong guesses from one address do not lock the child out from another", async () => {
  await makeUser("laest-uti");
  const attacker = client("203.0.113.9");
  for (let i = 0; i < 12; i++) await attacker.login("laest-uti", "rangtrangtrangt");
  assert.equal((await attacker.login("laest-uti")).status, 429);
  assert.equal((await client("198.51.100.4").login("laest-uti")).status, 200,
    "the limit is on the name alone: anybody can lock a child out");
});

test("session tokens are not readable in the data folder", async () => {
  await makeUser("lota");
  const c = client();
  const r = await c.login("lota");
  const token = r.headers.get("set-cookie").split(";")[0].split("=")[1];
  const text = await fs.readFile(path.join(dir, "data", "sessions.json"), "utf8");
  assert.equal(text.includes(token), false);
});

test("every answer carries the security headers; a writing request from another site is refused", async () => {
  const r = await fetch(base + "/health");
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.equal(r.headers.get("x-frame-options"), "DENY");
  assert.ok(r.headers.get("content-security-policy"));

  const page = await fetch(base + "/", { headers: { "X-Forwarded-Proto": "https" } });
  const csp = page.headers.get("content-security-policy");
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.equal(/https?:\/\//.test(csp), false, "the policy allows some other origin");
  assert.match(page.headers.get("strict-transport-security"), /max-age=\d+/);

  const foreign = await fetch(base + "/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
    body: JSON.stringify({ username: "x", password: "y" }) });
  assert.equal(foreign.status, 403);
});

test("the program is sent compressed, and not at all to a browser that already has it", async () => {
  const size = (await fs.stat(html)).size;
  const br = await fetch(base + "/", { headers: { "Accept-Encoding": "br" } });
  assert.equal(br.headers.get("content-encoding"), "br");
  assert.ok(Number(br.headers.get("content-length")) < size / 4);
  const etag = br.headers.get("etag");
  assert.ok(etag);
  const again = await fetch(base + "/", { headers: { "If-None-Match": etag } });
  assert.equal(again.status, 304);
  assert.equal((await again.text()).length, 0);
});

test("the privacy notice is served, names who is responsible, and states the retention the server applies", async () => {
  const r = await fetch(base + "/personuvernd");
  assert.equal(r.status, 200);
  const text = await r.text();
  assert.match(text, /Prófari/);
  assert.match(text, /p@example\.is/);
  assert.match(text, new RegExp(app.privacy.inactiveMonths + " mánuði"));
  assert.match(text, new RegExp(app.privacy.pendingDays + " daga"));
  assert.equal(/<script|https?:\/\/(?!www\.personuvernd\.is)/.test(text), false,
    "the notice loads something from somewhere");
  assert.equal((await (await fetch(base + "/health")).json()).privacy, true);
});

/* ---------- backups ----------------------------------------------------------- */

test("a backup is unreadable without its passphrase and restores everything with it", async () => {
  const a = await admin();
  const u = await makeUser("i-afriti");
  await app.store.putState(u.id, { ...blankState(), xp: 42 });

  assert.equal((await a("POST", "/admin/backup", { passphrase: "stutt" })).status, 400);
  const r = await a("POST", "/admin/backup", { passphrase: "mjög löng lykilsetning" });
  assert.equal(r.status, 200);
  const text = JSON.stringify(r.data);
  assert.equal(text.includes("i-afriti"), false, "the backup is not encrypted");
  await assert.rejects(open(r.data, "röng lykilsetning!!"), /Röng lykilsetning/);

  const all = await open(r.data, "mjög löng lykilsetning");
  assert.ok(all.users.some((x) => x.username === "i-afriti"));
  assert.equal(all.states[u.id].state.xp, 42);

  /* restore into an empty folder */
  const { createStore } = await import("../server/store.mjs");
  const fresh = createStore(path.join(dir, "restored"));
  const n = await fresh.importAll(all);
  assert.equal(n.users, all.users.length);
  assert.equal((await fresh.state(u.id)).xp, 42);
  assert.deepEqual(await fresh.sessions(), {}, "a restore must log everybody out");

  const again = await seal({ a: 1 }, "önnur lykilsetning");
  assert.deepEqual(await open(again, "önnur lykilsetning"), { a: 1 });
});
