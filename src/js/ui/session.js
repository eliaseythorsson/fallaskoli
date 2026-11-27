/* Practice sessions (v6.10): the Æfa tab's picker, the strip above a session
   in progress, and the summary at the end. Rules live in core/run.js and
   control/session.js (the run itself), core/diagnosis.js (what went wrong and why), core/today.js
   (today's session) and core/streak.js ("Þrjár í röð"); this file draws.

   A session is today's session (v6.13, item 21: the one big button), or one
   category (or all of them mixed, or the child's own error patterns) of 10,
   15 or 20 questions; and a summary: what went right, the one thing to
   remember, and what comes next. */

import { SKILLS, skillName, skillById } from "../core/skills.js";
import { skillLevel } from "../core/progress.js";
import { effectivePolicy } from "../core/state.js";
import { QUESTION_TYPES } from "../core/policy.js";
import { TASKS } from "../tasks/index.js";
import { lessonById } from "../core/lessons.js";
import { weakWords } from "../core/wordhealth.js";
import { activePatterns, patternById, focusTypes } from "../core/diagnosis.js";
import { $, esc, fmt, openSheet } from "./dom.js";
import { dueNow } from "./progress.js";
import { dueLine } from "../core/review.js";
import { todayLine } from "../core/today.js";
import { STREAK_N } from "../core/streak.js";
import { TOPIC } from "../core/run.js";
import { targetName, KIND_NAME, dueText, assignmentPolicy } from "../core/assignment.js";
import { writingOfferHTML, wireWritingOffer } from "./writing.js";

export const RUN_SIZES = [10, 15, 20];

/* Two topics that are not a skill. */
export const MIXED = { id: TOPIC.MIXED, nm: "Blandað", ico: "🎲", ds: "Allt sem er kveikt á, í bland" };
export const MINE = { id: TOPIC.MINE, nm: "Villurnar mínar", ico: "🎯",
  ds: "Spurningar sem prófa einmitt það sem hefur farið úrskeiðis hjá þér" };
/* v6.13 (item 21): today's session — not a card among the others but the
   button above them (core/today.js plans it). */
export const TODAY = { id: TOPIC.TODAY, nm: "Lota dagsins", ico: "☀️" };
/* v6.13 (item 65): a session that answers an assignment the teacher set. */
export const ASSIGNED = { id: TOPIC.ASSIGNED, nm: "Verkefni", ico: "📌" };

export function topicName(id) {
  if (id === MIXED.id) return MIXED.nm;
  if (id === MINE.id) return MINE.nm;
  if (id === TODAY.id) return TODAY.nm;
  if (id === ASSIGNED.id) return ASSIGNED.nm;
  return skillName(id);
}
const topicIco = (id) => (id === MIXED.id ? MIXED.ico : id === MINE.id ? MINE.ico
  : id === TODAY.id ? TODAY.ico : id === ASSIGNED.id ? ASSIGNED.ico : (skillById(id) || {}).ico || "");

const typeName = (id) => (QUESTION_TYPES.find((q) => q.id === id) || {}).nm || id;
const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);

/** Which skill each question type belongs to (the reverse analysis to all
    three of its skills). */
const typesOfSkill = (id) => TASKS.filter((t) => t.skill === id || (t.anyOf || []).includes(id)).map((t) => t.id);

/** The topics this child can pick: the switched-on skills, then the two
    others. A skill with no question type yet (Námsorð before its first,
    #19) is not a topic: its session would have nothing to ask. */
export function topics(app) {
  const P = effectivePolicy(app.S);
  const list = SKILLS.filter((s) => P.skill(s.id) && typesOfSkill(s.id).length).map((s) => ({ ...s, skill: true }));
  if (list.length > 1) list.push({ ...MIXED });
  if (activePatterns(app.S, 3, (p) => usable(app, [p.id])).length) list.push({ ...MINE });
  return list;
}

/** Can a session aimed at these patterns draw any question at all? */
export function usable(app, ids) {
  const P = effectivePolicy(app.S);
  const want = focusTypes(ids);
  return TASKS.some((t) => want.has(t.id) && P.type(t.id) &&
    (t.anyOf ? t.anyOf.some((x) => P.skill(x)) : P.skill(t.skill)));
}

