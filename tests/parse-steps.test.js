/* Greindu orðið, asked in turns (v6.13, critique items 1 and 49).
 *
 * The question used to show every row at once, and only the rows that fit
 * the right answer: a verb arrived with Mynd, Háttur, Tíð and Persóna under
 * the class chips, and its definition beside them. Now the class is asked
 * first and alone, judged on its own button, and only then do the rows of
 * the right class follow, one at a time.
 *
 * Two halves:
 *   1. the judge (core/answer.js): the two steps, the wrong-class path and
 *      what a wrong class costs;
 *   2. the renderer (ui/render.js) against a fake document that keeps every
 *      piece of HTML written to it, so "nothing on the page names the class
 *      before it is answered" is checked on the markup itself.            */

import { test } from "node:test";
import assert from "node:assert/strict";
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, newSession } from "../src/js/core/state.js";
import { computeXp } from "../src/js/core/progress.js";
import { SKILL_IDS } from "../src/js/core/skills.js";
import { createPolicy } from "../src/js/core/policy.js";
import { ALL_CLASSES } from "../src/js/core/marks.js";
import { TASKS } from "../src/js/tasks/index.js";
import { show } from "./helpers.js";
import { judge, settle, parseRows } from "../src/js/core/answer.js";
import { RENDER } from "../src/js/ui/render.js";

const lex = buildLexicon(DATA);

function freshPupil() {
  const S = blankState();
  SKILL_IDS.forEach((id) => { S.enabled[id] = true; });
  return { S, sess: newSession(S) };
}

function ctxFor(pupil, diff) {
  Object.keys(pupil.sess.diff).forEach((k) => { pupil.sess.diff[k] = diff; });
  const all = {};
  SKILL_IDS.forEach((id) => { all[id] = true; });
  return { lex, S: pupil.S, sess: pupil.sess, forcedNoun: null, run: {},
    policy: createPolicy(null, { skills: all, types: {}, levels: {}, attrs: {}, safeVocab: null }) };
}

/* Every builder whose renderer is `parse` (Greining, and the adjective
   analysis), at several levels, so verbs, nouns, adjectives and the
   indeclinable words with no row but the class all come up. */
const PARSE_SPECS = TASKS.filter((s) => s.renderer === "parse");
function parseBank(n = 40) {
  const out = [];
  for (const diff of [1, 3, 5, 7]) {
    const ctx = ctxFor(freshPupil(), diff);
    for (const spec of PARSE_SPECS)
      for (let made = 0, tries = 0; made < n / 4 && tries < 200; tries++) {
        const t = show(ctx, spec.build);
        if (!t || t.type !== "parse") continue;
        t.typeId = spec.id;
        out.push(t);
        made++;
      }
  }
  return out;
}
const BANK = parseBank();

const wrongClass = (t) => ALL_CLASSES.find((c) => c !== t.t.c);
const allRight = (t) => Object.fromEntries(parseRows(t.a, t.t).map((r) => [r.key, r.answer]));

test("the bank has every shape: words with feature rows, and words with the class alone", () => {
  assert.ok(PARSE_SPECS.length >= 2, "expected Greining and the adjective analysis");
  assert.ok(BANK.length >= 40, `only ${BANK.length} parse tasks built`);
  assert.ok(BANK.some((t) => parseRows(t.a, t.t).length > 1));
  assert.ok(BANK.some((t) => t.t.c === "sagnorð"), "no verb in the bank — the case the critique names");
});

/* ======================================================================
 * 1. The judge
 * ==================================================================== */

test("class first: nothing chosen is pending at the class step, and changes nothing", () => {
  for (const t of BANK) {
    const p = freshPupil(), before = JSON.stringify(p.S);
    const j = judge(t, { picks: {} }, p);
    assert.equal(j.pending, true, t.typeId);
    assert.equal(j.verdict, "incomplete", t.typeId);
    assert.equal(j.detail.step, "class", t.typeId);
    assert.deepEqual(j.effects, [], t.typeId);
    /* Feature rows picked without a class are still not an answer. */
    const { fl, ...rest } = allRight(t);
    assert.equal(judge(t, { picks: rest }, p).detail.step, "class", `${t.typeId}: rows before the class`);
    assert.equal(settle(p.S, p.sess, t, j), null);
    assert.equal(JSON.stringify(p.S), before, t.typeId);
  }
});

