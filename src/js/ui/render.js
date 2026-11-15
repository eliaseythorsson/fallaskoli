/* Rendering tasks and grading answers.

   Each type has its pair: RENDER.x draws and submitX() grades. Nothing else in
   the program has to know the type exists.                                 */

import { CASES, COLS, mark, describeMark, caseName, ALL_CLASSES, MOODS } from "../core/marks.js";
import { lessonLinkHTML } from "./lessons.js";
import { abbr, markHTML } from "../core/glossary.js";
import { gradeForm, agreementNote, judge, normalise } from "../core/grading.js";
import { gradeHunt, gradeWorkshop, gradeTransform } from "../tasks/production.js";
import { verdictOf } from "../core/leniency.js";
import { computeXp, runMult, dayMult } from "../core/progress.js";
import { easeFor, record, tallyAnswer, dayStreak, dayRec, answerShape, wordKey } from "../core/state.js";
import { bumpDiff } from "../core/difficulty.js";
import { skillName } from "../core/skills.js";
import { conjugationNote } from "../tasks/explain.js";
import { reportButtonHTML } from "./reports.js";
import {
  $, esc, fmt, wireKeys, cheer, CHEERS_OK, CHEERS_NO, CHEERS_TRY, hideTip,
  defBox, unlockDefBox, freshEnter, stopConfetti,
} from "./dom.js";

export const RENDER = {};

/* A question whose answer includes the word class may not offer the word's
 * dictionary entry until it has been answered: the entry names the class in
 * its heading and usually again in its text. The shortened definition stays
 * on the page as context; the hover window, the class and the lookup links
 * go, and come back with the verdict (`unlockDefBox`). */
const CLASS_IS_THE_ANSWER = new Set(["parse", "indecl"]);
export const definitionLocked = (task) =>
  !!task && CLASS_IS_THE_ANSWER.has(task.type);

