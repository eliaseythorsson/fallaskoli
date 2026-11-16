# tools/sim — simulations behind the v6.12 critique

Run from anywhere with Node 18+; nothing here writes to the project.

| script | what it prints | time |
|---|---|---|
| `node tools/sim/mixed.mjs` | Mixed sessions, 3 ability levels × 8 pupils × 40 days: level mix, repeats, XP and levels per day, how soon a missed cell returns | ~20 s |
| `node tools/sim/topics.mjs` | 30 sessions of ten per category: exact repeats, level by position in the session | ~15 s |
| `node tools/sim/pools.mjs` | Every question type at band 1, 3, 5 × 600 builds: distinct questions, sentences, levels | ~30 s |
| `node tools/sim/diagnosis.mjs` | Synthetic wrong answers of 22 kinds and the pattern each is filed under | ~10 s |
| `node tools/sim/frames.mjs` | Which sentence frames and cases dominate the cloze types | ~10 s |
| `node tools/sim/burn.mjs` | Vocabulary items marked asked vs. actually shown | ~10 s |
| `node tools/sim/production.mjs` | Samples of Villuveiðar, Umritun, Setningasmiðja at three bands | ~2 s |
| `node tools/sim/vocab.mjs` | The block list and the frequency rank of a list of coarse words | ~1 s |

`sim.mjs` is the shared engine: `simulate({ ability, learn, days, perDay, size, topic, allSkills, seed })`.
The pupil answers right with probability `ability − 0.04·(level−1) − a penalty for tables and
production + learn·(times this cell was met)`. It is a model: read the output as sizes, not decimals.
It replaces `Date` with a fake clock to move through days, and mirrors `app.pickTask` / `app.finish`
by hand because grading lives in `ui/render.js` — if those change, update `sim.mjs` with them.

v6.13: the builders are pure (`build(lex, view, rng)` → `{ task, effects }`), and `sim.mjs` applies the
effects of the one question it shows, as `app.pickTask` does. `burn.mjs` should therefore print as many
items marked as there were vocabulary questions shown (`or_utundan` is shown and marks nothing).

Not yet tests. Suggested thresholds when they become one (`tests/simulation.test.js`):
every type ≥ 150 distinct questions per band; a pupil at 85% reaches level-3 sentences within ten
questions; items marked asked = items shown; exact repeats in 30 single-topic sessions < 10%.
