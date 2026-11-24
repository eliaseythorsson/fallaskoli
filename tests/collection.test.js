import { test } from "node:test";
import assert from "node:assert/strict";
import { easter, holidayName, holidaysOf, isWeekend, timeContext } from "../src/js/core/calendar.js";
import { BADGES, checkBadges } from "../src/js/core/badges.js";
import { COVERAGE_MIN_CLASS, collectionByClass, collectionSummary } from "../src/js/core/collection.js";
import { WORD_TIERS, RARE_MAX_Q, wordTier } from "../src/js/core/rarity.js";
import { blankState } from "../src/js/core/state.js";
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";

const lex = buildLexicon(DATA);

/* ---------- calendar ---------- */

test("Easter Sunday falls where it should", () => {
  const cases = { 2024: "2024-3-31", 2025: "2025-4-20", 2026: "2026-4-5", 2027: "2027-3-28" };
  for (const [y, want] of Object.entries(cases)) {
    const d = easter(+y);
    assert.equal(`${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`, want);
  }
});

test("Icelandic red-letter days are in their places", () => {
  assert.equal(holidayName(new Date(2026, 5, 17)), "þjóðhátíðardagurinn");
  assert.equal(holidayName(new Date(2026, 11, 25)), "jóladagur");
  assert.equal(holidayName(new Date(2026, 0, 1)), "nýársdagur");
  assert.equal(holidayName(new Date(2026, 11, 23)), "Þorláksmessa");
  assert.equal(holidayName(new Date(2026, 3, 5)), "páskadagur");
  assert.equal(holidayName(new Date(2026, 8, 9)), null);
});

test("the first day of summer is the Thursday after 18 April", () => {
  for (const y of [2024, 2025, 2026, 2027]) {
    const entry = [...holidaysOf(y)].find(([, nm]) => nm === "sumardagurinn fyrsti");
    const d = new Date(entry[0] + "T00:00:00");
    assert.equal(d.getDay(), 4, `${y}: not a Thursday`);
    assert.ok(d.getDate() >= 19 && d.getMonth() === 3);
  }
});

test("weekends and the time context", () => {
  assert.equal(isWeekend(new Date(2026, 7, 15)), true);   // Saturday
  assert.equal(isWeekend(new Date(2026, 7, 18)), false);  // Tuesday
  const ctx = timeContext(new Date(2026, 11, 25, 2));
  assert.equal(ctx.hour, 2);
  assert.equal(ctx.holiday, "jóladagur");
});

/* ---------- secret badges ---------- */

const baseCtx = (over = {}) => ({
  run: 1, skillRun: {}, skillCorrect: {}, skillLevel: {}, dayAnswers: 1, dayCorrect: 1,
  sessionCorrect: 1, sessionNewWords: 0, totalCorrect: 1, level: 1, dayStreak: 0,
  collection: { total: 0, rare: 0, mastered: 0, byClass: {}, coverage: {}, fl: 0 },
  time: { hour: 12, weekend: false, holiday: null, schoolBreak: false, month: 8, date: 1, weekday: 3 },
  ...over,
});

test("secret badges exist and stay hidden", () => {
  const secret = BADGES.filter((b) => b.group === "leyni");
  assert.ok(secret.length >= 15, `only ${secret.length} secret badges`);
  assert.ok(secret.every((b) => b.hidden), "secret badges must not be visible in advance");
});

test("levels and day streaks are visible in advance, nothing else is", () => {
  assert.ok(BADGES.filter((b) => b.group === "stig").every((b) => !b.hidden));
  assert.ok(BADGES.filter((b) => b.group === "dagar").every((b) => !b.hidden));
  assert.ok(BADGES.filter((b) => b.group === "röð").every((b) => b.hidden));
});

test("the night badge only fires at night", () => {
  const cat = BADGES.filter((b) => b.id === "s_night");
  assert.equal(checkBadges(baseCtx({ time: { ...baseCtx().time, hour: 3 } }), {}, {}, cat).length, 1);
  assert.equal(checkBadges(baseCtx({ time: { ...baseCtx().time, hour: 15 } }), {}, {}, cat).length, 0);
});

test("holiday badges fire on the right day", () => {
  const jol = BADGES.filter((b) => b.id.startsWith("s_jóladagur"));
  assert.equal(jol.length, 1);
  const on = baseCtx({ time: { ...baseCtx().time, holiday: "jóladagur" } });
  assert.equal(checkBadges(on, {}, {}, jol).length, 1);
  assert.equal(checkBadges(baseCtx(), {}, {}, jol).length, 0);
});

test("secret badges are capped so they cannot flood a session", () => {
  const cat = BADGES.filter((b) => b.id === "s_night");
  const awards = {};
  const ctx = baseCtx({ time: { ...baseCtx().time, hour: 2 } });
  let n = 0;
  for (let i = 0; i < 20; i++) n += checkBadges(ctx, {}, awards, cat).length;
  assert.equal(n, 1);
});

/* ---------- the word collection ---------- */

test("the collection counts only words that have been seen", () => {
  const S = blankState();
  S.words["hestur|kk"] = { c: 4, w: 1 };
  S.words["ljós|hk"] = { c: 1, w: 0 };
  S.words["ljós|lo"] = { c: 0, w: 2 };
  const groups = collectionByClass(S, lex);
  const kk = groups.find((g) => g.cls === "kk");
  assert.equal(kk.seen, 1);
  assert.equal(kk.words[0].lemma, "hestur");
  assert.equal(kk.words[0].pct, 80);
  assert.ok(kk.total > 100, "the class total has to come from the corpus");

  /* homographs are two separate exhibits */
  assert.equal(groups.find((g) => g.cls === "hk").seen, 1);
  assert.equal(groups.find((g) => g.cls === "lo").seen, 1);
});

