/* Clause types — the first material outside year 8.
 *
 * The test that matters is not "does the question appear?" but "does the answer
 * come out of the parse?". Design rule 1 says a grammatical rule must never be
 * asserted by hand; here that rule is pinned in code: every single correct
 * answer has to be a `k` value standing on a token in the sentence itself.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { nextTask } from "../src/js/tasks/index.js";
import { blankState, newSession } from "../src/js/core/state.js";
import { SKILLS, skillById } from "../src/js/core/skills.js";
import { MAX, clamp } from "../src/js/core/difficulty.js";

const lex = buildLexicon(DATA);

function ctxFor(skill) {
  const S = blankState();
  Object.keys(S.enabled).forEach((k) => { S.enabled[k] = k === skill; });
  return { lex, S, sess: newSession(S) };
}

test("clause types are registered as year 10 material and off by default", () => {
  /* v6.13: the curriculum map (docs/CURRICULUM.md) moved this from 9.b to
     10.b. What matters to a pupil is unchanged: off until an adult says so. */
  const s = skillById("setningagerd");
  assert.ok(s, "flokkinn vantar");
  assert.equal(s.cur, "10.b");
  assert.equal(blankState().enabled.setningagerd, false,
    "material above year 8 should be off until the adult switches it on");
});

test("the difficulty ceiling allows material above year 8", () => {
  assert.equal(MAX, 7);
  assert.equal(clamp(99), 7);
  assert.equal(clamp(-4), 1);
});

test("the builder returns a task and never the same token twice in a span", () => {
  const ctx = ctxFor("setningagerd");
  let seen = 0;
  for (let i = 0; i < 60; i++) {
    const t = nextTask(ctx);
    if (!t) continue;
    assert.equal(t.skill, "setningagerd");
    /* v6.11: Setningagerð has three kinds of question; the span rules are
       the clause question's. */
    if (t.type !== "clause") continue;
    seen++;
    assert.ok(t.span.to > t.span.from, "the span is one token — that is not a clause");
    assert.ok(t.lvl >= 6, "material for years 9-10 should sit above difficulty 5");
  }
  assert.ok(seen > 0, "the builder returned no task");
});

test("the correct answer is ALWAYS read from the parse, never inferred", () => {
  const ctx = ctxFor("setningagerd");
  for (let i = 0; i < 80; i++) {
    const t = nextTask(ctx);
    if (!t || t.type !== "clause") continue;
    /* Every token in the span must carry exactly the clause type being
       asked about. If the builder inferred anything, this fails.
       */
    for (let j = t.span.from; j <= t.span.to; j++)
      assert.equal(t.s.tok[j].k, t.answer,
        `token ${j} in "${t.s.t}" carries ${t.s.tok[j].k} but the answer is ${t.answer}`);
    assert.ok(t.options.includes(t.answer), "the correct answer is not among the options");
  }
});

test("the new skill required no change to the others", () => {
  /* If the new skill had leaked into the others, this would fail. */
  const ctx = ctxFor("nafnord");
  for (let i = 0; i < 40; i++) {
    const t = nextTask(ctx);
    if (t) assert.notEqual(t.skill, "setningagerd");
  }
  assert.equal(SKILLS.filter((s) => s.cur !== "8.b").length, 2,
    "the number of skills above year 8 changed without the test being updated");
});
