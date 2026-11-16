/* Rarity of badges and of words.
 *
 * A badge's rarity is the share of users who hold it. That is a property of
 * the group, not of the badge, so it is never written into the catalogue: it
 * arrives from the server (`/badges/stats`). Until enough users exist to
 * measure it, each badge carries a GUESS derived from its own threshold
 * (`fam` + `n`, or `est` — see core/badges.js), and the guess is always
 * labelled `estimated: true` so the interface can say "áætlað".
 *
 * The measurement counts only QUALIFIED users: MIN_USERS of them, each with
 * MIN_DAYS of activity. A user who signed up yesterday has had no chance to
 * win "30 days in a row" and must not dilute the share. */

/* The six tiers, commonest first. `min` is the share of users holding the
 * badge; `tierFor` takes the first row the share clears. `col` is the fill and
 * `ink` the text colour that stays readable on it — both live here so a tier
 * cannot be added without deciding how it looks. */
export const TIERS = [
  { id: "algengt",        nm: "Algengt",        min: 0.50,  col: "#6E7A87", ink: "#FFFFFF", ico: "▫" },
  { id: "oalgengt",       nm: "Óalgengt",       min: 0.25,  col: "#F4F6F7", ink: "#22303B", ico: "▪" },
  { id: "sjaldgaeft",     nm: "Sjaldgæft",      min: 0.10,  col: "#1E7A57", ink: "#FFFFFF", ico: "◆" },
  { id: "mjogsjaldgaeft", nm: "Mjög sjaldgæft", min: 0.02,  col: "#2E6FBF", ink: "#FFFFFF", ico: "✦" },
  { id: "sogulegt",       nm: "Sögulegt",       min: 0.005, col: "#7A3FBF", ink: "#FFFFFF", ico: "✵" },
  { id: "godsagnakennt",  nm: "Goðsagnakennt",  min: 0,     col: "#D2691E", ink: "#FFFFFF", ico: "★" },
];

/** How many qualified users are needed before rarity is measured at all. */
export const MIN_USERS = 10;
/** How many active days a user needs before they count as qualified. */
export const MIN_DAYS = 10;

export const tierById = (id) => TIERS.find((t) => t.id === id) || null;

/** Share -> tier. 0.4 (40% of users) -> "Óalgengt". */
export function tierFor(share) {
  if (share == null || Number.isNaN(share)) return null;
  return TIERS.find((t) => share >= t.min) || TIERS[TIERS.length - 1];
}

/* ---------- base rarity: the guess -------------------------------------- */

/**
 * Badge families that have a threshold.
 *
 *   at    — the lowest step in the family
 *   share — guessed share of users who reach the lowest step
 *   half  — how much n has to rise for the share to halve
 *
 * The guess is `share · 2^(-(n - at)/half)`: strictly decreasing in n, so a
 * higher step is always rarer and a new step gets its guess by itself. `half`
 * is where the judgement sits — a day streak falls fast, a lifetime total
 * slowly. Tuned so that 100 in a row and a 30-day multi-skill streak are
 * legendary and 500 correct in one skill is blue.
 */
