/* How many pupils can one server carry? (critique item 68)

   The server keeps everything in JSON files in one folder and runs as one
   Node process (server/store.mjs). That is right for a family or a class.
   Before a school relies on it, this finds the ceiling by measuring it.

     node tools/load-test.mjs                    # 30 and 300 pupils, 120 s each
     node tools/load-test.mjs --pupils 30,300,1000 --seconds 180 --arrive 60
     node tools/load-test.mjs --json result.json # the figures, for the record

   What one run does, for each number of pupils N:

     1. A fresh temporary data folder. Accounts are written into it directly
        (N pupils in classes of 25, a teacher for each class, all with a
        consent record and on their class's board), and every pupil gets a
        REAL state: the program's own simulator (tools/sim/sim.mjs) plays
        weeks of sessions, so the files are the size real ones are.
     2. The real server, `node server/server.mjs`, in its own process on that
        folder — exactly as it runs on Fly.io, so its CPU can be measured
        apart from this script's.
     3. Everybody logs in (the morning rush: 25 at a time). Each teacher sets
        an assignment and the class goal.
     4. For `--seconds`, every pupil practises AT THE SAME TIME. Each one
        opens the program at a random moment in the first `--arrive` seconds
        (default 60: a school's classes sitting down in the same minute) —
        the eleven requests a page load makes: /auth/me, the state,
        the policy, the calibration table, badge rarity, the roster, the
        board, the social picture, the class goal, duels, assignments), then
        answers a question every `--think` seconds on average (default 12,
        a brisk pupil): each answer saves the state (PUT /state, with its
        revision), every eighth sends the calibration counts, every tenth
        ends a session — the board, the class goal and the assignments are
        fetched again, the assignment result is sent, and one pupil in five
        challenges a classmate to a duel and plays it (create, start, result).
        Teachers look at their class's page every 30 s.
     5. Measured: every request's time (p50, p95, p99, max per kind, and
        p95 again for the STEADY part only — after the last pupil has
        arrived — so the arrival rush and ordinary practice are told
        apart), every
        error (a network failure, a 5xx, or a 4xx that the program would not
        expect — a 409 on a duel limit is expected, a 401 is not), the
        server's CPU (from /proc, or `ps` on a Mac; the average and the
        busiest second) and memory, and how much the data folder grew.

   N pupils all practising in the same minute is the worst hour of a school
   day, not an average one. The verdict line says whether the server held it:
   no errors, saves under 300 ms at p95 once everybody is in, page loads
   under 1 s at p95, and at least 80% of the answers a pupil would give if
   the server never made them wait.

   The load comes from this machine too — the script and the server share the
   CPUs, and the script's own CPU is printed so that can be judged. The
   result for this repository is written down in docs/SERVER.md §4.4.     */

import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createStore } from "../server/store.mjs";
import { hashPassword, newId } from "../server/auth.mjs";
import { cleanState } from "../server/guard.mjs";
import { TASKS } from "../src/js/tasks/index.js";
import { blankState } from "../src/js/core/state.js";
import { VERSION } from "./version.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/* ---------- options ---------- */

const argv = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = argv.indexOf("--" + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : dflt;
};
const SIZES = opt("pupils", "30,300").split(",").map(Number).filter((n) => n > 0);
const SECONDS = Number(opt("seconds", "120"));
const ARRIVE = Number(opt("arrive", "60"));
const THINK = Number(opt("think", "12"));
const CLASS = Number(opt("class", "25"));
const JSON_OUT = opt("json", null);
const KEEP = argv.includes("--keep");
/* --profile: the server runs under `node --cpu-prof`, and the functions it
   spent its time in are printed — where the time goes, not just how much. */
const PROFILE = argv.includes("--profile");
/* --states blank: empty states instead of simulated ones — quick, for the
   smoke test (tests/load-test.test.js), not for measuring. */
const BLANK = opt("states", "sim") === "blank";

/* ---------- small things ---------- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/* The script's own randomness only decides WHEN things happen; a fixed seed
   keeps two runs comparable. */
let seed = 0x5eed;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const pick = (xs) => xs[Math.floor(rand() * xs.length)];
const jitter = (mean) => mean * (0.5 + rand());

const freePort = () => new Promise((res, rej) => {
  const s = net.createServer();
  s.once("error", rej);
  s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => res(port)); });
});

