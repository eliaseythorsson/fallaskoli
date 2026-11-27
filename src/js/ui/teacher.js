/* The teacher's part of Skólastofan (v6.13, critique items 37 and 65).

   Shown only to somebody with `canTeach` — the guardian of a group (a
   teacher, or a parent for a family) and the administrator — and filled from
   the server, which holds a guardian to their own group (server/server.mjs
   `needTeacher`). Two things:

     Verkefni               set homework for the group: a category, an error
                            pattern, a node of the curriculum map or a whole
                            year; a size and a deadline. Then who has done it,
                            their scores, and the class's patterns on it.
     Villumynstur hópsins   pupils down the side, patterns across the top,
                            the miss rate in each cell, the class's worst
                            pattern first; and the same as a CSV file.

   The figures are the pupil's own (core/classview.js): a teacher never sees a
   number the pupil was not shown, and never anything a pupil typed. */

import { $, esc } from "./dom.js";
import { drawTeacherMap } from "./skillmap.js";
import { SKILLS } from "../core/skills.js";
import { skillHasTypes } from "../core/catalogue.js";
import { patternById, UNREAD } from "../core/diagnosis.js";
import { YEARS } from "../core/curriculum.js";
import { utcDay as dayOf } from "../core/calendar.js";
import { ASSIGN, ASSIGNABLE_PATTERNS, ASSIGNABLE_NODES, KIND_NAME, targetName, dueText }
  from "../core/assignment.js";
/* Item 64: the live class round has its own file; its section sits here. */
import { drawLiveTeacher } from "./live.js";
/* …and so has the team duel (item 67). */
import { drawTeamTeacher } from "./teamduel.js";
import { CLASS_GOAL, GOAL_OPTIONS, goalText, progressText } from "../core/classgoal.js";
import { renderClassGoal } from "./classgoal.js";
import { drawTeacherL2 } from "./secondlang.js";
import { drawTeacherWriting } from "./writing.js";

const verdict = (text, kind = "bad") =>
  (text ? `<div class="verdict ${kind}"><p>${esc(text)}</p></div>` : "");
const pct = (x) => Math.round(100 * (x || 0));
const TREND = { betra: "▲", verra: "▼", jafnt: "●" };
const TREND_WORD = { betra: "á uppleið", verra: "á niðurleið", jafnt: "svipað" };

/* ---------- the pattern table (pure) ------------------------------------- */

/** One cell: the pupil's "misses af seen", shaded by the rate, ⚠ if active. */
function cellHTML(pu, id) {
  const f = (pu.diag || {})[id];
  const p = patternById(id) || { nm: id };
  if (!f || !f.seen) return `<td class="cpcell none" title="${esc(`${pu.name}: ${p.nm} — ekki komið fyrir undanfarið`)}">–</td>`;
  const title = `${pu.name}: ${p.nm} — ${f.misses} rangt af síðustu ${f.seen} (${pct(f.rate)}%), `
    + `alls ${f.w} af ${f.n}${f.trend ? `, ${TREND_WORD[f.trend]}` : ""}${f.active ? ", algengt núna" : ""}`;
  /* The shade is the rate itself: 0 % white, 50 % and more the full tint. */
  const a = Math.min(1, f.rate * 2).toFixed(2);
  return `<td class="cpcell${f.active ? " active" : ""}" style="--r:${a}" title="${esc(title)}">`
    + `${f.active ? `<span class="cpflag" aria-label="algengt núna">⚠</span>` : ""}`
    + `${f.misses} af ${f.seen}${f.trend ? ` <span class="cptrend ${f.trend}">${TREND[f.trend]}</span>` : ""}</td>`;
}

/** The "Ógreint" cell: wrong answers the diagnosis could not read, of all
    wrong answers. Not an error of the pupil's; a count. */
function unreadHTML(pu) {
  const u = (pu.diag || {})[UNREAD];
  return u && u.n ? `<td class="cpcell unread" title="${esc(`${pu.name}: ${u.w} af ${u.n} röngum svörum ógreind`)}">${u.w} af ${u.n}</td>`
    : `<td class="cpcell none">–</td>`;
}

