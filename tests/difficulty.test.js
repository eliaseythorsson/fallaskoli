/* Saved, accuracy-driven difficulty per skill (critique items 11 and 12).
 *
 * The defect: the level was rebuilt from skill XP on every page load and rose
 * a quarter step per right answer, so in Blandað a skill never climbed and a
 * strong and a weak pupil were served the same sentences. These tests hold
 * the new rule (core/difficulty.js): kept between visits, half a step below
 * on return, two right up half, one wrong down half, no rise while recent
 * accuracy is under 80%, inside the policy and the types' declared bands. */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MIN, MAX, STEP, WARMUP, WINDOW, bumpDiff, diffOf, levelRecord, storedLevel,
  setSkillLevel, levelsFromXp, cleanLevels, mergeLevels, visitLevels, levelRanges,
  applyRanges, nextLevel,
} from "../src/js/core/difficulty.js";
import { blankState, migrate, newSession } from "../src/js/core/state.js";
import { mergeStates } from "../src/js/core/merge.js";
import { cleanState } from "../server/guard.mjs";
import { createPolicy } from "../src/js/core/policy.js";
import { SKILL_IDS } from "../src/js/core/skills.js";
import { TASKS } from "../src/js/tasks/index.js";
import { judge, settle } from "../src/js/core/answer.js";

const T0 = 1_700_000_000_000;
/** Answer `skill` with the outcomes in `seq` ("1"/"0"), a second apart. */
function play(S, sess, skill, seq, t = T0) {
  [...seq].forEach((c, i) => bumpDiff(sess, S, skill, c === "1", t + i * 1000));
  return diffOf(sess, skill);
}

/* ---------- item 12: inside a visit ---------------------------------------- */

test("two right in a row raise half a level; one right alone does not", () => {
  const S = blankState(), sess = newSession(S);
  assert.equal(play(S, sess, "nafnord", "1"), 1);
  assert.equal(play(S, sess, "nafnord", "1", T0 + 5000), 1 + STEP);
  assert.equal(play(S, sess, "nafnord", "1111", T0 + 9000), 1 + 3 * STEP);
});

test("one wrong lowers half a level and breaks the pair", () => {
  const S = blankState(), sess = newSession(S);
  play(S, sess, "sagnord", "111111");                  // 2.5
  assert.equal(diffOf(sess, "sagnord"), 2.5);
  assert.equal(play(S, sess, "sagnord", "0", T0 + 1e5), 2);
  /* right, wrong, right: no two in a row, so no rise */
  assert.equal(play(S, sess, "sagnord", "101", T0 + 2e5), 1.5);
});

test("the level does not rise while fewer than 80% of the last dozen were right", () => {
  const S = blankState(), sess = newSession(S);
  /* 6 right of 10: every pair of rights would have raised it before */
  play(S, sess, "fornofn", "1010101011");
  const hist = levelRecord(S, "fornofn").h;
  assert.ok([...hist].filter((c) => c === "1").length / hist.length < 0.8);
  const before = diffOf(sess, "fornofn");
  assert.equal(play(S, sess, "fornofn", "11", T0 + 1e5), before, "held back by recent accuracy");
  /* a run of right answers brings recent accuracy up, and the level with it */
  const after = play(S, sess, "fornofn", "111111111111", T0 + 2e5);
  assert.ok(after > before, `${before} → ${after}`);
});

test("a skill's level moves alone, and stays within 1–7", () => {
  const S = blankState(), sess = newSession(S);
  play(S, sess, "nafnord", "1".repeat(60));
  assert.equal(diffOf(sess, "nafnord"), MAX);
  assert.equal(diffOf(sess, "sagnord"), MIN, "verbs did not move");
  play(S, sess, "nafnord", "0".repeat(30), T0 + 1e6);
  assert.equal(diffOf(sess, "nafnord"), MIN);
});

test("a question with no right answer moves nothing", () => {
  const S = blankState(), sess = newSession(S);
  play(S, sess, "ordaford", "11");
  const rec = { ...levelRecord(S, "ordaford") };
  bumpDiff(sess, S, "ordaford", null, T0 + 9e5);
  assert.deepEqual(levelRecord(S, "ordaford"), rec);
});

