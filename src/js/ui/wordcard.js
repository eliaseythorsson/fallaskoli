/* The Orðakort on the screen (issue #15): one word, one step at a time.
 *
 * `openWordCard(card, onDone)` draws the card of tasks/wordcard.js in a
 * window over the page and calls `onDone({ rating, answers })` when the last
 * step is finished. THE CARD CANNOT BE SKIPPED: the window has no ✕, Escape
 * and a click beside it do nothing, and nothing is saved until the end — a
 * pupil who reloads the page meets the same card again.
 *
 * Only the step that is open is on the screen. The definition is part of
 * the first step (`read`) alone, so it is not there while the pupil chooses
 * the right explanation; it comes back in the feedback, after the answer.
 *
 * KINDS draws a step by its `kind`. A new kind of step (the free-text step
 * of #37/#38) is one more entry: `(el, step, done)` fills `el` and calls
 * `done(answer)` — `answer` is `{ c: [ids], ok }`, or null for a step that
 * has nothing to keep — when the pupil may go on.
 */

import { esc, fmt, hideTip } from "./dom.js";
import { RATINGS } from "../core/wordcard.js";
import { judgeStep } from "../tasks/wordcard.js";

const text = (s) => fmt(s, { gloss: false });

/** A sentence with the word's form in bold. */
function sentenceHTML(s) {
  if (!s.at) return esc(s.text);
  const [a, b] = s.at;
  return `${esc(s.text.slice(0, a))}<b>${esc(s.text.slice(a, b))}</b>${esc(s.text.slice(b))}`;
}