/* ---------- assignments (item 65) ------------------------------------------

   The homework the group's teacher set, at the very top of Æfa: above today's
   session, because it is the one thing somebody else asked for. One tap
   starts it (control/session.js `startAssignment`). Only on a server; a pupil with no
   server has no teacher, and `app.assignments` is empty. */

/** Can this pupil be asked anything on the assignment's material? The
    teacher's choice overrides the pupil's own switches, never the ceiling
    the administrator or guardian set (core/assignment.js). */
export function assignmentUsable(app, a) {
  const P = assignmentPolicy(app.S, a.target);
  return TASKS.some((t) => P.type(t.id) && (t.anyOf ? t.anyOf.some((x) => P.skill(x)) : P.skill(t.skill)));
}

/** How the pupil stands with one assignment, in a short line. */
export function assignmentState(a) {
  const m = a.mine;
  if (!m) return "";
  if (m.done) return m.j ? `✓ Lokið: ${m.c} af ${m.j} rétt. Þú mátt gera það aftur til að bæta þig.`
    : "✓ Lokið. Þú mátt gera það aftur ef þú vilt.";
  return `Byrjað: ${m.i} af ${a.n} spurningum. Byrjaðu aftur til að klára.`;
}

/**
 * The cards, as HTML (pure, so tests/assignment.test.js can read it).
 * `usable(a)` says whether the material can be asked; `now` is the clock.
 */
export function assignmentsHTML(list, { usable = () => true, now = Date.now() } = {}) {
  const open = (list || []).filter((a) => a.open !== false);
  if (!open.length) return "";
  const row = (a) => {
    const ok = usable(a), done = !!(a.mine && a.mine.done);
    return `<div class="assignrow${done ? " done" : ""}">
      <div class="assignwhat">
        <b>${esc(targetName(a.target))}</b>
        <span class="faint">${esc(KIND_NAME[a.target.kind] || "")} · ${a.n} spurningar · skil ${esc(dueText(a.due, now))}</span>
        ${a.note ? `<span class="assignnote">${esc(a.note)}</span>` : ""}
        ${assignmentState(a) ? `<span class="assignstate">${esc(assignmentState(a))}</span>` : ""}
        ${ok ? "" : `<span class="assignstate warn">Ekki er hægt að spyrja um þetta efni með þeim stillingum sem umsjónarmaður hefur sett. Láttu kennarann vita.</span>`}
      </div>
      ${ok ? `<button type="button" class="${done ? "ghost" : "go"} assigngo" data-assign="${esc(a.id)}">${done ? "Gera aftur" : "Byrja →"}</button>` : ""}
    </div>`;
  };
  return `<div class="assignbox">
    <p class="eyebrow"><span>📌 ${open.length === 1 ? "Verkefni" : `Verkefni · ${open.length}`}</span><b>sett fyrir hópinn þinn</b></p>
    ${open.map(row).join("")}
  </div>`;
}

/* ---------- the picker ----------------------------------------------------- */

