/* v6.9: the production questions (Villuveiðar, Setningasmiðja, Umritun), the
   time-phrase fix, the dictionary-sense fix and celebrations that follow
   success. Every one of these runs against the real data. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, newSession } from "../src/js/core/state.js";
import { SKILL_IDS } from "../src/js/core/skills.js";
import { normalise, judge } from "../src/js/core/grading.js";
import { readMark } from "../src/js/core/marks.js";
import { BADGES, celebrate } from "../src/js/core/badges.js";
import { TASKS } from "../src/js/tasks/index.js";
import { taskGovern } from "../src/js/tasks/fallstjorn.js";
import { headsTimePhrase } from "../src/js/tasks/shared.js";
import { ask, show } from "./helpers.js";
import { explainSlot } from "../src/js/tasks/explain.js";
import { TRANSFORMS, workshop, errorHunt, errorCandidates, confirmed, joinTokens, taskHunt, taskWorkshop,
         taskTransform } from "../src/js/tasks/malbeiting.js";
import { gradeWorkshop, gradeHunt, gradeTransform } from "../src/js/core/answer.js";

const lex = buildLexicon(DATA);
const ctxWith = () => {
  const S = blankState();
  SKILL_IDS.forEach((id) => { S.enabled[id] = true; });
  return { lex, S, sess: newSession(S), forcedNoun: null };
};
/* Every form any word in the vocabulary has. */
const ALL_FORMS = new Set();
lex.all.forEach((w) => Object.values(w.forms).forEach((fs) => fs.forEach((f) => ALL_FORMS.add(normalise(f)))));
const KNOWN = (w) => ALL_FORMS.has(normalise(w)) || ["í gær", "á morgun"].includes(normalise(w));

/* ---------- Umritun ---------- */

test("every rewrite of every sentence is made only of BÍN forms, and grades as right", () => {
  for (const [kind, spec] of Object.entries(TRANSFORMS)) {
    let n = 0;
    for (const s of lex.sentences) {
      const r = spec.build(lex, s);
      if (!r) continue;
      n++;
      assert.ok(r.answers.length > 0, `${kind}: no answer for "${s.t}"`);
      for (const a of r.answers) {
        assert.ok(!a.includes("undefined"), `${kind}: "${a}"`);
        /* For `active` and `join` the bank sentence is the answer; what must
           differ is what the pupil was shown. */
        assert.notEqual(normalise(a), normalise(r.from || s.t), `${kind}: the rewrite of "${s.t}" is what was shown`);
        assert.equal(judge(a, r.answers), "correct");
        /* Every word is a word: either it stood in the sentence or BÍN has it. */
        const orig = new Set(normalise(s.t).split(" "));
        for (const w of normalise(a).split(" ")) {
          assert.ok(orig.has(w) || KNOWN(w) || ["af", "í", "gær", "á", "morgun"].includes(w),
            `${kind}: "${w}" in "${a}" is neither in "${s.t}" nor in BÍN`);
        }
      }
      assert.equal(gradeTransform(r.from || s.t, r), "wrong", `${kind}: copying "${r.from || s.t}" must not pass`);
      assert.equal(gradeTransform(r.answers[0], r), "correct");
    }
    /* How many sentences each kind can use (v6.13: counted, and every one
       of the new kinds read by hand). */
    const least = { passive: 20, active: 10, join: 20, indirect: 80 }[kind] ?? 150;
    assert.ok(n >= least, `${kind}: only ${n} sentences`);
  }
});

test("the past tense changes the finite verbs and nothing else", () => {
  for (const s of lex.sentences) {
    const r = TRANSFORMS.past.build(lex, s);
    if (!r) continue;
    /* Put the changed verbs back: the sentence must come out unchanged. */
    const back = joinTokens(s.tok.map((t, j) => {
      const ch = r.changes.find((c) => c.i === j);
      if (ch) {
        assert.equal(t.c, "sagnorð", `"${t.w}" changed in "${s.t}"`);
        assert.match(t.m, /-NT-/);
        return t.w;
      }
      return t.w;
    }));
    assert.equal(back, s.t);
    const fwd = joinTokens(s.tok.map((t, j) => {
      const ch = r.changes.find((c) => c.i === j);
      return ch ? ch.to : t.w;
    }));
    assert.equal(normalise(fwd), normalise(r.answers[0]), s.t);
  }
});

