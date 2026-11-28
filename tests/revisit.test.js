/* The Orðakort coming back in a review (issue #18, docs/DLD-PLAN.md §1: "on
 * review they sometimes see their own card again and add to it").
 *
 *   1. which reviews bring the card back: only a review of a LEARNED word
 *      whose card the pupil has, one time in REVISIT_RATE, drawn from a
 *      generator seeded by the review entry (no clock, no Math.random, and
 *      the session's random source untouched);
 *   2. what the card shows: what the pupil chose and wrote, read off the
 *      same card, and the self-rating as it stands now;
 *   3. what the pupil adds is kept: a newer rating and/or a sentence of
 *      their own, in the same slice (`S.wordCards`, the pupil's own text):
 *      sanitise, merge of two devices, the server's check, a card done again.
 *   The screen is tools/browser-test.mjs, section #18.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, newSession } from "../src/js/core/state.js";
import { createPolicy } from "../src/js/core/policy.js";
import { seeded } from "../src/js/core/duel.js";
import { mergeStates } from "../src/js/core/merge.js";
import { cleanState } from "../server/guard.mjs";
import { makeView } from "../src/js/tasks/index.js";
import { reviewTask } from "../src/js/tasks/review.js";
import { revisitCard, buildCard } from "../src/js/tasks/wordcard.js";
import { SKILL_IDS } from "../src/js/core/skills.js";
import { entryByKey, queueWord } from "../src/js/core/review.js";
import { leaveLearning } from "../src/js/core/wordknowledge.js";
import {
  REVISIT_RATE, ADDS_MAX, SENTENCE_LEN, addToCard, ratingNow, saveCard, cardOf, sanitiseCards, mergeCards, wordCardsSlice,
} from "../src/js/core/wordcard.js";
import { LEARNER_WORDS, giveWords } from "./learner.js";

const lex = buildLexicon(DATA);
const D1 = "2026-11-24", D2 = "2026-11-25", D3 = "2026-11-26";
const WORD = "útskýra|so";
assert.ok(LEARNER_WORDS.includes(WORD));

/* A pupil who did WORD's card, learned the word, and has its review due. */
function pupil({ learned = true, card = true } = {}) {
  const S = giveWords(blankState());
  SKILL_IDS.forEach((id) => { S.enabled[id] = true; });
  if (card) saveCard(S, WORD, { rating: 1, answers: {
    skyring: { c: ["útskýra|so"], ok: true },
    setning: { c: ["Kennarinn útskýrði dæmið fyrir bekknum."], ok: true },
    flokkur: { c: ["lo"], ok: false },
  } }, D1);
  if (learned) assert.ok(leaveLearning(S, WORD, D2));
  const k = queueWord(S, { w: WORD, t: "or_eyda", sk: "ordaford" }, D2);
  return { S, entry: entryByKey(S, k) };
}

function viewOf(S) {
  const sess = newSession(S);
  Object.keys(sess.diff).forEach((x) => { sess.diff[x] = 3; });
  const allOn = Object.fromEntries(SKILL_IDS.map((id) => [id, true]));
  const policy = createPolicy(null, { skills: allOn, types: {}, levels: {}, attrs: {}, safeVocab: null });
  return makeView({ S, sess, policy, today: D3 });
}

/* A random source that is `seeded(seed)` and counts its draws. */
const counting = (seed) => { const r = seeded(seed); const f = () => { f.n++; return r(); }; f.n = 0; return f; };

/* ---------- 1. which reviews ------------------------------------------------ */

test("the rate is stated, and is 'sometimes': more than never, well under always", () => {
  assert.ok(REVISIT_RATE > 0 && REVISIT_RATE <= 0.5, String(REVISIT_RATE));
});

/* The same review on another day or at another stage: a new draw. */
const at = (entry, k) => ({ ...entry, due: `2026-${String(1 + (k % 12)).padStart(2, "0")}-${String(1 + (k % 28)).padStart(2, "0")}`, s: k % 4 });

