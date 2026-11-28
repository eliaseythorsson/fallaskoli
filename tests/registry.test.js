/* The catalogue of question types (core/catalogue.js, #46) and the registry
   that joins it with the builders (tasks/registry.js).

   One entry per type declares its skill, its renderer, the diagnosis tags
   its questions carry, the steps of difficulty it knows, recall and grader;
   one file per category builds them. The declarations are held to what the
   builders build — a registry nobody checks is a comment. */

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, newSession } from "../src/js/core/state.js";
import { SKILL_IDS } from "../src/js/core/skills.js";
import { QUESTION_TYPES, TYPE_IDS, createPolicy } from "../src/js/core/policy.js";
import { PATTERNS, tagsOf } from "../src/js/core/diagnosis.js";
import { seeded } from "../src/js/core/duel.js";
import { RENDER } from "../src/js/ui/render.js";
import "../src/js/ui/render-more.js";
import "../src/js/ui/hver.js";
import { TASKS, CATEGORIES, typeById, enabled, weightOf, makeView } from "../src/js/tasks/index.js";
import { registryFaults } from "../src/js/tasks/registry.js";
import { CATALOGUE, catalogueFaults, isRecall, graderOf, skillHasTypes } from "../src/js/core/catalogue.js";
import { giveWords } from "./learner.js";

const lex = buildLexicon(DATA);
const allOn = {};
SKILL_IDS.forEach((id) => { allOn[id] = true; });
const POLICY = createPolicy(null, { skills: allOn, types: {}, levels: {}, attrs: {}, safeVocab: null });

/** A new pupil with every skill's session difficulty at `band` — with words
    in learning when the type `id` is built only for such a pupil
    (tests/learner.js). */
function viewAt(band, id = "") {
  const S = giveWords(blankState(), id);
  const sess = newSession(S);
  Object.keys(sess.diff).forEach((k) => { sess.diff[k] = band; });
  return makeView({ S, sess, policy: POLICY, today: "2026-01-15" });
}

/* ---------- complete -------------------------------------------------------- */

test("every question type the curriculum can switch is registered, under the same skill", () => {
  const ids = TASKS.map((t) => t.id);
  assert.deepEqual([...ids].sort(), [...TYPE_IDS].sort());
  assert.equal(new Set(ids).size, ids.length, "a type is registered twice");
  for (const q of QUESTION_TYPES) {
    const t = typeById(q.id);
    assert.ok(t, `${q.id} is in QUESTION_TYPES and has no builder`);
    assert.equal(t.skill, q.skill, `${q.id}: the registry and QUESTION_TYPES disagree about its skill`);
  }
  assert.equal(typeById("ekki-til"), null);
});

test("one file per category: the fifteen skills, each type in the file of its skill", () => {
  assert.deepEqual(Object.keys(CATEGORIES).sort(), [...SKILL_IDS].sort());
  assert.equal(SKILL_IDS.length, 15);
  const dir = new URL("../src/js/tasks/", import.meta.url);
  for (const id of SKILL_IDS) {
    assert.ok(existsSync(new URL(id + ".js", dir)), `src/js/tasks/${id}.js is missing`);
    /* Námsorð (#19) has no type yet; tests/skills-checklist.test.js holds which skill may be so. */
    if (!skillHasTypes(id)) continue;
    assert.ok(CATEGORIES[id].length >= 3, `${id}: fewer than three kinds of question (v6.11)`);
    CATEGORIES[id].forEach((t) => assert.equal(t.skill, id, `${t.id} is declared in ${id}.js`));
  }
  /* the files that split the builders by the version that added them are gone */
  assert.ok(!readdirSync(dir).includes("more.js"));
  assert.equal(TASKS.length, Object.values(CATEGORIES).flat().length);
});

