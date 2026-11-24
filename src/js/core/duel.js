/* Duels (v6.7): one child challenges another in the same group to 10, 15 or
   20 questions on one topic. Each answers on their own, whenever they like
   within 24 hours; the server compares the two scores.

   This module is pure and shared: the server uses the rules (who may be
   challenged, when a duel is over, who won, how hard it is), and both the
   server and the browser use the question generator. Nothing here touches
   the DOM, the network or the clock except through arguments.

   v6.13 changed three things, and they hang together:

   THE SERVER GRADES (critique item 62). The browser used to post "c right of
   n" and was believed. Now it posts the answers; the server builds the same
   questions from the same seeds (`duelTasks`) and judges them with the same
   code (core/answer.js). `gradeDuel` below is that step.

   EQUAL QUESTIONS, NOT THE SAME ONES (item 63). Both players used to get the
   same questions and had a day to answer, so the first could tell the second
   the answers. Now the duel's seed makes a PLAN — which type of question,
   at which level, about which inflection cell, in which order — and each
   player is built their own question for every line of it, from their own
   seed, about other words and other sentences (`duelTasks`, `halfOf`).

   A FAIR RESULT BETWEEN UNEQUAL PLAYERS (item 66). A duel is played at the
   mean of the two players' levels, which suits the stronger one. The player
   on the lower level is therefore given a few right answers in advance — a
   handicap, *forgjöf* (`handicap`).

   Every duel is built against a BLANK history (no child's own word weights,
   no curriculum switches, always the filtered vocabulary), so the server and
   a browser with the same data build the same questions. A short signature
   of the questions travels with the answers; if it is not the server's own,
   nothing is graded and the pupil is asked to reload.                      */

import { SKILLS } from "./skills.js";
import { skillLevel, skillNeed } from "./progress.js";
import { clamp } from "./difficulty.js";
import { narrowPolicy } from "./policy.js";
import { obj, pairs } from "./slicerules.js";

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
  /** The handicap (`handicap` below): none while the players are within
      `free` levels of each other; beyond that `perLevel` of the questions
      for every level between them, and never more than `cap` of them. */
  fair: { free: 1, perLevel: 0.05, cap: 0.3 },
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

/* ---------- a fair result between unequal players (item 66) ----------------
 *
 * The duel is played at the mean of the two levels: easier than the stronger
 * player's own practice, harder than the weaker one's. With nothing done
 * about it the stronger player wins every time, and the weaker one learns
 * not to accept.
 *
 * So each is measured against what can be expected of them. The questions
 * sit `gap / 2` levels above one player and as far below the other; we take
 * a level to be worth `perLevel` of the questions, which makes the expected
 * difference between the two `n × perLevel × gap` right answers. The player
 * on the lower level is given that many in advance, in whole answers,
 * because a child must be able to check the sum on the screen: "7 rétt + 2 í
 * forgjöf = 9".
 *
 * Within one level (`free`) nothing is given: the levels are not that exact,
 * and the critique's own remedy was to pair players within one level. The
 * cap keeps a beginner from beating an expert by answering three questions.
 *
 * `perLevel` is a judgement, not a measurement — there is no data yet on how
 * much one level is worth in a duel. It is one number, here, to change when
 * there is.
 */

/** A duel's handicap: the right answers each side is given in advance —
    `{ a, b }`, one of them 0 and usually both. `d.lv` holds the two players'
    levels in the topic when the duel was made; a duel without it (made
    before v6.13) has none. */
export function handicap(d) {
  const lv = d && d.lv;
  const out = { a: 0, b: 0 };
  if (!lv || !Number.isFinite(lv.a) || !Number.isFinite(lv.b)) return out;
  const gap = Math.abs(lv.a - lv.b);
  const { free, perLevel, cap } = DUEL.fair;
  if (gap <= free) return out;
  const n = d.n || 0;
  const h = Math.min(Math.floor(n * cap), Math.max(1, Math.round(n * perLevel * gap)));
  out[lv.a < lv.b ? "a" : "b"] = h;
  return out;
}

