import { simulate, SKILLS } from "./sim.mjs";
const cnt = (a, f) => { const o = {}; a.forEach((x) => { const k = f(x); o[k] = (o[k] || 0) + 1; }); return o; };
console.log("topic | Q | acc | exact-repeat% | repeat within same day% | uniq q | lvl mix | mean lvl by position in session (1..10) | types");
for (const s of SKILLS) {
  const N = 4; let log = [], exact = 0, sameDay = 0, uniq = 0, nulls = 0;
  for (let k = 0; k < N; k++) {
    const r = simulate({ ability: 0.8, days: 15, perDay: 2, size: 10, topic: s.id, allSkills: true, seed: 7 + k });
    nulls += r.nulls;
    const seen = new Map();
    r.log.forEach((x) => { if (seen.has(x.sig)) { exact++; if (seen.get(x.sig) === x.d) sameDay++; } seen.set(x.sig, x.d); });
    uniq += seen.size; log = log.concat(r.log);
  }
  const lv = cnt(log, (x) => x.lvl);
  const pos = Array.from({ length: 10 }, (_, i) => { const a = log.filter((x) => x.i === i && x.r === 0); return (a.reduce((q, x) => q + x.lvl, 0) / a.length).toFixed(1); });
  const pos2 = Array.from({ length: 10 }, (_, i) => { const a = log.filter((x) => x.i === i && x.r === 1); return (a.reduce((q, x) => q + x.lvl, 0) / a.length).toFixed(1); });
  const ty = cnt(log, (x) => x.type);
  console.log(`${s.id} | ${log.length} | ${(log.filter((x) => x.ok).length / log.length).toFixed(2)} | ${(100 * exact / log.length).toFixed(0)}% | ${(100 * sameDay / log.length).toFixed(0)}% | ${(uniq / N).toFixed(0)}/300 | ${JSON.stringify(lv)} | s1 ${pos.join(" ")} ; s2 ${pos2.join(" ")} | ${Object.entries(ty).map(([k, v]) => k + ":" + Math.round(100 * v / log.length)).join(" ")} | nulls ${nulls}`);
}
