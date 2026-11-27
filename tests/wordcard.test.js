/* The Orðakort, structured version (issue #15): tasks/wordcard.js (what a
 * card shows and asks), core/wordcard.js (what is kept), and the seam into
 * the six words in learning (core/wordknowledge.js `fillLearning`).
 *
 *   1. the card comes before the word enters the intensive phase;
 *   2. the definition is not part of the explanation step (the screen side
 *      of that is tools/browser-test.mjs);
 *   3. every option is checked against BÍN / ÍNO / the hand-written lists,
 *      and a step without enough checked material is dropped;
 *   4. the answers and the self-rating are kept in progress as the pupil's
 *      own text: blank, migrate, merge, the server's check.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { DATA } from "../data/data_bundle.js";
import { EX } from "../data/exercises.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, migrate } from "../src/js/core/state.js";
import { mergeStates } from "../src/js/core/merge.js";
import { cleanState } from "../server/guard.mjs";
import { isGrammarGloss } from "../src/js/core/definitions.js";
import { CLASSNAME } from "../src/js/core/marks.js";
import { LEARNING_SIZE, fillLearning, learningCandidates, nextToLearn, wordsInLearning } from "../src/js/core/wordknowledge.js";
import { RATINGS, cardDone, cardOf, saveCard, sanitiseCards, mergeCards, wordCardsSlice } from "../src/js/core/wordcard.js";
import { STEPS, buildCard, judgeStep, near, explainPairs, formIn, shortTable, senseOf } from "../src/js/tasks/wordcard.js";
import { synonymsOf, antonymsOf } from "../src/js/tasks/ordaford.js";
import { syllablesOf } from "../src/js/core/syllables.js";

const lex = buildLexicon(DATA);
const DAY1 = "2026-11-27", DAY2 = "2026-11-28";
const key = (w) => `${w.o}|${w.c}`;
const entry = (k) => { const at = k.lastIndexOf("|"); return lex.lookup(k.slice(0, at), k.slice(at + 1)); };
const NOUN = new Set(["kk", "kvk", "hk"]);
const ALL = learningCandidates({}, lex, 7);
const CARDS = new Map(ALL.map((w) => [key(w), buildCard(lex, key(w))]));
const step = (card, id) => card.steps.find((s) => s.id === id) || null;
const done = (answers = {}) => ({ rating: 1, answers });

/* A line of the meaning list as #11's build writes it (EX.meaningChoice).
   The real list has lines for LÍNO-2 words since #11; a test that makes its
   own line takes the word's real one out. */
const withMeaning = (item) => ({ ...EX, meaningChoice: [item] });
const NO_LIST = { ...EX, meaningChoice: [] };
/* The word's real line, if it has one that the card uses. */
const lineOf = (w) => senseOf(w, EX).item;

/* ---------- 1. before the word enters ------------------------------------- */

test("no word enters the six without its card; each finished card lets the next word in", () => {
  const S = blankState();
  const ready = (w) => cardDone(S, w);
  assert.deepEqual(fillLearning(S, lex, { level: 3, today: DAY1, ready }).entered, [], "a new pupil has done no card");
  assert.deepEqual(wordsInLearning(S), []);
  const entered = [];
  for (let i = 0; i < LEARNING_SIZE; i++) {
    const next = nextToLearn(S, lex, 3);
    assert.equal(cardDone(S, next), false);
    assert.ok(saveCard(S, next, done(), DAY1));
    assert.deepEqual(fillLearning(S, lex, { level: 3, today: DAY1, ready }).entered, [next], "exactly the word whose card was done");
    entered.push(next);
  }
  assert.deepEqual(wordsInLearning(S), [...entered].sort());
  /* The six are full: the seventh word has no card and none is needed yet. */
  assert.deepEqual(fillLearning(S, lex, { level: 3, today: DAY2, ready }).entered, []);
});

test("a card done on another device lets the word in after the merge", () => {
  const here = blankState(), there = blankState();
  const next = nextToLearn(there, lex, 3);
  saveCard(there, next, done({ flokkur: { c: ["no"], ok: true } }), DAY1);
  const S = migrate(mergeStates(null, here, there));
  assert.equal(cardDone(S, next), true);
  assert.deepEqual(fillLearning(S, lex, { level: 3, today: DAY2, ready: (w) => cardDone(S, w) }).entered, [next]);
});

