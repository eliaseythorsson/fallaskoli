/* Duels on the screen (v6.7): the strip on the blackboard — a challenge
   waiting, a duel in progress, a result — and the duel room in Skólastofan,
   where a challenge is made. The rules are in core/duel.js; app.js runs the
   duel; this file only draws and wires buttons. */

import { DUEL, DUEL_TOPICS, topicName } from "../core/duel.js";
import { effectivePolicy } from "../core/state.js";
import { $, esc } from "./dom.js";

const left = (v, now = Date.now()) => {
  const h = (v.deadline - now) / 3600000;
  if (h <= 0) return "tíminn er liðinn";
  if (h < 1) return "minna en klukkustund eftir";
  const n = Math.floor(h);
  return `${n} ${n === 1 ? "klukkustund" : "klukkustundir"} eftir`;
};
const score = (r) => (r ? `${r.c}/${r.n}` : "—");

/* ---- the handicap (critique item 66, core/duel.js `handicap`) -------------
 *
 * A duel is played at the mean of the two players' levels, so the one on the
 * lower level is given a few right answers in advance. That has to be said —
 * before, so nobody is surprised, and after, so the sum can be checked — and
 * said kindly to both: it is not a penalty for the one and not charity for
 * the other, it is what makes the duel even.
 *
 * The word is *forgjöf*, as in golf and chess. Names stay in the nominative
 * (see RESULT below), so every sentence is built around "þú" or has the name
 * as its subject. */
const answers = (h) => (h === 1 ? "1 rétt svar" : `${h} rétt svör`);
const given = (v) => (v && v.handicap) || { mine: 0, theirs: 0 };

/** Before and during the duel: who starts with what, in one sentence. */
function handicapAhead(v) {
  const h = given(v);
  if (h.mine) return `Þú færð ${answers(h.mine)} í forgjöf af því að þú ert á lægra stigi í þessu efni.`;
  if (h.theirs) return `${esc(v.opponent.name)} er á lægra stigi en þú í þessu efni og fær því ${answers(h.theirs)} í forgjöf.`;
  return "";
}

/** After the duel: the sum, and why. Empty when nobody was given anything. */
function handicapAfter(v) {
  const h = given(v);
  if (!v.mine || !v.theirs || (!h.mine && !h.theirs)) return "";
  if (h.mine) {
    return `Þú fékkst ${answers(h.mine)} í forgjöf (${v.mine.c} + ${h.mine} = ${v.mine.c + h.mine}) af því að þú ert
      á lægra stigi í þessu efni. Þannig verður einvígið jafnara.`;
  }
  return `${esc(v.opponent.name)} er á lægra stigi en þú í þessu efni og fékk því ${answers(h.theirs)}
    í forgjöf (${v.theirs.c} + ${h.theirs} = ${v.theirs.c + h.theirs}). Þannig verður einvígið jafnara.`;
}
/* Names are never declined by the program (v6.10): *Þú vannst Dísa!* needs
   *Dísu*. So a name stands alone, in the nominative, after a "·" or a colon. */
const RESULT = {
  w: ["win", "🏆", "Sigur"], l: ["endure", "⚔️", "Tap"],
  t: ["offer", "🤝", "Jafntefli"], f: ["endure", "⌛", "Einvígið rann út"],
};

function dots(run) {
  return `<span class="drilldots" aria-hidden="true">${run.tasks.map((_, i) => {
    const m = run.marks[i];
    return `<i class="${m === 1 ? "ok" : m === 0 ? "no" : "due"}"></i>`;
  }).join("")}</span>`;
}

