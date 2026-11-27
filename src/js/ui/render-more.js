/* Renderers for the v6.11 question shapes — gap, choice, tap and sort, which
   every category in tasks/ builds (tasks/registry.js names the renderer of
   each question type) — and for the optional Orðaforði bonus sentence.

   Same contract as ui/render.js: RENDER.x draws; submitX collects the
   response, has core/answer.js `judge` it, and hands the judgement to
   `conclude`, which settles it and ends in app.finish. Nothing is graded or
   recorded here. */

import { RENDER, sentenceHTML, wordHTML, whyBox, conclude, enterToSubmit, skillTag, slipNote,
         nearNote, multLine, PUNCT, offerRetry, endRetry, say, SAME_AGAIN, judgeTry, noteTry,
         compareHTML, retryRightHTML, RETRY_STILL_MISS } from "./render.js";
import { judge, judgeBonus, settle, bonusVerdict, BONUS_XP } from "../core/answer.js";
import { $, esc, fmt, wireKeys, cheer, CHEERS_OK, CHEERS_NO, freshEnter } from "./dom.js";
import { codedOn, codedHTML, hintButtonHTML, shownNoteHTML, wireHint, endHint } from "./hint.js";

const eyebrow = (t) =>
  `<p class="eyebrow"><span>${esc(t.title)}</span>${skillTag(t)}<b>þyngd ${t.lvl}</b></p>`;

/** The blank, with its cue in brackets: ___ (hún) */
const blankHTML = (t) =>
  `<span class="blank">?</span>${t.cue ? ` <span class="cue">(${esc(t.cue)})</span>` : ""}`;

/* Item 26: a Setningafræði question may draw its sentence with the structure
   marked (ui/hint.js). The words the question points at keep their own look. */
const pointedWord = (t) => (tok, j) => {
  const span = t.markSpan && t.span && j >= t.span.from && j <= t.span.to;
  const target = (t.marks && t.marks.includes(j)) || (!t.marks && (t.mark || t.mode === "replace") && j === t.i)
    || (t.items || []).some((x) => x.j === j);
  return span ? `<span class="clausemark">${esc(tok.w)}</span>` : target ? `<span class="target">${esc(tok.w)}</span>` : esc(tok.w);
};

/** Draw the question's sentence again (the hint opened, or the answer is in). */
const redrawSentence = (t, html) => {
  const el = document.querySelector("#task .sentence");
  if (el) el.outerHTML = html(t);
};

function questionSentence(t) {
  if (!t.s) return "";
  const coded = codedHTML(t, pointedWord(t));
  if (coded != null) return `<p class="sentence coded">${coded}</p>`;
  /* Several words marked as one (item 27: the verb phrase *var byggt*). The
     marked words are what the question is about and are never glossed; the
     rest carry the second-language gloss like any sentence (item 45 — they
     were plain text here, so a Germynd/miðmynd/þolmynd question showed no
     glosses with the mode on). */
  if (t.marks) return `<p class="sentence">${t.s.tok.map((x, j) => (PUNCT.has(x.w) ? x.w
    : (j ? " " : "") + (t.marks.includes(j) ? `<span class="target">${esc(x.w)}</span>` : wordHTML(x)))).join("")}</p>`;
  /* item 28: a run of words underlined (a clause, a phrase), as the clause
     question marks its clause. */
  if (t.markSpan && t.span) {
    return `<p class="sentence">${t.s.tok.map((tok, j) => {
      if (PUNCT.has(tok.w)) return tok.w;
      const inside = j >= t.span.from && j <= t.span.to;
      /* the space between two marked words is underlined with them */
      const sp = j === 0 ? "" : inside && j > t.span.from ? `<span class="clausemark"> </span>` : " ";
      /* glossed inside the mark too, as RENDER.clause does (item 45) */
      return sp + (inside ? `<span class="clausemark">${wordHTML(tok)}</span>` : wordHTML(tok));
    }).join("")}</p>`;
  }
  if (t.i == null || t.i < 0) return `<p class="sentence">${sentenceHTML(t.s, -1, "")}</p>`;
  const tok = t.s.tok[t.i];
  const inner = t.mode === "replace" || t.mark
    ? `<span class="target">${esc(tok.w)}</span>`
    : blankHTML(t);
  return `<p class="sentence">${sentenceHTML(t.s, t.i, inner)}</p>`;
}

/** The sentence as it should read, the answer in bold. */
const solvedSentence = (t, answer) =>
  t.s && t.i >= 0 ? `<p>${sentenceHTML(t.s, t.i, `<b>${esc(answer)}</b>`)}</p>` : "";

