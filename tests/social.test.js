/* What users see of each other (v6.1): the week, the shelf, the title, the
   rumours and the badges only other people can give. Rules, not particular
   children — and the one rule that matters most is pinned first: nothing here
   sends a date or a word the child wrote. */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  weekKey, prevWeekKey, weekDays, weekXp, medalOf, tiersOf, showcaseOf, togglePin,
  titlesOf, titleOf, titleText, newThisWeek, firstFinders, weekResult,
  socialContext, windowed, compare, feed, holders, SHOWCASE_MAX,
} from "../src/js/core/social.js";
import { scorecard, rank, METRICS } from "../src/js/core/leaderboard.js";
import { BADGES, checkBadges, JOL_IDS, META_IDS } from "../src/js/core/badges.js";
import { blankState, migrate, newSession, badgeContext } from "../src/js/core/state.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { collectionSummary } from "../src/js/core/collection.js";
import { overallNeed } from "../src/js/core/progress.js";

const { DATA } = await import("../data/data_bundle.js");
const lex = buildLexicon(DATA);
const byId = (id) => BADGES.find((b) => b.id === id);
const won = (date = "2026-11-02", n = 1) => ({ n, dates: [date], first: date, last: date });

/* ---------- the week ----------------------------------------------------- */

test("a week runs Monday to Sunday", () => {
  assert.equal(weekKey(new Date(2026, 10, 9)), "2026-11-09");    // a Monday
  assert.equal(weekKey(new Date(2026, 10, 15)), "2026-11-09");   // the Sunday after
  assert.equal(weekKey(new Date(2026, 10, 16)), "2026-11-16");
  assert.equal(prevWeekKey("2026-11-09"), "2026-11-02");
  assert.equal(prevWeekKey("2026-01-05"), "2025-12-29", "across the new year");
  assert.deepEqual(weekDays("2026-11-09").slice(-1), ["2026-11-15"]);
});

test("the week's XP counts that week and nothing else", () => {
  const S = blankState();
  S.days = {
    "2026-11-08": { xp: 500 },        // the Sunday before
    "2026-11-09": { xp: 40 }, "2026-11-15": { xp: 60 },
    "2026-11-16": { xp: 900 },        // the Monday after
  };
  assert.equal(weekXp(S, "2026-11-09"), 100);
  assert.equal(weekXp(blankState(), "2026-11-09"), 0);
});

test("the week is a metric like the others (the board opens on Framfarir since item 58)", () => {
  assert.equal(METRICS[0].id, "framfarir");
  assert.equal(METRICS[1].id, "week");
  const S = blankState();
  S.days = { "2026-11-10": { xp: 75 } };
  const card = scorecard(S, lex, new Date(2026, 10, 12));
  assert.equal(card.week, 75);
  assert.equal(scorecard(S, lex, new Date(2026, 10, 17)).week, 0, "a new week starts from nothing");
  const r = rank([{ profile: "a", week: 5 }, { profile: "b", week: 50 }], "week");
  assert.equal(r[0].profile, "b", "rank() by the week");
});

test("the level on the board is the best ever reached, so a break never demotes", () => {
  const S = blankState();
  S.xp = overallNeed(3);            // faded back to level 3 …
  S.bestLevel = 6;                  // … from level 6
  assert.equal(scorecard(S, lex).level, 6);
});

/* ---------- medals, shelf, title ----------------------------------------- */

test("a badge won often wears a medal: 3, 10, 25", () => {
  assert.equal(medalOf(1), null);
  assert.equal(medalOf(2), null);
  assert.equal(medalOf(3).tier, 1);
  assert.equal(medalOf(10).tier, 2);
  assert.equal(medalOf(25).tier, 3);
  assert.equal(medalOf(400).tier, 3);
  const S = blankState();
  S.badges = { run5: won("2026-01-01", 12), run10: won("2026-01-01", 2), nonsense: won("2026-01-01", 99) };
  assert.deepEqual(tiersOf(S), { run5: 2 }, "numbers only, and only for real badges");
});

