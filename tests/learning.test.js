/* The six words in learning and "Orðin mín" (issue #12, core/wordknowledge.js).
 *
 *   1. a pupil always has six words in learning, fewer only if the list runs out;
 *   2. new words are chosen by LÍNO rank within the pupil's þyngd;
 *   3. a learned word leaves and the next filling puts a new one in its place;
 *   4. the set is kept in progress: blank, migrate, merge, the server's check;
 *   5. each status comes with a reason (#43);
 *   6. nothing the pupil sees names DLD or a support mode.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, migrate } from "../src/js/core/state.js";
import { mergeStates } from "../src/js/core/merge.js";
import { cleanState } from "../server/guard.mjs";
import { hardReach } from "../src/js/core/difficulty.js";
import {
  LEARNING_SIZE, LEARNING_CLASSES, fillLearning, learningCandidates, nextToLearn,
  enterLearning, leaveLearning, wordsInLearning, wordsLearned, isInLearning, learningStatus,
  sanitiseLearning, mergeLearning, learningSlice,
} from "../src/js/core/wordknowledge.js";

const lex = buildLexicon(DATA);
const DAY1 = "2026-11-24", DAY2 = "2026-11-25";
const key = (w) => `${w.o}|${w.c}`;
const linoOf = (k) => { const [o, c] = k.split("|"); return lex.lookup(o, c).lino; };

test("a new pupil gets six LÍNO-2 words, in LÍNO rank order", () => {
  const S = blankState();
  const { entered } = fillLearning(S, lex, { level: 3, today: DAY1 });
  assert.equal(entered.length, LEARNING_SIZE);
  assert.deepEqual(wordsInLearning(S), [...entered].sort());
  const ranks = entered.map(linoOf);
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), "commonest first");
  /* They are the first six candidates: nothing commoner was skipped. */
  const all = lex.all.filter((w) => typeof w.lino === "number" && LEARNING_CLASSES.has(w.c)
    && (typeof w.irr !== "number" || w.irr <= hardReach(3))).sort((a, b) => a.lino - b.lino);
  assert.deepEqual(entered, all.slice(0, 6).map(key));
});

test("filling again changes nothing while the six are full", () => {
  const S = blankState();
  fillLearning(S, lex, { level: 3, today: DAY1 });
  const before = JSON.stringify(S.learning);
  assert.deepEqual(fillLearning(S, lex, { level: 3, today: DAY2 }), { entered: [], putBack: [] });
  assert.equal(JSON.stringify(S.learning), before);
});

test("the pupil's þyngd decides which words are within reach", () => {
  const low = learningCandidates(blankState(), lex, 1);
  const high = learningCandidates(blankState(), lex, 5);
  assert.ok(low.every((w) => typeof w.irr !== "number" || w.irr <= 1));
  assert.ok(high.length > low.length, "a higher þyngd reaches more words");
  assert.ok(high.some((w) => w.irr === 5), "the most irregular words come at þyngd 5");
  assert.ok([...low, ...high].every((w) => LEARNING_CLASSES.has(w.c) && w.c !== "st"));
});

test("a learned word leaves and a new word takes its place", () => {
  const S = blankState();
  fillLearning(S, lex, { level: 3, today: DAY1 });
  const first = wordsInLearning(S)[0];
  const next = nextToLearn(S, lex, 3);
  assert.ok(leaveLearning(S, first, DAY2));
  assert.equal(isInLearning(S, first), false);
  assert.deepEqual(wordsLearned(S), [first]);
  assert.equal(wordsInLearning(S).length, 5);
  assert.deepEqual(fillLearning(S, lex, { level: 3, today: DAY2 }).entered, [next]);
  assert.equal(wordsInLearning(S).length, 6);
  /* A learned word is not chosen again by the filling. */
  assert.ok(!learningCandidates(S, lex, 3).some((w) => key(w) === first));
  assert.equal(leaveLearning(S, first, DAY2), false, "only a word in learning can leave");
});

test("fewer than six only when the list runs out", () => {
  const tiny = { all: lex.all.filter((w) => w.lino && w.lino <= 30 && LEARNING_CLASSES.has(w.c)).slice(0, 4) };
  const S = blankState();
  assert.equal(fillLearning(S, tiny, { level: 7, today: DAY1 }).entered.length, 4);
  assert.equal(nextToLearn(S, tiny, 7), null);
});

test("#15's seam: a word that is not ready stops the filling", () => {
  const S = blankState();
  const order = learningCandidates(S, lex, 3).map(key);
  const r = fillLearning(S, lex, { level: 3, today: DAY1, ready: (k) => k !== order[2] });
  assert.deepEqual(r.entered, order.slice(0, 2));
  assert.equal(nextToLearn(S, lex, 3), order[2]);
});

