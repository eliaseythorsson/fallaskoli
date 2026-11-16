/* v6.13, item 45 — the second-language mode.
 *
 * What these hold: the one switch (core/profile.js) and who may throw it; that
 * Villuveiðar keeps the generated hunts with either source of the switch; the
 * gentler level ramp (core/difficulty.js) and where it settles; the gloss on a
 * content word and only on one (ui/secondlang.js); that reading aloud uses an
 * Icelandic voice ON the device and no other; and on the server that only the
 * group's teacher sets it, for a pupil of their own group (real HTTP). The
 * browser checks — the gloss opens, the button is hidden without a voice —
 * are in tools/browser-test.mjs. */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, newSession, migrate } from "../src/js/core/state.js";
import { secondLanguage, secondLanguageSource } from "../src/js/core/profile.js";
import { secondLanguage as huntL2, huntSource, BANK_FROM_BAND } from "../src/js/tasks/malbeiting.js";
import { makeView } from "../src/js/tasks/index.js";
import { nextLevel, bumpDiff, riseStep, STEP, STEP_L2, MIN, MAX } from "../src/js/core/difficulty.js";
import { glossToken, glossPayload, icelandicVoice, CONTENT_CLASSES, teacherL2CardHTML }
  from "../src/js/ui/secondlang.js";
import { createDefinitions, bundledSource } from "../src/js/core/definitions.js";
import { createApp } from "../server/server.mjs";
import { hashPassword, newId } from "../server/auth.mjs";

const lex = buildLexicon(DATA);

const withSettings = (settings) => {
  const S = blankState();
  Object.assign(S.settings, settings);
  return S;
};

/* ---------- the switch -------------------------------------------------------- */

test("the mode is off by default and on from either the pupil or the teacher", () => {
  assert.equal(secondLanguage(blankState()), false);
  assert.equal(secondLanguageSource(blankState()), null);
  assert.equal(secondLanguageSource(withSettings({ secondLanguage: true })), "pupil");
  assert.equal(secondLanguageSource(withSettings({ l2Teacher: true })), "teacher");
  /* The teacher's wins the label: the pupil cannot switch it off. */
  assert.equal(secondLanguageSource(withSettings({ secondLanguage: false, l2Teacher: true })), "teacher");
  /* Only a real `true` counts: a string from an edited file does not. */
  assert.equal(secondLanguage(withSettings({ secondLanguage: "true", l2Teacher: 1 })), false);
  assert.equal(secondLanguage(null), false);
  assert.equal(secondLanguage({}), false);
});

test("the switch survives a save and a load", () => {
  const S = migrate(JSON.parse(JSON.stringify(withSettings({ secondLanguage: true }))));
  assert.equal(secondLanguage(S), true);
});

test("Villuveiðar keeps the generated hunt at every þyngd with either switch (the hook of item 26)", () => {
  for (const settings of [{ secondLanguage: true }, { l2Teacher: true }]) {
    const S = withSettings(settings);
    const v = makeView({ S, sess: newSession(S), today: "2026-11-16" });
    assert.equal(huntL2(v), true);
    for (let band = 1; band <= 7; band++) assert.equal(huntSource(v, band), "generated", `þyngd ${band}`);
  }
  const S = blankState();
  const v = makeView({ S, sess: newSession(S), today: "2026-11-16" });
  assert.equal(huntSource(v, BANK_FROM_BAND), "bank", "a native pupil still gets the bank");
});

/* ---------- the ramp ------------------------------------------------------------ */

test("the second-language ramp rises a quarter step; a wrong answer still costs a half", () => {
  assert.equal(STEP_L2, STEP / 2);
  assert.equal(riseStep(blankState()), STEP);
  assert.equal(riseStep(withSettings({ l2Teacher: true })), STEP_L2);
  let at = { live: 3, r: 1, h: "1111" };
  assert.equal(nextLevel({ ...at }, true).live, 3.5);
  assert.equal(nextLevel({ ...at, rise: STEP_L2 }, true).live, 3.25);
  assert.equal(nextLevel({ ...at, rise: STEP_L2 }, false).live, 2.5, "down is the full half step");
  /* The warm-up give-back is not a rise and is the same for everybody. */
  assert.equal(nextLevel({ live: 2.5, r: 0, h: "", warm: 3, rise: STEP_L2 }, true).live, 3);
});

