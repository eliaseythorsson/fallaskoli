/* The glossary tooltip explains the word as the question means it (v6.13
   review, S4).

   In "Sterkt eða veikt nafnorð?" the question "Er beygingin sterk eða veik?"
   linked *sterk* to "Sterk beyging lýsingarorðs" and *beygingin* to an entry
   about adjectives; the verb question "Sterk eða veik sögn?" had the same
   risk. Nouns and verbs now have their own entries, and the bare words take
   the meaning of the subject being shown (core/glossary.js
   `setGlossContext`, set by ui/render.js, ui/live.js and ui/lessons.js). */

import { test } from "node:test";
import assert from "node:assert/strict";
import { glossify, setGlossContext, term, GLOSS_CONTEXT } from "../src/js/core/glossary.js";
import { lessonForTerm } from "../src/js/core/lessons.js";
/* the emphasis marks only, as ui/dom.js `fmt` turns them into tags */
const markdown = (s) => s.replace(/\*\*?/g, "");
import { freshView, poolLex } from "./pools.js";
import { typeById } from "../src/js/tasks/index.js";
import { seeded } from "../src/js/core/duel.js";

const linked = (html) => [...html.matchAll(/data-gl="([^"]+)"[^>]*>([^<]+)</g)].map((m) => [m[2].toLowerCase(), m[1]]);
const ADJ = new Set(["sterkbeyging", "veikbeyging", "beyging"]);

function questionsOf(id, n = 40) {
  const out = [];
  for (let s = 0; s < n; s++) {
    const b = typeById(id).build(poolLex(), freshView(1 + (s % 5)), seeded(71000 + s));
    if (b) out.push(b.task);
  }
  return out;
}

test("Sterkt eða veikt nafnorð: *sterk*, *veik* and *beyging* open the noun's entries", () => {
  const ts = questionsOf("no_beyging");
  assert.ok(ts.length > 20);
  for (const t of ts) {
    setGlossContext(t.skill);
    const got = linked(glossify(markdown(`${t.question} ${t.why || ""}`)));
    for (const [w, id] of got) assert.ok(!ADJ.has(id), `${w} → ${id} in "${t.question}"`);
    assert.ok(got.some(([w, id]) => w === "sterk" && id === "sterknafnord"), t.question);
  }
  setGlossContext(null);
});

test("Sterk eða veik sögn: the verb's entries", () => {
  const ts = questionsOf("so_beyging");
  assert.ok(ts.length > 20);
  for (const t of ts) {
    setGlossContext(t.skill);
    for (const [w, id] of linked(glossify(markdown(`${t.question} ${t.why || ""}`))))
      assert.ok(!ADJ.has(id), `${w} → ${id} in "${t.question}"`);
  }
  setGlossContext(null);
});

test("a phrase that names its class wins under any subject; with none, the adjective's as before", () => {
  const q = "Er beygingin sterk eða veik? Sterk beyging lýsingarorðs. Sterkar sagnir. Veik beyging nafnorða.";
  setGlossContext("nafnord");
  assert.deepEqual(linked(glossify(q)), [["beygingin", "beyging_no"], ["sterk", "sterknafnord"], ["veik", "veiknafnord"],
    ["sterk beyging lýsingarorðs", "sterkbeyging"], ["sterkar sagnir", "sterksogn"], ["veik beyging nafnorða", "veiknafnord"]]);
  setGlossContext("sagnord");
  assert.deepEqual(linked(glossify("Er sögnin sterk eða veik?")).filter(([w]) => w !== "sögnin"),
    [["sterk", "sterksogn"], ["veik", "veiksogn"]]);
  for (const c of [null, "lysingarord", "nope"]) {
    setGlossContext(c);
    assert.deepEqual(linked(glossify("Er beygingin sterk eða veik?")),
      [["beygingin", "beyging"], ["sterk", "sterkbeyging"], ["veik", "veikbeyging"]]);
    /* a word only a subject gives a meaning is left alone */
    assert.ok(!linked(glossify("Nafnorðið er sterkt.")).some(([w]) => w === "sterkt"), String(c));
  }
  setGlossContext(null);
});

test("every entry a subject points to exists and has its Lesefni page", () => {
  for (const map of Object.values(GLOSS_CONTEXT))
    for (const id of new Set(Object.values(map))) {
      assert.ok(term(id), id);
      assert.ok(lessonForTerm(id), `${id}: no Lesefni page`);
    }
});
