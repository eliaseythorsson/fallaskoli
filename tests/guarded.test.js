/* Tests for what was built in v5.2: the guard, the clock, the leaderboard and
   the verb cloze. They test rules rather than particular words, so they hold as
   the sentence bank grows. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createClock, IDLE_MS, MAX_PER_ANSWER, fmtDuration } from "../src/js/core/timing.js";
import { scorecard, rank, METRICS } from "../src/js/core/leaderboard.js";
import { blankState, record, newSession } from "../src/js/core/state.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { readMark } from "../src/js/core/marks.js";
import { glossify, abbr, markHTML, ABBR, term } from "../src/js/core/glossary.js";
import { parseRows } from "../src/js/ui/render.js";

/* Read straight from the build's artefact — not from a copy that could go
   stale. */
const { DATA } = await import("../data/data_bundle.js");
const lex = buildLexicon(DATA);

/* ---------- the guard produced usable data ------------------------------ */

test("no sentence holds a mark BÍN does not have for that surface form", () => {
  /* The same check the guard performs during the build, done again on the
     finished data set. If this fails, the parse and BÍN are out of step. */
  let checked = 0;
  for (const r of lex.slotsFor("sagnorð")) {
    assert.ok(r.w.forms[r.t.m], `${r.t.l} vantar mark ${r.t.m}`);
    assert.ok(r.w.forms[r.t.m].some((f) => f.toLowerCase() === r.t.w.toLowerCase()),
      `${r.t.w} is not the ${r.t.m} of ${r.t.l}`);
    checked++;
  }
  assert.ok(checked > 100, "too few confirmed verbs: " + checked);
});

test("verbs are visible in sentences — enough of them for a cloze", () => {
  const slots = lex.slotsFor("sagnorð");
  assert.ok(slots.length >= 200, "only " + slots.length + " confirmed verb tokens");
  const moods = new Set(slots.map((r) => readMark(r.t.m).háttur));
  assert.ok(moods.has("framsöguháttur"), "no indicative form in any sentence");
});

test("never asks about a feature marked uncertain", () => {
  /* This is the rule that makes *fyrir okkur* harmless: the surface form is
     both accusative and dative and the preposition does not distinguish them,
     so the case is marked uncertain and drops out of the analysis
     question. */
  let seen = 0;
  for (const s of lex.sentences) {
    for (const t of s.tok) {
      if (!t.u || !t.u.length) continue;
      const rows = parseRows(readMark(t.m), t);
      for (const u of t.u) {
        assert.ok(!rows.some((r) => r.key === u),
          `asked about ${u} on ${t.w} even though it is uncertain`);
      }
      seen++;
    }
  }
  assert.ok(seen > 0, "no uncertain tokens — then the test is testing nothing");
});

test("okkur in 'fyrir okkur' is marked uncertain about case", () => {
  const s = lex.sentences.find((x) => x.t.includes("útskýrði fyrir okkur"));
  assert.ok(s, "the sentence is not in the bank");
  const tok = s.tok.find((t) => t.w === "okkur");
  assert.ok(tok.u && tok.u.includes("fall"),
    "okkur should be uncertain about case — BÍN has both ÞGFFT and ÞFFT");
});

test("a government question uses only confirmed government", () => {
  for (const s of lex.sentences) {
    for (const t of s.tok) {
      if (t.c === "forsetning" && t.pg)
        assert.ok(["nf", "þf", "þgf", "ef"].includes(t.pg), "ógilt pg: " + t.pg);
    }
  }
});

/* ---------- tíminn ------------------------------------------------------ */

test("the clock does not count absence", () => {
  let now = 1000;
  const c = createClock(() => now);
  c.mark();
  now += 5000;
  assert.strictEqual(c.elapsed(), 5000);
  now += IDLE_MS + 1;                      // the child went to dinner
  assert.strictEqual(c.elapsed(), 0, "a long gap should not count");
});

test("one answer never counts more than the cap", () => {
  let now = 0;
  const c = createClock(() => now);
  c.mark();
  now += MAX_PER_ANSWER - 1;
  assert.ok(c.elapsed() <= MAX_PER_ANSWER);
});

test("time does not count while the tab is not visible", () => {
  let now = 0, vis = true;
  const c = createClock(() => now, () => vis);
  c.mark();
  vis = false;
  now += 4000;
  assert.strictEqual(c.elapsed(), 0);
});

test("pause and resume skip the absence", () => {
  let now = 0;
  const c = createClock(() => now);
  c.mark();
  c.pause();
  now += 3_600_000;                        // opinn flipi í klukkutíma
  c.resume();
  now += 2000;
  assert.strictEqual(c.elapsed(), 2000);
});

test("fmtDuration reads as human language", () => {
  assert.strictEqual(fmtDuration(30_000), "30 sek");
  assert.match(fmtDuration(600_000), /mín/);
  assert.match(fmtDuration(7_200_000), /klst/);
});

/* ---------- the day record holds time and new words --------------------- */

test("record writes time and new words into the day record", () => {
  const S = blankState();
  const sess = newSession(S);
  record(S, sess, { skill: "nafnord", word: "hestur|kk", ok: true, xp: 5, ms: 4000 });
  const day = Object.values(S.days)[0];
  assert.strictEqual(day.ms, 4000);
  assert.strictEqual(day.nw, 1, "the first time on a word should count as a new word");
  record(S, sess, { skill: "nafnord", word: "hestur|kk", ok: true, xp: 5, ms: 1000 });
  assert.strictEqual(day.ms, 5000);
  assert.strictEqual(day.nw, 1, "the same word again is not new");
});

