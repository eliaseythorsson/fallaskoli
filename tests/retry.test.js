/* Item 42: a second try before the answer is shown.
 *
 * core/answer.js decides (`retryAllowed`, `judgeRetry`, `hideAnswer`); the
 * screen's part is in ui/render.js and is driven in Chrome by
 * tools/browser-test.mjs. What is proved here, without a DOM:
 *
 *   1. which question types offer a second try — every builder in the
 *      registry, against the list in core/answer.js — and never in a duel;
 *   2. first try right, miss-then-right, miss-miss: what `settle` writes,
 *      played the way the screen plays it (`conclude` for the miss, then the
 *      retry as a follow-up), including the diagnosis and the review queue
 *      that app.finish writes from the miss;
 *   3. a right second try earns half of what a right answer earns now;
 *   4. the same try twice, an empty box, two forms: nothing is used up;
 *   5. the *af hverju* line shown before the answer does not contain it;
 *   6. the two new counters survive a reload and a sync. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, newSession, migrate, todayKey } from "../src/js/core/state.js";
import { SKILL_IDS } from "../src/js/core/skills.js";
import { createPolicy } from "../src/js/core/policy.js";
import { normalise } from "../src/js/core/grading.js";
import { noteDiagnosis } from "../src/js/core/diagnosis.js";
import { RETRY_XP } from "../src/js/core/leniency.js";
import { nextTask, makeView, applyEffects, TASKS } from "../src/js/tasks/index.js";
import { duelTasks, DUEL_TOPICS } from "../src/js/core/duel.js";
import { mergeStates } from "../src/js/core/merge.js";
import { cleanState } from "../server/guard.mjs";
import { judge, judgeRetry, retryAllowed, hideAnswer, settle, RETRY_TYPES, firstSaid }
  from "../src/js/core/answer.js";
import { show } from "./helpers.js";

const lex = buildLexicon(DATA);

function freshPupil() {
  const S = blankState();
  SKILL_IDS.forEach((id) => { S.enabled[id] = true; });
  return { S, sess: newSession(S) };
}

function builderCtx(pupil, diff = 3) {
  Object.keys(pupil.sess.diff).forEach((k) => { pupil.sess.diff[k] = diff; });
  const all = {};
  SKILL_IDS.forEach((id) => { all[id] = true; });
  return { lex, S: pupil.S, sess: pupil.sess, forcedNoun: null, run: {},
    policy: createPolicy(null, { skills: all, types: {}, levels: {}, attrs: {}, safeVocab: null }) };
}

/* A noun cloze, fixed: the genitive singular of *stóll*. */
const stoll = (m = "EFET") => {
  const e = lex.lookup("stóll", "kk");
  return { type: "fill", skill: "nafnord", n: e, m, answers: e.forms[m], paradigm: e.forms,
    base: 20, lvl: 1, cell: m, word: "stóll|kk",
    why: `Forsetningin *til* stýrir eignarfalli: *til ${e.forms[m][0]}*.` };
};
const form = (m) => lex.lookup("stóll", "kk").forms[m][0];

/** What app.finish does with the miss that `settle` reports: the diagnosis
    (the review queue is written by `settle` itself). */
function finishLike(S, task, extra) {
  if (!extra) return [];
  return noteDiagnosis(S, task, extra.findings, extra.correct ?? null, todayKey());
}

/** One question played as the screen plays it. `second` is the text of the
    second try, or null for a pupil who gives up ("Sýna svarið"). */
function play(pupil, task, first, second = undefined) {
  const { S, sess } = pupil;
  const j1 = judge(task, { text: first }, pupil);
  const extra = settle(S, sess, task, j1, { ms: 1000 });
  finishLike(S, task, extra);
  const out = { j1, extra, allowed: retryAllowed(task, j1) };
  if (!out.allowed || second === undefined) return out;
  task.retried = true;
  if (second === null) return out;
  const snapshot = JSON.stringify({ diag: S.diag, review: S.review, cells: S.cells, words: S.words,
    difficulty: S.difficulty, total: S.totalAnswers, correct: S.totalCorrect, run: S.run, sdiff: sess.diff });
  out.j2 = judgeRetry(task, { text: second }, { text: first }, pupil);
  out.extra2 = settle(S, sess, task, out.j2, { ms: 1000 });
  out.untouched = snapshot === JSON.stringify({ diag: S.diag, review: S.review, cells: S.cells, words: S.words,
    difficulty: S.difficulty, total: S.totalAnswers, correct: S.totalCorrect, run: S.run, sdiff: sess.diff });
  return out;
}

