/* Duels (v6.7): one child challenges another in the same group to 10, 20 or
   30 questions on one topic. Each answers on their own, whenever they like
   within 24 hours; the server compares the two scores.

   This module is pure and shared: the server uses the rules (who may be
   challenged, when a duel is over, who won, how hard it is), the browser uses
   the same rules plus the question generator. Nothing here touches the DOM,
   the network or the clock except through arguments.

   THE SAME QUESTIONS FOR BOTH. The server stores a random seed; each browser
   builds the duel's questions from that seed against a BLANK history (no
   child's own word weights, no curriculum switches, always the filtered
   vocabulary), so two browsers with the same data build the same questions.
   A short signature of the questions travels with each result, so a mismatch
   would show instead of passing unnoticed.                                  */

import { SKILLS } from "./skills.js";
import { skillLevel, skillNeed } from "./progress.js";
import { clamp } from "./difficulty.js";

export const DUEL = {
  sizes: [10, 15, 20],      // as practice sessions (ui/session.js RUN_SIZES)
  /** From the moment of the challenge, for BOTH players. */
  hours: 24,
  /** Open duels a user may be part of at once — the only limit there is. */
  maxOpen: 10,
  /** Finished duels are kept this long, so a device that was away can still
      collect the result; then they are deleted. Void ones go at once. */
  keepDays: 30,
  /** XP on top of the answers' own: for finishing, and for winning. */
  xpPlay: 20, xpWin: 30, xpTie: 15,
};

/** The topics: every skill with right and wrong answers, and a mix of them. */
export const DUEL_TOPICS = [
  ...SKILLS.filter((s) => s.id !== "ordaford").map((s) => ({ id: s.id, nm: s.nm, ico: s.ico })),
  { id: "blandad", nm: "Blandað", ico: "🎲" },
];
const TOPIC_IDS = new Set(DUEL_TOPICS.map((t) => t.id));
export const topicName = (id) => (DUEL_TOPICS.find((t) => t.id === id) || {}).nm || id;
export const validTopic = (id) => TOPIC_IDS.has(id);
export const validSize = (n) => DUEL.sizes.includes(n);
export const skillsOf = (topic) => (topic === "blandad"
  ? DUEL_TOPICS.filter((t) => t.id !== "blandad").map((t) => t.id) : [topic]);

/**
 * The skills a duel may ask about: the topic's, less any that either player
 * has switched off or is not allowed (v6.10 — Year-9 topics were duelled by
 * 8th graders). `pa`/`pb` are the two players' effective policies (or null).
 */
export const duelSkills = (topic, pa, pb) =>
  skillsOf(topic).filter((id) => (!pa || pa.skill(id)) && (!pb || pb.skill(id)));

/* ---------- difficulty --------------------------------------------------- */

/** A player's level in a topic: the skill's level, or the mean over a mix. */
export function topicLevel(S, topic) {
  const ids = skillsOf(topic);
  const sum = ids.reduce((a, id) => a + skillLevel(((S && S.skills && S.skills[id]) || {}).xp || 0).level, 0);
  return sum / ids.length;
}

/**
 * The level a duel is played at: the mean of the two players' levels in the
 * topic. One number, worked out by the server when the duel is made, and
 * from then on fixed — practising in the meantime does not change the duel.
 */
export const duelLevel = (Sa, Sb, topic) =>
  Math.round(((topicLevel(Sa, topic) + topicLevel(Sb, topic)) / 2) * 10) / 10;

/**
 * Level → the session difficulty (1-7) the builders read. Never below 2.5:
 * a duel between two beginners is still not on the very easiest sentences.
 */
export const duelDifficulty = (level) => clamp(1.5 + 0.35 * ((level || 1) - 1), 2.5, 5);

/* ---------- the state of one duel ------------------------------------------ */

/*  A duel as the server stores it:
 *    { id, a, b,               challenger and challenged (user ids)
 *      topic, n, seed, level,  what is asked
 *      data,                   the data fingerprint the questions come from
 *      created, deadline,      ms since 1970
 *      res: { a: {c, n, sig, at} | null, b: … } }                            */

