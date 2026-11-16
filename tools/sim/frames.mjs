const R = decodeURIComponent(new URL("../..", import.meta.url).pathname).replace(/\/$/, "");
const { DATA } = await import(R + "/data/data_bundle.js");
const { buildLexicon } = await import(R + "/src/js/core/lexicon.js");
const { blankState, newSession } = await import(R + "/src/js/core/state.js");
const { SKILL_IDS } = await import(R + "/src/js/core/skills.js");
const { TASKS, makeView, built } = await import(R + "/src/js/tasks/index.js");
const { nounCloze } = await import(R + "/src/js/tasks/cloze.js");
const rng = () => Math.random();
const lex = buildLexicon(DATA);
const frame = (t) => t.s.tok.map((x, j) => (j === t.i ? "___" : x.w)).join(" ");
for (const id of ["fill", "revform", "fs_fsno", "no_val", "verbslot"]) {
  const T = TASKS.find((x) => x.id === id);
  const S = blankState(); SKILL_IDS.forEach((k) => { S.enabled[k] = true; });
  const sess = newSession(S);
  // the cloze bare, without an adjective or *þessi* beside the noun
  const build = id === "fill" ? (l, v, r) => { const t = nounCloze(l, v, r); return t ? built(t) : null; } : T.build;
  const fr = {}; let n = 0, same = 0, cases = {}, defs = {}, nums = {};
  for (let k = 0; k < 3000; k++) {
    SKILL_IDS.forEach((s) => { sess.diff[s] = 1 + (k % 4); }); sess.seen = [];
    const b = build(lex, makeView({ S, sess }), rng); const t = b && b.task; if (!t || !t.s) continue; n++;
    const f = frame(t); fr[f] = (fr[f] || 0) + 1;
    if (t.n && t.answers && t.answers.some((a) => a.toLowerCase() === t.n.o.toLowerCase())) same++;
    if (t.a && t.a.fall) { cases[t.a.fall] = (cases[t.a.fall] || 0) + 1; defs[t.a.greinir ? "með" : "án"] = (defs[t.a.greinir ? "með" : "án"] || 0) + 1; nums[t.a.tala] = (nums[t.a.tala] || 0) + 1; }
  }
  const top = Object.entries(fr).sort((a, b) => b[1] - a[1]);
  const top10 = top.slice(0, 10).reduce((a, x) => a + x[1], 0);
  console.log(`\n${id}: ${n} built, ${top.length} distinct frames, top-10 frames = ${(100 * top10 / n).toFixed(0)}% of questions; answer identical to the dictionary form: ${(100 * same / n).toFixed(1)}%`);
  console.log("  cases", JSON.stringify(cases), "article", JSON.stringify(defs), "number", JSON.stringify(nums));
  console.log("  top:", top.slice(0, 6).map(([f, c]) => `${f} ×${c}`).join(" | "));
}
