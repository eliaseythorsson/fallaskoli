/* The skill map (critique item 83, core/skillmap.js): the standing of one
   curriculum node — how well, when last, what needs work — the opened node,
   the whole map, the teacher's smaller copy of it, and the session a node's
   button starts. The record the map adds to the saved state (`S.byNode`) is
   held here too: written, cleaned, merged, guarded. */

import test from "node:test";
import assert from "node:assert/strict";
import {
  NODE_PATTERNS, LOOSE_PATTERNS, ATTR_NODES, ATTR_NODE_IDS, NOUN_GRID_NODE, NODE_RUN,
  patternsOfNode, cellOfNode, noteNodeAnswer, partsOf, cleanByNode, mergeByNode,
  entriesOfNode, standingOfNode, lastText, needsText, nodeSentence, cellLabel,
  nodeDetail, mapOf, teacherMap, nodeSession,
} from "../src/js/core/skillmap.js";
import { NODES, nodeById, YEARS } from "../src/js/core/curriculum.js";
import { PATTERNS, patternById, standingOf } from "../src/js/core/diagnosis.js";
import { noteTypeAnswer, masteryOfTypes, LABELS, HIST } from "../src/js/core/mastery.js";
import { blankState, migrate, effectivePolicy } from "../src/js/core/state.js";
import { mergeStates } from "../src/js/core/merge.js";
import { cleanState } from "../server/guard.mjs";
import { setSkillLevel } from "../src/js/core/difficulty.js";
import { addDays, keyFor, openingSize, STALE_DAYS } from "../src/js/core/review.js";
import { SKILLS } from "../src/js/core/skills.js";
import { lessonById } from "../src/js/core/lessons.js";

const NOW = new Date(2026, 10, 16, 12).getTime();
const TODAY = "2026-11-16";
const DAY = 86400000;

const node = (id) => { const n = nodeById(id); assert.ok(n, "no such node: " + id); return n; };

/** A pupil at `level` in the node's category with these answers ("1"/"0")
    to one of the node's types, the last of them `daysAgo` days ago. */
function pupil(id, { level = 3, answers = "", daysAgo = 0, type = null } = {}) {
  const S = blankState(), n = node(id);
  if (SKILLS.some((s) => s.id === n.cat)) setSkillLevel(S, n.cat, level, { now: 1 });
  for (const ch of answers) noteTypeAnswer(S, type || n.types[0], level, ch === "1", NOW - daysAgo * DAY);
  return S;
}
/** An entry of the review queue as core/review.js makes them. */
function entry(S, { t, c = null, w = null, due = TODAY, l = 1, s = 0 }) {
  const e = { t, sk: null, p: null, c, w, i: null };
  const made = { k: keyFor(e), ...e, s, due, add: addDays(due, -1), last: addDays(due, -1), l, ok: 0 };
  S.review.items.push(made);
  return made;
}
/** A pattern record that is active: it has gone wrong every time lately. */
const hot = () => ({ n: 12, w: 10, h: "0000000000", last: TODAY, ex: [{ w: "hestur|kk", m: "ÞGFET", o: "ÞFET" }] });
const cool = () => ({ n: 12, w: 1, h: "1111111111", last: null, ex: [] });

/* ---------- the patterns on the nodes ---------------------------------------- */

test("every error pattern is on exactly one node or among the loose ones", () => {
  const seen = new Map();
  for (const [nid, ids] of Object.entries(NODE_PATTERNS)) {
    assert.ok(nodeById(nid), `${nid} is not a node`);
    for (const id of ids) {
      assert.ok(patternById(id), `${nid}: ${id} is not a pattern`);
      assert.ok(!seen.has(id), `${id} is on ${seen.get(id)} and on ${nid}`);
      seen.set(id, nid);
    }
  }
  for (const id of LOOSE_PATTERNS) {
    assert.ok(patternById(id), `${id} is not a pattern`);
    assert.ok(!seen.has(id), `${id} is loose and on ${seen.get(id)}`);
    seen.set(id, "(loose)");
  }
  assert.deepEqual(PATTERNS.map((p) => p.id).filter((id) => !seen.has(id)), [],
    "a pattern the map does not show anywhere");
});

