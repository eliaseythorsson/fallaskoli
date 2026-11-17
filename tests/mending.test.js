/* Item 56: badges for getting better — a pattern mended, reviews on time,
 * each skill's mastery mark — and the record they are read from
 * (core/mending.js). Item 58's leaderboard figure is tested in
 * tests/framfarir.test.js. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { BADGES, ACTIVE_BADGES, RETIRED_56, checkBadges, badgeById } from "../src/js/core/badges.js";
import { blankState, newSession, badgeContext, migrate } from "../src/js/core/state.js";
import { PATTERNS, noteDiagnosis, standingOf } from "../src/js/core/diagnosis.js";
import { noteMending, cleanRun, MEND_RUN, patternsMended, openPatterns, reviewsOnTime,
         sanitiseMend, mergeMend, noteReviewsPassed, blankMend } from "../src/js/core/mending.js";
import { noteTypeAnswer } from "../src/js/core/mastery.js";
import { storedLevel } from "../src/js/core/difficulty.js";
import { mergeStates } from "../src/js/core/merge.js";
import { cleanState } from "../server/guard.mjs";

const real = PATTERNS.filter((p) => !p.meta);
const P = real[0].id, Q = real[1].id, R3 = real[2].id;

/** Write `h` as the pattern's recent history: what noteDiagnosis keeps. */
const setHist = (S, id, h) => {
  S.diag[id] = { n: h.length, w: [...h].filter((c) => c === "0").length, h, last: null, ex: [] };
};
/** One more answer on the pattern, then the mending check — as app.finish does. */
const answer = (S, id, ok, day) => {
  const r = S.diag[id];
  r.n++; if (!ok) r.w++;
  r.h = (r.h + (ok ? "1" : "0")).slice(-16);
  return noteMending(S, [id], day);
};

/* ---------- the rule ---------------------------------------------------------- */

test("cleanRun counts the right answers the history ends in", () => {
  assert.equal(cleanRun(""), 0);
  assert.equal(cleanRun("0001111"), 4);
  assert.equal(cleanRun("1111"), 4);
  assert.equal(cleanRun("1110"), 0);
});

test("a pattern is mended: active, then ten right in a row, the last on a later day", () => {
  const S = blankState();
  setHist(S, P, "00011");
  assert.ok(standingOf(S.diag[P]).active, "the fixture must start active");
  /* The next answer sees it active and opens it, dated today. */
  assert.deepEqual(answer(S, P, false, "2026-11-16"), []);
  assert.deepEqual(openPatterns(S), [P]);
  assert.equal(S.mend.open[P], "2026-11-16");
  /* Ten right the same day: practised, not yet mended. */
  for (let i = 0; i < MEND_RUN; i++) assert.deepEqual(answer(S, P, true, "2026-11-16"), []);
  assert.equal(patternsMended(S), 0, "the same day is short-term memory");
  /* The first right answer on a later day mends it. */
  assert.deepEqual(answer(S, P, true, "2026-11-17"), [P]);
  assert.equal(patternsMended(S), 1);
  assert.deepEqual(openPatterns(S), []);
  assert.deepEqual(S.mend.log, [{ p: P, d: "2026-11-17" }]);
});

test("a miss inside the ten starts the count again", () => {
  const S = blankState();
  setHist(S, P, "00011");
  answer(S, P, false, "2026-11-10");
  for (let i = 0; i < 9; i++) answer(S, P, true, "2026-11-11");
  answer(S, P, false, "2026-11-11");
  assert.equal(cleanRun(S.diag[P].h), 0);
  for (let i = 0; i < 9; i++) assert.deepEqual(answer(S, P, true, "2026-11-12"), []);
  assert.deepEqual(answer(S, P, true, "2026-11-12"), [P], "ten right after the miss");
});

