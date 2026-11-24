/* The spacing between repeats — the rules the owner set, tested with fixed
   dates so they do not depend on when the test is run. */
import { test } from "node:test";
import { seededRng } from "./helpers.js";
import assert from "node:assert/strict";
import {
  eligible, weight, chooseWord, markAsked, poolStatus, history, daysSince,
} from "../src/js/core/spacing.js";
import { blankState, migrate } from "../src/js/core/state.js";

const S0 = () => blankState();
const KEY = "kvöld|hk";

test("a new word is always eligible and carries the highest weight", () => {
  const S = S0();
  assert.equal(eligible(S, KEY, "2026-03-01").ok, true);
  assert.equal(weight(S, KEY, "2026-03-01"), 1);
});

test("the same word does not come twice on the same day", () => {
  const S = S0();
  markAsked(S, KEY, "2026-03-01");
  assert.equal(eligible(S, KEY, "2026-03-01").ok, false);
});

test("not within a week of the last time", () => {
  const S = S0();
  markAsked(S, KEY, "2026-03-01");
  for (const d of ["2026-03-02", "2026-03-05", "2026-03-07"])
    assert.equal(eligible(S, KEY, d).ok, false, d + " should be too soon");
  assert.equal(eligible(S, KEY, "2026-03-08").ok, true, "the eighth day should be fine");
});

test("after two showings a month has to pass", () => {
  const S = S0();
  markAsked(S, KEY, "2026-03-01");
  markAsked(S, KEY, "2026-03-09");
  assert.equal(eligible(S, KEY, "2026-03-20").ok, false);
  assert.equal(eligible(S, KEY, "2026-04-07").ok, false, "29 days is still too soon");
  assert.equal(eligible(S, KEY, "2026-04-08").ok, true, "30 days is enough");
});

test("Kvöld cannot come four times in a row", () => {
  /* The bug itself, as a test: one pool, four calls, the same day. */
  const S = S0();
  const pool = [{ key: KEY }, { key: "morgunn|kk" }, { key: "bók|kvk" }];
  const picked = [];
  for (let i = 0; i < 3; i++) {
    const c = chooseWord(S, pool, "2026-03-01", () => 0.0001);
    if (!c) break;
    picked.push(c.key);
    markAsked(S, c.key, "2026-03-01");
  }
  assert.equal(new Set(picked).size, picked.length, "the same word chosen twice in one day");
  assert.equal(chooseWord(S, pool, "2026-03-01", () => 0.5), null,
    "the pool was empty and a word still came — it must be a repeat");
});

test("new words come ahead of repeats", () => {
  const S = S0();
  markAsked(S, KEY, "2026-01-01");           // the wait is long past
  const pool = [{ key: KEY }, { key: "nýtt|hk" }];
  for (let i = 0; i < 25; i++) {
    const c = chooseWord(S, pool, "2026-06-01", seededRng(3));
    assert.equal(c.key, "nýtt|hk", "a repeat was chosen even though a new word was available");
  }
});

test("a repeat always weighs less than a new word", () => {
  const S = S0();
  markAsked(S, KEY, "2026-01-01");
  assert.ok(weight(S, KEY, "2027-01-01") < 1);
  const S2 = S0();
  markAsked(S2, KEY, "2026-01-01");
  markAsked(S2, KEY, "2026-02-01");
  assert.ok(weight(S2, KEY, "2027-01-01") < weight(S, KEY, "2027-01-01"),
    "a word seen twice should be less likely than one seen once");
});

test("the pool status is counted correctly", () => {
  const S = S0();
  markAsked(S, KEY, "2026-03-01");
  const st = poolStatus(S, [{ key: KEY }, { key: "a|hk" }, { key: "b|hk" }], "2026-03-02");
  assert.deepEqual(st, { ready: 2, fresh: 2, waiting: 1, total: 3 });
});

test("the spacing survives importing old progress", () => {
  const S = S0();
  markAsked(S, KEY, "2026-03-01");
  const back = migrate(JSON.parse(JSON.stringify(S)));
  assert.equal(history(back, KEY).n, 1, "vocab was lost in migrate");
  assert.equal(eligible(back, KEY, "2026-03-02").ok, false);
});

test("state from an older version with no vocab does not crash", () => {
  const old = { xp: 10, days: {}, words: {} };
  const S = migrate(old);
  assert.deepEqual(S.vocab, {});
  assert.equal(daysSince(S, KEY, "2026-03-01"), Infinity);
  assert.equal(eligible(S, KEY, "2026-03-01").ok, true);
});
