#!/usr/bin/env node
/* Fallaskóli — four pupils on one computer (owner feedback, 6.13).
 *
 *   ./test-together.sh            (or double-click "Start test server.command")
 *   ./test-together.sh --reset    the same, with four fresh pupils
 *
 * Starts the real server on this computer only, with four test pupils
 * (Anna, Bjarki, Dísa, Gummi) and a teacher account, and opens one page with
 * all four side by side, each already logged in as its own pupil. Answer
 * questions in each and watch the leaderboard move; challenge one to a duel
 * from another and answer it there.
 *
 * How four logins live in one browser: a browser keeps one login cookie per
 * web address, so each pupil gets an address of its own (localhost:8081 …
 * 8084). Behind each address a small relay forwards everything to the one
 * server and keeps that pupil's login itself: the browser never holds a
 * login cookie at all. The relay also lets the four be shown in frames on
 * the overview page (the real server refuses to be put in a frame; that stays
 * as it is). Each address also works on its own in a tab.
 *
 * Everything the test makes (accounts, password hashes, progress) lives in a
 * temporary folder OUTSIDE the project — the one test-together.sh chose, or a
 * new `mkdtemp`. Nothing is written inside the repository.
 *
 * Only this computer can reach it: every port listens on 127.0.0.1.
 * Stop with Ctrl + C.
 */

import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const say = (...a) => console.log(...a);
const fail = (msg) => { console.error("\nSTOPP: " + msg); process.exit(1); };

/* ---------- settings ---------------------------------------------------------- */

const BASE = Number(process.env.PORT || 8080);           // the real server
const PUPIL_PORT = (i) => BASE + 1 + i;                   // 8081 … 8084
const PAGE_PORT = BASE + 10;                              // 8090, the overview
const PUPILS = [
  { name: "Anna" }, { name: "Bjarki" }, { name: "Dísa" }, { name: "Gummi" },
].map((p) => ({ ...p, user: p.name.toLowerCase() }));
const TEACHER = { name: "Kennari", user: "kennari" };
const RESET = process.argv.includes("--reset");

/* ---------- checks ------------------------------------------------------------ */

if (Number(process.versions.node.split(".")[0]) < 20)
  fail(`Node ${process.version} is too old. Version 20 or newer is needed (https://nodejs.org).`);
const { HTML_NAME } = await import(path.join(ROOT, "tools", "version.mjs"));
if (!fs.existsSync(path.join(ROOT, "dist", HTML_NAME)))
  fail(`dist/${HTML_NAME} is missing. Run ./build.sh (or node tools/build.mjs) first.`);
if (!fs.existsSync(path.join(ROOT, "data", "data_bundle.js")))
  fail("data/data_bundle.js is missing. Run ./build.sh first.");

/* ---------- the test folder, outside the project -------------------------------- */

let testDir = process.env.FALLASKOLI_TEST_DIR || "";
if (!testDir) testDir = fs.mkdtempSync(path.join(os.tmpdir(), "fallaskoli-test."));
fs.mkdirSync(testDir, { recursive: true, mode: 0o700 });
testDir = fs.realpathSync(testDir);
if ((testDir + path.sep).startsWith(fs.realpathSync(ROOT) + path.sep))
  fail(`the test folder ${testDir} is inside the project; choose one outside it.`);
const QUAD = path.join(testDir, "fjorir");                 // this mode's own server data
const DATA = path.join(QUAD, "data");
const ACCOUNTS = path.join(QUAD, "accounts.json");
if (RESET && fs.existsSync(QUAD)) {
  fs.rmSync(QUAD, { recursive: true, force: true });
  say("Byrjað upp á nýtt: fyrri prufunemendur og framvinda þeirra eru farin.");
}
fs.mkdirSync(DATA, { recursive: true, mode: 0o700 });

