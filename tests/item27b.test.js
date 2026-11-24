/* Item 27, second half: three question types the lessons taught and
   practice never asked.

     so_beyging    strong or weak verb by its past, exactly as Lesefni
                   teaches it, and the kennimyndir written (tasks/sagnord.js)
     so_mynd       germynd, miðmynd or þolmynd of a marked verb phrase in a
                   bank sentence, only where the analysis is certain
     so_bodhattur  the boðháttur written, singular and plural

   What is held here: every form shown or accepted is BÍN's, and every form
   BÍN lists is accepted; every answer is the lesson's rule worked out again
   here; each declared step of difficulty has at least 150 different
   questions and really asks something different; nothing uncertain is ever
   asked; the judge, the diagnosis and the review queue know all three; and
   the curriculum map counts the three nodes as covered. */

import test from "node:test";
import assert from "node:assert/strict";
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, newSession, wordKey } from "../src/js/core/state.js";
import { SKILL_IDS } from "../src/js/core/skills.js";
import { createPolicy, QUESTION_TYPES, presetPolicy } from "../src/js/core/policy.js";
import { seeded } from "../src/js/core/duel.js";
import { judge, settle } from "../src/js/core/answer.js";
import { chancesIn, patternById } from "../src/js/core/diagnosis.js";
import { nodeById, backlog } from "../src/js/core/curriculum.js";
import { lessonFor } from "../src/js/core/lessons.js";
import { LESSONS } from "../src/js/content/lessons.js";
import { typeById, makeView, reviewTask } from "../src/js/tasks/index.js";
import { soBeyging, soMynd, soBodhattur, verbKind, KENNIMYNDIR, MYNDIR, bodhatturBase }
  from "../src/js/tasks/sagnord.js";

const lex = buildLexicon(DATA);
const D0 = "2026-11-16";
const allOn = {};
SKILL_IDS.forEach((id) => { allOn[id] = true; });
const POLICY = createPolicy(null, { skills: allOn, types: {}, levels: {}, attrs: {}, safeVocab: null });

function pupil(band) {
  const S = blankState();
  SKILL_IDS.forEach((id) => { S.enabled[id] = true; });
  const sess = newSession(S);
  Object.keys(sess.diff).forEach((k) => { sess.diff[k] = band; });
  return { S, sess };
}
const viewAt = (band, extra = {}) => {
  const p = pupil(band);
  return makeView({ S: p.S, sess: p.sess, policy: POLICY, today: D0, ...extra });
};
const buildMany = (fn, band, n, extra = {}) => {
  const v = viewAt(band, extra);
  const out = [];
  for (let i = 0; i < n; i++) {
    const b = fn(lex, v, seeded(i + 1));
    if (b) out.push(b.task);
  }
  return out;
};
const ids = (j) => j.findings.map((f) => f.p);
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1]; };
const verb = (o) => lex.lookup(o, "so");

/* What makes two questions different. */
const sigSlots = (t) => JSON.stringify([t.v.o, t.show, t.slots.map((s) => s.m), t.answer]);
const sigMynd = (t) => JSON.stringify([t.s.t, t.marks, t.answer]);

const WEAK_PAST = /(aði|ði|di|ti)$/;

/* ========================================================================
 * so_beyging
 * ====================================================================== */

const SB = new Map(typeById("so_beyging").bands.map((b) => [b, buildMany(soBeyging, b, 1500)]));

test("so_beyging: the lesson's rule, BÍN's forms, and every form BÍN lists accepted", () => {
  for (const [band, tasks] of SB) {
    assert.equal(tasks.length, 1500, `þyngd ${band}: a build came back empty`);
    for (const t of tasks) {
      assert.equal(t.type, "slots");
      assert.deepEqual(t.options, ["sterk", "veik"]);
      /* The rule worked out again: the past with *ég* ends in -aði/-ði/-di/-ti
         → veik; otherwise sterk. */
      const pasts = t.v.forms["GM-FH-ÞT-1P-ET"];
      assert.equal(t.answer, pasts.every((f) => WEAK_PAST.test(f)) ? "veik" : "sterk", t.v.o);
      assert.ok(pasts.every((f) => WEAK_PAST.test(f)) || pasts.every((f) => !WEAK_PAST.test(f)), t.v.o);
      for (const sl of t.slots) assert.deepEqual(sl.accepted, t.v.forms[sl.m], `${t.v.o} ${sl.m}`);
      for (const x of t.show) assert.ok(KENNIMYNDIR.some((k) => t.v.forms[k.m].join(" / ") === x.f), x.f);
      assert.deepEqual(t.solution.map((x) => x.f), KENNIMYNDIR.map((k) => t.v.forms[k.m].join(" / ")));
      assert.ok(t.why.includes(`*í gær ${pasts[0]} ég*`), t.why);
      assert.match(t.why, t.answer === "sterk" ? /\*\*sterk\*\*.*fjórar/ : /\*\*veik\*\*.*þrjár/);
      assert.equal(lessonFor(t), "sterkar-veikar");
    }
  }
});

