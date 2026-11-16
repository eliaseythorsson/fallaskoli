/* The hand-written content lives in content/**\/*.tsv (critique item 82), and
   the build reads it through pipeline/content_io.py into pipeline/sentences.py and pipeline/exercises.py.

   These tests hold three things:
   - every file is well formed: a header, no line with more fields than the
     header, no stray space at the edge of a field (a spreadsheet adds those,
     and then "þf " is not "þf");
   - the build reads every line: each list the build scripts use has exactly
     as many entries as its file has lines (Python, stdlib only — no BÍN or
     Greynir is needed to read the content);
   - a mistake in a file stops the build with the file and the line named.
   The review page is tested in review-page.test.js. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseTsv } from "../tools/review.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

function tsvFiles(dir = "content") {
  return readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? tsvFiles(dir + "/" + e.name) : e.name.endsWith(".tsv") ? [dir + "/" + e.name] : []);
}
const FILES = tsvFiles().sort();
const read = (rel) => parseTsv(readFileSync(path.join(root, rel), "utf8"));

test("content/: every kind of hand-written content has its files", () => {
  const kinds = new Set(FILES.map((f) => f.split("/")[1]));
  for (const k of ["setningar", "villuveidar", "lysingarord", "fornofn", "toluord", "fallstjorn",
    "obeygjanleg", "ordafordi"]) assert.ok(kinds.has(k), "no content/" + k);
  assert.ok(FILES.length >= 30, FILES.length);
});

test("content/*.tsv: a header, an Icelandic description, and no line wider than the header", () => {
  for (const rel of FILES) {
    const text = readFileSync(path.join(root, rel), "utf8");
    assert.ok(!text.includes("\r"), rel + ": Windows line ends");
    const { header, rows, title } = read(rel);
    assert.ok(title, rel + ": no title comment");
    assert.match(text, /^# Dálkar:/m, rel + ": no description of the columns");
    assert.ok(header.length >= 1 && rows.length >= 1, rel);
    text.split("\n").forEach((line, i) => {
      if (/^\s*#/.test(line) || !line.trim()) return;
      const cells = line.split("\t");
      assert.ok(cells.length <= header.length, `${rel}:${i + 1}: ${cells.length} fields, header has ${header.length}`);
      for (const c of cells) assert.equal(c, c.trim(), `${rel}:${i + 1}: a space at the edge of ${JSON.stringify(c)}`);
    });
  }
});

/* Python with nothing but the standard library reads the content. */
const py = ["python3", "python"].find((p) => spawnSync(p, ["-c", "import sys; sys.exit(sys.version_info < (3, 8))"],
  { cwd: root }).status === 0);
/* The build's Python modules live in pipeline/ (critique item 79); run from the
   repository root, as ./build.sh does, with that folder first on the path. */
const runPy = (code) => spawnSync(py, ["-c", "import sys; sys.path.insert(0, 'pipeline')\n" + code], { cwd: root, encoding: "utf8",
  env: { ...process.env, PYTHONHASHSEED: "0", PYTHONDONTWRITEBYTECODE: "1" } });