/* ================= gap ================================================== */

RENDER.gap = function (app) {
  const t = app.cur;
  const prompt = t.mode === "free"
    ? `<p class="sentence">${fmt(t.prompt).replace("___", blankHTML(t))}</p>`
    : questionSentence(t);
  $("task").innerHTML = `
  <div class="card">
    ${eyebrow(t)}
    ${prompt}
    ${t.hint ? `<p class="gloss">${fmt(t.hint)}</p>` : ""}
    ${t.tip ? `<p class="gloss" id="tip" hidden>💡 ${fmt(t.tip)}</p>` : ""}
    <div class="answer">
      <input type="text" id="ans" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="skrifaðu svarið…">
      <button class="go" id="check">Athuga</button>
      ${t.tip ? `<button class="ghost" id="hint">Vísbending</button>` : ""}
    </div>
    <div class="keys" id="keys"></div><div id="verdict"></div>
  </div>`;
  wireKeys();
  /* A hint kept behind a button (word formation: the affix). Using it costs
     a little XP, as everywhere else. */
  if (t.tip) $("hint").onclick = () => {
    t.hinted = true;
    $("hint").disabled = true;
    $("tip").hidden = false;
    $("ans").focus();
  };
  const inp = $("ans");
  inp.focus();
  enterToSubmit(inp, () => submitGap(app));
  $("check").onclick = () => submitGap(app);
};

function submitGap(app) {
  const t = app.cur;
  const val = $("ans").value;
  const response = { text: val, hinted: !!t.hinted };
  const j = judgeTry(app, t, response);
  if (j.verdict === "empty") return;
  if (j.verdict === "same") return say(t, SAME_AGAIN);
  if (j.verdict === "hedged") {
    say(t, `<b>Veldu eina mynd.</b> Þú skrifaðir fleiri en eina mynd (${j.detail.g.hedged.map(esc).join(", ")}). Skrifaðu þá sem þú telur rétta.`);
    return;
  }
  noteTry(t, j, val);
  const draw = () => drawGap(app, t, j, val);
  if (t.retrying) return endRetry(app, t, j, draw);
  /* Item 42. The tip behind the hint button (word formation: the affix) is
     opened with the rule: the pupil is trying again with help in view. */
  /* `retryWhy` (tasks/recall.js): the *af hverju* line names the word that
     was to be recalled, so the second try is shown this instead — the first
     letter, or nothing when it was there already. */
  if (offerRetry(app, t, j, {
    response, note: nearNote(j.detail.v), inputs: [$("ans")], lock: [$("hint")], reveal: draw,
    ...(t.retryWhy !== undefined ? { why: t.retryWhy, label: "vísbending" } : {}),
    onMiss: () => { if ($("tip")) $("tip").hidden = false; },
  })) return;
  conclude(app, t, j, draw);
}

/* `plain` — tvær buxur for tvennar buxur: the one mistake this question
   is about. */
/* `whyLabel`: the label of the line under the answer when it is not a
   reason (recall: "orðið", the word that was missing). */
function drawGap(app, t, j, val) {
  const { v, xpFull, plain } = j.detail;
  const ok = j.ok, xp = j.xp;
  if (t.tip) $("hint").disabled = true;
  /* `shown` (tasks/recall.js): the forms to show as right, when the task
     accepts more than it asks for. */
  const shown = t.shown || t.answers;
  const right = shown.slice(0, 2).map(esc).join(" / ");
  const solved = solvedSentence(t, t.answers[0]);
  /* `plain` of any wrong try: the note is about the mistake, whichever try. */
  const plainTyped = plain ? val.trim()
    : ((t.tries || []).find((x) => (t.plain || []).some((f) => f.toLowerCase() === x.typed.trim().toLowerCase())) || {}).typed;
  $("verdict").innerHTML = ok && !j.retry
    ? `<div class="verdict ${v.klass}"><span class="xpop">+${xp} XP</span>
    <h3>${v.slip ? esc(v.slip.head) : cheer(CHEERS_OK)}</h3>${solved}
    ${v.slip ? `<p>Þú skrifaðir <span class="forms">${esc(val.trim())}</span>. Rétt er <span class="forms">${right}</span>.</p>` : ""}
    ${slipNote(v.slip, xp, xpFull)}${whyBox(t.why, t.whyLabel)}
    <p class="streakline">${app.S.run} í röð${multLine(app, xp)}. Enter fyrir næstu.</p></div>`
    : `<div class="verdict ${ok ? v.klass : "no"}">${ok ? retryRightHTML(xp) : `<h3>${cheer(CHEERS_NO)}</h3>`}
    ${compareHTML(t, t.tries || [], { right: shown })}
    ${plainTyped ? `<div class="why"><b>athugið</b>${fmt(`*${t.answers[0]}* — ekki *${plainTyped.trim()}*: orðið á eftir er aðeins til í fleirtölu.`)}</div>` : ""}
    ${ok ? slipNote(v.slip, xp, xp) : nearNote(v)}${solved}${whyBox(t.why, t.whyLabel)}
    ${ok ? RETRY_STILL_MISS : ""}
    <p class="streakline">Enter fyrir næstu.</p></div>`;
  $("ans").disabled = true;
  bonusBox(app, t);
}