/* ---------- 2, 3. what a card shows and asks ------------------------------ */

test("every LÍNO-2 word has a card: read and rate first, then only steps that are whole", () => {
  assert.ok(ALL.length > 2000);
  const known = new Set(STEPS.map((s) => s.id));
  for (const [k, card] of CARDS) {
    assert.ok(card, `${k} has no card`);
    assert.deepEqual(card.steps.slice(0, 2).map((s) => s.id), ["lesa", "mat"], k);
    const ids = card.steps.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length, `${k}: a step twice`);
    assert.ok(ids.every((id) => known.has(id)));
    assert.deepEqual(ids, STEPS.map((s) => s.id).filter((id) => ids.includes(id)), `${k}: the steps are out of order`);
    assert.deepEqual(step(card, "mat").options.map((o) => o.id), [...RATINGS]);
    for (const s of card.steps.filter((x) => x.kind === "choice")) {
      const optIds = s.options.map((o) => o.id), texts = s.options.map((o) => o.text);
      assert.ok(s.options.length >= 3, `${k}/${s.id}: fewer than three options`);
      assert.equal(new Set(optIds).size, optIds.length, `${k}/${s.id}: an option twice`);
      assert.equal(new Set(texts).size, texts.length, `${k}/${s.id}: two options read the same`);
      assert.ok(s.answer.length >= 1 && s.answer.every((a) => optIds.includes(a)), `${k}/${s.id}: the answer is not an option`);
      assert.ok(s.answer.length < s.options.length, `${k}/${s.id}: every option is right`);
      assert.equal(s.multi, s.answer.length > 1 || s.id === "skyld", `${k}/${s.id}: multi`);
      assert.ok(s.question.includes(`*${card.lemma}*`) && s.why, `${k}/${s.id}: question and feedback`);
    }
  }
});

test("the same word always gets the same card, and building it uses no Math.random", () => {
  const was = Math.random;
  Math.random = () => { throw new Error("Math.random called"); };
  try {
    for (const k of ["einnig|ao", "breyting|kvk", "mikilvægur|lo", "auka|so", "vandamál|hk"])
      assert.deepEqual(buildCard(lex, k), CARDS.get(k));
  } finally { Math.random = was; }
  assert.equal(buildCard(lex, "ekkiorð|kk"), null);
  assert.equal(buildCard(lex, "breyting"), null);
});

test("lesa: the definition is a meaning, each sentence holds a BÍN form of the word, the table is BÍN's", () => {
  let defs = 0, sentences = 0;
  for (const [k, card] of CARDS) {
    const w = entry(k), r = step(card, "lesa"), line = lineOf(w);
    if (r.def) { defs++; assert.equal(isGrammarGloss(r.def), false, k); assert.equal(r.def, line ? line.d.trim() : w.d.trim(), k); }
    for (const s of r.sentences) {
      sentences++;
      const form = s.text.slice(s.at[0], s.at[1]).toLowerCase();
      assert.ok(Object.values(w.forms).flat().some((f) => f.toLowerCase() === form), `${k}: "${form}" is no form of the word`);
      /* ÍNO's example, or the right sentence of the word's line (#11). */
      assert.ok(s.src === "ÍNO" ? s.text === w.x : !!line && s.text === line.r, `${k}: "${s.text}" is neither ÍNO's example nor the list's`);
    }
    assert.deepEqual(r.syllables, syllablesOf(w.o));
    if (r.table) for (const row of r.table.rows) for (const cell of row.slice(1)) {
      const form = cell.split(" ").pop();
      assert.ok(Object.values(w.forms).flat().includes(form), `${k}: the table's "${cell}" is not a BÍN form`);
    }
    assert.equal(!!r.note, w.c === "ao" || new Set(Object.values(w.forms).flat()).size === 1, `${k}: note`);
  }
  assert.ok(defs > 1200 && sentences > 900, `${defs} definitions, ${sentences} sentences`);
});

