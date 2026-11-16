/* ÍNO (XML, from CLARIN) -> the data set the program already accepts.
 *
 *   node tools/ino.mjs sources/islensk_nutimamalsordabok_2026-02.xml
 *   node tools/ino.mjs <skrá> --skoda          # look at the file, change nothing
 *   node tools/ino.mjs <skrá> --ut data/ino.json
 *   node tools/ino.mjs <skrá> --merkingar 2    # keep two senses, not one
 *   node tools/ino.mjs <skrá> --allt           # keep words outside the vocabulary too
 *
 * WHY THIS FILE AND NOT A CHANGE TO THE UPLOAD:
 *
 * docs/DEFINITIONS.md already settled the shape the definitions arrive in —
 * `{ "<bin_id>": { def, example } }`, keyed on bin_id so that *ljós* the noun
 * and *ljós* the adjective do not share a definition. `pipeline/build_bundle.py` reads
 * it, `PUT /admin/dataset` accepts it, `/definitions` serves it and
 * `core/definitions.js` asks for it. Four places already agree.
 *
 * The one step nobody wrote is the one between the download and that shape.
 * Árnastofnun publish ÍNO as one 38 MB XML file. Teaching the browser, or the
 * server, to read XML would put a parser in the child's path for the sake of a
 * conversion that happens ONCE, so it happens here instead, on the owner's own
 * machine, and the result is the file both paths already know.
 *
 * ---------------------------------------------------------------------------
 * THREE FAULTS FIXED IN v5.8, ALL OF THEM VISIBLE ON SCREEN
 *
 * The owner reported them as three separate oddities. They were one file.
 *
 * 1. **A definition could be attached to a word of the wrong class.** The old
 *    matcher filtered the lexicon candidates by ÍNO's word class and then, if
 *    the filter left nothing and there was exactly one candidate, used that one
 *    candidate anyway. *sá* is a verb in ÍNO and a pronoun in this program's
 *    vocabulary — one candidate, no class match, attached regardless. The
 *    pronoun *sá* was then handed the definition "dreifa fræi, sáðkorni, í
 *    jörð", and *slá* the verb was handed "lárétt stöng". The fallback is gone.
 *    A class that does not match is now a REJECTION, not a hint; this is design
 *    rule 2 — a wrong answer is worse than no answer — applied to the
 *    dictionary rather than to the grammar.
 *
 * 2. **The definition and the example could come from different senses.**
 *    `skepna` is *dýr* in ÍNO's first sense (example: "mér þykir gaman að
 *    umgangast skepnur") and *hnjóðsyrði um mann* in the second. The old loop
 *    broke out of the definition scan as soon as it had one definition, but the
 *    example scan ran over every sense until it found any example at all — and
 *    it did not have to be the sense the definition came from. Senses are now
 *    read whole: a sense carries its own definition AND its own example, and
 *    they travel together or not at all. The owner's rule — *"the first should
 *    universally be shown"* — is then simply "sense one", and it holds for the
 *    example too.
 *
 * 3. **Nothing downstream could tell that any of this had gone wrong**, because
 *    the file recorded no word class. It now records `cls` (and `pos`) on every
 *    entry, `pipeline/build_bundle.py` checks it a second time against the lexicon, and
 *    `tests/definitions.test.js` fails if an entry is attached to a word of
 *    another class. Two independent checks, because one check is one place to
 *    be wrong.
 *
 * WHAT IT DOES WITH bin_id: the XML has none. It has lemmas. `data/lexicon.json`
 * has both — `i` is the bin_id, `o` the lemma, `c` the word class — so the join
 * happens on lemma + word class, and only for the words the program actually
 * teaches. That also keeps the upload small: the child never needed the other
 * ~50,000 entries.
 *
 * No third-party packages, on purpose (see the header of server/server.mjs).
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isGrammarGloss } from "../src/js/core/definitions.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);

/* ---------- the arguments ---------- */

const argv = process.argv.slice(2);
const flagged = new Set();
const flag = (name, fallback = null) => {
  const i = argv.indexOf("--" + name);
  if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--")) {
    flagged.add(argv[i + 1]);
    return argv[i + 1];
  }
  return fallback;
};
const has = (name) => argv.includes("--" + name);

