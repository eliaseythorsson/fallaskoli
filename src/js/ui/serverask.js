/* The screen's part of a server-graded question (issue #48).
 *
 * A renderer collects the answer and calls `judge` as for any question. For a
 * server-graded task that says `pending: "server"`, and `conclude`
 * (ui/render.js) hands it here instead of settling it:
 *
 *   1. "Les svarið yfir …" — the box and the button are locked while the
 *      server reads (control/serverask.js: one automatic retry, the browser's
 *      patience on each try). A second click does nothing.
 *   2. The first reading, with something left to do: the checklist and the
 *      ONE follow-up question. The box opens again; the pupil revises once
 *      and sends it the same way — or keeps the answer as it is.
 *   3. The final judgement goes back to `conclude` (`done`), which settles it
 *      once and calls `app.finish`. The verdict is drawn here, the same for
 *      every server-graded question: the checklist, the XP for finishing and
 *      revising, or "not judged" — after which server-graded questions are
 *      left out for the rest of the visit (core/servergrader.js).
 *
 * The question the pupil has moved away from (skipped, the session ended)
 * while the server was reading is dropped when the reading arrives: nothing is
 * settled for it, as for any question left unanswered. */

import { serverQuestion, noReader } from "../control/serverask.js";
import { serverGraderLost } from "../core/servergrader.js";
import { $, fmt, esc } from "./dom.js";
import { linksText, LINK_WORD_LEN, LINK_HOW_LEN } from "../tasks/wordcard.js";
import { storyIconHTML } from "./storyicons.js";

const asks = new WeakMap();

const SAME_AGAIN = "Þetta er sama svarið og áðan. Breyttu því — eða smelltu á <b>Halda svarinu</b>.";

/** The inputs of the question card, and its button. */
function lock(on) {
  document.querySelectorAll("#task textarea, #task input, #check, #keepanswer")
    .forEach((el) => { el.disabled = on; });
}

/**
 * The boxes of "three related words" (#38): a row per word, the word and
 * how it connects. Used on the Orðakort and in practice.
 * @param {string} lemma @param {number} n
 */
export function linksFormHTML(lemma, n) {
  return `<ol class="linkrows">${Array.from({ length: n }, (_, k) => `<li class="linkrow">
    <input type="text" class="linkword" maxlength="${LINK_WORD_LEN}" autocomplete="off" spellcheck="false"
      aria-label="Orð ${k + 1}" placeholder="Orð ${k + 1}">
    <input type="text" class="linkhow" maxlength="${LINK_HOW_LEN}" autocomplete="off"
      aria-label="Hvernig tengist orð ${k + 1} orðinu ${esc(lemma)}?" placeholder="Hvernig tengist það orðinu ${esc(lemma)}?">
  </li>`).join("")}</ol>`;
}

/** What the rows hold, as the one text the server reads, or null until
    every word is there (tasks/wordcard.js `linksText`). @param {ParentNode} root */
export function linksFrom(root) {
  const rows = [...root.querySelectorAll(".linkrow")].map((li) => ({
    word: /** @type {HTMLInputElement} */ (li.querySelector(".linkword")).value,
    how: /** @type {HTMLInputElement} */ (li.querySelector(".linkhow")).value,
  }));
  return { rows, text: linksText(rows) };
}

/** The checklist: a point whose id is a part of the story map (Frásögn,
    issue #40) has its icon, so the parts a story has are the icons ticked. */
export function checklistHTML(list) {
  if (!list || !list.length) return "";
  return `<ul class="checklist" style="list-style:none;padding-left:0">${list.map((p) => `<li class="${p.met ? "met" : "open"}">
    <span aria-hidden="true">${p.met ? "✓" : "○"}</span>
    <span class="sr-only">${p.met ? "Komið:" : "Vantar:"}</span> ${storyIconHTML(p.id) && storyIconHTML(p.id) + " "}${fmt(p.label || "")}</li>`).join("")}</ul>`;
}

/** The verdict of a settled server-graded question. */
export function serverVerdictHTML(j) {
  const d = j.detail || {};
  const xp = j.xp ? `<span class="xpop">+${j.xp} XP</span>` : "";
  const why = d.xpRevise ? "XP fyrir að ljúka spurningunni og fyrir að bæta svarið." : "XP fyrir að ljúka spurningunni.";
  if (j.verdict === "notjudged") {
    return `<div class="verdict neutral">${xp}
      <h3>Ekki tókst að lesa svarið yfir</h3>
      <p>Það er ekki þér að kenna. ${why} Svarið telst hvorki rétt né rangt.</p>
      <p class="streakline">Enter fyrir næstu.</p></div>`;
  }
  return `<div class="verdict ${j.ok ? "ok" : "no"}">${xp}
    <h3>${j.ok ? "Aðalatriðið er komið" : "Aðalatriðið vantar enn"}</h3>
    ${checklistHTML(d.checklist)}
    <p class="streakline">${why} Enter fyrir næstu.</p></div>`;
}

function reviseHTML(j) {
  const d = j.detail || {};
  return `<div class="verdict neutral revise">
    <h3>Svarið var lesið yfir</h3>
    ${checklistHTML(d.checklist)}
    ${d.ask ? `<p class="ask"><b>${fmt(d.ask)}</b></p>` : ""}
    <p id="servernote">Þú mátt bæta svarið einu sinni: breyttu því og sendu aftur — eða haltu því eins og það er.</p></div>`;
}

/**
 * A server-graded answer that `judge` sent to the server. `done(j)` settles
 * the final judgement (ui/render.js `conclude`) and is called once.
 */
export async function awaitServer(app, task, j, done) {
  let q = asks.get(task);
  if (!q) {
    q = serverQuestion(task, { read: app.serverRead || noReader, pupil: app });
    asks.set(task, q);
  }
  if (q.phase === "reading" || q.phase === "done") return;
  const note = $("servernote");
  const waiting = `<span class="reading">Les svarið yfir …</span>`;
  if (note) note.innerHTML = waiting;
  else $("verdict").innerHTML = `<div class="verdict neutral"><p>${waiting}</p></div>`;
  lock(true);
  const r = await q.send(j.given);
  if (app.cur !== task || !r) return;
  lock(false);
  show(app, task, q, r, done);
}

function show(app, task, q, r, done) {
  if (r.pending === "revise") {
    $("verdict").innerHTML = reviseHTML(r);
    /* Beside the button, as "Sýna svarið" of a second try (ui/render.js). */
    const go = $("check");
    if (go && !$("keepanswer")) go.insertAdjacentHTML("afterend",
      `<button type="button" class="ghost" id="keepanswer">Halda svarinu</button>`);
    $("keepanswer").onclick = () => { const k = q.keep(); if (k) show(app, task, q, k, done); };
    const box = document.querySelector("#task textarea, #task input[type=text]");
    if (box) { box.setAttribute("aria-describedby", "servernote"); box.focus(); }
    return;
  }
  if (r.pending) {
    const msg = r.verdict === "same" ? SAME_AGAIN : "Skrifaðu svarið í reitinn.";
    const note = $("servernote");
    if (note) note.innerHTML = msg;
    else $("verdict").innerHTML = `<div class="verdict neutral"><p>${msg}</p></div>`;
    return;
  }
  lock(true);
  const keep = $("keepanswer");
  if (keep) keep.remove();
  if (r.verdict === "notjudged") serverGraderLost();
  done(r);
}

