const R = decodeURIComponent(new URL("../..", import.meta.url).pathname).replace(/\/$/, "");
const { DATA } = await import(R + "/data/data_bundle.js");
const { buildLexicon } = await import(R + "/src/js/core/lexicon.js");
const { blankState, newSession } = await import(R + "/src/js/core/state.js");
const { SKILL_IDS } = await import(R + "/src/js/core/skills.js");
const { typeById, makeView } = await import(R + "/src/js/tasks/index.js");
const rng = () => Math.random();
const lex = buildLexicon(DATA);
const S = blankState(); SKILL_IDS.forEach((k) => { S.enabled[k] = true; });
const sess = newSession(S);
const g = (id) => { const b = typeById(id).build(lex, makeView({ S, sess }), rng); return b ? b.task : null; };
for (const D of [1, 3, 5]) {
  SKILL_IDS.forEach((s) => { sess.diff[s] = D; });
  console.log("--- diff", D);
  for (let k = 0; k < 7; k++) { const t = g("villur"); if (t) console.log("  V:", t.hunt.lines.map((l) => l.toks.map((x) => (x.err ? `[${x.w}→${x.err.answers[0]}|${x.err.kind}]` : x.w)).join(" ")).join("  //  ")); }
  for (let k = 0; k < 6; k++) { const t = g("umritun"); if (t) console.log("  U:", t.kind, "|", t.s ? t.s.t : "", "→", t.answers[0], t.answers.length > 1 ? `(+${t.answers.length - 1})` : ""); }
  for (let k = 0; k < 4; k++) { const t = g("smidja"); if (t) console.log("  S:", t.cards.map((c) => c.text).join(" · "), "→", t.answers[0]); }
}
const kinds = {}; SKILL_IDS.forEach((s) => { sess.diff[s] = 3; });
for (let k = 0; k < 600; k++) { const t = g("umritun"); if (t) kinds[t.kind] = (kinds[t.kind] || 0) + 1; }
console.log("umritun kinds:", kinds);
const ek = {}; for (let k = 0; k < 600; k++) { const t = g("villur"); if (t) t.hunt.lines.forEach((l) => l.toks.forEach((x) => { if (x.err) ek[x.err.kind] = (ek[x.err.kind] || 0) + 1; })); }
console.log("villur error kinds:", ek);
