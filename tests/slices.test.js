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
import { SLICES, checkSlices, withoutOwnText, keepOwnText } from "../src/js/core/slices.js";
import { fullProgress, TODAY } from "./fixtures/full-progress.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FIXTURE = "tests/fixtures/full-progress.js";

/* Where a slice's code is: the module that exports its description. */
const homes = new Map();
for (const f of fs.readdirSync(path.join(ROOT, "src/js/core")).filter((x) => x.endsWith(".js"))) {
  const mod = await import(path.join(ROOT, "src/js/core", f));
  for (const v of Object.values(mod)) if (SLICES.includes(v)) homes.set(v.key, "src/js/core/" + f);
}
const fileFor = (key, stage) => `${homes.get(key) || "its module"} (\`${key}\` slice, ${stage}())`;

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
     when only the other one changed them (`thisDevice`, core/slicerules.js:
     what the `{ ...R, ...L }` at the top of mergeStates gave them before they
     were slices). Found by this test; kept as they were, since #49 and #50
     are pure moves — the PR for #50 lists them for the owner to decide. */
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

test("every slice is described in the module that owns it (#50)", () => {
  const homeless = SLICES.filter((s) => !homes.has(s.key)).map((s) => s.key);
  assert.deepEqual(homeless, [], "a slice in SLICES that no module under src/js/core exports");
});

test("a list that is not whole is refused at load", () => {
  const ok = { key: "x", blank: () => 0, migrate: () => 0, merge: () => 0, clean: () => 0, ownText: false };
  assert.doesNotThrow(() => checkSlices([ok]));
  assert.throws(() => checkSlices([ok, { ...ok }]), /"x" is in the list twice/);
  assert.throws(() => checkSlices([{ ...ok, merge: undefined }]), /"x" has no merge\(\)/);
  assert.throws(() => checkSlices([{ ...ok, ownText: undefined }]), /"x" must say ownText/);
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

/* A slice that is retired leaves its key in every copy saved before. #10
   retired `vocab` (the days each vocabulary item was last asked, read only by
   the gate core/spacing.js, which #10 deleted). Such a copy must still load,
   merge and pass the server, with everything else kept and the old key gone. */
test("a retired slice (vocab, #10) is dropped everywhere, and the rest of an old copy is kept", () => {
  const old = () => ({ ...fullProgress(), vocab: {
    "samheiti:frábær|stórkostlegur|æðislegur|lo": { n: 1, dates: ["2026-11-17"], first: "2026-11-17", last: "2026-11-17" },
    "hestur|kk": { n: 2, dates: ["2026-11-17", "2026-11-19"], first: "2026-11-17", last: "2026-11-19" },
  } });
  const loaded = migrate(old());
  assert.equal("vocab" in loaded, false, "migrate keeps the old key");
  none(compare("migrate(old copy with vocab)", "migrate", loaded, fullProgress(), { purpose: ON_PURPOSE.migrate }));
  /* mergeStates passes a key that is no slice through (it follows this
     device); what is merged is loaded before it is used, and that drops it. */
  const merged = migrate(mergeStates(old(), migrate(old()), old()));
  assert.equal("vocab" in merged, false, "a merged copy keeps the old key once loaded");
  const cleaned = cleanState(old(), { today: TODAY });
  assert.equal("vocab" in cleaned, false, "cleanState stores the old key");
  none(compare("cleanState(old copy with vocab)", "clean", cleaned, fullProgress(), { purpose: ON_PURPOSE.clean }));
});

test("the word cards are the one slice with the pupil's own text; the helpers take it out and keep it", () => {
  assert.deepEqual(SLICES.filter((s) => s.ownText).map((s) => s.key), ["wordCards"],
    "another slice with ownText: true — check that tests/owntext.test.js and docs/PRIVACY.md §1g name it");
  const F = fullProgress();
  const shown = withoutOwnText(F);
  assert.equal("wordCards" in shown, false, "what others are shown has no word cards");
  assert.deepEqual({ ...shown, wordCards: F.wordCards }, F, "and nothing else is taken out");
  assert.equal("wordCards" in F, true, "withoutOwnText must not change what it is given");
  /* A write by somebody else: the stored cards stay, whatever it carries. */
  assert.deepEqual(keepOwnText({ ...fullProgress(), wordCards: {} }, F), F);
  assert.deepEqual(keepOwnText(fullProgress(), null), { ...F, wordCards: {} });
  /* Progress with no own text in it is handed on as it is. */
  const { wordCards, ...rest } = F;
  assert.equal(withoutOwnText(rest), rest);
});
