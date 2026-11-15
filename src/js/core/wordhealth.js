/* Word health and the rescue drill (v6.6).

   The collection (core/collection.js) says which words the child has MET. This
   module says how each of them is DOING, and what can be done about the ones
   that are not doing well:

     status      new · weak · shaky · ok · strong — one word, judged on its
                 recent answers rather than its whole life, so a word that went
                 badly in September and well since is not held against anyone
     weakWords   the words flagged for a rescue drill
     vocabScore  the number the leaderboard sorts by ("Orðaforði"): words found,
                 with more for words held well and nothing for words in trouble
     drill*      the rescue drill: one word, asked again and again, until it has
                 been tried twenty times or tried ten to twenty times with more
                 than half right

   Pure functions over the saved state. No DOM, no clock except through the
   `today` arguments, so the server and the tests see the same thing.      */

import { isRareScore } from "./rarity.js";

/* ---------- 1. The thresholds, in one place ------------------------------ */

export const HEALTH = {
  /** How many outcomes each word remembers (`h` on the word record). */
  keep: 12,
  /** How many of the most recent outcomes a judgement looks at. */
  recent: 10,
  /** Flagged for a rescue: seen at least this often … */
  weakMinSeen: 6,
  /** … and right in fewer than this share of the recent answers. */
  weakMaxAcc: 0.2,
  /** Shaky: at least three answers and under half right. */
  shakyMinSeen: 3,
  shakyMaxAcc: 0.5,
  /** Strong: at least three answers and 80% or more right. */
  strongMinSeen: 3,
  strongMinAcc: 0.8,
  /** Health is a share, and a share of a handful of words means nothing:
      below this many judged words it is not stated (and sorts as 0). */
  healthMinWords: 20,
};

export const DRILL = {
  /** Never fewer questions than this. */
  min: 10,
  /** Never more. Reaching it ends the drill whatever the score. */
  max: 20,
  /** Between `min` and `max`, the drill is passed as soon as MORE than this
      share of the questions so far has been right. */
  pass: 0.5,
  /** XP for a rescue: a base and something for every right answer. */
  xpBase: 50, xpPerRight: 5,
  /** XP for sticking it out to `max` without passing. Effort is rewarded. */
  xpEndure: 30,
  /** A word rescued before gives half — rescuing the same word every week
      should not be a better business than learning it. */
  repeatFactor: 0.5,
  /** Answers after a rescue before the word counts as "kept afloat". */
  keptAfter: 5, keptAcc: 0.6,
};

/* ---------- 2. One word ---------------------------------------------------- */

/** Append one outcome to a word record's short history. Mutates `rec`. */
export function pushHistory(rec, ok) {
  rec.h = ((rec.h || "") + (ok ? "1" : "0")).slice(-HEALTH.keep);
  return rec;
}

/**
 * Accuracy over the most recent answers.
 *
 * Words recorded before v6.6 have counts but no history; so does the part of
 * any word's life before its history began. The missing places in the window
 * are filled at the word's older rate, so a word with three new answers and
 * forty old ones is still judged on ten, not on three.
 */
export function recentOf(rec) {
  const c = (rec && rec.c) || 0, w = (rec && rec.w) || 0, n = c + w;
  if (!n) return { n: 0, seen: 0, acc: null };
  const h = String((rec && rec.h) || "").slice(-HEALTH.recent);
  const win = Math.min(HEALTH.recent, n);
  const hc = [...h].filter((x) => x === "1").length;
  const hl = Math.min(h.length, win);
  const olderC = Math.max(0, c - hc), olderN = Math.max(0, n - h.length);
  const olderRate = olderN > 0 ? olderC / olderN : (h.length ? hc / h.length : 0);
  const right = [...h.slice(-hl)].filter((x) => x === "1").length + (win - hl) * olderRate;
  return { n: win, seen: n, acc: right / win };
}

/** "new" | "weak" | "shaky" | "ok" | "strong". */
export function statusOf(rec) {
  const r = recentOf(rec);
  if (!r.seen) return "new";
  if (r.seen >= HEALTH.weakMinSeen && r.acc < HEALTH.weakMaxAcc) return "weak";
  if (r.seen >= HEALTH.strongMinSeen && r.acc >= HEALTH.strongMinAcc) return "strong";
  if (r.seen >= HEALTH.shakyMinSeen && r.acc < HEALTH.shakyMaxAcc) return "shaky";
  if (r.seen < HEALTH.shakyMinSeen) return "new";
  return "ok";
}

export const STATUS_LABEL = {
  new: "Nýtt", weak: "Í hættu", shaky: "Óstöðugt", ok: "Í lagi", strong: "Á valdi þínu",
};

/* ---------- 3. The whole collection ---------------------------------------- */

/** Is there a builder that can ask about this word again and again? Words of
    a class with a table or a cloze always; the rest only if a confirmed
    sentence holds them (tasks/index.js `drillTask`). */
export const DRILL_CLASSES = new Set(["kk", "kvk", "hk", "so", "lo", "fn", "pfn", "gr", "to", "rt"]);
export function drillable(lex, entry) {
  if (!entry) return false;
  if (DRILL_CLASSES.has(entry.c)) return true;
  return !!(lex && lex.inSentences && lex.inSentences(entry.o, entry.c));
}

/** The words flagged for a rescue, worst first. */
export function weakWords(S, lex) {
  const out = [];
  for (const [key, rec] of Object.entries(S.words || {})) {
    if (statusOf(rec) !== "weak") continue;
    const [lemma, cls] = key.split("|");
    const entry = lex ? lex.lookup(lemma, cls) : null;
    const r = recentOf(rec);
    out.push({
      key, lemma, cls, entry, seen: r.seen, acc: r.acc,
      correct: rec.c || 0, wrong: rec.w || 0,
      drillable: lex ? drillable(lex, entry) : true,
      rescued: !!(S.drills && S.drills[key] && S.drills[key].p),
    });
  }
  return out.sort((a, b) => a.acc - b.acc || b.seen - a.seen || a.lemma.localeCompare(b.lemma, "is"));
}

