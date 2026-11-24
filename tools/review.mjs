/* The review page: every hand-written item on one page (critique item 82).

     node tools/review.mjs            -> dist/review.html
     node tools/review.mjs OUT.html   -> anywhere else

   The owner hands the page to a native speaker, who goes through everything
   in one place: each sentence, exercise item, frame, Villuveiðar item,
   Lesefni page and worked example, with its answer, its explanation, its
   level and the file and line it is written on, so that a correction can be
   made where the item lives. The notes the authors left for a native reader
   (content/REVIEW-NOTES.md) stand beside the items they concern, and those
   items are marked "þarf að athuga"; the page filters by kind, by that mark,
   by level and by text.

   The reader can mark an item "Í lagi" or "Athuga" and write a comment. The
   marks stay in this browser (localStorage), and "Sækja athugasemdir"
   downloads them as a plain text file to send back. Nothing is sent
   anywhere: the page is one file and makes no request.

   What it reads, and nothing else:
     content/**\/*.tsv           the items (the same files the build reads,
                                 parsed the way pipeline/content_io.py parses them)
     src/js/content/lessons.js   the Lesefni pages (left in JavaScript: the
     src/js/content/examples.js  app imports them as they are)
     content/REVIEW-NOTES.md     the notes
     data/data_bundle.js         only for the words allowed into one frame
                                 each (content/setningar/lino-rammar.tsv): the
                                 page shows the sentence as the pupil will
                                 read it, with the word in the form BÍN gives  */

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const p = (...x) => path.join(root, ...x);

/* What each folder of content/ is, as the page names it, in the page's order. */
export const KINDS = [
  ["setningar", "Setningabankinn"],
  ["villuveidar", "Villuveiðar"],
  ["lysingarord", "Lýsingarorð"],
  ["fornofn", "Fornöfn"],
  ["toluord", "Töluorð"],
  ["fallstjorn", "Fallstjórn"],
  ["obeygjanleg", "Óbeygjanleg orð"],
  ["ordafordi", "Orðaforði"],
  ["lesefni", "Lesefni"],
  ["synidaemi", "Sýnidæmi"],
];

/* ---------- reading ----------------------------------------------------- */

/** One TSV file as pipeline/content_io.py reads it: comments, a header line, one item
    per line, missing trailing fields empty. Each row keeps its line number
    and the comment lines written right above it. */
