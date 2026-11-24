// @ts-check
/* Word knowledge: one history per word (issue #8, docs/DLD-PLAN.md §1).
 *
 * Everything the program knows about how one pupil stands with each word
 * (CONTEXT.md "Word knowledge") is worked out from one list per word: its
 * WORD ENTRIES. One entry says that the pupil answered one question about the
 * word on one day: which question type, and right, wrong or seen-not-judged.
 *
 * This module is the one place that writes them and the place every reader
 * of a word's state goes through (#42). Besides the entries it owns the two
 * older per-word records, unchanged in shape, and is the only module that
 * touches them in the saved state:
 *
 *   the word records   per word, right and wrong answers counted record by
 *                      record (a table counts every box) and the last dozen
 *                      outcomes `h` — what word health, the collection, the
 *                      ease and word choice read today
 *   the rescue ledger  per word, the rescue drills run on it, and the rescues
 *                      per day
 *
 * Every other module reads them through the functions under "the word
 * records" below (`wordRecord`, `wordRecords`, `wordKeysMet`, `drillRecord`,
 * `drillRecords`, `rescuesOn`) and writes them through `countAnswer` and
 * `noteRescue`; core/merge.js and server/guard.mjs merge and check them
 * through this module's slices. #42 moved the readers here without changing
 * what any of them computes (decision 11: a pure move;
 * tests/wordknowledge-readers.test.js). Word choice behind the view is #45;
 * the rules built on the entries are #10 (learned words), #12 (hard words),
 * #17 and through them #13 and #16; the size warning is #44.
 *
 * Pure: no DOM, no clock — the day is handed in. Nothing the pupil typed is
 * kept, only the type id, the day and the outcome (decision 10).
 *
 * ---- the saved shape -----------------------------------------------------
 *
 *   S.wordKnowledge = {
 *     "hestur|kk": {                   a word: `wordKey(lemma, class)`
 *       c: 12,                         right answers, all time
 *       w: 3,                          wrong answers, all time
 *       e: [ entry, … ],               oldest first; ENTRIES_MAX of them
 *     }, …
 *   }
 *
 *   entry  [day, type, outcome]        a tuple, to keep the file small
 *          day      "2026-11-24", the pupil's local day (core/state.js todayKey)
 *          type     the question type id from the catalogue ("fill", "meaning" …)
 *          outcome  "r" right · "w" wrong · "s" seen, not judged
 *
 * `c` and `w` equal the "r" and "w" entries while every entry is kept; they
 * are stored apart so that the totals survive if ENTRIES_MAX ever drops the
 * oldest entries. A "seen" entry counts in neither.
 *
 * ---- how big it gets, and the one limit (#44, docs/adr/0001) ------------
 *
 *   ENTRIES_MAX   the most entries one word keeps. It is Infinity: every
 *                 entry is kept. A limit is a one-line change here (the oldest
 *                 entries of a word go first, `c` and `w` keep the totals).
 *
 * An entry is about 29 bytes in the saved file (`["2026-11-24","fill","r"]`
 * with its comma). A typical pupil: ≈220 KB of word knowledge per school
 * year (docs/adr/0001), ≈7 MB a year for 30 pupils. The server refuses any one pupil's progress over
 * MAX_STATE_BYTES, 2 MB (server/guard.mjs), so saving would fail for a pupil
 * whose whole file reaches it.
 *
 * A heavy year — 150 questions a day for 180 days, 27 000 answers — measured
 * with tests/progress-size.test.js (tools/sim, the real answer path): the
 * whole progress file is 943 KB, 45% of the limit, of which word knowledge
 * is 670 KB; it grows about 5 KB a day. Such a pupil reaches the limit in
 * roughly two years, a typical pupil in many more. The test fails when a
 * heavy year comes within 50% of the limit, and /health and /heilsa report
 * the largest progress file and its share of the limit (`progress`), so the
 * owner sees it coming long before saving fails.
 *
 * What to do when the share nears 0.5: lower ENTRIES_MAX, which changes
 * nothing else in the file's shape — but first check what the rules built on
 * the entries need (#10, #12, #17) and that tests/wordknowledge*.test.js
 * still agree.
 *
 * ---- the decisions (owner, 2026-11-24), and how they are kept ------------
 *
 *  1. ONE HISTORY PER WORD, keyed by `wordKey` ("lemma|class") as `S.words`
 *     is: the same lemma in another class is another word (CONTEXT.md).
 *
 *  2. ONE ENTRY PER QUESTION PER WORD, by the verdict the pupil sees. A
 *     10-box inflection table is one entry, right only if the table was.
 *
 *  3. SEVERAL WORDS IN ONE QUESTION (Villuveiðar, Setningasmiðja, Umritun):
 *     every word the pupil answered about on its own gets its own entry,
 *     read from the `record` effects core/answer.js already produces —
 *     still once per word per question. A word's outcome is then its own
 *     records: right if every record about it was right (an error put
 *     right in a hunt), wrong otherwise. A question whose records name ONE
 *     word takes the question's verdict (a table with a wrong box is a
 *     wrong entry even though nine boxes were right). See `entriesFor`.
 *
 *  4. RECALL is not stored: the entry keeps the type id, and whether that
 *     type is recall is looked up in the catalogue (core/catalogue.js
 *     `recall`, CONTEXT.md "Recall") when a rule needs it: `isRecallEntry`.
 *     A type that changes its mind changes every entry with it.
 *
 *  5. EVERY ENTRY IS KEPT (docs/adr/0001). The cap is one constant,
 *     ENTRIES_MAX, and it is Infinity. If it is ever lowered, the oldest
 *     entries of a word go first and the totals stay.
 *
 *  6. RESET ON UPGRADE. Saved progress older than RESET_BEFORE (the
 *     STATE_VERSION this module arrived in, core/slices.js) starts word
 *     knowledge empty, and `S.words` loses its short history `h` (see
 *     `wordsSlice` at the end of this file), so both start on the same day. XP,
 *     badges, levels and everything else are kept.
 *
 *  7. WHAT COUNTS. Duels and live rounds count: an answer is an answer.
 *     Only a FIRST try is an entry; a second try (core/answer.js
 *     `judgeRetry`) is not a new one, and neither is the bonus sentence
 *     under a meaning question (both settle with `finish: null`). The
 *     meaning question (ok: null) is "seen, not judged", and so is any
 *     answer judged neither right nor wrong: it never counts toward learned
 *     or hard, nor in `c`/`w`.
 *
 *  8. ONE PLACE RECORDS: core/answer.js `settle` calls `noteWords` once per
 *     answered question, after the effects are written. Builders stay pure;
 *     a new question type is recorded without remembering to.
 *
 *  9. THE SLICE (core/slices.js, issue #49): `wordKnowledgeSlice` below —
 *     blank, migrate, merge, clean, `ownText: false`. tests/slices.test.js
 *     holds it with the rest.
 *
 * 10. PRIVACY: no text the pupil typed. The history goes out with the
 *     pupil's own export and is erased with the account (it is part of the
 *     progress file); docs/PRIVACY.md names it. Teachers and guardians see
 *     nothing new.
 *
 * 11. PURE MOVE: a pupil sees no difference (tools/task-snapshot.mjs).
 *
 * ---- two devices ---------------------------------------------------------
 *
 * An entry is never changed once written, so a word's list only grows. The
 * merge adds what this device wrote since `base` to what the server has:
 * entries are compared as a multiset (the same day, type and outcome twice
 * is two answers). This device's new entries go after the server's entries
 * of the same day and before any later day; within one device the order is
 * the order of answering. With no common past (`base` missing) the two
 * lists are put together without counting twice what both hold.
 */