async function folderSize(dir) {
  let bytes = 0, files = 0;
  const walk = async (d) => {
    for (const e of await fs.readdir(d, { withFileTypes: true }).catch(() => [])) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else { files++; bytes += (await fs.stat(p).catch(() => ({ size: 0 }))).size; }
    }
  };
  await walk(dir);
  return { bytes, files };
}

/** CPU seconds and resident memory of a process, Linux or macOS. */
const TICKS = (() => { try { return Number(execFileSync("getconf", ["CLK_TCK"]).toString()) || 100; } catch { return 100; } })();
function usageOf(pid) {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const f = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    const cpu = (Number(f[11]) + Number(f[12])) / TICKS;
    const rss = Number(/VmRSS:\s+(\d+)/.exec(readFileSync(`/proc/${pid}/status`, "utf8"))[1]) * 1024;
    return { cpu, rss };
  } catch {
    try {
      const [t, rss] = execFileSync("ps", ["-o", "cputime=,rss=", "-p", String(pid)]).toString().trim().split(/\s+/);
      const parts = t.split(/[:.-]/).map(Number);
      const [h, m, s] = parts.length >= 3 ? parts.slice(-3) : [0, ...parts.slice(-2)];
      return { cpu: h * 3600 + m * 60 + s, rss: Number(rss) * 1024 };
    } catch { return { cpu: NaN, rss: NaN }; }
  }
}

const pct = (xs, p) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const fmtMs = (x) => (Number.isFinite(x) ? (x < 10 ? x.toFixed(1) : Math.round(x)) + "" : "—");
const fmtMB = (b) => (b / 1048576).toFixed(1) + " MB";
const fmtKB = (b) => Math.round(b / 1024) + " KB";

/* ---------- real states, from the program's own simulator ----------
   tools/sim/sim.mjs replaces `Date` with a fake clock while it plays, so it
   runs in a child process and hands back JSON; this process keeps its clock.
   Four pupils: weak to strong, three weeks to three months of practice. */
async function simulatedStates() {
  const cache = path.join(os.tmpdir(), `fallaskoli-load-states-${VERSION}.json`);
  if (existsSync(cache)) return JSON.parse(await fs.readFile(cache, "utf8"));
  console.log("  simulating four pupils' states (once; cached in " + cache + ") …");
  const code = `
    import { simulate } from ${JSON.stringify(path.join(ROOT, "tools/sim/sim.mjs"))};
    const out = [[0.55, 21, 1], [0.7, 40, 2], [0.8, 60, 2], [0.9, 90, 2]].map(([ability, days, perDay], i) =>
      simulate({ ability, days, perDay, size: 10, allSkills: true, seed: 11 + i }).S);
    process.stdout.write(JSON.stringify(out));`;
  const json = execFileSync(process.execPath, ["--input-type=module", "-e", code],
    { cwd: ROOT, maxBuffer: 256 * 1024 * 1024 }).toString();
  await fs.writeFile(cache, json);
  return JSON.parse(json);
}

/* The simulator's clock ran forward from today; its days are moved back so
   the last one is yesterday, as for a pupil who has practised until now. */
function settleDates(S) {
  const keys = Object.keys(S.days || {}).sort();
  if (!keys.length) return S;
  const shift = Math.round((Date.parse(keys[keys.length - 1]) - (Date.now() - 86400000)) / 86400000);
  const move = (k) => new Date(Date.parse(k) - shift * 86400000).toISOString().slice(0, 10);
  const days = {};
  for (const k of keys) days[move(k)] = S.days[k];
  return { ...S, days };
}

/* ---------- one simulated browser ---------- */

