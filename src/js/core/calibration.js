/* Calibration from real answers (critique item 17) — the arithmetic.

   Levels, band lists and hardness scores are set by hand or measured on the
   paradigm (pipeline/irregularity.py). Once pupils use the program, the share of
   right answers says how hard something REALLY is. The owner's condition:
   nobody is going to look at numbers each term, so everything from the
   counting to the adjustment runs by itself, and is built so that it cannot
   run away.

   This file is pure and is shared by both ends:

     the browser   `eventOf`     what one judged answer contributes: a type,
                                 a level, cells, irregularity scores, right
                                 or wrong. Nothing typed, no word, no name.
                   `cleanTable`, `typeShift`, `lexHardness`
                                 reading the published table and applying it
     the server    `cleanEvents` what it accepts
                   `estimate`    counts → table, with the reasons
                   (server/calibrate.mjs holds the storage, the caps per
                   account and the schedule)

   ---- what is counted ---------------------------------------------------------

     types   "fill|3"        → [right, total]   one per QUESTION, keyed by the
                                                 type and the level (þyngd,
                                                 1–7) the pupil's skill stood
                                                 at when it was asked
     cells   "fill|3|EFFT|4" → [right, total]   one per RECORD (a table is one
                                                 question and many records):
                                                 type, level, the cell's BÍN
                                                 mark, the word's irregularity
                                                 score (1–5, 0 = none)

   Only fresh questions are counted — not a review, a rescue drill, "Þrjár í
   röð", a duel, a second try, an answer given after a hint, or the first
   card of a type, which opens with a worked example: those are asked BECAUSE
   the pupil got something wrong, or answered with help, and say little about
   how hard the question is.

   ---- what is adjusted, and how -----------------------------------------------

   Three things, each with the hand-set value as the prior:

   1. A type's place on the level scale (`table.types[id][band]`, in levels,
      −1…+1). The staircase (core/difficulty.js) holds every skill near 80 %
      right, so a type that pupils at band b get right clearly less often
      than the TYPICAL other type asked at band b is harder than its label.
      Typical is the median, one vote per type: the mean would let one very
      hard type (or one that somebody flooded) make all the others look easy
      and move them too; against the median it moves only itself. It
      is then built as if the level were a quarter lower (`typeShift`), and
      the measurement starts afresh for that type and band. This is a loop:
      the shift changes what is built, so each run adds a step to the last
      (and takes it back when the evidence turns).

   2. A cell's hardness (`table.cells[mark]`, on the build's 1–5 scale). A
      cell is compared with the other records of the same type and level
      (so a cell that is mostly asked in a hard type is not blamed for the
      type), and then with the cells the build gave the SAME score: the
      hand-set score says "as hard as these", and the median of them is the
      reference. How far the cell is from it, in share right, is turned into
      points of hardness with the slope the data itself shows between the
      scores 1–5.

   3. What an irregularity score is worth (`table.irr[k]`): the same, for the
      five buckets of `irr`, each compared with the straight line through all
      five (a Theil–Sen line — the median of the slopes between pairs — so
      that the one bucket that is off does not tilt the line it is measured
      against).

   Shrinkage: every estimate is a beta-binomial posterior mean — the observed
   share is pulled towards the prior with the weight of KAPPA answers, so
   forty answers move little and four hundred move most of the way. On top of
   that nothing moves unless the difference is larger than DEADBAND and than
   Z standard deviations of the posterior, unless at least MIN_N answers
   stand behind it, and unless at least MIN_PUPILS different accounts
   contributed to it on one day (which also keeps a published number from
   being one child's results).

   Clamping: a run moves a value by at most a quarter (STEP), and no value
   ever leaves ±1 of what the program was built with (MAX). A run happens at
   most once per PERIOD_DAYS. So the worst a wrong table can do is serve one
   type one level easier or harder, or treat a cell as one point harder or
   easier, and it takes four weeks to get there.

   Pure: no clock (the caller passes `now`), no storage, no DOM.             */

