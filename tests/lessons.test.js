/* v6.7: Lesefni — the pages, their tables out of BÍN, and which page each
   question links to. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, newSession } from "../src/js/core/state.js";
import { TASKS } from "../src/js/tasks/index.js";
import { SKILLS } from "../src/js/core/skills.js";
import { TERMS } from "../src/js/core/glossary.js";
import { LESSONS, lessonById, lessonFor, buildTable, brokenTables, TERM_LESSON,
         markRead, readCount } from "../src/js/core/lessons.js";

const lex = buildLexicon(DATA);
const BLOCKS = new Set(["h", "p", "list", "ex", "tip", "warn", "table"]);

test("twenty pages, unique ids, a skill each, only known kinds of block", () => {
  assert.ok(LESSONS.length >= 15);
  assert.equal(new Set(LESSONS.map((l) => l.id)).size, LESSONS.length);
  const skills = new Set(SKILLS.map((s) => s.id));
  for (const l of LESSONS) {
    assert.ok(skills.has(l.skill), `${l.id}: ${l.skill}`);
    assert.ok(l.nm && l.blocks.length, l.id);
    for (const b of l.blocks) assert.ok(Object.keys(b).some((k) => BLOCKS.has(k)), `${l.id}: ${JSON.stringify(b).slice(0, 60)}`);
    for (const r of l.related || []) assert.ok(lessonById(r), `${l.id} → ${r}`);
    for (const c of l.check || []) assert.ok(c.q && c.a, l.id);
  }
});

test("every skill has at least one page", () => {
  for (const s of SKILLS) assert.ok(LESSONS.some((l) => l.skill === s.id), s.id);
});

test("every table on every page is filled from BÍN, never left mostly empty", () => {
  assert.deepEqual(brokenTables(lex), []);
});

test("a table shows what the lexicon holds, and a homograph can be chosen", () => {
  const t = buildTable(lex, { table: "noun", w: "hestur", c: "kk" });
  assert.equal(t.rows[0].cells[0], "hestur");
  assert.equal(t.rows[3].cells[1], "hestsins");
  const art = buildTable(lex, { table: "pron", w: "hinn", c: "gr", num: "ET" });
  assert.equal(art.rows[0].cells[2], "hið", "the article, not the pronoun hitt");
  assert.equal(buildTable(lex, { table: "noun", w: "ekkiorð", c: "kk" }), null);
});

test("every kind of question links to a page", () => {
  const S = blankState(), sess = newSession(S);
  const ctx = { lex, S, sess };
  for (const spec of TASKS) {
    let task = null;
    for (let k = 0; k < 20 && !task; k++) task = spec.gen(ctx);
    if (!task) continue;
    const id = lessonFor(task);
    assert.ok(id && lessonById(id), `${spec.id} (${task.skill}) has no page`);
  }
});

test("a comparative goes to stigbreyting, a subjunctive to háttur, miðmynd to mynd", () => {
  assert.equal(lessonFor({ skill: "lysingarord", type: "table", cells: [{ m: "MST-KK-NFET" }] }), "stigbreyting");
  assert.equal(lessonFor({ skill: "lysingarord", type: "table", cells: [{ m: "FSB-KK-NFET" }] }), "lo-beyging");
  assert.equal(lessonFor({ skill: "sagnord", type: "verb", m: "GM-VH-NT-1P-ET" }), "hattur");
  assert.equal(lessonFor({ skill: "sagnord", type: "verb", m: "MM-FH-NT-1P-ET" }), "mynd");
  assert.equal(lessonFor({ skill: "sagnord", type: "verb", m: "GM-FH-ÞT-1P-ET" }), "tid");
  assert.equal(lessonFor({ skill: "ordaford", type: "meaning" }), "ordafordi");
});

test("glossary terms point at real pages", () => {
  const ids = new Set(TERMS.map((t) => t.id));
  for (const [term, page] of Object.entries(TERM_LESSON)) {
    assert.ok(ids.has(term), `no glossary term ${term}`);
    assert.ok(lessonById(page), `no page ${page}`);
  }
});

test("a page is counted as read once", () => {
  const S = blankState();
  assert.equal(markRead(S, "foll"), true);
  assert.equal(markRead(S, "foll"), false);
  assert.equal(markRead(S, "ekki-til"), false);
  assert.equal(readCount(S), 1);
});
