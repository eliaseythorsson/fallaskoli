/* The spacing rule (#10, docs/DLD-PLAN.md §1): the same word is never asked
   in the same question type in two consecutive questions. The same word in
   another type may come straight after, and there is no wait in days.

   Until #10 this file tested the gate of core/spacing.js — never the same
   word twice in a day, never within a week, a month after two showings, new
   words first — kept in `S.vocab`. DLD-PLAN §1 drops that gate (a pupil with
   DLD needs to meet a word again soon, not to be kept from it), so those
   tests went with it; what they guarded against — "Kvöld four times in a
   row" — is held below by the rule that replaces them, over many seeded
   sessions, drills, "Þrjár í röð" and duels. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { simulate } from "../tools/sim/sim.mjs";
import { rightResponse, wrongResponse, show, viewOf } from "./helpers.js";
import { seeded, duelPlan, duelTasks } from "../src/js/core/duel.js";
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, newSession, migrate } from "../src/js/core/state.js";
import { SKILL_IDS } from "../src/js/core/skills.js";
import { createPolicy } from "../src/js/core/policy.js";
import { wordsOf } from "../src/js/core/wordknowledge.js";
import { nextTask, buildTask, drillTask, DRILL_PLAN, streakTasks, makeView, applyEffects }
  from "../src/js/tasks/index.js";

const lex = buildLexicon(DATA);
const TODAY = "2026-03-10";

/** Does `b` repeat `a`: the same type, and a word in common? */
const repeats = (a, b) => (a.typeId || a.type) === (b.typeId || b.type) &&
  wordsOf(a).some((w) => wordsOf(b).includes(w));

function ctx(diff = 3) {
  const S = blankState();
  SKILL_IDS.forEach((id) => { S.enabled[id] = true; });
  const sess = newSession(S, TODAY);
  Object.keys(sess.diff).forEach((k) => { sess.diff[k] = diff; });
  const all = {};
  SKILL_IDS.forEach((id) => { all[id] = true; });
  return { lex, S, sess, forcedNoun: null,
    policy: createPolicy(null, { skills: all, types: {}, levels: {}, attrs: {}, safeVocab: null }) };
}
const KVOLD = { o: "kvöld", c: "hk", r: 10, forms: {} };
const MORGUNN = { o: "morgunn", c: "kk", r: 20, forms: {} };

/* ---------- the view: where the rule lives ----------------------------------- */

test("the view leaves out the word the last question asked in this type, and only in this type", () => {
  const c = ctx();
  c.sess.lastAsked = { type: "fill", words: ["kvöld|hk"] };
  const fill = viewOf(c, { typeId: "fill", today: TODAY });
  const table = viewOf(c, { typeId: "tbl_no", today: TODAY });
  assert.equal(fill.justAsked("kvöld|hk"), true);
  assert.equal(table.justAsked("kvöld|hk"), false, "another type may ask it straight away");
  const picked = new Set(), other = new Set();
  for (let s = 0; s < 200; s++) {
    picked.add(fill.pickByWord(lex, [KVOLD, MORGUNN], (x) => x, "nafnord", seeded(s)).o);
    other.add(table.pickByWord(lex, [KVOLD, MORGUNN], (x) => x, "nafnord", seeded(s)).o);
  }
  assert.deepEqual([...picked], ["morgunn"]);
  assert.deepEqual([...other].sort(), ["kvöld", "morgunn"]);
  /* nothing else in the pool: no question of this type now (null), as with an empty pool */
  assert.equal(fill.pickByWord(lex, [KVOLD], (x) => x, "nafnord", seeded(1)), null);
  assert.equal(fill.pickWord(lex, [KVOLD, MORGUNN], "nafnord", seeded(1), ["kk", "kvk", "hk"]).o, "morgunn");
  /* a sentence with the word in it weighs nothing (tasks/greining.js) */
  assert.equal(fill.wordBoost(["kvöld|hk", "vera|so"]), 0);
  assert.equal(table.wordBoost(["kvöld|hk"]), 1);
  assert.equal(fill.wordBoost(["vera|so"]), 1);
});

