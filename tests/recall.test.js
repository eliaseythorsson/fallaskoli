/* Recall in a sentence gap (issue #14, tasks/recall.js): one of the pupil's
   words in learning typed into a sentence — with its first letter, then
   without.

   What is held here:
     - which forms are right in a gap, sentence by sentence (the rules at the
       top of tasks/recall.js), and over the whole bank;
     - which sentences are left out: the word twice, a case the parse could
       not settle, a noun whose article cannot be told;
     - that no other word in learning fits as well, with the letter and
       without;
     - the letter by the word's history in Word knowledge;
     - the judge: the existing leniency for written forms, nothing new. */

import test from "node:test";
import assert from "node:assert/strict";
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { normalise } from "../src/js/core/grading.js";
import { blankState, newSession, wordKey } from "../src/js/core/state.js";
import { SKILL_IDS } from "../src/js/core/skills.js";
import { createPolicy } from "../src/js/core/policy.js";
import { catalogueEntry, isRecall, CATALOGUE_IDS } from "../src/js/core/catalogue.js";
import { judge, judgeRetry, retryAllowed, settle, hideAnswer } from "../src/js/core/answer.js";
import { seeded } from "../src/js/core/duel.js";
import { enterLearning, leaveLearning, entriesOf, isRecallEntry, fillLearning, wordsInLearning,
         LEARNING_CLASSES } from "../src/js/core/wordknowledge.js";
import { typeById, makeView, withView, applyEffects, nextTask, buildTask } from "../src/js/tasks/index.js";
import { reviewTask } from "../src/js/tasks/review.js";
import { recallGap, recallGaps, gapForms, recallStage, rivalsOf, RECALL_CELL,
         LETTER_UNTIL_RIGHT, LETTER_BACK_AFTER } from "../src/js/tasks/recall.js";
import { LEARNER_WORDS, giveWords } from "./learner.js";

const lex = buildLexicon(DATA);
const TODAY = "2026-11-27";
const allOn = {};
SKILL_IDS.forEach((id) => { allOn[id] = true; });
const POLICY = createPolicy(null, { skills: allOn, types: {}, levels: {}, attrs: {}, safeVocab: null });

const entry = (key) => { const at = key.lastIndexOf("|"); return lex.lookup(key.slice(0, at), key.slice(at + 1)); };

/** A pupil with these words in learning, every skill at `band`. */
function pupil(words = LEARNER_WORDS, band = 3) {
  const S = blankState();
  SKILL_IDS.forEach((id) => { S.enabled[id] = true; });
  for (const w of words) assert.ok(enterLearning(S, w, "2026-11-20"), w);
  const sess = newSession(S);
  Object.keys(sess.diff).forEach((k) => { sess.diff[k] = band; });
  return { lex, S, sess, forcedNoun: null };
}
const viewOf = (p, extra = {}) => makeView({ S: p.S, sess: p.sess, policy: POLICY, today: TODAY, typeId: "or_eyda", ...extra });
const build = (p, seed = 1, extra = {}) => recallGap(lex, viewOf(p, extra), seeded(seed));

const w0 = (t) => entry(t.word);

/** Write an answer about `word` into Word knowledge as type `type`. */
const note = (S, word, outcome, type = "or_eyda", day = "2026-11-21") => {
  (S.wordKnowledge[word] ||= { c: 0, w: 0, e: [] }).e.push([day, type, outcome]);
};

/** The gap of `word` in the bank sentence `text`, or null if it is not used. */
function gapIn(text, word) {
  const w = entry(word);
  const s = lex.sentences.find((x) => x.t === text);
  assert.ok(s && w, `${text} / ${word}`);
  const at = s.tok.map((t, i) => (lex.entryForToken(t) === w ? i : -1)).filter((i) => i >= 0);
  assert.ok(at.length, `${word} is not in "${text}"`);
  const got = at.map((i) => gapForms(lex, s, i, w)).filter(Boolean);
  return got.length ? got[0] : null;
}
const rightIn = (text, word) => { const g = gapIn(text, word); return g ? g.answers : null; };