import { CATALOGUE_IDS, isRecall } from "./catalogue.js";
import { add, num, obj, n, DAY, keys, later, counters, dayStr, isObj, pairs } from "./slicerules.js";

/** @typedef {import("../types").State} State */
/** @typedef {import("../types").Task} Task */
/** @typedef {import("../types").Judgement} Judgement */
/** @typedef {import("../types").DayKey} DayKey */
/** @typedef {import("../types").WordEntry} WordEntry */
/** @typedef {import("../types").WordHistory} WordHistory */
/** @typedef {import("../types").WordKnowledge} WordKnowledge */
/** @typedef {import("../types").WordStat} WordStat */
/** @typedef {import("../types").DrillRecord} DrillRecord */
/** @typedef {import("../types").Slice} Slice */

/* ---------- the constants ---------------------------------------------------- */

/** The outcome of an entry. */
export const RIGHT = "r";
export const WRONG = "w";
/** Seen, not judged: the meaning question, or an answer nobody could judge. */
export const SEEN = "s";
const OUTCOMES = new Set([RIGHT, WRONG, SEEN]);

/** The most entries a word keeps (decision 5, docs/adr/0001): every one.
    The numbers behind that, and the size warning, are in the header (#44). */
export const ENTRIES_MAX = Infinity;

