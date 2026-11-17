/* Orðaforði.

     meaning      "Hvað þýðir orðið?" in your own words — no right or wrong.
                  In a session it is an optional bonus after the graded
                  questions (ui/render-more.js), not a question of its own;
                  it still comes in a rescue drill.
     or_heiti     synonym or antonym, four options
     or_samhengi  the one noun of four that makes sense in the sentence
     or_myndun    word formation: ó-, -ari/-andi, -ing/-un, -lega, -ni
     or_utundan   the odd one out

   Which word comes up, and how long it then waits, is core/spacing.js; the
   window of rarity per band is `pickVocab` in tasks/shared.js. Marking a word
   as asked is an effect: it happens when the question is shown. */

import { EX } from "../../../data/exercises.js";
import { wordKey } from "../core/state.js";
import { chooseWord, historyIfAsked } from "../core/spacing.js";
import { isGrammarGloss } from "../core/definitions.js";
import { built, FX } from "./effects.js";
import { pick, wpick, shuffle, bandFor, levelFor, cap1, textSentence, pickVocab, nearBand, RANK_CAP, CLASS_RANK_CAP,
         classRankLevel } from "./shared.js";

/* ================= Word meaning ========================================== */

/* core/spacing.js decides which word may come up: a hard wait after each
   showing and new words first. Words met this session get priority WITHIN
   what is eligible; nothing eligible means null and another type steps in. */
/**
 * Which words the vocabulary question may be asked about: those with a
 * definition that is a meaning, not a class label ("óákveðið fornafn" for
 * *allur* would print the analysis answer). Same rule as `defBox`.
 */
export const meaningPool = (words) =>
  words.filter((x) => x.d && !isGrammarGloss(x.d));

export function taskMeaning(lex, view, rng) {
  const { sess, S } = view;
  const withDef = meaningPool(lex.all);
  if (!withDef.length) return null;
  const { today } = view;
  const pool = withDef.map((x) => ({ x, key: wordKey(x.o, x.c) }));

  const seen = sess.seen.slice(-14);
  const nearby = pool.filter((p) => seen.includes(p.x.o));
  const chosen = chooseWord(S, nearby, today, rng) || chooseWord(S, pool, today, rng);
  if (!chosen) return null;

  return built({
    type: "meaning", skill: "ordaford", n: chosen.x, base: 8, counts: false,
    word: chosen.key, lvl: 1,
    /* the word's history as it stands once this question has been shown */
    spacing: historyIfAsked(S, chosen.key, today),
  }, [FX.asked(chosen.key, today)]);
}

/** The meaning question on the drilled word, or null if it has no meaning in
    the dictionary (or only a grammatical gloss, which is not a meaning). */
export function drillMeaning(lex, view, entry) {
  const full = (lex.lookup && lex.lookup(entry.o, entry.c)) || entry;
  if (!meaningPool([full]).length) return null;
  const key = wordKey(full.o, full.c);
  return built({
    type: "meaning", skill: "ordaford", n: full, base: 8, counts: false,
    word: key, lvl: 1, spacing: historyIfAsked(view.S, key, view.today),
    typeId: "meaning", drill: true,
  }, [FX.asked(key, view.today)]);
}

/* ================= Graded questions (v6.11) ============================== */

/** Rank of a pair: the rarer word decides; a word the frequency list does
    not have (r 99999) counts only when both are missing. */
const pairRank = (...ws) => {
  const known = ws.map((w) => (w && w.r) || 99999).filter((r) => r < 99999);
  return known.length ? Math.max(...known) : 5000;
};

/** Every synonym of a word in the groups (exercises.py SYNONYMS). */
export function synonymsOf(o, pos) {
  const ps = pos ? [pos] : Object.keys(EX.synonyms);
  return ps.flatMap((p) => (EX.synonyms[p] || []).filter((g) => g.some((w) => w.o === o)).flat())
    .map((w) => w.o).filter((w) => w !== o);
}
/** Every antonym of a word (exercises.py ANTONYMS), and their synonyms. */
export function antonymsOf(o, pos) {
  const ps = pos ? [pos] : Object.keys(EX.antonyms);
  const direct = ps.flatMap((p) => (EX.antonyms[p] || []).filter((pr) => pr.some((w) => w.o === o))
    .map((pr) => pr.find((w) => w.o !== o)).filter(Boolean).map((w) => w.o));
  return [...new Set([...direct, ...direct.flatMap((w) => synonymsOf(w, pos))])];
}

