/* This test runs the engine against the real data and watches for one thing:
   that no task reaches the child unless it is intact. A wrong question is worse
   than no question, so every single task the engine produces across many
   thousand attempts is inspected here.                                    */

import { test } from "node:test";
import assert from "node:assert/strict";
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, newSession, record, wordKey } from "../src/js/core/state.js";
import { bumpDiff } from "../src/js/core/difficulty.js";
import { TASKS } from "../src/js/tasks/index.js";
import { verbConjugation } from "../src/js/tasks/sagnord.js";
import { topByRank, shareForLevel, wordWeight } from "../src/js/tasks/shared.js";
import { ask } from "./helpers.js";
import { SKILL_IDS } from "../src/js/core/skills.js";
import { readMark, isStyfdur } from "../src/js/core/marks.js";
import { parseRows } from "../src/js/ui/render.js";
import { gradeForm } from "../src/js/core/grading.js";

const lex = buildLexicon(DATA);

function ctxWith(overrides = {}) {
  const S = blankState();
  SKILL_IDS.forEach((id) => { S.enabled[id] = true; });
  Object.assign(S, overrides.S || {});
  return { lex, S, sess: newSession(S), forcedNoun: null, ...overrides };
}

/** Every invariant a question must satisfy before a child sees it. */
function checkTask(t) {
  assert.ok(t, "a task must not be null");
  assert.ok(t.skill && SKILL_IDS.includes(t.skill), `unknown skill: ${t.skill}`);
  assert.ok(typeof t.base === "number" && t.base > 0, `${t.type}: vantar XP-grunn`);

  if (t.answers) {
    assert.ok(Array.isArray(t.answers) && t.answers.length > 0,
      `${t.type}: tómt svarasett`);
    for (const a of t.answers) {
      assert.equal(typeof a, "string");
      assert.ok(a.trim().length > 0, `${t.type}: tómt svar`);
      assert.ok(!a.includes("undefined"), `${t.type}: malformed answer "${a}"`);
    }
    /* the correct answer has to survive its own grader */
    assert.equal(gradeForm(t.answers[0], { accepted: t.answers }).verdict, "correct",
      `${t.type}: a correct answer graded wrong`);
  }

  if (t.type === "fill") {
    assert.ok(t.s && t.s.tok[t.i], "the blank does not point at a token");
    assert.ok(t.a.fall, "a cloze with no case");
    assert.ok(t.n.forms[t.m], "the word does not have the form being asked for");
  }
  if (t.type === "table") {
    assert.ok(t.cells.length >= 4, "of stutt tafla");
    for (const c of t.cells) {
      const f = t.w.forms[c.m];
      assert.ok(f && f.length, `${t.w.o}: no form for ${c.m}`);
    }
    const marks = t.cells.map((c) => c.m);
    assert.equal(new Set(marks).size, marks.length, "a duplicated cell in a table");
  }
  if (t.type === "parse") {
    assert.ok(t.t.c, "analysis of a word with no word class");
  }
  if (t.type === "govern") {
    assert.ok(["NF", "ÞF", "ÞG", "EF"].includes(t.fall), `ógilt fall: ${t.fall}`);
  }
  if (t.type === "indecl") {
    assert.ok(t.answer, "an indeclinable word with no answer");
  }
  if (t.type === "meaning") {
    assert.ok(t.n.d, "a word meaning with no definition");
  }
}

test("5000 tasks in a row are all intact", () => {
  const ctx = ctxWith();
  const seen = new Set();
  for (let i = 0; i < 5000; i++) {
    const t = ask(ctx);
    checkTask(t);
    seen.add(t.typeId);
    /* let the child answer sometimes right and sometimes wrong so difficulty drifts */
    const ok = Math.random() < 0.7;
    record(ctx.S, ctx.sess, {
      skill: t.skill, cell: t.cell, word: t.word, ok,
      xp: ok ? 10 : 0, counts: t.counts !== false,
    });
    bumpDiff(ctx.sess, ctx.S, t.skill, ok);
  }
  assert.ok(seen.size >= 10, `only ${seen.size} types appeared: ${[...seen]}`);
});

test("tasks appear at every difficulty level", () => {
  const ctx = ctxWith();
  const levels = new Set();
  for (let i = 0; i < 3000; i++) {
    const t = ask(ctx);
    levels.add(t.lvl);
    bumpDiff(ctx.sess, ctx.S, t.skill, true);
    record(ctx.S, ctx.sess, { skill: t.skill, ok: true, xp: 20 });
  }
  assert.ok(levels.size >= 3, `difficulty stuck at ${[...levels]}`);
});

test("a switched-off skill never appears", () => {
  const S = blankState();
  SKILL_IDS.forEach((id) => { S.enabled[id] = false; });
  S.enabled.nafnord = true;
  const ctx = { lex, S, sess: newSession(S), forcedNoun: null };
  for (let i = 0; i < 400; i++) {
    const t = ask(ctx);
    assert.equal(t.skill, "nafnord", `${t.typeId} slapp í gegn`);
  }
});

