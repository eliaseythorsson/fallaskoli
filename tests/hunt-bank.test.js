/* Villuveiðar: the hand-written bank of real errors (v6.13, critique item 26).

   Until now every error in an error hunt was generated: a case, a verb ending
   or an adjective broken at random, and much of it nothing a native speaker
   says (*Stelpan hlaupa mjög hratt*, *Ég borðum epli*). The bank
   (exercises.py HUNT → EX.hunt) is the slips Icelandic teenagers do make —
   *mér langar*, *ég vill*, *til drottningu*, *tvær buxur*, *læknirar* — each
   one sentence with one error, its correction out of BÍN and an explanation.

   What is held here: the bank itself (size, one error and one correction per
   item, the correction against BÍN), where it is served (þyngd 3 and up; the
   generator below that and for a second-language profile), and that a missed
   item is filed under the error pattern it names. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DATA } from "../data/data_bundle.js";
import { EX } from "../data/exercises.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, newSession } from "../src/js/core/state.js";
import { SKILL_IDS } from "../src/js/core/skills.js";
import { createPolicy } from "../src/js/core/policy.js";
import { normalise } from "../src/js/core/grading.js";
import { seeded } from "../src/js/core/duel.js";
import { PATTERNS, BANK_PATTERNS, bankTag, patternById, tagsOf, chancesIn, diagnose,
  huntPreferFor, focusTypes } from "../src/js/core/diagnosis.js";
import { taskHunt, bankHunt, bankPool, huntSource, secondLanguage, BANK_FROM_BAND,
  joinTokens, TYPES } from "../src/js/tasks/malbeiting.js";
import { makeView, applyEffects } from "../src/js/tasks/index.js";

/* Grading lives in tasks/production.js until core/answer.js takes it over
   (critique item 69); this file works on either side of that move. */
const { gradeHunt } = await import("../src/js/core/answer.js")
  .catch(() => import("../src/js/tasks/production.js"));

const lex = buildLexicon(DATA);
const BANK = EX.hunt;
const allOn = {};
SKILL_IDS.forEach((id) => { allOn[id] = true; });
const policyWith = (attrs = {}) =>
  createPolicy(null, { skills: allOn, types: {}, levels: {}, attrs, safeVocab: null });
const OPEN = policyWith();

/** A pupil's context with Málbeiting at `band`. */
function ctxAt(band, { policy = OPEN, settings = null } = {}) {
  const S = blankState();
  if (settings) Object.assign(S.settings, settings);
  const sess = newSession(S);
  Object.keys(sess.diff).forEach((k) => { sess.diff[k] = band; });
  return { S, sess, policy };
}
const view = (c, extra = {}) => makeView({ S: c.S, sess: c.sess, policy: c.policy, today: "2026-01-15", ...extra });
/** Build a hunt and show it, as the app does: the effects are applied. */
function hunt(c, rng, extra = {}) {
  const b = taskHunt(lex, view(c, extra), rng);
  if (!b) return null;
  applyEffects(c, b.effects);
  return b.task;
}
const errs = (t) => t.hunt.lines.flatMap((l) => l.toks.filter((x) => x.err));
const fromBank = (t) => errs(t).every((x) => Array.isArray(x.err.patterns));
const lineText = (l) => joinTokens(l.toks.map((x) => x.w));
const keyOfErr = (t, li) => `${li}:${t.hunt.lines[li].toks.findIndex((x) => x.err)}`;

/* ---------------------------------------------------------------- the bank */

test("the bank holds at least 80 items, and enough at every þyngd it is served at", () => {
  assert.ok(BANK.length >= 80, `${BANK.length} items`);
  const upTo = (b) => BANK.filter((x) => x.b <= b).length;
  assert.ok(upTo(3) >= 20, `only ${upTo(3)} items at þyngd 3`);
  assert.ok(upTo(4) >= 60, `only ${upTo(4)} items at þyngd 4`);
  assert.equal(upTo(5), BANK.length, "an item above þyngd 5 is never served");
  BANK.forEach((x) => assert.ok([3, 4, 5].includes(x.b), `${x.t}: þyngd ${x.b}`));
  assert.equal(new Set(BANK.map((x) => x.t)).size, BANK.length, "a sentence twice");
});

