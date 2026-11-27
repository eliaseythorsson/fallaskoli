/* What a builder may look at — and how it chooses a word.

   A builder is a function of three things and nothing else:

       build(lex, view, rng)  →  { task, effects }  or  null

     lex    the lexicon and the sentence bank (core/lexicon.js)
     view   this file: the pupil's state and the session, lent READ-ONLY
     rng    the random source, a function returning a number in [0, 1).
            Never the global generator: a duel passes a seeded one, and so
            can a test or a bug report.

   Building a question changes nothing. Whatever showing it should change is
   returned beside it (tasks/effects.js). The view object is frozen; `S` and
   `sess` inside it are the live objects and are not frozen here (that would
   stop the app writing to them a moment later) — tests/purity.test.js freezes
   them all the way down and builds every type, which is what holds the rule.

     S           the saved state: skills (XP), words, cells, word knowledge
     sess        the session: diff per skill, seen, exSeen, sinceTable,
                 lastAsked (the question just shown) …
     policy      core/policy.js — what this child may meet, narrowed to the
                 session's topic by whoever builds the view
     today       the day as a key ("2026-11-16"); builders never read the clock
     typeId      the question type being built ("fill", "tbl_no" …), or null
                 when a builder is called on its own (a test). Set by whoever
                 calls the builder: tasks/next.js, drill.js and review.js.
     mustAsk     the one word this question is to be about, or null — see
                 "Choosing a word" below
     mix         { n, counts } for the mix rule of a session, or null
     inRun       inside a practice session
     huntPrefer  the Villuveiðar error kinds this child misses
     force       what a review asks for (tasks/review.js), or null:
                 { cell, item, avoid } — the cell (a BÍN mark, or whatever
                 the type files its answers under), a hand-written item's
                 key, and a sentence not to use again. The word a review
                 asks for is the view's `mustAsk` (strict). A builder honours
                 what it can and builds nothing else: with `force` set it
                 returns the question asked for or null, never some other
                 question. `forcedCell` in tasks/shared.js reads the cell. A
                 builder that does not know the hook simply builds as usual,
                 and tasks/review.js keeps the question only if it matches.
     learning    the words in learning (#12, core/wordknowledge.js
                 `wordsInLearning`) as `wordKey`s, or null. Only ordinary
                 practice passes them (control/session.js: Lota dagsins and
                 a session the pupil chose). A duel and a live round (one seed,
                 one question for many), a rescue drill (one given word) and a
                 review (the missed word and form) pass none, and drill.js and
                 review.js clear it themselves — see "Words in learning" below.
     cal         the calibration table (core/calibration.js), or null. Only
                 ordinary practice passes one — an empty table when the
                 server has published none. It does two things in
                 tasks/next.js: a type the table has moved is built a step
                 easier or harder, and the task is marked as one whose answer
                 may be counted (`calBand`). A duel, a drill and a review
                 pass none: two browsers must build the same duel from one
                 seed whatever table each has fetched.

   ---- Choosing a word (#45) ----------------------------------------------

   A builder chooses the POOL: which words fit this frame, this class, this
   band, this cell. The view chooses WHICH WORD of the pool. So a rule about
   which words come up — how often, how soon again, which are favoured — is
   written once, here, and every builder follows it.

     mustAsk     { word, strict } or null. `word` is a lexicon entry.
                 strict: true   this word or nothing. Set for a rescue drill
                                (tasks/drill.js) and for a review that asks
                                for a word (tasks/review.js). A builder that
                                cannot ask about it returns null.
                 strict: false  this word if it fits, otherwise carry on:
                                the noun a pupil just got wrong in a cloze,
                                asked again in the next cloze whose sentence
                                accepts it (the host's `forcedNoun`). Only
                                the cloze looks for it (`retryWord`); if no
                                sentence takes it, tasks/next.js lets it go
                                and builds as if there were none.
                 `makeView` still takes the hosts' names for the two —
                 `drillWord` (strict) and `forcedNoun` (not strict) — and
                 turns them into this one field.

   The methods below are called on the view (`view.pickWord(…)`), never
   detached from it: they read the view they are called on (`this`), so a
   view derived with `withView` — or spread into a new object — chooses by
   its own fields. Like the builders they are pure: they draw only from the
   `rng` handed in, read no clock and write nothing.

     pickWord(lex, pool, skill, rng, classes)
         The word to ask about, from `pool` (lexicon entries), or null.
         With a strict `mustAsk` whose class is one of `classes`: that word,
         whether or not it is in the pool, and no number is drawn. With a
         strict `mustAsk` of another class, or one the last question asked
         in this type (#10): null (this builder cannot ask about it now).
         Otherwise one word of the pool, by `pickByWord`.
         A non-strict `mustAsk` is not looked at here.

     pickByWord(lex, items, wordOf, skill, rng, factor?)
         One of `items` chosen by the word each carries (`wordOf(item)`,
         a lexicon entry): every weighted choice of a word goes through
         here, for builders whose pool is of slots or wrappers ({ n, kind },
         a sentence slot with its word) as well as plain words — so a rule
         added here reaches them all. The weight is `wordWeight` in
         tasks/shared.js (frequency, the skill's level, the word's
         irregularity, what this pupil gets wrong, what the session has just
         seen) times `factor(item)` if one is given. An item whose word the
         last question asked in this type is never the answer (#10): if the
         draw lands on one, it is drawn again from the rest (one more
         number), which gives the odds of leaving it out from the start
         while a seed keeps its meaning wherever the rule is silent. It does
         not look at
         `mustAsk`: a builder that uses it has already narrowed its items to
         the word that must be asked. Draws exactly one number, also from
         an empty list (then the answer is null) — as `wpick` always has, so
         a seed means the same questions it meant before #45 — and a second
         only when the spacing rule turns the first down.

     askedWord(classes?)
         The strict `mustAsk` word if its class is one of `classes` (any
         class when `classes` is left out), else null. For a builder that
         does more with the word than choose it (searches its sentences,
         finds its wrapper in a pool).

     cannotAsk(classes?)
         Is there a strict `mustAsk` word this builder cannot ask about —
         one whose class is not in `classes`? `cannotAsk([])` is true for
         any strict word: for builders that ask about no lexicon word at all.
         A builder checks it first and returns null, before it draws.

     retryWord()
         The non-strict `mustAsk` word (the cloze's noun asked again), or
         null.

     pickWord(lex, pool, skill, rng, classes, wider)
     pickByWord(lex, items, wordOf, skill, rng, factor, wider)
         `wider` (optional): every item that fits the frame, before the
         builder's frequency cut. A word in learning from it may be asked
         though it is rarer than the pool allows (#13, below). A builder
         passes it only when the pool was cut by frequency alone, so
         whatever is in `wider` fits the question as well as the pool does.

     wordBoost(wordKeys)
         A weight multiplier for a builder that chooses a SENTENCE (or an
         item) first — analysis, syntax, the cloze's sentence — by the
         words in it (`wordKey`s, core/state.js). 0 if one of them is the
         word the last question asked in this type (`justAsked`), else 1.
         A builder multiplies it into a weight it already has; it must not
         turn a uniform `pick` into a `wpick` just to call it, because the
         two read the same number differently and a seed would stop meaning
         the same question. (The preference for words in learning is not a
         multiplier: see `preferLearning`.)

   ---- Words in learning (#13, docs/DLD-PLAN.md §1) ------------------------

   In ordinary practice (the view's `learning` is set) a question that
   COULD be about a word in learning is about one LEARNING_SHARE of the
   time — a share, not a multiplier (owner, 2026-11-24): a multiplier gives
   a word with weight 0.01 nothing and a word that is already common far
   too much. It is decided in one place, for every category:

     inLearning(wordKey)
         Is this a word in learning that this view prefers? Never the word
         the last question asked in this type (the spacing rule wins). False
         in every view without `learning`.

     preferLearning(items, isLearning, rng)
         The items to draw from. When some items are about a word in
         learning (`isLearning(item)`) and some are not, one number is drawn:
         below LEARNING_SHARE the learning ones, otherwise the rest. In every
         other case — no `learning` in the view, none of the items, or all of
         them — `items` itself, and NO number is drawn: a duel, a drill, a
         review or a pupil with no words in learning gets the questions a
         seed always gave. `pickByWord` calls it for every word-first
         builder; a sentence-first builder calls it on its sentences (or
         items) with "has a word in learning that it could ask about", and
         if the draw went to the learning side, asks about that word
         (tasks/greining.js `taskParse`, obeygjanleg.js, fallstjorn.js).

   ---- The spacing rule (#10, docs/DLD-PLAN.md §1) -------------------------

   The same word is never asked in the same question type in two
   consecutive questions. The same word in another type — or another cell
   of it in another type — may come straight after; and there is no wait in
   days any more (the old gate, core/spacing.js: not the same day, not
   within a week, not within a month after two showings, is gone with
   `S.vocab`).

   "The last question" is the SESSION's (`sess.lastAsked`, written by the
   effect `FX.last` when a question is shown, tasks/effects.js), not read
   back from Word knowledge. Word knowledge keeps one list per word, so it
   does not know which word came last across words; and the next question
   is often built before the last one is in it: a duel's questions are all
   built before any is answered (core/duel.js `duelPlan`), "Þrjár í röð"
   builds its three at once (tasks/drill.js `streakTasks`), a server-graded
   answer is written when the grader answers, and a question left
   unanswered is never written. What the session keeps is what Word
   knowledge will file the question under — the same words
   (core/wordknowledge.js `wordsOf`), the same type id.

     justAsked(wordKey)
         Did the last question ask about this word in the type now being
         built (`typeId`)? `pickByWord` never returns such an item, `pickWord`
         refuses such a strict word (null: this builder cannot ask it now),
         and `wordBoost` gives a sentence with it weight 0.

     repeatsLast(task)
         Is this built question the last one's type with one of its words?
         The net under all of the above, for builders that choose a
         sentence or an item first and a word only by what is in it:
         tasks/next.js builds the type again (and then moves on), and a
         drill, a review and "Þrjár í röð" skip such a candidate.
         tests/spacing.test.js holds the rule over many seeded sessions.

   #10 changed `pickByWord`, `pickWord` and `wordBoost` without opening a
   builder, and #13 added the words in learning in the same places. tests/pickword.test.js pins what is here
   without building a question.                                              */

