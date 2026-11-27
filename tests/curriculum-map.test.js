/* Item 39: the curriculum map as data, and the three year presets.

   The map is only worth having if it cannot drift from the program: every
   question type and Lesefni page a node names must exist, every question type
   must belong to some node, the document must show the table the code holds,
   and a preset must produce real questions of the right kind and no others. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { skillHasTypes } from "../src/js/core/catalogue.js";
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, newSession, migrate, effectivePolicy } from "../src/js/core/state.js";
import { ask } from "./helpers.js";
import { SKILLS, SKILL_IDS, defaultEnabled } from "../src/js/core/skills.js";
import {
  QUESTION_TYPES, TYPE_IDS, ATTRIBUTES, LEVELS, blankPolicy, createPolicy,
  sanitisePolicy, policyProblem,
  PRESETS, presetPolicy, applyPreset, presetOf, setPolicyFlag,
} from "../src/js/core/policy.js";
import { LESSONS } from "../src/js/content/lessons.js";
import {
  CRITERIA, NODES, NODE_IDS, YEARS, PLANNED_CATEGORIES, nodeById, nodeHasQuestions,
  nodesOfCategory, nodesOfYear, nodesOfType, backlog, presetContent, firstYearOf,
} from "../src/js/core/curriculum.js";
import { nodeTable, criteriaTable, backlogTable, MARKERS, fill } from "../tools/curriculum-doc.mjs";

const lex = buildLexicon(DATA);
const typeSkill = Object.fromEntries(QUESTION_TYPES.map((t) => [t.id, t.skill]));

/* ---------- the nodes ---------------------------------------------------- */

test("every node is well formed and its ids are unique", () => {
  assert.equal(new Set(NODE_IDS).size, NODES.length);
  const cats = new Set([...SKILL_IDS, ...PLANNED_CATEGORIES.map((c) => c.id)]);
  const hv = new Set(CRITERIA.map((c) => c.id));
  for (const n of NODES) {
    assert.match(n.id, /^[a-z]+(-[a-z]+)+$/, n.id);
    assert.ok(n.nm && n.nm.trim() === n.nm, n.id);
    assert.ok(cats.has(n.cat), `${n.id}: flokkur ${n.cat}`);
    assert.ok(YEARS.includes(n.year), `${n.id}: ár ${n.year}`);
    assert.ok(hv.has(n.hv), `${n.id}: hæfniviðmið ${n.hv}`);
    assert.ok(["full", "part", "none"].includes(n.cover), n.id);
    assert.equal(nodeById(n.id), n);
  }
});

test("every question type a node names exists", () => {
  const known = new Set(TYPE_IDS);
  for (const n of NODES) for (const t of n.types) assert.ok(known.has(t), `${n.id} → ${t}`);
});

test("every Lesefni page a node names exists", () => {
  const known = new Set(LESSONS.map((l) => l.id));
  for (const n of NODES) if (n.lesson !== null) assert.ok(known.has(n.lesson), `${n.id} → ${n.lesson}`);
});

test("every feature a node names is a real switch", () => {
  for (const n of NODES) for (const [g, keys] of Object.entries(n.attrs || {})) {
    const group = ATTRIBUTES.find((a) => a.id === g);
    assert.ok(group, `${n.id}: ${g}`);
    for (const k of keys) assert.ok(group.keys.some((x) => x.k === k), `${n.id}: ${g}.${k}`);
  }
});

test("coverage is stated honestly: no questions means not covered, and the backlog names its item", () => {
  for (const n of NODES) {
    if (!n.types.length) assert.equal(n.cover, "none", n.id);
    else assert.notEqual(n.cover, "none", n.id);
    assert.equal(nodeHasQuestions(n), n.types.length > 0);
    if (n.cover === "full") assert.equal(n.item, undefined, `${n.id} is covered and still names an item`);
    else assert.ok(n.item === 27 || n.item === 28, `${n.id}: which item closes this gap?`);
    /* Item 27 is "the lessons teach it and practice never asks": it needs a page. */
    if (n.item === 27) assert.ok(n.lesson, `${n.id}: item 27 without a Lesefni page`);
  }
  assert.deepEqual(backlog().map((n) => n.id).sort(),
    [...backlog(27), ...backlog(28)].map((n) => n.id).sort());
});

