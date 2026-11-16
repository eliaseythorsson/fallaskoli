/* v6.13 (item 69): grading lives in core/answer.js, not in the renderers.
 *
 * `judge(task, response, pupil)` decides and `settle` writes; neither needs a
 * DOM — this file runs in plain Node and never touches one. What is proved:
 *
 *   1. a table of fixed tasks (forms straight out of the lexicon) with the
 *      expected result written out by hand: right, wrong, each near miss;
 *   2. for EVERY question type and every builder in the registry, real tasks
 *      judged right, wrong and nearly right, against expectations worked out
 *      here independently of the judge;
 *   3. the XP is the figure the submit handlers used to compute — the old
 *      formula is written out below and compared, for a pupil with a history,
 *      a run and a day streak, and cell by cell for a table;
 *   4. `judge` changes nothing, and `settle` writes exactly what was judged;
 *   5. the renderers no longer grade: no `record(`, `bumpDiff(` or
 *      `gradeForm(` is left in ui/render.js and ui/render-more.js.
 *
 * Beyond this file, the refactor was checked once by playing the same seeded
 * 700-question sessions in Chrome on the build before it and the build after
 * it: the saved state, the session and every verdict box were identical. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, newSession, record, tallyAnswer, easeFor, dayStreak, dayRec, dkey,
         todayKey } from "../src/js/core/state.js";
import { computeXp, dayMult } from "../src/js/core/progress.js";
import { bumpDiff } from "../src/js/core/difficulty.js";
import { SKILL_IDS } from "../src/js/core/skills.js";
import { createPolicy } from "../src/js/core/policy.js";
import { gradeForm, stripAccents, normalise } from "../src/js/core/grading.js";
import { diagnose } from "../src/js/core/diagnosis.js";
import { TASKS } from "../src/js/tasks/index.js";
import { show, ask } from "./helpers.js";
import { judge, judgeBonus, settle, parseRows, judgeSyntax, askedCells, JUDGED_TYPES,
         BONUS_XP } from "../src/js/core/answer.js";
import { RENDER } from "../src/js/ui/render.js";
import "../src/js/ui/render-more.js";

const lex = buildLexicon(DATA);

/* ---------- pupils ------------------------------------------------------- */

function freshPupil() {
  const S = blankState();
  SKILL_IDS.forEach((id) => { S.enabled[id] = true; });
  return { S, sess: newSession(S) };
}

/** A pupil with a history: eleven right in a row, the goal reached on each of
    the last three days, and some answers behind them in every skill. */
function seasonedPupil() {
  const p = freshPupil();
  const { S } = p;
  S.run = 11;
  for (let back = 1; back <= 3; back++) {
    const d = new Date(); d.setDate(d.getDate() - back);
    S.days[dkey(d)] = { a: S.goal || 10, c: 8, xp: 90, ms: 0, nw: 0, sk: {}, g: S.goal || 10, lg: 1 };
  }
  SKILL_IDS.forEach((id, k) => { S.skills[id] = { xp: 300 + 40 * k, c: 14 + k, w: 3, bestRun: 6 }; });
  return p;
}

function builderCtx(pupil, diff = 3) {
  Object.keys(pupil.sess.diff).forEach((k) => { pupil.sess.diff[k] = diff; });
  const all = {};
  SKILL_IDS.forEach((id) => { all[id] = true; });
  return { lex, S: pupil.S, sess: pupil.sess, forcedNoun: null, run: {},
    policy: createPolicy(null, { skills: all, types: {}, levels: {}, attrs: {}, safeVocab: null }) };
}

/* ---------- the XP the submit handlers used to compute -------------------
 *
 * Written out from ui/render.js as it stood in v6.12 (`xpFor`), so the test
 * does not ask the judge what the judge thinks. */
function oldXp(S, task, { ok = true, hinted = false, base = task.base, lvl = task.lvl, factor = 1 } = {}) {
  if (!ok) return 0;
  const ease = easeFor(S, { cell: task.cell, word: task.word, skill: task.skill });
  const full = computeXp({ base, lvl: lvl || 1, hinted, ease, run: S.run, streak: dayStreak(S) });
  if (factor >= 1) return full;
  return Math.max(full > 0 ? 1 : 0, Math.round(full * factor));
}

const ids = (j) => j.findings.map((f) => f.p);
const records = (j) => j.effects.filter((e) => e.do === "record");

/* ========================================================================
 * 1. Fixed tasks, expected results written out
 * ====================================================================== */

const noun = (lemma, cls, m, extra = {}) => {
  const e = lex.lookup(lemma, cls);
  return { type: "fill", skill: "nafnord", n: e, m, answers: e.forms[m], paradigm: e.forms,
    base: 20, lvl: 1, cell: m, word: `${lemma}|${cls}`, ...extra };
};
const verb = (lemma, m, extra = {}) => {
  const e = lex.lookup(lemma, "so");
  return { type: "verbslot", skill: "sagnord", v: e, m, answers: e.forms[m], paradigm: e.forms,
    base: 20, lvl: 1, cell: m, word: `${lemma}|so`, conj: "sterk", ...extra };
};
const form = (lemma, cls, m) => lex.lookup(lemma, cls).forms[m][0];

/* base 20, level 1, a pupil with no history: 20 × 0.9 (ease 0.5) = 18. */
const FULL = 18, ACCENT = 17 /* 18 × 0.95 */, HINTED = 9;

const STOLL = noun("stóll", "kk", "EFET");
const BIDA = verb("bíða", "GM-FH-NT-1P-FT");
const LESA = verb("lesa", "GM-FH-NT-3P-ET");

