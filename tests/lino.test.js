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

   tests/fixtures/NOT-LINO-test-fixture.csv is NOT LÍNO-2: five ordinary
   words in a made-up layout, for these tests only. Every test names it
   explicitly; none reads sources/. The build's own logic (the lift, the
   `lino` rank, the report of what BÍN lacks) is tested on it with a small
   stand-in for BÍN, so no grammar library is needed. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LICENSES } from "../data/licenses.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const FIXTURE = "tests/fixtures/NOT-LINO-test-fixture.csv";
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

/* Runs `code` in Python with lino imported, the fixture read as `W0`, and a
   stand-in BÍN `b` that knows the readings in `bin` ({lemma: [class, …]}). */
function logic(code, bin = {}) {
  const prog = `
import sys, json; sys.path.insert(0, "pipeline"); import lino
class E:
    def __init__(s, o, c, i): s.ord, s.ofl, s.hluti, s.birting, s.bin_id = o, c, "alm", "K", i
class B:
    def __init__(s, d): s.d = d
    def lookup_ksnid(s, w): return w, [E(w, c, i + 1) for i, c in enumerate(s.d.get(w, []))]
b = B(json.loads(sys.argv[1]))
W0 = lino.load(${JSON.stringify(FIXTURE)}, required=True)
${code}`;
  const r = spawnSync(py, ["-c", prog, JSON.stringify(bin)], { cwd: root, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return { out: JSON.parse(r.stdout.trim().split("\n").pop()), lines: r.stdout, err: r.stderr };
}

test("LÍNO-2 lift: ×3 for a listed word in the class the list gives, once, not on top of the school lift", { skip: !py }, () => {
  const { out } = logic(`
pairs = {("borð","hk"), ("hlaupa","so"), ("hlaupa","kvk"), ("hestur","kk"), ("fljótur","lo"), ("köttur","kk")}
print(json.dumps(sorted([list(k) + [v] for k, v in lino.boost(pairs, W0, already={("fljótur","lo")}).items()])))`);
  assert.deepEqual(out, [["borð", "hk", 3], ["hestur", "kk", 3], ["hlaupa", "so", 3]]);
});

test("LÍNO-2 rank: each lexicon word on the list carries its rank, only in the class the list gives", { skip: !py }, () => {
  const { out, lines } = logic(`
W = [{"o":"borð","c":"hk"}, {"o":"hlaupa","c":"so"}, {"o":"hlaupa","c":"kvk"}, {"o":"hestur","c":"kk"},
     {"o":"fljótur","c":"lo"}, {"o":"köttur","c":"kk"}]
n = lino.tag(W, W0)
print(json.dumps([n, [[x["o"], x["c"], x.get("lino")] for x in W]]))`);
  assert.deepEqual(out, [4, [["borð", "hk", 1], ["hlaupa", "so", 2], ["hlaupa", "kvk", null],
    ["hestur", "kk", 3], ["fljótur", "lo", 4], ["köttur", "kk", null]]]);
  assert.doesNotMatch(lines, /no word class/);
});

test("LÍNO-2 rank: a list with no word-class column tags every class, and the build says so", { skip: !py }, () => {
  const { out, lines } = logic(`
W = [{"o":"ljós","c":"hk"}, {"o":"ljós","c":"lo"}, {"o":"borð","c":"hk"}]
n = lino.tag(W, lino.parse("Röð;Orð\\n1;ljós\\n", "x.csv"))
print(json.dumps([n, [x.get("lino") for x in W]]))`);
  assert.deepEqual(out, [2, [1, 1, null]]);
  assert.match(lines, /the list gives no word class; every class of a listed lemma is tagged/);
});

test("LÍNO-2 report: the entries BÍN does not have in the class the list gives are named, with their rank", { skip: !py }, () => {
  const { out } = logic(`print(json.dumps(lino.not_in_bin(W0, b)))`,
    { borð: ["hk"], hlaupa: ["kvk"], hestur: ["kk"] });
  /* hlaupa is in BÍN only as a noun, the list says verb; fljótur not at all */
  assert.deepEqual(out, [[2, "hlaupa", "so"], [4, "fljótur", "lo"]]);
});

test("LÍNO-2 absent: the build takes it as an empty list, with a note; the reader alone still stops", { skip: !py }, () => {
  const missing = path.join(tmpdir(), "no-such-lino2.csv");
  const r = spawnSync(py, ["-c", `import sys, json; sys.path.insert(0, "pipeline"); import lino
w = lino.load(${JSON.stringify(missing)}); print(json.dumps([w, lino.boost({("borð","hk")}, w), lino.not_in_bin(w, None)]))`],
  { cwd: root, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), [[], {}, []]);
  assert.match(r.stderr, /not found; taken as an empty list/);
});

test("LÍNO-2 missing: the reader on its own says where to get the file and where to put it", { skip: !py }, () => {
  const r = reader(path.join(tmpdir(), "no-such-lino2.csv"));
  assert.notEqual(r.status, 0);
  assert.match(r.err, /20\.500\.12537\/307/);
  assert.match(r.err, /sources\/lino2\.csv/);
  assert.match(r.err, /lino2\.sha256/);
  const sh = readFileSync(path.join(root, "build.sh"), "utf8");
  assert.match(sh, /lino2\.sha256/, "build.sh checks the LÍNO-2 checksum when the file is there");
  assert.match(sh, /WARNING: LÍNO-2 IS NOT IN THE BUILD/, "build.sh warns when it is not");
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
