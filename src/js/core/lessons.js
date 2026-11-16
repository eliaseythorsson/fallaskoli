/* Lesefni (v6.7): one-page lessons, and which page a question belongs to.

   The prose of every page is hand-written (src/js/content/lessons.js) — it is
   teaching, not data. The paradigms on the pages are NOT: a table block names
   a word and the forms are read out of BÍN through the lexicon, exactly as the
   questions read them, so a page cannot show a form the questions would mark
   wrong. A table whose word or forms are missing is left out, never guessed.

   Pure functions. No DOM.                                                  */

import { LESSONS } from "../content/lessons.js";

export { LESSONS };

const BY_ID = new Map(LESSONS.map((l) => [l.id, l]));
export const lessonById = (id) => BY_ID.get(id) || null;

/** The pages of one skill, in the order they were written. */
export const lessonsOfSkill = (skill) => LESSONS.filter((l) => l.skill === skill);

/* ---------- which page a question belongs to ------------------------------ */

/** Every BÍN mark the question is about, as one string to test against. */
function marksOf(task) {
  const out = [task.m, task.cell, task.t && task.t.m];
  (task.cells || []).forEach((c) => out.push(c.m));
  return out.filter(Boolean).join(" ");
}

const first = (...ids) => ids.find((id) => BY_ID.has(id)) || null;

/**
 * The page that teaches what this question asks, or null. Chosen from the
 * question's skill and, inside a skill, from the marks it is about: a
 * comparative goes to *stigbreyting*, a subjunctive to *háttur*.
 */
export function lessonFor(task) {
  if (!task) return null;
  const m = marksOf(task);
  switch (task.skill) {
    case "nafnord":
      if (task.type === "table" || task.type === "kenni") return first("nafnord-beyging", "foll");
      return first("foll");
    case "lysingarord":
      if (/\b(MST|ESB|EVB)-/.test(m)) return first("stigbreyting", "lo-beyging");
      if (task.type === "parse" && /^(FSB|FVB)-/.test(m)) return first("lo-beyging");
      return first("lo-beyging", "samraemi");
    case "sagnord":
      /* item 27: a question about one thing a page teaches says which page. */
      if (task.lesson && BY_ID.has(task.lesson)) return task.lesson;
      if (/(^|\s|-)MM-/.test(m) || /^MM-/.test(m)) return first("mynd");
      if (/-(VH|BH)(-|\b)|GM-BH|LHÞT|LHNT|SAGNB|-NH\b/.test(m)) return first("hattur");
      if (/-ÞT-/.test(m)) return first("tid", "persona-tala");
      return first("persona-tala");
    case "fornofn":
      if (task.kind === "gr" || (task.w && task.w.c === "gr")) return first("greinir", "fornofn");
      return first("fornofn");
    case "toluord": return first("toluord");
    case "obeygjanleg": return first("obeygjanleg");
    case "greining": {
      const fl = task.t && task.t.c;
      if (fl === "lýsingarorð") return first(/\b(MST|ESB|EVB)-/.test(m) ? "stigbreyting" : "lo-beyging");
      if (fl === "sagnorð") {
        if (/^MM-/.test(m)) return first("mynd");
        if (/-(VH|BH)|LHÞT|LHNT|SAGNB|-NH\b/.test(m)) return first("hattur");
        return first("persona-tala");
      }
      if (fl === "nafnorð") return first("foll");
      if (fl === "fornafn") return first("fornofn");
      if (fl === "greinir") return first("greinir");
      if (fl === "töluorð") return first("toluord");
      return first("ordflokkar");
    }
    case "fallstjorn": return first("fallstjorn");
    case "ordaford": return first("ordafordi");
    case "setningafraedi": return first("setningalidir");
    case "setningagerd": return first("setningagerdir");
    case "malbeiting": return first("malbeiting");
    default: return null;
  }
}

