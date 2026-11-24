/* #43: every status Word knowledge gives a word comes with its reason, in
   plain Icelandic (`{ status, why }`), and the reason agrees with the rule. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { HEALTH, statusOf, recentOf } from "../src/js/core/wordhealth.js";
import { because, percent, answersText, lastRightText } from "../src/js/core/wordknowledge.js";

/** A word record with `c` right and `w` wrong, and the short history `h`. */
const rec = (c, w, h) => ({ c, w, ...(h != null ? { h } : {}) });

test("the helpers: the shape, a share rounded down, svar/svör", () => {
  assert.deepEqual(because("shaky", "3 af síðustu 7 rétt"), { status: "shaky", why: "3 af síðustu 7 rétt" });
  assert.equal(lastRightText(3, 7), "3 af síðustu 7 rétt");
  assert.equal(percent(0.199), 19);
  assert.equal(percent(0.29), 29);           // 0.29 × 100 is 28.999… in floating point
  assert.equal(percent(0.8), 80);
  assert.equal(percent(1), 100);
  assert.deepEqual([1, 2, 5, 11, 21, 101, 111].map(answersText),
    ["1 svar", "2 svör", "5 svör", "11 svör", "21 svar", "101 svar", "111 svör"]);
});

test("new: never answered", () => {
  assert.deepEqual(statusOf(undefined), { status: "new", why: "aldrei svarað" });
  assert.deepEqual(statusOf(rec(0, 0)), { status: "new", why: "aldrei svarað" });
});

test("new: too few answers to judge", () => {
  assert.deepEqual(statusOf(rec(1, 0, "1")), { status: "new", why: "aðeins 1 svar, of fá til að meta" });
  assert.deepEqual(statusOf(rec(1, 1, "10")), { status: "new", why: "aðeins 2 svör, of fá til að meta" });
});

test("weak: the count and the line it fell under", () => {
  assert.deepEqual(statusOf(rec(1, 6, "0100000")), { status: "weak", why: "1 af síðustu 7 rétt, undir 20%" });
});

test("shaky: the count and the line it fell under", () => {
  assert.deepEqual(statusOf(rec(2, 3, "01010")), { status: "shaky", why: "2 af síðustu 5 rétt, undir 50%" });
  /* Five wrong is not yet weak (six needed), so it is shaky. */
  assert.deepEqual(statusOf(rec(0, 5, "00000")), { status: "shaky", why: "0 af síðustu 5 rétt, undir 50%" });
});

test("ok: the count only", () => {
  assert.deepEqual(statusOf(rec(6, 4, "1101011001")), { status: "ok", why: "6 af síðustu 10 rétt" });
});

test("strong: the count and the line it reached", () => {
  assert.deepEqual(statusOf(rec(12, 3, "111110111111")), { status: "strong", why: "9 af síðustu 10 rétt, 80% eða meira" });
});

test("no recent outcomes (progress from before the reset): the lifetime share", () => {
  assert.deepEqual(statusOf(rec(1, 9)), { status: "weak", why: "10% rétt, 10 svör alls, undir 20%" });
  assert.deepEqual(statusOf(rec(8, 4)), { status: "ok", why: "66% rétt, 12 svör alls" });
});

test("part of the window filled at the older rate: the share, and that it is estimated", () => {
  /* Three new answers right, 20 older at 10%: (3 + 7 × 0.1) / 10 = 37%. */
  assert.deepEqual(statusOf(rec(5, 18, "111")),
    { status: "shaky", why: "37% rétt af síðustu 10, að hluta metið af eldri svörum, undir 50%" });
});

test("a reason never shows a share on the wrong side of its line", () => {
  /* Every record with up to 14 answers and every short history: the share in
     the reason and the status agree with the thresholds. */
  for (let n = 1; n <= 14; n++) for (let c = 0; c <= n; c++) for (let hl = 0; hl <= Math.min(n, 12); hl++) {
    for (let bits = 0; bits < 1 << hl; bits++) {
      const h = bits.toString(2).padStart(hl, "0");
      const ones = [...h].filter((x) => x === "1").length;
      if (ones > c || hl - ones > n - c) continue;
      const r = rec(c, n - c, hl ? h : undefined);
      const { status, why } = statusOf(r);
      assert.equal(typeof why, "string");
      assert.ok(why.length > 0);
      const pct = why.match(/^(\d+)%/);
      const cnt = why.match(/^(\d+) af síðustu (\d+) rétt/);
      const shown = pct ? Number(pct[1]) / 100 : cnt ? Number(cnt[1]) / Number(cnt[2]) : null;
      if (shown == null) { assert.equal(status, "new"); continue; }
      const acc = recentOf(r).acc;
      assert.ok(shown <= acc + 1e-9 && acc - shown < 0.01 + 1e-9, `${why} vs ${acc}`);
      if (status === "weak") assert.ok(shown < HEALTH.weakMaxAcc);
      if (status === "shaky") assert.ok(shown < HEALTH.shakyMaxAcc);
      if (status === "strong") assert.ok(shown >= HEALTH.strongMinAcc - 1e-9);
      if (status === "ok") assert.ok(shown >= HEALTH.shakyMaxAcc - 1e-9 && shown < HEALTH.strongMinAcc);
    }
  }
});