test("syntax is off by default (year 9)", () => {
  const S = blankState();
  assert.equal(S.enabled.setningafraedi, false);
  const ctx = { lex, S, sess: newSession(S), forcedNoun: null };
  for (let i = 0; i < 300; i++)
    assert.notEqual(ask(ctx).type, "syntax");
});

test("both readings of a homograph exist in the corpus", () => {
  const ljos = lex.lemma("ljós").map((w) => w.c).sort();
  assert.ok(ljos.includes("hk"), "ljós is missing as a noun");
  assert.ok(ljos.includes("lo"), "ljós is missing as an adjective");
  assert.ok(lex.homographClasses("réttur").length > 1);
  /* and they do not get confused with each other */
  const no = lex.lookup("ljós", "hk"), lo = lex.lookup("ljós", "lo");
  assert.notEqual(no.i, lo.i);
  assert.ok(no.forms.ÞGFET, "the noun should have a dative singular");
  assert.ok(lo.forms["FSB-KK-NFET"], "the adjective should have a strong inflection");
  assert.notEqual(wordKey("ljós", "hk"), wordKey("ljós", "lo"));
});

test("ordinals make it in (gap 5 in an earlier version)", () => {
  const rt = lex.byClass.rt || [];
  assert.ok(rt.length >= 10, `only ${rt.length} ordinals`);
  const thridji = lex.lookup("þriðji", "rt");
  assert.ok(thridji && thridji.forms["KK-NFET"], "þriðji has no paradigm");
});

test("all eleven word classes are present", () => {
  const classes = new Set(lex.all.map((w) => w.fl));
  for (const c of ["nafnorð", "lýsingarorð", "sagnorð", "fornafn", "greinir",
                   "töluorð", "atviksorð", "forsetning", "samtenging",
                   "nafnháttarmerki", "upphrópun"])
    assert.ok(classes.has(c), `vantar ${c}`);
});

test("strong and weak conjugation is derived from the past tense", () => {
  assert.equal(verbConjugation(lex.lookup("kalla", "so")), "veik");
  const taka = lex.lookup("taka", "so");
  if (taka) assert.equal(verbConjugation(taka), "sterk");
});

test("no sentence points at a mark the word does not have", () => {
  for (const s of lex.sentences) {
    if (s.slot == null) continue;
    const t = s.tok[s.slot];
    assert.ok(t, `${s.t}: the blank points outside the sentence`);
    if (!t.m) continue;
    assert.ok(readMark(t.m).fall, `${s.t}: a mark with no case in the blank`);
  }
});

test("the catalogue and the renderers stay in step", () => {
  for (const t of TASKS) {
    assert.ok(SKILL_IDS.includes(t.skill), `${t.id} points at an unknown skill`);
    assert.equal(typeof t.build, "function");
  }
});

/* ---------- v5.5: the cap on the vocabulary was lifted --------------------
 *
 * These tests protect the change that is easiest to undo silently: frequency
 * caps written as fixed numbers become too narrow as the corpus grows, and
 * nobody notices — the child simply never sees the new words.               */

test("the frequency cap is a share of the pool, not a fixed number", () => {
  const pool = Array.from({ length: 1000 }, (_, i) => ({ r: i + 1 }));
  assert.equal(topByRank(pool, 0.2).length, 200);
  assert.equal(topByRank(pool, 1).length, 1000);
  /* The same share on a pool twice as large yields twice as many words — which
     is exactly what a fixed number did NOT do. */
  const big = Array.from({ length: 2000 }, (_, i) => ({ r: i + 1 }));
  assert.equal(topByRank(big, 0.2).length, 400);
});

test("an empty or over-narrow pool returns everything rather than nothing", () => {
  assert.deepEqual(topByRank([], 0.5), []);
  const tiny = [{ r: 900 }, { r: 950 }];
  assert.equal(topByRank(tiny, 0.1).length, 2, "no question is worse than a rare word");
});

test("the share grows with skill level and never exceeds one", () => {
  assert.equal(shareForLevel(1, 0.16, 0.065), 0.16);
  assert.ok(shareForLevel(7, 0.16, 0.065) > shareForLevel(3, 0.16, 0.065));
  assert.equal(shareForLevel(99, 0.5, 0.5), 1);
});

test("the top skill level covers most of the vocabulary", () => {
  /* The request was "use the whole corpus". If somebody puts fixed numbers back
     in, this fails: the share collapses the moment the corpus grows. */
  const adj = lex.adjectives;
  assert.ok(adj.length > 500, `only ${adj.length} adjectives — did the cap come back?`);
  const top = topByRank(adj, shareForLevel(7, 0.16, 0.065));
  assert.ok(top.length / adj.length > 0.5,
    `the top level covers only ${Math.round(100 * top.length / adj.length)}% of adjectives`);
});

