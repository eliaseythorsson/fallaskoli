/* Issue #28: connectives in Óbeygjanleg orð (docs/DLD-PLAN.md §3).

   Two question types on hand-written, reviewed items only:

     ob_tengiord  choose the connective — af því að, þess vegna, þegar,
                  síðan, en — in a short everyday sentence
     ob_skilja    what a sentence with hvorki … né or ekki aðeins … heldur
                  einnig says: only the first, only the second, both, neither

   The items are for pupils with developmental language disorder, so the
   rule is one option that fits and a stated reason for every one that does
   not. What a machine can hold of that is held here and in the build
   (pipeline/build_exercises.py); that each wrong option really fails is a
   reader's judgement, and content/REVIEW-NOTES.md says where to look. */

import test from "node:test";
import assert from "node:assert/strict";
import { EX } from "../data/exercises.js";
import { seeded } from "../src/js/core/duel.js";
import { judge } from "../src/js/core/answer.js";
import { tagsOf, patternById } from "../src/js/core/diagnosis.js";
import { catalogueEntry, CATALOGUE_IDS } from "../src/js/core/catalogue.js";
import { nodeById } from "../src/js/core/curriculum.js";
import { typeById, applyEffects } from "../src/js/tasks/index.js";
import { obConnective, obSense } from "../src/js/tasks/obeygjanleg.js";
import { freshView, poolLex, buildFresh } from "./pools.js";

const lex = poolLex();
const FIVE = ["af því að", "þess vegna", "þegar", "síðan", "en"];
/* the verb straight after these two (*Þess vegna fór ég*); the subject first after the rest */
const VERB_NEXT = new Set(["þess vegna", "síðan"]);

/* ---------- the catalogue --------------------------------------------------- */

test("both types are declared at the end of the catalogue, in Óbeygjanleg orð, graded by the app", () => {
  assert.deepEqual(CATALOGUE_IDS.slice(-2), ["ob_tengiord", "ob_skilja"]);
  for (const id of ["ob_tengiord", "ob_skilja"]) {
    const c = catalogueEntry(id);
    assert.equal(c.skill, "obeygjanleg");
    assert.equal(c.renderer, "choice");
    assert.equal(c.grader, "app");
    /* the options are on the screen: choosing among them is not recall */
    assert.equal(c.recall, false);
    assert.deepEqual(c.tags, ["tengi"]);
    assert.deepEqual(c.bands, [1], `${id}: a few dozen reviewed sentences do not follow the band`);
    assert.equal(typeof typeById(id).build, "function");
  }
  assert.deepEqual(nodeById("ob-tengiord").types, ["ob_tengiord", "ob_skilja"]);
  assert.deepEqual(patternById("tengiord").types, ["ob_tengiord", "ob_skilja"]);
});

/* ---------- ob_tengiord: the items ------------------------------------------ */

test("ob_tengiord: every item has one blank, the answer and three of the other four, each with its reason", () => {
  assert.ok(EX.connective.length >= 30, `${EX.connective.length} items`);
  for (const x of EX.connective) {
    assert.equal(x.t.split("___").length, 2, x.t);
    const opts = [x.a, ...x.w];
    assert.equal(x.w.length, 3, x.t);
    assert.equal(new Set(opts).size, 4, x.t);
    for (const o of opts) assert.ok(FIVE.includes(o), `${x.t}: ${o}`);
    assert.deepEqual(Object.keys(x.no).sort(), [...x.w].sort(), x.t);
    for (const o of x.w) {
      assert.ok(x.no[o].length >= 30, `${x.t}: no reason against ${o}`);
      /* a reason names the option it is about */
      assert.ok(x.no[o].toLowerCase().includes(`*${o}*`), `${x.t}: the reason against ${o} does not name it`);
      assert.ok(!x.no[o].includes("___"), x.t);
    }
    assert.ok(x.why.toLowerCase().includes(`*${x.a}*`), `${x.t}: the explanation does not name ${x.a}`);
    assert.ok(x.lvl >= 1 && x.lvl <= 3, `${x.t}: þyngd ${x.lvl} — these are short sentences`);
  }
});

test("ob_tengiord: each of the five is the right answer in five items or more, and none in a third of them", () => {
  /* No connective is learned as "always wrong" or "usually right". */
  const n = EX.connective.length;
  for (const c of FIVE) {
    const k = EX.connective.filter((x) => x.a === c).length;
    assert.ok(k >= 5, `${c} is right in ${k} items`);
    assert.ok(k < n / 3, `${c} is right in ${k} of ${n}`);
    assert.ok(EX.connective.some((x) => x.w.includes(c)), `${c} is never a wrong option`);
  }
});

