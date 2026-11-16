/* A live class round (critique item 64): the rules in core/live.js.
 *
 * What matters most here is the SCORE: a careful pupil must never lose to a
 * quick one with fewer right answers. The server's side — who may do what,
 * the clock, the streams — is in tests/live-server.test.js. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import {
  LIVE, validSize, validSecs, speedBonus, pointsFor, standings, notePatterns, commonest,
  roundScope, roundLevel, roundTasks, answerText, displayName, alias, boardView, pupilView, boardRows, BOARD_TOP,
} from "../src/js/core/live.js";
import { duelTasks, signature } from "../src/js/core/duel.js";
import { judge } from "../src/js/core/answer.js";
import { blankState, newSession } from "../src/js/core/state.js";
import { nextTask, buildTask, makeView, applyEffects } from "../src/js/tasks/index.js";
import { createPolicy } from "../src/js/core/policy.js";
import { skillNeed } from "../src/js/core/progress.js";

const deps = { nextTask, buildTask, makeView, applyEffects, blankState, newSession, createPolicy };
let lexCache = null;
const lex = () => (lexCache ||= buildLexicon(DATA, { hide: new Set(DATA.blocked || []) }));

/* ---------- the score ------------------------------------------------------- */

test("the whole speed bonus of a round is worth less than one right answer", () => {
  const most = Math.max(...LIVE.sizes);
  assert.ok(LIVE.bonus * most < LIVE.point,
    `${most} questions × ${LIVE.bonus} bonus must stay under ${LIVE.point}`);
});

test("a careful pupil with one more right answer always wins", () => {
  for (const n of LIVE.sizes) {
    for (const secs of LIVE.secs) {
      /* The quick one: n-1 right, every one at once. The careful one: n
         right, every one in the last second. */
      const quick = (n - 1) * pointsFor(true, 0, secs);
      const careful = n * pointsFor(true, secs * 1000, secs);
      assert.ok(careful > quick, `${n} questions, ${secs} s`);
    }
  }
});

test("the bonus falls from all at once to nothing at the end, and never goes negative", () => {
  assert.equal(speedBonus(0, 30), LIVE.bonus);
  assert.equal(speedBonus(30000, 30), 0);
  assert.equal(speedBonus(90000, 30), 0, "late inside the grace");
  assert.equal(speedBonus(-5, 30), LIVE.bonus);
  const mid = speedBonus(15000, 30);
  assert.ok(mid > 0 && mid < LIVE.bonus);
});

test("a wrong answer is worth nothing, however quick; a hinted right one has no bonus", () => {
  assert.equal(pointsFor(false, 0, 30), 0);
  assert.equal(pointsFor(true, 0, 30, true), LIVE.point);
  assert.equal(pointsFor(true, 0, 30), LIVE.point + LIVE.bonus);
});

test("the limits a teacher may choose", () => {
  assert.ok(validSize(10) && !validSize(11) && !validSize("10"));
  assert.ok(validSecs(30) && !validSecs(1) && !validSecs(3600));
  assert.ok(LIVE.sizes.includes(LIVE.n) && LIVE.secs.includes(LIVE.defSecs));
});

test("standings: points first, then right answers, then the name; equal points share a place", () => {
  const s = standings([
    { id: "a", name: "Ari", right: 2, points: 200 },
    { id: "b", name: "Bára", right: 3, points: 303 },
    { id: "c", name: "Cecilía", right: 2, points: 200 },
    { id: "d", name: "Davíð", right: 0, points: 0 },
  ]);
  assert.deepEqual(s.map((p) => [p.id, p.rank]), [["b", 1], ["a", 2], ["c", 2], ["d", 4]]);
});

/* ---------- the class's commonest error ------------------------------------- */

test("the commonest pattern is the one most pupils made, never 'Ógreint' or a meta pattern", () => {
  const t = {};
  notePatterns(t, "u1", [{ p: "thf_thgf" }, { p: "ogreint" }]);
  notePatterns(t, "u1", [{ p: "thf_thgf" }]);
  notePatterns(t, "u1", [{ p: "thf_thgf" }]);
  notePatterns(t, "u2", [{ p: "ef" }]);
  notePatterns(t, "u3", [{ p: "ef" }, { p: "nope" }]);
  assert.equal(t.ogreint, undefined);
  assert.equal(t.nope, undefined);
  const c = commonest(t);
  /* ef: two pupils, two misses; thf_thgf: one pupil, three misses. */
  assert.equal(c.id, "ef");
  assert.equal(c.pupils, 2);
  assert.ok(c.nm && c.rule, "the name and the rule come with it");
  assert.equal(commonest({}), null);
});

