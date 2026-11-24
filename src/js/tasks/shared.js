// @ts-check
/* What the category files share: the random source, the weight of a word
   (`wordWeight` — the view's `pickWord` draws by it, tasks/view.js), sentence
   pools, the curriculum gate, and the small text helpers.

   Nothing here knows about any one category. A helper used by one category
   only lives in that category's file; the two BUILDERS that more than one
   category asks for are in files of their own (cloze.js, tap.js). */

import { readMark, isStyfdur } from "../core/marks.js";
import { bandOf, diffOf, hardnessWeight } from "../core/difficulty.js";
import { skillLevel } from "../core/progress.js";
import { wordKey } from "../core/state.js";
import { wordRecord } from "../core/wordknowledge.js";
import { chooseWord } from "../core/spacing.js";
import { FX } from "./effects.js";

/** @typedef {import("../types").View} View */
/** @typedef {import("../types").Rng} Rng */
/** @typedef {import("../types").Policy} Policy */
/** @typedef {import("../types").State} State */
/** @typedef {import("../types").Lexicon} Lexicon */

/* ---------- the random source -------------------------------------------
 *
 * Every draw a builder makes goes through `rng`, which is passed in. There is
 * no default on purpose: a call that forgets it fails at once ("rng is not a
 * function") instead of quietly falling back on the global generator and
 * making a duel's questions differ between two browsers. That generator is
 * not named anywhere in this folder — tests/purity.test.js greps for it, and
 * builds every type with it taken away. */

/** One item of `a`. @template T @param {readonly T[]} a @param {Rng} rng @returns {T} */
export const pick = (a, rng) => a[Math.floor(rng() * a.length)];

/** A whole number from 0 up to (not including) n.
    @type {(n: number, rng: Rng) => number} */
export const randInt = (n, rng) => Math.floor(rng() * n);

/** One item, chosen with weight `wf(item)` (never quite 0).
    @template T @param {readonly T[]} items @param {(x: T) => number} wf
    @param {Rng} rng @returns {T} */
export function wpick(items, wf, rng) {
  const total = items.reduce((s, i) => s + Math.max(wf(i), 1e-4), 0);
  let r = rng() * total;
  for (const i of items) { r -= Math.max(wf(i), 1e-4); if (r <= 0) return i; }
  return items[items.length - 1];
}

/** A shuffled copy.
    @template T @param {Iterable<T>} a @param {Rng} rng @returns {T[]} */
export function shuffle(a, rng) {
  const x = [...a];
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
}

/* ---------- the curriculum gate ------------------------------------------ */

/* The one gate every cell goes through: the policy, plus the one cell the
 * program never teaches — the shortened imperative (core/marks.js). */
/** @type {(P: Pick<Policy, "mark">, m: ?string) => boolean} */
export const askable = (P, m) => !!m && !isStyfdur(m) && P.mark(m);

/** The band this skill may run at, never above what the policy permits.
    @type {(view: View, skill: string) => number} */
export const bandFor = (view, skill) => Math.min(bandOf(view.sess, skill), view.policy.maxLevel);

/** A level this child may meet: the item's own, or the nearest allowed.
    @type {(P: Pick<Policy, "level"|"levels">, want: number) => number} */
export const levelFor = (P, want) => (P.level(want) ? want
  : P.levels.reduce((b, x) => (Math.abs(x - want) < Math.abs(b - want) ? x : b), P.levels[0]));

/** Sentences at about the right difficulty AND at a difficulty this child is
   allowed to meet. The band is clamped to the policy's ceiling, so a class that
   is only working at þyngd 1-2 never has the band drift above it however well
   the child does.
   @param {Lexicon} lex @param {View} view @param {string} skill @param {number} [maxLvl] */
export const sentPool = (lex, view, skill, maxLvl) => {
  const P = view.policy;
  const b = Math.min(maxLvl ?? bandOf(view.sess, skill), P.maxLevel);
  const allowed = lex.sentences.filter((s) => P.level(s.lvl));
  const p = allowed.filter((s) => s.lvl <= b && s.lvl >= b - 1);
  return p.length ? p : allowed.filter((s) => s.lvl <= b);
};

/* ---------- choosing by difficulty (v6.13, critique item 13) --------------
 *
 * About twenty question types built the same questions at þyngd 1 and 5:
 * the hand-written ones (every item of pipeline/exercises.py now carries a level,
 * judged by the rule written there) and a few that drew from the whole
 * sentence bank. These two choose what is near the band instead.
 *
 * `nearBand` keeps the items at the band and one level below it — the same
 * window as `sentPool` — and widens one level each way until at least `min`
 * are left, so a small list never shrinks to one item repeated, and a band
 * the list has nothing at borrows from its neighbours rather than from
 * anywhere. The band is first brought down to the highest level the list
 * has: a list that stops at 3 is the same list at þyngd 4, 5, 6 and 7. */