test("every item is one sentence with exactly one error and one correction", () => {
  for (const x of BANK) {
    /* the corrected sentence is the tokens, and ends as a sentence does */
    assert.equal(joinTokens(x.toks), x.t, x.t);
    assert.match(x.t, /^[A-ZÁÐÉÍÓÚÝÞÆÖ].*[.?!]$/u, x.t);
    assert.ok(Number.isInteger(x.i) && x.i >= 0 && x.i < x.toks.length - 1, `${x.t}: no target`);
    /* one correction: the word(s) in the sentence, first among the answers */
    assert.ok(x.a.length >= 1, x.t);
    assert.equal(x.a[0], x.toks[x.i], `${x.t}: the first answer is not the word in the sentence`);
    assert.equal(new Set(x.a.map(normalise)).size, x.a.length, `${x.t}: an answer twice`);
    /* one error: what is shown differs from every right answer … */
    assert.ok(x.w && !x.a.some((a) => normalise(a) === normalise(x.w)), `${x.t}: '${x.w}' is a right answer`);
    /* … and from the sentence as a whole, capital and all */
    const shown = joinTokens(x.toks.map((w, k) => (k === x.i ? x.w : w)));
    assert.notEqual(shown, x.t);
    assert.equal(/^[A-ZÁÐÉÍÓÚÝÞÆÖ]/u.test(x.w), x.i === 0 || /^[A-ZÁÐÉÍÓÚÝÞÆÖ]/u.test(x.toks[x.i]),
      `${x.t}: '${x.w}' is capitalised wrongly for its place`);
    /* the unit that changes is one word, or two that stand together */
    assert.ok(x.w.split(" ").length <= 2 && x.toks[x.i].split(" ").length <= 2, x.t);
    assert.equal(x.l.length, x.toks[x.i].split(" ").length, `${x.t}: one BÍN entry per corrected word`);
  }
});

test("every item has an explanation a pupil can read, and names real error patterns", () => {
  const ids = new Set(PATTERNS.filter((p) => !p.meta).map((p) => p.id));
  for (const x of BANK) {
    assert.ok(x.why.length >= 30 && x.why.length <= 420, `${x.t}: explanation of ${x.why.length} characters`);
    assert.equal((x.why.match(/\*/g) || []).length % 2, 0, `${x.t}: an unclosed * in the explanation`);
    assert.match(x.why, /[.!]$|\*$/u, `${x.t}: the explanation does not end as a sentence`);
    /* the explanation shows the right form — the pupil must be able to find it there */
    const right = x.toks[x.i].toLowerCase().split(" ");
    assert.ok(right.some((w) => x.why.toLowerCase().includes(w)), `${x.t}: the explanation never shows '${x.toks[x.i]}'`);
    x.p.forEach((id) => assert.ok(ids.has(id), `${x.t}: no error pattern '${id}'`));
    assert.equal(new Set(x.p).size, x.p.length, x.t);
  }
  /* most of the bank is filed; the few that are not are few */
  assert.ok(BANK.filter((x) => !x.p.length).length <= 8);
});

test("a matter of the written norm is called that, not an error", () => {
  /* The new passive, *hvor annar* and *sem að* are judged by the norm of
     careful writing; many good speakers say them. The explanation says
     "í vönduðu máli" and never calls the other form wrong. */
  const norm = BANK.filter((x) => x.p.includes("tholmynd") || / að$/.test(x.w) ||
    (x.p.includes("hvor") && /hvor/i.test(x.toks[x.i]) && !/^hvorug/i.test(x.toks[x.i])));
  assert.ok(norm.length >= 12, `${norm.length}`);
  for (const x of norm) {
    assert.match(x.why, /vönduðu (rit)?máli/, `${x.t}: ${x.why}`);
    assert.doesNotMatch(x.why, /\brangt\b|\bvilla\b|\bvitlaust\b/i, `${x.t}: ${x.why}`);
  }
});

test("the errors the critique asked for are all in the bank", () => {
  const has = (wrong, right) => BANK.some((x) => normalise(x.w) === wrong && x.a.map(normalise).includes(right));
  for (const [wrong, right] of [["mér", "mig"], ["mér hlakkar", "ég hlakka"], ["henni", "hún"], ["vill", "vil"],
    ["drottningu", "drottningar"], ["aukningu", "aukningar"], ["sé", "er"], ["við hvorn", "hvor við"],
    ["tvær", "tvennar"], ["læknirar", "læknar"], ["hvorugt", "hvorugur"], ["af", "að"], ["að", "af"],
    ["skammað hana", "hún skömmuð"], ["sem að", "sem"]])
    assert.ok(has(wrong, right), `${wrong} → ${right} is missing`);
  /* *mér langar*, *mér vantar*: the verb is in the sentence */
  for (const verb of ["langar", "vantar"])
    assert.ok(BANK.some((x) => x.w === "Mér" && x.toks.includes(verb)), `Mér ${verb}`);
});