test("a word that has not been seen is nowhere visible", () => {
  const S = blankState();
  S.words["hestur|kk"] = { c: 1, w: 0 };
  const shown = collectionByClass(S, lex).flatMap((g) => g.words.map((w) => w.lemma));
  assert.deepEqual(shown, ["hestur"]);
  assert.ok(lex.byClass.kk.length > 1, "the corpus itself holds more words than are shown");
});

test("the collection summary feeds the badges", () => {
  const S = blankState();
  /* 100 words, for `coll100`: `coll25` was retired in v6.13 (item 56). */
  lex.byClass.kk.slice(0, 100).forEach((w) => { S.words[`${w.o}|kk`] = { c: 3, w: 0 }; });
  const sum = collectionSummary(S, lex);
  assert.equal(sum.total, 100);
  assert.equal(sum.byClass.kk, 100);
  assert.ok(sum.coverage.kk > 0 && sum.coverage.kk < 1);
  assert.equal(sum.mastered, 100);
  const cat = BADGES.filter((b) => b.id === "coll100");
  assert.equal(checkBadges(baseCtx({ collection: sum }), {}, {}, cat).length, 1);
});

/* ---------- word rarity (rewritten in v5.6) ------------------------------
 *
 * The owner, on v5.5: *"I got a diamond badge for the word rarity of the word
 * 'vindur'. This is a very simple and common word."*
 *
 * These tests are written against real words rather than against the rule, and
 * that is deliberate. v5.5's test was phrased in terms of its own constant
 * (`r > class size * RARE_SHARE`), so it could not fail no matter how
 * meaningless the constant became — which is design rule 4 exactly. A test that
 * names *vindur* fails the moment the definition stops matching what a person
 * would call a rare word.
 *
 * On v5.5 the first assertion below fails: *vindur* is rank 275 of 1,399
 * masculine nouns, and that put it in the bottom 15% by rank.               */

const EVERYDAY = ["vindur", "hestur", "regn", "jökull", "epli", "sund", "húfa",
                  "mjólk", "blýantur", "kettlingur", "risi", "snjór", "draugur"];

test("no word a child uses weekly counts as rare", () => {
  const S = blankState();
  for (const lemma of EVERYDAY) {
    const entry = lex.lemma(lemma).find((w) => ["kk", "kvk", "hk"].includes(w.c));
    assert.ok(entry, `${lemma} is missing from the corpus`);
    S.words[`${lemma}|${entry.c}`] = { c: 1, w: 0 };
  }
  assert.equal(collectionSummary(S, lex).rare, 0,
    "an everyday word was counted as a rare find");
});

test("vindur is a common word and reads as one", () => {
  const vindur = lex.lookup("vindur", "kk");
  assert.ok(vindur.q >= WORD_TIERS[0].min, `vindur scored ${vindur.q}`);
  assert.equal(wordTier(vindur.q).id, "algengt");
});

test("a genuinely infrequent word still counts", () => {
  /* Taken from the corpus by score rather than written down here, so the test
     keeps working when the vocabulary is rebuilt. */
  const rareWord = lex.byClass.kk.find((w) => w.q < RARE_MAX_Q);
  assert.ok(rareWord, "no word in the corpus is rare enough to earn the badge");
  const S = blankState();
  S.words[`${rareWord.o}|kk`] = { c: 1, w: 0 };
  assert.equal(collectionSummary(S, lex).rare, 1);
  assert.ok(["mjogsjaldgaeft", "sogulegt", "godsagnakennt"]
    .includes(wordTier(rareWord.q).id));
});

test("rarity does not depend on which word class a word landed in", () => {
  /* The bug the old rule had by construction: the same frequency meant
     different things in a class of 1,399 and a class of 50. Two words with the
     same score must now get the same tier whatever their class. */
  const byScore = new Map();
  for (const w of lex.all) {
    /* A LÍNO-2 word the subtitles never saw has no score and no tier (#9;
       tests/lino.test.js holds that rule). */
    if (w.q == null) continue;
    const t = wordTier(w.q);
    const seen = byScore.get(w.q);
    if (seen) assert.equal(t.id, seen, `score ${w.q} produced two different tiers`);
    else byScore.set(w.q, t.id);
  }
  assert.ok(byScore.size > 100, "not enough distinct scores to be a real check");
});

test("the rare band stays a small share of the vocabulary", () => {
  /* Badge inflation is what this guards. A tenth of the corpus being "rare"
     would hand out the find on the first afternoon. */
  const share = lex.all.filter((w) => w.q < RARE_MAX_Q).length / lex.all.length;
  assert.ok(share > 0.01 && share < 0.10, `rare band is ${(100 * share).toFixed(1)}%`);
});

test("coverage badges ignore a word class with one word in it", () => {
  /* The bug this pins down: a child who met *hinn* owned the entire article
     class (1 of 1 = 100%) and took all four coverage badges from one answer. */
  const S = blankState();
  const gr = lex.byClass.gr;
  if (gr && gr.length && gr.length < COVERAGE_MIN_CLASS) {
    S.words[`${gr[0].o}|gr`] = { c: 1, w: 0 };
    const cov = collectionSummary(S, lex).coverage;
    assert.equal(cov.gr, undefined, "a class that small must not report coverage");
    assert.ok(Object.values(cov).every((p) => p < 0.5),
      "one word must not give half coverage in any class");
  }
});
