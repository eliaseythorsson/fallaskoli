/* Critique item 23 for Fallstjórn, Óbeygjanleg orð and Orðaforði: at least
   150 different questions at every band a type declares — generated from
   frames × BÍN, not from longer hand lists — and every one of them right.

   The count is tests/pools.js (shared with the Lýsingarorð / Fornöfn /
   Töluorð half of the item): fresh pupils, one per build, what each SEES.
   Before v6.13, at a pupil's own band: fs_operson 8-19 different questions,
   fs_hreyf 8-28 pairs, fs_sogn 37-59, ob_st 5-12, ob_flokka 30-125,
   or_samhengi 3-44, or_myndun 11-65, govern 125 at þyngd 1.

   The rest holds the generated questions to what the hand-written ones were
   held to: every form BÍN's (data/exercises.js, which pipeline/build_exercises.py
   looked up), one right answer — for a pair, in both halves — and a review
   gets the item, cell or word it asks for (`view.force`). */

import test from "node:test";
import assert from "node:assert/strict";
import { EX } from "../data/exercises.js";
import { seeded } from "../src/js/core/duel.js";
import { CATEGORIES } from "../src/js/tasks/registry.js";
import { impersonalItems, fsImpers, motionPairs, fsMotion, fsVerb } from "../src/js/tasks/fallstjorn.js";
import { obConj } from "../src/js/tasks/obeygjanleg.js";
import { poolFaults, buildFresh, freshView, poolLex, POOL_MIN } from "./pools.js";

const lex = poolLex();
const MINE = {
  fallstjorn: ["govern", "fs_hreyf", "fs_sogn", "fs_operson"],
  obeygjanleg: ["ob_st", "ob_fsao", "ob_flokka"],
  ordaford: ["or_samhengi", "or_myndun", "or_utundan"],
};

/* ---------- the count ---------------------------------------------------- */

test(`item 23: every Fallstjórn, Óbeygjanleg orð and Orðaforði type asked for builds ${POOL_MIN}+ different questions at every band it declares`, () => {
  for (const [cat, ids] of Object.entries(MINE))
    for (const id of ids) assert.ok(CATEGORIES[cat].some((t) => t.id === id), `${id} is not in ${cat}`);
  assert.deepEqual(poolFaults(Object.values(MINE).flat()), []);
});

/* ---------- fs_operson: IMPERSONAL_FRAMES × IMPERSONAL_SUBJECTS ----------- */

test("fs_operson: every subject is BÍN's form in the case asked, and never the cue copied — except the traps", () => {
  const items = impersonalItems();
  assert.ok(items.length > 1000, `${items.length} items`);
  const ok = { "*": 0, trap: 0 };
  for (const x of items) {
    assert.deepEqual(x.a, EX.para[`${x.l}|${x.c}`][x.m], `${x.t} (${x.cue})`);
    if (x.trap) {
      assert.match(x.m, /^NF/, x.t);
      assert.ok(x.a.includes(x.cue), x.t);
      assert.ok(["hlakka", "kvíða"].includes(x.verb), x.verb);
      ok.trap++;
    } else {
      assert.match(x.m, /^(ÞF|ÞGF)/, x.t);
      assert.ok(!x.a.includes(x.cue), `${x.t}: the answer is the cue`);
      ok["*"]++;
    }
    /* *það* is never a person in the singular: *því langar* is no one */
    assert.ok(!(x.l === "það" && x.m.endsWith("ET")), x.t);
    assert.ok(x.lvl >= 2 && x.lvl <= 5, `${x.t}: level ${x.lvl}`);
  }
  assert.ok(ok.trap > 100 && ok["*"] > 800, JSON.stringify(ok));
  /* the explanation shows the answer with its verb */
  for (const x of items.slice(0, 300)) assert.ok(x.why.toLowerCase().includes(x.a[0].toLowerCase()), x.why);
});

test("fs_operson: no neuter singular with *vera/verða* + adjective (*barnið er kalt* is right too)", () => {
  const bad = impersonalItems().filter((x) => /^___ (er|var|verður|varð) /.test(x.t) && x.c === "hk" && /ET/.test(x.m));
  assert.deepEqual(bad.map((x) => x.key), []);
  assert.ok(impersonalItems().some((x) => /^___ er kalt/.test(x.t) && x.l === "barn" && /FT/.test(x.m)));
});

