/* Setningafræði: frumlag, umsögn, andlag, sagnfylling.

     syntax       click the word that has the role asked for
     setn_hlut    which part of the sentence is the marked word
     setn_flokka  sort the heads of the parts of one sentence
     setn_lidir   what kind of phrase the marked words are (item 28)
     lid_finna    click every word of the forsetningarliður (item 28)
     hver_gerdi   who did what to whom, in a passive or a relative clause
                  (issue 27)

   The roles (`r` on each token) come from the parse and passed the guard; the
   builders read them and infer nothing. */

import { bandOf } from "../core/difficulty.js";
import { built, FX } from "./effects.js";
import { pick, wpick, bandFor, forcedCell, fresh, PUNCT } from "./shared.js";
import { planHint, SETNINGARHLUTAR } from "../core/hint.js";
import { EX } from "../../../data/exercises.js";

/* ================= Setningarhlutar ======================================= */

export function taskSyntax(lex, view, rng) {
  const { sess } = view;
  const P = view.policy;
  const b = Math.min(Math.max(3, bandOf(sess, "setningafraedi")), P.maxLevel);
  const usable = lex.sentences.filter((x) => P.level(x.lvl));
  const pool = usable.filter((s) => s.tok.some((t) => t.r) && s.lvl <= b);
  if (!pool.length && !usable.length) return null;
  /* A review (tasks/review.js) asks for the role that was missed. */
  const fc = forcedCell(view);
  const has = (x) => x.tok.some((t) => "setn:" + t.r === fc);
  const from = !fc ? (pool.length ? pool : usable) : pool.some(has) ? pool.filter(has) : usable.filter(has);
  if (!from.length) return null;
  const s = pick(from, rng);
  const roles = [...new Set(s.tok.filter((t) => t.r).map((t) => t.r))];
  if (!roles.length) return null;
  const askRole = fc ? fc.slice(5) : pick(roles, rng);
  return built({
    type: "syntax", skill: "setningafraedi", s, askRole, picked: null,
    base: 12, cell: "setn:" + askRole, lvl: s.lvl,
  });
}

/* ================= Choose and sort (v6.11) =============================== */

const ROLES = ["frumlag", "umsögn", "andlag", "sagnfylling"];
/* The head of the part, not a word inside it: *miklu* in *miklu máli* carries
   the role of the phrase, and naming it "andlag" on its own teaches the
   wrong thing. A predicative adjective is the head of its part. */
const roleHead = (t, s, i) => !t.rn && !(t.ra || []).length && ROLES.concat("óbeint andlag").includes(t.r)
  && (["nafnorð", "sagnorð"].includes(t.c) || (t.c === "lýsingarorð" && t.r === "sagnfylling")
    /* a pronoun on its own (*Ég*, *þeim*), not one beside a noun (*verkefnið sitt*) */
    || (t.c === "fornafn" && !["nafnorð"].includes((s.tok[i - 1] || {}).c) && (s.tok[i + 1] || {}).c !== "nafnorð"));

export function synRole(lex, view, rng) {
  const P = view.policy;
  const b = Math.max(3, bandFor(view, "setningafraedi"));
  /* A review (tasks/review.js) asks for the role that was missed — the
     indirect object too, though it is otherwise kept for þyngd 4. */
  const fc = forcedCell(view);
  const roles = b >= 4 || fc === "setn:óbeint andlag" ? [...ROLES, "óbeint andlag"] : ROLES;
  const hits = [];
  lex.sentences.forEach((s) => {
    if (!P.level(s.lvl) || s.lvl > b) return;
    s.tok.forEach((t, i) => {
      if (roles.includes(t.r) && roleHead(t, s, i) && (!fc || "setn:" + t.r === fc)) hits.push({ s, i, t });
    });
  });
  if (!hits.length) return null;
  const h = pick(hits, rng);
  return built({
    type: "choice", skill: "setningafraedi", s: h.s, i: h.i, mark: true,
    title: "Hvaða setningarhluti?", question: `Hvert er hlutverk orðsins *${h.t.w}* í setningunni?`,
    options: roles, answer: h.t.r,
    why: { frumlag: "Frumlagið er sá eða það sem gerir eitthvað eða er eitthvað (*hver/hvað?*).",
      umsögn: "Umsögnin er sögnin sem segir hvað frumlagið gerir.",
      andlag: "Andlagið er það sem sögnin beinist að (*hvern/hvað?*), oft í aukafalli.",
      sagnfylling: "Sagnfylling fylgir sögnum eins og *vera, verða, heita* og lýsir frumlaginu.",
      "óbeint andlag": "Óbeint andlag er sá sem fær eitthvað (*gaf **henni** bókina*), oftast í þágufalli." }[h.t.r],
    base: 10, lvl: h.s.lvl, cell: "setn:" + h.t.r, word: null, tags: ["syn"], miss: ["setningalidir"],
  });
}

