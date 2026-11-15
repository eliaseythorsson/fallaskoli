/* Badges that are bounded by the clock rather than by the session.
 *
 * Design rule 4: a test that cannot fail is worse than no test. Every test here
 * was checked against v5.6 first and every one of them fails there —
 * `node --test` on this file with the old badges.js gives 0 passes, because
 * v5.6 has neither `period`, nor `when`, nor `missRun`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BADGES, DAY_END_BADGES, checkBadges, checkDayEnd, periodKey, badgeById,
} from "../src/js/core/badges.js";
import {
  blankState, migrate, newSession, record, settleDays, daySummary, todayKey,
  prevKey, dayRec, noteQuestion, badgeContext,
} from "../src/js/core/state.js";

/* A time context for a given date, in the shape core/calendar.js produces. */
const at = (y, mZero, date, hour = 12, minute = 0) => ({
  year: y, month: mZero, date, hour, minute, second: 0,
  weekday: new Date(y, mZero, date).getDay(), week: 1,
  weekend: false, holiday: null, schoolBreak: true,
});

/* ---------- once per night, once per day --------------------------------- */

test("Náttugla comes once a night, not once a page load", () => {
  /* The owner: *"The night owl badge triggers repeatedly. It should only
     trigger once per night 00:00-07:00."* Three sessions in one night is three
     `awardedThisSession` maps — the cap cannot see across them. The ledger
     can. */
  const owned = {}, periods = {};
  const cat = BADGES.filter((b) => b.id === "s_night");
  const night = { time: at(2026, 7, 19, 2, 30), skillRun: {}, skillCorrect: {}, skillLevel: {} };

  let n = 0;
  for (let session = 0; session < 3; session++)
    n += checkBadges(night, owned, {}, cat, periods).length;
  assert.equal(n, 1, "three sessions in one night must not be three badges");

  /* The next night is a different night. */
  const later = { ...night, time: at(2026, 7, 20, 1, 5) };
  assert.equal(checkBadges(later, owned, {}, cat, periods).length, 1);
});

test("Í fríi en samt comes once a day through a whole summer", () => {
  const owned = {}, periods = {};
  const cat = BADGES.filter((b) => b.id === "s_break");
  let n = 0;
  for (let session = 0; session < 6; session++)
    n += checkBadges({ time: at(2026, 6, 3), skillRun: {}, skillCorrect: {}, skillLevel: {} },
      owned, {}, cat, periods).length;
  assert.equal(n, 1);
  assert.equal(
    checkBadges({ time: at(2026, 6, 4), skillRun: {}, skillCorrect: {}, skillLevel: {} },
      owned, {}, cat, periods).length, 1, "tomorrow is a new day");
});

test("every badge about the clock or the calendar is bounded by one", () => {
  /* The two the owner reported are not special. Any badge whose condition is
     "it is now such and such a time" stays true for as long as that time lasts,
     so every one of them needs the ledger — otherwise the next report is about
     a different badge with the same cause. */
  const clockish = BADGES.filter((b) =>
    b.group === "leyni" && !b.when &&
    /Æfing|Svar klukkan|Svar á|Svar þann|Svar 29/.test(b.ds));
  assert.ok(clockish.length >= 15, `only ${clockish.length} found — the filter drifted`);
  const unbounded = clockish.filter((b) => !b.period);
  assert.deepEqual(unbounded.map((b) => b.id), []);
});

test("a period key names the period, so next Christmas is winnable again", () => {
  const b = badgeById("s_jóladagur");
  assert.ok(b, "the Christmas badge went missing");
  assert.equal(periodKey(b, at(2026, 11, 25)), "day:2026-12-25");
  assert.notEqual(periodKey(b, at(2027, 11, 25)), periodKey(b, at(2026, 11, 25)));
  assert.equal(periodKey(badgeById("run5"), at(2026, 11, 25)), null,
    "a badge with no period must not occupy a ledger slot");
});

/* ---------- badges the day has to be over before anyone can judge -------- */

test("the day-end badges are exactly the three that are about a whole day", () => {
  assert.deepEqual(DAY_END_BADGES.map((b) => b.id).sort(),
    ["s_exactgoal", "s_perfectday"]);   // v6.9: s_42 is retired
});