test("the staircase settles inside 75–85% right whatever the slope", () => {
  /* An abstract pupil whose chance of a right answer falls with the level. */
  for (const slope of [0.03, 0.08, 0.15]) {
    let s = 7, st = { live: 1, r: 0, h: "" }, n = 0, k = 0;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 30000; i++) {
      const ok = rnd() < Math.min(0.99, 1.05 - slope * st.live);
      if (i > 2000) { n++; if (ok) k++; }
      st = { ...st, ...nextLevel({ ...st, lo: 1, hi: 100 }, ok) };
    }
    const acc = k / n;
    assert.ok(acc >= 0.75 && acc <= 0.85, `slope ${slope}: ${acc.toFixed(3)} right`);
  }
});

/* ---------- item 11: between visits --------------------------------------- */

test("the level is saved and survives a reload (JSON and migrate)", () => {
  const S = blankState(), sess = newSession(S);
  play(S, sess, "greining", "111111");
  const back = migrate(JSON.parse(JSON.stringify(S)));
  assert.equal(storedLevel(back, "greining"), 2.5);
  assert.equal(levelRecord(back, "greining").h, "111111");
  assert.equal(levelRecord(back, "greining").src, "play");
});

test("the next visit starts half a step below where the last ended", () => {
  const S = blankState(), sess = newSession(S);
  play(S, sess, "nafnord", "11111111");                 // ends at 3
  const next = newSession(migrate(JSON.parse(JSON.stringify(S))));
  assert.equal(diffOf(next, "nafnord"), 3 - WARMUP);
  assert.equal(diffOf(next, "sagnord"), MIN, "nothing below the floor");
});

test("reloading without answering costs nothing", () => {
  const S = blankState(), sess = newSession(S);
  play(S, sess, "nafnord", "11111111");
  for (let i = 0; i < 5; i++) newSession(S);
  assert.equal(storedLevel(S, "nafnord"), 3);
});

test("the first right answer of a visit gives the warm-up back", () => {
  const S = blankState();
  play(S, newSession(S), "nafnord", "11111111");        // 3
  const v = newSession(S);
  assert.equal(diffOf(v, "nafnord"), 2.5);
  assert.equal(play(S, v, "nafnord", "1", T0 + 1e6), 3, "back where it was");
  assert.equal(play(S, v, "nafnord", "1", T0 + 2e6), 3.5, "and the pair completes");
});

test("a wrong first answer of a visit lowers from the warm-up", () => {
  const S = blankState();
  play(S, newSession(S), "nafnord", "11111111");        // 3
  const v = newSession(S);
  assert.equal(play(S, v, "nafnord", "0", T0 + 1e6), 2);
  assert.equal(storedLevel(S, "nafnord"), 2);
});

test("in Blandað a skill met twice a day still climbs", () => {
  /* The defect of item 11: one or two questions a day per skill. */
  const S = blankState();
  let t = T0;
  for (let day = 0; day < 10; day++) {
    const sess = newSession(S, `2026-01-${String(day + 1).padStart(2, "0")}`);
    play(S, sess, "fallstjorn", "11", (t += 864e5));
  }
  assert.ok(storedLevel(S, "fallstjorn") >= 4, `only ${storedLevel(S, "fallstjorn")}`);
});

test("a weak record of answers keeps a skill low across many visits", () => {
  const S = blankState();
  let t = T0;
  for (let day = 0; day < 20; day++) {
    const sess = newSession(S);
    play(S, sess, "sagnord", day % 2 ? "10" : "01", (t += 864e5));   // 50% right
  }
  assert.ok(storedLevel(S, "sagnord") <= 1.5, `${storedLevel(S, "sagnord")}`);
});

/* ---------- the ranges: policy and declared bands ------------------------- */

const SENTS = [1, 2, 3, 4, 5].map((lvl) => ({ lvl }));

