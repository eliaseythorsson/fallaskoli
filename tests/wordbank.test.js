/* v6.6: word health, the rescue drill, the word-set badges and the
   "Orðaforði" leaderboard metric. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, newSession, record, migrate, grantXp } from "../src/js/core/state.js";
import { HEALTH, DRILL, pushHistory, recentOf, statusOf, weakWords, vocabScore,
         startDrill, drillStep, drillReward, settleDrill, keptAfloat, drillable,
         rescueCount } from "../src/js/core/wordhealth.js";
import { THEMES, KINDS, SAYINGS, OPPOSITES, readSets, missingMembers } from "../src/js/core/wordsets.js";
import { BADGES, checkBadges } from "../src/js/core/badges.js";
import { collectionSummary } from "../src/js/core/collection.js";
import { scorecard, rank, METRICS } from "../src/js/core/leaderboard.js";
import { mergeStates } from "../src/js/core/merge.js";
import { cleanState } from "../server/guard.mjs";
import { drillTask, DRILL_PLAN, DRILL_MEANING_TURN, meaningPool } from "../src/js/tasks/index.js";

const lex = buildLexicon(DATA);

/** A word record with `c` right and `w` wrong, history in that order. */
const rec = (c, w, h) => ({ c, w, ...(h != null ? { h } : {}) });

/* ---------- every set can be won ---------- */

test("every word a set names is in the vocabulary", () => {
  const all = [...THEMES.map((t) => [t.id, t.words]), ...SAYINGS.map((t) => [t.id, t.words]),
               ...OPPOSITES.map((p) => [p.join("/"), p])];
  for (const [id, words] of all)
    assert.deepEqual(missingMembers(lex, words), [], `${id} asks for words the program never shows`);
});

test("every meaning class a KIND counts has enough nouns to reach it", () => {
  for (const k of KINDS) {
    const n = lex.nouns.filter((w) => k.classes.includes(w.s)).length;
    assert.ok(n >= k.n, `${k.id}: only ${n} nouns, needs ${k.n}`);
  }
});

test("set ids are unique ASCII", () => {
  const ids = [...THEMES, ...KINDS, ...SAYINGS].map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  ids.forEach((id) => assert.match(id, /^[a-z]+$/));
});

/* ---------- one word's health ---------- */

test("the history keeps the last dozen outcomes", () => {
  const r = rec(0, 0);
  for (let i = 0; i < 20; i++) pushHistory(r, i % 2 === 0);
  assert.equal(r.h.length, HEALTH.keep);
  assert.equal(r.h.slice(-2), "10");          // i = 18 right, i = 19 wrong
});

test("record() writes history for counted answers only", () => {
  const S = blankState(), sess = newSession(S);
  record(S, sess, { skill: "nafnord", word: "hestur|kk", ok: true, xp: 1 });
  record(S, sess, { skill: "ordaford", word: "hestur|kk", ok: true, xp: 1, counts: false });
  record(S, sess, { skill: "nafnord", word: "hestur|kk", ok: false, xp: 0 });
  assert.equal(S.words["hestur|kk"].h, "10");
});

test("a word is judged on its recent answers, and old counts fill the gaps", () => {
  /* Forty old answers, all wrong, then ten right: the window is all right. */
  assert.equal(recentOf(rec(10, 40, "1111111111")).acc, 1);
  /* No history at all (a state from before v6.6): the lifetime rate. */
  assert.equal(recentOf(rec(1, 9)).acc, 0.1);
  /* Three new answers right, the older 20 at 10%: 3 + 7 × 0.1 out of 10. */
  const r = recentOf(rec(5, 18, "111"));
  assert.ok(Math.abs(r.acc - (3 + 7 * (2 / 20)) / 10) < 1e-9);
});

test("weak means six answers or more and under a fifth right", () => {
  assert.equal(statusOf(rec(1, 6)), "weak");          // 7 seen, 14%
  assert.equal(statusOf(rec(0, 5)), "shaky");         // only 5 seen: not flagged yet
  assert.equal(statusOf(rec(2, 6)), "shaky");         // 25%: shaky, not weak
  assert.equal(statusOf(rec(5, 0)), "strong");
  assert.equal(statusOf(rec(1, 1)), "new");
  assert.equal(statusOf(rec(2, 1)), "ok");
  assert.equal(statusOf(undefined), "new");
});

