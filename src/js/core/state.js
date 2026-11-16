/* User state and session state.

   Everything that is persisted goes through here. The functions take the state
   as an argument (no global), so tests can build their own. */

import { SKILL_IDS, defaultEnabled } from "./skills.js";
import { createPolicy, blankPolicy, sanitisePolicy } from "./policy.js";
import { overallLevel, skillLevel, easeOf } from "./progress.js";
import { visitLevels, cleanLevels, levelsFromXp } from "./difficulty.js";
import { timeContext } from "./calendar.js";
import { checkDayEnd } from "./badges.js";
import { pushHistory } from "./wordhealth.js";
import { blankReview, sanitiseReview } from "./review.js";

export const STATE_VERSION = 11;

export const dkey = (d) =>
  d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" +
  String(d.getDate()).padStart(2, "0");

export const todayKey = () => dkey(new Date());

/** The day before this one, as a key. String in, string out — no time zones. */
export function prevKey(key) {
  const [y, m, d] = String(key).split("-").map(Number);
  if (!y || !m || !d) return key;
  return dkey(new Date(y, m - 1, d - 1));
}

export function blankState() {
  const skills = {};
  SKILL_IDS.forEach((id) => { skills[id] = { xp: 0, c: 0, w: 0, bestRun: 0 }; });
  return {
    v: STATE_VERSION,
    profile: { id: "local", name: "" },
    xp: 0, bestLevel: 1,
    days: {}, cells: {}, words: {}, skills, badges: {},
    /* When each word was last asked about in the vocabulary skill. Kept apart
       from `words` (which is right/wrong) because the wait is about dates, not
       about correctness. See core/spacing.js. */
    vocab: {},
    goal: 10, run: 0, bestRun: 0,
    totalAnswers: 0, totalCorrect: 0,
    /* Consecutive sessions touching three or more skills (multi-skill badges). */
    multiSessionRun: 0, lastSessionSkills: null,
    counters: { perfectTables: 0, perfectParses: 0, meanings: 0 },
    enabled: defaultEnabled(),
    /* `policy` is what the child switched on, `allowed` the ceiling the
       administrator set; kept apart so tightening and loosening the ceiling
       gives the child back exactly the choices they made. `enabled` is the
       skills half of `policy`, kept under its older name. */
    policy: blankPolicy(),
    allowed: null,
    /* `badgeView`: which view of the badge cabinet is showing (ui/panels.js).
       A child with nothing on the shelf yet is shown the catalogue instead. */
    settings: { decay: true, audio: true, glossary: true, badgeView: "rarity" },
    lastActive: null,
    /* `periods`: the once-per-day / once-per-night ledger (core/badges.js).
       `settled`: the last day whose day-end badges have been judged. */
    periods: {},
    settled: null,
    /* What other users see beside the name (core/social.js): up to three
       pinned badge ids and a title id. `social` remembers who was ahead on
       this week's board, which is how overtaking is noticed. */
    showcase: [],
    title: null,
    social: null,
    /* The rescue drill (core/wordhealth.js, v6.6). `drills` is per word:
       {p: rescues, t: drills started and finished, f: drills endured without
       passing, last: date, at: the word's answer count when the last one
       ended}. `drillDays` counts rescues per day, for one badge, a fortnight
       deep. */
    drills: {},
    drillDays: {},
    /* Lesefni (v6.7): the pages read, { pageId: true }. */
    read: {},
    /* Duels (v6.7, core/duel.js): every settled duel, { duelId: "w"|"l"|"t" }
       — won, lost, tied. Written once, when this device first sees the
       result, which is what makes the XP and the badge count only once. */
    duels: {},
    /* Error diagnosis (v6.10, core/diagnosis.js): per pattern
       {n: chances, w: misses, h: the last 16 as "1"/"0", last: date,
       ex: [{w: word key, m: the cell asked for, o: the cell given}]}.
       No text the child typed. */
    diag: {},
    /* Practice sessions (v6.10): the last 40, newest last —
       {at: ms, d: date, topic, n, c, j: judged, xp, top: [pattern ids]}. */
    runs: [],
    /* The review queue (v6.13, core/review.js): what was missed and when it
       is next to be asked — { items: [entry …], stats: { … } }. That file
       describes the shape; nothing else writes to it. */
    review: blankReview(),
    /* Each skill's level of difficulty, kept between visits (v6.13, critique
       item 11): { skill: {d, r, h, at, src} } — see core/difficulty.js. */
    difficulty: {},
  };
}

