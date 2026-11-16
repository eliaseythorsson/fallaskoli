/* Item 28: material for years 9 and 10. Four question types on three nodes of
   the curriculum map that had no questions at all.

     gerd_tegund  what kind of subordinate clause the underlined one is
                  (tasks/setningagerd.js)
     setn_lidir   what kind of phrase the underlined words are
     lid_finna    click every word of the forsetningarliður
                  (tasks/setningafraedi.js)
     raeda        direct speech into indirect speech (tasks/malbeiting.js),
                  built on the rewrite Umritun already had

   What is held here. Every question is checked a second time from the
   sentence itself, by rules written in this file and not shared with the
   builders: the conjunction a clause opens with, the mood after *svo að*,
   the word classes inside a phrase, the BÍN forms in a model answer. Each
   declared step of difficulty has at least 150 different questions and asks
   something the step below did not. The judge, the diagnosis, the review
   queue, the curriculum map and the year presets know all four. */

import test from "node:test";
import assert from "node:assert/strict";
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, newSession } from "../src/js/core/state.js";
import { SKILL_IDS } from "../src/js/core/skills.js";
import { createPolicy, QUESTION_TYPES, presetPolicy } from "../src/js/core/policy.js";
import { seeded } from "../src/js/core/duel.js";
import { judge, settle } from "../src/js/core/answer.js";
import { chancesIn, patternById } from "../src/js/core/diagnosis.js";
import { nodeById, backlog } from "../src/js/core/curriculum.js";
import { lessonFor } from "../src/js/core/lessons.js";
import { LESSONS } from "../src/js/content/lessons.js";
import { typeById, makeView, reviewTask } from "../src/js/tasks/index.js";
import { clKind } from "../src/js/tasks/setningagerd.js";
import { synPhrase, synFindPP } from "../src/js/tasks/setningafraedi.js";
import { taskSpeech, transformIndirect, taskTransform } from "../src/js/tasks/malbeiting.js";

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
const N = 1500;
const BANDS = [1, 2, 3, 4, 5, 6, 7];
const PUNCT = new Set([".", ",", "!", "?", ";", ":"]);
const low = (w) => String(w).toLowerCase();
const wordsOf = (s, a, b) => s.tok.slice(a, b + 1).flatMap((t) => low(t.w).split(" "));
const finite = (t) => t.x === "so" && /-(FH|VH)-/.test(t.m || "");
const distinct = (tasks, sig) => new Set(tasks.map(sig)).size;

/* ========================================================================
 * gerd_tegund
 * ====================================================================== */

const KIND = new Map(BANDS.map((b) => [b, buildMany(clKind, b, N)]));
const GROUPS = ["fallsetning", "tilvísunarsetning", "atvikssetning"];
const SEVEN = ["skýringarsetning", "spurnarsetning", "tilvísunarsetning", "tíðarsetning",
  "skilyrðissetning", "orsakarsetning", "viðurkenningarsetning"];
const NINE = [...SEVEN, "tilgangssetning", "afleiðingarsetning"];
const sigKind = (t) => JSON.stringify([t.s.t, t.span.from, t.span.to, t.options, t.answer]);

/* What each kind opens with — this file's own table, written from the
   Lesefni page, so that a change to the build's table is noticed here. */
const OPENS = {
  skýringarsetning: [["að"]],
  spurnarsetning: [["hvort"], ["hver"], ["hvað"], ["hvar"], ["hvenær"], ["hvernig"], ["hvert"],
    ["hvaðan"], ["hvaða"], ["af", "hverju"], ["hversu"]],
  tilvísunarsetning: [["sem"]],
  tíðarsetning: [["þegar"], ["áður", "en"], ["eftir", "að"], ["á", "meðan"], ["meðan"],
    ["þangað", "til"], ["um", "leið", "og"], ["fyrr", "en"]],
  skilyrðissetning: [["ef"], ["nema"]],
  orsakarsetning: [["af", "því", "að"], ["vegna", "þess", "að"]],
  viðurkenningarsetning: [["þótt"], ["þó", "að"], ["enda", "þótt"]],
  tilgangssetning: [["svo", "að"], ["til", "þess", "að"]],
  afleiðingarsetning: [["svo", "að"]],
};
const GROUP_OF = { skýringarsetning: "fallsetning", spurnarsetning: "fallsetning",
  tilvísunarsetning: "tilvísunarsetning" };
const groupOf = (k) => GROUP_OF[k] || "atvikssetning";

test("gerd_tegund: the answer is among the options, no option twice, a clause is underlined", () => {
  for (const [band, tasks] of KIND) {
    assert.equal(tasks.length, N, `þyngd ${band}: a build came back empty`);
    for (const t of tasks) {
      assert.equal(t.type, "choice");
      assert.ok(t.options.includes(t.answer), `${t.s.t}: ${t.answer} not offered`);
      assert.equal(new Set(t.options).size, t.options.length);
      assert.equal(t.markSpan, true);
      assert.ok(t.span.to > t.span.from, t.s.t);
      assert.ok(t.why.length > 40);
    }
  }
});

