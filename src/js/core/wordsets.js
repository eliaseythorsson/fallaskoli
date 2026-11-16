/* Word sets (v6.6): the collection read for patterns.

   A badge here is not about how MANY words have been found but WHICH: a whole
   family, the four seasons, every word of a saying, a pair of opposites, two
   words that are the same letters in another order. Every word named here is
   checked against the vocabulary by `tests/wordbank.test.js`, so no set can
   ask for a word the program never shows.

   A member is "lemma|class" when the class matters (*vor* the season, not
   *vor* "our") and a bare lemma when any class will do (*að*, *á*, *sem*).  */

/* ---------- 1. Themes: a whole group of words ---------------------------- */

export const THEMES = [
  { id: "fjolskylda", ico: "👨‍👩‍👧‍👦", nm: "Ættarmótið", est: 0.30,
    ds: "Öll fjölskyldan í safninu: móðir, faðir, systir, bróðir, sonur, dóttir, amma og afi",
    words: ["móðir|kvk", "faðir|kk", "systir|kvk", "bróðir|kk", "sonur|kk", "dóttir|kvk", "amma|kvk", "afi|kk"] },
  { id: "arstidir", ico: "🍂", nm: "Árstíðirnar fjórar",
    ds: "Vor, sumar, haust og vetur — allar í safninu", est: 0.33,
    words: ["vor|hk", "sumar|hk", "haust|hk", "vetur|kk"] },
  { id: "frumefni", ico: "🔥", nm: "Frumefnin fjögur",
    ds: "Eldur, vatn, jörð og loft — frumefnin fjögur að fornu", est: 0.30,
    words: ["eldur|kk", "vatn|hk", "jörð|kvk", "loft|hk"] },
  { id: "regnbogi", ico: "🌈", nm: "Regnboginn",
    ds: "Rauður, appelsínugulur, gulur, grænn, blár og fjólublár", est: 0.11,
    words: ["rauður|lo", "appelsínugulur|lo", "gulur|lo", "grænn|lo", "blár|lo", "fjólublár|lo"] },
  { id: "himinn", ico: "🪐", nm: "Himingeimurinn",
    ds: "Sól, tungl, máni, stjarna og jörð", est: 0.12,
    words: ["sól|kvk", "tungl|hk", "máni|kk", "stjarna|kvk", "jörð|kvk"] },
  { id: "sveit", ico: "🐄", nm: "Sveitabærinn",
    ds: "Kýr, kind, hestur, svín, hæna, geit, hundur og köttur", est: 0.10,
    words: ["kýr|kvk", "kind|kvk", "hestur|kk", "svín|hk", "hæna|kvk", "geit|kvk", "hundur|kk", "köttur|kk"] },
  { id: "attir", ico: "🧭", nm: "Áttavitinn",
    ds: "Norður, suður, austur og vestur", est: 0.22,
    words: ["norður", "suður", "austur", "vestur"] },
  { id: "aevintyri", ico: "🐉", nm: "Ævintýraheimurinn",
    ds: "Draugur, tröll, álfur, dreki, risi, norn, einhyrningur og geimvera", est: 0.06,
    words: ["draugur|kk", "tröll|hk", "álfur|kk", "dreki|kk", "risi|kk", "norn|kvk", "einhyrningur|kk", "geimvera|kvk"] },
  { id: "morgunmatur", ico: "🧈", nm: "Morgunverðarborðið",
    ds: "Brauð, smjör, ostur og mjólk", est: 0.25,
    words: ["brauð|hk", "smjör|hk", "ostur|kk", "mjólk|kvk"] },
  { id: "eltingaleikur", ico: "🐭", nm: "Eltingaleikurinn",
    ds: "Hundur, köttur og mús — hver eltir hvern?", est: 0.40,
    words: ["hundur|kk", "köttur|kk", "mús|kvk"] },
];

/* ---------- 2. Semantic classes: many of one kind ------------------------ */

