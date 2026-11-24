/* Item 26: the structure hint on every Setningafræði question, fading with þyngd.

   Pinned here:
     1. the fading rule (core/hint.js `hintStep`) and that every type follows it;
     2. that the hint NEVER gives the answer away, checked per type over many
        built questions with this file's own reading of what each type asks —
        not with the rule the builders use;
     3. the XP: a hint the pupil asks for halves it, as every hint does; the
        structure shown from the start at a low þyngd does not;
     4. that the renderers draw it, and after the answer draw it whole. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, newSession } from "../src/js/core/state.js";
import { seeded } from "../src/js/core/duel.js";
import { judge } from "../src/js/core/answer.js";
import { makeView } from "../src/js/tasks/index.js";
import { BUILDERS } from "../src/js/tasks/setningafraedi.js";
import { CATALOGUE } from "../src/js/core/catalogue.js";
import { hintStep, HINT_FADE, hintMarks, planHint, SETNINGARHLUTAR } from "../src/js/core/hint.js";
import { sentenceStructure, hasMarks } from "../src/js/core/structure.js";
import { structureHTML } from "../src/js/ui/structure.js";

const lex = buildLexicon(DATA);
const PUNCT = /^[.,!?;:„“”"–—()]$/;
const BANDS = [1, 2, 3, 4, 5, 6, 7];
const N = 120;

const pupil = (band) => {
  const S = blankState();
  S.enabled.setningafraedi = true;
  const sess = newSession(S);
  sess.diff.setningafraedi = band;
  return { S, sess };
};
const viewAt = (band) => { const p = pupil(band); return makeView({ S: p.S, sess: p.sess, today: "2026-11-24" }); };
const built = new Map();
const tasksOf = (id, band) => {
  const k = id + "|" + band;
  if (!built.has(k)) {
    const v = viewAt(band), out = [];
    for (let i = 0; i < N; i++) { const b = BUILDERS[id].build(lex, v, seeded(i + 1)); if (b) out.push(b.task); }
    built.set(k, out);
  }
  return built.get(k);
};
const SETN_TYPES = CATALOGUE.filter((t) => t.skill === "setningafraedi").map((t) => t.id);

/* ---------- 1. the fading rule ------------------------------------------- */

test("26: the hint is shown at þyngd 1–2, offered at 3–5 and gone at 6–7", () => {
  assert.deepEqual(BANDS.map(hintStep), ["shown", "shown", "offered", "offered", "offered", null, null]);
  assert.deepEqual({ ...HINT_FADE }, { shownUpTo: 2, offeredUpTo: 5 });
  /* it only ever fades: never more help at a higher þyngd */
  const rank = { shown: 2, offered: 1, null: 0 };
  for (let b = 1; b < 7; b += 0.5) assert.ok(rank[hintStep(b)] >= rank[hintStep(b + 0.5)], `more help at ${b + 0.5} than at ${b}`);
  assert.equal(hintStep(undefined), "shown", "a skill with no þyngd yet starts at 1");
});

test("26: every Setningafræði type carries the hint, at the step its þyngd gives", () => {
  assert.ok(SETN_TYPES.length >= 5);
  for (const id of SETN_TYPES) {
    assert.ok(BUILDERS[id], "no builder: " + id);
    for (const band of BANDS) {
      const ts = tasksOf(id, band);
      assert.ok(ts.length, `${id} builds nothing at þyngd ${band}`);
      const coded = ts.filter((t) => t.coding);
      if (!hintStep(band)) { assert.equal(coded.length, 0, `${id} has a hint at þyngd ${band}`); continue; }
      for (const t of coded) assert.equal(t.coding.step, hintStep(band), `${id} at þyngd ${band}`);
    }
    /* each type can show it somewhere at the steps that have it */
    const some = [1, 2, 3, 4, 5].reduce((n, b) => n + tasksOf(id, b).filter((t) => t.coding).length, 0);
    assert.ok(some > 0, `${id} never carries the hint`);
  }
});

/* ---------- 2. never the answer ------------------------------------------ */

