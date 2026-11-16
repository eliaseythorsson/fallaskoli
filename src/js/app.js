/* Start-up and wiring. This is the only place that holds the state. */

import { DATA } from "../../data/data_bundle.js";
import { buildLexicon } from "./core/lexicon.js";
import { migrate, blankState, newSession, todayKey, badgeContext, settleDays,
  noteQuestion, noteLogin, effectivePolicy, chosenPolicy } from "./core/state.js";
import { applyDecay } from "./core/progress.js";
import { checkBadges, checkLogin, celebrate } from "./core/badges.js";
import { collectionSummary } from "./core/collection.js";
import { nextTask, buildTask, drillTask, makeView, withView, applyEffects, planOpening, nextOpening,
  scheduleReask, nextReask, streakTasks, typeById, enabled } from "./tasks/index.js";
import { reviewLine, queuePattern } from "./core/review.js";
import { planToday } from "./core/today.js";
import { STREAK_N, streakPattern, startStreak, stepStreak, streakEntry, streakLine } from "./core/streak.js";
import { statusOf, weakWords, drillable, startDrill, drillStep, settleDrill } from "./core/wordhealth.js";
import { grantXp, cleanWeekGoal } from "./core/state.js";
import { renderDrillBar } from "./ui/drill.js";
import { createStore } from "./storage/index.js";
import { createClock } from "./core/timing.js";
import { createDefinitions, bundledSource, remoteSource } from "./core/definitions.js";
import { serverMode, createServer, serverDriver, liftLocalState } from "./core/server.js";
import { CAL, eventOf, cleanTable, tableIsEmpty, lexHardness } from "./core/calibration.js";
import { SAMPLE, samplesOf } from "./core/classifiercheck.js";
import { $, esc, wireGlossary, queueBadges, hideTip, freshEnter, wirePrivacyLinks, openSheet,
  setKeypadPref, keypadOn, keypadEnv, wireKeys, applyComfort } from "./ui/dom.js";
import { measurable, badgeWindows, windowsFor } from "./core/rarity.js";
import { socialContext } from "./core/social.js";
import { DEFAULT_METRIC } from "./core/leaderboard.js";
import { renderTask, revealTopic } from "./ui/render.js";
import "./ui/render-more.js";
import { wireReports, captureCard, renderReportsPanel } from "./ui/reports.js";
import { renderHeader, renderStats } from "./ui/progress.js";
import { renderBadges, renderClass, renderSettings, renderData } from "./ui/panels.js";
import { renderLogin, renderAdmin, renderAccount, renderShareCard } from "./ui/account.js";
import { renderTeacher } from "./ui/teacher.js";
import { renderSkillMap } from "./ui/skillmap.js";
import { nodeSession } from "./core/skillmap.js";
import { nodeById } from "./core/curriculum.js";
import { mergeStates } from "./core/merge.js";
import { renderLessons, suggestLesson, wireLessons } from "./ui/lessons.js";
import { renderDuelBar, renderDuelRoom } from "./ui/duel.js";
import { duelTasks, signature, settleDuels, duelTotals, dataPrint } from "./core/duel.js";
import { createPolicy, narrowPolicy, openFor } from "./core/policy.js";
import { levelRanges, applyRanges, visitLevels } from "./core/difficulty.js";
import { maxOf } from "./core/mix.js";
import { TASKS } from "./tasks/index.js";
const typesOfSkill = (id) => new Set(TASKS.filter((t) => t.skill === id || (t.anyOf || []).includes(id)).map((t) => t.id));
import { diagnose, noteDiagnosis, activePatterns, huntPreferFor, focusTypes, pickTargeted,
  patternById, runReport } from "./core/diagnosis.js";
import { noteMending } from "./core/mending.js";
import { SKILL_IDS } from "./core/skills.js";
import { renderPicker, renderRunBar, renderSummary, confirmQuit,
  topics, usable, MINE, MIXED, TODAY, ASSIGNED, syncSessionLayout, showStreakOffer, renderStreakIntro } from "./ui/session.js";
import { scopeOf, assignmentPolicy } from "./core/assignment.js";
import { LESSONS, readCount, lessonById, lessonPractice, practiceSkills, PRACTICE_SIZE } from "./core/lessons.js";

/* The random source of the question builders (tasks/view.js). They never call
   Math.random themselves: it is handed to them, here for practice and seeded
   for a duel (core/duel.js). Looked up at each call, not captured, so that the
   browser test's fixed seed — which replaces Math.random — still takes. */
const rng = () => Math.random();
/* A calibration table that changes nothing (see `app.viewCal`). */
const EMPTY_TABLE = Object.freeze({ v: CAL.v, types: {}, cells: {}, irr: {} });

let store = createStore();
/* Browser storage itself, kept separately so that older progress can be lifted
   onto the server after `store` has been repointed there. */
const localStore = store;

const clock = createClock();

