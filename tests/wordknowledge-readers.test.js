/* Issue #42: every reader of word state goes through Word knowledge — a pure
   move. A seeded simulated pupil's word health, the rescue-drill offers and
   the vocab score must be exactly what they were before the move.

   Two weak pupils answer through the real grader
   (tools/sim/sim.mjs with `respond`, core/answer.js `judge` + `settle`), with
   the builders, Math.random and the clock all fixed, so a run is the same on
   every machine and every day. Then the drill controller (control/drill.js)
   looks for words to offer after each answer, as the app does, and rescues
   the first two words it offers through `drillAnswered`, so the rescue ledger,
   the rescued and kept-afloat counts and the drill-day count are read too.

   PINNED was taken on integration/dld 8e3d343, before the move, and is the
   same after it. A later change that moves question choice or the word
   records ON PURPOSE (#10, #12 …) changes it: print the new value with
   `PIN=1 node --test tests/wordknowledge-readers.test.js` and say in its PR
   why it moved. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

/* The clock first: sim.mjs builds its fake clock on top of whatever `Date`
   is when it is imported, so fixing it here fixes every day key. */
const FIXED = Date.UTC(2026, 8, 1, 10, 0, 0);
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...a) { if (a.length) super(...a); else super(FIXED); }
  static now() { return FIXED; }
};

const { seeded } = await import("../src/js/core/duel.js");
Math.random = seeded(4242);
const { simulate } = await import("../tools/sim/sim.mjs");
const { rightResponse, wrongResponse } = await import("./helpers.js");
const { DATA } = await import("../data/data_bundle.js");
const { buildLexicon } = await import("../src/js/core/lexicon.js");
const { drillControl } = await import("../src/js/control/drill.js");
const { startDrill, weakWords, vocabScore, rescueCount } =
  await import("../src/js/core/wordhealth.js");
const { collectionSummary, collectionByClass } = await import("../src/js/core/collection.js");
const { scorecard } = await import("../src/js/core/leaderboard.js");

const lex = buildLexicon(DATA);

const respond = (t, knows) => {
  if (knows) return rightResponse(t);
  if (t.type === "syntax") return { picked: t.s.tok.findIndex((x) => x.r !== t.askRole) };
  return wrongResponse(t);
};

/** One pupil: the simulation, then the offers and two rescues. */
function pupil(ability, seed) {
  const { S, log } = simulate({ respond, allSkills: true, size: 10, days: 12, perDay: 2,
    ability, seed, builderRng: seeded(700 + seed) });
  const app = Object.assign(drillControl(), { S, lex, run: null, duelRun: null, liveRun: null });
  const offers = [];
  for (const q of log) {
    app.cur = { word: q.word };
    app.considerOffer();
    if (app.drillOffer) { offers.push(app.drillOffer.key); app.drillOffer = null; }
    if (app.drillOffered.size >= 3) app.drillOffered = new Set();
  }
  /* Rescue the first two words offered: a coin, so a drill may pass or only be endured. */
  const coin = seeded(seed);
  const rescues = [];
  for (const key of [...new Set(offers)].slice(0, 2)) {
    const [lemma, cls] = key.split("|");
    /* As the controller's `startDrill` begins one (it also opens the view
       and asks the first question, which this test does not need). */
    app.drill = { ...startDrill(key, rec(S, key)), entry: lex.lookup(lemma, cls), turn: 0 };
    app.cur = { drill: true, word: key };
    let done = null;
    while (!done) done = app.drillAnswered(coin() < 0.5);
    const { lemma: _, ...kept } = done;
    rescues.push(kept);
  }
  return { S, offers, rescues };
}

/* The word's record as the drill controller hands it to `startDrill`: through
   Word knowledge once it offers `wordRecord` (after #42), straight from the
   saved state before (how PINNED was taken on the base commit). */
const wk = await import("../src/js/core/wordknowledge.js");
const rec = wk.wordRecord || ((S, key) => S["wor" + "ds"][key]);

function digest(S, offers, rescues) {
  const coll = collectionByClass(S, lex).flatMap((g) => g.words.map((w) =>
    [w.key, w.n, w.correct, w.status, w.recent == null ? null : Math.round(w.recent * 1e6), w.rescued]));
  const weak = weakWords(S, lex).map((w) => [w.key, w.seen, Math.round(w.acc * 1e6), w.drillable, w.rescued]);
  const { sets: _s, ...summary } = collectionSummary(S, lex);
  const card = scorecard ? scorecard(S, lex) : null;
  return {
    vocab: vocabScore(S, lex),
    rescueCount: rescueCount(S),
    summary,
    card: card && { vocab: card.vocab, words: card.words },
    offers,
    rescues,
    weak,
    hash: createHash("sha256").update(JSON.stringify({ coll, weak })).digest("hex").slice(0, 16),
  };
}

