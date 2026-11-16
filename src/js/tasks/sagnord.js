/* Sagnorð: persóna, tala, tíð, háttur, mynd.

     verb      "Beygðu sögnina": one form of a verb after its subject
     verbslot  the same inside a whole sentence from the bank
     tbl_so    beygingartafla: all six persons of one tense
     so_beyging   sterk or veik verb by its past, and the kennimyndir, as
                  Lesefni teaches them (item 27)
     so_mynd      germynd, miðmynd or þolmynd: a verb phrase of a bank
                  sentence, only where the analysis is certain (item 27)
     so_bodhattur the boðháttur written, singular and plural (item 27) */

import { readMark } from "../core/marks.js";
import { diffOf } from "../core/difficulty.js";
import { skillLevel } from "../core/progress.js";
import { wordKey } from "../core/state.js";
import { explainVerbForm, conjugationNote } from "./explain.js";
import { built, FX } from "./effects.js";
import { pick, wpick, shuffle, askable, bandFor, forced, drilling, forcedCell, topByRank,
         shareForLevel, wordWeight, cellWeight, cellEase, fresh, textSentence } from "./shared.js";

/* ================= Sagnbeyging ========================================== */

const SUBJECTS = [["1P-ET", "ég"], ["2P-ET", "þú"], ["3P-ET", "hann"],
                  ["1P-FT", "við"], ["2P-FT", "þið"], ["3P-FT", "þeir"]];
const THIRD_ONLY_SUBJECTS = [["3P-ET", "það"]];

/** The words shown before the blank. The subjunctive is not something one
    says after a bare pronoun — "ég komi" — so it is shown the way it is met:
    after *þótt*, which takes it in both tenses (*þótt ég komi*, *þótt ég
    kæmi*). */
export const subjectLabel = (pref, pron) =>
  /-VH-/.test(pref + "-") ? "þótt " + pron : pron;

/* Every form "Beygðu sögnina" can ask for, with the words it is named by.
   `taskVerb` opens them one by one as the difficulty rises; a review asks for
   the one that was missed, whatever the difficulty is now. */
const VERB_SPECS = [
  ["GM-FH-NT", "nútíð, framsöguháttur, germynd"],
  ["GM-FH-ÞT", "þátíð, framsöguháttur, germynd"],
  ["GM-VH-NT", "nútíð, viðtengingarháttur"],
  ["GM-VH-ÞT", "þátíð, viðtengingarháttur"],
  ["MM-FH-NT", "nútíð, miðmynd"],
  ["MM-FH-ÞT", "þátíð, miðmynd"],
];

const verbTask = (view, v, pref, label, sfx, who) => {
  const m = pref + "-" + sfx;
  return built({
    type: "verb", skill: "sagnord", v, m, pron: subjectLabel(pref, who), label,
    answers: v.forms[m], a: readMark(m),
    lvl: Math.min(view.policy.maxLevel, Math.round(diffOf(view.sess, "sagnord"))),
    base: 12, cell: m, word: wordKey(v.o, v.c), paradigm: v.forms,
    conj: verbConjugation(v),
  });
};

/** "Beygðu sögnina" for the one cell a review asks for (tasks/review.js) —
    of the review's verb, or of a common verb that has the form. */
function forcedVerb(lex, view, rng, pool) {
  const fc = forcedCell(view);
  const spec = VERB_SPECS.find(([pref]) => fc.startsWith(pref + "-"));
  if (!spec || !askable(view.policy, fc)) return null;
  const sfx = fc.slice(spec[0].length + 1);
  const has = (v) => {
    const sub = (v.t3 ? THIRD_ONLY_SUBJECTS : SUBJECTS).find(([x]) => x === sfx);
    /* The middle voice only of a verb that has one in use, as below. */
    return v.forms[fc] && sub && (!/^MM/.test(fc) || v.mm) ? sub : null;
  };
  const only = forced(view, ["so"]);
  const bag = only ? [only] : pool.filter(has);
  if (!bag.length) return null;
  const v = only || wpick(bag, (x) => wordWeight(lex, view, x, "sagnord"), rng);
  const sub = has(v);
  return sub ? verbTask(view, v, spec[0], spec[1], sub[0], sub[1]) : null;
}

export function taskVerb(lex, view, rng) {
  const { sess, S } = view;
  const L = skillLevel(S.skills.sagnord.xp).level;
  const d = diffOf(sess, "sagnord");
  if (drilling(view) && !forced(view, ["so"])) return null;
  const pool = topByRank(lex.verbs, shareForLevel(L, 0.21, 0.09));
  if (forcedCell(view)) return forcedVerb(lex, view, rng, pool);
  const v = forced(view, ["so"]) || wpick(pool, (x) => wordWeight(lex, view, x, "sagnord"), rng);

  const specs = [
    ["GM-FH-NT", "nútíð, framsöguháttur, germynd"],
    ["GM-FH-ÞT", "þátíð, framsöguháttur, germynd"],
  ];
  if (d >= 2.5) specs.push(["GM-VH-NT", "nútíð, viðtengingarháttur"]);
  if (d >= 3) specs.push(["GM-VH-ÞT", "þátíð, viðtengingarháttur"]);
  /* The middle voice only of a verb that has one anybody uses (`mm`, set by
     the build from the corpus): BÍN lists *hlakkast* and *pissast* too. */
  if (v.mm && d >= 3.5) specs.push(["MM-FH-NT", "nútíð, miðmynd"]);
  if (v.mm && d >= 4) specs.push(["MM-FH-ÞT", "þátíð, miðmynd"]);

  /* A weather verb or one with no nominative subject (`t3`) is asked in the
     third person singular with *það*: "það snjóar", never "ég snjóa". */
  const subs = v.t3 ? THIRD_ONLY_SUBJECTS : SUBJECTS;

  /* Among the tenses that are open, and among the persons, the easier cells
     come more often at a low level (`cellEase`, item 16): the present before
     the subjunctive, *ég* before *þið*. A tense is weighed by its third
     person singular. */
  const P = view.policy;
  const ease = (m) => cellEase(lex, view, "sagnord", m);
  for (let k = 0; k < 12; k++) {
    const [pref, label] = wpick(specs, ([p]) => ease(p + "-3P-ET"), rng);
    const cands = subs.filter(([sfx]) =>
      v.forms[pref + "-" + sfx] && askable(P, pref + "-" + sfx));
    if (!cands.length) continue;
    const [sfx, who] = wpick(cands, ([x]) => ease(pref + "-" + x), rng);
    return verbTask(view, v, pref, label, sfx, who);
  }
  return null;
}

