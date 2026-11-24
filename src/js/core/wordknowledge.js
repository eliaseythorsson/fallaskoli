// @ts-check
/* Word knowledge: one history per word (issue #8, docs/DLD-PLAN.md §1).
 *
 * Everything the program knows about how one pupil stands with each word
 * (CONTEXT.md "Word knowledge") is worked out from one list per word: its
 * WORD ENTRIES. One entry says that the pupil answered one question about the
 * word on one day: which question type, and right, wrong or seen-not-judged.
 *
 * This module is the one place that writes them and the place every reader
 * of a word's state is to go through. Today it only writes and offers the
 * history: word health, the rescue drill, `S.words` and `S.vocab` read and
 * write what they did before (decision 11 below: a pure move). Moving them
 * onto this module is #42, and word choice behind the view is #45; the rules
 * built on it are #10 (learned words), #12 (hard words), #17 and through them
 * #13 and #16; the size warning is #44.
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
 * About 220 KB per typical pupil per school year (docs/adr/0001).
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
 *     core/wordhealth.js `wordsSlice`), so both start on the same day. XP,
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
import { add, num, obj, n, DAY } from "./slicerules.js";

/** @typedef {import("../types").State} State */
/** @typedef {import("../types").Task} Task */
/** @typedef {import("../types").Judgement} Judgement */
/** @typedef {import("../types").DayKey} DayKey */
/** @typedef {import("../types").WordEntry} WordEntry */
/** @typedef {import("../types").WordHistory} WordHistory */
/** @typedef {import("../types").WordKnowledge} WordKnowledge */

/* ---------- the constants ---------------------------------------------------- */

/** The outcome of an entry. */
export const RIGHT = "r";
export const WRONG = "w";
/** Seen, not judged: the meaning question, or an answer nobody could judge. */
export const SEEN = "s";
const OUTCOMES = new Set([RIGHT, WRONG, SEEN]);

/** The most entries a word keeps (decision 5, docs/adr/0001): every one.
    The size warning is #44. */
export const ENTRIES_MAX = Infinity;

/** Saved progress older than this STATE_VERSION starts word knowledge empty
    and `S.words` without its short history (decision 6). core/slices.js
    STATE_VERSION is at least this; tests/wordknowledge.test.js holds it. */
export const RESET_BEFORE = 12;

/** The most words the server keeps, as for `S.words`. */
export const WORDS_MAX = 30000;

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
