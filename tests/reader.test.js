/* #47 — the server's text reader (server/reader.mjs), through its fake plug
 * (server/reader-fake.mjs). What is written once in the reader for every
 * plug: the timeout, "busy", "unavailable", the size limit, the quote check,
 * and that the text is written to no file and no log. Ritun vikunnar's own
 * behaviour through the GreynirCorrect plug is held by tests/writing.test.js. */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createReader, checkQuotes, fault, FAULTS } from "../server/reader.mjs";
import { fakePlug } from "../server/reader-fake.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);
const TEXT = "Ég fór í skólan í gær. Mér langar að fara aftur.";
/* The reader's timers are unref'd (they must never keep the server alive); in
   a test nothing else holds the event loop while a plug hangs, so this does. */
let alive;
before(() => { alive = setInterval(() => {}, 1000); });
after(() => clearInterval(alive));

const reader = (plug, more = {}) =>
  createReader({ plugs: { fake: plug }, maxChars: 600, maxQueue: 2, timeoutMs: 200, ...more });

test("reader: the plug's findings come back, with what else the plug adds", async () => {
  const f = { start: 9, end: 15, quote: "skólan", msg: "skólann" };
  const out = await reader(fakePlug({ answer: async (text, { context }) =>
    ({ findings: [f], sentences: 2, saw: context.topic }) })).read("fake", TEXT, { topic: "sund" });
  assert.deepEqual(out, { findings: [f], sentences: 2, saw: "sund" });
});

test("reader: the quote check drops an invented quote and keeps every finding on the text", async () => {
  const findings = [
    { quote: "skólan", start: 9, end: 15, msg: "rétt" },
    { quote: "Mig langar", msg: "uppdiktað: ekki í textanum" },
    { quote: "Mér langar", start: 0, end: 10, msg: "á röngum stað" },
    { quote: "", msg: "tóm tilvitnun" },
    { quote: 7, msg: "ekki texti" },
    { start: 9999, end: 10000, msg: "utan textans" },
    { msg: "um allan textann" },
    null,
  ];
  const out = await reader(fakePlug({ findings })).read("fake", TEXT);
  assert.equal(out.fault, undefined);
  assert.ok(!out.findings.some((f) => f.msg === "uppdiktað: ekki í textanum"), "the invented quote is dropped");
  assert.deepEqual(out.findings.map((f) => f.msg), ["rétt", "á röngum stað", "utan textans", "um allan textann"]);
  const moved = out.findings[1];
  assert.equal(TEXT.slice(moved.start, moved.end), "Mér langar", "a true quote is given the range where it is");
  assert.deepEqual([out.findings[2].start, out.findings[2].end], [null, null], "a range off the text points at nothing");
  for (const f of out.findings.filter((x) => typeof x.quote === "string"))
    assert.equal(TEXT.slice(f.start, f.end), f.quote);
  assert.deepEqual(checkQuotes([{ quote: "xyz" }], TEXT), []);
});

test("reader: past the timeout the answer is 'timeout' and the plug is told to stop", async () => {
  let aborted = false;
  const plug = fakePlug({ answer: (text, { signal }) => new Promise(() => {
    signal.addEventListener("abort", () => { aborted = true; });
  }) });
  const t0 = Date.now();
  assert.deepEqual(await reader(plug).read("fake", TEXT), { fault: "timeout" });
  assert.ok(Date.now() - t0 < 1500, "the timeout is held");
  assert.ok(aborted, "the plug's signal is aborted");
});

test("reader: the plug's start is not counted in the timeout", async () => {
  const plug = fakePlug({ findings: [] });
  plug.start = () => new Promise((r) => setTimeout(r, 300));
  assert.deepEqual(await reader(plug).read("fake", TEXT), { findings: [] });
});

