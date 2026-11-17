/* Worked examples (critique item 41): one per question type, shown on the
   first card of a type a pupil has not met. Every form an example states is
   looked up in BÍN here, and the "met" record is held to the same rules as
   the rest of the saved progress. (That the card shows it once, in a real
   browser, is checked by tools/browser-test.mjs.) */

import test from "node:test";
import assert from "node:assert/strict";
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { EXAMPLES, exampleFor, firstMeeting, markTypeSeen, hasSeenType, cleanSeenTypes,
  mergeSeenTypes } from "../src/js/core/examples.js";
import { TYPE_IDS } from "../src/js/core/policy.js";
import { blankState, migrate } from "../src/js/core/state.js";
import { mergeStates } from "../src/js/core/merge.js";

const lex = buildLexicon(DATA);

test("every question type has a worked example: a question, its answer and how", () => {
  for (const id of TYPE_IDS) {
    const ex = exampleFor(id);
    assert.ok(ex, `${id}: no worked example in content/examples.js`);
    for (const f of ["q", "a", "how"]) assert.ok(typeof ex[f] === "string" && ex[f].trim().length > 0, `${id}.${f}`);
    assert.ok(Array.isArray(ex.forms), `${id}.forms`);
    /* Short: an example on a card, not a lesson. */
    assert.ok(ex.q.length <= 160 && ex.how.length <= 240, `${id}: too long for the card`);
  }
  for (const id of Object.keys(EXAMPLES)) assert.ok(TYPE_IDS.includes(id), `an example for ${id}, which is no question type`);
  /* and the examples of a kind (umritun, v6.13 review S3) are held the same way */
  for (const [id, kind, ex] of KINDED) {
    for (const f of ["q", "a", "how"]) assert.ok(typeof ex[f] === "string" && ex[f].trim().length > 0, `${id}.${kind}.${f}`);
    assert.ok(ex.q.length <= 160 && ex.how.length <= 240, `${id}.${kind}: too long for the card`);
  }
});

/* Every example of a kind, as [typeId, kind, example]. */
const KINDED = Object.entries(EXAMPLES).flatMap(([id, ex]) =>
  Object.entries(ex.byKind || {}).map(([kind, k]) => [id, kind, k]));

test("umritun: the example is of the question's own kind (review S3)", async () => {
  const { typeById } = await import("../src/js/tasks/index.js");
  const { freshView, poolLex } = await import("./pools.js");
  const { seeded } = await import("../src/js/core/duel.js");
  const kinds = new Set();
  for (let s = 0; s < 800; s++) {
    const b = typeById("umritun").build(poolLex(), freshView(1 + (s % 7)), seeded(45000 + s));
    if (b) kinds.add(b.task.kind);
  }
  assert.ok(kinds.size >= 8, [...kinds].join(", "));
  for (const k of kinds) {
    assert.ok(EXAMPLES.umritun.byKind[k], `no worked example for the umritun kind ${k}`);
    assert.equal(firstMeeting(blankState(), { typeId: "umritun", kind: k }), EXAMPLES.umritun.byKind[k]);
  }
  /* the first question indirect speech, the example indirect speech too */
  assert.match(exampleFor("umritun", "indirect").q, /óbeina ræðu/);
  assert.match(exampleFor("umritun", "passive").q, /þolmynd/);
  assert.equal(exampleFor("umritun", "no-such-kind"), EXAMPLES.umritun);
  assert.equal(exampleFor("fill", "past"), EXAMPLES.fill);
});

test("every form an example states is BÍN's form for that word and mark", () => {
  let n = 0;
  for (const [id, ex] of [...Object.entries(EXAMPLES), ...KINDED.map(([id, kind, k]) => [`${id}.${kind}`, k])]) {
    for (const spec of ex.forms) {
      const m = /^([^|]+)\|([^|]+)\|([^=]+)=(.+)$/.exec(spec);
      assert.ok(m, `${id}: "${spec}" is not lemma|class|mark=form`);
      const [, lemma, cls, mark, form] = m;
      const w = lex.lookup(lemma, cls);
      assert.ok(w, `${id}: ${lemma} (${cls}) is not in the lexicon`);
      assert.ok((w.forms[mark] || []).includes(form),
        `${id}: BÍN has ${lemma} ${mark} = ${(w.forms[mark] || []).join("/") || "nothing"}, not ${form}`);
      /* …and the example really shows it. */
      const text = `${ex.q} ${ex.a} ${ex.how}`.toLowerCase();
      assert.ok(text.includes(form.toLowerCase()), `${id}: lists ${form} but never shows it`);
      n++;
    }
  }
  assert.ok(n >= 80, `only ${n} forms checked`);
});

test("the example is shown once per type: on the first meeting, then never again", () => {
  const S = blankState();
  const task = { type: "fill", typeId: "fill", skill: "nafnord" };
  assert.equal(firstMeeting(S, task), EXAMPLES.fill);
  assert.equal(markTypeSeen(S, "fill", "2026-11-16"), true);
  assert.equal(firstMeeting(S, task), null);
  assert.equal(markTypeSeen(S, "fill", "2026-11-17"), false, "the first day is kept");
  assert.deepEqual(S.seenTypes, { fill: "2026-11-16" });
  assert.ok(hasSeenType(S, "fill") && !hasSeenType(S, "no_val"));
  /* Not in a duel, not for a task with no type, not for an unknown type. */
  assert.equal(firstMeeting(S, { ...task, typeId: "no_val", duel: true }), null);
  assert.equal(firstMeeting(S, { type: "fill" }), null);
  assert.equal(firstMeeting(S, { typeId: "nope" }), null);
  assert.equal(markTypeSeen(S, "nope", "2026-11-16"), false);
  assert.equal(markTypeSeen(S, "no_val", "yesterday"), false);
});

test("the types met survive a reload and merge as a union, on the earlier day", () => {
  const S = blankState();
  markTypeSeen(S, "fill", "2026-11-10");
  assert.deepEqual(migrate(JSON.parse(JSON.stringify(S))).seenTypes, { fill: "2026-11-10" });
  assert.deepEqual(migrate({}).seenTypes, {});
  assert.deepEqual(cleanSeenTypes({ fill: "2026-11-10", nope: "2026-11-10", no_val: 5, tbl_no: "x" }),
    { fill: "2026-11-10" });
  assert.deepEqual(mergeSeenTypes({ fill: "2026-11-10", no_val: "2026-11-12" }, { fill: "2026-11-08", tbl_no: "2026-11-01" }),
    { fill: "2026-11-08", no_val: "2026-11-12", tbl_no: "2026-11-01" });
  const L = blankState(), R = blankState();
  L.seenTypes = { fill: "2026-11-10" }; R.seenTypes = { verb: "2026-11-11" };
  assert.deepEqual(mergeStates(blankState(), L, R).seenTypes, { verb: "2026-11-11", fill: "2026-11-10" });
});
