/* Item 27, first half: two question types the lessons taught and practice
   never asked.

     fn_flokkar   which kind of pronoun a word of a bank sentence is
                  (tasks/fornofn.js)
     no_beyging   strong or weak noun, by the genitive singular exactly as
                  Lesefni teaches it (tasks/nafnord.js)

   What is held here: every question has its answer among its options and no
   option twice; each declared step of difficulty has at least 150 different
   questions and really asks something different; nothing uncertain is ever
   asked; the judge, the diagnosis and the review queue know both types; and
   the curriculum map counts the two nodes as covered. */

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
import { fnKind, PRONOUN_KINDS } from "../src/js/tasks/fornofn.js";
import { noDeclension, nounDeclension } from "../src/js/tasks/nafnord.js";
import { topByRank } from "../src/js/tasks/shared.js";

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

/* What makes two questions different: the sentence and the word asked, or
   the noun and what is shown of it — and the options and the answer. */
const sigFn = (t) => JSON.stringify([t.s.t, t.i, t.options, t.answer]);
const sigNo = (t) => JSON.stringify([t.n.o, t.n.c, t.show, t.askGen, t.answer]);

/* ========================================================================
 * fn_flokkar
 * ====================================================================== */

const FN = new Map(typeById("fn_flokkar").bands.map((b) => [b, buildMany(fnKind, b, 1500)]));
const KIND_NAMES = PRONOUN_KINDS.map((k) => k.nm);

test("fn_flokkar: the answer is among the options, no option twice, the options in the lesson's order", () => {
  for (const [band, tasks] of FN) {
    assert.ok(tasks.length === 1500, `þyngd ${band}: a build came back empty`);
    for (const t of tasks) {
      assert.ok(t.options.includes(t.answer), `${t.s.t}: ${t.answer} not offered`);
      assert.equal(new Set(t.options).size, t.options.length, `${t.s.t}: an option twice`);
      assert.deepEqual(t.options, KIND_NAMES.filter((k) => t.options.includes(k)), "order");
      assert.equal(t.mark, true, "the word is marked in the sentence, not blanked");
      assert.match(t.question, /^Hvers konar fornafn er \*[^*]+\*\?$/);
      assert.ok(t.why && t.why.includes(`*${t.s.tok[t.i].w.toLowerCase()}*`), `${t.s.t}: the explanation names the word`);
    }
  }
});

test("fn_flokkar: at least 150 different questions at every step it declares", () => {
  for (const band of typeById("fn_flokkar").bands) {
    const n = new Set(FN.get(band).map(sigFn)).size;
    assert.ok(n >= 150, `þyngd ${band}: ${n} different questions`);
  }
});

test("fn_flokkar: the steps really change the question", () => {
  /* 1–2: the three kinds of the lesson's first half; 3+: all six. */
  for (const band of [1, 2]) for (const t of FN.get(band)) assert.equal(t.options.length, 3);
  for (const band of [3, 4, 5]) for (const t of FN.get(band)) assert.equal(t.options.length, 6);
  const answers = (band) => new Set(FN.get(band).map((t) => t.answer));
  assert.deepEqual([...answers(1)].sort(), ["eignarfornafn", "persónufornafn", "ábendingarfornafn"].sort());
  for (const k of ["afturbeygt fornafn", "óákveðið fornafn"]) assert.ok(answers(3).has(k), k);
  /* The genitive of a personal pronoun after a noun — the lesson's warning —
     only from 5, and then often. */
  for (const band of [1, 2, 3, 4]) assert.ok(FN.get(band).every((t) => !t.tags.includes("fnkind:gen")), `${band}`);
  const gen = FN.get(5).filter((t) => t.tags.includes("fnkind:gen"));
  assert.ok(gen.length > 100, `${gen.length} genitive traps at þyngd 5`);
  for (const t of gen) {
    assert.equal(t.answer, "persónufornafn");
    assert.match(t.why, /ekki eignarfornafn/);
  }
});

