/* Sentence frames: a parsed sentence with one word lifted out and another put
 * in its place.
 *
 * The bank holds ~700 sentences; the vocabulary holds ~3,800 nouns in 16 forms
 * each. A word in a given form can only be *shown* inside a sentence if some
 * sentence has a slot that takes it. The build marks every sentence's slot
 * (`slot`), the classes of noun it accepts (`need`, from noun_classes.py), the
 * gender it pins (`rk`), the preposition it stands under (`ps`) and whether an
 * adjective or pronoun sits beside it (`fixed`). This module does the swapping
 * and nothing else: the mark stays, the replacement form comes out of BÍN under
 * that same mark, so no grammatical claim is made here.
 *
 * What is never substituted:
 *   - verbs — a verb governs cases and takes objects; "Við sofum matinn"
 *   - a `fixed` slot — the adjective beside it would stop agreeing
 *   - a slot whose case the parse could not settle (`u` includes "fall")
 *   - a noun of a class the slot does not accept (`need`)
 *   - a noun of another gender than the frame pins (`rk`)
 *   - a place or event under *í* or *á* unless its recorded convention
 *     (noun `p`) is that preposition — *í búðina* but *á ströndina*
 *   - a noun nobody says in the plural (`np`) in a plural slot — "Ég sá
 *     mjólkurnar", "Hamingjurnar skipta máli"
 *   - a kin term used like a name (`na`) in a slot with the article —
 *     "Mamman sefur núna"
 *   - a word the classifier excludes from generated sentences (`nx`)
 *
 * Adjectives are substituted only where the adjective is one that suits the
 * kind of noun it would describe (`FITTING` below). The agreement was never
 * the problem — gender, number, case and strength are all inside the BÍN mark
 * — but "Þetta er svangasta hjólið" agrees perfectly and is not Icelandic
 * anyone has said.
 */

import { CLASSNAME } from "../core/marks.js";
import { pick } from "./shared.js";

const CACHE = new WeakMap();

const push = (map, key, value) => {
  const list = map.get(key);
  if (list) list.push(value); else map.set(key, [value]);
};

/** A token whose analysis is firm enough to build on. Number left open by the
    surface form alone ("brauð" is both ÞFET and ÞFFT) is tolerated: the
    replacement form is chosen to be unambiguous and the sentence is
    grammatical under the parse's reading either way. Case is not. */
export const settled = (t) =>
  !!t && !!t.m && !t.rj && (t.u || []).every((f) => f === "tala");

/** May other nouns stand in this sentence's slot at all? */
export const substitutable = (s) =>
  !!s && s.slot != null && !s.fixed && Array.isArray(s.need) && s.need.length > 0
  && settled(s.tok[s.slot]);

/** May this noun stand in this frame, in this mark? */
export function acceptsNoun(frame, word, mark) {
  if (!word || word.nx) return false;
  if (!word.forms || !word.forms[mark]) return false;
  if (frame.rk && frame.rk !== word.c) return false;
  if (!frame.need.includes(word.s)) return false;
  if (frame.ps && word.p !== frame.ps) return false;
  if (!showable(word, mark)) return false;
  return true;
}

/** May this noun be SHOWN in this mark at all — in a generated sentence, a
    table or a bare form? A mass noun has no plural anyone says, and *mamma*
    takes no article when a child means its own. */
export function showable(word, mark) {
  if (!word) return false;
  const m = String(mark || "");
  if ((word.np || word.s === "substance") && /FT/.test(m)) return false;
  if (word.na && /gr$/.test(m)) return false;
  return true;
}

/* ---------- adjectives that suit a kind of noun ---------------------------
 *
 * Deliberately small. Every adjective here can be said of every noun of the
 * classes it is listed under without anyone blinking: *nýr bíll*, *gamalt
 * hús*, *skemmtileg ferð*. A class that is not listed (abstract, weather,
 * body, substance, money) gets no added adjective at all, and an adjective
 * that is not listed is shown as a bare form rather than put into a sentence.
 */
