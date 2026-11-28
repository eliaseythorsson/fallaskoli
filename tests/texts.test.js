/* Issue #30: the text format and the skill Lesskilningur (docs/DLD-PLAN.md §4).

   A text is one plain-text file in content/textar/ (README.md, "Efnið"):
   a header, one sentence per line with its story-map or main-idea mark,
   pronoun referents in braces, questions as lines. These tests hold:

   - the reader (pipeline/content_io.py `texts`) reads the three texts, and
     stops with the FILE AND THE LINE on every mistake it is there to catch —
     run with the standard library only, BÍN handed in as a few words;
   - what the build made of them (data/exercises.js `EX.textar`): every
     sentence parsed, every part named, every pronoun pointing at its word;
   - the skill and its first question type, `les_adal`: declared at the end
     of the catalogue, on the curriculum map in all three years, built from
     every text, judged, and remembered when shown;
   - the review page shows every text.

   That a text is natural Icelandic and that each wrong answer is really
   wrong is a reader's judgement: content/REVIEW-NOTES.md says where to look. */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EX } from "../data/exercises.js";
import { judge } from "../src/js/core/answer.js";
import { tagsOf, patternById } from "../src/js/core/diagnosis.js";
import { catalogueEntry, CATALOGUE_IDS } from "../src/js/core/catalogue.js";
import { nodeById, presetContent } from "../src/js/core/curriculum.js";
import { skillById, defaultEnabled } from "../src/js/core/skills.js";
import { lessonFor } from "../src/js/core/lessons.js";
import { patternsOfNode } from "../src/js/core/skillmap.js";
import { typeById, applyEffects } from "../src/js/tasks/index.js";
import { freshView, poolLex, buildFresh } from "./pools.js";
import { collect } from "../tools/review.mjs";
import { EXAMPLES } from "../src/js/content/examples.js";
import { LESSONS } from "../src/js/content/lessons.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const lex = poolLex();
const FILES = readdirSync(path.join(root, "content/textar")).filter((n) => n.endsWith(".txt")).sort();
const STORY = ["aðstæður", "vandi", "markmið", "tilraun", "útkoma", "viðbrögð"];
const IDEA = ["aðalatriði", "smáatriði"];

/* ---------- the reader -------------------------------------------------------- */

const py = ["python3", "python"].find((p) => spawnSync(p, ["-c", "import sys; sys.exit(sys.version_info < (3, 8))"],
  { cwd: root }).status === 0);
const runPy = (code) => spawnSync(py, ["-c", "import sys; sys.path.insert(0, 'pipeline')\n" + code], { cwd: root, encoding: "utf8",
  env: { ...process.env, PYTHONHASHSEED: "0", PYTHONDONTWRITEBYTECODE: "1" } });

/* BÍN, as far as these tests need it: word -> [(lemma, class, mark)]. */
const BIN = `
BIN = {
  "jón": [], "Jón": [("Jón", "kk", "NFET")], "Páll": [("Páll", "kk", "NFET")], "páll": [],
  "Sara": [("Sara", "kvk", "NFET")], "sara": [],
  "hund": [("hundur", "kk", "ÞFET")], "hundinn": [("hundur", "kk", "ÞFETgr")],
  "konan": [("kona", "kvk", "NFETgr")], "kona": [("kona", "kvk", "NFET"), ("kon", "hk", "EFFT")],
  "steinninn": [("steinn", "kk", "NFETgr")], "áhrif": [("áhrif", "hk", "NFFT")],
  "hann": [("hann", "pfn", "NFET")], "hún": [("hún", "pfn", "NFET")], "það": [("það", "pfn", "NFET")],
  "hans": [("hann", "pfn", "EFET")], "þau": [("það", "pfn", "NFFT")], "þeir": [("hann", "pfn", "NFFT")],
  "þeim": [("hann", "pfn", "ÞGFFT"), ("hún", "pfn", "ÞGFFT"), ("það", "pfn", "ÞGFFT")],
}
lookup = lambda w: BIN.get(w, [])
`;

