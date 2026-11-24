/* Levels, XP and decay. Pure arithmetic — no side effects, testable. */

import { SKILL_IDS, skillById } from "./skills.js";
import { num, obj, keys, add, pot, counters, thisDevice, n, isObj, pairs } from "./slicerules.js";

/* ---------- 1. Level curves ---------------------------------------------
   The first levels come quickly, so a new child levels up several times in
   the first weeks; after that each level is a longer event.

   What the curve is measured against (critique item 60, tools/sim/levels.mjs,
   v6.13, with everything the app pays: retries, the day multiplier, a perfect
   table's bonus). A "session" is ten questions, which is what Lota dagsins is:

     one session earns about  60 XP (weak, 50% right)
                              77 XP (typical, 72% right)
                              95 XP (strong, 90% right)

   v6.1 to v6.12 promised "level 5 after about 16 days at 150-250 XP a day".
   That holds for a child doing TWO sessions every day (180-280 XP a day, level
   5 on day 7-10 of the old curve's 14-20), which is not the child this is made
   for. One session a day on four days a week took level 5 after 10 weeks
   (typical), 13 (weak) and 8 (strong): most of a school term at the same
   level. The curve was cut to 70/150 of what it was. Now, for one session on
   each of four days a week (median of 8 simulated pupils, calendar weeks):

     level 2  after the first session
     level 3  after ~3 sessions             (the first week)
     level 4  after ~9 sessions             (2-3 weeks)
     level 5  after ~18 sessions            (typical 4.6 weeks, strong 3.7,
                                             weak 6.1)
     level 10 after ~110 sessions           (7 months)
     level 20 after ~530 sessions           (2.5 years: grades 8-10 and beyond)

   Earlier curves: 250*(L-1)^2.5 until v6.1, then 150*(L-1)^2.2. Every
   threshold is LOWER than the one it replaced (tests/progress.test.js pins
   both), so no stored progress can lose a level by the change: a child's level
   can only rise when they open the new version. Skill levels are gentler, so
   a strength can be seen early.            */

export const overallNeed = (L) => Math.round(70 * Math.pow(L - 1, 2.2));
/* Cut in the same proportion as the overall curve (90 -> 42, as 150 -> 70), so a
   skill level is still reached sooner than the same overall level and still
   never costs more than before. */
export const skillNeed = (L) => Math.round(42 * Math.pow(L - 1, 2.1));

/* One title per level up to 20. The first thirteen are unchanged since v5;
   "Þjóðskáld" stays the last word. Titles are what other users see beside a
   name (core/social.js), so every one of them has to be worth wearing. */
export const OVERALL_RANKS = [
  "Byrjandi", "Nemi", "Lærlingur", "Sveinn", "Fallkönnuður",
  "Beygingamaður", "Orðflokkakappi", "Setningasmiður", "Málrýnir",
  "Fallmeistari", "Beygingameistari", "Málmeistari", "Stórmeistari",
  "Orðsnillingur", "Málvitringur", "Sagnaþulur", "Rúnameistari",
  "Hirðskáld", "Höfuðskáld", "Þjóðskáld",
];

/* Level bands: the frame a name wears on the leaderboard. Cosmetic only, and
   read from the best level ever reached, so a break never takes it away. */
export const LEVEL_BANDS = [
  { from: 1,  id: "b1", nm: "Leir" },
  { from: 3,  id: "b2", nm: "Brons" },
  { from: 6,  id: "b3", nm: "Silfur" },
  { from: 10, id: "b4", nm: "Gull" },
  { from: 15, id: "b5", nm: "Hrafntinna" },
  { from: 20, id: "b6", nm: "Norðurljós" },
];
export const levelBand = (L) =>
  [...LEVEL_BANDS].reverse().find((b) => (L || 1) >= b.from) || LEVEL_BANDS[0];

export const SKILL_RANKS = [
  "Nýgræðingur", "Kunnugur", "Vanur", "Öruggur", "Sterkur",
  "Snjall", "Meistari", "Stórmeistari",
];

export const overallRank = (L) => OVERALL_RANKS[Math.min(L - 1, OVERALL_RANKS.length - 1)];
export const skillRank = (L) => SKILL_RANKS[Math.min(L - 1, SKILL_RANKS.length - 1)];

/** xp -> {level, into, need, floor}. `need` is the span of the current level. */
export function levelFromXp(xp, needFn) {
  const x = Math.max(0, xp || 0);
  let L = 1;
  while (needFn(L + 1) <= x) L++;
  const floor = needFn(L);
  const next = needFn(L + 1);
  return { level: L, into: x - floor, need: Math.max(1, next - floor), floor, next };
}

export const overallLevel = (xp) => levelFromXp(xp, overallNeed);
export const skillLevel = (xp) => levelFromXp(xp, skillNeed);