test("twenty right answers in a row: 1 → 6 for a native pupil, 1 → 3.5 in the second-language mode", () => {
  const climb = (S) => {
    const sess = newSession(S);
    sess.diff.nafnord = 1; delete (sess.warm || {}).nafnord;
    let t = 1;
    for (let k = 0; k < 20; k++) bumpDiff(sess, S, "nafnord", true, ++t);
    return sess.diff.nafnord;
  };
  assert.equal(climb(blankState()), 6);
  assert.equal(climb(withSettings({ secondLanguage: true })), 3.5);
});

test("where it settles: a simulated pupil sits lower and answers more right in the second-language mode", () => {
  /* A pupil whose chance of a right answer falls with the level, the same
     pupil twice. Seeded, so the figures are the same every run. */
  const run = (S) => {
    let s = 7;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const sess = newSession(S);
    sess.diff.nafnord = 1; delete (sess.warm || {}).nafnord;
    let sum = 0, right = 0, t = 1;
    const N = 4000;
    for (let k = 0; k < N; k++) {
      const lvl = sess.diff.nafnord;
      const ok = rnd() < Math.max(0.05, Math.min(0.98, 1.15 - 0.12 * lvl));
      if (k >= 1000) { sum += lvl; right += ok ? 1 : 0; }
      bumpDiff(sess, S, "nafnord", ok, ++t);
    }
    return { level: sum / (N - 1000), acc: right / (N - 1000) };
  };
  const native = run(blankState());
  const l2 = run(withSettings({ secondLanguage: true }));
  assert.ok(l2.level < native.level, `level ${l2.level} vs ${native.level}`);
  assert.ok(l2.acc > native.acc, `accuracy ${l2.acc} vs ${native.acc}`);
  assert.ok(l2.acc >= 0.78 && l2.acc <= 0.9, `the second-language pupil settles at ${l2.acc}`);
});

/* ---------- the gloss -------------------------------------------------------------- */

const app = { lex, defs: createDefinitions([bundledSource(lex)]) };
const sentenceWith = (pred) => lex.sentences.find((s) => s.tok.some(pred));
const parse = (html) => {
  const m = /data-dfn="([^"]*)"/.exec(html);
  return m ? JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")) : null;
};

test("every content word gets a tap target with its dictionary form and definition", () => {
  const g = glossToken(app);
  let seen = 0;
  for (const s of lex.sentences.slice(0, 200)) for (const tok of s.tok) {
    const html = g(tok);
    if (!CONTENT_CLASSES.has(tok.c) || !tok.l) { assert.equal(html, null, `${tok.w} (${tok.c}) should be plain`); continue; }
    assert.match(html, /^<span class="dfn l2w" tabindex="0" role="button"/);
    assert.ok(html.endsWith(`>${tok.w.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</span>`), "the word as written stays the text");
    const p = parse(html);
    assert.ok(p && p.nm, `no entry name for ${tok.w}`);
    seen += 1;
  }
  assert.ok(seen > 300, `only ${seen} content words in 200 sentences`);
});

test("a gloss is the dictionary's own definition, under the dictionary form, never anything invented", () => {
  const s = sentenceWith((t) => t.c === "nafnorð" && t.w !== t.l && (lex.entryForToken(t) || {}).d);
  const tok = s.tok.find((t) => t.c === "nafnorð" && t.w !== t.l && (lex.entryForToken(t) || {}).d);
  const p = parse(glossToken(app)(tok));
  const e = lex.entryForToken(tok);
  assert.equal(p.nm, e.o, "the window is headed by the dictionary form, not the inflected one");
  assert.ok(p.def && e.d.startsWith(p.def.slice(0, 20)), `${p.def} is not the entry's ${e.d}`);
  /* No English, because there is no source of English. */
  assert.equal(Object.keys(p).some((k) => /^(en|english|translation)$/i.test(k)), false);
});

