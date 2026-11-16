/* The week streak (critique item 57): the main streak counts WEEKS in which the
   weekly goal was met, so weekends, holidays and a cold break nothing.

   Every date here is fixed and lies in term (14 October 2026 is a Wednesday),
   because a week wholly in a school break is passed over by design and the
   summer would hide what these tests are about. */

import { test } from "node:test";
import assert from "node:assert/strict";

import { blankState, migrate, dkey, weekStreak, weekAnswerStreak, weekLoginStreak,
  weekProgress, weekGoalOf, cleanWeekGoal, dayRec, badgeContext, newSession,
  WEEK_GOAL_DEFAULT } from "../src/js/core/state.js";
import { BADGES, ACTIVE_BADGES, WEEK_RUNGS, isRetired, legacyStreakCredit,
  checkBadges } from "../src/js/core/badges.js";
import { mondayOf, weekKeys, isBreakWeek, weeksWord, weeksInARow } from "../src/js/core/calendar.js";
import { mergeStates as merge3 } from "../src/js/core/merge.js";

const WED = new Date(2026, 9, 14);                    // Wednesday, week of 12 Oct
const monday = (weeksAgo) => { const m = mondayOf(WED); m.setDate(m.getDate() - 7 * weeksAgo); return m; };

/** `n` days of the week `weeksAgo` weeks back, counting from its Monday, at the goal. */
function week(S, weeksAgo, n, { a = 12, skip = [] } = {}) {
  const m = monday(weeksAgo);
  let put = 0;
  for (let i = 0; i < 7 && put < n; i++) {
    if (skip.includes(i)) continue;
    const d = new Date(m); d.setDate(m.getDate() + i);
    S.days[dkey(d)] = { a, c: a, xp: 0, ms: 0, nw: 0, sk: {}, g: 10, lg: 1, wg: null };
    put++;
  }
}
const fresh = () => { const S = blankState(); S.goal = 10; return S; };

test("the default weekly goal is four days of seven, and it is kept to 2-7", () => {
  assert.equal(WEEK_GOAL_DEFAULT, 4);
  assert.equal(weekGoalOf(blankState()), 4);
  assert.equal(cleanWeekGoal(1), 2);
  assert.equal(cleanWeekGoal(9), 7);
  assert.equal(cleanWeekGoal("5"), 5);
  assert.equal(cleanWeekGoal("abc"), 4);
  assert.equal(cleanWeekGoal(undefined), 4);
  assert.equal(migrate({ weekGoal: 12 }).weekGoal, 7);
  assert.equal(migrate({}).weekGoal, 4);
});

test("weeks run Monday to Sunday", () => {
  assert.equal(dkey(mondayOf(WED)), "2026-10-12");
  assert.equal(dkey(mondayOf(new Date(2026, 9, 18))), "2026-10-12");   // Sunday
  assert.equal(dkey(mondayOf(new Date(2026, 9, 19))), "2026-10-19");
  assert.deepEqual(weekKeys(monday(0)).slice(0, 2), ["2026-10-12", "2026-10-13"]);
  assert.equal(weekKeys(monday(0)).length, 7);
});

test("four days in each of four weeks is a streak of four, days off and all", () => {
  const S = fresh();
  /* Different days off every week: weekends, and a Wednesday and a Friday. */
  week(S, 0, 4, { skip: [] });
  week(S, 1, 4, { skip: [2] });
  week(S, 2, 4, { skip: [0, 4] });
  week(S, 3, 4, { skip: [1, 3] });
  assert.equal(weekStreak(S, WED), 4);
});

test("a week one day short breaks the streak, and only back to that week", () => {
  const S = fresh();
  week(S, 0, 4);
  week(S, 1, 4);
  week(S, 2, 3);                                      // one short
  week(S, 3, 4);
  week(S, 4, 4);
  assert.equal(weekStreak(S, WED), 2);
});

test("a week with no days at all breaks it", () => {
  const S = fresh();
  week(S, 0, 4); week(S, 1, 4); week(S, 3, 4);        // nothing in week 2
  assert.equal(weekStreak(S, WED), 2);
});

test("this week is not held against the streak before it is over", () => {
  const S = fresh();
  week(S, 0, 1);                                      // only Monday so far
  week(S, 1, 4); week(S, 2, 5); week(S, 3, 4);
  assert.equal(weekStreak(S, WED), 3, "the unmet current week is skipped, not a miss");
  week(S, 0, 4);                                      // now it is met
  assert.equal(weekStreak(S, WED), 4);
});

