/* A live class round on the screen (critique item 64).

   Three screens, one round (server/live.mjs runs it; core/live.js holds the
   rules and decides what each screen is sent):

     the teacher's section   in Skólastofan, beside the assignments: pick the
                             material, the number of questions and the time,
                             and open the round on the projector.
     the projector           a full-screen layer on the teacher's device: the
                             lobby, each question as the pupils see it, the
                             result after each, and the end — the podium and
                             the class's commonest error with its rule.
     the pupil's device      a strip above the question ("Vera með"), then
                             each question in the ordinary practice card,
                             answered against the shared clock.

   Each screen listens to one event stream (`EventSource`) and redraws from
   the whole picture it is sent; a stream that drops reconnects by itself and
   is right again with its first message.

   THE PUPIL'S CARD. The question is drawn by the ordinary renderer and
   answered through the ordinary path (ui/render.js `conclude`), so the
   answer counts as practice in the pupil's own state, as a duel's does. The
   answer itself goes to the server (`liveAnswer`), which grades it. The
   verdict the renderer draws is hidden until the question closes on every
   screen at once — a pupil who has answered must not be able to show the
   answer to the one beside them while the clock is running. */

import { $, esc, fmt } from "./dom.js";
import { RENDER, renderTask } from "./render.js";
import { renderRunBar } from "./session.js";
import { LIVE } from "../core/live.js";

/* Icelandic agreement with a number: 1, 21, 31 … take the singular, 11 not. */
const one = (n) => n % 10 === 1 && n % 100 !== 11;
const pupils = (n) => `${n} ${one(n) ? "nemandi" : "nemendur"}`;
/* *stig* is the same in the singular and the plural. */
const pts = (n) => `${n} stig`;

/** Seconds left on a clock the server last put at `left` ms, `at` local ms. */
const secsLeft = (clock) => (clock ? Math.max(0, Math.ceil((clock.left - (Date.now() - clock.at)) / 1000)) : 0);

/* ======================================================================
   The teacher's section (drawn into #tc-live by ui/teacher.js)
   ====================================================================== */

/**
 * The form, or — when the group already has a round — the way back to it.
 * `optionsHTML` is the "Efni" list of the assignments (ui/teacher.js
 * `targetOptionsHTML`), the same material a teacher can set as homework.
 */
