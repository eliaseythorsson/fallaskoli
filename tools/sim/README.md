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
| `node tools/sim/levels.mjs [daysPerWeek] [sessionsPerDay]` | XP per active day and the day each overall level is reached, with every reward the app pays (`rewards: true`: day multiplier, retries, a perfect table's bonus). Default one session on four days a week (critique item 60) | ~2 min |
| `node tools/sim/placement.mjs [pupils]` | The placement round of the guided first run (item 84): where a weak, a middle and a strong pupil are placed, and the year suggested, for a pupil who says 8. bekkur, 10. bekkur or nothing | ~25 s |
| `node tools/sim/vocab.mjs` | The block list and the frequency rank of a list of coarse words | ~1 s |

`sim.mjs` is the shared engine: `simulate({ ability, learn, days, perDay, size, topic, allSkills, seed })`.
The pupil answers right with probability `ability − 0.04·(level−1) − a penalty for tables and
production + learn·(times this cell was met)`. It is a model: read the output as sizes, not decimals.
It replaces `Date` with a fake clock to move through days, and mirrors `app.pickTask` / `app.finish`
by hand — if those change, update `sim.mjs` with them.

v6.13, the review queue (`core/review.js`): the simulated session opens with up to three due entries
and brings a missed cloze noun back three to five questions on, exactly as `app.pickTask` does
(both call `tasks/review.js`), and every judged answer is written to the queue. `simulate({ review: false })`
runs the old rule (no queue; the missed noun is the very next question) for a before/after comparison.
`mixed.mjs` prints how soon a miss returns in questions, and — the figure the queue is for — on which
DAY: the share of missed cells, and of missed word-and-cell pairs, that are asked again the next day.
Measured when the queue went in (8 pupils × 40 days × 20 questions, three abilities — weak / mid / strong):

| | before | after |
|---|---|---|
| questions until the missed cell is asked again (median) | 37 / 41 / 50 | 18 / 15 / 12 |
| the missed cell is asked again the next day | 29% / 26% / 23% | 70% / 85% / 96% |
| the same word in the same cell is asked again the next day | 2% / 2% / 1% | 34% / 67% / 85% |
| exact repeat questions (a review IS a repeat) | 7% / 7% / 7% | 13% / 15% / 15% |

(The builders draw from `Math.random` here, so a rerun moves these by a point or two.)

The weak pupil misses about ten questions a day and a session opens with three reviews, so not every
miss can come back the next day; the queue asks the freshest first (see the top of `core/review.js`).

v6.13: the builders are pure (`build(lex, view, rng)` → `{ task, effects }`), and `sim.mjs` applies the
effects of the one question it shows, as `app.pickTask` does. `burn.mjs` should therefore print as many
items marked as there were vocabulary questions shown (`or_utundan` is shown and marks nothing; the
numeral items `to_samr` and `to_flt` are no longer vocabulary and are not counted — critique item 20).

Since item 72 a small version of these is a test: `tests/sim.test.js` (about ten seconds of CPU).
It grades through `core/answer.js` `judge` and `settle`: `simulate({ respond, builderRng })` — the pupil
decides with probability p whether to know the answer, `respond(task, knows)` turns that into a right or a
wrong response, `judge` says which it was, and the builders draw from the seeded `builderRng`. Without
those two options the scripts behave as before (the answer is a modelled coin; the builders use `Math.random`).
The test asserts ranges (strong pupils get higher levels, a miss comes back the next day, exact repeats
per category under a ceiling, level 5 in the window `progress.js` promises), not the figures printed here.

v6.13, the placement round (`core/placement.js`, item 84): `placement.mjs` does not use `sim.mjs` — it keeps the real
clock and draws every random number from one seed, so its `simulatePlacement` is also what `tests/placement.test.js`
holds the round to. The pupil answers by the same model as above. Measured when it went in (200 pupils each; general
level, weak / mid / strong): 1.4 / 2.7 / 3.9 when the pupil says 8. bekkur (levels stop at 5), 1.5 / 3.1 / 5.0 for
10. bekkur, 1.5 / 2.9 / 4.6 with no year said. Of the strong pupils who said 8. bekkur about four in ten are offered
year 9; of the weak ones under one in a hundred.
