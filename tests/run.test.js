/* A practice session, the parts with no screen (critique item 76,
   src/js/core/run.js). Until v6.13 these lived inside app.js and could only be
   reached through a browser; the session controller (control/session.js) now
   calls them, and these tests hold what they do. */

import test from "node:test";
import assert from "node:assert/strict";
import { blankState, effectivePolicy } from "../src/js/core/state.js";
import { noteDiagnosis, activePatterns, focusTypes } from "../src/js/core/diagnosis.js";
import { NODES } from "../src/js/core/curriculum.js";
import { SKILL_IDS } from "../src/js/core/skills.js";
import { TASKS } from "../src/js/tasks/index.js";
import { TOPIC, typesOfSkill, newRun, notePick, typesPolicy, runPolicy, reviewPolicy,
  canPractiseNode, mixCounts, countAnswer, topicTypesOf, reportOf, writeRun, summaryOf } from "../src/js/core/run.js";
import { MIXED, MINE, TODAY, ASSIGNED } from "../src/js/ui/session.js";

const NOW = Date.UTC(2026, 10, 16, 12);
const never = () => { throw new Error("the opening was asked for"); };
const run = (S, topic = "nafnord", n = 10, focus = null, opts = { review: false }, today = null) =>
  newRun(S, topic, n, focus, opts, today, never, NOW);

/** A pupil with one active error pattern (three misses in five, core/diagnosis.js). */
function withPattern(p = "thf_thgf") {
  const S = blankState();
  const t = { type: "fill", skill: "nafnord", m: "ÞGFET", word: "hestur|kk" };
  const miss = [{ p, m: "ÞGFET", other: "ÞFET" }];
  [false, false, true, false, true].forEach((ok) =>
    noteDiagnosis(S, t, ok ? [] : miss, ok, "2026-11-12"));
  assert.deepEqual(activePatterns(S).map((x) => x.id), [p]);
  return S;
}

test("the topic ids are the ones saved in S.settings.runTopic and S.runs", () => {
  /* They are stored: a renamed id would orphan every pupil's last choice. */
  assert.deepEqual({ ...TOPIC }, { MIXED: "blandad", MINE: "villur", TODAY: "dagsins", ASSIGNED: "verkefni" });
  assert.ok(Object.isFrozen(TOPIC));
  for (const id of Object.values(TOPIC)) assert.ok(!SKILL_IDS.includes(id), `${id} is also a skill`);
  /* The picker's cards carry the same ids. */
  assert.deepEqual([MIXED.id, MINE.id, TODAY.id, ASSIGNED.id], [TOPIC.MIXED, TOPIC.MINE, TOPIC.TODAY, TOPIC.ASSIGNED]);
});

test("a skill's question types include those that may ask about it among others", () => {
  for (const id of SKILL_IDS) {
    const set = typesOfSkill(id, TASKS);
    for (const t of TASKS) {
      const about = t.skill === id || (t.anyOf || []).includes(id);
      assert.equal(set.has(t.id), about, `${id} / ${t.id}`);
    }
  }
  const any = TASKS.find((t) => t.anyOf && t.anyOf.length);
  if (any) for (const s of any.anyOf) assert.ok(typesOfSkill(s, TASKS).has(any.id));
});

test("a new session starts at nought, with the XP it began from and the time", () => {
  const S = blankState();
  S.xp = 140;
  const r = run(S, "sagnord", 15);
  assert.equal(r.topic, "sagnord"); assert.equal(r.n, 15);
  assert.deepEqual([r.i, r.c, r.j], [0, 0, 0]);
  assert.equal(r.xp0, 140); assert.equal(r.startedAt, NOW);
  assert.deepEqual([r.badges, r.items, r.found, r.review, r.reask, r.streaked, r.streaks], [[], [], [], [], [], [], []]);
  assert.deepEqual([r.chances, r.misses], [{}, {}]);
  assert.equal(r.focus, null); assert.equal(r.plan, null); assert.equal(r.assignment, null);
  assert.equal(r.types, null); assert.equal(r.label, null); assert.equal(r.placement, null);
});