/** Synonym or antonym, four options. Wrong options never come from the
    word's own group or from any group that is its opposite. */
export function ordSynAnt(lex, view, rng) {
  const P = view.policy;
  const ant = rng() < 0.5;
  const items = [];
  if (ant) {
    for (const [pos, prs] of Object.entries(EX.antonyms))
      for (const pr of prs) for (const k of [0, 1]) items.push({ pos, x: pr[k], right: pr[1 - k], g: pr });
  } else {
    for (const [pos, gs] of Object.entries(EX.synonyms))
      for (const g of gs) for (const x of g) for (const right of g) if (x !== right) items.push({ pos, x, right, g });
  }
  /* The key is the whole group (or pair): after *fimur → liðugur*,
     *liðugur → fimur* is the same question. */
  const v = pickVocab(view, rng, ant ? "andheiti" : "samheiti", items,
    (y) => y.g.map((w) => w.o).sort().join("|") + "|" + y.pos, (y) => pairRank(y.x, y.right));
  if (!v) return null;
  const it = v.x;
  const { pos, x } = it;
  const right = ant ? it.right : pick(items.filter((y) => y.x === x), rng).right;
  const all = [...(EX.synonyms[pos] || []).flat(), ...(EX.antonyms[pos] || []).flat()];
  const ban = new Set([x.o, right.o, ...synonymsOf(x.o, pos), ...synonymsOf(right.o, pos),
    ...antonymsOf(x.o, pos), ...antonymsOf(right.o, pos),
    ...synonymsOf(x.o, pos).flatMap((w) => antonymsOf(w, pos)),
    ...synonymsOf(right.o, pos).flatMap((w) => antonymsOf(w, pos)),
    /* A word built from the asked one with ó- is its antonym even where no
       list says so (kurteis – ókurteis). */
    "ó" + x.o, x.o.replace(/^ó/, "")]);
  const pool = [...new Map(all.filter((w) => !ban.has(w.o)).map((w) => [w.o, w])).values()];
  /* Wrong options near the right one in rarity, so the rare word is not
     the odd one out by its look alone. */
  const r0 = pairRank(right);
  const near = shuffle(pool, rng).sort((a, b) => Math.abs(pairRank(a) - r0) - Math.abs(pairRank(b) - r0)).slice(0, 8);
  const wrong = shuffle(near, rng).slice(0, 3);
  if (wrong.length < 3) return null;
  const xe = lex.lookup(x.o, x.c), re = lex.lookup(right.o, right.c);
  return built({
    type: "choice", skill: "ordaford", s: null,
    title: ant ? "Andheiti" : "Samheiti",
    question: ant ? `Hvaða orð merkir **hið gagnstæða** við *${x.o}*?` : `Hvaða orð merkir **það sama** og *${x.o}*?`,
    options: shuffle([right.o, ...wrong.map((w) => w.o)], rng), answer: right.o,
    why: ant ? `*${x.o}* og *${right.o}* eru **andheiti**: þau merkja hið gagnstæða.`
      : `*${x.o}* og *${right.o}* eru **samheiti**: þau merkja nánast það sama.`,
    defs: [xe, re].filter((e) => e && e.d),
    base: 8, lvl: levelFor(P, Math.min(5, bandFor(view, "ordaford"))), cell: ant ? "orð:andheiti" : "orð:samheiti",
    word: xe ? wordKey(xe.o, xe.c) : null, tags: ["vocab"], miss: ["merking"],
    bonus: xe || re || null,
  }, [v.fx]);
}

/* Word in context: a sentence where exactly one of four nouns makes sense
   (exercises.py WORD_IN_CONTEXT). All four stand in the same BÍN mark, so
   the grammar never gives the answer away. v6.11 first tried frames from the
   sentence bank with options from "far" noun classes, and reading the output
   killed it: *Grunnskólarnir eru gamlir*, *Ég sá sófa úti* and *Hönnuðurinn
   var tilbúinn* are all good Icelandic. Whether a noun fits a verb is not
   something a class label can settle; a person has to. */