/* ================= choice =============================================== */

/* One half of a choice card: the sentence, the gloss, the question, the two
   options. A plain choice has one; a pair (item 43, tasks/shared.js `pairOf`)
   has two, one under the other, each with its own `.opts`. */
/* A whole text above the question (Lesskilningur, issue #30): the sentences
   of a short story or subject text as one paragraph. */
const textBlock = (h) => (Array.isArray(h.text) && h.text.length
  ? `<p class="sentence readtext">${h.text.map(esc).join(" ")}</p>` : "");

const choiceHalf = (h, n) => `
    ${textBlock(h)}${questionSentence(h)}
    ${h.gloss ? `<p class="gloss choicegloss">💬 ${fmt(h.gloss)}</p>` : ""}
    <p class="gloss">${fmt(h.question)}</p>
    <div class="qrow"><div class="opts" data-q="${n}">
      ${h.options.map((o, k) => `<button type="button" data-v="${k}">${esc(o)}</button>`).join("")}</div></div>`;

/* Why the option the pupil picked does not fit (issue #28): a builder that
   knows gives `whyNot`, option → reason, and the reason for the one picked
   stands above the rule. */
const whyNotBox = (t, ok) => (!ok && t.whyNot && t.picked && t.whyNot[t.picked]
  ? `<div class="why whynot"><b>af hverju ekki „${esc(t.picked)}“</b>${fmt(t.whyNot[t.picked])}</div>` : "");

RENDER.choice = function (app) {
  const t = app.cur;
  const halves = t.second ? [t, t.second] : [t];
  t.picked = null; t.picked2 = null;
  $("task").innerHTML = `
  <div class="card">
    ${eyebrow(t)}
    ${t.second && t.lead ? `<p class="gloss">${fmt(t.lead)}</p>` : ""}
    ${halves.map((h, n) => (n ? '<hr class="pairrule">' : "") + choiceHalf(h, n)).join("")}
    ${shownNoteHTML(t)}
    <div class="answer"><button class="go" id="check">Athuga</button>${hintButtonHTML(t)}</div>
    <div id="verdict"></div>
  </div>`;
  document.querySelectorAll(".opts").forEach((box) => {
    const n = +box.dataset.q, h = halves[n], slot = n ? "picked2" : "picked";
    box.onclick = (e) => {
      const b = e.target.closest("button");
      if (!b || b.disabled) return;
      box.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b));
      const v = h.options[+b.dataset.v];
      if (t[slot] && t[slot] !== v) t.changes = (t.changes || 0) + 1;
      t[slot] = v;
    };
    /* 1–4 on the keyboard pick an option — on a single question only; with
       two questions on the card the numbers would be ambiguous. */
    if (!t.second) box.addEventListener("keydown", (e) => {
      const k = +e.key;
      if (k >= 1 && k <= h.options.length) box.querySelectorAll("button")[k - 1].click();
    });
  });
  $("check").onclick = () => submitChoice(app);
  wireHint(t, () => redrawSentence(t, questionSentence));
};

