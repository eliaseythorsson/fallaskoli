/* The second axis of difficulty (critique item 16): how hard the word and
   the cell are, beside how long the sentence is.

   Three things are held here:
     1. the build's scores say what a teacher would say — the known irregular
        words score high, the regular ones low, the hard cells above the easy;
     2. the level chooses on that axis — at þyngd 1 the words served are
        clearly more regular than at þyngd 5;
     3. nothing is starved — every class of word and every cell still comes
        at every level.

   The scores are measured on BÍN's paradigms by irregularity.py at build
   time; this file reads them out of the bundle as the app does. */

import test from "node:test";
import assert from "node:assert/strict";
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, newSession } from "../src/js/core/state.js";
import { SKILL_IDS } from "../src/js/core/skills.js";
import { seeded } from "../src/js/core/duel.js";
import { hardnessWeight, hardReach, HARD_FLOOR, HARD_MIN, HARD_MAX } from "../src/js/core/difficulty.js";
import { typeById, makeView } from "../src/js/tasks/index.js";
import { wordWeight, wordEase, cellEase, axisLevel } from "../src/js/tasks/shared.js";

const lex = buildLexicon(DATA);
const irr = (lemma, cls) => {
  const w = lex.lookup(lemma, cls);
  assert.ok(w, `${lemma} (${cls}) is not in the lexicon`);
  return w.irr;
};

/** A fresh pupil with every skill at `level`. */
function viewAt(level) {
  const S = blankState();
  const sess = newSession(S);
  SKILL_IDS.forEach((id) => { sess.diff[id] = level; });
  return makeView({ S, sess, today: "2026-11-16" });
}

/* ---------- 1. the scores ------------------------------------------------- */

test("every noun, adjective and verb has an irregularity score of 1–5, and the closed classes have none", () => {
  const scored = new Set(["kk", "kvk", "hk", "lo", "so"]);
  for (const w of lex.all) {
    if (scored.has(w.c)) {
      assert.ok(Number.isInteger(w.irr) && w.irr >= HARD_MIN && w.irr <= HARD_MAX,
        `${w.o} (${w.c}) has irr ${w.irr}`);
    } else assert.equal(w.irr, undefined, `${w.o} (${w.c}) should have no score`);
  }
});

test("known irregular nouns score high, regular ones low", () => {
  /* The critique's own list (fjörður is not in the vocabulary). */
  for (const [o, c] of [["maður", "kk"], ["kýr", "kvk"], ["bók", "kvk"], ["faðir", "kk"],
    ["móðir", "kvk"], ["bróðir", "kk"], ["dóttir", "kvk"], ["fótur", "kk"], ["hönd", "kvk"],
    ["nótt", "kvk"], ["tönn", "kvk"], ["mús", "kvk"], ["köttur", "kk"], ["björn", "kk"],
    ["dagur", "kk"], ["kona", "kvk"], ["bóndi", "kk"], ["tré", "hk"]])
    assert.ok(irr(o, c) >= 4, `${o} scores ${irr(o, c)}, expected 4 or 5`);
  assert.equal(irr("maður", "kk"), 5);
  /* fingur: syncope (fingri) and a plural with no ending — irregular, but it
     keeps one vowel throughout. */
  for (const [o, c] of [["fingur", "kk"], ["vetur", "kk"], ["sonur", "kk"]])
    assert.ok(irr(o, c) >= 3, `${o} scores ${irr(o, c)}, expected at least 3`);
  for (const [o, c] of [["hestur", "kk"], ["bíll", "kk"], ["stóll", "kk"], ["tími", "kk"],
    ["skóli", "kk"], ["læknir", "kk"], ["stelpa", "kvk"], ["mynd", "kvk"], ["hús", "hk"],
    ["borð", "hk"], ["auga", "hk"]])
    assert.equal(irr(o, c), 1, `${o} scores ${irr(o, c)}, expected 1`);
  /* One predictable alternation — u-umlaut, a -j-, a dropped vowel — is 2. */
  for (const [o, c] of [["saga", "kvk"], ["barn", "hk"], ["gjöf", "kvk"], ["kirkja", "kvk"],
    ["lykill", "kk"], ["staður", "kk"]])
    assert.equal(irr(o, c), 2, `${o} scores ${irr(o, c)}, expected 2`);
});