/* ================= A verb inside a sentence — cloze ====================== */

/* A verb inside a whole sentence — the context is what helps a pupil with a
   language disorder. The token has to be confirmed (lex.slotsFor): BÍN has the
   mark and the surface form in the sentence is one of BÍN's forms for it, so
   the cloze cannot ask for a form that does not fit its own sentence. */

const FINITE = /^(GM|MM)-(FH|VH)-/;

export function taskVerbSlot(lex, view, rng) {
  const { S, sess } = view;
  const d = diffOf(sess, "sagnord");

  const P = view.policy;
  const allowed = (m) => {
    if (!FINITE.test(m)) return false;                 // finite forms only
    if (d < 2.5 && !/^GM-FH/.test(m)) return false;    // subjunctive later
    if (d < 3.5 && /^MM/.test(m)) return false;        // middle voice last
    return askable(P, m);                              // and the policy allows it
  };

  /* The blank shows the form's analysis as the thing to produce. Where the
     build could not settle the tense or the person, that analysis is a guess
     ("Þegar við *komum* heim" came out as present tense), and the mood of a
     form that is the same in both moods is only safe in a main clause. */
  const firm = (t) => {
    const u = t.u || [];
    if (u.includes("tíð") || u.includes("persóna") || u.includes("tala")) return false;
    if (u.includes("háttur") && t.k !== "aðalsetning") return false;
    return true;
  };
  if (drilling(view) && !forced(view, ["so"])) return null;
  const only = forced(view, ["so"]);
  /* A review (tasks/review.js) asks for one cell, whatever the difficulty is
     now — the pupil has met it, that is how it was missed — and in a sentence
     at their level if there is one, otherwise in any they may meet. */
  const fc = forcedCell(view);
  let slots;
  if (fc) {
    const all = lex.slotsFor("sagnorð").filter((r) => r.t.m === fc && FINITE.test(fc) &&
      askable(P, fc) && firm(r.t) && P.level(r.s.lvl) &&
      (!only || (r.w.o === only.o && r.w.c === only.c)));
    const near = all.filter((r) => r.s.lvl <= bandFor(view, "sagnord"));
    slots = near.length ? near : all;
  } else slots = lex.slotsFor("sagnorð").filter(
    (r) => allowed(r.t.m) && firm(r.t) && P.level(r.s.lvl) &&
      /* A drill takes any sentence the word is in, whatever its level. */
      (only ? r.w.o === only.o && r.w.c === only.c : r.s.lvl <= bandFor(view, "sagnord")));
  if (!slots.length) return null;

  const r = wpick(slots, (x) =>
    cellWeight(S, x.t.m) * cellEase(lex, view, "sagnord", x.t.m)
      * wordWeight(lex, view, x.w, "sagnord"), rng);
  const { s, i, t, w: v } = r;

  return built({
    type: "verbslot", skill: "sagnord", s, i, v, m: t.m,
    /* *hittust* is a form of *hittast*; the child is shown that infinitive. */
    shown: (/^MM/.test(t.m) && (v.forms["MM-NH"] || [])[0]) || v.o,
    answers: v.forms[t.m], a: readMark(t.m),
    lvl: s.lvl, base: 14, cell: t.m, word: wordKey(v.o, v.c),
    paradigm: v.forms, conj: verbConjugation(v),
    why: explainVerbForm(s, i),
  });
}

/* Verbs the rule of thumb below gets wrong, or that the schoolbooks do not
   agree on, so nothing is said about them: the preterite-presents have their
   own name, and the rest have a weak past beside a strong one (*þiggja*: þáði
   / þá), a past in -ri (*snúa*: sneri) or are simply irregular (*valda*:
   olli). */
const PRETERITE_PRESENT = new Set(["eiga", "mega", "unna", "kunna", "muna", "munu",
  "skulu", "þurfa", "vita"]);
const CONJUGATION_UNSAID = new Set(["vilja", "valda", "þiggja", "kvíða", "flá", "tyggja",
  "spýja", "ljá", "þvo", "sá", "heyja", "róa", "gróa", "núa", "snúa", "gnúa", "fregna",
  "mala", "blóta", "vera"]);

/** sterk / veik / núþáleg, derived from the past tense — BÍN does not mark
    this. Null where the derivation is not safe. */
export function verbConjugation(v) {
  if (PRETERITE_PRESENT.has(v.o)) return "núþáleg";
  if (CONJUGATION_UNSAID.has(v.o)) return null;
  const pasts = [...(v.forms["GM-FH-ÞT-1P-ET"] || []), ...(v.forms["GM-FH-ÞT-3P-ET"] || [])];
  const inf = (v.forms["GM-NH"] || [v.o])[0];
  if (!pasts.length || !inf) return null;
  const weak = (p) => /(aði|ði|di|ti)$/.test(p);
  /* Two pasts of different kinds (BÍN lists both) -> say nothing. */
  if (pasts.some(weak) !== pasts.every(weak)) return null;
  if (pasts.every(weak)) return "veik";
  const vowels = (w) => (w.match(/[aáeéiíoóuúyýæö]+/g) || []).join("");
  return vowels(pasts[0]) !== vowels(inf.replace(/a$/, "")) ? "sterk" : null;
}