export const FAMILIES = {
  run:         { at: 5,  share: 0.90, half: 11 },   // correct in a row, overall
  runskill:    { at: 10, share: 0.38, half: 6 },    // correct in a row within a skill
  daystreak:   { at: 2,  share: 0.80, half: 4.5 },  // consecutive days at goal
  /* The two easier ladders through the same week (badges.js §3), anchored
     above `daystreak` at every step: turning up is easier than answering and
     answering is easier than hitting the target. `CONSISTENCY` pins this. */
  loginstreak:  { at: 3, share: 0.88, half: 9 },    // consecutive days opened
  answerstreak: { at: 3, share: 0.78, half: 8 },    // consecutive days answered
  /* Item 57: the same three ladders in weeks (rungs 2, 4, 8, 12, 20, 30), with
     the same order at every step: opened > answered > met the goal. */
  weekstreak:  { at: 2,  share: 0.45, half: 7 },    // consecutive weeks at the weekly goal
  weekanswer:  { at: 2,  share: 0.53, half: 8 },    // consecutive weeks of answering
  weeklogin:   { at: 2,  share: 0.62, half: 9 },    // consecutive weeks of opening
  dayans:      { at: 10, share: 0.92, half: 38 },   // answers in one day
  total:       { at: 50, share: 0.88, half: 750 },  // correct answers overall
  skilltotal:  { at: 25, share: 0.72, half: 105 },  // correct answers within a skill
  level:       { at: 2,  share: 0.90, half: 3.2 },  // overall level (gentler curve since v6.1)
  skilllevel:  { at: 3,  share: 0.60, half: 1.5 },  // level within a skill
  session:     { at: 25, share: 0.55, half: 26 },   // correct in one session
  collection:  { at: 10, share: 0.93, half: 270 },  // distinct words collected
  collclass:   { at: 25, share: 0.62, half: 58 },   // distinct words in one class
  multisess:   { at: 3,  share: 0.70, half: 2.7 },  // skills touched in a session
  multiday:    { at: 7,  share: 0.35, half: 2.5 },  // skills touched in a day
  /* Anchored below `multi_all_day` and `multi_all_sess`, which a two-day
     streak contains; `CONSISTENCY` pins that. */
  multistreak: { at: 2,  share: 0.16, half: 3.6 },  // every skill, n days running
  rotate:      { at: 6,  share: 0.30, half: 2.1 },  // never the same skill twice
  /* v6.6. A rescue needs a word in trouble first, so even the first one is
     green; the later steps are about doing it again and again. */
  rescue:      { at: 1,  share: 0.35, half: 6 },    // different words rescued
  strong:      { at: 25, share: 0.55, half: 110 },  // words held at 80%+
  vocab:       { at: 250, share: 0.60, half: 450 }, // the leaderboard's Orðaforði
};

/* No badge is certain and none impossible. The floor is ADDED, not clamped:
 * a clamp gave "75 days" and "100 days" the same share and broke "higher n is
 * rarer" exactly where it matters. */
const FLOOR = 0.00005, CEIL = 0.98;
const clampShare = (x) => FLOOR + (1 - FLOOR) * Math.max(0, Math.min(CEIL, x));

/**
 * Guessed share of users who end up with this badge.
 * Returns `null` if the badge has neither a family nor a standalone guess —
 * that is a bug `tests/rarity.test.js` fails on, not a state meant to survive.
 */
export function estimateShare(b) {
  if (!b) return null;
  if (b.fam && b.n != null) {
    const f = FAMILIES[b.fam];
    if (!f) return null;
    return clampShare(f.share * Math.pow(2, -(b.n - f.at) / f.half));
  }
  if (b.est != null) return clampShare(b.est);
  return null;
}

/* Consistency between families.
 *
 * Inside a family the ordering (5 < 10 < 25 …) is guaranteed by the formula.
 * Between families it cannot be — "25 correct in nouns" and "10 in a row in
 * nouns" measure different things — so the orderings that matter are written
 * out here and checked by `tests/rarity.test.js`, never at run time. Each rule
 * reads "the left badge must be commoner than the right"; `<skill>` expands
 * once per skill. */
export const CONSISTENCY = [
  /* Counting up beats keeping a run going. Twenty-five right answers in a
     skill, spread over as many sittings as you like, is easier than ten in a
     row without a mistake. */
  ["first_<skill>", "run_<skill>_10"],
  ["cnt_<skill>_25", "run_<skill>_10"],
  ["cnt_<skill>_100", "run_<skill>_20"],
  /* The first answer of all is easier than any count within a skill. */
  ["first_<skill>", "cnt_<skill>_25"],
  /* Doing it anywhere beats doing it in one particular skill. */
  ["run5", "run_<skill>_10"],
  ["tot50", "cnt_<skill>_25"],
  ["lvl2", "slvl_<skill>_3"],
  ["lvl5", "slvl_<skill>_7"],
  /* Turning up beats answering, and answering beats hitting the target. */
  ["login3", "ansday3"],
  ["login7", "ansday7"],
  ["login30", "ansday30"],
  ["ansday7", "day7"],
  ["ansday30", "day30"],
  ["ansday3", "day3"],
  /* The same ladders in weeks (item 57). */
  ["wklogin2", "wkans2"], ["wkans2", "wk2"],
  ["wklogin4", "wkans4"], ["wkans4", "wk4"],
  ["wklogin8", "wkans8"], ["wkans8", "wk8"],
  ["wklogin12", "wkans12"], ["wkans12", "wk12"],
  ["wklogin20", "wkans20"], ["wkans20", "wk20"],
  ["wklogin30", "wkans30"], ["wkans30", "wk30"],
  /* Answering beats being right, and one day beats one sitting. */
  ["d10", "sess25"],
  ["d50", "sess50"],
  /* Collecting words at large beats collecting them in one word class. */
  ["coll10", "coll_kk_25"],
  ["coll100", "coll_kk_100"],
  /* Touching several skills in a sitting is easier than in a whole day (the
     day badge starts at 7 for exactly this reason), which is easier than
     touching every one of them, which is easier than doing that two days
     running. */
  ["multi_sess_3", "multi_day_7"],
  ["multi_day_7", "multi_all_day"],
  ["multi_all_day", "multi_all_sess"],
  ["multi_all_sess", "multi_streak_2"],
  /* Meeting one rare word is easier than meeting twenty-five. */
  ["coll_rare", "coll_rare25"],
  /* Everything is easier than everything. */
  ["run100", "all_badges"],
  ["all_badges", "all_badges_words"],
];