/* ========================================================================
 * 1. Which types, and never in a duel
 * ====================================================================== */

const TYPED = new Set(["fill", "verb", "verbslot", "gap", "umritun", "smidja"]);

/** A wrong response for each type, enough to be judged wrong. */
function wrongFor(t) {
  switch (t.type) {
    case "fill": case "verb": case "verbslot": case "gap": return { text: t.answers[0] + "xq" };
    case "umritun": return { text: t.from || t.s.t };
    case "smidja": return { text: "xq zz yy" };
    case "slots": return t.options
      ? { picked: t.options.find((o) => o !== t.answer), texts: t.slots.map((sl) => sl.accepted[0]) }
      : { texts: t.slots.map((sl, k) => (k ? sl.accepted[0] : "xxrangt")) };
    case "kenni": return { picked: t.options.find((o) => o !== t.answer), text: t.askGen ? t.gen[0] : undefined };
    case "govern": return { picked: ["NF", "ÞF", "ÞGF", "EF"].find((k) => k !== t.fall) };
    case "indecl": return { picked: ["atviksorð", "forsetning", "samtenging"].find((o) => o !== t.answer) };
    case "clause": return { picked: t.options.find((o) => o !== t.answer) };
    case "choice": return { picked: t.options.find((o) => o !== t.answer), picked2: t.second && t.second.answer };
    case "villur": return { edits: {} };
    case "sort": {
      const picks = Object.fromEntries(t.items.map((it, k) => [k, it.cls]));
      picks[0] = t.buckets.find((b) => b !== t.items[0].cls);
      return { picks };
    }
    case "tap": {
      const k = t.s.tok.findIndex((x, j) => /\p{L}/u.test(x.w) && !t.targets.includes(j));
      return k < 0 ? null : { sel: [...t.targets, k] };
    }
    case "table": return { cells: (t.cells || []).map(() => "xq") };
    default: return null;
  }
}

