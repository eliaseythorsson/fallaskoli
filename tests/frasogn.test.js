/* Issue #35: Frásögn (docs/DLD-PLAN.md §5), steps 1 and 2.

   - a new skill, on the Færnikort and in every year's preset, one of the
     new skills that share Lota dagsins, at most one question a session;
   - three types at the end of the catalogue, built from the stories of
     content/textar/ and graded by the app from their story-map marks:
     order a scrambled story (fr_rod), which part of the map is missing
     (fr_vantar), which sentence goes in the gap (fr_setning);
   - every question holds one whole story and carries it (`story`), the
     answer shows it with the six icons, and a session with Frásögn in it
     ends with the last story (core/run.js lastStory, ui/session.js). */

import test from "node:test";
import assert from "node:assert/strict";
import { EX } from "../data/exercises.js";
import { judge } from "../src/js/core/answer.js";
import { tagsOf, patternById } from "../src/js/core/diagnosis.js";
import { CATALOGUE_IDS, catalogueEntry } from "../src/js/core/catalogue.js";
import { nodeById, presetContent } from "../src/js/core/curriculum.js";
import { NODE_PATTERNS } from "../src/js/core/skillmap.js";
import { skillById, defaultEnabled } from "../src/js/core/skills.js";
import { STORY_PART_IDS } from "../src/js/core/storymap.js";
import { lessonFor } from "../src/js/core/lessons.js";
import { NEW_SKILLS, NEW_SKILL_MAX, planToday } from "../src/js/core/today.js";
import { createPolicy, presetPolicy } from "../src/js/core/policy.js";
import { blankState } from "../src/js/core/state.js";
import { countAnswer, lastStory } from "../src/js/core/run.js";
import { storyLinesHTML, wholeStoryHTML } from "../src/js/ui/storyicons.js";
import { typeById, enabled } from "../src/js/tasks/index.js";
import { FRASOGN_ITEMS } from "../src/js/tasks/frasogn.js";
import { buildFresh } from "./pools.js";
import { EXAMPLES } from "../src/js/content/examples.js";
import { LESSONS } from "../src/js/content/lessons.js";

const TYPES = ["fr_rod", "fr_vantar", "fr_setning"];
const STORIES = EX.textar.filter((t) => t.k === "saga");
const storyById = (id) => STORIES.find((x) => x.id === id);
const idOf = (t) => /^fr:([^/]+)\//.exec(t.item)[1];

/** Every build carries its story whole, as it stands in the file. */
function holdsItsStory(t) {
  const tx = storyById(idOf(t));
  assert.ok(tx, t.item);
  assert.equal(t.storyId, tx.id);
  assert.deepEqual(t.story, tx.s.map((s) => ({ t: s.t, p: s.p })), `${t.item}: the whole story`);
  assert.deepEqual([...tagsOf(t)], ["fras"]);
  assert.equal(lessonFor(t), "frasogn");
  return tx;
}

const wrongIs = (t, response) => {
  const j = judge(t, response);
  assert.equal(j.ok, false);
  assert.deepEqual(j.findings.map((f) => f.p), ["sogubygging"]);
};

/* ---------- the skill ------------------------------------------------------------ */

test("Frásögn is a skill of every year, with its node, pattern, lesson and examples", () => {
  const s = skillById("frasogn");
  assert.equal(s.nm, "Frásögn");
  assert.equal(defaultEnabled().frasogn, true);
  for (const y of [8, 9, 10]) {
    assert.ok(presetContent(y).skills.includes("frasogn"), `${y}. bekkur`);
    for (const id of TYPES) assert.ok(presetContent(y).types.includes(id), `${y}: ${id}`);
  }
  assert.deepEqual(nodeById("fras-bygging").types, TYPES);
  assert.deepEqual(NODE_PATTERNS["fras-bygging"], ["sogubygging"]);
  assert.deepEqual(patternById("sogubygging").types, TYPES);
  assert.ok(LESSONS.find((l) => l.id === "frasogn" && l.skill === "frasogn"));
  for (const id of TYPES) assert.ok(EXAMPLES[id], `${id}: a worked example`);
});