test("a review of a learned word with a card brings the card back about one time in REVISIT_RATE", () => {
  const { S, entry } = pupil();
  const view = viewOf(S);
  let built = 0, back = 0;
  for (let k = 0; k < 240; k++) {
    const b = reviewTask(lex, view, seeded(k + 1), at(entry, k * 7 + 3));
    if (!b) continue;
    built++;
    assert.equal(b.task.word, WORD);
    if (b.task.revisit) { back++; assert.equal(b.task.revisit, WORD); }
  }
  assert.ok(built >= 200, `built ${built}`);
  const share = back / built;
  assert.ok(Math.abs(share - REVISIT_RATE) < 0.1, `came back ${back} of ${built}`);
});

test("the decision is the entry's own: the same review, the same answer, whatever the random source or the clock", () => {
  const { S, entry } = pupil();
  const view = viewOf(S);
  for (let k = 0; k < 20; k++) {
    const e = at(entry, k);
    const seen = new Set();
    for (let seed = 1; seed <= 8; seed++) {
      const b = reviewTask(lex, view, seeded(seed), e);
      if (b) seen.add(!!b.task.revisit);
    }
    assert.ok(seen.size <= 1, `entry ${e.due}/${e.s} decided both ways`);
  }
  /* reviewTask writes nothing: the card and the queue are as they were. */
  const before = JSON.stringify(S);
  reviewTask(lex, view, seeded(4), entry);
  assert.equal(JSON.stringify(S), before);
});

test("no card back for a word not learned, a word without a card, or another review — and no question changes", () => {
  for (const opts of [{ learned: false }, { card: false }]) {
    const { S, entry } = pupil(opts);
    const view = viewOf(S);
    for (let k = 0; k < 40; k++) {
      const b = reviewTask(lex, view, seeded(k + 1), at(entry, k));
      if (b) assert.equal(b.task.revisit, undefined, JSON.stringify(opts));
    }
  }
  /* The session's random source is not touched: with the card or without
     it, the same draws are taken and the same question is built. */
  const withCard = pupil(), without = pupil({ card: false });
  for (let k = 0; k < 30; k++) {
    const a = counting(k + 1), b = counting(k + 1);
    const x = reviewTask(lex, viewOf(withCard.S), a, at(withCard.entry, k));
    const y = reviewTask(lex, viewOf(without.S), b, at(without.entry, k));
    assert.equal(!!x, !!y);
    assert.equal(a.n, b.n);
    if (x) assert.deepEqual({ ...x.task, revisit: undefined }, { ...y.task, revisit: undefined });
  }
  /* A session's repeat of a missed noun is not a review of a learned word. */
  const { S } = pupil();
  const b = reviewTask(lex, viewOf(S), seeded(2), { t: "fill", c: null, w: "hestur|kk", p: null, k: null }, { mark: "reask" });
  assert.ok(!b || !b.task.revisit);
});

/* ---------- 2. what the card shows ----------------------------------------- */

test("the card back: what the pupil chose, as text, with the right answer where theirs was not", () => {
  const { S } = pupil();
  const v = revisitCard(lex, WORD, cardOf(S, WORD));
  assert.ok(v);
  assert.equal(v.lemma, "útskýra");
  assert.ok(v.def && v.def.length > 5);
  const card = buildCard(lex, WORD);
  const sk = card.steps.find((s) => s.id === "skyring");
  assert.deepEqual(v.picks.map((p) => p.id), ["skyring", "setning", "flokkur"]);
  assert.deepEqual(v.picks[0].chosen, [sk.options.find((o) => o.id === WORD).text]);
  assert.deepEqual(v.picks[0].right, []);
  assert.deepEqual(v.picks[1].chosen, ["Kennarinn útskýrði dæmið fyrir bekknum."]);
  assert.deepEqual(v.picks[2], { id: "flokkur", question: "Hvaða orðflokki tilheyrir orðið *útskýra*?",
    chosen: ["Lýsingarorð"], ok: false, right: ["Sagnorð"] });
  assert.equal(v.rating, 1);
  assert.deepEqual(v.written, []);
  assert.deepEqual(v.mine, []);
  /* The sentence must hold a form of the word. */
  assert.equal(v.fits("Kennarinn útskýrir þetta vel."), true);
  assert.equal(v.fits("Kennarinn talar vel."), false);
  /* What they wrote in their own words (#37) and what they added before. */
  S.wordCards[WORD].a.eigin = { c: [], ok: true, t: "Að segja frá svo aðrir skilji." };
  addToCard(S, WORD, { rating: 2, sentence: "Ég útskýrði leikinn fyrir bróður mínum." }, D3);
  const w = revisitCard(lex, WORD, cardOf(S, WORD));
  assert.deepEqual(w.written, [{ id: "eigin", head: "Með þínum orðum", lines: ["Að segja frá svo aðrir skilji."] }]);
  assert.deepEqual(w.mine, ["Ég útskýrði leikinn fyrir bróður mínum."]);
  assert.equal(w.rating, 2);
  assert.equal(revisitCard(lex, WORD, null), null);
  assert.equal(revisitCard(lex, "ekkiorð|so", cardOf(S, WORD)), null);
});