test("the shelf holds three, only badges the state owns, and fills itself when empty", () => {
  const S = blankState();
  assert.deepEqual(showcaseOf(S), { ids: [], auto: true });
  S.badges = { run5: won(), s_night: won(), s_leapday: won(), tot50: won(), run100: won() };
  const auto = showcaseOf(S);
  assert.equal(auto.auto, true);
  assert.equal(auto.ids.length, SHOWCASE_MAX);
  assert.ok(auto.ids.includes("s_leapday") && auto.ids.includes("run100"),
    "with nothing pinned the rarest are shown: " + auto.ids);

  /* A pinned badge the child does not hold is dropped — the list comes back
     from a browser and must not be a way to wear something unearned. */
  S.showcase = ["all_badges", "run5", "s_night", "tot50", "run100"];
  assert.deepEqual(showcaseOf(S).ids, ["run5", "s_night", "tot50"]);
});

test("pinning toggles, and a full shelf refuses a fourth", () => {
  const S = blankState();
  S.badges = { run5: won(), s_night: won(), tot50: won(), run100: won() };
  assert.equal(togglePin(S, "run5"), true);
  assert.deepEqual(S.showcase, ["run5"]);
  togglePin(S, "s_night"); togglePin(S, "tot50");
  assert.equal(togglePin(S, "run100"), false, "the fourth should be refused");
  assert.equal(togglePin(S, "run5"), true);
  assert.deepEqual(S.showcase, ["s_night", "tot50"]);
  assert.equal(togglePin(S, "not_mine"), false);
});

test("a title is an id, unlocked by level or by a badge with a story", () => {
  const S = blankState();
  assert.equal(titleOf(S), "rank:1");
  assert.equal(titleText("rank:1"), "Byrjandi");
  S.bestLevel = 5;
  S.badges = { s_night: won(), run5: won() };
  const ids = titlesOf(S).map((t) => t.id);
  assert.deepEqual(ids.slice(0, 5), ["rank:5", "rank:4", "rank:3", "rank:2", "rank:1"]);
  assert.ok(ids.includes("badge:s_night"), "a secret lends its name");
  assert.ok(!ids.includes("badge:run5"), "'5 í röð' is not a title");
  assert.equal(titleText("badge:s_night"), "Náttugla");

  S.title = "badge:s_night";
  assert.equal(titleOf(S), "badge:s_night");
  S.title = "rank:9";                              // not reached
  assert.equal(titleOf(S), "rank:5", "an unearned title falls back to the rank");
  S.title = "Ég heiti Jón og bý á Akureyri";       // free text
  assert.equal(titleOf(S), "rank:5");
  assert.equal(titleText("Ég heiti Jón"), null, "free text is never a title");
});

test("the scorecard's new fields are ids and numbers — an allowlist of shapes", () => {
  const S = blankState();
  S.bestLevel = 4;
  S.badges = { run5: won("2026-08-01", 30), s_night: won("2026-08-02") };
  S.title = "badge:s_night";
  S.showcase = ["s_night"];
  const card = scorecard(S, lex);
  assert.match(card.title, /^(rank:\d+|badge:[a-z0-9_]+)$/);
  card.showcase.forEach((id) => assert.match(id, /^[a-z0-9_]+$/));
  Object.entries(card.tiers).forEach(([id, t]) => {
    assert.match(id, /^[a-z0-9_]+$/);
    assert.ok([1, 2, 3].includes(t));
  });
  assert.equal(JSON.stringify(card).includes("2026-08-0"), false, "a badge date went out");
});

test("showcase, title and the overtaking memo survive a save and a load", () => {
  const S = blankState();
  S.showcase = ["run5", 7, "s_night", "a", "b"];
  S.title = "rank:2";
  S.social = { week: "2026-11-09", ahead: ["x"] };
  const back = migrate(JSON.parse(JSON.stringify(S)));
  assert.deepEqual(back.showcase, ["run5", "s_night", "a"]);
  assert.equal(back.title, "rank:2");
  assert.deepEqual(back.social, { week: "2026-11-09", ahead: ["x"] });
  assert.deepEqual(migrate({ xp: 10 }).showcase, [], "an older state gets an empty shelf");
});

/* ---------- what the server works out from the dates ---------------------- */

test("'new this week' is a list of ids, bounded by the week", () => {
  const S = blankState();
  S.badges = {
    run5: won("2026-11-08"), s_night: won("2026-11-09"), tot50: won("2026-11-15"),
    run10: won("2026-11-16"), ghost: won("2026-11-10"),
  };
  assert.deepEqual(newThisWeek(S, "2026-11-09").sort(), ["s_night", "tot50"]);
});

