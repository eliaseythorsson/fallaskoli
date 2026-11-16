/* Lýsingarorð: sterk og veik beyging, stigbreyting, samræmi.

     tbl_lo      beygingartafla with a helper noun beside every cell — a
                 noun the adjective is said of (*ferskt epli*, *augljóst
                 svar*; pipeline/adj_classes.py), or none where no noun suits
     revform     "Greindu beygðu myndina": a form straight out of BÍN, analysed.
                 It lives here because Lýsingarorð is the skill it is filed
                 under, but it serves three (`anyOf`): it asks about
                 adjectives, verbs and nouns, whichever of them are on, and
                 the question counts for the class of the word asked.
     lo_beyging  an adjective written into a sentence: strong or weak
     lo_stig     … in the comparative or the superlative
     lo_samr     … agreeing with its noun or its subject */

import { EX } from "../../../data/exercises.js";
import { CASES, GENDERS, readMark } from "../core/marks.js";
import { diffOf } from "../core/difficulty.js";
import { wordKey } from "../core/state.js";
import { adjectiveHelperForm, adjectiveGenders, adjectiveHelperLemma } from "../core/helpers.js";
import { explainDegree } from "./explain.js";
import { personalMM } from "./sagnord.js";
import { nounSentence, adjectiveSentence, nounFrames, adjectiveFrames, showable, frameKey } from "./frames.js";
import { built, FX } from "./effects.js";
import { pick, wpick, shuffle, askable, bandFor, forced, drilling, forcedCell, cellWanted,
         topByRank, wordWeight, cellEase, nearBand, cap1, caseWord, classRankLevel, textSentence } from "./shared.js";

/* ================= Beygingartafla ======================================== */

/* The adjective table names the declension in the words the child has met
   — "án greinis" / "með greini" — and shows a helper noun beside every cell
   (*svört kona*, *svarta konan*), inflected from BÍN. "Sterk beyging" alone
   left the question open: the strong and the weak declension were both
   defensible answers and only one was accepted. */
const ADJ_DEGREES = {
  FSB: { name: "frumstig", article: false },
  FVB: { name: "frumstig", article: true },
  MST: { name: "miðstig", article: null },
  ESB: { name: "efsta stig", article: false },
  EVB: { name: "efsta stig", article: true },
};

/** The helper noun's form for an adjective cell: the article follows the
    declension (weak = with, strong = without; the comparative takes none).
    The noun is the adjective's own (core/helpers.js): null for an adjective
    that is shown without one. */
function helperNounFor(lex, adj, deg, kyn, caseKey, num) {
  const a = ADJ_DEGREES[deg];
  if (!a) return null;
  const mark = `${caseKey}${num}${a.article ? "gr" : ""}`;
  return adjectiveHelperForm(lex, adj, kyn, mark);
}

export function tableAdj(lex, view, rng) {
  const { sess } = view;
  const d = diffOf(sess, "lysingarord");
  if (drilling(view) && !forced(view, ["lo"])) return null;
  const adj = forced(view, ["lo"]) ||
    wpick(topByRank(lex.adjectives, 0.38), (x) => wordWeight(lex, view, x, "lysingarord"), rng);
  /* A review (tasks/review.js) asks for the table its cell is in: that
     degree, gender and number, whatever the difficulty is now. */
  const fc = /^(FSB|FVB|MST|ESB|EVB)-(KK|KVK|HK)-(?:NF|ÞF|ÞGF|EF)(ET|FT)$/.exec(forcedCell(view) || "");
  if (forcedCell(view) && !fc) return null;
  /* Only in a gender the adjective is said of: *óléttur* has a helper noun in
     the feminine alone, and "óléttur maður" is not asked. (A review asks for
     the cell that was missed, whatever it is.) */
  const kyn = fc ? fc[2] : pick(adjectiveGenders(adj), rng);
  const num = fc ? fc[3] : pick(["ET", "FT"], rng);
  /* comparison arrives as difficulty rises */
  let degrees = ["FSB", "FVB"];
  if (d >= 2.5) degrees.push("MST");
  if (d >= 3.5) degrees.push("ESB", "EVB");
  if (fc) degrees = [fc[1]];
  for (const deg of shuffle(degrees, rng)) {
    const a = ADJ_DEGREES[deg];
    const cells = CASES
      .map((cs) => {
        const caseKey = cs.k === "ÞG" ? "ÞGF" : cs.k;
        const h = helperNounFor(lex, adj, deg, kyn, caseKey, num);
        return { m: `${deg}-${kyn}-${caseKey}${num}`, label: cs.name, helper: h ? h.form : null };
      })
      .filter((c) => adj.forms[c.m]);
    if (cells.length < 4) continue;
    if (!view.policy.marks(cells.map((c) => c.m))) continue;
    const article = a.article === null ? "" : a.article ? "með greini" : "án greinis";
    const beyging = deg === "MST" ? "" : a.article ? "veik beyging" : "sterk beyging";
    const spec = [a.name, article, beyging].filter(Boolean).join(", ");
    const sample = cells[0].helper ? `${adj.forms[cells[0].m][0]} ${cells[0].helper}` : null;
    return built({
      type: "table", kind: "lo", skill: "lysingarord", w: adj, cells,
      title: `${adj.o} · ${spec} · ${GENDERS[kyn.toLowerCase()]} ${num === "ET" ? "eintala" : "fleirtala"}`,
      sample,
      base: 5, word: wordKey(adj.o, adj.c), lvl: bandFor(view, "lysingarord"),
      paradigm: adj.forms,
      why: explainDegree(readMark(cells[0].m).stig),
    });
  }
  return null;
}

