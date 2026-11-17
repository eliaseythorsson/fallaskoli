/* Small interface utilities: escaping, formatting, the glossary tooltip, the
   Icelandic character keys, confetti and the badge window. */

import { term, RESOURCES, glossify } from "../core/glossary.js";
import { presentable } from "../core/definitions.js";
import { lessonForTerm, lessonById } from "../core/lessons.js";

export const $ = (id) => document.getElementById(id);

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const markdown = (s) =>
  s.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\*(.+?)\*/g, "<em>$1</em>");

/** Escape, then bold/italics, then turn grammar terms into hover triggers. */
export function fmt(text, { gloss = true } = {}) {
  const html = markdown(esc(text));
  return gloss ? glossify(html) : html;
}

/* ---------- hugtakahjálp ---------------------------------------------- */

let tip = null;

function tipHTML(t) {
  const links = RESOURCES
    .map((r) => `<a href="${r.url(t.q)}" target="_blank" rel="noopener">${esc(r.nm)}</a>`)
    .join("");
  const page = lessonById(lessonForTerm(t.id));
  const own = page ? `<button type="button" class="lessonlink" data-lesson="${esc(page.id)}">📖 ${esc(page.nm)}</button>` : "";
  return `<h4>${esc(t.nm)}</h4><p>${markdown(esc(t.ds))}</p>
    ${own ? `<div class="tiplesson">${own}</div>` : ""}
    <div class="tiplinks"><span>Lesa meira</span>${links}</div>`;
}

/* The hover window for the WORD a question is about (as opposed to a
   grammatical term): the whole definition, an example, the source and lookup
   links. `app.defs` is the only source it reads. */
function defTipHTML(d) {
  const links = RESOURCES
    .map((r) => `<a href="${r.url(d.q)}" target="_blank" rel="noopener">${esc(r.nm)}</a>`)
    .join("");
  /* A grammatical gloss is not a meaning, and printing it under the word class
     as though it were one gives "allur — fornafn — óákveðið fornafn", which
     says the same thing twice and explains nothing. Say what is actually true:
     the dictionary has no meaning for this word because it does not have one. */
  const body = !d.def
    ? "Engin skýring er komin fyrir þetta orð. Flettu því upp — tenglarnir hér undir fara beint á það."
    : d.grammar
      ? `Þetta er <b>${esc(d.def)}</b>. Orðabókin gefur enga merkingu — orð úr þessum `
        + `flokkum hafa hlutverk í setningu frekar en merkingu sem hægt er að lýsa.`
      : markdown(esc(d.def));
  return `<h4>${esc(d.nm)}${d.fl ? ` <i>${esc(d.fl)}</i>` : ""}</h4>
    <p>${body}</p>
    ${d.example ? `<p class="tipex">Dæmi: <em>${esc(d.example)}</em></p>` : ""}
    ${d.source ? `<p class="tipsrc">heimild: ${esc(d.source)}</p>` : ""}
    <div class="tiplinks"><span>Lesa meira</span>${links}</div>`;
}

function showTip(el) {
  if (el.dataset.dfn) {
    let d;
    try { d = JSON.parse(el.dataset.dfn); } catch { return; }
    return paint(el, defTipHTML(d), "dfn:" + el.dataset.dfnKey);
  }
  const t = term(el.dataset.gl);
  if (!t) return;
  paint(el, tipHTML(t), el.dataset.gl);
}

function paint(el, html, forKey) {
  if (!tip) {
    tip = document.createElement("div");
    tip.className = "tip";
    document.body.appendChild(tip);
  }
  tip.innerHTML = html;
  tip.hidden = false;
  const r = el.getBoundingClientRect();
  const w = Math.min(320, window.innerWidth - 24);
  tip.style.width = w + "px";
  let left = r.left + r.width / 2 - w / 2;
  left = Math.max(12, Math.min(left, window.innerWidth - w - 12));
  tip.style.left = left + window.scrollX + "px";
  /* Above only if it FITS above — measured, not guessed, or a tall window
     hangs off the top and lands on the tab bar. */
  const fitsAbove = r.top >= tip.offsetHeight + 16;
  tip.style.top = (fitsAbove ? r.top - tip.offsetHeight - 8 : r.bottom + 8) + window.scrollY + "px";
  tip.dataset.for = forKey;
}

