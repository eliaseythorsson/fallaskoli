/* "Æfa þetta" on a Lesefni page (critique item 41): five questions on
   exactly the question types of that page, read off the curriculum nodes.
   The session is built here the way the session controller builds it
   (practiceLesson → startRun → runPolicy → pickTask), so what the button asks is tested, not
   only the table it reads. */

import test from "node:test";
import assert from "node:assert/strict";
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, newSession, chosenPolicy } from "../src/js/core/state.js";
import { createPolicy, narrowPolicy, openFor, featuresOf, TYPE_IDS, blankPolicy } from "../src/js/core/policy.js";
import { LESSONS, lessonPractice, practiceSkills, READING_ONLY, PRACTICE_SIZE } from "../src/js/core/lessons.js";
import { NODES } from "../src/js/core/curriculum.js";
import { TASKS } from "../src/js/tasks/index.js";
import { seeded } from "../src/js/core/duel.js";
import { ask } from "./helpers.js";
import { runPolicy } from "../src/js/core/run.js";

const lex = buildLexicon(DATA);

/** The policy of a page's session, as the session controller asks for it
    (practiceLesson → startRun → core/run.js `runPolicy`). */
function policyFor(S, p) {
  return runPolicy(S, { types: p.types, skills: practiceSkills(p, TASKS), attrs: p.attrs });
}

/** The questions of one page's session for a new pupil: `n` of them. */
function session(id, n = PRACTICE_SIZE, S = blankState(), seed = 11) {
  const p = lessonPractice(id);
  const ctx = { lex, S, sess: newSession(S), policy: policyFor(S, p), run: true, mix: { n, counts: {} } };
  const rnd = seeded(seed);
  const out = [];
  for (let k = 0; k < n; k++) {
    const t = ask(ctx, rnd);
    if (!t) break;
    out.push(t);
    ctx.mix.counts[t.typeId] = (ctx.mix.counts[t.typeId] || 0) + 1;
  }
  return { p, tasks: out };
}

const marksOf = (t) => [t.m, t.cell, t.t && t.t.m, ...(t.cells || []).map((c) => c.m)]
  .filter((m) => typeof m === "string" && !m.includes(":"));

test("every Lesefni page maps to at least one question type, or is marked reading-only", () => {
  assert.equal(PRACTICE_SIZE, 5);
  for (const l of LESSONS) {
    const p = lessonPractice(l.id);
    if (READING_ONLY.has(l.id)) { assert.equal(p, null, l.id); continue; }
    assert.ok(p && p.types.length, `${l.id}: no curriculum node with questions names this page — add one, or list it in READING_ONLY`);
    for (const t of p.types) assert.ok(TYPE_IDS.includes(t), `${l.id}: ${t} is not a question type`);
    /* The types are exactly those of the page's nodes. */
    const want = new Set(NODES.filter((n) => n.lesson === l.id).flatMap((n) => n.types));
    assert.deepEqual(new Set(p.types), want, l.id);
  }
  assert.equal(lessonPractice("no-such-page"), null);
  for (const id of READING_ONLY) assert.ok(LESSONS.some((l) => l.id === id), `READING_ONLY names ${id}, which is no page`);
});

test("a page's attribute narrowing is what all its nodes agree on", () => {
  assert.deepEqual(lessonPractice("tid").attrs, { tid: ["ÞT"] });
  assert.deepEqual(lessonPractice("stigbreyting").attrs, { stig: ["MID", "EFST"] });
  assert.ok(!lessonPractice("hattur").attrs.hattur.includes("FH"), "the mood page asks every mood but the indicative");
  /* The voice page has a node without attrs (þolmynd): voice is left open. */
  assert.deepEqual(lessonPractice("mynd").attrs, {});
  assert.deepEqual(lessonPractice("foll").attrs, {});
});