/* ================= The reverse analysis ================================== */

/* The analysis question for a form pulled straight out of BÍN, so any mood
   of any verb and any degree of any adjective can be asked about. */

const REVERSE_POOLS = [
  { cls: "lo", skill: "lysingarord", fl: "lýsingarorð" },
  { cls: "so", skill: "sagnord", fl: "sagnorð" },
  { cls: "kk", skill: "nafnord", fl: "nafnorð" },
  { cls: "kvk", skill: "nafnord", fl: "nafnorð" },
  { cls: "hk", skill: "nafnord", fl: "nafnorð" },
];

/* Which sentence carries the question (v6.13, critique item 24). Ten frames
   made 60% of these questions: *Þetta gengur ekki án ___* and *Ferðin
   tafðist vegna ___* were the only frames for the indefinite genitive of
   most nouns, and abstract nouns (a third of them) fit almost nothing else.
   Now a bank sentence carries at most one reverse-analysis question a
   session (`sess.frames`), and among the sentences that can show the form,
   those this pupil has met least are likelier (`S.frames`): among the
   sentences that fit a form by 1 / (1 + times seen)², and among a word's
   forms by how fresh their best sentence is (below). Both are written only
   when the question is shown, by the `frame` effect. A form whose every
   sentence is used up this session is not asked as a bare word instead; the
   bare word stays for forms no sentence can show at all. A rescue drill asks
   about one word again and again, and may reuse its sentences. */
const frameWeight = (S) => (key) => 1 / (1 + ((S.frames && S.frames[key]) || 0)) ** 2;

