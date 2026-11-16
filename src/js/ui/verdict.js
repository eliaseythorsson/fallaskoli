/* What appears under a verdict once the question has ended, and the Áfram
   button that leads on (critique item 76: moved here from app.js, which calls
   them from `finish`, unchanged). The verdict itself is the renderer's
   (ui/render.js `conclude`); these add a line to it. */

import { $, esc, freshEnter } from "./dom.js";
import { patternById } from "../core/diagnosis.js";
import { reviewLine } from "../core/review.js";

/**
 * One line under a wrong answer naming the error pattern (v6.10), so the
 * child sees the diagnosis at the moment it is made, not only in the summary.
 */
export function showFindings(findings, verdict) {
  const v = document.querySelector("#verdict .verdict");
  if (!v || !findings.length || v.querySelector(".diagline")) return;
  const real = findings.filter((f) => !f.soft);
  if (!real.length || verdict === true) return;
  const names = real.map((f) => (patternById(f.p) || {}).nm).filter(Boolean);
  v.insertAdjacentHTML("beforeend", `<p class="diagline">🔎 <b>Villugreining:</b> ${
    names.map(esc).join(" · ")}</p>`);
}

/**
 * One line under the answer that mended an error pattern (items 56 and 58):
 * the pupil sees it the moment it happens, not only on the badge shelf.
 */
export function showMended(ids) {
  const v = document.querySelector("#verdict .verdict");
  if (!v || !ids || !ids.length || v.querySelector(".mendline")) return;
  const names = ids.map((id) => (patternById(id) || {}).nm).filter(Boolean);
  if (!names.length) return;
  v.insertAdjacentHTML("beforeend", `<p class="streakline mendline">🩹 Þú hefur lagað þetta: <b>${
    names.map(esc).join(" · ")}</b> — tíu rétt svör í röð.</p>`);
}

/**
 * One line under a right answer that was a review (core/review.js): when it
 * comes next, or that it is done with. `review` is what `noteReview` said
 * happened in the queue; nothing is shown unless an entry moved.
 */
export function showReview(review) {
  const v = document.querySelector("#verdict .verdict");
  if (!v || !review || v.querySelector(".reviewline")) return;
  const line = reviewLine(review);
  if (line) v.insertAdjacentHTML("beforeend", `<p class="streakline reviewline">🔁 ${esc(line)}</p>`);
}

/**
 * The line under the last of "Þrjár í röð" (item 36), and the button that
 * goes on says where it goes: back to the session, or to its summary if the
 * miss that started the three was the session's last question.
 */
export function showStreakEnd(line, last) {
  const v = document.querySelector("#verdict .verdict");
  if (v && line && !v.querySelector(".streakend"))
    v.insertAdjacentHTML("beforeend", `<p class="streakline streakend">💪 ${esc(line)}</p>`);
  const b = $("check");
  if (b) queueMicrotask(() => {
    if (b.textContent.startsWith("Áfram")) b.textContent = last ? "Sjá samantekt →" : "Aftur í lotuna →";
  });
}

/* ---------- Enter ------------------------------------------------------
 *
 * Enter in the input submits the answer, exactly like "Athuga", and nothing
 * else. There is no listener on `document`: after the verdict the Áfram button
 * takes the focus, requires a FRESH Enter (`freshEnter` rejects key repeats —
 * a held key sends repeated keydown events, each with a new timestamp) and
 * ignores everything in the first 400 ms so the verdict reaches the screen
 * before it can be dismissed.
 *
 * `armNext` returns a re-arm function and the badge queue calls it when the
 * last window closes: closing a modal drops the focus onto `<body>`, where no
 * Enter listener lives, and the re-arm also restarts the grace window so the
 * press that dismissed the last badge cannot skip the question too.
 */
const READ_MS = 400;

/**
 * Turn "Athuga" into "Áfram →" and make it the keyboard's next stop.
 * @returns {function} re-arm: give the button the focus back and restart the
 *   read-grace window. Safe to call any number of times, and a no-op if the
 *   question has been re-rendered underneath it.
 */
export function armNext(app) {
  const noop = () => {};
  const b = $("check");
  if (!b) return noop;

  let armedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  let used = false;
  const go = () => {
    if (used) return;          // a double click on Áfram must not skip a question
    used = true;
    app.next();
  };

  b.textContent = "Áfram →";
  b.disabled = false;
  b.onclick = go;
  b.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();        // never the default click — this decides
    if (!freshEnter(e, armedAt + READ_MS)) return;
    if (document.querySelector(".scrim")) return;   // a badge window comes first
    go();
  });
  b.focus();

  return () => {
    if (used || !b.isConnected) return;
    armedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    b.focus();
  };
}