/* Glossary term (core/glossary.js id) → the page that explains it at length. */
export const TERM_LESSON = {
  nefnifall: "foll", tholfall: "foll", thagufall: "foll", eignarfall: "foll", fall: "foll",
  eintala: "kyn-tala", fleirtala: "kyn-tala", tala: "kyn-tala",
  karlkyn: "kyn-tala", kvenkyn: "kyn-tala", hvorugkyn: "kyn-tala", kyn: "kyn-tala",
  greinir: "greinir", kennifoll: "nafnord-beyging", stofn: "nafnord-beyging",
  sterkbeyging: "lo-beyging", veikbeyging: "lo-beyging",
  stigbreyting: "stigbreyting", frumstig: "stigbreyting", midstig: "stigbreyting", efstastig: "stigbreyting",
  samraemi: "samraemi",
  persona: "persona-tala", personuleg: "fallstjorn", opersonuleg: "fallstjorn",
  nutid: "tid", thatid: "tid", tid: "tid",
  framsoguhattur: "hattur", vidtengingarhattur: "hattur", bodhattur: "hattur", styfdurbh: "hattur",
  nafnhattur: "hattur", lhnt: "hattur", lhtht: "hattur", sagnbot: "hattur", hattur: "hattur",
  germynd: "mynd", midmynd: "mynd", mynd: "mynd",
  sterksogn: "sterkar-veikar", veiksogn: "sterkar-veikar",
  fornafn: "fornofn", toluord: "toluord",
  atviksord: "obeygjanleg", forsetning: "obeygjanleg", samtenging: "obeygjanleg",
  upphropun: "obeygjanleg", nhm: "obeygjanleg", obeygjanleg: "obeygjanleg",
  ordflokkur: "ordflokkar", fallord: "ordflokkar", nafnord: "ordflokkar",
  lysingarord: "ordflokkar", sagnord: "ordflokkar",
  stjorn: "fallstjorn",
  frumlag: "setningalidir", umsogn: "setningalidir", andlag: "setningalidir", sagnfylling: "setningalidir",
  adalsetning: "setningagerdir", aukasetning: "setningagerdir",
};
export const lessonForTerm = (id) => (BY_ID.has(TERM_LESSON[id]) ? TERM_LESSON[id] : null);

/* ---------- tables out of BÍN ---------------------------------------------- */

const CASE_ROWS = [["NF", "nefnifall"], ["ÞF", "þolfall"], ["ÞGF", "þágufall"], ["EF", "eignarfall"]];
const GENDERS = [["KK", "karlkyn"], ["KVK", "kvenkyn"], ["HK", "hvorugkyn"]];
const PERSONS = [["1P-ET", "ég"], ["2P-ET", "þú"], ["3P-ET", "hann / hún / það"],
                 ["1P-FT", "við"], ["2P-FT", "þið"], ["3P-FT", "þeir / þær / þau"]];
const VOICE = { GM: "germynd", MM: "miðmynd" };
const MOOD = { FH: "framsöguháttur", VH: "viðtengingarháttur" };
const TENSE = { NT: "nútíð", ÞT: "þátíð" };
const DEG = { FSB: "frumstig, sterk beyging", FVB: "frumstig, veik beyging", MST: "miðstig",
              ESB: "efsta stig, sterk beyging", EVB: "efsta stig, veik beyging" };
const NUM = { ET: "eintala", FT: "fleirtala" };

const CLASSES_OF = { noun: ["kk", "kvk", "hk"], adj: ["lo"], comp: ["lo"], verb: ["so"],
                     kennimyndir: ["so"], pron: ["pfn", "fn", "gr", "to", "rt"] };

function entry(lex, w, kind, c) {
  const want = c ? [c] : CLASSES_OF[kind] || [];
  const list = lex.lemma(w) || [];
  return list.find((x) => want.includes(x.c)) || null;
}

/** All forms of one cell, joined; null when BÍN has none. */
const cell = (e, m) => {
  const f = e && e.forms && e.forms[m];
  return f && f.length ? f.join(" / ") : null;
};

/**
 * A table block → { cap, cols, rows: [{ head, cells: [string|null] }] }, or
 * null if the word is not in the lexicon or the table would be mostly empty.
 */
