/* v6.13, item 46 — "Skrifaðu þrjár setningar um …", read over by GreynirCorrect.
 *
 * What these hold:
 *   - core/writing.js: the topics and the week's, tidying and counting a text,
 *     what an annotation may be, and carrying the remarks through the pupil's
 *     edits (what lets them be fixed one by one), and that the progress keeps
 *     the week and never the text;
 *   - ui/writing.js: the pieces of the card — the line that says what happens
 *     to the text, one remark marked in its sentence, the summary;
 *   - the server (real HTTP, a stand-in worker in tests/fixtures): off by
 *     default; who may switch it on; the limits (body, text, rate); the
 *     timeout (504, and the worker is restarted); a worker that cannot start
 *     (503); that nothing is stored unless keeping is on, that what is kept
 *     is the teacher's own group's, in the export, gone when keeping goes off
 *     and gone with the account;
 *   - the real GreynirCorrect, one round trip, when it is installed.
 * The browser round trip is in tools/browser-test.mjs and tools/server-test.mjs. */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createApp } from "../server/server.mjs";
import { hashPassword, newId } from "../server/auth.mjs";
import { createChecker, switchesOf, pruneKept } from "../server/writing.mjs";
import { cleanState } from "../server/guard.mjs";
import { blankState } from "../src/js/core/state.js";
import { weekKey } from "../src/js/core/social.js";
import { WRITING, TOPICS, topicFor, promptFor, cleanText, countSentences, cleanAnnotations,
  followEdit, nextOpen, writingDone, markWritingDone } from "../src/js/core/writing.js";
import { modeHTML, markedHTML, noteHTML, notesDoneHTML, writingOfferHTML, teacherWritingHTML, SELF_ONLY }
  from "../src/js/ui/writing.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE = path.join(HERE, "fixtures", "fake-writing-worker.mjs");

/* ---------- the task ------------------------------------------------------------- */

test("a topic for every week, the same for the whole class, and each one in turn", () => {
  const weeks = Array.from({ length: TOPICS.length }, (_, k) =>
    new Date(Date.UTC(2026, 10, 16 + 7 * k)).toISOString().slice(0, 10));
  const got = weeks.map(topicFor);
  assert.equal(new Set(got).size, TOPICS.length, "fourteen weeks, fourteen topics");
  assert.equal(topicFor("2026-11-16"), topicFor("2026-11-16"));
  assert.ok(TOPICS.includes(topicFor("not a date")));
  assert.equal(promptFor("2026-11-16"), `Skrifaðu þrjár setningar um ${topicFor("2026-11-16")}.`);
  for (const t of TOPICS) {
    assert.match(t, /^\p{Ll}[\p{L} ]+\p{L}$/u, `a topic is lower-case words: ${t}`);
    assert.ok(!/þig langar/.test(t), "the phrase GreynirCorrect flags is not a topic");
  }
});

