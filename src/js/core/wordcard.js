// @ts-check
/* The word cards a pupil has done (Orðakort, issue #15, docs/DLD-PLAN.md §1).
 *
 * The first time a pupil meets a word that is about to enter the six words
 * in learning they do its card: read the definition, the sentences, the
 * syllables and the short inflection table, say how well they know the
 * word, and answer the card's structured steps. Only then may the word enter
 * (core/wordknowledge.js `fillLearning`'s `ready` asks `cardDone` here). What
 * the card SHOWS and asks is tasks/wordcard.js; this module is what is KEPT:
 * the pupil's own card, like a page of a notebook.
 *
 * ---- the saved shape -----------------------------------------------------
 *
 *   S.wordCards = {
 *     "breyting|kvk": {                a word: `wordKey(lemma, class)`
 *       d: "2026-11-27",               the day the card was (last) finished
 *       n: 1,                          how many times it has been done (a hard
 *                                      word does its card again, #17)
 *       r: 1,                          self-rating: 0 aldrei heyrt · 1 heyrt
 *                                      það · 2 get notað það (RATINGS)
 *       a: {                           the answers, by step id (tasks/wordcard.js)
 *         skyring: { c: ["breyting|kvk"], ok: true },
 *         setning: { c: ["Breytingin tók langan tíma."], ok: true },
 *         skyld:   { c: ["umskipti"], ok: false },
 *         flokkur: { c: ["no"], ok: true },
 *         eigin:   { c: [], ok: true, t: "Þegar eitthvað verður …" },
 *         min:     { c: [], ok: true, t: "Það var mikil breyting …" },
 *         tengsl:  { c: ["breyta", "umskipti", "stöðugleiki"], ok: true,
 *                    t: "1. breyta – …\n2. umskipti – …\n3. stöðugleiki – …" },
 *       },
 *       x: [                           (#18) what the pupil ADDED when the card
 *         { d: "2026-12-04", r: 2 },   came back in a review: a newer self-
 *         { d: "2026-12-04",           rating and/or a sentence of their own;
 *           s: "Það varð breyting …" },  oldest first, at most ADDS_MAX. Only
 *       ],                             there when there is something
 *     }, …
 *   }
 *   c   what the pupil chose the FIRST time they answered the step, as the
 *       ids of the options (a word key, a sentence, a lemma, a class)
 *   ok  whether that was right
 *   t   (#37, #38, a free-text step) what the pupil wrote — the text that
 *       was judged: the revision, or the first answer if they kept it. `ok`
 *       is the server-read verdict; false when it could not be read. For
 *       the three related words (`tengsl`) `c` holds the three words
 *
 * The card coming back (#18): now and then — REVISIT_RATE — a review of a
 * learned word is followed by the pupil's own card, with what they chose and
 * wrote, and they may add to it (`addToCard`). An addition never changes `n`,
 * `d`, `r` or `a`: those say how the card was DONE (the hard-word rule counts
 * `n`, #17); what came later is `x`. The self-rating as it stands now is
 * `ratingNow`.
 *
 * A step the card did not have for this word (not enough checked material)
 * has no answer. A step this program does not know is KEPT as long as its
 * answer has the shape above: #37/#38 (the free-text steps) add steps, and
 * an older copy of the
 * program on another device must not delete them. Free text is `t`.
 *
 * THE SLICE IS THE PUPIL'S OWN TEXT (`ownText: true`, #49, ADR 0003,
 * docs/PRIVACY.md §1g): only the pupil can read it; it leaves the account
 * only for the pupil's own syncing, export and grading requests.
 *
 * Pure: no DOM, no clock — the day is handed in. It must not import
 * core/state.js or core/merge.js (core/slices.js).
 */

/** @typedef {import("../types").WordCards} WordCards */
/** @typedef {import("../types").WordCardRecord} WordCardRecord */
/** @typedef {import("../types").DayKey} DayKey */

/** The self-rating, in the order it is asked; saved as the index. */
export const RATINGS = Object.freeze(["aldrei", "heyrt", "nota"]);

/** Bounds of the saved slice. A card is small: at most a dozen steps, each a
    handful of chosen options. */
export const CARDS_MAX = 3000;      // more than LÍNO-2 has words
const STEPS_MAX = 16, CHOICES_MAX = 8, CHOICE_LEN = 200;
/** The longest text a free-text step keeps: what the server reads at most
    (server/grading.mjs GRADER.maxChars). */