/* Word classes a per-word key may legitimately carry. This is the lexicon's
   own set; anything else is a key nothing can look up. */
const WORD_CLASSES = new Set([
  "kk", "kvk", "hk", "lo", "so", "fn", "pfn", "gr", "to", "rt",
  "ao", "fs", "st", "uh", "nhm",
]);

/**
 * Drop per-word keys that no lookup can resolve: older builds filed nouns
 * under Greynir's short code (`vindur|no`), a class the lexicon does not know.
 * Removed rather than repaired (the gender is not in the key); only the ease
 * history is lost.
 */
function cleanWordKeys(words) {
  const out = {};
  for (const [k, v] of Object.entries(words || {})) {
    const cls = String(k).split("|")[1];
    if (cls && !WORD_CLASSES.has(cls)) continue;
    out[k] = v;
  }
  return out;
}

/** Bring any older saved blob up to the current shape without losing data. */
export function migrate(raw) {
  const S = blankState();
  if (!raw || typeof raw !== "object") return S;

  Object.assign(S, {
    xp: raw.xp || 0,
    /* `g` is the daily goal as it stood on that day, so a day is judged
       against the goal in force then rather than today's setting. Days
       recorded before it existed get null and fall back to the current goal. */
    days: Object.fromEntries(Object.entries(raw.days || {}).map(([k, d]) => [k, {
      a: d.a || 0, c: d.c || 0, xp: d.xp || 0, ms: d.ms || 0, nw: d.nw || 0,
      sk: d.sk || {}, g: d.g ?? null,
      /* `lg` — the program was opened on this day, whether or not anything was
         answered. A day with answers also counts as opened (`loginStreak`). */
      lg: d.lg ? 1 : 0,
    }])),
    cells: raw.cells || {},
    words: cleanWordKeys(raw.words),
    badges: raw.badges || {},
    goal: raw.goal || 10,
    bestRun: raw.bestRun || 0,
    totalAnswers: raw.totalAnswers || 0,
    totalCorrect: raw.totalCorrect || 0,
    lastActive: raw.lastActive || null,
    vocab: raw.vocab || {},
    multiSessionRun: raw.multiSessionRun || 0,
    lastSessionSkills: raw.lastSessionSkills ?? null,
    periods: (raw.periods && typeof raw.periods === "object") ? { ...raw.periods } : {},
    /* A state saved before `settled` existed has an unjudged history. Everything
       before the last active day is declared settled, so a returning child is
       not greeted with a stack of windows for days they have forgotten. */
    settled: raw.settled || (raw.lastActive ? prevKey(raw.lastActive) : null),
    showcase: Array.isArray(raw.showcase)
      ? raw.showcase.filter((x) => typeof x === "string").slice(0, 3) : [],
    title: typeof raw.title === "string" ? raw.title : null,
    social: raw.social && typeof raw.social === "object" ? raw.social : null,
    drills: raw.drills && typeof raw.drills === "object" ? { ...raw.drills } : {},
    drillDays: raw.drillDays && typeof raw.drillDays === "object" ? { ...raw.drillDays } : {},
    read: raw.read && typeof raw.read === "object" ? { ...raw.read } : {},
    duels: raw.duels && typeof raw.duels === "object" ? { ...raw.duels } : {},
    diag: raw.diag && typeof raw.diag === "object" && !Array.isArray(raw.diag) ? { ...raw.diag } : {},
    runs: Array.isArray(raw.runs) ? raw.runs.filter((r) => r && typeof r === "object").slice(-40) : [],
    /* Rebuilt field by field: a state saved before the queue existed gets an
       empty one, and nothing of the wrong shape survives a load. */
    review: sanitiseReview(raw.review),
    /* Saved levels (v6.13). A state from before they existed is placed once
       from its skills' XP; from then on the saved levels are used and XP is
       not read again. */
    difficulty: raw.difficulty && typeof raw.difficulty === "object"
      ? cleanLevels(raw.difficulty) : levelsFromXp(raw.skills),
  });
  S.run = 0;

  S.counters = {
    perfectTables: raw.counters?.perfectTables ?? raw.perfectTables ?? 0,
    perfectParses: raw.counters?.perfectParses ?? raw.perfectParses ?? 0,
    meanings: raw.counters?.meanings ?? raw.meanings ?? 0,
  };

  SKILL_IDS.forEach((id) => {
    const s = raw.skills?.[id];
    if (s) S.skills[id] = { xp: s.xp || 0, c: s.c || 0, w: s.w || 0, bestRun: s.bestRun || 0 };
  });

  /* v4 knew only three switches. They are translated onto the skills. */
  if (raw.enabled) Object.assign(S.enabled, raw.enabled);
  else if (raw.unlocked) {
    S.enabled.setningafraedi = !!raw.unlocked.setningafraedi;
    S.enabled.sagnord = raw.unlocked.sagnord !== false;
  }

  S.policy = sanitisePolicy(raw.policy);
  /* The ceiling arrives from the server and is only cached here so that the
     program still obeys it when the network is not there. The server never
     trusts what comes back up — see `PUT /state/:id`. */
  S.allowed = raw.allowed ? sanitisePolicy(raw.allowed) : null;

  if (raw.settings) Object.assign(S.settings, raw.settings);
  if (raw.profile) Object.assign(S.profile, raw.profile);
  S.bestLevel = Math.max(raw.bestLevel || 1, overallLevel(S.xp).level);
  return S;
}

