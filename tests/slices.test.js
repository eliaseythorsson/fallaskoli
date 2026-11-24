/* The safety net under the saved state (issue #49; core/slices.js explains).

   `migrate` starts from a blank state and copies only the slices it knows. A
   slice forgotten there — or in the merge, or in the server's check — is
   silently deleted every time progress is loaded. These tests take progress
   with EVERY slice filled (tests/fixtures/full-progress.js), send it through
   all four places, and fail if any slice comes out missing or emptied. The
   message names the slice and the file to fix.

   A slice in `blankState` that the fixture does not fill fails too, so a new
   slice cannot skip this test. */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { blankState, migrate } from "../src/js/core/state.js";
import { mergeStates } from "../src/js/core/merge.js";
import { cleanState } from "../server/guard.mjs";
import { SLICES, isSlice, checkSlices, assembleBlank, withoutOwnText, keepOwnText } from "../src/js/core/slices.js";
import { fullProgress, TODAY } from "./fixtures/full-progress.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FIXTURE = "tests/fixtures/full-progress.js";

/* Where a slice's code is: the module that exports its description, or —
   for a slice not converted yet (#50) — the place its line still is. */
const homes = new Map();
for (const f of fs.readdirSync(path.join(ROOT, "src/js/core")).filter((x) => x.endsWith(".js"))) {
  const mod = await import(path.join(ROOT, "src/js/core", f));
  for (const v of Object.values(mod)) if (SLICES.includes(v)) homes.set(v.key, "src/js/core/" + f);
}
const STAGE = {
  blank: "src/js/core/state.js `blankState`",
  migrate: "src/js/core/state.js `migrate`",
  merge: "src/js/core/merge.js `mergeStates`",
  clean: "server/guard.mjs `cleanState`",
};
const fileFor = (key, stage) => {
  const s = SLICES.find((x) => x.key === key);
  if (s && isSlice(s)) return `${homes.get(key) || "its module"} (\`${key}\` slice, ${stage}())`;
  return STAGE[stage];
};

/** Nothing in it: no number but 0, no text, no list, no object with anything in it. */
const emptied = (v) => v == null || v === 0 || v === "" || v === false ||
  (Array.isArray(v) ? v.length === 0 : typeof v === "object" && Object.values(v).every(emptied));
const same = (a, b) => { try { assert.deepStrictEqual(a, b); return true; } catch { return false; } };

/* What a stage changes ON PURPOSE, slice by slice, and why. Anything not
   named here must come out of a stage exactly as it went in. */
const ON_PURPOSE = {
  migrate: {
    run: "a run of right answers does not outlive a load (`S.run = 0` in migrate)",
  },
  clean: {
    run: "as in migrate",
    profile: "the server writes the name from the account, never from the upload (PUT /state)",
  },
  /* merge(base=blank, local=blank, remote=F): these follow THIS device even
     when only the other one changed them — the `{ ...R, ...L }` at the top
     of mergeStates, for keys that have no line of their own there. Found by
     this test; behaviour kept as it is (#49 is a pure refactor). #50 decides
     each one when it converts the slice. */
  mergeFromRemote: {
    profile: "this device's id and name; the server writes both from the account anyway",
    multiSessionRun: "the other device's run of multi-skill sessions is not taken (#50)",
    lastSessionSkills: "as multiSessionRun (#50)",
    social: "the other device's memory of who was ahead this week is not taken (#50)",
  },
};

/** Every slice of `out` against the fixture: equal unless `ON_PURPOSE` says
    otherwise, and never missing or emptied. Returns the failures. */
function compare(what, stage, out, want, { exact = true, purpose = {} } = {}) {
  const bad = [];
  for (const key of Object.keys(blankState())) {
    const where = fileFor(key, stage);
    if (!(key in out)) bad.push(`${what}: the slice "${key}" is MISSING — fix ${where}`);
    else if (key in purpose) continue;
    else if (emptied(out[key]) && !emptied(want[key])) bad.push(`${what}: the slice "${key}" came out EMPTIED — fix ${where}`);
    else if (exact && !same(out[key], want[key]))
      bad.push(`${what}: the slice "${key}" CHANGED — fix ${where}, or say why in ON_PURPOSE in tests/slices.test.js\n` +
        `      in:  ${JSON.stringify(want[key]).slice(0, 160)}\n      out: ${JSON.stringify(out[key]).slice(0, 160)}`);
  }
  return bad;
}
const none = (bad) => assert.deepEqual(bad, [], "\n  " + bad.join("\n  "));

