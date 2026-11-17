/* The session controller (critique item 76): practice in sessions (v6.10) —
   starting one, drawing its questions, counting its answers and ending it with
   its summary — and the ways in: the picker, "Dagsins lota" (item 21), an
   assignment (item 65), "Æfa þetta" on a Lesefni page (item 41), a node of
   the skill map (item 83) and the placement round of the first run (item 84).

   What a session IS is pure and lives in core/run.js; this file is the part
   that touches the screen and the other controllers. Its fields and methods
   are mixed into `app` (app.js), so `this` is the app and everything else in
   the program goes on calling `app.startRun(…)`, `app.run` and so on as
   before. */

import { todayKey, effectivePolicy } from "../core/state.js";
import { nextTask, makeView, withView, applyEffects, planOpening, nextOpening,
  scheduleReask, nextReask, typeById, enabled, TASKS } from "../tasks/index.js";
import { planToday } from "../core/today.js";
import { narrowPolicy } from "../core/policy.js";
import { visitLevels } from "../core/difficulty.js";
import { maxOf } from "../core/mix.js";
import { activePatterns, huntPreferFor, focusTypes, pickTargeted } from "../core/diagnosis.js";
import { SKILL_IDS } from "../core/skills.js";
import { scopeOf } from "../core/assignment.js";
import { lessonById, lessonPractice, practiceSkills, PRACTICE_SIZE } from "../core/lessons.js";
import { nodeSession } from "../core/skillmap.js";
import { nodeById } from "../core/curriculum.js";
import { badgeWindows } from "../core/rarity.js";
import * as RUN from "../core/run.js";
import { $, queueBadges } from "../ui/dom.js";
import { renderTask } from "../ui/render.js";
import { renderDrillBar } from "../ui/drill.js";
import { armNext } from "../ui/verdict.js";
import { renderPicker, renderRunBar, renderSummary, confirmQuit, usable,
  MINE, MIXED, ASSIGNED } from "../ui/session.js";
import { rng } from "./rng.js";

