/* Choosing the next question.

   Pure like the builders it calls: it reads the view, draws from `rng`, and
   returns the task with the effects of showing it. It may be called any
   number of times for one question (core/diagnosis.js `pickTargeted` builds
   several candidates); nothing is used up by the ones that are thrown away. */

import { mixGate } from "../core/mix.js";
import { built, FX } from "./effects.js";
import { withView } from "./view.js";
import { wpick } from "./shared.js";
import { TASKS, typeById, enabled, weightOf } from "./registry.js";

/**
 * A built question as the session will show it: its type written on it, and
 * the effects of showing it completed with what the session knows afterwards
 * — how long since a table and since a meaning question, and the words it
 * has met (tasks/shared.js `wordWeight` makes them rarer for a while).
 */
function shown(type, b, after = []) {
  if (!b) return null;
  const { task } = b;
  task.typeId = type.id;
  const words = [task.n, task.w, task.v].filter(Boolean).map((x) => x.o);
  return built(task, [
    ...b.effects,
    FX.since(type.id.startsWith("tbl"), type.id === "meaning"),
    ...(words.length ? [FX.seen(words)] : []),
    ...after,
  ]);
}

/**
 * Build one question of a GIVEN type: { task, effects } or null. The same
 * thing `nextTask` returns once it has chosen the type — for a caller that
 * already knows which type it wants. A duel does (core/duel.js): the types
 * come from the duel's plan, and each player is built their own question of
 * each. Nothing is checked here but that the type exists; whether it is
 * switched on was the plan's business.
 */
export function buildTask(lex, view, rng, typeId) {
  const type = typeById(typeId);
  return type ? shown(type, type.build(lex, view, rng)) : null;
}

/**
 * Choose and build the next task: { task, effects } or null.
 * Only enabled skills can appear; a builder that cannot produce a good
 * question returns null and is skipped rather than guessing.
 */
export function nextTask(lex, view, rng) {
  const { sess } = view;
  /* A noun waiting to be asked again (a wrong cloze) has its turn now,
     whatever comes out — in the cloze if a sentence accepts it, and otherwise
     it is let go. */
  const after = view.forcedNoun ? [FX.clearForcedNoun()] : [];
  if (view.forcedNoun) {
    const b = typeById("fill").build(lex, view, rng);
    if (b) { b.task.typeId = "fill"; return built(b.task, [...b.effects, ...after]); }
    view = withView(view, { forcedNoun: null });
  }
  const P = view.policy;
  const all = TASKS.filter((t) => enabled(P, t) && weightOf(t, view) > 0);
  if (!all.length) return null;
  /* v6.11: inside a session, the mix rule (core/mix.js) — at least three
     kinds of question, none over ~40%, tables over 30%, analysis over 35%.
     If nothing the rule allows can be built, the rule gives way: a session
     with a question is better than one without. */
  const gate = mixGate(view.mix, all.map((t) => t.id));
  const gated = gate ? all.filter((t) => gate.has(t.id)) : all;
  const avail = gated.length ? gated : all;

  /* Orðaforði has one question type against two to four for the grammar
     skills, so a fixed weight drowned it once several skills were on. Its
     weight is now the average share of the OTHER enabled skills, so it comes
     up as often as a typical skill does, however many are switched on. */
  const skillOf = (t) => (t.anyOf ? t.anyOf.find((x) => P.skill(x)) : t.skill);
  const perSkill = {};
  avail.forEach((t) => {
    if (t.id === "meaning") return;
    const k = skillOf(t);
    perSkill[k] = (perSkill[k] || 0) + weightOf(t, view);
  });
  const shares = Object.values(perSkill);
  /* ×1.3: the spacing rule (one showing per word, then a wait) turns some of
     its turns down, and they go to other skills. Measured over 1,500 questions
     this lands Orðaforði at or a little above the average skill. */
  const meaningW = shares.length ? 1.3 * shares.reduce((a, b) => a + b, 0) / shares.length : 4;

  const tried = new Set();
  for (let k = 0; k < 40; k++) {
    const choice = wpick(avail, (t) => {
      let w = t.id === "meaning" ? meaningW : weightOf(t, view);
      /* tables and definitions should come in gaps, not in clusters */
      if (t.id.startsWith("tbl") && sess.sinceTable < 4) w *= 0.15;
      if (t.id === "meaning" && sess.sinceMeaning < 2) w *= 0.1;
      return w;
    }, rng);
    if (tried.has(choice.id) && tried.size < avail.length) continue;
    tried.add(choice.id);
    const b = shown(choice, choice.build(lex, view, rng), after);
    if (b) return b;
  }

  /* The last resort walks only the builders that ARE available and returns
     null if nothing is possible. No material beats material switched off. */
  for (const t of [...avail, ...all.filter((x) => !avail.includes(x))]) {
    const b = t.build(lex, view, rng);
    if (b) { b.task.typeId = t.id; return built(b.task, [...b.effects, ...after]); }
  }
  return null;
}
