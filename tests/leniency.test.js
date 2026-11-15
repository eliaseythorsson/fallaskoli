/* Answers that are right enough — the three the owner asked for in v5.9.
 *
 * The tests are written the way the reports were made: an answer a child could
 * type, and what should happen to it. What matters most is the second half of
 * each pair — the answer that must NOT be forgiven — because a rule that
 * forgives too much is worse than no rule at all. A program that accepts the
 * wrong case is not being kind; it is teaching the wrong case.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { gradeForm } from "../src/js/core/grading.js";
import { slipFor, verdictOf, onlyGreinirDiffers, onlyTidDiffers, SLIP_XP }
  from "../src/js/core/leniency.js";
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";

const lex = buildLexicon(DATA);

/** Grade `typed` as an answer to `mark` for this word, the way a submit
    handler does: the accepted forms and the whole paradigm. */
function answer(word, mark, typed) {
  const g = gradeForm(typed, { accepted: word.forms[mark], paradigm: word.forms });
  return { g, v: verdictOf(g, mark) };
}

/* ================= 1. the accent slip, 5% ================================ */

test("a missing accent is accepted, at 95% of the XP", () => {
  const w = lex.lookup("hús", "hk");
  const { v } = answer(w, "NFET", "hus");
  assert.equal(v.ok, true);
  assert.equal(v.klass, "near");
  assert.equal(v.factor, SLIP_XP.accents);
  assert.match(v.slip.head, /passaðu stafsetningu/);
});

test("ö for o is not an accent slip", () => {
  /* The owner named this case: *"Specifically not o -> ö as these are not
     similar."* */
  const w = lex.lookup("vörður", "kk");
  assert.equal(w.forms.NFET[0], "vörður");
  const { v } = answer(w, "NFET", "vordur");
  assert.equal(v.ok, false);
  assert.equal(v.klass, "no");
});

/* ================= 2. the article — wrong, but named (v6.10) ============ */

test("the right case and number with the wrong article is WRONG, with a note", () => {
  /* Until v6.10 this was accepted at 90%. In a Nafnorð session the article is
     the topic, and in a duel *hótelin* for *hótel* scored a point. */
  const w = lex.lookup("hestur", "kk");
  const { g, v } = answer(w, "ÞFETgr", "hest");     // asked with, written without
  assert.equal(g.verdict, "otherform");
  assert.equal(v.ok, false);
  assert.equal(v.klass, "no");
  assert.equal(v.factor, 0);
  assert.equal(v.near.id, "greinir");
  assert.match(v.near.note, /með greini/);
  const back = answer(w, "ÞFET", "hestinn");
  assert.equal(back.v.ok, false);
  assert.match(back.v.near.note, /án greinis/);
});

test("the wrong CASE is not forgiven, however well spelled", () => {
  /* This is the whole exercise. *hestinum* is a perfectly good form of
     *hestur*; it is not the one that was asked for, and the difference is what
     the child is here to learn. */
  const w = lex.lookup("hestur", "kk");
  for (const typed of ["hestinum", "hestsins", "hestana", "hestar"]) {
    const { v } = answer(w, "ÞFETgr", typed);
    assert.equal(v.ok, false, `${typed} should not be forgiven`);
  }
});

test("the wrong NUMBER is not forgiven either", () => {
  const w = lex.lookup("bók", "kvk");
  const { v } = answer(w, "NFETgr", "bækurnar");   // singular asked, plural written
  assert.equal(v.ok, false);
});

/* ================= 3. the tense — wrong, but named (v6.10) ============== */

test("the right person and mood in the wrong tense is WRONG, with a note", () => {
  const w = lex.lookup("lesa", "so");
  const { g, v } = answer(w, "GM-FH-NT-1P-ET", w.forms["GM-FH-ÞT-1P-ET"][0]);
  assert.equal(g.verdict, "otherform");
  assert.equal(v.ok, false);
  assert.equal(v.near.id, "tid");
  assert.match(v.near.note, /nútíð/);
});

test("the wrong PERSON or mood is not forgiven", () => {
  const w = lex.lookup("lesa", "so");
  for (const other of ["GM-FH-NT-3P-FT", "GM-VH-ÞT-1P-ET", "GM-NH"]) {
    const form = (w.forms[other] || [])[0];
    if (!form) continue;
    const { v } = answer(w, "GM-FH-NT-1P-ET", form);
    assert.equal(v.ok, false, `${form} (${other}) should not be forgiven`);
  }
});

/* ================= 4. the rules underneath =============================== */

test("only the named feature may differ", () => {
  assert.equal(onlyGreinirDiffers("ÞFETgr", "ÞFET"), true);
  assert.equal(onlyGreinirDiffers("ÞFETgr", "ÞGFET"), false);   // case moved too
  assert.equal(onlyGreinirDiffers("ÞFETgr", "ÞFFT"), false);    // number moved too
  assert.equal(onlyGreinirDiffers("ÞFET", "ÞFET"), false);      // nothing moved
  /* A verb has no article; `readMark` reporting `greinir: false` for one must
     not be read as "without the article". */
  assert.equal(onlyGreinirDiffers("GM-FH-NT-1P-ET", "GM-FH-ÞT-1P-ET"), false);

  assert.equal(onlyTidDiffers("GM-FH-NT-1P-ET", "GM-FH-ÞT-1P-ET"), true);
  assert.equal(onlyTidDiffers("GM-FH-NT-1P-ET", "GM-VH-ÞT-1P-ET"), false);
  assert.equal(onlyTidDiffers("GM-FH-NT-1P-ET", "MM-FH-ÞT-1P-ET"), false);
  assert.equal(onlyTidDiffers("GM-FH-NT-1P-ET", "GM-FH-ÞT-3P-ET"), false);
  assert.equal(onlyTidDiffers("ÞFETgr", "ÞFET"), false);
});

test("an ambiguous form is read the way that makes the child right", () => {
  /* Most Icelandic forms are several cells at once. *las* is the first AND the
     third person of the past, and *hús* is the nominative AND the accusative
     without the article, so a rule that required EVERY reading to be forgivable
     would refuse the two commonest slips in the language. One forgivable
     reading is enough — see the note in slipFor. */
  const both = { verdict: "otherform", otherMarks: ["ÞFET", "ÞGFET"] };
  assert.ok(slipFor(both, "ÞFETgr"), "ÞFET is the article slip; ÞGFET is noise");
  /* But a form with NO forgivable reading is still refused. */
  const neither = { verdict: "otherform", otherMarks: ["ÞGFET", "EFFT"] };
  assert.equal(slipFor(neither, "ÞFETgr"), null);
});

test("a clean answer is still a clean answer", () => {
  const w = lex.lookup("hestur", "kk");
  const { v } = answer(w, "ÞFETgr", "hestinn");
  assert.equal(v.ok, true);
  assert.equal(v.klass, "ok");
  assert.equal(v.factor, 1);
  assert.equal(v.slip, null);
});

test("nothing is forgiven when there is nothing to compare against", () => {
  /* No paradigm, no mark: the grader falls back to exactly what it did before
     any of this existed. */
  assert.equal(verdictOf(gradeForm("hest", { accepted: ["hestinn"] }), null).ok, false);
});
