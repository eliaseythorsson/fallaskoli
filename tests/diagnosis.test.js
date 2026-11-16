/* v6.10: the error diagnosis (core/diagnosis.js), practice sessions and what
   they keep. Against the real data wherever a word is needed. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, newSession, migrate, effectivePolicy } from "../src/js/core/state.js";
import { SKILL_IDS } from "../src/js/core/skills.js";
import { gradeForm } from "../src/js/core/grading.js";
import { narrowPolicy } from "../src/js/core/policy.js";
import { mergeStates } from "../src/js/core/merge.js";
import { cleanState } from "../server/guard.mjs";
import { nextTask, TASKS } from "../src/js/tasks/index.js";
import { errorHunt, gradeHunt } from "../src/js/tasks/production.js";
import {
  PATTERNS, patternById, casePattern, patternsForCells, patternsForForm, diagnose,
  noteDiagnosis, standingOf, activePatterns, tagsOf, chancesIn, targets, focusTypes,
  huntPreferFor, pickTargeted, runReport,
  spellingPattern, vowelChange, wilsonLower, standings, UNREAD, MIN_CHANCES,
} from "../src/js/core/diagnosis.js";
import { verbConjugation } from "../src/js/tasks/index.js";
import { normalise } from "../src/js/core/grading.js";
import { LESSONS } from "../src/js/core/lessons.js";

const lex = buildLexicon(DATA);
const word = (o, c) => lex.lookup(o, c);

test("every pattern is complete: a name, a rule, a real lesson, tags and real question types", () => {
  const types = new Set(TASKS.map((t) => t.id));
  const pages = new Set(LESSONS.map((l) => l.id));
  const ids = new Set();
  for (const p of PATTERNS) {
    assert.ok(!ids.has(p.id), `${p.id} twice`); ids.add(p.id);
    /* "ogreint" is a count, not an error a question tests: no tags. */
    assert.ok(p.nm && p.rule && (p.tags.length || p.meta), p.id);
    assert.ok(p.lesson === null || pages.has(p.lesson), `${p.id}: no page ${p.lesson}`);
    p.types.forEach((t) => assert.ok(types.has(t), `${p.id}: no question type ${t}`));
  }
});

test("case mix-ups are sorted the way teachers sort them", () => {
  assert.equal(casePattern("ÞGF", "ÞF"), "thf_thgf");
  assert.equal(casePattern("ÞF", "ÞG"), "thf_thgf");
  assert.equal(casePattern("EF", "ÞGF"), "ef");
  assert.equal(casePattern("ÞF", "NF"), "nf_aukafall");
  assert.equal(casePattern("NF", "ÞF"), "fall_annad");
  assert.equal(casePattern("ÞF", "ÞF"), null);
});

test("another cell of the same word is read feature by feature", () => {
  const h = word("hestur", "kk");
  /* *hest* for *hesti*: the accusative where the dative belongs */
  const g = gradeForm("hest", { accepted: h.forms.ÞGFET, paradigm: h.forms });
  assert.equal(g.verdict, "otherform");
  assert.deepEqual(patternsForCells("ÞGFET", g.otherMarks).map((x) => x.p), ["thf_thgf"]);
  /* *hestur* for *hests*: the nominative where the genitive belongs → ef */
  const g2 = gradeForm("hestur", { accepted: h.forms.EFET, paradigm: h.forms });
  assert.deepEqual(patternsForCells("EFET", g2.otherMarks).map((x) => x.p), ["ef"]);
  /* the number */
  const g3 = gradeForm("hestar", { accepted: h.forms.NFET, paradigm: h.forms });
  assert.deepEqual(patternsForCells("NFET", g3.otherMarks).map((x) => x.p), ["tala"]);
  /* an adjective in the wrong gender */
  const a = word("gamall", "lo");
  const g4 = gradeForm("gömlum", { accepted: a.forms["FSB-KVK-ÞGFET"], paradigm: a.forms });
  assert.ok(patternsForCells("FSB-KVK-ÞGFET", g4.otherMarks).some((x) => x.p === "kyn_samraemi"));
  /* a verb in the wrong person and number */
  const v = word("hlaupa", "so");
  const g5 = gradeForm("hlupum", { accepted: v.forms["GM-FH-ÞT-3P-ET"], paradigm: v.forms });
  assert.deepEqual(patternsForCells("GM-FH-ÞT-3P-ET", g5.otherMarks).map((x) => x.p), ["sogn_frumlag"]);
});

test("a form that is no form at all: weak past, vowel change, ending", () => {
  assert.deepEqual(patternsForForm("hlaupaði", ["hljóp"], "GM-FH-ÞT-3P-ET", "sterk"), ["sterk_veik_sogn"]);
  assert.ok(!patternsForForm("hlaupaði", ["hljóp"], "GM-FH-ÞT-3P-ET", "veik").includes("sterk_veik_sogn"),
    "only a verb known to be strong");
  assert.deepEqual(patternsForForm("bókur", ["bækur"], "NFFT"), ["hljodvarp"]);
  assert.deepEqual(patternsForForm("hestinu", ["hestinum"], "ÞGFETgr"), ["ending"]);
  assert.deepEqual(patternsForForm("köttur", ["hestur"], "NFET"), []);
});