test("ob_tengiord: an option that could also be right is never offered", () => {
  for (const x of EX.connective) {
    const start = x.t.startsWith("___");
    const afterStop = /[.!?] ___/.test(x.t);
    /* *síðan* and *þess vegna* take the same word order, so only the meaning
       can part them. Result after cause can always be read as "and then":
       *síðan* is never offered against *þess vegna*. */
    if (x.a === "þess vegna") assert.ok(!x.w.includes("síðan"), x.t);
    /* *þegar* at the head of a sentence is also an adverb (*þegar í stað*):
       where the right answer is an adverb that says what came next, it is
       not offered. Against *þess vegna* it is — only where "at once" makes
       no sense: a negation, or coming too late. */
    if (x.a === "síðan") assert.ok(!x.w.includes("þegar"), x.t);
    if (x.a === "þess vegna" && x.w.includes("þegar"))
      assert.ok(/ ekki | engan | of seint/.test(x.t), `${x.t}: *þegar* (at once) could be read here`);
    /* A clause at the head of the sentence can begin with *þegar* or with
       *af því að*: the two are never offered against each other there
       unless the reason says why the meaning rules one out. */
    if (start && x.a === "af því að") assert.ok(!x.w.includes("þegar"), x.t);
    /* Mid-sentence, *þegar* against *af því að* only where the tenses part
       them: the result now, the cause before (*Ég er svangur ___ ég borðaði
       ekki*). */
    if (!start && !afterStop && x.a === "af því að" && x.w.includes("þegar"))
      assert.match(x.no["þegar"], / núna /, `${x.t}: *þegar* is ruled out by the tenses or not offered`);
    /* the answer's word order is the one the sentence has (the build checks
       the verb against BÍN; here, that an adverb answer stands first) */
    if (VERB_NEXT.has(x.a)) assert.ok(afterStop, `${x.t}: ${x.a} opens the second sentence`);
  }
});

/* ---------- ob_tengiord: the question --------------------------------------- */

test("ob_tengiord: the question is the item — four options, a capital at the head of a sentence, a reason behind every wrong one", () => {
  const seen = new Set();
  for (const t of buildFresh("ob_tengiord", 1, 400)) {
    const x = EX.connective.find((y) => y.t === t.item);
    assert.ok(x, t.item);
    seen.add(x.t);
    assert.equal(t.type, "choice");
    assert.equal(t.options.length, 4);
    assert.ok(t.options.includes(t.answer));
    assert.equal(t.s.tok[t.i].w, "___");
    const head = t.i === 0 || /^[.!?]$/.test(t.s.tok[t.i - 1].w);
    for (const o of t.options) {
      assert.equal(/^\p{Lu}/u.test(o), head, `${x.t}: ${o}`);
      assert.ok(FIVE.includes(o.toLowerCase()), o);
    }
    assert.equal(t.answer.toLowerCase(), x.a);
    /* the reason is found under the option as it is written on the button */
    for (const o of t.options.filter((y) => y !== t.answer)) assert.equal(t.whyNot[o], x.no[o.toLowerCase()], `${x.t}: ${o}`);
    assert.equal(t.whyNot[t.answer], undefined);
    assert.equal(t.cell, "tengi:" + x.a);
    assert.deepEqual([...tagsOf(t)], ["tengi"]);
    assert.equal(judge(t, { picked: t.answer }).ok, true);
    for (const o of t.options.filter((y) => y !== t.answer)) {
      const j = judge(t, { picked: o });
      assert.equal(j.ok, false);
    }
  }
  assert.equal(seen.size, EX.connective.length, "every item is asked");
});

/* ---------- ob_skilja ------------------------------------------------------- */

test("ob_skilja: the pair of connectives decides the answer, and the four answers are the same every time", () => {
  assert.ok(EX.connectiveSense.length >= 20, `${EX.connectiveSense.length} items`);
  const right = { hvorugt: 0, bæði: 0, first: 0, second: 0 };
  for (const x of EX.connectiveSense) {
    assert.ok(!x.t.includes("___"), x.t);
    assert.match(x.q, /^Hvort .+ eða .+\?$/, x.t);
    const opts = [x.a, ...x.w];
    assert.equal(new Set(opts).size, 4, x.t);
    const only = opts.filter((o) => o.startsWith("bara "));
    assert.equal(only.length, 2, x.t);
    assert.ok(opts.includes("bæði") && opts.includes("hvorugt"), x.t);
    /* the two things are in the sentence and in the question, word for word */
    for (const o of only) {
      assert.ok(x.t.includes(o.slice(5)), `${x.t}: ${o}`);
      assert.ok(x.q.includes(o.slice(5)), `${x.q}: ${o}`);
    }
    const [first, second] = only.sort((a, b) => x.t.indexOf(a.slice(5)) - x.t.indexOf(b.slice(5)));
    if (/ hvorki .+ né /.test(x.t)) { assert.equal(x.a, "hvorugt", x.t); right.hvorugt++; }
    else if (/ ekki aðeins .+ heldur einnig /.test(x.t)) { assert.equal(x.a, "bæði", x.t); right.bæði++; }
    else if (/ ekki .+ heldur /.test(x.t)) { assert.equal(x.a, second, x.t); right.second++; }
    else if (/ en ekki /.test(x.t)) { assert.equal(x.a, first, x.t); right.first++; }
    else assert.fail(`${x.t}: which pair is this?`);
    /* never the subject: nobody has to choose between kom and komu */
    assert.ok(!/^(Hvorki|Ekki aðeins|Bæði)\b/.test(x.t), `${x.t}: the pair is the subject`);
    assert.deepEqual(Object.keys(x.no).sort(), [...x.w].sort(), x.t);
    for (const o of x.w) assert.ok(x.no[o].length >= 25, `${x.t}: no reason against ${o}`);
    /* *ekki aðeins … heldur einnig* is four words by itself: up to ten in all */
    assert.ok(x.lvl <= 4, `${x.t}: þyngd ${x.lvl}`);
  }
  /* the two the issue names carry the type; the plain negations beside them
     are there so that "bara …" is sometimes right and *ekki* sometimes negates */
  assert.ok(right.hvorugt >= 8 && right.bæði >= 8, JSON.stringify(right));
  assert.ok(right.first >= 3 && right.second >= 3, JSON.stringify(right));
});