/** Read one text written here; -> { ok, text (JSON) } or { err }. */
function readOne(body, { bin = true } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "texti-"));
  const f = path.join(dir, "prufa.txt");
  writeFileSync(f, body, "utf8");
  const r = runPy(`${BIN}
import content_io, json
try:
    t = content_io.read_text(${JSON.stringify(f)}, "content/textar/prufa.txt", ${bin ? "lookup" : "None"}, {"áhrif"})
    print("OK", json.dumps(t, ensure_ascii=False))
except content_io.ContentError as e:
    print("ERR", e)
`);
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.startsWith("OK ") ? { text: JSON.parse(r.stdout.slice(3)) } : { err: r.stdout.trim() };
}

const HEAD = "# þyngd: 1\n# tegund: saga\n# orð:\n";
const Q = "? [aðalatriði] Um hvað er sagan? | Um hund. | Um kött. | Um hest.\n! Sagan er um hund.\n";
const GOOD = HEAD + "[vandi] Jón sá hund.\n[útkoma] Hann{Jón} tók hundinn.\n" + Q;

test("the reader reads the three texts, without BÍN too", { skip: py ? false : "no Python 3" }, () => {
  const r = runPy(`
import content_io, json
ts = content_io.texts(lambda w: None)  # a lookup is asked nothing it cannot answer …
`);
  /* … so hand it a real stand-in: no BÍN at all */
  const r2 = runPy(`
import content_io, json
content_io._bin_lookup = lambda: None
ts = content_io.texts()
print(json.dumps({"n": len(ts), "bin": content_io.texts.bin_checked,
  "ids": [t["id"] for t in ts], "files": [t.file for t in ts],
  "kinds": sorted({t["tegund"] for t in ts}),
  "q": [len(t["spurningar"]) for t in ts], "refs": sum(len(s["refs"]) for t in ts for s in t["setningar"])}, ensure_ascii=False))`);
  assert.notEqual(r.status, 0, "a lookup that answers None is a programming error, not silence");
  assert.equal(r2.status, 0, r2.stderr);
  const got = JSON.parse(r2.stdout);
  assert.equal(got.n, FILES.length);
  assert.equal(got.bin, false);
  assert.deepEqual(got.ids, FILES.map((n) => n.replace(/\.txt$/, "")));
  assert.deepEqual(got.files, FILES.map((n) => "content/textar/" + n));
  assert.deepEqual(got.kinds, ["fræðitexti", "saga"], "at least one story and one subject text");
  assert.ok(got.q.every((n) => n >= 1));
  assert.ok(got.refs >= 3, "the samples mark pronoun referents");
});

test("a good text: the marks, the words, the referent's place, the question", { skip: py ? false : "no Python 3" }, () => {
  const { text, err } = readOne(GOOD);
  assert.equal(err, undefined);
  assert.equal(text["þyngd"], 1);
  assert.equal(text.tegund, "saga");
  assert.deepEqual(text["orð"], []);
  assert.deepEqual(text.setningar.map((s) => [s.part, s.t]), [["vandi", "Jón sá hund."], ["útkoma", "Hann tók hundinn."]]);
  /* the braces are gone from the sentence; the pronoun is word 0 and points at word 0 of sentence 0 */
  assert.deepEqual(text.setningar[1].refs, [{ at: 0, ref: "Jón", to: [0, 0, 1] }]);
  assert.deepEqual(text.spurningar.map((q) => [q.mark, q.q, q.a, q.w, q.why]),
    [["aðalatriði", "Um hvað er sagan?", "Um hund.", ["Um kött.", "Um hest."], "Sagan er um hund."]]);
  /* the two names of one part: kveikja is vandi, tilfinning is viðbrögð */
  const two = readOne(HEAD + "[kveikja] Jón sá hund.\n[útkoma] Jón tók hundinn.\n[tilfinning] Jón sá konan.\n" + Q);
  assert.deepEqual(two.text.setningar.map((s) => [s.mark, s.part]),
    [["kveikja", "vandi"], ["útkoma", "útkoma"], ["tilfinning", "viðbrögð"]]);
  /* a referent of several words, and another form of the same noun */
  const many = readOne(HEAD + "[vandi] Jón og Sara sáu hund.\n[útkoma] Þau{Jón og Sara} tóku hann{hundinn}.\n" + Q);
  assert.equal(many.err, undefined);
  assert.deepEqual(many.text.setningar[1].refs, [{ at: 0, ref: "Jón og Sara", to: [0, 0, 3] }, { at: 2, ref: "hundinn", to: [0, 4, 1] }]);
});