test("known rewrites come out as a person would write them", () => {
  const find = (t) => lex.sentences.find((s) => s.t === t);
  const one = (kind, t) => TRANSFORMS[kind].build(lex, find(t));
  assert.ok(one("past", "Strákurinn hlær hátt.").answers.includes("Strákurinn hló hátt."));
  assert.ok(one("plural", "Hönd mín er köld.").answers.includes("Hendur mínar eru kaldar."));
  assert.ok(one("plural", "Litli strákurinn hljóp.").answers.includes("Litlu strákarnir hlupu."));
  const p = one("passive", "Amma bakaði köku handa tveimur strákum í dag.");
  assert.ok(p.answers.includes("Kaka var bökuð handa tveimur strákum í dag."));
  assert.ok(p.answers.includes("Kaka var bökuð af ömmu handa tveimur strákum í dag."));
  const adv = one("passive", "Þú lest bókina alltaf á kvöldin.");
  assert.ok(adv.answers.includes("Bókin er alltaf lesin á kvöldin."));
  assert.ok(one("igaer", "Litla barnið sefur.").answers.includes("Í gær svaf litla barnið."));
  /* Idioms and states are not rewritten. */
  assert.equal(one("passive", "Hugmyndirnar skipta máli."), null, "Máli er skipt");
  assert.equal(one("plural", "Mamma les blaðið núna."), null, "Mömmur lesa blaðið");
  assert.equal(one("igaer", "Þetta er saga bæjanna."), null);
});

test("the passive participle agrees with the new subject", () => {
  for (const s of lex.sentences) {
    const r = TRANSFORMS.passive.build(lex, s);
    if (!r) continue;
    const m = r.marks[0].m;
    const v = s.tok.find((t) => t.c === "sagnorð");
    if (v.g[0] === "þgf") assert.equal(m, "LHÞT-SB-HK-NFET", s.t);
    else {
      const obj = s.tok.find((t) => t.r === "andlag" && t.c === "nafnorð");
      const e = confirmed(lex, obj);
      assert.equal(m, `LHÞT-SB-${e.c.toUpperCase()}-NFET`, s.t);
    }
  }
});

/* ---------- Setningasmiðja ---------- */

test("every workshop sentence can be rebuilt from its cards, and the bare cards fail", () => {
  let n = 0;
  for (const s of lex.sentences) {
    const w = workshop(lex, s);
    if (!w) continue;
    n++;
    const g = gradeWorkshop(w.cards, s.t);
    assert.ok(g.ok && g.inOrder, `the sentence itself fails its own cards: ${s.t}`);
    const bare = w.cards.map((c) => c.text).join(" ");
    assert.equal(gradeWorkshop(w.cards, bare).ok, false, `uninflected cards pass: ${bare}`);
    /* A card is a word or a fixed phrase, and the tags only say what the
       sentence cannot: tense, number, the article, degree, mood. */
    for (const c of w.cards) {
      for (const tag of c.tags) assert.ok(["ft.", "með greini", "nútíð", "þátíð", "viðtengingarháttur",
        "miðstig", "efsta stig"].includes(tag), tag);
      assert.ok(!(c.fixed && c.c === "forsetning" && TWO_CASE_PREP.has(normalise(c.text))),
        `${s.t}: two-case preposition`);
    }
  }
  assert.ok(n >= 150, `only ${n} workshop sentences`);
});
const TWO_CASE_PREP = new Set(["í", "á", "eftir", "fyrir", "með", "undir", "yfir"]);

