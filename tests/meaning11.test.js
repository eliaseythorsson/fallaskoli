/* The graded meaning question (issue #11, or_merking): which of three
   sentences uses the word with the right meaning.

   "Hvað þýðir orðið?" was only ever the free-text question that nobody can
   mark (`meaning`: weight 0 inside a session, `counts: false`). This is the
   one the app can judge, so it counts and it has a weight.

   What is held here:
   - the content (content/ordafordi/merking.tsv → EX.meaningChoice): every
     sentence holds a form of its word, a word has one line, and a line
     marked "samhengi" is made of nothing but word-in-context sentences in
     which a person already put the word (as the answer, or as a noun that
     cannot stand there);
   - the question: three sentences, one right, the answer under the word;
   - it is judged and it counts (the free-text one does neither);
   - þyngd chooses the words: everyday nouns first, LÍNO-2 words from 3;
   - how often it comes: in a session, where `meaning` never does. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseTsv } from "../tools/review.mjs";
import { EX } from "../data/exercises.js";
import { freshView, poolLex } from "./pools.js";
import { typeById, nextTask, applyEffects } from "../src/js/tasks/index.js";
import { catalogueEntry, CATALOGUE_IDS, isRecall, graderOf } from "../src/js/core/catalogue.js";
import { judge } from "../src/js/core/answer.js";
import { wordKey } from "../src/js/core/state.js";
import { seeded } from "../src/js/core/duel.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const lex = poolLex();
const spec = typeById("or_merking");
const ITEMS = EX.meaningChoice;
const ROWS = parseTsv(readFileSync(root + "content/ordafordi/merking.tsv", "utf8")).rows;
const words = (t) => t.toLowerCase().match(/[a-záéíóúýþæöð]+/g) || [];

function builds(band, n = 300, seed0 = 41000) {
  const out = [];
  for (let s = 0; s < n; s++) {
    const b = spec.build(lex, freshView(band), seeded(seed0 + s));
    if (b) out.push(b.task);
  }
  return out;
}

/* ---------- the declaration ---------------------------------------------- */

test("or_merking is declared after every older type: recognition, graded by the app, with a weight in a session", () => {
  const e = catalogueEntry("or_merking");
  assert.ok(e, "not declared");
  assert.equal(e.skill, "ordaford");
  assert.equal(e.renderer, "choice");
  assert.equal(isRecall("or_merking"), false, "the word is shown: recognition (CONTEXT.md)");
  assert.equal(graderOf("or_merking"), "app");
  assert.equal(e.weightInRun, undefined, "it has its weight inside a session too");
  /* after everything that was there before it (the duel order) */
  assert.ok(CATALOGUE_IDS.indexOf("or_merking") > CATALOGUE_IDS.indexOf("or_utundan"));
  assert.ok(CATALOGUE_IDS.indexOf("or_merking") > CATALOGUE_IDS.indexOf("meaning"));
  /* the free-text one is what it was */
  const old = catalogueEntry("meaning");
  assert.equal(old.weightInRun, 0);
  /* several times the weight of each other graded Orðaforði type */
  for (const id of ["or_heiti", "or_samhengi", "or_myndun", "or_utundan"])
    assert.ok(e.weight >= 2.5 * catalogueEntry(id).weight, id);
});

/* ---------- the content -------------------------------------------------- */

test("merking.tsv: every line reached the build, one line per word, and the word is the lexicon's", () => {
  assert.equal(ITEMS.length, ROWS.length);
  assert.ok(ITEMS.length >= 60, `${ITEMS.length} items`);
  const seen = new Set();
  ITEMS.forEach((x, k) => {
    const r = ROWS[k].cells;
    assert.equal(x.o, r["orð"]); assert.equal(x.c, r["orðflokkur"]); assert.equal(x.r, r.setning);
    assert.ok(lex.lookup(x.o, x.c), `${x.o} (${x.c}) is not in the lexicon`);
    const key = wordKey(x.o, x.c);
    assert.ok(!seen.has(key), `${x.o} has two lines`);
    seen.add(key);
    assert.ok(Number.isInteger(x.lvl) && x.lvl >= 1 && x.lvl <= 5, `${x.o}: level ${x.lvl}`);
  });
});

test("merking.tsv: one right sentence, two or three wrong ones, all different, each with a form of the word", () => {
  for (const x of ITEMS) {
    assert.ok(x.w.length >= 2 && x.w.length <= 3, `${x.o}: ${x.w.length} wrong sentences`);
    const all = [x.r, ...x.w];
    assert.equal(new Set(all).size, all.length, `${x.o}: a sentence twice`);
    const forms = new Set([x.o, ...Object.values(lex.lookup(x.o, x.c).forms || {}).flat()].map((f) => f.toLowerCase()));
    for (const t of all) {
      assert.ok(words(t).some((w) => forms.has(w)), `${x.o}: no form of it in "${t}"`);
      assert.match(t, /^[A-ZÁÉÍÓÚÝÞÆÖÐ].*\.$/, `${x.o}: "${t}" is not a sentence`);
    }
  }
});