function client(base, stats, clock) {
  let cookie = null;
  return async function call(kind, method, p, body, headers = {}, expect = []) {
    const t0 = performance.now();
    let status = 0, data = null, rev = null;
    try {
      const r = await fetch(base + p, {
        method,
        headers: {
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...(cookie ? { Cookie: cookie } : {}),
          "Accept-Encoding": "gzip, br",
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      status = r.status;
      const set = r.headers.get("set-cookie");
      if (set) cookie = set.split(";")[0];
      rev = r.headers.get("x-state-rev");
      const text = await r.text();
      try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    } catch (e) {
      status = -1; data = { error: e.message };
    }
    const ms = performance.now() - t0;
    const k = (stats[kind] ||= { ms: [], at: [], ok: 0, expected: 0, errors: 0, codes: {} });
    k.ms.push(ms); k.at.push(t0 - clock.t0);
    k.codes[status] = (k.codes[status] || 0) + 1;
    if (status >= 200 && status < 300) k.ok++;
    else if (expect.includes(status)) k.expected++;
    else { k.errors++; if (k.errors <= 3) stats._samples.push(`${kind} ${method} ${p} → ${status} ${JSON.stringify(data).slice(0, 120)}`); }
    return { status, data, rev: rev == null ? null : Number(rev) };
  };
}

/* ---------- one scenario ---------- */

async function scenario(N, states) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `fallaskoli-load-${N}-`));
  const store = createStore(dir);
  await store.init();

  /* Accounts, classes, states — written as the server would have them. */
  const PASSWORD = "álagspróf-lykilorð";
  const { salt, hash } = await hashPassword(PASSWORD);
  const nClasses = Math.ceil(N / CLASS);
  const groups = Array.from({ length: nClasses }, (_, i) => "b" + String(i + 1).padStart(3, "0"));
  const consent = { by: "self", over16: true, at: new Date().toISOString(), how: "admin", notice: "9999" };
  const pupils = [], teachers = [];
  await store.updateUsers((users) => {
    for (let i = 0; i < N; i++) {
      const u = { id: newId(), username: `nemi${i + 1}`, name: `Nemandi ${i + 1}`, role: "learner",
        status: "active", salt, hash, group: groups[Math.floor(i / CLASS)],
        share: { board: true, minutes: true }, consent };
      users.push(u); pupils.push(u);
    }
    for (const g of groups) {
      const u = { id: newId(), username: `kennari-${g}`, name: `Kennari ${g}`, role: "guardian",
        status: "active", salt, hash, group: g, share: { board: false, minutes: false }, consent };
      users.push(u); teachers.push(u);
    }
    return users;
  });
  await store.updateGroups((g) => { for (const id of groups) g[id] = { name: "Bekkur " + id }; return g; });
  for (const [i, u] of pupils.entries()) {
    const S = cleanState(settleDates(states[i % states.length]));
    S.profile = { id: u.id, name: u.name };
    await store.putState(u.id, S);
  }
  const sizeBefore = await folderSize(dir);
  const avgState = sizeBefore.bytes / N;

  /* The server, as it runs in production, in its own process. */
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const profDir = PROFILE ? await fs.mkdtemp(path.join(os.tmpdir(), "fallaskoli-prof-")) : null;
  const server = spawn(process.execPath, [
    ...(PROFILE ? ["--cpu-prof", "--cpu-prof-dir=" + profDir] : []),
    path.join(ROOT, "server/server.mjs")], {
    cwd: ROOT, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT: String(port), FALLASKOLI_HOST: "127.0.0.1", FALLASKOLI_DATA: dir,
      FALLASKOLI_INSECURE: "1", FALLASKOLI_UID: "", FALLASKOLI_CONTROLLER: "Álagspróf",
      FALLASKOLI_CONTACT: "engin@example.invalid", NODE_ENV: "production" },
  });
  let serverLog = "";
  server.stdout.on("data", (d) => { serverLog += d; });
  server.stderr.on("data", (d) => { serverLog += d; });
  for (let i = 0; ; i++) {
    try { if ((await fetch(base + "/health")).ok) break; } catch { /* not yet */ }
    if (i > 600 || server.exitCode != null) throw new Error("the server did not start:\n" + serverLog);
    await sleep(100);
  }

  const stats = { _samples: [] };
  const clock = { t0: performance.now(), arrived: Infinity };
  const ids = new Map(pupils.map((u) => [u.id, u]));

  /* 3. The morning rush: everybody logs in, 25 at a time. */
  const callers = new Map();
  const everyone = [...pupils, ...teachers];
  const tLogin = performance.now();
  for (let i = 0; i < everyone.length; i += 25) {
    await Promise.all(everyone.slice(i, i + 25).map(async (u) => {
      const call = client(base, stats, clock);
      await call("login", "POST", "/auth/login", { username: u.username, password: PASSWORD });
      callers.set(u.id, call);
    }));
  }
  const loginSecs = (performance.now() - tLogin) / 1000;

  /* Each teacher: an assignment for the class, and the class goal. */
  const due = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  await Promise.all(teachers.map(async (t) => {
    const call = callers.get(t.id);
    await call("teacher: set", "POST", "/teacher/assignments",
      { group: t.group, target: { kind: "skill", id: "nafnord" }, n: 10, due, note: "Álagspróf" });
    await call("teacher: set", "POST", "/teacher/classgoal", { group: t.group, kind: "rett", n: 2000 });
  }));

  /* 4. Everybody practising at once. */
  const sizeStart = await folderSize(dir);
  const u0 = usageOf(server.pid), me0 = process.cpuUsage();
  let rssPeak = u0.rss, cpuPeak = 0, last = { ...u0, t: performance.now() };
  /* Once a second: memory, and the CPU of that second — Node answers on ONE
     thread, so a second at 100% of a core is a second of waiting. */
  const sampler = setInterval(() => {
    const u = usageOf(server.pid), t = performance.now();
    rssPeak = Math.max(rssPeak, u.rss || 0);
    cpuPeak = Math.max(cpuPeak, (u.cpu - last.cpu) / ((t - last.t) / 1000) || 0);
    last = { ...u, t };
  }, 1000);
  const t0 = performance.now();
  clock.t0 = t0;
  let pending = N;
  const end = t0 + SECONDS * 1000;
  const typeIds = TASKS.map((t) => t.id);
  let answers = 0, expected = 0, gaveUp = 0;

  async function pupil(u) {
    const call = callers.get(u.id);
    await sleep(rand() * ARRIVE * 1000);                // the class sitting down
    /* The page load. */
    const tl = performance.now();
    await call("load: me", "GET", "/auth/me");
    const got = await call("load: state", "GET", `/state/${u.id}`);
    /* No state, no practice: the program stops at start-up when it cannot
       fetch the state, and so does this pupil — writing anything now would
       put an empty state over the real one. */
    if (got.status !== 200 || !got.data || typeof got.data !== "object" || got.data.error) {
      gaveUp++; if (--pending === 0) clock.arrived = performance.now() - t0;
      return;
    }
    let S = got.data, rev = got.rev;
    await Promise.all([
      call("load: policy", "GET", "/policy"),
      call("calibration table", "GET", "/calibration"),
    ]);
    await Promise.all([
      call("load: rarity", "GET", "/badges/stats"),
      call("load: roster", "GET", "/roster"),
      call("board", "GET", "/leaderboard"),
      call("load: social", "GET", "/social"),
      call("class goal", "GET", "/classgoal"),
      call("duels: list", "GET", "/duels"),
      call("assignments", "GET", "/assignments"),
    ]);
    const pl = (stats["page load (all 11)"] ||= { ms: [], at: [], ok: 0, expected: 0, errors: 0, codes: {} });
    pl.ms.push(performance.now() - tl); pl.at.push(tl - t0);
    if (--pending === 0) clock.arrived = performance.now() - t0;
    /* What this pupil should manage from here on if the server keeps up:
       the yardstick for "answers per second". */
    expected += Math.max(0, end - performance.now()) / 1000 / THINK;
    let n = 0;
    const today = new Date().toISOString().slice(0, 10);
    while (performance.now() < end) {
      await sleep(jitter(THINK) * 1000);
      if (performance.now() >= end) break;
      n++; answers++;
      /* One answer: ten XP, counted on today's record as the program does. */
      const d = ((S.days ||= {})[today] ||= { xp: 0, a: 0, r: 0, ms: 0 });
      d.xp = (d.xp || 0) + 10; d.a = (d.a || 0) + 1; d.r = (d.r || 0) + 1; d.ms = (d.ms || 0) + 9000;
      S.xp = (S.xp || 0) + 10;
      let put = await call("save state", "PUT", `/state/${u.id}`, S, rev != null ? { "If-Match": `"${rev}"` } : {}, [409]);
      if (put.status === 409 && put.data) {               // as serverDriver: merge, write again
        rev = put.data.rev;
        put = await call("save state", "PUT", `/state/${u.id}`, S, { "If-Match": `"${rev}"` }, [409]);
      }
      if (put.status === 200) rev = put.data.rev;
      if (n % 8 === 0) {
        const events = Array.from({ length: 8 }, () => ({ t: pick(typeIds), l: 1 + Math.floor(rand() * 5), ok: rand() < 0.75, recs: [] }));
        await call("calibration counts", "POST", "/calibration/answers", { events }, {}, [429]);
      }
      if (n % 10 === 0) {
        /* The end of a session. */
        await Promise.all([call("board", "GET", "/leaderboard"), call("class goal", "GET", "/classgoal")]);
        const list = await call("assignments", "GET", "/assignments");
        const a = list.data && list.data.assignments && list.data.assignments[0];
        if (a) await call("assignment result", "POST", `/assignments/${a.id}/result`, { i: a.n, j: a.n, c: a.n - 1 }, {}, [409, 429]);
        if (rand() < 0.2) {
          const mates = pupils.filter((x) => x.group === u.group && x.id !== u.id);
          const opp = mates.length ? pick(mates) : null;
          if (opp) {
            const made = await call("duel: create", "POST", "/duels", { topic: "blandad", n: 10, opponent: opp.id }, {}, [409]);
            const id = made.data && made.data.duel && made.data.duel.id;
            if (id) {
              const st = await call("duel: start", "POST", `/duels/${id}/start`, {}, {}, [409]);
              if (st.data && st.data.sig)
                await call("duel: result", "POST", `/duels/${id}/result`, { answers: Array(10).fill(null), sig: st.data.sig }, {}, [409]);
            }
          }
        }
      }
    }
  }

  async function teacher(t) {
    const call = callers.get(t.id);
    await sleep(rand() * ARRIVE * 1000);                // with the class
    while (performance.now() < end) {
      await Promise.all([
        call("teacher: class", "GET", `/teacher/assignments?group=${t.group}`),
        call("teacher: class", "GET", `/teacher/patterns?group=${t.group}`),
        call("teacher: class", "GET", `/teacher/classgoal?group=${t.group}`),
      ]);
      await sleep(jitter(30) * 1000);
    }
  }

  await Promise.all([...pupils.map(pupil), ...teachers.map(teacher)]);
  const wall = (performance.now() - t0) / 1000;
  clearInterval(sampler);
  const u1 = usageOf(server.pid), me1 = process.cpuUsage(me0);
  const sizeEnd = await folderSize(dir);

  server.kill("SIGTERM");
  await new Promise((r) => (server.exitCode != null ? r() : server.once("exit", r)));
  const flagged = (await createStore(dir).users()).filter((u) => u.review).length;
  const profile = profDir ? await topFunctions(profDir) : null;
  if (!KEEP) await fs.rm(dir, { recursive: true, force: true });

  /* The figures. */
  const steady = (k) => k.ms.filter((_, i) => k.at[i] > clock.arrived);
  const rows = Object.entries(stats).filter(([k]) => !k.startsWith("_")).map(([kind, k]) => ({
    kind, n: k.ms.length, p50: pct(k.ms, 50), p95: pct(k.ms, 95), p99: pct(k.ms, 99),
    max: Math.max(...k.ms), steadyN: steady(k).length, steadyP95: pct(steady(k), 95),
    errors: k.errors, expected: k.expected, codes: k.codes,
  }));
  const all = Object.entries(stats).filter(([k]) => !k.startsWith("_") && k !== "page load (all 11)" && k !== "login" && k !== "teacher: set");
  const requests = all.reduce((s, [, k]) => s + k.ms.length, 0);
  const errors = rows.reduce((s, r) => s + r.errors, 0);
  const save = rows.find((r) => r.kind === "save state");
  const load = rows.find((r) => r.kind === "page load (all 11)");
  const target = expected / wall;
  const result = {
    pupils: N, classes: nClasses, seconds: SECONDS, arrive: ARRIVE, think: THINK, wall,
    arrivedAt: clock.arrived / 1000, serverCpuPeak: cpuPeak,
    loginSecs, answers, answersPerSec: answers / wall, targetAnswersPerSec: target,
    requestsPerSec: requests / wall, errors, flagged, gaveUp,
    serverCpu: (u1.cpu - u0.cpu) / wall, serverRssPeak: rssPeak, scriptCpu: (me1.user + me1.system) / 1e6 / wall,
    disk: { seeded: sizeBefore, start: sizeStart, end: sizeEnd, growth: sizeEnd.bytes - sizeStart.bytes,
      avgState },
    rows, samples: stats._samples, profile,
    held: errors === 0 && gaveUp === 0 && save && save.steadyP95 < 300 && load && load.p95 < 1000 && answers >= 0.8 * expected,
  };
  return { result, serverLog };
}

