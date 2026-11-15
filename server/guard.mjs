/* What the server will store as somebody's progress, and what it will believe.
 *
 * The state is written by a browser the server does not control. Until v6.3
 * whatever arrived was stored: 8 MB of anything, an XP figure typed in by
 * hand. Two different defences live here and they must not be confused:
 *
 *   `cleanState`  SHAPE. Rebuilds the state field by field, so nothing but
 *                 progress can be stored and its size is bounded. Things that
 *                 do not fit are dropped, not rejected — a child's real
 *                 progress must never be refused because of one odd key.
 *
 *   `suspicion`   PLAUSIBILITY. The server cannot replay the answers, so it
 *                 cannot PROVE a number is false. It can notice numbers that
 *                 practice does not produce. A state that trips this is still
 *                 stored — but its owner is held off the leaderboard until the
 *                 administrator has looked. Nothing is taken from the child;
 *                 what is withheld is the audience.
 *
 * Honest limit: somebody who edits their progress *plausibly* is not caught by
 * this. That needs the server to see every answer, which is a different
 * program.
 */

import { migrate } from "../src/js/core/state.js";
import { BADGES } from "../src/js/core/badges.js";
import { SKILL_IDS } from "../src/js/core/skills.js";

export const MAX_STATE_BYTES = 2 * 1024 * 1024;

/* An active day is 150–250 XP (core/progress.js). These are far above what
   practice produces and far below what somebody showing off would type.
   The two day limits are kept in step: an answer is worth about 5–16 XP
   before multipliers (tables count every cell as an answer), so 3000 answers
   is about 36 000 XP. Until v6.10 the XP limit was 4000 — a keen pupil
   reached it in one weekend day (~330 questions) and was held for review. */
