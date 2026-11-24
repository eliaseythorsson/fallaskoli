/* Words allowed into one frame each (issue #20):
   content/setningar/lino-rammar.tsv, pipeline/frame_allow.py, `al` on a
   sentence, tasks/frames.js acceptsNoun.

   A pair says one thing: this word makes sense in this sentence. These tests
   hold the rest to where it always came from:
   - the app lets the named word in, and nothing else changes for the frame;
   - gender, í/á, plural and article are still the frame's and the noun's own;
   - the form in the sentence is the paradigm's cell for the frame's mark —
     the fifteen sentences the first pairs make are written out below, so a
     reader of this file sees exactly what a pupil can now be shown;
   - a pair that names an unknown frame or word, or that could never be
     shown, stops the build with the file and the line (Python, stdlib only);
   - the review page shows every pair as the sentence it makes. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { acceptsNoun, slotFrame, candidateNouns, nounFrames, frameIndex, fillFrame,
  substitutable } from "../src/js/tasks/frames.js";
import { parseTsv, collect, PAIRS_FILE } from "../tools/review.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const lex = buildLexicon(DATA);
const PAIRS = parseTsv(readFileSync(path.join(root, PAIRS_FILE), "utf8"));
const sentence = (t) => lex.sentences.find((s) => s.t === t);
const noun = (o) => lex.nouns.find((w) => w.o === o);

/* What the pairs in the file make, sentence by sentence. Hand-checked: every
   form is BÍN's, in the case, number and definiteness of the frame's slot. */
const MADE = {
  "hugtak → Kennarinn útskýrði dæmið fyrir bekknum í rólegheitum.": "Kennarinn útskýrði hugtakið fyrir bekknum í rólegheitum.",
  "aðferð → Kennarinn útskýrði dæmið fyrir bekknum í rólegheitum.": "Kennarinn útskýrði aðferðina fyrir bekknum í rólegheitum.",
  "regla → Kennarinn útskýrði dæmið fyrir bekknum í rólegheitum.": "Kennarinn útskýrði regluna fyrir bekknum í rólegheitum.",
  "niðurstaða → Kennarinn útskýrði dæmið fyrir bekknum í rólegheitum.": "Kennarinn útskýrði niðurstöðuna fyrir bekknum í rólegheitum.",
  "lausn → Kennarinn útskýrði dæmið fyrir bekknum í rólegheitum.": "Kennarinn útskýrði lausnina fyrir bekknum í rólegheitum.",
  "hugtak → Kennarinn útskýrði dæmið aftur svo allir skildu það.": "Kennarinn útskýrði hugtakið aftur svo allir skildu það.",
  "ástæða → Ég man daginn vel.": "Ég man ástæðuna vel.",
  "regla → Ég man daginn vel.": "Ég man regluna vel.",
  "niðurstaða → Ég man daginn vel.": "Ég man niðurstöðuna vel.",
  "ástæða → Ég man dagana vel.": "Ég man ástæðurnar vel.",
  "regla → Ég man dagana vel.": "Ég man reglurnar vel.",
  "bilun → Ferðin tafðist vegna bílsins.": "Ferðin tafðist vegna bilunarinnar.",
  "misskilningur → Þetta gerðist allt vegna bílsins.": "Þetta gerðist allt vegna misskilningsins.",
  "bilun → Leiknum var frestað vegna veðurs.": "Leiknum var frestað vegna bilunar.",
  "misskilningur → Leiknum var frestað vegna veðurs.": "Leiknum var frestað vegna misskilnings.",
};