export const TEXT_LEN = 1200;
/** The most additions a card keeps (#18): the newest. A learned word is
    reviewed about four times (1 → 3 → 7 → 21 days) and comes back on about
    a third of them, so twelve is years of a word. */
export const ADDS_MAX = 12;
/** The longest sentence a pupil may add: one sentence, as long as an option. */
export const SENTENCE_LEN = CHOICE_LEN;
/**
 * How often a review of a learned word opens the pupil's own card afterwards
 * (#18, DLD-PLAN §1: "on review they SOMETIMES see their own card again").
 * One in three: the queue asks a learned word about four times, so a pupil
 * meets each of their cards again once or twice — often enough that the card
 * is a notebook they come back to and see their own progress in (the rating
 * then and now), seldom enough that a review stays one quick question and the
 * card does not become a chore that is clicked through. Drawn from the
 * builder's random source (tasks/review.js), never the clock.
 */
export const REVISIT_RATE = 1 / 3;
const STEP_ID = /^[a-z][a-z0-9_]{0,23}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const isObj = (x) => !!x && typeof x === "object" && !Array.isArray(x);
/* The same test core/wordknowledge.js uses for a word key: "lemma|class". */
const isWordKey = (k) => typeof k === "string" && k.length > 2 && k.length <= 80
  && k.indexOf("|") > 0 && k.indexOf("|") < k.length - 1;

/** One step's answer, or null if it is not one. */
function cleanAnswer(raw) {
  if (!isObj(raw) || !Array.isArray(raw.c)) return null;
  const c = raw.c.filter((x) => typeof x === "string" && x.length > 0 && x.length <= CHOICE_LEN)
    .slice(0, CHOICES_MAX);
  /* What the pupil wrote in a free-text step (#37). */
  const t = typeof raw.t === "string" ? raw.t.trim().slice(0, TEXT_LEN) : "";
  return t ? { c, ok: raw.ok === true, t } : { c, ok: raw.ok === true };
}

const isRating = (r) => Number.isInteger(r) && r >= 0 && r < RATINGS.length;

/** One addition (#18), or null: a day and a newer rating and/or a sentence. */
function cleanAdd(raw) {
  if (!isObj(raw) || !DAY.test(String(raw.d))) return null;
  const r = isRating(raw.r) ? raw.r : null;
  const s = typeof raw.s === "string" ? raw.s.trim().slice(0, SENTENCE_LEN) : "";
  if (r == null && !s) return null;
  return { d: raw.d, ...(r != null ? { r } : {}), ...(s ? { s } : {}) };
}

/** The additions, oldest first, the newest ADDS_MAX. */
const cleanAdds = (raw) => (Array.isArray(raw) ? raw : []).map(cleanAdd).filter(Boolean)
  .sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0)).slice(-ADDS_MAX);

/** One card, or null. @returns {WordCardRecord | null} */
function cleanCard(raw) {
  if (!isObj(raw) || !DAY.test(String(raw.d))) return null;
  const r = Number(raw.r);
  if (!isRating(r)) return null;
  /** @type {WordCardRecord["a"]} */
  const a = {};
  for (const [id, v] of Object.entries(isObj(raw.a) ? raw.a : {})) {
    if (Object.keys(a).length >= STEPS_MAX) break;
    const ans = STEP_ID.test(id) ? cleanAnswer(v) : null;
    if (ans) a[id] = ans;
  }
  const n = Number(raw.n);
  const x = cleanAdds(raw.x);
  return { d: raw.d, n: Number.isInteger(n) && n >= 1 ? Math.min(n, 1000) : 1, r, a, ...(x.length ? { x } : {}) };
}

/**
 * `S.wordCards` rebuilt card by card out of whatever was saved. Never throws.
 * @param {any} raw @returns {WordCards}
 */
export function sanitiseCards(raw) {
  /** @type {WordCards} */
  const out = {};
  for (const [k, v] of Object.entries(isObj(raw) ? raw : {})) {
    if (Object.keys(out).length >= CARDS_MAX) break;
    const card = isWordKey(k) ? cleanCard(v) : null;
    if (card) out[k] = card;
  }
  return out;
}

/* One addition as a string, to tell two apart. */
const addId = (x) => `${x.d}|${x.r ?? ""}|${x.s ?? ""}`;