const app = {
  lex: buildLexicon(DATA),
  clock,
  defs: null,
  server: null,
  profile: null,
  rights: null,
  roster: [],
  board: [],
  /* Item 58: the class board opens on "Framfarir" (core/leaderboard.js). */
  boardMetric: DEFAULT_METRIC,
  social: null,
  /* GET /classgoal (item 59): the group's weekly goal, totals only. */
  classGoal: null,
  badgeStats: null,

  /** The leaderboard, by whichever metric is currently chosen. */
  async loadBoard() {
    if (!this.server) return;
    this.board = await this.server.leaderboard(this.boardMetric).catch(() => []);
  },
  S: blankState(),
  sess: null,
  cur: null,
  forcedNoun: null,

  /* ---- the rescue drill (v6.6, core/wordhealth.js) ----
     `drill` is the drill in progress, `drillOffer` a word offered for one,
     `drillDone` the result of the last one, shown until it is closed. None of
     it is saved: a drill abandoned by closing the tab is simply not counted. */
  drill: null,
  drillOffer: null,
  drillDone: null,
  drillOffered: new Set(),

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
    this.duelInfo = info;
    this.duelList = info.duels || [];
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
    try { r = await this.server.duelStart(id); }
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
      const r = await this.server.duelResult(p.view.id, p.answers, p.sig);
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

  /* ---- practice sessions (v6.10, ui/session.js) ----
     `run` is the session in progress: its topic (a skill, "blandad" or
     "villur"), its size, how far it has got, and what the error diagnosis
     found on the way. `runDone` is the summary of the one just finished,
     shown until the child picks something else. Neither is saved; a finished
     session is written into `S.runs`. */
  run: null,
  runDone: null,
  runNotice: null,

  /* ---- "Þrjár í röð" (item 36, core/streak.js) ----
     `streakOffer` is the offer under the verdict just shown, with its three
     questions already built (it is only made when all three can be);
     `streak` the three in progress. Neither is saved: what is answered is in
     the state like any answer, and the pattern goes into the review queue
     when the three end. */
  streak: null,
  streakOffer: null,

  /* ---- assignments (item 65, core/assignment.js) ----
     `assignments` is the server's last answer to GET /assignments: the open
     homework of this pupil's group, each with the pupil's own result. Only on
     a server — a pupil with no server has no teacher. `assignmentPending` is
     a result that could not be sent, retried on the next load. */
  assignments: [],
  assignmentPending: null,

  /* ---- calibration (item 17, core/calibration.js) ----
     `cal` is the table the server published, cleaned — or null: no server,
     no table yet, the switch is off, or the answer was not a table. With
     null everything runs on the values the program was built with.
     `calInfo` is the server's whole answer: whether this account's answers
     are counted (`collect`) and whether its group's teacher has switched on
     the sample of wrong answers (`samples`). The two queues hold what has
     not been sent yet; nothing in them is saved, and what cannot be sent is
     dropped — a lost count costs nothing. */
  cal: null,
  calInfo: null,
  calQueue: [],
  calSamples: [],

  /** The table a view of ordinary practice carries (tasks/view.js `cal`):
      the published one, or an empty one when there is none but this
      account's answers are counted, so that its questions are still marked. */
  viewCal() {
    return this.cal || (this.calInfo && this.calInfo.collect ? EMPTY_TABLE : null);
  },

  /** One judged answer, offered to the count. Only a fresh question of
      ordinary practice carries `calBand` (tasks/next.js), and only once. */
  noteAnswer(task, j) {
    const info = this.calInfo;
    if (!this.server || !info || !info.collect || !task || task.calCounted) return;
    const e = eventOf(task, j, this.lex);
    if (!e) return;
    task.calCounted = true;
    this.calQueue.push(e);
    if (info.samples) {
      const room = SAMPLE.perPost - this.calSamples.length;
      if (room > 0) this.calSamples.push(...samplesOf(task, j, this.lex).slice(0, room));
    }
    if (this.calQueue.length >= 8) this.flushAnswers();
  },

  /** Send what has been collected. Best effort: a failure is not retried. */
  flushAnswers() {
    if (!this.server || !this.calQueue.length) return;
    const events = this.calQueue.splice(0, CAL.perPost);
    const samples = this.calSamples.splice(0, SAMPLE.perPost);
    this.server.sendAnswers({ events, ...(samples.length ? { samples } : {}) })
      .then((r) => { if (r && r.collect === false && this.calInfo) this.calInfo.collect = false; })
      .catch((err) => {
        /* Refused (today's allowance is used up, or the account is no
           longer counted): nothing more is sent this visit. */
        if (err && err.status && err.status < 500 && this.calInfo) this.calInfo.collect = false;
      });
  },

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
    if (changed && !this.run && !this.drill && !this.duelRun && !this.runDone && !this.cur) renderPicker(this);
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
   */
  startRun(topic, n, focus = null, opts = {}) {
    if (this.duelRun) { this.openView("practice"); return; }
    this.drill = null; this.drillOffer = null; this.drillDone = null;
    this.forcedNoun = null;
    this.runDone = null;
    /* A tab left open overnight: today is a new visit, and each skill starts
       half a step below where it was left (core/difficulty.js). */
    if (this.sess && this.sess.visitDay !== todayKey())
      Object.assign(this.sess, visitLevels(this.S, todayKey()));
    if (topic === MINE.id && !(focus && focus.length))
      focus = activePatterns(this.S, 3).map((p) => p.id);
    this.streak = null; this.streakOffer = null;
    /* Today's session (item 21) is planned slot by slot: its reviews are the
       opening, and `plan` is what each question after them is about. */
    const today = topic === TODAY.id ? this.todayPlan(n) : null;
    if (today) { n = today.n; focus = null; }
    this.run = {
      topic, n, focus: focus && focus.length ? focus : null,
      /* item 65: the assignment this session answers, with its scope. */
      assignment: opts.assignment || null,
      i: 0, c: 0, j: 0, xp0: this.S.xp, badges: [], items: [],
      chances: {}, misses: {}, found: [],
      before: activePatterns(this.S, 6).map((p) => p.id),
      startedAt: Date.now(),
      /* The review queue (core/review.js, tasks/review.js): `review` is the
         keys of the due entries this session opens with, `reask` the nouns of
         missed clozes waiting for their turn three to five questions on. */
      review: [], reask: [],
      /* item 21: the slots after the opening ({kind: "pattern", p} or
         {kind: "new", skill}), taken one per question; null outside today's
         session. item 36: the patterns offered "Þrjár í röð" in this session
         (once each), and how each run of three went. */
      plan: today ? today.slots.filter((x) => x.kind !== "review") : null,
      streaked: [], streaks: [],
      /* Item 41: a session on given question types, and its name. */
      types: opts.types || null, skills: opts.skills || null, attrs: opts.attrs || null,
      label: opts.label || null, lesson: opts.lesson || null,
    };
    if (today) this.run.review = today.reviews.slice();
    else if (Array.isArray(opts.review)) this.run.review = opts.review.slice();
    else if (opts.review !== false)
      this.run.review = planOpening(this.S, todayKey(), n, this.reviewPolicy(), this.run.focus);
    /* The picker remembers the CATEGORY last chosen there, and its size;
       neither today's session, an assignment, "Villurnar mínar" nor a
       Lesefni page's five (item 41, `opts.types`) is one. */
    const picked = !opts.types && topic !== TODAY.id && topic !== ASSIGNED.id;
    if (picked && topic !== MINE.id) this.S.settings.runTopic = topic;
    if (picked) this.S.settings.runSize = n;
    this.save();
    this.openView("practice");
    this.next();
  },

  /** The curriculum policy, narrowed to what this session is about. */
  runPolicy() {
    const r = this.run;
    /* item 65: an assignment's material, whatever the pupil has switched off
       (the teacher chose it), within the ceiling (core/assignment.js). */
    if (r && r.assignment) return narrowPolicy(assignmentPolicy(this.S, r.assignment.target),
      { types: r.focus ? [...focusTypes(r.focus)] : null });
    const P = effectivePolicy(this.S);
    if (!r) return P;
    /* Item 41: asked for by name, so the child's own switches give way for
       these types (core/policy.js openFor); the administrator's do not. */
    if (r.types) {
      const open = createPolicy(this.S.allowed || null,
        openFor(chosenPolicy(this.S), { skills: r.skills || [], types: r.types }));
      return narrowPolicy(open, { skills: r.skills, types: r.types, attrs: r.attrs });
    }
    return narrowPolicy(P, {
      skills: SKILL_IDS.includes(r.topic) ? [r.topic] : null,
      types: r.focus ? [...focusTypes(r.focus)] : null,
    });
  },

  /**
   * The policy a review is asked under: the session's topic, but not the
   * narrowing to the question types of the patterns it is aimed at — a review
   * is asked in the type it was missed in.
   */
  reviewPolicy() {
    const r = this.run;
    return narrowPolicy(effectivePolicy(this.S), {
      skills: r && SKILL_IDS.includes(r.topic) ? [r.topic] : null, types: null,
    });
  },

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
    if (!this.run || this.drill || this.duelRun || !task || !task.inRun) return false;
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
    this.policy = this.runPolicy();
    const ids = r.focus || activePatterns(this.S, 3).map((p) => p.id);
    /* v6.11: the mix rule (core/mix.js) sees what the session has had. */
    const counts = {};
    r.items.forEach((it) => { counts[it.type] = (counts[it.type] || 0) + 1; });
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

  /** A session is over: write it down and show the summary. */
  endRun(early = false, empty = false) {
    const r = this.run;
    this.run = null;
    this.policy = null;
    this.streak = null; this.streakOffer = null;
    if (!r) return;
    this.flushAnswers();
    if (!r.i) {
      this.runDone = null;
      if (empty) this.runNotice = "Engin spurning fannst í þessu efni með þeim stillingum sem eru á. " +
        "Kveiktu á fleiri tegundum spurninga eða þyngdarstigum undir Stillingar og námsefni.";
      this.next();
      return;
    }
    /* Which question types this session could ask: a pattern none of them
       tests is not "the one thing to remember" (v6.11). */
    const topicTypes = r.assignment
      ? (r.assignment.scope.types ? new Set(r.assignment.scope.types)
        : r.assignment.scope.skills ? new Set(r.assignment.scope.skills.flatMap((x) => [...typesOfSkill(x)])) : null)
      : r.types ? new Set(r.types)
      : SKILL_IDS.includes(r.topic) ? typesOfSkill(r.topic) : null;
    const report = runReport(r, this.S, topicTypes ? (p) => p.types.some((x) => topicTypes.has(x)) : null);
    const xp = Math.max(0, this.S.xp - r.xp0);
    (this.S.runs ||= []).push({
      at: Date.now(), d: todayKey(), topic: r.topic, n: r.i, c: r.c, j: r.j, xp,
      top: report.found.slice(0, 3).map((f) => f.id),
    });
    this.S.runs = this.S.runs.slice(-40);
    this.save();
    /* item 65: the teacher gets the numbers — answered, graded, right — and
       nothing else. Sent whether or not the pupil finished: how far they
       got is worth knowing too (core/assignment.js `better`). */
    const sending = r.assignment && this.server
      ? this.sendAssignment({ id: r.assignment.id, i: r.i, j: r.j, c: r.c }) : null;
    this.runDone = {
      assignment: r.assignment ? { id: r.assignment.id, target: r.assignment.target, sent: null } : null,
      topic: r.topic, n: r.n, i: r.i, c: r.c, j: r.j, xp, focus: r.focus,
      badges: r.badges, items: r.items, report, early: early || empty,
      ms: Date.now() - r.startedAt, streaks: r.streaks || [],
      /* Item 41: "Önnur lota" repeats a page's session as it was. */
      label: r.label, again: r.types
        ? { review: false, types: r.types, skills: r.skills, attrs: r.attrs, label: r.label, lesson: r.lesson }
        : null,
    };
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
    confirmQuit(this, () => { if (this.run) this.endRun(true); });
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
    if (!r || !from || this.streak || this.drill || this.duelRun) return;
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

  /** The policy a session on these types runs under — the pupil's own
      switches give way, the administrator's ceiling does not (`runPolicy`). */
  typesPolicy({ skills, types, attrs }) {
    const open = createPolicy(this.S.allowed || null,
      openFor(chosenPolicy(this.S), { skills: skills || [], types }));
    return narrowPolicy(open, { skills, types, attrs });
  },

  /** Can a session on this node ask anything at all? No for a locked node,
      and for one the administrator's ceiling leaves nothing of. */
  canPractiseNode(id) {
    const s = nodeSession(nodeById(id), this.S);
    if (!s) return false;
    const skills = practiceSkills(s, TASKS);
    const P = this.typesPolicy({ skills, types: s.types, attrs: s.attrs });
    return TASKS.some((t) => s.types.includes(t.id) && P.type(t.id) &&
        (t.anyOf ? t.anyOf.some((x) => P.skill(x)) : P.skill(t.skill))) &&
      Object.entries(s.attrs || {}).every(([g, keys]) => keys.some((k) => P.attr(g, k)));
  },

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

  /** A Lesefni page was opened for the first time (ui/lessons.js). */
  onRead() {
    if (!this.sess) return;
    const won = checkBadges(
      { ...badgeContext(this.S, this.sess), when: "read",
        read: readCount(this.S), readTotal: LESSONS.length },
      this.S.badges, this.sess.badgeAwards, undefined, (this.S.periods ||= {}));
    won.forEach((b) => this.awardBadge(b, todayKey()));
    this.save();
    if (!won.length) return;
    this.refresh();
    const { show, quiet } = windowsFor(won, this.badgeStats, { inSession: !!this.run });
    if (show.length) queueBadges(show, () => {}, quiet);
  },

  /** Begin a rescue drill on one word, from the offer or from the collection. */
  startDrill(key) {
    if (this.duelRun) return;
    const [lemma, cls] = String(key).split("|");
    const entry = this.lex.lookup(lemma, cls);
    if (!entry) return;
    this.drill = { ...startDrill(key, this.S.words[key]), entry, turn: 0 };
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
    if (this.duelRun || this.run) return;
    if (this.drill || this.drillOffer || this.drillOffered.size >= 3) return;
    const fresh = (k) => !this.drillOffered.has(k);
    /* The word just answered, if it is in trouble … */
    const cur = this.cur && this.cur.word;
    let pick = null;
    if (cur && fresh(cur) && statusOf(this.S.words[cur]) === "weak") {
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

  save(immediate = false) {
    return store.save(this.profile ? this.profile.id : this.S.profile.id, this.S, { immediate });
  },

  refresh() { renderHeader(this); },

  /**
   * Forget the cached curriculum policy. It is worked out once and kept here
   * for the views the builders are given (`pickTask`, the drill in `next`);
   * whoever changes a switch says so, or the change would not show until the
   * page is reloaded.
   */
  reloadPolicy() { this.policy = null; },

  /**
   * Where each skill's saved level may go (core/difficulty.js levelRanges).
   * From the whole policy, not the session's narrowed one: a session aimed at
   * one error pattern must not cap a skill at what its few types know. Every
   * question passes through `next`, so the ranges follow a changed switch.
   */
  refreshRanges() {
    if (this.sess) applyRanges(this.sess, levelRanges(effectivePolicy(this.S), TASKS, this.lex.sentences));
  },

  /** Draw the next question. Never leaves the child with a blank screen. */
  next() {
    hideTip();
    this.refreshRanges();
    /* Kept for the 🚩 report: a child often notices a mistake only after
       pressing Áfram (ui/reports.js). */
    if (this.cur) this.prevTask = { task: this.cur, card: captureCard() };
    if (this.duelRun) {
      const run = this.duelRun;
      if (run.i < run.tasks.length) {
        this.cur = run.tasks[run.i];
        renderDuelBar(this);
        renderRunBar(this);
        renderTask(this);
        clock.mark();
        return;
      }
      this.endDuel();
    }
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
        clock.mark();
        return;
      }
      /* Nothing can be asked about this word with what is switched on. The
         drill ends without counting for or against anybody. */
      this.drill = null;
    }
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
        return;
      }
      const b = !st.done && st.queue.shift();
      if (b) {
        applyEffects(this, b.effects);
        this.cur = b.task;
        renderDrillBar(this);
        renderTask(this);
        renderRunBar(this);
        clock.mark();
        return;
      }
      st.done = false;
      this.endStreak();
      this.streak = null;
    } else this.streak = null;
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
      clock.mark();
      return;
    }
    this.policy = null;
    this.cur = null;
    if (this.runDone) renderSummary(this);
    else renderPicker(this);
  },

  /**
   * Did the answer land on a word no other qualified user has met? Only the
   * server knows, and only once rarity is measurable; otherwise `false` and
   * the badge never fires.
   */
  foundRareWord() {
    const stats = this.badgeStats;
    const word = this.cur && this.cur.word;
    if (!word || !measurable(stats)) return false;
    return ((stats.words || {})[word] ?? 0) === 0;
  },

  /** Write one badge into the state, dated. */
  awardBadge(b, date) {
    if (this.run && !this.run.badges.some((x) => x.id === b.id)) this.run.badges.push(b);
    const rec = this.S.badges[b.id];
    const dates = [...(rec?.dates || []), date].slice(-80);
    this.S.badges[b.id] = {
      n: (rec?.n || 0) + 1,
      dates,
      first: rec?.first || date,   // the first time is always kept
      last: date,
    };
  },

  /**
   * Every submit handler ends here: badges, save, and arm Enter.
   * `extra.correct` is the verdict for the QUESTION as a whole — true, false,
   * or null for a question with no right answer. This is the one place that
   * knows a question has ended, so the consecutive-miss counter lives here
   * (`record()` runs once per table cell).
   */
  finish(extra = {}) {
    /* v6.10: what went wrong, and which of the child's error patterns it
       belongs to (core/diagnosis.js). v6.13: the judge has already made the
       findings (core/answer.js) and they arrive here; a caller that still
       hands over the raw `resp` gets it diagnosed as before. Neither goes
       further than here — the badge context below is built from `extra`. */
    const { resp, findings: judged, review, ...rest } = extra;
    extra = rest;
    const findings = judged || diagnose(this.cur, resp);
    const chances = noteDiagnosis(this.S, this.cur, findings, extra.correct ?? null, todayKey());
    /* Items 56 and 58: an active pattern now right ten times in a row, on a
       later day than it went wrong, is mended (core/mending.js) — before the
       badge context below is built, so the badge comes with this answer. */
    const mendedNow = noteMending(this.S, chances, todayKey());
    showFindings(findings, extra.correct);
    showReview(review);
    showMended(mendedNow);
    const r = this.run;
    const runQuestion = !!(r && this.cur && this.cur.inRun && !this.cur.closed);
    if (r && this.cur && this.cur.inRun && !this.cur.closed) {
      this.cur.closed = true;
      r.i++;
      if (extra.correct === true) { r.c++; r.j++; }
      else if (extra.correct === false) r.j++;
      chances.forEach((id) => { r.chances[id] = (r.chances[id] || 0) + 1; });
      findings.forEach((f) => {
        r.misses[f.p] = (r.misses[f.p] || 0) + 1;
        r.found.push({ p: f.p, ex: f.ex || null });
      });
      r.items.push({ type: this.cur.typeId || this.cur.type, skill: this.cur.skill, ok: extra.correct ?? null });
      renderRunBar(this);
      if (r.i >= r.n) {
        const b = $("check");
        if (b) queueMicrotask(() => { if (b.textContent.startsWith("Áfram")) b.textContent = "Sjá samantekt →"; });
      }
    }
    /* Item 36: one of "Þrjár í röð" answered — or a diagnosed miss in the
       session, which may offer them. */
    const st = this.streak;
    if (st && this.cur && this.cur.streak && !this.cur.closed &&
        (extra.correct === true || extra.correct === false)) {
      this.cur.closed = true;
      stepStreak(st, extra.correct);
      renderRunBar(this);
      if (st.done) {
        this.endStreak();
        showStreakEnd(streakLine(st), r && r.i >= r.n);
      }
    } else if (runQuestion && extra.correct === false) this.offerStreak(findings);
    const comeback = noteQuestion(this.sess, extra.correct ?? null);
    const accidents = noteAccidents(this.S, this.sess, this.cur, extra);

    /* A duel: one question further; the last one sends the score. */
    if (this.duelRun && this.cur && this.cur.duel &&
        (extra.correct === true || extra.correct === false)) {
      const run = this.duelRun;
      run.marks[run.i] = extra.correct ? 1 : 0;
      if (extra.correct) run.c++;
      run.i++;
      renderDuelBar(this);
      if (run.i >= run.tasks.length) this.endDuel();
    }

    /* The rescue drill: one question further, and settled when it is over.
       A question with no right answer (`correct: null`) does not count. */
    let drill = null;
    if (this.drill && this.cur && this.cur.drill &&
        (extra.correct === true || extra.correct === false)) {
      drillStep(this.drill, extra.correct);
      if (this.drill.done) {
        drill = settleDrill(this.S, this.drill, this.S.words[this.drill.key], todayKey());
        grantXp(this.S, drill.xp);
        this.drillDone = { ...drill, lemma: this.drill.entry.o };
        this.drill = null;
      }
    }
    if (!this.drill && !drill) this.considerOffer();
    /* Lesefni (v6.7): a wrong answer points at the page that teaches it. */
    revealTopic(this);
    if (extra.correct === false) suggestLesson(this);
    const ctx = badgeContext(this.S, this.sess, {
      ...accidents,
      skill: this.cur ? this.cur.skill : null,
      collection: collectionSummary(this.S, this.lex),
      foundRareWord: this.foundRareWord(),
      ...extra,
      comeback,
      drill,
    });
    const won = checkBadges(ctx, this.S.badges, this.sess.badgeAwards,
      undefined, (this.S.periods ||= {}));
    const today = todayKey();
    won.forEach((b) => this.awardBadge(b, today));
    this.S.lastSessionSkills = (this.sess.skillsOk || []).length;
    this.save();
    this.refresh();
    renderDrillBar(this);
    /* Item 42: a wrong written answer may be tried once more (ui/render.js
       `offerRetry`); the box stays open and Áfram waits for the reveal. */
    const rearm = this.cur && this.cur.retrying ? () => {} : armNext(this);
    /* Every badge above is already in the cabinet, dated. What is bounded here
       is how many of them stop the child on the way to the next question —
       core/rarity.js `badgeWindows`, and the long note above it for why the
       award and the celebration are two different decisions. */
    /* v6.9: celebration follows success. A badge earned on a WRONG answer (a
       first word met, the time of day, a collection threshold crossed by the
       word just missed) is already in the cabinet above, but its window and
       its confetti wait for the next answer that is right. Two pop-ups on a
       child's first two answers, both wrong, read as a reward for missing. */
    /* Item 61: inside a session NO window opens between questions. Everything
       won is already in the cabinet and in `run.badges` (`awardBadge`); the
       summary lists it and celebrates it once (`endRun`). That covers "Þrjár í
       röð" and the worked example too, which are parts of a session. The
       v6.9 rule above still governs a rescue drill, which has no summary. */
    if (this.run) return;
    const c = celebrate(this.sess.heldBadges, won, extra.correct ?? null);
    this.sess.heldBadges = c.held;
    if (!c.show.length) return;
    const { show, quiet } = badgeWindows(c.show, this.badgeStats);
    /* The badges that did not get their own window are named on the last one
       that did, so nothing arrives in the cabinet unannounced. */
    if (show.length) queueBadges(show, rearm, quiet);
  },
};