test("acceptsNoun: a word named by the frame gets past the class test, and only that word", () => {
  const forms = { ÞFETgr: ["x"], ÞFFTgr: ["y"] };
  const frame = { rk: null, need: ["text", "book"], ps: null, al: ["hugtak|hk"] };
  const hugtak = { o: "hugtak", c: "hk", s: "abstract", forms };
  assert.equal(acceptsNoun({ ...frame, al: null }, hugtak, "ÞFETgr"), false, "without the pair the class decides");
  assert.equal(acceptsNoun(frame, hugtak, "ÞFETgr"), true);
  /* another abstract noun is not let in with it */
  assert.equal(acceptsNoun(frame, { o: "frelsi", c: "hk", s: "abstract", forms }, "ÞFETgr"), false);
  /* the gender is part of the name: a homograph of another gender is another word */
  assert.equal(acceptsNoun(frame, { ...hugtak, c: "kk" }, "ÞFETgr"), false);
  /* a noun of the frame's own classes is taken as before */
  assert.equal(acceptsNoun(frame, { o: "saga", c: "kvk", s: "text", forms }, "ÞFETgr"), true);
});

test("acceptsNoun: a pair answers \"nobody has read this noun\" — for its frame only", () => {
  const forms = { ÞFETgr: ["x"] };
  const w = { o: "ljóstillífun", c: "kvk", s: "abstract", nx: 1, forms };
  assert.equal(acceptsNoun({ rk: null, need: ["abstract"], ps: null, al: null }, w, "ÞFETgr"), false);
  assert.equal(acceptsNoun({ rk: null, need: ["text"], ps: null, al: ["ljóstillífun|kvk"] }, w, "ÞFETgr"), true);
});

test("acceptsNoun: gender, í/á, plural, article and the form are still the frame's and the noun's", () => {
  const forms = { ÞFETgr: ["x"], ÞFFTgr: ["y"] };
  const w = { o: "regla", c: "kvk", s: "abstract", forms };
  const al = ["regla|kvk"];
  assert.equal(acceptsNoun({ rk: "hk", need: ["text"], ps: null, al }, w, "ÞFETgr"), false, "pinned gender");
  assert.equal(acceptsNoun({ rk: null, need: ["text"], ps: "í", al }, w, "ÞFETgr"), false, "no í/á convention");
  assert.equal(acceptsNoun({ rk: null, need: ["text"], ps: "í", al }, { ...w, p: "á" }, "ÞFETgr"), false, "the other preposition");
  assert.equal(acceptsNoun({ rk: null, need: ["text"], ps: "í", al }, { ...w, p: "í" }, "ÞFETgr"), true);
  assert.equal(acceptsNoun({ rk: null, need: ["text"], ps: null, al }, { ...w, np: 1 }, "ÞFFTgr"), false, "not shown in the plural");
  assert.equal(acceptsNoun({ rk: null, need: ["text"], ps: null, al }, { ...w, na: 1 }, "ÞFETgr"), false, "takes no article");
  assert.equal(acceptsNoun({ rk: null, need: ["text"], ps: null, al }, w, "EFFT"), false, "no such form");
});

test("slotFrame carries the pairs, so every caller of acceptsNoun sees them", () => {
  const s = sentence("Ég man daginn vel.");
  assert.deepEqual(slotFrame(s), { rk: null, need: s.need, ps: null, al: s.al });
  assert.ok(Array.isArray(s.al) && s.al.length);
  assert.equal(slotFrame(sentence("Ég man ekki nafn kennarans.")).al, null);
});

test("the data: every pair of the file is on its sentence, and nothing else is", () => {
  const want = new Map();
  for (const r of PAIRS.rows) {
    const [lemma, g] = r.cells["orð"].split("|");
    const w = lex.nouns.filter((x) => x.o === lemma && (!g || x.c === g));
    assert.equal(w.length, 1, `${PAIRS_FILE}:${r.line}: ${lemma}`);
    const list = want.get(r.cells["rammi"]) || [];
    list.push(lemma + "|" + w[0].c);
    want.set(r.cells["rammi"], list);
  }
  const have = lex.sentences.filter((s) => s.al);
  assert.equal(have.length, want.size, "run ./build.sh: the file and the data disagree");
  for (const s of have) assert.deepEqual(s.al, want.get(s.t).sort(), s.t);
  assert.ok(PAIRS.rows.length >= 10);
});

