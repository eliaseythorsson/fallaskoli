/* Renderers for the v6.11 question shapes (tasks/more.js): gap, choice,
   tap and sort — and the optional Orðaforði bonus sentence.

   Same contract as ui/render.js: RENDER.x draws, submitX grades, records
   once, and ends in app.finish({ correct, resp }). `resp` is what the error
   diagnosis reads (core/diagnosis.js). */

import { RENDER, sentenceHTML, whyBox, spend, xpFor, enterToSubmit, skillTag, slipNote,
         nearNote, multLine, PUNCT } from "./render.js";
import { gradeForm, normalise } from "../core/grading.js";
import { verdictOf } from "../core/leniency.js";
import { record, answerShape, dayStreak } from "../core/state.js";
import { dayMult } from "../core/progress.js";
import { bumpDiff } from "../core/difficulty.js";
import { $, esc, fmt, wireKeys, cheer, CHEERS_OK, CHEERS_NO } from "./dom.js";

const eyebrow = (t) =>
  `<p class="eyebrow"><span>${esc(t.title)}</span>${skillTag(t)}<b>þyngd ${t.lvl}</b></p>`;

/** The blank, with its cue in brackets: ___ (hún) */
const blankHTML = (t) =>
  `<span class="blank">?</span>${t.cue ? ` <span class="cue">(${esc(t.cue)})</span>` : ""}`;

