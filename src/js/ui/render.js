/* Rendering tasks and drawing verdicts.

   Each type has its pair: RENDER.x draws the question and submitX() collects
   the pupil's response, has it judged, and draws the verdict.

   v6.13: nothing is graded here any more. core/answer.js `judge` decides —
   right or wrong, what is forgiven, the XP, the error patterns — and
   `conclude` below is the one path by which a judgement reaches the pupil's
   state and `app.finish`. A submit handler that calls `record` or `bumpDiff`
   itself is a mistake.                                                     */

import { CASES, COLS, mark, describeMark, caseName } from "../core/marks.js";
import { lessonLinkHTML } from "./lessons.js";
import { abbr, markHTML } from "../core/glossary.js";
import { agreementNote, normalise } from "../core/grading.js";
import { judge, settle, parseRows, judgeSyntax, judgeRetry, retryAllowed, hideAnswer } from "../core/answer.js";
import { runMult, dayMult } from "../core/progress.js";
import { dayStreak, todayKey } from "../core/state.js";
import { firstMeeting, markTypeSeen } from "../core/examples.js";
import { skillName } from "../core/skills.js";
import { conjugationNote } from "../tasks/explain.js";
import { reportButtonHTML } from "./reports.js";
import { l2On, glossToken, decorateTask } from "./secondlang.js";
import {
  $, esc, fmt, wireKeys, cheer, CHEERS_OK, CHEERS_NO, CHEERS_TRY, hideTip,
  defBox, unlockDefBox, freshEnter, stopConfetti,
} from "./dom.js";

export const RENDER = {};

/* A question whose answer includes the word class may not offer the word's
 * dictionary entry until it has been answered: the entry names the class in
 * its heading and usually again in its text. In "Í hvaða orðflokki" the
 * shortened definition stays on the page as context; the hover window, the
 * class and the lookup links go, and come back with the verdict
 * (`unlockDefBox`). v6.13: "Greindu orðið" shows no definition at all until
 * the class is answered — even the short text gave it away ("vera í
 * láréttri stellingu" is a verb) — see RENDER.parse. */
const CLASS_IS_THE_ANSWER = new Set(["parse", "indecl"]);
export const definitionLocked = (task) =>
  !!task && CLASS_IS_THE_ANSWER.has(task.type);

/* Item 41: the first time a pupil meets a type of question, its card opens
   with one worked example (core/examples.js, content/examples.js). Decided
   once per question — a card drawn again keeps it — and the type is written
   down as met when the example is shown. A `details` element, open: it
   takes no focus and no click from the question below it. */
const examples = new WeakMap();

function exampleHTML(ex) {
  return `<details class="workedex" open>
    <summary>Ný tegund spurningar: svona er hún leyst</summary>
    <p class="wq">${fmt(ex.q, { gloss: false })}</p>
    <p class="wa"><b>Svar:</b> ${fmt(ex.a, { gloss: false })}</p>
    <p class="wh"><b>Svona:</b> ${fmt(ex.how, { gloss: false })}</p>
    <p class="faint wn">Nú er komið að þér.</p>
  </details>`;
}

function showExample(app) {
  const t = app.cur;
  if (!examples.has(t)) {
    const ex = app.duelRun || app.liveRun ? null : firstMeeting(app.S, t);
    examples.set(t, ex);
    if (ex) markTypeSeen(app.S, t.typeId, todayKey());
    /* Item 17: a card that opens with its worked example is a first meeting,
       answered with a model beside it — not a measure of how hard the type
       is, so it is not offered to the count (app.js `noteAnswer`). */
    if (ex) delete t.calBand;
  }
  const ex = examples.get(t);
  const card = document.querySelector("#task .card");
  if (!ex || !card || card.querySelector(".workedex")) return;
  const eb = card.querySelector(":scope > .eyebrow");
  if (eb) eb.insertAdjacentHTML("afterend", exampleHTML(ex));
  else card.insertAdjacentHTML("afterbegin", exampleHTML(ex));
}

export function renderTask(app) {
  hideTip();
  stopConfetti();
  const fn = RENDER[app.cur.type];
  if (!fn) throw new Error("Enginn birtir fyrir " + app.cur.type);
  /* Item 45: in the second-language mode every content word of the sentence
     carries its gloss (ui/secondlang.js). Set for the whole life of the
     question, so the sentence drawn again with the answer keeps them. */
  glossFor = l2On(app) ? glossToken(app) : null;
  fn(app);
  showExample(app);
  decorateTask(app);
  /* Item 51: the verdict is a live region, so a screen reader says "Rétt" or
     "Ekki alveg" when it is written. Set here, once, rather than in each of
     the renderers that draw an empty #verdict: the region is in the page
     before anything is put into it, which is what makes it announce. */
  const vd = document.getElementById("verdict");
  if (vd) { vd.setAttribute("role", "status"); vd.setAttribute("aria-live", "polite"); }
  /* Lesefni (v6.7): every question links to the page that teaches it. */
  const eb = document.querySelector("#task .eyebrow");
  /* Same reason as skillTag: before the answer, a word-class question links to
     the neutral Orðflokkar page, not to the page of the class it is about.
     The specific page comes with the verdict (suggestLesson). */
  const link = definitionLocked(app.cur) ? lessonLinkHTML(app.cur, "ordflokkar") : lessonLinkHTML(app.cur);
  /* v6.13: a question the review queue asked for says so (core/review.js). */
  if (eb && app.cur.review && !eb.querySelector(".reviewtag"))
    eb.insertAdjacentHTML("beforeend", `<b class="reviewtag">upprifjun</b>`);
  if (eb && link && !eb.querySelector(".lessonlink")) eb.insertAdjacentHTML("beforeend", link);
  /* v6.8: every question can be reported (ui/reports.js). */
  if (eb && !eb.querySelector(".reportflag")) eb.insertAdjacentHTML("beforeend", reportButtonHTML());
  app.refresh();
}

/** After the verdict: a word-class question may now name its real topic. */
export function revealTopic(app) {
  const t = app.cur;
  if (!definitionLocked(t)) return;
  const eb = document.querySelector("#task .eyebrow");
  if (!eb) return;
  const tag = eb.querySelector(":scope > b");
  if (tag) tag.textContent = skillName(t.skill);
  const old = eb.querySelector(".lessonlink");
  const link = lessonLinkHTML(t);
  if (old && link) old.outerHTML = link;
}

/* ---------- sameiginlegt ------------------------------------------------ */

/* A full stop, a question mark or a comma stands against the word before it. */
const PUNCT = new Set([".", "?", "!", ","]);

/* Item 45: a token → its HTML with a gloss (second-language mode), or null.
   Null whenever the mode is off, and then every word is plain text. */
let glossFor = null;
const wordHTML = (t) => (glossFor && glossFor(t)) || esc(t.w);

/* Item 45: a line of text that is not the bank sentence itself (the passive
   of Umritun germynd, the two lines of tenging) with a gloss on its content
   words. The builder hands over the tokens the text was written from
   (`fromTok`, `linesTok`); the words of the text are matched to them one for
   one, ignoring case and punctuation, and if ANY word does not match the line
   is shown plain: a gloss on the wrong word is worse than none. */
function glossedText(text, toks) {
  const plain = esc(text);
  if (!glossFor || !toks) return plain;
  const want = toks.filter((t) => !PUNCT.has(t.w));
  const pieces = String(text).split(" ");
  const out = [];
  let at = 0;
  for (const tok of want) {
    /* Greynir keeps some phrases as one token (*á morgun*, *í gær*). */
    const n = String(tok.w).split(" ").length;
    const chunk = pieces.slice(at, at + n);
    at += n;
    if (chunk.length < n) return plain;
    const m = /^(.*?)([.,?!]*)$/.exec(chunk.join(" "));
    if (m[1].toLowerCase() !== String(tok.w).toLowerCase()) return plain;
    out.push((glossFor({ ...tok, w: m[1] }) || esc(m[1])) + m[2]);
  }
  return at === pieces.length ? out.join(" ") : plain;
}

function sentenceHTML(s, i, replacement) {
  return s.tok.map((t, j) => {
    if (PUNCT.has(t.w)) return t.w;
    const sp = j === 0 ? "" : " ";
    /* The answer put in first place starts with a capital, as the word it
       replaces did (v6.10: "nunnan liggur á stólnum."). */
    if (j === i) return sp + (/^\p{Lu}/u.test(t.w)
      ? replacement.replace(/^((?:<[^>]*>)*)(\p{Ll})/u, (_, tags, c) => tags + c.toUpperCase())
      : replacement);
    return sp + wordHTML(t);
  }).join("");
}

function mapHTML(active) {
  let h = '<table class="map"><caption>beygingarkort</caption><tr><th></th>';
  COLS.forEach((c) => { h += "<th>" + abbr(c.label) + "</th>"; });
  h += "</tr>";
  CASES.forEach((cs) => {
    /* The case's full name, not an abbreviation — and with an explanation. */
    h += '<tr><th class="row">' + abbr(cs.name, cs.term) + "</th>";
    COLS.forEach((c) => {
      h += `<td class="${mark(cs.k, c.k) === active ? "on" : ""}"></td>`;
    });
    h += "</tr>";
  });
  return h + "</table>";
}

const whyBox = (text, label = "af hverju") =>
  text ? `<div class="why"><b>${label}</b>${fmt(text)}</div>` : "";

/* How long this answer took, measured by the clock that discards absence. Only
   the first call after each task gets the time — a table writes several records
   and must not count the time six times over. */
function spend(app) {
  if (app.cur && app.cur._spent) return 0;
  if (app.cur) app.cur._spent = true;
  return app.clock ? app.clock.elapsed() : 0;
}

/**
 * The one path from a judgement to the pupil's state.
 *
 * `settle` (core/answer.js) writes the records, the tally and the difficulty;
 * `draw` then puts the verdict on the screen — after, because the verdict
 * shows the run as it stands with this answer in it — and `app.finish` ends
 * the question: diagnosis, badges, saving, Enter.
 *
 * The clock is read only when the judgement has a record that carries the
 * time: a table with no right cell never counted its time, and reading the
 * clock is what resets it.
 */
function conclude(app, task, j, draw) {
  const took = j.effects.some((e) => e.timed) ? spend(app) : 0;
  /* Item 17: a first answer to a fresh question is offered to the anonymous
     count (app.js `noteAnswer` decides whether it goes anywhere). Here, on
     the one path, so a second try (`endRetry`) is never counted. */
  if (app.noteAnswer) app.noteAnswer(task, j);
  const extra = settle(app.S, app.sess, task, j, { ms: took });
  /* A duel keeps the answer itself: the server grades it (item 62). */
  if (task.duel && app.duelAnswer) app.duelAnswer(task, j.given);
  /* …and so does a live round's (item 64): sent now, the verdict hidden
     until the question closes on every screen (ui/live.js). */
  if (task.live && app.liveAnswer) app.liveAnswer(task, j.given);
  draw();
  app.finish(extra);
}

