/* The switches in the Stillingar og námsefni tab have to mean what they say.

   This test came out of a bug: a noun cloze could add an adjective and switch
   itself into the adjective skill, so material that was turned off appeared
   anyway. The test runs each skill on its own.                          */

import { test } from "node:test";
import assert from "node:assert/strict";
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, newSession } from "../src/js/core/state.js";
import { nextTask } from "../src/js/tasks/index.js";
import { SKILLS, SKILL_IDS } from "../src/js/core/skills.js";

const lex = buildLexicon(DATA);

function onlyContext(id) {
  const S = blankState();
  SKILL_IDS.forEach((x) => { S.enabled[x] = x === id; });
  return { lex, S, sess: newSession(S), forcedNoun: null };
}

for (const s of SKILLS) {
  test(`only ${s.nm}: no other material slips through`, () => {
    const ctx = onlyContext(s.id);
    const seen = new Set();
    let produced = 0;
    for (let i = 0; i < 300; i++) {
      const t = nextTask(ctx);
      if (!t) continue;
      produced++;
      seen.add(t.skill);
    }
    /* Some skills have no builder of their own yet (e.g. if data is
       missing); they may return nothing, but they must not return OTHER
       material.
       */
    const stray = [...seen].filter((x) => x !== s.id);
    assert.deepEqual(stray, [], `${s.id} hleypti í gegn: ${stray.join(", ")}`);
    if (produced) assert.ok(seen.has(s.id));
  });
}

test("every skill can produce a task when it is switched on", () => {
  const empty = [];
  for (const s of SKILLS) {
    const ctx = onlyContext(s.id);
    let got = false;
    for (let i = 0; i < 200 && !got; i++) got = !!nextTask(ctx);
    if (!got) empty.push(s.id);
  }
  assert.deepEqual(empty, [], "these skills produce no task: " + empty.join(", "));
});