const OUT = flag("ut", path.join(ROOT, "data", "ino.json"));
const REPORT = flag("skyrsla", path.join(ROOT, "data", "ino-report.json"));
const SENSES = Math.max(1, Number(flag("merkingar", "1")) || 1);
const KEEP_ALL = has("allt");
const src = argv.find((a) => !a.startsWith("--") && !flagged.has(a));

/* The messages below are for somebody who does not write code, because that is
   who runs this. "Cannot find module" and a stack trace are not an answer. */
const stop = (...lines) => { console.error("\n" + lines.join("\n") + "\n"); process.exit(1); };

if (!src) {
  stop(
    "This tool needs to be told where the ÍNO file is.",
    "",
    "  cd <the fallaskoli folder>",
    "  node tools/ino.mjs <the .xml file>            # convert",
    "  node tools/ino.mjs <the .xml file> --skoda    # look, change nothing",
    "",
    "The whole line matters: the path on its own is not a command, and the",
    "shell will answer 'permission denied'. The file this writes is",
    "data/ino.json.");
}

/* ---------- reading XML without a library ---------- */

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (s) => String(s)
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);

/** Text of a fragment: tags out, entities in, whitespace tidy. CDATA is
    unwrapped first — it matches the tag pattern, so a naive strip eats it. */
const textOf = (xml) => decode(
  String(xml).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]*>/g, " ")
).replace(/\s+/g, " ").trim();

/**
 * Every `<Tag …>…</Tag>` block at the OUTERMOST level of `xml`, walked with
 * indexOf rather than one regex over the whole document. On a 38 MB file that
 * is the difference between seconds and effectively never: a regex that hunts
 * for each closing tag from where it happens to be rescans the tail of the file
 * once per entry.
 *
 * Depth is counted, so a tag that nests inside itself — `<Sense>` does, for
 * sub-senses — yields the whole outer block once instead of a fragment that
 * stops at the first `</Sense>`. The old version was not depth-aware, and a
 * truncated first sense is one of the ways a definition and an example could
 * come from different places.
 */
function* blocks(xml, tag) {
  const open = `<${tag}`, close = `</${tag}>`;
  let i = 0;
  for (;;) {
    const a = xml.indexOf(open, i);
    if (a < 0) return;
    const after = xml[a + open.length];
    if (after && !/[\s/>]/.test(after)) { i = a + open.length; continue; }
    const gt = xml.indexOf(">", a);
    if (gt < 0) return;
    if (xml[gt - 1] === "/") { yield { head: xml.slice(a, gt), inner: "" }; i = gt + 1; continue; }

    /* Walk forward counting opens and closes until the depth returns to zero. */
    let depth = 1, j = gt + 1, end = -1;
    while (depth > 0) {
      const nextOpen = xml.indexOf(open, j);
      const nextClose = xml.indexOf(close, j);
      if (nextClose < 0) break;
      if (nextOpen >= 0 && nextOpen < nextClose) {
        const c = xml[nextOpen + open.length];
        const ogt = xml.indexOf(">", nextOpen);
        const selfClosing = ogt > 0 && xml[ogt - 1] === "/";
        if (c && !/[\s/>]/.test(c)) { j = nextOpen + open.length; continue; }
        if (!selfClosing) depth += 1;
        j = (ogt > 0 ? ogt : nextOpen + open.length) + 1;
        continue;
      }
      depth -= 1;
      j = nextClose + close.length;
      if (depth === 0) end = nextClose;
    }
    if (end < 0) return;
    yield { head: xml.slice(a, gt), inner: xml.slice(gt + 1, end) };
    i = j;
  }
}

const attr = (head, name) => {
  const m = new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, "i").exec(head);
  return m ? decode(m[1]) : null;
};

/** `<feat att="X" val="Y"/>` -> Y, the first one in this fragment. */
const feat = (xml, att) => {
  const m = new RegExp(`<feat\\s+att="${att}"\\s+val="([^"]*)"`, "i").exec(xml || "");
  return m ? decode(m[1]) : null;
};

/** The Icelandic `<text>` inside a fragment. */
const isText = (xml) => {
  for (const t of blocks(xml || "", "text")) {
    const lang = attr(t.head, "language");
    if (!lang || /^is/i.test(lang)) {
      const s = textOf(t.inner);
      if (s) return s;
    }
  }
  return "";
};

