/* Word in context (or_samhengi): the definition printed after the answer is
   the sense the sentence means (v6.13 review, M1).

   Until then the `why` printed the answer word's FIRST sense in Íslensk
   nútímamálsorðabók, and for a homonym that is another word: *Ég hlustaði á
   lagið í útvarpinu* → "*lag*: partur af stafla …", *póstur* who brings the
   letters → "flutningskerfi póstþjónustunnar", *diskur* in the dishwasher →
   "geisladiskur". Now every item whose answer has more than one sense names
   the one it means (content/ordafordi/samhengi.tsv `merking`; samhengi-rammar.tsv
   `lag=2`), or "-" for none; pipeline/build_exercises.py refuses an item without, and
   the item carries the chosen definition as `d`.

   These tests hold the same rule from the files, so that a new item with a
   homonym and no sense fails here too, not only in the full build. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseTsv } from "../tools/review.mjs";
import { EX } from "../data/exercises.js";
import { freshView, poolLex } from "./pools.js";
import { typeById } from "../src/js/tasks/index.js";
import { seeded } from "../src/js/core/duel.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => readFileSync(root + rel, "utf8");
const ino = JSON.parse(read("data/ino.json"));
const INO = ino.entries || ino;
const LEX = new Map(JSON.parse(read("data/lexicon.json")).w.map((w) => [w.o + "|" + w.c, w]));
const GENDERS = ["kk", "kvk", "hk"];

/** ÍNO's senses of the noun `lemma` ("orð" or "orð:kyn"), as pipeline/build_exercises.py reads them. */
function senses(lemma) {
  const [o, g] = lemma.split(":");
  const w = (g ? [g] : GENDERS).map((c) => LEX.get(o + "|" + c)).find(Boolean);
  const e = w && INO[String(w.i)];
  if (!e || !e.def || (e.cls && e.cls !== w.c)) return [];
  return (e.senses || [{ def: e.def }]).map((s) => s.def).filter(Boolean);
}

/** Every answer of both files: { where, lemma, sense } with sense "" when none is named. */
function answers() {
  const out = [];
  for (const r of parseTsv(read("content/ordafordi/samhengi.tsv")).rows)
    out.push({ where: `samhengi.tsv:${r.line}`, t: r.cells.setning, lemma: r.cells.svar, sense: r.cells.merking || "" });
  for (const r of parseTsv(read("content/ordafordi/samhengi-rammar.tsv")).rows)
    for (const fit of r.cells.passar.split(",").map((x) => x.trim())) {
      const [lemma, sense = ""] = fit.split("=");
      out.push({ where: `samhengi-rammar.tsv:${r.line}`, t: r.cells.setning, lemma, sense });
    }
  return out;
}

test("or_samhengi: every answer with several ÍNO senses names the one the sentence means", () => {
  const all = answers();
  assert.ok(all.length >= 200, all.length);
  const many = all.filter((a) => senses(a.lemma).length > 1);
  /* the list a native reader checks; at v6.13 some seventy answers */
  assert.ok(many.length >= 60, many.length);
  const missing = many.filter((a) => !a.sense).map((a) => `${a.where} ${a.lemma}: ${senses(a.lemma).length} senses`);
  assert.deepEqual(missing, []);
  for (const a of all) {
    if (!a.sense || a.sense === "-") continue;
    assert.match(a.sense, /^\d+$/, `${a.where} ${a.lemma}=${a.sense}`);
    assert.ok(+a.sense >= 1 && +a.sense <= senses(a.lemma).length, `${a.where} ${a.lemma}=${a.sense}`);
  }
});

test("or_samhengi: each item carries the definition of its own sense, or none", () => {
  const byKey = new Map(answers().map((a) => [a.t + "|" + a.lemma.split(":")[0], a]));
  for (const x of EX.wordInContext) {
    assert.ok("d" in x, x.t);
    const a = byKey.get(x.t + "|" + x.a.o);
    assert.ok(a, `${x.t} ${x.a.o}: not found in the files`);
    if (a.sense === "-") { assert.equal(x.d, null, a.where); continue; }
    const ss = senses(a.lemma);
    if (a.sense) assert.equal(x.d, ss[+a.sense - 1], a.where);
    else if (ss.length) assert.equal(x.d, ss[0], a.where);
  }
});

test("or_samhengi: the senses the review found wrong (M1) and the others that were", () => {
  const d = (t, o) => {
    const x = EX.wordInContext.find((y) => y.t.includes(t) && y.a.o === o);
    assert.ok(x, `${t} ${o}`);
    return x.d;
  };
  assert.match(d("í útvarpinu", "lag"), /tónstef/);
  assert.match(d("í útvarpinu", "þáttur"), /dagskrárliður/);
  assert.match(d("í sjónvarpinu", "þáttur"), /dagskrárliður/);
  assert.match(d("í sjónvarpinu", "leikur"), /kappleikur/);
  assert.match(d("í sjónvarpinu", "mynd"), /kvikmynd/);
  assert.match(d("kom með bréfin", "póstur"), /ber út póst/);
  assert.match(d("úr bolla", "kaffi"), /^drykkur/);
  assert.match(d("til þerris", "þvottur"), /fatnaður/);
  assert.match(d("í þvottavélinni", "bolur"), /flík/);
  assert.match(d("til að kaupa mjólk", "verslun"), /vörur eru seldar/);
  assert.match(d("úr glasi", "gos"), /gosdrykkur/);
  /* no ÍNO sense fits: a postcard, a bicycle, a dinner plate, a shop, motor oil */
  assert.equal(d("til ömmu", "kort"), null);
  assert.equal(d("í viðgerð", "hjól"), null);
  assert.equal(d("í afmælisgjöf", "hjól"), null);
  assert.equal(d("í uppþvottavélinni", "diskur"), null);
  assert.equal(d("til að kaupa mjólk", "búð"), null);
  assert.equal(d("á bensínstöðinni", "olía"), null);
});

test("or_samhengi: the explanation shown is the item's own definition, never another sense", () => {
  const lex = poolLex();
  const spec = typeById("or_samhengi");
  let seen = 0;
  for (const band of [1, 3, 5]) for (let s = 0; s < 150; s++) {
    const b = spec.build(lex, freshView(band), seeded(7000 + s));
    if (!b) continue;
    const t = b.task;
    const x = EX.wordInContext.find((y) => y.a.f.toLowerCase() === t.answer.toLowerCase()
      && y.t.toLowerCase() === t.s.t.toLowerCase());
    if (!x) continue;
    seen++;
    if (x.d) assert.equal(t.why, `*${x.a.o}*: ${x.d}`);
    else assert.doesNotMatch(t.why, /: /, t.why);
  }
  assert.ok(seen > 100, seen);
});
