/* Task builders.

   Each type describes itself: which skill it trains, when it may appear and how
   it is built. A new type is one entry in TASKS and one renderer in
   ui/render.js — nothing else anywhere has to change.                      */

import { CASES, COLS, GENDERS, mark, readMark, isStyfdur } from "../core/marks.js";
import { bandOf, diffOf } from "../core/difficulty.js";
import { skillLevel } from "../core/progress.js";
import { wordKey, todayKey, effectivePolicy } from "../core/state.js";
import { chooseWord, markAsked, history } from "../core/spacing.js";
import { wantsHelper, phrase, paradigmWithHelper, helperForm } from "../core/helpers.js";
import { explainSlot, explainAdjective, explainDegree, explainVerbForm, conjugationNote } from "./explain.js";
import { nounSentence, adjectiveSentence, substitutable, acceptsNoun, candidateNouns,
         settled, showable, fittingAdjectives, repeatsNoun } from "./frames.js";
import { isGrammarGloss } from "../core/definitions.js";
import { TRANSFORMS, workshop, errorHunt } from "./production.js";
import * as MORE from "./more.js";
import { mixGate } from "../core/mix.js";

/* ---------- helpers ---------- */
export const pick = (a, rnd = Math.random) => a[Math.floor(rnd() * a.length)];

/* The curriculum policy (core/policy.js): which categories, question types,
 * levels and inflectional features this child may meet. Built once per
 * question and cached on the context; a builder that finds nothing allowed
 * returns null like any builder that cannot produce a good question. */
const pol = (ctx) => (ctx.policy ||= effectivePolicy(ctx.S));

/* The one gate every cell goes through: the policy, plus the one cell the
 * program never teaches — the shortened imperative (core/marks.js). */
const askable = (P, m) => !!m && !isStyfdur(m) && P.mark(m);

/* The frequency cap is a SHARE of the pool, not a rank: a fixed rank chosen
 * for 310 adjectives covered a fifth as much once there were 957. The shares
 * reproduce the old selection for a beginner and follow the corpus. */

/** The top `share` of the pool by frequency. An empty pool -> the whole pool. */
export function topByRank(pool, share) {
  if (!pool.length) return pool;
  const cut = Math.max(20, Math.ceil(pool.length * Math.min(1, share)));
  const out = pool.filter((x) => x.r <= cut);
  return out.length ? out : pool;
}

/** A share that grows with skill level. Level 1 -> `base`, each level adds `step`. */
export const shareForLevel = (L, base, step) => Math.min(1, base + step * (Math.max(1, L) - 1));

export function wpick(items, wf, rnd = Math.random) {
  const total = items.reduce((s, i) => s + Math.max(wf(i), 1e-4), 0);
  let r = rnd() * total;
  for (const i of items) { r -= Math.max(wf(i), 1e-4); if (r <= 0) return i; }
  return items[items.length - 1];
}

const CASEWORD = { þf: "ÞF", þgf: "ÞG", ef: "EF" };

/* The rescue drill (v6.6) asks about ONE word again and again. Every builder
 * that chooses a word asks this first: during a drill it hands back the drilled
 * word if it belongs to one of these classes, and null otherwise — in which
 * case a builder for some other class has nothing to do and returns null. */
const forced = (ctx, classes) => {
  const w = ctx.drillWord;
  return w && classes.includes(w.c) ? w : null;
};
const drilling = (ctx) => !!ctx.drillWord;

/** Per-word key for a parsed sentence token.
 *
 * Never `wordKey(t.l, t.x)`: Greynir's short code for a noun is `no`, which is
 * not a class the lexicon or the collection knows, so those words were filed
 * under a key nothing could ever look up. See `entryForToken` in core/lexicon.js.
 * Returns `null` when the token has no lexicon entry, and `record()` then keeps
 * no per-word statistics — which is right, since there is no word to keep them
 * against. */
export function tokenKey(lex, t) {
  const e = lex.entryForToken(t);
  return e ? wordKey(e.o, e.c) : null;
}

/** Word choice: common words first, rarer as the skill level grows, and
    words this child gets wrong come back sooner. */
export function wordWeight(ctx, x, skill) {
  const { S, sess } = ctx;
  const L = skillLevel((S.skills[skill] || {}).xp || 0).level;
  const rec = S.words[wordKey(x.o, x.c)] || { c: 0, w: 0 };
  const seen = rec.c + rec.w;
  /* `cut` splits the pool into common words (full weight) and the tail (0.15).
     The number was 60 + L*60 when there were 1,244 nouns; it is a scaling of the
     same proportion now, so the tail does not become proportionally larger as
     the corpus grows. The smoother falloff below then makes common words many
     times likelier within both halves — that, not the cap, is what ensures the
     child gets *kvöld* far more often than a rare word. */
  const cut = (ctx.rankCut ??= {})[x.c] ??=
    Math.ceil(Math.max(400, (ctx.lex?.byClass?.[x.c] || []).length) * 0.39);
  let base = x.r <= cut * (0.5 + 0.07 * L) ? 1 : 0.15;
  base *= 1 / (1 + x.r / 150);
  if (x.o.length > 9 && L < 4) base *= 0.5;
  if (seen >= 4 && rec.w === 0) base *= 0.35;
  if (seen > 0) base *= 1 + 2.2 * (rec.w / seen);
  if (sess.seen.slice(-6).includes(x.o)) base *= 0.2;
  return base;
}

const cellWeight = (S, m) => {
  const c = S.cells[m] || { c: 0, w: 0 };
  const n = c.c + c.w;
  return n < 3 ? 3 : 1 + 4 * (c.w / n);
};

/* Sentences at about the right difficulty AND at a difficulty this child is
   allowed to meet. The band is clamped to the policy's ceiling, so a class that
   is only working at þyngd 1-2 never has the band drift above it however well
   the child does. */
const sentPool = (ctx, skill, maxLvl) => {
  const P = pol(ctx);
  const b = Math.min(maxLvl ?? bandOf(ctx.sess, skill), P.maxLevel);
  const allowed = ctx.lex.sentences.filter((s) => P.level(s.lvl));
  const p = allowed.filter((s) => s.lvl <= b && s.lvl >= b - 1);
  return p.length ? p : allowed.filter((s) => s.lvl <= b);
};

/** The band this skill may run at, never above what the policy permits. */
const bandFor = (ctx, skill) => Math.min(bandOf(ctx.sess, skill), pol(ctx).maxLevel);

/* ================= 1. Cloze — noun (± adjective) ======================== */