test("a day-end badge is never tested on an answer", () => {
  /* This is the owner's complaint in one assertion: *"it will trigger every day
     the user achieves OR exceeds his or her daily goal."* The live context here
     satisfies the OLD test for all three (goal reached exactly, everything
     right, 42 answers) and must still win nothing. */
  const ctx = {
    dayAnswers: 42, dayCorrect: 42, goal: 42, run: 1,
    skillRun: {}, skillCorrect: {}, skillLevel: {},
    time: at(2026, 7, 19), collection: { total: 0 },
  };
  const won = checkBadges(ctx, {}, {}, DAY_END_BADGES, {});
  assert.deepEqual(won.map((b) => b.id), []);
});

test("Upp á hár needs the day to have STOPPED on the goal", () => {
  const exact = badgeById("s_exactgoal");
  assert.equal(checkDayEnd({ a: 10, c: 8, goal: 10 }, {}, [exact]).length, 1);
  assert.equal(checkDayEnd({ a: 11, c: 11, goal: 10 }, {}, [exact]).length, 0,
    "one answer past the goal and it is an ordinary day");
  assert.equal(checkDayEnd({ a: 9, c: 9, goal: 10 }, {}, [exact]).length, 0);
  assert.equal(checkDayEnd({ a: 0, c: 0, goal: 0 }, {}, [exact]).length, 0,
    "a day with no answers earns nothing");
});

test("Flekklaus dagur is spotless for the WHOLE day", () => {
  const b = badgeById("s_perfectday");
  assert.equal(checkDayEnd({ a: 25, c: 25, goal: 10 }, {}, [b]).length, 1);
  assert.equal(checkDayEnd({ a: 25, c: 24, goal: 10 }, {}, [b]).length, 0,
    "v5.6 gave this out at the twentieth answer and kept it after the mistake");
  assert.equal(checkDayEnd({ a: 19, c: 19, goal: 10 }, {}, [b]).length, 0);
});

test("settling judges the days that ended and never judges one twice", () => {
  const S = blankState();
  S.goal = 10;
  S.days["2026-08-16"] = { a: 10, c: 10, xp: 1, ms: 0, nw: 0, sk: {}, g: 10 };
  S.days["2026-08-17"] = { a: 30, c: 30, xp: 1, ms: 0, nw: 0, sk: {}, g: 10 };
  S.days["2026-08-18"] = { a: 42, c: 40, xp: 1, ms: 0, nw: 0, sk: {}, g: 10 };
  S.settled = "2026-08-15";

  const won = settleDays(S, "2026-08-19");
  const ids = won.map((w) => w.badge.id + "@" + w.date).sort();
  assert.deepEqual(ids, [
    "s_exactgoal@2026-08-16",    // the day stopped on the goal
    "s_perfectday@2026-08-17",   // 30 answers, none wrong
  ]);
  assert.equal(S.settled, "2026-08-18", "settling stops at yesterday");
  assert.deepEqual(settleDays(S, "2026-08-19"), [], "a settled day stays settled");
});

test("today is never settled — it has not finished", () => {
  const S = blankState();
  S.settled = "2026-08-18";
  S.days["2026-08-19"] = { a: 10, c: 10, xp: 0, ms: 0, nw: 0, sk: {}, g: 10 };
  assert.deepEqual(settleDays(S, "2026-08-19"), []);
  /* And tomorrow it is. */
  assert.deepEqual(settleDays(S, "2026-08-20").map((w) => w.badge.id), ["s_exactgoal"]);
});

test("the goal is judged as it stood on the day, not as it stands now", () => {
  /* The adult raises the daily goal from 10 to 30 on Tuesday. Monday was a
     ten-answer day and met the goal it had; it must keep the badge. */
  const S = blankState();
  S.goal = 30;
  S.days["2026-08-18"] = { a: 10, c: 10, xp: 0, ms: 0, nw: 0, sk: {}, g: 10 };
  S.settled = "2026-08-17";
  assert.equal(daySummary(S, "2026-08-18").goal, 10);
  const won = settleDays(S, "2026-08-19");
  assert.ok(won.some((w) => w.badge.id === "s_exactgoal"));
});