import { effectivePolicy, todayKey, wordKey } from "../core/state.js";
import { wordsOf } from "../core/wordknowledge.js";
import { wpick, wordWeight } from "./shared.js";

/** Of the questions in ordinary practice that could be about a word in
    learning, the share that are (#13). Owner, 2026-11-24: about one in
    three — often enough that the six words come round every session, in
    every category whose frame takes them; seldom enough that practice is
    still mostly the rest of the language, and that a pupil does not meet
    *breyting* in every second question. */
export const LEARNING_SHARE = 1 / 3;

/** @this {any} @param {?readonly string[]} [classes] */
function askedWord(classes = null) {
  const m = this.mustAsk;
  if (!m || !m.strict) return null;
  return !classes || classes.includes(m.word.c) ? m.word : null;
}

/** @this {any} @param {?readonly string[]} [classes] */
function cannotAsk(classes = null) {
  const m = this.mustAsk;
  return !!(m && m.strict && classes && !classes.includes(m.word.c));
}

/** @this {any} */
function retryWord() {
  const m = this.mustAsk;
  return m && !m.strict ? m.word : null;
}

/** @this {any} @param {string|null|undefined} key */
function justAsked(key) {
  const last = this.sess && this.sess.lastAsked;
  return !!(key && this.typeId && last && last.type === this.typeId && (last.words || []).includes(key));
}