export async function drawLiveTeacher(app, group, optionsHTML) {
  const box = $("tc-live");
  if (!box || !app.server) return;
  let info;
  try { info = await app.server.teacherLive(group); }
  catch { box.innerHTML = ""; return; }
  const lim = info.limits || { sizes: LIVE.sizes, n: LIVE.n, secs: LIVE.secs, defSecs: LIVE.defSecs };
  const r = info.round && info.round.phase !== "done" ? info.round : null;
  box.innerHTML = `<h3 class="sec2">Lifandi umferð</h3>
    <p class="sub">Spurningar á skjávarpanum sem allur hópurinn svarar í einu, hver í sínu tæki. Allir fá
      sömu spurningar og jafnlangan tíma. Rétt svar gefur ${LIVE.point} stig og snöggt svar örfá stig í
      viðbót — aldrei svo mörg að það borgi sig að flýta sér og svara rangt. Eftir hverja spurningu sést hve
      margir svöruðu rétt, og í lokin algengasta villa hópsins og reglan um hana. Á skjánum sjást aðeins
      nöfn þeirra sem hafa valið að vera á stigatöflunni; hinir heita „Leikmaður 1“, „Leikmaður 2“ og
      svo framvegis.</p>
    ${r ? `<div class="assignform"><p><b>Umferð er í gangi:</b> ${esc(r.name)} · ${pupils(r.joined)} með.</p>
        <div class="answer"><button type="button" class="go" id="tc-live-open">Opna skjáinn</button>
        <button type="button" class="ghost" id="tc-live-end">Ljúka umferðinni</button></div></div>`
      : `<div class="assignform">
      <label class="lbl" for="tc-live-what">Efni</label>
      <select id="tc-live-what">${optionsHTML}</select>
      <div class="assignformrow">
        <label class="lbl" for="tc-live-n">Spurningar
          <select id="tc-live-n">${lim.sizes.map((n) => `<option value="${n}"${n === lim.n ? " selected" : ""}>${n}</option>`).join("")}</select></label>
        <label class="lbl" for="tc-live-secs">Tími á spurningu
          <select id="tc-live-secs">${lim.secs.map((s) => `<option value="${s}"${s === lim.defSecs ? " selected" : ""}>${s} sekúndur</option>`).join("")}</select></label>
      </div>
      <div class="answer"><button type="button" class="go" id="tc-live-start">Opna á skjávarpanum</button></div>
    </div>`}
    <div id="tc-live-msg"></div>`;

  const msg = (t) => { $("tc-live-msg").innerHTML = t ? `<div class="verdict bad"><p>${esc(t)}</p></div>` : ""; };
  if (r) {
    $("tc-live-open").onclick = () => openBoard(app, r.id, () => drawLiveTeacher(app, group, optionsHTML));
    $("tc-live-end").onclick = async () => {
      try { await app.server.liveEnd(r.id); } catch (e) { return msg(e.message); }
      drawLiveTeacher(app, group, optionsHTML);
    };
    return;
  }
  let replace = false;
  $("tc-live-start").onclick = async () => {
    const [kind, id] = String($("tc-live-what").value || "").split(":");
    const b = $("tc-live-start");
    b.disabled = true;
    try {
      const res = await app.server.startLive({ group, target: { kind, id }, replace,
        n: Number($("tc-live-n").value), secs: Number($("tc-live-secs").value) });
      msg("");
      openBoard(app, res.round.id, () => drawLiveTeacher(app, group, optionsHTML));
    } catch (e) {
      /* Another round is running in the group (a second tab, a colleague):
         the button asks before it ends it. No `confirm()` (ignored in a frame). */
      if (e.status === 409 && e.data && e.data.running) {
        replace = true;
        b.textContent = "Ljúka hinni og byrja þessa";
        msg("Hópurinn er þegar með umferð í gangi. Smelltu aftur til að ljúka henni og byrja nýja.");
      } else msg(e.message);
    }
    b.disabled = false;
  };
}

/* ======================================================================
   The projector
   ====================================================================== */

let board = null;          // { id, es, el, view, clock, tick, cardQ, onClose }

/** Open the projector layer for round `id`. */
export function openBoard(app, id, onClose = null) {
  closeBoard();
  const el = document.createElement("div");
  el.className = "liveboard blackboard";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-label", "Lifandi umferð");
  el.innerHTML = `<div class="lbbar">
      <button type="button" class="ghost" data-lb="full">Allur skjárinn</button>
      <button type="button" class="ghost" data-lb="close">Loka skjánum</button>
      <button type="button" class="ghost danger" data-lb="end">Ljúka umferðinni</button></div>
    <div class="lbmain" aria-live="polite"><p class="lbsub">Tengist…</p></div>`;
  document.body.appendChild(el);
  document.body.classList.add("liveon");
  board = { id, el, es: null, view: null, clock: null, tick: null, cardQ: -1, onClose, app };
  el.onclick = (e) => onBoardClick(app, e);
  const es = new EventSource(app.server.liveBoardUrl(id), { withCredentials: true });
  board.es = es;
  es.addEventListener("state", (e) => {
    if (!board || board.es !== es) return;
    try { drawBoard(app, JSON.parse(e.data)); } catch (err) { console.error(err); }
  });
  es.addEventListener("end", () => {
    if (!board || board.es !== es) return;
    es.close();
    $main().innerHTML = `<h1 class="lbtitle">Umferðinni er lokið</h1>`;
  });
  board.tick = setInterval(() => {
    const c = board && board.el.querySelector(".lbclock");
    if (c) c.textContent = String(secsLeft(board.clock));
  }, 250);
  return board;
}

export function closeBoard() {
  if (!board) return;
  const b = board;
  board = null;
  if (b.es) b.es.close();
  clearInterval(b.tick);
  b.el.remove();
  document.body.classList.remove("liveon");
  if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
  if (b.onClose) b.onClose();
}

const $main = () => board.el.querySelector(".lbmain");

