/* The shapes everything shares, for the type checker (critique item 74).
 *
 * This file is never bundled and never run: tools/build.mjs starts from
 * src/js/app.js and nothing imports a .d.ts at run time. It exists so that
 * `npm run typecheck` (tsc, see tsconfig.json and docs/TYPES.md) can hold the
 * plain-JS modules that start with `// @ts-check` to one description of the
 * saved state, a task, a judgement, a review entry, a curriculum node and a
 * policy. A module names them in JSDoc:
 *
 *   /** @typedef {import("../types").State} State *\/
 *   /** @param {State} S *\/
 *
 * The prose that explains each field lives where it always has, beside the
 * code that writes it (core/state.js blankState, core/review.js, core/
 * difficulty.js …). This file says only what TYPE each field is; when you add
 * a field to the saved state, add it here too, or the checked modules that
 * read it will not compile. The fields are listed in the order of blankState.
 */

/* ---------- small things ---------------------------------------------------- */

/** A day key, "2026-11-16", local time (core/state.js `dkey`). */
export type DayKey = string;

/** "Now", as the pure modules accept it: milliseconds, a Date, or a day key.
    core/review.js `dayOf` turns any of them into a DayKey. */
export type When = number | Date | DayKey;

/** The random source a builder draws from: a number in [0, 1). */
export type Rng = () => number;

/** A skill id (core/skills.js SKILL_IDS): "nafnord", "sagnord" … */
export type SkillId = string;

/** Right and wrong, for a cell or a skill. */
export interface RightWrong { c: number; w: number }

/** A word's tally: right, wrong and the last dozen outcomes ("1"/"0"). */
export interface WordStat extends RightWrong { h?: string }

/** A word's rescue record (`S.drills[word]`, core/wordknowledge.js): rescues
    passed, drills run, drills endured, the day of the last, and the word's
    answer count when it ended. */
export interface DrillRecord { p: number; t: number; f: number; last: DayKey | null; at: number }

/** One category's lifetime figures (`S.skills[skill]`). */
export interface SkillStat { xp: number; c: number; w: number; bestRun: number }

/** One day (`S.days[key]`, core/state.js `dayRec`). */
export interface DayRecord {
  a: number;            // answers
  c: number;            // right ones
  xp: number;
  sk?: Record<SkillId, number>;   // right answers per skill
  ms?: number;          // time spent answering
  nw?: number;          // new words met
  [more: string]: any;  // login marks and badge bookkeeping (core/badges.js)
}

/** A skill's saved difficulty (core/difficulty.js "the saved record"). */
export interface LevelRecord {
  d: number;                      // 1–7, in halves
  r: number;                      // right in a row towards the next rise
  h: string;                      // last dozen outcomes, "1"/"0"
  at: number;                     // ms of the last change
  src: "play" | "xp" | "cal" | "placement";   // "placement": the first run (item 84)
}

/** Answers to one question type or curriculum node (`S.byType`, `S.byNode`;
    core/mastery.js). `h` holds one character per answer: outcome and band. */
export interface AnswerRecord { n: number; c: number; h: string; at: number }

/** One error pattern's record (`S.diag[pattern]`, core/diagnosis.js). */
export interface DiagRecord {
  n: number;            // chances
  w: number;            // misses
  h: string;            // last 16, "1"/"0"
  last?: DayKey | null;
  ex?: { w?: string; m?: string; o?: string }[];
}

/* ---------- the review queue (core/review.js) ------------------------------- */

/** One entry of the review queue. See the top of core/review.js. */
export interface ReviewEntry {
  k: string;                  // identity (`keyFor`)
  t: string;                  // question type missed last
  sk: SkillId | null;         // category it counted for
  p: string | null;           // error pattern
  c: string | null;           // cell
  w: string | null;           // word key
  i: string | null;           // hand-written item
  s: number;                  // stage, 0–3, index into INTERVALS
  due: DayKey;
  add: DayKey;
  last: DayKey;
  l: number;                  // times missed
  ok: number;                 // reviews passed
}

/** A tally under `S.review.stats` ("p:…", "s:…", "t:…"). */
export interface ReviewTally {
  a?: number; l?: number; p?: number; t?: number; g?: number; x?: number;
}

export interface ReviewState {
  items: ReviewEntry[];
  stats: Record<string, ReviewTally>;
}

/* ---------- the policy (core/policy.js) ------------------------------------- */

/** What is saved: the child's choice (`S.policy`) or the administrator's
    ceiling (`S.allowed`). `false` switches a thing off; missing is on. */
export interface PolicyChoice {
  skills?: Record<string, boolean>;
  types?: Record<string, boolean>;
  levels?: Record<string, boolean>;
  attrs?: Record<string, Record<string, boolean>>;
  safeVocab?: boolean | null;
}

