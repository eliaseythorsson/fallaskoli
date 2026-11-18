/* Sense, not grammar (critique item 30).
 *
 * BÍN makes every generated form correct and nothing makes a generated
 * sentence SENSIBLE: "Ferðin tafðist vegna ævinnar" agrees perfectly. What
 * keeps nonsense out is three hand-made tables — pipeline/noun_classes.py (what a noun
 * means, and which nouns nobody has read), pipeline/adj_classes.py (what an adjective
 * is said of, and which adjectives are not compared) and the `need` of every
 * frame. These tests hold the tables to what they promise, on the real data:
 *
 *   1. the sampler: thousands of questions from fixed seeds, as the text the
 *      pupil ends up reading, searched for outputs that are known to be bad
 *   2. nouns: a noun nobody has read is in no generated sentence
 *   3. helper nouns: an adjective is shown with a noun it is said of
 *   4. comparison: adjectives that are not compared have no comparison forms
 *   5. the frames whose `need` was too wide
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, newSession } from "../src/js/core/state.js";
import { SKILL_IDS } from "../src/js/core/skills.js";
import { tableAdj } from "../src/js/tasks/lysingarord.js";
import { makeView } from "../src/js/tasks/index.js";
import { candidateNouns, substitutable, fillFrame, repeatsNoun } from "../src/js/tasks/frames.js";
import { adjectiveHelperLemma, adjectiveGenders, adjectiveHelperForm } from "../src/js/core/helpers.js";
import { sample, seeded } from "../tools/semantic-sample.mjs";

const lex = buildLexicon(DATA);
const noun = (o) => lex.nouns.find((w) => w.o === o);
const adj = (o) => lex.adjectives.find((w) => w.o === o);
const COMPARISON = /^(MST|ESB|EVB)-/;

/* ================= 1. the sampler ======================================== */

/* Outputs that were produced before v6.13 and must not come back. A string is
   matched anywhere in the text; a RegExp says a whole family (write the word
   boundary as (?<!\p{L}) with the u flag: to \b, *þ* and *ö* are not
   letters, and "gul" is then found inside *þögul*). Add to this
   list whenever a generated sentence makes somebody wince — it is the only
   record there is of what "odd" has meant so far. */
const KNOWN_BAD = [
  /* the four the critique names */
  "vegna ævinnar", "kastölunum úti á landi", "ferskustu börnin", "velkomnastir",
  /* the hand-over's own examples */
  "rangari börn", "breskustu", "dauðari", "breskari",
  /* a time or an idea as the cause of a delay, or as what one cannot do without
     (*sumar* the season, not the *sumarbústaður*, a building — and a building
     may cause a delay: pipeline/noun_classes.py `_CAUSE`) */
  /Ferðin tafðist vegna (ævi|sumar(?!bústað)|vetr|morg|kvöld|vik|mánað|hamingj|framtíð|málsins|málanna|mark)/,
  /Þetta gengur ekki án (sumra|morguns|kvölda|bils|uppnáms|boðs|hverfa|lands|grass|svæðis)(?!\p{L})/u,
  /Ferðin tafðist vegna (nefsins|háranna|fingursins|glassins|herbergisins|síðunnar)/,
  "vegna skugga", "Ferðin féll niður vegna gönguferðarinnar", "Ferðin féll niður vegna ferðalagsins",
  "frá eyrunum", "frá glösunum",
  "frá pylsunni",
  "Haust líða hratt á sumrin",
  /* nouns nobody had read, in the frames that take anything */
  "Toppurinn skiptir", "Upplýsingin skiptir", "Hugurinn skiptir", "eftir áhrifinu",
  "eftir sénsinum", "Þetta er bara réttur", "Þetta er bara forysta",
  /* a helper noun the adjective is not said of */
  /(?<!\p{L})(augljós|möguleg|líkleg|röng|auðveld|einföld|flókin)\p{L}* (kon|mann|menn|maður|barn|börn)/u,
  /(?<!\p{L})(fersk|ljúffeng|gómsæt|súr)\p{L}* (kon|mann|menn|maður|barn|börn)/u,
  /(?<!\p{L})(blá|græn|rauð|gul|hvít|svört|svart)\p{L}* (kon|mann|menn|maður|barn|börn)/u,
  /(?<!\p{L})(hálf|hálfur|hálft|ein|einn|eitt|eini|einu|margt|margur|mörg) (kon|mann|menn|maður|barn|börn)/u,
  "fyllsti maðurinn", "nýjustu mennirnir", "dýrmætustu mennirnir", "eilífari",
  "tilbúnari", "óléttur maður", "ólétt barn", "óléttari", "óléttast",
  /* out of place rather than wrong */
  "Selurinn sofnaði", "þrjár ófreskjur", "Ég fann klárinn", "Ég gleymdi netinu",
  "milli snjóhúss", "án prinsessu", "Pápinn hjálpaði", "Ég hjálpa hana",
];

