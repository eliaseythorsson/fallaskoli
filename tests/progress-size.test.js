/* The size of a pupil's progress file after a heavy year (#44, docs/adr/0001).

   Word knowledge keeps every entry for ever (core/wordknowledge.js
   ENTRIES_MAX), and the server refuses any one pupil's progress over
   MAX_STATE_BYTES (server/guard.mjs). This plays a very keen pupil — 150
   questions a day for 180 school days — through the real answer path
   (tools/sim/sim.mjs: `judge` and `settle`, as tests/sim.test.js does) and
   fails if the saved file, as the server would store it (`cleanState`), comes
   within 50% of the limit: the warning must come years before saving fails.

   A full year takes about a minute of CPU (more on a busy machine), so the
   test plays ONE QUARTER (48 school days) and extrapolates along the line the
   file had been growing on over the last half of it. Measured with the same
   pupil: the file grows by 5.4 KB a day after the first weeks and a little
   slower later (4.7 KB a day from day 36), so the line OVERSTATES the year:
   measured at 180 days it is 943 KB (45.0% of the limit); the extrapolation
   from 48 days says about 998 KB (47.6%). FALLASKOLI_FULL_YEAR=1 plays all
   180 days and measures instead of extrapolating. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { simulate } from "../tools/sim/sim.mjs";
import { rightResponse, wrongResponse } from "./helpers.js";
import { seeded } from "../src/js/core/duel.js";
import { cleanState, MAX_STATE_BYTES } from "../server/guard.mjs";

const FULL = process.env.FALLASKOLI_FULL_YEAR === "1";
const YEAR = 180, PER_DAY = 150, SIZE = 10;
const DAYS = FULL ? YEAR : 48;

const respond = (t, knows) => {
  if (knows) return rightResponse(t);
  if (t.type === "syntax") return { picked: t.s.tok.findIndex((x) => x.r !== t.askRole) };
  return wrongResponse(t);
};
const bytesOf = (S) => Buffer.byteLength(JSON.stringify(cleanState(JSON.parse(JSON.stringify(S)))));

test("a heavy year (150 questions a day, 180 days) keeps the progress file under half of MAX_STATE_BYTES", { timeout: 600000 }, () => {
  const marks = {};
  const half = Math.floor(DAYS / 2);
  const r = simulate({ respond, allSkills: true, size: SIZE, ability: 0.75, days: DAYS, perDay: PER_DAY / SIZE,
    seed: 7, builderRng: seeded(77), onDay: (d, S) => { if (d + 1 === half) marks.half = bytesOf(S); } });
  assert.equal(r.log.length, DAYS * PER_DAY, "every question was asked and answered");
  const end = bytesOf(r.S);
  const year = FULL ? end : Math.round(end + (YEAR - DAYS) * (end - marks.half) / (DAYS - half));
  const share = year / MAX_STATE_BYTES;
  console.log(`# progress file: ${end} bytes after ${DAYS} days; ${FULL ? "measured" : "extrapolated"} at ${YEAR} days: ${year} bytes = ${(share * 100).toFixed(1)}% of MAX_STATE_BYTES`);
  const e = Object.values(r.S.wordKnowledge).reduce((a, h) => a + h.e.length, 0);
  assert.ok(e > 0.5 * r.log.length, "word knowledge recorded the answers (" + e + " entries)");
  assert.ok(share < 0.5, `a heavy year reaches ${(share * 100).toFixed(1)}% of MAX_STATE_BYTES: lower ENTRIES_MAX (core/wordknowledge.js) before pupils get there`);
});