/** Saved progress older than this STATE_VERSION starts word knowledge empty
    and `S.words` without its short history (decision 6). core/slices.js
    STATE_VERSION is at least this; tests/wordknowledge.test.js holds it. */
export const RESET_BEFORE = 12;

/** The most words the server keeps, here and in the word records. */
export const WORDS_MAX = 30000;

/** How many outcomes a word record remembers (`h`), for word health
    (core/wordhealth.js `HEALTH.keep`). */
export const RECENT_KEEP = 12;

/* ---------- writing ------------------------------------------------------- */

/**
 * The entries one judged answer makes: one per word, with its outcome.
 * Pure; reads the task and the judgement only. Empty for a result that is
 * not an answer to a question (pending, a second try, the bonus sentence).
 *
 * @param {Task} task
 * @param {Pick<Judgement, "ok"|"effects"|"finish"> & {retry?: boolean, pending?: boolean}} j
 * @returns {{word: string, type: string, outcome: string}[]}
 */
export function entriesFor(task, j) {
  if (!task || !j || j.pending || j.retry || !j.finish) return [];
  const type = task.typeId || task.type;
  if (!type) return [];
  /* The words the answer was recorded about, each with its records' verdicts. */
  /** @type {Map<string, boolean[]>} */
  const words = new Map();
  for (const e of j.effects || []) {
    if (!e || e.do !== "record" || !e.word) continue;
    const list = words.get(e.word) || [];
    list.push(e.ok !== false);
    words.set(e.word, list);
  }
  const out = [];
  for (const [word, oks] of words) {
    const outcome = j.ok === null || j.ok === undefined ? SEEN
      /* One word: the verdict the pupil sees (a table is right only whole). */
      : words.size === 1 ? (j.ok ? RIGHT : WRONG)
      /* Several: each word by its own records. */
      : oks.every(Boolean) ? RIGHT : WRONG;
    out.push({ word, type, outcome });
  }
  return out;
}

/** The word's history, made if it is not there. */
function historyIn(S, word) {
  if (!S.wordKnowledge || typeof S.wordKnowledge !== "object" || Array.isArray(S.wordKnowledge))
    S.wordKnowledge = {};
  const h = S.wordKnowledge[word];
  if (h && Array.isArray(h.e)) return h;
  return (S.wordKnowledge[word] = { c: 0, w: 0, e: [] });
}

/**
 * Write one answered question into word knowledge: an entry per word it was
 * about (decisions 2, 3 and 7). Called by core/answer.js `settle` and nowhere
 * else (decision 8). Changes `S.wordKnowledge`.
 *
 * @param {State} S
 * @param {Task} task
 * @param {Pick<Judgement, "ok"|"effects"|"finish"> & {retry?: boolean, pending?: boolean}} j
 * @param {DayKey} today  the pupil's day (core/state.js `todayKey`)
 * @returns {{word: string, type: string, outcome: string}[]} the entries written
 */
export function noteWords(S, task, j, today) {
  const made = entriesFor(task, j);
  if (!made.length || !DAY.test(String(today))) return [];
  for (const { word, type, outcome } of made) {
    const h = historyIn(S, word);
    h.e.push([today, type, outcome]);
    if (outcome === RIGHT) h.c = num(h.c) + 1;
    else if (outcome === WRONG) h.w = num(h.w) + 1;
    if (h.e.length > ENTRIES_MAX) h.e.splice(0, h.e.length - ENTRIES_MAX);
  }
  return made;
}

/* ---------- reading ------------------------------------------------------- */

/** @type {(S: any) => Record<string, any>} */
const bookOf = (S) => obj(S && S.wordKnowledge);

/**
 * One word's entries, oldest first, as objects. A fresh array every call:
 * changing it changes nothing saved.
 * @param {State} S @param {string} word  a `wordKey`
 * @returns {WordEntry[]}
 */