/**
 * One line under a wrong answer naming the error pattern (v6.10), so the
 * child sees the diagnosis at the moment it is made, not only in the summary.
 */
function showFindings(findings, verdict) {
  const v = document.querySelector("#verdict .verdict");
  if (!v || !findings.length || v.querySelector(".diagline")) return;
  const real = findings.filter((f) => !f.soft);
  if (!real.length || verdict === true) return;
  const names = real.map((f) => (patternById(f.p) || {}).nm).filter(Boolean);
  v.insertAdjacentHTML("beforeend", `<p class="diagline">🔎 <b>Villugreining:</b> ${
    names.map(esc).join(" · ")}</p>`);
}

/**
 * One line under a right answer that was a review (core/review.js): when it
 * comes next, or that it is done with. `review` is what `noteReview` said
 * happened in the queue; nothing is shown unless an entry moved.
 */
/**
 * One line under the answer that mended an error pattern (items 56 and 58):
 * the pupil sees it the moment it happens, not only on the badge shelf.
 */
function showMended(ids) {
  const v = document.querySelector("#verdict .verdict");
  if (!v || !ids || !ids.length || v.querySelector(".mendline")) return;
  const names = ids.map((id) => (patternById(id) || {}).nm).filter(Boolean);
  if (!names.length) return;
  v.insertAdjacentHTML("beforeend", `<p class="streakline mendline">🩹 Þú hefur lagað þetta: <b>${
    names.map(esc).join(" · ")}</b> — tíu rétt svör í röð.</p>`);
}