const hit = (text) => KNOWN_BAD.find((bad) => (typeof bad === "string" ? text.includes(bad) : bad.test(text)));

test("the sampler: no known-bad output in 2,400 generated questions", () => {
  const seen = { cloze: 0, table: 0, analysis: 0 };
  const bad = [];
  for (const seed of [1, 2, 3, 7, 30, 2026]) {
    for (const q of sample(400, seed)) {
      seen[q.kind] += 1;
      const b = hit(q.text);
      if (b) bad.push(`seed ${seed} ${q.id}: «${q.text}»  (${b})`);
    }
  }
  assert.deepEqual(bad, []);
  /* the sample really is of all three kinds */
  assert.ok(seen.cloze >= 1000 && seen.table >= 500 && seen.analysis >= 500, JSON.stringify(seen));
});

test("the sampler is seeded: a seed names the same questions every time", () => {
  const a = sample(40, 11).map((q) => q.text);
  const b = sample(40, 11).map((q) => q.text);
  const c = sample(40, 12).map((q) => q.text);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test("the list of known-bad outputs would catch the sentences it was written for", () => {
  for (const s of ["Ferðin tafðist vegna ævinnar.", "Ég sagði frá kastölunum úti á landi.",
    "ferskustu börnin, ferskustu börnin", "velkomnastir menn, velkomnasta menn",
    "Þetta gengur ekki án sumra.", "augljósa konan, augljósu konuna", "blá börn, blá börn",
    "hálf kona, hálfa konu"]) {
    assert.ok(hit(s), s);
  }
  /* … and lets the good ones through */
  for (const s of ["Ferðin tafðist vegna rigningarinnar.", "ferskustu eplin", "augljósa leiðin",
    "góð kona, góða konu", "Þetta gengur ekki án hjálpar.", "einföld svör"]) {
    assert.equal(hit(s), undefined, s);
  }
});

/* ================= 2. nouns ============================================== */

test("a noun nobody has read is not put into a frame", () => {
  /* The hand-over's examples of unclassified nouns, and the critique's. */
  for (const o of ["ævi", "toppur", "botn", "blettur", "hrúga", "klessa", "hluti", "fjöldi",
    "tegund", "helmingur", "gaman", "alvara", "áhrif", "viðskipti", "mál", "gat", "bil"]) {
    const w = noun(o);
    assert.ok(w, `${o} is in the vocabulary`);
    assert.equal(w.nx, 1, `${o} may be put into a generated sentence`);
    /* it keeps its paradigm: the table and the bare analysis still have it */
    assert.ok(Object.keys(w.forms).length >= 4, o);
  }
});

test("the abstract nouns that were read are used, and the frames have plenty of them", () => {
  for (const o of ["hugmynd", "vinátta", "leyfi", "svefn", "misskilningur", "framtíð", "sannleikur"]) {
    const w = noun(o);
    assert.equal(w.s, "abstract", o);
    assert.ok(!w.nx, `${o} is not used in frames`);
  }
  const usable = lex.nouns.filter((w) => w.s === "abstract" && !w.nx).length;
  assert.ok(usable >= 700, `${usable} abstract nouns are used in frames`);
});

test("out of place: the film's cast and its buildings stay out of the frames", () => {
  for (const o of ["kastali", "snjóhús", "lávarður", "sjóræningi", "uppvakningur", "ófreskja",
    "prinsessa", "geimskip", "aftursæti", "klár", "hani"]) {
    assert.equal(noun(o).nx, 1, o);
  }
  /* everyday words of the same classes are untouched */
  for (const o of ["kennari", "skóli", "kirkja", "hundur", "bíll", "lykill", "amma"]) {
    assert.ok(!noun(o).nx, o);
  }
});

test("wild animals are seen and talked about; they do not sleep in the car", () => {
  for (const o of ["selur", "ljón", "fíll", "gíraffi", "ísbjörn"]) assert.equal(noun(o).s, "critter", o);
  for (const o of ["hundur", "köttur", "hestur", "kind", "kýr"]) assert.equal(noun(o).s, "animal", o);
  const frame = lex.sentences.find((s) => s.t === "Barnið sofnaði í bílnum.");
  assert.ok(frame && substitutable(frame));
  const pool = candidateNouns(lex, frame).map((w) => w.o);
  assert.ok(pool.includes("hundur"));
  assert.ok(!pool.includes("selur") && !pool.includes("ljón"));
});

test("no frame offers a noun that is excluded, and every frame still has nouns", () => {
  let frames = 0;
  for (const s of lex.sentences) {
    if (!substitutable(s)) continue;
    frames += 1;
    const pool = candidateNouns(lex, s);
    assert.ok(pool.length > 0, `no noun fits: ${s.t}`);
    assert.ok(pool.every((w) => !w.nx), s.t);
  }
  assert.ok(frames > 300, `${frames} frames`);
});

/* ================= 3. helper nouns ======================================= */

test("an adjective is shown with a noun it is said of", () => {
  const three = (o) => ["KK", "KVK", "HK"].map((k) => adjectiveHelperLemma(adj(o), k));
  assert.deepEqual(three("ferskur"), ["ávöxtur", "appelsína", "epli"]);
  assert.deepEqual(three("augljós"), ["kostur", "leið", "svar"]);
  assert.deepEqual(three("rauður"), ["bíll", "bók", "hús"]);
  assert.deepEqual(three("skemmtilegur"), ["dagur", "ferð", "kvöld"]);
  assert.deepEqual(three("glaður"), ["maður", "kona", "barn"]);
  assert.deepEqual(three("fullur"), ["bolli", "flaska", "glas"]);
  /* quantity words, and what nobody has found three nouns for: none */
  for (const o of ["hálfur", "einn", "margur", "eigin", "mikill"]) assert.deepEqual(three(o), [null, null, null], o);
});

test("every helper noun is in the vocabulary with all its forms", () => {
  const MARKS = ["NF", "ÞF", "ÞGF", "EF"].flatMap((c) => ["ET", "FT"].flatMap((n) => [`${c}${n}`, `${c}${n}gr`]));
  let withHelper = 0;
  for (const a of lex.adjectives) {
    if (!a.h) continue;
    withHelper += 1;
    assert.equal(String(a.h).split("/").length, 3, `${a.o}: ${a.h}`);
    for (const k of adjectiveGenders(a)) {
      for (const m of MARKS) {
        assert.ok(adjectiveHelperForm(lex, a, k, m), `${a.o}: no ${k} helper in ${m} (${a.h})`);
      }
    }
  }
  assert.ok(withHelper > 500, `${withHelper} adjectives have a helper noun`);
});

function tableOf(o, seed, diff = 5) {
  const S = blankState();
  SKILL_IDS.forEach((id) => { S.enabled[id] = true; });
  const sess = newSession(S);
  SKILL_IDS.forEach((id) => { sess.diff[id] = diff; });
  const b = tableAdj(lex, makeView({ S, sess, drillWord: adj(o) }), seeded(seed));
  return b ? b.task : null;
}

test("the table: the helper is the adjective's own, in the cell's own case and number", () => {
  for (let seed = 1; seed <= 40; seed++) {
    const t = tableOf("ferskur", seed);
    assert.ok(t, "a table for ferskur");
    const [, kyn] = /^[A-Z]+-(KK|KVK|HK)-/.exec(t.cells[0].m);
    const lemma = adjectiveHelperLemma(adj("ferskur"), kyn);
    const entry = lex.lookup(lemma, kyn.toLowerCase());
    for (const c of t.cells) {
      /* Owner feedback 6.14: the strong superlative stands alone (*hann er
         stærstur*), never before a noun. */
      if (c.m.startsWith("ESB-")) { assert.equal(c.helper, null, `${c.m} has no helper`); continue; }
      assert.ok(c.helper, `${c.m} has a helper`);
      assert.ok(Object.values(entry.forms).some((ff) => ff.includes(c.helper)), `${c.helper} is a form of ${lemma}`);
    }
    assert.ok(!/barn|börn|mað|menn|mann|kon|kven/.test(t.cells.map((c) => c.helper).join(" ")), t.sample);
  }
});

test("the table: an adjective said of one gender only is asked in that gender", () => {
  assert.deepEqual(adjectiveGenders(adj("óléttur")), ["KVK"]);
  assert.deepEqual(adjectiveGenders(adj("glaður")), ["KK", "KVK", "HK"]);
  assert.deepEqual(adjectiveGenders(adj("hálfur")), ["KK", "KVK", "HK"], "no helper: any gender, shown bare");
  for (let seed = 1; seed <= 40; seed++) {
    const t = tableOf("óléttur", seed);
    assert.ok(t);
    assert.ok(t.cells.every((c) => /-KVK-/.test(c.m)), t.title);
    assert.ok(t.cells.every((c) => /^kon|^kven/.test(c.helper)), t.sample);
  }
});

test("the table: an adjective with no helper noun is shown on its own", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const t = tableOf("hálfur", seed);
    assert.ok(t);
    assert.ok(t.cells.length >= 4);
    assert.ok(t.cells.every((c) => c.helper === null), JSON.stringify(t.cells));
    assert.equal(t.sample, null);
  }
});