test("fn_flokkar: no form whose kind the sentence cannot settle is ever asked", () => {
  /* Shared between the personal pronoun and *sá* (the parser read "Það eru
     fjögur börn" as *sá*), or between *hinn* and the article. */
  const NEVER = new Set(["það", "því", "þess", "þeir", "þær", "þau", "þá", "þeim", "þeirra"]);
  const all = [...FN.values()].flat();
  for (const t of all) {
    const tok = t.s.tok[t.i];
    const w = tok.w.toLowerCase();
    assert.ok(!NEVER.has(w), `${t.s.t}: asks *${w}*`);
    assert.equal(tok.c, "fornafn");
    /* The lemma is one the lesson names, under the kind the lesson gives it. */
    const kind = PRONOUN_KINDS.find((k) => k.lemmas.includes(tok.l));
    assert.ok(kind, `${t.s.t}: *${tok.l}* is not in the lesson`);
    assert.equal(kind.nm, t.answer, `${t.s.t}: *${w}*`);
    /* *hver, hvaða* only as the opening of a direct question. */
    if (kind.k === "spurnar") assert.ok(/\?$/.test(t.s.t) && t.i <= 1, t.s.t);
    if (tok.l === "hinn") assert.notEqual((t.s.tok[t.i + 1] || {}).c, "lýsingarorð", t.s.t);
    /* *mín, þín, sín* as an eignarfornafn only right after a noun. */
    if (/^(mín|þín|sín)$/.test(w) && kind.k === "eignar") assert.equal(t.s.tok[t.i - 1].c, "nafnorð", t.s.t);
  }
  /* "á hverjum degi" is *hver* = each: not taught, not asked. *Hvað kostar
     bókin?* (BÍN files *hvað* under *hver*) opens a direct question and is
     the spurnarfornafn the lesson teaches (item 24 put it in the bank). */
  const direct = (t) => /\?$/.test(t.s.t) && (t.i === 0 || (t.i === 1 && t.s.tok[0].c === "forsetning"));
  assert.ok(!all.some((t) => t.s.tok[t.i].l === "hver" && !direct(t)), "hver outside a direct question");
});

test("fn_flokkar: the plural personal pronoun is named as the pupil knows it", () => {
  const okkar = [...FN.values()].flat().find((t) => t.s.tok[t.i].w.toLowerCase() === "okkar");
  assert.ok(okkar, "no question on *okkar*");
  assert.match(okkar.why, /persónufornafninu \*við\*/);
});

test("fn_flokkar: right and wrong, and the mistake the lesson warns of", () => {
  const t = FN.get(3).find((x) => x.answer === "eignarfornafn");
  const right = judge(t, { picked: t.answer });
  assert.equal(right.ok, true);
  assert.deepEqual(right.findings, []);
  const wrong = judge(t, { picked: "ábendingarfornafn" });
  assert.equal(wrong.ok, false);
  assert.deepEqual(wrong.findings.map((f) => f.p), ["fn_flokkar"]);
  assert.equal(judge(t, {}).pending, true);
  const gen = FN.get(5).find((x) => x.tags.includes("fnkind:gen"));
  assert.deepEqual(judge(gen, { picked: "eignarfornafn" }).findings.map((f) => f.p), ["fn_flokkar", "eignarfall_pfn"]);
  assert.deepEqual(judge(gen, { picked: "óákveðið fornafn" }).findings.map((f) => f.p), ["fn_flokkar"]);
  assert.ok(chancesIn(gen).includes("eignarfall_pfn"));
  assert.ok(!chancesIn(t).includes("eignarfall_pfn"));
});

test("fn_flokkar: a review asks the same kind, the same word, never the sentence just missed", () => {
  const v = viewAt(4, { force: { cell: "fnflokkur:óákveðið" } });
  for (let i = 0; i < 40; i++) assert.equal(fnKind(lex, v, seeded(i)).task.answer, "óákveðið fornafn");
  const minn = lex.lookup("minn", "fn");
  const w = viewAt(4, { force: { word: minn }, drillWord: minn });
  for (let i = 0; i < 40; i++) assert.equal(fnKind(lex, w, seeded(i)).task.s.tok[fnKind(lex, w, seeded(i)).task.i].l, "minn");
  const t0 = fnKind(lex, viewAt(1), seeded(7)).task;
  const a = viewAt(1, { force: { cell: t0.cell, avoid: t0.s.t } });
  for (let i = 0; i < 40; i++) assert.notEqual(fnKind(lex, a, seeded(i)).task.s.t, t0.s.t);
  /* A rescue drill on a noun is not a pronoun question. */
  const hestur = lex.lookup("hestur", "kk");
  assert.equal(fnKind(lex, viewAt(3, { drillWord: hestur }), seeded(1)), null);
});

