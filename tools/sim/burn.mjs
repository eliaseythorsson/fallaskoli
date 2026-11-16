import { simulate } from "./sim.mjs";
let shown = 0, marked = 0;
for (let s = 0; s < 6; s++) {
  const r = simulate({ ability: 0.6, days: 30, perDay: 2, size: 10, allSkills: true, seed: 50 + s });
  const V = r.S.vocab; marked += Object.values(V).reduce((a, x) => a + x.n, 0);
  shown += r.log.filter((x) => ["or_heiti", "or_samhengi", "or_myndun", "meaning", "or_utundan"].includes(x.type)).length;
  if (s === 0) { const kinds = {}; Object.keys(V).forEach((k) => { const p = k.includes(":") ? k.split(":")[0] : "meaning"; kinds[p] = (kinds[p] || 0) + 1; }); console.log(kinds); const t = {}; r.log.forEach((x) => { t[x.type] = (t[x.type] || 0) + 1; }); console.log(["or_heiti", "or_samhengi", "or_myndun", "or_utundan"].map((k) => k + ":" + t[k]).join(" ")); }
}
console.log("items marked as asked:", marked, "questions of those kinds actually shown:", shown);
