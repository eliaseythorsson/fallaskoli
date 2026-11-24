/* #43: tools/word-history.mjs prints one word's history and its status with
   the reason, from an exported progress file. Run on a fixture. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { wordHistory, progressOf } from "../tools/word-history.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const TOOL = join(ROOT, "tools/word-history.mjs");
const FIXTURE = join(ROOT, "tests/fixtures/word-history-export.json");
const run = (...args) => spawnSync(process.execPath, [TOOL, ...args], { encoding: "utf8" });

test("the command prints a word's entries and its status with the reason", () => {
  const r = run(FIXTURE, "hugsa|so");
  assert.equal(r.status, 0, r.stderr);
  const lines = r.stdout.split("\n");
  assert.equal(lines[0], "hugsa|so");
  assert.match(r.stdout, /health {3}shaky \(Óstöðugt\): 2 af síðustu 6 rétt, undir 50%/);
  assert.match(r.stdout, /entries {2}6: 1 right, 4 wrong, 1 seen/);
  assert.match(r.stdout, /rescue {3}1 passed, 0 endured, last 2026-11-19/);
  const rows = lines.filter((l) => /^ {2}2026-/.test(l));
  assert.equal(rows.length, 6);
  assert.match(rows[0], /^ {2}2026-11-17 {2}verbslot +wrong +no +Sögn í setningu$/);
  assert.match(rows[3], /^ {2}2026-11-18 {2}meaning +seen +no +/);
  assert.match(rows[4], /^ {2}2026-11-19 {2}verbslot +right /);
});

test("a lemma finds every word class it is saved under", () => {
  const r = run(FIXTURE, "hestur");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^hestur\|kk$/m);
  assert.match(r.stdout, /^hestur\|lo$/m);
  assert.match(r.stdout, /strong \(Á valdi þínu\): 9 af síðustu 10 rétt, 80% eða meira/);
  assert.match(r.stdout, /new \(Nýtt\): aðeins 1 svar, of fá til að meta/);
});

test("--json gives the same for a script", () => {
  const r = run(FIXTURE, "hugsa|so", "--json");
  assert.equal(r.status, 0, r.stderr);
  const h = JSON.parse(r.stdout);
  assert.equal(h.words.length, 1);
  const w = h.words[0];
  assert.deepEqual({ status: w.health.status, why: w.health.why },
    { status: "shaky", why: "2 af síðustu 6 rétt, undir 50%" });
  assert.deepEqual(w.entries[0], { day: "2026-11-17", type: "verbslot", name: "Sögn í setningu",
    outcome: "wrong", recall: false });
  assert.deepEqual(w.totals, { c: 1, w: 4 });
});

test("a word not in the progress: a message and exit code 1; no arguments: usage", () => {
  const r = run(FIXTURE, "köttur");
  assert.equal(r.status, 1);
  assert.match(r.stdout, /No word "köttur"/);
  assert.equal(run().status, 2);
});

test("the bare progress a device exports reads the same as the account export", () => {
  const file = JSON.parse(readFileSync(FIXTURE, "utf8"));
  assert.deepEqual(wordHistory(file.progress, "hugsa|so"), wordHistory(file, "hugsa|so"));
  const dir = mkdtempSync(join(tmpdir(), "wh-"));
  writeFileSync(join(dir, "bare.json"), JSON.stringify(file.progress));
  assert.match(run(join(dir, "bare.json"), "hugsa|so").stdout, /health {3}shaky/);
});

test("an export without progress, and progress saved before word knowledge", () => {
  assert.throws(() => progressOf({ account: {}, exportedAt: "x", progress: null }), /holds no progress/);
  const file = JSON.parse(readFileSync(FIXTURE, "utf8"));
  const old = { ...file.progress, v: 11 };
  const h = wordHistory(old, "hugsa|so");
  assert.equal(h.reset, true);
  /* As the app loads it: no entries, and the record without its short history. */
  assert.deepEqual(h.words[0].entries, []);
  assert.equal(h.words[0].record.recent, "");
  assert.equal(h.words[0].health.why, "33% rétt, 6 svör alls, undir 50%");
});
