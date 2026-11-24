/* v6.7: duels — the rules (core/duel.js), the questions, and the server's
   endpoints through real HTTP.

   v6.13 (critique items 62, 63 and 66): the server grades the answers, each
   player has their own questions of the same shape, and the player on the
   lower level is given a handicap. */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, newSession } from "../src/js/core/state.js";
import { createPolicy } from "../src/js/core/policy.js";
import { TASKS, nextTask, buildTask, makeView, applyEffects } from "../src/js/tasks/index.js";
import { DUEL, DUEL_TOPICS, duelStatus, outcomeFor, prune, viewFor, duelTasks, duelPlan, signature,
         duelLevel, duelDifficulty, settleDuels, duelTotals, handicap, shapeOf, shapeKey, cellFamily,
         contentKeys, halfOf, cleanResponse, gradeDuel, ANSWER_LIMITS, sameWeight, CELL_IS_ANSWER, seeded }
  from "../src/js/core/duel.js";
import { judge } from "../src/js/core/answer.js";
import { skillNeed } from "../src/js/core/progress.js";
import { createApp } from "../server/server.mjs";
import { cleanState } from "../server/guard.mjs";
import { mergeStates } from "../src/js/core/merge.js";
import { rightResponse, wrongResponse } from "./helpers.js";

const H = 3600000;
const deps = { nextTask, buildTask, makeView, applyEffects, blankState, newSession, createPolicy };
/* The lexicon every duel is built from, on the server and in the browser. */
const duelLex = buildLexicon(DATA, { hide: new Set(DATA.blocked || []) });
const sideOfDuel = (d, side, key = side === "a" ? 1111 : 2222) => duelTasks(duelLex, { ...d, side, key }, deps);
const duel = (over = {}) => ({ id: "d1", a: "A", b: "B", topic: "nafnord", n: 10, seed: 7,
  level: 3, created: 0, deadline: 24 * H, res: { a: null, b: null }, ...over });

/* ---------- the rules ---------- */

test("a duel is open until both answer or the day is up", () => {
  assert.equal(duelStatus(duel(), H), "open");
  assert.equal(duelStatus(duel({ res: { a: { c: 5, n: 10 }, b: null } }), H), "open");
  assert.equal(duelStatus(duel({ res: { a: { c: 5, n: 10 }, b: { c: 6, n: 10 } } }), H), "done");
  assert.equal(duelStatus(duel({ res: { a: { c: 5, n: 10 }, b: null } }), 25 * H), "done");
  assert.equal(duelStatus(duel(), 25 * H), "void");
});

test("more right wins; the one who did not answer loses; equal is a tie", () => {
  const d = duel({ res: { a: { c: 7, n: 10 }, b: { c: 6, n: 10 } } });
  assert.equal(outcomeFor(d, "a", H), "w");
  assert.equal(outcomeFor(d, "b", H), "l");
  const t = duel({ res: { a: { c: 6, n: 10 }, b: { c: 6, n: 10 } } });
  assert.equal(outcomeFor(t, "a", H), "t");
  const f = duel({ res: { a: null, b: { c: 1, n: 10 } } });
  assert.equal(outcomeFor(f, "b", 25 * H), "w", "answering at all beats not answering");
  assert.equal(outcomeFor(f, "a", 25 * H), "l");
  assert.equal(outcomeFor(f, "a", H), null, "still open");
});

test("void duels are deleted at once, finished ones after a month", () => {
  const list = [duel({ id: "void" }),
    duel({ id: "old", res: { a: { c: 1, n: 10, at: 0 }, b: { c: 2, n: 10, at: H } } }),
    duel({ id: "open", deadline: 100 * 86400000 })];
  const now = 25 * H;
  assert.deepEqual(prune(list, now).map((d) => d.id), ["old", "open"]);
  assert.deepEqual(prune(list, (DUEL.keepDays + 2) * 86400000).map((d) => d.id), ["open"]);
});

test("the other score is hidden until you have answered", () => {
  const d = duel({ res: { a: { c: 9, n: 10, sig: "x" }, b: null } });
  const forB = viewFor(d, "B", { A: "Anna" }, H);
  assert.equal(forB.theirs, null);
  assert.equal(forB.theyPlayed, true);
  assert.equal(forB.opponent.name, "Anna");
  assert.equal(viewFor(d, "C", {}, H), null, "not a party, not shown");
});

test("item 62: no view carries a seed — a browser that has the seed has the answers", () => {
  const d = duel({ seed: 987654321, keys: { a: 123456789, b: 135792468 }, lv: { a: 1, b: 1 },
    started: { a: 5 }, res: { a: { c: 9, n: 10, at: 9 }, b: null } });
  for (const who of ["A", "B"]) {
    const text = JSON.stringify(viewFor(d, who, { A: "Anna", B: "Björn" }, H));
    for (const secret of ["987654321", "123456789", "135792468", "seed", "keys"])
      assert.ok(!text.includes(secret), `${who}'s view shows ${secret}`);
  }
});

/* ---------- item 66: a fair result between unequal players ---------- */