/** The items near `band` by `lvlOf`, at least `min` of them if there are.
    @template T @param {T[]} items @param {(x: T) => number} lvlOf
    @param {number} band @param {number} [min] @returns {T[]} */
export function nearBand(items, lvlOf, band, min = 4) {
  if (items.length <= min) return items;
  const top = Math.max(...items.map(lvlOf));
  const b = Math.min(band, top);
  for (let r = 0; r <= 6; r++) {
    const got = items.filter((x) => { const l = lvlOf(x); return l >= b - 1 - r && l <= b + r; });
    if (got.length >= min) return got;
  }
  return items;
}

/**
 * Hand-written items (data/exercises.js, each with its `lvl`) for this
 * pupil now: of a level the policy allows (if any is), not asked yet in this
 * visit (if any is left — `fresh` below), near the band of `skill`. A
 * builder picks one of what this returns, and labels the question with the
 * item's own level (`levelFor`).
 *
 * @template {{lvl: number}} T
 * @param {View} view @param {string} skill @param {T[]} items
 * @param {((x: T) => string)|null} key @param {number} [min] @returns {T[]}
 */
export function itemsForBand(view, skill, items, key, min = 4) {
  if (!items.length) return items;
  const P = view.policy;
  const allowed = items.filter((x) => P.level(x.lvl));
  const pool = allowed.length ? allowed : items;
  const seen = new Set(view.sess.exSeen || []);
  const unseen = key ? pool.filter((x) => !seen.has(key(x))) : pool;
  return nearBand(unseen.length ? unseen : pool, (x) => x.lvl, bandFor(view, skill), min);
}

/* ---------- a review (v6.13, tasks/review.js) -----------------------------
 *
 * A review asks for one cell, one word, or both (tasks/view.js). The word is
 * the view's strict `mustAsk`, as in a rescue drill, and the view hands it
 * over (`pickWord`, `askedWord`). These read the rest (`view.force`). A builder that honours a forced cell builds that
 * cell or returns null. */

/** The cell a review asks for, or null. @type {(view: View) => ?string} */
export const forcedCell = (view) => (view.force && view.force.cell) || null;
/** The hand-written item a review asks for, or null. @type {(view: View) => ?string} */
export const forcedItem = (view) => (view.force && view.force.item) || null;
/** May this cell be built? Always, unless a review asks for another.
    @type {(view: View, m: string) => boolean} */
export const cellWanted = (view, m) => !forcedCell(view) || forcedCell(view) === m;

/* ---------- choosing a word ---------------------------------------------- */

/* The frequency cap is a SHARE of the pool, not a rank: a fixed rank chosen
 * for 310 adjectives covered a fifth as much once there were 957. The shares
 * reproduce the old selection for a beginner and follow the corpus. */

/** The top `share` of the pool by frequency. An empty pool -> the whole pool.
    `rankOf` reads the rank of an item that is not itself a lexicon entry
    (no_beyging's pool is `{ n, kind, trap }`). Until v6.13 such a pool had
    no `.r`, nothing passed the filter, and the whole pool came back: the
    cap did nothing and nobody noticed. An item without a rank now throws. */
export function topByRank(pool, share, rankOf = (x) => x.r) {
  if (!pool.length) return pool;
  const cut = Math.max(20, Math.ceil(pool.length * Math.min(1, share)));
  const out = pool.filter((x) => {
    const r = rankOf(x);
    if (typeof r !== "number") throw new TypeError("topByRank: an item without a frequency rank");
    return r <= cut;
  });
  return out.length ? out : pool;
}

/** A share that grows with skill level. Level 1 -> `base`, each level adds `step`. */
export const shareForLevel = (L, base, step) => Math.min(1, base + step * (Math.max(1, L) - 1));

/** Per-word key for a parsed sentence token.
 *
 * Never `wordKey(t.l, t.x)`: Greynir's short code for a noun is `no`, which is
 * not a class the lexicon or the collection knows, so those words were filed
 * under a key nothing could ever look up. See `entryForToken` in core/lexicon.js.
 * Returns `null` when the token has no lexicon entry, and `record()` then keeps
 * no per-word statistics — which is right, since there is no word to keep them
 * against. */
export function tokenKey(lex, t) {
  const e = lex.entryForToken(t);
  return e ? wordKey(e.o, e.c) : null;
}