test("ob_skilja: nobody does one thing in one sentence and the opposite in another", () => {
  const facts = new Map();
  for (const x of EX.connectiveSense) {
    const [who, verb] = x.t.split(" ");
    const things = [x.a, ...x.w].filter((o) => o.startsWith("bara ")).map((o) => o.slice(5)).sort().join(" / ");
    const key = `${who} ${verb} ${things}`;
    assert.ok(!facts.has(key), `${x.t} — and: ${facts.get(key)}`);
    facts.set(key, x.t);
  }
});

test("ob_skilja: the whole sentence is shown, the options stand in one order, the picked wrong one has its reason", () => {
  const seen = new Set();
  for (const t of buildFresh("ob_skilja", 1, 400)) {
    const x = EX.connectiveSense.find((y) => y.t === t.item);
    seen.add(x.t);
    assert.equal(t.type, "choice");
    assert.equal(t.i, -1);
    assert.equal(t.s.t, x.t);
    assert.equal(t.question, x.q);
    assert.equal(t.options.length, 4);
    assert.deepEqual(t.options.slice(2), ["bæði", "hvorugt"]);
    assert.ok(x.t.indexOf(t.options[0].slice(5)) < x.t.indexOf(t.options[1].slice(5)), x.t);
    assert.equal(t.answer, x.a);
    assert.deepEqual(t.whyNot, x.no);
    assert.match(t.cell, /^skilja:(hvorki|ekki-adeins|ekki-heldur|en-ekki)$/);
    assert.equal(judge(t, { picked: t.answer }).ok, true);
    assert.equal(judge(t, { picked: t.options.find((o) => o !== t.answer) }).ok, false);
  }
  assert.equal(seen.size, EX.connectiveSense.length, "every item is asked");
});

/* ---------- both: reviews, the session's memory, a closed level --------------- */

test("a review gets its item or its cell; an item shown is remembered and not asked again at once", () => {
  for (const [build, items, cellOf] of [
    [obConnective, EX.connective, (t) => t.cell],
    [obSense, EX.connectiveSense, (t) => t.cell]]) {
    const x = items[items.length - 1];
    assert.equal(build(lex, freshView(1, { force: { item: x.t } }), seeded(2)).task.item, x.t);
    assert.equal(build(lex, freshView(1, { force: { item: "engin slík setning" } }), seeded(2)), null);
    const cell = cellOf(build(lex, freshView(1), seeded(3)).task);
    for (let k = 0; k < 40; k++) assert.equal(build(lex, freshView(1, { force: { cell } }), seeded(k)).task.cell, cell);
    assert.equal(build(lex, freshView(1, { force: { cell: "ÞGFET" } }), seeded(2)), null);

    /* what the session has seen is not asked until the rest has been */
    const view = freshView(1);
    const host = { S: view.S, sess: view.sess, forcedNoun: null };
    const asked = [];
    for (let k = 0; k < Math.min(items.length, 40); k++) {
      const b = build(lex, freshView(1, { sess: host.sess, S: host.S }), seeded(100 + k));
      assert.ok(!asked.includes(b.task.item), `${b.task.item} came again after ${k} questions`);
      asked.push(b.task.item);
      applyEffects(host, b.effects);
    }
  }
});

test("a curriculum that closes a level closes its items; with every level closed to them, the label is the nearest open one", () => {
  const only = (levels) => {
    const view = freshView(1);
    const policy = { ...view.policy, level: (l) => levels.includes(l), levels };
    return { ...view, policy };
  };
  for (const [build, items] of [[obConnective, EX.connective], [obSense, EX.connectiveSense]]) {
    const lv = new Map(items.map((x) => [x.t, x.lvl]));
    assert.ok(items.some((x) => x.lvl === 2) && items.some((x) => x.lvl !== 2));
    for (let k = 0; k < 60; k++) assert.equal(lv.get(build(lex, only([2]), seeded(k)).task.item), 2);
    /* no item of theirs is at þyngd 5: they are asked all the same, and say 5 */
    assert.equal(build(lex, only([5]), seeded(1)).task.lvl, 5);
  }
});