test("native reading (item 6 strictness): the distractors that would also be right are gone", () => {
  /* *ég man þegar ég var lítill*: no *þegar* after *man ekki*; *pabbi sagði
     þegar …* is arguable: no *þegar* after *sagði/hélt/vona* */
  for (const x of EX.conjunction) {
    if (/man ekki ___/.test(x.t)) assert.ok(!x.w.includes("þegar"), x.t);
    if (/(sagði|hélt|vona) ___/.test(x.t)) assert.ok(!x.w.includes("þegar"), x.t);
    /* *ég æfði mig mikið af því að ég vann keppnina* can be meant */
    assert.ok(!/^Ég æfði mig mikið ___ ég vann keppnina\.$/.test(x.t), x.t);
  }
  /* *horfði út gluggann* (út um), *báturinn fór undir* */
  assert.ok(!EX.advPrep.some((x) => /út gluggann|fór undir\./.test(x.t)));
  /* a thief takes things worth stealing */
  assert.ok(!EX.verbCase.some((x) => /^Þjófurinn/.test(x.t) && ["blýantur", "vettlingur", "nesti", "húfa", "trefill", "bolti"].includes(x.noun)));
  /* one can write with milk (invisible ink) */
  const w = EX.wordInContext.filter((x) => /skrifaði nafnið mitt/.test(x.t) && x.gen);
  assert.ok(w.length && w.every((x) => !x.w.some((o) => ["mjólk", "súpa"].includes(o.o))));
});

test("fs_operson: the trap agrees with its subject (*ég hlakka*, *við hlökkum*), the others are third person", () => {
  const byT = (re) => impersonalItems().filter((x) => re.test(x.t));
  /* *hlakka*: ég, and every third person plural (þeir, þær, þau, strákarnir) */
  assert.ok(byT(/^___ hlakka til/).every((x) => (x.l === "ég" && x.m === "NFET") ||
    (/FT/.test(x.m) && !["ég", "þú"].includes(x.l))));
  assert.ok(byT(/^___ hlökkum til/).every((x) => x.l === "ég" && x.m === "NFFT"));
  assert.ok(byT(/^___ langar /).length > 20);
});

test("fs_operson: a review gets its item, its verb, or its subject", () => {
  const x = impersonalItems().find((y) => y.verb === "langa" && y.l === "strákur");
  for (let k = 0; k < 10; k++) {
    assert.equal(fsImpers(lex, freshView(3, { force: { item: x.key } }), seeded(k)).task.item, x.key);
    assert.equal(fsImpers(lex, freshView(3, { force: { cell: "stjórn:vanta" } }), seeded(k)).task.cell, "stjórn:vanta");
    const w = lex.lookup("strákur", "kk");
    assert.ok(fsImpers(lex, freshView(3, { drillWord: w }), seeded(k)).task.cue.startsWith("strák"));
  }
});

/* ---------- fs_hreyf: MOTION_SETS ---------------------------------------- */

test("fs_hreyf: every pair is one noun, one preposition, motion once and rest once, two different forms", () => {
  const pairs = motionPairs();
  assert.ok(pairs.length > 400, `${pairs.length} pairs`);
  for (const p of pairs) {
    assert.equal(p.go.motion, true);
    assert.equal(p.stay.motion, false);
    assert.equal(p.go.noun, p.stay.noun);
    assert.equal(p.go.prep, p.stay.prep);
    assert.notEqual(p.go.thf[0], p.go.thgf[0], p.go.t);
    assert.deepEqual(p.go.thf, EX.para[`${p.go.noun}|${p.go.g}`]["ÞF" + p.go.col]);
    assert.deepEqual(p.go.thgf, EX.para[`${p.go.noun}|${p.go.g}`]["ÞGF" + p.go.col]);
    assert.notEqual(p.go.t, p.stay.t);
  }
  /* item 6: never *yfir* in the sets, and *undir* in motion only as *inn undir* */
  for (const set of EX.motionSets) {
    assert.notEqual(set.prep, "yfir");
    if (set.prep === "undir") set.go.forEach((f) => assert.match(f.t, /inn undir ___/, f.t));
  }
});

test("fs_hreyf: each half of a built pair is right with its own answer — þolfall in motion, þágufall at rest", () => {
  const pairs = motionPairs();
  const find = (t, ans) => pairs.flatMap((p) => [p.go, p.stay]).find((h) => h.t === t && (h.thf.includes(ans) || h.thgf.includes(ans)));
  for (const band of [1, 2, 3]) {
    for (const t of buildFresh("fs_hreyf", band, 200)) {
      for (const h of [t, t.second]) {
        const x = find(h.s.t, h.answer);
        assert.ok(x, h.s.t);
        assert.equal(h.answer, (x.motion ? x.thf : x.thgf)[0], h.s.t);
        assert.deepEqual([...h.options].sort(), [x.thf[0], x.thgf[0]].sort());
      }
    }
  }
  const p = pairs[pairs.length - 1];
  assert.equal(fsMotion(lex, freshView(2, { force: { item: p.key } }), seeded(3)).task.item, p.key);
});

/* ---------- fs_sogn: VERB_FRAMES × noun groups ----------------------------- */

test("fs_sogn: every noun is BÍN's in the case its verb governs, never the cue, never after a preposition", () => {
  assert.ok(EX.verbCase.length > 500, `${EX.verbCase.length} items`);
  for (const x of EX.verbCase) {
    assert.deepEqual(x.a, EX.para[`${x.noun}|${x.g}`][x.m], `${x.t} ${x.noun}`);
    assert.ok(x.m.startsWith(x.case), `${x.t}: ${x.m} for ${x.case}`);
    assert.ok(!x.a.includes(x.cue), `${x.t}: ${x.noun}`);
    assert.ok(!/(^|\s)(til|á|í|með|frá|um|af|að|eftir|fyrir)\s+___/.test(x.t), x.t);
    assert.ok(x.lvl >= 2 && x.lvl <= 4, `${x.t}: level ${x.lvl}`);
  }
  const t = fsVerb(lex, freshView(3, { force: { cell: "stjórn:loka" } }), seeded(1)).task;
  assert.equal(t.cell, "stjórn:loka");
});