test("first finder is the earliest date; a tie is nobody's", () => {
  const states = [
    { id: "a", state: { badges: { s_night: won("2026-03-01"), run5: won("2026-03-05"), tot50: won("2026-03-02") } } },
    { id: "b", state: { badges: { s_night: won("2026-03-04"), run5: won("2026-03-05"), s_42: won("2026-04-01") } } },
  ];
  const f = firstFinders(states);
  assert.deepEqual(f.a.sort(), ["s_night", "tot50"]);
  assert.deepEqual(f.b, ["s_42"]);
});

test("a week needs three players for a champion and five for a podium; ties share", () => {
  assert.deepEqual(weekResult("w", [{ profile: "a", xp: 9 }, { profile: "b", xp: 5 }]).champions, [],
    "two players are not a league");
  const three = weekResult("w", [
    { profile: "a", xp: 90 }, { profile: "b", xp: 90 }, { profile: "c", xp: 5 }, { profile: "d", xp: 0 }]);
  assert.equal(three.players, 3, "somebody who earned nothing did not play");
  assert.deepEqual(three.champions.sort(), ["a", "b"]);
  assert.deepEqual(three.podium, []);
  const five = weekResult("w", [50, 40, 30, 20, 10].map((xp, i) => ({ profile: "p" + i, xp })));
  assert.deepEqual(five.champions, ["p0"]);
  assert.deepEqual(five.podium, ["p0", "p1", "p2"]);
});

/* ---------- the browser's half ------------------------------------------- */

const row = (profile, week, xp = 100 + week) => ({ profile, name: profile, week, xp });

test("overtaking is noticed by who was ahead, not by the place number", () => {
  const week = "2026-11-09";
  let r = socialContext({ me: "me", board: [row("a", 50), row("me", 10)], week, memo: null });
  assert.equal(r.ctx.overtook, false, "the first look has nothing to compare with");
  assert.deepEqual(r.memo, { week, ahead: ["a"] });

  r = socialContext({ me: "me", board: [row("a", 50), row("me", 60)], week, memo: r.memo });
  assert.equal(r.ctx.overtook, true);
  assert.deepEqual(r.memo.ahead, []);

  /* A newcomer below me, or drawing level, is not overtaking anybody. */
  r = socialContext({ me: "me", board: [row("a", 60), row("me", 60), row("new", 1)], week,
                      memo: { week, ahead: ["a"] } });
  assert.equal(r.ctx.overtook, false);

  /* Last week's memory says nothing about this week. */
  r = socialContext({ me: "me", board: [row("a", 5), row("me", 60)], week,
                      memo: { week: "2026-11-02", ahead: ["a"] } });
  assert.equal(r.ctx.overtook, false);
});

test("champion, podium, tie, pioneer, unique and twins read the server's answer", () => {
  const roster = [
    { profile: "me", badgeIds: ["run5", "s_night", "s_42"], firstIds: ["s_night", "run5"], newIds: ["s_42"] },
    { profile: "a", badgeIds: ["run5", "s_42"], newIds: ["s_42"] },
    { profile: "b", badgeIds: ["run5"] },
    { profile: "c", badgeIds: [] }, { profile: "d", badgeIds: [] },
  ];
  const board = [row("me", 10, 777), row("a", 5, 777), row("b", 1, 20)];
  const { ctx } = socialContext({
    me: "me", roster, board, week: "2026-11-09",
    result: { week: "2026-11-02", champions: ["me"], podium: ["me", "a"], players: 5 },
  });
  assert.deepEqual(ctx, { lastWeek: "2026-11-02", champion: true, podium: true, overtook: false,
                          pioneer: true, unique: true, tie: true, twins: true });

  const quiet = socialContext({ me: "b", roster, board, week: "2026-11-09", result: null }).ctx;
  assert.deepEqual(quiet, { lastWeek: null, champion: false, podium: false, overtook: false,
                            pioneer: false, unique: false, tie: false, twins: false });
});

test("being first to a COMMON badge is not pioneering, and a small roster has no 'unique'", () => {
  const roster = [
    { profile: "me", badgeIds: ["run5", "s_night"], firstIds: ["run5"] },
    { profile: "a", badgeIds: [] }, { profile: "b", badgeIds: [] },
  ];
  const { ctx } = socialContext({ me: "me", roster, board: [] });
  assert.equal(ctx.pioneer, false);
  assert.equal(ctx.unique, false, "with three people 'nobody else has it' is not a feat");
});