/* ---------- a second try (critique item 42) ------------------------------
 *
 * Which types offer one, and what is recorded, is decided and explained in
 * core/answer.js (`retryAllowed`, `judgeRetry`). The screen's part:
 *
 *   1. First miss: `offerRetry` settles it through `conclude` — the miss is
 *      written, diagnosed and queued for review now, as any miss is — but
 *      instead of the answer it draws the rule (the *af hverju* line, with
 *      the answer taken out of it) and, through `app.finish`, the name of the
 *      error pattern. The box stays open and keeps the focus; "Athuga" stays
 *      "Athuga"; "Sýna svarið" gives up and reveals.
 *   2. The second try, or "Sýna svarið": `endRetry` writes what the retry is
 *      worth (half XP if right; never a second record), draws the answer —
 *      the pupil's form and the right one side by side, in the paradigm
 *      where one is shown — and only then arms Áfram.
 *
 * The verdict is a live region (`role="status"`, item 51): the prompt is
 * written into it, so a screen reader says "Ekki alveg — reyndu aftur", and
 * the box points at the prompt (`aria-describedby`) when it takes the focus. */

/** A message that does not end the question (empty, hedged, the same try
    again). During a retry it goes under the prompt rather than over it. */
function say(t, html) {
  const note = t.retrying && $("retrynote");
  if (note) note.innerHTML = html;
  else $("verdict").innerHTML = `<div class="verdict neutral"><p>${html}</p></div>`;
}

/* What the retry prompt says when the second try is the first one again. */
const SAME_AGAIN = "Þetta er sama svarið og áðan. Breyttu því — eða smelltu á <b>Sýna svarið</b>.";

/**
 * After a first wrong answer: if the type allows a second try, settle the
 * miss, draw the prompt in place of the answer, and return true — the
 * caller stops there. Otherwise false, and the caller concludes as before.
 *
 * @param {object} o
 *   response  the first response, to tell a new try from the same one
 *   why       the rule to show (default `t.why`); the answer is taken out
 *   label     its label (default "af hverju")
 *   note      HTML of a note that names what was off and not the answer
 *   prompt    the first line of the prompt, when "Lestu regluna …" does not
 *             fit (Setningasmiðja: there is no rule, the cards are marked)
 *   inputs    the boxes that stay open; the first takes the focus
 *   lock      buttons to disable while the retry is open (the hint)
 *   onMiss    run while the miss is drawn, before `app.finish`
 *   reveal    draws the answer for the first try (used by "Sýna svarið")
 */
function offerRetry(app, t, j, o) {
  if (!retryAllowed(t, j)) return false;
  t.retried = true;
  t.retrying = { first: o.response };
  const why = hideAnswer(o.why === undefined ? t.why : o.why, t);
  /* "Lestu regluna" only when there is one to read. */
  const read = o.prompt || (why || o.note ? "Lestu regluna og skrifaðu svarið aftur." : "Skrifaðu svarið aftur.");
  conclude(app, t, j, () => {
    if (o.onMiss) o.onMiss();
    $("verdict").innerHTML = `<div class="verdict no retry">
      <h3>Ekki alveg — reyndu aftur</h3>
      <p id="retrynote">${read} Rétt svar í annarri tilraun gefur hálft XP.</p>
      ${o.note || ""}${whyBox(why, o.label || "af hverju")}</div>`;
  });
  (o.lock || []).forEach((b) => { if (b) b.disabled = true; });
  const go = $("check");
  if (go && !$("reveal")) go.insertAdjacentHTML("afterend",
    `<button type="button" class="ghost" id="reveal">Sýna svarið</button>`);
  $("reveal").onclick = () => endRetry(app, t, null, o.reveal);
  const inputs = (o.inputs || []).filter(Boolean);
  inputs.forEach((el) => el.setAttribute("aria-describedby", "retrynote"));
  if (inputs[0]) { inputs[0].focus(); inputs[0].select(); }
  /* On a phone the prompt lands under the box and the letter keys, below
     the screen. Scroll as little as shows all of it (the sentence, higher
     up, usually stays in view) — but never so far that the box goes. */
  const box = document.querySelector("#verdict .retry");
  if (box && inputs[0] && box.scrollIntoView) {
    box.scrollIntoView({ block: "nearest" });
    const r = inputs[0].getBoundingClientRect();
    if (r.top < 0) inputs[0].scrollIntoView({ block: "start" });
  }
  return true;
}

/**
 * End a question that had a second try. `j` is the second try's judgement
 * (`judgeRetry`), or null when the pupil asked to see the answer. `draw`
 * puts the answer on the screen; the lines `app.finish` added under the
 * miss — the error pattern, the lesson — are kept under it.
 */
function endRetry(app, t, j, draw) {
  if (!t.retrying) return;
  const kept = [...document.querySelectorAll("#verdict .diagline, #verdict .lessonhint")]
    .map((el) => el.outerHTML).join("");
  t.retrying = null;
  if (j) settle(app.S, app.sess, t, j);
  const rv = $("reveal");
  if (rv) rv.remove();
  document.querySelectorAll("#task [aria-describedby='retrynote']")
    .forEach((el) => el.removeAttribute("aria-describedby"));
  draw();
  const v = document.querySelector("#verdict .verdict");
  if (v && kept) {
    const tail = v.querySelector(":scope > .streakline:last-child");
    tail ? tail.insertAdjacentHTML("beforebegin", kept) : v.insertAdjacentHTML("beforeend", kept);
  }
  app.save();
  app.refresh();
  if (app.armNext) app.armNext();
}

/** The heading and XP line of a right second try. */
const retryRightHTML = (xp) => `<span class="xpop">+${xp} XP</span>
  <h3>Rétt í annarri tilraun!</h3>`;
const RETRY_STILL_MISS = `<p class="streakline">Fyrra svarið telst samt villa, svo þetta kemur aftur í upprifjun. Rétt í annarri tilraun gefur hálft XP.</p>`;

/**
 * The pupil's form and the right one, side by side. `tries`: the wrong
 * forms written, in order, each `{ typed, g }` (`g` from `gradeForm`: its
 * `otherMarks` say which cell of the word the form belongs to, if any).
 * `kind` is passed to `describeMark` ("nafnorð" for a cloze).
 */
function compareHTML(t, tries, { right = t.answers || [], kind } = {}) {
  const seen = new Set();
  const yours = tries.filter((x) => {
    const k = normalise(x.typed || "");
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (!yours.length) return "";
  const cellOf = (x) => {
    const ms = (x.g && x.g.otherMarks) || [];
    return ms.length ? `<small>${fmt(describeMark(ms[0], kind))}</small>` : "";
  };
  return `<div class="compare">
    <div class="cmp yours"><span class="cmplab">${yours.length > 1 ? "Þín svör" : "Þitt svar"}</span>${
      yours.map((x) => `<span class="forms">${esc(String(x.typed).trim())}</span>${cellOf(x)}`).join("")}</div>
    <div class="cmp right"><span class="cmplab">Rétt</span><span class="forms">${
      right.slice(0, 2).map(esc).join(" / ")}</span>${t.m ? `<small>${fmt(describeMark(t.m, kind))}</small>` : ""}</div>
  </div>`;
}

/**
 * A noun's paradigm on the beygingarkort, filled in: the right cell and the
 * cells of the pupil's wrong forms highlighted, so the two are seen side by
 * side where they belong. Only for a plain noun cloze — the map is the
 * noun's own (four columns × four cases); a cloze with an adjective or a
 * pronoun in front asks for a phrase the map does not hold.
 */
function paradigmCompareHTML(t, tries) {
  if (t.type !== "fill" || t.extra || !t.paradigm || !t.m) return "";
  const yours = new Set(tries.flatMap((x) => (x.g && x.g.otherMarks) || []));
  let h = `<table class="map filled"><caption>${yours.size
    ? `<span class="key on">rétt</span> <span class="key yours">þitt svar</span>`
    : `<span class="key on">rétt</span>`}</caption><tr><th></th>`;
  COLS.forEach((c) => { h += "<th>" + abbr(c.label) + "</th>"; });
  h += "</tr>";
  CASES.forEach((cs) => {
    h += '<tr><th class="row">' + abbr(cs.name, cs.term) + "</th>";
    COLS.forEach((c) => {
      const m = mark(cs.k, c.k);
      const f = (t.paradigm[m] || [])[0] || "–";
      const cls = m === t.m ? "on" : yours.has(m) ? "yours" : "";
      h += `<td class="${cls}">${esc(f)}</td>`;
    });
    h += "</tr>";
  });
  return `<div class="why"><b>í beygingunni</b><div class="mapwrap">${h}</table></div></div>`;
}

/* The line under a forgiven answer: what was missed, and what it cost. */
const slipNote = (slip, xp, full) =>
  !slip ? "" : `<div class="why"><b>athugið</b>${fmt(slip.note)}${
    full > xp ? ` <span class="streakline">(${full - xp} XP dregin frá.)</span>` : ""
  }</div>`;

/* The wrong article or tense: wrong, but say which one feature was off. */
const nearNote = (v) => !v || !v.near ? "" : `<div class="why"><b>athugið</b>${fmt(v.near.note)}</div>`;

function multLine(app, xp) {
  const rm = runMult(app.S.run), dm = dayMult(dayStreak(app.S));
  const bits = [];
  if (rm > 1) bits.push("röð ×" + rm.toFixed(1));
  if (dm > 1) bits.push("dagar ×" + dm.toFixed(2));
  return bits.length ? " · " + bits.join(" · ") : "";
}

/* A question whose answer includes the word class must not name the class in
   its header: an analysis drawn for Lýsingarorð would otherwise say
   "Lýsingarorð" above the very row that asks for the word class. Such
   questions wear the neutral "Orðflokkagreining" until they are answered. */
const skillTag = (t) => `<b>${esc(definitionLocked(t) ? skillName("greining") : skillName(t.skill))}</b>`;

/* The word the question is about, wherever it came from: a standalone form out
   of BÍN (`lemmaWord`), a token in a sentence (`t.t`), or the word to
   decline. */
function focusEntry(app, task) {
  if (task.lemmaWord) return task.lemmaWord;
  const t = task.t;
  if (!t) return null;
  return app.lex.lookup(t.l, t.x) || app.lex.lookup(t.l, t.c) || null;
}

/* Enter in an input does exactly what pressing "Athuga" does, and nothing else.
   `freshEnter` sees to it that a held key submits the answer once rather than six
   times — and `preventDefault` is called on the repeats too, so they cannot fire
   the button that takes the focus afterwards. */
function enterToSubmit(el, fn) {
  el.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (freshEnter(e)) fn();
  });
}

/* ================= 1. Cloze =========================================== */