test("'Villurnar mínar' with no pattern given aims at the three most active", () => {
  const S = withPattern();
  assert.deepEqual(run(S, TOPIC.MINE).focus, ["thf_thgf"]);
  assert.deepEqual(run(S, TOPIC.MINE, 10, ["ef"]).focus, ["ef"], "a pattern given is kept");
  assert.equal(run(blankState(), TOPIC.MINE).focus, null, "nothing active: no focus");
  assert.equal(run(S, "nafnord").focus, null, "only that topic does it");
  assert.equal(run(S, "nafnord", 10, []).focus, null, "an empty list is no focus");
  assert.deepEqual(run(S, "nafnord").before, ["thf_thgf"], "the patterns active when it began");
});

test("the opening: today's plan, a list given, none, or the due reviews", () => {
  const S = blankState();
  /* Today's session: its size, its reviews, its slots after them, no focus. */
  const today = { n: 9, reviews: ["a", "b"],
    slots: [{ kind: "review" }, { kind: "review" }, { kind: "pattern", p: "ef" }, { kind: "new", skill: "nafnord" }] };
  const t = newRun(S, TOPIC.TODAY, 10, ["ef"], {}, today, never, NOW);
  assert.equal(t.n, 9); assert.equal(t.focus, null);
  assert.deepEqual(t.review, ["a", "b"]); assert.notEqual(t.review, today.reviews, "a copy");
  assert.deepEqual(t.plan, [{ kind: "pattern", p: "ef" }, { kind: "new", skill: "nafnord" }]);
  /* A node of the skill map opens with exactly its own. */
  const keys = ["k1"];
  const g = newRun(S, "nafnord", 10, null, { review: keys }, null, never, NOW);
  assert.deepEqual(g.review, keys); assert.notEqual(g.review, keys);
  /* No opening at all. */
  assert.deepEqual(run(S).review, []);
  /* The ordinary case asks for the due reviews, with the run as it stands. */
  let seen = null;
  const o = newRun(S, "nafnord", 15, null, {}, null, (r) => { seen = r; return ["x"]; }, NOW);
  assert.deepEqual(o.review, ["x"]);
  assert.equal(seen, o, "the opening sees the session it opens");
  assert.equal(seen.n, 15);
});

test("the session's options are carried into the record", () => {
  const S = blankState();
  const opts = { review: false, types: ["fill"], skills: ["nafnord"], attrs: { fall: ["ÞGF"] },
    label: "Lesefni: x", lesson: "x", placement: { step: 0 }, assignment: { id: "a1", target: {}, scope: {} } };
  const r = run(S, "nafnord", 5, null, opts);
  for (const k of ["types", "skills", "attrs", "label", "lesson", "placement", "assignment"]) assert.equal(r[k], opts[k], k);
});

test("the picker remembers a category and a size, and nothing else does", () => {
  const pick = (topic, n, opts = {}) => {
    const S = blankState();
    S.settings.runTopic = "before"; S.settings.runSize = 99;
    notePick(S, topic, n, opts);
    return [S.settings.runTopic, S.settings.runSize];
  };
  assert.deepEqual(pick("nafnord", 15), ["nafnord", 15]);
  assert.deepEqual(pick(TOPIC.MIXED, 20), [TOPIC.MIXED, 20]);
  assert.deepEqual(pick(TOPIC.MINE, 20), ["before", 20], "'Villurnar mínar' keeps its size only");
  assert.deepEqual(pick(TOPIC.TODAY, 10), ["before", 99]);
  assert.deepEqual(pick(TOPIC.ASSIGNED, 10), ["before", 99]);
  assert.deepEqual(pick("nafnord", 5, { types: ["fill"] }), ["before", 99], "a Lesefni page's five");
  assert.deepEqual(pick("nafnord", 5, { placement: {} }), ["before", 99], "the first run's round");
});

test("the session's policy: its skill, its patterns' types, or exactly the types asked for", () => {
  const S = blankState();
  const P = effectivePolicy(S);
  const none = runPolicy(S, null);
  for (const t of TASKS) assert.equal(none.type(t.id), P.type(t.id), "no session: the whole policy");

  const sk = runPolicy(S, run(S, "nafnord"));
  assert.ok(sk.skill("nafnord"));
  for (const s of SKILL_IDS) if (s !== "nafnord") assert.ok(!sk.skill(s), `a nafnord session lets ${s} in`);

  const mixed = runPolicy(S, run(S, TOPIC.MIXED));
  for (const s of SKILL_IDS) assert.equal(mixed.skill(s), P.skill(s), s);

  const aimed = runPolicy(S, run(S, TOPIC.MINE, 10, ["ef"]));
  const want = focusTypes(["ef"]);
  for (const t of TASKS) if (aimed.type(t.id)) assert.ok(want.has(t.id), `${t.id} does not test ef`);

  /* Item 41: a type the pupil has switched off is asked when asked for by
     name; the administrator's ceiling is not. */
  const off = TASKS.find((t) => P.type(t.id) && P.skill(t.skill) && !t.anyOf);
  S.policy.types = { ...(S.policy.types || {}), [off.id]: false };
  assert.ok(!effectivePolicy(S).type(off.id), "the switch is off");
  const named = run(S, off.skill, 5, null, { review: false, types: [off.id], skills: [off.skill] });
  assert.ok(runPolicy(S, named).type(off.id), "asked for by name, the pupil's switch gives way");
  assert.ok(typesPolicy(S, named).type(off.id));
  S.allowed = { types: { [off.id]: false } };
  assert.ok(!runPolicy(S, named).type(off.id), "the ceiling does not");
});

