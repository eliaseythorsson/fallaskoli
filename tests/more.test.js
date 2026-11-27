/* v6.11: the new question types and the mix rule, against the real data.
   A wrong question is worse than no question: every task the builders make
   across many attempts is inspected, and every session of every category is
   checked against the rule (≥3 kinds, none over ~40%, tables ≤30%,
   analysis ≤35%). */

import { test } from "node:test";
import assert from "node:assert/strict";
import { DATA } from "../data/data_bundle.js";
import { EX } from "../data/exercises.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, newSession } from "../src/js/core/state.js";
import { TASKS, typeById } from "../src/js/tasks/index.js";
import { ask, show } from "./helpers.js";
import { SKILL_IDS } from "../src/js/core/skills.js";
import { skillHasTypes } from "../src/js/core/catalogue.js";
import { QUESTION_TYPES, createPolicy, narrowPolicy } from "../src/js/core/policy.js";
import { mixGate, mixReport, maxOf, capOf } from "../src/js/core/mix.js";
import { gradeForm } from "../src/js/core/grading.js";
import { diagnose, runReport, chancesIn } from "../src/js/core/diagnosis.js";
import { bonusVerdict } from "../src/js/ui/render-more.js";
import { impersonalItems } from "../src/js/tasks/fallstjorn.js";
import { giveWords } from "./learner.js";

const lex = buildLexicon(DATA);
const NEW = TASKS.filter((t) => t.build && !["fill", "verbslot", "verb", "parse", "revform", "govern", "indecl",
  "syntax", "clause", "tbl_no", "tbl_lo", "tbl_so", "tbl_fn", "tbl_to", "meaning", "umritun", "smidja", "villur"].includes(t.id));

function ctxFor(skill = null, diff = 2, typeId = "") {
  const S = giveWords(blankState(), typeId);
  SKILL_IDS.forEach((id) => { S.enabled[id] = true; });
  const sess = newSession(S);
  Object.keys(sess.diff).forEach((k) => { sess.diff[k] = diff; });
  const ctx = { lex, S, sess, forcedNoun: null, run: {} };
  const all = {};
  SKILL_IDS.forEach((id) => { all[id] = true; });
  const P = createPolicy(null, { skills: all, types: {}, levels: {}, attrs: {}, safeVocab: null });
  ctx.policy = skill ? narrowPolicy(P, { skills: [skill] }) : P;
  return ctx;
}

const NON_PUNCT = (s, j) => !/^[.,!?;:]$/.test(s.tok[j].w);

function checkNew(t, id) {
  assert.ok(t.skill && SKILL_IDS.includes(t.skill), `${id}: unknown skill ${t.skill}`);
  assert.ok(t.base > 0, `${id}: no XP base`);
  assert.ok(Number.isInteger(t.lvl) && t.lvl >= 1 && t.lvl <= 7, `${id}: level ${t.lvl}`);
  if (["gap", "choice", "tap", "sort"].includes(t.type)) assert.ok(t.title, `${id}: no title`);
  if (t.type === "gap") {
    assert.ok(t.answers && t.answers.length, `${id}: no answers`);
    for (const a of t.answers) assert.ok(a && !a.includes("?") && !a.includes("undefined"), `${id}: bad answer "${a}"`);
    assert.equal(gradeForm(t.answers[0], { accepted: t.answers, paradigm: t.paradigm }).verdict, "correct",
      `${id}: its own answer graded wrong`);
    if (t.mode !== "free") assert.ok(t.s && t.s.tok[t.i], `${id}: the blank points nowhere`);
  }
  if (t.type === "choice") {
    assert.ok(t.options.length >= 2, `${id}: fewer than two options`);
    assert.equal(new Set(t.options).size, t.options.length, `${id}: an option twice: ${t.options}`);
    assert.ok(t.options.includes(t.answer), `${id}: the answer is not an option`);
  }
  if (t.type === "tap") {
    assert.ok(t.targets.length >= 1, `${id}: nothing to tap`);
    t.targets.forEach((j) => assert.ok(NON_PUNCT(t.s, j), `${id}: a punctuation mark to tap`));
    if (!t.whole) t.targets.forEach((j) => assert.equal(t.s.tok[j].c, t.cls, `${id}: target of another class`));
  }
  if (t.type === "sort") {
    assert.ok(t.items.length >= 3, `${id}: too few words to sort`);
    t.items.forEach((x) => assert.ok(t.buckets.includes(x.cls), `${id}: ${x.w} has no bucket`));
  }
}