/* ================= Beygingartafla ======================================== */

export function tableVerb(lex, view, rng) {
  const { sess } = view;
  const d = diffOf(sess, "sagnord");
  /* A table has six cells, and a verb said only of the weather has one. */
  if (drilling(view) && !forced(view, ["so"])) return null;
  if (forced(view, ["so"]) && forced(view, ["so"]).t3) return null;
  const v = forced(view, ["so"]) || wpick(topByRank(lex.verbs, 0.36).filter((x) => !x.t3),
    (x) => wordWeight(lex, view, x, "sagnord"), rng);
  let prefs = ["GM-FH-NT", "GM-FH-ÞT"];
  if (d >= 3) prefs.push("GM-VH-ÞT");
  if (v.mm && d >= 4) prefs.push("MM-FH-NT");
  const NAME = { "GM-FH-NT": "nútíð · framsöguháttur", "GM-FH-ÞT": "þátíð · framsöguháttur",
                 "GM-VH-ÞT": "þátíð · viðtengingarháttur", "MM-FH-NT": "nútíð · miðmynd" };
  /* A review asks for the tense its cell is in (of the four a table has). */
  const fc = forcedCell(view);
  if (fc) prefs = Object.keys(NAME).filter((p) => fc.startsWith(p + "-") && (!/^MM/.test(p) || v.mm));
  for (const pref of shuffle(prefs, rng)) {
    const cells = SUBJECTS
      .map(([sfx, p]) => ({ m: pref + "-" + sfx, label: subjectLabel(pref, p) }))
      .filter((c) => v.forms[c.m]);
    if (cells.length < 6) continue;
    if (!view.policy.marks(cells.map((c) => c.m))) continue;
    return built({
      type: "table", kind: "so", skill: "sagnord", w: v, cells,
      title: `${v.o} · ${NAME[pref]}`, base: 5, word: wordKey(v.o, v.c),
      lvl: bandFor(view, "sagnord"), paradigm: v.forms,
      why: conjugationNote(v.o, verbConjugation(v)),
    });
  }
  return null;
}

/* ================= item 27, second half ================================= *
 *
 * Three things Lesefni teaches and practice did not ask (critique item 27):
 * strong and weak verbs with their kennimyndir ("sterkar-veikar"), the
 * þolmynd as something to recognise ("mynd"), and the boðháttur
 * ("hattur"). Every form shown or accepted is BÍN's (the lexicon); every
 * sentence is a bank sentence, except the lesson's own *þú lest* kind,
 * which is made from BÍN forms alone. */

/** Of the verbs in `pool` (wrapped as { v }), the commonest `share` of all
    verbs. `r` is a verb's rank among the verbs (1 = commonest). */
function commonestVerbs(lex, pool, share) {
  const cut = Math.max(20, Math.ceil(lex.verbs.length * share));
  const out = pool.filter((y) => y.v.r <= cut);
  return out.length ? out : pool;
}

/* Did the vowel of the stem change from the infinitive to the past? The
   vowels of the whole word are compared, as `verbConjugation` compares them,
   once the infinitive's *-a* and the weak past's ending are off: *kaup-* /
   *keyp-ti* yes, *trú-* / *trú-ði* no, *fyrirgef-* / *fyrirgaf* yes (the
   prefix keeps its vowel; the root's is what changed). */
const vowelsOf = (w) => (String(w).toLowerCase().match(/[aáeéiíoóuúyýæö]+/g) || []).join("");
const stemVowelChanges = (nh, past) =>
  vowelsOf(nh.replace(/a$/, "")) !== vowelsOf(past.replace(/(að|ð|d|t)i$/, ""));

/* ---- Sterk eða veik sögn, og kennimyndir -------------------------------- */

/* The kennimyndir as Lesefni lists them, with the words the lesson puts
   before each (*(ég) fór, (við) fórum, (ég hef) farið*) and the cells of its
   own table (core/lessons.js, table "kennimyndir"). */
export const KENNIMYNDIR = [
  { m: "GM-NH", h: "að" },
  { m: "GM-FH-ÞT-1P-ET", h: "ég" },
  { m: "GM-FH-ÞT-1P-FT", h: "við" },
  { m: "GM-SAGNB", h: "ég hef" },
];

/* `verbConjugation` above says nothing where the past keeps the vowel of
   the infinitive, which is right for the odd cases it guards against. These
   two are the commonest strong verbs there are, the lesson's *Hún kom í gær*
   among them, and no book disagrees about them. */
const STRONG_SAME_VOWEL = new Set(["koma", "sjá"]);

/**
 * sterk / veik by the lesson's rule, or null when the question may not ask
 * the verb. The rule is `verbConjugation`'s (the same one the notes under
 * every verb question use, so the two can never disagree): the past with
 * *ég* ends in *-aði, -ði, -di* or *-ti* → veik; no ending and the vowel
 * changes → sterk. Left out: the núþálegar sagnir (the lesson sets them
 * aside), the verbs the books disagree on or that have two pasts, a verb
 * said only in the third person, and any verb BÍN lacks a kennimynd for.
 */
export function verbKind(v) {
  if (!v || v.t3) return null;
  if (!KENNIMYNDIR.every((k) => (v.forms[k.m] || []).length)) return null;
  const c = verbConjugation(v);
  if (c === "sterk" || c === "veik") return c;
  return c === null && STRONG_SAME_VOWEL.has(v.o) ? "sterk" : null;
}