/** Where the first nested `<Sense>` starts, or -1.
 *
 * `indexOf("<Sense")` is wrong here and was wrong in a way that cost every
 * example sentence in the fixture: `<SenseExample>` also begins with `<Sense`,
 * so a sense was cut off immediately before its own example. The tag has to end
 * where a tag ends. */
const nestedSenseAt = (xml) => {
  const m = /<Sense[\s/>]/.exec(xml);
  return m ? m.index : -1;
};

/** Everything above the first nested `<Sense>`: a sub-sense is a sense of its
    own and must not be read as part of its parent. */
const ownPart = (senseXml) => {
  const at = nestedSenseAt(senseXml);
  return at < 0 ? senseXml : senseXml.slice(0, at);
};

/* ---------- ÍNO's labels -> the program's word classes ---------- */

const POS = {
  noun: "no",           // gender decides kk/kvk/hk, below
  verb: "so", adjective: "lo", adverb: "ao",
  pronoun: "fn", numeral: "to", conjunction: "st", preposition: "fs",
  interjection: "uh", article: "gr", ordinal: "rt",
  /* Icelandic labels, in case an older or newer edition uses them. */
  "nafnorð": "no", "sagnorð": "so", "sögn": "so", "lýsingarorð": "lo",
  "atviksorð": "ao", "fornafn": "fn", "töluorð": "to", "samtenging": "st",
  "forsetning": "fs", "upphrópun": "uh", "greinir": "gr", "raðtala": "rt",
};
const GENDER = { m: "kk", f: "kvk", n: "hk",
  masculine: "kk", feminine: "kvk", neuter: "hk",
  kk: "kk", kvk: "kvk", hk: "hk" };

/* ÍNO also writes labels as phrases and pairs: "ordinal numeral",
   "infinitive particle", "preposition/adverb", "adjective/adverb". Up to v6.8
   each of those fell through to "no word class" and the entry was dropped,
   which is why *annar, þriðji … tuttugasti*, *um, yfir, milli* and the
   -andi adverbs (*blindandi, sláandi*) had no definition. Order matters:
   "adverb" contains "verb" and "pronoun" contains "noun". */
const KEYWORDS = [
  [/ordinal|raðtala/, "rt"],
  [/infinitive|nafnháttarmerki/, "nhm"],
  [/pronoun|fornafn/, "fn"],
  [/numeral|töluorð/, "to"],
  [/conjunction|samtenging/, "st"],
  [/preposition|forsetning/, "fs"],
  [/interjection|upphrópun/, "uh"],
  [/adverb|atviksorð/, "ao"],
  [/adjective|lýsingarorð/, "lo"],
  [/verb|sagnorð|sögn/, "so"],
  [/noun|nafnorð/, "no"],
  [/article|greinir/, "gr"],
];
const oneClass = (label) => {
  const s = String(label || "").trim().toLowerCase();
  if (!s) return null;
  if (POS[s]) return POS[s];
  for (const [re, c] of KEYWORDS) if (re.test(s)) return c;
  return null;
};

/** Every class an ÍNO label names, in its order: "preposition/adverb" ->
    ["fs", "ao"]. A noun becomes its gender when ÍNO states one. */
