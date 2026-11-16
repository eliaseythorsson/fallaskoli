/* Progress: the header, the tiles and the charts. The per-skill scoreboard,
   the error patterns, the heat map and the words to practise are the skill
   map since v6.13 (item 83, ui/skillmap.js). */

import { overallLevel, overallRank, dayMult } from "../core/progress.js";
import { dayStreak, dkey, todayKey, effectivePolicy } from "../core/state.js";
import { fmtDuration } from "../core/timing.js";
import { bandOf } from "../core/difficulty.js";
import { $, esc } from "./dom.js";
import { crestOf } from "../core/profile.js";
import { holidayName } from "../core/calendar.js";
import { dueEntries, dueLine } from "../core/review.js";
import { typeById, enabled } from "../tasks/index.js";

/** The entries waiting for review that this pupil may be asked now: the same
    test a session's opening applies (tasks/review.js planOpening), so the
    figure does not promise reviews of material that is switched off. */
export function dueNow(S, now = todayKey()) {
  const P = effectivePolicy(S);
  return dueEntries(S, now, (e) => { const t = typeById(e.t); return !!t && enabled(P, t); }).length;
}

/* ---------- the top of the board -----------------------------------------
 *
 * A teacher writes the date in the corner of the board before anything else,
 * and keeps count in strokes. The board in the Æfa tab does both: the date on
 * the left, today's answers on the right as tally marks — four strokes and a
 * fifth across them — against the daily goal.
 *
 * Strokes are drawn only while the goal is small enough to read as strokes.
 * Above TALLY_MAX the line is the two numbers and nothing else.              */

const WEEKDAYS = ["Sunnudagur", "Mánudagur", "Þriðjudagur", "Miðvikudagur",
                  "Fimmtudagur", "Föstudagur", "Laugardagur"];
const MONTHS_LONG = ["janúar", "febrúar", "mars", "apríl", "maí", "júní", "júlí",
                     "ágúst", "september", "október", "nóvember", "desember"];
const TALLY_MAX = 40;