export function synSort(lex, view, rng) {
  const P = view.policy;
  const b = Math.max(3, bandFor(view, "setningafraedi"));
  for (let k = 0; k < 40; k++) {
    const s = pick(lex.sentences.filter((x) => P.level(x.lvl) && x.lvl <= b), rng);
    if (!s) return null;
    const idx = s.tok.map((t, j) => (ROLES.includes(t.r) && roleHead(t, s, j) ? j : -1)).filter((j) => j >= 0);
    const kinds = new Set(idx.map((j) => s.tok[j].r));
    if (idx.length < 3 || kinds.size < 3 || idx.length > 5) continue;
    return built({
      type: "sort", skill: "setningafraedi", s, items: idx.map((j) => ({ w: s.tok[j].w, j, cls: s.tok[j].r })),
      buckets: ROLES, title: "Flokkaðu setningarhlutana",
      question: "Hvert er hlutverk hvers undirstrikaðs orðs?",
      base: 4 + 3 * idx.length, lvl: s.lvl, cell: "sort:setn", word: null, tags: ["syn"],
    });
  }
  return null;
}

/* ================= Phrases: nafnliður, sagnliður, forsetningarliður (item 28)
 *
 * The phrases come from the build (`ph` on the sentence, pipeline/phrases.py), which
 * records one only where the parser's node and the word classes inside it
 * agree, and where no neighbouring word could belong to it. The builders
 * below read them and narrow further; they never draw a phrase themselves.
 *
 *   nafnliður          a subject, object or predicative noun phrase whose
 *                      role the build confirmed, or the nominals after the
 *                      preposition of a forsetningarliður
 *   forsetningarliður  one preposition and the fallorð it governs
 *   sagnliður          only the narrow one every book agrees on (Málvísir:
 *                      "sögn ásamt andlagi eða fyllilið"): the finite verb
 *                      and the objects or predicative that follow it, to the
 *                      end of a one-clause sentence. A predicate with an
 *                      adverbial in it (*sá hesta á vellinum í morgun*) is
 *                      in the data and is NOT asked: books differ on how far
 *                      the sagnliður reaches.
 *   atviksliður        one adverb standing on its own
 */

const NOMINAL_X = new Set(["no", "fn", "pfn", "abfn", "lo", "to", "töl", "raðnr", "gr",
  "person", "entity", "sérnafn"]);
const NOUN_X = new Set(["no", "person", "entity", "sérnafn"]);
const FINITE_M = /-(FH|VH|BH)-/;
const PHRASE_NM = { nl: "nafnliður", fl: "forsetningarliður", sl: "sagnliður", al: "atviksliður" };
const lowerW = (w) => String(w || "").toLowerCase();
const spanText = (s, a, b) => s.tok.slice(a, b + 1).map((t) => t.w).join(" ");
/* A sentence-initial word is written small inside an explanation, unless it
   is a name (its lemma has the capital too). */
const inText = (s, a, b) => {
  const text = spanText(s, a, b);
  const l = s.tok[a].l || "";
  const name = l && l.charAt(0) !== l.charAt(0).toLowerCase();
  return a === 0 && !name ? text.charAt(0).toLowerCase() + text.slice(1) : text;
};

