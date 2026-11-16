/* Item 58: "Framfarir", the leaderboard metric practice cannot farm.
 *
 * Patterns mended plus reviews passed this week (core/mending.js
 * `weekGains`). The property the item asks for, held three ways:
 *
 *   - a pupil who answers hundreds of questions right, through the real
 *     build → judge → settle path, gains nothing on it (while the week's XP
 *     climbs);
 *   - a pupil who misses on purpose to fill the review queue gains at most
 *     REVIEWS_PER_DAY a day from passing it;
 *   - a pattern mended twice in a week counts once.
 *
 * And the server: it is the board's default and leaves the state as one
 * number. */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, newSession, todayKey } from "../src/js/core/state.js";
import { SKILL_IDS } from "../src/js/core/skills.js";
import { judge, settle } from "../src/js/core/answer.js";
import { PATTERNS, noteDiagnosis } from "../src/js/core/diagnosis.js";
import { noteReview, addDays } from "../src/js/core/review.js";
import { weekGains, framfarir, noteMending, noteReviewsPassed, MEND_POINTS, MEND_RUN,
         REVIEWS_PER_DAY } from "../src/js/core/mending.js";
import { scorecard, rank, METRICS, DEFAULT_METRIC } from "../src/js/core/leaderboard.js";
import { weekKey, weekXp } from "../src/js/core/social.js";
import { createApp } from "../server/server.mjs";
import { hashPassword, newId } from "../server/auth.mjs";
import { ask, rightResponse } from "./helpers.js";

const lex = buildLexicon(DATA);
const MON = "2026-11-16";                       // a Monday
const P = PATTERNS.filter((p) => !p.meta)[0].id;

/* ---------- the figure ---------------------------------------------------- */

test("Framfarir: mendings in the week, three each, plus reviews capped per day", () => {
  const S = blankState();
  S.mend.log = [
    { p: "a", d: addDays(MON, -1) },              // Sunday: last week
    { p: "a", d: MON }, { p: "b", d: addDays(MON, 2) },
    { p: "a", d: addDays(MON, 4) },               // "a" again: still one pattern
    { p: "c", d: addDays(MON, 7) },               // next Monday
  ];
  S.mend.rv = { [addDays(MON, -1)]: 5, [MON]: 2, [addDays(MON, 1)]: 40, [addDays(MON, 6)]: 6 };
  const g = weekGains(S, MON);
  assert.deepEqual(g, { points: MEND_POINTS * 2 + 2 + REVIEWS_PER_DAY + 6,
    mended: 2, reviews: 48, capped: 2 + REVIEWS_PER_DAY + 6 });
  assert.equal(framfarir(S, MON), g.points);
  assert.equal(framfarir(blankState(), MON), 0);
  assert.equal(framfarir(S, "not a day"), 0);
});

test("hundreds of right answers through the real path raise the week's XP, not Framfarir", () => {
  const S = blankState();
  SKILL_IDS.forEach((id) => { S.enabled[id] = true; });
  const sess = newSession(S);
  const ctx = { lex, S, sess, forcedNoun: null };
  const today = todayKey();
  let answered = 0;
  for (let i = 0; i < 400 && answered < 300; i++) {
    const t = ask(ctx);
    if (!t) continue;
    let resp;
    try { resp = rightResponse(t); } catch { continue; }
    const j = judge(t, resp, { S, sess });
    if (j.pending) continue;
    const out = settle(S, sess, t, j, { ms: 3000 });
    /* As app.finish does: the diagnosis, then the mending. */
    const ids = noteDiagnosis(S, t, (out && out.findings) || [], j.ok, today);
    noteMending(S, ids, today);
    answered++;
  }
  assert.ok(answered >= 200, `only ${answered} answers`);
  const monday = weekKey(new Date());
  assert.ok(weekXp(S, monday) > 500, `the week's XP should have climbed (${weekXp(S, monday)})`);
  assert.equal(framfarir(S, monday), 0, "volume alone must not move Framfarir");
  assert.equal(scorecard(S, lex).framfarir, 0);
});

test("missing on purpose to fill the queue pays at most the daily cap", () => {
  const S = blankState();
  const J = (ok) => ({ ok, findings: ok ? [] : [{ p: P }], effects: [] });
  const cloze = (i) => ({ type: "fill", typeId: "fill", skill: "nafnord", cell: "ÞGFFT", word: `orð${i}|kk` });
  /* Sunday: a hundred deliberate misses. */
  for (let i = 0; i < 100; i++) noteReview(S, cloze(i), J(false), addDays(MON, -1));
  /* Monday: all hundred are due, and all passed — counted as settle counts. */
  let passed = 0;
  for (let i = 0; i < 100; i++) {
    const out = noteReview(S, cloze(i), J(true), MON);
    passed += out.passed.length + out.done.length;
  }
  assert.equal(passed, 100, "the fixture: every entry was due and passed");
  noteReviewsPassed(S, passed, MON);
  const g = weekGains(S, MON);
  assert.equal(g.reviews, 100);
  assert.equal(g.points, REVIEWS_PER_DAY, "a hundred reviews in a day count as the cap");
  /* The same answers the same day again: not due any more, nothing passes. */
  for (let i = 0; i < 100; i++) assert.deepEqual(noteReview(S, cloze(i), J(true), MON).passed, []);
});