test("a text is tidied, not cut; sentences are counted without lookbehind", () => {
  assert.equal(cleanText("  Ég\u200b fór\n\n í  skólann.\u0007 "), "Ég fór í skólann.");
  assert.equal(cleanText(42), "");
  assert.equal(cleanText("x".repeat(700)).length, 700, "too long is refused by the server, not shortened here");
  assert.equal(countSentences("Ég er hér. Þú ert þar! Hvað nú?"), 3);
  assert.equal(countSentences("Ég er hér"), 1);
  assert.equal(countSentences(" . ! "), 0);
  assert.equal(countSentences("Hæ... já."), 2);
  assert.ok(!/\(\?<[=!]/.test(countSentences.toString()), "Safari before 16.4 throws on lookbehind");
});

test("annotations: offsets inside the text or none, plain words for 'could not parse', in order", () => {
  const t = "Ég fór í skólan.";
  const out = cleanAnnotations([
    { start: 9, end: 15, code: "N4NN-END", msg: "Stafsetningarvilla", suggest: "skólann" },
    { start: 0, end: 99, code: "X", msg: "of langt" },
    { start: 0, end: 16, code: "E001", msg: "Ekki tókst að þátta setningu" },
    { code: "Y" }, null, "junk",
  ], t);
  assert.equal(out.length, 3, "one without a message is dropped");
  assert.deepEqual(out.map((a) => [a.start, a.end]), [[0, 16], [9, 15], [null, null]]);
  assert.doesNotMatch(out[0].msg, /þátta/, "a teenager is not told about parsing");
  assert.equal(cleanAnnotations("x", t).length, 0);
  assert.equal(cleanAnnotations(Array(100).fill({ start: 0, end: 1, msg: "m" }), t).length, WRITING.maxNotes);
});

test("the remarks follow the pupil's edits: one edited is dealt with, those after it move", () => {
  const t = "Mér langar í sund. Ég fór í skólan í gær.";
  let notes = cleanAnnotations([{ start: 0, end: 3, msg: "Mig" }, { start: 28, end: 34, msg: "skólann" }], t);
  assert.equal(nextOpen(notes), 0);
  /* Fixing the first: "Mér" → "Mig". */
  const t2 = "Mig langar í sund. Ég fór í skólan í gær.";
  notes = followEdit(notes, t, t2);
  assert.equal(notes[0].touched, true);
  assert.deepEqual([notes[1].start, notes[1].end], [28, 34]);
  assert.equal(nextOpen(notes), 1);
  /* Something added before the second moves it along. */
  const t3 = "Mig langar mikið í sund. Ég fór í skólan í gær.";
  notes = followEdit(notes, t2, t3);
  assert.equal(t3.slice(notes[1].start, notes[1].end), "skólan");
  /* A letter typed at the end of the word fixes it. */
  const t4 = "Mig langar mikið í sund. Ég fór í skólann í gær.";
  notes = followEdit(notes, t3, t4);
  assert.equal(notes[1].touched, true);
  assert.equal(nextOpen(notes), -1);
  /* A remark that could not be placed is left alone; a skipped one is passed. */
  const loose = followEdit([{ start: null, end: null, msg: "x" }, { start: 0, end: 1, msg: "y", skipped: true }], "a b", "ab");
  assert.equal(loose[0].touched, undefined);
  assert.equal(nextOpen(loose), 0);
  assert.equal(nextOpen(loose, 1), -1);
  /* Nothing changed: nothing moves. */
  assert.deepEqual(followEdit(notes, t4, t4), notes);
});

test("the progress keeps the week it was finished in, never the text, and the server's guard keeps it", () => {
  const S = blankState();
  assert.equal(writingDone(S, "2026-11-16"), false);
  markWritingDone(S, "2026-11-16");
  assert.equal(S.settings.writingDone, "2026-11-16");
  assert.equal(writingDone(S, "2026-11-16"), true);
  assert.equal(writingDone(S, "2026-11-23"), false, "a new week, a new task");
  markWritingDone(S, "Mér langar í sund");
  assert.equal(S.settings.writingDone, "2026-11-16", "only a Monday is written");
  assert.equal(cleanState(S).settings.writingDone, "2026-11-16", "the guard lets it through");
});

/* ---------- the card ---------------------------------------------------------------------- */

test("the card says what happens to the text before anything is sent", () => {
  assert.match(modeHTML(null), /ekki sendur neitt og ekki geymdur/);
  assert.match(modeHTML({ check: false }), /Lestu hann sjálf\(ur\) yfir/);
  assert.match(modeHTML({ check: true, available: false }), /ekki í boði/);
  assert.match(modeHTML({ check: true, keep: false, available: true }), /sendur á netþjóninn.*<b>ekki<\/b> geymdur/s);
  assert.match(modeHTML({ check: true, keep: true, available: null }), /hefur kveikt á því að textinn sé geymdur/);
});

test("one remark at a time: its stretch marked in its own sentence, escaped", () => {
  const t = "Ég á hund. Ég fór í <skólan> í gær. Það var gaman.";
  const n = { start: 20, end: 28, msg: "Stafsetningarvilla", detail: "Rita á 'nn'." };
  assert.equal(t.slice(20, 28), "<skólan>");
  const m = markedHTML(t, n);
  assert.equal(m, `<p class="wrquote">Ég fór í <mark>&lt;skólan&gt;</mark> í gær.</p>`);
  assert.equal(markedHTML(t, { start: null, end: null }), "");
  const card = noteHTML([n, { start: 0, end: 2, msg: "b" }], 0, t);
  assert.match(card, /Athugasemd 1 af 2/);
  assert.match(card, /id="wr-fix"/);
  assert.match(card, /id="wr-skip"/);
  assert.match(card, /Rita á &#39;nn&#39;|Rita á 'nn'/);
  assert.match(notesDoneHTML([]), /fann ekkert að/);
  assert.match(notesDoneHTML([{ touched: true }, { skipped: true }]), /lagaðir 1 og slepptir 1/);
});

test("the offer in the picker: the week's prompt, and whether it is done", () => {
  const S = blankState();
  const week = weekKey(new Date());
  assert.match(writingOfferHTML(S, week), new RegExp(promptFor(week)));
  assert.match(writingOfferHTML(S, week), /Skrifa →/);
  markWritingDone(S, week);
  assert.match(writingOfferHTML(S, week), /lokið í þessari viku/);
  /* Review S14: with no server the offer says nothing reads the text over. */
  assert.ok(writingOfferHTML(S, week, { selfOnly: true }).includes(SELF_ONLY));
  assert.ok(!writingOfferHTML(S, week).includes(SELF_ONLY), "on a server the card says what happens, after asking it");
  assert.equal(SELF_ONLY, "Hér er enginn yfirlestur. Þú lest textann sjálf(ur) yfir.");
});

test("the teacher's card: off by default, keeping needs the check, kept texts escaped", () => {
  const off = teacherWritingHTML({ check: false, keep: false, available: null, texts: [] });
  assert.match(off, /id="tc-wr-check">/);
  assert.match(off, /id="tc-wr-keep" disabled>/);
  assert.match(off, /Sjálfgefið er slökkt/);
  const kept = teacherWritingHTML({ check: true, keep: true, available: true,
    texts: [{ name: "Anna", week: "2026-11-16", topic: "skólann þinn", text: "<b>Hæ</b>", n: 1 }] });
  assert.match(kept, /&lt;b&gt;Hæ&lt;\/b&gt;/);
  assert.match(kept, /1 athugasemd</);
  assert.match(teacherWritingHTML({ check: true, available: false }), /ekki uppsettur/);
});

/* ---------- pieces of the server ------------------------------------------------------------- */

test("a group's switches: off unless set, and keeping only with the check", () => {
  assert.deepEqual(switchesOf(undefined), { check: false, keep: false });
  assert.deepEqual(switchesOf({ name: "x" }), { check: false, keep: false });
  assert.deepEqual(switchesOf({ writing: { keep: true } }), { check: false, keep: false });
  assert.deepEqual(switchesOf({ writing: { check: true, keep: "yes" } }), { check: true, keep: false });
  assert.deepEqual(switchesOf({ writing: { check: true, keep: true } }), { check: true, keep: true });
});

test("kept texts: none older than keepDays, the newest keepPerPupil per pupil", () => {
  const now = Date.parse("2026-11-16T12:00:00Z");
  const at = (d) => new Date(now - d * 86400000).toISOString();
  const list = [
    { user: "a", at: at(WRITING.keepDays + 1) },
    ...Array.from({ length: WRITING.keepPerPupil + 3 }, (_, k) => ({ user: "b", at: at(k) })),
    { user: "c", at: at(1) }, null,
  ];
  const kept = pruneKept(list, now);
  assert.equal(kept.filter((x) => x.user === "a").length, 0);
  assert.equal(kept.filter((x) => x.user === "b").length, WRITING.keepPerPupil);
  assert.equal(kept.filter((x) => x.user === "b").at(-1).at, at(WRITING.keepPerPupil - 1), "the newest are kept");
  assert.equal(kept.filter((x) => x.user === "c").length, 1);
});

test("the checker: a worker that cannot start is unavailable, and says so quickly", async () => {
  const ck = createChecker({ command: "/nonexistent/python-not-here", args: [] });
  await assert.rejects(ck.check("Ég er hér."), (e) => e.code === "unavailable");
  assert.equal(ck.available(), false);
  const off = createChecker({ off: true });
  await assert.rejects(off.check("Ég er hér."), (e) => e.code === "off");
});

test("the checker: a text past the timeout is refused and the worker restarted for the next", async () => {
  const ck = createChecker({ command: process.execPath, args: [FAKE], timeoutMs: 300 });
  const a = await ck.check("Ég fór í skólan.");
  assert.deepEqual(a.annotations[0], { start: 9, end: 15, code: "N4NN-END",
    msg: "Stafsetningarvilla: 'skólan' -> 'skólann'", detail: null, suggest: "skólann" });
  const t0 = Date.now();
  await assert.rejects(ck.check("SOFÐU vel."), (e) => e.code === "timeout");
  assert.ok(Date.now() - t0 < 2000, "the timeout is held");
  const b = await ck.check("Ég fór í skólan.");
  assert.equal(b.annotations.length, 2, "a fresh worker answers the next text");
  await assert.rejects(ck.check("HRUNDU."), (e) => e.code === "failed");
  assert.equal((await ck.check("Hæ.")).annotations.length, 1, "and after a crash");
  ck.stop();
});

test("the checker: more than maxQueue texts at once are turned away, not queued for ever", async () => {
  const ck = createChecker({ command: process.execPath, args: [FAKE], timeoutMs: 400, maxQueue: 2 });
  await ck.check("Hæ.");
  const slow = [ck.check("SOFÐU 1."), ck.check("SOFÐU 2.")];
  await assert.rejects(ck.check("Hæ."), (e) => e.code === "busy");
  await Promise.allSettled(slow);
  ck.stop();
});

/* ---------- the routes ------------------------------------------------------------------------- */

let base, dir, srv, base2, srv2;
const PW = "lykilordid-mitt";

function client(at = () => base) {
  let cookie = null;
  const call = async (method, p, body, raw = null) => {
    const r = await fetch(at() + p, {
      method,
      headers: { ...(body || raw ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: raw ?? (body ? JSON.stringify(body) : undefined),
    });
    const set = r.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const text = await r.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: r.status, data };
  };
  call.login = async (username) => {
    const r = await call("POST", "/auth/login", { username, password: PW });
    assert.equal(r.status, 200, `${username} could not log in`);
    return call;
  };
  return call;
}

async function makeUser(app, username, extra = {}) {
  const { salt, hash } = await hashPassword(PW);
  let user;
  await app.store.updateUsers((users) => {
    user = { id: newId(), username, name: username, role: "learner", status: "active",
      group: "default", salt, hash, created: new Date().toISOString(), lastSeen: "2026-11-16",
      share: { board: false, minutes: false },
      consent: { by: "self", over16: true, at: new Date().toISOString(), how: "admin" }, ...extra };
    users.push(user);
    return users;
  });
  return user;
}

const U = {}, C = {};

async function boot(env) {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), "fallaskoli-wr-"));
  const html = path.join(d, "app.html");
  await fs.writeFile(html, "<!DOCTYPE html><title>x</title>");
  const app = createApp({ dataDir: path.join(d, "data"), htmlFile: html, secureCookies: false,
    env: { FALLASKOLI_CONTROLLER: "Prófari", FALLASKOLI_CONTACT: "p@example.is", ...env } });
  await app.store.init();
  await new Promise((r) => app.server.listen(0, r));
  return { app, d, base: "http://127.0.0.1:" + app.server.address().port };
}

