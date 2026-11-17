/* The second-language mode on the screen (v6.13, critique item 45).
 *
 * Whether the mode is on is core/profile.js `secondLanguage` — the pupil's
 * own switch or the teacher's. This file is what the mode SHOWS:
 *
 *   1. A gloss on every content word of a question's sentence. Tap (or
 *      hover, or Enter) a noun, verb, adjective or adverb and the window that
 *      already explains the word a question is about (ui/dom.js, `.dfn`)
 *      opens with that word's entry: its dictionary form, the definition and
 *      the example. The definitions are the dictionary's own (ÍNO, via
 *      core/definitions.js — the same `app.defs` every other definition on
 *      the screen comes from). There is NO English: no source of English
 *      glosses ships with the program or exists offline, and a translation
 *      made up here would be exactly the kind of wrong content a child cannot
 *      check. A word the dictionary has no entry for still opens, says so,
 *      and offers the look-up links.
 *      The word a question is ABOUT is never glossed (sentenceHTML puts the
 *      blank or the highlight there instead), and neither are the words of a
 *      question answered by tapping words (Villuveiðar, Setningarhlutar): a
 *      tap there is the answer.
 *
 *   2. "Lesa upphátt": the sentence read aloud by the browser's own speech
 *      synthesis, and only when the device has an Icelandic voice that runs
 *      ON the device (`localService`). Some browsers offer voices that send
 *      the text to a company's server to be spoken; those are not used, so
 *      nothing a question says leaves the device. No voice, no button — it
 *      is not drawn at all. A blank is read as a pause.
 *
 *   3. The switch under Stillingar, and the teacher's flag copied in from the
 *      account (`settings.l2Teacher`, see core/profile.js).
 *
 * The slower level ramp is core/difficulty.js (`riseStep`), and the
 * generated error hunts tasks/malbeiting.js (`huntSource`): neither draws. */

import { $, esc } from "./dom.js";
import { presentable } from "../core/definitions.js";
import { secondLanguage, secondLanguageSource } from "../core/profile.js";

export const l2On = (app) => !!(app && app.S && secondLanguage(app.S));

/* ---------- 1. the gloss ---------------------------------------------------- */

/** The word classes that carry meaning, as the sentence tokens name them.
    Prepositions, pronouns, conjunctions and the rest have a role rather than
    a meaning, and their dictionary entry is a class label (core/definitions.js
    `isGrammarGloss`) — no help to somebody learning the language. */
export const CONTENT_CLASSES = new Set(["nafnorð", "sagnorð", "lýsingarorð", "atviksorð"]);

/** What the definition window shows for one entry — the same shape
    ui/dom.js `defBox` builds, so `defTipHTML` draws it unchanged. */
export function glossPayload(app, entry, lemma) {
  const raw = entry
    ? ((app.defs && app.defs.getSync(entry))
      || (entry.d ? { def: entry.d, example: entry.x || null, source: "pakkað" } : null))
    : null;
  const d = presentable(raw);
  const nm = entry ? entry.o : lemma;
  return {
    nm, fl: (entry && entry.fl) || null, q: nm,
    def: (d && d.def) || null, example: (d && d.example) || null,
    source: (d && d.source) || null, grammar: !!(d && d.grammar),
  };
}

/**
 * A function for ui/render.js `sentenceHTML`: a token → the HTML of the word
 * with its gloss on it, or null to leave the word as plain text.
 */
export function glossToken(app) {
  return (tok) => {
    if (!tok || !tok.l || !CONTENT_CLASSES.has(tok.c)) return null;
    const entry = (app.lex && app.lex.entryForToken && app.lex.entryForToken(tok)) || null;
    const p = glossPayload(app, entry, tok.l);
    return `<span class="dfn l2w" tabindex="0" role="button" data-dfn-key="${
      esc("l2:" + p.nm + "|" + ((entry && entry.c) || tok.c))}" data-dfn="${
      esc(JSON.stringify(p))}">${esc(tok.w)}</span>`;
  };
}

/* ---------- 2. reading aloud -------------------------------------------------- */

/**
 * The Icelandic voice to read with, or null. Only a voice that runs on the
 * device (`localService === true`): a network voice would send the sentence
 * away to be spoken. `is-IS` before any other Icelandic tag.
 *
 * @param {SpeechSynthesis} [synth]  passed by a test; the browser's otherwise
 */
export function icelandicVoice(synth = globalThis.speechSynthesis) {
  if (!synth || typeof synth.getVoices !== "function") return null;
  let list;
  try { list = synth.getVoices() || []; } catch { return null; }
  const is = [...list].filter((v) => v && /^is(?:[-_]|$)/i.test(String(v.lang || ""))
    && v.localService === true);
  return is.find((v) => /^is[-_]is$/i.test(v.lang)) || is[0] || null;
}

/** The text of a sentence on the screen as it should be read: a blank (`.blank`)
    becomes a pause, every other element just its text. */
export function readableText(el) {
  if (!el) return "";
  const c = el.cloneNode(true);
  c.querySelectorAll(".blank").forEach((b) => { b.textContent = " … "; });
  return c.textContent.replace(/\s+/g, " ").trim();
}