/* `s` on a noun is its meaning class (pipeline/noun_classes.py). */
export const KINDS = [
  { id: "dyr", ico: "🦓", nm: "Dýragarðurinn", ds: "25 dýraheiti í safninu",
    classes: ["animal", "critter"], n: 25, est: 0.28 },
  { id: "matur", ico: "🍲", nm: "Matgæðingurinn", ds: "20 orð um mat og drykk í safninu",
    classes: ["food", "drink"], n: 20, est: 0.30 },
  { id: "likami", ico: "🫀", nm: "Líffærafræðingurinn", ds: "25 orð um líkamann í safninu",
    classes: ["body"], n: 25, est: 0.25 },
  { id: "storf", ico: "👷", nm: "Atvinnumiðlunin", ds: "15 starfsheiti í safninu",
    classes: ["job"], n: 15, est: 0.30 },
  { id: "vedur", ico: "🌦️", nm: "Veðurfræðingurinn", ds: "15 orð um veður og himin í safninu",
    classes: ["weather", "sky"], n: 15, est: 0.30 },
  { id: "folk", ico: "👥", nm: "Mannfjöldinn", ds: "100 orð um fólk í safninu",
    classes: ["person"], n: 100, est: 0.18 },
  { id: "stadir", ico: "🗺️", nm: "Landakortið", ds: "25 orð um staði og byggðir í safninu",
    classes: ["place", "settlement"], n: 25, est: 0.25 },
];

/* ---------- 3. Sayings: every word of a famous sentence ------------------ */

/* Proverbs and sayings everybody knows, and a few famous sentences in their
   Icelandic form. Secret badges: the name says nothing until it is won, and
   then the child can look at the collection and see the sentence in it. The
   words are lemmas — *skapar* is filed under *skapa*, *meistarann* under
   *meistari* — so what is collected is the sentence's words, not its forms. */
export const SAYINGS = [
  { id: "aefing", ico: "🏋️", nm: "Æfingin skapar meistarann", est: 0.22,
    words: ["æfing|kvk", "skapa|so", "meistari|kk"] },
  { id: "krokur", ico: "🪝", nm: "Snemma beygist krókurinn", est: 0.14,
    words: ["snemma", "beygja|so", "krókur|kk"] },
  { id: "allt", ico: "🎬", nm: "Allt er gott sem endar vel", est: 0.28,
    words: ["allur", "vera|so", "góður|lo", "sem", "enda|so", "vel"] },
  { id: "gaefa", ico: "🔨", nm: "Hver er sinnar gæfu smiður", est: 0.10,
    words: ["hver|fn", "vera|so", "sinn|fn", "gæfa|kvk", "smiður|kk"] },
  { id: "gestur", ico: "👁️", nm: "Glöggt er gests augað", est: 0.09,
    words: ["glöggur|lo", "vera|so", "gestur|kk", "auga|hk"] },
  { id: "hlatur", ico: "😂", nm: "Hlátur lengir lífið", est: 0.10,
    words: ["hlátur|kk", "lengja|so", "líf|hk"] },
  { id: "vera", ico: "💀", nm: "Að vera eða vera ekki", est: 0.42,
    words: ["að", "vera|so", "eða", "ekki"] },
  { id: "sesar", ico: "🏛️", nm: "Ég kom, ég sá, ég sigraði", est: 0.22,
    words: ["ég", "koma|so", "sjá|so", "sigra|so"] },
  { id: "descartes", ico: "🤔", nm: "Ég hugsa, þess vegna er ég", est: 0.30,
    words: ["ég", "hugsa|so", "það", "vegna", "vera|so"] },
  { id: "tholinmaedi", ico: "🐢", nm: "Þolinmæði þrautir vinnur allar", est: 0.06,
    words: ["þolinmæði|kvk", "þraut|kvk", "vinna|so", "allur"] },
  { id: "smatt", ico: "🐜", nm: "Margt smátt gerir eitt stórt", est: 0.14,
    words: ["margur|lo", "smár|lo", "gera|so", "einn", "stór|lo"] },
  { id: "epli", ico: "🍎", nm: "Sjaldan fellur eplið langt frá eikinni", est: 0.04,
    words: ["sjaldan", "falla|so", "epli|hk", "langt", "frá", "eik|kvk"] },
  { id: "latur", ico: "🦥", nm: "Á morgun segir sá lati", est: 0.09,
    words: ["á", "morgunn|kk", "segja|so", "sá|fn", "latur|lo"] },
  { id: "rosir", ico: "🌹", nm: "Lífið er ekki dans á rósum", est: 0.08,
    words: ["líf|hk", "vera|so", "ekki", "dans|kk", "á", "rós|kvk"] },
  { id: "haegt", ico: "🛤️", nm: "Kemst þótt hægt fari", est: 0.15,
    words: ["koma|so", "þótt", "hægt", "fara|so"] },
  { id: "neyd", ico: "🧶", nm: "Neyðin kennir naktri konu að spinna", est: 0.03,
    words: ["neyð|kvk", "kenna|so", "nakinn|lo", "kona|kvk", "að", "spinna|so"] },
];