before(async () => {
  const one = await boot({ FALLASKOLI_WRITING_PYTHON: process.execPath, FALLASKOLI_WRITING_WORKER: FAKE,
    FALLASKOLI_WRITING_TIMEOUT_MS: "400" });
  srv = one.app; dir = one.d; base = one.base;
  await srv.store.updateGroups(() => ({ ga: { name: "Bekkur A" }, gb: { name: "Bekkur B" } }));
  U.admin = await makeUser(srv, "stjori", { role: "admin", consent: undefined });
  U.kennA = await makeUser(srv, "kennari-a", { role: "guardian", group: "ga", consent: undefined });
  U.kennB = await makeUser(srv, "kennari-b", { role: "guardian", group: "gb", consent: undefined });
  U.anna = await makeUser(srv, "anna", { group: "ga", name: "Anna" });
  U.bjarni = await makeUser(srv, "bjarni", { group: "ga", name: "Bjarni" });
  U.cecilia = await makeUser(srv, "cecilia", { group: "gb", name: "Cecilía" });
  C.anon = client();
  C.admin = await client().login("stjori");
  C.kennA = await client().login("kennari-a");
  C.kennB = await client().login("kennari-b");
  C.anna = await client().login("anna");
  C.bjarni = await client().login("bjarni");
  C.cecilia = await client().login("cecilia");

  const two = await boot({ FALLASKOLI_WRITING_PYTHON: "/nonexistent/python-not-here" });
  srv2 = two.app; base2 = two.base;
  srv2.dir = two.d;
});