/* Every verb the question may ask, once per lexicon. `trap`: a weak verb
   whose vowel changes in the past all the same — the lesson's warning,
   *kaupa – keypti, telja – taldi, spyrja – spurði*. */
const KIND_POOL = new WeakMap();
function verbKindPool(lex) {
  if (KIND_POOL.has(lex)) return KIND_POOL.get(lex);
  const list = [];
  for (const v of lex.verbs) {
    const kind = verbKind(v);
    if (!kind) continue;
    const trap = kind === "veik" && stemVowelChanges(v.forms["GM-NH"][0], v.forms["GM-FH-ÞT-1P-ET"][0]);
    list.push({ v, kind, trap });
  }
  KIND_POOL.set(lex, list);
  return list;
}

/* The ending of a weak past, said the way the lesson says it. */
const weakEnding = (f) => (/aði$/.test(f) ? "-aði" : /ði$/.test(f) ? "-ði" : /di$/.test(f) ? "-di" : "-ti");

function verbKindWhy(x) {
  const { v, kind, trap } = x;
  const f = (m) => v.forms[m][0];
  const nh = f("GM-NH"), past = f("GM-FH-ÞT-1P-ET"), pl = f("GM-FH-ÞT-1P-FT"), sb = f("GM-SAGNB");
  if (kind === "veik") {
    const warn = trap ? ` Sérhljóðið breytist líka (*${nh} – ${past}*), en það er endingin sem ræður.` : "";
    return `*í gær ${past} ég*: þátíðin fær **endingu** (${weakEnding(past)}), og þá er sögnin **veik**.${warn} `
      + `Kennimyndirnar eru þrjár: *${nh} – ${past} – ${sb}*. Fleirtalan í þátíð, *(við) ${pl}*, er regluleg.`;
  }
  const how = STRONG_SAME_VOWEL.has(v.o) ? "hún er eitt atkvæði" : `sérhljóðið breytist (*${nh} – ${past}*)`;
  return `*í gær ${past} ég*: þátíðin fær **enga endingu** og ${how}. Þá er sögnin **sterk**. `
    + `Kennimyndirnar eru fjórar: *${nh} – ${past} – ${pl} – ${sb}*.`;
}

/* What the pupil writes at each step. The words around a box are the
   lesson's: *í gær … ég* (its rule of thumb), then *ég, við, ég hef*. They
   may be typed too (`pre`, `post`), as the pupil says them in their head. */
const SLOT_PAST = { m: "GM-FH-ÞT-1P-ET", h: "í gær", after: "ég", pre: ["í gær", "ég"], post: ["ég"] };
const SLOTS_KENNI = [
  { m: "GM-FH-ÞT-1P-ET", h: "ég", pre: ["í gær ég", "ég", "í gær"], post: ["ég"] },
  { m: "GM-FH-ÞT-1P-FT", h: "við", pre: ["við"] },
  { m: "GM-SAGNB", h: "ég hef", pre: ["ég hef", "hef"] },
];

/**
 * Sterk eða veik sögn? The lesson's test: *í gær* and the verb with *ég*.
 *
 *   þyngd 1–2  all the kennimyndir shown, common verbs, no weak verb whose
 *              vowel changes; the pupil decides
 *   þyngd 3–4  the infinitive only: the pupil writes *í gær … ég* and
 *              decides. About one question in three is a *kaupa – keypti*
 *   þyngd 5–   the infinitive only: the pupil writes the past singular and
 *              plural and the sagnbót, then decides; every verb, the rarer
 *              as often as the common
 *
 * Asked as many times strong as weak: the lexicon has six weak verbs for
 * every strong one, and "veik" every time must not be a guess that pays.
 */
export function soBeyging(lex, view, rng) {
  if (drilling(view) && !forced(view, ["so"])) return null;
  const b = bandFor(view, "sagnord");
  const fw = forced(view, ["so"]);
  const fc = forcedCell(view);
  if (fc && !/^sobeyging:(sterk|veik)$/.test(fc)) return null;
  const slots = b >= 5 ? SLOTS_KENNI : b >= 3 ? [SLOT_PAST] : [];
  if (!slots.every((sl) => askable(view.policy, sl.m))) return null;
  const all = verbKindPool(lex);
  let x;
  if (fw) {
    x = all.find((y) => y.v === fw);
    if (!x || (fc && fc !== "sobeyging:" + x.kind)) return null;
  } else {
    let pool = all.filter((y) => !fc || fc === "sobeyging:" + y.kind);
    if (b < 3) pool = commonestVerbs(lex, pool, 0.25).filter((y) => !y.trap);
    else {
      if (b < 5) pool = commonestVerbs(lex, pool, 0.6);
      if (rng() < 0.3) {
        const traps = pool.filter((y) => y.trap);
        if (traps.length) pool = traps;
      }
    }
    if (!pool.length) return null;
    if (!fc && !pool.every((y) => y.trap)) {
      const want = rng() < 0.5 ? "sterk" : "veik";
      const side = pool.filter((y) => y.kind === want);
      if (side.length) pool = side;
    }
    /* From þyngd 5 the falloff of `wordWeight` is undone, as in no_beyging:
       the rarer verbs come up as often as the common ones. */
    const flat = b >= 5 ? (y) => 1 + y.v.r / 150 : () => 1;
    x = wpick(pool, (y) => wordWeight(lex, view, y.v, "sagnord") * flat(y), rng);
  }
  const { v, kind, trap } = x;
  const forms = (m) => v.forms[m].join(" / ");
  return built({
    type: "slots", skill: "sagnord", v, word: wordKey(v.o, v.c), lesson: "sterkar-veikar",
    title: "Sterk eða veik sögn?",
    question: b >= 5
      ? "Skrifaðu þátíðina með *ég* og *við* og sagnbótina. Veldu svo: er sögnin sterk eða veik?"
      : b >= 3
        ? "Segðu *í gær* og sögnina með *ég*: skrifaðu þátíðina. Veldu svo: er sögnin sterk eða veik?"
        : "Hér eru kennimyndir sagnarinnar. Er hún sterk eða veik? Skoðaðu þátíðina.",
    show: (b < 3 ? KENNIMYNDIR : [KENNIMYNDIR[0]]).map((k) => ({ h: k.h, f: forms(k.m) })),
    slots: slots.map((sl) => ({ ...sl, accepted: v.forms[sl.m] })),
    paradigm: v.forms, conj: kind,
    options: ["sterk", "veik"], answer: kind,
    solution: KENNIMYNDIR.map((k) => ({ h: k.h, f: forms(k.m) })),
    why: verbKindWhy(x),
    base: 6 + 2 * slots.length, lvl: b, cell: "sobeyging:" + kind,
    tags: [
      "sobeyg", ...(trap ? ["sobeyg:hljod"] : []),
      ...(slots.length ? ["form"] : []),
      ...(slots.length && kind === "sterk" ? ["verb:strongpast"] : []),
    ],
    miss: ["beyging_so"],
    /* *keypti* called strong because the vowel changed: the lesson's warning. */
    missFor: trap ? { sterk: ["beyging_so", "beyging_so_hljod"] } : null,
  });
}