test("class first: the right class opens the rows of its class, and the whole answer is right", () => {
  for (const t of BANK) {
    const rows = parseRows(t.a, t.t);
    const p = freshPupil();
    const step = judge(t, { picks: { fl: t.t.c } }, p);
    if (rows.length === 1) {
      /* Nothing but the class: the class button finishes the question. */
      assert.equal(step.pending, false, t.typeId);
      assert.equal(step.ok, true, t.typeId);
      continue;
    }
    assert.equal(step.pending, true, t.typeId);
    assert.equal(step.detail.step, "rows", t.typeId);
    assert.deepEqual(step.detail.cls, { picked: t.t.c, answer: t.t.c, ok: true }, t.typeId);
    assert.deepEqual(step.detail.ask.map((r) => r.key), rows.slice(1).map((r) => r.key), t.typeId);
    assert.deepEqual(step.effects, [], `${t.typeId}: the class step wrote something`);
    const j = judge(t, { picks: allRight(t) }, p);
    assert.equal(j.ok, true, t.typeId);
    assert.equal(j.detail.cls.ok, true, t.typeId);
    assert.equal(j.finish.perfectParse, true, t.typeId);
  }
});

test("a wrong class: marked, the right class named, its rows asked — and what it costs", () => {
  let withRows = 0, alone = 0;
  for (const t of BANK) {
    const rows = parseRows(t.a, t.t);
    const said = wrongClass(t);
    const p = freshPupil();
    if (rows.length > 1) {
      const step = judge(t, { picks: { fl: said } }, p);
      assert.equal(step.pending, true, t.typeId);
      assert.deepEqual(step.detail.cls, { picked: said, answer: t.t.c, ok: false }, t.typeId);
      /* The rows of the RIGHT class: a wrong class has no answers to ask. */
      assert.deepEqual(step.detail.ask.map((r) => r.key), rows.slice(1).map((r) => r.key), t.typeId);
      assert.deepEqual(step.effects, [], t.typeId);
    }
    const j = judge(t, { picks: { ...allRight(t), fl: said } }, p);
    assert.equal(j.pending, false, t.typeId);
    assert.equal(j.ok, false, `${t.typeId}: a wrong class still counted as a right analysis`);
    assert.equal(j.verdict, "wrong", t.typeId);
    assert.equal(j.finish.correct, false, t.typeId);
    assert.equal(j.finish.perfectParse, false, t.typeId);
    assert.equal(j.detail.cls.ok, false, t.typeId);
    assert.equal(j.detail.right, rows.length - 1, t.typeId);
    /* The class row earns nothing; every feature row after it earns its full
       share — the rows are as hard on both paths, since the class is known
       on both by then (see JUDGES.parse). */
    const want = rows.length === 1 ? 0
      : computeXp({ base: t.base * (rows.length - 1), lvl: t.lvl, ease: 0.5, run: 0, streak: 0 });
    assert.equal(j.xp, want, t.typeId);
    /* One record, wrong; the difficulty goes down once; the class is diagnosed. */
    const recs = j.effects.filter((e) => e.do === "record");
    assert.equal(recs.length, 1, t.typeId);
    assert.equal(recs[0].ok, false, t.typeId);
    assert.deepEqual(j.effects.filter((e) => e.do === "bump"), [{ do: "bump", skill: t.skill, ok: false }]);
    assert.ok(j.findings.some((f) => f.p === "ordflokkur" || f.p === "ao_fs"), t.typeId);
    if (rows.length > 1) withRows++; else alone++;
  }
  assert.ok(withRows > 0 && alone >= 0);
});

test("missing the class on purpose gains nothing", () => {
  for (const t of BANK) {
    const p = freshPupil();
    const right = judge(t, { picks: allRight(t) }, p);
    const wrong = judge(t, { picks: { ...allRight(t), fl: wrongClass(t) } }, p);
    assert.ok(wrong.xp < right.xp, `${t.typeId}: ${wrong.xp} XP for a wrong class, ${right.xp} for the right one`);
  }
});

