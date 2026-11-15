/* What users see of each other, and what they can win from each other.
 *
 * Pure functions: no DOM, no requests. The server imports the half that reads
 * states (`weekXp`, `newThisWeek`, `firstFinders`, `weekResult`) and the
 * browser the half that reads the server's answer (`socialContext`, `windowed`,
 * `compare`), so the two cannot disagree about what a week is.
 *
 * The rule from docs/API.md still holds, and this module is where it is easiest
 * to break: NOTHING A CHILD WROTE, AND NO DATE, LEAVES ITS OWN STATE. Everything
 * here that crosses the wire is a badge id, a number, or a week. "New this
 * week" and "found it first" are worked out on the server from the dates and
 * sent as bare id lists; the dates themselves stay where they were.
 */

import { dkey } from "./state.js";
import { BADGES } from "./badges.js";
import { overallRank } from "./progress.js";
import { estimateShare } from "./rarity.js";

const BY_ID = new Map(BADGES.map((b) => [b.id, b]));

/* ---------- the week ----------------------------------------------------- */

const fromKey = (key) => {
  const [y, m, d] = String(key).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

/** The Monday that begins the week `d` falls in, as a day key. */
export function weekKey(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return dkey(x);
}

/** The Monday before this Monday. */
export function prevWeekKey(key) {
  const x = fromKey(key);
  x.setDate(x.getDate() - 7);
  return dkey(x);
}

/** The seven day keys of the week that begins on `monday`. */
export function weekDays(monday) {
  const x = fromKey(monday);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(x.getFullYear(), x.getMonth(), x.getDate() + i);
    return dkey(d);
  });
}

/** XP earned in one week. Earned, not held: decay never touches a day record,
    so a week's score cannot shrink after the fact. */
export function weekXp(S, monday = weekKey()) {
  const days = (S && S.days) || {};
  return weekDays(monday).reduce((a, k) => a + ((days[k] && days[k].xp) || 0), 0);
}

/* ---------- medals on repeatable badges ---------------------------------- */

export const MEDALS = [
  { tier: 3, from: 25, ico: "🥇", nm: "gull" },
  { tier: 2, from: 10, ico: "🥈", nm: "silfur" },
  { tier: 1, from: 3,  ico: "🥉", nm: "brons" },
];

/** The medal a badge won `n` times wears, or null. */
export const medalOf = (n) => MEDALS.find((m) => (n || 0) >= m.from) || null;
export const medalByTier = (t) => MEDALS.find((m) => m.tier === t) || null;

/** { badgeId: 1|2|3 } for the badges that have earned a medal. Numbers only. */
export function tiersOf(S) {
  const out = {};
  for (const [id, rec] of Object.entries((S && S.badges) || {})) {
    const m = BY_ID.has(id) ? medalOf(rec && rec.n) : null;
    if (m) out[id] = m.tier;
  }
  return out;
}

/* ---------- the showcase and the title ----------------------------------- */

export const SHOWCASE_MAX = 3;

const rarest = (ids) => [...ids].sort((a, b) =>
  (estimateShare(BY_ID.get(a)) ?? 1) - (estimateShare(BY_ID.get(b)) ?? 1));

/**
 * The (up to) three badges a user shows beside their name.
 *
 * What the child pinned, minus anything that is not theirs — the list comes
 * back from a browser, and a pinned badge the state does not hold would be a
 * way to wear something unearned. With nothing pinned, the three rarest are
 * shown, so nobody's shelf is empty for want of having found the setting.
 */
export function showcaseOf(S) {
  const owned = Object.keys((S && S.badges) || {}).filter((id) => BY_ID.has(id));
  const have = new Set(owned);
  const pinned = [...new Set(Array.isArray(S && S.showcase) ? S.showcase : [])]
    .filter((id) => have.has(id)).slice(0, SHOWCASE_MAX);
  if (pinned.length) return { ids: pinned, auto: false };
  return { ids: rarest(owned).slice(0, SHOWCASE_MAX), auto: true };
}

/** Pin or unpin one badge. Returns false when the shelf is full. */
export function togglePin(S, id) {
  const cur = showcaseOf(S);
  const list = cur.auto ? [] : cur.ids;
  if (list.includes(id)) { S.showcase = list.filter((x) => x !== id); return true; }
  if (!(S.badges || {})[id] || list.length >= SHOWCASE_MAX) return false;
  S.showcase = [...list, id];
  return true;
}

