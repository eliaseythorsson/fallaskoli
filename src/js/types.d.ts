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
  vocab: Record<string, any>;
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
  drills: Record<string, any>;
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
  seenTypes: Record<string, DayKey>;
  mend: any;
  /** The guided first run (item 84, core/placement.js `cleanTour`). */
  tour: TourRecord | null;
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
  | { op: "asked"; key: string; day: DayKey }
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
  readonly forcedNoun: any;
  readonly drillWord: any;
  readonly mix: { n: number; counts: Record<string, number> } | null;
  readonly inRun: boolean;
  readonly huntPrefer: string[];
  readonly force: { cell?: string | null; word?: any; item?: string | null; avoid?: any } | null;
  readonly cal: any;
}

/** One question type as its category file declares it (tasks/registry.js). */
export interface TaskType {
  id: string;
  skill: SkillId;
  anyOf?: SkillId[];
  weight: number;
  weightInRun?: number;
  renderer: string;
  tags: string[];
  bands: number[];
  build: (lex: Lexicon, view: View, rng: Rng) => Built | null;
  drill?: (lex: Lexicon, view: View, rng: Rng, entry: any) => Built | null;
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
  | { do: "bump"; skill: SkillId; ok: boolean | null };

/** The one effect that writes an answer (core/state.js `record`). */
export type RecordEffect = Extract<Effect, { do: "record" }>;

/** The result of `judge`, `judgeRetry` and `judgeBonus`. See the top of
    core/answer.js for what each field is for. */
export interface Judgement {
  ok: boolean | null;
  verdict: string;
  pending: boolean;
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
}