test("a pattern broken and mended again in the same week counts once", () => {
  const S = blankState();
  S.diag[P] = { n: 5, w: 3, h: "00011", last: null, ex: [] };
  const hit = (ok, day) => {
    const r = S.diag[P];
    r.n++; if (!ok) r.w++;
    r.h = (r.h + (ok ? "1" : "0")).slice(-16);
    return noteMending(S, [P], day);
  };
  hit(false, MON);
  for (let i = 0; i < MEND_RUN; i++) hit(true, addDays(MON, 1));
  for (let i = 0; i < 6; i++) hit(false, addDays(MON, 1));
  for (let i = 0; i < MEND_RUN; i++) hit(true, addDays(MON, 2));
  assert.equal(S.mend.done[P], 2, "mended twice");
  assert.equal(weekGains(S, MON).mended, 1);
  assert.equal(framfarir(S, MON), MEND_POINTS);
});

/* ---------- the board ---------------------------------------------------------- */

test("Framfarir is the first metric and the default of rank()", () => {
  assert.equal(METRICS[0].id, "framfarir");
  assert.equal(DEFAULT_METRIC, "framfarir");
  const r = rank([{ profile: "a", framfarir: 2, week: 900 }, { profile: "b", framfarir: 7, week: 10 }]);
  assert.equal(r[0].profile, "b");
  assert.equal(r[0].metric, "framfarir");
  assert.equal(rank([{ profile: "a" }], "nonsense")[0].metric, "framfarir");
});

let base, dir, app;
before(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "fallaskoli-framfarir-"));
  app = createApp({ dataDir: dir, secureCookies: false, env: {} });
  await app.store.init();
  await new Promise((r) => app.server.listen(0, r));
  base = "http://127.0.0.1:" + app.server.address().port;
});
after(async () => {
  await new Promise((r) => app.server.close(r));
  await fs.rm(dir, { recursive: true, force: true });
});

async function makeUser(username) {
  const { salt, hash } = await hashPassword("lykilordid-mitt");
  let user;
  await app.store.updateUsers((users) => {
    user = { id: newId(), username, name: username, role: "learner", status: "active", salt, hash,
      share: { board: true, minutes: false },
      consent: { by: "self", over16: true, at: new Date().toISOString(), how: "admin" } };
    users.push(user);
    return users;
  });
  return user;
}

test("the server's class board opens on Framfarir, and volume does not lead it", async () => {
  const week = weekKey(new Date());
  const grinder = await makeUser("grind");
  const mender = await makeUser("lagar");
  /* The grinder: a great deal of XP this week, nothing mended or reviewed. */
  await app.store.putState(grinder.id, { ...blankState(), xp: 3000,
    days: { [week]: { a: 300, c: 290, xp: 3000 } } });
  /* The mender: little XP, two patterns mended and a day of reviews. */
  await app.store.putState(mender.id, { ...blankState(), xp: 60,
    days: { [week]: { a: 10, c: 8, xp: 60 } },
    mend: { open: {}, done: { [P]: 1, x_b: 1 }, log: [{ p: P, d: week }, { p: "x_b", d: week }],
      rv: { [week]: 40 } } });
  const r = await fetch(base + "/auth/login", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "grind", password: "lykilordid-mitt" }) });
  const cookie = r.headers.get("set-cookie").split(";")[0];
  const board = await (await fetch(base + "/leaderboard", { headers: { Cookie: cookie } })).json();
  assert.equal(board[0].metric, "framfarir");
  assert.deepEqual(board.map((x) => x.name), ["lagar", "grind"]);
  assert.equal(board[0].value, MEND_POINTS * 2 + REVIEWS_PER_DAY);
  assert.equal(board[1].value, 0);
  /* One number: no pattern ids, no days. */
  const text = JSON.stringify(board);
  assert.ok(!text.includes(P) && !/"\d{4}-\d{2}-\d{2}"/.test(text), "the mend record left the state");
  /* The week's XP is still a metric of its own. */
  const byWeek = await (await fetch(base + "/leaderboard?metric=week", { headers: { Cookie: cookie } })).json();
  assert.deepEqual(byWeek.map((x) => x.name), ["grind", "lagar"]);
});