/* ---- Germynd, miðmynd eða þolmynd? --------------------------------------- */

export const MYNDIR = ["germynd", "miðmynd", "þolmynd"];
const MYND_CELL = { germynd: "somynd:germynd", miðmynd: "somynd:midmynd", þolmynd: "somynd:tholmynd" };

/* A participle after *vera* that is NOT a þolmynd: the subject did it
   itself (*hann er farinn, tíminn var búinn, vikan væri liðin, hann er
   kominn*), or the participle is a state as much as an event (*safnið er
   lokað á mánudögum, æfingunni var lokið*). The lesson's test — "the subject
   does nothing itself" — does not settle those for a pupil, so they are
   never asked. Measured over the bank: with these out, every *vera / verða*
   + participle left is a þolmynd. */
const NOT_PASSIVE = new Set(["búa", "fara", "koma", "hverfa", "verða", "vera", "líða", "gróa", "mæta",
  "flytja", "deyja", "sofna", "detta", "falla", "vaxa", "hætta", "loka", "ljúka", "eiga", "hafa"]);
/* Germynd is asked of a main verb only: *er*, *hefur*, *mun* or *getur* in a
   sentence that also holds a participle or an infinitive is half a verb
   phrase, and *vera* is the very word the þolmynd is made with. */
const GM_SKIP = new Set(["vera", "verða", "hafa", "munu", "skulu", "geta", "mega", "eiga", "vilja",
  "ætla", "þurfa", "kunna", "fá", "hljóta", "byrja", "hætta"]);

const lower = (w) => String(w || "").toLowerCase();
/* The cells of entry `e` in voice `voice` ("GM" / "MM") that have form `w`. */
const voiceCells = (e, w, voice) => Object.entries(e.forms)
  .filter(([m, fs]) => m.startsWith(voice + "-") && fs.some((f) => lower(f) === lower(w))).map(([m]) => m);

/**
 * Every verb phrase of the bank whose mynd is certain, once per lexicon.
 *
 *   þolmynd   a participle (LHÞT, or the neuter the parser files as
 *             sagnbót) of a verb not in NOT_PASSIVE, after *vera* or
 *             *verða* in the same clause, with at most two words between
 *             (*var okkur sagt*) and no other verb, conjunction or
 *             punctuation. *Hefur verið* takes its *hefur* along. The
 *             phrase is marked as a whole.
 *   miðmynd   a verb the parser files as MM that ends in *-st*, and whose
 *             form BÍN has in the miðmynd and in no cell of the germynd:
 *             *fannst, komst, sást* are also *þú fannst, þú komst*, and are
 *             not asked.
 *   germynd   a finite main verb (not GM_SKIP) whose form BÍN has in the
 *             germynd and in no cell of the miðmynd, and that does not end
 *             in *-st*. Those (*þú lest*) are the lesson's warning, made
 *             from BÍN at þyngd 5 (`stGermynd`).
 * Anything the parser left unsure of its voice (`u`) is skipped.
 */
const MYND_SLOTS = new WeakMap();
function myndSlots(lex) {
  if (MYND_SLOTS.has(lex)) return MYND_SLOTS.get(lex);
  const list = [];
  lex.sentences.forEach((s) => s.tok.forEach((t, i) => {
    if (t.c !== "sagnorð" || t.rj || !t.l || (t.u || []).includes("mynd")) return;
    const e = lex.entryForToken(t);
    if (!e) return;
    const m = t.m || "";
    const base = { s, i, t, verb: e, key: `${s.t}#${i}` };
    if (/^LHÞT/.test(m) || m === "GM-SAGNB") {
      if (NOT_PASSIVE.has(e.o)) return;
      let j = i - 1;
      while (j >= 0 && i - j <= 3 && s.tok[j].c && s.tok[j].c !== "sagnorð" && s.tok[j].c !== "samtenging"
             && s.tok[j].k === t.k) j--;
      const a = s.tok[j];
      if (!a || a.c !== "sagnorð" || !["vera", "verða"].includes(a.l) || a.k !== t.k || i - j > 3) return;
      const marks = [j, i];
      if (a.m === "GM-SAGNB") {
        const h = s.tok[j - 1];
        if (!h || h.c !== "sagnorð" || h.l !== "hafa") return;
        marks.unshift(j - 1);
      } else if (!/^GM-(FH|VH)-/.test(a.m || "")) return;
      /* Nobody named as doing it, not even a subject in the nominative:
         *Okkur var sagt*, *Fundinum var frestað*. Asked from þyngd 3. */
      const before = s.tok[marks[0] - 1], after = s.tok[j + 1];
      const dat = (x) => x && /^ÞGF/.test(x.m || "");
      const impersonal = dat(before) || (j + 1 < i && dat(after));
      list.push({ ...base, mynd: "þolmynd", marks, aux: a, impersonal });
      return;
    }
    if (/^MM-/.test(m)) {
      if (!/st$/i.test(t.w) || voiceCells(e, t.w, "GM").length || !voiceCells(e, t.w, "MM").length) return;
      if (!(e.forms["MM-NH"] || []).length) return;
      list.push({ ...base, mynd: "miðmynd", marks: [i] });
      return;
    }
    if (/^GM-(FH|VH)-/.test(m)) {
      if (GM_SKIP.has(e.o) || /st$/i.test(t.w)) return;
      if (!voiceCells(e, t.w, "GM").length || voiceCells(e, t.w, "MM").length) return;
      if (!(e.forms["GM-NH"] || []).length) return;
      list.push({ ...base, mynd: "germynd", marks: [i] });
    }
  }));
  MYND_SLOTS.set(lex, list);
  return list;
}