test("item 66: no handicap within one level; beyond it, the lower level starts ahead", () => {
  const h = (a, b, n = 10) => handicap(duel({ n, lv: { a, b } }));
  assert.deepEqual(h(3, 3), { a: 0, b: 0 });
  assert.deepEqual(h(3, 4), { a: 0, b: 0 }, "one level apart is an even duel");
  assert.deepEqual(h(4, 3), { a: 0, b: 0 });
  assert.deepEqual(h(2, 4), { a: 1, b: 0 }, "two levels: one answer in ten");
  assert.deepEqual(h(4, 2), { a: 0, b: 1 }, "whichever side is the lower");
  assert.deepEqual(h(1, 5), { a: 2, b: 0 });
  assert.deepEqual(h(1, 5, 20), { a: 4, b: 0 }, "the same share of a longer duel");
  assert.deepEqual(h(1, 30), { a: 3, b: 0 }, "never more than three in ten");
  assert.deepEqual(h(1, 30, 20), { a: 6, b: 0 });
  assert.deepEqual(h(1.5, 3), { a: 1, b: 0 }, "a mixed topic's level is a mean, not a whole number");
  /* The handicap grows with the gap and never shrinks. */
  let last = 0;
  for (let gap = 0; gap <= 12; gap += 0.5) {
    const now = h(1, 1 + gap).a;
    assert.ok(now >= last, `gap ${gap}`);
    assert.ok(now <= 3);
    last = now;
  }
  /* A duel made before v6.13 knows no levels and gives nothing. */
  assert.deepEqual(handicap(duel()), { a: 0, b: 0 });
  assert.deepEqual(handicap(duel({ lv: { a: "x", b: null } })), { a: 0, b: 0 });
});

test("item 66: the result is decided on right answers plus the handicap", () => {
  const res = (a, b) => ({ a: { c: a, n: 10, at: 1 }, b: { c: b, n: 10, at: 2 } });
  /* A is three levels below B: one and a half answers in ten, so two. */
  const lv = { a: 2, b: 5 };
  assert.deepEqual(handicap(duel({ lv })), { a: 2, b: 0 });
  const d = duel({ lv, res: res(6, 7) });
  assert.equal(outcomeFor(d, "a", H), "w", "6 + 2 beats 7");
  assert.equal(outcomeFor(d, "b", H), "l");
  assert.equal(outcomeFor(duel({ lv, res: res(5, 7) }), "a", H), "t", "5 + 2 ties with 7");
  assert.equal(outcomeFor(duel({ lv, res: res(4, 7) }), "a", H), "l", "the stronger player can still win");
  /* Without levels, as before. */
  assert.equal(outcomeFor(duel({ res: res(6, 7) }), "a", H), "l");
  /* Not answering loses whatever the handicap. */
  assert.equal(outcomeFor(duel({ lv, res: { a: null, b: { c: 0, n: 10, at: 1 } } }), "a", 25 * H), "l");

  /* Both are told, from the start, in their own terms. */
  const names = { A: "Anna", B: "Björn" };
  assert.deepEqual(viewFor(duel({ lv }), "A", names, H).handicap, { mine: 2, theirs: 0 });
  assert.deepEqual(viewFor(duel({ lv }), "B", names, H).handicap, { mine: 0, theirs: 2 });
  assert.deepEqual(viewFor(duel(), "A", names, H).handicap, { mine: 0, theirs: 0 });
  /* The scores shown stay the right answers; the handicap is beside them. */
  assert.deepEqual(viewFor(d, "A", names, H).mine, { c: 6, n: 10 });
});

test("the level is the mean of the two players', and never the easiest sentences", () => {
  const A = blankState(), B = blankState();
  A.skills.nafnord.xp = skillNeed(9);
  assert.equal(duelLevel(A, B, "nafnord"), 5);
  assert.ok(duelDifficulty(1) >= 2.5);
  assert.ok(duelDifficulty(10) > duelDifficulty(3));
});

/* ---------- the plan, and each player's own questions ---------- */

test("the plan: the same questions from the same seed, for every topic", () => {
  const l2 = buildLexicon(DATA, { hide: new Set(DATA.blocked || []) });
  for (const t of DUEL_TOPICS) {
    const d = duel({ topic: t.id, n: 20, seed: 4242, level: 4 });
    const a = duelPlan(duelLex, d, deps);
    Math.random();                       // whatever happened in between
    const b = duelPlan(l2, d, deps);
    assert.equal(a.length, 20, t.id);
    assert.equal(signature(a), signature(b), t.id);
    assert.ok(a.every((x) => x.duel && x.counts !== false), t.id);
    /* Without a side there is nobody to build for: the plan itself. */
    assert.equal(signature(duelTasks(duelLex, d, deps)), signature(a), t.id);
  }
  const other = duelPlan(duelLex, duel({ n: 20, seed: 4243 }), deps);
  assert.notEqual(signature(other), signature(duelPlan(duelLex, duel({ n: 20, seed: 4242 }), deps)));
});

test("item 63: the server and the browser build the same questions for a player; another key, other questions", () => {
  const l2 = buildLexicon(DATA, { hide: new Set(DATA.blocked || []) });
  const d = duel({ topic: "blandad", n: 15, seed: 31337, level: 3 });
  const browser = duelTasks(duelLex, { ...d, side: "b", key: 777 }, deps);
  Math.random();
  const server = duelTasks(l2, { ...d, side: "b", key: 777 }, deps);
  assert.equal(browser.length, 15);
  assert.equal(signature(browser), signature(server));
  assert.deepEqual(browser.map((t) => contentKeys(t).main), server.map((t) => contentKeys(t).main));
  /* The key is the player's own: without it the questions cannot be had. */
  assert.notEqual(signature(duelTasks(duelLex, { ...d, side: "b", key: 778 }, deps)), signature(browser));
  assert.notEqual(signature(duelTasks(duelLex, { ...d, side: "a", key: 777 }, deps)), signature(browser));
  /* The signature reads the sentence and the answer, not only the shape. */
  const swapped = browser.slice();
  swapped[0] = duelTasks(duelLex, { ...d, side: "a", key: 5 }, deps)[0];
  assert.notEqual(signature(swapped), signature(browser));
});