function submitChoice(app) {
  const t = app.cur;
  const halves = t.second ? [t, t.second] : [t];
  const j = judge(t, { picked: t.picked, picked2: t.picked2, ...(t.hinted ? { hinted: true } : {}) }, app);
  if (j.pending) {
    $("verdict").innerHTML = `<div class="verdict neutral"><p>${t.second ? "Veldu eitt svar í hvorri setningu." : "Veldu eitt svar."}</p></div>`;
    return;
  }
  t.done = true;
  endHint();
  if (codedOn(t)) redrawSentence(t, questionSentence);
  const ok = j.ok, xp = j.xp;
  document.querySelectorAll(".opts").forEach((box) => {
    const h = halves[+box.dataset.q];
    box.querySelectorAll("button").forEach((b) => {
      b.disabled = true;
      const v = h.options[+b.dataset.v];
      if (v === h.answer) b.classList.add("right");
      else if (b.getAttribute("aria-pressed") === "true") b.classList.add("wrongpick");
      b.removeAttribute("aria-pressed");
    });
  });
  const defs = (t.defs || []).map((e) => `<li><b>${esc(e.o)}</b>: ${esc(e.d)}</li>`).join("");
  /* A pair says, for each sentence, whether it was right and why. */
  const pairBody = () => halves.map((h, n) => {
    const got = n ? t.picked2 : t.picked;
    const line = !h.s ? `<b>${esc(h.answer)}</b>`
      : h.mark || h.i < 0 ? `${sentenceHTML(h.s, -1, "")} — <b>${esc(h.answer)}</b>`
      : sentenceHTML(h.s, h.i, `<b>${esc(h.answer)}</b>`);
    return `<p>${got === h.answer ? "✓" : "✗"} ${line}</p>${whyBox(h.why)}`;
  }).join("");
  conclude(app, t, j, () => {
    $("verdict").innerHTML = `<div class="verdict ${ok ? "ok" : "no"}"><span class="xpop">+${xp} XP</span>
    <h3>${ok ? cheer(CHEERS_OK) : "Ekki alveg"}</h3>
    ${t.second ? pairBody()
      : `${!t.mark && t.s && t.i >= 0 ? solvedSentence(t, t.answer) : `<p>Rétt svar: <span class="forms">${esc(t.answer)}</span>.</p>`}
    ${whyNotBox(t, ok)}${whyBox(t.why)}`}
    ${defs ? `<div class="why"><b>í orðabók</b><ul class="deflist">${defs}</ul></div>` : ""}
    <p class="streakline">Enter fyrir næstu.</p></div>`;
    bonusBox(app, t);
  });
}

/* ================= kenni: sterkt eða veikt nafnorð (item 27) ============
 *
 * The word's singular forms as the lesson writes them (hér er … til …), or
 * only the nominative; from þyngd 5 a box for the genitive (`askGen`). Then
 * sterk / veik. */

RENDER.kenni = function (app) {
  const t = app.cur;
  t.picked = null;
  const forms = t.show.map((x) => `${esc(x.h)} <b>${esc(x.f)}</b>`).join(" · ");
  $("task").innerHTML = `
  <div class="card">
    ${eyebrow(t)}
    <p class="sentence">${forms}${t.askGen ? ` · til <span class="blank">?</span>` : ""}</p>
    <p class="gloss">${fmt(t.question)}</p>
    ${t.askGen ? `<div class="answer">
      <input type="text" id="ans" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="til …">
    </div><div class="keys" id="keys"></div>` : ""}
    <div class="qrow"><div class="opts" data-q="val">
      ${t.options.map((o, k) => `<button type="button" data-v="${k}">${esc(o)}</button>`).join("")}</div></div>
    <div class="answer"><button class="go" id="check">Athuga</button></div>
    <div id="verdict"></div>
  </div>`;
  const box = document.querySelector(".opts");
  box.onclick = (e) => {
    const b = e.target.closest("button");
    if (!b || b.disabled) return;
    box.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b));
    t.picked = t.options[+b.dataset.v];
  };
  box.addEventListener("keydown", (e) => {
    const k = +e.key;
    if (k >= 1 && k <= t.options.length) box.querySelectorAll("button")[k - 1].click();
  });
  if (t.askGen) {
    wireKeys();
    const inp = $("ans");
    inp.focus();
    enterToSubmit(inp, () => submitKenni(app));
  }
  $("check").onclick = () => submitKenni(app);
};