const FIT_SETS = {
  being: ["góður", "ungur", "gamall", "lítill", "stór", "skemmtilegur"],
  made: ["nýr", "gamall", "stór", "lítill", "fallegur"],
  place: ["nýr", "gamall", "stór", "lítill", "fallegur"],
  food: ["góður"],
  grown: ["stór", "lítill", "fallegur"],
  told: ["skemmtilegur", "góður", "langur", "stuttur", "nýr"],
  time: ["langur", "stuttur", "góður"],
};
const FIT_OF_CLASS = {
  person: "being", job: "being", animal: "being", group: "being",
  object: "made", clothing: "made", furniture: "made", vehicle: "made", book: "made",
  building: "place", room: "place", struct: "place", settlement: "place", place: "place",
  food: "food", drink: "food",
  plant: "grown", nature: "grown", critter: "grown",
  event: "told", film: "told", music: "told", text: "told",
  time: "time",
};

/* Adjectives whose place in their sentence no other adjective can take. */
const BOUND_ADJECTIVES = new Set(["næstur", "síðastur", "fyrstur", "sami"]);

/** The adjectives that may be added to, or shown with, a noun of this class. */
export const fittingAdjectives = (cls) => FIT_SETS[FIT_OF_CLASS[cls]] || [];

/** The noun an adjective token describes, as a lexicon entry: the noun right
    after it, or for a predicative the subject of its clause. Null when the
    sentence does not make it plain. */
export function nounDescribedBy(lex, s, i) {
  const t = s.tok[i];
  const entry = (x) => (x && x.c === "nafnorð" && !x.rj ? lex.entryForToken(x) : null);
  const next = s.tok[i + 1];
  if (next && next.c === "nafnorð") return entry(next);
  if (t.r === "sagnfylling") {
    const subj = s.tok.filter((x) => x.r === "frumlag" && x.c === "nafnorð" && x.k === t.k);
    if (subj.length === 1) return entry(subj[0]);
  }
  return null;
}

/* A compound repeats the word it is made of: "Ferðin féll niður vegna
   gönguferðarinnar", "Krakkarnir fóru í ferðina án ferðamannanna". Only
   stems of four letters or more, so *ár* is not found in *árbók*. */
const sharesStem = (a, b) => {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 4 && long.includes(short);
};

/** Is this noun already in the sentence, somewhere other than the slot — as
    itself or inside a compound? "Gatan liggur milli kirkju og kirkju",
    "Hundurinn fylgir hundinum", "Ferðin féll niður vegna ferðalagsins". */
export const repeatsNoun = (s, slot, word) =>
  s.tok.some((t, j) => j !== slot && t.c === "nafnorð" && t.l
    && (t.l === word.o || sharesStem(t.l, word.o)));

/** Every noun that may stand in this sentence's slot. */
export function candidateNouns(lex, s) {
  if (!substitutable(s)) return [];
  const f = { rk: s.rk || null, need: s.need, ps: s.ps || null };
  const m = s.tok[s.slot].m;
  return lex.nouns.filter((w) => !repeatsNoun(s, s.slot, w) && acceptsNoun(f, w, m));
}

export function frameIndex(lex) {
  const hit = CACHE.get(lex);
  if (hit) return hit;

  const noun = new Map();      // BÍN mark -> frames whose slot carries it
  const adj = new Map();       // BÍN mark -> frames whose adjective carries it

  for (const s of lex.sentences || []) {
    if (substitutable(s)) {
      const t = s.tok[s.slot];
      if (t.c === "nafnorð") {
        push(noun, t.m, { s, i: s.slot, rk: s.rk || null, need: s.need,
                          ps: s.ps || null, lvl: s.lvl });
      }
    }
    s.tok.forEach((t, i) => {
      if (t.c !== "lýsingarorð" || !settled(t) || (t.u || []).length) return;
      /* Only an adjective standing right before its noun. A predicative is
         tied to the rest of its sentence — "verður alltaf hræddur þegar það
         eru flugeldar" does not take *ungur* — and an attributive is not. */
      const after = s.tok[i + 1];
      if (!after || after.c !== "nafnorð") return;
      const noun = nounDescribedBy(lex, s, i);
      /* Not beside a mass noun ("stórt grasið"), and not where the adjective
         is one of the few that stand weak before a noun with no article —
         *í næsta húsi* does not become "í stærsta húsi". */
      if (!noun || noun.np || BOUND_ADJECTIVES.has(t.l)) return;
      const fits = noun ? fittingAdjectives(noun.s) : [];
      if (fits.length) push(adj, t.m, { s, i, lvl: s.lvl, fits });
    });
  }

  const idx = { noun, adj, counts: { noun: sum(noun), adj: sum(adj) } };
  CACHE.set(lex, idx);
  return idx;
}