export function renderPicker(app) {
  /* Item 46: not over a text the pupil is writing (an assignment arriving
     redraws the picker). Only while the box is really on the board. */
  if (app.writing && document.getElementById("wr-text")) return;
  const list = topics(app);
  const el = $("task");
  if (!list.length) {
    el.innerHTML = `<div class="card"><p class="eyebrow"><span>Ekkert efni valið</span></p>
      <p class="sentence">Kveiktu á að minnsta kosti einu námsefni undir Stillingar.</p>
      <div class="answer"><button type="button" class="go" id="tosettings">Opna stillingar og námsefni</button></div></div>`;
    $("tosettings").onclick = () => app.openView("settings");
    return;
  }
  const set = app.S.settings || {};
  let topic = list.some((t) => t.id === set.runTopic) ? set.runTopic : list[0].id;
  let size = RUN_SIZES.includes(set.runSize) ? set.runSize : 10;
  const act = activePatterns(app.S, 3, (p) => usable(app, [p.id]));
  const flagFor = (s) => {
    if (!s.skill) return "";
    const types = new Set(typesOfSkill(s.id));
    const hit = act.filter((p) => p.types.some((x) => types.has(x)));
    return hit.length ? `<span class="topicflag" title="${esc(hit.map((p) => p.nm).join(", "))}">⚠ ${hit.length === 1 ? "1 villumynstur" : hit.length + " villumynstur"}</span>` : "";
  };
  const card = (s) => {
    const lvl = s.skill ? skillLevel(((app.S.skills[s.id]) || {}).xp || 0).level : null;
    const ds = s.id === MINE.id ? act.map((p) => p.nm).join(" · ") : s.ds;
    return `<button type="button" class="topic${s.id === MINE.id ? " mine" : ""}" data-topic="${esc(s.id)}" aria-pressed="${s.id === topic}">
      <span class="topicico" aria-hidden="true">${s.ico}</span>
      <span class="topicnm">${esc(s.nm)}${lvl ? ` <small>stig ${lvl}</small>` : ""}</span>
      <span class="topicds">${esc(ds)}</span>${flagFor(s)}</button>`;
  };
  const dueText = dueLine(dueNow(app.S));
  const recent = (app.S.runs || []).slice(-4).reverse();
  /* v6.13 (item 21): today's session first, as the one primary button; it
     says what it holds. The categories stay below it for a pupil who wants
     to choose, drawn as the second thing on the board. */
  const plan = app.todayPlan ? app.todayPlan() : null;
  const today = plan && plan.n ? `<div class="todaybox">
      <p class="eyebrow"><span>Æfing dagsins</span><b>${plan.n} spurningar valdar fyrir þig</b></p>
      <div class="answer"><button type="button" class="go todaygo" id="todaystart">${TODAY.ico} ${esc(TODAY.nm)} →</button></div>
      <p class="todayline">${esc(todayLine(plan))}</p>
    </div>` : "";
  const assigned = assignmentsHTML(app.assignments, { usable: (a) => assignmentUsable(app, a) });
  el.innerHTML = `<div class="card runpick">
    ${assigned}
    ${today}
    ${writingOfferHTML(app.S, undefined, { selfOnly: !app.server })}
    <div class="ownpick${today ? " second" : ""}">
    <p class="eyebrow">${today ? "<span>Eða veldu efni og fjölda spurninga</span>"
      : "<span>Ný æfingalota</span><b>veldu efni og fjölda spurninga</b>"}</p>
    <div class="topics" role="group" aria-label="Efni">${list.map(card).join("")}</div>
    <div class="runsize" role="group" aria-label="Fjöldi spurninga">
      <span>Spurningar:</span>${RUN_SIZES.map((n) =>
        `<button type="button" class="sizeb" data-size="${n}" aria-pressed="${n === size}">${n}</button>`).join("")}
    </div>
    <div class="answer"><button type="button" class="${today ? "ghost" : "go"}" id="runstart">Byrja lotu →</button></div>
    </div>
    ${dueText ? `<p class="runnote">📚 ${esc(dueText)}.</p>` : ""}
    ${act.length ? `<p class="runnote">🔎 Villumynstur sem fylgst er með: ${act.map((p) =>
      `<b>${esc(p.nm)}</b> <span class="faint">(${p.misses} af síðustu ${p.seen})</span>`).join(", ")}.
      Spurningar um þau koma oftar þangað til þau lagast.</p>` : ""}
    ${recent.length ? `<div class="runhist"><span class="faint">Síðustu lotur:</span> ${recent.map((r) =>
      `<span class="runchip">${topicIco(r.topic)} ${esc(topicName(r.topic))} · ${r.j ? `${r.c}/${r.j} rétt${r.j < r.n ? ` · ${r.n} spurn.` : ""}` : `${r.n} svör`}</span>`).join("")}</div>` : ""}
    ${app.runNotice ? `<p class="runnote warn">${esc(app.runNotice)}</p>` : ""}
  </div>`;
  app.runNotice = null;
  el.querySelectorAll(".topic").forEach((b) => {
    b.onclick = () => {
      topic = b.dataset.topic;
      el.querySelectorAll(".topic").forEach((x) => x.setAttribute("aria-pressed", x === b));
    };
    b.ondblclick = () => app.startRun(topic, size);
  });
  el.querySelectorAll(".sizeb").forEach((b) => {
    b.onclick = () => {
      size = +b.dataset.size;
      el.querySelectorAll(".sizeb").forEach((x) => x.setAttribute("aria-pressed", x === b));
    };
  });
  $("runstart").onclick = () => app.startRun(topic, size,
    topic === MINE.id ? act.map((p) => p.id) : null);
  const go = $("todaystart");
  if (go) go.onclick = () => app.startRun(TODAY.id, plan.n);
  el.querySelectorAll("[data-assign]").forEach((b) => {
    b.onclick = () => app.startAssignment(b.dataset.assign);
  });
  wireWritingOffer(app, () => renderPicker(app));        // item 46, ui/writing.js
  (el.querySelector(".assigngo.go") || go || $("runstart")).focus();
}

