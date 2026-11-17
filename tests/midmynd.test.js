/* Sagnorð in the miðmynd, and what a verb table says under itself (v6.13
   review, S1).

   tbl_so at þyngd 6 showed *líta · nútíð · miðmynd*: "ég líst, þú líst …".
   *Mér líst vel á það* is said; *ég líst* is not. The table, "Beygðu
   sögnina" and the analysis question opened the miðmynd for every verb whose
   miðmynd the corpus has at all (`mm`), and that takes in the impersonal,
   the reciprocal and what only things do. Now only the checked list
   `PERSONAL_MM` gets the first and second person of the miðmynd. And the
   table's *af hverju* spoke of how the strong past is made under a
   present-tense table; now each tense has its own note. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { freshView, poolLex } from "./pools.js";
import { typeById } from "../src/js/tasks/index.js";
import { personalMM, PERSONAL_MM, tableNote } from "../src/js/tasks/sagnord.js";
import { conjugationNoteFor } from "../src/js/tasks/explain.js";
import { seeded } from "../src/js/core/duel.js";

const lex = poolLex();
const verb = (o) => lex.verbs.find((v) => v.o === o);

test("personalMM: the miðmynd a person says of himself, and not the rest", () => {
  for (const o of ["setja", "kynna", "klæða", "gleðja", "berja", "koma", "búa", "vona"])
    assert.ok(personalMM(verb(o)), o);
  /* impersonal, reciprocal, of things only, or never said */
  for (const o of ["líta", "skilja", "finna", "hitta", "hjálpa", "tala", "opna", "loka", "selja", "geta", "taka", "vinna"])
    assert.ok(!personalMM(verb(o)), o);
  for (const v of lex.verbs.filter(personalMM)) {
    assert.ok(v.mm && PERSONAL_MM.has(v.forms["MM-NH"][0]), v.o);
    for (const p of ["1P-ET", "2P-ET", "3P-ET", "1P-FT", "2P-FT", "3P-FT"])
      assert.ok((v.forms["MM-FH-NT-" + p] || []).length, `${v.o} MM-FH-NT-${p}`);
  }
});

function tasks(id, bands, n) {
  const out = [];
  for (const band of bands) for (let s = 0; s < n; s++) {
    const b = typeById(id).build(lex, freshView(band), seeded(52000 + band * 1000 + s));
    if (b) out.push(b.task);
  }
  return out;
}

test("tbl_so: a miðmynd table only for a verb on the list, and the note fits the tense", () => {
  const all = tasks("tbl_so", [4, 5, 6, 7], 250);
  const mm = all.filter((t) => /miðmynd/.test(t.title));
  assert.ok(mm.length >= 10, mm.length);
  for (const t of mm) assert.ok(personalMM(t.w), t.title);
  for (const t of all) {
    if (!t.why) continue;
    /* (the núþáleg note compares the present with a strong past, rightly) */
    if (/nútíð/.test(t.title) && !/núþáleg/.test(t.why)) assert.doesNotMatch(t.why, /þátíð/, `${t.title}: ${t.why}`);
    if (/miðmynd/.test(t.title)) assert.match(t.why, /^Miðmynd endar á \*-st\*/, t.title);
    if (/viðtengingarháttur/.test(t.title)) assert.match(t.why, /^Viðtengingarháttur þátíðar/, t.title);
  }
});

test("tableNote: the verb's own forms, for the tense asked", () => {
  assert.equal(tableNote(verb("setja"), "MM-FH-NT"),
    "Miðmynd endar á *-st*: ég *sest*, við *setjumst*. Nafnháttur miðmyndar er *að setjast*.");
  assert.equal(tableNote(verb("fara"), "GM-FH-NT"),
    "Í nútíð fleirtölu endar 1. persóna á *-um* (við *förum*) og 2. persóna á *-ið* (þið *farið*).");
  assert.equal(tableNote(verb("taka"), "GM-VH-ÞT"),
    "Viðtengingarháttur þátíðar er myndaður af þátíð fleirtölu í framsöguhætti: við *tókum* – þótt ég *tæki*.");
  assert.match(tableNote(verb("taka"), "GM-FH-ÞT"), /sterk sögn: þátíðin/);
  /* *vera*: þið *eruð*, the rule does not hold, so nothing is said */
  assert.equal(tableNote(verb("vera"), "GM-FH-NT"), null);
});

test("verb and verbslot: the strong/weak note only under the past indicative", () => {
  assert.equal(conjugationNoteFor("fara", "sterk", "GM-FH-NT-1P-ET"), null);
  assert.equal(conjugationNoteFor("taka", "sterk", "GM-VH-ÞT-1P-ET"), null);
  assert.match(conjugationNoteFor("fara", "sterk", "GM-FH-ÞT-1P-ET"), /sterk sögn/);
  assert.match(conjugationNoteFor("eiga", "núþáleg", "GM-FH-NT-1P-ET"), /núþáleg/);
  assert.equal(conjugationNoteFor("eiga", "núþáleg", "GM-FH-ÞT-1P-ET"), null);
});

test("verb: a miðmynd in the first or second person only of a verb on the list", () => {
  for (const t of tasks("verb", [4, 5, 6, 7], 300))
    if (/^MM-.*-(1P|2P)-/.test(t.m)) assert.ok(personalMM(t.v), `${t.v.o} ${t.m}`);
});