/** The strip above the question. */
export function renderDuelBar(app) {
  const el = $("duelbar");
  if (!el) return;
  const run = app.duelRun;

  if (run) {
    const v = run.view;
    el.innerHTML = `<div class="drillstrip duel active" role="status"><span class="drillico">⚔️</span>
      <div class="drilltext"><b>Einvígi · <em>${esc(v.opponent.name)}</em> · ${esc(topicName(v.topic))}</b>
        <span class="drillnums">Spurning ${Math.min(run.i + 1, run.tasks.length)} af ${run.tasks.length} · ${run.c} rétt</span>
        ${dots(run)}
        <span class="drillneed">Þið fáið jafnþungar spurningar en ekki þær sömu. Fleiri rétt svör vinna.
          ${handicapAhead(v)}</span></div>
      <button type="button" class="ghost" id="duelquit">Hætta</button></div>`;
    $("duelquit").onclick = () => app.quitDuel();
    return;
  }

  const parts = [];
  /* Between pressing play and the first question: the seeds are fetched and
     the questions built (app.js `startDuel`). */
  if (app.duelStarting) {
    parts.push(`<div class="drillstrip duel" role="status"><span class="drillico">⚔️</span>
      <div class="drilltext"><b>Sæki spurningarnar…</b></div></div>`);
  }
  for (const news of app.duelNews || []) {
    const v = news.view;
    const [cls, ico, words] = RESULT[news.outcome];
    const how = news.outcome === "f" ? ""
      : !v.theirs ? ` — ${esc(v.opponent.name)} svaraði ekki innan ${DUEL.hours} klukkustunda`
        : ` · þú ${score(v.mine)}, ${esc(v.opponent.name)} ${score(v.theirs)}`;
    const fair = news.outcome === "f" ? "" : handicapAfter(v);
    parts.push(`<div class="drillstrip duel ${cls}" role="status"><span class="drillico">${ico}</span>
      <div class="drilltext"><b>${words} · <em>${esc(v.opponent.name)}</em></b>
        <span class="drillnums">${esc(topicName(v.topic))}, ${v.n} spurningar${how}${news.xp ? ` · +${news.xp} XP` : ""}</span>
        ${fair ? `<span class="drillneed duelfair">${fair}</span>` : ""}</div>
      <button type="button" class="ghost" data-duelclose="${esc(v.id)}">Loka</button></div>`);
  }
  if (app.duelSent) {
    const s = app.duelSent;
    parts.push(`<div class="drillstrip duel" role="status"><span class="drillico">📨</span>
      <div class="drilltext"><b>${s.unplayed ? "Einvígið hófst ekki" : `Þú fékkst ${s.c} af ${s.n}`} · mótherji: <em>${esc(s.view.opponent.name)}</em></b>
        <span class="drillneed">${s.error ? esc(s.error)
          : `Niðurstaðan kemur þegar ${esc(s.view.opponent.name)} hefur svarað — eða tíminn rennur út.`}</span></div>
      <button type="button" class="ghost" id="duelsentclose">Loka</button></div>`);
  }
  const waiting = (app.duelList || []).filter((v) =>
    v.status === "open" && !v.mine && !(app.duelSkipped && app.duelSkipped.has(v.id)));
  waiting.slice(0, 2).forEach((v) => {
    parts.push(`<div class="drillstrip duel offer" role="status"><span class="drillico">⚔️</span>
      <div class="drilltext">${v.challenger
        ? `<b>Einvígið þitt bíður · <em>${esc(v.opponent.name)}</em></b>`
        : `<b><em>${esc(v.opponent.name)}</em> skorar á þig!</b>`}
        <span class="drillnums">${v.n} spurningar · ${esc(topicName(v.topic))} · ${left(v)}</span>
        <span class="drillneed">${v.theyPlayed ? `${esc(v.opponent.name)} er búin(n) að svara. ` : ""}Ef þú svarar ekki
          innan ${DUEL.hours} klukkustunda frá áskoruninni tapar þú einvíginu. ${handicapAhead(v)}</span></div>
      <button type="button" class="go" data-duelgo="${esc(v.id)}">${v.challenger ? "Spila núna" : "Taka áskoruninni"}</button>
      <button type="button" class="ghost" data-duelskip="${esc(v.id)}">Seinna</button></div>`);
  });
  if (waiting.length > 2) {
    parts.push(`<p class="duelmore">${waiting.length - 2} einvígi í viðbót bíða — sjá <b>Skólastofuna</b>.</p>`);
  }
  el.innerHTML = parts.join("");
  el.onclick = (e) => {
    const go = e.target.closest("[data-duelgo]");
    if (go) return app.startDuel(go.dataset.duelgo);
    const skip = e.target.closest("[data-duelskip]");
    if (skip) { (app.duelSkipped ||= new Set()).add(skip.dataset.duelskip); return renderDuelBar(app); }
    const close = e.target.closest("[data-duelclose]");
    if (close) { app.duelNews = (app.duelNews || []).filter((n) => n.view.id !== close.dataset.duelclose); return renderDuelBar(app); }
    if (e.target.closest("#duelsentclose")) { app.duelSent = null; renderDuelBar(app); }
  };
}