/* The lesson's warning, *„Þú lest“ og „þú veist“ eru germynd*: the second
   person singular of a common verb that ends in *-st* and is no form of any
   miðmynd in BÍN. Shown as the lesson shows it, *þú* and the verb. */
const ST_SKIP = new Set(["deyja", "míga", "ljúga"]);
const ST_CELLS = [["GM-FH-NT-2P-ET", "nútíð"], ["GM-FH-ÞT-2P-ET", "þátíð"]];
const ST_POOL = new WeakMap();
function stGermynd(lex) {
  if (ST_POOL.has(lex)) return ST_POOL.get(lex);
  const list = [];
  for (const v of lex.verbs) {
    if (v.t3 || v.r > 120 || ST_SKIP.has(v.o) || !(v.forms["GM-NH"] || []).length) continue;
    const mm = new Set(Object.entries(v.forms).filter(([m]) => m.startsWith("MM-")).flatMap(([, fs]) => fs.map(lower)));
    for (const [m, tid] of ST_CELLS) {
      for (const f of v.forms[m] || []) {
        if (!/st$/.test(f) || mm.has(lower(f))) continue;
        const { s } = textSentence(`þú ${f}`);
        list.push({ s, i: 1, marks: [1], verb: v, cellM: m, tid, mynd: "germynd", trap: true, key: `þú ${f}` });
      }
    }
  }
  ST_POOL.set(lex, list);
  return list;
}

const phraseOf = (x) => x.marks.map((k) => x.s.tok[k].w).join(" ").replace(/^\p{Lu}/u, (c) => c.toLowerCase());

function myndWhy(x) {
  const p = phraseOf(x);
  if (x.trap) {
    const nh = x.verb.forms["GM-NH"][0];
    return `*${p}* endar á *-st*, en það er **germynd**: 2. persóna eintölu í ${x.tid} af *${nh}* (*þú ${p}*). `
      + `Prófaðu nafnháttinn: *að ${nh}* endar ekki á *-st*.`;
  }
  if (x.mynd === "miðmynd") {
    return `*${p}* er í **miðmynd**. Nafnhátturinn er *að ${x.verb.forms["MM-NH"][0]}* og endar á *-st*.`;
  }
  if (x.mynd === "þolmynd") {
    return `*${p}* er í **þolmynd**: hjálparsögnin *${x.aux.l}* og lýsingarháttur þátíðar af *${x.verb.o}*. `
      + `Sá sem gerir verkið er ekki frumlagið, og oft er hann alls ekki nefndur.`;
  }
  return `*${p}* er í **germynd**, venjulegu myndinni. Sögnin endar ekki á *-st* (nafnhátturinn er `
    + `*að ${x.verb.forms["GM-NH"][0]}*), og hún er ekki *vera* eða *verða* með lýsingarhætti þátíðar.`;
}

/**
 * "Í hvaða mynd er *var byggð*?" A verb phrase of a bank sentence, marked,
 * and the three myndir of the lesson to choose from.
 *
 *   þyngd 1–2  short sentences (bank level 3 at most); þolmynd only with a
 *              subject in the nominative (*Bókin hafði verið lesin*)
 *   þyngd 3–4  sentences to level 5; the þolmynd with no nominative
 *              (*Okkur var sagt*) too
 *   þyngd 5–   every sentence, and one question in four is the lesson's
 *              warning: *þú lest*, an *-st* that is germynd
 *
 * The bank has few þolmynd sentences below level 6, so where a mynd has
 * fewer than eight sentences at the band, its eight shortest are used. A
 * mynd is chosen first and then a sentence: germynd is twenty times as
 * common in the bank, and the question would otherwise always be germynd.
 * A mynd with few sentences at the band is chosen less often (`weight`), so
 * that the eight short þolmynd sentences of þyngd 1 do not come round every
 * third question.
 */
