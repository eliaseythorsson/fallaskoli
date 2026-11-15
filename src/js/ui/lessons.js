/* The Lesefni tab (v6.7): an index of the pages by skill on the left, one
   page on the right. Pages are reached from the tab, from the 📖 link on a
   question, from the line under a wrong answer and from the glossary window.
   The rules — which page belongs to which question, how a table is filled —
   live in core/lessons.js; this file only draws. */

import { LESSONS, lessonById, lessonFor, buildTable, markRead, readCount } from "../core/lessons.js";
import { SKILLS, skillName } from "../core/skills.js";
import { $, esc, fmt, hideTip } from "./dom.js";

function tableHTML(t) {
  return `<figure class="lsntable">
    <table class="decl"><thead><tr><th></th>${t.cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>
    <tbody>${t.rows.map((r) => `<tr><th class="rowh">${esc(r.head)}</th>${r.cells
      .map((c) => `<td>${c ? esc(c) : "—"}</td>`).join("")}</tr>`).join("")}</tbody></table>
    ${t.cap ? `<figcaption>${fmt(t.cap, { gloss: false })}</figcaption>` : ""}
    <p class="lsnsrc">Myndirnar eru sóttar í BÍN.</p></figure>`;
}

function blockHTML(app, b) {
  if (b.h) return `<h3 class="lsnh">${esc(b.h)}</h3>`;
  if (b.p) return `<p>${fmt(b.p)}</p>`;
  if (b.list) return `<ul class="lsnlist">${b.list.map((x) => `<li>${fmt(x)}</li>`).join("")}</ul>`;
  if (b.ex) return `<div class="lsnex"><b class="lsnlabel">Dæmi</b><ul>${b.ex.map((x) => `<li>${fmt(x, { gloss: false })}</li>`).join("")}</ul></div>`;
  if (b.tip) return `<div class="lsntip"><b class="lsnlabel">Minnisregla</b>${fmt(b.tip)}</div>`;
  if (b.warn) return `<div class="lsnwarn"><b class="lsnlabel">Varastu</b>${fmt(b.warn)}</div>`;
  if (b.table) { const t = buildTable(app.lex, b); return t ? tableHTML(t) : ""; }
  return "";
}

function pageHTML(app, l) {
  const related = (l.related || []).map(lessonById).filter(Boolean);
  return `<article class="lsnpage" aria-labelledby="lsn-title">
    <p class="eyebrow"><span>Lesefni</span><b>${esc(skillName(l.skill))}</b></p>
    <h2 id="lsn-title" class="lsntitle">${esc(l.nm)}</h2>
    ${l.lead ? `<p class="lsnlead">${fmt(l.lead)}</p>` : ""}
    ${(l.blocks || []).map((b) => blockHTML(app, b)).join("")}
    ${(l.check || []).length ? `<section class="lsncheck"><h3 class="lsnh">Prófaðu þig</h3>
      ${l.check.map((c, i) => `<details><summary>${i + 1}. ${fmt(c.q, { gloss: false })}</summary>
        <p>${fmt(c.a, { gloss: false })}</p></details>`).join("")}</section>` : ""}
    ${related.length ? `<p class="lsnrel">Sjá líka: ${related.map((r) =>
      `<button type="button" class="lessonlink" data-lesson="${esc(r.id)}">${esc(r.nm)}</button>`).join(" ")}</p>` : ""}
    <p class="lsnstatus">Lestu síðuna til enda — þá telst hún lesin.</p>
    <div class="answer"><button type="button" class="ghost" data-backtopractice="1">Aftur að æfa</button></div>
    <div class="lsnend" aria-hidden="true"></div>
  </article>`;
}

function indexHTML(app, current) {
  const read = (app.S && app.S.read) || {};
  const groups = SKILLS.map((s) => {
    const pages = LESSONS.filter((l) => l.skill === s.id);
    if (!pages.length) return "";
    return `<div class="lsngroup"><h4>${s.ico} ${esc(s.nm)}</h4>${pages.map((l) =>
      `<button type="button" class="lsnitem${l.id === current ? " on" : ""}" data-lesson="${esc(l.id)}"
        aria-current="${l.id === current ? "page" : "false"}">${esc(l.nm)}${read[l.id] ? `<i aria-label="lesið">✓</i>` : ""}</button>`).join("")}</div>`;
  }).join("");
  return `<p class="sub">${readCount(app.S)} af ${LESSONS.length} síðum lesnar.</p>${groups}`;
}

/** Draw the tab. `id` chooses the page; without it, the last one or the first. */
export function renderLessons(app, id) {
  const l = lessonById(id) || lessonById(app.lessonOpen) || LESSONS[0];
  if (!l) { $("lsnindex").innerHTML = ""; $("lsnbody").innerHTML = ""; return; }
  app.lessonOpen = l.id;
  $("lsnindex").innerHTML = indexHTML(app, l.id);
  $("lsnbody").innerHTML = pageHTML(app, l);
  watchReading(app, l.id);
}