export function entriesOf(S, word) {
  const h = bookOf(S)[word];
  return h && Array.isArray(h.e) ? h.e.map(([day, type, outcome]) => ({ day, type, outcome })) : [];
}

/** A word's all-time right and wrong answers ({c: 0, w: 0} for a word never
    answered). @param {State} S @param {string} word @returns {{c: number, w: number}} */
export function totalsOf(S, word) {
  const h = bookOf(S)[word];
  return { c: num(h && h.c), w: num(h && h.w) };
}

/** Every word with a history. @param {State} S @returns {string[]} */
export const wordsWithHistory = (S) => Object.keys(bookOf(S));

/** Was this entry an answer to a recall question (decision 4)? Read from the
    catalogue, never stored. @param {WordEntry} entry */
export const isRecallEntry = (entry) => !!entry && isRecall(entry.type);

/** Does this entry count toward learned or hard? "Seen" never does (decision 7). */
export const isJudged = (entry) => !!entry && (entry.outcome === RIGHT || entry.outcome === WRONG);

/* ---------- statuses, each with its reason (#43) --------------------------
 *
 * Every status the program gives a word comes with the reason for it, in
 * plain Icelandic that a teacher or a parent can read, as core/spacing.js
 * `eligible` gives its yes or no:
 *
 *   { status: "shaky", why: "3 af síðustu 7 rétt, undir 50%" }
 *
 * A reason names the numbers the rule looked at and, where they decided it,
 * the line they were held to — taken from the rule's own constants, so the
 * reason cannot drift from the rule.
 *
 *   word health   new · weak · shaky · ok · strong: core/wordhealth.js
 *                 `statusOf`, from the word records, not the entries, on
 *                 purpose (#42, decision 1)
 *   later         in learning (#12), learned (#16) and hard (#17) live in
 *                 this section and return the same shape, built with the
 *                 helpers below, e.g. `because("learned", "rétt í 4 gerðum
 *                 (1 upprifjun) á 3 dögum, síðustu 3 rétt")`
 *
 * `node tools/word-history.mjs <progress.json> <word>` prints a word's
 * entries with its status and reason (README, "Why does the app think that
 * about a word?").                                                        */

/** @typedef {import("../types").WordStatus} WordStatus */

/** A status with its reason. @param {string} status @param {string} why
    @returns {WordStatus} */
export const because = (status, why) => ({ status, why });

/** A share as a whole percent, rounded DOWN, so that a reason never shows a
    share on the other side of the line it was held to (19.9% is "19%", not
    "20%" beside "undir 20%"). @param {number} x */
export const percent = (x) => Math.floor(x * 100 + 1e-9);

/** "1 svar", "2 svör", "21 svar". @param {number} k */
export const answersText = (k) => `${k} ${k % 10 === 1 && k % 100 !== 11 ? "svar" : "svör"}`;

/** "3 af síðustu 7 rétt". @param {number} right @param {number} of */
export const lastRightText = (right, of) => `${right} af síðustu ${of} rétt`;

/* ---------- the word records and the rescue ledger (#42) ------------------
 *
 * Saved as `words`, `drills` and `drillDays` (their slices are at the end of
 * the file), in the shapes they have had since v6.6. The readers hand back
 * the saved record itself, as the modules that read them always had it: a
 * reader must not change it. */

/** @type {(S: any) => Record<string, WordStat>} */
const recordsOf = (S) => (S && S.words) || {};
/** @type {(S: any) => Record<string, DrillRecord>} */
const ledgerOf = (S) => (S && S.drills) || {};

/** A word's record {c, w, h}, or undefined for a word never answered.
    @param {State} S @param {string} word  a `wordKey` @returns {WordStat | undefined} */
export const wordRecord = (S, word) => recordsOf(S)[word];

/** Every word record, as [word, record] pairs in the saved order.
    @param {State} S @returns {[string, WordStat][]} */
export const wordRecords = (S) => Object.entries(recordsOf(S));

/** Every word with a record: the words this pupil has met.
    @param {State} S @returns {string[]} */
export const wordKeysMet = (S) => Object.keys(recordsOf(S));

/** Append one outcome to a word record's short history. Changes `rec`.
    @param {Partial<WordStat>} rec @param {boolean} ok */