export function hideTip() {
  if (tip) { tip.hidden = true; tip.dataset.for = ""; }
}

/* The window is `pointer-events: none` (so it never swallows a click meant
   for what is under it; its links keep `auto`), which means "is the pointer
   inside it" has to be answered from geometry rather than `:hover`. */
let pointerAt = { x: -1, y: -1 };
if (typeof document !== "undefined") {
  document.addEventListener("pointermove", (e) => {
    pointerAt = { x: e.clientX, y: e.clientY };
  }, { passive: true });
}

function pointerInTip() {
  if (!tip || tip.hidden) return false;
  const r = tip.getBoundingClientRect();
  return pointerAt.x >= r.left && pointerAt.x <= r.right
    && pointerAt.y >= r.top && pointerAt.y <= r.bottom;
}

/** One delegated listener for the whole document; works for mouse and keyboard. */
/* The delay before an explanation opens: 120 ms over text, 1.5 s inside a
   button, where the labels are the very terms and every attempt to press one
   used to open a window on top of it. Clicks and the keyboard open at once. */
const HOVER_MS = 120;
const HOVER_MS_IN_BUTTON = 1500;

const hoverDelay = (el) =>
  el.closest("button, .pickw, [role=button]:not(.gl):not(.dfn)")
    ? HOVER_MS_IN_BUTTON : HOVER_MS;

/* Two things open on hover: a grammatical term (`.gl`) and a word definition
   (`.dfn`). */
const TRIG = ".gl, .dfn";
const keyOf = (el) => (el.dataset.dfn ? "dfn:" + el.dataset.dfnKey : el.dataset.gl);

export function wireGlossary(enabled = () => true) {
  let hoverTimer = null;
  document.addEventListener("mouseover", (e) => {
    const el = e.target.closest(TRIG);
    if (!el || !enabled()) return;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => showTip(el), hoverDelay(el));
  });
  document.addEventListener("mouseout", (e) => {
    const el = e.target.closest(TRIG);
    if (!el) return;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => {
      if (!pointerInTip()) hideTip();
    }, 220);
  });
  /* Pointer down = the intention was to choose, not to read. Cancel the wait —
     and close anything already open, unless the pointer went down inside the
     explanation itself (its links have to stay clickable). An explanation that
     stays up after the user has decided to press something else is in the way,
     and on a phone it is in the way of the only pointer there is. */
  document.addEventListener("pointerdown", (e) => {
    clearTimeout(hoverTimer);
    /* Not on the trigger itself: the click handler below toggles it, and a tap
       that closed the window here would always look like a first tap. */
    if (!e.target.closest?.(".tip") && !e.target.closest?.(TRIG)) hideTip();
  }, true);

  /* touch and keyboard users: a click or Enter opens and closes */
  document.addEventListener("click", (e) => {
    const el = e.target.closest(TRIG);
    if (!el || !enabled()) { if (!e.target.closest(".tip")) hideTip(); return; }
    /* Inside a button, the button wins. Clicking the word "miðstig" on an
       answer button should choose miðstig — not open an explanation on top of
       the button being pressed. The row label above is not a button and gives
       the same explanation, so a touch user loses nothing.                 */
    if (el.closest("button, .pickw")) { hideTip(); return; }
    e.preventDefault();
    if (tip && !tip.hidden && tip.dataset.for === keyOf(el)) hideTip();
    else showTip(el);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideTip();
    const el = e.target.closest?.(TRIG);
    if (el && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); showTip(el); }
  });
  window.addEventListener("scroll", hideTip, { passive: true });
}

/**
 * The definition line for the word a question is about. Visible on the page,
 * with more on hover. One place decides how it looks, so every task type gets
 * the same treatment.
 *
 * `locked` is set by the questions whose answer is the word class: the text
 * stays, but with no trigger (no `.dfn`, no `data-dfn`, no `tabindex`), so
 * neither the hover nor the keyboard can open the entry that names the class.
 * `unlockDefBox` gives it back once the answer is in.
 */