after(async () => {
  await new Promise((r) => srv.server.close(r));
  await new Promise((r) => srv2.server.close(r));
  await fs.rm(dir, { recursive: true, force: true });
  await fs.rm(srv2.dir, { recursive: true, force: true });
});

const TEXT = "Ég fór í skólan í gær. Þar var gaman. Við lékum okkur úti.";

test("server: off by default — nothing is sent to the checker until the teacher switches it on", async () => {
  assert.equal((await C.anon("GET", "/writing")).status, 401);
  assert.equal((await C.anon("POST", "/writing/check", { text: TEXT })).status, 401);
  const st = await C.anna("GET", "/writing");
  assert.equal(st.status, 200);
  assert.equal(st.data.check, false);
  assert.equal(st.data.keep, false);
  assert.equal(st.data.available, false);
  const r = await C.anna("POST", "/writing/check", { text: TEXT });
  assert.equal(r.status, 403);
  assert.equal(r.data.off, true);
  assert.equal(srv.writing.checker.state, "idle", "the worker was never started");
});

test("server: only the group's teacher (or the administrator) switches it, for their own group", async () => {
  const body = { group: "ga", check: true, keep: false };
  assert.equal((await C.anon("POST", "/teacher/writing", body)).status, 401);
  assert.equal((await C.anna("POST", "/teacher/writing", body)).status, 403, "a pupil");
  assert.equal((await C.kennB("POST", "/teacher/writing", body)).status, 403, "another group's teacher");
  assert.equal((await C.kennB("GET", "/teacher/writing?group=ga")).status, 403);
  assert.equal((await C.kennA("POST", "/teacher/writing", { group: "ga", check: "yes" })).status, 400);
  assert.equal((await C.kennA("POST", "/teacher/writing", { group: "ga", check: true, keep: 1 })).status, 400);
  const r = await C.kennA("POST", "/teacher/writing", { group: "ga", check: false, keep: true });
  assert.deepEqual([r.status, r.data.check, r.data.keep], [200, false, false], "keeping without the check is not kept on");
  assert.equal((await C.kennA("POST", "/teacher/writing", body)).status, 200);
  assert.equal((await C.anna("GET", "/writing")).data.check, true);
  assert.equal((await C.cecilia("GET", "/writing")).data.check, false, "group B is untouched");
  const audit = await srv.store.audit();
  assert.ok(audit.some((a) => a.act === "stillti yfirlestur texta" && a.by === U.kennA.id));
});