test("the list names every key of blankState, in order, and each slice is whole", () => {
  checkSlices();
  assert.deepEqual(Object.keys(blankState()), SLICES.map((s) => s.key),
    "blankState and SLICES in src/js/core/slices.js must name the same keys in the same order");
});

test("blankState refuses a key the list does not name (the trap, caught where it is made)", () => {
  const legacy = Object.fromEntries(SLICES.filter((s) => !isSlice(s)).map((s) => [s.key, 0]));
  assert.doesNotThrow(() => assembleBlank(legacy));
  assert.throws(() => assembleBlank({ ...legacy, wordCards: {} }), /wordCards.*core\/slices\.js/);
  assert.throws(() => assembleBlank({ ...legacy, review: {} }), /review.*converted/);
  const first = Object.keys(legacy)[0];
  if (first) {
    const { [first]: _, ...short } = legacy;
    assert.throws(() => assembleBlank(short), new RegExp(`"${first}"`));
  }
});

test(`the fixture fills every slice of blankState (${FIXTURE})`, () => {
  const blank = blankState(), F = fullProgress(), bad = [];
  for (const key of Object.keys(blank)) {
    if (!(key in F)) bad.push(`"${key}" is in blankState but not in ${FIXTURE}: give it realistic data there`);
    else if (emptied(F[key])) bad.push(`"${key}" is empty in ${FIXTURE}: fill it`);
    /* `v` is the version, the same in every state. */
    else if (key !== "v" && same(F[key], blank[key])) bad.push(`"${key}" in ${FIXTURE} is what a new pupil has: fill it`);
  }
  for (const key of Object.keys(F))
    if (!(key in blank)) bad.push(`"${key}" is in ${FIXTURE} but not in blankState: is it a slice? add it to src/js/core/slices.js`);
  none(bad);
});

test("migrate keeps every slice", () => {
  none(compare("migrate", "migrate", migrate(fullProgress()), fullProgress(), { purpose: ON_PURPOSE.migrate }));
  /* And loading twice is loading once. */
  const once = migrate(fullProgress());
  none(compare("migrate twice", "migrate", migrate(structuredClone(once)), once));
});

test("merge keeps every slice: with a base, and in both directions", () => {
  const F = () => migrate(fullProgress()), blank = () => blankState();
  const bad = [
    /* Nothing changed anywhere since the base: nothing may move. */
    ...compare("merge(base=F, local=F, remote=F)", "merge", mergeStates(F(), F(), F()), F()),
    /* All the work on this device; the server's copy is the base: this device's whole. */
    ...compare("merge(base=blank, local=F, remote=blank)", "merge", mergeStates(blank(), F(), blank()), F()),
    /* All the work on the other device: the server's whole. */
    ...compare("merge(base=blank, local=blank, remote=F)", "merge", mergeStates(blank(), blank(), F()), F(),
      { purpose: ON_PURPOSE.mergeFromRemote }),
    /* No common past (`base` null): what is chosen may follow this device,
       but nothing either side has may come out missing or emptied. */
    ...compare("merge(base=null, local=F, remote=blank)", "merge", mergeStates(null, F(), blank()), F(), { exact: false }),
    ...compare("merge(base=null, local=F, remote=F)", "merge", mergeStates(null, F(), F()), F(), { exact: false }),
  ];
  none(bad);
});

test("the server's check (cleanState) keeps every slice", () => {
  const out = cleanState(fullProgress(), { today: TODAY });
  none(compare("cleanState", "clean", out, fullProgress(), { purpose: ON_PURPOSE.clean }));
  /* Checking twice is checking once. */
  none(compare("cleanState twice", "clean", cleanState(structuredClone(out), { today: TODAY }), out));
});

test("the whole round: merge, then load, then the server", () => {
  const F = () => migrate(fullProgress());
  const out = cleanState(migrate(mergeStates(F(), F(), F())), { today: TODAY });
  none(compare("cleanState(migrate(merge(F, F, F)))", "clean", out, fullProgress(), { purpose: ON_PURPOSE.clean }));
});

test("no slice holds the pupil's own text yet; the helpers leave such progress alone", () => {
  assert.deepEqual(SLICES.filter((s) => s.ownText).map((s) => s.key), [],
    "a slice with ownText: true — check that tests/owntext.test.js and docs/PRIVACY.md §1g name it");
  const F = fullProgress();
  assert.equal(withoutOwnText(F), F, "with no own text there is nothing to take out");
  assert.deepEqual(keepOwnText(fullProgress(), null), F);
});