test("every word and sentence belongs to one player in a duel, about half each, another half in the next", () => {
  const keys = duelLex.sentences.slice(0, 400).map((s) => "s:" + s.t);
  assert.ok(keys.length > 200);
  const a1 = keys.filter((k) => halfOf(1, k) === "a"), a2 = keys.filter((k) => halfOf(2, k) === "a");
  assert.ok(a1.length > keys.length * 0.4 && a1.length < keys.length * 0.6, `${a1.length} of ${keys.length}`);
  const both = a1.filter((k) => a2.includes(k)).length;
  assert.ok(both > a1.length * 0.3 && both < a1.length * 0.7, "the halves of two duels are unrelated");
  assert.equal(halfOf(1, keys[0]), halfOf(1, keys[0]));
});

test("item 63: the two players get different questions of the same types, levels and cells", () => {
  /* Every topic, at a beginner's level and a strong pupil's. Each line of
     each player's duel is held against the plan. */
  let lines = 0, exact = 0, near = 0, typeOnly = 0, overlap = 0, safe = 0;
  for (const t of DUEL_TOPICS) {
    for (const [level, seed] of [[1.5, 20261], [5, 20262]]) {
      const d = duel({ topic: t.id, n: 20, seed, level });
      const at = `${t.id} @${level}`;
      const plan = duelPlan(duelLex, d, deps);
      const a = sideOfDuel(d, "a"), b = sideOfDuel(d, "b");
      assert.equal(a.length, plan.length, at);
      assert.equal(b.length, plan.length, at);
      assert.equal(plan.length, 20, at);
      const mainsOf = (tasks) => tasks.map((x) => contentKeys(x).main);
      const allA = new Set(mainsOf(a).flat());

      for (const tasks of [a, b]) {
        /* A player is not asked the same thing twice. */
        const mains = mainsOf(tasks).filter((_, i) => tasks[i].fit < 7).flat();
        assert.equal(new Set(mains).size, mains.length, `${at}: a sentence comes twice`);
        tasks.forEach((x, i) => {
          const want = shapeOf(plan[i]), got = shapeOf(x);
          lines++;
          /* The type is the plan's on every line, whatever else gave way. */
          assert.equal(got.type, want.type, `${at} line ${i}`);
          assert.ok(x.duel && x.counts !== false, at);
          assert.equal(x.type, plan[i].type, `${at}: the renderer is the type's`);
          if (sameWeight(want, got)) exact++;
          else if (Math.abs((got.lvl || 0) - (want.lvl || 0)) <= 1 &&
                   (got.cell === want.cell || cellFamily(got.cell) === cellFamily(want.cell))) near++;
          else typeOnly++;
          /* What the rank promises is what was built: the level, and the
             cell — the very cell, unless the cell is the answer. */
          if (x.fit <= 1 || x.fit === 3) {
            assert.equal(got.lvl, want.lvl, `${at} line ${i}: fit ${x.fit}`);
            if (CELL_IS_ANSWER.has(want.type)) assert.equal(cellFamily(got.cell), cellFamily(want.cell), `${at} line ${i}`);
            else assert.equal(shapeKey(x), shapeKey(plan[i]), `${at} line ${i}: fit ${x.fit}`);
          }
          if (x.fit <= 2) {
            safe++;
            const side = tasks === a ? "a" : "b";
            assert.ok(contentKeys(x).main.every((k) => halfOf(d.seed, k) === side), `${at} line ${i}: not this player's half`);
          }
        });
      }
      /* Lines of B's duel that show something A's duel shows anywhere. */
      b.forEach((x) => { if (contentKeys(x).main.some((k) => allA.has(k))) overlap++; });
      /* And the two duels are not one duel. */
      assert.notEqual(signature(a), signature(b), at);
    }
  }
  const share = (x) => `${(100 * x / lines).toFixed(1)}%`;
  const told = `exact ${share(exact)}, near ${share(near)}, type only ${share(typeOnly)}; ` +
    `from the player's own half ${share(safe)}; shared lines ${overlap} of ${lines / 2}`;
  /* Measured when this was written, over three levels and two sizes: the
     same weight 96%, near 4%, type only 0%; own half 98%; shared lines 3%.
     The floors leave room for the data to change, not for the matching to
     stop working. */
  assert.ok(exact / lines >= 0.85, told);
  assert.ok(typeOnly / lines <= 0.01, told);
  assert.ok(safe / lines >= 0.95, told);
  assert.ok(overlap / (lines / 2) <= 0.05, told);
});

test("item 63: a line that cannot be had exactly takes the same kind of cell", () => {
  assert.equal(cellFamily("stjórn:handa"), cellFamily("stjórn:í"));
  assert.equal(cellFamily("GM-FH-NT-1P-ET"), cellFamily("MM-VH-ÞT-3P-FT"));
  assert.equal(cellFamily("FSB-KK-NFET"), cellFamily("EVB-HK-ÞGFFT"));
  assert.equal(cellFamily("KK-ÞGFET"), cellFamily("HK-NFFT"));
  assert.equal(cellFamily("ÞGFETgr"), cellFamily("NFFT"));
  const kinds = ["stjórn:í", "GM-FH-NT-1P-ET", "FSB-KK-NFET", "KK-ÞGFET", "ÞGFETgr", "setn:frumlag"].map(cellFamily);
  assert.equal(new Set(kinds).size, kinds.length, "six kinds of cell, six families");
});

