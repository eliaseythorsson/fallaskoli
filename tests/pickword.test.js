/* Word choice behind the view (#45): `pickWord`, `pickByWord`, `mustAsk`,
   `wordBoost` (tasks/view.js) — without building a single question. */

import test from "node:test";
import assert from "node:assert/strict";
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, newSession, wordKey } from "../src/js/core/state.js";
import { seeded } from "../src/js/core/duel.js";
import { makeView, withView } from "../src/js/tasks/view.js";
import { wpick, wordWeight } from "../src/js/tasks/shared.js";

const lex = buildLexicon(DATA);
const NOUNS = ["kk", "kvk", "hk"];
const hestur = lex.lookup("hestur", "kk");
const koma = lex.lookup("koma", "so");
const pool = lex.nouns.slice(0, 200);

const view = (extra = {}) => {
  const S = blankState();
  return makeView({ S, sess: newSession(S), today: "2026-11-24", ...extra });
};

/** A random source that counts what it hands out. */
const counting = (seed) => {
  const g = seeded(seed);
  const r = () => { r.n++; return g(); };
  r.n = 0;
  return r;
};

test("no mustAsk: pickWord is the weighted draw it replaced, number for number", () => {
  const v = view();
  for (let seed = 1; seed <= 40; seed++) {
    const a = v.pickWord(lex, pool, "nafnord", seeded(seed), NOUNS);
    const b = wpick(pool, (x) => wordWeight(lex, v, x, "nafnord"), seeded(seed));
    assert.equal(a, b, `seed ${seed}`);
  }
});

test("strict mustAsk of a class the builder asks: that word, and no number drawn", () => {
  const v = view({ mustAsk: { word: hestur, strict: true } });
  const rng = counting(3);
  assert.equal(v.pickWord(lex, [lex.nouns[0]], "nafnord", rng, NOUNS), hestur, "even when it is not in the pool");
  assert.equal(rng.n, 0);
  assert.equal(v.askedWord(NOUNS), hestur);
  assert.equal(v.askedWord(), hestur, "any class when none is named");
  assert.equal(v.cannotAsk(NOUNS), false);
  assert.equal(v.retryWord(), null, "a strict word is not a word to retry");
});

test("strict mustAsk of another class (a drill word of the wrong class): null", () => {
  const v = view({ mustAsk: { word: koma, strict: true } });
  const rng = counting(4);
  assert.equal(v.pickWord(lex, pool, "nafnord", rng, NOUNS), null);
  assert.equal(rng.n, 0, "nothing drawn for a question that cannot be asked");
  assert.equal(v.askedWord(NOUNS), null);
  assert.equal(v.cannotAsk(NOUNS), true);
  assert.equal(v.cannotAsk(["so"]), false);
  assert.equal(v.cannotAsk([]), true, "a builder that asks about no word cannot honour one");
  assert.equal(v.cannotAsk(), false, "no classes named: any class will do");
});

test("non-strict mustAsk (the cloze asked again): pickWord carries on as usual", () => {
  const v = view({ mustAsk: { word: hestur, strict: false } });
  const plain = view();
  for (let seed = 1; seed <= 10; seed++)
    assert.equal(v.pickWord(lex, pool, "nafnord", seeded(seed), NOUNS),
      plain.pickWord(lex, pool, "nafnord", seeded(seed), NOUNS));
  assert.equal(v.retryWord(), hestur, "the cloze finds it here");
  assert.equal(v.askedWord(), null);
  assert.equal(v.cannotAsk([]), false);
});

test("the hosts' names make the one mustAsk: drillWord strict, forcedNoun not", () => {
  assert.deepEqual({ ...view({ drillWord: hestur }).mustAsk }, { word: hestur, strict: true });
  assert.deepEqual({ ...view({ forcedNoun: hestur }).mustAsk }, { word: hestur, strict: false });
  assert.equal(view().mustAsk, null);
  assert.ok(Object.isFrozen(view({ drillWord: hestur }).mustAsk));
});

test("empty pool: null, after drawing the one number wpick always drew", () => {
  const rng = counting(5);
  assert.equal(view().pickWord(lex, [], "nafnord", rng, NOUNS), null);
  assert.equal(rng.n, 1, "so a seed means the same questions afterwards");
  const r2 = counting(5);
  assert.equal(view().pickByWord(lex, [], (x) => x, "nafnord", r2), null);
  assert.equal(r2.n, 1);
});

test("pickByWord: items that carry a word, with a factor beside the word's weight", () => {
  const v = view();
  const items = pool.map((n, k) => ({ n, k }));
  const flat = (y) => 1 + y.n.r / 150;
  for (let seed = 1; seed <= 20; seed++) {
    const a = v.pickByWord(lex, items, (y) => y.n, "nafnord", seeded(seed), flat);
    const b = wpick(items, (y) => wordWeight(lex, v, y.n, "nafnord") * flat(y), seeded(seed));
    assert.equal(a, b);
  }
  /* A strict word does not change it: the builder has already narrowed its items. */
  const s = view({ mustAsk: { word: koma, strict: true } });
  assert.equal(s.pickByWord(lex, items, (y) => y.n, "nafnord", seeded(1)), v.pickByWord(lex, items, (y) => y.n, "nafnord", seeded(1)));
});

test("a derived view chooses by its own fields", () => {
  const v = view();
  const d = withView(v, { mustAsk: { word: hestur, strict: true } });
  assert.equal(d.pickWord(lex, pool, "nafnord", seeded(1), NOUNS), hestur);
  assert.equal(v.mustAsk, null, "the first view stands");
  /* A view spread into a plain object (as a test may) keeps working too. */
  const spread = { ...d };
  assert.equal(spread.askedWord(NOUNS), hestur);
  const cleared = withView(d, { mustAsk: null });
  assert.equal(cleared.mustAsk, null);
  assert.equal(cleared.askedWord(), null);
});

test("the view knows the type being built, or null", () => {
  assert.equal(view().typeId, null);
  assert.equal(withView(view(), { typeId: "fill" }).typeId, "fill");
});

test("wordBoost is 1 until #13 switches it on", () => {
  const v = view();
  assert.equal(v.wordBoost([wordKey("hestur", "kk"), null]), 1);
  assert.equal(v.wordBoost([]), 1);
});