export function pushHistory(rec, ok) {
  rec.h = ((rec.h || "") + (ok ? "1" : "0")).slice(-RECENT_KEEP);
  return rec;
}

/**
 * Count one record of an answer (core/state.js `record`): right or wrong for
 * the word, and — when it `counts` — one more outcome in its short history
 * (the meaning question is not an outcome). Changes the word records.
 * @param {State} S @param {string} word @param {boolean} ok @param {boolean} counts
 * @returns {boolean} whether this was the first record of the word
 */
export function countAnswer(S, word, ok, counts) {
  const words = recordsOf(S);
  const first = !words[word];
  const w = (words[word] ||= { c: 0, w: 0 });
  if (ok) w.c++; else w.w++;
  if (counts) pushHistory(w, ok);
  return first;
}

/** A word's rescue record {p, t, f, last, at}, or undefined for a word
    never drilled. @param {State} S @param {string} word @returns {DrillRecord | undefined} */
export const drillRecord = (S, word) => ledgerOf(S)[word];

/** Every rescue record, as [word, record] pairs.
    @param {State} S @returns {[string, DrillRecord][]} */
export const drillRecords = (S) => Object.entries(ledgerOf(S));

/** Words rescued on one day (only the last fortnight is kept).
    @param {State} S @param {DayKey} day @returns {number} */
export const rescuesOn = (S, day) => ((S && S.drillDays) || {})[day] || 0;

/**
 * Write a finished rescue drill into the ledger (core/wordhealth.js
 * `settleDrill`): one more drill on the word, passed or endured, the day, and
 * the word's answer count at its end; a pass also counts on the day.
 * @param {State} S @param {string} word
 * @param {{passed: boolean, at: number, today: DayKey}} drill
 */
export function noteRescue(S, word, { passed, at, today }) {
  const drills = (S.drills ||= {});
  const rec = (drills[word] ||= { p: 0, t: 0, f: 0, last: null, at: 0 });
  rec.t++;
  if (passed) rec.p++; else rec.f++;
  rec.last = today;
  rec.at = at;
  if (passed) {
    const day = (S.drillDays ||= {});
    day[today] = (day[today] || 0) + 1;
    /* Only the last fortnight is kept; the badge asks about one day. */
    for (const k of Object.keys(day)) if (k < daysBefore(today, 14)) delete day[k];
  }
}

/** @param {string} key @param {number} n */
function daysBefore(key, n) {
  const [y, m, d] = String(key).split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d - n));
  return t.toISOString().slice(0, 10);
}

/* ---------- what may be saved -------------------------------------------- */

const TYPE_RE = /^[a-z][a-z0-9_]{0,23}$/;
const isEntry = (x) => Array.isArray(x) && x.length === 3 && typeof x[0] === "string" && DAY.test(x[0]) &&
  typeof x[1] === "string" && TYPE_RE.test(x[1]) && OUTCOMES.has(x[2]);

/** A word key as the program makes it: 1–80 characters. */
const isWordKey = (k) => typeof k === "string" && k.length > 0 && k.length <= 80;

/**
 * Word knowledge rebuilt entry by entry out of whatever was saved: an old
 * copy, a hand-edited file or a hostile upload ends as the right shape.
 * What is not an entry is dropped; the totals are never below what the kept
 * entries show. Never throws.
 * @param {any} raw @returns {WordKnowledge}
 */
export function sanitiseWordKnowledge(raw) {
  /** @type {WordKnowledge} */
  const out = {};
  for (const [k, v] of Object.entries(obj(raw))) {
    if (!isWordKey(k) || !v || typeof v !== "object" || Array.isArray(v)) continue;
    const e = (Array.isArray(v.e) ? v.e : []).filter(isEntry).map((x) => [x[0], x[1], x[2]]);
    if (e.length > ENTRIES_MAX) e.splice(0, e.length - ENTRIES_MAX);
    const rights = e.filter((x) => x[2] === RIGHT).length;
    const wrongs = e.filter((x) => x[2] === WRONG).length;
    out[k] = { c: Math.max(n(v.c), rights), w: Math.max(n(v.w), wrongs), e };
  }
  return out;
}

/* ---------- two devices (see the top of the file) ------------------------- */

const tag = (x) => `${x[0]}\t${x[1]}\t${x[2]}`;