/** The server's own CPU profile → the functions with the most self time. */
async function topFunctions(dir, n = 12) {
  const f = (await fs.readdir(dir)).find((x) => x.endsWith(".cpuprofile"));
  if (!f) return null;
  const prof = JSON.parse(await fs.readFile(path.join(dir, f), "utf8"));
  const byId = new Map(prof.nodes.map((x) => [x.id, x]));
  const self = new Map();
  const dt = prof.timeDeltas || [];
  prof.samples.forEach((id, i) => {
    const node = byId.get(id), cf = node.callFrame;
    const where = cf.url.startsWith("file:") ? path.relative(ROOT, fileURLToPath(cf.url)) : cf.url;
    const key = `${cf.functionName || "(anonymous)"} ${where}${where ? ":" + (cf.lineNumber + 1) : ""}`;
    self.set(key, (self.get(key) || 0) + (dt[i] || 0));
  });
  const total = [...self.values()].reduce((a, b) => a + b, 0);
  await fs.rm(dir, { recursive: true, force: true });
  return [...self].sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([fn, us]) => ({ fn, share: us / total, ms: us / 1000 }));
}

/* ---------- run, and print ---------- */

const cpus = os.cpus();
console.log(`Fallaskóli ${VERSION} — load test. ${cpus.length} × ${cpus[0]?.model?.trim() || "CPU"}, ` +
  `Node ${process.version}, ${SECONDS} s per run, arrivals over ${ARRIVE} s, an answer every ~${THINK} s per pupil.`);
