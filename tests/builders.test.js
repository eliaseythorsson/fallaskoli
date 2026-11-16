/* v6.13: the spread of what two builders ask (critique items 3 and 15). A
   builder can be pure and still ask the same three questions for ever, or
   mostly the easy case; these count what comes out over many seeds. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, newSession } from "../src/js/core/state.js";
import { SKILL_IDS } from "../src/js/core/skills.js";
import { seeded } from "../src/js/core/duel.js";
import { makeView } from "../src/js/tasks/view.js";
import { taskWorkshop } from "../src/js/tasks/malbeiting.js";
import { taskFill } from "../src/js/tasks/nafnord.js";

const lex = buildLexicon(DATA);
const viewAt = (band) => {
  const S = blankState();
  SKILL_IDS.forEach((id) => { S.enabled[id] = true; });
  const sess = newSession(S);
  Object.keys(sess.diff).forEach((k) => { sess.diff[k] = band; });
  return makeView({ S, sess });
};

test("Setningasmiðja has at least seventy different sentences at every þyngd 1–5", () => {
  for (let band = 1; band <= 5; band++) {
    const v = viewAt(band), seen = new Set();
    for (let i = 0; i < 600; i++) {
      const b = taskWorkshop(lex, v, seeded(i + 1));
      if (b) seen.add(b.task.s.t);
    }
    assert.ok(seen.size >= 70, `þyngd ${band}: ${seen.size} different questions in 600 builds`);
  }
});

test("the noun cloze asks the hard cases: little nominative, dative and genitive often, and never the card's own word above þyngd 1", () => {
  /* 2,000 builds spread over the seven steps. Each step on its own must keep
     the nominative under a quarter; the bank has few genitives at þyngd 5–6
     (about 18% even with every one let through), so the dative and genitive
     bars are held over the whole spread. */
  const n = 2000, by = {}, perBand = {};
  const views = [1, 2, 3, 4, 5, 6, 7].map(viewAt);
  for (let i = 0; i < n; i++) {
    const band = (i % 7) + 1;
    const b = taskFill(lex, views[band - 1], seeded(i + 1));
    assert.ok(b, `þyngd ${band}: no cloze built`);
    const t = b.task;
    by[t.a.fall] = (by[t.a.fall] || 0) + 1;
    (perBand[band] ||= {})[t.a.fall] = (perBand[band][t.a.fall] || 0) + 1;
    if (band > 1) assert.ok(!t.answers.includes(t.n.o), `þyngd ${band}: "${t.s.t}" asks for ${t.n.o}, which the card prints`);
  }
  const share = (k) => (by[k] || 0) / n;
  const at = JSON.stringify(by);
  assert.ok(share("NF") < 0.25, `nominative too common: ${at}`);
  assert.ok(share("ÞG") > 0.2, `dative too rare: ${at}`);
  assert.ok(share("EF") > 0.2, `genitive too rare: ${at}`);
  for (const [band, c] of Object.entries(perBand)) {
    const tot = Object.values(c).reduce((x, y) => x + y, 0);
    assert.ok((c.NF || 0) / tot < 0.25, `þyngd ${band}: nominative ${JSON.stringify(c)}`);
  }
});
