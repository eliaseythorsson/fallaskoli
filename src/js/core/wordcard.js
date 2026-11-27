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
 * A step the card did not have for this word (not enough checked material)
 * has no answer. A step this program does not know is KEPT as long as its
 * answer has the shape above: #18 (adding to your own card) and #37/#38 (the
 * free-text "in my own words" step) add steps, and an older copy of the
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

/** One card, or null. @returns {WordCardRecord | null} */
function cleanCard(raw) {
  if (!isObj(raw) || !DAY.test(String(raw.d))) return null;
  const r = Number(raw.r);
  if (!Number.isInteger(r) || r < 0 || r >= RATINGS.length) return null;
  /** @type {WordCardRecord["a"]} */
  const a = {};
  for (const [id, v] of Object.entries(isObj(raw.a) ? raw.a : {})) {
    if (Object.keys(a).length >= STEPS_MAX) break;
    const ans = STEP_ID.test(id) ? cleanAnswer(v) : null;
    if (ans) a[id] = ans;
  }
  const n = Number(raw.n);
  return { d: raw.d, n: Number.isInteger(n) && n >= 1 ? Math.min(n, 1000) : 1, r, a };
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

/**
 * Two devices: per word, the card done more times, then the one finished
 * later; this device on a tie. A card is written whole when it is finished,
 * so there is nothing to put together inside one. Pure.
 * @returns {WordCards}
 */
export function mergeCards(base, local, remote) {
  const L = sanitiseCards(local), R = sanitiseCards(remote);
  /** @type {WordCards} */
  const out = {};
  for (const k of new Set([...Object.keys(R), ...Object.keys(L)])) {
    const l = L[k], r = R[k];
    out[k] = !l ? r : !r ? l : (r.n > l.n || (r.n === l.n && r.d > l.d)) ? r : l;
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
  const card = cleanCard({ d: today, n: (was ? was.n : 0) + 1, r: done && done.rating, a: done && done.answers });
  if (!card) return false;
  if (!isObj(S.wordCards)) S.wordCards = {};
  S.wordCards[word] = card;
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
    .filter(([, c]) => c.d <= limit)),
  ownText: true,
};
