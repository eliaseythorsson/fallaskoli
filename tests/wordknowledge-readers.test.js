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

   The pupils practise a FIXED set of question types (TYPES below; every
   other type is switched off in their own choices, as a pupil can), so a
   new question type at the end of the catalogue does not move the draws
   and break the pin: #27's `hver_gerdi` did exactly that to the first
   version of this test.

   PINNED was taken on 3ba33d0 (main before #66, the readers still reading
   the saved state themselves) and is the same on #66's move and after it.
   A later change that moves question choice among these types, the word
   records or the words themselves ON PURPOSE (#10, #12, a lexicon change …)
   changes it: print the new value with
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
const { CATALOGUE_IDS } = await import("../src/js/core/catalogue.js");

const lex = buildLexicon(DATA);

const respond = (t, knows) => {
  if (knows) return rightResponse(t);
  if (t.type === "syntax") return { picked: t.s.tok.findIndex((x) => x.r !== t.askRole) };
  return wrongResponse(t);
};

/* The question types the pupils practise: types about one word at a time,
   from five categories. Every other type is off. */
const TYPES = ["fill", "no_val", "no_beyging", "tbl_no", "verbslot", "verb", "so_beyging", "tbl_so",
  "revform", "lo_beyging", "tbl_lo", "govern", "meaning", "or_heiti", "or_samhengi"];
const onlyTypes = (S) => {
  S.policy.types = Object.fromEntries(CATALOGUE_IDS.filter((id) => !TYPES.includes(id)).map((id) => [id, false]));
};

/** One pupil: the simulation, then the offers and two rescues. */
function pupil(ability, seed) {
  const { S, log } = simulate({ respond, allSkills: true, size: 10, days: 12, perDay: 2,
    ability, seed, builderRng: seeded(700 + seed), setup: onlyTypes });
  /* The fixed set really is all that was asked. */
  for (const q of log) assert.ok(TYPES.includes(q.type), `a question of type ${q.type} was asked`);
  const app = Object.assign(drillControl(), { S, lex, run: null, duelRun: null, liveRun: null });
  const offers = [];
  for (const q of log) {
    app.cur = { word: q.word };
    app.considerOffer();
    if (app.drillOffer) { offers.push(app.drillOffer.key); app.drillOffer = null; }
    if (app.drillOffered.size >= 3) app.drillOffered = new Set();
  }
  /* Rescue the first two words offered: a coin, so a drill may pass or only be endured. */
  /* seed + 1 since #10: with the questions #10 moves, the coin seeded by `seed`
     passed no rescue, and the pin must read that path too. */
  const coin = seeded(seed + 1);
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

/* Taken on 3ba33d0 (before #66) and identical on d016ffe (#66 without #27)
   and on 5e3f967 (both). Re-pinned by #10 (the spacing rule), which moves
   question choice on purpose: the vocabulary types lost their wait of days,
   and no type asks the word of the question before it again; so the pupils
   meet other words, and other words go weak (the PR says how much); and
   the rescue coin moved by one (see `pupil`). */
const PINNED = [
  {"vocab":{"score":130,"found":128,"weak":3,"shaky":15,"strong":2,"judged":24,"rescued":1,"kept":0,"health":25},"rescueCount":1,"summary":{"weak":3,"strong":2,"judged":24,"health":25,"score":130,"rescued":1,"kept":0,"letters":21,"lettersTotal":30,"total":128,"rare":1,"mastered":2,"byClass":{"kk":28,"kvk":16,"hk":18,"lo":17,"so":47,"fn":0,"pfn":0,"gr":0,"to":0,"rt":0,"ao":0,"fs":2,"st":0,"uh":0,"nhm":0},"coverage":{"kk":0.019635343618513323,"kvk":0.01237432327919567,"hk":0.018386108273748723,"lo":0.01752577319587629,"so":0.04639684106614018,"ao":0},"classesTouched":6,"fl":4,"corpus":6564,"everyWord":false},"card":{"vocab":130,"words":128},"offers":["skulu|so","athuga|so","skila|so","skulu|so","athuga|so","skila|so","skulu|so","athuga|so","skila|so","skulu|so","athuga|so","skila|so","skila|so","athuga|so","skulu|so","skila|so","athuga|so","skulu|so","skila|so","athuga|so","skulu|so","skila|so","athuga|so","skulu|so"],"rescues":[{"key":"skulu|so","passed":false,"endured":true,"n":20,"c":7,"perfect":false,"turnaround":false,"oldGhost":false,"firstForWord":false,"xp":30,"rescuesToday":0},{"key":"athuga|so","passed":true,"endured":false,"n":10,"c":9,"perfect":false,"turnaround":false,"oldGhost":false,"firstForWord":true,"xp":95,"rescuesToday":1}],"weak":[["athuga|so",7,0,true,true],["skila|so",6,166667,true,false],["skulu|so",6,166667,true,false]],"hash":"9c007d0b293dabff"},
  {"vocab":{"score":135,"found":122,"weak":1,"shaky":17,"strong":6,"judged":36,"rescued":1,"kept":0,"health":50},"rescueCount":1,"summary":{"weak":1,"strong":6,"judged":36,"health":50,"score":135,"rescued":1,"kept":0,"letters":20,"lettersTotal":30,"total":122,"rare":2,"mastered":6,"byClass":{"kk":26,"kvk":22,"hk":15,"lo":17,"so":39,"fn":0,"pfn":0,"gr":0,"to":0,"rt":0,"ao":0,"fs":3,"st":0,"uh":0,"nhm":0},"coverage":{"kk":0.0182328190743338,"kvk":0.017014694508894045,"hk":0.015321756894790603,"lo":0.01752577319587629,"so":0.0384995064165844,"ao":0},"classesTouched":6,"fl":4,"corpus":6564,"everyWord":false},"card":{"vocab":135,"words":122},"offers":["kjánalegur|lo"],"rescues":[{"key":"kjánalegur|lo","passed":true,"endured":false,"n":10,"c":7,"perfect":false,"turnaround":false,"oldGhost":true,"firstForWord":true,"xp":85,"rescuesToday":1}],"weak":[["kjánalegur|lo",15,0,true,true]],"hash":"48d9f595b45999c8"},
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