test("server: one round trip — remarks placed in the text, and nothing stored", async () => {
  const r = await C.anna("POST", "/writing/check", { text: "  " + TEXT.replace(". ", ".\n\n") });
  assert.equal(r.status, 200);
  assert.equal(r.data.kept, false);
  const [a, b] = r.data.annotations;
  assert.equal(TEXT.slice(a.start, a.end), "skólan", "offsets are into the tidied text");
  assert.deepEqual([b.start, b.end], [null, null], "a remark outside the text is kept without a place");
  assert.deepEqual(await srv.store.writing(), [], "nothing is kept with keeping off");
  const files = await fs.readdir(path.join(dir, "data"));
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    const body = await fs.readFile(path.join(dir, "data", f), "utf8");
    assert.ok(!body.includes("lékum okkur"), `the text turned up in ${f}`);
  }
});

test("server: the limits — body, text, empty, rate", async () => {
  assert.equal((await C.anna("POST", "/writing/check", { text: "" })).status, 400);
  assert.equal((await C.anna("POST", "/writing/check", { text: 42 })).status, 400);
  assert.equal((await C.anna("POST", "/writing/check", { text: "a".repeat(WRITING.maxChars + 1) })).status, 413);
  assert.equal((await C.anna("POST", "/writing/check", null, JSON.stringify({ text: "a".repeat(WRITING.maxBody) }))).status, 413);
  /* Bjarni asks for checks until the hour's allowance is spent. */
  let last = null;
  for (let k = 0; k <= WRITING.perHour; k++) last = await C.bjarni("POST", "/writing/check", { text: "Hæ." });
  assert.equal(last.status, 429);
});

