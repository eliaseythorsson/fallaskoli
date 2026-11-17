/* v6.13, items 37 and 65 — the rules and the drawing, without a server.
 *
 * core/assignment.js (what may be set, what it narrows to, the deadline,
 * which attempt counts), core/classview.js (the class table and its CSV),
 * and the pure HTML of ui/session.js (the cards at the top of Æfa, the line
 * in the summary) and ui/teacher.js (the teacher's tables). The routes and
 * who may call them are tests/teacher.test.js; the whole thing in Chrome is
 * tools/server-test.mjs. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, newSession } from "../src/js/core/state.js";
import { SKILL_IDS } from "../src/js/core/skills.js";
import { narrowPolicy, blankPolicy } from "../src/js/core/policy.js";
import { runPolicy } from "../src/js/core/run.js";
import { seeded } from "../src/js/core/duel.js";
import { standingOf, focusTypes, targets, PATTERNS, huntPreferFor } from "../src/js/core/diagnosis.js";
import { NODES, presetContent } from "../src/js/core/curriculum.js";
import { TASKS, nextTask, makeView } from "../src/js/tasks/index.js";
import {
  ASSIGN, KINDS, NOT_AIMABLE, ASSIGNABLE_PATTERNS, ASSIGNABLE_NODES, validTarget, cleanTarget, targetName,
  scopeOf, patternsOf, assignmentPolicy, dueEnd, dueProblem, isOpen, prune, openCount, dueText,
  cleanResult, better, recordResult, viewForPupil,
} from "../src/js/core/assignment.js";
import { pupilStandings, classColumns, csvField, patternCSV } from "../src/js/core/classview.js";
import { assignmentsHTML, assignmentState, assignmentSummary, ASSIGNED, topicName } from "../src/js/ui/session.js";
import { patternTableHTML, assignmentCardHTML, targetOptionsHTML } from "../src/js/ui/teacher.js";

const lex = buildLexicon(DATA);
const NOW = Date.parse("2026-11-16T10:00:00Z");      // a Monday
const typesOfSkill = (id) => new Set(TASKS.filter((t) => t.skill === id || (t.anyOf || []).includes(id)).map((t) => t.id));

/* Every target a teacher can pick. */
const ALL = [
  ...SKILL_IDS.map((id) => ({ kind: "skill", id })),
  ...ASSIGNABLE_PATTERNS.map((p) => ({ kind: "pattern", id: p.id })),
  ...ASSIGNABLE_NODES.map((n) => ({ kind: "node", id: n.id })),
  ...["8", "9", "10"].map((id) => ({ kind: "year", id })),
];

/* ---------- targets ------------------------------------------------------- */

test("targets: the four kinds, and nothing else gets through", () => {
  assert.deepEqual(KINDS, ["skill", "pattern", "node", "year"]);
  for (const t of ALL) assert.ok(validTarget(t), JSON.stringify(t));
  for (const t of [null, {}, { kind: "skill" }, { kind: "skill", id: "ekki" }, { kind: "pattern", id: "ogreint" },
    { kind: "node", id: NODES.find((n) => !n.types.length)?.id || "x" }, { kind: "year", id: "7" },
    { kind: "lesson", id: "foll" }, { kind: "__proto__", id: "x" }]) {
    assert.equal(validTarget(t), false, JSON.stringify(t));
  }
  /* cleanTarget keeps the two fields and makes the id a string */
  assert.deepEqual(cleanTarget({ kind: "year", id: 9, extra: "<b>" }), { kind: "year", id: "9" });
  assert.equal(cleanTarget({ kind: "skill", id: "<script>" }), null);
});

test("names: what the pupil reads on the card", () => {
  assert.equal(targetName({ kind: "skill", id: "nafnord" }), "Nafnorð");
  assert.equal(targetName({ kind: "pattern", id: "thf_thgf" }), "Þolfall og þágufall ruglast");
  assert.equal(targetName({ kind: "node", id: "lo-stig" }), "Stigbreyting");
  assert.equal(targetName({ kind: "year", id: "8" }), "Efni 8. bekkjar");
  for (const t of ALL) assert.ok(targetName(t).length > 2, JSON.stringify(t));
});