RENDER.fill = function (app) {
  const t = app.cur;
  const { s, i, n, a, m } = t;
  const label = t.label || (t.extra ? `${t.extra.fl} + nafnorð` : "nafnorð");
  const prompt = t.extra
    ? `${esc(t.extra.lemma)}<span class="plus">+</span>${esc(n.o)}`
    : esc(n.o);
  $("task").innerHTML = `
  <div class="card">
    <p class="eyebrow"><span>Settu orðið í rétt horf · ${esc(label)}</span><b>þyngd ${t.lvl}</b></p>
    <p class="sentence">${sentenceHTML(s, i, '<span class="blank">?</span>')}</p>
    ${t.lead ? `<p class="gloss">${fmt(t.lead)}</p>` : ""}
    <div class="prompt-row">
      <div class="lemma-box">
        <div class="lemma-label">Orðið í nefnifalli</div>
        <div class="lemma">${prompt}<small>${abbr(n.c)}</small></div>
        ${defBox(app, n)}
      </div>
      ${mapHTML(m)}
      <p class="mapline">Beygingarmynd: <b>${fmt(describeMark(m, "nafnorð"))}</b></p>
    </div>
    <div class="answer">
      <input type="text" id="ans" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="skrifaðu orðið…">
      <button class="go" id="check">Athuga</button>
      <button class="ghost" id="hint">Vísbending</button>
    </div>
    <p class="helpnote">Þú mátt skrifa heila setningu ef það hjálpar — við lesum orðið úr henni.</p>
    <div class="keys" id="keys"></div><div id="verdict"></div>
  </div>`;
  wireKeys();
  const inp = $("ans");
  inp.focus();
  enterToSubmit(inp, () => submitFill(app));
  $("check").onclick = () => submitFill(app);
  $("hint").onclick = () => {
    t.hinted = true;
    $("hint").disabled = true;
    const x = t.answers[0];
    $("verdict").innerHTML = `<div class="verdict neutral"><h3>Vísbending</h3>
      <p>Þetta er ${fmt(caseName(a.fall))}, ${fmt(a.tala)}, ${fmt(a.greinir ? "með greini" : "án greinis")}.
      Svarið byrjar á <span class="forms">${esc(x.slice(0, Math.max(2, x.indexOf(" ") + 3)))}…</span></p>
      <p class="streakline">Vísbending gefur helmingi minna XP — hún telst ekki sem villa.</p></div>`;
  };
};

/* The first judgement or the second try's, for the same box: `t.retrying`
   says which (item 42). */
const judgeTry = (app, t, response) =>
  t.retrying ? judgeRetry(t, response, t.retrying.first, app) : judge(t, response, app);

/* A wrong form, kept for the side-by-side at the end (`compareHTML`). */
const noteTry = (t, j, typed) => {
  if (j.ok === false) (t.tries ||= []).push({ typed, g: j.detail && j.detail.g });
};

function submitFill(app) {
  const t = app.cur;
  const val = $("ans").value;
  const response = { text: val, hinted: !!t.hinted };
  const j = judgeTry(app, t, response);
  if (j.verdict === "empty") return;
  if (j.verdict === "same") return say(t, SAME_AGAIN);
  if (j.verdict === "hedged") {
    say(t, `<b>Veldu eina mynd.</b> Þú skrifaðir fleiri en eina beygingarmynd (${j.detail.g.hedged.map(esc).join(", ")}).
      Prófaðu aftur með þeirri sem þú telur rétta.`);
    return;
  }
  /* `comeback` is not computed here. It was, in two of the ten submit
     handlers, off `sess.wrongRun` — a per-`record()` counter, so a table with
     three wrong cells satisfied it. It lives in app.finish(), which is the
     one place that knows a whole question has ended. */
  noteTry(t, j, val);
  const draw = () => drawFill(app, t, j, val);
  if (t.retrying) return endRetry(app, t, j, draw);
  if (offerRetry(app, t, j, {
    response, note: nearNote(j.detail.v), inputs: [$("ans")], lock: [$("hint")], reveal: draw,
    /* Item 19: when the noun comes back is planned at the miss, where the
       session's count still stands at this question. */
    onMiss: () => { t.later = app.planReask ? app.planReask(t) : false; },
  })) return;
  conclude(app, t, j, draw);
}

function drawFill(app, t, j, val) {
  const { g, v, xpFull } = j.detail;
  const ok = j.ok, xp = j.xp;
  const full = sentenceHTML(t.s, t.i, `<b>${esc(t.answers[0])}</b>`);
  const note = t.extra && ok
    ? agreementNote(g.helpers, t.a, (f) => app.lex.analyse(f))
    : null;
  const tries = t.tries || [];

  if (ok && !j.retry) {
    $("verdict").innerHTML = `<div class="verdict ${v.klass}"><span class="xpop">+${xp} XP</span>
    <h3>${v.slip ? esc(v.slip.head) : cheer(CHEERS_OK)}</h3><p>${full}</p>
    <p style="font-size:13px;color:var(--slate)">${fmt(describeMark(t.m))}</p>
    ${v.slip ? `<p>Þú skrifaðir <span class="forms">${esc(val.trim())}</span>. Rétt er
       <span class="forms">${t.answers.slice(0, 2).map(esc).join(" / ")}</span>.</p>` : ""}
    ${slipNote(v.slip, xp, xpFull)}
    ${g.helpers.length ? `<p class="streakline">Hjálparorðin þín: ${g.helpers.map(esc).join(", ")} — þau breyta engu um matið.</p>` : ""}
    ${note ? whyBox(note, "ábending") : ""}
    ${whyBox(t.why)}
    <p class="streakline">${app.S.run} í röð${multLine(app, xp)}. Enter fyrir næstu.</p></div>`;
  } else {
    /* v6.13 (critique item 19): the noun used to be the very next question
       — a test of what the pupil had read a second ago. It now comes back
       three to five questions on, if the session is that long, and the
       review queue has it for tomorrow either way (core/review.js). A
       cloze asked for another category (Fallstjórn, `noRepeat`) does not
       bring its noun back as a Nafnorð question. A right second try is
       still a miss (item 42), so it comes back too. */
    const later = t.later ?? (app.planReask ? app.planReask(t) : false);
    $("verdict").innerHTML = `<div class="verdict ${ok ? v.klass : "no"}">
    ${ok ? retryRightHTML(xp) : `<h3>${cheer(CHEERS_NO)}</h3>`}
    ${compareHTML(t, tries, { kind: "nafnorð" })}
    ${ok ? slipNote(v.slip, xp, xp) : nearNote(v)}<p>${full}</p>
    ${paradigmCompareHTML(t, tries)}${whyBox(t.why)}
    ${ok ? RETRY_STILL_MISS : ""}
    <p class="streakline">${later ? "Orðið kemur aftur seinna í lotunni. " : ""}Enter fyrir næstu.</p></div>`;
  }
  $("ans").disabled = true;
  $("hint").disabled = true;
}

/* ================= 2. Sagnbeyging ====================================== */

RENDER.verb = function (app) {
  const t = app.cur;
  $("task").innerHTML = `
  <div class="card">
    <p class="eyebrow"><span>Beygðu sögnina</span>${skillTag(t)}</p>
    <p class="sentence">${esc(t.pron)} <span class="blank">?</span></p>
    <p class="gloss">${fmt(t.label)}${t.a.persóna ? " · " + fmt(t.a.persóna) : ""} · ${fmt(t.a.tala || "")}</p>
    <div class="prompt-row"><div class="lemma-box">
      <div class="lemma-label">Sögnin í nafnhætti</div>
      <div class="lemma">að ${esc(t.v.o)}<small>${abbr("so")}</small></div>
      ${defBox(app, t.v)}
    </div></div>
    <div class="answer">
      <input type="text" id="ans" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="beygða myndin…">
      <button class="go" id="check">Athuga</button></div>
    <div class="keys" id="keys"></div><div id="verdict"></div>
  </div>`;
  wireKeys();
  const inp = $("ans");
  inp.focus();
  enterToSubmit(inp, () => submitVerb(app));
  $("check").onclick = () => submitVerb(app);
};

function submitVerb(app) {
  const t = app.cur;
  const typed = $("ans").value;
  const response = { text: typed };
  const j = judgeTry(app, t, response);
  if (j.verdict === "empty") return;
  if (j.verdict === "same") return say(t, SAME_AGAIN);
  if (j.verdict === "hedged") {
    say(t, `<b>Veldu eina mynd.</b> Skrifaðu bara þá mynd sem þú telur rétta.`);
    return;
  }
  noteTry(t, j, typed);
  const draw = () => drawVerb(app, t, j);
  if (t.retrying) return endRetry(app, t, j, draw);
  /* The rule for a verb on its own is its conjugation (*sterk sögn: …*). */
  if (offerRetry(app, t, j, {
    response, why: conjugationNote(t.v.o, t.conj), label: "beyging",
    note: nearNote(j.detail.v), inputs: [$("ans")], reveal: draw,
  })) return;
  conclude(app, t, j, draw);
}

function drawVerb(app, t, j) {
  const { v, xpFull } = j.detail;
  const ok = j.ok, xp = j.xp;
  const conj = conjugationNote(t.v.o, t.conj);
  const head = ok && j.retry ? retryRightHTML(xp)
    : `<span class="xpop">+${xp} XP</span>
    <h3>${v.slip ? esc(v.slip.head) : ok ? cheer(CHEERS_OK) : cheer(CHEERS_NO)}</h3>`;
  $("verdict").innerHTML = `<div class="verdict ${ok ? v.klass : "no"}">${head}
  <p><span class="forms">${esc(t.pron)} ${esc(t.answers[0])}</span></p>
  ${ok && !j.retry ? "" : compareHTML(t, t.tries || [])}
  ${slipNote(v.slip, xp, j.retry ? xp : xpFull)}${ok ? "" : nearNote(v)}
  <div class="why"><b>mark í BÍN</b><span class="forms mk">${markHTML(t.m)}</span> — ${fmt(describeMark(t.m))}</div>
  ${whyBox(conj, "beyging")}
  ${ok && j.retry ? RETRY_STILL_MISS : ""}
  <p class="streakline">Enter fyrir næstu.</p></div>`;
  $("ans").disabled = true;
}

/* ================= 2b. Verb inside a sentence ========================== */

/* The same layout as a noun cloze, but the verb is in the blank and the
   requirement is spelled out in words that all have glossary entries: "þátíð,
   framsöguháttur, germynd · 3. persóna · eintala". */

RENDER.verbslot = function (app) {
  const t = app.cur;
  $("task").innerHTML = `
  <div class="card">
    <p class="eyebrow"><span>Settu sögnina í rétt horf</span><b>þyngd ${t.lvl}</b></p>
    <p class="sentence">${sentenceHTML(t.s, t.i, '<span class="blank">?</span>')}</p>
    <div class="prompt-row">
      <div class="lemma-box">
        <div class="lemma-label">Sögnin í nafnhætti</div>
        <div class="lemma">að ${esc(t.shown || t.v.o)}<small>${abbr("so")}</small></div>
        ${defBox(app, t.v)}
      </div>
      <div class="spec-box">
        <div class="lemma-label">Á að vera</div>
        <div class="specline">${fmt(describeMark(t.m))}</div>
      </div>
    </div>
    <div class="answer">
      <input type="text" id="ans" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="beygða myndin…">
      <button class="go" id="check">Athuga</button>
      <button class="ghost" id="hint">Vísbending</button>
    </div>
    <p class="helpnote">Þú mátt skrifa alla setninguna ef það hjálpar — við lesum sögnina úr henni.</p>
    <div class="keys" id="keys"></div><div id="verdict"></div>
  </div>`;
  wireKeys();
  const inp = $("ans");
  inp.focus();
  enterToSubmit(inp, () => submitVerbSlot(app));
  $("check").onclick = () => submitVerbSlot(app);
  $("hint").onclick = () => {
    t.hinted = true;
    $("hint").disabled = true;
    const x = t.answers[0];
    $("verdict").innerHTML = `<div class="verdict neutral"><h3>Vísbending</h3>
      <p>${t.conj ? `Sögnin <em>${esc(t.shown || t.v.o)}</em> er ${fmt(
        t.conj === "sterk" ? "sterk sögn" : t.conj === "veik" ? "veik sögn" : "núþáleg sögn")}. ` : ""}
      Svarið byrjar á <span class="forms">${esc(x.slice(0, Math.max(2, Math.ceil(x.length / 2))))}…</span></p>
      <p class="streakline">Vísbending gefur helmingi minna XP — hún telst ekki sem villa.</p></div>`;
  };
};

