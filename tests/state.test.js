import { test } from "node:test";
import assert from "node:assert/strict";
import {
  blankState, migrate, newSession, record, dayStreak, easeFor, wordKey, todayKey,
  STATE_VERSION,
} from "../src/js/core/state.js";
import { bumpDiff, diffOf, bandOf, initDiff } from "../src/js/core/difficulty.js";
import { SKILL_IDS } from "../src/js/core/skills.js";
import { overallLevel } from "../src/js/core/progress.js";

/* State as v4 left it behind. */
const V4 = {
  xp: 3200, goal: 12, bestRun: 41, totalAnswers: 500, totalCorrect: 420,
  perfectTables: 9, perfectParses: 14, meanings: 6,
  days: { "2026-08-01": { a: 20, c: 18, xp: 210 } },
  cells: { NFET: { c: 10, w: 2 } },
  words: { hestur: { c: 5, w: 1 } },
  badges: { run10: { n: 3, dates: [] } },
  unlocked: { setningafraedi: true, sagnord: true, ordflokkar: true },
};

test("v4 state migrates without being lost", () => {
  const S = migrate(V4);
  assert.equal(S.v, STATE_VERSION);
  assert.equal(S.xp, 3200);
  assert.equal(S.goal, 12);
  assert.equal(S.totalCorrect, 420);
  assert.equal(S.counters.perfectTables, 9);
  assert.equal(S.counters.meanings, 6);
  assert.deepEqual(S.badges.run10, { n: 3, dates: [] });
  /* `sk` (skills that got a correct answer that day) arrived in v5.3 and is
     empty retrospectively — the multi-skill badges cannot have been won for days
     the count did not exist for, and should not be. */
  /* `g` (the daily goal as it stood that day) arrived in v5.7 and is `null`
     retrospectively — the number was never written down, so `daySummary` falls
     back to the current goal rather than inventing a past one.
     `lg` (the program was opened that day) arrived in v5.8 and is 0 here: the
     flag was not recorded, but the ANSWERS were, and `loginStreak` treats a day
     with answers on it as a day the program was opened. Nothing is lost. */
  assert.deepEqual(S.days["2026-08-01"],
    { a: 20, c: 18, xp: 210, ms: 0, nw: 0, sk: {}, g: null, lg: 0, wg: null });
});

test("the old three switches become skills", () => {
  const S = migrate(V4);
  assert.equal(S.enabled.setningafraedi, true);
  assert.equal(S.enabled.sagnord, true);
  assert.equal(S.enabled.nafnord, true);
  const off = migrate({ ...V4, unlocked: { setningafraedi: false, sagnord: true } });
  assert.equal(off.enabled.setningafraedi, false);
});

test("bestLevel is never lower than the current level", () => {
  const S = migrate(V4);
  assert.equal(S.bestLevel, overallLevel(3200).level);
});

test("rusl í geymslunni skilar hreinu ástandi", () => {
  for (const junk of [null, undefined, "", 42, []]) {
    const S = migrate(junk);
    assert.equal(S.xp, 0);
    assert.equal(Object.keys(S.skills).length, SKILL_IDS.length);
  }
});

test("record skrifar í alla teljara í einu", () => {
  const S = blankState(), sess = newSession(S);
  record(S, sess, { skill: "sagnord", cell: "GM-FH-NT-1P-ET", word: "lesa|so", ok: true, xp: 14 });
  assert.equal(S.xp, 14);
  assert.equal(S.skills.sagnord.xp, 14);
  assert.equal(S.skills.sagnord.c, 1);
  assert.equal(S.cells["GM-FH-NT-1P-ET"].c, 1);
  assert.equal(S.words["lesa|so"].c, 1);
  assert.equal(S.days[todayKey()].a, 1);
  assert.equal(S.run, 1);
  assert.equal(S.lastActive, todayKey());
});

