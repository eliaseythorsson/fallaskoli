/* Answers that wait for the server (issue #48; docs/adr/0002).

   A server-graded question goes through the same `judge` → `settle` as every
   other: `judge` says "read it first" (`pending: "server"`), the server's
   reader returns checked findings, `judge` decides, and the answer is settled
   ONCE — after the one revision, or after the first try if there is nothing
   to revise, or as "not judged" when the grader did not answer twice.

   No real type is server-graded yet, so a made-up one stands in, and the
   server's own text reader with its FAKE plug does the reading
   (server/reader.mjs, server/reader-fake.mjs). No network. */

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { blankState, newSession, effectivePolicy, todayKey } from "../src/js/core/state.js";
import { judge, settle, serverGraded, REVISE_XP } from "../src/js/core/answer.js";
import { entriesOf } from "../src/js/core/wordknowledge.js";
import { serverQuestion, readWithRetry, serverReader, READ_TRIES } from "../src/js/control/serverask.js";
import { setServerGrader, serverGraderLost, serverGraderUp, resetServerGrader } from "../src/js/core/servergrader.js";
import { enabled } from "../src/js/tasks/registry.js";
import { blankPolicy } from "../src/js/core/policy.js";
import { createReader, fault } from "../server/reader.mjs";
import { fakePlug } from "../server/reader-fake.mjs";

const WORD = "hestur|kk";
/** A made-up server-graded question: explain *hestur* in your own words. */
const fixture = (extra = {}) => ({
  type: "meaning", typeId: "fixture_server", grader: "server",
  skill: "ordaford", word: WORD, base: 10, lvl: 1,
  n: { o: "hestur", d: "stórt húsdýr", c: "kk" },
  read: { kind: "fixture", context: { word: "hestur" } },
  rubric: { main: "meaning", points: [
    { id: "meaning", label: "Merkingin er rétt", ask: "Hvers konar dýr er hestur?" },
    { id: "own", label: "Með þínum eigin orðum", ask: "Geturðu sagt það með þínum orðum?" },
  ] },
  ...extra,
});
/** The catalogue's description of the fixture, as the policy sees it. */
const SPEC = { id: "fixture_server", skill: "ordaford", grader: "server" };

/* What the fake reader finds: the meaning is there when the text says "dýr",
   and the pupil's own words when it is longer than three words. */
const findingsFor = (text) => [
  ...(/dýr/i.test(text) ? [{ point: "meaning", met: true, quote: /dýr/i.exec(text)[0] }] : [{ point: "meaning", met: false }]),
  ...(text.split(" ").length > 3 ? [{ point: "own", met: true }] : [{ point: "own", met: false }]),
];

/** The server's reader with the fake plug, as a transport, counting its calls. */
function fakeRead({ answer = (text) => ({ findings: findingsFor(text) }), timeoutMs = 200, unavailable = false } = {}) {
  const reader = createReader({
    plugs: { fixture: fakePlug({ answer, unavailable }) }, maxChars: 1200, timeoutMs,
  });
  const read = async (req) => { read.calls++; return reader.read(req.kind, req.text, req.context); };
  read.calls = 0;
  return read;
}

/* The reader's timeout timer does not hold the process open (it is unref'd),
   so a test whose plug never answers keeps the loop alive itself. */
async function alive(fn) {
  const keep = setInterval(() => {}, 20);
  try { return await fn(); } finally { clearInterval(keep); }
}

function pupil() {
  const S = blankState();
  const sess = newSession(S);
  return { S, sess };
}

/** Play one question to its end the way the screen does: answers in order
    (`null` = keep the first), settling whatever comes back final. */
async function play(task, read, answers, p = pupil()) {
  const q = serverQuestion(task, { read, pupil: p });
  let settles = 0;
  const shown = [];
  let final = null;
  for (const a of answers) {
    const j = a === null ? q.keep() : await q.send({ text: a });
    if (!j) continue;
    shown.push(typeof j.pending === "string" ? j.pending : j.verdict);
    if (!j.pending) {
      settles++;
      final = j;
      settle(p.S, p.sess, task, j, { ms: 1000 });
    }
  }
  return { q, settles, shown, final, ...p };
}

