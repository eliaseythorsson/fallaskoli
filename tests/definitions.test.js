/* Word definitions: the conversion, the class gate, and what reaches the screen.
 *
 * Every test here is a bug the owner reported against v5.7 by name. They are
 * kept together because they are one chain — ÍNO XML -> tools/ino.mjs ->
 * data/ino.json -> build_bundle.py -> data_bundle -> core/definitions.js ->
 * ui/dom.js — and because the chain is exactly where each of them hid: the
 * endpoint was right, the data was wrong, and no test asked the question the
 * SCREEN asks. That is design rule 6, and it is the second time it has had to
 * be applied here.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  isGrammarGloss, stripGrammarLead, stripClassLead, presentable,
  bundledSource, createDefinitions, remoteSource,
} from "../src/js/core/definitions.js";
import { defBox } from "../src/js/ui/dom.js";
import { CLASSNAME } from "../src/js/core/marks.js";
import { meaningPool } from "../src/js/tasks/ordaford.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FIXTURES = path.join(ROOT, "tests", "fixtures");

/* ================= 1. the conversion ==================================== */

/* Run the real tool on a miniature of the real format. Nothing is mocked: if
   `tools/ino.mjs` stops rejecting a class mismatch, this fails. */
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "ino-"));
execFileSync("node", [
  path.join(ROOT, "tools", "ino.mjs"),
  path.join(FIXTURES, "ino-sample.xml"),
  "--ordasafn", path.join(FIXTURES, "ino-lexicon.json"),
  "--ut", path.join(outDir, "ino.json"),
  "--skyrsla", path.join(outDir, "report.json"),
], { stdio: "pipe" });

const converted = JSON.parse(fs.readFileSync(path.join(outDir, "ino.json"), "utf8"));
const report = JSON.parse(fs.readFileSync(path.join(outDir, "report.json"), "utf8"));
/* The fixture's lexicon: 1 sá|fn, 2 slá|so, 3 skepna|kvk, 4 allur|fn,
   5 hestur|kk, 6 ljós|hk, 7 ljós|lo. */
const E = converted.entries;

test("the output declares its format, so a stale file can be recognised", () => {
  assert.equal(converted.format, 2);
});

test("a verb definition is NOT attached to a pronoun of the same spelling", () => {
  /* The owner: *"the definition is given for the verb sá 'dreifa fræi,
     sáðkorni, í jörð'. … the definition of Sá - fornafn, has incorrectly been
     written with the definition of sá - sögn."* */
  assert.equal(E["1"], undefined);
  assert.ok(report.examples.wrongClass.some((x) => x.lemma === "sá"));
});

test("a noun definition is NOT attached to a verb of the same spelling", () => {
  /* The owner, on "Beygðu sögnina": *"Hoover showed 'slá sagnorð' but the
     definition was for slá nafnorð 'lárrétt stöng…'"*. */
  assert.equal(E["2"], undefined);
  assert.ok(report.examples.wrongClass.some((x) => x.lemma === "slá"));
});

test("the definition and the example come from the SAME sense, the first", () => {
  /* The owner: *"The first definition in ÍNO is dýr, dæmi 'mér þykir gaman að
     umgangast skepnur'. Fallaskóli shows … the second definition … but gives
     the example of the first."* */
  assert.equal(E["3"].def, "dýr");
  assert.equal(E["3"].example, "mér þykir gaman að umgangast skepnur");
  assert.equal(E["3"].senses[1].def, "hnjóðsyrði um mann, óþokki");
});

test("a sub-sense is a sense of its own and does not swallow its parent", () => {
  assert.equal(E["5"].def, "stórt húsdýr sem hægt er að ríða á");
  assert.equal(E["5"].example, "hesturinn hljóp yfir túnið");
  assert.equal(E["5"].senses.length, 2);
  assert.equal(E["5"].senses[1].def, "fimleikaáhald");
});

test("homographs across classes keep their own definitions", () => {
  assert.equal(E["6"].def, "það sem gerir okkur kleift að sjá");
  assert.equal(E["7"].def, "bjartur að lit");
});