test("ranges: the policy's levels, the declared bands, and one above the hardest sentence", () => {
  const all = levelRanges(createPolicy(null, null), TASKS, SENTS);
  assert.deepEqual(all.nafnord, [1, 6], "sentences end at 5: band 6 still has level-5 sentences, 7 has none");
  assert.deepEqual(all.setningagerd, [1, 1], "every Setningagerð type declares [1]");
  const top = (id) => Math.max(...TASKS.filter((t) => t.skill === id || (t.anyOf || []).includes(id))
    .flatMap((t) => t.bands));
  assert.equal(all.toluord[1], Math.min(6, top("toluord")));
  const capped = levelRanges(createPolicy({ levels: { 4: false, 5: false, 6: false, 7: false } }, null), TASKS, SENTS);
  assert.deepEqual(capped.nafnord, [1, 3]);
  const raised = levelRanges(createPolicy(null, { levels: { 1: false, 2: false } }), TASKS, SENTS);
  assert.equal(raised.nafnord[0], 3);
});

test("a level never rises past its ceiling, and a high one steps down from it", () => {
  const S = blankState(), sess = newSession(S);
  applyRanges(sess, { ...Object.fromEntries(SKILL_IDS.map((id) => [id, [1, 7]])), nafnord: [1, 2] });
  play(S, sess, "nafnord", "1".repeat(20));
  assert.equal(diffOf(sess, "nafnord"), 2);
  sess.diff.sagnord = 5;
  sess.range.sagnord = [1, 3];
  bumpDiff(sess, S, "sagnord", true, T0 + 9e6);
  bumpDiff(sess, S, "sagnord", true, T0 + 9e6 + 1);
  assert.equal(diffOf(sess, "sagnord"), 5, "a right answer does not pull it down");
  bumpDiff(sess, S, "sagnord", false, T0 + 9e6 + 2);
  assert.equal(diffOf(sess, "sagnord"), 2.5, "a wrong one steps down from the ceiling");
});

test("applyRanges keeps the served level inside the range", () => {
  const S = blankState(), sess = newSession(S);
  sess.diff.ordaford = 6.5;
  applyRanges(sess, levelRanges(createPolicy(null, null), TASKS, SENTS));
  assert.ok(sess.diff.ordaford <= 6);
});

/* ---------- the API for calibration (items 40, 84) ----------------------- */

test("setSkillLevel is the one way to set a level from outside the answers", () => {
  const S = blankState(), sess = newSession(S);
  const rec = setSkillLevel(S, "lysingarord", 3.5, { source: "cal", now: T0, sess, history: "1101" });
  assert.deepEqual(rec, { d: 3.5, r: 0, h: "1101", at: T0, src: "cal" });
  assert.equal(diffOf(sess, "lysingarord"), 3.5, "takes effect at once, no warm-up");
  assert.equal(setSkillLevel(S, "lysingarord", 99, { now: T0 }).d, MAX);
  assert.throws(() => setSkillLevel(S, "nonsense", 2));
});

/* ---------- migration ------------------------------------------------------ */

test("migration: placed once from XP, never again", () => {
  const raw = blankState();
  delete raw.difficulty;
  raw.skills.nafnord = { xp: 5000, c: 400, w: 50, bestRun: 9 };
  raw.skills.sagnord = { xp: 5000, c: 100, w: 200, bestRun: 3 };    // 33% right
  const S = migrate(raw);
  assert.ok(storedLevel(S, "nafnord") > 1 && storedLevel(S, "nafnord") <= 3.5);
  assert.equal(storedLevel(S, "nafnord") * 2 % 1, 0, "in halves");
  assert.ok(storedLevel(S, "sagnord") <= 2, "XP counts only right answers: a 33% skill is held low");
  assert.equal(levelRecord(S, "nafnord").src, "xp");
  assert.equal(levelRecord(S, "nafnord").at, 0, "loses any merge against real answers");
  assert.equal(levelRecord(S, "fornofn").d, 1);
  /* Once saved, XP is not read again — not even when it grows. */
  const sess = newSession(S);
  play(S, sess, "nafnord", "0000000000");
  const again = JSON.parse(JSON.stringify(S));
  again.skills.nafnord.xp = 50000;
  assert.equal(storedLevel(migrate(again), "nafnord"), 1);
  assert.deepEqual(levelsFromXp(blankState().skills), {}, "a new pupil has nothing to migrate");
});

