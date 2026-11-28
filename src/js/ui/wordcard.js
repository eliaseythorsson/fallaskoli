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
 * KINDS draws a step by its `kind`. A new kind of step is one more entry:
 * `(el, step, done, opts)` fills `el` and calls `done(answer)` — `answer`
 * is `{ c: [ids], ok }` (and `t`, the pupil's text, for a free-text step),
 * or null for a step that has nothing to keep — when the pupil may go on.
 *
 * "server" (#37) is a free-text step: the pupil writes, the server reads
 * it (`opts.ask(task)`, control/serverask.js: one automatic retry, one
 * revision), and the final judgement is settled once (`opts.settle`) — XP
 * for finishing and for revising, whatever the verdict. The definition is
 * not on the screen while the pupil writes; it comes after the reading.
 * The explanation (`eigin`) and my sentence (`min`, #38) are one box; the
 * three related words (`tengsl`, #38) are three rows of a word and how it
 * connects, sent as one text, and "Senda" waits until all three words are
 * there.
 */

import { esc, fmt, hideTip } from "./dom.js";
import { RATINGS } from "../core/wordcard.js";
import { judgeStep } from "../tasks/wordcard.js";
import { checklistHTML, linksFormHTML, linksFrom } from "./serverask.js";
import { serverGraderLost } from "../core/servergrader.js";

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

/** The end of the free-text step: the checklist (or "not judged"), the XP,
    and the definition it was read against. */
function ownVerdictHTML(j, step) {
  const d = j.detail || {};
  const xp = j.xp ? `<span class="xpop">+${j.xp} XP</span>` : "";
  const head = j.verdict === "notjudged"
    ? `<b>Ekki tókst að lesa svarið yfir.</b> Það er ekki þér að kenna.`
    : `<b>${j.ok ? "Aðalatriðið er komið." : "Aðalatriðið vantar enn."}</b>`;
  return `<div class="why wcwhy ${j.verdict === "notjudged" ? "" : j.ok ? "ok" : "no"}">${xp}${head}
    ${checklistHTML(d.checklist)}
    ${step.def ? `<p>Í orðabók: <b>${esc(step.def)}</b></p>` : ""}</div>`;
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

  /* Free text read by the server (#37, #38). */
  server(el, step, done, { last, ask, settle, lemma }) {
    const rows = step.links || 0;
    el.innerHTML = `<p class="wcq">${text(step.question)}</p>
      ${step.note ? `<p class="wcnote">${esc(step.note)}</p>` : ""}
      ${rows ? linksFormHTML(lemma, rows)
        : `<textarea class="wctext" rows="3" maxlength="1200" aria-label="Svarið þitt"></textarea>`}
      <div class="answer"><button type="button" class="go" data-wc="send"${rows ? " disabled" : ""}>Senda</button></div>
      <div class="wcafter" aria-live="polite"></div>`;
    const boxes = /** @type {(HTMLInputElement|HTMLTextAreaElement)[]} */ ([...el.querySelectorAll("textarea, input")]);
    const send = /** @type {HTMLButtonElement} */ (el.querySelector("[data-wc=send]"));
    const after = el.querySelector(".wcafter");
    /* The text the server reads: the box, or the three rows as one. */
    const answer = () => (rows ? linksFrom(el).text : boxes[0].value.trim());
    /* The three words as written, kept on the card beside the text. */
    const words = () => (rows ? linksFrom(el).rows.map((r) => r.word.replace(/\s+/g, " ").trim()) : []);
    const lockBoxes = (on) => boxes.forEach((b) => { b.disabled = on; });
    /* Three words, never fewer: "Senda" waits for them (step 5 is not skipped). */
    if (rows) el.addEventListener("input", () => { if (!boxes[0].disabled) send.disabled = !answer(); });
    const q = ask(step.task);
    let sent = "", first = null, sentWords = [], firstWords = [];
    const say = (html) => {
      const at = after.querySelector(".wcmsg");
      if (at) at.innerHTML = html; else after.innerHTML = `<p class="wcmsg">${html}</p>`;
    };
    const finish = (j, kept) => {
      settle(step.task, j);
      if (j.verdict === "notjudged") serverGraderLost();
      lockBoxes(true);
      send.parentElement.remove();
      after.innerHTML = `${ownVerdictHTML(j, step)}
        <div class="answer"><button type="button" class="go" data-wc="next">${last ? "Ljúka orðakorti →" : "Áfram →"}</button></div>`;
      const next = /** @type {HTMLButtonElement} */ (after.querySelector("[data-wc=next]"));
      /* Kept in the pupil's own card (core/wordcard.js): the text that was
         judged, and for the related words the three words themselves. */
      next.onclick = () => done({ c: kept ? firstWords : sentWords, t: kept ? first : sent, ok: j.ok === true });
      next.focus();
    };
    send.onclick = async () => {
      sent = answer() || ""; sentWords = words();
      if (!sent) { say(rows ? "Skrifaðu þrjú orð." : "Skrifaðu svarið í reitinn."); return; }
      send.disabled = true; lockBoxes(true);
      say(`<span class="reading">Les svarið yfir …</span>`);
      const r = await q.send({ text: sent });
      if (!r) return;
      send.disabled = false; lockBoxes(false);
      if (r.pending === "revise") {
        first = sent; firstWords = sentWords;
        after.innerHTML = `<div class="why wcwhy">${checklistHTML(r.detail.checklist)}
          ${r.detail.ask ? `<p class="ask"><b>${esc(r.detail.ask)}</b></p>` : ""}
          <p class="wcmsg">Þú mátt bæta svarið einu sinni: breyttu því og sendu aftur — eða haltu því eins og það er.</p>
          <button type="button" class="ghost" data-wc="keep">Halda svarinu</button></div>`;
        /** @type {HTMLButtonElement} */ (after.querySelector("[data-wc=keep]")).onclick = () => {
          const k = q.keep(); if (k) finish(k, true);
        };
        boxes[0].focus();
        return;
      }
      if (r.pending) {
        say(r.verdict === "same" ? "Þetta er sama svarið og áðan. Breyttu því — eða smelltu á <b>Halda svarinu</b>."
          : "Skrifaðu svarið í reitinn.");
        return;
      }
      finish(r, false);
    };
  },
};

/**
 * Show a card. Returns `{ el }`, the window's element (for a test).
 * @param {{word: string, lemma: string, steps: any[]}} card  tasks/wordcard.js `buildCard`
 * @param {(done: {rating: number, answers: Record<string, {c: string[], ok: boolean, t?: string}>}) => void} onDone
 * @param {{ask?: (task: any) => any, settle?: (task: any, j: any) => void}} [opts]  for a
 *   "server" step: control/session.js `withCard`
 */
export function openWordCard(card, onDone, opts = {}) {
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
  const steps = card.steps.filter((s) => KINDS[s.kind] && (s.kind !== "server" || (opts.ask && opts.settle)));
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
    }, { last: i === steps.length - 1, ask: opts.ask, settle: opts.settle, lemma: card.lemma });
    body.scrollTop = 0;
    const first = body.querySelector("button:not([disabled])");
    if (first) first.focus();
  };
  show();
  return { el: scrim };
}

/**
 * The pupil's own card, back after a review of a learned word (#18): what
 * they chose and wrote (on a free-text card, #38: the explanation, their
 * sentence and the three related words), read only, and two things they may add — a newer
 * self-rating, and a sentence of their own with the word (which must hold
 * a form of it). `onDone({ rating, sentence })` when they go on ("Áfram"),
 * `onDone(null)` on Escape. Unlike the first card this one may be left: the
 * additions are the pupil's to make or not.
 * @param {any} view  tasks/wordcard.js `revisitCard`
 * @param {(add: {rating: number, sentence: string} | null) => void} onDone
 */
export function openRevisit(view, onDone) {
  hideTip();
  const scrim = document.createElement("div");
  scrim.className = "scrim wcscrim";
  const mark = (ok) => `<span class="wcmark ${ok ? "ok" : "no"}" aria-label="${ok ? "rétt" : "rangt"}">${ok ? "✓" : "✗"}</span>`;
  const picks = view.picks.map((p) => `<li><p class="wcq">${text(p.question)}</p>
      <p class="wcpick">${esc(p.chosen.join(", "))} ${mark(p.ok)}${p.right.length ? ` <span class="wcright">Rétt: ${esc(p.right.join(", "))}</span>` : ""}</p></li>`).join("");
  scrim.innerHTML = `<div class="modal sheetmodal okort okrevisit" role="dialog" aria-modal="true" aria-label="Orðakortið þitt: ${esc(view.lemma)}" tabindex="-1">
    <div class="wchead"><p class="eyebrow"><span>Orðakortið þitt</span></p>
      <h3 class="wcword">${esc(view.lemma)}</h3></div>
    <div class="sheetbody wcbody" data-step="aftur">
      ${view.def ? `<section class="wcsec"><h4>Skýring</h4><p class="wcdef">${esc(view.def)}</p></section>` : ""}
      ${picks ? `<section class="wcsec"><h4>Það sem þú valdir</h4><ul class="wcpicks">${picks}</ul></section>` : ""}
      ${view.written.map((w) => `<section class="wcsec" data-own="${esc(w.id)}"><h4>${esc(w.head)}</h4>${
        w.lines.map((ln) => `<p class="wcown">${esc(ln)}</p>`).join("")}</section>`).join("")}
      ${view.mine.length ? `<section class="wcsec"><h4>Setningarnar þínar</h4><ul class="wcex wcmine">${
        view.mine.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></section>` : ""}
      <section class="wcsec"><h4>Bættu við</h4>
        <p class="wcq">${text(view.question)}</p>
        <div class="wcopts" role="group">${view.options.map((o, k) =>
          `<button type="button" data-k="${k}" aria-pressed="${k === view.rating}">${esc(o.text)}</button>`).join("")}</div>
        <p class="wcnote">Síðast valdir þú: <b>${esc(view.options[view.rating].text)}</b></p>
        <p class="wcq"><label for="wcsentence">${text(view.ask)}</label> <span class="wcnote">Má sleppa.</span></p>
        <textarea id="wcsentence" class="wctext" rows="2" maxlength="200" aria-label="Setningin þín"></textarea>
        <p class="wcmsg" aria-live="polite"></p>
      </section>
      <div class="answer"><button type="button" class="go" data-wc="next">Áfram →</button></div>
    </div></div>`;
  document.body.appendChild(scrim);
  let rating = view.rating;
  const buttons = [...scrim.querySelectorAll(".wcopts button")];
  buttons.forEach((b) => {
    b.onclick = () => {
      rating = +b.dataset.k;
      buttons.forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    };
  });
  const close = (add) => {
    document.removeEventListener("keydown", key, true);
    scrim.remove();
    onDone(add);
  };
  /* Escape leaves the card without adding; the other windows' Escape is not this one's. */
  const key = (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(null); } };
  document.addEventListener("keydown", key, true);
  const box = /** @type {HTMLTextAreaElement} */ (scrim.querySelector("textarea"));
  /** @type {HTMLButtonElement} */ (scrim.querySelector("[data-wc=next]")).onclick = () => {
    const sentence = box.value.trim().replace(/\s+/g, " ");
    if (sentence && !view.fits(sentence)) {
      scrim.querySelector(".wcmsg").innerHTML = text(`Orðið *${view.lemma}* þarf að vera í setningunni — eða hafðu reitinn auðan.`);
      box.focus();
      return;
    }
    close({ rating, sentence });
  };
  /* Not a button: an Enter still held from the question must not answer here. */
  /** @type {HTMLElement} */ (scrim.querySelector(".okrevisit")).focus();
  return { el: scrim };
}