const classesOf = (pos, gender) => {
  const out = [];
  for (const part of String(pos || "").split(/\s*(?:\/|,|;|\bog\b|\bor\b)\s*/)) {
    let c = oneClass(part);
    if (c === "no") c = GENDER[String(gender || "").trim().toLowerCase()] || "no";
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
};

/* The lexicon's own classes, grouped the way `classesOf` names them. `no` means
   "a noun of some gender ÍNO did not state" and matches all three. */
const LEX_CLASSES_OF = {
  no: ["kk", "kvk", "hk"],
  kk: ["kk"], kvk: ["kvk"], hk: ["hk"],
  lo: ["lo"], so: ["so"], ao: ["ao"],
  /* BÍN files personal pronouns as `pfn` and the rest as `fn`; ÍNO has one
     label for both. Cardinals and ordinals likewise. */
  fn: ["fn", "pfn"], to: ["to"], rt: ["rt"],
  gr: ["gr"], st: ["st"], fs: ["fs"], uh: ["uh"], nhm: ["nhm"],
};

/* ---------- read the file ---------- */

const xml = await fs.readFile(src, "utf8").catch((e) => stop(
  `Could not read: ${src}`,
  e.code === "ENOENT"
    ? "There is no file at that path. Check the name, or drag the file onto the\n"
      + "Terminal window to have the path typed for you."
    : String(e.message),
  "",
  "If the download is still a .zip, unzip it first — the .xml is inside."));

if (/^PK/.test(xml.slice(0, 2))) stop(
  `${path.basename(src)} is a zip file, not the XML.`,
  "Unzip it (double-click it in Finder) and point this at the .xml inside.");

console.log(`ÍNO: ${path.basename(src)}, ${(xml.length / 1e6).toFixed(1)} MB`);

const ENTRY = flag("fletta", "LexicalEntry");

if (has("skoda")) {
  const tally = new Map();
  for (const m of xml.matchAll(/<([A-Za-z_][\w.:-]*)[\s/>]/g)) {
    const n = m[1].replace(/^.*:/, "").toLowerCase();
    tally.set(n, (tally.get(n) || 0) + 1);
  }
  console.log("\nElements, most frequent first:");
  for (const [n, c] of [...tally].sort((a, b) => b[1] - a[1]).slice(0, 25))
    console.log(`  ${String(c).padStart(8)}  <${n}>`);

  /* In this format the fields are `feat att="…"`, so those names matter more
     than the element names do. */
  const atts = new Map();
  for (const m of xml.matchAll(/<feat\s+att="([^"]+)"/g))
    atts.set(m[1], (atts.get(m[1]) || 0) + 1);
  if (atts.size) {
    console.log("\nfeat att= names:");
    for (const [n, c] of [...atts].sort((a, b) => b[1] - a[1]).slice(0, 20))
      console.log(`  ${String(c).padStart(8)}  ${n}`);
  }

  const first = [...blocks(xml, ENTRY)].slice(0, 2);
  console.log(`\nThe first two <${ENTRY}> blocks:\n`);
  for (const b of first) console.log(b.head + ">" + b.inner + `</${ENTRY}>\n`);
  process.exit(0);
}

/* ---------- the vocabulary we are joining onto ---------- */

/* `--ordasafn` exists so the conversion can be tested against a small, made-up
   vocabulary instead of the real 2.6 MB one. `tests/definitions.test.js` runs
   this tool for real, on a fixture that contains exactly the four words the
   owner reported — sá, slá, skepna, allur — and fails if any of them comes back
   with the wrong reading. A rule nobody exercises is a rule that comes back. */
const lexPath = flag("ordasafn", path.join(ROOT, "data", "lexicon.json"));
const lexRaw = await fs.readFile(lexPath, "utf8").catch(() => stop(
  `Could not find ${lexPath}`,
  "",
  "This tool belongs in the `tools/` folder of the fallaskoli project, beside",
  "build.mjs — it reads the project's own word list to find the BÍN numbers.",
  "Move it there and run it again. (It can be run from any folder once it",
  "is in the right place.)"));
const lex = JSON.parse(lexRaw);

const byLemma = new Map();
for (const w of lex.w) {
  const k = String(w.o).toLowerCase();
  if (!byLemma.has(k)) byLemma.set(k, []);
  byLemma.get(k).push(w);
}
/* Plural-only nouns. ÍNO has *bókmenntir, upplýsingar, tekjur, umbúðir*; BÍN,
   and so this vocabulary, files them under a singular (*bókmennt*). The
   nominative plural is the 9th of a noun's 16 forms. Used only as a fallback,
   when the ÍNO headword is not itself a word of the vocabulary. */
const NOUN = new Set(["kk", "kvk", "hk"]);
const byPlural = new Map();
for (const w of lex.w) {
  if (!NOUN.has(w.c)) continue;
  const forms = String(w.f || "").split(";");
  if (forms.length !== 16) continue;
  for (const f of forms[8].split("|")) {
    const k = f.trim().toLowerCase();
    if (!k) continue;
    if (!byPlural.has(k)) byPlural.set(k, []);
    if (!byPlural.get(k).includes(w)) byPlural.get(k).push(w);
  }
}

console.log(`vocabulary: ${lex.w.length.toLocaleString("is-IS")} words, ${byLemma.size.toLocaleString("is-IS")} distinct lemmas`);

/* ---------- one entry's senses ----------
 *
 * A sense is `{ def, example }` and the two belong together. Sub-senses are
 * senses of their own, read after their parent, so the order is the order a
 * reader of the dictionary would meet them in.
 */
/* v6.9: a definition inside a <SemanticCollocation> or <SemanticIdiomaticity>
   is the meaning of that PHRASE, not of the headword. *dagur*'s first sense is
   `<Definition>sólarhringur</Definition>` followed by the collocation *virkur
   dagur* with its own definition, and the old reader took the collocation's
   ("virkur dagur: venjulegur dagur sem er hvorki frídagur né helgidagur") as
   the meaning of *dagur* — shown under "Á morgun kemur nýr dagur". A phrase's
   definition is now used only when the entry has nothing else at all.
   <VerbPhrase> and <ContextualUsage> are how ÍNO defines verbs and usages of
   the word itself, so those still count as the word's own sense. */
const PHRASE_ONLY = new Set(["SemanticCollocation", "SemanticIdiomaticity"]);

function sensesOf(entryXml, lemma) {
  const out = [], refs = [], phrases = [];
  const walk = (senseXml) => {
    const own = ownPart(senseXml);
    let def = "";
    for (const d of blocks(own, "SemanticDefinition")) {
      const text = isText(d.inner);
      if (!text) continue;
      const owner = phraseAround(own, d.inner);
      if (owner && owner !== lemma && PHRASE_ONLY.has(phraseTag(own, d.inner))) {
        phrases.push({ def: `${owner}: ${text}`, example: null });
        continue;
      }
      def = owner && owner !== lemma ? `${owner}: ${text}` : text;
      break;
    }
    /* No definition, only `<Definition language="isl">bleia</Definition>`:
       ÍNO's one-word pointer to a synonym. Kept, marked, and followed later. */
    let syn = false;
    if (!def) for (const d of blocks(own, "Definition")) {
      const lang = attr(d.head, "language");
      const text = textOf(d.inner);
      if (text && (!lang || /^is/i.test(lang))) { def = text; syn = true; break; }
    }
    let example = "";
    for (const ex of blocks(own, "SenseExample")) {
      example = isText(ex.inner);
      if (example) break;
    }
    if (def) out.push(syn ? { def, example: example || null, syn } : { def, example: example || null });
    /* Nothing but `<feat att="reference" val="isord_8914"/>`: *dyggð* is
       defined at entry 8914 (*dygð*). Followed in the second pass. */
    else { const r = feat(own, "reference"); if (r) refs.push(r); }
    const at = nestedSenseAt(senseXml);
    if (at >= 0) for (const sub of blocks(senseXml.slice(at), "Sense")) walk(sub.inner);
  };
  for (const sense of blocks(entryXml, "Sense")) walk(sense.inner);
  /* A synonym pointer is used only when the entry has no real definition, so
     a word that already had one keeps the one it had. */
  const real = out.filter((s) => !s.syn);
  const result = real.length ? real : out.length ? out : phrases;
  result.refs = refs;
  return result;
}

/** Which phrase element a nested definition sits in, or null. */
function phraseTag(senseXml, defXml) {
  for (const tag of ["VerbPhrase", "SemanticCollocation", "SemanticIdiomaticity", "ContextualUsage"]) {
    for (const p of blocks(senseXml, tag)) if (p.inner.includes(defXml)) return tag;
  }
  return null;
}

/** The phrase a nested definition belongs to, if it is nested at all. */
function phraseAround(senseXml, defXml) {
  for (const tag of ["VerbPhrase", "SemanticCollocation", "SemanticIdiomaticity", "ContextualUsage"]) {
    for (const p of blocks(senseXml, tag)) {
      if (p.inner.includes(defXml)) return isText(p.inner.split("<SemanticDefinition")[0]) || null;
    }
  }
  return null;
}

/* ---------- convert ---------- */

const entries = {};
const rejected = { wrongClass: [], ambiguous: [], noClass: [], collision: [] };
const later = [];
const inoSenses = new Map();           // "lemma|cls" -> senses, for "sjá X" pointers
const byId = new Map();                // "isord_N" -> senses, for reference pointers
const SEE = /^(?:sjá|sbr\.?|=)\s+([^\s,;.]+)\.?$/i;

/* Why a lemma did not get a definition, for the report's `unmatched` list. */
const reasons = new Map();
const why = (lemma, kind, text) => {
  const k = lemma.toLowerCase();
  if (!reasons.has(k)) reasons.set(k, []);
  reasons.get(k).push({ kind, text });
};

/** Other spellings the entry gives for its headword: a second writtenForm in
    <Lemma>, or any feat whose name says "variant". Inflected forms in
    <WordForm> are NOT variants and are not read. */
function variantsOf(entryXml, lemmaBlock, lemma) {
  const out = new Set();
  if (lemmaBlock) for (const m of lemmaBlock.inner.matchAll(/<feat\s+att="writtenForm"\s+val="([^"]*)"/gi)) out.add(decode(m[1]));
  const head = entryXml.split(/<Sense[\s>]/)[0];
  for (const m of head.matchAll(/<feat\s+att="[^"]*variant[^"]*"\s+val="([^"]*)"/gi)) out.add(decode(m[1]));
  return [...out].filter((v) => v && v.toLowerCase() !== lemma.toLowerCase());
}
let seen = 0, used = 0, noDef = 0, outside = 0, noLemma = 0;

for (const entry of blocks(xml, ENTRY)) {
  seen += 1;
  const x = entry.inner;

  /* The lemma lives in <Lemma><feat att="writtenForm" .../></Lemma>, and NOT in
     the entry's own writtenForm feats, of which there are several. */
  const lemmaBlock = [...blocks(x, "Lemma")][0];
  const lemma = lemmaBlock ? feat(lemmaBlock.inner, "writtenForm") : null;
  if (!lemma) { noLemma += 1; continue; }

  const pos = feat(x, "partOfSpeech");
  const gender = feat(x, "grammaticalGender")
    || feat([...blocks(x, "WordForm")][0]?.inner || "", "grammaticalGender");
  const classes = classesOf(pos, gender);
  const cls = classes.join("/") || null;

  const senses = sensesOf(x, lemma);
  if (!senses.length && senses.refs.length) {
    later.push({ via: "ref", lemma, key: lemma, refId: senses.refs[0], classes, pos, senses: null });
    why(lemma, "pointer", `ÍNO only refers to entry ${senses.refs[0]}, which has no definition either`);
    continue;
  }
  if (!senses.length) { noDef += 1; why(lemma, "noDef", "ÍNO has the word but no definition text"); continue; }

  /* A spelling-variant entry whose only "definition" is a pointer — *könguló:
     sjá kónguló* — gets the definition it points to, not the pointer. */
  const key = `${lemma.toLowerCase()}|${cls}`;
  const see = senses.length !== 1 ? null
    : senses[0].syn ? [senses[0].def, senses[0].def] : SEE.exec(senses[0].def);
  if (!see && !inoSenses.has(key)) inoSenses.set(key, senses);
  const entryId = attr(entry.head, "id");
  if (!see && entryId) byId.set(entryId, senses);

  /* Spelling variants ÍNO names in the entry itself (*skrítinn* / *skrýtinn*)
     and the plural-only reading are tried AFTER every entry has had its own
     chance, so they can only fill a gap and never take a word's place. */
  for (const v of variantsOf(x, lemmaBlock, lemma)) later.push({ via: "variant", lemma, key: v, classes, pos, senses });

  if (see) {
    /* If the target has no definition of its own, the synonym itself is the
       best meaning ÍNO gives, and it is used. */
    later.push({ via: "see", lemma, key: lemma, target: see[1], classes, pos,
      senses: null, own: senses[0].syn ? senses.map(({ syn, ...r }) => r) : null });
    why(lemma, "pointer", `ÍNO only says "${senses[0].def}"`);
    continue;
  }

  const candidates = byLemma.get(lemma.toLowerCase()) || [];
  if (!candidates.some((w) => NOUN.has(w.c)) && classes.some((c) => LEX_CLASSES_OF[c]?.some((g) => NOUN.has(g))))
    later.push({ via: "plural", lemma, key: lemma, classes, pos, senses });
  if (!candidates.length) {
    outside += 1;
    if (KEEP_ALL) {
      entries["l:" + lemma.toLowerCase()] = {
        ...flatten(senses), lemma, cls, pos: pos || null,
        senses: senses.slice(0, 8),
      };
    }
    continue;
  }

  /* ---- the class gate ----
   *
   * No word class in ÍNO means no way to tell which reading this is, and the
   * lemma having exactly one reading in OUR vocabulary proves nothing about
   * which reading ÍNO is describing — that is precisely how the pronoun *sá*
   * came to be defined as sowing seed. The entry is dropped and counted.
   *
   * A label that names two classes ("preposition/adverb") is ÍNO saying the
   * one entry covers both, so it is attached to the vocabulary word of each
   * class it names — never to a class it does not name.
   */
  if (!classes.length) {
    rejected.noClass.push({ lemma, pos: pos || null });
    why(lemma, "noClass", `ÍNO's word class "${pos || ""}" is not understood`);
    continue;
  }
  const { picked, ambiguous } = gate(candidates, classes);
  if (!picked.length) {
    if (ambiguous.length) {
      rejected.ambiguous.push({ lemma, ino: cls, lexicon: candidates.map((w) => w.c) });
      why(lemma, "ambiguous", `more than one vocabulary word of class ${ambiguous.join("/")}`);
    } else {
      rejected.wrongClass.push({ lemma, ino: cls, lexicon: candidates.map((w) => w.c) });
      why(lemma, "wrongClass", `ÍNO says ${cls}`);
    }
    continue;
  }

  for (const w of picked) {
    /* Several ÍNO entries can land on one BÍN word (homographs ÍNO splits and
       BÍN does not — two masculine nouns spelled alike). First one wins; ÍNO
       orders its senses by importance. */
    if (entries[String(w.i)]) { rejected.collision.push({ lemma, cls: w.c }); continue; }
    entries[String(w.i)] = entryFor(w, senses, pos, classes);
    used += 1;
  }
}

/* ---------- second chance: spelling variants and plural-only nouns ---------- */

let viaVariant = 0, viaPlural = 0;
for (const f of later) {
  if (f.via === "see") {
    /* The meaning the target word itself was given, if it is one of ours,
       so that *pápi* and *pabbi* say the same thing. */
    const mine = gate(byLemma.get(f.target.toLowerCase()) || [], f.classes).picked
      .map((w) => entries[String(w.i)]).find(Boolean);
    f.senses = mine?.senses || inoSenses.get(`${f.target.toLowerCase()}|${f.classes.join("/")}`) || f.own;
    if (!f.senses) continue;
  }
  if (f.via === "ref") {
    f.senses = byId.get(f.refId);
    if (!f.senses) continue;
  }
  const pool = f.via === "plural"
    ? (byPlural.get(f.key.toLowerCase()) || [])
    : (byLemma.get(f.key.toLowerCase()) || []);
  if (!pool.length) continue;
  const { picked } = gate(pool, f.classes);
  for (const w of picked) {
    if (entries[String(w.i)]) continue;
    entries[String(w.i)] = { ...entryFor(w, f.senses, f.pos, f.classes), via: `${f.via}:${f.lemma}` };
    used += 1;
    if (f.via === "plural") viaPlural += 1; else viaVariant += 1;   // "see" counts as a variant
  }
}

function entryFor(w, senses, pos, classes) {
  return {
    ...flatten(senses),
    lemma: w.o,
    cls: w.c,                       // the LEXICON's class, checked against ÍNO's
    pos: pos || null,
    ...(classes.length > 1 ? { shared: classes } : {}),
    senses: senses.slice(0, 8),
  };
}

/** Which vocabulary words this entry may attach to: one per class ÍNO names,
    and none for a class where the vocabulary has two words of that spelling. */
function gate(candidates, classes) {
  const picked = [], ambiguous = [];
  for (const c of classes) {
    const want = LEX_CLASSES_OF[c] || [];
    const m = candidates.filter((w) => want.includes(w.c));
    if (m.length === 1) { if (!picked.includes(m[0])) picked.push(m[0]); }
    else if (m.length > 1) ambiguous.push(c);
  }
  return { picked, ambiguous };
}

/**
 * The flat `def`/`example` pair the rest of the program reads.
 *
 * The owner: *"the first [definition] should universally be shown … Fallaskóli
 * shows [the second] but gives the example of [the first]"*. Definition and
 * example therefore come from ONE sense, and by default that is the first.
 * `--merkingar N` joins N definitions with " • " for anyone who wants more, and
 * the example still belongs to the sense the first definition came from — the
 * whole list is in `senses` for anything that wants to be cleverer.
 */
function flatten(senses) {
  /* "spurnarfornafn / óákveðið fornafn" is a class label, not a meaning (the
     renderer hides it). When a real sense follows, that one is "the first". */
  const start = Math.max(0, senses.findIndex((s) => !isGrammarGloss(s.def)));
  const use = senses.slice(start);
  const head = use[0];
  const def = use.slice(0, SENSES).map((s) => s.def).join(" • ");
  return { def, example: head.example || null };
}

/* ---------- write it out ---------- */

const payload = {
  name: "Íslensk nútímamálsorðabók",
  source: "ÍNO",
  /* CC BY-SA 4.0, and the attribution Árnastofnun prescribe. It rides along in
     the file so that it cannot be separated from the data. */
  licence: "CC BY-SA 4.0",
  attribution: "Þessi skýring er úr Íslenskri nútímamálsorðabók "
    + "(©Stofnun Árna Magnússonar í íslenskum fræðum — CC BY-SA 4.0).",
  /* The version of THIS tool's output shape. `pipeline/build_bundle.py` refuses to trust
     a file without it, because a file without it is one of the files that could
     hand a pronoun a verb's definition. */
  format: 2,
  senses: SENSES,
  built: new Date().toISOString(),
  from: path.basename(src),
  entries,
};

await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, JSON.stringify(payload));