test("the workshop grades word by word and does not mind the order", () => {
  const s = lex.sentences.find((x) => x.t === "Gamla konan les bók.");
  const w = workshop(lex, s);
  assert.ok(w, "no cards");
  assert.deepEqual(w.cards.map((c) => c.text), ["gamall", "kona", "lesa", "bók"]);
  const g = gradeWorkshop(w.cards, "gamla konan lesa bók");
  assert.equal(g.ok, false);
  assert.deepEqual(g.per.map((p) => p.ok), [true, true, false, true]);
  const swapped = gradeWorkshop(w.cards, "Bók les gamla konan.");
  assert.equal(swapped.ok, true);
  assert.equal(swapped.inOrder, false);
});

/* ---------- Villuveiðar ---------- */

test("every error is a real form, wrong in its place, and not a form of the right cell", () => {
  const rnd = (() => { let x = 11; return () => ((x = (x * 16807) % 2147483647) / 2147483647); })();
  let n = 0;
  for (const s of lex.sentences) {
    for (const c of errorCandidates(lex, s, rnd)) {
      n++;
      const t = s.tok[c.i];
      const e = confirmed(lex, t);
      assert.ok(e, s.t);
      assert.notEqual(normalise(c.wrong), normalise(t.w), `${s.t}: the error is the right form`);
      assert.ok((e.forms[c.wrongMark] || []).includes(c.wrong), `${c.wrong} is not ${c.wrongMark}`);
      assert.ok(!(e.forms[t.m] || []).map(normalise).includes(normalise(c.wrong)));
      assert.ok(c.why && c.why.length > 10);
      /* Never a case error after a two-case preposition: "með hundinn" can be right. */
      if (c.kind === "fall") {
        const prev = s.tok.slice(0, c.i).reverse().find((x) => x.c === "forsetning");
        if (prev && s.tok.indexOf(prev) === c.i - 1) assert.ok(!TWO_CASE_PREP.has(normalise(prev.w)), s.t);
      }
    }
  }
  assert.ok(n >= 500, `only ${n} candidate errors`);
});

test("a hunt is two sentences with one error each at most, and grades fixes, misses and false alarms", () => {
  const rnd = (() => { let x = 5; return () => ((x = (x * 16807) % 2147483647) / 2147483647); })();
  for (let k = 0; k < 60; k++) {
    const h = errorHunt(lex, lex.sentences.filter((s) => s.lvl <= 3), rnd, { count: 1 + (k % 2) });
    assert.ok(h, "no hunt");
    assert.equal(h.lines.length, 2, "v6.10: always two sentences");
    assert.equal(h.errors, 1 + (k % 2));
    assert.ok(!("frame" in h) && !h.headline, "no chat, news or game frame");
    h.lines.forEach((ln) => assert.ok(ln.toks.filter((t) => t.err).length <= 1, "two errors in one sentence"));
    const fix = {}, none = {};
    h.lines.forEach((ln, li) => ln.toks.forEach((tk, ti) => { if (tk.err) fix[`${li}:${ti}`] = tk.err.answers[0]; }));
    assert.equal(gradeHunt(h, fix).ok, true);
    assert.equal(gradeHunt(h, none).missed.length, h.errors);
    /* Changing a correct word is a false alarm; "changing" it to itself is not. */
    const li = 0, ti = h.lines[0].toks.findIndex((t) => !t.err && !t.punct &&
      !h.lines.some((l) => l.toks.some((x) => x.err && x.err.alt && x.err.alt.key === `0:${h.lines[0].toks.indexOf(t)}`)));
    const same = { ...fix, [`${li}:${ti}`]: h.lines[0].toks[ti].w };
    assert.equal(gradeHunt(h, same).ok, true);
    const alarm = { ...fix, [`${li}:${ti}`]: "xyz" };
    assert.equal(gradeHunt(h, alarm).ok, false);
    assert.equal(gradeHunt(h, alarm).falseAlarm.length, 1);
  }
});

