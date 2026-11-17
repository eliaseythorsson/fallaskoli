/* The rules that came out of the v6.5 grammar audit, stated as tests so that a
 * later change to the vocabulary, the sentence bank or a builder cannot
 * quietly undo them. Everything here runs against the real data. */

import { test } from "node:test";
import assert from "node:assert/strict";

import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, newSession } from "../src/js/core/state.js";
import { SKILL_IDS } from "../src/js/core/skills.js";
import { taskVerb, tableVerb, subjectLabel } from "../src/js/tasks/sagnord.js";
import { taskReverse } from "../src/js/tasks/lysingarord.js";
import { tablePronoun } from "../src/js/tasks/fornofn.js";
import { tableNumeral } from "../src/js/tasks/toluord.js";
import { show } from "./helpers.js";
import { candidateNouns, frameIndex, substitutable, repeatsNoun } from "../src/js/tasks/frames.js";
import { phrase, wantsHelper } from "../src/js/core/helpers.js";
import { parseRows } from "../src/js/ui/render.js";
import { readMark } from "../src/js/core/marks.js";
import { TERMS } from "../src/js/core/glossary.js";

const lex = buildLexicon(DATA);

function ctxAt(diff) {
  const S = blankState();
  SKILL_IDS.forEach((id) => { S.enabled[id] = true; });
  const sess = newSession(S);
  SKILL_IDS.forEach((id) => { sess.diff[id] = diff; });
  return { lex, S, sess, forcedNoun: null };
}

/* ---------- the vocabulary ---------------------------------------------- */

test("words for acts of violence and for the sex trade are not in the vocabulary", () => {
  const gone = ["nauðgari", "nauðgun", "morð", "fjöldamorð", "sjálfsmorð", "morðingi",
    "hryðjuverk", "aftaka", "ofbeldi", "klám", "vændi", "mella", "nauðga", "myrða",
    "pynta", "runka"];
  for (const o of gone) assert.equal(lex.lemma(o).length, 0, `${o} is still drilled`);
});

test("anatomical terms are just words: they stay, out of generated sentences", () => {
  for (const o of ["typpi", "píka", "rass"]) {
    const w = lex.lemma(o).find((x) => ["kk", "kvk", "hk"].includes(x.c));
    assert.ok(w, `${o} was removed`);
    assert.equal(w.nx, 1, `${o} may be put into a generated sentence`);
  }
});

test("no word is in the vocabulary twice under the same name and class", () => {
  const seen = new Set();
  for (const w of lex.all) {
    const k = w.o + "|" + w.c;
    assert.ok(!seen.has(k), `${k} twice: a drill cannot say which one it means`);
    seen.add(k);
  }
  /* brenna (brann) and brenna (brenndi) are one entry that accepts both */
  const brenna = lex.lookup("brenna", "so");
  assert.deepEqual([...brenna.forms["GM-FH-ÞT-3P-ET"]].sort(), ["brann", "brenndi"]);
});

test("verbs nobody conjugates are not in the conjugation drill", () => {
  for (const o of ["kyrra", "anna", "rússa", "eta", "gjöra", "ræta", "manna"])
    assert.equal(lex.lookup(o, "so"), null, `að ${o} is still a verb to conjugate`);
  for (const [o, c] of [["ýmis", "lo"], ["hvílíkur", "lo"], ["fyrstur", "lo"], ["samur", "fn"]])
    assert.equal(lex.lookup(o, c), null, `${o}·${c}: the schoolbook files it elsewhere`);
});

test("the commonest nouns are not the ones that look like function words", () => {
  const top = (c, n) => lex.byClass[c].filter((w) => w.r <= n).map((w) => w.o);
  assert.ok(!top("kk", 60).includes("viður"), "viður (every *við*) is among the top nouns");
  assert.ok(!top("kk", 60).includes("bar"), "bar (every *bara*)");
  assert.ok(top("kk", 10).includes("maður") && top("kvk", 10).includes("kona"));
});

/* ---------- verbs --------------------------------------------------------- */

test("the middle voice is asked only of a verb that has one in use", () => {
  assert.equal(lex.lookup("hitta", "so").mm, 1);
  assert.equal(lex.lookup("gera", "so").mm, 1);
  assert.ok(!lex.lookup("hlakka", "so").mm, "hlakkast");
  assert.ok(!lex.lookup("pissa", "so").mm, "pissast");
  const ctx = ctxAt(7);
  for (let k = 0; k < 4000; k++) {
    for (const t of [show(ctx, taskVerb), show(ctx, tableVerb), show(ctx, taskReverse)]) {
      if (!t) continue;
      const w = t.v || t.lemmaWord || t.w;
      if (!w || w.c !== "so") continue;
      const marks = t.cells ? t.cells.map((c) => c.m) : [t.m || t.t.m];
      if (!w.mm) assert.ok(marks.every((m) => !/^MM/.test(m)), `${w.o}: ${marks[0]}`);
    }
  }
});