function taskFill(ctx) {
  const { lex, S, sess } = ctx;
  const pPhrase = Math.min(0.5, 0.05 * (diffOf(sess, "nafnord") - 1) +
    0.03 * (skillLevel(S.skills.nafnord.xp).level - 1));
  const pDem = Math.min(0.45, 0.25 + 0.05 * (diffOf(sess, "nafnord") - 1));

  const P = pol(ctx);
  let s = null, n = null, a = null;
  const pool0 = sentPool(ctx, "nafnord");
  if (!pool0.length) return null;
  for (let k = 0; k < 60; k++) {
    s = pick(pool0);
    /* `nf`: the case after the preposition depends on what is meant ("koma
       með hundinn" / "koma með hundinum"), so the sentence is never a cloze. */
    if (s.slot == null || s.nf) continue;
    /* v6.11: a builder may ask for one kind of slot only (Fallstjórn: the
       noun right after a preposition). */
    if (ctx.fillOnly && !ctx.fillOnly(s, s.slot)) continue;
    const t = s.tok[s.slot];
    /* The case has to be settled whether or not the slot is a template:
       "eftir vinnu" was marked dative by a guess, and the cloze then showed
       the dative cell as the answer. */
    if (!settled(t) || (t.u || []).includes("fall")) continue;
    a = readMark(t.m);
    if (!a.fall) continue;
    if (!askable(P, t.m)) continue;
    const open = substitutable(s);
    /* A drill wants its own word, so a sentence with its noun fixed is no use. */
    if (drilling(ctx) && !open) continue;
    if (ctx.forcedNoun && open) {
      /* The same word again after a wrong answer — but only in a sentence
         that accepts it. */
      if (!acceptsNoun({ rk: s.rk, need: s.need, ps: s.ps || null }, ctx.forcedNoun, t.m)
          || repeatsNoun(s, s.slot, ctx.forcedNoun)) continue;
      n = ctx.forcedNoun;
    } else if (!open) {
      /* Not a template: asked with the noun it was written with. */
      n = lex.lookup(t.l, t.c) || lex.lookup(t.l, "nafnorð");
      if (!n) continue;
    } else {
      const pool = candidateNouns(lex, s);
      if (!pool.length) continue;
      n = wpick(pool, (x) => wordWeight(ctx, x, "nafnord"));
    }
    if (!n || !n.forms[t.m]) continue;
    break;
  }
  ctx.forcedNoun = null;
  if (!n) return null;
  /* The loop can end on a sentence that was turned down after a noun was
     chosen for it; never build a question whose cell the noun does not have. */
  if (!s || s.slot == null || !n.forms[s.tok[s.slot].m]) return null;

  const t = s.tok[s.slot];
  const task = {
    type: "fill", skill: "nafnord", s, i: s.slot, n, m: t.m, a,
    answers: n.forms[t.m], lvl: s.lvl, base: 10,
    cell: t.m, word: wordKey(n.o, n.c),
    why: explainSlot(s, s.slot, { time: isTimeNoun(n) }),
    paradigm: n.forms,
  };

  /* An adjective or demonstrative is only added when that material is on —
     and only where one can stand. Beside a numeral, a pronoun, an adjective
     or the article it cannot: "Tveir þessir hestar", "Ég á góða þessa vini",
     "Sú góð kona". And *þessi* is not put before a word that is the
     predicative of *þetta* ("Þetta er þessi hugmynd"). */
  const mayAdj = P.skill("lysingarord");
  const mayDem = P.skill("fornofn");
  const MODIFIER = ["töluorð", "lýsingarorð", "fornafn", "greinir"];
  const prev = s.tok[s.slot - 1], next = s.tok[s.slot + 1];
  const crowded = s.fixed || (prev && (MODIFIER.includes(prev.c) || prev.rj))
    || (next && (MODIFIER.includes(next.c) || next.rj));
  const afterThetta = t.r === "sagnfylling";
  if (!ctx.noExtras && !ctx.fillOnly && !crowded && (mayAdj || mayDem) && Math.random() < pPhrase) {
    const kyn = n.c.toUpperCase();
    const cn = (a.fall === "ÞG" ? "ÞGF" : a.fall) + (a.tala === "fleirtala" ? "FT" : "ET");
    if (mayDem && Math.random() < pDem && !a.greinir && !afterThetta) {
      const d = ctx.lex.lookup("þessi", "fn");
      const dm = `${kyn}-${cn}`;
      const f = d && askable(P, dm) && d.forms[dm];
      if (f) {
        task.extra = { lemma: "þessi", fl: "ábendingarfornafn", form: f[0] };
        task.answers = n.forms[t.m].map((x) => f[0] + " " + x);
        task.skill = "fornofn";
        task.base = 13;
        task.why = "Ábendingarfornafnið *þessi* lagar sig að nafnorðinu: það stendur í sama kyni, sömu tölu og sama falli. Nafnorð sem stendur með *þessi* fær ekki greini.";
      }
    } else if (mayAdj) {
      /* Not any adjective: one that suits this kind of noun. A random one
         out of 980 gave "óléttir lyklar". A noun of a class with no fitting
         adjective (an abstract, a body part, weather) is asked bare. */
      const pool = fittingAdjectives(n.s).map((o) => lex.lookup(o, "lo")).filter(Boolean);
      const adj = pool.length ? pick(pool) : null;
      const deg = a.greinir ? "FVB" : "FSB";
      const am = `${deg}-${kyn}-${cn}`;
      const f = adj && askable(P, am) && adj.forms[am];
      if (f) {
        task.extra = { lemma: adj.o, fl: "lýsingarorð", form: f[0] };
        task.answers = n.forms[t.m].map((x) => f[0] + " " + x);
        task.skill = "lysingarord";
        task.base = 14;
        task.adjective = adj;
        task.why = explainAdjective(a);
      }
    }
  }
  return task;
}

/* ================= 2. Sagnbeyging =============================== */

const SUBJECTS = [["1P-ET", "ég"], ["2P-ET", "þú"], ["3P-ET", "hann"],
                  ["1P-FT", "við"], ["2P-FT", "þið"], ["3P-FT", "þeir"]];
const THIRD_ONLY_SUBJECTS = [["3P-ET", "það"]];

/** The words shown before the blank. The subjunctive is not something one
    says after a bare pronoun — "ég komi" — so it is shown the way it is met:
    after *þótt*, which takes it in both tenses (*þótt ég komi*, *þótt ég
    kæmi*). */
export const subjectLabel = (pref, pron) =>
  /-VH-/.test(pref + "-") ? "þótt " + pron : pron;

function taskVerb(ctx) {
  const { lex, sess, S } = ctx;
  const L = skillLevel(S.skills.sagnord.xp).level;
  const d = diffOf(sess, "sagnord");
  if (drilling(ctx) && !forced(ctx, ["so"])) return null;
  const pool = topByRank(lex.verbs, shareForLevel(L, 0.21, 0.09));
  const v = forced(ctx, ["so"]) || wpick(pool, (x) => wordWeight(ctx, x, "sagnord"));

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

  const P = pol(ctx);
  for (let k = 0; k < 12; k++) {
    const [pref, label] = pick(specs);
    const cands = subs.filter(([sfx]) =>
      v.forms[pref + "-" + sfx] && askable(P, pref + "-" + sfx));
    if (!cands.length) continue;
    const [sfx, who] = pick(cands);
    const m = pref + "-" + sfx;
    const pron = subjectLabel(pref, who);
    return {
      type: "verb", skill: "sagnord", v, m, pron, label,
      answers: v.forms[m], a: readMark(m), lvl: Math.min(P.maxLevel, Math.round(d)),
      base: 12, cell: m, word: wordKey(v.o, v.c), paradigm: v.forms,
      conj: verbConjugation(v),
    };
  }
  return null;
}

/* ============ 2b. Verb inside a sentence — cloze ======================== */

/* A verb inside a whole sentence — the context is what helps a pupil with a
   language disorder. The token has to be confirmed (lex.slotsFor): BÍN has the
   mark and the surface form in the sentence is one of BÍN's forms for it, so
   the cloze cannot ask for a form that does not fit its own sentence. */

const FINITE = /^(GM|MM)-(FH|VH)-/;

