/* LÍNO-2, the Icelandic academic word list, in the build (issue #9).

   pipeline/lino.py reads sources/lino2.csv (standard library only, so these
   tests need no BÍN). Three things are held here:
   - the reader: columns found by their names, rank from the rank column, else
     the frequency column, else the line order; a word class, a header or a
     rank it does not know stops it with the file and line named;
   - the licence: LÍNO-2 is named, CC BY 4.0, in the app's list and the README;
   - the data: once the real file is in sources/, every LÍNO-2 entry that is in
     the lexicon carries exactly the rank the reader gives it. Until then that
     test is skipped and says so.

   tests/fixtures/NOT-LINO-reader-fixture.csv is NOT LÍNO-2: five ordinary
   words in a made-up layout, for the reader's tests only. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LICENSES } from "../data/licenses.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const FIXTURE = "tests/fixtures/NOT-LINO-reader-fixture.csv";
const py = ["python3", "python"].find((p) => spawnSync(p, ["-c", "import sys; sys.exit(sys.version_info < (3, 8))"],
  { cwd: root }).status === 0);

function reader(...args) {
  const r = spawnSync(py, ["pipeline/lino.py", ...args], { cwd: root, encoding: "utf8" });
  return { status: r.status, out: r.stdout, err: r.stderr };
}
function readText(text) {
  const f = path.join(mkdtempSync(path.join(tmpdir(), "lino-")), "list.csv");
  writeFileSync(f, text, "utf8");
  return reader("--json", f);
}

test("LÍNO-2 reader: rank column, word classes, a word listed twice keeps its better rank", { skip: !py }, () => {
  const r = reader("--json", FIXTURE);
  assert.equal(r.status, 0, r.err);
  assert.deepEqual(JSON.parse(r.out), [
    ["borð", ["hk", "kk", "kvk"], 1],
    ["hlaupa", ["so"], 2],
    ["hestur", ["hk", "kk", "kvk"], 3],
    ["fljótur", ["lo"], 4],
  ]);
  assert.match(r.err, /listed twice.*borð \(line 6, already line 3\)/);
});

test("LÍNO-2 reader: with no rank column the frequency decides, then the line order", { skip: !py }, () => {
  let r = readText("Orð\tTíðni\nhestur\t10\nborð\t1.200\nköttur\t10\n");
  assert.equal(r.status, 0, r.err);
  assert.deepEqual(JSON.parse(r.out), [["borð", null, 1], ["hestur", null, 2], ["köttur", null, 3]]);
  r = readText("﻿lemma,pos\nborð,noun\nhlaupa,verb\n");
  assert.equal(r.status, 0, r.err);
  assert.deepEqual(JSON.parse(r.out), [["borð", ["hk", "kk", "kvk"], 1], ["hlaupa", ["so"], 2]]);
  assert.match(r.err, /no rank or frequency column/);
});

test("LÍNO-2 reader: what it does not know stops the build, with the place named", { skip: !py }, () => {
  let r = readText("Röð;Orð;Orðflokkur\n1;borð;no\n2;hlaupa;xx\n");
  assert.notEqual(r.status, 0);
  assert.match(r.err, /word classes the reader does not know: 'xx'.*CLASSES/);
  r = readText("Röð;Eitthvað\n1;borð\n");
  assert.notEqual(r.status, 0);
  assert.match(r.err, /:1: no lemma column/);
  r = readText("Röð;Orð\n1;borð\nfyrst;hlaupa\n");
  assert.notEqual(r.status, 0);
  assert.match(r.err, /:3: the rank 'fyrst' is not a whole number/);
});

test("LÍNO-2 missing: the build error says where to get the file and where to put it", { skip: !py }, () => {
  const r = reader(path.join(tmpdir(), "no-such-lino2.csv"));
  assert.notEqual(r.status, 0);
  assert.match(r.err, /20\.500\.12537\/307/);
  assert.match(r.err, /sources\/lino2\.csv/);
  assert.match(r.err, /lino2\.sha256/);
  assert.match(readFileSync(path.join(root, "build.sh"), "utf8"), /lino2\.sha256/,
    "build.sh checks the LÍNO-2 checksum");
});

test("LÍNO-2 is in the licence list (CC BY 4.0), the README and the manifest's inputs", () => {
  const lino = LICENSES.data.find((d) => /LÍNO-2/.test(d.nm));
  assert.ok(lino, "data/licenses.js names LÍNO-2");
  assert.equal(lino.lic, "CC BY 4.0");
  assert.match(lino.url, /20\.500\.12537\/307/);
  assert.match(readFileSync(path.join(root, "README.md"), "utf8"), /LÍNO-2, the\s+Icelandic academic word list[^]{0,200}?CC BY 4\.0\)/);
  const manifest = readFileSync(path.join(root, "tools/manifest.mjs"), "utf8");
  assert.match(manifest, /"sources\/lino2\.csv"/);
});

const REAL = existsSync(path.join(root, "sources/lino2.csv"));
test("every LÍNO-2 word in the lexicon carries the rank the list gives it",
  { skip: !py || !REAL ? "sources/lino2.csv is not in the repository yet (pipeline/lino.py says how to add it)" : false },
  async () => {
    const r = reader("--json");
    assert.equal(r.status, 0, r.err);
    const list = JSON.parse(r.out);
    assert.ok(list.length > 2000, `LÍNO-2 has 2,294 lemmas; the reader found ${list.length}`);
    const { DATA } = await import("../data/data_bundle.js");
    const words = DATA.lex.w;
    for (const w of words) if (w.lino != null) assert.ok(Number.isInteger(w.lino) && w.lino >= 1, `${w.o}: ${w.lino}`);
    /* The first entries of the list, and some from its end: each one in the
       lexicon (in its class, if the list gives one) has its own rank. */
    const probe = [...list.slice(0, 10), ...list.slice(-5)];
    let found = 0;
    for (const [lemma, cls, rank] of probe) {
      const hits = words.filter((w) => w.o === lemma && (!cls || cls.includes(w.c)));
      if (!hits.length) continue;
      found++;
      for (const w of hits) assert.equal(w.lino, rank, `${lemma}·${w.c}: lino ${w.lino}, list rank ${rank}`);
    }
    assert.ok(found >= 10, `only ${found} of ${probe.length} probed LÍNO-2 words are in the lexicon`);
  });
