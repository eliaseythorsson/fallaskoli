/* Test accounts stay out of the repository (item 81).

   `_prufa/` and `server/data/` hold test users, their password hashes and
   their progress, and test-together.sh used to write a demo-accounts.txt with
   passwords. None of it may ever be tracked by git. These tests ask git itself
   (`git ls-files`), so they fail the day someone runs `git add -f`, and they
   hold the ignore files and the test script to the rule as well. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** Tracked files, or null when this is not a git checkout (a zip, a container). */
function tracked() {
  try {
    return execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .split("\0").filter(Boolean);
  } catch { return null; }
}
const files = tracked();
const skip = files ? false : "not a git checkout";

test("no personal-data folder or demo-accounts file is tracked", { skip }, () => {
  const bad = files.filter((f) =>
    /^(server\/data|_prufa|_backup|_to_delete|dist)\//.test(f) ||
    /(^|\/)demo-accounts[^/]*$/i.test(f) ||
    /(^|\/)users\.json$/.test(f) ||
    /(^|\/)(sessions|invites)\.json$/.test(f));
  assert.deepEqual(bad, []);
});

test("no tracked file holds a password hash", { skip }, () => {
  /* server/auth.mjs stores scrypt output: a 64-byte key as 128 hex characters
     beside a salt, under the keys "salt" and "hash". */
  const hex128 = /\b[0-9a-f]{128}\b/i;
  const saltAndHash = /"salt"\s*:\s*"[0-9a-f]{16,}"[\s\S]{0,40}"hash"\s*:\s*"[0-9a-f]{32,}"|"hash"\s*:\s*"[0-9a-f]{32,}"[\s\S]{0,40}"salt"\s*:/i;
  const found = [];
  for (const f of files) {
    if (/\.(png|jpe?g|gif|ico|woff2?|zip|gz|xml)$/i.test(f)) continue;
    const full = path.join(ROOT, f);
    let st; try { st = fs.statSync(full); } catch { continue; }   // deleted in the work tree
    if (!st.isFile() || st.size > 8e6) continue;
    const text = fs.readFileSync(full, "utf8");
    if (hex128.test(text) || saltAndHash.test(text)) found.push(f);
  }
  assert.deepEqual(found, []);
});

test("the ignore files keep personal data out of git and out of the image", () => {
  const ignored = (name, line) => fs.readFileSync(path.join(ROOT, name), "utf8")
    .split("\n").map((l) => l.trim()).some((l) => l === line || l === line.replace(/^\//, ""));
  for (const dir of ["/server/data/", "/_prufa/"]) assert.ok(ignored(".gitignore", dir), `.gitignore lacks ${dir}`);
  assert.ok(ignored(".dockerignore", "server/data"), ".dockerignore lacks server/data");
  assert.ok(ignored(".dockerignore", "_prufa"), ".dockerignore lacks _prufa");
});

test("test-together.sh writes test accounts outside the project", () => {
  const sh = fs.readFileSync(path.join(ROOT, "test-together.sh"), "utf8");
  assert.ok(/mktemp -d/.test(sh), "the test folder should come from mktemp -d");
  /* Executable lines (not the explanatory comments) never name a path inside the project. */
  const code = sh.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
  assert.ok(!/_prufa/.test(code), "test-together.sh still writes to _prufa/");
  assert.ok(!/\$PWD\/(_prufa|server\/data)/.test(code), "test data must not live under $PWD");
  assert.ok(/inside the project/.test(sh), "the script should refuse a test folder inside the project");
});