test("a week that has not begun counts for nothing and breaks nothing", () => {
  const S = fresh();
  week(S, 1, 4); week(S, 2, 4);
  assert.equal(weekStreak(S, WED), 2);
  assert.equal(weekStreak(S, new Date(2026, 9, 12)), 2, "Monday morning, nothing yet");
});

test("days below the daily goal do not count towards the week", () => {
  const S = fresh();
  week(S, 0, 4, { a: 9 });                            // goal is 10
  assert.equal(weekStreak(S, WED), 0);
  assert.equal(weekAnswerStreak(S, WED), 1, "...but they were days with answers");
  assert.equal(weekLoginStreak(S, WED), 1);
});

test("the three week counters stay three", () => {
  const S = fresh();
  for (let w = 0; w < 5; w++) week(S, w, 4, { a: 0 });          // opened only
  assert.equal(weekLoginStreak(S, WED), 5);
  assert.equal(weekAnswerStreak(S, WED), 0);
  assert.equal(weekStreak(S, WED), 0);
});

test("a lower weekly goal in the settings is met sooner", () => {
  const S = fresh();
  week(S, 0, 2); week(S, 1, 2); week(S, 2, 2);
  assert.equal(weekStreak(S, WED), 0);
  S.weekGoal = 2;
  assert.equal(weekStreak(S, WED), 3);
});

test("raising the goal does not undo a week already won", () => {
  const S = fresh();
  week(S, 0, 4); week(S, 1, 4);
  /* The goal in force was stamped on those days when they were played. */
  Object.values(S.days).forEach((d) => { d.wg = 4; });
  S.weekGoal = 6;
  assert.equal(weekStreak(S, WED), 2);
  assert.deepEqual(weekProgress(S, WED), { done: 4, goal: 4, met: true },
    "the week in progress keeps the goal it was played under");
});

test("dayRec stamps the weekly goal on today", () => {
  const S = fresh();
  S.weekGoal = 5;
  const d = dayRec(S);
  assert.equal(d.wg, 5);
});

test("a week wholly in the Christmas break is passed over, not missed", () => {
  const S = fresh();
  /* Weeks of 7 and 14 December and of 4 January met; 21 and 28 December are
     holiday weeks with nothing played. */
  const m = (y, mo, d) => new Date(y, mo, d);
  const put = (mon, n) => {
    for (let i = 0; i < n; i++) {
      const d = new Date(mon); d.setDate(mon.getDate() + i);
      S.days[dkey(d)] = { a: 12, c: 12, xp: 0, ms: 0, nw: 0, sk: {}, g: 10, lg: 1, wg: null };
    }
  };
  put(m(2026, 11, 7), 4); put(m(2026, 11, 14), 4); put(m(2027, 0, 4), 4);
  assert.ok(isBreakWeek(m(2026, 11, 28)) && isBreakWeek(m(2026, 11, 21)));
  assert.ok(!isBreakWeek(m(2026, 11, 14)));
  assert.equal(weekStreak(S, m(2027, 0, 6)), 3);
  /* A term week with nothing in it is a miss all the same. */
  const S2 = fresh();
  [m(2026, 10, 2), m(2026, 10, 16)].forEach((mon) => {
    for (let i = 0; i < 4; i++) {
      const d = new Date(mon); d.setDate(mon.getDate() + i);
      S2.days[dkey(d)] = { a: 12, c: 12, xp: 0, ms: 0, nw: 0, sk: {}, g: 10, lg: 1, wg: null };
    }
  });
  assert.equal(weekStreak(S2, m(2026, 10, 18)), 1, "9 November week is empty and in term");
});

test("an empty state, and a state with only old days, terminate", () => {
  assert.equal(weekStreak(blankState(), WED), 0);
  const S = fresh();
  week(S, 40, 4);
  assert.equal(weekStreak(S, WED), 0);
});

test("the labels: 1 vika, 2 vikur, 21 vika, 11 vikur", () => {
  assert.equal(weeksWord(1), "vika");
  assert.equal(weeksWord(2), "vikur");
  assert.equal(weeksWord(11), "vikur");
  assert.equal(weeksWord(21), "vika");
  assert.equal(weeksWord(0), "vikur");
  assert.equal(weeksInARow(1), "1 vika í röð");
  assert.equal(weeksInARow(3), "3 vikur í röð");
});

/* ---------------------------------------------------------------- badges */

