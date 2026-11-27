#!/usr/bin/env node
/* The Orðakort of a word, printed as the pupil meets it (issue #15) — for a
 * person to read. Every option on a card comes from BÍN, ÍNO or a
 * hand-written list (src/js/tasks/wordcard.js says which); this is where a
 * native reader checks that the result is right.
 *
 *   node tools/wordcards.mjs                 the first 40 words a pupil can get
 *   node tools/wordcards.mjs 100 3           the first 100 at þyngd 3
 *   node tools/wordcards.mjs breyting áhrif  these words
 *   node tools/wordcards.mjs --propose 330   propose wrong explanations for the
 *                                            first 330 words that have none in
 *                                            src/js/content/wordcards.js: lines to
 *                                            READ, then paste there
 */
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { learningCandidates } from "../src/js/core/wordknowledge.js";
import { seeded } from "../src/js/core/duel.js";
import { buildCard, proposeFar, explainPairs, senseOf } from "../src/js/tasks/wordcard.js";

const lex = buildLexicon(DATA);
const args = process.argv.slice(2);
const propose = args[0] === "--propose";
const nums = args.filter((a) => /^\d+$/.test(a)).map(Number);
const names = args.filter((a) => !/^\d+$/.test(a) && !a.startsWith("--"));
const words = names.length
  ? names.flatMap((n) => lex.lemma(n.split("|")[0]).filter((w) => !n.includes("|") || w.c === n.split("|")[1]))
  : learningCandidates({}, lex, nums[1] || 7).slice(0, nums[0] || 40);

if (propose) {
  const have = explainPairs();
  for (const w of words) {
    const key = `${w.o}|${w.c}`, s = senseOf(w, {});
    if (have.has(key) || !s.ino || !s.def) continue;
    const far = proposeFar(lex, w, seeded(key.length * 7919 + w.lino));
    if (far.length === 2)
      console.log(`${key} ${far.map((x) => `${x.o}|${x.c}`).join(" ")}\t${s.def}  ##  ${far.map((x) => x.d).join("  ##  ")}`);
  }
} else {
  for (const w of words) {
    const card = buildCard(lex, `${w.o}|${w.c}`);
    console.log(`\n== ${card.word}`);
    for (const s of card.steps) {
      if (s.kind === "read") {
        console.log(`  skýring:  ${s.def || "—"}${s.source ? ` (${s.source})` : ""}`);
        for (const x of s.sentences) console.log(`  dæmi:     ${x.text}${x.src ? ` (${x.src})` : ""}`);
        console.log(`  atkvæði:  ${s.syllables ? s.syllables.join("·") : "—"}`);
        console.log(`  beyging:  ${s.table ? s.table.rows.map((r) => r.join(" ")).join(" | ") : s.note || "—"}`);
      } else {
        console.log(`  [${s.id}] ${s.question}`);
        for (const o of s.options) console.log(`      ${s.answer ? (s.answer.includes(o.id) ? "✓" : "✗") : "·"} ${o.text}`);
        if (s.why) console.log(`      → ${s.why}`);
      }
    }
  }
}
