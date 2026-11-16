/* Difficulty is tracked per skill, and kept between visits.

   Doing well at declining nouns should not hand out harder verb moods. Each
   skill has its own level on the 1–7 scale (þyngd), and since v6.13 that
   level is SAVED with the progress (`S.difficulty`) instead of being rebuilt
   from the skill's XP on every page load.

   Why (critique items 11 and 12): the old number started each visit between
   1.0 and 3.5 according to XP and rose 0.25–0.3 per right answer in that
   skill only. In Blandað a skill meets one or two questions a day, so it
   never climbed: over 40 simulated days a pupil who got 86% right and one who
   got 46% right were served the same mean sentence level, 2.2 and 2.1.

   ---- the rule ------------------------------------------------------------

   Inside a visit (item 12), per skill:
     * two right in a row raise the level half a step (STEP);
     * one wrong lowers it half a step;
     * the level does not rise while fewer than 80% of the skill's last dozen
       answers were right (UP_GATE, WINDOW). A plain "two up, one down"
       staircase settles where p² = ½, about 71% right — below the 75–85% the
       critique aims for. Holding the rise back while recent accuracy is low
       moves the balance point to about 79% (simulated with several slopes of
       accuracy against level; it barely depends on the slope). A wrong
       answer is never forgiven, so "one wrong lowers half" holds literally.
   So the level is driven by the skill's recent accuracy, not by XP: XP is
   read only once, to place a pupil who had progress before this existed
   (`levelsFromXp`).

   Between visits (item 11):
     * a visit starts half a step below where the last one ended (WARMUP);
     * the first RIGHT answer in that skill gives the half step back — it has
       shown the level still holds — and counts as the first of a pair.
   Without the give-back, a Blandað skill answered right twice a day would go
   +½ in the visit and −½ at the next one, and never climb. With it, it
   climbs half a step a day when the answers are right.
   The two-in-a-row count and the last dozen outcomes are saved too, so a run
   that spans two days in Blandað still counts.

   ---- where the level may go ------------------------------------------------

   Not above what the pupil may meet, and not above where anything changes:
   `levelRanges` gives each skill [lo, hi] from the effective policy (its
   lowest and highest allowed þyngd), the highest band any allowed type of
   the skill DECLARES (tasks/registry.js `bands` — a skill whose types all
   say [1] does not move at all), and one above the hardest sentence the
   policy allows: tasks/shared.js `sentPool` serves sentences of level b−1..b
   and falls back to EVERY sentence when that window is empty, so a level two
   above the hardest sentence would make the questions easier, not harder.
   The app hands the ranges to the session (`sess.range`); without them the
   level runs over the whole 1–7 scale. A level already above `hi` (the
   policy was tightened) is not pulled down by a right answer; a wrong one
   steps down from `hi`.

   ---- the saved record, per skill ------------------------------------------

     S.difficulty[skill] = { d, r, h, at, src }
       d    the level where the last answer left it, 1–7, in halves
       r    right answers in a row towards the next rise (0 or 1)
       h    the last dozen outcomes, oldest first, as "1"/"0"
       at   when it last changed (ms) — the later record wins a merge
       src  what set it: "play" (answers), "xp" (the one-off migration),
            "cal" (a calibration, `setSkillLevel`), "placement" (the
            placement round of the first run: item 84, core/placement.js)
   A skill with no record is at level 1 with no history.

   ---- the second axis: how hard the word and the cell are (item 16) ---------

   The level above was, until v6.13, only the length of the sentence. But
   *maður*, *kýr* and *bók* are harder than *hestur* in a sentence of any
   length, and the genitive plural is harder than the accusative singular.
   The build now scores both on a scale of 1–5 (irregularity.py: `irr` on
   every noun, adjective and verb of the lexicon, and a table of cells), and
   the SAME level chooses on that axis too — `hardnessWeight` below, used by
   tasks/shared.js for the choice of word (`wordWeight`) and of cell
   (`cellEase`).

   The rule: a word or cell whose score is within the level's reach
   (`hardReach`: 1 at level 1, one more per level, everything from level 5)
   has full weight. Above the reach the weight falls by HARD_DECAY per point,
   and never below HARD_FLOOR — in effect: one point above the reach a little
   under half, anything further a fifth. So at level 1 a regular word is
   five times as likely as *maður* — but *maður* still comes, and comes
   more often than a fifth suggests because it is the commonest noun there
   is (frequency is a separate factor in `wordWeight`). Nothing is ever
   excluded: a pupil at a low level still meets hard words now and then, and
   a word answered wrong comes back whatever its score.

   What that does, measured on the v6.13 vocabulary (share of the weight of
   all nouns / verbs that falls on words scored 4–5):
       level 1   nouns  under 2%   verbs about 18%
       level 5   nouns  6–7%       verbs about 38%
   (verbs: the commonest verbs are nearly all strong, and stay common).

   At high levels hard words are mixed in at their natural rate, not
   favoured: the irregular words are also the common ones, so they are met
   often enough without a push.

   A word or cell without a score (the closed classes) is neutral: weight 1.

   Pure apart from the default clock argument (`now = Date.now()`), which a
   test or a simulation passes. */