export const CAL = Object.freeze({
  v: 1,
  /** A run at most this often. */
  periodDays: 7,

  /* ---- what one account may contribute (server/calibrate.mjs) ---- */
  perPost: 40,          // questions in one request
  postsPerDay: 150,     // requests per account per day
  perDay: 400,          // questions per account per day
  recsPerQuestion: 30,  // records in one question (a full verb table)
  recsPerDay: 2500,     // records per account per day
  /* …and towards ONE type-and-level, one cell, one irregularity bucket: the
     cap that stops one account deciding a number by itself. */
  unitType: 12, unitCell: 8, unitIrr: 150,
  /** Keys kept in the cell table; a new key beyond this is not counted. */
  maxKeys: 8000,

  /* ---- the estimate ---- */
  /** Different accounts that must have contributed to a number on one day,
      and learners that must have been active on the server in the last two
      periods, before anything is adjusted. */
  minPupils: 3,
  /** The prior's weight in answers, and the least answers behind a change. */
  kappaType: 40, minTypeN: 40,
  kappaHard: 60, minHardN: 60,
  /** What a reference needs: at least this many OTHER types at the band (or
      cells of the same score), each with at least this many answers, and
      this many answers between them. */
  minPeers: 3, minPeerN: 30, minRest: 100,
  /** The least other records in a type-and-level before a cell is compared
      with them, and in an irregularity bucket before it helps place the line. */
  minStratumRest: 10, minClassN: 200,
  /** No change for a difference in share right smaller than this… */
  deadband: 0.03,
  /** …or smaller than this many posterior standard deviations. */
  z: 1.645,
  /** The most a run changes a value, and the furthest from the built-in. */
  step: 0.25, max: 1,
  /** Share right per point of hardness: the slope the data shows between
      the scores, held to this range, and this when it cannot be measured. */
  slopeDefault: -0.05, slopeSteep: -0.15, slopeFlat: -0.02,
  /** After each run every count is multiplied by this: last term's answers
      fade (half is gone after about four runs) and the file stays small. */
  decay: 0.85,
});

export const LEVEL_MIN = 1, LEVEL_MAX = 7, IRR_MAX = 5;

const isObj = (x) => x && typeof x === "object" && !Array.isArray(x);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round2 = (x) => Math.round(x * 100) / 100;
const sign = (x) => (x > 0 ? 1 : x < 0 ? -1 : 0);

/* ======================================================================
 * 1. One answer → one event (the browser)
 * ==================================================================== */

/** The build's own irregularity score of a word, 1–5, or 0. A calibrated
    lexicon keeps it beside the adjusted one (core/lexicon.js `irrBuilt`). */
function irrOf(lex, wordKey) {
  if (typeof wordKey !== "string" || !lex || !lex.lookup) return 0;
  const at = wordKey.lastIndexOf("|");
  if (at < 1) return 0;
  const w = lex.lookup(wordKey.slice(0, at), wordKey.slice(at + 1));
  const v = w ? (w.irrBuilt ?? w.irr) : null;
  return Number.isInteger(v) && v >= 1 && v <= IRR_MAX ? v : 0;
}

/**
 * What a judged answer contributes to the count, or null when it is not to
 * be counted. `task.calBand` is put on a task by tasks/next.js when — and
 * only when — it was built as a fresh question of ordinary practice.
 *
 * @param {object} task  the task as built (`typeId`, `calBand`)
 * @param {object} j     the judgement (core/answer.js `judge`)
 * @param {object} lex   the lexicon, to read a word's score and know a cell
 * @returns {?{t:string, l:number, ok:boolean, recs:Array<[string, number, 0|1]>}}
 */
export function eventOf(task, j, lex) {
  if (!task || typeof task.typeId !== "string" || !Number.isInteger(task.calBand)) return null;
  if (!j || j.pending || typeof j.ok !== "boolean") return null;
  const records = (j.effects || []).filter((e) => e.do === "record" && typeof e.ok === "boolean");
  /* An answer given after "Sýna vísbendingu" is not evidence of anything. */
  if (records.some((e) => e.hinted)) return null;
  const recs = [];
  for (const e of records) {
    const c = typeof e.cell === "string" && lex && lex.cellHardness && lex.cellHardness(e.cell) != null
      ? e.cell : "";
    const i = irrOf(lex, e.word);
    if (!c && !i) continue;
    recs.push([c, i, e.ok ? 1 : 0]);
    if (recs.length >= CAL.recsPerQuestion) break;
  }
  return { t: task.typeId, l: clamp(task.calBand, LEVEL_MIN, LEVEL_MAX), ok: j.ok, recs };
}