beforeEach(() => resetServerGrader());

test("judge says 'read it first', and nothing is settled by that", () => {
  const t = fixture();
  assert.equal(serverGraded(t), true);
  const j = judge(t, { text: "Hestur er dýr" });
  assert.equal(j.pending, "server");
  assert.deepEqual(j.detail.read, { kind: "fixture", text: "Hestur er dýr", context: { word: "hestur" } });
  const { S, sess } = pupil();
  const before = JSON.stringify(S);
  assert.equal(settle(S, sess, t, j), null);
  assert.equal(JSON.stringify(S), before);
  assert.equal(judge(t, { text: "  " }).pending, true, "an empty box is the ordinary pending");
  /* judge is pure: the same reading, the same judgement */
  const reading = { findings: findingsFor("Hestur er stórt dýr á bæ") };
  assert.deepEqual(judge(t, { text: "Hestur er stórt dýr á bæ", reading }),
    judge(t, { text: "Hestur er stórt dýr á bæ", reading }));
});

test("first try right: settled at once, a right entry, XP for finishing", async () => {
  const read = fakeRead();
  const r = await play(fixture(), read, ["Hestur er stórt dýr á bæ"]);
  assert.equal(r.settles, 1);
  assert.equal(read.calls, 1);
  assert.equal(r.final.ok, true);
  assert.equal(r.final.verdict, "right");
  assert.equal(r.final.xp, 10);
  assert.equal(r.final.detail.xpRevise, 0);
  assert.equal(r.S.xp, 10);
  assert.deepEqual(entriesOf(r.S, WORD).map((e) => e.outcome), ["r"]);
  assert.equal(r.S.days[todayKey()].a, 1, "one answer");
  assert.equal(r.q.phase, "done");
});

test("revise, then right: one checklist, one question, one settle", async () => {
  const read = fakeRead();
  const q = serverQuestion(fixture(), { read, pupil: pupil() });
  const first = await q.send({ text: "Hann hleypur" });
  assert.equal(first.pending, "revise");
  assert.deepEqual(first.detail.checklist.map((p) => [p.id, p.met]), [["meaning", false], ["own", false]]);
  assert.equal(first.detail.ask, "Hvers konar dýr er hestur?", "the main point is asked about first");
  const r = await play(fixture(), fakeRead(), ["Hann hleypur", "Hestur er stórt dýr á bæ"]);
  assert.deepEqual(r.shown, ["revise", "right"]);
  assert.equal(r.settles, 1);
  assert.equal(r.final.ok, true);
  assert.equal(r.final.detail.revised, true);
  assert.equal(r.final.xp, 10 + 10 * REVISE_XP, "XP for finishing and for revising");
  assert.deepEqual(entriesOf(r.S, WORD).map((e) => e.outcome), ["r"]);
});

test("revise, then still wrong: wrong by the main point, and the same XP as right", async () => {
  const r = await play(fixture(), fakeRead(), ["Hann hleypur", "Hann hleypur hratt um tún og engi"]);
  assert.deepEqual(r.shown, ["revise", "wrong"]);
  assert.equal(r.settles, 1);
  assert.equal(r.final.ok, false);
  assert.equal(r.final.xp, 15, "XP is never for the verdict");
  assert.deepEqual(entriesOf(r.S, WORD).map((e) => e.outcome), ["w"]);
  /* only ONE revision: the question is over */
  assert.equal(await r.q.send({ text: "Hestur er dýr" }), null);
});

test("the main point there, a side point missing: still one revision offered", async () => {
  const r = await play(fixture(), fakeRead(), ["Dýr", "Hestur er dýr sem hneggjar"]);
  assert.deepEqual(r.shown, ["revise", "right"]);
  assert.equal(r.settles, 1);
});

test("keeping the first answer settles it on the first reading, without revise XP", async () => {
  const r = await play(fixture(), fakeRead(), ["Dýr", null]);
  assert.deepEqual(r.shown, ["revise", "right"]);
  assert.equal(r.settles, 1);
  assert.equal(r.final.xp, 10);
  assert.equal(r.q.keep(), null, "keep twice does nothing");
});

