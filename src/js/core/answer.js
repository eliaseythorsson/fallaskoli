/* Judging an answer — every question type, in one place, without a screen.
 *
 * Until v6.13 each of the seventeen submit handlers in ui/render.js and
 * ui/render-more.js graded its own answer, worked out its own XP and wrote
 * its own records. Nothing could say whether an answer was right without a
 * DOM, so a duel had to believe the score the browser sent, and a simulation
 * had to copy the handlers. This module is the joint between asking and
 * drawing:
 *
 *   judge(task, response, pupil)   decides. PURE: it reads its three
 *                                  arguments and changes none of them.
 *   settle(S, sess, task, j, …)    writes what `judge` decided into the
 *                                  pupil's state. No DOM either, so a
 *                                  simulation can play whole sessions.
 *
 * A renderer now only collects the response, calls `judge`, hands the result
 * to the one shared path (`conclude` in ui/render.js → `settle` here →
 * `app.finish`) and draws it.
 *
 * The grading rules themselves are NOT here and are not copied here: a
 * written form is graded by core/grading.js (`gradeForm`), what is forgiven
 * is decided by core/leniency.js (`verdictOf`), and what went wrong by
 * core/diagnosis.js (`diagnose`). This module knows which of them a question
 * type uses, and what the answer is worth. The graders of the three
 * production questions (`gradeHunt`, `gradeWorkshop`, `gradeTransform`) are
 * in section 3 below: they sat in tasks/production.js beside their builders
 * until the builders moved to tasks/malbeiting.js, and core/ may not depend
 * on tasks/ — a server grading a duel loads this file, not the builders.
 *
 * ---- the response, per type -------------------------------------------
 *
 *   fill, verb, verbslot, gap   { text, hinted? }
 *   umritun                     { text, hinted? }
 *   smidja, meaning             { text }
 *   table                       { cells: [text, …] }   one per ASKED cell, in
 *                               the order of `askedCells(task)` — or an
 *                               object keyed by BÍN mark
 *   parse                       { picks: { fl, kyn, tala, … } } — the class
 *                               (`fl`) first and alone; see JUDGES.parse
 *   sort                        { picks: { 0: bucket, 1: bucket, … } }
 *   syntax                      { picked: tokenIndex }
 *   govern, indecl, clause,
 *   choice                      { picked: value }
 *   kenni                       { picked: "sterk" | "veik", text? } — the
 *                               genitive singular when the task `askGen`
 *   slots                       { texts: [text, …], picked? } — one text per
 *                               box of `task.slots`; `picked` when the task
 *                               has `options`
 *   tap                         { sel: [tokenIndex, …] }
 *   villur                      { edits: { "line:token": text } }
 *
 * ---- the result ----------------------------------------------------------
 *
 *   ok        true | false | null. null: the question has no right answer
 *             (meaning), the word is not judged (syntax, `rn`), or the
 *             answer is not finished (`pending`).
 *   verdict   right | near | wrong | unjudged | open — or, with `pending`,
 *             empty | incomplete | hedged. `near` is an answer accepted with
 *             a deduction (a missing acute accent).
 *   findings  the error patterns, from core/diagnosis.js
 *   xp        everything the answer earns, a table's bonus included
 *
 * The critique asked for those four. The code needs five more, and why:
 *
 *   pending   true when there is nothing to settle yet: an empty box, a row
 *             without a pick, several forms written in the hope that one is
 *             right. The renderer says so and waits; nothing is recorded.
 *   effects   what `settle` is to write, in order. An answer is not always
 *             one record: a table records every cell and is tallied once, a
 *             hunt records every error, a rewrite every mark it tested. The
 *             list is data (no functions), so it can cross a network.
 *   finish    what `app.finish` is told about the question as a whole:
 *             `correct` and the flags the badges read (`hardWin`,
 *             `perfectTable`, the answer's shape …). Exactly the keys the
 *             old handlers passed, and no others — the badge context is
 *             built by spreading them.
 *   detail    what the renderer needs to DRAW the verdict and would
 *             otherwise have to grade again to find out: the `gradeForm`
 *             result, the leniency verdict, per-cell and per-card results.
 *   resp      the answer in the shape `diagnose` reads. `findings` is made
 *             from it; it is kept so a caller can see why.
 *
 * ---- XP needs a pupil ----------------------------------------------------
 *
 * Right and wrong depend on the task and the response alone. XP does not: it
 * is scaled by how easy this cell, word and skill already are for this
 * child, by the run of right answers and by the day streak. `pupil` is
 * `{ S, sess }`, read and never written. Without it (`judge(task, response)`,
 * as a server grading a duel will call it) `ok`, `verdict` and `findings`
 * are the same and `xp` is what a pupil with no history would earn.
 */

import { ALL_CLASSES, CASES, MOODS } from "./marks.js";
import { gradeForm, normalise, stripAccents, judge as judgeText } from "./grading.js";
import { verdictOf, SLIP_XP, RETRY_XP } from "./leniency.js";
import { diagnose } from "./diagnosis.js";
import { computeXp, dayMult, easeOf } from "./progress.js";
import { record, tallyAnswer, dayRec, dayStreak, todayKey, answerShape, wordKey } from "./state.js";
import { bumpDiff, bandOf } from "./difficulty.js";
import { noteTypeAnswer } from "./mastery.js";
import { noteReview } from "./review.js";

/* ========================================================================
 * 1. What the pupil's history says — read-only
 * ====================================================================== */

/**
 * The parts of the pupil's state that XP depends on, and a way to ask "what
 * would the ease be after the records decided so far?" without writing them.
 *
 * A table is why the second half exists. Its cells were recorded one at a
 * time, and each record moved the word's and the skill's tallies, so the
 * fifth cell was worth a little less than the first. `note` keeps those
 * tallies beside the state instead of in it.
 */
function historyOf(pupil) {
  const S = pupil && pupil.S;
  const delta = { cells: {}, words: {}, skills: {} };
  const bucket = (kind, key) => {
    if (!key) return null;
    const base = (S && S[kind] && S[kind][key]) || null;
    const d = delta[kind][key];
    /* `easeFor` skips a bucket that does not exist; one with no answers in
       it weighs nothing (`mastery`: conf 0), so the two are the same. */
    if (!base && !d) return null;
    return { c: ((base && base.c) || 0) + (d ? d.c : 0), w: ((base && base.w) || 0) + (d ? d.w : 0) };
  };
  return {
    run: S ? S.run : 0,
    streak: S ? dayStreak(S) : 0,
    /** The day streak as it will stand once this answer has been tallied:
        the tenth answer of the day reaches the goal, and a perfect table's
        bonus was always multiplied by the streak AFTER its own tally. */
    streakAfterTally() {
      if (!S) return 0;
      const key = todayKey();
      const day = S.days[key] || {};
      return dayStreak({ ...S, days: { ...S.days, [key]: { ...day, a: (day.a || 0) + 1 } } });
    },
    ease({ cell, word, skill }) {
      return easeOf([bucket("cells", cell), bucket("words", word), bucket("skills", skill)]
        .filter(Boolean));
    },
    /** One counted record, as `record()` will tally it. */
    note({ cell, word, skill, ok }) {
      [["cells", cell], ["words", word], ["skills", skill]].forEach(([kind, key]) => {
        if (!key) return;
        const d = (delta[kind][key] ||= { c: 0, w: 0 });
        ok ? d.c++ : d.w++;
      });
    },
    seen: (list) => (pupil && pupil.sess && pupil.sess[list]) || [],
  };
}

/** XP for one answer, with the ease discount applied.
 *
 * `factor` is what a forgiven slip leaves behind — 0.95 for a missing accent
 * (core/leniency.js). It is applied last, to the finished figure, so the
 * child loses a share of what they would have earned rather than a share of
 * the base: the deduction is the same 5% whatever multipliers the run and
 * the day streak are adding. A slip never takes the award below 1 XP — that
 * would read as "wrong" on the screen, and it is not. */