export function boardDate(d = new Date()) {
  const nm = holidayName(d);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()}. ${MONTHS_LONG[d.getMonth()]}` +
    (nm ? `<i>${esc(nm)}</i>` : "");
}

/** One group of up to five: `n` strokes drawn, the rest of the five faint. */
function tallyGroup(done, size) {
  const stroke = (i) => `<line x1="${3 + i * 5}" y1="2" x2="${3 + i * 5}" y2="18"
    class="${i < done ? "" : "todo"}"/>`;
  const upright = Math.min(size, 4);
  let h = "";
  for (let i = 0; i < upright; i++) h += stroke(i);
  if (size === 5) h += `<line x1="0" y1="15" x2="21" y2="5" class="${done === 5 ? "" : "todo"}"/>`;
  return `<svg viewBox="0 0 21 20" width="21" height="20" aria-hidden="true">${h}</svg>`;
}

export function tallyHTML(done, goal) {
  const text = done >= goal
    ? `Dagsmarkmiði náð, ${done} svör`
    : `${done} af ${goal} svörum í dag`;
  if (goal > TALLY_MAX) return `<span class="tallytext">${text}</span>`;
  let groups = "";
  for (let at = 0; at < goal; at += 5) {
    const size = Math.min(5, goal - at);
    groups += tallyGroup(Math.max(0, Math.min(size, done - at)), size);
  }
  return `<span class="tallymarks${done >= goal ? " met" : ""}">${groups}</span>
    <span class="tallytext">${text}</span>`;
}

export function renderHeader(app) {
  const S = app.S;
  const d = S.days[todayKey()] || { a: 0, c: 0 };
  $("s-xp").textContent = S.xp.toLocaleString("is-IS");
  $("s-acc").textContent = d.a ? Math.round(100 * d.c / d.a) + "%" : "—";
  $("s-run").textContent = S.run;
  $("s-days").textContent = dayStreak(S);
  const L = overallLevel(S.xp);
  $("lvlbar").style.width = Math.round(100 * L.into / L.need) + "%";
  $("lvlname").textContent = "Stig " + L.level + " · " + overallRank(L.level);

  /* The two meta badges change how the name looks, all the way into the
     leaderboard. `crest` is computed from the badges themselves
     (core/profile.js -> crestOf), so it cannot start living a life of its own in
     the saved state and cannot fall out when badges are imported from another
     device. */
  const c = $("crest");
  if (c) {
    const cr = crestOf(app.S);
    c.className = cr.legendary ? "legendary" : "";
    c.textContent = cr.crown ? "👑 Allt sem til er" : cr.legendary ? "★ Öll merkin" : "";
    c.title = cr.crown
      ? "Öll merki unnin og hvert orð fundið."
      : cr.legendary ? "Öll önnur merki unnin." : "";
  }
  $("lvlnext").textContent = (L.need - L.into).toLocaleString("is-IS") + " XP í stig " + (L.level + 1);
  /* Item 22: what the XP decay used to say, said with the queue instead. */
  const due = $("duenow");
  if (due) due.textContent = dueLine(dueNow(S));
  const skill = app.cur?.skill;
  const bd = $("boarddate");
  if (bd) bd.innerHTML = boardDate();
  const tl = $("tally");
  if (tl) tl.innerHTML = tallyHTML(d.a, S.goal);
  $("diffmeter").innerHTML = "<span>þyngd</span>" +
    [1, 2, 3, 4, 5].map((i) =>
      `<i class="${skill && i <= bandOf(app.sess, skill) ? "on" : ""}"></i>`).join("");
}

/* ---------- charts ------------------------------------------------------ */

function lastDays(S, k) {
  /* Badges carry their dates (S.badges[id].dates), so "new badges per day" is
     derived from them rather than counted separately. That way the chart also
     covers badges won before the chart existed. */
  const badgeDays = {};
  Object.entries(S.badges || {}).forEach(([id, rec]) => {
    (rec.dates || []).forEach((d) => { badgeDays[d] = (badgeDays[d] || 0) + 1; });
  });
  const out = [], d = new Date();
  d.setDate(d.getDate() - (k - 1));
  for (let i = 0; i < k; i++) {
    const key = dkey(d);
    const rec = S.days[key] || {};
    out.push({
      key, label: d.getDate() + "/" + (d.getMonth() + 1),
      a: rec.a || 0, c: rec.c || 0, xp: rec.xp || 0,
      ms: rec.ms || 0, nw: rec.nw || 0, nb: badgeDays[key] || 0,
    });
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/* ---------- almennt graf ------------------------------------------------
   Gröfin voru þrjú handskrifuð SVG. Nú eru þau fjögur í viðbót, svo þau eiga
   sameiginlegan smið: einn súlusmiður og einn línusmiður sem taka svið og
   sniðfall. Nýtt graf er ein lína í renderStats.                          */

const CHART = { W: 860, H: 150, PL: 40, PR: 20, PB: 26, PT: 12 };

function barChart(rows, { value, title, colour = "var(--lupine)", format = String,
                          cumulative = false, height = CHART.H } = {}) {
  const { W, PL, PR, PB, PT } = CHART;
  const H = height;
  let run = 0;
  const vals = rows.map((r) => (cumulative ? (run += value(r)) : value(r)));
  const max = Math.max(...vals, 1);
  const bw = (W - PL - PR) / rows.length;
  const y = (v) => PT + (H - PT - PB) * (1 - v / max);
  let bars = "", ticks = "";
  rows.forEach((r, i) => {
    const v = vals[i];
    const x = PL + i * bw;
    if (v > 0) {
      bars += `<rect x="${(x + bw * 0.18).toFixed(1)}" y="${y(v).toFixed(1)}" ` +
        `width="${(bw * 0.64).toFixed(1)}" height="${(H - PB - y(v)).toFixed(1)}" ` +
        `fill="${colour}"><title>${esc(r.key)}: ${esc(title(r, v))}</title></rect>`;
    }
    if (i % 5 === 0 || i === rows.length - 1)
      ticks += `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 8}" font-size="9" ` +
        `fill="var(--slate)" text-anchor="middle" font-family="IBM Plex Mono">${r.label}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(String(max))}">
    <line x1="${PL}" y1="${H - PB}" x2="${W - PR}" y2="${H - PB}" stroke="var(--line)"/>
    <text x="${PL - 6}" y="${PT + 8}" font-size="9" fill="var(--slate)" text-anchor="end"
      font-family="IBM Plex Mono">${esc(format(max))}</text>
    ${bars}${ticks}</svg>`;
}