export function defBox(app, entry, { compact = false, locked = false } = {}) {
  if (!entry) return "";
  const raw = (app.defs && app.defs.getSync(entry))
    || (entry.d ? { def: entry.d, example: entry.x || null, source: "pakkað" } : null);
  /* `locked` is set by exactly one kind of question — the one that asks what
     word class this is — so it is also the flag that says a definition which is
     only a class label ("óákveðið fornafn") must not be on the screen. See the
     header of core/definitions.js. */
  const d = presentable(raw, { hideGrammar: locked });
  /* Locked, the case a preposition governs goes too: "(með þolfalli)" names
     the word class it is asked about (v6.10; Fallstjórn hides the whole line). */
  const def = (locked && d?.def
    ? d.def.replace(/\s*\((?:með|\+)\s*(?:nefnif|þolf|þágu|þgf|þf|eignarf|ef)[^)]*\)/gi, "").trim()
    : d?.def) || null;
  const payload = {
    nm: entry.o, fl: entry.fl || null, q: entry.o,
    def, example: d?.example || null,
    source: d?.source || null,
    grammar: !!d?.grammar,
  };
  /* `locked` renders the same text with no trigger on it: a different class, so
     the delegated listener in `wireGlossary` (which matches `.gl, .dfn`) never
     sees it; no `data-dfn`, so there is nothing for it to read even if it did;
     and no `tabindex`, so the keyboard cannot open it either. See the block
     comment above `CLASS_IS_THE_ANSWER` in ui/render.js for why. */
  const trig = (inner) => (locked
    ? `<span class="dfnlocked">${inner}</span>`
    : `<span class="dfn" tabindex="0" role="button" data-dfn-key="${esc(entry.o + "|" + (entry.c || ""))}"` +
      ` data-dfn="${esc(JSON.stringify(payload))}">${inner}</span>`);

  if (def) {
    const short = def.length > (compact ? 60 : 110)
      ? def.slice(0, compact ? 60 : 110).replace(/\s+\S*$/, "") + "…" : def;
    /* A class label is not a meaning, and saying so costs one word. Without it
       the child reads "óákveðið fornafn" in the place where every other word
       explains itself, and has no way to know the dictionary simply has nothing
       else to say about *allur*. */
    return `<div class="defline${payload.grammar ? " grammar" : ""}" id="defbox">${
      payload.grammar ? `<i class="deflabel">orðflokkur</i>` : ""}${trig(esc(short))}</div>`;
  }
  /* No definition yet: the word should still be lookup-able, and the hover text
     says plainly that no definition has arrived — rather than going silent.
     The lookup links go too while the box is locked: sending the child to
     Íslensk nútímamálsorðabók, which prints the word class at the top of every
     entry, would defeat exactly the same purpose as the hover. */
  return `<div class="defline none" id="defbox">${trig("skýring ekki komin")}${
    locked ? "" : wordLinks(entry.o)}</div>`;
}

/**
 * Give the definition back after the answer has been graded. One line,
 * because `defBox` is the only thing that decides what the box looks like.
 */
export function unlockDefBox(app, entry) {
  const box = $("defbox");
  if (!box || !entry) return;
  box.outerHTML = defBox(app, entry);
}

/** Lookup links for a word with no stored definition.
    Only 75 of 6,518 words have a hand-written definition, so the rest at least
    get a route to the dictionary rather than standing there unexplained. */
export function wordLinks(lemma) {
  return `<span class="lookup"><span>fletta upp</span>` + RESOURCES
    .map((r) => `<a href="${r.url(lemma)}" target="_blank" rel="noopener">${esc(r.nm)}</a>`)
    .join("") + `</span>`;
}

/* ---------- séríslenskir stafir ---------------------------------------- */

/* A side effect at import time is bad: it made the renderer impossible to test
   in Node, because `document` does not exist there. The subscription now sits
   behind a guard, so the pure modules can be imported anywhere — and if the
   program ever gains server-side rendering, nothing changes. */
let lastInput = null;
if (typeof document !== "undefined") {
  document.addEventListener("focusin", (e) => {
    if (e.target.matches?.("input[type=text], textarea")) lastInput = e.target;
  });
}