export function newSession(S, today = todayKey()) {
  const skillRun = {};
  SKILL_IDS.forEach((id) => { skillRun[id] = 0; });
  return {
    /* `diff`: each skill's live level, half a step below the saved one, and
       `warm`, `seenAt`, `visitDay` beside it (core/difficulty.js visitLevels).
       `range`: where each level may go, set by the app from the policy. */
    ...visitLevels(S, today), range: null,
    skillRun, wrongRun: 0, sinceTable: 0, sinceMeaning: 0,
    seen: [], badgeAwards: {}, correct: 0, answers: 0, hintFreeRun: 0,
    newWords: 0, worstRun: 0,
    /* "Three wrong IN A ROW" counted per QUESTION: `wrongRun` counts record()
       calls and a table writes one per cell. `missRun` is bumped once per
       question in app.finish(); `worstMiss` is the longest run this session. */
    missRun: 0, worstMiss: 0,
    startedAt: Date.now(),
    /* ---- multi-skill and oddity badges ----
       Everything here is the *shape* of the answers, not their content: which
       skill, how long, how fast. Nothing the child wrote is kept. */
    skillsOk: [],        // skills that have had a correct answer this session
    recentSkills: [],    // the last skills, for counting switches
    recentGenders: [],
    recentCases: [],
    sameWordRun: 0, lastWord: null,
    tableRun: 0, fastRun: 0, accentFreeRun: 0,
    idleDays: idleDaysOf(S),
    /* accidents (v6.1): accepted-with-a-slip answers in a row, and which of
       the four cases each word has been answered in this session */
    slipRun: 0, wordCases: {}, wordCasesBest: 0,
  };
}

/** How many days passed since the last answer — computed when the session
    starts, because `record` updates `lastActive` and destroys the evidence. */
export function idleDaysOf(S, today = todayKey()) {
  if (!S.lastActive) return 0;
  const d = (k) => {
    const [y, m, x] = String(k).split("-").map(Number);
    return Math.floor(Date.UTC(y, (m || 1) - 1, x || 1) / 86400000);
  };
  return Math.max(0, d(today) - d(S.lastActive));
}

/* The day record now also holds `ms` (time at the screen, see core/timing.js)
   and `nw` (new words met that day). Older records have neither and get 0 — the
   charts then simply show nothing for those days rather than lying. */