function submitKenni(app) {
  const t = app.cur;
  const typed = t.askGen ? $("ans").value : "";
  const j = judge(t, { picked: t.picked, text: typed }, app);
  if (j.pending) {
    $("verdict").innerHTML = j.verdict === "hedged"
      ? `<div class="verdict neutral"><h3>Veldu eina mynd</h3>
      <p>Þú skrifaðir fleiri en eina mynd (${j.detail.g.hedged.map(esc).join(", ")}). Skrifaðu þá sem þú telur rétta.</p></div>`
      : `<div class="verdict neutral"><p>${j.verdict === "empty"
        ? "Skrifaðu eignarfall eintölu og veldu svo sterk eða veik."
        : "Veldu sterk eða veik."}</p></div>`;
    return;
  }
  const ok = j.ok, xp = j.xp;
  const { v, kindOk, formOk, xpFull } = j.detail;
  document.querySelectorAll(".opts button").forEach((b) => {
    b.disabled = true;
    const val = t.options[+b.dataset.v];
    if (val === t.answer) b.classList.add("right");
    else if (b.getAttribute("aria-pressed") === "true") b.classList.add("wrongpick");
    b.removeAttribute("aria-pressed");
  });
  if (t.askGen) $("ans").disabled = true;
  const gen = t.gen.map(esc).join(" / ");
  const said = t.askGen && !formOk
    ? `<p>Þú skrifaðir <span class="forms">til ${esc(j.detail.typed)}</span>. Rétt er <span class="forms">til ${gen}</span>.</p>` : "";
  conclude(app, t, j, () => {
    $("verdict").innerHTML = `<div class="verdict ${ok ? (v && v.slip ? v.klass : "ok") : "no"}"><span class="xpop">+${xp} XP</span>
    <h3>${ok ? cheer(CHEERS_OK) : !kindOk ? "Ekki alveg" : "Beygingin rétt, eignarfallið ekki"}</h3>
    <p><span class="forms">til ${gen}</span> · beygingin er <b>${esc(t.answer)}</b>.</p>
    ${said}${ok ? slipNote(v && v.slip, xp, xpFull) : nearNote(v)}${whyBox(t.why)}
    <p class="streakline">Enter fyrir næstu.</p></div>`;
  });
}

/* ================= slots: forms in boxes, perhaps a pick (item 27) ========
 *
 * Sterk eða veik sögn and the boðháttur. What is shown of the word, then one
 * box per form asked (the words around a box as the lesson says them: *í gær
 * … ég*), then sterk / veik when the task has options. The boxes are the
 * paradigm table's (`table.decl`), so they keep its layout on a phone. */

RENDER.slots = function (app) {
  const t = app.cur;
  t.picked = null;
  const shown = t.show.map((x) => `${x.h ? esc(x.h) + " " : ""}<b>${esc(x.f)}</b>`).join(" · ");
  const rows = (t.slots || []).map((sl, k) => `<tr><th class="rowh">${esc(sl.h)}${
    sl.hint ? ` <span>(${esc(sl.hint)})</span>` : ""}</th>
      <td><div class="cellrow"><input type="text" data-k="${k}" aria-label="${esc(sl.h)}" autocomplete="off" autocapitalize="off" spellcheck="false">${
        sl.after ? `<span class="helpernoun">${esc(sl.after)}</span>` : ""}</div>
      <span class="fix" data-fix="${k}"></span></td></tr>`).join("");
  $("task").innerHTML = `
  <div class="card">
    ${eyebrow(t)}
    <p class="sentence">${shown}</p>
    <p class="gloss">${fmt(t.question)}</p>
    ${rows ? `<table class="decl slotbox">${rows}</table><div class="keys" id="keys"></div>` : ""}
    ${t.options ? `<div class="qrow"><div class="opts" data-q="val">
      ${t.options.map((o, k) => `<button type="button" data-v="${k}">${esc(o)}</button>`).join("")}</div></div>` : ""}
    <div class="answer"><button class="go" id="check">Athuga</button></div>
    <div id="verdict"></div>
  </div>`;
  const box = document.querySelector("#task .opts");
  if (box) {
    box.onclick = (e) => {
      const b = e.target.closest("button");
      if (!b || b.disabled) return;
      box.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b));
      t.picked = t.options[+b.dataset.v];
    };
    box.addEventListener("keydown", (e) => {
      const k = +e.key;
      if (k >= 1 && k <= t.options.length) box.querySelectorAll("button")[k - 1].click();
    });
  }
  const ins = [...document.querySelectorAll("table.slotbox input")];
  if (ins.length) {
    wireKeys();
    ins[0].focus();
    /* Enter goes to the next box, and from the last one checks the answer
       (or, with options still to pick, waits for the pick). */
    ins.forEach((el, k) => el.addEventListener("keydown", (e) => {
      if (!freshEnter(e)) return;
      e.preventDefault();
      if (k + 1 < ins.length) ins[k + 1].focus();
      else submitSlots(app);
    }));
  }
  $("check").onclick = () => submitSlots(app);
};

