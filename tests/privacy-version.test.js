/* The privacy notice's version (review of v6.13, M3).
 *
 * v6.12 published "2026-11-11". While v6.13 was built its branch moved the
 * date six times, the last to a day in the future; none of those was ever
 * shown to anybody. v6.13 has ONE version, and these tests hold the rules
 * that keep it so: one date, not in the future, newer than the last one
 * published, the same date wherever the code, the notice and the docs name
 * it, and CALIBRATION_NOTICE never later than the notice that is live. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PRIVACY_VERSION, CALIBRATION_NOTICE, privacyPage, privacyConfig } from "../server/privacy.mjs";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const LAST_PUBLISHED = "2026-11-11";          // v6.12's notice (main)
const isDay = (s) => /^\d{4}-\d\d-\d\d$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z"));

test("one version: a real day, newer than v6.12's, and not in the future", () => {
  assert.ok(isDay(PRIVACY_VERSION), PRIVACY_VERSION);
  assert.ok(PRIVACY_VERSION > LAST_PUBLISHED);
  const today = new Date().toISOString().slice(0, 10);
  assert.ok(PRIVACY_VERSION <= today, `the notice is dated ${PRIVACY_VERSION}, after today (${today})`);
});

test("CALIBRATION_NOTICE: a real day, after v6.12's notice (which did not describe the counting), never later than the live notice", () => {
  assert.ok(isDay(CALIBRATION_NOTICE), CALIBRATION_NOTICE);
  assert.ok(CALIBRATION_NOTICE > LAST_PUBLISHED, "v6.12's notice did not describe the counting");
  assert.ok(CALIBRATION_NOTICE <= PRIVACY_VERSION);
});

test("server/privacy.mjs names one date for the notice, and the page prints it", () => {
  const src = read("server/privacy.mjs");
  const days = new Set(src.match(/20\d\d-\d\d-\d\d/g));
  days.delete(LAST_PUBLISHED);                // the comment says what v6.12 shipped
  assert.deepEqual([...days], [PRIVACY_VERSION], "no other notice date in the file");
  const html = privacyPage(privacyConfig({ FALLASKOLI_CONTROLLER: "X", FALLASKOLI_CONTACT: "x@x.is" }));
  assert.ok(html.includes(`Síðast breytt ${PRIVACY_VERSION}`));
  assert.equal((html.match(/20\d\d-\d\d-\d\d/g) || []).length, 1, "the page names one date");
});

test("the docs name the same version, and only it and v6.12's", () => {
  for (const f of ["docs/PRIVACY.md", "docs/API.md", "docs/SERVER.md"]) {
    /* Only where the text speaks of the notice: an example due date is not one. */
    const lines = read(f).split("\n").filter((l) => /notice|PRIVACY_VERSION|version/i.test(l));
    const days = new Set(lines.join("\n").match(/20\d\d-\d\d-\d\d/g) || []);
    for (const d of days) assert.ok(d === PRIVACY_VERSION || d === LAST_PUBLISHED, `${f} names the notice of ${d}`);
  }
  const doc = read("docs/PRIVACY.md");
  assert.ok(doc.includes(`v6.12 and earlier published \`${LAST_PUBLISHED}\``));
  assert.ok(doc.includes(`one\nnew version, \`${PRIVACY_VERSION}\``), "§3 has one entry for v6.13");
  assert.doesNotMatch(doc, /`PRIVACY_VERSION`\s+moved/, "no history of unpublished versions");
});