test("so_beyging: the núþálegar sagnir, the disputed and the third-person verbs are never asked", () => {
  for (const o of ["vita", "kunna", "mega", "eiga", "munu", "skulu", "þurfa", "muna", "unna",
                   "vera", "vilja", "valda", "snúa", "þvo"]) {
    const v = verb(o);
    if (v) assert.equal(verbKind(v), null, o);
  }
  assert.equal(verbKind(verb("koma")), "sterk");
  assert.equal(verbKind(verb("sjá")), "sterk");
  assert.equal(verbKind(verb("kaupa")), "veik");
  const asked = new Set([...SB.values()].flat().map((t) => t.v.o));
  for (const o of ["vita", "kunna", "mega", "vera", "vilja"]) assert.ok(!asked.has(o), o);
  for (const t of [...SB.values()].flat()) assert.ok(!t.v.t3, t.v.o);
});

test("so_beyging: at least 150 different questions at every step it declares", () => {
  for (const band of typeById("so_beyging").bands) {
    const n = new Set(SB.get(band).map(sigSlots)).size;
    assert.ok(n >= 150, `þyngd ${band}: ${n} different questions`);
  }
});

test("so_beyging: the steps really change the question", () => {
  /* 1: all four kennimyndir shown, nothing written, no *kaupa – keypti*. */
  for (const t of SB.get(1)) {
    assert.equal(t.show.length, 4);
    assert.equal(t.slots.length, 0);
    assert.ok(!t.tags.includes("sobeyg:hljod"), t.v.o);
  }
  /* 3: the infinitive; the pupil writes *í gær … ég*. A weak verb whose vowel
     changes about one time in three. */
  for (const t of SB.get(3)) {
    assert.deepEqual(t.show.map((x) => x.h), ["að"]);
    assert.deepEqual(t.slots.map((s) => [s.h, s.m, s.after]), [["í gær", "GM-FH-ÞT-1P-ET", "ég"]]);
  }
  const traps = SB.get(3).filter((t) => t.tags.includes("sobeyg:hljod"));
  assert.ok(traps.length > 300 && traps.length < 700, `${traps.length} of 1500`);
  for (const t of traps) {
    assert.equal(t.answer, "veik");
    assert.match(t.why, /endingin sem ræður/);
  }
  /* 5: the past singular and plural and the sagnbót; rarer verbs. */
  for (const t of SB.get(5)) assert.deepEqual(t.slots.map((s) => s.m), ["GM-FH-ÞT-1P-ET", "GM-FH-ÞT-1P-FT", "GM-SAGNB"]);
  /* The commonest quarter of the verbs at 1–2, three fifths at 3–4, all at
     5 and the rarer as often as the common. */
  const cap = (share) => Math.ceil(lex.verbs.length * share);
  assert.ok(SB.get(1).every((t) => t.v.r <= cap(0.25)), "a rare verb at þyngd 1");
  assert.ok(SB.get(3).every((t) => t.v.r <= cap(0.6)) && SB.get(3).some((t) => t.v.r > cap(0.25)));
  assert.ok(SB.get(5).some((t) => t.v.r > cap(0.6)));
  const rank = (band) => median(SB.get(band).map((t) => t.v.r));
  assert.ok(rank(5) > rank(3) * 1.3, `median rank ${rank(3)} → ${rank(5)}`);
  /* Strong and weak both common at every step: one answer every time must not pay. */
  for (const [band, tasks] of SB) {
    const s = tasks.filter((t) => t.answer === "sterk").length / tasks.length;
    assert.ok(s > 0.25 && s < 0.75, `þyngd ${band}: ${Math.round(s * 100)}% sterk`);
  }
});