test("a pattern that was never active is never mended, however much is right", () => {
  const S = blankState();
  setHist(S, P, "1111111111");
  for (let i = 0; i < 40; i++) assert.deepEqual(answer(S, P, true, `2026-11-${10 + (i % 5)}`), []);
  assert.equal(patternsMended(S), 0);
  assert.deepEqual(S.mend.log, []);
});

test("once per activation: a mended pattern has to go wrong again to be mended again", () => {
  const S = blankState();
  setHist(S, P, "00011");
  answer(S, P, false, "2026-11-10");
  for (let i = 0; i < MEND_RUN; i++) answer(S, P, true, "2026-11-11");
  assert.equal(S.mend.done[P], 1);
  for (let i = 0; i < 30; i++) assert.deepEqual(answer(S, P, true, "2026-11-12"), []);
  assert.equal(S.mend.done[P], 1, "more right answers are not a second mending");
  /* Goes wrong often again — active again — and is mended a second time. */
  for (let i = 0; i < 6; i++) answer(S, P, false, "2026-11-13");
  assert.deepEqual(openPatterns(S), [P]);
  for (let i = 0; i < MEND_RUN; i++) answer(S, P, true, "2026-11-14");
  assert.equal(S.mend.done[P], 2);
  assert.equal(patternsMended(S), 1, "the badges count DIFFERENT patterns");
});

test("the diagnosis's own blind spot (Ógreint) is never opened or mended", () => {
  const S = blankState();
  S.diag.ogreint = { n: 9, w: 9, h: "000000000", last: null, ex: [] };
  assert.deepEqual(noteMending(S, ["ogreint"], "2026-11-16"), []);
  assert.deepEqual(openPatterns(S), []);
});

test("noteMending reads what noteDiagnosis wrote", () => {
  const S = blankState();
  setHist(S, P, "00011");
  const task = { type: "fill", typeId: "fill", skill: "nafnord", word: "hestur|kk" };
  /* A wrong answer found as pattern P: written to P, and P is opened. */
  const ids = noteDiagnosis(S, task, [{ p: P }], false, "2026-11-16");
  assert.ok(ids.includes(P));
  noteMending(S, ids, "2026-11-16");
  assert.equal(S.mend.open[P], "2026-11-16");
});

/* ---------- the badges ---------------------------------------------------------- */

const ctxOf = (S, extra = {}) => badgeContext(S, newSession(S), extra, new Date(2026, 10, 17, 12));
const won = (S, ids, extra = {}) =>
  checkBadges(ctxOf(S, extra), S.badges, {}, BADGES.filter((b) => ids.includes(b.id))).map((b) => b.id);

test("the mending badges count different patterns mended", () => {
  const S = blankState();
  assert.deepEqual(won(S, ["mend1", "mend3", "mend10"]), []);
  S.mend.done = { [P]: 2 };
  assert.deepEqual(won(S, ["mend1", "mend3", "mend10"]), ["mend1"], "one pattern twice is still one");
  S.mend.done = { [P]: 1, [Q]: 1, [R3]: 1 };
  assert.deepEqual(won(S, ["mend1", "mend3", "mend10"]), ["mend1", "mend3"]);
});

test("a mending done on this answer earns its badge on this answer", () => {
  const S = blankState();
  setHist(S, P, "00011");
  answer(S, P, false, "2026-11-16");
  for (let i = 0; i < MEND_RUN; i++) answer(S, P, true, "2026-11-17");
  assert.deepEqual(won(S, ["mend1"]), ["mend1"]);
});

test("the review badges count reviews passed on time, every one of them once", () => {
  const S = blankState();
  /* Each pass is tallied under its pattern, its category and its type; the
     type tallies alone add up to every pass. */
  S.review.stats = {
    "p:x": { a: 9, l: 0, p: 9, t: 9, g: 0, x: 0 },
    "s:nafnord": { a: 9, l: 0, p: 9, t: 9, g: 0, x: 0 },
    "t:fill": { a: 6, l: 0, p: 6, t: 6, g: 0, x: 0 },
    "t:tbl_no": { a: 4, l: 0, p: 5, t: 3, g: 0, x: 0 },
  };
  assert.equal(reviewsOnTime(S), 9);
  assert.deepEqual(won(S, ["review10"]), [], "nine is not ten; late ones do not count");
  S.review.stats["t:tbl_no"].t = 4;
  assert.equal(reviewsOnTime(S), 10);
  assert.deepEqual(won(S, ["review10", "review50"]), ["review10"]);
});

