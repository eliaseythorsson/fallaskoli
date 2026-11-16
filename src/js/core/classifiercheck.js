/* Checking the error classifier against real wrong answers (critique item 38).

   core/diagnosis.js sorts a wrong answer into an error pattern. Its tests
   use errors somebody invented. The critique asked for two hundred real
   ones, labelled by a teacher; the owner's condition for all of this work is
   that nobody labels or reviews anything by hand. So the teacher's label is
   replaced by a second opinion that needs no person:

     the classifier   reads the answer the way the pupil is told about it:
                      the NEAREST cell the form belongs to, then spelling,
                      vowel and ending heuristics (`diagnose`)
     the rule         below: the typed form is looked up in EVERY cell of the
                      word's BÍN paradigm, and each cell it stands in says —
                      from the features in which it differs from the cell
                      asked for — which patterns that reading implies

   The two agree when everything the classifier named is something the rule
   allows. Where they do not, one of them is wrong about a real answer, and
   the share of such answers per pattern is what the administrator's page
   shows (`agreement`). It is a measure, not a verdict: nothing is changed
   by it.

   What the measure can and cannot say, honestly:

     - A form that IS another cell: the rule keeps every reading, so the
       classifier's choice among them is nearly always allowed. What real
       answers show here is how often there WAS a choice — `ambiguous`: the
       form stands in cells that imply different patterns (*barn* for
       *barni* is nominative and accusative), and the label the pupil was
       given is one of several a teacher might have given.
     - A form that is no cell: the classifier compares it with the form that
       was asked for and calls it an ending, a vowel or a spelling. The rule
       compares it with every form of the word: if it is one letter from a
       form of ANOTHER cell and further from the one asked for (*hestin*,
       asked for *hestinum*, is *hestinn* misspelt), the rule reads a wrong
       cell where the classifier reads a wrong ending. That is a real
       disagreement, and the one this check exists to count.
     - An answer the classifier names nothing for is counted under "Ógreint":
       how much of what pupils really write it cannot read at all.

   ---- a sample ------------------------------------------------------------

     { t, w, m, typed, right, p, conj? }

       t      the question type (tasks/registry.js id)
       w      the word, as `lemma|class` — a word of the lexicon
       m      the cell asked for — a cell that word has
       typed  what was written: ONE word, letters only, and near enough to
              some form of the word to be an attempt at it
       right  the form that was expected — one of that cell's forms
       p      what the classifier said: pattern ids, possibly none
       conj   for a verb: sterk | veik | núþáleg, when the builder knew

   This is also the format of tests/fixtures/wrong-answers.json, which is
   what the administrator's page downloads: tests/diagnosis.test.js runs the
   check on whatever samples that file holds.

   `cleanSample` is the gate, used by the browser before anything is sent
   and by the server before anything is kept. It is deliberately narrow.
   What a child types is the one thing this program promised never to store,
   and a sample is the exception to that — so only an answer that is plainly
   an attempt at inflecting the word on the card passes: a name, a sentence,
   a swear word or "veit ekki" does not, because it is not one word made of
   letters that resembles a form of the word.

   Pure.                                                                    */

import { readMark } from "./marks.js";
import { normalise, stripAccents, gradeForm } from "./grading.js";
import { diagnose, patternById } from "./diagnosis.js";

export const SAMPLE = Object.freeze({
  /** The longest answer kept: no Icelandic word form in the lexicon is longer. */
  maxLen: 32,
  /** Samples one request may carry. */
  perPost: 6,
  /** Samples one account may add in a day. */
  perDay: 20,
  /** The size of the sample the server keeps. */
  keep: 500,
  /** A sample is dropped this many months after the month it was taken. */
  months: 12,
});

const WORD = /^[a-záðéíóúýþæö]+$/;
const CONJ = new Set(["sterk", "veik", "núþáleg"]);
const isObj = (x) => x && typeof x === "object" && !Array.isArray(x);

