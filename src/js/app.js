/* Start-up and wiring. This is the only place that holds the state. */

import { DATA } from "../../data/data_bundle.js";
import { buildLexicon } from "./core/lexicon.js";
import { migrate, blankState, newSession, todayKey, badgeContext, settleDays, noteQuestion, noteLogin, effectivePolicy } from "./core/state.js";
import { applyDecay } from "./core/progress.js";
import { checkBadges, checkLogin, celebrate } from "./core/badges.js";
import { collectionSummary } from "./core/collection.js";
import { cleanWeekGoal } from "./core/state.js";
import { renderDrillBar } from "./ui/drill.js";
import { createStore } from "./storage/index.js";
import { createClock } from "./core/timing.js";
import { createDefinitions, bundledSource, remoteSource } from "./core/definitions.js";
import { serverMode, createServer, serverDriver, liftLocalState } from "./core/server.js";
import { CAL, eventOf, cleanTable, tableIsEmpty, lexHardness } from "./core/calibration.js";
import { SAMPLE, samplesOf } from "./core/classifiercheck.js";
import { $, esc, wireGlossary, queueBadges, hideTip, wirePrivacyLinks, setKeypadPref, keypadOn, keypadEnv, wireKeys, applyComfort } from "./ui/dom.js";
import { measurable, badgeWindows, windowsFor } from "./core/rarity.js";
import { socialContext } from "./core/social.js";
import { DEFAULT_METRIC } from "./core/leaderboard.js";
import { revealTopic } from "./ui/render.js";
import { l2On, wireSecondLanguage } from "./ui/secondlang.js";
import "./ui/render-more.js";
import { wireReports, captureCard, renderReportsPanel } from "./ui/reports.js";
import { renderHeader, renderStats } from "./ui/progress.js";
import { renderBadges, renderClass, renderSettings, renderData } from "./ui/panels.js";
import { renderLogin, renderAdmin, renderAccount, renderShareCard } from "./ui/account.js";
import { renderTeacher } from "./ui/teacher.js";
import { renderSkillMap } from "./ui/skillmap.js";
import { createTour } from "./ui/tour.js";
import { startPWA, rememberServer, wasServer, renderOffline } from "./ui/pwa.js";
import { mergeStates } from "./core/merge.js";
import { renderLessons, suggestLesson, wireLessons } from "./ui/lessons.js";
import { renderDuelRoom } from "./ui/duel.js";
import { levelRanges, applyRanges } from "./core/difficulty.js";
import { TASKS } from "./tasks/index.js";
import { diagnose, noteDiagnosis } from "./core/diagnosis.js";
import { noteMending } from "./core/mending.js";
import { syncSessionLayout } from "./ui/session.js";
import { LESSONS, readCount } from "./core/lessons.js";
import { showFindings, showReview, showMended, armNext } from "./ui/verdict.js";
import { sessionControl } from "./control/session.js";
import { drillControl } from "./control/drill.js";
import { duelControl } from "./control/duel.js";
import { liveControl } from "./control/live.js";

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
    /* A live round: the next question comes from the teacher, not from
       Áfram (control/live.js). The card stays as it is. */
    if (this.liveNext()) return;
    /* A duel's next question (control/duel.js). */
    if (this.duelNext()) return;
    /* A rescue drill, or "Þrjár í röð" (control/drill.js). */
    if (this.drillNext() || this.streakNext()) return;
    /* The session's next question, its summary, or the picker. */
    this.runNext();
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
    /* A question of the session: counted once (control/session.js). */
    const runQuestion = this.runAnswered(extra.correct, findings, chances);
    /* Item 36: one of "Þrjár í röð" answered — or a diagnosed miss in the
       session, which may offer them (control/drill.js). */
    this.streakAnswered(extra.correct, findings, runQuestion);
    const comeback = noteQuestion(this.sess, extra.correct ?? null);
    const accidents = noteAccidents(this.S, this.sess, this.cur, extra);

    /* A duel: one question further; the last one sends the score
       (control/duel.js). */
    this.duelAnswered(extra.correct);

    /* The rescue drill: one question further, and settled when it is over
       (control/drill.js); otherwise perhaps one is offered. */
    const drill = this.drillAnswered(extra.correct);
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
    /* A live round: no window over a question while the clock runs. They
       wait, as after a wrong answer, for the next one that is right. */
    if (this.liveRun) { this.sess.heldBadges = celebrate(this.sess.heldBadges, won, false).held; return; }
    const c = celebrate(this.sess.heldBadges, won, extra.correct ?? null);
    this.sess.heldBadges = c.held;
    if (!c.show.length) return;
    const { show, quiet } = badgeWindows(c.show, this.badgeStats);
    /* The badges that did not get their own window are named on the last one
       that did, so nothing arrives in the cabinet unannounced. */
    if (show.length) queueBadges(show, rearm, quiet);
  },
};

