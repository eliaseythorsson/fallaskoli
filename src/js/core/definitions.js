/* Word definitions.
 *
 * The dictionary is Íslensk nútímamálsorðabók (ÍNO), converted once by
 * `tools/ino.mjs` and joined onto the vocabulary on bin_id, so *ljós* the noun
 * and *ljós* the adjective have their own entries. This module is the data set
 * as the program sees it: out of the bundle, or out of a web request with the
 * same shape on a server.
 *
 * For a function word ÍNO gives the grammatical class instead of a meaning
 * ("óákveðið fornafn" for *allur*) — which is also the answer to the analysis
 * question. `isGrammarGloss` tells a class label from a meaning, and
 * `presentable` hides the label, or the grammatical bracket an entry opens
 * with ("(1. persóna eintala) …"), while the class is what is being asked. */

/* What counts as a grammatical gloss: the WHOLE string is a class label. A
 * definition that merely contains a grammatical word is still a definition. */
const CLASS_NAMES = [
  "nafnorð", "lýsingarorð", "sagnorð", "sögn", "fornafn", "fornöfn", "greinir",
  "töluorð", "atviksorð", "forsetning", "samtenging", "upphrópun",
  "nafnháttarmerki", "raðtala", "frumtala", "hjálparsögn", "orðflokkur",
];

/* Modifiers that turn a class name into a subtype and nothing else. */
const CLASS_MODIFIERS = [
  "óákveðið", "óákveðin", "óákveðinn", "ákveðinn", "ákveðið", "laus", "laust",
  "afturbeygt", "afturbeygð", "afturbeygður", "persónulegt", "ópersónulegt",
  "persónu", "eignar", "ábendingar", "spurnar", "tilvísunar", "gagnverkandi",
  "viðskeyttur", "sterkt", "veikt", "beygjanlegt", "óbeygjanlegt",
];

const norm = (s) => String(s || "").toLowerCase()
  .replace(/[.,;:!?()[\]«»"'`´]/g, " ")
  .replace(/\s+/g, " ")
  .trim();

/** Is this one word a class name, on its own or compounded with a modifier? */
const isClassWord = (w) =>
  CLASS_NAMES.includes(w) ||
  CLASS_NAMES.some((c) => c.length >= 6 && w.endsWith(c) &&
    CLASS_MODIFIERS.some((m) => w.startsWith(m)));

/**
 * How many words at the front of `words` form a class label, or 0.
 * "óákveðið fornafn" -> 2, "samtenging" -> 1, "stórt húsdýr" -> 0.
 */
function classLeadLength(words, loose = false) {
  for (let n = Math.min(3, words.length); n >= 1; n--) {
    if (!isClassWord(words[n - 1])) continue;
    /* Strict: everything before the class word must be a known modifier.
       Loose: anything may come before it (ÍNO qualifies its labels in ways no
       list keeps up with). Loose is only used to take a label OFF the front. */
    if (loose || words.slice(0, n - 1).every((w) => CLASS_MODIFIERS.includes(w))) return n;
  }
  return 0;
}

/**
 * Is this "definition" nothing but the word's grammatical class?
 *
 * `isGrammarGloss("óákveðið fornafn")` -> true
 * `isGrammarGloss("orð sem stendur í stað nafnorðs")` -> false
 */
export function isGrammarGloss(def) {
  /* "spurnarfornafn / óákveðið fornafn" (ÍNO's *hver*) is two labels. */
  const parts = String(def || "").split(/\s*[\/;]\s*|\s+eða\s+/).filter((p) => p.trim());
  if (parts.length > 1) return parts.every((p) => isGrammarGloss(p));
  const t = norm(def);
  if (!t) return false;
  const words = t.split(" ").filter(Boolean);
  return words.length > 0 && words.length <= 3 &&
    classLeadLength(words) === words.length;
}

/**
 * Take a class label off the FRONT of a definition, leaving whatever the
 * dictionary went on to say ("ábendingarfornafn; bendir á þann sem …" ->
 * "bendir á þann sem …"). Returns "" when there was nothing else. Three
 * shapes: a leading bracket that opens with a label, a label followed by
 * punctuation, and a label followed by a space.
 */
export function stripClassLead(def) {
  const s = String(def || "").trim();
  if (!s) return "";

  /* A whole bracket whose contents begin with a class label is a grammatical
     preamble; cutting inside it would leave an unbalanced one behind. */
  const br = /^\(([^)]{1,300})\)\s*(.+)$/s.exec(s);
  if (br && classLeadLength(norm(br[1]).split(" ").filter(Boolean), true) > 0) {
    return br[2].trim();
  }

  /* Otherwise: count the label in the normalised text, then cut the SAME number
     of words off the original, so punctuation and case are not disturbed. */
  const lead = classLeadLength(norm(s).split(" ").filter(Boolean), true);
  if (!lead) return s;
  let at = 0, seen = 0;
  while (seen < lead && at < s.length) {
    while (at < s.length && /[\s]/.test(s[at])) at += 1;
    while (at < s.length && !/[\s]/.test(s[at])) at += 1;
    seen += 1;
  }
  return s.slice(at).replace(/^[\s;,:.–—-]+/, "").trim();
}

/* Grammatical vocabulary that may open a definition in brackets. These are
   exactly the features "Greindu beygðu myndina" asks about, which is why they
   have to go while it is asking. One word per match, so the ordinal in
   "1. persóna eintala" is a token like any other. */
const GRAMMAR_WORD = new RegExp("^(?:" + [
  "\\d+\\.?",
  "persón[au]r?", "eintala", "eintölu", "fleirtala", "fleirtölu",
  "karlkyns?", "kvenkyns?", "hvorugkyns?",
  "nefnifalli?s?", "þolfalli?s?", "þágufalli?s?", "eignarfalli?s?",
  "nútíða?r?", "þátíða?r?", "germyndar?", "miðmyndar?",
  "frumstigs?", "miðstigs?", "efsta", "stigs?",
  "sterk\\p{L}*", "veik\\p{L}*", "beygingu?", "beygð?", "beygt",
  "greini", "greinis", "greinir", "með", "án", "og", "eða", "í", "&",
].join("|") + ")$", "iu");

/**
 * Take off a leading bracket that says only what the mark already says.
 * `"(1. persóna eintala) sá eða sú sem talar"` -> `"sá eða sú sem talar"`.
 * A bracket carrying anything else is left alone — it is content:
 * `"(um veður) bjartur og hlýr"` keeps its bracket, because *um veður* is part
 * of the meaning and taking it away would change what the definition claims.
 */
export function stripGrammarLead(def) {
  const s = String(def || "");
  const m = /^\s*\(([^)]{1,60})\)\s*(.+)$/s.exec(s);
  if (!m) return s;
  const words = m[1].split(/[\s,;]+/).filter(Boolean);
  if (!words.length || !words.every((w) => GRAMMAR_WORD.test(w))) return s;
  return m[2].trim();
}