test("a pattern on a node shares a question type with it, so the node's button practises it", () => {
  for (const [nid, ids] of Object.entries(NODE_PATTERNS)) {
    const n = node(nid);
    assert.ok(n.types.length, `${nid} carries patterns and is locked`);
    for (const id of ids) {
      const p = patternById(id);
      assert.ok(!p.meta, `${id} is a count, not an error`);
      assert.ok((p.types || []).some((t) => n.types.includes(t)),
        `${id} (${(p.types || []).join(", ")}) shares no type with ${nid} (${n.types.join(", ")})`);
    }
  }
});

/* ---------- which answers are a node's ---------------------------------------- */

test("the nodes with a record of their own are the ones told apart by a feature", () => {
  assert.deepEqual(ATTR_NODE_IDS, NODES.filter((n) => n.types.length && n.attrs).map((n) => n.id));
  assert.ok(ATTR_NODE_IDS.includes("so-tid") && ATTR_NODE_IDS.includes("so-vidtengingarhattur"));
  assert.ok(!ATTR_NODE_IDS.includes("no-foll"));
  for (const n of ATTR_NODES) assert.ok(Object.keys(n.attrs).length);
});

test("cellOfNode: a cell belongs to a node with features only when it carries them", () => {
  assert.equal(cellOfNode(node("so-tid"), "GM-FH-ÞT-3P-ET"), true);
  assert.equal(cellOfNode(node("so-tid"), "GM-FH-NT-3P-ET"), false);
  assert.equal(cellOfNode(node("so-vidtengingarhattur"), "GM-VH-NT-1P-FT"), true);
  assert.equal(cellOfNode(node("so-midmynd"), "MM-FH-NT-2P-ET"), true);
  assert.equal(cellOfNode(node("so-midmynd"), "GM-FH-NT-2P-ET"), false);
  assert.equal(cellOfNode(node("so-tid"), "setn:frumlag"), false, "not a mark: no features");
  assert.equal(cellOfNode(node("so-tid"), null), false);
  assert.equal(cellOfNode(node("no-foll"), "anything"), true, "a node without features takes every cell");
});

test("noteNodeAnswer: the past tense counts for Nútíð og þátíð, not for the subjunctive", () => {
  const S = blankState();
  assert.deepEqual(noteNodeAnswer(S, "verb", [{ cell: "GM-FH-ÞT-3P-ET", ok: true }], 2, NOW), ["so-tid"]);
  assert.deepEqual(S.byNode["so-tid"], { n: 1, c: 1, h: "B", at: NOW });
  assert.equal(S.byNode["so-vidtengingarhattur"], undefined);
  /* The past subjunctive of the middle voice is all three. */
  assert.deepEqual(noteNodeAnswer(S, "verb", [{ cell: "MM-VH-ÞT-3P-ET", ok: false }], 2, NOW + 1).sort(),
    ["so-midmynd", "so-tid", "so-vidtengingarhattur"]);
  assert.deepEqual(S.byNode["so-tid"], { n: 2, c: 1, h: "Bb", at: NOW + 1 });
  /* A type that is not the node's, a cell without the feature, no verdict. */
  assert.deepEqual(noteNodeAnswer(S, "fill", [{ cell: "GM-FH-ÞT-3P-ET", ok: true }], 2, NOW), []);
  assert.deepEqual(noteNodeAnswer(S, "verb", [{ cell: "GM-FH-NT-3P-ET", ok: true }], 2, NOW), []);
  assert.deepEqual(noteNodeAnswer(S, "verb", [{ cell: "GM-FH-ÞT-3P-ET", ok: null }], 2, NOW), []);
  assert.deepEqual(noteNodeAnswer(S, "verb", null, 2, NOW), []);
  assert.equal(S.byNode["so-tid"].n, 2);
});

test("a table is one answer for a node: right only when every cell of the node was", () => {
  const S = blankState();
  const parts = [{ cell: "GM-FH-NT-1P-ET", ok: false }, { cell: "GM-FH-ÞT-1P-ET", ok: true },
    { cell: "GM-FH-ÞT-2P-ET", ok: true }];
  noteNodeAnswer(S, "tbl_so", parts, 3, NOW);
  assert.deepEqual(S.byNode["so-tid"], { n: 1, c: 1, h: "C", at: NOW },
    "the present-tense cell that went wrong is not the node's");
  noteNodeAnswer(S, "tbl_so", [...parts, { cell: "GM-FH-ÞT-3P-ET", ok: false }], 3, NOW);
  assert.deepEqual([S.byNode["so-tid"].n, S.byNode["so-tid"].c, S.byNode["so-tid"].h], [2, 1, "Cc"]);
  for (let k = 0; k < 40; k++) noteNodeAnswer(S, "verb", [{ cell: "GM-FH-ÞT-3P-ET", ok: true }], 3, NOW);
  assert.equal(S.byNode["so-tid"].h.length, HIST);
});

