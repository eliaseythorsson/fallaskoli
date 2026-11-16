/* tools/load-test.mjs (item 68) drives the real server through every route a
   pupil and a teacher use. If a route is renamed or its shape changes, the
   script would quietly measure errors; this runs it small and fast, so the
   tool stays able to answer "how many pupils?" when it is next needed. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("the load test runs against the real server: six pupils, every route, no errors", async () => {
  const out = await new Promise((resolve, reject) => execFile(process.execPath,
    [path.join(ROOT, "tools/load-test.mjs"), "--pupils", "6", "--seconds", "6", "--arrive", "1",
      "--think", "0.4", "--class", "6", "--states", "blank"],
    { cwd: ROOT, timeout: 240000 }, (err, stdout, stderr) => (err ? reject(new Error(stderr || err.message)) : resolve(stdout))));
  assert.match(out, /── 6 pupils/);
  assert.match(out, /errors 0\b/, out);
  for (const kind of ["save state", "page load \\(all 11\\)", "board", "class goal", "assignments",
    "calibration counts", "assignment result", "login", "teacher: class"])
    assert.match(out, new RegExp("^  " + kind + " ", "m"), "never exercised: " + kind + "\n" + out);
  /* Whether it HELD is a measurement, and this runs beside the rest of the
     suite on a busy machine: only that a verdict was reached. */
  assert.match(out, /verdict: (HELD|DID NOT HOLD)/, out);
});