export function soMynd(lex, view, rng) {
  if (drilling(view) && !forced(view, ["so"])) return null;
  const P = view.policy;
  const b = bandFor(view, "sagnord");
  const fw = forced(view, ["so"]);
  const fc = forcedCell(view);
  if (fc && !Object.values(MYND_CELL).includes(fc)) return null;
  const avoid = view.force && view.force.avoid;
  const cap = b < 3 ? 3 : b < 5 ? 5 : 7;
  const fits = (x) => (!fw || x.verb === fw) && (!fc || fc === MYND_CELL[x.mynd]) && x.s.t !== avoid;
  const bank = myndSlots(lex).filter((x) => fits(x) && P.level(x.s.lvl)
    && askable(P, x.t.m) && (b >= 3 || !x.impersonal));
  const groups = new Map();
  for (const x of bank) {
    if (!groups.has(x.mynd)) groups.set(x.mynd, []);
    groups.get(x.mynd).push(x);
  }
  for (const [k, g] of groups) {
    const near = g.filter((x) => x.s.lvl <= cap);
    groups.set(k, near.length >= 8 ? near : [...g].sort((p, q) => p.s.tok.length - q.s.tok.length).slice(0, 8));
  }
  let x = null;
  if (b >= 5 && (!fc || fc === MYND_CELL.germynd) && (rng() < 0.25 || !groups.size)) {
    const st = stGermynd(lex).filter((y) => fits(y) && askable(P, y.cellM));
    if (st.length) x = pick(fresh(view, (y) => y.key, st), rng);
  }
  if (!x) {
    if (!groups.size) return null;
    const g = wpick([...groups.keys()], (k) => Math.min(1, Math.sqrt(groups.get(k).length / 30)), rng);
    x = pick(fresh(view, (y) => y.key, groups.get(g)), rng);
  }
  const p = phraseOf(x);
  return built({
    type: "choice", skill: "sagnord", s: x.s, i: x.marks[x.marks.length - 1], marks: x.marks, mark: true,
    lesson: "mynd",
    title: "Germynd, miðmynd eða þolmynd?",
    question: `Í hvaða mynd er *${p}*?`,
    options: MYNDIR, answer: x.mynd,
    why: myndWhy(x),
    base: 8, lvl: x.s.lvl || b, cell: MYND_CELL[x.mynd], word: wordKey(x.verb.o, x.verb.c),
    tags: x.trap ? ["somynd", "somynd:st"] : ["somynd"],
    miss: ["mynd_greina"],
    /* *lest* called miðmynd because it ends in -st: the lesson's warning. */
    missFor: x.trap ? { miðmynd: ["mynd_greina", "mynd_st"] } : null,
  }, [FX.exSeen(x.key)]);
}

/* ---- Boðháttur ------------------------------------------------------------ */

/* Verbs whose boðháttur is not asked. The núþálegar sagnir and the modals
   have none anyone uses (*skuldu, megðu*); *verða* and *vilja* have a form
   nobody says to anyone (*verðu, viltu* is the question "do you want");
   and a child is not asked to order someone to kill, steal, lie or worse. */
const BH_SKIP = new Set(["munu", "skulu", "mega", "kunna", "unna", "þurfa", "vilja", "verða", "hljóta",
  "þykja", "deyja", "drepa", "myrða", "stela", "ljúga", "berja", "lemja", "meiða", "skjóta", "svíkja",
  "hata", "ræna", "særa", "drekkja", "kæfa", "eitra", "pynta", "nauðga", "slátra", "míga", "skíta",
  "pissa", "kúka", "æla", "hrækja"]);
const BH_ET = "GM-BH-ET", BH_FT = "GM-BH-FT", BH_ST = "GM-BH-ST";

const BH_POOL = new WeakMap();
function bodhatturPool(lex) {
  if (BH_POOL.has(lex)) return BH_POOL.get(lex);
  const list = lex.verbs.filter((v) => !v.t3 && !BH_SKIP.has(v.o)
    && [BH_ET, BH_FT, BH_ST, "GM-NH"].every((m) => (v.forms[m] || []).length)).map((v) => ({ v }));
  BH_POOL.set(lex, list);
  return list;
}

/* Wrong answers that are a known mistake, as data for the judge: the
   stýfður boðháttur written for the one with *þú* (*kom* for *komdu*), and
   *-ðu* hung on the infinitive (*komaðu, lesaðu*). Only forms that are not
   themselves right: for *kalla* the infinitive and the stýfður boðháttur
   are both *kalla*, and *kallaðu* is right. */
function bodhatturMisses(v) {
  const ok = new Set(v.forms[BH_ET].map(lower));
  const out = [];
  const st = v.forms[BH_ST].filter((f) => !ok.has(lower(f)));
  if (st.length) out.push({ f: st, ids: ["bodhattur", "bodh_styfdur"] });
  const nh = v.forms["GM-NH"][0];
  if (!v.forms[BH_ET].some((f) => lower(f).startsWith(lower(nh)))) {
    const fromNh = ["ðu", "du", "tu"].map((e) => nh + e).filter((f) => !ok.has(lower(f)));
    if (fromNh.length) out.push({ f: fromNh, ids: ["bodhattur", "bodh_nh"] });
  }
  return out;
}

/* What *þú* is fastened onto, said as the lesson says it (*kom* + *þú*
   verður *komdu*), or null where that would not add up. For the *-a* verbs
   it is the infinitive: *kalla* + *þú* → *kallaðu* (BÍN's stýfður
   boðháttur of *lofa* is *lof*, and *lof* + *þú* is not *lofaðu*). */
export function bodhatturBase(v) {
  const sg = lower(v.forms[BH_ET][0]), nh = lower(v.forms["GM-NH"][0]);
  if (sg === nh + "ðu") return v.forms["GM-NH"][0];
  const st = v.forms[BH_ST].length === 1 ? v.forms[BH_ST][0] : null;
  return st && st.length >= 2 && sg.startsWith(lower(st).slice(0, -1)) && sg.length > st.length ? st : null;
}

function bodhatturWhy(v) {
  const sg = v.forms[BH_ET], pl = v.forms[BH_FT];
  const base = bodhatturBase(v);
  const also = sg.length > 1 ? ` (líka *${sg.slice(1).join("*, *")}*)` : "";
  const pres = (v.forms["GM-FH-NT-2P-FT"] || [])[0];
  const one = base ? `*${base}* + *þú* verður **${sg[0]}**${also}` : `**${sg[0]}**${also}`;
  return `Eintala, við einn: ${one}. Fornafnið *þú* er fest aftan á sögnina. `
    + `Fleirtala, við fleiri en einn: **${pl.join(" / ")}**${pl[0] === pres ? `, eins og *þið ${pres}*` : ""}.`;
}

