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
import { bandOf, diffOf, clamp, MIN, MAX } from "../core/difficulty.js";
import { typeShift } from "../core/calibration.js";

/* ---------- calibration (critique item 17, core/calibration.js) -----------
 *
 * The table says of some types that pupils at a certain level find them
 * harder, or easier, than the other questions asked at that level. Such a
 * type is built from a view in which the level stands a step lower or higher
 * — a COPY of the session with the levels changed, so the builder stays what
 * it is and the pupil's real level is untouched. Every skill is looked up at
 * its own level: a type is filed under one skill and may build for another
 * (the cloze is a noun type and also asks adjectives and pronouns), and the
 * count is kept by the level of the skill the question was built for
 * (`markForCount`). The shifted level stays inside the skill's range
 * (core/difficulty.js `levelRanges`), so a skill that may not move does not,
 * and a level the policy forbids is not reached.
 *
 * Without a table on the view (a duel, a drill, a review, a program with no
 * server) nothing here does anything. */
function viewForType(view, t) {
  if (!view.cal) return view;
  const diff = { ...view.sess.diff };
  let moved = false;
  if (!view.cal.types || !view.cal.types[t.id]) return view;
  for (const skill of Object.keys(view.sess.diff)) {
    const s = typeShift(view.cal, t.id, bandOf(view.sess, skill));
    if (!s) continue;
    const [lo, hi] = (view.sess.range && view.sess.range[skill]) || [MIN, MAX];
    const to = clamp(diffOf(view.sess, skill) + s, lo, Math.max(lo, hi));
    if (to !== diff[skill]) { diff[skill] = to; moved = true; }
  }
  return moved ? withView(view, { sess: { ...view.sess, diff } }) : view;
}

/** The view a type is built from: calibrated, and knowing which type it is
    building (`typeId`, tasks/view.js). */
const viewFor = (view, t) => withView(viewForType(view, t), { typeId: t.id });

/** Mark a task of ordinary practice as one whose answer may be counted, with
    the level its skill REALLY stood at (not the shifted one): the table is
    keyed by where the pupil is, and says what to build for them there. */
function markForCount(view, task) {
  if (view.cal && !view.force && !view.askedWord() && task.skill)
    task.calBand = bandOf(view.sess, task.skill);
}

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
    FX.last(task),
    ...after,
  ]);
}

/* The spacing rule (#10, tasks/view.js): never the same word in the same
   type as the question just shown. The builders that choose by word leave
   that word out already (`pickByWord`); one that chooses a sentence or an
   item first may still land on it, and is built again — a few times, so that
   the type keeps its turn — before it is given up. Draws more numbers only
   when a build is turned down, so a seed means what it meant whenever the
   rule has nothing to say. */
const SPACING_TRIES = 4;
function buildSpaced(lex, view, rng, t, v = viewFor(view, t)) {
  for (let k = 0; k < SPACING_TRIES; k++) {
    const b = t.build(lex, v, rng);
    if (!b || !v.repeatsLast({ ...b.task, typeId: t.id })) return b;
  }
  return null;
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
  return type ? shown(type, type.build(lex, withView(view, { typeId: type.id }), rng)) : null;
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
  const retry = view.retryWord();
  const after = retry ? [FX.clearForcedNoun()] : [];
  if (retry) {
    const b = buildSpaced(lex, view, rng, typeById("fill"), withView(view, { typeId: "fill" }));
    if (b) { b.task.typeId = "fill"; return built(b.task, [...b.effects, FX.last(b.task), ...after]); }
    view = withView(view, { mustAsk: null });
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
  /* ×1.3: measured over 1,500 questions in v6.11, when a wait of days
     after each showing turned some of its turns down, this landed Orðaforði
     at or a little above the average skill. The wait is gone (#10); the
     factor is kept until the meaning question's share is set (DLD-PLAN §1). */
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
    const b = shown(choice, buildSpaced(lex, view, rng, choice), after);
    if (b) { markForCount(view, b.task); return b; }
  }

  /* The last resort walks only the builders that ARE available and returns
     null if nothing is possible. No material beats material switched off. */
  for (const t of [...avail, ...all.filter((x) => !avail.includes(x))]) {
    const b = buildSpaced(lex, view, rng, t);
    if (b) {
      b.task.typeId = t.id; markForCount(view, b.task);
      return built(b.task, [...b.effects, FX.last(b.task), ...after]);
    }
  }
  return null;
}
