// @ts-check
/* The structure of a sentence, read out of its parse — for showing, not asking.

   Item 25 (docs/DLD-PLAN.md §3): a sentence is shown with its parts marked —
   the setningarhlutar, the forsetningarliðir, the samtengingar and a box round
   each aukasetning — so that a pupil SEES how it is built. The principle is
   explicit, visual teaching of structure (docs/DLD-RESEARCH.md §C); the scheme
   is the program's own.

   This module says WHAT is marked and draws nothing: `sentenceStructure(s)`
   is pure, has no DOM and reads only what the build wrote into the sentence.
   ui/structure.js turns its result into HTML; any renderer may use both.

   The rule is the build's own — a wrong mark is worse than no mark — so a
   word is marked only where the data already vouches for it:

     frumlag, andlag,     a token whose role (`r`) passed the guard. Where the
     óbeint andlag,       build recorded the whole nafnliður (`ph`, kind nl)
     sagnfylling          the mark covers it (*Bíllinn hennar*); otherwise it
                          covers the words that carry the role and stand side
                          by side (*litla barnið*).
     umsögn               the finite verb, and the supine that completes it
                          (*hef lesið*): `r`. An infinitive or a participle
                          (`ra`: *ætla að **lesa***, *var **lesin***) is where
                          schoolbooks differ, and is not marked.
     forsetningarliður    a phrase the build recorded (`ph`, kind fl): one
                          preposition and the fallorð it governs.
     samtenging           a word whose class stands as samtenging, or the
                          words of a conjunction of several words (*af því
                          að*, *áður en*) at the head of a clause the build
                          recorded. A lone *að*, *en*, *og*, *til* or *þótt*
                          that may be the tail of such a conjunction in a
                          clause the build did NOT record is left alone.
     aukasetning          a clause the build recorded with its kind (`cl`):
                          the parse and the closed table of pipeline/phrases.py
                          agree on what it is and where it ends.

   Everything else — a word whose analysis was withdrawn (`rj`), a nominal
   whose role is not judged (`rn`), an adverb, an infinitive clause, a
   subordinate clause the build would not put a kind to — is not marked. An
   unmarked word is therefore "not shown", never "has no role".

   What a mark claims: these words belong to that part. For a recorded phrase
   or clause (`whole`) it also claims that the part ends there; for the others
   it does not (*[Maðurinn] í húsinu* — the frumlag goes on). */

/** @typedef {{ w: string, l?: string, c?: string|null, r?: string|null, k?: string|null,
 *              x?: string, ra?: string[], rn?: number, rj?: any }} Tok */
/** @typedef {{ tok: Tok[], ph?: {a:number,b:number,t:string,i?:number}[],
 *              cl?: {a:number,b:number,t:string,n?:number}[], ku?: boolean }} Sentence */
/** @typedef {{ a: number, b: number, role: string, whole: boolean }} Part */
/** @typedef {{ a: number, b: number, kind: string }} Clause */
/** @typedef {{ parts: Part[], clauses: Clause[], roleAt: (string|null)[] }} Structure */

/** The marks, in the order a legend lists them. The names are the terms the
    program uses everywhere else (Lesefni „Setningarhlutar“ and „Setningarliðir“). */
export const STRUCTURE_ROLES = ["frumlag", "umsögn", "andlag", "óbeint andlag", "sagnfylling",
  "forsetningarliður", "samtenging"];

const NOMINAL_ROLES = new Set(["frumlag", "andlag", "óbeint andlag", "sagnfylling"]);
const PUNCT = new Set([".", "!", "?", ",", ":", ";", "„", "“", "”", "\"", "–", "—", "(", ")"]);

/* Conjunctions of several words, as the parser splits them. This is the table
   of pipeline/phrases.py (OPENERS, BEFORE_AD, *svo að*, *til þess að*) and it
   is only ever matched at the first word of a clause that module recorded. */