/* ---------- the state of one duel ------------------------------------------ */

/*  A duel as the server stores it:
 *    { id, a, b,               challenger and challenged (user ids)
 *      topic, n, level,        what is asked
 *      seed,                   makes the plan both players share
 *      keys: { a, b },         each player's own seed, for their own questions
 *      lv: { a, b },           each player's level in the topic at the challenge
 *      data,                   the data fingerprint the questions come from
 *      created, deadline,      ms since 1970
 *      started: { a, b },      when each first fetched their questions, or absent
 *      res: { a: {c, n, at} | null, b: … } }   c and n as the SERVER graded them
 *
 *  The answers themselves are not kept: they are graded and dropped.        */

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
  /* Right answers plus the handicap (item 66). Both sides have the same n —
     the server counts every question, answered or not — and the share is
     compared only for the sake of results stored before that was so. */
  const h = handicap(d), other = side === "a" ? "b" : "a";
  const mp = me.c + h[side], tp = them.c + h[other];
  if (mp !== tp && me.n === them.n) return mp > tp ? "w" : "l";
  const mine = mp / (me.n || 1), theirs = tp / (them.n || 1);
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
 *
 * The seeds are NOT here (v6.13). A browser that has the seed has the
 * questions and their answers, so it gets them only when the pupil presses
 * play (POST /duels/:id/start), never with the list.
 */