test("partsOf: a table's counted cells each with its own verdict; anything else its one cell", () => {
  const table = { type: "table", cell: null };
  const j = { ok: false, effects: [
    { do: "record", cell: "GM-FH-ÞT-1P-ET", word: "fara|so", ok: true },
    { do: "record", cell: "GM-FH-ÞT-2P-ET", word: "fara|so", ok: false },
    { do: "record", cell: "GM-FH-ÞT-3P-ET", word: "fara|so", ok: true, counts: false },
    { do: "xp", n: 5 }] };
  assert.deepEqual(partsOf(table, j), [{ cell: "GM-FH-ÞT-1P-ET", ok: true }, { cell: "GM-FH-ÞT-2P-ET", ok: false }]);
  assert.deepEqual(partsOf({ type: "verb", cell: "GM-FH-ÞT-3P-ET" }, { ok: true }), [{ cell: "GM-FH-ÞT-3P-ET", ok: true }]);
  assert.deepEqual(partsOf({ type: "villur" }, { ok: true }), []);
  assert.deepEqual(partsOf(null, null), []);
});

test("S.byNode: blank, kept through a reload, cleaned of anything unknown, held by the server", () => {
  assert.deepEqual(blankState().byNode, {});
  const S = blankState();
  noteNodeAnswer(S, "verb", [{ cell: "GM-FH-ÞT-3P-ET", ok: true }], 2, NOW);
  const back = migrate(JSON.parse(JSON.stringify(S)));
  assert.deepEqual(back.byNode, S.byNode);
  const dirty = { "so-tid": { n: 3, c: 9, h: "AAb<script>", at: NOW, x: 1 }, "no-foll": { n: 1, c: 1, h: "A", at: 1 },
    "nope": { n: 1, c: 1, h: "A", at: 1 }, "so-midmynd": "junk" };
  const clean = cleanByNode(dirty);
  assert.deepEqual(Object.keys(clean), ["so-tid"], "only nodes that keep a record; no-foll reads its types");
  assert.ok(clean["so-tid"].c <= clean["so-tid"].n);
  assert.ok(/^[A-Ga-g]*$/.test(clean["so-tid"].h), "the history is letters of the scale only");
  assert.deepEqual(Object.keys(clean["so-tid"]).sort(), ["at", "c", "h", "n"]);
  assert.deepEqual(cleanByNode(null), {});
  assert.deepEqual(Object.keys(cleanState({ ...blankState(), byNode: dirty }).byNode), ["so-tid"]);
  assert.deepEqual(migrate({ ...blankState(), byNode: dirty }).byNode, clean);
});

test("two devices: a node's counts add and the history answered last wins", () => {
  const base = blankState();
  noteNodeAnswer(base, "verb", [{ cell: "GM-FH-ÞT-3P-ET", ok: true }], 2, NOW);
  const a = JSON.parse(JSON.stringify(base)), b = JSON.parse(JSON.stringify(base));
  noteNodeAnswer(a, "verb", [{ cell: "GM-FH-ÞT-3P-ET", ok: false }], 2, NOW + 10);
  noteNodeAnswer(b, "verb", [{ cell: "GM-FH-ÞT-3P-ET", ok: true }], 2, NOW + 20);
  noteNodeAnswer(b, "verb", [{ cell: "GM-FH-ÞT-3P-ET", ok: true }], 2, NOW + 30);
  const m = mergeByNode(base.byNode, a.byNode, b.byNode)["so-tid"];
  assert.deepEqual([m.n, m.c, m.at, m.h], [4, 3, NOW + 30, b.byNode["so-tid"].h]);
  assert.deepEqual(mergeStates(base, a, b).byNode["so-tid"], m, "mergeStates carries it");
});

/* ---------- (a) the standing of one node ------------------------------------- */

test("a node no question asks is locked, and nothing else is said of it", () => {
  const locked = NODES.filter((n) => !n.types.length);
  assert.ok(locked.length > 0);
  for (const n of locked) {
    assert.deepEqual(standingOfNode(n, blankState(), NOW), { id: n.id, locked: true, mastery: null,
      answers: 0, last: null, lastDays: null, due: 0, waiting: 0, active: [], needsWork: false });
  }
  assert.equal(standingOfNode(null, blankState(), NOW), null);
});

