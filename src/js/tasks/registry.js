/* The catalogue of question types.

   One file per category (the twelve skills of core/skills.js), and in each
   file a `TYPES` list in which every question type describes itself:

     id        the stable key. The curriculum switch (core/policy.js
               QUESTION_TYPES), the mix rule (core/mix.js), the error
               diagnosis and the saved sessions all know a type by it.
     skill     the category it is filed under — and the file it lives in.
     anyOf     (one type only) the skills it serves; it may appear if any of
               them is switched on.
     weight    how often it is chosen among the types that are on.
               `weightInRun`, if given, replaces it inside a practice session.
     renderer  the key in RENDER (ui/render.js, ui/render-more.js) that draws
               it — the `type` of every task it builds.
     tags      what the error diagnosis can read from one of its questions
               (core/diagnosis.js `tagsOf`): every tag any of its tasks can
               carry.
     bands     the steps of difficulty it knows, on the session's 1–7 scale
               (core/difficulty.js). [1, 3, 4] says: the same questions at
               þyngd 1 and 2, something new from 3, again from 4, and nothing
               new above that. [1] says the type ignores difficulty. (`lvl` on
               the task is not counted: it is a label, not a different
               question.) It says WHERE a type changes, not how much: for
               that, tools/sim/pools.mjs counts the distinct questions per
               band.
     build     (lex, view, rng) → { task, effects } or null. Pure: see
               tasks/view.js and tasks/effects.js.
     drill     (optional) (lex, view, rng, entry) → the same, about one given
               word: the form the type takes in a rescue drill.

   `tags`, `bands` and `renderer` are not notes: tests/registry.test.js builds
   every type at every band and holds each declaration to what was built.

   To add a type: write the builder in its category's file, add it to that
   file's TYPES, give it a place in ORDER below, a line in QUESTION_TYPES
   (core/policy.js) and — if no renderer draws its shape yet — a renderer.
   To work on a category, its file is the only one to open. */

import { SKILL_IDS } from "../core/skills.js";
import { TYPES as NAFNORD } from "./nafnord.js";
import { TYPES as LYSINGARORD } from "./lysingarord.js";
import { TYPES as SAGNORD } from "./sagnord.js";
import { TYPES as FORNOFN } from "./fornofn.js";
import { TYPES as TOLUORD } from "./toluord.js";
import { TYPES as OBEYGJANLEG } from "./obeygjanleg.js";
import { TYPES as GREINING } from "./greining.js";
import { TYPES as FALLSTJORN } from "./fallstjorn.js";
import { TYPES as ORDAFORD } from "./ordaford.js";
import { TYPES as SETNINGAFRAEDI } from "./setningafraedi.js";
import { TYPES as MALBEITING } from "./malbeiting.js";
import { TYPES as SETNINGAGERD } from "./setningagerd.js";

/** The types of each category, as its file declares them. */
export const CATEGORIES = {
  nafnord: NAFNORD, lysingarord: LYSINGARORD, sagnord: SAGNORD, fornofn: FORNOFN,
  toluord: TOLUORD, obeygjanleg: OBEYGJANLEG, greining: GREINING, fallstjorn: FALLSTJORN,
  ordaford: ORDAFORD, setningafraedi: SETNINGAFRAEDI, malbeiting: MALBEITING,
  setningagerd: SETNINGAGERD,
};

/* The order of the catalogue. It is not cosmetic: the weighted choice in
   tasks/next.js walks the list, so the order is part of what a seed MEANS —
   move a line and every duel builds other questions from the same seed. A
   new type goes at the end. */
const ORDER = [
  "fill", "verbslot", "verb", "parse", "revform", "govern", "indecl", "syntax", "clause",
  "tbl_no", "tbl_lo", "tbl_so", "tbl_fn", "tbl_to", "meaning",
  /* v6.9: production */
  "umritun", "smidja", "villur",
  /* v6.11: at least three kinds of question in every category */
  "no_val", "lo_beyging", "lo_stig", "lo_samr", "fn_eyda", "fn_stad", "fn_aftur",
  "to_samr", "to_val", "to_dags", "to_flt", "ob_smella", "ob_fsao", "ob_st", "ob_flokka",
  "gr_smella", "gr_flokka", "fs_fsno", "fs_hreyf", "fs_sogn", "fs_operson",
  "or_heiti", "or_samhengi", "or_myndun", "or_utundan", "setn_hlut", "setn_flokka",
  "gerd_finna", "gerd_upphaf",
  /* item 27: what Lesefni teaches and practice did not ask */
  "fn_flokkar", "no_beyging",
  "so_beyging", "so_mynd", "so_bodhattur",
  /* item 28: years 9 and 10 */
  "gerd_tegund", "setn_lidir", "lid_finna", "raeda",
];

/** What is wrong with the declarations, as sentences; empty when nothing is. */
export function registryFaults(categories = CATEGORIES, order = ORDER) {
  const faults = [];
  const seen = new Map();
  for (const [skill, types] of Object.entries(categories)) {
    if (!SKILL_IDS.includes(skill)) faults.push(`${skill}: not a skill`);
    for (const t of types) {
      const at = `${skill}.js ${t.id}`;
      if (seen.has(t.id)) faults.push(`${at}: also declared in ${seen.get(t.id)}.js`);
      seen.set(t.id, skill);
      if (t.skill !== skill) faults.push(`${at}: filed under ${t.skill}`);
      if (t.anyOf && !t.anyOf.includes(t.skill)) faults.push(`${at}: anyOf leaves out its own skill`);
      if (!(typeof t.weight === "number" && t.weight > 0)) faults.push(`${at}: no weight`);
      if (typeof t.renderer !== "string" || !t.renderer) faults.push(`${at}: no renderer`);
      if (!Array.isArray(t.tags)) faults.push(`${at}: no tags`);
      if (!Array.isArray(t.bands) || t.bands[0] !== 1 ||
          t.bands.some((b, k) => !Number.isInteger(b) || b < 1 || b > 7 || (k && b <= t.bands[k - 1])))
        faults.push(`${at}: bands must be rising whole numbers from 1 to 7, starting at 1`);
      if (typeof t.build !== "function") faults.push(`${at}: no builder`);
      if (!order.includes(t.id)) faults.push(`${at}: has no place in ORDER`);
    }
  }
  order.forEach((id, k) => {
    if (!seen.has(id)) faults.push(`ORDER names ${id}, which no category declares`);
    if (order.indexOf(id) !== k) faults.push(`ORDER names ${id} twice`);
  });
  return faults;
}

/* A catalogue with a hole in it is a programming error, and the place to hear
   about it is here, at once — not as a question type that silently never
   comes up. */
const faults = registryFaults();
if (faults.length) throw new Error("tasks/registry.js: " + faults.join("; "));

const BY_ID = new Map(Object.values(CATEGORIES).flat().map((t) => [t.id, t]));

/** Every question type, in catalogue order. */
export const TASKS = Object.freeze(ORDER.map((id) => Object.freeze(BY_ID.get(id))));

export const typeById = (id) => BY_ID.get(id) || null;

/* Some types serve more than one skill (the reverse analysis covers
   adjectives, verbs and nouns) and may appear if any of them is on. */
export const enabled = (P, t) =>
  P.type(t.id) &&
  (t.anyOf ? t.anyOf.some((x) => P.skill(x)) : P.skill(t.skill));

/** The weight of a type as things stand: inside a session or outside one. */
export const weightOf = (t, view) =>
  (view && view.inRun && t.weightInRun != null ? t.weightInRun : t.weight);