test("reader: more than maxQueue texts at once are 'busy', and the queue frees again", async () => {
  const waiting = [];
  const plug = fakePlug({ answer: () => new Promise((r) => waiting.push(r)) });
  const rd = reader(plug, { timeoutMs: 5000 });
  const a = rd.read("fake", TEXT), b = rd.read("fake", TEXT);
  assert.deepEqual(await rd.read("fake", TEXT), { fault: "busy" });
  await new Promise((r) => setImmediate(r));
  for (const r of waiting) r({ findings: [] });
  await Promise.all([a, b]);
  const c = rd.read("fake", TEXT);
  await new Promise((r) => setImmediate(r));
  waiting.at(-1)({ findings: [] });
  assert.deepEqual(await c, { findings: [] }, "after the burst a text is read again");
});

test("reader: a plug that cannot start is 'unavailable'; an unknown kind is 'off'; errors are faults", async () => {
  assert.deepEqual(await reader(fakePlug({ unavailable: true })).read("fake", TEXT), { fault: "unavailable" });
  assert.deepEqual(await reader(fakePlug()).read("claude", TEXT), { fault: "off" });
  assert.deepEqual(await reader(fakePlug({ answer: () => { throw fault("busy"); } })).read("fake", TEXT), { fault: "busy" });
  assert.deepEqual(await reader(fakePlug({ answer: () => { throw new Error(TEXT); } })).read("fake", TEXT), { fault: "failed" });
  assert.deepEqual(await reader(fakePlug({ answer: () => ({ nope: 1 }) })).read("fake", TEXT), { fault: "failed" });
  assert.deepEqual(FAULTS, ["off", "unavailable", "busy", "timeout", "failed"]);
});

test("reader: a text that is empty, not a string or too long never reaches the plug", async () => {
  let reached = 0;
  const rd = reader(fakePlug({ answer: () => { reached += 1; return { findings: [] }; } }), { maxChars: 20 });
  for (const t of ["", null, 42, "x".repeat(21)]) assert.deepEqual(await rd.read("fake", t), { fault: "failed" });
  assert.equal(reached, 0);
  assert.deepEqual(await rd.read("fake", "x".repeat(20)), { findings: [] });
});

test("reader: the text is written to no file and no log, on every path", async () => {
  const MARK = "LEYNDARTEXTI-47 Ég á hund.";
  const said = [];
  const keep = { log: console.log, error: console.error, warn: console.warn, info: console.info, debug: console.debug,
    out: process.stdout.write, err: process.stderr.write };
  for (const k of ["log", "error", "warn", "info", "debug"]) console[k] = (...a) => { said.push(a.join(" ")); };
  process.stdout.write = function (s, ...rest) { said.push(String(s)); return keep.out.call(this, s, ...rest); };
  process.stderr.write = function (s, ...rest) { said.push(String(s)); return keep.err.call(this, s, ...rest); };
  try {
    const plugs = {
      ok: fakePlug({ findings: [{ quote: "hund", msg: "m" }, { quote: "kött", msg: "x" }] }),
      down: fakePlug({ unavailable: true }),
      crash: fakePlug({ answer: (text) => { throw new Error(text); } }),
      hang: fakePlug({ answer: () => new Promise(() => {}) }),
    };
    const rd = createReader({ plugs, maxChars: 600, maxQueue: 1, timeoutMs: 50 });
    for (const kind of Object.keys(plugs)) await rd.read(kind, MARK);
    await Promise.all([rd.read("hang", MARK), rd.read("hang", MARK)]);   // and "busy"
  } finally {
    Object.assign(console, { log: keep.log, error: keep.error, warn: keep.warn, info: keep.info, debug: keep.debug });
    process.stdout.write = keep.out; process.stderr.write = keep.err;
  }
  assert.ok(!said.some((s) => s.includes("LEYNDARTEXTI")), "the text reached a log");
  /* And no file: the reader and its plugs import nothing that writes one, and log nothing. */
  for (const f of ["server/reader.mjs", "server/reader-greynir.mjs", "server/reader-fake.mjs"]) {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8");
    assert.ok(!/from\s+["'](node:)?fs(\/promises)?["']/.test(src), `${f} imports fs`);
    assert.ok(!/\bconsole\./.test(src), `${f} logs`);
    assert.ok(!/["']inherit["']|stdio:\s*["']/.test(src), `${f} lets a child print into the server's log`);
  }
});