/* ---------- the questions --------------------------------------------------- */

test("a round on a node, a category, a year or a pattern has a scope", () => {
  assert.deepEqual(roundScope({ kind: "skill", id: "nafnord" }).skills, ["nafnord"]);
  assert.ok(roundScope({ kind: "year", id: "8" }).types.length > 0);
  assert.equal(roundScope({ kind: "skill", id: "nope" }), null);
  assert.equal(roundScope(null), null);
});

test("the class's level is the mean of the pupils' levels, a pupil who never practised at 1", () => {
  const S = blankState();
  S.skills.nafnord.xp = skillNeed(5);
  assert.equal(roundLevel([S, null], ["nafnord"]), 3);
  assert.equal(roundLevel([], ["nafnord"]), 1);
});

test("everybody gets the same questions: the round is the duel's plan, the same from the same seed", () => {
  const round = { seed: 4242, n: 10, level: 2, ...roundScope({ kind: "skill", id: "nafnord" }) };
  const a = roundTasks(lex(), round, deps);
  const b = roundTasks(lex(), round, deps);
  assert.equal(a.length, 10);
  assert.equal(signature(a), signature(b));
  assert.ok(a.every((t) => t.live && t.duel), "marked live, and as a duel: no second try");
  assert.ok(a.every((t) => t.skill === "nafnord"));
  /* JSON is how a question reaches a pupil: it must judge the same after. */
  const back = JSON.parse(JSON.stringify(a));
  for (let i = 0; i < a.length; i++) {
    const r = { text: "x" };
    assert.equal(judge(back[i], r).ok, judge(a[i], r).ok);
  }
});

test("a round on a node asks only the node's question types", () => {
  const sc = roundScope({ kind: "year", id: "8" });
  const tasks = roundTasks(lex(), { seed: 9, n: 10, level: 3, ...sc }, deps);
  const types = new Set(sc.types);
  assert.ok(tasks.length > 0);
  assert.ok(tasks.every((t) => types.has(t.typeId)), tasks.map((t) => t.typeId).join(","));
});

test("a duel between two pupils is built exactly as before (no types, no ceiling)", () => {
  const duel = { topic: "nafnord", n: 10, level: 2, seed: 77, side: "a", key: 5 };
  const one = duelTasks(lex(), duel, deps);
  const two = duelTasks(lex(), { ...duel, types: [], allowed: null }, deps);
  assert.equal(signature(one), signature(two));
});

/* ---------- what each screen is sent ---------------------------------------- */

function fakeRound(phase = "open") {
  const tasks = [{ type: "fill", skill: "nafnord", answers: ["hesti"], why: "Þágufall." },
    { type: "choice", skill: "greining", answer: "nafnorð", options: ["nafnorð", "sögn"] }];
  const players = new Map([
    ["u1", { id: "u1", name: "Anna", shown: true, k: 1, right: 1, points: 105, marks: [{ ok: true, points: 105 }] }],
    ["u2", { id: "u2", name: "Bjarni", shown: false, k: 2, right: 0, points: 0, marks: [{ ok: false, points: 0 }] }],
    ["u3", { id: "u3", name: "Dóra", shown: false, k: 3, right: 0, points: 0, marks: [] }],
  ]);
  return { id: "r1", group: "g", target: { kind: "skill", id: "nafnord" }, n: 2, secs: 30,
    phase, q: 0, opened: 1000, closes: 31000, tasks, players,
    perQ: [{ right: 1, wrong: 1 }], tally: { thf_thgf: { pupils: new Set(["u2"]), misses: 1 } } };
}

test("the board names only pupils who chose to be on the leaderboard", () => {
  const v = boardView(fakeRound(), 2000);
  const names = v.top.map((r) => r.name);
  assert.ok(names.includes("Anna"));
  assert.ok(!names.includes("Bjarni") && names.includes(alias(2)));
  assert.equal(displayName({ shown: false, k: 7, name: "X" }), "Leikmaður 7");
  assert.ok(!JSON.stringify(v.top).includes("u1"), "no user ids on the board");
});

