/* "Ritun vikunnar" on the screen (v6.13, item 46).
 *
 * The rules, topics and the following of remarks through an edit are
 * core/writing.js; the server's half is server/writing.mjs. This file draws:
 *
 *   - the offer in the Æfa picker: this week's topic, and whether it is done;
 *   - the card: the instruction, a text box with a count of sentences and
 *     characters, a line that says plainly what happens to the text, and
 *     the buttons;
 *   - with a server whose group has the check on: "Lesa yfir" sends the text
 *     (POST /writing/check) and the remarks come back; they are then shown
 *     ONE AT A TIME — the stretch marked in the text, what GreynirCorrect
 *     says — and "Laga í textanum" selects that stretch in the box for the
 *     pupil to change it themselves. Editing it counts as dealing with it
 *     (`followEdit`) and the next remark comes; "Sleppa" passes over one the
 *     pupil thinks is wrong (the checker is not always right). Then the text
 *     can be read over again, or the task finished;
 *   - anywhere else: the same card with three things to read one's own text
 *     against, and "Ljúka". Nothing is sent.
 *
 * The text lives in the text box and nowhere else: not in the progress, not
 * in localStorage. Finishing records only the week (`markWritingDone`). */

import { $, esc } from "./dom.js";
import { WRITING, topicFor, promptFor, cleanText, countSentences, cleanAnnotations,
  followEdit, nextOpen, writingDone, markWritingDone } from "../core/writing.js";
import { weekKey } from "../core/social.js";

const thisWeek = () => weekKey(new Date());

/* How many so far, while fewer than WRITING.sentences (3). */
const SO_FAR = ["Engin setning er komin enn.", "Ein setning er komin.", "Tvær setningar eru komnar."];

/* ---------- pure pieces (tests/writing.test.js) ---------------------------------- */

/** The offer in the picker. */
export function writingOfferHTML(S, week = thisWeek()) {
  const done = writingDone(S, week);
  return `<div class="writebox${done ? " done" : ""}">
    <p class="eyebrow"><span>✍️ Ritun vikunnar</span><b>${done ? "lokið í þessari viku" : "þrjár setningar"}</b></p>
    <div class="assignrow">
      <div class="assignwhat"><b>${esc(promptFor(week))}</b></div>
      <button type="button" class="${done ? "ghost" : "go"} writego" id="writego">${done ? "Skrifa aftur" : "Skrifa →"}</button>
    </div>
  </div>`;
}

/** The line that says what happens to the text — before anything is sent. */
export function modeHTML(status) {
  if (!status || !status.check || status.available === false) {
    return `<p class="wrmode">${status && status.check
      ? "Yfirlestur er ekki í boði á netþjóninum núna. " : ""}Textinn er ekki sendur neitt og ekki geymdur. Lestu hann sjálf(ur) yfir:</p>
      <ul class="wrself">
        <li>Byrjar hver setning á stórum staf og endar á punkti, spurningarmerki eða upphrópunarmerki?</li>
        <li>Er sögn í hverri setningu?</li>
        <li>Eru orðin í réttu falli á eftir forsetningum, til dæmis <i>í skólanum</i> og <i>til mömmu</i>?</li>
      </ul>`;
  }
  const where = `Þegar þú ýtir á <b>Lesa yfir</b> er textinn sendur á netþjóninn og lesinn yfir með
    GreynirCorrect, forriti sem finnur villur í íslensku.`;
  return `<p class="wrmode">${where} ${status.keep
    ? `<b>Kennarinn þinn hefur kveikt á því að textinn sé geymdur</b>, svo að kennarinn geti lesið hann.`
    : `Textinn er <b>ekki</b> geymdur eftir yfirlesturinn.`}</p>`;
}