test("a word the dictionary does not have still opens, with no definition rather than a guess", () => {
  const p = glossPayload(app, null, "blablaorð");
  assert.equal(p.nm, "blablaorð");
  assert.equal(p.def, null);
  const tok = { w: "Blablaði", l: "blablaorð", c: "sagnorð", m: null };
  const html = glossToken({ lex: { entryForToken: () => null }, defs: null })(tok);
  assert.equal(parse(html).def, null);
});

test("prepositions, pronouns, conjunctions and punctuation are left as they are", () => {
  const g = glossToken(app);
  for (const c of ["forsetning", "fornafn", "samtenging", "nafnháttarmerki", "töluorð", null])
    assert.equal(g({ w: "x", l: "x", c }), null, String(c));
  assert.equal(g({ w: "hestur", l: null, c: "nafnorð" }), null, "a token the guard withdrew has no lemma");
});

/* ---------- reading aloud ---------------------------------------------------------- */

const synth = (voices) => ({ getVoices: () => voices });

test("no Icelandic voice, no reading: the button is never drawn", () => {
  assert.equal(icelandicVoice(synth([])), null);
  assert.equal(icelandicVoice(synth([{ lang: "en-US", localService: true }])), null);
  assert.equal(icelandicVoice(undefined), null, "a browser without speech synthesis");
  assert.equal(icelandicVoice({ getVoices() { throw new Error("x"); } }), null);
});

test("only a voice that runs on the device: a network voice would send the sentence away", () => {
  assert.equal(icelandicVoice(synth([{ lang: "is-IS", name: "Netrödd", localService: false }])), null);
  assert.equal(icelandicVoice(synth([{ lang: "is-IS", name: "Óvíst" }])), null, "unknown is not local");
  const local = { lang: "is-IS", name: "Guðrún", localService: true };
  assert.equal(icelandicVoice(synth([{ lang: "is-IS", localService: false }, local])), local);
  const bare = { lang: "is", name: "Dóra", localService: true };
  assert.equal(icelandicVoice(synth([bare])), bare, "a bare `is` tag is Icelandic too");
  assert.equal(icelandicVoice(synth([bare, local])), local, "is-IS first");
  assert.equal(icelandicVoice(synth([{ lang: "isl", localService: true }])), null, "not a prefix match on letters");
});

/* ---------- the teacher's card ------------------------------------------------------- */

test("the teacher's card lists the pupils with their switch, and escapes their names", () => {
  const html = teacherL2CardHTML({ pupils: [{ id: "a1", name: "Anna <b>", on: true }, { id: "b2", name: "Bói", on: false }] });
  assert.match(html, /data-l2pupil="a1" checked> Anna &lt;b&gt;/);
  assert.match(html, /data-l2pupil="b2"> Bói/);
  assert.match(teacherL2CardHTML({ pupils: [] }), /Enginn nemandi/);
});

/* ---------- the server ---------------------------------------------------------------- */

let base, dir, srv;
const PW = "lykilordid-mitt";