/* ---------- when does a page count as read? (v6.8) ---------------------
   Opening a page used to mark it read at once, so the three Lesefni badges
   came for clicking through the index. A page now counts when the reader has
   scrolled to its end and has had it open for at least MIN_DWELL. A page so
   short that its end is on screen from the start cannot be scrolled, and
   counts instead after it has been open for a time that grows with its length
   (about 250 words a minute, between 20 seconds and two minutes). Time only
   runs while the page is on screen and the browser tab is in front. */
const MIN_DWELL = 8000;
const TICK = 500;
let watcher = null;

function stopWatching() {
  if (!watcher) return;
  clearInterval(watcher.timer);
  if (watcher.io) watcher.io.disconnect();
  watcher = null;
}

function watchReading(app, id) {
  stopWatching();
  const body = $("lsnbody");
  const page = body && body.querySelector(".lsnpage");
  const status = body && body.querySelector(".lsnstatus");
  if (!page) return;
  if (app.S.read && app.S.read[id]) { if (status) status.innerHTML = readDoneHTML(); return; }

  const words = (page.textContent || "").trim().split(/\s+/).length;
  const shortMs = Math.min(120000, Math.max(20000, Math.round(words / 250 * 60000)));
  const end = page.querySelector(".lsnend");
  const w = watcher = { id, timer: null, io: null, open: 0, reachedEnd: false, scrollable: null };

  const onScreen = () => end && end.isConnected && end.offsetParent !== null &&
    (typeof document === "undefined" || document.visibilityState !== "hidden");
  const endInView = () => {
    if (!end) return true;
    const r = end.getBoundingClientRect();
    return r.top < (window.innerHeight || document.documentElement.clientHeight) && r.bottom >= 0;
  };

  if (typeof IntersectionObserver !== "undefined" && end) {
    w.io = new IntersectionObserver((ents) => {
      if (ents.some((e) => e.isIntersecting) && w.scrollable) w.reachedEnd = true;
    });
    w.io.observe(end);
  }

  const done = () => {
    stopWatching();
    if (!markRead(app.S, id)) return;
    const idx = $("lsnindex");
    if (idx) idx.innerHTML = indexHTML(app, app.lessonOpen);
    const st = document.querySelector("#lsnbody .lsnstatus");
    if (st) st.innerHTML = readDoneHTML();
    if (app.onRead) app.onRead(id);
  };

  w.timer = setInterval(() => {
    if (watcher !== w) return;
    if (!end || !end.isConnected) { stopWatching(); return; }
    if (!onScreen()) return;
    /* Decided on the first tick the page is actually on screen: can its end
       be scrolled to, or is it visible already? */
    if (w.scrollable === null) w.scrollable = !endInView();
    w.open += TICK;
    if (w.scrollable && !w.reachedEnd && endInView()) w.reachedEnd = true;
    if (w.scrollable ? (w.reachedEnd && w.open >= MIN_DWELL) : w.open >= shortMs) done();
  }, TICK);
}

const readDoneHTML = () => `<span class="lsndone">✓ Þú hefur lesið þessa síðu</span>`;

/** The 📖 link on a question, or "" if no page teaches it. */
export function lessonLinkHTML(task, forceId = null) {
  const id = (forceId && lessonById(forceId)) ? forceId : lessonFor(task);
  const l = id && lessonById(id);
  return l ? `<button type="button" class="lessonlink" data-lesson="${esc(l.id)}"
    title="Opna lesefnið um þetta">📖 ${esc(l.nm)}</button>` : "";
}

/** After a wrong answer: one line under the verdict, pointing at the page. */
export function suggestLesson(app) {
  const id = lessonFor(app.cur);
  const l = id && lessonById(id);
  const v = document.querySelector("#verdict .verdict");
  if (!l || !v || v.querySelector(".lessonhint")) return;
  const read = app.S.read && app.S.read[l.id];
  v.insertAdjacentHTML("beforeend", `<p class="lessonhint">📖 ${read ? "Rifjaðu upp" : "Lestu"}:
    <button type="button" class="lessonlink" data-lesson="${esc(l.id)}">${esc(l.nm)}</button></p>`);
}

/** One click handler for every `data-lesson` button in the document. */
export function wireLessons(app) {
  document.addEventListener("click", (e) => {
    const back = e.target.closest("[data-backtopractice]");
    if (back) { app.openView("practice"); return; }
    const b = e.target.closest("[data-lesson]");
    if (!b) return;
    e.preventDefault();
    hideTip();
    app.openView("lessons", b.dataset.lesson);
    $("view-lessons").scrollIntoView({ block: "start", behavior: "smooth" });
  });
}