/**
 * Expand `CONSISTENCY` against a badge catalogue into concrete id pairs.
 * A rule naming a badge that does not exist is dropped rather than failing —
 * a skill can be removed, and the rule about it then simply has nothing to say.
 */
export function consistencyPairs(badges, skillIds) {
  const have = new Set(badges.map((b) => b.id));
  const out = [];
  for (const [a, b] of CONSISTENCY) {
    const slots = a.includes("<skill>") || b.includes("<skill>") ? skillIds : [null];
    for (const s of slots) {
      const x = s ? a.replace("<skill>", s) : a;
      const y = s ? b.replace("<skill>", s) : b;
      if (have.has(x) && have.has(y)) out.push([x, y]);
    }
  }
  return out;
}

/** Base rarity of one badge, with no data about users at all. */
export function baseRarity(b) {
  const share = estimateShare(b);
  if (share == null) return null;
  return { holders: null, users: null, share, tier: tierFor(share),
           estimated: true, weight: 0, raw: null };
}

/* ---------- measured rarity --------------------------------------------- */

/** On how many days has this user answered anything? */
export const activeDays = (S) =>
  Object.values((S && S.days) || {}).filter((d) => (d && d.a) > 0).length;

/** Does this user qualify for the measurement? */
export const isQualified = (S) => activeDays(S) >= MIN_DAYS;

/** May a real rarity be computed from these statistics? */
export const measurable = (stats) => !!stats && (stats.qualified ?? 0) >= MIN_USERS;

/* The guess does not switch off at MIN_USERS, it fades out.
 *
 * With twelve qualified users a raw share can only be 0/12, 1/12, 2/12 …: every
 * badge nobody happens to hold would become Goðsagnakennt at a stroke, and
 * Sögulegt (0.5–2%) is not reachable at all below fifty users. So the guess is
 * given the weight of PRIOR_USERS imaginary users and the real ones are added:
 *
 *     share = (holders + PRIOR_USERS · guess) / (qualified + PRIOR_USERS)
 *
 * 12 users and nobody holding a badge guessed at 0.90 -> 41%; 100 users -> 8%;
 * 1,000 users -> 0.9%. No cliff anywhere. `weight` says how much of the answer
 * is measurement, and `raw` carries the unblended count for the hover text. */

/** How much a guess is worth, in users. */
export const PRIOR_USERS = MIN_USERS;

/** No badge at all, or a badge with no guess: assume nothing. */
const NO_GUESS = 0.5;

/**
 * Rarity of one badge: blended with the guess when there is a measurement,
 * guessed otherwise. `estimated` says which.
 *
 * @param {?object} stats  { qualified: 12, users: 15, badges: { run10: 8, … } }
 * @param {string}  id     the badge id
 * @param {?object} badge  the badge itself, for the guess
 */
export function rarityOf(stats, id, badge = null) {
  if (measurable(stats)) {
    const holders = (stats.badges || {})[id] ?? 0;
    const guess = estimateShare(badge) ?? NO_GUESS;
    const share = (holders + PRIOR_USERS * guess) / (stats.qualified + PRIOR_USERS);
    return {
      holders, users: stats.qualified, share, tier: tierFor(share),
      estimated: false,
      /* 0 = all guess, 1 = all measurement. Reaches 0.9 at ninety users. */
      weight: stats.qualified / (stats.qualified + PRIOR_USERS),
      /* The unblended figure, for anyone who wants to show the raw count. */
      raw: holders / stats.qualified,
    };
  }
  return baseRarity(badge);
}

