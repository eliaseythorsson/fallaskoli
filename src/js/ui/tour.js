/* The guided first run (critique item 84): a welcome, a placement round, and
   four pointers at the parts of the screen. The rules — which questions the
   round asks, how its level moves, what it writes and which year it suggests,
   and the record that says the first run is over — are in core/placement.js;
   this file draws, and drives the app through it.

   What a new pupil meets, in order:

     1. A welcome on a small blackboard, with one question: which year are
        you in? The answer sets the year preset (core/policy.js). "Ég veit
        það ekki" is an answer too; the round then suggests one.
     2. The placement round: twelve to fifteen ordinary questions on the
        ordinary board, run as a session (app.js `startRun` with
        `opts.placement`), so everything a session has is there and behaves
        as it always will — the slim line, the worked example on a type's
        first card, the explanation under a wrong answer. Two things are
        different: this file says what each question is (`pick`), and a
        wrong answer is not offered a second try or "Þrjár í röð" — the
        round is only finding a place to begin.
     3. What it found, and the year it suggests.
     4. Four pointers, each at a real element of the page: Dagsins lota,
        Lesefni, the skill map, and the slim line of a session — for which
        the pupil's first Dagsins lota is started, so the tour ends with the
        pupil at their first question.

   Every screen has "Sleppa kynningunni", and Escape does the same. Done or
   skipped, it never opens by itself again (`S.tour`); Stillingar has "Sýna
   kynninguna aftur", which shows the pointers and offers the round again.

   While any of it is on the screen no badge window opens over it
   (ui/dom.js `setBadgeGate`): the badges are kept and shown when it ends —
   in the summary of the session the tour ends in, if it ends in one.

   Accessibility: each screen is a dialog with a label and a description,
   the page behind it is inert, Tab stays inside it, the primary button has
   the focus, and nothing moves for a pupil who asked for no motion (the
   stylesheet's reduced-motion rule; nothing here scrolls smoothly). */

import { $, esc, setBadgeGate, queueBadges, openSheet, hideTip } from "./dom.js";
import { SKILLS, SKILL_IDS } from "../core/skills.js";
import { effectivePolicy, chosenPolicy, todayKey } from "../core/state.js";
import { PRESETS, applyPreset, presetOf, policyProblem, narrowPolicy } from "../core/policy.js";
import { visitLevels, MIN, MAX } from "../core/difficulty.js";
import { TASKS, nextTask, makeView, applyEffects } from "../tasks/index.js";
import { badgeWindows } from "../core/rarity.js";
import { renderSettings } from "./panels.js";
import { TODAY } from "./session.js";
import {
  placementTypes, startPlacement, placementQuestion, placementAnswer, placementDrop,
  placementResult, applyPlacement, suggestYear, shouldOfferTour, noteTour,
  TOUR_STEPS, MIN_ANSWERS,
} from "../core/placement.js";

/* The builders' random source, as in app.js: looked up at each call, so the
   browser test's fixed seed takes. */
const rng = () => Math.random();

/** The topic id of the placement run. Not a skill and not one of the
    picker's topics: it is never saved as a session (app.js `endRun`). */
export const PLACEMENT_TOPIC = "byrjun";
const PLACEMENT_LABEL = "🧭 Byrjunarstaður";

/* ---------- the words --------------------------------------------------------

   Everything a pupil reads in the first run is here, in one place, so that a
   native reader can check it in one sitting. The line under the welcome
   declines "þú" the way the page's tagline declines "skóli" (hér er skóli,
   um skóla, frá skóla, til skóla); the four forms are BÍN's (lexicon.json:
   þú · þig · þér · þín). */
