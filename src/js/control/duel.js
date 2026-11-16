/* The duel controller (critique item 76): duels between two pupils (v6.7,
   core/duel.js) and team duels (v6.13, item 67, core/teamduel.js), which are
   played and settled the same way and ride in the same list, marked `team`.

   The server holds the duels; this fetches them, settles what has finished
   into `S.duels`, starts one (the seeds are fetched only then: a browser that
   holds them holds the questions), keeps each answer for the server and sends
   them at the end. The strip and the room are ui/duel.js.

   Like every controller its fields and methods are mixed into `app` (app.js),
   so `this` is the app. `next` and `finish` in app.js call `duelNext` and
   `duelAnswered` at their turn. */

import { DATA } from "../../../data/data_bundle.js";
import { buildLexicon } from "../core/lexicon.js";
import { blankState, newSession, todayKey, badgeContext, effectivePolicy, grantXp } from "../core/state.js";
import { checkBadges } from "../core/badges.js";
import { windowsFor } from "../core/rarity.js";
import { lexHardness } from "../core/calibration.js";
import { createPolicy } from "../core/policy.js";
import { duelTasks, signature, settleDuels, duelTotals, dataPrint } from "../core/duel.js";
import { nextTask, buildTask, makeView, applyEffects } from "../tasks/index.js";
import { $, queueBadges, openSheet } from "../ui/dom.js";
import { renderTask } from "../ui/render.js";
import { renderShareCard } from "../ui/account.js";
import { renderDrillBar } from "../ui/drill.js";
import { renderRunBar } from "../ui/session.js";
import { renderDuelBar, renderDuelRoom } from "../ui/duel.js";