function submitVerbSlot(app) {
  const t = app.cur;
  const val = $("ans").value;
  const response = { text: val, hinted: !!t.hinted };
  const j = judgeTry(app, t, response);
  if (j.verdict === "empty") return;
  if (j.verdict === "same") return say(t, SAME_AGAIN);
  if (j.verdict === "hedged") {
    say(t, `<b>Veldu eina mynd.</b> Þú skrifaðir fleiri en eina sagnmynd (${j.detail.g.hedged.map(esc).join(", ")}).
      Prófaðu aftur með þeirri sem þú telur rétta.`);
    return;
  }
  noteTry(t, j, val);
  const draw = () => drawVerbSlot(app, t, j, val);
  if (t.retrying) return endRetry(app, t, j, draw);
  const conj = conjugationNote(t.shown || t.v.o, t.conj);
  if (offerRetry(app, t, j, {
    response, inputs: [$("ans")], lock: [$("hint")], reveal: draw,
    note: nearNote(j.detail.v) + whyBox(hideAnswer(conj, t), "beyging"),
  })) return;
  conclude(app, t, j, draw);
}

function drawVerbSlot(app, t, j, val) {
  const { v, xpFull } = j.detail;
  const ok = j.ok, xp = j.xp;
  const full = sentenceHTML(t.s, t.i, `<b>${esc(t.answers[0])}</b>`);
  const conj = conjugationNote(t.shown || t.v.o, t.conj);
  if (ok && !j.retry) {
    $("verdict").innerHTML = `<div class="verdict ${v.klass}"><span class="xpop">+${xp} XP</span>
    <h3>${v.slip ? esc(v.slip.head) : cheer(CHEERS_OK)}</h3><p>${full}</p>
    ${v.slip ? `<p>Þú skrifaðir <span class="forms">${esc(val.trim())}</span>. Rétt er
       <span class="forms">${t.answers.slice(0, 2).map(esc).join(" / ")}</span>.</p>` : ""}
    ${slipNote(v.slip, xp, xpFull)}
    <div class="why"><b>mark í BÍN</b><span class="forms mk">${markHTML(t.m)}</span> — ${fmt(describeMark(t.m))}</div>
    ${whyBox(t.why)}${whyBox(conj, "beyging")}
    <p class="streakline">${app.S.run} í röð${multLine(app, xp)}. Enter fyrir næstu.</p></div>`;
  } else {
    $("verdict").innerHTML = `<div class="verdict ${ok ? v.klass : "no"}">
    ${ok ? retryRightHTML(xp) : `<h3>${cheer(CHEERS_NO)}</h3>`}
    ${compareHTML(t, t.tries || [])}
    ${ok ? slipNote(v.slip, xp, xp) : nearNote(v)}<p>${full}</p>${whyBox(t.why)}${whyBox(conj, "beyging")}
    ${ok ? RETRY_STILL_MISS : ""}
    <p class="streakline">Enter fyrir næstu.</p></div>`;
  }
  $("ans").disabled = true;
  $("hint").disabled = true;
}

/* ================= 3. Greining ========================================= */

/* Which rows a word is asked about, with their labels, options and answers,
   is decided in core/answer.js (`parseRows`) — the judge needs the same rows.

   v6.13 (items 1 and 49). The question used to show every row at once, and
   only the rows that fit the right answer: a verb arrived with Mynd, Háttur,
   Tíð and Persóna under the class chips, and the definition beside it read
   "vera í láréttri stellingu". On a 390 px phone the eleven class chips and
   up to six rows also took more than two screens, with Athuga at the bottom.

   Now the question is asked in turns:

   1. Orðflokkur, alone. No other row and no definition is on the page —
      not hidden, not there — so neither the eye nor the page source can
      read the class off them.
   2. The class is committed with its own button and judged on the spot
      (`judge` → step "rows"): a right class turns green, a wrong one is
      struck through beside the right one. The definition comes back, open,
      because the class is no secret any more.
   3. The rows of the RIGHT class follow, one at a time; a tap answers a row
      and opens the next. Answered rows stay above as one-line summaries that
      reopen when tapped. The current row and the button under it are
      scrolled into view after every step.

   What a wrong class costs is decided, and explained, in JUDGES.parse. */

/** The label a row shows for one of its values. */
function optLabel(r, v) {
  const o = r.opts().find((x) => (typeof x === "string" ? x : x.v) === v);
  return o == null ? v : typeof o === "string" ? o : o.label;
}

const chipsHTML = (r, picked) => r.opts().map((o) => {
  const v = typeof o === "string" ? o : o.v;
  const lab = typeof o === "string" ? o : o.label;
  return `<button type="button" data-v="${esc(v)}" aria-pressed="${v === picked}">${fmt(lab)}</button>`;
}).join("");

RENDER.parse = function (app) {
  const t = app.cur;
  t.rows = parseRows(t.a, t.t);
  t.picks = {};
  /* `cls` is the judged class once it is committed; `open` the key of the
     row being answered. */
  t.cls = null;
  t.open = "fl";
  /* Two variants: the word highlighted inside a sentence, or a standalone
     inflected form out of BÍN. */
  const stage = t.standalone
    ? `<p class="sentence"><span class="target">${esc(t.t.w)}</span></p>
       <p class="gloss">Þetta er beygingarmynd af orðinu <b>${esc(t.t.l)}</b>, tekin beint úr BÍN.
         Hér stendur hún ein, án setningar. Greindu myndina eins og hún stendur.</p>`
    : `<p class="sentence">${sentenceHTML(t.s, t.i, `<span class="target">${esc(t.t.w)}</span>`)}</p>`;
  $("task").innerHTML = `
  <div class="card">
    <p class="eyebrow"><span>${t.standalone ? "Greindu beygðu myndina" : "Greindu orðið sem er merkt"}</span>${skillTag(t)}</p>
    ${stage}
    <div id="defslot"></div>
    ${t.homograph ? `<p class="gloss">Athugaðu: ${esc(t.t.l)} getur verið fleiri en einn orðflokkur. ${t.standalone ? "Hér er spurt um myndina eins og hún er gefin upp hér að ofan." : "Farðu eftir setningunni."}</p>` : ""}
    <div class="parserows" id="parserows"></div>
    <div class="answer" id="parsego"><button class="go" id="check">Athuga orðflokkinn</button></div>
    <div id="verdict"></div>
  </div>`;
  drawParseRows(t);
  $("parserows").onclick = (e) => onParseTap(app, e);
  $("check").onclick = () => submitParse(app);
  /* After each step the keyboard lands on the next row's first option, so a
     held Enter would answer row after row with whatever comes first. Only a
     fresh press counts. (`armNext` listens on the button with its own guard
     once the verdict is in.) */
  const noRepeat = (e) => { if (e.key === "Enter" && e.repeat) e.preventDefault(); };
  $("parserows").onkeydown = noRepeat;
  $("check").onkeydown = noRepeat;
};

/** Draw the rows as they stand: summaries of what is answered, the open
    row, nothing of what is still to come. */
function drawParseRows(t, judged = null) {
  const box = $("parserows");
  if (!box) return;
  const [flRow, ...rest] = t.rows;
  const n = rest.length;
  let h;
  if (!t.cls) {
    h = `<div class="qrow qopen" data-row="fl"><label>${abbr(flRow.label, flRow.term)}</label>
      <div class="opts" data-q="fl">${chipsHTML(flRow, t.picks.fl)}</div></div>`;
  } else {
    const c = t.cls;
    h = `<div class="qsum qcls ${c.ok ? "ok" : "no"}" data-row="fl"><span class="qlab">${esc(flRow.label)}</span>
      ${c.ok ? "" : `<span class="qpick wrongpick">${fmt(c.picked)}</span>`}<span class="qpick right">${fmt(c.answer)}</span></div>
      ${c.ok ? "" : `<p class="qnote">Orðið er ${fmt(c.answer)}.${n ? " Haltu áfram með greininguna." : ""}</p>`}`;
    rest.forEach((r, k) => {
      const picked = t.picks[r.key];
      const step = `<span class="qstep">${k + 1}/${n}</span>`;
      if (judged) {
        const ok = picked === r.answer;
        h += `<div class="qsum ${ok ? "ok" : "no"}" data-row="${esc(r.key)}"><span class="qlab">${esc(r.label)}</span>
          ${ok ? "" : `<span class="qpick wrongpick">${fmt(optLabel(r, picked))}</span>`}<span class="qpick right">${fmt(optLabel(r, r.answer))}</span></div>`;
      } else if (t.open === r.key) {
        h += `<div class="qrow qopen" data-row="${esc(r.key)}"><label>${abbr(r.label, r.term)} ${step}</label>
          <div class="opts" data-q="${esc(r.key)}">${chipsHTML(r, picked)}</div></div>`;
      } else if (picked) {
        h += `<button type="button" class="qsum" data-reopen="${esc(r.key)}" aria-label="${esc(r.label)}: ${esc(optLabel(r, picked))} — breyta">
          <span class="qlab">${esc(r.label)}</span><span class="qpick">${esc(optLabel(r, picked))}</span><span class="qedit">breyta</span></button>`;
      }
      /* A row not reached yet is not drawn at all. */
    });
  }
  box.innerHTML = h;
}

/** After every step: the row being answered and the button under it in view,
    and the keyboard on the row's first option. */
function showParseStep() {
  const row = document.querySelector("#parserows .qopen");
  const go = $("parsego");
  if (go) go.scrollIntoView({ block: "nearest", behavior: "instant" });
  if (row) {
    row.scrollIntoView({ block: "nearest", behavior: "instant" });
    const first = row.querySelector("button[aria-pressed='true']") || row.querySelector("button");
    if (first) first.focus({ preventScroll: true });
  } else if ($("check")) $("check").focus({ preventScroll: true });
}

function onParseTap(app, e) {
  const t = app.cur;
  if (t.closed || t.parseDone) return;
  const again = e.target.closest("[data-reopen]");
  if (again) {
    t.open = again.dataset.reopen;
    drawParseRows(t);
    showParseStep();
    return;
  }
  const b = e.target.closest(".opts button");
  if (!b || b.disabled) return;
  const key = b.closest(".opts").dataset.q;
  t.picks[key] = b.dataset.v;
  if (key === "fl") {
    /* The class is not committed by a tap: eleven chips on a phone are easy
       to miss by one, and the class decides what follows. The button does. */
    b.parentNode.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b));
    return;
  }
  /* A feature row is answered by the tap; the next row still unanswered
     opens. When none is left, the button is what remains. */
  const next = t.rows.slice(1).find((r) => !t.picks[r.key]);
  t.open = next ? next.key : null;
  drawParseRows(t);
  showParseStep();
}

