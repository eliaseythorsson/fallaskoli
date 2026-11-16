/* Nafnorð: föll, tala, greinir.

     fill     the cloze — a noun written in the form its sentence asks for;
              now and then with an adjective or *þessi* beside it, and the
              question then counts for that category
     no_val   the same cloze as a choice between the noun's case forms
     tbl_no   beygingartafla: all four cases of one column

   The cloze itself is in tasks/cloze.js (Fallstjórn uses it too). */

import { CASES, COLS, mark } from "../core/marks.js";
import { diffOf } from "../core/difficulty.js";
import { skillLevel } from "../core/progress.js";
import { wordKey } from "../core/state.js";
import { explainAdjective } from "./explain.js";
import { showable, fittingAdjectives } from "./frames.js";
import { built } from "./effects.js";
import { withView } from "./view.js";
import { nounCloze } from "./cloze.js";
import { pick, wpick, shuffle, askable, bandFor, forced, drilling, wordWeight, cellWeight, cap1 } from "./shared.js";

/* ================= Cloze — noun (± adjective) =========================== */

export function taskFill(lex, view, rng) {
  const { S, sess } = view;
  const pPhrase = Math.min(0.5, 0.05 * (diffOf(sess, "nafnord") - 1) +
    0.03 * (skillLevel(S.skills.nafnord.xp).level - 1));
  const pDem = Math.min(0.45, 0.25 + 0.05 * (diffOf(sess, "nafnord") - 1));

  const P = view.policy;
  const task = nounCloze(lex, view, rng, { noun: view.forcedNoun });
  if (!task) return null;
  const { s, n, a } = task;
  const t = s.tok[s.slot];

  /* An adjective or demonstrative is only added when that material is on —
     and only where one can stand. Beside a numeral, a pronoun, an adjective
     or the article it cannot: "Tveir þessir hestar", "Ég á góða þessa vini",
     "Sú góð kona". And *þessi* is not put before a word that is the
     predicative of *þetta* ("Þetta er þessi hugmynd"). */
  const mayAdj = P.skill("lysingarord");
  const mayDem = P.skill("fornofn");
  const MODIFIER = ["töluorð", "lýsingarorð", "fornafn", "greinir"];
  const prev = s.tok[s.slot - 1], next = s.tok[s.slot + 1];
  const crowded = s.fixed || (prev && (MODIFIER.includes(prev.c) || prev.rj))
    || (next && (MODIFIER.includes(next.c) || next.rj));
  const afterThetta = t.r === "sagnfylling";
  if (!crowded && (mayAdj || mayDem) && rng() < pPhrase) {
    const kyn = n.c.toUpperCase();
    const cn = (a.fall === "ÞG" ? "ÞGF" : a.fall) + (a.tala === "fleirtala" ? "FT" : "ET");
    if (mayDem && rng() < pDem && !a.greinir && !afterThetta) {
      const d = lex.lookup("þessi", "fn");
      const dm = `${kyn}-${cn}`;
      const f = d && askable(P, dm) && d.forms[dm];
      if (f) {
        task.extra = { lemma: "þessi", fl: "ábendingarfornafn", form: f[0] };
        task.answers = n.forms[t.m].map((x) => f[0] + " " + x);
        task.skill = "fornofn";
        task.base = 13;
        task.why = "Ábendingarfornafnið *þessi* lagar sig að nafnorðinu: það stendur í sama kyni, sömu tölu og sama falli. Nafnorð sem stendur með *þessi* fær ekki greini.";
      }
    } else if (mayAdj) {
      /* Not any adjective: one that suits this kind of noun. A random one
         out of 980 gave "óléttir lyklar". A noun of a class with no fitting
         adjective (an abstract, a body part, weather) is asked bare. */
      const pool = fittingAdjectives(n.s).map((o) => lex.lookup(o, "lo")).filter(Boolean);
      const adj = pool.length ? pick(pool, rng) : null;
      const deg = a.greinir ? "FVB" : "FSB";
      const am = `${deg}-${kyn}-${cn}`;
      const f = adj && askable(P, am) && adj.forms[am];
      if (f) {
        task.extra = { lemma: adj.o, fl: "lýsingarorð", form: f[0] };
        task.answers = n.forms[t.m].map((x) => f[0] + " " + x);
        task.skill = "lysingarord";
        task.base = 14;
        task.adjective = adj;
        task.why = explainAdjective(a);
      }
    }
  }
  return built(task);
}