export const TEXT = {
  skip: "Sleppa kynningunni",
  welcome: {
    title: "Velkomin í Fallaskóla!",
    chant: ["Hér ert", "þú", "um", "þig", "frá", "þér", "til", "þín"],
    body: "Hér æfir þú íslenska málfræði á þínum hraða. Fyrst finnum við réttan byrjunarstað fyrir þig og svo skoðum við það helsta í forritinu. Þetta tekur nokkrar mínútur.",
    ask: "Í hvaða bekk ertu?",
    unknown: "Ég veit það ekki",
  },
  intro: {
    title: "Finnum réttan byrjunarstað",
    lead: (n) => `Nú koma ${n} stuttar spurningar úr ýmsum áttum.`,
    body: "Þetta er ekki próf og þú færð enga einkunn. Þetta er bara til að finna réttan byrjunarstað.",
    how: "Spurningarnar verða þyngri þegar þú svarar rétt og léttari þegar þú svarar rangt. Það er því alveg eðlilegt að kunna ekki allt. Ef þú veist ekki svarið skaltu bara giska og halda áfram.",
    go: "Byrja →",
    pass: "Sleppa spurningunum",
    back: "← Til baka",
  },
  quit: {
    title: "Sleppa spurningunum?",
    enough: (k, n) => `Þú hefur svarað ${k} af ${n} spurningum. Það dugar til að finna byrjunarstað.`,
    few: (k, n) => `Þú hefur svarað ${k} af ${n} spurningum. Það er of lítið til að finna byrjunarstað, svo þú byrjar á þyngd 1 í öllu efni.`,
    /* A replay: the pupil has levels already, and they stay. */
    fewKept: (k, n) => `Þú hefur svarað ${k} af ${n} spurningum. Það er of lítið til að finna byrjunarstað, svo þyngdin verður eins og hún var.`,
    stay: "Halda áfram",
    go: "Sleppa spurningunum",
  },
  last: "Sjá byrjunarstaðinn →",
  result: {
    title: "Byrjunarstaðurinn er fundinn",
    body: "Takk fyrir svörin! Svona byrjar þú í hverju efni. Þyngdin fylgir þér svo: hún hækkar þegar vel gengur og lækkar þegar eitthvað reynist erfitt.",
    noneTitle: "Þá byrjum við á byrjuninni",
    none: "Þú byrjar á þyngd 1 í öllu efni. Þyngdin hækkar svo af sjálfu sér þegar vel gengur.",
    keptTitle: "Þyngdin er óbreytt",
    kept: "Svörin voru of fá til að finna byrjunarstað, svo þyngdin í hverju efni er eins og hún var.",
    level: (nm, band, top) => `${nm}: þyngd ${band} af ${top}`,
    capLeft: "Efni",
    cap: (top) => `þyngd, 1–${top}`,
    listLabel: "Þyngd í hverju efni",
    suggest: (y) => `Miðað við svörin mælum við með <b>efni ${y}. bekkjar</b>. Þú ræður, og getur alltaf breytt þessu undir Stillingar.`,
    choose: "Hvaða efni viltu byrja á? Þú getur alltaf breytt þessu undir Stillingar.",
    higher: (y) => `Þér gekk mjög vel! Ef þú vilt geturðu bætt við <b>efni ${y}. bekkjar</b>. Þú getur alltaf breytt þessu undir Stillingar.`,
    same: (y) => `Þú æfir <b>efni ${y}. bekkjar</b>. Því má alltaf breyta undir Stillingar.`,
    tag: "mælt með",
    go: "Skoða forritið →",
  },
  replay: {
    title: "Kynning á Fallaskóla",
    body: "Viltu skoða það helsta aftur? Þú getur líka svarað byrjunarspurningunum aftur. Þá er þyngdin í hverju efni stillt upp á nýtt.",
    go: "Skoða forritið →",
    again: "Finna byrjunarstaðinn aftur",
    close: "Loka",
  },
  steps: {
    today: {
      title: "Dagsins lota",
      body: "Hér byrjar þú á hverjum degi. Tíu spurningar eru valdar fyrir þig: upprifjun, það sem þarf að æfa betur og eitthvað nýtt. Fyrir neðan má líka velja eitt efni.",
    },
    lessons: {
      title: "Lesefni",
      body: "Hér eru reglurnar útskýrðar með dæmum. Á hverri síðu er hnappurinn „Æfa þetta“ sem byrjar stutta lotu um efni síðunnar.",
    },
    map: {
      title: "Færnikortið",
      body: "Hér sérðu hvar þú stendur. Hver hringur er eitt efnisatriði og fyllist eftir því sem þú nærð betra valdi á því. Smelltu á hring til að sjá regluna og æfa einmitt það. Kortið er undir Merki → Framvinda.",
    },
    line: {
      title: "Í lotu",
      body: "Í lotu fær spurningin allan skjáinn. Línan efst sýnir efnið og hvar þú ert í lotunni, og með × lengst til hægri má hætta. Fyrsta lotan þín er tilbúin. Gangi þér vel!",
    },
  },
  eyebrow: "Kynning",
  of: (i, n) => `${i} af ${n}`,
  next: "Áfram →",
  back: "Til baka",
  start: "Byrja að æfa →",
  later: "Ekki núna",
  finish: "Ljúka kynningunni",
  skipped: "Kynningunni var sleppt. Þú finnur hana aftur undir Stillingar: „Sýna kynninguna aftur“.",
  busy: "Ljúktu fyrst lotunni sem er í gangi.",
};

/* ---------- where each pointer points -------------------------------------------

   `enter` brings the part of the app onto the screen; `target` is the real
   element the ring is drawn round. A step whose element is not there (no
   Dagsins lota because nothing is switched on) is passed over. */
