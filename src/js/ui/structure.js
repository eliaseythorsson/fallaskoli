/* A sentence drawn with its structure marked (item 25).

   core/structure.js says what is marked; this turns it into HTML, and the
   stylesheet (src/head.html, "bygging setningar") gives each mark its look.
   No mark is told from another by colour alone:

     frumlag            one thick line under it          + the word "frumlag"
     umsögn             a double line                    + "umsögn"
     andlag             a dashed line                    + "andlag"
     óbeint andlag      a dotted line                    + "óbeint andlag"
     sagnfylling        a wavy line                      + "sagnfylling"
     forsetningarliður  a bracket under it  ⎵            + "forsetningarliður"
     samtenging         a ring round the word            + "samtenging"
     aukasetning        a dashed box round the clause    + its kind

   The name stands under every mark, so the picture can be read in black and
   white, by a colour-blind pupil and by a screen reader (which reads the name
   after the words). The colours are declared twice in the stylesheet, for
   paper and for the board.

   `structureHTML` returns a string and touches no DOM, so any renderer can
   put it where its sentence goes — #26 gives it to the other Setningafræði
   types. `word(tok, j)` draws one word (a renderer's own clickable span, a
   gloss …); the default is the escaped word. */

import { sentenceStructure, withoutMarks } from "../core/structure.js";

const PUNCT = new Set([".", ",", "!", "?", ";", ":"]);
const escHTML = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** The class of a mark: "óbeint andlag" → "sc-obeint-andlag". */
export const structureClass = (role) => "sc-" + String(role)
  .replace(/ó/g, "o").replace(/ö/g, "o").replace(/ð/g, "d").replace(/\s+/g, "-");

/**
 * @param {object} s a sentence of the bank
 * @param {object} [opts]
 * @param {(tok: object, j: number) => string} [opts.word] HTML of one word
 * @param {string[]} [opts.hide] roles not to mark (what the question asks for)
 * @param {boolean} [opts.clauses] false: no boxes round the clauses
 * @param {boolean} [opts.kinds] false: a box is named "aukasetning", not by its kind
 * @param {object} [opts.structure] a structure already worked out
 * @returns {string}
 */
export function structureHTML(s, opts = {}) {
  const word = opts.word || ((tok) => escHTML(tok.w));
  const st = withoutMarks(opts.structure || sentenceStructure(s), { hide: opts.hide, clauses: opts.clauses });
  const open = [], close = [];
  for (const c of st.clauses) {
    const name = opts.kinds === false ? "aukasetning" : c.kind;
    (open[c.a] ||= []).push(`<span class="sc-clause"><span class="sc-cname">${escHTML(name)}</span>`);
    (close[c.b] ||= []).unshift("</span>");
  }
  for (const p of st.parts) {
    (open[p.a] ||= []).push(`<span class="sc ${structureClass(p.role)}"><span class="sc-w">`);
    (close[p.b] ||= []).unshift(`</span><span class="sc-name">${escHTML(p.role)}</span></span>`);
  }
  return s.tok.map((tok, j) => {
    const sp = j === 0 || PUNCT.has(tok.w) ? "" : " ";
    return sp + (open[j] || []).join("") + (PUNCT.has(tok.w) ? escHTML(tok.w) : word(tok, j)) + (close[j] || []).join("");
  }).join("");
}