test("a long board shows the top three and my neighbourhood", () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({ profile: "p" + i, place: i + 1 }));
  assert.equal(windowed(rows.slice(0, 8), "p5").length, 8, "a short board is shown whole");
  const w = windowed(rows, "p14");
  assert.deepEqual(w.filter((r) => !r.gap).map((r) => r.profile),
    ["p0", "p1", "p2", "p12", "p13", "p14", "p15", "p16"]);
  assert.deepEqual(w.filter((r) => r.gap).map((r) => r.skipped), [9, 13]);
  assert.equal(windowed(rows, "p1").filter((r) => !r.gap).length, 4, "near the top the two overlap");
  assert.ok(windowed(rows, "nobody").some((r) => r.gap));
});

test("comparing two shelves, and counting who holds what", () => {
  assert.deepEqual(compare(["a", "b"], ["b", "c"]), { both: ["b"], onlyMine: ["a"], onlyTheirs: ["c"] });
  assert.deepEqual(holders([{ badgeIds: ["x", "x", "y"] }, { badgeIds: ["x"] }]), { x: 2, y: 1 });
});

test("the feed is this week's finds, rarest first, and never a date", () => {
  const roster = [
    { profile: "a", name: "Anna", newIds: ["run5", "s_leapday"], firstIds: ["s_leapday"] },
    { profile: "me", name: "Ég", newIds: ["tot50"] },
  ];
  const f = feed(roster, "me");
  assert.equal(f[0].id, "s_leapday");
  assert.equal(f[0].first, true);
  assert.equal(f.find((x) => x.id === "tot50").mine, true);
  assert.equal(/\d{4}-\d{2}-\d{2}/.test(JSON.stringify(f)), false);
});

/* ---------- the new badges ----------------------------------------------- */

const ctxAt = (d, extra = {}) => {
  const S = blankState();
  return badgeContext(S, newSession(S), extra, d);
};
const fires = (id, ctx, owned = {}) =>
  checkBadges(ctx, owned, {}, BADGES.filter((b) => b.id === id || owned[b.id])).some((b) => b.id === id);

test("social badges are judged only when the server's picture arrives", () => {
  const social = { lastWeek: "2026-11-02", champion: true };
  assert.equal(fires("soc_champ", ctxAt(new Date(), { social })), false,
    "an ordinary answer must not award it");
  assert.equal(fires("soc_champ", ctxAt(new Date(), { social, when: "social" })), true);
  assert.equal(fires("soc_champ", ctxAt(new Date(), { social: null, when: "social" })), false);
});

test("champion comes once per finished week, however often the program is opened", () => {
  const cat = BADGES.filter((b) => b.id === "soc_champ");
  const periods = {};
  const go = (wk) => checkBadges(
    ctxAt(new Date(), { when: "social", social: { lastWeek: wk, champion: true } }),
    {}, {}, cat, periods).length;
  assert.equal(go("2026-11-02"), 1);
  assert.equal(go("2026-11-02"), 0, "a second load in the same week gave it again");
  assert.equal(go("2026-11-09"), 1, "the next week's win should count");
});

test("'Öll merkin' does not ask for the badges only a server can give", () => {
  const owned = {};
  BADGES.filter((b) => !b.social && !META_IDS.includes(b.id)).forEach((b) => { owned[b.id] = { n: 1 }; });
  const ctx = ctxAt(new Date());
  const got = checkBadges(ctx, owned, {}, BADGES);
  assert.ok(got.some((b) => b.id === "all_badges"),
    "a child practising from a file can no longer win everything");
  assert.ok(BADGES.filter((b) => b.social).length >= 5);
  BADGES.filter((b) => b.social).forEach((b) => assert.ok(["social", "duel"].includes(b.when), b.id));
});

