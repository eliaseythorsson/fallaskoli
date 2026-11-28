// @ts-check
/* The registry: the catalogue joined with its builders.

   What a question type IS — its skill, name, renderer, tags, bands, weight,
   recall and grader — is declared once, in core/catalogue.js, in duel order.
   How it is BUILT is in its category's file: tasks/<skill>.js exports
   `BUILDERS`, one entry per type id:

     build     (lex, view, rng) → { task, effects } or null. Pure: see
               tasks/view.js and tasks/effects.js.
     drill     (optional) (lex, view, rng, entry) → the same, about one given
               word: the form the type takes in a rescue drill.
     ready     (optional) (view) → false when the type can build nothing for
               this pupil whatever the seed (recall: no word in learning,
               tasks/recall.js). tasks/next.js then leaves it out of the
               weighted choice, so it takes no share of the draw: a duel,
               built against a blank pupil, gets from a seed exactly the
               questions it got before the type existed. Cheap and pure.

   This file puts the two together and refuses to start if they disagree: a
   declaration without a builder, a builder without a declaration, or a
   builder in another skill's file (`registryFaults`).

   To add a type: one entry at the END of core/catalogue.js, and its builder
   in tasks/<skill>.js under `BUILDERS`. A renderer in ui/ only if no existing
   one draws its shape. A new skill: an entry in core/skills.js, a file here
   imported below, and the per-skill content tests/skills-checklist.test.js
   asks for. */

import { SKILL_IDS } from "../core/skills.js";
import { CATALOGUE, catalogueFaults } from "../core/catalogue.js";
import { BUILDERS as nafnord } from "./nafnord.js";
import { BUILDERS as lysingarord } from "./lysingarord.js";
import { BUILDERS as sagnord } from "./sagnord.js";
import { BUILDERS as fornofn } from "./fornofn.js";
import { BUILDERS as toluord } from "./toluord.js";
import { BUILDERS as obeygjanleg } from "./obeygjanleg.js";
import { BUILDERS as greining } from "./greining.js";
import { BUILDERS as fallstjorn } from "./fallstjorn.js";
import { BUILDERS as ordaford } from "./ordaford.js";
import { BUILDERS as setningafraedi } from "./setningafraedi.js";
import { BUILDERS as malbeiting } from "./malbeiting.js";
import { BUILDERS as setningagerd } from "./setningagerd.js";

/** @typedef {import("../types").TaskType} TaskType */
/** @typedef {import("../types").Builder} Builder */
/** @typedef {import("../types").View} View */

/** Each category file's builders, by skill.
    @type {Record<string, Record<string, Builder>>} */
const BUILDERS = {
  nafnord, lysingarord, sagnord, fornofn, toluord, obeygjanleg, greining,
  fallstjorn, ordaford, setningafraedi, malbeiting, setningagerd,
};

/** What is wrong with the catalogue and the builders together, as sentences;
    empty when nothing is. Both are read as untrusted (a test passes broken
    ones).
    @param {readonly any[]} [catalogue] @param {Record<string, Record<string, any>>} [builders]
    @returns {string[]} */
export function registryFaults(catalogue = CATALOGUE, builders = BUILDERS) {
  const faults = catalogueFaults(catalogue);
  const declared = new Map(catalogue.filter((t) => t && t.id).map((t) => [t.id, t]));
  const built = new Map();
  for (const [skill, list] of Object.entries(builders)) {
    if (!SKILL_IDS.includes(skill)) faults.push(`tasks/${skill}.js: ${skill} is not a skill`);
    for (const [id, b] of Object.entries(list || {})) {
      const at = `tasks/${skill}.js BUILDERS.${id}`;
      if (built.has(id)) faults.push(`${at}: also built in tasks/${built.get(id)}.js`);
      built.set(id, skill);
      const t = declared.get(id);
      if (!t) faults.push(`${at}: builds a type core/catalogue.js does not declare — add its entry at the end of core/catalogue.js`);
      else if (t.skill !== skill) faults.push(`${at}: the catalogue files ${id} under ${t.skill}, so its builder belongs in tasks/${t.skill}.js`);
      if (!b || typeof b.build !== "function") faults.push(`${at}: no build function`);
      if (b && b.drill != null && typeof b.drill !== "function") faults.push(`${at}: drill is not a function`);
      if (b && b.ready != null && typeof b.ready !== "function") faults.push(`${at}: ready is not a function`);
    }
  }
  for (const t of declared.values()) {
    if (built.has(t.id)) continue;
    faults.push(`core/catalogue.js ${t.id}: declared and has no builder — export one as BUILDERS.${t.id} in tasks/${t.skill}.js` +
      (builders[t.skill] ? "" : `, and import that file's BUILDERS in tasks/registry.js`));
  }
  return faults;
}

{
  /* A catalogue with a hole in it is a programming error, and the place to
     hear about it is here, at once — not as a question type that silently
     never comes up. */
  const faults = registryFaults();
  if (faults.length) throw new Error("tasks/registry.js: " + faults.join("; "));
}

/** Every question type, in catalogue (= duel) order, with its builder.
    @type {readonly Readonly<TaskType>[]} */
export const TASKS = Object.freeze(CATALOGUE.map((t) => {
  const b = BUILDERS[t.skill][t.id];
  return Object.freeze({ ...t, build: b.build, ...(b.drill ? { drill: b.drill } : {}),
    ...(b.ready ? { ready: b.ready } : {}) });
}));

/** The types of each category, in catalogue order.
    @type {Record<string, readonly Readonly<TaskType>[]>} */
export const CATEGORIES = Object.fromEntries(
  SKILL_IDS.map((s) => [s, Object.freeze(TASKS.filter((t) => t.skill === s))]));

const BY_ID = new Map(TASKS.map((t) => [t.id, t]));

/** @type {(id: string) => ?TaskType} */
export const typeById = (id) => BY_ID.get(id) || null;

/** May a question of this type appear? Its own switch, its skill's — or, for
   a type that serves more than one skill (the reverse analysis covers
   adjectives, verbs and nouns), any of them — and its grader: a
   server-graded type only where the policy has server grading on
   (core/policy.js `createPolicy`). A policy-like object without `grader`
   (a test's stand-in) has it off.
   @type {(P: Pick<import("../types").Policy, "type"|"skill"> & {grader?: (g: string) => boolean}, t: Pick<TaskType, "id"|"skill"|"anyOf"|"grader">) => boolean} */
export const enabled = (P, t) =>
  (P.grader ? P.grader(t.grader) : t.grader !== "server") && P.type(t.id) &&
  (t.anyOf ? t.anyOf.some((x) => P.skill(x)) : P.skill(t.skill));

/** The weight of a type as things stand: inside a session or outside one.
    @type {(t: TaskType, view: ?Pick<View, "inRun">) => number} */
export const weightOf = (t, view) =>
  (view && view.inRun && t.weightInRun != null ? t.weightInRun : t.weight);