const FIXED = [
  /* name, task, response → ok, verdict, xp, patterns found, near miss named */
  ["the form asked for", STOLL, { text: form("stóll", "kk", "EFET") },
    { ok: true, verdict: "right", xp: FULL, found: [] }],
  ["the form inside a helper phrase", STOLL, { text: "til " + form("stóll", "kk", "EFET") },
    { ok: true, verdict: "right", xp: FULL, found: [], usedHelpers: true }],
  ["with the hint", STOLL, { text: form("stóll", "kk", "EFET"), hinted: true },
    { ok: true, verdict: "right", xp: HINTED, found: [] }],
  ["a missing acute accent — accepted, 5% off", STOLL, { text: stripAccents(form("stóll", "kk", "EFET")) },
    { ok: true, verdict: "near", xp: ACCENT, found: ["broddar"], slip: "accents" }],
  ["another case of the same word", STOLL, { text: form("stóll", "kk", "NFET") },
    { ok: false, verdict: "wrong", xp: 0, found: ["ef"] }],
  ["the article where none was asked — wrong, and named", STOLL, { text: form("stóll", "kk", "EFETgr") },
    { ok: false, verdict: "wrong", xp: 0, found: ["greinir"], near: "greinir" }],
  ["not a form of the word at all", STOLL, { text: "stólur" },
    { ok: false, verdict: "wrong", xp: 0 }],
  ["two forms, hoping one is right — not an answer yet", STOLL,
    { text: `${form("stóll", "kk", "EFET")} ${form("stóll", "kk", "NFET")}` },
    { pending: true, verdict: "hedged", xp: 0, found: [] }],
  ["an empty box", STOLL, { text: "   " }, { pending: true, verdict: "empty", xp: 0, found: [] }],

  /* *biðum* is not *bíðum* with a missing accent: it is the past tense, and
     the paradigm is consulted before the accent rule. */
  ["the right verb form", BIDA, { text: form("bíða", "so", "GM-FH-NT-1P-FT") },
    { ok: true, verdict: "right", xp: FULL, found: [] }],
  ["the other tense, one accent away — wrong, and named", BIDA, { text: form("bíða", "so", "GM-FH-ÞT-1P-FT") },
    { ok: false, verdict: "wrong", xp: 0, found: ["tid"], near: "tid" }],
  ["the other tense of lesa", LESA, { text: form("lesa", "so", "GM-FH-ÞT-3P-ET") },
    { ok: false, verdict: "wrong", xp: 0, found: ["tid"], near: "tid" }],
  ["the wrong person", LESA, { text: form("lesa", "so", "GM-FH-NT-2P-ET") },
    { ok: false, verdict: "wrong", xp: 0, found: ["sogn_frumlag"] }],

  /* A gap with no BÍN mark (word formation): right, an accent forgiven, wrong. */
  ["word formation, right", { type: "gap", skill: "ordaford", answers: ["óhreinn"], base: 20, lvl: 1, cell: "myndun", word: null },
    { text: "óhreinn" }, { ok: true, verdict: "right", xp: FULL, found: [] }],
  ["word formation, an accent short", { type: "gap", skill: "ordaford", answers: ["óhreinn"], base: 20, lvl: 1, cell: "myndun", word: null },
    { text: "ohreinn" }, { ok: true, verdict: "near", xp: ACCENT, found: [], slip: "accents" }],
  ["word formation, wrong", { type: "gap", skill: "ordaford", answers: ["óhreinn"], base: 20, lvl: 1, cell: "myndun", word: null,
      missOther: ["ordmyndun"] },
    { text: "hreinnó" }, { ok: false, verdict: "wrong", xp: 0, found: ["ordmyndun"] }],
];

test("fixed tasks: right, wrong and every near miss, with the expected verdict and XP", () => {
  for (const [name, task, response, want] of FIXED) {
    const j = judge(task, response, freshPupil());
    assert.equal(j.pending, !!want.pending, name);
    assert.equal(j.ok, want.pending ? null : want.ok, `${name}: ok`);
    assert.equal(j.verdict, want.verdict, `${name}: verdict`);
    assert.equal(j.xp, want.xp, `${name}: xp`);
    if (want.found) assert.deepEqual(ids(j), want.found, `${name}: findings`);
    if (want.pending) { assert.deepEqual(j.effects, [], `${name}: nothing to settle`); continue; }
    assert.equal(j.detail.v.slip ? j.detail.v.slip.id : null, want.slip || null, `${name}: slip`);
    assert.equal(j.detail.v.near ? j.detail.v.near.id : null, want.near || null, `${name}: near miss`);
    assert.equal(j.finish.correct, want.ok, name);
    assert.equal(j.finish.slip, !!want.slip, `${name}: finish.slip`);
    if (task.type === "fill") assert.equal(j.finish.usedHelpers, !!want.usedHelpers, `${name}: helpers`);
    /* One record, carrying the XP and the time; one move of the difficulty. */
    assert.equal(records(j).length, 1, name);
    assert.equal(records(j)[0].xp, want.xp, name);
    assert.equal(records(j)[0].ok, want.ok, name);
    assert.equal(records(j)[0].timed, true, name);
    assert.deepEqual(j.effects[j.effects.length - 1], { do: "bump", skill: task.skill, ok: want.ok }, name);
  }
});

test("a soft finding marks the forgiven accent; the deduction is 5% of the finished figure", () => {
  const j = judge(STOLL, { text: stripAccents(form("stóll", "kk", "EFET")) }, freshPupil());
  assert.equal(j.findings[0].soft, true);
  assert.equal(j.detail.xpFull, FULL);
  assert.equal(j.xp, Math.round(FULL * 0.95));
  /* Never below 1 XP: a forgiven answer must not read as a wrong one. */
  const tiny = judge({ ...STOLL, base: 1 }, { text: stripAccents(form("stóll", "kk", "EFET")) }, freshPupil());
  assert.equal(tiny.xp, 1);
});