test("the pairs: each word stands in its frame in BÍN's form, and the frame did not take it before", () => {
  const made = {};
  for (const r of PAIRS.rows) {
    const lemma = r.cells["orð"].split("|")[0], s = sentence(r.cells["rammi"]);
    const w = noun(lemma), m = s.tok[s.slot].m;
    assert.ok(substitutable(s), s.t);
    /* the frame's noun classes exclude the word today: that is what a pair is for */
    assert.equal(acceptsNoun({ ...slotFrame(s), al: null }, w, m), false, `${lemma} was already taken by: ${s.t}`);
    assert.ok(candidateNouns(lex, s).includes(w), `${lemma} is not offered by: ${s.t}`);
    assert.ok(nounFrames(lex, w, m).some((f) => f.s === s), `${s.t} is not a frame for ${lemma} ${m}`);
    const f = frameIndex(lex).noun.get(m).find((x) => x.s === s);
    const out = fillFrame(f, w, w.forms[m][0]);
    /* nothing but the slot moved, and the slot kept its mark */
    out.tok.forEach((t, j) => { if (j !== s.slot) assert.equal(t, s.tok[j]); });
    assert.equal(out.tok[s.slot].m, m);
    assert.equal(out.tok[s.slot].l, lemma);
    made[`${lemma} → ${s.t}`] = out.t;
  }
  assert.deepEqual(made, MADE);
});

test("the pairs: no other noun came in with them", () => {
  for (const s of lex.sentences.filter((x) => x.al)) {
    const m = s.tok[s.slot].m;
    const extra = candidateNouns(lex, s).filter((w) => !acceptsNoun({ ...slotFrame(s), al: null }, w, m));
    assert.deepEqual(extra.map((w) => w.o + "|" + w.c).sort(), s.al, s.t);
  }
});

test("the review page shows every pair as the sentence it makes, with the frame's level", async () => {
  const { items } = await collect();
  const mine = items.filter((it) => it.file === PAIRS_FILE);
  assert.equal(mine.length, PAIRS.rows.length);
  for (const it of mine) {
    const f = Object.fromEntries(it.fields);
    assert.equal(it.text, MADE[`${f["orð"].split("|")[0]} → ${f["rammi"]}`], `${PAIRS_FILE}:${it.line}`);
    assert.ok(it.text.includes(it.answer) && it.answer, it.text);
    assert.equal(it.level, String(sentence(f["rammi"]).lvl));
    assert.ok(f["yfirfarið af"] && f["mynd"]);
  }
});

/* ---------- the build stops, and says where ------------------------------ */

const py = ["python3", "python"].find((p) => spawnSync(p, ["-c", "import sys; sys.exit(sys.version_info < (3, 8))"],
  { cwd: root }).status === 0);
const HEAD = "# prófun\northo\n".replace("ortho", ["orð", "rammi", "yfirfarið af", "athugasemd"].join("\t"));

/** Read `lines` as the pairs file and check them against the built data, the
    way pipeline/build_sentences.py does. -> the error text, or "" when all is well. */
function check(lines) {
  const f = path.join(mkdtempSync(path.join(tmpdir(), "pairs-")), "pör.tsv");
  writeFileSync(f, HEAD + lines.map((l) => l.join("\t")).join("\n") + "\n", "utf8");
  const r = spawnSync(py, ["-c", `
import sys, json
sys.path.insert(0, 'pipeline')
import sentences, frame_allow, noun_classes
try:
    pairs = frame_allow.read(sentences.S, ${JSON.stringify(f)})
    frame_allow.resolve(pairs, json.load(open('data/sentences.json')), json.load(open('data/lexicon.json')), noun_classes)
except frame_allow.ContentError as e:
    print(e)
`], { cwd: root, encoding: "utf8", env: { ...process.env, PYTHONHASHSEED: "0", PYTHONDONTWRITEBYTECODE: "1" } });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}