/** The effective policy, ready to be asked questions: `createPolicy`'s
    result, so this can never drift from the code. */
export type Policy = ReturnType<typeof import("./core/policy.js").createPolicy>;

/* ---------- the saved state (core/state.js) -------------------------------- */

/**
 * Everything persisted. The order and the comments are those of
 * core/state.js `blankState`; read the comments there. Records written by
 * modules that are not type-checked yet are typed loosely (`any`), and should
 * be tightened when their module is.
 */
export interface State {
  v: number;
  profile: { id: string; name: string; [more: string]: any };
  xp: number;
  bestLevel: number;
  days: Record<DayKey, DayRecord>;
  cells: Record<string, RightWrong>;
  words: Record<string, WordStat>;
  skills: Record<SkillId, SkillStat>;
  badges: Record<string, any>;
  goal: number;
  run: number;
  bestRun: number;
  weekGoal: number;
  totalAnswers: number;
  totalCorrect: number;
  multiSessionRun: number;
  lastSessionSkills: SkillId[] | null;
  counters: Record<string, number>;
  enabled: Record<SkillId, boolean>;
  policy: PolicyChoice;
  allowed: PolicyChoice | null;
  settings: { decay: boolean; settingsRev: number; glossary: boolean; badgeView: string; [more: string]: any };
  lastActive: DayKey | null;
  periods: Record<string, any>;
  settled: DayKey | null;
  showcase: string[];
  title: string | null;
  social: any;
  drills: Record<string, DrillRecord>;
  drillDays: Record<DayKey, number>;
  read: Record<string, boolean>;
  duels: Record<string, "w" | "l" | "t">;
  diag: Record<string, DiagRecord>;
  runs: any[];
  review: ReviewState;
  difficulty: Record<SkillId, LevelRecord>;
  frames: Record<string, number>;
  byType: Record<string, AnswerRecord>;
  byNode: Record<string, AnswerRecord>;
  /** Owner feedback 6.14: the highest step the skill map has shown, per skill (core/skillmap.js). */
  mapBand: Record<string, number>;
  seenTypes: Record<string, DayKey>;
  mend: any;
  /** The guided first run (item 84, core/placement.js `cleanTour`). */
  tour: TourRecord | null;
  /** One history per word (issue #8, core/wordknowledge.js). */
  wordKnowledge: WordKnowledge;
  /** The six words in learning and the words learned (issue #12, core/wordknowledge.js). */
  learning: Learning;
}

/* ---------- word knowledge (core/wordknowledge.js) -------------------------- */

/** A word entry as saved: [day, question type id, "r" | "w" | "s"]. */
export type SavedWordEntry = [DayKey, string, string];

/** One word's history: right and wrong totals and every entry, oldest first. */
export interface WordHistory { c: number; w: number; e: SavedWordEntry[] }

/** `S.wordKnowledge`: per word key ("hestur|kk"). */
export type WordKnowledge = Record<string, WordHistory>;

/** One word's place in the intensive phase: "l" in learning, "k" learned,
    "o" put back; the day it got that status; how many times it changed. */
export interface LearningRecord { s: "l" | "k" | "o" | string; d: DayKey; n: number }

/** `S.learning`: per word key ("hluti|kk"). */
export type Learning = Record<string, LearningRecord>;

/** A word entry as `entriesOf` hands it out. */
export interface WordEntry { day: DayKey; type: string; outcome: string }

/** A status Word knowledge gives a word, with the reason in plain Icelandic
    (core/wordknowledge.js, "statuses"): `{ status: "shaky", why: "3 af síðustu 7 rétt, undir 50%" }`. */
export interface WordStatus { status: string; why: string }

/**
 * One slice of the saved state and everything about its shape (core/slices.js,
 * where each field is explained). `T` is the slice's saved value.
 */
export interface Slice<T = any> {
  key: string;
  blank(): T;
  migrate(raw: any, whole: any): T;
  merge(base: any, local: any, remote: any): T;
  clean(value: any, ctx: CleanContext): T;
  /** Text the pupil wrote in their own words: only for the pupil (ADR 0003). */
  ownText: boolean;
}

/** What a slice's server check is told (core/slices.js `cleanContext`). */
export interface CleanContext {
  today: Date;
  /** The last day key a saved day may have: tomorrow, for time zones. */
  limit: DayKey;
}

/** Where a pupil is in the guided first run (core/placement.js). */
export interface TourRecord {
  st: "open" | "done" | "skipped";
  at: number;                     // ms of the last change
  d: DayKey | null;               // the day it ended
  placed: 0 | 1;                  // a placement round has set the levels
  year: number | null;            // the year preset it suggested
}