/* ---------------------------------------------------------------- BÍN */

test("BÍN: every corrected form in the bundled lexicon is the form the lexicon has", () => {
  /* The build (build_exercises.py) checks every item against the whole of
     BÍN and refuses the bank otherwise — the next test. This one reads the
     result against the lexicon the app ships, for every correction whose
     word is in it. */
  let checked = 0;
  for (const x of BANK) {
    const words = x.toks[x.i].split(" ");
    x.l.forEach(([lemma, cls, mark], k) => {
      const e = mark ? lex.lookup(lemma, cls) : null;
      if (!e || !e.forms[mark]) return;
      assert.ok(e.forms[mark].map(normalise).includes(normalise(words[k])),
        `${x.t}: '${words[k]}' is not ${mark} of ${lemma} (${e.forms[mark]})`);
      /* and the wrong form, when it is one word, is not that cell's form */
      if (words.length === 1)
        assert.ok(!e.forms[mark].map(normalise).includes(normalise(x.w)), `${x.t}: '${x.w}' is right`);
      checked++;
    });
    /* `ms` is what the curriculum gate reads: the marks of the corrected words */
    assert.deepEqual(x.ms, x.l.map((s) => s[2]).filter(Boolean), x.t);
  }
  assert.ok(checked >= 60, `only ${checked} corrections could be read against the lexicon`);
});

/* The build's own refusals, run for real when Python and BÍN are at hand
   (they are wherever ./build.sh runs). Each bad item below is one way a
   hand-written item can be wrong; the build must name every one. */
const root = fileURLToPath(new URL("..", import.meta.url));
const py = ["python3", "python"].find((p) =>
  spawnSync(p, ["-c", "import islenska, reynir"], { cwd: root }).status === 0);
test("BÍN: the build refuses a correction, a wrong form or a claim that BÍN does not bear out",
  { skip: py ? false : "Python with islenska and reynir is not installed" }, () => {
    const bad = `
import sys, runpy
import exercises as X
H = X.H
X.HUNT = [
    H(3, "[Mér] langar í nýjan síma.", "Mig", ("ég", "pfn", "ÞFET"), "x" * 40, "", op=("langa", "ÞF")),
    H(3, "Tveir [læknar] vinna hér.", "læknar", ("læknir", "kk", "NFFT"), "x" * 40),
    H(3, "Tveir [læknar] vinna þar.", "læknirar", ("læknir", "kk", "NFFT"), "x" * 40),
    H(3, "Tveir [læknar] vinna heima.", "*lækna", ("læknir", "kk", "NFFT"), "x" * 40),
    H(3, "Tveir [læknar] vinna úti.", "*læknirar", ("læknir", "kk", "NFET"), "x" * 40),
    H(3, "[Mér] finnst þetta gaman.", "Mig", ("ég", "pfn", "ÞGFET"), "x" * 40, "", op=("finna", "ÞF")),
    H(3, "Ég fór til [hennar] í gær.", "henni", ("hún", "pfn", "EFET"), "x" * 40, "", gov=("hjá", "ef")),
    H(3, "Ég sá [hestinn] flurbl í gær.", "hesturinn", ("hestur", "kk", "ÞFETgr"), "x" * 40),
    H(3, "Hestinn [sá] ég þeir gær í.", "sér", ("sjá", "so", "GM-FH-ÞT-1P-ET"), "x" * 40),
    H(3, "Engin hornklofi hér.", "x", ("ég", "pfn", "NFET"), "x" * 40),
]
sys.argv = ["build_exercises.py"]
runpy.run_path("build_exercises.py", run_name="__main__")
`;
    const r = spawnSync(py, ["-c", bad], { cwd: root, encoding: "utf8", env: { ...process.env, PYTHONHASHSEED: "0" } });
    assert.equal(r.status, 1, "the build accepted a bad bank:\n" + r.stdout + r.stderr);
    assert.match(r.stderr, /nothing written/);
    for (const want of [
      /'Mér' is not BÍN's ÞFET of 'ég'/,                              // the correction is not the form claimed
      /the wrong form 'læknar' is one of the right ones/,             // no error at all
      /'læknirar' is not a standard BÍN form — mark it with \*/,      // a non-word without its star
      /'\*lækna' is a standard BÍN form of 'læknir'/,                 // a star on a real form
      /'læknar' is not BÍN's NFET of 'læknir'/,                       // the wrong cell claimed
      /BÍN does not list 'finna' with a subject in ÞF/,               // a false claim about the verb
      /government\.py has 'hjá' governing/,                           // a false claim about government
      /'flurbl' is not a word BÍN knows/,                             // a word that is not a word
      /Hestinn \[sá\] ég þeir gær í\.: Greynir cannot parse/,         // not a sentence
      /Engin hornklofi hér\.: exactly one \[target\]/,                // nothing marked
    ]) assert.match(r.stderr, want);
  });