test("item 63: where the same cell means the same answer, the two players' cells are their own", () => {
  /* Measured, type by type, at a beginner's level and a middling one. Take
     two DIFFERENT questions of the type:
       same   how often they have the same right answer when they share a cell
       any    how often they do whatever their cells
     `same − any` is what a second player gains from being given the first
     player's cell — so it is what giving each their own cell takes away.
       0.3 or more, at either level   the type must be in CELL_IS_ANSWER
       under 0.1 at both              it must not be
     and in between it is a judgement. A type whose cells are single
     hand-written items (hardly ever two questions to a cell) must be in it:
     there the same cell is the same question. */
  const measured = new Map(TASKS.filter((t) => t.skill !== "ordaford").map((t) => [t.id, []]));
  for (const [level, diff] of [[1, 2.5], [3, 3.5]]) {
    const S = blankState();
    Object.keys(S.skills).forEach((k) => { S.skills[k].xp = skillNeed(level); });
    const sess = newSession(S);
    Object.keys(sess.diff).forEach((k) => { sess.diff[k] = diff; });
    const view = makeView({ S, sess, policy: createPolicy(null, null), today: "2000-01-01" });
    for (const id of measured.keys()) {
      /* Its own dice for every type (#28): with one generator for the whole
         list, what a type drew depended on what the types before it had
         drawn — and so on the order of the words in the lexicon. fn_eyda
         measures 0.21–0.32 from one seed to the next (six seeds, both
         levels), and a new word in the content moved it across the 0.3 line. */
      const rng = seeded(5);
      const built = [];
      for (let i = 0; i < 120; i++) {
        const b = buildTask(duelLex, view, rng, id);
        if (!b || b.task.counts === false) continue;
        built.push({ cell: shapeOf(b.task).cell, right: JSON.stringify(rightResponse(b.task)),
          q: contentKeys(b.task).main.join("^") });
      }
      let samePairs = 0, sameHits = 0, anyPairs = 0, anyHits = 0;
      for (let i = 0; i < built.length; i++) for (let j = i + 1; j < built.length; j++) {
        const x = built[i], y = built[j];
        if (x.q === y.q) continue;
        anyPairs++; if (x.right === y.right) anyHits++;
        if (x.cell === y.cell) { samePairs++; if (x.right === y.right) sameHits++; }
      }
      const cells = new Map();
      built.forEach((x) => cells.set(x.cell, (cells.get(x.cell) || new Set()).add(x.q)));
      measured.get(id).push({
        perCell: [...cells.values()].reduce((a, x) => a + x.size, 0) / (cells.size || 1),
        gain: samePairs ? sameHits / samePairs - anyHits / (anyPairs || 1) : 0,
      });
    }
  }
  for (const [id, m] of measured) {
    const told = `${id}: ` + m.map((x) => `gain ${x.gain.toFixed(2)}, ${x.perCell.toFixed(1)} questions a cell`).join(" · ");
    const items = m.every((x) => x.perCell < 1.4);
    const mustBe = items || m.some((x) => x.gain >= 0.3);
    const mustNot = !items && m.every((x) => x.gain < 0.1 && x.perCell >= 2);
    if (mustBe) assert.ok(CELL_IS_ANSWER.has(id), `${told} — the same cell gives the answer away: add it to CELL_IS_ANSWER in core/duel.js`);
    if (mustNot) assert.ok(!CELL_IS_ANSWER.has(id), `${told} — the cell does not give the answer: take it out of CELL_IS_ANSWER in core/duel.js`);
  }
  for (const id of CELL_IS_ANSWER) assert.ok(measured.has(id), `${id} is not a question type a duel asks`);

  /* And what that buys: on those lines the two players' cells differ about
     as often as two draws would. */
  let lines = 0, same = 0;
  for (const topic of ["greining", "fallstjorn", "setningafraedi"]) {
    const d = duel({ topic, n: 20, seed: 4711, level: 3 });
    const a = sideOfDuel(d, "a"), b = sideOfDuel(d, "b");
    a.forEach((x, i) => {
      if (!CELL_IS_ANSWER.has(x.typeId)) return;
      lines++;
      if (shapeOf(x).cell === shapeOf(b[i]).cell) same++;
    });
  }
  assert.ok(lines >= 15, `${lines} such lines`);
  assert.ok(same / lines < 0.5, `${same} of ${lines} lines have the same cell for both players`);
});

/* ---------- item 62: grading ---------- */

test("item 62: only an answer in a known shape is judged", () => {
  /* Every right answer of every topic is one — and comes back equal. */
  for (const t of DUEL_TOPICS) {
    for (const x of sideOfDuel(duel({ topic: t.id, n: 20, seed: 606, level: 4 }), "a")) {
      const r = JSON.parse(JSON.stringify(rightResponse(x)));
      const clean = cleanResponse(r);
      assert.ok(clean, `${x.typeId}: ${JSON.stringify(r)}`);
      assert.equal(JSON.stringify(clean), JSON.stringify(r), x.typeId);
      assert.ok(JSON.stringify(r).length < ANSWER_LIMITS.bytes / 4, `${x.typeId}: the limit is not near an honest answer`);
    }
  }
  const bad = [
    null, undefined, 7, "text", [], [{ text: "a" }],
    { c: 10 }, { text: "a", ok: true }, { __proto__: null, text: "a", constructor: 1 },
    { text: "x".repeat(ANSWER_LIMITS.text + 1) },
    { text: { toString: "x" } }, { text: ["a"], cells: [["a"]] }, { cells: [{ a: 1 }] },
    { cells: Array(ANSWER_LIMITS.items + 1).fill("a") },
    { picks: Object.fromEntries(Array.from({ length: ANSWER_LIMITS.items + 1 }, (_, i) => [i, "a"])) },
    { picks: { fl: { deep: 1 } } }, { picks: { ["k".repeat(ANSWER_LIMITS.key + 1)]: "a" } },
    { picked: Infinity }, { picked: () => 1 },
    { cells: Array(ANSWER_LIMITS.items).fill("x".repeat(ANSWER_LIMITS.text)) },      // each fine, together too much
  ];
  bad.forEach((r, i) => assert.equal(cleanResponse(r), null, `bad response ${i}`));
  /* A copy, and nothing inherited: "constructor" is only a key. */
  const given = { picks: { constructor: "x", fl: "nafnorð" }, sel: [1, 2] };
  const clean = cleanResponse(given);
  assert.notEqual(clean.picks, given.picks);
  assert.notEqual(clean.sel, given.sel);
  assert.equal(Object.getPrototypeOf(clean.picks), null);
  assert.equal(clean.picks.fl, "nafnorð");
});

