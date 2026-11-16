/* The Lesefni page on frumlag, umsögn, andlag and sagnfylling is
   *Setningarhlutar* (v6.13 review, S12). It was *Setningarliðir*, beside a
   page on nafnliður, sagnliður and forsetningarliður — which are what
   Málvísir calls setningarliðir. The id changed with it; the old id still
   opens the page, and a pupil's read mark moves with it. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { LESSONS } from "../src/js/content/lessons.js";
import { lessonById, readCount, lessonForTerm } from "../src/js/core/lessons.js";
import { NODES } from "../src/js/core/curriculum.js";
import { blankState, migrate } from "../src/js/core/state.js";

test("the page is Setningarhlutar, and no page is called Setningarliðir", () => {
  const page = LESSONS.find((l) => l.id === "setningarhlutar");
  assert.ok(page);
  assert.equal(page.nm, "Setningarhlutar");
  assert.ok(!LESSONS.some((l) => /(^|[^a-zþæöðáéíóúý])setningarlið/i.test(l.nm) || l.id === "setningalidir"));
  assert.doesNotMatch(JSON.stringify(page), /(^|[^a-zþæöðáéíóúý])setningarlið/i);
  /* every link from another page or from the curriculum reaches a page */
  for (const l of LESSONS) for (const r of l.related || []) assert.ok(lessonById(r), `${l.id} → ${r}`);
  for (const n of NODES || []) if (n.lesson) assert.ok(lessonById(n.lesson), `${n.id} → ${n.lesson}`);
  for (const t of ["frumlag", "umsogn", "andlag", "sagnfylling"]) assert.equal(lessonForTerm(t), "setningarhlutar");
});

test("the old id opens the page, and a saved read mark moves with it", () => {
  assert.equal(lessonById("setningalidir"), lessonById("setningarhlutar"));
  const raw = { ...blankState(), read: { setningalidir: true, foll: true } };
  const S = migrate(JSON.parse(JSON.stringify(raw)));
  assert.deepEqual(Object.keys(S.read).sort(), ["foll", "setningarhlutar"]);
  assert.equal(readCount(S), 2);
  /* and again: nothing more moves */
  assert.deepEqual(migrate(JSON.parse(JSON.stringify(S))).read, S.read);
});