function activityChart(S, rows) {
  const W = 860, H = 220, PL = 34, PR = 34, PB = 26, PT = 12;
  const maxA = Math.max(S.goal, ...rows.map((r) => r.a), 1);
  const bw = (W - PL - PR) / rows.length;
  const y = (v) => PT + (H - PT - PB) * (1 - v / maxA);
  let bars = "", ticks = "";
  const pts = [];
  rows.forEach((r, i) => {
    const x = PL + i * bw;
    if (r.a) {
      bars += `<rect x="${x + bw * 0.18}" y="${y(r.a)}" width="${bw * 0.64}" height="${H - PB - y(r.a)}" fill="var(--lupine)" opacity="${r.a >= S.goal ? 1 : 0.45}"><title>${r.key}: ${r.a} svör, ${r.c} rétt</title></rect>`;
      pts.push([x + bw / 2, PT + (H - PT - PB) * (1 - r.c / r.a)]);
    }
    if (i % 5 === 0 || i === rows.length - 1)
      ticks += `<text x="${x + bw / 2}" y="${H - 8}" font-size="9" fill="var(--slate)" text-anchor="middle" font-family="IBM Plex Mono">${r.label}</text>`;
  });
  const line = pts.length > 1
    ? `<polyline points="${pts.map((p) => p.join(",")).join(" ")}" fill="none" stroke="var(--moss)" stroke-width="2"/>` : "";
  const dots = pts.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="2.5" fill="var(--moss)"/>`).join("");
  const gy = y(S.goal);
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Svör á dag">
    <line x1="${PL}" y1="${H - PB}" x2="${W - PR}" y2="${H - PB}" stroke="var(--line)"/>
    <line x1="${PL}" y1="${gy}" x2="${W - PR}" y2="${gy}" stroke="var(--line)" stroke-dasharray="4 4"/>
    <text x="${PL - 6}" y="${PT + 8}" font-size="9" fill="var(--slate)" text-anchor="end" font-family="IBM Plex Mono">${maxA}</text>
    ${bars}${line}${dots}${ticks}</svg>`;
}

function xpChart(rows) {
  const W = 860, H = 150, PL = 34, PR = 34, PB = 26, PT = 12;
  let run = 0;
  const cum = rows.map((r) => (run += r.xp));
  const max = Math.max(...cum, 1);
  const x = (i) => PL + (W - PL - PR) * (i / Math.max(rows.length - 1, 1));
  const y = (v) => PT + (H - PT - PB) * (1 - v / max);
  const path = cum.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return `<svg viewBox="0 0 ${W} ${H}">
    <line x1="${PL}" y1="${H - PB}" x2="${W - PR}" y2="${H - PB}" stroke="var(--line)"/>
    <path d="${path} L${x(rows.length - 1)},${H - PB} L${PL},${H - PB} Z" fill="var(--lupine)" opacity=".12"/>
    <path d="${path}" fill="none" stroke="var(--lupine)" stroke-width="2"/>
    <text x="${PL - 6}" y="${PT + 8}" font-size="9" fill="var(--slate)" text-anchor="end" font-family="IBM Plex Mono">${max}</text></svg>`;
}

export function renderStats(app) {
  const S = app.S;
  const d = S.days[todayKey()] || { a: 0, c: 0, xp: 0 };
  const acc = S.totalAnswers ? Math.round(100 * S.totalCorrect / S.totalAnswers) : 0;
  const active = Object.values(S.days).filter((x) => x.a > 0).length;
  const L = overallLevel(S.xp);
  $("tiles").innerHTML = `
    <div class="tile"><span>Í dag</span><b>${d.c} / ${d.a}</b><small>${d.a ? Math.round(100 * d.c / d.a) : 0}% rétt · ${d.xp} XP · markmið ${S.goal}</small></div>
    <div class="tile"><span>Alls</span><b>${acc}%</b><small>${S.totalCorrect} rétt af ${S.totalAnswers} · ${active} virkir dagar</small></div>
    <div class="tile"><span>Dagaröð</span><b>${dayStreak(S)}</b><small>margfaldari ×${dayMult(dayStreak(S)).toFixed(2)}</small></div>
    <div class="tile"><span>Heildarstig</span><b>${L.level}</b><small>${overallRank(L.level)} · ${(L.need - L.into).toLocaleString("is-IS")} XP í næsta</small></div>`;
  const rows = lastDays(S, 30);
  $("chart1").innerHTML = activityChart(S, rows);
  $("chart2").innerHTML = xpChart(rows);
  /* Time, new words and new badges — the same 30 days on the same axis, so
     they can be compared by eye against the XP chart above. */
  $("chart3").innerHTML = barChart(rows, {
    value: (r) => r.ms, colour: "var(--moss)",
    format: (v) => fmtDuration(v),
    title: (r, v) => fmtDuration(v) + " við skjáinn",
  });
  $("chart4").innerHTML = barChart(rows, {
    value: (r) => r.nw, colour: "var(--sulphur)",
    title: (r, v) => v + (v === 1 ? " nýtt orð" : " ný orð"),
  });
  $("chart5").innerHTML = barChart(rows, {
    value: (r) => r.nb, colour: "var(--rust)",
    title: (r, v) => v + (v === 1 ? " nýtt merki" : " ný merki"),
  });
  const totMs = Object.values(S.days).reduce((a, d) => a + (d.ms || 0), 0);
  $("timesub").textContent =
    `Alls ${fmtDuration(totMs)} við skjáinn. Tíminn telur aðeins á milli svara, ` +
    `stöðvast þegar flipinn fer úr sýn og telur mest tvær mínútur á hvert svar — ` +
    `svo opinn flipi yfir nótt verði ekki að æfingu.`;
}
