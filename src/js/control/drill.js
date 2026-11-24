/* The drill controller (critique item 76): the two short runs of questions on
   one thing that went wrong.

   * The rescue drill (v6.6, core/wordhealth.js): a few questions on one word
     in trouble, offered after a question outside a session, or started from
     the collection or the skill map. It has no summary; its result is shown
     on its own strip (ui/drill.js).
   * "Þrjár í röð" (item 36, core/streak.js): after a diagnosed miss in a
     session, the rule and three questions on its error pattern — inside the
     session, outside its count.

   Like every controller its fields and methods are mixed into `app` (app.js),
   so `this` is the app. `next` and `finish` in app.js call `drillNext`,
   `streakNext`, `streakAnswered` and `drillAnswered` at their turn. */

import { todayKey, effectivePolicy, grantXp } from "../core/state.js";
import { drillTask, makeView, applyEffects, streakTasks } from "../tasks/index.js";
import { queuePattern } from "../core/review.js";
import { STREAK_N, streakPattern, startStreak, stepStreak, streakEntry, streakLine } from "../core/streak.js";
import { statusOf, weakWords, drillable, startDrill, drillStep, settleDrill } from "../core/wordhealth.js";
import { renderTask } from "../ui/render.js";
import { renderDrillBar } from "../ui/drill.js";
import { renderRunBar, usable, showStreakOffer, renderStreakIntro } from "../ui/session.js";
import { showStreakEnd } from "../ui/verdict.js";
import { rng } from "./rng.js";
import { wordRecord } from "../core/wordknowledge.js";

