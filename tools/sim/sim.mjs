const R = decodeURIComponent(new URL("../..", import.meta.url).pathname).replace(/\/$/, "");
// --- fake clock
const RealDate = Date; let offset = 0;
globalThis.Date = class extends RealDate {
  constructor(...a) { if (a.length) super(...a); else super(RealDate.now() + offset); }
  static now() { return RealDate.now() + offset; }
};
const { DATA } = await import(R + "/data/data_bundle.js");
const { buildLexicon } = await import(R + "/src/js/core/lexicon.js");
const ST = await import(R + "/src/js/core/state.js");
const { SKILL_IDS, SKILLS } = await import(R + "/src/js/core/skills.js");
const { TASKS, nextTask, makeView, withView, applyEffects, planOpening, nextOpening, scheduleReask, nextReask } = await import(R + "/src/js/tasks/index.js");
const RV = await import(R + "/src/js/core/review.js");
const { narrowPolicy } = await import(R + "/src/js/core/policy.js");
const DG = await import(R + "/src/js/core/diagnosis.js");
const PR = await import(R + "/src/js/core/progress.js");
const AN = await import(R + "/src/js/core/answer.js");
const { RETRY_XP } = await import(R + "/src/js/core/leniency.js");
const DF = await import(R + "/src/js/core/difficulty.js");
const { maxOf } = await import(R + "/src/js/core/mix.js");
const lex = buildLexicon(DATA);

// seeded rng for the learner; the builders are handed Math.random, as in app.js
const appRng = () => Math.random();
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

const sig = (t) => t.type === "villur" ? "villur|" + t.hunt.lines.map((l) => l.toks.map((x) => x.w).join(" ")).join("/") : t.type === "sort" ? t.typeId + "|" + (t.s ? t.s.t : "") + t.items.map((x) => x.w).join(",") : t.type === "tap" ? t.typeId + "|" + (t.s ? t.s.t : JSON.stringify(t.toks || "")) + "|" + t.cls : t.type === "parse" ? t.typeId + "|" + (t.s ? t.s.t : "") + "|" + t.t.w + "|" + t.i : t.type === "syntax" ? "syntax|" + t.s.t + "|" + t.askRole : t.type === "clause" ? "clause|" + t.s.t + "|" + t.span.from : t.type==="meaning" ? "meaning|"+t.word : [t.typeId, t.s ? t.s.t : (t.title || ""), t.prompt || t.question || "", (t.answers || [t.answer || ""])[0], t.cue || "", t.pron || "", t.askRole || ""].join("|");
const sentOf = (t) => (t.s ? t.s.t : null);