/* Every phrase of the bank that may be asked about, once per lexicon. */
const PHRASES = new WeakMap();
function phraseSlots(lex) {
  if (PHRASES.has(lex)) return PHRASES.get(lex);
  const list = [];
  for (const s of lex.sentences) {
    for (const r of s.ph || []) {
      const toks = s.tok.slice(r.a, r.b + 1);
      let group = r.t, sub = r.t;
      if (r.t === "nl") {
        if (r.i) group = sub = "nli";
        else sub = toks.length > 1 ? "multi" : toks[0].c === "nafnorð" ? "noun" : "pron";
      } else if (r.t === "sl") {
        /* the narrow sagnliður only: see above */
        const rest = toks.slice(1);
        if (!rest.length || !rest.every((t) => NOMINAL_X.has(t.x)
          || (t.x === "so" && !FINITE_M.test(t.m || "")))) continue;
        if (!rest.some((t) => ["andlag", "óbeint andlag", "sagnfylling"].includes(t.r))) continue;
      } else if (!PHRASE_NM[r.t]) continue;
      list.push({ s, a: r.a, b: r.b, t: r.t, group, sub, key: `lidur:${s.t}#${r.a}-${r.b}` });
    }
  }
  PHRASES.set(lex, list);
  return list;
}

function phraseWhy(x) {
  const { s, a, b } = x;
  const text = inText(s, a, b);
  const toks = s.tok.slice(a, b + 1);
  if (x.group === "nli") {
    const fs = s.tok[a - 1];
    return `*${text}* er **nafnliður**. Hann stendur inni í forsetningarliðnum *${lowerW(fs.w)} ${text}*: `
      + `forsetningarliður er forsetning og nafnliður saman. Undirstrikaði hlutinn byrjar ekki á forsetningunni, svo hann er nafnliðurinn einn.`;
  }
  if (x.t === "nl") {
    if (x.sub === "pron")
      return `*${text}* er **nafnliður**. Fornafn getur staðið eitt sem nafnliður, alveg eins og nafnorð: það kemur í staðinn fyrir heilan nafnlið.`;
    const at = toks.findIndex((t) => NOUN_X.has(t.x));
    const head = { w: inText(s, a + at, a + at) };
    return x.sub === "multi"
      ? `*${text}* er **nafnliður**: aðalorðið er nafnorðið *${head.w}* og hin orðin standa með því. Prófaðu að setja fornafn (*hann, hún, það, þau …*) í staðinn fyrir allan liðinn.`
      : `*${text}* er **nafnliður**: nafnorð getur staðið eitt sem nafnliður. Prófaðu að setja fornafn (*hann, hún, það, þau …*) í staðinn.`;
  }
  if (x.t === "fl") {
    const fs = toks[0];
    const fall = { þf: "þolfalli", þgf: "þágufalli", ef: "eignarfalli" }[fs.pg];
    return `*${text}* er **forsetningarliður**: forsetningin *${lowerW(fs.w)}* og fallorðið sem hún stýrir`
      + (fall ? ` (*${spanText(s, a + 1, b)}*, í ${fall}).` : ".");
  }
  if (x.t === "sl") {
    const what = toks.some((t) => t.r === "sagnfylling") ? "sagnfyllingu" : "andlagi";
    /* *hef lesið*, *vil fá*: the helping verb and the main verb together */
    let n = 1;
    while (n < toks.length && toks[n].x === "so") n++;
    const verbs = toks.slice(0, n).map((t) => t.w).join(" ");
    return `*${text}* er **sagnliður**: ${n > 1 ? "sagnirnar" : "sögnin"} *${verbs}* ásamt ${what}. Sagnliðurinn segir hvað frumlagið gerir eða er.`;
  }
  return `*${text}* er **atviksliður**: atviksorð sem stendur sjálfstætt í setningunni og segir hvar, hvenær eða hvernig. Atviksliður er oft bara eitt orð.`;
}

/* The step a session is on (þyngd 1–2, 3–4, 5–7):
     1  nafnliður, sagnliður or forsetningarliður; sentences up to level 3;
        a nafnliður is a noun or a noun with its words
     3  atviksliður too; a pronoun alone as a nafnliður; and the nafnliður
        INSIDE a forsetningarliður (*á [gamla borðinu]*), which is the trap;
        sentences up to level 5
     5  the same in the long sentences of levels 4–7 (the sagnliður, which
        the build vouches for in one-clause sentences only, stays) */
const phraseStep = (band) => (band >= 5 ? 5 : band >= 3 ? 3 : 1);
const GROUP_WEIGHT = { nl: 3, fl: 3, sl: 2, al: 1.2, nli: 2 };
const SUB_WEIGHT = { multi: 3, noun: 2, pron: 1 };