test("a weather verb is asked with *það*, in the third person singular, and has no table", () => {
  const snjoa = lex.lookup("snjóa", "so");
  assert.equal(snjoa.t3, 1);
  const ctx = ctxAt(7);
  /* only the weather verbs, so the test does not wait for the dice */
  const only = { ...lex, verbs: lex.verbs.filter((v) => v.t3) };
  only.byClass = { ...lex.byClass, so: only.verbs };
  const c2 = { ...ctx, lex: only };
  for (let k = 0; k < 300; k++) {
    const t = show(c2, taskVerb);
    if (t) {
      assert.match(t.m, /-3P-ET$/, `${t.v.o}: ${t.m}`);
      assert.match(t.pron, /það$/);
    }
    const r = show(c2, taskReverse);
    if (r && r.lemmaWord && r.lemmaWord.c === "so")
      assert.ok(!/-(1P|2P)-|-3P-FT$/.test(r.t.m), `${r.lemmaWord.o}: ${r.t.w} (${r.t.m})`);
  }
  for (let k = 0; k < 600; k++) {
    const t = show(ctx, tableVerb);
    if (t) assert.ok(!t.w.t3, `a six-cell table of ${t.w.o}`);
  }
});

test("the subjunctive is shown after *þótt*, the indicative after the bare pronoun", () => {
  assert.equal(subjectLabel("GM-VH-NT", "ég"), "þótt ég");
  assert.equal(subjectLabel("GM-VH-ÞT", "við"), "þótt við");
  assert.equal(subjectLabel("GM-FH-ÞT", "ég"), "ég");
  assert.equal(subjectLabel("MM-FH-NT", "þeir"), "þeir");
});

/* ---------- pronouns and numerals --------------------------------------- */

test("a pronoun's helper noun stands the way Icelandic puts it", () => {
  const p = (o, m, c = "fn") => phrase(lex, lex.lookup(o, c), m).text;
  assert.equal(p("sá", "KK-NFET"), "sá maður");
  assert.equal(p("þessi", "KVK-ÞFET"), "þessa konu");
  assert.equal(p("hinn", "KK-NFET"), "hinn maðurinn");       // not "hinn maður"
  assert.equal(p("hinn", "HK-ÞGFET"), "hinu barninu");
  assert.equal(p("hvorugur", "KK-NFET"), "hvorugur maðurinn");
  assert.equal(p("sjálfur", "KVK-NFET"), "sjálf konan");
  assert.equal(p("allur", "KK-NFFT"), "allir menn");
  assert.equal(p("allur", "KK-NFET"), "allur");               // not "allur maður"
  assert.equal(p("sumur", "KK-NFET"), "sumur");
  assert.equal(p("einn", "KK-NFET"), "einn maður");
  assert.equal(p("einn", "KK-NFFT"), "einir");
  /* the free article is declined on its own: "hinn maður" is neither */
  assert.equal(wantsHelper(lex.lookup("hinn", "gr")), false);
  assert.equal(p("hinn", "HK-NFET", "gr"), "hið");
});

test("no table of four identical cells; numerals in the number they have", () => {
  const ctx = ctxAt(4);
  const seen = new Set();
  for (let k = 0; k < 3000; k++) {
    for (const t of [show(ctx, tablePronoun), show(ctx, tableNumeral)]) {
      if (!t) continue;
      const forms = t.cells.map((c) => t.w.forms[c.m].join("|"));
      assert.ok(new Set(forms).size > 1, `${t.title}: ${forms.join(", ")}`);
      seen.add(t.title);
      if (t.kind === "to" && ["tveir", "þrír", "fjórir"].includes(t.w.o))
        assert.match(t.title, /fleirtala/);
      if (t.kind === "to" && !["tveir", "þrír", "fjórir"].includes(t.w.o))
        assert.match(t.title, /eintala/, `${t.title}: an ordinal or *einn* in the plural`);
      assert.ok(!/^hvaða|^samur|^sérhver.*fleirtala/.test(t.title), t.title);
    }
  }
  assert.ok([...seen].some((x) => /^einn · /.test(x)), "einn is never declined");
  assert.ok([...seen].some((x) => /^þriðji · /.test(x)), "no ordinal is ever declined");
});