/**
 * Two devices: per word, the card done more times, then the one finished
 * later; this device on a tie. A card is written whole when it is finished,
 * so there is nothing to put together inside one — except what was added to
 * it later (#18), which may have been added on either device: the additions
 * of both, each once, in order of day (and then of what they are, so that
 * the result does not depend on which device merges). Pure.
 * @returns {WordCards}
 */
export function mergeCards(base, local, remote) {
  const L = sanitiseCards(local), R = sanitiseCards(remote);
  /** @type {WordCards} */
  const out = {};
  for (const k of new Set([...Object.keys(R), ...Object.keys(L)])) {
    const l = L[k], r = R[k];
    const won = !l ? r : !r ? l : (r.n > l.n || (r.n === l.n && r.d > l.d)) ? r : l;
    if (!l || !r || (!l.x && !r.x)) { out[k] = won; continue; }
    const all = new Map([...(l.x || []), ...(r.x || [])].map((x) => [addId(x), x]));
    const x = [...all.entries()].sort(([a, p], [b, q]) => (p.d < q.d ? -1 : p.d > q.d ? 1 : a < b ? -1 : a > b ? 1 : 0))
      .map(([, v]) => v).slice(-ADDS_MAX);
    const { x: _, ...card } = won;
    out[k] = { ...card, x };
  }
  return out;
}

/** @type {(S: any) => WordCards} */
const cardsOf = (S) => (S && isObj(S.wordCards) ? S.wordCards : {});

/** The pupil's card of this word, or null. The saved record itself: a reader
    must not change it. @param {any} S @param {string} word  a `wordKey` */
export const cardOf = (S, word) => cardsOf(S)[word] || null;

/** Has the pupil done this word's card? (`fillLearning`'s `ready`.)
    @param {any} S @param {string} word */
export const cardDone = (S, word) => !!cardOf(S, word);

/**
 * A card is finished today: write it into the pupil's progress. The one
 * write. Returns false (and writes nothing) for what is not a card.
 * @param {any} S @param {string} word  a `wordKey`
 * @param {{rating: number, answers: Record<string, {c: string[], ok: boolean}>}} done
 * @param {DayKey} today
 */
export function saveCard(S, word, done, today) {
  if (!isWordKey(word)) return false;
  const was = cardOf(S, word);
  /* Done again (#17): what the pupil added to the old card stays (#18). */
  const card = cleanCard({ d: today, n: (was ? was.n : 0) + 1, r: done && done.rating, a: done && done.answers,
    x: was && was.x });
  if (!card) return false;
  if (!isObj(S.wordCards)) S.wordCards = {};
  S.wordCards[word] = card;
  return true;
}

/** The self-rating as it stands now: the last one the pupil added (#18),
    else the card's own. @param {WordCardRecord} card @returns {number} */
export function ratingNow(card) {
  const later = (card.x || []).filter((x) => x.r != null);
  return later.length ? /** @type {number} */ (later[later.length - 1].r) : card.r;
}

/**
 * The pupil added to their card when it came back in a review (#18): a newer
 * self-rating and/or a sentence of their own with the word. A rating equal to
 * the one that stands is not an addition; with nothing left, nothing is
 * written. `n`, `d`, `r` and `a` are not touched. Returns whether it wrote.
 * @param {any} S @param {string} word  a `wordKey`
 * @param {{rating?: ?number, sentence?: ?string}} add  @param {DayKey} today
 */
export function addToCard(S, word, add, today) {
  const card = cardOf(S, word);
  if (!card || !add || !DAY.test(String(today))) return false;
  const r = isRating(add.rating) && add.rating !== ratingNow(card) ? add.rating : null;
  const x = cleanAdd({ d: today, r, s: add.sentence });
  if (!x) return false;
  S.wordCards[word] = cleanCard({ ...card, x: [...(card.x || []), x] });
  return true;
}

/** `S.wordCards`: the pupil's word cards. THE PUPIL'S OWN TEXT.
    @type {import("../types").Slice<WordCards>} */
export const wordCardsSlice = {
  key: "wordCards",
  blank: () => ({}),
  migrate: (raw) => sanitiseCards(raw),
  merge: (base, local, remote) => mergeCards(base, local, remote),
  /* The server: the same rebuilding, and no day after tomorrow. */
  clean: (value, { limit }) => Object.fromEntries(Object.entries(sanitiseCards(value))
    .filter(([, c]) => c.d <= limit)
    .map(([k, c]) => [k, !c.x ? c : cleanCard({ ...c, x: c.x.filter((x) => x.d <= limit) })])),
  ownText: true,
};