function phrasePool(lex, view, step) {
  const P = view.policy;
  const all = phraseSlots(lex).filter((x) => P.level(x.s.lvl));
  const easy = (x) => x.group !== "al" && x.group !== "nli" && x.sub !== "pron";
  if (step === 1) return all.filter((x) => x.s.lvl <= 3 && easy(x));
  if (step === 3) return all.filter((x) => x.s.lvl <= 5);
  const hard = all.filter((x) => x.s.lvl >= 4 || x.t === "sl");
  return hard.some((x) => x.t !== "sl") ? hard : all;
}

/** "Hvers konar liður er undirstrikaði hlutinn?" */
export function synPhrase(lex, view, rng) {
  const step = phraseStep(bandFor(view, "setningafraedi"));
  const fc = forcedCell(view);
  if (fc && !fc.startsWith("lidur:")) return null;
  const avoid = view.force && view.force.avoid;
  let pool = phrasePool(lex, view, step);
  if (fc) {
    /* A review asks for the kind of phrase that was missed, at any þyngd. */
    const want = (x) => "lidur:" + x.group === fc && x.s.t !== avoid;
    pool = pool.some(want) ? pool.filter(want)
      : phraseSlots(lex).filter((x) => view.policy.level(x.s.lvl) && want(x));
  } else if (avoid) pool = pool.filter((x) => x.s.t !== avoid);
  if (!pool.length) return null;
  const groups = [...new Set(pool.map((x) => x.group))];
  const g = wpick(groups, (k) => GROUP_WEIGHT[k], rng);
  let of = pool.filter((x) => x.group === g);
  if (g === "nl") {
    const sub = wpick([...new Set(of.map((x) => x.sub))], (k) => SUB_WEIGHT[k], rng);
    of = of.filter((x) => x.sub === sub);
  }
  const x = pick(fresh(view, (y) => y.key, of), rng);
  const four = step >= 3 || x.group === "al";
  const options = ["nafnliður", "sagnliður", "forsetningarliður", ...(four ? ["atviksliður"] : [])];
  return built({
    type: "choice", skill: "setningafraedi", s: x.s, i: -1,
    span: { from: x.a, to: x.b }, markSpan: true,
    title: "Hvers konar liður?",
    question: "Hvers konar liður er **undirstrikaði** hlutinn?",
    options, answer: PHRASE_NM[x.t],
    why: phraseWhy(x),
    base: step === 1 ? 10 : step === 3 ? 12 : 14,
    lvl: x.s.lvl, cell: "lidur:" + x.group, word: null,
    tags: x.group === "nli" ? ["lidir", "lidir:fl"] : ["lidir"],
    miss: ["lidir"],
    /* The nafnliður inside a forsetningarliður taken for the whole. */
    missFor: x.group === "nli" ? { forsetningarliður: ["lidir", "lidir_fl"] } : null,
  }, [FX.exSeen(x.key)]);
}

/* ---- find the forsetningarliður ------------------------------------------
 *
 * "Smelltu á öll orðin í forsetningarliðnum." Asked only of a sentence in
 * which EVERY preposition opens a forsetningarliður the build recorded: a
 * preposition whose phrase the build would not vouch for (*út í garð*, *í
 * dag*, a phrase with a clause inside) means the sentence has a second
 * candidate, and the sentence is left out.
 *
 *   þyngd 1–3  one forsetningarliður, sentences up to level 4
 *   þyngd 4–7  mostly sentences of level 4 and up with one, and sentences
 *              of any level with two — both are to be found */
const PP_SENTENCES = new WeakMap();
function ppSentences(lex) {
  if (PP_SENTENCES.has(lex)) return PP_SENTENCES.get(lex);
  const list = [];
  for (const s of lex.sentences) {
    const fl = (s.ph || []).filter((r) => r.t === "fl");
    if (!fl.length || fl.length > 2) continue;
    const starts = new Set(fl.map((r) => r.a));
    const preps = s.tok.map((t, j) => (t.x === "fs" || t.c === "forsetning" ? j : -1)).filter((j) => j >= 0);
    if (preps.length !== fl.length || !preps.every((j) => starts.has(j))) continue;
    /* A fixed phrase the parser gives as one word (*í gær*, *á morgun*, *um
       helgina*) looks like a forsetningarliður to a pupil and is not asked
       as one: a sentence that has it outside the phrase is left out. */
    const inFl = (j) => fl.some((r) => j >= r.a && j <= r.b);
    if (s.tok.some((t, j) => t.w.includes(" ") && !inFl(j))) continue;
    /* two phrases side by side would be read as one */
    if (fl.length === 2 && Math.abs(fl[0].a - fl[1].a) <= Math.max(fl[0].b - fl[0].a, fl[1].b - fl[1].a) + 1) continue;
    list.push({ s, fl });
  }
  PP_SENTENCES.set(lex, list);
  return list;
}

