// @ts-check
/* The review queue: what was missed comes back, spaced out (critique 18–20).
 *
 * Until v6.13 the program had no spaced repetition for grammar. After a wrong
 * answer the same inflection cell came back after a median of 37–41 questions
 * — two days of practice — and the very thing that was missed (this word in
 * this cell) came back the next day once in fifty times. core/spacing.js
 * spaces the vocabulary question only, and it spaces it APART.
 *
 * This module is the opposite rule, for grammar:
 *
 *   a wrong answer        puts an entry in `S.review`, due tomorrow
 *   a right answer on a   moves it out: 1 → 3 → 7 → 21 days, and after the
 *   DUE entry             fourth the entry has done its work and is removed
 *   a wrong answer on it  starts it again at one day
 *
 * A session opens with up to three due entries (tasks/review.js builds them
 * with the cell or the word forced; app.js `pickTask` asks for them).
 *
 * Pure: no DOM, no clock, no random numbers. Every function that needs "today"
 * is handed it — a day key ("2026-11-16"), a Date or a millisecond count.
 *
 * ---- the saved shape ----------------------------------------------------
 *
 *   S.review = {
 *     items: [ entry, … ],             at most REVIEW_MAX
 *     stats: { "p:<pattern>": tally,   per error pattern (core/diagnosis.js)
 *              "s:<skill>":   tally,   per category
 *              "t:<type>":    tally }  per question type (since item 44: the
 *                                      mastery mark of a curriculum node,
 *                                      core/mastery.js)
 *   }
 *
 *   entry   k     its identity (see `keyFor`)
 *           t     the question type that was missed last ("fill", "to_samr" …)
 *           sk    the category it counted for
 *           p     the error pattern the diagnosis read, or null
 *           c     the cell: a BÍN mark, or what the type files its answers
 *                 under ("stjórn:á", "setn:frumlag"), or null
 *           w     the word key ("hestur|kk"), or null
 *           i     the hand-written item (to_flt), or null
 *           s     the stage, 0–3: an index into INTERVALS
 *           due   the day it is next to be asked
 *           add   the day it entered the queue
 *           last  the day it was last answered
 *           l     how many times it has been missed
 *           ok    how many reviews it has passed
 *
 *   tally   a  entries added          l  misses on an entry already there
 *           p  reviews passed         t  … of them on time
 *           g  entries that passed all four reviews
 *           x  entries dropped unfinished (stale, or the queue was full)
 *
 * Nothing the child typed is kept — the same rule as the diagnosis.
 *
 * ---- the choices, and why -----------------------------------------------
 *
 * WHAT IS ONE ENTRY (`keyFor`). The same word in the same cell is one entry,
 * whatever shape the question had: *hestum* missed in a cloze, then in a
 * choice between forms, then in a table is one thing not known, not three.
 * Recognising a form (Greining) is kept apart from producing it. A question
 * with no word of its own (a sentence part, a date) is its type and cell; a
 * hand-written item with one cell for the whole type (*tvennar buxur*) is the
 * item; a hunt or a built sentence, which test several words at once, is the
 * type and the error pattern. A second miss never makes a second entry: it
 * starts the first again and counts in `l`.
 *
 * A TABLE is one answer and makes one entry: its first wrong cell. Every
 * other wrong cell that ALREADY has an entry starts again; a right cell
 * passes its entry if that entry is due.
 *
 * ONLY A DUE ENTRY MOVES OUT. A right answer the same afternoon is
 * short-term memory (critique 19), so it changes nothing. A right answer on
 * a due entry counts wherever it happens — as a review at the start of a
 * session, or because the same word and cell came up by chance.
 *
 * LATE IS NOT PUNISHED. The next interval is counted from the day of the
 * answer. `t` counts the reviews passed within ON_TIME_DAYS of their day
 * (a review due on Saturday and done on Monday is on time).
 *
 * THREE PER SESSION, AND WHICH THREE (`dueEntries`). A weak pupil misses
 * more in a session than three reviews can take back, so the order matters
 * more than anything else here: the lowest stage first (a fresh miss is the
 * memory most at risk), and within a stage the one that fell due most
 * recently — yesterday's misses are asked today while there is still
 * something to recall; what has already waited a week loses little by
 * waiting longer.
 *
 * THE QUEUE IS CAPPED at REVIEW_MAX = 150. Three reviews a session cannot
 * serve more than that in any case, and it bounds what is saved and sent
 * (about 30 kB). When it is full the entry dropped is the one furthest
 * along (highest stage), and among those the one untouched for longest: it
 * is the one the pupil most nearly knows.
 *
 * STALE ENTRIES EXPIRE. An entry more than STALE_DAYS = 60 days overdue is
 * dropped. After the summer the queue should not open with June's mistakes:
 * what is still not known will be missed again within days and come back as a
 * fresh entry, and "12 atriði bíða upprifjunar" (item 22) stays a number a
 * pupil can clear.
 */