/* What each type asks, read from the task as this test reads it. */
const ASKED = {
  syntax: (t) => ({ kinds: [t.askRole], right: t.s.tok.map((x, j) => (x.r === t.askRole || (x.ra || []).includes(t.askRole) ? j : -1)).filter((j) => j >= 0) }),
  setn_hlut: (t) => ({ kinds: t.options, words: [t.i] }),
  setn_flokka: (t) => ({ kinds: t.buckets, words: t.items.map((x) => x.j) }),
  setn_lidir: (t) => ({ kinds: [...SETNINGARHLUTAR, "forsetningarliður"],
    words: t.s.tok.map((_, j) => j).filter((j) => j >= t.span.from && j <= t.span.to) }),
  lid_finna: (t) => ({ kinds: ["forsetningarliður"], right: t.targets }),
};

test("26: no hint marks what its question asks, marks the words it points at, or leaves only the answer open", () => {
  assert.deepEqual(Object.keys(ASKED).sort(), [...SETN_TYPES].sort(), "a Setningafræði type this test does not read");
  let checked = 0;
  for (const id of SETN_TYPES) for (const band of [1, 3, 5]) for (const t of tasksOf(id, band)) {
    if (!t.coding) continue;
    checked++;
    const st = hintMarks(t.s, t.coding);
    const a = ASKED[id](t);
    const where = `${id} „${t.s.t}“`;
    assert.ok(hasMarks(st), "a hint with nothing in it: " + where);
    for (const p of st.parts) assert.ok(!a.kinds.includes(p.role), `${where}: ${p.role} is marked`);
    const covered = (j) => st.parts.some((p) => j >= p.a && j <= p.b);
    for (const j of a.words || []) assert.ok(!covered(j), `${where}: the word asked about (${t.s.tok[j].w}) is marked`);
    if (a.right) {
      for (const j of a.right) assert.ok(!covered(j), `${where}: an answer word (${t.s.tok[j].w}) is marked as something else`);
      const open = t.s.tok.map((_, j) => j).filter((j) => !PUNCT.test(t.s.tok[j].w) && !covered(j));
      assert.ok(open.some((j) => !a.right.includes(j)), `${where}: only the answer is left unmarked`);
    }
    /* and in the HTML the pupil sees */
    const html = structureHTML(t.s, { structure: st });
    for (const k of a.kinds) assert.ok(!html.includes(`<span class="sc-name">${k}</span>`), `${where}: „${k}“ written`);
  }
  assert.ok(checked > 500, "too few hints checked: " + checked);
});

test("26: over the whole bank, the syntax hint never names or isolates the asked role", () => {
  let offered = 0, all = 0;
  for (const s of lex.sentences) for (const role of new Set(s.tok.map((t) => t.r).filter(Boolean))) {
    all++;
    const right = s.tok.map((x, j) => (x.r === role || (x.ra || []).includes(role) ? j : -1)).filter((j) => j >= 0);
    const c = planHint(s, { thyngd: 3, hide: [role], right });
    if (!c) continue;
    offered++;
    const st = hintMarks(s, c);
    assert.ok(c.hide.includes(role) && !st.parts.some((p) => p.role === role || right.some((j) => j >= p.a && j <= p.b)), s.t);
    assert.ok(s.tok.some((x, j) => !PUNCT.test(x.w) && !right.includes(j) && st.roleAt[j] == null), "only the answer open: " + s.t);
  }
  /* hiding more rather than nothing keeps the hint for nearly every question */
  assert.ok(offered / all > 0.9, `the syntax hint is left out too often: ${offered} of ${all}`);
});

test("26: where marking all else would leave only the answer, the hint marks less instead", () => {
  const s = lex.sentences.find((x) => x.t === "Á túninu stendur hestur.");
  assert.ok(s, "the bank no longer has the sentence");
  const right = s.tok.map((x, j) => (x.r === "frumlag" ? j : -1)).filter((j) => j >= 0);
  const c = planHint(s, { thyngd: 1, hide: ["frumlag"], right });
  assert.ok(c, "no hint at all");
  const marked = hintMarks(s, c).parts.map((p) => p.role);
  assert.ok(!marked.includes("umsögn") && marked.includes("forsetningarliður"), marked.join(", "));
});