async function onBoardClick(app, e) {
  const btn = e.target.closest("[data-lb]");
  if (!btn || !board) return;
  const id = board.id, act = btn.dataset.lb;
  if (act === "full") {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (board.el.requestFullscreen) board.el.requestFullscreen().catch(() => {});
    return;
  }
  if (act === "close") return closeBoard();
  btn.disabled = true;
  try {
    if (act === "next") await app.server.liveNext(id);
    else if (act === "shut") await app.server.liveClose(id);
    else if (act === "end") await app.server.liveEnd(id);
  } catch (err) {
    const m = board && board.el.querySelector(".lberr");
    if (m) m.textContent = err.message;
  }
  btn.disabled = false;
}

/**
 * The question as the pupils see it, read-only. Drawn by the very renderer
 * the pupils' devices use, into a holder put FIRST in the document while it
 * draws — the renderers find their elements by id, and the first element
 * with an id is the one found — then stripped of its ids and made inert.
 */
export function drawCard(app, task) {
  const slot = document.createElement("div");
  slot.id = "task";
  slot.className = "livecard";
  slot.inert = true;
  document.body.prepend(slot);
  const shim = Object.create(app);
  shim.cur = JSON.parse(JSON.stringify(task));
  try {
    const fn = RENDER[task.type];
    if (!fn) throw new Error("no renderer");
    fn(shim);
  } catch {
    slot.innerHTML = `<div class="card"><p>${fmt(task.question || task.title || "")}</p></div>`;
  } finally {
    slot.remove();
  }
  slot.removeAttribute("id");
  slot.querySelectorAll("[id]").forEach((x) => x.removeAttribute("id"));
  return slot;
}

function topHTML(rows) {
  if (!rows || !rows.length) return "";
  return `<ol class="lbtop">${rows.map((r) => `<li><span class="lbrank">${r.rank}.</span>
    <span class="lbname">${esc(r.name)}</span><span class="lbnums">${r.right} rétt · ${pts(r.points)}</span></li>`).join("")}</ol>`;
}

const WHY_ENDED = {
  lobby: "Umferðin hófst aldrei.",
  idle: "Umferðinni var lokið sjálfkrafa af því að ekkert hafði gerst í 20 mínútur.",
  max: "Umferðinni var lokið sjálfkrafa eftir tvær klukkustundir.",
};

/** The class's commonest error, with its rule — the end of every round. */
export function commonestHTML(c) {
  if (!c) return `<div class="lbrule"><p>Villugreiningin fann ekkert villumynstur í svörunum.</p></div>`;
  return `<div class="lbrule"><h2>Algengasta villan: ${esc(c.nm)}</h2>
    <p class="lbsub">${one(c.pupils) ? `Þessa villu gerði ${pupils(c.pupils)}` : `Þessa villu gerðu ${pupils(c.pupils)}`}.</p>
    <p>${fmt(c.rule)}</p></div>`;
}