test("server: a check past the timeout answers 504 and the next one works", async () => {
  const t0 = Date.now();
  const r = await C.anna("POST", "/writing/check", { text: "SOFÐU í skólan." });
  assert.equal(r.status, 504);
  assert.ok(Date.now() - t0 < 3000);
  assert.equal((await C.anna("POST", "/writing/check", { text: TEXT })).status, 200);
});

test("server: keeping on — the text is kept for the group's teacher only, in the export, gone when keeping goes off", async () => {
  assert.equal((await C.kennA("POST", "/teacher/writing", { group: "ga", check: true, keep: true })).status, 200);
  assert.equal((await C.anna("GET", "/writing")).data.keep, true, "the pupil is told before sending");
  const r = await C.anna("POST", "/writing/check", { text: TEXT });
  assert.equal(r.data.kept, true);
  const kept = await srv.store.writing();
  assert.equal(kept.length, 1);
  assert.deepEqual([kept[0].user, kept[0].group, kept[0].text, kept[0].week, kept[0].topic],
    [U.anna.id, "ga", TEXT, weekKey(new Date()), topicFor(weekKey(new Date()))]);
  const t = await C.kennA("GET", "/teacher/writing?group=ga");
  assert.equal(t.status, 200);
  assert.deepEqual(t.data.texts.map((x) => [x.name, x.text]), [["Anna", TEXT]]);
  assert.equal(t.data.texts[0].user, undefined, "no id handed out");
  /* The week, never the time: the notice says the teacher does not see when
     a pupil practises (review M3). */
  assert.deepEqual(Object.keys(t.data.texts[0]).sort(), ["id", "n", "name", "text", "topic", "week"]);
  assert.doesNotMatch(JSON.stringify(t.data), /\d{4}-\d\d-\d\dT\d\d:/, "no timestamp reaches the teacher");
  assert.deepEqual((await C.admin("GET", "/teacher/writing?group=gb")).data.texts, [], "group B has none");
  const ex = await C.anna("GET", "/account/export");
  const data = typeof ex.data === "string" ? JSON.parse(ex.data) : ex.data;
  assert.deepEqual(data.keptTexts.map((x) => x.text), [TEXT]);
  assert.equal(data.keptTexts[0].user, undefined);
  /* Off: everything of the group goes, at once. */
  assert.equal((await C.kennA("POST", "/teacher/writing", { group: "ga", check: true, keep: false })).status, 200);
  assert.deepEqual(await srv.store.writing(), []);
});