export function ordContext(lex, view, rng) {
  const P = view.policy;
  const items = EX.wordInContext.filter((x) => x.a && P.mark(x.m));
  if (!items.length) return null;
  /* The item's level (exercises.py: length, and how rare the words are)
     stands in for a rank: an item of level L sits in band L's window of
     `pickVocab`, so the band chooses among the items at it and one below,
     and widens from there (critique item 13). Until v6.13 the rank was the
     answer word's alone, and nearly every answer is a common word. */
  /* Since critique item 23 also the generated items (WORD_IN_CONTEXT_FRAMES:
     one per noun that fits, the same sentence with another answer), so the
     key is the sentence and the answer; and the window is the items nearest
     the band, at least VOCAB_FLOOR (`nearVocab`). */
  const v = nearVocab(view, rng, "samhengi", items, (y) => (y.gen ? y.t + "|" + y.a.o : y.t), (y) => y.lvl);
  if (!v) return null;
  const x = v.x;
  /* A generated item's wrong options: three of the nouns that cannot fit. */
  const wrong = x.gen ? shuffle(x.w, rng).slice(0, 3) : x.w;
  const { s, i } = textSentence(x.t);
  const cap = i === 0;
  const fix = (f) => (cap ? cap1(f) : f);
  const right = lex.lookup(x.a.o, x.a.c);
  /* The definition printed is the item's own (`x.d`, the sense the sentence
     means, chosen in content/ordafordi/samhengi*.tsv), never the word's
     first sense: *lagið í útvarpinu* printed "*lag*: partur af stafla …"
     until the v6.13 review (M1). An item without one says only why. */
  return built({
    type: "choice", skill: "ordaford", s, i,
    title: "Orð í samhengi", question: "Hvaða orð passar í setninguna?",
    options: shuffle([x.a, ...wrong].map((o) => fix(o.f)), rng), answer: fix(x.a.f),
    why: x.d ? `*${x.a.o}*: ${x.d}` : `Aðeins *${x.a.f}* gefur setningunni merkingu.`,
    base: 8, lvl: levelFor(P, x.lvl), cell: "orð:samhengi", word: right ? wordKey(right.o, right.c) : null,
    tags: ["vocab"], miss: ["merking"], bonus: right,
  }, [v.fx]);
}

/* ---------- the window of a vocabulary list (critique item 23) -----------
 *
 * `pickVocab` (shared.js) asks within the band's window of rarity and widens
 * only when NOTHING in it may be asked. For a list whose items are few at a
 * level — or_myndun had two pairs at level 1, or_samhengi three items at
 * level 5 — a pupil at that band met the same handful again and again. Here
 * the window is the items nearest the band by level, at least
 * VOCAB_FLOOR of them (shared.js `nearBand`); within it the spacing gate
 * decides as before (new words first, none twice in a week). */
const VOCAB_FLOOR = 150;
function nearVocab(view, rng, kind, items, keyOf, lvlOf, maxBand = 5, floor = VOCAB_FLOOR) {
  const b = Math.min(bandFor(view, "ordaford"), maxBand);
  const near = nearBand(items, lvlOf, b, floor);
  /* every item of the window on the band's own rank, so `pickVocab` keeps
     them all in its first tier */
  return pickVocab(view, rng, kind, near, keyOf, () => RANK_CAP[b], maxBand);
}

/* Word formation, every pair checked in the lexicon (both words in BÍN) and,
   where the dictionary defines the derived word, against that definition:
   *óheppinn* is defined with "ekki", *kennari* with "kennir", *æfing* with
   "æfa", *heppni* with "heppinn". Five kinds (critique item 23 added the
   last two and the agents in *-andi*):
     neg    ó- makes the opposite             heppinn – óheppinn
     agent  -ari, -andi: who does it           kenna – kennari, nema – nemandi
     ing    -ing, -un: the doing of it         æfa – æfing, mennta – menntun
     lega   -legur → -lega: the adverb         venjulegur – venjulega
            (the adverbs are not in the lexicon, which holds the words texts
            used: build_exercises.py takes them from BÍN, EX.formation)
     ni     -inn → -ni: the quality            forvitinn – forvitni */