function submitSlots(app) {
  const t = app.cur;
  if (t.done) return;
  const ins = [...document.querySelectorAll("table.slotbox input")];
  const response = { picked: t.picked, texts: ins.map((el) => el.value) };
  const j = judgeTry(app, t, response);
  if (j.verdict === "same") return say(t, SAME_AGAIN);
  if (j.pending) {
    const at = j.detail && j.detail.at;
    if (at != null && ins[at]) ins[at].focus();
    say(t, j.verdict === "hedged"
      ? `<b>Veldu eina mynd.</b> Þú skrifaðir fleiri en eina mynd (${j.detail.g.hedged.map(esc).join(", ")}). Skrifaðu þá sem þú telur rétta.`
      : j.verdict === "empty" ? "Skrifaðu í alla reitina."
      : `Veldu ${t.options.map(esc).join(" eða ")}.`);
    return;
  }
  if (j.ok === false)
    (t.tries ||= []).push(j.detail.items.filter((x) => !x.ok).map((x) => x.typed).join(" · "));
  const draw = () => drawSlots(app, t, j, ins);
  if (t.retrying) return endRetry(app, t, j, draw);
  /* Item 42 (the boðháttur only: `retryAllowed`). The wrong box takes the
     focus; which box was wrong is not marked, as no answer is. */
  const items = j.detail.items;
  const near = items.map((it) => it.v).find((v) => v && v.near) || null;
  if (offerRetry(app, t, j, {
    response, note: nearNote(near), reveal: draw,
    inputs: [...ins.filter((_, k) => !items[k].ok), ...ins.filter((_, k) => items[k].ok)],
  })) return;
  conclude(app, t, j, draw);
}

function drawSlots(app, t, j, ins) {
  t.done = true;
  const ok = j.ok, xp = j.xp;
  const { items, kindOk, formsOk, xpFull, slip } = j.detail;
  ins.forEach((el, k) => {
    const it = items[k];
    el.classList.add(it.ok ? "ok" : "no");
    el.disabled = true;
    if (!it.ok) document.querySelector(`[data-fix="${k}"]`).textContent = it.accepted.join(" / ");
  });
  document.querySelectorAll("#task .opts button").forEach((b) => {
    b.disabled = true;
    const val = t.options[+b.dataset.v];
    if (val === t.answer) b.classList.add("right");
    else if (b.getAttribute("aria-pressed") === "true") b.classList.add("wrongpick");
    b.removeAttribute("aria-pressed");
  });
  const solution = (t.solution || []).map((x) => `${x.h ? esc(x.h) + " " : ""}<span class="forms">${esc(x.f)}</span>`).join(" · ");
  const head = ok ? cheer(CHEERS_OK)
    : !t.options || (!kindOk && !formsOk) ? "Ekki alveg"
    : !kindOk ? `Rétt skrifað, en sögnin er ${esc(t.answer)}`
    : "Rétt valið, en athugaðu myndirnar";
  const near = items.map((it) => it.v).find((v) => v && v.near) || null;
  /* After a second try, what the pupil wrote first, beside the boxes that
     now show the second try and the right forms. */
  const first = t.retried && (t.tries || []).length && (ok || t.tries.length > 1)
    ? `<p>Fyrst skrifaðir þú <span class="forms">${esc(t.tries[0])}</span>.</p>` : "";
  $("verdict").innerHTML = `<div class="verdict ${ok ? (slip ? slip.klass : "ok") : "no"}">${
    ok && j.retry ? retryRightHTML(xp) : `<span class="xpop">+${xp} XP</span>
  <h3>${head}</h3>`}
  <p>${solution}${t.options ? ` · sögnin er <b>${esc(t.answer)}</b>` : ""}.</p>
  ${first}
  ${ok ? slipNote(slip && slip.slip, xp, j.retry ? xp : xpFull) : nearNote(near)}${whyBox(t.why)}
  ${ok && j.retry ? RETRY_STILL_MISS : ""}
  <p class="streakline">Enter fyrir næstu.</p></div>`;
}

/* ================= tap ================================================== */

/* The words of a tap question, clickable; with the structure drawn when the
   question has it (item 26: lid_finna). */
const tapWord = (tok, j) => `<span class="pickw" data-j="${j}" role="button" tabindex="0" aria-pressed="false">${esc(tok.w)}</span>`;
const tapSentence = (t) => {
  const coded = codedHTML(t, tapWord);
  return `<p class="sentence${coded != null ? " coded" : ""}" id="picker">${coded != null ? coded
    : t.s.tok.map((tok, j) => PUNCT.has(tok.w) ? tok.w : `${j ? " " : ""}${tapWord(tok, j)}`).join("")}</p>`;
};