/* ---------------------------------------------------------------- routing */

test("þyngd 1–2 gets the generated hunt, þyngd 3 and up the bank", () => {
  assert.equal(BANK_FROM_BAND, 3);
  for (const band of [1, 2, 3, 4, 5, 6, 7]) {
    const want = band >= 3 ? "bank" : "generated";
    assert.equal(huntSource(view(ctxAt(band)), band), want);
    let n = 0;
    for (let seed = 0; seed < 25; seed++) {
      const t = hunt(ctxAt(band), seeded(500 + seed));
      if (!t) continue;
      n++;
      assert.equal(fromBank(t), want === "bank", `þyngd ${band}: ${t.hunt.lines.map(lineText).join(" / ")}`);
      assert.equal(t.hunt.source === "bank", want === "bank");
      assert.equal(t.type, "villur");
      /* the generator: one error below þyngd 3; the bank: one in each of two sentences */
      assert.equal(t.hunt.errors, want === "bank" ? 2 : 1);
      assert.equal(errs(t).length, t.hunt.errors);
      assert.equal(t.hunt.lines.length, 2);
      if (want === "bank") t.hunt.lines.forEach((l) => assert.equal(l.toks.filter((x) => x.err).length, 1));
    }
    assert.ok(n >= 20, `þyngd ${band}: only ${n} hunts in 25 tries`);
  }
});

test("the bank grows with the þyngd: 3, then 4, then 5, and nothing new above", () => {
  const size = (band) => bankPool(view(ctxAt(band)), band).length;
  assert.equal(size(3), BANK.filter((x) => x.b <= 3).length);
  assert.ok(size(3) < size(4) && size(4) < size(5));
  assert.equal(size(5), BANK.length);
  assert.equal(size(7), size(5));
  /* a pupil at þyngd 3 never meets an item written for 5 */
  const c = ctxAt(3);
  for (let seed = 0; seed < 60; seed++) {
    const t = hunt(c, seeded(seed));
    t.hunt.lines.forEach((l) => assert.ok(BANK.find((x) => x.t === l.s.t).b <= 3, l.s.t));
  }
  /* and the declaration in the catalogue says exactly this */
  assert.deepEqual(TYPES.find((t) => t.id === "villur").bands, [1, 2, 3, 4, 5]);
});

test("a second-language profile keeps the generated hunt at every þyngd (the hook for item 45)", () => {
  assert.equal(secondLanguage(view(ctxAt(5))), false);
  for (const band of [1, 3, 5, 7]) {
    const c = ctxAt(band, { settings: { secondLanguage: true } });
    assert.equal(secondLanguage(view(c)), true);
    assert.equal(huntSource(view(c), band), "generated");
    let n = 0;
    for (let seed = 0; seed < 20; seed++) {
      const t = hunt(c, seeded(900 + seed));
      if (!t) continue;
      n++;
      assert.equal(fromBank(t), false, `þyngd ${band}: a bank item for a second-language pupil`);
      /* generated errors are a cell of a word: a BÍN mark on each */
      errs(t).forEach((x) => assert.ok(x.err.m && x.err.wrongMark));
    }
    assert.ok(n >= 10, `þyngd ${band}: ${n}`);
  }
});

test("the curriculum gate: an item whose inflection is switched off is not asked", () => {
  const noVh = policyWith({ hattur: { VH: false } });
  /* (only if this policy really closes the subjunctive — the gate itself is core/policy.js) */
  assert.equal(noVh.mark("GM-VH-NT-3P-ET"), false);
  const pool = bankPool(view(ctxAt(5, { policy: noVh })), 5);
  assert.ok(pool.length >= 80);
  assert.ok(pool.length < BANK.length);
  pool.forEach((x) => x.ms.forEach((m) => assert.doesNotMatch(m, /-VH-/, x.t)));
  /* an item that is not an inflected form (að/af, en/enn) has no cell to
     switch off and stays; the rest of the gate is the question type itself */
  const bare = bankPool(view(ctxAt(5, { policy: { ...OPEN, mark: () => false } })), 5);
  assert.ok(bare.length >= 20 && bare.every((x) => !x.ms.length));
  /* fewer than two items to choose from: no hunt from the bank, never half a one */
  assert.equal(bankHunt(view(ctxAt(2)), seeded(1), { band: 2 }), null);
});