test("scope: what a session on each target is narrowed to", () => {
  assert.deepEqual(scopeOf({ kind: "skill", id: "fornofn" }), { skills: ["fornofn"], types: null, focus: null });
  const p = scopeOf({ kind: "pattern", id: "ef" });
  assert.deepEqual(p.focus, ["ef"]);
  assert.deepEqual(new Set(p.types), focusTypes(["ef"]));
  assert.deepEqual(scopeOf({ kind: "node", id: "no-foll" }).types, NODES.find((n) => n.id === "no-foll").types);
  assert.deepEqual(scopeOf({ kind: "year", id: "9" }).types.sort(), presetContent(9).types.slice().sort());
  assert.equal(scopeOf({ kind: "skill", id: "nope" }), null);
});

/* A session as the session controller builds it (control/session.js): the
   assignment's policy, narrowed to the focus pattern's types (core/run.js
   `runPolicy`), and the error hunt told which bank items to prefer. */
function buildFor(t, band, tries = 40, rngSeed = 7) {
  const S = blankState();
  const sess = newSession(S);
  Object.keys(sess.diff).forEach((k) => { sess.diff[k] = band; });
  /* A pattern left off the list has no scope of its own; build it as one. */
  const sc = scopeOf(t) || { skills: null, types: [...focusTypes([t.id])], focus: [t.id] };
  const policy = runPolicy(S, { assignment: { target: t }, focus: sc.focus });
  const view = makeView({ S, sess, policy, inRun: true, today: "2026-11-16",
    huntPrefer: huntPreferFor(sc.focus || []) });
  const rng = seeded(rngSeed);
  const out = { built: 0, aimed: 0, types: new Set() };
  for (let k = 0; k < tries; k++) {
    const b = nextTask(lex, view, rng);
    if (!b) continue;
    out.built++;
    out.types.add(b.task.typeId);
    if (sc.focus && targets(b.task, sc.focus)) out.aimed++;
  }
  return out;
}

test("every target a teacher can pick builds questions on that material", () => {
  /* A new pupil: year 8 switched on, nothing else. A teacher's target from
     year 9 or 10 must still be askable — the teacher chose it. Patterns are
     tried at þyngd 5 and 7, where every assignable one can be aimed at;
     below that some fall back to their question types (NOT_AIMABLE's
     comment). */
  for (const t of ALL) {
    const sc = scopeOf(t);
    const r = buildFor(t, sc.focus ? 5 : 1, sc.focus ? 60 : 12);
    if (sc.focus && !r.aimed) {
      const hi = buildFor(t, 7, 60);
      r.aimed = hi.aimed; r.built += hi.built; hi.types.forEach((x) => r.types.add(x));
    }
    assert.ok(r.built >= 1, "nothing could be built for " + JSON.stringify(t));
    for (const ty of r.types) {
      if (sc.types) assert.ok(sc.types.includes(ty), `${JSON.stringify(t)} asked ${ty}`);
      else assert.ok(sc.skills.some((s) => typesOfSkill(s).has(ty)), `${JSON.stringify(t)} asked ${ty}`);
    }
    if (sc.focus) assert.ok(r.aimed >= 1, "no question tests the pattern " + t.id);
  }
});

test("a pattern left out because nothing can be aimed at it is still out of reach", () => {
  for (const id of NOT_AIMABLE) {
    for (const band of [3, 5, 7]) {
      const r = buildFor({ kind: "pattern", id }, band, 100);
      assert.equal(r.aimed, 0, `questions now test "${id}" at þyngd ${band}: take it off NOT_AIMABLE`);
    }
    assert.equal(validTarget({ kind: "pattern", id }), false);
  }
});