/* How many badge windows one answer may open.
 *
 * Every badge won is written into the cabinet (`app.awardBadge`) — most are
 * thresholds a run passes through once, and a suppressed award would be lost
 * for good. What is bounded is the queue of windows between the child and the
 * next question:
 *
 *   1. everything rarer than Sjaldgæft is celebrated, however many;
 *   2. then two more, rarest first, and stop.
 *
 * With nothing rare in the batch the ceiling is a flat three, rarest first.
 * The badges that got no window are named on the last one that did.
 *
 * @param {object[]} won    the badges this answer earned, in catalogue order
 * @param {?object}  stats  badge statistics, or null (the guess then decides)
 * @returns {{show: object[], quiet: object[]}}
 */
export const RARE_FROM_TIER = "mjogsjaldgaeft";
/** How many commoner badges may follow the rare ones. */
export const EXTRA_AFTER_RARE = 2;
/** The ceiling when nothing rare was won at all. */
export const PLAIN_CEILING = 3;

/**
 * Where a badge sits on the ladder: 0 = Algengt … 5 = Goðsagnakennt. An
 * unknown badge counts as the commonest, so it can never push a known one out
 * of a window.
 */
export function tierRank(badge, stats = null) {
  const r = rarityOf(stats, badge && badge.id, badge);
  const tier = r && r.tier;
  const i = tier ? TIERS.findIndex((t) => t.id === tier.id) : -1;
  return i < 0 ? 0 : i;
}

const RARE_RANK = TIERS.findIndex((t) => t.id === RARE_FROM_TIER);

export function badgeWindows(won, stats = null) {
  const list = [].concat(won || []).filter(Boolean);
  if (list.length <= PLAIN_CEILING) return { show: list, quiet: [] };

  /* Rarest first. `index` keeps the sort stable, so two badges of the same tier
     stay in catalogue order and the same answer always celebrates the same
     ones — a ceiling that reordered itself between runs would be untestable. */
  const ranked = list
    .map((b, index) => ({ b, index, rank: tierRank(b, stats) }))
    .sort((x, y) => y.rank - x.rank || x.index - y.index);

  const rare = ranked.filter((x) => x.rank >= RARE_RANK);
  const rest = ranked.filter((x) => x.rank < RARE_RANK);
  const chosen = rare.length
    ? [...rare, ...rest.slice(0, EXTRA_AFTER_RARE)]
    : ranked.slice(0, PLAIN_CEILING);

  const keep = new Set(chosen.map((x) => x.index));
  return {
    show: chosen.map((x) => x.b),
    /* In catalogue order, not tier order: the cabinet is not a ranking. */
    quiet: ranked.filter((x) => !keep.has(x.index))
      .sort((x, y) => x.index - y.index).map((x) => x.b),
  };
}

/**
 * Where the windows of a batch of won badges go (critique item 61).
 *
 * Every badge is in the cabinet the moment it is won; this decides only WHEN
 * its window opens. A window between two questions breaks the thought the
 * session is made of, so while a session is open (`inSession`: a run, which
 * also covers "Þrjár í röð" and the worked example, both of which live inside
 * one) nothing opens: the badges are `held` and the summary, which lists every
 * one of them, is where they are celebrated, once (`badgeWindows` on what the
 * run collected). Outside a session — a rescue drill, a duel, the start of the
 * program — the ceiling above applies as before.
 *
 * @returns {{show: object[], quiet: object[], held: object[]}}
 */
export function windowsFor(won, stats = null, { inSession = false } = {}) {
  const list = [].concat(won || []).filter(Boolean);
  if (inSession) return { show: [], quiet: [], held: list };
  return { ...badgeWindows(list, stats), held: [] };
}

/* Word rarity.
 *
 * The corpus frequency score (`q`, from freq_lemmas.json via build_bundle.py)
 * says how often the lemma occurs in a large body of spoken Icelandic. Rank
 * within a word class, which was used before, measured the wrong thing: the
 * 1,200th commonest masculine noun is not a rare word, and *vindur* came back
 * as a rare find. The cut-points were read off the real distribution against
 * words a thirteen-year-old uses without thinking; nothing a child says weekly
 * reaches green. */
export const WORD_TIERS = [
  { tier: "algengt",        min: 100 },
  { tier: "oalgengt",       min: 40 },
  { tier: "sjaldgaeft",     min: 12 },
  { tier: "mjogsjaldgaeft", min: 4 },
  { tier: "sogulegt",       min: 1.5 },
  { tier: "godsagnakennt",  min: 0 },
];

/**
 * Corpus score -> tier. A word with no score is unknown, not legendary; the
 * bundle gives homograph look-ups an inherited score rather than zero.
 */