test("a word that must be asked (a drill, a review) is not asked in the type it just had", () => {
  const c = ctx();
  c.sess.lastAsked = { type: "tbl_no", words: ["kvöld|hk"] };
  const must = { word: KVOLD, strict: true };
  assert.equal(viewOf(c, { typeId: "tbl_no", mustAsk: must }).pickWord(lex, [MORGUNN], "nafnord", seeded(1), ["hk"]), null);
  assert.equal(viewOf(c, { typeId: "fill", mustAsk: must }).pickWord(lex, [MORGUNN], "nafnord", seeded(1), ["hk"]), KVOLD);
  assert.equal(viewOf(c, { typeId: "tbl_no", mustAsk: must })
    .repeatsLast({ typeId: "tbl_no", word: "kvöld|hk" }), true);
  assert.equal(viewOf(c).repeatsLast({ typeId: "parse", word: "kvöld|hk" }), false);
});

test("the session remembers the question it showed, and a new session remembers nothing", () => {
  const c = ctx();
  assert.equal(newSession(c.S, TODAY).lastAsked, null);
  const t = show(c, (l, v, r) => buildTask(l, v, r, "tbl_no"), seeded(3));
  assert.ok(t.word);
  assert.deepEqual(c.sess.lastAsked, { type: "tbl_no", words: [t.word] });
});

/* ---------- no wait in days ----------------------------------------------------- */

test("no wait in days: a word may come back in the same type later the same day", () => {
  /* The old gate: "kom fyrir í dag" — never twice on one day, never within a
     week. Now only the very next question of the type is barred. */
  const c = ctx();
  c.sess.seen = ["kvöld", "hestur"];      // the meaning question asks words met this session first
  const first = show(c, (l, v, r) => buildTask(l, v, r, "meaning"), seeded(1));
  assert.ok(first);
  /* straight after: never the same word */
  for (let s = 0; s < 30; s++) {
    const b = buildTask(lex, viewOf(c, { today: TODAY }), seeded(100 + s), "meaning");
    assert.notEqual(b.task.word, first.word, "the same word twice in a row in the meaning question");
  }
  /* one question of another type between: the same word may come again, today */
  c.sess.lastAsked = { type: "fill", words: [] };
  const again = new Set();
  for (let s = 0; s < 30; s++) again.add(buildTask(lex, viewOf(c, { today: TODAY }), seeded(200 + s), "meaning").task.word);
  assert.ok(again.has(first.word), "the word is still kept away after another question");
});

test("progress saved with the old record (S.vocab) loads without it", () => {
  const S = migrate({ xp: 10, days: {}, words: {}, vocab: { "kvöld|hk": { n: 3, dates: ["2026-03-01"], first: "2026-03-01", last: "2026-03-01" } } });
  assert.equal("vocab" in S, false);
  assert.equal(S.xp, 10);
});

/* ---------- the rule over many seeded sessions ------------------------------------ */

const respond = (t, knows) => {
  if (knows) return rightResponse(t);
  if (t.type === "syntax") return { picked: t.s.tok.findIndex((x) => x.r !== t.askRole) };
  return wrongResponse(t);
};
/** Consecutive questions of one session that share a word and a type. */
function breaches(log) {
  const out = [];
  for (let i = 1; i < log.length; i++) {
    const a = log[i - 1], b = log[i];
    if (a.d !== b.d || a.r !== b.r || a.type !== b.type) continue;
    const common = (a.words || []).filter((w) => (b.words || []).includes(w));
    if (common.length) out.push(`day ${b.d} session ${b.r} question ${b.i}: ${b.type} ${common.join(",")}`);
  }
  return out;
}

test("no two consecutive questions share both word and type: seeded sessions, every skill and each alone", () => {
  /* tools/sim/sim.mjs runs the session as app.pickTask does — opening
     reviews, a missed cloze's noun three to five questions on, pattern
     targeting — and answers through core/answer.js `judge` and `settle`.
     Mixed: 6 pupils × 3 days × 2 sessions of 12. Each skill alone, where a
     small pool makes a repeat likeliest: 1 pupil × 2 days × 2 sessions. */
  let pairs = 0, sameWordOtherType = 0;
  const all = [];
  for (let p = 0; p < 6; p++)
    all.push(simulate({ respond, allSkills: true, ability: p % 2 ? 0.5 : 0.85, days: 3, perDay: 2, size: 12,
      seed: 700 + p, builderRng: seeded(7100 + p) }));
  for (const [k, topic] of SKILL_IDS.entries())
    all.push(simulate({ respond, allSkills: true, topic, ability: 0.6, days: 2, perDay: 2, size: 12,
      seed: 800 + k, builderRng: seeded(8100 + k) }));
  const bad = [];
  for (const r of all) {
    bad.push(...breaches(r.log));
    for (let i = 1; i < r.log.length; i++) {
      const a = r.log[i - 1], b = r.log[i];
      if (a.d !== b.d || a.r !== b.r) continue;
      pairs++;
      if (a.type !== b.type && a.words.some((w) => b.words.includes(w))) sameWordOtherType++;
    }
  }
  assert.ok(pairs > 600, `only ${pairs} pairs of questions`);
  assert.deepEqual(bad, []);
  /* The rule forbids the pair, not the word: it still comes straight back in another type. */
  assert.ok(sameWordOtherType > 0, "a word never came straight back in another type");
});

