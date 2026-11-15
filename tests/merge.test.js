/* Two devices, one child (core/merge.js) — and the driver that uses it.
 *
 * The property every test here is a case of: after a merge, NOTHING either
 * device did is missing, and nothing is counted twice.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeStates } from "../src/js/core/merge.js";
import { serverDriver } from "../src/js/core/server.js";
import { blankState, migrate } from "../src/js/core/state.js";

const copy = (x) => JSON.parse(JSON.stringify(x));
const day = (a, c, xp, extra = {}) => ({ a, c, xp, ms: a * 1000, nw: 0, sk: {}, g: 10, lg: 1, ...extra });

function base() {
  const S = blankState();
  S.xp = 100; S.totalAnswers = 10; S.totalCorrect = 8; S.bestRun = 4;
  S.days["2026-11-09"] = day(10, 8, 100, { sk: { nafnord: 8 } });
  S.words["hestur|kk"] = { c: 3, w: 1 };
  S.cells["NFET"] = { c: 5, w: 0 };
  S.skills.nafnord = { xp: 100, c: 8, w: 2, bestRun: 4 };
  S.badges.first = { n: 1, dates: ["2026-11-09"], first: "2026-11-09", last: "2026-11-09" };
  S.lastActive = "2026-11-09";
  return S;
}

test("work on both devices adds up, in every counter", () => {
  const B = base();
  const phone = copy(B), laptop = copy(B);

  /* the laptop: an evening's work, same day */
  laptop.xp = 400; laptop.totalAnswers = 40; laptop.totalCorrect = 30; laptop.bestRun = 12;
  laptop.days["2026-11-09"] = day(40, 30, 400, { sk: { nafnord: 20, sagnord: 10 } });
  laptop.words["hestur|kk"] = { c: 6, w: 1 };
  laptop.words["kona|kvk"] = { c: 2, w: 0 };
  laptop.skills.nafnord = { xp: 300, c: 20, w: 5, bestRun: 12 };

  /* the phone: three answers the next morning */
  phone.xp = 130; phone.totalAnswers = 13; phone.totalCorrect = 10;
  phone.days["2026-11-10"] = day(3, 2, 30, { sk: { nafnord: 2 } });
  phone.words["hestur|kk"] = { c: 4, w: 2 };
  phone.cells["NFET"] = { c: 6, w: 1 };
  phone.skills.nafnord = { xp: 130, c: 10, w: 3, bestRun: 4 };
  phone.lastActive = "2026-11-10";

  const M = mergeStates(B, phone, laptop);
  assert.equal(M.xp, 430);
  assert.equal(M.totalAnswers, 43);
  assert.equal(M.totalCorrect, 32);
  assert.equal(M.bestRun, 12);
  assert.deepEqual(M.days["2026-11-09"].sk, { nafnord: 20, sagnord: 10 });
  assert.equal(M.days["2026-11-09"].xp, 400);
  assert.equal(M.days["2026-11-10"].xp, 30);
  assert.deepEqual(M.words["hestur|kk"], { c: 7, w: 2 });
  assert.deepEqual(M.words["kona|kvk"], { c: 2, w: 0 });
  assert.deepEqual(M.cells["NFET"], { c: 6, w: 1 });
  assert.deepEqual(M.skills.nafnord, { xp: 330, c: 22, w: 6, bestRun: 12 });
  assert.equal(M.lastActive, "2026-11-10");

  /* XP still equals what the days add up to — the invariant the server's
     plausibility guard relies on must survive a merge */
  const sum = Object.values(M.days).reduce((a, d) => a + d.xp, 0);
  assert.equal(M.xp, sum);
});

test("it does not matter which device is 'local'", () => {
  const B = base();
  const one = copy(B), two = copy(B);
  one.xp = 150; one.days["2026-11-10"] = day(5, 5, 50);
  two.xp = 180; two.days["2026-11-09"].xp = 180; two.days["2026-11-09"].a = 18;
  const a = mergeStates(B, one, two), b = mergeStates(B, two, one);
  assert.equal(a.xp, b.xp);
  assert.deepEqual(a.days, b.days);
});

test("a device with nothing new changes nothing", () => {
  const B = base();
  const remote = copy(B); remote.xp = 900; remote.days["2026-11-10"] = day(80, 70, 800);
  const M = mergeStates(B, copy(B), remote);
  assert.equal(M.xp, 900);
  assert.deepEqual(M.days, remote.days);
});