test("strong and preterite-present verbs score high, weak verbs in -aði low", () => {
  for (const o of ["vera", "fara", "taka", "standa", "ganga", "finna", "eiga", "kunna",
    "vita", "mega", "þurfa", "muna"])
    assert.equal(irr(o, "so"), 5, `${o} scores ${irr(o, "so")}`);
  for (const o of ["koma", "sjá", "bíta", "gráta", "hafa", "sækja"])
    assert.ok(irr(o, "so") >= 4, `${o} scores ${irr(o, "so")}`);
  /* weak with a vowel change or a -j- that goes */
  for (const o of ["telja", "spyrja", "velja", "segja"])
    assert.equal(irr(o, "so"), 3, `${o} scores ${irr(o, "so")}`);
  for (const o of ["borða", "byrja", "hjálpa", "skrifa", "hugsa"])
    assert.equal(irr(o, "so"), 1, `${o} scores ${irr(o, "so")}`);
  for (const o of ["heyra", "gera", "senda", "kalla", "tala"])
    assert.equal(irr(o, "so"), 2, `${o} scores ${irr(o, "so")}`);
});

test("adjectives: suppletive comparison scores high, a plain one low", () => {
  for (const o of ["góður", "gamall", "lítill", "mikill", "margur", "illur"])
    assert.equal(irr(o, "lo"), 5, `${o} scores ${irr(o, "lo")}`);
  for (const o of ["stór", "ungur", "þungur", "hár"])
    assert.equal(irr(o, "lo"), 3, `${o} (i-umlaut in the comparative) scores ${irr(o, "lo")}`);
  for (const o of ["fallegur", "rauður", "skemmtilegur", "frábær"])
    assert.equal(irr(o, "lo"), 1, `${o} scores ${irr(o, "lo")}`);
  assert.equal(irr("glaður", "lo"), 2);
});

test("every score from 1 to 5 is in use for nouns and verbs, and most words are regular", () => {
  for (const [name, pool] of [["nouns", lex.nouns], ["verbs", lex.verbs], ["adjectives", lex.adjectives]]) {
    const n = [0, 0, 0, 0, 0, 0];
    pool.forEach((w) => { n[w.irr]++; });
    for (let k = 1; k <= 5; k++) assert.ok(n[k] > 0, `no ${name} with irr ${k}`);
    assert.ok(n[1] + n[2] > pool.length / 2, `${name}: fewer than half score 1 or 2`);
    assert.ok(n[4] + n[5] < pool.length / 3, `${name}: a third or more score 4 or 5`);
  }
});

test("cells: every cell has a score, and the hard ones are above the easy ones", () => {
  for (const [key, order] of Object.entries(DATA.lex.orders)) {
    assert.equal(DATA.lex.cellh[key].length, order.length, `cellh.${key} does not match orders.${key}`);
    for (const m of order) {
      const h = lex.cellHardness(m);
      assert.ok(Number.isInteger(h) && h >= HARD_MIN && h <= HARD_MAX, `${m}: ${h}`);
    }
  }
  const h = lex.cellHardness;
  assert.ok(h("EFFT") > h("ÞFET"), "the genitive plural is harder than the accusative singular");
  assert.ok(h("EFET") > h("NFET") && h("ÞGFET") > h("NFET"));
  assert.ok(h("NFFT") > h("NFET"), "the plural is harder than the singular");
  assert.ok(h("EFFTgr") > h("EFFT"), "the article adds to it");
  assert.ok(h("GM-VH-ÞT-1P-ET") > h("GM-FH-NT-1P-ET"), "the past subjunctive is harder than the present indicative");
  assert.ok(h("GM-FH-ÞT-3P-ET") > h("GM-FH-NT-3P-ET"));
  assert.ok(h("GM-VH-NT-3P-ET") > h("GM-FH-ÞT-3P-ET"));
  assert.ok(h("MM-FH-NT-3P-ET") > h("GM-FH-NT-3P-ET"), "the middle voice adds to it");
  assert.ok(h("ESB-KK-EFFT") > h("FSB-KK-NFET"));
  assert.equal(h("NFET"), 1);
  assert.equal(lex.cellHardness("OBEYGJANLEGT"), null);
});

