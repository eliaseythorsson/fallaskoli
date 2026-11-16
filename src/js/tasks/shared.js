/* What the category files share: the random source, word choice, sentence
   pools, the curriculum gate, and the small text helpers.

   Nothing here knows about any one category. A helper used by one category
   only lives in that category's file; the two BUILDERS that more than one
   category asks for are in files of their own (cloze.js, tap.js). */

import { readMark, isStyfdur } from "../core/marks.js";
import { bandOf } from "../core/difficulty.js";
import { skillLevel } from "../core/progress.js";
import { wordKey } from "../core/state.js";
import { chooseWord } from "../core/spacing.js";
import { FX } from "./effects.js";

/* ---------- the random source -------------------------------------------
 *
 * Every draw a builder makes goes through `rng`, which is passed in. There is
 * no default on purpose: a call that forgets it fails at once ("rng is not a
 * function") instead of quietly falling back on the global generator and
 * making a duel's questions differ between two browsers. That generator is
 * not named anywhere in this folder — tests/purity.test.js greps for it, and
 * builds every type with it taken away. */

export const pick = (a, rng) => a[Math.floor(rng() * a.length)];

/** A whole number from 0 up to (not including) n. */
export const randInt = (n, rng) => Math.floor(rng() * n);

export function wpick(items, wf, rng) {
  const total = items.reduce((s, i) => s + Math.max(wf(i), 1e-4), 0);
  let r = rng() * total;
  for (const i of items) { r -= Math.max(wf(i), 1e-4); if (r <= 0) return i; }
  return items[items.length - 1];
}

/** A shuffled copy. */
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
export const askable = (P, m) => !!m && !isStyfdur(m) && P.mark(m);

/** The band this skill may run at, never above what the policy permits. */
export const bandFor = (view, skill) => Math.min(bandOf(view.sess, skill), view.policy.maxLevel);

/** A level this child may meet: the item's own, or the nearest allowed. */
export const levelFor = (P, want) => (P.level(want) ? want
  : P.levels.reduce((b, x) => (Math.abs(x - want) < Math.abs(b - want) ? x : b), P.levels[0]));

/* Sentences at about the right difficulty AND at a difficulty this child is
   allowed to meet. The band is clamped to the policy's ceiling, so a class that
   is only working at þyngd 1-2 never has the band drift above it however well
   the child does. */
export const sentPool = (lex, view, skill, maxLvl) => {
  const P = view.policy;
  const b = Math.min(maxLvl ?? bandOf(view.sess, skill), P.maxLevel);
  const allowed = lex.sentences.filter((s) => P.level(s.lvl));
  const p = allowed.filter((s) => s.lvl <= b && s.lvl >= b - 1);
  return p.length ? p : allowed.filter((s) => s.lvl <= b);
};

/* ---------- the rescue drill ---------------------------------------------
 *
 * The rescue drill (v6.6) asks about ONE word again and again. Every builder
 * that chooses a word asks this first: during a drill it hands back the drilled
 * word if it belongs to one of these classes, and null otherwise — in which
 * case a builder for some other class has nothing to do and returns null. */
export const forced = (view, classes) => {
  const w = view.drillWord;
  return w && classes.includes(w.c) ? w : null;
};
export const drilling = (view) => !!view.drillWord;

/* ---------- choosing a word ---------------------------------------------- */

/* The frequency cap is a SHARE of the pool, not a rank: a fixed rank chosen
 * for 310 adjectives covered a fifth as much once there were 957. The shares
 * reproduce the old selection for a beginner and follow the corpus. */

/** The top `share` of the pool by frequency. An empty pool -> the whole pool. */
export function topByRank(pool, share) {
  if (!pool.length) return pool;
  const cut = Math.max(20, Math.ceil(pool.length * Math.min(1, share)));
  const out = pool.filter((x) => x.r <= cut);
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

/** Word choice: common words first, rarer as the skill level grows, and
    words this child gets wrong come back sooner. */
export function wordWeight(lex, view, x, skill) {
  const { S, sess } = view;
  const L = skillLevel((S.skills[skill] || {}).xp || 0).level;
  const rec = S.words[wordKey(x.o, x.c)] || { c: 0, w: 0 };
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
  return base;
}

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
 * Here because two categories use it: Orðaforði, and the two Töluorð types
 * whose items are spaced the same way (to_samr, to_flt).
 *
 * Returns { x, fx }: the item, and the effect that marks it as asked once the
 * question is shown. The mark used to be written here, at once — so every
 * candidate that was built and thrown away locked its item for a week
 * (critique item 4). */
export const RANK_CAP = [0, 700, 1500, 2600, 4000, 6000, 9000, Infinity];
export function pickVocab(view, rng, kind, items, keyOf, rankOf) {
  if (!items.length) return null;
  const b = bandFor(view, "ordaford");
  const cap = RANK_CAP[b] ?? Infinity, floor = b > 2 ? RANK_CAP[b - 2] : 0;
  const wrap = items.map((x) => ({ x, key: `${kind}:${keyOf(x)}`, r: rankOf(x) }));
  const tiers = [wrap.filter((p) => p.r > floor && p.r <= cap), wrap.filter((p) => p.r <= cap)];
  RANK_CAP.slice(b + 1).forEach((c) => tiers.push(wrap.filter((p) => p.r <= c)));
  for (const t of tiers) {
    if (!t.length) continue;
    const c = chooseWord(view.S, t, view.today, rng);
    if (c) return { x: c.x, fx: FX.asked(c.key, view.today) };
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