import { SKILL_IDS } from "./skills.js";
import { skillLevel } from "./progress.js";

/* Difficulty runs 1-7: 1-5 is year 8, 6 is year 9 and 7 is year 10
 * (core/curriculum.js TOP_LEVEL). Levels 6 and 7 have sentences of their own
 * since v6.13: two subordinate clauses, þolmynd, viðtengingarháttur þátíðar,
 * óbein ræða (sentences.py says what earns a sentence its level). A pupil
 * reaches them only where the policy has them switched on: `levelRanges`
 * below stops each skill at the policy's highest þyngd. */
export const MIN = 1, MAX = 7;
export const clamp = (v, a = MIN, b = MAX) => Math.max(a, Math.min(b, v));

/** The step up after two right in a row, and down after one wrong (item 12). */
export const STEP = 0.5;
/** How far below its last level a skill starts a new visit (item 11). */
export const WARMUP = 0.5;
/** Right answers in a row that earn a step up. */
export const RUN_UP = 2;
/** The recent answers the accuracy gate reads, and the share that must be right. */
export const WINDOW = 12, UP_GATE = 0.8;
/** Below this many recent answers there is too little to judge: no gate. */
export const GATE_MIN = 4;

const SOURCES = new Set(["play", "xp", "cal", "placement"]);
const round2 = (x) => Math.round(x * 100) / 100;
const isObj = (x) => x && typeof x === "object" && !Array.isArray(x);

/* ---------- the saved record ---------------------------------------------- */

/** The saved record of one skill, or the default for a skill never met. Read-only. */
export function levelRecord(S, skill) {
  const r = S && isObj(S.difficulty) ? S.difficulty[skill] : null;
  return isObj(r) ? r : { d: MIN, r: 0, h: "", at: 0, src: "play" };
}

/** The saved level of one skill (where its last visit ended). */
export const storedLevel = (S, skill) => levelRecord(S, skill).d;

/** The share right among recent outcomes, or null when there are too few. */
export function recentAccuracy(h) {
  const s = String(h || "");
  if (s.length < GATE_MIN) return null;
  return [...s].filter((c) => c === "1").length / s.length;
}

/**
 * THE way to set a skill's level from outside the answer loop — a placement
 * round or a guided first run (critique items 40 and 84) calls this and
 * nothing else.
 *
 * Writes `S.difficulty[skill]` (clamped to 1–7, two decimals) with `src` and
 * the time, and starts the run and the recent history afresh: answers given
 * at other levels say nothing about the new one. If the live session is
 * passed, the level takes effect at once (no warm-up for that skill).
 *
 * @param {object} S        the pupil's state (changed)
 * @param {string} skill    a skill id (core/skills.js)
 * @param {number} level    the new level
 * @param {{source?: "cal"|"placement"|"play"|"xp", now?: number, sess?: object,
 *          history?: string}} [opts]  `history`: outcomes to keep as the
 *          recent history, e.g. the calibration answers ("1"/"0")
 * @returns {object} the record written
 */
export function setSkillLevel(S, skill, level, { source = "cal", now = Date.now(), sess = null, history = "" } = {}) {
  if (!SKILL_IDS.includes(skill)) throw new Error("Óþekktur flokkur: " + skill);
  const d = round2(clamp(Number(level) || MIN));
  const rec = {
    d, r: 0, h: String(history || "").replace(/[^01]/g, "").slice(-WINDOW),
    at: now, src: SOURCES.has(source) ? source : "cal",
  };
  (S.difficulty ||= {})[skill] = rec;
  if (sess) {
    (sess.diff ||= {})[skill] = d;
    if (sess.warm) delete sess.warm[skill];
    (sess.seenAt ||= {})[skill] = now;
  }
  return rec;
}

/**
 * The one-off migration for a pupil who has progress from before levels were
 * saved: the level the old code started each visit at (from the skill's XP,
 * 1–3.5), in halves — held at 2 for a skill answered at least 20 times with
 * fewer than 60% right, since XP counts only the right answers. Only skills
 * above level 1 get a record. `at` is 0, so any record made by answering wins
 * a merge against it.
 */