test("the button's session asks five questions, all of the page's types, for every page", () => {
  for (const l of LESSONS) {
    if (READING_ONLY.has(l.id)) continue;
    const { p, tasks } = session(l.id);
    assert.equal(tasks.length, PRACTICE_SIZE, `${l.id}: only ${tasks.length} questions could be built`);
    for (const t of tasks) {
      assert.ok(p.types.includes(t.typeId), `${l.id}: asked ${t.typeId}, not one of ${p.types}`);
      /* Narrowed attributes hold for every cell asked. */
      for (const [g, keys] of Object.entries(p.attrs))
        for (const m of marksOf(t)) {
          const f = featuresOf(m)[g];
          assert.ok(!f || keys.includes(f), `${l.id}: ${t.typeId} asked ${m} (${g} ${f})`);
        }
    }
  }
});

test("a type that serves several categories stays inside the page's", () => {
  /* The reverse analysis (revform) serves adjectives, verbs and nouns; on the
     mood page it must analyse verbs. */
  /* …and the word-class analysis comes with it since 6.13 (the fallhættir in a
     sentence), held to verbs. */
  const skills = practiceSkills(lessonPractice("hattur"), TASKS);
  assert.deepEqual(skills.sort(), ["greining", "sagnord"]);
  assert.deepEqual(lessonPractice("hattur").attrs.ofl, ["sagnorð"]);
  for (let seed = 1; seed < 40; seed++) {
    const { tasks } = session("hattur", PRACTICE_SIZE, blankState(), seed);
    for (const t of tasks.filter((x) => x.typeId === "revform")) assert.equal(t.skill, "sagnord", `seed ${seed}`);
    for (const t of tasks.filter((x) => x.typeId === "parse")) assert.equal(t.t.c, "sagnorð", `seed ${seed}`);
  }
  /* Kyn og tala is asked inside the word-class analysis: its category comes too. */
  assert.deepEqual(practiceSkills(lessonPractice("kyn-tala"), TASKS).sort(), ["greining", "nafnord"]);
});

test("asked for by name: the child's own switches give way, the administrator's do not", () => {
  /* A year-8 pupil (the default) has Setningagerð off; its page still practises. */
  const S = blankState();
  assert.equal(S.enabled.setningagerd, false);
  assert.equal(session("aukasetningar", 5, S).tasks.length, 5);
  /* The child switched a type off: the page that teaches it still asks it. */
  S.policy = { ...blankPolicy(), types: { no_val: false } };
  const p = lessonPractice("foll");
  assert.ok(policyFor(S, p).type("no_val"));
  /* The administrator switched it off: it stays off. */
  S.allowed = { ...blankPolicy(), types: { no_val: false } };
  assert.ok(!policyFor(S, p).type("no_val"));
  for (let seed = 1; seed < 15; seed++)
    assert.ok(session("foll", 5, S, seed).tasks.every((t) => t.typeId !== "no_val"));
  /* openFor changes nothing it is handed. */
  const C = { skills: { a: false }, types: { b: false } };
  openFor(C, { skills: ["a"], types: ["b"] });
  assert.deepEqual(C, { skills: { a: false }, types: { b: false } });
});

/* Owner feedback, 6.13: "Færnikort → Kyn og tala nafnorða → 10 spurningar"
   asked "Greindu orðið" on adjectives, verbs and pronouns. The node is asked
   inside the word-class analysis, and its session now keeps to nouns. */
test("Kyn og tala nafnorða asks only about nouns, from the map and from its page", async () => {
  const { nodeSession } = await import("../src/js/core/skillmap.js");
  const node = NODES.find((n) => n.id === "no-kyn-tala");
  const S = blankState();
  const fromMap = nodeSession(node, S);
  const fromPage = lessonPractice("kyn-tala");
  for (const p of [fromMap, fromPage]) {
    assert.deepEqual(p.attrs.ofl, ["nafnorð"]);
    const P = policyFor(S, p);
    const ctx = { lex, S, sess: newSession(S), policy: P, run: true, mix: { n: 40, counts: {} } };
    const rnd = seeded(7);
    let seen = 0;
    for (let k = 0; k < 40; k++) {
      const t = ask(ctx, rnd);
      if (!t) break;
      seen++;
      assert.equal(t.typeId, "parse");
      assert.equal(t.t.c, "nafnorð", `asked about ${t.t.w} (${t.t.c})`);
    }
    assert.ok(seen >= 30, `only ${seen} questions`);
  }
});