const LONG_CONJUNCTIONS = [
  ["af", "því", "að"], ["vegna", "þess", "að"], ["til", "þess", "að"], ["um", "leið", "og"],
  ["um leið", "og"], ["svo", "að"], ["þó", "að"], ["enda", "þótt"], ["áður", "en"],
  ["eftir", "að"], ["þangað", "til"], ["fyrr", "en"], ["á meðan"], ["meðan"],
];

/* Outside a recorded clause: a word that, standing before one of these, may
   make a conjunction of several words with it (*því að*, *svo að*, *áður en*,
   *eins og*, *þar til* …). The lone word is then not marked. */
const MAY_BE_TAIL = {
  "að": new Set(["því", "þess", "það", "svo", "þó", "til", "eftir", "án", "með", "enda", "nema",
    "þannig", "um", "fyrir", "frá", "við", "á", "í", "auk", "úr", "eins", "líkt", "nú", "strax"]),
  "en": new Set(["áður", "fyrr", "heldur", "fremur", "frekar", "annað", "öðruvísi"]),
  "og": new Set(["leið", "um leið", "eins", "svo", "jafnt", "strax", "óðara", "jafnskjótt"]),
  "til": new Set(["þangað", "þar"]),
  "þótt": new Set(["enda", "jafnvel"]),
  "sem": new Set(["þar", "eins", "svo", "um leið", "leið", "jafnt", "hvar", "hvert", "hver",
    "hvað", "hvenær", "hvernig", "líkt"]),
};

const low = (/** @type {Tok} */ t) => String((t && t.w) || "").toLowerCase();
const isWord = (/** @type {Tok} */ t) => !!t && !PUNCT.has(t.w);

/**
 * What of a sentence may be marked: its parts and its boxed clauses.
 *
 * `parts` never overlap and never cross the edge of a clause in `clauses`;
 * `clauses` are either apart or one inside the other; `roleAt[j]` is the role
 * token `j` is marked with, or null.
 *
 * @param {Sentence} s a sentence of the bank (`lex.sentences`)
 * @returns {Structure}
 */