/** "open" | "done" | "void" at time `now` (ms). */
export function duelStatus(d, now) {
  const ra = d.res && d.res.a, rb = d.res && d.res.b;
  if (ra && rb) return "done";
  if (now < d.deadline) return "open";
  return ra || rb ? "done" : "void";
}

/** When a finished duel finished: the second result, or the deadline. */
export function finishedAt(d) {
  const ra = d.res && d.res.a, rb = d.res && d.res.b;
  return ra && rb ? Math.max(ra.at || 0, rb.at || 0) : d.deadline;
}

/** For side "a" or "b" of a finished duel: "w" | "l" | "t", or null if open. */
export function outcomeFor(d, side, now) {
  if (duelStatus(d, now) !== "done") return null;
  const me = d.res[side], them = d.res[side === "a" ? "b" : "a"];
  if (me && !them) return "w";            // they did not answer in time
  if (!me && them) return "l";            // I did not
  const mine = me.c / (me.n || 1), theirs = them.c / (them.n || 1);
  if (me.c !== them.c && me.n === them.n) return me.c > them.c ? "w" : "l";
  if (mine !== theirs) return mine > theirs ? "w" : "l";
  return "t";
}

/** Which side `userId` is on, or null. */
export const sideOf = (d, userId) => (d.a === userId ? "a" : d.b === userId ? "b" : null);

/** Open duels this user is part of. */
export const openCount = (duels, userId, now) =>
  duels.filter((d) => sideOf(d, userId) && duelStatus(d, now) === "open").length;

/**
 * The tidy-up the server runs before every read and write: void duels are
 * deleted at once, finished ones after `keepDays`. Returns the list to keep.
 */
export function prune(duels, now) {
  const keep = DUEL.keepDays * 86400000;
  return duels.filter((d) => {
    const st = duelStatus(d, now);
    if (st === "void") return false;
    if (st === "done" && now - finishedAt(d) > keep) return false;
    return true;
  });
}

/**
 * What one user is shown of one duel. The other player's score is withheld
 * until this user has answered or the duel is over — knowing the number to
 * beat would make the second player's duel a different game.
 */
export function viewFor(d, userId, names, now) {
  const side = sideOf(d, userId);
  if (!side) return null;
  const other = side === "a" ? "b" : "a";
  const status = duelStatus(d, now);
  const mine = d.res[side], theirs = d.res[other];
  const pub = (r) => (r ? { c: r.c, n: r.n } : null);
  return {
    id: d.id, side, challenger: side === "a",
    opponent: { id: d[other], name: names[d[other]] || "?" },
    topic: d.topic, n: d.n, seed: d.seed, level: d.level, data: d.data,
    ...(d.skills ? { skills: d.skills } : {}),
    created: d.created, deadline: d.deadline, status,
    mine: pub(mine),
    theirs: mine || status === "done" ? pub(theirs) : null,
    theyPlayed: !!theirs,
    outcome: outcomeFor(d, side, now),
    sameQuestions: mine && theirs && mine.sig && theirs.sig ? mine.sig === theirs.sig : null,
  };
}

/* ---------- the questions -------------------------------------------------- */

/** A fingerprint of the data the questions are built from: the bundle
    (data/data_bundle.js), which the server and the browser both import. */
export function dataPrint(DATA) {
  const words = DATA && DATA.lex ? Object.keys(DATA.lex).length : 0;
  const text = JSON.stringify([(DATA && DATA.sent || []).map((s) => s.text || s.t || "").join("|"),
    (DATA && DATA.blocked) || [], words]);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

/** mulberry32: small, fast, and the same on every machine. */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A short signature of a list of questions: same questions, same string. */
export function signature(tasks) {
  const text = tasks.map((t) => [t.typeId, t.word || "", t.s ? t.s.id ?? t.s.text ?? "" : "",
    t.i ?? "", t.m || t.cell || "", (t.cells || []).map((c) => c.m).join(",")].join("~")).join("|");
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36) + "." + tasks.length;
}