/* ---------- 2. Margfaldarar --------------------------------------------- */

export const runMult = (run) => 1 + Math.min(Math.floor((run || 0) / 3) * 0.1, 1.0);
export const dayMult = (streak) => 1 + Math.min(streak || 0, 10) * 0.05;

/* ---------- 3. How easy is this for this user? --------------------------
   A Laplace-smoothed share of correct answers, weighted by how often it has
   been attempted. 0.5 means "no idea", 1.0 means "they know this".      */

export function mastery(stats) {
  if (!stats) return { p: 0.5, conf: 0 };
  const c = stats.c || 0, w = stats.w || 0, n = c + w;
  const p = (c + 1) / (n + 2);
  return { p, conf: n / (n + 6) };
}

/** Blend several stat buckets (cell, word, skill) into one estimate. */
export function easeOf(buckets) {
  let num = 0, den = 0;
  for (const b of buckets) {
    const { p, conf } = mastery(b);
    num += p * conf;
    den += conf;
  }
  if (den === 0) return 0.5;
  const p = num / den;
  const conf = Math.min(1, den);
  return 0.5 + conf * (p - 0.5);
}

/** Less XP for what is already easy for this learner, more for what is not. */
export const easeMult = (ease) => 1.25 - 0.7 * Math.min(1, Math.max(0, ease));

/**
 * One place where an answer's XP is decided.
 * base   — worth of the exercise type
 * lvl    — sentence/table difficulty 1..7
 * ease   — 0..1 from easeOf()
 */
export function computeXp({ base, lvl = 1, hinted = false, ease = 0.5, run = 0, streak = 0 }) {
  const raw = base
    * (1 + 0.06 * (lvl - 1))
    * easeMult(ease)
    * (hinted ? 0.5 : 1)
    * runMult(run)
    * dayMult(streak);
  return Math.max(1, Math.round(raw));
}

/* ---------- 4. Hnignun ---------------------------------------------------
   Mjög hæg og með gólfi: aldrei meira en eitt stig tapast og aldrei niður
   fyrir stig 2 þegar því hefur verið náð. Þetta er hvatning, ekki refsing. */

export const DECAY = { graceDays: 2, ratePerDay: 0.004, maxDays: 20 };

export function daysBetween(aKey, bKey) {
  if (!aKey || !bKey) return 0;
  const a = new Date(aKey + "T00:00:00Z"), b = new Date(bKey + "T00:00:00Z");
  return Math.round((b - a) / 86400000);
}

/** How much XP a pot loses after `idle` whole days away. */
export function decayAmount(xp, idleDays, floor = 0) {
  const days = Math.min(Math.max(0, idleDays - DECAY.graceDays), DECAY.maxDays);
  if (days <= 0 || xp <= floor) return 0;
  const loss = Math.round(xp * (1 - Math.pow(1 - DECAY.ratePerDay, days)));
  return Math.max(0, Math.min(loss, xp - floor));
}

/** Floor for the overall pot: one level below the best level ever reached. */
export function decayFloor(bestLevel, needFn) {
  const L = Math.max(1, (bestLevel || 1) - 1);
  return Math.max(needFn(Math.min(L, 2)), needFn(L) * 0.0 + needFn(L));
}

/**
 * Apply inactivity decay to a state object in place.
 * Returns a report so the UI can tell the child gently what happened.
 */
export function applyDecay(S, todayKey) {
  /* Item 22: off unless somebody switched it on. A missing value is "off" —
     the old test (`=== false`) made it default to on. */
  if (!S.settings || S.settings.decay !== true) return null;
  const idle = daysBetween(S.lastActive, todayKey);
  if (idle <= DECAY.graceDays) return null;
  const floor = decayFloor(S.bestLevel || overallLevel(S.xp).level, overallNeed);
  const before = S.xp;
  const lost = decayAmount(S.xp, idle, floor);
  if (!lost) return null;
  S.xp -= lost;
  const scale = before > 0 ? S.xp / before : 1;
  SKILL_IDS.forEach((id) => {
    const s = S.skills[id];
    if (s) s.xp = Math.round(s.xp * scale);
  });
  return { lost, idle, level: overallLevel(S.xp).level };
}

/* ---------- 5. Summary for the interface -------------------------------- */

export function skillSummary(S) {
  return SKILL_IDS.map((id) => {
    const s = S.skills[id] || { xp: 0, c: 0, w: 0 };
    const L = skillLevel(s.xp);
    const n = (s.c || 0) + (s.w || 0);
    return {
      id, meta: skillById(id), xp: s.xp || 0, level: L.level, into: L.into,
      need: L.need, rank: skillRank(L.level), answers: n,
      acc: n ? (s.c || 0) / n : null, enabled: S.enabled ? S.enabled[id] !== false : true,
    };
  });
}