/** `k` right of `n` answers to the noun cloze at the pupil's level now. */
function nounAnswers(S, n, k) {
  const band = Math.round(storedLevel(S, "nafnord"));
  for (let i = 0; i < n; i++) noteTypeAnswer(S, "fill", band, i < k, 1000 + i);
}

test("each skill's mastery mark earns its badge at 3 and at 4, on an answer in that skill", () => {
  const ids = ["mastery_nafnord_3", "mastery_nafnord_4"];
  const S = blankState();
  nounAnswers(S, 20, 16);                                   // 80%: Gott vald
  assert.deepEqual(won(S, ids, { skill: "nafnord" }), ["mastery_nafnord_3"]);
  assert.deepEqual(won(S, ids, { skill: "sagnord" }), [], "a verb answer does not judge nouns");
  const T = blankState();
  nounAnswers(T, 20, 20);                                   // 100%, nothing missed: Fullt vald
  assert.deepEqual(won(T, ids, { skill: "nafnord" }), ids);
  const U = blankState();
  nounAnswers(U, 20, 10);                                   // 50%: Þarf æfingu
  assert.deepEqual(won(U, ids, { skill: "nafnord" }), []);
});

test("every skill has both mastery badges, visible, and all of item 56's are winnable", () => {
  const better = ACTIVE_BADGES.filter((b) => b.group === "framfarir");
  for (const b of better) {
    assert.equal(b.hidden, false, `${b.id} is a signpost and should be visible`);
    assert.ok(b.once, `${b.id} is won once`);
    assert.ok(b.nm && b.ds && b.ico, b.id);
  }
  const mastery = better.filter((b) => b.id.startsWith("mastery_"));
  assert.equal(mastery.length, 2 * new Set(mastery.map((b) => b.skill)).size);
  for (const id of ["mend1", "mend3", "mend10", "review10", "review50", "review200"])
    assert.ok(badgeById(id) && !badgeById(id).retired, id);
});

/* ---------- making room: retired, and kept by whoever won them ---------------- */

test("the retired collection rungs are never awarded again", () => {
  for (const id of RETIRED_56) {
    const b = badgeById(id);
    assert.ok(b && b.retired, `${id} should exist and be retired`);
    assert.ok(!ACTIVE_BADGES.includes(b), id);
  }
  const S = blankState();
  const ctx = ctxOf(S, { collection: { total: 5000, byClass: { kk: 999, kvk: 999, hk: 999, lo: 999, so: 999, ao: 999 },
    coverage: {}, rare: 0, mastered: 0, fl: 0, sets: null } });
  const got = checkBadges(ctx, {}, {}, BADGES.filter((b) => RETIRED_56.has(b.id)));
  assert.deepEqual(got, []);
});

test("migration keeps every badge a pupil has earned, the retired ones included", () => {
  const rec = { n: 1, dates: ["2026-10-01"], first: "2026-10-01", last: "2026-10-01" };
  const raw = { xp: 500, badges: { coll25: rec, coll_kk_100: rec, coll1500: rec, s_dawn: rec, coll100: rec } };
  const S = migrate(JSON.parse(JSON.stringify(raw)));
  for (const id of Object.keys(raw.badges)) assert.deepEqual(S.badges[id], rec, `${id} lost by migrate`);
  /* The server's guard keeps them too: every id the program ever had. */
  const C = cleanState(JSON.parse(JSON.stringify(raw)));
  for (const id of Object.keys(raw.badges)) assert.ok(C.badges[id], `${id} lost by the server`);
  /* And the cabinet shows a retired badge to whoever holds it (ui/panels.js
     draws `BADGES` filtered by `!b.retired || S.badges[b.id]`). */
  const shown = BADGES.filter((b) => !b.retired || S.badges[b.id]).map((b) => b.id);
  for (const id of ["coll25", "coll_kk_100", "coll1500"]) assert.ok(shown.includes(id), id);
});

