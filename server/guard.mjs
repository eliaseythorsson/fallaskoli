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

import { migrate, FRAMES_MAX } from "../src/js/core/state.js";
import { BADGES } from "../src/js/core/badges.js";
import { SKILL_IDS } from "../src/js/core/skills.js";
import { cleanContext, cleanSlices } from "../src/js/core/slices.js";
import { XP_MAX } from "../src/js/core/progress.js";
import { cleanLevels } from "../src/js/core/difficulty.js";
import { cleanByType } from "../src/js/core/mastery.js";
import { cleanByNode, cleanMapBand } from "../src/js/core/skillmap.js";
import { cleanSeenTypes } from "../src/js/core/examples.js";
import { sanitiseMend } from "../src/js/core/mending.js";
import { cleanTour } from "../src/js/core/placement.js";

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
  xpTotal: XP_MAX,     // core/progress.js
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
  const ctx = cleanContext(today), { limit } = ctx;


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

  /* The converted slices (core/slices.js) check themselves: each slice's
     `clean`, with the date. The review queue (core/review.js `cleanReview`)
     is rebuilt by the function the browser loads with and held to the
     calendar. */
  cleanSlices(S, ctx);

  /* Saved levels (v6.13, core/difficulty.js): known skills only, the level
     inside 1–7, the run 0–1, a dozen 1s and 0s, a time and one of three
     sources. `migrate` already did this; it is said again here because this
     file is where the server's trust is decided. */
  S.difficulty = cleanLevels(S.difficulty);

  /* Sentences seen as frames (v6.13): `migrate` has already kept only short
     keys and whole counts (core/state.js `cleanFrames`); here the counts are
     held to the same ceiling as every other counter. */
  S.frames = Object.fromEntries(pairs(S.frames, FRAMES_MAX, 8).map(([k, v]) => [k, n(v, 100000)]));
  /* Per question type (v6.13, item 44): known types only, two counts, twenty
     letters and a time. Types met (item 41): known types only, one day each,
     not after tomorrow. Both bounded by the number of question types. */
  S.byType = cleanByType(S.byType);
  /* The same record for the curriculum nodes that keep one (item 83,
     core/skillmap.js): known nodes only — seven of them. */
  S.byNode = cleanByNode(S.byNode);
  S.mapBand = cleanMapBand(S.mapBand);
  S.seenTypes = Object.fromEntries(Object.entries(cleanSeenTypes(S.seenTypes))
    .filter(([, d]) => d <= limit));

  /* Getting better (items 56 and 58, core/mending.js): pattern ids, days
     and counts, rebuilt by the same function the browser loads with — and
     here no day after tomorrow, because "Framfarir" is read off these days
     and a day in the future would sit in next week's board. */
  const mend = sanitiseMend(raw.mend);
  for (const k of Object.keys(mend.open)) if (mend.open[k] > limit) delete mend.open[k];
  mend.log = mend.log.filter((x) => x.d <= limit);
  for (const k of Object.keys(mend.rv)) if (k > limit) delete mend.rv[k];
  S.mend = mend;

  /* The guided first run (item 84, core/placement.js): one of three states,
     a time, a day, a flag and a year. `migrate` has rebuilt it with the
     function the browser loads with; here the day and the time are held to
     the calendar like every other date in the state. */
  S.tour = cleanTour(S.tour);
  if (S.tour) {
    if (S.tour.d && S.tour.d > limit) S.tour.d = null;
    S.tour.at = Math.min(S.tour.at, today.getTime() + 2 * 86400000);
  }

  /* Across slices: the showcase holds only badges the pupil has. */
  S.showcase = S.showcase.filter((id) => S.badges[id]);

  const settings = {};
  for (const [k, v] of pairs(S.settings, 30, 40)) {
    if (typeof v === "boolean") settings[k] = v;
    else if (typeof v === "string" && v.length <= 40) settings[k] = v;
    else if (typeof v === "number" && Number.isFinite(v)) settings[k] = v;
  }
  S.settings = settings;
  S.enabled = Object.fromEntries(pairs(S.enabled, 60, 40).map(([k, v]) => [k, !!v]));

  return S;
}

/* ---- checks across slices ----------------------------------------------
 *
 * What follows reads more than one slice, so it belongs to no slice's
 * `clean` (core/slices.js) and stays here: XP may not rise faster than the
 * days' records, and old days may not grow. (In `cleanState` above, the
 * showcase is held to the badges the pupil has, for the same reason.) */

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
