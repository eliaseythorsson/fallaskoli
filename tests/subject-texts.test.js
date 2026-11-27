/* Issue #32: subject texts — the main-idea sentence, the details that support
   it, and the best gist sentence of four (docs/DLD-PLAN.md §4; summarising
   rules after Brown & Day 1983, docs/DLD-RESEARCH.md).

   These tests hold:
   - the reader (pipeline/content_io.py) reads a `? [kjarni]` question: the
     right answer first, then exactly one wrong answer of each kind
     ([þröngt], [vítt], [rangt]) on the lines below it, and stops with the file and the line otherwise;
   - the three types take their answers from the marks of the file:
     les_setning the [aðalatriði] sentence, les_smaatridi the [smáatriði]
     sentences (with an [annað] one to leave out), les_kjarni the [kjarni]
     question, each wrong answer explained by its kind;
   - they are declared at the end of the catalogue, judged, and a review
     brings back the text it names. */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EX } from "../data/exercises.js";
import { judge } from "../src/js/core/answer.js";
import { tagsOf } from "../src/js/core/diagnosis.js";
import { catalogueEntry, CATALOGUE_IDS } from "../src/js/core/catalogue.js";
import { nodeById } from "../src/js/core/curriculum.js";
import { lessonFor } from "../src/js/core/lessons.js";
import { typeById } from "../src/js/tasks/index.js";
import { GIST_WHY_NOT } from "../src/js/tasks/lesskilningur.js";
import { freshView, poolLex, buildFresh } from "./pools.js";
import { EXAMPLES } from "../src/js/content/examples.js";
import { LESSONS } from "../src/js/content/lessons.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const lex = poolLex();
const TYPES = ["les_setning", "les_smaatridi", "les_kjarni"];
const SUBJECT = EX.textar.filter((tx) => tx.k === "fræðitexti");

/* ---------- the format: a gist question ------------------------------------- */

const py = ["python3", "python"].find((p) => spawnSync(p, ["-c", "import sys; sys.exit(sys.version_info < (3, 8))"],
  { cwd: root }).status === 0);