test("the teacher's choice overrides the pupil's switches, never the ceiling", () => {
  const S = blankState();
  S.enabled.setningafraedi = false;
  const t = { kind: "skill", id: "setningafraedi" };
  assert.equal(assignmentPolicy(S, t).skill("setningafraedi"), true, "the pupil's own switch shut the teacher out");
  assert.equal(assignmentPolicy(S, t).skill("nafnord"), false, "the session was not narrowed");
  S.allowed = { ...blankPolicy(), skills: { setningafraedi: false } };
  assert.equal(assignmentPolicy(S, t).skill("setningafraedi"), false, "the administrator's ceiling was overridden");
  /* a type the ceiling forbids stays forbidden inside a node */
  const S2 = blankState();
  S2.allowed = { ...blankPolicy(), types: { tbl_no: false } };
  const P = assignmentPolicy(S2, { kind: "node", id: "no-foll" });
  assert.equal(P.type("tbl_no"), false);
  assert.equal(P.type("fill"), true);
  assert.equal(P.type("verb"), false);
});

test("the patterns an assignment's material tests", () => {
  assert.deepEqual(patternsOf({ kind: "pattern", id: "ef" }), ["ef"]);
  const nouns = patternsOf({ kind: "skill", id: "nafnord" }, typesOfSkill);
  assert.ok(nouns.includes("thf_thgf") && nouns.includes("ef") && nouns.includes("ending"), nouns.join());
  assert.ok(!nouns.includes("ogreint"));
  const node = patternsOf({ kind: "node", id: "lo-samraemi" });
  assert.ok(node.length > 0);
  assert.ok(node.every((id) => PATTERNS.find((p) => p.id === id).types.some((x) => ["lo_samr"].includes(x))));
});

/* ---------- the deadline -------------------------------------------------- */

test("deadlines: a real date, today to sixty days ahead, ending at midnight", () => {
  assert.equal(dueProblem("2026-11-16", NOW), null);
  assert.equal(dueProblem("2027-01-15", NOW), null);
  assert.match(dueProblem("2027-01-16", NOW), /60 daga/);
  assert.match(dueProblem("2026-11-15", NOW), /liðinn/);
  for (const bad of ["", "2026-11-31", "2026-02-29", "16.11.2026", "2026-11-16T00:00", null, 20261116])
    assert.match(dueProblem(bad, NOW), /Veldu skiladag/, String(bad));
  const a = { due: "2026-11-16" };
  assert.equal(isOpen(a, Date.parse("2026-11-16T23:59:59Z")), true);
  assert.equal(isOpen(a, Date.parse("2026-11-17T00:00:00Z")), false);
  assert.equal(dueEnd("2026-11-16"), Date.parse("2026-11-16T23:59:59.999Z"));
  const list = [{ due: "2026-11-16", group: "g" }, { due: "2026-10-01", group: "g" }, { due: "2026-10-20", group: "h" }];
  assert.deepEqual(prune(list, NOW).map((x) => x.due), ["2026-11-16", "2026-10-20"]);
  assert.equal(openCount(list, "g", NOW), 1);
});

test("the deadline in words, after \"skil\": today, tomorrow, or the day in the accusative", () => {
  assert.equal(dueText("2026-11-16", NOW), "í dag");
  assert.equal(dueText("2026-11-17", NOW), "á morgun");
  assert.equal(dueText("2026-11-20", NOW), "föstudaginn 20. nóvember");
  assert.equal(dueText("2026-12-01", NOW), "þriðjudaginn 1. desember");
  assert.equal(dueText("2026-11-22", NOW), "sunnudaginn 22. nóvember");
});

/* ---------- results ------------------------------------------------------- */

test("a result is three whole numbers in order, and no more questions than set", () => {
  assert.deepEqual(cleanResult({ i: 10, j: 9, c: 7, extra: "x" }, 10), { i: 10, j: 9, c: 7 });
  for (const b of [{ i: 11, j: 1, c: 1 }, { i: 5, j: 6, c: 1 }, { i: 5, j: 5, c: 6 }, { i: 0, j: 0, c: 0 },
    { i: "5", j: 5, c: 5 }, { i: 2.5, j: 1, c: 1 }, null]) assert.equal(cleanResult(b, 10), null, JSON.stringify(b));
});