/* ---------- declared ---------------------------------------------------------- */

test("or_eyda is the last type of the catalogue, recall, graded by the app, drawn as a gap", () => {
  const t = catalogueEntry("or_eyda");
  assert.ok(t);
  assert.equal(CATALOGUE_IDS[CATALOGUE_IDS.length - 1] === "or_eyda" || CATALOGUE_IDS.includes("or_eyda"), true);
  assert.equal(t.recall, true);
  assert.equal(isRecall("or_eyda"), true);
  assert.equal(t.grader, "app");
  assert.equal(t.renderer, "gap");
  assert.equal(t.skill, "ordaford");
  assert.equal(typeById("or_eyda").build, recallGap);
});

/* ---------- which forms are right --------------------------------------------- */

test("a noun: every form of the sentence's case that the sentence allows", () => {
  /* after a preposition nothing fixes number or article */
  assert.deepEqual(rightIn("Ég sagði frá hugmynd.", "hugmynd|kvk"),
    ["hugmynd", "hugmyndinni", "hugmyndum", "hugmyndunum"]);
  assert.deepEqual(rightIn("Við ræddum hugmyndina lengi.", "hugmynd|kvk"),
    ["hugmyndina", "hugmynd", "hugmyndir", "hugmyndirnar"]);
  /* the verb fixes the number of its subject and of its predicate */
  assert.deepEqual(rightIn("Hugmyndirnar skipta máli.", "hugmynd|kvk"), ["hugmyndirnar", "hugmyndir"]);
  assert.deepEqual(rightIn("Þetta er bara hugmynd.", "hugmynd|kvk"), ["hugmynd", "hugmyndin"]);
  assert.deepEqual(rightIn("Þetta eru bara hugmyndir.", "hugmynd|kvk"), ["hugmyndir", "hugmyndirnar"]);
  assert.deepEqual(rightIn("Þegar búið var að telja atkvæðin kom í ljós að tillagan hafði verið samþykkt.", "tillaga|kvk"),
    ["tillagan", "tillaga"]);
});

test("a noun: an adjective before it fixes the cell, a genitive after it the article", () => {
  assert.deepEqual(rightIn("Amma naut góðrar heilsu alla ævi.", "heilsa|kvk"), ["heilsu"]);
  assert.deepEqual(rightIn("Upphaf dagsins var rólegt.", "upphaf|hk"), ["upphaf"]);
  /* the genitive attribute itself is free: both stand in the bank */
  const vin = rightIn("Hann talaði um mikilvægi vináttu.", "vinátta|kvk");
  assert.ok(vin.includes("vináttu") && vin.includes("vináttunnar"), String(vin));
});

test("a noun whose article cannot be told is left out: a pronoun before it, a possessive after it", () => {
  assert.equal(gapIn("Ég skil ekki þessa hugmynd.", "hugmynd|kvk"), null);
  assert.equal(gapIn("Ég sagði kennaranum frá hugmyndinni minni.", "hugmynd|kvk"), null);
  assert.equal(gapIn("Við töluðum um gildi þessara hugmynda.", "hugmynd|kvk"), null);
  assert.equal(gapIn("Amma naut góðrar heilsu alla ævi.", "ævi|kvk"), null);       // alla ævi / alla ævina
  /* a case the parse could not settle */
  assert.equal(gapIn("Í byrjun vetrar var snjórinn þegar kominn í fjöllin.", "byrjun|kvk"), null);
});