test("the registry notices a declaration that is wrong", () => {
  assert.deepEqual(catalogueFaults(), []);
  assert.deepEqual(registryFaults(), []);
  const ok = { id: "x", skill: "nafnord", nm: "X", ds: "Prófun", weight: 1, renderer: "gap",
    recall: false, grader: "app", tags: [], bands: [1] };
  const build = { build: () => null };
  const faults = (t) => registryFaults([t], { nafnord: { x: build } }).join(" | ");
  assert.equal(faults(ok), "");
  assert.match(faults({ ...ok, skill: "kennsla" }), /kennsla is not a skill/);
  assert.match(faults({ ...ok, weight: 0 }), /no weight/);
  assert.match(faults({ ...ok, renderer: "" }), /no renderer/);
  assert.match(faults({ ...ok, nm: "" }), /no name/);
  assert.match(faults({ ...ok, ds: undefined }), /no description/);
  assert.match(faults({ ...ok, tags: null }), /no tags/);
  assert.match(faults({ ...ok, bands: [2, 3] }), /bands/);
  assert.match(faults({ ...ok, bands: [1, 3, 3] }), /bands/);
  assert.match(faults({ ...ok, bands: [1, 8] }), /bands/);
  assert.match(faults({ ...ok, anyOf: ["sagnord"] }), /anyOf/);
  assert.match(faults({ ...ok, recall: undefined }), /recall must be true or false/);
  assert.match(faults({ ...ok, recall: "yes" }), /recall must be true or false/);
  assert.match(faults({ ...ok, grader: undefined }), /grader must be/);
  assert.match(faults({ ...ok, grader: "claude" }), /grader must be/);
  assert.match(registryFaults([ok, ok], { nafnord: { x: build } }).join(" | "), /declared twice/);
  assert.match(registryFaults([ok], { nafnord: { x: { build: null } } }).join(" | "), /no build function/);
  assert.match(registryFaults([ok], { nafnord: { x: build }, kennsla: {} }).join(" | "), /kennsla is not a skill/);
});

