/* Sentence frames — the answer to "setningabankinn hefur ekkert dæmi um hana".
 *
 * The owner named one word: *bílstjórana*. The first test is that word, because
 * a fix that cannot be checked against the report it came from is not a fix.
 * The rest state the rules the substitution has to obey, so that a future change
 * to the sentence bank cannot quietly break them.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, newSession } from "../src/js/core/state.js";
import { taskReverse } from "../src/js/tasks/lysingarord.js";
import { taskFill } from "../src/js/tasks/nafnord.js";
import { show, rng } from "./helpers.js";
import { frameIndex, fillFrame, acceptsNoun, nounSentence, adjectiveSentence,
         sentenceText, frameCoverage, candidateNouns, showable,
         fittingAdjectives } from "../src/js/tasks/frames.js";

const lex = buildLexicon(DATA);

const ctx = () => {
  const S = blankState();
  return { lex, S, sess: newSession(S), forcedNoun: null };
};

/** The marks a word can honestly be asked about: those whose surface form has
    exactly one analysis inside the word's own paradigm. `taskReverse` uses the
    same rule, because a question with two right answers is not a question. */
function askableMarks(w) {
  const counts = new Map();
  Object.entries(w.forms).forEach(([, ff]) =>
    ff.forEach((f) => counts.set(f, (counts.get(f) || 0) + 1)));
  return Object.keys(w.forms).filter((m) => w.forms[m].some((f) => counts.get(f) === 1));
}

/* ================= 1. the word the owner named ========================== */

test("bílstjórana can be shown inside a sentence", () => {
  const w = lex.lookup("bílstjóri", "kk");
  assert.ok(w, "bílstjóri should be in the vocabulary");
  const form = w.forms["ÞFFTgr"][0];
  assert.equal(form, "bílstjórana");
  const made = nounSentence(lex, w, "ÞFFTgr", form, { rng });
  assert.ok(made, "no frame for ÞFFTgr");
  assert.ok(made.s.t.includes("bílstjórana"), made.s.t);
  assert.equal(made.s.tok[made.i].m, "ÞFFTgr");
  assert.equal(made.s.tok[made.i].l, "bílstjóri");
});

/* ================= 2. coverage, measured ================================ */

/* Cells that stay on the bare-form route on purpose: [class, mark]. A frame
   that would cover them exists or existed, and what it produced was not
   Icelandic anyone says. Each line is a decision; none of them is "no one
   got round to it" — the test below fails for any other gap. */
const BARE_ON_PURPOSE = [
  /* v6.4: the indefinite dative of a time word ("fyrir mánuði" / "fyrir
     kvöld": no frame is right for all of them) and of a sum of money */
  [/^(time|money)$/, /^ÞGF(ET|FT)$/],
  /* v6.13 (item 30), from narrowing the frames that took any noun
     (noun_classes.py NEED_FIX):
     "Þetta gengur ekki án ___" was the bare genitive of everything, and gave
     "án morguns", "án kvölda", "án hverfa", "án lands", "án grass" … */
  [/^time$/, /^EF(ET|FT)$/],
  [/^(place|settlement)$/, /^EF(ET|FT)$/],
  [/^(nature|plant)$/, /^EFET$/],
  /* … and "Ferðin tafðist vegna ___" the genitive with the article: "vegna
     nefsins", "vegna herbergisins", "vegna tunglsins", "vegna síðunnar" */
  [/^(body|room|sky|text)$/, /^EFETgr$/],
];

test("every concrete noun form the analysis can ask about has a sentence", () => {
  /* Abstract nouns are only taken by the frames that accept anything, and a
     handful of their genitive cells have no natural frame; everything that
     can be seen or visited must be fully covered. */
  const missing = [];
  for (const w of lex.nouns) {
    if (w.nx || w.s === "abstract") continue;
    for (const m of askableMarks(w)) {
      /* v6.4: a cell nobody is shown (no plural, no article) needs no frame;
         nor do the cells listed above. */
      if (!showable(w, m)) continue;
      if (BARE_ON_PURPOSE.some(([cls, mark]) => cls.test(w.s) && mark.test(m))) continue;
      /* its only frames are "Litur ___ er fallegur / breyttist", and a
         compound of a noun the sentence already has is a repeat (v6.13) */
      if (w.o === "varalitur" && m === "EFETgr") continue;
      if (!nounSentence(lex, w, m, w.forms[m][0], { rng })) missing.push(`${w.o}|${w.c}|${w.s} ${m}`);
    }
  }
  assert.deepEqual(missing.slice(0, 30), [], `${missing.length} uncovered`);
});