test("a free-text card (#38): the explanation, the pupil's sentence and the three related words come back", () => {
  const S = giveWords(blankState());
  /* As ui/wordcard.js keeps a card done with server grading on: steps 3–5
     are free text, and the structured steps they replace were not asked. */
  saveCard(S, WORD, { rating: 0, answers: {
    eigin: { c: [], ok: true, t: "Að segja frá svo aðrir skilji." },
    min: { c: [], ok: false, t: "Ég útskýrði reglurnar fyrir systur minni." },
    tengsl: { c: ["skýra", "útskýring", "flækja"], ok: true,
      t: "1. skýra – merkir svipað\n2. útskýring – af sama stofni\n3. flækja – hið gagnstæða" },
    flokkur: { c: ["so"], ok: true },
  } }, D1);
  const v = revisitCard(lex, WORD, cardOf(S, WORD));
  assert.deepEqual(v.written, [
    { id: "eigin", head: "Með þínum orðum", lines: ["Að segja frá svo aðrir skilji."] },
    { id: "min", head: "Mín setning", lines: ["Ég útskýrði reglurnar fyrir systur minni."] },
    { id: "tengsl", head: "Skyld orð", lines: ["1. skýra – merkir svipað", "2. útskýring – af sama stofni", "3. flækja – hið gagnstæða"] },
  ]);
  /* Of the choices, only what this card asked. */
  assert.deepEqual(v.picks.map((p) => p.id), ["flokkur"]);
  assert.equal(v.rating, 0);
});

/* ---------- 3. what is added is kept --------------------------------------- */

test("addToCard: a newer rating and/or a sentence; nothing else on the card moves", () => {
  const { S } = pupil();
  const was = structuredClone(cardOf(S, WORD));
  assert.equal(addToCard(S, WORD, { rating: 1, sentence: "" }, D3), false, "the same rating is not an addition");
  assert.equal(addToCard(S, WORD, { rating: null, sentence: "   " }, D3), false);
  assert.equal(addToCard(S, WORD, null, D3), false);
  assert.equal(addToCard(S, "hestur|kk", { rating: 2 }, D3), false, "no card, nothing to add to");
  assert.equal(addToCard(S, WORD, { rating: 2 }, "í dag"), false);
  assert.deepEqual(cardOf(S, WORD), was);

  assert.equal(addToCard(S, WORD, { rating: 2, sentence: "  Hún útskýrði  þetta. " }, D3), true);
  const now = cardOf(S, WORD);
  assert.deepEqual(now.x, [{ d: D3, r: 2, s: "Hún útskýrði  þetta." }]);
  assert.deepEqual({ ...now, x: undefined }, { ...was, x: undefined }, "n, d, r and a are as they were");
  assert.equal(ratingNow(now), 2);
  assert.equal(now.r, 1, "the first rating is kept");
  assert.equal(addToCard(S, WORD, { rating: 2, sentence: "Ég útskýri." }, D3), true);
  assert.deepEqual(cardOf(S, WORD).x[1], { d: D3, s: "Ég útskýri." }, "a rating that stands is not repeated");
  assert.equal(ratingNow(cardOf(S, WORD)), 2);
  /* At most ADDS_MAX, the newest; a sentence at most SENTENCE_LEN. */
  for (let i = 0; i < ADDS_MAX + 3; i++) addToCard(S, WORD, { sentence: `Ég útskýri ${i}.` }, D3);
  assert.equal(cardOf(S, WORD).x.length, ADDS_MAX);
  assert.equal(cardOf(S, WORD).x[ADDS_MAX - 1].s, `Ég útskýri ${ADDS_MAX + 2}.`);
  addToCard(S, WORD, { sentence: "útskýra ".repeat(100) }, D3);
  assert.ok(cardOf(S, WORD).x[ADDS_MAX - 1].s.length <= SENTENCE_LEN);
});

