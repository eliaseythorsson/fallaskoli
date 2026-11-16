/* Item 22 (reviews due instead of XP decay), item 55 (settings.audio gone).
   More small items of v6.13 are added below as they land. */
import test from "node:test";
import assert from "node:assert/strict";
import { blankState, migrate } from "../src/js/core/state.js";
import { applyDecay } from "../src/js/core/progress.js";
import { dueLine } from "../src/js/core/review.js";

/* ---------- 22 ---------------------------------------------------------- */

test("22: XP decay is off in a new state and does nothing without being asked", () => {
  const S = blankState();
  assert.equal(S.settings.decay, false);
  S.xp = 4000; S.bestLevel = 4; S.lastActive = "2026-01-01";
  assert.equal(applyDecay(S, "2026-03-01"), null);
  assert.equal(S.xp, 4000);
  delete S.settings.decay;     // a missing value is "off" too, not "on"
  assert.equal(applyDecay(S, "2026-03-01"), null);
});

test("22: a state saved with the old default (decay on) is switched off once", () => {
  const old = { xp: 500, settings: { decay: true, audio: true, glossary: true } };
  const S = migrate(old);
  assert.equal(S.settings.decay, false);
  /* …and a choice made afterwards is kept. */
  S.settings.decay = true;
  const again = migrate(JSON.parse(JSON.stringify(S)));
  assert.equal(again.settings.decay, true);
});

test("22: 'N atriði bíða upprifjunar' agrees in number", () => {
  assert.equal(dueLine(0), "");
  assert.equal(dueLine(1), "1 atriði bíður upprifjunar");
  assert.equal(dueLine(2), "2 atriði bíða upprifjunar");
  assert.equal(dueLine(11), "11 atriði bíða upprifjunar");
  assert.equal(dueLine(12), "12 atriði bíða upprifjunar");
  assert.equal(dueLine(21), "21 atriði bíður upprifjunar");
  assert.equal(dueLine(111), "111 atriði bíða upprifjunar");
});

/* ---------- 55 ---------------------------------------------------------- */

test("55: settings.audio is gone from new and migrated states", () => {
  assert.ok(!("audio" in blankState().settings));
  const S = migrate({ settings: { audio: true, decay: false, settingsRev: 1 } });
  assert.ok(!("audio" in S.settings));
});
