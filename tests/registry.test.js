/* The catalogue of question types (v6.13, tasks/registry.js).

   One file per category, and in each a TYPES list where every type declares
   its skill, its renderer, the diagnosis tags its questions carry and the
   steps of difficulty it knows. The declarations are held to what the
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
import { TASKS, CATEGORIES, typeById, enabled, weightOf, makeView } from "../src/js/tasks/index.js";
import { registryFaults } from "../src/js/tasks/registry.js";

const lex = buildLexicon(DATA);
const allOn = {};
SKILL_IDS.forEach((id) => { allOn[id] = true; });
const POLICY = createPolicy(null, { skills: allOn, types: {}, levels: {}, attrs: {}, safeVocab: null });

/** A new pupil with every skill's session difficulty at `band`. */
function viewAt(band) {
  const S = blankState();
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

test("one file per category: the twelve skills, each type in the file of its skill", () => {
  assert.deepEqual(Object.keys(CATEGORIES).sort(), [...SKILL_IDS].sort());
  assert.equal(SKILL_IDS.length, 12);
  const dir = new URL("../src/js/tasks/", import.meta.url);
  for (const id of SKILL_IDS) {
    assert.ok(existsSync(new URL(id + ".js", dir)), `src/js/tasks/${id}.js is missing`);
    assert.ok(CATEGORIES[id].length >= 3, `${id}: fewer than three kinds of question (v6.11)`);
    CATEGORIES[id].forEach((t) => assert.equal(t.skill, id, `${t.id} is declared in ${id}.js`));
  }
  /* the files that split the builders by the version that added them are gone */
  assert.ok(!readdirSync(dir).includes("more.js"));
  assert.equal(TASKS.length, Object.values(CATEGORIES).flat().length);
});

test("the registry notices a declaration that is wrong", () => {
  assert.deepEqual(registryFaults(), []);
  const ok = { id: "x", skill: "nafnord", weight: 1, renderer: "gap", tags: [], bands: [1], build: () => null };
  const faults = (t, order = ["x"]) => registryFaults({ nafnord: [t] }, order).join(" | ");
  assert.equal(faults(ok), "");
  assert.match(faults({ ...ok, skill: "sagnord" }), /filed under sagnord/);
  assert.match(faults({ ...ok, weight: 0 }), /no weight/);
  assert.match(faults({ ...ok, renderer: "" }), /no renderer/);
  assert.match(faults({ ...ok, tags: null }), /no tags/);
  assert.match(faults({ ...ok, bands: [2, 3] }), /bands/);
  assert.match(faults({ ...ok, bands: [1, 3, 3] }), /bands/);
  assert.match(faults({ ...ok, bands: [1, 8] }), /bands/);
  assert.match(faults({ ...ok, build: null }), /no builder/);
  assert.match(faults({ ...ok, anyOf: ["sagnord"] }), /anyOf/);
  assert.match(faults(ok, []), /no place in ORDER/);
  assert.match(faults(ok, ["x", "y"]), /ORDER names y/);
  assert.match(registryFaults({ nafnord: [ok], sagnord: [{ ...ok, skill: "sagnord" }] }, ["x"]).join(" | "), /also declared/);
  assert.match(registryFaults({ kennsla: [] }, []).join(" | "), /not a skill/);
});

test("the order of the catalogue is the order a seed means", () => {
  /* The weighted choice walks TASKS, so moving a type changes which question
     every seed gives — two browsers on two versions would build different
     duels. New types go at the end; these stay where v6.12 had them. (The
     split into category files must not reorder them: each file lists its
     own types, and tasks/registry.js ORDER puts them back in this order.) */
  const V612 = ["fill", "verbslot", "verb", "parse", "revform", "govern", "indecl", "syntax", "clause",
    "tbl_no", "tbl_lo", "tbl_so", "tbl_fn", "tbl_to", "meaning", "umritun", "smidja", "villur",
    "no_val", "lo_beyging", "lo_stig", "lo_samr", "fn_eyda", "fn_stad", "fn_aftur", "to_samr", "to_val",
    "to_dags", "to_flt", "ob_smella", "ob_fsao", "ob_st", "ob_flokka", "gr_smella", "gr_flokka",
    "fs_fsno", "fs_hreyf", "fs_sogn", "fs_operson", "or_heiti", "or_samhengi", "or_myndun", "or_utundan",
    "setn_hlut", "setn_flokka", "gerd_finna", "gerd_upphaf"];
  assert.deepEqual(TASKS.map((t) => t.id).slice(0, V612.length), V612);
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
  const b = spec.build(lex, viewAt(band), seeded(1000 + seed));
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
      `${spec.id} builds questions tagged ${undeclared.join(", ")}: add to its tags in tasks/${spec.skill}.js`);
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
        `(${spec.bands.join(", ")}) do not say so: add ${band} in tasks/${spec.skill}.js`);
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
