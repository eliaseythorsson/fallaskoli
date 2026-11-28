/* Progress with EVERY slice filled, as a pupil who has practised for a few
   weeks on two devices would have it. The safety net (tests/slices.test.js)
   sends it through migrate, merge and the server's check and fails if any
   slice comes out missing or emptied.

   One entry per slice, in the order of core/slices.js. A NEW SLICE ADDS ITS
   LINE HERE, with realistic data in the shape the program saves — the test
   fails until it does. The values were taken from a simulated pupil
   (tools/sim) and trimmed; every id is one the program has (badges, skills,
   question types, curriculum nodes, error patterns), because the server's
   check drops ids it does not know.

   The dates sit before TODAY, which is the day the test hands the server. */

import { STATE_VERSION } from "../../src/js/core/slices.js";

export const TODAY = new Date("2026-11-20T12:00:00Z");

const skill = (xp, c, w, bestRun) => ({ xp, c, w, bestRun });
const tally = (a, l, p, t, g, x) => ({ a, l, p, t, g, x });

/** A fresh copy every call: the functions under test must not mutate it,
    and a test that did would not leak into the next. */
export function fullProgress() {
  return {
    /* The version this program saves: a copy of an older version is
       brought up to date by migrate, which is not what this fixture tests
       (tests/wordknowledge.test.js tests the step to 12). */
    v: STATE_VERSION,
    profile: { id: "u-fixture", name: "Sól" },
    xp: 1050,
    bestLevel: 4,
    days: {
      "2026-11-17": { a: 19, c: 11, xp: 118, ms: 640000, nw: 14,
        sk: { nafnord: 2, sagnord: 3, greining: 1 }, g: 10, lg: 1, wg: 4 },
      "2026-11-18": { a: 31, c: 24, xp: 230, ms: 910000, nw: 6,
        sk: { nafnord: 9, lysingarord: 5, fallstjorn: 4 }, g: 10, lg: 1, wg: 4 },
      "2026-11-19": { a: 0, c: 0, xp: 0, ms: 0, nw: 0, sk: {}, g: 10, lg: 1, wg: 4 },
    },
    cells: {
      "EVB-KVK-ÞFET": { c: 2, w: 1 },
      "beyging:sterk": { c: 2, w: 1 },
      "GM-FH-NT-1P-ET": { c: 2, w: 3 },
      "ÞGFFT": { c: 7, w: 2 },
    },
    words: {
      "sætur|lo": { c: 1, w: 0, h: "1" },
      "piltur|kk": { c: 1, w: 1, h: "01" },
      "hugsa|so": { c: 1, w: 4, h: "00010" },
    },
    skills: {
      nafnord: skill(352, 28, 21, 3), lysingarord: skill(118, 8, 3, 2), sagnord: skill(140, 12, 9, 4),
      fornofn: skill(40, 4, 1, 3), toluord: skill(16, 2, 0, 2), obeygjanleg: skill(24, 3, 1, 2),
      greining: skill(90, 6, 4, 2), fallstjorn: skill(80, 7, 3, 3), ordaford: skill(60, 5, 2, 2),
      setningafraedi: skill(50, 4, 3, 2), malbeiting: skill(40, 3, 2, 1), setningagerd: skill(40, 3, 1, 2),
      namsord: skill(20, 2, 1, 1),
      lesskilningur: skill(30, 3, 1, 1),
      frasogn: skill(20, 2, 1, 1),
    },
    badges: {
      run5: { n: 1, dates: ["2026-11-17"], first: "2026-11-17", last: "2026-11-17" },
      tbl_clean: { n: 3, dates: ["2026-11-17", "2026-11-18", "2026-11-18"], first: "2026-11-17", last: "2026-11-18" },
      s_night: { n: 1, dates: ["2026-11-18"], first: "2026-11-18", last: "2026-11-18" },
    },
    goal: 15,
    run: 2,
    bestRun: 7,
    weekGoal: 3,
    totalAnswers: 114,
    totalCorrect: 72,
    multiSessionRun: 2,
    lastSessionSkills: 4,
    counters: { perfectTables: 5, perfectParses: 2, meanings: 3, retries: 4, retryFixed: 2 },
    enabled: {
      nafnord: true, lysingarord: true, sagnord: true, fornofn: true, toluord: false, obeygjanleg: true,
      greining: true, fallstjorn: true, ordaford: true, setningafraedi: false, malbeiting: true, setningagerd: false, namsord: true,
      lesskilningur: true,
      frasogn: true,
    },
    policy: { skills: { toluord: false }, types: { lo_stig: true }, levels: {}, attrs: { fall: { EF: false } }, safeVocab: null },
    allowed: { skills: {}, types: {}, levels: {}, attrs: {}, safeVocab: true },
    settings: { decay: false, settingsRev: 1, glossary: true, badgeView: "catalogue" },
    lastActive: "2026-11-19",
    periods: { s_night: "night:2026-11-18" },
    settled: "2026-11-18",
    showcase: ["run5", "s_night"],
    title: "badge:s_night",
    social: { week: "2026-11-16", ahead: ["u-classmate"] },
    drills: { "hestur|kk": { p: 1, t: 2, f: 0, last: "2026-11-18", at: 9 } },
    drillDays: { "2026-11-18": 1 },
    read: { setningarhlutar: true, nafnord: true },
    duels: { d8Hk2pQx: "w", z4Rt9mLa: "t" },
    diag: {
      thf_thgf: { n: 42, w: 3, h: "1111011101111111", last: "2026-11-18",
        ex: [{ w: "hestur|kk", m: "ÞGFET", o: "ÞFET" }] },
      nf_aukafall: { n: 51, w: 1, h: "1111111111111111", last: "2026-11-17", ex: [] },
    },
    runs: [
      { at: 1795400000000, d: "2026-11-17", topic: "blandad", n: 10, c: 6, j: 10, xp: 61, top: ["thf_thgf"] },
      { at: 1795490000000, d: "2026-11-18", topic: "nafnord", n: 10, c: 8, j: 10, xp: 74, top: [] },
    ],
    review: {
      /* In the order the merge keeps them in: by the day added, then the key. */
      items: [
        { k: "f:mynd|GM-FH-NT-1P-ET|hugsa|so", t: "verbslot", sk: "sagnord", p: "dh_d", c: "GM-FH-NT-1P-ET",
          w: "hugsa|so", i: null, s: 0, due: "2026-11-20", add: "2026-11-17", last: "2026-11-19", l: 3, ok: 0 },
        { k: "f:mynd|beyging:sterk|piltur|kk", t: "no_beyging", sk: "nafnord", p: "beyging_no", c: "beyging:sterk",
          w: "piltur|kk", i: null, s: 1, due: "2026-11-21", add: "2026-11-17", last: "2026-11-18", l: 1, ok: 1 },
      ],
      stats: {
        "p:beyging_no": tally(1, 0, 1, 1, 0, 0),
        "s:nafnord": tally(6, 6, 6, 6, 0, 0),
        "t:no_beyging": tally(1, 0, 1, 1, 0, 0),
      },
    },
    difficulty: {
      lysingarord: { d: 2, r: 0, h: "110101110", at: 1795490000000, src: "play" },
      nafnord: { d: 3, r: 1, h: "010010111111", at: 1795490000000, src: "play" },
    },
    frames: { f1sl4vat: 2, f2k9q0b: 1 },
    byType: {
      lo_stig: { n: 5, c: 4, h: "AAaAA", at: 1795490000000 },
      no_beyging: { n: 3, c: 2, h: "aAA", at: 1795400000000 },
    },
    byNode: {
      "lo-stig": { n: 5, c: 4, h: "AAaAA", at: 1795490000000 },
      "so-bodhattur": { n: 1, c: 1, h: "A", at: 1795400000000 },
    },
    seenTypes: { lo_stig: "2026-11-17", no_beyging: "2026-11-17" },
    mapBand: { nafnord: 3, lysingarord: 2 },
    mend: {
      open: { thf_thgf: "2026-11-17" },
      done: { nf_aukafall: 1 },
      log: [{ p: "nf_aukafall", d: "2026-11-18" }],
      rv: { "2026-11-19": 3, "2026-11-18": 4 },
    },
    tour: { st: "done", at: 1795300000000, d: "2026-11-16", placed: 1, year: 9 },
    wordKnowledge: {
      "hugsa|so": { c: 1, w: 4, e: [
        ["2026-11-17", "verbslot", "w"], ["2026-11-17", "verbslot", "w"], ["2026-11-18", "tbl_so", "w"],
        ["2026-11-18", "meaning", "s"], ["2026-11-19", "verbslot", "r"], ["2026-11-19", "verbslot", "w"]] },
      "piltur|kk": { c: 1, w: 1, e: [["2026-11-17", "fill", "r"], ["2026-11-18", "villur", "w"]] },
      "sætur|lo": { c: 1, w: 0, e: [["2026-11-18", "lo_stig", "r"]] },
    },
    learning: {
      "hluti|kk": { s: "l", d: "2026-11-17", n: 1 },
      "áhrif|hk": { s: "k", d: "2026-11-19", n: 2 },
      "breyting|kvk": { s: "o", d: "2026-11-18", n: 2 },
    },
    wordCards: {
      "hluti|kk": { d: "2026-11-17", n: 1, r: 1, a: {
        skyring: { c: ["hluti|kk"], ok: true }, flokkur: { c: ["so"], ok: false }, kyn: { c: ["kk"], ok: true } } },
      "áhrif|hk": { d: "2026-11-18", n: 2, r: 2, a: {
        setning: { c: ["Veðrið hefur áhrif á skapið."], ok: true }, skyld: { c: ["líka", "sömuleiðis"], ok: true } },
        /* #18: added when the card came back in a review. */
        x: [{ d: "2026-11-19", r: 2 }, { d: "2026-11-20", s: "Tónlist hefur góð áhrif á mig." }] },
    },
  };
}