function submitParse(app) {
  const t = app.cur;
  const j = judge(t, { picks: t.picks }, app);
  if (j.pending) {
    if (j.detail.step === "class") {
      $("verdict").innerHTML = `<div class="verdict neutral"><p>Veldu orðflokk fyrst.</p></div>`;
      return;
    }
    if (!t.cls) {
      /* The class has just been committed. */
      t.cls = j.detail.cls;
      t.open = j.detail.ask[0].key;
      $("verdict").innerHTML = "";
      $("check").textContent = "Athuga greininguna";
      /* The class is no secret now: the definition may come, and open. */
      const entry = focusEntry(app, t);
      if (entry) $("defslot").innerHTML = defBox(app, entry);
      revealTopic(app);
      drawParseRows(t);
      showParseStep();
      return;
    }
    $("verdict").innerHTML = `<div class="verdict neutral"><p>Veldu svar í öllum röðunum.</p></div>`;
    showParseStep();
    return;
  }
  const { rows, right } = j.detail;
  const perfect = j.ok, xp = j.xp;
  t.parseDone = true;
  /* A word with no row but its class is finished by the class button. */
  if (!t.cls) {
    t.cls = j.detail.cls;
    const entry = focusEntry(app, t);
    if (entry) $("defslot").innerHTML = defBox(app, entry);
  }
  conclude(app, t, j, () => {
    drawParseRows(t, j);
    const sum = rows.map((r) => r.answer).join(", ");
    $("verdict").innerHTML = `<div class="verdict ${perfect ? "ok" : "no"}"><span class="xpop">+${xp} XP</span>
    <h3>${right} / ${rows.length}${perfect ? " — " + cheer(CHEERS_OK) : ""}</h3>
    <p><span class="forms">${esc(t.t.w)}</span> er ${fmt(sum)}.</p>
    ${t.t.m ? `<div class="why"><b>mark í BÍN</b><span class="forms mk">${markHTML(t.t.m)}</span> — ${fmt(describeMark(t.t.m, t.t.c))}</div>` : ""}
    <p class="streakline">Enter fyrir næstu.</p></div>`;
  });
}

/* ================= 4. Setningarhlutar ================================== */

RENDER.syntax = function (app) {
  const t = app.cur;
  $("task").innerHTML = `
  <div class="card">
    <p class="eyebrow"><span>Smelltu á rétta orðið</span>${skillTag(t)}</p>
    <p class="sentence" id="picker">${t.s.tok.map((tok, j) => PUNCT.has(tok.w) ? tok.w
      : `${j ? " " : ""}<span class="pickw" data-j="${j}">${esc(tok.w)}</span>`)
      .join("")}</p>
    <p class="gloss">Hvaða orð er ${fmt(t.askRole)} í málsgreininni? Ef þau eru fleiri en eitt dugar að smella á eitt þeirra.</p>
    <div class="answer"><button class="go" id="check">Athuga</button></div>
    <div id="verdict"></div>
  </div>`;
  document.querySelectorAll(".pickw").forEach((el) => {
    el.onclick = () => {
      if (t.done) return;
      document.querySelectorAll(".pickw").forEach((x) => x.classList.remove("sel"));
      el.classList.add("sel");
      t.picked = +el.dataset.j;
    };
  });
  $("check").onclick = () => submitSyntax(app);
};

function submitSyntax(app) {
  const t = app.cur;
  const j = judge(t, { picked: t.picked }, app);
  if (j.pending) {
    $("verdict").innerHTML = `<div class="verdict neutral"><p>Smelltu á orð fyrst.</p></div>`;
    return;
  }
  const { good } = j.detail;
  const ok = j.ok, xp = j.xp;
  document.querySelectorAll(".pickw").forEach((el) => {
    const k = +el.dataset.j;
    if (good.includes(k)) el.classList.add("right");
    else if (k === t.picked && j.verdict === "wrong") el.classList.add("wrongpick");
  });
  t.done = true;
  /* "Frumlag er …" — a sentence begins with a capital, also when its first
     word is a term with a glossary link. */
  const roleName = t.askRole.charAt(0).toUpperCase() + t.askRole.slice(1);
  const answer = `<p>${fmt(roleName)} er <span class="forms">${
    good.map((k) => esc(t.s.tok[k].w)).join(", ")}</span>.</p>`;

  conclude(app, t, j, () => {
    /* A word the build could not vouch for either way (`rn`): not right, not
       wrong, and said so. Nothing is recorded against the child. */
    if (j.verdict === "unjudged") {
      $("verdict").innerHTML = `<div class="verdict neutral">
      <h3>Þetta orð er ekki metið</h3>
      <p>Um hlutverk orðsins <span class="forms">${esc(t.s.tok[t.picked].w)}</span> í þessari
        málsgrein má deila, svo svarið telst hvorki rétt né rangt.</p>
      ${answer}
      <p class="streakline">Enter fyrir næstu.</p></div>`;
      return;
    }
    $("verdict").innerHTML = `<div class="verdict ${ok ? "ok" : "no"}"><span class="xpop">+${xp} XP</span>
    <h3>${ok ? cheer(CHEERS_OK) : "Ekki alveg"}</h3>
    ${answer}
    ${whyBox(structureNote(t.s), "bygging")}
    <p class="streakline">Enter fyrir næstu.</p></div>`;
  });
}

/* Whether a click is right for a role is decided in core/answer.js
   (`judgeSyntax`); it is exported from here too, for the tests that read it
   beside `structureNote`. */

/** One line on the clause structure, or null when the build does not vouch
    for it (`ku`). "Setning" is one clause; the whole is a "málsgrein". */
export function structureNote(s) {
  if (s.ku) return null;
  const kinds = [...new Set(s.tok.map((x) => x.k).filter(Boolean))];
  if (!kinds.length) return null;
  if (kinds.length === 1) return `Málsgreinin er ein ${kinds[0]}.`;
  const last = kinds[kinds.length - 1];
  return `Í málsgreininni eru ${kinds.slice(0, -1).join(", ")} og ${last}.`;
}

/* ================= 5. Beygingartafla =================================== */

const KINDNAME = { no: "nafnorð", lo: "lýsingarorð", so: "sagnorð",
                   fn: "fornafn", gr: "greinir", to: "töluorð" };

/* The title reads "eðlilegur · frumstig, veik beyging · karlkyn eintala". The
   word itself should not get a glossary link, but everything else should. */
function tableTitleHTML(title) {
  const [lemma, ...rest] = String(title).split(" · ");
  const tail = rest.map((part) => fmt(part)).join('<span class="tsep">·</span>');
  return `<span class="tlemma">${esc(lemma)}</span>` +
         (tail ? `<span class="tspec">${tail}</span>` : "");
}

RENDER.table = function (app) {
  const t = app.cur;
  $("task").innerHTML = `
  <div class="card">
    <p class="eyebrow"><span>Fylltu út alla reitina</span><b>${esc(KINDNAME[t.kind] || "")}</b></p>
    <p class="sentence tabletitle">${tableTitleHTML(t.title)}</p>
    ${t.sample ? `<p class="gloss">Nefnifallið er <span class="forms">${esc(t.sample)}</span> og er gefið — beygðu lýsingarorðið eins með nafnorðinu í hinum föllunum.</p>` : ""}
    ${defBox(app, t.w)}
    <table class="decl">${t.cells.map((c, k) => `<tr><th class="rowh">${esc(c.label)}</th>
      <td><div class="cellrow">${t.sample && k === 0
        /* v6.10: the nominative shown above is not asked for again. */
        ? `<input type="text" class="given" data-given="1" value="${esc((t.w.forms[c.m] || [""])[0])}" disabled>`
        : `<input type="text" data-m="${esc(c.m)}" autocomplete="off" autocapitalize="off" spellcheck="false">`}${
        c.helper ? `<span class="helpernoun">${esc(c.helper)}</span>` : ""}</div>
      <span class="fix" data-fix="${esc(c.m)}"></span></td></tr>`).join("")}</table>
    <p class="helpnote">${t.kind === "lo"
      ? "Skrifaðu bara lýsingarorðið — nafnorðið stendur við hliðina. Hjálparorð eru samt í lagi."
      : "Hjálparorð eru í lagi — skrifaðu til dæmis „um fínan strák“ ef það er skýrara."}</p>
    <div class="keys" id="keys" style="margin-top:14px"></div>
    <div class="answer"><button class="go" id="check">Athuga töfluna</button></div>
    <div id="verdict"></div>
  </div>`;
  wireKeys();
  const ins = [...document.querySelectorAll("table.decl input:not([data-given])")];
  ins[0].focus();
  /* Enter moves the focus to the next field and submits the table from the
     last one. A repeat from a held key must not hop down the whole table and
     submit it half-written — the same guard as everywhere else. */
  ins.forEach((el, i) => el.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (!freshEnter(e)) return;
    i + 1 < ins.length ? ins[i + 1].focus() : submitTable(app);
  }));
  $("check").onclick = () => submitTable(app);
};

/* The paradigm with its helper noun, shown *after* the answer.

   The question does not show how the word changes — that is the exercise. The
   explanation does, and with the helper word, because that is how the child will
   hear it: not *þeim* but *þeim manni*. The forms come from BÍN via
   core/helpers.js. */
function helperTable(t) {
  if (!t.helperRows || !t.helperRows.length) return "";
  const rows = t.helperRows
    .map((r) => `<tr><th>${abbr(caseName(r.fall === "ÞGF" ? "ÞG" : r.fall))}</th>
      <td><span class="forms">${esc(r.text)}</span></td></tr>`).join("");
  return `<div class="why"><b>fornafnið með nafnorði</b>
    <table class="helperpara">${rows}</table>
    <span class="gloss" style="font-size:12px">Fornafnið beygist með nafnorðinu — sama fall,
      sama kyn, sama tala. Hjálparorðið hér er <em>${esc(t.helperLemma || "")}</em>;
      það mætti eins vera hvaða nafnorð sem er í sama kyni.</span></div>`;
}

function submitTable(app) {
  const t = app.cur;
  const ins = [...document.querySelectorAll("table.decl input:not([data-given])")];
  const j = judge(t, { cells: ins.map((el) => el.value) }, app);
  const { cells, right, hedged: hedgedCells } = j.detail;
  const perfect = j.ok;

  ins.forEach((el, k) => {
    const c = cells[k];
    el.classList.add(c.ok ? "ok" : "no");
    el.disabled = true;
    if (!c.ok)
      document.querySelector(`[data-fix="${CSS.escape(c.m)}"]`).textContent = c.accepted.join(" / ");
  });

  conclude(app, t, j, () => {
    $("verdict").innerHTML = `<div class="verdict ${perfect ? "ok" : "no"}">
    <span class="xpop">+${j.xp} XP</span>
    <h3>${right} / ${ins.length}${perfect ? " — heil tafla!" : ""}</h3>
    <p>${perfect ? "Allt rétt. Bónus bætt við." : "Réttu myndirnar standa undir þeim rauðu."}</p>
    ${hedgedCells.length ? `<p class="streakline">Í ${hedgedCells.length === 1 ? "einum reit" : hedgedCells.length + " reitum"} skrifaðir þú fleiri en eina mynd — veldu eina næst.</p>` : ""}
    ${helperTable(t)}
    ${whyBox(t.why, "athugið")}
    <p class="streakline">Enter fyrir næstu.</p></div>`;
  });
}

/* ================= 6. Word meaning ===================================== */

