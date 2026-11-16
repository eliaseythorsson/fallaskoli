/* The mix rule for a practice session (v6.11).

   A session of one category used to be whatever the weights gave, and some
   categories had a single kind of question: ten beygingartöflur in a row for
   Fornöfn, ten word-class buttons for Óbeygjanleg orð. The rule:

     * at least three kinds of question in a session (where the category has
       three that can be built with what is switched on);
     * no kind over ~40% of the session — 4 of 10, 6 of 15, 8 of 20;
     * a beygingartafla no more than 30% (3 of 10);
     * analysis (greining, the reverse analysis) no more than 35% (3 of 10).

   `mixGate` says which kinds may come next, given what the session has had.
   It never forces a kind that cannot be built: nextTask falls back to every
   available kind if nothing allowed can be made. Pure. */

const MIN_TYPES = 3;
const CAP = 0.4;
const CAPS = { table: 0.3, analysis: 0.35 };
const ANALYSIS = new Set(["parse", "revform"]);

/** The share of a session one kind of question may take. */
export function capOf(id) {
  if (String(id).startsWith("tbl_")) return CAPS.table;
  if (ANALYSIS.has(id)) return CAPS.analysis;
  return CAP;
}

/** How many of `n` questions one kind may take (at least one). */
export const maxOf = (id, n) => Math.max(1, Math.floor(capOf(id) * n + 1e-9));

/**
 * The kinds that may come next, or null when no rule applies (no session).
 * @param mix  { n, counts: { typeId: answered so far } }
 * @param ids  the kinds available in this session
 */
export function mixGate(mix, ids) {
  if (!mix || !mix.n || !ids || !ids.length) return null;
  const counts = mix.counts || {};
  const done = Object.values(counts).reduce((a, b) => a + b, 0);
  const left = mix.n - done;
  if (left <= 0) return null;
  let ok = ids.filter((id) => (counts[id] || 0) + 1 <= maxOf(id, mix.n));
  /* Kinds still needed to reach three: once the questions left are no more
     than that, only a kind not yet used may come. */
  const used = ids.filter((id) => counts[id] > 0).length;
  const need = Math.min(MIN_TYPES, ids.length) - used;
  if (need > 0 && need >= left) {
    const unused = ok.filter((id) => !counts[id]);
    if (unused.length) ok = unused;
  }
  return new Set(ok);
}

/** Does a finished session keep the rule? For the tests and the report. */
export function mixReport(types, available = null) {
  const n = types.length;
  const counts = {};
  types.forEach((t) => { counts[t] = (counts[t] || 0) + 1; });
  const kinds = Object.keys(counts).length;
  const over = Object.entries(counts).filter(([id, c]) => c > maxOf(id, n)).map(([id]) => id);
  const want = Math.min(MIN_TYPES, available ? available.length : MIN_TYPES);
  return { n, counts, kinds, over, ok: kinds >= want && !over.length };
}