test("gerd_tegund: the kind is the one the clause's own first words and verb say", () => {
  const seen = new Set();
  for (const tasks of KIND.values()) for (const t of tasks) {
    const key = `${t.s.t}#${t.span.from}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const { s, span } = t;
    /* the build recorded exactly this clause, with this kind */
    const rec = (s.cl || []).find((c) => c.a === span.from && c.b === span.to);
    assert.ok(rec && rec.t === t.sub, `${s.t}: no such clause in the data`);
    assert.ok(!s.ku, `${s.t}: clause structure not vouched for`);
    /* it opens with a conjunction of its kind */
    const w = wordsOf(s, span.from, span.to);
    assert.ok(OPENS[t.sub].some((o) => o.every((x, k) => w[k] === x)),
      `${t.sub} opening with "${w.slice(0, 3).join(" ")}": ${s.t}`);
    /* no word of the main clause inside it, and a finite verb of its own */
    const inside = s.tok.slice(span.from, span.to + 1).filter((x) => !PUNCT.has(x.w));
    assert.ok(inside.every((x) => x.k !== "aðalsetning"), `main-clause word inside: ${s.t}`);
    assert.ok(inside.some(finite), `no finite verb: ${s.t}`);
    /* *svo að*: the subjunctive is purpose, the indicative result — and the
       verb must show which (no form that is both). */
    if (["tilgangssetning", "afleiðingarsetning"].includes(t.sub)) {
      const verbs = inside.filter(finite);
      const want = t.sub === "tilgangssetning" ? "VH" : "FH";
      const own = verbs.filter((v) => !(v.u || []).includes("háttur"));
      assert.ok(own.length && own.some((v) => v.m.includes(`-${want}-`)), `${t.sub}, mood not shown: ${s.t}`);
    }
    /* the answer is the kind, or at the first step its main class */
    assert.ok(t.answer === t.sub || t.answer === groupOf(t.sub), `${t.answer} for ${t.sub}`);
  }
  assert.ok(seen.size > 450, `${seen.size} different clauses asked`);
});

test("gerd_tegund: at least 150 different questions at every step it declares", () => {
  assert.deepEqual(typeById("gerd_tegund").bands, [1, 4, 6]);
  for (const band of typeById("gerd_tegund").bands) {
    const n = distinct(KIND.get(band), sigKind);
    assert.ok(n >= 150, `þyngd ${band}: ${n} different questions`);
  }
});

test("gerd_tegund: three classes, then seven kinds, then nine with *svo að*", () => {
  for (const band of [1, 2, 3]) for (const t of KIND.get(band)) {
    assert.deepEqual(t.options, GROUPS);
    assert.equal(t.answer, groupOf(t.sub));
    assert.ok(t.s.lvl <= 5, `þyngd ${band}: a sentence of level ${t.s.lvl}`);
    assert.ok(!(t.s.cl.find((c) => c.a === t.span.from && c.b === t.span.to) || {}).n, "a clause inside the clause");
    assert.match(t.why, new RegExp(`\\*\\*${t.answer === "tilvísunarsetning" ? "Tilvísunarsetning" : t.answer === "fallsetning" ? "Fallsetning" : "Atvikssetning"}\\*\\*`));
  }
  for (const band of [4, 5]) for (const t of KIND.get(band)) {
    assert.deepEqual(t.options, SEVEN);
    assert.equal(t.answer, t.sub);
    assert.ok(t.s.lvl <= 6);
  }
  for (const band of [6, 7]) {
    for (const t of KIND.get(band)) { assert.deepEqual(t.options, NINE); assert.equal(t.answer, t.sub); }
    const answers = new Set(KIND.get(band).map((t) => t.answer));
    for (const k of NINE) assert.ok(answers.has(k), `þyngd ${band}: ${k} never asked`);
    assert.ok(KIND.get(band).some((t) => t.s.lvl === 7));
  }
  /* No class and no kind is the answer most of the time. */
  for (const [band, tasks] of KIND) {
    const by = {};
    tasks.forEach((t) => { by[t.answer] = (by[t.answer] || 0) + 1; });
    for (const [k, n] of Object.entries(by)) assert.ok(n / tasks.length < 0.55, `þyngd ${band}: ${k} ${n} of ${tasks.length}`);
  }
});

test("gerd_tegund: right, wrong, nothing picked — and purpose taken for result is its own pattern", () => {
  const t = KIND.get(4)[0];
  assert.equal(judge(t, { picked: t.answer }).ok, true);
  const w = judge(t, { picked: t.options.find((o) => o !== t.answer) });
  assert.equal(w.ok, false);
  assert.deepEqual(w.findings.map((f) => f.p), ["aukasetn_tegund"]);
  assert.equal(judge(t, {}).pending, true);
  assert.deepEqual(chancesIn(t), ["aukasetn_tegund"]);

  const purpose = KIND.get(6).find((x) => x.sub === "tilgangssetning");
  assert.deepEqual(judge(purpose, { picked: "afleiðingarsetning" }).findings.map((f) => f.p).sort(),
    ["aukasetn_tegund", "svo_ad"]);
  assert.deepEqual(judge(purpose, { picked: "tíðarsetning" }).findings.map((f) => f.p), ["aukasetn_tegund"]);
  assert.ok(chancesIn(purpose).includes("svo_ad"));
  const result = KIND.get(6).find((x) => x.sub === "afleiðingarsetning");
  assert.ok(judge(result, { picked: "tilgangssetning" }).findings.some((f) => f.p === "svo_ad"));
  assert.match(result.why, /framsöguhætti/);
  assert.match(purpose.why, /viðtengingarhætti/);
});

test("gerd_tegund: a review asks for the kind that was missed, at any þyngd, and not the same sentence", () => {
  for (const kind of NINE) {
    for (const band of [1, 4, 6]) {
      const v = viewAt(band, { force: { cell: "tegund:" + kind } });
      for (let i = 0; i < 12; i++) {
        const b = clKind(lex, v, seeded(i));
        assert.ok(b, `${kind} at þyngd ${band}: nothing built`);
        assert.equal(b.task.sub, kind);
        assert.equal(b.task.cell, "tegund:" + kind);
        assert.ok(b.task.options.includes(b.task.answer));
      }
    }
  }
  const first = clKind(lex, viewAt(4, { force: { cell: "tegund:orsakarsetning" } }), seeded(1)).task;
  for (let i = 0; i < 40; i++)
    assert.notEqual(clKind(lex, viewAt(4, { force: { cell: "tegund:orsakarsetning", avoid: first.s.t } }), seeded(i)).task.s.t, first.s.t);
  assert.equal(clKind(lex, viewAt(4, { force: { cell: "gerd:aukasetning" } }), seeded(1)), null);
});

/* ========================================================================
 * setn_lidir
 * ====================================================================== */

const PHR = new Map(BANDS.map((b) => [b, buildMany(synPhrase, b, N)]));
const NOMINAL = new Set(["no", "fn", "pfn", "abfn", "lo", "to", "töl", "raðnr", "gr", "person", "entity", "sérnafn"]);
const sigPhr = (t) => JSON.stringify([t.s.t, t.span.from, t.span.to, t.options, t.answer]);
const toksOf = (t) => t.s.tok.slice(t.span.from, t.span.to + 1);

test("setn_lidir: the answer is among the options, and the words underlined are that kind of phrase", () => {
  const seen = new Set();
  for (const [band, tasks] of PHR) {
    assert.equal(tasks.length, N, `þyngd ${band}: a build came back empty`);
    for (const t of tasks) {
      assert.ok(t.options.includes(t.answer));
      assert.equal(new Set(t.options).size, t.options.length);
      if (seen.has(sigPhr(t))) continue;
      seen.add(sigPhr(t));
      const toks = toksOf(t), s = t.s;
      const text = toks.map((x) => x.w).join(" ");
      assert.ok(toks.every((x) => !PUNCT.has(x.w) && x.c && !x.rj), `an unsettled word in "${text}": ${s.t}`);
      if (t.answer === "forsetningarliður") {
        assert.equal(toks[0].c, "forsetning", text);
        assert.ok(toks[0].pg, `no confirmed government: ${text}`);
        assert.ok(toks.length >= 2 && toks.slice(1).every((x) => NOMINAL.has(x.x)), text);
      } else if (t.answer === "nafnliður") {
        assert.ok(toks.every((x) => NOMINAL.has(x.x)), `${text}: ${s.t}`);
        assert.ok(toks.some((x) => ["nafnorð", "fornafn"].includes(x.c)), text);
        /* one head: two nouns side by side that are not head and genitive
           are two phrases ("gaf [litla barninu mjólk]") */
        assert.ok(toks.filter((x) => x.x === "no" && !/EF/.test(x.m || "")).length <= 1, `two heads: ${text}`);
        /* not the tail of something longer */
        const next = s.tok[t.span.to + 1], prev = s.tok[t.span.from - 1];
        assert.ok(!next || !NOMINAL.has(next.x), `${text} goes on: ${s.t}`);
        if (t.cell === "lidur:nli") assert.equal(prev.c, "forsetning");
        else assert.ok(!prev || prev.c !== "forsetning", `${text} stands after a preposition: ${s.t}`);
      } else if (t.answer === "sagnliður") {
        assert.ok(finite(toks[0]), text);
        assert.ok(toks.length >= 2);
        /* the narrow sagnliður: the verb and its objects or predicative,
           nothing adverbial, to the end of a one-clause sentence */
        assert.ok(toks.slice(1).every((x) => NOMINAL.has(x.x) || (x.x === "so" && !finite(x))), text);
        assert.ok(toks.some((x) => ["andlag", "óbeint andlag", "sagnfylling"].includes(x.r)), text);
        assert.equal(s.tok.filter(finite).length, 1, s.t);
        assert.equal(s.tok[t.span.to + 1].w, ".", s.t);
        assert.equal(s.tok[0].r, "frumlag", s.t);
      } else {
        assert.equal(t.answer, "atviksliður");
        assert.equal(toks.length, 1);
        assert.equal(toks[0].c, "atviksorð");
        assert.ok(!["ekki", "hvar", "hvenær", "hvernig", "áfram"].includes(low(toks[0].w)), text);
      }
    }
  }
  assert.ok(seen.size > 900, `${seen.size} different questions in all`);
});

test("setn_lidir: at least 150 different questions at every step it declares", () => {
  assert.deepEqual(typeById("setn_lidir").bands, [1, 3, 5]);
  for (const band of typeById("setn_lidir").bands) {
    const n = distinct(PHR.get(band), sigPhr);
    assert.ok(n >= 150, `þyngd ${band}: ${n} different questions`);
  }
});

test("setn_lidir: three kinds in short sentences, then four and the trap, then long sentences", () => {
  for (const band of [1, 2]) for (const t of PHR.get(band)) {
    assert.deepEqual(t.options, ["nafnliður", "sagnliður", "forsetningarliður"]);
    assert.ok(t.s.lvl <= 3);
    assert.notEqual(t.cell, "lidur:nli");
    /* a nafnliður is a noun, or a noun with its words: no pronoun alone */
    if (t.answer === "nafnliður") assert.ok(toksOf(t).some((x) => x.c === "nafnorð"), t.s.t);
  }
  for (const band of [3, 4]) {
    for (const t of PHR.get(band)) {
      assert.deepEqual(t.options, ["nafnliður", "sagnliður", "forsetningarliður", "atviksliður"]);
      assert.ok(t.s.lvl <= 5);
    }
    assert.ok(PHR.get(band).some((t) => t.answer === "atviksliður"));
    assert.ok(PHR.get(band).some((t) => t.cell === "lidur:nli"));
  }
  for (const band of [5, 6, 7]) {
    const long = PHR.get(band).filter((t) => t.s.lvl >= 4).length;
    assert.ok(long / N > 0.7, `þyngd ${band}: ${long} of ${N} in sentences of level 4 and up`);
    for (const t of PHR.get(band)) if (t.s.lvl < 4) assert.equal(t.answer, "sagnliður");
  }
  for (const [band, tasks] of PHR) {
    const by = {};
    tasks.forEach((t) => { by[t.answer] = (by[t.answer] || 0) + 1; });
    for (const [k, n] of Object.entries(by)) assert.ok(n / tasks.length < 0.5, `þyngd ${band}: ${k} ${n} of ${tasks.length}`);
  }
});

test("setn_lidir: the judge, and the nafnliður inside a forsetningarliður taken for the whole", () => {
  const t = PHR.get(1)[0];
  assert.equal(judge(t, { picked: t.answer }).ok, true);
  const w = judge(t, { picked: t.options.find((o) => o !== t.answer) });
  assert.equal(w.ok, false);
  assert.deepEqual(w.findings.map((f) => f.p), ["lidir"]);
  assert.equal(judge(t, {}).pending, true);
  const trap = PHR.get(3).find((x) => x.cell === "lidur:nli");
  assert.equal(trap.answer, "nafnliður");
  assert.deepEqual(judge(trap, { picked: "forsetningarliður" }).findings.map((f) => f.p).sort(), ["lidir", "lidir_fl"]);
  assert.ok(chancesIn(trap).includes("lidir_fl"));
  assert.match(trap.why, /inni í forsetningarliðnum/);
});

test("setn_lidir: a review asks for the kind of phrase that was missed", () => {
  for (const cell of ["lidur:nl", "lidur:fl", "lidur:sl", "lidur:al", "lidur:nli"]) {
    for (const band of [1, 3, 5]) {
      for (let i = 0; i < 10; i++) {
        const b = synPhrase(lex, viewAt(band, { force: { cell } }), seeded(i));
        assert.ok(b, `${cell} at þyngd ${band}`);
        assert.equal(b.task.cell, cell);
        assert.ok(b.task.options.includes(b.task.answer));
      }
    }
  }
  assert.equal(synPhrase(lex, viewAt(3, { force: { cell: "setn:frumlag" } }), seeded(1)), null);
});

/* ========================================================================
 * lid_finna
 * ====================================================================== */

const FIND = new Map(BANDS.map((b) => [b, buildMany(synFindPP, b, N)]));
const sigFind = (t) => JSON.stringify([t.s.t, t.targets]);

test("lid_finna: the words to click are every forsetningarliður of the sentence, and there is no other candidate", () => {
  for (const [band, tasks] of FIND) {
    assert.equal(tasks.length, N, `þyngd ${band}: a build came back empty`);
    for (const t of tasks) {
      assert.equal(t.type, "tap");
      const s = t.s, want = new Set(t.targets);
      /* runs of targets, each one a preposition and then fallorð only */
      const runs = [];
      t.targets.forEach((j) => { if (want.has(j - 1)) runs[runs.length - 1].push(j); else runs.push([j]); });
      assert.ok(runs.length === 1 || runs.length === 2, s.t);
      for (const r of runs) {
        assert.equal(s.tok[r[0]].c, "forsetning", s.t);
        assert.ok(r.length >= 2 && r.slice(1).every((j) => NOMINAL.has(s.tok[j].x)), s.t);
        const next = s.tok[r[r.length - 1] + 1];
        assert.ok(!next || !NOMINAL.has(next.x), `the phrase goes on: ${s.t}`);
        assert.ok(!next || !["sem", "og", "eða", "þar"].includes(low(next.w)), `the phrase may go on: ${s.t}`);
      }
      /* every preposition of the sentence opens one of them … */
      s.tok.forEach((x, j) => {
        if (x.c === "forsetning" || x.x === "fs") assert.ok(runs.some((r) => r[0] === j), `another preposition (${x.w}): ${s.t}`);
        /* … and no fixed phrase like *í gær* stands beside them */
        if (!want.has(j)) assert.ok(!x.w.includes(" "), `"${x.w}" looks like a second phrase: ${s.t}`);
      });
      assert.match(t.question, runs.length === 2 ? /tveir/ : /forsetningarliðnum/);
      assert.equal(t.what, runs.length === 2 ? "forsetningarliðirnir" : "forsetningarliðurinn");
    }
  }
});

test("lid_finna: at least 150 different questions at each step; two phrases and long sentences only from þyngd 4", () => {
  assert.deepEqual(typeById("lid_finna").bands, [1, 4]);
  for (const band of [1, 4]) {
    const n = distinct(FIND.get(band), sigFind);
    assert.ok(n >= 150, `þyngd ${band}: ${n} different questions`);
  }
  const two = (t) => t.question.includes("tveir");
  for (const band of [1, 2, 3]) for (const t of FIND.get(band)) { assert.ok(!two(t)); assert.ok(t.s.lvl <= 4); }
  for (const band of [4, 5, 6, 7]) {
    assert.ok(FIND.get(band).filter(two).length > N * 0.1, `þyngd ${band}: two phrases too rare`);
    assert.ok(FIND.get(band).filter((t) => t.s.lvl >= 5).length > N * 0.2);
  }
});

test("lid_finna: all the words and only they; a miss is filed under the phrases", () => {
  const t = FIND.get(4).find((x) => x.question.includes("tveir"));
  assert.equal(judge(t, { sel: [...t.targets] }).ok, true);
  const short = judge(t, { sel: t.targets.slice(1) });
  assert.equal(short.ok, false);
  assert.deepEqual(short.findings.map((f) => f.p), ["lidir"]);
  const other = t.s.tok.findIndex((x, j) => !t.targets.includes(j) && !PUNCT.has(x.w));
  assert.equal(judge(t, { sel: [...t.targets, other] }).ok, false);
  assert.equal(judge(t, { sel: [] }).pending, true);
  assert.equal(synFindPP(lex, viewAt(1, { force: { cell: "lidur:finna-fl" } }), seeded(1)).task.cell, "lidur:finna-fl");
  assert.equal(synFindPP(lex, viewAt(1, { force: { cell: "lidur:nl" } }), seeded(1)), null);
  /* The clause question's own tap still files its misses where it did. */
  const cl = typeById("gerd_finna").build(lex, viewAt(4), seeded(2)).task;
  assert.deepEqual(judge(cl, { sel: [cl.targets[0]] }).findings.map((f) => f.p), ["setningagerd"]);
});

/* ========================================================================
 * raeda
 * ====================================================================== */

const SPEECH = new Map(BANDS.map((b) => [b, buildMany(taskSpeech, b, N)]));
const sigSpeech = (t) => JSON.stringify([t.from, t.model]);
const hafa = lex.lookup("hafa", "so");

test("raeda: every model answer is the quote with *að*, the speaker and BÍN's subjunctive", () => {
  const seen = new Set();
  for (const [band, tasks] of SPEECH) {
    assert.equal(tasks.length, N, `þyngd ${band}: a build came back empty`);
    for (const t of tasks) {
      if (seen.has(sigSpeech(t))) continue;
      seen.add(sigSpeech(t));
      assert.equal(t.type, "umritun");
      assert.equal(t.kind, "indirect");
      const past = t.frame === "past";
      const m = /^(Hann|Hún) (sagði|segir): „(.+)“$/.exec(t.from);
      assert.ok(m, t.from);
      assert.equal(m[2], past ? "sagði" : "segir");
      assert.equal(m[3], t.s.t);
      assert.ok(t.model.startsWith(`${m[1]} ${m[2]} að `), t.model);
      assert.ok(t.answers.includes(t.model));
      /* without *að* is accepted too */
      assert.ok(t.answers.includes(t.model.replace(" að ", " ")), t.model);
      assert.ok(!/[„“]/.test(t.model) && !/\bég\b/i.test(t.model), t.model);
      /* the subjunctive the answer needs is of the frame's tense, 3rd person */
      for (const c of t.marks) assert.match(c.m, new RegExp(`^(GM|MM)-VH-${past ? "ÞT" : "NT"}-3P-(ET|FT)$`));
      assert.equal(t.cell, t.marks[0].m);
      assert.equal(t.word, t.marks[0].word);
      const words = low(t.model).replace(/\./g, "").split(" ");
      if (t.quote === "past") {
        /* *hefði farið* / *hafi farið*: hafa in the cell, then the supine of
           the quote's own verb, both as BÍN has them */
        const v = t.s.tok.find(finite);
        const e = lex.entryForToken(v);
        const aux = hafa.forms[t.marks[0].m];
        const at = words.findIndex((w) => aux.includes(w));
        assert.ok(at > 2, `${t.model}: no ${aux}`);
        assert.ok(e.forms[`${v.m.slice(0, 2)}-SAGNB`].includes(words[at + 1]), `${t.model}: supine of ${e.o}`);
        assert.match(v.m, /-FH-ÞT-/);
        assert.ok(!words.slice(3).includes(low(v.w)), `${t.model} keeps ${v.w}`);
      } else {
        for (const v of t.s.tok.filter(finite)) {
          assert.match(v.m, /-FH-NT-/, t.s.t);
          const e = lex.entryForToken(v);
          const cell = v.m.replace("-FH-NT-", `-VH-${past ? "ÞT" : "NT"}-`).replace("-1P-", "-3P-");
          assert.ok(e.forms[cell].some((f) => words.includes(f)), `${t.model}: ${cell} of ${e.o}`);
        }
      }
    }
  }
  assert.ok(seen.size > 400, `${seen.size} different questions in all`);
});

test("raeda: at least 150 different questions at each step; the quote in the past tense from þyngd 4", () => {
  assert.deepEqual(typeById("raeda").bands, [1, 4]);
  for (const band of [1, 4]) {
    const n = distinct(SPEECH.get(band), sigSpeech);
    assert.ok(n >= 150, `þyngd ${band}: ${n} different questions`);
  }
  for (const band of [1, 2, 3]) {
    assert.ok(SPEECH.get(band).every((t) => t.quote === "present"));
    /* both frames, so that *væri* and *sé* are both practised */
    const past = SPEECH.get(band).filter((t) => t.frame === "past").length / N;
    assert.ok(past > 0.35 && past < 0.65, `þyngd ${band}: ${Math.round(past * 100)}% after sagði`);
  }
  for (const band of [4, 5, 6, 7]) {
    const past = SPEECH.get(band).filter((t) => t.quote === "past").length / N;
    assert.ok(past > 0.6 && past < 0.9, `þyngd ${band}: ${Math.round(past * 100)}% past quotes`);
  }
  const t = SPEECH.get(4).find((x) => x.quote === "past");
  assert.match(t.why, /sagnbót/);
  assert.match(t.hint, /sagnbót/);
});

test("raeda: the judge takes the model, with and without *að*, and names what went wrong", () => {
  const t = SPEECH.get(1).find((x) => x.frame === "past" && /„Ég /.test(x.from));
  assert.equal(judge(t, { text: t.model }).ok, true);
  assert.equal(judge(t, { text: t.model.replace(" að ", " ") }).ok, true);
  assert.equal(judge(t, { text: "" }).pending, true);
  /* the quote copied with the indicative */
  const copied = `${t.speaker.charAt(0).toUpperCase() + t.speaker.slice(1)} sagði að ${t.speaker} ${t.s.t.replace(/^Ég /, "")}`;
  const w = judge(t, { text: copied });
  assert.equal(w.ok, false);
  assert.deepEqual(w.findings.map((f) => f.p).sort(), ["hattur", "obein_raeda"]);
  assert.ok(chancesIn(t).includes("obein_raeda") && chancesIn(t).includes("hattur"));
  /* a past quote answered with the simple subjunctive: *færi* for *hefði farið* */
  const p = SPEECH.get(4).find((x) => x.quote === "past" && x.frame === "past");
  assert.equal(judge(p, { text: p.model }).ok, true);
  const v = p.s.tok.find(finite);
  const e = lex.entryForToken(v);
  const simple = e.forms[v.m.replace("-FH-", "-VH-").replace("-1P-", "-3P-")][0];
  const aux = hafa.forms[p.marks[0].m][0];
  const sup = e.forms[`${v.m.slice(0, 2)}-SAGNB`][0];
  const wrong = p.model.replace(`${aux} ${sup}`, simple);
  assert.notEqual(wrong, p.model);
  const jw = judge(p, { text: wrong });
  assert.equal(jw.ok, false);
  assert.match(jw.detail.note || "", /sagnbót/);
});

test("raeda: Umritun's own indirect speech is what it was, and a review finds its kind", () => {
  /* The default is the sentence's own frame and a present-tense quote. */
  let n = 0;
  for (const s of lex.sentences) {
    const r = transformIndirect(lex, s);
    if (!r) continue;
    n++;
    assert.equal(r.quote, "present");
    assert.deepEqual(transformIndirect(lex, s, { frame: r.frame }).answers, r.answers);
    assert.ok(s.tok.filter(finite).every((v) => /-NT-/.test(v.m)), s.t);
  }
  assert.ok(n >= 90, `${n} sentences`);
  /* A sentence with a supine already, or an adverb after the verb, is not
     turned: *hefði ekki farið*, not *hefði farið ekki*. */
  for (const s of lex.sentences) {
    const r = transformIndirect(lex, s, { quote: "past", frame: "past" });
    if (!r) continue;
    const at = s.tok.findIndex(finite);
    assert.ok(!s.tok.some((x) => /SAGNB/.test(x.m || "")), s.t);
    assert.ok(s.tok[at + 1].c !== "atviksorð", s.t);
    assert.equal(s.tok.filter(finite).length, 1, s.t);
  }
  for (const kind of ["passive", "indirect", "question", "past"]) {
    for (let i = 0; i < 8; i++) {
      const b = taskTransform(lex, viewAt(4, { force: { cell: "umritun:" + kind } }), seeded(i));
      assert.ok(b && b.task.kind === kind, `umritun:${kind}`);
    }
  }
  assert.equal(taskTransform(lex, viewAt(4, { force: { cell: "NFET" } }), seeded(1)), null);
});

test("raeda: a review asks for the same subjunctive cell and the same verb", () => {
  const vera = lex.lookup("vera", "so");
  for (const cell of ["GM-VH-ÞT-3P-ET", "GM-VH-NT-3P-ET"]) {
    for (let i = 0; i < 10; i++) {
      const b = taskSpeech(lex, viewAt(1, { force: { cell, word: vera }, drillWord: vera }), seeded(i));
      assert.ok(b, cell);
      assert.ok(b.task.marks.some((c) => c.m === cell && c.word === "vera|so"), b.task.model);
    }
  }
  /* A drill on a noun has nothing to do here. */
  assert.equal(taskSpeech(lex, viewAt(1, { drillWord: lex.lookup("hestur", "kk") }), seeded(1)), null);
});

/* ========================================================================
 * All four: the queue, the catalogue, the curriculum, the lessons
 * ====================================================================== */

test("all four: a miss goes into the review queue and comes back as the thing missed", () => {
  const wrong = {
    gerd_tegund: (t) => ({ picked: t.options.find((o) => o !== t.answer) }),
    setn_lidir: (t) => ({ picked: t.options.find((o) => o !== t.answer) }),
    lid_finna: (t) => ({ sel: [t.targets[0]] }),
    raeda: () => ({ text: "Þetta er ekki rétt." }),
  };
  for (const id of Object.keys(wrong)) {
    const p = pupil(4);
    const v = makeView({ S: p.S, sess: p.sess, policy: POLICY, today: D0 });
    const t = typeById(id).build(lex, v, seeded(3)).task;
    t.typeId = id;
    const j = judge(t, wrong[id](t), p);
    assert.equal(j.ok, false, id);
    settle(p.S, p.sess, t, j);
    const e = p.S.review.items.find((x) => x.t === id);
    assert.ok(e, `${id}: nothing queued`);
    assert.equal(e.c, t.cell, id);
    const later = makeView({ S: p.S, sess: newSession(p.S), policy: POLICY, today: "2026-11-17" });
    const r = reviewTask(lex, later, seeded(9), e);
    assert.ok(r, `${id}: the review could not be built`);
    assert.equal(r.task.typeId, id);
    assert.equal(r.task.cell, t.cell, id);
    assert.ok(["both", "cell"].includes(r.hit), `${id}: ${r.hit}`);
  }
});

test("all four are in the curriculum switch, the map, the year-10 preset and the diagnosis", () => {
  const q = new Map(QUESTION_TYPES.map((x) => [x.id, x]));
  const where = { gerd_tegund: "setningagerd", setn_lidir: "setningafraedi", lid_finna: "setningafraedi", raeda: "malbeiting" };
  for (const [id, skill] of Object.entries(where)) {
    assert.equal(q.get(id).skill, skill);
    assert.equal(typeById(id).skill, skill);
    assert.ok(q.get(id).nm && q.get(id).ds.length > 20);
    /* year-10 material: on in the year-10 preset, off in the two below */
    assert.equal(presetPolicy(10).types[id], true, id);
    assert.equal(presetPolicy(9).types[id], false, id);
    assert.equal(presetPolicy(8).types[id], false, id);
  }
  assert.equal(typeById("raeda").renderer, "umritun");
  assert.equal(typeById("lid_finna").renderer, "tap");
  for (const [node, types, lesson] of [["gerd-tegundir", ["gerd_tegund"], "aukasetningar"],
    ["setn-lidir", ["setn_lidir", "lid_finna"], "lidir"], ["mb-raeda", ["raeda"], "raeda"]]) {
    const n = nodeById(node);
    assert.deepEqual(n.types, types);
    assert.equal(n.cover, "full");
    assert.equal(n.lesson, lesson);
    assert.equal(n.year, 10);
    assert.ok(!backlog(28).some((x) => x.id === node), `${node} is still in the backlog`);
  }
  /* What item 28 did not build stays in the backlog, honestly. */
  for (const node of ["or-ordhlutar", "st-n-nn", "st-y", "st-stor-stafur", "st-greinarmerki"])
    assert.ok(backlog(28).some((x) => x.id === node), node);
  for (const id of ["aukasetn_tegund", "svo_ad", "lidir", "lidir_fl", "obein_raeda"]) {
    const p = patternById(id);
    assert.ok(p, id);
    assert.ok(LESSONS.some((l) => l.id === p.lesson), `${id}: no page ${p.lesson}`);
    for (const t of p.types) assert.ok(typeById(t), `${id}: no type ${t}`);
  }
});

test("each question opens the Lesefni page that teaches it, and the three pages are whole", () => {
  assert.equal(lessonFor(KIND.get(1)[0]), "aukasetningar");
  assert.equal(lessonFor(PHR.get(1)[0]), "lidir");
  assert.equal(lessonFor(FIND.get(1)[0]), "lidir");
  assert.equal(lessonFor(SPEECH.get(1)[0]), "raeda");
  /* the older questions of the same categories keep their pages */
  assert.equal(lessonFor(typeById("clause").build(lex, viewAt(4), seeded(1)).task), "setningagerdir");
  assert.equal(lessonFor(typeById("setn_hlut").build(lex, viewAt(4), seeded(1)).task), "setningalidir");
  assert.equal(lessonFor(typeById("smidja").build(lex, viewAt(2), seeded(1)).task), "malbeiting");
  const ids = new Set(LESSONS.map((l) => l.id));
  for (const [id, skill] of [["aukasetningar", "setningagerd"], ["lidir", "setningafraedi"], ["raeda", "malbeiting"]]) {
    const l = LESSONS.find((x) => x.id === id);
    assert.ok(l, id);
    assert.equal(l.skill, skill);
    assert.ok(l.blocks.length >= 12 && l.check.length >= 5, id);
    for (const r of l.related) assert.ok(ids.has(r), `${id}: related page ${r}`);
  }
  /* The page names every kind the question can ask for, in bold. */
  const text = (id) => JSON.stringify(LESSONS.find((x) => x.id === id).blocks);
  for (const k of [...NINE, ...GROUPS]) assert.ok(text("aukasetningar").toLowerCase().includes(`**${k}**`), k);
  for (const k of ["nafnlið", "forsetningarlið", "sagnlið", "atvikslið"]) assert.ok(text("lidir").toLowerCase().includes(`**${k}`), k);
  /* The examples of the clause page that are bank sentences have the kind
     the page gives them. */
  const kindOf = (sentence) => (lex.sentences.find((s) => s.t === sentence).cl || []).map((c) => c.t);
  assert.deepEqual(kindOf("Ég gleymdi lyklunum svo að ég komst ekki inn."), ["afleiðingarsetning"]);
  assert.deepEqual(kindOf("Ég vaknaði snemma svo að ég kæmi ekki of seint."), ["tilgangssetning"]);
  assert.deepEqual(kindOf("Við töluðum lágt til þess að barnið gæti sofið."), ["tilgangssetning"]);
  assert.deepEqual(kindOf("Ég fór út þótt það væri kalt."), ["viðurkenningarsetning"]);
  assert.deepEqual(kindOf("Ef þú flýtir þér nærð þú strætó."), ["skilyrðissetning"]);
  assert.deepEqual(kindOf("Ég fór snemma heim af því að ég var veikur."), ["orsakarsetning"]);
  assert.deepEqual(kindOf("Pabbi spurði hvort ég væri búinn að læra."), ["spurnarsetning"]);
  assert.deepEqual(kindOf("Mamma heldur að ég sé svangur."), ["skýringarsetning"]);
  assert.deepEqual(kindOf("Kakan sem amma bakaði var mjög góð."), ["tilvísunarsetning"]);
});