test("so_beyging: right and wrong, the written kennimyndir, and what the diagnosis reads", () => {
  const t1 = SB.get(1)[0];
  assert.equal(judge(t1, { picked: t1.answer }).ok, true);
  const w1 = judge(t1, { picked: t1.answer === "sterk" ? "veik" : "sterk" });
  assert.equal(w1.ok, false);
  assert.deepEqual(ids(w1), ["beyging_so"]);
  assert.equal(judge(t1, {}).pending, true);

  /* *keypti* called strong because its vowel changed: the lesson's warning. */
  const trap = SB.get(3).find((t) => t.tags.includes("sobeyg:hljod"));
  const past = trap.slots[0].accepted[0];
  assert.deepEqual(ids(judge(trap, { picked: "sterk", texts: [past] })), ["beyging_so", "beyging_so_hljod"]);
  assert.ok(chancesIn(trap).includes("beyging_so_hljod"));
  /* Said as the lesson says it: "í gær keypti ég". */
  assert.equal(judge(trap, { picked: "veik", texts: [`í gær ${past} ég`] }).ok, true);
  assert.equal(judge(trap, { picked: "veik", texts: [""] }).pending, true);
  assert.equal(judge(trap, { texts: [past] }).pending, true);

  /* A strong verb's past written weak is the known pattern, and both parts
     must be right. */
  const t5 = SB.get(5).find((t) => t.v.o === "lesa") || buildMany(soBeyging, 5, 1, { drillWord: verb("lesa") })[0];
  const right = t5.slots.map((s) => s.accepted[0]);
  assert.equal(judge(t5, { picked: "sterk", texts: right }).ok, true);
  assert.equal(judge(t5, { picked: "sterk", texts: ["ég " + right[0], "við " + right[1], "ég hef " + right[2]] }).ok, true);
  const weakened = judge(t5, { picked: "sterk", texts: ["lesaði", right[1], right[2]] });
  assert.equal(weakened.ok, false);
  assert.equal(weakened.detail.kindOk, true);
  assert.ok(ids(weakened).includes("sterk_veik_sogn"), ids(weakened).join());
  assert.equal(judge(t5, { picked: "veik", texts: right }).ok, false);
  /* A missing accent in a written form is forgiven at a cost. */
  const acc = SB.get(5).find((t) => /[áéíóúý]/.test(t.slots[0].accepted[0]) && t.slots[0].accepted.length === 1);
  const okForms = acc.slots.map((s) => s.accepted[0]);
  const plain = [okForms[0].normalize("NFD").replace(/[́]/g, "").normalize("NFC"), ...okForms.slice(1)];
  const near = judge(acc, { picked: acc.answer, texts: plain });
  assert.equal(near.ok, true);
  assert.equal(near.verdict, "near");
  assert.ok(near.xp < judge(acc, { picked: acc.answer, texts: okForms }).xp);
});

test("so_beyging: a review asks the same verb, or the same side", () => {
  const taka = verb("taka");
  assert.equal(soBeyging(lex, viewAt(3, { force: { word: taka, cell: "sobeyging:sterk" }, drillWord: taka }), seeded(1)).task.v, taka);
  assert.equal(soBeyging(lex, viewAt(3, { force: { word: taka, cell: "sobeyging:veik" }, drillWord: taka }), seeded(1)), null);
  const c = viewAt(3, { force: { cell: "sobeyging:veik" } });
  for (let i = 0; i < 40; i++) assert.equal(soBeyging(lex, c, seeded(i)).task.answer, "veik");
  assert.equal(soBeyging(lex, viewAt(3, { force: { cell: "NFET" } }), seeded(1)), null);
  /* A rescue drill on a noun is not a verb question. */
  assert.equal(soBeyging(lex, viewAt(3, { drillWord: lex.lookup("hestur", "kk") }), seeded(1)), null);
});

/* ========================================================================
 * so_mynd
 * ====================================================================== */