test("merking.tsv: a wrong sentence is never another word's right one, and no sentence serves two words", () => {
  const right = new Set(ITEMS.map((x) => x.r));
  for (const x of ITEMS) for (const t of x.w) assert.ok(!right.has(t), `"${t}" is right for one word and wrong for ${x.o}`);
});

test("merking.tsv: a line marked samhengi holds only word-in-context sentences a person put the word in", () => {
  const fill = (t, f) => (t.startsWith("___") ? f[0].toUpperCase() + f.slice(1) + t.slice(3) : t.replace("___", f));
  const asAnswer = new Set(), asWrong = new Set();
  for (const it of EX.wordInContext) {
    if (!it.a) continue;
    asAnswer.add(`${it.a.o}|${it.a.c}|${fill(it.t, it.a.f)}`);
    for (const w of it.w) asWrong.add(`${w.o}|${w.c}|${fill(it.t, w.f)}`);
  }
  let n = 0;
  ITEMS.forEach((x, k) => {
    const origin = ROWS[k].cells.uppruni;
    assert.ok(["samhengi", "ný"].includes(origin), `${x.o}: uppruni ${origin}`);
    if (origin !== "samhengi") return;
    n++;
    assert.ok(asAnswer.has(`${x.o}|${x.c}|${x.r}`), `${x.o}: "${x.r}" is not one of its word-in-context sentences`);
    for (const t of x.w) assert.ok(asWrong.has(`${x.o}|${x.c}|${t}`), `${x.o}: "${t}" does not list it as impossible`);
  });
  assert.ok(n >= 15, `${n} lines from word in context`);
});

test("merking.tsv: a word with several senses in the dictionary names the one its sentence means", () => {
  const ino = JSON.parse(readFileSync(root + "data/ino.json", "utf8"));
  const INO = ino.entries || ino;
  const LEX = new Map(JSON.parse(readFileSync(root + "data/lexicon.json", "utf8")).w.map((w) => [w.o + "|" + w.c, w]));
  ITEMS.forEach((x, k) => {
    const w = LEX.get(x.o + "|" + x.c), e = w && INO[String(w.i)];
    const senses = !e || !e.def || (e.cls && e.cls !== w.c) ? [] : (e.senses || [{ def: e.def }]).map((s) => s.def).filter(Boolean);
    const named = ROWS[k].cells.merking || "";
    if (senses.length > 1) assert.ok(named, `${x.o} has ${senses.length} senses and names none`);
    if (named === "-") assert.equal(x.d, null, x.o);
    else if (/^\d+$/.test(named)) assert.equal(x.d, senses[+named - 1], x.o);
  });
});

/* ---------- the question ------------------------------------------------- */

test("or_merking: three sentences, one of them the item's right one, the other two its wrong ones", () => {
  const byWord = new Map(ITEMS.map((x) => [wordKey(x.o, x.c), x]));
  let n = 0;
  for (const band of [1, 2, 3, 4, 5, 6, 7]) for (const t of builds(band, 120)) {
    n++;
    const x = byWord.get(t.word);
    assert.ok(x, `no item for ${t.word}`);
    assert.equal(t.type, "choice");
    assert.equal(t.skill, "ordaford");
    assert.equal(t.options.length, 3);
    assert.equal(new Set(t.options).size, 3);
    assert.equal(t.answer, x.r);
    assert.equal(t.options.filter((o) => o === x.r).length, 1);
    for (const o of t.options) if (o !== x.r) {
      assert.ok(x.w.includes(o), `${x.o}: "${o}" is not one of its wrong sentences`);
      assert.ok(t.whyNot[o], "a wrong sentence without its reason");
    }
    assert.equal(t.question, `Í hvaða setningu er orðið *${x.o}* notað rétt?`);
    assert.equal(t.cell, "orð:merking");
    /* the definition, when there is one, is the item's — not the word's first sense */
    if (x.d) assert.ok(t.why.startsWith(`*${x.o}*: ${x.d}. `), t.why);
    else assert.doesNotMatch(t.why, /^\*/);
    assert.notEqual(t.counts, false, "it counts");
  }
  assert.equal(n, 7 * 120, "the builder never comes back empty");
});

test("or_merking: the right sentence is not always in the same place", () => {
  const at = [0, 0, 0];
  for (const t of builds(3, 600)) at[t.options.indexOf(t.answer)]++;
  for (const k of at) assert.ok(k > 140 && k < 260, at.join(" / "));
});