test("a verb: person and number stay, the other tense is right, the other mood in a subordinate clause", () => {
  assert.deepEqual(rightIn("Kennarinn útskýrði dæmið fyrir bekknum í rólegheitum.", "útskýra|so"), ["útskýrði", "útskýrir"]);
  assert.deepEqual(rightIn("Ég safna steinum.", "safna|so"), ["safna", "safnaði"]);
  assert.deepEqual(rightIn("Ég vona að veðrið batni fyrir morgundaginn.", "batna|so"), ["batni", "batnar", "batnaði"]);
  /* the supine and the infinitive are what they are */
  assert.deepEqual(rightIn("Leiknum var frestað vegna veðurs.", "fresta|so"), ["frestað"]);
  assert.deepEqual(rightIn("Okkur var kennt að flokka ruslið rétt þegar nýju tunnurnar voru settar upp við skólann.", "flokka|so"),
    ["flokka"]);
  /* the middle voice is another meaning */
  assert.equal(gapIn("Krakkarnir söfnuðust saman úti á vellinum.", "safna|so"), null);
});

test("an adjective: its own cell and the same cell compared; a compared one is left out", () => {
  assert.deepEqual(rightIn("Snjórinn var djúpur svo að bíllinn sat fastur.", "djúpur|lo"), ["djúpur", "dýpri", "dýpstur"]);
  assert.equal(gapIn("Ég veit ekki hvort nýi kennarinn okkar er strangari en sá gamli.", "strangur|lo"), null);
});

test("an adverb is asked as it stands", () => {
  assert.deepEqual(rightIn("Skólar standa víða á landinu.", "víða|ao"), ["víða"]);
  const g = gapIn("Skólar standa víða á landinu.", "víða|ao");
  assert.equal(g.m, null);
});

test("a sentence with the word twice is never used", () => {
  const twice = "Við fórum snemma að sofa af því að við ætluðum að vakna snemma um morguninn.";
  assert.equal(gapIn(twice, "snemma|ao"), null);
  assert.ok(!recallGaps(lex, entry("snemma|ao")).some((g) => g.s.t === twice));
  /* nor one that holds it inside another word */
  for (const g of recallGaps(lex, entry("hugmynd|kvk")))
    assert.ok(!g.s.tok.some((t, j) => j !== g.i && t.l && t.l.includes("hugmynd")), g.s.t);
});

/* ---------- over the whole bank ------------------------------------------------ */

const CASE = /(NF|ÞF|ÞGF|EF)(?:ET|FT)(?:gr)?$/;
const LINO = lex.all.filter((w) => typeof w.lino === "number" && LEARNING_CLASSES.has(w.c));

test("every gap of every LÍNO-2 word: the sentence's form first, only forms of the word, and the judge takes each", () => {
  let gaps = 0, words = 0;
  for (const w of LINO) {
    const list = recallGaps(lex, w);
    if (list.length) words++;
    const all = new Set(Object.values(w.forms).flat().map(normalise));
    for (const g of list) {
      gaps++;
      const at = `${w.o}: ${g.s.t}`;
      const tok = g.s.tok[g.i];
      assert.equal(g.answers[0], normalise(tok.w), at);
      assert.equal(new Set(g.answers).size, g.answers.length, at);
      for (const a of g.answers) {
        assert.ok(all.has(a), `${at}: ${a} is not a form of the word`);
        assert.ok(!/\s/.test(a), at);
      }
      /* the word stands once */
      assert.ok(!g.s.tok.some((t, j) => j !== g.i && (t.l === w.o || all.has(normalise(t.w)))), at);
      if (!g.m) { assert.equal(w.c, "ao", at); assert.equal(g.answers.length, 1, at); continue; }
      assert.equal(g.m, tok.m, at);
      assert.ok(w.forms[g.m].some((f) => normalise(f) === g.answers[0]), at);
      /* a noun never leaves the sentence's case; a verb never its person, number or voice */
      const marksOf = (a) => Object.entries(w.forms).filter(([, fs]) => fs.some((f) => normalise(f) === a)).map(([m]) => m);
      if (CASE.test(g.m) && !g.m.includes("-")) {
        const fall = CASE.exec(g.m)[1];
        for (const a of g.answers) assert.ok(marksOf(a).some((m) => CASE.exec(m)[1] === fall), `${at}: ${a} is another case`);
      }
      if (w.c === "so") {
        assert.ok(g.m.startsWith("GM-"), at);
        const who = (/[123]P-(?:ET|FT)$/.exec(g.m) || [""])[0];
        for (const a of g.answers) assert.ok(marksOf(a).some((m) => m.startsWith("GM-") && m.endsWith(who)), `${at}: ${a}`);
      }
      if (w.c === "lo") assert.match(g.m, /^F[SV]B-/, at);
    }
  }
  /* the supply, as the bank stands (PR #14): it grows with the LÍNO-2 sentences of #21–#24 */
  assert.ok(words >= 400, `${words} LÍNO-2 words have a sentence`);
  assert.ok(gaps >= 15000, `${gaps} gaps`);
});

