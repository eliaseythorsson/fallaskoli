/* The spacing rule (#10) in numbers: what a pupil meets again, and how soon.

     node tools/sim/spacing.mjs [pupils] [days]

   Mixed sessions with every skill on, two sessions of ten a day, three
   abilities, the builders drawing from a seeded generator (so a rerun on the
   same tree prints the same figures). Per ability it prints:

     same word, same type, next question   the pairs #10 forbids
     same word, other type, next question  allowed, and wanted (DLD-PLAN §1)
     vocabulary                            the Orðaforði types: how many were
                                           asked, about how many words, and how
                                           many came back the same day or within
                                           a week in the same type — what the
                                           old gate (core/spacing.js, deleted
                                           in #10) used to stop
     null picks                            sessions that ran out of questions

   Copy it into an older checkout's tools/sim/ to compare two trees. */
import { simulate } from "./sim.mjs";

const pupils = Number(process.argv[2]) || 6;
const days = Number(process.argv[3]) || 30;
const VOCAB = new Set(["meaning", "or_heiti", "or_samhengi", "or_myndun", "or_utundan"]);
const seeded = (seed) => { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };

for (const [name, ability] of [["weak", 0.5], ["mid", 0.72], ["strong", 0.9]]) {
  let n = 0, pairs = 0, sameBoth = 0, sameWord = 0, nulls = 0;
  let voc = 0, vocSameDay = 0, vocWeek = 0;
  const vocWords = [];
  for (let p = 0; p < pupils; p++) {
    const r = simulate({ ability, days, perDay: 2, size: 10, allSkills: true, seed: 300 + p,
      builderRng: seeded(9000 + p) });
    nulls += r.nulls;
    const L = r.log;
    n += L.length;
    for (let i = 1; i < L.length; i++) {
      /* consecutive within one session: the next session starts afresh */
      if (L[i].d !== L[i - 1].d || L[i].r !== L[i - 1].r) continue;
      pairs++;
      if (!L[i].word || L[i].word !== L[i - 1].word) continue;
      if (L[i].type === L[i - 1].type) sameBoth++; else sameWord++;
    }
    const last = new Map(), words = new Set();
    for (const x of L) {
      if (!VOCAB.has(x.type) || !x.word) continue;
      voc++;
      words.add(x.word);
      const k = x.type + "|" + x.word;
      if (last.has(k)) {
        const gap = x.d - last.get(k);
        if (gap === 0) vocSameDay++;
        else if (gap < 7) vocWeek++;
      }
      last.set(k, x.d);
    }
    vocWords.push(words.size);
  }
  const pc = (a, b) => (b ? (100 * a / b).toFixed(1) + "%" : "–");
  console.log(`\n##### ${name} (ability ${ability}) — ${pupils} pupils × ${days} days, ${n} questions`);
  console.log(`same word, same type, next question:  ${sameBoth} of ${pairs} pairs (${pc(sameBoth, pairs)})`);
  console.log(`same word, other type, next question: ${sameWord} of ${pairs} pairs (${pc(sameWord, pairs)})`);
  console.log(`vocabulary questions: ${voc} (${pc(voc, n)} of all), ${(vocWords.reduce((a, b) => a + b, 0) / pupils).toFixed(0)} words per pupil`);
  console.log(`  the same word in the same vocabulary type again: the same day ${vocSameDay} (${pc(vocSameDay, voc)}), 1–6 days later ${vocWeek} (${pc(vocWeek, voc)})`);
  console.log(`null picks: ${nulls}`);
}

/* Each skill alone (a session on one category, where pools are smallest):
   2 pupils × 10 days × 2 sessions of 10, ability 0.72. */
const { SKILL_IDS } = await import("./sim.mjs");
console.log("\n##### one skill at a time — same word, same type, next question");
const rows = [];
for (const [k, topic] of SKILL_IDS.entries()) {
  let pairs = 0, same = 0;
  for (let p = 0; p < 2; p++) {
    const L = simulate({ ability: 0.72, days: 10, perDay: 2, size: 10, topic, allSkills: true, seed: 400 + 10 * k + p,
      builderRng: seeded(9500 + 10 * k + p) }).log;
    for (let i = 1; i < L.length; i++) {
      if (L[i].d !== L[i - 1].d || L[i].r !== L[i - 1].r) continue;
      pairs++;
      if (L[i].word && L[i].word === L[i - 1].word && L[i].type === L[i - 1].type) same++;
    }
  }
  rows.push(`${topic} ${same}/${pairs}`);
}
console.log(rows.join(" · "));

/* Orðaforði alone, where the old wait of days mattered most: 3 pupils ×
   14 days × 2 sessions of 10. */
{
  let n = 0, sameDay = 0, week = 0, nulls = 0, pairs = 0;
  const words = [];
  for (let p = 0; p < 3; p++) {
    const r = simulate({ ability: 0.72, days: 14, perDay: 2, size: 10, topic: "ordaford", allSkills: true,
      seed: 600 + p, builderRng: seeded(9700 + p) });
    nulls += r.nulls;
    const last = new Map(), seen = new Set();
    for (const x of r.log) {
      if (!x.word) continue;
      n++;
      const k = x.type + "|" + x.word;
      seen.add(k);
      if (last.has(k)) { const g = x.d - last.get(k); if (g === 0) sameDay++; else if (g < 7) week++; }
      last.set(k, x.d);
    }
    words.push(seen.size);
    pairs += r.log.length;
  }
  const pc = (a, b) => (b ? (100 * a / b).toFixed(1) + "%" : "–");
  console.log(`\n##### Orðaforði sessions — 3 pupils × 14 days × 2 sessions of 10: ${pairs} questions, ${nulls} null picks`);
  console.log(`different word-and-type pairs per pupil: ${(words.reduce((a, b) => a + b, 0) / 3).toFixed(0)}`);
  console.log(`the same word in the same type again: the same day ${sameDay} (${pc(sameDay, n)}), 1–6 days later ${week} (${pc(week, n)})`);
}