RENDER.meaning = function (app) {
  const n = app.cur.n;
  $("task").innerHTML = `
  <div class="card">
    <p class="eyebrow"><span>Útskýrðu orðið með þínum eigin orðum</span>${skillTag(app.cur)}</p>
    <p class="sentence">Hvað þýðir orðið <span class="target">${esc(n.o)}</span>?</p>
    <p class="gloss">Skrifaðu heila setningu. Það er engin ein rétt leið til að útskýra orð.</p>
    <div style="margin-top:16px"><textarea id="freetext" rows="3" placeholder="${esc(n.o)} er…"></textarea></div>
    <div class="keys" id="keys"></div>
    <div class="answer"><button class="go" id="check">Senda</button></div>
    <div id="verdict"></div>
  </div>`;
  wireKeys();
  $("freetext").focus();
  $("check").onclick = () => submitMeaning(app);
};

function submitMeaning(app) {
  const t = app.cur;
  const n = t.n;
  /* Nothing grades the text, but the same sentence pasted every time, or a
     word or two, earns no XP (v6.10) — core/answer.js. */
  const j = judge(t, { text: $("freetext").value }, app);
  if (j.pending) return;
  const xp = j.xp, effort = j.detail.effort;
  conclude(app, t, j, () => {
    $("freetext").disabled = true;
    $("verdict").innerHTML = `<div class="verdict neutral">${xp ? `<span class="xpop">+${xp} XP</span>` : ""}
    <h3>${effort ? cheer(CHEERS_TRY) : "Engin XP að þessu sinni"}</h3>
    ${effort ? "" : `<p class="streakline">XP fæst fyrir eigin útskýringu í heilli setningu — ekki sama textann aftur.</p>`}
    <p>Í orðabók er <span class="forms">${esc(n.o)}</span> útskýrt svona: <b>${esc(n.d)}</b>.</p>
    ${n.x ? `<div class="why"><b>dæmi um notkun</b>${esc(n.x)}</div>` : ""}
    <p class="streakline">Þessi spurning telur ekki í rétt/rangt. Enter.</p></div>`;
  });
}

/* ================= 7. Fallstjórn ======================================= */

RENDER.govern = function (app) {
  const t = app.cur;
  $("task").innerHTML = `
  <div class="card">
    <p class="eyebrow"><span>Hvaða falli stýrir orðið?</span>${skillTag(t)}</p>
    <p class="sentence">${sentenceHTML(t.s, t.i, `<span class="target">${esc(t.t.w)}</span>`)}</p>
    <p class="gloss">${t.t.c === "sagnorð"
      ? `Sögnin <b>${esc(t.t.l)}</b> — í hvaða falli stendur andlagið hennar?`
      : `Forsetningin <b>${esc(t.t.w.toLowerCase())}</b> — í hvaða falli stendur orðið sem hún stýrir?`}</p>
    ${/* v6.9: not for a preposition. ÍNO defines *í* and *á* BY their
         government ("um hreyfingu … (með þolfalli) og dvöl … (með þágufalli)"),
         so the dictionary line handed over the rule the question asks about. */
      t.t.c === "forsetning" ? "" : defBox(app, focusEntry(app, t))}
    <div class="qrow"><div class="opts" data-q="fall">
      ${CASES.map((c) => `<button type="button" data-v="${c.k}">${c.name}</button>`).join("")}</div></div>
    <div class="answer"><button class="go" id="check">Athuga</button></div>
    <div id="verdict"></div>
  </div>`;
  document.querySelectorAll(".opts").forEach((box) => {
    box.onclick = (e) => {
      const b = e.target.closest("button");
      if (!b || b.disabled) return;
      box.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b));
      if (t.picked && t.picked !== b.dataset.v) t.changes = (t.changes || 0) + 1;
      t.picked = b.dataset.v;
    };
  });
  $("check").onclick = () => submitGovern(app);
};

function submitGovern(app) {
  const t = app.cur;
  const j = judge(t, { picked: t.picked }, app);
  if (j.pending) {
    $("verdict").innerHTML = `<div class="verdict neutral"><p>Veldu fall.</p></div>`;
    return;
  }
  const ok = j.ok, xp = j.xp;
  document.querySelectorAll(".opts button").forEach((b) => {
    b.disabled = true;
    if (b.dataset.v === t.fall) b.classList.add("right");
    else if (b.getAttribute("aria-pressed") === "true") b.classList.add("wrongpick");
    b.removeAttribute("aria-pressed");
  });
  const cs = CASES.find((c) => c.k === t.fall);
  const prep = String(t.t.w).toLowerCase();
  /* The motion/rest rule is for í, á, undir, yfir. með, eftir and fyrir
     also take two cases, but by MEANING, not by motion (v6.10). */
  const MOTION = ["í", "á", "undir", "yfir"];
  const BY_MEANING = ["með", "eftir", "fyrir"];
  const body = t.t.c === "sagnorð"
    ? `Sögnin *${t.t.l}* stýrir ${cs.name}i: andlagið stendur í ${cs.name}i.`
    : `Hér stýrir forsetningin *${prep}* ${cs.name}i.` + (MOTION.includes(prep)
      ? " Hún er ein þeirra forsetninga sem stýra ýmist þolfalli eða þágufalli — um **stað** stýra *í* og *á* til dæmis þolfalli þegar um hreyfingu er að ræða en þágufalli þegar um kyrrstöðu er að ræða. Um **tíma** gildir sú regla ekki."
      : BY_MEANING.includes(prep)
        ? " Hún stýrir ýmist þolfalli eða þágufalli, og það fer eftir **merkingunni** — ekki eftir því hvort um hreyfingu sé að ræða (t.d. *með hundinn* = hefur hann með sér, *með hundinum* = ásamt honum)."
        : "");
  conclude(app, t, j, () => {
    $("verdict").innerHTML = `<div class="verdict ${ok ? "ok" : "no"}"><span class="xpop">+${xp} XP</span>
    <h3>${ok ? cheer(CHEERS_OK) : "Ekki alveg"}</h3>
    <p>${fmt(body)}</p>
    <div class="why"><b>prófaðu</b>${fmt("Spurðu þig: *" + cs.q + "*")}</div>
    <p class="streakline">Enter fyrir næstu.</p></div>`;
  });
}

/* ================= 8. Indeclinable words =============================== */

const INDECL_OPTS = ["atviksorð", "forsetning", "samtenging", "upphrópun", "nafnháttarmerki"];

RENDER.indecl = function (app) {
  const t = app.cur;
  $("task").innerHTML = `
  <div class="card">
    <p class="eyebrow"><span>Í hvaða orðflokki er orðið?</span>${skillTag(t)}</p>
    <p class="sentence">${sentenceHTML(t.s, t.i, `<span class="target">${esc(t.t.w)}</span>`)}</p>
    <p class="gloss">Orðið <b>${esc(t.t.w)}</b> beygist ekki. Hvaða flokki tilheyrir það?</p>
    ${defBox(app, focusEntry(app, t), { locked: true })}
    <div class="qrow"><div class="opts" data-q="fl">
      ${INDECL_OPTS.map((o) => `<button type="button" data-v="${o}">${o}</button>`).join("")}</div></div>
    <div class="answer"><button class="go" id="check">Athuga</button></div>
    <div id="verdict"></div>
  </div>`;
  document.querySelectorAll(".opts").forEach((box) => {
    box.onclick = (e) => {
      const b = e.target.closest("button");
      if (!b || b.disabled) return;
      box.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b));
      if (t.picked && t.picked !== b.dataset.v) t.changes = (t.changes || 0) + 1;
      t.picked = b.dataset.v;
    };
  });
  $("check").onclick = () => submitIndecl(app);
};

function submitIndecl(app) {
  const t = app.cur;
  const j = judge(t, { picked: t.picked }, app);
  if (j.pending) {
    $("verdict").innerHTML = `<div class="verdict neutral"><p>Veldu orðflokk.</p></div>`;
    return;
  }
  const ok = j.ok, xp = j.xp;
  document.querySelectorAll(".opts button").forEach((b) => {
    b.disabled = true;
    if (b.dataset.v === t.answer) b.classList.add("right");
    else if (b.getAttribute("aria-pressed") === "true") b.classList.add("wrongpick");
    b.removeAttribute("aria-pressed");
  });
  conclude(app, t, j, () => {
    $("verdict").innerHTML = `<div class="verdict ${ok ? "ok" : "no"}"><span class="xpop">+${xp} XP</span>
    <h3>${ok ? cheer(CHEERS_OK) : "Ekki alveg"}</h3>
    <p><span class="forms">${esc(t.t.w)}</span> er ${fmt(t.answer)}.</p>
    <p class="streakline">Enter fyrir næstu.</p></div>`;
    unlockDefBox(app, focusEntry(app, t));
  });
}

/* ================= 11. Clause types (years 9-10) =====================
 *
 * The same renderer as the other multiple-choice questions. The part being asked
 * about is highlighted inside the sentence itself — the child should see *where*
 * the clause begins and ends, because that is half of recognising it.
 */

const CLAUSE_WHY = {
  "aðalsetning": "getur staðið ein og sér sem heil málsgrein",
  "aukasetning": "getur ekki staðið ein og sér heldur er hún liður í annarri setningu; hún hefst oftast á samtengingu (að, sem, þegar, ef, hvort …)",
  "nafnháttarsetning": "er mynduð með sögn í nafnhætti (að + nafnháttur) og hefur ekkert sýnilegt frumlag",
};

RENDER.clause = function (app) {
  const t = app.cur;
  const marked = t.s.tok.map((tok, j) => {
    if (PUNCT.has(tok.w)) return tok.w;
    const sp = j === 0 ? "" : " ";
    const inside = j >= t.span.from && j <= t.span.to;
    return sp + (inside ? `<span class="clausemark">${wordHTML(tok)}</span>` : wordHTML(tok));
  }).join("");

  $("task").innerHTML = `
  <div class="card">
    <p class="eyebrow"><span>Hvers konar setning er undirstrikaði hlutinn?</span>${skillTag(t)}<b>þyngd ${t.lvl}</b></p>
    <p class="sentence">${marked}</p>
    <p class="gloss">Aðalsetning getur staðið ein og sér. Aukasetning er liður í annarri setningu.
      Nafnháttarsetning er mynduð með sögn í nafnhætti.</p>
    <div class="qrow"><div class="opts" data-q="gerd">
      ${t.options.map((o) => `<button type="button" data-v="${esc(o)}">${esc(o)}</button>`).join("")}</div></div>
    <div class="answer"><button class="go" id="check">Athuga</button></div>
    <div id="verdict"></div>
  </div>`;

  document.querySelectorAll(".opts").forEach((box) => {
    box.onclick = (e) => {
      const b = e.target.closest("button");
      if (!b || b.disabled) return;
      box.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b));
      if (t.picked && t.picked !== b.dataset.v) t.changes = (t.changes || 0) + 1;
      t.picked = b.dataset.v;
    };
  });
  $("check").onclick = () => submitClause(app);
};