export function drillControl() {
  return {
    /* ---- the rescue drill (v6.6, core/wordhealth.js) ----
       `drill` is the drill in progress, `drillOffer` a word offered for one,
       `drillDone` the result of the last one, shown until it is closed. None of
       it is saved: a drill abandoned by closing the tab is simply not counted. */
    drill: null,
    drillOffer: null,
    drillDone: null,
    drillOffered: new Set(),

    /* ---- "Þrjár í röð" (item 36, core/streak.js) ----
       `streakOffer` is the offer under the verdict just shown, with its three
       questions already built (it is only made when all three can be);
       `streak` the three in progress. Neither is saved: what is answered is in
       the state like any answer, and the pattern goes into the review queue
       when the three end. */
    streak: null,
    streakOffer: null,

    /** Begin a rescue drill on one word, from the offer or from the collection. */
    startDrill(key) {
      if (this.duelRun || this.liveRun) return;
      const [lemma, cls] = String(key).split("|");
      const entry = this.lex.lookup(lemma, cls);
      if (!entry) return;
      this.drill = { ...startDrill(key, wordRecord(this.S, key)), entry, turn: 0 };
      this.policy = null;
      this.drillOffer = null;
      this.drillDone = null;
      this.forcedNoun = null;
      if (this.openView) this.openView("practice");
      this.next();
    },

    /** Leave a drill half-way. Nothing is lost and nothing is awarded. */
    stopDrill() {
      this.drill = null;
      renderDrillBar(this);
      this.next();
    },

    /** After a question: offer a drill on a word in trouble, sparingly. */
    considerOffer() {
      if (this.duelRun || this.liveRun || this.run) return;
      if (this.drill || this.drillOffer || this.drillOffered.size >= 3) return;
      const fresh = (k) => !this.drillOffered.has(k);
      /* The word just answered, if it is in trouble … */
      const cur = this.cur && this.cur.word;
      let pick = null;
      if (cur && fresh(cur) && statusOf(wordRecord(this.S, cur)) === "weak") {
        const [lemma, cls] = cur.split("|");
        if (drillable(this.lex, this.lex.lookup(lemma, cls))) pick = { key: cur, lemma };
      }
      /* … otherwise, every fifteen questions, the worst word there is. */
      this.sinceOffer = (this.sinceOffer || 0) + 1;
      if (!pick && this.sinceOffer >= 15) {
        this.sinceOffer = 0;
        const w = weakWords(this.S, this.lex).find((x) => x.drillable && fresh(x.key));
        if (w) pick = { key: w.key, lemma: w.lemma };
      }
      if (!pick) return;
      this.drillOffered.add(pick.key);
      this.drillOffer = pick;
    },

    /**
     * `next` (app.js), the drill's turn: its next question.
     * @returns {boolean} drawn — nothing else is to be
     */
    drillNext() {
      if (this.drill) {
        const b = drillTask(this.lex, makeView({
          S: this.S, sess: this.sess, policy: (this.policy ||= effectivePolicy(this.S)), inRun: !!this.run,
        }), rng, this.drill.entry, this.drill.turn++);
        /* A noun left waiting by a cloze has no say in a drill, or after it. */
        this.forcedNoun = null;
        if (b) {
          applyEffects(this, b.effects);
          this.cur = b.task;
          renderDrillBar(this);
          renderRunBar(this);
          renderTask(this);
          this.clock.mark();
          return true;
        }
        /* Nothing can be asked about this word with what is switched on. The
           drill ends without counting for or against anybody. */
        this.drill = null;
      }
      return false;
    },

    /**
     * `finish` (app.js), the drill's turn: one question further, and settled
     * when it is over. A question with no right answer (`correct: null`) does
     * not count.
     * @returns the settled drill (core/wordhealth.js `settleDrill`) when this
     *   answer ended one, for the badges; otherwise null
     */
    drillAnswered(correct) {
      let drill = null;
      if (this.drill && this.cur && this.cur.drill &&
          (correct === true || correct === false)) {
        drillStep(this.drill, correct);
        if (this.drill.done) {
          drill = settleDrill(this.S, this.drill, wordRecord(this.S, this.drill.key), todayKey());
          grantXp(this.S, drill.xp);
          this.drillDone = { ...drill, lemma: this.drill.entry.o };
          this.drill = null;
        }
      }
      return drill;
    },

    /* ---- "Þrjár í röð" (critique item 36, core/streak.js) ---------------- */

    /**
     * After a diagnosed wrong answer in a session: offer three questions on its
     * pattern, under the verdict. Made only when all three can be built now —
     * under the session's own topic if it can, else under the whole policy —
     * so the offer never turns into two questions, or none.
     */
    offerStreak(findings) {
      const r = this.run, from = this.cur;
      if (!r || !from || this.streak || this.drill || this.duelRun || this.liveRun) return;
      const p = streakPattern(findings, false,
        { done: r.streaked, canPractise: (id) => usable(this, [id]) });
      if (!p) return;
      const three = (policy) => streakTasks(this.lex,
        makeView({ S: this.S, sess: this.sess, policy }), rng, p, from, STREAK_N);
      const tasks = three(this.reviewPolicy()) || three(effectivePolicy(this.S));
      if (!tasks) return;
      this.streakOffer = { p, tasks, t: from.typeId || from.type, sk: from.skill || null };
      showStreakOffer(this, p);
    },

    /** The offer taken: the rule first (`next` draws it), then the three. */
    startStreak() {
      const o = this.streakOffer;
      if (!o || !this.run || this.streak) return;
      this.streakOffer = null;
      this.run.streaked.push(o.p);
      this.streak = { ...startStreak(o.p, { t: o.t, sk: o.sk }), queue: o.tasks };
      this.next();
    },

    /** From the rule to the first question. */
    beginStreak() {
      if (!this.streak) return;
      this.streak.intro = false;
      this.next();
    },

    /**
     * The three are over — done, stopped with the ×, or skipped at the rule.
     * Whatever was answered sends the pattern to the review queue for
     * tomorrow, and is noted for the session's summary. Safe to call twice.
     */
    endStreak() {
      const st = this.streak;
      if (!st) return;
      if (!st.queued) {
        st.queued = true;
        const e = streakEntry(st);
        if (e) {
          queuePattern(this.S, e, todayKey());
          if (this.run) this.run.streaks.push({ p: st.p, c: st.c, n: st.i });
          this.save();
        }
      }
      if (st.done) return;          // the last verdict is still on the screen
      this.streak = null;
    },

    /** The × on the line of the three: back to the session, nothing lost. */
    stopStreak() {
      if (!this.streak) return;
      this.streak.done = false;
      this.endStreak();
      this.streak = null;
      this.next();
    },

    /**
     * `next` (app.js), the turn of "Þrjár í röð": the rule, or the next of
     * the three. An offer under the last verdict lapses here either way.
     * @returns {boolean} drawn — nothing else is to be
     */
    streakNext() {
      /* An offer under the last verdict lapses when the child goes on. */
      this.streakOffer = null;
      /* Item 36: "Þrjár í röð" — the rule, then three questions on one error
         pattern, inside the session but outside its count (core/streak.js). */
      if (this.streak && this.run) {
        const st = this.streak;
        if (st.intro) {
          this.cur = null;
          renderDrillBar(this);
          renderRunBar(this);
          renderStreakIntro(this);
          return true;
        }
        const b = !st.done && st.queue.shift();
        if (b) {
          applyEffects(this, b.effects);
          this.cur = b.task;
          renderDrillBar(this);
          renderTask(this);
          renderRunBar(this);
          this.clock.mark();
          return true;
        }
        st.done = false;
        this.endStreak();
        this.streak = null;
      } else this.streak = null;
      return false;
    },

    /**
     * `finish` (app.js), the turn of "Þrjár í röð": one of the three answered
     * — or a diagnosed miss in the session (`runQuestion`: it was counted
     * there just now), which may offer them.
     */
    streakAnswered(correct, findings, runQuestion) {
      const r = this.run;
      const st = this.streak;
      if (st && this.cur && this.cur.streak && !this.cur.closed &&
          (correct === true || correct === false)) {
        this.cur.closed = true;
        stepStreak(st, correct);
        renderRunBar(this);
        if (st.done) {
          this.endStreak();
          showStreakEnd(streakLine(st), r && r.i >= r.n);
        }
      } else if (runQuestion && correct === false && !r.placement) this.offerStreak(findings);
    },
  };
}