function tableHTML(t) {
  const head = t.head ? `<thead><tr>${t.head.map((h) => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead>` : "";
  return `<table class="wctable">${head}<tbody>${t.rows.map(([label, ...cells]) =>
    `<tr><th scope="row">${esc(label)}</th>${cells.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

const KINDS = {
  /* Read: the definition, the sentences, the syllables, the table. */
  read(el, step, done) {
    const n = step.syllables ? step.syllables.length : 0;
    el.innerHTML = `
      ${step.def ? `<section class="wcsec"><h4>Skýring</h4><p class="wcdef">${esc(step.def)}</p>
        ${step.source === "ÍNO" ? `<p class="wcsrc">Úr Íslenskri nútímamálsorðabók</p>` : ""}</section>` : ""}
      ${step.sentences.length ? `<section class="wcsec"><h4>Dæmi</h4><ul class="wcex">${
        step.sentences.map((s) => `<li>${sentenceHTML(s)}</li>`).join("")}</ul></section>` : ""}
      ${n ? `<section class="wcsec"><h4>Atkvæði</h4><p class="wcsyl">${esc(step.syllables.join(" · "))}
        <span class="wccount">${n} atkvæði</span></p></section>` : ""}
      ${step.table || step.note ? `<section class="wcsec"><h4>Beyging</h4>${step.table ? tableHTML(step.table) : ""}
        ${step.note ? `<p class="wcnote">${esc(step.note)}</p>` : ""}</section>` : ""}
      <div class="answer"><button type="button" class="go" data-wc="next">Áfram →</button></div>`;
    el.querySelector("[data-wc=next]").onclick = () => done(null);
  },

  /* Self-rating: one tap. Neither right nor wrong. */
  rate(el, step, done) {
    el.innerHTML = `<p class="wcq">${text(step.question)}</p>
      <div class="wcopts" role="group">${step.options.map((o) =>
        `<button type="button" data-id="${esc(o.id)}">${esc(o.text)}</button>`).join("")}</div>`;
    el.querySelectorAll(".wcopts button").forEach((b) => {
      b.onclick = () => done({ rating: RATINGS.indexOf(b.dataset.id) });
    });
  },

  /* A choice: one option (a tap answers) or several (tick, then "Athuga").
     After the answer the right options are marked, the feedback says why,
     and the pupil goes on. */
  choice(el, step, done, { last }) {
    el.innerHTML = `<p class="wcq">${text(step.question)}</p>
      <div class="wcopts${step.multi ? " multi" : ""}" role="group">${step.options.map((o, k) =>
        `<button type="button" data-k="${k}" aria-pressed="false">${esc(o.text)}</button>`).join("")}</div>
      ${step.multi ? `<div class="answer"><button type="button" class="go" data-wc="check" disabled>Athuga</button></div>` : ""}
      <div class="wcafter" aria-live="polite"></div>`;
    const buttons = [...el.querySelectorAll(".wcopts button")];
    const chosen = () => buttons.filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => step.options[+b.dataset.k].id);
    const settle = () => {
      const c = chosen(), ok = judgeStep(step, c);
      buttons.forEach((b) => {
        const id = step.options[+b.dataset.k].id;
        b.disabled = true;
        if (step.answer.includes(id)) b.classList.add("right");
        else if (c.includes(id)) b.classList.add("wrongpick");
      });
      const check = el.querySelector("[data-wc=check]");
      if (check) check.parentElement.remove();
      el.querySelector(".wcafter").innerHTML = `<div class="why wcwhy ${ok ? "ok" : "no"}"><b>${ok ? "Rétt!" : "Ekki alveg."}</b>${text(step.why)}</div>
        <div class="answer"><button type="button" class="go" data-wc="next">${last ? "Ljúka orðakorti →" : "Áfram →"}</button></div>`;
      const next = el.querySelector("[data-wc=next]");
      next.onclick = () => done({ c, ok });
      next.focus();
    };
    buttons.forEach((b) => {
      b.onclick = () => {
        if (!step.multi) { b.setAttribute("aria-pressed", "true"); settle(); return; }
        b.setAttribute("aria-pressed", b.getAttribute("aria-pressed") === "true" ? "false" : "true");
        el.querySelector("[data-wc=check]").disabled = !chosen().length;
      };
    });
    const check = el.querySelector("[data-wc=check]");
    if (check) check.onclick = settle;
  },
};

/**
 * Show a card. Returns `{ el }`, the window's element (for a test).
 * @param {{word: string, lemma: string, steps: any[]}} card  tasks/wordcard.js `buildCard`
 * @param {(done: {rating: number, answers: Record<string, {c: string[], ok: boolean}>}) => void} onDone
 */
export function openWordCard(card, onDone) {
  hideTip();
  const scrim = document.createElement("div");
  scrim.className = "scrim wcscrim";
  scrim.innerHTML = `<div class="modal sheetmodal okort" role="dialog" aria-modal="true" aria-label="Orðakort: ${esc(card.lemma)}">
    <div class="wchead"><p class="eyebrow"><span>Orðakort · nýtt orð</span><b class="wcstep"></b></p>
      <h3 class="wcword">${esc(card.lemma)}</h3></div>
    <div class="sheetbody wcbody"></div></div>`;
  document.body.appendChild(scrim);
  /* Escape closes the other windows of the program; not this one. */
  const key = (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); } };
  document.addEventListener("keydown", key, true);

  const body = scrim.querySelector(".wcbody");
  const steps = card.steps.filter((s) => KINDS[s.kind]);
  const result = { rating: 0, answers: {} };
  let i = 0;
  const show = () => {
    const step = steps[i];
    scrim.querySelector(".wcstep").textContent = `Skref ${i + 1} af ${steps.length}`;
    body.dataset.step = step.id;
    KINDS[step.kind](body, step, (answer) => {
      if (answer && "rating" in answer) result.rating = answer.rating;
      else if (answer) result.answers[step.id] = answer;
      i += 1;
      if (i < steps.length) { show(); return; }
      document.removeEventListener("keydown", key, true);
      scrim.remove();
      onDone(result);
    }, { last: i === steps.length - 1 });
    body.scrollTop = 0;
    const first = body.querySelector("button:not([disabled])");
    if (first) first.focus();
  };
  show();
  return { el: scrim };
}