/* ======================================================================
 * 2. What the server accepts
 * ==================================================================== */

/**
 * Events as they may be counted: a known type, a level 1–7, true or false,
 * and records whose cell is a known BÍN mark (or none) and whose score is
 * 0–5. Everything else is dropped — there is no field here a child's text
 * could travel in.
 *
 * @param {*} raw
 * @param {{types: Set<string>, marks: Set<string>}} known
 */
export function cleanEvents(raw, { types, marks }) {
  const out = [];
  for (const e of Array.isArray(raw) ? raw.slice(0, CAL.perPost) : []) {
    if (!isObj(e) || typeof e.t !== "string" || !types.has(e.t)) continue;
    if (!Number.isInteger(e.l) || e.l < LEVEL_MIN || e.l > LEVEL_MAX) continue;
    if (typeof e.ok !== "boolean") continue;
    const recs = [];
    for (const r of Array.isArray(e.recs) ? e.recs.slice(0, CAL.recsPerQuestion) : []) {
      if (!Array.isArray(r) || r.length !== 3) continue;
      const c = typeof r[0] === "string" && marks.has(r[0]) ? r[0] : "";
      const i = Number.isInteger(r[1]) && r[1] >= 1 && r[1] <= IRR_MAX ? r[1] : 0;
      if ((!c && !i) || (r[2] !== 0 && r[2] !== 1)) continue;
      recs.push([c, i, r[2]]);
    }
    out.push({ t: e.t, l: e.l, ok: e.ok, recs });
  }
  return out;
}

/* ======================================================================
 * 3. Counts → table (the server, once a period)
 * ==================================================================== */

const pair = (x) => (Array.isArray(x) && x.length >= 2 && x[1] > 0 ? [Number(x[0]) || 0, Number(x[1])] : null);

/** The posterior standard deviation of a share, with the prior's weight. */
const sdOf = (p, n, kappa) => {
  const q = clamp(p, 0.05, 0.95);
  return Math.sqrt((q * (1 - q)) / (n + kappa + 1));
};

/** Move `from` towards `to` by at most one step. */
const stepTo = (from, to) => round2(from + clamp(to - from, -CAL.step, CAL.step));

/* ---- 3a. the types ---- */

function estimateTypes(types, distinct, prev, typeIds) {
  const rows = [];
  const band = {};                         // level → the types asked at it
  for (const [key, v] of Object.entries(types || {})) {
    const p = pair(v);
    const [t, ls] = key.split("|");
    const l = Number(ls);
    if (!p || !typeIds.has(t) || !Number.isInteger(l)) continue;
    const row = { key, t, l, r: p[0], n: p[1] };
    rows.push(row);
    (band[l] ||= []).push(row);
  }
  const out = {}, changes = [], reset = [];
  /* What stood before stays unless the evidence moves it. */
  for (const [t, bands] of Object.entries((prev && prev.types) || {})) {
    if (!typeIds.has(t) || !isObj(bands)) continue;
    for (const [l, s] of Object.entries(bands))
      if (typeof s === "number" && s) (out[t] ||= {})[l] = clamp(round2(s), -CAL.max, CAL.max);
  }
  for (const x of rows) {
    if (x.n < CAL.minTypeN) continue;
    if ((distinct["T:" + x.key] || 0) < CAL.minPupils) continue;
    /* The typical other type at this band. */
    const peers = band[x.l].filter((y) => y.t !== x.t && y.n >= CAL.minPeerN);
    if (peers.length < CAL.minPeers || peers.reduce((n, y) => n + y.n, 0) < CAL.minRest) continue;
    /* One type, one vote: weighted by answers, a single type with very many
       of them would BE the median. */
    const base = median(peers.map((y) => ({ v: y.r / y.n, w: 1 })));
    const post = (x.r + CAL.kappaType * base) / (x.n + CAL.kappaType);
    const diff = post - base;
    if (Math.abs(diff) < Math.max(CAL.deadband, CAL.z * sdOf(post, x.n, CAL.kappaType))) continue;
    const was = (out[x.t] && out[x.t][x.l]) || 0;
    /* Fewer right than the rest → harder than its label → built a step
       lower; more right → a step higher. */
    const now = clamp(round2(was + sign(diff) * CAL.step), -CAL.max, CAL.max);
    if (now === was) continue;
    if (now) (out[x.t] ||= {})[x.l] = now;
    else { delete out[x.t][x.l]; if (!Object.keys(out[x.t]).length) delete out[x.t]; }
    changes.push({ k: "type", id: x.t, band: x.l, from: was, to: now,
      n: Math.round(x.n), p: round2(x.r / x.n), base: round2(base) });
    reset.push(x.key);
  }
  return { out, changes, reset };
}