/**
 * The leaderboard's "Orðaforði" and everything shown beside it.
 *
 *   each word found               1 point (2 if it is a rare word)
 *   held well (strong)            +2
 *   rescued, and not weak again   +1
 *   flagged (weak)                the word counts 0 until it is rescued
 *
 * So finding words always pays, a word kept well pays three times over, and a
 * word let slide stops paying — which is how the board rewards keeping the
 * whole collection in good health rather than only growing it.
 */
export function vocabScore(S, lex) {
  let score = 0, found = 0, weak = 0, shaky = 0, strong = 0, judged = 0, healthy = 0,
    rescued = 0, kept = 0;
  const drills = S.drills || {};
  for (const [key, rec] of Object.entries(S.words || {})) {
    const n = (rec.c || 0) + (rec.w || 0);
    if (!n) continue;
    found++;
    const st = statusOf(rec);
    const [lemma, cls] = key.split("|");
    const entry = lex ? lex.lookup(lemma, cls) : null;
    const base = entry && isRareScore(entry.q) ? 2 : 1;
    const d = drills[key];
    if (d && d.p) rescued++;
    if (d && d.p && keptAfloat(rec, d)) kept++;
    if (st === "weak") { weak++; judged++; continue; }
    let pts = base;
    if (st === "strong") { pts += 2; strong++; }
    if (st === "shaky") shaky++;
    if (d && d.p) pts += 1;
    score += pts;
    if (n >= HEALTH.shakyMinSeen) {
      judged++;
      if (st !== "shaky") healthy++;
    }
  }
  return {
    score, found, weak, shaky, strong, judged, rescued, kept,
    /* Whole percent, or null when too few words have been judged to say. */
    health: judged >= HEALTH.healthMinWords ? Math.round(100 * healthy / judged) : null,
  };
}

/** A rescued word that has since been answered `keptAfter` more times and is
    doing well on them. `d.at` is the number of answers the word had when the
    rescue ended. */
export function keptAfloat(rec, d) {
  if (!rec || !d || !d.p) return false;
  const n = (rec.c || 0) + (rec.w || 0);
  if (n - (d.at || 0) < DRILL.keptAfter) return false;
  const since = String(rec.h || "").slice(-Math.min(HEALTH.keep, n - (d.at || 0)));
  if (since.length < DRILL.keptAfter) return false;
  const acc = [...since].filter((x) => x === "1").length / since.length;
  return acc >= DRILL.keptAcc;
}

/* ---------- 4. The drill --------------------------------------------------- */

/** A new drill on one word. `before` is the word's record as it stands. */
export function startDrill(key, rec) {
  const r = recentOf(rec);
  return {
    key, n: 0, c: 0, marks: [],
    seenBefore: r.seen, accBefore: r.acc,
    done: false, passed: false,
  };
}

/** One question of the drill has been answered. Mutates and returns `d`. */
export function drillStep(d, ok) {
  if (!d || d.done) return d;
  d.n++;
  if (ok) d.c++;
  d.marks.push(ok ? 1 : 0);
  if (d.n >= DRILL.min && d.c / d.n > DRILL.pass) { d.done = true; d.passed = true; }
  else if (d.n >= DRILL.max) { d.done = true; d.passed = false; }
  return d;
}

/** What a finished drill is worth. `prior` is `S.drills[key]` before it. */
export function drillReward(d, prior) {
  if (!d || !d.done) return 0;
  if (!d.passed) return DRILL.xpEndure;
  const full = DRILL.xpBase + DRILL.xpPerRight * d.c;
  return Math.round(prior && prior.p ? full * DRILL.repeatFactor : full);
}

/**
 * Write a finished drill into the state and return what the badges need to
 * know about it. `wordRec` is the word's record AFTER the drill's answers.
 */
export function settleDrill(S, d, wordRec, today) {
  const drills = (S.drills ||= {});
  const prior = drills[d.key] ? { ...drills[d.key] } : null;
  const xp = drillReward(d, prior);
  const rec = (drills[d.key] ||= { p: 0, t: 0, f: 0, last: null, at: 0 });
  rec.t++;
  if (d.passed) rec.p++; else rec.f++;
  rec.last = today;
  rec.at = ((wordRec && wordRec.c) || 0) + ((wordRec && wordRec.w) || 0);
  if (d.passed) {
    const day = (S.drillDays ||= {});
    day[today] = (day[today] || 0) + 1;
    /* Only the last fortnight is kept; the badge asks about one day. */
    for (const k of Object.keys(day)) if (k < daysBefore(today, 14)) delete day[k];
  }
  const firstThreeWrong = d.marks.slice(0, 3).length === 3 && d.marks.slice(0, 3).every((x) => !x);
  return {
    key: d.key, passed: d.passed, endured: !d.passed, n: d.n, c: d.c,
    perfect: d.passed && d.c === d.n,
    turnaround: d.passed && firstThreeWrong,
    oldGhost: d.passed && (d.seenBefore || 0) >= 15,
    firstForWord: !(prior && prior.p) && d.passed,
    xp,
    rescuesToday: (S.drillDays || {})[today] || 0,
  };
}

/** How many different words have been rescued at least once. */
export const rescueCount = (S) =>
  Object.values(S.drills || {}).reduce((a, r) => a + (r.p ? 1 : 0), 0);

function daysBefore(key, n) {
  const [y, m, d] = String(key).split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d - n));
  return t.toISOString().slice(0, 10);
}

