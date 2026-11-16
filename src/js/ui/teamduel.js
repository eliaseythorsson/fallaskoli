/* Team duels in the teacher's part of Skólastofan (critique item 67).

   Set one — the group split into two even teams, or the group against
   another — and follow it: how many of each team have played, each team's
   mean, and the teacher's own pupils by name. A challenge from another
   class waits here for a yes. The rules are in core/teamduel.js; the pupils
   play on the duel strip above their question (ui/duel.js). */

import { $, esc } from "./dom.js";
import { TEAM } from "../core/teamduel.js";

const one = (n) => n % 10 === 1 && n % 100 !== 11;
const days = (d) => `${d} ${one(d) ? "dagur" : "dagar"}`;
const mean = (x) => String(x).replace(".", ",");
const verdict = (text, kind = "bad") => (text ? `<div class="verdict ${kind}"><p>${esc(text)}</p></div>` : "");

const STATUS = { pending: "Bíður svars", open: "Í gangi", done: "Lokið" };

/** One team's line: name, how many played, the mean (and the handicap). */
function teamLine(t) {
  const played = `${t.played} af ${t.of} ${one(t.played) ? "hefur" : "hafa"} spilað`;
  const m = t.played ? ` · ${mean(t.mean)} rétt að meðaltali${t.plus ? ` + ${t.plus} í forgjöf` : ""}` : "";
  const people = t.pupils ? `<details><summary>Nemendur</summary><table class="admintable assignres">
      <tr><th>Nemandi</th><th>Rétt</th></tr>
      ${t.pupils.map((p) => `<tr><td>${esc(p.name)}</td><td>${p.res ? `${p.res.c} af ${p.res.n}` : `<span class="faint">ekki spilað</span>`}</td></tr>`).join("")}
    </table></details>` : "";
  return `<div><b>${esc(t.name)}</b> · ${played}${m}${people}</div>`;
}

/** A team duel as the teacher sees it. */
export function teamCardHTML(d) {
  const win = d.status !== "done" ? "" : d.winner === "t" ? "🤝 Jafntefli"
    : `🏆 ${esc(d.teams[d.winner].name)} vann`;
  return `<div class="assigncard${d.status === "done" ? " closed" : ""}" data-tid="${esc(d.id)}">
    <div class="assignhead">
      <div><b>${esc(d.teams.a.name)} gegn ${esc(d.teams.b.name)}</b>
        <span class="faint">${esc(d.name)} · ${d.n} spurningar · ${esc(STATUS[d.status] || "")}${
          d.status === "open" && d.deadline ? ` · til ${new Date(d.deadline).toLocaleDateString("is-IS", { day: "numeric", month: "long" })}` : ""}</span></div>
      <div class="assigncount">${win}</div>
      ${d.canAccept ? `<button type="button" class="go small" data-taccept="${esc(d.id)}">Samþykkja</button>` : ""}
      <button type="button" class="ghost small danger" data-tdel="${esc(d.id)}">${d.status === "done" ? "Eyða" : "Hætta við"}</button>
    </div>
    ${d.status === "pending" && !d.canAccept ? `<p class="sub faint">Kennari hins hópsins þarf að samþykkja áskorunina.</p>` : ""}
    ${d.status !== "pending" ? `${teamLine(d.teams.a)}${teamLine(d.teams.b)}` : ""}
  </div>`;
}