function xpFor(hist, task, { ok, hinted = false, base = task.base, lvl = task.lvl, factor = 1 }) {
  if (!ok) return 0;
  const ease = hist.ease({ cell: task.cell, word: task.word, skill: task.skill });
  const full = computeXp({ base, lvl: lvl || 1, hinted, ease, run: hist.run, streak: hist.streak });
  if (factor >= 1) return full;
  return Math.max(full > 0 ? 1 : 0, Math.round(full * factor));
}

/* ========================================================================
 * 2. Rules that belong to one question type
 * ====================================================================== */

/* ---- Greining: which rows a word is asked about ------------------------
 *
 * `term` is the glossary entry a row label points at, so every row explains
 * itself. The feature BÍN calls `stig` is labelled "Stigbreyting": "stig" is
 * the child's level in the program and must not mean two things. The labels
 * and options sit here, beside the answers, because the test that every
 * askable row's answer is among its own options reads them together. */
const PARSE_ROWS = [
  { key: "fl", label: "Orðflokkur", term: "ordflokkur", opts: () => ALL_CLASSES },
  { key: "kyn", label: "Kyn", term: "kyn",
    opts: () => [{ v: "kk", label: "karlkyn" }, { v: "kvk", label: "kvenkyn" },
                 { v: "hk", label: "hvorugkyn" }] },
  { key: "tala", label: "Tala", term: "tala", opts: () => ["eintala", "fleirtala"] },
  { key: "fall", label: "Fall", term: "fall",
    opts: () => CASES.map((c) => ({ v: c.k, label: c.name })) },
  { key: "greinir", label: "Greinir", term: "greinir", opts: () => ["án greinis", "með greini"],
    read: (a) => (a.greinir ? "með greini" : "án greinis"),
    only: (a, t) => t.c === "nafnorð" },
  { key: "stig", label: "Stigbreyting", term: "stigbreyting",
    opts: () => ["frumstig", "miðstig", "efsta stig"] },
  { key: "beyging", label: "Beyging", term: "beyging",
    opts: () => [{ v: "sterk", label: "sterk beyging" }, { v: "veik", label: "veik beyging" }] },
  { key: "mynd", label: "Mynd", term: "mynd", opts: () => ["germynd", "miðmynd"] },
  /* Every mood `readMark` can report, from the marks table itself — so a mood
     in the data cannot be missing from the buttons (`tests/tasks.test.js`
     checks that every askable row's answer is among its own options). */
  { key: "háttur", label: "Háttur", term: "hattur", opts: () => MOODS },
  { key: "tíð", label: "Tíð", term: "tid", opts: () => ["nútíð", "þátíð"] },
  { key: "persóna", label: "Persóna", term: "persona",
    opts: () => ["1. persóna", "2. persóna", "3. persóna"] },
];

/* A feature the surface form does not settle, and nothing in the sentence
   settles either, is recorded in `t.u` by the build and never asked about:
   *fyrir okkur* is both accusative and dative. */
export function parseRows(a, t) {
  const unsure = new Set(t.u || []);
  if (unsure.has("stig")) unsure.add("beyging");
  const rows = [{ ...PARSE_ROWS[0], answer: t.c }];
  PARSE_ROWS.slice(1).forEach((r) => {
    if (unsure.has(r.key)) return;
    if (r.only) { if (r.only(a, t)) rows.push({ ...r, answer: r.read(a) }); return; }
    if (a[r.key] != null) rows.push({ ...r, answer: a[r.key] });
  });
  return rows;
}

/**
 * Is a click on token `picked` right for `role`?
 *
 *   right     the word carries the role, or the role is one it may also be
 *             given (`ra`: the infinitive in "ætla að lesa" as predicate)
 *   unjudged  a nominal whose role the build withdrew because it could not be
 *             verified (`rn`) — never when the role asked for is the predicate
 *   wrong     everything else
 *
 * `good` is what is shown as the answer: only the words that carry the role.
 */
export function judgeSyntax(s, role, picked) {
  const good = s.tok.map((tok, j) => (tok.r === role ? j : -1)).filter((j) => j >= 0);
  const tok = s.tok[picked];
  let kind = "wrong";
  if (good.includes(picked) || (tok && (tok.ra || []).includes(role))) kind = "right";
  else if (tok && tok.rn && role !== "umsögn") kind = "unjudged";
  return { kind, good };
}

/** The cells of a table that are asked for. v6.10: when a sample nominative
    is shown above an adjective table, the first cell is given, not asked. */
export const askedCells = (task) =>
  (task.cells || []).filter((_, k) => !(task.sample && k === 0));

/** A verdict for a gap without a BÍN mark (word formation): right, an
    accent forgiven, or wrong. */
function plainVerdict(g) {
  if (g.verdict === "correct") return { ok: true, factor: 1, klass: "ok", slip: null, near: null };
  if (g.verdict === "accents") return { ok: true, factor: SLIP_XP.accents, klass: "near", near: null,
    slip: { id: "accents", head: "Rétt — en gáðu að broddunum", note: "Svarið er rétt en það vantar brodd (eða einum er ofaukið)." } };
  return { ok: false, factor: 0, klass: "no", slip: null, near: null };
}

/* ---- Orðaforði: the bonus sentence -------------------------------------
 *
 * v6.11: after a graded Orðaforði question the child MAY write a sentence
 * with the word; XP only if the word is in it (any of its BÍN forms), the
 * sentence has three words or more, is not one already written this visit
 * and is not the dictionary's own example. Nothing is graded right or
 * wrong, and skipping costs nothing. */

export const BONUS_XP = 6;

/** Does this sentence earn the bonus? `seen`: texts already used. */
export function bonusVerdict(text, entry, seen = []) {
  const key = normalise(text);
  const words = key.split(" ").filter(Boolean);
  if (words.length < 3) return { ok: false, why: "Skrifaðu heila setningu — að minnsta kosti þrjú orð." };
  if (seen.includes(key)) return { ok: false, why: "Þessa setningu ertu búin(n) að skrifa — prófaðu nýja." };
  if (entry.x && normalise(entry.x) === key) return { ok: false, why: "Þetta er dæmið úr orðabókinni — búðu til þína eigin setningu." };
  const forms = new Set(Object.values(entry.forms || {}).flat().map(normalise).filter((f) => f && !f.includes(" ")));
  forms.add(normalise(entry.o));
  if (!words.some((w) => forms.has(w)))
    return { ok: false, why: `Orðið *${entry.o}* (í einhverri mynd) þarf að vera í setningunni.` };
  return { ok: true };
}

/* ========================================================================
 * 3. Grading the three production questions (v6.9): Villuveiðar,
 *    Setningasmiðja and Umritun. Moved here unchanged from
 *    tasks/production.js; their builders are in tasks/malbeiting.js.
 * ====================================================================== */

/** Grade a built sentence card by card. Order is not graded: the cards come
    in the order of the sentence, and what is asked is the inflection. */
export function gradeWorkshop(cards, input) {
  const got = normalise(input).split(" ").filter(Boolean);
  const pool = got.slice();
  const per = cards.map((c) => {
    /* A multi-word card (*fyrir utan*, *í gær*) is matched as a run. */
    for (const f of c.answers) {
      const parts = normalise(f).split(" ");
      const at = indexOfRun(pool, parts);
      if (at >= 0) { pool.splice(at, parts.length); return { ok: true, form: f }; }
    }
    return { ok: false, form: c.answers[0] };
  });
  /* Second pass, for the cards still unmatched (v6.10). A leftover word that
     is the right form but for an acute accent is a slip (as in the fill-in
     question); one that is another form of the card's own word was inflected
     wrongly — it is not a word that "did not belong". Only what is left after
     this is reported as extra. */
  per.forEach((p, k) => {
    if (p.ok) return;
    const c = cards[k];
    const single = c.answers.filter((f) => !normalise(f).includes(" "));
    const at = pool.findIndex((w) => single.some((f) => stripAccents(f) === stripAccents(w)));
    if (at >= 0) {
      const typed = pool.splice(at, 1)[0];
      per[k] = { ok: true, slip: true, typed, form: single.find((f) => stripAccents(f) === stripAccents(typed)) };
      return;
    }
    const forms = new Set([c.text, ...Object.values((c.e && c.e.forms) || {}).flat()]
      .filter(Boolean).map(normalise));
    const bad = pool.findIndex((w) => forms.has(w) || [...forms].some((f) => stripAccents(f) === stripAccents(w)));
    if (bad >= 0) per[k] = { ok: false, form: c.answers[0], typed: pool.splice(bad, 1)[0], misformed: true };
  });
  const expected = cards.flatMap((c) => normalise(c.answers[0]).split(" "));
  const allOk = per.every((p) => p.ok) && pool.length === 0;
  const inOrder = allOk && got.length === expected.length &&
    cards.every((c, k) => true) && sameOrder(cards, got);
  return { per, extra: pool, ok: allOk, inOrder };
}