test("no question type and no Lesefni page is left off the map", () => {
  const used = new Set(NODES.flatMap((n) => n.types));
  assert.deepEqual(TYPE_IDS.filter((t) => !used.has(t)), [], "question types on no node");
  const pages = new Set(NODES.map((n) => n.lesson));
  assert.deepEqual(LESSONS.map((l) => l.id).filter((id) => !pages.has(id)), [], "pages on no node");
});

test("a fully covered node has a type of its own category", () => {
  /* "full" is a claim that some question is about exactly this; a node whose
     only questions belong to another category is covered in part at best. */
  for (const n of NODES.filter((x) => x.cover === "full")) {
    assert.ok(n.types.some((t) => typeSkill[t] === n.cat), n.id);
    assert.ok(n.lesson, `${n.id}: fully covered without a page`);
  }
});

test("the node ids are pinned: saved progress will be keyed by them", () => {
  /* Adding a node means adding it here. Renaming one must fail this test:
     an id, once released, is never renamed or reused (item 83). */
  assert.deepEqual([...NODE_IDS].sort(), [
    "fn-afturbeygt", "fn-flokkar", "fn-greinir", "fn-personu",
    "fs-forsetningar", "fs-hreyfing", "fs-operson", "fs-sagnir",
    "gerd-adal-auka", "gerd-tegundir", "gr-ordflokkar",
    "lo-beyging", "lo-samraemi", "lo-stig",
    "mb-malsnid", "mb-raeda", "mb-sameina", "mb-smidja", "mb-umritun", "mb-villur",
    "nams-ordin",
    "no-beyging", "no-foll", "no-kyn-tala",
    "ob-atviksord", "ob-flokkar", "ob-fs-ao", "ob-samtengingar", "ob-tengiord",
    "or-hljodbreytingar", "or-merking", "or-myndun", "or-ordhlutar", "or-ordtok",
    "setn-hlutar", "setn-lidir", "setn-ordarod",
    "so-bodhattur", "so-fallhaettir", "so-midmynd", "so-persona-tala",
    "so-samsettar-tidir", "so-sterkar-veikar", "so-tholmynd", "so-tid",
    "so-vidtengingarhattur",
    "st-greinarmerki", "st-n-nn", "st-stor-stafur", "st-y",
    "to-fleirtolu", "to-frumtolur", "to-radtolur",
  ].sort());
});

test("the lookups agree with the list", () => {
  assert.deepEqual(YEARS.flatMap((y) => nodesOfYear(y)).length, NODES.length);
  for (const s of SKILLS) {
    const mine = nodesOfCategory(s.id);
    assert.ok(mine.length, `${s.id} has no node`);
    assert.deepEqual(mine.map((n) => n.year), mine.map((n) => n.year).sort((a, b) => a - b));
  }
  assert.ok(nodesOfType("verb").some((n) => n.id === "so-persona-tala"));
  assert.equal(nodeById("ekki-til"), null);
});

test("the label on each category is the year the map says it starts", () => {
  for (const s of SKILLS) assert.equal(s.cur, `${firstYearOf(s.id)}.b`, s.id);
  assert.equal(firstYearOf("stafsetning"), null);
});

/* ---------- the verb nodes say what the questions really ask ------------- */

test("the verb types ask the moods and voices the map credits them with, and no boðháttur", () => {
  /* The map credits the boðháttur to `so_bodhattur` (item 27), not to these
     three: they never ask it. If one starts to, this fails, and the node
     should list it too. */
  const seen = new Set();
  const S = blankState();
  const P = createPolicy(null, { ...blankPolicy(), skills: Object.fromEntries(SKILL_IDS.map((x) => [x, x === "sagnord"])) });
  const policy = { ...P, type: (id) => ["verb", "verbslot", "tbl_so"].includes(id) };
  const sess = newSession(S);
  sess.diff.sagnord = 5;
  const ctx = { lex, S, sess, forcedNoun: null, policy };
  for (let i = 0; i < 400; i++) {
    const t = ask(ctx);
    if (!t) continue;
    for (const m of [t.m, t.cell, ...(t.cells || []).map((c) => c.m)].filter(Boolean)) {
      for (const tag of String(m).split("-")) seen.add(tag);
    }
  }
  assert.ok(seen.has("FH") && seen.has("VH"), [...seen].join(" "));
  assert.ok(seen.has("MM"), "miðmynd");
  assert.ok(!seen.has("BH"), "a verb type now asks the boðháttur: upgrade so-bodhattur");
});

