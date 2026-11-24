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
import { $, fmt } from "./dom.js";

const asks = new WeakMap();

const SAME_AGAIN = "Þetta er sama svarið og áðan. Breyttu því — eða smelltu á <b>Halda svarinu</b>.";

/** The inputs of the question card, and its button. */
function lock(on) {
  document.querySelectorAll("#task textarea, #task input, #check, #keepanswer")
    .forEach((el) => { el.disabled = on; });
}

function checklistHTML(list) {
  if (!list || !list.length) return "";
  return `<ul class="checklist">${list.map((p) => `<li class="${p.met ? "met" : "open"}">
    <span aria-hidden="true">${p.met ? "✓" : "○"}</span>
    <span class="sr-only">${p.met ? "Komið:" : "Vantar:"}</span> ${fmt(p.label || "")}</li>`).join("")}</ul>`;
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
    <p id="servernote">Þú mátt bæta svarið einu sinni: breyttu því og sendu aftur — eða haltu því eins og það er.</p>
    <button type="button" class="ghost" id="keepanswer">Halda svarinu</button></div>`;
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