export function taskReverse(lex, view, rng) {
  const { S, sess } = view;
  const P = view.policy;
  const only = view.drillWord || null;
  const pools = REVERSE_POOLS.filter((p) => P.skill(p.skill) && (!only || p.cls === only.c));
  if (!pools.length) return null;
  const used = new Set(only ? [] : sess.frames || []);
  const weight = frameWeight(S);

  for (let k = 0; k < 60; k++) {
    const p = pick(pools, rng);
    const bag = only ? [only] : topByRank(lex.byClass[p.cls] || [], 0.35);
    if (!bag.length) continue;
    const w = only || wpick(bag, (x) => wordWeight(lex, view, x, p.skill), rng);

    /* Only forms with a single analysis inside their own paradigm —
       otherwise the question has more than one correct answer. */
    const counts = new Map();
    Object.entries(w.forms).forEach(([m, ff]) =>
      ff.forEach((f) => counts.set(f, (counts.get(f) || 0) + 1)));
    let marks = Object.keys(w.forms)
      .filter((m) => w.forms[m].some((f) => counts.get(f) === 1));
    if (!marks.length) continue;

    /* Harder forms as the difficulty rises. */
    const d = diffOf(sess, p.skill);
    if (p.cls === "lo" && d < 2.5) marks = marks.filter((m) => /^FSB|^FVB/.test(m));
    else if (p.cls === "lo" && d < 3.5) marks = marks.filter((m) => !/^E(SB|VB)/.test(m));
    if (p.cls === "so" && d < 2.5) marks = marks.filter((m) => /^GM-FH/.test(m));
    else if (p.cls === "so" && d < 3.5) marks = marks.filter((m) => /^GM/.test(m));
    /* Forms BÍN lists and nobody says are not shown as words to analyse: the
       middle voice of a verb that has none in use, and the first and second
       person of a weather verb (*snjóum*). */
    if (p.cls === "so" && !w.mm) marks = marks.filter((m) => !/^MM/.test(m));
    /* …and the first and second person of a miðmynd said only impersonally,
       reciprocally or of things (*líst* is a word, *ég líst* is not):
       tasks/sagnord.js `personalMM` (v6.13 review, S1). */
    if (p.cls === "so" && !personalMM(w)) marks = marks.filter((m) => !/^MM-.*-(1P|2P)-/.test(m));
    if (p.cls === "so" && w.t3) marks = marks.filter((m) => !/-(1P|2P)-|-3P-FT$|-BH-/.test(m));
    marks = marks.filter((m) => askable(P, m) && cellWanted(view, m));
    if (["kk", "kvk", "hk"].includes(p.cls)) marks = marks.filter((m) => showable(w, m));
    if (!marks.length) continue;

    /* How fresh the best sentence that could show each form is: 1 for one
       this pupil has never met, 1 / (1 + times met) otherwise, 0 when every
       one has had its turn this session. Choosing among the sentences that
       fit a form is not enough — for some forms one sentence is all there is
       (the indefinite genitive of an abstract noun: *Þetta gengur ekki án
       ___*) — so a form whose sentences are worn gives way to the word's
       other forms. A form no sentence can show keeps its old chance: it is
       asked as a bare word (never an adjective), as before. */
    const levelOk = (n) => P.level(n);
    const isNoun = ["kk", "kvk", "hk"].includes(p.cls);
    const inBank = lex.occurrencesOf(w.o, w.c).filter((r) => !(r.t.u || []).length && P.level(r.s.lvl));
    const fresh = (mm) => {
      const keys = [
        ...inBank.filter((r) => r.t.m === mm).map((r) => frameKey(r.s)),
        ...(p.cls === "lo" ? adjectiveFrames(lex, w, mm, levelOk)
          : isNoun ? nounFrames(lex, w, mm, levelOk) : []).map((f) => frameKey(f.s)),
      ];
      if (!keys.length) return p.cls === "lo" ? 0 : 1;
      const open = keys.filter((key) => !used.has(key));
      return open.length ? Math.max(...open.map((key) => Math.sqrt(weight(key)))) : 0;
    };
    const reach = new Map(marks.map((mm) => [mm, fresh(mm)]));
    marks = marks.filter((mm) => reach.get(mm) > 0);
    if (!marks.length) continue;
    /* Cells this pupil gets wrong come more often; at a low level the
       easier cells do (`cellEase`, item 16); and a form whose sentences are
       fresh more than one whose sentences are worn (item 24). */
    const ease = (mm) => cellEase(lex, view, p.skill, mm);
    const m = wpick(marks, (mm) => {
      const rec = S.cells[mm];
      const n = rec ? rec.c + rec.w : 0;
      const cell = !rec || n < 3 ? 2 : 0.5 + 2.5 * (rec.w / n);
      return cell * reach.get(mm) * ease(mm);
    }, rng);
    const form = w.forms[m].find((f) => counts.get(f) === 1);
    if (!form) continue;

    /* A sentence beats a bare form. Three routes, best first: a real sentence
       with this exact word in it; a frame with this word substituted in
       (tasks/frames.js); the bare form out of BÍN — still needed for verbs,
       which are never substituted. */
    const occ = inBank.filter((r) => r.t.m === m && !used.has(frameKey(r.s)));
    if (occ.length) {
      const r = wpick(occ, (x) => weight(frameKey(x.s)), rng);
      return built({
        type: "parse", skill: p.skill, base: 4, picks: {},
        s: r.s, i: r.i, t: r.t, a: readMark(r.t.m),
        cell: r.t.m, word: wordKey(w.o, w.c), lvl: r.s.lvl,
        lemmaWord: w,
        homograph: lex.homographClasses(w.o).length > 1 ? lex.homographClasses(w.o) : null,
      }, [FX.frame(frameKey(r.s))]);
    }

    const maxLvl = bandFor(view, p.skill);
    const opts = { maxLvl, levelOk, rng, avoid: used, weight };
    const made = p.cls === "lo" ? adjectiveSentence(lex, w, m, form, opts)
      : isNoun ? nounSentence(lex, w, m, form, opts)
        : null;
    if (made) {
      return built({
        type: "parse", skill: p.skill, base: 4, picks: {},
        s: made.s, i: made.i, t: made.s.tok[made.i], a: readMark(m),
        cell: m, word: wordKey(w.o, w.c), lvl: made.lvl,
        lemmaWord: w, framed: true,
        homograph: lex.homographClasses(w.o).length > 1 ? lex.homographClasses(w.o) : null,
      }, [FX.frame(made.key)]);
    }

    /* v6.11: an adjective is never analysed as a bare word — the sentence
       shows what it agrees with. If no sentence has it, another word. */
    if (p.cls === "lo") continue;
    return built({
      type: "parse", standalone: true,
      skill: p.skill, base: 4, picks: {},
      t: { w: form, l: w.o, c: p.fl, m, x: w.c },
      a: readMark(m),
      cell: m, word: wordKey(w.o, w.c),
      lvl: Math.min(P.maxLevel, Math.round(d)),
      lemmaWord: w,
      homograph: lex.homographClasses(w.o).length > 1 ? lex.homographClasses(w.o) : null,
    });
  }
  return null;
}