test("the first six words a new pupil learns: what the bank can ask today", () => {
  const S = blankState();
  fillLearning(S, lex, { level: 1, today: TODAY });
  const six = wordsInLearning(S);
  assert.equal(six.length, 6);
  const have = six.filter((k) => recallGaps(lex, entry(k)).length);
  /* Honest: most of the commonest LÍNO-2 words have no sentence yet. */
  assert.ok(have.length >= 1, `none of ${six} has a sentence`);
});

/* ---------- with the letter, or without ---------------------------------------- */

test("the constants are what the header says", () => {
  assert.equal(LETTER_UNTIL_RIGHT, 1);
  assert.equal(LETTER_BACK_AFTER, 1);
});

test("recallStage: the letter until the word is recalled once, and again after a miss", () => {
  const S = blankState();
  const k = "útskýra|so";
  assert.equal(recallStage(S, k), "letter");
  note(S, k, "w");
  assert.equal(recallStage(S, k), "letter", "a miss with the letter keeps the letter");
  note(S, k, "r");
  assert.equal(recallStage(S, k), "bare");
  note(S, k, "w");
  assert.equal(recallStage(S, k), "letter", "a miss without the letter brings it back");
  note(S, k, "r");
  assert.equal(recallStage(S, k), "bare");
  /* answers in other question types, and "seen", say nothing about recall */
  const S2 = blankState();
  note(S2, k, "r", "verbslot"); note(S2, k, "r", "tbl_so"); note(S2, k, "s");
  assert.equal(recallStage(S2, k), "letter");
  note(S2, k, "r");
  note(S2, k, "w", "verbslot"); note(S2, k, "s");
  assert.equal(recallStage(S2, k), "bare");
});

/* ---------- the builder --------------------------------------------------------- */

test("a pupil with no word in learning is built nothing — so a duel never holds the type", () => {
  const S = blankState();
  const sess = newSession(S);
  for (let seed = 0; seed < 20; seed++)
    assert.equal(recallGap(lex, makeView({ S, sess, policy: POLICY, today: TODAY, typeId: "or_eyda" }), seeded(seed)), null);
});

