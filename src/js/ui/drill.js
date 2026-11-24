/* The rescue drill's strip on the blackboard (v6.6): the offer, the drill in
   progress, and the result. One element, `#drillbar`, above the question; it
   is empty when there is nothing to say. Rules and numbers live in
   core/wordhealth.js; this file only draws them. */

import { DRILL, recentOf } from "../core/wordhealth.js";
import { $, esc } from "./dom.js";
import { wordRecord } from "../core/wordknowledge.js";

const pct = (x) => Math.round(100 * x) + "%";

function dots(marks) {
  const cells = [];
  for (let i = 0; i < DRILL.max; i++) {
    const m = marks[i];
    const cls = m === 1 ? "ok" : m === 0 ? "no" : i < DRILL.min ? "due" : "opt";
    cells.push(`<i class="${cls}" title="${i + 1}"></i>`);
  }
  return `<span class="drilldots" aria-hidden="true">${cells.join("")}</span>`;
}

export function renderDrillBar(app) {
  const el = $("drillbar");
  if (!el) return;
  const d = app.drill;

  if (d) {
    const left = Math.max(0, DRILL.min - d.n);
    const need = d.n >= DRILL.min
      ? `Meira en helmingur rétt og orðinu er bjargað — í síðasta lagi eftir ${DRILL.max} spurningar.`
      : `${left} ${left === 1 ? "spurning" : "spurningar"} í viðbót að minnsta kosti. Meira en helmingur rétt bjargar orðinu.`;
    el.innerHTML = `<div class="drillstrip active" role="status">
      <span class="drillico">🛟</span>
      <div class="drilltext"><b>Björgun: <em>${esc(d.entry.o)}</em></b>
        <span class="drillnums">${d.n ? `${d.c} rétt af ${d.n} (${pct(d.c / d.n)})` : "Fyrsta spurningin"}</span>
        ${dots(d.marks)}
        <span class="drillneed">${need}</span></div>
      <button type="button" class="ghost" id="drillstop">Hætta</button></div>`;
    $("drillstop").onclick = () => app.stopDrill();
    return;
  }

  if (app.drillDone) {
    const r = app.drillDone;
    el.innerHTML = r.passed
      ? `<div class="drillstrip win" role="status"><span class="drillico">🛟</span>
          <div class="drilltext"><b>Orðinu <em>${esc(r.lemma)}</em> bjargað!</b>
          <span class="drillnums">${r.c} rétt af ${r.n} · +${r.xp} XP${r.firstForWord ? "" : " (bjargað áður — hálf umbun)"}</span>
          <span class="drillneed">Það telur aftur í <b>Orðaforða</b> á stigatöflunni. Haltu því við og það gefur meira.</span></div>
          <button type="button" class="ghost" id="drillclose">Loka</button></div>`
      : `<div class="drillstrip endure" role="status"><span class="drillico">🪨</span>
          <div class="drilltext"><b>Seigla — ${r.n} spurningar á <em>${esc(r.lemma)}</em></b>
          <span class="drillnums">${r.c} rétt af ${r.n} · +${r.xp} XP fyrir að gefast ekki upp</span>
          <span class="drillneed">Orðið er enn erfitt. Reyndu aftur á morgun — það verður léttara.</span></div>
          <button type="button" class="ghost" id="drillclose">Loka</button></div>`;
    $("drillclose").onclick = () => { app.drillDone = null; renderDrillBar(app); };
    return;
  }

  if (app.drillOffer) {
    const o = app.drillOffer;
    const rec = wordRecord(app.S, o.key);
    const r = recentOf(rec);
    el.innerHTML = `<div class="drillstrip offer" role="status"><span class="drillico">⚠️</span>
      <div class="drilltext"><b><em>${esc(o.lemma)}</em> er orð í hættu</b>
        <span class="drillnums">${r.seen} svör, ${pct(r.acc || 0)} rétt nýlega</span>
        <span class="drillneed">Björgunaræfing: ${DRILL.min}–${DRILL.max} spurningar um þetta eina orð.
          Bjargaðu því og fáðu XP, merki og stig í <b>Orðaforða</b>.</span></div>
      <button type="button" class="go" id="drillgo">Bjarga orðinu</button>
      <button type="button" class="ghost" id="drillno">Ekki núna</button></div>`;
    $("drillgo").onclick = () => app.startDrill(o.key);
    $("drillno").onclick = () => { app.drillOffer = null; renderDrillBar(app); };
    return;
  }

  el.innerHTML = "";
}
