/* A saved progress file loads, merges and is checked by the server exactly
   as it was before the slices moved (issue #50, acceptance criterion).

   tests/fixtures/saved-progress.json is one simulated pupil on two devices
   (tools/sim/progress-fixture.mjs says how it was made; nobody's real
   progress is in it). tests/fixtures/saved-progress.expected.json is what
   main's code made of it BEFORE #50 moved every slice out of state.js,
   merge.js and guard.mjs. This test holds the output to it byte for byte:
   the same values, and the keys in the same order, in every slice.

   If a change is MEANT to change what is saved, write the expected file
   again (`node tools/sim/progress-fixture.mjs expected`) and say in the PR
   what moved and why. */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { outputs } from "./fixtures/saved-progress.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures", f), "utf8"));
const fixture = read("saved-progress.json");
const expected = read("saved-progress.expected.json");
const got = await outputs(ROOT, fixture);

test("the fixture is a pupil's real-shaped progress, not a blank one", () => {
  for (const k of ["base", "local", "remote"]) {
    assert.ok(Object.keys(fixture[k].days).length >= 10, `${k}: days`);
    assert.ok(fixture[k].review.items.length > 0 && Object.keys(fixture[k].byType).length > 0, `${k}: practice`);
    assert.deepEqual(fixture[k].profile, { id: "local", name: "" }, `${k}: no name and no id in the fixture`);
  }
});

for (const name of Object.keys(expected)) {
  test(`saved progress: ${name} is byte for byte what it was`, () => {
    if (JSON.stringify(got[name]) === JSON.stringify(expected[name])) return;
    /* Name the slices that moved, then show the difference. */
    const moved = Object.keys({ ...expected[name], ...got[name] })
      .filter((k) => JSON.stringify(got[name][k]) !== JSON.stringify(expected[name][k]));
    assert.deepStrictEqual(got[name], expected[name], `${name}: ${moved.length ? "the slices " + moved.join(", ") + " changed" : "the order of the keys changed"}`);
    assert.fail(`${name}: the order of the keys changed`);
  });
}