test("lesa: the short table by word class", () => {
  assert.deepEqual(shortTable(entry("breyting|kvk")), { head: ["", "eintala", "fleirtala"], rows: [
    ["nf.", "breyting", "breytingar"], ["þf.", "breytingu", "breytingar"],
    ["þgf.", "breytingu", "breytingum"], ["ef.", "breytingar", "breytinga"]] });
  assert.deepEqual(shortTable(entry("mikilvægur|lo")), { head: ["", "karlkyn", "kvenkyn", "hvorugkyn"], rows: [
    ["frumstig", "mikilvægur", "mikilvæg", "mikilvægt"], ["miðstig", "mikilvægari", "mikilvægari", "mikilvægara"],
    ["efsta stig", "mikilvægastur", "mikilvægust", "mikilvægast"]] });
  assert.deepEqual(shortTable(entry("auka|so")), { head: null, rows: [
    ["nafnháttur", "að auka"], ["nútíð", "ég eyk"], ["þátíð", "ég jók"], ["sagnbót", "ég hef aukið"]] });
  assert.equal(shortTable(entry("einnig|ao")), null);
  assert.equal(shortTable(entry("mismunandi|lo")), null, "one form for everything: no table");
  assert.equal(step(CARDS.get("mismunandi|lo"), "lesa").note, "Orðið beygist ekki.");
});

test("lesa: an ÍNO entry whose own example does not hold the word is not trusted", () => {
  /* *jafnvel* carries the text of the entry ÍNO sends the reader on to, and
     *mæla* (the verb that measures: mældi) the definition of the verb that
     speaks (mælti). */
  for (const k of ["jafnvel|ao", "mæla|so"]) {
    const w = entry(k);
    assert.ok(w.d && w.x && !formIn(w, w.x), `${k}: the data changed, pick another example`);
    assert.equal(step(CARDS.get(k), "lesa").def, null, k);
    assert.equal(step(CARDS.get(k), "skyring"), null, k);
  }
});

test("skyring: the right explanation is ÍNO's; the two wrong ones are read pairs, far from the word", () => {
  const pairs = explainPairs();
  assert.ok(pairs.size >= 200);
  let n = 0;
  for (const [k, [a, b]] of pairs) {
    const w = entry(k), wrong = [entry(a), entry(b)];
    assert.ok(w && typeof w.lino === "number" && w.ds === "ino", `${k}: not a LÍNO-2 word with an ÍNO definition`);
    const s = step(CARDS.get(k), "skyring");
    /* A word whose line of the meaning list (#11) names another sense than
       ÍNO's first: the card is about that sense, and the pair was read
       against the first, so the step is dropped. */
    const line = lineOf(w);
    if (line && line.d.trim() !== w.d.trim()) { assert.equal(s, null, `${k}: a pair read against another sense`); continue; }
    assert.ok(s, `${k} is on the list but its card has no explanation step`);
    n++;
    assert.deepEqual(s.answer, [k]);
    assert.equal(s.options.length, 3);
    assert.equal(s.options.find((o) => o.id === k).text, w.d.trim(), `${k}: the right option is the word's definition`);
    for (const x of wrong) {
      assert.ok(x && typeof x.lino === "number" && x.ds === "ino" && x.d, `${k}: ${x && x.o} has no ÍNO definition`);
      assert.equal(NOUN.has(x.c) ? NOUN.has(w.c) : x.c === w.c, true, `${k}: ${x.o} is of another word class`);
      assert.equal(s.options.find((o) => o.id === key(x)).text, x.d.trim());
      assert.equal(near(lex, w, x), false, `${k}: ${x.o} is near the word — its definition could be argued for`);
      assert.ok(!x.d.includes(w.o) && !w.d.includes(x.o), `${k}: ${x.o} names the word, or is named by it`);
      assert.ok(!/[<>]/.test(x.d), `${k}: ${x.o}'s definition is not one line of plain text`);
    }
    assert.equal(near(lex, wrong[0], wrong[1]), false, `${k}: the two wrong explanations are near each other`);
  }
  /* The step exists for the listed words and for no other. */
  assert.equal([...CARDS.values()].filter((c) => step(c, "skyring")).length, n);
  /* The definition is in `lesa` and nowhere in the step but among its options,
     unmarked: nothing in the step says which option is the definition. */
  const s = step(CARDS.get("breyting|kvk"), "skyring");
  assert.equal(s.question, "Hvað merkir orðið *breyting*?");
  assert.deepEqual(Object.keys(s).sort(), ["answer", "id", "kind", "multi", "options", "question", "why"]);
});