/* ================= In a sentence (v6.11) ================================= */

/* Adjective fill-ins from the sentence bank (confirmed tokens: BÍN has the
   mark and the surface form is one of BÍN's forms for it) and from frames
   with a frequent adjective substituted in (tasks/frames.js). The cue names
   the degree, so the context only has to settle gender, number, case and
   strong/weak — which it always does. */
const DEG = { FSB: "frumstig", FVB: "frumstig", MST: "miðstig", ESB: "efsta stig", EVB: "efsta stig" };
/* "Ég sá ___ (hár) tré": *tré* is singular and plural alike, so *hátt* and
   *há* are both right. A slot is used only when the noun after it settles
   the number (and the article) by its form. */
function headSettles(lex, s, i) {
  const n = s.tok[i + 1];
  if (!n || n.c !== "nafnorð") return true;
  const e = lex.entryForToken ? lex.entryForToken(n) : null;
  if (!e) return false;
  const marks = Object.entries(e.forms).filter(([, ff]) => ff.includes(n.w)).map(([m]) => readMark(m));
  return new Set(marks.map((a) => a.tala)).size <= 1 && new Set(marks.map((a) => !!a.greinir)).size <= 1;
}

/* ---------- frames × adjectives (v6.13, critique item 23) -----------------

   lo_stig built 12-16 different questions at any band, lo_beyging and
   lo_samr 25-48: the bank has two or three sentences with a comparative or a
   superlative at each level, and the substituted frames (frames.js) take only
   the fifteen adjectives of FIT_SETS. pipeline/exercises.py ADJ_FRAMES are short
   frames written around a NOUN — "Ég á ___ bíl en þú.", "Bókin er ___ en ég
   hélt." — and here any adjective goes in whose helper noun (pipeline/adj_classes.py,
   `h`) in that gender is that noun: pipeline/adj_classes.py vouches that it is said
   of the noun in every degree and both numbers. An adjective it lists as
   not compared has no comparison forms in the lexicon (pipeline/build_lexicon.py),
   and is not put into any frame (`adjectivesOf`). The noun's form in every
   frame says its number and its definiteness (pipeline/build_exercises.py drops
   *hús*, *epli*), so the mark below is the only right one.

   By band: frames near the band by their level, and adjectives by their
   rank among the adjectives (shared.js `classRankLevel`: the 150 commonest
   at þyngd 1, 350 at 2 …); the question is as hard as the harder of the two. */

const KYN = { kk: "KK", kvk: "KVK", hk: "HK" };
/* How often a question comes from a real sentence of the bank rather than a frame. */
const BANK_SHARE = 0.3;
/** The adjective's mark in a frame: its degree, the noun's gender, case and number. */
export const frameMark = (f) => `${f.deg}-${KYN[f.g]}-${f.nm.replace(/gr$/, "")}`;