const SM = new Map([1, 3, 5].map((b) => [b, buildMany(soMynd, b, 1500)]));
const NOT_PASSIVE = ["búa", "fara", "koma", "hverfa", "verða", "vera", "líða", "gróa", "mæta", "flytja",
  "loka", "ljúka"];
const cellsWith = (e, w, voice) => Object.entries(e.forms)
  .filter(([m, fs]) => m.startsWith(voice + "-") && fs.some((f) => f.toLowerCase() === w.toLowerCase()));

test("so_mynd: three options in the lesson's order, the marked phrase in the sentence, the mynd certain", () => {
  for (const [band, tasks] of SM) {
    assert.equal(tasks.length, 1500, `þyngd ${band}: a build came back empty`);
    for (const t of tasks) {
      assert.deepEqual(t.options, MYNDIR);
      assert.ok(t.marks.length >= 1 && t.marks.every((k) => t.s.tok[k]), t.s.t);
      assert.equal(t.i, t.marks[t.marks.length - 1]);
      const words = t.marks.map((k) => t.s.tok[k].w.toLowerCase());
      assert.equal(t.question, `Í hvaða mynd er *${words.join(" ")}*?`);
      assert.ok(t.why.includes(`**${t.answer}**`), t.why);
      assert.equal(lessonFor(t), "mynd");
      const main = t.s.tok[t.i];
      const e = lex.lookup(t.word.split("|")[0], "so");
      assert.ok(e, t.word);
      if (t.answer === "þolmynd") {
        /* *vera* or *verða* and a participle, never of a verb whose
           participle after *vera* is not a þolmynd. */
        const aux = t.s.tok[t.marks[t.marks.length - 2]];
        assert.ok(["vera", "verða"].includes(aux.l), t.s.t);
        assert.ok(/^LHÞT/.test(main.m) || main.m === "GM-SAGNB", t.s.t);
        assert.ok(!NOT_PASSIVE.includes(main.l), `${t.s.t}: ${main.l}`);
      } else if (t.answer === "miðmynd") {
        assert.match(main.w, /st$/);
        assert.ok(cellsWith(e, main.w, "MM").length && !cellsWith(e, main.w, "GM").length, main.w);
      } else {
        assert.equal(t.marks.length, 1);
        assert.ok(cellsWith(e, main.w, "GM").length && !cellsWith(e, main.w, "MM").length, main.w);
        /* *vera* only in the lesson's *þú varst*: never beside a participle. */
        if (!t.tags.includes("somynd:st")) assert.ok(!["vera", "verða", "hafa"].includes(e.o), t.s.t);
      }
    }
  }
});

test("so_mynd: a form that is both germynd and miðmynd in BÍN is never asked", () => {
  /* *fannst, komst, sást, tókst, ólst* are miðmynd in the bank sentence and
     also *þú fannst …* in BÍN. */
  for (const t of [...SM.values()].flat()) {
    const w = t.s.tok[t.i].w.toLowerCase();
    assert.ok(!["fannst", "komst", "sást", "tókst", "ólst", "fórst"].includes(w), t.s.t);
  }
});

test("so_mynd: at least 150 different questions at every step it declares", () => {
  for (const band of typeById("so_mynd").bands) {
    const n = new Set(SM.get(band).map(sigMynd)).size;
    assert.ok(n >= 150, `þyngd ${band}: ${n} different questions`);
  }
});

test("so_mynd: the steps really change the question", () => {
  const share = (band, f) => SM.get(band).filter(f).length / 1500;
  for (const band of [1, 3, 5]) for (const m of MYNDIR)
    assert.ok(share(band, (t) => t.answer === m) > 0.15, `þyngd ${band}: too little ${m}`);
  /* 1–2: short sentences for germynd and miðmynd; þolmynd only with a subject. */
  for (const t of SM.get(1)) if (t.answer !== "þolmynd") assert.ok(t.s.lvl <= 3, t.s.t);
  const impersonal = (t) => t.answer === "þolmynd" && /^ÞGF/.test((t.s.tok[t.marks[0] - 1] || {}).m || "");
  assert.equal(SM.get(1).filter(impersonal).length, 0);
  assert.ok(SM.get(3).filter(impersonal).length > 20, "no *Okkur var sagt* at þyngd 3");
  /* 5: the lesson's warning, *þú lest*, about one question in four. */
  for (const band of [1, 3]) assert.ok(SM.get(band).every((t) => !t.tags.includes("somynd:st")));
  const st = SM.get(5).filter((t) => t.tags.includes("somynd:st"));
  assert.ok(st.length > 250 && st.length < 500, `${st.length} of 1500`);
  for (const t of st) {
    assert.equal(t.answer, "germynd");
    assert.equal(t.s.tok[0].w, "þú");
    assert.match(t.s.tok[1].w, /st$/);
    assert.match(t.why, /Prófaðu nafnháttinn/);
  }
  assert.ok(median(SM.get(5).filter((t) => !t.tags.includes("somynd:st")).map((t) => t.s.lvl))
    > median(SM.get(1).map((t) => t.s.lvl)));
});