test("the board shows no more than the top few", () => {
  const r = fakeRound();
  for (let i = 4; i < 20; i++) r.players.set("u" + i, { id: "u" + i, name: "P" + i, shown: true, k: i, right: 0, points: i, marks: [] });
  assert.equal(boardRows(r).length, BOARD_TOP);
});

test("while a question is open a pupil who has answered is not sent it again, and nobody sees the result", () => {
  const r = fakeRound("open");
  const a = pupilView(r, "u1", 2000);
  assert.equal(a.answered, true);
  assert.equal(a.task, undefined);
  assert.equal(a.result, undefined);
  const d = pupilView(r, "u3", 2000);
  assert.equal(d.answered, false);
  assert.equal(d.task.answers[0], "hesti");
  assert.equal(d.left, 29000);
  /* Somebody who has not joined is sent nothing of the question. */
  const out = pupilView(r, "nobody", 2000);
  assert.equal(out.joined, false);
  assert.equal(out.task, undefined);
  assert.equal(out.me, undefined);
});

test("after the question closes: the class's figures, the answer, and each pupil's own mark", () => {
  const r = fakeRound("shown");
  r.players.get("u3").marks[0] = null;
  const b = boardView(r, 40000);
  assert.deepEqual({ right: b.result.right, wrong: b.result.wrong, none: b.result.none, of: b.result.of },
    { right: 1, wrong: 1, none: 1, of: 3 });
  assert.equal(b.result.answer, "hesti");
  const p = pupilView(r, "u2", 40000);
  assert.deepEqual(p.result.mine, { ok: false, points: 0 });
  assert.equal(p.me.as, "Leikmaður 2");
  assert.equal(pupilView(r, "u3", 40000).result.mine, null);
});

test("the end: podium, the share right, and the commonest pattern with its rule", () => {
  const r = fakeRound("done");
  const v = boardView(r, 50000);
  assert.equal(v.end.podium[0].name, "Anna");
  assert.equal(v.end.share, 33);
  assert.equal(v.end.commonest.id, "thf_thgf");
  assert.ok(v.end.commonest.rule.length > 10);
  assert.equal(pupilView(r, "u2", 50000).end.commonest.id, "thf_thgf");
});

test("answerText: the written form, the right option, or nothing", () => {
  assert.equal(answerText({ answers: ["tveimur", "tveim"] }), "tveimur");
  assert.equal(answerText({ answer: "sterk", options: ["sterk", "veik"] }), "sterk");
  assert.equal(answerText({ type: "table", cells: [] }), null);
  assert.equal(answerText(null), null);
});

/* The merge of items 59, 83, 64 and 67: one notice describes the class goal,
   the teacher's view of a skill map, the live round and team duels, under a
   version later than all of them, and docs/PRIVACY.md numbers them apart. */
test("one privacy notice, one version, for the class goal, the skill map, the live round and team duels", async () => {
  const { PRIVACY_VERSION, CALIBRATION_NOTICE, privacyPage } = await import("../server/privacy.mjs");
  const { readFileSync } = await import("node:fs");
  assert.ok(PRIVACY_VERSION >= "2026-11-20", "the live round and team duels came after 2026-11-19");
  assert.ok(CALIBRATION_NOTICE <= PRIVACY_VERSION);
  const html = privacyPage({ controller: "X", contact: "x@y.is" });
  assert.ok(html.includes(`Síðast breytt ${PRIVACY_VERSION}`));
  for (const words of ["sameiginlegt markmið", "færnikortið þitt", "Leikmaður", "bekkjareinvígi"])
    assert.ok(html.includes(words), words);
  const doc = readFileSync(new URL("../docs/PRIVACY.md", import.meta.url), "utf8");
  const heads = doc.match(/^## 1[a-z]\./gm);
  assert.deepEqual(heads, [...new Set(heads)], "each section of §1 has its own number");
  assert.match(doc, /^## 1c\. The class goal/m);
  assert.match(doc, /^## 1d\. A live round in class, and team duels/m);
  assert.ok(doc.includes(`\`${PRIVACY_VERSION}\``));
});