/* ================= 4. comparison ========================================= */

test("adjectives that are not compared have no comparison forms at all", () => {
  for (const o of ["velkominn", "dauður", "óléttur", "ófrískur", "tilbúinn", "ómeiddur", "nakinn",
    "breskur", "íslenskur", "bandarískur", "eilífur", "mögulegur", "einn", "heill",
    "daglegur", "opinber", "ískaldur", "appelsínugulur", "fjólublár"]) {
    const a = adj(o);
    assert.ok(a, o);
    const marks = Object.keys(a.forms);
    assert.deepEqual(marks.filter((m) => COMPARISON.test(m)), [], `${o} is compared`);
    /* the positive degree is whole: strong and weak, three genders, two numbers */
    assert.equal(marks.filter((m) => /^FSB-/.test(m)).length, 24, o);
    assert.equal(marks.filter((m) => /^FVB-/.test(m)).length, 24, o);
  }
});

test("… and the adjectives that are compared still are", () => {
  for (const o of ["stór", "góður", "rauður", "svartur", "fallegur", "ferskur", "rangur", "fullkominn",
    "skemmtilegur", "glaður"]) {
    const marks = Object.keys(adj(o).forms);
    assert.equal(marks.filter((m) => /^MST-/.test(m)).length, 24, `${o}: miðstig`);
    assert.equal(marks.filter((m) => /^ESB-/.test(m)).length, 24, `${o}: efsta stig, sterk`);
    assert.equal(marks.filter((m) => /^EVB-/.test(m)).length, 24, `${o}: efsta stig, veik`);
  }
  const compared = lex.adjectives.filter((a) => a.forms["MST-KK-NFET"]).length;
  assert.ok(compared > 650, `${compared} adjectives are compared`);
});