function wireTap(t) {
  document.querySelectorAll(".pickw").forEach((el) => {
    const j = +el.dataset.j;
    el.classList.toggle("sel", t.sel.has(j));
    el.setAttribute("aria-pressed", t.sel.has(j));
    const toggle = () => {
      if (t.done) return;
      if (t.sel.has(j)) t.sel.delete(j); else t.sel.add(j);
      el.classList.toggle("sel", t.sel.has(j));
      el.setAttribute("aria-pressed", t.sel.has(j));
    };
    el.onclick = toggle;
    el.onkeydown = (e) => { if (e.key === " ") { e.preventDefault(); toggle(); } };
  });
}

RENDER.tap = function (app) {
  const t = app.cur;
  t.sel = new Set();
  $("task").innerHTML = `
  <div class="card">
    ${eyebrow(t)}
    ${tapSentence(t)}
    ${shownNoteHTML(t)}
    <p class="gloss">${fmt(t.question)}</p>
    <div class="answer"><button class="go" id="check">Athuga</button>${hintButtonHTML(t)}</div>
    <div id="verdict"></div>
  </div>`;
  wireTap(t);
  $("check").onclick = () => submitTap(app);
  wireHint(t, () => { redrawSentence(t, tapSentence); wireTap(t); });
};

function submitTap(app) {
  const t = app.cur;
  const jd = judge(t, { sel: [...t.sel], ...(t.hinted ? { hinted: true } : {}) }, app);
  if (jd.pending) {
    $("verdict").innerHTML = `<div class="verdict neutral"><p>Smelltu á að minnsta kosti eitt orð.</p></div>`;
    return;
  }
  const want = new Set(t.targets);
  const { extra, missed } = jd.detail;
  const ok = jd.ok, xp = jd.xp;
  t.done = true;
  endHint();
  if (codedOn(t)) redrawSentence(t, tapSentence);
  document.querySelectorAll(".pickw").forEach((el) => {
    const j = +el.dataset.j;
    el.classList.remove("sel");
    if (want.has(j)) el.classList.add(t.sel.has(j) ? "right" : "missed");
    else if (t.sel.has(j)) el.classList.add("wrongpick");
  });
  const words = (js) => js.map((j) => `<span class="forms">${esc(t.s.tok[j].w)}</span>`).join(", ");
  /* `what`: the heading over the right words, where the name of the class
     does not take the article *-in* (item 28: *forsetningarliðurinn*). */
  const what = t.what || (t.whole ? `${t.cls}in` : `${t.cls}${t.targets.length > 1 ? "" : ""}`);
  conclude(app, t, jd, () => {
    $("verdict").innerHTML = `<div class="verdict ${ok ? "ok" : "no"}"><span class="xpop">+${xp} XP</span>
    <h3>${ok ? cheer(CHEERS_OK) : "Ekki alveg"}</h3>
    <p>${t.whole ? `${esc(what.charAt(0).toUpperCase() + what.slice(1))}: ${words(t.targets)}.`
      : `${t.targets.length === 1 ? "Rétt orð" : "Réttu orðin"} (${esc(t.cls)}): ${words(t.targets)}.`}</p>
    ${missed.length ? `<p>Þú misstir af: ${words(missed)}.</p>` : ""}
    ${extra.length ? `<p>Ekki ${esc(t.cls)}: ${words(extra)}${t.whole ? "" : ` — ${extra.map((j) => `*${t.s.tok[j].w}* er ${t.s.tok[j].c || "?"}`).map(fmt).join(", ")}`}.</p>` : ""}
    ${whyBox(t.why)}
    <p class="streakline">Enter fyrir næstu.</p></div>`;
  });
}

/* ================= sort ================================================= */

const sortSentence = (t) => {
  if (!t.s) return "";
  const coded = codedHTML(t, pointedWord(t));
  if (coded != null) return `<p class="sentence coded">${coded}</p>`;
  /* The words to sort are what the question is about: never glossed. The
     rest carry the second-language gloss like any sentence (item 45). */
  const marked = new Set((t.items || []).map((x) => x.j).filter((j) => j != null));
  return `<p class="sentence">${t.s.tok.map((tok, j) => PUNCT.has(tok.w) ? tok.w
    : `${j ? " " : ""}${marked.has(j) ? `<span class="target">${esc(tok.w)}</span>` : wordHTML(tok)}`).join("")}</p>`;
};