/** The text with one stretch marked, cut to the sentence(s) around it. */
export function markedHTML(text, note) {
  if (!note || note.start === null || note.end === null) return "";
  const t = String(text);
  /* From the start of the sentence the remark is in to the end of it. */
  let a = t.lastIndexOf(". ", note.start - 1);
  a = Math.max(a, t.lastIndexOf("! ", note.start - 1), t.lastIndexOf("? ", note.start - 1));
  a = a < 0 ? 0 : a + 2;
  let b = t.slice(note.end).search(/[.!?](\s|$)/);
  b = b < 0 ? t.length : note.end + b + 1;
  return `<p class="wrquote">${esc(t.slice(a, note.start))}<mark>${esc(t.slice(note.start, note.end))}</mark>${esc(t.slice(note.end, b))}</p>`;
}

/** One remark, as the pupil sees it: "Athugasemd 2 af 4". */
export function noteHTML(notes, i, text) {
  const n = notes[i];
  if (!n) return "";
  return `<div class="wrnote" data-note="${i}">
    <p class="eyebrow"><span>Athugasemd ${i + 1} af ${notes.length}</span></p>
    ${markedHTML(text, n)}
    <p class="wrmsg"><b>${esc(n.msg)}</b></p>
    ${n.detail ? `<p class="wrdetail">${esc(n.detail)}</p>` : ""}
    <div class="answer">
      <button type="button" class="go" id="wr-fix">Laga í textanum</button>
      <button type="button" class="ghost" id="wr-skip">Sleppa</button>
    </div>
    <p class="helpnote">Breyttu textanum sjálf(ur) í reitnum hér fyrir ofan. Ef þér finnst athugasemdin
      röng, ýttu á <b>Sleppa</b> — yfirlesturinn hefur ekki alltaf rétt fyrir sér.</p>
  </div>`;
}

/** What is said when every remark has been dealt with. */
export function notesDoneHTML(notes) {
  const fixed = notes.filter((n) => n.touched).length;
  const skipped = notes.filter((n) => n.skipped && !n.touched).length;
  if (!notes.length) return `<div class="verdict good"><h3>Yfirlesturinn fann ekkert að</h3>
    <p>Vel gert! Lestu textann samt yfir einu sinni sjálf(ur) áður en þú lýkur.</p></div>`;
  return `<div class="verdict neutral"><h3>Búið að fara yfir athugasemdirnar</h3>
    <p>Þú lagaðir ${fixed} og slepptir ${skipped}. Ýttu á <b>Lesa yfir</b> til að láta lesa nýja textann
      yfir, eða á <b>Ljúka</b> ef þú ert sátt(ur).</p></div>`;
}

/* ---------- the card ---------------------------------------------------------------- */

/** The offer's button, wired. `back` draws the picker again. */
export function wireWritingOffer(app, back) {
  const b = $("writego");
  if (b) b.onclick = () => openWriting(app, back);
}

/**
 * Open the card in place of the picker. `status` comes from GET /writing on a
 * server (null elsewhere, or when the server cannot be reached).
 */