function stepsFor(app, T) {
  return {
    today: {
      enter() {
        /* The picker, not the summary of a session finished before a replay. */
        if (!app.run && app.runDone) { app.runDone = null; app.next(); }
        app.openView("practice");
      },
      target: () => (app.run ? null : $("todaystart") || $("runstart")),
    },
    lessons: {
      enter() { app.openView("lessons"); },
      target: () => document.querySelector('nav.tabs button[data-view="lessons"]'),
    },
    map: {
      enter() {
        app.openView("progress");
        const pane = document.querySelector('#panepick button[data-pane="stats"]');
        if (pane) pane.click();
      },
      target: () => document.querySelector("#skillmap .smnode:not(.locked)") || $("skillmap"),
    },
    line: {
      /* The pupil's first Dagsins lota, started so that there is a line to
         point at. If the pupil says "not now" it is taken away again, and so
         is the note that its first question's worked example was shown. */
      enter() {
        app.openView("practice");
        if (app.run) return;
        const plan = app.todayPlan ? app.todayPlan() : null;
        if (!plan || !plan.n) return;
        T.seen0 = JSON.stringify(app.S.seenTypes || {});
        app.startRun(TODAY.id, plan.n);
        T.demo = !!app.run;
      },
      leave(keep) {
        if (!T.demo) return;
        T.demo = false;
        if (keep || !app.run || app.run.i > 0) return;
        app.endRun(true);
        if (T.seen0) { app.S.seenTypes = JSON.parse(T.seen0); app.save(); }
      },
      target: () => document.querySelector("#runbar .runline"),
    },
  };
}

/* ---------- small pieces ---------------------------------------------------------- */

const visible = (el) => {
  if (!el || !el.isConnected) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};

/* A chalk line under a heading, drawn by hand rather than ruled. */
const UNDERLINE = `<svg class="tourline" viewBox="0 0 220 10" preserveAspectRatio="none" aria-hidden="true" focusable="false">
  <path d="M3 6 C 40 2, 78 9, 118 5 S 190 3, 217 6" /></svg>`;

const TRAY = `<div class="tray" aria-hidden="true"><i class="chalk"></i><i class="chalk y"></i><i class="sponge"></i></div>`;

/** The highest year the administrator's ceiling stands for, or null. */
const capYearOf = (S) => (S.allowed ? presetOf(S.allowed) : null);

/* ---------- the tour ---------------------------------------------------------------- */

