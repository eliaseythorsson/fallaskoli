/* Answers that are right enough.
 *
 * v6.10: ONE near miss is accepted as correct with a small XP deduction — a
 * missing acute accent (5%). The wrong article on a noun and the wrong tense
 * on a verb are recognised (`slipFor`) but counted wrong, with a note naming
 * the one feature that was off (`verdictOf(...).near`). Until v6.10 they were
 * accepted at 90%. The article and the tense are
 * the two features stated in the instructions above the box rather than
 * derivable from the sentence — a child who gets one wrong read too fast; a
 * child who gets the case wrong does not know the case yet.
 *
 * Nothing else is forgiven: *hestinn* for *hestana* is the wrong number, and
 * the difference is the whole exercise. The paradigm is consulted before the
 * accent rule (core/grading.js `otherMarksFor`): *biðum* is not a mistyping of
 * *bíðum*, it is the past tense. Beygingartöflur stay strict — a table colours
 * each cell, and a forgiven cell would not add up.
 *
 * One decision, made here, read for every written answer by core/answer.js
 * (`judge`) — and so the same on the screen, in a duel and in a simulation. */

import { readMark } from "./marks.js";

/* How much of the XP survives. */
export const SLIP_XP = { accents: 0.95, greinir: 0.90, tid: 0.90 };

/* The headings. `CHEERS_OK` stays for a clean answer; these replace it, and
   they open with praise on purpose — the answer was right. */
const SLIP_TEXT = {
  accents: {
    head: "Gott! En passaðu stafsetningu orða",
    note: "Brodd vantaði eða var ofaukið. Svarið telst rétt, en 5% af XP var dregið frá vegna stafsetningar.",
  },
  greinir: {
    head: "Gott! En það er mikilvægt að lesa leiðbeiningarnar vel",
    note: null,        // filled in below: it names the two forms
  },
  tid: {
    head: "Gott! En það er mikilvægt að lesa leiðbeiningarnar vel",
    note: null,
  },
};

/** Everything a mark says except the one feature being forgiven. */
const withoutGreinir = (a) =>
  [a.fall, a.tala, a.kyn, a.stig, a.beyging].join("|");
const withoutTid = (a) =>
  [a.mynd, a.háttur, a.persóna, a.tala, a.stýfður ? "st" : ""].join("|");

/**
 * Do these two marks differ ONLY in the article?
 * Both must be noun-shaped marks — a mark with no case has no article, and
 * `readMark` reports `greinir: false` for a verb, which is not the same as
 * "without the article".
 */
export function onlyGreinirDiffers(target, other) {
  const a = readMark(target), b = readMark(other);
  if (!a.fall || !b.fall) return false;
  if (a.greinir === b.greinir) return false;
  return withoutGreinir(a) === withoutGreinir(b);
}

/** Do these two marks differ ONLY in tense? */
export function onlyTidDiffers(target, other) {
  const a = readMark(target), b = readMark(other);
  if (!a.tíð || !b.tíð) return false;
  if (a.tíð === b.tíð) return false;
  return withoutTid(a) === withoutTid(b);
}

/**
 * What, if anything, to forgive in this answer.
 *
 * @param {object}  g       the result of `gradeForm`
 * @param {?string} target  the BÍN mark the question asked for
 * @returns {?{id:string, factor:number, head:string, note:string}}
 *   `null` means there is nothing to forgive and the caller grades as usual.
 */
export function slipFor(g, target) {
  if (!g) return null;

  if (g.verdict === "accents") {
    return { id: "accents", factor: SLIP_XP.accents, ...SLIP_TEXT.accents };
  }

  if (g.verdict === "otherform" && target) {
    const marks = g.otherMarks || [];
    /* A surface form usually belongs to several cells, and the answer is
       forgiven if ANY of them differs from the target in the one feature only.
       *las* is both 1st and 3rd person past of *lesa*; requiring every reading
       to be forgivable would refuse the commonest tense slip in the language. */
    if (marks.some((m) => onlyGreinirDiffers(target, m))) {
      const wanted = readMark(target).greinir;
      return {
        id: "greinir", factor: SLIP_XP.greinir, head: SLIP_TEXT.greinir.head,
        note: wanted
          ? "Spurt var um myndina **með greini**; þú skrifaðir hana **án greinis**. Fallið og talan voru rétt, svo svarið telst rétt, en 10% af XP var dregið frá vegna greinis."
          : "Spurt var um myndina **án greinis**; þú skrifaðir hana **með greini**. Fallið og talan voru rétt, svo svarið telst rétt, en 10% af XP var dregið frá vegna greinis.",
      };
    }
    if (marks.some((m) => onlyTidDiffers(target, m))) {
      const wanted = readMark(target).tíð;
      return {
        id: "tid", factor: SLIP_XP.tid, head: SLIP_TEXT.tid.head,
        note: `Spurt var um **${wanted}**; þú skrifaðir hina tíðina. Persóna, tala, háttur og mynd voru rétt, svo svarið telst rétt, en 10% af XP var dregið frá vegna tíðar.`,
      };
    }
  }
  return null;
}

/**
 * The whole verdict for one written answer, in one call.
 *
 * Returns what the judge (core/answer.js) and the verdict box need and nothing
 * they do not:
 *
 *   ok      count it as a correct answer — for the run, the streak, the
 *           spacing and the badges. A forgiven slip is `true`: the answer is
 *           accepted as correct, and must not break a run.
 *   factor  what to multiply the XP by (1 when there is nothing to forgive)
 *   klass   the CSS class for the verdict box: ok | near | no
 *   slip    the slip itself, or null
 */
export function verdictOf(g, target) {
  const slip = slipFor(g, target);
  if (g.verdict === "correct")
    return { ok: true, factor: 1, klass: "ok", slip: null, near: null };
  /* v6.10: only the accent is forgiven. The wrong article or tense is a
     wrong answer — in a Nafnorð session the article IS the topic, and in a
     duel *hótelin* for *hótel* must not score — but it is told kindly, with
     the note that names the one feature that was off (`near`). */
  if (slip && slip.id === "accents")
    return { ok: true, factor: slip.factor, klass: "near", slip, near: null };
  if (slip)
    return { ok: false, factor: 0, klass: "no", slip: null, near: { id: slip.id, note: NEAR_NOTE[slip.id](target) } };
  return { ok: false, factor: 0, klass: "no", slip: null, near: null };
}

const NEAR_NOTE = {
  greinir: (target) => readMark(target).greinir
    ? "Fallið og talan voru rétt, en spurt var um myndina **með greini** og þú skrifaðir hana **án greinis**."
    : "Fallið og talan voru rétt, en spurt var um myndina **án greinis** og þú skrifaðir hana **með greini**.",
  tid: (target) => `Persóna, tala og háttur voru rétt, en spurt var um **${readMark(target).tíð}** og þú skrifaðir hina tíðina.`,
};
