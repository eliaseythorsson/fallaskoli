/* The leaderboard — a pure transformation from state into sortable numbers,
   with no DOM and no web requests, so the server and the browser produce the
   same ordering. Seven metrics: this week's XP, level, XP, badges, words
   found, the vocabulary score (v6.6) and time. The week comes first because it is the one race everybody can
   still win: it starts again from nothing every Monday. */

import { overallLevel } from "./progress.js";
import { collectionSummary } from "./collection.js";
import { vocabScore, rescueCount } from "./wordhealth.js";
import { duelTotals } from "./duel.js";
import { crestOf } from "./profile.js";
import { weekXp, weekKey, showcaseOf, titleOf, tiersOf } from "./social.js";

export const METRICS = [
  { id: "week",    nm: "Vikan",       fmt: (v) => v.toLocaleString("is-IS") + " XP" },
  { id: "level",   nm: "Stig",        fmt: (v) => String(v) },
  { id: "xp",      nm: "XP",          fmt: (v) => v.toLocaleString("is-IS") },
  { id: "badges",  nm: "Merki",       fmt: (v) => String(v) },
  { id: "words",   nm: "Orð í safni", fmt: (v) => String(v) },
  /* v6.6: words found, weighted by how well they are held — a word in trouble
     counts nothing until it is rescued (core/wordhealth.js `vocabScore`). */
  { id: "vocab",   nm: "Orðaforði",   fmt: (v) => v.toLocaleString("is-IS") },
  /* v6.7: duels won. */
  { id: "duels",   nm: "Einvígi",     fmt: (v) => String(v) },
  { id: "minutes", nm: "Mínútur",     fmt: (v) => String(v) },
];

/**
 * What is sent to the server. Deliberately small: no dates, no per-answer
 * trails, nothing the child has written. Only sortable numbers and the name it
 * chose for itself.
 */
export function scorecard(S, lex, now = new Date()) {
  const coll = collectionSummary(S, lex);
  const vocab = vocabScore(S, lex);
  const ms = Object.values(S.days || {}).reduce((a, d) => a + (d.ms || 0), 0);
  return {
    profile: S.profile?.id || "local",
    name: S.profile?.name || "",
    /* The best level ever reached, not today's: XP fades during a long break
       (core/progress.js `applyDecay`) and a child who comes back should not
       find they were demoted in public while they were away. */
    level: Math.max(S.bestLevel || 1, overallLevel(S.xp).level),
    /* XP earned since Monday. A number about a week, never about a day. */
    week: weekXp(S, weekKey(now)),
    xp: S.xp || 0,
    badges: Object.keys(S.badges || {}).length,
    words: coll.total,
    /* The vocabulary score, the share of judged words in good health (null
       below twenty judged words: a share of five words says nothing) and how
       many words a rescue drill has saved. Numbers, like everything here. */
    vocab: vocab.score,
    health: vocab.health,
    rescued: rescueCount(S),
    /* Duels won and played (v6.7). Counts only. */
    duels: duelTotals(S).wins,
    duelsPlayed: duelTotals(S).played,
    minutes: Math.round(ms / 60000),
    /* No `updated` any more (v6.3): the day somebody last practised is a date,
       and docs/API.md promises that no date leaves a state. */

    /* The meta badges follow the user into the leaderboard: the gold colour
       and the crown should be visible there, not only on their own badge
       tab. */
    crest: crestOf(S).crest,
    crown: crestOf(S).crown,
    /* The badges others may see — ids, nothing else. The descriptions live in
       the program itself, so this list cannot leak anything about the child.
       Kept separate, because `/leaderboard` may omit them
       (`?include=badges`). */
    badgeIds: Object.keys(S.badges || {}),

    /* What the child chose to show (core/social.js). All ids and numbers:
       `title` is "rank:7" or "badge:s_night", `showcase` up to three badge
       ids the state really holds, `tiers` the medal (1–3) on a badge won many
       times. */
    title: titleOf(S),
    showcase: showcaseOf(S).ids,
    tiers: tiersOf(S),
  };
}

/** Ordering by one metric, highest first, with equal placings on a tie. */
export function rank(cards, metric = "week") {
  const key = METRICS.some((m) => m.id === metric) ? metric : "week";
  const sorted = [...cards].sort((a, b) =>
    (b[key] ?? 0) - (a[key] ?? 0) ||
    String(a.name || a.profile).localeCompare(String(b.name || b.profile), "is"));
  let place = 0, prev = null;
  return sorted.map((c, i) => {
    if (c[key] !== prev) { place = i + 1; prev = c[key]; }
    return { ...c, place, metric: key, value: c[key] ?? 0 };
  });
}