test("the same badge won on both devices is one badge; a new one on either is kept", () => {
  const B = base();
  const l = copy(B), r = copy(B);
  const won = (d) => ({ n: 1, dates: [d], first: d, last: d });
  l.badges.streak3 = won("2026-11-10"); r.badges.streak3 = won("2026-11-09");
  l.badges.onlyPhone = won("2026-11-10"); r.badges.onlyLaptop = won("2026-11-10");
  /* a repeatable badge both already had, won once more on each */
  l.badges.first = { n: 2, dates: ["2026-11-09", "2026-11-10"], first: "2026-11-09", last: "2026-11-10" };
  r.badges.first = { n: 2, dates: ["2026-11-09", "2026-11-11"], first: "2026-11-09", last: "2026-11-11" };

  const M = mergeStates(B, l, r);
  assert.equal(M.badges.streak3.n, 1, "one badge was counted as two");
  assert.equal(M.badges.streak3.first, "2026-11-09", "the FIRST time must be the earlier one");
  assert.ok(M.badges.onlyPhone && M.badges.onlyLaptop);
  assert.equal(M.badges.first.n, 3);
  assert.deepEqual(M.badges.first.dates, ["2026-11-09", "2026-11-10", "2026-11-11"]);
  assert.equal(M.badges.first.last, "2026-11-11");
});

test("XP that faded on both devices fades once", () => {
  const B = base(); B.xp = 1000;
  const l = copy(B), r = copy(B);
  l.xp = 900; r.xp = 900;        // the same break, noticed by each device
  assert.equal(mergeStates(B, l, r).xp, 900);
});

test("a setting follows the device that changed it", () => {
  const B = base();
  const l = copy(B), r = copy(B);
  r.goal = 25;                               // changed on the laptop
  l.settings.glossary = false;               // changed on the phone
  l.showcase = ["first"];
  const M = mergeStates(B, l, r);
  assert.equal(M.goal, 25);
  assert.equal(M.settings.glossary, false);
  assert.deepEqual(M.showcase, ["first"]);
});

test("the curriculum ceiling always comes from the server's copy", () => {
  const B = base();
  const l = copy(B), r = copy(B);
  l.allowed = null; r.allowed = { skills: { sagnord: false } };
  assert.deepEqual(mergeStates(B, l, r).allowed, { skills: { sagnord: false } });
});

test("the merged state is one the program can load", () => {
  const B = base();
  const l = copy(B), r = copy(B);
  l.xp = 120; r.xp = 300;
  const M = migrate(mergeStates(B, l, r));
  assert.equal(M.xp, 320);
  assert.ok(M.skills.nafnord && M.days["2026-11-09"]);
});

test("with no common past, nothing is lost either", () => {
  const l = base(), r = base();
  r.days["2026-11-08"] = day(4, 4, 40);
  const M = mergeStates(null, l, r);
  assert.ok(M.days["2026-11-08"] && M.days["2026-11-09"]);
  assert.equal(M.badges.first.n, 1);
});

/* ---------- the driver: what the program actually does on a conflict -------- */

/** A stand-in for the server: one state, a revision, and the 409. */
function fakeServer(initial) {
  let rev = 1, state = copy(initial);
  const puts = [];
  return {
    puts,
    get held() { return state; },
    /** Another device writes behind this one's back. */
    elsewhere(next) { state = copy(next); rev++; },
    async getStateRec() { return { state: copy(state), rev }; },
    async putState(id, next, ifMatch) {
      puts.push(ifMatch);
      if (ifMatch != null && ifMatch !== rev)
        throw Object.assign(new Error("409"), { status: 409, data: { state: copy(state), rev } });
      state = copy(next); rev++;
      return { ok: true, rev };
    },
  };
}

test("driver: a write based on a stale copy is merged, not lost and not forced", async () => {
  const B = base();
  const server = fakeServer(B);
  const merged = [];
  const driver = serverDriver(server, { onMerged: (m, sent) => merged.push([m, sent]) });
  const mine = await driver.get("id");

  const laptop = copy(B); laptop.xp = 400; laptop.days["2026-11-09"].xp = 400;
  server.elsewhere(laptop);

  mine.xp = 130; mine.days["2026-11-10"] = day(3, 2, 30);
  assert.equal(await driver.set("id", mine), true);

  assert.equal(server.held.xp, 430, "one device's work is gone");
  assert.equal(server.held.days["2026-11-09"].xp, 400);
  assert.equal(server.held.days["2026-11-10"].xp, 30);
  assert.equal(merged.length, 1, "the program was not told the state changed under it");
  assert.equal(merged[0][0].xp, 430);
  assert.equal(merged[0][1].xp, 130);

  /* and the next write is an ordinary one */
  const next = copy(server.held); next.xp = 440;
  assert.equal(await driver.set("id", next), true);
  assert.equal(server.held.xp, 440);
  assert.equal(merged.length, 1);
});

test("driver: every write says which revision it is based on", async () => {
  const server = fakeServer(base());
  const driver = serverDriver(server);
  const S = await driver.get("id");
  S.xp = 101; await driver.set("id", S);
  S.xp = 102; await driver.set("id", S);
  assert.deepEqual(server.puts, [1, 2]);
});

test("driver: a failure that is not a conflict is reported, and nothing is invented", async () => {
  const driver = serverDriver({
    async getStateRec() { return null; },
    async putState() { throw Object.assign(new Error("net"), { status: 500 }); },
  });
  await driver.get("id");
  assert.equal(await driver.set("id", base()), false);
});