export function sessionControl() {
  return {
    /* ---- practice sessions (v6.10, ui/session.js) ----
       `run` is the session in progress: its topic (a skill, "blandad" or
       "villur"), its size, how far it has got, and what the error diagnosis
       found on the way. `runDone` is the summary of the one just finished,
       shown until the child picks something else. Neither is saved; a finished
       session is written into `S.runs`. */
    run: null,
    runDone: null,
    runNotice: null,

    /* ---- assignments (item 65, core/assignment.js) ----
       `assignments` is the server's last answer to GET /assignments: the open
       homework of this pupil's group, each with the pupil's own result. Only on
       a server — a pupil with no server has no teacher. `assignmentPending` is
       a result that could not be sent, retried on the next load. */
    assignments: [],
    assignmentPending: null,

    /** Fetch the open assignments; redraw the picker if it is on the screen. */
    async loadAssignments() {
      if (!this.server) return;
      if (this.assignmentPending) await this.sendAssignment(this.assignmentPending);
      let list;
      try { list = (await this.server.assignments()).assignments || []; }
      catch { return; }
      const changed = JSON.stringify(list) !== JSON.stringify(this.assignments);
      this.assignments = list;
      /* The picker is on the board when nothing else is; drawn again only if
         something changed, so a look every five minutes moves nothing. */
      if (changed && !this.run && !this.drill && !this.duelRun && !this.liveRun && !this.runDone && !this.cur) renderPicker(this);
    },

    /** One tap on an assignment: a session of its size, narrowed to its material. */
    startAssignment(id) {
      const a = (this.assignments || []).find((x) => x.id === id);
      const scope = a && scopeOf(a.target);
      if (!scope) return;
      /* No opening reviews: the teacher's questions are all about the material. */
      this.startRun(ASSIGNED.id, a.n, scope.focus, { review: false, assignment: { id: a.id, target: a.target, scope } });
    },

    /** Send a finished (or abandoned) assignment's numbers; kept and retried if
        the network fails. A refusal (deadline passed) is not retried.
        @returns "ok", "retry" or "refused" — the summary says which. */
    async sendAssignment(p) {
      try {
        const r = await this.server.assignmentResult(p.id, { i: p.i, j: p.j, c: p.c });
        this.assignmentPending = null;
        const k = (this.assignments || []).findIndex((x) => x.id === p.id);
        if (k >= 0 && r && r.assignment) this.assignments[k] = r.assignment;
        return "ok";
      } catch (err) {
        const refused = !!(err && err.status && err.status < 500);
        this.assignmentPending = refused ? null : p;
        return refused ? "refused" : "retry";
      }
    },

    /**
     * Today's session, planned (core/today.js): the due reviews, the active
     * error patterns, then new material, about 3 / 4 / 3 of ten — under the
     * whole curriculum policy, with the registry saying which question types
     * may be asked.
     */
    todayPlan(n = 10) {
      const P = effectivePolicy(this.S);
      return planToday(this.S, P, todayKey(), {
        n, canType: (id) => { const t = typeById(id); return !!t && enabled(P, t); },
      });
    },

    /**
     * Begin a session. `focus`: pattern ids, for a session aimed at them.
     * `opts.review: false` starts it without the reviews a session otherwise
     * opens with (core/review.js) — for a caller whose few questions are all
     * spoken for. `opts.types` (with `opts.skills`, `opts.attrs`) narrows the
     * session to exactly those question types, and `opts.label` names it in
     * the bar — "Æfa þetta" on a Lesefni page (item 41, `practiceLesson`).
     * `opts.review` may also be a list of review keys: the session opens with
     * exactly those (a node of the skill map opens with its own, item 83).
     * The record itself is core/run.js `newRun`.
     */
    startRun(topic, n, focus = null, opts = {}) {
      if (this.duelRun || this.liveRun) { this.openView("practice"); return; }
      this.drill = null; this.drillOffer = null; this.drillDone = null;
      this.forcedNoun = null;
      this.runDone = null;
      /* A tab left open overnight: today is a new visit, and each skill starts
         half a step below where it was left (core/difficulty.js). */
      if (this.sess && this.sess.visitDay !== todayKey())
        Object.assign(this.sess, visitLevels(this.S, todayKey()));
      this.streak = null; this.streakOffer = null;
      /* Today's session (item 21) is planned slot by slot: its reviews are the
         opening, and `plan` is what each question after them is about. */
      const today = topic === RUN.TOPIC.TODAY ? this.todayPlan(n) : null;
      this.run = RUN.newRun(this.S, topic, n, focus, opts, today,
        (run) => planOpening(this.S, todayKey(), run.n, RUN.reviewPolicy(this.S, run), run.focus),
        Date.now());
      RUN.notePick(this.S, topic, this.run.n, opts);
      this.save();
      this.openView("practice");
      this.next();
    },

    /** The curriculum policy, narrowed to what this session is about
        (core/run.js `runPolicy`). */
    runPolicy() { return RUN.runPolicy(this.S, this.run); },

    /** The policy a review is asked under (core/run.js `reviewPolicy`). */
    reviewPolicy() { return RUN.reviewPolicy(this.S, this.run); },

    /** Item 42: the question ends after its second try, not in `finish`. */
    armNext() {
      const rearm = armNext(this);
      const r = this.run, b = $("check");
      if (r && r.i >= r.n && b) b.textContent = "Sjá samantekt →";
      return rearm;
    },

    /**
     * A wrong cloze: its noun comes back three to five questions on, not at
     * once (critique item 19). Called by the cloze's renderer, which says under
     * the verdict which of the two it will be. True if the session is long
     * enough; otherwise the review queue has it for tomorrow.
     */
    planReask(task) {
      if (!this.run || this.drill || this.duelRun || this.liveRun || !task || !task.inRun) return false;
      return scheduleReask(this.run, task, rng);
    },

    /**
     * The next question of a session. Questions that test one of the child's
     * error patterns are preferred: a few candidates are built and the first
     * that tests one is kept — most of the time in a session aimed at them,
     * now and then in any other.
     *
     * The builders are pure (tasks/view.js): building a candidate changes
     * nothing, and each comes with the effects of showing it. Only the one that
     * IS shown has its effects applied — so a vocabulary item is marked as asked
     * when the child meets it, not each time it was a candidate (until v6.13
     * every discarded candidate locked its item for a week).
     */
    pickTask() {
      const r = this.run;
      /* Item 84: the placement round asks what its staircase says (ui/tour.js). */
      if (r.placement) return this.tour.pick();
      this.policy = this.runPolicy();
      const ids = r.focus || activePatterns(this.S, 3).map((p) => p.id);
      /* v6.11: the mix rule (core/mix.js) sees what the session has had. */
      const counts = RUN.mixCounts(r);
      /* The same noun again after a wrong cloze — unless the session has had
         its share of clozes. */
      if (this.forcedNoun && (counts.fill || 0) + 1 > maxOf("fill", r.n)) this.forcedNoun = null;
      const view = makeView({
        S: this.S, sess: this.sess, policy: this.policy, forcedNoun: this.forcedNoun,
        mix: { n: r.n, counts }, inRun: true, huntPrefer: huntPreferFor(ids),
        cal: this.viewCal(),
      });
      const effects = new Map();
      const buildIn = (v) => () => {
        const b = nextTask(this.lex, v, rng);
        if (!b) return null;
        effects.set(b.task, b.effects);
        return b.task;
      };
      const build = buildIn(view);
      /* v6.13, the review queue. A session opens with up to three entries that
         are due; and the noun of a cloze missed earlier in the session comes
         back when its turn has come. Both are ordinary questions built by the
         ordinary builders (tasks/review.js) and are outside the mix rule: there
         are at most three of the first, and the second is held to the share of
         clozes a session may have. */
      const rv = withView(view, { policy: this.reviewPolicy(), mix: null });
      const due = nextOpening(this.lex, rv, rng, r)
        || nextReask(this.lex, rv, rng, r, (counts.fill || 0) + 1 <= maxOf("fill", r.n));
      if (due) {
        applyEffects(this, due.effects);
        if (r.plan) due.task.today = "review";
        return due.task;
      }
      /* Today's session (item 21): the next slot of the plan. A pattern slot
         is drawn from the pattern's own question types and must test it; a
         slot of new material comes from one of the least-practised skills and
         is not aimed at anything. Either falls back to the plain mix of what
         is switched on, so the session is always its ten questions long. A
         missed cloze's noun coming back (above) takes a turn without using a
         slot; the plan's last slot is then the one not reached. */
      if (r.plan && !this.forcedNoun) {
        const slot = r.plan.shift() || { kind: "new", skill: null };
        let t = null;
        if (slot.kind === "pattern") {
          const pv = withView(view, {
            policy: narrowPolicy(this.policy, { types: [...focusTypes([slot.p])] }),
            huntPrefer: huntPreferFor([slot.p]),
          });
          t = pickTargeted(buildIn(pv), [slot.p], { p: 1, tries: 8, rnd: rng });
          if (t && !t.targeted) t = null;
        } else if (slot.skill) {
          t = buildIn(withView(view, { policy: narrowPolicy(this.policy, { skills: [slot.skill] }) }))();
        }
        t ||= build();
        if (t) { applyEffects(this, effects.get(t)); t.today = t.targeted && slot.kind === "pattern" ? "pattern" : "new"; }
        return t;
      }
      const t = this.forcedNoun ? build()
        : pickTargeted(build, ids, { p: r.focus ? 0.85 : 0.4, tries: r.focus ? 8 : 5, rnd: rng });
      if (t) applyEffects(this, effects.get(t));
      return t;
    },

    /**
     * The last part of `next` (app.js), when no live round, duel, drill or
     * "Þrjár í röð" has taken the board: the session's next question, or —
     * with none running — the summary of the last one, or the picker.
     */
    runNext() {
      renderDrillBar(this);
      renderRunBar(this);
      /* v6.10: practice comes in sessions. With none running, the board shows
         the summary of the last one, or the picker. */
      if (this.run) {
        if (this.run.i >= this.run.n) { this.endRun(); return; }
        const t = this.pickTask();
        if (!t) { this.endRun(false, true); return; }
        t.inRun = true;
        this.cur = t;
        renderTask(this);
        renderRunBar(this);
        this.clock.mark();
        return;
      }
      this.policy = null;
      this.cur = null;
      if (this.runDone) renderSummary(this);
      else renderPicker(this);
    },

    /**
     * Part of `finish` (app.js): a question of the session has ended. It is
     * counted once (core/run.js `countAnswer`), the bar moves, and the last
     * one turns Áfram into the way to the summary.
     * @returns {boolean} was it a question of the session, counted now
     */
    runAnswered(correct, findings, chances) {
      const r = this.run;
      if (!RUN.countAnswer(r, this.cur, correct, chances, findings)) return false;
      /* Item 84: one step of the placement staircase (ui/tour.js). */
      if (r.placement) this.tour.answered(correct ?? null);
      renderRunBar(this);
      if (r.i >= r.n) {
        const b = $("check");
        if (b) queueMicrotask(() => { if (b.textContent.startsWith("Áfram")) b.textContent = "Sjá samantekt →"; });
      }
      return true;
    },

    /** A session is over: write it down and show the summary. */
    endRun(early = false, empty = false) {
      const r = this.run;
      this.run = null;
      this.policy = null;
      this.streak = null; this.streakOffer = null;
      if (!r) return;
      this.flushAnswers();
      /* Item 84: the placement round has no summary of the usual kind — the
         first run says what it found and goes on (ui/tour.js). */
      if (r.placement) { this.tour.placementOver(r); return; }
      if (!r.i) {
        this.runDone = null;
        if (empty) this.runNotice = "Engin spurning fannst í þessu efni með þeim stillingum sem eru á. " +
          "Kveiktu á fleiri tegundum spurninga eða þyngdarstigum undir Stillingar og námsefni.";
        this.next();
        return;
      }
      const report = RUN.reportOf(r, this.S, TASKS);
      const xp = RUN.writeRun(this.S, r, report, todayKey(), Date.now());
      this.save();
      /* item 65: the teacher gets the numbers — answered, graded, right — and
         nothing else. Sent whether or not the pupil finished: how far they
         got is worth knowing too (core/assignment.js `better`). */
      const sending = r.assignment && this.server
        ? this.sendAssignment({ id: r.assignment.id, i: r.i, j: r.j, c: r.c }) : null;
      this.runDone = RUN.summaryOf(r, report, xp, early || empty, Date.now());
      const done = this.runDone;
      /* The summary says whether the teacher has the result; drawn again when
         the server has answered, if it is still on the board. */
      if (sending) sending.then((sent) => {
        done.assignment.sent = sent;
        if (this.runDone === done && !this.run && !this.cur) renderSummary(this);
      });
      this.next();
      /* Item 61: the one celebration of the session. The summary is on the
         screen and lists every badge the session won; the windows come now, over
         it, within the usual ceiling (`badgeWindows`: the rare ones all, then two
         more) and the rest are named on the last. Badges still held from a
         rescue drill outside any session go with them, once. */
      const held = this.sess.heldBadges || [];
      this.sess.heldBadges = [];
      const all = [...r.badges, ...held.filter((h) => !r.badges.some((b) => b.id === h.id))];
      if (all.length) {
        const { show, quiet } = badgeWindows(all, this.badgeStats);
        queueBadges(show, () => {
          document.querySelector("#task .summary .nextrow button")?.focus();
        }, quiet);
      }
    },

    quitRun() {
      if (!this.run) return;
      if (this.run.placement) { this.tour.quitPlacement(); return; }
      confirmQuit(this, () => { if (this.run) this.endRun(true); });
    },

    /**
     * "Æfa þetta" on a Lesefni page (item 41): five questions on exactly the
     * question types of that page's curriculum nodes (core/lessons.js
     * lessonPractice), without the reviews a session opens with — all five
     * are the page's.
     */
    practiceLesson(id) {
      const p = lessonPractice(id);
      const page = lessonById(id);
      if (!p || !page) return;
      this.startRun(page.skill, PRACTICE_SIZE, null, {
        review: false, types: p.types, attrs: p.attrs, skills: practiceSkills(p, TASKS),
        label: "Lesefni: " + page.nm, lesson: id,
      });
    },

    /* ---- the skill map (item 83, core/skillmap.js, ui/skillmap.js) -------- */

    /** The policy a session on these types runs under (core/run.js). */
    typesPolicy(on) { return RUN.typesPolicy(this.S, on); },

    /** Can a session on this node ask anything at all? (core/run.js) */
    canPractiseNode(id) { return RUN.canPractiseNode(this.S, id, TASKS); },

    /**
     * The button of an opened node: ten questions on exactly its question
     * types (and, where the node is one feature of them, that feature),
     * opening with the node's own reviews that are due.
     */
    practiseNode(id) {
      const node = nodeById(id);
      const s = nodeSession(node, this.S);
      if (!s) return;
      this.startRun(SKILL_IDS.includes(node.cat) ? node.cat : MIXED.id, s.n, null, {
        review: s.review, types: s.types, attrs: s.attrs, skills: practiceSkills(s, TASKS),
        label: s.label, lesson: s.lesson,
      });
    },

    /** "Æfa" beside an error pattern that belongs to no node of the map. */
    patternUsable(id) { return usable(this, [id]); },
    practisePattern(id) { this.startRun(MINE.id, 10, [id]); },
  };
}