test("a card done again (a hard word, #17) keeps what was added to it", () => {
  const { S } = pupil();
  addToCard(S, WORD, { rating: 2, sentence: "Ég útskýrði það." }, D2);
  saveCard(S, WORD, { rating: 0, answers: {} }, D3);
  const c = cardOf(S, WORD);
  assert.equal(c.n, 2);
  assert.deepEqual(c.x, [{ d: D2, r: 2, s: "Ég útskýrði það." }]);
});

test("sanitise: additions of the wrong shape are dropped; a card without any has no `x`", () => {
  const card = { d: D1, n: 1, r: 1, a: {} };
  const clean = sanitiseCards({ [WORD]: { ...card, x: [
    { d: D3, s: "Seinni." }, { d: D2, r: 0 }, { d: "bráðum", r: 1 }, { d: D2, r: 5 }, { d: D2 }, "x", { d: D2, s: 7 },
    { d: D2, r: 2, s: " Fyrri. " },
  ] } });
  assert.deepEqual(clean[WORD].x, [{ d: D2, r: 0 }, { d: D2, r: 2, s: "Fyrri." }, { d: D3, s: "Seinni." }]);
  assert.deepEqual(sanitiseCards({ [WORD]: { ...card, x: "nei" } })[WORD], card);
  assert.deepEqual(sanitiseCards({ [WORD]: { ...card, x: [] } })[WORD], card);
});

test("two devices: the additions of both are kept, each once, whichever device merges", () => {
  const base = { d: D1, n: 1, r: 1, a: {} };
  const L = { [WORD]: { ...base, x: [{ d: D2, r: 2 }, { d: D3, s: "Á símanum." }] } };
  const R = { [WORD]: { ...base, x: [{ d: D2, r: 2 }, { d: D2, s: "Á tölvunni." }] } };
  const lr = mergeCards(null, L, R), rl = mergeCards(null, R, L);
  assert.deepEqual(lr[WORD].x, [{ d: D2, r: 2 }, { d: D2, s: "Á tölvunni." }, { d: D3, s: "Á símanum." }]);
  assert.deepEqual(lr[WORD].x, rl[WORD].x);
  /* The card itself: still the one done more times; its additions joined. */
  const again = { [WORD]: { d: D3, n: 2, r: 0, a: { flokkur: { c: ["so"], ok: true } } } };
  const m = mergeCards(null, L, again)[WORD];
  assert.equal(m.n, 2);
  assert.deepEqual(m.a, again[WORD].a);
  assert.deepEqual(m.x, L[WORD].x);
  /* Through the whole state. */
  const SL = { ...blankState(), wordCards: L }, SR = { ...blankState(), wordCards: R };
  assert.deepEqual(mergeStates(null, SL, SR).wordCards, mergeStates(null, SR, SL).wordCards);
  assert.equal(mergeStates(null, SL, SR).wordCards[WORD].x.length, 3);
});

test("the server's check: an addition dated after tomorrow is dropped, the card stays", () => {
  const card = { d: D1, n: 1, r: 1, a: {}, x: [{ d: D2, s: "Í gær." }, { d: "2099-01-01", r: 2 }] };
  const out = cleanState({ ...blankState(), wordCards: { [WORD]: card } }, { today: new Date(D3 + "T12:00:00Z") });
  assert.deepEqual(out.wordCards[WORD], { d: D1, n: 1, r: 1, a: {}, x: [{ d: D2, s: "Í gær." }] });
  assert.equal(wordCardsSlice.ownText, true, "the additions are in the pupil's own text");
});
