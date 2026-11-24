/* Vocabulary questions shown, and how many different words they were about.
   Until #10 this counted the items marked as asked in `S.vocab` against the
   questions shown (critique item 4: a candidate built and thrown away must
   use nothing up). `S.vocab` and its wait of days are gone (#10); the same
   six pupils now show what the vocabulary questions ask instead. */
import { simulate } from "./sim.mjs";
const KINDS = ["or_heiti", "or_samhengi", "or_myndun", "meaning", "or_utundan"];
let shown = 0, distinct = 0, again = 0;
for (let s = 0; s < 6; s++) {
  const r = simulate({ ability: 0.6, days: 30, perDay: 2, size: 10, allSkills: true, seed: 50 + s });
  const voc = r.log.filter((x) => KINDS.includes(x.type));
  shown += voc.length;
  const keys = voc.map((x) => x.type + "|" + x.word);
  distinct += new Set(keys).size;
  again += keys.length - new Set(keys).size;
  if (s === 0) { const t = {}; r.log.forEach((x) => { t[x.type] = (t[x.type] || 0) + 1; }); console.log(KINDS.filter((k) => k !== "meaning").map((k) => k + ":" + (t[k] || 0)).join(" ")); }
}
console.log("vocabulary questions shown:", shown, "| different word-and-type pairs:", distinct, "| asked again in the same type (any day):", again);