export function parseTsv(text) {
  const lines = text.split("\n");
  let header = null, above = [], title = null;
  const rows = [];
  lines.forEach((raw, i) => {
    const line = raw.replace(/\r$/, "");
    if (/^\s*#/.test(line)) {
      const c = line.replace(/^\s*# ?/, "");
      if (title === null && c.trim()) title = c.trim();
      if (header) above.push(c);
      return;
    }
    if (!line.trim()) return;
    const cells = line.split("\t");
    if (!header) { header = cells.map((c) => c.trim()); return; }
    while (cells.length < header.length) cells.push("");
    rows.push({ line: i + 1, cells: Object.fromEntries(header.map((h, k) => [h, cells[k]])),
      above: above.filter((x) => x.trim() && !/^[=\-\s]+$/.test(x)) });
    above = [];
  });
  return { title: title || "", header: header || [], rows };
}

async function tsvFiles(dir = "content") {
  const out = [];
  for (const e of await readdir(p(dir), { withFileTypes: true })) {
    const rel = dir + "/" + e.name;
    if (e.isDirectory()) out.push(...await tsvFiles(rel));
    else if (e.name.endsWith(".tsv")) out.push(rel);
  }
  return out.sort();
}

/* The columns that say the same thing in every file get a fixed place on the
   card; every other column is shown under its own name. */
const TEXT_COLS = ["setning", "rammi", "texti"];
const LEVEL_COLS = ["þyngd", "bónus"];

function itemFromRow(rel, kind, list, header, r) {
  const c = r.cells;
  /* the item is its sentence or frame; a list of words or verbs has none,
     and is shown by its first column */
  const textCol = TEXT_COLS.find((k) => k in c && c[k]) || header[0];
  const levelCol = LEVEL_COLS.find((k) => k in c);
  const fields = header
    .filter((h) => h !== textCol && h !== levelCol && h !== "svar" && h !== "villa" && h !== "skýring" && c[h] !== "")
    .map((h) => [h, c[h]]);
  const lv = !levelCol ? "" : levelCol === "bónus" ? (c[levelCol] && c[levelCol] !== "0" ? "+" + c[levelCol] : "")
    : c[levelCol];
  return {
    kind, list, file: rel, line: r.line, level: lv, levelName: levelCol || "",
    text: c[textCol], explain: c["skýring"] || "", fields, above: r.above,
    /* Villuveiðar: the sentence is the right one, and what matters beside it
       is the wrong form the pupil is shown */
    answer: c["svar"] || c["villa"] || "", answerLabel: "villa" in c ? "Nemandinn sér" : "Svar",
  };
}

/* ---------- a word allowed into one frame (issue #20) --------------------
   content/setningar/lino-rammar.tsv holds a word and a frame; what a reader
   has to judge is the sentence the two make. It is made here the way the app
   makes it (tasks/frames.js fillFrame): the frame's slot, the word's form
   under the slot's own BÍN mark, out of the built data. A pair the built data
   does not have (the file was edited and ./build.sh has not run) is shown as
   written, and says so. */
export const PAIRS_FILE = "content/setningar/lino-rammar.tsv";

async function builtData() {
  const f = p("data/data_bundle.js");
  if (!existsSync(f)) return null;
  const js = await readFile(f, "utf8");
  const D = JSON.parse(js.slice(js.indexOf("{"), js.lastIndexOf("};") + 1));
  const order = D.lex.orders.no;
  const nouns = new Map();
  for (const w of D.lex.w) if (["kk", "kvk", "hk"].includes(w.c)) nouns.set(w.o + "|" + w.c, w);
  return { sent: new Map(D.sent.map((s) => [s.t, s])), nouns, order };
}

/** The pair's card: the filled sentence as the text, the frame as written
    and the form beside it, the frame's own þyngd. */
function pairItem(it, cells, data) {
  const [lemma, gender] = cells["orð"].split("|");
  const frame = cells["rammi"];
  const s = data && data.sent.get(frame);
  const key = s && (s.al || []).find((k) => k === lemma + "|" + (gender || k.split("|")[1]));
  const w = key && data.nouns.get(key);
  const mark = s && s.slot != null ? s.tok[s.slot].m : "";
  const form = w ? (String(w.f).split(";")[data.order.indexOf(mark)] || "").split("|")[0] : "";
  it.fields = it.fields.filter(([h]) => h !== "orð");
  it.fields.unshift(["orð", cells["orð"]], ["rammi", frame]);
  if (s) { it.level = String(s.lvl); it.levelName = "þyngd"; }
  if (!form) {
    it.fields.push(["ath.", "parið er ekki í smíðuðu gögnunum; keyrðu ./build.sh"]);
    return it;
  }
  const old = s.tok[s.slot].w;
  const cap = old[0] !== old[0].toLowerCase() ? form[0].toUpperCase() + form.slice(1) : form;
  it.text = s.tok.map((t, j) => ([".", "?", "!", ","].includes(t.w) ? t.w : (j ? " " : "") + (j === s.slot ? cap : t.w))).join("");
  it.answer = cap; it.answerLabel = "Orðið í setningunni";
  it.fields.push(["mynd", mark]);
  return it;
}

/** A Lesefni page as lines of text, in the order the app shows them. */
function lessonBody(L) {
  const out = [];
  if (L.lead) out.push(["p", L.lead]);
  for (const b of L.blocks || []) {
    if (b.h) out.push(["h", b.h]);
    if (b.p) out.push(["p", b.p]);
    if (b.tip) out.push(["tip", b.tip]);
    if (b.warn) out.push(["warn", b.warn]);
    for (const x of b.ex || []) out.push(["ex", x]);
    for (const x of b.list || []) out.push(["li", x]);
    if (b.table) out.push(["table", `Tafla úr BÍN: ${b.w}${b.c ? " (" + b.c + ")" : ""}`
      + `${b.num ? ", " + b.num : ""}${b.deg ? ", " + b.deg : ""}${b.tenses ? ", " + [].concat(b.tenses).join(" ") : ""}`
      + `${b.cap ? " — " + b.cap : ""}`]);
  }
  for (const q of L.check || []) out.push(["q", q.q + " — " + q.a]);
  return out;
}

const lineOf = (src, needle) => {
  const i = src.indexOf(needle);
  return i < 0 ? 0 : src.slice(0, i).split("\n").length;
};

/** Every hand-written item, in the page's order. */
export async function collect() {
  const items = [];
  const lists = [];
  const order = (rel) => KINDS.findIndex(([k]) => k === rel.split("/")[1]);
  const files = (await tsvFiles()).sort((a, b) => order(a) - order(b) || (a < b ? -1 : a > b ? 1 : 0));
  for (const rel of files) {
    const kind = rel.split("/")[1];
    const { title, header, rows } = parseTsv(await readFile(p(rel), "utf8"));
    lists.push({ file: rel, title, n: rows.length });
    const data = rel === PAIRS_FILE ? await builtData() : null;
    for (const r of rows) {
      const it = itemFromRow(rel, kind, title, header, r);
      items.push(rel === PAIRS_FILE ? pairItem(it, r.cells, data) : it);
    }
  }

  const lessonsRel = "src/js/content/lessons.js", examplesRel = "src/js/content/examples.js";
  const { LESSONS } = await import(pathToFileURL(p(lessonsRel)).href);
  const lsrc = await readFile(p(lessonsRel), "utf8");
  for (const L of LESSONS) {
    items.push({
      kind: "lesefni", list: "Lesefni: síðurnar", file: lessonsRel,
      line: lineOf(lsrc, `id: "${L.id}"`), level: "", levelName: "",
      text: L.nm, answer: "", explain: "", fields: [["efni", L.skill], ["id", L.id]],
      body: lessonBody(L), above: [],
    });
  }
  lists.push({ file: lessonsRel, title: "Lesefni: síðurnar", n: LESSONS.length });

  const { EXAMPLES } = await import(pathToFileURL(p(examplesRel)).href);
  const esrc = await readFile(p(examplesRel), "utf8");
  for (const [type, e] of Object.entries(EXAMPLES)) {
    items.push({
      kind: "synidaemi", list: "Sýnidæmi: eitt við hverja spurningagerð", file: examplesRel,
      line: lineOf(esrc, `\n  ${type}: {`) + 1, level: "", levelName: "",
      text: e.q, answer: e.a, explain: e.how,
      fields: [["gerð", type], ["myndir", (e.forms || []).join(", ")]].filter(([, v]) => v), above: [],
    });
    /* a type whose questions come in kinds has one example per kind (umritun) */
    for (const [kind, k] of Object.entries(e.byKind || {})) {
      items.push({
        kind: "synidaemi", list: "Sýnidæmi: eitt við hverja spurningagerð", file: examplesRel,
        line: lineOf(esrc, `\n      ${kind}: {`) + 1, level: "", levelName: "",
        text: k.q, answer: k.a, explain: k.how,
        fields: [["gerð", `${type} · ${kind}`], ["myndir", (k.forms || []).join(", ")]].filter(([, v]) => v), above: [],
      });
    }
  }
  lists.push({ file: examplesRel, title: "Sýnidæmi: eitt við hverja spurningagerð",
    n: Object.values(EXAMPLES).reduce((n, e) => n + 1 + Object.keys(e.byKind || {}).length, 0) });

  items.forEach((it, i) => { it.id = i; });
  return { items, lists };
}

/* ---------- the notes --------------------------------------------------- */

/** content/REVIEW-NOTES.md: `## ` starts a note; `Leita:` and `Skrá:` list
    `quoted` phrases and files; `Úr:` says where it came from. Notes after the
    level-1 heading "Utan síðunnar" are about text that is not on the page. */
export function parseNotes(md) {
  const notes = [];
  let cur = null, outside = false;
  for (const line of md.split("\n")) {
    if (/^# Utan síðunnar/.test(line)) { outside = true; cur = null; continue; }
    const h = /^## (.+)$/.exec(line);
    if (h) { cur = { title: h[1].trim(), find: [], files: [], from: "", body: [], outside }; notes.push(cur); continue; }
    if (!cur) continue;
    const quoted = () => [...line.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    if (/^Leita:/.test(line)) cur.find.push(...quoted());
    else if (/^Skrá:/.test(line)) cur.files.push(...quoted());
    else if (/^Úr:/.test(line)) cur.from = line.replace(/^Úr:\s*/, "");
    else cur.body.push(line);
  }
  for (const n of notes) n.body = n.body.join("\n").trim();
  return notes;
}

/* Phrases are matched without the *emphasis* marks and with spaces folded. */
const norm = (s) => String(s).replace(/\*/g, "").replace(/\s+/g, " ").toLowerCase();

const searchable = (it) => norm([it.text, it.answer, it.explain, ...it.fields.map(([, v]) => v),
  ...(it.body || []).map(([, v]) => v)].join(" \u0001 "));

/** Each note's items, and each item's notes. Returns the notes with
    `items` (ids) and, per phrase, how many items it found. */
export function attachNotes(items, notes) {
  const hay = items.map(searchable);
  for (const it of items) it.notes = [];
  notes.forEach((n, k) => {
    n.id = k;
    n.items = new Set();
    n.hits = {};
    for (const f of n.find) {
      const q = norm(f);
      n.hits[f] = 0;
      items.forEach((it, i) => { if (hay[i].includes(q)) { n.items.add(it.id); n.hits[f]++; } });
    }
    for (const f of n.files) {
      n.hits[f] = 0;
      for (const it of items) if (it.file === f) { n.items.add(it.id); n.hits[f]++; }
    }
    for (const id of n.items) items[id].notes.push(k);
    n.items = [...n.items];
  });
  return notes;
}

/* ---------- the page ---------------------------------------------------- */

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

export function renderHtml({ items, lists }, notes, when = new Date()) {
  const flagged = items.filter((it) => it.notes.length).length;
  const data = {
    items: items.map((it) => ({
      id: it.id, k: it.kind, li: it.list, f: it.file, n: it.line, lv: it.level, ln: it.levelName,
      t: it.text, a: it.answer, al: it.answerLabel || "Svar", x: it.explain, fl: it.fields, ab: it.above, b: it.body || null,
      no: it.notes,
    })),
    notes: notes.map((n) => ({ t: n.title, b: n.body, fr: n.from, o: n.outside, c: n.items.length })),
    kinds: KINDS,
  };
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  const stamp = when.toISOString().slice(0, 10);
  return `<!DOCTYPE html>
<html lang="is">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Fallaskóli — yfirlestur efnis</title>
<style>
  :root { --ink:#1d2330; --mute:#5d6577; --line:#d9dce3; --bg:#f6f5f1; --card:#fff;
          --flag:#fff4d6; --flagline:#e7c45a; --ok:#2f7d4f; --bad:#b4442b; --acc:#2d5b9a; }
  * { box-sizing: border-box; }
  body { margin:0; font:16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; color:var(--ink); background:var(--bg); }
  header { position:sticky; top:0; z-index:2; background:var(--card); border-bottom:1px solid var(--line);
           padding:.8rem 1.2rem; display:flex; flex-wrap:wrap; gap:.6rem 1.2rem; align-items:center; }
  header h1 { font-size:1.15rem; margin:0 1rem 0 0; }
  header label { font-size:.92rem; color:var(--mute); display:flex; gap:.35rem; align-items:center; }
  header select, header input[type=search] { font:inherit; padding:.25rem .4rem; border:1px solid var(--line); border-radius:6px; }
  header input[type=search] { width:16rem; }
  #count { font-size:.92rem; color:var(--mute); margin-left:auto; }
  main { max-width:62rem; margin:0 auto; padding:1rem 1.2rem 4rem; }
  .intro { color:var(--mute); font-size:.95rem; }
  .intro b { color:var(--ink); }
  h2.list { font-size:1.05rem; margin:2rem 0 .5rem; padding-bottom:.25rem; border-bottom:2px solid var(--line); }
  h2.list small { font-weight:400; color:var(--mute); font-family:ui-monospace, monospace; font-size:.8rem; margin-left:.5rem; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:8px; padding:.7rem .9rem; margin:.5rem 0; }
  .card.flag { border-left:5px solid var(--flagline); }
  .card.m-ok { border-right:5px solid var(--ok); }
  .card.m-bad { border-right:5px solid var(--bad); }
  .top { display:flex; gap:.6rem; align-items:baseline; }
  .lv { flex:none; font-size:.8rem; color:var(--mute); min-width:3.2rem; }
  .t { font-size:1.05rem; }
  .ans { margin:.25rem 0 0 3.8rem; }
  .ans b { color:var(--acc); }
  .x { margin:.2rem 0 0 3.8rem; color:#333; }
  .fl { margin:.3rem 0 0 3.8rem; display:flex; flex-wrap:wrap; gap:.3rem; }
  .fl span { font-size:.82rem; background:#eef0f4; border-radius:4px; padding:0 .4rem; }
  .fl span i { font-style:normal; color:var(--mute); }
  .ab { margin:.2rem 0 0 3.8rem; font-size:.8rem; color:var(--mute); white-space:pre-wrap; }
  .body { margin:.4rem 0 0 3.8rem; font-size:.95rem; }
  .body .h { font-weight:600; margin-top:.4rem; }
  .body .tip, .body .warn { border-left:3px solid var(--line); padding-left:.5rem; }
  .body .warn { border-color:var(--bad); }
  .body .table, .body .q { color:var(--mute); }
  .body .ex, .body .li { padding-left:1rem; }
  .loc { margin:.35rem 0 0 3.8rem; font:12px ui-monospace, monospace; color:var(--mute); display:flex; flex-wrap:wrap; gap:.5rem; align-items:center; }
  .loc button { font:12px system-ui, sans-serif; border:1px solid var(--line); background:#fff; border-radius:5px; padding:.1rem .5rem; cursor:pointer; }
  .loc button.on-ok { background:var(--ok); color:#fff; border-color:var(--ok); }
  .loc button.on-bad { background:var(--bad); color:#fff; border-color:var(--bad); }
  .loc textarea { flex:1 1 100%; font:14px system-ui, sans-serif; min-height:2.2rem; border:1px solid var(--line); border-radius:5px; padding:.3rem; }
  .note { margin:.45rem 0 0 3.8rem; background:var(--flag); border:1px solid var(--flagline); border-radius:6px; padding:.35rem .6rem; font-size:.92rem; }
  .note .nt { font-weight:600; }
  .note .fr { color:var(--mute); font-size:.8rem; }
  .note p { margin:.2rem 0; }
  #outside .note { margin-left:0; }
  #outside summary { cursor:pointer; margin-top:2rem; }
  .hide { display:none !important; }
</style>
</head>
<body>
<header>
  <h1>Fallaskóli — yfirlestur efnis</h1>
  <label>Efni <select id="kind"><option value="">Allt</option></select></label>
  <label>Þyngd <select id="lvl"><option value="">Öll</option></select></label>
  <label><input type="checkbox" id="flag"> Aðeins það sem þarf að athuga</label>
  <label>Merkt <select id="mark"><option value="">Allt</option><option value="none">Ómerkt</option><option value="ok">Í lagi</option><option value="bad">Athuga</option></select></label>
  <input type="search" id="q" placeholder="Leita í texta …">
  <button id="dl" type="button">Sækja athugasemdir</button>
  <span id="count"></span>
</header>
<main>
  <p class="intro">Hér er allt handskrifaða efnið í Fallaskóla á einni síðu: <b>${items.length}</b> atriði,
  þar af <b>${flagged}</b> merkt <b>þarf að athuga</b> (gul rönd) vegna athugasemda höfundanna.
  Hvert atriði sýnir hvar það stendur (skrá og línu). Smelltu á <b>Í lagi</b> eða <b>Athuga</b> og skrifaðu
  athugasemd ef þarf; merkingarnar geymast í þessum vafra og <b>Sækja athugasemdir</b> býr til textaskrá
  til að senda til baka. Síðan var búin til ${esc(stamp)} úr <code>content/</code> og
  <code>src/js/content/</code> (<code>node tools/review.mjs</code>).</p>
  <div id="list"></div>
  <div id="outside"></div>
</main>
<script id="data" type="application/json">${json}</script>
<script>
(function () {
  "use strict";
  var D = JSON.parse(document.getElementById("data").textContent);
  var KEY = "fallaskoli-yfirlestur";
  var marks = {};
  try { marks = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { marks = {}; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(marks)); } catch (e) {} }

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  /* *italic* and **bold**, as the app shows them; a lone star (*læknirar,
     a form that does not exist) stays a star. */
  function md(s) {
    return esc(s).replace(/\\*\\*([^*]+)\\*\\*/g, "<b>$1</b>").replace(/(^|[\\s(„"])\\*([^*\\s][^*]*?)\\*(?=[\\s.,;:!?)“"]|$)/g, "$1<i>$2</i>");
  }
  /* An item's key for its mark: the file and the text, not the line, so a
     mark survives an edit elsewhere in the file. */
  function keyOf(it) { return it.f + "|" + it.t; }

  var kindName = {};
  D.kinds.forEach(function (k) { kindName[k[0]] = k[1]; });
  var kindSel = document.getElementById("kind");
  D.kinds.forEach(function (k) {
    var n = D.items.filter(function (it) { return it.k === k[0]; }).length;
    if (!n) return;
    var o = document.createElement("option"); o.value = k[0]; o.textContent = k[1] + " (" + n + ")"; kindSel.appendChild(o);
  });
  var lvlSel = document.getElementById("lvl");
  var lvls = {};
  D.items.forEach(function (it) { if (it.ln === "þyngd" && it.lv) lvls[it.lv] = 1; });
  Object.keys(lvls).sort().forEach(function (l) {
    var o = document.createElement("option"); o.value = l; o.textContent = l; lvlSel.appendChild(o);
  });

  function noteHtml(n) {
    return '<div class="note"><div class="nt">' + esc(n.t) + '</div>'
      + (n.fr ? '<div class="fr">' + esc(n.fr) + '</div>' : '')
      + n.b.split(/\\n\\s*\\n/).map(function (p) { return "<p>" + md(p) + "</p>"; }).join("") + '</div>';
  }

  var out = document.getElementById("outside");
  var off = D.notes.filter(function (n) { return n.o; });
  if (off.length) {
    out.innerHTML = '<details><summary><h2 class="list" style="display:inline">Utan síðunnar: '
      + off.length + ' athugasemdir <small>content/REVIEW-NOTES.md</small></h2></summary>'
      + '<p class="intro">Athugasemdir um texta sem er ekki á þessari síðu (viðmót, tilkynningar).</p>'
      + off.map(noteHtml).join("") + '</details>';
  }

  var list = document.getElementById("list");
  var cards = [], heads = [], lastList = null, html = [];
  D.items.forEach(function (it) {
    if (it.li + it.f !== lastList) {
      lastList = it.li + it.f;
      html.push('<h2 class="list" data-head="' + esc(it.f) + '">' + esc(it.li)
        + '<small>' + esc(it.f) + '</small></h2>');
    }
    var h = '<div class="card' + (it.no.length ? " flag" : "") + '" data-id="' + it.id + '">'
      + '<div class="top"><span class="lv">' + (it.lv ? esc(it.ln === "bónus" ? "bónus " + it.lv : "þyngd " + it.lv) : "") + '</span>'
      + '<span class="t">' + (it.k === "villuveidar" ? esc(it.t).replace(/\\[([^\\]]+)\\]/g, "<b>[$1]</b>") : md(it.t)) + '</span></div>';
    if (it.a) h += '<div class="ans">' + esc(it.al) + ': <b>' + esc(it.a) + '</b></div>';
    if (it.x) h += '<div class="x">' + md(it.x) + '</div>';
    if (it.fl.length) h += '<div class="fl">' + it.fl.map(function (f) {
      return '<span><i>' + esc(f[0]) + ':</i> ' + esc(f[1]) + '</span>'; }).join("") + '</div>';
    if (it.b) h += '<div class="body">' + it.b.map(function (b) {
      return '<div class="' + b[0] + '">' + (b[0] === "li" || b[0] === "ex" ? "• " : b[0] === "tip" ? "Ábending: "
        : b[0] === "warn" ? "Varúð: " : b[0] === "q" ? "Spurning: " : "") + md(b[1]) + '</div>'; }).join("") + '</div>';
    if (it.ab.length) h += '<div class="ab">' + esc(it.ab.join("\\n")) + '</div>';
    it.no.forEach(function (k) { h += noteHtml(D.notes[k]); });
    h += '<div class="loc"><span>' + esc(it.f) + ':' + it.n + '</span>'
      + '<button type="button" data-m="ok">Í lagi</button><button type="button" data-m="bad">Athuga</button>'
      + '<textarea class="hide" placeholder="Athugasemd …"></textarea></div></div>';
    html.push(h);
  });
  list.innerHTML = html.join("");
  cards = Array.prototype.slice.call(list.querySelectorAll(".card"));
  heads = Array.prototype.slice.call(list.querySelectorAll("h2.list"));

  function paint(card) {
    var it = D.items[+card.dataset.id], m = marks[keyOf(it)] || {};
    card.classList.toggle("m-ok", m.m === "ok");
    card.classList.toggle("m-bad", m.m === "bad");
    card.querySelector('[data-m="ok"]').className = m.m === "ok" ? "on-ok" : "";
    card.querySelector('[data-m="bad"]').className = m.m === "bad" ? "on-bad" : "";
    var ta = card.querySelector("textarea");
    ta.classList.toggle("hide", !(m.m || m.c));
    if (document.activeElement !== ta) ta.value = m.c || "";
  }
  cards.forEach(paint);

  list.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-m]"); if (!b) return;
    var card = b.closest(".card"), it = D.items[+card.dataset.id], k = keyOf(it);
    var m = marks[k] || {};
    m.m = m.m === b.dataset.m ? "" : b.dataset.m;
    m.f = it.f; m.n = it.n; m.t = it.t;
    if (!m.m && !m.c) delete marks[k]; else marks[k] = m;
    save(); paint(card); filter();
    if (m.m === "bad") card.querySelector("textarea").focus();
  });
  list.addEventListener("input", function (e) {
    if (e.target.tagName !== "TEXTAREA") return;
    var card = e.target.closest(".card"), it = D.items[+card.dataset.id], k = keyOf(it);
    var m = marks[k] || { m: "" };
    m.c = e.target.value; m.f = it.f; m.n = it.n; m.t = it.t;
    marks[k] = m; save();
  });

  var q = document.getElementById("q"), flag = document.getElementById("flag"), mark = document.getElementById("mark");
  var count = document.getElementById("count");
  function hay(it) {
    return [it.t, it.a, it.x, it.f].concat(it.fl.map(function (f) { return f[1]; }))
      .concat(it.b ? it.b.map(function (b) { return b[1]; }) : []).join(" ").toLowerCase();
  }
  var HAY = D.items.map(hay);
  function filter() {
    var k = kindSel.value, l = lvlSel.value, f = flag.checked, s = q.value.trim().toLowerCase(), mk = mark.value;
    var shown = 0, seen = {};
    cards.forEach(function (card) {
      var it = D.items[+card.dataset.id], m = (marks[keyOf(it)] || {}).m || "";
      var ok = (!k || it.k === k) && (!l || (it.ln === "þyngd" && it.lv === l)) && (!f || it.no.length)
        && (!s || HAY[it.id].indexOf(s) >= 0)
        && (!mk || (mk === "none" ? !m : m === mk));
      card.classList.toggle("hide", !ok);
      if (ok) { shown++; seen[it.f] = 1; }
    });
    heads.forEach(function (h) { h.classList.toggle("hide", !seen[h.dataset.head]); });
    var nOk = 0, nBad = 0;
    Object.keys(marks).forEach(function (x) { if (marks[x].m === "ok") nOk++; if (marks[x].m === "bad") nBad++; });
    count.textContent = shown + " af " + D.items.length + " sýnd · " + nOk + " í lagi · " + nBad + " athuga";
  }
  [kindSel, lvlSel, flag, mark].forEach(function (el) { el.addEventListener("change", filter); });
  q.addEventListener("input", filter);
  filter();

  document.getElementById("dl").addEventListener("click", function () {
    var rows = Object.keys(marks).map(function (k) { return marks[k]; }).filter(function (m) { return m.m || m.c; });
    rows.sort(function (a, b) { return a.f < b.f ? -1 : a.f > b.f ? 1 : a.n - b.n; });
    var bad = rows.filter(function (m) { return m.m !== "ok"; });
    var txt = "Fallaskóli — yfirlestur efnis\\n"
      + rows.filter(function (m) { return m.m === "ok"; }).length + " atriði í lagi, " + bad.length + " til að athuga.\\n\\n"
      + bad.map(function (m) {
        return m.f + ":" + m.n + "\\n  " + m.t + "\\n  " + (m.m === "bad" ? "ATHUGA" : "athugasemd")
          + (m.c ? ": " + m.c.replace(/\\n/g, "\\n    ") : "") + "\\n";
      }).join("\\n");
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([txt], { type: "text/plain;charset=utf-8" }));
    a.download = "fallaskoli-yfirlestur.txt";
    document.body.appendChild(a); a.click(); a.remove();
  });
})();
</script>
</body>
</html>
`;
}

/* ---------- CLI --------------------------------------------------------- */

export async function build(out = p("dist", "review.html")) {
  const col = await collect();
  const notes = attachNotes(col.items, parseNotes(await readFile(p("content", "REVIEW-NOTES.md"), "utf8")));
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, renderHtml(col, notes), "utf8");
  return { out, col, notes };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const { out, col, notes } = await build(process.argv[2] ? path.resolve(process.argv[2]) : undefined);
  const flagged = col.items.filter((it) => it.notes.length).length;
  console.log(`${path.relative(process.cwd(), out)}: ${col.items.length} items from ${col.lists.length} lists, `
    + `${flagged} with a note`);
  const lost = notes.filter((n) => !n.outside && !n.items.length);
  const misses = notes.flatMap((n) => Object.entries(n.hits).filter(([, c]) => !c).map(([f]) => `${n.title}: ${f}`));
  if (lost.length || misses.length) {
    console.error("REVIEW-NOTES.md: notes or phrases that find no item:\n  " + [...lost.map((n) => n.title), ...misses].join("\n  "));
    process.exitCode = 1;
  }
}