test("the week ladders: rungs 2, 4, 8, 12, 20, 30 in three families", () => {
  assert.deepEqual(WEEK_RUNGS, [2, 4, 8, 12, 20, 30]);
  for (const id of ["wk", "wkans", "wklogin"])
    assert.deepEqual(
      ACTIVE_BADGES.filter((b) => b.id.replace(/\d+$/, "") === id).map((b) => b.n), WEEK_RUNGS);
});

test("the day ladders are retired, and every other day badge is not", () => {
  for (const id of ["day3", "day7", "day100", "login7", "login30", "ansday7", "ansday30"])
    assert.ok(isRetired(id), id);
  assert.ok(BADGES.find((b) => b.id === "day7"), "retired badges stay in the catalogue");
  for (const id of ["d25", "d100", "multi_streak_3", "wk4"])
    assert.ok(!isRetired(id), id);
  assert.ok(!ACTIVE_BADGES.some((b) => /^(day|login|ansday)\d+$/.test(b.id)));
});

test("a streak of weeks wins the week badges on an answer", () => {
  const S = fresh();
  for (let w = 0; w < 4; w++) week(S, w, 4);
  const won = checkBadges(badgeContext(S, newSession(S), {}, WED), S.badges, {}, ACTIVE_BADGES, {})
    .map((b) => b.id);
  assert.ok(won.includes("wk2") && won.includes("wk4"), won.join(" "));
  assert.ok(!won.includes("wk8"), won.join(" "));
});

test("no week badge is won by seven calendar days in a row if the weeks are short", () => {
  const S = fresh();
  week(S, 0, 3); week(S, 1, 3);                       // three days a week
  const won = checkBadges(badgeContext(S, newSession(S), {}, WED), S.badges, {}, ACTIVE_BADGES, {})
    .map((b) => b.id);
  assert.ok(!won.some((x) => /^wk\d/.test(x)), won.join(" "));
});

/* ------------------------------------------------------------ migration */

const rec = (date) => ({ n: 1, dates: [date], first: date, last: date });

test("migration keeps every badge a pupil earned, retired or not", () => {
  const raw = { badges: { day30: rec("2026-03-01"), login7: rec("2026-02-01"),
    ansday100: rec("2026-04-01"), run10: rec("2026-01-01"), tot50: rec("2026-01-02") } };
  const S = migrate(raw);
  for (const id of Object.keys(raw.badges)) assert.ok(S.badges[id], id);
  assert.deepEqual(S.badges.day30, raw.badges.day30);
});

test("migration credits the week rungs the old streaks stand for", () => {
  const S = migrate({ badges: { day30: rec("2026-03-01"), login7: rec("2026-02-01"),
    ansday100: rec("2026-04-01") } });
  /* 30 days = 4 weeks of seven: rungs 2 and 4, not 8. */
  assert.ok(S.badges.wk2 && S.badges.wk4 && !S.badges.wk8);
  /* 7 days is one week: no rung is under it. */
  assert.ok(!S.badges.wklogin2);
  /* 100 days = 14 weeks: 2, 4, 8, 12. */
  assert.ok(S.badges.wkans12 && !S.badges.wkans20);
  assert.equal(S.badges.wk4.first, "2026-03-01", "dated as the badge it stands for");
});

test("migrating twice changes nothing, and never overwrites a week badge already won", () => {
  const raw = { badges: { day30: rec("2026-03-01"), wk2: rec("2026-09-09") } };
  const once = migrate(raw);
  assert.equal(once.badges.wk2.first, "2026-09-09");
  assert.deepEqual(migrate(JSON.parse(JSON.stringify(once))).badges, once.badges);
  assert.deepEqual(legacyStreakCredit({}), {});
  assert.deepEqual(legacyStreakCredit(null), {});
});

test("days saved before the weekly goal existed migrate with no stamp", () => {
  const S = migrate({ days: { "2026-10-12": { a: 11, c: 9 } } });
  assert.equal(S.days["2026-10-12"].wg, null);
  assert.equal(weekGoalOf(S), 4);
});

/* ---------------------------------------------------------------- merge */

test("two devices keep the lower weekly goal stamp on a day and the changed setting", () => {
  const day = (wg) => ({ a: 5, c: 5, xp: 0, ms: 0, nw: 0, sk: {}, g: 10, lg: 1, wg });
  const base = { ...blankState(), weekGoal: 4 };
  const L = { ...blankState(), weekGoal: 4, days: { "2026-10-12": day(5) } };
  const R = { ...blankState(), weekGoal: 6, days: { "2026-10-12": day(3) } };
  const M = merge3(base, L, R);
  assert.equal(M.days["2026-10-12"].wg, 3);
  assert.equal(M.weekGoal, 6, "the device that changed the setting wins");
});