test("the two sentences are about different things, and none comes back while others wait", () => {
  const c = ctxAt(5);
  const seen = [];
  for (let k = 0; k < 20; k++) {
    const t = hunt(c, seeded(40 + k));
    const [a, b] = t.hunt.lines.map((l) => BANK.find((x) => x.t === l.s.t));
    assert.notEqual(a, b);
    assert.ok(!a.p.some((id) => b.p.includes(id)), `two of the same pattern: ${a.t} / ${b.t}`);
    assert.ok(!(a.w === b.w && a.a[0] === b.a[0]), `${a.w} twice`);
    seen.push(a.t, b.t);
  }
  /* 40 is what a session remembers (tasks/effects.js EX_SEEN_MAX) */
  assert.equal(new Set(seen).size, 40, "an item came back within twenty hunts");
});

test("a candidate that is built and thrown away uses nothing up", () => {
  const c = ctxAt(4);
  const before = JSON.stringify(c.sess.exSeen || []);
  const b = taskHunt(lex, view(c), seeded(3));
  assert.equal(JSON.stringify(c.sess.exSeen || []), before);
  assert.deepEqual(b.effects.map((e) => e.op), ["exSeen", "exSeen"]);
});

test("the error diagnosis can ask for a pattern, and the bank serves it first", () => {
  /* every pattern the bank knows hands the builder a kind it understands */
  for (const id of BANK_PATTERNS) {
    const [kind] = huntPreferFor([id]);
    assert.ok(kind, id);
    assert.ok(focusTypes([id]).has("villur"), `${id}: a session aimed at it never draws Villuveiðar`);
    for (let seed = 0; seed < 6; seed++) {
      /* a new session each time: within one, an item that has been asked
         gives way to those that have not, aimed at or not */
      const t = hunt(ctxAt(5), seeded(70 + seed), { huntPrefer: [kind] });
      const got = errs(t).flatMap((x) => x.err.patterns).map((p) => patternById(p).hunt);
      assert.ok(got.includes(kind), `${id} (${kind}) asked for, got ${errs(t).map((x) => x.w)}`);
    }
  }
  assert.deepEqual(huntPreferFor(["opersonuleg", "thf_thgf", "v2"]), ["bank:opersonuleg", "fall"]);
});

/* ---------------------------------------------------------------- grading and diagnosis */

test("mending both errors is right; the corrected text is the bank's sentence", () => {
  const c = ctxAt(5);
  for (let k = 0; k < 40; k++) {
    const t = hunt(c, seeded(200 + k));
    const edits = {};
    t.hunt.lines.forEach((l, li) => { edits[keyOfErr(t, li)] = l.toks.find((x) => x.err).err.answers[0]; });
    const g = gradeHunt(t.hunt, edits);
    assert.equal(g.ok, true, t.hunt.lines.map(lineText).join(" / "));
    assert.equal(g.fixed.length, 2);
    assert.deepEqual(diagnose(t, { kind: "hunt", g }), []);
    /* what the pupil reads afterwards: every token's `right` */
    t.hunt.lines.forEach((l) => assert.equal(joinTokens(l.toks.map((x) => x.right)), l.s.t));
    /* lower case, and every other answer the item allows, are as good */
    t.hunt.lines.forEach((l, li) => l.toks.find((x) => x.err).err.answers.forEach((a) => {
      const g2 = gradeHunt(t.hunt, { ...edits, [keyOfErr(t, li)]: a.toLowerCase() });
      assert.equal(g2.ok, true, a);
    }));
  }
});