/* ========================================================================
 * no_beyging
 * ====================================================================== */

const NO = new Map(typeById("no_beyging").bands.map((b) => [b, buildMany(noDeclension, b, 1500)]));
const VOWEL = /[aeiouyáéíóúýæö]$/i;

test("no_beyging: the answer is among the options, no option twice, and it is the lesson's rule", () => {
  for (const [band, tasks] of NO) {
    assert.equal(tasks.length, 1500, `þyngd ${band}: a build came back empty`);
    for (const t of tasks) {
      assert.deepEqual(t.options, ["sterk", "veik"]);
      assert.ok(t.options.includes(t.answer));
      /* The rule, worked out again here from the BÍN forms: the genitive
         singular ends in a consonant → sterk; every singular form ends in a
         vowel → veik. */
      const sg = ["NFET", "ÞFET", "ÞGFET", "EFET"].map((m) => t.n.forms[m]);
      const strong = sg[3].every((f) => !VOWEL.test(f));
      const weak = sg.every((fs) => fs.every((f) => VOWEL.test(f)));
      assert.ok(strong !== weak, `${t.n.o}: the rule does not settle it`);
      assert.equal(t.answer, strong ? "sterk" : "veik", t.n.o);
      assert.deepEqual(t.gen, t.n.forms.EFET, `${t.n.o}: the genitive is BÍN's`);
      assert.ok(t.why.includes(`*til ${t.gen[0]}`), `${t.n.o}: the explanation says *til …*`);
      assert.match(t.why, t.answer === "sterk" ? /\*\*sterk\*\*/ : /\*\*veik\*\*/);
    }
  }
});

test("no_beyging: the irregular nouns the lesson names are never asked", () => {
  for (const o of ["faðir", "móðir", "bróðir", "systir", "dóttir", "viðskipti"])
    for (const c of ["kk", "kvk", "hk"]) assert.equal(nounDeclension(lex.lookup(o, c)), null, o);
  const asked = new Set([...NO.values()].flat().map((t) => t.n.o));
  for (const o of ["faðir", "móðir", "bróðir", "systir", "dóttir"]) assert.ok(!asked.has(o), o);
});

test("no_beyging: at least 150 different questions at every step it declares", () => {
  for (const band of typeById("no_beyging").bands) {
    const n = new Set(NO.get(band).map(sigNo)).size;
    assert.ok(n >= 150, `þyngd ${band}: ${n} different questions`);
  }
});

test("no_beyging: the steps really change the question", () => {
  /* 1: the four singular forms, and no nominative that misleads. */
  for (const t of NO.get(1)) {
    assert.deepEqual(t.show.map((x) => x.h), ["hér er", "um", "frá", "til"]);
    assert.equal(t.askGen, false);
    assert.ok(!t.tags.includes("nobeyg:nf"), t.n.o);
  }
  /* 3: only the nominative; words like *herbergi* about one time in three. */
  const traps = NO.get(3).filter((t) => t.tags.includes("nobeyg:nf"));
  for (const t of NO.get(3)) { assert.deepEqual(t.show.map((x) => x.h), ["hér er"]); assert.equal(t.askGen, false); }
  assert.ok(traps.length > 300 && traps.length < 750, `${traps.length} of 1500`);
  for (const t of traps) {
    assert.equal(t.answer, "sterk");
    assert.ok(VOWEL.test(t.n.forms.NFET[0]), t.n.o);
    assert.match(t.why, /eignarfallið sem ræður/);
  }
  /* 5: the genitive is written; rarer words. */
  for (const t of NO.get(5)) { assert.equal(t.askGen, true); assert.equal(t.m, "EFET"); }
  const median = (band) => { const r = NO.get(band).map((t) => t.n.r).sort((a, b) => a - b); return r[r.length >> 1]; };
  assert.ok(median(5) > median(3) * 1.3, `median rank ${median(3)} → ${median(5)}`);
  /* Strong and weak both common at every step: "sterk" every time must not pay. */
  for (const [band, tasks] of NO) {
    const s = tasks.filter((t) => t.answer === "sterk").length / tasks.length;
    assert.ok(s > 0.4 && s < 0.8, `þyngd ${band}: ${Math.round(s * 100)}% sterk`);
  }
});