/* Item 53: the pad only where it helps. A phone or tablet set to Icelandic
   almost always has an Icelandic keyboard with every one of these letters on
   it, and there the pad only pushes the rest of the question down. So the
   guess is: off on a touch device whose language is Icelandic, on everywhere
   else (a laptop, or a tablet set to English, where á and þ are hard to
   reach). The child can switch it either way under Stillingar, and from then
   on the switch decides. */

/** The guess, before anybody has chosen. Pure, so it can be tested. */
export function keypadDefault({ coarse = false, lang = "" } = {}) {
  return !(coarse && /^is(?:[-_]|$)/i.test(String(lang)));
}

/** The pad is shown when the setting says so, or — with no setting — when
    the guess does. `settings.keypad` is only ever true, false or absent. */
export function keypadOn(settings, env) {
  const v = settings && settings.keypad;
  return typeof v === "boolean" ? v : keypadDefault(env);
}

/** What this device is: a finger or a mouse, and the language it is set to. */
export function keypadEnv() {
  if (typeof window === "undefined") return {};
  return {
    coarse: !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches),
    lang: (typeof navigator !== "undefined" && navigator.language) || "",
  };
}

/* Item 52: reading comfort. One class on <body>; head.html does the rest
   (larger type, wider spacing, the proportional face where mono was used). */
export function applyComfort(settings) {
  if (typeof document === "undefined") return;
  document.body.classList.toggle("comfort", !!(settings && settings.comfort === true));
}

/* Who decides is app.js (it holds the state); until it says, the pad shows. */
let keypadWanted = () => true;
export function setKeypadPref(fn) { keypadWanted = fn; }

export function wireKeys() {
  const box = $("keys");
  if (!box) return;
  /* `hidden` rather than removing the box: the renderers lay the question out
     around it, and the switch in Stillingar redraws it in place. */
  if (!keypadWanted()) { box.hidden = true; box.innerHTML = ""; return; }
  box.hidden = false;
  box.innerHTML =["á", "ð", "é", "í", "ó", "ú", "ý", "þ", "æ", "ö"]
    .map((c) => `<button type="button" data-c="${c}">${c}</button>`).join("");
  box.onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const el = (lastInput && !lastInput.disabled)
      ? lastInput
      : document.querySelector("input[type=text]:not([disabled]), textarea:not([disabled])");
    if (!el) return;
    const s = el.selectionStart ?? el.value.length;
    const t = el.selectionEnd ?? s;
    el.value = el.value.slice(0, s) + b.dataset.c + el.value.slice(t);
    el.focus();
    el.setSelectionRange(s + 1, s + 1);
  };
}

/* ---------- konfetti og merkjagluggi ------------------------------------ */

/* v6.9: confetti belongs to the answer that earned it. Moving on to the next
   question stops it, so it can never fall over the next verdict — least of
   all a wrong one. */
let confettiRun = 0;
export function stopConfetti() {
  confettiRun++;
  const c = $("confetti");
  if (c) c.getContext("2d").clearRect(0, 0, c.width, c.height);
}

export function confetti(n = 90) {
  const run = ++confettiRun;
  const c = $("confetti");
  if (!c || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  c.width = innerWidth; c.height = innerHeight;
  const ctx = c.getContext("2d");
  const colors = ["#4A3FBF", "#1E7A57", "#D9A21B", "#B2432D"];
  const bits = Array.from({ length: n }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 220,
    y: innerHeight / 2 - 40,
    vx: (Math.random() - 0.5) * 9,
    vy: -Math.random() * 11 - 3,
    r: Math.random() * 5 + 2,
    col: colors[Math.floor(Math.random() * colors.length)],
    rot: Math.random() * 6,
  }));
  let frames = 0;
  (function step() {
    if (run !== confettiRun) return;          // stopped, or a newer burst took over
    ctx.clearRect(0, 0, c.width, c.height);
    bits.forEach((b) => {
      b.vy += 0.32; b.x += b.vx; b.y += b.vy; b.rot += 0.15;
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot);
      ctx.fillStyle = b.col; ctx.fillRect(-b.r, -b.r, b.r * 2, b.r * 1.4);
      ctx.restore();
    });
    if (++frames < 150) requestAnimationFrame(step);
    else ctx.clearRect(0, 0, c.width, c.height);
  })();
}