test("26: after the answer the whole structure is drawn; the plan is the same for the same sentence", () => {
  const t = tasksOf("setn_hlut", 1).find((x) => x.coding);
  assert.ok(t);
  assert.deepEqual(hintMarks(t.s, t.coding, { after: true }), sentenceStructure(t.s));
  const again = BUILDERS.setn_hlut.build(lex, viewAt(1), seeded(1));
  const first = tasksOf("setn_hlut", 1)[0];
  assert.deepEqual(again.task.coding, first.coding, "a seed builds one hint");
});

/* ---------- 3. XP ------------------------------------------------------- */

test("26: asking for the hint halves the XP of every Setningafræði answer; the hint shown from the start does not", () => {
  const record = (j) => j.effects.find((e) => e.do === "record");
  const cases = [
    ["setn_hlut", (t) => ({ picked: t.answer })],
    ["setn_lidir", (t) => ({ picked: t.answer })],
    ["setn_flokka", (t) => ({ picks: Object.fromEntries(t.items.map((x, k) => [k, x.cls])) })],
    ["lid_finna", (t) => ({ sel: [...t.targets] })],
  ];
  for (const [id, answer] of cases) {
    const t = tasksOf(id, 3).find((x) => x.coding && x.coding.step === "offered");
    assert.ok(t, "no offered hint on " + id);
    const plain = judge(t, answer(t), pupil(3));
    const hinted = judge(t, { ...answer(t), hinted: true }, pupil(3));
    assert.equal(plain.ok, true, id);
    assert.equal(hinted.ok, true, id);
    assert.ok(hinted.xp < plain.xp && Math.abs(hinted.xp - plain.xp / 2) <= 1, `${id}: XP ${plain.xp} → ${hinted.xp}`);
    assert.equal(record(hinted).hinted, true, id);
    assert.ok(!("hinted" in record(plain)), id + ": an answer without the hint is recorded as before");
    assert.deepEqual(hinted.findings, [], id + ": a hint is not an error");
    /* shown from the start: the renderer sends no `hinted`, so the XP is whole */
    const low = tasksOf(id, 1).find((x) => x.coding && x.coding.step === "shown");
    if (low) assert.equal(record(judge(low, answer(low), pupil(1))).hinted, undefined, id);
  }
});

/* ---------- 4. the renderers -------------------------------------------- */

test("26: the shared renderers draw the hint where a task has one, and send `hinted` with the answer", () => {
  const SRC = readFileSync(new URL("../src/js/ui/render-more.js", import.meta.url), "utf8");
  const HINT = readFileSync(new URL("../src/js/ui/hint.js", import.meta.url), "utf8");
  for (const r of ["choice", "tap", "sort"]) {
    const fn = SRC.slice(SRC.indexOf(`RENDER.${r} = function`));
    const body = fn.slice(0, fn.indexOf("\n};\n"));
    assert.match(body, /hintButtonHTML\(t\)/, r + ": no button");
    assert.match(body, /shownNoteHTML\(t\)/, r + ": no note at the shown step");
    assert.match(body, /wireHint\(t,/, r + ": the button is not wired");
  }
  assert.equal((SRC.match(/\.\.\.\(t\.hinted \? \{ hinted: true \} : \{\}\)/g) || []).length, 3, "a judge is not told of the hint");
  assert.equal((SRC.match(/if \(codedOn\(t\)\) redrawSentence/g) || []).length, 3, "the whole structure is not drawn after the answer");
  /* the half-XP line is the one every hint in the program shows */
  assert.match(HINT, /Vísbending gefur helmingi minna XP — hún telst ekki sem villa\./);
  /* Setningafræði types are drawn by these renderers and syntax */
  for (const id of SETN_TYPES) assert.ok(["choice", "tap", "sort", "syntax"].includes(CATALOGUE.find((t) => t.id === id).renderer), id);
});
