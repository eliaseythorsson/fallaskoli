/* What every skill needs (#46).

   core/skills.js is the one list of skills. Most of what is "per skill" is
   derived from it (XP, levels, settings, duel topics, the registry's
   categories, the placement round). What cannot be derived — real content
   written for the skill — is listed here, so a new skill fails with a plain
   sentence naming the file to fill in instead of a screen that is quietly
   empty. The DLD plan adds three skills; this is their checklist.

   `skillChecklist` reads everything it checks from its argument, so the
   last test can hand it a deliberately broken skill and show the message. */

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { SKILLS } from "../src/js/core/skills.js";
import { CATALOGUE } from "../src/js/core/catalogue.js";
import { LESSONS, lessonFor } from "../src/js/core/lessons.js";
import { NODES } from "../src/js/core/curriculum.js";
import { PATTERNS } from "../src/js/core/diagnosis.js";
import { NODE_PATTERNS } from "../src/js/core/skillmap.js";
import { PLACEMENT_ORDER } from "../src/js/core/placement.js";
import { CATEGORIES } from "../src/js/tasks/registry.js";

const read = (rel) => readFileSync(new URL("../" + rel, import.meta.url), "utf8");
const exists = (rel) => existsSync(new URL("../" + rel, import.meta.url));

/** The program as it is: what the checklist reads. */
const REAL = {
  skills: SKILLS, catalogue: CATALOGUE, lessons: LESSONS, lessonFor, nodes: NODES,
  patterns: PATTERNS, nodePatterns: NODE_PATTERNS, exists,
  registrySource: read("src/js/tasks/registry.js"),
};

/**
 * What skill `id` is missing, one sentence each, naming the file to fill in.
 * @returns {string[]}
 */
function skillChecklist(id, src) {
  const out = [];
  const skill = src.skills.find((s) => s.id === id);
  if (!skill) return [`${id} is not a skill: add it in src/js/core/skills.js`];
  for (const k of ["nm", "ds", "cur", "ico"])
    if (typeof skill[k] !== "string" || !skill[k]) out.push(`${id} has no ${k}: add it in src/js/core/skills.js`);
  if (!Number.isFinite(skill.placement))
    out.push(`${id} has no turn in the placement round: add \`placement\` to it in src/js/core/skills.js`);

  const types = src.catalogue.filter((t) => t.skill === id);
  if (!types.length) out.push(`${id} has no question type: add one at the end of src/js/core/catalogue.js`);
  if (!src.exists(`src/js/tasks/${id}.js`))
    out.push(`${id} has no builders: add src/js/tasks/${id}.js and import its BUILDERS in src/js/tasks/registry.js`);
  else if (!src.registrySource.includes(`from "./${id}.js"`))
    out.push(`${id} has builders nobody imports: import BUILDERS from src/js/tasks/${id}.js in src/js/tasks/registry.js`);

  if (!src.lessons.some((l) => l.skill === id))
    out.push(`${id} has no lesson page: add it in src/js/content/lessons.js`);
  if (!src.lessonFor({ skill: id, type: types[0] ? types[0].renderer : "" }))
    out.push(`${id} has no lesson an answer can point to: add a case for it to lessonFor in src/js/core/lessons.js`);

  const nodes = src.nodes.filter((n) => n.cat === id);
  if (!nodes.length) out.push(`${id} has no curriculum nodes: add them in src/js/core/curriculum.js`);

  const ids = new Set(types.map((t) => t.id));
  if (!src.patterns.some((p) => (p.types || []).some((t) => ids.has(t))))
    out.push(`${id} has no error pattern: add one that names its types in src/js/core/diagnosis.js`);
  if (!nodes.some((n) => (src.nodePatterns[n.id] || []).length))
    out.push(`${id} has no skill-map node with error patterns: add its node to NODE_PATTERNS in src/js/core/skillmap.js`);
  return out;
}

test("every skill has what a skill needs", () => {
  for (const s of SKILLS) assert.deepEqual(skillChecklist(s.id, REAL), [], s.id);
});

test("what is derived from core/skills.js really is", () => {
  const ids = SKILLS.map((s) => s.id);
  assert.deepEqual(Object.keys(CATEGORIES), ids, "the registry's categories");
  assert.deepEqual([...PLACEMENT_ORDER].sort(), [...ids].sort(), "the placement round");
  /* the order the round has asked in since it was written (item 39) */
  assert.deepEqual(PLACEMENT_ORDER, ["nafnord", "sagnord", "lysingarord", "greining", "fornofn",
    "fallstjorn", "toluord", "obeygjanleg", "ordaford", "malbeiting", "setningafraedi", "setningagerd"]);
});

test("a skill with nothing filled in is told, file by file, what to add", () => {
  const broken = {
    ...REAL,
    skills: [...SKILLS, { id: "frasogn", nm: "Frásögn", cur: "8.b", ico: "📖", ds: "Að segja sögu" }],
  };
  const got = skillChecklist("frasogn", broken);
  assert.deepEqual(got, [
    "frasogn has no turn in the placement round: add `placement` to it in src/js/core/skills.js",
    "frasogn has no question type: add one at the end of src/js/core/catalogue.js",
    "frasogn has no builders: add src/js/tasks/frasogn.js and import its BUILDERS in src/js/tasks/registry.js",
    "frasogn has no lesson page: add it in src/js/content/lessons.js",
    "frasogn has no lesson an answer can point to: add a case for it to lessonFor in src/js/core/lessons.js",
    "frasogn has no curriculum nodes: add them in src/js/core/curriculum.js",
    "frasogn has no error pattern: add one that names its types in src/js/core/diagnosis.js",
    "frasogn has no skill-map node with error patterns: add its node to NODE_PATTERNS in src/js/core/skillmap.js",
  ]);
  /* filled in one at a time, each message goes away */
  const withLesson = { ...broken, lessons: [...LESSONS, { id: "fras", skill: "frasogn" }] };
  assert.ok(!skillChecklist("frasogn", withLesson).some((m) => /no lesson page/.test(m)));
  assert.deepEqual(skillChecklist("ekki", REAL), ["ekki is not a skill: add it in src/js/core/skills.js"]);
});