test("item 62: a duel's answers are graded from the questions, for every topic", () => {
  for (const t of DUEL_TOPICS) {
    const tasks = sideOfDuel(duel({ topic: t.id, n: 20, seed: 1234, level: 3 }), "b");
    /* As they arrive: through JSON. */
    const wire = (list) => JSON.parse(JSON.stringify(list));
    const right = tasks.map(rightResponse), wrong = tasks.map(wrongResponse);
    assert.deepEqual(gradeDuel(tasks, wire(right), judge), { c: 20, n: 20, marks: Array(20).fill(1) }, t.id);
    assert.equal(gradeDuel(tasks, wire(wrong), judge).c, 0, t.id);
    /* The first seven right, the rest wrong, missing or nonsense. */
    const mixed = tasks.map((x, i) => (i < 7 ? right[i] : i < 12 ? wrong[i] : i < 16 ? null : { text: 5, junk: [[]] }));
    const g = gradeDuel(tasks, wire(mixed), judge);
    assert.equal(g.c, 7, t.id);
    assert.equal(g.n, 20, "every question counts, answered or not");
    assert.deepEqual(g.marks, tasks.map((_, i) => (i < 7 ? 1 : 0)), t.id);
    /* What the server counts is what the browser's own judge said. */
    tasks.forEach((x, i) => {
      const j = judge(x, right[i], { S: blankState(), sess: newSession(blankState()) });
      assert.equal(j.finish.correct, true, `${t.id} ${x.typeId}`);
      assert.deepEqual(j.given, right[i], "the judgement carries the response it judged");
      assert.ok(!Object.keys(j).includes("given"), "and does not show it to whoever copies the judgement");
    });
  }
});

test("item 62: nothing a browser sends can make the grading fail or count twice", () => {
  const tasks = sideOfDuel(duel({ n: 10, seed: 55 }), "a");
  const right = tasks.map(rightResponse);
  for (const answers of [null, undefined, "10", { length: 10 }, 10, [], [null], Array(500).fill({ text: "a" })]) {
    const g = gradeDuel(tasks, answers, judge);
    assert.equal(g.n, 10);
    assert.equal(g.c, 0, String(JSON.stringify(answers)).slice(0, 40));
  }
  /* More answers than questions: the extra ones are not looked at. */
  assert.equal(gradeDuel(tasks, [...right, ...right], judge).c, 10);
  /* Answers in the wrong order are answers to other questions. */
  assert.ok(gradeDuel(tasks, right.slice().reverse(), judge).c < 10);
  /* A judge that throws on one answer does not take the others with it. */
  let k = 0;
  const touchy = (t, r) => { if (k++ === 3) throw new Error("boom"); return judge(t, r); };
  assert.equal(gradeDuel(tasks, right, touchy).c, 9);
  /* An unfinished answer (an empty box) and an unjudged one are not right. */
  assert.equal(gradeDuel(tasks, tasks.map(() => ({ text: "" })), judge).c, 0);
  assert.equal(gradeDuel(tasks, right, () => ({ ok: null, pending: false })).c, 0);
  assert.equal(gradeDuel(tasks, right, () => ({ ok: true, pending: true })).c, 0);
});

test("item 63: the first player's right answers are of no use to the second", () => {
  /* What the critique feared: A answers, and tells B. Now A's answers are
     answers to other questions. */
  let got = 0, of = 0;
  for (const t of DUEL_TOPICS) {
    const d = duel({ topic: t.id, n: 20, seed: 8088, level: 3 });
    const a = sideOfDuel(d, "a"), b = sideOfDuel(d, "b");
    got += gradeDuel(b, a.map(rightResponse), judge).c;
    of += b.length;
  }
  /* Not zero: "þágufall" is the right answer to many questions about case,
     and one choice in four is right by chance. Measured over three levels
     and two sizes: 17%. Far below the 100% it was. */
  assert.ok(got / of < 0.3, `${got} of ${of} right with the other player's answers`);
});

test("building a duel never touches Math.random: the seed is its only random source", () => {
  /* Until v6.13 Math.random was swapped for the seeded generator while the
     questions were built. Now it is not even called: with it taken away, the
     duel builds — and builds the same questions. */
  const lexicon = buildLexicon(DATA);
  const before = Math.random;
  /* The plan and a player's own questions both. */
  const both = () => signature(duelTasks(lexicon, duel({ n: 20 }), deps)) + "/" +
    signature(duelTasks(lexicon, duel({ n: 20, side: "a", key: 9 }), deps));
  const usual = both();
  let calls = 0;
  Math.random = () => { calls++; throw new Error("a builder called Math.random"); };
  let without;
  try { without = both(); } finally { Math.random = before; }
  assert.equal(calls, 0);
  assert.equal(without, usual);
  assert.equal(Math.random, before);
});

/* ---------- this device's side ---------- */

test("a result is settled once, with XP only for the one who answered", () => {
  const S = blankState();
  const views = [
    { id: "x", outcome: "w", mine: { c: 10, n: 10 }, theirs: { c: 3, n: 10 } },
    { id: "y", outcome: "l", mine: null, theirs: { c: 3, n: 10 } },
    { id: "z", outcome: null, mine: { c: 1, n: 10 } },
  ];
  const s = settleDuels(S, views);
  assert.equal(s.length, 2);
  assert.equal(s[0].xp, DUEL.xpPlay + DUEL.xpWin);
  assert.equal(s[0].perfect, true);
  assert.equal(s[1].outcome, "f");
  assert.equal(s[1].xp, 0);
  assert.equal(settleDuels(S, views).length, 0, "the second time, nothing");
  assert.deepEqual(duelTotals(S), { played: 1, wins: 1, losses: 1, ties: 0 });
});