/**
 * The live session (core/state.js `newSession`). Not saved. Many modules
 * hang their own bookkeeping on it (exSeen, seenFrames, bonusTexts …), so it
 * stays open: the fields listed are the ones the checked modules rely on.
 */
export interface Session {
  diff: Record<SkillId, number>;                 // live level per skill
  warm: Record<SkillId, number>;
  seenAt: Record<SkillId, number>;
  visitDay: DayKey | null;
  range: Record<SkillId, [number, number]> | null;
  skillRun: Record<SkillId, number>;
  seen: string[];
  /** The question just shown (tasks/effects.js "last"), for the spacing rule (#10). */
  lastAsked?: { type: string | null; words: string[] } | null;
  answers: number;
  correct: number;
  [more: string]: any;
}

/**
 * A practice session in progress (core/run.js `newRun`, `app.run`). Not saved;
 * a finished one is written into `S.runs` (core/run.js `writeRun`).
 */
export interface Run {
  topic: string;                  // a skill, or core/run.js TOPIC
  n: number;                      // its size
  focus: string[] | null;         // the error patterns it is aimed at
  assignment: { id: string; target: any; scope: any } | null;   // item 65
  i: number;                      // questions answered
  c: number;                      // …right
  j: number;                      // …graded (not those with no right answer)
  xp0: number;                    // S.xp when it began
  badges: any[];                  // won during it, celebrated at its summary (item 61)
  items: { type: string; skill?: SkillId; ok: boolean | null }[];
  chances: Record<string, number>;
  misses: Record<string, number>;
  found: { p: string; ex: any }[];
  before: string[];               // the active patterns when it began
  startedAt: number;
  review: string[];               // the review keys it opens with
  reask: any[];                   // missed clozes waiting for their turn
  plan: any[] | null;             // today's session: the slots after the opening
  streaked: string[];             // "Þrjár í röð" offered (item 36)
  streaks: { p: string; c: number; n: number }[];
  types: string[] | null;         // item 41: exactly these question types
  skills: SkillId[] | null;
  attrs: any;
  label: string | null;
  lesson: string | null;
  placement: any;                 // item 84: the first run's placement round
}

/* ---------- questions -------------------------------------------------------- */

/**
 * A built question. Its shape differs by renderer (`type`): a cloze carries
 * `n` and `answers`, a table `cells`, a hunt `lines` … — see the builders in
 * tasks/<category>.js and the response shapes at the top of core/answer.js.
 * The fields every task may carry are listed; the rest is open.
 */
export interface Task {
  type: string;               // the renderer, and the key of core/answer.js JUDGES
  typeId?: string;            // the catalogue id (tasks/registry.js), set when shown
  skill?: SkillId;
  lvl?: number;
  m?: string | null;          // the BÍN mark asked for
  answers?: string[];
  duel?: boolean;             // part of a duel: does not count towards mastery
  review?: string;            // the review entry it asks (ReviewEntry.k)
  calBand?: number;
  [field: string]: any;
}

/** The lexicon and the sentence bank, as core/lexicon.js builds them. Typed
    by inference from that (unchecked) file: what it returns is what this is. */
export type Lexicon = ReturnType<typeof import("./core/lexicon.js").buildLexicon>;

/** What a builder returns (tasks/effects.js). */
export interface Built { task: Task; effects: BuildEffect[] }

/** What showing a task does (tasks/effects.js FX). */
export type BuildEffect =
  | { op: "last"; type: string | null; words: string[] }
  | { op: "exSeen"; key: string }
  | { op: "seen"; words: string[] }
  | { op: "since"; table: boolean; meaning: boolean }
  | { op: "clearForcedNoun" }
  | { op: "frame"; key: string };