test("no_beyging: right and wrong, the written genitive, and what the diagnosis reads", () => {
  const t1 = NO.get(1)[0];
  assert.equal(judge(t1, { picked: t1.answer }).ok, true);
  const w1 = judge(t1, { picked: t1.answer === "sterk" ? "veik" : "sterk" });
  assert.equal(w1.ok, false);
  assert.deepEqual(w1.findings.map((f) => f.p), ["beyging_no"]);
  assert.equal(judge(t1, {}).pending, true);

  /* A trap answered "veik": the nominative was allowed to decide. */
  const trap = NO.get(3).find((t) => t.tags.includes("nobeyg:nf"));
  assert.deepEqual(judge(trap, { picked: "veik" }).findings.map((f) => f.p), ["beyging_no", "beyging_no_nf"]);
  assert.ok(chancesIn(trap).includes("beyging_no_nf"));

  const t5 = NO.get(5).find((t) => t.answer === "sterk" && /s$/.test(t.gen[0]) && t.gen.length === 1);
  const gen = t5.gen[0];
  assert.equal(judge(t5, { picked: "sterk", text: gen }).ok, true);
  /* As the lesson says it: "til hests". */
  assert.equal(judge(t5, { picked: "sterk", text: "til " + gen }).ok, true);
  /* Both parts must be right. */
  assert.equal(judge(t5, { picked: "veik", text: gen }).ok, false);
  const badForm = judge(t5, { picked: "sterk", text: t5.n.forms.ÞGFET[0] });
  assert.equal(badForm.ok, false);
  assert.equal(badForm.detail.kindOk, true);
  /* The dative written for the genitive is a case pattern, not a declension one. */
  assert.ok(badForm.findings.some((f) => f.p === "ef" || f.p === "fall_annad"), JSON.stringify(badForm.findings));
  assert.ok(!badForm.findings.some((f) => f.p === "beyging_no"));
  /* Nothing written: wait. */
  assert.equal(judge(t5, { picked: "sterk", text: "" }).pending, true);
  assert.equal(judge(t5, { text: gen }).pending, true);
});

test("no_beyging: a missing accent in the genitive is forgiven at a cost", () => {
  const t = NO.get(5).find((x) => /[áéíóúý]/.test(x.gen[0]) && x.gen.length === 1);
  const plain = t.gen[0].normalize("NFD").replace(/[́]/g, "").normalize("NFC");
  const j = judge(t, { picked: t.answer, text: plain });
  assert.equal(j.ok, true);
  assert.equal(j.verdict, "near");
  assert.ok(j.xp < judge(t, { picked: t.answer, text: t.gen[0] }).xp);
});

test("no_beyging: a review asks the same word, or the same side", () => {
  const hestur = lex.lookup("hestur", "kk");
  const v = viewAt(3, { force: { word: hestur, cell: "beyging:sterk" }, drillWord: hestur });
  assert.equal(noDeclension(lex, v, seeded(1)).task.n, hestur);
  /* A word on the other side of the cell asked for: nothing, not something else. */
  const w = viewAt(3, { force: { word: hestur, cell: "beyging:veik" }, drillWord: hestur });
  assert.equal(noDeclension(lex, w, seeded(1)), null);
  const c = viewAt(3, { force: { cell: "beyging:veik" } });
  for (let i = 0; i < 40; i++) assert.equal(noDeclension(lex, c, seeded(i)).task.answer, "veik");
  assert.equal(noDeclension(lex, viewAt(3, { force: { cell: "NFET" } }), seeded(1)), null);
});