function indexOfRun(list, run) {
  outer: for (let i = 0; i + run.length <= list.length; i++) {
    for (let k = 0; k < run.length; k++) if (list[i + k] !== run[k]) continue outer;
    return i;
  }
  return -1;
}
function sameOrder(cards, got) {
  let at = 0;
  for (const c of cards) {
    const hit = c.answers.map((f) => normalise(f).split(" "))
      .find((parts) => parts.every((p, k) => got[at + k] === p));
    if (!hit) return false;
    at += hit.length;
  }
  return at === got.length;
}

/**
 * Grade a hunt. `edits` maps "line:token" to what the child typed there.
 * A word left as it was is not an edit; a correct word changed to another
 * correct form of itself is not a false alarm. An agreement error mended at
 * its other end (`err.alt`) is fixed, and the word changed there is not a
 * false alarm (`viaAlt` lists the errors mended that way).
 */
export function gradeHunt(task, edits) {
  const res = { fixed: [], missed: [], wrongFix: [], falseAlarm: [], slips: [], viaAlt: [] };
  const altUsed = new Set();
  task.lines.forEach((ln, li) => ln.toks.forEach((tk, ti) => {
    const a = tk.err && tk.err.alt;
    if (!a) return;
    const own = edits[`${li}:${ti}`];
    const ownChanged = own != null && normalise(own) !== normalise(tk.w);
    const there = edits[a.key];
    if (!ownChanged && there != null && a.answers.some((f) => normalise(f) === normalise(there))) {
      altUsed.add(a.key);
      res.viaAlt.push(`${li}:${ti}`);
    }
  }));
  task.lines.forEach((ln, li) => ln.toks.forEach((tk, ti) => {
    if (tk.punct) return;
    const key = `${li}:${ti}`;
    const typed = edits[key];
    const changed = typed != null && normalise(typed) !== normalise(tk.w);
    if (tk.err) {
      if (res.viaAlt.includes(key)) res.fixed.push(key);
      else if (!changed) res.missed.push(key);
      else if (tk.err.answers.some((f) => normalise(f) === normalise(typed))) res.fixed.push(key);
      /* A missing acute accent is a slip, as everywhere else — unless the
         accent is what told the right form from the wrong one. */
      else if (stripAccents(typed) !== stripAccents(tk.w) &&
               tk.err.answers.some((f) => stripAccents(f) === stripAccents(typed))) {
        res.fixed.push(key); res.slips.push(key);
      }
      else res.wrongFix.push(key);
    } else if (altUsed.has(key)) {
      /* the other end of an agreement error, mended — not an alarm */
    } else if (changed && normalise(typed) !== normalise(tk.right)) {
      res.falseAlarm.push(key);
    }
  }));
  res.ok = res.fixed.length === task.errors && !res.falseAlarm.length;
  return res;
}

/**
 * Grade a rewrite. A missing acute accent is forgiven as a slip — unless
 * the accent is the whole difference between the rewrite and the sentence as
 * it stood: *Við bíðum* → *Við biðum* is the past tense, and a child who
 * copied *bíðum* back has changed nothing.
 */
export function gradeTransform(input, task) {
  const v = judgeText(input, task.answers);
  if (v === "empty") return "empty";
  /* What the pupil was shown: the bank sentence, or — for the kinds that
     show something else (a passive, two sentences, a quotation) — `from`.
     For *active* and *join* the bank sentence IS the answer. */
  const orig = task.from || (task.s && task.s.t);
  if (orig && normalise(input) === normalise(orig)) return "wrong";
  if (v === "accents" && orig && stripAccents(input) === stripAccents(orig)) return "wrong";
  if (v === "wrong") return (SHORT_OK.has(task.kind || "past") && tailLeftOut(input, task)) || "wrong";
  return v === "accents" ? "slip" : v;
}

/* The kinds where an unchanged end may be left out (`tailLeftOut`). Not the
   kinds of v6.13: a join without its second half, a question without its
   object, an indirect speech without the rest of what was said are not
   finished — and for *active* and *join* the bank sentence is the answer,
   so "the end as it stood" would be any end at all. */
const SHORT_OK = new Set(["past", "plural", "passive", "igaer", "amorgun", "opener"]);

/* The kinds of v6.13 (critique item 29), and how each is graded. The
   builder (tasks/malbeiting.js) lists every right answer in `answers`, read
   out of the bank and BÍN — every form of a cell BÍN gives, the optional
   *að* of indirect speech, the second subject a join with *og*, *en* or
   *eða* may leave out; `normalise` takes care of capitals, commas and the
   end mark. What the grader adds is the WHY of a wrong answer: each task
   carries `checks`, the mistakes its kind invites, and the first one that
   fits the answer is the note shown under it.

     active    *var bökuð* left in; *af* left in; the old subject not put
               into the accusative
     question  the subject still first; *hvort*; the subject not straight
               after the verb
     join      the subject before the verb after a clause that opens the
               sentence (*Þegar ég kom heim maturinn var …*); the verb
               before the subject after a subordinating conjunction; the
               halves in the wrong order
     indirect  the indicative kept (*er*); the wrong tense of the
               subjunctive after *sagði* or *segir*; *ég* kept

   A check is { note, and any of: starts / notStarts (a run of words the
   answer does / does not begin with), has (a run of words somewhere in
   it), hasAny (any one of these words), lacks (none of these words) }; it
   fits when every condition it names holds. */
const words_ = (list) => [].concat(list || []).flatMap((w) => normalise(w).split(" ")).filter(Boolean);
const startsWith = (got, run) => run.length > 0 && run.every((w, k) => got[k] === w);

/** The note for a wrong rewrite, from the checks its builder attached; null
    if none fits. */
export function transformNote(input, task) {
  const got = normalise(input).split(" ").filter(Boolean);
  for (const c of task.checks || []) {
    if (c.starts && !startsWith(got, words_(c.starts))) continue;
    if (c.notStarts && startsWith(got, words_(c.notStarts))) continue;
    if (c.has && indexOfRun(got, words_(c.has)) < 0) continue;
    if (c.hasAny && !words_(c.hasAny).some((w) => got.includes(w))) continue;
    if (c.lacks && words_(c.lacks).some((w) => got.includes(w))) continue;
    return c.note;
  }
  return null;
}

/**
 * What to say under a graded rewrite, beyond right or wrong: for a wrong
 * one, the note of `transformNote`; for a right one, what was right but
 * could be better — a question without its question mark, indirect speech
 * without *að*. null when there is nothing to add.
 */
export function transformFeedback(input, task, grade) {
  const ok = ["correct", "slip", "short", "shortslip"].includes(grade);
  if (!ok) return grade === "empty" ? null : transformNote(input, task);
  const text = String(input || "").trim();
  if (task.endMark && !text.endsWith(task.endMark))
    return "Rétt — en spurning endar á spurningarmerki (?).";
  /* The frame is two words (*Hann sagði*), so *að* is the third — an *að*
     further on (*… að leita að lykli*) is not the one asked about. */
  if (task.kind === "indirect" && normalise(text).split(" ")[2] !== "að")
    return "Rétt — *að* má sleppa, en í rituðu máli er það oftast haft með.";
  return null;
}