/** The entries of `l` that are not in `b`, as a multiset, in `l`'s order. */
function since(b, l) {
  const left = new Map();
  for (const x of b) left.set(tag(x), (left.get(tag(x)) || 0) + 1);
  const out = [];
  for (const x of l) {
    const t = tag(x), k = left.get(t) || 0;
    if (k > 0) left.set(t, k - 1); else out.push(x);
  }
  return out;
}

/** `r` with `extra` put in: each after the last entry of its day or before. */
function insertByDay(r, extra) {
  const out = r.map((x) => [...x]);
  for (const x of extra) {
    let at = out.length;
    while (at > 0 && out[at - 1][0] > x[0]) at--;
    out.splice(at, 0, [...x]);
  }
  return out;
}

/** One word, three ways. `b` undefined: no common past. */
function mergeWord(b, l, r) {
  if (!l) return r;
  if (!r) return l;
  if (!b) {
    /* No common past: what both hold is one history, not two. */
    const extra = since(r.e, l.e);
    const e = insertByDay(r.e, extra);
    const count = (o) => e.filter((x) => x[2] === o).length;
    return { c: Math.max(l.c, r.c, count(RIGHT)), w: Math.max(l.w, r.w, count(WRONG)), e };
  }
  const e = insertByDay(r.e, since(b.e, l.e));
  if (e.length > ENTRIES_MAX) e.splice(0, e.length - ENTRIES_MAX);
  return { c: add(b.c, l.c, r.c), w: add(b.w, l.w, r.w), e };
}

/**
 * The three-way merge of core/merge.js for word knowledge: `base` what this
 * device and the server last agreed on (or undefined), `local` this device,
 * `remote` the server. Nothing written on either side since `base` is lost;
 * nothing is counted twice. Pure.
 * @returns {WordKnowledge}
 */
export function mergeWordKnowledge(base, local, remote) {
  const hasBase = !!base && typeof base === "object";
  const B = sanitiseWordKnowledge(base), L = sanitiseWordKnowledge(local), R = sanitiseWordKnowledge(remote);
  /** @type {WordKnowledge} */
  const out = {};
  for (const k of new Set([...Object.keys(R), ...Object.keys(L)])) {
    /* A word the base had not yet: everything on this device is new since. */
    const b = hasBase ? (B[k] || { c: 0, w: 0, e: [] }) : undefined;
    out[k] = mergeWord(b, L[k], R[k]);
  }
  return out;
}

/* ---------- the slice ------------------------------------------------------ */

const KNOWN_TYPES = new Set(CATALOGUE_IDS);

/**
 * The server's check (server/guard.mjs `cleanState`): rebuilt by the same
 * function the browser loads with, then held to the program and the
 * calendar — no entry after tomorrow (`ctx.limit`), no question type the
 * catalogue does not have, at most WORDS_MAX words. Drops, never rejects.
 * The size of the whole file is bounded by the server's ceiling on a
 * pupil's progress (docs/adr/0001; the early warning is #44).
 * @param {any} value @param {import("../types").CleanContext} ctx
 * @returns {WordKnowledge}
 */
export function cleanWordKnowledge(value, { limit }) {
  const all = sanitiseWordKnowledge(value);
  /** @type {WordKnowledge} */
  const out = {};
  for (const [k, h] of Object.entries(all).slice(0, WORDS_MAX)) {
    const e = h.e.filter((x) => x[0] <= limit && KNOWN_TYPES.has(x[1]));
    out[k] = { c: h.c, w: h.w, e };
  }
  return out;
}

/** `S.wordKnowledge`. Nothing the pupil typed (decision 10).
    @type {import("../types").Slice<WordKnowledge>} */
export const wordKnowledgeSlice = {
  key: "wordKnowledge",
  blank: () => ({}),
  /* Older than RESET_BEFORE: empty (decision 6). Otherwise rebuilt entry by
     entry: nothing of the wrong shape survives a load. */
  migrate: (raw, whole) =>
    (num(obj(whole).v) < RESET_BEFORE ? {} : sanitiseWordKnowledge(raw)),
  merge: (base, local, remote) => mergeWordKnowledge(base, local, remote),
  clean: cleanWordKnowledge,
  ownText: false,
};

