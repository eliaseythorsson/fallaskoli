/* Spacing between repeats of the same word in the vocabulary question.
 *
 * Hard rules (weight zero): never the same word twice on the same day, never
 * within a week of the last time, and never within a month once it has come
 * up twice. Above them a soft rule: new words first — each appearance lowers
 * the weight, so a repeat never comes ahead of a new word while both are
 * eligible, but is still possible once the pool runs dry.
 *
 * Pure: takes the state as an argument, so it is testable with fixed dates. */

export const DAY = 86400000;

/* The hard thresholds, in days. In one table so that they are readable and
   testable — and so that years 9 and 10 can be given a different wait if it
   ever turns out they need one. */
export const GATE = {
  sameDay: 1,      // never twice on the same day
  minGap: 7,       // never within a week
  twiceGap: 30,    // seen twice or more: never within a month
  repeatsAt: 2,    // what "twice" means
};

export const dayNumber = (key) => {
  const [y, m, d] = String(key).split("-").map(Number);
  return Math.floor(Date.UTC(y, (m || 1) - 1, d || 1) / DAY);
};

/** One word's history in this skill. An empty history means the word is new. */
export function history(S, key) {
  const rec = (S.vocab || {})[key];
  if (!rec) return { n: 0, dates: [], last: null };
  return { n: rec.n || 0, dates: rec.dates || [], last: rec.last || null };
}

/**
 * How many days since the word last appeared? `Infinity` if it never has.
 */
export function daysSince(S, key, today) {
  const h = history(S, key);
  if (!h.last) return Infinity;
  return dayNumber(today) - dayNumber(h.last);
}

/**
 * May this word be asked about today? This is the gate — it answers yes or no,
 * not "probably". The reason travels with the answer so the interface can say
 * it if it needs to.
 */
export function eligible(S, key, today) {
  const h = history(S, key);
  if (!h.n) return { ok: true, why: "nýtt orð" };
  const gap = daysSince(S, key, today);
  if (gap < GATE.sameDay) return { ok: false, why: "kom fyrir í dag" };
  if (gap < GATE.minGap) return { ok: false, why: `aðeins ${gap} dagar síðan` };
  if (h.n >= GATE.repeatsAt && gap < GATE.twiceGap)
    return { ok: false, why: `birst ${h.n}× og aðeins ${gap} dagar síðan` };
  return { ok: true, why: "biðin er liðin" };
}

/**
 * Weight for an eligible word. New words get 1; a repeat always gets less, and
 * less again with each appearance. A word that has waited a long time rises
 * within its own repeat band, so the order is not always the same.
 */
export function weight(S, key, today) {
  const h = history(S, key);
  if (!h.n) return 1;
  const gap = daysSince(S, key, today);
  const base = 0.25 / h.n;                       // always below a new word
  const patience = Math.min(2, gap / GATE.twiceGap);
  return base * (0.5 + patience);
}

/**
 * Pick a word from a pool. Returns `null` if no word is eligible — that is the
 * right answer, not a failure: the program then skips the question rather than
 * repeating itself. A wrong question is worse than no question, and the same
 * word four times is a wrong question.
 */
export function chooseWord(S, pool, today, rnd = Math.random, keyOf = (x) => x.key) {
  const ok = pool.filter((x) => eligible(S, keyOf(x), today).ok);
  if (!ok.length) return null;
  const fresh = ok.filter((x) => !history(S, keyOf(x)).n);
  const bag = fresh.length ? fresh : ok;         // new words are used up first
  const total = bag.reduce((a, x) => a + weight(S, keyOf(x), today), 0);
  let r = rnd() * total;
  for (const x of bag) {
    r -= weight(S, keyOf(x), today);
    if (r <= 0) return x;
  }
  return bag[bag.length - 1];
}

/** Record that the word was asked about today — when its question is shown
    (tasks/effects.js `applyEffects`), never while one is only being built. */
export function markAsked(S, key, today) {
  S.vocab ||= {};
  const rec = (S.vocab[key] ||= { n: 0, dates: [], first: today, last: null });
  rec.n += 1;
  rec.last = today;
  rec.first ||= today;
  rec.dates = [...rec.dates, today].slice(-40);
  return rec;
}

/**
 * The history `markAsked` would leave for this word today, without writing it.
 * A question builder may not change the state (tasks/view.js): it shows the
 * history as it will stand, and the mark itself is made when the question is
 * shown (tasks/effects.js).
 */
export function historyIfAsked(S, key, today) {
  const h = history(S, key);
  return { n: h.n + 1, dates: [...h.dates, today].slice(-40), last: today };
}

/** How many words in the pool are eligible today — for admin and for tests. */
export function poolStatus(S, pool, today, keyOf = (x) => x.key) {
  let ready = 0, fresh = 0, waiting = 0;
  pool.forEach((x) => {
    const k = keyOf(x);
    const h = history(S, k);
    if (!eligible(S, k, today).ok) waiting++;
    else { ready++; if (!h.n) fresh++; }
  });
  return { ready, fresh, waiting, total: pool.length };
}