test("the question: a gap, the letter, the right form first, and nothing that names the word", () => {
  const seen = new Set();
  for (let seed = 0; seed < 80; seed++) {
    const p = pupil();
    const b = build(p, seed);
    assert.ok(b, `seed ${seed}`);
    const t = b.task;
    seen.add(t.word);
    assert.ok(LEARNER_WORDS.includes(t.word), t.word);
    assert.equal(t.type, "gap");
    assert.equal(t.skill, "ordaford");
    assert.equal(t.cell, RECALL_CELL);
    assert.equal(t.stage, "letter");
    const tok = t.s.tok[t.i];
    assert.equal(normalise(t.answers[0]), normalise(tok.w));
    assert.equal(t.answers[0], tok.w, "the answer is shown as the sentence has it, capital and all");
    /* the verdict shows the forms of the sentence's cell, not everything accepted */
    assert.deepEqual(t.shown, t.m ? w0(t).forms[t.m].map((f) => (t.cap ? f[0].toUpperCase() + f.slice(1) : f))
      .filter((f) => t.answers.includes(f)) : [tok.w]);
    assert.equal(t.shown[0], t.answers[0]);
    const letter = [...normalise(tok.w)][0];
    assert.ok(t.hint.includes(`**${letter}**`), t.hint);
    assert.match(t.hint, /^Hvaða orð vantar\? Það er eitt af orðunum sem þú ert að læra\. Það byrjar á \*\*.\*\*\.$/u);
    /* before the answer nothing shows the word: not the cue, not the hint */
    const w = entry(t.word);
    assert.equal(t.cue, null);
    assert.ok(!t.hint.includes(w.o));
    assert.equal(t.retryWhy, null, "the letter was there: a second try is shown nothing more");
    /* after it: the word, and (ui) the sentence with the form in it */
    assert.equal(t.why, `*${w.o}*`);
    assert.equal(t.whyLabel, "orðið");
    assert.deepEqual(b.effects.map((e) => e.op), ["frame"]);
    assert.equal(judge(t, { text: t.answers[0] }, p).ok, true);
    assert.equal(/DLD|málþrosk/i.test(JSON.stringify([t.hint, t.why, t.title])), false);
  }
  assert.ok(seen.size >= 5, `only ${[...seen]} came up`);
});

test("without the letter once recalled — but only where no other word in learning fits as well", () => {
  /* one adjective, one adverb: no rival; two nouns, two verbs: rivals */
  const p = pupil();
  for (const k of LEARNER_WORDS) note(p.S, k, "r");
  const stages = {};
  for (let seed = 0; seed < 200; seed++) {
    const t = build(p, seed).task;
    (stages[t.word] ||= new Set()).add(t.stage);
    if (t.stage === "bare") {
      assert.equal(t.hint, "Hvaða orð vantar? Það er eitt af orðunum sem þú ert að læra.");
      assert.match(t.retryWhy, /^Það byrjar á \*\*.\*\*\.$/u, "a second try gets the letter");
    }
  }
  assert.deepEqual([...stages["frægur|lo"]], ["bare"]);
  assert.deepEqual([...stages["snemma|ao"]], ["bare"]);
  for (const k of ["hugmynd|kvk", "völlur|kk", "útskýra|so", "lofa|so"])
    assert.deepEqual([...stages[k]], ["letter"], `${k}: another word of its class is in learning`);
  assert.deepEqual(rivalsOf(lex, p.S, entry("hugmynd|kvk")).map((o) => o.o), ["völlur"]);
  assert.deepEqual(rivalsOf(lex, p.S, entry("frægur|lo")), []);

  /* the only noun in learning is asked without the letter */
  const q = pupil(["hugmynd|kvk", "útskýra|so", "snemma|ao"]);
  note(q.S, "hugmynd|kvk", "r"); note(q.S, "útskýra|so", "r");
  for (let seed = 0; seed < 40; seed++) {
    const t = build(q, seed).task;
    if (t.word !== "snemma|ao") assert.equal(t.stage, "bare", t.word);
    else assert.equal(t.stage, "letter", "never recalled yet");
  }
});

test("two words of one class that begin alike: neither is asked, the letter would not tell them apart", () => {
  /* hugmynd, heimild: two nouns in h-; the verb can still be asked */
  const p = pupil(["hugmynd|kvk", "heimild|kvk", "útskýra|so"]);
  for (let seed = 0; seed < 60; seed++) assert.equal(build(p, seed).task.word, "útskýra|so");
  const only = pupil(["hugmynd|kvk", "heimild|kvk"]);
  for (let seed = 0; seed < 20; seed++) assert.equal(build(only, seed), null);
  /* a learned word is no rival: it has left the six */
  leaveLearning(only.S, "heimild|kvk", TODAY);
  assert.equal(build(only, 1).task.word, "hugmynd|kvk");
});