export function openWriting(app, back) {
  const week = thisWeek();
  const st = { week, status: null, notes: [], i: -1, checked: "", busy: false };
  app.writing = st;
  $("task").innerHTML = `<div class="card writecard">
    <p class="eyebrow"><span>✍️ Ritun vikunnar</span><b id="wr-tag">${esc(topicFor(week))}</b></p>
    <p class="sentence">${esc(promptFor(week))}</p>
    <div id="wr-mode">${modeHTML(null)}</div>
    <textarea id="wr-text" rows="5" maxlength="${WRITING.maxChars}" lang="is" spellcheck="false"
      autocapitalize="sentences" aria-label="Setningarnar þínar" placeholder="Skrifaðu hér…"></textarea>
    <p class="wrcount faint" id="wr-count"></p>
    <div class="answer">
      <button type="button" class="go" id="wr-check" hidden>Lesa yfir</button>
      <button type="button" class="ghost" id="wr-done">Ljúka</button>
      <button type="button" class="ghost" id="wr-back">Til baka</button>
    </div>
    <div id="wr-notes" aria-live="polite"></div>
  </div>`;
  const box = $("wr-text");
  let before = "";
  const count = () => {
    const n = countSentences(box.value);
    $("wr-count").textContent = `${n} af ${WRITING.sentences} setningum · ${box.value.length}/${WRITING.maxChars} stafir`;
  };
  count();
  box.focus();

  const drawNote = () => {
    const out = $("wr-notes");
    if (!st.checked) { out.innerHTML = ""; return; }
    if (st.i < 0) { out.innerHTML = notesDoneHTML(st.notes); return; }
    out.innerHTML = noteHTML(st.notes, st.i, box.value);
    $("wr-fix").onclick = () => {
      const n = st.notes[st.i];
      box.focus();
      if (n && n.start !== null) box.setSelectionRange(n.start, n.end);
    };
    $("wr-skip").onclick = () => {
      st.notes[st.i] = { ...st.notes[st.i], skipped: true };
      st.i = nextOpen(st.notes, st.i + 1);
      if (st.i < 0) st.i = nextOpen(st.notes, 0);
      drawNote();
    };
  };

  box.addEventListener("input", () => {
    count();
    if (st.checked && st.notes.length) {
      const was = st.i;
      st.notes = followEdit(st.notes, before, box.value);
      /* The remark on the screen was edited: that is it dealt with. */
      if (was >= 0 && st.notes[was] && st.notes[was].touched) {
        st.i = nextOpen(st.notes, was + 1);
        if (st.i < 0) st.i = nextOpen(st.notes, 0);
        drawNote();
      }
    }
    before = box.value;
  });

  const say = (html) => { $("wr-notes").innerHTML = html; };
  const showMode = () => {
    $("wr-mode").innerHTML = modeHTML(st.status);
    /* Offered only where it can work: switched on for the group, and a
       checker not known to be down. */
    $("wr-check").hidden = !(st.status && st.status.check && st.status.available !== false);
  };

  $("wr-check").onclick = async () => {
    if (st.busy) return;
    const text = cleanText(box.value);
    if (!text) { say(`<div class="verdict neutral"><p>Skrifaðu eitthvað fyrst.</p></div>`); return; }
    if (text.length > WRITING.maxChars) { say(`<div class="verdict bad"><p>Textinn má vera mest ${WRITING.maxChars} stafir.</p></div>`); return; }
    st.busy = true;
    $("wr-check").disabled = true;
    say(`<p class="sub faint">Les yfir…</p>`);
    try {
      const r = await app.server.checkWriting(text);
      /* The remarks are placed in the text as SENT: show that text, so the
         marks and the box agree (line breaks become spaces). */
      box.value = text; before = text; count();
      st.notes = cleanAnnotations(r.annotations, text);
      st.checked = text;
      st.i = nextOpen(st.notes, 0);
      drawNote();
    } catch (e) {
      if (e && e.data && e.data.off && st.status) { st.status = { ...st.status, check: false }; showMode(); }
      if (e && e.data && e.data.unavailable && st.status) { st.status = { ...st.status, available: false }; showMode(); }
      say(`<div class="verdict bad"><p>${esc((e && e.message) || "Yfirlesturinn tókst ekki.")}</p>
        <p class="sub">Þú getur samt lokið verkefninu án yfirlestrar.</p></div>`);
    }
    st.busy = false;
    $("wr-check").disabled = false;
  };

  $("wr-done").onclick = () => {
    const n = countSentences(box.value);
    if (n < WRITING.sentences) {
      say(`<div class="verdict neutral"><p>Skrifaðu þrjár setningar fyrst. ${SO_FAR[n] || ""}</p></div>`);
      return;
    }
    markWritingDone(app.S, week);
    app.save(true);
    box.value = "";
    app.writing = null;
    back();
  };
  $("wr-back").onclick = () => { box.value = ""; app.writing = null; back(); };

  if (app.server && app.server.writingStatus) {
    app.server.writingStatus()
      .then((s) => { if (app.writing === st) { st.status = s; showMode(); } })
      .catch(() => {});
  }
}

