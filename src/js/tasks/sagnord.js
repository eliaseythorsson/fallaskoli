/* Sagnorð: persóna, tala, tíð, háttur, mynd.

     verb      "Beygðu sögnina": one form of a verb after its subject
     verbslot  the same inside a whole sentence from the bank
     tbl_so    beygingartafla: all six persons of one tense */

import { readMark } from "../core/marks.js";
import { diffOf } from "../core/difficulty.js";
import { skillLevel } from "../core/progress.js";
import { wordKey } from "../core/state.js";
import { explainVerbForm, conjugationNote } from "./explain.js";
import { built } from "./effects.js";
import { pick, wpick, shuffle, askable, bandFor, forced, drilling, forcedCell, topByRank,
         shareForLevel, wordWeight, cellWeight, cellEase } from "./shared.js";

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
];