export function synFindPP(lex, view, rng) {
  const P = view.policy;
  const fc = forcedCell(view);
  if (fc && fc !== "lidur:finna-fl") return null;
  const avoid = view.force && view.force.avoid;
  const hard = bandFor(view, "setningafraedi") >= 4;
  const all = ppSentences(lex).filter((x) => P.level(x.s.lvl) && x.s.t !== avoid);
  /* From þyngd 4 most questions are the hard ones (two phrases, or a long
     sentence); the rest are one phrase in a sentence of level 2 or 3, so
     that the step has more than its hard sentences to draw on. */
  const harder = all.filter((x) => x.fl.length === 2 || x.s.lvl >= 4);
  let pool = !hard ? all.filter((x) => x.fl.length === 1 && x.s.lvl <= 4)
    : harder.length && rng() < 0.6 ? harder
      : all.filter((x) => x.fl.length === 1 && x.s.lvl >= 2 && x.s.lvl <= 3);
  if (hard && !pool.length) pool = harder;
  if (!pool.length) pool = all.filter((x) => (hard ? true : x.fl.length === 1));
  if (!pool.length) return null;
  const x = pick(fresh(view, (y) => "finna:" + y.s.t, pool), rng);
  const targets = [];
  for (const r of x.fl) for (let j = r.a; j <= r.b; j++) if (!PUNCT.has(x.s.tok[j].w)) targets.push(j);
  const two = x.fl.length === 2;
  const texts = x.fl.map((r) => `*${inText(x.s, r.a, r.b)}*`);
  return built({
    type: "tap", skill: "setningafraedi", s: x.s, cls: "forsetningarliður", targets, whole: true,
    what: two ? "forsetningarliðirnir" : "forsetningarliðurinn",
    title: two ? "Finndu forsetningarliðina" : "Finndu forsetningarliðinn",
    question: two
      ? "Í setningunni eru **tveir** forsetningarliðir. Smelltu á **öll orðin** í þeim báðum."
      : "Smelltu á **öll orðin** í forsetningarliðnum.",
    why: (two ? `Forsetningarliðirnir eru ${texts.join(" og ")}. ` : `Forsetningarliðurinn er ${texts[0]}. `)
      + "Forsetningarliður hefst á forsetningu og nær yfir fallorðin sem hún stýrir: nafnorðið og orðin sem standa með því.",
    base: two ? 16 : 13, lvl: x.s.lvl, cell: "lidur:finna-fl", word: null,
    tags: ["lidir"], miss: ["lidir"],
  }, [FX.exSeen("finna:" + x.s.t)]);
}

/* ================= The structure hint (item 26) ===========================
 *
 * Every question here may carry `coding`: the structure of its sentence
 * (core/structure.js) as a hint — shown, offered or left out by the pupil's
 * þyngd, and never the answer (core/hint.js, where the rule and its reasons
 * are). What each type ASKS decides what the hint must not show:
 *
 *   syntax       the role asked for; every word that is a right click
 *   setn_hlut    every setningarhluti (they are the options), and nothing on
 *                the marked word
 *   setn_flokka  every setningarhluti (they are the buckets), nothing on the
 *                underlined words
 *   setn_lidir   the setningarhlutar and the forsetningarliðir (a frumlag is
 *                a nafnliður, an umsögn opens the sagnliður: either would
 *                name the answer), nothing on the underlined words
 *   lid_finna    the forsetningarliðir; every word of them is a right click
 *   hver_gerdi   nothing is hidden. It asks who DID it, which is meaning,
 *                and the marks are the grammatical parts: the frumlag of a
 *                passive is marked and is not the one who did it, and telling
 *                the two apart is the question. Its answer is a pick among
 *                names, not a click on a word, so no mark can be the answer.
 *
 * A new type in this file wraps its builder in `withHint` with its own line. */