/** Read the question's sentence aloud. Nothing happens without a voice. */
export function speakSentence(synth = globalThis.speechSynthesis) {
  const voice = icelandicVoice(synth);
  const el = document.querySelector("#task .card .sentence");
  const text = readableText(el);
  if (!voice || !text || typeof SpeechSynthesisUtterance === "undefined") return false;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.voice = voice;
  u.lang = voice.lang;
  /* A little slower than the voice's own pace: this is for somebody still
     learning to hear where one word ends and the next begins. */
  u.rate = 0.85;
  synth.speak(u);
  return true;
}

/** After a question is drawn: the "Lesa upphátt" button under its sentence,
    when the mode is on and the device has an Icelandic voice. Idempotent. */
export function decorateTask(app) {
  const old = $("l2speak");
  if (!l2On(app) || !icelandicVoice()) { if (old) old.remove(); return; }
  if (old) return;
  const s = document.querySelector("#task .card .sentence");
  if (!s) return;
  s.insertAdjacentHTML("afterend", `<p class="l2speakrow"><button type="button" class="ghost l2speak" id="l2speak"
    aria-label="Lesa setninguna upphátt">🔊 Lesa upphátt</button></p>`);
  $("l2speak").onclick = () => speakSentence();
}

/* ---------- 3. the switch ------------------------------------------------------ */

/** Draw the box under Stillingar from the state. */
export function renderL2Setting(app) {
  const box = $("set-l2");
  if (!box) return;
  const src = secondLanguageSource(app.S);
  box.checked = src !== null;
  /* The teacher's choice is the teacher's: shown, not undone from here. */
  box.disabled = src === "teacher";
  const note = $("set-l2-note");
  if (note) note.hidden = src !== "teacher";
}

/**
 * Wire the mode once, at start-up, after the state is loaded: copy the
 * teacher's flag in from the account, wire the box, and draw the speak button
 * when a voice turns up late (Chrome fills `getVoices()` after the page has
 * loaded and says so with `voiceschanged`).
 */
export function wireSecondLanguage(app) {
  const s = (app.S.settings ||= {});
  if (app.profile && app.profile.secondLanguage === true) s.l2Teacher = true;
  else delete s.l2Teacher;
  const box = $("set-l2");
  if (box) box.onchange = (e) => {
    app.S.settings.secondLanguage = e.target.checked;
    app.save(true);
    /* From the next question on: redrawing the open one could throw away
       an answer half typed. */
    renderL2Setting(app);
  };
  renderL2Setting(app);
  const synth = globalThis.speechSynthesis;
  if (synth && typeof synth.addEventListener === "function") {
    synth.addEventListener("voiceschanged", () => { if (app.cur) decorateTask(app); });
  }
}

/* ---------- 4. the teacher's card (Skólastofan) ---------------------------------- */

/** The card listing the group's pupils with the mode's switch beside each,
    from GET /teacher/secondlanguage. */
export function teacherL2CardHTML(info) {
  if (!info) return "";
  const pupils = info.pupils || [];
  return `<h3 class="sec2">Íslenska sem annað mál</h3>
    <p class="sub">Fyrir nemendur sem eru að læra íslensku sem annað mál. Þá er hægt að ýta á hvert orð í
      setningunni og fá skýringu úr Íslenskri nútímamálsorðabók, setningin er lesin upphátt ef tækið á
      íslenska rödd, þyngdin hækkar hægar og villuveiðarnar eru af því tagi sem hentar. Nemandinn getur
      líka kveikt á þessu sjálfur í Stillingum; það sem þú kveikir á getur hann ekki slökkt á.</p>
    ${pupils.length ? `<div class="filters l2pupils">${pupils.map((p) =>
      `<label><input type="checkbox" data-l2pupil="${esc(p.id)}"${p.on ? " checked" : ""}> ${esc(p.name)}</label>`).join("")}</div>`
      : `<p class="sub faint">Enginn nemandi er í hópnum.</p>`}
    <div id="tc-l2-msg"></div>`;
}

/** Draw the card into `#tc-l2` and wire its boxes. */
export async function drawTeacherL2(app, group) {
  const box = $("tc-l2");
  if (!box || !app.server || !app.server.teacherSecondLanguage) return;
  let info;
  try { info = await app.server.teacherSecondLanguage(group); }
  catch { box.innerHTML = ""; return; }
  box.innerHTML = teacherL2CardHTML(info);
  box.querySelectorAll("[data-l2pupil]").forEach((cb) => {
    cb.onchange = async () => {
      cb.disabled = true;
      try {
        await app.server.setSecondLanguage(group, cb.dataset.l2pupil, cb.checked);
        $("tc-l2-msg").innerHTML = "";
      } catch (e) {
        cb.checked = !cb.checked;
        $("tc-l2-msg").innerHTML = `<div class="verdict bad"><p>${esc(e.message)}</p></div>`;
      }
      cb.disabled = false;
    };
  });
}