test("server: a kept text goes with the account", async () => {
  await C.kennA("POST", "/teacher/writing", { group: "ga", check: true, keep: true });
  await C.anna("POST", "/writing/check", { text: TEXT });
  assert.equal((await srv.store.writing()).length, 1);
  const gone = await makeUser(srv, "fer", { group: "ga" });
  const cf = await client().login("fer");
  await cf("POST", "/writing/check", { text: TEXT });
  assert.equal((await srv.store.writing()).length, 2);
  await srv.store.eraseUser(gone.id);
  assert.deepEqual((await srv.store.writing()).map((x) => x.user), [U.anna.id]);
  await C.kennA("POST", "/teacher/writing", { group: "ga", check: false });
  assert.deepEqual(await srv.store.writing(), [], "switching the check off deletes too");
  assert.equal((await C.anna("POST", "/writing/check", { text: TEXT })).status, 403);
});

test("server: without a working checker the check is unavailable (503) and the app is told", async () => {
  await srv2.store.updateGroups(() => ({ ga: { name: "A", writing: { check: true } } }));
  await makeUser(srv2, "dora", { group: "ga" });
  const c = await client(() => base2).login("dora");
  const r = await c("POST", "/writing/check", { text: TEXT });
  assert.equal(r.status, 503);
  assert.equal(r.data.unavailable, true);
  assert.equal((await c("GET", "/writing")).data.available, false);
});

/* ---------- the real thing, when it is installed ------------------------------------------------- */

const HAVE_GC = (() => {
  try { execFileSync("python3", ["-I", "-c", "import reynir_correct"], { stdio: "ignore", timeout: 60000 }); return true; }
  catch { return false; }
})();

test("GreynirCorrect itself: one round trip through server/greynir_worker.py", { skip: !HAVE_GC && "reynir-correct is not installed", timeout: 120000 }, async () => {
  const ck = createChecker({ timeoutMs: 30000 });
  const text = "Mér langar að fara í sund. Ég á hund. Hann heitir Snati.";
  const out = await ck.check(text);
  const notes = cleanAnnotations(out.annotations, text);
  assert.equal(out.sentences, 3);
  assert.ok(notes.length >= 1, "the dative subject of langa is noticed");
  assert.equal(text.slice(notes[0].start, notes[0].end), "Mér");
  assert.match(notes[0].msg, /Mig/);
  assert.deepEqual((await ck.check("Ég á hund. Hann heitir Snati.")).annotations, []);
  ck.stop();
});

/* ---------- packaging ------------------------------------------------------------------------- */

test("the image: the default stays the plain one; the `greynir` target carries the worker and its pins", async () => {
  const root = path.dirname(HERE);
  const df = await fs.readFile(path.join(root, "Dockerfile"), "utf8");
  const froms = df.split("\n").filter((l) => /^FROM /.test(l));
  assert.equal(froms.at(-1).trim(), "FROM plain", "the last stage — what is built by default — is the plain image");
  assert.match(froms[0], /node:22-alpine AS plain/);
  const g = df.slice(df.indexOf("AS greynir"));
  assert.match(g, /COPY server\/greynir_worker\.py/);
  /* Installed by hash, wheels only, the build's lock with the writing check's
     (item 80's discipline): GreynirCorrect cannot move the grammar libraries. */
  assert.match(g, /--require-hashes --only-binary=:all:[\s\\]*-r \/tmp\/req\/requirements-build\.txt -r \/tmp\/req\/requirements-writing-build\.txt/);
  const ignore = (await fs.readFile(path.join(root, ".dockerignore"), "utf8")).split("\n").map((l) => l.trim());
  assert.ok(ignore.includes("!server/greynir_worker.py"), "*.py is ignored; the worker is let back in");
  const req = await fs.readFile(path.join(root, "server", "requirements-writing.txt"), "utf8");
  assert.match(req, /^reynir-correct==\d+\.\d+\.\d+$/m, "pinned exactly, like requirements.txt");
});