/* ---------- Enter: one action, never two --------------------------------
 * A held key sends REPEATED keydown events, each with a fresh timestamp, so a
 * timestamp guard alone let one press submit, dismiss the badges and skip the
 * question. The rule, in one place: a key repeat never counts, an Enter in the
 * middle of IME composition never counts, and an event created before the
 * listener never counts. */
export function freshEnter(e, notBefore = 0) {
  if (e.key !== "Enter") return false;
  if (e.repeat) return false;
  if (e.isComposing || e.keyCode === 229) return false;
  if (notBefore && e.timeStamp && e.timeStamp <= notBefore) return false;
  return true;
}

/* ---------- the badge window queue --------------------------------------
 * One window at a time, each dismissed on purpose: `freshEnter` rejects key
 * repeats and each window ignores anything older than itself. Whoever opened
 * the queue is told when it drains — that callback hands the keyboard back to
 * the Áfram button (`armNext` in ui/verdict.js). */
let badgeQueue = [];
let queueDone = null;

const MODAL_MONTHS = ["janúar", "febrúar", "mars", "apríl", "maí", "júní", "júlí",
                      "ágúst", "september", "október", "nóvember", "desember"];

/** "Þú vannst þetta 18. ágúst — dagurinn þurfti að klárast fyrst." */
function whenLine(key) {
  const [y, m, d] = String(key).split("-").map(Number);
  if (!y || !m || !d) return "";
  return `<p class="modalwhen">Unnið <b>${d}. ${MODAL_MONTHS[m - 1]}</b>.
    Skilyrðið snýst um heilan dag, svo dagurinn þurfti að klárast áður en
    hægt var að dæma hann. Dagsetningin á merkinu er dagurinn sjálfur.</p>`;
}

/* Somebody who wants the badge windows held for now (ui/tour.js): a function
   (badges, onClose) → true when it has taken them. One holder at a time. */
let badgeGate = null;
export function setBadgeGate(fn) { badgeGate = typeof fn === "function" ? fn : null; }

/**
 * Show these badges, one window at a time.
 * @param {Array}     list     badges to show
 * @param {?function} onClose  called once, after the last window closes
 * @param {Array}     quiet    badges won at the same moment that the ceiling
 *                             kept out of the queue; the LAST window names them
 */
export function queueBadges(list, onClose, quiet = []) {
  /* Item 84: while the guided first run is on the screen no window opens
     over it; the tour keeps the badges and shows them when it ends. */
  if (badgeGate && badgeGate([...list, ...quiet], onClose)) return;
  const wasIdle = badgeQueue.length === 0;
  const items = [...list];
  if (quiet.length && items.length) {
    /* On the last window of this batch, not the first: the child should read
       what they won before being told what else they won. */
    items[items.length - 1] = { ...items[items.length - 1], alsoWon: quiet };
  }
  badgeQueue.push(...items);
  /* The newest caller owns the callback. Adding to a queue that is already
     running used to drop the second callback on the floor, which meant the
     keyboard was handed back only if the timing happened to be right. */
  if (onClose) queueDone = onClose;
  if (wasIdle) showNextBadge();
}

/** "og 3 merki í viðbót: Nafnorð: 10 í röð, …" */
function alsoLine(list) {
  if (!list || !list.length) return "";
  const names = list.map((b) => `${b.ico} ${esc(b.nm)}`).join(", ");
  return `<p class="modalalso">Og ${list.length === 1 ? "eitt merki" :
    list.length + " merki"} í viðbót: ${names}. ${list.length === 1 ? "Það bíður" :
    "Þau bíða"} í <b>Merkin þín</b>.</p>`;
}