/**
 * The duel's questions. `deps` carries what lives elsewhere, so this module
 * stays free of the task builders: { nextTask, makeView, applyEffects,
 * blankState, newSession, createPolicy }.
 *
 * The random source is the seeded generator, handed to the builders as their
 * `rng`. Until v6.13 Math.random itself was swapped for it while the questions
 * were built; that worked only because nothing else ran in between, and would
 * have broken without a sound the day a builder became asynchronous or a
 * library drew a number of its own. Now nothing global is touched, and no
 * builder can reach Math.random (tests/purity.test.js).
 *
 * The builders are pure (tasks/view.js), so the private state the duel is
 * built against moves on only through the effects of each question as it is
 * taken — exactly what a practice session does when it shows one.
 */
export function duelTasks(lex, duel, deps) {
  const { nextTask, makeView, applyEffects, blankState, newSession, createPolicy } = deps;
  const S = blankState();
  const on = new Set(Array.isArray(duel.skills) && duel.skills.length ? duel.skills : skillsOf(duel.topic));
  const skills = {};
  SKILLS.forEach((s) => { skills[s.id] = on.has(s.id); });
  S.policy = { skills, types: {}, levels: {}, attrs: {}, safeVocab: null };
  /* The level shapes word choice (rarer words higher up) through the skill's
     XP, and sentence length through the session difficulty. */
  const L = Math.max(1, Math.round(duel.level || 1));
  on.forEach((id) => { S.skills[id].xp = skillNeed(L); });
  const sess = newSession(S);
  const D = duelDifficulty(duel.level);
  Object.keys(sess.diff).forEach((k) => { sess.diff[k] = D; });
  const host = { S, sess, forcedNoun: null };
  const policy = createPolicy(null, S.policy);
  /* The day is part of the view; a duel has none of its own. A fixed one, so
     that a duel built a minute before midnight and one built a minute after
     are the same duel. */
  const today = "2000-01-01";

  const rng = seeded(duel.seed);
  const out = [];
  for (let k = 0; k < duel.n * 3 && out.length < duel.n; k++) {
    const b = nextTask(lex, makeView({ S, sess, policy, today, forcedNoun: host.forcedNoun }), rng);
    if (!b) break;
    /* Taken, whether or not it is kept: a question with no right answer has
       no place in a duel, but it has been drawn and must not come again. */
    applyEffects(host, b.effects);
    const t = b.task;
    if (t.counts === false) continue;      // no right answer, no place in a duel
    t.duel = true;
    out.push(t);
  }
  return out;
}

/* ---------- this device's side of a result --------------------------------- */

/** Totals over the settled duels in a state: { played, wins, losses, ties }.
    "f" is a duel lost by not answering in time — not played. */
export function duelTotals(S) {
  const v = Object.values((S && S.duels) || {});
  return {
    played: v.filter((x) => x === "w" || x === "l" || x === "t").length,
    wins: v.filter((x) => x === "w").length,
    losses: v.filter((x) => x === "l" || x === "f").length,
    ties: v.filter((x) => x === "t").length,
  };
}

/**
 * Write every newly finished duel in `views` (from GET /duels) into the state,
 * once. Returns one entry per duel settled now: { view, outcome, xp, perfect }.
 * The XP is for the caller to grant; `S.duels[id]` is what makes it once.
 */
export function settleDuels(S, views) {
  const book = (S.duels ||= {});
  const out = [];
  for (const v of views || []) {
    if (!v || !v.outcome || book[v.id]) continue;
    const played = !!v.mine;
    const outcome = !played ? "f" : v.outcome;
    book[v.id] = outcome;
    const xp = !played ? 0
      : DUEL.xpPlay + (outcome === "w" ? DUEL.xpWin : outcome === "t" ? DUEL.xpTie : 0);
    out.push({ view: v, outcome, xp, perfect: played && v.mine.c === v.mine.n && v.mine.n > 0 });
  }
  return out;
}