/* ---------- 2. the weight ---------------------------------------------------- */

test("hardnessWeight: full within reach, falling above it, never below the floor", () => {
  assert.equal(hardReach(1), 1);
  assert.equal(hardReach(3.5), 3.5);
  assert.equal(hardReach(7), 5);
  for (let level = 1; level <= 7; level += 0.5) {
    let prev = 1;
    for (let score = 1; score <= 5; score++) {
      const w = hardnessWeight(level, score);
      assert.ok(w <= prev + 1e-12, `not falling at level ${level}, score ${score}`);
      assert.ok(w >= HARD_FLOOR && w <= 1, `out of bounds at level ${level}, score ${score}: ${w}`);
      if (score <= level) assert.equal(w, 1);
      prev = w;
    }
  }
  /* a harder word gains weight as the level rises */
  for (let score = 2; score <= 5; score++)
    assert.ok(hardnessWeight(5, score) > hardnessWeight(1, score));
  assert.ok(hardnessWeight(1, 5) < hardnessWeight(1, 2) && hardnessWeight(1, 2) < 1);
  /* from level 5 the axis is flat */
  for (let score = 1; score <= 5; score++) assert.equal(hardnessWeight(5, score), 1);
  /* no score: neutral */
  assert.equal(hardnessWeight(1, undefined), 1);
  assert.equal(hardnessWeight(1, null), 1);
  assert.equal(hardnessWeight(1, NaN), 1);
});

test("the level the axis reads is the skill's live level, held under the policy's ceiling", () => {
  const v = viewAt(4.5);
  assert.equal(axisLevel(v, "nafnord"), 4.5);
  const low = makeView({ S: v.S, sess: v.sess, policy: { ...v.policy, maxLevel: 2 }, today: v.today });
  assert.equal(axisLevel(low, "nafnord"), 2);
  const madur = lex.lookup("maður", "kk"), hestur = lex.lookup("hestur", "kk");
  assert.equal(wordEase(viewAt(1), hestur, "nafnord"), 1);
  assert.equal(wordEase(viewAt(1), madur, "nafnord"), HARD_FLOOR);
  assert.equal(wordEase(viewAt(5), madur, "nafnord"), 1);
  /* a closed-class word is never weighed down */
  assert.equal(wordEase(viewAt(1), lex.lookup("ég", "pfn"), "fornofn"), 1);
  /* and the factor is part of the word's weight */
  assert.ok(wordWeight(lex, viewAt(5), madur, "nafnord") > 4 * wordWeight(lex, viewAt(1), madur, "nafnord"));
  assert.equal(wordWeight(lex, viewAt(5), hestur, "nafnord"), wordWeight(lex, viewAt(1), hestur, "nafnord"));
});

test("a review asks for its cell whatever the level: no cell is weighed down", () => {
  const v = viewAt(1);
  assert.equal(cellEase(lex, v, "nafnord", "EFFTgr"), HARD_FLOOR);
  const review = makeView({ S: v.S, sess: v.sess, today: v.today, force: { cell: "EFFTgr" } });
  assert.equal(cellEase(lex, review, "nafnord", "EFFTgr"), 1);
});