test("every mistake stops with the file and the line", { skip: py ? false : "no Python 3" }, () => {
  const at = (body, line, re, o) => {
    const { err } = readOne(body, o);
    assert.ok(err, "read without complaint:\n" + body);
    assert.match(err, new RegExp(`^ERR content/textar/prufa\\.txt:${line}: `), err);
    assert.match(err, re, err);
  };
  const S2 = "[vandi] Jón sá hund.\n[útkoma] Jón tók hundinn.\n";
  /* the header */
  at("# þyngd: 1\n# tegund: saga\n" + S2 + Q, 3, /hausinn vantar „# orð:“/);
  at("# þyngd: 9\n# tegund: saga\n# orð:\n" + S2 + Q, 1, /þyngd á að vera heil tala frá 1 til 5/);
  at("# þyngd: 1\n# tegund: ljóð\n# orð:\n" + S2 + Q, 2, /tegund á að vera „saga“ eða „fræðitexti“/);
  at("# þyngd: 1\n# þyngd: 2\n# tegund: saga\n# orð:\n" + S2 + Q, 2, /stendur tvisvar/);
  /* the length its þyngd allows */
  at(HEAD + "[vandi] Jón sá hund.\n" + Q, 1, /á að vera 2–3 setningar, en þessi er 1/);
  at(HEAD + S2 + S2.replace(/Jón/g, "Páll") + Q, 1, /á að vera 2–3 setningar, en þessi er 4/);
  /* the marks */
  at(HEAD + "[vandi] Jón sá hund.\n[lausn] Jón tók hundinn.\n" + Q, 5, /óþekkt merki \[lausn\]/);
  at(HEAD + "[vandi] Jón sá hund.\n[aðalatriði] Jón tók hundinn.\n" + Q, 5, /óþekkt merki \[aðalatriði\] í texta af tegundinni saga/);
  at(HEAD + "[vandi] Jón sá hund.\nJón tók hundinn.\n" + Q, 5, /lína á að vera setning með merki fremst/);
  /* a story has every part its þyngd requires */
  at(HEAD + "[vandi] Jón sá hund.\n[tilraun] Jón tók hundinn.\n" + Q, 1, /hér vantar: útkoma/);
  at("# þyngd: 2\n# tegund: saga\n# orð:\n" + "[vandi] Jón sá hund.\n[tilraun] Jón tók hundinn.\n[útkoma] Páll sá hund.\n[annað] Páll tók hundinn.\n" + Q,
    1, /hér vantar: aðstæður/);
  /* a subject text has exactly one main idea, and its details */
  const F = "# þyngd: 1\n# tegund: fræðitexti\n# orð:\n";
  at(F + "[smáatriði] Jón sá hund.\n[smáatriði] Jón tók hundinn.\n" + Q, 2, /nákvæmlega eitt \[aðalatriði\], en hér eru 0/);
  at(F + "[aðalatriði] Jón sá hund.\n[aðalatriði] Jón tók hundinn.\n" + Q, 5, /nákvæmlega eitt \[aðalatriði\], en hér eru 2/);
  at(F + "[aðalatriði] Jón sá hund.\n[annað] Jón tók hundinn.\n" + Q, 1, /að minnsta kosti 1 \[smáatriði\]/);
  /* one sentence per line, ended */
  at(HEAD + "[vandi] Jón sá hund. Hann tók hundinn.\n[útkoma] Jón sá hund.\n" + Q, 4, /ein setning í hverri línu/);
  at(HEAD + "[vandi] Jón sá hund\n[útkoma] Jón tók hundinn.\n" + Q, 4, /setning á að enda á punkti/);
  /* a pronoun's referent: a word earlier in the text … */
  at(HEAD + "[vandi] Jón sá hund.\n[útkoma] Hún{Sara} tók hundinn.\n" + Q, 5, /„Sara“ stendur hvergi framar í textanum/);
  at(HEAD + "[vandi] Hann{Jón} sá hund.\n[útkoma] Jón tók hundinn.\n" + Q, 4, /stendur hvergi framar/);
  at(HEAD + "[vandi] Jón sá hund.\n[útkoma] Hann {Jón} tók hundinn.\n" + Q, 5, /slaufusvigi á að standa beint á eftir fornafni/);
  at(HEAD + "[vandi] Jón sá hund.\n[útkoma] Hann{Jón tók hundinn.\n" + Q, 5, /slaufusvigi án maka/);
  /* … in the same grammatical gender and number, by BÍN */
  at(HEAD + "[vandi] Jón sá hund.\n[útkoma] Hún{Jón} tók hundinn.\n" + Q, 5, /„Hún“ \(kvk ET\) og „Jón“ \(kk ET\) eru ekki í sama kyni og tölu/);
  at(HEAD + "[vandi] Jón sá hund.\n[útkoma] Jón tók það{hund}.\n" + Q, 5, /eru ekki í sama kyni og tölu/);
  at(HEAD + "[vandi] Jón og Sara sáu hund.\n[útkoma] Þeir{Jón og Sara} tóku hundinn.\n" + Q, 5, /„Þeir“ \(kk FT\) og „Jón og Sara“ \(hk FT\)/);
  at(HEAD + "[vandi] Jón sá hund.\n[útkoma] Þau{Jón} tóku hundinn.\n" + Q, 5, /eru ekki í sama kyni og tölu/);
  at(HEAD + "[vandi] Jón sá hund.\n[útkoma] Jón{hund} tók hundinn.\n" + Q, 5, /„Jón“ er ekki persónufornafn í 3\. persónu/);
  /* the target words: on LÍNO-2, and in the text */
  at("# þyngd: 1\n# tegund: saga\n# orð: hundur\n" + S2 + Q, 3, /orðið „hundur“ \(# orð:\) er ekki á LÍNO-2/);
  at("# þyngd: 1\n# tegund: saga\n# orð: áhrif\n" + S2 + Q, 3, /orðið „áhrif“ \(# orð:\) kemur ekki fyrir í textanum/);
  /* a question has exactly one right answer, and its explanation */
  at(HEAD + S2 + "? [aðalatriði] Um hvað er sagan? | Um hund. | Um kött.\n! Skýring.\n", 6, /eitt rétt svar \(fremst\) og tvö eða þrjú röng, en hér eru 2 svör/);
  at(HEAD + S2 + "? [aðalatriði] Um hvað er sagan? | Um hund. | Um kött. | Um hund.\n! Skýring.\n", 6, /sama svarið stendur tvisvar, svo rétta svarið er ekki eitt/);
  at(HEAD + S2 + "? [aðalatriði] Um hvað er sagan? | Um hund. |  | Um kött.\n! Skýring.\n", 6, /tómur reitur/);
  at(HEAD + S2 + "? Um hvað er sagan? | Um hund. | Um kött. | Um hest.\n! Skýring.\n", 6, /a question needs its mark/);
  at(HEAD + S2 + "? [vandi] Um hvað er sagan? | Um hund. | Um kött. | Um hest.\n! Skýring.\n", 6, /óþekkt merki á spurningu: \[vandi\]/);
  at(HEAD + S2 + "? [aðalatriði] Um hvað er sagan? | Um hund. | Um kött. | Um hest.\n", 6, /spurninguna vantar skýringu/);
  at(HEAD + S2, 5, /textann vantar spurningu/);
  at(HEAD + S2 + "! Skýring.\n" + Q, 6, /skýring \(!\) á að standa í línunni á eftir spurningu/);
  at(HEAD + S2 + Q + "[annað] Páll sá hund.\n", 8, /setningar textans eiga að standa á undan spurningunum/);
});

test("without BÍN the referent must still stand earlier; only gender and # orð: wait for the build",
  { skip: py ? false : "no Python 3" }, () => {
    const wrongGender = HEAD + "[vandi] Jón sá hund.\n[útkoma] Hún{Jón} tók hundinn.\n" + Q;
    assert.equal(readOne(wrongGender, { bin: false }).err, undefined);
    assert.match(readOne(wrongGender).err, /ekki í sama kyni og tölu/);
    assert.match(readOne(HEAD + "[vandi] Jón sá hund.\n[útkoma] Hún{Sara} tók hundinn.\n" + Q, { bin: false }).err,
      /stendur hvergi framar/);
  });

test("the same sentence in two texts, or a file name that is not a-z, 0-9 and hyphens, is refused", { skip: py ? false : "no Python 3" }, () => {
  const dir = mkdtempSync(path.join(tmpdir(), "textar-"));
  writeFileSync(path.join(dir, "a.txt"), GOOD, "utf8");
  writeFileSync(path.join(dir, "b.txt"), GOOD, "utf8");
  let r = runPy(`${BIN}
import content_io
try:
    content_io.texts(lookup, ${JSON.stringify(dir)})
except content_io.ContentError as e:
    print("ERR", e)`);
  assert.match(r.stdout, /^ERR content\/textar\/b\.txt:4: setningin stendur líka í öðrum texta/);
  const dir2 = mkdtempSync(path.join(tmpdir(), "textar-"));
  writeFileSync(path.join(dir2, "Saga Um Hund.txt"), GOOD, "utf8");
  r = runPy(`${BIN}
import content_io
try:
    content_io.texts(lookup, ${JSON.stringify(dir2)})
except content_io.ContentError as e:
    print("ERR", e)`);
  assert.match(r.stdout, /^ERR content\/textar\/Saga Um Hund\.txt: skráarheiti texta/);
});

/* ---------- what the build made of them ---------------------------------------- */

test("EX.textar: every text of content/textar/, every sentence parsed, every part named", () => {
  assert.deepEqual(EX.textar.map((t) => t.id), FILES.map((n) => n.replace(/\.txt$/, "")));
  assert.ok(EX.textar.some((t) => t.k === "saga") && EX.textar.some((t) => t.k === "fræðitexti"));
  for (const tx of EX.textar) {
    const src = readFileSync(path.join(root, "content/textar", tx.id + ".txt"), "utf8");
    const written = src.split("\n").filter((l) => l.startsWith("["));
    assert.equal(tx.s.length, written.length, tx.id);
    assert.ok(tx.lvl >= 1 && tx.lvl <= 5);
    tx.s.forEach((s, k) => {
      /* the sentence is the line without its mark and its braces */
      assert.equal(s.t, written[k].replace(/^\[[^\]]*\] /, "").replace(/\{[^{}]*\}/g, ""), tx.id);
      assert.ok(!/[{}[\]]/.test(s.t));
      assert.ok((tx.k === "saga" ? STORY : IDEA).concat("annað").includes(s.p), `${tx.id}: ${s.p}`);
      /* parsed like a sentence of the bank: tokens with a word class, the text they spell */
      assert.ok(s.tok.length >= 3 && s.tok.some((t) => t.c === "sagnorð"), s.t);
      assert.equal(s.tok.map((t) => t.w).join(" ").replace(/ ([.,!?])/g, "$1"), s.t);
    });
    if (tx.k === "fræðitexti") assert.equal(tx.s.filter((s) => s.p === "aðalatriði").length, 1, tx.id);
    assert.ok(tx.q.length >= 1);
    for (const q of tx.q) {
      /* #31 added the summary question, a story's only */
      /* … and #32 the gist question, a subject text's only */
      assert.ok(q.k === "aðalatriði" || (q.k === "samantekt" && tx.k === "saga")
        || (q.k === "kjarni" && tx.k === "fræðitexti"), q.k);
      assert.ok(q.w.length >= 2 && q.w.length <= 3 && !q.w.includes(q.a) && q.why);
    }
  }
});

test("EX.textar: a pronoun points at a pronoun token, and its referent at a word earlier in the text", () => {
  let n = 0;
  for (const tx of EX.textar) tx.s.forEach((s, si) => (s.ref || []).forEach((r) => {
    n++;
    assert.equal(s.tok[r.i].c, "fornafn", `${tx.id}: ${s.tok[r.i].w}`);
    const [ti, a, b] = r.to;
    assert.ok(ti < si || (ti === si && b < r.i), `${tx.id}: the referent of ${s.tok[r.i].w} is not earlier`);
    assert.ok(a <= b && tx.s[ti].tok[b]);
    assert.ok(tx.s[ti].tok.slice(a, b + 1).some((t) => t.c === "nafnorð"), `${tx.id}: no noun in the referent`);
  }));
  assert.ok(n >= 5, "the samples carry pronoun references for #33 to build on: " + n);
  /* the ones a reader can check by eye */
  const dog = EX.textar.find((t) => t.id === "saga-tyndur-hundur");
  const words = (r) => dog.s[r.to[0]].tok.slice(r.to[1], r.to[2] + 1).map((t) => t.w).join(" ");
  assert.equal(words(dog.s[1].ref[0]), "Jón og Sara");
  assert.equal(dog.s[2].tok[dog.s[2].ref[1].i].w, "hans");
  assert.equal(words(dog.s[2].ref[1]), "hund");
  assert.equal(words(dog.s[6].ref[0]), "kona");
  const sleep = EX.textar.find((t) => t.id === "fraedi-svefn");
  assert.equal(sleep.s[sleep.s[5].ref[0].to[0]].tok[sleep.s[5].ref[0].to[1]].w, "Birtan");
  assert.deepEqual(sleep.orð, ["mikilvægur", "heili", "áhrif"]);
});

test("the story map is whole in one sample, so the six marks are all in use", () => {
  const dog = EX.textar.find((t) => t.id === "saga-tyndur-hundur");
  assert.deepEqual([...new Set(dog.s.map((s) => s.p))], STORY);
});

/* ---------- the skill and its first type ---------------------------------------- */

test("Lesskilningur is a skill of year 8, on by default, on the map and in every year's preset", () => {
  const s = skillById("lesskilningur");
  assert.equal(s.nm, "Lesskilningur");
  assert.equal(s.cur, "8.b");
  assert.equal(defaultEnabled().lesskilningur, true);
  for (const y of [8, 9, 10]) {
    assert.ok(presetContent(y).skills.includes("lesskilningur"), y + ". bekkur");
    assert.ok(presetContent(y).types.includes("les_adal"), y + ". bekkur");
  }
  const node = nodeById("les-adalatridi");
  assert.deepEqual([node.cat, node.year, node.types, node.lesson, node.cover], ["lesskilningur", 8, ["les_adal", "les_setning", "les_smaatridi", "les_kjarni"], "lesskilningur", "full"]);
  assert.deepEqual(patternsOfNode(node), ["adalatridi"]);
  assert.ok(patternById("adalatridi").types.includes("les_adal"));
});

test("les_adal is declared at the end of the catalogue: a choice, graded by the app, not recall", () => {
  /* after every type before it; #37's or_eigin and #31's story-map types came after it */
  assert.equal(CATALOGUE_IDS.indexOf("les_adal"), CATALOGUE_IDS.indexOf("or_merking") + 1);
  const c = catalogueEntry("les_adal");
  assert.deepEqual([c.skill, c.renderer, c.grader, c.recall], ["lesskilningur", "choice", "app", false]);
  assert.deepEqual(c.tags, ["les"]);
  assert.deepEqual(c.bands, [1], "three texts do not follow the band");
});

test("les_adal: the whole text, the question as written, one right answer among the shuffled ones — on every text", () => {
  const seen = new Set(), first = new Set();
  for (const t of buildFresh("les_adal", 1, 300)) {
    const tx = EX.textar.find((x) => t.item.startsWith(`les:${x.id}#`));
    assert.ok(tx, t.item);
    const q = tx.q[+t.item.split("#")[1]];
    seen.add(tx.id);
    assert.equal(t.type, "choice");
    assert.equal(t.skill, "lesskilningur");
    assert.deepEqual(t.text, tx.s.map((s) => s.t), "the pupil reads every sentence, in order");
    assert.ok(t.text.every((s) => !/[{}[\]]/.test(s)), "no mark and no brace reaches the pupil");
    assert.equal(t.question, q.q);
    assert.equal(t.answer, q.a);
    assert.deepEqual([...t.options].sort(), [q.a, ...q.w].sort());
    first.add(t.options[0] === t.answer);
    assert.equal(t.why, q.why);
    assert.equal(t.lvl, tx.lvl);
    assert.equal(t.cell, tx.k === "saga" ? "adal:saga" : "adal:fraedi");
    assert.equal(t.title, tx.k === "saga" ? "Um hvað er sagan?" : "Um hvað er textinn?");
    assert.equal(t.word, null);
    assert.deepEqual([...tagsOf(t)], ["les"]);
    assert.equal(lessonFor(t), "lesskilningur");
    assert.equal(judge(t, { picked: t.answer }).ok, true);
    for (const o of t.options.filter((y) => y !== t.answer)) {
      const j = judge(t, { picked: o });
      assert.equal(j.ok, false);
      assert.deepEqual(j.findings.map((f) => f.p), ["adalatridi"]);
    }
    assert.ok(judge(t, { picked: null }).pending, "no pick is no answer");
  }
  assert.equal(seen.size, EX.textar.filter((x) => x.q.some((q) => q.k === "aðalatriði")).length,
    "every text with a main-idea question is asked");
  assert.equal(first.size, 2, "the right answer is not always first");
});

test("les_adal: a text is remembered when it is shown, and a review brings back the one it names", () => {
  const spec = typeById("les_adal");
  const ctx = { S: freshView(1).S, sess: { exSeen: [] }, forcedNoun: null };
  const b = spec.build(lex, freshView(1), () => 0.5);
  const fx = b.effects.filter((e) => e.op === "exSeen");
  assert.equal(fx.length, 1);
  assert.equal(fx[0].key, b.task.item);
  applyEffects(ctx, b.effects);
  assert.deepEqual(ctx.sess.exSeen, [b.task.item]);
  for (const tx of EX.textar.filter((x) => x.q[0].k === "aðalatriði")) {
    const item = `les:${tx.id}#0`;
    for (let k = 0; k < 5; k++)
      assert.equal(spec.build(lex, freshView(1, { force: { item } }), () => k / 5).task.item, item);
  }
  assert.equal(spec.build(lex, freshView(1, { force: { item: "les:ekki-til#0" } }), () => 0.5), null);
  /* a forced cell of another kind of question builds nothing */
  assert.equal(spec.build(lex, freshView(1, { force: { cell: "tengi:en" } }), () => 0.5), null);
});

test("the worked example and the Lesefni page do not use a text the pupil is asked about", () => {
  const taught = JSON.stringify(EXAMPLES.les_adal) + JSON.stringify(LESSONS.find((l) => l.id === "lesskilningur"));
  for (const tx of EX.textar) {
    for (const s of tx.s) assert.ok(!taught.includes(s.t), `${tx.id}: "${s.t}" is shown with its answer before it is asked`);
    for (const q of tx.q) assert.ok(!taught.includes(q.a), `${tx.id}: the answer "${q.a}" is given away`);
  }
});

/* ---------- the review page ------------------------------------------------------ */

test("every text is a card on the review page: the text, its marks as written, the question and its answers", async () => {
  const { items, lists } = await collect();
  const cards = items.filter((it) => it.kind === "textar");
  assert.deepEqual(cards.map((c) => c.file), FILES.map((n) => "content/textar/" + n));
  assert.ok(lists.some((l) => l.file === "content/textar" && l.n === FILES.length));
  for (const c of cards) {
    const tx = EX.textar.find((x) => c.file.endsWith(x.id + ".txt"));
    assert.equal(c.text, tx.s.map((s) => s.t).join(" "));
    assert.equal(c.level, String(tx.lvl));
    assert.equal(c.answer, tx.q[0].a);
    assert.equal(c.explain, tx.q[0].why);
    assert.ok(c.answerLabel.includes(tx.q[0].q));
    assert.deepEqual(Object.fromEntries(c.fields)["tegund"], tx.k);
    for (const w of tx.q[0].w) assert.ok(Object.fromEntries(c.fields)["röng svör"].includes(w));
    /* each sentence with its mark and its referents, as the file has them */
    assert.equal(c.body.filter(([k]) => k === "li").length, tx.s.length);
    assert.ok(c.body.every(([k, v]) => k !== "li" || /^\[[^\]]+\] /.test(v)));
    const src = readFileSync(path.join(root, c.file), "utf8");
    assert.ok(src.split("\n")[c.line - 1].startsWith("["), "the card's line is the first sentence");
  }
  assert.ok(cards.some((c) => c.body.some(([, v]) => v.includes("{Jón og Sara}"))));
});