test("weakWords lists the flagged words, worst first", () => {
  const S = blankState();
  S.words = { "hestur|kk": rec(1, 7), "kona|kvk": rec(0, 8), "fara|so": rec(5, 1) };
  const w = weakWords(S, lex);
  assert.deepEqual(w.map((x) => x.key), ["kona|kvk", "hestur|kk"]);
  assert.ok(w.every((x) => x.drillable));
});

/* ---------- the drill ---------- */

test("a drill never ends before ten questions", () => {
  const d = startDrill("hestur|kk", rec(0, 7));
  for (let i = 0; i < 9; i++) drillStep(d, true);
  assert.equal(d.done, false);
  drillStep(d, true);
  assert.equal(d.done, true);
  assert.equal(d.passed, true);
});

test("between ten and twenty, more than half right passes", () => {
  const d = startDrill("x|kk", null);
  /* 5 of 10 is exactly half — not more — so the drill goes on. */
  [1, 0, 1, 0, 1, 0, 1, 0, 1, 0].forEach((x) => drillStep(d, !!x));
  assert.equal(d.done, false);
  drillStep(d, true);                                     // 6 of 11
  assert.equal(d.done, true);
  assert.equal(d.passed, true);
});

test("twenty questions end it whatever the score", () => {
  const d = startDrill("x|kk", null);
  for (let i = 0; i < 20; i++) drillStep(d, i % 3 === 0);
  assert.equal(d.done, true);
  assert.equal(d.passed, false);
  assert.equal(d.n, DRILL.max);
  drillStep(d, true);
  assert.equal(d.n, DRILL.max, "a finished drill takes no more answers");
});

test("the reward: base and per right answer, half for a word rescued before, effort when it fails", () => {
  const pass = { done: true, passed: true, c: 8, n: 10 };
  assert.equal(drillReward(pass, null), DRILL.xpBase + 8 * DRILL.xpPerRight);
  assert.equal(drillReward(pass, { p: 1 }), Math.round((DRILL.xpBase + 8 * DRILL.xpPerRight) / 2));
  assert.equal(drillReward({ done: true, passed: false, c: 4, n: 20 }, null), DRILL.xpEndure);
  assert.equal(drillReward({ done: false }, null), 0);
});

test("settling a drill writes the ledger and says what the badges need", () => {
  const S = blankState();
  S.words["hestur|kk"] = rec(2, 15);
  const d = startDrill("hestur|kk", S.words["hestur|kk"]);
  [0, 0, 0, 1, 1, 1, 1, 1, 1, 1].forEach((x) => drillStep(d, !!x));
  assert.equal(d.passed, true);
  const r = settleDrill(S, d, rec(9, 18), "2026-11-11");
  assert.equal(r.turnaround, true);
  assert.equal(r.oldGhost, true);
  assert.equal(r.perfect, false);
  assert.equal(r.firstForWord, true);
  assert.equal(r.rescuesToday, 1);
  assert.deepEqual(S.drills["hestur|kk"], { p: 1, t: 1, f: 0, last: "2026-11-11", at: 27 });
  assert.equal(rescueCount(S), 1);
});

test("a rescued word is 'kept afloat' after five more answers going well", () => {
  const d = { p: 1, at: 20 };
  assert.equal(keptAfloat(rec(14, 10, "1101"), d), false);          // 24: only 4 since
  assert.equal(keptAfloat(rec(15, 10, "11011"), d), true);          // 25: 4 of 5
  assert.equal(keptAfloat(rec(13, 12, "10010"), d), false);         // 2 of 5
});

test("grantXp lands on today and on the total", () => {
  const S = blankState();
  grantXp(S, 80);
  assert.equal(S.xp, 80);
  assert.equal(Object.values(S.days)[0].xp, 80);
});

/* ---------- the drill builder ---------- */

test("a drill question is always about the drilled word", () => {
  const S = blankState(), sess = newSession(S);
  const ctx = { lex, S, sess };
  for (const [o, c] of [["hestur", "kk"], ["kona", "kvk"], ["barn", "hk"], ["fara", "so"],
                        ["góður", "lo"], ["þessi", "fn"], ["þrír", "to"]]) {
    const w = lex.lookup(o, c);
    for (let t = 0; t < 8; t++) {
      const task = drillTask(ctx, w, t);
      assert.ok(task, `${o}: no question on turn ${t}`);
      assert.equal(task.word, `${o}|${c}`);
      assert.equal(task.drill, true);
      if (t === DRILL_MEANING_TURN && task.typeId === "meaning") continue;
      assert.ok(DRILL_PLAN[c].includes(task.typeId));
    }
    assert.equal(ctx.drillWord, null, "the drill word must not leak into ordinary questions");
  }
});

