/* The three streak ladders the owner asked for.
 *
 *   *"Create a badge for logging in at least once a day for a whole week,
 *   month. Finishing at least one question once a day for a whole week, month.
 *   Achieving daily goals for at least one week, month."*
 *
 * Three promises, three counters, three families — and the test that matters is
 * that they stay three: a day that meets the goal also has an answer on it and
 * was also a day the program was opened, so a bug that conflated any two of
 * them would look right in every ordinary case.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { blankState, dkey, dayStreak, answerStreak, loginStreak, noteLogin,
         badgeContext, newSession, migrate } from "../src/js/core/state.js";
import { BADGES, checkLogin, checkBadges, LOGIN_BADGES } from "../src/js/core/badges.js";

const day = (S, key, { a = 0, lg = 0 } = {}) => {
  S.days[key] = { a, c: a, xp: 0, ms: 0, nw: 0, sk: {}, g: S.goal, lg };
};

/** `n` days back from `from`, oldest first. */
function backwards(from, n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(from);
    d.setDate(d.getDate() - i);
    out.push(dkey(d));
  }
  return out;
}

/* A fixed day, so the test is not a clock.
 *
 * It was already fixed here in v5.8 and the days were built backwards from it —
 * but `badgeContext` then read the REAL date, so the three badge tests below
 * were asking whether a streak that ended on 19 August was running today. They
 * were green on 19 August and red on the 20th, with nothing having changed in
 * the program: design rule 7, broken by the test itself. `badgeContext` takes
 * `now` for this reason; see the note on it in core/state.js. The date is
 * arbitrary — any date works now, which is the whole point of fixing one. */
const TODAY = new Date(2026, 7, 19);

/* ================= the counters ========================================= */

test("opening the program counts even when nothing is answered", () => {
  const S = blankState();
  backwards(TODAY, 7).forEach((k) => day(S, k, { a: 0, lg: 1 }));
  assert.equal(loginStreak(S, TODAY), 7);
  assert.equal(answerStreak(S, TODAY), 0);
  assert.equal(dayStreak(S, TODAY), 0);
});

test("one answer a day is a different streak from meeting the goal", () => {
  const S = blankState();
  S.goal = 10;
  backwards(TODAY, 9).forEach((k) => day(S, k, { a: 1, lg: 1 }));
  assert.equal(answerStreak(S, TODAY), 9);
  assert.equal(dayStreak(S, TODAY), 0);
  /* Answering implies having opened it. */
  assert.equal(loginStreak(S, TODAY), 9);
});

test("meeting the goal satisfies all three", () => {
  const S = blankState();
  S.goal = 10;
  backwards(TODAY, 30).forEach((k) => day(S, k, { a: 12, lg: 1 }));
  assert.equal(dayStreak(S, TODAY), 30);
  assert.equal(answerStreak(S, TODAY), 30);
  assert.equal(loginStreak(S, TODAY), 30);
});

test("a gap breaks the streak", () => {
  const S = blankState();
  const keys = backwards(TODAY, 10);
  keys.forEach((k) => day(S, k, { a: 1, lg: 1 }));
  delete S.days[keys[4]];
  assert.equal(answerStreak(S, TODAY), 5);
});

test("today is not held against a streak before the day has begun", () => {
  /* The child opened it yesterday and the day before, and has not yet today.
     The streak is 2, not 0 — a run is not broken at breakfast. */
  const S = blankState();
  const keys = backwards(TODAY, 3);
  day(S, keys[0], { lg: 1 });
  day(S, keys[1], { lg: 1 });
  assert.equal(loginStreak(S, TODAY), 2);
});

test("progress recorded before v5.8 still counts as days logged in", () => {
  /* `lg` did not exist; every day in an old state has answers and no `lg`. The
     migration must not lose those days — a child with a 40-day habit should not
     be told their streak is one. */
  const old = { days: {} };
  backwards(TODAY, 12).forEach((k) => { old.days[k] = { a: 5, c: 4 }; });
  const S = migrate(old);
  assert.equal(loginStreak(S, TODAY), 12);
  assert.equal(answerStreak(S, TODAY), 12);
});

test("noteLogin marks today and says whether it was the first visit", () => {
  const S = blankState();
  const key = dkey(TODAY);
  const first = noteLogin(S, key);
  assert.equal(first.first, true);
  assert.equal(S.days[key].lg, 1);
  assert.equal(noteLogin(S, key).first, false);
});

/* ================= the badges =========================================== */

test("the login badges exist and are only tested at start-up", () => {
  const ids = LOGIN_BADGES.map((b) => b.id);
  assert.ok(ids.includes("login7"), ids.join(" "));
  assert.ok(ids.includes("login30"), ids.join(" "));
  /* Not on an answer. If they were, `checkBadges` would hand them out again on
     every question of the day. */
  const S = blankState();
  backwards(TODAY, 40).forEach((k) => day(S, k, { a: 20, lg: 1 }));
  const ctx = badgeContext(S, newSession(S), {}, TODAY);
  const onAnswer = checkBadges(ctx, S.badges, {}, BADGES, {});
  assert.deepEqual(onAnswer.filter((b) => b.when === "login"), []);
});

test("a week of visits wins the week badge, at start-up", () => {
  const S = blankState();
  backwards(TODAY, 7).forEach((k) => day(S, k, { a: 0, lg: 1 }));
  const won = checkLogin(badgeContext(S, newSession(S), {}, TODAY), S.badges, {}, BADGES, {});
  const ids = won.map((b) => b.id);
  assert.ok(ids.includes("login7"), ids.join(" "));
  assert.ok(!ids.includes("login30"), ids.join(" "));
  /* Nothing about answering: nothing was answered. */
  assert.ok(!ids.some((x) => x.startsWith("ansday")), ids.join(" "));
});

test("a month of answers wins the answer badges, on an answer", () => {
  const S = blankState();
  backwards(TODAY, 30).forEach((k) => day(S, k, { a: 1, lg: 1 }));
  const won = checkBadges(badgeContext(S, newSession(S), {}, TODAY), S.badges, {}, BADGES, {});
  const ids = won.map((b) => b.id);
  assert.ok(ids.includes("ansday30"), ids.join(" "));
  assert.ok(ids.includes("ansday7"), ids.join(" "));
  /* The goal was never met, so the goal ladder stays locked. */
  assert.ok(!ids.some((x) => /^day\d+$/.test(x)), ids.join(" "));
});

test("a streak badge is not handed out twice", () => {
  const S = blankState();
  backwards(TODAY, 10).forEach((k) => day(S, k, { a: 0, lg: 1 }));
  const awards = {};
  const first = checkLogin(badgeContext(S, newSession(S), {}, TODAY), S.badges, awards, BADGES, {});
  first.forEach((b) => { S.badges[b.id] = { n: 1, dates: ["x"], first: "x", last: "x" }; });
  const second = checkLogin(badgeContext(S, newSession(S), {}, TODAY), S.badges, {}, BADGES, {});
  assert.deepEqual(second.map((b) => b.id), []);
});

test("crossing several steps in one load wins all of them", () => {
  /* The reason these use `>=` and not `===`: a state upgraded from before `lg`
     existed arrives with a long streak already in it, and equality would give
     the child nothing at all. */
  const S = blankState();
  backwards(TODAY, 20).forEach((k) => day(S, k, { a: 0, lg: 1 }));
  const ids = checkLogin(badgeContext(S, newSession(S), {}, TODAY), S.badges, {}, BADGES, {})
    .map((b) => b.id).sort();
  assert.deepEqual(ids, ["login7"]);   // v6.9: 3 and 14 are retired
});