/**
 * *Á morgun gef ég gamla manninum* for *Á morgun gef ég gamla manninum
 * bókina mína*: the rewrite stops where the sentence stops changing. Every
 * word that had to change is there and right, and what is left out would
 * have been copied as it stood — that is not a mistake (v6.12). "short" if
 * so (a missing accent in what was written: "shortslip"), otherwise null.
 */
export function tailLeftOut(input, task) {
  const orig = task.s && task.s.t ? normalise(task.s.t).split(" ") : null;
  const got = normalise(input).split(" ").filter(Boolean);
  if (!orig || got.length < 2) return null;
  let found = null;
  for (const a of task.answers || []) {
    const ans = normalise(a).split(" ");
    if (got.length >= ans.length) continue;
    /* How much of the end of the answer is the end of the sentence as it
       stood, word for word. */
    let same = 0;
    while (same < ans.length && same < orig.length &&
           ans[ans.length - 1 - same] === orig[orig.length - 1 - same]) same++;
    if (got.length < ans.length - same) continue;            // a changed word is missing
    if (got.every((w, k) => w === ans[k])) return "short";
    if (got.every((w, k) => stripAccents(w) === stripAccents(ans[k]))) found = "shortslip";
  }
  return found;
}

/* ========================================================================
 * 4. The result
 * ====================================================================== */

const VERDICT = (ok, near = false) => (ok ? (near ? "near" : "right") : "wrong");

/** Not an answer yet: nothing is recorded, the renderer asks again. */
const pending = (verdict, detail = {}) => ({
  ok: null, verdict, pending: true, findings: [], xp: 0, effects: [],
  finish: null, detail, resp: null,
});

/** An answer. `resp` is what `diagnose` reads; `finish` the question-level
    flags for `app.finish`, `correct` first. */
function result(task, { ok, verdict, effects, resp = null, finish = {}, detail = {} }) {
  const xp = effects.reduce((n, e) =>
    n + (e.do === "record" || e.do === "grant" ? e.xp || 0 : 0), 0);
  return {
    ok, verdict, pending: false,
    findings: diagnose(task, resp),
    xp, effects,
    finish: { correct: ok, ...finish },
    detail, resp,
  };
}

/* The effects. Each is one thing `settle` does, in the order listed. */
const rec = (spec) => ({ do: "record", ...spec });
const bump = (skill, ok) => ({ do: "bump", skill, ok });
const tally = (skill, ok) => ({ do: "tally", skill, ok });
const count = (counter) => ({ do: "count", counter });

/* ========================================================================
 * 5. One judge per question type
 * ====================================================================== */

const JUDGES = {};

/* ---- a written form: fill, verb, verbslot, gap --------------------------
 *
 * One decision, in one place: is this correct, is something forgiven, and
 * what does the forgiving cost? See core/leniency.js. */
function writtenForm(task, response, hist, { flags, conj = false, gap = false }) {
  const text = String(response.text ?? "");
  const g = gradeForm(text, { accepted: task.answers, paradigm: task.paradigm });
  if (g.verdict === "empty") return pending("empty", { g });
  /* Several forms of the word, in the hope that one is right: the child is
     asked to commit to one. Not wrong, and not recorded. */
  if (g.verdict === "hedged") return pending("hedged", { g });

  const v = gap && !task.m ? plainVerdict(g) : verdictOf(g, task.m);
  const ok = v.ok;
  const hinted = !!response.hinted;
  const xpFull = xpFor(hist, task, { ok, hinted });
  const xp = xpFor(hist, task, { ok, hinted, factor: v.factor });
  const shape = answerShape(text);

  const item = { m: task.m, typed: text, g, accepted: task.answers };
  if (conj) item.conj = task.conj;
  let resp = { kind: "form", items: [item] };
  let plain = false;
  if (gap) {
    /* Tvær buxur for tvennar buxur: the one mistake this question is about. */
    plain = !ok && !!task.plain && task.plain.some((f) => normalise(f) === normalise(text));
    const also = ok ? [] : [...(task.missOther || []), ...(plain ? ["fleirtoluord"] : [])];
    const ex = { said: text.trim(), right: task.answers[0] };
    resp = task.m ? { ...resp, also, ex } : { kind: "patterns", ids: also, ex };
  }

  return result(task, {
    ok, verdict: VERDICT(ok, !!v.slip),
    effects: [
      rec({ skill: task.skill, cell: task.cell, word: task.word, ok, xp, hinted,
            answer: shape, timed: true }),
      bump(task.skill, ok),
    ],
    resp,
    finish: { ...flags({ ok, g }), answer: ok ? shape : null, slip: ok && !!v.slip },
    detail: { g, v, xpFull, shape, plain },
  });
}

JUDGES.fill = (t, r, h) => writtenForm(t, r, h, {
  flags: ({ ok, g }) => ({ hardWin: ok && t.lvl >= 5, usedHelpers: ok && g.helpers.length > 0 }) });
JUDGES.verb = (t, r, h) => writtenForm(t, { ...r, hinted: false }, h, {
  conj: true, flags: () => ({}) });
JUDGES.verbslot = (t, r, h) => writtenForm(t, r, h, {
  conj: true, flags: ({ ok }) => ({ hardWin: ok && t.lvl >= 5 }) });
JUDGES.gap = (t, r, h) => writtenForm(t, r, h, { gap: true, flags: () => ({}) });

/* ---- Greining ------------------------------------------------------------ */

/* v6.13 (items 1, 49): the word class is asked FIRST and alone. Until then
 * the pupil sees no other row — Mynd, Háttur, Tíð and Persóna above the
 * class chips said "sagnorð" before it was asked — and no definition.
 *
 * The answer therefore arrives in two steps, both through `judge`:
 *
 *   { picks: {} }                    pending, step "class": nothing chosen
 *   { picks: { fl } }                pending, step "rows": the class is
 *                                    committed. `detail.cls` says whether it
 *                                    was right and what it is, `detail.ask`
 *                                    the rows to show next
 *   { picks: { fl, kyn, … } }        the answer, judged as before
 *
 * The rows asked after the class are ALWAYS those of the right class. Rows
 * "for the class the pupil chose" cannot be asked when the choice is wrong —
 * a verb has no case to be right about — so a wrong class is marked, the
 * right one is named, and the pupil analyses the word as what it is.
 *
 * What a wrong class costs. Every row earns its share of XP, as before; the
 * class row earns none when it is wrong, and the question as a whole counts
 * as wrong (the record, the run, the difficulty, the badge). The feature
 * rows after a wrong class earn their full share, and that is deliberate:
 * from the moment the class is committed, the pupil knows it either way —
 * on the right path because they found it, on the wrong one because they
 * were told — so the rows are exactly as hard on both paths and are worth
 * the same. Nothing can be gained by missing the class on purpose: it costs
 * the class row, the run and the "right" answer, and shows nothing the
 * right path does not. */
JUDGES.parse = (t, response, hist) => {
  const rows = parseRows(t.a, t.t);
  const picks = response.picks || {};
  if (!picks.fl) return pending("incomplete", { step: "class", rows });
  const cls = { picked: picks.fl, answer: rows[0].answer, ok: picks.fl === rows[0].answer };
  const ask = rows.slice(1);
  if (ask.some((r) => !picks[r.key])) return pending("incomplete", { step: "rows", rows, cls, ask });
  const right = rows.filter((r) => picks[r.key] === r.answer).length;
  const perfect = right === rows.length;
  /* XP for every row that is right; the question counts as right only when
     all of them are. */
  const xp = right === 0 ? 0 : computeXp({
    base: t.base * right, lvl: t.lvl,
    ease: hist.ease({ cell: t.cell, word: t.word, skill: t.skill }),
    run: hist.run, streak: hist.streak,
  });
  return result(t, {
    ok: perfect, verdict: VERDICT(perfect),
    effects: [
      rec({ skill: t.skill, cell: t.cell, word: t.word, ok: perfect, xp, timed: true }),
      ...(perfect ? [count("perfectParses")] : []),
      bump(t.skill, perfect),
    ],
    resp: { kind: "rows", rows: rows.map((r) => ({ key: r.key, answer: r.answer, picked: picks[r.key] })) },
    finish: { perfectParse: perfect },
    detail: { rows, right, total: rows.length, cls },
  });
};

