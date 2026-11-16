/* The documents must not state what goes stale (item 77), and must not name
   files that are gone.

   README.md named `fallaskoli-v6.11.html` and 505 tests when package.json said
   6.12.0 and the suite had 513. The cure is to state neither: the version is in
   package.json (tools/version.mjs reads it), the file is
   `dist/fallaskoli-v<version>.html`, and the test count is whatever
   `node --test` prints. These tests hold the documents to that, and check that
   every file a document names in backticks exists. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DOCS = ["README.md", ...fs.readdirSync(path.join(ROOT, "docs")).filter((f) => f.endsWith(".md")).map((f) => "docs/" + f)];
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

test("no document names a built file with a version, or counts tests", () => {
  const bad = [];
  for (const f of DOCS) {
    read(f).split("\n").forEach((line, i) => {
      if (/fallaskoli-v\d+\.\d+/.test(line)) bad.push(`${f}:${i + 1} names a versioned file: ${line.trim().slice(0, 80)}`);
      if (/\b\d[\d,.]*\s+(unit\s+)?tests\b/i.test(line)) bad.push(`${f}:${i + 1} states a test count: ${line.trim().slice(0, 80)}`);
    });
  }
  assert.deepEqual(bad, []);
});

test("every file a document names in backticks exists", () => {
  /* Roots a short name may be relative to: the program's modules are written
     as `core/answer.js` or `tasks/review.js`, the server's as `server.mjs`. */
  const BASES = ["", "src/", "src/js/", "src/js/core/", "src/js/ui/", "src/js/tasks/", "src/js/content/", "server/", "tools/", "tests/", "docs/", "data/", ".github/workflows/"];
  const exists = (p) => BASES.some((b) => fs.existsSync(path.join(ROOT, b, p)));
  /* Files the server or the build writes while it runs; they are in no checkout. */
  const RUNTIME = new Set(["index.html", "groups.json", "teamduels.json", "samples.json",
    "calibration.json", "calibration-quota.json",
    "users.json", "writing.json"]);                       // items 45, 46
  const missing = [];
  for (const f of DOCS) {
    const seen = new Set();
    for (const m of read(f).matchAll(/`([A-Za-z0-9_./-]+\.(?:js|mjs|py|sh|md|json|html|yml|txt|command))`/g)) {
      const p = m[1];
      if (seen.has(p) || p.includes("*")) continue;
      seen.add(p);
      if (/^(data\/(ino|data_bundle)|dist\/|server\/data\/|_prufa\/)/.test(p) && !fs.existsSync(path.join(ROOT, p))) continue; // built or private
      if (RUNTIME.has(p.replace(/^\//, ""))) continue;
      if (!exists(p)) missing.push(`${f}: ${p}`);
    }
  }
  assert.deepEqual(missing, []);
});