/**
 * The table, pupils down the side and `columns` (pattern ids, worst first)
 * across the top. `pupils` is what the server sent: [{ id, name, diag }].
 */
export function patternTableHTML(pupils, columns, { unread = true } = {}) {
  if (!(pupils || []).length) return `<p class="sub faint">Enginn nemandi er í hópnum enn.</p>`;
  if (!columns.length) {
    return `<p class="sub faint">${pupils.some((p) => Object.keys(p.diag || {}).length)
      ? "Engin villumynstur hafa fundist enn. Þau birtast hér um leið og eitthvað fer úrskeiðis hjá einhverjum."
      : "Enginn í hópnum hefur æft sig enn."}</p>`;
  }
  const head = columns.map((id) => {
    const p = patternById(id) || { nm: id };
    return `<th scope="col" class="cphead" title="${esc(p.nm)}">${esc(p.nm)}</th>`;
  }).join("");
  const rows = pupils.map((pu) => `<tr><th scope="row" class="cpname">${esc(pu.name)}</th>${
    Object.keys(pu.diag || {}).length
      ? columns.map((id) => cellHTML(pu, id)).join("") + (unread ? unreadHTML(pu) : "")
      : `<td class="cpcell none" colspan="${columns.length + (unread ? 1 : 0)}">hefur ekki svarað neinu sem er greint enn</td>`
  }</tr>`).join("");
  return `<div class="cpwrap"><table class="classpat">
    <thead><tr><th scope="col" class="cpname">Nemandi</th>${head}${unread
      ? `<th scope="col" class="cphead" title="Röng svör sem villugreiningin kunni ekki að flokka, af öllum röngum svörum">Ógreint</th>` : ""}</tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

/* ---------- one assignment's results (pure) ------------------------------ */

const resultText = (r, n) => !r ? `<span class="faint">ekki byrjað</span>`
  : r.done ? "lokið" : `byrjað: ${r.i} af ${n}`;
const scoreText = (r) => !r ? "" : r.j ? `${r.c} af ${r.j} (${pct(r.c / r.j)}%)` : `${r.i} svör`;

/** An assignment as the teacher sees it: what, when, who has done it, and
    the class's patterns on its material. `pupils` carries the figures. */
export function assignmentCardHTML(a, pupils, now = Date.now()) {
  const done = a.results.filter((x) => x.res && x.res.done).length;
  const sum = a.results.filter((x) => x.res && x.res.done && x.res.j);
  const avg = sum.length ? pct(sum.reduce((s, x) => s + x.res.c / x.res.j, 0) / sum.length) : null;
  return `<div class="assigncard${a.open ? "" : " closed"}" data-aid="${esc(a.id)}">
    <div class="assignhead">
      <div><b>${esc(targetName(a.target))}</b>
        <span class="faint">${esc(KIND_NAME[a.target.kind] || "")} · ${a.n} spurningar · skil ${esc(dueText(a.due, now))}${a.open ? "" : " (skiladagurinn er liðinn)"}</span>
        ${a.note ? `<span class="assignnote">${esc(a.note)}</span>` : ""}</div>
      <div class="assigncount"><b>${done} af ${a.results.length}</b> hafa lokið${avg != null ? ` · meðaltal ${avg}% rétt` : ""}</div>
      <button type="button" class="ghost small danger" data-adel="${esc(a.id)}">Eyða</button>
    </div>
    <details><summary>Niðurstöður og villumynstur</summary>
      ${a.results.length ? `<div class="cpwrap"><table class="admintable assignres">
        <tr><th>Nemandi</th><th>Staða</th><th>Rétt</th></tr>
        ${a.results.map((x) => `<tr><td>${esc(x.name)}</td><td>${resultText(x.res, a.n)}</td><td>${scoreText(x.res)}</td></tr>`).join("")}
      </table></div>` : `<p class="sub faint">Enginn nemandi er í hópnum.</p>`}
      <p class="sub">Villumynstur sem þetta efni prófar, eins og staðan er núna hjá hverjum og einum:</p>
      ${patternTableHTML(pupils, a.columns, { unread: false })}
    </details>
  </div>`;
}

/* ---------- the form: what may be set ------------------------------------ */

/** The options of the "Efni" list, as `kind:id` values. Patterns come in
    the class's order, worst first, when the table is known. */
export function targetOptionsHTML(worst = []) {
  const opt = (kind, id, nm) => `<option value="${esc(kind + ":" + id)}">${esc(nm)}</option>`;
  const order = [...worst.filter((id) => ASSIGNABLE_PATTERNS.some((p) => p.id === id)),
    ...ASSIGNABLE_PATTERNS.map((p) => p.id).filter((id) => !worst.includes(id))];
  /* A skill with no question type yet (Námsorð before its first, #19) cannot be set. */
  return `<optgroup label="Flokkar">${SKILLS.filter((s) => skillHasTypes(s.id)).map((s) => opt("skill", s.id, s.nm)).join("")}</optgroup>
    <optgroup label="Villumynstur${worst.length ? " (algengust í hópnum fyrst)" : ""}">${
      order.map((id) => opt("pattern", id, patternById(id).nm)).join("")}</optgroup>
    <optgroup label="Námskrá">${[...ASSIGNABLE_NODES].sort((a, b) => a.year - b.year)
      .map((n) => opt("node", n.id, `${n.year}.b · ${n.nm}`)).join("")}</optgroup>
    <optgroup label="Allt efni bekkjar">${YEARS.map((y) => opt("year", y, targetName({ kind: "year", id: y }))).join("")}</optgroup>`;
}

/* ---------- the sample of wrong answers (item 38) ---------------------------
 *
 * The one place in the program where something a pupil typed can be kept,
 * and so it is the teacher's decision for their own group, off until they
 * make it, and said in plain words — to the teacher here, and to the pupil
 * under Aðgangurinn minn and in the privacy notice. */

export function samplesCardHTML(info) {
  if (!info || !info.available) return "";
  return `<h3 class="sec2">Sýni af röngum svörum</h3>
    <p class="sub">Fallaskóli geymir annars aldrei það sem nemendur skrifa. Ef þú kveikir á þessu geymir
      þjónninn lítið, <b>nafnlaust</b> sýni af röngum beygingarmyndum úr þessum hópi: orðið sem spurt var um,
      myndina sem átti að skrifa, myndina sem nemandinn skrifaði og hvernig villugreiningin flokkaði
      villuna. Hvergi er skráð hver skrifaði eða hvenær, og aðeins stök orð sem líkjast beygingarmynd
      orðsins eru geymd. Sýnið er eingöngu notað til að prófa sjálfkrafa hvort villugreiningin flokkar
      villur rétt. Nemandi getur sleppt því að vera með undir <b>Aðgangurinn minn</b>.
      Láttu nemendur og forsjáraðila vita áður en þú kveikir á þessu.</p>
    <div class="filters"><label><input type="checkbox" id="tc-samples-on"${info.on ? " checked" : ""}>
      Geyma nafnlaust sýni af röngum svörum úr þessum hópi</label></div>
    <div id="tc-samples-note"></div>`;
}

async function drawSamples(app, group) {
  const box = $("tc-samples");
  if (!box) return;
  let info;
  try { info = await app.server.teacherSamples(group); } catch { box.innerHTML = ""; return; }
  box.innerHTML = samplesCardHTML(info);
  const sw = $("tc-samples-on");
  if (!sw) return;
  sw.onchange = async () => {
    try {
      const r = await app.server.setTeacherSamples(group, sw.checked);
      $("tc-samples-note").innerHTML = verdict(r.on
        ? "Kveikt. Röng svör úr hópnum geta nú lent í nafnlausa sýninu."
        : "Slökkt. Ekkert nýtt er geymt úr þessum hópi.", "good");
    } catch (e) { sw.checked = !sw.checked; $("tc-samples-note").innerHTML = verdict(e.message); }
  };
}

/* ---------- the class goal (item 59) ---------------------------------------- */

/** The teacher's card for the weekly goal, from GET /teacher/classgoal. */
export function goalCardHTML(info) {
  if (!info) return "";
  const cur = info.goal ? `${info.goal.kind}:${info.goal.n}` : "";
  const few = (info.pupils || 0) < CLASS_GOAL.minPupils;
  const now = info.goal
    ? `<p class="sub">Markmið hópsins núna: <b>${esc(goalText(info.goal))}</b>.
        ${info.progress && !info.progress.small ? esc(progressText(info.progress)) : ""}</p>`
    : `<p class="sub faint">Hópurinn hefur ekkert markmið núna.</p>`;
  return `<h3 class="sec2">Markmið vikunnar</h3>
    <p class="sub">Markmið sem hópurinn nær saman, í stað þess að keppa innbyrðis. Nemendur sjá eina
      sameiginlega stiku efst í Skólastofunni: samtölu hópsins, aldrei hvað hver lagði til. Allir virkir
      nemendur hópsins teljast með, líka þeir sem eru ekki á stigatöflunni. Þegar markmiðinu er náð fá allir
      í hópnum merkið <b>Saman í mark</b>. Markmiðið gildir í hverri viku, frá mánudegi til sunnudags,
      þar til þú breytir því eða fjarlægir það. Lota telst með ef svarað var að minnsta kosti
      ${CLASS_GOAL.lotaMin} spurningum í henni.</p>
    ${now}
    ${few ? `<p class="sub faint">Hópurinn þarf að hafa að minnsta kosti ${CLASS_GOAL.minPupils} nemendur til að
      fá sameiginlegt markmið, svo að samtalan sé aldrei tala eins nemanda.</p>` : `
    <div class="filters">
      <label class="lbl" for="tc-goal-what">Markmið</label>
      <select id="tc-goal-what">${GOAL_OPTIONS.map(([v, label]) =>
        `<option value="${esc(v)}"${v === cur ? " selected" : ""}>${esc(label)}</option>`).join("")}</select>
      <button type="button" class="go" id="tc-goal-set">Setja markmið</button>
      ${info.goal ? `<button type="button" class="ghost" id="tc-goal-off">Fjarlægja markmiðið</button>` : ""}
    </div>`}
    <div id="tc-goal-msg"></div>`;
}

async function drawGoal(app, group, msg = "") {
  const box = $("tc-goal");
  if (!box) return;
  let info;
  try { info = await app.server.teacherClassGoal(group); }
  catch (e) { box.innerHTML = verdict(e.message); return; }
  box.innerHTML = goalCardHTML(info);
  if (msg) $("tc-goal-msg").innerHTML = msg;
  /* The pupils' bar above follows at once, when it is the teacher's own group. */
  const mine = async () => {
    try { app.classGoal = await app.server.classGoal(); } catch { /* the bar keeps its last picture */ }
    renderClassGoal(app);
  };
  const set = $("tc-goal-set");
  if (set) set.onclick = async () => {
    const [kind, n] = String($("tc-goal-what").value || "").split(":");
    set.disabled = true;
    try {
      await app.server.setClassGoal(group, kind, Number(n));
      await drawGoal(app, group, verdict("Markmiðið er komið til nemendanna.", "good"));
      await mine();
    } catch (e) { $("tc-goal-msg").innerHTML = verdict(e.message); set.disabled = false; }
  };
  const off = $("tc-goal-off");
  if (off) off.onclick = async () => {
    off.disabled = true;
    try {
      await app.server.removeClassGoal(group);
      await drawGoal(app, group, verdict("Markmiðið er fjarlægt.", "good"));
      await mine();
    } catch (e) { $("tc-goal-msg").innerHTML = verdict(e.message); off.disabled = false; }
  };
}

/* ---------- drawing -------------------------------------------------------- */

let chosenGroup = null;

export async function renderTeacher(app) {
  const box = $("teacher");
  if (!box) return;
  if (!app.server || !app.rights || !app.rights.canTeach) { box.innerHTML = ""; return; }

  let groups;
  try { groups = await app.server.teacherGroups(); }
  catch { box.innerHTML = ""; return; }
  const list = groups.groups || [];
  if (!list.length) { box.innerHTML = ""; return; }
  if (!list.some((g) => g.id === chosenGroup)) {
    /* The administrator starts on the first group that has pupils in it. */
    chosenGroup = (list.find((g) => g.id === groups.mine && g.pupils) || list.find((g) => g.pupils) || list[0]).id;
  }
  const group = chosenGroup;
  const today = dayOf(Date.now());
  const inWeek = dayOf(Date.now() + 7 * 86400000);
  const last = dayOf(Date.now() + ASSIGN.maxDays * 86400000);

  box.innerHTML = `<h2 class="sec first">Fyrir kennarann</h2>
    <p class="sub">Aðeins kennari eða forsjáraðili hópsins sér þennan hluta, og umsjónarmaður.
      Hér setur þú hópnum markmið vikunnar og verkefni og stýrir lifandi umferð og
      bekkjareinvígjum. Neðar sést hvernig nemendum hópsins gengur í villumynstrum og verkefnum,
      og færnikort hvers og eins — tölur, ekki það sem þeir skrifa.</p>
    ${list.length > 1 ? `<div class="polactions"><label class="lbl" for="tc-group">Hópur</label>
      <select id="tc-group">${list.map((g) => `<option value="${esc(g.id)}"${g.id === group ? " selected" : ""}>${
        esc(g.name)} (${g.pupils})</option>`).join("")}</select></div>` : ""}

    <div id="tc-goal"></div>

    <h3 class="sec2">Verkefni</h3>
    <p class="sub">Nemendur sjá verkefnið efst í Æfa og byrja á því með einum smelli. Spurningarnar eru
      aðeins um efnið sem þú velur, á þyngd hvers og eins.</p>
    <div class="assignform">
      <label class="lbl" for="tc-what">Efni</label>
      <select id="tc-what"></select>
      <div class="assignformrow">
        <label class="lbl" for="tc-n">Spurningar
          <select id="tc-n">${ASSIGN.sizes.map((n) => `<option value="${n}"${n === 10 ? " selected" : ""}>${n}</option>`).join("")}</select></label>
        <label class="lbl" for="tc-due">Skiladagur
          <input type="date" id="tc-due" value="${inWeek}" min="${today}" max="${last}"></label>
      </div>
      <label class="lbl" for="tc-note">Athugasemd til nemenda (má sleppa)</label>
      <input type="text" id="tc-note" maxlength="${ASSIGN.noteMax}" placeholder="t.d. Fyrir þriðjudag">
      <div class="answer"><button type="button" class="go" id="tc-set">Setja verkefni</button></div>
      <div id="tc-note-msg"></div>
    </div>
    <div id="tc-list"><p class="sub faint">Sæki verkefnin…</p></div>

    <div id="tc-live"></div>
    <div id="tc-team"></div>

    <h3 class="sec2">Villumynstur hópsins</h3>
    <p class="sub">Nemendur niður, villumynstur þvert, algengasta villa hópsins fremst. Í hverjum reit:
      hve oft svarið var rangt af síðustu svörum sem prófa mynstrið — sömu tölur og nemandinn sér
      sjálfur undir <b>Færnikort</b>. ⚠ merkir „algengt núna“ og ▲ betra, ● svipað
      og ▼ verra en áður. <b>Ógreint</b> er hve mörg röng svör villugreiningin kunni ekki að
      flokka — það er ekki villa nemandans.</p>
    <div id="tc-table"><p class="sub faint">Sæki töfluna…</p></div>
    <p><a class="ghost filelabel" id="tc-csv" href="${esc(app.server.classPatternsCsvUrl(group))}" download>Sækja töfluna (CSV)</a></p>
    <h3 class="sec2">Færnikort nemanda</h3>
    <p class="sub">Sama kort og nemandinn sér sjálfur undir <b>Færnikort</b>: hvert
      efnisatriði námskrárinnar, hve gott vald nemandinn hefur á því og hvað bíður hans þar. Þú sérð
      tölurnar um efnið — ekki hvenær nemandinn æfði sig, ekki hvaða orð fóru úrskeiðis og ekkert sem
      hann skrifaði.</p>
    <div class="polactions"><label class="lbl" for="tc-pupil">Nemandi</label>
      <select id="tc-pupil"><option value="">Veldu nemanda…</option></select></div>
    <div id="tc-map" aria-live="polite"></div>
    <div id="tc-samples"></div>
    <div id="tc-l2"></div>
    <div id="tc-writing"></div>`;

  const sel = $("tc-group");
  if (sel) sel.onchange = () => { chosenGroup = sel.value; renderTeacher(app); };

  /* The table and the assignments, both from the server. */
  let worst = [];
  const drawTable = async () => {
    try {
      const t = await app.server.classPatterns(group);
      worst = t.columns;
      $("tc-table").innerHTML = patternTableHTML(t.pupils, t.columns);
      /* The same pupils, by name, are whose map may be opened (item 83). */
      $("tc-pupil").innerHTML = `<option value="">Veldu nemanda…</option>` +
        t.pupils.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");
    } catch (e) { $("tc-table").innerHTML = verdict(e.message); }
    $("tc-what").innerHTML = targetOptionsHTML(worst);
    /* The same material, the class's worst patterns first (item 64). */
    await Promise.all([drawLiveTeacher(app, group, targetOptionsHTML(worst)),
      drawTeamTeacher(app, group, targetOptionsHTML(worst))]);
  };
  const drawList = async (msg = "") => {
    let data;
    try { data = await app.server.teacherAssignments(group); }
    catch (e) { $("tc-list").innerHTML = verdict(e.message); return; }
    const items = data.assignments || [];
    $("tc-list").innerHTML = msg + (items.length
      ? items.map((a) => assignmentCardHTML(a, data.pupils)).join("")
      : `<p class="sub faint">Ekkert verkefni hefur verið sett hópnum.</p>`);
    $("tc-list").querySelectorAll("[data-adel]").forEach((b) => {
      let armed = null;
      b.onclick = async () => {
        /* No `confirm()` (ignored in a frame): the button asks twice. */
        if (!armed) {
          b.textContent = "Ertu viss? Smelltu aftur";
          armed = setTimeout(() => { armed = null; b.textContent = "Eyða"; }, 6000);
          return;
        }
        clearTimeout(armed);
        try { await app.server.removeAssignment(b.dataset.adel); drawList(verdict("Verkefninu er eytt.", "good")); }
        catch (e) { drawList(verdict(e.message)); }
      };
    });
  };

  /* Item 83 (d): one pupil's skill map, fetched when they are chosen. Not
     kept: choosing again asks the server again, so it is never stale. */
  $("tc-pupil").onchange = async () => {
    const id = $("tc-pupil").value, el = $("tc-map");
    if (!id) { el.innerHTML = ""; return; }
    el.innerHTML = `<p class="sub faint">Sæki færnikortið…</p>`;
    try {
      const data = await app.server.pupilSkillMap(group, id);
      /* Somebody else was chosen while this one was on its way. */
      if ($("tc-pupil").value !== id) return;
      drawTeacherMap(el, data);
    } catch (e) { el.innerHTML = verdict(e.message); }
  };

  $("tc-set").onclick = async () => {
    const [kind, id] = String($("tc-what").value || "").split(":");
    $("tc-set").disabled = true;
    try {
      await app.server.setAssignment({ group, target: { kind, id }, n: Number($("tc-n").value),
        due: $("tc-due").value, note: $("tc-note").value.trim() });
      $("tc-note").value = "";
      $("tc-note-msg").innerHTML = "";
      await drawList(verdict("Verkefnið er komið til nemendanna.", "good"));
    } catch (e) { $("tc-note-msg").innerHTML = verdict(e.message); }
    $("tc-set").disabled = false;
  };

  $("tc-what").innerHTML = targetOptionsHTML();
  await Promise.all([drawTable(), drawList(), drawSamples(app, group), drawGoal(app, group),
    drawTeacherL2(app, group),                      // item 45, ui/secondlang.js
    drawTeacherWriting(app, group)]);               // item 46, ui/writing.js
}