test("settled duels survive the server's guard and a merge between devices", () => {
  const S = blankState();
  S.duels = { a1: "w", b2: "f", bad: "<script>" };
  S.read = { foll: true };
  const clean = cleanState(S);
  assert.deepEqual(clean.duels, { a1: "w", b2: "f" });
  assert.deepEqual(clean.read, { foll: true });
  const L = blankState(), R = blankState();
  L.duels = { a1: "w" }; R.duels = { c3: "t" };
  assert.deepEqual(mergeStates(blankState(), L, R).duels, { a1: "w", c3: "t" });
});

/* ---------- the server ---------- */

let base, dir, app;
before(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "fallaskoli-duel-"));
  app = createApp({ dataDir: dir, secureCookies: false, env: { FALLASKOLI_OPEN_REGISTRATION: "1" } });
  await app.store.init();
  await new Promise((r) => app.server.listen(0, r));
  base = "http://127.0.0.1:" + app.server.address().port;
});
after(async () => {
  await new Promise((r) => app.server.close(r));
  await fs.rm(dir, { recursive: true, force: true });
});

function client() {
  let cookie = null;
  return async (method, p, body) => {
    const r = await fetch(base + p, { method,
      headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
    const set = r.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const text = await r.text();
    let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: r.status, data };
  };
}
async function person(username, { board = true, group } = {}) {
  const { hashPassword, newId } = await import("../server/auth.mjs");
  const { salt, hash } = await hashPassword("lykilordid-mitt");
  let user;
  await app.store.updateUsers((users) => {
    user = { id: newId(), username, name: username, role: "learner", status: "active", salt, hash,
      share: { board, minutes: false }, ...(group ? { group } : {}),
      consent: { by: "self", over16: true, at: new Date().toISOString(), how: "admin" } };
    users.push(user); return users;
  });
  await app.store.putState(user.id, blankState());
  const c = client();
  const r = await c("POST", "/auth/login", { username, password: "lykilordid-mitt" });
  assert.equal(r.status, 200);
  return { user, c };
}

/* A player's questions, built here from what POST /start gave — exactly as
   the browser builds them (src/js/control/duel.js `startDuel`). */
const built = (start) => duelTasks(duelLex, { ...start.data.duel, seed: start.data.seed, key: start.data.key }, deps);
/* The first `right` answered right, the rest wrong. */
const answersFor = (tasks, right) => tasks.map((t, i) => (i < right ? rightResponse(t) : wrongResponse(t)));
const mineOf = async (who, id) => (await who.c("GET", "/duels")).data.duels.find((d) => d.id === id);

test("server: a challenge, two sets of answers graded by the server, one winner", async () => {
  const anna = await person("anna"), bjorn = await person("bjorn");
  const list = await anna.c("GET", "/duels");
  assert.equal(list.status, 200);
  assert.ok(list.data.canChallenge.some((p) => p.id === bjorn.user.id));
  const made = await anna.c("POST", "/duels", { opponent: bjorn.user.id, topic: "lysingarord", n: 20 });
  assert.equal(made.status, 200);
  const id = made.data.duel.id;

  /* Nothing a browser is sent before play has the seeds in it. */
  const stored = (await app.store.duels()).find((d) => d.id === id);
  assert.equal(typeof stored.seed, "number");
  assert.notEqual(stored.keys.a, stored.keys.b);
  const forB = await mineOf(bjorn, id);
  assert.equal(forB.challenger, false);
  for (const sent of [made.data, list.data, forB, await mineOf(anna, id)]) {
    const text = JSON.stringify(sent);
    assert.ok(!text.includes("seed") && !text.includes("keys"), text.slice(0, 200));
    for (const secret of [stored.seed, stored.keys.a, stored.keys.b]) assert.ok(!text.includes(String(secret)));
  }

  /* Anna presses play: her own seeds, and what the server will grade. */
  const startA = await anna.c("POST", `/duels/${id}/start`);
  assert.equal(startA.status, 200);
  assert.equal(startA.data.seed, stored.seed);
  assert.equal(startA.data.key, stored.keys.a);
  assert.ok(!JSON.stringify(startA.data).includes(String(stored.keys.b)), "not the other player's key");
  const tasksA = built(startA);
  assert.equal(tasksA.length, 20);
  assert.equal(signature(tasksA), startA.data.sig, "the browser's questions are the server's");
  /* Pressing play again — a reload — is the same duel, and the first press is the one recorded. */
  const at = (await app.store.duels()).find((d) => d.id === id).started.a;
  const again = await anna.c("POST", `/duels/${id}/start`);
  assert.equal(again.data.key, startA.data.key);
  assert.equal(again.data.sig, startA.data.sig);
  assert.equal((await app.store.duels()).find((d) => d.id === id).started.a, at);

  /* Fifteen right of twenty: the server counts fifteen. */
  const sentA = await anna.c("POST", `/duels/${id}/result`, { answers: answersFor(tasksA, 15), sig: startA.data.sig });
  assert.equal(sentA.status, 200);
  assert.deepEqual(sentA.data.duel.mine, { c: 15, n: 20 });
  assert.equal((await anna.c("POST", `/duels/${id}/result`,
    { answers: answersFor(tasksA, 20), sig: startA.data.sig })).status, 409, "once only");
  assert.equal((await anna.c("POST", `/duels/${id}/start`)).status, 409, "and no second look at the questions' seeds");

  const midB = await mineOf(bjorn, id);
  assert.equal(midB.theirs, null, "Björn does not see the number to beat");
  const startB = await bjorn.c("POST", `/duels/${id}/start`);
  assert.equal(startB.data.key, stored.keys.b);
  const tasksB = built(startB);
  assert.equal(signature(tasksB), startB.data.sig);
  assert.notEqual(startB.data.sig, startA.data.sig, "item 63: not Anna's questions");
  assert.deepEqual(tasksB.map((t) => t.typeId), tasksA.map((t) => t.typeId), "but the same types, line by line");
  const sentB = await bjorn.c("POST", `/duels/${id}/result`, { answers: answersFor(tasksB, 12), sig: startB.data.sig });
  assert.equal(sentB.status, 200);

  const endA = await mineOf(anna, id), endB = await mineOf(bjorn, id);
  assert.equal(endA.outcome, "w");
  assert.equal(endB.outcome, "l");
  assert.deepEqual(endB.mine, { c: 12, n: 20 });
  assert.deepEqual(endB.theirs, { c: 15, n: 20 });
  /* What is kept is the score, not the answers. */
  const kept = (await app.store.duels()).find((d) => d.id === id);
  assert.deepEqual(Object.keys(kept.res.a).sort(), ["at", "c", "n"]);
  assert.ok(!JSON.stringify(kept).includes("xq"), "nothing a pupil typed is stored");
});

test("item 62: a forged result is not believed", async () => {
  const eva = await person("eva"), finnur = await person("finnur");
  const id = (await eva.c("POST", "/duels", { opponent: finnur.user.id, topic: "nafnord", n: 10 })).data.duel.id;
  const result = (who, body) => who.c("POST", `/duels/${id}/result`, body);
  const none = async () => assert.deepEqual((await app.store.duels()).find((d) => d.id === id).res, { a: null, b: null });

  /* What the developer tools could post until v6.13: ten out of ten. */
  const old = await result(eva, { c: 10, n: 10, sig: "s" });
  assert.equal(old.status, 400);
  assert.match(old.data.error, /Endurhladdu/);
  await none();
  /* Answers before play: nobody was given these questions. */
  assert.equal((await result(eva, { answers: Array(10).fill({ text: "a" }), sig: "s" })).status, 409);
  await none();

  const start = await eva.c("POST", `/duels/${id}/start`);
  const tasks = built(start), sig = start.data.sig;
  /* A score smuggled in beside the answers is not read. */
  const wrong = answersFor(tasks, 0);
  /* Not the server's questions (an old tab, other data): nothing is graded,
     nothing stored, and the duel can still be played. */
  const off = await result(eva, { answers: answersFor(tasks, 10), sig: "abc.10" });
  assert.equal(off.status, 409);
  assert.match(off.data.error, /Endurhladdu/);
  await none();
  /* Malformed bodies. */
  assert.equal((await result(eva, { answers: "tíu rétt", sig })).status, 400);
  assert.equal((await result(eva, { answers: answersFor(tasks, 10) })).status, 400, "no signature");
  assert.equal((await result(eva, { answers: [...answersFor(tasks, 10), { text: "a" }], sig })).status, 400, "more answers than questions");
  assert.equal((await result(eva, { answers: [{ text: "x".repeat(200000) }], sig })).status, 413);
  await none();
  /* Somebody who is not in the duel. */
  const gestur = await person("gestur");
  assert.equal((await gestur.c("POST", `/duels/${id}/start`)).status, 404);
  assert.equal((await result(gestur, { answers: answersFor(tasks, 10), sig })).status, 404);

  /* All wrong, with every claim a cheat might add: the server counts none. */
  const sent = await result(eva, { answers: wrong.map((r) => ({ ...r })), sig, c: 10, n: 10, marks: Array(10).fill(1), ok: true });
  assert.equal(sent.status, 200);
  assert.deepEqual(sent.data.duel.mine, { c: 0, n: 10 });
  assert.deepEqual((await app.store.duels()).find((d) => d.id === id).res.a.c, 0);

  /* Finnur sends junk among his answers: each is simply not right, and the
     rest are graded. Half answered: the rest count as wrong. */
  const startF = await finnur.c("POST", `/duels/${id}/start`);
  const mine = built(startF);
  const answers = [
    rightResponse(mine[0]),
    { ...rightResponse(mine[1]), ok: true },          // a right answer with a key too many
    null, 7,
    rightResponse(mine[4]),
  ];
  const sentF = await result(finnur, { answers, sig: startF.data.sig });
  assert.equal(sentF.status, 200);
  assert.deepEqual(sentF.data.duel.mine, { c: 2, n: 10 }, "the two that are answers, in their places");
  assert.equal(sentF.data.duel.outcome, "w");
});

test("item 63: the first player's answers do not win the second player's duel", async () => {
  const gudrun = await person("gudrun"), helgi = await person("helgi");
  const id = (await gudrun.c("POST", "/duels", { opponent: helgi.user.id, topic: "sagnord", n: 20 })).data.duel.id;
  const startG = await gudrun.c("POST", `/duels/${id}/start`);
  const hers = answersFor(built(startG), 20);
  assert.deepEqual((await gudrun.c("POST", `/duels/${id}/result`, { answers: hers, sig: startG.data.sig })).data.duel.mine,
    { c: 20, n: 20 });
  /* Guðrún tells Helgi every answer. He types them in. */
  const startH = await helgi.c("POST", `/duels/${id}/start`);
  const sent = await helgi.c("POST", `/duels/${id}/result`, { answers: hers, sig: startH.data.sig });
  assert.equal(sent.status, 200);
  assert.ok(sent.data.duel.mine.c <= 8, `${sent.data.duel.mine.c} of 20 with somebody else's answers`);
  assert.equal(sent.data.duel.outcome, "l");
});

test("item 66: on the server, the player on the lower level starts ahead and both are told", async () => {
  const sterk = await person("sterk"), nyr = await person("nyr");
  const strong = blankState();
  strong.skills.nafnord.xp = skillNeed(6);
  await app.store.putState(sterk.user.id, strong);
  const made = await sterk.c("POST", "/duels", { opponent: nyr.user.id, topic: "nafnord", n: 10 });
  const id = made.data.duel.id;
  const stored = (await app.store.duels()).find((d) => d.id === id);
  assert.deepEqual(stored.lv, { a: 6, b: 1 });
  assert.equal(stored.level, 3.5, "still played at the mean");
  /* Five levels apart: 10 × 5% × 5 = 2.5 → 3, which is also the cap. */
  assert.deepEqual(made.data.duel.handicap, { mine: 0, theirs: 3 });
  assert.deepEqual((await mineOf(nyr, id)).handicap, { mine: 3, theirs: 0 });

  const play = async (who, right) => {
    const start = await who.c("POST", `/duels/${id}/start`);
    return who.c("POST", `/duels/${id}/result`, { answers: answersFor(built(start), right), sig: start.data.sig });
  };
  await play(sterk, 8);
  const end = (await play(nyr, 6)).data.duel;
  assert.deepEqual(end.mine, { c: 6, n: 10 }, "the score shown is the right answers");
  assert.equal(end.outcome, "w", "6 + 3 beats 8");
  assert.equal((await mineOf(sterk, id)).outcome, "l");
});

test("item 62: the export of a pupil's own data does not hand over an open duel's seeds", async () => {
  const inga = await person("inga"), jon = await person("jon");
  const id = (await inga.c("POST", "/duels", { opponent: jon.user.id, topic: "nafnord", n: 10 })).data.duel.id;
  const stored = (await app.store.duels()).find((d) => d.id === id);
  const out = await inga.c("GET", "/account/export");
  assert.equal(out.status, 200);
  const text = typeof out.data === "string" ? out.data : JSON.stringify(out.data);
  assert.ok(text.includes(id), "the duel is in the export");
  for (const secret of [stored.seed, stored.keys.a, stored.keys.b]) assert.ok(!text.includes(String(secret)));
});

test("a duel made before v6.13 (no keys, no levels) can still be played", async () => {
  const kari = await person("kari"), lara = await person("lara");
  const id = (await kari.c("POST", "/duels", { opponent: lara.user.id, topic: "toluord", n: 10 })).data.duel.id;
  await app.store.updateDuels((list) => {
    const d = list.find((x) => x.id === id);
    delete d.keys; delete d.lv;
    return list;
  });
  assert.deepEqual((await mineOf(kari, id)).handicap, { mine: 0, theirs: 0 });
  const start = await kari.c("POST", `/duels/${id}/start`);
  assert.equal(start.status, 200);
  assert.equal(typeof start.data.key, "number");
  const tasks = built(start);
  assert.equal(signature(tasks), start.data.sig);
  const sent = await kari.c("POST", `/duels/${id}/result`, { answers: answersFor(tasks, 10), sig: start.data.sig });
  assert.deepEqual(sent.data.duel.mine, { c: 10, n: 10 });
});

test("server: only people on the board, in the same group, and never yourself", async () => {
  const me = await person("kata");
  const hidden = await person("leynd", { board: false });
  const elsewhere = await person("fjarri", { group: "annar" });
  assert.equal((await me.c("POST", "/duels", { opponent: hidden.user.id, topic: "nafnord", n: 10 })).status, 404);
  assert.equal((await me.c("POST", "/duels", { opponent: elsewhere.user.id, topic: "nafnord", n: 10 })).status, 404);
  assert.equal((await me.c("POST", "/duels", { opponent: me.user.id, topic: "nafnord", n: 10 })).status, 400);
  const other = await person("lilja");
  assert.equal((await me.c("POST", "/duels", { opponent: other.user.id, topic: "ordaford", n: 10 })).status, 400,
    "no duel on a topic with no wrong answers");
  assert.equal((await me.c("POST", "/duels", { opponent: other.user.id, topic: "nafnord", n: 30 })).status, 400);
  assert.equal((await hidden.c("POST", "/duels", { opponent: other.user.id, topic: "nafnord", n: 10 })).status, 403,
    "somebody not on the board cannot challenge either");
});

test("server: ten open duels at most", async () => {
  const a = await person("margir"), b = await person("motherji");
  for (let i = 0; i < DUEL.maxOpen; i++)
    assert.equal((await a.c("POST", "/duels", { opponent: b.user.id, topic: "nafnord", n: 10 })).status, 200);
  assert.equal((await a.c("POST", "/duels", { opponent: b.user.id, topic: "nafnord", n: 10 })).status, 409);
});

test("server: a duel nobody answered is gone after the day; erasing a user erases their duels", async () => {
  const a = await person("gleymin"), b = await person("gleymdur");
  const made = await a.c("POST", "/duels", { opponent: b.user.id, topic: "sagnord", n: 10 });
  const id = made.data.duel.id;
  await app.store.updateDuels((list) => { list.find((d) => d.id === id).deadline = Date.now() - 1; return list; });
  assert.equal((await a.c("GET", "/duels")).data.duels.some((d) => d.id === id), false);
  assert.equal((await app.store.duels()).some((d) => d.id === id), false, "deleted from the file too");

  const c = await person("hverfur");
  await a.c("POST", "/duels", { opponent: c.user.id, topic: "sagnord", n: 10 });
  await app.store.eraseUser(c.user.id);
  assert.equal((await app.store.duels()).some((d) => d.a === c.user.id || d.b === c.user.id), false);
});

test("v6.10: a duel asks only about what both players have switched on", async () => {
  const { duelSkills } = await import("../src/js/core/duel.js");
  const on = (off) => ({ skill: (id) => !off.includes(id) });
  const mix = duelSkills("blandad", on(["setningafraedi", "setningagerd"]), on([]));
  assert.ok(mix.length > 3);
  assert.ok(!mix.includes("setningafraedi") && !mix.includes("setningagerd"));
  assert.deepEqual(duelSkills("setningagerd", on([]), on(["setningagerd"])), []);
  assert.deepEqual(duelSkills("nafnord", null, null), ["nafnord"]);
});