const runs = [[0.4, 11], [0.55, 12]].map(([a, s]) => pupil(a, s));
const got = runs.map((r) => digest(r.S, r.offers, r.rescues));

/* Taken on integration/dld 8e3d343, before the move. */
const PINNED = [
  {"vocab":{"score":85,"found":83,"weak":2,"shaky":11,"strong":2,"judged":17,"rescued":0,"kept":0,"health":null},"rescueCount":0,"summary":{"weak":2,"strong":2,"judged":17,"health":null,"score":85,"rescued":0,"kept":0,"letters":21,"lettersTotal":30,"total":83,"rare":0,"mastered":1,"byClass":{"kk":18,"kvk":11,"hk":4,"lo":7,"so":24,"fn":1,"pfn":4,"gr":0,"to":4,"rt":0,"ao":2,"fs":4,"st":4,"uh":0,"nhm":0},"coverage":{"kk":0.012622720897615708,"kvk":0.008507347254447023,"hk":0.0040858018386108275,"lo":0.007216494845360825,"so":0.023692003948667325,"ao":0.00273224043715847},"classesTouched":11,"fl":8,"corpus":6564,"everyWord":false},"card":{"vocab":85,"words":83},"offers":["lifa|so","hægur|lo"],"rescues":[{"key":"lifa|so","passed":false,"endured":true,"n":20,"c":9,"perfect":false,"turnaround":false,"oldGhost":false,"firstForWord":false,"xp":30,"rescuesToday":0},{"key":"hægur|lo","passed":false,"endured":true,"n":20,"c":8,"perfect":false,"turnaround":false,"oldGhost":false,"firstForWord":false,"xp":30,"rescuesToday":0}],"weak":[["lifa|so",6,0,true,false],["hægur|lo",6,166667,true,false]],"hash":"46cf29d47d37785e"},
  {"vocab":{"score":81,"found":81,"weak":2,"shaky":6,"strong":1,"judged":20,"rescued":1,"kept":0,"health":60},"rescueCount":1,"summary":{"weak":2,"strong":1,"judged":20,"health":60,"score":81,"rescued":1,"kept":0,"letters":20,"lettersTotal":30,"total":81,"rare":0,"mastered":1,"byClass":{"kk":17,"kvk":10,"hk":7,"lo":14,"so":21,"fn":3,"pfn":4,"gr":0,"to":1,"rt":0,"ao":1,"fs":3,"st":0,"uh":0,"nhm":0},"coverage":{"kk":0.011921458625525946,"kvk":0.007733952049497293,"hk":0.007150153217568948,"lo":0.01443298969072165,"so":0.02073050345508391,"ao":0.001366120218579235},"classesTouched":10,"fl":7,"corpus":6564,"everyWord":false},"card":{"vocab":81,"words":81},"offers":["sáttur|lo","spila|so"],"rescues":[{"key":"sáttur|lo","passed":false,"endured":true,"n":20,"c":7,"perfect":false,"turnaround":false,"oldGhost":false,"firstForWord":false,"xp":30,"rescuesToday":0},{"key":"spila|so","passed":true,"endured":false,"n":10,"c":9,"perfect":false,"turnaround":false,"oldGhost":true,"firstForWord":true,"xp":95,"rescuesToday":1}],"weak":[["sáttur|lo",18,0,true,false],["spila|so",18,0,true,true]],"hash":"b0aa6017d418198e"},
];

test("a seeded pupil's word health, drill offers and vocab score are as before the move (#42)", () => {
  if (process.env.PIN) console.log(JSON.stringify(got));
  assert.deepEqual(got, PINNED);
});

test("the seeded pupils meet weak words, drills and rescues, so the pin reads every path", () => {
  for (const g of got) {
    assert.ok(g.vocab.found > 50, `words found: ${g.vocab.found}`);
    assert.ok(g.vocab.weak > 0, "no weak word");
    assert.ok(g.offers.length > 0, "no drill was offered");
    assert.ok(g.rescues.length > 0, "no rescue drill was run");
  }
  assert.ok(got.some((g) => g.rescueCount > 0), "no word rescued");
});
