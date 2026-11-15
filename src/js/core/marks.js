/* BÍN inflection marks -> analysis. No grammatical rule is asserted here;
   everything is read out of the mark itself. A pure module, no DOM. */

export const CASES = [
  { k: "NF", name: "nefnifall", q: "hver / hvað", term: "nefnifall" },
  { k: "ÞF", name: "þolfall", q: "um hvern / hvað", term: "tholfall" },
  { k: "ÞG", name: "þágufall", q: "frá hverjum / hverju", term: "thagufall" },
  { k: "EF", name: "eignarfall", q: "til hvers", term: "eignarfall" },
];

export const COLS = [
  { k: "ET", label: "eintala", name: "eintala án greinis", term: "eintala" },
  { k: "ETgr", label: "eintala + greinir", name: "eintala með greini", term: "eintala" },
  { k: "FT", label: "fleirtala", name: "fleirtala án greinis", term: "fleirtala" },
  { k: "FTgr", label: "fleirtala + greinir", name: "fleirtala með greini", term: "fleirtala" },
];

export const GENDERS = { kk: "karlkyn", kvk: "kvenkyn", hk: "hvorugkyn" };

export const CLASSNAME = {
  kk: "nafnorð", kvk: "nafnorð", hk: "nafnorð",
  lo: "lýsingarorð", so: "sagnorð",
  fn: "fornafn", pfn: "fornafn", afn: "fornafn", abfn: "fornafn",
  ofn: "fornafn", sfn: "fornafn", tfn: "fornafn",
  gr: "greinir", to: "töluorð", rt: "töluorð",
  ao: "atviksorð", fs: "forsetning", st: "samtenging",
  nhm: "nafnháttarmerki", uh: "upphrópun",
};

export const ALL_CLASSES = [
  "nafnorð", "lýsingarorð", "fornafn", "greinir", "töluorð", "sagnorð",
  "atviksorð", "forsetning", "samtenging", "nafnháttarmerki", "upphrópun",
];

/** Which paradigm ordering in lexicon.orders a BÍN word class uses. */
export function ordKey(c) {
  if (["kk", "kvk", "hk"].includes(c)) return "no";
  if (c === "lo") return "lo";
  if (c === "so") return "so";
  if (["pfn", "afn", "abfn"].includes(c)) return "pfn";
  /* BÍN marks ordinals KK-NFET, like pronouns — not FSB-KK-NFET the way
     adjectives are. That is why they produced nothing at all in v4. */
  if (["fn", "gr", "to", "rt", "ofn", "sfn", "tfn"].includes(c)) return "fn";
  return null;
}

/** "ÞG" + "ETgr" -> "ÞGFETgr" */
export const mark = (c, col) => (c === "ÞG" ? "ÞGF" : c) + col;

export const NOUN_MARKS = CASES.flatMap((c) => COLS.map((col) => mark(c.k, col.k)));

const TOKENS = {
  KK: { kyn: "kk" }, KVK: { kyn: "kvk" }, HK: { kyn: "hk" },
  ET: { tala: "eintala" }, FT: { tala: "fleirtala" },
  FSB: { stig: "frumstig", beyging: "sterk" },
  FVB: { stig: "frumstig", beyging: "veik" },
  MST: { stig: "miðstig", beyging: "veik" },
  MSTSB: { stig: "miðstig", beyging: "sterk" },
  ESB: { stig: "efsta stig", beyging: "sterk" },
  EVB: { stig: "efsta stig", beyging: "veik" },
  SB: { beyging: "sterk" }, VB: { beyging: "veik" },
  GM: { mynd: "germynd" }, MM: { mynd: "miðmynd" },
  FH: { háttur: "framsöguháttur" }, VH: { háttur: "viðtengingarháttur" },
  BH: { háttur: "boðháttur" }, NH: { háttur: "nafnháttur" },
  SAGNB: { háttur: "sagnbót" },
  LHNT: { háttur: "lýsingarháttur nútíðar" },
  LHÞT: { háttur: "lýsingarháttur þátíðar" },
  /* BÍN's "GM-BH-ST": the shortened imperative, *ræt* beside *rætaðu*. It is a
     mood like any other in the mark, but a form the child will not meet outside
     poetry — see `STYFDUR_BH` below. */
  ST: { stýfður: true },
  NT: { tíð: "nútíð" }, ÞT: { tíð: "þátíð" },
  "1P": { persóna: "1. persóna" },
  "2P": { persóna: "2. persóna" },
  "3P": { persóna: "3. persóna" },
  OP: { skýring: "ópersónuleg sögn" },
};

