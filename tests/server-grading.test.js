/* Server-graded question types exist only where both are true (#46,
   docs/adr/0004): the program runs against a server whose grader is up, and
   the administrator has switched server grading on for this pupil. And the
   administrator's switch is the one key of the ceiling where MISSING MEANS
   OFF — every other key is on unless somebody wrote `false`.

   No real type is server-graded yet, so a made-up one stands in. */

import test from "node:test";
import assert from "node:assert/strict";
import { createPolicy, narrowPolicy, sanitisePolicy, serverGradingOn, blankPolicy } from "../src/js/core/policy.js";
import { enabled } from "../src/js/tasks/registry.js";

/** A made-up server-graded type, and an ordinary one beside it. */
const SERVER = { id: "fixture_server", skill: "nafnord", grader: "server" };
const APP = { id: "fill", skill: "nafnord", grader: "app" };

const ceiling = (extra) => ({ ...blankPolicy(), ...extra });

test("a server-graded type is hidden without the server's grader", () => {
  const P = createPolicy(ceiling({ serverGrading: true }), null);            // serverGrader defaults to off
  assert.equal(P.serverGrading, false);
  assert.equal(enabled(P, SERVER), false);
  assert.equal(enabled(createPolicy(ceiling({ serverGrading: true }), null, { serverGrader: false }), SERVER), false);
  assert.equal(enabled(P, APP), true, "the ordinary type is untouched");
});

test("a server-graded type is hidden when the administrator switched it off", () => {
  const P = createPolicy(ceiling({ serverGrading: false }), null, { serverGrader: true });
  assert.equal(enabled(P, SERVER), false);
  assert.equal(enabled(P, APP), true);
});

test("missing means OFF: the one exception to the rule of the ceiling", () => {
  /* The rule everywhere else: a missing key is on. */
  const blank = createPolicy(blankPolicy(), null, { serverGrader: true });
  assert.equal(blank.type("fill"), true, "a type nobody wrote about is on");
  assert.equal(blank.skill("nafnord"), true, "a skill nobody wrote about is on");
  /* …and this key: missing is off, whatever else the ceiling says. */
  for (const allowed of [null, undefined, blankPolicy(), ceiling({ serverGrading: null }),
    ceiling({ serverGrading: "true" }), ceiling({ serverGrading: 1 })]) {
    const P = createPolicy(allowed, null, { serverGrader: true });
    assert.equal(P.serverGrading, false, JSON.stringify(allowed));
    assert.equal(enabled(P, SERVER), false, JSON.stringify(allowed));
    assert.equal(serverGradingOn(allowed, true), false);
  }
  /* sanitising does not fill it in: a ceiling saved without it stays without it */
  assert.equal("serverGrading" in sanitisePolicy({ types: { fill: false } }), false);
  assert.equal(sanitisePolicy({ serverGrading: "yes" }).serverGrading, undefined);
  assert.equal(sanitisePolicy({ serverGrading: true }).serverGrading, true);
  assert.equal(sanitisePolicy({ serverGrading: false }).serverGrading, false);
});

test("shown only with both: the grader up and the switch written true", () => {
  const P = createPolicy(ceiling({ serverGrading: true }), null, { serverGrader: true });
  assert.equal(P.serverGrading, true);
  assert.equal(P.grader("server"), true);
  assert.equal(enabled(P, SERVER), true);
  /* still under every other switch: its skill, its own type switch, a narrowed session */
  const offSkill = createPolicy(ceiling({ serverGrading: true }), { ...blankPolicy(), skills: { nafnord: false } },
    { serverGrader: true });
  assert.equal(enabled(offSkill, SERVER), false);
  assert.equal(enabled(narrowPolicy(P, { skills: ["sagnord"] }), SERVER), false);
  assert.equal(enabled(narrowPolicy(P, { skills: ["nafnord"] }), SERVER), true);
  /* the child's own layer cannot switch it on: it is the ceiling's key only */
  const childTries = createPolicy(blankPolicy(), { ...blankPolicy(), serverGrading: true }, { serverGrader: true });
  assert.equal(enabled(childTries, SERVER), false);
});

test("a policy-like object without `grader` has server grading off", () => {
  const bare = { type: () => true, skill: () => true };
  assert.equal(enabled(bare, SERVER), false);
  assert.equal(enabled(bare, APP), true);
});