test("a revision that is the first answer again uses nothing up", async () => {
  const read = fakeRead();
  const r = await play(fixture(), read, ["Hann hleypur", " hann  hleypur", "Hestur er stórt dýr á bæ"]);
  assert.deepEqual(r.shown, ["revise", "same", "right"]);
  assert.equal(r.settles, 1);
  assert.equal(read.calls, 2, "the same text is not read again");
});

test("grader down twice: not judged, XP for finishing, a seen entry, no right or wrong", async () => {
  setServerGrader(true);
  const read = fakeRead({ unavailable: true });
  const p = pupil();
  p.S.allowed = { ...blankPolicy(), serverGrading: true };
  assert.equal(enabled(effectivePolicy(p.S), SPEC), true, "on before the failure");
  const r = await play(fixture(), read, ["Hestur er dýr"], p);
  assert.equal(read.calls, READ_TRIES, "one automatic retry");
  assert.equal(r.settles, 1);
  assert.equal(r.final.ok, null);
  assert.equal(r.final.verdict, "notjudged");
  assert.equal(r.final.xp, 10);
  assert.equal(r.S.xp, 10);
  assert.equal(r.S.totalAnswers, 0, "neither right nor wrong");
  assert.equal((r.S.days[todayKey()] || {}).a || 0, 0);
  assert.equal(r.S.words[WORD], undefined, "no right/wrong record of the word");
  assert.deepEqual(entriesOf(r.S, WORD).map((e) => e.outcome), ["s"]);
  /* The screen then says the grader is lost (ui/serverask.js); the session
     goes on without server-graded types. */
  serverGraderLost();
  assert.equal(serverGraderUp(), false);
  assert.equal(enabled(effectivePolicy(r.S), SPEC), false, "left out for the rest of the visit");
  assert.equal(enabled(effectivePolicy(r.S), { id: "meaning", skill: "ordaford", grader: "app" }), true);
  setServerGrader(true);
  assert.equal(serverGraderUp(), false, "not back until the page is opened again");
});

test("down on the revision: not judged, with the revising XP", async () => {
  let n = 0;
  const read = fakeRead({ answer: (text) => { if (++n > 1) throw fault("busy"); return { findings: findingsFor(text) }; } });
  const r = await play(fixture(), read, ["Hann hleypur", "Hestur er stórt dýr á bæ"]);
  assert.deepEqual(r.shown, ["revise", "notjudged"]);
  assert.equal(r.settles, 1);
  assert.equal(r.final.xp, 15);
});

test("down once, up on the retry: judged as usual", async () => {
  let n = 0;
  const read = fakeRead({ answer: (text) => { if (++n === 1) throw fault("unavailable"); return { findings: findingsFor(text) }; } });
  const r = await play(fixture(), read, ["Hestur er stórt dýr á bæ"]);
  assert.equal(read.calls, 2);
  assert.equal(r.final.verdict, "right");
});

test("a slow answer, then success: the pupil waits, and a second click is ignored", async () => {
  const slow = (text) => new Promise((ok) => setTimeout(() => ok({ findings: findingsFor(text) }), 60));
  const read = fakeRead({ answer: slow, timeoutMs: 500 });
  const p = pupil();
  const t = fixture();
  const q = serverQuestion(t, { read, pupil: p });
  const going = q.send({ text: "Hestur er stórt dýr á bæ" });
  assert.equal(q.phase, "reading");
  assert.equal(await q.send({ text: "Hestur er stórt dýr á bæ" }), null, "a double click while reading");
  const j = await going;
  assert.equal(j.verdict, "right");
  assert.equal(read.calls, 1);
  assert.equal(await q.send({ text: "annað" }), null, "and nothing after the end");
});

test("too slow for the reader's timeout, then fast on the retry", async () => {
  let n = 0;
  const answer = (text) => (++n === 1 ? new Promise(() => {}) : { findings: findingsFor(text) });
  const read = fakeRead({ answer, timeoutMs: 40 });
  const r = await alive(() => play(fixture(), read, ["Hestur er stórt dýr á bæ"]));
  assert.equal(read.calls, 2);
  assert.equal(r.final.verdict, "right");
  assert.equal(r.settles, 1);
});