function submitClause(app) {
  const t = app.cur;
  const j = judge(t, { picked: t.picked }, app);
  if (j.pending) {
    $("verdict").innerHTML = `<div class="verdict neutral"><p>Veldu setningagerð.</p></div>`;
    return;
  }
  const ok = j.ok, xp = j.xp;
  document.querySelectorAll(".opts button").forEach((b) => {
    b.disabled = true;
    if (b.dataset.v === t.answer) b.classList.add("right");
    else if (b.getAttribute("aria-pressed") === "true") b.classList.add("wrongpick");
    b.removeAttribute("aria-pressed");
  });
  const words = t.s.tok.slice(t.span.from, t.span.to + 1).map((x) => x.w).join(" ");
  conclude(app, t, j, () => {
    $("verdict").innerHTML = `<div class="verdict ${ok ? "ok" : "no"}"><span class="xpop">+${xp} XP</span>
    <h3>${ok ? cheer(CHEERS_OK) : "Ekki alveg"}</h3>
    <p><span class="forms">${esc(words)}</span> er <b>${esc(t.answer)}</b> — hún ${esc(CLAUSE_WHY[t.answer] || "")}.</p>
    <p class="streakline">Enter fyrir næstu.</p></div>`;
  });
}

/* ================= 12. Málbeiting (v6.9) ===============================
 *
 * Three questions where the child writes the Icelandic. Builders in
 * tasks/malbeiting.js, grading in core/answer.js; what is graded is always
 * a form BÍN has.
 */

/* ---------- Villuveiðar --------------------------------------------------- */

/* v6.10: two sentences, one above the other — no chat, news or game frame.
   After the verdict the text reads as it should: every error shows its right
   form, green if the child fixed it and red if it was missed. An agreement
   error mended at its other end (`g.viaAlt`) keeps its form, and the word the
   child changed is shown as they wrote it, in green. */
function huntTextHTML(t, mark = null, g = null) {
  const h = t.hunt;
  const viaAlt = new Set(g ? g.viaAlt || [] : []);
  const altKeys = new Set();
  h.lines.forEach((ln, li) => ln.toks.forEach((tk, ti) => {
    if (tk.err && tk.err.alt && viaAlt.has(`${li}:${ti}`)) altKeys.add(tk.err.alt.key);
  }));
  const tokHTML = (ln, li) => ln.toks.map((tk, ti) => {
    if (tk.punct) return esc(tk.w);
    const key = `${li}:${ti}`;
    const sp = ti === 0 ? "" : " ";
    let cls = mark ? mark(key, tk) : "";
    let shown = tk.w;
    if (mark && tk.err && !viaAlt.has(key)) shown = tk.right;
    if (mark && altKeys.has(key)) { shown = t.edits[key]; cls = "right"; }
    return `${sp}<span class="huntw ${cls}" data-k="${key}" ${mark ? "" : 'role="button" tabindex="0"'}>${esc(shown)}</span>`;
  }).join("");
  return `<div class="hunt plain">` +
    h.lines.map((ln, li) => `<p class="huntline">${tokHTML(ln, li)}</p>`).join("") + `</div>`;
}

const tokAt = (t, key) => {
  const [li, ti] = key.split(":").map(Number);
  return t.hunt.lines[li].toks[ti];
};

function renderHuntEdits(t) {
  const keys = Object.keys(t.edits);
  $("huntedits").innerHTML = keys.length
    ? keys.map((k) => `<div class="huntedit"><span class="forms">${esc(tokAt(t, k).w)}</span>
        <span class="arrow">→</span>
        <input type="text" data-k="${k}" value="${esc(t.edits[k])}" autocomplete="off"
          autocapitalize="off" spellcheck="false" aria-label="Rétt mynd orðsins ${esc(tokAt(t, k).w)}">
        <button type="button" class="ghost undo" data-k="${k}" title="Hætta við">✕</button></div>`).join("")
    : "";
  document.querySelectorAll("#huntedits input").forEach((inp) => {
    inp.oninput = () => { t.edits[inp.dataset.k] = inp.value; };
    enterToSubmit(inp, () => $("check").click());
  });
  document.querySelectorAll("#huntedits .undo").forEach((b) => {
    b.onclick = () => toggleHunt(t, b.dataset.k);
  });
}

function toggleHunt(t, key) {
  if (t.done) return;
  const el = document.querySelector(`.huntw[data-k="${key}"]`);
  if (key in t.edits) { delete t.edits[key]; el?.classList.remove("sel"); }
  else { t.edits[key] = tokAt(t, key).w; el?.classList.add("sel"); }
  renderHuntEdits(t);
  const inp = document.querySelector(`#huntedits input[data-k="${key}"]`);
  if (inp) { inp.focus(); inp.select(); }
}

/* The instruction under Villuveiðar. Generated sentences carry a planted case
   or agreement error, and say so. A hand-banked item (`hunt.source === "bank"`,
   tasks/malbeiting.js) may hold any kind of error — spelling, word choice,
   word order — so it must not claim "í falli eða samræmi"; it only says there
   is something wrong and what to do about it. */
export function huntHint(t, n) {
  if (t.hunt.source === "bank")
    return `Í setningunum ${n === 1 ? "er ein villa" : `eru ${n} villur, ein í hvorri`}. ` +
      "Finndu orðið sem er rangt, smelltu á það og skrifaðu það rétt.";
  return `Í setningunum ${n === 1 ? "er ein villa" : `eru ${n} villur, ein í hvorri`} í falli eða samræmi.
      Smelltu á orðið sem er rangt og skrifaðu það rétt. Ef tvö orð passa ekki saman
      er nóg að breyta öðru þeirra.`;
}

RENDER.villur = function (app) {
  const t = app.cur;
  const n = t.hunt.errors;
  $("task").innerHTML = `
  <div class="card">
    <p class="eyebrow"><span>Villuveiðar</span>${skillTag(t)}<b>þyngd ${t.lvl}</b></p>
    ${huntTextHTML(t)}
    <p class="gloss">${huntHint(t, n)}</p>
    <div id="huntedits" class="huntedits"></div>
    <div class="keys" id="keys"></div>
    <div class="answer"><button class="go" id="check">Athuga</button></div>
    <div id="verdict"></div>
  </div>`;
  wireKeys();
  renderHuntEdits(t);
  document.querySelectorAll(".huntw").forEach((el) => {
    el.onclick = () => toggleHunt(t, el.dataset.k);
    el.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleHunt(t, el.dataset.k); } };
  });
  $("check").onclick = () => submitHunt(app);
};

function submitHunt(app) {
  const t = app.cur;
  if (t.done) return;
  const j = judge(t, { edits: t.edits }, app);
  t.done = true;
  const { g, fixed, total: n } = j.detail;
  const xp = j.xp;

  const marked = huntTextHTML(t, (key, tk) => {
    if (tk.err) return g.viaAlt.includes(key) ? "" : g.fixed.includes(key) ? "right" : "missed";
    return g.falseAlarm.includes(key) ? "wrongpick" : "";
  }, g);
  const list = [];
  t.hunt.lines.forEach((ln, li) => ln.toks.forEach((tk, ti) => {
    if (!tk.err) return;
    const key = `${li}:${ti}`;
    const typed = t.edits[key];
    const state = g.fixed.includes(key) ? "✓" : g.wrongFix.includes(key) ? "✗" : "—";
    const alt = tk.err.alt;
    if (alt && g.viaAlt.includes(key)) {
      list.push(`<li><span class="mk ok">✓</span>
        <span class="forms">${esc(alt.w)}</span> → <span class="forms">${esc(t.edits[alt.key])}</span>
        <span class="faint">— þú lagaðir hinn enda villunnar, og það er rétt. Hin leiðin:
        <span class="forms">${esc(tk.w)}</span> → <span class="forms">${esc(tk.err.answers[0])}</span>.</span>
        <br><span class="huntwhy">${fmt(tk.err.why)}</span></li>`);
      return;
    }
    list.push(`<li><span class="mk ${state === "✓" ? "ok" : "no"}">${state}</span>
      <span class="forms">${esc(tk.w)}</span> → <span class="forms">${esc(tk.err.answers.slice(0, 2).join(" / "))}</span>
      ${state === "✗" ? ` <span class="faint">(þú skrifaðir ${esc(typed)})</span>` : ""}
      ${state === "✓" && typed && normalise(typed) !== normalise(tk.err.answers[0])
        ? ` <span class="faint">(þú skrifaðir ${esc(typed)}, sem er líka rétt)</span>` : ""}
      <br><span class="huntwhy">${fmt(tk.err.why)}</span>
      ${alt && state !== "✓" && tk.err.altWhy ? `<br><span class="huntwhy">${fmt(tk.err.altWhy)}</span>` : ""}</li>`);
  }));
  const alarmList = g.falseAlarm.map((k) => {
    const tk = tokAt(t, k);
    return `<li><span class="mk no">!</span> <span class="forms">${esc(tk.w)}</span> var rétt —
      þú breyttir því í <span class="forms">${esc(t.edits[k])}</span>.</li>`;
  });
  conclude(app, t, j, () => {
    document.querySelector("#task .hunt").outerHTML = marked;
    $("huntedits").innerHTML = "";
    $("verdict").innerHTML = `<div class="verdict ${g.ok ? "ok" : "no"}">${xp ? `<span class="xpop">+${xp} XP</span>` : ""}
    <h3>${g.ok ? cheer(CHEERS_OK) : `${fixed} af ${n} villum lagaðar`}</h3>
    <ul class="huntlist">${list.join("")}${alarmList.join("")}</ul>
    ${g.ok ? "" : `<p class="streakline">Textinn stendur nú réttur. Grænt: villa sem þú lagaðir. Rautt: villa sem stóð eftir. Yfirstrikað: rétt orð sem þú breyttir.</p>`}
    <p class="streakline">Enter fyrir næstu.</p></div>`;
  });
}

/* ---------- Setningasmiðja ------------------------------------------------ */

const cardHTML = (c, state = "") =>
  `<span class="wcard ${state}">${esc(c.text)}${c.tags.length
    ? `<small>${c.tags.map((x) => fmt(x)).join(", ")}</small>` : ""}</span>`;

RENDER.smidja = function (app) {
  const t = app.cur;
  $("task").innerHTML = `
  <div class="card">
    <p class="eyebrow"><span>Setningasmiðja</span>${skillTag(t)}<b>þyngd ${t.lvl}</b></p>
    <div class="wcards">${t.cards.map((c) => cardHTML(c)).join('<span class="wdash">–</span>')}</div>
    <p class="gloss">Búðu til eina setningu úr orðunum, í þessari röð. Beygðu hvert orð svo það passi
      í setninguna. Tíð sagnarinnar og tala nafnorðanna standa á spjöldunum; fallið finnur þú sjálf(ur).</p>
    <div class="answer">
      <input type="text" id="ans" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="skrifaðu setninguna…">
      <button class="go" id="check">Athuga</button></div>
    <div class="keys" id="keys"></div><div id="verdict"></div>
  </div>`;
  wireKeys();
  const inp = $("ans");
  inp.focus();
  enterToSubmit(inp, () => submitWorkshop(app));
  $("check").onclick = () => submitWorkshop(app);
};