test("diagnose reads every kind of answer", () => {
  const h = word("hestur", "kk");
  const fill = { type: "fill", m: "ÞGFET", word: "hestur|kk" };
  const g = gradeForm("hest", { accepted: h.forms.ÞGFET, paradigm: h.forms });
  const f = diagnose(fill, { kind: "form", items: [{ m: "ÞGFET", typed: "hest", g, accepted: h.forms.ÞGFET }] });
  assert.deepEqual(f.map((x) => x.p), ["thf_thgf"]);
  assert.equal(f[0].ex.said, "hest");
  /* a missing accent: soft, its own pattern */
  const b = word("bók", "kvk");
  const ga = gradeForm("bok", { accepted: b.forms.NFET, paradigm: b.forms });
  assert.deepEqual(diagnose(fill, { kind: "form", items: [{ m: "NFET", typed: "bok", g: ga, accepted: b.forms.NFET }] })
    .map((x) => [x.p, !!x.soft]), [["broddar", true]]);
  /* analysis rows, government, word classes */
  assert.deepEqual(diagnose({ type: "parse" }, { kind: "rows", rows: [
    { key: "fl", answer: "atviksorð", picked: "forsetning" },
    { key: "fall", answer: "ÞG", picked: "ÞF" }, { key: "tala", answer: "eintala", picked: "eintala" }] })
    .map((x) => x.p), ["ao_fs", "thf_thgf"]);
  assert.deepEqual(diagnose({ type: "govern" }, { kind: "govern", answer: "EF", picked: "ÞG", so: false })
    .map((x) => x.p), ["fallstjorn_fs", "ef"]);
  assert.deepEqual(diagnose({ type: "indecl" }, { kind: "class", answer: "samtenging", picked: "atviksorð" })
    .map((x) => x.p), ["ordflokkur"]);
  /* the verb in second place */
  const tr = { type: "umritun", kind: "igaer", model: "Í gær fór ég í bíó.", answers: ["Í gær fór ég í bíó."] };
  assert.deepEqual(diagnose(tr, { kind: "transform", typed: "Í gær ég fór í bíó.", ok: false }).map((x) => x.p), ["v2"]);
  assert.deepEqual(diagnose(tr, { kind: "transform", typed: "Í gær fer ég í bíó.", ok: false }).map((x) => x.p), ["tid"]);
  /* nothing to say about a right answer */
  const gr = gradeForm("hesti", { accepted: h.forms.ÞGFET, paradigm: h.forms });
  assert.deepEqual(diagnose(fill, { kind: "form", items: [{ m: "ÞGFET", typed: "hesti", g: gr, accepted: h.forms.ÞGFET }] }), []);
  assert.deepEqual(diagnose(fill, null), []);
});

test("a hunt: a missed error is its pattern, a changed correct word is over-correcting", () => {
  const rnd = (() => { let x = 7; return () => ((x = (x * 16807) % 2147483647) / 2147483647); })();
  let checked = 0;
  for (let k = 0; k < 80 && checked < 10; k++) {
    const h = errorHunt(lex, lex.sentences.filter((s) => s.lvl <= 3), { count: 2, rnd });
    if (!h) continue;
    const task = { type: "villur", hunt: h };
    const ti = h.lines[0].toks.findIndex((t) => !t.err && !t.punct &&
      !h.lines.some((l) => l.toks.some((x) => x.err && x.err.alt && x.err.alt.key === `0:${h.lines[0].toks.indexOf(t)}`)));
    const g = gradeHunt(h, { [`0:${ti}`]: "xyz" });
    const found = diagnose(task, { kind: "hunt", g }).map((x) => x.p);
    assert.ok(found.includes("ofleidretting"));
    for (const e of h.lines.flatMap((l) => l.toks.filter((t) => t.err).map((t) => t.err))) {
      const want = { fall: ["thf_thgf", "ef", "nf_aukafall", "fall_annad"], "samræmi": ["kyn_samraemi"], "sögn": ["sogn_frumlag"] }[e.kind];
      assert.ok(found.some((p) => want.includes(p)), `${e.kind} not diagnosed: ${found}`);
    }
    /* and the hunt tests what its errors are about */
    assert.ok(chancesIn(task).includes("ofleidretting"));
    checked++;
  }
  assert.ok(checked >= 5);
});