test("a pupil who has answered nothing: every open node is 'Of fá svör', never trained, nothing waiting", () => {
  const S = blankState();
  for (const n of NODES.filter((x) => x.types.length)) {
    const st = standingOfNode(n, S, NOW);
    assert.equal(st.locked, false);
    assert.deepEqual([st.mastery.level, st.mastery.label, st.answers, st.last, st.lastDays, st.due, st.waiting,
      st.active.length, st.needsWork], [0, LABELS[0], 0, null, null, 0, 0, 0, false], n.id);
  }
  /* And it never throws on a state with holes in it. */
  for (const n of NODES) assert.ok(standingOfNode(n, {}, NOW));
});

test("how well: the mastery mark of exactly the node's question types", () => {
  const S = pupil("no-beyging", { answers: "1".repeat(18) + "00" });
  const st = standingOfNode(node("no-beyging"), S, NOW);
  const m = masteryOfTypes(S, node("no-beyging").types, NOW);
  assert.equal(st.mastery.level, m.level);
  assert.ok(st.mastery.level >= 3, "18 of 20 at the pupil's level is at least 'Gott vald'");
  assert.equal(st.mastery.label, LABELS[st.mastery.level]);
  assert.deepEqual([st.mastery.n, st.mastery.right, st.mastery.band, st.answers], [20, 18, 3, 20]);
  /* Another node of the same category is untouched by it. */
  assert.equal(standingOfNode(node("no-foll"), S, NOW).mastery.level, 0);
  /* Weak answers are weak. */
  const weak = standingOfNode(node("no-beyging"), pupil("no-beyging", { answers: "0100010001" }), NOW);
  assert.equal(weak.mastery.level, 1);
});

test("when last: the latest answer to any of the node's types, in whole calendar days", () => {
  const n = node("no-foll");
  const S = pupil("no-foll", { answers: "111", daysAgo: 9 });
  let st = standingOfNode(n, S, NOW);
  assert.deepEqual([st.last, st.lastDays], [NOW - 9 * DAY, 9]);
  noteTypeAnswer(S, n.types[1], 3, true, NOW - 1 * DAY);
  st = standingOfNode(n, S, NOW);
  assert.deepEqual([st.last, st.lastDays, st.answers], [NOW - DAY, 1, 4]);
  /* Late last night is "yesterday", not "today", though less than a day ago. */
  const late = pupil("no-foll", { answers: "1" });
  late.byType[n.types[0]].at = new Date(2026, 10, 15, 23, 50).getTime();
  assert.equal(standingOfNode(n, late, NOW).lastDays, 1);
  /* A record from a device whose clock is ahead: never in the future. */
  late.byType[n.types[0]].at = NOW + 5 * DAY;
  st = standingOfNode(n, late, NOW);
  assert.deepEqual([st.last, st.lastDays], [NOW, 0]);
});

test("needs work: reviews of the node that are due", () => {
  const n = node("no-foll");
  const S = pupil("no-foll", { answers: "1110" });
  entry(S, { t: "fill", c: "ÞGFFT", w: "hestur|kk", due: TODAY });
  entry(S, { t: "tbl_no", c: "EFFT", w: "kona|kvk", due: addDays(TODAY, -3) });
  entry(S, { t: "fill", c: "ÞFET", w: "bók|kvk", due: addDays(TODAY, 2) });           // waiting, not due
  entry(S, { t: "lo_samr", c: "FSB-KK-NFET", w: "góður|lo", due: TODAY });            // another node's
  entry(S, { t: "fill", c: "EFET", w: "x|kk", due: addDays(TODAY, -(STALE_DAYS + 1)) }); // stale: let go
  const st = standingOfNode(n, S, NOW);
  assert.deepEqual([st.due, st.waiting, st.active, st.needsWork], [2, 3, [], true]);
  assert.equal(entriesOfNode(n, S, NOW).length, 3);
  assert.equal(standingOfNode(node("lo-samraemi"), S, NOW).due, 1);
  assert.equal(standingOfNode(node("no-beyging"), S, NOW).needsWork, false);
});