test("every new question type can be built, and every task it builds is intact", () => {
  for (const spec of NEW) {
    let built = 0;
    for (let k = 0; k < 60; k++) {
      const ctx = ctxFor(null, 1 + (k % 5), spec.id);
      const t = show(ctx, spec.build);
      if (!t) continue;
      built++;
      checkNew(t, spec.id);
    }
    assert.ok(built >= 30, `${spec.id}: built only ${built} of 60`);
  }
});

test("every question type has a name for the settings, and every name a builder", () => {
  const named = new Set(QUESTION_TYPES.map((q) => q.id));
  TASKS.forEach((t) => assert.ok(named.has(t.id), `${t.id} has no entry in QUESTION_TYPES`));
  QUESTION_TYPES.forEach((q) => assert.ok(TASKS.some((t) => t.id === q.id), `${q.id} has no builder`));
  QUESTION_TYPES.forEach((q) => assert.ok(SKILL_IDS.includes(q.skill), `${q.id}: skill ${q.skill}`));
});

/* A skill with no question type yet (Námsorð before its first, #19) has no
   session to check; tests/skills-checklist.test.js holds which may be so. */
/* Lesskilningur began as a tracer with one question type (issue #30); the
   story map (#31) gave it four, and it is held like every other category. */
const ONE_KIND_SO_FAR = new Set([]);

const ASKED = SKILL_IDS.filter(skillHasTypes);

test("every category offers at least three kinds of question", () => {
  for (const id of ASKED) {
    if (ONE_KIND_SO_FAR.has(id)) continue;
    const kinds = TASKS.filter((t) => (t.skill === id || (t.anyOf || []).includes(id)) && t.id !== "meaning");
    assert.ok(kinds.length >= 3, `${id}: only ${kinds.map((k) => k.id)}`);
  }
});

/** A session of `n` questions as app.pickTask runs it. */
function session(skill, n) {
  const ctx = ctxFor(skill, 2);
  const types = [];
  for (let k = 0; k < n; k++) {
    const counts = {};
    types.forEach((x) => { counts[x] = (counts[x] || 0) + 1; });
    ctx.mix = { n, counts };
    const t = ask(ctx);
    ctx.mix = null;
    if (!t) break;
    types.push(t.typeId);
  }
  return types;
}

test("the mix rule holds in every category: three kinds or more, none over its share", () => {
  for (const skill of ASKED) {
    const available = TASKS.filter((t) => (t.skill === skill || (t.anyOf || []).includes(skill)) && t.id !== "meaning").map((t) => t.id);
    for (const n of [10, 15, 20]) {
      for (let r = 0; r < 4; r++) {
        const types = session(skill, n);
        assert.equal(types.length, n, `${skill}: a session of ${n} stopped at ${types.length}`);
        if (ONE_KIND_SO_FAR.has(skill)) continue;      // the session is whole; there is nothing to mix
        const rep = mixReport(types, available);
        assert.ok(rep.kinds >= 3, `${skill} ×${n}: only ${rep.kinds} kinds — ${JSON.stringify(rep.counts)}`);
        assert.deepEqual(rep.over, [], `${skill} ×${n}: over the cap — ${JSON.stringify(rep.counts)}`);
      }
    }
  }
});

test("Fornöfn tables stay at 30% or under, Lýsingarorð analysis at 35% or under", () => {
  for (let r = 0; r < 6; r++) {
    const fn = session("fornofn", 10);
    assert.ok(fn.filter((x) => x === "tbl_fn").length <= 3, `Fornöfn: ${fn}`);
    const lo = session("lysingarord", 20);
    assert.ok(lo.filter((x) => x === "parse" || x === "revform").length <= 7, `Lýsingarorð: ${lo}`);
  }
  assert.equal(maxOf("tbl_fn", 10), 3);
  assert.equal(maxOf("revform", 10), 3);
  assert.equal(maxOf("fn_eyda", 10), 4);
  assert.equal(capOf("tbl_to"), 0.3);
});

test("mixGate: the last questions go to kinds not yet used", () => {
  const g = mixGate({ n: 10, counts: { a: 4, b: 4 } }, ["a", "b", "c", "d"]);
  assert.deepEqual([...g].sort(), ["c", "d"]);
  const h = mixGate({ n: 10, counts: { a: 3, b: 3, c: 2 } }, ["a", "b", "c"]);
  assert.deepEqual([...h].sort(), ["a", "b", "c"], "three kinds used: nothing forced");
  const full = mixGate({ n: 10, counts: { a: 4, b: 1 } }, ["a", "b", "c"]);
  assert.ok(!full.has("a"), "a kind at its cap may not come again");
  assert.equal(mixGate(null, ["a"]), null);
});