test("the three types are the last of the catalogue, graded by the app", () => {
  assert.deepEqual(CATALOGUE_IDS.slice(-3), TYPES);
  for (const id of TYPES) {
    const c = catalogueEntry(id);
    assert.deepEqual([c.skill, c.grader, c.recall, c.tags, c.bands], ["frasogn", "app", false, ["fras"], [1]], id);
  }
  assert.deepEqual(TYPES.map((id) => catalogueEntry(id).renderer), ["sort", "choice", "choice"]);
});

test("the taught stories are not the stories asked about", () => {
  const taught = JSON.stringify(TYPES.map((id) => EXAMPLES[id])) + JSON.stringify(LESSONS.find((l) => l.id === "frasogn"));
  for (const tx of STORIES) for (const s of tx.s) assert.ok(!taught.includes(s.t), `${tx.id}: ${s.t}`);
});

/* ---------- step 1: order the story ------------------------------------------------ */

test("fr_rod: every story scrambled, each sentence to its place, graded by the story's order", () => {
  const seen = new Set();
  for (const t of buildFresh("fr_rod", 1, 200)) {
    seen.add(t.item);
    const tx = holdsItsStory(t);
    assert.equal(t.type, "sort");
    assert.deepEqual(t.buckets, tx.s.map((_, k) => `${k + 1}.`));
    assert.deepEqual([...t.items].sort((a, b) => parseInt(a.cls) - parseInt(b.cls)).map((it) => it.w), tx.s.map((s) => s.t));
    assert.ok(t.items.some((it, k) => it.cls !== `${k + 1}.`), "shown in the story's own order");
    const right = Object.fromEntries(t.items.map((it, k) => [k, it.cls]));
    assert.equal(judge(t, { picks: right }).ok, true);
    assert.ok(judge(t, { picks: { 0: right[0] } }).pending, "every sentence placed first");
    /* two sentences swapped */
    wrongIs(t, { picks: { ...right, 0: right[1], 1: right[0] } });
  }
  assert.deepEqual([...seen].sort(), STORIES.filter((x) => x.s.length >= 3).map((x) => `fr:${x.id}/rod`).sort());
});

/* ---------- step 2: the missing part ------------------------------------------------ */

test("fr_vantar: one part taken out of a story with all six; exactly that part is missing", () => {
  const seen = new Set();
  for (const t of buildFresh("fr_vantar", 1, 600)) {
    seen.add(t.item);
    const tx = holdsItsStory(t);
    assert.equal(t.type, "choice");
    assert.ok(t.iconOpts);
    assert.deepEqual(t.options, [...STORY_PART_IDS]);
    const gap = t.lines.findIndex((l) => l.gap);
    assert.equal(t.lines.filter((l) => l.gap).length, 1);
    assert.ok(!t.lines[gap].p, "the gap does not tell the part asked for");
    assert.equal(tx.s[gap].p, t.answer);
    /* what the marks say: the parts left are all the others */
    const left = new Set(tx.s.filter((_, k) => k !== gap).map((s) => s.p));
    assert.deepEqual(STORY_PART_IDS.filter((p) => !left.has(p)), [t.answer]);
    assert.equal(judge(t, { picked: t.answer }).ok, true);
    wrongIs(t, { picked: STORY_PART_IDS.find((p) => p !== t.answer) });
  }
  assert.equal(seen.size, FRASOGN_ITEMS.fr_vantar.length);
  /* every story with all six parts has at least one */
  for (const tx of STORIES.filter((x) => STORY_PART_IDS.every((p) => x.s.some((s) => s.p === p))))
    assert.ok([...seen].some((k) => k.startsWith(`fr:${tx.id}/`)), tx.id);
  assert.ok(seen.size >= 20, String(seen.size));
});