test("needs work: an error pattern of the node that is active", () => {
  const S = pupil("no-foll", { answers: "1111" });
  S.diag = { thf_thgf: hot(), ef: cool(), kyn_samraemi: hot(), ogreint: { n: 9, w: 9, h: "000000000", last: null, ex: [] } };
  assert.equal(standingOf(S.diag.thf_thgf).active, true, "the fixture is an active pattern");
  assert.equal(standingOf(S.diag.ef).active, false);
  const st = standingOfNode(node("no-foll"), S, NOW);
  assert.deepEqual([st.active, st.due, st.needsWork], [["thf_thgf"], 0, true]);
  assert.deepEqual(standingOfNode(node("lo-samraemi"), S, NOW).active, ["kyn_samraemi"]);
  assert.equal(standingOfNode(node("no-kyn-tala"), S, NOW).needsWork, false);
});

test("a node that is one feature of its types reads its own record, not the types'", () => {
  const S = blankState();
  setSkillLevel(S, "sagnord", 2, { now: 1 });
  /* Sure of the present tense: twenty right answers to the verb type… */
  for (let k = 0; k < 20; k++) noteTypeAnswer(S, "verb", 2, true, NOW);
  /* …and lost in the subjunctive. */
  for (let k = 0; k < 10; k++) noteNodeAnswer(S, "verb", [{ cell: "GM-VH-NT-3P-ET", ok: k === 0 }], 2, NOW - 2 * DAY);
  const vh = standingOfNode(node("so-vidtengingarhattur"), S, NOW);
  assert.deepEqual([vh.mastery.level, vh.mastery.n, vh.mastery.right, vh.answers, vh.lastDays], [1, 10, 1, 10, 2]);
  const tid = standingOfNode(node("so-tid"), S, NOW);
  assert.deepEqual([tid.mastery.level, tid.answers, tid.last], [0, 0, null], "no past-tense answer yet");
  assert.ok(standingOfNode(node("so-persona-tala"), S, NOW).mastery.level >= 3, "the node that IS the types");
  /* The queue is read by the same feature. */
  entry(S, { t: "verb", c: "GM-VH-ÞT-3P-ET", w: "fara|so", due: TODAY });
  entry(S, { t: "verb", c: "GM-FH-NT-3P-ET", w: "koma|so", due: TODAY });
  assert.equal(standingOfNode(node("so-vidtengingarhattur"), S, NOW).due, 1);
  assert.equal(standingOfNode(node("so-tid"), S, NOW).due, 1);
  assert.equal(standingOfNode(node("so-midmynd"), S, NOW).due, 0);
  assert.equal(standingOfNode(node("so-persona-tala"), S, NOW).due, 2);
});

test("standingOfNode is pure: it changes nothing and reads no clock", () => {
  const S = pupil("no-foll", { answers: "1101" });
  S.diag = { thf_thgf: hot() };
  entry(S, { t: "fill", c: "ÞGFFT", w: "hestur|kk" });
  const before = JSON.stringify(S);
  const a = standingOfNode(node("no-foll"), S, NOW), b = standingOfNode(node("no-foll"), S, NOW);
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(S), before);
  assert.equal(standingOfNode(node("no-foll"), S, NOW + 400 * DAY).lastDays, 400);
});

/* ---------- the three facts in words ------------------------------------------ */

test("lastText and needsText say it as a pupil would", () => {
  assert.deepEqual([null, 0, 1, 2, 6, 7, 13, 14, 29, 30, 59, 60, 364, 365].map(lastText),
    ["ekki æft enn", "í dag", "í gær", "fyrir 2 dögum", "fyrir 6 dögum", "fyrir viku", "fyrir viku",
      "fyrir 2 vikum", "fyrir 4 vikum", "fyrir mánuði", "fyrir mánuði", "fyrir 2 mánuðum",
      "fyrir 12 mánuðum", "fyrir meira en ári"]);
  const st = (due, active) => ({ locked: false, due, active: Array(active).fill("x") });
  assert.equal(needsText(st(0, 0)), "");
  assert.equal(needsText(st(1, 0)), "1 atriði bíður upprifjunar");
  assert.equal(needsText(st(3, 0)), "3 atriði bíða upprifjunar");
  assert.equal(needsText(st(11, 0)), "11 atriði bíða upprifjunar");
  assert.equal(needsText(st(21, 1)), "21 atriði bíður upprifjunar · 1 villumynstur algengt núna");
  assert.equal(needsText({ locked: true }), "");
  const S = pupil("no-foll", { answers: "1", daysAgo: 1 });
  entry(S, { t: "fill", c: "ÞGFFT", w: "hestur|kk" });
  const n = node("no-foll"), s = standingOfNode(n, S, NOW);
  assert.equal(nodeSentence(n, s), "Föllin fjögur. Vald: Of fá svör. Síðast æft í gær. Bíður þín: 1 atriði bíður upprifjunar.");
  assert.doesNotMatch(nodeSentence(n, s, { teacher: true }), /Síðast|í gær|þín/);
  const lock = NODES.find((x) => !x.types.length);
  assert.match(nodeSentence(lock, standingOfNode(lock, S, NOW)), /Læst/);
});