const sum = (m) => [...m.values()].reduce((a, l) => a + l.length, 0);

/* ---------- substitution ------------------------------------------------- */

/* A capital at the start of a sentence belongs to the position, not the word. */
function matchCapital(original, replacement) {
  const c = String(original || "").charAt(0);
  if (!c || c !== c.toUpperCase() || c === c.toLowerCase()) return replacement;
  return replacement.charAt(0).toUpperCase() + replacement.slice(1);
}

/** The sentence as one string. Same joining rule as `sentenceHTML` in ui. */
export const sentenceText = (tok) =>
  tok.map((t, j) => ([".", "?", "!", ","].includes(t.w) ? t.w : (j ? " " : "") + t.w))
    .join("");

/**
 * The frame with `word` standing in its slot, in the form `form`. The result
 * has the shape of a bank sentence, marked `derived` so nothing feeds it back
 * into the cloze. `u` is dropped: it described the word that used to stand
 * here, and the caller chose a replacement form with a single analysis.
 */
export function fillFrame(frame, word, form) {
  const tok = frame.s.tok.map((t, j) => {
    if (j !== frame.i) return t;
    const { u, ...rest } = t;
    return { ...rest, w: matchCapital(t.w, form), l: word.o, x: word.c,
             c: CLASSNAME[word.c] || t.c };
  });
  return { ...frame.s, tok, t: sentenceText(tok), derived: true, slot: null, fixed: true };
}

/* ---------- choosing a frame --------------------------------------------- */


/**
 * A sentence showing this noun in exactly this mark, or null.
 * `levelOk` is the curriculum policy and is never relaxed; `maxLvl` is where
 * the child has got to and may be exceeded by a step when nothing else fits.
 * `rng` is the random source the frame is drawn with; it has no default, so
 * that no caller falls back on the global generator without meaning to.
 */
export function nounSentence(lex, word, mark, form,
  { maxLvl = 7, levelOk = () => true, rng } = {}) {
  const all = frameIndex(lex).noun.get(mark);
  if (!all || !all.length) return null;
  const legal = all.filter((f) => levelOk(f.lvl) && acceptsNoun(f, word, mark)
    && !repeatsNoun(f.s, f.i, word));
  if (!legal.length) return null;
  const within = legal.filter((f) => f.lvl <= maxLvl);
  const frame = pick(within.length ? within : legal, rng);
  return { s: fillFrame(frame, word, form), i: frame.i, lvl: frame.lvl };
}

/** A sentence showing this adjective in exactly this mark, or null. The noun
    it agrees with stays; only the adjective changes. */
export function adjectiveSentence(lex, word, mark, form,
  { maxLvl = 7, levelOk = () => true, rng } = {}) {
  const all = frameIndex(lex).adj.get(mark);
  if (!all || !all.length) return null;
  const legal = all.filter((f) => levelOk(f.lvl) && f.fits.includes(word.o));
  if (!legal.length) return null;
  const within = legal.filter((f) => f.lvl <= maxLvl);
  const frame = pick(within.length ? within : legal, rng);
  return { s: fillFrame(frame, word, form), i: frame.i, lvl: frame.lvl };
}

/**
 * How much of the vocabulary can be shown inside a sentence: per class, the
 * share of (word, mark) cells some frame accepts. Used by tools/coverage.mjs
 * and by the tests, so the figure is measured rather than estimated.
 */
export function frameCoverage(lex) {
  const idx = frameIndex(lex);
  const out = { noun: { have: 0, want: 0, byClass: {} }, adj: { have: 0, want: 0 } };
  for (const w of lex.nouns) {
    if (w.nx) continue;
    const c = (out.noun.byClass[w.s] ||= { have: 0, want: 0 });
    for (const m of Object.keys(w.forms)) {
      if (!showable(w, m)) continue;          // a cell nobody is shown
      out.noun.want += 1; c.want += 1;
      const list = idx.noun.get(m);
      if (list && list.some((f) => acceptsNoun(f, w, m))) { out.noun.have += 1; c.have += 1; }
    }
  }
  for (const w of lex.adjectives) {
    for (const m of Object.keys(w.forms)) {
      out.adj.want += 1;
      const list = idx.adj.get(m);
      if (list && list.some((f) => f.fits.includes(w.o))) out.adj.have += 1;
    }
  }
  return out;
}
