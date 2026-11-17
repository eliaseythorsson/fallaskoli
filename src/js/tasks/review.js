/* Asking a review: an entry of the queue turned back into a question.

   core/review.js keeps the queue and knows nothing about builders. This file
   is the other half: it takes an entry — "ÞGFFT of *hestur*, missed in a
   cloze" — and has the entry's own question type build it again, with the
   cell or the word forced (`view.force`, tasks/view.js).

   No builder is trusted to have honoured the request. Some know the hook
   (the cloze, the verb questions, the tables, the adjective and numeral
   gaps); the rest build as they always do. So every candidate is CHECKED
   against the entry, and the steps below go from the exact thing that was
   missed to the nearest thing that can be asked:

     1  the same hand-written item                      (to_flt)
     2  the same word in the same cell
     3  the same cell, another word
     4  the same word, another cell
     5  the same type, testing the same error pattern   (the fall-back)

   A type whose builder does not know the hook is simply built a few times
   and the first match kept — with five kinds of sentence part or four kinds
   of rewrite that finds the cell at once. If not even step 5 can be built
   (the type is switched off, the word has left the lexicon) the answer is
   null and the entry waits; it is never asked as some unrelated question.

   Like every builder this is pure: build(…) → { task, effects } or null, and
   the effects are applied by whoever shows the task. The three functions at
   the bottom keep a SESSION's plan (which reviews it opens with, which noun
   is to come back) on the run object they are handed, as control/session.js `pickTask`
   keeps the rest of it. */

import { chancesIn } from "../core/diagnosis.js";
import { openingReviews, entryByKey, reaskAt } from "../core/review.js";
import { built, FX } from "./effects.js";
import { withView } from "./view.js";
import { typeById, enabled } from "./registry.js";

/* How many times a builder is asked before a step is given up. A builder
   that knows the hook answers the first time; the numbers are for those that
   do not. Building is cheap (a millisecond or two) and happens three times a
   session. */
const TRIES = { item: 2, both: 6, cell: 12, word: 6, pattern: 10 };

const wordOf = (lex, key) => {
  if (!key) return null;
  const at = key.lastIndexOf("|");
  return at > 0 ? lex.lookup(key.slice(0, at), key.slice(at + 1)) : null;
};

const hasCell = (task, c) =>
  task.cell === c || (task.type === "table" && (task.cells || []).some((x) => x.m === c));

/**
 * The question for one entry of the review queue: { task, effects, hit } or
 * null. `hit` says how close it came: "item", "both", "cell", "word",
 * "pattern" or "type".
 *
 * @param entry  { t, c, w, i, p, k } as core/review.js keeps it
 * @param avoid  a sentence (its text) not to use — the one just missed
 * @param wordFirst  prefer the same word in another cell to the same cell
 *               with another word (the noun that comes back within a session)
 * @param mark   what to write on the task: "review" (default) ties it to the
 *               entry, so that the answer counts for it whatever was built;
 *               "reask" marks the repeat within a session
 */
