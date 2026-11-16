import { test } from "node:test";
import assert from "node:assert/strict";
import { BADGES, checkBadges } from "../src/js/core/badges.js";
import { SKILLS, SKILL_IDS } from "../src/js/core/skills.js";
import { blankState, newSession, record, badgeContext } from "../src/js/core/state.js";

test("there are many badges and every id is unique", () => {
  assert.ok(BADGES.length >= 100, `only ${BADGES.length} badges`);
  const ids = BADGES.map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate id");
  for (const b of BADGES) {
    assert.ok(b.nm && b.ds, `${b.id} vantar texta`);
    assert.equal(typeof b.test, "function");
  }
});

test("every skill has badges of its own", () => {
  for (const id of SKILL_IDS) {
    const mine = BADGES.filter((b) => b.skill === id);
    assert.ok(mine.length >= 5, `${id} has only ${mine.length} badges`);
  }
});

test("a badge that could fire on every answer has a per-session cap", () => {
  const risky = ["tbl_clean", "parse_clean", "hard5", "comeback"];
  for (const id of risky) {
    const b = BADGES.find((x) => x.id === id);
    assert.ok(b.cap && b.cap <= 3, `${id} has no cap`);
  }
});

test("the cap stops repetition inside a session", () => {
  const owned = {}, sessAwards = {};
  const ctx = { hardWin: true, run: 1, skillRun: {}, skillCorrect: {}, skillLevel: {} };
  const cat = BADGES.filter((b) => b.id === "hard5");
  let total = 0;
  for (let i = 0; i < 10; i++) total += checkBadges(ctx, owned, sessAwards, cat).length;
  assert.equal(total, 2, "the difficulty-5 badge should come at most twice");
});

test("a new session resets the cap", () => {
  const owned = {};
  const ctx = { hardWin: true, run: 1, skillRun: {}, skillCorrect: {}, skillLevel: {} };
  const cat = BADGES.filter((b) => b.id === "hard5");
  const a = {}, b = {};
  for (let i = 0; i < 5; i++) checkBadges(ctx, owned, a, cat);
  assert.equal(checkBadges(ctx, owned, b, cat).length, 1);
});

test("a once-only badge does not come back", () => {
  const owned = {}, awards = {};
  const cat = BADGES.filter((b) => b.id === "cnt_nafnord_100");
  const ctx = { skill: "nafnord", skillCorrect: { nafnord: 120 }, skillRun: {}, skillLevel: {}, run: 1 };
  assert.equal(checkBadges(ctx, owned, awards, cat).length, 1);
  owned.cnt_nafnord_100 = { n: 1 };
  assert.equal(checkBadges(ctx, owned, {}, cat).length, 0);
});

test("a skill's badge does not fire when another skill answers", () => {
  /* The bug that turned up in use: skillRun.nafnord stood at 10 and the badge
     "Nafnorð: 10 í röð" fired again whenever a verb was conjugated
     correctly. */
  const owned = {}, awards = {};
  const cat = BADGES.filter((b) => b.id === "run_nafnord_10");
  const base = { skillRun: { nafnord: 10 }, skillCorrect: {}, skillLevel: {}, run: 11 };

  const onNoun = checkBadges({ ...base, skill: "nafnord" }, owned, awards, cat);
  assert.equal(onNoun.length, 1, "should fire when a noun is answered");

  const onVerb = checkBadges({ ...base, skill: "sagnord" }, owned, {}, cat);
  assert.equal(onVerb.length, 0, "must not fire when a verb is answered");
});

test("every skill-bound badge ignores the other skills", () => {
  const owned = {}, awards = {};
  const ctx = {
    skill: "sagnord", run: 5,
    skillRun: { nafnord: 5, lysingarord: 5, sagnord: 5 },
    skillCorrect: { nafnord: 500, sagnord: 1 },
    skillLevel: { nafnord: 9, sagnord: 1 },
    collection: { total: 0, rare: 0, mastered: 0, byClass: {}, coverage: {}, fl: 0 },
    time: { hour: 12, weekend: false, holiday: null, schoolBreak: false },
  };
  const won = checkBadges(ctx, owned, awards);
  const strays = won.filter((b) => b.skill && b.skill !== "sagnord");
  assert.deepEqual(strays.map((b) => b.id), [], "badges from other skills slipped through");
});