/** The key of a word given by lemma and class, or null if the lexicon lacks it. */
export const lexWord = (lex, l, c) => { const w = lex.lookup(l, c); return w ? wordKey(w.o, w.c) : null; };

/* `cut` splits a class into common words (full weight) and the tail (0.15).
   The number was 60 + L*60 when there were 1,244 nouns; it is a scaling of the
   same proportion now, so the tail does not become proportionally larger as
   the corpus grows. It depends on the lexicon alone, so it is worked out once
   per lexicon and kept here — not on the state, which a builder may not
   write to. */
const RANK_CUT = new WeakMap();
function rankCut(lex, cls) {
  const size = () => Math.ceil(Math.max(400, ((lex && lex.byClass && lex.byClass[cls]) || []).length) * 0.39);
  if (!lex || typeof lex !== "object") return size();
  let m = RANK_CUT.get(lex);
  if (!m) RANK_CUT.set(lex, (m = {}));
  return (m[cls] ??= size());
}

/* ---------- the second axis: hard words, hard cells (item 16) -------------
 *
 * The level a skill runs at chooses the sentence (`sentPool`) and, since
 * v6.13, also how irregular the word may be and how hard the cell: see "the
 * second axis" at the top of core/difficulty.js. Both helpers return a
 * factor in [HARD_FLOOR, 1] to multiply into a weight (or to use as the odds
 * of keeping a draw); neither ever returns 0, so nothing is starved. */

/** The level the second axis reads: the skill's live level, in halves, never
    above what the policy permits (as `bandFor`, but not rounded).
    @type {(view: View, skill: string) => number} */
export const axisLevel = (view, skill) =>
  Math.min(diffOf(view.sess, skill), view.policy.maxLevel ?? Infinity);

/** The factor for a word of this irregularity (`x.irr`, set by the build). */
export const wordEase = (view, x, skill) => hardnessWeight(axisLevel(view, skill), x.irr);

/** The factor for the cell with BÍN mark `m`. During a review the cell is
    given, not chosen, so every cell counts the same. */
export const cellEase = (lex, view, skill, m) =>
  (forcedCell(view) || !lex.cellHardness ? 1
    : hardnessWeight(axisLevel(view, skill), lex.cellHardness(m)));

/** The same factor WITHIN the case of `m`: the cell is scored against the
    bare singular of its own case (*hests* for *hestanna*), so only what the
    number and the article add counts — not the case itself.

    For a builder that has already decided how often each case is asked
    (the noun cloze, critique item 15: the dative and the genitive often, the
    nominative little). The cell table scores the genitive singular 3 and
    the dative 2, so `cellEase` alone put every genitive at its floor at
    þyngd 1 and the genitive fell back to the rarest case — undoing item 15.
    With this, a beginner is asked the genitive as often as item 15 wants,
    and mostly *hests*, *bókar*; *hestanna* stays rare until the level reaches
    it (item 16). A mark without a case, or without scores, counts 1. */
export function caseCellEase(lex, view, skill, m) {
  if (forcedCell(view) || !lex.cellHardness) return 1;
  const base = m.replace(/^(.*?(?:NF|ÞF|ÞGF|EF))(?:ET|FT)(?:gr)?$/, "$1ET");
  const h = lex.cellHardness(m), h0 = lex.cellHardness(base);
  if (h == null || h0 == null) return 1;
  return hardnessWeight(axisLevel(view, skill), 1 + Math.max(0, h - h0));
}

/** The weight of a word, for the view's word choice (tasks/view.js
    `pickByWord`; no builder calls this itself, #45): common words first, rarer as the skill level grows, regular
    words first and irregular ones as the level of the session grows, and
    words this child gets wrong come back sooner.
    @param {Lexicon} lex @param {View} view
    @param {{o: string, c: string, r: number, irr?: number}} x  a lexicon entry
    @param {string} skill @returns {number} */
export function wordWeight(lex, view, x, skill) {
  const { S, sess } = view;
  const L = skillLevel((S.skills[skill] || {}).xp || 0).level;
  const rec = wordRecord(S, wordKey(x.o, x.c)) || { c: 0, w: 0 };
  const seen = rec.c + rec.w;
  /* The smoother falloff below makes common words many times likelier within
     both halves of the pool — that, not the cap, is what ensures the child
     gets *kvöld* far more often than a rare word. */
  const cut = rankCut(lex, x.c);
  let base = x.r <= cut * (0.5 + 0.07 * L) ? 1 : 0.15;
  base *= 1 / (1 + x.r / 150);
  if (x.o.length > 9 && L < 4) base *= 0.5;
  if (seen >= 4 && rec.w === 0) base *= 0.35;
  if (seen > 0) base *= 1 + 2.2 * (rec.w / seen);
  if (sess.seen.slice(-6).includes(x.o)) base *= 0.2;
  /* Applied last and to everything above: a hard word a child got wrong
     still comes back sooner than a hard word they have not met. */
  base *= wordEase(view, x, skill);
  return base;
}