/* noun lemma|gender -> the adjectives said of it, commonest first; once per lexicon */
const SAID_OF = new WeakMap();
function adjectivesOf(lex, f) {
  let m = SAID_OF.get(lex);
  if (!m) {
    m = new Map();
    for (const a of lex.adjectives) {
      /* Only adjectives that are compared. One that is not names a state one
         is in or is not (pipeline/adj_classes.py NO_COMPARE: *tilbúinn, dauður,
         grafkyrr*) and reads oddly in a frame that does not expect it:
         "Hér eru tilbúin börn", "Hvar eru dauðu dýrin?". */
      if (!Object.keys(a.forms).some((k) => k.startsWith("MST-"))) continue;
      for (const g of ["kk", "kvk", "hk"]) {
        const n = adjectiveHelperLemma(a, g);
        if (!n) continue;
        const key = `${n}|${g}`;
        if (!m.has(key)) m.set(key, []);
        m.get(key).push(a);
      }
    }
    for (const list of m.values()) list.sort((x, y) => x.r - y.r);
    SAID_OF.set(lex, m);
  }
  return m.get(`${f.n}|${f.g}`) || [];
}

/* the adjectives that have the frame's form, per frame; once per lexicon */
const FOR_FRAME = new WeakMap();
function adjectivesFor(lex, f) {
  let m = FOR_FRAME.get(lex);
  if (!m) FOR_FRAME.set(lex, (m = new Map()));
  if (!m.has(f)) m.set(f, adjectivesOf(lex, f).filter((a) => a.forms[frameMark(f)]));
  return m.get(f);
}
/* A function remembered for the length of one build. */
const memo = (fn) => { const seen = new Map(); return (k) => (seen.has(k) ? seen.get(k) : (seen.set(k, fn(k)), seen.get(k))); };

/**
 * A frame of ADJ_FRAMES with an adjective put in, as an `adjSlot` result, or
 * null. `want` tests the adjective's mark; `place` is "pred", "attr" or null
 * (either). A review's cell (`fc`) and word (`fw`) are honoured exactly.
 */
export function framedAdjective(lex, view, rng, want, { place = null, fc = null, fw = null } = {}) {
  const P = view.policy;
  const b = bandFor(view, "lysingarord");
  const adjLevel = (a) => classRankLevel(a.r);
  const fits = (f) => {
    const all = adjectivesFor(lex, f);
    return fw ? all.filter((a) => a.o === fw.o && a.c === fw.c) : all;
  };
  const markOk = memo((m) => want.test(m) && P.mark(m));
  const frames = (EX.adjFrames || []).filter((f) => {
    const m = frameMark(f);
    return markOk(m) && P.level(f.lvl) && (!fc || m === fc)
      && (place === null || (place === "pred") === !!f.p) && fits(f).length;
  });
  if (!frames.length) return null;
  const f = pick(fc || fw ? frames : nearBand(frames, (x) => x.lvl, b, 12), rng);
  const m = frameMark(f);
  const all = fits(f);
  /* the commonest adjectives at a low band; the rest come in a step at a time */
  const near = fc || fw ? all : all.filter((a) => adjLevel(a) <= Math.max(1, b));
  const w = wpick(near.length ? near : all.slice(0, 12), (x) => wordWeight(lex, view, x, "lysingarord"), rng);
  const { s, i } = textSentence(f.t);
  return { s, i, w, m, lvl: Math.max(f.lvl, Math.min(adjLevel(w), P.maxLevel)), framed: true };
}