test("common words are still many times likelier than rare ones", () => {
  /* The other side of the same request: "could common words still come up more
     often?" */
  /* v6.13: the weight also reads the session's level and the policy (the
     second axis, item 16), and the commonest nouns are the irregular ones —
     so the comparison is between two words of the same irregularity. */
  const view = { S: { skills: {}, words: {} }, sess: { seen: [], diff: {} }, policy: { maxLevel: 7 } };
  const regular = lex.nouns.filter((x) => x.irr === 1).sort((a, b) => a.r - b.r);
  const common = regular[0], rare = regular[regular.length - 1];
  assert.ok(common.r <= 10, `the commonest regular noun has rank ${common.r}`);
  const wc = wordWeight(lex, view, common, "nafnord");
  const wr = wordWeight(lex, view, rare, "nafnord");
  assert.ok(wc / wr > 20, `a common word is only ${(wc / wr).toFixed(1)}x likelier`);
});

/* ================= v5.9 ================================================== */

test("no question is ever built on a stýfður boðháttur", () => {
  /* The owner's report, in the form the program can be held to: *ræt* is BÍN's
     `GM-BH-ST` for *ræta*, and it must not reach a child as an exercise. Ten
     thousand questions, because the form is one cell of one mood and a small
     sample proves nothing about a rare cell. */
  const ctx = ctxWith();
  const bad = [];
  for (let i = 0; i < 10000; i++) {
    const t = ask(ctx);
    if (!t) continue;
    const marks = [t.m, t.cell, t.t && t.t.m, ...(t.cells || []).map((c) => c.m)];
    for (const m of marks)
      if (m && isStyfdur(m)) bad.push(`${t.type}: ${t.word || ""} ${m}`);
    const ok = Math.random() < 0.7;
    record(ctx.S, ctx.sess, { skill: t.skill, cell: t.cell, word: t.word, ok,
      xp: ok ? 10 : 0, counts: t.counts !== false });
    bumpDiff(ctx.sess, ctx.S, t.skill, ok);
  }
  assert.deepEqual(bad.slice(0, 10), []);
});

test("the analysis question always offers the answer it is looking for", () => {
  /* This is the one that would have caught the missing lýsingarháttur. Every
     row of every analysis question drawn: is the right answer among that row's
     own buttons? A question whose correct answer is not on the screen cannot be
     answered, and up to v5.8 that was true of every LHNT, LHÞT and SAGNB form
     the reverse builder produced. */
  const ctx = ctxWith();
  const bad = [];
  for (let i = 0; i < 4000; i++) {
    const t = ask(ctx);
    if (!t || t.type !== "parse") continue;
    for (const r of parseRows(t.a, t.t)) {
      const opts = r.opts().map((o) => (typeof o === "string" ? o : o.v));
      if (!opts.includes(r.answer))
        bad.push(`${t.t.w} (${t.t.m}) — ${r.label}: ${r.answer} not offered`);
    }
  }
  assert.deepEqual([...new Set(bad)].slice(0, 10), []);
});

test("under í or á only a noun with that convention is substituted", () => {
  /* "Strákarnir fóru í ströndina" — grammatical, and not Icelandic. The build
     marks such a slot `ps`; a noun may stand there only if noun_classes.py
     records the same preposition for it (`p`). */
  const withPs = lex.sentences.filter((s) => s.ps);
  assert.ok(withPs.length > 20, `only ${withPs.length} sentences carry ps`);
  const byText = new Map(withPs.map((s) => [s.t, s]));

  const ctx = ctxWith();
  const bad = [];
  for (let i = 0; i < 3000; i++) {
    const t = ask(ctx);
    if (!t || !t.s || !t.s.ps) continue;
    const slot = t.s.derived ? t.i : t.s.slot;
    const tok = t.s.tok[slot];
    const w = lex.lookup(tok.l, tok.x) || lex.lookup(tok.l, "nafnorð");
    const original = byText.get(t.s.t) && byText.get(t.s.t).tok[slot].l === tok.l;
    if (!original && (!w || w.p !== t.s.ps)) bad.push(`${t.s.t} <- ${tok.l}`);
  }
  assert.deepEqual(bad.slice(0, 5), []);
});

test("no sentence in the bank pins its blank with a numeral", () => {
  /* *Klukkan er þrjú*: the predicative fixes the number, so the blank holds
     exactly one word in the whole language. Removed in v5.9, and the build
     stops if one comes back — this is the same claim, asserted against the
     shipped data. */
  const bad = lex.sentences.filter((s) => {
    if (s.slot == null || s.fixed) return false;
    if (s.tok[s.slot].r !== "frumlag") return false;
    return s.tok.some((t, j) => j !== s.slot && t.r === "sagnfylling" && t.c === "töluorð");
  });
  assert.deepEqual(bad.map((s) => s.t), []);
});
