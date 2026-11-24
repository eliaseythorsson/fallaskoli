// @ts-check
/* The pupil's settings, `S.settings`: XP decay on or off, the glossary, which
 * view of the badge cabinet is showing (`badgeView`, ui/panels.js — a child
 * with nothing on the shelf yet is shown the catalogue instead), and
 * `settingsRev`, the last one-off change made to everybody's settings.
 *
 * A slice of the saved state (core/slices.js), in a module of its own: moved
 * here unchanged from core/state.js `migrate`, core/merge.js `mergeStates`
 * and server/guard.mjs `cleanState` (issue #50).
 */

import { choice, pairs } from "./slicerules.js";

/** @type {import("../types").Slice} */
export const settingsSlice = {
  key: "settings",
  blank: () => ({ decay: false, settingsRev: 1, glossary: true, badgeView: "rarity" }),
  migrate(raw) {
    const settings = settingsSlice.blank();
    if (raw) Object.assign(settings, raw);
    /* Item 55: `settings.audio` was saved as true and never read by anything.
       Dropped from every state that carries it. */
    delete settings.audio;
    /* Item 22: XP decay is off by default now ("N atriði bíða upprifjunar"
       replaces it). Every state saved before had `decay: true`, which was the
       old default and not a choice anybody made, so it is switched off once;
       `settingsRev` records that, and a pupil who then ticks the box again
       (or a teacher who does) keeps it. */
    if (raw && !(raw.settingsRev >= 1)) settings.decay = false;
    return settings;
  },
  /* The child's own switches: whichever device changed them. */
  merge: choice,
  /* Short plain values only. */
  clean(value) {
    const settings = {};
    for (const [k, v] of pairs(value, 30, 40)) {
      if (typeof v === "boolean") settings[k] = v;
      else if (typeof v === "string" && v.length <= 40) settings[k] = v;
      else if (typeof v === "number" && Number.isFinite(v)) settings[k] = v;
    }
    return settings;
  },
  ownText: false,
};