test("which attempt counts: the latest until done, then the best complete one", () => {
  let r = recordResult(null, { i: 3, j: 3, c: 3 }, 10, 1);
  assert.deepEqual(r, { i: 3, j: 3, c: 3, done: false, at: 1, tries: 1 });
  r = recordResult(r, { i: 2, j: 2, c: 2 }, 10, 2);
  assert.equal(r.i, 3, "a shorter unfinished go replaced a longer one");
  r = recordResult(r, { i: 10, j: 10, c: 5 }, 10, 3);
  assert.equal(r.done, true);
  r = recordResult(r, { i: 10, j: 10, c: 4 }, 10, 4);
  assert.equal(r.c, 5, "a worse complete go replaced a better one");
  r = recordResult(r, { i: 4, j: 4, c: 4 }, 10, 5);
  assert.equal(r.done, true, "an unfinished go undid a finished one");
  r = recordResult(r, { i: 10, j: 10, c: 8 }, 10, 6);
  assert.equal(r.c, 8);
  assert.equal(r.tries, 5 + 1);
  /* ungraded (Orðaforði): done counts, scores do not compare */
  assert.equal(better({ i: 5, j: 0, c: 0, done: true }, { i: 5, j: 0, c: 0, done: true }).j, 0);
});

test("the pupil's view carries no one else's result", () => {
  const a = { id: "x", group: "g", by: "t", target: { kind: "skill", id: "nafnord" }, n: 10, due: "2026-11-20",
    note: "", created: 1, res: { me: { i: 10, j: 10, c: 9, done: true, at: 5, tries: 2 }, you: { i: 1, j: 1, c: 0 } } };
  const v = viewForPupil(a, "me", NOW);
  assert.deepEqual(v.mine, { i: 10, j: 10, c: 9, done: true, at: 5 });
  assert.ok(!JSON.stringify(v).includes("you") && !("by" in v) && !("group" in v));
  assert.equal(viewForPupil(a, "nobody", NOW).mine, null);
});

/* ---------- the class table (item 37) ------------------------------------- */

const rec = (h, w = null) => ({ n: h.length, w: w ?? [...h].filter((c) => c === "0").length, h, last: "2026-11-01",
  ex: [{ w: "hestur|kk", m: "ÞGFET", o: "ÞFET" }] });

test("a pupil's standings are standingOf's figures, without examples or dates", () => {
  const S = { diag: { thf_thgf: rec("00110011"), ef: rec("1111"), nope: rec("0000"), ogreint: rec("0011"),
    ending: { n: 0, w: 0, h: "" } } };
  const out = pupilStandings(S);
  assert.deepEqual(Object.keys(out).sort(), ["ef", "ogreint", "thf_thgf"], "unknown or never-met patterns came through");
  const s = standingOf(S.diag.thf_thgf);
  assert.deepEqual(out.thf_thgf, { n: s.n, w: s.w, seen: s.seen, misses: s.misses, rate: s.rate, trend: s.trend, active: s.active });
  assert.equal(out.ogreint.active, false, "Ógreint was marked active");
  assert.ok(!JSON.stringify(out).includes("hestur") && !JSON.stringify(out).includes("2026"));
  assert.deepEqual(pupilStandings(null), {});
});

test("columns: patterns that went wrong for somebody, the class's worst first", () => {
  const P = (diag) => ({ name: "x", diag: pupilStandings({ diag }) });
  const pupils = [
    P({ thf_thgf: rec("0000011111111111"), ef: rec("00000"), stafsetning: rec("1111111") }),
    P({ thf_thgf: rec("1111111111111111"), ef: rec("0001"), ending: rec("01111111") }),
    P({ ef: rec("00011"), ending: rec("11111111") }),
  ];
  const cols = classColumns(pupils);
  /* ef is active for two (00000, 00011 — 0001 has too few answers), thf_thgf for none */
  assert.equal(cols[0].id, "ef");
  assert.equal(cols[0].active, 2);
  assert.ok(!cols.some((c) => c.id === "stafsetning"), "a pattern nobody got wrong is a column");
  assert.ok(cols.findIndex((c) => c.id === "thf_thgf") < cols.findIndex((c) => c.id === "ending"),
    "5 misses in 32 should come before 1 in 16");
  /* on an assignment's material: those patterns, even at nought */
  assert.deepEqual(classColumns(pupils, ["stafsetning"]).map((c) => c.id), ["stafsetning"]);
  assert.deepEqual(classColumns([]), []);
});