test("or_merking: it is judged — right is right, a wrong sentence is wrong — and both are written as an answer that counts", () => {
  const [t] = builds(4, 1);
  const wrongPick = t.options.find((o) => o !== t.answer);
  const good = judge(t, { picked: t.answer }), bad = judge(t, { picked: wrongPick });
  assert.equal(good.ok, true);
  assert.equal(bad.ok, false);
  assert.ok(good.xp > 0);
  for (const j of [good, bad]) {
    const rec = j.effects.find((e) => e.word === t.word);
    assert.ok(rec, "no record of the answer under the word");
    assert.notEqual(rec.counts, false, "the answer counts as right or wrong");
    assert.equal(rec.skill, "ordaford");
  }
  assert.ok(judge(t, {}).pending, "nothing picked: not judged yet");
});

/* ---------- þyngd -------------------------------------------------------- */

test("or_merking: everyday nouns at þyngd 1 and 2, the academic words from 3, the abstract ones and the verbs from 4", () => {
  const lvl = new Map(ITEMS.map((x) => [wordKey(x.o, x.c), x.lvl]));
  const levelsAt = (band) => new Set(builds(band, 300).map((t) => lvl.get(t.word)));
  assert.deepEqual([...levelsAt(1)], [1]);
  assert.deepEqual([...levelsAt(2)], [1]);
  assert.deepEqual([...levelsAt(3)], [3]);
  assert.deepEqual([...levelsAt(4)].sort(), [3, 4]);
  assert.deepEqual([...levelsAt(7)].sort(), [3, 4]);
  /* and every item is reachable at some þyngd */
  const reached = new Set([1, 3, 4].flatMap((b) => builds(b, 1500).map((t) => t.word)));
  for (const x of ITEMS) assert.ok(reached.has(wordKey(x.o, x.c)), `${x.o} is never asked`);
});

test("or_merking: every word at þyngd 3 and above is on LÍNO-2", () => {
  for (const x of ITEMS) if (x.lvl >= 3) assert.ok(lex.lookup(x.o, x.c).lino, `${x.o} is not a LÍNO-2 word`);
});

/* ---------- the spacing rule (#10) --------------------------------------- */

test("or_merking: never the same word twice in a row", () => {
  const base = freshView(1);
  const host = { S: base.S, sess: base.sess, forcedNoun: null };
  const rng = seeded(77);
  let last = null;
  for (let k = 0; k < 400; k++) {
    const b = spec.build(lex, freshView(1, { S: host.S, sess: host.sess, typeId: "or_merking" }), rng);
    assert.ok(b);
    assert.notEqual(b.task.word, last, `question ${k}`);
    last = b.task.word;
    /* what showing it leaves behind (tasks/effects.js `last`) */
    host.sess.lastAsked = { type: "or_merking", words: [b.task.word] };
  }
  /* and without the rule the same word does come twice in 400 draws of 19 */
  let twice = 0; last = null;
  for (const t of builds(1, 400, 5000)) { if (t.word === last) twice++; last = t.word; }
  assert.ok(twice > 0, "the control never repeats: the test above proves nothing");
});

/* ---------- how often ---------------------------------------------------- */

test("in a session the graded meaning question comes several times as often as each other Orðaforði type; the free-text one never", () => {
  const counts = {};
  let total = 0;
  for (let seed = 0; seed < 150; seed++) {
    const base = freshView([1, 3, 4][seed % 3]);
    const host = { S: base.S, sess: base.sess, forcedNoun: null };
    const rng = seeded(9100 + seed);
    const mix = {};
    for (let i = 0; i < 10; i++) {
      const view = freshView(1, { S: host.S, sess: host.sess, inRun: true, mix: { n: 10, counts: { ...mix } } });
      const b = nextTask(lex, view, rng);
      if (!b) break;
      applyEffects(host, b.effects);
      const id = b.task.typeId;
      counts[id] = (counts[id] || 0) + 1; mix[id] = (mix[id] || 0) + 1; total++;
    }
  }
  assert.equal(counts.meaning || 0, 0, "the free-text question has no turn of its own in a session");
  const mine = counts.or_merking || 0;
  const others = ["or_heiti", "or_samhengi", "or_myndun", "or_utundan"].map((id) => counts[id] || 0);
  const mean = others.reduce((a, b) => a + b, 0) / others.length;
  assert.ok(mine >= 2 * mean, `or_merking ${mine} of ${total}; the others ${others.join(", ")}`);
  assert.ok(mine / total > 0.015 && mine / total < 0.06, `or_merking is ${(100 * mine / total).toFixed(1)}% of a mixed session`);
});