/* ========================================================================
 * 2. Every question type, on real tasks from every builder
 * ====================================================================== */

/** The response that is right, for any task. */
function rightResponse(t) {
  switch (t.type) {
    case "fill": case "verb": case "verbslot": case "gap": case "umritun": case "smidja":
      return { text: t.answers[0] };
    case "meaning": return { text: "þetta er orð sem ég þekki" };
    case "table": return { cells: askedCells(t).map((c) => t.w.forms[c.m][0]) };
    case "parse": return { picks: Object.fromEntries(parseRows(t.a, t.t).map((r) => [r.key, r.answer])) };
    case "syntax": return { picked: t.s.tok.findIndex((x) => x.r === t.askRole) };
    case "govern": return { picked: t.fall };
    case "indecl": case "clause": case "choice": return { picked: t.answer };
    case "tap": return { sel: t.targets.slice() };
    case "sort": return { picks: Object.fromEntries(t.items.map((it, k) => [k, it.cls])) };
    case "villur": {
      const edits = {};
      t.hunt.lines.forEach((ln, li) => ln.toks.forEach((tk, ti) => { if (tk.err) edits[`${li}:${ti}`] = tk.err.answers[0]; }));
      return { edits };
    }
    default: throw new Error("no right response for " + t.type);
  }
}

const optionValues = (row) => row.opts().map((o) => (typeof o === "string" ? o : o.v));
const isWord = (tok) => !/^[.,!?;:]$/.test(tok.w);

/** A response that is wrong, and the patterns it must (at least) find. */
function wrongResponse(t) {
  switch (t.type) {
    case "fill": case "verb": case "verbslot": case "gap":
      return { response: { text: t.answers[0] + "xq" } };
    /* What was shown, unchanged: the sentence — or the passive, the two
       sentences, the quotation (for `active` and `join` the bank sentence
       is the right answer). */
    case "umritun": return { response: { text: t.from || t.s.t } };
    case "smidja": return { response: { text: "xq zz yy" } };                // no card at all
    case "table": {
      const cells = askedCells(t).map((c) => t.w.forms[c.m][0]);
      cells[cells.length - 1] = "xq";
      return { response: { cells } };
    }
    case "parse": {
      const rows = parseRows(t.a, t.t);
      const picks = Object.fromEntries(rows.map((r) => [r.key, r.answer]));
      picks.fl = optionValues(rows[0]).find((v) => v !== rows[0].answer);
      return { response: { picks } };
    }
    case "syntax": {
      const k = t.s.tok.findIndex((x) => isWord(x) && judgeSyntax(t.s, t.askRole, t.s.tok.indexOf(x)).kind === "wrong");
      return k < 0 ? null : { response: { picked: k }, found: ["setningalidir"] };
    }
    case "govern":
      return { response: { picked: ["NF", "ÞF", "ÞGF", "EF"].find((k) => k !== t.fall) },
               found: [t.t.c === "sagnorð" ? "fallstjorn_so" : "fallstjorn_fs"] };
    case "indecl":
      return { response: { picked: ["atviksorð", "forsetning", "samtenging", "upphrópun", "nafnháttarmerki"].find((o) => o !== t.answer) } };
    case "clause":
      return { response: { picked: t.options.find((o) => o !== t.answer) }, found: ["setningagerd"] };
    case "choice":
      return { response: { picked: t.options.find((o) => o !== t.answer) }, found: t.miss || [] };
    case "tap": {
      const extra = t.s.tok.findIndex((x, k) => isWord(x) && !t.targets.includes(k));
      return extra < 0 ? null : { response: { sel: [...t.targets, extra] } };
    }
    case "sort": {
      const picks = Object.fromEntries(t.items.map((it, k) => [k, it.cls]));
      picks[0] = t.buckets.find((b) => b !== t.items[0].cls);
      return { response: { picks } };
    }
    case "villur": return { response: { edits: {} } };                  // nothing found
    default: return null;
  }
}

/** Real tasks: `n` from every builder in the registry, built for one pupil. */
function realTasks(pupil, n = 6, diffs = [2, 4, 6]) {
  const out = [];
  for (const diff of diffs) {
    const ctx = builderCtx(pupil, diff);
    for (const spec of TASKS) {
      for (let made = 0, tries = 0; made < n / diffs.length && tries < 40; tries++) {
        const t = show(ctx, spec.build);
        if (!t) continue;
        t.typeId = spec.id;
        out.push(t);
        made++;
      }
    }
  }
  return out;
}

const BANK = realTasks(freshPupil());

test("every renderer has a judge, and every builder makes a type that can be judged", () => {
  assert.deepEqual(Object.keys(RENDER).sort(), JUDGED_TYPES.slice().sort());
  const seen = new Set(BANK.map((t) => t.type));
  for (const type of JUDGED_TYPES) assert.ok(seen.has(type), `no real task of type ${type} was built`);
  for (const spec of TASKS) assert.ok(BANK.some((t) => t.typeId === spec.id), `${spec.id} built nothing`);
  assert.throws(() => judge({ type: "ekki-til" }, {}), /Enginn dómari/);
});

