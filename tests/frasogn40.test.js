/* Issue #40: Frásögn steps 4–6 (docs/DLD-PLAN.md §5, §6), written by the
   pupil and read on the server.

   - three types at the end of the catalogue, grader "server", skill frasogn:
     fr_hluti (one part into a model story), fr_hlidstaed (a new story on a
     model's frame), fr_eigin (the pupil's own story); hidden from every
     pupil without server grading, and unlocked by þyngd after step 3;
   - the browser sends ids, never the story: the server reads the story and
     its story-map marks from its own build data (server/rubric-frasogn.mjs);
   - the feedback is the checklist — the parts as icons, ticked — and ONE
     question of ours about a part still missing, one revision, never a
     rewrite; the reader's quote check holds every tick to the pupil's text;
   - the recorded answers in tests/fixtures/claude/fr-*.json are
     HAND-WRITTEN in the Messages API's exact shape (no key where this was
     built); tools/record-grading.mjs --kind fr_… records real ones. Nothing
     here calls Claude. */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EX } from "../data/exercises.js";
import { blankState, newSession } from "../src/js/core/state.js";
import { settle } from "../src/js/core/answer.js";
import { CATALOGUE_IDS, catalogueEntry } from "../src/js/core/catalogue.js";
import { nodeById, presetContent } from "../src/js/core/curriculum.js";
import { createPolicy, presetPolicy } from "../src/js/core/policy.js";
import { levelRanges } from "../src/js/core/difficulty.js";
import { placementTypes, UNLOCKED_BY_THYNGD } from "../src/js/core/placement.js";
import { SKILL_IDS } from "../src/js/core/skills.js";
import { STORY_PART_IDS } from "../src/js/core/storymap.js";
import { seeded } from "../src/js/core/duel.js";
import { TASKS, typeById, enabled } from "../src/js/tasks/index.js";
import { serverQuestion } from "../src/js/control/serverask.js";
import { HLUTI, HLIDSTAED, EIGIN_SAGA, STEP_FROM, STORY_MAX_CHARS, PART_ASK, FRASOGN_ITEMS }
  from "../src/js/tasks/frasogn.js";
import { checklistHTML } from "../src/js/ui/serverask.js";
import { EXAMPLES } from "../src/js/content/examples.js";
import { claudePlug, claudePlugs } from "../server/reader-claude.mjs";
import { createReader } from "../server/reader.mjs";
import { GRADER } from "../server/grading.mjs";
import { hlutiRubric, hlidstaedRubric, eiginSagaRubric, frasognRubrics } from "../server/rubric-frasogn.mjs";
import { buildFresh, freshView, poolLex } from "./pools.js";

