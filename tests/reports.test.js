/* Error reports (v6.8): a logged-in user sends one; only an administrator
   reads, judges and deletes them; they leave with the user's own export and
   go with the account. */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server/server.mjs";
import { safeCopy } from "../src/js/ui/reports.js";

let base, dir, app;
before(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "fallaskoli-rp-"));
  app = createApp({ dataDir: dir, secureCookies: false, env: {} });
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
    const t = await r.text();
    let data = null; try { data = t ? JSON.parse(t) : null; } catch { data = t; }
    return { status: r.status, data };
  };
}
async function makeUser(username, role = "learner") {
  const { hashPassword, newId } = await import("../server/auth.mjs");
  const { salt, hash } = await hashPassword("lykilordid-mitt");
  let user;
  await app.store.updateUsers((users) => {
    user = { id: newId(), username, name: username, role, status: "active", salt, hash,
      share: { board: false, minutes: false },
      consent: { by: "self", over16: true, at: new Date().toISOString(), how: "admin" } };
    users.push(user); return users;
  });
  return user;
}
async function login(name) {
  const c = client();
  assert.equal((await c("POST", "/auth/login", { username: name, password: "lykilordid-mitt" })).status, 200);
  return c;
}

const CTX = { version: "test", task: { type: "parse", skill: "greining",
  sentence: { text: "Á túninu stendur hestur." }, expected: [{ row: "fl", answer: "nafnorð" }], picks: { fl: "sagnorð" } } };

test("a report needs a login and a known kind", async () => {
  assert.equal((await client()("POST", "/reports", { kind: "villa", note: "x" })).status, 401);
  await makeUser("anna");
  const c = await login("anna");
  assert.equal((await c("POST", "/reports", { kind: "eitthvad", note: "x" })).status, 400);
});

test("a learner reports; only an administrator reads, judges and deletes", async () => {
  await makeUser("umsjon", "admin");
  const kid = await login("anna");
  const sent = await kid("POST", "/reports", { kind: "villa", note: "Þetta er rangt", ctx: CTX });
  assert.equal(sent.status, 200);
  assert.equal((await kid("GET", "/admin/reports")).status, 403);

  const adm = await login("umsjon");
  const list = await adm("GET", "/admin/reports");
  assert.equal(list.status, 200);
  const r = list.data.find((x) => x.id === sent.data.id);
  assert.equal(r.byName, "anna");
  assert.equal(r.status, "ny");
  assert.equal(r.ctx.task.sentence.text, "Á túninu stendur hestur.");

  const upd = await adm("POST", `/admin/reports/${r.id}`, { status: "ekkivilla", adminNote: "Rétt greint" });
  assert.equal(upd.status, 200);
  assert.equal(upd.data.report.status, "ekkivilla");
  assert.equal((await adm("POST", `/admin/reports/${r.id}`, { status: "bull" })).status, 400);

  assert.equal((await adm("DELETE", `/admin/reports/${r.id}`)).status, 200);
  assert.equal((await adm("GET", "/admin/reports")).data.some((x) => x.id === r.id), false);
});

test("reports go out with the user's own export and are erased with the account", async () => {
  const u = await makeUser("bjarni");
  const c = await login("bjarni");
  await c("POST", "/reports", { kind: "setning", note: "skrítin setning", ctx: CTX });
  const ex = await c("GET", "/account/export");
  assert.equal(ex.status, 200);
  assert.equal(ex.data.errorReports.length, 1);
  await app.store.eraseUser(u.id);
  assert.equal((await app.store.reports()).some((r) => r.by === u.id), false);
});

test("the snapshot copy drops functions and survives cycles", () => {
  const t = { a: 1, f: () => 1, s: "x".repeat(2000) };
  t.self = t;
  const c = safeCopy(t);
  assert.equal(c.a, 1);
  assert.equal("f" in c, false);
  assert.ok(c.s.length < 700);
  assert.equal(c.self, "[sama og ofar]");
});