/* ---------- 6. The slices (issue #50) ------------------------------------
 * XP, the levels, the runs, the totals, the skills and the inflection cells
 * as slices of the saved state (core/slices.js): what a new pupil has, how a
 * saved copy is loaded, how two devices' copies are merged, and what the
 * server stores. Moved here unchanged from core/state.js `migrate`,
 * core/merge.js `mergeStates` and server/guard.mjs `cleanState`. */

/** The most XP a state may hold (server/guard.mjs LIMITS.xpTotal): far above
    what practice produces, far below what somebody showing off would type. */
export const XP_MAX = 5_000_000;

const same = (value) => value;

/** @typedef {import("../types").Slice} Slice */

/** `S.xp`. A pot that both devices add to, and that can fade (`pot`). @type {Slice} */
export const xpSlice = {
  key: "xp",
  blank: () => 0,
  migrate: (raw) => raw || 0,
  merge: pot,
  clean: (value) => n(value, XP_MAX),
  ownText: false,
};

/** `S.bestLevel`: the highest overall level reached; never below what the XP
    gives. @type {Slice} */
export const bestLevelSlice = {
  key: "bestLevel",
  blank: () => 1,
  migrate: (raw, whole) => Math.max(raw || 1, overallLevel(whole.xp || 0).level),
  merge: (base, local, remote) => Math.max(num(local), num(remote), 1),
  clean: (value) => n(value, 999) || 1,
  ownText: false,
};

/** `S.run`: right answers in a row. It does not outlive a load. @type {Slice} */
export const runSlice = {
  key: "run",
  blank: () => 0,
  migrate: () => 0,
  merge: thisDevice,
  clean: same,
  ownText: false,
};

/** `S.bestRun`: the longest run ever. @type {Slice} */
export const bestRunSlice = {
  key: "bestRun",
  blank: () => 0,
  migrate: (raw) => raw || 0,
  merge: (base, local, remote) => Math.max(num(local), num(remote)),
  clean: (value) => n(value),
  ownText: false,
};

/** A counter both devices only add to: `totalAnswers`, `totalCorrect`.
    @param {string} key @returns {Slice} */
const total = (key) => ({
  key,
  blank: () => 0,
  migrate: (raw) => raw || 0,
  merge: add,
  clean: (value) => n(value),
  ownText: false,
});
export const totalAnswersSlice = total("totalAnswers");
export const totalCorrectSlice = total("totalCorrect");

/** `S.skills`: per category {xp, c, w, bestRun}. Every category the program
    has, and no other. @type {Slice} */
export const skillsSlice = {
  key: "skills",
  blank() {
    const skills = {};
    SKILL_IDS.forEach((id) => { skills[id] = { xp: 0, c: 0, w: 0, bestRun: 0 }; });
    return skills;
  },
  migrate(raw) {
    const skills = skillsSlice.blank();
    SKILL_IDS.forEach((id) => {
      const s = raw?.[id];
      if (s) skills[id] = { xp: s.xp || 0, c: s.c || 0, w: s.w || 0, bestRun: s.bestRun || 0 };
    });
    return skills;
  },
  merge(B, L, R) {
    const out = {};
    for (const k of keys(L, R)) {
      const b = obj(B)[k], l = obj(L)[k], r = obj(R)[k];
      out[k] = {
        xp: pot(obj(b).xp, obj(l).xp, obj(r).xp),
        c: add(obj(b).c, obj(l).c, obj(r).c),
        w: add(obj(b).w, obj(l).w, obj(r).w),
        bestRun: Math.max(num(obj(l).bestRun), num(obj(r).bestRun)),
      };
    }
    return out;
  },
  clean(value) {
    const skills = {};
    for (const id of SKILL_IDS) {
      const s = isObj(value[id]) ? value[id] : {};
      skills[id] = { xp: n(s.xp, XP_MAX), c: n(s.c), w: n(s.w), bestRun: n(s.bestRun) };
    }
    return skills;
  },
  ownText: false,
};

/** `S.cells`: right and wrong per inflection cell, {c, w}. One of the three
    buckets `easeOf` blends. @type {Slice} */
export const cellsSlice = {
  key: "cells",
  blank: () => ({}),
  migrate: (raw) => raw || {},
  merge(B, L, R) {
    const out = {};
    for (const k of keys(L, R)) {
      const l = obj(L)[k], r = obj(R)[k];
      out[k] = !l ? r : !r && !obj(B)[k] ? l : counters(obj(B)[k], l, r, ["c", "w"]);
    }
    return out;
  },
  clean(value) {
    const out = {};
    for (const [k, v] of pairs(value, 30000)) if (isObj(v)) out[k] = { c: n(v.c), w: n(v.w) };
    return out;
  },
  ownText: false,
};
