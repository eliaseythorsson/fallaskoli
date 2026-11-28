/* Every question type follows the difficulty, or honestly says it does not
   (v6.13, critique item 13).

   About twenty of the 47 types built the same questions at þyngd 1, 3 and 5:
   the hand-written ones (pipeline/exercises.py) had no level to choose by, and govern
   drew from the whole sentence bank. Now every hand-written item carries a
   level, the builders choose near the band (tasks/shared.js `nearBand`,
   `itemsForBand`), and what the registry declares is measured here as well
   as in tests/registry.test.js: a type that declares steps of difficulty
   builds HARDER questions as the band rises, by the level it labels them
   with. */

import test from "node:test";
import assert from "node:assert/strict";
import { DATA } from "../data/data_bundle.js";
import { EX } from "../data/exercises.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, newSession } from "../src/js/core/state.js";
import { SKILL_IDS } from "../src/js/core/skills.js";
import { createPolicy } from "../src/js/core/policy.js";
import { seeded } from "../src/js/core/duel.js";
import { TASKS, typeById, makeView } from "../src/js/tasks/index.js";
import { nearBand, itemsForBand, classRankLevel } from "../src/js/tasks/shared.js";
import { impersonalItems } from "../src/js/tasks/fallstjorn.js";

import { giveWords } from "./learner.js";
import { UNLOCKED_BY_THYNGD } from "../src/js/core/placement.js";

const lex = buildLexicon(DATA);
const allOn = {};
SKILL_IDS.forEach((id) => { allOn[id] = true; });
const policyWith = (levels = {}) =>
  createPolicy(null, { skills: allOn, types: {}, levels, attrs: {}, safeVocab: null });
const POLICY = policyWith();

function viewAt(band, { policy = POLICY, exSeen = [], typeId = "" } = {}) {
  const S = giveWords(blankState(), typeId);
  const sess = newSession(S);
  Object.keys(sess.diff).forEach((k) => { sess.diff[k] = band; });
  sess.exSeen = exSeen;
  return makeView({ S, sess, policy, today: "2026-01-15" });
}

const N = 120;
function meanLevel(spec, band) {
  let sum = 0, n = 0;
  for (let k = 0; k < N; k++) {
    const b = spec.build(lex, viewAt(band, { typeId: spec.id }), seeded(5000 + k));
    if (!b) continue;
    sum += b.task.lvl; n++;
  }
  return n ? sum / n : null;
}

/* ---------- the declarations hold ---------------------------------------- */

test("a type that declares steps builds harder questions as the band rises", () => {
  const flat = [];
  for (const spec of TASKS) {
    if (spec.bands.length === 1) continue;        // band-less, and registry.test.js holds it flat
    /* Unlocked by þyngd (#36): nothing below the second band, the same from
       it up — a door, not a slope (core/placement.js UNLOCKED_BY_THYNGD) */
    if (UNLOCKED_BY_THYNGD.has(spec.id)) {
      const from = spec.bands[1];
      assert.equal(meanLevel(spec, from - 1), null, `${spec.id} builds below þyngd ${from}`);
      assert.ok(meanLevel(spec, from) != null, `${spec.id} builds nothing at þyngd ${from}`);
      continue;
    }
    const m = [1, 2, 3, 4, 5].map((b) => meanLevel(spec, b));
    const top = Math.min(5, spec.bands[spec.bands.length - 1]);
    if (!(m[top - 1] > m[0])) flat.push(`${spec.id}: ${m.map((x) => x.toFixed(2)).join(" ")}`);
    /* and never clearly easier one step up (sampling noise aside) */
    for (let b = 1; b < 5; b++)
      assert.ok(m[b] >= m[b - 1] - 0.2,
        `${spec.id} is easier at þyngd ${b + 1} (${m[b].toFixed(2)}) than at ${b} (${m[b - 1].toFixed(2)})`);
  }
  assert.deepEqual(flat, [], "mean level at þyngd 1..5 does not rise");
});

test("the types the critique found flat now follow the band", () => {
  /* item 13's whole list — the three Setningagerðir types take their level
     from the sentence since item 14 (flat to þyngd 4, as they declare, and
     rising from 5) — and the types items 27a, 27b and 28 added since. */
  const was = ["govern", "clause", "gerd_finna", "gerd_upphaf", "lo_beyging", "lo_stig", "lo_samr",
    "fn_aftur", "to_val", "ob_st", "ob_fsao", "ob_flokka", "fs_hreyf", "fs_sogn", "fs_operson",
    "or_samhengi", "or_myndun", "or_utundan", "tbl_fn", "tbl_to", "fn_flokkar", "no_beyging",
    "so_beyging", "so_mynd", "so_bodhattur", "gerd_tegund", "setn_lidir", "lid_finna", "raeda"];
  for (const id of was) {
    const spec = typeById(id);
    assert.ok(spec.bands.length > 1, `${id} still declares no steps`);
    assert.ok(meanLevel(spec, 5) > meanLevel(spec, 1) + 0.15, `${id}: barely harder at þyngd 5`);
  }
});

