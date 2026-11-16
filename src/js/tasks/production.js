/* Grading the three production questions (v6.9): Villuveiðar, Setningasmiðja
   and Umritun.

   v6.13: the BUILDERS that used to share this file are in tasks/malbeiting.js,
   with the rest of their category. What is left here judges an answer and
   builds nothing; it stays under this name until grading has a home of its
   own outside the renderers (core/answer.js, critique item 69). Pure, no DOM. */

import { normalise, judge, stripAccents } from "../core/grading.js";

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
  const v = judge(input, task.answers);
  if (v === "empty") return "empty";
  const orig = task.s && task.s.t;
  if (orig && normalise(input) === normalise(orig)) return "wrong";
  if (v === "accents" && orig && stripAccents(input) === stripAccents(orig)) return "wrong";
  if (v === "wrong") return tailLeftOut(input, task) || "wrong";
  return v === "accents" ? "slip" : v;
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