export function renderTask(app) {
  hideTip();
  stopConfetti();
  const fn = RENDER[app.cur.type];
  if (!fn) throw new Error("Enginn birtir fyrir " + app.cur.type);
  fn(app);
  /* Lesefni (v6.7): every question links to the page that teaches it. */
  const eb = document.querySelector("#task .eyebrow");
  /* Same reason as skillTag: before the answer, a word-class question links to
     the neutral Orðflokkar page, not to the page of the class it is about.
     The specific page comes with the verdict (suggestLesson). */
  const link = definitionLocked(app.cur) ? lessonLinkHTML(app.cur, "ordflokkar") : lessonLinkHTML(app.cur);
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

function sentenceHTML(s, i, replacement) {
  return s.tok.map((t, j) => {
    if (PUNCT.has(t.w)) return t.w;
    const sp = j === 0 ? "" : " ";
    /* The answer put in first place starts with a capital, as the word it
       replaces did (v6.10: "nunnan liggur á stólnum."). */
    if (j === i) return sp + (/^\p{Lu}/u.test(t.w)
      ? replacement.replace(/^((?:<[^>]*>)*)(\p{Ll})/u, (_, tags, c) => tags + c.toUpperCase())
      : replacement);
    return sp + esc(t.w);
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

/** XP for one answer, with the ease discount applied.
 *
 * `factor` is what a forgiven slip leaves behind — 0.95 for a missing accent,
 * 0.90 for the wrong article or the wrong tense (core/leniency.js). It is
 * applied last, to the finished figure, so the child loses a share of what they
 * would have earned rather than a share of the base: the deduction is the same
 * 5% whatever multipliers the run and the day streak are adding. A slip never
 * takes the award below 1 XP — that would read as "wrong" on the screen, and it
 * is not. */
function xpFor(app, task, { ok, hinted = false, base = task.base, lvl = task.lvl,
                            factor = 1 }) {
  if (!ok) return 0;
  const ease = easeFor(app.S, { cell: task.cell, word: task.word, skill: task.skill });
  const full = computeXp({
    base, lvl: lvl || 1, hinted, ease,
    run: app.S.run, streak: dayStreak(app.S),
  });
  if (factor >= 1) return full;
  return Math.max(full > 0 ? 1 : 0, Math.round(full * factor));
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

function submitFill(app) {
  const t = app.cur;
  const val = $("ans").value;
  const g = gradeForm(val, { accepted: t.answers, paradigm: t.paradigm });
  if (g.verdict === "empty") return;
  if (g.verdict === "hedged") {
    $("verdict").innerHTML = `<div class="verdict neutral"><h3>Veldu eina mynd</h3>
      <p>Þú skrifaðir fleiri en eina beygingarmynd (${g.hedged.map(esc).join(", ")}).
      Prófaðu aftur með þeirri sem þú telur rétta.</p></div>`;
    return;
  }
  /* One decision, in one place: is this correct, is something forgiven, and
     what does the forgiving cost? See core/leniency.js. */
  const v = verdictOf(g, t.m);
  const ok = v.ok;
  const a = t.a;
  const xpFull = xpFor(app, t, { ok, hinted: t.hinted });
  const xp = xpFor(app, t, { ok, hinted: t.hinted, factor: v.factor });
  /* `comeback` is no longer computed here. It was, in two of the ten submit
     handlers, off `sess.wrongRun` — a per-`record()` counter, so a table with
     three wrong cells satisfied it. It now lives in app.finish(), which is the
     one place that knows a whole question has ended. */
  const usedHelpers = ok && g.helpers.length > 0;

  const shape = answerShape(val);
  const took = spend(app);
  record(app.S, app.sess, {
    skill: t.skill, cell: t.cell, word: t.word, ok, xp, hinted: t.hinted,
    ms: took, answer: shape,
  });
  bumpDiff(app.sess, app.S, t.skill, ok);

  const full = sentenceHTML(t.s, t.i, `<b>${esc(t.answers[0])}</b>`);
  const note = t.extra && ok
    ? agreementNote(g.helpers, a, (f) => app.lex.analyse(f))
    : null;

  if (ok) {
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
    /* v6.11: a cloze asked for another category (Fallstjórn) does not bring
       its noun back as a Nafnorð question. */
    if (!t.noRepeat) app.forcedNoun = t.n;
    $("verdict").innerHTML = `<div class="verdict no">
      <h3>${cheer(CHEERS_NO)}</h3>
      <p>Þú skrifaðir <span class="forms">${esc(val.trim())}</span>. Rétt er
         <span class="forms">${t.answers.slice(0, 2).map(esc).join(" / ")}</span>.</p>
      ${nearNote(v)}<p>${full}</p>${whyBox(t.why)}
      <p class="streakline">${t.noRepeat ? "Enter fyrir næstu." : "Næst kemur sama orð í annarri setningu. Enter."}</p></div>`;
  }
  $("ans").disabled = true;
  $("hint").disabled = true;
  app.finish({ correct: ok, hardWin: ok && t.lvl >= 5, usedHelpers,
    answer: ok ? shape : null, answerMs: ok ? took : 0, slip: ok && !!v.slip,
    resp: { kind: "form", items: [{ m: t.m, typed: val, g, accepted: t.answers }] } });
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
  const g = gradeForm(typed, { accepted: t.answers, paradigm: t.paradigm });
  if (g.verdict === "empty") return;
  if (g.verdict === "hedged") {
    $("verdict").innerHTML = `<div class="verdict neutral"><h3>Veldu eina mynd</h3>
      <p>Skrifaðu bara þá mynd sem þú telur rétta.</p></div>`;
    return;
  }
  const v = verdictOf(g, t.m);
  const ok = v.ok;
  const xpFull = xpFor(app, t, { ok });
  const xp = xpFor(app, t, { ok, factor: v.factor });
  const shape = answerShape($("ans").value);
  const took = spend(app);
  record(app.S, app.sess, {
    skill: t.skill, cell: t.cell, word: t.word, ok, xp, ms: took, answer: shape });
  bumpDiff(app.sess, app.S, t.skill, ok);
  const conj = conjugationNote(t.v.o, t.conj);
  $("verdict").innerHTML = `<div class="verdict ${v.klass}"><span class="xpop">+${xp} XP</span>
    <h3>${v.slip ? esc(v.slip.head) : ok ? cheer(CHEERS_OK) : cheer(CHEERS_NO)}</h3>
    <p><span class="forms">${esc(t.pron)} ${esc(t.answers[0])}</span></p>
    ${ok ? "" : `<p>Þú skrifaðir <span class="forms">${esc(typed.trim())}</span>.</p>`}
    ${slipNote(v.slip, xp, xpFull)}${nearNote(v)}
    <div class="why"><b>mark í BÍN</b><span class="forms mk">${markHTML(t.m)}</span> — ${fmt(describeMark(t.m))}</div>
    ${whyBox(conj, "beyging")}
    <p class="streakline">Enter fyrir næstu.</p></div>`;
  $("ans").disabled = true;
  app.finish({ correct: ok, answer: ok ? shape : null, answerMs: ok ? took : 0,
    slip: ok && !!v.slip,
    resp: { kind: "form", items: [{ m: t.m, typed, g, accepted: t.answers, conj: t.conj }] } });
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
  const g = gradeForm(val, { accepted: t.answers, paradigm: t.paradigm });
  if (g.verdict === "empty") return;
  if (g.verdict === "hedged") {
    $("verdict").innerHTML = `<div class="verdict neutral"><h3>Veldu eina mynd</h3>
      <p>Þú skrifaðir fleiri en eina sagnmynd (${g.hedged.map(esc).join(", ")}).
      Prófaðu aftur með þeirri sem þú telur rétta.</p></div>`;
    return;
  }
  const v = verdictOf(g, t.m);
  const ok = v.ok;
  const xpFull = xpFor(app, t, { ok, hinted: t.hinted });
  const xp = xpFor(app, t, { ok, hinted: t.hinted, factor: v.factor });
  const shape = answerShape(val);
  const took = spend(app);
  record(app.S, app.sess, {
    skill: t.skill, cell: t.cell, word: t.word, ok, xp, hinted: t.hinted,
    ms: took, answer: shape,
  });
  bumpDiff(app.sess, app.S, t.skill, ok);
  const full = sentenceHTML(t.s, t.i, `<b>${esc(t.answers[0])}</b>`);
  const conj = conjugationNote(t.shown || t.v.o, t.conj);
  if (ok) {
    $("verdict").innerHTML = `<div class="verdict ${v.klass}"><span class="xpop">+${xp} XP</span>
      <h3>${v.slip ? esc(v.slip.head) : cheer(CHEERS_OK)}</h3><p>${full}</p>
      ${v.slip ? `<p>Þú skrifaðir <span class="forms">${esc(val.trim())}</span>. Rétt er
         <span class="forms">${t.answers.slice(0, 2).map(esc).join(" / ")}</span>.</p>` : ""}
      ${slipNote(v.slip, xp, xpFull)}
      <div class="why"><b>mark í BÍN</b><span class="forms mk">${markHTML(t.m)}</span> — ${fmt(describeMark(t.m))}</div>
      ${whyBox(t.why)}${whyBox(conj, "beyging")}
      <p class="streakline">${app.S.run} í röð${multLine(app, xp)}. Enter fyrir næstu.</p></div>`;
  } else {
    $("verdict").innerHTML = `<div class="verdict no"><h3>${cheer(CHEERS_NO)}</h3>
      <p>Þú skrifaðir <span class="forms">${esc(val.trim())}</span>. Rétt er
         <span class="forms">${t.answers.slice(0, 2).map(esc).join(" / ")}</span>.</p>
      ${nearNote(v)}<p>${full}</p>${whyBox(t.why)}${whyBox(conj, "beyging")}
      <p class="streakline">Enter fyrir næstu.</p></div>`;
  }
  $("ans").disabled = true;
  $("hint").disabled = true;
  app.finish({ correct: ok, hardWin: ok && t.lvl >= 5,
    answer: ok ? shape : null, answerMs: ok ? took : 0, slip: ok && !!v.slip,
    resp: { kind: "form", items: [{ m: t.m, typed: val, g, accepted: t.answers, conj: t.conj }] } });
}

/* ================= 3. Greining ========================================= */

/* `term` is the glossary entry a row label points at, so every row explains
   itself. The feature BÍN calls `stig` is labelled "Stigbreyting": "stig" is
   the child's level in the program and must not mean two things. */
const PARSE_ROWS = [
  { key: "fl", label: "Orðflokkur", term: "ordflokkur", opts: () => ALL_CLASSES },
  { key: "kyn", label: "Kyn", term: "kyn",
    opts: () => [{ v: "kk", label: "karlkyn" }, { v: "kvk", label: "kvenkyn" },
                 { v: "hk", label: "hvorugkyn" }] },
  { key: "tala", label: "Tala", term: "tala", opts: () => ["eintala", "fleirtala"] },
  { key: "fall", label: "Fall", term: "fall",
    opts: () => CASES.map((c) => ({ v: c.k, label: c.name })) },
  { key: "greinir", label: "Greinir", term: "greinir", opts: () => ["án greinis", "með greini"],
    read: (a) => (a.greinir ? "með greini" : "án greinis"),
    only: (a, t) => t.c === "nafnorð" },
  { key: "stig", label: "Stigbreyting", term: "stigbreyting",
    opts: () => ["frumstig", "miðstig", "efsta stig"] },
  { key: "beyging", label: "Beyging", term: "beyging",
    opts: () => [{ v: "sterk", label: "sterk beyging" }, { v: "veik", label: "veik beyging" }] },
  { key: "mynd", label: "Mynd", term: "mynd", opts: () => ["germynd", "miðmynd"] },
  /* Every mood `readMark` can report, from the marks table itself — so a mood
     in the data cannot be missing from the buttons (`tests/tasks.test.js`
     checks that every askable row's answer is among its own options). */
  { key: "háttur", label: "Háttur", term: "hattur", opts: () => MOODS },
  { key: "tíð", label: "Tíð", term: "tid", opts: () => ["nútíð", "þátíð"] },
  { key: "persóna", label: "Persóna", term: "persona",
    opts: () => ["1. persóna", "2. persóna", "3. persóna"] },
];

/* A feature the surface form does not settle, and nothing in the sentence
   settles either, is recorded in `t.u` by the build and never asked about:
   *fyrir okkur* is both accusative and dative. */
export function parseRows(a, t) {
  const unsure = new Set(t.u || []);
  if (unsure.has("stig")) unsure.add("beyging");
  const rows = [{ ...PARSE_ROWS[0], answer: t.c }];
  PARSE_ROWS.slice(1).forEach((r) => {
    if (unsure.has(r.key)) return;
    if (r.only) { if (r.only(a, t)) rows.push({ ...r, answer: r.read(a) }); return; }
    if (a[r.key] != null) rows.push({ ...r, answer: a[r.key] });
  });
  return rows;
}

RENDER.parse = function (app) {
  const t = app.cur;
  t.rows = parseRows(t.a, t.t);
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
    ${defBox(app, focusEntry(app, t), { locked: true })}
    ${t.homograph ? `<p class="gloss">Athugaðu: ${esc(t.t.l)} getur verið fleiri en einn orðflokkur. ${t.standalone ? "Hér er spurt um myndina eins og hún er gefin upp hér að ofan." : "Farðu eftir setningunni."}</p>` : ""}
    ${t.rows.map((r) => `<div class="qrow"><label>${abbr(r.label, r.term)}</label>
      <div class="opts" data-q="${esc(r.key)}">
      ${r.opts().map((o) => {
        const v = typeof o === "string" ? o : o.v;
        const lab = typeof o === "string" ? o : o.label;
        return `<button type="button" data-v="${esc(v)}">${fmt(lab)}</button>`;
      }).join("")}
    </div></div>`).join("")}
    <div class="answer"><button class="go" id="check">Athuga greininguna</button></div>
    <div id="verdict"></div>
  </div>`;
  wireOptions(t);
  $("check").onclick = () => submitParse(app);
};

function wireOptions(t) {
  document.querySelectorAll(".opts").forEach((box) => {
    box.onclick = (e) => {
      const b = e.target.closest("button");
      if (!b || b.disabled) return;
      box.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b));
      t.picks[box.dataset.q] = b.dataset.v;
    };
  });
}

function submitParse(app) {
  const t = app.cur;
  if (t.rows.some((r) => !t.picks[r.key])) {
    $("verdict").innerHTML = `<div class="verdict neutral"><p>Veldu svar í öllum röðunum.</p></div>`;
    return;
  }
  let right = 0;
  document.querySelectorAll(".opts").forEach((box) => {
    const r = t.rows.find((x) => x.key === box.dataset.q);
    if (!r) return;
    box.querySelectorAll("button").forEach((b) => {
      b.disabled = true;
      if (b.dataset.v === r.answer) b.classList.add("right");
      else if (b.getAttribute("aria-pressed") === "true") b.classList.add("wrongpick");
      b.removeAttribute("aria-pressed");
    });
    if (t.picks[r.key] === r.answer) right++;
  });
  const perfect = right === t.rows.length;
  const ease = easeFor(app.S, { cell: t.cell, word: t.word, skill: t.skill });
  const xp = right === 0 ? 0 : computeXp({
    base: t.base * right, lvl: t.lvl, ease,
    run: app.S.run, streak: dayStreak(app.S),
  });
  record(app.S, app.sess, { skill: t.skill, cell: t.cell, word: t.word, ok: perfect, xp, ms: spend(app) });
  if (perfect) app.S.counters.perfectParses++;
  bumpDiff(app.sess, app.S, t.skill, perfect);
  const sum = t.rows.map((r) => r.answer).join(", ");
  $("verdict").innerHTML = `<div class="verdict ${perfect ? "ok" : "no"}"><span class="xpop">+${xp} XP</span>
    <h3>${right} / ${t.rows.length}${perfect ? " — " + cheer(CHEERS_OK) : ""}</h3>
    <p><span class="forms">${esc(t.t.w)}</span> er ${fmt(sum)}.</p>
    ${t.t.m ? `<div class="why"><b>mark í BÍN</b><span class="forms mk">${markHTML(t.t.m)}</span> — ${fmt(describeMark(t.t.m, t.t.c))}</div>` : ""}
    <p class="streakline">Enter fyrir næstu.</p></div>`;
  /* The answer is in — the dictionary entry may come back now. */
  unlockDefBox(app, focusEntry(app, t));
  app.finish({ correct: perfect, perfectParse: perfect,
    resp: { kind: "rows", rows: t.rows.map((r) => ({ key: r.key, answer: r.answer, picked: t.picks[r.key] })) } });
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
  if (t.picked == null) {
    $("verdict").innerHTML = `<div class="verdict neutral"><p>Smelltu á orð fyrst.</p></div>`;
    return;
  }
  const verdict = judgeSyntax(t.s, t.askRole, t.picked);
  const { good } = verdict;
  const ok = verdict.kind === "right";
  document.querySelectorAll(".pickw").forEach((el) => {
    const j = +el.dataset.j;
    if (good.includes(j)) el.classList.add("right");
    else if (j === t.picked && verdict.kind === "wrong") el.classList.add("wrongpick");
  });
  t.done = true;
  /* "Frumlag er …" — a sentence begins with a capital, also when its first
     word is a term with a glossary link. */
  const roleName = t.askRole.charAt(0).toUpperCase() + t.askRole.slice(1);
  const answer = `<p>${fmt(roleName)} er <span class="forms">${
    good.map((j) => esc(t.s.tok[j].w)).join(", ")}</span>.</p>`;

  /* A word the build could not vouch for either way (`rn`): not right, not
     wrong, and said so. Nothing is recorded against the child. */
  if (verdict.kind === "unjudged") {
    record(app.S, app.sess, { skill: t.skill, cell: t.cell, ok: true, xp: 0,
      counts: false, ms: spend(app) });
    $("verdict").innerHTML = `<div class="verdict neutral">
      <h3>Þetta orð er ekki metið</h3>
      <p>Um hlutverk orðsins <span class="forms">${esc(t.s.tok[t.picked].w)}</span> í þessari
        málsgrein má deila, svo svarið telst hvorki rétt né rangt.</p>
      ${answer}
      <p class="streakline">Enter fyrir næstu.</p></div>`;
    app.finish({ correct: null });
    return;
  }

  const xp = xpFor(app, t, { ok });
  record(app.S, app.sess, { skill: t.skill, cell: t.cell, ok, xp, ms: spend(app) });
  bumpDiff(app.sess, app.S, t.skill, ok);
  $("verdict").innerHTML = `<div class="verdict ${ok ? "ok" : "no"}"><span class="xpop">+${xp} XP</span>
    <h3>${ok ? cheer(CHEERS_OK) : "Ekki alveg"}</h3>
    ${answer}
    ${whyBox(structureNote(t.s), "bygging")}
    <p class="streakline">Enter fyrir næstu.</p></div>`;
  app.finish({ correct: ok, resp: { kind: "syntax", ok,
    ex: { said: t.s.tok[t.picked].w, right: good.map((j) => t.s.tok[j].w).join(", ") } } });
}

/**
 * Is a click on token `picked` right for `role`?
 *
 *   right     the word carries the role, or the role is one it may also be
 *             given (`ra`: the infinitive in "ætla að lesa" as predicate)
 *   unjudged  a nominal whose role the build withdrew because it could not be
 *             verified (`rn`) — never when the role asked for is the predicate
 *   wrong     everything else
 *
 * `good` is what is shown as the answer: only the words that carry the role.
 */
export function judgeSyntax(s, role, picked) {
  const good = s.tok.map((tok, j) => (tok.r === role ? j : -1)).filter((j) => j >= 0);
  const tok = s.tok[picked];
  let kind = "wrong";
  if (good.includes(picked) || (tok && (tok.ra || []).includes(role))) kind = "right";
  else if (tok && tok.rn && role !== "umsögn") kind = "unjudged";
  return { kind, good };
}

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
  let right = 0, gained = 0, helpersUsed = false;
  const hedgedCells = [], items = [];

  ins.forEach((el) => {
    const m = el.dataset.m;
    const acc = t.w.forms[m] || [];
    const g = gradeForm(el.value, { accepted: acc, paradigm: t.w.forms });
    items.push({ m, typed: el.value, g, accepted: acc, conj: t.conj });
    if (g.verdict === "hedged") hedgedCells.push(m);
    const ok = g.verdict === "correct";
    if (g.helpers.length) helpersUsed = helpersUsed || ok;
    el.classList.add(ok ? "ok" : "no");
    el.disabled = true;
    if (ok) {
      right++;
      const ease = easeFor(app.S, { cell: m, word: t.word, skill: t.skill });
      const xp = computeXp({ base: t.base, lvl: t.lvl, ease, run: app.S.run, streak: dayStreak(app.S) });
      gained += xp;
      record(app.S, app.sess, { skill: t.skill, cell: m, word: t.word, ok: true, xp, ms: spend(app), tally: false });
    } else {
      document.querySelector(`[data-fix="${CSS.escape(m)}"]`).textContent = acc.join(" / ");
      record(app.S, app.sess, { skill: t.skill, cell: m, word: t.word, ok: false, xp: 0, tally: false });
    }
  });

  const perfect = right === ins.length;
  /* The whole table is one answer: right only if every cell is (v6.10). */
  tallyAnswer(app.S, app.sess, { skill: t.skill, ok: perfect });
  app.sess.tableRun = perfect ? (app.sess.tableRun || 0) + 1 : 0;
  let bonus = 0;
  if (perfect) {
    bonus = Math.round(30 * dayMult(dayStreak(app.S)));
    app.S.xp += bonus;
    app.S.skills[t.skill].xp += bonus;
    dayRec(app.S).xp += bonus;
    app.S.counters.perfectTables++;
  }
  bumpDiff(app.sess, app.S, t.skill, perfect);

  $("verdict").innerHTML = `<div class="verdict ${perfect ? "ok" : "no"}">
    <span class="xpop">+${gained + bonus} XP</span>
    <h3>${right} / ${ins.length}${perfect ? " — heil tafla!" : ""}</h3>
    <p>${perfect ? "Allt rétt. Bónus bætt við." : "Réttu myndirnar standa undir þeim rauðu."}</p>
    ${hedgedCells.length ? `<p class="streakline">Í ${hedgedCells.length === 1 ? "einum reit" : hedgedCells.length + " reitum"} skrifaðir þú fleiri en eina mynd — veldu eina næst.</p>` : ""}
    ${helperTable(t)}
    ${whyBox(t.why, "athugið")}
    <p class="streakline">Enter fyrir næstu.</p></div>`;
  app.finish({ correct: perfect, perfectTable: perfect,
    usedHelpers: helpersUsed && perfect, resp: { kind: "form", items } });
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
  const n = app.cur.n;
  const txt = $("freetext").value.trim();
  if (!txt) return;
  /* Nothing grades the text, but the same sentence pasted every time, or a
     word or two, earns no XP (v6.10). */
  const key = normalise(txt);
  const seen = (app.sess.meaningTexts ||= []);
  const effort = key.split(" ").length >= 3 && !seen.includes(key);
  seen.push(key);
  const xp = effort ? Math.round(app.cur.base * dayMult(dayStreak(app.S))) : 0;
  record(app.S, app.sess, { skill: app.cur.skill, word: app.cur.word, ok: true, xp, counts: false, ms: spend(app) });
  app.S.counters.meanings++;
  $("freetext").disabled = true;
  $("verdict").innerHTML = `<div class="verdict neutral">${xp ? `<span class="xpop">+${xp} XP</span>` : ""}
    <h3>${effort ? cheer(CHEERS_TRY) : "Engin XP að þessu sinni"}</h3>
    ${effort ? "" : `<p class="streakline">XP fæst fyrir eigin útskýringu í heilli setningu — ekki sama textann aftur.</p>`}
    <p>Í orðabók er <span class="forms">${esc(n.o)}</span> útskýrt svona: <b>${esc(n.d)}</b>.</p>
    ${n.x ? `<div class="why"><b>dæmi um notkun</b>${esc(n.x)}</div>` : ""}
    <p class="streakline">Þessi spurning telur ekki í rétt/rangt. Enter.</p></div>`;
  /* `correct: null` — the meaning question has no wrong answer, so it neither
     breaks a run of misses nor adds to one. */
  app.finish({ correct: null });
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
  if (!t.picked) {
    $("verdict").innerHTML = `<div class="verdict neutral"><p>Veldu fall.</p></div>`;
    return;
  }
  const ok = t.picked === t.fall;
  document.querySelectorAll(".opts button").forEach((b) => {
    b.disabled = true;
    if (b.dataset.v === t.fall) b.classList.add("right");
    else if (b.getAttribute("aria-pressed") === "true") b.classList.add("wrongpick");
    b.removeAttribute("aria-pressed");
  });
  const xp = xpFor(app, t, { ok });
  record(app.S, app.sess, { skill: t.skill, cell: t.cell, word: t.word, ok, xp, ms: spend(app) });
  bumpDiff(app.sess, app.S, t.skill, ok);
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
  $("verdict").innerHTML = `<div class="verdict ${ok ? "ok" : "no"}"><span class="xpop">+${xp} XP</span>
    <h3>${ok ? cheer(CHEERS_OK) : "Ekki alveg"}</h3>
    <p>${fmt(body)}</p>
    <div class="why"><b>prófaðu</b>${fmt("Spurðu þig: *" + cs.q + "*")}</div>
    <p class="streakline">Enter fyrir næstu.</p></div>`;
  app.finish({ correct: ok, resp: { kind: "govern", answer: t.fall, picked: t.picked, so: t.t.c === "sagnorð" } });
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
  if (!t.picked) {
    $("verdict").innerHTML = `<div class="verdict neutral"><p>Veldu orðflokk.</p></div>`;
    return;
  }
  const ok = t.picked === t.answer;
  document.querySelectorAll(".opts button").forEach((b) => {
    b.disabled = true;
    if (b.dataset.v === t.answer) b.classList.add("right");
    else if (b.getAttribute("aria-pressed") === "true") b.classList.add("wrongpick");
    b.removeAttribute("aria-pressed");
  });
  const xp = xpFor(app, t, { ok });
  record(app.S, app.sess, { skill: t.skill, cell: t.cell, word: t.word, ok, xp, ms: spend(app) });
  bumpDiff(app.sess, app.S, t.skill, ok);
  $("verdict").innerHTML = `<div class="verdict ${ok ? "ok" : "no"}"><span class="xpop">+${xp} XP</span>
    <h3>${ok ? cheer(CHEERS_OK) : "Ekki alveg"}</h3>
    <p><span class="forms">${esc(t.t.w)}</span> er ${fmt(t.answer)}.</p>
    <p class="streakline">Enter fyrir næstu.</p></div>`;
  unlockDefBox(app, focusEntry(app, t));
  app.finish({ correct: ok, resp: { kind: "class", answer: t.answer, picked: t.picked } });
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
    return sp + (inside ? `<span class="clausemark">${esc(tok.w)}</span>` : esc(tok.w));
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
  if (!t.picked) {
    $("verdict").innerHTML = `<div class="verdict neutral"><p>Veldu setningagerð.</p></div>`;
    return;
  }
  const ok = t.picked === t.answer;
  document.querySelectorAll(".opts button").forEach((b) => {
    b.disabled = true;
    if (b.dataset.v === t.answer) b.classList.add("right");
    else if (b.getAttribute("aria-pressed") === "true") b.classList.add("wrongpick");
    b.removeAttribute("aria-pressed");
  });
  const xp = xpFor(app, t, { ok });
  record(app.S, app.sess, { skill: t.skill, cell: t.cell, ok, xp, ms: spend(app) });
  bumpDiff(app.sess, app.S, t.skill, ok);
  const words = t.s.tok.slice(t.span.from, t.span.to + 1).map((x) => x.w).join(" ");
  $("verdict").innerHTML = `<div class="verdict ${ok ? "ok" : "no"}"><span class="xpop">+${xp} XP</span>
    <h3>${ok ? cheer(CHEERS_OK) : "Ekki alveg"}</h3>
    <p><span class="forms">${esc(words)}</span> er <b>${esc(t.answer)}</b> — hún ${esc(CLAUSE_WHY[t.answer] || "")}.</p>
    <p class="streakline">Enter fyrir næstu.</p></div>`;
  app.finish({ correct: ok, resp: { kind: "clause", ok, ex: { said: t.picked, right: t.answer } } });
}

/* ================= 12. Málbeiting (v6.9) ===============================
 *
 * Three questions where the child writes the Icelandic. Builders in
 * tasks/production.js; what is graded here is always a form BÍN has.
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

RENDER.villur = function (app) {
  const t = app.cur;
  const n = t.hunt.errors;
  $("task").innerHTML = `
  <div class="card">
    <p class="eyebrow"><span>Villuveiðar</span>${skillTag(t)}<b>þyngd ${t.lvl}</b></p>
    ${huntTextHTML(t)}
    <p class="gloss">Í setningunum ${n === 1 ? "er ein villa" : `eru ${n} villur, ein í hvorri`} í falli eða samræmi.
      Smelltu á orðið sem er rangt og skrifaðu það rétt. Ef tvö orð passa ekki saman
      er nóg að breyta öðru þeirra.</p>
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
  const g = gradeHunt(t.hunt, t.edits);
  t.done = true;
  const n = t.hunt.errors;
  const fixed = g.fixed.length, alarms = g.falseAlarm.length;
  /* XP for what was put right, less a share for each correct word changed. */
  const share = Math.max(0, fixed - alarms) / n;
  const xp = share > 0 ? xpFor(app, t, { ok: true, base: Math.round(t.base * share) }) : 0;
  const took = spend(app);
  let first = true;
  t.hunt.lines.forEach((ln) => ln.toks.forEach((tk) => {
    if (!tk.err) return;
    const key = Object.keys(t.edits).find((k) => tokAt(t, k) === tk);
    const ok = !!key && g.fixed.includes(key);
    record(app.S, app.sess, { skill: t.skill, cell: tk.err.m, word: tk.err.word, ok,
      xp: first ? xp : 0, ms: first ? took : 0, tally: false });
    first = false;
  }));
  tallyAnswer(app.S, app.sess, { skill: t.skill, ok: g.ok });
  bumpDiff(app.sess, app.S, t.skill, g.ok);

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
  document.querySelector("#task .hunt").outerHTML = marked;
  $("huntedits").innerHTML = "";
  $("verdict").innerHTML = `<div class="verdict ${g.ok ? "ok" : "no"}">${xp ? `<span class="xpop">+${xp} XP</span>` : ""}
    <h3>${g.ok ? cheer(CHEERS_OK) : `${fixed} af ${n} villum lagaðar`}</h3>
    <ul class="huntlist">${list.join("")}${alarmList.join("")}</ul>
    ${g.ok ? "" : `<p class="streakline">Textinn stendur nú réttur. Grænt: villa sem þú lagaðir. Rautt: villa sem stóð eftir. Yfirstrikað: rétt orð sem þú breyttir.</p>`}
    <p class="streakline">Enter fyrir næstu.</p></div>`;
  app.finish({ correct: g.ok, resp: { kind: "hunt", g } });
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
  const g = gradeWorkshop(t.cards, val);
  t.done = true;
  const inflected = t.cards.filter((c) => !c.fixed);
  const right = inflected.filter((c) => g.per[t.cards.indexOf(c)].ok).length;
  const ok = g.ok;
  const share = inflected.length ? right / inflected.length : 0;
  const xp = ok ? xpFor(app, t, { ok: true })
    : share > 0 ? xpFor(app, t, { ok: true, base: Math.round(t.base * share * 0.5) }) : 0;
  const took = spend(app);
  let first = true;
  inflected.forEach((c) => {
    record(app.S, app.sess, { skill: t.skill, cell: c.m, word: c.e ? wordKey(c.e.o, c.e.c) : null,
      ok: g.per[t.cards.indexOf(c)].ok, xp: first ? xp : 0, ms: first ? took : 0, tally: false });
    first = false;
  });
  tallyAnswer(app.S, app.sess, { skill: t.skill, ok });
  bumpDiff(app.sess, app.S, t.skill, ok);
  $("ans").disabled = true;
  document.querySelector("#task .wcards").innerHTML = t.cards.map((c, k) =>
    cardHTML(c, c.fixed ? "" : g.per[k].ok ? "right" : "wrongpick")).join('<span class="wdash">–</span>');
  const model = t.answers[0];
  const misses = t.cards.map((c, k) => (!c.fixed && !g.per[k].ok)
    ? `<li><span class="forms">${esc(c.text)}</span> → <span class="forms">${esc(c.answers.slice(0, 2).join(" / "))}</span>
       ${g.per[k].misformed ? `<span class="faint">(þú skrifaðir <span class="forms">${esc(g.per[k].typed)}</span> — rangt beygt)</span>` : ""}
       <span class="faint">${fmt(describeMark(c.m, c.e && ["kk", "kvk", "hk"].includes(c.e.c) ? "nafnorð" : null))}</span></li>` : "").join("");
  const slips = g.per.filter((p) => p.ok && p.slip);
  $("verdict").innerHTML = `<div class="verdict ${ok ? "ok" : "no"}">${xp ? `<span class="xpop">+${xp} XP</span>` : ""}
    <h3>${ok ? cheer(CHEERS_OK) : `${right} af ${inflected.length} orðum rétt beygð`}</h3>
    <p>${ok && g.inOrder ? "" : "Rétt: "}<b>${esc(model)}</b></p>
    ${ok && !g.inOrder ? `<p class="streakline">Öll orðin eru rétt beygð. Röðin hér að ofan er sú sem spjöldin sýndu.</p>` : ""}
    ${misses ? `<ul class="huntlist">${misses}</ul>` : ""}
    ${slips.length ? `<p class="streakline">Gáðu að broddunum: ${slips.map((p) => `<span class="forms">${esc(p.typed)}</span> → <span class="forms">${esc(p.form)}</span>`).join(", ")}</p>` : ""}
    ${g.extra.length ? `<p class="streakline">Þessi orð áttu ekki heima í setningunni: ${g.extra.map(esc).join(", ")}</p>` : ""}
    ${whyBox(structureNote(t.s), "bygging")}
    <p class="streakline">Enter fyrir næstu.</p></div>`;
  app.finish({ correct: ok, resp: { kind: "cards", cards: t.cards, per: g.per, extra: g.extra } });
}

/* ---------- Umritun ------------------------------------------------------- */

RENDER.umritun = function (app) {
  const t = app.cur;
  const shown = t.s.tok.map((tok, j) => {
    if (PUNCT.has(tok.w)) return tok.w;
    const sp = j === 0 ? "" : " ";
    const inside = t.focus && j >= t.focus.from && j <= t.focus.to;
    return sp + (inside ? `<span class="clausemark">${esc(tok.w)}</span>` : esc(tok.w));
  }).join("");
  $("task").innerHTML = `
  <div class="card">
    <p class="eyebrow"><span>Umritun · ${esc(TRANSFORM_NAME[t.kind] || "")}</span>${skillTag(t)}<b>þyngd ${t.lvl}</b></p>
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
      <p>${fmt(TRANSFORM_HINT[t.kind] || "")}</p>
      <p class="streakline">Vísbending gefur helmingi minna XP — hún telst ekki sem villa.</p></div>`;
  };
};

const TRANSFORM_NAME = {
  past: "þátíð", plural: "fleirtala", passive: "þolmynd",
  igaer: "Í gær …", amorgun: "Á morgun …",
};
const TRANSFORM_HINT = {
  past: "Finndu sagnirnar sem beygjast í persónu og settu þær í þátíð. Annað breytist ekki.",
  plural: "Frumlagið fer í fleirtölu. Hvaða orð laga sig að því? Sögnin gerir það alltaf, og lýsingarorð eða fornöfn sem standa með því.",
  passive: "Andlagið verður frumlag og stendur fremst. Svo kemur *vera* í sömu tíð og sögnin var og lýsingarháttur þátíðar.",
  igaer: "Sögnin stendur alltaf í öðru sæti. Ef *Í gær* er fremst, hvar lendir þá frumlagið? Og í hvaða tíð er sögnin?",
  amorgun: "Sögnin stendur alltaf í öðru sæti. Ef *Á morgun* er fremst, hvar lendir þá frumlagið? Um framtíð notum við oftast nútíð.",
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
  const j = gradeTransform(val, t);
  if (j === "empty") return;
  const ok = ["correct", "slip", "short", "shortslip"].includes(j);
  const slip = j === "slip" || j === "shortslip";
  const short = j === "short" || j === "shortslip";
  t.done = true;
  const xp = xpFor(app, t, { ok, hinted: t.hinted, factor: slip ? 0.95 : 1 });
  const took = spend(app);
  (t.marks || [{ m: t.cell }]).forEach((c, k) => {
    record(app.S, app.sess, { skill: t.skill, cell: c.m, word: c.word || null, ok,
      xp: k === 0 ? xp : 0, hinted: t.hinted, ms: k === 0 ? took : 0, counts: k === 0 });
  });
  bumpDiff(app.sess, app.S, t.skill, ok);
  $("ans").disabled = true;
  $("hint").disabled = true;
  const model = t.model || t.answers[0];
  const other = t.kind === "passive"
    ? `<p class="streakline">${fmt("Gerandinn (*af* …) má fylgja eða sleppa: hvort tveggja er rétt.")}</p>` : "";
  $("verdict").innerHTML = `<div class="verdict ${ok ? (slip ? "near" : "ok") : "no"}">${xp ? `<span class="xpop">+${xp} XP</span>` : ""}
    <h3>${ok ? (slip ? "Rétt — en gáðu að broddunum" : cheer(CHEERS_OK)) : cheer(CHEERS_NO)}</h3>
    ${ok && !slip && !short ? "" : `<p>Þú skrifaðir <span class="forms">${esc(val.trim())}</span>.</p>`}
    <p>${ok && !slip ? "" : "Rétt: "}${changedHTML(model, t.s.t)}</p>
    ${short ? `<p class="streakline">${fmt("Afgangurinn af setningunni breytist ekki, svo það er í lagi að sleppa honum.")}</p>` : ""}
    ${other}
    ${whyBox(t.why)}
    <p class="streakline">Enter fyrir næstu.</p></div>`;
  app.finish({ correct: ok, slip, resp: { kind: "transform", typed: val, ok } });
}

/* v6.11: shared with the renderers in ui/render-more.js. */
export { sentenceHTML, whyBox, spend, xpFor, enterToSubmit, skillTag, slipNote, nearNote, multLine, PUNCT };
