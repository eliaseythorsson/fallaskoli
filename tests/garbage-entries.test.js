/* A saved progress file that has been damaged or tampered with must never
   crash a load (`migrate`) or a server request (`cleanState`). Here every
   entry of every record map in a full state is replaced, one at a time, by
   something that is not a record: null, a number, a string, an array. Each
   case must load without throwing, and only the bad entry may be lost. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { migrate } from "../src/js/core/state.js";
import { cleanState } from "../server/guard.mjs";
import { fullProgress, TODAY } from "./fixtures/full-progress.js";

const BAD = [null, 7, "x", [], true];

/** Every path to an entry of a plain-object map, down to depth 3. */
function entryPaths(v, path = [], out = []) {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    for (const k of Object.keys(v)) {
      const p = [...path, k];
      out.push(p);
      if (p.length < 3) entryPaths(v[k], p, out);
    }
  }
  return out;
}

function withBad(S, path, bad) {
  const c = structuredClone(S);
  let o = c;
  for (const k of path.slice(0, -1)) o = o[k];
  o[path[path.length - 1]] = bad;
  return c;
}

test("garbage entries inside any record map never make migrate or cleanState throw", () => {
  const S = fullProgress();
  const paths = entryPaths(S);
  assert.ok(paths.length > 50, "the fixture should give many entries to damage");
  const failures = [];
  for (const path of paths) for (const bad of BAD) {
    const dirty = withBad(S, path, bad);
    const where = `${path.join(".")} = ${JSON.stringify(bad)}`;
    for (const [name, f] of [["migrate", () => migrate(structuredClone(dirty))],
      ["cleanState", () => cleanState(structuredClone(dirty), { today: TODAY })]]) {
      try { f(); } catch (e) { failures.push(`${name}: ${where}: ${e.message}`); }
    }
  }
  assert.deepEqual(failures.slice(0, 400), [], `${failures.length} failures`);
});

test("a null day record is dropped and the other days are kept", () => {
  const S = fullProgress();
  const days = Object.keys(S.days);
  assert.ok(days.length >= 2);
  const [bad, ...good] = days;
  S.days[bad] = null;
  for (const out of [migrate(structuredClone(S)), cleanState(structuredClone(S), { today: TODAY })]) {
    assert.ok(!(bad in out.days), "the null day is gone");
    for (const k of good) if (k in migrate(fullProgress()).days) assert.ok(k in out.days, `day ${k} kept`);
  }
});