function drawBoard(app, v) {
  board.view = v;
  board.clock = v.phase === "open" ? { left: v.left, at: Date.now() } : null;
  const main = $main();
  const head = `<p class="lbsub">${esc(v.name)}${v.phase === "lobby" || v.phase === "done" ? ""
    : ` · Spurning ${v.q + 1} af ${v.n}${v.topic ? ` · ${esc(v.topic)}` : ""}`}</p>`;
  const bar = board.el.querySelector(".lbbar [data-lb=end]");
  if (bar) bar.hidden = v.phase === "done";

  if (v.phase === "lobby") {
    board.cardQ = -1;
    main.innerHTML = `${head}<h1 class="lbtitle">Vertu með!</h1>
      <p class="lbbig">Opnaðu Fallaskóla og ýttu á <b>Vera með</b> efst í <b>Æfa</b>.</p>
      <p class="lbcount">${pupils(v.joined)} ${one(v.joined) ? "er" : "eru"} með</p>
      <p class="lbsub">${v.n} spurningar · ${v.secs} sekúndur á hverja</p>
      <div class="answer"><button type="button" class="go big" data-lb="next" ${v.joined ? "" : "disabled"}>Byrja ▶</button></div>
      <p class="lberr" role="alert"></p>`;
    return;
  }
  if (v.phase === "done") {
    board.cardQ = -1;
    const e = v.end || {};
    main.innerHTML = `${head}<h1 class="lbtitle">Úrslit</h1>
      ${WHY_ENDED[e.why] ? `<p class="lbsub">${WHY_ENDED[e.why]}</p>` : ""}
      ${e.asked ? `${topHTML(e.podium)}
        <p class="lbbig">Hópurinn svaraði ${e.share}% spurninganna rétt.</p>
        ${commonestHTML(e.commonest)}` : ""}
      <div class="answer"><button type="button" class="go" data-lb="close">Loka</button></div>`;
    return;
  }
  /* A question: open, or closed with its result. The card is drawn once per
     question and kept while the result is shown beneath it. */
  let card = main.querySelector(".livecard");
  if (board.cardQ !== v.q || !card) {
    main.innerHTML = `${head}<div class="lbq"></div><div class="lbfoot"></div>`;
    if (v.task) main.querySelector(".lbq").appendChild(drawCard(app, v.task));
    board.cardQ = v.q;
  } else {
    main.firstElementChild.outerHTML = head;
  }
  const foot = main.querySelector(".lbfoot");
  if (v.phase === "open") {
    foot.innerHTML = `<div class="lbclockrow"><span class="lbclock" aria-label="sekúndur eftir">${secsLeft(board.clock)}</span>
        <span class="lbcount">${v.answered} af ${v.joined} ${one(v.answered) ? "hefur" : "hafa"} svarað</span></div>
      <div class="answer"><button type="button" class="ghost" data-lb="shut">Loka spurningunni</button></div>
      <p class="lberr" role="alert"></p>`;
    return;
  }
  const r = v.result || {};
  const last = v.q + 1 >= v.n;
  foot.innerHTML = `<div class="lbresult">
      <p class="lbbig"><span class="lbok">Rétt: ${r.right}</span> · <span class="lbno">Rangt: ${r.wrong}</span>${r.none ? ` · Ekkert svar: ${r.none}` : ""}</p>
      ${r.answer ? `<p class="lbbig">Rétt svar: <b>${esc(r.answer)}</b></p>` : ""}
      ${r.why ? `<p class="lbwhy">${fmt(r.why)}</p>` : ""}
    </div>
    ${topHTML(v.top)}
    <div class="answer"><button type="button" class="go big" data-lb="next">${last ? "Sjá úrslitin ▶" : "Næsta spurning ▶"}</button></div>
    <p class="lberr" role="alert"></p>`;
}

/* ======================================================================
   The pupil's device
   ====================================================================== */

const isLearner = (app) => !!(app.server && app.profile && app.profile.role === "learner");

/** Is there a round in my group? Asked on load, when the tab comes back and
    every so often; a round I had joined (a reload) is joined again. */
export async function pollLive(app) {
  if (!isLearner(app) || app.liveRun) return;
  let r;
  try { r = (await app.server.live()).round; } catch { return; }
  if (app.liveRun) return;
  if (r && r.joined && r.phase !== "done") return joinLive(app, r.id);
  const was = app.liveOffer && app.liveOffer.id;
  app.liveOffer = r && r.phase !== "done" ? r : null;
  if ((app.liveOffer && app.liveOffer.id) !== was) renderLiveBar(app);
}

/** Join round `id` and listen to it. */
export async function joinLive(app, id) {
  if (app.liveRun && app.liveRun.id === id) return;
  let r;
  try { r = await app.server.joinLive(id); }
  catch (e) { app.liveOffer = null; app.liveNote = e.message; renderLiveBar(app); return; }
  app.liveOffer = null;
  app.liveNote = null;
  const run = { id, view: r.round, q: -1, answered: false, shownQ: -1, es: null, clock: null, tick: null, error: null };
  app.liveRun = run;
  app.drillOffer = null;
  app.openView("practice");
  /* A session the pupil was in waits under the round: its line goes, and
     comes back with its next question when the round is closed. */
  renderRunBar(app);
  onState(app, r.round);
  const es = new EventSource(app.server.liveEventsUrl(id), { withCredentials: true });
  run.es = es;
  es.addEventListener("state", (e) => {
    if (app.liveRun !== run) return;
    try { onState(app, JSON.parse(e.data)); } catch (err) { console.error(err); }
  });
  es.addEventListener("end", () => { if (app.liveRun === run) leaveLive(app, "Umferðinni er lokið."); });
  /* A stream the browser has given up on (the server was restarted and the
     round is gone): find out whether there is still a round to go back to. */
  es.onerror = () => {
    if (es.readyState !== 2 || app.liveRun !== run) return;
    setTimeout(async () => {
      if (app.liveRun !== run) return;
      let now = null;
      try { now = (await app.server.live()).round; } catch { /* try again on the next look */ }
      if (now && now.id === id && now.phase !== "done") { app.liveRun = null; joinLive(app, id); }
      else leaveLive(app, "Umferðin er ekki lengur til.");
    }, 1500);
  };
  run.tick = setInterval(() => {
    const c = document.querySelector("#livebar .lbclock");
    if (c && app.liveRun === run) c.textContent = String(secsLeft(run.clock));
  }, 250);
}