test("chances and misses are counted, and a pattern turns active and back", () => {
  const S = blankState();
  const t = { type: "fill", m: "ÞGFET", word: "hestur|kk" };
  const miss = [{ p: "thf_thgf", m: "ÞGFET", other: "ÞFET" }];
  assert.deepEqual(noteDiagnosis(S, t, [], null, "2026-11-12"), [], "a question with no verdict counts for nothing");
  noteDiagnosis(S, t, miss, false, "2026-11-12");
  noteDiagnosis(S, t, miss, false, "2026-11-12");
  noteDiagnosis(S, t, [], true, "2026-11-12");
  const r = S.diag.thf_thgf;
  assert.equal(r.n, 3); assert.equal(r.w, 2); assert.equal(r.h, "001");
  assert.deepEqual(r.ex, [{ w: "hestur|kk", m: "ÞGFET", o: "ÞFET" }]);
  assert.ok(S.diag.greinir && S.diag.greinir.w === 0, "every pattern the question tested got a chance");
  assert.equal(standingOf(r).active, false, "v6.13: two misses in three answers are not yet enough");
  noteDiagnosis(S, t, miss, false, "2026-11-12");
  noteDiagnosis(S, t, [], true, "2026-11-12");
  assert.equal(r.h, "00101");
  assert.ok(standingOf(r).active, "three misses in five answers");
  assert.deepEqual(activePatterns(S).map((p) => p.id), ["thf_thgf"]);
  for (let k = 0; k < 16; k++) noteDiagnosis(S, t, [], true, "2026-11-13");
  assert.equal(standingOf(S.diag.thf_thgf).active, false, "sixteen right in a row and it is mended");
  assert.equal(S.diag.thf_thgf.h.length, 16);
});

test("trend: better and worse", () => {
  assert.equal(standingOf({ h: "00001111" }).trend, "betra");
  assert.equal(standingOf({ h: "11110000" }).trend, "verra");
  assert.equal(standingOf({ h: "01010101" }).trend, "jafnt");
  assert.equal(standingOf({ h: "01" }).trend, null);
});

test("what a question tests, and what a session aimed at a pattern draws from", () => {
  assert.ok(targets({ type: "fill", m: "ÞGFETgr" }, ["thf_thgf"]));
  assert.ok(!targets({ type: "fill", m: "NFETgr" }, ["thf_thgf"]));
  assert.ok(targets({ type: "govern", fall: "EF", t: { c: "forsetning" } }, ["ef", "fallstjorn_fs"]));
  assert.ok(targets({ type: "verb", m: "GM-FH-ÞT-3P-ET", conj: "sterk" }, ["sterk_veik_sogn"]));
  assert.ok(!targets({ type: "verb", m: "GM-FH-NT-3P-ET", conj: "sterk" }, ["sterk_veik_sogn"]));
  assert.ok(tagsOf({ type: "umritun", kind: "igaer" }).has("v2"));
  assert.ok(focusTypes(["thf_thgf"]).has("fill"));
  assert.deepEqual(huntPreferFor(["thf_thgf", "kyn_samraemi", "v2"]), ["fall", "samræmi"]);
});

const ctxFor = (S) => ({ lex, S, sess: newSession(S), forcedNoun: null });

test("a session on one skill draws only that skill's questions", () => {
  const S = blankState();
  for (const topic of ["sagnord", "nafnord", "fallstjorn", "malbeiting"]) {
    const ctx = ctxFor(S);
    ctx.policy = narrowPolicy(effectivePolicy(S), { skills: [topic] });
    for (let k = 0; k < 25; k++) {
      const t = nextTask(ctx);
      assert.ok(t, `${topic}: no question`);
      const spec = TASKS.find((x) => x.id === t.typeId);
      assert.ok(spec.skill === topic || (spec.anyOf || []).includes(topic), `${topic}: got ${t.typeId}`);
    }
  }
});