test("v6.10: *vera* is no longer most of the verb errors", () => {
  const rnd = (() => { let x = 11; return () => ((x = (x * 16807) % 2147483647) / 2147483647); })();
  let verbs = 0, vera = 0;
  for (let k = 0; k < 300; k++) {
    const h = errorHunt(lex, lex.sentences.filter((s) => s.lvl <= 4), rnd, { count: 2 });
    if (!h) continue;
    h.lines.forEach((ln) => ln.toks.forEach((tk) => {
      if (!tk.err || tk.err.kind !== "sögn") return;
      verbs++;
      if (tk.err.word === "vera|so") vera++;
    }));
    assert.ok(h.lines.flatMap((l) => l.toks).filter((t) => t.err && t.err.kind === "sögn").length <= 1,
      "at most one verb error in a hunt");
  }
  assert.ok(verbs > 20, `only ${verbs} verb errors`);
  assert.ok(vera / verbs < 0.3, `${vera} of ${verbs} verb errors are *vera*`);
});

test("v6.10: an agreement error may be mended at either end, when one word does it", () => {
  const rnd = (() => { let x = 3; return () => ((x = (x * 16807) % 2147483647) / 2147483647); })();
  let alts = 0;
  for (const s of lex.sentences) {
    for (const c of errorCandidates(lex, s, rnd)) {
      if (!c.alt) continue;
      alts++;
      assert.ok(["sögn", "samræmi"].includes(c.kind), "only agreement errors have another end");
      assert.ok(c.alt.i !== c.i && c.alt.answers.length, s.t);
      assert.ok(c.altWhy, "the other fix is explained");
      /* The other end has nothing else agreeing with it. */
      const a = s.tok[c.alt.i - 1], b = s.tok[c.alt.i + 1];
      for (const x of [a, b]) {
        if (!x || x === s.tok[c.i]) continue;
        assert.ok(!["lýsingarorð", "fornafn", "greinir", "töluorð"].includes(x.c) && !x.rj,
          `${s.t}: ${s.tok[c.alt.i].w} has ${x.w} beside it`);
      }
    }
  }
  assert.ok(alts >= 30, `only ${alts} errors with a second fix`);
  /* Graded: the other end mended is fixed, and is not a false alarm. */
  for (let k = 0; k < 400; k++) {
    const h = errorHunt(lex, lex.sentences.filter((s) => s.lvl <= 4), rnd, { count: 1 });
    const errTok = h && h.lines.flatMap((l, li) => l.toks.map((t, ti) => ({ t, key: `${li}:${ti}` })))
      .find((x) => x.t.err && x.t.err.alt);
    if (!errTok) continue;
    const a = errTok.t.err.alt;
    const g = gradeHunt(h, { [a.key]: a.answers[0] });
    assert.equal(g.ok, true, "mended at the other end");
    assert.deepEqual(g.viaAlt, [errTok.key]);
    assert.equal(g.falseAlarm.length, 0);
    /* Both ends changed: the error is fixed, the other end is now wrong. */
    const both = gradeHunt(h, { [a.key]: a.answers[0], [errTok.key]: errTok.t.err.answers[0] });
    assert.equal(both.ok, false);
    return;
  }
  assert.fail("no hunt with a two-way error in 400 tries");
});

/* ---------- in the mix ---------- */

test("the production questions come out of nextTask, intact, and under their own skill", () => {
  const ctx = ctxWith();
  const seen = {};
  /* 5000 draws, not 2500: every new type takes a little of the mix, and by
     #32 villur was about 41 in 2500 (124 in 7500) — on the old bound of 40. */
  for (let i = 0; i < 5000; i++) {
    const t = ask(ctx);
    seen[t.typeId] = (seen[t.typeId] || 0) + 1;
    if (["villur", "smidja", "umritun"].includes(t.typeId)) {
      assert.equal(t.skill, "malbeiting");
      assert.ok(t.base > 0 && t.lvl >= 1);
    }
  }
  for (const id of ["villur", "smidja", "umritun"]) assert.ok(seen[id] > 60, `${id}: ${seen[id]}`);
  /* "More production, less recognition": the three together beat the
     analysis question. */
  assert.ok(seen.villur + seen.smidja + seen.umritun > seen.parse, JSON.stringify(seen));
});

test("a switched-off production type never appears", () => {
  const ctx = ctxWith();
  ctx.S.chosen = { types: { villur: false } };
  ctx.S.allowed = { types: { villur: false } };
  for (let i = 0; i < 600; i++) assert.notEqual(ask(ctx).typeId, "villur");
});