test("so_mynd: right and wrong, and the -st germynd taken for miðmynd", () => {
  const t = SM.get(3).find((x) => x.answer === "þolmynd");
  assert.equal(judge(t, { picked: "þolmynd" }).ok, true);
  assert.deepEqual(ids(judge(t, { picked: "germynd" })), ["mynd_greina"]);
  assert.equal(judge(t, {}).pending, true);
  const st = SM.get(5).find((x) => x.tags.includes("somynd:st"));
  assert.deepEqual(ids(judge(st, { picked: "miðmynd" })), ["mynd_greina", "mynd_st"]);
  assert.deepEqual(ids(judge(st, { picked: "þolmynd" })), ["mynd_greina"]);
  assert.ok(chancesIn(st).includes("mynd_st"));
  assert.ok(!chancesIn(t).includes("mynd_st"));
});

test("so_mynd: a review asks the same mynd, the same verb, never the sentence just missed", () => {
  const c = viewAt(1, { force: { cell: "somynd:tholmynd" } });
  for (let i = 0; i < 40; i++) assert.equal(soMynd(lex, c, seeded(i)).task.answer, "þolmynd");
  const segja = verb("segja");
  const w = viewAt(4, { force: { word: segja }, drillWord: segja });
  for (let i = 0; i < 30; i++) assert.equal(soMynd(lex, w, seeded(i)).task.word, wordKey("segja", "so"));
  const t0 = soMynd(lex, viewAt(3), seeded(7)).task;
  const a = viewAt(3, { force: { cell: t0.cell, avoid: t0.s.t } });
  for (let i = 0; i < 40; i++) assert.notEqual(soMynd(lex, a, seeded(i)).task.s.t, t0.s.t);
  assert.equal(soMynd(lex, viewAt(3, { force: { cell: "GM-BH-ET" } }), seeded(1)), null);
});

/* ========================================================================
 * so_bodhattur
 * ====================================================================== */

const BH = new Map(typeById("so_bodhattur").bands.map((b) => [b, buildMany(soBodhattur, b, 1500)]));

test("so_bodhattur: BÍN's forms, every one of them accepted, and the explanation", () => {
  for (const [band, tasks] of BH) {
    assert.equal(tasks.length, 1500, `þyngd ${band}: a build came back empty`);
    for (const t of tasks) {
      assert.equal(t.type, "slots");
      assert.equal(t.options, null);
      for (const sl of t.slots) {
        assert.ok(["GM-BH-ET", "GM-BH-FT"].includes(sl.m));
        assert.deepEqual(sl.accepted, t.v.forms[sl.m], `${t.v.o} ${sl.m}`);
        const j = judge(t, { texts: t.slots.map((s) => (s === sl ? sl.accepted.at(-1) : s.accepted[0])) });
        assert.equal(j.ok, true, `${t.v.o}: ${sl.accepted.at(-1)}`);
      }
      assert.ok(t.why.includes(`**${t.v.forms["GM-BH-ET"][0]}**`), t.why);
      assert.equal(lessonFor(t), "hattur");
    }
  }
});

test("so_bodhattur: at least 150 different questions at every step it declares", () => {
  for (const band of typeById("so_bodhattur").bands) {
    const n = new Set(BH.get(band).map(sigSlots)).size;
    assert.ok(n >= 150, `þyngd ${band}: ${n} different questions`);
  }
});