function taskVerbSlot(ctx) {
  const { lex, S, sess } = ctx;
  const d = diffOf(sess, "sagnord");

  const P = pol(ctx);
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
  if (drilling(ctx) && !forced(ctx, ["so"])) return null;
  const only = forced(ctx, ["so"]);
  const slots = lex.slotsFor("sagnorð").filter(
    (r) => allowed(r.t.m) && firm(r.t) && P.level(r.s.lvl) &&
      /* A drill takes any sentence the word is in, whatever its level. */
      (only ? r.w.o === only.o && r.w.c === only.c : r.s.lvl <= bandFor(ctx, "sagnord")));
  if (!slots.length) return null;

  const r = wpick(slots, (x) =>
    cellWeight(S, x.t.m) * wordWeight(ctx, x.w, "sagnord"));
  const { s, i, t, w: v } = r;

  return {
    type: "verbslot", skill: "sagnord", s, i, v, m: t.m,
    /* *hittust* is a form of *hittast*; the child is shown that infinitive. */
    shown: (/^MM/.test(t.m) && (v.forms["MM-NH"] || [])[0]) || v.o,
    answers: v.forms[t.m], a: readMark(t.m),
    lvl: s.lvl, base: 14, cell: t.m, word: wordKey(v.o, v.c),
    paradigm: v.forms, conj: verbConjugation(v),
    why: explainVerbForm(s, i),
  };
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

/* ================= 3. Greining =================================== */

/* The reverse question: the word stands inflected in the sentence and the child
   analyses it. Which word is chosen matters — if it were random, 80% of the
   questions would land on nouns and verb moods and comparison would barely be
   seen. The choice is therefore weighted by word class and by what has turned
   out to be difficult. */
const PARSE_PREF = {
  "lýsingarorð": 5, "sagnorð": 3.2, "fornafn": 1.6, "nafnorð": 1.4,
  "töluorð": 2.5, "greinir": 2, "atviksorð": 0.8, "forsetning": 0.6,
  "samtenging": 0.5, "upphrópun": 0.5, "nafnháttarmerki": 0.5,
};

function taskParse(ctx) {
  const { lex, sess, S } = ctx;
  for (let k = 0; k < 80; k++) {
    const s = pick(sentPool(ctx, "greining"));
    const cands = s.tok
      .map((t, j) => ({ t, j }))
      .filter(({ t }) => t.c && !t.rj && !isAmbiguousForm(lex, t) && askable(pol(ctx), t.m));
    if (!cands.length) continue;

    const chosen = wpick(cands, ({ t }) => {
      let w = PARSE_PREF[t.c] ?? 1;
      const cell = t.m || "ofl:" + t.c;
      const rec = S.cells[cell];
      if (rec) {
        const n = rec.c + rec.w;
        if (n >= 3) w *= 0.6 + 2.4 * (rec.w / n);   // what goes wrong comes back
      } else w *= 1.5;                              // ósnert kemur fyrr
      return w;
    });

    const { t, j: i } = chosen;
    return {
      type: "parse", skill: "greining", s, i, t,
      a: t.m ? readMark(t.m) : {}, picks: {}, base: 4,
      cell: t.m || "ofl:" + t.c, word: tokenKey(lex, t),
      lvl: s.lvl,
      homograph: lex.homographClasses(t.l).length > 1 ? lex.homographClasses(t.l) : null,
    };
  }
  return null;
}

/* The analysis question for a form pulled straight out of BÍN, so any mood
   of any verb and any degree of any adjective can be asked about. */

const REVERSE_POOLS = [
  { cls: "lo", skill: "lysingarord", fl: "lýsingarorð" },
  { cls: "so", skill: "sagnord", fl: "sagnorð" },
  { cls: "kk", skill: "nafnord", fl: "nafnorð" },
  { cls: "kvk", skill: "nafnord", fl: "nafnorð" },
  { cls: "hk", skill: "nafnord", fl: "nafnorð" },
];

function taskReverse(ctx) {
  const { lex, S, sess } = ctx;
  const P = pol(ctx);
  const only = ctx.drillWord || null;
  const pools = REVERSE_POOLS.filter((p) => P.skill(p.skill) && (!only || p.cls === only.c));
  if (!pools.length) return null;

  for (let k = 0; k < 60; k++) {
    const p = pick(pools);
    const bag = only ? [only] : topByRank(lex.byClass[p.cls] || [], 0.35);
    if (!bag.length) continue;
    const w = only || wpick(bag, (x) => wordWeight(ctx, x, p.skill));

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
    if (p.cls === "so" && w.t3) marks = marks.filter((m) => !/-(1P|2P)-|-3P-FT$|-BH-/.test(m));
    marks = marks.filter((m) => askable(P, m));
    if (["kk", "kvk", "hk"].includes(p.cls)) marks = marks.filter((m) => showable(w, m));
    if (!marks.length) continue;

    const m = wpick(marks, (mm) => {
      const rec = S.cells[mm];
      if (!rec) return 2;
      const n = rec.c + rec.w;
      return n < 3 ? 2 : 0.5 + 2.5 * (rec.w / n);
    });
    const form = w.forms[m].find((f) => counts.get(f) === 1);
    if (!form) continue;

    /* A sentence beats a bare form. Three routes, best first: a real sentence
       with this exact word in it; a frame with this word substituted in
       (tasks/frames.js); the bare form out of BÍN — still needed for verbs,
       which are never substituted. */
    const occ = lex.occurrencesOf(w.o, w.c)
      .filter((r) => r.t.m === m && !(r.t.u || []).length && P.level(r.s.lvl));
    if (occ.length) {
      const r = pick(occ);
      return {
        type: "parse", skill: p.skill, base: 4, picks: {},
        s: r.s, i: r.i, t: r.t, a: readMark(r.t.m),
        cell: r.t.m, word: wordKey(w.o, w.c), lvl: r.s.lvl,
        lemmaWord: w,
        homograph: lex.homographClasses(w.o).length > 1 ? lex.homographClasses(w.o) : null,
      };
    }

    const maxLvl = bandFor(ctx, p.skill);
    const opts = { maxLvl, levelOk: (n) => P.level(n) };
    const made = p.cls === "lo" ? adjectiveSentence(lex, w, m, form, opts)
      : ["kk", "kvk", "hk"].includes(p.cls) ? nounSentence(lex, w, m, form, opts)
        : null;
    if (made) {
      return {
        type: "parse", skill: p.skill, base: 4, picks: {},
        s: made.s, i: made.i, t: made.s.tok[made.i], a: readMark(m),
        cell: m, word: wordKey(w.o, w.c), lvl: made.lvl,
        lemmaWord: w, framed: true,
        homograph: lex.homographClasses(w.o).length > 1 ? lex.homographClasses(w.o) : null,
      };
    }

    /* v6.11: an adjective is never analysed as a bare word — the sentence
       shows what it agrees with. If no sentence has it, another word. */
    if (p.cls === "lo") continue;
    return {
      type: "parse", standalone: true,
      skill: p.skill, base: 4, picks: {},
      t: { w: form, l: w.o, c: p.fl, m, x: w.c },
      a: readMark(m),
      cell: m, word: wordKey(w.o, w.c),
      lvl: Math.min(P.maxLevel, Math.round(d)),
      lemmaWord: w,
      homograph: lex.homographClasses(w.o).length > 1 ? lex.homographClasses(w.o) : null,
    };
  }
  return null;
}
/** Skip forms that are ambiguous about number or definiteness — a question
    with two defensible answers is worse than no question. */
function isAmbiguousForm(lex, t) {
  if (!t.m) return false;
  const w = lex.lookup(t.l, t.x) || lex.lookup(t.l, t.c);
  if (!w || !w.forms) return false;
  const a = readMark(t.m);
  return Object.entries(w.forms).some(([mm, ff]) => {
    if (!ff.includes(t.w)) return false;
    const b = readMark(mm);
    return b.tala && (b.tala !== a.tala || b.greinir !== a.greinir);
  });
}

/* ================= 4. Setningarhlutar ============================= */

function taskSyntax(ctx) {
  const { lex, sess } = ctx;
  const P = pol(ctx);
  const b = Math.min(Math.max(3, bandOf(sess, "setningafraedi")), P.maxLevel);
  const usable = lex.sentences.filter((x) => P.level(x.lvl));
  const pool = usable.filter((s) => s.tok.some((t) => t.r) && s.lvl <= b);
  if (!pool.length && !usable.length) return null;
  const s = pick(pool.length ? pool : usable);
  const roles = [...new Set(s.tok.filter((t) => t.r).map((t) => t.r))];
  if (!roles.length) return null;
  const askRole = pick(roles);
  return {
    type: "syntax", skill: "setningafraedi", s, askRole, picked: null,
    base: 12, cell: "setn:" + askRole, lvl: s.lvl,
  };
}

/* ================= 4b. Clause types (years 9-10) ===================
 * The clause type (`k` on each token) comes from the parse and passed the
 * guard like everything else; the builder reads it and infers nothing. */

const CLAUSE_KINDS = ["aðalsetning", "aukasetning", "nafnháttarsetning"];

/** Contiguous runs of tokens carrying the same clause type. */
function clauseSpans(s) {
  const out = [];
  let start = 0;
  for (let i = 1; i <= s.tok.length; i++) {
    const prev = s.tok[i - 1].k;
    const here = i < s.tok.length ? s.tok[i].k : null;
    if (here !== prev) {
      if (prev && i - start > 1) out.push({ from: start, to: i - 1, kind: prev });
      start = i;
    }
  }
  return out;
}

function taskClause(ctx) {
  const { lex, sess } = ctx;
  /* A floor, not a ceiling. Sentences with more than one clause type all sit
     at level 2-5 in the bank, and this material is above year 8 anyway — it
     would be false modesty to refuse to ask about it because the starting
     difficulty is 1. The ceiling keeps rising with difficulty once sentences at
     level 6-7 arrive. */
  const P = pol(ctx);
  const band = Math.max(5, bandFor(ctx, "setningagerd"));
  const pool = lex.sentences.filter((s) => {
    /* `ku`: the build could not vouch for where this sentence's clauses
       begin and end, so nothing is asked about them. */
    if (s.ku || s.lvl > band || !P.level(s.lvl)) return false;
    const kinds = new Set(s.tok.map((t) => t.k).filter(Boolean));
    return kinds.size > 1;
  });
  if (!pool.length) return null;

  for (const s of shuffle(pool).slice(0, 12)) {
    /* A clause has a verb. A run of words without one is a phrase, whatever
       the label on it, and is not asked about. */
    const spans = clauseSpans(s).filter((x) =>
      s.tok.slice(x.from, x.to + 1).some((t) => t.x === "so"));
    /* The question is asked, by preference, about the part that is NOT the
       main clause: "where is the subordinate clause" is the question that
       teaches, not "what is the remainder called". */
    const interesting = spans.filter((x) => x.kind !== "aðalsetning");
    const span = pick(interesting.length ? interesting : spans);
    if (!span) continue;
    return {
      type: "clause", skill: "setningagerd", s, span,
      answer: span.kind, picked: null,
      options: CLAUSE_KINDS,
      base: 14, cell: "gerd:" + span.kind,
      lvl: Math.max(s.lvl, 6),      // this is material above year 8
    };
  }
  return null;
}

/* ================= 5. Beygingartafla ============================== */

/* A beygingartafla asks four or six cells at once, so it is only built when
   EVERY cell in it is allowed. Filtering the rows instead would produce a table
   with a hole in it, which teaches the wrong shape of the paradigm — the point
   of the table is that it is complete. */
function tableNoun(ctx) {
  const { lex, S } = ctx;
  const P = pol(ctx);
  if (drilling(ctx) && !forced(ctx, ["kk", "kvk", "hk"])) return null;
  const n = forced(ctx, ["kk", "kvk", "hk"]) || wpick(lex.nouns, (x) => wordWeight(ctx, x, "nafnord"));
  const cols = COLS.filter((c) => CASES.every((cs) => n.forms[mark(cs.k, c.k)])
    && showable(n, mark("NF", c.k))
    && P.marks(CASES.map((cs) => mark(cs.k, c.k))));
  if (!cols.length) return null;
  const col = wpick(cols, (c) => CASES.reduce((a, cs) => a + cellWeight(S, mark(cs.k, c.k)), 0));
  return {
    type: "table", kind: "no", skill: "nafnord", w: n,
    cells: CASES.map((cs) => ({ m: mark(cs.k, col.k), label: cs.name })),
    title: `${n.o} · ${col.name}`, base: 5, word: wordKey(n.o, n.c),
    lvl: bandFor(ctx, "nafnord"), paradigm: n.forms,
  };
}

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
    declension (weak = with, strong = without; the comparative takes none). */
function helperNounFor(lex, deg, kyn, caseKey, num) {
  const a = ADJ_DEGREES[deg];
  if (!a) return null;
  const mark = `${caseKey}${num}${a.article ? "gr" : ""}`;
  return helperForm(lex, kyn, mark);
}

function tableAdj(ctx) {
  const { lex, sess } = ctx;
  const d = diffOf(sess, "lysingarord");
  if (drilling(ctx) && !forced(ctx, ["lo"])) return null;
  const adj = forced(ctx, ["lo"]) ||
    wpick(topByRank(lex.adjectives, 0.38), (x) => wordWeight(ctx, x, "lysingarord"));
  const kyn = pick(["KK", "KVK", "HK"]);
  const num = pick(["ET", "FT"]);
  /* comparison arrives as difficulty rises */
  const degrees = ["FSB", "FVB"];
  if (d >= 2.5) degrees.push("MST");
  if (d >= 3.5) degrees.push("ESB", "EVB");
  for (const deg of shuffle(degrees)) {
    const a = ADJ_DEGREES[deg];
    const cells = CASES
      .map((cs) => {
        const caseKey = cs.k === "ÞG" ? "ÞGF" : cs.k;
        const h = helperNounFor(lex, deg, kyn, caseKey, num);
        return { m: `${deg}-${kyn}-${caseKey}${num}`, label: cs.name, helper: h ? h.form : null };
      })
      .filter((c) => adj.forms[c.m]);
    if (cells.length < 4) continue;
    if (!pol(ctx).marks(cells.map((c) => c.m))) continue;
    const article = a.article === null ? "" : a.article ? "með greini" : "án greinis";
    const beyging = deg === "MST" ? "" : a.article ? "veik beyging" : "sterk beyging";
    const spec = [a.name, article, beyging].filter(Boolean).join(", ");
    const sample = cells[0].helper ? `${adj.forms[cells[0].m][0]} ${cells[0].helper}` : null;
    return {
      type: "table", kind: "lo", skill: "lysingarord", w: adj, cells,
      title: `${adj.o} · ${spec} · ${GENDERS[kyn.toLowerCase()]} ${num === "ET" ? "eintala" : "fleirtala"}`,
      sample,
      base: 5, word: wordKey(adj.o, adj.c), lvl: bandFor(ctx, "lysingarord"),
      paradigm: adj.forms,
      why: explainDegree(readMark(cells[0].m).stig),
    };
  }
  return null;
}

function tableVerb(ctx) {
  const { lex, sess } = ctx;
  const d = diffOf(sess, "sagnord");
  /* A table has six cells, and a verb said only of the weather has one. */
  if (drilling(ctx) && !forced(ctx, ["so"])) return null;
  if (forced(ctx, ["so"]) && forced(ctx, ["so"]).t3) return null;
  const v = forced(ctx, ["so"]) || wpick(topByRank(lex.verbs, 0.36).filter((x) => !x.t3),
    (x) => wordWeight(ctx, x, "sagnord"));
  const prefs = ["GM-FH-NT", "GM-FH-ÞT"];
  if (d >= 3) prefs.push("GM-VH-ÞT");
  if (v.mm && d >= 4) prefs.push("MM-FH-NT");
  const NAME = { "GM-FH-NT": "nútíð · framsöguháttur", "GM-FH-ÞT": "þátíð · framsöguháttur",
                 "GM-VH-ÞT": "þátíð · viðtengingarháttur", "MM-FH-NT": "nútíð · miðmynd" };
  for (const pref of shuffle(prefs)) {
    const cells = SUBJECTS
      .map(([sfx, p]) => ({ m: pref + "-" + sfx, label: subjectLabel(pref, p) }))
      .filter((c) => v.forms[c.m]);
    if (cells.length < 6) continue;
    if (!pol(ctx).marks(cells.map((c) => c.m))) continue;
    return {
      type: "table", kind: "so", skill: "sagnord", w: v, cells,
      title: `${v.o} · ${NAME[pref]}`, base: 5, word: wordKey(v.o, v.c),
      lvl: bandFor(ctx, "sagnord"), paradigm: v.forms,
      why: conjugationNote(v.o, verbConjugation(v)),
    };
  }
  return null;
}

const SINGULAR_TABLE_ONLY = new Set(["sérhver"]);

/** Do all these cells hold the same form(s)? */
const sameInEveryCell = (w, cells) =>
  new Set(cells.map((c) => (w.forms[c.m] || []).join("|"))).size < 2;

/* Pronouns with a helper noun: *sá maður* rather than *sá* (core/helpers.js).
   The question asks about gender and number without showing the helper's
   forms; the paradigm with the helper is shown after the answer. */
/* Real pronouns, but odd for 8th grade: *vor* (archaic "our") came up more
   than any other table, *mestallur* four times in one test (v6.10). */
const PRONOUN_TABLE_SKIP = new Set(["vor", "mestallur"]);

function tablePronoun(ctx) {
  const { lex, sess } = ctx;
  const pool = [...(lex.byClass.fn || []), ...(lex.byClass.pfn || []), ...(lex.byClass.gr || [])]
    .filter((x) => !PRONOUN_TABLE_SKIP.has(x.o));
  if (!pool.length) return null;
  if (drilling(ctx) && !forced(ctx, ["fn", "pfn", "gr"])) return null;
  const w = forced(ctx, ["fn", "pfn", "gr"]) || wpick(pool, (x) => wordWeight(ctx, x, "fornofn"));
  const kyn = pick(["KK", "KVK", "HK"]);
  /* *sérhver* has a plural in BÍN and none in use. */
  const num = SINGULAR_TABLE_ONLY.has(w.o) ? "ET" : pick(["ET", "FT"]);
  for (const withKyn of [true, false]) {
    const cells = CASES
      .map((cs) => {
        const c = (cs.k === "ÞG" ? "ÞGF" : cs.k) + num;
        return { m: withKyn ? `${kyn}-${c}` : c, label: cs.name };
      })
      .filter((c) => w.forms[c.m]);
    if (cells.length < 4) continue;
    /* Four cells with the same word in them are not a declension: *hvaða*. */
    if (sameInEveryCell(w, cells)) continue;
    if (!pol(ctx).marks(cells.map((c) => c.m))) continue;
    const withHelper = withKyn && wantsHelper(w, num);
    const lead = withHelper ? phrase(lex, w, `${kyn}-${(num === "ET" ? "NFET" : "NFFT")}`) : null;
    return {
      type: "table", kind: w.c === "gr" ? "gr" : "fn", skill: "fornofn", w, cells,
      title: `${lead?.text || w.o} · ${withKyn ? GENDERS[kyn.toLowerCase()] + " " : ""}${num === "ET" ? "eintala" : "fleirtala"}`,
      base: 5, word: wordKey(w.o, w.c), lvl: bandFor(ctx, "fornofn"), paradigm: w.forms,
      helperRows: withHelper ? paradigmWithHelper(lex, w, kyn, num) : null,
      helperLemma: lead?.helperLemma || null,
    };
  }
  return null;
}

function tableNumeral(ctx) {
  const { lex, sess } = ctx;
  const pool = [...(lex.byClass.to || []), ...(lex.byClass.rt || [])];
  if (!pool.length) return null;
  if (drilling(ctx) && !forced(ctx, ["to", "rt"])) return null;
  const w = forced(ctx, ["to", "rt"]) || wpick(pool, (x) => wordWeight(ctx, x, "toluord"));
  const kyn = pick(["KK", "KVK", "HK"]);
  /* The singular where the word has one — *einn*, *annar*, *þriðji* — and
     the plural for *tveir*, *þrír*, *fjórir*, which have nothing else. The
     order used to be the other way round, so *einn* was only ever asked as
     *einir* and every ordinal as four identical cells (*þriðju* × 4); a
     table like that is skipped now, whichever number it is. */
  for (const num of ["ET", "FT"]) {
    const cells = CASES
      .map((cs) => ({ m: `${kyn}-${(cs.k === "ÞG" ? "ÞGF" : cs.k)}${num}`, label: cs.name }))
      .filter((c) => w.forms[c.m]);
    if (cells.length < 4) continue;
    if (sameInEveryCell(w, cells)) continue;
    if (!pol(ctx).marks(cells.map((c) => c.m))) continue;
    return {
      type: "table", kind: "to", skill: "toluord", w, cells,
      title: `${w.o} · ${GENDERS[kyn.toLowerCase()]} ${num === "ET" ? "eintala" : "fleirtala"}`,
      base: 5, word: wordKey(w.o, w.c), lvl: bandFor(ctx, "toluord"), paradigm: w.forms,
    };
  }
  return null;
}

function shuffle(a) {
  const x = [...a];
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
}

/* ================= 6. Word meaning ================================= */

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

function taskMeaning(ctx) {
  const { lex, sess, S } = ctx;
  const withDef = meaningPool(lex.all);
  if (!withDef.length) return null;
  const today = todayKey();
  const pool = withDef.map((x) => ({ x, key: wordKey(x.o, x.c) }));

  const seen = sess.seen.slice(-14);
  const nearby = pool.filter((p) => seen.includes(p.x.o));
  const chosen = chooseWord(S, nearby, today) || chooseWord(S, pool, today);
  if (!chosen) return null;

  markAsked(S, chosen.key, today);
  return {
    type: "meaning", skill: "ordaford", n: chosen.x, base: 8, counts: false,
    word: chosen.key, lvl: 1,
    spacing: history(S, chosen.key),
  };
}

/* ================= 7. Fallstjórn =================================== */

function taskGovern(ctx) {
  const { lex } = ctx;
  const P = pol(ctx);
  const cands = [];
  lex.sentences.filter((s) => P.level(s.lvl)).forEach((s) =>
    s.tok.forEach((t, i) => {
      /* Verbs: only government the guard confirmed against government.py, and
         only when it is unambiguous (a single governed case). */
      if (t.c === "sagnorð" && t.g && t.g.length === 1) cands.push({ s, i, t });
      /* Prepositions: `pg` is set during the build and only where the case is
         confirmed — either by the table (a preposition governing one case) or by
         an unambiguous surface form. This used to be read off the next mark,
         which meant a preposition governing two cases could produce a wrong
         question whenever the form was ambiguous. */
      if (t.c === "forsetning" && t.pg && !headsTimePhrase(lex, s, i)) {
        cands.push({ s, i, t, fall: CASEWORD[t.pg] });
      }
    })
  );
  if (!cands.length) return null;
  const c = pick(cands);
  const fall = c.fall || CASEWORD[c.t.g[0]];
  if (!fall) return null;
  return {
    type: "govern", skill: "fallstjorn", ...c, fall, picked: null,
    base: 10, cell: "stjórn:" + c.t.l, word: tokenKey(lex, c.t), lvl: c.s.lvl,
  };
}

/* ---------- time phrases (v6.9) ----------
 *
 * "Sólin skín í dag": the question asked which case *í* governs, and the
 * explanation offered the rule for *í* and *á* — motion takes the accusative,
 * location the dative. Neither applies to a time phrase, and following the rule
 * leads a child to the wrong case (*í síðustu viku* is dative, *í dag*
 * accusative, and neither is motion or location). There is no rule to reason
 * with, so a preposition that heads a time phrase is left out of the
 * fallstjórn question; where a time phrase still turns up (the cloze), it gets
 * its own explanation (tasks/explain.js `explainTimePhrase`). *tími* is left
 * out of the test: *í tímanum* is usually "in the lesson", a place. */
export const isTimeNoun = (e) => !!e && e.s === "time" && e.o !== "tími";
const TIME_MODIFIER = new Set(["lýsingarorð", "fornafn", "töluorð", "greinir"]);

/** Does the preposition at `i` head a time phrase? */
export function headsTimePhrase(lex, s, i) {
  const t = s.tok[i];
  if (!t || t.c !== "forsetning") return false;
  let j = i + 1;
  while (s.tok[j] && (TIME_MODIFIER.has(s.tok[j].c) || s.tok[j].rj)) j++;
  const n = s.tok[j];
  if (!n || n.c !== "nafnorð") return false;
  return isTimeNoun(lex.entryForToken ? lex.entryForToken(n) : null);
}

/* ================= 8. Indeclinable words =========================== */

const INDECL = { atviksorð: "ao", forsetning: "fs", samtenging: "st",
                 upphrópun: "uh", nafnháttarmerki: "nhm" };

function taskIndecl(ctx) {
  const { lex } = ctx;
  for (let k = 0; k < 40; k++) {
    const s = pick(sentPool(ctx, "obeygjanleg"));
    const idx = s.tok.map((t, j) => (INDECL[t.c] ? j : -1)).filter((j) => j >= 0);
    if (!idx.length) continue;
    const i = pick(idx);
    return {
      type: "indecl", skill: "obeygjanleg", s, i, t: s.tok[i],
      answer: s.tok[i].c, picked: null, base: 8,
      cell: "ofl:" + s.tok[i].c, word: tokenKey(lex, s.tok[i]), lvl: s.lvl,
    };
  }
  return null;
}

/* ================= 10. Production (v6.9) ============================ */

/* The three question types where the child writes the Icelandic: find and fix
   the errors in a short text, build a sentence from word cards, and rewrite a
   sentence (past tense, plural, passive, *Í gær …*). The builders are in
   tasks/production.js; this is where they meet the level, the policy and
   the catalogue. */

const PROD = "malbeiting";

function taskHunt(ctx) {
  const P = pol(ctx);
  const band = bandFor(ctx, PROD);
  const pool = sentPool(ctx, PROD);
  if (pool.length < 6) return null;
  for (let k = 0; k < 6; k++) {
    /* v6.10: two sentences; one error below þyngd 3, two from there. The
       error diagnosis may ask for the kinds this child misses (`huntPrefer`). */
    const h = errorHunt(ctx.lex, pool, { count: band >= 3 ? 2 : 1, prefer: ctx.huntPrefer || [] });
    if (!h) return null;
    /* Every error is a cell; the policy must allow both the right one and the
       wrong one that is shown. */
    const errs = h.lines.flatMap((l) => l.toks.filter((t) => t.err).map((t) => t.err));
    if (!errs.every((e) => askable(P, e.m) && askable(P, e.wrongMark))) continue;
    return {
      type: "villur", skill: PROD, hunt: h, edits: {},
      base: 6 + 4 * h.errors, lvl: h.lvl, cell: "villur", word: null,
    };
  }
  return null;
}

function taskWorkshop(ctx) {
  const P = pol(ctx);
  const pool = sentPool(ctx, PROD).filter((s) => !s.nf);
  for (const s of shuffle(pool).slice(0, 120)) {
    const w = workshop(ctx.lex, s);
    if (!w) continue;
    if (!w.cards.every((c) => !c.m || askable(P, c.m))) continue;
    return {
      type: "smidja", skill: PROD, s, cards: w.cards, answers: w.answers,
      base: 8 + 2 * w.cards.filter((c) => !c.fixed).length, lvl: s.lvl, cell: "smidja", word: null,
    };
  }
  return null;
}

/** Which rewrites a band may ask for: the passive from þyngd 2. */
const transformKinds = (band) => Object.entries(TRANSFORMS)
  .filter(([, t]) => !t.minLevel || band >= t.minLevel).map(([k]) => k);

function taskTransform(ctx) {
  const P = pol(ctx);
  const band = bandFor(ctx, PROD);
  const pool = sentPool(ctx, PROD);
  const kinds = transformKinds(band);
  /* The kind first, so a rare one (the passive: about thirty sentences) is
     asked as often as a common one. */
  for (const kind of shuffle(kinds)) {
    for (const s of shuffle(pool).slice(0, 150)) {
      const r = TRANSFORMS[kind].build(ctx.lex, s);
      if (!r || !r.answers.length) continue;
      if (!(r.marks || []).every((c) => askable(P, c.m))) continue;
      return {
        type: "umritun", skill: PROD, ...r, kind,
        base: kind === "passive" ? 16 : 13, lvl: s.lvl, cell: "umritun:" + kind, word: null,
      };
    }
  }
  return null;
}

/* ================= 9. The rescue drill (v6.6) ======================= */

/* Builders that ask about one word wherever it stands in the sentence bank:
   the word analysed in a sentence, the word-class question about an
   indeclinable, and the case a verb or preposition governs. The general
   builders above choose their sentence first; these choose the word first. */

function taskParseWord(ctx, entry) {
  const { lex } = ctx;
  const P = pol(ctx);
  const occ = lex.occurrencesOf(entry.o, entry.c).filter((r) =>
    askable(P, r.t.m) && !(r.t.u || []).length && !r.t.rj && P.level(r.s.lvl) &&
    !isAmbiguousForm(lex, r.t));
  if (!occ.length) return null;
  const r = pick(occ);
  return {
    type: "parse", skill: "greining", s: r.s, i: r.i, t: r.t, a: readMark(r.t.m),
    picks: {}, base: 4, cell: r.t.m, word: wordKey(entry.o, entry.c), lvl: r.s.lvl,
    lemmaWord: entry,
    homograph: lex.homographClasses(entry.o).length > 1 ? lex.homographClasses(entry.o) : null,
  };
}

/** Every token in the sentence bank that is this word, as {s, i, t}. */
function tokensOf(ctx, entry, keep) {
  const { lex } = ctx;
  const P = pol(ctx);
  const key = wordKey(entry.o, entry.c);
  const out = [];
  lex.sentences.forEach((s) => {
    if (!P.level(s.lvl)) return;
    s.tok.forEach((t, i) => { if (keep(t) && tokenKey(lex, t) === key) out.push({ s, i, t }); });
  });
  return out;
}

function taskIndeclWord(ctx, entry) {
  const hits = tokensOf(ctx, entry, (t) => !!INDECL[t.c]);
  if (!hits.length) return null;
  const { s, i, t } = pick(hits);
  return {
    type: "indecl", skill: "obeygjanleg", s, i, t, answer: t.c, picked: null, base: 8,
    cell: "ofl:" + t.c, word: wordKey(entry.o, entry.c), lvl: s.lvl,
  };
}

function taskGovernWord(ctx, entry) {
  const hits = tokensOf(ctx, entry, (t) =>
    (t.c === "sagnorð" && t.g && t.g.length === 1) || (t.c === "forsetning" && t.pg))
    .filter((h) => !headsTimePhrase(ctx.lex, h.s, h.i));
  if (!hits.length) return null;
  const c = pick(hits);
  const fall = c.t.c === "forsetning" ? CASEWORD[c.t.pg] : CASEWORD[c.t.g[0]];
  if (!fall) return null;
  return {
    type: "govern", skill: "fallstjorn", ...c, fall, picked: null,
    base: 10, cell: "stjórn:" + c.t.l, word: wordKey(entry.o, entry.c), lvl: c.s.lvl,
  };
}

/** What a drill may ask, by word class, in the order it rotates through. */
const NOUN_PLAN = ["fill", "tbl_no", "revform", "parse"];
export const DRILL_PLAN = {
  kk: NOUN_PLAN, kvk: NOUN_PLAN, hk: NOUN_PLAN,
  so: ["verb", "verbslot", "tbl_so", "revform", "govern"],
  lo: ["tbl_lo", "revform", "parse"],
  fn: ["tbl_fn", "parse"], pfn: ["tbl_fn", "parse"], gr: ["tbl_fn", "parse"],
  to: ["tbl_to", "parse"], rt: ["tbl_to", "parse"],
  ao: ["indecl", "parse"], fs: ["indecl", "govern"], st: ["indecl"],
  uh: ["indecl"], nhm: ["indecl"],
};

const DRILL_BUILD = {
  fill: (ctx, w) => { ctx.forcedNoun = w; return taskFill(ctx); },
  parse: taskParseWord,
  indecl: taskIndeclWord,
  govern: taskGovernWord,
};

/** Which turn of a drill (0-based) is the meaning question: the fifth. */
export const DRILL_MEANING_TURN = 4;

/** The meaning question on the drilled word, or null if it has no meaning in
    the dictionary (or only a grammatical gloss, which is not a meaning). */
function drillMeaning(ctx, entry) {
  const full = (ctx.lex.lookup && ctx.lex.lookup(entry.o, entry.c)) || entry;
  if (!meaningPool([full]).length) return null;
  const key = wordKey(full.o, full.c);
  if (ctx.S) markAsked(ctx.S, key, todayKey());
  return {
    type: "meaning", skill: "ordaford", n: full, base: 8, counts: false,
    word: key, lvl: 1, spacing: ctx.S ? history(ctx.S, key) : null,
    typeId: "meaning", drill: true,
  };
}

/**
 * One question of a rescue drill on `entry`. Rotates through the kinds of
 * question the word's class allows, skipping any the curriculum has switched
 * off, so twenty questions on one noun are not twenty identical clozes.
 * Returns null if nothing at all can be asked — the drill then ends without
 * counting against anybody.
 */
export function drillTask(ctx, entry, turn = 0) {
  const plan = DRILL_PLAN[entry && entry.c] || [];
  if (!plan.length) return null;
  const P = pol(ctx);
  const key = wordKey(entry.o, entry.c);
  /* The fifth question is always "Orðaforði": say in your own words what the
     word means — as long as the dictionary has a meaning to show afterwards.
     It has no wrong answer (`correct: null`), so it does not count toward the
     drill's ten to twenty; and the rotation below skips over it, so no other
     kind of question loses its turn. */
  if (turn === DRILL_MEANING_TURN) {
    const t = drillMeaning(ctx, entry);
    if (t) return t;
  }
  const slot = turn > DRILL_MEANING_TURN ? turn - 1 : turn;
  ctx.drillWord = entry;
  try {
    for (let k = 0; k < plan.length * 3; k++) {
      const id = plan[(slot + k) % plan.length];
      const spec = TASKS.find((t) => t.id === id);
      if (spec && !enabled(P, spec)) continue;
      const build = DRILL_BUILD[id] || (spec && spec.gen);
      if (!build) continue;
      const task = build(ctx, entry);
      if (!task || task.word !== key) continue;
      if (task.answers !== undefined && !(task.answers && task.answers.length)) continue;
      task.typeId = id;
      task.drill = true;
      return task;
    }
    return null;
  } finally {
    ctx.drillWord = null;
    ctx.forcedNoun = null;
  }
}

/* ================= The catalogue itself ============================ */

export const TASKS = [
  { id: "fill",    skill: "nafnord",        weight: () => 26, gen: taskFill },
  { id: "verbslot", skill: "sagnord",       weight: () => 14, gen: taskVerbSlot },
  { id: "verb",    skill: "sagnord",        weight: () => 8,  gen: taskVerb },
  { id: "parse",   skill: "greining",       weight: () => 11, gen: taskParse },
  { id: "revform", skill: "lysingarord", anyOf: ["lysingarord", "sagnord", "nafnord"],
    weight: () => 7, gen: taskReverse },
  { id: "govern",  skill: "fallstjorn",     weight: () => 8,  gen: taskGovern },
  { id: "indecl",  skill: "obeygjanleg",    weight: () => 5,  gen: taskIndecl },
  { id: "syntax",  skill: "setningafraedi", weight: () => 8,  gen: taskSyntax },
  { id: "clause",  skill: "setningagerd",   weight: () => 8,  gen: taskClause },
  { id: "tbl_no",  skill: "nafnord",        weight: () => 5,  gen: tableNoun },
  { id: "tbl_lo",  skill: "lysingarord",    weight: () => 6,  gen: tableAdj },
  { id: "tbl_so",  skill: "sagnord",        weight: () => 5,  gen: tableVerb },
  { id: "tbl_fn",  skill: "fornofn",        weight: () => 4,  gen: tablePronoun },
  { id: "tbl_to",  skill: "toluord",        weight: () => 3,  gen: tableNumeral },
  /* v6.11: in a session the free-text meaning question is an optional bonus
     after the graded Orðaforði questions (ui/render-more.js), not a question
     of its own. It still comes in a rescue drill and outside sessions. */
  { id: "meaning", skill: "ordaford",       weight: (ctx) => (ctx.run ? 0 : 4), gen: taskMeaning },
  /* v6.9: production. Writing the Icelandic tests understanding rather than
     recall, so these three together weigh about as much as the cloze, and the
     recognition types above were trimmed a little to make room. */
  { id: "umritun", skill: "malbeiting",     weight: () => 10, gen: taskTransform },
  { id: "smidja",  skill: "malbeiting",     weight: () => 8,  gen: taskWorkshop },
  { id: "villur",  skill: "malbeiting",     weight: () => 8,  gen: taskHunt },

  /* v6.11: at least three kinds of question in every category
     (tasks/more.js). */
  { id: "no_val",     skill: "nafnord",        weight: () => 8,  gen: (c) => MORE.noChoice(c) },
  { id: "lo_beyging", skill: "lysingarord",    weight: () => 8,  gen: (c) => MORE.loStrongWeak(c) },
  { id: "lo_stig",    skill: "lysingarord",    weight: () => 6,  gen: (c) => MORE.loDegree(c) },
  { id: "lo_samr",    skill: "lysingarord",    weight: () => 7,  gen: (c) => MORE.loAgree(c) },
  { id: "fn_eyda",    skill: "fornofn",        weight: () => 7,  gen: (c) => MORE.fnGap(c) },
  { id: "fn_stad",    skill: "fornofn",        weight: () => 6,  gen: (c) => MORE.fnReplace(c) },
  { id: "fn_aftur",   skill: "fornofn",        weight: () => 5,  gen: (c) => MORE.fnReflex(c) },
  { id: "to_samr",    skill: "toluord",        weight: () => 5,  gen: (c) => MORE.toAgree(c) },
  { id: "to_val",     skill: "toluord",        weight: () => 3,  gen: (c) => MORE.toChoice(c) },
  { id: "to_dags",    skill: "toluord",        weight: () => 4,  gen: (c) => MORE.toDate(c) },
  { id: "to_flt",     skill: "toluord",        weight: () => 3,  gen: (c) => MORE.toPlural(c) },
  { id: "ob_smella",  skill: "obeygjanleg",    weight: () => 4,  gen: (c) => MORE.obTap(c) },
  { id: "ob_fsao",    skill: "obeygjanleg",    weight: () => 4,  gen: (c) => MORE.obAdvPrep(c) },
  { id: "ob_st",      skill: "obeygjanleg",    weight: () => 4,  gen: (c) => MORE.obConj(c) },
  { id: "ob_flokka",  skill: "obeygjanleg",    weight: () => 3,  gen: (c) => MORE.obSort(c) },
  { id: "gr_smella",  skill: "greining",       weight: () => 5,  gen: (c) => MORE.grTap(c) },
  { id: "gr_flokka",  skill: "greining",       weight: () => 4,  gen: (c) => MORE.grSort(c) },
  { id: "fs_fsno",    skill: "fallstjorn",     weight: () => 6,  gen: (c) => MORE.fsPrepNoun(c) },
  { id: "fs_hreyf",   skill: "fallstjorn",     weight: () => 5,  gen: (c) => MORE.fsMotion(c) },
  { id: "fs_sogn",    skill: "fallstjorn",     weight: () => 6,  gen: (c) => MORE.fsVerb(c) },
  { id: "fs_operson", skill: "fallstjorn",     weight: () => 5,  gen: (c) => MORE.fsImpers(c) },
  { id: "or_heiti",   skill: "ordaford",       weight: () => 4,  gen: (c) => MORE.ordSynAnt(c) },
  { id: "or_samhengi", skill: "ordaford",      weight: () => 4,  gen: (c) => MORE.ordContext(c) },
  { id: "or_myndun",  skill: "ordaford",       weight: () => 3,  gen: (c) => MORE.ordFormation(c) },
  { id: "or_utundan", skill: "ordaford",       weight: () => 3,  gen: (c) => MORE.ordOdd(c) },
  { id: "setn_hlut",  skill: "setningafraedi", weight: () => 5,  gen: (c) => MORE.synRole(c) },
  { id: "setn_flokka", skill: "setningafraedi", weight: () => 4, gen: (c) => MORE.synSort(c) },
  { id: "gerd_finna", skill: "setningagerd",   weight: () => 5,  gen: (c) => MORE.clFind(c) },
  { id: "gerd_upphaf", skill: "setningagerd",  weight: () => 4,  gen: (c) => MORE.clStart(c) },
];

/* Some types serve more than one skill (the reverse analysis covers
   adjectives, verbs and nouns) and may appear if any of them is on. */
const enabled = (P, t) =>
  P.type(t.id) &&
  (t.anyOf ? t.anyOf.some((x) => P.skill(x)) : P.skill(t.skill));

/**
 * Choose and build the next task.
 * Only enabled skills can appear; a generator that cannot produce a good
 * question returns null and is skipped rather than guessing.
 */
export function nextTask(ctx) {
  const { S, sess } = ctx;
  if (ctx.forcedNoun) {
    const t = taskFill(ctx);
    if (t) return t;
  }
  const P = pol(ctx);
  const all = TASKS.filter((t) => enabled(P, t) && t.weight(ctx) > 0);
  if (!all.length) return null;
  /* v6.11: inside a session, the mix rule (core/mix.js) — at least three
     kinds of question, none over ~40%, tables over 30%, analysis over 35%.
     If nothing the rule allows can be built, the rule gives way: a session
     with a question is better than one without. */
  const gate = mixGate(ctx.mix, all.map((t) => t.id));
  const gated = gate ? all.filter((t) => gate.has(t.id)) : all;
  const avail = gated.length ? gated : all;

  /* Orðaforði has one question type against two to four for the grammar
     skills, so a fixed weight drowned it once several skills were on. Its
     weight is now the average share of the OTHER enabled skills, so it comes
     up as often as a typical skill does, however many are switched on. */
  const skillOf = (t) => (t.anyOf ? t.anyOf.find((x) => P.skill(x)) : t.skill);
  const perSkill = {};
  avail.forEach((t) => {
    if (t.id === "meaning") return;
    const k = skillOf(t);
    perSkill[k] = (perSkill[k] || 0) + t.weight(ctx);
  });
  const shares = Object.values(perSkill);
  /* ×1.3: the spacing rule (one showing per word, then a wait) turns some of
     its turns down, and they go to other skills. Measured over 1,500 questions
     this lands Orðaforði at or a little above the average skill. */
  const meaningW = shares.length ? 1.3 * shares.reduce((a, b) => a + b, 0) / shares.length : 4;

  const tried = new Set();
  for (let k = 0; k < 40; k++) {
    const choice = wpick(avail, (t) => {
      let w = t.id === "meaning" ? meaningW : t.weight(ctx);
      /* tables and definitions should come in gaps, not in clusters */
      if (t.id.startsWith("tbl") && sess.sinceTable < 4) w *= 0.15;
      if (t.id === "meaning" && sess.sinceMeaning < 2) w *= 0.1;
      return w;
    });
    if (tried.has(choice.id) && tried.size < avail.length) continue;
    tried.add(choice.id);
    const task = choice.gen(ctx);
    if (task) {
      task.typeId = choice.id;
      sess.sinceTable = choice.id.startsWith("tbl") ? 0 : sess.sinceTable + 1;
      sess.sinceMeaning = choice.id === "meaning" ? 0 : sess.sinceMeaning + 1;
      if (task.n) sess.seen.push(task.n.o);
      if (task.w) sess.seen.push(task.w.o);
      if (task.v) sess.seen.push(task.v.o);
      return task;
    }
  }

  /* The last resort walks only the builders that ARE available and returns
     null if nothing is possible. No material beats material switched off. */
  for (const t of [...avail, ...all.filter((x) => !avail.includes(x))]) {
    const task = t.gen(ctx);
    if (task) { task.typeId = t.id; return task; }
  }
  return null;
}

export { taskFill, taskVerb, taskVerbSlot, taskParse, taskReverse, taskSyntax, taskGovern,
         taskMeaning, taskIndecl, tableNoun, tableAdj, tableVerb, tablePronoun, tableNumeral,
         taskHunt, taskWorkshop, taskTransform };