/* ---------- time phrases ---------- */

test("a preposition that heads a time phrase is never a fallstjórn question", () => {
  const s = lex.sentences.find((x) => x.t === "Sólin skín í dag.");
  assert.equal(headsTimePhrase(lex, s, 2), true);
  const ctx = ctxWith();
  for (let i = 0; i < 3000; i++) {
    const t = show(ctx, taskGovern);
    if (!t || t.t.c !== "forsetning") continue;
    assert.equal(headsTimePhrase(lex, t.s, t.i), false, `${t.s.t}: ${t.t.w}`);
  }
  /* *í síðustu viku* is a time phrase too, in the dative; *í tímanum* (the
     lesson) is a place. */
  const viku = lex.sentences.find((x) => /í síðustu viku/.test(x.t));
  if (viku) assert.equal(headsTimePhrase(lex, viku, viku.tok.findIndex((t) => t.w === "í" && viku.tok[viku.tok.indexOf(t) + 1].w === "síðustu")), true);
});

test("a time phrase in a cloze gets its own explanation, never the motion rule", () => {
  const s = lex.sentences.find((x) => x.t === "Ég keypti brauð í dag.");
  const i = s.tok.findIndex((t) => t.w === "dag");
  const why = explainSlot(s, i, { time: true });
  assert.match(why, /tímaliður/);
  assert.match(why, /á aðeins við um stað/);
  assert.doesNotMatch(explainSlot(s, i, { time: true }), /stýrir hér/);
});

/* ---------- dictionary sense ---------- */

test("a word's meaning is its own sense, not a phrase it appears in", () => {
  const def = (o) => (lex.all.find((w) => w.o === o && ["kk", "kvk", "hk"].includes(w.c)) || {}).d;
  assert.doesNotMatch(def("dagur"), /virkur dagur/);
  assert.doesNotMatch(def("strákur"), /sitja á strák/);
  assert.doesNotMatch(def("mamma"), /elsku mamma/);
  assert.doesNotMatch(def("bíó"), /algert/);
});

/* ---------- celebrations ---------- */

test("a badge earned on a wrong answer waits for the next right one", () => {
  const a = BADGES[0], b = BADGES[1];
  let st = celebrate([], [a], false);
  assert.deepEqual(st.show, []);
  assert.deepEqual(st.held.map((x) => x.id), [a.id]);
  st = celebrate(st.held, [b], false);
  assert.deepEqual(st.show, []);
  assert.equal(st.held.length, 2);
  st = celebrate(st.held, [a], true);
  assert.deepEqual(st.show.map((x) => x.id), [a.id, b.id], "shown once each, in the order earned");
  assert.deepEqual(st.held, []);
  /* A question with no wrong answer (the meaning question) may celebrate. */
  assert.deepEqual(celebrate([a], [], null).show.map((x) => x.id), [a.id]);
});

test("v6.10 Setningasmiðja: a missing accent is a slip, a wrong form is 'rangt beygt', not extra", async () => {
  const { gradeWorkshop } = await import("../src/js/core/answer.js");
  const cards = [
    { text: "ég", answers: ["ég"], e: { forms: { NFET: ["ég"], ÞFET: ["mig"] } } },
    { text: "muna", answers: ["man"], e: { forms: { "GM-NH": ["muna"], "GM-FH-NT-1P-ET": ["man"], "GM-FH-NT-1P-FT": ["munum"] } } },
    { text: "dagur", answers: ["dagana"], e: { forms: { NFET: ["dagur"], ÞFFTgr: ["dagana"], ÞFFT: ["daga"] } } },
    { text: "vel", answers: ["vel"], fixed: true },
  ];
  const g = gradeWorkshop(cards, "Eg man daga vel.");
  assert.equal(g.per[0].ok, true);
  assert.equal(g.per[0].slip, true);
  assert.equal(g.per[2].ok, false);
  assert.equal(g.per[2].misformed, true);
  assert.equal(g.per[2].typed, "daga");
  assert.deepEqual(g.extra, [], "nothing typed is called a word that did not belong");
});