test("CSV fields: quoted when needed, and never a formula", () => {
  assert.equal(csvField("Anna"), "Anna");
  assert.equal(csvField("A;B"), '"A;B"');
  assert.equal(csvField('Sá "góði"'), '"Sá ""góði"""');
  assert.equal(csvField("=1+1"), "'=1+1");
  assert.equal(csvField("+354"), "'+354");
  assert.equal(csvField("-2"), "'-2");
  assert.equal(csvField("@SUM(A1)"), "'@SUM(A1)");
  assert.equal(csvField(null), "");
  assert.equal(csvField(42), "42");
  const csv = patternCSV([{ name: "Þóra", diag: pupilStandings({ diag: { ef: rec("0011"), ogreint: rec("01", 1) } }) }]);
  assert.ok(csv.startsWith("\uFEFFNemandi;"));
  assert.match(csv, /\r\nÞóra;50;1;2\r\n$/);
});

/* ---------- what the pupil sees (ui/session.js) --------------------------- */

const asg = (extra = {}) => ({ id: "a1", target: { kind: "skill", id: "nafnord" }, n: 10, due: "2026-11-20",
  note: "", open: true, mine: null, ...extra });

test("the cards at the top of Æfa: what, how many, by when, and one button", () => {
  assert.equal(assignmentsHTML([]), "");
  assert.equal(assignmentsHTML(null), "");
  const html = assignmentsHTML([asg({ note: "Fyrir <föstudag>" })], { now: NOW });
  assert.match(html, /Nafnorð/);
  assert.match(html, /10 spurningar · skil föstudaginn 20\. nóvember/);
  assert.match(html, /Fyrir &lt;föstudag&gt;/, "the teacher's note is not escaped");
  assert.match(html, /<button type="button" class="go assigngo" data-assign="a1">Byrja →<\/button>/);
  const done = assignmentsHTML([asg({ mine: { i: 10, j: 10, c: 8, done: true } })], { now: NOW });
  assert.match(done, /class="ghost assigngo"[^>]*>Gera aftur/);
  assert.match(done, /Lokið: 8 af 10 rétt/);
  const blocked = assignmentsHTML([asg()], { now: NOW, usable: () => false });
  assert.ok(!/data-assign/.test(blocked), "a button for material that cannot be asked");
  assert.match(blocked, /Láttu kennarann vita/);
  assert.equal(assignmentsHTML([asg({ open: false })], { now: NOW }), "", "a closed assignment is shown");
  assert.match(assignmentsHTML([asg(), asg({ id: "a2" })], { now: NOW }), /Verkefni · 2/);
});

test("how far the pupil has got, in a line", () => {
  assert.equal(assignmentState(asg()), "");
  assert.match(assignmentState(asg({ mine: { i: 4, j: 4, c: 2, done: false } })), /^Byrjað: 4 af 10 spurningum/);
  assert.match(assignmentState(asg({ mine: { i: 10, j: 0, c: 0, done: true } })), /^✓ Lokið\./);
});

test("the summary says what became of the result", () => {
  const d = (sent, extra = {}) => ({ assignment: { id: "a1", target: { kind: "skill", id: "nafnord" }, sent },
    n: 10, i: 10, early: false, ...extra });
  assert.match(assignmentSummary(d("ok")), /Verkefninu „Nafnorð“ er lokið\. Niðurstaðan er skráð\./);
  assert.match(assignmentSummary(d(null)), /á leiðinni/);
  assert.match(assignmentSummary(d("ok", { i: 4, early: true })), /þú svaraðir 4 af 10 spurningum.*klárað verkefnið seinna/);
  assert.match(assignmentSummary(d("refused")), /skiladagurinn var liðinn/);
  assert.match(assignmentSummary(d("retry")), /reynt aftur/);
  assert.equal(topicName(ASSIGNED.id), "Verkefni");
});