test("cellLabel names only the cells it is sure of", () => {
  assert.equal(cellLabel("ÞGFFT"), "þágufall, fleirtala, án greinis");
  assert.equal(cellLabel("stjórn:á"), "fallstjórn: á");
  assert.equal(cellLabel("setn:frumlag"), "frumlag");
  assert.equal(cellLabel("lidur:fl"), "forsetningarliður");
  for (const bad of [null, "", "stjórn:", "eitthvað:<b>", "lidur:zz", 7]) assert.equal(cellLabel(bad), null);
});

/* ---------- the opened node --------------------------------------------------- */

test("an opened node: its rule, its patterns, its worst cells and words, its Lesefni page", () => {
  const S = pupil("no-foll", { answers: "110100" });
  S.diag = { thf_thgf: hot(), ef: cool(), kyn_samraemi: hot() };
  S.cells = { ÞGFFT: { c: 2, w: 5 }, EFFT: { c: 4, w: 1 }, NFET: { c: 9, w: 0 } };
  S.words = { "hestur|kk": { c: 1, w: 4 } };
  entry(S, { t: "fill", c: "ÞGFFT", w: "hestur|kk", due: TODAY, l: 3 });
  entry(S, { t: "tbl_no", c: "ÞGFFT", w: "kona|kvk", due: addDays(TODAY, 2), l: 1 });
  entry(S, { t: "fill", c: "EFFT", w: "kona|kvk", due: TODAY, l: 1 });
  entry(S, { t: "lo_samr", c: "FSB-KK-NFET", w: "góður|lo", due: TODAY, l: 9 });
  const d = nodeDetail(node("no-foll"), S, NOW);
  assert.equal(d.lesson, "foll");
  assert.ok(lessonById(d.lesson));
  assert.deepEqual(d.rule, { text: patternById("thf_thgf").rule, from: "thf_thgf" });
  assert.deepEqual(d.patterns.map((p) => [p.id, p.active]), [["thf_thgf", true], ["ef", false]],
    "the node's patterns the pupil has met, the active one first; kyn_samraemi is another node's");
  assert.deepEqual(d.cells.map((c) => [c.cell, c.label, c.missed, c.due, c.right, c.wrong]), [
    ["ÞGFFT", "þágufall, fleirtala, án greinis", 4, 1, 2, 5],
    ["EFFT", "eignarfall, fleirtala, án greinis", 1, 1, 4, 1]]);
  assert.deepEqual(d.words.map((w) => [w.key, w.lemma, w.cls, w.missed, w.due]), [
    ["hestur|kk", "hestur", "kk", 3, 1], ["kona|kvk", "kona", "kvk", 2, 1]]);
  assert.deepEqual(d.grid, { ÞGFFT: { c: 2, w: 5 }, EFFT: { c: 4, w: 1 }, NFET: { c: 9, w: 0 } },
    "the noun table's cells ride on the node of the four cases");
  assert.equal(NOUN_GRID_NODE, "no-foll");
  assert.equal(nodeDetail(node("lo-samraemi"), S, NOW).grid, null);
  /* What standingOfNode says is in it unchanged. */
  const st = standingOfNode(node("no-foll"), S, NOW);
  for (const k of Object.keys(st)) assert.deepEqual(d[k], st[k], k);
});

test("every open node has something to say when opened: a rule or a Lesefni page", () => {
  for (const n of NODES) {
    const d = nodeDetail(n, blankState(), NOW);
    assert.ok(d, n.id);
    if (n.lesson) assert.ok(lessonById(n.lesson), `${n.id}: its Lesefni page does not exist`);
    if (n.types.length) assert.ok(d.rule || d.lesson, `${n.id} opens with neither a rule nor a page`);
    if (d.rule) assert.ok(typeof d.rule.text === "string" && d.rule.text.length > 10, n.id);
    assert.deepEqual([d.patterns, d.cells, d.words], [[], [], []]);
  }
});