/* ---------- step 2: the missing sentence ------------------------------------------- */

test("fr_setning: the sentence taken out, among sentences of other stories that stand alone", () => {
  const seen = new Set();
  for (const t of buildFresh("fr_setning", 1, 800)) {
    seen.add(t.item);
    const tx = holdsItsStory(t);
    const gap = t.lines.findIndex((l) => l.gap);
    assert.equal(t.lines[gap].p, tx.s[gap].p, "the gap shows its part");
    assert.equal(t.part, tx.s[gap].p);
    assert.equal(t.answer, tx.s[gap].t);
    assert.equal(t.options.length, 3);
    assert.equal(new Set(t.options).size, 3);
    for (const o of t.options.filter((o) => o !== t.answer)) {
      assert.ok(!tx.s.some((s) => s.t === o), `${o}: from this story`);
      const from = STORIES.flatMap((x) => x.s).find((s) => s.t === o);
      assert.ok(from, o);
      assert.ok(!(from.ref || []).some((r) => r.i === 0), `${o}: opens with a pronoun`);
      assert.ok(t.whyNot[o], o);
    }
    assert.equal(judge(t, { picked: t.answer }).ok, true);
    wrongIs(t, { picked: t.options.find((o) => o !== t.answer) });
  }
  assert.equal(seen.size, FRASOGN_ITEMS.fr_setning.length);
  assert.equal(seen.size, STORIES.reduce((n, x) => n + x.s.length, 0), "every sentence of every story");
});

/* ---------- the whole story ---------------------------------------------------------- */

test("the whole story is drawn with its icons; the gap is marked", () => {
  const tx = STORIES[0];
  const html = wholeStoryHTML(tx.s.map((s) => ({ t: s.t, p: s.p })));
  assert.equal((html.match(/<li>/g) || []).length, tx.s.length);
  for (const s of tx.s) assert.ok(html.includes(`aria-label="`) && html.includes(s.t.split(" ")[0]));
  const lines = storyLinesHTML([{ t: "Fyrst." }, { gap: true, p: "vandi" }, { t: "Svo." }]);
  assert.match(lines, /class="storygap"/);
  assert.match(lines, /aria-label="Vandi"/);
  assert.doesNotMatch(storyLinesHTML([{ gap: true }]), /<svg/);
});

test("a session with Frásögn in it ends with its last story", () => {
  const r = { i: 0, c: 0, j: 0, chances: {}, misses: {}, found: [], items: [] };
  const a = buildFresh("fr_rod", 1, 1, 3)[0], b = buildFresh("fr_vantar", 1, 1, 5)[0];
  const other = { type: "choice", typeId: "les_adal", skill: "lesskilningur" };
  for (const t of [a, b, other]) countAnswer(r, { ...t, inRun: true }, true, [], []);
  assert.deepEqual(lastStory(r), b.story);
  assert.equal(lastStory({ items: [{ type: "fill" }] }), null);
  assert.equal(lastStory(null), null);
});

/* ---------- Lota dagsins -------------------------------------------------------------- */

test("Frásögn takes one slot of the new skills' share", () => {
  assert.ok(NEW_SKILLS.includes("frasogn"));
  assert.equal(NEW_SKILL_MAX.frasogn, 1);
  const P8 = createPolicy(null, presetPolicy(8));
  const may = (id) => { const t = typeById(id); return !!t && enabled(P8, t); };
  const plan = planToday(blankState(), P8, "2026-11-16", { canType: may });
  const fr = plan.slots.filter((x) => x.kind === "new" && x.skill === "frasogn");
  assert.equal(fr.length, 1);
  /* alone among the new skills it still takes one, and the rest goes back */
  const alone = planToday(blankState(), P8, "2026-11-16", { canType: may, newSkills: ["frasogn"] });
  assert.equal(alone.counts.newSkill, 1);
});