test("the image: the `greynir` target is pinned like the build container, and its lock is complete", async () => {
  const root = path.dirname(HERE);
  const read = (f) => fs.readFile(path.join(root, f), "utf8");
  const pins = (text) => Object.fromEntries([...text.matchAll(/^([A-Za-z0-9_.-]+)==([^\s\\]+)/gm)]
    .map((m) => [m[1].toLowerCase().replace(/_/g, "-"), m[2]]));
  const df = await read("Dockerfile"), dfb = await read("Dockerfile.build");
  /* The same exact Python and Node images as Dockerfile.build, on x86_64 (the
     platform the locks' hashes are for). */
  for (const arg of ["PYTHON_IMAGE", "NODE_IMAGE"]) {
    const re = new RegExp(`^ARG ${arg}=(\\S+)`, "m");
    assert.equal(re.exec(df)?.[1], re.exec(dfb)?.[1], `${arg}: Dockerfile and Dockerfile.build disagree`);
  }
  assert.ok(df.indexOf("ARG PYTHON_IMAGE") < df.indexOf("\nFROM "), "an ARG used in FROM must come before the first FROM");
  for (const f of df.split("\n").filter((l) => /^FROM .*greynir/.test(l)))
    assert.match(f, /--platform=linux\/amd64/, f);
  /* The human list and the lock agree; every lock entry has a hash; nothing in
     the writing lock overlaps (and so could contradict) the build's lock. */
  const want = pins(await read("server/requirements-writing.txt"));
  const lockText = await read("server/requirements-writing-build.txt");
  const lock = pins(lockText), build = pins(await read("requirements-build.txt"));
  assert.deepEqual(lock, want);
  const entries = lockText.split(/\n(?=[A-Za-z])/).filter((e) => /^[A-Za-z]/.test(e));
  for (const e of entries) assert.match(e, /--hash=sha256:[0-9a-f]{64}/, "no hash: " + e.split("\n")[0]);
  for (const name of Object.keys(lock)) assert.ok(!(name in build), `${name} is in both locks`);
  /* What the check's packages require is in one lock or the other. */
  for (const dep of ["reynir", "typing-extensions", "cffi", "certifi", "icegrams-data"])
    assert.ok(lock[dep] || build[dep], "missing from the locks: " + dep);
  /* The worker's own comment and the server guide name the files that exist. */
  assert.match(await read("server/greynir_worker.py"), /requirements-writing\.txt/);
});

test("the notice: the v6.13 version names both paragraphs (items 45 and 46), and the short version no longer says the teacher never sees what is written", async () => {
  const { PRIVACY_VERSION, privacyPage, privacyConfig } = await import("../server/privacy.mjs");
  assert.ok(PRIVACY_VERSION > "2026-11-11", "free text a child writes, and a second-language flag: newer than v6.12's notice");
  const html = privacyPage(privacyConfig({}));
  assert.ok(html.includes(`Síðast breytt ${PRIVACY_VERSION}`));
  assert.match(html, /<h2>Ritun vikunnar: textinn sem þú skrifar<\/h2>/);
  assert.match(html, /<h2>Íslenska sem annað mál<\/h2>/);
  assert.match(html, new RegExp(`Mest ${WRITING.keepPerPupil} textar`));
  assert.doesNotMatch(html, /aldrei það sem þú skrifar\./, "with keeping on the teacher can read a Ritun vikunnar text");
  const doc = await fs.readFile(path.join(HERE, "..", "docs", "PRIVACY.md"), "utf8");
  assert.match(doc, /## 1e\. Icelandic as a second language/);
  assert.match(doc, /## 1f\. Ritun vikunnar/);
  assert.match(doc, new RegExp("version, `" + PRIVACY_VERSION + "`, which covers everything[^]*the second-language"), "§3 lists the version and what it added");
  assert.doesNotMatch(doc, /has not moved `PRIVACY_VERSION`|has not been moved by this\s+branch/);
});