import { chancesIn } from "./diagnosis.js";

/** Days until the next review, by stage. */
export const INTERVALS = [1, 3, 7, 21];
/** The most entries the queue holds. */
export const REVIEW_MAX = 150;
/** An entry this many days overdue is dropped. */
export const STALE_DAYS = 60;
/** How many reviews open a session — never more than a third of it. */
export const OPENING_MAX = 3;
/** A review passed within this many days of its day counts as on time. */
export const ON_TIME_DAYS = 2;
/** The most tallies `stats` keeps (patterns, categories and question types). */
export const STATS_MAX = 240;
/** After a wrong cloze the noun comes back this many questions later. */
export const REASK_GAP = [3, 5];

const DAY_MS = 86400000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/* ---------- days ----------------------------------------------------------- */

const pad = (n) => String(n).padStart(2, "0");

/** A day key from a day key, a Date or milliseconds. Local time, as
    core/state.js `todayKey` — but never read from the clock here. */
export function dayOf(now) {
  if (typeof now === "string" && DAY_RE.test(now)) return now;
  const d = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(d.getTime())) throw new Error("review: no day in " + String(now));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const dayNo = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
};

/** The day `n` days after `key`. */
export function addDays(key, n) {
  const d = new Date((dayNo(key) + n) * DAY_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Whole days from `a` to `b` (negative if `b` is earlier). */
export const daysBetween = (a, b) => dayNo(b) - dayNo(a);

/* ---------- identity ------------------------------------------------------- */

/* Types that test several words in one answer: an entry is the type and the
   error pattern, because no one cell or word is "the" thing missed. */
const COMPOSITE = new Set(["villur", "smidja"]);
/* Recognising a form is not producing it. */
const ANALYSIS = new Set(["parse", "revform"]);

/**
 * What makes two misses the same entry. See the note at the top.
 * @param {{t:string, c?:?string, w?:?string, i?:?string, p?:?string}} e
 */
export function keyFor({ t, c = null, w = null, i = null, p = null }) {
  if (COMPOSITE.has(t)) return `p:${t}|${p || ""}`;
  if (i) return `i:${t}|${i}`;
  if (c && w) return `f:${ANALYSIS.has(t) ? "greina" : "mynd"}|${c}|${w}`;
  if (c) return `c:${t}|${c}`;
  if (w) return `w:${t}|${w}`;
  return `p:${t}|${p || ""}`;
}

/* ---------- the queue ------------------------------------------------------ */

export const blankReview = () => ({ items: [], stats: {} });

/** The queue of a state, made if it is not there. */
function book(S) {
  if (!S.review || typeof S.review !== "object" || !Array.isArray(S.review.items))
    S.review = sanitiseReview(S.review);
  S.review.stats ||= {};
  return S.review;
}

const itemsOf = (S) => (S && S.review && Array.isArray(S.review.items) ? S.review.items : []);

const isDue = (e, today) => e.due <= today;
const isStale = (e, today) => daysBetween(e.due, today) > STALE_DAYS;

function bump(stats, e, field) {
  for (const k of [e.p ? "p:" + e.p : null, e.sk ? "s:" + e.sk : null, e.t ? "t:" + e.t : null]) {
    if (!k) continue;
    const r = (stats[k] ||= { a: 0, l: 0, p: 0, t: 0, g: 0, x: 0 });
    r[field] = (r[field] || 0) + 1;
  }
}

/* The order in which due entries are asked: lowest stage, then the one that
   fell due most recently, then the one missed most often. The key last, so
   the order never depends on how the list happens to be stored (two devices
   must agree after a merge). */
const byUrgency = (a, b) =>
  a.s - b.s || (a.due < b.due ? 1 : a.due > b.due ? -1 : 0) || b.l - a.l ||
  (a.k < b.k ? -1 : a.k > b.k ? 1 : 0);

/* The order in which entries are given up when the queue is full: furthest
   along first, then longest untouched. */
const byDispensable = (a, b) =>
  b.s - a.s || (a.last < b.last ? -1 : a.last > b.last ? 1 : 0) ||
  (a.k < b.k ? -1 : a.k > b.k ? 1 : 0);

/**
 * Drop what is stale and hold the queue to its size. Changes `S.review`.
 * Called on every answer and when a session opens; safe to call at any time.
 * @returns {object[]} the entries dropped
 */
export function tidyReview(S, now) {
  const today = dayOf(now);
  const R = book(S);
  const dropped = R.items.filter((e) => isStale(e, today));
  let keep = R.items.filter((e) => !isStale(e, today));
  if (keep.length > REVIEW_MAX) {
    const out = [...keep].sort(byDispensable).slice(0, keep.length - REVIEW_MAX);
    dropped.push(...out);
    const gone = new Set(out.map((e) => e.k));
    keep = keep.filter((e) => !gone.has(e.k));
  }
  dropped.forEach((e) => bump(R.stats, e, "x"));
  R.items = keep;
  return dropped;
}

/* ---------- reading an answer ---------------------------------------------- */

/** The pattern an answer is filed under: the first the diagnosis is sure of. */
const patternOf = (findings) => {
  const f = (findings || []).find((x) => !x.soft) || (findings || [])[0];
  return f ? f.p : null;
};

/**
 * What one judged answer says about the queue: the entry a miss makes
 * (`miss`), and the keys it answered right (`right`) and wrong (`wrong`).
 * Pure; reads the task and the judgement (core/answer.js `judge`).
 */
export function readAnswer(task, j) {
  const t = task.typeId || task.type;
  const p = patternOf(j.findings);
  const out = { miss: null, right: [], wrong: [] };
  const mk = (c, w, i = null) => ({ t, sk: task.skill || null, p, c: c || null, w: w || null, i });

  if (COMPOSITE.has(t)) {
    /* A hunt or a built sentence put right has had a chance at every pattern
       it tests; one that went wrong is filed under what the diagnosis read. */
    if (j.ok) out.right = chancesIn(task).map((id) => keyFor({ t, p: id }));
    else { out.miss = mk(null, null); out.wrong = [keyFor(out.miss)]; }
    return out;
  }

  /* The parts the answer was recorded in. A table has one per cell; most
     questions have one, and it is the task's own cell and word. */
  const recs = (j.effects || []).filter((e) => e.do === "record" && e.counts !== false);
  const parts = task.type === "table"
    ? recs.map((e) => ({ c: e.cell, w: e.word, ok: e.ok }))
    : [{ c: task.cell, w: task.word, i: task.item || null, ok: j.ok }];
  for (const part of parts) {
    if (!part.c && !part.w && !part.i) continue;
    const e = mk(part.c, part.w, part.i || null);
    const k = keyFor(e);
    if (part.ok) out.right.push(k);
    else { out.wrong.push(k); out.miss ||= e; }
  }
  /* Wrong, and nothing to name it by: the type and the pattern. */
  if (!j.ok && !out.miss) { out.miss = mk(null, null); out.wrong = [keyFor(out.miss)]; }
  if (j.ok) out.wrong = [];
  return out;
}

/* ---------- the three moves ------------------------------------------------- */

function lapse(R, e, today) {
  e.s = 0;
  e.due = addDays(today, INTERVALS[0]);
  e.last = today;
  e.l = (e.l || 0) + 1;
  bump(R.stats, e, "l");
}

/** A right answer on a due entry. Returns "passed" or "done". */
function pass(R, e, today) {
  const onTime = daysBetween(e.due, today) <= ON_TIME_DAYS;
  bump(R.stats, e, "p");
  if (onTime) bump(R.stats, e, "t");
  e.ok = (e.ok || 0) + 1;
  e.last = today;
  if (e.s + 1 >= INTERVALS.length) {
    bump(R.stats, e, "g");
    R.items = R.items.filter((x) => x !== e);
    return "done";
  }
  e.s += 1;
  e.due = addDays(today, INTERVALS[e.s]);
  return "passed";
}

/**
 * Write one judged answer into the queue. Called by core/answer.js `settle`
 * for every answer that is right or wrong — the one path, so a new question
 * type does not have to remember.
 *
 * `task.review` is the key of the entry this question was built to review.
 * It is honoured even when the question that could be built is not exactly
 * the entry's own cell and word (the builder fell back to the same type and
 * pattern): it was asked as that review, and it counts as that review.
 *
 * @returns {{added:?string, lapsed:string[], passed:{k:string, next:?number}[], done:string[]}}
 *   `next`: days until that entry comes again.
 */
export function noteReview(S, task, j, now) {
  const out = { added: null, lapsed: [], passed: [], done: [] };
  if (!task || !j || (j.ok !== true && j.ok !== false)) return out;
  const today = dayOf(now);
  const R = book(S);
  const find = (k) => R.items.find((e) => e.k === k);
  const a = readAnswer(task, j);

  /* What was answered right — the whole answer, or the right cells of a
     table that went wrong elsewhere. */
  const rights = new Set(a.right);
  if (j.ok && task.review) rights.add(task.review);
  for (const k of rights) {
    const e = find(k);
    if (!e || !isDue(e, today)) continue;
    if (pass(R, e, today) === "done") out.done.push(k);
    else out.passed.push({ k, next: INTERVALS[e.s] });
  }
  if (!j.ok) {
    const keys = new Set(a.wrong);
    /* A review that went wrong starts again — unless its own cell was among
       the right ones (a table reviewed for one cell and missed in another). */
    if (task.review && !rights.has(task.review)) keys.add(task.review);
    for (const k of keys) {
      const e = find(k);
      if (!e) continue;
      lapse(R, e, today);
      out.lapsed.push(k);
    }
    const k = a.miss ? keyFor(a.miss) : null;
    if (k && !find(k)) {
      const e = { k, ...a.miss, s: 0, due: addDays(today, INTERVALS[0]),
        add: today, last: today, l: 1, ok: 0 };
      R.items.push(e);
      bump(R.stats, e, "a");
      out.added = k;
    } else if (k) {
      /* The entry was already there: it now names the question and the
         pattern of the latest miss, which is the one to ask about. */
      const e = find(k);
      e.t = a.miss.t; e.sk = a.miss.sk || e.sk; e.p = a.miss.p || e.p;
      if (a.miss.w) e.w = a.miss.w;
    }
  }
  tidyReview(S, today);
  return out;
}

/**
 * Put an error pattern in the queue without an answer having been missed —
 * for "Þrjár í röð" (item 36), which practises a pattern and then wants it
 * back tomorrow. `t` is the question type to ask it in; the entry is that
 * type and pattern, as a hunt's is. If it is already there it is left alone:
 * practice is not a miss.
 * @returns the entry's key
 */
export function queuePattern(S, { p, t, sk = null }, now) {
  const today = dayOf(now);
  const R = book(S);
  const e = { t, sk, p, c: null, w: null, i: null };
  const k = `p:${t}|${p}`;
  if (!R.items.some((x) => x.k === k)) {
    const made = { k, ...e, s: 0, due: addDays(today, INTERVALS[0]), add: today, last: today, l: 0, ok: 0 };
    R.items.push(made);
    bump(R.stats, made, "a");
    tidyReview(S, today);
  }
  return k;
}

/* ---------- asking ---------------------------------------------------------- */

/**
 * The entries that are due, most urgent first. Stale ones are left out (they
 * are dropped the next time anything is written). Changes nothing.
 * @param can  (entry) => boolean: only those this pupil may be asked now
 */
export function dueEntries(S, now, can = null) {
  const today = dayOf(now);
  return itemsOf(S)
    .filter((e) => isDue(e, today) && !isStale(e, today) && (!can || can(e)))
    .sort(byUrgency);
}

/** "12 atriði bíða upprifjunar" — Icelandic agreement: the verb is singular
    after a number ending in 1 but not 11 ("1 atriði bíður", "21 atriði
    bíður", "11 atriði bíða"). "" when nothing is due, so nothing is drawn. */
export function dueLine(n) {
  const k = Math.max(0, Math.floor(n || 0));
  if (!k) return "";
  return `${k} atriði ${k % 10 === 1 && k % 100 !== 11 ? "bíður" : "bíða"} upprifjunar`;
}

/** How many entries are waiting to be reviewed today — "N atriði bíða
    upprifjunar" (item 22). */
export const dueCount = (S, now, can = null) => dueEntries(S, now, can).length;

/** How many reviews open a session of `n` questions: up to three, and never
    more than a third of it (rounded up). */
export const openingSize = (n) => Math.max(0, Math.min(OPENING_MAX, Math.ceil((n || 0) / 3)));

/** The due entries a session of `n` questions opens with. */
export const openingReviews = (S, now, n, can = null) =>
  dueEntries(S, now, can).slice(0, openingSize(n));

/** The entry with this key, or null. */
export const entryByKey = (S, k) => itemsOf(S).find((e) => e.k === k) || null;

/* ---------- the same noun again, later in the session (item 19) -------------
 *
 * After a wrong cloze the same noun used to be the very next question; the
 * pupil had just read the answer, so the second try tested short-term
 * memory. It now comes back as the third, fourth or fifth question after the
 * miss (and the next day through the queue). If the session ends first, the
 * queue is the only repeat — and if only the last few questions are left it
 * is asked as late as the session allows, never sooner than three on.      */

/**
 * Where in a session a missed cloze is asked again.
 * @param at   the position (0-based) of the question that was missed
 * @param n    the size of the session
 * @param rng  the random source
 * @returns the position to ask it at, or null if the session is too short
 */
export function reaskAt(at, n, rng) {
  const [lo, hi] = REASK_GAP;
  const gap = lo + Math.floor(rng() * (hi - lo + 1));
  const last = n - 1;
  if (at + lo > last) return null;
  return Math.min(at + gap, last);
}

/* ---------- figures for the screens (items 22, 36, 44, 83) ----------------- */

const TALLY = { a: "added", l: "lapsed", p: "passed", t: "onTime", g: "learned", x: "dropped" };

function figures(S, now, prefix, field) {
  const today = dayOf(now);
  const out = {};
  const row = (id) => (out[id] ||= { waiting: 0, due: 0, added: 0, lapsed: 0, passed: 0,
    onTime: 0, learned: 0, dropped: 0 });
  for (const [k, v] of Object.entries((S && S.review && S.review.stats) || {})) {
    if (!k.startsWith(prefix)) continue;
    const r = row(k.slice(prefix.length));
    for (const [short, long] of Object.entries(TALLY)) r[long] = (v && v[short]) || 0;
  }
  for (const e of itemsOf(S)) {
    if (!e[field] || isStale(e, today)) continue;
    const r = row(e[field]);
    r.waiting++;
    if (isDue(e, today)) r.due++;
  }
  return out;
}

/**
 * Review figures per error pattern: { [patternId]: { waiting, due, added,
 * lapsed, passed, onTime, learned, dropped } }.
 *   waiting  entries in the queue now      due      … of them due today
 *   added    entries ever made             lapsed   misses on an entry
 *   passed   reviews passed                onTime   … within two days of due
 *   learned  entries that passed all four  dropped  given up unfinished
 */
export const patternReviewStats = (S, now) => figures(S, now, "p:", "p");

/** The same per category (skill id) — the "reviews passed on time" of the
    mastery mark (item 44). */
export const skillReviewStats = (S, now) => figures(S, now, "s:", "sk");

/** The same per question type — for a curriculum node, which is a set of
    types (core/mastery.js `masteryOfTypes`). Tallied since item 44; entries
    made before then count under their pattern and category only. */
export const typeReviewStats = (S, now) => figures(S, now, "t:", "t");

/** The whole queue in one line: how much waits, how much is due. */
export function reviewSummary(S, now) {
  const today = dayOf(now);
  const live = itemsOf(S).filter((e) => !isStale(e, today));
  const due = live.filter((e) => isDue(e, today));
  return { waiting: live.length, due: due.length,
    next: live.length ? live.map((e) => e.due).sort()[0] : null };
}

/**
 * The line under a right answer that moved an entry of the queue (what
 * `noteReview` returned): when it comes next, or that it is done with. Empty
 * when nothing moved. *21 dag*: a number ending in one takes the singular.
 */
export function reviewLine(outcome) {
  if (!outcome) return "";
  if (outcome.passed && outcome.passed.length) {
    const n = Math.min(...outcome.passed.map((x) => x.next));
    return `Upprifjun tókst. Þetta kemur aftur eftir ${n} ${n % 10 === 1 && n % 100 !== 11 ? "dag" : "daga"}.`;
  }
  if (outcome.done && outcome.done.length) return "Upprifjun lokið — þetta kanntu núna.";
  return "";
}

/* ---------- what may be saved ---------------------------------------------- */

const str = (x, max) => (typeof x === "string" && x.length > 0 && x.length <= max ? x : null);
const day = (x) => (typeof x === "string" && DAY_RE.test(x) ? x : null);
const int = (x, max) =>
  (typeof x === "number" && Number.isFinite(x) ? Math.min(Math.max(0, Math.round(x)), max) : 0);
const TYPE_RE = /^[a-z][a-z0-9_]{0,23}$/;

/**
 * The queue rebuilt field by field out of whatever was saved, so that an old
 * state, a hand-edited file and a hostile upload all end as a queue of the
 * right shape and of bounded size. Used by `migrate` (core/state.js) and by
 * the server (server/guard.mjs). Never throws.
 */
export function sanitiseReview(raw) {
  const out = blankReview();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const seen = new Set();
  for (const e of Array.isArray(raw.items) ? raw.items : []) {
    if (!e || typeof e !== "object") continue;
    const k = str(e.k, 200), t = str(e.t, 24), due = day(e.due);
    if (!k || !t || !TYPE_RE.test(t) || !due || seen.has(k)) continue;
    seen.add(k);
    const last = day(e.last) || day(e.add) || due;
    out.items.push({
      k, t, sk: str(e.sk, 24), p: str(e.p, 40), c: str(e.c, 60), w: str(e.w, 80), i: str(e.i, 120),
      s: Math.min(int(e.s, 99), INTERVALS.length - 1), due,
      add: day(e.add) || last, last, l: int(e.l, 9999), ok: int(e.ok, 9999),
    });
  }
  if (out.items.length > REVIEW_MAX)
    out.items = [...out.items].sort(byDispensable).slice(out.items.length - REVIEW_MAX);
  const stats = raw.stats && typeof raw.stats === "object" && !Array.isArray(raw.stats) ? raw.stats : {};
  /* Bounded: about sixty patterns, twelve categories and sixty question
     types fit with room to spare. */
  for (const [k, v] of Object.entries(stats).slice(0, STATS_MAX)) {
    if (!/^[pst]:[\wáðéíóúýþæö-]{1,40}$/i.test(k) || !v || typeof v !== "object") continue;
    out.stats[k] = { a: int(v.a, 1e6), l: int(v.l, 1e6), p: int(v.p, 1e6), t: int(v.t, 1e6),
      g: int(v.g, 1e6), x: int(v.x, 1e6) };
  }
  return out;
}

/* ---------- two devices ----------------------------------------------------
 *
 * The three-way merge of core/merge.js, for the queue. An entry is one thing
 * on both devices (its key), so:
 *
 *   on one side only      kept — unless the other side had it at `base` and
 *                         has since finished or dropped it, and this side
 *                         has not touched it since: then it stays gone
 *   on both, one changed  the one that changed
 *   on both, both changed the one answered LATER (`last`); on the same day,
 *                         the one that asks for more review (the lower
 *                         stage, the earlier day) — a miss on the phone is
 *                         not erased by a pass on the laptop that afternoon
 *
 * The tallies add like every other counter.                                */

const sameEntry = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function newer(l, r) {
  if (l.last !== r.last) return l.last > r.last ? l : r;
  if (l.s !== r.s) return l.s < r.s ? l : r;
  return l.due <= r.due ? l : r;
}

export function mergeReview(base, local, remote) {
  const B = sanitiseReview(base), L = sanitiseReview(local), R = sanitiseReview(remote);
  const by = (q) => new Map(q.items.map((e) => [e.k, e]));
  const b = by(B), l = by(L), r = by(R);
  const out = blankReview();
  for (const k of new Set([...r.keys(), ...l.keys()])) {
    const be = b.get(k), le = l.get(k), re = r.get(k);
    let e;
    if (le && re) e = !be ? newer(le, re) : sameEntry(le, be) ? re : sameEntry(re, be) ? le : newer(le, re);
    else {
      const one = le || re;
      /* Gone on the other side since `base`, untouched on this one. */
      if (be && sameEntry(one, be)) continue;
      e = one;
    }
    out.items.push({ ...e });
  }
  if (out.items.length > REVIEW_MAX)
    out.items = [...out.items].sort(byDispensable).slice(out.items.length - REVIEW_MAX);
  /* A stable order, so that two devices that merge the same things hold the
     same file. */
  out.items.sort((x, y) => (x.add < y.add ? -1 : x.add > y.add ? 1 : x.k < y.k ? -1 : x.k > y.k ? 1 : 0));
  for (const k of new Set([...Object.keys(L.stats), ...Object.keys(R.stats)])) {
    const bs = B.stats[k] || {}, ls = L.stats[k] || {}, rs = R.stats[k] || {};
    out.stats[k] = {};
    for (const f of ["a", "l", "p", "t", "g", "x"])
      out.stats[k][f] = Math.max(0, (rs[f] || 0) + ((ls[f] || 0) - (bs[f] || 0)));
  }
  return out;
}