/* ---------- the line above a session --------------------------------------

   v6.13 (items 2, 47, 48): while a session runs, the question gets the
   screen. On a 390 px phone the title, the four stat tiles, the level bar,
   the tabs, the date and the old session strip took 590 px before the
   question began, and the answer box ended up under the letter pad. Now the
   whole of that is one slim line — topic, 3/10, a small × — and the rest is
   hidden by `body.insession` (src/head.html) until the summary, which shows
   the header again with the XP the session earned.

   The × is what Hætta was: the same confirmation, but no longer the largest
   control on the screen, sitting directly above the question. */

/** Is the session layout wanted right now? Only for a session proper (a drill
    or a duel draws its own strip) and only while the board is on the screen:
    a 📖 link in a question opens Lesefni mid-session, and there the tabs are
    the way back. */
export function sessionLayoutOn(app, practiceShown) {
  return !!(app && app.run && !app.drill && !app.duelRun && !app.liveRun && practiceShown);
}

/** Put `body.insession` in step with the app. Called by `renderRunBar` and by
    `openView` (app.js), the two moments it can change. */
export function syncSessionLayout(app) {
  if (typeof document === "undefined" || !document.body) return;
  const view = $("view-practice");
  document.body.classList.toggle("insession", sessionLayoutOn(app, !!view && !view.hidden));
}

/* The question last drawn under the line: a new one is scrolled to the top of
   the page, so the child never starts a question half-way down the screen
   (after the verdict and the Áfram button the page is often scrolled). */
let lastShown = null;

export function renderRunBar(app) {
  const el = $("runbar");
  if (!el) return;
  syncSessionLayout(app);
  const r = app.run;
  if (!r || app.drill || app.duelRun || app.liveRun) { el.innerHTML = ""; lastShown = null; return; }
  if (app.streak) { streakBar(app, el); return; }
  /* Dots for the sizes a child can pick (RUN_SIZES); a longer run (the
     browser test drives one of 100 000) gets the count alone. */
  const dots = [];
  for (let i = 0; i < (r.n <= 40 ? r.n : 0); i++) {
    const it = r.items[i];
    const cls = !it ? (i === r.i ? "now" : "due") : it.ok === true ? "ok" : it.ok === false ? "no" : "opt";
    dots.push(`<i class="${cls}"></i>`);
  }
  const shown = Math.min(r.n, r.i + (app.cur && app.cur.inRun && !app.cur.closed ? 1 : 0)) || 1;
  const name = r.assignment ? `${ASSIGNED.nm}: ${targetName(r.assignment.target)}`
    : r.label || `${topicName(r.topic)}${r.focus && r.focus.length === 1 ? `: ${patternById(r.focus[0]).nm}` : ""}`;
  const said = `${name}. Spurning ${shown} af ${r.n}${r.j ? `, ${r.c} rétt` : ""}.`;
  /* The dots say which were right; on a phone there is no room for twenty of
     them, so a thin bar along the bottom of the line says how far instead
     (head.html decides which of the two shows). */
  el.innerHTML = `<div class="runline" role="status" aria-label="${esc(said)}" title="${esc(said)}">
    <span class="sr-only">${esc(said)}</span>
    <span class="runico" aria-hidden="true">${topicIco(r.topic)}</span>
    <b class="runtopic" aria-hidden="true">${esc(name)}</b>
    <span class="drilldots rundots" aria-hidden="true">${dots.join("")}</span>
    <span class="runcount" aria-hidden="true"><b>${shown}</b>/${r.n}${r.j ? `<span class="runok"> · ${r.c} rétt</span>` : ""}</span>
    <button type="button" class="runx" id="runstop" aria-label="Hætta í lotunni" title="Hætta í lotunni">×</button>
    <i class="runprog" aria-hidden="true" style="width:${Math.round((100 * r.i) / r.n)}%"></i></div>`;
  $("runstop").onclick = () => app.quitRun();
  if (app.cur && app.cur !== lastShown) {
    lastShown = app.cur;
    if (typeof window !== "undefined" && window.scrollY > 0) window.scrollTo(0, 0);
  }
}