/* ---------- the presets -------------------------------------------------- */

test("three presets, each one a superset of the year below", () => {
  assert.deepEqual(PRESETS.map((p) => p.year), [8, 9, 10]);
  for (const p of PRESETS) assert.ok(p.nm === `${p.year}. bekkur` && p.ds.length > 20);
  const c = YEARS.map(presetContent);
  for (let i = 1; i < c.length; i++) {
    for (const s of c[i - 1].skills) assert.ok(c[i].skills.includes(s));
    for (const t of c[i - 1].types) assert.ok(c[i].types.includes(t));
    assert.ok(c[i].topLevel > c[i - 1].topLevel);
  }
  assert.equal(presetContent(7), null);
  assert.equal(presetPolicy(11), null);
});

test("what each year adds is what its description says", () => {
  /* The Icelandic sentence on each button is written by hand; this pins the
     facts under it, so a change to the nodes sends you back to the words. */
  const added = (y) => {
    const a = presetContent(y), b = presetContent(y - 1) || { skills: [], types: [] };
    return {
      skills: a.skills.filter((s) => !b.skills.includes(s)).sort(),
      types: a.types.filter((t) => !b.types.includes(t)).sort(),
    };
  };
  assert.deepEqual(added(8).skills, SKILL_IDS.filter((s) =>
    s !== "setningafraedi" && s !== "setningagerd").sort());
  assert.deepEqual(added(9), { skills: [], types: ["fn_aftur", "fs_operson", "ob_fsao", "ob_st",
    "so_beyging", "so_bodhattur", "so_mynd"] });
  assert.deepEqual(added(10), {
    skills: ["setningafraedi", "setningagerd"],
    /* item 28 added gerd_tegund, lid_finna, raeda and setn_lidir */
    /* issue 27 added hver_gerdi (on the node of the setningarhlutar) */
    types: ["clause", "gerd_finna", "gerd_tegund", "gerd_upphaf", "hver_gerdi", "lid_finna", "raeda",
      "setn_flokka", "setn_hlut", "setn_lidir", "syntax"],
  });
  assert.deepEqual([8, 9, 10].map((y) => presetContent(y).topLevel), [5, 6, 7]);
});

test("year 10 is everything, so a blank ceiling reads as year 10", () => {
  const p = presetPolicy(10);
  assert.ok(Object.values(p.skills).every(Boolean));
  assert.ok(Object.values(p.types).every(Boolean));
  assert.ok(Object.values(p.levels).every(Boolean));
  assert.equal(presetOf(blankPolicy()), 10);
  assert.equal(presetOf(null), 10);
});

test("a preset never switches a type on while its category is off", () => {
  for (const y of YEARS) {
    const p = presetPolicy(y);
    for (const t of QUESTION_TYPES) if (p.types[t.id]) assert.ok(p.skills[t.skill], `${y}: ${t.id}`);
    assert.deepEqual(Object.keys(p.skills).sort(), [...SKILL_IDS].sort());
    assert.deepEqual(Object.keys(p.types).sort(), [...TYPE_IDS].sort());
    assert.deepEqual(Object.keys(p.levels), LEVELS.map(String));
  }
});

test("applying a preset is read back as that preset, on either layer, and passes the gate", () => {
  for (const y of YEARS) {
    const layer = applyPreset(blankPolicy(), y);
    assert.equal(presetOf(layer), y);
    assert.equal(presetOf(sanitisePolicy(JSON.parse(JSON.stringify(layer)))), y, "survives the server's gate");
    assert.equal(policyProblem(layer, null), null);
  }
  assert.equal(applyPreset(blankPolicy(), 12), null);
});

test("a preset leaves the features and the vocabulary filter alone", () => {
  const layer = blankPolicy();
  layer.attrs = { fall: { EF: false } };
  layer.safeVocab = true;
  layer.types.fill = false;
  applyPreset(layer, 9);
  assert.deepEqual(layer.attrs, { fall: { EF: false } });
  assert.equal(layer.safeVocab, true);
  assert.equal(layer.types.fill, undefined, "an earlier choice does not outlive the preset");
});