/* ---------- saved, loaded, merged ------------------------------------------------ */

test("an old state gets an empty record; a hostile one is cut to shape", () => {
  assert.deepEqual(migrate({}).mend, blankMend());
  const bad = sanitiseMend({
    open: { [P]: "2026-11-01", "<script>": "2026-11-01", [Q]: "yesterday" },
    done: { [P]: 3, [Q]: -4, [R3]: "x" },
    log: [{ p: P, d: "2026-11-02" }, { p: "x y", d: "2026-11-02" }, "nonsense",
      ...Array.from({ length: 100 }, (_, i) => ({ p: Q, d: `2025-01-${String(1 + (i % 28)).padStart(2, "0")}` }))],
    rv: { "2026-11-02": 4, "2026-11-03": -1, nope: 3 },
  });
  assert.deepEqual(bad.open, { [P]: "2026-11-01" });
  assert.deepEqual(bad.done, { [P]: 3 });
  assert.equal(bad.log.length, 60);
  assert.deepEqual(bad.log[bad.log.length - 1], { p: P, d: "2026-11-02" }, "the newest are kept");
  assert.deepEqual(bad.rv, { "2026-11-02": 4 });
});

test("the server refuses days in the future", () => {
  const C = cleanState({ mend: { open: { [P]: "2099-01-01" }, log: [{ p: P, d: "2099-01-01" }],
    rv: { "2099-01-01": 5, "2026-11-10": 2 } } }, { today: new Date(2026, 10, 16) });
  assert.deepEqual(C.mend.open, {});
  assert.deepEqual(C.mend.log, []);
  assert.deepEqual(C.mend.rv, { "2026-11-10": 2 });
});

test("two devices: a mending on one closes the pattern on both, and counts add", () => {
  const base = { open: { [P]: "2026-11-10", [Q]: "2026-11-11" }, done: {}, log: [], rv: { "2026-11-12": 1 } };
  const local = { open: { [Q]: "2026-11-11" }, done: { [P]: 1 }, log: [{ p: P, d: "2026-11-13" }],
    rv: { "2026-11-12": 1, "2026-11-13": 2 } };
  const remote = { open: { [P]: "2026-11-10", [Q]: "2026-11-11", [R3]: "2026-11-13" }, done: {},
    log: [], rv: { "2026-11-12": 3 } };
  const m = mergeMend(base, local, remote);
  assert.deepEqual(m.open, { [Q]: "2026-11-11", [R3]: "2026-11-13" }, "P was mended on the laptop");
  assert.deepEqual(m.done, { [P]: 1 });
  assert.deepEqual(m.log, [{ p: P, d: "2026-11-13" }]);
  assert.deepEqual(m.rv, { "2026-11-12": 3, "2026-11-13": 2 });
  /* And through the whole-state merge. */
  const S = mergeStates({ mend: base }, { mend: local }, { mend: remote });
  assert.deepEqual(S.mend.done, { [P]: 1 });
});

test("reviews passed are counted per day, and old days fall away", () => {
  const S = blankState();
  noteReviewsPassed(S, 2, "2026-10-01");
  noteReviewsPassed(S, 0, "2026-11-16");
  noteReviewsPassed(S, 3, "2026-11-16");
  noteReviewsPassed(S, 1, "2026-11-16");
  assert.deepEqual(S.mend.rv, { "2026-11-16": 4 }, "five weeks are kept, not more");
});