function showReview(review) {
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
function showStreakEnd(line, last) {
  const v = document.querySelector("#verdict .verdict");
  if (v && line && !v.querySelector(".streakend"))
    v.insertAdjacentHTML("beforeend", `<p class="streakline streakend">💪 ${esc(line)}</p>`);
  const b = $("check");
  if (b) queueMicrotask(() => {
    if (b.textContent.startsWith("Áfram")) b.textContent = last ? "Sjá samantekt →" : "Aftur í lotuna →";
  });
}

/**
 * The accident badges (core/badges.js §14d), counted at the one place that
 * knows a question has ended.
 *
 *   slipRun    answers in a row accepted with a slip (`extra.slip`)
 *   wordCases  how many of the four cases one word has been answered in this
 *              session — a table hands over all four at once, so it is left out
 *   goldfish   the first miss on a word that had gone right five times
 */
function noteAccidents(S, sess, cur, extra) {
  if (extra.correct === true) sess.slipRun = extra.slip ? (sess.slipRun || 0) + 1 : 0;
  else if (extra.correct === false) sess.slipRun = 0;

  const word = cur && cur.word;
  const cs = /^(NF|ÞGF|ÞF|EF)/.exec(String((cur && cur.cell) || ""));
  if (extra.correct === true && word && cs && !("perfectTable" in extra)) {
    const map = (sess.wordCases ||= {});
    const set = (map[word] ||= []);
    if (!set.includes(cs[1])) set.push(cs[1]);
    sess.wordCasesBest = Math.max(sess.wordCasesBest || 0, set.length);
  }

  const rec = word ? S.words[word] : null;
  const goldfish = extra.correct === false && !!rec && (rec.c || 0) >= 5 &&
    (rec.w || 0) === 1;
  return { goldfish, pickChanges: (cur && cur.changes) || 0 };
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
function armNext(app) {
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

/* ---------- tabs --------------------------------------------------------
 *
 * Four of them, in the order a pupil needs them: the work, what the work has
 * earned, the other people in the room, and the switches. What used to be the
 * Gögn tab is a folded section at the bottom of the last one.
 *
 * A view is drawn when it is opened, not before: the charts and the badge
 * cabinet read the whole state and there is no reason to do that while the
 * child is answering questions.
 */

const VIEWS = ["practice", "lessons", "progress", "class", "settings"];

const DRAW = {
  lessons: (id) => renderLessons(app, id),
  progress: () => { renderBadges(app); renderStats(app); renderSkillMap(app); },
  class: () => {
    renderTeacher(app); renderShareCard(app); renderClass(app); renderDuelRoom(app);
    /* Fresh duel info also carries whether the account is held for review. */
    if (app.server && Date.now() - (app.duelLoadedAt || 0) > 15000) app.loadDuels();
  },
  settings: () => {
    renderSettings(app); renderAccount(app); renderAdmin(app);
    /* Without a server the error reports are kept in this browser and the adult
       reviews them here; on a server they are under Umsjón. */
    const rp = $("reports");
    if (rp) { if (app.server) rp.innerHTML = ""; else renderReportsPanel(app, rp); }
  },
};

function openView(view, arg) {
  if (!VIEWS.includes(view)) return;
  document.querySelectorAll("nav.tabs button")
    .forEach((x) => x.setAttribute("aria-selected", x.dataset.view === view));
  VIEWS.forEach((v) => { $("view-" + v).hidden = v !== view; });
  /* The slim session line replaces the header only on the board itself
     (ui/session.js); anywhere else mid-session the tabs are the way back. */
  syncSessionLayout(app);
  hideTip();
  if (DRAW[view]) DRAW[view](arg);
}

/** Whichever view is on the screen, drawn again — after the server answers. */
function redrawOpenView() {
  /* Not the settings: redrawing the switches under somebody's finger because
     the leaderboard arrived would be a strange thing to do to them. */
  const open = ["progress", "class"].find((v) => !$("view-" + v).hidden);
  if (open) DRAW[open]();
}

function wireTabs() {
  app.openView = openView;
  document.querySelectorAll("nav.tabs button").forEach((b) => {
    b.onclick = () => openView(b.dataset.view);
  });

  /* Merki / Framvinda / Orðasafn inside the second tab. All three are drawn
     when the tab opens; this only chooses which one is looked at. */
  const pick = $("panepick");
  pick.onclick = (e) => {
    const b = e.target.closest("button[data-pane]");
    if (!b) return;
    pick.querySelectorAll("button")
      .forEach((x) => x.setAttribute("aria-selected", x === b));
    ["badges", "stats", "words"].forEach((p) => { $("pane-" + p).hidden = p !== b.dataset.pane; });
    hideTip();
  };

  /* The data notes and the licences: filled the first time they are unfolded.
     Finding the homographs walks the whole vocabulary, which nobody should pay
     for on the way to the curriculum switches. */
  const about = $("about");
  about.addEventListener("toggle", () => {
    if (about.open && !about.dataset.drawn) { about.dataset.drawn = "1"; renderData(app); }
  });
}

function wireSettings() {
  $("goalsave").onclick = () => {
    const v = parseInt($("goalin").value, 10);
    if (v > 0 && v < 500) { app.S.goal = v; app.save(true); renderStats(app); app.refresh(); }
  };
  /* Item 57: the weekly goal, 2-7 days; the week streak is read from it at once. */
  $("weekin").onchange = (e) => {
    app.S.weekGoal = cleanWeekGoal(e.target.value);
    app.save(true); renderStats(app); app.refresh();
  };
  $("set-decay").onchange = (e) => { app.S.settings.decay = e.target.checked; app.save(true); };
  $("set-gloss").onchange = (e) => { app.S.settings.glossary = e.target.checked; app.save(true); };
  /* Item 53: the letter pad. Once switched either way it is the child's
     choice, kept with the settings; until then ui/dom.js guesses. Redrawn at
     once, so a pad under the open question comes or goes with the switch. */
  $("set-comfort").onchange = (e) => { app.S.settings.comfort = e.target.checked; app.save(true); applyComfort(app.S.settings); };
  $("set-keys").onchange = (e) => { app.S.settings.keypad = e.target.checked; app.save(true); wireKeys(); };

  /* No `confirm()`: a hosted page runs in a frame where dialogs are ignored.
     The button asks twice instead. */
  const resetBtn = $("reset");
  let armed = null;
  resetBtn.onclick = async () => {
    if (!armed) {
      resetBtn.textContent = "Ertu viss? Smelltu aftur til að núllstilla";
      armed = setTimeout(() => { armed = null; resetBtn.textContent = "Núllstilla allt"; }, 6000);
      return;
    }
    clearTimeout(armed); armed = null;
    resetBtn.textContent = "Núllstilla allt";
    app.S = blankState();
    app.drill = null; app.drillOffer = null; app.drillDone = null;
    app.run = null; app.runDone = null;
    app.reloadPolicy();
    app.sess = newSession(app.S);
    await app.save(true);
    renderStats(app); renderSettings(app); app.next();
  };

  /* Moving progress between devices. A hosted page may not start a download,
     so the progress is shown as text to copy and paste; the file input still
     works everywhere. */
  const box = $("transfer"), text = $("transfertext"), note = $("importnote");
  const importText = async (raw) => {
    try {
      app.S = migrate(store.importJSON(raw));
      app.run = null; app.runDone = null;
      app.reloadPolicy();
      app.next();
      app.sess = newSession(app.S);
      await app.save(true);
      renderStats(app); renderSettings(app); app.refresh();
      note.textContent = "Framvinda flutt inn.";
      box.hidden = true;
    } catch (err) {
      note.textContent = "Tókst ekki að lesa framvinduna: " + err.message;
    }
  };
  $("export").onclick = async () => {
    await app.save(true);
    text.value = store.exportJSON(app.S);
    box.hidden = false;
    text.focus(); text.select();
    note.textContent = "Afritaðu textann og límdu hann inn í hinu tækinu.";
  };
  $("importopen").onclick = () => {
    text.value = "";
    box.hidden = false;
    text.focus();
    note.textContent = "Límdu framvinduna í reitinn og smelltu á „Lesa inn“.";
  };
  $("transfercopy").onclick = () => {
    text.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (_) { ok = false; }
    note.textContent = ok
      ? "Afritað."
      : "Veldu textann og afritaðu hann með Ctrl+C / ⌘C.";
  };
  $("transferload").onclick = () => { if (text.value.trim()) importText(text.value); };
  $("transferclose").onclick = () => { box.hidden = true; };
  $("importfile").onchange = async (e) => {
    const file = e.target.files[0];
    if (file) importText(await file.text());
    e.target.value = "";
  };
}

/* ---------- start-up ---------------------------------------------------- */

function decayNotice(report) {
  if (!report) return;
  $("notice").innerHTML = `<div class="notice">
    Þú tókst þér ${report.idle} daga hlé — ${report.lost} XP hafa fjarað út.
    Þau koma fljótt til baka.</div>`;
  setTimeout(() => { $("notice").innerHTML = ""; }, 12000);
}

/* ---------- the server (optional) ---------------------------------------
 *
 * Opened from a file, or from a web host with no Fallaskóli server behind it,
 * progress lives in this browser. Served by server/server.mjs it logs in and
 * keeps the progress there. Nothing is configured: `probe()` asks the origin.
 * Progress already in the browser is lifted onto the server once and never
 * deleted locally (`liftLocalState`).
 */
async function connectServer() {
  if (!serverMode()) return false;
  const candidate = createServer("");
  const found = await candidate.probe();
  if (!found.server) return false;
  app.server = candidate;
  if (!found.me) {
    const config = await app.server.config();
    renderLogin(app, {
      config,
      googleUrl: config && config.google ? app.server.googleUrl() : null,
      pending: new URLSearchParams(location.search).get("bid") === "1",
      onDone: () => location.reload(),
    });
    return "gate";
  }
  app.profile = found.me.profile;
  app.rights = found.me.rights;
  /* From here on storage writes to the server. */
  driver = serverDriver(app.server, { onMerged: foldIn });
  store = createStore(driver, { key: (id) => id });
  return true;
}

/* The server driver, kept so start-up can tell it what the server holds. */
let driver = null;

/**
 * Another device wrote while this one was open, and the driver has merged the
 * two (core/merge.js). `merged` is what the server now holds; `sent` is what
 * this device had when the write began. Anything answered in the moment
 * between is the difference `app.S − sent`, and it is folded in the same way,
 * so not even the answer given during the round trip is lost.
 */
function foldIn(merged, sent) {
  const profile = app.S.profile;
  app.S = migrate(mergeStates(sent, app.S, merged));
  app.S.profile = profile;
  app.reloadPolicy();
  app.refresh();
  redrawOpenView();
  app.save();
}

/** What only a server knows: badge rarity, other people's badges, the table. */
async function loadSocial() {
  if (!app.server) return;
  app.reloadSocial = loadSocial;      // ui/account.js: after "show me" changes
  const [stats, roster, board, social, goal] = await Promise.all([
    app.server.badgeStats().catch(() => null),
    app.server.roster().catch(() => null),
    app.server.leaderboard(app.boardMetric).catch(() => null),
    app.server.social().catch(() => null),
    /* Item 59: the group's goal and its total (ui/classgoal.js draws it). */
    app.server.classGoal().catch(() => null),
  ]);
  app.badgeStats = stats && stats.measurable ? stats : null;
  app.roster = roster || [];
  app.board = board || [];
  app.social = social || null;
  app.classGoal = goal || null;
  judgeSocial();
  app.loadDuels();
  app.loadAssignments();
  redrawOpenView();
}

/**
 * The badges only other people can give (core/badges.js §14e): champion of
 * last week, overtaking somebody, finding a secret first. Judged once per
 * load, when the server's picture has arrived — the child is already looking
 * at a question by then, so the windows open over it like any other badge's.
 */
function judgeSocial() {
  if (!app.profile || !app.sess) return;
  const { ctx, memo } = socialContext({
    me: app.profile.id, roster: app.roster, board: app.board,
    result: app.social ? app.social.lastWeek : null,
    memo: app.S.social, week: app.social ? app.social.week : undefined,
    goal: app.classGoal,
  });
  app.S.social = memo;
  const won = checkBadges(
    { ...badgeContext(app.S, app.sess), when: "social", social: ctx },
    app.S.badges, app.sess.badgeAwards, undefined, (app.S.periods ||= {}));
  won.forEach((b) => app.awardBadge(b, todayKey()));
  app.save();
  if (!won.length) return;
  app.refresh();
  const { show, quiet } = windowsFor(won, app.badgeStats, { inSession: !!app.run });
  if (show.length) queueBadges(show, () => {
    document.querySelector(
      "#task input[type=text]:not([disabled]), #task textarea:not([disabled]), #check")?.focus();
  }, quiet);
}

async function init() {
  const connected = await connectServer();
  if (connected === "gate") {            // the gate is up; nothing else happens
    /* …and nothing of the program shows behind it: no tabs, no "0 XP" (v6.10). */
    document.body.classList.add("gated");
    return;
  }

  let loaded;
  if (app.server) {
    /* `localStore` is still browser storage itself — `store` now points at the
       server. Progress made before the server existed sits in the former and
       should reach the latter, once and never the other way round. */
    const legacy = await localStore.load("local");
    const { state, rev, lifted } = await liftLocalState(
      app.server, app.profile.id, legacy ? migrate(legacy) : null);
    loaded = state;
    app.liftedLocal = lifted;
    driver.prime(state, rev);
  } else {
    loaded = await store.load("local");
  }
  app.S = migrate(loaded);
  if (app.profile) {
    app.S.profile = { ...app.S.profile, id: app.profile.id, name: app.profile.name,
      role: app.profile.role, status: app.profile.status };
  }
  /* The curriculum ceiling belongs to the administrator and lives on the
     server. Fetched before the first question and cached in the state so the
     program still obeys it offline; the server never trusts the cached copy
     on the way back up (PUT /state/:id). */
  if (app.server) {
    /* …and with it the calibration table (item 17): one small request, and
       anything but a table — an older server, a refusal, no answer — leaves
       the program on the values it was built with. */
    const [ceiling, cal] = await Promise.all([
      app.server.myPolicy().catch(() => null),
      app.server.calibration().catch(() => null),
    ]);
    if (ceiling) app.S.allowed = ceiling.policy || null;
    app.calInfo = cal && typeof cal === "object" && cal.on === true ? cal : null;
    const table = app.calInfo ? cleanTable(app.calInfo.table) : null;
    app.cal = tableIsEmpty(table) ? null : table;
  }

  /* The optional vocabulary filter, applied once, before anything indexes the
     corpus. `safeVocab` is the administrator's switch alone — a child cannot
     turn it off, which is the entire point of it. */
  const hide = effectivePolicy(app.S).safeVocab && (DATA.blocked || []).length
    ? new Set(DATA.blocked) : null;
  /* The calibrated scores of cells and of irregularity go in here and
     nowhere else (core/lexicon.js `hardness`). The duel's lexicon
     (`duelLex`) is built without them: both sides must build the same
     questions from one seed. */
  const hardness = lexHardness(app.cal);
  if (hide || hardness) app.lex = buildLexicon(DATA, { hide, hardness });

  app.defs = createDefinitions([
    ...(app.server ? [remoteSource("")] : []),
    bundledSource(app.lex),
  ]);
  const report = applyDecay(app.S, todayKey());
  /* Before `newSession`, which reads `idleDaysOf` off `lastActive`. */
  noteLogin(app.S);
  app.sess = newSession(app.S);
  loadSocial();                          // not awaited; the interface fills in later

  /* Consecutive multi-skill sessions: the figure is updated when the *next*
     session begins, because only then is it clear what happened in the one that
     ended. `lastSessionSkills` is written on every answer (cheaply) so the
     figure survives the tab being closed, without the program needing a
     "session finished" event that nobody can guarantee. */
  if ((app.S.lastSessionSkills || 0) >= 3) app.S.multiSessionRun = (app.S.multiSessionRun || 0) + 1;
  else if (app.S.lastSessionSkills != null) app.S.multiSessionRun = 0;
  app.S.lastSessionSkills = 0;

  wireGlossary(() => app.S.settings.glossary !== false);
  setKeypadPref(() => keypadOn(app.S.settings, keypadEnv()));
  wirePrivacyLinks();
  wireReports(app);
  wireTabs();
  wireLessons(app);
  wireSettings();
  renderSettings(app);
  applyComfort(app.S.settings);

  addEventListener("resize", () => {
    const c = $("confetti");
    if (c) { c.width = innerWidth; c.height = innerHeight; }
  });
  addEventListener("beforeunload", () => { store.flush(); });
  addEventListener("visibilitychange", () => {
    /* Time does not count while the tab is not visible, so a night with a
       forgotten tab does not become eight hours of "practice". */
    if (document.visibilityState === "hidden") { clock.pause(); store.flush(); app.flushAnswers(); }
    else {
      clock.resume();
      /* Duels: a challenge may have arrived while the tab was away. */
      if (app.server && Date.now() - (app.duelLoadedAt || 0) > 60000) app.loadDuels();
    }
  });
  /* …and while it is open, a look every five minutes. One small request. */
  if (app.server) setInterval(() => {
    if (document.visibilityState === "visible" && !app.duelRun) { app.loadDuels(); app.loadAssignments(); }
  }, 5 * 60000);

  decayNotice(report);
  app.refresh();
  app.next();

  /* ---- badges judged at start-up ----
   * Login-streak badges ("opened it every day this week") are true the moment
   * the program opens; day-end badges are judged for the days that ended while
   * nobody was here, written in with THEIR dates. Both run after `app.next()`
   * so the child is looking at a question when the windows open, and the queue
   * hands the keyboard back to the question when it drains. */
  const loginWon = checkLogin(
    badgeContext(app.S, app.sess), app.S.badges, app.sess.badgeAwards,
    undefined, (app.S.periods ||= {}));
  loginWon.forEach((b) => app.awardBadge(b, todayKey()));

  const settled = settleDays(app.S);
  settled.forEach(({ badge, date }) => app.awardBadge(badge, date));
  /* The same ceiling as an answer, and for the same reason: a child coming back
     after a fortnight away crosses several rungs of three streak ladders at
     once, and used to be shown every one of them before reaching a question. */
  const backToWork = () => {
    const el = document.querySelector(
      "#task input[type=text]:not([disabled]), #task textarea:not([disabled]), #check");
    el?.focus();
  };
  if (loginWon.length) {
    app.refresh();
    const { show, quiet } = badgeWindows(loginWon, app.badgeStats);
    queueBadges(show, backToWork, quiet);
  }
  if (settled.length) {
    app.refresh();
    /* NOT `armNext(app)`: that turns "Athuga" into "Áfram →", and the child has
       not answered anything yet. The question is untouched underneath the
       windows, so the focus goes back to where the renderer put it. */
    const dated = settled.map(({ badge, date }) => ({ ...badge, wonOn: date }));
    const { show, quiet } = badgeWindows(dated, app.badgeStats);
    queueBadges(show, backToWork, quiet);
  }

  await app.save(true);
}

/* Exposed for the browser test. */
window.FALLASKOLI = app;

init().catch((err) => {
  console.error(err);
  $("task").innerHTML = `<div class="card"><p class="eyebrow"><span>Villa</span></p>
    <p class="sentence">Eitthvað fór úrskeiðis við ræsingu.</p>
    <p class="gloss">${esc(err.message)}</p></div>`;
});
