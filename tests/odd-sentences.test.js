/* The odd sentences the v6.13 review still found (S2), held by their causes.

   - "Ég teiknaði mynd af bensíninu" (revform): the frame took `concrete`,
     and that holds the substances. One draws what has a shape.
   - "Í gær hjálpaði ég þremur rithöfundum með heimalærdóminn": the frame
     took `person`, every person and every job. A new class `child` (barn,
     krakki, strákur, stelpa, nemandi …) is what frames about school and
     about being small now ask for; frames with a kinship word and *minn*
     keep their own noun; frames with *gamall* take adults.
   - "Þetta er saga um hita" (fs_fsno): the frame took `any`. A story is
     about someone, or about an idea or an event.
   - "Skólinn byrjar sextánda júní" (to_dags): every frame drew any month.
     A frame on the school calendar now names the days it can be true on.
   - so_bodhattur asked for *kúgaðu*: at þyngd 5 the pool was every verb,
     the rarest likeliest. Now never beyond the commonest 60 %, which was
     read, and the verbs unfit as an order to a child are left out. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { DATA } from "../data/data_bundle.js";
import { EX } from "../data/exercises.js";
import { freshView, poolLex } from "./pools.js";
import { typeById } from "../src/js/tasks/index.js";
import { seeded } from "../src/js/core/duel.js";

const lex = poolLex();
const frame = (t) => {
  const s = DATA.sent.find((x) => x.t === t);
  assert.ok(s, t);
  return s;
};

test("the class `child`: children and pupils, inside every `person` frame", () => {
  for (const o of ["barn", "krakki", "strákur", "stelpa", "nemandi", "unglingur"])
    assert.equal(lex.nouns.find((w) => w.o === o).s, "child", o);
  for (const o of ["kennari", "rithöfundur", "afi", "kona"]) assert.notEqual(lex.nouns.find((w) => w.o === o).s, "child", o);
  /* a frame that took any person still takes a child */
  assert.ok(frame("Ég hitti fjórar stelpur.").need.includes("child"));
  assert.ok(frame("Ég hitti fjórar stelpur.").need.includes("job"));
});

test("frames about school or being small ask for a child; kin with *minn* keep their noun; *gamall* takes adults", () => {
  for (const t of ["Í gær hjálpaði ég þremur strákum með heimalærdóminn.", "Allir krakkarnir fóru út í frímínútum.",
    "Kennarinn hjálpaði þremur nemendum í morgun.", "Litla barnið sefur.", "Kennarinn hrósaði nemendunum."])
    assert.deepEqual(frame(t).need, ["child"], t);
  for (const t of ["Eldri bróðir minn er í tíunda bekk.", "Yngri systir mín byrjar í skóla í haust."])
    assert.deepEqual(frame(t).need, [], t);
  for (const t of ["Gamli maðurinn sefur.", "Ég gaf gömlum manni sætið mitt."]) {
    const need = frame(t).need;
    assert.ok(need.includes("person") && need.includes("job") && !need.includes("child"), t);
  }
});

test("what one draws has a shape; a story is about someone, an idea or an event", () => {
  for (const t of ["Ég teiknaði mynd af hesti.", "Þetta er mynd af hestum."]) {
    const need = frame(t).need;
    for (const c of ["substance", "drink", "weather", "abstract"]) assert.ok(!need.includes(c), `${t} ${c}`);
    for (const c of ["animal", "person", "child", "building", "sky", "object"]) assert.ok(need.includes(c), `${t} ${c}`);
  }
  for (const t of ["Þetta er saga um krakka.", "Þetta er saga um vináttu."]) {
    const need = frame(t).need;
    for (const c of ["weather", "substance", "body", "food", "furniture"]) assert.ok(!need.includes(c), `${t} ${c}`);
  }
  /* and no generated question puts one there */
  for (const id of ["revform", "fs_fsno"]) for (let s = 0; s < 300; s++) {
    const b = typeById(id).build(lex, freshView(1 + (s % 5)), seeded(61000 + s));
    const t = b && b.task && b.task.s && b.task.s.t;
    if (!t) continue;
    assert.doesNotMatch(t, /mynd af (bensín|sand|vatn|mjólk|olí)/i, t);
    assert.doesNotMatch(t, /saga um (hita|kulda|snjó|vind|sand)/i, t);
    assert.doesNotMatch(t, /heimalærdóminn/.test(t) ? /(rithöfund|kennur|lækn|afa|ömmu|mönnum|konum)/ : /^$/, t);
  }
});

test("to_dags: a date on the school calendar is one it can be true on", () => {
  const M = EX.dates.months;
  const school = EX.dates.frames.find((f) => f.t.startsWith("Skólinn byrjar"));
  assert.ok(school && school.when.length, "Skólinn byrjar has its days");
  let seen = 0;
  for (let s = 0; s < 1500; s++) {
    const b = typeById("to_dags").build(lex, freshView(1 + (s % 5)), seeded(62000 + s));
    if (!b) continue;
    const t = b.task, text = t.s.t, d = parseInt(t.cue, 10);
    const month = M.find((m) => text.includes(" " + m));
    if (/^Skólinn byrjar/.test(text)) {
      seen++;
      assert.ok((month === "ágúst" && d >= 18) || (month === "janúar" && d >= 3 && d <= 6), `${text} ${t.cue}`);
    }
    if (/er sumarfrí/.test(text))
      assert.ok((month === "maí" && d >= 28) || (month === "júní" && d <= 15), `${text} ${t.cue}`);
  }
  assert.ok(seen > 20, seen);
});

test("so_bodhattur: never *kúga* or another order unfit for a child, never past the commonest 60 %", () => {
  const unfit = ["kúga", "kvelja", "pína", "hræða", "móðga", "svindla", "ríða", "drulla", "éta", "heita", "líða",
    "drepa", "stela", "ljúga", "skjóta", "villa", "hefja", "deyja", "berja"];
  const cut = Math.ceil(lex.verbs.length * 0.6);
  for (const band of [3, 5, 6, 7]) for (let s = 0; s < 400; s++) {
    const b = typeById("so_bodhattur").build(lex, freshView(band), seeded(63000 + band * 1000 + s));
    if (!b) continue;
    const v = b.task.v;
    assert.ok(!unfit.includes(v.o), `${band}: ${v.o}`);
    assert.ok(v.r <= cut, `${band}: ${v.o} rank ${v.r}`);
  }
});