test("registryFaults: a declaration without a builder, a builder without a declaration", () => {
  const ok = { id: "x", skill: "nafnord", nm: "X", ds: "Prófun", weight: 1, renderer: "gap",
    recall: false, grader: "app", tags: [], bands: [1] };
  const build = { build: () => null };
  /* declared in the catalogue, built nowhere */
  assert.match(registryFaults([ok], { nafnord: {} }).join(" | "),
    /core\/catalogue\.js x: declared and has no builder — export one as BUILDERS\.x in tasks\/nafnord\.js/);
  /* built in a category file, declared nowhere */
  assert.match(registryFaults([], { nafnord: { x: build } }).join(" | "),
    /tasks\/nafnord\.js BUILDERS\.x: builds a type core\/catalogue\.js does not declare/);
  /* built in the file of another skill */
  assert.match(registryFaults([ok], { sagnord: { x: build } }).join(" | "),
    /its builder belongs in tasks\/nafnord\.js/);
  /* built twice */
  assert.match(registryFaults([ok], { nafnord: { x: build }, sagnord: { x: build } }).join(" | "), /also built/);
  /* a skill whose file is not imported at all */
  assert.match(registryFaults([ok], {}).join(" | "), /import that file's BUILDERS in tasks\/registry\.js/);
});

test("recall and grader are declared on every type: one recall type, six server-graded", () => {
  for (const t of CATALOGUE) {
    assert.equal(typeof t.recall, "boolean", `${t.id}: recall`);
    assert.ok(["app", "server"].includes(t.grader), `${t.id}: grader`);
  }
  /* #14 added the first recall type (tasks/recall.js); #37 the first
     server-graded one (the explanation in the pupil's own words); #38 the
     graded meaning question and the Orðakort's other two free-text steps;
     #39 a text's main idea and a story's summary in the pupil's own words. */
  assert.deepEqual(CATALOGUE.filter((t) => t.recall).map((t) => t.id), ["or_eyda"]);
  assert.equal(isRecall("or_eyda"), true);
  assert.deepEqual(CATALOGUE.filter((t) => t.grader !== "app").map((t) => t.id),
    ["or_eigin", "or_skyring", "or_setning", "or_tengsl", "les_kjarni_eigin", "les_saga_eigin"]);
  assert.equal(graderOf("or_eigin"), "server");
  assert.equal(isRecall("fill"), false);
  assert.equal(isRecall("ekki-til"), false);
  assert.equal(graderOf("fill"), "app");
  /* the registry's types are the catalogue's, field for field, plus a builder */
  for (const t of TASKS) {
    const c = CATALOGUE.find((x) => x.id === t.id);
    for (const [k, v] of Object.entries(c)) assert.deepEqual(t[k], v, `${t.id}.${k}`);
    assert.equal(typeof t.build, "function");
  }
});

test("the order of the catalogue is the order a seed means", () => {
  /* The weighted choice walks TASKS, so moving a type changes which question
     every seed gives — two browsers on two versions would build different
     duels. New types go at the END of core/catalogue.js; these stay where
     they are. Up to gerd_upphaf is v6.12's order; the rest was tasks/registry.js
     ORDER until #46 made the catalogue's own order the duel order. */
  const PINNED = ["fill", "verbslot", "verb", "parse", "revform", "govern", "indecl", "syntax", "clause",
    "tbl_no", "tbl_lo", "tbl_so", "tbl_fn", "tbl_to", "meaning", "umritun", "smidja", "villur",
    "no_val", "lo_beyging", "lo_stig", "lo_samr", "fn_eyda", "fn_stad", "fn_aftur", "to_samr", "to_val",
    "to_dags", "to_flt", "ob_smella", "ob_fsao", "ob_st", "ob_flokka", "gr_smella", "gr_flokka",
    "fs_fsno", "fs_hreyf", "fs_sogn", "fs_operson", "or_heiti", "or_samhengi", "or_myndun", "or_utundan",
    "setn_hlut", "setn_flokka", "gerd_finna", "gerd_upphaf",
    "fn_flokkar", "no_beyging", "so_beyging", "so_mynd", "so_bodhattur",
    "gerd_tegund", "setn_lidir", "lid_finna", "raeda",
    /* #28, #27, then #29 */
    "ob_tengiord", "ob_skilja", "hver_gerdi", "sameina",
    /* #14, #11, then #30 */
    "or_eyda", "or_merking",
    "les_adal",
    /* #37, then #31 */
    "or_eigin",
    "les_hluti", "les_kort", "les_samantekt",
    /* #38, then #35 */
    "or_skyring", "or_setning", "or_tengsl",
    "fr_rod", "fr_vantar", "fr_setning",
    /* #32 */
    "les_setning", "les_smaatridi", "les_kjarni",
    /* #36 */
    "fr_tengiord", "fr_innra",
    /* #39 */
    "les_kjarni_eigin", "les_saga_eigin"];
  assert.deepEqual(CATALOGUE.map((t) => t.id).slice(0, PINNED.length), PINNED,
    "the catalogue was reordered: new types go at the end of core/catalogue.js");
  assert.deepEqual(TASKS.map((t) => t.id), CATALOGUE.map((t) => t.id));
  assert.deepEqual(TYPE_IDS, CATALOGUE.map((t) => t.id), "core/policy.js TYPE_IDS is the catalogue's");
});

test("a type is on when its skill is — the reverse analysis when any of its three is", () => {
  const only = (skills) => {
    const s = {};
    SKILL_IDS.forEach((id) => { s[id] = skills.includes(id); });
    return createPolicy(null, { skills: s, types: {}, levels: {}, attrs: {}, safeVocab: null });
  };
  assert.equal(enabled(only(["sagnord"]), typeById("verb")), true);
  assert.equal(enabled(only(["nafnord"]), typeById("verb")), false);
  for (const s of ["lysingarord", "sagnord", "nafnord"]) assert.equal(enabled(only([s]), typeById("revform")), true, s);
  assert.equal(enabled(only(["fornofn"]), typeById("revform")), false);
  /* the free-text meaning question: a bonus inside a session, not a turn */
  assert.equal(weightOf(typeById("meaning"), { inRun: true }), 0);
  assert.equal(weightOf(typeById("meaning"), { inRun: false }), 4);
  assert.equal(weightOf(typeById("fill"), { inRun: true }), 26);
});

/* ---------- true ------------------------------------------------------------ */

/* Every type at every band, the same seeds at each: what the three
   declarations below are held to. A task as text without its `lvl` — the
   level is a label on the question, not a different question. */
const SEEDS = 12, BANDS = [1, 2, 3, 4, 5, 6, 7];
const text = (t) => {
  if (!t) return "null";
  const { lvl, ...rest } = t;
  return JSON.stringify(rest);
};
const buildAt = (spec, band, seed) => {
  const b = spec.build(lex, viewAt(band, spec.id), seeded(1000 + seed));
  return b ? b.task : null;
};
const BUILT = new Map();          // id -> [band 1..7] -> [text per seed]
const SEEN = new Map();           // id -> { types, tags }
for (const spec of TASKS) {
  const rows = [], types = new Set(), tags = new Set();
  for (const band of BANDS) {
    const row = [];
    for (let seed = 0; seed < SEEDS; seed++) {
      const t = buildAt(spec, band, seed);
      if (t) { types.add(t.type); tagsOf(t).forEach((x) => tags.add(x)); }
      row.push(text(t));
    }
    rows.push(row);
  }
  BUILT.set(spec.id, rows);
  SEEN.set(spec.id, { types, tags });
}

test("renderer: every task a type builds is drawn by the renderer it declares", () => {
  for (const spec of TASKS) {
    assert.equal(typeof RENDER[spec.renderer], "function", `${spec.id}: no renderer called ${spec.renderer}`);
    const { types } = SEEN.get(spec.id);
    assert.ok(types.size, `${spec.id} built nothing`);
    assert.deepEqual([...types], [spec.renderer], `${spec.id}: builds ${[...types]}, declares ${spec.renderer}`);
  }
});

test("tags: a type declares every diagnosis tag its questions can carry", () => {
  const known = new Set(PATTERNS.flatMap((p) => p.tags));
  for (const spec of TASKS) {
    const { tags } = SEEN.get(spec.id);
    const undeclared = [...tags].filter((x) => !spec.tags.includes(x));
    assert.deepEqual(undeclared, [],
      `${spec.id} builds questions tagged ${undeclared.join(", ")}: add to its tags in core/catalogue.js`);
    assert.equal(new Set(spec.tags).size, spec.tags.length, `${spec.id}: a tag twice`);
    spec.tags.forEach((x) => assert.ok(known.has(x), `${spec.id}: no error pattern reads the tag ${x}`));
  }
});

test("bands: at a step a type does not declare, it builds exactly what it built one step below", () => {
  for (const spec of TASKS) {
    const rows = BUILT.get(spec.id);
    for (const band of BANDS.slice(1)) {
      if (spec.bands.includes(band)) continue;
      assert.deepEqual(rows[band - 1], rows[band - 2],
        `${spec.id} builds other questions at þyngd ${band} than at ${band - 1}, and its bands ` +
        `(${spec.bands.join(", ")}) do not say so: add ${band} to its bands in core/catalogue.js`);
    }
  }
});

test("bands: a type that declares steps of difficulty really does change with it", () => {
  for (const spec of TASKS) {
    if (spec.bands.length === 1) continue;       // [1]: ignores difficulty, shown flat above
    const rows = BUILT.get(spec.id);
    const moves = (a, b) => a.some((x, k) => x !== b[k]);
    let responds = BANDS.slice(1).some((band) => moves(rows[band - 1], rows[band - 2]));
    /* A faint response (a rank cap that lets in a handful more words) may not
       show in twelve seeds; look further before calling the declaration false. */
    const top = spec.bands[spec.bands.length - 1];
    for (let seed = SEEDS; seed < 240 && !responds; seed++)
      responds = text(buildAt(spec, 1, seed)) !== text(buildAt(spec, top, seed));
    assert.ok(responds, `${spec.id} declares bands ${spec.bands.join(", ")} and builds the same questions at every one`);
  }
});
