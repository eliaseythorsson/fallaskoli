/* The review page (critique item 82, tools/review.mjs): every hand-written
   item on one page, for a native speaker to read through.

   It is only useful if it is complete, so the test counts independently of
   the tool: every line of every content/*.tsv, every Lesefni page and every
   worked example must be on it, with its file and line. And every note in
   content/REVIEW-NOTES.md meant for the page must find the items it is
   about — a note whose phrase stops matching (the item was reworded) would
   otherwise quietly vanish from the page. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collect, parseNotes, attachNotes, renderHtml, build, KINDS } from "../tools/review.mjs";
import { LESSONS } from "../src/js/content/lessons.js";
import { EXAMPLES } from "../src/js/content/examples.js";

const root = fileURLToPath(new URL("..", import.meta.url));

function tsvFiles(dir = "content") {
  return readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? tsvFiles(dir + "/" + e.name) : e.name.endsWith(".tsv") ? [dir + "/" + e.name] : []);
}

/* Counted without the tool's parser: lines that are not blank, not a
   comment and not the header. */
function dataLines(rel) {
  const out = [];
  let header = false;
  readFileSync(path.join(root, rel), "utf8").split("\n").forEach((l, i) => {
    if (!l.trim() || /^\s*#/.test(l)) return;
    if (!header) { header = true; return; }
    out.push(i + 1);
  });
  return out;
}

const col = await collect();
const notes = attachNotes(col.items, parseNotes(readFileSync(path.join(root, "content/REVIEW-NOTES.md"), "utf8")));

test("review page: every line of every content file is an item, with its file and line", () => {
  for (const rel of tsvFiles()) {
    const want = dataLines(rel);
    const got = col.items.filter((it) => it.file === rel).map((it) => it.line);
    assert.deepEqual(got, want, rel);
  }
});

test("review page: every Lesefni page and every worked example is an item", () => {
  const lessons = col.items.filter((it) => it.kind === "lesefni");
  assert.deepEqual(lessons.map((it) => it.text), LESSONS.map((L) => L.nm));
  const src = readFileSync(path.join(root, "src/js/content/lessons.js"), "utf8").split("\n");
  for (const it of lessons) assert.match(src[it.line - 1], /id: "/, it.text);
  const ex = col.items.filter((it) => it.kind === "synidaemi");
  /* one per type, and one per kind where a type has kinds (umritun) */
  const kinds0 = Object.values(EXAMPLES).reduce((n, e) => n + Object.keys(e.byKind || {}).length, 0);
  assert.ok(kinds0 >= 9, kinds0);
  assert.equal(ex.length, Object.keys(EXAMPLES).length + kinds0);
  const esrc = readFileSync(path.join(root, "src/js/content/examples.js"), "utf8").split("\n");
  for (const it of ex) {
    const [type, kind] = it.fields.find(([k]) => k === "gerð")[1].split(" · ");
    assert.equal(esrc[it.line - 1].trim(), (kind || type) + ": {", type);
    assert.equal(it.answer, kind ? EXAMPLES[type].byKind[kind].a : EXAMPLES[type].a);
  }
  /* and every item belongs to a kind the page knows */
  const kinds = new Set(KINDS.map(([k]) => k));
  for (const it of col.items) assert.ok(kinds.has(it.kind), it.kind);
});

test("review page: an item shows its answer, explanation and level where it has them", () => {
  const gap = col.items.find((it) => it.file === "content/fornofn/eyda.tsv");
  assert.ok(gap.answer && gap.explain && gap.level, JSON.stringify(gap));
  const hunt = col.items.find((it) => it.kind === "villuveidar");
  assert.match(hunt.text, /\[.+\]/);
  assert.ok(hunt.answer && hunt.explain && /^[345]$/.test(hunt.level));
  const sent = col.items.find((it) => it.kind === "setningar");
  assert.ok(/^[1-7]$/.test(sent.level));
});

test("REVIEW-NOTES.md: every note for the page finds its items, every phrase at least one", () => {
  const onPage = notes.filter((n) => !n.outside);
  assert.ok(onPage.length >= 10, onPage.length);
  for (const n of onPage) {
    assert.ok(n.items.length > 0, "finds nothing: " + n.title);
    for (const [phrase, hits] of Object.entries(n.hits)) assert.ok(hits > 0, `${n.title}: ${phrase}`);
  }
  /* the flag the page filters by */
  const flagged = col.items.filter((it) => it.notes.length);
  assert.ok(flagged.length >= onPage.length);
  /* the worked examples are flagged as a whole file */
  assert.ok(col.items.filter((it) => it.kind === "synidaemi").every((it) => it.notes.length));
});

test("REVIEW-NOTES.md: a phrase that matches nothing is reported, not ignored", () => {
  const ns = attachNotes(col.items.map((it) => ({ ...it })),
    parseNotes("## Prófun\nLeita: `engin setning segir þetta qqq`\n\nTexti."));
  assert.equal(ns[0].items.length, 0);
  assert.equal(ns[0].hits["engin setning segir þetta qqq"], 0);
});

test("review page: one self-contained file that holds every item", async () => {
  const out = path.join(mkdtempSync(path.join(tmpdir(), "review-")), "review.html");
  const { col: c2 } = await build(out);
  const html = readFileSync(out, "utf8");
  assert.match(html, /^<!DOCTYPE html>/);
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+href=|https?:\/\//, "the page must make no request");
  const data = JSON.parse(/<script id="data" type="application\/json">(.*?)<\/script>/s.exec(html)[1]);
  assert.equal(data.items.length, c2.items.length);
  assert.equal(data.items.length, col.items.length);
  for (const k of ["Aðeins það sem þarf að athuga", "Sækja athugasemdir", "Í lagi", "Athuga"])
    assert.ok(html.includes(k), k);
  /* nothing in an item can close the data block early */
  assert.ok(!/<\/script>/i.test(JSON.stringify(data)));
  /* and the render is stable for the same input */
  const when = new Date("2026-01-01T00:00:00Z");
  assert.equal(renderHtml(col, notes, when), renderHtml(col, notes, when));
});