/* ---------- 3. what is served ---------------------------------------------- */

/** `n` questions of one type at one level, each from a fresh pupil. */
function serve(id, level, n, seed0 = 1) {
  const build = typeById(id).build;
  const out = [];
  for (let k = 0; k < n; k++) {
    const b = build(lex, viewAt(level), seeded(seed0 * 100000 + k));
    if (b) out.push(b.task);
  }
  return out;
}
const wordOf = (t) => t.v || t.n || t.w;
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const meanIrr = (tasks) => mean(tasks.map((t) => wordOf(t).irr));

test("at þyngd 1 the words served are clearly more regular than at þyngd 5", () => {
  /* The types that choose their word freely. (The cloze, `fill`, takes most
     of its nouns from the sentence, so the level moves it less; it is held
     to the direction only.) */
  /* The least difference asked of each: about half of what is measured
     (verbs 2.1 → 3.1, noun tables 1.3 → 1.65, adjective tables 1.25 → 1.75).
     Most nouns are regular at any level, so their mean has less room. */
  const LEAST = { verb: 0.6, tbl_so: 0.6, tbl_no: 0.2, tbl_lo: 0.25 };
  for (const [id, least] of Object.entries(LEAST)) {
    const lo = meanIrr(serve(id, 1, 700)), hi = meanIrr(serve(id, 5, 700));
    assert.ok(hi - lo >= least && lo <= 0.9 * hi,
      `${id}: mean irregularity ${lo.toFixed(2)} at þyngd 1 and ${hi.toFixed(2)} at þyngd 5`);
    const mid = meanIrr(serve(id, 3, 700));
    assert.ok(mid > lo - 0.05 && mid < hi + 0.05, `${id}: þyngd 3 (${mid.toFixed(2)}) is not between`);
  }
});

test("the share of hard words (4–5) grows with the level, and of regular ones (1) falls", () => {
  const share = (tasks, ok) => tasks.filter((t) => ok(wordOf(t).irr)).length / tasks.length;
  for (const id of ["verb", "tbl_no"]) {
    const a = serve(id, 1, 500), b = serve(id, 5, 500);
    assert.ok(share(b, (x) => x >= 4) > 1.5 * share(a, (x) => x >= 4), `${id}: hard words`);
    assert.ok(share(a, (x) => x === 1) > share(b, (x) => x === 1), `${id}: regular words`);
  }
});

test("no class of word disappears at any level", () => {
  /* In what is served … */
  for (const id of ["verb", "tbl_no"]) {
    for (const level of [1, 3, 7]) {
      const seen = new Set(serve(id, level, 1000, 7).map((t) => wordOf(t).irr));
      for (let k = 1; k <= 5; k++)
        assert.ok(seen.has(k), `${id} at þyngd ${level}: no word of irregularity ${k} in 1000 questions`);
    }
  }
  /* … and in the weights themselves: at the lowest level the hardest words
     of each class still hold a real share of the draw (they are also the
     commonest words, which is why the floor is enough). */
  for (const [skill, pool] of [["nafnord", lex.nouns], ["sagnord", lex.verbs], ["lysingarord", lex.adjectives]]) {
    const v = viewAt(1);
    const by = [0, 0, 0, 0, 0, 0];
    pool.forEach((w) => { by[w.irr] += wordWeight(lex, v, w, skill); });
    const total = by.reduce((s, x) => s + x, 0);
    for (let k = 1; k <= 5; k++)
      assert.ok(by[k] / total >= 0.004, `${skill}: irregularity ${k} has ${(100 * by[k] / total).toFixed(2)}% of the weight at þyngd 1`);
    assert.ok((by[4] + by[5]) / total >= 0.015, `${skill}: hard words have under 1.5% of the weight at þyngd 1`);
  }
});