let FORM_CACHE = null;
function formationPairs(lex) {
  if (FORM_CACHE && FORM_CACHE.lex === lex) return FORM_CACHE;
  const neg = [], agent = [], ing = [], lega = [], ni = [];
  for (const w of lex.adjectives) {
    if (!w.o.startsWith("ó") || w.o.length < 5 || !w.d) continue;
    const base = lex.lookup(w.o.slice(1), "lo");
    if (base && base.r <= 2500 && /\bekki\b/.test(w.d)) neg.push({ from: base, to: w });
  }
  for (const w of lex.byClass.kk || []) {
    const m = w.o.match(/^(.+)(ari|andi)$/);
    if (!m || !w.d || !["job", "person", "child"].includes(w.s)) continue;
    const v = lex.lookup(m[1] + "a", "so");
    const f3 = v && (v.forms["GM-FH-NT-3P-ET"] || [])[0];
    if (v && f3 && (w.d.includes(f3) || w.d.includes(v.o))) agent.push({ from: v, to: w, f3, sfx: "-" + m[2] });
  }
  for (const w of lex.byClass.kvk || []) {
    if (!/(ing|un)$/.test(w.o) || !w.d) continue;
    const stem = w.o.replace(/(ing|un)$/, "");
    const v = lex.lookup(stem + "a", "so");
    if (v && v.r <= 4000 && w.d.includes(v.o)) ing.push({ from: v, to: w, sfx: w.o.endsWith("ing") ? "-ing" : "-un" });
  }
  for (const y of (EX.formation && EX.formation.lega) || []) {
    const from = lex.lookup(y.from, "lo");
    /* the adjective must be in this pupil's lexicon (the coarse-word filter) */
    if (from) lega.push({ from, to: { o: y.to, c: "ao", r: from.r }, lexTo: false });
  }
  for (const w of lex.byClass.kvk || []) {
    if (!w.o.endsWith("ni") || !w.d) continue;
    const from = lex.lookup(w.o.slice(0, -2) + "inn", "lo");
    if (from && w.d.includes(from.o)) ni.push({ from, to: w });
  }
  FORM_CACHE = { lex, neg, agent, ing, lega, ni };
  return FORM_CACHE;
}
const FORM_KINDS = ["neg", "agent", "ing", "lega", "ni"];

/* The prompt does not name the prefix or the suffix: "Búðu til andheiti
   með forskeytinu ó-: kurteis → ?" gave the answer away. The affix is the
   hint (Vísbending, which costs some XP), and every answer that is right is
   accepted: for kurteis both ókurteis and dónalegur. */
