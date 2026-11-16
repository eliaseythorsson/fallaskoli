import { test } from "node:test";
import assert from "node:assert/strict";
import {
  overallNeed, skillNeed, overallLevel, computeXp, easeOf, easeMult,
  mastery, applyDecay, decayAmount, daysBetween, overallRank, skillRank, levelBand,
} from "../src/js/core/progress.js";
import { blankState } from "../src/js/core/state.js";

/* Roughly one day's work for this user. */
const DAY_XP = 200;

test("the level curve hits the timing targets", () => {
  /* v6.1: the early levels were brought forward so the first fortnight holds
     several level-ups. Every level still takes longer than the one before. */
  const day = (xp) => xp / DAY_XP;
  assert.ok(day(overallNeed(2)) <= 1, "level 2 should be reached on the first day");
  const toThree = day(overallNeed(3) - overallNeed(2));
  assert.ok(toThree >= 2 && toThree <= 4, `stig 3 tók ${toThree.toFixed(1)} daga`);
  const toFour = day(overallNeed(4) - overallNeed(3));
  assert.ok(toFour >= 4 && toFour <= 8, `stig 4 tók ${toFour.toFixed(1)} daga`);
  for (let L = 2; L <= 25; L++) {
    assert.ok(overallNeed(L + 1) - overallNeed(L) > overallNeed(L) - overallNeed(L - 1),
      "each level should be longer than the last");
  }
});

test("no level costs more than it did before v6.1", () => {
  /* The promise that lets the curve change under stored progress: a child's
     level can rise when they open the new version, never fall. */
  const before = (L) => Math.round(250 * Math.pow(L - 1, 2.5));
  for (let L = 2; L <= 40; L++) assert.ok(overallNeed(L) <= before(L), `stig ${L}`);
});

test("every level up to twenty has its own title, and a band", () => {
  const names = Array.from({ length: 20 }, (_, i) => overallRank(i + 1));
  assert.equal(new Set(names).size, 20);
  assert.equal(overallRank(20), "Þjóðskáld");
  assert.equal(overallRank(45), "Þjóðskáld");
  assert.equal(levelBand(1).id, "b1");
  assert.equal(levelBand(10).nm, "Gull");
  assert.equal(levelBand(99).id, "b6");
});

test("stig innan flokks nást fyrr en heildarstig", () => {
  for (let L = 2; L <= 8; L++) assert.ok(skillNeed(L) < overallNeed(L));
});

test("levelFromXp agrees with the curve", () => {
  assert.equal(overallLevel(0).level, 1);
  assert.equal(overallLevel(overallNeed(2) - 1).level, 1);
  assert.equal(overallLevel(overallNeed(2)).level, 2);
  assert.equal(overallLevel(overallNeed(5) + 10).level, 5);
  const info = overallLevel(overallNeed(3) + 25);
  assert.equal(info.level, 3);
  assert.equal(info.into, 25);
  assert.equal(info.need, overallNeed(4) - overallNeed(3));
});

test("level names start at beginner and end at master", () => {
  assert.equal(overallRank(1), "Byrjandi");
  assert.match(overallRank(20), /meistari|skáld/i);
  assert.equal(skillRank(1), "Nýgræðingur");
  assert.match(skillRank(20), /meistari/i);
});

test("what the user already knows yields less XP", () => {
  const hard = computeXp({ base: 10, ease: 0.05 });
  const neutral = computeXp({ base: 10, ease: 0.5 });
  const easy = computeXp({ base: 10, ease: 0.98 });
  assert.ok(hard > neutral && neutral > easy, `${hard} > ${neutral} > ${easy}`);
  assert.ok(easy >= 1, "never zero for a correct answer");
  assert.ok(easy / hard < 0.6, "the difference should be noticeable");
});

test("vísbending helmingar XP", () => {
  const full = computeXp({ base: 10, ease: 0.5 });
  const hinted = computeXp({ base: 10, ease: 0.5, hinted: true });
  assert.ok(Math.abs(hinted - full / 2) <= 1);
});

test("a harder sentence yields more", () => {
  assert.ok(computeXp({ base: 10, lvl: 5 }) > computeXp({ base: 10, lvl: 1 }));
});

test("mastery and easeOf: few answers mean uncertainty, not skill", () => {
  assert.equal(mastery(null).conf, 0);
  assert.equal(easeOf([]), 0.5);
  const few = easeOf([{ c: 1, w: 0 }]);
  const many = easeOf([{ c: 30, w: 0 }]);
  assert.ok(few < many, "confidence should grow with the number of answers");
  assert.ok(easeOf([{ c: 0, w: 20 }]) < 0.3, "a word that always goes wrong is not easy");
  assert.ok(easeMult(1) < easeMult(0));
});

test("decay does not bite until after a break", () => {
  assert.equal(decayAmount(1000, 0), 0);
  assert.equal(decayAmount(1000, 2), 0);
  assert.ok(decayAmount(1000, 10) > 0);
  assert.ok(decayAmount(1000, 10) < 40, "0.4% a day is slow");
  assert.equal(decayAmount(1000, 400), decayAmount(1000, 30),
    "decay does not accumulate without end");
});

test("decay never goes below the floor", () => {
  assert.equal(decayAmount(1000, 90, 1000), 0);
  assert.ok(decayAmount(1000, 90, 900) <= 100);
});

test("applyDecay reduces the total and the skills in the same proportion", () => {
  const S = blankState();
  S.xp = 4000; S.bestLevel = 4;
  S.skills.nafnord.xp = 2000;
  S.skills.sagnord.xp = 2000;
  S.lastActive = "2026-01-01";
  S.settings.decay = true;     // item 22: off by default, so this test switches it on
  const rep = applyDecay(S, "2026-01-21");
  assert.ok(rep && rep.lost > 0);
  assert.equal(S.xp, 4000 - rep.lost);
  const total = S.skills.nafnord.xp + S.skills.sagnord.xp;
  assert.ok(Math.abs(total - S.xp) < 5, "flokkar fylgja heildinni");
});

test("decay can be switched off", () => {
  const S = blankState();
  S.xp = 4000; S.lastActive = "2026-01-01";
  S.settings.decay = false;
  assert.equal(applyDecay(S, "2026-03-01"), null);
  assert.equal(S.xp, 4000);
});

test("daysBetween telur heila daga", () => {
  assert.equal(daysBetween("2026-01-01", "2026-01-08"), 7);
  assert.equal(daysBetween(null, "2026-01-08"), 0);
});