const sample = (list, n = 12) => list.slice(0, n);

/* Every vocabulary word still without a definition, and why. This is the list
   to read when the program reports words with no meaning. */
const unmatched = [];
for (const w of lex.w) {
  if (entries[String(w.i)]) continue;
  const r = reasons.get(String(w.o).toLowerCase());
  unmatched.push({ lemma: w.o, cls: w.c,
    why: r ? [...new Set(r.map((x) => x.text))].join("; ") : "no ÍNO entry with this headword",
    kind: r ? r[0].kind : "absent" });
}
const unmatchedBy = {};
for (const u of unmatched) unmatchedBy[u.kind] = (unmatchedBy[u.kind] || 0) + 1;
await fs.writeFile(REPORT, JSON.stringify({
  built: payload.built, from: payload.from, format: 2,
  read: seen, matched: used, outside, noDef, noLemma,
  secondChance: { variant: viaVariant, pluralOnly: viaPlural },
  rejected: {
    wrongClass: rejected.wrongClass.length,
    ambiguous: rejected.ambiguous.length,
    noClass: rejected.noClass.length,
    collision: rejected.collision.length,
  },
  examples: {
    wrongClass: sample(rejected.wrongClass),
    ambiguous: sample(rejected.ambiguous),
    noClass: sample(rejected.noClass),
  },
  unmatched: { total: unmatched.length, byKind: unmatchedBy, words: unmatched },
}, null, 1));