function adjSlot(lex, view, rng, want, { pred = null, frames = true, place = null } = {}) {
  const P = view.policy;
  const b = bandFor(view, "lysingarord");
  const firm = (t) => !(t.u || []).length && !t.rj;
  /* A review (tasks/review.js): this cell, and this adjective if one is
     given — from the bank, or put into a frame — or nothing. */
  const fc = forcedCell(view), fw = forced(view, ["lo"]);
  if (drilling(view) && !fw) return null;
  const asked = (r) => (!fc || r.t.m === fc) && (!fw || (r.w.o === fw.o && r.w.c === fw.c));
  const bank = lex.slotsFor("lýsingarorð").filter((r) => want.test(r.t.m) && firm(r.t)
    && P.level(r.s.lvl) && P.mark(r.t.m) && (!pred || pred(r)) && headSettles(lex, r.s, r.i)
    && asked(r));
  if (fc || fw) {
    if (bank.length) { const r = pick(bank, rng); return { s: r.s, i: r.i, w: r.w, m: r.t.m, lvl: r.s.lvl }; }
    const gen = framedAdjective(lex, view, rng, want, { place, fc, fw });
    if (gen) return gen;
    if (!frames || !fc || !want.test(fc) || !P.mark(fc)) return null;
    /* Into a frame: the review's adjective, or a common one that has the form. */
    const words = fw ? [fw] : lex.adjectives.filter((w) => w.r <= 300 + 150 * b && w.forms[fc]);
    for (let k = 0; k < 25 && words.length; k++) {
      const w = pick(words, rng);
      if (!w.forms[fc]) return null;
      const made = adjectiveSentence(lex, w, fc, w.forms[fc][0],
        { maxLvl: fw ? P.maxLevel : b + 1, levelOk: (n) => P.level(n), rng });
      if (made && headSettles(lex, made.s, made.i)) return { s: made.s, i: made.i, w, m: fc, lvl: made.lvl };
    }
    return null;
  }
  /* The bank slots near the band, as every sentence question chooses
     (critique item 13). Until v6.13 these were all the bank's slots at every
     band — about 97 questions in 100 — so a beginner met as many level-5
     sentences as level-1 ones. Not above band + 1, the frames' own ceiling,
     unless the bank has nothing lower: there are only two or three sentences
     with a comparative or superlative at each level, and widening to twelve
     reached level 4 at þyngd 1 (and level 6 for the predicative). */
  const low = bank.filter((r) => r.s.lvl <= b + 1);
  const near = nearBand(low.length ? low : bank, (r) => r.s.lvl, b, 12);
  /* Real sentences a third of the time, the ADJ_FRAMES the rest (item 23):
     at 55% the dozen bank sentences near a band were most of what a pupil
     met. */
  if (near.length && rng() < BANK_SHARE) {
    const r = pick(near, rng);
    return { s: r.s, i: r.i, w: r.w, m: r.t.m, lvl: r.s.lvl };
  }
  const gen = framedAdjective(lex, view, rng, want, { place });
  if (gen) return gen;
  if (!frames) {
    if (near.length) { const r = pick(near, rng); return { s: r.s, i: r.i, w: r.w, m: r.t.m, lvl: r.s.lvl }; }
    return null;
  }
  const pool = lex.adjectives.filter((w) => w.r <= 300 + 150 * b);
  for (let k = 0; k < 25; k++) {
    const w = pick(pool, rng);
    const marks = Object.keys(w.forms).filter((m) => want.test(m) && P.mark(m));
    if (!marks.length) continue;
    const m = pick(marks, rng);
    const made = adjectiveSentence(lex, w, m, w.forms[m][0], { maxLvl: b + 1, levelOk: (n) => P.level(n), rng });
    if (made && headSettles(lex, made.s, made.i)) return { s: made.s, i: made.i, w, m, lvl: made.lvl };
  }
  if (near.length) { const r = pick(near, rng); return { s: r.s, i: r.i, w: r.w, m: r.t.m, lvl: r.s.lvl }; }
  return null;
}

function adjGap(slot, opts) {
  const { s, i, w, m, lvl } = slot;
  const a = readMark(m);
  const deg = DEG[m.split("-")[0]];
  const cap = i === 0;
  return built({
    type: "gap", skill: "lysingarord", s, i, cue: `${w.o} · ${deg}`,
    answers: w.forms[m].map((f) => (cap ? cap1(f) : f)), m, paradigm: w.forms,
    lemmaLabel: "lýsingarorð", base: 12, lvl, word: wordKey(w.o, w.c), cell: m, cap,
    ...opts(a, w),
  });
}