test("every type: the right answer is right, earns the old XP, finds nothing", () => {
  for (const t of BANK) {
    const pupil = freshPupil();
    const j = judge(t, rightResponse(t), pupil);
    const at = `${t.typeId} (${t.type})`;
    assert.equal(j.pending, false, at);
    assert.deepEqual(j.findings, [], `${at}: a right answer has no findings`);
    if (t.type === "meaning") {
      /* No right answer: an honest sentence earns the base, nothing counts. */
      assert.equal(j.ok, null, at); assert.equal(j.verdict, "open", at);
      assert.equal(j.xp, t.base, at);
      continue;
    }
    assert.equal(j.ok, true, `${at}: its own answer was judged wrong`);
    assert.equal(j.verdict, "right", at);
    assert.equal(j.finish.correct, true, at);
    const S = pupil.S;
    if (t.type === "table") {
      assert.equal(j.detail.right, askedCells(t).length, at);
      assert.equal(j.detail.bonus, 30, `${at}: the bonus for a whole table`);
      assert.equal(j.xp, j.detail.gained + 30, at);
      assert.equal(j.finish.perfectTable, true, at);
    } else if (t.type === "parse") {
      const rows = parseRows(t.a, t.t).length;
      assert.equal(j.xp, computeXp({ base: t.base * rows, lvl: t.lvl, ease: 0.5, run: 0, streak: 0 }), at);
      assert.equal(j.finish.perfectParse, true, at);
    } else {
      assert.equal(j.xp, oldXp(S, t), `${at}: xp`);
    }
  }
});

test("every type: a wrong answer is wrong, earns nothing (or its share), and is diagnosed", () => {
  const tried = new Set();
  for (const t of BANK) {
    const w = wrongResponse(t);
    if (!w) continue;
    tried.add(t.type);
    const pupil = freshPupil();
    const j = judge(t, w.response, pupil);
    const at = `${t.typeId} (${t.type})`;
    assert.equal(j.pending, false, at);
    assert.equal(j.ok, false, `${at}: a wrong answer was accepted`);
    assert.equal(j.verdict, "wrong", at);
    assert.equal(j.finish.correct, false, at);
    /* The findings are the diagnosis of what was answered, no more, no less. */
    assert.deepEqual(j.findings, diagnose(t, j.resp), at);
    (w.found || []).forEach((p) => assert.ok(ids(j).includes(p), `${at}: ${p} not found in ${ids(j)}`));
    if (t.type === "table") {
      /* Every right cell still earns its XP; no bonus; the table is one miss. */
      assert.equal(j.detail.right, askedCells(t).length - 1, at);
      assert.equal(j.detail.bonus, 0, at);
      assert.equal(j.xp, j.detail.gained, at);
      assert.equal(j.finish.perfectTable, false, at);
    } else if (t.type === "parse") {
      const rows = parseRows(t.a, t.t).length;
      assert.equal(j.detail.right, rows - 1, at);
      assert.equal(j.xp, rows === 1 ? 0 : computeXp({ base: t.base * (rows - 1), lvl: t.lvl, ease: 0.5, run: 0, streak: 0 }), at);
      assert.ok(ids(j).includes("ordflokkur") || ids(j).includes("ao_fs"), at);
    } else {
      assert.equal(j.xp, 0, `${at}: XP for a wrong answer`);
    }
    /* The difficulty of the skill goes down, once. */
    assert.deepEqual(j.effects.filter((e) => e.do === "bump"), [{ do: "bump", skill: t.skill, ok: false }], at);
  }
  for (const type of JUDGED_TYPES) if (type !== "meaning") assert.ok(tried.has(type), `no wrong answer tried for ${type}`);
});

test("written types: an accent short is accepted at 95% — unless the accent makes it another form", () => {
  let near = 0, other = 0;
  for (const t of BANK) {
    if (!["fill", "verb", "verbslot", "gap"].includes(t.type)) continue;
    const right = t.answers[0], plain = stripAccents(right);
    if (plain === normalise(right)) continue;
    const pupil = freshPupil();
    const j = judge(t, { text: plain }, pupil);
    const g = gradeForm(plain, { accepted: t.answers, paradigm: t.paradigm });
    const at = `${t.typeId}: ${plain} for ${right}`;
    if (g.verdict === "accents") {
      near++;
      assert.equal(j.ok, true, at); assert.equal(j.verdict, "near", at);
      const full = oldXp(pupil.S, t);
      assert.equal(j.xp, Math.max(1, Math.round(full * 0.95)), at);
      assert.equal(j.detail.xpFull, full, at);
      assert.equal(j.finish.slip, true, at);
      /* With a BÍN mark the slip is also noted as a (soft) spelling finding. */
      assert.deepEqual(ids(j), t.m ? ["broddar"] : [], at);
    } else if (g.verdict === "otherform") {
      other++;
      assert.equal(j.ok, false, at); assert.equal(j.xp, 0, at);
    }
  }
  assert.ok(near >= 5, `only ${near} accent slips were tried`);
});

test("tables stay strict: an accent short is a wrong cell", () => {
  let tried = 0;
  for (const t of BANK.filter((x) => x.type === "table")) {
    const cells = askedCells(t).map((c) => t.w.forms[c.m][0]);
    const k = cells.findIndex((f) => stripAccents(f) !== normalise(f));
    if (k < 0) continue;
    const plain = stripAccents(cells[k]);
    /* …and not when dropping the accent lands on another form of the word. */
    if (Object.values(t.w.forms).flat().some((f) => normalise(f) === plain)) continue;
    tried++;
    cells[k] = plain;
    const j = judge(t, { cells }, freshPupil());
    assert.equal(j.ok, false, t.title);
    assert.equal(j.detail.cells[k].ok, false, t.title);
    assert.equal(j.detail.right, cells.length - 1, t.title);
    assert.ok(ids(j).includes("broddar"), t.title);
  }
  assert.ok(tried >= 1, "no table with an accent in it was built");
});

test("a table takes its cells by position or by BÍN mark, and judges them the same", () => {
  for (const t of BANK.filter((x) => x.type === "table")) {
    const asked = askedCells(t);
    const marks = asked.map((c) => c.m);
    if (new Set(marks).size !== marks.length) continue;
    const list = asked.map((c, k) => (k === 0 ? "xq" : t.w.forms[c.m][0]));
    const byMark = Object.fromEntries(asked.map((c, k) => [c.m, list[k]]));
    assert.deepEqual(judge(t, { cells: byMark }, freshPupil()), judge(t, { cells: list }, freshPupil()), t.title);
    /* A sample nominative shown above the table is given, not asked. */
    if (t.sample) assert.equal(asked.length, t.cells.length - 1, t.title);
  }
});