test("so_bodhattur: the steps really change the question", () => {
  /* 1: the singular, with the lesson's *kom + þú → ?*. */
  for (const t of BH.get(1)) {
    assert.deepEqual(t.slots.map((s) => s.m), ["GM-BH-ET"]);
    assert.equal(t.show[1].f, `${bodhatturBase(t.v)} + þú → ?`);
  }
  /* 3 and 5: singular and plural; at 5 the irregular verbs often. */
  for (const band of [3, 5]) for (const t of BH.get(band)) {
    assert.deepEqual(t.slots.map((s) => s.m), ["GM-BH-ET", "GM-BH-FT"]);
    assert.equal(t.show.length, 1);
  }
  const hard = (band) => BH.get(band).filter((t) => (t.v.irr || 0) >= 4).length / 1500;
  assert.ok(hard(5) > hard(3) + 0.15, `irregular verbs ${Math.round(hard(3) * 100)}% → ${Math.round(hard(5) * 100)}%`);
  /* The rank rises from 1 to 3. From 3 to 5 it is the irregular verbs that
     rise (above), and they are among the commonest, so the median rank at 5
     is a coin: five blocks of 1,500 seeds on main before #9 gave 3 → 5 as
     110→111, 110→107, 111→106, 105→106, 113→110 (only the first, the one
     pinned here, rose). 1 → 3 rose in every block, before and after #9. */
  const rank = (band) => median(BH.get(band).map((t) => t.v.r));
  assert.ok(rank(3) > rank(1), `median rank ${rank(1)} → ${rank(3)} → ${rank(5)}`);
  /* Never an order to harm, and no verb with no boðháttur in use. */
  const asked = new Set([...BH.values()].flat().map((t) => t.v.o));
  for (const o of ["drepa", "stela", "ljúga", "deyja", "munu", "skulu", "mega", "vilja", "verða"]) assert.ok(!asked.has(o), o);
});

test("so_bodhattur: the stýfður boðháttur and -ðu on the infinitive are named mistakes", () => {
  const koma = verb("koma");
  const t = soBodhattur(lex, viewAt(3, { drillWord: koma, force: { word: koma } }), seeded(1)).task;
  assert.equal(judge(t, { texts: ["komdu", "komið"] }).ok, true);
  assert.equal(judge(t, { texts: ["Komdu!", "komið!"] }).ok, true);
  const st = judge(t, { texts: ["kom", "komið"] });
  assert.equal(st.ok, false);
  /* Not read as a past tense: the paradigm would blame the tense. */
  assert.deepEqual(ids(st), ["bodhattur", "bodh_styfdur"]);
  assert.deepEqual(ids(judge(t, { texts: ["komaðu", "komið"] })), ["bodhattur", "bodh_nh"]);
  assert.ok(ids(judge(t, { texts: ["komdu", "kom"] })).includes("bodhattur"));
  assert.equal(judge(t, { texts: ["komdu", ""] }).pending, true);
  /* Two forms in one box are not an answer that counts. */
  assert.equal(judge(t, { texts: ["komdu kom", "komið"] }).ok, false);
  for (const p of ["bodhattur", "bodh_styfdur", "bodh_nh"]) assert.ok(chancesIn(t).includes(p), p);
  /* *kalla*: the infinitive with -ðu IS the boðháttur. */
  const kalla = verb("kalla");
  const k = soBodhattur(lex, viewAt(3, { drillWord: kalla, force: { word: kalla } }), seeded(1)).task;
  assert.equal(judge(k, { texts: ["kallaðu", "kallið"] }).ok, true);
  assert.ok(!chancesIn(k).includes("bodh_nh"));
  /* An accent short is forgiven at a cost. */
  const sja = soBodhattur(lex, viewAt(3, { drillWord: verb("sjá"), force: { word: verb("sjá") } }), seeded(1)).task;
  const near = judge(sja, { texts: ["sjaðu", "sjáið"] });
  assert.equal(near.ok, true);
  assert.equal(near.verdict, "near");
});

test("so_bodhattur: a review asks the plural it missed, of the same verb", () => {
  const koma = verb("koma");
  const t = soBodhattur(lex, viewAt(1, { drillWord: koma, force: { word: koma, cell: "GM-BH-FT" } }), seeded(1)).task;
  assert.deepEqual(t.slots.map((s) => s.m), ["GM-BH-ET", "GM-BH-FT"]);
  assert.equal(soBodhattur(lex, viewAt(3, { force: { cell: "GM-FH-NT-1P-ET" } }), seeded(1)), null);
  assert.equal(soBodhattur(lex, viewAt(3, { drillWord: verb("munu") }), seeded(1)), null);
});