function client() {
  let cookie = null;
  const call = async (method, p, body) => {
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
  await srv.store.updateUsers((users) => {
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

before(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "fallaskoli-l2-"));
  const html = path.join(dir, "app.html");
  await fs.writeFile(html, "<!DOCTYPE html><title>x</title>");
  srv = createApp({ dataDir: path.join(dir, "data"), htmlFile: html, secureCookies: false,
    env: { FALLASKOLI_CONTROLLER: "Prófari", FALLASKOLI_CONTACT: "p@example.is" } });
  await srv.store.init();
  await new Promise((r) => srv.server.listen(0, r));
  base = "http://127.0.0.1:" + srv.server.address().port;
  await srv.store.updateGroups(() => ({ ga: { name: "Bekkur A" }, gb: { name: "Bekkur B" } }));
  U.admin = await makeUser("stjori", { role: "admin", consent: undefined });
  U.kennA = await makeUser("kennari-a", { role: "guardian", group: "ga", consent: undefined });
  U.kennB = await makeUser("kennari-b", { role: "guardian", group: "gb", consent: undefined });
  U.anna = await makeUser("anna", { group: "ga", name: "Anna" });
  U.bjarni = await makeUser("bjarni", { group: "ga", name: "Bjarni" });
  U.cecilia = await makeUser("cecilia", { group: "gb", name: "Cecilía" });
  C.anon = client();
  C.admin = await client().login("stjori");
  C.kennA = await client().login("kennari-a");
  C.kennB = await client().login("kennari-b");
  C.anna = await client().login("anna");
});

after(async () => {
  await new Promise((r) => srv.server.close(r));
  await fs.rm(dir, { recursive: true, force: true });
});

test("server: off for everybody until a teacher turns it on", async () => {
  const me = await C.anna("GET", "/auth/me");
  assert.equal(me.data.profile.secondLanguage, false);
  const list = await C.kennA("GET", "/teacher/secondlanguage?group=ga");
  assert.equal(list.status, 200);
  assert.deepEqual(list.data.pupils.map((p) => [p.name, p.on]), [["Anna", false], ["Bjarni", false]],
    "only the group's own learners, sorted, no teacher in the list");
});

test("server: only the group's teacher or the administrator may set it, and only for their own pupil", async () => {
  const body = { group: "ga", user: U.anna.id, on: true };
  assert.equal((await C.anon("POST", "/teacher/secondlanguage", body)).status, 401);
  assert.equal((await C.anna("POST", "/teacher/secondlanguage", body)).status, 403, "a pupil");
  assert.equal((await C.kennB("POST", "/teacher/secondlanguage", body)).status, 403, "another group's teacher");
  assert.equal((await C.kennB("GET", "/teacher/secondlanguage?group=ga")).status, 403);
  /* Group B's teacher, asking about their own group, cannot reach a pupil of A by id. */
  assert.equal((await C.kennB("POST", "/teacher/secondlanguage", { group: "gb", user: U.anna.id, on: true })).status, 404);
  assert.equal((await C.kennA("POST", "/teacher/secondlanguage", { group: "ga", user: U.kennA.id, on: true })).status, 404,
    "not a learner");
  assert.equal((await C.kennA("POST", "/teacher/secondlanguage", { group: "ga", user: U.anna.id, on: "yes" })).status, 400);

  const r = await C.kennA("POST", "/teacher/secondlanguage", body);
  assert.equal(r.status, 200);
  assert.equal((await C.anna("GET", "/auth/me")).data.profile.secondLanguage, true, "the pupil's app hears it");
  assert.equal((await C.admin("POST", "/teacher/secondlanguage", { group: "gb", user: U.cecilia.id, on: true })).status, 200);
  const users = await srv.store.users();
  assert.equal(users.find((u) => u.id === U.bjarni.id).l2, undefined, "nobody else changed");
  assert.equal(users.find((u) => u.id === U.cecilia.id).l2, true);

  assert.equal((await C.kennA("POST", "/teacher/secondlanguage", { ...body, on: false })).status, 200);
  assert.equal((await C.anna("GET", "/auth/me")).data.profile.secondLanguage, false);
  assert.equal((await srv.store.users()).find((u) => u.id === U.anna.id).l2, undefined, "off leaves nothing behind");
});

test("server: the teacher's flag is in the pupil's own export", async () => {
  await C.kennA("POST", "/teacher/secondlanguage", { group: "ga", user: U.anna.id, on: true });
  const r = await C.anna("GET", "/account/export");
  assert.equal(r.status, 200);
  const data = typeof r.data === "string" ? JSON.parse(r.data) : r.data;
  assert.equal(data.account.secondLanguageByTeacher, true);
  await C.kennA("POST", "/teacher/secondlanguage", { group: "ga", user: U.anna.id, on: false });
});