/* ---- Setningarhlutar ------------------------------------------------------ */

JUDGES.syntax = (t, response, hist) => {
  const picked = response.picked;
  if (picked == null) return pending("incomplete");
  const { kind, good } = judgeSyntax(t.s, t.askRole, picked);
  /* A word the build could not vouch for either way (`rn`): not right, not
     wrong, and said so. Nothing is recorded against the child, and the
     difficulty does not move. */
  if (kind === "unjudged")
    return result(t, {
      ok: null, verdict: "unjudged",
      effects: [rec({ skill: t.skill, cell: t.cell, ok: true, xp: 0, counts: false, timed: true })],
      detail: { kind, good },
    });
  const ok = kind === "right";
  return result(t, {
    ok, verdict: VERDICT(ok),
    effects: [
      rec({ skill: t.skill, cell: t.cell, ok, xp: xpFor(hist, t, { ok }), timed: true }),
      bump(t.skill, ok),
    ],
    resp: { kind: "syntax", ok,
      ex: { said: t.s.tok[picked].w, right: good.map((j) => t.s.tok[j].w).join(", ") } },
    detail: { kind, good },
  });
};

/* ---- Beygingartafla --------------------------------------------------------
 *
 * Strict: a table colours each cell, and a forgiven cell would not add up
 * (core/leniency.js). Every cell is recorded for its own BÍN mark; the table
 * is ONE answer, right only if every cell is (v6.10). */

JUDGES.table = (t, response, hist) => {
  const asked = askedCells(t);
  const given = response.cells || [];
  const typedAt = (c, k) => String((Array.isArray(given) ? given[k] : given[c.m]) ?? "");
  let helpersUsed = false, timed = false;
  const cells = [], effects = [];

  asked.forEach((c, k) => {
    const m = c.m;
    const accepted = t.w.forms[m] || [];
    const typed = typedAt(c, k);
    const g = gradeForm(typed, { accepted, paradigm: t.w.forms });
    const ok = g.verdict === "correct";
    if (g.helpers.length) helpersUsed = helpersUsed || ok;
    let xp = 0;
    if (ok) {
      xp = computeXp({ base: t.base, lvl: t.lvl,
        ease: hist.ease({ cell: m, word: t.word, skill: t.skill }),
        run: hist.run, streak: hist.streak });
      /* The time the table took is counted once, on the first right cell. */
      effects.push(rec({ skill: t.skill, cell: m, word: t.word, ok: true, xp, tally: false,
                         ...(timed ? {} : { timed: true }) }));
      timed = true;
    } else {
      effects.push(rec({ skill: t.skill, cell: m, word: t.word, ok: false, xp: 0, tally: false }));
    }
    hist.note({ cell: m, word: t.word, skill: t.skill, ok });
    cells.push({ m, typed, g, accepted, ok, xp });
  });

  const right = cells.filter((c) => c.ok).length;
  const perfect = right === asked.length;
  const gained = cells.reduce((n, c) => n + c.xp, 0);
  const bonus = perfect ? Math.round(30 * dayMult(hist.streakAfterTally())) : 0;
  effects.push(tally(t.skill, perfect), { do: "tableRun", ok: perfect });
  if (perfect) effects.push({ do: "grant", skill: t.skill, xp: bonus }, count("perfectTables"));
  effects.push(bump(t.skill, perfect));

  return result(t, {
    ok: perfect, verdict: VERDICT(perfect), effects,
    resp: { kind: "form",
      items: cells.map(({ m, typed, g, accepted }) => ({ m, typed, g, accepted, conj: t.conj })) },
    finish: { perfectTable: perfect, usedHelpers: helpersUsed && perfect },
    detail: { cells, right, total: asked.length, gained, bonus,
              hedged: cells.filter((c) => c.g.verdict === "hedged").map((c) => c.m) },
  });
};

/* ---- Word meaning ----------------------------------------------------------
 *
 * Nothing grades the text, but the same sentence pasted every time, or a
 * word or two, earns no XP (v6.10). `ok: null` — the meaning question has no
 * wrong answer, so it neither breaks a run of misses nor adds to one. */

JUDGES.meaning = (t, response, hist) => {
  const txt = String(response.text ?? "").trim();
  if (!txt) return pending("empty");
  const key = normalise(txt);
  const effort = key.split(" ").length >= 3 && !hist.seen("meaningTexts").includes(key);
  const xp = effort ? Math.round(t.base * dayMult(hist.streak)) : 0;
  return result(t, {
    ok: null, verdict: "open",
    effects: [
      { do: "remember", list: "meaningTexts", key },
      rec({ skill: t.skill, word: t.word, ok: true, xp, counts: false, timed: true }),
      count("meanings"),
    ],
    detail: { effort },
  });
};

/* ---- one pick among options: govern, indecl, clause, choice ------------- */

function onePick(t, response, hist, { answer, word = true, respFor }) {
  const picked = response.picked;
  if (picked == null || picked === "") return pending("incomplete");
  const ok = picked === answer;
  const spec = { skill: t.skill, cell: t.cell, ok, xp: xpFor(hist, t, { ok }), timed: true };
  /* A clause has no word of its own; the others record theirs. */
  if (word) spec.word = t.word;
  return result(t, {
    ok, verdict: VERDICT(ok),
    effects: [rec(spec), bump(t.skill, ok)],
    resp: respFor(picked, ok),
    detail: { picked, answer },
  });
}

JUDGES.govern = (t, r, h) => onePick(t, r, h, { answer: t.fall,
  respFor: (picked) => ({ kind: "govern", answer: t.fall, picked, so: t.t.c === "sagnorð" }) });

JUDGES.indecl = (t, r, h) => onePick(t, r, h, { answer: t.answer,
  respFor: (picked) => ({ kind: "class", answer: t.answer, picked }) });

JUDGES.clause = (t, r, h) => onePick(t, r, h, { answer: t.answer, word: false,
  respFor: (picked, ok) => ({ kind: "clause", ok, ex: { said: picked, right: t.answer } }) });

/* What `diagnose` reads for one choice, wrong or right. `sub` is the task, or
   the second half of a pair: the fields that differ between them (answer,
   mark, paradigm, optMarks, miss) are the half's own. */
function choiceResp(t, sub, picked, ok) {
  const ex = { said: picked, right: sub.answer };
  /* `missFor`: a wrong option that is itself a known mistake (item 27:
     *hans* taken for an eignarfornafn) names its own patterns. */
  const also = ok ? [] : (sub.missFor && sub.missFor[picked]) || sub.miss || t.miss || [];
  if (!(sub.m && sub.paradigm)) return { kind: "patterns", ids: also, ex };
  const g = gradeForm(picked, { accepted: [sub.answer], paradigm: sub.paradigm, allowHelpers: false });
  /* The options say which cell was meant: *borðið* offered against
     *borðinu* is the accusative, not the nominative it also is. */
  if (sub.optMarks && g.otherMarks) {
    const only = g.otherMarks.filter((m) => sub.optMarks.includes(m));
    if (only.length) g.otherMarks = only;
  }
  return { kind: "form", items: [{ m: sub.m, typed: picked, accepted: [sub.answer], g }], also, ex };
}

/* Item 43: a choice with `second` is a PAIR — the two sentences of a contrast,
 * each with its own two options (fs_hreyf, ob_fsao, fn_aftur: tasks/shared.js
 * `pairOf`). The response is `{ picked, picked2 }` and the answer is right
 * only when both are; one right half is not paid and not counted as a right
 * answer, but the wrong half is what `diagnose` reads, so the pattern is
 * charged to the sentence that was actually missed. Two blind guesses are
 * right 1 time in 4 (a pupil who sees that the two answers must differ still
 * has 1 in 2, but has then learnt the contrast, which is the point). */