test("abstract nouns are covered in every form but one", () => {
  /* v6.13 (item 30): the genitive with the article had one frame, "Ferðin
     tafðist vegna ___", and an idea is seldom what holds up a trip ("vegna
     hamingjunnar", "vegna framtíðarinnar"). The frame takes no abstract noun
     now, and that cell is analysed as a bare form until the bank has a
     sentence for it ("Við ræddum mikilvægi ___" would be one). Every other
     cell of every abstract noun that is used in frames has a sentence. */
  const missing = new Map();
  for (const w of lex.nouns) {
    if (w.nx || w.s !== "abstract") continue;
    for (const m of askableMarks(w)) {
      if (!showable(w, m)) continue;
      if (!nounSentence(lex, w, m, w.forms[m][0], { rng })) missing.set(m, (missing.get(m) || 0) + 1);
    }
  }
  assert.deepEqual([...missing.keys()], ["EFETgr"], JSON.stringify([...missing]));
  const cov = frameCoverage(lex).noun.byClass.abstract;
  assert.ok(cov.have / cov.want > 0.88, `${(100 * cov.have / cov.want).toFixed(1)}%`);
});

test("an adjective is only put into a sentence beside a noun it suits", () => {
  /* v6.4. Any adjective used to go into any adjective slot: "Þetta er
     svangasta hjólið". Now only the short list of adjectives that suit the
     kind of noun described (FITTING in tasks/frames.js), and only right
     before that noun; everything else is shown as a bare form. */
  const idx = frameIndex(lex);
  let frames = 0;
  for (const list of idx.adj.values()) {
    for (const f of list) {
      frames += 1;
      const noun = f.s.tok[f.i + 1];
      assert.equal(noun.c, "nafnorð", f.s.t);
      const entry = lex.entryForToken(noun);
      assert.deepEqual(f.fits, fittingAdjectives(entry.s), f.s.t);
      assert.ok(f.fits.length > 0, f.s.t);
    }
  }
  assert.ok(frames > 20, `only ${frames} adjective frames`);
  const odd = lex.lookup("svangur", "lo");
  for (const m of askableMarks(odd)) assert.equal(adjectiveSentence(lex, odd, m, odd.forms[m][0], { rng }), null);
  const fine = lex.lookup("gamall", "lo");
  assert.ok(askableMarks(fine).some((m) => adjectiveSentence(lex, fine, m, fine.forms[m][0], { rng })));
});

test("verbs are never substituted into a frame", () => {
  const c = ctx();
  let verbs = 0, framedVerbs = 0;
  for (let i = 0; i < 1500; i++) {
    const t = show(c, taskReverse);
    if (!t || t.skill !== "sagnord") continue;
    verbs += 1;
    if (t.framed) framedVerbs += 1;
  }
  assert.ok(verbs > 20, `only ${verbs} verb questions seen`);
  assert.equal(framedVerbs, 0);
});

test("the analysis question almost always has a sentence now", () => {
  const c = ctx();
  let n = 0, bare = 0;
  for (let i = 0; i < 2000; i++) {
    const t = show(c, taskReverse);
    if (!t) continue;
    n += 1;
    if (t.standalone) bare += 1;
  }
  assert.ok(n > 500, `only ${n} questions built`);
  /* Everything left is a verb form the bank has never seen. Before frames this
     was above 80%. */
  /* v6.4: adjectives now go into a sentence only where they suit the noun, so
     most adjective forms are shown bare again. Nouns are not. */
  assert.ok(bare / n < 0.5, `${(100 * bare / n).toFixed(1)}% still standalone`);
});

/* ================= 3. the rules the substitution obeys ================== */

const someFrame = (mark) => frameIndex(lex).noun.get(mark)[0];

test("the substituted word keeps the frame's mark and nothing else moves", () => {
  const frame = someFrame("ÞFETgr");
  const w = lex.lookup("bíll", "kk");
  const made = fillFrame(frame, w, w.forms.ÞFETgr[0]);
  assert.equal(made.tok.length, frame.s.tok.length);
  made.tok.forEach((t, j) => {
    if (j === frame.i) return;
    assert.deepEqual(t, frame.s.tok[j], `token ${j} changed`);
  });
  assert.equal(made.tok[frame.i].m, frame.s.tok[frame.i].m);
});

test("a capital at the start of a sentence stays a capital", () => {
  const frames = frameIndex(lex).noun;
  let checked = 0;
  for (const [, list] of frames) {
    for (const f of list) {
      if (f.i !== 0) continue;
      const w = lex.lookup("bíll", "kk");
      const m = f.s.tok[0].m;
      if (!w.forms[m]) continue;
      const made = fillFrame(f, w, w.forms[m][0]);
      assert.equal(made.tok[0].w[0], made.tok[0].w[0].toUpperCase(), made.t);
      checked += 1;
    }
  }
  assert.ok(checked > 0, "no sentence-initial frame to check");
});