/* v6.13 (item 36): during "Þrjár í röð" the session's line steps aside for
   one of the three's own, so the session's count is never seen to grow or
   jump: "💪 Þrjár í röð: Þolfall og þágufall ruglast · 2/3", and the × goes
   back to the session. When the three are over the session's line returns
   at the question it was on. */
function streakBar(app, el) {
  const st = app.streak, r = app.run;
  const p = patternById(st.p) || { nm: "" };
  const open = app.cur && app.cur.streak && !app.cur.closed ? 1 : 0;
  const shown = st.intro ? 0 : Math.min(st.n, st.i + open);
  const dots = [];
  for (let i = 0; i < st.n; i++) {
    const m = st.marks[i];
    dots.push(`<i class="${m === 1 ? "ok" : m === 0 ? "no" : i === st.i && !st.intro ? "now" : "due"}"></i>`);
  }
  const name = `Þrjár í röð: ${p.nm}`;
  const said = `${name}. ${st.intro ? "Reglan" : `Spurning ${shown} af ${st.n}`}. ` +
    `Lotan bíður á meðan, á spurningu ${Math.min(r.n, r.i + 1)} af ${r.n}.`;
  el.innerHTML = `<div class="runline streakrun" role="status" aria-label="${esc(said)}" title="${esc(said)}">
    <span class="sr-only">${esc(said)}</span>
    <span class="runico" aria-hidden="true">💪</span>
    <b class="runtopic" aria-hidden="true">${esc(name)}</b>
    <span class="drilldots rundots" aria-hidden="true">${dots.join("")}</span>
    <span class="runcount" aria-hidden="true">${st.intro ? "regla" : `<b>${shown}</b>/${st.n}`}</span>
    <button type="button" class="runx" id="runstop" aria-label="Hætta og fara aftur í lotuna" title="Hætta og fara aftur í lotuna">×</button>
    <i class="runprog" aria-hidden="true" style="width:${Math.round((100 * st.i) / st.n)}%"></i></div>`;
  $("runstop").onclick = () => app.stopStreak();
  if (app.cur && app.cur !== lastShown) {
    lastShown = app.cur;
    if (typeof window !== "undefined" && window.scrollY > 0) window.scrollTo(0, 0);
  }
}

/**
 * Under the verdict of a diagnosed wrong answer (control/drill.js `offerStreak`): the
 * offer of three questions on the pattern just named. Áfram keeps the focus,
 * so Enter still simply goes on — the three are offered, never imposed.
 */
export function showStreakOffer(app, p) {
  const v = document.querySelector("#verdict .verdict");
  if (!v || v.querySelector(".streakoffer")) return;
  v.insertAdjacentHTML("beforeend", `<div class="streakoffer">
    <p><b>Viltu æfa þetta strax?</b> Þrjár stuttar spurningar um einmitt þetta.
      Þær teljast ekki með í lotunni og svo heldur hún áfram.</p>
    <button type="button" class="ghost" id="streakgo">💪 Þrjár í röð</button></div>`);
  $("streakgo").onclick = () => app.startStreak();
}

/**
 * Before the first of the three: the pattern's rule, and its Lesefni page
 * where it has one (critique item 36: "the rule shown before the first").
 */