function showNextBadge() {
  const b = badgeQueue.shift();
  if (!b) {
    const done = queueDone;
    queueDone = null;
    done?.();
    return;
  }
  const scrim = document.createElement("div");
  scrim.className = "scrim";
  /* A badge that was decided after midnight carries the day it was earned, and
     says so. Without this the child is handed "Upp á hár" on Tuesday for what
     it did on Monday with nothing to explain the gap — and the date on the tile
     in the cabinet would look like a mistake. */
  const when = b.wonOn ? whenLine(b.wonOn) : "";
  scrim.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
    <div class="ico">${b.ico}</div>
    <div class="kicker">${when ? "Merki gærdagsins" : "Nýtt merki"}</div>
    <h3>${esc(b.nm)}</h3>
    <p>${esc(b.ds)}</p>
    ${when}
    ${alsoLine(b.alsoWon)}
    <button class="go" id="badgeok">Áfram</button></div>`;
  document.body.appendChild(scrim);
  confetti();
  const shownAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  const close = () => {
    scrim.remove();
    document.removeEventListener("keydown", key);
    showNextBadge();
  };
  const key = (e) => {
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (freshEnter(e, shownAt)) close();
  };
  scrim.querySelector("#badgeok").onclick = close;
  scrim.onclick = (e) => { if (e.target === scrim) close(); };
  document.addEventListener("keydown", key);
  scrim.querySelector("#badgeok").focus();
}

export const cheer = (arr) => arr[Math.floor(Math.random() * arr.length)];

/* Whole idiomatic phrases only — never a translation ("Þetta er það!" was
   one, and went). */
export const CHEERS_OK = ["Frábært!", "Rétt hjá þér!", "Nákvæmlega!", "Vel gert!",
  "Flott!", "Flott hjá þér!", "Alveg rétt!", "Snilld!"];
export const CHEERS_NO = ["Ekki alveg — skoðum þetta saman.",
  "Þetta er erfitt, við tökum annað dæmi.", "Góð tilraun.", "Ekki rétt í þetta sinn."];
export const CHEERS_TRY = ["Flott hjá þér að reyna!", "Góð tilraun — þú ert að hugsa rétt.",
  "Vel gert að útskýra með eigin orðum!"];

/* ---------- a larger window for reading and forms (v6.8) --------------
   The badge window is small and centred; this one holds a page of text (the
   privacy notice) or a form (the error report). Escape, the ✕ and a click on
   the backdrop close it. Returns { el, close }. */
export function openSheet(title, bodyHTML, { onClose } = {}) {
  hideTip();
  const scrim = document.createElement("div");
  scrim.className = "scrim";
  scrim.innerHTML = `<div class="modal sheetmodal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="sheethead"><h3>${esc(title)}</h3>
      <button type="button" class="sheetx" aria-label="Loka">✕</button></div>
    <div class="sheetbody">${bodyHTML}</div></div>`;
  document.body.appendChild(scrim);
  const close = () => {
    scrim.remove();
    document.removeEventListener("keydown", key);
    if (onClose) onClose();
  };
  const key = (e) => { if (e.key === "Escape") { e.preventDefault(); close(); } };
  scrim.querySelector(".sheetx").onclick = close;
  scrim.onclick = (e) => { if (e.target === scrim) close(); };
  document.addEventListener("keydown", key);
  scrim.querySelector(".sheetx").focus();
  return { el: scrim.querySelector(".sheetbody"), close };
}

/* The privacy notice is a page of its own on the server. A link with
   target=_blank opened it in a new tab — and did nothing at all where new
   windows are not allowed (an app's built-in browser, some school devices).
   It now opens inside the program; the link stays a real link, so a middle
   click or "open in new tab" still works. */
export function wirePrivacyLinks() {
  document.addEventListener("click", async (e) => {
    const a = e.target.closest("a[data-privacy]");
    if (!a || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    const sheet = openSheet("Persónuvernd", `<p class="sub">Sæki…</p>`);
    try {
      const r = await fetch(a.getAttribute("href"), { credentials: "same-origin" });
      if (!r.ok) throw new Error(String(r.status));
      const doc = new DOMParser().parseFromString(await r.text(), "text/html");
      doc.querySelectorAll("script, style, link, meta").forEach((x) => x.remove());
      sheet.el.innerHTML = `<div class="privacytext">${doc.body ? doc.body.innerHTML : ""}</div>`;
    } catch {
      sheet.el.innerHTML = `<p>Ekki tókst að sækja yfirlýsinguna.
        <a href="${esc(a.getAttribute("href"))}" target="_blank" rel="noopener">Opna hana í nýjum flipa</a>.</p>`;
    }
  });
}