/** @this {any} */
function repeatsLast(task) {
  const last = this.sess && this.sess.lastAsked;
  if (!task || !last) return false;
  const type = task.typeId || this.typeId || task.type;
  if (type !== last.type) return false;
  const words = last.words || [];
  return wordsOf(task).some((w) => words.includes(w));
}

/** The lexicon entry's `wordKey`, or null. */
const keyOf = (x) => (x && x.o ? wordKey(x.o, x.c) : null);

/** @this {any} @param {string|null|undefined} key */
function inLearning(key) {
  const L = this.learning;
  return !!(key && L && L.includes(key) && !this.justAsked(key));
}

/** @this {any} @template T
    @param {readonly T[]} items @param {(x: T) => boolean} isLearning @param {() => number} rng
    @returns {readonly T[]} */
function preferLearning(items, isLearning, rng) {
  if (!this.learning || !items.length) return items;
  const yes = items.filter(isLearning);
  if (!yes.length || yes.length === items.length) return items;
  return rng() < LEARNING_SHARE ? yes : items.filter((x) => !isLearning(x));
}

/** @this {any} */
function pickByWord(lex, items, wordOf, skill, rng, factor = null, wider = null) {
  /* #13: a word in learning may come from outside the frequency pool, and
     the learning side is drawn LEARNING_SHARE of the time. Nothing here
     happens, and nothing is drawn, in a view without `learning`. */
  if (this.learning) {
    const isL = (x) => this.inLearning(keyOf(wordOf(x)));
    if (wider) {
      const have = new Set(items);
      const extra = wider.filter((x) => !have.has(x) && isL(x));
      if (extra.length) items = [...items, ...extra];
    }
    const all = items;
    items = this.preferLearning(all, isL, rng);
    /* The learning side: the words in learning come up about equally
       often. `wordWeight` would ask *breyting* (rank 83) ten times as often
       as *einstaklingur* (rank 246); among six words the pupil is meant to
       learn, rarity is no reason to see one less. */
    if (items !== all && isL(items[0])) return wpick(items, factor || (() => 1), rng) ?? null;
  }
  const wf = factor
    ? (x) => wordWeight(lex, this, wordOf(x), skill) * factor(x)
    : (x) => wordWeight(lex, this, wordOf(x), skill);
  const got = wpick(items, wf, rng);
  if (got === undefined) return null;
  /* The spacing rule (#10): not the word the last question asked in this
     type. Drawn again from the rest only when the first draw landed on it —
     the same odds as leaving it out from the start, and a seed means what
     it meant whenever the rule has nothing to say. */
  if (!this.justAsked(keyOf(wordOf(got)))) return got;
  const rest = items.filter((x) => !this.justAsked(keyOf(wordOf(x))));
  return rest.length ? wpick(rest, wf, rng) : null;
}

