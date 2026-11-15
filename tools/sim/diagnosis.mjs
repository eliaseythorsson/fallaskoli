const R = decodeURIComponent(new URL("../..", import.meta.url).pathname).replace(/\/$/, "");
const { DATA } = await import(R + "/data/data_bundle.js");
const { buildLexicon } = await import(R + "/src/js/core/lexicon.js");
const { blankState, newSession } = await import(R + "/src/js/core/state.js");
const { SKILL_IDS } = await import(R + "/src/js/core/skills.js");
const { taskFill, taskVerb, taskVerbSlot } = await import(R + "/src/js/tasks/index.js");
const { gradeForm, normalise } = await import(R + "/src/js/core/grading.js");
const { diagnose } = await import(R + "/src/js/core/diagnosis.js");
const { readMark } = await import(R + "/src/js/core/marks.js");
const lex = buildLexicon(DATA);
const S = blankState(); SKILL_IDS.forEach((id) => { S.enabled[id] = true; });
const sess = newSession(S);
const ctx = { lex, S, sess, forcedNoun: null, noExtras: true };
const res = {};
const add = (kind, pats, ex) => { const r = (res[kind] ||= { n: 0, pats: {}, none: 0, ex: [] }); r.n++; if (!pats.length) { r.none++; if (r.ex.length < 6) r.ex.push(ex); } pats.forEach((p) => { r.pats[p] = (r.pats[p] || 0) + 1; }); };
const run = (t, kind, typed, para) => {
  if (!typed) return;
  const acc = t.answers;
  if (acc.some((a) => normalise(a) === normalise(typed))) return;
  const g = gradeForm(typed, { accepted: acc, paradigm: para });
  if (g.verdict === "correct") return;
  const f = diagnose(t, { kind: "form", items: [{ m: t.m, typed, g, accepted: acc, conj: t.conj }] });
  add(kind, f.map((x) => x.p), `${typed} for ${acc[0]} (${t.m}) [${g.verdict}]`);
};
const CASES = ["NF", "ÞF", "ÞGF", "EF"];
for (let k = 0; k < 4000; k++) {
  sess.diff.nafnord = 1 + (k % 5); sess.seen = [];
  const t = taskFill(ctx); if (!t || t.extra) continue;
  const P = t.n.forms, m = t.m, a = readMark(m);
  const cs = a.fall === "ÞG" ? "ÞGF" : a.fall;
  const mk = (c, num, gr) => c + (num === "eintala" ? "ET" : "FT") + (gr ? "gr" : "");
  const f = (mm) => (P[mm] || [])[0];
  if (cs === "ÞF") run(t, "noun: dative for accusative", f(mk("ÞGF", a.tala, a.greinir)), P);
  if (cs === "ÞGF") run(t, "noun: accusative for dative", f(mk("ÞF", a.tala, a.greinir)), P);
  if (cs === "EF") run(t, "noun: dative for genitive", f(mk("ÞGF", a.tala, a.greinir)), P);
  if (cs !== "NF") run(t, "noun: left in nominative", f(mk("NF", a.tala, a.greinir)), P);
  run(t, "noun: article wrong", f(mk(cs, a.tala, !a.greinir)), P);
  run(t, "noun: number wrong", f(mk(cs, a.tala === "eintala" ? "fleirtala" : "eintala", a.greinir)), P);
  const r = t.answers[0];
  if (/[áéíóúý]/.test(r)) run(t, "noun: accent dropped", r.replace(/[áéíóúý]/, (c) => ({ á: "a", é: "e", í: "i", ó: "o", ú: "u", ý: "y" }[c])), P);
  if (/ö/.test(r)) run(t, "noun: u-umlaut missed (ö→a)", r.replace("ö", "a"), P);
  if (/æ/.test(r) && !/æ/.test(t.n.o)) run(t, "noun: i-umlaut missed (æ→ó/á)", r.replace("æ", /ó/.test(t.n.o) ? "ó" : "á"), P);
  if (/(.)\1/.test(r)) run(t, "noun: double consonant dropped", r.replace(/([b-df-hj-np-tv-xzðþ])\1/, "$1"), P);
  if (/nn$/.test(r)) run(t, "noun: -n for -nn (article)", r.slice(0, -1), P);
  if (/num$/.test(r)) run(t, "noun: -unum → -num/-inum confusion", r.replace(/unum$/, "inum"), P);
  run(t, "noun: wrong ending (-ar/-ir/-ur swapped)", /ar$/.test(r) ? r.replace(/ar$/, "ir") : /ir$/.test(r) ? r.replace(/ir$/, "ar") : /ur$/.test(r) ? r.replace(/ur$/, "ar") : null, P);
  run(t, "noun: y/i confusion", /y/.test(r) ? r.replace("y", "i") : /ý/.test(r) ? r.replace("ý", "í") : null, P);
}
for (let k = 0; k < 4000; k++) {
  sess.diff.sagnord = 1 + (k % 5); sess.seen = [];
  const t = k % 2 ? taskVerb(ctx) : taskVerbSlot(ctx); if (!t || !t.v && !t.shown) continue;
  const v = t.v || lex.lookup(t.shown, "so"); if (!v) continue;
  const P = v.forms, a = readMark(t.m); const r = t.answers[0];
  const stem = v.o.replace(/a$/, "");
  if (a.tíð === "þátíð" && t.conj === "sterk" && a.háttur === "framsöguháttur") {
    const end = { "1. persóna": a.tala === "eintala" ? "aði" : "uðum", "2. persóna": a.tala === "eintala" ? "aðir" : "uðuð", "3. persóna": a.tala === "eintala" ? "aði" : "uðu" }[a.persóna];
    run(t, "verb: strong verb given weak past", stem + end, P);
  }
  const swap = (from, to) => t.m.includes(from) ? (P[t.m.replace(from, to)] || [])[0] : null;
  run(t, "verb: wrong tense", swap("-NT-", "-ÞT-") || swap("-ÞT-", "-NT-"), P);
  run(t, "verb: wrong person", swap("3P", "1P") || swap("1P", "3P") || swap("2P", "3P"), P);
  run(t, "verb: singular/plural", swap("-ET", "-FT") || swap("-FT", "-ET"), P);
  run(t, "verb: indicative/subjunctive", swap("-FH-", "-VH-") || swap("-VH-", "-FH-"), P);
  if (/[áéíóúý]/.test(r)) run(t, "verb: accent dropped", r.replace(/[áéíóúý]/, (c) => ({ á: "a", é: "e", í: "i", ó: "o", ú: "u", ý: "y" }[c])), P);
  run(t, "verb: infinitive typed", v.o, P);
  if (/ð/.test(r)) run(t, "verb: ð→d", r.replace("ð", "d"), P);
}
for (const [k, r] of Object.entries(res)) {
  console.log(`${k} — n=${r.n}; undiagnosed ${(100 * r.none / r.n).toFixed(0)}%; ${Object.entries(r.pats).sort((a, b) => b[1] - a[1]).map(([p, c]) => p + " " + (100 * c / r.n).toFixed(0) + "%").join(", ")}${r.ex.length ? "\n     e.g. undiagnosed: " + r.ex.slice(0, 4).join("; ") : ""}`);
}