const ASKS = {
  syntax: (t) => ({ hide: [t.askRole],
    right: t.s.tok.map((x, j) => (x.r === t.askRole || (x.ra || []).includes(t.askRole) ? j : -1)).filter((j) => j >= 0) }),
  setn_hlut: (t) => ({ hide: SETNINGARHLUTAR, pointed: [t.i] }),
  setn_flokka: (t) => ({ hide: SETNINGARHLUTAR, pointed: t.items.map((x) => x.j) }),
  setn_lidir: (t) => ({ hide: [...SETNINGARHLUTAR, "forsetningarliður"],
    pointed: Array.from({ length: t.span.to - t.span.from + 1 }, (_, k) => t.span.from + k) }),
  lid_finna: (t) => ({ hide: ["forsetningarliður"], right: t.targets }),
  hver_gerdi: () => ({ hide: [] }),
};

/** A builder whose task carries the hint its type allows at the pupil's þyngd. */
const withHint = (id, build) => (lex, view, rng) => {
  const b = build(lex, view, rng);
  if (!b || !b.task.s) return b;
  const coding = planHint(b.task.s, { thyngd: bandFor(view, "setningafraedi"), ...ASKS[id](b.task) });
  if (coding) b.task.coding = coding;
  return b;
};

/* ================= Hver gerði hvað? (issue 27) ===========================
 *
 * A comprehension question: the pupil reads a sentence and says WHO did what
 * the verb says, or who it was done to. What is asked is meaning, not a
 * setningarhluti — and in a passive the two come apart, which is the point:
 * in *Hundurinn var bitinn af kettinum* the frumlag is the dog and the cat
 * bit. (The roles `r` on the tokens are the grammatical ones and are never
 * read here; the answers are `who` and `whom` of each fact.)
 *
 * The items are hand-written (content/setningafraedi/hver-gerdi-hvad.tsv) and
 * the build refused every one whose parse did not give the same gerandi and
 * þolandi (pipeline/who_did.py). An item is a sentence in the bank's own
 * shape (so its structure can be drawn, core/structure.js), the nouns that
 * can be the answer in the nominative (`n`), and one fact per verb (`f`): the
 * verb, who did it (`who`, a token index, or null when a passive does not
 * say), who it was done to (`whom`, or null when the verb has no þolandi),
 * the two questions (`qa`: *Hver beit?*, `qp`: *Hver var bitinn?*) and the
 * same thing as a plain active sentence (`p`: *Kötturinn beit hundinn.*).
 *
 * One structure at a time (docs/DLD-PLAN.md §3), by the item's level:
 *
 *   þyngd 1–2  þolmynd, with an *af* phrase or without
 *   þyngd 3–4  and relative clauses whose *sem* is the doer (*Strákurinn sem
 *              elti hundinn datt*), or that end the sentence
 *   þyngd 5–7  and relative clauses whose *sem* is the one it is done to
 *              (*Strákurinn sem hundurinn elti datt*), and a passive inside
 *              a relative clause
 *
 * The newest structure is asked most; the earlier ones stay as review.
 *
 * The scaffold is the structure of the sentence, drawn (item 25), and it
 * fades by the one rule of every Setningafræði question (core/hint.js,
 * `withHint` above): shown from the start at þyngd 1–2, behind "Vísbending"
 * for half the XP at 3–5, gone from 6. So the passive is met with its
 * structure drawn, and the relative clauses, which come at 3 and 5, with
 * the hint on offer.
 *
 * The options are the nouns of the sentence that did or suffered something,
 * in the nominative and in the order they stand, and always "Það kemur ekki
 * fram" last — which is the right answer when a passive names no gerandi. */

export const WHO_NOT_SAID = "Það kemur ekki fram";
const whoStep = (band) => (band >= 5 ? 5 : band >= 3 ? 3 : 1);
/* How much more often a question of the newest structure is asked than one
   of an earlier step. */
const WHO_NEW = 3;

const WHO_QUESTIONS = (EX.hver || []).flatMap((it) => it.f.flatMap((f) => [
  { it, f, ask: "who", key: `hver:${it.s.t}#${f.v}a` },
  ...(f.qp ? [{ it, f, ask: "whom", key: `hver:${it.s.t}#${f.v}p` }] : []),
]));

/* A noun inside an explanation: as the option names it, but small unless it
   is a name (its lemma has the capital too). */
