/* One helper, one place (review of v6.13, S11).
 *
 * The UTC day key was written four times (the server, the calibration, the
 * assignment rules, the teacher's screen); the two exercise builders had a
 * level function each; core/mix.js and core/today.js exported names nothing
 * imported. These tests keep it that way. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { utcDay } from "../src/js/core/calendar.js";
import * as MIX from "../src/js/core/mix.js";
import * as TODAY from "../src/js/core/today.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

test("utcDay: the UTC day of milliseconds or a Date, now by default", () => {
  const t = Date.parse("2026-11-16T23:59:59.999Z");
  assert.equal(utcDay(t), "2026-11-16");
  assert.equal(utcDay(t + 1), "2026-11-17");
  assert.equal(utcDay(new Date(t)), "2026-11-16");
  assert.equal(utcDay(), new Date().toISOString().slice(0, 10));
});

test("the UTC day is defined once: the server, the calibration, the assignment rules and the teacher's screen import it", () => {
  for (const f of ["server/server.mjs", "server/calibrate.mjs", "src/js/core/assignment.js", "src/js/ui/teacher.js"]) {
    const src = read(f);
    assert.doesNotMatch(src, /const dayOf = \([^)]*\) =>/, `${f} defines its own dayOf`);
    assert.match(src, /utcDay/, `${f} does not use core/calendar.js utcDay`);
  }
});

test("one level function for the exercise builder's sentences", () => {
  const py = read("pipeline/build_exercises.py");
  assert.equal((py.match(/^def sentence_level\(/gm) || []).length, 1);
  assert.doesNotMatch(py, /^def (length|frame)_level\(/m);
});

/* Every file the program, the tests and the tools are made of. */
function sources() {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(new URL("../" + dir, import.meta.url), { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) { if (e.name !== "node_modules") walk(p); }
      else if (/\.(m?js)$/.test(e.name)) out.push(p);
    }
  };
  ["src", "server", "tests", "tools"].forEach(walk);
  return out;
}

test("core/mix.js and core/today.js export only what something imports", () => {
  const files = sources();
  for (const [mod, M] of [["core/mix.js", MIX], ["core/today.js", TODAY]]) {
    const users = files.filter((f) => !f.endsWith(mod) && f !== "tests/shared-helpers.test.js")
      .map(read).filter((src) => src.includes(mod));
    for (const name of Object.keys(M)) {
      const used = users.some((src) => new RegExp(`\\b${name}\\b`).test(src));
      assert.ok(used, `${mod} exports ${name}, which nothing imports`);
    }
  }
});

/* Review of v6.13, S15: item 79 moved the Python build to pipeline/ (and the
   frequency list and the dictionary to sources/, the build's JSON to data/).
   Comments name them by the path they have now, as they name every other
   file (core/mix.js, server/writing.mjs). tasks/ordaford.js is left to the
   branch that is rewriting it (fix/review-content) and is fixed after it. */
test("comments name the Python modules by their path under pipeline/", () => {
  const MODULES = "adj_classes|build_bundle|build_exercises|build_freq|build_lexicon|build_sentences|content_io|" +
    "definitions|exercises|government|irregularity|noun_classes|parse_guard|parse_overrides|phrases|sentences|vocab_filter";
  const bare = new RegExp(`(?<![\\w/.-])(${MODULES})\\.py\\b`);
  const LATER = new Set(["src/js/tasks/ordaford.js"]);
  const found = [];
  for (const f of sources()) {
    if (LATER.has(f) || f === "tests/shared-helpers.test.js") continue;
    read(f).split("\n").forEach((line, k) => {
      if (bare.test(line) && !/sys\.argv/.test(line)) found.push(`${f}:${k + 1}`);
    });
  }
  assert.deepEqual(found, []);
});