export function loStrongWeak(lex, view, rng) {
  const slot = adjSlot(lex, view, rng, /^(FSB|FVB)-/, { pred: (r) => r.t.r !== "sagnfylling", place: "attr" });
  if (!slot) return null;
  return adjGap(slot, (a) => ({
    title: "Sterk eða veik beyging?",
    hint: "Hefur nafnorðið greini — eða stendur *þessi*, *sá* eða *hinn* á undan?",
    why: a.beyging === "veik"
      ? "**Veik beyging**: lýsingarorðið stendur með nafnorði með greini (eða á eftir *þessi, sá, hinn*): *stóri hesturinn*."
      : "**Sterk beyging**: nafnorðið er án greinis: *stór hestur, stórum hesti*.",
    tags: ["adj"],
  }));
}

export function loDegree(lex, view, rng) {
  const slot = adjSlot(lex, view, rng, /^(MST|ESB|EVB)-/);
  if (!slot) return null;
  return adjGap(slot, (a) => ({
    title: "Stigbreyting í setningu",
    hint: a.stig === "miðstig" ? "Miðstig ber saman tvennt." : "Efsta stig: mest af öllu.",
    why: a.stig === "miðstig"
      ? "**Miðstig** ber saman tvennt og beygist alltaf veikt: *stærri, stærri, stærra*."
      : `**Efsta stig** — ${a.beyging === "veik" ? "hér veikt, því nafnorðið hefur greini" : "hér sterkt"}: *stærstur / stærsti*.`,
    tags: ["adj"],
  }));
}

export function loAgree(lex, view, rng) {
  /* The predicative (*Stelpurnar eru þreyttar*) first; otherwise a strong
     adjective before a feminine or neuter noun, where the ending shows. */
  const pred = rng() < 0.6;
  const slot = pred
    ? adjSlot(lex, view, rng, /^FSB-/, { pred: (r) => r.t.r === "sagnfylling", frames: false, place: "pred" })
    : adjSlot(lex, view, rng, /^FSB-(KVK|HK)-/, { pred: (r) => r.t.r !== "sagnfylling", place: "attr" });
  const use = slot || adjSlot(lex, view, rng, /^FSB-(KVK|HK)-/, { place: "attr" });
  if (!use) return null;
  return adjGap(use, (a) => ({
    title: "Samræmi lýsingarorðs",
    hint: "Að hverju lagar lýsingarorðið sig? Finndu nafnorðið eða frumlagið.",
    why: `Lýsingarorðið stendur í sama kyni, tölu og falli og orðið sem það á við: ${GENDERS[a.kyn]}, ${a.tala}, ${caseWord(a.fall)}.`,
    tags: ["adj", "agree:kyn"],
  }));
}

export const TYPES = [
  { id: "revform", skill: "lysingarord", anyOf: ["lysingarord", "sagnord", "nafnord"],
    weight: 7, renderer: "parse",
    tags: ["adj", "case:EF", "case:NF", "case:ÞF", "case:ÞGF", "noun", "num", "ofl",
      "verb:agree", "verb:mm", "verb:tense", "verb:vh"],
    bands: [1, 2, 3, 4, 5],
    build: taskReverse },
  { id: "tbl_lo", skill: "lysingarord", weight: 6, renderer: "table",
    tags: ["adj", "agree:kyn", "case:EF", "case:NF", "case:ÞF", "case:ÞGF", "form", "num"],
    bands: [1, 2, 3, 4, 5],
    build: tableAdj },
  /* The three below choose a bank sentence near the band (`adjSlot`), and
     the rank cap on the adjectives tried in a frame lets in more words at
     each step. Until v6.13 only the cap read the band, and the critique
     (item 13) rightly counted these three as ignoring difficulty. */
  { id: "lo_beyging", skill: "lysingarord", weight: 8, renderer: "gap",
    tags: ["adj", "agree:kyn", "case:EF", "case:NF", "case:ÞF", "case:ÞGF", "form", "num"],
    bands: [1, 2, 3, 4, 5, 6, 7],
    build: loStrongWeak },
  { id: "lo_stig", skill: "lysingarord", weight: 6, renderer: "gap",
    tags: ["adj", "agree:kyn", "case:NF", "case:ÞF", "form", "num"],
    bands: [1, 2, 3, 4, 5, 6],
    build: loDegree },
  { id: "lo_samr", skill: "lysingarord", weight: 7, renderer: "gap",
    tags: ["adj", "agree:kyn", "case:EF", "case:NF", "case:ÞF", "case:ÞGF", "form", "num"],
    bands: [1, 2, 3, 4, 5, 6, 7],
    build: loAgree },
];