export const LIMITS = {
  dayAnswers: 3000,      // answers in one day
  dayXp: 3000 * 12,      // XP in one day — in step with dayAnswers
  dayMs: 16 * 3600000,   // time at the screen in one day
  xpTotal: 5_000_000,
  lateDays: 21,          // a day older than this should no longer be growing
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const BADGE_IDS = new Set(BADGES.map((b) => b.id));
const SKILLS = new Set(SKILL_IDS);

const n = (x, max = 1e9) =>
  (typeof x === "number" && Number.isFinite(x) ? Math.min(Math.max(0, Math.round(x)), max) : 0);
const dayStr = (x) => (typeof x === "string" && DAY.test(x) ? x : null);
const isObj = (x) => x && typeof x === "object" && !Array.isArray(x);

function pairs(o, maxKeys, keyLen = 80) {
  return Object.entries(isObj(o) ? o : {})
    .filter(([k]) => k.length > 0 && k.length <= keyLen)
    .slice(0, maxKeys);
}

/** Small free-form objects the program keeps for itself (`periods`, `social`):
    kept only if they are plain data and small. */
function smallJSON(o, maxBytes) {
  if (!isObj(o)) return null;
  try {
    const text = JSON.stringify(o);
    return text.length <= maxBytes ? JSON.parse(text) : null;
  } catch { return null; }
}

/**
 * Rebuild a state out of what arrived. Never throws on odd content; returns
 * null only when what arrived is not a state at all.
 */
export function cleanState(raw, { today = new Date() } = {}) {
  if (!isObj(raw)) return null;
  const S = migrate(raw);

  /* Tomorrow is allowed (time zones); the day after is not a day yet. */
  const limit = new Date(today.getTime() + 36 * 3600000).toISOString().slice(0, 10);

  S.xp = n(S.xp, LIMITS.xpTotal);
  S.bestLevel = n(S.bestLevel, 999) || 1;
  S.goal = Math.min(Math.max(n(S.goal, 499), 1), 499);
  S.bestRun = n(S.bestRun); S.totalAnswers = n(S.totalAnswers); S.totalCorrect = n(S.totalCorrect);
  S.multiSessionRun = n(S.multiSessionRun);
  S.lastSessionSkills = S.lastSessionSkills == null ? null : n(S.lastSessionSkills, 99);
  S.lastActive = dayStr(S.lastActive);
  S.settled = dayStr(S.settled);

  const days = {};
  for (const [k, d] of pairs(S.days, 5000, 10)) {
    if (!DAY.test(k) || k > limit || !isObj(d)) continue;
    const sk = {};
    for (const [id, v] of pairs(d.sk, 40)) if (SKILLS.has(id)) sk[id] = n(v);
    days[k] = { a: n(d.a), c: n(d.c), xp: n(d.xp), ms: n(d.ms, 86400000), nw: n(d.nw),
      sk, g: d.g == null ? null : n(d.g, 499), lg: d.lg ? 1 : 0 };
  }
  S.days = days;

  for (const part of ["cells", "words"]) {
    const out = {};
    for (const [k, v] of pairs(S[part], 30000)) {
      if (!isObj(v)) continue;
      out[k] = { c: n(v.c), w: n(v.w) };
      /* A word's last dozen outcomes (v6.6, core/wordhealth.js): ones and
         zeros and nothing else. */
      if (part === "words" && typeof v.h === "string" && /^[01]{1,12}$/.test(v.h)) out[k].h = v.h;
    }
    S[part] = out;
  }

  const skills = {};
  for (const id of SKILL_IDS) {
    const s = isObj(S.skills[id]) ? S.skills[id] : {};
    skills[id] = { xp: n(s.xp, LIMITS.xpTotal), c: n(s.c), w: n(s.w), bestRun: n(s.bestRun) };
  }
  S.skills = skills;

  /* Only badges the program has. An invented id would otherwise be counted by
     the leaderboard and by the rarity statistics. */
  const badges = {};
  for (const [id, b] of pairs(S.badges, 2000)) {
    if (!BADGE_IDS.has(id) || !isObj(b)) continue;
    const dates = (Array.isArray(b.dates) ? b.dates : []).map(dayStr).filter(Boolean).slice(-80);
    const first = dayStr(b.first) || dates[0] || null;
    badges[id] = { n: Math.max(1, n(b.n, 100000)), dates, first, last: dayStr(b.last) || first };
  }
  S.badges = badges;

  /* core/spacing.js: when each word was last asked — the same shape as a
     badge, with a shorter list of dates. */
  const vocab = {};
  for (const [k, v] of pairs(S.vocab, 30000)) {
    if (!isObj(v)) continue;
    const dates = (Array.isArray(v.dates) ? v.dates : []).map(dayStr).filter(Boolean).slice(-40);
    vocab[k] = { n: n(v.n, 100000), dates, first: dayStr(v.first) || dates[0] || null,
      last: dayStr(v.last) };
  }
  S.vocab = vocab;

  /* The rescue drill (v6.6): per word, numbers and one date. */
  const drills = {};
  for (const [k, v] of pairs(S.drills, 30000)) {
    if (!isObj(v)) continue;
    drills[k] = { p: n(v.p, 10000), t: n(v.t, 10000), f: n(v.f, 10000),
      last: dayStr(v.last), at: n(v.at) };
  }
  S.drills = drills;
  S.drillDays = Object.fromEntries(pairs(S.drillDays, 40, 10)
    .filter(([k]) => DAY.test(k)).map(([k, v]) => [k, n(v, 1000)]));

  /* Lesefni and duels (v6.7): page ids, and duel ids with one letter each. */
  S.read = Object.fromEntries(pairs(S.read, 200, 40).map(([k]) => [k, true]));
  S.duels = Object.fromEntries(pairs(S.duels, 5000, 40)
    .filter(([, v]) => ["w", "l", "t", "f"].includes(v)));

  /* Error diagnosis (v6.10): per pattern, numbers, a string of 1s and 0s, a
     date and up to three examples made of a word key and two BÍN marks. */
  const diag = {};
  const short = (x, len) => (typeof x === "string" && x.length <= len ? x : null);
  for (const [k, v] of pairs(S.diag, 60, 40)) {
    if (!isObj(v)) continue;
    diag[k] = { n: n(v.n), w: n(v.w),
      h: typeof v.h === "string" ? v.h.replace(/[^01]/g, "").slice(-16) : "",
      last: dayStr(v.last),
      ex: (Array.isArray(v.ex) ? v.ex : []).filter(isObj).slice(0, 3)
        .map((e) => ({ w: short(e.w, 80), m: short(e.m, 40), o: short(e.o, 40) })) };
  }
  S.diag = diag;
  S.runs = (Array.isArray(S.runs) ? S.runs : []).filter(isObj).slice(-40).map((r) => ({
    at: n(r.at, 1e13), d: dayStr(r.d), topic: short(r.topic, 40), n: n(r.n, 100), c: n(r.c, 100),
    j: n(r.j, 100), xp: n(r.xp, 100000),
    top: (Array.isArray(r.top) ? r.top : []).filter((x) => typeof x === "string" && x.length <= 40).slice(0, 5),
  }));

  S.counters = Object.fromEntries(pairs(S.counters, 20, 40).map(([k, v]) => [k, n(v)]));
  S.periods = smallJSON(S.periods, 60000) || {};
  S.social = smallJSON(S.social, 20000);
  S.title = typeof S.title === "string" ? S.title.slice(0, 60) : null;
  S.showcase = S.showcase.filter((id) => BADGE_IDS.has(id) && badges[id]).slice(0, 3);

  const settings = {};
  for (const [k, v] of pairs(S.settings, 30, 40)) {
    if (typeof v === "boolean") settings[k] = v;
    else if (typeof v === "string" && v.length <= 40) settings[k] = v;
    else if (typeof v === "number" && Number.isFinite(v)) settings[k] = v;
  }
  S.settings = settings;
  S.enabled = Object.fromEntries(pairs(S.enabled, 60, 40).map(([k, v]) => [k, !!v]));

  /* The name on the board comes from the user record, never from here. */
  S.profile = { id: "local", name: "" };
  return S;
}

const sumDays = (S) => Object.values(S?.days || {}).reduce((a, d) => a + (d.xp || 0), 0);

/**
 * Does this state look like practice? Returns null if so, otherwise a short
 * reason for the administrator (in Icelandic; it is shown on the admin page).
 * `prev` is what was stored before, or null on a first upload.
 */
export function suspicion(next, prev, { today = new Date() } = {}) {
  for (const [k, d] of Object.entries(next.days || {})) {
    if (d.xp > LIMITS.dayXp) return `${d.xp} XP á einum degi (${k})`;
    if (d.a > LIMITS.dayAnswers) return `${d.a} svör á einum degi (${k})`;
    if (d.ms > LIMITS.dayMs) return `meira en 16 klst. á einum degi (${k})`;
  }
  if (!prev) return null;

  /* XP is only ever earned through a day record (core/state.js `record`), and
     the one bonus outside it is small. So XP may not rise faster than the days
     do. Fading (`applyDecay`) only lowers it, which this never objects to. */
  const rise = (next.xp || 0) - (prev.xp || 0);
  const earned = sumDays(next) - sumDays(prev);
  if (rise > Math.max(0, earned) + 200) return `XP hækkaði um ${rise} en dagarnir um ${Math.max(0, earned)}`;

  /* History does not grow. A device that was offline for a while may bring a
     few late days with it; one that rewrites last spring does not. */
  const cut = new Date(today.getTime() - LIMITS.lateDays * 86400000).toISOString().slice(0, 10);
  for (const [k, d] of Object.entries(next.days || {})) {
    if (k >= cut) continue;
    const was = (prev.days || {})[k];
    if ((d.xp || 0) > ((was && was.xp) || 0) + 50) return `gamall dagur (${k}) hækkaði um ${(d.xp || 0) - ((was && was.xp) || 0)} XP`;
  }
  return null;
}