/** The lexicon entry a `lemma|class` key names, or null. */
function entryOf(lex, key) {
  if (typeof key !== "string" || key.length > 80) return null;
  const at = key.lastIndexOf("|");
  if (at < 1) return null;
  const w = lex.lookup(key.slice(0, at), key.slice(at + 1));
  return w && w.c === key.slice(at + 1) ? w : null;
}

function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

const commonPrefix = (a, b) => { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i; };

/** Is `typed` an attempt at this word? It shares its first three letters
    (two, for a short form) with some form of the word, or is within two
    letters of one. */
function resembles(typed, w) {
  for (const forms of Object.values(w.forms)) {
    for (const f of forms) {
      const n = normalise(f);
      if (n.includes(" ")) continue;
      if (commonPrefix(typed, n) >= Math.min(3, Math.max(2, n.length - 1))) return true;
      if (editDistance(typed, n, 2) <= 2) return true;
    }
  }
  return false;
}

/**
 * A sample as it may be sent and kept, or null. See the top of the file.
 * @param {object} lex  the lexicon (core/lexicon.js)
 * @param {*} raw
 * @param {?Set<string>} types  the known question types, when the caller has them
 */
export function cleanSample(lex, raw, types = null) {
  if (!isObj(raw)) return null;
  const t = typeof raw.t === "string" && raw.t.length <= 40 && (!types || types.has(raw.t)) ? raw.t : null;
  const w = entryOf(lex, raw.w);
  if (!t || !w || typeof raw.m !== "string") return null;
  const cell = w.forms[raw.m];
  if (!cell || !cell.length) return null;
  const typed = normalise(String(typeof raw.typed === "string" ? raw.typed : ""));
  if (!typed || typed.length > SAMPLE.maxLen || !WORD.test(typed)) return null;
  /* The expected form is one of the cell's own, so it is not text either. */
  const right = cell.find((f) => f === raw.right) || null;
  if (!right) return null;
  /* A right answer is not a wrong answer, and neither is one that only
     lacks an accent the program forgives. */
  if (cell.some((f) => normalise(f) === typed)) return null;
  if (!resembles(typed, w)) return null;
  const p = [...new Set((Array.isArray(raw.p) ? raw.p : [])
    .filter((id) => typeof id === "string" && patternById(id) && !patternById(id).meta))].slice(0, 3);
  const out = { t, w: `${w.o}|${w.c}`, m: raw.m, typed, right, p };
  if (CONJ.has(raw.conj)) out.conj = raw.conj;
  return out;
}

/**
 * The samples a judged answer gives: one per wrongly written cell, each with
 * what the classifier said about THAT cell. Only a question about one word
 * whose answer is a written form (a gap, a verb, a table).
 */
export function samplesOf(task, j, lex) {
  if (!task || !j || j.pending || j.ok !== false || typeof task.typeId !== "string") return [];
  const resp = j.resp;
  if (!resp || resp.kind !== "form" || typeof task.word !== "string") return [];
  /* A pattern the builder added on its own account (`also`) is not something
     the form shows, and the rule could not confirm it. */
  if ((resp.also || []).length) return [];
  const out = [];
  for (const it of resp.items || []) {
    if (!it || !it.g || (it.g.verdict !== "wrong" && it.g.verdict !== "otherform")) continue;
    const s = cleanSample(lex, {
      t: task.typeId, w: task.word, m: it.m, typed: it.typed,
      right: [].concat(it.accepted || [])[0],
      p: diagnose(task, { kind: "form", items: [it] }).map((f) => f.p),
      conj: it.conj,
    });
    if (s) out.push(s);
    if (out.length >= SAMPLE.perPost) break;
  }
  return out;
}

/* ---------- the classifier, run again ---------------------------------------- */