function pairPick(t, r, h) {
  const { picked, picked2 } = r;
  if (picked == null || picked === "" || picked2 == null || picked2 === "") return pending("incomplete");
  const b = t.second;
  const ok1 = picked === t.answer, ok2 = picked2 === b.answer;
  const ok = ok1 && ok2;
  const spec = { skill: t.skill, cell: t.cell, ok, xp: xpFor(h, t, { ok }), timed: true, word: t.word };
  /* The first miss is the one that is reported. */
  const resp = !ok1 ? choiceResp(t, t, picked, false)
    : !ok2 ? choiceResp(t, b, picked2, false)
    : choiceResp(t, t, picked, true);
  return result(t, {
    ok, verdict: VERDICT(ok),
    effects: [rec(spec), bump(t.skill, ok)],
    resp,
    detail: { picked, answer: t.answer, picked2, answer2: b.answer, ok1, ok2 },
  });
}

JUDGES.choice = (t, r, h) => t.second ? pairPick(t, r, h) : onePick(t, r, h, { answer: t.answer,
  respFor: (picked, ok) => choiceResp(t, t, picked, ok) });

/* ---- kenni: strong or weak noun (item 27) --------------------------------
 *
 * One pick (sterk / veik) and, from þyngd 5 (`askGen`), the genitive
 * singular written first. Right only when both are; the written form is
 * graded like any other (core/grading.js, core/leniency.js: a missing
 * accent is forgiven at a cost). The pupil may write "til hests", as the
 * lesson says it. */
JUDGES.kenni = (t, response, hist) => {
  const picked = response.picked;
  let g = null, v = null, text = "";
  if (t.askGen) {
    text = String(response.text ?? "").trim().replace(/^til\s+/i, "");
    g = gradeForm(text, { accepted: t.gen, paradigm: t.paradigm, allowHelpers: false });
    if (g.verdict === "empty") return pending("empty", { g });
    if (g.verdict === "hedged") return pending("hedged", { g });
    v = verdictOf(g, t.m);
  }
  if (picked == null || picked === "") return pending("incomplete", { g, v });
  const formOk = !v || v.ok;
  const kindOk = picked === t.answer;
  const ok = formOk && kindOk;
  const xpFull = xpFor(hist, t, { ok });
  const xp = xpFor(hist, t, { ok, factor: v ? v.factor : 1 });
  const also = kindOk ? [] : (t.missFor && t.missFor[picked]) || t.miss || [];
  const ex = { said: picked, right: t.answer };
  const resp = v && !v.ok
    ? { kind: "form", items: [{ m: t.m, typed: text, g, accepted: t.gen }], also, ex }
    : { kind: "patterns", ids: also, ex };
  return result(t, {
    ok, verdict: VERDICT(ok, ok && !!(v && v.slip)),
    effects: [
      rec({ skill: t.skill, cell: t.cell, word: t.word, ok, xp, timed: true }),
      bump(t.skill, ok),
    ],
    resp,
    finish: { slip: ok && !!(v && v.slip) },
    detail: { picked, answer: t.answer, kindOk, formOk, g, v, xpFull, typed: text },
  });
};

/* ---- slots: forms written in boxes, and perhaps a pick (item 27) ----------
 *
 * Sterk eða veik sögn and the boðháttur (tasks/sagnord.js). Each box is one
 * BÍN cell (`slot.m`), graded like any written form (core/grading.js; a
 * missing accent forgiven at a cost, core/leniency.js), against every form
 * BÍN lists for it. The words the box stands between may be typed too
 * (`pre`, `post`: *í gær kallaði ég*, *ég hef kallað*). Where the task has
 * `options`, the pick must be right as well. Right only when everything is.
 *
 * A wrong form that is a mistake the builder knows by name (`slot.missIf`:
 * *kom* for *komdu*) is filed under that name only; the paradigm would read
 * *kom* as a past tense and blame the tense. Every other wrong form goes to
 * the diagnosis as a written form, with the verb's conjugation, so that
 * *lesaði* is a strong verb made weak. */
const slotText = (raw, sl) => {
  let s = String(raw ?? "").trim().replace(/[!.?]+$/, "").trim();
  const low = () => s.toLowerCase();
  for (const p of [...(sl.pre || [])].sort((a, b) => b.length - a.length))
    if (low().startsWith(p + " ")) { s = s.slice(p.length).trim(); break; }
  for (const p of sl.post || [])
    if (low().endsWith(" " + p)) { s = s.slice(0, -p.length).trim(); break; }
  return s;
};

JUDGES.slots = (t, response, hist) => {
  const given = response.texts || [];
  const items = [];
  for (const [k, sl] of (t.slots || []).entries()) {
    const text = slotText(given[k], sl);
    const g = gradeForm(text, { accepted: sl.accepted, paradigm: t.paradigm, allowHelpers: false });
    if (g.verdict === "empty") return pending("empty", { at: k });
    if (g.verdict === "hedged") return pending("hedged", { g, at: k });
    const v = verdictOf(g, sl.m);
    const known = v.ok ? null
      : (sl.missIf || []).find((x) => x.f.some((f) => normalise(f) === normalise(text))) || null;
    items.push({ m: sl.m, text, g, v, ok: v.ok, accepted: sl.accepted, known });
  }
  const picked = response.picked;
  if (t.options && (picked == null || picked === "")) return pending("incomplete");
  const formsOk = items.every((x) => x.ok);
  const kindOk = !t.options || picked === t.answer;
  const ok = formsOk && kindOk;
  const factor = items.reduce((f, x) => Math.min(f, x.v.factor), 1);
  const slip = (items.find((x) => x.ok && x.v.slip) || {}).v || null;
  const xpFull = xpFor(hist, t, { ok });
  const xp = xpFor(hist, t, { ok, factor });

  const also = kindOk ? [] : [...((t.missFor && t.missFor[picked]) || t.miss || [])];
  const add = (id) => { if (!also.includes(id)) also.push(id); };
  items.filter((x) => !x.ok).forEach((x) =>
    (x.known ? x.known.ids : (t.slots.find((sl) => sl.m === x.m) || {}).miss || []).forEach(add));
  /* Wrong forms nothing named, and right ones with a slip (a soft "broddar"). */
  const written = items.filter((x) => (!x.ok && !x.known) || (x.ok && x.v.slip))
    .map((x) => ({ m: x.m, typed: x.text, g: x.g, accepted: x.accepted, conj: t.conj || null }));
  const firstWrong = items.find((x) => !x.ok);
  const ex = !kindOk ? { said: picked, right: t.answer }
    : firstWrong ? { said: firstWrong.text, right: firstWrong.accepted[0] } : null;
  const resp = written.length ? { kind: "form", items: written, also, ex } : { kind: "patterns", ids: also, ex };

  return result(t, {
    ok, verdict: VERDICT(ok, ok && !!slip),
    effects: [
      rec({ skill: t.skill, cell: t.cell, word: t.word, ok, xp, timed: true }),
      bump(t.skill, ok),
    ],
    resp,
    finish: { slip: ok && !!slip },
    detail: { picked, answer: t.answer, kindOk, formsOk, xpFull, slip,
              items: items.map(({ m, text, ok: good, v, accepted, known }) =>
                ({ m, typed: text, ok: good, v, accepted, known: !!known })) },
  });
};

/* ---- tap and sort ---------------------------------------------------------- */

const AO_FS = ["atviksorð", "forsetning"];

JUDGES.tap = (t, response, hist) => {
  const sel = [...(response.sel || [])];
  if (!sel.length) return pending("incomplete");
  const want = new Set(t.targets), has = new Set(sel);
  const extra = sel.filter((j) => !want.has(j));
  const missed = t.targets.filter((j) => !has.has(j));
  const ok = !extra.length && !missed.length;
  /* `miss`: the builder names the pattern (item 28: the phrases). */
  const ids = ok ? [] : t.miss ? t.miss : t.tags.includes("clause") ? ["setningagerd"]
    : (AO_FS.includes(t.cls) && [...extra, ...missed].some((j) => AO_FS.includes(t.s.tok[j].c))
      ? ["ao_fs"] : ["ordflokkur"]);
  return result(t, {
    ok, verdict: VERDICT(ok),
    effects: [
      rec({ skill: t.skill, cell: t.cell, ok, xp: xpFor(hist, t, { ok }), timed: true }),
      bump(t.skill, ok),
    ],
    resp: { kind: "patterns", ids,
      ex: { said: [...sel].sort((a, b) => a - b).map((j) => t.s.tok[j].w).join(", "),
            right: t.targets.map((j) => t.s.tok[j].w).join(", ") } },
    detail: { extra, missed },
  });
};