test("every converted entry records the class it was matched on", () => {
  for (const [id, v] of Object.entries(E)) {
    assert.ok(v.cls, `entry ${id} (${v.lemma}) has no cls`);
  }
});

/* This is the test that would have failed on v5.7's tools/ino.mjs. It is worth
   stating as a rule rather than as three examples: no entry may ever carry a
   class the vocabulary disagrees with. */
test("no entry disagrees with the vocabulary about the word class", () => {
  const lex = JSON.parse(fs.readFileSync(path.join(FIXTURES, "ino-lexicon.json"), "utf8"));
  const byId = new Map(lex.w.map((w) => [String(w.i), w]));
  for (const [id, v] of Object.entries(E)) {
    if (id.startsWith("l:")) continue;
    assert.equal(v.cls, byId.get(id).c, `${v.lemma} (${id})`);
  }
});

/* v6.9 — the owner's list of 493 words with no meaning. Most were simply
   newer than data/ino.json; these are the shapes the converter itself lost. */

test("a two-class label attaches to each class it names, and only those", () => {
  /* ÍNO: milli "preposition/adverb"; blindandi "adjective/adverb". */
  assert.equal(E["8"].def, "á svæðinu sem aðskilur tvennt");
  assert.equal(E["9"].def, "á svæðinu sem aðskilur tvennt");
  assert.equal(E["11"].cls, "ao");
  assert.equal(report.rejected.noClass, 0);
});

test("an ordinal numeral is matched to the ordinal", () => {
  assert.equal(E["10"].def, "sá sem kemur næst á eftir öðrum");
  assert.equal(E["10"].cls, "rt");
});

test("a plural-only headword finds the singular the vocabulary files it under", () => {
  assert.equal(E["12"].lemma, "bókmennt");
  assert.equal(E["12"].def, "ritverk sem hafa listrænt gildi");
});

test("a spelling variant shares the definition, and a 'sjá X' pointer is followed", () => {
  assert.equal(E["14"].def, E["13"].def);
  assert.equal(E["16"].def, "áttfætt smádýr sem spinnur vef");
  assert.notEqual(E["16"].def, "sjá kónguló");
});

test("the report lists every word still without a definition, with a reason", () => {
  const w = new Set(report.unmatched.words.map((u) => u.lemma));
  assert.deepEqual(w, new Set(["ókunnugt", "sá", "slá"]));
  assert.ok(report.unmatched.words.every((u) => u.why));
});

/* ================= 2. a class label is not a meaning ==================== */

test("isGrammarGloss knows a class label from a definition", () => {
  assert.equal(isGrammarGloss("óákveðið fornafn"), true);
  assert.equal(isGrammarGloss("Óákveðið fornafn."), true);
  assert.equal(isGrammarGloss("persónufornafn"), true);
  assert.equal(isGrammarGloss("ábendingarfornafn"), true);
  assert.equal(isGrammarGloss("atviksorð"), true);
  assert.equal(isGrammarGloss("spurnarfornafn / óákveðið fornafn"), true);
  assert.equal(isGrammarGloss("dýr / planta"), false);
  assert.equal(isGrammarGloss("laus greinir"), true);
  /* Real definitions that merely mention grammar are definitions. */
  assert.equal(isGrammarGloss("orð sem stendur í stað nafnorðs"), false);
  assert.equal(isGrammarGloss("stórt húsdýr sem hægt er að ríða á"), false);
  assert.equal(isGrammarGloss("dreifa fræi, sáðkorni, í jörð"), false);
  assert.equal(isGrammarGloss(""), false);
  assert.equal(isGrammarGloss(null), false);
});

test("a purely grammatical bracket comes off; a real one stays", () => {
  assert.equal(
    stripGrammarLead("(1. persóna eintala) sá eða sú sem talar eða skrifar hverju sinni"),
    "sá eða sú sem talar eða skrifar hverju sinni");
  assert.equal(
    stripGrammarLead("(um veður) bjartur og hlýr"),
    "(um veður) bjartur og hlýr");
  assert.equal(stripGrammarLead("bjartur að lit"), "bjartur að lit");
});

