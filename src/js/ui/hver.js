/* „Hver gerði hvað?“ (issue 27): the renderer of the `hver` shape.

   A sentence, a question about it (*Hver beit?*, *Hver var bitinn?*) and one
   pick among the nouns of the sentence and "Það kemur ekki fram". The builder
   is tasks/setningafraedi.js `whoDid`; the judge is core/answer.js
   `JUDGES.hver`. Same contract as ui/render.js: RENDER.hver draws, `submit`
   collects the pick, has `judge` decide and hands the judgement to `conclude`.

   The scaffold is the structure of the sentence (core/structure.js): frumlag,
   umsögn, andlag, forsetningarliður and the box round a tilvísunarsetning. It
   follows the rule of every Setningafræði question (core/hint.js, ui/hint.js):
   the builder planned it as `t.coding` — shown from the start at a low þyngd,
   behind "Vísbending" for half the XP in the middle, absent above. After the
   answer the whole structure is drawn at every þyngd, with the explanation:
   it can no longer give anything away. The marks are the GRAMMATICAL parts:
   in a passive the frumlag is the one it was done to, and seeing that is
   what the explanation builds on.

   This file is on its own, and not in ui/render.js or ui/render-more.js, so
   that work on the other Setningafræði renderers (issue 26) does not meet it. */

import { RENDER, whyBox, conclude, skillTag, PUNCT } from "./render.js";
import { judge } from "../core/answer.js";
import { structureHTML } from "./structure.js";
import { codedHTML, hintButtonHTML, wireHint, endHint } from "./hint.js";
import { $, esc, fmt, cheer, CHEERS_OK } from "./dom.js";

/* What is shown is the grammar; what is asked is who did it. Said with the
   marks, so that "frumlag" is not read as "the one who did it". */
const REMINDER = "Mundu: frumlagið er ekki alltaf sá sem gerir.";
const SHOWN = "Bygging málsgreinarinnar er sýnd: hver hluti hefur sinn lit, sína línu og sitt heiti. " + REMINDER;

/** The sentence, the verb asked about in bold; with its structure where the
    hint is on (ui/hint.js `codedOn`), and always once the answer is in. */
export function hverSentenceHTML(t) {
  const word = (tok, j) => (t.verb.includes(j) ? `<b>${esc(tok.w)}</b>` : esc(tok.w));
  if (t.done) return { coded: true, html: structureHTML(t.s, { word }) };
  const coded = codedHTML(t, word);
  return coded != null ? { coded: true, html: coded }
    : { coded: false, html: t.s.tok.map((tok, j) => (PUNCT.has(tok.w) ? esc(tok.w) : (j ? " " : "") + word(tok, j))).join("") };
}

function drawSentence(t) {
  const el = $("hversent");
  const { coded, html } = hverSentenceHTML(t);
  el.classList.toggle("coded", coded);
  el.innerHTML = html;
}

RENDER.hver = function (app) {
  const t = app.cur;
  t.picked = null;
  $("task").innerHTML = `
  <div class="card">
    <p class="eyebrow"><span>${esc(t.title)}</span>${skillTag(t)}<b>þyngd ${t.lvl}</b></p>
    <p class="sentence" id="hversent"></p>
    ${t.coding && t.coding.step === "shown" ? `<p class="gloss codednote">${SHOWN}</p>` : ""}
    <p class="gloss" id="hverq">${fmt("**" + t.question + "**")}</p>
    <div class="qrow"><div class="opts" id="hveropts">
      ${t.options.map((o, k) => `<button type="button" data-v="${k}">${esc(o)}</button>`).join("")}</div></div>
    <div class="answer"><button class="go" id="check">Athuga</button>${hintButtonHTML(t)}</div>
    <div id="verdict"></div>
  </div>`;
  drawSentence(t);
  const box = $("hveropts");
  box.onclick = (e) => {
    const b = e.target.closest("button");
    if (!b || b.disabled) return;
    box.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b));
    t.picked = t.options[+b.dataset.v];
  };
  /* 1–4 on the keyboard pick an option. */
  box.addEventListener("keydown", (e) => {
    const k = +e.key;
    if (k >= 1 && k <= t.options.length) box.querySelectorAll("button")[k - 1].click();
  });
  $("check").onclick = () => submitHver(app);
  wireHint(t, () => drawSentence(t), "Nú er bygging málsgreinarinnar sýnd: hver hluti hefur sinn lit, sína línu og sitt heiti. "
    + "Aðeins það sem er öruggt er merkt. " + REMINDER);
};

function submitHver(app) {
  const t = app.cur;
  const j = judge(t, { picked: t.picked, hinted: !!t.hinted }, app);
  if (j.pending) {
    $("verdict").innerHTML = `<div class="verdict neutral"><p>Veldu eitt svar.</p></div>`;
    return;
  }
  const ok = j.ok, xp = j.xp;
  $("hveropts").querySelectorAll("button").forEach((b) => {
    b.disabled = true;
    const v = t.options[+b.dataset.v];
    if (v === t.answer) b.classList.add("right");
    else if (b.getAttribute("aria-pressed") === "true") b.classList.add("wrongpick");
    b.removeAttribute("aria-pressed");
  });
  endHint();
  conclude(app, t, j, () => {
    t.done = true;
    /* the structure is shown with the explanation, whatever it was before */
    drawSentence(t);
    $("verdict").innerHTML = `<div class="verdict ${ok ? "ok" : "no"}"><span class="xpop">+${xp} XP</span>
    <h3>${ok ? cheer(CHEERS_OK) : "Ekki alveg"}</h3>
    <p>${esc(t.question)} <span class="forms">${esc(t.answer)}</span>.</p>
    ${whyBox(t.why)}
    <p class="streakline">Enter fyrir næstu.</p></div>`;
  });
}