export function levelsFromXp(skills) {
  const out = {};
  SKILL_IDS.forEach((id) => {
    const s = isObj(skills) && isObj(skills[id]) ? skills[id] : {};
    const L = skillLevel(s.xp || 0).level;
    let d = Math.round(clamp(1 + (L - 1) * 0.3, 1, 3.5) * 2) / 2;
    const n = (s.c || 0) + (s.w || 0);
    if (n >= 20 && (s.c || 0) / n < 0.6) d = Math.min(d, 2);
    if (d > MIN) out[id] = { d, r: 0, h: "", at: 0, src: "xp" };
  });
  return out;
}

/**
 * A saved `difficulty` as it may be trusted: known skills only, every field
 * bounded. Used by `migrate` (core/state.js) and by the server's guard.
 */
export function cleanLevels(raw) {
  const out = {};
  if (!isObj(raw)) return out;
  for (const id of SKILL_IDS) {
    const v = raw[id];
    if (!isObj(v)) continue;
    const d = typeof v.d === "number" && Number.isFinite(v.d) ? round2(clamp(v.d)) : MIN;
    const r = Number.isInteger(v.r) ? clamp(v.r, 0, RUN_UP - 1) : 0;
    const h = typeof v.h === "string" ? v.h.replace(/[^01]/g, "").slice(-WINDOW) : "";
    const at = typeof v.at === "number" && Number.isFinite(v.at) ? Math.min(Math.max(0, Math.round(v.at)), 1e13) : 0;
    out[id] = { d, r, h, at, src: SOURCES.has(v.src) ? v.src : "play" };
  }
  return out;
}

/**
 * Two devices, one pupil (core/merge.js): a level is a position, not a
 * count, so it does not add. Per skill, the record changed last wins whole —
 * level, run and history belong together. `base` is accepted for the shape
 * of the other merges and not needed: a side that did not change it since
 * base has the older `at`.
 */
export function mergeLevels(base, local, remote) {
  const L = isObj(local) ? local : {}, R = isObj(remote) ? remote : {};
  const out = {};
  for (const k of new Set([...Object.keys(R), ...Object.keys(L)])) {
    const l = L[k], r = R[k];
    const w = !isObj(l) ? r : !isObj(r) ? l : ((r.at || 0) > (l.at || 0) ? r : l);
    if (isObj(w)) out[k] = { ...w };
  }
  return out;
}

/* ---------- the visit ------------------------------------------------------- */

/**
 * The session's starting levels: each skill half a step below its saved
 * level, with the saved level kept in `warm` to be given back by the first
 * right answer. Saved state is not touched — reloading the page five times
 * costs nothing. `seenAt` remembers each record's time, so a newer one
 * brought in by a merge is noticed (`bumpDiff`).
 *
 * @returns {{diff: object, warm: object, seenAt: object, visitDay: string}}
 */
export function visitLevels(S, day) {
  const diff = {}, warm = {}, seenAt = {};
  SKILL_IDS.forEach((id) => {
    const rec = levelRecord(S, id);
    diff[id] = round2(Math.max(MIN, rec.d - WARMUP));
    if (diff[id] < rec.d) warm[id] = rec.d;
    seenAt[id] = rec.at || 0;
  });
  return { diff, warm, seenAt, visitDay: day };
}

/** The starting level of every skill for a new visit. */
export const initDiff = (S) => visitLevels(S, null).diff;

/**
 * Where each skill's level may go under this policy: { skill: [lo, hi] }.
 * See "where the level may go" at the top. Pure: the catalogue and the
 * sentences are passed in (core/ does not import tasks/).
 *
 * @param {object} P          an effective policy (core/policy.js createPolicy)
 * @param {object[]} types    tasks/registry.js TASKS: { id, skill, anyOf?, bands }
 * @param {object[]} sentences the lexicon's sentences ({ lvl })
 */
export function levelRanges(P, types, sentences) {
  const lo = P.minLevel ?? MIN, polHi = P.maxLevel ?? MAX;
  let top = 0;
  (sentences || []).forEach((s) => { if (s.lvl > top && P.level(s.lvl)) top = s.lvl; });
  const sentHi = top ? top + 1 : MAX;
  const out = {};
  SKILL_IDS.forEach((id) => {
    const bandTop = (types || [])
      .filter((t) => (t.skill === id || (t.anyOf || []).includes(id)) && (!P.type || P.type(t.id)))
      .reduce((m, t) => Math.max(m, ...(t.bands || [MIN])), MIN);
    out[id] = [lo, Math.max(lo, Math.min(polHi, bandTop, sentHi))];
  });
  return out;
}