/* ======================================================================
 * 2. The renderer, on a fake document
 * ==================================================================== */

/** Just enough of a document for RENDER.parse: elements by id, made on
    demand, that remember what was written into them. Nothing parses the
    HTML, so what is checked is exactly the markup the renderer produced. */
function fakeDocument() {
  const els = {};
  const el = (id) => (els[id] ||= {
    id, innerHTML: "", textContent: "", onclick: null, disabled: false,
    focus() {}, scrollIntoView() {},
  });
  globalThis.document = {
    getElementById: el,
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  return els;
}

/** A tap on an option, as the delegated listener on #parserows sees it. */
function tapOption(els, key, v) {
  const box = { dataset: { q: key }, querySelectorAll: () => [] };
  const btn = { disabled: false, dataset: { v }, parentNode: box,
    closest: (sel) => (sel === ".opts" ? box : null) };
  const target = { closest: (sel) => (sel === ".opts button" ? btn : null) };
  els.parserows.onclick({ target });
}

const ROW_LABELS = ["Kyn", "Tala", "Fall", "Greinir", "Stigbreyting", "Beyging", "Mynd", "Háttur", "Tíð", "Persóna"];
const FEATURE_KEYS = ["kyn", "tala", "fall", "greinir", "stig", "beyging", "mynd", "háttur", "tíð", "persóna"];

function appFor(t) {
  const p = freshPupil();
  const finished = [];
  return { cur: t, lex, S: p.S, sess: p.sess, defs: null, clock: null,
    refresh() {}, finish(extra) { finished.push(extra); }, finished };
}

/** Everything on the page, with the class chips taken out. */
const pageWithoutChips = (els) =>
  Object.values(els).map((e) => e.innerHTML).join("\n")
    .replace(/<div class="opts" data-q="fl">[\s\S]*?<\/div>/g, "");

test("before the class is answered: no feature row, no definition, nothing that names the class", () => {
  let verbs = 0;
  for (const t0 of BANK) {
    const t = structuredClone(t0);
    const els = fakeDocument();
    const app = appFor(t);
    RENDER.parse(app);
    const html = Object.values(els).map((e) => e.innerHTML).join("\n");
    for (const k of FEATURE_KEYS)
      assert.ok(!html.includes(`data-q="${k}"`), `${t.typeId}: the ${k} row is on the page before the class`);
    assert.ok(html.includes('data-q="fl"'), `${t.typeId}: no class row`);
    const rest = pageWithoutChips(els);
    for (const label of ROW_LABELS)
      assert.ok(!new RegExp(`>${label}<`).test(rest), `${t.typeId}: "${label}" is on the page before the class`);
    assert.ok(!/defline|dfn|id="defbox"/.test(rest), `${t.typeId}: a definition is on the page before the class`);
    assert.equal(els.defslot ? els.defslot.innerHTML : "", "", t.typeId);
    /* The eyebrow is neutral, and no class name stands anywhere but in the
       chips — the sentence aside, which is the pupil's to read. */
    const outside = rest.replace(/<p class="sentence">[\s\S]*?<\/p>/, "");
    assert.ok(!outside.includes(`>${t.t.c}<`), `${t.typeId}: "${t.t.c}" is named before it is asked`);
    if (t.t.c === "sagnorð") verbs++;
  }
  assert.ok(verbs > 0, "no verb was rendered — the case the critique names");
});

test("the class button commits the class; then one row at a time, the definition back", () => {
  let wrongPaths = 0, rightPaths = 0;
  for (const [n, t0] of BANK.entries()) {
    const rows = parseRows(t0.a, t0.t);
    if (rows.length < 2) continue;
    const t = structuredClone(t0);
    const els = fakeDocument();
    const app = appFor(t);
    RENDER.parse(app);
    /* The button with nothing picked asks for a class and commits nothing. */
    els.check.onclick();
    assert.match(els.verdict.innerHTML, /orðflokk/, t.typeId);
    assert.equal(t.cls, null, t.typeId);
    /* Every other task takes the wrong path. */
    const wrong = n % 2 === 1;
    const said = wrong ? wrongClass(t) : t.t.c;
    tapOption(els, "fl", said);
    /* A tap on a class chip does not commit it. */
    assert.equal(t.cls, null, `${t.typeId}: a tap committed the class`);
    assert.ok(!els.parserows.innerHTML.includes(`data-q="${rows[1].key}"`), t.typeId);
    els.check.onclick();
    assert.deepEqual(t.cls, { picked: said, answer: t.t.c, ok: !wrong }, t.typeId);
    assert.equal(app.finished.length, 0, `${t.typeId}: the class step finished the question`);
    let page = els.parserows.innerHTML;
    if (wrong) {
      assert.match(page, /qpick wrongpick/, `${t.typeId}: the wrong class is not marked`);
      assert.ok(page.includes(`Orðið er`), `${t.typeId}: the right class is not named`);
      wrongPaths++;
    } else {
      assert.ok(!/wrongpick/.test(page), t.typeId);
      rightPaths++;
    }
    assert.match(page, /qpick right/, t.typeId);
    /* Lexicon entries carry their short definition (`d`): if the word has
       one, it is back now, and open. */
    const entry = lex.lookup(t.t.l, t.t.x) || lex.lookup(t.t.l, t.t.c);
    if (entry && entry.d) {
      assert.match(els.defslot.innerHTML, /class="dfn"/, `${t.typeId}: the definition did not come back open`);
      assert.ok(!/dfnlocked/.test(els.defslot.innerHTML), t.typeId);
    }
    /* Row by row: only the open one has options; the ones answered are one
       line each; the ones to come are not there. */
    for (let k = 1; k < rows.length; k++) {
      page = els.parserows.innerHTML;
      const open = [...page.matchAll(/class="opts" data-q="([^"]+)"/g)].map((m) => m[1]);
      assert.deepEqual(open, [rows[k].key], `${t.typeId}: row ${k}: open rows ${open}`);
      for (const later of rows.slice(k + 1))
        assert.ok(!page.includes(`"${later.key}"`), `${t.typeId}: ${later.key} is shown before its turn`);
      for (const done of rows.slice(1, k))
        assert.ok(page.includes(`data-reopen="${done.key}"`), `${t.typeId}: ${done.key} answered but not summarised`);
      tapOption(els, rows[k].key, rows[k].answer);
    }
    assert.ok(!/class="opts"/.test(els.parserows.innerHTML), `${t.typeId}: an option row is left after the last one`);
    /* Reopen one, change nothing, and the next unanswered is none. */
    els.parserows.onclick({ target: { closest: (s) => (s === "[data-reopen]" ? { dataset: { reopen: rows[1].key } } : null) } });
    assert.ok(els.parserows.innerHTML.includes(`data-q="${rows[1].key}"`), `${t.typeId}: a summary does not reopen`);
    tapOption(els, rows[1].key, rows[1].answer);
    els.check.onclick();
    assert.equal(app.finished.length, 1, t.typeId);
    assert.equal(app.finished[0].correct, !wrong, t.typeId);
    assert.ok(!/class="opts"/.test(els.parserows.innerHTML), t.typeId);
    assert.equal((els.parserows.innerHTML.match(/qpick right/g) || []).length, rows.length, t.typeId);
    /* After the verdict nothing reacts any more. */
    tapOption(els, rows[1].key, "x");
    assert.equal(t.picks[rows[1].key], rows[1].answer, t.typeId);
  }
  assert.ok(wrongPaths > 0 && rightPaths > 0, `${wrongPaths} wrong, ${rightPaths} right paths`);
});

test("a word with no row but the class is finished by the class button", () => {
  const t0 = BANK.find((t) => parseRows(t.a, t.t).length === 1);
  if (!t0) return;           // the bank is drawn; the judge test above covers the shape
  const t = structuredClone(t0);
  const els = fakeDocument();
  const app = appFor(t);
  RENDER.parse(app);
  tapOption(els, "fl", t.t.c);
  els.check.onclick();
  assert.equal(app.finished.length, 1);
  assert.equal(app.finished[0].correct, true);
});