/** Stop listening; back to practice. */
export function leaveLive(app, note = null) {
  const run = app.liveRun;
  if (!run) return;
  if (run.es) run.es.close();
  clearInterval(run.tick);
  app.liveRun = null;
  app.liveNote = note;
  const box = $("task");
  if (box) box.classList.remove("livewait", "livedone");
  if (app.cur && app.cur.live) app.cur = null;
  renderLiveBar(app);
  app.next();
}

/** What the server says now. */
function onState(app, v) {
  const run = app.liveRun;
  if (!run || !v) return;
  run.view = v;
  run.clock = v.phase === "open" ? { left: v.left, at: Date.now() } : null;
  if (v.phase === "open" && v.task && run.q !== v.q) showQuestion(app, v);
  else if (v.phase === "open" && run.q !== v.q) {
    /* Answered already, on this device before a reload or on another. */
    run.q = v.q; run.answered = true;
    coverCard(app);
  }
  if ((v.phase === "shown" || v.phase === "done") && v.result) revealCard(app, v);
  renderLiveBar(app);
}

function showQuestion(app, v) {
  const run = app.liveRun;
  run.q = v.q;
  run.answered = false;
  run.error = null;
  app.openView("practice");
  const box = $("task");
  if (box) box.classList.remove("livewait", "livedone");
  /* `duel`: no second try and no worked example — the clock is running.
     `liveQ`: which question of the round this card is. */
  app.cur = { ...v.task, live: true, duel: true, liveQ: v.q };
  renderRunBar(app);
  renderTask(app);
  if (app.clock) app.clock.mark();
}

/** The pupil's answer, judged on this device and sent to the server, which
    grades it again — its verdict is the one that counts. Called by
    ui/render.js `conclude` before the verdict is drawn. */
export function liveAnswer(app, task, response) {
  const run = app.liveRun;
  if (!run || !task || !task.live || task.liveQ !== run.q || run.answered) return;
  run.answered = true;
  coverCard(app);
  const body = JSON.parse(JSON.stringify(response ?? null));
  app.server.liveAnswer(run.id, run.q, body).catch((e) => {
    if (app.liveRun !== run) return;
    run.error = e.message;
    renderLiveBar(app);
  });
  renderLiveBar(app);
}

/** Hide the card (and the verdict about to be drawn on it) until the
    question closes. */
function coverCard(app) {
  const box = $("task");
  if (!box) return;
  if (!box.querySelector(":scope > .livewaitmsg")) {
    box.insertAdjacentHTML("afterbegin", `<div class="livewaitmsg" role="status"><p><b>Svarið þitt er komið.</b></p>
      <p>Rétta svarið birtist þegar tíminn er búinn eða allir hafa svarað.</p></div>`);
  }
  box.classList.add("livewait");
}

/** The question has closed: show the verdict the renderer drew, or — if the
    clock ran out first — say so, with the answer where there is one. */