test("a real session: no badge flood", () => {
  const S = blankState();
  const sess = newSession(S);
  const owned = S.badges;
  let awarded = 0;
  for (let i = 0; i < 60; i++) {
    record(S, sess, { skill: "nafnord", cell: "NFET", word: "hestur|kk", ok: true, xp: 10 });
    const ctx = badgeContext(S, sess, { hardWin: true, perfectTable: true });
    const won = checkBadges(ctx, owned, sess.badgeAwards);
    won.forEach((b) => { owned[b.id] = { n: (owned[b.id]?.n || 0) + 1 }; });
    awarded += won.length;
  }
  assert.ok(awarded > 0, "something should be won");
  assert.ok(awarded < 30, `${awarded} badges in 60 answers is too many`);
});

test("a run within a skill is independent of the overall run", () => {
  const S = blankState();
  const sess = newSession(S);
  for (let i = 0; i < 5; i++)
    record(S, sess, { skill: "nafnord", ok: true, xp: 5 });
  assert.equal(sess.skillRun.nafnord, 5);
  assert.equal(sess.skillRun.sagnord, 0);
  record(S, sess, { skill: "sagnord", ok: false, xp: 0 });
  assert.equal(sess.skillRun.nafnord, 5, "a mistake on verbs must not reset the noun run");
  assert.equal(S.run, 0, "the overall run does reset");
});

/* v6.9: 373 badges made each one worth little. */
test("the catalogue that can still be won is about half what it was", async () => {
  const { ACTIVE_BADGES, RETIRED_IDS, isRetired } = await import("../src/js/core/badges.js");
  /* v6.13, item 56: the badges that pay for getting better (group
     "framfarir": mending, reviews on time, two mastery marks per skill) are
     counted on their own. The rule of v6.9 still holds for everything else,
     which item 56 made smaller, not larger, to make room. */
  const volume = ACTIVE_BADGES.filter((b) => b.group !== "framfarir");
  const better = ACTIVE_BADGES.filter((b) => b.group === "framfarir");
  assert.ok(volume.length <= 210, `${volume.length} active badges outside Framfarir`);
  assert.ok(volume.length >= 150, `${volume.length} active badges outside Framfarir`);
  assert.ok(better.length <= 2 * SKILLS.length + 10, `${better.length} Framfarir badges`);
  const ids = new Set(BADGES.map((b) => b.id));
  for (const id of RETIRED_IDS) assert.ok(ids.has(id), `retired id ${id} does not exist`);
  for (const b of BADGES) assert.equal(!!b.retired, isRetired(b.id), b.id);
});

test("a retired badge is never awarded, even when its condition holds", () => {
  const cat = BADGES.filter((b) => b.id === "s_firstword" || b.id === "first_nafnord");
  assert.equal(cat.length, 2);
  const ctx = { skill: "nafnord", skillCorrect: { nafnord: 1 }, skillRun: {}, skillLevel: {},
    collection: { total: 1 }, run: 1 };
  assert.deepEqual(checkBadges(ctx, {}, {}, cat), []);
});

test("a retired badge someone already owns does not block Öll merkin", async () => {
  const { ACTIVE_BADGES } = await import("../src/js/core/badges.js");
  const owned = {};
  ACTIVE_BADGES.forEach((b) => { if (b.id !== "all_badges" && b.id !== "all_badges_words" && !b.social) owned[b.id] = { n: 1 }; });
  owned.s_firstword = { n: 1 };          // retired, owned, irrelevant
  const won = checkBadges({ skillRun: {}, skillCorrect: {}, skillLevel: {}, collection: {} },
    owned, {}, ACTIVE_BADGES);
  assert.ok(won.some((b) => b.id === "all_badges"), won.map((b) => b.id).join(" "));
});
