/* The browser-driving test tools themselves (review of v6.13, S10).
 *
 * The merge of 27b and 28 (f916e08) left the "tabs at 360px" section of
 * tools/browser-test.mjs in twice: the same checks, run twice, one copy
 * waiting to drift from the other. A merge that duplicates a section copies
 * its heading comment with it, so each top-level comment (one that starts a
 * line, outside any block) must be there once. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

for (const f of ["tools/browser-test.mjs", "tools/server-test.mjs", "tools/tour-test.mjs"]) {
  test(`${f}: every top-level section is there once`, () => {
    const heads = readFileSync(new URL("../" + f, import.meta.url), "utf8").split("\n")
      .filter((l) => l.startsWith("/*") && l.trim().length > 20);
    const twice = heads.filter((h, i) => heads.indexOf(h) !== i);
    assert.deepEqual(twice, [], `${f} has a section twice`);
    assert.ok(heads.length > 10, "no sections found: the test proves nothing");
  });
}

test("tools/browser-test.mjs checks the tabs at 360px once", () => {
  const src = readFileSync(new URL("../tools/browser-test.mjs", import.meta.url), "utf8");
  assert.equal(src.split("tabs at 360px").length - 1, 1);
});