test("no bank sentence uses a comparison form that was taken out", () => {
  for (const s of lex.sentences) {
    for (const t of s.tok) {
      if (t.c !== "lýsingarorð" || !t.m || !COMPARISON.test(t.m)) continue;
      const a = adj(t.l);
      if (a) assert.ok(a.forms[t.m], `«${t.w}» (${t.l}, ${t.m}) in: ${s.t}`);
    }
  }
});

test("no comparison table is built for an adjective that is not compared", () => {
  for (const o of ["velkominn", "dauður", "breskur", "tilbúinn"]) {
    for (let seed = 1; seed <= 30; seed++) {
      const t = tableOf(o, seed, 7);
      assert.ok(t, o);
      assert.ok(t.cells.every((c) => /^(FSB|FVB)-/.test(c.m)), `${o}: ${t.title}`);
    }
  }
});

/* ================= 5. needs that were too wide =========================== */

test("after vegna: what holds up a trip — not a time, a nose, a glass or an idea", () => {
  for (const text of ["Ferðin tafðist vegna bílsins.", "Ferðin tafðist vegna bílanna."]) {
    const s = lex.sentences.find((x) => x.t === text);
    assert.ok(s && substitutable(s), text);
    for (const c of ["time", "abstract", "body", "room", "object", "furniture"]) assert.ok(!s.need.includes(c), `${text} takes ${c}`);
    for (const c of ["weather", "event", "vehicle", "person", "struct", "nature"]) assert.ok(s.need.includes(c), `${text} lacks ${c}`);
    const m = s.tok[s.slot].m;
    const made = candidateNouns(lex, s).map((w) => fillFrame({ s, i: s.slot }, w, w.forms[m][0]).t);
    assert.ok(made.includes(text.replace(/bíl\p{L}+/u, lex.lookup("kennari", "kk").forms[m][0])));
    assert.ok(/FT/.test(m) || made.includes(text.replace(/bíl\p{L}+/u, lex.lookup("rigning", "kvk").forms[m][0])));
    assert.ok(!made.some((t) => /ævinnar|sumarsins|vikunnar|hamingjunnar|framtíðarinnar|vetranna|nefsins|glassins/.test(t)));
  }
});

