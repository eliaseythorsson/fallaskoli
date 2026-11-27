// @ts-check
/* The story map: MAIN's six parts of an episode (issue #31,
   docs/DLD-PLAN.md §4 and §5, CONTEXT.md "Story map").

   Defined ONCE here, for every question that speaks of a story's parts —
   Lesskilningur's story-map questions now, Frásögn's later (#35, #36, #40).
   The ids are the marks a text file uses (pipeline/content_io.py
   STORY_PARTS, in the same order; tests/storymap.test.js holds the two
   together); the six icons that go with them are drawn by ui/storyicons.js.

     id    the part, as a text's sentences carry it (`p` in EX.textar)
     nm    its name, as the pupil reads it beside the icon
     also  the other name a writer may use for it (kveikja, tilfinning)
     acc   the name with the article, in the accusative ("passar ekki við
           útkomuna")
     ask   the question the part answers: what a pupil asks of a sentence
           to place it                                                    */

/** @typedef {{ id: string, nm: string, also: ?string, acc: string, ask: string }} StoryPart */

/** @type {readonly StoryPart[]} */
export const STORY_PARTS = Object.freeze([
  { id: "aðstæður", nm: "Aðstæður", also: null, acc: "aðstæðurnar", ask: "Hver? Hvar? Hvenær?" },
  { id: "vandi", nm: "Vandi", also: "kveikja", acc: "vandann", ask: "Hvað gerist? Hvaða vandi kemur upp?" },
  { id: "markmið", nm: "Markmið", also: null, acc: "markmiðið", ask: "Hvað vill persónan?" },
  { id: "tilraun", nm: "Tilraun", also: null, acc: "tilraunina", ask: "Hvað gerir persónan?" },
  { id: "útkoma", nm: "Útkoma", also: null, acc: "útkomuna", ask: "Hvernig fer?" },
  { id: "viðbrögð", nm: "Viðbrögð", also: "tilfinning", acc: "viðbrögðin", ask: "Hvernig líður persónunni á eftir?" },
].map((p) => Object.freeze(p)));

/** The six ids, in story order. */
export const STORY_PART_IDS = Object.freeze(STORY_PARTS.map((p) => p.id));

/** What a wrong summary may break besides a part: the order of events. */
export const ORDER_BREAK = "röð";

/** @type {(id: string) => ?StoryPart} */
export const storyPart = (id) => STORY_PARTS.find((p) => p.id === id) || null;

/** Why a wrong summary does not follow the map, from what the text file
    says it breaks (a part, or röð).
    @type {(brot: string) => string} */
export const breakNote = (brot) => (brot === ORDER_BREAK
  ? "Í þessari samantekt gerast hlutirnir í annarri röð en í sögunni."
  : `Þessi samantekt passar ekki við **${(storyPart(brot) || { acc: brot }).acc}** í sögunni.`);