test("one switch changed and it is no longer that year", () => {
  const layer = applyPreset(blankPolicy(), 8);
  setPolicyFlag(layer, "types", "ob_st", true);
  assert.equal(presetOf(layer), null);
  setPolicyFlag(layer, "types", "ob_st", false);
  assert.equal(presetOf(layer), 8);
});

test("a new pupil has the categories of year 8", () => {
  assert.deepEqual(defaultEnabled(), presetPolicy(8).skills);
});

test("the preset works on the child's own settings and survives a reload", () => {
  /* The settings tab hands the editor a view whose `skills` IS `S.enabled`. */
  const S = blankState();
  const view = { skills: S.enabled, types: S.policy.types, levels: S.policy.levels, attrs: S.policy.attrs };
  applyPreset(view, 10);
  assert.equal(S.enabled.setningafraedi, true);
  const back = migrate(JSON.parse(JSON.stringify(S)));
  assert.equal(presetOf({ skills: back.enabled, types: back.policy.types, levels: back.policy.levels }), 10);
  assert.ok(effectivePolicy(back).skill("setningagerd"));

  applyPreset(view, 8);
  const again = migrate(JSON.parse(JSON.stringify(S)));
  assert.equal(again.enabled.setningafraedi, false);
  assert.equal(effectivePolicy(again).type("ob_st"), false);
  assert.equal(effectivePolicy(again).maxLevel, 5);
});

test("a category switched on by hand is still on after a reload", () => {
  /* The defect this found: the editor deleted the key to mean "on", and
     loading laid the saved keys over defaults that say `false`. */
  const S = blankState();
  setPolicyFlag({ skills: S.enabled }, "skills", "setningafraedi", true);
  assert.equal(migrate(JSON.parse(JSON.stringify(S))).enabled.setningafraedi, true);
  /* Types and levels keep "missing means yes", so a blank policy stays blank. */
  const layer = blankPolicy();
  setPolicyFlag(layer, "types", "fill", false);
  setPolicyFlag(layer, "types", "fill", true);
  assert.deepEqual(layer.types, {});
});

test("the ceiling still wins over a year the child picks", () => {
  const ceiling = applyPreset(blankPolicy(), 8);
  const chosen = applyPreset(blankPolicy(), 10);
  const P = createPolicy(ceiling, chosen);
  assert.equal(P.skill("setningafraedi"), false);
  assert.equal(P.type("fs_operson"), false);
  assert.equal(P.maxLevel, 5);
});

for (const year of YEARS) {
  test(`${year}. bekkur produces questions, of its own categories and types only`, () => {
    const S = blankState();
    applyPreset({ skills: S.enabled, types: S.policy.types, levels: S.policy.levels }, year);
    const want = presetContent(year);
    const ctx = { lex, S, sess: newSession(S), forcedNoun: null };
    const skills = new Set(), seen = new Set();
    let made = 0;
    for (let i = 0; i < 500; i++) {
      const t = ask(ctx);
      if (!t) continue;
      made++;
      skills.add(t.skill);
      seen.add(t.typeId);
    }
    assert.ok(made > 400, `only ${made} of 500`);
    assert.deepEqual([...skills].filter((s) => !want.skills.includes(s)), []);
    assert.deepEqual([...seen].filter((t) => !want.types.includes(t)), [], "a type the year does not cover");
    /* Every category of the year turns up, so no part of the preset is dead —
       but for a skill with no question type yet (Námsorð before its first,
       #19), which the preset switches on so that it is on when one comes. */
    assert.deepEqual(want.skills.filter((s) => !skills.has(s) && skillHasTypes(s)), []);
  });
}

/* ---------- the document ------------------------------------------------- */

test("docs/CURRICULUM.md shows the tables the code holds", () => {
  /* Regenerate with `node tools/curriculum-doc.mjs` after changing a node. */
  const doc = readFileSync(new URL("../docs/CURRICULUM.md", import.meta.url), "utf8");
  assert.equal(fill(doc), doc, "run: node tools/curriculum-doc.mjs");
  for (const m of Object.values(MARKERS)) assert.ok(doc.includes(m.start) && doc.includes(m.end));
  for (const n of NODES) assert.ok(nodeTable().includes("`" + n.id + "`"), n.id);
  for (const c of CRITERIA) assert.ok(criteriaTable().includes(c.nm), c.id);
  for (const n of backlog()) assert.ok(backlogTable().includes("`" + n.id + "`"), n.id);
});