function realTasks(n = 4, diffs = [2, 5]) {
  const out = [];
  for (const diff of diffs) {
    const ctx = builderCtx(freshPupil(), diff);
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
const BANK = realTasks();

test("a second try is offered for written answers only, decided type by type", () => {
  const seen = new Map();
  for (const t of BANK) {
    const r = wrongFor(t);
    if (!r) continue;
    const j = judge(t, r);
    if (j.pending || j.ok !== false) continue;
    const want = TYPED.has(t.type) || (t.type === "slots" && !t.options);
    assert.equal(retryAllowed(t, j), want, `${t.typeId} (${t.type}${t.options ? ", with options" : ""})`);
    seen.set(`${t.type}${t.type === "slots" ? (t.options ? "+opts" : "") : ""}`, want);
  }
  /* Every typed type and every refused shape actually came up. */
  for (const k of ["fill", "verb", "verbslot", "gap", "umritun", "slots", "slots+opts", "kenni", "choice",
                   "govern", "table", "villur", "smidja"])
    assert.ok(seen.has(k), `no ${k} task in the bank`);
  assert.deepEqual(Object.keys(RETRY_TYPES).sort(), ["fill", "gap", "slots", "smidja", "umritun", "verb", "verbslot"]);
  /* Villuveiðar and the table stay without one, on purpose (core/answer.js §7). */
  assert.ok(!("villur" in RETRY_TYPES) && !("table" in RETRY_TYPES));
});

test("a right answer, a pending one and an answer already retried are not offered a second try", () => {
  const t = stoll();
  assert.equal(retryAllowed(t, judge(t, { text: form("EFET") })), false);
  assert.equal(retryAllowed(t, judge(t, { text: "" })), false);
  assert.equal(retryAllowed(t, judge(t, { text: `${form("EFET")} ${form("NFET")}` })), false);
  const miss = judge(t, { text: form("NFET") });
  assert.equal(retryAllowed(t, miss), true);
  assert.equal(retryAllowed({ ...t, retried: true }, miss), false, "only one second try");
});

test("never in a duel: every duel question is one attempt", () => {
  const deps = { nextTask, makeView, applyEffects, blankState, newSession, createPolicy };
  let typed = 0;
  for (const topic of DUEL_TOPICS) {
    for (const seed of [11, 12]) {
      const tasks = duelTasks(lex, { id: "d", a: "A", b: "B", topic: topic.id, n: 10, seed, level: 4,
        created: 0, deadline: 1, res: { a: null, b: null } }, deps);
      for (const t of tasks) {
        assert.equal(t.duel, true, `${topic.id}: a duel question not marked as one`);
        const r = wrongFor(t);
        if (!r) continue;
        const j = judge(t, r);
        if (j.pending || j.ok !== false) continue;
        assert.equal(retryAllowed(t, j), false, `${topic.id}/${t.type}: a second try in a duel`);
        /* The duel mark is what refuses it: the same question outside a duel
           would have offered one. */
        if (TYPED.has(t.type)) { typed++; assert.equal(retryAllowed({ ...t, duel: false }, j), true); }
      }
    }
  }
  assert.ok(typed > 5, `too few written duel questions to prove anything (${typed})`);
});

/* ========================================================================
 * 2–3. What is recorded, and the XP
 * ====================================================================== */

test("first try right: one answer, full XP, no second try, nothing queued", () => {
  const p = freshPupil();
  const t = stoll();
  const r = play(p, t, form("EFET"), "irrelevant");
  assert.equal(r.j1.ok, true);
  assert.equal(r.allowed, false);
  assert.equal(r.j2, undefined);
  assert.equal(p.S.xp, r.j1.xp);
  assert.ok(r.j1.xp > 0);
  assert.equal(p.S.totalAnswers, 1);
  assert.equal(p.S.totalCorrect, 1);
  assert.equal(p.S.run, 1);
  assert.equal(p.S.review.items.length, 0);
  assert.equal(p.S.counters.retries, 0);
  assert.equal(p.S.counters.retryFixed, 0);
});

test("miss then right: the miss is recorded, diagnosed and queued; the retry adds half XP and nothing else", () => {
  const p = freshPupil();
  const t = stoll();
  const r = play(p, t, form("NFET"), form("EFET"));
  const { S } = p;
  /* The miss, written at the first try, exactly as without a retry. */
  assert.equal(r.j1.ok, false);
  assert.equal(r.allowed, true);
  assert.equal(r.extra.correct, false);
  assert.deepEqual(r.j1.findings.map((f) => f.p), ["ef"]);
  assert.equal(S.diag.ef.w, 1, "the diagnosis has the miss");
  assert.equal(S.review.items.length, 1, "the review queue has the miss");
  assert.equal(S.review.items[0].c, "EFET");
  assert.equal(S.cells.EFET.w, 1);
  assert.equal(S.cells.EFET.c, 0);
  assert.equal(S.words["stóll|kk"].w, 1);
  assert.ok(S.difficulty.nafnord.h.endsWith("0"), "the difficulty saw a miss");
  /* The second try. */
  assert.equal(r.j2.ok, true);
  assert.equal(r.j2.retry, true);
  assert.equal(r.j2.finish, null, "a second try does not end a second question");
  assert.equal(r.extra2, null);
  assert.ok(r.untouched, "the retry changed a record, the run, the difficulty, the diagnosis or the queue");
  assert.deepEqual(r.j2.effects.map((e) => e.do).sort(), ["count", "count", "grant"]);
  assert.equal(S.counters.retries, 1);
  assert.equal(S.counters.retryFixed, 1);
  assert.equal(S.totalAnswers, 1, "still one answer");
  assert.equal(S.totalCorrect, 0, "and it was wrong");
  assert.equal(S.run, 0);
  /* Half of what a right answer earns now — the same pupil, the same moment. */
  const now = judge(t, { text: form("EFET") }, p);
  assert.ok(now.xp > 1);
  assert.equal(r.j2.xp, Math.max(1, Math.round(now.xp * RETRY_XP)));
  assert.equal(S.xp, r.j2.xp, "the only XP is the retry's");
  assert.equal(S.skills.nafnord.xp, r.j2.xp);
  assert.equal(S.days[todayKey()].xp, r.j2.xp);
  /* The queue entry is not passed by the retry: due tomorrow, as any miss. */
  assert.equal(S.review.items[0].s, 0);
  assert.notEqual(S.review.items[0].due, todayKey());
});

test("miss then miss: no XP, the counter of tries, and nothing else", () => {
  const p = freshPupil();
  const t = stoll();
  const r = play(p, t, form("NFET"), form("ÞGFET"));
  assert.equal(r.j2.ok, false);
  assert.equal(r.j2.xp, 0);
  assert.deepEqual(r.j2.effects, [{ do: "count", counter: "retries" }]);
  assert.ok(r.untouched);
  assert.equal(p.S.counters.retries, 1);
  assert.equal(p.S.counters.retryFixed, 0);
  assert.equal(p.S.xp, 0);
  assert.equal(p.S.diag.ef.w, 1, "the second miss is not diagnosed again");
  assert.equal(p.S.review.items.length, 1);
});

test("giving up (Sýna svarið) leaves exactly the miss", () => {
  const p = freshPupil();
  const r = play(p, stoll(), form("NFET"), null);
  assert.equal(p.S.counters.retries, 0);
  assert.equal(p.S.totalAnswers, 1);
  assert.equal(p.S.review.items.length, 1);
  assert.equal(r.j2, undefined);
});

test("the XP halves, whatever the pupil's history and whatever is forgiven", () => {
  const p = freshPupil();
  p.S.run = 9;
  p.S.skills.nafnord = { xp: 500, c: 30, w: 4, bestRun: 9 };
  const t = stoll();
  settle(p.S, p.sess, t, judge(t, { text: form("NFET") }, p));
  for (const [text, hinted] of [[form("EFET"), false], [form("EFET").replace("ó", "o"), false], [form("EFET"), true]]) {
    const now = judge(t, { text, hinted }, p);
    const j2 = judgeRetry(t, { text, hinted }, { text: form("NFET") }, p);
    assert.equal(j2.ok, true, text);
    assert.equal(j2.xp, Math.max(1, Math.round(now.xp * RETRY_XP)), `${text}${hinted ? " (hint)" : ""}`);
    assert.ok(j2.xp < now.xp);
  }
});

test("the same try again, an empty box or two forms use nothing up", () => {
  const p = freshPupil();
  const t = stoll();
  const first = { text: form("NFET") };
  for (const text of [form("NFET"), `  ${form("NFET").toUpperCase()} `, "", `${form("EFET")} ${form("NFET")}`]) {
    const j = judgeRetry(t, { text }, first, p);
    assert.equal(j.pending, true, JSON.stringify(text));
    assert.deepEqual(j.effects, []);
  }
  assert.equal(judgeRetry(t, { text: form("NFET") }, first, p).verdict, "same");
  assert.equal(firstSaid({ texts: ["Lestu", "lesið"] }), "lestu lesið");
});

test("every written type: a right second try is half, a wrong one nothing; no record either way", () => {
  let n = 0;
  for (const t of BANK) {
    const r = wrongFor(t);
    if (!r) continue;
    const p = freshPupil();
    const j1 = judge(t, r, p);
    if (!retryAllowed(t, j1)) continue;
    settle(p.S, p.sess, t, j1);
    const right = t.type === "slots" ? { texts: t.slots.map((sl) => sl.accepted[0]) } : { text: t.answers[0] };
    const now = judge(t, right, p);
    const j2 = judgeRetry(t, right, r, p);
    assert.equal(j2.ok, true, t.typeId);
    assert.equal(j2.xp, now.xp > 0 ? Math.max(1, Math.round(now.xp * RETRY_XP)) : 0, t.typeId);
    assert.ok(!j2.effects.some((e) => ["record", "bump", "tally"].includes(e.do)), t.typeId);
    const again = judgeRetry(t, r.text != null ? { text: r.text + "zz" } : { texts: r.texts.map((x) => x + "zz") }, r, p);
    assert.equal(again.ok, false, t.typeId);
    assert.equal(again.xp, 0, t.typeId);
    n++;
  }
  assert.ok(n >= 10, `only ${n} written tasks were tried`);
});

test("Setningasmiðja (review S7): one card wrong, then right — the card's miss stays on record, the retry is half XP and records nothing", () => {
  let n = 0;
  for (const t of BANK.filter((x) => x.type === "smidja")) {
    const words = t.answers[0].split(" ");
    const k = t.cards.findIndex((c) => !c.fixed && c.answers[0] !== c.text && words.includes(c.answers[0]));
    if (k < 0) continue;
    const c = t.cards[k];
    const first = words.map((w) => (w === c.answers[0] ? c.text : w)).join(" ");      // the card's dictionary form
    const p = freshPupil();
    const j1 = judge(t, { text: first }, p);
    if (j1.ok !== false) continue;
    assert.equal(retryAllowed(t, j1), true, t.typeId);
    assert.ok(!j1.detail.g.per[k].ok, "the card that was not inflected is the one marked");
    settle(p.S, p.sess, t, j1);
    const after1 = JSON.stringify({ cells: p.S.cells, words: p.S.words, total: p.S.totalAnswers, review: p.S.review });
    assert.equal(p.S.cells[c.m].w >= 1, true, "the miss is recorded on the card's cell");
    const j2 = judgeRetry(t, { text: t.answers[0] }, { text: first }, p);
    assert.equal(j2.ok, true);
    assert.equal(j2.xp, Math.max(1, Math.round(judge(t, { text: t.answers[0] }, p).xp * RETRY_XP)));
    settle(p.S, p.sess, t, j2);
    assert.equal(JSON.stringify({ cells: p.S.cells, words: p.S.words, total: p.S.totalAnswers, review: p.S.review }), after1,
      "the second try wrote a record");
    n++;
  }
  assert.ok(n > 0, "no Setningasmiðja in the bank had a card to get wrong");
});

/* ========================================================================
 * 5. The rule shown before the answer does not give it away
 * ====================================================================== */

test("hideAnswer takes out the answer, whole words only, in any capitals", () => {
  const t = { answers: ["tvennar", "fyrir utan"] };
  assert.equal(hideAnswer("Töluorðið líka: **tvennar**.", t), "Töluorðið líka: **…**.");
  assert.equal(hideAnswer("Tvennar buxur, ekki tvær.", t), "… buxur, ekki tvær.");
  assert.equal(hideAnswer("Orðið tvennarnir er ekki til.", t), "Orðið tvennarnir er ekki til.");
  assert.equal(hideAnswer("Hann stóð fyrir utan húsið.", t), "Hann stóð … húsið.");
  assert.equal(hideAnswer("tvennar tvennar", t), "… …");
  assert.equal(hideAnswer("", t), "");
  assert.equal(hideAnswer(null, t), null);
  /* A slot's forms count too. */
  assert.equal(hideAnswer("Skipunin er *lestu*!", { slots: [{ accepted: ["lestu"] }] }), "Skipunin er *…*!");
});

test("on real questions, no answer is left in the rule shown before it", () => {
  let masked = 0;
  for (const t of BANK) {
    if (!(t.type in RETRY_TYPES) || !t.why) continue;
    const shown = normalise(hideAnswer(t.why, t));
    const answers = [...(t.answers || []), ...(t.slots || []).flatMap((sl) => sl.accepted)];
    for (const a of answers) {
      const words = shown.split(" ");
      const parts = normalise(a).split(" ");
      const at = words.findIndex((_, k) => parts.every((p, i) => words[k + i] === p));
      assert.equal(at, -1, `${t.typeId}: "${a}" is still in "${t.why}"`);
    }
    if (shown !== normalise(t.why)) masked++;
  }
  assert.ok(masked > 0, "no rule in the bank quoted its answer — the test proves nothing");
});

/* ========================================================================
 * 6. The counters are kept
 * ====================================================================== */

test("the retry counters survive a reload, a merge between devices and the server's guard", () => {
  const S = blankState();
  S.counters.retries = 5;
  S.counters.retryFixed = 3;
  const back = migrate(JSON.parse(JSON.stringify(S)));
  assert.equal(back.counters.retries, 5);
  assert.equal(back.counters.retryFixed, 3);
  const base = blankState();
  const other = blankState();
  other.counters.retries = 2;
  other.counters.retryFixed = 1;
  const m = mergeStates(base, back, other);
  assert.equal(m.counters.retries, 7);
  assert.equal(m.counters.retryFixed, 4);
  const g = cleanState(JSON.parse(JSON.stringify(m)));
  assert.equal(g.counters.retries, 7);
  assert.equal(g.counters.retryFixed, 4);
  /* An old state without them reads as none. */
  const old = JSON.parse(JSON.stringify(blankState()));
  delete old.counters.retries; delete old.counters.retryFixed;
  assert.equal(migrate(old).counters.retries, 0);
});
