/* Two devices, one child: putting two copies of the progress back together.
 *
 * Until v6.3 the whole state went up and the last write won, so a phone left
 * open since breakfast could erase an evening's work on the laptop with one
 * answer. The server now refuses a write that is not based on what it holds
 * (`PUT /state/:id`, 409), and this module is what the program does next.
 *
 * It is a THREE-way merge, and the third copy is what makes it safe:
 *
 *   base    what this device last agreed with the server about
 *   local   what this device has now
 *   remote  what the server has now (another device's work)
 *
 * Everything this device did since `base` is the difference local − base, and
 * that difference is added to `remote`. Nothing is ever taken from either
 * side: counters add, bests take the larger, dates take the later, and the
 * child's own switches follow whichever device actually changed them.
 *
 * Pure: no DOM, no requests, never mutates its arguments.
 */

import { mergeReview } from "./review.js";
import { mergeMend } from "./mending.js";
import { mergeLevels } from "./difficulty.js";
import { mergeByType } from "./mastery.js";
import { mergeByNode } from "./skillmap.js";
import { mergeSeenTypes } from "./examples.js";

const num = (x) => (typeof x === "number" && Number.isFinite(x) ? x : 0);
const obj = (x) => (x && typeof x === "object" && !Array.isArray(x) ? x : {});
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const later = (a, b) => (!a ? b ?? null : !b ? a : (String(a) > String(b) ? a : b));
const earlier = (a, b) => (!a ? b ?? null : !b ? a : (String(a) < String(b) ? a : b));

/** A counter both sides only ever add to. */
const add = (b, l, r) => Math.max(0, num(r) + (num(l) - num(b)));

/** A pot that can also shrink (XP fades over a break). If BOTH sides shrank it
    is the same fading seen twice, and it must not be taken twice. */
const pot = (b, l, r) =>
  (num(l) < num(b) && num(r) < num(b)) ? Math.min(num(l), num(r)) : add(b, l, r);

/** A setting: whoever changed it since `base` wins; if both did, this device. */
const choice = (b, l, r) => (same(l, b) ? (r === undefined ? l : r) : l);

const keys = (...os) => [...new Set(os.flatMap((o) => Object.keys(obj(o))))];

function counters(b, l, r, fields) {
  const out = { ...obj(r), ...obj(l) };
  for (const f of fields) out[f] = add(obj(b)[f], obj(l)[f], obj(r)[f]);
  return out;
}

function mergeDay(b, l, r) {
  if (!l) return r;
  if (!r && !b) return l;
  const out = counters(b, l, r, ["a", "c", "xp", "ms", "nw"]);
  out.sk = {};
  for (const k of keys(obj(l).sk, obj(r).sk))
    out.sk[k] = add(obj(obj(b).sk)[k], obj(obj(l).sk)[k], obj(obj(r).sk)[k]);
  out.g = obj(l).g ?? obj(r).g ?? null;
  out.lg = obj(l).lg || obj(r).lg ? 1 : 0;
  /* The weekly goal in force that day (item 57): the lower, as `weekGoalFor`
     judges a week by the lowest stamped on it. */
  const wl = obj(l).wg, wr = obj(r).wg;
  if (wl || wr) out.wg = wl && wr ? Math.min(wl, wr) : (wl || wr);
  return out;
}

/** dates in `l` that were not already in `b`, as a multiset. */
function newDates(b, l) {
  const left = [...(Array.isArray(b) ? b : [])];
  const out = [];
  for (const d of (Array.isArray(l) ? l : [])) {
    const i = left.indexOf(d);
    if (i >= 0) left.splice(i, 1); else out.push(d);
  }
  return out;
}

function mergeBadge(b, l, r, keep = 80) {
  if (!l) return r;
  if (!r) return l;
  /* Won on both devices with no common past: it is one badge, not two. */
  const n = b ? add(b.n, l.n, r.n) : Math.max(num(l.n), num(r.n));
  const dates = b
    ? [...(r.dates || []), ...newDates(b.dates, l.dates)]
    : ((l.dates || []).length >= (r.dates || []).length ? l.dates || [] : r.dates || []);
  return {
    ...r, ...l,
    n: Math.max(1, n),
    dates: [...dates].sort().slice(-keep),
    first: earlier(l.first, r.first),
    last: later(l.last, r.last),
  };
}

/**
 * @param {object|null} base   the last state this device and the server agreed on
 * @param {object} local       this device's state now
 * @param {object} remote      the server's state now
 * @returns {object} a new state holding the work of both
 */