/** @type {(S: State, m: string) => number} */
export const cellWeight = (S, m) => {
  const c = S.cells[m] || { c: 0, w: 0 };
  const n = c.c + c.w;
  return n < 3 ? 3 : 1 + 4 * (c.w / n);
};

/** Every token in the sentence bank that is this word, as {s, i, t}. */
export function tokensOf(lex, view, entry, keep) {
  const P = view.policy;
  const key = wordKey(entry.o, entry.c);
  const out = [];
  lex.sentences.forEach((s) => {
    if (!P.level(s.lvl)) return;
    s.tok.forEach((t, i) => { if (keep(t) && tokenKey(lex, t) === key) out.push({ s, i, t }); });
  });
  return out;
}

/** Do all these cells hold the same form(s)? Four cells with the same word in
    them are not a declension (*hvaða*, *þriðju* × 4). */
export const sameInEveryCell = (w, cells) =>
  new Set(cells.map((c) => (w.forms[c.m] || []).join("|"))).size < 2;

/* ---------- text ---------------------------------------------------------- */

export const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const caseWord = (k) => ({ NF: "nefnifall", ÞF: "þolfall", ÞGF: "þágufall", ÞG: "þágufall", EF: "eignarfall" }[k] || k);
export const caseOf = (m) => { const f = readMark(m).fall; return f === "ÞG" ? "ÞGF" : f; };
export const PUNCT = new Set([".", ",", "!", "?", ";", ":"]);

/** A sentence every word of which has a class the build vouched for. */
export const clean = (s) => s.tok.every((t) => PUNCT.has(t.w) || (t.c && !t.rj));

/** Words or punctuation, with "___" as one token: a hand-written sentence in
    the same shape as a bank sentence, so one renderer draws both. */
export function textSentence(text) {
  const tok = (text.match(/___|[\p{L}\p{N}]+|[.,!?;:]/gu) || []).map((w) => ({ w }));
  return { s: { tok, t: text }, i: tok.findIndex((t) => t.w === "___") };
}

/* ---------- hand-written items: not the same one straight away ------------
 *
 * Recently asked hand-written items (data/exercises.js) are not asked again
 * straight away. `fresh` reads what the session remembers; the builder that
 * uses an item returns `FX.exSeen(key)` beside its task, and the item is
 * remembered when — and only when — the question is shown. */

/** @template T @param {View} view @param {(x: T) => string} key @param {T[]} list
    @returns {T[]} */
export function fresh(view, key, list) {
  const seen = view.sess.exSeen || [];
  const ok = list.filter((x) => !seen.includes(key(x)));
  return ok.length ? ok : list;
}

/* ---------- the vocabulary gate -------------------------------------------
 *
 * Which word an Orðaforði question is about, across sessions and days.
 * Two rules, both from what children said: (1) the same word must not keep
 * coming back — knowing a word's meaning once is knowing it, so the
 * vocabulary question's gate applies (core/spacing.js: never twice in a day,
 * never within a week, new words first), under a key of its own per kind
 * of question; (2) the words get rarer as the level rises. A word's rank is
 * its place in the frequency list (1 = commonest). The band picks a window
 * of ranks; when nothing in it may be asked, the window widens, commonest
 * first, so a question still comes.
 *
 * Orðaforði only. Until v6.13 two Töluorð types (to_samr, to_flt) went
 * through it too; numeral agreement is grammar and needs repeating, so they
 * now use the review queue and a same-session gate (tasks/toluord.js,
 * critique item 20). It stays in this file because the rule is general.
 *
 * Returns { x, fx }: the item, and the effect that marks it as asked once the
 * question is shown. The mark used to be written here, at once — so every
 * candidate that was built and thrown away locked its item for a week
 * (critique item 4). */
export const RANK_CAP = [0, 700, 1500, 2600, 4000, 6000, 9000, Infinity];
/* A lexicon entry's `r` is its rank within its own class (the nouns run to
   about 1,400, the adjectives and verbs to about 1,000), not the place in
   the frequency list that RANK_CAP is measured on. Labelling a question by
   how rare its words are needs this scale: each step holds roughly a fifth
   of a class's common words, the last step the tail. */