test("the browser's patience: a server that never answers is a timeout, never a wait for ever", async () => {
  const never = { graderRead: () => new Promise(() => {}) };
  const t0 = Date.now();
  const out = await readWithRetry(serverReader(never, { patienceMs: 30 }), { kind: "fixture", text: "x", context: null });
  assert.deepEqual(out, { fault: "timeout" });
  assert.ok(Date.now() - t0 < 1000);
  /* a refusal's fault comes from its body; "off" is not retried */
  let calls = 0;
  const off = { graderRead: async () => { calls++; throw Object.assign(new Error("x"), { data: { fault: "off" } }); } };
  assert.deepEqual(await readWithRetry(serverReader(off), { kind: "fixture", text: "x" }), { fault: "off" });
  assert.equal(calls, 1);
  const junk = { graderRead: async () => ({ verdict: "right" }) };
  assert.deepEqual(await readWithRetry(serverReader(junk), { kind: "fixture", text: "x" }), { fault: "failed" },
    "a server that sends a verdict instead of findings is not believed");
});

test("exactly one settle per question, in every case", async () => {
  const cases = [
    [fakeRead(), ["Hestur er stórt dýr á bæ"]],
    [fakeRead(), ["Hann hleypur", "Hestur er stórt dýr á bæ"]],
    [fakeRead(), ["Hann hleypur", "Hann hleypur hratt um tún og engi"]],
    [fakeRead(), ["Dýr", null]],
    [fakeRead(), ["", "Hann hleypur", "Hann hleypur", null, null]],
    [fakeRead({ unavailable: true }), ["Hestur er dýr", "Hestur er dýr", null]],
    [fakeRead({ answer: () => new Promise(() => {}), timeoutMs: 20 }), ["Hestur er dýr"]],
  ];
  for (const [read, answers] of cases) {
    const r = await alive(() => play(fixture(), read, [...answers, "Eitthvað meira", null]));
    assert.equal(r.settles, 1, JSON.stringify(answers));
    assert.equal(entriesOf(r.S, WORD).length, 1, JSON.stringify(answers));
  }
});

test("an invented quote is dropped by the reader, so it ticks nothing", async () => {
  const read = fakeRead({ answer: () => ({ findings: [{ point: "meaning", met: true, quote: "dýr" }, { point: "own", met: true }] }) });
  const r = await play(fixture(), read, ["Hann hleypur hratt um tún", null]);
  assert.deepEqual(r.shown, ["revise", "wrong"]);
});

test("in a duel there is no revision", async () => {
  const r = await play(fixture({ duel: true }), fakeRead(), ["Hann hleypur"]);
  assert.deepEqual(r.shown, ["wrong"]);
  assert.equal(r.settles, 1);
});

test("without a server nothing can be read: not judged at once, never a wait", async () => {
  const q = serverQuestion(fixture(), { pupil: pupil() });
  const j = await q.send({ text: "Hestur er dýr" });
  assert.equal(j.verdict, "notjudged");
});

test("an ordinary type is not server-graded, and its judge is untouched", () => {
  assert.equal(serverGraded({ type: "meaning", typeId: "meaning" }), false);
  assert.equal(serverGraded({ type: "fill", typeId: "fill" }), false);
  const j = judge({ type: "meaning", typeId: "meaning", skill: "ordaford", word: WORD, base: 5 }, { text: "Hestur er stórt dýr" });
  assert.equal(j.pending, false);
  assert.equal(j.verdict, "open");
});

test("the grader is down by default, so server types stay hidden", () => {
  const S = blankState();
  S.allowed = { ...blankPolicy(), serverGrading: true };
  assert.equal(serverGraderUp(), false);
  assert.equal(enabled(effectivePolicy(S), SPEC), false);
  setServerGrader("yes");
  assert.equal(serverGraderUp(), false, "only `true` counts");
  setServerGrader(true);
  assert.equal(enabled(effectivePolicy(S), SPEC), true);
  S.allowed = blankPolicy();
  assert.equal(enabled(effectivePolicy(S), SPEC), false, "and never without the administrator's switch");
});
