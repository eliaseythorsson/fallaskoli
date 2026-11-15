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
} from "../src/js/core/diagnosis.js";
import { LESSONS } from "../src/js/core/lessons.js";

const lex = buildLexicon(DATA);
const word = (o, c) => lex.lookup(o, c);

test("every pattern is complete: a name, a rule, a real lesson, tags and real question types", () => {
  const types = new Set(TASKS.map((t) => t.id));
  const pages = new Set(LESSONS.map((l) => l.id));
  const ids = new Set();
  for (const p of PATTERNS) {
    assert.ok(!ids.has(p.id), `${p.id} twice`); ids.add(p.id);
    assert.ok(p.nm && p.rule && p.tags.length, p.id);
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
  assert.ok(standingOf(r).active);
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
  noteDiagnosis(S, t, [{ p: "ef" }], false, "2026-11-12");
  noteDiagnosis(S, t, [{ p: "ef" }], false, "2026-11-12");
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
