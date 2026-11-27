/* Syllables on the Orðakort (issue #15, core/syllables.js).
 *
 *   1. the rule (Ritreglur §33): inside a part every syllable after the
 *      first begins with its vowel; au, ei, ey are one sound;
 *   2. joints are marked by hand, and the rule alone is wrong without them;
 *   3. a word that is not on the checked list has no syllables;
 *   4. every line of the list is a LÍNO-2 word of the lexicon and well formed.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { learningCandidates } from "../src/js/core/wordknowledge.js";
import { syllabify, syllableCount, syllablesOf, syllableWords } from "../src/js/core/syllables.js";
import { SYLLABLE_LIST } from "../src/js/content/syllables.js";

const lex = buildLexicon(DATA);
const split = (marked) => syllabify(marked).join("-");

test("the rule: a syllable after the first begins with its vowel", () => {
  /* The examples of the spelling rules themselves (§33.2.1). */
  assert.equal(split("hundarnir"), "hund-arn-ir");
  assert.equal(split("vænstur"), "vænst-ur");
  assert.equal(split("mannsins"), "manns-ins");
  assert.equal(split("skipun"), "skip-un");
  /* Clusters stay with the vowel before them; j is a consonant. */
  for (const [w, want] of [["hestur", "hest-ur"], ["kennari", "kenn-ar-i"], ["stúlka", "stúlk-a"],
    ["tengja", "tengj-a"], ["byrjun", "byrj-un"], ["samningur", "samn-ing-ur"], ["manneskja", "mann-eskj-a"],
    ["fræðsla", "fræðsl-a"], ["aldraður", "aldr-að-ur"], ["jeppi", "jepp-i"], ["héðan", "héð-an"]])
    assert.equal(split(w), want);
  /* One syllable. */
  for (const w of ["þjóð", "starf", "skýrt", "frjáls", "hve"]) assert.deepEqual(syllabify(w), [w]);
});

test("au, ei and ey are one vowel sound; other vowels side by side are two syllables", () => {
  for (const [w, want] of [["auka", "auk-a"], ["einnig", "einn-ig"], ["heyra", "heyr-a"], ["eyja", "eyj-a"],
    ["sauður", "sauð-ur"], ["leysa", "leys-a"], ["þróun", "þró-un"], ["búa", "bú-a"], ["níu", "ní-u"],
    ["sjóinn", "sjó-inn"], ["Asía", "As-í-a"]])
    assert.equal(split(w), want);
  assert.equal(syllableCount("einstaklingur"), 4);
  assert.equal(syllableCount("þróun"), 2);
  assert.equal(syllableCount("ein+stak+lingur"), 4, "the marks do not count");
});

test("a joint is where the word is divided first (compounds, prefixes, suffixes felt as a unit)", () => {
  /* Again the spelling rules' own examples (§33.1). */
  for (const [w, want] of [["borð+dúkar", "borð-dúk-ar"], ["for+maður", "for-mað-ur"], ["gatna+mót", "gatn-a-mót"],
    ["sann+leikur", "sann-leik-ur"], ["list+rænn", "list-rænn"], ["strák+lingur", "strák-ling-ur"],
    ["á+stríða", "á-stríð-a"], ["í+hlut+un", "í-hlut-un"], ["ó+lán", "ó-lán"], ["krókó+díll", "krók-ó-díll"]])
    assert.equal(split(w), want);
  for (const [w, want] of [["á+hrif", "á-hrif"], ["mikil+vægur", "mik-il-væg-ur"], ["ein+stak+lingur", "ein-stak-ling-ur"],
    ["sér+stak+lega", "sér-stak-leg-a"], ["á+ætlun", "á-ætl-un"], ["fé+lags+legur", "fé-lags-leg-ur"],
    ["yfir+leitt", "yf-ir-leitt"], ["at+huga+semd", "at-hug-a-semd"], ["per+sóna", "per-són-a"],
    ["heimilis+læknir", "heim-il-is-lækn-ir"], ["Ís+land", "Ís-land"], ["ó+á+nægja", "ó-á-nægj-a"]])
    assert.equal(split(w), want);
});

test("without its joints the rule is wrong, which is why they are never guessed", () => {
  assert.equal(split("áhrif"), "áhr-if");
  assert.equal(split("mikilvægur"), "mik-ilv-æg-ur");
  assert.equal(split("persóna"), "pers-ón-a");
  /* … and no list of prefixes can do it: sam+vinna, but samn-ing-ur. */
  assert.equal(syllablesOf("samvinna").join("-"), "sam-vinn-a");
  assert.equal(syllablesOf("samningur").join("-"), "samn-ing-ur");
  /* So the card shows the list's division, and nothing for a word not on it. */
  assert.deepEqual(syllablesOf("áhrif"), ["á", "hrif"]);
  assert.deepEqual(syllablesOf("einstaklingur"), ["ein", "stak", "ling", "ur"]);
  assert.equal(syllablesOf("óþekktarorð"), null);
  /* Left out on purpose: no one obvious division. */
  for (const w of ["hversu", "notkun", "skráning", "tíðni", "tækni", "virkni"]) assert.equal(syllablesOf(w), null, w);
});

test("every line of the checked list is a LÍNO-2 word of the lexicon, well formed", () => {
  const marked = SYLLABLE_LIST.split(/\s+/).filter(Boolean);
  const words = syllableWords();
  assert.equal(new Set(words).size, marked.length, "a word is on the list twice");
  assert.ok(words.length >= 300);
  for (const m of marked) {
    const lemma = m.replace(/\+/g, "");
    assert.match(m, /^\p{Ll}+(\+\p{Ll}+)*$/u, `${m}: only letters and single joints`);
    assert.ok(lex.lemma(lemma).some((w) => typeof w.lino === "number"), `${lemma} is not a LÍNO-2 word of the lexicon`);
    const s = syllabify(m);
    assert.equal(s.join(""), lemma, `${m}: the syllables must spell the word`);
    assert.equal(s.length, syllableCount(lemma), `${m}: one vowel sound per syllable`);
    /* every part between joints has a vowel (a joint never cuts off bare consonants) */
    for (const part of m.split("+")) assert.ok(syllableCount(part) >= 1, `${m}: the part "${part}" has no vowel`);
    /* an h inside a native word stands at the head of a part: it is a joint */
    for (const part of m.split("+")) assert.ok(!/.h/.test(part), `${m}: an h inside "${part}" — a joint is missing`);
  }
});

test("the first words a pupil gets all have their syllables", () => {
  for (const level of [1, 3, 5]) {
    for (const w of learningCandidates({}, lex, level).slice(0, 6))
      assert.ok(syllablesOf(w.o), `${w.o} (þyngd ${level}) has no syllables`);
  }
});