function questionSentence(t) {
  if (!t.s) return "";
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

/** A verdict for a gap without a BÍN mark (word formation): right, an
    accent forgiven, or wrong. */
function plainVerdict(g) {
  if (g.verdict === "correct") return { ok: true, factor: 1, klass: "ok", slip: null, near: null };
  if (g.verdict === "accents") return { ok: true, factor: 0.95, klass: "near", near: null,
    slip: { id: "accents", head: "Rétt — en gáðu að broddunum", note: "Svarið er rétt en það vantar brodd (eða einum er ofaukið)." } };
  return { ok: false, factor: 0, klass: "no", slip: null, near: null };
}

function submitGap(app) {
  const t = app.cur;
  const val = $("ans").value;
  const g = gradeForm(val, { accepted: t.answers, paradigm: t.paradigm });
  if (g.verdict === "empty") return;
  if (g.verdict === "hedged") {
    $("verdict").innerHTML = `<div class="verdict neutral"><h3>Veldu eina mynd</h3>
      <p>Þú skrifaðir fleiri en eina mynd (${g.hedged.map(esc).join(", ")}). Skrifaðu þá sem þú telur rétta.</p></div>`;
    return;
  }
  const v = t.m ? verdictOf(g, t.m) : plainVerdict(g);
  const ok = v.ok;
  const xpFull = xpFor(app, t, { ok, hinted: !!t.hinted });
  const xp = xpFor(app, t, { ok, hinted: !!t.hinted, factor: v.factor });
  const shape = answerShape(val);
  const took = spend(app);
  record(app.S, app.sess, { skill: t.skill, cell: t.cell, word: t.word, ok, xp, ms: took, answer: shape, hinted: !!t.hinted });
  if (t.tip) $("hint").disabled = true;
  bumpDiff(app.sess, app.S, t.skill, ok);

  /* Tvær buxur for tvennar buxur: the one mistake this question is about. */
  const plain = !ok && t.plain && t.plain.some((f) => normalise(f) === normalise(val));
  const right = t.answers.slice(0, 2).map(esc).join(" / ");
  const solved = solvedSentence(t, t.answers[0]);
  $("verdict").innerHTML = ok
    ? `<div class="verdict ${v.klass}"><span class="xpop">+${xp} XP</span>
      <h3>${v.slip ? esc(v.slip.head) : cheer(CHEERS_OK)}</h3>${solved}
      ${v.slip ? `<p>Þú skrifaðir <span class="forms">${esc(val.trim())}</span>. Rétt er <span class="forms">${right}</span>.</p>` : ""}
      ${slipNote(v.slip, xp, xpFull)}${whyBox(t.why)}
      <p class="streakline">${app.S.run} í röð${multLine(app, xp)}. Enter fyrir næstu.</p></div>`
    : `<div class="verdict no"><h3>${cheer(CHEERS_NO)}</h3>
      <p>Þú skrifaðir <span class="forms">${esc(val.trim())}</span>. Rétt er <span class="forms">${right}</span>.</p>
      ${plain ? `<div class="why"><b>athugið</b>${fmt(`*${t.answers[0]}* — ekki *${val.trim()}*: orðið á eftir er aðeins til í fleirtölu.`)}</div>` : ""}
      ${nearNote(v)}${solved}${whyBox(t.why)}
      <p class="streakline">Enter fyrir næstu.</p></div>`;
  $("ans").disabled = true;
  bonusBox(app, t);
  const also = ok ? [] : [...(t.missOther || []), ...(plain ? ["fleirtoluord"] : [])];
  app.finish({ correct: ok, answer: ok ? shape : null, answerMs: ok ? took : 0, slip: ok && !!v.slip,
    resp: t.m
      ? { kind: "form", items: [{ m: t.m, typed: val, g, accepted: t.answers }], also, ex: { said: val.trim(), right: t.answers[0] } }
      : { kind: "patterns", ids: also, ex: { said: val.trim(), right: t.answers[0] } } });
}

/* ================= choice =============================================== */

RENDER.choice = function (app) {
  const t = app.cur;
  t.picked = null;
  $("task").innerHTML = `
  <div class="card">
    ${eyebrow(t)}
    ${questionSentence(t)}
    ${t.gloss ? `<p class="gloss choicegloss">💬 ${fmt(t.gloss)}</p>` : ""}
    <p class="gloss">${fmt(t.question)}</p>
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
    const v = t.options[+b.dataset.v];
    if (t.picked && t.picked !== v) t.changes = (t.changes || 0) + 1;
    t.picked = v;
  };
  /* 1–4 on the keyboard pick an option. */
  box.addEventListener("keydown", (e) => {
    const k = +e.key;
    if (k >= 1 && k <= t.options.length) box.querySelectorAll("button")[k - 1].click();
  });
  $("check").onclick = () => submitChoice(app);
};

function submitChoice(app) {
  const t = app.cur;
  if (t.picked == null) {
    $("verdict").innerHTML = `<div class="verdict neutral"><p>Veldu eitt svar.</p></div>`;
    return;
  }
  const ok = t.picked === t.answer;
  document.querySelectorAll(".opts button").forEach((b) => {
    b.disabled = true;
    const v = t.options[+b.dataset.v];
    if (v === t.answer) b.classList.add("right");
    else if (b.getAttribute("aria-pressed") === "true") b.classList.add("wrongpick");
    b.removeAttribute("aria-pressed");
  });
  const xp = xpFor(app, t, { ok });
  record(app.S, app.sess, { skill: t.skill, cell: t.cell, word: t.word, ok, xp, ms: spend(app) });
  bumpDiff(app.sess, app.S, t.skill, ok);
  const defs = (t.defs || []).map((e) => `<li><b>${esc(e.o)}</b>: ${esc(e.d)}</li>`).join("");
  $("verdict").innerHTML = `<div class="verdict ${ok ? "ok" : "no"}"><span class="xpop">+${xp} XP</span>
    <h3>${ok ? cheer(CHEERS_OK) : "Ekki alveg"}</h3>
    ${!t.mark && t.s && t.i >= 0 ? solvedSentence(t, t.answer) : `<p>Rétt svar: <span class="forms">${esc(t.answer)}</span>.</p>`}
    ${whyBox(t.why)}
    ${defs ? `<div class="why"><b>í orðabók</b><ul class="deflist">${defs}</ul></div>` : ""}
    <p class="streakline">Enter fyrir næstu.</p></div>`;
  bonusBox(app, t);
  const ex = { said: t.picked, right: t.answer };
  const also = ok ? [] : (t.miss || []);
  let resp = { kind: "patterns", ids: also, ex };
  if (t.m && t.paradigm) {
    const g = gradeForm(t.picked, { accepted: [t.answer], paradigm: t.paradigm, allowHelpers: false });
    /* The options say which cell was meant: *borðið* offered against
       *borðinu* is the accusative, not the nominative it also is. */
    if (t.optMarks && g.otherMarks) {
      const only = g.otherMarks.filter((m) => t.optMarks.includes(m));
      if (only.length) g.otherMarks = only;
    }
    resp = { kind: "form", items: [{ m: t.m, typed: t.picked, accepted: [t.answer], g }], also, ex };
  }
  app.finish({ correct: ok, resp });
}

/* ================= tap ================================================== */

RENDER.tap = function (app) {
  const t = app.cur;
  t.sel = new Set();
  $("task").innerHTML = `
  <div class="card">
    ${eyebrow(t)}
    <p class="sentence" id="picker">${t.s.tok.map((tok, j) => PUNCT.has(tok.w) ? tok.w
      : `${j ? " " : ""}<span class="pickw" data-j="${j}" role="button" tabindex="0" aria-pressed="false">${esc(tok.w)}</span>`).join("")}</p>
    <p class="gloss">${fmt(t.question)}</p>
    <div class="answer"><button class="go" id="check">Athuga</button></div>
    <div id="verdict"></div>
  </div>`;
  document.querySelectorAll(".pickw").forEach((el) => {
    const toggle = () => {
      if (t.done) return;
      const j = +el.dataset.j;
      if (t.sel.has(j)) t.sel.delete(j); else t.sel.add(j);
      el.classList.toggle("sel", t.sel.has(j));
      el.setAttribute("aria-pressed", t.sel.has(j));
    };
    el.onclick = toggle;
    el.onkeydown = (e) => { if (e.key === " ") { e.preventDefault(); toggle(); } };
  });
  $("check").onclick = () => submitTap(app);
};

function submitTap(app) {
  const t = app.cur;
  if (!t.sel.size) {
    $("verdict").innerHTML = `<div class="verdict neutral"><p>Smelltu á að minnsta kosti eitt orð.</p></div>`;
    return;
  }
  const want = new Set(t.targets);
  const extra = [...t.sel].filter((j) => !want.has(j));
  const missed = t.targets.filter((j) => !t.sel.has(j));
  const ok = !extra.length && !missed.length;
  t.done = true;
  document.querySelectorAll(".pickw").forEach((el) => {
    const j = +el.dataset.j;
    el.classList.remove("sel");
    if (want.has(j)) el.classList.add(t.sel.has(j) ? "right" : "missed");
    else if (t.sel.has(j)) el.classList.add("wrongpick");
  });
  const xp = xpFor(app, t, { ok });
  record(app.S, app.sess, { skill: t.skill, cell: t.cell, ok, xp, ms: spend(app) });
  bumpDiff(app.sess, app.S, t.skill, ok);
  const words = (js) => js.map((j) => `<span class="forms">${esc(t.s.tok[j].w)}</span>`).join(", ");
  const what = t.whole ? `${t.cls}in` : `${t.cls}${t.targets.length > 1 ? "" : ""}`;
  $("verdict").innerHTML = `<div class="verdict ${ok ? "ok" : "no"}"><span class="xpop">+${xp} XP</span>
    <h3>${ok ? cheer(CHEERS_OK) : "Ekki alveg"}</h3>
    <p>${t.whole ? `${esc(what.charAt(0).toUpperCase() + what.slice(1))}: ${words(t.targets)}.`
      : `${t.targets.length === 1 ? "Rétt orð" : "Réttu orðin"} (${esc(t.cls)}): ${words(t.targets)}.`}</p>
    ${missed.length ? `<p>Þú misstir af: ${words(missed)}.</p>` : ""}
    ${extra.length ? `<p>Ekki ${esc(t.cls)}: ${words(extra)}${t.whole ? "" : ` — ${extra.map((j) => `*${t.s.tok[j].w}* er ${t.s.tok[j].c || "?"}`).map(fmt).join(", ")}`}.</p>` : ""}
    <p class="streakline">Enter fyrir næstu.</p></div>`;
  const ids = ok ? [] : t.tags.includes("clause") ? ["setningagerd"]
    : (["atviksorð", "forsetning"].includes(t.cls) && [...extra, ...missed].some((j) => ["atviksorð", "forsetning"].includes(t.s.tok[j].c))
      ? ["ao_fs"] : ["ordflokkur"]);
  app.finish({ correct: ok, resp: { kind: "patterns", ids,
    ex: { said: [...t.sel].sort((a, b) => a - b).map((j) => t.s.tok[j].w).join(", "),
          right: t.targets.map((j) => t.s.tok[j].w).join(", ") } } });
}

/* ================= sort ================================================= */

RENDER.sort = function (app) {
  const t = app.cur;
  t.picks = {};
  const marked = new Set((t.items || []).map((x) => x.j).filter((j) => j != null));
  const sent = t.s ? `<p class="sentence">${t.s.tok.map((tok, j) => PUNCT.has(tok.w) ? tok.w
    : `${j ? " " : ""}${marked.has(j) ? `<span class="target">${esc(tok.w)}</span>` : esc(tok.w)}`).join("")}</p>` : "";
  $("task").innerHTML = `
  <div class="card">
    ${eyebrow(t)}
    ${sent}
    <p class="gloss">${fmt(t.question)}</p>
    <div class="sortrows">${t.items.map((it, k) => `<div class="sortrow"><span class="sortw forms">${esc(it.w)}</span>
      <div class="opts" data-q="${k}">${t.buckets.map((b) => `<button type="button" data-v="${esc(b)}">${esc(b)}</button>`).join("")}</div></div>`).join("")}</div>
    <div class="answer"><button class="go" id="check">Athuga</button></div>
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
};

function submitSort(app) {
  const t = app.cur;
  if (t.items.some((_, k) => !t.picks[k])) {
    $("verdict").innerHTML = `<div class="verdict neutral"><p>Settu hvert orð í flokk fyrst.</p></div>`;
    return;
  }
  let good = 0;
  const wrong = [];
  document.querySelectorAll(".sortrow .opts").forEach((box) => {
    const k = +box.dataset.q;
    const it = t.items[k];
    box.querySelectorAll("button").forEach((b) => {
      b.disabled = true;
      if (b.dataset.v === it.cls) b.classList.add("right");
      else if (b.getAttribute("aria-pressed") === "true") b.classList.add("wrongpick");
      b.removeAttribute("aria-pressed");
    });
    if (t.picks[k] === it.cls) good++; else wrong.push({ it, said: t.picks[k] });
  });
  const ok = !wrong.length;
  const xp = xpFor(app, t, { ok });
  record(app.S, app.sess, { skill: t.skill, cell: t.cell, ok, xp, ms: spend(app) });
  bumpDiff(app.sess, app.S, t.skill, ok);
  $("verdict").innerHTML = `<div class="verdict ${ok ? "ok" : "no"}"><span class="xpop">+${xp} XP</span>
    <h3>${ok ? cheer(CHEERS_OK) : `${good} af ${t.items.length} rétt`}</h3>
    ${wrong.length ? `<ul class="exlist">${wrong.map((x) => `<li><span class="forms">${esc(x.it.w)}</span> er <b>${esc(x.it.cls)}</b>, ekki ${esc(x.said)}.</li>`).join("")}</ul>` : ""}
    <p class="streakline">Enter fyrir næstu.</p></div>`;
  const roles = t.tags.includes("syn");
  const ids = ok ? [] : roles ? ["setningalidir"]
    : wrong.some((x) => ["atviksorð", "forsetning"].includes(x.it.cls) && ["atviksorð", "forsetning"].includes(x.said))
      ? ["ao_fs"] : ["ordflokkur"];
  app.finish({ correct: ok, resp: { kind: "patterns", ids,
    ex: wrong[0] ? { said: `${wrong[0].it.w}: ${wrong[0].said}`, right: wrong[0].it.cls } : null } });
}

/* ================= Orðaforði: the bonus sentence =========================
 *
 * v6.11: the free-text sentence is no longer a question of its own in a
 * session. After a graded Orðaforði question the child MAY write a sentence
 * with the word; XP only if the word is in it (any of its BÍN forms), the
 * sentence has three words or more, is not one already written this visit
 * and is not the dictionary's own example. Nothing is graded right or
 * wrong, and skipping costs nothing: Enter on Áfram goes on as always. */

export const BONUS_XP = 6;

/** Does this sentence earn the bonus? `seen`: texts already used. */
export function bonusVerdict(text, entry, seen = []) {
  const key = normalise(text);
  const words = key.split(" ").filter(Boolean);
  if (words.length < 3) return { ok: false, why: "Skrifaðu heila setningu — að minnsta kosti þrjú orð." };
  if (seen.includes(key)) return { ok: false, why: "Þessa setningu ertu búin(n) að skrifa — prófaðu nýja." };
  if (entry.x && normalise(entry.x) === key) return { ok: false, why: "Þetta er dæmið úr orðabókinni — búðu til þína eigin setningu." };
  const forms = new Set(Object.values(entry.forms || {}).flat().map(normalise).filter((f) => f && !f.includes(" ")));
  forms.add(normalise(entry.o));
  if (!words.some((w) => forms.has(w)))
    return { ok: false, why: `Orðið *${entry.o}* (í einhverri mynd) þarf að vera í setningunni.` };
  return { ok: true };
}

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
    const seen = (app.sess.bonusTexts ||= []);
    const r = bonusVerdict(ta.value, e, seen);
    if (!r.ok) {
      $("bonusverdict").innerHTML = `<p class="streakline">${fmt(r.why)}</p>`;
      return;
    }
    seen.push(normalise(ta.value));
    const xp = Math.round(BONUS_XP * dayMult(dayStreak(app.S)));
    record(app.S, app.sess, { skill: "ordaford", word: t.word, ok: true, xp, counts: false, ms: 0 });
    app.S.counters.meanings = (app.S.counters.meanings || 0) + 1;
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