export const dayRec = (S, key = todayKey()) => {
  const d = (S.days[key] ||= { a: 0, c: 0, xp: 0, ms: 0, nw: 0, sk: {}, g: null, lg: 0 });
  /* The goal in force on this day, stamped on first use and kept up to date
     while the day is still running. See the note in `migrate`. */
  if (key === todayKey()) d.g = S.goal || 10;
  return d;
};

/**
 * A finished day, as the day-end badges see it. A different shape from
 * `badgeContext` on purpose: those badges are about a day, not an answer.
 */
export function daySummary(S, key) {
  const d = S.days[key];
  if (!d) return null;
  return {
    key,
    a: d.a || 0,
    c: d.c || 0,
    xp: d.xp || 0,
    ms: d.ms || 0,
    nw: d.nw || 0,
    sk: d.sk || {},
    goal: d.g ?? (S.goal || 10),
  };
}

/**
 * Judge every day that ended while nobody was looking. Called once at
 * start-up. Returns `[{badge, date}]` — the caller writes them into `S.badges`
 * and shows the windows, dated to the day the condition held. `S.settled`
 * moves to yesterday whether or not anything was won, so a day is never judged
 * twice. There is no process running at midnight; midnight is when a day
 * becomes judgeable, and the judging happens when the child comes back.
 */
export function settleDays(S, today = todayKey(), catalogue = undefined) {
  const yesterday = prevKey(today);
  const from = S.settled;
  const due = Object.keys(S.days || {})
    .filter((k) => k < today && (!from || k > from))
    .sort();
  const won = [];
  for (const key of due) {
    const day = daySummary(S, key);
    const list = catalogue ? checkDayEnd(day, S.badges, catalogue) : checkDayEnd(day, S.badges);
    list.forEach((b) => won.push({ badge: b, date: key }));
  }
  /* Not `due[due.length-1]`: a day with no record at all is also settled, and
     leaving it unsettled would make the scan grow without bound. */
  S.settled = !from || yesterday > from ? yesterday : from;
  return won;
}

/* Three streaks, counted the same way: walk back from today, and let today
 * be skipped if it does not qualify yet — a streak is not broken at breakfast.
 *   dayStreak     consecutive days at the goal
 *   answerStreak  consecutive days with at least one answer
 *   loginStreak   consecutive days the program was opened
 * The last two are deliberately easier than the first (core/badges.js §3). */
