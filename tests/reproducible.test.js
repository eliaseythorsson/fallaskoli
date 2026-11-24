/* The reproducible build (item 80): the pins that make ./build-in-container.sh
   give the same bytes everywhere must not drift apart. Docker itself is not
   run here — this checks what can be checked without it: that the lock covers
   requirements.txt, that the container, the CI and the release agree on the
   versions, and that the build writes no date that changes from day to day. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

const pins = (text) => Object.fromEntries([...text.matchAll(/^([A-Za-z0-9_.-]+)==([^\s\\]+)/gm)]
  .map((m) => [m[1].toLowerCase().replace(/_/g, "-"), m[2]]));

test("the lock pins every grammar library at requirements.txt's version, each by its hash", () => {
  const want = pins(read("requirements.txt"));
  const lock = read("requirements-build.txt");
  const have = pins(lock);
  assert.ok(Object.keys(want).length >= 3);
  for (const [name, ver] of Object.entries(want))
    assert.equal(have[name], ver, `${name}: requirements.txt says ${ver}, the lock ${have[name]}`);
  /* Every requirement in the lock carries a sha256 (pip --require-hashes
     refuses the whole file otherwise, but better to hear it here). */
  const entries = lock.split(/\n(?=[A-Za-z])/).filter((e) => /^[A-Za-z]/.test(e));
  for (const e of entries) assert.match(e, /--hash=sha256:[0-9a-f]{64}/, "no hash: " + e.split("\n")[0]);
  /* What the libraries themselves require is in it too. */
  for (const dep of ["cffi", "pycparser", "filelock", "typing-extensions"]) assert.ok(have[dep], "missing from the lock: " + dep);
});

test("the build container pins the platform, Python, Node and installs only the locked files", () => {
  const df = read("Dockerfile.build");
  const py = /^ARG PYTHON_IMAGE=python:(\d+\.\d+\.\d+)-slim-bookworm/m.exec(df);
  const node = /^ARG NODE_IMAGE=node:(\d+\.\d+\.\d+)-bookworm-slim/m.exec(df);
  assert.ok(py, "Python must be an exact version (X.Y.Z)");
  assert.ok(node, "Node must be an exact version (X.Y.Z)");
  const froms = df.split("\n").filter((l) => /^FROM /.test(l));
  assert.equal(froms.length, 2);
  for (const f of froms) assert.match(f, /--platform=linux\/amd64/, "every stage on x86_64: " + f);
  assert.match(df, /pip install[^\n]*\\\n[^\n]*--require-hashes --only-binary=:all: -r \/tmp\/requirements-build\.txt/);
  assert.match(df, /PYTHONHASHSEED=0/);
  /* The lock is for the Python the image has. */
  assert.match(read("requirements-build.txt"), new RegExp(`CPython ${py[1].split(".").slice(0, 2).join("\\.")}`));
  /* The image's build context lets the lock in (its own .dockerignore). */
  const ign = read("Dockerfile.build.dockerignore");
  assert.match(ign, /^\*$/m);
  assert.match(ign, /^!requirements-build\.txt$/m);
  /* The CI and the release run the same Node, so the icons' bytes agree. */
  for (const wf of [".github/workflows/ci.yml", ".github/workflows/release.yml"]) {
    const versions = [...read(wf).matchAll(/node-version:\s*([^\s#]+)/g)].map((m) => m[1]);
    assert.ok(versions.length >= 1, wf);
    for (const v of versions) assert.equal(v, node[1], `${wf} runs Node ${v}, the build container ${node[1]}`);
  }
  /* Its own workflow since 24 Nov 2026, run when a PR touches the data. */
  const rep = read(".github/workflows/reproducible.yml");
  assert.match(rep, /\.\/build-in-container\.sh/, "CI must run the container build");
  for (const p of ["content/**", "pipeline/**", "data/**", "sources/**", "build.sh"])
    assert.ok(rep.includes(`"${p}"`), `reproducible.yml must run when ${p} changes`);
  const wrapper = fs.statSync(path.join(ROOT, "build-in-container.sh"));
  assert.ok(wrapper.mode & 0o100, "build-in-container.sh must be executable");
});

test("the licence list keeps its date when nothing in it changed, so a rebuild is byte-identical", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fallaskoli-lic-"));
  try {
    const f = path.join(dir, "licenses.js");
    fs.copyFileSync(path.join(ROOT, "data/licenses.js"), f);
    const before = fs.readFileSync(f);
    /* Another day, another machine: nothing changes. */
    const run = () => execFileSync(process.execPath, [path.join(ROOT, "tools/licenses.mjs"), f],
      { cwd: ROOT, env: { ...process.env, SOURCE_DATE_EPOCH: "86400" }, stdio: "pipe" });
    run();
    assert.ok(fs.readFileSync(f).equals(before), "the date moved although the list did not change");
    /* A list that DID change gets a new date — SOURCE_DATE_EPOCH's. */
    fs.writeFileSync(f, before.toString().replace(/"ver": "[^"]+"/, '"ver": "0.0.0"'));
    run();
    assert.match(fs.readFileSync(f, "utf8"), /"built": "1970-01-02"/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