test("a review is asked under the session's topic, not its patterns' types", () => {
  const S = blankState();
  const r = run(S, "nafnord", 10, ["ef"]);
  const P = reviewPolicy(S, r), whole = effectivePolicy(S);
  for (const t of TASKS.filter((x) => x.skill === "nafnord")) assert.equal(P.type(t.id), whole.type(t.id), t.id);
  for (const s of SKILL_IDS) if (s !== "nafnord") assert.ok(!P.skill(s), s);
  const m = reviewPolicy(S, run(S, TOPIC.MIXED));
  for (const s of SKILL_IDS) assert.equal(m.skill(s), whole.skill(s), s);
  for (const s of SKILL_IDS) assert.equal(reviewPolicy(S, null).skill(s), whole.skill(s), s);
});

test("a node of the skill map: locked nodes and the ceiling say no, the pupil's switches do not", () => {
  const S = blankState();
  const locked = NODES.find((n) => !n.types.length);
  assert.equal(canPractiseNode(S, locked.id, TASKS), false);
  assert.equal(canPractiseNode(S, "no-such-node", TASKS), false);
  const node = NODES.find((n) => n.types.length && !n.attrs && canPractiseNode(blankState(), n.id, TASKS));
  assert.ok(node, "some node can be practised by a new pupil");
  S.policy.types = { ...(S.policy.types || {}), ...Object.fromEntries(node.types.map((t) => [t, false])) };
  assert.equal(canPractiseNode(S, node.id, TASKS), true, "the pupil's own switches give way");
  S.allowed = { types: Object.fromEntries(node.types.map((t) => [t, false])) };
  assert.equal(canPractiseNode(S, node.id, TASKS), false, "the administrator's ceiling does not");
});

test("an answer is counted once, and only a question of the session", () => {
  const r = run(blankState());
  const t = { type: "fill", typeId: "fill", skill: "nafnord", inRun: true };
  assert.equal(countAnswer(r, t, false, ["thf_thgf", "greinir"], [{ p: "thf_thgf", ex: { w: "x" } }]), true);
  assert.equal(t.closed, true);
  assert.equal(countAnswer(r, t, true, [], []), false, "a second verdict on the same question (item 42's retry)");
  assert.deepEqual([r.i, r.c, r.j], [1, 0, 1]);
  assert.deepEqual(r.chances, { thf_thgf: 1, greinir: 1 });
  assert.deepEqual(r.misses, { thf_thgf: 1 });
  assert.deepEqual(r.found, [{ p: "thf_thgf", ex: { w: "x" } }]);
  assert.deepEqual(r.items, [{ type: "fill", skill: "nafnord", ok: false }]);

  countAnswer(r, { type: "choice", skill: "fornofn", inRun: true }, true, ["greinir"], [{ p: "ef" }]);
  countAnswer(r, { type: "villur", typeId: "villur", skill: "malbeiting", inRun: true }, null, [], []);
  assert.deepEqual([r.i, r.c, r.j], [3, 1, 2], "no right answer: answered, not graded");
  assert.deepEqual(r.items.map((x) => [x.type, x.ok]), [["fill", false], ["choice", true], ["villur", null]]);
  assert.deepEqual(r.found[1], { p: "ef", ex: null });
  assert.equal(r.chances.greinir, 2);

  /* A drill's question, one of "Þrjár í röð", or no session at all. */
  assert.equal(countAnswer(r, { type: "fill", drill: true }, true, [], []), false);
  assert.equal(countAnswer(r, { type: "fill", streak: true }, true, [], []), false);
  assert.equal(countAnswer(null, { type: "fill", inRun: true }, true, [], []), false);
  assert.equal(countAnswer(r, null, true, [], []), false);
  assert.equal(r.i, 3);
  assert.deepEqual(mixCounts(r), { fill: 1, choice: 1, villur: 1 });
  assert.deepEqual(mixCounts(run(blankState())), {});
});