/* ---------- the whole map ----------------------------------------------------- */

test("the map: every node once, under its category and year, with what the old panels showed", () => {
  const S = pupil("no-foll", { answers: "1".repeat(20) });
  S.diag = { thf_thgf: hot(), broddar: hot(), stafsetning: cool(), ogreint: { n: 9, w: 4, h: "0101", last: null, ex: [] } };
  entry(S, { t: "lo_samr", c: "FSB-KK-NFET", w: "góður|lo", due: TODAY });
  entry(S, { t: "lo_samr", c: "FSB-KK-ÞFET", w: "stór|lo", due: TODAY });
  const m = mapOf(S, NOW, effectivePolicy(S));
  const all = m.cats.flatMap((c) => c.groups.flatMap((g) => g.nodes.map((n) => ({ ...n, in: c.id, under: g.year }))));
  assert.deepEqual(all.map((n) => n.id).sort(), NODES.map((n) => n.id).sort());
  for (const n of all) {
    const src = node(n.id);
    assert.deepEqual([n.in, n.under, n.nm], [src.cat, src.year, src.nm]);
    assert.ok(YEARS.includes(n.under));
    const { nm, year, cat, lesson, on, in: _i, under: _u, ...st } = n;
    assert.deepEqual(st, standingOfNode(src, S, NOW), n.id);
  }
  const t = m.totals;
  assert.equal(t.nodes, NODES.length);
  assert.equal(t.locked, NODES.filter((n) => !n.types.length).length);
  assert.equal(t.open + t.locked, t.nodes);
  assert.equal(t.secure + t.learning + t.unknown, t.open);
  assert.equal(t.needs, 2);
  /* What to do next: the most reviews due first. */
  assert.deepEqual(m.next, ["lo-samraemi", "no-foll"]);
  /* Styrkleikar eftir efni rides on the head of each category. */
  const nafn = m.cats.find((c) => c.id === "nafnord");
  assert.ok(nafn.skill && nafn.skill.level >= 1 && typeof nafn.skill.rank === "string" && nafn.mastery);
  assert.deepEqual(m.cats.filter((c) => !c.planned).map((c) => c.id),
    SKILLS.map((s) => s.id).filter((id) => NODES.some((n) => n.cat === id)));
  /* A planned category holds only locked nodes. */
  for (const c of m.cats.filter((x) => x.planned))
    assert.ok(c.groups.every((g) => g.nodes.every((n) => n.locked)), c.id);
  /* Villumynstur of no node: listed under the map, "Ógreint" among them as a count. */
  assert.deepEqual(m.loose.map((p) => [p.id, p.active, p.meta]),
    [["broddar", true, false], ["stafsetning", false, false], ["ogreint", false, true]]);
});

test("a node of a category that is switched off is marked off and is not what to do next", () => {
  const S = blankState();
  S.diag = { thf_thgf: hot(), kyn_samraemi: hot() };
  const before = mapOf(S, NOW, effectivePolicy(S));
  assert.deepEqual(before.next.slice().sort(), ["lo-samraemi", "no-foll"]);
  S.enabled = { ...(S.enabled || {}), nafnord: false };
  const m = mapOf(S, NOW, effectivePolicy(S));
  const find = (id) => m.cats.flatMap((c) => c.groups.flatMap((g) => g.nodes)).find((n) => n.id === id);
  assert.equal(find("no-foll").on, false);
  assert.equal(find("lo-samraemi").on, true);
  assert.equal(m.cats.find((c) => c.id === "nafnord").on, false);
  assert.deepEqual(m.next, ["lo-samraemi", "no-foll"], "what is switched on comes first");
  /* It is still shown, with its standing: a switch hides nothing a pupil did. */
  assert.deepEqual(find("no-foll").active, ["thf_thgf"]);
});

/* ---------- (d) the teacher's copy -------------------------------------------- */