test("syntax: a word the build cannot vouch for is not judged, and nothing counts", () => {
  /* A sentence of our own, so the three outcomes are certain. */
  const s = { tok: [
    { w: "Stelpan", r: "frumlag" }, { w: "ætlar", r: "umsögn" }, { w: "að", r: null },
    { w: "lesa", r: null, ra: ["umsögn"] }, { w: "bókina", r: null, rn: true }, { w: ".", r: null }] };
  const t = { type: "syntax", skill: "setningafraedi", s, askRole: "andlag", base: 12, lvl: 1, cell: "setn:andlag" };
  const unjudged = judge(t, { picked: 4 }, freshPupil());
  assert.equal(unjudged.ok, null);
  assert.equal(unjudged.verdict, "unjudged");
  assert.equal(unjudged.xp, 0);
  assert.deepEqual(unjudged.findings, []);
  assert.deepEqual(unjudged.effects, [{ do: "record", skill: t.skill, cell: t.cell, ok: true, xp: 0, counts: false, timed: true }]);
  assert.deepEqual(unjudged.finish, { correct: null });

  const wrong = judge(t, { picked: 0 }, freshPupil());
  assert.equal(wrong.ok, false);
  assert.deepEqual(ids(wrong), ["setningalidir"]);
  /* The predicate is always judged, and the infinitive may be given as one. */
  const pred = { ...t, askRole: "umsögn", cell: "setn:umsögn" };
  assert.equal(judge(pred, { picked: 3 }, freshPupil()).ok, true);
  assert.equal(judge(pred, { picked: 4 }, freshPupil()).ok, false);
  assert.equal(judge(pred, {}, freshPupil()).verdict, "incomplete");
});

test("an unfinished answer is pending for every type that can be unfinished", () => {
  const empty = {
    fill: { text: "" }, verb: { text: "" }, verbslot: { text: " " }, gap: { text: "" },
    umritun: { text: "" }, smidja: { text: "  " }, meaning: { text: "" },
    parse: { picks: {} }, syntax: {}, govern: {}, indecl: {}, clause: {}, choice: {},
    tap: { sel: [] }, sort: { picks: {} },
  };
  for (const t of BANK) {
    if (!(t.type in empty)) continue;
    const j = judge(t, empty[t.type], freshPupil());
    assert.equal(j.pending, true, t.typeId);
    assert.equal(j.ok, null, t.typeId);
    assert.ok(["empty", "incomplete"].includes(j.verdict), t.typeId);
    assert.deepEqual(j.effects, [], t.typeId);
    const p = freshPupil(), before = JSON.stringify(p.S);
    assert.equal(settle(p.S, p.sess, t, j), null, t.typeId);
    assert.equal(JSON.stringify(p.S), before, `${t.typeId}: a pending answer wrote something`);
  }
  /* A parse with one row left out is not an answer either. */
  const parse = BANK.find((t) => t.type === "parse" && parseRows(t.a, t.t).length > 1);
  const picks = rightResponse(parse).picks;
  delete picks[parseRows(parse.a, parse.t)[1].key];
  assert.equal(judge(parse, { picks }).verdict, "incomplete");
});