export function ordFormation(lex, view, rng) {
  const P = view.policy;
  const F = formationPairs(lex);
  /* One window over all five kinds (`nearVocab`): the pairs nearest the
     band by how rare the rarer word is in its class (shared.js
     `classRankLevel`). Then a kind, weighed by how many pairs of it the
     window holds to the power ¾: the 165 adverbs do not crowd out the rest,
     and an adverb still comes up nearly as often as a pair of a small kind. */
  const lvlOf = (y) => classRankLevel(pairRank(y.from, y.to));
  const all = FORM_KINDS.flatMap((k) => F[k].map((y) => ({ ...y, kind: k })));
  if (!all.length) return null;
  const b = Math.min(bandFor(view, "ordaford"), 5);
  const near = nearBand(all, lvlOf, b, VOCAB_FLOOR);
  const kind = wpick(FORM_KINDS, (k) => near.filter((y) => y.kind === k).length ** 0.75, rng);
  const v = nearVocab(view, rng, "myndun", near.filter((y) => y.kind === kind), (y) => y.to.o, lvlOf);
  if (!v) return null;
  const x = v.x;
  let answers = [x.to.o];
  if (kind === "neg") answers = [x.to.o, ...synonymsOf(x.to.o, "lo"), ...antonymsOf(x.from.o, "lo")];
  /* "Myndaðu nafnorð af sögninni *byrja*": *byrjun* and *byrjandi* are both
     nouns made from it; *leika*: *leikari* and *leikandi* both play. Every
     noun the lexicon makes from the verb is accepted for either prompt. */
  if (kind === "ing") answers = [x.to.o, ...[...F.ing, ...F.agent].filter((y) => y.from === x.from).map((y) => y.to.o)];
  if (kind === "agent") answers = [x.to.o, ...F.agent.filter((y) => y.from === x.from).map((y) => y.to.o)];
  answers = [...new Set(answers)];
  const text = {
    neg: [`Skrifaðu **andheiti** orðsins *${x.from.o}*: ___`, "Prófaðu forskeytið **ó-**.",
      "Forskeytið *ó-* snýr merkingunni við: *heppinn – óheppinn*."],
    agent: [`Sá sem *${x.f3}*${x.from.o === "eiga" ? " eitthvað" : ""} er ___ (nafnorð).`, `Nafnorðið endar á **${x.sfx}**.`,
      "Viðskeytin *-ari* og *-andi* mynda nafnorð um þann sem gerir eitthvað: *kenna – kennari*, *nema – nemandi*."],
    ing: [`Myndaðu nafnorð af sögninni *${x.from.o}*: ___`, `Notaðu viðskeytið **${x.sfx}**.`,
      "Viðskeytin *-ing* og *-un* mynda nafnorð af sögnum: *æfa – æfing*, *mennta – menntun*."],
    lega: [`Myndaðu **atviksorð** af lýsingarorðinu *${x.from.o}*: ___`, "Atviksorðið endar á **-lega**.",
      "Af lýsingarorðum sem enda á *-legur* eru mynduð atviksorð sem enda á *-lega*: *venjulegur – venjulega*, *skemmtilegur – skemmtilega*."],
    ni: [`Myndaðu **nafnorð** af lýsingarorðinu *${x.from.o}*: ___`, "Nafnorðið endar á **-ni**.",
      "Af lýsingarorðum sem enda á *-inn* eru mynduð nafnorð sem enda á *-ni*: *heppinn – heppni*, *forvitinn – forvitni*."],
  }[kind];
  const others = answers.slice(1);
  /* The adverb has no entry of its own: the adjective is the word the
     question is filed under and shown with. */
  const entry = x.lexTo === false ? x.from : x.to;
  return built({
    type: "gap", skill: "ordaford", mode: "free", s: null, i: -1, prompt: text[0],
    cue: null, answers, m: null, paradigm: null,
    title: "Orðmyndun", hint: null, tip: text[1],
    why: `${text[2]}${entry.d ? ` *${entry.o}*: ${entry.d}` : ""}`
      + (others.length ? ` Líka rétt: ${others.map((o) => `*${o}*`).join(", ")}.` : ""),
    /* labelled by how rare the rarer word of the pair is in its class */
    base: 9, lvl: levelFor(P, lvlOf(x)), cell: "orð:myndun-" + kind,
    word: wordKey(entry.o, entry.c), tags: ["wordform"], missOther: ["ordmyndun"],
    bonus: entry,
  }, [v.fx]);
}

/** Odd one out: three nouns of one kind and one of a kind far from it.

    The explanation (v6.13 review, M2) was "*a, b, c* eru öll ${KIND}", which
    agrees with almost nothing: "eru öll drykkir", "eru öll matur". It is now
    built from two fixed phrases per kind that are right whatever the words:
    "*hundur*, *köttur* og *hestur*: þetta eru allt dýr. *Stóll* er ekki dýr."
    After "þetta" the verb agrees with what follows: "þetta eru allt dýr"
    (plural), "þetta er allt matur" (a mass noun, singular). `sg` is the kind
    in the singular, said of the odd word, which is never of the kind. */
const KIND = {
  animal: { all: "eru allt dýr", sg: "dýr" },
  drink: { all: "eru allt drykkir", sg: "drykkur" },
  food: { all: "er allt matur", sg: "matur" },
  vehicle: { all: "eru allt farartæki", sg: "farartæki" },
  clothing: { all: "eru allt föt", sg: "flík" },
  furniture: { all: "eru allt húsgögn", sg: "húsgagn" },
  body: { all: "eru allt líkamshlutar", sg: "líkamshluti" },
  plant: { all: "eru allt plöntur", sg: "planta" },
  job: { all: "eru allt starfsheiti", sg: "starfsheiti" },
  weather: { all: "eru allt veðurfyrirbæri", sg: "veðurfyrirbæri" },
  building: { all: "eru allt byggingar", sg: "bygging" },
};
/* Kinds far enough apart that the odd word cannot be one of the three's
   kind. Body parts and food or drink are not: *lifur*, *tunga* and *hjarta*
   are eaten, and "Lifur er ekki matur" is false (review M2). */