test("the build reads every line of every file", { skip: py ? false : "no Python 3" }, () => {
  const r = runPy(`
import json, sentences as S, exercises as X
n = lambda v: len(v)
out = {k: len(getattr(X, k)) for k in dir(X) if k.isupper() and isinstance(getattr(X, k), (list, dict, tuple, set))}
out["S"] = len(S.S)
out["SYNONYM_GROUPS"] = sum(len(v) for v in X.SYNONYMS.values())
out["ANTONYM_PAIRS"] = sum(len(v) for v in X.ANTONYMS.values())
out["CONJ_COMPARE_PAIRS"] = sum(len(p) for _, p in X.CONJ_COMPARE)
out["ADV_PREP_LINES"] = sum(len(p) + len(a) for _, p, a in X.ADV_PREP_FRAMES)
out["MOTION_SET_LINES"] = sum(len(g) + len(s) + 1 for _, _, g, s, _ in X.MOTION_SETS)
out["CONJ_FRAME_LINES"] = sum(map(len, [X.CONJ_BOTH, X.CONJ_NEITHER, X.CONJ_EITHER, X.CONJ_RELATIVE, X.CONJ_SAID] + list(X.CONJ_WHETHER)))
print(json.dumps(out))`);
  assert.equal(r.status, 0, r.stderr);
  const got = JSON.parse(r.stdout);
  const lines = (rel) => read("content/" + rel).rows.length;
  const distinct = (rel, col) => new Set(read("content/" + rel).rows.map((x) => x.cells[col])).size;
  const want = {
    S: lines("setningar/setningar.tsv"),
    HUNT: lines("villuveidar/villur.tsv"),
    ADJ_NOUN_GROUPS: lines("lysingarord/nafnordahopar.tsv"),
    ADJ_FRAMES: lines("lysingarord/rammar.tsv"),
    PRONOUN_GAP: lines("fornofn/eyda.tsv"),
    REFLEXIVE: lines("fornofn/afturbeygt.tsv"),
    PRONOUN_SUBJECTS: lines("fornofn/eyda-frumlog.tsv"),
    PRONOUN_VERBS: lines("fornofn/eyda-sagnir.tsv"),
    PRONOUN_PREPS: lines("fornofn/eyda-forsetningar.tsv"),
    REFLEX_SUBJECTS: lines("fornofn/afturbeygt-frumlog.tsv"),
    REFLEX_OBJECT: lines("fornofn/afturbeygt-sagnir.tsv"),
    REFLEX_POSSESSIVE: lines("fornofn/afturbeygt-eign.tsv"),
    NUMERAL_AGREE: lines("toluord/samraemi.tsv"),
    NUMERAL_FRAMES: lines("toluord/rammar.tsv"),
    NUMERAL_PLURAL_ONLY: lines("toluord/fleirtoluord.tsv"),
    PLURAL_ONLY_GROUPS: lines("toluord/fleirtoluord-hopar.tsv"),
    PLURAL_ONLY_FRAMES: lines("toluord/fleirtoluord-rammar.tsv"),
    DATE_FRAMES: lines("toluord/dagsetningar.tsv"),
    MOTION_REST: lines("fallstjorn/hreyfing.tsv"),
    MOTION_SETS: distinct("fallstjorn/hreyfing-sett.tsv", "sett"),
    MOTION_SET_LINES: lines("fallstjorn/hreyfing-sett.tsv"),
    VERB_CASE: lines("fallstjorn/sagnir.tsv"),
    VERB_FRAMES: lines("fallstjorn/sagnir-rammar.tsv"),
    IMPERSONAL_FRAMES: lines("fallstjorn/opersonulegar.tsv"),
    IMPERSONAL_SUBJECTS: lines("fallstjorn/opersonulegar-frumlog.tsv"),
    ADV_OR_PREP: lines("obeygjanleg/fs-ao.tsv"),
    ADV_PREP_FRAMES: distinct("obeygjanleg/fs-ao-rammar.tsv", "orð"),
    ADV_PREP_LINES: lines("obeygjanleg/fs-ao-rammar.tsv"),
    CONJUNCTION: lines("obeygjanleg/samtengingar.tsv"),
    CONJ_COMPARE: distinct("obeygjanleg/samtengingar-samanburdur.tsv", "lýsingarorð"),
    CONJ_COMPARE_PAIRS: lines("obeygjanleg/samtengingar-samanburdur.tsv"),
    CONJ_PAIRS: lines("obeygjanleg/samtengingar-por.tsv"),
    CONJ_FRAME_LINES: lines("obeygjanleg/samtengingar-rammar.tsv"),
    CONJ_CAUSE: lines("obeygjanleg/samtengingar-orsok.tsv"),
    CONJ_ORDER: lines("obeygjanleg/samtengingar-rod.tsv"),
    SYNONYM_GROUPS: lines("ordafordi/samheiti.tsv"),
    ANTONYM_PAIRS: lines("ordafordi/andheiti.tsv"),
    WORD_IN_CONTEXT: lines("ordafordi/samhengi.tsv"),
    WORD_IN_CONTEXT_FRAMES: lines("ordafordi/samhengi-rammar.tsv"),
  };
  for (const [k, n] of Object.entries(want)) assert.equal(got[k], n, k);
  /* the sizes at the move (v6.13): a file that suddenly reads short is a bug */
  assert.equal(got.S, 1130);
  assert.equal(got.HUNT, 134);
  /* the VC_* groups the builders know by name are all still there */
  for (const k of ["VC_FAMILY", "VC_OTHERS", "VC_PEOPLE", "VC_ANIMALS", "VC_PETS", "VC_VISITED", "VC_THINGS",
    "VC_STOLEN", "VC_THROWN", "VC_SHUT", "VC_RUBBISH", "VC_PUSHED", "VC_AWAITED", "VC_FETCHED"])
    assert.ok(got[k] > 0, k);
});

