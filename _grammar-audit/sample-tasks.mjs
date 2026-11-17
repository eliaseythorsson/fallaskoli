/* What the child is actually asked: N tasks of every type, as text.
 *   node _grammar-audit/sample-tasks.mjs [N=8] [difficulty=4]
 */
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, newSession } from "../src/js/core/state.js";
import { SKILL_IDS } from "../src/js/core/skills.js";
import { TASKS, makeView, applyEffects } from "../src/js/tasks/index.js";
import { describeMark } from "../src/js/core/marks.js";
import { sentenceText } from "../src/js/tasks/frames.js";

const N = +(process.argv[2] || 8), D = +(process.argv[3] || 4);
const lex = buildLexicon(DATA);
const S = blankState();
SKILL_IDS.forEach((id) => { S.enabled[id] = true; });
const sess = newSession(S);
SKILL_IDS.forEach((id) => { sess.diff[id] = D; });
const host = { S, sess, forcedNoun: null };
const rng = () => Math.random();
const blank = (s, i) => s.tok.map((t, j) => (j === i ? "____" : t.w)).join(" ").replace(/ ([.,?!])/g, "$1");
const mark = (s, i) => s.tok.map((t, j) => (j === i ? `[${t.w}]` : t.w)).join(" ").replace(/ ([.,?!])/g, "$1");
for (const T of TASKS) {
  console.log(`\n== ${T.id}`);
  for (let k = 0, n = 0; k < 400 && n < N; k++) {
    const b = T.build(lex, makeView(host), rng);
    if (!b) continue;
    applyEffects(host, b.effects);          // read as shown, so the next one differs
    const t = b.task;
    n++;
    if (t.type === "fill") console.log(`  ${blank(t.s, t.i)}  (${t.extra ? t.extra.lemma + " + " : ""}${t.n.o}) → ${t.answers[0]}   | ${t.why || ""}`);
    else if (t.type === "verb") console.log(`  ${t.pron} ____ (að ${t.v.o}; ${t.label}) → ${t.answers.join("/")}`);
    else if (t.type === "verbslot") console.log(`  ${blank(t.s, t.i)}  (að ${t.shown}; ${describeMark(t.m)}) → ${t.answers.join("/")}   | ${t.why || ""}`);
    else if (t.type === "parse") console.log(`  ${t.standalone ? "«" + t.t.w + "» (af " + t.t.l + ")" : mark(t.s, t.i)} → ${t.t.c}; ${describeMark(t.t.m || "")} ${(t.t.u || []).length ? "~" + t.t.u : ""}`);
    else if (t.type === "table") console.log(`  ${t.title} → ${t.cells.map((c) => (c.label.length < 9 ? c.label + " " : "") + t.w.forms[c.m].join("/") + (c.helper ? " " + c.helper : "")).join(", ")}${t.helperRows ? "   | " + t.helperRows.map((r) => r.text).join(", ") : ""}`);
    else if (t.type === "syntax") console.log(`  ${t.s.t} → ${t.askRole}: ${t.s.tok.filter((x) => x.r === t.askRole).map((x) => x.w).join(", ")}`);
    else if (t.type === "clause") console.log(`  ${t.s.t} → «${sentenceText(t.s.tok.slice(t.span.from, t.span.to + 1))}» = ${t.answer}`);
    else if (t.type === "govern") console.log(`  ${mark(t.s, t.i)} → ${t.fall}`);
    else if (t.type === "indecl") console.log(`  ${mark(t.s, t.i)} → ${t.answer}`);
    else if (t.type === "meaning") console.log(`  ${t.n.o}: ${t.n.d}`);
  }
}