export function reviewTask(lex, view, rng, entry, { avoid = null, wordFirst = false, mark = "review" } = {}) {
  const spec = entry && typeById(entry.t);
  if (!spec || !enabled(view.policy, spec)) return null;
  const word = wordOf(lex, entry.w);
  const c = entry.c || null;

  const attempt = (force, drillWord, tries, ok) => {
    const v = withView(view, { force: force ? Object.freeze(force) : null,
      drillWord: drillWord || null, forcedNoun: null });
    for (let k = 0; k < tries; k++) {
      const b = drillWord && spec.drill ? spec.drill(lex, v, rng, drillWord) : spec.build(lex, v, rng);
      if (!b) continue;
      if (b.task.answers !== undefined && !(b.task.answers && b.task.answers.length)) continue;
      if (ok(b.task)) return b;
    }
    return null;
  };

  const steps = [];
  if (entry.i) steps.push(["item", () => attempt({ item: entry.i, cell: c, avoid }, null, TRIES.item,
    (t) => t.item === entry.i)]);
  if (c && word) steps.push(["both", () => attempt({ cell: c, word, avoid }, word, TRIES.both,
    (t) => hasCell(t, c) && t.word === entry.w)]);
  const cellStep = c ? ["cell", () => attempt({ cell: c, avoid }, null, TRIES.cell, (t) => hasCell(t, c))] : null;
  const wordStep = word ? ["word", () => attempt({ word, avoid }, word, TRIES.word, (t) => t.word === entry.w)] : null;
  steps.push(...(wordFirst ? [wordStep, cellStep] : [cellStep, wordStep]).filter(Boolean));
  /* The fall-back: the same type, and a question that tests the pattern the
     miss was filed under. With no pattern on the entry, the type is all
     there is to go by. */
  steps.push([entry.p ? "pattern" : "type", () => attempt(null, null, TRIES.pattern,
    (t) => !entry.p || chancesIn({ ...t, typeId: spec.id }).includes(entry.p))]);

  for (const [hit, run] of steps) {
    const b = run();
    if (!b) continue;
    const { task } = b;
    task.typeId = spec.id;
    if (mark === "reask") task.reask = true;
    else { task.review = entry.k; task.reviewHit = hit; }
    /* What the session knows once the question has been shown — as
       tasks/next.js adds for every question it chooses. */
    const words = [task.n, task.w, task.v].filter(Boolean).map((x) => x.o);
    return { ...built(task, [
      ...b.effects,
      FX.since(spec.id.startsWith("tbl"), false),
      ...(words.length ? [FX.seen(words)] : []),
    ]), hit };
  }
  return null;
}

/* ---------- a session's plan ------------------------------------------------ */

/**
 * The reviews a session of `n` questions opens with: the keys of up to three
 * due entries (core/review.js `openingReviews` has the order), of types this
 * session may ask — `policy` is the session's own, so a session on Sagnorð
 * opens with verbs — and, in a session aimed at given error patterns, of
 * those patterns.
 */
export function planOpening(S, today, n, policy, focus = null) {
  const can = (e) => {
    const spec = typeById(e.t);
    return !!spec && enabled(policy, spec) && (!focus || focus.includes(e.p));
  };
  return openingReviews(S, today, n, can).map((e) => e.k);
}

/**
 * The next review of the session's opening, built — or null when there is
 * none left. An entry that is no longer due (it came up by itself a moment
 * ago and was answered) or that cannot be built is passed over; it stays in
 * the queue. Takes what it uses off `run.review`.
 */
export function nextOpening(lex, view, rng, run) {
  while (run.review && run.review.length) {
    const e = entryByKey(view.S, run.review.shift());
    if (!e || e.due > view.today) continue;
    const b = reviewTask(lex, view, rng, e);
    if (b) return b;
  }
  return null;
}

/**
 * A cloze was missed at position `run.i`: plan its noun's return, three to
 * five questions on (critique item 19). Returns true if the session is long
 * enough for it to come back; if not, the review queue brings it tomorrow.
 * A cloze asked for another category (Fallstjórn, `noRepeat`) is not brought
 * back as a Nafnorð question, as before.
 */
export function scheduleReask(run, task, rng) {
  if (!run || !task || task.type !== "fill" || task.noRepeat || !task.word) return false;
  const at = reaskAt(run.i, run.n, rng);
  if (at == null) return false;
  (run.reask ||= []).push({ at, w: task.word, c: task.cell, avoid: task.s ? task.s.t : null });
  return true;
}

/**
 * The noun whose turn has come, built — or null. `room`: whether the session
 * may have another cloze (core/mix.js); without it the repeat is let go, as
 * the noun waiting for the next question always was.
 */
export function nextReask(lex, view, rng, run, room = true) {
  const list = run.reask || [];
  for (;;) {
    const k = list.findIndex((x) => x.at <= run.i);
    if (k < 0) return null;
    const [x] = list.splice(k, 1);
    if (!room) continue;
    /* The same noun in the same cell, in another sentence: that is what was
       missed. Failing that the same noun in another cell. */
    const b = reviewTask(lex, view, rng, { t: "fill", c: x.c, w: x.w, p: null, k: null },
      { avoid: x.avoid, wordFirst: true, mark: "reask" });
    if (b && b.task.word === x.w) return b;
  }
}
