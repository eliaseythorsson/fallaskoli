/* Setningagerðir (year 10): aðalsetning, aukasetning, nafnháttarsetning.

     clause       what kind of clause is the marked run of words
     gerd_finna   click every word of the subordinate clause
     gerd_upphaf  on which word does the clause begin

   The clause type (`k` on each token) comes from the parse and passed the
   guard like everything else; the builders read it and infer nothing. */

import { built } from "./effects.js";
import { pick, shuffle, bandFor, forcedCell, cellWanted, PUNCT } from "./shared.js";

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

/* The sentences Setningagerðir may ask about at this difficulty.

   A question here is as hard as its sentence: "Ég veit að þú kemur" and a
   year-10 sentence with a relative clause inside indirect speech are not the
   same task. So the pool follows the session's difficulty like every other
   sentence pool (shared.js `sentPool`): the band's own level and the one
   below it. Until v6.13 it was every sentence up to level 5 whatever the
   band, and every question was stamped þyngd 6 — no gradation, and the
   þyngd-6 bonus on a six-word sentence (item 14).

   The floor is the one difference from `sentPool`. Clauses need room: the
   bank has one sentence with two clause types at level 1, one at level 2 and
   eleven at level 3, so a new pupil's band of 1 would mean the same sentence
   every time. Below band 4 the pool is the band-4 pool (levels 3-4, eighty
   sentences) — the label on the question still says what the sentence is.

   The policy is asked twice, as everywhere: the band never rises above the
   highest level that is switched on, and no sentence of a level that is
   switched off is used. If the window is empty (levels 3-4 off, say), the
   nearest allowed sentences below it are used, then any allowed. */
const FLOOR = 4;

/** Every sentence this pupil may be asked about clauses in, at any level. */
function clauseSentences(lex, view) {
  const P = view.policy;
  /* `ku`: the build could not vouch for where this sentence's clauses begin
     and end, so nothing is asked about them. */
  return lex.sentences.filter((s) => !s.ku && P.level(s.lvl)
    && new Set(s.tok.map((t) => t.k).filter(Boolean)).size > 1);
}

function clausePool(lex, view, usable = clauseSentences(lex, view)) {
  const band = Math.min(Math.max(FLOOR, bandFor(view, "setningagerd")), view.policy.maxLevel);
  const near = usable.filter((s) => s.lvl <= band && s.lvl >= band - 1);
  if (near.length) return near;
  const below = usable.filter((s) => s.lvl <= band);
  return below.length ? below : usable;
}

/* A review (tasks/review.js) asks for the kind of clause that was missed, and
   does not wait for the difficulty: the sentences that have it are taken from
   the band's pool if it has any, else from every sentence the pupil may meet. */
function withKind(lex, view, has) {
  const usable = clauseSentences(lex, view);
  const pool = clausePool(lex, view, usable);
  return pool.some(has) ? pool.filter(has) : usable.filter(has);
}

/** The spans of a sentence the clause question may be asked about. */
function askable(s) {
  /* A clause has a verb. A run of words without one is a phrase, whatever
     the label on it, and is not asked about. */
  const spans = clauseSpans(s).filter((x) =>
    s.tok.slice(x.from, x.to + 1).some((t) => t.x === "so"));
  /* The question is asked, by preference, about the part that is NOT the
     main clause: "where is the subordinate clause" is the question that
     teaches, not "what is the remainder called". */
  const interesting = spans.filter((x) => x.kind !== "aðalsetning");
  return interesting.length ? interesting : spans;
}

const clauseTask = (s, span) => built({
  type: "clause", skill: "setningagerd", s, span,
  answer: span.kind, picked: null,
  options: CLAUSE_KINDS,
  base: 14, cell: "gerd:" + span.kind,
  lvl: s.lvl,                   // the sentence's own level, as in every sentence question
});

export function taskClause(lex, view, rng) {
  const fc = forcedCell(view);
  if (fc) {
    const kind = fc.startsWith("gerd:") ? fc.slice(5) : null;
    if (!CLAUSE_KINDS.includes(kind)) return null;
    const of = (s) => askable(s).filter((x) => x.kind === kind);
    const from = withKind(lex, view, (s) => of(s).length > 0);
    if (!from.length) return null;
    const s = pick(from, rng);
    return clauseTask(s, pick(of(s), rng));
  }
  const pool = clausePool(lex, view);
  if (!pool.length) return null;
  for (const s of shuffle(pool, rng).slice(0, 12)) {
    const span = pick(askable(s), rng);
    if (!span) continue;
    return clauseTask(s, span);
  }
  return null;
}

/* ================= Find it (v6.11) ======================================= */

/** The subordinate or infinitive clauses of a sentence that are the only one
    of their kind in it, so that "the" clause is unambiguous. */
function loneClauses(s) {
  const spans = clauseSpans(s).filter((x) => x.kind !== "aðalsetning"
    && s.tok.slice(x.from, x.to + 1).some((t) => t.x === "so"));
  const kinds = spans.map((x) => x.kind);
  return spans.filter((x) => kinds.filter((k) => k === x.kind).length === 1);
}

/** A sentence and one such clause in it. `kind`: only that kind (a review). */
function subClause(lex, view, rng, kind = null) {
  if (kind) {
    const of = (s) => loneClauses(s).filter((x) => x.kind === kind);
    const from = withKind(lex, view, (s) => of(s).length > 0);
    if (!from.length) return null;
    const s = pick(from, rng);
    return { s, span: pick(of(s), rng) };
  }
  const pool = shuffle(clausePool(lex, view), rng);
  for (const s of pool.slice(0, 30)) {
    const one = loneClauses(s);
    if (one.length) return { s, span: pick(one, rng) };
  }
  return null;
}

export function clFind(lex, view, rng) {
  const fc = forcedCell(view);
  if (fc && !fc.startsWith("gerd:finna-")) return null;
  const c = subClause(lex, view, rng, fc ? fc.slice("gerd:finna-".length) : null);
  if (!c) return null;
  const { s, span } = c;
  const targets = [];
  for (let j = span.from; j <= span.to; j++) if (!PUNCT.has(s.tok[j].w)) targets.push(j);
  return built({
    type: "tap", skill: "setningagerd", s, cls: span.kind, targets, whole: true,
    title: `Finndu ${span.kind}una`,
    question: `Smelltu á **öll orðin** í ${span.kind}unni.`,
    base: 14, lvl: s.lvl, cell: "gerd:finna-" + span.kind, word: null, tags: ["clause"],
  });
}

export function clStart(lex, view, rng) {
  if (!cellWanted(view, "gerd:upphaf")) return null;
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
    base: 12, lvl: s.lvl, cell: "gerd:upphaf", word: null, tags: ["clause"], miss: ["setningagerd"],
  });
}

export const TYPES = [
  { id: "clause", skill: "setningagerd", weight: 8, renderer: "clause",
    tags: ["clause"],
    bands: [1, 5, 6, 7],
    build: taskClause },
  { id: "gerd_finna", skill: "setningagerd", weight: 5, renderer: "tap",
    tags: ["clause"],
    bands: [1, 5, 6, 7],
    build: clFind },
  { id: "gerd_upphaf", skill: "setningagerd", weight: 4, renderer: "choice",
    tags: ["clause"],
    bands: [1, 5, 6, 7],
    build: clStart },
];