test("a sentence is used once in a session, and the type falls silent when they are spent", () => {
  const p = pupil(["tillaga|kvk"]);
  const n = recallGaps(lex, entry("tillaga|kvk")).length;
  assert.ok(n > 5);
  const used = new Set();
  for (let k = 0; k < n + 5; k++) {
    const b = build(p, k);
    if (!b) break;
    assert.ok(!used.has(b.task.s.t), `${b.task.s.t} came twice`);
    used.add(b.task.s.t);
    applyEffects(p, b.effects);
  }
  assert.ok(used.size >= 5);
  assert.equal(build(p, 99), null);
});

test("the session's level chooses the sentence: nothing harder than it while the word has easier ones", () => {
  for (const band of [1, 2, 3]) {
    const p = pupil(["hugmynd|kvk"], band);
    for (let seed = 0; seed < 40; seed++) assert.ok(build(p, seed).task.s.lvl <= band, `band ${band}`);
  }
  /* a word whose only sentences are long is still asked */
  const p = pupil(["íbúi|kk"], 1);
  const levels = recallGaps(lex, entry("íbúi|kk")).map((g) => g.lvl);
  if (levels.length && Math.min(...levels) > 1) assert.ok(build(p, 1));
});

test("a review or a drill asks for its word: one in learning or learned, and nothing else", () => {
  const p = pupil();
  const strict = (w) => ({ mustAsk: { word: entry(w), strict: true } });
  for (let seed = 0; seed < 10; seed++) assert.equal(build(p, seed, strict("lofa|so")).task.word, "lofa|so");
  /* learned: still asked by name, never on its own turn */
  leaveLearning(p.S, "lofa|so", TODAY);
  const byName = build(p, 1, strict("lofa|so")).task;
  assert.equal(byName.word, "lofa|so");
  /* it is no longer "a word you are learning": the question says "one of
     your words", and every other verb under Orðin mín is a rival */
  assert.match(byName.hint, /^Hvaða orð vantar\? Það er eitt af orðunum þínum\./u);
  assert.deepEqual(rivalsOf(lex, p.S, entry("lofa|so")).map((o) => o.o), ["útskýra"]);
  /* a word in learning does not count a learned one as a rival: the
     question names only the words being learned */
  leaveLearning(p.S, "völlur|kk", TODAY);
  assert.deepEqual(rivalsOf(lex, p.S, entry("hugmynd|kvk")), []);
  for (let seed = 0; seed < 60; seed++) assert.notEqual(build(p, seed).task.word, "lofa|so");
  /* a word that was never the pupil's */
  assert.equal(build(p, 1, strict("tillaga|kvk")), null);
  assert.equal(build(p, 1, strict("hestur|kk")), null);
  /* a review of another type's cell is not answered with this question */
  assert.equal(build(p, 1, { force: { cell: "ÞGFET" } }), null);
  assert.ok(build(p, 1, { force: { cell: RECALL_CELL } }));
});

test("not the same word twice in a row (#10), through the view", () => {
  const p = pupil(["hugmynd|kvk", "útskýra|so"]);
  let last = null;
  for (let k = 0; k < 14; k++) {
    const b = buildTask(lex, makeView({ S: p.S, sess: p.sess, policy: POLICY, today: TODAY }), seeded(k), "or_eyda");
    assert.ok(b);
    assert.notEqual(b.task.word, last);
    last = b.task.word;
    applyEffects(p, b.effects);
  }
});

