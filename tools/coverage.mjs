/* Coverage of the sentence bank: confirmed tokens per combination of
 * inflectional features, per word class, per difficulty level — counted under
 * the same conditions the program uses (`core/lexicon.js` -> `slotsFor`), plus
 * what the frames can show (`frameCoverage`).
 *
 *   node tools/coverage.mjs            report
 *   node tools/coverage.mjs --json     data/coverage.json (done in the build)
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const p = (...x) => path.join(root, ...x);

const lex = JSON.parse(await readFile(p("lexicon.json"), "utf8"));
const sents = JSON.parse(await readFile(p("sentences.json"), "utf8"));

const ORD = lex.orders;
/* The same mapping as core/marks.js -> ordKey. Numerals and the article use the
   pronoun ordering (BÍN marks ordinals KK-NFET, not FSB-KK-NFET); this was
   wrongly written as "to" here at first and gave numerals zero coverage. */
const ORDKEY = { kk: "no", kvk: "no", hk: "no", lo: "lo", so: "so",
                 fn: "fn", gr: "fn", to: "fn", rt: "fn", pfn: "pfn" };

const formsOf = (w) => {
  const key = ORDKEY[w.c];
  const out = {};
  if (!key || !ORD[key]) return out;
  const cells = String(w.f).split(";");
  ORD[key].forEach((m, i) => { if (cells[i]) out[m] = cells[i].split("|"); });
  return out;
};

const byLemma = new Map();
lex.w.forEach((w) => {
  const list = byLemma.get(w.o) || [];
  list.push({ ...w, forms: formsOf(w) });
  byLemma.set(w.o, list);
});

const CLS_OF_FL = {
  "nafnorð": ["kk", "kvk", "hk"], "lýsingarorð": ["lo"], "sagnorð": ["so"],
  "fornafn": ["fn", "pfn"], "greinir": ["gr"], "töluorð": ["to", "rt"],
};

const norm = (s) => String(s).toLowerCase().normalize("NFC").trim();

/** The same conditions the program applies before asking about a token. */
function confirmedTokens() {
  const out = [];
  sents.forEach((s) => s.tok.forEach((t, i) => {
    if (!t.m || t.rj || !t.c) return;
    const classes = CLS_OF_FL[t.c];
    if (!classes) return;
    const entry = classes
      .map((c) => (byLemma.get(t.l) || []).find((w) => w.c === c))
      .find((w) => w && w.forms[t.m]);
    if (!entry) return;
    if (!entry.forms[t.m].some((f) => norm(f) === norm(t.w))) return;
    out.push({ s, i, t, entry, lvl: s.lvl, fl: t.c, mark: t.m, unsure: t.u || [] });
  }));
  return out;
}

/* ---------- which combinations the program can ask about ---------------- */

const CASES = ["NF", "ÞF", "ÞGF", "EF"];
const NUMS = ["ET", "FT"];
const GEN = ["KK", "KVK", "HK"];
const DEG = ["FSB", "FVB", "MST", "ESB", "EVB"];

/** Every combination that *exists* in the inflectional system, by word class. */
export function universe() {
  const u = {};
  u["nafnorð"] = [];
  CASES.forEach((c) => NUMS.forEach((n) => ["", "gr"].forEach((g) =>
    u["nafnorð"].push(`${c}${n}${g}`))));
  u["lýsingarorð"] = [];
  DEG.forEach((d) => GEN.forEach((k) => CASES.forEach((c) => NUMS.forEach((n) =>
    u["lýsingarorð"].push(`${d}-${k}-${c}${n}`)))));
  u["sagnorð"] = [];
  ["GM", "MM"].forEach((v) => ["FH", "VH"].forEach((h) => ["NT", "ÞT"].forEach((t) =>
    ["1P", "2P", "3P"].forEach((pp) => NUMS.forEach((n) =>
      u["sagnorð"].push(`${v}-${h}-${t}-${pp}-${n}`))))));
  ["GM-NH", "GM-BH-ST", "MM-NH", "LHÞT", "LHNT", "GM-SAGNB"].forEach((m) =>
    u["sagnorð"].push(m));
  u["fornafn"] = [];
  GEN.forEach((k) => CASES.forEach((c) => NUMS.forEach((n) =>
    u["fornafn"].push(`${k}-${c}${n}`))));
  CASES.forEach((c) => NUMS.forEach((n) => u["fornafn"].push(`${c}${n}`)));
  u["töluorð"] = [];
  GEN.forEach((k) => CASES.forEach((c) => NUMS.forEach((n) =>
    u["töluorð"].push(`${k}-${c}${n}`))));
  return u;
}

/** The combinations any word in the corpus actually has. Demanding a sentence
    for a mark *no word has* is demanding the impossible. */
function attestedMarks() {
  const out = {};
  for (const [fl, classes] of Object.entries(CLS_OF_FL)) {
    const set = new Set();
    lex.w.forEach((w) => {
      if (!classes.includes(w.c)) return;
      Object.keys(formsOf(w)).forEach((m) => set.add(m));
    });
    out[fl] = set;
  }
  return out;
}