/** What the classifier in THIS version of the program says about a sample. */
export function classify(lex, s) {
  const w = entryOf(lex, s.w);
  if (!w || !w.forms[s.m]) return [];
  const accepted = w.forms[s.m];
  const g = gradeForm(s.typed, { accepted, paradigm: w.forms });
  return diagnose({ typeId: s.t }, { kind: "form",
    items: [{ m: s.m, typed: s.typed, g, accepted, conj: s.conj || null }] }).map((f) => f.p);
}

/* ---------- the rule ----------------------------------------------------------- */

/* The patterns that describe a form which is NOT a cell of the word: how it
   is spelt or built, not which cell was chosen. */
export const SPELLING_PATTERNS = new Set(["broddar", "stafsetning", "y_i", "n_nn", "dh_d",
  "hljodvarp", "ending", "sterk_veik_sogn"]);

const caseOf = (c) => (c === "ÞG" ? "ÞGF" : c);
const FINITE = new Set(["framsöguháttur", "viðtengingarháttur", "boðháttur"]);
const FEATURES = ["fall", "kyn", "persóna", "tala", "greinir", "beyging", "stig", "tíð", "háttur", "mynd"];

/**
 * The patterns one reading implies: the pupil wrote cell `other` where
 * `target` was asked. Written from the description of the patterns
 * (core/diagnosis.js PATTERNS), not from the classifier's code — every
 * feature that differs names its pattern, with no "nearest" and no limit.
 */
function impliedBy(target, other) {
  const a = readMark(target), b = readMark(other);
  const out = new Set();
  if (b.háttur === "nafnháttur" && FINITE.has(a.háttur)) out.add("sogn_obeygd");
  for (const f of FEATURES) {
    if ((a[f] ?? null) === (b[f] ?? null)) continue;
    if (f === "fall") {
      const r = caseOf(a.fall), g = caseOf(b.fall);
      if (!r || !g) continue;
      if ((r === "ÞF" && g === "ÞGF") || (r === "ÞGF" && g === "ÞF")) out.add("thf_thgf");
      else if (r === "EF") out.add("ef");
      else if (g === "NF") out.add("nf_aukafall");
      else out.add("fall_annad");
    } else if (f === "kyn") { if (a.fall) out.add("kyn_samraemi"); }
    else if (f === "persóna") out.add("sogn_frumlag");
    else if (f === "tala") out.add(a.persóna ? "sogn_frumlag" : "tala");
    else if (f === "greinir") out.add("greinir");
    else if (f === "beyging") { if (a.fall) out.add("beyging_lo"); }
    else if (f === "stig") out.add("stig");
    else if (f === "tíð") out.add("tid");
    else if (f === "háttur") out.add("hattur");
    else if (f === "mynd") out.add("mynd");
  }
  return out;
}

/**
 * The rule's reading of a sample.
 *
 * @returns {{kind: "cell"|"accent"|"nearcell"|"nonform", cells: string[], implied: Set<string>}}
 *   cell      the form is another cell (or cells) of the word
 *   accent    it is the right form, or another cell, but for its accents
 *   nearcell  it is no form, but one letter from a form of another cell and
 *             further than that from the form asked for
 *   nonform   it is no form of the word, nor nearly one of another cell
 */
export function ruleReading(lex, s) {
  const w = entryOf(lex, s.w);
  if (!w) return { kind: "nonform", cells: [], implied: new Set() };
  const typed = normalise(s.typed);
  const find = (same) => Object.entries(w.forms)
    .filter(([m, forms]) => m !== s.m && forms.some((f) => same(normalise(f))))
    .map(([m]) => m);
  let cells = find((f) => f === typed);
  let kind = "cell";
  const implied = new Set();
  if (!cells.length) {
    const bare = stripAccents(typed);
    const here = (w.forms[s.m] || []).some((f) => stripAccents(normalise(f)) === bare);
    cells = here ? [] : find((f) => stripAccents(f) === bare);
    if (!here && !cells.length) {
      /* One letter from another cell, and not as near the cell asked for. */
      const toTarget = Math.min(...(w.forms[s.m] || []).map((f) => editDistance(typed, normalise(f), 2)));
      const near = toTarget > 1 ? find((f) => !f.includes(" ") && editDistance(typed, f, 1) <= 1) : [];
      if (!near.length) return { kind: "nonform", cells: [], implied };
      for (const m of near) impliedBy(s.m, m).forEach((p) => implied.add(p));
      return { kind: implied.size ? "nearcell" : "nonform", cells: implied.size ? near : [], implied };
    }
    kind = "accent";
    implied.add("broddar");
  }
  for (const m of cells) impliedBy(s.m, m).forEach((p) => implied.add(p));
  return { kind, cells, implied };
}