/** The duel room in Skólastofan: make a challenge, see your duels. */
export function renderDuelRoom(app) {
  const box = $("duelroom");
  if (!box) return;
  if (!app.server) {
    box.innerHTML = `<p class="sub faint">Einvígi eru aðeins til þegar forritið keyrir á vefþjóni með
      innskráningu — það þarf einhvern til að skora á.</p>`;
    return;
  }
  const info = app.duelInfo;
  if (!info) { box.innerHTML = `<p class="sub faint">Sæki einvígin…</p>`; return; }
  const form = info.review
    ? `<p class="sub warn">Staðan þín bíður yfirferðar umsjónarmanns og sést ekki á töflunni á meðan,
        svo þú getur ekki skorað á aðra í bili. Framvindan þín er óbreytt.</p>`
    : !info.shown
    ? `<p class="sub warn">Til að skora á aðra og fá áskoranir þarftu að vera á stigatöflunni —
        kveiktu á því hér fyrir ofan.</p>`
    : !info.canChallenge.length
      ? `<p class="sub faint">Enginn annar í hópnum þínum er á stigatöflunni enn, svo það er enginn til að skora á.</p>`
      : `<div class="duelform">
          <label>Á hvern?<select id="duelwho">${info.canChallenge.map((p) =>
            `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("")}</select></label>
          <label>Efni<select id="dueltopic">${DUEL_TOPICS.filter((t) => t.id === "blandad" || effectivePolicy(app.S).skill(t.id)).map((t) =>
            `<option value="${t.id}">${t.ico} ${esc(t.nm)}</option>`).join("")}</select></label>
          <div class="duelsize" role="group" aria-label="Fjöldi spurninga">${info.sizes.map((n, i) =>
            `<button type="button" data-size="${n}" aria-pressed="${i === 0}">${n}</button>`).join("")}</div>
          <button type="button" class="go" id="duelsend">Skora á ⚔️</button>
          <p class="sub" id="duelmsg">${app.duelMsgHTML || ""}</p></div>`;

  const rows = (info.duels || []).map((v) => {
    const state = v.status === "open"
      ? (!v.mine ? `<button type="button" class="go small" data-duelgo="${esc(v.id)}">Spila</button> · ${left(v)}`
        : `Bíður svars · ${left(v)}`)
      : ({ w: "🏆 Sigur", l: "Tap", t: "🤝 Jafntefli" }[v.outcome] || "")
        + (!v.mine ? " (svaraðir ekki)" : !v.theirs ? " (hinn svaraði ekki)" : "")
        /* The score columns show right answers; where a handicap was added
           to one of them, say so, or "6/10 against 7/10: Sigur" reads as a
           mistake. */
        + (v.mine && v.theirs && given(v).mine ? ` · forgjöf þín: +${given(v).mine}`
          : v.mine && v.theirs && given(v).theirs ? ` · forgjöf hins: +${given(v).theirs}` : "");
    return `<tr><td>${v.challenger ? "→" : "←"} ${esc(v.opponent.name)}</td>
      <td>${esc(topicName(v.topic))}</td><td class="right mono">${v.n}</td>
      <td class="right mono">${score(v.mine)}</td><td class="right mono">${v.mine || v.status === "done" ? score(v.theirs) : "?"}</td>
      <td>${state}</td></tr>`;
  }).join("");
  box.innerHTML = `${form}
    ${rows ? `<table class="board duels"><tr><th class="th">Við</th><th class="th">Efni</th>
      <th class="th right">Spurn.</th><th class="th right">Þú</th><th class="th right">Hinn</th><th class="th"></th></tr>${rows}</table>`
      : `<p class="sub faint">Engin einvígi enn.</p>`}`;

  let size = info.sizes[0];
  box.onclick = async (e) => {
    const sz = e.target.closest("[data-size]");
    if (sz) {
      size = Number(sz.dataset.size);
      box.querySelectorAll("[data-size]").forEach((b) => b.setAttribute("aria-pressed", b === sz));
      return;
    }
    const go = e.target.closest("[data-duelgo]");
    if (go) return app.startDuel(go.dataset.duelgo);
    if (e.target.closest("#duelsend")) {
      const msg = $("duelmsg"), btn = $("duelsend");
      btn.disabled = true;
      try {
        const who = $("duelwho").value, topic = $("dueltopic").value;
        app.duelMsgHTML = "";
        const r = await app.challenge(who, topic, size);
        app.duelMsgHTML = `Áskorun send · <em>${esc(r.duel.opponent.name)}</em>. Viltu svara strax?
          <button type="button" class="go small" data-duelgo="${esc(r.duel.id)}">Spila núna</button>`;
        const m = $("duelmsg");
        if (m) m.innerHTML = app.duelMsgHTML;
      } catch (err) {
        msg.textContent = err.message || "Tókst ekki.";
      } finally { btn.disabled = false; }
    }
  };
}