function submitWorkshop(app) {
  const t = app.cur;
  const val = $("ans").value;
  if (!val.trim() || t.done) return;
  const response = { text: val };
  const j = judgeTry(app, t, response);
  if (j.verdict === "same") return say(t, SAME_AGAIN);
  if (j.pending) return;
  const draw = () => drawWorkshop(app, t, j);
  if (t.retrying) return endRetry(app, t, j, draw);
  /* Item 42, extended (review of v6.13, S7): the cards whose word is not
     right go red, and that is all — not the form, not the case. The pupil
     then writes those forms from nothing, as in a cloze's second try. */
  const { g, right, total } = j.detail;
  if (offerRetry(app, t, j, {
    response, why: "",
    prompt: "Lagaðu orðin á rauðu spjöldunum og skrifaðu setninguna aftur.",
    note: `<div class="why"><b>athugið</b>${right} af ${total} orðum rétt beygð.${g.extra.length
      ? ` Þessi orð áttu ekki heima í setningunni: ${g.extra.map(esc).join(", ")}` : ""}</div>`,
    inputs: [$("ans")], reveal: draw,
    onMiss: () => { document.querySelector("#task .wcards").innerHTML = t.cards.map((c, k) =>
      cardHTML(c, !c.fixed && !g.per[k].ok ? "wrongpick" : "")).join('<span class="wdash">–</span>'); },
  })) return;
  conclude(app, t, j, draw);
}

function drawWorkshop(app, t, j) {
  t.done = true;
  const { g, right, total } = j.detail;
  const ok = j.ok, xp = j.xp;
  $("ans").disabled = true;
  document.querySelector("#task .wcards").innerHTML = t.cards.map((c, k) =>
    cardHTML(c, c.fixed ? "" : g.per[k].ok ? "right" : "wrongpick")).join('<span class="wdash">–</span>');
  const model = t.answers[0];
  const misses = t.cards.map((c, k) => (!c.fixed && !g.per[k].ok)
    ? `<li><span class="forms">${esc(c.text)}</span> → <span class="forms">${esc(c.answers.slice(0, 2).join(" / "))}</span>
       ${g.per[k].misformed ? `<span class="faint">(þú skrifaðir <span class="forms">${esc(g.per[k].typed)}</span> — rangt beygt)</span>` : ""}
       <span class="faint">${fmt(describeMark(c.m, c.e && ["kk", "kvk", "hk"].includes(c.e.c) ? "nafnorð" : null))}</span></li>` : "").join("");
  const slips = g.per.filter((p) => p.ok && p.slip);
  const head = ok && j.retry ? retryRightHTML(xp)
    : `${xp ? `<span class="xpop">+${xp} XP</span>` : ""}
    <h3>${ok ? cheer(CHEERS_OK) : `${right} af ${total} orðum rétt beygð`}</h3>`;
  $("verdict").innerHTML = `<div class="verdict ${ok ? "ok" : "no"}">${head}
    <p>${ok && g.inOrder && !j.retry ? "" : "Rétt: "}<b>${esc(model)}</b></p>
    ${ok && !g.inOrder ? `<p class="streakline">Öll orðin eru rétt beygð. Röðin hér að ofan er sú sem spjöldin sýndu.</p>` : ""}
    ${misses ? `<ul class="huntlist">${misses}</ul>` : ""}
    ${slips.length ? `<p class="streakline">Gáðu að broddunum: ${slips.map((p) => `<span class="forms">${esc(p.typed)}</span> → <span class="forms">${esc(p.form)}</span>`).join(", ")}</p>` : ""}
    ${g.extra.length ? `<p class="streakline">Þessi orð áttu ekki heima í setningunni: ${g.extra.map(esc).join(", ")}</p>` : ""}
    ${whyBox(structureNote(t.s), "bygging")}
    ${ok && j.retry ? RETRY_STILL_MISS : ""}
    <p class="streakline">Enter fyrir næstu.</p></div>`;
}

/* ---------- Umritun ------------------------------------------------------- */

RENDER.umritun = function (app) {
  const t = app.cur;
  /* v6.13: some kinds show something other than the bank sentence — a
     passive (`from`), two sentences to join (`lines`), a quotation. */
  const shown = t.lines ? t.lines.map((l, k) => glossedText(l, t.linesTok && t.linesTok[k])).join("<br>")
    : t.from ? glossedText(t.from, t.fromTok) : t.s.tok.map((tok, j) => {
    if (PUNCT.has(tok.w)) return tok.w;
    const sp = j === 0 ? "" : " ";
    const inside = t.focus && j >= t.focus.from && j <= t.focus.to;
    return sp + (inside ? `<span class="clausemark">${wordHTML(tok)}</span>` : wordHTML(tok));
  }).join("");
  $("task").innerHTML = `
  <div class="card">
    <p class="eyebrow"><span>${esc(t.title || "Umritun · " + (TRANSFORM_NAME[t.kind] || ""))}</span>${skillTag(t)}<b>þyngd ${t.lvl}</b></p>
    <p class="sentence">${shown}</p>
    <p class="gloss">${fmt(t.instruction)}</p>
    <div class="answer">
      <input type="text" id="ans" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="skrifaðu alla setninguna…">
      <button class="go" id="check">Athuga</button>
      <button class="ghost" id="hint">Vísbending</button></div>
    <div class="keys" id="keys"></div><div id="verdict"></div>
  </div>`;
  wireKeys();
  const inp = $("ans");
  inp.focus();
  enterToSubmit(inp, () => submitTransform(app));
  $("check").onclick = () => submitTransform(app);
  $("hint").onclick = () => {
    t.hinted = true;
    $("hint").disabled = true;
    $("verdict").innerHTML = `<div class="verdict neutral"><h3>Vísbending</h3>
      <p>${fmt(t.hint || TRANSFORM_HINT[t.kind] || "")}</p>
      <p class="streakline">Vísbending gefur helmingi minna XP — hún telst ekki sem villa.</p></div>`;
  };
};

const TRANSFORM_NAME = {
  past: "þátíð", plural: "fleirtala", passive: "þolmynd",
  igaer: "Í gær …", amorgun: "Á morgun …",
  active: "germynd", question: "spurning", join: "tenging", indirect: "óbein ræða",
};
const TRANSFORM_HINT = {
  past: "Finndu sagnirnar sem beygjast í persónu og settu þær í þátíð. Annað breytist ekki.",
  plural: "Frumlagið fer í fleirtölu. Hvaða orð laga sig að því? Sögnin gerir það alltaf, og lýsingarorð eða fornöfn sem standa með því.",
  passive: "Andlagið verður frumlag og stendur fremst. Svo kemur *vera* í sömu tíð og sögnin var og lýsingarháttur þátíðar.",
  igaer: "Sögnin stendur alltaf í öðru sæti. Ef *Í gær* er fremst, hvar lendir þá frumlagið? Og í hvaða tíð er sögnin?",
  amorgun: "Sögnin stendur alltaf í öðru sæti. Ef *Á morgun* er fremst, hvar lendir þá frumlagið? Um framtíð notum við oftast nútíð.",
  active: "Hver gerði það? Sá sem stendur á eftir *af* verður frumlag og fer í nefnifall. Sögnin beygist sjálf, í sömu tíð og *er* eða *var*.",
  question: "Í já/nei-spurningu kemur sögnin fremst og frumlagið strax á eftir. Annað stendur óbreytt.",
  join: "Á eftir aukatengingu (*þegar, ef, áður en* …) stendur frumlagið á undan sögninni. Ef aukasetningin er fremst kemur sögnin í aðalsetningunni strax á eftir henni.",
  indirect: "Byrjaðu á *… að* og slepptu gæsalöppunum. Sögnin fer í viðtengingarhátt, og *ég* verður sá sem talaði.",
};

/** The model answer with the words that differ from the original in bold. */
function changedHTML(model, original) {
  const orig = new Set(normalise(original).split(" "));
  return model.split(" ").map((w) =>
    orig.has(normalise(w)) ? esc(w) : `<b>${esc(w)}</b>`).join(" ");
}

function submitTransform(app) {
  const t = app.cur;
  const val = $("ans").value;
  if (!val.trim() || t.done) return;
  const response = { text: val, hinted: !!t.hinted };
  const j = judgeTry(app, t, response);
  if (j.verdict === "same") return say(t, SAME_AGAIN);
  if (j.pending) return;
  if (j.ok === false) (t.tries ||= []).push({ typed: val });
  const draw = () => drawTransform(app, t, j, val);
  if (t.retrying) return endRetry(app, t, j, draw);
  /* Item 42: the rule is the kind's own (the hint's text), and the note on
     what this rewrite got wrong (`transformNote`) — not `t.why`, which
     explains the answer by quoting it. */
  if (offerRetry(app, t, j, {
    response, why: TRANSFORM_HINT[t.kind] || "", label: "regla",
    note: j.detail.note ? `<div class="why"><b>athugið</b>${fmt(hideAnswer(j.detail.note, t))}</div>` : "",
    inputs: [$("ans")], lock: [$("hint")], reveal: draw,
  })) return;
  conclude(app, t, j, draw);
}

function drawTransform(app, t, j, val) {
  const { slip, short } = j.detail;
  const ok = j.ok, xp = j.xp;
  t.done = true;
  $("ans").disabled = true;
  $("hint").disabled = true;
  const model = t.model || t.answers[0];
  const other = t.kind === "passive"
    ? `<p class="streakline">${fmt("Gerandinn (*af* …) má fylgja eða sleppa: hvort tveggja er rétt.")}</p>` : "";
  /* After a second try, every sentence the pupil wrote that was wrong. */
  const wrote = t.retried ? (t.tries || []).map((x) => x.typed.trim()) : [val.trim()];
  const head = ok && j.retry ? retryRightHTML(xp)
    : `${xp ? `<span class="xpop">+${xp} XP</span>` : ""}
    <h3>${ok ? (slip ? "Rétt — en gáðu að broddunum" : cheer(CHEERS_OK)) : cheer(CHEERS_NO)}</h3>`;
  $("verdict").innerHTML = `<div class="verdict ${ok ? (slip ? "near" : "ok") : "no"}">${head}
  ${ok && !slip && !short && !j.retry ? "" : wrote.map((w) => `<p>Þú skrifaðir <span class="forms">${esc(w)}</span>${/[.?!]$/.test(w) ? "" : "."}</p>`).join("")}
  ${ok && j.retry && (slip || short) ? `<p>Seinna svarið: <span class="forms">${esc(val.trim())}</span></p>` : ""}
  <p>${ok && !slip ? "" : "Rétt: "}${changedHTML(model, t.from || t.s.t)}</p>
  ${j.detail.note ? `<p class="streakline">${fmt(j.detail.note)}</p>` : ""}
  ${short ? `<p class="streakline">${fmt("Afgangurinn af setningunni breytist ekki, svo það er í lagi að sleppa honum.")}</p>` : ""}
  ${other}
  ${whyBox(t.why)}
  ${ok && j.retry ? RETRY_STILL_MISS : ""}
  <p class="streakline">Enter fyrir næstu.</p></div>`;
}

/* v6.11: shared with the renderers in ui/render-more.js. */
export { sentenceHTML, whyBox, conclude, enterToSubmit, skillTag, slipNote, nearNote, multLine, PUNCT };
/* Item 42: the second try, shared with the gap and the boðháttur. */
export { offerRetry, endRetry, say, SAME_AGAIN, judgeTry, noteTry, compareHTML, retryRightHTML, RETRY_STILL_MISS };
/* Moved to core/answer.js in v6.13; still exported from here for the tests
   and tools that read them beside the renderers. */
export { parseRows, judgeSyntax };