test("while the word class IS the question, a class label is not shown", () => {
  const gloss = { def: "óákveðið fornafn", example: "hann bauð allri fjölskyldunni í mat", source: "ÍNO" };
  assert.equal(presentable(gloss, { hideGrammar: true }), null);
  const open = presentable(gloss, { hideGrammar: false });
  assert.equal(open.def, "óákveðið fornafn");
  assert.equal(open.grammar, true);
});

/* ================= 3. what the SCREEN gets ============================== */

/* `defBox` is the one place that decides what the definition line looks like,
   for all ten task types. These tests call it the way ui/render.js calls it. */

const app = (entry) => ({ defs: createDefinitions([bundledSource()]), lex: null, entry });

test("the word-class question shows no definition that names the word class", () => {
  /* The owner: *"the sentence 'Allir krakkar komu' was shown where the word to
     be categorized was 'Allir'. Below the sentence the word category … was
     prominently shown 'óákveðið fornafn'."* */
  const allur = { o: "allur", c: "fn", fl: "fornafn", d: "óákveðið fornafn",
                  x: "hann bauð allri fjölskyldunni í mat", ds: "ino" };
  const html = defBox(app(), allur, { locked: true });
  assert.ok(!html.includes("óákveðið fornafn"), html);
  assert.ok(html.includes("skýring ekki komin"), html);
});

test("the word-class question does not open a definition on hover", () => {
  const hestur = { o: "hestur", c: "kk", fl: "nafnorð",
                   d: "stórt húsdýr sem hægt er að ríða á", ds: "ino" };
  const locked = defBox(app(), hestur, { locked: true });
  /* No `data-dfn`, no `.dfn` class and no tabindex: the delegated listener in
     `wireGlossary` matches `.gl, .dfn`, so there is nothing for it to find, and
     the keyboard cannot reach it either. */
  assert.ok(!locked.includes("data-dfn"), locked);
  assert.ok(!/class="dfn"/.test(locked), locked);
  assert.ok(!locked.includes("tabindex"), locked);
  assert.ok(locked.includes("dfnlocked"), locked);
  /* Unlocked — which is what happens after the answer — it opens again. */
  const open = defBox(app(), hestur, {});
  assert.ok(open.includes("data-dfn"), open);
});

test("a class label is labelled as one when it is finally shown", () => {
  const allur = { o: "allur", c: "fn", fl: "fornafn", d: "óákveðið fornafn", ds: "ino" };
  const html = defBox(app(), allur, {});
  assert.ok(html.includes("deflabel"), html);
  assert.ok(html.includes("óákveðið fornafn"), html);
});

test("the source line says where the definition actually came from", () => {
  /* The owner: *"Why is the heimild: handvirkt? I thought all our definitions
     were from ÍNO?"* They were; `bundledSource` reported "handskrifað" for
     every word because it never read `ds`. */
  const src = bundledSource();
  assert.equal(src.get({ o: "hestur", d: "…", ds: "ino" }).source, "ÍNO");
  assert.equal(src.get({ o: "maður", d: "…", ds: "hand" }).source, "handskrifað");
  assert.equal(src.get({ o: "x" }), null);
});

test("getSync never returns a promise — the renderer cannot await", () => {
  /* Kept from v5.6: this exists only to stop a future 'simplification' of
     getSync into something asynchronous. The definition line is written during
     a synchronous render; a promise there shows up as [object Promise]. */
  const slow = { name: "remote", get: async () => ({ def: "aldrei" }) };
  const defs = createDefinitions([slow, bundledSource()]);
  const v = defs.getSync({ o: "hestur", d: "gott dýr", ds: "ino" });
  assert.equal(v.def, "gott dýr");
  assert.equal(typeof v.then, "undefined");
});

test("the remote source asks for the word class, not just the lemma", () => {
  /* A lemma-only lookup cannot tell the pronoun *sá* from the verb *sá*, which
     is the whole of the fault above — so the class travels with the request. */
  let asked = null;
  const src = remoteSource("", { fetchImpl: async (u) => { asked = u; return { ok: false }; } });
  return src.get({ o: "sá", c: "fn", i: 478812 }).then(() => {
    assert.ok(asked.includes("cls=fn"), asked);
    assert.ok(asked.includes("bin_id=478812"), asked);
  });
});