export function createTour(app) {
  /* `phase`: null (nothing showing), "card" (welcome, intro, result,
     replay), "placing" (the round is on the board; nothing of the tour is on
     the screen) or "steps". */
  const fresh = () => ({
    phase: null, replay: false, year: null, yearSaid: false, step: 0, steps: [],
    result: null, levels0: null, held: [], demo: false, seen0: null,
    /* `applied`: the year whose preset this run has set, or null;
       `pendingYear`: the year pressed on the result card, set on the way out. */
    applied: null, pendingYear: null,
    root: null, cleanup: null,
  });
  let T = fresh();
  let STEPS = stepsFor(app, T);

  /* ---- the overlay: one root, drawn over everything, the page inert ---- */

  function mount(html, cls) {
    unmount();
    hideTip();
    const root = document.createElement("div");
    root.className = "tour " + cls;
    root.id = "tour";
    root.innerHTML = html;
    document.body.appendChild(root);
    const wrap = document.querySelector(".wrap");
    if (wrap) { wrap.inert = true; wrap.setAttribute("aria-hidden", "true"); }
    const key = (e) => {
      /* A sheet of the app's own on top (there is none while a card is up,
         but be sure): it has the keyboard. */
      if (document.querySelector(".scrim")) return;
      if (e.key === "Escape") { e.preventDefault(); end("skipped"); return; }
      if (e.key !== "Tab") return;
      const stops = [...root.querySelectorAll("button:not([disabled])")].filter(visible);
      if (!stops.length) return;
      const at = stops.indexOf(document.activeElement);
      const to = e.shiftKey ? (at <= 0 ? stops.length - 1 : at - 1) : (at < 0 || at === stops.length - 1 ? 0 : at + 1);
      e.preventDefault();
      stops[to].focus();
    };
    document.addEventListener("keydown", key, true);
    T.root = root;
    T.cleanup = () => {
      document.removeEventListener("keydown", key, true);
      if (wrap) { wrap.inert = false; wrap.removeAttribute("aria-hidden"); }
    };
    root.querySelectorAll("[data-skip]").forEach((b) => { b.onclick = () => end("skipped"); });
    return root;
  }

  function unmount() {
    if (T.cleanup) T.cleanup();
    if (T.root) T.root.remove();
    T.root = null; T.cleanup = null;
  }

  /** A card: a small blackboard in the middle of the screen. */
  function card({ title, body, extra = "", actions, skip = true, wide = false }) {
    const root = mount(`<div class="tourscrim">
      <div class="tourcard blackboard${wide ? " wide" : ""}" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="tour-h" aria-describedby="tour-d">
        <h2 id="tour-h">${esc(title)}</h2>${UNDERLINE}
        <div id="tour-d" class="tourtext">${body}</div>
        ${extra}
        ${actions ? `<div class="touractions">${actions}</div>` : ""}
        ${skip ? `<button type="button" class="tourskip" data-skip>${esc(TEXT.skip)}</button>` : ""}
        ${TRAY}
      </div></div>`, "tourcards");
    T.phase = "card";
    return root;
  }

  const focusFirst = (root, sel = "button.go") => {
    const b = root.querySelector(sel) || root.querySelector("button");
    if (b) b.focus();
  };

  /* ---- 1. the welcome, and the year ---- */

  function yearButtons({ pressed = null, tag = null } = {}) {
    const cap = capYearOf(app.S);
    return PRESETS.map((p) => {
      const over = cap != null && p.year > cap;
      return `<button type="button" class="touryear" data-year="${p.year}" aria-pressed="${p.year === pressed}"
        ${over ? "disabled" : ""} aria-label="${esc(p.nm)}${p.year === tag ? esc(", " + TEXT.result.tag) : ""}">
        ${p.year}.<small>bekkur</small>${p.year === tag ? `<em>${esc(TEXT.result.tag)}</em>` : ""}</button>`;
    }).join("");
  }

  function showWelcome() {
    const W = TEXT.welcome;
    const c = W.chant;
    const chant = `<p class="tourchant" aria-hidden="true">${esc(c[0])} <b>${esc(c[1])}</b>, ${esc(c[2])} <b>${esc(c[3])}</b>, ${
      esc(c[4])} <b>${esc(c[5])}</b>, ${esc(c[6])} <b>${esc(c[7])}</b>.</p>`;
    const root = card({
      title: W.title,
      body: `${chant}<p>${esc(W.body)}</p>`,
      extra: `<h3 class="tourask" id="tour-ask">${esc(W.ask)}</h3>
        <div class="touryears" role="group" aria-labelledby="tour-ask">
          ${yearButtons()}
          <button type="button" class="touryear wide" data-year="">${esc(W.unknown)}</button>
        </div>`,
    });
    root.querySelectorAll(".touryear").forEach((b) => {
      b.onclick = () => {
        const y = Number(b.dataset.year) || null;
        T.year = y; T.yearSaid = !!y;
        if (y && setYear(y)) T.applied = y;
        showIntro();
      };
    });
    /* The card itself, not the first year: a ring round "8." would read as
       an answer already given. A screen reader says the heading and the
       text; Tab goes to the years. */
    root.querySelector(".tourcard").focus();
  }

  /** Set the pupil's own switches to a year (core/policy.js applyPreset), on
      the same objects the editor under Stillingar edits. Put back if the
      administrator's ceiling leaves nothing of it. */
  function setYear(year) {
    const S = app.S;
    S.policy ||= { skills: {}, types: {}, levels: {}, attrs: {}, safeVocab: null };
    const view = { skills: S.enabled, types: (S.policy.types ||= {}), levels: (S.policy.levels ||= {}) };
    const before = JSON.stringify(view);
    if (!applyPreset(view, year)) return false;
    if (policyProblem(S.allowed || null, chosenPolicy(S))) {
      const old = JSON.parse(before);
      for (const dim of ["skills", "types", "levels"]) {
        for (const k of Object.keys(view[dim])) delete view[dim][k];
        Object.assign(view[dim], old[dim]);
      }
      return false;
    }
    app.reloadPolicy();
    app.refreshRanges();
    renderSettings(app);
    /* The picker under the card shows the categories of the year. */
    if (!app.run && !app.cur) app.next();
    app.save();
    return true;
  }

  /* ---- 2. the placement round ---- */

  /** The round as it would be asked now: its state and the types per skill. */
  function planRound() {
    const P = effectivePolicy(app.S);
    const types = placementTypes(TASKS, P);
    app.refreshRanges();
    const st = startPlacement({ skills: Object.keys(types), ranges: app.sess.range, year: T.year });
    return { st, types, extra: 0 };
  }

  function showIntro() {
    const I = TEXT.intro;
    const round = planRound();
    /* Nothing can be asked (an administrator who allows only what the round
       leaves out): straight to the pointers. */
    if (!round.st.plan.length) return showSteps(0);
    const root = card({
      title: I.title,
      body: `<p><b>${esc(I.lead(round.st.plan.length))}</b> ${esc(I.body)}</p><p>${esc(I.how)}</p>`,
      actions: `<button type="button" class="go" id="tour-go">${esc(I.go)}</button>
        <button type="button" class="ghost" id="tour-pass">${esc(I.pass)}</button>
        ${T.replay ? "" : `<button type="button" class="ghost" id="tour-back">${esc(I.back)}</button>`}`,
    });
    $("tour-go").onclick = () => startRound(round);
    $("tour-pass").onclick = () => showSteps(0);
    if ($("tour-back")) $("tour-back").onclick = showWelcome;
    focusFirst(root);
  }

  function startRound(round) {
    unmount();
    T.phase = "placing";
    /* What the round's own answers do to the saved levels on the way is put
       back if it ends without placing anything. */
    T.levels0 = JSON.stringify(app.S.difficulty || {});
    app.runDone = null;
    app.startRun(PLACEMENT_TOPIC, round.st.plan.length, null,
      { review: false, placement: round, label: PLACEMENT_LABEL });
    if (!app.run) showSteps(0);
  }

  /** app.js `pickTask`: the next question of the round — the skill the plan
      says, at the level the staircase stands at. A slot nothing can be built
      for is dropped, so the round is as long as what can be asked. */
  function pick() {
    const r = app.run, pl = r.placement;
    for (;;) {
      const q = placementQuestion(pl.st);
      if (!q) { r.n = Math.max(r.i, pl.st.plan.length + pl.extra); return null; }
      /* The live level IS the level asked: the card says so, and the answer
         is filed at it (core/mastery.js). The saved level is written when
         the round is over. */
      app.sess.diff[q.skill] = q.level;
      if (app.sess.warm) delete app.sess.warm[q.skill];
      const policy = narrowPolicy(effectivePolicy(app.S), { skills: [q.skill], types: pl.types[q.skill] || [] });
      const view = makeView({ S: app.S, sess: app.sess, policy, inRun: true });
      let b = null;
      for (let k = 0; k < 4 && !b; k++) b = nextTask(app.lex, view, rng);
      if (b) {
        applyEffects(app, b.effects);
        /* No second try (core/answer.js `retryAllowed` reads this): the
           first answer is the one the round learns from. */
        b.task.placement = true;
        r.n = pl.st.plan.length + pl.extra;
        return b.task;
      }
      pl.st = placementDrop(pl.st);
    }
  }

  /** app.js `finish`: one answer of the round, once per question. */
  function answered(ok) {
    const r = app.run, pl = r && r.placement;
    if (!pl) return;
    if (typeof ok !== "boolean") pl.extra++;      // not graded: asked, but no step
    pl.st = placementAnswer(pl.st, ok);
    r.n = pl.st.plan.length + pl.extra;
    if (r.i >= r.n) {
      /* After app.js has written "Sjá samantekt →" on the button. */
      const b = $("check");
      if (b) queueMicrotask(() => queueMicrotask(() => {
        if (/^(Áfram|Sjá samantekt)/.test(b.textContent)) b.textContent = TEXT.last;
      }));
    }
  }

  /** The × of the round's line: leave the questions, not the first run. */
  function quitPlacement() {
    const r = app.run;
    if (!r || !r.placement) return;
    const k = r.placement.st.hist.length;
    const Q = TEXT.quit;
    const sheet = openSheet(Q.title, `
      <p>${esc(k >= MIN_ANSWERS ? Q.enough(k, r.n) : T.replay ? Q.fewKept(k, r.n) : Q.few(k, r.n))}</p>
      <div class="answer"><button type="button" class="go" id="tourquit-no">${esc(Q.stay)}</button>
        <button type="button" class="ghost" id="tourquit-yes">${esc(Q.go)}</button></div>`);
    sheet.el.querySelector("#tourquit-no").onclick = () => sheet.close();
    sheet.el.querySelector("#tourquit-yes").onclick = () => {
      sheet.close();
      if (app.run === r) app.endRun(true);
    };
    sheet.el.querySelector("#tourquit-no").focus();
  }

  /** app.js `endRun`: the round is over (finished, left, or out of
      questions). Write what it found, and say so. */
  function placementOver(r) {
    const S = app.S, pl = r.placement;
    /* The session is already gone from the app (`endRun`), so from here the
       first run is on a card again — before anything asks `heal`. A round
       with no first run around it cannot be started from the interface; if
       one ends, its levels are written and nothing more is shown. */
    const mine = T.phase === "placing";
    if (mine) T.phase = "card";
    const P = effectivePolicy(S);
    const result = placementResult(pl.st, {
      others: SKILL_IDS.filter((id) => P.skill(id)), ranges: app.sess.range,
    });
    if (result.placed) applyPlacement(S, result, { sess: app.sess });
    else if (T.levels0) {
      S.difficulty = JSON.parse(T.levels0);
      Object.assign(app.sess, visitLevels(S, todayKey()));
    }
    app.refreshRanges();
    /* The badges the answers won wait with the others (see `hold`). */
    const held = app.sess.heldBadges || [];
    app.sess.heldBadges = [];
    hold([...(r.badges || []), ...held]);
    T.result = result;
    if (mine) noteTour(S, T.replay ? (S.tour ? S.tour.st : "done") : "open",
      { day: todayKey(), placed: result.placed ? 1 : null, year: T.replay ? undefined : T.year });
    app.save();
    app.next();                        // the picker, under the card
    if (mine) showResult();
  }

  /* ---- 3. what it found ---- */

  function levelsHTML(result) {
    const P = effectivePolicy(app.S);
    const top = Math.max(MIN, Math.min(MAX, P.maxLevel ?? MAX));
    const rows = SKILLS.filter((s) => result.levels[s.id]).map((s) => {
      const band = Math.max(MIN, Math.min(top, Math.round(result.levels[s.id].level)));
      const ticks = Array.from({ length: top }, (_, k) => `<i class="${k < band ? "on" : ""}"></i>`).join("");
      return `<li><span class="sr-only">${esc(TEXT.result.level(s.nm, band, top))}</span>
        <span class="tln" aria-hidden="true"><i>${s.ico}</i> ${esc(s.nm)}</span>
        <span class="tlm" aria-hidden="true">${ticks}</span>
        <span class="tlv" aria-hidden="true">${band}</span></li>`;
    });
    return `<p class="tourcap" aria-hidden="true"><span>${esc(TEXT.result.capLeft)}</span><span>${esc(TEXT.result.cap(top))}</span></p>
      <ul class="tourlevels" aria-label="${esc(TEXT.result.listLabel)}">${rows.join("")}</ul>`;
  }

  function showResult() {
    const R = TEXT.result, result = T.result;
    const placed = !!(result && result.placed);
    const said = T.yearSaid ? T.year : null;
    const sug = T.replay ? null : suggestYear(result, { chosen: said, cap: capYearOf(app.S) });
    /* The year: nothing to choose when the pupil said one and the round
       agrees; otherwise the years as buttons, the pupil's own (or, with
       none said, the suggested one) pressed. */
    let yearHTML = "", pressed = null;
    if (!T.replay) {
      if (said && (!sug || sug === said)) yearHTML = `<p class="touryearline">${R.same(said)}</p>`;
      else {
        pressed = said || sug || PRESETS[0].year;
        const line = said ? R.higher(sug) : sug ? R.suggest(sug) : esc(R.choose);
        yearHTML = `<p class="touryearline" id="tour-yl">${line}</p>
          <div class="touryears" role="group" aria-labelledby="tour-yl">${yearButtons({ pressed, tag: sug })}</div>`;
      }
    }
    const root = card({
      title: placed ? R.title : T.replay ? R.keptTitle : R.noneTitle,
      body: `<p>${esc(placed ? R.body : T.replay ? R.kept : R.none)}</p>`,
      extra: (placed ? levelsHTML(result) : "") + yearHTML,
      actions: `<button type="button" class="go" id="tour-go">${esc(R.go)}</button>`,
      wide: placed,
    });
    let chosen = pressed;
    root.querySelectorAll(".touryear").forEach((b) => {
      b.onclick = () => {
        chosen = Number(b.dataset.year);
        root.querySelectorAll(".touryear").forEach((x) => x.setAttribute("aria-pressed", x === b));
      };
    });
    /* The year pressed is set when the pupil goes on — and also when they
       skip from here: it is on the screen as chosen. */
    T.pendingYear = () => {
      T.pendingYear = null;
      if (chosen && chosen !== T.applied && setYear(chosen)) { T.applied = chosen; T.year = chosen; }
    };
    $("tour-go").onclick = () => { if (T.pendingYear) T.pendingYear(); showSteps(0); };
    focusFirst(root);
  }

  /* ---- 4. the pointers ---- */

  function showSteps(at) {
    if (T.pendingYear) T.pendingYear();
    T.steps = TOUR_STEPS.slice();
    go(at, 1);
  }

  /** Show step `at`; if its element is not on the page, the next one in the
      direction of travel. Past the last one the tour is done. */
  function go(at, dir) {
    const leaving = T.phase === "steps" ? STEPS[T.steps[T.step]] : null;
    if (leaving && leaving.leave) leaving.leave(false);
    for (let i = at; i >= 0 && i < T.steps.length; i += dir) {
      const s = STEPS[T.steps[i]];
      s.enter();
      const el = s.target();
      if (visible(el)) { T.step = i; return drawStep(); }
      if (s.leave) s.leave(false);
    }
    if (dir < 0) return go(0, 1);
    end("done");
  }

  function drawStep() {
    const id = T.steps[T.step], s = STEPS[id], W = TEXT.steps[id];
    const last = T.step === T.steps.length - 1, line = id === "line";
    const root = mount(`<div class="tourshade"></div>
      <div class="tourring" aria-hidden="true"></div>
      <div class="tourtip blackboard" role="dialog" aria-modal="true" aria-labelledby="tour-h" aria-describedby="tour-d">
        <p class="toureyebrow"><span>${esc(TEXT.eyebrow)}</span><b>${esc(TEXT.of(T.step + 1, T.steps.length))}</b></p>
        <h2 id="tour-h">${esc(W.title)}</h2>
        <p id="tour-d" class="tourtext">${esc(W.body)}</p>
        <div class="touractions">
          <button type="button" class="go" id="tour-next">${esc(line ? TEXT.start : last ? TEXT.finish : TEXT.next)}</button>
          ${line ? `<button type="button" class="ghost" id="tour-later">${esc(TEXT.later)}</button>` : ""}
          ${T.step > 0 ? `<button type="button" class="ghost" id="tour-prev">${esc(TEXT.back)}</button>` : ""}
        </div>
        ${line ? "" : `<button type="button" class="tourskip" data-skip>${esc(TEXT.skip)}</button>`}
        <i class="tourarrow" aria-hidden="true"></i>
      </div>`, "tourpoint");
    T.phase = "steps";
    root.dataset.step = id;
    $("tour-next").onclick = () => (last ? end("done", { keep: true }) : go(T.step + 1, 1));
    if ($("tour-later")) $("tour-later").onclick = () => end("done");
    if ($("tour-prev")) $("tour-prev").onclick = () => go(T.step - 1, -1);

    const ring = root.querySelector(".tourring"), tip = root.querySelector(".tourtip");
    const el = s.target();
    /* Instantly, not smoothly: the ring is measured in the next frame, and
       nothing should glide for a pupil who asked for no motion. */
    el.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
    /* Where the small board goes: under its element if it fits there, else
       over it, else beside it (a phone on its side is wide and low). If it
       fits nowhere — a small phone, an element in the middle of the window —
       the page is moved once, so the element stands at the top and the
       board has the rest of the window under it. */
    let nudged = false;
    const place = () => {
      const t = s.target();
      if (!visible(t) || !tip.isConnected) return;
      let r = t.getBoundingClientRect();
      const vw = document.documentElement.clientWidth, vh = window.innerHeight;
      const pad = 6, gap = 16;
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      const fits = (q) => ({
        below: q.bottom + pad + gap + th <= vh - 8,
        above: q.top - pad - gap - th >= 8,
        right: q.right + pad + gap + tw <= vw - 8 && th <= vh - 16,
        left: q.left - pad - gap - tw >= 8 && th <= vh - 16,
      });
      let f = fits(r);
      if (!nudged && !f.below && !f.above && !f.right && !f.left) {
        nudged = true;
        window.scrollBy(0, r.top - pad - 8);
        r = t.getBoundingClientRect();
        f = fits(r);
      }
      const left = Math.max(4, r.left - pad), right = Math.min(vw - 4, r.right + pad);
      const top = Math.max(4, r.top - pad), bottom = Math.min(vh - 4, r.bottom + pad);
      Object.assign(ring.style, { left: left + "px", top: top + "px",
        width: Math.max(0, right - left) + "px", height: Math.max(0, bottom - top) + "px" });
      const side = f.below ? "below" : f.above ? "above" : f.right ? "right" : f.left ? "left" : "";
      const cx = (left + right) / 2, cy = (top + bottom) / 2;
      const clampX = (x) => Math.max(12, Math.min(vw - tw - 12, x));
      const clampY = (y) => Math.max(8, Math.min(vh - th - 8, y));
      const x = side === "right" ? right + gap : side === "left" ? left - gap - tw : clampX(cx - tw / 2);
      const y = side === "below" ? bottom + gap : side === "above" ? top - gap - th
        : side ? clampY(cy - th / 2) : clampY(vh);
      Object.assign(tip.style, { left: x + "px", top: clampY(y) + "px" });
      for (const c of ["below", "above", "right", "left"]) tip.classList.toggle(c, c === side);
      tip.style.setProperty("--ax", Math.max(22, Math.min(tw - 22, cx - x)) + "px");
      tip.style.setProperty("--ay", Math.max(22, Math.min(th - 22, cy - clampY(y))) + "px");
    };
    place();
    requestAnimationFrame(place);
    const onMove = () => place();
    addEventListener("resize", onMove);
    addEventListener("scroll", onMove, true);
    const cleanup = T.cleanup;
    T.cleanup = () => {
      removeEventListener("resize", onMove);
      removeEventListener("scroll", onMove, true);
      if (cleanup) cleanup();
    };
    $("tour-next").focus({ preventScroll: true });
  }

  /* ---- the badges that wait ---- */

  /* The round's session can be taken away from under the tour — "Núllstilla
     allt" or an imported state, reached through a 📖 link's tabs. Then there
     is no first run going on any more, and nothing must be held for it. */
  function heal() {
    if (T.phase !== "placing" || (app.run && app.run.placement)) return;
    unmount();
    setBadgeGate(null);
    T = fresh();
    STEPS = stepsFor(app, T);
  }

  /** ui/dom.js `setBadgeGate`: taken, while the tour is on the screen. */
  function hold(list) {
    heal();
    if (!T.phase) return false;
    for (const b of list || []) if (b && !T.held.some((x) => x.id === b.id)) T.held.push(b);
    return true;
  }

  /* ---- the end ---- */

  /**
   * The first run is over. `how`: "done", "skipped", or "closed" (the replay
   * card's Loka: nothing is written). `keep`: the session of the last
   * pointer goes on — the pupil pressed "Byrja að æfa".
   */
  function end(how, { keep = false } = {}) {
    if (!T.phase) return;
    const was = T;
    if (how !== "closed" && was.pendingYear) was.pendingYear();
    const step = was.phase === "steps" ? STEPS[was.steps[was.step]] : null;
    unmount();
    if (step && step.leave) step.leave(keep);
    /* Left during the round with Escape cannot happen (no overlay then);
       left from a card or a pointer, any session of the tour's is gone. */
    const S = app.S;
    if (how !== "closed" && !(was.replay && how === "skipped"))
      noteTour(S, how, { day: todayKey(), year: was.replay ? undefined : was.year });
    setBadgeGate(null);
    T = fresh();
    STEPS = stepsFor(app, T);
    app.save(true);

    if (!app.run) app.openView("practice");
    if (how === "skipped" && !was.replay) {
      const n = $("notice");
      if (n) {
        n.innerHTML = `<div class="notice" role="status">${esc(TEXT.skipped)}</div>`;
        setTimeout(() => { if (n.textContent.includes(TEXT.skipped.slice(0, 20))) n.innerHTML = ""; }, 12000);
      }
    }
    const focusBack = () => {
      const el = document.querySelector(
        "#task input[type=text]:not([disabled]), #task textarea:not([disabled]), #todaystart, #runstart, #check");
      if (el) el.focus({ preventScroll: !app.run });
    };
    /* The badges that waited: in a session they belong to its summary
       (item 61); otherwise their windows open now, within the usual ceiling. */
    if (was.held.length) {
      if (app.run) {
        was.held.forEach((b) => { if (!app.run.badges.some((x) => x.id === b.id)) app.run.badges.push(b); });
      } else {
        const { show, quiet } = badgeWindows(was.held, app.badgeStats);
        if (show.length) { queueBadges(show, focusBack, quiet); return; }
      }
    }
    focusBack();
  }

  /* ---- the way in ---- */

  function begin({ replay = false } = {}) {
    if (T.phase) return;
    T = fresh();
    STEPS = stepsFor(app, T);
    T.replay = replay;
    T.phase = "card";
    setBadgeGate(hold);
    if (!replay) { noteTour(app.S, "open", { day: todayKey() }); app.save(); }
    app.openView("practice");
    /* From the top: "Sýna kynninguna aftur" is at the bottom of a long tab. */
    if (typeof window !== "undefined" && window.scrollY > 0) window.scrollTo(0, 0);
    if (!replay) return showWelcome();
    const R = TEXT.replay;
    const root = card({
      title: R.title,
      body: `<p>${esc(R.body)}</p>`,
      actions: `<button type="button" class="go" id="tour-go">${esc(R.go)}</button>
        <button type="button" class="ghost" id="tour-again2">${esc(R.again)}</button>
        <button type="button" class="ghost" id="tour-close">${esc(R.close)}</button>`,
      skip: false,
    });
    $("tour-go").onclick = () => showSteps(0);
    $("tour-again2").onclick = showIntro;
    $("tour-close").onclick = () => end("closed");
    focusFirst(root);
  }

  return {
    /** Is any part of the first run going on (the round included)? */
    active: () => { heal(); return !!T.phase; },
    /** Open it by itself for a new pupil. True if it opened. */
    maybeStart() {
      /* The browser tests drive a fresh state through hundreds of checks
         that have nothing to do with the first run; they say so. */
      if (typeof window !== "undefined" && window.FALLASKOLI_NO_TOUR) return false;
      heal();
      if (T.phase || app.run || app.duelRun || app.drill || app.liveRun) return false;
      if (!shouldOfferTour(app.S, { role: app.profile ? app.profile.role : null })) return false;
      begin();
      return true;
    },
    /** "Sýna kynninguna aftur" under Stillingar. */
    replay() {
      const note = $("tour-note");
      heal();
      if (app.run || app.duelRun || app.drill || app.liveRun) { if (note) note.textContent = TEXT.busy; return false; }
      if (T.phase) return false;
      if (note) note.textContent = "";
      begin({ replay: true });
      return true;
    },
    wire() {
      const b = $("tour-again");
      if (b) b.onclick = () => this.replay();
    },
    pick, answered, placementOver, quitPlacement,
  };
}