test("a Lýsingarorð analysis question is always inside a sentence", () => {
  const spec = TASKS.find((t) => t.id === "revform");
  for (let k = 0; k < 120; k++) {
    const ctx = ctxFor("lysingarord", 1 + (k % 5));
    const t = show(ctx, spec.build);
    if (!t) continue;
    assert.ok(!t.standalone, `a bare adjective: ${t.t && t.t.w}`);
    assert.ok(t.s && t.s.tok[t.i], "no sentence");
  }
});

test("the free-text meaning question is not a question of its own inside a session", () => {
  for (let r = 0; r < 4; r++) {
    const types = session("ordaford", 20);
    assert.ok(!types.includes("meaning"), `meaning in an Orðaforði session: ${types}`);
  }
});

test("exercises.js: every hand-written item resolved to BÍN forms", () => {
  const bad = (a) => !a || !a.length || a.some((f) => !f || f === "?");
  EX.pronounGap.forEach((x) => assert.ok(!bad(x.a), x.t));
  EX.numeralAgree.forEach((x) => assert.ok(!bad(x.a), x.t));
  EX.pluralOnly.forEach((x) => assert.ok(!bad(x.a), x.t));
  EX.verbCase.forEach((x) => assert.ok(!bad(x.a), x.t + x.noun));
  impersonalItems().forEach((x) => assert.ok(!bad(x.a), x.t));   // frames × subjects (item 23)
  EX.motionRest.forEach((x) => assert.notEqual(x.thf[0], x.thgf[0], x.t));
  EX.reflexive.forEach((x) => assert.notEqual(x.a, x.w, x.t));
  for (let d = 1; d <= 31; d++) ["NF", "ÞF", "ÞGF", "EF"].forEach((c) => assert.ok(!bad(EX.dates.ord[d][c]), `${d}. ${c}`));
  assert.equal(EX.dates.ord[2]["ÞGF"][0], "öðrum");
  assert.equal(EX.dates.ord[21]["NF"][0], "tuttugasti og fyrsti");
});

test("the bonus sentence: the word must be in it, three words, not a repeat", () => {
  const e = lex.lookup("hestur", "kk");
  assert.equal(bonusVerdict("Ég sá hestinn í gær", e).ok, true, "an inflected form counts");
  assert.equal(bonusVerdict("Ég sá kött", e).ok, false, "the word is missing");
  assert.equal(bonusVerdict("hestur", e).ok, false, "one word");
  assert.equal(bonusVerdict("Ég sá hestinn í gær", e, ["ég sá hestinn í gær"]).ok, false, "a repeat");
  if (e.x) assert.equal(bonusVerdict(e.x, e).ok, false, "the dictionary's own example");
});

test("diagnosis: the new questions name their own error patterns", () => {
  const ctx = ctxFor(null, 3);
  const fs = show(ctx, typeById("fs_hreyf").build);
  const wrong = fs.options.find((o) => o !== fs.answer);
  const g = gradeForm(wrong, { accepted: [fs.answer], paradigm: fs.paradigm, allowHelpers: false });
  /* as submitChoice does: the options say which cell the wrong one is */
  g.otherMarks = g.otherMarks.filter((m) => fs.optMarks.includes(m));
  const f = diagnose(fs, { kind: "form", items: [{ m: fs.m, typed: wrong, g, accepted: [fs.answer] }], also: fs.miss, ex: {} });
  const ids = f.map((x) => x.p);
  assert.ok(ids.includes("hreyfing") && ids.includes("thf_thgf"), ids.join());
  assert.ok(chancesIn(fs).includes("hreyfing"));
  const rf = show(ctx, typeById("fn_aftur").build);
  assert.ok(chancesIn(rf).includes("afturbeyging"));
  const pl = show(ctx, typeById("to_flt").build);
  assert.ok(chancesIn(pl).includes("fleirtoluord"));
  assert.deepEqual(diagnose(rf, { kind: "patterns", ids: ["afturbeyging"], ex: null }).map((x) => x.p), ["afturbeyging"]);
});

test("the summary's one thing to remember comes from the session's own topic", () => {
  const S = blankState();
  S.diag = { tid: { n: 10, w: 6, h: "0101010010", ex: [] } };
  const run = { chances: {}, misses: {}, found: [], before: [] };
  const verbTypes = new Set(["verb", "verbslot"]);
  assert.equal(runReport(run, S).focus.id, "tid", "without a filter the old pattern comes back");
  const vocab = new Set(TASKS.filter((t) => t.skill === "ordaford").map((t) => t.id));
  assert.equal(runReport(run, S, (p) => p.types.some((x) => vocab.has(x))).focus, null,
    "a verb tip after an Orðaforði session");
  assert.equal(runReport(run, S, (p) => p.types.some((x) => verbTypes.has(x))).focus.id, "tid");
});