/* ================= 4. the data actually shipped ========================= */

const { DATA } = await import("../data/data_bundle.js");
const wordsOf = (lemma) => DATA.lex.w.filter((w) => w.o === lemma);

const VERIFIED = !!(DATA.defs && DATA.defs.verified);

test("no word carries the definition of a different word class", () => {
  /* The *sá* / *slá* fault, against whatever data is actually in the bundle.
     What must never come back is the definition of ANOTHER class arriving on a
     word; a pronoun having a pronoun's entry is correct, however terse. */
  const sa = wordsOf("sá").find((w) => w.c === "fn");
  assert.ok(sa, "sá should be in the vocabulary as a pronoun");
  assert.notEqual(sa.d, "dreifa fræi, sáðkorni, í jörð", "the verb sá again");

  if (VERIFIED) {
    const sla = wordsOf("slá").find((w) => w.c === "so");
    assert.ok(sla, "slá should be in the vocabulary as a verb");
    assert.ok(!/lárétt stöng/.test(sla.d || ""), "the noun slá again: " + sla.d);
  } else {
    /* `slá` cannot be checked here and saying so is the honest assertion.
       A `data/ino.json` written before tools/ino.mjs recorded the word class
       carries no class to check against, and this is the residual risk the
       build prints a warning about. What CAN be asserted is that the bundle
       declares itself unverified, so that warning was certainly printed —
       otherwise the gap would be silent, which is the failure mode this whole
       file exists to prevent. */
    assert.equal(DATA.defs.verified, false);
    assert.ok(DATA.defs.format < 2,
      "the bundle claims a verified format but did not set `verified`");
  }
});

/* ---------------------------------------------------------------------------
 * WHAT REPLACED TWO TESTS THAT WERE WRONG, AND WHY IT IS WORTH THE PARAGRAPH
 *
 * Until the owner re-ran `tools/ino.mjs`, `build_bundle.py` suppressed every
 * ÍNO entry on a function word, because a file with no word class in it cannot
 * be checked. Two tests here asserted the RESULT of that suppression —
 * "*allur* has no definition", "no function word's definition is a class name"
 * — and called it a rule.
 *
 * It was not a rule. It was a symptom of missing data, and the moment the data
 * arrived the tests failed on a bundle that was finally correct:
 *
 *   allur|fn: óákveðið fornafn
 *   enginn|fn: óákveðið fornafn
 *   … nine more
 *
 * That IS what Íslensk nútímamálsorðabók says about *allur*. A function word
 * has no meaning to describe, so the dictionary gives its class instead. The
 * data is right; the tests encoded a workaround.
 *
 * The rule the owner actually asked for was never about the data. It is about
 * the SCREEN: *"the word category … was prominently shown"* where the meaning
 * belongs, in the one question whose answer is the word category. So that is
 * what is tested now — `defBox` is called the way ui/render.js calls it, over
 * every function word in the real bundle, and the answer may not be in what it
 * returns. This test would have failed on v5.7 for the right reason, and it
 * passes whether or not the dictionary has been installed.
 */
/* The eleven entries the owner's own build produced, copied from the failure it
   caused. They are here as literals and not read from the bundle on purpose:
   this test must be unable to pass vacuously on a build where the dictionary is
   not installed and there is nothing to leak. */
const REAL_CLASS_GLOSSES = [
  ["allur", "fn", "óákveðið fornafn"],
  ["enginn", "fn", "óákveðið fornafn"],
  ["neinn", "fn", "óákveðið fornafn"],
  ["einn", "fn", "óákveðið fornafn"],
  ["sumur", "fn", "óákveðið fornafn"],
  ["samur", "fn", "óákveðið fornafn"],
  ["báðir", "fn", "óákveðið fornafn"],
  ["sami", "fn", "óákveðið fornafn"],
  ["öllsömul", "fn", "óákveðið fornafn:"],
  ["sitthvað", "fn", "óákveðið fornafn"],
  ["mestallur", "fn", "óákveðið fornafn"],
  ["hinn", "gr", "ákveðinn greinir"],
  ["þessi", "fn", "ábendingarfornafn"],
  ["ég", "pfn", "persónufornafn"],
];