/* A title is an ID, never text: "rank:7" or "badge:s_night". The words come
   out of the program on the reader's side, so a title cannot carry anything a
   child typed. Badges that lend their name as a title are the ones with a
   story to them — the secrets, the sets, the social ones and the two meta
   badges. "Náttugla" is a title; "25 í lotu" is not. */
const TITLE_GROUPS = new Set(["leyni", "saman", "jól", "yfir", "spakmæli"]);
/* v6.6: a few badges outside those groups carry a name worth wearing
   ("Landhelgisgæslan", "Stálminni") and say so with `title: true`. */
export const grantsTitle = (b) => !!b && (TITLE_GROUPS.has(b.group) || b.title === true);

export function titleText(id) {
  const [kind, key] = String(id || "").split(":");
  if (kind === "rank") {
    const L = parseInt(key, 10);
    return L >= 1 ? overallRank(L) : null;
  }
  if (kind === "badge") {
    const b = BY_ID.get(key);
    return grantsTitle(b) ? b.nm : null;
  }
  return null;
}

/** Every title this state has unlocked, newest rank first. */
export function titlesOf(S) {
  const best = Math.max(1, (S && S.bestLevel) || 1);
  const out = [];
  for (let L = best; L >= 1; L--) out.push({ id: `rank:${L}`, nm: overallRank(L) });
  const seen = new Set(out.map((t) => t.nm));
  const uniq = out.filter((t, i) => out.findIndex((x) => x.nm === t.nm) === i);
  for (const id of Object.keys((S && S.badges) || {})) {
    const b = BY_ID.get(id);
    if (grantsTitle(b) && !seen.has(b.nm)) uniq.push({ id: `badge:${id}`, nm: b.nm });
  }
  return uniq;
}

/** The title in force: the chosen one if it is still unlocked, else the rank. */
export function titleOf(S) {
  const best = Math.max(1, (S && S.bestLevel) || 1);
  const chosen = S && S.title;
  if (chosen && titlesOf(S).some((t) => t.id === chosen)) return chosen;
  return `rank:${best}`;
}

/* ---------- what the server works out from the dates ---------------------- */

/** Badge ids first won in the week beginning `monday`. The ids, not the days. */
export function newThisWeek(S, monday = weekKey()) {
  const days = weekDays(monday);
  const lo = days[0], hi = days[6];
  return Object.entries((S && S.badges) || {})
    .filter(([id, rec]) => BY_ID.has(id) && rec && rec.first >= lo && rec.first <= hi)
    .map(([id]) => id);
}

/**
 * Who found each badge first. `states` is [{ id, state }]; the answer is
 * { profileId: [badgeId, ...] }. A tie on the day is nobody's: "first" should
 * not be decided by which of two files the server happened to read first.
 */
export function firstFinders(states) {
  const best = new Map();                    // badge id -> { date, who: [] }
  for (const { id, state } of states || []) {
    for (const [bid, rec] of Object.entries((state && state.badges) || {})) {
      const date = rec && rec.first;
      if (!date || !BY_ID.has(bid)) continue;
      const cur = best.get(bid);
      if (!cur || date < cur.date) best.set(bid, { date, who: [id] });
      else if (date === cur.date) cur.who.push(id);
    }
  }
  const out = {};
  for (const [bid, { who }] of best) {
    if (who.length === 1) (out[who[0]] ||= []).push(bid);
  }
  return out;
}

export const MIN_LEAGUE = 3;     // players before a week has a champion
export const MIN_PODIUM = 5;     // players before third place means anything

/**
 * How a finished week ended. `scores` is [{ profile, xp }]; only those who
 * earned anything played. Ties share a place, so two children can both be
 * champion — better that than a coin toss between friends.
 */
export function weekResult(week, scores) {
  const played = (scores || []).filter((s) => (s.xp || 0) > 0)
    .sort((a, b) => b.xp - a.xp);
  const players = played.length;
  const top = players ? played[0].xp : 0;
  const third = players >= 3 ? played[2].xp : 0;
  return {
    week, players,
    champions: players >= MIN_LEAGUE ? played.filter((s) => s.xp === top).map((s) => s.profile) : [],
    podium: players >= MIN_PODIUM ? played.filter((s) => s.xp >= third).map((s) => s.profile) : [],
  };
}

/* ---------- what the browser makes of the server's answer ----------------- */

const isSecret = (id) => {
  const b = BY_ID.get(id);
  return !!b && !!b.secret && !b.social;
};