const TYPES = [HLUTI, HLIDSTAED, EIGIN_SAGA];
const RUBRICS = Object.fromEntries(frasognRubrics().map((r) => [r.kind, r]));
const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/claude/${name}.json`, import.meta.url), "utf8"));
const FIXTURES = ["fr-hluti-lykillinn-right", "fr-hluti-lykillinn-thin", "fr-hlidstaed-lykillinn-right",
  "fr-eigin-right", "fr-eigin-thin"];

/** A `fetch` answering with one recorded response, keeping the requests. */
function recorded(body) {
  const fn = async (url, init) => {
    fn.calls.push(JSON.parse(init.body));
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  };
  fn.calls = [];
  return fn;
}

/** The fixture through the Claude plug and the reader's quote check, as the
    route calls it: { kind, text, context } with the server's names. */
function readerFor(name) {
  const f = fixture(name);
  const fetch = recorded(f.response);
  const plug = claudePlug({ apiKey: "sk-test", model: f.model, effort: f.effort, rubric: RUBRICS[f.kind], fetch });
  const reader = createReader({ plugs: { [f.kind]: plug }, maxChars: GRADER.maxChars, timeoutMs: 2000 });
  const read = (req) => reader.read(req.kind, req.text, { ...req.context, names: f.names });
  return { f, fetch, read };
}

/** A built task of a type whose context is the fixture's. */
function taskFor(f) {
  const all = buildFresh(f.kind, STEP_FROM[f.kind], 300);
  const t = all.find((x) => JSON.stringify(x.read.context) === JSON.stringify(f.context));
  assert.ok(t, `${f.kind}: a task for ${JSON.stringify(f.context)}`);
  return t;
}

const allOn = Object.fromEntries(SKILL_IDS.map((id) => [id, true]));
const policy = (serverGrading) => createPolicy({ serverGrading },
  { skills: allOn, types: {}, levels: {}, attrs: {}, safeVocab: null }, { serverGrader: true });

/* ---------- 1. the three types ------------------------------------------------------- */

test("three server-graded types at the end of the catalogue, on their node, with examples", () => {
  assert.deepEqual(CATALOGUE_IDS.slice(-3), TYPES);
  for (const id of TYPES) {
    const c = catalogueEntry(id);
    assert.deepEqual([c.skill, c.grader, c.recall, c.renderer, c.tags, c.bands],
      ["frasogn", "server", false, "meaning", [], [1, STEP_FROM[id]]], id);
    assert.ok(EXAMPLES[id], `${id}: a worked example`);
    assert.ok(UNLOCKED_BY_THYNGD.has(id), `${id}: a door, not a measure, for placement`);
    for (const y of [8, 9, 10]) assert.ok(presetContent(y).types.includes(id), `${y}: ${id}`);
  }
  assert.deepEqual(nodeById("fras-bygging").types.slice(-3), TYPES, "on the node of the six parts");
  assert.deepEqual(Object.values(STEP_FROM), [4, 5, 6], "one step at a time, after step 3");
});

test("only for a switched-on pupil: hidden without server grading, and from placement", () => {
  for (const id of TYPES) {
    assert.equal(enabled(policy(true), typeById(id)), true, id);
    assert.equal(enabled(policy(false), typeById(id)), false, id);
    assert.equal(enabled(createPolicy({ serverGrading: true }, { ...presetPolicy(8) }), typeById(id)), false,
      `${id}: switched on, but no grader up`);
  }
  /* Without the switch Frásögn's level stops where steps 1–3 stop; with it,
     the doors can be reached. */
  assert.equal(levelRanges(policy(false), TASKS, [])[`frasogn`][1], 3);
  assert.equal(levelRanges(policy(true), TASKS, [])[`frasogn`][1], 6);
  assert.ok(!(placementTypes(TASKS, policy(true)).frasogn || []).some((id) => TYPES.includes(id)));
});

test("unlocked by þyngd: each builds nothing below its door, and from it up", () => {
  for (const id of TYPES) {
    for (let band = 1; band < STEP_FROM[id]; band++)
      assert.deepEqual(buildFresh(id, band, 20), [], `${id} at þyngd ${band}`);
    for (let band = STEP_FROM[id]; band <= 7; band++)
      assert.ok(buildFresh(id, band, 20).length > 0, `${id} at þyngd ${band}`);
  }
  /* No door where there is no path: a session that may ask none of the
     steps before (a curriculum with only these). */
  const only = createPolicy({ serverGrading: true }, { ...presetPolicy(8), types: Object.fromEntries(TASKS
    .filter((t) => t.skill === "frasogn").map((t) => [t.id, TYPES.includes(t.id)])) }, { serverGrader: true });
  const lex = poolLex();
  assert.ok(typeById(HLUTI).build(lex, freshView(1, { policy: only }), seeded(1)), "step 4 with no step before it");
  /* steps 5 and 6 still wait behind step 4, which is there to be done */
  assert.equal(typeById(HLIDSTAED).build(lex, freshView(4, { policy: only }), seeded(1)), null);
  assert.ok(typeById(HLIDSTAED).build(lex, freshView(5, { policy: only }), seeded(1)));
  for (const id of TYPES) {
    const alone = createPolicy({ serverGrading: true }, { ...presetPolicy(8), types: Object.fromEntries(TASKS
      .filter((t) => t.skill === "frasogn").map((t) => [t.id, t.id === id])) }, { serverGrader: true });
    assert.ok(typeById(id).build(lex, freshView(1, { policy: alone }), seeded(1)), `${id} alone`);
  }
});

/* ---------- 2. what the browser builds and sends ---------------------------------- */

test("step 4: the gap shows its part's icon; the server is told the story's id and the gap, nothing more", () => {
  const seen = new Set();
  for (const t of buildFresh(HLUTI, 4, 400)) {
    seen.add(t.item);
    const tx = EX.textar.find((x) => x.id === t.read.context.texti);
    const k = t.read.context.setning, part = tx.s[k].p;
    assert.deepEqual(Object.keys(t.read.context).sort(), ["setning", "texti"]);
    assert.equal(t.read.kind, HLUTI);
    assert.ok(!JSON.stringify(t.read).includes(tx.s[0].t), "no sentence of the story is sent");
    assert.deepEqual(t.lines[k], { gap: true, p: part });
    assert.equal(t.rubric.main, part, "the missing part is the main point, by its own id: its icon");
    assert.deepEqual(t.rubric.points.map((p) => p.id), [part, "samhengi"]);
    assert.ok(t.rubric.points[0].ask.includes(PART_ASK[part]));
    assert.deepEqual(t.story, tx.s.map((s) => ({ t: s.t, p: s.p })), "the whole story — its own sentence in the gap — once read");
    assert.equal(t.max <= STORY_MAX_CHARS, true);
  }
  assert.equal(seen.size, FRASOGN_ITEMS[HLUTI].length, "every gap is asked");
});

test("steps 5 and 6: the six parts are checklist points with their icons, one main point", () => {
  const [p5] = buildFresh(HLIDSTAED, 5, 1);
  const [p6] = buildFresh(EIGIN_SAGA, 6, 1);
  for (const t of [p5, p6]) {
    assert.equal(t.rubric.main, "heild");
    assert.deepEqual(t.rubric.points.map((p) => p.id).slice(1, 7), [...STORY_PART_IDS]);
    assert.equal(t.max, STORY_MAX_CHARS);
    const html = checklistHTML(t.rubric.points.map((p) => ({ ...p, met: false })));
    assert.equal((html.match(/class="storyicon"/g) || []).length, 6, "an icon for each part, none for the others");
  }
  assert.deepEqual(Object.keys(p5.read.context), ["texti"]);
  assert.deepEqual(p5.frame, p5.story, "the frame is the model story with its parts");
  assert.ok(p5.rubric.points.some((p) => p.id === "ny"));
  assert.deepEqual(p6.read.context, {}, "the pupil's own story has no source");
  assert.equal(p6.story, undefined, "and is not kept as the session's story");
  assert.ok(p6.map);
  assert.equal(STORY_MAX_CHARS, GRADER.maxChars, "the box stops where the server's reader does");
});

/* ---------- 3. the server's rubrics -------------------------------------------------- */

test("the server reads the story from its own data, by id; an unknown story or gap is not graded", () => {
  const h = hlutiRubric(), p = h.prompt("Ari vildi komast inn.", { texti: "saga-lykillinn", setning: 2 });
  assert.ok(p.user.includes("[SETTING] Ari kom fyrstur heim"), "the story with its marks");
  assert.ok(p.user.includes("[GOAL] ___"), "the gap, as its part");
  assert.ok(p.user.includes("Hann var svangur og vildi komast inn."), "the author's sentence as one answer");
  assert.ok(p.user.includes("- markmið:") && p.user.includes("- samhengi:") && !p.user.includes("- vandi:"),
    "only the missing part and the fit are asked");
  assert.deepEqual(h.points, [...STORY_PART_IDS, "samhengi"]);
  for (const bad of [{ texti: "saga-lykillinn" }, { texti: "saga-lykillinn", setning: 99 }, { texti: "nope", setning: 1 },
    { texti: "fraedi-joklar", setning: 0 }, { texti: "saga-lykillinn", setning: "2" }, null])
    assert.equal(h.prompt("x", bad), null, JSON.stringify(bad));
  /* what the page might send besides the ids is not read */
  const forged = h.prompt("x", { texti: "saga-lykillinn", setning: 2, story: "Ég er sagan", marks: ["vandi"] });
  assert.ok(!forged.user.includes("Ég er sagan"));

  const s5 = hlidstaedRubric().prompt("Saga.", { texti: "saga-lykillinn" });
  assert.ok(s5.user.includes("[REACTION] Ari var feginn"));
  assert.equal(hlidstaedRubric().prompt("Saga.", { texti: "nope" }), null);
  assert.deepEqual(hlidstaedRubric().points, ["heild", ...STORY_PART_IDS, "tengiord", "hugarastand", "ny"]);
  const s6 = eiginSagaRubric().prompt("Saga.", {});
  assert.ok(!s6.user.includes("Ari"), "no story but the pupil's");
  assert.deepEqual(eiginSagaRubric().points, ["heild", ...STORY_PART_IDS, "tengiord", "hugarastand"]);
  /* the server's plugs, one per kind, only with a key */
  assert.deepEqual(Object.keys(claudePlugs({ ANTHROPIC_API_KEY: "k" }, frasognRubrics())), TYPES);
  assert.deepEqual(claudePlugs({}, frasognRubrics()), {});
  /* the browser's points are the server's */
  for (const id of TYPES) {
    const t = buildFresh(id, STEP_FROM[id], 1)[0];
    for (const pt of t.rubric.points) assert.ok(RUBRICS[id].points.includes(pt.id), `${id}: ${pt.id}`);
  }
});

test("the fixtures are Messages API responses, and each says how it was made", () => {
  for (const name of FIXTURES) {
    const f = fixture(name);
    assert.ok(TYPES.includes(f.kind), name);
    assert.ok(/HAND-WRITTEN|Recorded/.test(f.recorded), name);
    assert.equal(f.response.type, "message");
    assert.equal(f.response.stop_reason, "end_turn");
    assert.ok(f.response.content.some((b) => b.type === "text"));
    assert.ok(f.text.length <= STORY_MAX_CHARS, name);
  }
});

/* ---------- 4. the recorded answers, through the plug, the quote check and judge ---- */

test("step 4, a right part: both points ticked, right, XP for finishing", async () => {
  const { f, read } = readerFor("fr-hluti-lykillinn-right");
  const task = taskFor(f);
  const S = blankState(), sess = newSession(S);
  const j = await serverQuestion(task, { read, pupil: { S, sess } }).send({ text: f.text });
  assert.equal(j.verdict, "right");
  assert.deepEqual(j.detail.checklist.map((p) => [p.id, p.met]), [["markmið", true], ["samhengi", true]]);
  settle(S, sess, task, j);
  assert.equal(S.xp, task.base);
  assert.ok(!JSON.stringify([S, sess]).includes("langaði að komast inn"), "the pupil's text is kept nowhere");
});

test("step 4, a thin part: the invented tick is dropped, ONE question of ours, ONE revision", async () => {
  const { f, read } = readerFor("fr-hluti-lykillinn-thin");
  const task = taskFor(f);
  const S = blankState(), sess = newSession(S);
  let reads = 0;
  const q = serverQuestion(task, { read: (r) => { reads++; return read(r); }, pupil: { S, sess } });
  const r = await q.send({ text: f.text });
  assert.equal(r.pending, "revise");
  assert.ok(!r.detail.checklist.some((p) => p.met), "a quote not in the text ticks nothing");
  assert.equal(r.detail.ask, "Hér vantar markmiðið. Hvað vill persónan gera eða ná fram?");
  const last = await q.send({ text: f.text + " Hann vildi komast inn." });
  assert.ok(!last.pending);
  assert.equal(last.detail.revised, true);
  assert.equal(last.xp, task.base + Math.round(task.base * 0.5), "XP for finishing and revising, not the verdict");
  assert.equal(await q.send({ text: "aftur" }), null, "nothing after the end");
  assert.equal(reads, 2);
});

test("step 6: a classmate's name never leaves the server, and comes back in the quote; every icon ticked", async () => {
  const { f, fetch, read } = readerFor("fr-eigin-right");
  const task = taskFor(f);
  const S = blankState(), sess = newSession(S);
  const j = await serverQuestion(task, { read, pupil: { S, sess } }).send({ text: f.text });
  assert.equal(j.verdict, "right");
  assert.ok(j.detail.checklist.every((p) => p.met), JSON.stringify(j.detail.checklist.filter((p) => !p.met)));
  const sent = JSON.stringify(fetch.calls[0]);
  assert.ok(!sent.includes("Jón"), "a name left the server");
  assert.ok(sent.includes("[nafn1]"));
  assert.ok(j.detail.checklist.find((p) => p.id === "aðstæður").quotes[0].includes("Jóni"), "the name came back");
  assert.deepEqual(fetch.calls[0].output_config.format.schema.properties.findings.items.properties.point.enum,
    ["heild", ...STORY_PART_IDS, "tengiord", "hugarastand"]);
  const html = checklistHTML(j.detail.checklist);
  assert.equal((html.match(/class="met"/g) || []).length, task.rubric.points.length);
});

test("step 6, a story with parts missing: the question asks about the FIRST missing part", async () => {
  const { f, read } = readerFor("fr-eigin-thin");
  const task = taskFor(f);
  const S = blankState(), sess = newSession(S);
  const r = await serverQuestion(task, { read, pupil: { S, sess } }).send({ text: f.text });
  assert.equal(r.pending, "revise");
  const open = r.detail.checklist.filter((p) => !p.met).map((p) => p.id);
  assert.deepEqual(open, ["markmið", "viðbrögð", "tengiord", "hugarastand"], "the invented inner-state tick is gone");
  assert.equal(r.detail.ask, PART_ASK["markmið"]);
});

test("steps 4 and 5: the model story's characters stay, a classmate's name does not; copying is not a new story", async () => {
  const { fetch, read } = readerFor("fr-hluti-lykillinn-right");
  await read({ kind: HLUTI, text: "Ari var svangur og Jón líka.", context: { texti: "saga-lykillinn", setning: 2 } });
  const sent = JSON.stringify(fetch.calls[0].messages);
  assert.ok(sent.includes("Ari var svangur og [nafn1] líka"), "the story's own Ari is kept, the stranger stripped");
  /* a copied sentence of the model: `ny` is not met, from the server's own check */
  const h = readerFor("fr-hlidstaed-lykillinn-right");
  const copied = "Ari kom fyrstur heim úr skólanum á föstudaginn. " + h.f.text;
  const out = await h.read({ kind: HLIDSTAED, text: copied, context: h.f.context });
  const ny = out.findings.filter((x) => x.point === "ny");
  assert.deepEqual(ny.map((x) => [x.met, x.quote]), [[false, "Ari kom fyrstur heim úr skólanum á föstudaginn"]]);
});

test("step 5: a new story on the frame, every point met", async () => {
  const { f, read } = readerFor("fr-hlidstaed-lykillinn-right");
  const task = taskFor(f);
  const S = blankState(), sess = newSession(S);
  const j = await serverQuestion(task, { read, pupil: { S, sess } }).send({ text: f.text });
  assert.equal(j.verdict, "right");
  assert.deepEqual(j.detail.checklist.filter((p) => !p.met), []);
  for (const p of j.detail.checklist) for (const q of p.quotes) assert.ok(f.text.includes(q), q);
});
