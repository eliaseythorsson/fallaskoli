/* Generated sentences, read by a person: for every open frame, N nouns drawn
 * the way the app draws them (common words first), each in the frame.
 *   node _grammar-audit/sample.mjs [N=5] [seed=1]
 */
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { candidateNouns, fillFrame, substitutable } from "../src/js/tasks/frames.js";

const N = +(process.argv[2] || 5);
let seed = +(process.argv[3] || 1);
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const lex = buildLexicon(DATA);
let frames = 0, empty = 0;
for (const s of lex.sentences) {
  if (!substitutable(s)) continue;
  const pool = candidateNouns(lex, s);
  frames++;
  if (!pool.length) { empty++; console.log(`∅ ${s.t}`); continue; }
  const t = s.tok[s.slot];
  const picks = new Set();
  const weight = (x) => (x.r <= 600 ? 1 : 0.15) / (1 + x.r / 150);
  for (let k = 0; k < 200 && picks.size < Math.min(N, pool.length); k++) {
    const total = pool.reduce((a, x) => a + weight(x), 0);
    let r = rnd() * total, got = pool[pool.length - 1];
    for (const x of pool) { r -= weight(x); if (r <= 0) { got = x; break; } }
    picks.add(got);
  }
  const outs = [...picks].map((w) => fillFrame({ s, i: s.slot }, w, w.forms[t.m][0]).tok[s.slot].w);
  console.log(`${s.t}  [${pool.length}] → ${outs.join(", ")}`);
}
console.error(`frames ${frames}, empty ${empty}`);