test("the teacher's map: the same marks and counts, and nothing the notice does not promise", () => {
  const S = pupil("no-foll", { answers: "1101011101", daysAgo: 3 });
  S.diag = { thf_thgf: hot(), broddar: hot() };
  S.cells = { ÞGFFT: { c: 2, w: 5 } };
  S.words = { "hestur|kk": { c: 1, w: 4 } };
  S.xp = { nafnord: 12345 };
  entry(S, { t: "fill", c: "ÞGFFT", w: "hestur|kk", due: TODAY, l: 3 });
  const own = mapOf(S, NOW, effectivePolicy(S));
  const t = teacherMap(S, NOW, effectivePolicy(S));
  assert.equal(t.teacher, true);
  assert.deepEqual(t.totals, own.totals);
  assert.deepEqual(t.next, own.next);
  const mine = own.cats.flatMap((c) => c.groups.flatMap((g) => g.nodes));
  const theirs = t.cats.flatMap((c) => c.groups.flatMap((g) => g.nodes));
  assert.equal(theirs.length, mine.length);
  theirs.forEach((n, k) => {
    assert.deepEqual([n.id, n.locked, n.due, n.waiting, n.active, n.needsWork, n.mastery && n.mastery.level],
      [mine[k].id, mine[k].locked, mine[k].due, mine[k].waiting, mine[k].active, mine[k].needsWork,
        mine[k].mastery && mine[k].mastery.level]);
    for (const k2 of ["last", "lastDays", "answers"]) assert.ok(!(k2 in n), `${n.id} carries ${k2}`);
  });
  const d = t.details["no-foll"];
  assert.deepEqual(d.patterns.map((p) => [p.id, p.active]), [["thf_thgf", true]]);
  assert.deepEqual(d.cells.map((c) => [c.cell, c.missed]), [["ÞGFFT", 3]]);
  assert.ok(!("words" in d) && !("rule" in d));
  const sent = JSON.stringify(t);
  /* No word the pupil missed, no example, no date or time, no raw history, no XP. */
  for (const secret of ["hestur", "ÞGFET", "ÞFET\"", TODAY, addDays(TODAY, -1), String(NOW - 3 * DAY), "12345",
    "\"h\":", "\"ex\":", "\"at\":", "\"xp\"", "\"last\"", "lastDays", "\"words\""])
    assert.ok(!sent.includes(secret), `the teacher's map carries ${secret}`);
  for (const c of t.cats) assert.equal(c.skill, null, "no stig or XP");
});

/* ---------- the session a node's button starts --------------------------------- */

test("a node's session: exactly its question types and features, opening with its own due reviews", () => {
  const S = blankState();
  const a = entry(S, { t: "fill", c: "ÞGFFT", w: "hestur|kk", due: addDays(TODAY, -4), s: 1 });
  const b = entry(S, { t: "tbl_no", c: "EFFT", w: "kona|kvk", due: TODAY, s: 0 });
  const c = entry(S, { t: "fill", c: "ÞFET", w: "bók|kvk", due: addDays(TODAY, -1), s: 0 });
  const d = entry(S, { t: "no_val", c: "EFET", w: "hús|hk", due: addDays(TODAY, -2), s: 0 });
  entry(S, { t: "fill", c: "NFFT", w: "dagur|kk", due: addDays(TODAY, 1) });       // not due
  entry(S, { t: "lo_samr", c: "FSB-KK-NFET", w: "góður|lo", due: TODAY });        // another node's
  const s = nodeSession(node("no-foll"), S, NOW);
  assert.deepEqual([s.id, s.n, s.types, s.cats, s.attrs, s.lesson, s.label],
    ["no-foll", NODE_RUN, node("no-foll").types, ["nafnord"], null, "foll", "Færnikort: Föllin fjögur"]);
  assert.notEqual(s.types, node("no-foll").types, "a copy: the catalogue cannot be changed through it");
  assert.equal(s.review.length, openingSize(NODE_RUN));
  assert.ok(s.review.every((k) => [a.k, b.k, c.k, d.k].includes(k)), "only the node's own entries that are due");
  assert.ok(!s.review.includes(a.k) || s.review.indexOf(a.k) === s.review.length - 1,
    "the least practised come first");
  const vh = nodeSession(node("so-vidtengingarhattur"), S, NOW);
  assert.deepEqual([vh.types, vh.attrs, vh.review], [["verb", "verbslot", "tbl_so"], { hattur: ["VH"] }, []]);
  assert.equal(nodeSession(NODES.find((n) => !n.types.length), S, NOW), null, "a locked node starts nothing");
  assert.equal(nodeSession(null, S, NOW), null);
  for (const n of NODES.filter((x) => x.types.length)) assert.deepEqual(nodeSession(n, S, NOW).types, n.types);
});