function readOne(body) {
  const dir = mkdtempSync(path.join(tmpdir(), "kjarni-"));
  const f = path.join(dir, "prufa.txt");
  writeFileSync(f, body, "utf8");
  const r = spawnSync(py, ["-c", `import sys; sys.path.insert(0, 'pipeline')
import content_io, json
try:
    t = content_io.read_text(${JSON.stringify(f)}, "content/textar/prufa.txt", None, None)
    print("OK", json.dumps(t, ensure_ascii=False))
except content_io.ContentError as e:
    print("ERR", e)
`], { cwd: root, encoding: "utf8", env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.startsWith("OK ") ? { text: JSON.parse(r.stdout.slice(3)) } : { err: r.stdout.trim() };
}

const F = "# þyngd: 1\n# tegund: fræðitexti\n# orð:\n[aðalatriði] Jón á hund.\n[smáatriði] Hundurinn heitir Snati.\n";
/** A gist question on line 6, its answers on the lines below. */
const gist = (...lines) => F + "? [kjarni] Hvað er best?\n" + lines.map((l) => l + "\n").join("") + "! Skýring.\n";
const ONE_EACH = ["+ Jón á hund sem heitir Snati.", "- [vítt] Fólk á dýr.", "- [rangt] Jón á kött.", "- [þröngt] Hundurinn heitir Snati."];

test("a [kjarni] question: a block, the right answer, then one wrong answer of each kind, the kinds kept apart",
  { skip: py ? false : "no Python 3" }, () => {
    const { text, err } = readOne(gist(...ONE_EACH));
    assert.equal(err, undefined);
    const q = text.spurningar[0];
    assert.equal(q.mark, "kjarni");
    assert.equal(q.a, "Jón á hund sem heitir Snati.");
    assert.deepEqual(q.w, ["Fólk á dýr.", "Jón á kött.", "Hundurinn heitir Snati."], "the kind is not part of the answer");
    assert.deepEqual(q.br, ["vítt", "rangt", "þröngt"]);
  });

test("a [kjarni] question that breaks the rule stops with the file and the line", { skip: py ? false : "no Python 3" }, () => {
  const at = (body, line, re) => {
    const { err } = readOne(body);
    assert.ok(err, "read without complaint:\n" + body);
    assert.match(err, new RegExp(`^ERR content/textar/prufa\\.txt:${line}: `), err);
    assert.match(err, re, err);
  };
  const EACH = /eitt rangt svar af hverri tegund/;
  at(gist(ONE_EACH[0], ONE_EACH[1], ONE_EACH[2]), 6, EACH);
  at(gist(ONE_EACH[0], "- [þröngt] A.", "- [þröngt] B.", "- [rangt] C."), 6, EACH);
  at(gist(ONE_EACH[0], "- [þröngt] A.", "- [vítt] B.", "- C."), 10, /segir fremst hvernig hún er röng/);
  at(gist(ONE_EACH[0], "- [þröngt] A.", "- [breitt] B.", "- [rangt] C."), 9, /segir fremst hvernig hún er röng/);
  at(gist(ONE_EACH[0], "- [þröngt] A.", "- [vítt] A.", "- [rangt] C."), 6, /sama svarið stendur tvisvar/);
  at(F + "? [kjarni] Hvað er best? | Rétt. | A. | B. | C.\n! Skýring.\n", 6, /kjarni er skrifaður með svörin í línunum fyrir neðan/);
  at(F.replace("# tegund: fræðitexti", "# tegund: saga").replace(/\[aðalatriði\]|\[smáatriði\]/g, (m) => (m === "[aðalatriði]" ? "[vandi]" : "[útkoma]"))
    + "? [kjarni] Hvað er best?\n" + ONE_EACH.map((l) => l + "\n").join("") + "! Skýring.\n", 6, /bara spurður um fræðitexta/);
  /* a mark on a wrong answer of an [aðalatriði] question is still refused */
  at(F + "? [aðalatriði] Um hvað?\n+ Um hund.\n- [þröngt] Um kött.\n- Um hest.\n! Skýring.\n", 8, /bara notað í samantekt og kjarna/);
  /* an [aðalatriði] question on one line is as it was */
  const plain = readOne(F + "? [aðalatriði] Um hvað? | Um hund. | Um kött. | Um hest.\n! Skýring.\n");
  assert.equal(plain.err, undefined);
  assert.deepEqual(plain.text.spurningar[0].br, []);
});

/* ---------- what the build made of the files --------------------------------- */

test("subject texts with gist questions, its kinds one of each", () => {
  assert.ok(SUBJECT.length >= 3, `${SUBJECT.length} subject texts`);
  const gists = SUBJECT.flatMap((tx) => tx.q.filter((q) => q.k === "kjarni"));
  assert.ok(gists.length >= 3, `${gists.length} gist questions`);
  for (const q of gists) {
    assert.deepEqual([...q.br].sort(), ["rangt", "vítt", "þröngt"]);
    assert.equal(q.w.length, 3);
    assert.ok(q.w.every((w) => !/^\[/.test(w)));
  }
  /* the main idea is not always the first sentence, or "tap the first" would do */
  assert.ok(new Set(SUBJECT.map((tx) => tx.s.findIndex((s) => s.p === "aðalatriði"))).size >= 3);
  /* enough texts with a sentence to leave out */
  assert.ok(SUBJECT.filter((tx) => tx.s.some((s) => s.p === "annað")).length >= 2);
});

/* ---------- the three types --------------------------------------------------- */

test("the three types are declared in merge order at the end of the catalogue, on the main-idea node", () => {
  /* in merge order: right after #35's fr_setning */
  const at = CATALOGUE_IDS.indexOf("fr_setning") + 1;
  assert.deepEqual(CATALOGUE_IDS.slice(at, at + 3), TYPES);
  assert.deepEqual(TYPES.map((id) => catalogueEntry(id).renderer), ["tap", "tap", "choice"]);
  for (const id of TYPES) {
    const c = catalogueEntry(id);
    assert.deepEqual([c.skill, c.grader, c.recall, c.tags, c.bands], ["lesskilningur", "app", false, ["les"], [1]]);
    assert.ok(nodeById("les-adalatridi").types.includes(id));
    assert.ok(EXAMPLES[id]);
  }
});

const textOf = (t) => EX.textar.find((x) => t.item.startsWith(`les:${x.id}:`) || t.item.startsWith(`les:${x.id}#`));

test("les_setning: every sentence of the text is a button; the [aðalatriði] one is right", () => {
  const seen = new Set();
  for (const t of buildFresh("les_setning", 1, 200)) {
    const tx = textOf(t);
    seen.add(tx.id);
    assert.equal(tx.k, "fræðitexti");
    assert.equal(t.type, "tap");
    assert.deepEqual(t.s.tok.map((x) => x.w), tx.s.map((s) => s.t), "the pupil reads every sentence, in order");
    assert.ok(t.s.tok.every((x) => !x.still));
    assert.deepEqual(t.targets, [tx.s.findIndex((s) => s.p === "aðalatriði")]);
    assert.equal(judge(t, { sel: t.targets }).ok, true);
    const other = t.s.tok.findIndex((_, j) => j !== t.targets[0]);
    const j = judge(t, { sel: [other] });
    assert.equal(j.ok, false);
    assert.deepEqual(j.findings.map((f) => f.p), ["adalatridi"]);
    assert.ok(judge(t, { sel: [] }).pending);
    assert.deepEqual([...tagsOf(t)], ["les"]);
    assert.equal(lessonFor(t), "lesskilningur");
  }
  assert.equal(seen.size, SUBJECT.length, "every subject text is asked");
});

test("les_smaatridi: the main idea shown and not tappable; every [smáatriði] and nothing else is right", () => {
  const seen = new Set();
  for (const t of buildFresh("les_smaatridi", 1, 200)) {
    const tx = textOf(t);
    seen.add(tx.id);
    const main = tx.s.findIndex((s) => s.p === "aðalatriði");
    assert.deepEqual(t.s.tok.map((x, j) => !!x.still), tx.s.map((_, j) => j === main));
    assert.deepEqual(t.targets, tx.s.flatMap((s, j) => (s.p === "smáatriði" ? [j] : [])));
    assert.ok(t.targets.length >= 2);
    assert.match(t.question, /tvær|þrjár|fjórar/);
    assert.equal(judge(t, { sel: t.targets }).ok, true);
    const other = tx.s.findIndex((s) => s.p === "annað");
    assert.ok(other >= 0, "a sentence to leave out");
    assert.equal(judge(t, { sel: [...t.targets, other] }).ok, false, "the sentence about something else");
    assert.equal(judge(t, { sel: t.targets.slice(1) }).ok, false, "a detail missed");
  }
  assert.deepEqual([...seen].sort(), SUBJECT.filter((tx) => tx.s.some((s) => s.p === "annað")
    && tx.s.filter((s) => s.p === "smáatriði").length >= 2).map((tx) => tx.id).sort());
});

test("les_kjarni: the text, four summaries, and a wrong one says which kind of wrong it is", () => {
  const seen = new Set(), first = new Set();
  for (const t of buildFresh("les_kjarni", 1, 200)) {
    const tx = textOf(t);
    const q = tx.q[+t.item.split("#")[1]];
    seen.add(tx.id);
    assert.equal(q.k, "kjarni");
    assert.equal(t.type, "choice");
    assert.deepEqual(t.text, tx.s.map((s) => s.t));
    assert.equal(t.options.length, 4);
    assert.deepEqual([...t.options].sort(), [q.a, ...q.w].sort());
    first.add(t.options[0] === t.answer);
    assert.equal(t.why, q.why);
    q.w.forEach((w, k) => assert.equal(t.whyNot[w], GIST_WHY_NOT[q.br[k]]));
    assert.equal(judge(t, { picked: t.answer }).ok, true);
    for (const w of q.w) assert.equal(judge(t, { picked: w }).ok, false);
  }
  assert.equal(seen.size, SUBJECT.filter((tx) => tx.q.some((q) => q.k === "kjarni")).length);
  assert.equal(first.size, 2, "the right answer is not always first");
});

test("each type remembers the text it showed, and a review brings back the one it names", () => {
  for (const id of TYPES) {
    const spec = typeById(id);
    const b = spec.build(lex, freshView(1), () => 0.5);
    assert.deepEqual(b.effects.filter((e) => e.op === "exSeen").map((e) => e.key), [b.task.item]);
    const items = new Set(buildFresh(id, 1, 100).map((t) => t.item));
    for (const item of items)
      for (let k = 0; k < 4; k++) assert.equal(spec.build(lex, freshView(1, { force: { item } }), () => k / 4).task.item, item);
    assert.equal(spec.build(lex, freshView(1, { force: { item: "les:ekki-til:adal" } }), () => 0.5), null);
    assert.equal(spec.build(lex, freshView(1, { force: { cell: "tengi:en" } }), () => 0.5), null);
  }
});

test("the worked examples and the Lesefni page give away no text the pupil is asked about", () => {
  const taught = JSON.stringify(TYPES.map((id) => EXAMPLES[id])) + JSON.stringify(LESSONS.find((l) => l.id === "lesskilningur"));
  for (const tx of SUBJECT) {
    for (const s of tx.s) assert.ok(!taught.includes(s.t), `${tx.id}: "${s.t}"`);
    for (const q of tx.q) assert.ok(!taught.includes(q.a), `${tx.id}: "${q.a}"`);
  }
});