/* ---- 3b. cells and irregularity: a group against its strata ---- */

/**
 * For every group (a cell, or an irregularity bucket): the records, the
 * right ones, and how many WOULD have been right had the group done as well
 * as everything else asked in the same type at the same level.
 */
function againstStrata(rows, groupOf) {
  const strata = {};                        // "t|l" → [R, N]
  const parts = {};                         // group → { "t|l": [r, n] }
  for (const x of rows) {
    const s = (strata[x.s] ||= [0, 0]);
    s[0] += x.r; s[1] += x.n;
    const g = groupOf(x);
    if (g == null) continue;
    const p = ((parts[g] ||= {})[x.s] ||= [0, 0]);
    p[0] += x.r; p[1] += x.n;
  }
  const out = {};
  for (const [g, by] of Object.entries(parts)) {
    let obs = 0, exp = 0, n = 0;
    for (const [s, [r, m]] of Object.entries(by)) {
      const rest = strata[s][1] - m;
      if (rest < CAL.minStratumRest) continue;          // nothing to compare with
      obs += r; n += m;
      exp += m * ((strata[s][0] - r) / rest);
    }
    if (n > 0) out[g] = { obs, exp, n, excess: (obs - exp) / n, p: obs / n };
  }
  return out;
}

/** The (weighted) median of [{ v, w }]: the value at which half the weight
    lies on either side. One outlier, however far out, does not move it.
    The callers give every type and every cell the weight 1. */
function median(items) {
  const xs = items.filter((q) => q.w > 0).sort((p, q) => p.v - q.v);
  const W = xs.reduce((n, q) => n + q.w, 0);
  if (!W) return null;
  let acc = 0;
  for (let k = 0; k < xs.length; k++) {
    acc += xs[k].w;
    if (acc > W / 2) return xs[k].v;
    if (acc === W / 2) return (xs[k].v + xs[Math.min(k + 1, xs.length - 1)].v) / 2;
  }
  return xs[xs.length - 1].v;
}

/** A Theil–Sen line through [{ x, y }]: the median of the slopes between
    every pair, and of what is left over. { a, b }, or null with fewer than
    two different x. */
function line(points) {
  const slopes = [];
  for (let i = 0; i < points.length; i++)
    for (let j = i + 1; j < points.length; j++)
      if (points[j].x !== points[i].x)
        slopes.push({ v: (points[j].y - points[i].y) / (points[j].x - points[i].x), w: 1 });
  if (!slopes.length) return null;
  const b = median(slopes);
  return { a: median(points.map((q) => ({ v: q.y - b * q.x, w: 1 }))), b };
}

/** One group's target on the 1–5 scale: its built-in score moved by how far
    its (shrunk) share right is from the reference, in points of hardness. */
function hardTarget(g, ref, slope, builtIn, seen) {
  if (!g || g.n < CAL.minHardN || seen < CAL.minPupils || ref == null) return { to: builtIn, dev: 0 };
  const dev = (g.n / (g.n + CAL.kappaHard)) * (g.excess - ref);
  if (Math.abs(dev) < Math.max(CAL.deadband, CAL.z * sdOf(g.p, g.n, CAL.kappaHard))) return { to: builtIn, dev: 0 };
  /* The slope is negative (harder → fewer right), so fewer right than the
     reference gives a positive number of points: harder. */
  return { to: clamp(builtIn + clamp(dev / slope, -CAL.max, CAL.max), 1, IRR_MAX), dev };
}

