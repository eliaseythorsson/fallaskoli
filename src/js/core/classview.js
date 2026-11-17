/* The class's error patterns, for the teacher (critique item 37).

   The diagnosis (core/diagnosis.js) is kept per pupil and was shown only to
   the pupil. A teacher's most useful screen did not exist: pupils down the
   side, patterns across the top, the rate in each cell, the class's worst
   pattern first. This module is that screen's arithmetic, shared by the
   server (which sends it) and the browser (which draws it), so the two read
   the same numbers in the same order.

   WHAT LEAVES A PUPIL'S STATE, and nothing else: for each pattern the figures
   `standingOf` returns — answers in the recent window (`seen`), misses in it
   (`misses`), their share (`rate`), the direction (`trend`), whether the
   pattern is "algengt núna" (`active`) and the two totals (`n`, `w`). These
   are exactly the figures the pupil sees under Merki og framvinda →
   Framvinda (the skill map, ui/skillmap.js), worked out by the same
   function, so the teacher never sees a number the pupil was not shown.

   NOT sent: the examples a pattern keeps (`ex`: a word and two BÍN marks),
   the date of the last miss, the raw string of hits and misses. And nothing a
   child typed — the state does not hold it in the first place.

   Pure: no DOM, no clock.                                                   */

import { PATTERNS, patternById, standingOf, UNREAD } from "./diagnosis.js";

/** The figures of one pattern, as the teacher gets them. */
const figures = (rec, meta) => {
  const s = standingOf(rec);
  return {
    n: s.n, w: s.w, seen: s.seen, misses: s.misses,
    /* Rounded: three decimals say everything a cell can show. */
    rate: Math.round(s.rate * 1000) / 1000,
    trend: s.trend,
    active: meta ? false : s.active,
  };
};

/**
 * One pupil's standings, for the teacher: every pattern they have met (a
 * chance at least once), "Ógreint" included under its own id.
 * @returns {{ [patternId]: { n, w, seen, misses, rate, trend, active } }}
 */
export function pupilStandings(S) {
  const out = {};
  for (const [id, rec] of Object.entries((S && S.diag) || {})) {
    const p = patternById(id);
    if (!p || !rec || !(rec.n > 0)) continue;
    out[id] = figures(rec, !!p.meta);
  }
  return out;
}

/**
 * The columns of the table: the patterns that have gone wrong for somebody in
 * the class, the class's worst first. "Worst" is first how many pupils have
 * the pattern active ("algengt núna", the pupil's own flag), then the miss
 * rate of the whole class in the recent window (all misses over all answers,
 * so a pupil with two answers does not outweigh one with sixteen), then the
 * total of misses. "Ógreint" is not a column here: it is not an error of the
 * pupil's, and the table shows it on its own at the end.
 *
 * `only`: restrict to these pattern ids (an assignment's material).
 *
 * @param {Array<{diag: object}>} pupils
 * @returns {Array<{ id, nm, active, misses, seen, rate, w }>}
 */
export function classColumns(pupils, only = null) {
  const keep = only ? new Set(only) : null;
  const sum = new Map();
  for (const pu of pupils || []) {
    for (const [id, f] of Object.entries(pu.diag || {})) {
      const p = patternById(id);
      if (!p || p.meta || (keep && !keep.has(id))) continue;
      const t = sum.get(id) || { id, nm: p.nm, active: 0, misses: 0, seen: 0, w: 0 };
      if (f.active) t.active++;
      t.misses += f.misses || 0; t.seen += f.seen || 0; t.w += f.w || 0;
      sum.set(id, t);
    }
  }
  /* Only what has gone wrong for somebody: a column of noughts is noise. On
     an assignment's material every pattern of it is shown, so the teacher
     sees that the class has met it and got it right. */
  return [...sum.values()]
    .filter((t) => keep || t.w > 0 || t.misses > 0)
    .map((t) => ({ ...t, rate: t.seen ? t.misses / t.seen : 0 }))
    .sort((a, b) => b.active - a.active || b.rate - a.rate || b.w - a.w ||
      PATTERNS.findIndex((p) => p.id === a.id) - PATTERNS.findIndex((p) => p.id === b.id));
}

/** Pupils in the order the table lists them: by name, as Icelandic sorts. */
export const byName = (a, b) => String(a.name).localeCompare(String(b.name), "is");

/* ---------- the CSV the teacher downloads -------------------------------- */

/* Semicolons, because a spreadsheet set to Icelandic reads the comma as the
   decimal point and expects `;` between fields; a byte-order mark, so Excel
   reads the file as UTF-8 and þ, ð and æ survive. */
const SEP = ";";
const BOM = "\uFEFF";

/** One field. Quoted when it must be; and a field that a spreadsheet would
    run as a formula (`=`, `+`, `-`, `@`, a tab or a return at the start) is
    defused with a leading apostrophe — the nicknames are chosen by pupils. */
export function csvField(v) {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * The table as a CSV file: a row per pupil, a column per pattern holding the
 * miss rate of the recent window in whole percent (empty where the pupil has
 * not met the pattern lately), and at the end the two "Ógreint" counts.
 * Numbers only, so the spreadsheet can sort and average them.
 */
export function patternCSV(pupils, columns = classColumns(pupils)) {
  const head = ["Nemandi", ...columns.map((c) => `${c.nm} (% rangt undanfarið)`),
    "Ógreind röng svör", "Röng svör alls"];
  const rows = [...(pupils || [])].sort(byName).map((pu) => {
    const d = pu.diag || {};
    const u = d[UNREAD] || { w: 0, n: 0 };
    return [pu.name, ...columns.map((c) => {
      const f = d[c.id];
      return f && f.seen ? Math.round(100 * f.rate) : "";
    }), u.w || 0, u.n || 0];
  });
  return BOM + [head, ...rows].map((r) => r.map(csvField).join(SEP)).join("\r\n") + "\r\n";
}
