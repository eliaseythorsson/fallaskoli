/* Setningagerðir (years 9–10): aðalsetning, aukasetning, nafnháttarsetning.

     clause       what kind of clause is the marked run of words
     gerd_finna   click every word of the subordinate clause
     gerd_upphaf  on which word does the clause begin

   The clause type (`k` on each token) comes from the parse and passed the
   guard like everything else; the builders read it and infer nothing. */

import { built } from "./effects.js";
import { pick, shuffle, bandFor, PUNCT } from "./shared.js";

const CLAUSE_KINDS = ["aðalsetning", "aukasetning", "nafnháttarsetning"];

/** Contiguous runs of tokens carrying the same clause type. */
function clauseSpans(s) {
  const out = [];
  let start = 0;
  for (let i = 1; i <= s.tok.length; i++) {
    const prev = s.tok[i - 1].k;
    const here = i < s.tok.length ? s.tok[i].k : null;
    if (here !== prev) {
      if (prev && i - start > 1) out.push({ from: start, to: i - 1, kind: prev });
      start = i;
    }
  }
  return out;
}

export function taskClause(lex, view, rng) {
  const { sess } = view;
  /* A floor, not a ceiling. Sentences with more than one clause type all sit
     at level 2-5 in the bank, and this material is above year 8 anyway — it
     would be false modesty to refuse to ask about it because the starting
     difficulty is 1. The ceiling keeps rising with difficulty once sentences at
     level 6-7 arrive. */
  const P = view.policy;
  const band = Math.max(5, bandFor(view, "setningagerd"));
  const pool = lex.sentences.filter((s) => {
    /* `ku`: the build could not vouch for where this sentence's clauses
       begin and end, so nothing is asked about them. */
    if (s.ku || s.lvl > band || !P.level(s.lvl)) return false;
    const kinds = new Set(s.tok.map((t) => t.k).filter(Boolean));
    return kinds.size > 1;
  });
  if (!pool.length) return null;

  for (const s of shuffle(pool, rng).slice(0, 12)) {
    /* A clause has a verb. A run of words without one is a phrase, whatever
       the label on it, and is not asked about. */
    const spans = clauseSpans(s).filter((x) =>
      s.tok.slice(x.from, x.to + 1).some((t) => t.x === "so"));
    /* The question is asked, by preference, about the part that is NOT the
       main clause: "where is the subordinate clause" is the question that
       teaches, not "what is the remainder called". */
    const interesting = spans.filter((x) => x.kind !== "aðalsetning");
    const span = pick(interesting.length ? interesting : spans, rng);
    if (!span) continue;
    return built({
      type: "clause", skill: "setningagerd", s, span,
      answer: span.kind, picked: null,
      options: CLAUSE_KINDS,
      base: 14, cell: "gerd:" + span.kind,
      lvl: Math.max(s.lvl, 6),      // this is material above year 8
    });
  }
  return null;
}

/* ================= Find it (v6.11) ======================================= */

function subClause(lex, view, rng) {
  const P = view.policy;
  const b = Math.max(5, bandFor(view, "setningagerd"));
  const pool = shuffle(lex.sentences.filter((s) => !s.ku && P.level(s.lvl) && s.lvl <= b
    && new Set(s.tok.map((t) => t.k).filter(Boolean)).size > 1), rng);
  for (const s of pool.slice(0, 30)) {
    const spans = clauseSpans(s).filter((x) => x.kind !== "aðalsetning"
      && s.tok.slice(x.from, x.to + 1).some((t) => t.x === "so"));
    /* One subordinate clause of that kind, so "the" clause is unambiguous. */
    const kinds = spans.map((x) => x.kind);
    const one = spans.filter((x) => kinds.filter((k) => k === x.kind).length === 1);
    if (one.length) return { s, span: pick(one, rng) };
  }
  return null;
}

export function clFind(lex, view, rng) {
  const c = subClause(lex, view, rng);
  if (!c) return null;
  const { s, span } = c;
  const targets = [];
  for (let j = span.from; j <= span.to; j++) if (!PUNCT.has(s.tok[j].w)) targets.push(j);
  return built({
    type: "tap", skill: "setningagerd", s, cls: span.kind, targets, whole: true,
    title: `Finndu ${span.kind}una`,
    question: `Smelltu á **öll orðin** í ${span.kind}unni.`,
    base: 14, lvl: Math.max(6, s.lvl), cell: "gerd:finna-" + span.kind, word: null, tags: ["clause"],
  });
}

export function clStart(lex, view, rng) {
  const c = subClause(lex, view, rng);
  if (!c) return null;
  const { s, span } = c;
  const first = s.tok[span.from];
  const others = shuffle(s.tok.filter((t, j) => !PUNCT.has(t.w) && (j < span.from || j > span.to) && t.w !== first.w)
    .map((t) => t.w), rng).filter((w, k, a) => a.indexOf(w) === k).slice(0, 3);
  if (others.length < 2) return null;
  return built({
    type: "choice", skill: "setningagerd", s, i: -1, span,
    title: "Hvar hefst setningin?", question: `Á hvaða orði hefst ${span.kind}in?`,
    options: shuffle([first.w, ...others], rng), answer: first.w,
    why: span.kind === "aukasetning"
      ? `Aukasetningin hefst á *${first.w}*. Aukasetningar hefjast oftast á samtengingu (*að, sem, þegar, ef, af því að …*).`
      : `Nafnháttarsetningin hefst á *${first.w}*: *að* + sögn í nafnhætti.`,
    base: 12, lvl: Math.max(6, s.lvl), cell: "gerd:upphaf", word: null, tags: ["clause"], miss: ["setningagerd"],
  });
}

export const TYPES = [
  { id: "clause", skill: "setningagerd", weight: 8, renderer: "clause",
    tags: ["clause"],
    bands: [1],
    build: taskClause },
  { id: "gerd_finna", skill: "setningagerd", weight: 5, renderer: "tap",
    tags: ["clause"],
    bands: [1],
    build: clFind },
  { id: "gerd_upphaf", skill: "setningagerd", weight: 4, renderer: "choice",
    tags: ["clause"],
    bands: [1],
    build: clStart },
];