function estimateHardness(cells, distinct, prev, cellHard, typeIds) {
  const rows = [];
  for (const [key, v] of Object.entries(cells || {})) {
    const p = pair(v);
    const [t, l, c, i] = key.split("|");
    if (!p || !typeIds.has(t)) continue;
    rows.push({ s: t + "|" + l, c: c || "", i: Number(i) || 0, r: p[0], n: p[1] });
  }
  const changes = [];

  /* ---- cells: each against the cells the build scored the same ---- */
  const byCell = againstStrata(rows, (x) => (x.c && cellHard(x.c) != null ? x.c : null));
  const klass = {};                         // built-in score → its cells' excess
  for (const [c, g] of Object.entries(byCell))
    if (g.n >= CAL.minPeerN) (klass[Math.round(cellHard(c))] ||= []).push({ v: g.excess, w: 1, n: g.n });
  /* The typical cell of each score — the reference its cells are held to. */
  const refs = Object.entries(klass)
    .filter(([, k]) => k.length >= CAL.minPeers && k.reduce((n, q) => n + q.n, 0) >= CAL.minClassN)
    .map(([h, k]) => ({ x: Number(h), y: median(k) }));
  const fit = line(refs);
  const slope = fit ? clamp(fit.b, CAL.slopeSteep, CAL.slopeFlat) : CAL.slopeDefault;
  const refOf = Object.fromEntries(refs.map((q) => [q.x, q.y]));

  const cellsOut = {};
  const cellIds = new Set([...Object.keys(byCell), ...Object.keys((prev && prev.cells) || {})]);
  for (const c of cellIds) {
    const h = cellHard(c);
    if (h == null) continue;
    const prior = (prev && prev.cells && typeof prev.cells[c] === "number")
      ? clamp(prev.cells[c], Math.max(1, h - CAL.max), Math.min(IRR_MAX, h + CAL.max)) : h;
    const g = byCell[c];
    const { to, dev } = hardTarget(g, refOf[Math.round(h)], slope, h, distinct["C:" + c] || 0);
    const now = stepTo(prior, to);
    if (Math.abs(now - h) >= 0.01) cellsOut[c] = now;
    if (now !== round2(prior))
      changes.push({ k: "cell", id: c, from: round2(prior), to: now, builtIn: h,
        n: g ? Math.round(g.n) : 0, p: g ? round2(g.p) : null, dev: round2(dev) });
  }

  /* ---- irregularity: each bucket against the line through all five ---- */
  const byIrr = againstStrata(rows, (x) => (x.i >= 1 && x.i <= IRR_MAX ? x.i : null));
  const pts = Object.entries(byIrr).filter(([, g]) => g.n >= CAL.minClassN)
    .map(([k, g]) => ({ x: Number(k), y: g.excess }));
  const irrFit = pts.length >= 3 ? line(pts) : null;
  /* If irregular words are not answered worse than regular ones at all, the
     buckets cannot be placed on the scale: they go back to the built-in. */
  const usable = irrFit && irrFit.b <= CAL.slopeFlat;
  const irrSlope = usable ? clamp(irrFit.b, CAL.slopeSteep, CAL.slopeFlat) : CAL.slopeDefault;
  const irrOut = {};
  let floor = 1;
  for (let k = 1; k <= IRR_MAX; k++) {
    const prior = (prev && prev.irr && typeof prev.irr[k] === "number")
      ? clamp(prev.irr[k], Math.max(1, k - CAL.max), Math.min(IRR_MAX, k + CAL.max)) : k;
    const g = byIrr[k];
    const ref = usable ? irrFit.a + irrFit.b * k : null;
    const { to, dev } = hardTarget(g, ref, irrSlope, k, distinct["I:" + k] || 0);
    /* A higher score never ends up worth less than a lower one. */
    const now = Math.max(floor, stepTo(prior, to));
    floor = now;
    if (Math.abs(now - k) >= 0.01) irrOut[k] = now;
    if (now !== round2(prior))
      changes.push({ k: "irr", id: String(k), from: round2(prior), to: now, builtIn: k,
        n: g ? Math.round(g.n) : 0, p: g ? round2(g.p) : null, dev: round2(dev) });
  }
  return { cells: cellsOut, irr: irrOut, changes, slope: round2(slope) };
}