export function viewFor(d, userId, names, now) {
  const side = sideOf(d, userId);
  if (!side) return null;
  const other = side === "a" ? "b" : "a";
  const status = duelStatus(d, now);
  const mine = d.res[side], theirs = d.res[other];
  const pub = (r) => (r ? { c: r.c, n: r.n } : null);
  const h = handicap(d);
  return {
    id: d.id, side, challenger: side === "a",
    opponent: { id: d[other], name: names[d[other]] || "?" },
    topic: d.topic, n: d.n, level: d.level, data: d.data,
    ...(d.skills ? { skills: d.skills } : {}),
    created: d.created, deadline: d.deadline, status,
    mine: pub(mine),
    theirs: mine || status === "done" ? pub(theirs) : null,
    theyPlayed: !!theirs,
    /* Right answers given in advance (item 66) — known from the start, so
       that nobody is surprised by the sum at the end. */
    handicap: { mine: h[side], theirs: h[other] },
    outcome: outcomeFor(d, side, now),
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

/** A short signature of a list of questions: same questions, same string.
    It is what tells the server that the browser asked what the server is
    about to grade, so it reads everything that makes a question this
    question: its shape, its word and sentences, the place asked about, and
    the answer. */
export function signature(tasks) {
  const text = tasks.map((t) => [shapeKey(t), contentKeys(t).main.join("^"), t.word || "", t.i ?? "",
    t.answer ?? "", (t.answers || []).join(",")].join("~")).join("|");
  return fnv(text).toString(36) + "." + tasks.length;
}

/* ---- the plan, and each player's own questions (item 63) ------------------
 *
 * `deps` carries what lives elsewhere, so this module stays free of the task
 * builders: { nextTask, buildTask, makeView, applyEffects, blankState,
 * newSession, createPolicy }.
 *
 * The random source is a seeded generator, handed to the builders as their
 * `rng`. Until v6.13 Math.random itself was swapped for it while the questions
 * were built; that worked only because nothing else ran in between, and would
 * have broken without a sound the day a builder became asynchronous or a
 * library drew a number of its own. Now nothing global is touched, and no
 * builder can reach Math.random (tests/purity.test.js).
 *
 * The builders are pure (tasks/view.js), so the private state a duel is built
 * against moves on only through the effects of each question as it is taken —
 * exactly what a practice session does when it shows one.
 */

/** The blank pupil every duel is built against. */
function duelHost(duel, deps) {
  const { blankState, newSession, createPolicy } = deps;
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
  /* v6.13 (items 64, 67): a live class round or a team duel is set by a
     teacher, on a node of the curriculum map or a year as well as a whole
     category. `types` narrows the plan to the node's question types, and
     `allowed` holds it to the server's default ceiling. A duel between two
     pupils carries neither, and is built exactly as before. */
  const base = createPolicy(duel.allowed || null, S.policy);
  return {
    S, sess, forcedNoun: null,
    policy: Array.isArray(duel.types) && duel.types.length
      ? narrowPolicy(base, { types: duel.types }) : base,
    /* The day is part of the view; a duel has none of its own. A fixed one,
       so that a duel built a minute before midnight and one built a minute
       after are the same duel. */
    today: "2000-01-01",
  };
}

/**
 * The duel's PLAN: `duel.n` questions from `duel.seed`, as a practice session
 * at the duel's level would choose them. Nobody is asked these (unless a
 * line of the plan cannot be built any other way); what counts is their
 * SHAPE — `shapeOf` — which both players' questions follow line by line.
 */
export function duelPlan(lex, duel, deps) {
  const { nextTask, makeView, applyEffects } = deps;
  const host = duelHost(duel, deps);
  const { S, sess, policy, today } = host;
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

/**
 * What makes two questions weigh the same: the type, the level, and the
 * inflection cell (for a table, every cell it asks). `{ type, lvl, cell }`.
 */
export function shapeOf(t) {
  const cells = (t.cells || []).map((c) => c.m).join(",");
  return { type: t.typeId || t.type, lvl: t.lvl ?? null, cell: [t.cell ?? t.m ?? "", cells].join("/") };
}
/**
 * The KIND of cell, for when the very cell cannot be had: what stands before
 * the colon in a cell that names a word or a sentence part (`stjórn:handa` →
 * `stjórn`), and for a BÍN mark the class of word it belongs to — a verb's
 * (`GM-FH-NT-1P-ET`), an adjective's (`FSB-KK-NFET`), a pronoun's or
 * numeral's with a gender (`KK-ÞGFET`), or a noun's (`ÞGFETgr`).
 */
export function cellFamily(cell) {
  const c = String(cell || "");
  const at = c.indexOf(":");
  if (at > 0) return c.slice(0, at);
  if (/^(GM|MM)\b/.test(c)) return "so";
  if (/^(FSB|FVB|MST|ESB|EVB)\b/.test(c)) return "lo";
  if (/^(KK|KVK|HK)\b/.test(c)) return "kyn";
  /* A table has no cell of its own, only the list of cells it asks. */
  return c.startsWith("/") ? "tafla" : "no";
}
/** The shape as one string, to compare and to print. */
export const shapeKey = (t) => { const s = shapeOf(t); return `${s.type}~${s.lvl}~${s.cell}`; };

/* ---- where the same cell means the same answer ----------------------------
 *
 * "Write *hestur* in the dative plural" and "write *köttur* in the dative
 * plural" are the same cell and two answers: nothing one player says helps
 * the other. But "is *köttur* strong or weak?" is filed under the cell
 * `beyging:sterk` — the cell is the answer. Give both players that cell and
 * the first can tell the second "number 5 is *sterk*" exactly as before.
 *
 * The types below are the ones where two questions with the same cell
 * usually have the same answer:
 *
 *   - the cell IS the answer: analysis (the cell is the analysis), which
 *     case a word governs (the cell is the governing word, and *handa*
 *     always takes the dative), every "which kind is this?" choice, and
 *     "find the subject" (it is nearly always the first word);
 *   - the cell is one hand-written item (fs_sogn): the same cell is the
 *     same question. (fs_operson was here until critique item 23 asked each
 *     impersonal verb with two dozen subjects: *stjórn:langa* is now *mig*,
 *     *okkur*, *strákinn* …, and the cell no longer gives the answer.);
 *   - so few words share a cell that it comes to the same thing: *four* in
 *     the masculine accusative is *fjóra* whatever the sentence (to_samr,
 *     to_val, fn_stad). (lo_beyging was one until v6.13: its frames now put
 *     a different adjective into every cell, item 23.)
 *
 * For them a line of the plan fixes the type, the level and the KIND of cell
 * (`cellFamily`), and each player's own cell is drawn by their own generator
 * — as likely to be the other's as chance makes it, and no likelier.
 *
 * tests/duel.test.js measures every type — how often two different questions
 * with the same cell have the same right answer, against two questions of
 * the type at large — and fails, naming the type, when this list and the
 * builders disagree. A new type of this kind goes here.
 */
export const CELL_IS_ANSWER = new Set([
  "parse", "revform", "govern", "indecl", "syntax", "ob_fsao", "setn_hlut",
  "fn_flokkar", "no_beyging", "so_mynd", "gerd_tegund", "setn_lidir",
  "fs_sogn",
  "to_samr", "to_val", "fn_stad",
  /* issue #28: the cell is the connective that fits, or the pair of
     connectives whose meaning is the answer */
  "ob_tengiord", "ob_skilja",
]);

/** Do two questions weigh the same? The type and the level, and the cell —
    or, where the same cell means the same answer, the kind of cell. `a` and `b` are
    shapes (`shapeOf`). */
export const sameWeight = (a, b) => a.type === b.type && a.lvl === b.lvl &&
  (CELL_IS_ANSWER.has(a.type) ? cellFamily(a.cell) === cellFamily(b.cell) : a.cell === b.cell);

/* Word classes with enough words in them to give each player half. */
const OPEN_CLASSES = new Set(["kk", "kvk", "hk", "lo", "so"]);

/**
 * What a question is ABOUT, as the things one pupil could pass on to another
 * — `{ main, word }`, lists of keys.
 *
 * `main` is what makes it THIS question: every sentence shown, or, for a
 * question with no sentence (a table, a verb form, strong or weak), the word.
 * Two questions with no main key in common are different questions.
 *
 * `word` is the word asked about when there is a sentence as well, if it is
 * a noun, an adjective or a verb. The same word in another sentence is
 * another question, but often with the same answer (*hestsins* fits many
 * sentences), so the two players are kept off each other's words too. Not
 * for numerals, pronouns and the like: there are four numerals to decline,
 * and both players must be able to meet *þrír*.
 */
export function contentKeys(t) {
  const sents = [];
  const sent = (s) => { const x = s && (s.t || s.text); if (x) sents.push("s:" + x); };
  sent(t.s);
  ((t.hunt && t.hunt.lines) || []).forEach((l) => sent(l.s));
  const word = t.word ? ["w:" + t.word] : [];
  if (sents.length) {
    return { main: sents, word: OPEN_CLASSES.has(String(t.word || "").split("|").pop()) ? word : [] };
  }
  if (word.length) return { main: word, word: [] };
  /* Neither (a heap of words to sort): known by what it shows and asks. */
  const text = JSON.stringify([t.items, t.options, t.cards, t.question, t.answer, t.answers]) || "";
  return { main: [`q:${t.typeId || t.type}:${fnv(text).toString(36)}`], word: [] };
}

const fnv = (text) => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  /* FNV's low bits are weak (the lowest is the parity of the characters);
     stirred once more, any bit will do. */
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
  return h >>> 0;
};

/**
 * Which player a word or a sentence belongs to in THIS duel: "a" or "b".
 * Every word and every sentence of the data falls to one of the two, by a
 * hash of the duel's seed and the key — half each, another half in every
 * duel. A player is asked only about their own half, so the two sets of
 * questions cannot overlap, and neither browser needs to know the other's
 * questions to keep clear of them.
 */
export const halfOf = (seed, key) => ((fnv(`${seed >>> 0}|${key}`) >>> 9) & 1 ? "b" : "a");

/* How many questions of one type are built for a player, at most: `base`,
   and `perLine` more for every line of the plan that asks for the type.
   Building stops as soon as every line has a question of the first rank, or
   when `patience` builds in a row have improved nothing — a dozen
   hand-written items do not become more by being asked again. */
const BUILDS = { base: 30, perLine: 20, max: 200, patience: 40 };

/* How well a candidate fits a line of the plan — lower is better. "The same
 * weight" is `sameWeight` above: type, level and cell (or kind of cell).
 *
 *   0  the same weight; sentence and word both from the player's half, and
 *      the word not asked about elsewhere in this duel
 *   1  the same weight; the sentence from the player's half (for a question
 *      without a sentence: the word)
 *   2  nearly the weight, from the player's half: the same cell a level
 *      beside the plan's, or the same level and the same KIND of cell
 *   3  the same weight, but not from the player's half — the other player
 *      MAY be shown the same sentence
 *   4  nearly the weight, not from the player's half
 *   5  the same type, from the player's half
 *   6  the same type
 *   7  the plan's own question                  (the same for both players)
 *
 * 2 before 3: where the exact cell at the exact level has too few sentences
 * for two, a question a shade off that nobody can pass on is the fairer one.
 */
const PLAN_ITSELF = 7;
function fitOf(want, got, own, ownWord) {
  if (sameWeight(want, got)) return !own ? 3 : ownWord ? 0 : 1;
  const loose = CELL_IS_ANSWER.has(want.type);
  const sameKind = cellFamily(got.cell) === cellFamily(want.cell);
  const near = ((loose ? sameKind : got.cell === want.cell) && Math.abs((got.lvl || 0) - (want.lvl || 0)) <= 1)
    || (got.lvl === want.lvl && sameKind);
  return near ? (own ? 2 : 4) : (own ? 5 : 6);
}

/**
 * The questions of ONE player: `duel.side` ("a" | "b") and `duel.key`, that
 * player's own seed. For every line of the plan, a question of the same
 * weight (`sameWeight`) about words and sentences of the player's own half
 * (`halfOf`).
 *
 * How: type by type. Questions of the type are built from the player's
 * generator — every other one with the builder asked outright for the cell
 * of a line still waiting (`view.force`, the hook the review queue uses) —
 * and each is given to the line of the plan it fits best (`fitOf`), if it
 * fits better than what that line holds. No sentence, and no word of a
 * question without a sentence, is used twice in one player's duel.
 *
 * A builder cannot always oblige: an exact cell may have a single sentence
 * in the bank, and a hand-written exercise a dozen items to share between
 * two players. Then the line takes the nearest thing built. At ranks 0 to 2
 * the two players cannot be shown the same sentence, nor — where there is no
 * sentence — asked about the same word.
 *
 * Every step is decided by the seeds alone, so the server builds exactly
 * what the browser built. Without a side, the plan itself is returned.
 *
 * Each task carries `fit` (0–7, the rank it was taken at) — for the tests,
 * which hold the first ranks to nearly always, and for anyone wondering why
 * two players met the same sentence.
 */
export function duelTasks(lex, duel, deps) {
  const plan = duelPlan(lex, duel, deps);
  const side = duel.side;
  if (side !== "a" && side !== "b") return plan;
  const { buildTask, makeView } = deps;
  /* Every candidate is built against the same blank pupil. Nothing is
     "shown" while building, so there are no effects to apply: what keeps a
     sentence from coming twice is the set of keys below. */
  const { S, sess, policy, today } = duelHost(duel, deps);
  /* The player's own generator: the duel's seed and the player's key, stirred
     together. The key is the server's secret until that player starts. */
  const rng = seeded(fnv(`${duel.seed >>> 0}/${side}/${(duel.key ?? 0) >>> 0}`));
  const mine = (keys) => keys.every((x) => halfOf(duel.seed, x) === side);

  const wants = plan.map(shapeOf);
  /* What each line holds: { task, keys, rank } or null. */
  const held = plan.map(() => null);
  const heldBy = new Map();                 // main key → the line holding it
  const words = new Map();                  // word key → how many lines hold it
  const take = (i, c) => {
    const old = held[i];
    if (old) {
      old.keys.main.forEach((x) => heldBy.delete(x));
      old.keys.word.forEach((x) => words.set(x, words.get(x) - 1));
    }
    held[i] = c;
    c.keys.main.forEach((x) => heldBy.set(x, i));
    c.keys.word.forEach((x) => words.set(x, (words.get(x) || 0) + 1));
  };

  const types = [...new Set(wants.map((w) => w.type))];
  for (const type of types) {
    const lines = wants.map((w, i) => (w.type === type ? i : -1)).filter((i) => i >= 0);
    const budget = Math.min(BUILDS.max, BUILDS.base + BUILDS.perLine * lines.length);
    let turn = 0, idle = 0;
    for (let k = 0; k < budget && idle < BUILDS.patience; k++, idle++) {
      const waiting = lines.filter((i) => !held[i] || held[i].rank > 0);
      if (!waiting.length) break;
      /* Every other build, ask for the cell of a line still waiting — each
         in its turn. Only a cell a builder can be asked for, and never where
         the same cell means the same answer: there each player's cell is
         their own draw. */
      let force = null;
      if (k % 2 && !CELL_IS_ANSWER.has(type)) {
        const ref = plan[waiting[turn++ % waiting.length]];
        if (ref.cell) force = { cell: ref.cell };
      }
      const b = buildTask(lex, makeView({ S, sess, policy, today, force }), rng, type);
      if (!b) continue;
      const t = b.task;
      if (t.counts === false) continue;
      if (t.answers !== undefined && !(t.answers && t.answers.length)) continue;
      const got = shapeOf(t), keys = contentKeys(t);
      const own = mine(keys.main);
      /* The line it serves best: the lowest rank it reaches, and among
         those the line worst off now. */
      let at = -1, rank = PLAN_ITSELF;
      for (const i of waiting) {
        /* Not if another line already shows this sentence. */
        if (keys.main.some((x) => heldBy.has(x) && heldBy.get(x) !== i)) continue;
        const cur = held[i];
        const elsewhere = keys.word.some((x) =>
          (words.get(x) || 0) - (cur && cur.keys.word.includes(x) ? 1 : 0) > 0);
        const r = fitOf(wants[i], got, own, own && mine(keys.word) && !elsewhere);
        const curRank = cur ? cur.rank : PLAN_ITSELF;
        if (r >= curRank) continue;
        const atRank = at < 0 ? -1 : (held[at] ? held[at].rank : PLAN_ITSELF);
        if (at < 0 || r < rank || (r === rank && curRank > atRank)) { at = i; rank = r; }
      }
      if (at >= 0) { take(at, { task: t, keys, rank }); idle = 0; }
    }
  }

  return plan.map((ref, i) => {
    /* Nothing of the type could be built for this player: the plan's own. */
    const t = held[i] ? held[i].task : ref;
    t.duel = true;
    t.fit = held[i] ? held[i].rank : PLAN_ITSELF;
    return t;
  });
}

/* ---------- grading (item 62) ---------------------------------------------- */

/* What a response may look like before it is allowed near `judge`. The
   shapes are those listed at the top of core/answer.js; anything else is
   not an answer. Generous enough for the longest honest answer (a rewritten
   sentence, a 24-cell table, a text with every word tapped) and no more. */
export const ANSWER_LIMITS = { text: 300, items: 64, key: 40, bytes: 2000 };

const isText = (v) => typeof v === "string" && v.length <= ANSWER_LIMITS.text;
const isPick = (v) => isText(v) || (typeof v === "number" && Number.isFinite(v)) || v === null;
const listOf = (ok) => (v) => Array.isArray(v) && v.length <= ANSWER_LIMITS.items && v.every(ok);
const mapOf = (ok) => (v) => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const e = Object.entries(v);
  return e.length <= ANSWER_LIMITS.items && e.every(([k, x]) => k.length <= ANSWER_LIMITS.key && ok(x));
};
/* Every key a response may have, and what may stand under it. */
const RESPONSE = {
  text: isText,
  hinted: (v) => typeof v === "boolean",
  cells: (v) => listOf(isText)(v) || mapOf(isText)(v),      // a table: in order, or by BÍN mark
  texts: listOf(isText),
  picked: isPick,
  picked2: isPick,
  picks: mapOf(isPick),
  sel: listOf((v) => Number.isInteger(v) && v >= 0),
  edits: mapOf(isText),
};

/**
 * A response as `judge` may be given it, or null if it is not one: a plain
 * object with known keys, each of the kind that key has — a short string, a
 * pick, a short flat list or a small flat object of those. Returns a COPY —
 * nothing the browser sent is passed on by reference.
 */
export function cleanResponse(r) {
  if (!r || typeof r !== "object" || Array.isArray(r)) return null;
  const out = {};
  for (const [k, v] of Object.entries(r)) {
    if (!Object.prototype.hasOwnProperty.call(RESPONSE, k) || !RESPONSE[k](v)) return null;
    /* No prototype on a copied object, so a key like "constructor" is only
       a key. */
    out[k] = Array.isArray(v) ? [...v]
      : v && typeof v === "object" ? Object.assign(Object.create(null), v) : v;
  }
  if (JSON.stringify(out).length > ANSWER_LIMITS.bytes) return null;
  return out;
}

/**
 * Grade one player's answers against that player's questions.
 *
 * @param tasks    the player's questions (`duelTasks`), built HERE — never
 *                 anything the browser sent
 * @param answers  what the browser sent: a list, one response per question
 *                 in order; null (or nothing) where none was given
 * @param judge    core/answer.js `judge`
 * @returns {{c:number, n:number, marks:number[]}} — `n` is the number of
 *          questions, whatever was answered: a question left is a question
 *          wrong. `marks` is 1 or 0 per question.
 *
 * Only `ok === true` counts. An answer that is not finished (`pending`), one
 * `judge` has no verdict on, one that is not a response at all, and one that
 * makes `judge` throw are all simply not right: a duel has no half marks,
 * and a malformed answer must not be able to stop the other answers being
 * graded.
 */
export function gradeDuel(tasks, answers, judge) {
  const list = Array.isArray(answers) ? answers : [];
  const marks = tasks.map((task, i) => {
    const r = cleanResponse(list[i]);
    if (!r) return 0;
    try {
      const j = judge(task, r);
      return j && !j.pending && j.ok === true ? 1 : 0;
    } catch { return 0; }
  });
  return { c: marks.reduce((a, b) => a + b, 0), n: tasks.length, marks };
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

/* ---------- the slice (issue #50) -------------------------------------------
 * `S.duels`: every settled duel, { duelId: "w"|"l"|"t" } — won, lost, tied.
 * Written once, when this device first sees the result, which is what makes
 * the XP and the badge count only once. A slice of the saved state
 * (core/slices.js), moved here unchanged from core/state.js, core/merge.js
 * and server/guard.mjs. */

/** @type {import("../types").Slice} */
export const duelsSlice = {
  key: "duels",
  blank: () => ({}),
  migrate: (raw) => (raw && typeof raw === "object" ? { ...raw } : {}),
  /* A duel settled anywhere is settled, and both devices agree on its result. */
  merge: (B, L, R) => ({ ...obj(R), ...obj(L) }),
  /* Duel ids with one letter each. */
  clean: (value) => Object.fromEntries(pairs(value, 5000, 40)
    .filter(([, v]) => ["w", "l", "t", "f"].includes(v))),
  ownText: false,
};
