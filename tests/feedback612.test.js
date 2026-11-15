/* v6.12: what a teacher found after 200 answers.
   Orðaforði gave the answer away in the prompt and kept asking the same
   words; the passive split a genitive from its noun; the error hunt
   refused right answers (another tense, the article); a rewrite that left
   out an unchanged end was marked wrong; and spelling slips were reported
   as wrong endings. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { DATA } from "../data/data_bundle.js";
import { EX } from "../data/exercises.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, newSession } from "../src/js/core/state.js";
import { SKILL_IDS } from "../src/js/core/skills.js";
import { createPolicy } from "../src/js/core/policy.js";
import * as MORE from "../src/js/tasks/more.js";
import { transformPassive, transformOpener, gradeTransform, alsoRight, tailLeftOut }
  from "../src/js/tasks/production.js";
import { spellingSlip, diagnose } from "../src/js/core/diagnosis.js";
import { gradeForm } from "../src/js/core/grading.js";

const lex = buildLexicon(DATA);
const sentence = (re) => lex.sentences.find((s) => re.test(s.t));

function ctxAt(diff, S = null) {
  S ||= blankState();
  SKILL_IDS.forEach((id) => { S.enabled[id] = true; });
  const sess = newSession(S);
  Object.keys(sess.diff).forEach((k) => { sess.diff[k] = diff; });
  const all = {};
  SKILL_IDS.forEach((id) => { all[id] = true; });
  return { lex, S, sess, run: {}, forcedNoun: null,
    policy: createPolicy(null, { skills: all, types: {}, levels: {}, attrs: {}, safeVocab: null }) };
}

test("word formation: the prompt does not name the affix; the hint does", () => {
  const ctx = ctxAt(3);
  for (let k = 0; k < 120; k++) {
    const t = MORE.ordFormation(ctx);
    if (!t) continue;
    assert.ok(!/\bó-|-ari\b|-un\b|-ing\b/.test(t.prompt), `affix in the prompt: ${t.prompt}`);
    assert.ok(t.tip && /ó-|-ari|-un|-ing/.test(t.tip), `no affix in the hint: ${t.tip}`);
    assert.equal(gradeForm(t.answers[0], { accepted: t.answers }).verdict, "correct");
  }
});

test("an antonym written without ó- is right too: kurteis → ókurteis or dónalegur", () => {
  const acc = ["ókurteis", ...MORE.synonymsOf("ókurteis", "lo"), ...MORE.antonymsOf("kurteis", "lo")];
  assert.ok(acc.includes("dónalegur"));
});

test("synonyms and antonyms: many words, and no group twice in a fortnight of practice", () => {
  const n = (o) => Object.values(o).reduce((a, g) => a + g.length, 0);
  assert.ok(n(EX.synonyms) >= 150, `only ${n(EX.synonyms)} synonym groups`);
  assert.ok(n(EX.antonyms) >= 130, `only ${n(EX.antonyms)} antonym pairs`);
  assert.ok(EX.wordInContext.length >= 50);
  const ctx = ctxAt(3);
  const seen = new Set();
  for (let k = 0; k < 60; k++) {
    const t = MORE.ordSynAnt(ctx);
    if (!t) continue;
    const key = [t.title, ...[t.question.match(/\*([^*]+)\*\?$/)[1], t.answer].sort()].join("|");
    assert.ok(!seen.has(key), `asked twice on one day: ${key}`);
    seen.add(key);
  }
});

test("the words get rarer as the level rises", () => {
  const avg = (diff) => {
    const ctx = ctxAt(diff);
    const rs = [];
    for (let k = 0; k < 40; k++) {
      const t = MORE.ordSynAnt(ctx);
      if (!t) continue;
      const w = Object.values(t.title === "Andheiti" ? EX.antonyms : EX.synonyms).flat(2)
        .filter((x) => x.o === t.answer && x.r < 99999).map((x) => x.r);
      if (w.length) rs.push(w[0]);
    }
    return rs.reduce((a, b) => a + b, 0) / rs.length;
  };
  assert.ok(avg(5) > avg(1) * 2, "level 5 is not rarer than level 1");
});

test("passive: a genitive goes with its noun (Verkefnum nemenda var safnað …)", () => {
  const s = sentence(/^Kennarinn safnaði verkefnum nemenda/);
  if (!s) return;
  const t = transformPassive(lex, s);
  assert.ok(t);
  assert.match(t.model, /^Verkefnum nemenda var safnað/);
  assert.equal(gradeTransform("Verkefnum nemenda var safnað af kennaranum í möppu", t), "correct");
  assert.equal(gradeTransform("Verkefnum nemenda var safnað í möppu af kennaranum.", t), "correct");
});

test("a rewrite that stops where the sentence stops changing is right", () => {
  const s = sentence(/^Ég gaf gamla manninum bókina mína/);
  if (!s) return;
  const t = transformOpener(lex, s, "Á morgun");
  assert.ok(t);
  assert.equal(gradeTransform("Á morgun gef ég gamla manninum", t), "short");
  assert.equal(gradeTransform("Á morgun gef ég", t), "short");
  assert.equal(gradeTransform("Á morgun gaf ég gamla manninum", t), "wrong");
  assert.equal(gradeTransform("Á morgun", t), "wrong");
  assert.equal(tailLeftOut("Á morgun ég gef", t), null);
});

test("error hunt: another tense when nothing says when, and the article", () => {
  const b = sentence(/^Þrjú börn biðu úti\.$/);
  if (b) assert.ok(alsoRight(lex, b, b.tok.findIndex((x) => x.w === "biðu")).includes("bíða"));
  const h = sentence(/^Ég sagði frá hestum í sveitinni/);
  if (h) assert.ok(alsoRight(lex, h, h.tok.findIndex((x) => x.w === "hestum")).includes("hestunum"));
  const g = sentence(/^Ég sá hestana í gær/);
  if (g) assert.ok(!alsoRight(lex, g, g.tok.findIndex((x) => x.w === "sá")).length, "í gær says when");
});

test("a spelling slip is not a wrong ending", () => {
  assert.ok(spellingSlip("viltuð", "villtuð"));
  assert.ok(spellingSlip("færi", "fæði"));
  assert.ok(!spellingSlip("hestir", "hestar"));
  assert.ok(!spellingSlip("kennara", "kennarar"));
  assert.ok(!spellingSlip("bókur", "bækur"));
  const found = diagnose({ type: "verb" }, { kind: "form",
    items: [{ m: "GM-FH-ÞT-2P-FT", typed: "viltuð", accepted: ["villtuð"], g: { verdict: "wrong" } }] });
  assert.deepEqual(found.map((f) => f.p), ["stafsetning"]);
});