export function renderStreakIntro(app) {
  const st = app.streak;
  const p = patternById(st.p);
  const page = p.lesson ? lessonById(p.lesson) : null;
  $("task").innerHTML = `<div class="card streakintro">
    <p class="eyebrow"><span>💪 Þrjár í röð</span><b>${esc(p.nm)}</b></p>
    <h4 class="rememberh">Reglan</h4>
    <p class="rule">${fmt(p.rule)}</p>
    ${page ? `<p><button type="button" class="ghost lessonlink" data-lesson="${esc(page.id)}">📖 Lesa meira: ${esc(page.nm)}</button></p>` : ""}
    <p class="faint">Nú koma þrjár spurningar um þetta. Þær teljast ekki með í lotunni — á eftir heldur hún áfram þar sem frá var horfið.</p>
    <div class="answer"><button type="button" class="go" id="streakbegin">Byrja →</button>
      <button type="button" class="ghost" id="streakskip">Sleppa og halda áfram með lotuna</button></div></div>`;
  $("streakbegin").onclick = () => app.beginStreak();
  $("streakskip").onclick = () => app.stopStreak();
  $("streakbegin").focus();
}

/** "Hætta?" — what is answered is kept and summed up. */
export function confirmQuit(app, onYes) {
  const r = app.run;
  const sheet = openSheet("Hætta í lotunni?", `
    <p>${r.i ? `Þú hefur svarað ${r.i} af ${r.n}. Þú færð samantekt á því sem búið er.`
      : "Engu hefur verið svarað enn, svo lotan fellur niður."}</p>
    <div class="answer"><button type="button" class="go" id="runquit-yes">Já, hætta</button>
      <button type="button" class="ghost" id="runquit-no">Halda áfram</button></div>`);
  sheet.el.querySelector("#runquit-no").onclick = () => sheet.close();
  sheet.el.querySelector("#runquit-yes").onclick = () => { sheet.close(); onYes(); };
}

/* ---------- the summary ----------------------------------------------------- */

/** The line under the score after an assignment: what happened to the
    result. `d.assignment.sent` is "ok", "retry", "refused" or null while the
    server has not answered yet. */
export function assignmentSummary(d) {
  const a = d.assignment, nm = targetName(a.target);
  const whole = d.i >= d.n && !d.early;
  if (a.sent === "refused") return `📌 ${nm}: skiladagurinn var liðinn, svo niðurstaðan var ekki skráð.`;
  if (a.sent === "retry") return `📌 ${nm}: ekki náðist samband til að skrá niðurstöðuna. Það verður reynt aftur sjálfkrafa.`;
  const head = a.sent === "ok" ? "Niðurstaðan er skráð" : "Niðurstaðan er á leiðinni";
  return whole ? `📌 Verkefninu „${nm}“ er lokið. ${head}.`
    : `📌 ${nm}: þú svaraðir ${d.i} af ${d.n} spurningum. ${head}, og þú getur klárað verkefnið seinna.`;
}

/* v6.11: no line at all when there is nothing to show — an example with an
   empty right answer printed a bare "Rétt:". */
const exLine = (ex) => !ex || !String(ex.right || "").trim() ? "" : String(ex.said || "").trim()
  ? `<li>Þú: <span class="forms">${esc(ex.said)}</span> → rétt: <span class="forms">${esc(ex.right)}</span></li>`
  : `<li>Rétt: <span class="forms">${esc(ex.right)}</span></li>`;

const trendHTML = (t) => (t === "betra" ? `<span class="trend up" title="á uppleið">▲ betra</span>`
  : t === "verra" ? `<span class="trend down" title="á niðurleið">▼ verra</span>`
  : t === "jafnt" ? `<span class="trend">● svipað</span>` : `<span class="trend faint">nýtt</span>`);

