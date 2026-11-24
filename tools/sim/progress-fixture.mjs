/* The saved-progress fixture of tests/saved-progress.test.js (issue #50).
 *
 *   node tools/sim/progress-fixture.mjs inputs [root]
 *       simulates one pupil on two devices and writes
 *       tests/fixtures/saved-progress.json
 *   node tools/sim/progress-fixture.mjs expected [root]
 *       loads, merges and checks those copies with the code under `root`
 *       (default: this checkout) and writes
 *       tests/fixtures/saved-progress.expected.json
 *
 * No real pupil's progress is in it. It is a simulated pupil (tools/sim,
 * the real builders and grader, seeded), twelve days on one device, then
 * three more on this device and two on another, each from the same day
 * twelve. The slices the simulation does not touch (badges, duels, the
 * showcase, the tour, settings …) are filled the way the program fills them,
 * from tests/fixtures/full-progress.js, with the dates moved to the
 * simulated days. The profile is the blank one; no name, no id.
 *
 * `expected` was first written with the code of main before #50 (the pure
 * move of every slice), so the test holds that the move changed nothing a
 * saved file can show. Write it again only for a change that is MEANT to
 * change what is saved, and say in the PR what moved and why.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");
const [mode, rootArg] = process.argv.slice(2);
const ROOT = path.resolve(rootArg || REPO);
const FIXTURE = path.join(REPO, "tests/fixtures/saved-progress.json");
const EXPECTED = path.join(REPO, "tests/fixtures/saved-progress.expected.json");
const J = (x) => JSON.parse(JSON.stringify(x));

if (mode === "inputs") {
  const { simulate } = await import(ROOT + "/tools/sim/sim.mjs");
  const { rightResponse, wrongResponse } = await import(ROOT + "/tests/helpers.js");
  const { seeded } = await import(ROOT + "/src/js/core/duel.js");
  const { fullProgress } = await import(REPO + "/tests/fixtures/full-progress.js");
  const respond = (t, knows) => {
    if (knows) return rightResponse(t);
    if (t.type === "syntax") return { picked: t.s.tok.findIndex((x) => x.r !== t.askRole) };
    return wrongResponse(t);
  };
  const DAY = 86400000, FORK = 12;
  /* The builders draw from one seeded stream until day twelve; after it the
     two devices draw from different ones (the sim moves `Date.now`). */
  const device = (days, after) => {
    const start = Date.now(), a = seeded(4101), b = seeded(after);
    return simulate({ ability: 0.72, days, perDay: 2, size: 10, seed: 41, allSkills: true, respond,
      builderRng: () => (Date.now() - start >= FORK * DAY ? b() : a()) }).S;
  };
  const F = fullProgress();
  const live = (S) => {
    S = J(S);
    const ds = Object.keys(S.days).sort(), last = ds[ds.length - 1], prev = ds[ds.length - 2];
    for (const key of ["badges", "periods", "showcase", "title", "social", "drills", "duels", "runs", "tour",
      "policy", "allowed", "settings", "counters", "multiSessionRun", "lastSessionSkills", "byNode", "seenTypes", "mapBand", "goal", "weekGoal"])
      S[key] = J(F[key]);
    S.read = { ...S.read, ...F.read };
    S.settled = prev;
    for (const b of Object.values(S.badges)) { b.dates = b.dates.map(() => ds[1]); b.first = b.last = ds[1]; }
    S.periods = { s_night: "night:" + ds[1] };
    S.drills["hestur|kk"].last = prev; S.drillDays = { [prev]: 1 };
    S.runs = S.runs.map((x, i) => ({ ...x, d: ds[i] }));
    S.seenTypes = Object.fromEntries(Object.keys(S.seenTypes).map((k) => [k, ds[0]]));
    S.tour = { ...S.tour, d: ds[0] };
    S.social = { week: ds[0], ahead: ["u-1"] };
    return S;
  };
  const base = live(device(FORK, 1));
  const local = live(device(FORK + 3, 2));
  const remote = live(device(FORK + 2, 3));
  const today = Object.keys(local.days).sort().pop() + "T12:00:00Z";
  fs.writeFileSync(FIXTURE, JSON.stringify({ today, base, local, remote }) + "\n");
  console.log("wrote", path.relative(REPO, FIXTURE));
} else if (mode === "expected") {
  const { outputs } = await import(REPO + "/tests/fixtures/saved-progress.mjs");
  const out = await outputs(ROOT, JSON.parse(fs.readFileSync(FIXTURE, "utf8")));
  fs.writeFileSync(EXPECTED, JSON.stringify(out) + "\n");
  console.log("wrote", path.relative(REPO, EXPECTED), "with the code in", ROOT);
} else {
  console.log("usage: node tools/sim/progress-fixture.mjs inputs|expected [root]");
  process.exit(1);
}