/* ---------- the data -------------------------------------------------------- */

test("every hand-written item carries a level 1-5", () => {
  const lists = {
    pronounGap: EX.pronounGap, reflexive: EX.reflexive, numeralAgree: EX.numeralAgree,
    pluralOnly: EX.pluralOnly, dates: EX.dates.frames, motionRest: EX.motionRest,
    verbCase: EX.verbCase, impersonal: impersonalItems(), advPrep: EX.advPrep,
    conjunction: EX.conjunction, wordInContext: EX.wordInContext,
  };
  for (const [name, list] of Object.entries(lists)) {
    assert.ok(list.length, name);
    for (const x of list) assert.ok(Number.isInteger(x.lvl) && x.lvl >= 1 && x.lvl <= 5, `${name}: ${x.t} has level ${x.lvl}`);
    /* a list all at one level could not follow the band */
    assert.ok(new Set(list.map((x) => x.lvl)).size >= 2, `${name}: every item at one level`);
  }
});

/* ---------- the helpers ----------------------------------------------------- */

const L = (...levels) => levels.map((lvl, k) => ({ k, lvl }));
const lv = (x) => x.lvl;

test("nearBand: the band and one below, widening a step at a time to `min`", () => {
  const items = L(1, 1, 2, 2, 3, 3, 4, 4, 5, 5);
  assert.deepEqual(nearBand(items, lv, 3, 4).map(lv), [2, 2, 3, 3]);
  assert.deepEqual(nearBand(items, lv, 1, 2).map(lv), [1, 1]);
  /* too few at the band: a level each way, then another */
  assert.deepEqual(nearBand(L(1, 3, 3, 5, 5, 5), lv, 3, 3).map(lv), [1, 3, 3]);
  assert.deepEqual(nearBand(L(1, 3, 3, 5, 5, 5), lv, 3, 4).map(lv), [1, 3, 3, 5, 5, 5]);
  /* a band above everything the list has is its top level */
  assert.deepEqual(nearBand(items, lv, 7, 2).map(lv), [4, 4, 5, 5]);
  assert.deepEqual(nearBand(items, lv, 6, 4), nearBand(items, lv, 5, 4));
  /* a small list is the whole list */
  assert.deepEqual(nearBand(L(1, 5), lv, 3, 4).map(lv), [1, 5]);
});

test("itemsForBand: the policy's levels, then not yet asked, then near the band", () => {
  const items = L(1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3).map((x) => ({ ...x, t: "s" + x.k }));
  const key = (x) => x.t;
  assert.deepEqual(new Set(itemsForBand(viewAt(1), "fornofn", items, key).map(lv)), new Set([1]));
  assert.deepEqual(new Set(itemsForBand(viewAt(3), "fornofn", items, key).map(lv)), new Set([2, 3]));
  /* asked already: the rest of the window, then the neighbours, before a repeat */
  const seen = ["s0", "s1", "s2"];
  const got = itemsForBand(viewAt(1, { exSeen: seen }), "fornofn", items, key);
  assert.ok(got.every((x) => !seen.includes(x.t)) && got.length >= 4);
  /* a class kept at þyngd 1-2: no level-3 item, whatever the band */
  const low = policyWith({ 3: false, 4: false, 5: false, 6: false, 7: false });
  assert.equal(low.level(3), false);
  assert.ok(itemsForBand(viewAt(5, { policy: low }), "fornofn", items, key).every((x) => x.lvl <= 2));
});

test("govern asks about sentences at the pupil's level", () => {
  const spec = typeById("govern");
  for (const band of [1, 3, 5]) {
    for (let k = 0; k < 40; k++) {
      const t = spec.build(lex, viewAt(band), seeded(900 + k)).task;
      assert.ok(t.s.lvl <= band && t.s.lvl >= band - 1, `govern at þyngd ${band}: a level-${t.s.lvl} sentence`);
    }
  }
});

test("a word's level by its rank within its class", () => {
  assert.deepEqual([1, 150, 151, 350, 351, 600, 601, 950, 951, 5000].map(classRankLevel),
    [1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
});

test("the adjective gaps seldom reach more than a level above the band", () => {
  /* v6.13: the bank has only two or three sentences with a comparative or
     superlative at each level, and widening to twelve took lo_stig to
     level-4 sentences at þyngd 1 (and lo_samr's predicative to level 6).
     The bank route now stops at band + 1; a frame may still go above it when
     the adjective has no lower frame for that form (frames.js `maxLvl` is a
     preference), which is the 0-3% left. Before item 13: 60-70%. */
  for (const id of ["lo_stig", "lo_beyging", "lo_samr"]) {
    const spec = typeById(id);
    for (const band of [1, 2, 3]) {
      let over = 0, n = 0;
      for (let k = 0; k < 200; k++) {
        const b = spec.build(lex, viewAt(band), seeded(7000 + k));
        if (!b) continue;
        n++;
        if (b.task.lvl > band + 1) over++;
      }
      assert.ok(over / n < 0.05, `${id} at þyngd ${band}: ${over} of ${n} above level ${band + 1}`);
    }
  }
});