test("a word meaning counts XP but not right/wrong", () => {
  const S = blankState(), sess = newSession(S);
  record(S, sess, { skill: "ordaford", ok: true, xp: 8, counts: false });
  assert.equal(S.xp, 8);
  assert.equal(S.totalAnswers, 0, "must not count towards accuracy");
  assert.equal(S.skills.ordaford.xp, 8);
});

test("homographs are counted separately", () => {
  const S = blankState(), sess = newSession(S);
  record(S, sess, { skill: "nafnord", word: wordKey("ljós", "hk"), ok: true, xp: 5 });
  record(S, sess, { skill: "lysingarord", word: wordKey("ljós", "lo"), ok: false, xp: 0 });
  /* `h` is the short history of outcomes (v6.6, core/wordhealth.js). */
  assert.deepEqual(S.words["ljós|hk"], { c: 1, w: 0, h: "1" });
  assert.deepEqual(S.words["ljós|lo"], { c: 0, w: 1, h: "0" });
});

test("each skill's difficulty moves independently of the others", () => {
  const S = blankState(), sess = newSession(S);
  const before = diffOf(sess, "sagnord");
  for (let i = 0; i < 6; i++) bumpDiff(sess, S, "nafnord", true);
  assert.ok(diffOf(sess, "nafnord") > before);
  assert.equal(diffOf(sess, "sagnord"), before, "verbs should not move");
});

test("difficulty stays within 1-7 and falls more slowly than it rises", () => {
  const S = blankState(), sess = newSession(S);
  for (let i = 0; i < 50; i++) bumpDiff(sess, S, "nafnord", true);
  /* The ceiling went from 5 to 7 with the year 9-10 material (core/difficulty.js). */
  assert.equal(diffOf(sess, "nafnord"), 7);
  for (let i = 0; i < 50; i++) bumpDiff(sess, S, "nafnord", false);
  assert.equal(diffOf(sess, "nafnord"), 1);
  assert.ok(bandOf(sess, "nafnord") >= 1 && bandOf(sess, "nafnord") <= 7);
});

test("a pupil from before saved levels is placed once from the skill's XP", () => {
  const raw = blankState();
  delete raw.difficulty;
  raw.skills.nafnord.xp = 5000;
  const S = migrate(raw);
  const d = initDiff(S);
  assert.ok(d.nafnord > d.sagnord, "sterkur flokkur byrjar ofar");
});

test("a day streak counts only days on which the goal was met", () => {
  const S = blankState();
  S.goal = 10;
  const day = (n) => {
    const d = new Date(); d.setDate(d.getDate() - n);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
  };
  S.days[day(0)] = { a: 12, c: 10, xp: 100 };
  S.days[day(1)] = { a: 10, c: 9, xp: 90 };
  S.days[day(2)] = { a: 3, c: 3, xp: 20 };
  assert.equal(dayStreak(S), 2);
});

test("easeFor blends cell, word and skill", () => {
  const S = blankState();
  S.cells.NFET = { c: 20, w: 0 };
  S.words["hestur|kk"] = { c: 20, w: 0 };
  S.skills.nafnord = { xp: 100, c: 40, w: 0 };
  const easy = easeFor(S, { cell: "NFET", word: "hestur|kk", skill: "nafnord" });
  const unknown = easeFor(S, { cell: "EFFTgr", word: "þúfa|kvk", skill: "toluord" });
  assert.ok(easy > 0.85, `easy=${easy}`);
  assert.equal(unknown, 0.5);
});

test("v6.10: a table is one answer — cells recorded with tally:false, tallied once", async () => {
  const { blankState, newSession, record, tallyAnswer } = await import("../src/js/core/state.js");
  const S = blankState(); const sess = newSession(S);
  for (let k = 0; k < 10; k++) record(S, sess, { skill: "fornofn", cell: "NFET" + k, word: "hann|pfn", ok: k < 3, xp: 5, tally: false });
  tallyAnswer(S, sess, { skill: "fornofn", ok: false });
  assert.equal(S.totalAnswers, 1);
  assert.equal(S.run, 0);
  assert.equal(sess.answers, 1);
  assert.equal(S.skills.fornofn.c, 3, "the cells still count for the skill");
});