test("no cell disappears at any level, and the easy cells lead at a low one", () => {
  /* The noun table: all four columns at every level. */
  for (const level of [1, 3, 5]) {
    const cols = new Map();
    serve("tbl_no", level, 800, 3).forEach((t) => {
      const c = t.cells[0].m.replace(/^NF/, "");
      cols.set(c, (cols.get(c) || 0) + 1);
    });
    for (const c of ["ET", "ETgr", "FT", "FTgr"])
      assert.ok((cols.get(c) || 0) >= 8, `tbl_no at þyngd ${level}: column ${c} came ${cols.get(c) || 0} times in 800`);
    if (level === 1) assert.ok(cols.get("ET") > cols.get("FTgr"), "the plain singular leads at þyngd 1");
  }
  /* "Beygðu sögnina": every person of both open tenses at þyngd 1. */
  const cells = new Map();
  serve("verb", 1, 1500, 5).forEach((t) => cells.set(t.m, (cells.get(t.m) || 0) + 1));
  for (const tense of ["GM-FH-NT", "GM-FH-ÞT"])
    for (const p of ["1P-ET", "2P-ET", "3P-ET", "1P-FT", "2P-FT", "3P-FT"])
      assert.ok((cells.get(`${tense}-${p}`) || 0) >= 10, `verb at þyngd 1: ${tense}-${p} came ${cells.get(`${tense}-${p}`) || 0} times`);
  const sum = (re) => [...cells].filter(([m]) => re.test(m)).reduce((s, [, n]) => s + n, 0);
  assert.ok(sum(/-NT-/) > sum(/-ÞT-/), "the present leads at þyngd 1");
  /* The cloze: all four cases, both numbers, at þyngd 1 and at þyngd 5. */
  for (const level of [1, 5]) {
    const seen = new Set(serve("fill", level, 600, 9).map((t) => t.m.replace(/gr$/, "")));
    for (const c of ["NF", "ÞF", "ÞGF", "EF"])
      assert.ok([...seen].some((m) => m.startsWith(c)), `fill at þyngd ${level}: no ${c}`);
    assert.ok([...seen].some((m) => m.endsWith("FT")) && [...seen].some((m) => m.endsWith("ET")),
      `fill at þyngd ${level}: one number is missing`);
  }
});

test("the cloze moves the same way: more regular nouns at þyngd 1 than at þyngd 5", () => {
  const lo = meanIrr(serve("fill", 1, 800)), hi = meanIrr(serve("fill", 5, 800));
  assert.ok(hi > lo, `fill: ${lo.toFixed(2)} at þyngd 1, ${hi.toFixed(2)} at þyngd 5`);
});

/* ---------- 4. the hook for calibration (item 17) --------------------------- */

test("scores can be replaced from outside, in one place, and the builders follow", () => {
  const cal = buildLexicon(DATA, { hardness: {
    words: { "hestur|kk": 4.5, "maður|kk": 99, "bók|kvk": "x" },
    cells: { "ÞFET": 5, "EFFT": 0, "NFET": null },
  } });
  assert.equal(cal.lookup("hestur", "kk").irr, 4.5);
  assert.equal(cal.lookup("maður", "kk").irr, 5, "held to the scale");
  assert.equal(cal.lookup("bók", "kvk").irr, lex.lookup("bók", "kvk").irr, "not a number: ignored");
  assert.equal(cal.cellHardness("ÞFET"), 5);
  assert.equal(cal.cellHardness("EFFT"), 1);
  assert.equal(cal.cellHardness("NFET"), 1);
  /* the bundle is not written to */
  assert.equal(lex.lookup("hestur", "kk").irr, 1);
  assert.equal(buildLexicon(DATA).lookup("hestur", "kk").irr, 1);
  /* and the weight of the word follows the new score */
  const v = viewAt(1);
  assert.ok(wordWeight(cal, v, cal.lookup("hestur", "kk"), "nafnord")
    < 0.3 * wordWeight(lex, v, lex.lookup("hestur", "kk"), "nafnord"));
});