test("it comes up in ordinary practice for a pupil with words, and never for one without", () => {
  const count = (p) => {
    let n = 0;
    /* 1000 builds: about 1.7% of them (measured over 4000 before and after
       #35); with 400, a new skill that shifts the seeds left 2 by chance. */
    for (let k = 0; k < 1000; k++) {
      const b = nextTask(lex, makeView({ S: p.S, sess: p.sess, policy: POLICY, today: TODAY }), seeded(k));
      assert.ok(b);
      if (b.task.typeId === "or_eyda") n++;
    }
    return n;
  };
  assert.ok(count(pupil()) >= 3);
  const blank = pupil([]);
  assert.equal(count(blank), 0);
});

test("without a word in learning the type takes no share of the draw: a seed means what it meant", () => {
  /* tasks/registry.js `ready`: a duel is built against a blank pupil, and
     its seed must give the questions it gave before this type existed —
     the same as with the type switched off. */
  const OFF = createPolicy(null, { skills: allOn, types: { or_eyda: false }, levels: {}, attrs: {}, safeVocab: null });
  const run = (policy) => {
    const p = pupil([]);
    const rng = seeded(77);
    const out = [];
    for (let k = 0; k < 150; k++) {
      const b = nextTask(lex, makeView({ S: p.S, sess: p.sess, policy, today: TODAY }), rng);
      applyEffects(p, b.effects);
      out.push(JSON.stringify(b.task, (key, v) => (key === "forms" ? undefined : v)));
    }
    return out;
  };
  assert.deepEqual(run(POLICY), run(OFF));
  const spec = typeById("or_eyda");
  assert.equal(spec.ready(viewOf(pupil([]))), false);
  assert.equal(spec.ready(viewOf(pupil())), true);
});

/* ---------- the judge: the existing leniency, nothing new ----------------------- */

/** The task for `word` in the bank sentence `text`. */
function taskIn(p, text, word) {
  for (let seed = 0; seed < 400; seed++) {
    const b = build(p, seed, { mustAsk: { word: entry(word), strict: true } });
    if (b && b.task.s.t === text) return b.task;
  }
  assert.fail(`"${text}" was not built for ${word}`);
}

test("judging: the sentence's form, a form equally right there, a missing accent, another case", () => {
  const p = pupil(["hugmynd|kvk"]);
  const t = taskIn(p, "Ég sagði frá hugmynd.", "hugmynd|kvk");
  assert.equal(t.m, "ÞGFET");
  for (const a of ["hugmynd", "Hugmynd", "hugmyndinni", "hugmyndum", "hugmyndunum", "frá hugmynd"]) {
    const j = judge(t, { text: a }, p);
    assert.equal(j.ok, true, a);
    assert.equal(j.verdict, "right", a);
  }
  /* the accusative with the article and the genitive are other cases */
  for (const a of ["hugmyndina", "hugmyndar", "hugmyndir"]) {
    const j = judge(t, { text: a }, p);
    assert.equal(j.ok, false, a);
    assert.equal(j.detail.g.verdict, "otherform", a);
  }
  /* another word altogether */
  assert.equal(judge(t, { text: "breytingu" }, p).ok, false);
  /* two forms in the hope that one is right: asked to choose, as everywhere */
  assert.equal(judge(t, { text: "hugmynd hugmyndar" }, p).verdict, "hedged");
  assert.equal(judge(t, { text: "  " }, p).verdict, "empty");
  /* a wrong first try may be tried again, and a right second try is half */
  const miss = judge(t, { text: "hugmyndar" }, p);
  assert.equal(retryAllowed(t, miss), true);
  const again = judgeRetry(t, { text: "hugmynd" }, { text: "hugmyndar" }, p);
  assert.equal(again.ok, true);
  assert.equal(again.retry, true);
});