/**
 * Boðháttur: the pupil writes it. Lesefni: "Í eintölu er fornafnið *þú*
 * oftast fest aftan á sögnina: *kom* + *þú* verður *komdu*", and the plural
 * *Komið inn!* (við fleiri en einn).
 *
 *   þyngd 1–2  common verbs; the singular only, with the lesson's own help:
 *              *kom + þú → ?*
 *   þyngd 3–4  the infinitive only; singular and plural
 *   þyngd 5–   the same, every verb, and the irregular ones (*gakktu,
 *              stattu, vertu, sjáðu*) as often as the rest
 *
 * The stýfður boðháttur itself is never asked (tasks/shared.js `askable`:
 * the program does not teach a form a child meets only in verse); it is
 * shown, as the lesson shows it, and written in its place it is a mistake
 * with a name (`bodh_styfdur`).
 */
export function soBodhattur(lex, view, rng) {
  if (drilling(view) && !forced(view, ["so"])) return null;
  const P = view.policy;
  const b = bandFor(view, "sagnord");
  const fw = forced(view, ["so"]);
  const fc = forcedCell(view);
  if (fc && fc !== BH_ET && fc !== BH_FT) return null;
  if (!askable(P, BH_ET)) return null;
  const plural = (b >= 3 || fc === BH_FT) && askable(P, BH_FT);
  if (fc === BH_FT && !plural) return null;
  const all = bodhatturPool(lex);
  let v;
  if (fw) {
    if (!all.some((y) => y.v === fw)) return null;
    v = fw;
  } else {
    let pool = all;
    if (b < 3) pool = commonestVerbs(lex, pool, 0.25).filter((y) => bodhatturBase(y.v));
    else if (b < 5) pool = commonestVerbs(lex, pool, 0.6);
    else if (rng() < 0.5) {
      const hard = pool.filter((y) => (y.v.irr || 0) >= 4);
      if (hard.length) pool = hard;
    }
    const flat = b >= 5 ? (y) => 1 + y.v.r / 150 : () => 1;
    v = wpick(pool, (y) => wordWeight(lex, view, y.v, "sagnord") * flat(y), rng).v;
  }
  const misses = bodhatturMisses(v);
  const slots = [
    { m: BH_ET, h: "eintala", hint: "við einn", after: "!", accepted: v.forms[BH_ET], post: ["þú"],
      miss: ["bodhattur"], missIf: misses },
    ...(plural ? [{ m: BH_FT, h: "fleirtala", hint: "við fleiri", after: "!", accepted: v.forms[BH_FT],
      miss: ["bodhattur"] }] : []),
  ];
  const ids = new Set(misses.flatMap((x) => x.ids));
  return built({
    type: "slots", skill: "sagnord", v, word: wordKey(v.o, v.c), lesson: "hattur",
    title: "Boðháttur",
    question: plural
      ? "Skrifaðu sögnina í **boðhætti**: skipun við einn (*þú*) og við fleiri en einn (*þið*)."
      : "Skrifaðu sögnina í **boðhætti**, skipun við einn: fornafnið *þú* festist aftan á sögnina.",
    show: [{ h: "að", f: v.forms["GM-NH"][0] },
      ...(b < 3 && !plural && bodhatturBase(v) ? [{ h: "", f: `${bodhatturBase(v)} + þú → ?` }] : [])],
    slots, paradigm: v.forms, options: null, answer: null,
    solution: [{ h: "eintala", f: v.forms[BH_ET].join(" / ") },
      ...(plural ? [{ h: "fleirtala", f: v.forms[BH_FT].join(" / ") }] : [])],
    why: bodhatturWhy(v),
    base: 6 + 3 * slots.length, lvl: b, cell: BH_ET,
    tags: ["bodh", "form", ...(ids.has("bodh_styfdur") ? ["bodh:st"] : []), ...(ids.has("bodh_nh") ? ["bodh:nh"] : [])],
    miss: [],
  });
}

export const TYPES = [
  { id: "verbslot", skill: "sagnord", weight: 14, renderer: "verbslot",
    tags: ["form", "num", "verb:agree", "verb:mm", "verb:strongpast", "verb:tense", "verb:vh"],
    bands: [1, 2, 3, 4, 5, 6, 7],
    build: taskVerbSlot },
  { id: "verb", skill: "sagnord", weight: 8, renderer: "verb",
    tags: ["form", "num", "verb:agree", "verb:mm", "verb:strongpast", "verb:tense", "verb:vh"],
    bands: [1, 2, 3, 4, 5],
    build: taskVerb },
  { id: "tbl_so", skill: "sagnord", weight: 5, renderer: "table",
    tags: ["form", "num", "verb:agree", "verb:mm", "verb:tense", "verb:vh"],
    bands: [1, 2, 3, 4, 5],
    build: tableVerb },
  /* item 27 */
  { id: "so_beyging", skill: "sagnord", weight: 5, renderer: "slots",
    tags: ["form", "sobeyg", "sobeyg:hljod", "verb:strongpast"],
    bands: [1, 3, 5],
    build: soBeyging },
  { id: "so_mynd", skill: "sagnord", weight: 5, renderer: "choice",
    tags: ["somynd", "somynd:st"],
    bands: [1, 3, 5],
    build: soMynd },
  { id: "so_bodhattur", skill: "sagnord", weight: 5, renderer: "slots",
    tags: ["bodh", "bodh:nh", "bodh:st", "form"],
    bands: [1, 3, 5],
    build: soBodhattur },
];