/* ---------- 4. Opposites -------------------------------------------------- */

export const OPPOSITES = [
  ["heitur", "kaldur"], ["ungur", "gamall"], ["góður", "vondur"], ["ljós", "dökkur"],
  ["hár", "lágur"], ["langur", "stuttur"], ["ríkur", "fátækur"], ["sterkur", "veikur"],
  ["fullur", "tómur"], ["léttur", "þungur"], ["glaður", "dapur"], ["mjúkur", "harður"],
  ["blautur", "þurr"], ["hraður", "hægur"], ["ljótur", "fallegur"], ["stór", "lítill"],
].map(([a, b]) => [a + "|lo", b + "|lo"]);

/* ---------- 5. Reading a collection --------------------------------------- */

/** Does the collection hold this member? `keys` is the set of "lemma|cls"
    held, `lemmas` the set of bare lemmas held. */
export const holds = (keys, lemmas, member) =>
  member.includes("|") ? keys.has(member) : lemmas.has(member);

export const holdsAll = (keys, lemmas, words) => words.every((m) => holds(keys, lemmas, m));

const LETTERS = /^\p{L}+$/u;
const sortLetters = (l) => [...l].sort().join("");

/**
 * Everything the set badges ask about, worked out once per answer from the
 * lemmas held. `held` is a list of { lemma, cls, s } (s = meaning class).
 */
export function readSets(held) {
  const keys = new Set(held.map((w) => `${w.lemma}|${w.cls}`));
  const lemmas = new Set(held.map((w) => w.lemma));
  const lower = [...new Set([...lemmas].map((l) => l.toLowerCase()))];

  const themes = THEMES.filter((t) => holdsAll(keys, lemmas, t.words)).map((t) => t.id);
  const sayings = SAYINGS.filter((t) => holdsAll(keys, lemmas, t.words)).map((t) => t.id);
  const opposites = OPPOSITES.filter(([a, b]) => keys.has(a) && keys.has(b)).length;

  const kinds = {};
  held.forEach((w) => { if (w.s) kinds[w.s] = (kinds[w.s] || 0) + 1; });

  /* Two different lemmas, same letters: *fugl* and *flug*, *dalur* and *aldur*. */
  const groups = new Map();
  lower.filter((l) => l.length >= 3 && LETTERS.test(l)).forEach((l) => {
    const k = sortLetters(l);
    groups.set(k, (groups.get(k) || 0) + 1);
  });
  const anagrams = [...groups.values()].filter((n) => n >= 2).length;

  const palindromes = lower.filter((l) => l.length >= 3 && LETTERS.test(l) &&
    l === [...l].reverse().join("")).length;

  /* The same lemma held in more than one word class: *við*, *að*, *vor*. */
  const byLemma = new Map();
  held.forEach((w) => byLemma.set(w.lemma, (byLemma.get(w.lemma) || new Set()).add(w.cls)));
  const twins = [...byLemma.values()].filter((s) => s.size >= 2).length;

  const longest = lower.reduce((m, l) => Math.max(m, [...l].length), 0);
  const tiny = lower.filter((l) => [...l].length <= 2).length;

  const g = { kk: 0, kvk: 0, hk: 0 };
  held.forEach((w) => { if (w.cls in g) g[w.cls]++; });
  const genderBalance = g.kk >= 20 && g.kk === g.kvk && g.kvk === g.hk;

  return { themes, sayings, opposites, kinds, anagrams, palindromes, twins,
           longest, tiny, genderBalance };
}

/** Members of a set that no lexicon entry answers to — the test's question. */
export function missingMembers(lex, words) {
  return words.filter((m) => {
    const [l, c] = m.split("|");
    const list = lex.lemma(l);
    return c ? !list.some((w) => w.c === c) : !list.length;
  });
}
