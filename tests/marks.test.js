import { test } from "node:test";
import assert from "node:assert/strict";
import { readMark, describeMark, mark, ordKey, NOUN_MARKS, MOODS, isStyfdur } from "../src/js/core/marks.js";

test("a noun mark: case, number and article", () => {
  assert.deepEqual(readMark("ÞGFETgr"),
    { greinir: true, fall: "ÞG", tala: "eintala" });
  assert.deepEqual(readMark("NFFT"),
    { greinir: false, fall: "NF", tala: "fleirtala" });
});

test("an adjective mark carries degree and inflection", () => {
  const a = readMark("FSB-KVK-NFET");
  assert.equal(a.stig, "frumstig");
  assert.equal(a.beyging, "sterk");
  assert.equal(a.kyn, "kvk");
  assert.equal(a.fall, "NF");
  assert.equal(readMark("MST-KK-NFET").stig, "miðstig");
  assert.equal(readMark("EVB-HK-ÞGFFT").stig, "efsta stig");
  assert.equal(readMark("EVB-HK-ÞGFFT").beyging, "veik");
});

test("a verb mark carries voice, mood, tense and person", () => {
  const a = readMark("GM-FH-ÞT-3P-ET");
  assert.equal(a.mynd, "germynd");
  assert.equal(a.háttur, "framsöguháttur");
  assert.equal(a.tíð, "þátíð");
  assert.equal(a.persóna, "3. persóna");
  assert.equal(a.tala, "eintala");
  assert.equal(readMark("MM-VH-NT-1P-FT").mynd, "miðmynd");
  assert.equal(readMark("GM-NH").háttur, "nafnháttur");
  assert.equal(readMark("LHÞT-SB-KK-NFET").háttur, "lýsingarháttur þátíðar");
});

test("an unreadable mark yields an empty analysis but does not crash", () => {
  assert.deepEqual(readMark(null), { greinir: false });
  assert.deepEqual(readMark("RUGL"), { greinir: false });
});

test("describeMark reads as human language", () => {
  assert.equal(describeMark("ÞGFETgr"), "þágufall, eintala, með greini");
  assert.match(describeMark("GM-FH-ÞT-3P-ET"), /germynd/);
});

test("mark() and ordKey() stay in step with the paradigm ordering", () => {
  assert.equal(mark("ÞG", "ETgr"), "ÞGFETgr");
  assert.equal(NOUN_MARKS.length, 16);
  assert.equal(ordKey("kvk"), "no");
  assert.equal(ordKey("rt"), "fn", "ordinals use the pronoun ordering");
  assert.equal(ordKey("abfn"), "pfn");
  assert.equal(ordKey("ao"), null);
});

/* ================= v5.9: the shortened imperative and the moods ========== */

test("stýfður boðháttur is named, never passed off as an ordinary boðháttur", () => {
  /* The owner met *ræt* in "Greindu beygðu myndina" and the screen called it
     "germynd, boðháttur" — true, and no help at all. The mark carries `ST` and
     the description has to say so. */
  assert.equal(readMark("GM-BH-ST").stýfður, true);
  assert.equal(isStyfdur("GM-BH-ST"), true);
  assert.match(describeMark("GM-BH-ST"), /stýfður boðháttur/);
  /* And the ordinary imperative is untouched. */
  assert.equal(isStyfdur("GM-BH-ET"), false);
  assert.equal(readMark("GM-BH-ET").stýfður, undefined);
  assert.doesNotMatch(describeMark("GM-BH-ET"), /stýfður/);
});

test("every mood a mark can carry is offered as an answer", () => {
  /* The bug this pins: `readMark` reported three participle moods that the
     analysis question did not offer as buttons, so a verb drawn in one of them
     produced a question with no correct answer on it. The list is generated
     from the marks table for that reason; this asserts that it really is. */
  const fromMarks = new Set(
    ["GM-FH-NT-1P-ET", "GM-VH-ÞT-3P-FT", "GM-BH-ET", "GM-NH", "LHNT",
     "LHÞT-SB-KK-NFET", "GM-SAGNB"].map((m) => readMark(m).háttur));
  for (const h of fromMarks) assert.ok(MOODS.includes(h), `${h} is not offered`);
  assert.ok(MOODS.includes("lýsingarháttur nútíðar"));
  assert.ok(MOODS.includes("lýsingarháttur þátíðar"));
  assert.ok(MOODS.includes("sagnbót"));
  /* No duplicates, and nothing in the list that no mark produces. */
  assert.equal(new Set(MOODS).size, MOODS.length);
});
