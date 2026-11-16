/* The live round controller (critique item 76): a live class round (v6.13,
   item 64). The teacher starts it in the lesson; every pupil in the group is
   offered it, and the questions come from the teacher, not from Áfram. The
   round itself — joining, the event stream, the strip, sending each answer —
   is ui/live.js; this is its place in the app: its state, its turn in `next`,
   and the regular look for a round to join.

   Like every controller its fields and methods are mixed into `app` (app.js),
   so `this` is the app. */

import { pollLive, liveAnswer as sendLiveAnswer, renderLiveBar } from "../ui/live.js";

export function liveControl() {
  return {
    /* ---- a live class round (v6.13, item 64; ui/live.js) ----
       `liveRun` is the round this pupil has joined: its id, the server's last
       picture of it and the event stream; `liveOffer` a round in the group not
       yet joined; `liveNote` a line to show when one has ended. None of it is
       saved: the server holds the round, for the length of a lesson. */
    liveRun: null,
    liveOffer: null,
    liveNote: null,
    /** Is there a round to join? (ui/live.js `pollLive`) */
    loadLive() { return pollLive(this); },
    /** The answer just judged, for the server (ui/render.js `conclude`). */
    liveAnswer(task, response) { sendLiveAnswer(this, task, response); },

    /**
     * `next` (app.js), the live round's turn, which comes first: the next
     * question comes from the teacher, not from Áfram (ui/live.js). The card
     * stays as it is.
     * @returns {boolean} the round has the board — nothing else is drawn
     */
    liveNext() {
      if (this.liveRun) { renderLiveBar(this); return true; }
      return false;
    },

    /** Start-up, on a server: a live round is started in the lesson, so the
        look for one is frequent — one small request every 15 seconds while
        the tab is open. */
    watchLive() {
      if (this.server) setInterval(() => {
        if (document.visibilityState === "visible" && !this.liveRun) this.loadLive();
      }, 15000);
    },
  };
}