JUDGES.sort = (t, response, hist) => {
  const picks = response.picks || {};
  if (t.items.some((_, k) => !picks[k])) return pending("incomplete");
  const wrong = [];
  t.items.forEach((it, k) => { if (picks[k] !== it.cls) wrong.push({ it, said: picks[k] }); });
  const ok = !wrong.length;
  const ids = ok ? [] : t.tags.includes("syn") ? ["setningalidir"]
    : wrong.some((x) => AO_FS.includes(x.it.cls) && AO_FS.includes(x.said))
      ? ["ao_fs"] : ["ordflokkur"];
  return result(t, {
    ok, verdict: VERDICT(ok),
    effects: [
      rec({ skill: t.skill, cell: t.cell, ok, xp: xpFor(hist, t, { ok }), timed: true }),
      bump(t.skill, ok),
    ],
    resp: { kind: "patterns", ids,
      ex: wrong[0] ? { said: `${wrong[0].it.w}: ${wrong[0].said}`, right: wrong[0].it.cls } : null },
    detail: { good: t.items.length - wrong.length, wrong },
  });
};

/* ---- Málbeiting: Villuveiðar, Setningasmiðja, Umritun ------------------- */

JUDGES.villur = (t, response, hist) => {
  const edits = response.edits || {};
  const g = gradeHunt(t.hunt, edits);
  const n = t.hunt.errors;
  const fixed = g.fixed.length, alarms = g.falseAlarm.length;
  /* XP for what was put right, less a share for each correct word changed. */
  const share = Math.max(0, fixed - alarms) / n;
  const xp = share > 0 ? xpFor(hist, t, { ok: true, base: Math.round(t.base * share) }) : 0;
  /* Every error is recorded for its own mark and word; the XP and the time
     ride on the first. The hunt is one answer. */
  const effects = [];
  t.hunt.lines.forEach((ln, li) => ln.toks.forEach((tk, ti) => {
    if (!tk.err) return;
    const key = `${li}:${ti}`;
    const first = !effects.length;
    effects.push(rec({ skill: t.skill, cell: tk.err.m, word: tk.err.word,
      ok: key in edits && g.fixed.includes(key),
      xp: first ? xp : 0, tally: false, ...(first ? { timed: true } : {}) }));
  }));
  effects.push(tally(t.skill, g.ok), bump(t.skill, g.ok));
  return result(t, {
    ok: g.ok, verdict: VERDICT(g.ok), effects,
    resp: { kind: "hunt", g },
    detail: { g, fixed, alarms, total: n },
  });
};

JUDGES.smidja = (t, response, hist) => {
  const text = String(response.text ?? "");
  if (!text.trim()) return pending("empty");
  const g = gradeWorkshop(t.cards, text);
  const inflected = t.cards.filter((c) => !c.fixed);
  const per = (c) => g.per[t.cards.indexOf(c)];
  const right = inflected.filter((c) => per(c).ok).length;
  const ok = g.ok;
  /* Half of the share for the words that were right, when not all were. */
  const share = inflected.length ? right / inflected.length : 0;
  const xp = ok ? xpFor(hist, t, { ok: true })
    : share > 0 ? xpFor(hist, t, { ok: true, base: Math.round(t.base * share * 0.5) }) : 0;
  const effects = inflected.map((c, k) => rec({
    skill: t.skill, cell: c.m, word: c.e ? wordKey(c.e.o, c.e.c) : null,
    ok: per(c).ok, xp: k === 0 ? xp : 0, tally: false, ...(k === 0 ? { timed: true } : {}) }));
  effects.push(tally(t.skill, ok), bump(t.skill, ok));
  return result(t, {
    ok, verdict: VERDICT(ok), effects,
    resp: { kind: "cards", cards: t.cards, per: g.per, extra: g.extra },
    detail: { g, right, total: inflected.length },
  });
};

JUDGES.umritun = (t, response, hist) => {
  const text = String(response.text ?? "");
  if (!text.trim()) return pending("empty");
  const grade = gradeTransform(text, t);
  if (grade === "empty") return pending("empty");
  const note = transformFeedback(text, t, grade);
  const ok = ["correct", "slip", "short", "shortslip"].includes(grade);
  const slip = grade === "slip" || grade === "shortslip";
  const short = grade === "short" || grade === "shortslip";
  const hinted = !!response.hinted;
  const xp = xpFor(hist, t, { ok, hinted, factor: slip ? SLIP_XP.accents : 1 });
  /* Every mark the rewrite tested is recorded; the first one carries the
     XP, the time and the count. */
  const effects = (t.marks || [{ m: t.cell }]).map((c, k) => rec({
    skill: t.skill, cell: c.m, word: c.word || null, ok, xp: k === 0 ? xp : 0, hinted,
    counts: k === 0, ...(k === 0 ? { timed: true } : {}) }));
  effects.push(bump(t.skill, ok));
  return result(t, {
    ok, verdict: VERDICT(ok, slip), effects,
    resp: { kind: "transform", typed: text, ok },
    finish: { slip },
    detail: { grade, slip, short, note },
  });
};

/* ========================================================================
 * 6. The two entry points
 * ====================================================================== */

/** The question types `judge` knows. */
export const JUDGED_TYPES = Object.keys(JUDGES);

/**
 * Judge one answer. Pure.
 *
 * @param {object}  task      a task as the builders make it (`task.type`)
 * @param {object}  response  what the pupil gave — shapes at the top of the file
 * @param {?{S:object, sess:object}} pupil  read for XP only; may be omitted
 * @returns {{ok:?boolean, verdict:string, pending:boolean, findings:object[],
 *            xp:number, effects:object[], finish:?object, detail:object,
 *            resp:?object}}
 */
export function judge(task, response = {}, pupil = null) {
  const fn = task && JUDGES[task.type];
  if (!fn) throw new Error("Enginn dómari fyrir " + (task && task.type));
  const j = fn(task, response || {}, historyOf(pupil));
  /* The response that was judged, kept beside the judgement — a duel sends
     it to the server, which judges it again (core/duel.js `gradeDuel`). Not
     enumerable: it is not part of the verdict, and nothing that copies or
     compares a judgement should see it. */
  Object.defineProperty(j, "given", { value: response || {}, enumerable: false });
  return j;
}

/**
 * The optional bonus sentence under an Orðaforði question. Not a question
 * type — the question it hangs under has already been judged — but its XP is
 * decided and written the same way, so it has the same shape of result.
 * `pending` (with `detail.why`) when the sentence does not earn the bonus.
 */
export function judgeBonus(task, text, pupil = null) {
  const hist = historyOf(pupil);
  const r = bonusVerdict(text, task.bonus, hist.seen("bonusTexts"));
  if (!r.ok) return pending("incomplete", { why: r.why });
  const xp = Math.round(BONUS_XP * dayMult(hist.streak));
  return {
    ok: null, verdict: "open", pending: false, findings: [], xp,
    effects: [
      { do: "remember", list: "bonusTexts", key: normalise(text) },
      rec({ skill: "ordaford", word: task.word, ok: true, xp, counts: false }),
      count("meanings"),
    ],
    finish: null, detail: {}, resp: null,
  };
}