const env = {
  ...process.env,
  FALLASKOLI_DATA: DATA,
  PORT: String(BASE),
  FALLASKOLI_HOST: "127.0.0.1",
  FALLASKOLI_CONTROLLER: process.env.FALLASKOLI_CONTROLLER || "Prófunarútgáfa (umsjónarmaður prófunar)",
  FALLASKOLI_CONTACT: process.env.FALLASKOLI_CONTACT || "hafið samband við umsjónarmann prófunarinnar",
};
delete env.FALLASKOLI_TRUST_PROXY;

/* ---------- the accounts ------------------------------------------------------- */

let accounts = {};
try { accounts = JSON.parse(fs.readFileSync(ACCOUNTS, "utf8")); } catch { accounts = {}; }

function makeAccount(who, flag) {
  if (accounts[who.user]) return;
  let out;
  try {
    out = execFileSync(process.execPath, [path.join(ROOT, "server", "admin.mjs"), "nyr", who.name, flag],
      { cwd: ROOT, env, encoding: "utf8" });
  } catch (e) { fail(`could not create ${who.name}: ${e.stderr || e.message}`); }
  const pw = (/Lykilor\S*\s+(\S+)/.exec(out) || [])[1];
  if (!pw) fail(`no password came back for ${who.name}:\n${out}`);
  accounts[who.user] = pw;
  fs.writeFileSync(ACCOUNTS, JSON.stringify(accounts, null, 2), { mode: 0o600 });
}
makeAccount(TEACHER, "--umsjon");
for (const p of PUPILS) makeAccount(p, "--16");

/* ---------- the server ---------------------------------------------------------- */