test("production: shares, slips and the other end of an agreement error", () => {
  let twoErr = 0, alt = 0, slips = 0, smidjaSlip = 0, umritunSlip = 0;
  for (const t of BANK) {
    const pupil = freshPupil(), S = pupil.S;
    if (t.type === "villur") {
      const errs = [];
      t.hunt.lines.forEach((ln, li) => ln.toks.forEach((tk, ti) => { if (tk.err) errs.push([`${li}:${ti}`, tk]); }));
      assert.equal(errs.length, t.hunt.errors);
      /* One record per error, the XP on the first; one tally. */
      const all = judge(t, rightResponse(t), pupil);
      assert.equal(records(all).length, errs.length);
      assert.deepEqual(records(all).map((r) => r.xp), errs.map((_, k) => (k === 0 ? all.xp : 0)));
      assert.deepEqual(records(all).map((r) => r.cell), errs.map(([, tk]) => tk.err.m));
      assert.ok(records(all).every((r) => r.tally === false));
      assert.deepEqual(all.effects.filter((e) => e.do === "tally"), [{ do: "tally", skill: t.skill, ok: true }]);
      if (errs.length === 2) {
        twoErr++;
        /* Half the errors: half the base, and the question is not right. */
        const half = judge(t, { edits: { [errs[0][0]]: errs[0][1].err.answers[0] } }, pupil);
        assert.equal(half.ok, false);
        assert.equal(half.xp, oldXp(S, t, { base: Math.round(t.base * 0.5) }));
        assert.deepEqual(records(half).map((r) => r.ok), [true, false]);
      }
      /* A correct word changed costs a share and is found as over-correction. */
      let free = null;
      t.hunt.lines.forEach((ln, li) => ln.toks.forEach((tk, ti) => {
        if (!free && !tk.err && !tk.punct && !errs.some(([, e]) => e.err.alt && e.err.alt.key === `${li}:${ti}`)) free = `${li}:${ti}`;
      }));
      const alarm = judge(t, { edits: { ...rightResponse(t).edits, [free]: "xq" } }, pupil);
      assert.equal(alarm.ok, false);
      assert.ok(ids(alarm).includes("ofleidretting"));
      assert.equal(alarm.xp, errs.length > 1
        ? oldXp(S, t, { base: Math.round(t.base * (errs.length - 1) / errs.length) }) : 0);
      /* Mended at its other end: right. */
      const viaAlt = errs.find(([, tk]) => tk.err.alt && tk.err.alt.answers);
      if (viaAlt) {
        alt++;
        const edits = rightResponse(t).edits;
        delete edits[viaAlt[0]];
        edits[viaAlt[1].err.alt.key] = viaAlt[1].err.alt.answers[0];
        const j = judge(t, { edits }, pupil);
        assert.equal(j.ok, true, "an agreement error mended at its other end");
        assert.equal(j.xp, all.xp);
      }
      const accented = errs.find(([, tk]) => stripAccents(tk.err.answers[0]) !== normalise(tk.err.answers[0]) &&
        stripAccents(tk.err.answers[0]) !== stripAccents(tk.w));
      if (accented) {
        slips++;
        const j = judge(t, { edits: { ...rightResponse(t).edits, [accented[0]]: stripAccents(accented[1].err.answers[0]) } }, pupil);
        assert.equal(j.ok, true, "an accent short in a hunt is a slip");
        assert.equal(j.xp, all.xp);
      }
    }
    if (t.type === "smidja") {
      const inflected = t.cards.filter((c) => !c.fixed);
      const all = judge(t, rightResponse(t), pupil);
      assert.equal(records(all).length, inflected.length);
      assert.deepEqual(records(all).map((r) => r.cell), inflected.map((c) => c.m));
      /* One card left in its dictionary form: half of the share that is right. */
      const k = t.cards.findIndex((c) => !c.fixed && !c.answers.some((f) => normalise(f) === normalise(c.text)));
      const words = t.cards.map((c, n) => (n === k ? c.text : c.answers[0]));
      const j = judge(t, { text: words.join(" ") }, pupil);
      const right = j.detail.right;
      assert.equal(j.ok, false);
      assert.ok(right < inflected.length);
      assert.equal(j.xp, right ? oldXp(S, t, { base: Math.round(t.base * (right / inflected.length) * 0.5) }) : 0);
      const plain = stripAccents(t.answers[0]);
      if (plain !== normalise(t.answers[0])) {
        const s = judge(t, { text: plain }, pupil);
        if (s.ok) { smidjaSlip++; assert.equal(s.xp, all.xp, "Setningasmiðja takes nothing off for an accent"); }
      }
    }
    if (t.type === "umritun") {
      const all = judge(t, rightResponse(t), pupil);
      const marks = t.marks || [{ m: t.cell }];
      assert.equal(records(all).length, marks.length);
      /* Only the first mark counts as an answer and carries the XP. */
      assert.deepEqual(records(all).map((r) => r.counts), marks.map((_, k) => k === 0));
      assert.deepEqual(records(all).map((r) => r.xp), marks.map((_, k) => (k === 0 ? all.xp : 0)));
      const hinted = judge(t, { ...rightResponse(t), hinted: true }, pupil);
      assert.equal(hinted.xp, oldXp(S, t, { hinted: true }));
      const plain = stripAccents(t.answers[0]);
      if (plain !== normalise(t.answers[0]) && plain !== stripAccents(t.from || t.s.t)) {
        umritunSlip++;
        const s = judge(t, { text: plain }, pupil);
        assert.equal(s.ok, true); assert.equal(s.verdict, "near");
        assert.equal(s.finish.slip, true);
        assert.equal(s.xp, oldXp(S, t, { factor: 0.95 }));
      }
    }
  }
  assert.ok(twoErr >= 1, "no hunt with two errors was built");
  assert.ok(umritunSlip >= 1, "no rewrite with an accent was built");
});

test("choice and gap: the patterns a question knows it tests are found on a miss", () => {
  let withMark = 0, plain = 0;
  for (const t of BANK) {
    if (t.type === "choice" && t.m && t.paradigm) {
      withMark++;
      const picked = t.options.find((o) => o !== t.answer);
      const j = judge(t, { picked });
      assert.equal(j.resp.kind, "form");
      assert.equal(j.resp.items[0].typed, picked);
      /* The options say which cell was meant. */
      if (t.optMarks && j.resp.items[0].g.otherMarks)
        assert.ok(j.resp.items[0].g.otherMarks.some((m) => t.optMarks.includes(m)) ||
          !gradeForm(picked, { accepted: [t.answer], paradigm: t.paradigm, allowHelpers: false })
            .otherMarks.some((m) => t.optMarks.includes(m)));
    }
    if (t.type === "gap" && t.plain && t.plain.length) {
      plain++;
      /* Tvær buxur for tvennar buxur. */
      const j = judge(t, { text: t.plain[0] });
      assert.equal(j.ok, false);
      assert.equal(j.detail.plain, true);
      assert.ok(ids(j).includes("fleirtoluord"), `${t.typeId}: ${ids(j)}`);
    }
  }
  assert.ok(withMark >= 1, "no choice with a BÍN mark was built");
  assert.ok(plain >= 1, "no plural-only numeral gap was built");
});

/* ========================================================================
 * 3. XP for a pupil with a history
 * ====================================================================== */

test("a pupil with a history, a run and a day streak earns the old XP, type by type", () => {
  const pupil = seasonedPupil();
  assert.equal(dayStreak(pupil.S), 3);
  let checked = 0, withHistory = 0, withNone = 0;
  for (const t of realTasks(pupil, 3, [3])) {
    if (["table", "parse", "meaning", "villur", "smidja"].includes(t.type)) continue;
    /* Some history for this very cell and word, so all three buckets weigh in. */
    if (t.cell) pupil.S.cells[t.cell] = { c: 5, w: 2 };
    if (t.word) pupil.S.words[t.word] = { c: 2, w: 4 };
    const j = judge(t, rightResponse(t), pupil);
    assert.equal(j.xp, oldXp(pupil.S, t), `${t.typeId}: xp`);
    withHistory += j.xp;
    withNone += judge(t, rightResponse(t)).xp;
    checked++;
  }
  assert.ok(checked > 60);
  /* The history matters: the run (×1.3) and the streak (×1.15) add more
     than the ease of a practised skill takes away. */
  assert.ok(withHistory > withNone * 1.05, `${withHistory} against ${withNone}`);
  /* Without a pupil the verdict is the same and the XP is a new pupil's. */
  const t = BANK.find((x) => x.type === "fill");
  const a = judge(t, rightResponse(t)), b = judge(t, rightResponse(t), freshPupil());
  assert.deepEqual(a, b);
});