export function sentenceStructure(s) {
  const tok = (s && s.tok) || [];
  const n = tok.length;
  /** @type {(string|null)[]} */
  const roleAt = new Array(n).fill(null);
  /** @type {Part[]} */
  const parts = [];

  /* ---- clauses: those the build recorded, and only if they nest cleanly --- */
  const recorded = s.ku ? [] : (s.cl || []).filter((c) => c && c.a >= 0 && c.b < n && c.a <= c.b && c.t);
  const crosses = (x, y) => (x.a < y.a && y.a <= x.b && x.b < y.b) || (y.a < x.a && x.a <= y.b && y.b < x.b);
  const same = (x, y) => x.a === y.a && x.b === y.b;
  /** @type {Clause[]} */
  const clauses = recorded
    .filter((c, i) => !recorded.some((d, k) => k !== i && (crosses(c, d) || (same(c, d) && k < i))))
    .map((c) => ({ a: c.a, b: c.b, kind: c.t }))
    .sort((x, y) => x.a - y.a || y.b - x.b);

  /* A part must lie wholly inside or wholly outside every boxed clause. */
  const fits = (a, b) => clauses.every((c) => b < c.a || a > c.b || (a >= c.a && b <= c.b));
  const free = (a, b) => { for (let j = a; j <= b; j++) if (roleAt[j]) return false; return true; };
  const add = (a, b, role, whole) => {
    if (a < 0 || b >= n || a > b || !free(a, b) || !fits(a, b)) return false;
    for (let j = a; j <= b; j++) if (!isWord(tok[j])) return false;
    for (let j = a; j <= b; j++) roleAt[j] = role;
    parts.push({ a, b, role, whole });
    return true;
  };

  /* ---- 1. the conjunction at the head of a recorded clause --------------- */
  for (const c of clauses) {
    const long = LONG_CONJUNCTIONS.find((words) => words.every((w, k) => c.a + k <= c.b && low(tok[c.a + k]) === w));
    if (long) add(c.a, c.a + long.length - 1, "samtenging", true);
    else if (tok[c.a].c === "samtenging" && !tok[c.a].rj) add(c.a, c.a, "samtenging", true);
    /* a question word (*hvar*, *hvernig*, *af hverju*) opens a spurnarsetning
       and is no samtenging: not marked */
  }

  /* ---- 2. the setningarhlutar -------------------------------------------- */
  const roleOf = (j) => (tok[j] && !tok[j].rj && tok[j].r) || null;
  /* a whole nafnliður the build recorded, when all its role words agree */
  for (const p of s.ph || []) {
    if (p.t !== "nl" || p.i) continue;
    const roles = new Set();
    for (let j = p.a; j <= p.b; j++) if (roleOf(j)) roles.add(roleOf(j));
    if (roles.size !== 1) continue;
    const role = [...roles][0];
    if (NOMINAL_ROLES.has(role)) add(p.a, p.b, role, true);
  }
  /* the words that carry a role, side by side in one clause */
  for (let j = 0; j < n; j++) {
    const role = roleOf(j);
    if (!role || roleAt[j] || !(NOMINAL_ROLES.has(role) || role === "umsögn")) continue;
    let b = j;
    while (b + 1 < n && !roleAt[b + 1] && roleOf(b + 1) === role && tok[b + 1].k === tok[j].k && fits(j, b + 1)) b++;
    add(j, b, role, false);
    j = b;
  }

  /* ---- 3. the forsetningarliðir the build recorded ----------------------- */
  for (const p of s.ph || []) if (p.t === "fl") add(p.a, p.b, "forsetningarliður", true);

  /* ---- 4. a samtenging standing on its own ------------------------------- */
  for (let j = 0; j < n; j++) {
    const t = tok[j];
    if (roleAt[j] || t.c !== "samtenging" || t.rj) continue;
    const tails = MAY_BE_TAIL[low(t)];
    if (tails && j > 0 && tails.has(low(tok[j - 1]))) continue;
    add(j, j, "samtenging", false);
  }

  /* ---- 5. a sagnfylling in the subject's place ---------------------------
     The parse now and then calls the SUBJECT of a clause its predicative
     (*að **prófið** væri á föstudaginn*). A sagnfylling normally follows its
     verb; one that stands right BEFORE the finite verb is kept only if the
     frumlag then follows in the same clause (*Kennari er **hún***). */
  const stops = (j, from) => !isWord(tok[j]) || tok[j].k !== tok[from].k || tok[j].c === "samtenging"
    || tok[j].x === "st" || tok[j].x === "stt" || !fits(Math.min(j, from), Math.max(j, from));
  const inSubjectPlace = (p) => {
    if (p.b + 1 >= n || stops(p.b + 1, p.b) || roleAt[p.b + 1] !== "umsögn") return false;
    for (let j = p.b + 1; j < n && !stops(j, p.b); j++) if (roleAt[j] === "frumlag") return false;
    return true;
  };
  const kept = parts.filter((p) => {
    if (p.role !== "sagnfylling" || !inSubjectPlace(p)) return true;
    for (let j = p.a; j <= p.b; j++) roleAt[j] = null;
    return false;
  });

  kept.sort((x, y) => x.a - y.a);
  return { parts: kept, clauses, roleAt };
}

/**
 * The same structure with some marks taken out — a hint must not mark the
 * very thing the question asks for (`hide: ["frumlag"]`), and a question
 * about the kind of a clause must not be shown the boxes (`clauses: false`).
 *
 * @param {Structure} st
 * @param {{ hide?: string[], clauses?: boolean }} [opts]
 * @returns {Structure}
 */
export function withoutMarks(st, opts = {}) {
  const hide = new Set(opts.hide || []);
  const parts = st.parts.filter((p) => !hide.has(p.role));
  return {
    parts,
    clauses: opts.clauses === false ? [] : st.clauses,
    roleAt: st.roleAt.map((r) => (r && hide.has(r) ? null : r)),
  };
}

/** Is there anything to show? */
export const hasMarks = (/** @type {Structure} */ st) => st.parts.length + st.clauses.length > 0;