const states = BLANK ? [blankState()] : (await simulatedStates()).map(settleDates);
const results = [];
for (const N of SIZES) {
  console.log(`\n── ${N} pupils ─────────────────────────────────────────────`);
  const { result: r, serverLog } = await scenario(N, states);
  results.push(r);
  console.log(`  ${r.classes} classes; states ${fmtKB(r.disk.avgState)} each on average; ` +
    `login of ${N + r.classes} accounts: ${r.loginSecs.toFixed(1)} s`);
  console.log(`  answers ${r.answers} (${r.answersPerSec.toFixed(1)}/s of ${r.targetAnswersPerSec.toFixed(1)}/s wanted), ` +
    `requests ${r.requestsPerSec.toFixed(1)}/s, errors ${r.errors}` + (r.flagged ? `, held for review ${r.flagged}` : "") +
    (r.gaveUp ? `; ${r.gaveUp} pupils could not open the program at all` : ""));
  console.log(`  everybody in after ${r.arrivedAt.toFixed(0)} s; server CPU ${(r.serverCpu * 100).toFixed(0)}% of one core on average, ` +
    `${(r.serverCpuPeak * 100).toFixed(0)}% in the busiest second, memory peak ${fmtMB(r.serverRssPeak)}; ` +
    `this script ${(r.scriptCpu * 100).toFixed(0)}%`);
  console.log(`  data folder ${fmtMB(r.disk.start.bytes)} → ${fmtMB(r.disk.end.bytes)} ` +
    `(${r.disk.growth >= 0 ? "+" : "−"}${fmtMB(Math.abs(r.disk.growth))} in ${r.seconds} s; ${r.disk.end.files} files)`);
  console.log("  " + "kind".padEnd(22) + "n".padStart(7) + "p50".padStart(8) + "p95".padStart(8) +
    "p99".padStart(8) + "max".padStart(8) + "  steady p95".padStart(12) + "  errors");
  for (const row of r.rows.sort((a, b) => b.n - a.n)) {
    console.log("  " + row.kind.padEnd(22) + String(row.n).padStart(7) + fmtMs(row.p50).padStart(8) +
      fmtMs(row.p95).padStart(8) + fmtMs(row.p99).padStart(8) + fmtMs(row.max).padStart(8) +
      fmtMs(row.steadyP95).padStart(12) +
      `  ${row.errors}${row.expected ? ` (+${row.expected} expected)` : ""}`);
  }
  for (const s of r.samples) console.log("  ! " + s);
  if (r.profile) {
    console.log("  where the server's CPU went (self time):");
    for (const x of r.profile) console.log(`    ${(x.share * 100).toFixed(1).padStart(5)}%  ${x.fn}`);
  }
  if (r.errors && /villa/.test(serverLog)) console.log("  server log:\n" + serverLog.split("\n").filter((l) => /villa/.test(l)).slice(0, 5).join("\n"));
  console.log(`  verdict: ${r.held ? "HELD" : "DID NOT HOLD"} — ` +
    `saves p95 once everybody is in ${fmtMs(r.rows.find((x) => x.kind === "save state")?.steadyP95)} ms, ` +
    `page load p95 ${fmtMs(r.rows.find((x) => x.kind === "page load (all 11)")?.p95)} ms (ms throughout)`);
}
if (JSON_OUT) {
  await fs.writeFile(JSON_OUT, JSON.stringify({ version: VERSION, node: process.version, cpus: cpus.length,
    model: cpus[0]?.model, at: new Date().toISOString(), results }, null, 2));
  console.log("\nwritten: " + JSON_OUT);
}