test("near: what could be taken for the same meaning", () => {
  const n = (a, b) => near(lex, entry(a), entry(b));
  assert.equal(n("tilvik|hk", "tilfelli|hk"), true, "the definitions share a word, and one names the other");
  assert.equal(n("jákvæður|lo", "neikvæður|lo"), true, "antonyms in the hand-written list");
  assert.equal(n("mikilvægur|lo", "mikilvægi|hk"), true, "the same word family");
  assert.equal(n("afar|ao", "sérstaklega|ao"), true, "both are defined with mjög");
  assert.equal(n("breyting|kvk", "óhapp|hk"), false);
  assert.equal(n("tilvik|hk", "tilfelli|hk"), n("tilfelli|hk", "tilvik|hk"), "symmetric");
});

test("skyld: the right options are the word's synonyms in the hand-written list, the wrong ones are not", () => {
  let n = 0;
  for (const [k, card] of CARDS) {
    const s = step(card, "skyld");
    const w = entry(k), pos = NOUN.has(w.c) ? "no" : w.c;
    const inList = (EX.synonyms[pos] || []).some((g) => g.some((y) => y.o === w.o && y.c === w.c));
    if (!s) continue;
    n++;
    assert.ok(inList, `${k} is in no synonym group`);
    const syn = synonymsOf(w.o, pos), ant = antonymsOf(w.o, pos);
    assert.ok(s.answer.length >= 1 && s.answer.length <= 2);
    assert.equal(s.options.length, s.answer.length + 3);
    for (const o of s.options) {
      assert.ok(lex.lemma(o.id).length, `${k}: ${o.id} is not a word of the lexicon`);
      if (s.answer.includes(o.id)) assert.ok(syn.includes(o.id), `${k}: ${o.id} is not its synonym`);
      else {
        assert.ok(!syn.includes(o.id) && !ant.includes(o.id), `${k}: the wrong option ${o.id} is its synonym or antonym`);
        assert.ok(!s.answer.some((a) => synonymsOf(a, pos).includes(o.id) || antonymsOf(a, pos).includes(o.id)),
          `${k}: the wrong option ${o.id} is a synonym or antonym of a right one`);
      }
    }
  }
  assert.ok(n >= 90, `${n} words have the step`);
  assert.equal(step(CARDS.get("breyting|kvk"), "skyld"), null, "a word in no synonym group has no such step");
  const m = step(CARDS.get("mikilvægur|lo"), "skyld");
  assert.deepEqual(m.answer, ["þýðingarmikill"]);
  assert.equal(m.why, "*Mikilvægur* og *þýðingarmikill* merkja nánast það sama.");
});

test("flokkur and kyn: what BÍN says; dropped for a lemma that is two words", () => {
  for (const [k, card] of CARDS) {
    const w = entry(k), f = step(card, "flokkur"), g = step(card, "kyn");
    const one = lex.homographClasses(w.o).length === 1;
    assert.equal(!!f, one, `${k}: flokkur`);
    assert.equal(!!g, one && NOUN.has(w.c), `${k}: kyn`);
    if (f) {
      assert.deepEqual(f.options.map((o) => o.text), ["Nafnorð", "Sagnorð", "Lýsingarorð", "Atviksorð"]);
      assert.equal(f.options.find((o) => o.id === f.answer[0]).text.toLowerCase(), CLASSNAME[w.c], k);
    }
    if (g) assert.deepEqual(g.answer, [w.c]);
  }
  assert.equal(step(CARDS.get("stefna|kvk"), "flokkur"), null, "stefna is a noun and a verb");
  assert.equal(step(CARDS.get("breyting|kvk"), "kyn").why, "*Breyting* er kvenkynsorð: *breytingin*.");
  assert.equal(step(CARDS.get("einnig|ao"), "flokkur").why, "*Einnig* er atviksorð.");
});