test("both types: a miss goes into the review queue and comes back as the thing missed", () => {
  for (const [id, wrongPick] of [["fn_flokkar", (t) => t.options.find((o) => o !== t.answer)],
                                 ["no_beyging", (t) => (t.answer === "sterk" ? "veik" : "sterk")]]) {
    const p = pupil(3);
    const v = makeView({ S: p.S, sess: p.sess, policy: POLICY, today: D0 });
    const t = typeById(id).build(lex, v, seeded(3)).task;
    t.typeId = id;
    settle(p.S, p.sess, t, judge(t, { picked: wrongPick(t) }, p));
    const e = p.S.review.items.find((x) => x.t === id);
    assert.ok(e, `${id}: nothing queued`);
    assert.equal(e.c, t.cell);
    const later = makeView({ S: p.S, sess: newSession(p.S), policy: POLICY, today: "2026-11-17" });
    const r = reviewTask(lex, later, seeded(9), e);
    assert.ok(r, `${id}: the review could not be built`);
    assert.equal(r.task.cell, t.cell, id);
    if (t.word) assert.equal(r.task.word, t.word, id);
    assert.ok(["both", "cell"].includes(r.hit), `${id}: ${r.hit}`);
  }
});

/* ========================================================================
 * The catalogue, the curriculum, the lessons
 * ====================================================================== */

test("both types are in the curriculum switch, the map, the year-8 preset and the diagnosis", () => {
  const q = new Map(QUESTION_TYPES.map((x) => [x.id, x]));
  assert.equal(q.get("fn_flokkar").skill, "fornofn");
  assert.equal(q.get("no_beyging").skill, "nafnord");
  assert.equal(typeById("fn_flokkar").skill, "fornofn");
  assert.equal(typeById("no_beyging").renderer, "kenni");
  for (const [node, type] of [["fn-flokkar", "fn_flokkar"], ["no-beyging", "no_beyging"]]) {
    const n = nodeById(node);
    assert.deepEqual(n.types, [type]);
    assert.equal(n.cover, "full");
    assert.ok(!backlog(27).some((x) => x.id === node), `${node} is still in the backlog`);
    for (const year of [8, 9, 10]) assert.equal(presetPolicy(year).types[type], true, `${year}. bekkur: ${type}`);
  }
  for (const id of ["fn_flokkar", "eignarfall_pfn", "beyging_no", "beyging_no_nf"]) {
    const p = patternById(id);
    assert.ok(p, id);
    assert.ok(LESSONS.some((l) => l.id === p.lesson), `${id}: no page ${p.lesson}`);
  }
});

test("each question opens the Lesefni page that teaches it", () => {
  assert.equal(lessonFor(NO.get(1)[0]), "nafnord-beyging");
  assert.equal(lessonFor(FN.get(1)[0]), "fornofn");
});

test("no_beyging: þyngd 1–2 ask only the commonest fifth of each gender's nouns", () => {
  /* v6.13: the cap read `.r` off the pool's `{ n, kind, trap }` wrapper,
     found none, and let every noun through — þyngd 1 asked words up to rank
     1,384, as þyngd 3 does. A noun's rank counts within its gender. */
  const fifth = {};
  for (const g of ["kk", "kvk", "hk"])
    fifth[g] = Math.max(20, Math.ceil(0.2 * lex.nouns.filter((n) => n.c === g && !n.nx).length));
  for (const band of [1, 2]) {
    for (const t of NO.get(band))
      assert.ok(t.n.r <= fifth[t.n.c], `þyngd ${band}: *${t.n.o}* (${t.n.c}, rank ${t.n.r}) is not common`);
  }
  assert.ok(NO.get(3).some((t) => t.n.r > fifth[t.n.c]), "þyngd 3 should reach past the commonest fifth");
  /* and the helper no longer hides a pool it cannot read */
  const wrapped = lex.nouns.slice(0, 50).map((n) => ({ n }));
  assert.throws(() => topByRank(wrapped, 0.2), /without a frequency rank/);
  assert.ok(topByRank(wrapped, 0.2, (y) => y.n.r).length < wrapped.length || wrapped.length <= 20);
});