test("the build: an unknown frame or word stops it with the file and the line", { skip: py ? false : "no Python 3" }, () => {
  const EXPLAIN = "Kennarinn útskýrði dæmið fyrir bekknum í rólegheitum.";
  assert.equal(check([["hugtak", EXPLAIN, "x"]]), "", "a good pair passes");
  /* the header is line 2 of the test file, so the first pair is line 3 */
  assert.match(check([["hugtak", EXPLAIN, "x"], ["hugtak", "Kennarinn útskýrði dæmið fyrir bekknum.", "x"]]),
    /pör\.tsv:4: ramminn er ekki setning í content\/setningar\/setningar\.tsv.*unknown frame/);
  assert.match(check([["hugtak", "Hér er alltaf gaman.", "x"]]), /pör\.tsv:3: setningin hefur ekkert orð sem má skipta út/);
  assert.match(check([["qqqorð", EXPLAIN, "x"]]), /pör\.tsv:3: „qqqorð“ er ekki nafnorð í orðaforðanum.*unknown word/);
  /* a verb or an adjective is not a noun of the vocabulary either */
  assert.match(check([["útskýra", EXPLAIN, "x"]]), /pör\.tsv:3: „útskýra“ er ekki nafnorð/);
  assert.match(check([["hugtak|kvk", EXPLAIN, "x"]]), /pör\.tsv:3: „hugtak“ er ekki nafnorð í orðaforðanum í kyninu kvk/);
  assert.match(check([["hugtak|xx", EXPLAIN, "x"]]), /pör\.tsv:3: kynið á eftir \| á að vera kk, kvk eða hk/);
  assert.match(check([["hugtak", EXPLAIN, "x"], ["hugtak", EXPLAIN, "y"]]), /pör\.tsv:4: sama par og í línu 3/);
  assert.match(check([["hugtak", EXPLAIN, ""]]), /pör\.tsv:3 \[yfirfarið af\]: má ekki vera autt/);
});

test("the build: a pair that the frame or BÍN contradicts stops it too", { skip: py ? false : "no Python 3" }, () => {
  /* the frame pins the neuter (… svo allir skildu ÞAÐ) */
  assert.match(check([["regla", "Kennarinn útskýrði dæmið aftur svo allir skildu það.", "x"]]),
    /pör\.tsv:3: ramminn bindur kynið við hk .* en „regla“ er kvk/);
  /* í or á is the noun's own convention, and an idea has none */
  assert.match(check([["hugtak", "Við förum í skólann á morgun.", "x"]]),
    /pör\.tsv:3: eyðan stendur á eftir „í“ en „hugtak“ er hvorki skráð með í né á/);
  /* nobody says *bilanirnar* in a sentence like this: not shown in the plural */
  assert.match(check([["bilun", "Ég man dagana vel.", "x"]]), /pör\.tsv:3: eyðan er í fleirtölu en „bilun“ er ekki sýnt í fleirtölu/);
  /* an adjective stands beside the slot: no other noun is ever put there */
  assert.match(check([["hugtak", "Á morgun kemur nýr dagur.", "x"]]), /pör\.tsv:3: ramminn tekur engin önnur orð/);
  /* the sentence keeps its own noun (need: none) */
  assert.match(check([["hugtak", "Eftir nóttina kemur dagur.", "x"]]), /pör\.tsv:3: ramminn tekur engin önnur orð \(þörfin er „none“/);
  /* unfit in any generated sentence */
  assert.match(check([["stríð", "Þetta gerðist allt vegna bílsins.", "x"]]), /pör\.tsv:3: „stríð“ er á listanum EXCLUDE/);
  /* "Ferðin tafðist vegna umferðarinnar": the app never shows a noun beside its own compound */
  assert.match(check([["umferð", "Ferðin tafðist vegna bílsins.", "x"]]), /pör\.tsv:3: „umferð“ stendur þegar í setningunni \(„Ferðin“\)/);
});

test("the file itself passes the build's checks, and the one-second check counts it", { skip: py ? false : "no Python 3" }, () => {
  const r = spawnSync(py, ["pipeline/content_io.py"], { cwd: root, encoding: "utf8",
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes(`${PAIRS.rows.length} orð leyfð í einstaka ramma`), r.stdout);
});