/* ========================================================================
 * 7. A second try (critique item 42)
 * ======================================================================
 *
 * A wrong WRITTEN answer is not answered for the pupil at once. The verdict
 * box shows the *af hverju* line (with the answer itself taken out of it,
 * `hideAnswer`) and the name of the error pattern the judge found, the box
 * stays open, and the pupil writes once more. Then the answer is shown,
 * whatever the second try was.
 *
 * ---- which types --------------------------------------------------------
 *
 *   fill, verb, verbslot, gap   yes: one form written from nothing; a second
 *                               try with the rule in view is a real attempt.
 *   slots without options       yes (the boðháttur): forms written in boxes.
 *   umritun                     yes: a sentence rewritten; the note on what
 *                               went wrong (`transformNote`) is the hint.
 *   slots with options, kenni   no: half the answer is a pick between two
 *                               (sterk / veik). After a miss the other one is
 *                               a certainty, not an answer.
 *   choice, govern, indecl,     no: a pick among two to four. A second try
 *   clause, parse, syntax,      is a near-guess and would teach guessing.
 *   tap, sort
 *   table, smidja, villur       no: the verdict colours every cell, card and
 *                               word, so a second try would be made with the
 *                               wrong ones already pointed out.
 *   meaning                     no: there is no wrong answer.
 *
 * Never in a duel (`task.duel`, core/duel.js): a duel is one attempt per
 * question for both players, and its score is compared.
 *
 * ---- what is recorded ---------------------------------------------------
 *
 * The FIRST answer is settled as it was given, at once, through the one path
 * (`conclude` → `settle` → `app.finish`): a miss. The record of the cell,
 * word and skill, the day's count, the run, the difficulty (`bumpDiff`), the
 * diagnosis and the review queue all see a wrong answer, exactly as without
 * a retry — and they see it even if the pupil walks away without trying
 * again. That is what keeps them honest: a pupil who needed the rule shown
 * to them did not know the form, and the review queue should bring it back
 * tomorrow.
 *
 * The SECOND try is not a second answer. `judgeRetry` judges it with the
 * same judge, and what it is worth is written as a follow-up, the way the
 * Orðaforði bonus sentence is (`finish: null`, so nothing is counted twice):
 *
 *   right   RETRY_XP (half) of what a right answer earns now — granted to
 *           the skill and the day as XP, not as a record — and the counter
 *           `retryFixed`. Nothing else: the miss stays a miss.
 *   wrong   nothing but the counter `retries`; the answer is shown.
 *
 * `retries` counts every second try and `retryFixed` the right ones, so a
 * report can say how often the rule in view was enough. */

/** The question types that offer a second try, and on what condition. */
export const RETRY_TYPES = {
  fill: () => true,
  verb: () => true,
  verbslot: () => true,
  gap: () => true,
  umritun: () => true,
  slots: (t) => !t.options,
};

/** May this judged answer be tried again? Only a settled wrong answer, of a
    type listed above, outside a duel, and only once. */
export function retryAllowed(task, j) {
  if (!task || !j || j.pending || j.ok !== false) return false;
  if (task.duel || task.retried) return false;
  const rule = RETRY_TYPES[task.type];
  return !!rule && rule(task);
}

/* Every form that would answer the question, longest first. */
function answersOf(task) {
  const out = [...(task.answers || [])];
  (task.slots || []).forEach((sl) => out.push(...(sl.accepted || [])));
  return [...new Set(out.filter(Boolean).map(String))].sort((a, b) => b.length - a.length);
}

const reEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The text with every right answer taken out: an *af hverju* line shown
 * BEFORE the answer must not contain it. Several explain themselves with the
 * very form (*… og töluorðið líka: **tvennar***). A whole word only, any
 * capitals: *hest* is not taken out of *hestur*. `mask` stands in its place.
 */
export function hideAnswer(text, task, mask = "…") {
  if (!text) return text;
  let out = String(text);
  /* No lookbehind (Safari below 16.4 throws on it, tests/browsers.test.js):
     the character before the word is matched and put back. */
  for (const a of answersOf(task)) {
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${reEscape(a)}(?![\\p{L}\\p{N}])`, "giu");
    out = out.replace(re, (_, before) => before + mask);
  }
  return out;
}

/**
 * Judge the second try. `firstResponse` is the response of the first
 * answer, which has already been settled. Pure, like `judge`.
 *
 * Pending — nothing is used up, the renderer asks again — when the second
 * try is empty, hedged, or the same as the first (`verdict: "same"`).
 * Otherwise `{ ok, verdict, retry: true, xp, effects, finish: null, … }`:
 * `detail` and `resp` are the second try's own, for drawing; `findings` too,
 * and they are NOT written to the diagnosis (the miss already was).
 */
export function judgeRetry(task, response = {}, firstResponse = null, pupil = null) {
  const j = judge(task, response, pupil);
  if (j.pending) return j;
  if (firstResponse && firstSaid(response) === firstSaid(firstResponse))
    return pending("same", j.detail);
  const ok = j.ok === true;
  const xp = ok && j.xp > 0 ? Math.max(1, Math.round(j.xp * RETRY_XP)) : 0;
  const effects = [count("retries")];
  if (ok) effects.push({ do: "grant", skill: task.skill, xp }, count("retryFixed"));
  return {
    ok, verdict: j.verdict, pending: false, retry: true,
    findings: j.findings, xp, xpFull: j.xp, effects,
    finish: null, detail: j.detail, resp: j.resp,
  };
}

/** What was written, as `judgeRetry` compares two tries: capitals, commas
    and spaces do not make a try new. */
export const firstSaid = (response) =>
  normalise(String((response && (response.text ?? (response.texts || []).join(" "))) ?? ""));

/**
 * Write a judgement into the pupil's state: the one path every answer takes.
 *
 * Changes `S` and `sess`, and nothing else — no DOM, no storage. `ms` is the
 * time the answer took (the renderer's clock; a simulation passes what it
 * likes). Returns what `app.finish` is to be told, or null for a result that
 * does not end a question (`pending`, the bonus sentence).
 */
export function settle(S, sess, task, j, { ms = 0 } = {}) {
  if (!j || j.pending) return null;
  /* Item 44: the step the pupil was at in this skill BEFORE the answer
     moves it — the level the question was asked at (core/mastery.js). */
  const band = sess && sess.diff && task && task.skill ? bandOf(sess, task.skill) : null;
  for (const e of j.effects) {
    switch (e.do) {
      case "record": {
        const { do: _, timed, ...spec } = e;
        record(S, sess, { ...spec, ms: timed ? ms : 0 });
        break;
      }
      /* One answer made of several records: counted once. */
      case "tally": tallyAnswer(S, sess, { skill: e.skill, ok: e.ok }); break;
      case "tableRun": sess.tableRun = e.ok ? (sess.tableRun || 0) + 1 : 0; break;
      /* A perfect table's bonus: XP that belongs to no cell. */
      case "grant":
        S.xp += e.xp;
        (S.skills[e.skill] ||= { xp: 0, c: 0, w: 0, bestRun: 0 }).xp += e.xp;
        dayRec(S).xp += e.xp;
        break;
      case "count": S.counters[e.counter] = (S.counters[e.counter] || 0) + 1; break;
      /* A text that has earned its XP once this visit. */
      case "remember": (sess[e.list] ||= []).push(e.key); break;
      case "bump": bumpDiff(sess, S, e.skill, e.ok); break;
      default: throw new Error("Óþekkt áhrif: " + e.do);
    }
  }
  if (!j.finish) return null;
  /* Item 44: one answer to this question type, at that step — what the
     mastery mark reads (core/mastery.js). A duel is asked at the duel's
     level, not the pupil's, and does not count. */
  if (!task.duel && band != null) noteTypeAnswer(S, task.typeId, band, j.ok);
  /* The review queue (core/review.js): a miss goes in, due tomorrow; a right
     answer on an entry that is due moves it out. Here, on the one path every
     answer takes, so that a new question type cannot forget it. `review`
     says what happened, for the line under the verdict. */
  const review = noteReview(S, task, j, todayKey());
  const out = { ...j.finish, findings: j.findings, review };
  /* The badges for a quick or a curious answer read its time and its shape
     together; both only when the answer was right. */
  if ("answer" in j.finish) out.answerMs = j.ok ? ms : 0;
  return out;
}