export function mergeStates(base, local, remote) {
  if (!remote) return local;
  if (!local) return remote;
  const B = obj(base), L = obj(local), R = obj(remote);
  const out = { ...R, ...L };

  out.xp = pot(B.xp, L.xp, R.xp);
  out.bestLevel = Math.max(num(L.bestLevel), num(R.bestLevel), 1);
  out.bestRun = Math.max(num(L.bestRun), num(R.bestRun));
  out.totalAnswers = add(B.totalAnswers, L.totalAnswers, R.totalAnswers);
  out.totalCorrect = add(B.totalCorrect, L.totalCorrect, R.totalCorrect);

  out.days = {};
  for (const k of keys(L.days, R.days))
    out.days[k] = mergeDay(obj(B.days)[k], obj(L.days)[k], obj(R.days)[k]);

  for (const part of ["cells", "words"]) {
    out[part] = {};
    for (const k of keys(L[part], R[part])) {
      const l = obj(L[part])[k], r = obj(R[part])[k];
      out[part][k] = !l ? r : !r && !obj(B[part])[k] ? l
        : counters(obj(B[part])[k], l, r, ["c", "w"]);
    }
  }

  out.skills = {};
  for (const k of keys(L.skills, R.skills)) {
    const b = obj(B.skills)[k], l = obj(L.skills)[k], r = obj(R.skills)[k];
    out.skills[k] = {
      xp: pot(obj(b).xp, obj(l).xp, obj(r).xp),
      c: add(obj(b).c, obj(l).c, obj(r).c),
      w: add(obj(b).w, obj(l).w, obj(r).w),
      bestRun: Math.max(num(obj(l).bestRun), num(obj(r).bestRun)),
    };
  }

  out.badges = {};
  for (const k of keys(L.badges, R.badges))
    out.badges[k] = mergeBadge(obj(B.badges)[k], obj(L.badges)[k], obj(R.badges)[k]);

  out.counters = counters(B.counters, L.counters, R.counters,
    keys(L.counters, R.counters));
  /* core/spacing.js keeps the same record per word as a badge has: a count
     and its dates. */
  out.vocab = {};
  for (const k of keys(L.vocab, R.vocab)) {
    const v = mergeBadge(obj(B.vocab)[k], obj(L.vocab)[k], obj(R.vocab)[k], 40);
    out.vocab[k] = v;
  }
  out.periods = { ...obj(R.periods), ...obj(L.periods) };

  /* The rescue drill (v6.6): counts are added like any counter; the date and
     the answer count at the last rescue are the later of the two. */
  out.drills = {};
  for (const k of keys(L.drills, R.drills)) {
    const b = obj(B.drills)[k], l = obj(L.drills)[k], r = obj(R.drills)[k];
    const m = !l ? { ...r } : !r && !b ? { ...l } : counters(b, l, r, ["p", "t", "f"]);
    m.last = later(obj(l).last, obj(r).last);
    m.at = Math.max(num(obj(l).at), num(obj(r).at));
    out.drills[k] = m;
  }
  out.drillDays = counters(B.drillDays, L.drillDays, R.drillDays, keys(L.drillDays, R.drillDays));

  /* Lesefni and duels (v6.7): a page read anywhere is read; a duel settled
     anywhere is settled, and both devices agree on its result. */
  out.read = { ...obj(R.read), ...obj(L.read) };
  out.duels = { ...obj(R.duels), ...obj(L.duels) };

  /* Error diagnosis (v6.10): chances and misses add like any counter; the
     recent history and the examples are this device's if it has answered
     anything for that pattern since `base`, otherwise the server's. */
  out.diag = {};
  for (const k of keys(L.diag, R.diag)) {
    const b = obj(B.diag)[k], l = obj(L.diag)[k], r = obj(R.diag)[k];
    if (!l) { out.diag[k] = r; continue; }
    if (!r && !b) { out.diag[k] = l; continue; }
    const m = counters(b, l, r, ["n", "w"]);
    const moved = num(obj(l).n) !== num(obj(b).n);
    m.h = moved ? obj(l).h : obj(r).h ?? obj(l).h;
    m.ex = moved ? obj(l).ex : obj(r).ex ?? obj(l).ex;
    m.last = later(obj(l).last, obj(r).last);
    out.diag[k] = m;
  }
  /* Sessions: the union, by the moment each was finished. */
  const runs = new Map();
  [...(Array.isArray(R.runs) ? R.runs : []), ...(Array.isArray(L.runs) ? L.runs : [])]
    .forEach((x) => { if (x && x.at) runs.set(x.at, x); });
  out.runs = [...runs.values()].sort((a, b) => a.at - b.at).slice(-40);

  /* The review queue (v6.13): one entry per thing missed, whichever device
     missed it; the rule for an entry both devices changed is in
     core/review.js `mergeReview`. */
  out.review = mergeReview(B.review, L.review, R.review);

  /* Saved levels (v6.13, core/difficulty.js): a position, not a count — per
     skill the record changed last wins whole. */
  out.difficulty = mergeLevels(B.difficulty, L.difficulty, R.difficulty);

  /* Sentences seen as frames (v6.13): counts that only ever grow, added like
     any counter. */
  out.frames = counters(B.frames, L.frames, R.frames, keys(L.frames, R.frames));
  /* Per question type (v6.13, item 44, core/mastery.js): the counts add, the
     recent history is the side answered last. Types met (item 41): met on
     either device is met, on the earlier day. */
  out.byType = mergeByType(B.byType, L.byType, R.byType);
  /* The same record per curriculum node (item 83, core/skillmap.js). */
  out.byNode = mergeByNode(B.byNode, L.byNode, R.byNode);
  out.seenTypes = mergeSeenTypes(L.seenTypes, R.seenTypes);
  /* Getting better (items 56 and 58, core/mending.js): a pattern mended on
     either device is no longer waiting, and the counts add. */
  out.mend = mergeMend(B.mend, L.mend, R.mend);

  out.lastActive = later(L.lastActive, R.lastActive);
  out.settled = later(L.settled, R.settled);

  /* The child's own switches: whichever device changed them. */
  for (const k of ["goal", "weekGoal", "enabled", "policy", "settings", "showcase", "title"])
    out[k] = choice(B[k], L[k], R[k]);

  /* The ceiling is the administrator's and always comes from the server. */
  out.allowed = R.allowed ?? L.allowed ?? null;
  return out;
}