test("questions aimed at a pattern come more often", () => {
  const S = blankState();
  SKILL_IDS.forEach((id) => { S.policy.skills[id] = ["nafnord", "fallstjorn", "greining"].includes(id); });
  const ids = ["ef"];
  const count = (p) => {
    const ctx = ctxFor(S);
    ctx.policy = effectivePolicy(S);
    let hit = 0;
    let x = 99; const rnd = () => ((x = (x * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 120; k++) {
      const t = pickTargeted(() => nextTask(ctx), ids, { p, tries: 6, rnd });
      if (t && targets(t, ids)) hit++;
    }
    return hit;
  };
  const plain = count(0), aimed = count(0.85);
  assert.ok(aimed > plain * 1.8, `aimed ${aimed} vs plain ${plain}`);
});

test("a session's report: what went right, the one thing to remember", () => {
  const S = blankState();
  const t = { type: "fill", m: "ÞGFET", word: "hestur|kk" };
  /* v6.13: active takes at least five answers — three misses, two right. */
  for (let k = 0; k < 3; k++) noteDiagnosis(S, t, [{ p: "ef" }], false, "2026-11-12");
  for (let k = 0; k < 2; k++) noteDiagnosis(S, { type: "fill", m: "EFET" }, [], true, "2026-11-12");
  const run = {
    chances: { thf_thgf: 4, ef: 3, greinir: 5, broddar: 5 },
    misses: { thf_thgf: 2, broddar: 1 },
    found: [{ p: "thf_thgf", ex: { said: "hest", right: "hesti" } }, { p: "thf_thgf", ex: null }, { p: "broddar", ex: null }],
    before: ["ef"],
  };
  const rep = runReport(run, S);
  assert.equal(rep.focus.id, "thf_thgf", "the worst real pattern, not the accent");
  assert.deepEqual(rep.focus.ex, [{ said: "hest", right: "hesti" }]);
  assert.deepEqual(rep.mended.map((p) => p.id), ["ef"], "active before, tested, no miss");
  assert.ok(rep.clean.some((p) => p.id === "greinir"));
  /* v6.13: no praise for the slips and catch-alls every form gives a chance at */
  const quietRun = { chances: { y_i: 5, n_nn: 5, dh_d: 5, sogn_obeygd: 4, greinir: 5 }, misses: {}, found: [], before: [] };
  assert.deepEqual(runReport(quietRun, S).clean.map((p) => p.id), ["greinir"]);
  /* nothing wrong in the session: the worst active pattern from before */
  const quiet = runReport({ chances: { greinir: 3 }, misses: {}, found: [], before: [] }, S);
  assert.equal(quiet.focus.id, "ef");
  assert.ok(quiet.focus.fromBefore);
});

test("the diagnosis and the sessions survive saving, merging and the server", () => {
  const S = blankState();
  noteDiagnosis(S, { type: "fill", m: "ÞGFET", word: "hestur|kk" }, [{ p: "thf_thgf", m: "ÞGFET", other: "ÞFET" }], false, "2026-11-12");
  S.runs.push({ at: 1, d: "2026-11-12", topic: "nafnord", n: 10, c: 7, j: 10, xp: 90, top: ["thf_thgf"] });
  const back = migrate(JSON.parse(JSON.stringify(S)));
  assert.deepEqual(back.diag, S.diag);
  assert.deepEqual(back.runs, S.runs);

  /* two devices */
  const base = migrate(JSON.parse(JSON.stringify(S)));
  const L = migrate(JSON.parse(JSON.stringify(S))), R = migrate(JSON.parse(JSON.stringify(S)));
  noteDiagnosis(L, { type: "fill", m: "ÞGFET" }, [], true, "2026-11-13");
  noteDiagnosis(R, { type: "fill", m: "ÞFET" }, [{ p: "thf_thgf" }], false, "2026-11-13");
  L.runs.push({ at: 2, topic: "sagnord", n: 10, c: 9, j: 10, xp: 100, top: [] });
  R.runs.push({ at: 3, topic: "fallstjorn", n: 15, c: 12, j: 15, xp: 120, top: [] });
  const M = mergeStates(base, L, R);
  assert.equal(M.diag.thf_thgf.n, 3);
  assert.equal(M.diag.thf_thgf.w, 2);
  assert.deepEqual(M.runs.map((r) => r.at), [1, 2, 3]);

  /* the server keeps the shape and nothing else */
  const dirty = JSON.parse(JSON.stringify(S));
  dirty.diag.thf_thgf.h = "0101<script>";
  dirty.diag.thf_thgf.ex.push({ w: "x".repeat(500), m: "ÞF", o: null, typed: "what the child wrote" });
  dirty.runs.push({ at: 5, topic: "nafnord", n: 10, c: 3, j: 10, xp: 5, top: ["ef"], note: "free text" });
  const clean = cleanState(dirty);
  assert.equal(clean.diag.thf_thgf.h, "0101");
  assert.ok(clean.diag.thf_thgf.ex.every((e) => !("typed" in e)));
  assert.ok(clean.runs.every((r) => !("note" in r)));
  assert.equal(clean.runs.length, 2);
});

test("patternById", () => {
  assert.equal(patternById("v2").lesson, "malbeiting");
  assert.equal(patternById("nope"), null);
});

/* ===================== v6.13: critique items 7, 8, 31–35 ===================== */

/** One typed answer to one cell of a real word, read the way the app reads it
    (gradeForm → diagnose). Returns the pattern ids found. */
const fileAs = (lemma, cls, m, typed) => {
  const w = word(lemma, cls);
  assert.ok(w, `${lemma} is not in the lexicon`);
  const accepted = w.forms[m];
  assert.ok(accepted, `${lemma} has no ${m}`);
  const g = gradeForm(typed, { accepted, paradigm: w.forms });
  const conj = cls === "so" ? verbConjugation(w) : null;
  return diagnose({ type: cls === "so" ? "verb" : "fill", m, word: `${lemma}|${cls}` },
    { kind: "form", items: [{ m, typed, g, accepted, conj }] }).map((x) => x.p);
};
const isFormOf = (w, x) => Object.values(w.forms).some((fs) => fs.some((f) => normalise(f) === x));
const allOf = (classes) => classes.flatMap((c) => lex.byClass[c] || []);

test("item 7: the three rule texts say what is true", () => {
  const fs = patternById("fallstjorn_fs").rule;
  assert.match(fs, /\*við\*/, "við can govern two cases");
  assert.match(fs, /við húsið/); assert.match(fs, /taka við bréfinu/);
  const v2 = patternById("v2").rule;
  assert.match(v2, /fullyrðingarsetningu/);
  assert.doesNotMatch(v2, /aðalsetningu/, "questions and commands are main clauses without V2");
  const mm = patternById("mynd").rule;
  assert.match(mm, /klæða – klæðast/);
  assert.doesNotMatch(mm, /hlakkast/);
});

/* The critique's table of synthetic errors, one test per row: each now files
   where it should, first with the word the critique names or a plain one,
   then across every word in the lexicon the error can be made on. */

test("table row 1: y for i, ý for í is y, ý og ey — not a vowel change", () => {
  assert.equal(spellingPattern("firir", "fyrir"), "y_i");
  assert.deepEqual(patternsForForm("firir", ["fyrir"], "NFET"), ["y_i"]);
  assert.deepEqual(fileAs("drykkur", "kk", "NFET", "drikkur"), ["y_i"]);
  assert.deepEqual(fileAs("dýr", "hk", "NFET", "dír"), ["y_i"]);
  assert.deepEqual(fileAs("lykill", "kk", "NFET", "likill"), ["y_i"]);
  assert.deepEqual(fileAs("heyra", "so", "GM-NH", "heira"), ["y_i"], "ei for ey");
  let n = 0;
  for (const w of allOf(["kk", "kvk", "hk"])) for (const m of ["NFET", "ÞGFET", "NFFT"]) {
    const f = (w.forms[m] || [])[0];
    if (!f || !/[yý]/.test(f)) continue;
    const t = f.replace(/y/g, "i").replace(/ý/g, "í");
    if (isFormOf(w, t)) continue;
    assert.deepEqual(fileAs(w.o, w.c, m, t), ["y_i"], `${t} for ${f}`);
    n++;
  }
  assert.ok(n > 200, `only ${n} words tried`);
});

test("table row 2: d for ð in a verb ending is ð eða d — not a wrong ending", () => {
  assert.deepEqual(fileAs("kalla", "so", "GM-FH-ÞT-3P-ET", "kalladi"), ["dh_d"]);
  assert.deepEqual(fileAs("heyra", "so", "GM-FH-ÞT-3P-ET", "heyrdi"), ["dh_d"]);
  assert.deepEqual(fileAs("dæma", "so", "GM-FH-ÞT-3P-ET", "dæmði"), ["dh_d"], "and ð for d");
  let n = 0;
  for (const w of allOf(["so"])) {
    if (verbConjugation(w) !== "veik") continue;
    for (const m of ["GM-FH-ÞT-3P-ET", "GM-FH-ÞT-1P-FT"]) {
      const f = (w.forms[m] || [])[0];
      const t = f && f.replace(/ð(?=[iu])/, "d");
      if (!f || t === f || isFormOf(w, t)) continue;
      assert.deepEqual(fileAs(w.o, "so", m, t), ["dh_d"], `${t} for ${f}`);
      n++;
    }
  }
  assert.ok(n > 200, `only ${n} forms tried`);
});

test("table row 3: -inum for -unum is a wrong ending — not a vowel change", () => {
  assert.deepEqual(fileAs("barn", "hk", "ÞGFFTgr", "börninum"), ["ending"]);
  assert.deepEqual(fileAs("sjór", "kk", "ÞGFFTgr", "sjóinum"), ["ending"], "a stem ending in a vowel");
  /* … while a real vowel change in the stem stays one */
  assert.deepEqual(fileAs("bók", "kvk", "NFFT", "bókur"), ["hljodvarp"]);
  assert.deepEqual(fileAs("kennari", "kk", "ÞGFFT", "kennarum"), ["hljodvarp"], "u-umlaut in the second syllable");
  assert.equal(vowelChange("börninum", "börnunum"), false);
  assert.equal(vowelChange("kennarum", "kennurum"), true);
  assert.equal(vowelChange("hlaupur", "hleypur"), true);
  let n = 0;
  for (const w of allOf(["kk", "kvk", "hk"])) {
    const f = (w.forms.ÞGFFTgr || [])[0];
    if (!f || !f.endsWith("unum")) continue;
    const t = f.replace(/unum$/, "inum");
    if (isFormOf(w, t)) continue;
    assert.deepEqual(fileAs(w.o, w.c, "ÞGFFTgr", t), ["ending"], `${t} for ${f}`);
    n++;
  }
  assert.ok(n > 500, `only ${n} words tried`);
});

test("table row 4 (item 33): nominative = accusative typed for a dative is Þolfall og þágufall", () => {
  assert.deepEqual(fileAs("barn", "hk", "ÞGFET", "barn"), ["thf_thgf"]);
  assert.deepEqual(fileAs("barn", "hk", "ÞGFFT", "börn"), ["thf_thgf"]);
  assert.deepEqual(fileAs("borð", "hk", "ÞGFETgr", "borðið"), ["thf_thgf"]);
  assert.deepEqual(patternsForCells("ÞGFET", ["NFET", "ÞFET"]).map((x) => x.p), ["thf_thgf"]);
  assert.deepEqual(patternsForCells("ÞGFET", ["ÞFET", "NFET"]).map((x) => x.p), ["thf_thgf"], "in any order");
  /* the tie is broken only for a dative target */
  assert.deepEqual(patternsForCells("EFET", ["NFET", "ÞFET"]).map((x) => x.p), ["ef"]);
  assert.deepEqual(fileAs("hestur", "kk", "ÞFET", "hestur"), ["nf_aukafall"], "a form that is only nominative");
  let n = 0;
  for (const w of allOf(["kk", "kvk", "hk"]))
    for (const [d, a, nf] of [["ÞGFET", "ÞFET", "NFET"], ["ÞGFFT", "ÞFFT", "NFFT"], ["ÞGFETgr", "ÞFETgr", "NFETgr"]]) {
      const fa = (w.forms[a] || [])[0];
      if (!fa || fa !== (w.forms[nf] || [])[0] || (w.forms[d] || []).includes(fa)) continue;
      assert.deepEqual(fileAs(w.o, w.c, d, fa), ["thf_thgf"], `${fa} for ${w.forms[d]}`);
      n++;
    }
  assert.ok(n > 1000, `only ${n} forms tried`);
});

test("table row 5 (item 34): the infinitive typed for a finite form is Sögnin ekki beygð", () => {
  const p = patternById("sogn_obeygd");
  assert.equal(p.nm, "Sögnin ekki beygð");
  assert.deepEqual(fileAs("hlaupa", "so", "GM-FH-ÞT-3P-ET", "hlaupa"), ["sogn_obeygd"]);
  assert.deepEqual(fileAs("fara", "so", "GM-FH-NT-1P-ET", "fara"), ["sogn_obeygd"]);
  assert.deepEqual(fileAs("kalla", "so", "GM-FH-ÞT-1P-FT", "kalla"), ["sogn_obeygd"]);
  /* any other wrong person is still that */
  assert.deepEqual(fileAs("hlaupa", "so", "GM-FH-ÞT-3P-ET", "hlupum"), ["sogn_frumlag"]);
  /* a question on a finite verb is a chance to make it */
  assert.ok(chancesIn({ type: "verb", m: "GM-FH-ÞT-3P-ET" }).includes("sogn_obeygd"));
  assert.ok(!chancesIn({ type: "fill", m: "ÞGFET" }).includes("sogn_obeygd"));
  /* Setningasmiðja: the verb card put in as it stands */
  const v = word("hlaupa", "so");
  const cards = [{ m: "GM-FH-ÞT-3P-ET", e: v, answers: v.forms["GM-FH-ÞT-3P-ET"] }];
  assert.deepEqual(diagnose({ type: "smidja", cards }, { kind: "cards", cards, per: [{ ok: false, typed: "hlaupa" }], extra: [] })
    .map((x) => x.p), ["sogn_obeygd"]);
  let n = 0;
  for (const w of allOf(["so"])) {
    const inf = (w.forms["GM-NH"] || [])[0];
    if (!inf) continue;
    for (const m of ["GM-FH-ÞT-3P-ET", "GM-FH-NT-1P-ET", "GM-FH-NT-2P-FT", "GM-FH-ÞT-1P-FT"]) {
      if (!w.forms[m] || w.forms[m].includes(inf)) continue;
      assert.deepEqual(fileAs(w.o, "so", m, inf), ["sogn_obeygd"], `${inf} for ${w.forms[m]}`);
      n++;
    }
  }
  assert.ok(n > 1000, `only ${n} forms tried`);
});

test("table row 6 (item 8): a strong verb given a weak plural past is diagnosed", () => {
  assert.deepEqual(fileAs("ganga", "so", "GM-FH-ÞT-1P-FT", "ganguðum"), ["sterk_veik_sogn"]);
  assert.deepEqual(fileAs("hefja", "so", "GM-FH-ÞT-2P-FT", "hefjuðuð"), ["sterk_veik_sogn"]);
  assert.deepEqual(fileAs("ganga", "so", "GM-FH-ÞT-1P-FT", "gengdum"), ["sterk_veik_sogn"], "-dum, not a letter too many");
  assert.deepEqual(fileAs("sitja", "so", "GM-FH-ÞT-1P-FT", "sitjuðum"), ["sterk_veik_sogn"], "the right form ends in -tum");
  assert.deepEqual(fileAs("bjóða", "so", "GM-FH-ÞT-1P-FT", "bjóðuðum"), ["sterk_veik_sogn"], "the right form ends in -uðum");
  for (const [typed, right] of [["fartum", "fórum"], ["fartuð", "fóruð"], ["gefðuð", "gáfuð"], ["gefdum", "gáfum"],
    ["hlaupuðumst", "hlupumst"]])
    assert.deepEqual(patternsForForm(typed, [right], "GM-FH-ÞT-1P-FT", "sterk"), ["sterk_veik_sogn"], typed);
  /* not for a weak verb, a present tense, or a vowel slip */
  assert.ok(!patternsForForm("hlaupuðum", ["hlupum"], "GM-FH-ÞT-1P-FT", "veik").includes("sterk_veik_sogn"),
    "only a verb known to be strong");
  assert.ok(!patternsForForm("ganguðum", ["göngum"], "GM-FH-NT-1P-FT", "sterk").includes("sterk_veik_sogn"));
  assert.ok(!patternsForForm("situm", ["sátum"], "GM-FH-ÞT-1P-FT", "sterk").includes("sterk_veik_sogn"));
  /* every strong verb in the lexicon, every person: -aði, -aðir, -uðum, -uðuð, -uðu */
  const END = { "1P-ET": "aði", "2P-ET": "aðir", "3P-ET": "aði", "1P-FT": "uðum", "2P-FT": "uðuð", "3P-FT": "uðu" };
  let n = 0;
  for (const w of allOf(["so"])) {
    if (verbConjugation(w) !== "sterk") continue;
    const stem = ((w.forms["GM-NH"] || [])[0] || "").replace(/a$/, "");
    if (!stem) continue;
    for (const [pn, e] of Object.entries(END)) {
      const m = "GM-FH-ÞT-" + pn;
      if (!w.forms[m] || isFormOf(w, stem + e)) continue;
      assert.deepEqual(fileAs(w.o, "so", m, stem + e), ["sterk_veik_sogn"], `${stem + e} for ${w.forms[m]}`);
      n++;
    }
  }
  assert.ok(n > 300, `only ${n} forms tried`);
});

test("item 32: n eða nn, and the order of the spelling tests", () => {
  assert.deepEqual(fileAs("hestur", "kk", "ÞFETgr", "hestin"), ["n_nn"]);
  assert.deepEqual(fileAs("bíll", "kk", "ÞFETgr", "bílin"), ["n_nn"]);
  assert.deepEqual(fileAs("kona", "kvk", "NFETgr", "konann"), ["n_nn"]);
  assert.equal(spellingPattern("kenari", "kennari"), "n_nn");
  /* the old one-letter slip is still itself */
  assert.equal(spellingPattern("viltuð", "villtuð"), "stafsetning");
  assert.equal(spellingPattern("hestinu", "hestinum"), null, "a letter off the end is an ending");
  assert.equal(spellingPattern("fíri", "fyrir"), null, "two kinds of error at once is not one pattern");
  assert.equal(spellingPattern("bok", "bók"), null, "an accent alone is Broddar");
  for (const id of ["y_i", "n_nn", "dh_d"]) {
    const p = patternById(id);
    assert.ok(p.tags.includes("form") && p.types.includes("fill"), id);
    assert.ok(chancesIn({ type: "fill", m: "ÞGFET" }).includes(id), `${id}: a written form is a chance`);
  }
  assert.equal(patternById("y_i").nm, "y, ý og ey");
  assert.equal(patternById("n_nn").nm, "n eða nn");
  assert.equal(patternById("dh_d").nm, "ð eða d");
});

test("item 31: a wrong answer nothing could read is ógreint, and no success for anything", () => {
  const S = blankState();
  const t = { type: "fill", m: "ÞGFET", word: "hestur|kk" };
  const tested = chancesIn(t);
  assert.ok(tested.includes("thf_thgf") && !tested.includes(UNREAD));
  /* wrong, nothing found */
  assert.deepEqual(noteDiagnosis(S, t, [], false, "2026-11-16"), []);
  for (const id of tested) assert.equal(S.diag[id], undefined, `${id} got a hit for an unread miss`);
  assert.deepEqual(S.diag.ogreint, { n: 1, w: 1, h: "0", last: "2026-11-16", ex: [] });
  /* wrong, diagnosed: ógreint gets a chance and no miss */
  const back = noteDiagnosis(S, t, [{ p: "thf_thgf", m: "ÞGFET", other: "ÞFET" }], false, "2026-11-16");
  assert.ok(back.includes("thf_thgf") && back.includes("greinir") && !back.includes(UNREAD));
  assert.equal(S.diag.ogreint.n, 2); assert.equal(S.diag.ogreint.w, 1); assert.equal(S.diag.ogreint.h, "01");
  /* right: ógreint is not touched */
  noteDiagnosis(S, t, [], true, "2026-11-16");
  assert.equal(S.diag.ogreint.n, 2);
  assert.equal(S.diag.greinir.h, "11");
  /* wrong with only a soft finding: that one is written, nothing else */
  const S2 = blankState();
  assert.deepEqual(noteDiagnosis(S2, t, [{ p: "broddar", soft: true }], false, "2026-11-16"), ["broddar"]);
  assert.deepEqual(Object.keys(S2.diag).sort(), ["broddar", "ogreint"]);
  assert.equal(S2.diag.ogreint.w, 1);
});

test("item 31: ógreint is visible but never active, never practised, last in the list", () => {
  const S = blankState();
  const t = { type: "fill", m: "ÞGFET", word: "hestur|kk" };
  for (let k = 0; k < 16; k++) noteDiagnosis(S, t, [], false, "2026-11-16");
  assert.equal(S.diag.ogreint.w, 16);
  for (let k = 0; k < 6; k++) noteDiagnosis(S, t, [{ p: "ef" }], false, "2026-11-16");
  const list = standings(S);
  assert.equal(list[0].id, "ef");
  assert.equal(list[list.length - 1].id, "ogreint", "last, though its rate is the highest");
  const og = list.find((p) => p.id === "ogreint");
  assert.equal(og.nm, "Ógreint");
  assert.ok(og.n > 0 && og.w > 0, "the Framvinda panel lists patterns with n > 0 and w > 0");
  assert.equal(og.active, false);
  assert.deepEqual(activePatterns(S, 6).map((p) => p.id), ["ef"]);
  assert.equal(focusTypes(["ogreint"]).size, 0);
  assert.ok(!PATTERNS.some((p) => !p.meta && chancesIn({ type: "verb", m: "GM-FH-ÞT-3P-ET" }).includes(UNREAD)));
});

test("item 35: a pattern is active only on enough evidence (Wilson lower bound > 20 %)", () => {
  assert.equal(MIN_CHANCES, 5);
  assert.equal(wilsonLower(0, 0), 0);
  assert.ok(Math.abs(wilsonLower(3, 5) - 0.272) < 0.002);
  assert.ok(Math.abs(wilsonLower(6, 16) - 0.208) < 0.002);
  const act = (h) => standingOf({ h }).active;
  assert.equal(act("00"), false, "two slips are not enough");
  assert.equal(act("0000"), false, "nor four answers, however bad");
  assert.equal(act("01011"), false, "two of five");
  assert.equal(act("01010"), true, "three of five");
  assert.equal(act("0111111111"), false);
  assert.equal(act("0011111111"), false, "two in ten flagged a pattern before v6.13");
  assert.equal(act("0101011111111111"), false, "three of sixteen");
  assert.equal(act("0101010101111111"), false, "five of sixteen");
  assert.equal(act("0101010101011111"), true, "six of sixteen");
  /* what it takes, window by window: monotone, and never fewer than three */
  let last = 0;
  for (let n = MIN_CHANCES; n <= 16; n++) {
    let k = 0;
    while (!act("0".repeat(k) + "1".repeat(n - k))) k++;
    assert.ok(k >= 3 && k >= last && k / n > 0.2, `${k} of ${n}`);
    last = k;
  }
});

test("v6.12 saved diagnosis still loads, and the new keys travel like the old", () => {
  /* a pupil's state as v6.12 saved it: old ids only, an old short history */
  const old = blankState();
  old.diag = {
    thf_thgf: { n: 3, w: 2, h: "001", last: "2026-11-10", ex: [{ w: "hestur|kk", m: "ÞGFET", o: "ÞFET" }] },
    stafsetning: { n: 9, w: 1, h: "111110111", last: "2026-11-09", ex: [] },
    retired_pattern: { n: 4, w: 4, h: "0000", last: null, ex: [] },
  };
  const S = migrate(JSON.parse(JSON.stringify(old)));
  assert.deepEqual(S.diag.thf_thgf, old.diag.thf_thgf);
  const list = standings(S);
  assert.deepEqual(list.map((p) => p.id).sort(), ["stafsetning", "thf_thgf"], "an unknown key is ignored, not an error");
  assert.equal(list.find((p) => p.id === "thf_thgf").misses, 2);
  /* answering on top of it */
  noteDiagnosis(S, { type: "fill", m: "ÞGFET", word: "hestur|kk" }, [], false, "2026-11-16");
  assert.equal(S.diag.thf_thgf.h, "001", "the unread miss left the old record alone");
  assert.equal(S.diag.ogreint.w, 1);
  /* the server keeps the new keys */
  noteDiagnosis(S, { type: "fill", m: "ÞFETgr" }, [{ p: "n_nn", m: "ÞFETgr" }], false, "2026-11-16");
  noteDiagnosis(S, { type: "verb", m: "GM-FH-ÞT-3P-ET" }, [{ p: "sogn_obeygd", m: "GM-FH-ÞT-3P-ET" }], false, "2026-11-16");
  const clean = cleanState(JSON.parse(JSON.stringify(S)));
  for (const id of ["ogreint", "n_nn", "sogn_obeygd"]) assert.deepEqual(clean.diag[id].h, S.diag[id].h, id);
  /* two devices: ógreint adds up like any other pattern */
  const base = migrate(JSON.parse(JSON.stringify(S)));
  const L = migrate(JSON.parse(JSON.stringify(S))), R = migrate(JSON.parse(JSON.stringify(S)));
  noteDiagnosis(L, { type: "fill", m: "ÞGFET" }, [], false, "2026-11-17");
  noteDiagnosis(R, { type: "fill", m: "ÞGFET" }, [], false, "2026-11-17");
  const M = mergeStates(base, L, R);
  assert.equal(M.diag.ogreint.n, S.diag.ogreint.n + 2);
  assert.equal(M.diag.ogreint.w, S.diag.ogreint.w + 2);
});
