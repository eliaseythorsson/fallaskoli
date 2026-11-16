/* The container image carries "exactly what `node server/server.mjs` imports,
   and no more" (Dockerfile). Since v6.13 the server grades duels, so it
   imports the question builders and the hand-written exercises as well — and
   a file the Dockerfile forgets is not a failing test anywhere: it is a
   server that does not start, found out at `fly deploy`.

   So: follow the imports from server/server.mjs, and hold every file reached
   against the COPY lines. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** Every project file reachable from `entry` by static or dynamic import. */
function reachable(entry) {
  const seen = new Set();
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const text = fs.readFileSync(path.join(ROOT, file), "utf8");
    const re = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["'](\.{1,2}\/[^"']+)["']/g;
    for (let m; (m = re.exec(text));) {
      walk(path.posix.normalize(path.posix.join(path.posix.dirname(file), m[1])));
    }
  };
  walk(entry);
  return [...seen].sort();
}

/** The sources of the Dockerfile's COPY lines, as tests of a path. */
function copied() {
  const lines = fs.readFileSync(path.join(ROOT, "Dockerfile"), "utf8").split("\n")
    .filter((l) => /^COPY\s/.test(l));
  return lines.flatMap((l) => l.trim().split(/\s+/).slice(1, -1)).map((src) => {
    if (src.includes("*")) {
      const re = new RegExp("^" + src.split("*").map((x) => x.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*") + "$");
      return (f) => re.test(f);
    }
    return (f) => f === src || f.startsWith(src.replace(/\/$/, "") + "/");
  });
}

test("the Dockerfile copies every file the server imports", () => {
  const files = reachable("server/server.mjs");
  /* The walk found the things it is here for. */
  for (const must of ["src/js/core/duel.js", "src/js/core/answer.js", "src/js/tasks/index.js",
    "src/js/tasks/next.js", "data/data_bundle.js", "data/exercises.js"])
    assert.ok(files.includes(must), `the server no longer imports ${must}?`);
  const tests = copied();
  const missing = files.filter((f) => !tests.some((t) => t(f)));
  assert.deepEqual(missing, [], "imported by the server but not in the image — add a COPY line to the Dockerfile");
});

test("the files the server READS at run time are in the image too (item 54)", async () => {
  /* tools/pwa.mjs reads src/sw.js with readFileSync — no import names it, so
     the walk above cannot see it. The module lists what it reads. */
  assert.ok(reachable("server/server.mjs").includes("tools/pwa.mjs"));
  const { READS } = await import("../tools/pwa.mjs");
  assert.ok(READS.includes("src/sw.js"));
  const tests = copied();
  assert.deepEqual(READS.filter((f) => !tests.some((t) => t(f))), [],
    "read by the server but not in the image — add a COPY line to the Dockerfile");
  for (const f of READS) assert.ok(fs.existsSync(path.join(ROOT, f)), f);
});

test("nothing the server imports is kept out of the image by .dockerignore", () => {
  const ignore = fs.readFileSync(path.join(ROOT, ".dockerignore"), "utf8").split("\n")
    .map((l) => l.trim()).filter((l) => l && !l.startsWith("#") && !l.startsWith("!"));
  const hit = (f, pat) => {
    const p = pat.replace(/\/$/, "");
    if (p.includes("*")) {
      const re = new RegExp("^" + p.split("*").map((x) => x.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*") + "$");
      /* A pattern without a slash is matched against the path from the root. */
      return re.test(f);
    }
    return f === p || f.startsWith(p + "/");
  };
  const lost = reachable("server/server.mjs").filter((f) => ignore.some((pat) => hit(f, pat)));
  assert.deepEqual(lost, []);
});

test("the server does not reach into the screen code", () => {
  /* core/ and tasks/ have no DOM; ui/ does, and would not load in Node. */
  const ui = reachable("server/server.mjs").filter((f) => f.startsWith("src/js/ui/") || f === "src/js/app.js");
  assert.deepEqual(ui, []);
});