test("thirteen Yule Lads, one a day from 12 December, and one badge to close the set", () => {
  assert.equal(JOL_IDS.length, 13);
  assert.equal(byId("jol_1").nm, "Stekkjarstaur");
  assert.equal(byId("jol_13").nm, "Kertasníkir");
  for (let i = 0; i < 13; i++) {
    const day = new Date(2026, 11, 12 + i, 16, 0);
    const got = JOL_IDS.filter((id) => fires(id, ctxAt(day)));
    assert.deepEqual(got, [`jol_${i + 1}`], `${12 + i}. desember`);
  }
  assert.equal(JOL_IDS.some((id) => fires(id, ctxAt(new Date(2026, 11, 25)))), false);
  assert.equal(JOL_IDS.some((id) => fires(id, ctxAt(new Date(2026, 10, 12)))), false, "November");

  /* The closing badge: twelve in the cabinet and the thirteenth won now. */
  const owned = {};
  JOL_IDS.slice(0, 12).forEach((id) => { owned[id] = { n: 1 }; });
  const cat = BADGES.filter((b) => b.set === "jol");
  const on24 = checkBadges(ctxAt(new Date(2026, 11, 24, 10)), owned, {}, cat).map((b) => b.id);
  assert.deepEqual(on24, ["jol_13", "jol_all"]);
  const on23 = checkBadges(ctxAt(new Date(2026, 11, 23, 10)), owned, {}, cat).map((b) => b.id);
  assert.ok(!on23.includes("jol_all"), "the set closed with one lad missing");
});

test("the calendar badges land on their days", () => {
  const on = (id, y, m, d) => fires(id, ctxAt(new Date(y, m, d, 15)));
  assert.ok(on("s_tunga", 2026, 10, 16) && !on("s_tunga", 2026, 10, 15));
  /* v6.9: bóndadagur, konudagur, skammdegi, sólstöður and pí-dagur are
     retired and never fire again. */
  for (const id of ["s_bondadagur", "s_konudagur", "s_skammdegi", "s_solstodur", "s_pi"])
    assert.ok(!on(id, 2026, 0, 23) && !on(id, 2026, 11, 21), id);
});

test("the accident badges read the shape of what happened", () => {
  const now = new Date(2026, 4, 5, 15);
  /* v6.9: the XP-number badges and "Gullfiskaminni" (a badge FOR a wrong
     answer) are retired. */
  assert.ok(!fires("s_xp1944", ctxAt(now, { xp: 1944 })));
  assert.ok(!fires("s_goldfish", ctxAt(now, { goldfish: true })));
  assert.ok(fires("s_slip3", ctxAt(now, { slipRun: 3 })) && !fires("s_slip3", ctxAt(now, { slipRun: 2 })));
  assert.ok(fires("s_waver", ctxAt(now, { correct: true, pickChanges: 3 })));
  assert.ok(!fires("s_waver", ctxAt(now, { correct: false, pickChanges: 5 })), "wavering and wrong is just wrong");
  assert.ok(fires("s_fourcases", ctxAt(now, { wordCases: 4 })) && !fires("s_fourcases", ctxAt(now, { wordCases: 3 })));
});

test("the alphabet badges count over letters this vocabulary can actually begin with", () => {
  const empty = collectionSummary(blankState(), lex);
  assert.equal(empty.letters, 0);
  assert.ok(empty.lettersTotal >= 25 && empty.lettersTotal <= 32, "letters: " + empty.lettersTotal);

  /* One word for every initial letter there is. */
  const S = blankState();
  const seen = new Set();
  for (const w of lex.all) {
    const ch = String(w.o).toLowerCase().charAt(0);
    if (seen.has(ch) || !/\p{L}/u.test(ch)) continue;
    seen.add(ch);
    S.words[`${w.o}|${w.c}`] = { c: 1, w: 0 };
  }
  const full = collectionSummary(S, lex);
  assert.equal(full.letters, full.lettersTotal);
  const ctx = ctxAt(new Date(2026, 4, 5), { collection: full });
  assert.ok(fires("coll_az", ctx));
  assert.ok(!fires("coll_az", ctxAt(new Date(2026, 4, 5), { collection: empty })));
});

test("every new badge is hidden or shown on purpose, and has a rarity guess", () => {
  for (const id of ["soc_champ", "soc_overtake", "soc_podium", "jol_all"])
    assert.equal(byId(id).hidden, false, id + " is a signpost and should be visible");
  for (const id of ["soc_pioneer", "soc_unique", "soc_tie", "soc_twins", "jol_1", "s_goldfish", "s_tunga"]) {
    assert.equal(byId(id).hidden, true, id + " should be a surprise");
    assert.equal(byId(id).secret, true, id + " should keep its condition to itself");
  }
  assert.ok(!byId("run5").secret && !byId("soc_champ").secret,
    "an ordinary badge is not a rumour on somebody else's shelf");
  assert.ok(byId("lvl15") && byId("lvl20"), "the longer level ladder has no badges at the top");
});