test("no word-class question shows the class in its definition line", () => {
  const defs = createDefinitions([bundledSource()]);
  const box = (w) => defBox({ defs }, { ...w, fl: CLASSNAME[w.c] }, { locked: true });

  /* 1. The real entries, as literals. */
  const leaked = REAL_CLASS_GLOSSES.filter(([o, c, d]) =>
    box({ o, c, d, ds: "ino" }).includes(CLASSNAME[c]));
  assert.deepEqual(leaked.map(([o, , d]) => `${o}: ${d}`), []);

  /* 2. And a sweep over whatever this build actually shipped, so a class label
        ÍNO phrases some other way is caught too. */
  const FUNCTION = new Set(["fn", "pfn", "gr", "st", "fs", "uh", "nhm", "to", "rt"]);
  const leaks = DATA.lex.w
    .filter((w) => FUNCTION.has(w.c) && w.d && box(w).includes(CLASSNAME[w.c]))
    .map((w) => `${w.o}|${w.c}: ${w.d}`);
  assert.deepEqual(leaks.slice(0, 12), []);
});

test("a class label is not offered as a vocabulary question", () => {
  /* Once the dictionary is installed, *allur* has a definition — "óákveðið
     fornafn" — and `taskMeaning` picks from words that have one. "Hvað þýðir
     allur?" with that as the model answer is not a vocabulary question; it is
     the analysis question with the answer printed underneath. */
  const bad = DATA.lex.w.filter((w) => w.d && isGrammarGloss(w.d));
  assert.ok(meaningPool(DATA.lex.w).length > 1000, "the vocabulary pool collapsed");
  assert.deepEqual(
    meaningPool(DATA.lex.w).filter((w) => bad.includes(w)).map((w) => w.o).slice(0, 8), []);
});

test("a class label at the HEAD of a definition comes off, the rest stays", () => {
  /* Found by the test above, on the owner's own data, after the dictionary was
     installed. `isGrammarGloss` catches the bare label; most of ÍNO's function
     words open with the label and then explain, and the explanation is worth
     keeping — it is the only help those words ever get. */
  assert.equal(
    stripClassLead("ábendingarfornafn; bendir á þann sem tiltekinn er"),
    "bendir á þann sem tiltekinn er");
  assert.equal(
    stripClassLead("eignarfornafn, almennt á eftir nafnorðinu"),
    "almennt á eftir nafnorðinu");
  assert.equal(stripClassLead("samtenging í upphafi skilyrðissetningar"),
    "í upphafi skilyrðissetningar");
  assert.equal(stripClassLead("fleyguð samtenging (aðaltenging)"), "(aðaltenging)");
  /* A whole bracket that opens with a label goes whole — cutting inside it
     would leave the closing one behind. */
  assert.equal(
    stripClassLead("(afturbeygt eignarfornafn; x = einhver) sem x á, sem tilheyrir x"),
    "sem x á, sem tilheyrir x");
  /* Nothing but the label leaves nothing. */
  assert.equal(stripClassLead("óákveðið fornafn"), "");
  /* And a real definition is untouched, brackets and all. */
  assert.equal(stripClassLead("stórt húsdýr sem hægt er að ríða á"),
    "stórt húsdýr sem hægt er að ríða á");
  assert.equal(stripClassLead("(um veður) bjartur og hlýr"), "(um veður) bjartur og hlýr");
  assert.equal(stripClassLead(""), "");
});

test("the explanation still arrives once the answer is in", () => {
  /* Everything above is about the question while it is open. After the verdict
     the whole entry is shown, class label and all — that is where it helps. */
  const d = { def: "ábendingarfornafn; bendir á þann sem tiltekinn er", source: "ÍNO" };
  assert.equal(presentable(d, { hideGrammar: false }).def, d.def);
  assert.equal(presentable(d, { hideGrammar: true }).def, "bendir á þann sem tiltekinn er");
});