const ODD_FAR = {
  animal: ["furniture", "vehicle", "clothing", "drink", "building", "weather"],
  drink: ["animal", "vehicle", "clothing", "furniture", "building", "job"],
  food: ["vehicle", "clothing", "furniture", "building", "job", "weather"],
  vehicle: ["animal", "drink", "food", "clothing", "body", "plant", "job"],
  clothing: ["animal", "drink", "food", "vehicle", "furniture", "plant", "weather"],
  furniture: ["animal", "drink", "food", "clothing", "body", "plant", "weather", "job"],
  body: ["vehicle", "furniture", "building", "weather", "job"],
  plant: ["vehicle", "clothing", "furniture", "body", "building", "drink", "job"],
  job: ["drink", "food", "vehicle", "clothing", "furniture", "plant", "weather"],
  weather: ["animal", "food", "vehicle", "clothing", "furniture", "body", "job"],
  building: ["animal", "drink", "food", "clothing", "body", "plant", "weather", "job"],
};
/* Nouns of a kind (pipeline/noun_classes.py) that are not what the sentence
   says they are, read one by one for the v6.13 review (M2). The classes are
   made for generated sentences, where a mirror stands where a sofa stands;
   here the label is a claim. Never used in this question, in either role:
   - the kind's own name or a word for the whole (*dýr*, *matur*, *drykkur*,
     *bygging*, *líkami*, *planta*, *farartæki*, *fatnaður*, *veður* …);
   - a second spelling of one word (*baðkar/baðker*, *kisa/kisi*,
     *hauskúpa/höfuðkúpa*; *kló* is two nouns, the claw and the toilet);
   - what is not of the kind: appliances, bedding, rugs and the bath are
     not húsgögn; tears, sweat, saliva, flesh, skin, hair, a fingerprint and
     fish skin (*roð*) are not líkamshlutar, nor (here) the parts only animals
     have; a mushroom, seaweed and the parts of a plant (leaf, root, seed,
     grain, needles) are not plöntur; darkness, heat, light, a wave, a flood,
     steam, climate and an earthquake are not veðurfyrirbæri; a home, a
     collection (*safn*), a notepad-or-block (*blokk*) and a summer school are
     not byggingar; a caravan and a cart (*kerra*, also a pram) not farartæki;
   - a word whose everyday sense here is not its usual one (*sneið*, *beygla*,
     *greni* the fox's den, *rif* the reef, *leggur*, *armur*, *bumba* the drum). */
const ODD_SKIP = Object.fromEntries(Object.entries({
  animal: "dýr gæludýr kisi",
  drink: "drykkur",
  food: "matur máltíð sneið beygla",
  vehicle: "farartæki ökutæki hjólhýsi kerra",
  clothing: "fatnaður flík skór stígvél",
  furniture: "spegill ísskápur ofn frystir eldavél þvottavél þurrkari örbylgjuofn teppi koddi sæng dýna motta baðkar baðker",
  body: "líkami líffæri skrokkur kroppur búkur tár sviti munnvatn hold skinn húð roð taug sin fingrafar hár skegg "
    + "yfirvaraskegg skalli tagl vængur kló stél loppa rófa hali sporður goggur uggi vömb hauskúpa höfuðleður rif leggur "
    + "armur bumba",
  plant: "planta jurt sveppur þörungur korn fræ lauf barr sproti rót grasker kjarr greni",
  job: "",
  weather: "veður myrkur hiti alda hitastig loftslag sólarljós jarðskjálfti dagsljós gufa flóð birta brim bylgja skin "
    + "flóðbylgja hlýja ylur",
  building: "bygging heimili safn skýli blokk sumarskóli",
}).map(([k, v]) => [k, new Set(v.split(" ").filter(Boolean))]));
/* Words that may be the odd one out but whose dictionary definition (the
   first sense, all the lexicon has) is another word: *kisa* "sá eða sú sem
   er viðkvæmur fyrir kulda", *hross* "… hasta, óþýða framkomu", *vör*
   "lendingarstaður báta", *búð* "bækistöðvar til bráðabirgða". No
   definition is printed for them. */
const ODD_NO_DEF = new Set(("kaffi verslun búð blóm hjól bolur kisa hross þumall vör kviður").split(" "));
/** Whether noun `w` may stand in this question as one of kind `k`. */
export const oddMember = (w, k) => !!KIND[k] && w.s === k && !w.nx && !ODD_SKIP[k].has(w.o)
  && !!(w.forms && w.forms.NFET);
