/* The class goal in Skólastofan (v6.13, critique item 59).

   One bar for the whole group, at the top of Skólastofan, above every board
   that ranks: what the teacher set, how far the group has got this week, and
   the badge everybody gets when the bar is full. Totals only — the server
   sends nothing else (server/classgoal.mjs). Drawn for every member of a group
   that has a goal, the teacher included; nothing at all when there is none,
   or with too few pupils to show a total (core/classgoal.js). */

import { $, esc } from "./dom.js";
import { goalText, progressText, percentOf } from "../core/classgoal.js";

/** The block for a GET /classgoal answer; "" when there is nothing to show. */
export function classGoalHTML(status) {
  const p = status && status.progress;
  if (!status || !status.goal || !p || p.small) return "";
  const pc = percentOf(p);
  const what = goalText(status.goal);
  const lastMet = status.last && status.last.met;
  return `<h2 class="sec first">Markmið vikunnar</h2>
    <p class="sub">Kennarinn setti hópnum markmið sem þið náið saman. Allir leggja sitt af mörkum og
      enginn sér hvað hver lagði til. Þegar markmiðinu er náð fá allir í hópnum merkið
      <b>Saman í mark</b>. Talan byrjar á núlli á mánudegi.</p>
    <div class="goalcard${p.met ? " met" : ""}">
      <p class="goalwhat"><b>${esc(what)}</b>${p.met ? " — náð! 🎯" : ""}</p>
      <div class="goalbar" role="progressbar" aria-label="${esc(what)}"
        aria-valuemin="0" aria-valuemax="${p.target}" aria-valuenow="${Math.min(p.done, p.target)}"><i
        style="width:${pc}%"></i></div>
      <p class="goalline">${esc(progressText(p))}</p>
      ${lastMet && !p.met ? `<p class="goalline faint">Hópurinn náði markmiðinu í síðustu viku.</p>` : ""}
    </div>`;
}

export function renderClassGoal(app) {
  const box = $("classgoal");
  if (!box) return;
  box.innerHTML = app.server ? classGoalHTML(app.classGoal) : "";
}
