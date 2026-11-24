/* The type check stays switched on (critique item 74).
 *
 * `npm run typecheck` runs tsc over tsconfig.json. With `checkJs: false` there,
 * a file is checked only if its first line is `// @ts-check` — so deleting
 * that one line would quietly take a module out of the check while
 * `npm run typecheck` stayed green. These tests stop that, and keep the list
 * in tsconfig.json, the files themselves and docs/TYPES.md saying the same
 * thing. They do not run tsc (that is `npm run typecheck`, in build.sh and in
 * .github/workflows/typecheck.yml); they are quick and need no TypeScript. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
const config = JSON.parse(read("tsconfig.json"));
const listed = config.files.filter((f) => f.endsWith(".js"));

/* The modules item 74 put under the check. A file may be added to the list
   (docs/TYPES.md says how); none of these may leave it. */
const REQUIRED = [
  "src/js/core/answer.js", "src/js/core/review.js", "src/js/core/difficulty.js",
  "src/js/core/mastery.js", "src/js/core/skillmap.js", "src/js/core/today.js",
  "src/js/core/curriculum.js", "src/js/core/diagnosis.js", "src/js/core/merge.js",
  "src/js/core/state.js", "src/js/core/catalogue.js", "src/js/tasks/registry.js", "src/js/tasks/shared.js",
];

const PRAGMA = /^\/\/ @ts-check\s*$/;

function walk(dir, out = []) {
  for (const e of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel, out);
    else if (e.name.endsWith(".js")) out.push(rel);
  }
  return out;
}

test("tsconfig: checks by the per-file pragma, emits nothing, and lists the shared types", () => {
  const o = config.compilerOptions;
  assert.equal(o.allowJs, true);
  assert.equal(o.noEmit, true, "the type check must never write a file: the build is tools/build.mjs");
  /* checkJs: true would check every file the listed ones import (the
     renderers included), and the pragma would mean nothing. */
  assert.equal(o.checkJs, false, "a file is checked by its own // @ts-check, not by checkJs");
  assert.ok(config.files.includes("src/js/types.d.ts"));
  for (const f of config.files) assert.ok(existsSync(path.join(ROOT, f)), `${f} is listed but missing`);
});

test("every module item 74 put under the check is still listed", () => {
  for (const f of REQUIRED) assert.ok(listed.includes(f), `${f} was taken out of tsconfig.json "files"`);
});

test("every listed module starts with // @ts-check", () => {
  for (const f of listed) {
    const first = read(f).split("\n", 1)[0];
    assert.match(first, PRAGMA, `${f} has lost its first line, // @ts-check — without it tsc skips the file`);
  }
});

test("no checked module switches the check off inside", () => {
  for (const f of listed) {
    const src = read(f);
    assert.ok(!/@ts-nocheck/.test(src), `${f}: @ts-nocheck`);
    assert.ok(!/@ts-ignore/.test(src), `${f}: @ts-ignore hides an error without saying why; ` +
      "fix the type, or use @ts-expect-error with a reason");
  }
});

test("no type tag is hidden in a plain /* */ comment, where tsc ignores it", () => {
  /* tsc reads @type, @param … only in a JSDoc block (slash and two stars).
     In a plain comment the tag looks like a type and checks nothing (found twice while item 74 was
     written: registry.js `enabled`, mastery.js `reviewFigures`). */
  for (const f of listed) {
    const src = read(f);
    const re = /\/\*(?!\*)[\s\S]*?\*\//g;
    for (let m; (m = re.exec(src));) {
      const line = src.slice(0, m.index).split("\n").length;
      assert.ok(!/@(type|param|returns|typedef|template)\b/.test(m[0]),
        `${f}:${line}: a type tag in a plain comment — open it with two stars`);
    }
  }
});

test("every module with // @ts-check is listed, so the list is the whole truth", () => {
  const marked = walk("src/js").filter((f) => PRAGMA.test(read(f).split("\n", 1)[0]));
  for (const f of marked) assert.ok(listed.includes(f), `${f} says // @ts-check but is not in tsconfig.json "files"`);
});

test("the shared types are never imported at run time", () => {
  /* types.d.ts exists for tsc only. A JS `import` of it would break the
     bundle; the modules name it inside JSDoc comments, as import("../types"). */
  for (const f of walk("src/js")) {
    const code = read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.ok(!/(?:^|\n)\s*import[^;]*["'][./]*types(?:\.d\.ts|\.js)?["']/.test(code), `${f} imports the types at run time`);
  }
});

test("docs/TYPES.md names every checked module", () => {
  const doc = read("docs/TYPES.md");
  for (const f of listed) assert.ok(doc.includes(f.replace(/^src\/js\//, "")), `docs/TYPES.md does not mention ${f}`);
});

test("the type-check workflow runs on the same Node as ci.yml, from the lockfile", () => {
  /* typecheck.yml is a workflow of its own (a type error is named as one),
     but it must not drift from ci.yml: the same exact Node (that of
     Dockerfile.build), `npm ci` so the pinned typescript is the one used. */
  const nodeOf = (f) => {
    const m = read(f).match(/node-version:\s*["']?([\d.]+)/);
    assert.ok(m, `${f} names no node-version`);
    return m[1];
  };
  assert.equal(nodeOf(".github/workflows/typecheck.yml"), nodeOf(".github/workflows/ci.yml"));
  const wf = read(".github/workflows/typecheck.yml");
  assert.match(wf, /npm ci\b/);
  assert.match(wf, /npm run typecheck\b/);
  assert.match(read("build.sh"), /npm run -s typecheck\b/, "build.sh no longer runs the type check");
});