/** What a builder may look at (tasks/view.js `makeView`). */
export interface View {
  readonly S: State;
  readonly sess: Session;
  readonly policy: Policy;
  readonly today: DayKey;
  /** The question type being built, or null (a builder called on its own). */
  readonly typeId: string | null;
  /** The one word this question is to be about (tasks/view.js "Choosing a word"). */
  readonly mustAsk: { readonly word: any; readonly strict: boolean } | null;
  readonly mix: { n: number; counts: Record<string, number> } | null;
  readonly inRun: boolean;
  readonly huntPrefer: string[];
  readonly force: { cell?: string | null; item?: string | null; avoid?: any } | null;
  readonly cal: any;
  /** The words in learning (`wordKey`s) in ordinary practice, else null (#13). */
  readonly learning: readonly string[] | null;
  /** The word to ask about, from `pool` (or a word in learning from `wider`), or null (tasks/view.js). */
  pickWord(lex: Lexicon, pool: readonly any[], skill: string, rng: Rng, classes: readonly string[],
    wider?: readonly any[] | null): any;
  /** One of `items`, weighted by the word each carries (tasks/view.js). */
  pickByWord<T>(lex: Lexicon, items: readonly T[], wordOf: (x: T) => any, skill: string, rng: Rng,
    factor?: ((x: T) => number) | null, wider?: readonly T[] | null): T | null;
  /** Is this a word in learning this view prefers (#13)? */
  inLearning(wordKey: string | null | undefined): boolean;
  /** The side to draw from: the items about a word in learning LEARNING_SHARE of the time (#13). */
  preferLearning<T>(items: readonly T[], isLearning: (x: T) => boolean, rng: Rng): readonly T[];
  /** The strict `mustAsk` word if of these classes (any if left out), else null. */
  askedWord(classes?: readonly string[] | null): any;
  /** A strict `mustAsk` word of a class not in `classes`. */
  cannotAsk(classes?: readonly string[] | null): boolean;
  /** The non-strict `mustAsk` word (a cloze asked again), or null. */
  retryWord(): any;
  /** A weight multiplier for a sentence by its words: 0 for the word the
      last question asked in this type (#10), otherwise 1. */
  wordBoost(wordKeys?: readonly (string | null)[]): number;
  /** Did the last question ask this word in the type being built (#10)? */
  justAsked(wordKey: string | null | undefined): boolean;
  /** Is this built question the last one's word in the last one's type (#10)? */
  repeatsLast(task: any): boolean;
}

/** One question type as core/catalogue.js declares it. */
export interface CatalogueEntry {
  id: string;
  skill: SkillId;
  anyOf?: SkillId[];
  nm: string;
  ds: string;
  renderer: string;
  weight: number;
  weightInRun?: number;
  recall: boolean;
  grader: "app" | "server";
  tags: string[];
  bands: number[];
}

/** A catalogue entry joined with its builder (tasks/registry.js). */
export interface TaskType extends CatalogueEntry {
  build: (lex: Lexicon, view: View, rng: Rng) => Built | null;
  drill?: (lex: Lexicon, view: View, rng: Rng, entry: any) => Built | null;
  /** False when nothing can be built for this pupil (tasks/registry.js). */
  ready?: (view: View) => boolean;
}

/** What a category file exports for each of its types: `BUILDERS[id]`. */
export interface Builder {
  build: TaskType["build"];
  drill?: TaskType["drill"];
  ready?: TaskType["ready"];
}

/* ---------- judging (core/answer.js) ---------------------------------------- */

/** One error pattern found in an answer (core/diagnosis.js `diagnose`). */
export interface Finding {
  p: string;
  soft?: boolean;
  ex?: { said: string; right: string };
  m?: string | null;
  other?: string;
}

/** What `settle` writes, one effect at a time. Plain data. */
export type Effect =
  | { do: "record"; skill?: SkillId; cell?: string | null; word?: string | null; ok: boolean;
      xp?: number; hinted?: boolean; counts?: boolean; tally?: boolean; timed?: boolean; answer?: any }
  | { do: "tally"; skill: SkillId; ok: boolean }
  | { do: "tableRun"; ok: boolean }
  | { do: "grant"; skill: SkillId; xp: number }
  | { do: "count"; counter: string }
  | { do: "remember"; list: string; key: string }
  | { do: "bump"; skill: SkillId; ok: boolean | null }
  | { do: "seen"; skill?: SkillId; word?: string | null; xp?: number; timed?: boolean };

/** The one effect that writes an answer (core/state.js `record`). */
export type RecordEffect = Extract<Effect, { do: "record" }>;

/** The result of `judge`, `judgeRetry` and `judgeBonus`. See the top of
    core/answer.js for what each field is for. */
export interface Judgement {
  ok: boolean | null;
  verdict: string;
  /** true, or for a server-graded question "server" (read it first) or
      "revise" (read; one revision offered). core/answer.js. */
  pending: boolean | "server" | "revise";
  findings: Finding[];
  xp: number;
  effects: Effect[];
  finish: Record<string, any> | null;
  detail: Record<string, any>;
  resp: Record<string, any> | null;
  retry?: boolean;
  xpFull?: number;
}

/* ---------- the curriculum (core/curriculum.js) ----------------------------- */

/** A node of the curriculum map. See "Fields" above NODES. */
export interface Node {
  id: string;
  nm: string;
  cat: string;
  year: number;
  hv: string;
  types: string[];
  lesson: string | null;
  cover: "full" | "part" | "none";
  attrs?: Record<string, string[]>;
  item?: number;
  classes?: string[];
}