/** Draw the section into #tc-team. `optionsHTML` is the material list. */
export async function drawTeamTeacher(app, group, optionsHTML, msg = "") {
  const box = $("tc-team");
  if (!box || !app.server) return;
  let info;
  try { info = await app.server.teacherTeamDuels(group); }
  catch { box.innerHTML = ""; return; }
  const lim = info.limits || TEAM;
  const canSplit = info.pupils >= 2 * lim.minSide;
  const vs = [
    ...(canSplit ? [`<option value="split">Skipta hópnum í tvö jöfn lið</option>`] : []),
    ...info.others.map((g) => `<option value="${esc(g.id)}">Gegn hópnum ${esc(g.name)} (${g.pupils})</option>`),
  ];
  box.innerHTML = `<h3 class="sec2">Bekkjareinvígi</h3>
    <p class="sub">Hálfur hópurinn gegn hinum helmingnum, eða hópurinn gegn öðrum hópi. Hver nemandi spilar
      einvígið sjálfur, þegar honum hentar áður en tíminn rennur út, og fær jafnþungar spurningar og hinir
      en ekki þær sömu. Liðið með hærra meðaltal rétta svara vinnur, svo öll svör telja — líka þeirra sem
      fá færri rétt. Liðin eru jöfnuð eftir stigi og liðið á lægra stiginu fær forgjöf. Nemendur sjá
      sína eigin niðurstöðu og meðaltal liðanna, ekki einstaka bekkjarfélaga. Kennari hins hópsins þarf
      að samþykkja áskorun.</p>
    ${vs.length ? `<div class="assignform">
      <label class="lbl" for="tc-team-what">Efni</label>
      <select id="tc-team-what">${optionsHTML}</select>
      <div class="assignformrow">
        <label class="lbl" for="tc-team-vs">Lið
          <select id="tc-team-vs">${vs.join("")}</select></label>
        <label class="lbl" for="tc-team-n">Spurningar
          <select id="tc-team-n">${lim.sizes.map((n) => `<option value="${n}">${n}</option>`).join("")}</select></label>
        <label class="lbl" for="tc-team-days">Tími
          <select id="tc-team-days">${lim.days.map((d) => `<option value="${d}"${d === lim.defDays ? " selected" : ""}>${days(d)}</option>`).join("")}</select></label>
      </div>
      <div class="answer"><button type="button" class="go" id="tc-team-set">Hefja bekkjareinvígi</button></div>
    </div>` : `<p class="sub faint">Til að skipta hópnum í tvö lið þarf að minnsta kosti ${2 * lim.minSide} nemendur.</p>`}
    <div id="tc-team-msg">${msg}</div>
    ${(info.list || []).map(teamCardHTML).join("")}`;

  const redraw = (m) => drawTeamTeacher(app, group, optionsHTML, m);
  const set = $("tc-team-set");
  if (set) set.onclick = async () => {
    const [kind, id] = String($("tc-team-what").value || "").split(":");
    set.disabled = true;
    try {
      const r = await app.server.setTeamDuel({ group, target: { kind, id }, vs: $("tc-team-vs").value,
        n: Number($("tc-team-n").value), days: Number($("tc-team-days").value) });
      return redraw(verdict(r.duel.status === "pending"
        ? "Áskorunin er send. Einvígið hefst þegar kennari hins hópsins hefur samþykkt hana."
        : "Einvígið er hafið. Nemendur sjá það efst í Æfa.", "good"));
    } catch (e) { $("tc-team-msg").innerHTML = verdict(e.message); }
    set.disabled = false;
  };
  box.querySelectorAll("[data-taccept]").forEach((b) => {
    b.onclick = async () => {
      try { await app.server.acceptTeamDuel(b.dataset.taccept); redraw(verdict("Einvígið er hafið.", "good")); }
      catch (e) { redraw(verdict(e.message)); }
    };
  });
  box.querySelectorAll("[data-tdel]").forEach((b) => {
    let armed = null;
    b.onclick = async () => {
      /* No `confirm()` (ignored in a frame): the button asks twice. */
      if (!armed) {
        const was = b.textContent;
        b.textContent = "Ertu viss? Smelltu aftur";
        armed = setTimeout(() => { armed = null; b.textContent = was; }, 6000);
        return;
      }
      clearTimeout(armed);
      try { await app.server.removeTeamDuel(b.dataset.tdel); redraw(verdict("Einvíginu er eytt.", "good")); }
      catch (e) { redraw(verdict(e.message)); }
    };
  });
}