test("the summary's one thing to remember is one this session's topic could test", () => {
  assert.equal(topicTypesOf(run(blankState(), TOPIC.MIXED), TASKS), null);
  assert.deepEqual(topicTypesOf(run(blankState(), "fornofn"), TASKS), typesOfSkill("fornofn", TASKS));
  const page = run(blankState(), "nafnord", 5, null, { review: false, types: ["fill", "table"] });
  assert.deepEqual(topicTypesOf(page, TASKS), new Set(["fill", "table"]));
  const asg = (scope) => run(blankState(), TOPIC.ASSIGNED, 10, null, { review: false, assignment: { id: "a", target: {}, scope } });
  assert.deepEqual(topicTypesOf(asg({ types: ["verb"] }), TASKS), new Set(["verb"]));
  assert.deepEqual(topicTypesOf(asg({ skills: ["fornofn", "sagnord"] }), TASKS),
    new Set([...typesOfSkill("fornofn", TASKS), ...typesOfSkill("sagnord", TASKS)]));
  assert.equal(topicTypesOf(asg({}), TASKS), null);

  /* An old active pattern no question of the topic tests is not brought in. */
  const S = withPattern("thf_thgf");
  const tested = focusTypes(["thf_thgf"]);
  const away = SKILL_IDS.find((s) => ![...typesOfSkill(s, TASKS)].some((t) => tested.has(t)));
  const near = SKILL_IDS.find((s) => [...typesOfSkill(s, TASKS)].some((t) => tested.has(t)));
  assert.ok(away && near);
  assert.equal(reportOf(run(S, away), S, TASKS).focus, null);
  assert.equal(reportOf(run(S, near), S, TASKS).focus.id, "thf_thgf");
  assert.equal(reportOf(run(S, TOPIC.MIXED), S, TASKS).focus.id, "thf_thgf");
});

test("a finished session is written down, the last forty kept, and summed up", () => {
  const S = blankState();
  S.xp = 50;
  const r = run(S, "nafnord", 10, null, { review: false, types: ["fill"], skills: ["nafnord"], label: "L", lesson: "p" });
  r.i = 7; r.c = 5; r.j = 6;
  S.xp = 92;
  const report = { found: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }] };
  assert.equal(writeRun(S, r, report, "2026-11-16", NOW + 1000), 42);
  assert.deepEqual(S.runs.at(-1), { at: NOW + 1000, d: "2026-11-16", topic: "nafnord", n: 7, c: 5, j: 6, xp: 42, top: ["a", "b", "c"] });
  S.xp = 10;
  assert.equal(writeRun(S, r, { found: [] }, "2026-11-16", NOW), 0, "XP lost to decay is not negative XP");
  for (let k = 0; k < 45; k++) writeRun(S, r, { found: [] }, "2026-11-16", NOW + k);
  assert.equal(S.runs.length, 40);
  assert.equal(S.runs.at(-1).at, NOW + 44);

  const done = summaryOf(r, report, 42, true, NOW + 90000);
  assert.equal(done.ms, 90000); assert.equal(done.early, true); assert.equal(done.xp, 42);
  assert.deepEqual([done.n, done.i, done.c, done.j], [10, 7, 5, 6]);
  assert.equal(done.report, report); assert.equal(done.items, r.items); assert.equal(done.badges, r.badges);
  assert.deepEqual(done.again, { review: false, types: ["fill"], skills: ["nafnord"], attrs: null, label: "L", lesson: "p" },
    "'Önnur lota' repeats a page's session as it was");
  assert.equal(done.assignment, null);
  const plain = summaryOf(run(S), report, 0, false, NOW);
  assert.equal(plain.again, null); assert.equal(plain.label, null); assert.deepEqual(plain.streaks, []);
  const a = run(S, TOPIC.ASSIGNED, 10, null, { review: false, assignment: { id: "a7", target: { kind: "skill", id: "nafnord" }, scope: {} } });
  assert.deepEqual(summaryOf(a, report, 0, false, NOW).assignment,
    { id: "a7", target: { kind: "skill", id: "nafnord" }, sent: null }, "sent: filled in when the server answers");
});