/** How many people on the roster hold each badge. */
export function holders(roster) {
  const out = {};
  for (const u of roster || [])
    new Set(u.badgeIds || []).forEach((id) => { out[id] = (out[id] || 0) + 1; });
  return out;
}

export const MIN_UNIQUE = 5;     // people on the roster before "nobody else" is a feat
export const MIN_PIONEER = 3;

/**
 * The context the social badges are judged on (`c.social` in core/badges.js).
 *
 * @param me       my profile id
 * @param roster   GET /roster
 * @param board    GET /leaderboard, any metric — every row carries xp and week
 * @param result   GET /social `lastWeek`
 * @param memo     S.social: who was ahead of me the last time I looked
 * @returns { ctx, memo } — `memo` is the new value to save
 */
export function socialContext({ me, roster = [], board = [], result = null, memo = null, week = weekKey() }) {
  const mine = roster.find((u) => u.profile === me) || null;
  const others = roster.filter((u) => u.profile !== me);
  const row = board.find((r) => r.profile === me) || null;

  /* Overtaking: somebody who had more XP than me this week, the last time I
     looked, now has less. Remembering WHO was ahead (rather than my place)
     means a newcomer joining below me, or a tie, is never mistaken for it. */
  const ahead = row
    ? board.filter((r) => r.profile !== me && (r.week || 0) > (row.week || 0)).map((r) => r.profile)
    : [];
  const was = memo && memo.week === week ? (memo.ahead || []) : [];
  const overtook = !!row && (row.week || 0) > 0 && was.some((id) => {
    const r = board.find((x) => x.profile === id);
    return r && (r.week || 0) < (row.week || 0);
  });

  const held = holders(others);
  const myIds = (mine && mine.badgeIds) || [];
  const otherNew = new Set(others.flatMap((u) => u.newIds || []));

  return {
    ctx: {
      lastWeek: result ? result.week : null,
      champion: !!result && (result.champions || []).includes(me),
      podium: !!result && (result.podium || []).includes(me),
      overtook,
      pioneer: roster.length >= MIN_PIONEER &&
        ((mine && mine.firstIds) || []).some(isSecret),
      unique: roster.length >= MIN_UNIQUE &&
        myIds.some((id) => BY_ID.has(id) && !BY_ID.get(id).social && !held[id]),
      tie: !!row && (row.xp || 0) > 0 &&
        board.some((r) => r.profile !== me && r.xp === row.xp),
      twins: ((mine && mine.newIds) || []).some((id) => isSecret(id) && otherNew.has(id)),
    },
    memo: { week, ahead },
  };
}

/**
 * The rows of a long board worth showing: the top three, and me with two
 * neighbours either side. A `gap` row stands for the stretch left out. A board
 * of `max` rows or fewer is shown whole.
 */
export function windowed(rows, me, { top = 3, around = 2, max = 8 } = {}) {
  const list = rows || [];
  if (list.length <= max) return list;
  const at = list.findIndex((r) => r.profile === me);
  const keep = new Set();
  for (let i = 0; i < Math.min(top, list.length); i++) keep.add(i);
  if (at >= 0)
    for (let i = Math.max(0, at - around); i <= Math.min(list.length - 1, at + around); i++) keep.add(i);
  const out = [];
  let prev = -1;
  [...keep].sort((a, b) => a - b).forEach((i) => {
    if (i - prev > 1) out.push({ gap: true, skipped: i - prev - 1 });
    out.push(list[i]);
    prev = i;
  });
  if (prev < list.length - 1) out.push({ gap: true, skipped: list.length - 1 - prev });
  return out;
}

/** Two shelves side by side. Ids only; the caller decides what to reveal. */
export function compare(mine, theirs) {
  const a = new Set(mine || []), b = new Set(theirs || []);
  return {
    both: [...a].filter((id) => b.has(id)),
    onlyMine: [...a].filter((id) => !b.has(id)),
    onlyTheirs: [...b].filter((id) => !a.has(id)),
  };
}

/** "New this week", newest people first is not knowable — so rarest first. */
export function feed(roster, me) {
  const out = [];
  for (const u of roster || []) {
    for (const id of u.newIds || []) {
      if (!BY_ID.has(id)) continue;
      out.push({ profile: u.profile, name: u.name, id, mine: u.profile === me,
                 first: (u.firstIds || []).includes(id) });
    }
  }
  return out.sort((x, y) =>
    (estimateShare(BY_ID.get(x.id)) ?? 1) - (estimateShare(BY_ID.get(y.id)) ?? 1));
}
