/* Installing the program (item 54): the manifest, the icons, the service
   worker, and the server's routes for them.

   The worker is run here for real, in a sandbox with a stand-in for the
   browser's `self`, `caches` and `fetch`: what it answers for and what it
   leaves to the network is the whole of its promise ("never a pupil's data
   in the cache"), so that is tested on the worker's own code, not on a copy
   of its rules. tools/server-test.mjs then runs it in real Chrome.         */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { pwaFiles, manifest, GLYPH, COLOURS, ICONS, drawIcon } from "../tools/pwa.mjs";
import { tallyHTML } from "../src/js/ui/progress.js";
import { installable, startPWA } from "../src/js/ui/pwa.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const HEAD = fs.readFileSync(path.join(ROOT, "src/head.html"), "utf8");

/* ---------- the manifest ---------- */

test("the manifest: Icelandic names, the chalkboard's colours, installable icons", () => {
  const m = manifest();
  assert.equal(m.name, "Fallaskóli — íslensk málfræði");
  assert.equal(m.short_name, "Fallaskóli");
  assert.ok(m.short_name.length <= 12, "a home-screen label is cut after about 12 characters");
  assert.equal(m.lang, "is");
  assert.equal(m.display, "standalone");
  /* Relative, so the same files work at a server's root and in a folder. */
  assert.equal(m.start_url, "./");
  assert.equal(m.scope, "./");
  const board = /--board:(#[0-9A-Fa-f]{6})/.exec(HEAD)[1];
  assert.equal(m.theme_color, board, "theme colour is not the board's (src/head.html --board)");
  assert.equal(m.background_color, board);
  assert.equal(COLOURS.chalk, /--chalk:(#[0-9A-Fa-f]{6})/.exec(HEAD)[1]);
  const has = (size, purpose) => m.icons.some((i) => i.sizes === `${size}x${size}` && i.purpose === purpose
    && i.type === "image/png");
  assert.ok(has(192, "any") && has(512, "any"), "Chrome installs only with a 192 and a 512 icon");
  assert.ok(has(512, "maskable"), "Android cuts its own shape out of a maskable icon");
  for (const i of m.icons) assert.ok(!/^\/|:\/\//.test(i.src), "icon paths must be relative: " + i.src);
});

/* ---------- the icon ---------- */

test("the icon is the board's own tally glyph (ui/progress.js), not a copy that can drift", () => {
  const svg = tallyHTML(5, 5);
  const lines = [...svg.matchAll(/<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)"/g)]
    .map((m) => m.slice(1).map(Number));
  assert.deepEqual(lines, GLYPH.lines);
  assert.match(svg, new RegExp(`viewBox="0 0 ${GLYPH.w} ${GLYPH.h}"`));
  assert.match(HEAD, new RegExp(`\\.tallymarks line\\{[^}]*stroke-width:${GLYPH.stroke}[;}]`));
});

/** PNG → { w, h, px(x, y) → [r, g, b, a] }, for the files drawIcon writes
    (RGBA, 8 bits, filter 0 on every row). */
function readPNG(buf) {
  assert.deepEqual([...buf.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  let o = 8, w = 0, h = 0; const idat = [];
  while (o < buf.length) {
    const len = buf.readUInt32BE(o), type = buf.toString("ascii", o + 4, o + 8);
    const data = buf.subarray(o + 8, o + 8 + len);
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); assert.equal(data[9], 6); }
    if (type === "IDAT") idat.push(data);
    o += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const px = (x, y) => { const i = y * (w * 4 + 1) + 1 + x * 4; return [...raw.subarray(i, i + 4)]; };
  return { w, h, px };
}
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

test("the icons: right sizes, board behind, chalk strokes, transparent corners only where meant", () => {
  const { files } = pwaFiles("<!DOCTYPE html>");
  for (const i of ICONS) {
    const png = readPNG(files.get(i.file));
    assert.equal(png.w, i.size); assert.equal(png.h, i.size);
    const corner = png.px(0, 0);
    if (i.kind === "any") assert.equal(corner[3], 0, i.file + ": the rounded corner is not transparent");
    else assert.deepEqual(corner, [...rgb(COLOURS.board), 255], i.file + ": a maskable icon must be full-bleed");
    /* The first upright stroke, half-way down: chalk. Between the strokes: board. */
    const k = (i.kind === "maskable" ? 0.46 : 0.56) * i.size / GLYPH.w;
    const ox = (i.size - GLYPH.w * k) / 2, oy = (i.size - GLYPH.h * k) / 2;
    const stroke = png.px(Math.floor(ox + 3 * k), Math.floor(oy + 6 * k));
    assert.deepEqual(stroke, [...rgb(COLOURS.chalk), 255], i.file + ": no chalk on the first stroke");
    const gap = png.px(Math.floor(ox + 5.5 * k), Math.floor(oy + 3 * k));
    assert.deepEqual(gap, [...rgb(COLOURS.board), 255], i.file + ": no board between the strokes");
  }
});

test("everything is deterministic; the worker's stamp follows the program and nothing else", () => {
  const a = pwaFiles("<!DOCTYPE html><p>eitt"), b = pwaFiles("<!DOCTYPE html><p>eitt");
  const c = pwaFiles("<!DOCTYPE html><p>tvö");
  assert.equal(a.build, b.build);
  for (const [name, buf] of a.files) assert.ok(buf.equals(b.files.get(name)), name + " differs between two runs");
  assert.notEqual(a.build, c.build, "a new program must be a new worker, or the old one is served silently");
  assert.ok(!a.files.get("sw.js").equals(c.files.get("sw.js")));
  for (const name of a.files.keys()) if (name !== "sw.js")
    assert.ok(a.files.get(name).equals(c.files.get(name)), name + " should not depend on the program");
  /* Drawing is the same in a second process too: no state is carried. */
  assert.ok(drawIcon(192, "any").equals(a.files.get("icon-192.png")));
  const sw = a.files.get("sw.js").toString();
  assert.ok(!sw.includes("@@"), "a marker was left in sw.js");
  assert.ok(sw.includes(`const BUILD = "${a.build}";`));
  assert.match(sw, /const ASSETS = \["manifest\.webmanifest","icon-192\.png",/);
});

/* ---------- the worker, run ---------- */

/** Load the stamped worker into a sandbox. `scope` is where it was
    registered. Returns its event handlers and what it did to the caches. */
function loadWorker(scope = "https://skoli.example/") {
  const { files, build } = pwaFiles("<!DOCTYPE html><p>forritið");
  const handlers = {};
  const store = new Map();          // cache name → Map(url → response)
  const log = { fetched: [], deleted: [], claimed: 0, skipped: 0 };
  const cacheOf = (name) => {
    if (!store.has(name)) store.set(name, new Map());
    const m = store.get(name);
    return {
      addAll: async (reqs) => { for (const r of reqs) { log.fetched.push([r.url, r.cache]); m.set(r.url, "svar:" + r.url); } },
      match: async (url) => m.get(url),
    };
  };
  const self = {
    registration: { scope },
    addEventListener: (type, fn) => { handlers[type] = fn; },
    clients: { claim: async () => { log.claimed++; } },
    skipWaiting: () => { log.skipped++; },
  };
  const sandbox = {
    self, URL, Request: class { constructor(url, o = {}) { this.url = url; this.cache = o.cache; } },
    caches: {
      open: async (n) => cacheOf(n),
      keys: async () => [...store.keys()],
      delete: async (n) => { log.deleted.push(n); return store.delete(n); },
    },
    fetch: async (r) => "net:" + (r.url || r),
  };
  vm.runInNewContext(files.get("sw.js").toString(), sandbox);
  return { handlers, store, log, build, assets: [...files.keys()].filter((f) => f !== "sw.js") };
}

/** Send a request through the worker's fetch handler: what did it answer? */
async function through(w, url, { method = "GET", mode = "cors" } = {}) {
  let answered = null;
  w.handlers.fetch({ request: { url, method, mode }, respondWith: (p) => { answered = p; } });
  return answered ? await answered : null;
}

test("the worker caches the program, the manifest and the icons — nothing else", async () => {
  const w = loadWorker();
  let done; w.handlers.install({ waitUntil: (p) => { done = p; } }); await done;
  const urls = w.log.fetched.map(([u]) => u).sort();
  assert.deepEqual(urls, ["https://skoli.example/index.html", ...w.assets.map((a) => "https://skoli.example/" + a)].sort());
  assert.ok(w.log.fetched.every(([, c]) => c === "reload"), "install must go past the HTTP cache");
  assert.ok(!urls.some((u) => /sw\.js/.test(u)), "the worker does not cache itself");
});

test("the worker answers the program and its own files, and leaves every API route to the network", async () => {
  const w = loadWorker();
  let done; w.handlers.install({ waitUntil: (p) => { done = p; } }); await done;
  const B = "https://skoli.example";
  /* Ours. */
  assert.equal(await through(w, B + "/", { mode: "navigate" }), "svar:" + B + "/index.html");
  assert.equal(await through(w, B + "/?bid=1", { mode: "navigate" }), "svar:" + B + "/index.html");
  assert.equal(await through(w, B + "/index.html", { mode: "navigate" }), "svar:" + B + "/index.html");
  assert.equal(await through(w, B + "/icon-192.png"), "svar:" + B + "/icon-192.png");
  assert.equal(await through(w, B + "/manifest.webmanifest"), "svar:" + B + "/manifest.webmanifest");
  /* Not ours: every one of these goes to the network untouched — answered by
     nobody here, so neither served from nor put in the cache. */
  for (const [url, o] of [
    ["/auth/me", {}], ["/auth/login", { method: "POST" }], ["/state/abc123", {}],
    ["/state/abc123", { method: "PUT" }], ["/leaderboard", {}], ["/duels", {}],
    ["/assignments", {}], ["/classgoal", {}], ["/calibration", {}], ["/policy", {}],
    ["/admin/users", {}], ["/health", {}], ["/personuvernd", { mode: "navigate" }],
    ["/auth/google", { mode: "navigate" }], ["/", {}], ["/index.html", {}],
    ["/", { method: "POST", mode: "navigate" }], ["/sw.js", {}], ["/icon-192.png?x=1", {}],
    ["https://annad.example/", { mode: "navigate" }],
  ]) {
    const full = url.startsWith("http") ? url : B + url;
    assert.equal(await through(w, full, o), null, `the worker answered ${o.method || "GET"} ${url} (${o.mode || "cors"})`);
  }
  /* A request the worker answers is never written to the cache by it. */
  const before = JSON.stringify([...w.store].map(([k, m]) => [k, [...m.keys()]]));
  await through(w, B + "/", { mode: "navigate" });
  assert.equal(JSON.stringify([...w.store].map(([k, m]) => [k, [...m.keys()]])), before);
});

test("in a folder of a host, the worker keeps to its folder and its own caches", async () => {
  const w = loadWorker("https://vefur.example/skoli/");
  let done; w.handlers.install({ waitUntil: (p) => { done = p; } }); await done;
  assert.equal(await through(w, "https://vefur.example/skoli/", { mode: "navigate" }),
    "svar:https://vefur.example/skoli/index.html");
  assert.equal(await through(w, "https://vefur.example/", { mode: "navigate" }), null);
  assert.equal(await through(w, "https://vefur.example/annad/index.html", { mode: "navigate" }), null);
  /* Activation deletes this folder's OLD caches only. */
  const [mine] = [...w.store.keys()];
  w.store.set("fallaskoli:/skoli/:gamalt", new Map());
  w.store.set("fallaskoli:/v6.12/:annad", new Map());
  w.store.set("eitthvad-annad", new Map());
  w.handlers.activate({ waitUntil: (p) => { done = p; } }); await done;
  assert.deepEqual(w.log.deleted, ["fallaskoli:/skoli/:gamalt"]);
  assert.ok(w.store.has(mine) && w.store.has("fallaskoli:/v6.12/:annad"));
  assert.equal(w.log.claimed, 1);
});

test("a waiting worker takes over only when the page asks", () => {
  const w = loadWorker();
  w.handlers.message({ data: { type: "annad" } });
  assert.equal(w.log.skipped, 0);
  w.handlers.message({ data: { type: "skip-waiting" } });
  assert.equal(w.log.skipped, 1);
  assert.ok(!w.handlers.install.toString().includes("skipWaiting"),
    "installing must not take over by itself: the pupil is offered the new version");
});

/* ---------- the page side ---------- */

test("opened from a file: no worker, no manifest, nothing asked of anybody", () => {
  const saved = { location: globalThis.location, navigator: globalThis.navigator };
  let registered = 0;
  try {
    Object.defineProperty(globalThis, "navigator", { configurable: true,
      value: { serviceWorker: { register: () => { registered++; return Promise.resolve({}); } } } });
    globalThis.location = { protocol: "file:" };
    assert.equal(installable(), false);
    assert.equal(startPWA(), null);
    assert.equal(registered, 0);
    globalThis.location = { protocol: "https:" };
    assert.equal(installable(), true);
  } finally {
    if (saved.location === undefined) delete globalThis.location; else globalThis.location = saved.location;
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: saved.navigator });
  }
});

/* ---------- the server ---------- */

test("the server serves the manifest, the icons and a worker stamped with the program it serves", async () => {
  const { createApp } = await import("../server/server.mjs");
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "fallaskoli-pwa-"));
  const html = path.join(dir, "forrit.html");
  await fsp.writeFile(html, "<!DOCTYPE html><title>eitt</title>");
  const app = createApp({ dataDir: path.join(dir, "data"), htmlFile: html, secureCookies: false, env: {} });
  await app.store.init();
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + app.server.address().port;
  try {
    const sw = await fetch(base + "/sw.js");
    assert.equal(sw.status, 200);
    assert.match(sw.headers.get("content-type"), /^text\/javascript/);
    assert.equal(sw.headers.get("cache-control"), "no-cache", "a cached sw.js would hide a new version");
    assert.equal(sw.headers.get("content-security-policy"), "default-src 'none'; connect-src 'self'");
    const text = await sw.text();
    const expect = pwaFiles(await fsp.readFile(html));
    assert.equal(text, expect.files.get("sw.js").toString(), "the worker is not stamped with the served file");

    const mf = await fetch(base + "/manifest.webmanifest");
    assert.match(mf.headers.get("content-type"), /^application\/manifest\+json/);
    assert.deepEqual(await mf.json(), manifest());
    for (const i of ICONS) {
      const r = await fetch(base + "/" + i.file);
      assert.equal(r.headers.get("content-type"), "image/png");
      assert.ok(Buffer.from(await r.arrayBuffer()).equals(expect.files.get(i.file)), i.file);
    }
    const again = await fetch(base + "/sw.js", { headers: { "If-None-Match": sw.headers.get("etag") } });
    assert.equal(again.status, 304);

    /* The program's own policy lets the page load its manifest, icons and
       worker from here — and only from here. */
    const page = await fetch(base + "/");
    const csp = page.headers.get("content-security-policy");
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /script-src 'self'/);
    assert.doesNotMatch(csp, /worker-src|manifest-src/, "a narrower worker-src/manifest-src would need 'self' too");

    /* A new build: a new worker (and the 304 no longer applies). */
    await fsp.writeFile(html, "<!DOCTYPE html><title>tvö</title>");
    const later = await fetch(base + "/sw.js", { headers: { "If-None-Match": sw.headers.get("etag") } });
    assert.equal(later.status, 200);
    assert.notEqual(await later.text(), text);

    /* Not a way into anything else. */
    assert.equal((await fetch(base + "/src/sw.js")).status, 404);
    assert.equal((await fetch(base + "/sw.js", { method: "POST" })).status, 404);
  } finally {
    await new Promise((r) => app.server.close(r));
    await fsp.rm(dir, { recursive: true, force: true });
  }
});