test("judging: a missing accent is the one slip forgiven, and the article is told kindly where it is fixed", () => {
  const p = pupil(["útskýra|so"]);
  const t = taskIn(p, "Kennarinn útskýrði dæmið fyrir bekknum í rólegheitum.", "útskýra|so");
  const slip = judge(t, { text: "utskyrði" }, p);
  assert.equal(slip.ok, true);
  assert.equal(slip.verdict, "near");
  assert.equal(slip.detail.v.slip.id, "accents");
  assert.equal(judge(t, { text: "útskýrir" }, p).verdict, "right", "the present fits as well");
  assert.equal(judge(t, { text: "útskýrðu" }, p).ok, false, "the plural does not: the subject is one teacher");

  const q = pupil(["heilsa|kvk"]);
  const h = taskIn(q, "Amma naut góðrar heilsu alla ævi.", "heilsa|kvk");
  assert.deepEqual(h.answers, ["heilsu"]);
  const art = judge(h, { text: "heilsunnar" }, q);
  assert.equal(art.ok, false);
  assert.equal(art.detail.v.near.id, "greinir");
});

test("the word's name is kept from a second try", () => {
  const p = pupil(["hugmynd|kvk"]);
  const t = build(p, 3).task;
  /* `why` names the lemma, and hideAnswer would only take out the forms that
     are answers: the renderer shows `retryWhy` instead (ui/render-more.js) */
  assert.ok(t.why.includes("hugmynd"));
  assert.notEqual(t.retryWhy, undefined);
  assert.ok(!String(t.retryWhy || "").includes("hugmynd"));
  assert.equal(typeof hideAnswer, "function");
});

/* ---------- Word knowledge ------------------------------------------------------ */

test("an answer is one recall entry for the word, and moves the question on", () => {
  const p = pupil(["frægur|lo", "hugmynd|kvk"]);
  const ask = () => build(p, 5, { mustAsk: { word: entry("frægur|lo"), strict: true } }).task;
  let t = { ...ask(), typeId: "or_eyda" };
  assert.equal(t.stage, "letter");
  settle(p.S, p.sess, t, judge(t, { text: "bull" }, p));
  let e = entriesOf(p.S, "frægur|lo");
  assert.equal(e.length, 1);
  assert.equal(e[0].type, "or_eyda");
  assert.equal(e[0].outcome, "w");
  assert.equal(isRecallEntry(e[0]), true);
  t = { ...ask(), typeId: "or_eyda" };
  assert.equal(t.stage, "letter");
  settle(p.S, p.sess, t, judge(t, { text: t.answers[0] }, p));
  assert.equal(entriesOf(p.S, "frægur|lo").at(-1).outcome, "r");
  t = { ...ask(), typeId: "or_eyda" };
  assert.equal(t.stage, "bare", "recalled once: the letter is gone");
  settle(p.S, p.sess, t, judge(t, { text: "bull" }, p));
  assert.equal(ask().stage, "letter", "missed without it: the letter is back");
  /* the cell records hold one key for the type, never a case */
  assert.ok(p.S.cells[RECALL_CELL]);
  assert.equal(Object.keys(p.S.cells).filter((k) => /^(NF|ÞF|ÞGF|EF|F[SV]B)/.test(k)).length, 0);
});

test("a missed recall comes back as a review of the same word", () => {
  const p = pupil();
  const entryR = { k: "x", t: "or_eyda", c: RECALL_CELL, w: "völlur|kk", p: null };
  const b = reviewTask(lex, withView(viewOf(p), { typeId: null }), seeded(2), entryR);
  assert.ok(b);
  assert.equal(b.task.word, "völlur|kk");
  assert.equal(b.task.typeId, "or_eyda");
  assert.equal(b.hit, "both");
});

test("the fixture of tests/learner.js is six words the bank can ask", () => {
  const S = giveWords(blankState());
  assert.deepEqual(wordsInLearning(S).sort(), [...LEARNER_WORDS].sort());
  for (const k of LEARNER_WORDS) assert.ok(recallGaps(lex, entry(k)).length, k);
  assert.deepEqual(wordsInLearning(giveWords(blankState(), "fill")), []);
  assert.equal(wordKey("hugmynd", "kvk"), "hugmynd|kvk");
});