/* ---------- the slices of the word records (issues #50, #42) ---------------
 * The word records and the rescue ledger as slices of the saved state
 * (core/slices.js), so core/merge.js and server/guard.mjs merge and check
 * them through this module. Moved here unchanged from core/wordhealth.js
 * (#42), where #50 had put them. */

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

/* Issue #8, decision 6: progress saved before word knowledge
   (core/wordknowledge.js) existed loses each word's short history `h`, so
   that word health and word knowledge start on the same day. The counts
   `c`/`w` stay: they are the collection, the ease and the leaderboard's
   Orðaforði. */
function withoutHistory(words) {
  const out = {};
  for (const [k, v] of Object.entries(words)) {
    if (v && typeof v === "object" && !Array.isArray(v)) { const { h: _, ...rest } = v; out[k] = rest; }
    else out[k] = v;
  }
  return out;
}

/** The word records, saved as `words`: per word key ("hestur|kk") right, wrong and the last dozen
    outcomes, {c, w, h}. @type {Slice} */
export const wordsSlice = {
  key: "words",
  blank: () => ({}),
  migrate: (raw, whole) => (num(obj(whole).v) < RESET_BEFORE
    ? withoutHistory(cleanWordKeys(raw)) : cleanWordKeys(raw)),
  merge(B, L, R) {
    const out = {};
    for (const k of keys(L, R)) {
      const l = obj(L)[k], r = obj(R)[k];
      out[k] = !l ? r : !r && !obj(B)[k] ? l : counters(obj(B)[k], l, r, ["c", "w"]);
      /* A word's last dozen outcomes (`h`) follow whichever device answered it
         since `base`; a device that did not touch the word must not put its
         older history over the other's (found by tests/state-property.test.js). */
      const b = obj(B)[k];
      if (l && r && b && typeof r.h === "string"
          && num(l.c) + num(l.w) === num(b.c) + num(b.w)) out[k].h = r.h;
    }
    return out;
  },
  clean(value) {
    const out = {};
    for (const [k, v] of pairs(value, WORDS_MAX)) {
      if (!isObj(v)) continue;
      out[k] = { c: n(v.c), w: n(v.w) };
      /* A word's last dozen outcomes (v6.6): ones and zeros and nothing else. */
      if (typeof v.h === "string" && /^[01]{1,12}$/.test(v.h)) out[k].h = v.h;
    }
    return out;
  },
  ownText: false,
};

/** The rescue ledger, saved as `drills`: per word {p: rescues, t: drills started and finished, f: drills
    endured without passing, last: date, at: the word's answer count when the
    last one ended}. @type {Slice} */
export const drillsSlice = {
  key: "drills",
  blank: () => ({}),
  migrate: (raw) => (raw && typeof raw === "object" ? { ...raw } : {}),
  /* Counts are added like any counter; the date and the answer count at the
     last rescue are the later of the two. */
  merge(B, L, R) {
    const out = {};
    for (const k of keys(L, R)) {
      const b = obj(B)[k], l = obj(L)[k], r = obj(R)[k];
      const m = !l ? { ...r } : !r && !b ? { ...l } : counters(b, l, r, ["p", "t", "f"]);
      m.last = later(obj(l).last, obj(r).last);
      m.at = Math.max(num(obj(l).at), num(obj(r).at));
      out[k] = m;
    }
    return out;
  },
  /* Per word, numbers and one date. */
  clean(value) {
    const drills = {};
    for (const [k, v] of pairs(value, 30000)) {
      if (!isObj(v)) continue;
      drills[k] = { p: n(v.p, 10000), t: n(v.t, 10000), f: n(v.f, 10000),
        last: dayStr(v.last), at: n(v.at) };
    }
    return drills;
  },
  ownText: false,
};

/** Saved as `drillDays`: rescues per day, for one badge, a fortnight deep. @type {Slice} */
export const drillDaysSlice = {
  key: "drillDays",
  blank: () => ({}),
  migrate: (raw) => (raw && typeof raw === "object" ? { ...raw } : {}),
  merge: (B, L, R) => counters(B, L, R, keys(L, R)),
  clean: (value) => Object.fromEntries(pairs(value, 40, 10)
    .filter(([k]) => DAY.test(k)).map(([k, v]) => [k, n(v, 1000)])),
  ownText: false,
};
