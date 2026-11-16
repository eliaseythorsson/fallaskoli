import { simulate, SKILLS } from "./sim.mjs";
const cnt = (a, f) => { const o = {}; a.forEach((x) => { const k = f(x); o[k] = (o[k] || 0) + 1; }); return o; };
const pct = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(100 * v / n).toFixed(1)}%`).join(", ");
for (const [name, ability] of [["weak", 0.5], ["mid", 0.72], ["strong", 0.9]]) {
  let all = [], lv = [], xp = [], nulls = 0, msq = 0;
  const N = 8;
  for (let s = 0; s < N; s++) {
    const r = simulate({ ability, days: 40, perDay: 2, size: 10, allSkills: true, seed: 100 + s });
    all.push(r); lv.push(r.lvlByDay); xp.push(r.dayXp); nulls += r.nulls; msq += r.msPerQ / N;
  }
  const log = all.flatMap((r) => r.log);
  console.log(`\n##### ${name} (ability ${ability}) — ${log.length} questions, ${nulls} null picks, ${msq.toFixed(1)} ms/question`);
  console.log("accuracy", (log.filter((x) => x.ok).length / log.length).toFixed(3));
  console.log("skills:", pct(cnt(log, (x) => x.skill), log.length));
  console.log("types:", pct(cnt(log, (x) => x.type), log.length));
  console.log("levels asked:", pct(cnt(log, (x) => x.lvl), log.length));
  const byWeek = [0, 1, 2, 3, 4, 5].map((w) => { const a = log.filter((x) => Math.floor(x.d / 7) === w); return a.length ? `w${w}: lvl ${(a.reduce((s, x) => s + x.lvl, 0) / a.length).toFixed(2)} acc ${(a.filter((x) => x.ok).length / a.length).toFixed(2)}` : ""; });
  console.log("by week:", byWeek.join(" | "));
  const d = (k) => (lv.reduce((s, a) => s + a[k], 0) / lv.length).toFixed(1);
  console.log("overall level after day 1/3/7/14/28/40:", [0, 2, 6, 13, 27, 39].map(d).join(" / "));
  console.log("avg XP/day:", (xp.flat().reduce((a, b) => a + b, 0) / xp.flat().length).toFixed(0));
  // repetition per learner
  let exact = 0, sentRep = 0, sentQ = 0, within = 0, uniqSent = 0, uniqSig = 0;
  for (const r of all) {
    const seen = new Map(), sseen = new Map();
    for (const x of r.log) {
      if (seen.has(x.sig)) exact++; seen.set(x.sig, 1);
      if (x.sent) { sentQ++; if (sseen.has(x.sent)) sentRep++; sseen.set(x.sent, (sseen.get(x.sent) || 0) + 1); }
    }
    uniqSent += sseen.size; uniqSig += seen.size;
    // within a session of 10
    const bySess = {};
    r.log.forEach((x) => { if (x.sent) (bySess[x.d + "-" + x.r] ||= []).push(x.sent); });
    Object.values(bySess).forEach((a) => { if (new Set(a).size < a.length) within++; });
  }
  console.log(`exact repeat questions: ${(100 * exact / log.length).toFixed(1)}% | sentence shown before: ${(100 * sentRep / sentQ).toFixed(1)}% of sentence questions | unique sentences/learner ${(uniqSent / N).toFixed(0)} of 733 | sessions with a repeated sentence: ${(100 * within / (N * 80)).toFixed(0)}%`);
  console.log("targeted share:", (log.filter((x) => x.targeted).length / log.length).toFixed(2));
  // retest latency after a wrong cell answer vs right
  let latW = [], latR = [];
  for (const r of all) {
    const L = r.log;
    for (let i = 0; i < L.length; i++) {
      if (!L[i].cell) continue;
      let j = i + 1; while (j < L.length && L[j].cell !== L[i].cell) j++;
      if (j < L.length) (L[i].ok ? latR : latW).push(j - i);
    }
  }
  const med = (a) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
  console.log(`questions until same cell again: after wrong median ${med(latW)}, after right median ${med(latR)}`);
  /* The same in days, and for the exact thing that was missed — this word in
     this cell (critique item 18: a miss should be back the next day). A miss
     in the last week of the simulation is left out: it has had no time. */
  const back = { cell: [], fact: [] }; let missed = 0;
  for (const r of all) {
    const L = r.log;
    for (let i = 0; i < L.length; i++) {
      if (L[i].ok || !L[i].cell || L[i].d > 32) continue;
      missed++;
      const find = (same) => { let j = i + 1; while (j < L.length && !same(L[j])) j++; return j < L.length ? L[j].d - L[i].d : Infinity; };
      back.cell.push(find((x) => x.cell === L[i].cell && x.d > L[i].d));
      if (L[i].word) back.fact.push(find((x) => x.cell === L[i].cell && x.word === L[i].word && x.d > L[i].d));
    }
  }
  const share = (a, f) => (a.length ? (100 * a.filter(f).length / a.length).toFixed(0) + "%" : "–");
  const medDays = (a) => { const m = med([...a]); return m === Infinity ? "never" : m; };
  console.log(`a missed cell on a LATER day (${missed} misses): back the next day ${share(back.cell, (x) => x <= 1)}, within 3 days ${share(back.cell, (x) => x <= 3)}, median ${medDays(back.cell)} days`);
  console.log(`the same word in the same cell: back the next day ${share(back.fact, (x) => x <= 1)}, within 3 days ${share(back.fact, (x) => x <= 3)}, within 40 days ${share(back.fact, (x) => x < Infinity)}`);
  const S = all[0].S;
  console.log("distinct cells met (learner 0):", Object.keys(S.cells).length, "distinct words:", Object.keys(S.words).length);
}