const children = [];
const server = spawn(process.execPath, [path.join(ROOT, "server", "server.mjs")], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
children.push(server);
const prefix = (stream, out) => stream.on("data", (b) =>
  String(b).split("\n").filter(Boolean).forEach((l) => out.write("  [þjónn] " + l + "\n")));
prefix(server.stdout, process.stdout);
prefix(server.stderr, process.stderr);
server.on("exit", (code) => { if (!stopping) fail(`the server stopped (code ${code}); see the lines above.`); });

/** One request to the real server; resolves { status, headers, body }. */
function call(method, p, { body = null, token = null } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request({
      host: "127.0.0.1", port: BASE, method, path: p,
      headers: {
        ...(data ? { "Content-Type": "application/json", "Content-Length": data.length } : {}),
        ...(token ? { Cookie: `fallaskoli=${token}` } : {}),
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

const tokenOf = (headers) => {
  for (const c of [].concat(headers["set-cookie"] || [])) {
    const m = /^fallaskoli=([^;]*)/.exec(c);
    if (m) return m[1] || null;
  }
  return undefined;
};

async function waitForServer() {
  for (let k = 0; k < 100; k++) {
    try { const r = await call("GET", "/auth/config"); if (r.status === 200) return; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  fail("the server did not answer within 15 seconds.");
}

/* ---------- one relay per pupil -------------------------------------------------- */

const pageOrigins = [`http://localhost:${PAGE_PORT}`, `http://127.0.0.1:${PAGE_PORT}`];

async function logIn(pupil) {
  const r = await call("POST", "/auth/login", { body: { username: pupil.user, password: accounts[pupil.user] } });
  const t = tokenOf(r.headers);
  if (r.status !== 200 || !t) throw new Error(`${pupil.name}: ${r.status} ${r.body}`);
  pupil.token = t;
  /* On the leaderboard, and so open to duels: that is what the test is for.
     A pupil can turn it off again in Stillingar like anybody else. */
  if (!pupil.shared) {
    await call("POST", "/account/share", { body: { board: true }, token: t });
    pupil.shared = true;
  }
}

function relay(pupil, port) {
  const srv = http.createServer(async (req, res) => {
    /* The relay's own address: log this pupil in again (after "Skrá út"). */
    if (req.url === "/__fjorir/inn") {
      try { await logIn(pupil); } catch (e) { res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" }); return res.end(String(e.message)); }
      res.writeHead(302, { Location: "/" });
      return res.end();
    }
    const headers = { ...req.headers };
    delete headers.cookie;
    if (pupil.token) headers.cookie = `fallaskoli=${pupil.token}`;
    const up = http.request({ host: "127.0.0.1", port: BASE, method: req.method, path: req.url, headers }, (r) => {
      const h = { ...r.headers };
      /* The login stays here, never in the browser: four pupils, one browser. */
      const t = tokenOf(h);
      if (t !== undefined) pupil.token = t;
      delete h["set-cookie"];
      /* …and the overview page may show it in a frame (only through the relay). */
      delete h["x-frame-options"];
      if (h["content-security-policy"])
        h["content-security-policy"] = String(h["content-security-policy"])
          .replace(/frame-ancestors[^;]*/, "frame-ancestors " + pageOrigins.join(" "));
      res.writeHead(r.statusCode || 502, h);
      r.pipe(res);
    });
    up.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end("Þjónninn svarar ekki."); });
    req.pipe(up);
  });
  return listen(srv, port, pupil.name);
}

function listen(srv, port, what) {
  return new Promise((resolve) => {
    srv.on("error", (e) => fail(e.code === "EADDRINUSE"
      ? `port ${port} (${what}) is already in use. Is the test already running in another window? Or choose other ports:  PORT=9080 ./test-together.sh`
      : String(e)));
    srv.listen(port, "127.0.0.1", () => resolve(srv));
  });
}

/* ---------- the overview page ------------------------------------------------------ */

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function pageHTML() {
  const panes = PUPILS.map((p, i) => `
  <section class="pane">
    <header><b>${esc(p.name)}</b><span class="port">:${PUPIL_PORT(i)}</span>
      <button type="button" data-reload="${i}" title="Endurhlaða">↻</button>
      <a data-port="${PUPIL_PORT(i)}" data-path="/__fjorir/inn" target="f${i}" title="Skrá ${esc(p.name)} inn aftur (eftir „Skrá út“)">Skrá inn</a>
      <a data-port="${PUPIL_PORT(i)}" data-path="/" target="_blank" rel="noopener" title="Opna í nýjum flipa">⤢</a>
    </header>
    <iframe name="f${i}" data-port="${PUPIL_PORT(i)}" title="${esc(p.name)}"></iframe>
  </section>`).join("");
  return `<!DOCTYPE html>
<html lang="is"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Fallaskóli — fjórir nemendur</title>
<style>
  *{box-sizing:border-box}
  html,body{margin:0;height:100%;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#1d2b25;color:#f3f1e7}
  body{display:flex;flex-direction:column}
  .top{display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;padding:6px 12px;font-size:13px}
  .top h1{font-size:15px;margin:0;font-weight:600}
  .top .hint{color:#a9baaf}
  .top button{font:inherit;background:none;color:inherit;border:1px solid #6d7f74;border-radius:6px;padding:3px 9px;cursor:pointer}
  .top button[aria-pressed=true]{background:#f3f1e7;color:#172a22}
  main{flex:1;min-height:0;display:grid;gap:6px;padding:0 6px 6px}
  main.row{grid-template-columns:repeat(4,1fr)}
  main.grid{grid-template-columns:repeat(2,1fr);grid-template-rows:repeat(2,1fr)}
  .pane{display:flex;flex-direction:column;min-width:0;min-height:0;border:1px solid #4b5d53;border-radius:8px;overflow:hidden;background:#fff}
  .pane header{display:flex;align-items:center;gap:8px;padding:4px 8px;background:#172a22;font-size:13px}
  .pane header b{font-size:14px}
  .pane .port{color:#a9baaf;font-family:ui-monospace,monospace;font-size:11px;margin-right:auto}
  .pane header button,.pane header a{font:inherit;color:#f3f1e7;background:none;border:1px solid #4b5d53;border-radius:5px;padding:1px 7px;cursor:pointer;text-decoration:none}
  .pane iframe{flex:1;width:100%;border:0;background:#fff}
  @media (max-width:900px){main.row,main.grid{grid-template-columns:1fr;grid-template-rows:none;overflow:auto}.pane{min-height:85vh}}
</style></head><body>
<div class="top">
  <h1>Fallaskóli — fjórir nemendur á þessari tölvu</h1>
  <span>Útlit:</span>
  <button type="button" data-layout="row">Fjórir í röð</button>
  <button type="button" data-layout="grid">2 × 2</button>
  <span class="hint">Allir fjórir eru á stigatöflunni og geta skorað hver á annan (Einvígi). Kennarinn: <a href="http://localhost:${BASE}" target="_blank" rel="noopener" style="color:inherit">localhost:${BASE}</a>, notandi <b>${TEACHER.user}</b> (lykilorðið er í Terminal-glugganum).</span>
</div>
<main id="m">${panes}</main>
<script>
  const host = location.hostname;
  const url = (el) => "http://" + host + ":" + el.dataset.port + (el.dataset.path || "/");
  document.querySelectorAll("iframe").forEach((f) => { f.src = url(f); });
  document.querySelectorAll("a[data-port]").forEach((a) => { a.href = url(a); });
  document.querySelectorAll("[data-reload]").forEach((b) => b.addEventListener("click", () => {
    const f = document.querySelectorAll("iframe")[+b.dataset.reload]; f.src = url(f);
  }));
  const m = document.getElementById("m");
  const set = (k) => {
    m.className = k;
    document.querySelectorAll("[data-layout]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.layout === k)));
    try { localStorage.setItem("fjorir-layout", k); } catch (e) {}
  };
  let saved = null; try { saved = localStorage.getItem("fjorir-layout"); } catch (e) {}
  set(saved || (innerWidth >= 1500 ? "row" : "grid"));
  document.querySelectorAll("[data-layout]").forEach((b) => b.addEventListener("click", () => set(b.dataset.layout)));
</script>
</body></html>`;
}

/* ---------- start ---------------------------------------------------------------- */

let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  say("\nStoppa…");
  for (const c of children) { try { c.kill(); } catch { /* gone */ } }
  say(`Stopped. The test pupils and their progress are kept in ${QUAD} for next time`);
  say("(./test-together.sh --reset starts again with four fresh pupils).");
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

await waitForServer();
for (const p of PUPILS) {
  try { await logIn(p); } catch (e) { fail("could not log in: " + e.message); }
}
for (let i = 0; i < PUPILS.length; i++) await relay(PUPILS[i], PUPIL_PORT(i));
await listen(http.createServer((req, res) => {
  if (req.url !== "/" && req.url !== "/index.html") { res.writeHead(404); return res.end(); }
  const body = Buffer.from(pageHTML());
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Content-Length": body.length, "Cache-Control": "no-store" });
  res.end(body);
}), PAGE_PORT, "the overview page");

/* Keep the Mac awake while the test runs. */
try {
  const caf = spawn("caffeinate", ["-dims", "-w", String(process.pid)], { stdio: "ignore" });
  caf.on("error", () => {});
  children.push(caf);
} catch { /* not a Mac */ }

const overview = `http://localhost:${PAGE_PORT}`;
say("");
say("==================================================================");
say(` Opnaðu:  ${overview}`);
say("");
say(" Fjórir nemendur, hver á sinni slóð og þegar innskráður:");
PUPILS.forEach((p, i) => say(`   ${p.name.padEnd(7)} http://localhost:${PUPIL_PORT(i)}`));
say("");
say(` Kennari: http://localhost:${BASE}   notandi ${TEACHER.user}   lykilorð ${accounts[TEACHER.user]}`);
say(` Gögnin (aðgangar, framvinda) eru í ${QUAD}`);
say(" Byrja upp á nýtt með fjórum nýjum nemendum:  ./test-together.sh --reset");
say(" Stöðva: Ctrl + C");
say("==================================================================");
say("");
if (process.platform === "darwin" && !process.env.FALLASKOLI_NO_OPEN) spawn("open", [overview], { stdio: "ignore" }).on("error", () => {});
