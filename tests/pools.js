/* How many different questions a type can build — the shared helper for
   critique item 23 ("at least 150 distinct questions at every band").

   Not a test file itself (no `.test.js`): any test imports it.

     import { poolFaults } from "./pools.js";
     test("…", () => assert.deepEqual(poolFaults(["fs_hreyf", "ob_st"]), []));

   What is counted. A pupil starts a fresh session at a given þyngd, so every
   build here gets a fresh pupil (every skill switched on, every session
   difficulty at the band, the default curriculum) and its own seed; nothing
   one build shows is remembered by the next. That is the pool a pupil at
   that band draws from session after session — the measure the critique's
   table used. (tools/sim/pools.mjs instead keeps one long session and lets
   the "not asked yet this visit" gate widen the pool as it goes, which
   counts more.)

   What makes two questions different is `questionKey`: what the pupil SEES
   and must answer — the sentence and the place of the blank, the cue, the
   right answer, the line under the sentence; for a pair both halves; for a
   table the word, its gender and number, and the cells to fill. Not the
   level label, not the order of the options or of a pair's halves (a
   reshuffle is the same question), and not the noun shown beside a table's
   cells: *tveir hestar* and *tveir dagar* are the same four forms to write,
   so another noun there is not another question. */

import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, newSession } from "../src/js/core/state.js";
import { SKILL_IDS } from "../src/js/core/skills.js";
import { createPolicy } from "../src/js/core/policy.js";
import { seeded } from "../src/js/core/duel.js";
import { typeById, makeView } from "../src/js/tasks/index.js";

export const POOL_MIN = 150;

let LEX = null;
export const poolLex = () => (LEX ||= buildLexicon(DATA));

const allOn = {};
SKILL_IDS.forEach((id) => { allOn[id] = true; });
const POLICY = createPolicy(null, { skills: allOn, types: {}, levels: {}, attrs: {}, safeVocab: null });

/** A fresh pupil at `band` in every skill. */
export function freshView(band, extra = {}) {
  const S = blankState();
  SKILL_IDS.forEach((id) => { S.enabled[id] = true; });
  const sess = newSession(S);
  Object.keys(sess.diff).forEach((k) => { sess.diff[k] = band; });
  return makeView({ S, sess, policy: POLICY, today: "2026-11-16", ...extra });
}

const half = (t) => [
  t.s ? t.s.t : "", t.i ?? "", t.cue ?? "", t.gloss ?? "", t.question ?? t.prompt ?? "",
  t.answer ?? (t.answers || [])[0] ?? "",
];

/** What makes a question different from another, as one string. */
export function questionKey(t) {
  if (!t) return "null";
  if (t.type === "table") {
    /* the title minus the noun beside the word ("hver hestur · karlkyn
       eintala" → "hver · karlkyn eintala") */
    const [head, ...rest] = String(t.title).split(" · ");
    const word = t.helperLemma || t.cells.some((c) => c.helper) ? head.split(" ")[0] : head;
    return JSON.stringify(["table", t.kind, t.w ? `${t.w.o}|${t.w.c}` : "", word, ...rest, t.sample || "",
      t.cells.map((c) => c.m)]);
  }
  const own = half(t);
  /* A pair is the same question whichever of its halves comes first. */
  if (t.second) return JSON.stringify([t.type, ...[own, half(t.second)].map((h) => JSON.stringify(h)).sort()]);
  if (own.some((x) => x !== "")) return JSON.stringify([t.type, t.title || "", own]);
  /* A shape this helper does not know: everything but the level label. */
  const { lvl, ...rest } = t;
  return JSON.stringify(rest);
}

/** The tasks a type builds for `n` fresh pupils at `band` (nulls left out). */
export function buildFresh(id, band, n = 1500, seed0 = 1) {
  const spec = typeById(id);
  if (!spec) throw new Error(`no question type ${id}`);
  const lex = poolLex();
  /* One view serves every build: a builder never changes it (it returns its
     effects, tasks/effects.js, and nothing here applies them), so each build
     still meets a pupil who has seen nothing. */
  const view = freshView(band);
  const out = [];
  for (let k = 0; k < n; k++) {
    const b = spec.build(lex, view, seeded(seed0 + k));
    if (b) out.push(b.task);
  }
  return out;
}

/** How many different questions `n` fresh pupils at `band` were asked. */
export const distinctAt = (id, band, n = 1500) =>
  new Set(buildFresh(id, band, n).map(questionKey)).size;

/** Every (type, declared band) with fewer than `min` different questions,
    as sentences; empty when there is none. */
export function poolFaults(ids, { min = POOL_MIN, n = 1500 } = {}) {
  const faults = [];
  for (const id of ids) {
    for (const band of typeById(id).bands) {
      const k = distinctAt(id, band, n);
      if (k < min) faults.push(`${id} at þyngd ${band}: ${k} different questions in ${n} builds (at least ${min})`);
    }
  }
  return faults;
}