/* ---------- ob_st: the generated contrast sets ---------------------------- */

test("ob_st: the generated sets — *en* after every comparative, the correlatives paired, a review gets its item", () => {
  assert.ok(EX.conjunction.length >= POOL_MIN, `${EX.conjunction.length} items`);
  for (const x of EX.conjunction) {
    if (/^Bæði /.test(x.t)) assert.equal(x.a, "og", x.t);
    if (/^Hvorki /.test(x.t)) assert.equal(x.a, "né", x.t);
    if (/^Annaðhvort \S+ (minn|mín )?___ /.test(x.t)) assert.equal(x.a, "eða", x.t);
    if (/ er \S+(ri|ra) ___ /.test(x.t)) assert.equal(x.a, "en", x.t);
    /* *ég veit ekki nema* is an idiom: never a wrong option after *veit ekki* */
    if (/veit ekki ___|vitum ekki ___|man ekki ___/.test(x.t)) assert.ok(!x.w.includes("nema"), x.t);
  }
  const x = EX.conjunction[EX.conjunction.length - 1];
  assert.equal(obConj(lex, freshView(1, { force: { item: x.t } }), seeded(2)).task.item, x.t);
});

/* ---------- ob_fsao: ADV_PREP_FRAMES -------------------------------------- */

test("ob_fsao: a preposition stands before its noun, an adverb stands alone; every pair asks one of each", () => {
  /* the nouns of the generated sentences are kept in EX.para by the build */
  const nouns = new Set([...lex.nouns.flatMap((w) => Object.values(w.forms).flat()),
    ...Object.entries(EX.para).filter(([k]) => /\|(kk|kvk|hk)$/.test(k)).flatMap(([, p]) => Object.values(p).flat())]);
  for (const x of EX.advPrep) {
    const toks = x.t.match(/[\p{L}]+|[.!?]/gu);
    const at = toks.findIndex((w) => w.toLowerCase() === x.w);
    assert.ok(at >= 0, x.t);
    const next = toks[at + 1];
    if (x.c === "fs") assert.ok(nouns.has(next) || ["mér", "okkur", "þér", "honum", "henni"].includes(next), `${x.t}: *${x.w}* before *${next}*`);
    else assert.ok([".", "!", "?", "í", "á", "hjá", "heima"].includes(next), `${x.t}: *${x.w}* before *${next}*`);
  }
  for (const t of buildFresh("ob_fsao", 1, 200)) assert.notEqual(t.answer, t.second.answer, t.s.t);
});

/* ---------- or_samhengi: WORD_IN_CONTEXT_FRAMES --------------------------- */

test("or_samhengi: one answer that fits, three that cannot, all four in the same BÍN form of their own noun", () => {
  const gen = EX.wordInContext.filter((x) => x.gen);
  assert.ok(gen.length > 120, `${gen.length} generated items`);
  for (const x of gen) {
    assert.ok(x.w.length >= 3, x.t);
    assert.ok(!x.w.some((o) => o.f === x.a.f || o.o === x.a.o), x.t);
  }
  for (const band of [1, 3, 5]) {
    for (const t of buildFresh("or_samhengi", band, 200)) {
      assert.equal(t.options.length, 4);
      assert.equal(new Set(t.options).size, 4, t.s.t);
      assert.ok(t.options.includes(t.answer));
    }
  }
});

/* ---------- or_myndun: the five kinds -------------------------------------- */

test("or_myndun: an adverb in -lega for an adjective in -legur, and every noun a verb makes is accepted", () => {
  assert.ok(EX.formation.lega.length > 100);
  for (const y of EX.formation.lega) {
    assert.match(y.from, /legur$/);
    assert.equal(y.to, y.from.slice(0, -2) + "a");
  }
  const kinds = new Set();
  for (const band of [1, 2, 3, 4, 5]) {
    for (const t of buildFresh("or_myndun", band, 300)) {
      kinds.add(t.cell);
      assert.ok(t.answers.length >= 1 && t.answers.every((a) => /^[a-záðéíóúýþæö]+$/.test(a)), t.prompt);
      /* *byrja*: both *byrjun* and *byrjandi* are nouns made from it */
      if (/sögninni \*byrja\*/.test(t.prompt)) assert.ok(t.answers.includes("byrjandi") && t.answers.includes("byrjun"));
      assert.ok(!/Sá sem \*á\* er/.test(t.prompt), t.prompt);
    }
  }
  for (const k of ["neg", "agent", "ing", "lega", "ni"]) assert.ok(kinds.has("orð:myndun-" + k), k);
});