test("setning: from the word's line of the meaning list (#11), and only then", () => {
  /* Until #11's list is in the data no card has the step. */
  if (!EX.meaningChoice) assert.equal([...CARDS.values()].some((c) => step(c, "setning")), false);
  const w = entry("breyting|kvk");
  const item = { o: "breyting", c: "kvk", lvl: 3, d: w.d,
    r: "Það varð mikil breyting á veðrinu um helgina.",
    w: ["Hún hellti breytingu í glasið.", "Hann klæddi sig í breytinguna.", "Breytingin gelti á póstinn."] };
  const card = buildCard(lex, "breyting|kvk", { ex: withMeaning(item) });
  const s = step(card, "setning");
  assert.equal(s.question, "Í hvaða setningu er orðið *breyting* notað rétt?");
  assert.deepEqual(s.answer, [item.r]);
  assert.equal(s.options.length, 3);
  assert.ok(s.options.every((o) => o.id === item.r || item.w.includes(o.id)), "every sentence is the list's");
  /* The right sentence is also read on the card, after ÍNO's example. */
  assert.deepEqual(step(card, "lesa").sentences.map((x) => x.text), [w.x, item.r]);
  assert.ok(step(card, "skyring"), "the same sense: the explanation step stays");
  /* The other steps did not move: each draws from its own stream. */
  assert.deepEqual(step(card, "skyring"), step(CARDS.get("breyting|kvk"), "skyring"));

  /* A line that names another sense: the card is about THAT sense. Its
     definition is read, ÍNO's example (of the first sense) is not, and the
     explanation step — read against the first sense — is dropped. */
  const other = buildCard(lex, "breyting|kvk", { ex: withMeaning({ ...item, d: "önnur merking orðsins" }) });
  assert.equal(step(other, "lesa").def, "önnur merking orðsins");
  assert.deepEqual(step(other, "lesa").sentences.map((x) => x.text), [item.r]);
  assert.equal(step(other, "skyring"), null);
  assert.ok(step(other, "setning"));

  /* A line without a definition, with fewer than two wrong sentences, or
     whose right sentence does not hold the word: no step, and the card is
     what it was. */
  const bare = buildCard(lex, "breyting|kvk", { ex: NO_LIST });
  assert.equal(step(bare, "setning"), null);
  for (const bad of [{ ...item, d: null }, { ...item, w: item.w.slice(0, 1) }, { ...item, r: "Hér er orðið ekki." }])
    assert.deepEqual(buildCard(lex, "breyting|kvk", { ex: withMeaning(bad) }), bare);
  assert.deepEqual(senseOf(w, {}).sentences.map((x) => x.src), ["ÍNO"]);
});

test("judging a choice: exactly the right options", () => {
  const s = { answer: ["a", "b"] };
  assert.equal(judgeStep(s, ["b", "a"]), true);
  assert.equal(judgeStep(s, ["a"]), false);
  assert.equal(judgeStep(s, ["a", "b", "c"]), false);
  assert.equal(judgeStep(s, []), false);
});

test("nothing on a card names DLD or a support mode", () => {
  const text = JSON.stringify([...CARDS.values()].slice(0, 400));
  assert.doesNotMatch(text, /DLD|málþroska/i);
});

/* ---------- 4. kept in progress, as the pupil's own text ------------------- */

test("a finished card is kept: the rating, and what was chosen first in each step", () => {
  const S = blankState();
  assert.deepEqual(S.wordCards, {});
  const answers = { skyring: { c: ["breyting|kvk"], ok: true }, flokkur: { c: ["so"], ok: false } };
  assert.equal(saveCard(S, "breyting|kvk", { rating: 2, answers }, DAY1), true);
  assert.deepEqual(cardOf(S, "breyting|kvk"), { d: DAY1, n: 1, r: 2, a: answers });
  assert.equal(cardDone(S, "breyting|kvk"), true);
  assert.equal(cardDone(S, "hluti|kk"), false);
  /* Done again (a hard word comes back, #17): the newer card, counted. */
  saveCard(S, "breyting|kvk", { rating: 1, answers: {} }, DAY2);
  assert.deepEqual(cardOf(S, "breyting|kvk"), { d: DAY2, n: 2, r: 1, a: {} });
  /* What is not a card is not written. */
  assert.equal(saveCard(S, "breyting", done(), DAY1), false);
  assert.equal(saveCard(S, "hluti|kk", { rating: 7, answers: {} }, DAY1), false);
  assert.equal(saveCard(S, "hluti|kk", done(), "í dag"), false);
  assert.equal(cardDone(S, "hluti|kk"), false);
});