/* ---------- the controllers ---------------------------------------------
 *
 * Critique item 76: each part of the practice board has its own controller
 * (control/*.js), and `app` is where they meet. A controller is a set of
 * fields and methods mixed into `app`, so `this` in each is the app, they
 * reach each other through it, and everything else — the renderers, the tour,
 * the browser and server tests through `window.FALLASKOLI` — goes on calling
 * `app.startRun(…)` and reading `app.run` as before. `next` and `finish`
 * above stay here: they are the two places where the controllers take turns.
 */
function meet(target, ...parts) {
  for (const part of parts) {
    for (const k of Object.keys(part)) {
      /* Two parts with one name would silently overwrite each other. */
      if (k in target) throw new Error(`app.${k} is defined twice`);
      target[k] = part[k];
    }
  }
  return target;
}
meet(app, sessionControl(), drillControl(), duelControl(), liveControl());

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
    /* Item 84: starting over is starting as a new pupil. */
    app.tour.maybeStart();
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
  if (!found.server) {
    /* Item 54: opened offline from the worker's cache. On an address that
       was a server, local progress would be a second, separate one: say
       there is no connection instead (ui/pwa.js). A host that ANSWERED
       without being a server is a plain web host, and is remembered so. */
    if (found.offline && wasServer()) { renderOffline(); return "gate"; }
    if (!found.offline) rememberServer(false);
    return false;
  }
  rememberServer(true);
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
  app.loadLive();
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
  /* Item 54: served from a host with the worker's files, the program can be
     installed and opened offline, and offers a new version when there is
     one. From a file this does nothing at all. */
  startPWA({ beforeReload: () => store.flush() });
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

  /* Item 45: the glosses of the second-language mode open in the same
     window, whatever the box for grammatical terms says. */
  wireGlossary(() => app.S.settings.glossary !== false || l2On(app));
  wireSecondLanguage(app);
  setKeypadPref(() => keypadOn(app.S.settings, keypadEnv()));
  wirePrivacyLinks();
  wireReports(app);
  wireTabs();
  wireLessons(app);
  wireSettings();
  /* Item 84: the guided first run, and its button under Stillingar. */
  app.tour = createTour(app);
  app.tour.wire();
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
      /* A live round may have started while the tab was away. */
      if (app.server) app.loadLive();
    }
  });
  /* A live round is started in the lesson: a look for one every 15 seconds
     (control/live.js). */
  app.watchLive();
  /* …and while it is open, a look every five minutes. One small request. */
  if (app.server) setInterval(() => {
    if (document.visibilityState === "visible" && !app.duelRun) { app.loadDuels(); app.loadAssignments(); }
  }, 5 * 60000);

  decayNotice(report);
  app.refresh();
  app.next();
  /* Item 84: a new pupil is welcomed here, before the badges judged below —
     while the first run is on the screen their windows wait (ui/dom.js
     `setBadgeGate`) and open when it ends. */
  app.tour.maybeStart();

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