/* ---------- two devices --------------------------------------------------- */

test("merge: per skill, the record changed last wins whole", () => {
  const base = blankState();
  const phone = structuredClone(base), laptop = structuredClone(base);
  play(phone, newSession(phone), "nafnord", "111111", T0);              // 2.5 at T0
  play(laptop, newSession(laptop), "nafnord", "11", T0 + 1e6);          // 1.5, later
  play(laptop, newSession(laptop), "sagnord", "1111", T0 + 2e6);
  play(phone, newSession(phone), "greining", "11", T0 + 3e6);
  const m = mergeStates(base, phone, laptop);
  assert.equal(m.difficulty.nafnord.d, 1.5, "the later one");
  assert.equal(m.difficulty.sagnord.d, 2, "only the laptop had it");
  assert.equal(m.difficulty.greining.d, 1.5, "only the phone had it");
  assert.deepEqual(mergeStates(base, laptop, phone).difficulty, m.difficulty, "the same either way round");
  assert.equal(m.xp, phone.xp + laptop.xp, "the rest of the merge is untouched");
  /* never mutates its arguments */
  m.difficulty.nafnord.d = 7;
  assert.equal(laptop.difficulty.nafnord.d, 1.5);
  assert.deepEqual(mergeLevels(null, undefined, { a: { d: 2, at: 1 } }), { a: { d: 2, at: 1 } });
});

test("a newer level brought in by a merge is carried on from, not overwritten", () => {
  const S = blankState(), sess = newSession(S);
  play(S, sess, "nafnord", "11", T0);                       // 1.5 here
  S.difficulty.nafnord = { d: 4, r: 0, h: "1111", at: T0 + 5e6, src: "play" };  // the other device
  bumpDiff(sess, S, "nafnord", false, T0 + 6e6);
  assert.equal(storedLevel(S, "nafnord"), 3.5);
});

/* ---------- the server ----------------------------------------------------- */

test("guard: keeps the levels and bounds every field", () => {
  const raw = blankState();
  raw.difficulty = {
    nafnord: { d: 3.5, r: 1, h: "110101", at: T0, src: "play" },
    sagnord: { d: 99, r: 40, h: "1x0" + "1".repeat(50), at: -5, src: "<script>" },
    fornofn: "nonsense",
    invented: { d: 3 },
  };
  const S = cleanState(raw);
  assert.deepEqual(S.difficulty.nafnord, { d: 3.5, r: 1, h: "110101", at: T0, src: "play" });
  assert.equal(S.difficulty.sagnord.d, MAX);
  assert.equal(S.difficulty.sagnord.r, 1);
  assert.equal(S.difficulty.sagnord.h.length, WINDOW);
  assert.match(S.difficulty.sagnord.h, /^[01]+$/);
  assert.equal(S.difficulty.sagnord.at, 0);
  assert.equal(S.difficulty.sagnord.src, "play");
  assert.ok(!("fornofn" in S.difficulty) && !("invented" in S.difficulty));
  assert.deepEqual(cleanLevels("x"), {});
});

/* ---------- through the one path ------------------------------------------ */

test("settle writes the saved level: the answer path is where it moves", () => {
  const S = blankState(), sess = newSession(S);
  const task = { type: "choice", skill: "toluord", typeId: "to_val", options: ["a", "b"], answer: "a",
    base: 5, lvl: 1, cell: "x", word: null };
  for (let i = 0; i < 2; i++) settle(S, sess, task, judge(task, { picked: "a" }, { S, sess }));
  assert.equal(storedLevel(S, "toluord"), 1.5);
  assert.equal(levelRecord(S, "toluord").h, "11");
  assert.equal(visitLevels(S, "d").diff.toluord, 1);
});