/** A table settled the way ui/render.js did it in v6.12: cell by cell, each
    record moving the tallies the next cell's ease is read from. */
function oldTable(S, sess, t, typed) {
  let right = 0, gained = 0;
  askedCells(t).forEach((c, k) => {
    const m = c.m, acc = t.w.forms[m] || [];
    const ok = gradeForm(typed[k], { accepted: acc, paradigm: t.w.forms }).verdict === "correct";
    if (ok) {
      right++;
      const ease = easeFor(S, { cell: m, word: t.word, skill: t.skill });
      const xp = computeXp({ base: t.base, lvl: t.lvl, ease, run: S.run, streak: dayStreak(S) });
      gained += xp;
      record(S, sess, { skill: t.skill, cell: m, word: t.word, ok: true, xp, ms: 0, tally: false });
    } else record(S, sess, { skill: t.skill, cell: m, word: t.word, ok: false, xp: 0, tally: false });
  });
  const perfect = right === askedCells(t).length;
  tallyAnswer(S, sess, { skill: t.skill, ok: perfect });
  sess.tableRun = perfect ? (sess.tableRun || 0) + 1 : 0;
  let bonus = 0;
  if (perfect) {
    bonus = Math.round(30 * dayMult(dayStreak(S)));
    S.xp += bonus; S.skills[t.skill].xp += bonus; dayRec(S).xp += bonus;
    S.counters.perfectTables++;
  }
  bumpDiff(sess, S, t.skill, perfect);
  return { gained, bonus };
}

test("a table: every cell's XP and the bonus are what recording cell by cell gave", () => {
  const tables = realTasks(seasonedPupil(), 6, [3]).filter((t) => t.type === "table");
  assert.ok(tables.length >= 20);
  tables.forEach((t, n) => {
    const typed = askedCells(t).map((c, k) => (n % 3 === 1 && k === 1 ? "xq" : t.w.forms[c.m][0]));
    for (const goalToday of [false, true]) {
      const a = seasonedPupil(), b = seasonedPupil();
      b.sess.startedAt = a.sess.startedAt;
      for (const p of [a, b]) {
        p.S.words[t.word] = { c: 1, w: 3 };
        /* The ninth answer of the day is in: this table is the tenth, and the
           day streak grows with its own tally — the bonus is multiplied by
           the streak as it stands AFTER that. */
        if (goalToday) dayRec(p.S).a = (p.S.goal || 10) - 1;
      }
      const old = oldTable(a.S, a.sess, t, typed);
      const j = judge(t, { cells: typed }, b);
      assert.equal(j.detail.gained, old.gained, `${t.title}: cell XP`);
      assert.equal(j.detail.bonus, old.bonus, `${t.title}: bonus`);
      if (goalToday && j.ok) assert.equal(j.detail.bonus, Math.round(30 * dayMult(4)), t.title);
      settle(b.S, b.sess, t, j, { ms: 0 });
      /* The review queue is the one thing `settle` writes that the old
         handlers did not (v6.13, core/review.js): a table with a wrong cell
         leaves one entry — its first wrong cell — and a perfect one none. */
      const { review, ...rest } = b.S;
      const { review: none, ...was } = a.S;
      assert.deepEqual(none.items, []);
      assert.deepEqual(review.items.map((e) => [e.t, e.w, e.s]),
        j.ok ? [] : [[t.typeId, t.word, 0]], `${t.title}: the review queue after a table`);
      assert.deepEqual(rest, was, `${t.title}: the state after a table`);
      assert.deepEqual(b.sess, a.sess, `${t.title}: the session after a table`);
    }
  });
});

/* ========================================================================
 * 4. `judge` is pure; `settle` writes what was judged
 * ====================================================================== */

test("judge changes neither the task, the response nor the pupil", () => {
  for (const t of BANK) {
    const pupil = seasonedPupil();
    for (const response of [rightResponse(t), (wrongResponse(t) || {}).response].filter(Boolean)) {
      const before = [structuredClone(t), structuredClone(response), structuredClone(pupil)];
      const j1 = judge(t, response, pupil);
      assert.deepEqual([t, response, pupil], before, `${t.typeId}: judge wrote to its arguments`);
      /* …and so judging twice says the same thing twice. */
      assert.deepEqual(judge(t, response, pupil), j1, t.typeId);
      /* The judgement is data: it survives a network. */
      assert.deepEqual(JSON.parse(JSON.stringify(j1.effects)), j1.effects, t.typeId);
    }
  }
});