function streakBack(S, from, qualifies) {
  const d = new Date(from);
  let n = 0;
  if (!qualifies(S.days[dkey(d)])) d.setDate(d.getDate() - 1);
  while (qualifies(S.days[dkey(d)])) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

/** Consecutive days on which the daily goal was reached. */
export function dayStreak(S, from = new Date()) {
  const goal = S.goal || 10;
  return streakBack(S, from, (d) => d?.a >= goal);
}

/** Consecutive days on which at least one question was answered. */
export function answerStreak(S, from = new Date()) {
  return streakBack(S, from, (d) => (d?.a || 0) >= 1);
}

/**
 * Consecutive days on which the program was opened at all. A day with
 * answers counts as opened, for progress recorded before `lg` existed.
 */
export function loginStreak(S, from = new Date()) {
  return streakBack(S, from, (d) => !!(d && (d.lg || d.a > 0)));
}

/**
 * Record that the program was opened today. Called once at start-up.
 * Returns the day record, so the caller can see whether this was the first
 * visit of the day.
 */
export function noteLogin(S, today = todayKey()) {
  const d = dayRec(S, today);
  const first = !d.lg;
  d.lg = 1;
  S.lastLogin = today;
  return { day: d, first };
}

/* ---------- the two halves of the policy --------------------------------- */

/** What this child has chosen, in the shape core/policy.js expects. */
export const chosenPolicy = (S) => ({
  skills: S.enabled || {},
  types: (S.policy && S.policy.types) || {},
  levels: (S.policy && S.policy.levels) || {},
  attrs: (S.policy && S.policy.attrs) || {},
  safeVocab: null,
});

/** Ceiling AND choice, ready to be asked questions. */
export const effectivePolicy = (S) => createPolicy(S.allowed || null, chosenPolicy(S));

/** Key for per-word stats. Homographs are tracked separately by class. */
export const wordKey = (lemma, cls) => (cls ? `${lemma}|${cls}` : String(lemma));

/**
 * How easy this particular question should be for this particular child.
 * Blends the inflection cell, the word itself and the skill as a whole.
 */
export function easeFor(S, { cell, word, skill }) {
  const buckets = [];
  if (cell && S.cells[cell]) buckets.push(S.cells[cell]);
  if (word && S.words[word]) buckets.push(S.words[word]);
  if (skill && S.skills[skill]) buckets.push(S.skills[skill]);
  return easeOf(buckets);
}

/**
 * Write one answer into the state. Single entry point, so every exercise
 * type updates the same counters in the same way.
 */
export function record(S, sess, {
  skill, cell, word, ok, xp = 0, hinted = false, counts = true, ms = 0, answer = null,
  tally = counts,
}) {
  /* `counts`: the answer is right or wrong for its skill, cell and word.
     `tally`: it is one ANSWER — the day's count, the run, the session. A table
     records each cell with tally:false and is tallied once (`tallyAnswer`),
     so a 10-cell table is one answer, not ten (v6.10). */
  const day = dayRec(S);
  day.sk ||= {};
  if (ms > 0) day.ms = (day.ms || 0) + ms;
  if (tally) { day.a++; if (ok) day.c++; }
  day.xp += xp;
  S.xp += xp;
  S.lastActive = todayKey();

  if (tally) { S.totalAnswers++; if (ok) S.totalCorrect++; }

  if (cell) { const c = (S.cells[cell] ||= { c: 0, w: 0 }); ok ? c.c++ : c.w++; }
  if (word) {
    if (!S.words[word]) {
      sess.newWords = (sess.newWords || 0) + 1;
      day.nw = (day.nw || 0) + 1;
    }
    const w = (S.words[word] ||= { c: 0, w: 0 });
    ok ? w.c++ : w.w++;
    /* The last dozen outcomes (`h`), so a word is judged on how it is going
       now rather than on its whole life (core/wordhealth.js). An answer that
       does not count — the meaning question — is not an outcome. */
    if (counts) pushHistory(w, ok);
  }

  /* The multi-skill badges need to know which skills have had a *correct*
     answer, in the session and on the day record. Counted here, at the one place
     every answer passes through, so a new task type does not have to
     remember. */
  if (skill && ok) {
    day.sk[skill] = (day.sk[skill] || 0) + 1;
    if (!sess.skillsOk.includes(skill)) sess.skillsOk.push(skill);
    /* Rotation run: how far back one can go without the same skill appearing
       twice. This is the figure the `rotate*` badges read. */
    sess.recentSkills = [...(sess.recentSkills || []), skill].slice(-24);
    if (word) {
      const g = String(word).split("|")[1];
      if (["kk", "kvk", "hk"].includes(g))
        sess.recentGenders = [...(sess.recentGenders || []), g].slice(-6);
    }
    const cs = /^(NF|ÞGF|ÞF|EF)/.exec(String(cell || ""));
    if (cs) sess.recentCases = [...(sess.recentCases || []), cs[1]].slice(-8);
    sess.sameWordRun = word && word === sess.lastWord ? (sess.sameWordRun || 0) + 1 : 1;
    sess.lastWord = word || null;
    sess.fastRun = ms > 0 && ms < 5000 ? (sess.fastRun || 0) + 1 : 0;
    sess.accentFreeRun = answer && answer.plain
      ? (sess.accentFreeRun || 0) + 1 : 0;
  } else if (skill && !ok) {
    sess.sameWordRun = 0; sess.fastRun = 0; sess.accentFreeRun = 0;
    sess.recentSkills = []; sess.recentGenders = []; sess.recentCases = [];
    sess.tableRun = 0;
  }

  if (skill) {
    const s = (S.skills[skill] ||= { xp: 0, c: 0, w: 0, bestRun: 0 });
    s.xp += xp;
    if (counts) { ok ? s.c++ : s.w++; }
    if (!counts || !tally) { /* vocabulary does not count right or wrong */ }
    else if (ok) {
      sess.skillRun[skill] = (sess.skillRun[skill] || 0) + 1;
      s.bestRun = Math.max(s.bestRun || 0, sess.skillRun[skill]);
    } else sess.skillRun[skill] = 0;
  }

  if (tally) {
    sess.answers++;
    if (ok) {
      S.run++; sess.correct++; sess.wrongRun = 0;
      S.bestRun = Math.max(S.bestRun, S.run);
      sess.hintFreeRun = hinted ? 0 : sess.hintFreeRun + 1;
    } else {
      S.run = 0; sess.wrongRun++; sess.hintFreeRun = 0;
      sess.worstRun = Math.max(sess.worstRun || 0, sess.wrongRun);
    }
  }

  S.bestLevel = Math.max(S.bestLevel || 1, overallLevel(S.xp).level);
  return S;
}

/**
 * One answer made of several recorded parts (a table): the day's count, the
 * total, the run and the per-skill run, once. Nothing else — the parts were
 * recorded with `tally: false`.
 */
export function tallyAnswer(S, sess, { skill, ok, hinted = false }) {
  const day = dayRec(S);
  day.a++; if (ok) day.c++;
  S.totalAnswers++; if (ok) S.totalCorrect++;
  if (skill) {
    const s = (S.skills[skill] ||= { xp: 0, c: 0, w: 0, bestRun: 0 });
    if (ok) {
      sess.skillRun[skill] = (sess.skillRun[skill] || 0) + 1;
      s.bestRun = Math.max(s.bestRun || 0, sess.skillRun[skill]);
    } else sess.skillRun[skill] = 0;
  }
  sess.answers++;
  if (ok) {
    S.run++; sess.correct++; sess.wrongRun = 0;
    S.bestRun = Math.max(S.bestRun, S.run);
    sess.hintFreeRun = hinted ? 0 : sess.hintFreeRun + 1;
  } else {
    S.run = 0; sess.wrongRun++; sess.hintFreeRun = 0;
    sess.worstRun = Math.max(sess.worstRun || 0, sess.wrongRun);
  }
  return S;
}

/**
 * XP that is not an answer's: the reward for a rescue drill. Goes on today's
 * record like any other XP, so the week, the level and the server's
 * plausibility limits all see it.
 */
export function grantXp(S, xp) {
  const n = Math.max(0, Math.round(xp || 0));
  if (!n) return 0;
  const day = dayRec(S);
  day.xp += n;
  S.xp += n;
  S.bestLevel = Math.max(S.bestLevel || 1, overallLevel(S.xp).level);
  return n;
}

/**
 * One QUESTION has ended. Returns whether it was a comeback (a correct answer
 * after three or more wrong questions in a row). Called exactly once per
 * question from app.finish(); `verdict` is true, false, or null for a question
 * with no right answer (the meaning question), which neither breaks nor
 * lengthens a run of misses.
 */
export function noteQuestion(sess, verdict) {
  if (verdict === true) {
    const comeback = (sess.missRun || 0) >= 3;
    sess.missRun = 0;
    return comeback;
  }
  if (verdict === false) {
    sess.missRun = (sess.missRun || 0) + 1;
    sess.worstMiss = Math.max(sess.worstMiss || 0, sess.missRun);
  }
  return false;
}

/** The shape of an answer — its length and letters, not its text. The oddity
    badges read this. Nothing the child wrote is ever kept or sent. */
export function answerShape(text) {
  const t = String(text || "").trim().toLowerCase();
  const letters = t.replace(/[^\p{L}]/gu, "");
  const vowels = new Set(letters.match(/[aáeéiíoóuúyýæö]/g) || []);
  return {
    len: letters.length,
    words: t.split(/\s+/).filter(Boolean).length,
    vowels: vowels.size,
    thorns: (letters.match(/[þð]/g) || []).length,
    plain: !/[áéíóúýö]/.test(letters),
    palindrome: letters.length >= 4 &&
      letters === [...letters].reverse().join(""),
  };
}

/** The longest tail of the list in which no item appears twice. */
export function distinctTail(list) {
  const seen = new Set();
  let n = 0;
  for (let i = (list || []).length - 1; i >= 0; i--) {
    if (seen.has(list[i])) break;
    seen.add(list[i]);
    n++;
  }
  return n;
}

/** Consecutive days back from today on which *every* enabled skill was
    answered. */
export function allSkillsStreak(S, from = new Date()) {
  const want = SKILL_IDS.filter((id) => S.enabled[id] !== false);
  if (!want.length) return 0;
  const full = (key) => {
    const sk = (S.days[key] || {}).sk || {};
    return want.every((id) => sk[id] > 0);
  };
  const d = new Date(from);
  let n = 0;
  if (!full(dkey(d))) d.setDate(d.getDate() - 1);
  while (full(dkey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

/**
 * Context object handed to the badge tests after every answer.
 * `now` exists so the tests can fix the date; the program never passes it.
 */
export function badgeContext(S, sess, extra = {}, now = new Date()) {
  const day = S.days[dkey(now)] || { a: 0, c: 0, sk: {} };
  const skillCorrect = {}, skillLevels = {};
  SKILL_IDS.forEach((id) => {
    skillCorrect[id] = (S.skills[id] || {}).c || 0;
    skillLevels[id] = skillLevel((S.skills[id] || {}).xp || 0).level;
  });
  return {
    /* Which skill just answered — badges tied to a skill look at this, so a
       noun badge does not fire when a verb is conjugated. */
    skill: null,
    run: S.run,
    skillRun: sess.skillRun,
    dayStreak: dayStreak(S, now),
    answerStreak: answerStreak(S, now),
    loginStreak: loginStreak(S, now),
    dayAnswers: day.a,
    dayCorrect: day.c,
    newGoalDay: day.a === S.goal,
    totalCorrect: S.totalCorrect,
    skillCorrect,
    skillLevel: skillLevels,
    level: overallLevel(S.xp).level,
    sessionCorrect: sess.correct,
    sessionNewWords: sess.newWords || 0,
    hintFreeRun: sess.hintFreeRun,
    /* Five wrong ANSWERS in a row, not five wrong cells and not five wrong
       answers scattered through the session — the same correction as
       `comeback`. See the note on `missRun` in `newSession`. */
    wasStruggling: (sess.worstMiss || 0) >= 5,
    time: timeContext(now),
    collection: { total: 0, rare: 0, mastered: 0, byClass: {}, coverage: {},
                  fl: 0, classesTouched: 0, everyWord: false },
    perfectTable: false, perfectParse: false, hardWin: false,
    comeback: false, usedHelpers: false,

    /* ---- multi-skill ---- */
    goal: S.goal || 10,
    enabledSkills: SKILL_IDS.filter((id) => S.enabled[id] !== false),
    sessionSkills: (sess.skillsOk || []).length,
    daySkills: Object.keys(day.sk || {}).length,
    allSkillsDay: (() => {
      const want = SKILL_IDS.filter((id) => S.enabled[id] !== false);
      return want.length > 0 && want.every((id) => (day.sk || {})[id] > 0);
    })(),
    allSkillsSession: (() => {
      const want = SKILL_IDS.filter((id) => S.enabled[id] !== false);
      return want.length > 0 && want.every((id) => (sess.skillsOk || []).includes(id));
    })(),
    allSkillsStreak: allSkillsStreak(S, now),
    rotation: distinctTail(sess.recentSkills),
    multiSessionRun: S.multiSessionRun || 0,

    /* ---- oddity badges ---- */
    answer: null,
    answerMs: 0,
    accentFreeRun: sess.accentFreeRun || 0,
    sameWordRun: sess.sameWordRun || 0,
    genderRun: distinctTail(sess.recentGenders),
    caseRun: distinctTail(sess.recentCases),
    tableRun: sess.tableRun || 0,
    fastRun: sess.fastRun || 0,
    idleDays: sess.idleDays || 0,
    foundRareWord: false,
    /* ---- accidents (v6.1); the last four are filled in by app.finish() ---- */
    xp: S.xp || 0,
    slipRun: sess.slipRun || 0,
    wordCases: sess.wordCasesBest || 0,
    correct: null, pickChanges: 0, goldfish: false,
    social: null,
    allOtherBadges: false,
    ...extra,
  };
}