/** The cloze on one given noun — a rescue drill (tasks/drill.js). */
const fillWord = (lex, view, rng, entry) => taskFill(lex, withView(view, { forcedNoun: entry }), rng);

/* ================= Choice between case forms (v6.11) ==================== */

/** The cloze as a choice between the noun's case forms. */
export function noChoice(lex, view, rng) {
  const t = nounCloze(lex, view, rng);
  if (!t) return null;
  const col = t.m.replace(/^(NF|ÞF|ÞGF|EF)/, "");
  const right = new Set(t.answers);
  const opts = [...new Set(["NF", "ÞF", "ÞGF", "EF"].map((c) => (t.n.forms[c + col] || [])[0])
    .filter((f) => f && !right.has(f)))];
  if (opts.length < 2) return null;
  const cap = t.i === 0;
  const fix = (f) => (cap ? cap1(f) : f);
  return built({
    type: "choice", skill: "nafnord", s: t.s, i: t.i, cue: t.n.o,
    title: "Veldu rétt fall", question: `Í hvaða mynd á *${t.n.o}* að standa?`,
    options: shuffle([t.answers[0], ...opts.slice(0, 3)], rng).map(fix), answer: fix(t.answers[0]),
    why: t.why, base: 7, lvl: t.lvl, cell: t.cell, word: t.word,
    m: t.m, paradigm: t.n.forms, tags: [],
  });
}

/* ================= Beygingartafla ======================================== */

/* A beygingartafla asks four or six cells at once, so it is only built when
   EVERY cell in it is allowed. Filtering the rows instead would produce a table
   with a hole in it, which teaches the wrong shape of the paradigm — the point
   of the table is that it is complete. */
export function tableNoun(lex, view, rng) {
  const { S } = view;
  const P = view.policy;
  if (drilling(view) && !forced(view, ["kk", "kvk", "hk"])) return null;
  const n = forced(view, ["kk", "kvk", "hk"]) || wpick(lex.nouns, (x) => wordWeight(lex, view, x, "nafnord"), rng);
  const cols = COLS.filter((c) => CASES.every((cs) => n.forms[mark(cs.k, c.k)])
    && showable(n, mark("NF", c.k))
    && P.marks(CASES.map((cs) => mark(cs.k, c.k))));
  if (!cols.length) return null;
  const col = wpick(cols, (c) => CASES.reduce((a, cs) => a + cellWeight(S, mark(cs.k, c.k)), 0), rng);
  return built({
    type: "table", kind: "no", skill: "nafnord", w: n,
    cells: CASES.map((cs) => ({ m: mark(cs.k, col.k), label: cs.name })),
    title: `${n.o} · ${col.name}`, base: 5, word: wordKey(n.o, n.c),
    lvl: bandFor(view, "nafnord"), paradigm: n.forms,
  });
}

export const TYPES = [
  { id: "fill", skill: "nafnord", weight: 26, renderer: "fill",
    tags: ["agree:kyn", "case:EF", "case:NF", "case:ÞF", "case:ÞGF", "form", "noun", "num"],
    bands: [1, 2, 3, 4, 5, 6, 7],
    build: taskFill, drill: fillWord },
  { id: "tbl_no", skill: "nafnord", weight: 5, renderer: "table",
    tags: ["case:EF", "case:NF", "case:ÞF", "case:ÞGF", "form", "noun", "num"],
    bands: [1],
    build: tableNoun },
  { id: "no_val", skill: "nafnord", weight: 8, renderer: "choice",
    tags: ["case:EF", "case:NF", "case:ÞF", "case:ÞGF", "noun", "num"],
    bands: [1, 2, 3, 4, 5, 6, 7],
    build: noChoice },
];