test("after án: no times or places; what matters MOST, never changes, comes and goes: not furniture", () => {
  const need = (text) => lex.sentences.find((x) => x.t === text).need;
  for (const text of ["Þetta gengur ekki án bíls.", "Þetta gengur ekki án bíla."]) {
    for (const c of ["time", "place", "settlement", "nature", "plant"]) assert.ok(!need(text).includes(c), `${text} takes ${c}`);
    for (const c of ["person", "object", "abstract", "food", "substance", "room"]) assert.ok(need(text).includes(c), `${text} lacks ${c}`);
  }
  for (const c of ["body", "furniture", "struct", "critter", "object", "room"]) {
    assert.ok(!need("Hamingjan skiptir mestu máli.").includes(c), `skiptir mestu máli takes ${c}`);
  }
  for (const c of ["abstract", "person", "event", "weather"]) {
    assert.ok(need("Hamingjan skiptir mestu máli.").includes(c), `skiptir mestu máli lacks ${c}`);
  }
  for (const c of ["object", "food", "furniture", "clothing", "abstract", "event"]) {
    assert.ok(!need("Kennarinn breytist aldrei.").includes(c), `breytist aldrei takes ${c}`);
  }
  for (const c of ["building", "room", "struct", "furniture", "body"]) {
    assert.ok(!need("Hugmyndir koma og fara.").includes(c), `koma og fara takes ${c}`);
  }
  for (const text of ["Ég sagði frá ferðinni.", "Mamma sagði mér frá ferðinni í gærkvöldi.",
    "Ég sagði frá bókunum í gær.", "Ég sagði frá kennurunum í gær."]) {
    for (const c of ["body", "food", "object", "furniture", "substance"]) assert.ok(!need(text).includes(c), `${text} takes ${c}`);
    for (const c of ["person", "event", "abstract", "book"]) assert.ok(need(text).includes(c), `${text} lacks ${c}`);
  }
  /* seasons do not pass quickly in summer: the sentence keeps its own noun */
  const dagar = lex.sentences.find((x) => x.t === "Dagar líða hratt á sumrin.");
  assert.ok(dagar && !substitutable(dagar));
});

test("a compound of a noun the sentence already has counts as a repeat", () => {
  const s = lex.sentences.find((x) => x.t === "Ferðin féll niður vegna veðursins.");
  assert.ok(s && substitutable(s));
  const pool = candidateNouns(lex, s).map((w) => w.o);
  assert.ok(pool.includes("veisla") && pool.includes("rigning"));
  for (const o of ["ferð", "gönguferð", "ferðalag", "brúðkaupsferð"]) assert.ok(!pool.includes(o), o);
  /* short stems are not looked for: *ár* in *árbók*, *bók* in *bókasafn* */
  assert.equal(repeatsNoun({ tok: [{ c: "nafnorð", l: "bók" }, { c: "nafnorð", l: "x" }] }, 1, { o: "bókasafn" }), false);
  assert.equal(repeatsNoun({ tok: [{ c: "nafnorð", l: "skóli" }, { c: "nafnorð", l: "x" }] }, 1, { o: "háskóli" }), true);
});