test("a drill rotates through kinds of question", () => {
  const S = blankState(), sess = newSession(S);
  const ctx = { lex, S, sess };
  const w = lex.lookup("hestur", "kk");
  const kinds = new Set();
  for (let t = 0; t < 8; t++) kinds.add(drillTask(ctx, w, t).typeId);
  assert.ok(kinds.size >= 3, [...kinds].join(","));
});

test("an indeclinable word is drillable only if a sentence holds it", () => {
  assert.equal(drillable(lex, lex.lookup("í", "fs")), true);
  assert.equal(drillable(lex, lex.lookup("hestur", "kk")), true);
  assert.equal(drillable(lex, null), false);
});

test("the fifth drill question is Orðaforði when the word has a meaning", () => {
  const S = blankState(), sess = newSession(S);
  const ctx = { lex, S, sess };
  let asked = 0;
  for (const [o, c] of [["hestur", "kk"], ["kona", "kvk"], ["barn", "hk"], ["fara", "so"], ["góður", "lo"]]) {
    const w = lex.lookup(o, c);
    const task = drillTask(ctx, w, DRILL_MEANING_TURN);
    if (meaningPool([w]).length) {
      asked++;
      assert.equal(task.typeId, "meaning", `${o}: turn 5 should be the meaning question`);
      assert.equal(task.word, `${o}|${c}`);
      assert.equal(task.counts, false, "the meaning question has no wrong answer");
    } else {
      assert.notEqual(task.typeId, "meaning");
    }
    /* No other kind of question loses its turn: turns 3 and 5 are adjacent in the plan. */
    const plan = DRILL_PLAN[c];
    const a = drillTask(ctx, w, DRILL_MEANING_TURN - 1).typeId;
    const b = drillTask(ctx, w, DRILL_MEANING_TURN + 1).typeId;
    if (plan.length > 1 && a === plan[(DRILL_MEANING_TURN - 1) % plan.length])
      assert.notEqual(a, b);
  }
  assert.ok(asked >= 3, "most common words have a dictionary meaning");
});

/* ---------- the score ---------- */

test("the vocabulary score: found, held well, and nothing for a word in trouble", () => {
  const S = blankState();
  S.words = {
    "hestur|kk": rec(5, 0),       // strong: 1 + 2
    "kona|kvk": rec(1, 1),        // new: 1
    "fara|so": rec(0, 8),         // weak: 0
  };
  const v = vocabScore(S, lex);
  assert.equal(v.score, 4);
  assert.equal(v.weak, 1);
  assert.equal(v.strong, 1);
  assert.equal(v.health, null, "a share of three words is not stated");
  S.drills = { "kona|kvk": { p: 1, at: 2 } };
  assert.equal(vocabScore(S, lex).score, 5, "a rescued word that is not weak earns one more");
});

test("health is the share of judged words not in trouble, once twenty are judged", () => {
  const S = blankState();
  lex.nouns.slice(0, 20).forEach((w, i) => { S.words[`${w.o}|${w.c}`] = i < 15 ? rec(4, 0) : rec(0, 6); });
  assert.equal(vocabScore(S, lex).health, 75);
});

test("the leaderboard has Orðaforði and the scorecard carries it", () => {
  assert.ok(METRICS.some((m) => m.id === "vocab"));
  const a = blankState(), b = blankState();
  a.profile.id = "a"; b.profile.id = "b";
  a.words = { "hestur|kk": rec(5, 0), "kona|kvk": rec(0, 9) };
  b.words = { "hestur|kk": rec(1, 1), "kona|kvk": rec(1, 1) };
  const cards = [scorecard(a, lex), scorecard(b, lex)];
  assert.equal(cards[0].words, cards[1].words, "both have found two words");
  const r = rank(cards, "vocab");
  assert.equal(r[0].profile, "a", "a word held well outweighs a word let slide");
  assert.equal(r[0].value, 3);
});

/* ---------- sets ---------- */

const held = (...keys) => keys.map((k) => {
  const [lemma, cls] = k.split("|");
  const e = lex.lookup(lemma, cls);
  return { lemma, cls, s: e ? e.s : null };
});