export function report() {
  const toks = confirmedTokens();
  const U = universe();
  const attested = attestedMarks();
  const levels = [...new Set(sents.map((s) => s.lvl))].sort();

  const perLevel = {};
  levels.forEach((l) => { perLevel[l] = sents.filter((s) => s.lvl === l).length; });

  const cells = {};       // fl -> mark -> lvl -> n
  toks.forEach((x) => {
    ((cells[x.fl] ||= {})[x.mark] ||= {});
    cells[x.fl][x.mark][x.lvl] = (cells[x.fl][x.mark][x.lvl] || 0) + 1;
  });

  const out = { levels: perLevel, classes: {}, tokens: toks.length };
  for (const fl of Object.keys(U)) {
    const possible = U[fl].filter((m) => attested[fl]?.has(m));
    const have = cells[fl] || {};
    const anywhere2 = possible.filter((m) =>
      Object.values(have[m] || {}).reduce((a, b) => a + b, 0) >= 2).length;
    const anywhere1 = possible.filter((m) => have[m]).length;
    const perLevel2 = {}, perLevel1 = {};
    levels.forEach((l) => {
      perLevel2[l] = possible.filter((m) => (have[m] || {})[l] >= 2).length;
      perLevel1[l] = possible.filter((m) => (have[m] || {})[l] >= 1).length;
    });
    /* The owner's goal in v5.5: >=1 sentence per cell (word class x mark x
     level). `cells` is the denominator, `filled` the numerator.

     `reachable` is the third number and the most honest one. A mark counts as
     unreachable if NO sentence in the bank has it at any level — in that case a
     missing sentence is not necessarily the problem; the parser may simply
     never produce it. Singular numerals are the example: BÍN has the forms, so
     they are in `possible`, but Greynir parses *fyrsti* as an adjective and
     *einn* as a pronoun, so no text can fill those cells. Counting them in the
     denominator makes the bank look worse than it is. */
    const reachableMarks = possible.filter((m) => have[m]);
    out.classes[fl] = {
      possible: possible.length,
      seen: anywhere1,
      reachable: reachableMarks.length,
      cells: possible.length * levels.length,
      filled: levels.reduce((a, l) => a + perLevel1[l], 0),
      reachableCells: reachableMarks.length * levels.length,
      twiceAnywhere: anywhere2,
      oncePerLevel: perLevel1,
      twicePerLevel: perLevel2,
      tokens: Object.values(have).reduce(
        (a, byLvl) => a + Object.values(byLvl).reduce((x, y) => x + y, 0), 0),
      missing: possible.filter((m) => !have[m]).slice(0, 40),
    };
  }
  return out;
}

const r = report();

if (process.argv.includes("--json")) {
  await writeFile(p("data/coverage.json"), JSON.stringify(r, null, 1) + "\n", "utf8");
}

const pct = (a, b) => (b ? ((100 * a) / b).toFixed(0) + "%" : "—");
console.log("\nsentences per difficulty level (goal 40):");
Object.entries(r.levels).forEach(([l, n]) =>
  console.log(`   ${l}: ${String(n).padStart(3)}  ${n >= 40 ? "✓" : (40 - n) + " short"}`));

console.log("\nconfirmed tokens: " + r.tokens);
console.log("\n" + "word class".padEnd(14) + "tokens".padStart(6) + "possib.".padStart(8) +
  "seen".padStart(7) + "2+ total".padStart(9) + "   2+ at each level (1-5)");
for (const [fl, c] of Object.entries(r.classes)) {
  const per = Object.entries(c.twicePerLevel).map(([, v]) => String(v).padStart(3)).join("");
  console.log(fl.padEnd(14) + String(c.tokens).padStart(6) + String(c.possible).padStart(8) +
    pct(c.seen, c.possible).padStart(7) + pct(c.twiceAnywhere, c.possible).padStart(9) +
    "   " + per);
}
/* The v5.5 goal: >=1 sentence per cell. This is the figure the owner asked to
   have measured, so it stands on its own and is not mixed together with the
   older, stricter 2+ requirement. */
const sum = (k) => Object.values(r.classes).reduce((a, c) => a + c[k], 0);
console.log("\n>=1 SENTENCE PER CELL (word class x mark x level)\n");
console.log("word class".padEnd(14) + "cells".padStart(8) + "filled".padStart(9) +
  "  of those REACHABLE".padStart(28));
for (const [fl, c] of Object.entries(r.classes)) {
  console.log(fl.padEnd(14) + String(c.cells).padStart(8) + String(c.filled).padStart(9) +
    `   ${c.filled}/${c.reachableCells} ${pct(c.filled, c.reachableCells)}`.padStart(28) +
    (c.reachable < c.possible
      ? `   (${c.possible - c.reachable} marks never appear)` : ""));
}
console.log("TOTAL".padEnd(14) + String(sum("cells")).padStart(8) +
  String(sum("filled")).padStart(9) +
  `   ${sum("filled")}/${sum("reachableCells")} ${pct(sum("filled"), sum("reachableCells"))}`.padStart(28));

console.log(`
"possib." = combinations any word in the BÍN corpus actually has.
"2+ at each level" = how many of those have two confirmed tokens at that level.
"reachable" = cells for marks that appear somewhere in the bank. A mark that
appears nowhere may be unreachable through the parser rather than unwritten.

`);