export const ODD_KINDS = Object.keys(KIND);
/* The words come from the band's window of rarity: at least one of the four
   from inside it when the kind has one, the rest from anything commoner.
   Until v6.13 all four came from one cap of 600 + 500 × band, and a noun's
   rank (its place among the nouns) never goes above about 1,400 — so from
   þyngd 2 on every question drew from all of them alike (critique item 13).
   The windows are on the nouns' own scale (shared.js `CLASS_RANK_CAP`):
   each holds 50–150 nouns of the eleven kinds. The question is labelled by
   its rarest word. */
export function ordOdd(lex, view, rng) {
  const P = view.policy;
  const b = Math.min(bandFor(view, "ordaford"), 5);
  const cap = CLASS_RANK_CAP[b], floor = CLASS_RANK_CAP[b - 1];
  /* The odd one out may be a band rarer than the three it stands out from
     (critique item 23): the eleven kinds hold only some eighty nouns among
     the commonest 150, and a pupil at þyngd 1 kept meeting the same eighty.
     The group of three stays in the band's window. */
  const capOdd = CLASS_RANK_CAP[Math.min(b + 1, 5)];
  const by = {}, byOdd = {};
  lex.nouns.forEach((w) => {
    if (!oddMember(w, w.s)) return;
    if (w.r <= cap) (by[w.s] ||= []).push(w);
    if (w.r <= capOdd) (byOdd[w.s] ||= []).push(w);
  });
  const kinds = ODD_KINDS.filter((k) => (by[k] || []).length >= 3);
  const rare = (list) => list.filter((w) => w.r > floor);
  for (let k = 0; k < 10; k++) {
    const A = pick(kinds, rng);
    if (!A) return null;
    const Bs = ODD_FAR[A].filter((x) => (byOdd[x] || []).length);
    if (!Bs.length) continue;
    /* One of the three from the window if the kind has one there; else the
       odd one out from it, if its kind has. */
    const inA = rare(by[A]);
    const first = inA.length ? pick(inA, rng) : null;
    const three = [first, ...shuffle(by[A].filter((w) => w !== first), rng)].filter(Boolean).slice(0, 3);
    const B = byOdd[pick(Bs, rng)];
    const odd = pick(!first && rare(B).length ? rare(B) : B, rng);
    return built({
      type: "choice", skill: "ordaford", s: null,
      title: "Hvert á ekki heima í hópnum?", question: "Þrjú orðanna eiga eitthvað sameiginlegt. Hvert á **ekki** heima í hópnum?",
      options: shuffle([...three, odd].map((w) => w.o), rng), answer: odd.o,
      why: `*${three[0].o}*, *${three[1].o}* og *${three[2].o}*: þetta ${KIND[A].all}. `
        + `*${cap1(odd.o)}* er ekki ${KIND[A].sg}.`,
      defs: [odd].filter((e) => e.d && !ODD_NO_DEF.has(e.o)),
      base: 7, lvl: levelFor(P, classRankLevel(Math.max(odd.r, ...three.map((w) => w.r)))),
      cell: "orð:útundan", word: wordKey(odd.o, odd.c),
      tags: ["vocab"], miss: ["merking"], bonus: odd,
    });
  }
  return null;
}

export const TYPES = [
  /* v6.11: in a session the free-text meaning question is an optional bonus
     after the graded Orðaforði questions (ui/render-more.js), not a question
     of its own — hence no weight inside one. It still comes in a rescue
     drill. */
  { id: "meaning", skill: "ordaford", weight: 4, weightInRun: 0, renderer: "meaning",
    tags: [],
    bands: [1],
    build: taskMeaning },
  { id: "or_heiti", skill: "ordaford", weight: 4, renderer: "choice",
    tags: ["vocab"],
    bands: [1, 2, 3, 4, 5, 6, 7],
    build: ordSynAnt },
  { id: "or_samhengi", skill: "ordaford", weight: 4, renderer: "choice",
    tags: ["vocab"],
    bands: [1, 3],
    build: ordContext },
  { id: "or_myndun", skill: "ordaford", weight: 3, renderer: "gap",
    tags: ["wordform"],
    bands: [1, 3, 4, 5],
    build: ordFormation },
  { id: "or_utundan", skill: "ordaford", weight: 3, renderer: "choice",
    tags: ["vocab"],
    bands: [1, 2, 3, 4, 5],
    build: ordOdd },
];