/**
 * The run: counts in, table out.
 *
 * @param {{types:object, cells:object, distinct:object}} counts
 * @param {object} o
 *   prev      the table published before, or null
 *   cellHard  (mark) → the build's hardness of a cell, 1–5, or null
 *   typeIds   Set of the question types the program has
 *   now       the time, for the table's stamp
 * @returns {{table:object, changes:object[], reset:string[], slope:number}}
 *   `reset`: the "type|level" keys whose shift changed — their type counts
 *   start afresh, since what is built for them is no longer what was counted.
 */
export function estimate(counts, { prev = null, cellHard, typeIds, now = Date.now() }) {
  const distinct = (counts && counts.distinct) || {};
  const T = estimateTypes(counts && counts.types, distinct, prev, typeIds);
  const H = estimateHardness(counts && counts.cells, distinct, prev, cellHard, typeIds);
  const table = { v: CAL.v, at: new Date(now).toISOString(), types: T.out, cells: H.cells, irr: H.irr };
  return { table, changes: [...T.changes, ...H.changes], reset: T.reset, slope: H.slope };
}

/** Every count multiplied by `f`; a key that has faded to nothing is dropped. */
export function decayCounts(map, f = CAL.decay) {
  const out = {};
  for (const [k, v] of Object.entries(map || {})) {
    const p = pair(v);
    if (!p) continue;
    const n = round2(p[1] * f);
    if (n >= 0.5) out[k] = [round2(p[0] * f), n];
  }
  return out;
}

/* ======================================================================
 * 4. Reading and applying the table (the browser)
 * ==================================================================== */

/**
 * A table as it may be applied, or null. Rebuilt field by field: a shift is
 * a number within ±1 on a level 1–7, a score a number 1–5 on a short key.
 * Anything else — an old version, a damaged answer, a page that is not a
 * Fallaskóli server — gives null, and the program runs on what it was built
 * with.
 */
export function cleanTable(raw) {
  if (!isObj(raw) || raw.v !== CAL.v) return null;
  const num = (x, lo, hi) => (typeof x === "number" && Number.isFinite(x) && x >= lo && x <= hi ? round2(x) : null);
  const types = {}, cells = {}, irr = {};
  for (const [t, bands] of Object.entries(isObj(raw.types) ? raw.types : {}).slice(0, 400)) {
    if (t.length > 40 || !isObj(bands)) continue;
    for (const [l, s] of Object.entries(bands)) {
      const v = num(s, -CAL.max, CAL.max);
      if (v && Number.isInteger(Number(l)) && l >= LEVEL_MIN && l <= LEVEL_MAX) (types[t] ||= {})[Number(l)] = v;
    }
  }
  for (const [m, s] of Object.entries(isObj(raw.cells) ? raw.cells : {}).slice(0, 2000)) {
    const v = num(s, 1, IRR_MAX);
    if (v != null && m.length <= 40) cells[m] = v;
  }
  for (const [k, s] of Object.entries(isObj(raw.irr) ? raw.irr : {})) {
    const v = num(s, 1, IRR_MAX);
    if (v != null && Number.isInteger(Number(k)) && k >= 1 && k <= IRR_MAX) irr[Number(k)] = v;
  }
  return { v: CAL.v, at: typeof raw.at === "string" ? raw.at.slice(0, 30) : null, types, cells, irr };
}

/** Does the table change anything at all? */
export const tableIsEmpty = (t) =>
  !t || !(Object.keys(t.types || {}).length || Object.keys(t.cells || {}).length || Object.keys(t.irr || {}).length);

/** How far type `id` is moved on the level scale for a pupil at `band`:
    0 without a table, or without an entry. */
export const typeShift = (table, id, band) =>
  (table && table.types && table.types[id] && table.types[id][band]) || 0;

/** The table's scores in the shape core/lexicon.js `buildLexicon` takes as
    `hardness`, or null when it changes no score. */
export function lexHardness(table) {
  if (!table) return null;
  const cells = table.cells || {}, irr = table.irr || {};
  return Object.keys(cells).length || Object.keys(irr).length ? { cells, irr } : null;
}