/* ---------- sentences ------------------------------------------------------ */

test("the reflexive pronoun is never asked its number", () => {
  let n = 0;
  for (const s of lex.sentences) for (const t of s.tok) {
    if (t.l !== "sig" || t.c !== "fornafn" || !t.m) continue;
    n++;
    const rows = parseRows(readMark(t.m), t).map((r) => r.key);
    assert.ok(!rows.includes("tala"), `"${s.t}": tala of ${t.w}`);
  }
  assert.ok(n >= 4, "the bank has lost its reflexives");
});

test("a generated sentence never repeats a noun it already has", () => {
  for (const s of lex.sentences) {
    if (!substitutable(s)) continue;
    for (const w of candidateNouns(lex, s))
      assert.ok(!repeatsNoun(s, s.slot, w), `"${s.t}" + ${w.o}`);
  }
  const milli = lex.sentences.find((s) => s.t === "Gatan liggur milli skóla og kirkju.");
  assert.ok(!candidateNouns(lex, milli).some((w) => w.o === "kirkja"));
});

test("sea creatures and insects do not run, wait or get fed", () => {
  const frame = (text) => lex.sentences.find((s) => s.t === text);
  const takes = (text, o) => candidateNouns(lex, frame(text)).some((w) => w.o === o);
  assert.ok(!takes("Þrjú börn biðu úti.", "fiðrildi"));
  assert.ok(!takes("Hópur hesta stóð á túninu.", "lax"));
  assert.ok(!takes("Ég gaf hestunum vatn.", "maur"));
  assert.ok(takes("Ég sá hest í gær.", "hvalur"), "but they are seen");
  assert.ok(takes("Þetta er mynd af hesti.", "fiðrildi"), "and drawn");
});

test("frames that take any noun do not take God, the devil or a homograph of *við*", () => {
  const any = lex.sentences.find((s) => s.t === "Við töluðum um ferðina.");
  const pool = new Set(candidateNouns(lex, any).map((w) => w.o));
  for (const o of ["guð", "djöfull", "herra", "viður", "á", "typpi", "þræll"])
    assert.ok(!pool.has(o), `"Við töluðum um ${o}…"`);
  assert.ok(pool.has("ferð") && pool.has("kennari") && pool.has("hugmynd"));
});

test("an adjective is not swapped where only the written one fits", () => {
  const idx = frameIndex(lex);
  const all = [...idx.adj.values()].flat();
  assert.ok(!all.some((f) => f.s.tok[f.i].l === "næstur"), "í næsta húsi -> í stærsta húsi");
  assert.ok(!all.some((f) => /grænt grasið/.test(f.s.t)), "grænt grasið -> stórt grasið");
  assert.ok(all.length >= 30, "the attributive frames have gone");
});

/* ---------- the glossary ---------------------------------------------------- */

test("the glossary does not give one example to two terms that exclude each other", () => {
  const ds = (id) => TERMS.find((t) => t.id === id).ds;
  /* *ég hef lesið* is a sagnbót; it was the first example of lýsingarháttur þátíðar too */
  assert.match(ds("sagnbot"), /hef \*\*lesið\*\*/);
  assert.doesNotMatch(ds("lhtht"), /hef \*\*lesið\*\*/);
  assert.match(ds("lhtht"), /er \*\*lesin\*\*/);
  /* the stem of a strong noun is read off the accusative, as the schoolbooks say */
  assert.match(ds("stofn"), /þolfalli eintölu/);
});

/* ---------- explanations ---------------------------------------------------- */

import { explainVerbForm } from "../src/js/tasks/explain.js";
import { describeMark } from "../src/js/core/marks.js";

test("the subject a verb is said to agree with is the noun, not its possessive", () => {
  const s = lex.sentences.find((x) => x.t === "Bróðir minn kemur í kvöld.");
  const i = s.tok.findIndex((t) => t.w === "kemur");
  assert.match(explainVerbForm(s, i), /frumlaginu \*bróðir\*/);
  const v = lex.sentences.find((x) => x.t === "Við borðum matinn saman.");
  assert.match(explainVerbForm(v, 1), /frumlaginu \*við\*/);
});

test("a pronoun is not described as standing without the article", () => {
  assert.equal(describeMark("NFFT", "fornafn"), "nefnifall, fleirtala");
  assert.equal(describeMark("NFFT", "nafnorð"), "nefnifall, fleirtala, án greinis");
  assert.equal(describeMark("ÞGFETgr"), "þágufall, eintala, með greini");
});