test("a derived sentence can never be used as a cloze frame again", () => {
  const frame = someFrame("ÞFETgr");
  const w = lex.lookup("bíll", "kk");
  const made = fillFrame(frame, w, w.forms.ÞFETgr[0]);
  assert.equal(made.derived, true);
  assert.equal(made.slot, null);
  assert.equal(made.fixed, true);
});

test("the replacement's own analysis replaces the old word's uncertainty", () => {
  /* `u` says "this surface form does not settle these features". It belongs to
     the word that stood there, not to the slot. Carrying it across would drop
     rows from a question the new form answers completely. */
  const frame = { s: { lvl: 1, t: "x", tok: [{ w: "skóla", l: "skóli", c: "nafnorð",
    m: "ÞFET", u: ["tala"], r: null, k: "aðalsetning", g: null, x: "no" }] }, i: 0 };
  const w = lex.lookup("bíll", "kk");
  const made = fillFrame(frame, w, "bíl");
  assert.equal(made.tok[0].u, undefined);
});

test("a frame that pins a gender is not given a noun of another gender", () => {
  const idx = frameIndex(lex);
  for (const [mark, list] of idx.noun) {
    for (const f of list) {
      if (!f.rk) continue;
      const other = lex.nouns.find((w) => w.c !== f.rk && w.forms[mark]);
      if (!other) continue;
      /* nounSentence must never return THIS frame for that word. Run it a few
         times: the choice is random, so one call proves little. */
      for (let i = 0; i < 30; i++) {
        const made = nounSentence(lex, other, mark, other.forms[mark][0], { rng });
        if (made) assert.notEqual(made.s.t, sentenceText(f.s.tok),
          `${other.o}|${other.c} put into a ${f.rk} frame`);
      }
      break;
    }
  }
});

test("a frame takes only the classes it names, and never an excluded word", () => {
  const frame = { rk: null, need: ["person", "animal"], ps: null };
  const forms = { NFET: ["x"], NFFT: ["y"] };
  assert.equal(acceptsNoun(frame, { c: "kk", s: "object", forms }, "NFET"), false);
  assert.equal(acceptsNoun(frame, { c: "kk", s: "person", forms }, "NFET"), true);
  assert.equal(acceptsNoun(frame, { c: "kk", s: "person", forms, nx: 1 }, "NFET"), false);
  assert.equal(acceptsNoun({ ...frame, rk: "kvk" }, { c: "kk", s: "person", forms }, "NFET"), false);
});

test("under í or á only a noun with the matching convention is substituted", () => {
  const frame = { rk: null, need: ["place"], ps: "í" };
  const forms = { ÞFETgr: ["x"] };
  assert.equal(acceptsNoun(frame, { c: "kvk", s: "place", p: "í", forms }, "ÞFETgr"), true);
  assert.equal(acceptsNoun(frame, { c: "kvk", s: "place", p: "á", forms }, "ÞFETgr"), false);
  assert.equal(acceptsNoun(frame, { c: "kvk", s: "place", forms }, "ÞFETgr"), false);
  /* And the data agrees: a frame under í never offers strönd, one under á never búð. */
  const idx = frameIndex(lex);
  let under = 0;
  for (const [, list] of idx.noun) for (const f of list) if (f.ps) {
    under += 1;
    const names = candidateNouns(lex, f.s).map((w) => w.o);
    if (f.ps === "í") assert.ok(!names.includes("strönd"), f.s.t);
    if (f.ps === "á") assert.ok(!names.includes("búð"), f.s.t);
  }
  assert.ok(under > 10, `only ${under} frames under í/á`);
});

test("a mass noun is never put into a plural slot", () => {
  const frame = { rk: null, need: ["substance"], ps: null };
  const forms = { ÞFET: ["x"], ÞFFT: ["y"] };
  assert.equal(acceptsNoun(frame, { c: "kvk", s: "substance", forms }, "ÞFET"), true);
  assert.equal(acceptsNoun(frame, { c: "kvk", s: "substance", forms }, "ÞFFT"), false);
});

test("a sentence under með is never a cloze", () => {
  const c = ctx();
  for (let i = 0; i < 400; i++) {
    const t = show(c, taskFill);
    if (t) assert.ok(!t.s.nf, t.s.t);
  }
  assert.ok(lex.sentences.some((s) => s.nf), "no nf sentence in the bank");
});

test("the noun cloze is untouched by any of this", () => {
  /* taskFill reads `slot` and `fixed` from the bank. If a derived sentence ever
     reached it, the same sentence would have two nouns substituted into one
     slot. It cannot, but the cloze should also still work. */
  const c = ctx();
  let built = 0;
  for (let i = 0; i < 200; i++) {
    const t = show(c, taskFill);
    if (!t) continue;
    built += 1;
    assert.equal(t.s.derived, undefined);
    assert.ok(t.answers.length > 0);
  }
  assert.ok(built > 100, `only ${built} clozes built`);
});
