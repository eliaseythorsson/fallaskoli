const R = decodeURIComponent(new URL("../..", import.meta.url).pathname).replace(/\/$/, "");
const { DATA } = await import(R + "/data/data_bundle.js");
const { buildLexicon } = await import(R + "/src/js/core/lexicon.js");
const { blankState, newSession } = await import(R + "/src/js/core/state.js");
const { SKILL_IDS } = await import(R + "/src/js/core/skills.js");
const { TASKS, makeView, applyEffects } = await import(R + "/src/js/tasks/index.js");
const rng = () => Math.random();
const lex = buildLexicon(DATA);
const sig = (t) => t.type === "villur" ? "villur|" + t.hunt.lines.map((l) => l.toks.map((x) => x.w).join(" ")).join("/") : t.type === "sort" ? (t.s ? t.s.t : "") + t.items.map((x) => x.w).join(",") : t.type === "tap" ? (t.s ? t.s.t : "") + "|" + t.cls : t.type === "parse" ? (t.s ? t.s.t : "") + "|" + t.t.w + "|" + t.i : t.type === "syntax" ? t.s.t + "|" + t.askRole : t.type === "clause" ? t.s.t + "|" + t.span.from : t.type === "meaning" ? t.word : [t.s ? t.s.t : (t.title || ""), t.prompt || t.question || "", (t.answers || [t.answer || ""])[0], t.cue || "", t.pron || ""].join("|");
console.log("type | diff1: built/600, distinct, distinct sentences, lvl mix | diff3 | diff5");
for (const T of TASKS) {
  const row = [T.id];
  for (const D of [1, 3, 5]) {
    const S = blankState(); SKILL_IDS.forEach((id) => { S.enabled[id] = true; });
    const sess = newSession(S); SKILL_IDS.forEach((id) => { sess.diff[id] = D; });
    const seen = new Set(), sents = new Set(), lv = {}; let built = 0;
    for (let k = 0; k < 600; k++) {
      sess.seen = [];
      const b = T.build(lex, makeView({ S, sess }), rng); if (!b) continue; built++;
      applyEffects({ S, sess }, b.effects);   // every question built here counts as shown
      const t = b.task;
      seen.add(sig(t)); if (t.s) sents.add(t.s.t); lv[t.lvl] = (lv[t.lvl] || 0) + 1;
    }
    row.push(`${built}, ${seen.size} distinct, ${sents.size} sent, ${JSON.stringify(lv)}`);
  }
  console.log(row.join(" | "));
}