export const CLASS_RANK_CAP = [0, 150, 350, 600, 950, Infinity];
/** The level, 1-5, of a word of this class rank. */
export const classRankLevel = (r) => { let L = 1; while (L < 5 && r > CLASS_RANK_CAP[L]) L++; return L; };
/**
 * @template T
 * @param {View} view @param {Rng} rng @param {string} kind @param {T[]} items
 * @param {(x: T) => string} keyOf @param {(x: T) => number} rankOf
 * @param {number} [maxBand]
 * @returns {?{x: T, fx: import("../types").BuildEffect}}
 */
export function pickVocab(view, rng, kind, items, keyOf, rankOf, maxBand = 7) {
  if (!items.length) return null;
  /* `maxBand`: a list whose items stop at level 5 (or_samhengi, or_myndun)
     stays at band 5's window above it, instead of reaching the empty top
     window and widening back to everything. */
  const b = Math.min(bandFor(view, "ordaford"), maxBand);
  const cap = RANK_CAP[b] ?? Infinity, floor = b > 2 ? RANK_CAP[b - 2] : 0;
  const wrap = items.map((x) => ({ x, key: `${kind}:${keyOf(x)}`, r: rankOf(x) }));
  const tiers = [wrap.filter((p) => p.r > floor && p.r <= cap), wrap.filter((p) => p.r <= cap)];
  RANK_CAP.slice(b + 1).forEach((c) => tiers.push(wrap.filter((p) => p.r <= c)));
  for (const t of tiers) {
    if (!t.length) continue;
    const c = chooseWord(view.S, t, view.today, rng);
    /* tasks/effects.js is not type-checked yet, so FX's `op` is a plain string to tsc. */
    if (c) return { x: c.x, fx: /** @type {import("../types").BuildEffect} */ (FX.asked(c.key, view.today)) };
  }
  return null;
}

/* ---------- time phrases (v6.9) -------------------------------------------
 *
 * "Sólin skín í dag": the question asked which case *í* governs, and the
 * explanation offered the rule for *í* and *á* — motion takes the accusative,
 * location the dative. Neither applies to a time phrase, and following the rule
 * leads a child to the wrong case (*í síðustu viku* is dative, *í dag*
 * accusative, and neither is motion or location). There is no rule to reason
 * with, so a preposition that heads a time phrase is left out of the
 * fallstjórn question; where a time phrase still turns up (the cloze), it gets
 * its own explanation (tasks/explain.js `explainTimePhrase`). *tími* is left
 * out of the test: *í tímanum* is usually "in the lesson", a place. */
export const isTimeNoun = (e) => !!e && e.s === "time" && e.o !== "tími";
const TIME_MODIFIER = new Set(["lýsingarorð", "fornafn", "töluorð", "greinir"]);

/** Does the preposition at `i` head a time phrase? */
export function headsTimePhrase(lex, s, i) {
  const t = s.tok[i];
  if (!t || t.c !== "forsetning") return false;
  let j = i + 1;
  while (s.tok[j] && (TIME_MODIFIER.has(s.tok[j].c) || s.tok[j].rj)) j++;
  const n = s.tok[j];
  if (!n || n.c !== "nafnorð") return false;
  return isTimeNoun(lex.entryForToken ? lex.entryForToken(n) : null);
}

/* ---------- two-option questions asked in pairs (item 43) ------------------
 *
 * A question with two options is right half the time by guessing and paid
 * the same XP. The three of them (fs_hreyf, ob_fsao, fn_aftur) are all
 * built on a CONTRAST — the same word or sentence in two roles — so they are
 * asked as the contrast: both sentences on one card, each with its own two
 * options, and the answer counts only when both are right.
 *
 * The task is the first sentence's question as before, with the second's
 * under `second` (same fields: s, i, mark, gloss, question, options, answer,
 * why, m, paradigm, optMarks, miss). `core/answer.js` `JUDGES.choice` grades
 * both; `ui/render-more.js` `RENDER.choice` draws both. A task without
 * `second` is unchanged. */
export const PAIR_LEAD = "Tvær setningar með sama orðið. Báðar þurfa að vera réttar.";

/** The fields of one half of a pair, taken off a built choice task. */
const HALF = ["s", "i", "mark", "gloss", "question", "options", "answer", "why", "m", "paradigm", "optMarks", "miss"];
export const halfOf = (t) => Object.fromEntries(HALF.filter((k) => t[k] !== undefined).map((k) => [k, t[k]]));

/** `first` and `second` are two choice tasks made by the type's single-question
    code; the pair is `first` with `second` attached, and a lead line. */
export const pairOf = (first, second) => ({ ...first, second: halfOf(second), lead: PAIR_LEAD });