test("the slice: blank, migrate, the server's check — and it is the pupil's own text", () => {
  assert.equal(wordCardsSlice.key, "wordCards");
  assert.equal(wordCardsSlice.ownText, true);
  const good = { "hluti|kk": { d: DAY1, n: 1, r: 0, a: { kyn: { c: ["kk"], ok: true } } } };
  const odd = {
    ...good,
    "ekki-lykill": { d: DAY1, n: 1, r: 0, a: {} },
    "áhrif|hk": { d: "bráðum", n: 1, r: 0, a: {} },
    "svið|hk": { d: DAY1, n: 1, r: 3, a: {} },
    "raun|kvk": "kort",
    "þjóð|kvk": { d: DAY1, n: -4, r: 2, a: { "Slæmt Auðkenni": { c: ["x"], ok: true }, kyn: { c: "kvk", ok: true },
      flokkur: { c: ["no", 7, "x".repeat(300), ""], ok: "já" }, framtid: { c: ["eitthvað"], ok: true } } },
  };
  const clean = sanitiseCards(odd);
  assert.deepEqual(Object.keys(clean), ["hluti|kk", "þjóð|kvk"]);
  /* A step this program does not know is kept (a later version's), an
     answer of the wrong shape is not; `ok` is true only when it is true. */
  assert.deepEqual(clean["þjóð|kvk"], { d: DAY1, n: 1, r: 2, a: { flokkur: { c: ["no"], ok: false }, framtid: { c: ["eitthvað"], ok: true } } });
  assert.deepEqual(sanitiseCards(null), {});
  assert.deepEqual(sanitiseCards([1, 2]), {});
  assert.deepEqual(migrate({ ...blankState(), wordCards: odd }).wordCards, clean);
  assert.deepEqual(migrate({ v: 11, xp: 5 }).wordCards, {}, "an older copy starts without cards");
  /* The server: the same, and no day after tomorrow. */
  const future = { ...good, "svið|hk": { d: "2099-01-01", n: 1, r: 1, a: {} } };
  assert.deepEqual(cleanState({ ...blankState(), wordCards: future }, { today: new Date(DAY1 + "T12:00:00Z") }).wordCards, good);
});

test("two devices: the card done more times, then the later one; a card on one side only is kept", () => {
  const a = { d: DAY1, n: 1, r: 0, a: { kyn: { c: ["kk"], ok: true } } };
  const b = { d: DAY2, n: 1, r: 2, a: {} };
  const c = { d: DAY1, n: 2, r: 1, a: {} };
  assert.deepEqual(mergeCards(null, { "hluti|kk": a }, { "áhrif|hk": b }), { "áhrif|hk": b, "hluti|kk": a });
  assert.deepEqual(mergeCards(null, { "hluti|kk": a }, { "hluti|kk": b })["hluti|kk"], b, "the later day");
  assert.deepEqual(mergeCards(null, { "hluti|kk": b }, { "hluti|kk": a })["hluti|kk"], b);
  assert.deepEqual(mergeCards(null, { "hluti|kk": b }, { "hluti|kk": c })["hluti|kk"], c, "done more times");
  assert.deepEqual(mergeCards(null, { "hluti|kk": a }, { "hluti|kk": { ...a, r: 2 } })["hluti|kk"], a, "a tie: this device");
  const L = { ...blankState(), wordCards: { "hluti|kk": a } }, R = { ...blankState(), wordCards: { "áhrif|hk": b } };
  assert.deepEqual(mergeStates(null, L, R).wordCards, mergeStates(null, R, L).wordCards);
  const before = JSON.stringify([L, R]);
  mergeStates(L, L, R);
  assert.equal(JSON.stringify([L, R]), before, "merge changes nothing it is given");
});