/* ---------- the teacher's card (Skólastofan) ------------------------------------------ */

/** The switches and, while keeping is on, the kept texts; from GET /teacher/writing. */
export function teacherWritingHTML(info) {
  if (!info) return "";
  const lim = info.limits || {};
  const texts = info.texts || [];
  return `<h3 class="sec2">Ritun vikunnar: yfirlestur</h3>
    <p class="sub">Einu sinni í viku skrifa nemendur þrjár setningar um efni vikunnar. Ef þú kveikir á
      yfirlestri er texti nemanda sendur á þennan netþjón og lesinn yfir með GreynirCorrect, og
      athugasemdirnar birtast nemandanum til að laga eina í einu. Sjálfgefið er slökkt á þessu: þá skrifa
      nemendur án yfirlestrar og ekkert er sent.</p>
    <p class="sub">Textinn er <b>ekki</b> geymdur eftir yfirlesturinn nema þú kveikir líka á því að geyma hann.
      Þá sérðu textana hér, mest ${esc(lim.keepPerPupil ?? WRITING.keepPerPupil)} frá hverjum nemanda og engan eldri
      en ${esc(lim.keepDays ?? WRITING.keepDays)} daga. Ef þú slekkur á því er öllum geymdum textum hópsins eytt
      strax. Nemandinn sér áður en hann sendir hvort textinn verður geymdur.</p>
    ${info.available === false ? `<p class="sub warn">Yfirlestur (GreynirCorrect) er ekki uppsettur á þessum
      netþjóni, svo nemendur skrifa án hans. Umsjónarmaður getur bætt honum við (docs/SERVER.md).</p>` : ""}
    <div class="filters">
      <label><input type="checkbox" id="tc-wr-check"${info.check ? " checked" : ""}> Kveikja á yfirlestri fyrir hópinn</label>
      <label><input type="checkbox" id="tc-wr-keep"${info.keep ? " checked" : ""}${info.check ? "" : " disabled"}> Geyma textana svo að ég geti lesið þá</label>
    </div>
    <div id="tc-wr-msg"></div>
    ${info.keep ? (texts.length ? `<div class="wrkept">${texts.map((x) => `<div class="wrkepttext">
        <p class="faint">${esc(x.name)} · vika ${esc(x.week)} · ${esc(x.topic)} · ${x.n === 1 ? "1 athugasemd" : `${esc(x.n)} athugasemdir`}</p>
        <p>${esc(x.text)}</p></div>`).join("")}</div>`
      : `<p class="sub faint">Enginn texti hefur verið geymdur enn.</p>`) : ""}`;
}

/** Draw the card into `#tc-writing` and wire its two boxes. */
export async function drawTeacherWriting(app, group, msg = "") {
  const box = $("tc-writing");
  if (!box || !app.server || !app.server.teacherWriting) return;
  let info;
  try { info = await app.server.teacherWriting(group); }
  catch { box.innerHTML = ""; return; }
  box.innerHTML = teacherWritingHTML(info);
  if (msg) $("tc-wr-msg").innerHTML = msg;
  const set = async (check, keep) => {
    $("tc-wr-check").disabled = true; $("tc-wr-keep").disabled = true;
    try {
      await app.server.setWriting(group, check, keep);
      await drawTeacherWriting(app, group, !keep && info.keep
        ? `<div class="verdict good"><p>Geymdu textunum var eytt.</p></div>` : "");
    } catch (e) {
      $("tc-wr-msg").innerHTML = `<div class="verdict bad"><p>${esc(e.message)}</p></div>`;
      $("tc-wr-check").disabled = false; $("tc-wr-keep").disabled = !info.check;
    }
  };
  $("tc-wr-check").onchange = (e) => set(e.target.checked, e.target.checked && info.keep);
  $("tc-wr-keep").onchange = (e) => set(info.check, e.target.checked);
}
