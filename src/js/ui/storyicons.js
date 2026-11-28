/* The six story-map icons (issue #31): one simple line drawing for each part
   of core/storymap.js, defined here once and used wherever the program shows
   a story's parts — the story-map questions of Lesskilningur, the Lesefni
   page, and Frásögn's questions to come (#35, #36, #40).

   Original drawings, inline SVG on a 24×24 grid, drawn in `currentColor` so
   they take the colour of the text around them (light, dark, blackboard).

     aðstæður   a house: who, where, when
     vandi      a bolt of lightning: something happens
     markmið    a target: what the character wants
     tilraun    steps going up: what the character does
     útkoma     a flag at the finish: how it ends
     viðbrögð   a face: how the character feels

   An icon beside its written name is decoration (`aria-hidden`); an icon on
   its own carries the name as its label (`{ label: true }`), so a screen
   reader says "Vandi" and a mouse shows it on hover. */

import { STORY_PARTS, storyPart } from "../core/storymap.js";
import { esc } from "./dom.js";

/** The strokes of each icon. */
const DRAW = {
  "aðstæður": '<path d="M3 11 12 3l9 8"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
  "vandi": '<path d="M13 2 4 14h7l-1 8 10-13h-7l0-7z"/>',
  "markmið": '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/>',
  "tilraun": '<path d="M3 20h5v-5h5v-5h5V5h3"/><path d="M15 3l3 2-3 2"/>',
  "útkoma": '<path d="M5 21V3"/><path d="M5 4h13l-3 4.5 3 4.5H5"/>',
  "viðbrögð": '<circle cx="12" cy="12" r="9"/><circle cx="9" cy="10" r="1" fill="currentColor"/><circle cx="15" cy="10" r="1" fill="currentColor"/><path d="M8 15c2.2 2.4 5.8 2.4 8 0"/>',
};

/** The icon of a story-map part as an inline SVG. Unknown part: "".
    @param {string} id @param {{ label?: boolean }} [o] */
export function storyIconHTML(id, { label = false } = {}) {
  const part = storyPart(id);
  if (!part || !DRAW[id]) return "";
  const a11y = label ? `role="img" aria-label="${esc(part.nm)}"` : `aria-hidden="true" focusable="false"`;
  return `<svg class="storyicon" data-part="${esc(id)}" viewBox="0 0 24 24" width="1.25em" height="1.25em" ` +
    `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${a11y}>` +
    `${label ? `<title>${esc(part.nm)}</title>` : ""}${DRAW[id]}</svg>`;
}

/** The icon and the name together: a button's face, a heading. */
export const storyPartHTML = (id) => {
  const part = storyPart(id);
  return part ? `<span class="storypart">${storyIconHTML(id)}<span>${esc(part.nm.toLowerCase())}</span></span>` : esc(id);
};

/** The whole map: the six icons, names and the question each answers (the
    Lesefni page). */
export const storyMapHTML = () => `<ol class="storymap">${STORY_PARTS.map((p) =>
  `<li>${storyIconHTML(p.id)}<b>${esc(p.nm)}</b>${p.also ? ` <span class="faint">(${esc(p.also)})</span>` : ""}` +
  `<span class="storyask">${esc(p.ask)}</span></li>`).join("")}</ol>`;

/** A story as lines, one sentence each (Frásögn, issue #35). A line
    `{ gap: true }` is where a sentence was taken out; with `p` the gap shows
    its part's icon, labelled. A line `{ t, blank: true }` (issue #36) is a
    sentence with one word or phrase missing, ___ in its text.
    @param {{ t?: string, p?: string, gap?: boolean, blank?: boolean }[]} lines */
export const storyLinesHTML = (lines) => `<ol class="storylines">${lines.map((l) => (l.gap
  ? `<li class="storygap">${l.p ? storyIconHTML(l.p, { label: true }) + " " : ""}<span class="gapmark">Hér vantar setningu</span></li>`
  : l.blank /* issue #36: a word missing inside the sentence, ___ in its text */
    ? `<li class="storyblank">${esc(l.t || "").split("___").join('<span class="blank">?</span>')}</li>`
    : `<li>${esc(l.t || "")}</li>`)).join("")}</ol>`;

/** The whole story, in its order, each sentence with its part's icon: shown
    when a Frásögn question has been answered and at the end of a session
    with Frásögn in it (CONTEXT.md "Frásögn session").
    @param {{ t: string, p: string }[]} story */
export const wholeStoryHTML = (story) => `<div class="why wholestory"><b>sagan í heild</b><ol class="storylines">${story
  .map((l) => `<li>${storyIconHTML(l.p, { label: true })} ${esc(l.t)}</li>`).join("")}</ol></div>`;

/** For tests and tools: which parts have a drawing. */
export const ICON_PARTS = Object.freeze(Object.keys(DRAW));
