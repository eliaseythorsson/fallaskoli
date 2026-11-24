// @ts-check
/* The small rules the slices of the saved state are built from (issue #50).
 *
 * Every slice (core/slices.js) has a `merge` and a `clean`, and most of them
 * say the same few things: a counter both devices only add to, a setting
 * whoever changed it wins, a day key, a whole number inside bounds. These
 * are those things, said once. They were the helpers at the top of
 * core/merge.js and server/guard.mjs, moved here unchanged when each slice's
 * code moved to the module that owns it.
 *
 * Imports nothing: a module with a slice imports this, and this must not
 * lead back to core/state.js or core/merge.js (see core/slices.js).
 */

/* ---------- merge: base, local (this device), remote (the server) ---------- */

/** A number, or 0. */
export const num = (x) => (typeof x === "number" && Number.isFinite(x) ? x : 0);
/** A plain object, or {}. */
export const obj = (x) => (x && typeof x === "object" && !Array.isArray(x) ? x : {});
/** The same when written down. */
export const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
/** The later of two dates (day keys), either of which may be missing. */
export const later = (a, b) => (!a ? b ?? null : !b ? a : (String(a) > String(b) ? a : b));
/** The earlier of two dates. */
export const earlier = (a, b) => (!a ? b ?? null : !b ? a : (String(a) < String(b) ? a : b));

/** A counter both sides only ever add to. */
export const add = (b, l, r) => Math.max(0, num(r) + (num(l) - num(b)));

/** A pot that can also shrink (XP fades over a break). If BOTH sides shrank it
    is the same fading seen twice, and it must not be taken twice. */
export const pot = (b, l, r) =>
  (num(l) < num(b) && num(r) < num(b)) ? Math.min(num(l), num(r)) : add(b, l, r);

/** A setting: whoever changed it since `base` wins; if both did, this device. */
export const choice = (b, l, r) => (same(l, b) ? (r === undefined ? l : r) : l);

/** Every key of these objects, once. */
export const keys = (...os) => [...new Set(os.flatMap((o) => Object.keys(obj(o))))];

/** An object of counters: the named `fields` added, anything else this
    device's, else the server's. */
export function counters(b, l, r, fields) {
  const out = { ...obj(r), ...obj(l) };
  for (const f of fields) out[f] = add(obj(b)[f], obj(l)[f], obj(r)[f]);
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

/** A record of a count and its dates ({n, dates, first, last}): a badge, and
    a word in core/spacing.js. */
export function mergeBadge(b, l, r, keep = 80) {
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

/* ---------- clean: what the server will store ------------------------------ */

/** A day key, YYYY-MM-DD. */
export const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A whole number from 0 to `max`; anything else is 0. */
export const n = (x, max = 1e9) =>
  (typeof x === "number" && Number.isFinite(x) ? Math.min(Math.max(0, Math.round(x)), max) : 0);
/** A day key, or null. */
export const dayStr = (x) => (typeof x === "string" && DAY.test(x) ? x : null);
/** Is it a plain object? */
export const isObj = (x) => x && typeof x === "object" && !Array.isArray(x);
/** A string of at most `len` characters, or null. */
export const short = (x, len) => (typeof x === "string" && x.length <= len ? x : null);

/** The first `maxKeys` entries of an object whose keys are 1–`keyLen` long. */
export function pairs(o, maxKeys, keyLen = 80) {
  return Object.entries(isObj(o) ? o : {})
    .filter(([k]) => k.length > 0 && k.length <= keyLen)
    .slice(0, maxKeys);
}

/** Small free-form objects the program keeps for itself (`periods`, `social`):
    kept only if they are plain data and small. */
export function smallJSON(o, maxBytes) {
  if (!isObj(o)) return null;
  try {
    const text = JSON.stringify(o);
    return text.length <= maxBytes ? JSON.parse(text) : null;
  } catch { return null; }
}