export function renderSummary(app) {
  const d = app.runDone;
  const el = $("task");
  const rep = d.report;
  const allRight = d.j > 0 && d.c === d.j;

  /* What went right */
  const good = [];
  if (allRight) good.push(`<li><b>Allt rétt</b> — ${d.j} af ${d.j}.</li>`);
  rep.mended.forEach((p) => good.push(`<li><b>${esc(p.nm)}</b>: engin villa í ${p.chances} spurningum — það hefur oft farið úrskeiðis áður. Vel gert!</li>`));
  rep.clean.slice(0, 3).forEach((p) => good.push(`<li>Allt rétt um <b>${esc(p.ok || p.nm)}</b> (${p.chances} spurningar).</li>`));
  if (!allRight) {
    const byType = {};
    d.items.forEach((it) => {
      if (it.ok === null) return;
      const k = (byType[it.type] ||= { c: 0, n: 0 }); k.n++; if (it.ok) k.c++;
    });
    Object.entries(byType).filter(([, v]) => v.c === v.n && v.n >= 2)
      .forEach(([id, v]) => good.push(`<li>${esc(typeName(id))}: ${v.c} af ${v.n} rétt.</li>`));
  }
  /* v6.13 (item 36): "Þrjár í röð" that went well. Not one that did not:
     the pupil chose to do extra work, and that is not a thing to list. */
  (d.streaks || []).filter((x) => x.n === STREAK_N && x.c >= x.n - 1).forEach((x) => {
    const p = patternById(x.p);
    if (p) good.push(`<li>Þrjár í röð um <b>${esc(p.ok || p.nm)}</b>: ${x.c === x.n ? "allar réttar" : `${x.c} af ${x.n} rétt`}.</li>`);
  });
  if (!good.length && d.c) good.push(`<li>${d.c} ${d.c === 1 ? "rétt svar" : "rétt svör"} — og hvert rangt svar segir okkur hvað á að æfa næst.</li>`);
  const ungraded = !d.j && d.i > 0;
  if (!good.length && ungraded) good.push(`<li>Þú svaraðir ${d.i} ${d.i === 1 ? "spurningu" : "spurningum"} með eigin orðum.</li>`);
  if (!good.length) good.push(`<li>Þú kláraðir lotuna. Það er fyrsta skrefið.</li>`);

  /* The one thing to remember. A session with nothing graded (Orðaforði) has
     no errors of its own, so an old pattern is not dragged in (v6.10). */
  const f = ungraded ? null : rep.focus;
  const remember = ungraded
    ? `<p>Í þessari lotu var ekkert metið rétt eða rangt. Berðu útskýringarnar þínar saman við orðabókina — það er æfingin.</p>`
    : !f
    ? `<p>Engin villumynstur fundust. Haltu áfram svona — og prófaðu þyngra efni næst.</p>`
    : `<h4 class="rememberh">${esc(f.nm)}</h4>
       ${f.fromBefore ? `<p class="faint">Engin villa í þessari lotu! En þetta er það sem hefur oftast farið úrskeiðis undanfarið:</p>` : ""}
       <p class="rule">${fmt(f.rule)}</p>
       ${f.ex && f.ex.some((x) => exLine(x)) ? `<ul class="exlist">${f.ex.map(exLine).join("")}</ul>` : ""}`;

  /* What comes next */
  const next = [];
  if (f && usable(app, [f.id])) next.push(`<button type="button" class="go" data-next="focus">🎯 Æfa: ${esc(f.nm)} · 10 spurningar</button>`);
  const page = f && f.lesson ? lessonById(f.lesson) : null;
  if (page) next.push(`<button type="button" class="ghost lessonlink" data-lesson="${esc(page.id)}">📖 Lesa: ${esc(page.nm)}</button>`);
  const weak = weakWords(app.S, app.lex).find((w) => w.drillable);
  if (weak) next.push(`<button type="button" class="ghost" data-next="drill" data-key="${esc(weak.key)}">🛟 Bjarga orðinu <em>${esc(weak.lemma)}</em></button>`);
  const again = d.assignment
    ? ((app.assignments || []).some((a) => a.id === d.assignment.id && a.open !== false)
      ? `<button type="button" class="${next.length ? "ghost" : "go"}" data-next="assign">↻ Gera verkefnið aftur</button>` : "")
    : `<button type="button" class="${next.length ? "ghost" : "go"}" data-next="again">↻ Önnur lota: ${esc(d.label || topicName(d.topic))} · ${d.n}</button>`;
  if (again) next.push(again);
  next.push(`<button type="button" class="ghost" data-next="pick">Velja annað efni</button>`);

  /* The diagnosis */
  const diag = rep.found.length ? `<table class="diagtable"><thead><tr><th>Villumynstur</th>
      <th>Í lotunni</th><th>Undanfarið</th></tr></thead><tbody>${rep.found.map((p) => `<tr>
      <td><b>${esc(p.nm)}</b>${p.ex.length ? `<span class="faint diagex">${p.ex.slice(0, 2).map((x) =>
        x.said ? `${esc(x.said)} → ${esc(x.right)}` : esc(x.right)).join(" · ")}</span>` : ""}</td>
      <td>${p.count} ${p.count === 1 ? "villa" : "villur"}${p.chances > p.count ? ` af ${p.chances}` : ""}</td>
      <td>${p.standing.misses} af síðustu ${p.standing.seen} ${trendHTML(p.standing.trend)}</td></tr>`).join("")}</tbody></table>`
    : `<p class="faint">Engar villur til að greina í þessari lotu.</p>`;

  const mins = Math.max(1, Math.round((d.ms || 0) / 60000));
  el.innerHTML = `<div class="card summary">
    <p class="eyebrow"><span>${d.early ? "Lotu hætt" : "Lotu lokið"} · ${topicIco(d.topic)} ${esc(d.label || topicName(d.topic))}</span><b>${mins} mín.</b></p>
    <div class="sumhead">
      <div class="sumscore"><b>${d.j ? `${d.c}<small>/${d.j}</small>` : d.i}</b><span>${d.j ? `rétt · ${pct(d.c, d.j)}%` : "svör"}</span></div>
      <div class="sumscore xp"><b>+${d.xp}</b><span>XP</span></div>
      <div class="sumscore"><b>${d.badges.length}</b><span>${d.badges.length === 1 ? "nýtt merki" : "ný merki"}</span></div>
    </div>
    ${d.assignment ? `<p class="assignsent">${esc(assignmentSummary(d))}</p>` : ""}
    <div class="sumdots" aria-hidden="true">${d.items.map((it) => `<i class="${it.ok === true ? "ok" : it.ok === false ? "no" : "opt"}"></i>`).join("")}</div>
    ${d.badges.length ? `<div class="sumbadges">${d.badges.map((b) => `<span class="runchip">${b.ico} ${esc(b.nm)}</span>`).join("")}</div>` : ""}
    ${(d.earlier || []).length ? `<p class="sumearlier">Unnið fyrr, utan lotunnar (t.d. í einvígi eða umferð): ${d.earlier.map((b) => `<span class="runchip">${b.ico} ${esc(b.nm)}</span>`).join(" ")}</p>` : ""}
    <section class="sumsec"><h3>✓ Það sem gekk vel</h3><ul>${good.join("")}</ul></section>
    <section class="sumsec remember"><h3>💡 Eitt atriði til að muna</h3>${remember}</section>
    <section class="sumsec"><h3>→ Hvað næst?</h3><div class="answer nextrow">${next.join("")}</div></section>
    <section class="sumsec"><h3>🔎 Villugreining</h3>${diag}
      <p class="faint small">Fylgst er með villumynstrum í öllum æfingum. Spurningar sem prófa
        þau koma oftar þangað til þau lagast. Yfirlitið er undir <b>Færnikort</b>.</p></section>
  </div>`;

  el.querySelectorAll("[data-next]").forEach((b) => {
    b.onclick = () => {
      const what = b.dataset.next;
      if (what === "focus") app.startRun(MINE.id, 10, [f.id]);
      else if (what === "again") app.startRun(d.topic, d.n, d.focus, d.again || {});
      else if (what === "assign") app.startAssignment(d.assignment.id);
      else if (what === "drill") { app.runDone = null; app.startDrill(b.dataset.key); }
      else { app.runDone = null; app.next(); }
    };
  });
  const first = el.querySelector(".nextrow button");
  if (first) first.focus();
}