export function wordTier(q) {
  if (q == null || Number.isNaN(q)) return null;
  const row = WORD_TIERS.find((t) => q >= t.min) || WORD_TIERS[WORD_TIERS.length - 1];
  return tierById(row.tier);
}

/**
 * The tier a word must reach to count as a rare find for the badges: blue and
 * above, 6% of the vocabulary. Green is a fifth of every word and no find.
 */
export const RARE_WORD_TIER = "mjogsjaldgaeft";

/** Corpus score at or above which a word is *not* a rare find. */
export const RARE_MAX_Q = WORD_TIERS[
  WORD_TIERS.findIndex((t) => t.tier === RARE_WORD_TIER) - 1].min;

/** Is this corpus score rare enough to count towards the rare-find badges? */
export const isRareScore = (q) =>
  q != null && !Number.isNaN(q) && q < RARE_MAX_Q;

/**
 * How many children have met this word. No guess here — which words a child
 * meets is decided by the pool, not by difficulty — so below the threshold the
 * answer is `null` and the interface says nothing.
 */
export function wordRarity(stats, key) {
  if (!measurable(stats)) return null;
  const holders = (stats.words || {})[key] ?? 0;
  const share = holders / stats.qualified;
  return { holders, users: stats.qualified, share, tier: tierFor(share), estimated: false };
}

/**
 * Readable share: two decimals below ten percent, one above, "<0.01%" when it
 * would round away, trailing zeros trimmed. A full stop as the separator, as
 * everywhere else in the interface.
 */
export function shareText(share) {
  if (share == null || Number.isNaN(share)) return "óþekkt";
  const pct = share * 100;
  if (pct <= 0) return "0%";
  if (pct < 0.01) return "<0.01%";
  let s = pct < 10 ? pct.toFixed(2) : pct.toFixed(1);
  if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, "");
  return s + "%";
}

/* The monthly snapshot.
 *
 * The figure itself is computed from live states on every request, so it is
 * never stale. What the snapshot adds is a record of where it stood, so the
 * interface can say when a badge's tier last moved and which way. The server
 * writes one per calendar month (`rarity-history.json`) the first time anyone
 * asks in a new month; nothing has to run at midnight. */

/** "2026-08". The key a snapshot is filed under. */
export const monthKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/** The first day of the month after this one, as a Date. */
export const nextRefresh = (d = new Date()) =>
  new Date(d.getFullYear(), d.getMonth() + 1, 1);

/**
 * How a badge has moved since the last snapshot: `{ from, to, rarer }`, or
 * `null` when there is nothing to compare. Only a change of TIER is reported;
 * a share drifting from 31% to 30% is noise.
 */
export function tierMove(previous, current, id, badge = null) {
  if (!previous || !current) return null;
  if (!(previous.qualified > 0) || !(current.qualified > 0)) return null;
  const before = (previous.badges || {})[id];
  const now = (current.badges || {})[id];
  if (before == null || now == null) return null;
  /* Blended both ends, or the arrow would contradict the chip it sits on: the
     chip shows the blended tier and this would be comparing raw ones. */
  const guess = estimateShare(badge) ?? NO_GUESS;
  const blend = (h, q) => (h + PRIOR_USERS * guess) / (q + PRIOR_USERS);
  const from = tierFor(blend(before, previous.qualified));
  const to = tierFor(blend(now, current.qualified));
  if (!from || !to || from.id === to.id) return null;
  return { from, to, rarer: TIERS.indexOf(to) > TIERS.indexOf(from) };
}

/**
 * What the server collects per user: badge ids, word keys and active days.
 * Counts only, no personal data.
 */
export function contribution(S) {
  return {
    badges: Object.keys((S && S.badges) || {}),
    words: Object.keys((S && S.words) || {}),
    days: activeDays(S),
  };
}

/**
 * Fold many users' contributions into one set of statistics. Pure, so the
 * server and the tests run the same code. Only qualified users count towards
 * `badges` and `words`; `users` is the whole group.
 */
export function aggregate(contributions) {
  const badges = {}, words = {};
  const list = contributions || [];
  const fit = list.filter((c) => (c.days ?? 0) >= MIN_DAYS);
  fit.forEach((c) => {
    new Set(c.badges || []).forEach((id) => { badges[id] = (badges[id] || 0) + 1; });
    new Set(c.words || []).forEach((k) => { words[k] = (words[k] || 0) + 1; });
  });
  return { users: list.length, qualified: fit.length, badges, words };
}
