/* How fast does the level curve (core/progress.js) move a pupil? (item 60)
   Usage: node tools/sim/levels.mjs [daysPerWeek] [sessionsPerDay]
   Pupils at three abilities, 8 seeds each, one session of ten a day on `daysPerWeek`
   days a week by default, with every reward the app pays (`rewards: true`).
   Prints XP per active day and the day (and week) each level is reached. */
import { simulate } from "./sim.mjs";
import { overallNeed } from "../../src/js/core/progress.js";

const perWeek = Number(process.argv[2] || 4), perDay = Number(process.argv[3] || 1);
const PATTERNS = { 7: [0,1,2,3,4,5,6], 6: [0,1,2,3,4,5], 5: [0,1,2,3,4], 4: [0,1,3,4], 3: [0,2,4], 2: [1,3] };
const on = new Set(PATTERNS[perWeek] || PATTERNS[4]);
const DAYS = 120, N = 8;
console.log(`${perDay} session(s) of 10 a day, ${perWeek} days a week, rewards on; level thresholds XP:`,
  [2, 3, 4, 5, 6, 8, 10].map((L) => `L${L}=${overallNeed(L)}`).join(" "));
for (const [name, ability] of [["weak", 0.5], ["mid", 0.72], ["strong", 0.9]]) {
  const runs = [];
  for (let s = 0; s < N; s++)
    runs.push(simulate({ ability, days: DAYS, perDay, size: 10, allSkills: true, seed: 100 + s,
      rewards: true, activeDays: (d) => on.has(d % 7) }));
  const active = runs.flatMap((r) => r.dayXp.filter((x) => x > 0));
  const mean = active.reduce((a, b) => a + b, 0) / active.length;
  const first = (L) => {
    const at = runs.map((r) => r.lvlByDay.findIndex((x) => x >= L)).map((d) => (d < 0 ? Infinity : d + 1));
    at.sort((a, b) => a - b);
    return at[Math.floor(at.length / 2)];
  };
  const fmt = (L) => { const d = first(L); return d === Infinity ? `L${L} >${DAYS}d` : `L${L} day ${d} (wk ${(d / 7).toFixed(1)})`; };
  console.log(`${name.padEnd(6)} ability ${ability}: ${mean.toFixed(0)} XP/active day | median ${[2, 3, 4, 5, 6, 8].map(fmt).join(" | ")}`);
}