/**
 * Do the classifier's patterns and the rule agree about this sample?
 *
 *   another cell   every pattern named must be one some reading implies, and
 *                  one must be named if any reading implies one
 *   accents only   as for a cell (the rule implies "broddar" too)
 *   nearly a cell  one of the patterns that cell implies must be named —
 *                  beside a spelling pattern, or alone
 *   no form        only spelling patterns may be named; naming none is the
 *                  classifier saying "Ógreint", which the rule cannot better
 */
export function agrees(reading, patterns) {
  const P = patterns || [];
  if (reading.kind === "nonform") return P.every((p) => SPELLING_PATTERNS.has(p));
  if (reading.kind === "nearcell")
    return P.some((p) => reading.implied.has(p)) && P.every((p) => reading.implied.has(p) || SPELLING_PATTERNS.has(p));
  if (!P.length) return reading.implied.size === 0;
  return P.every((p) => reading.implied.has(p));
}

/** The id under which a sample with no pattern is counted (as in diagnosis.js). */
export const UNREAD = "ogreint";

/**
 * The check: how often classifier and rule disagree, by pattern.
 *
 * @param {object} lex
 * @param {object[]} samples  clean samples
 * @param {{rerun?: boolean}} [o]  `rerun`: ask the classifier again instead of
 *        reading what it said when the answer was given (`s.p`) — what a test
 *        of THIS version wants; the server reports what pupils were told
 * @returns {{n:number, disagree:number, rate:number, ambiguous:number,
 *            byPattern: Array<{p:string, name:string, n:number, disagree:number,
 *                              ambiguous:number, rate:number}>,
 *            byKind: object}}
 *   `ambiguous`: samples the rule and the classifier agree on, but whose form
 *   also allows a pattern the classifier did not name — the label was a
 *   choice. See the top of the file.
 */
export function agreement(lex, samples, { rerun = false } = {}) {
  const by = new Map();
  const byKind = { cell: 0, accent: 0, nearcell: 0, nonform: 0 };
  let n = 0, disagree = 0, ambiguous = 0;
  for (const s of samples || []) {
    const reading = ruleReading(lex, s);
    const P = rerun ? classify(lex, s) : (s.p || []);
    const ok = agrees(reading, P);
    /* Agreed, and yet the form allows a pattern that was not named. */
    const open = ok && reading.kind !== "nonform" && [...reading.implied].some((p) => !P.includes(p));
    n++; byKind[reading.kind]++;
    if (!ok) disagree++;
    if (open) ambiguous++;
    for (const p of P.length ? P : [UNREAD]) {
      const row = by.get(p) || { p, n: 0, disagree: 0, ambiguous: 0 };
      row.n++; if (!ok) row.disagree++; if (open) row.ambiguous++;
      by.set(p, row);
    }
  }
  const rate = (d, k) => (k ? Math.round((d / k) * 1000) / 1000 : 0);
  const byPattern = [...by.values()]
    .map((r) => ({ ...r, name: (patternById(r.p) || {}).nm || "Ógreint", rate: rate(r.disagree, r.n) }))
    .sort((a, b) => b.disagree - a.disagree || b.n - a.n || (a.p < b.p ? -1 : 1));
  return { n, disagree, rate: rate(disagree, n), ambiguous, byPattern, byKind };
}