test("settle: the XP, one tally per answer, the run, the time and the difficulty", () => {
  for (const t of BANK) {
    for (const [kind, response] of [["right", rightResponse(t)], ["wrong", (wrongResponse(t) || {}).response]]) {
      if (!response) continue;
      const pupil = freshPupil(), { S, sess } = pupil;
      S.run = 4;
      const j = judge(t, response, pupil);
      const diff0 = sess.diff[t.skill];
      const extra = settle(S, sess, t, j, { ms: 4321 });
      const at = `${t.typeId} ${kind}`;
      const day = S.days[todayKey()];
      assert.equal(S.xp, j.xp, `${at}: S.xp`);
      assert.equal(day.xp, j.xp, `${at}: the day's XP`);
      assert.equal(S.skills[t.skill].xp, j.xp, `${at}: the skill's XP`);
      const counted = j.ok === null ? 0 : 1;
      assert.equal(day.a, counted, `${at}: one answer, however many records`);
      assert.equal(S.totalAnswers, counted, at);
      assert.equal(sess.answers, counted, at);
      assert.equal(S.totalCorrect, j.ok ? 1 : 0, at);
      assert.equal(S.run, j.ok === true ? 5 : j.ok === false ? 0 : 4, `${at}: the run`);
      /* The time is counted once — and not at all for a table with no right cell. */
      const timed = records(j).filter((r) => r.timed).length;
      assert.ok(timed <= 1, at);
      assert.equal(day.ms || 0, timed ? 4321 : 0, `${at}: the time`);
      if (j.ok === null) assert.equal(sess.diff[t.skill], diff0, `${at}: difficulty moved`);
      else assert.ok(j.ok ? sess.diff[t.skill] > diff0 : sess.diff[t.skill] < diff0 || diff0 === 1, `${at}: difficulty`);
      /* What app.finish is told. */
      assert.equal(extra.correct, j.ok, at);
      assert.equal(extra.findings, j.findings, at);
      if ("answer" in extra) assert.equal(extra.answerMs, j.ok ? 4321 : 0, at);
      else assert.ok(!("answerMs" in extra), at);
    }
  }
});

test("the meaning question: effort earns the base once; the same text again earns nothing", () => {
  const t = BANK.find((x) => x.type === "meaning");
  const pupil = freshPupil(), { S, sess } = pupil;
  const text = "Það er hlutur sem maður notar";
  const first = judge(t, { text }, pupil);
  assert.equal(first.xp, t.base);
  assert.equal(first.detail.effort, true);
  settle(S, sess, t, first);
  assert.deepEqual(sess.meaningTexts, [normalise(text)]);
  assert.equal(S.counters.meanings, 1);
  const again = judge(t, { text: text + "." }, pupil);
  assert.equal(again.xp, 0);
  assert.equal(again.detail.effort, false);
  assert.equal(judge(t, { text: "veit ekki" }, pupil).xp, 0);
  /* Neither right nor wrong: no answer is tallied and no run is broken. */
  assert.equal(S.totalAnswers, 0);
  assert.equal(S.skills[t.skill].c + S.skills[t.skill].w, 0);
});

test("the bonus sentence: judged and settled by the same path", () => {
  const e = lex.lookup("hestur", "kk");
  const t = { type: "choice", skill: "ordaford", word: "hestur|kk", bonus: e };
  const pupil = freshPupil(), { S, sess } = pupil;
  const none = judgeBonus(t, "Hesturinn", pupil);
  assert.equal(none.pending, true);
  assert.match(none.detail.why, /þrjú orð/);
  assert.equal(settle(S, sess, t, none), null);
  assert.equal(S.xp, 0);
  const text = `Ég sá ${e.forms.ÞFET[0]} í gær`;
  const j = judgeBonus(t, text, pupil);
  assert.equal(j.pending, false);
  assert.equal(j.xp, BONUS_XP);
  assert.equal(settle(S, sess, t, j), null, "the bonus does not end a question");
  assert.equal(S.xp, BONUS_XP);
  assert.equal(S.counters.meanings, 1);
  assert.equal(S.totalAnswers, 0);
  assert.equal(S.words["hestur|kk"].c, 1);
  /* The same sentence does not earn twice. */
  assert.equal(judgeBonus(t, text, pupil).pending, true);
});

test("a whole session can be played without a screen", () => {
  assert.equal(typeof document, "undefined");
  const pupil = freshPupil();
  const ctx = builderCtx(pupil, 2);
  ctx.run = null;
  const types = new Set();
  let right = 0;
  for (let n = 0; n < 250; n++) {
    const t = ask(ctx);
    assert.ok(t, "no task");
    types.add(t.type);
    /* Three in four right, the rest wrong where a wrong answer can be made. */
    const w = n % 4 === 3 ? wrongResponse(t) : null;
    const j = judge(t, w ? w.response : rightResponse(t), pupil);
    assert.equal(j.pending, false, t.typeId);
    settle(pupil.S, pupil.sess, t, j, { ms: 3000 });
    if (j.ok) right++;
  }
  assert.equal(pupil.S.totalCorrect, right);
  assert.ok(pupil.S.xp > 1000);
  assert.ok(types.size >= 12, `only ${[...types]} came up`);
});

/* ========================================================================
 * 5. The renderers no longer grade
 * ====================================================================== */

test("ui/render.js and ui/render-more.js grade nothing and record nothing themselves", () => {
  for (const file of ["render.js", "render-more.js"]) {
    const src = readFileSync(new URL(`../src/js/ui/${file}`, import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "");           // comments may name them
    for (const call of ["record(", "bumpDiff(", "tallyAnswer(", "gradeForm(", "gradeHunt(",
      "gradeWorkshop(", "gradeTransform(", "verdictOf(", "computeXp(", "easeFor("])
      assert.ok(!src.includes(call), `${file} still calls ${call}`);
    /* Every submit handler ends in the one shared path. */
    const handlers = src.match(/^function submit\w+\(app\)/gm) || [];
    const concluded = src.match(/^ {2}conclude\(app, t, \w+, \(\) => \{/gm) || [];
    assert.ok(handlers.length >= 4, file);
    assert.equal(concluded.length, handlers.length, `${file}: a submit handler does not end in conclude()`);
    assert.ok(!/app\.finish\(/.test(src.replace(/function conclude[\s\S]*?\n}\n/, "")),
      `${file}: app.finish is called outside conclude()`);
  }
});