const size = (await fs.stat(OUT)).size;
console.log(`
read      ${seen.toLocaleString("is-IS")} entries
matched   ${used.toLocaleString("is-IS")} of the ${lex.w.length.toLocaleString("is-IS")} words the program teaches (${(100 * used / lex.w.length).toFixed(1)}%)
skipped   ${outside.toLocaleString("is-IS")} outside the vocabulary${KEEP_ALL ? " (kept anyway, --allt)" : ""}
          ${rejected.wrongClass.length.toLocaleString("is-IS")} whose word class disagreed with the vocabulary (NOT attached — this is the *sá* / *slá* fault)
          ${rejected.ambiguous.length.toLocaleString("is-IS")} nouns with no gender to tell two readings apart
          ${rejected.noClass.length.toLocaleString("is-IS")} with no word class at all
          ${rejected.collision.length.toLocaleString("is-IS")} second and later entries for a word already defined
          ${noDef.toLocaleString("is-IS")} with no definition text
          ${noLemma.toLocaleString("is-IS")} with no lemma
second    ${viaVariant} by a spelling variant, ${viaPlural} plural-only nouns by their singular
missing   ${unmatched.length} vocabulary words still have no ÍNO definition (listed, with the reason, in the report)

wrote     ${OUT}  (${(size / 1e6).toFixed(1)} MB)
          ${REPORT}  (what was rejected, and why)

Next: upload it on the Gögn tab, or leave it at data/ino.json and run ./build.sh
to bake it into the file the child opens. Both read the same file.`);