test("two words that change places are mended in one box", () => {
  const x = BANK.find((y) => y.w === "við hvorn");
  const c = ctxAt(5);
  /* aim the diagnosis at it until it comes */
  let t = null;
  for (let seed = 0; seed < 200 && !t; seed++) {
    const h = bankHunt(view(c), seeded(seed), { band: 5, prefer: ["bank:hvor"] });
    if (h.items.includes(x)) t = { type: "villur", hunt: h.hunt };
  }
  assert.ok(t, "the item never came");
  const li = t.hunt.lines.findIndex((l) => l.s.t === x.t);
  const tok = t.hunt.lines[li].toks.find((y) => y.err);
  assert.equal(tok.w, "við hvorn");
  assert.deepEqual(tok.err.answers, ["hvor við"]);
  const other = 1 - li;
  const fixOther = { [keyOfErr(t, other)]: t.hunt.lines[other].toks.find((y) => y.err).err.answers[0] };
  assert.equal(gradeHunt(t.hunt, { ...fixOther, [keyOfErr(t, li)]: "hvor við" }).ok, true);
  const g = gradeHunt(t.hunt, { ...fixOther, [keyOfErr(t, li)]: "við hvor" });
  assert.equal(g.ok, false);
  assert.deepEqual(g.wrongFix, [keyOfErr(t, li)]);
  assert.deepEqual(diagnose(t, { kind: "hunt", g }).map((f) => f.p), ["hvor"]);
});

test("a missed error is filed under the patterns its item names — and no others get a chance", () => {
  const c = ctxAt(5);
  const filed = new Set();
  for (let k = 0; k < 67; k++) {
    const t = hunt(c, seeded(300 + k));
    const items = t.hunt.lines.map((l) => BANK.find((x) => x.t === l.s.t));
    /* what the question tests: its items' patterns, and leaving right words alone */
    const want = new Set([...items.flatMap((x) => x.p), "ofleidretting"]);
    assert.deepEqual(new Set(chancesIn(t)), want, items.map((x) => x.t).join(" / "));
    assert.deepEqual([...tagsOf(t)].sort(), ["hunt", ...new Set(items.flatMap((x) => x.p.map(bankTag)))].sort());
    /* nothing mended: every error is a finding under its own patterns */
    const g0 = gradeHunt(t.hunt, {});
    assert.equal(g0.ok, false);
    assert.deepEqual(new Set(diagnose(t, { kind: "hunt", g: g0 }).map((f) => f.p)), new Set(items.flatMap((x) => x.p)));
    /* the first mended, the second not: only the second is a finding */
    const g1 = gradeHunt(t.hunt, { [keyOfErr(t, 0)]: errs(t)[0].err.answers[0] });
    assert.deepEqual(diagnose(t, { kind: "hunt", g: g1 }).map((f) => f.p).sort(), [...items[1].p].sort());
    /* a right word changed is over-correcting, as in the generated hunt */
    const ti = t.hunt.lines[0].toks.findIndex((x) => !x.err && !x.punct);
    const g2 = gradeHunt(t.hunt, { [`0:${ti}`]: "xyz" });
    assert.ok(diagnose(t, { kind: "hunt", g: g2 }).some((f) => f.p === "ofleidretting"));
    items.forEach((x) => x.p.forEach((id) => filed.add(id)));
  }
  filed.forEach((id) => assert.ok(BANK_PATTERNS.includes(id), id));
  assert.ok(filed.size >= 15, `only ${filed.size} patterns in 67 hunts`);
});

test("the patterns of the bank: listed once, each with a tag of its own that the catalogue declares", () => {
  const used = new Set(BANK.flatMap((x) => x.p));
  assert.deepEqual([...used].sort(), [...BANK_PATTERNS].sort(), "BANK_PATTERNS (core/diagnosis.js) and the bank disagree");
  const declared = TYPES.find((t) => t.id === "villur").tags;
  for (const id of BANK_PATTERNS) {
    const p = patternById(id);
    assert.ok(p.tags.includes(bankTag(id)), id);
    assert.ok(declared.includes(bankTag(id)), `${id}: add ${bankTag(id)} to the tags of villur`);
    assert.ok(BANK.some((x) => x.p.includes(id)), `${id}: no item`);
    /* a tag of its own: no other pattern reads it */
    assert.equal(PATTERNS.filter((q) => q.tags.includes(bankTag(id))).length, 1);
  }
  /* the two patterns added for the bank are complete and have a page to read */
  for (const id of ["hvor", "ad_af"]) {
    const p = patternById(id);
    assert.ok(p.nm && p.rule && p.ok && p.lesson, id);
    assert.equal(p.hunt, bankTag(id));
    assert.deepEqual(p.types, ["villur"]);
  }
  /* the generator's kinds are untouched: a case pattern still asks for "fall" */
  assert.equal(patternById("ef").hunt, "fall");
  assert.equal(patternById("kyn_samraemi").hunt, "samræmi");
  assert.equal(patternById("sogn_frumlag").hunt, "sögn");
});