/* ========================================================================
 * All three: the review queue, the catalogue, the curriculum, the lessons
 * ====================================================================== */

test("all three: a miss goes into the review queue and comes back as the thing missed", () => {
  const wrong = {
    so_beyging: (t) => ({ picked: t.answer === "sterk" ? "veik" : "sterk", texts: t.slots.map((s) => s.accepted[0]) }),
    so_mynd: (t) => ({ picked: t.options.find((o) => o !== t.answer) }),
    so_bodhattur: (t) => ({ texts: t.slots.map(() => "xxrangt") }),
  };
  for (const id of Object.keys(wrong)) {
    const p = pupil(3);
    const v = makeView({ S: p.S, sess: p.sess, policy: POLICY, today: D0 });
    const t = typeById(id).build(lex, v, seeded(3)).task;
    t.typeId = id;
    settle(p.S, p.sess, t, judge(t, wrong[id](t), p));
    const e = p.S.review.items.find((x) => x.t === id);
    assert.ok(e, `${id}: nothing queued`);
    assert.equal(e.c, t.cell);
    const later = makeView({ S: p.S, sess: newSession(p.S), policy: POLICY, today: "2026-11-17" });
    const r = reviewTask(lex, later, seeded(9), e);
    assert.ok(r, `${id}: the review could not be built`);
    assert.equal(r.task.cell, t.cell, id);
    assert.equal(r.task.word, t.word, id);
    assert.equal(r.hit, "both", id);
  }
});

test("all three are in the curriculum switch, the map, the 9. bekkur preset and the diagnosis", () => {
  const q = new Map(QUESTION_TYPES.map((x) => [x.id, x]));
  const types = { so_beyging: "slots", so_mynd: "choice", so_bodhattur: "slots" };
  for (const [id, renderer] of Object.entries(types)) {
    assert.equal(q.get(id).skill, "sagnord");
    assert.equal(typeById(id).skill, "sagnord");
    assert.equal(typeById(id).renderer, renderer);
    /* so_beyging and so_bodhattur also move at 2 and 4: they choose by
       `wordWeight`, which reads the level at every step (item 16). */
    assert.deepEqual(typeById(id).bands, id === "so_mynd" ? [1, 3, 5] : [1, 2, 3, 4, 5]);
  }
  for (const [node, type] of [["so-sterkar-veikar", "so_beyging"], ["so-tholmynd", "so_mynd"],
                              ["so-bodhattur", "so_bodhattur"]]) {
    const n = nodeById(node);
    assert.ok(n.types.includes(type), node);
    assert.equal(n.cover, "full");
    assert.ok(!backlog(27).some((x) => x.id === node), `${node} is still in the backlog`);
    assert.equal(presetPolicy(8).types[type], false, `8. bekkur: ${type}`);
    for (const year of [9, 10]) assert.equal(presetPolicy(year).types[type], true, `${year}. bekkur: ${type}`);
  }
  for (const id of ["beyging_so", "beyging_so_hljod", "mynd_greina", "mynd_st", "bodhattur", "bodh_styfdur", "bodh_nh"]) {
    const p = patternById(id);
    assert.ok(p, id);
    assert.ok(LESSONS.some((l) => l.id === p.lesson), `${id}: no page ${p.lesson}`);
  }
  assert.ok(patternById("sterk_veik_sogn").types.includes("so_beyging"));
});

test("the lesson's own kennimyndir are the ones asked", () => {
  /* content/lessons.js: "nafnháttur: fara, (ég) fór, (við) fórum, (ég hef) farið",
     and its table reads the same four cells. */
  const page = LESSONS.find((l) => l.id === "sterkar-veikar");
  assert.ok(page.blocks.some((b) => b.table === "kennimyndir"));
  assert.deepEqual(KENNIMYNDIR.map((k) => k.h), ["að", "ég", "við", "ég hef"]);
  const fara = verb("fara");
  assert.deepEqual(KENNIMYNDIR.map((k) => fara.forms[k.m][0]), ["fara", "fór", "fórum", "farið"]);
});