export function duelControl() {
  return {
    /* ---- duels (v6.7, core/duel.js) ----
       `duelInfo` is the server's last answer to GET /duels and `duelList` its
       duels; `duelRun` the duel being answered on this screen; `duelNews`
       results settled on this device and not yet closed; `duelSent` the score
       just sent while the other player has not answered. Nothing of it is
       saved: the server holds the duels, `S.duels` the settled results. */
    duelInfo: null,
    duelList: [],
    duelRun: null,
    duelNews: [],
    duelSent: null,
    duelSkipped: new Set(),
    duelPending: null,
    duelLex: null,

    /** The lexicon duels are built from: the filtered vocabulary, for everyone,
        so both players' browsers build the same questions. */
    lexForDuels() {
      /* v6.13 (item 17): …and never with calibrated scores. This browser's
         table may be a week older than the opponent's, and the server builds
         from none; `this.lex` is only shared when it carries no table. */
      const plain = !lexHardness(this.cal);
      const blocked = (DATA.blocked || []).length;
      if (plain && (!blocked || effectivePolicy(this.S).safeVocab)) return this.lex;
      return (this.duelLex ||= buildLexicon(DATA, { hide: blocked ? new Set(DATA.blocked) : null }));
    },

    /** Fetch the duels, settle any that have finished, redraw. */
    async loadDuels() {
      if (!this.server || !this.S) return;
      if (this.duelPending) await this.sendDuel(this.duelPending);
      let info;
      try { info = await this.server.duels(); } catch { return; }
      /* v6.13 (item 67): a team duel is played and settled as a duel is; it
         rides in the same list, marked `team`. */
      const team = await this.server.teamDuels().then((r) => r.duels || []).catch(() => []);
      this.duelInfo = info;
      this.duelList = [...(info.duels || []), ...team];
      /* A hold for review can begin mid-visit (server/guard.mjs); say so now,
         not only after a reload. */
      if (this.profile && "review" in info && !!info.review !== !!this.profile.review) {
        this.profile.review = !!info.review;
        if (!$("view-class").hidden) renderShareCard(this);
      }
      this.duelLoadedAt = Date.now();
      const settled = settleDuels(this.S, this.duelList);
      if (settled.length) {
        settled.forEach((s) => { if (s.xp) grantXp(this.S, s.xp); });
        this.duelNews = [...settled, ...this.duelNews].slice(0, 4);
        if (this.duelSent && settled.some((s) => s.view.id === this.duelSent.view.id)) this.duelSent = null;
        const totals = duelTotals(this.S);
        const won = checkBadges(
          { ...badgeContext(this.S, this.sess), when: "duel",
            duel: { ...totals, perfect: settled.some((s) => s.perfect),
                    tie: settled.some((s) => s.outcome === "t") } },
          this.S.badges, this.sess.badgeAwards, undefined, (this.S.periods ||= {}));
        won.forEach((b) => this.awardBadge(b, todayKey()));
        this.save();
        this.refresh();
        if (won.length) {
          /* Not over a question: a session in progress holds them for its summary. */
          const { show, quiet } = windowsFor(won, this.badgeStats, { inSession: !!this.run });
          if (show.length) queueBadges(show, () => {}, quiet);
        }
      }
      if (!this.duelRun) renderDuelBar(this);
      if (!$("view-class").hidden) renderDuelRoom(this);
    },

    /** Challenge somebody. Throws with the server's message on failure. */
    async challenge(opponent, topic, n) {
      const r = await this.server.challenge(opponent, topic, n);
      await this.loadDuels();
      return r;
    },

    /**
     * Begin answering a duel. The seeds are fetched now and not before
     * (POST /duels/:id/start): a browser that holds them holds the questions.
     * This player's questions are then built here, exactly as the server
     * builds them to grade the answers (core/duel.js `duelTasks`).
     */
    async startDuel(id) {
      const v = (this.duelList || []).find((x) => x.id === id);
      if (!v || v.status !== "open" || v.mine || this.duelRun || this.duelStarting) return;
      /* Not started: said on the strip, with the reason. */
      const refuse = (error) => {
        this.duelSent = { view: v, c: 0, n: v.n, unplayed: true, error };
        this.openView("practice");
        renderDuelBar(this);
      };
      if (v.data && v.data !== dataPrint(DATA)) {
        return refuse("Einvígið var búið til með nýrri útgáfu af forritinu. Endurhladdu síðuna (F5) og reyndu aftur.");
      }
      this.duelStarting = id;
      this.duelSent = null;
      this.openView("practice");
      renderDuelBar(this);                       // "Sæki spurningarnar…"
      let r;
      try { r = await (v.team ? this.server.teamDuelStart(id) : this.server.duelStart(id)); }
      catch (err) {
        this.duelStarting = null;
        return refuse(err && err.status ? err.message
          : "Náði ekki sambandi við þjóninn. Reyndu aftur eftir smástund.");
      }
      this.duelStarting = null;
      const view = r.duel || v;
      const tasks = duelTasks(this.lexForDuels(), { ...view, seed: r.seed, key: r.key },
        { nextTask, buildTask, makeView, applyEffects, blankState, newSession, createPolicy });
      if (!tasks.length) return renderDuelBar(this);
      const sig = signature(tasks);
      /* The server says what it will grade. If this browser built something
         else, better to hear it now than after twenty answers. */
      if (r.sig && r.sig !== sig) {
        return refuse("Spurningarnar stemma ekki við þjóninn. Endurhladdu síðuna (F5) og reyndu aftur.");
      }
      this.drill = null; this.drillOffer = null; this.drillDone = null;
      this.duelSent = null;
      this.duelRun = { view, tasks, sig, i: 0, c: 0, marks: [], answers: [] };
      this.duelSkipped.delete(id);
      this.openView("practice");
      renderDrillBar(this);
      this.next();
    },

    /** The answer just judged, kept for the server (ui/render.js `conclude`).
        A copy: the renderers hand over their own live objects. */
    duelAnswer(task, response) {
      const run = this.duelRun;
      if (!run || run.tasks[run.i] !== task) return;
      run.answers[run.i] = JSON.parse(JSON.stringify(response ?? null));
    },

    /** Give up half-way: what is unanswered counts as wrong, and it is sent. */
    quitDuel() {
      const run = this.duelRun;
      if (!run) return;
      /* No `confirm()`: it is ignored in a frame and in an app's built-in
         browser, where it returned false and the button seemed dead. */
      const left = run.tasks.length - run.i;
      const sheet = openSheet("Hætta í einvíginu?", `
        <p>${left === 1 ? "Sú eina spurning sem er eftir telst röng"
          : `Þær ${left} spurningar sem eru eftir teljast rangar`}, og niðurstaðan
          (${run.c} rétt af ${run.tasks.length}) er send strax.</p>
        <div class="answer"><button type="button" class="go" id="duelquit-yes">Já, hætta</button>
          <button type="button" class="ghost" id="duelquit-no">Halda áfram</button></div>`);
      sheet.el.querySelector("#duelquit-no").onclick = () => sheet.close();
      sheet.el.querySelector("#duelquit-yes").onclick = () => {
        sheet.close();
        if (this.duelRun !== run) return;
        this.endDuel();
        this.next();
      };
    },

    endDuel() {
      const run = this.duelRun;
      this.duelRun = null;
      /* One answer per question, in order; what was never answered is null,
         and the server counts it wrong. The count shown meanwhile is this
         browser's own — the server's replaces it when it answers. */
      const answers = run.tasks.map((_, i) => run.answers[i] ?? null);
      const payload = { view: run.view, answers, sig: run.sig };
      this.duelSent = { view: run.view, c: run.c, n: run.tasks.length };
      renderDuelBar(this);
      this.sendDuel(payload).then(() => this.loadDuels());
    },

    /** Send the answers; kept and retried on the next load if the network fails. */
    async sendDuel(p) {
      try {
        const r = await (p.view.team ? this.server.teamDuelResult(p.view.id, p.answers, p.sig)
          : this.server.duelResult(p.view.id, p.answers, p.sig));
        this.duelPending = null;
        /* The score is the server's. It is the same judge on the same
           questions, so it is the number already on the strip — but if the two
           ever differ, the server's is the one that counts and the one shown. */
        const mine = r && r.duel && r.duel.mine;
        if (mine && this.duelSent && this.duelSent.view.id === p.view.id) {
          this.duelSent.c = mine.c; this.duelSent.n = mine.n;
          this.duelSent.view = r.duel;
        }
      } catch (err) {
        /* 4xx: already sent, the time ran out, or the questions do not match —
           nothing to retry. */
        if (err && err.status && err.status < 500) {
          this.duelPending = null;
          if (this.duelSent) this.duelSent.error = err.message;
        } else {
          this.duelPending = p;
        }
      }
    },

    /**
     * `next` (app.js), the duel's turn: its next question, or — after the
     * last — the answers sent.
     * @returns {boolean} drawn — nothing else is to be
     */
    duelNext() {
      if (this.duelRun) {
        const run = this.duelRun;
        if (run.i < run.tasks.length) {
          this.cur = run.tasks[run.i];
          renderDuelBar(this);
          renderRunBar(this);
          renderTask(this);
          this.clock.mark();
          return true;
        }
        this.endDuel();
      }
      return false;
    },

    /** `finish` (app.js), the duel's turn: one question further; the last
        one sends the score. A question with no right answer does not count. */
    duelAnswered(correct) {
      if (this.duelRun && this.cur && this.cur.duel &&
          (correct === true || correct === false)) {
        const run = this.duelRun;
        run.marks[run.i] = correct ? 1 : 0;
        if (correct) run.c++;
        run.i++;
        renderDuelBar(this);
        if (run.i >= run.tasks.length) this.endDuel();
      }
    },
  };
}