test("the rule holds with the session's own chooser alone, over 40 seeds of 30 questions", () => {
  /* tasks/next.js without the review queue: what a duel's plan, the tour and
     a drill fall back on. A narrow policy (one skill) makes repeats likeliest. */
  const bad = [];
  for (let s = 0; s < 40; s++) {
    const c = ctx(1 + (s % 5));
    const topic = SKILL_IDS[s % SKILL_IDS.length];
    const only = {};
    SKILL_IDS.forEach((id) => { only[id] = id === topic || s % 3 === 0; });
    c.policy = createPolicy(null, { skills: only, types: {}, levels: {}, attrs: {}, safeVocab: null });
    const rng = seeded(5000 + s);
    let prev = null;
    for (let q = 0; q < 30; q++) {
      const t = show(c, nextTask, rng);
      if (!t) break;
      if (prev && repeats(prev, t)) bad.push(`seed ${s} (${topic}) question ${q}: ${t.typeId} ${wordsOf(t)}`);
      prev = t;
    }
  }
  assert.deepEqual(bad, []);
});

test("a rescue drill never asks its word in the same type twice in a row", () => {
  const bad = [];
  for (const cls of Object.keys(DRILL_PLAN)) {
    const words = (lex.byClass[cls] || []).slice(0, 3);
    for (const w of words) {
      const c = ctx();
      let prev = null;
      for (let turn = 0; turn < 14; turn++) {
        const t = show(c, drillTask, seeded(turn * 31 + w.r), w, turn);
        if (!t) break;
        if (prev && repeats(prev, t)) bad.push(`${w.o} (${cls}) turn ${turn}: ${t.typeId}`);
        prev = t;
      }
    }
  }
  assert.deepEqual(bad, []);
});

test("\"Þrjár í röð\": the three, and the question missed before them, never repeat one another", () => {
  const bad = [];
  let built = 0;
  for (const [p, from] of [["thf_thgf", "fill"], ["tala", "fill"], ["ending", "verb"], ["hljodvarp", "tbl_no"],
    ["sogn_frumlag", "verbslot"], ["merking", "or_heiti"]]) {
    for (let s = 0; s < 6; s++) {
      const c = ctx(3);
      const missed = show(c, (l, v, r) => buildTask(l, v, r, from), seeded(60 + s));
      if (!missed) continue;
      const three = streakTasks(lex, viewOf(c, { today: TODAY }), seeded(90 + s), p, missed);
      if (!three) continue;
      built++;
      const seq = [missed, ...three.map((b) => b.task)];
      for (let i = 1; i < seq.length; i++) if (repeats(seq[i - 1], seq[i])) bad.push(`${p} seed ${s} #${i}: ${seq[i].typeId}`);
    }
  }
  assert.ok(built >= 10, `only ${built} runs of three built`);
  assert.deepEqual(bad, []);
});

test("a duel's plan and each player's questions never repeat word and type in a row", () => {
  const deps = { nextTask, buildTask, makeView, applyEffects, blankState, newSession, createPolicy };
  const duelLex = buildLexicon(DATA, { hide: new Set(DATA.blocked || []) });
  const bad = [];
  for (const topic of ["blandad", "nafnord", "sagnord", "ordaford", "fornofn"]) {
    for (let s = 0; s < 4; s++) {
      const d = { id: "d", a: "A", b: "B", topic, n: 10, seed: 31 + s, level: 1 + s, created: 0, deadline: 1, res: { a: null, b: null } };
      const seqs = { plan: duelPlan(duelLex, d, deps), a: duelTasks(duelLex, { ...d, side: "a", key: 11 }, deps),
        b: duelTasks(duelLex, { ...d, side: "b", key: 22 }, deps) };
      for (const [who, seq] of Object.entries(seqs))
        for (let i = 1; i < seq.length; i++) if (repeats(seq[i - 1], seq[i])) bad.push(`${topic} seed ${s} ${who} #${i}: ${seq[i].typeId}`);
    }
  }
  assert.deepEqual(bad, []);
});