/** @this {any} */
function pickWord(lex, pool, skill, rng, classes, wider = null) {
  if (this.cannotAsk(classes)) return null;
  const asked = this.askedWord(classes);
  /* A strict word that the last question asked in this type: not now. */
  if (asked) return this.justAsked(keyOf(asked)) ? null : asked;
  return this.pickByWord(lex, pool, (x) => x, skill, rng, null,
    wider && classes ? wider.filter((x) => classes.includes(x.c)) : wider);
}

/** @this {any} @param {readonly (string|null)[]} [wordKeys] */
function wordBoost(wordKeys) {
  return wordKeys && wordKeys.some((k) => this.justAsked(k)) ? 0 : 1;
}

const METHODS = { askedWord, cannotAsk, retryWord, pickByWord, pickWord, wordBoost, justAsked, repeatsLast,
  inLearning, preferLearning };

/** The one `mustAsk` of what a host passes. */
function mustAskOf(mustAsk, drillWord, forcedNoun) {
  if (mustAsk) return Object.freeze({ word: mustAsk.word, strict: !!mustAsk.strict });
  if (drillWord) return Object.freeze({ word: drillWord, strict: true });
  if (forcedNoun) return Object.freeze({ word: forcedNoun, strict: false });
  return null;
}

export function makeView({ S, sess, policy = null, today = null, mustAsk = null, forcedNoun = null,
  drillWord = null, typeId = null, mix = null, inRun = false, huntPrefer = null, force = null, cal = null,
  learning = null }) {
  return Object.freeze({
    S, sess,
    policy: policy || effectivePolicy(S),
    today: today || todayKey(),
    typeId: typeId || null,
    mustAsk: mustAskOf(mustAsk, drillWord, forcedNoun),
    mix: mix || null,
    inRun: !!inRun,
    huntPrefer: huntPrefer || [],
    force: force ? Object.freeze({ ...force }) : null,
    cal: cal || null,
    learning: learningOf(learning),
    ...METHODS,
  });
}

/** The words in learning as the view keeps them: a frozen list, or null
    when there are none (so `if (view.learning)` is the whole test). */
const learningOf = (L) => (L && L.length ? Object.freeze([...L]) : null);

/** The same view with something changed — a new object; the old one stands.
    `mustAsk` is given as { word, strict } or null. */
export const withView = (view, changes) => Object.freeze({ ...view, ...changes,
  ...("mustAsk" in changes ? { mustAsk: mustAskOf(changes.mustAsk, null, null) } : {}),
  ...("learning" in changes ? { learning: learningOf(changes.learning) } : {}) });
