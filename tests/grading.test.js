import { test } from "node:test";
import assert from "node:assert/strict";
import { judge, gradeForm, agreementNote, normalise } from "../src/js/core/grading.js";

/* The paradigm of the adjective "fínn", masculine singular, strong. */
const FINN = {
  "FSB-KK-NFET": ["fínn"],
  "FSB-KK-ÞFET": ["fínan"],
  "FSB-KK-ÞGFET": ["fínum"],
  "FSB-KK-EFET": ["fíns"],
};

test("a bare answer is correct", () => {
  const r = gradeForm("fínum", { accepted: ["fínum"], paradigm: FINN });
  assert.equal(r.verdict, "correct");
  assert.deepEqual(r.helpers, []);
});

test("helper words are allowed — nominative", () => {
  const r = gradeForm("hér er fínn strákur", { accepted: ["fínn"], paradigm: FINN });
  assert.equal(r.verdict, "correct");
  assert.equal(r.matched, "fínn");
  assert.deepEqual(r.helpers, ["hér", "er", "strákur"]);
});

test("helper words are allowed — accusative, dative, genitive", () => {
  const cases = [
    ["um fínan strák", "fínan"],
    ["frá fínum stráki", "fínum"],
    ["til fíns stráks", "fíns"],
  ];
  for (const [input, want] of cases) {
    const r = gradeForm(input, { accepted: [want], paradigm: FINN });
    assert.equal(r.verdict, "correct", `${input} should have been correct`);
    assert.equal(r.matched, want);
  }
});

test("a wrong form among helper words is wrong", () => {
  const r = gradeForm("um fínum strák", { accepted: ["fínan"], paradigm: FINN });
  assert.equal(r.verdict, "wrong");
});

test("writing several forms does not count as a correct answer", () => {
  const r = gradeForm("fínn fínan fínum", { accepted: ["fínan"], paradigm: FINN });
  assert.equal(r.verdict, "hedged");
  assert.deepEqual(r.hedged.sort(), ["fínn", "fínum"]);
});

test("accents: the right word without accents gets its own verdict", () => {
  assert.equal(gradeForm("finum", { accepted: ["fínum"] }).verdict, "accents");
  assert.equal(gradeForm("fra finum straki", { accepted: ["fínum"] }).verdict, "accents");
});

test("a multi-word answer is recognised as a whole", () => {
  const acc = ["þessi hestur"];
  assert.equal(gradeForm("þessi hestur", { accepted: acc }).verdict, "correct");
  assert.equal(gradeForm("hér er þessi hestur", { accepted: acc }).verdict, "correct");
});

test("both BÍN variants are correct", () => {
  const acc = ["hurðum", "hurðunum"];
  assert.equal(gradeForm("hurðum", { accepted: acc }).verdict, "correct");
  assert.equal(gradeForm("hurðunum", { accepted: acc }).verdict, "correct");
});

test("an empty answer is neither right nor wrong", () => {
  assert.equal(gradeForm("   ", { accepted: ["fínn"] }).verdict, "empty");
  assert.equal(judge("", ["fínn"]), "empty");
});

test("punctuation and capitals do not interfere", () => {
  assert.equal(gradeForm("Hér er fínn strákur.", { accepted: ["fínn"] }).verdict, "correct");
  assert.equal(normalise("  Hér  er, fínn! "), "hér er fínn");
});

test("when helper words are barred, only an exact answer will do", () => {
  const r = gradeForm("hér er fínn strákur", { accepted: ["fínn"], allowHelpers: false });
  assert.equal(r.verdict, "wrong");
});

test("the agreement hint is friendly, not a punishment", () => {
  const analyse = (f) => (f === "stráki" ? [{ fall: "ÞG", tala: "eintala" }] : []);
  assert.equal(agreementNote(["stráki"], { fall: "ÞG", tala: "eintala" }, analyse), null);
  const note = agreementNote(["strák"], { fall: "ÞG", tala: "eintala" },
    (f) => (f === "strák" ? [{ fall: "ÞF", tala: "eintala" }] : []));
  assert.match(note, /Lýsingarorðið er rétt/);
});

/* ================= v5.9: which spelling slips are slips ================== */

test("only the six acute pairs are forgiven", () => {
  /* The owner named them: a/á, e/é, i/í, o/ó, u/ú, y/ý — "where the problem
     could easily be a keystroke issue. Specifically not o -> ö as these are not
     similar." Up to v5.8 `stripAccents` also folded ö, æ, þ and ð, and it was
     the function deciding what counted as a correct answer. */
  const slips = [["finum", "fínum"], ["hus", "hús"], ["gott", "gótt"],
                 ["nyr", "nýr"], ["her", "hér"], ["buinn", "búinn"]];
  for (const [typed, right] of slips)
    assert.equal(gradeForm(typed, { accepted: [right] }).verdict, "accents",
      `${typed} for ${right}`);
  /* And these are different words, not slips of the finger. */
  assert.equal(gradeForm("hond", { accepted: ["hönd"] }).verdict, "wrong");
  assert.equal(gradeForm("kottur", { accepted: ["köttur"] }).verdict, "wrong");
  assert.equal(gradeForm("baekur", { accepted: ["bækur"] }).verdict, "wrong");
  assert.equal(gradeForm("thad", { accepted: ["það"] }).verdict, "wrong");
  assert.equal(gradeForm("dagur", { accepted: ["ðagur"] }).verdict, "wrong");
});

test("a real form of the word is never called a spelling slip", () => {
  /* *bíðum* is the present of *bíða* and *biðum* is the past. They are the same
     string once the accent is removed, and there are 157 such pairs in the
     vocabulary. If the accent rule ran first, a child who wrote the past tense
     would be told to mind their accents — which is the wrong thing to teach
     them about their own answer. The paradigm is consulted first. */
  const paradigm = { "GM-FH-NT-1P-FT": ["bíðum"], "GM-FH-ÞT-1P-FT": ["biðum"] };
  const g = gradeForm("biðum", { accepted: ["bíðum"], paradigm });
  assert.equal(g.verdict, "otherform");
  assert.deepEqual(g.otherMarks, ["GM-FH-ÞT-1P-FT"]);
  /* With no paradigm to consult there is nothing to know, and it stays a slip. */
  assert.equal(gradeForm("biðum", { accepted: ["bíðum"] }).verdict, "accents");
});

test("the paradigm wins over the accent rule inside helper words too", () => {
  /* "við biðum í dag" — the answer is found among the helper words by the
     accent rule, and it is still the past tense rather than a mistyped
     present. The precedence has to be the same in both paths or the same
     answer means two different things depending on how much the child wrote. */
  const paradigm = { "GM-FH-NT-1P-FT": ["bíðum"], "GM-FH-ÞT-1P-FT": ["biðum"] };
  const g = gradeForm("við biðum í dag", { accepted: ["bíðum"], paradigm });
  assert.equal(g.verdict, "otherform");
  assert.deepEqual(g.otherMarks, ["GM-FH-ÞT-1P-FT"]);
});