function revealCard(app, v) {
  const run = app.liveRun;
  const q = v.result.q;
  if (run.shownQ === q) return;
  run.shownQ = q;
  const box = $("task");
  if (!box) return;
  const cur = app.cur && app.cur.live && app.cur.liveQ === q;
  box.classList.remove("livewait");
  box.classList.add("livedone");
  if (cur && run.answered && box.querySelector("#verdict .verdict")) return;
  if (!cur && run.q !== q) return;
  const mine = v.result.mine;
  box.innerHTML = `<div class="card"><p class="eyebrow">Spurning ${q + 1} af ${v.n}</p>
    <div class="verdict ${mine && mine.ok ? "good" : "bad"}"><p><b>${mine ? (mine.ok ? "Rétt!" : "Ekki rétt.") : "Tíminn rann út."}</b>${
      v.result.answer ? ` Rétt svar: <b>${esc(v.result.answer)}</b>.` : ""}</p></div></div>`;
}

/** The strip above the question (#livebar). */
export function renderLiveBar(app) {
  const el = $("livebar");
  if (!el) return;
  const run = app.liveRun;
  if (!run) {
    const o = app.liveOffer;
    el.innerHTML = o ? `<div class="drillstrip live offer" role="status"><span class="drillico">📺</span>
        <div class="drilltext"><b>Lifandi umferð · ${esc(o.name)}</b>
          <span class="drillnums">${o.n} spurningar · ${o.secs} sekúndur á hverja${o.players ? ` · ${pupils(o.players)} ${one(o.players) ? "er" : "eru"} með` : ""}</span>
          <span class="drillneed">Kennarinn hefur opnað umferð fyrir hópinn þinn. Allir fá sömu spurningarnar á sama tíma.</span></div>
        <button type="button" class="go" id="livejoin">Vera með</button></div>`
      : app.liveNote ? `<div class="drillstrip live" role="status"><span class="drillico">📺</span>
        <div class="drilltext"><b>${esc(app.liveNote)}</b></div>
        <button type="button" class="ghost" id="liveclose">Loka</button></div>` : "";
    const j = $("livejoin");
    if (j) j.onclick = () => joinLive(app, o.id);
    const c = $("liveclose");
    if (c) c.onclick = () => { app.liveNote = null; renderLiveBar(app); };
    return;
  }
  const v = run.view || {};
  const me = v.me || {};
  const as = me.as ? (me.shown ? `Á skjánum heitir þú <b>${esc(me.as)}</b>.`
    : `Á skjánum heitir þú <b>${esc(me.as)}</b> — nafnið þitt sést aðeins ef þú ert á stigatöflunni.`) : "";
  const place = me.rank ? `Þú ert í ${me.rank}. sæti með ${me.right} rétt.` : "";
  let title = "", nums = "", need = "", btn = "";
  if (v.phase === "lobby") {
    title = `Lifandi umferð · ${esc(v.name)}`;
    nums = `${v.n} spurningar · ${v.secs} sekúndur á hverja`;
    need = `Þú ert með. Bíddu eftir að kennarinn byrji. ${as}`;
  } else if (v.phase === "open") {
    title = `Spurning ${v.q + 1} af ${v.n} · <span class="lbclock">${secsLeft(run.clock)}</span> sek.`;
    nums = run.answered ? "Svarið þitt er komið. Bíddu eftir hinum…" : "Svaraðu áður en tíminn rennur út.";
    need = run.error ? esc(run.error) : place;
  } else if (v.phase === "shown") {
    const m = v.result && v.result.mine;
    title = m ? (m.ok ? `Rétt! +${pts(m.points)}` : "Ekki rétt") : "Ekkert svar";
    nums = v.result ? `${v.result.right} af ${v.result.of} svöruðu rétt` : "";
    need = `${place} Næsta spurning kemur frá kennaranum.`;
  } else {
    const e = v.end || {};
    title = "Umferðinni er lokið";
    nums = me.rank ? `Þú varðst í ${me.rank}. sæti með ${me.right} rétt af ${e.asked || v.n}.` : "";
    need = e.asked ? commonestHTML(e.commonest) : (WHY_ENDED[e.why] || "");
    btn = `<button type="button" class="go" id="liveleave">Loka</button>`;
  }
  el.innerHTML = `<div class="drillstrip live active" role="status"><span class="drillico">📺</span>
    <div class="drilltext"><b>${title}</b>${nums ? `<span class="drillnums">${nums}</span>` : ""}
      ${need ? `<div class="drillneed">${need}</div>` : ""}</div>${btn}</div>`;
  const l = $("liveleave");
  if (l) l.onclick = () => leaveLive(app);
}