test("themes, sayings and opposites are read off the lemmas held", () => {
  const r = readSets(held("vor|hk", "sumar|hk", "haust|hk", "vetur|kk",
    "æfing|kvk", "skapa|so", "meistari|kk", "heitur|lo", "kaldur|lo", "fugl|kk", "flug|hk",
    "amma|kvk", "inni|ao", "rör|hk"));
  assert.ok(r.themes.includes("arstidir"));
  assert.ok(r.sayings.includes("aefing"));
  assert.equal(r.opposites, 1);
  assert.equal(r.anagrams, 1);
  assert.equal(r.palindromes, 3);
});

test("*vor* the pronoun does not complete the seasons", () => {
  const r = readSets(held("vor|fn", "sumar|hk", "haust|hk", "vetur|kk"));
  assert.ok(!r.themes.includes("arstidir"));
});

test("a collection earns its set badges", () => {
  const S = blankState();
  ["vor|hk", "sumar|hk", "haust|hk", "vetur|kk", "æfing|kvk", "skapa|so", "meistari|kk"]
    .forEach((k) => { S.words[k] = rec(1, 0); });
  const ctx = { collection: collectionSummary(S, lex), skillRun: {}, skillCorrect: {}, skillLevel: {},
    time: { hour: 12 } };
  const ids = checkBadges(ctx, {}, {}).map((b) => b.id);
  assert.ok(ids.includes("th_arstidir"));
  assert.ok(ids.includes("say_aefing"));
  assert.ok(!ids.includes("say_all"));
});

test("drill badges fire on the drill result, and only then", () => {
  const cat = BADGES.filter((b) => b.group === "björgun");
  const base = { collection: { rescued: 1, kept: 0 }, skillRun: {}, skillCorrect: {}, skillLevel: {} };
  const ids = (ctx) => checkBadges(ctx, {}, {}, cat).map((b) => b.id).sort();
  assert.deepEqual(ids(base), ["rescue1"]);
  assert.deepEqual(ids({ ...base, drill: { passed: true, perfect: true, rescuesToday: 3 } }),
    ["drill_perfect", "rescue1"]);   // v6.9: drill_three is retired
  assert.deepEqual(ids({ ...base, collection: { rescued: 0 }, drill: { endured: true } }),
    ["drill_endure"]);
});

test("the word-health badges are visible signposts; the set badges are not", () => {
  for (const b of BADGES) {
    if (b.group === "björgun" || b.group === "heilsa") assert.equal(b.hidden, false, b.id);
    if (b.group === "þemu") assert.equal(b.hidden, true, b.id);
    if (b.group === "spakmæli" && b.id !== "say_all") assert.equal(b.secret, true, b.id);
  }
});

/* ---------- saving, merging, the server ---------- */

test("a v6.5 state opens with an empty drill ledger", () => {
  const S = migrate({ xp: 10, words: { "hestur|kk": { c: 1, w: 2 } } });
  assert.deepEqual(S.drills, {});
  assert.deepEqual(S.words["hestur|kk"], { c: 1, w: 2 });
});

test("two devices' drills are added together", () => {
  const base = blankState();
  const l = { ...blankState(), drills: { "hestur|kk": { p: 1, t: 1, f: 0, last: "2026-11-10", at: 9 } } };
  const r = { ...blankState(), drills: { "hestur|kk": { p: 0, t: 1, f: 1, last: "2026-11-11", at: 12 },
                                          "kona|kvk": { p: 1, t: 1, f: 0, last: "2026-11-11", at: 7 } } };
  const m = mergeStates(base, l, r);
  assert.deepEqual(m.drills["hestur|kk"], { p: 1, t: 2, f: 1, last: "2026-11-11", at: 12 });
  assert.ok(m.drills["kona|kvk"]);
});

test("the server keeps a word's history and the drill ledger, and nothing odd", () => {
  const S = blankState();
  S.words = { "hestur|kk": { c: 1, w: 1, h: "10" }, "kona|kvk": { c: 1, w: 0, h: "<script>" } };
  S.drills = { "hestur|kk": { p: 1, t: 2, f: 1, last: "2026-11-11", at: 5, extra: "x" } };
  S.drillDays = { "2026-11-11": 1, "nonsense": 4 };
  const C = cleanState(S, { today: new Date("2026-11-11T12:00:00Z") });
  assert.equal(C.words["hestur|kk"].h, "10");
  assert.equal(C.words["kona|kvk"].h, undefined);
  assert.deepEqual(C.drills["hestur|kk"], { p: 1, t: 2, f: 1, last: "2026-11-11", at: 5 });
  assert.deepEqual(C.drillDays, { "2026-11-11": 1 });
});