export function buildTable(lex, b) {
  const t = b.table;
  let cols, rows;
  if (t === "noun") {
    const e = entry(lex, b.w, "noun", b.c);
    if (!e) return null;
    cols = ["eintala", "með greini", "fleirtala", "með greini"];
    rows = CASE_ROWS.map(([k, nm]) => ({
      head: nm,
      cells: [`${k}ET`, `${k}ETgr`, `${k}FT`, `${k}FTgr`].map((m) => cell(e, m)),
    }));
  } else if (t === "adj") {
    const e = entry(lex, b.w, "adj");
    if (!e) return null;
    const deg = DEG[b.deg] ? b.deg : "FSB", num = NUM[b.num] ? b.num : "ET";
    cols = GENDERS.map(([, nm]) => nm);
    rows = CASE_ROWS.map(([k, nm]) => ({
      head: nm, cells: GENDERS.map(([g]) => cell(e, `${deg}-${g}-${k}${num}`)),
    }));
    b = { ...b, cap: b.cap || `${b.w} — ${DEG[deg]}, ${NUM[num]}` };
  } else if (t === "comp") {
    cols = ["frumstig", "miðstig", "efsta stig"];
    rows = [].concat(b.w).map((w) => {
      const e = entry(lex, w, "comp");
      return e && { head: w, cells: ["FSB", "MST", "ESB"].map((d) => cell(e, `${d}-KK-NFET`)) };
    }).filter(Boolean);
  } else if (t === "verb") {
    const e = entry(lex, b.w, "verb");
    if (!e) return null;
    const tenses = [].concat(b.tenses || ["GM-FH-NT", "GM-FH-ÞT"]);
    cols = tenses.map((x) => { const [v, h, tt] = x.split("-");
      return [TENSE[tt], MOOD[h], v === "MM" ? VOICE.MM : null].filter(Boolean).join(", "); });
    rows = PERSONS.map(([p, nm]) => ({ head: nm, cells: tenses.map((x) => cell(e, `${x}-${p}`)) }));
  } else if (t === "kennimyndir") {
    cols = ["nafnháttur", "1. p. et. þátíð", "1. p. ft. þátíð", "sagnbót"];
    rows = [].concat(b.w).map((w) => {
      const e = entry(lex, w, "kennimyndir");
      return e && { head: w, cells: ["GM-NH", "GM-FH-ÞT-1P-ET", "GM-FH-ÞT-1P-FT", "GM-SAGNB"]
        .map((m) => cell(e, m)).map((f, i) => (f && i === 0 ? "að " + f : f)) };
    }).filter(Boolean);
  } else if (t === "pron") {
    /* `c` chooses between homographs: *hinn* the article (hið) or the
       pronoun (hitt), *annar* the pronoun or the ordinal. */
    const e = (b.c && entry(lex, b.w, "pron", b.c)) || entry(lex, b.w, "pron");
    if (!e) return null;
    if (e.c === "pfn") {
      cols = ["eintala", "fleirtala"];
      rows = CASE_ROWS.map(([k, nm]) => ({ head: nm, cells: [cell(e, `${k}ET`), cell(e, `${k}FT`)] }));
    } else {
      const num = NUM[b.num] ? b.num : (cell(e, "KK-NFET") ? "ET" : "FT");
      cols = GENDERS.map(([, nm]) => nm);
      rows = CASE_ROWS.map(([k, nm]) => ({
        head: nm, cells: GENDERS.map(([g]) => cell(e, `${g}-${k}${num}`)),
      }));
      b = { ...b, cap: b.cap || `${b.w} — ${NUM[num]}` };
    }
  } else {
    return null;
  }
  const filled = rows.reduce((a, r) => a + r.cells.filter(Boolean).length, 0);
  const total = rows.reduce((a, r) => a + r.cells.length, 0);
  if (!rows.length || !total || filled / total < 0.5) return null;
  return { cap: b.cap || "", cols, rows };
}

/** Every table on every page that the lexicon cannot fill: for the tests. */
export function brokenTables(lex) {
  const out = [];
  LESSONS.forEach((l) => (l.blocks || []).forEach((b, i) => {
    if (b.table && !buildTable(lex, b)) out.push(`${l.id} #${i} ${b.table} ${[].concat(b.w).join(",")}`);
  }));
  return out;
}

/* ---------- what has been read --------------------------------------------- */

/** Mark a page as read in the state. `S.read` is { pageId: true }. */
export function markRead(S, id) {
  if (!BY_ID.has(id)) return false;
  const r = (S.read ||= {});
  if (r[id]) return false;
  r[id] = true;
  return true;
}
export const readCount = (S) => Object.keys((S && S.read) || {}).filter((k) => BY_ID.has(k)).length;