test("record() stamps the goal on the day as it goes", () => {
  const S = blankState();
  S.goal = 17;
  const sess = newSession(S);
  record(S, sess, { skill: "nafnord", ok: true, xp: 1 });
  assert.equal(S.days[todayKey()].g, 17);
});

test("migrating an old state does not empty a stack of badge windows", () => {
  /* Everything before the last active day counts as settled, so a child coming
     back to v5.7 after three months meets at most one day's worth. */
  const raw = {
    xp: 10, lastActive: "2026-08-18",
    days: {
      "2026-06-01": { a: 10, c: 10 }, "2026-07-01": { a: 10, c: 10 },
      "2026-08-18": { a: 10, c: 10 },
    },
    goal: 10,
  };
  const S = migrate(raw);
  assert.equal(S.settled, "2026-08-17");
  const won = settleDays(S, "2026-08-19");
  assert.deepEqual([...new Set(won.map((w) => w.date))], ["2026-08-18"]);
});

test("the period ledger survives the round trip through migrate", () => {
  const S = migrate({ periods: { s_night: "night:2026-08-19" }, days: {}, xp: 0 });
  assert.equal(S.periods.s_night, "night:2026-08-19");
});

test("prevKey walks over month and year boundaries", () => {
  assert.equal(prevKey("2026-08-01"), "2026-07-31");
  assert.equal(prevKey("2026-01-01"), "2025-12-31");
  assert.equal(prevKey("2028-03-01"), "2028-02-29");
});

/* ---------- three wrong IN A ROW ----------------------------------------- */

test("a beygingartafla with three wrong cells is ONE wrong answer", () => {
  /* The owner: *"Aftur á hestbak should trigger after getting three incorrect
     in a row, then a correct. Not three incorrect overall during the same
     session."* In v5.6 the counter was `sess.wrongRun`, bumped inside
     `record()` — and a table writes one record per cell, so this exact
     sequence handed the badge out. */
  const S = blankState();
  const sess = newSession(S);
  ["NFET", "ÞFET", "ÞGFET"].forEach((cell) =>
    record(S, sess, { skill: "nafnord", cell, ok: false, xp: 0 }));
  assert.equal(sess.wrongRun, 3, "the old counter still counts cells — it is used for XP");
  noteQuestion(sess, false);                       // ...but that was ONE question
  assert.equal(sess.missRun, 1);
  assert.equal(noteQuestion(sess, true), false, "one wrong table is not a comeback");
});

test("three wrong questions then a right one IS a comeback", () => {
  const sess = newSession(blankState());
  assert.equal(noteQuestion(sess, false), false);
  assert.equal(noteQuestion(sess, false), false);
  assert.equal(noteQuestion(sess, false), false);
  assert.equal(noteQuestion(sess, true), true);
  assert.equal(sess.missRun, 0, "the run resets behind the badge");
});

test("a right answer in the middle breaks the run", () => {
  const sess = newSession(blankState());
  noteQuestion(sess, false);
  noteQuestion(sess, false);
  noteQuestion(sess, true);                        // breaks it
  noteQuestion(sess, false);
  assert.equal(noteQuestion(sess, true), false,
    "two, then one, then one is not three in a row");
});

test("the meaning question neither breaks a run of misses nor lengthens it", () => {
  const sess = newSession(blankState());
  noteQuestion(sess, false);
  noteQuestion(sess, false);
  noteQuestion(sess, null);                        // "útskýrðu orðið" — no wrong answer
  noteQuestion(sess, false);
  assert.equal(noteQuestion(sess, true), true);
});

test("Upp úr öldudalnum needs five wrong IN A ROW too", () => {
  const S = blankState();
  const sess = newSession(S);
  for (let i = 0; i < 5; i++) noteQuestion(sess, false);
  assert.equal(badgeContext(S, sess).wasStruggling, true);

  const spread = newSession(blankState());
  for (let i = 0; i < 5; i++) { noteQuestion(spread, false); noteQuestion(spread, true); }
  assert.equal(badgeContext(blankState(), spread).wasStruggling, false,
    "five wrong scattered through a session is not five in a row");
});