/**
 * Give the session its ranges, and keep the levels it SERVES inside them: a
 * level above `hi` (a tightened policy, a calibration) would otherwise reach
 * the sentence fallback described at the top. Only the live level moves; the
 * saved one changes with the next answer in that skill.
 */
export function applyRanges(sess, ranges) {
  sess.range = ranges;
  if (!ranges || !sess.diff) return sess;
  for (const [id, [lo, hi]] of Object.entries(ranges))
    if (id in sess.diff) sess.diff[id] = clamp(sess.diff[id], lo, hi);
  return sess;
}

/* ---------- one answer -------------------------------------------------------- */

/**
 * The rule, on numbers alone. Pure.
 *
 * @param {{live:number, r:number, h:string, warm?:number, lo?:number, hi?:number}} at
 * @param {boolean} ok
 * @returns {{live:number, r:number, h:string}}
 */
export function nextLevel({ live, r = 0, h = "", warm = null, lo = MIN, hi = MAX }, ok) {
  const hist = (String(h) + (ok ? "1" : "0")).slice(-WINDOW);
  const acc = recentAccuracy(hist);
  const mayRise = acc === null || acc >= UP_GATE;
  const up = (to) => (live >= hi ? live : Math.max(lo, Math.min(hi, to)));
  let next = live, run = r;
  if (!ok) {
    next = Math.max(lo, Math.min(live, hi) - STEP);
    run = 0;
  } else if (warm != null && warm > live) {
    /* The first right answer of the visit gives the warm-up back. */
    if (mayRise) next = up(warm);
    run = 1;
  } else {
    run = r + 1;
    if (run >= RUN_UP) {
      run = 0;
      if (mayRise) next = up(live + STEP);
    }
  }
  return { live: round2(next), r: run, h: hist };
}

/**
 * One judged answer in `skill`: move the session's level (`sess.diff`) and
 * write it, with the run and the history, into the saved state. Called once
 * per question by core/answer.js `settle` (the "bump" effect). `ok` that is
 * not true or false (a question with no right answer) changes nothing.
 */
export function bumpDiff(sess, S, skill, ok, now = Date.now()) {
  if (typeof ok !== "boolean" || !skill) return diffOf(sess, skill);
  const rec = levelRecord(S, skill);
  sess.diff ||= {}; sess.warm ||= {}; sess.seenAt ||= {};
  /* Another device moved this skill since this visit last looked (a merge
     brought a newer record): carry on from there. */
  if ((rec.at || 0) > (sess.seenAt[skill] || 0)) {
    sess.diff[skill] = rec.d;
    delete sess.warm[skill];
  }
  const [lo, hi] = (sess.range && sess.range[skill]) || [MIN, MAX];
  const n = nextLevel({ live: sess.diff[skill] ?? rec.d, r: rec.r, h: rec.h,
    warm: sess.warm[skill], lo, hi }, ok);
  delete sess.warm[skill];
  sess.diff[skill] = n.live;
  (S.difficulty ||= {})[skill] = { d: n.live, r: n.r, h: n.h, at: now, src: "play" };
  sess.seenAt[skill] = now;
  return n.live;
}

export const diffOf = (sess, skill) => sess.diff[skill] ?? 1;
export const bandOf = (sess, skill) => clamp(Math.round(diffOf(sess, skill)), MIN, MAX);

/* ---------- the second axis: word and cell hardness (item 16) ---------------- */

/** The scale of the build's scores: `irr` of a word, the hardness of a cell. */
export const HARD_MIN = 1, HARD_MAX = 5;
/** What one point of hardness above the level's reach costs in weight. */
export const HARD_DECAY = 0.45;
/** The least weight a word or cell ever has, however far above the reach. */
export const HARD_FLOOR = 0.2;

/** The hardest score that has full weight at this level: 1 at level 1, one
    more per level (in fractions, as the level moves in halves), all from 5. */
export const hardReach = (level) =>
  clamp(HARD_MIN + ((Number(level) || MIN) - MIN), HARD_MIN, HARD_MAX);

/**
 * The weight of a word or a cell of hardness `score` (1–5) for a pupil at
 * `level` (1–7): 1 within reach, falling above it, never under HARD_FLOOR.
 * A missing score is neutral. Pure.
 */
export function hardnessWeight(level, score) {
  if (typeof score !== "number" || !Number.isFinite(score)) return 1;
  const over = clamp(score, HARD_MIN, HARD_MAX) - hardReach(level);
  return over <= 0 ? 1 : Math.max(HARD_FLOOR, Math.pow(HARD_DECAY, over));
}