/**
 * The definition to put on the screen for this word, given what is being asked.
 *
 * @param {object}  d            what a source answered: { def, example, source }
 * @param {boolean} hideGrammar  true while the word's CLASS is the question
 * @returns {?object} `{ def, example, source, grammar }` or null when there is
 *   nothing showable. `grammar` marks a definition that is only a class label,
 *   so the renderer can label it as such rather than as a meaning.
 */
export function presentable(d, { hideGrammar = false } = {}) {
  if (!d || !d.def) return null;
  const grammar = isGrammarGloss(d.def);
  if (!hideGrammar) return { ...d, def: d.def, grammar };
  /* The grammatical bracket first ("(1. persóna eintala) …"), then the class
     label at the head of what is left. Nothing showable afterwards means the
     whole entry was the answer, and the box says "skýring ekki komin" — which
     is true, in the only sense that matters while the question is open. */
  const def = stripClassLead(stripGrammarLead(d.def));
  if (!def) return null;
  return { ...d, def, grammar };
}

/* ---------- the sources ------------------------------------------------- */

/** Where a bundled definition came from, named the way the child sees it. */
const SOURCE_NAME = { ino: "ÍNO", hand: "handskrifað" };

/**
 * A definition that shipped inside the bundle. `entry.ds` records which
 * source filled it in (ÍNO or the hand-written table).
 */
export function bundledSource() {
  return {
    name: "bundled",
    get(entry) {
      if (!entry || !entry.d) return null;
      return {
        def: entry.d,
        example: entry.x || null,
        source: SOURCE_NAME[entry.ds] || "handskrifað",
      };
    },
  };
}

/**
 * A server-side source, keyed on `bin_id` so that homographs get their own
 * definitions; lemma and class travel along only as a fallback.
 *
 *   GET {base}/definitions?bin_id=7181&lemma=hommi&cls=kk
 *   -> { def, example, source }   or 404
 */
export function remoteSource(base, { fetchImpl = globalThis.fetch } = {}) {
  const cache = new Map();
  return {
    name: "remote",
    async get(entry) {
      if (!entry) return null;
      const key = String(entry.i ?? entry.o) + "|" + (entry.c || "");
      if (cache.has(key)) return cache.get(key);
      try {
        const q = new URLSearchParams({
          bin_id: String(entry.i ?? ""), lemma: entry.o, cls: entry.c || "",
        });
        const r = await fetchImpl(`${base}/definitions?${q}`);
        const v = r.ok ? await r.json() : null;
        cache.set(key, v);
        return v;
      } catch {
        cache.set(key, null);
        return null;
      }
    },
  };
}

/**
 * The sources in order: the first one that answers wins. On a server the order
 * becomes [remote, bundled] — ÍNO first, hand-written as the fallback.
 */
export function createDefinitions(sources) {
  const list = [].concat(sources).filter(Boolean);
  return {
    sources: list.map((s) => s.name),
    /** Synchronous lookup — only sources that answer without a web request. */
    getSync(entry) {
      for (const s of list) {
        if (s.name === "remote") continue;
        const v = s.get(entry);
        if (v && typeof v.then !== "function") return v;
      }
      return null;
    },
    async get(entry) {
      for (const s of list) {
        const v = await s.get(entry);
        if (v) return v;
      }
      return null;
    },
    /** How many words in the corpus have a definition from the bundle. */
    coverage(lex) {
      const total = lex.all.length;
      const have = lex.all.filter((w) => w.d).length;
      return { have, total, pct: total ? have / total : 0 };
    },
  };
}
