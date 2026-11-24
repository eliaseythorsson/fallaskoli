/* The structure hint on a Setningafræði question (item 26).

   The builder has planned it (`t.coding`, core/hint.js): at a low þyngd the
   structure is SHOWN from the start, at a middle þyngd it is OFFERED behind
   "Vísbending" (half XP, not an error — the rule of every hint), above that
   the task has no `coding` and nothing here does anything. Where the
   structure was drawn, after the answer it is drawn whole, the asked part
   too: it is then the explanation.

   A renderer keeps its own words (a clickable span, an underlined target)
   and hands them to `codedHTML` as `word`; ui/structure.js draws the marks
   round them. */

import { structureHTML } from "./structure.js";
import { hintMarks } from "../core/hint.js";
import { $ } from "./dom.js";

/** Is the structure drawn on this question now? */
export const codedOn = (t) => !!t.coding && (t.coding.step === "shown" || !!t.hinted);

/** The sentence with its marks, or null when it is drawn plain. */
export function codedHTML(t, word) {
  if (!codedOn(t)) return null;
  return structureHTML(t.s, { word, structure: hintMarks(t.s, t.coding, { after: !!t.done }) });
}

/** The button, where the hint is offered. */
export const hintButtonHTML = (t) =>
  t.coding && t.coding.step === "offered" ? `<button class="ghost" id="hint">Vísbending</button>` : "";

/** What the hint shows, said once under the sentence when it is shown from the start. */
export const shownNoteHTML = (t) => t.coding && t.coding.step === "shown"
  ? `<p class="gloss codednote">Bygging málsgreinarinnar er sýnd: hver hluti hefur sinn lit, sína línu og sitt heiti. Það sem spurt er um er ekki merkt.</p>`
  : "";

/**
 * Wire the button: on a click the task is marked `hinted`, `redraw` draws the
 * sentence again (now coded), and the verdict box says what it costs.
 * `text` overrides the general sentence about what is shown.
 */
export function wireHint(t, redraw, text = null) {
  const b = $("hint");
  if (!b) return;
  b.disabled = !!t.hinted || !!t.done;
  b.onclick = () => {
    if (t.done || t.hinted) return;
    t.hinted = true;
    b.disabled = true;
    redraw();
    $("verdict").innerHTML = `<div class="verdict neutral"><h3>Vísbending</h3>
      <p>${text || `Nú er bygging málsgreinarinnar sýnd: hver hluti hefur sinn lit, sína línu og sitt heiti.
        Aðeins það sem er öruggt er merkt. Það sem spurt er um er ekki merkt.`}</p>
      <p class="streakline">Vísbending gefur helmingi minna XP — hún telst ekki sem villa.</p></div>`;
  };
}

/** After the answer: the button off. */
export function endHint() {
  if ($("hint")) $("hint").disabled = true;
}