test("more than six after a merge: the newest, rarer words are put back and may come again", () => {
  const S = blankState();
  const order = learningCandidates(S, lex, 3).map(key);
  order.slice(0, 5).forEach((k) => enterLearning(S, k, DAY1));
  enterLearning(S, order[7], DAY2);
  enterLearning(S, order[6], DAY2);
  const { putBack } = fillLearning(S, lex, { level: 3, today: DAY2 });
  assert.deepEqual(putBack, [order[7]]);
  assert.equal(wordsInLearning(S).length, 6);
  assert.equal(learningStatus(S, order[7]).status, "put-back");
  assert.ok(learningCandidates(S, lex, 3).some((w) => key(w) === order[7]), "a word put back is a candidate again");
});

test("each status has its reason in Icelandic", () => {
  const S = blankState();
  enterLearning(S, "hluti|kk", DAY1);
  assert.deepEqual(learningStatus(S, "hluti|kk"),
    { status: "learning", why: "eitt af 6 orðum sem verið er að læra, frá 24.11.2026" });
  leaveLearning(S, "hluti|kk", DAY2);
  assert.deepEqual(learningStatus(S, "hluti|kk"), { status: "learned", why: "lært 25.11.2026" });
  assert.equal(learningStatus(S, "hestur|kk"), null);
});

test("the set is kept: blank, migrate and the server's check", () => {
  assert.deepEqual(blankState().learning, {});
  const S = blankState();
  fillLearning(S, lex, { level: 3, today: DAY1 });
  const back = migrate(JSON.parse(JSON.stringify(S)));
  assert.deepEqual(back.learning, S.learning);
  /* An older save has no set: it starts empty. */
  const old = JSON.parse(JSON.stringify(S)); delete old.learning;
  assert.deepEqual(migrate(old).learning, {});
  /* Rubbish is dropped, never thrown. */
  assert.deepEqual(sanitiseLearning({ "a|kk": { s: "x", d: DAY1, n: 1 }, "": { s: "l", d: DAY1, n: 1 },
    "b|kk": { s: "l", d: "í gær", n: 1 }, "c|kk": { s: "l", d: DAY1, n: -4 }, "d|kk": [] }),
  { "c|kk": { s: "l", d: DAY1, n: 1 } });
  assert.deepEqual(sanitiseLearning("nonsense"), {});
  /* The server: no day after tomorrow. */
  const cleaned = learningSlice.clean({ "a|kk": { s: "l", d: "2026-11-26", n: 1 }, "b|kk": { s: "l", d: "2099-01-01", n: 1 } },
    { today: new Date("2026-11-25T12:00:00Z"), limit: "2026-11-26" });
  assert.deepEqual(Object.keys(cleaned), ["a|kk"]);
  const viaGuard = cleanState(JSON.parse(JSON.stringify(S)));
  assert.deepEqual(viaGuard.learning, S.learning);
});

test("two devices: the record with more changes wins, a learned word stays learned", () => {
  const base = { "a|kk": { s: "l", d: DAY1, n: 1 } };
  const local = { "a|kk": { s: "k", d: DAY2, n: 2 }, "b|kk": { s: "l", d: DAY2, n: 1 } };
  const remote = { "a|kk": { s: "l", d: DAY1, n: 1 }, "c|kk": { s: "l", d: DAY2, n: 1 } };
  const m = mergeLearning(base, local, remote);
  assert.deepEqual(m["a|kk"], { s: "k", d: DAY2, n: 2 });
  assert.ok(m["b|kk"] && m["c|kk"]);
  assert.deepEqual(mergeLearning(base, remote, local), m, "the same either way");
  /* Same number of changes on both sides: learned beats in learning beats put back. */
  assert.equal(mergeLearning(undefined, { x: { s: "o", d: DAY2, n: 2 } }, { x: { s: "k", d: DAY1, n: 2 } }).x.s, "k");
  /* Through the whole state merge. */
  const L = blankState(), R = blankState();
  L.learning = local; R.learning = remote;
  const B = blankState(); B.learning = base;
  assert.deepEqual(mergeStates(B, L, R).learning, m);
});

test("nothing the pupil sees names DLD or a support mode", () => {
  const ui = fs.readFileSync(new URL("../src/js/ui/panels.js", import.meta.url), "utf8")
    + fs.readFileSync(new URL("../src/body.html", import.meta.url), "utf8");
  assert.match(ui, /Orðin mín/);
  for (const bad of [/\bDLD\b/, /málþroska/i, /stuðnings?(ham|stilling)/i, /sérkennsl/i])
    assert.doesNotMatch(ui, bad);
  const S = blankState();
  fillLearning(S, lex, { level: 3, today: DAY1 });
  for (const k of wordsInLearning(S)) assert.doesNotMatch(learningStatus(S, k).why, /DLD|málþroska/i);
});
