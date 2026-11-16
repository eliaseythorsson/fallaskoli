/* A small generator for property tests (critique item 75) — no dependency.

   Not a test file itself (no `.test.js`): tests import it.

     import { seedsOf, pupilAt, forAll } from "./property.js";

   What it gives:
     seedsOf(n, base)     n seeds, the same ones every run: base+1 … base+n.
     pupilAt(band, seed)  a pupil to build for: every skill on, every skill's
                          session difficulty at `band`; odd seeds have a past
                          (answers right and wrong in many cells, words met,
                          XP) so the builders' weighting by what the child
                          knows is exercised, not only the first-day paths.
                          Deterministic in (band, seed).
     forAll(cases, check) runs `check(case)` on every case and collects every
                          failure as "type @ band, seed: what" — a property
                          that fails must say WHICH build, so the bug can be
                          rebuilt from the three. `check` throws or returns a
                          string to fail. At the end it throws one Error
                          listing the first ten (and how many in all). */

import { blankState, newSession, record } from "../src/js/core/state.js";
import { SKILL_IDS } from "../src/js/core/skills.js";
import { seeded } from "../src/js/core/duel.js";
import { skillNeed } from "../src/js/core/progress.js";

export const seedsOf = (n, base = 0) => Array.from({ length: n }, (_, k) => base + k + 1);

export function pupilAt(lex, band, seed) {
  const S = blankState();
  SKILL_IDS.forEach((id) => { S.enabled[id] = true; });
  if (seed % 2 === 1) {
    const g = seeded(7000 + seed);
    const ri = (n) => Math.floor(g() * n);
    SKILL_IDS.forEach((id) => { S.skills[id].xp = skillNeed(1 + ri(6)); });
    const nouns = lex.nouns, cells = ["NFET", "ÞFET", "ÞGFET", "EFET", "NFFT", "ÞFFT", "ÞGFFT", "EFFT"];
    for (let k = 0; k < 30; k++) {
      const w = nouns[ri(nouns.length)];
      record(S, newSession(S), { skill: "nafnord", cell: cells[ri(cells.length)], word: `${w.o}|${w.c}`,
        ok: g() < 0.5, xp: 8, counts: true });
    }
  }
  const sess = newSession(S);
  Object.keys(sess.diff).forEach((k) => { sess.diff[k] = band; });
  return { S, sess };
}

/** Run `check` on every case; throw once, listing what failed. */
export function forAll(cases, check, { limit = 10 } = {}) {
  const bad = [];
  for (const c of cases) {
    let why = null;
    try { why = check(c); } catch (e) { why = e && e.message ? e.message : String(e); }
    if (typeof why === "string" && why) bad.push(`${c.type} @ band ${c.band}, seed ${c.seed}: ${why}`);
  }
  if (bad.length) throw new Error(`${bad.length} of ${cases.length} failed:\n  ` + bad.slice(0, limit).join("\n  "));
}

/* ---- states: what a device does, as data ------------------------------ */
import { grantXp, dkey } from "../src/js/core/state.js";

const CELLS = ["NFET", "ÞFET", "ÞGFET", "EFET", "NFFT", "ÞFFT", "ÞGFFT", "EFFT", "NFETgr", "ÞGFFTgr"];

/** `n` answers on today, by the real `record`: counted in the day, the word,
    the cell, the skill and the XP. Deterministic in `seed`. */
export function workOn(lex, S, seed, n) {
  const g = seeded(seed), ri = (k) => Math.floor(g() * k);
  const sess = newSession(S);
  for (let i = 0; i < n; i++) {
    const w = lex.nouns[ri(lex.nouns.length)];
    record(S, sess, { skill: SKILL_IDS[ri(SKILL_IDS.length)], cell: CELLS[ri(CELLS.length)],
      word: `${w.o}|${w.c}`, ok: g() < 0.65, xp: 5 + ri(10), counts: true });
  }
  if (g() < 0.3) grantXp(S, 5 + ri(20));
  if (g() < 0.5) S.counters.meanings = (S.counters.meanings || 0) + 1 + ri(3);
  return S;
}

/** Move today's record `k` days back: a second day's work, as a state sees it. */
export function backDays(S, k) {
  const today = dkey(new Date()), then = dkey(new Date(Date.now() - k * 86400000));
  if (S.days[today]) { S.days[then] = S.days[today]; delete S.days[today]; }
  if (S.lastActive === today) S.lastActive = then;
  return S;
}

/** A state with a few days behind it: the common past of two devices. */
export function pastOf(lex, seed) {
  const S = blankState();
  SKILL_IDS.forEach((id) => { S.enabled[id] = true; });
  for (let d = 3; d >= 1; d--) { workOn(lex, S, seed * 10 + d, 6 + (seed % 5)); backDays(S, d); }
  return S;
}

/** Plain-data copy and a key-sorted JSON, so two states compare by content. */
export const copy = (x) => JSON.parse(JSON.stringify(x));
export const canon = (x) => JSON.stringify(x, (k, v) =>
  v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v);