export function simulate({ ability = 0.75, learn = 0.004, days = 30, perDay = 2, size = 10, topic = "blandad", allSkills = false, seed = 1, review = true, rewards = false, activeDays = null }) {
  const rnd = rng(seed);
  const S = ST.blankState();
  if (allSkills) SKILL_IDS.forEach((id) => { S.enabled[id] = true; });
  const app = { lex, S, sess: null, forcedNoun: null, policy: null, mix: null, run: null, huntPrefer: null };
  const log = []; const dayXp = []; const lvlByDay = [];
  const cellN = {}; // exposures per cell -> learning
  let nulls = 0, ms = 0;
  for (let d = 0; d < days; d++) {
    offset = d * 86400000;
    app.sess = ST.newSession(S);
    const xp0 = S.xp;
    /* `activeDays(d)` false: the pupil does not turn up (a weekend, a cold). */
    const sessions = !activeDays || activeDays(d) ? perDay : 0;
    for (let r = 0; r < sessions; r++) {
      const run = { topic, n: size, i: 0, items: [], focus: null, review: [], reask: [] };
      app.run = run;
      // as app.startRun: the session opens with up to three due reviews (core/review.js)
      const skillsOnly = () => narrowPolicy(ST.effectivePolicy(S), { skills: SKILL_IDS.includes(topic) ? [topic] : null, types: null });
      if (review) run.review = planOpening(S, ST.todayKey(), size, skillsOnly(), null);
      for (let i = 0; i < size; i++) {
        const P = ST.effectivePolicy(S);
        app.policy = narrowPolicy(P, { skills: SKILL_IDS.includes(topic) ? [topic] : null, types: null });
        // as app.next: the ranges each skill's level may move in (v6.13), from the whole policy
        if (DF.applyRanges) DF.applyRanges(app.sess, DF.levelRanges(P, TASKS, lex.sentences));
        const ids = DG.activePatterns(S, 3).map((p) => p.id);
        const counts = {}; run.items.forEach((it) => { counts[it.type] = (counts[it.type] || 0) + 1; });
        if (app.forcedNoun && (counts.fill || 0) + 1 > maxOf("fill", size)) app.forcedNoun = null;
        const t0 = performance.now();
        // as app.pickTask: pure builders, the effects of the one question that is shown
        const view = makeView({ S, sess: app.sess, policy: app.policy, forcedNoun: app.forcedNoun,
          mix: { n: size, counts }, inRun: true, huntPrefer: DG.huntPreferFor(ids) });
        const effects = new Map();
        const build = () => { const b = nextTask(lex, view, appRng); if (!b) return null; effects.set(b.task, b.effects); return b.task; };
        // as app.pickTask: a due review first, then a noun whose turn has come, then the rest
        const rv = withView(view, { policy: skillsOnly(), mix: null });
        const due = review ? (nextOpening(lex, rv, appRng, run) || nextReask(lex, rv, appRng, run, (counts.fill || 0) + 1 <= maxOf("fill", size))) : null;
        const t = due ? due.task : app.forcedNoun ? build() : DG.pickTargeted(build, ids, { p: 0.4, tries: 5, rnd: appRng });
        if (t) applyEffects(app, due ? due.effects : effects.get(t));
        ms += performance.now() - t0;
        if (!t) { nulls++; break; }
        // answer model
        const key = t.cell || t.typeId;
        const n = (cellN[key] = (cellN[key] || 0) + 1);
        const lvl = t.lvl || 1;
        const typePenalty = { table: 0.12, smidja: 0.15, umritun: 0.12, villur: 0.15, verb: 0.08, parse: 0.08 }[t.type] || 0;
        let p = ability - 0.04 * (lvl - 1) - typePenalty + learn * Math.min(n, 40);
        p = Math.max(0.05, Math.min(0.98, p));
        const judged = !(t.type === "meaning");
        const ok = judged ? rnd() < p : true;
        const ease = ST.easeFor ? ST.easeFor(S, { cell: t.cell, word: t.word, skill: t.skill }) : 0.5;
        /* `rewards` (item 60): what the app really pays, not only the base XP of
           a right answer — the day-streak multiplier (core/state.js dayStreak,
           as core/answer.js reads it), a perfect table's bonus, and half XP for
           a second try that mends a miss (RETRY_TYPES; the pupil tries again
           7 times in 10 and mends it a quarter more often than a first try). */
        const streak = rewards ? ST.dayStreak(S) : 0;
        const full = PR.computeXp({ base: t.base || 8, lvl, ease, run: S.run, streak });
        let xp = ok ? full : 0;
        if (rewards && ok && t.type === "table") xp += Math.round(30 * PR.dayMult(streak));
        ST.record(S, app.sess, { skill: t.skill, cell: t.cell, word: t.word, ok, xp, counts: judged });
        if (rewards && !ok && judged && AN.RETRY_TYPES[t.type] && AN.RETRY_TYPES[t.type](t) && rnd() < 0.7 && rnd() < Math.min(0.9, p + 0.25))
          ST.grantXp(S, Math.max(1, Math.round(full * RETRY_XP)));
        DF.bumpDiff(app.sess, S, t.skill, ok);
        // v6.13: the noun comes back 3–5 questions on (tasks/review.js), not at once;
        // `review: false` keeps the old rule, for a before/after comparison
        if (!ok && t.type === "fill" && !t.noRepeat) { if (review) scheduleReask(run, t, appRng); else app.forcedNoun = t.n; }
        // as core/answer.js `settle`: the answer goes to the review queue. A table that
        // went wrong is given its first cell as the one missed.
        if (review && judged) {
          const recs = t.type === "table" ? (t.cells || []).map((c, k) => ({ do: "record", cell: c.m, word: t.word, ok: ok || k > 0 })) : [];
          RV.noteReview(S, t, { ok, findings: [], effects: recs }, ST.todayKey());
        }
        run.i++;
        // diagnosis: pick one tested pattern as the miss
        const ch = DG.chancesIn(t);
        const findings = !ok && ch.length ? [{ p: ch[Math.floor(rnd() * ch.length)] }] : [];
        if (judged) DG.noteDiagnosis(S, t, findings, ok, ST.todayKey());
        if (review && judged && findings.length) { const e = RV.entryByKey(S, RV.keyFor({ t: t.typeId || t.type, c: t.type === "table" ? (t.cells[0] || {}).m : t.cell, w: t.word, i: t.item, p: findings[0].p })); if (e && !e.p) e.p = findings[0].p; }
        run.items.push({ type: t.typeId || t.type });
        log.push({ d, r, i, type: t.typeId || t.type, skill: t.skill, lvl, ok, sig: sig(t), sent: sentOf(t), cell: t.cell || (t.type === "table" && t.cells[0] ? t.cells[0].m : null), word: t.word || null, targeted: !!t.targeted, diff: DF.diffOf(app.sess, t.skill), p,
          review: t.review ? t.reviewHit : null, reask: !!t.reask });
      }
    }
    dayXp.push(S.xp - xp0);
    lvlByDay.push(PR.overallLevel(S.xp).level);
  }
  return { log, S, dayXp, lvlByDay, nulls, msPerQ: ms / Math.max(1, log.length) };
}
export { SKILLS, SKILL_IDS, TASKS };