/* ---------- stigataflan ------------------------------------------------- */

test("scorecard gives every metric", () => {
  const S = blankState();
  S.xp = 4000;
  S.badges = { a: { n: 1 }, b: { n: 2 } };
  S.days = { "2026-01-01": { a: 10, c: 8, xp: 40, ms: 300_000, nw: 3 } };
  const card = scorecard(S, lex);
  METRICS.forEach((m) => assert.ok(card[m.id] != null, "vantar " + m.id));
  assert.strictEqual(card.badges, 2);
  assert.strictEqual(card.minutes, 5);
});

test("scorecard sends nothing the child wrote", () => {
  const S = blankState();
  const card = scorecard(S, lex);
  /* An allowlist, not a blocklist. A new field in `scorecard` fails this test,
     and that is the intention: every field that is added should be a decision
     somebody took, not something that drifted in.

     `crest`, `crown` and `badgeIds` arrived in v5.3 because the owner wanted the
     meta badges to be visible in the leaderboard and users to see each other's
     badges. They are all derived numbers and ids — none of them can carry text
     the child wrote. */
  /* `week`, `title`, `showcase` and `tiers` arrived in v6.1 with the weekly
     board and the shelf beside each name. A number for the week, ids for the
     rest — tests/social.test.js pins their shapes, and that a title can never
     be free text. */
  /* `vocab`, `health` and `rescued` arrived in v6.6 with the word-health
     leaderboard: two numbers and a share (or null), all derived from the
     right/wrong counts per word. No word itself leaves the state. */
  /* `duels` and `duelsPlayed` arrived in v6.7: duels won and played, two
     counts. Nothing about whom, when or on what. */
  const allowed = new Set(["profile", "name", "level", "xp", "badges", "words",
                           "minutes", "crest", "crown", "badgeIds",
                           "week", "title", "showcase", "tiers", "duels", "duelsPlayed",
                           "vocab", "health", "rescued"]);
  Object.keys(card).forEach((k) => assert.ok(allowed.has(k), "unexpected field: " + k));
});

test("badgeIds carry ids only, no free text", () => {
  const S = blankState();
  S.badges = { run10: { n: 1, dates: ["2026-08-01"] }, all_badges: { n: 1, dates: [] } };
  const card = scorecard(S, lex);
  assert.deepStrictEqual(card.badgeIds, ["run10", "all_badges"]);
  card.badgeIds.forEach((id) =>
    assert.match(id, /^[a-z0-9_]+$/, "a badge id should be machine-shaped: " + id));
  /* Badge dates are *not* sent: when the child practised is its own business,
     even though what it has won is visible. */
  assert.equal(JSON.stringify(card).includes("2026-08-01"), false);
});

test("the meta badges follow the user into the leaderboard", () => {
  const S = blankState();
  assert.equal(scorecard(S, lex).crest, null);
  S.badges = { all_badges: { n: 1, dates: [] } };
  assert.equal(scorecard(S, lex).crest, "legendary");
  assert.equal(scorecard(S, lex).crown, false);
  S.badges.all_badges_words = { n: 1, dates: [] };
  assert.equal(scorecard(S, lex).crest, "crown");
  assert.equal(scorecard(S, lex).crown, true);
});

test("rank orders highest first and gives ties the same place", () => {
  const cards = [
    { profile: "a", name: "A", xp: 10 },
    { profile: "b", name: "B", xp: 30 },
    { profile: "c", name: "C", xp: 30 },
  ];
  const r = rank(cards, "xp");
  assert.deepStrictEqual(r.map((x) => x.place), [1, 1, 3]);
  assert.strictEqual(r[0].value, 30);
});

/* ---------- hugtakaskýringar -------------------------------------------- */

test("skammstafanir falla fá skýringu", () => {
  ["NF", "ÞF", "ÞGF", "EF"].forEach((k) => {
    assert.match(glossify("Þetta er " + k + "."), /class="gl"/, k + " fékk enga skýringu");
  });
});

test("kvk and strong/weak get explanations", () => {
  assert.match(abbr("kvk"), /data-gl="kvenkyn"/);
  assert.match(glossify("Myndin er sterk."), /data-gl="sterkbeyging"/);
  assert.match(glossify("Myndin er veik."), /data-gl="veikbeyging"/);
});

test("'ef' as a conjunction does NOT get a case explanation", () => {
  /* If this fails, every "ef" in every explanation has become a wrongly
     labelled genitive. */
  assert.doesNotMatch(glossify("Skoðaðu ef þú vilt."), /class="gl"/);
});

test("every BÍN mark is explained component by component", () => {
  const h = markHTML("GM-FH-ÞT-3P-ET");
  ["germynd", "framsoguhattur", "thatid", "persona", "eintala"]
    .forEach((id) => assert.match(h, new RegExp(`data-gl="${id}"`), "vantar " + id));
});

test("every abbreviation points at a term that exists", () => {
  Object.entries(ABBR).forEach(([k, id]) =>
    assert.ok(term(id), `${k} -> ${id} does not exist`));
});