/* ---------- what the teacher sees (ui/teacher.js) ------------------------- */

test("the teacher's table: a row per pupil, a cell per pattern, Ógreint last", () => {
  const pupils = [
    { id: "1", name: "Anna <3", diag: pupilStandings({ diag: { ef: rec("00000111"), ogreint: rec("01") } }) },
    { id: "2", name: "Bjarni", diag: pupilStandings({ diag: { thf_thgf: rec("1111") } }) },
    { id: "3", name: "Dóra", diag: {} },
  ];
  const cols = ["ef", "thf_thgf"];
  const html = patternTableHTML(pupils, cols);
  assert.match(html, /<th scope="row" class="cpname">Anna &lt;3<\/th>/);
  assert.match(html, /Eignarfallið forðast/);
  assert.match(html, /class="cpcell active"[^>]*>.*5 af 8/s);
  assert.match(html, /class="cpcell none"[^>]*>–/, "a pattern the pupil has not met is not shown as a dash");
  assert.match(html, /hefur ekki svarað neinu sem er greint enn/);
  assert.match(html, />Ógreint</);
  assert.match(html, /1 af 2<\/td>/);
  assert.ok(html.indexOf("Eignarfallið") < html.indexOf("Þolfall og þágufall"), "the columns are out of order");
  assert.doesNotMatch(patternTableHTML(pupils, cols, { unread: false }), /Ógreint/);
  assert.match(patternTableHTML([], []), /Enginn nemandi/);
  assert.match(patternTableHTML([pupils[2]], []), /Enginn í hópnum hefur æft sig/);
});

test("the teacher's card: who has finished, the scores, the patterns", () => {
  const pupils = [{ id: "1", name: "Anna", diag: pupilStandings({ diag: { ef: rec("0011") } }) },
    { id: "2", name: "Bjarni", diag: {} }];
  const a = { id: "a1", target: { kind: "pattern", id: "ef" }, n: 10, due: "2026-11-17", note: "", open: true,
    results: [{ id: "1", name: "Anna", res: { i: 10, j: 10, c: 7, done: true } },
      { id: "2", name: "Bjarni", res: { i: 3, j: 3, c: 1, done: false } }], columns: ["ef"] };
  const html = assignmentCardHTML(a, pupils, NOW);
  assert.match(html, /Eignarfallið forðast/);
  assert.match(html, /Villumynstur · 10 spurningar · skil á morgun/);
  assert.match(html, /<b>1 af 2<\/b> hafa lokið · meðaltal 70% rétt/);
  assert.match(html, /<td>Anna<\/td><td>lokið<\/td><td>7 af 10 \(70%\)<\/td>/);
  assert.match(html, /byrjað: 3 af 10/);
  assert.match(html, /data-adel="a1"/);
});

test("the list of targets: every kind, the class's worst patterns first", () => {
  const html = targetOptionsHTML(["ending", "nope"]);
  for (const k of ["skill:nafnord", "pattern:thf_thgf", "node:no-foll", "year:10"]) assert.ok(html.includes(`value="${k}"`), k);
  assert.ok(!html.includes('value="pattern:ogreint"'));
  assert.ok(!html.includes("nope"));
  assert.ok(html.indexOf('value="pattern:ending"') < html.indexOf('value="pattern:thf_thgf"'));
  assert.match(html, /algengust í hópnum fyrst/);
  assert.equal((html.match(/<option /g) || []).length, ALL.length);
});

test("limits are what the docs say", () => {
  assert.deepEqual(ASSIGN.sizes, [5, 10, 15, 20, 30]);
  assert.equal(ASSIGN.maxDays, 60);
  assert.equal(ASSIGN.maxOpen, 12);
  assert.equal(ASSIGN.keepDays, 30);
  assert.equal(ASSIGN.noteMax, 80);
});