test("a mistake in a file stops the build and names the file and the line", { skip: py ? false : "no Python 3" }, () => {
  const dir = mkdtempSync(path.join(tmpdir(), "content-"));
  const f = path.join(dir, "bad.tsv");
  const attempt = (body, cols) => {
    writeFileSync(f, body, "utf8");
    return runPy(`import content_io; content_io.rows(${JSON.stringify(f)}, ${cols})`);
  };
  const C2 = `[("þyngd", "int"), ("svar", "word:3")]`;
  let r = attempt("# a comment\nþyngd\tsvar\n1\tég|pfn|NFET\nx\tég|pfn|NFET\n", C2);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /bad\.tsv:4 \[þyngd\]: á að vera heil tala/);
  r = attempt("þyngd\tsvar\n1\tég|pfn\n", C2);
  assert.match(r.stderr, /bad\.tsv:2 \[svar\]: á að vera 3 hlutar/);
  r = attempt("svar\tþyngd\n1\tég|pfn|NFET\n", C2);
  assert.match(r.stderr, /bad\.tsv:1: dálkarnir eiga að vera/);
  r = attempt("þyngd\tsvar\n1\tég|pfn|NFET\tauka\n", C2);
  assert.match(r.stderr, /bad\.tsv:2: of margir dálkar/);
  r = attempt("þyngd\tsvar\n1 \tég|pfn|NFET\n", C2);
  assert.match(r.stderr, /bad\.tsv:2: bil fremst eða aftast/);
  /* and a line with its trailing empty fields dropped is read as empty */
  r = attempt("þyngd\tsvar\tathugasemd\n1\tég|pfn|NFET\n",
    `[("þyngd", "int"), ("svar", "word:3"), ("athugasemd", "str")]`);
  assert.equal(r.status, 0, r.stderr);
});

test("pipeline/exercises.py: an item that breaks a list's own rule names its line", { skip: py ? false : "no Python 3" }, () => {
  /* The loader's checks beyond the cell types: a numeral frame needs nouns
     OR classes; a motion set needs motion, rest and nouns. Run on a copy of
     the content with one line broken. */
  const r = runPy(`
import content_io, os, shutil, tempfile, sys
src = content_io.ROOT
tmp = tempfile.mkdtemp()
shutil.copytree(src, os.path.join(tmp, "content"))
p = os.path.join(tmp, "content", "toluord", "rammar.tsv")
lines = open(p, encoding="utf-8").read().split("\\n")
i = next(k for k, l in enumerate(lines) if l and not l.startswith("#") and "\\t" in l and l.split("\\t")[0].isdigit())
cells = lines[i].split("\\t"); cells += [""] * (7 - len(cells)); cells[4] = "köttur"; cells[5] = "person"
lines[i] = "\\t".join(cells)
open(p, "w", encoding="utf-8").write("\\n".join(lines))
content_io.ROOT = os.path.join(tmp, "content")
try:
    import exercises
except content_io.ContentError as e:
    print("ERR", e, "LINE", i + 1)
`);
  assert.equal(r.status, 0, r.stderr);
  const m = /ERR content\/toluord\/rammar\.tsv:(\d+): fylltu út annaðhvort .* LINE (\d+)/.exec(r.stdout);
  assert.ok(m, r.stdout + r.stderr);
  assert.equal(m[1], m[2]);
});