/**
 * Split any BÍN mark into its grammatical features.
 * Nouns "ÞGFETgr", adjectives "FSB-KVK-NFET", pronouns "KK-ÞFET",
 * verbs "GM-FH-ÞT-3P-ET" / "LHÞT-SB-KK-NFET".
 */
export function readMark(m) {
  const out = { greinir: false };
  String(m || "").split("-").forEach((tk) => {
    const mm = /^(NF|ÞF|ÞGF|EF)(ET|FT)(gr)?$/.exec(tk);
    if (mm) {
      out.fall = tk.startsWith("ÞGF") ? "ÞG" : mm[1];
      out.tala = mm[2] === "ET" ? "eintala" : "fleirtala";
      out.greinir = !!mm[3];
      return;
    }
    const t = TOKENS[tk];
    if (t) Object.assign(out, t);
  });
  return out;
}

export const caseName = (k) => (CASES.find((c) => c.k === k) || {}).name || k;

/**
 * Every mood `readMark` can report, in teaching order — derived from TOKENS so
 * the analysis question's buttons cannot miss a mood the marks table knows.
 */
const MOOD_ORDER = ["framsöguháttur", "viðtengingarháttur", "boðháttur",
                    "nafnháttur", "lýsingarháttur nútíðar",
                    "lýsingarháttur þátíðar", "sagnbót"];
export const MOODS = (() => {
  const known = new Set(Object.values(TOKENS).map((t) => t.háttur).filter(Boolean));
  const out = MOOD_ORDER.filter((m) => known.has(m));
  known.forEach((m) => { if (!out.includes(m)) out.push(m); });
  return out;
})();

/* The shortened imperative, BÍN's `GM-BH-ST` (*ræt* beside *rætaðu*): a real
 * cell, archaic outside verse. `isStyfdur` lets tasks/index.js drop it before
 * a question is built; `describeMark` names it wherever it is still shown. It
 * is not deleted from the data — that would be a claim about Icelandic. */
export const STYFDUR_BH = "GM-BH-ST";
export const isStyfdur = (m) => !!readMark(m).stýfður;

/** Human-readable one-liner for a mark, used in feedback panels. */
export function describeMark(m, cls = null) {
  const a = readMark(m);
  const bits = [];
  if (a.stig) bits.push(a.stig);
  if (a.beyging) bits.push(a.beyging + " beyging");
  if (a.mynd) bits.push(a.mynd);
  /* "stýfður boðháttur", never a bare "boðháttur" — a form the child is not
     expected to recognise has to say what it is. */
  if (a.háttur) bits.push(a.stýfður ? "stýfður " + a.háttur : a.háttur);
  if (a.tíð) bits.push(a.tíð);
  if (a.persóna) bits.push(a.persóna);
  if (a.kyn) bits.push(GENDERS[a.kyn]);
  if (a.fall) bits.push(caseName(a.fall));
  if (a.tala) bits.push(a.tala);
  /* The article is a feature of nouns. A personal pronoun's mark has the same
     shape ("NFFT" for *við*), so a caller that knows the word class says so
     and "án greinis" is not said of a pronoun. */
  if (a.fall && /^(NF|ÞF|ÞGF|EF)/.test(String(m)) && (cls == null || cls === "nafnorð"))
    bits.push(a.greinir ? "með greini" : "án greinis");
  return bits.join(", ");
}