const whoNoun = (it, j) => {
  const n = it.n.find((x) => x.j === j);
  const l = it.s.tok[j].l || "";
  return l.charAt(0) !== l.charAt(0).toLowerCase() ? n.nf : n.nf.charAt(0).toLowerCase() + n.nf.slice(1);
};

function whoWhy(it, f) {
  const s = it.s;
  const w = (j) => s.tok[j].w;
  const out = [];
  /* The relative clause this fact is in, or the one standing in the way. */
  const other = it.f.find((x) => x.rel);
  if (f.rel) {
    /* the noun the clause stands with is the word right before *sem* */
    const head = f.rel[0] - 1;
    out.push(`*${spanText(s, f.rel[0], f.rel[1])}* er **tilvísunarsetning**: hún segir meira um orðið *${w(head)}*, og *sem* vísar til þess.`);
  } else if (other) {
    /* the main clause is what is left when the relative clause is taken out */
    const rest = s.tok.filter((_, j) => j < other.rel[0] || j > other.rel[1])
      .map((t, j) => (PUNCT.has(t.w) || !j ? "" : " ") + t.w).join("");
    out.push(`*${spanText(s, other.rel[0], other.rel[1])}* er **tilvísunarsetning** um orðið *${w(other.rel[0] - 1)}*. Taktu hana út og þá stendur aðalsetningin eftir: *${rest}*`);
  }
  if (f.pas) {
    out.push(`*${w(f.aux)} ${w(f.v)}* er **þolmynd**. Í þolmynd er frumlagið ekki gerandinn heldur **þolandinn**: ${whoNoun(it, f.whom)} varð fyrir því.`);
    out.push(f.who != null
      ? `Gerandinn stendur á eftir *af*: *af ${w(f.who)}*.`
      : "Enginn gerandi er nefndur, svo setningin segir ekki hver gerði það.");
    out.push(`Í germynd: *${f.p}*`);
  } else if (f.rel) {
    out.push(`Hún segir því: *${f.p}*`);
  }
  return out.join(" ");
}

/** "Hver beit?" — who did it, or who it was done to. */
export function whoDid(lex, view, rng) {
  const P = view.policy;
  const band = bandFor(view, "setningafraedi");
  const step = whoStep(band);
  const fc = forcedCell(view);
  if (fc && !fc.startsWith("hver:")) return null;
  const avoid = view.force && view.force.avoid;
  const allowed = WHO_QUESTIONS.filter((q) => P.level(q.it.lvl) && q.it.s.t !== avoid);
  /* A review asks for the structure that was missed, at any þyngd. */
  const pool = fc ? allowed.filter((q) => "hver:" + q.it.k === fc) : allowed.filter((q) => q.it.lvl <= step);
  if (!pool.length) return null;
  const top = Math.max(...pool.map((q) => q.it.lvl));
  const q = wpick(fresh(view, (x) => x.key, pool), (x) => (x.it.lvl === top ? WHO_NEW : 1), rng);
  const { it, f } = q;
  const j = q.ask === "who" ? f.who : f.whom;
  const answer = j == null ? WHO_NOT_SAID : it.n.find((x) => x.j === j).nf;
  return built({
    type: "hver", skill: "setningafraedi", s: it.s, kind: it.k, ask: q.ask,
    verb: f.pas ? [f.aux, f.v] : [f.v],
    title: "Hver gerði hvað?",
    question: q.ask === "who" ? f.qa : f.qp,
    options: [...it.n.map((x) => x.nf), WHO_NOT_SAID], answer,
    why: whoWhy(it, f),
    base: it.lvl >= 5 ? 14 : it.lvl >= 3 ? 12 : 10,
    lvl: it.lvl, cell: "hver:" + it.k, word: null, tags: [],
  }, [FX.exSeen(q.key)]);
}

/** The builders of this category, by question type id. What each type is —
   its name, renderer, tags, bands and weight — is declared in
   core/catalogue.js; tasks/registry.js joins the two.
   @type {Record<string, import("../types").Builder>} */
export const BUILDERS = {
  syntax: { build: withHint("syntax", taskSyntax) },
  setn_hlut: { build: withHint("setn_hlut", synRole) },
  setn_flokka: { build: withHint("setn_flokka", synSort) },
  setn_lidir: { build: withHint("setn_lidir", synPhrase) },
  lid_finna: { build: withHint("lid_finna", synFindPP) },
  hver_gerdi: { build: withHint("hver_gerdi", whoDid) },
};