RENDER.sort = function (app) {
  const t = app.cur;
  t.picks = {};
  $("task").innerHTML = `
  <div class="card">
    ${eyebrow(t)}
    ${sortSentence(t)}
    ${shownNoteHTML(t)}
    <p class="gloss">${fmt(t.question)}</p>
    <div class="sortrows">${t.items.map((it, k) => `<div class="sortrow"><span class="sortw forms">${esc(it.w)}</span>
      <div class="opts" data-q="${k}">${t.buckets.map((b) => `<button type="button" data-v="${esc(b)}">${esc(b)}</button>`).join("")}</div></div>`).join("")}</div>
    <div class="answer"><button class="go" id="check">Athuga</button>${hintButtonHTML(t)}</div>
    <div id="verdict"></div>
  </div>`;
  document.querySelectorAll(".sortrow .opts").forEach((box) => {
    box.onclick = (e) => {
      const b = e.target.closest("button");
      if (!b || b.disabled) return;
      box.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b));
      t.picks[box.dataset.q] = b.dataset.v;
    };
  });
  $("check").onclick = () => submitSort(app);
  wireHint(t, () => redrawSentence(t, sortSentence));
};

function submitSort(app) {
  const t = app.cur;
  const j = judge(t, { picks: t.picks, ...(t.hinted ? { hinted: true } : {}) }, app);
  if (j.pending) {
    $("verdict").innerHTML = `<div class="verdict neutral"><p>Settu hvert orð í flokk fyrst.</p></div>`;
    return;
  }
  t.done = true;
  endHint();
  if (codedOn(t)) redrawSentence(t, sortSentence);
  const { good, wrong } = j.detail;
  const ok = j.ok, xp = j.xp;
  document.querySelectorAll(".sortrow .opts").forEach((box) => {
    const it = t.items[+box.dataset.q];
    box.querySelectorAll("button").forEach((b) => {
      b.disabled = true;
      if (b.dataset.v === it.cls) b.classList.add("right");
      else if (b.getAttribute("aria-pressed") === "true") b.classList.add("wrongpick");
      b.removeAttribute("aria-pressed");
    });
  });
  conclude(app, t, j, () => {
    $("verdict").innerHTML = `<div class="verdict ${ok ? "ok" : "no"}"><span class="xpop">+${xp} XP</span>
    <h3>${ok ? cheer(CHEERS_OK) : `${good} af ${t.items.length} rétt`}</h3>
    ${wrong.length ? `<ul class="exlist">${wrong.map((x) => `<li><span class="forms">${esc(x.it.w)}</span> er <b>${esc(x.it.cls)}</b>, ekki ${esc(x.said)}.</li>`).join("")}</ul>` : ""}
    <p class="streakline">Enter fyrir næstu.</p></div>`;
  });
}

/* ================= Orðaforði: the bonus sentence =========================
 *
 * v6.11: the free-text sentence is no longer a question of its own in a
 * session. After a graded Orðaforði question the child MAY write a sentence
 * with the word. Whether it earns the bonus (`bonusVerdict`) and what the
 * bonus is are decided in core/answer.js; skipping costs nothing: Enter on
 * Áfram goes on as always. */

/* Moved to core/answer.js in v6.13; exported from here too for the tests. */
export { bonusVerdict, BONUS_XP };

function bonusBox(app, t) {
  const e = t.bonus;
  if (!e || t.duel || t.drill || t.skill !== "ordaford") return;
  const v = $("verdict");
  if (!v) return;
  v.insertAdjacentHTML("beforeend", `<div class="bonus" id="bonus">
    <h4>⭐ Bónus — valfrjálst</h4>
    <p>Skrifaðu þína eigin setningu með orðinu <b>${esc(e.o)}</b>. Ef orðið er í setningunni og hún er ný færðu ${BONUS_XP}+ XP. Þú mátt líka sleppa þessu.</p>
    <textarea id="bonustext" rows="2" placeholder="Setning með orðinu ${esc(e.o)}…"></textarea>
    <div class="answer"><button type="button" class="ghost" id="bonusgo">Senda bónus</button></div>
    <div id="bonusverdict"></div></div>`);
  const send = () => {
    const ta = $("bonustext");
    if (!ta || ta.disabled || !ta.value.trim()) return;
    const j = judgeBonus(t, ta.value, app);
    if (j.pending) {
      $("bonusverdict").innerHTML = `<p class="streakline">${fmt(j.detail.why)}</p>`;
      return;
    }
    /* Not a question, so no `conclude`: the question above has ended. */
    settle(app.S, app.sess, t, j);
    const xp = j.xp;
    ta.disabled = true;
    $("bonusgo").disabled = true;
    $("bonusverdict").innerHTML = `<p><span class="xpop">+${xp} XP</span> Flott setning!</p>`;
    app.save();
    app.refresh();
    const go = $("check");
    if (go) go.focus();
  };
  $("bonusgo").onclick = send;
  $("bonustext").addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); send(); }
  });
}
