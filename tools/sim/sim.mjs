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
const { TASKS, nextTask } = await import(R + "/src/js/tasks/index.js");
const { narrowPolicy } = await import(R + "/src/js/core/policy.js");
const DG = await import(R + "/src/js/core/diagnosis.js");
const PR = await import(R + "/src/js/core/progress.js");
const DF = await import(R + "/src/js/core/difficulty.js");
const { maxOf } = await import(R + "/src/js/core/mix.js");
const lex = buildLexicon(DATA);

// seeded rng for the learner; app itself uses Math.random
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

const sig = (t) => t.type === "villur" ? "villur|" + t.hunt.lines.map((l) => l.toks.map((x) => x.w).join(" ")).join("/") : t.type === "sort" ? t.typeId + "|" + (t.s ? t.s.t : "") + t.items.map((x) => x.w).join(",") : t.type === "tap" ? t.typeId + "|" + (t.s ? t.s.t : JSON.stringify(t.toks || "")) + "|" + t.cls : t.type === "parse" ? t.typeId + "|" + (t.s ? t.s.t : "") + "|" + t.t.w + "|" + t.i : t.type === "syntax" ? "syntax|" + t.s.t + "|" + t.askRole : t.type === "clause" ? "clause|" + t.s.t + "|" + t.span.from : t.type==="meaning" ? "meaning|"+t.word : [t.typeId, t.s ? t.s.t : (t.title || ""), t.prompt || t.question || "", (t.answers || [t.answer || ""])[0], t.cue || "", t.pron || "", t.askRole || ""].join("|");
const sentOf = (t) => (t.s ? t.s.t : null);

export function simulate({ ability = 0.75, learn = 0.004, days = 30, perDay = 2, size = 10, topic = "blandad", allSkills = false, seed = 1 }) {
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
    for (let r = 0; r < perDay; r++) {
      const run = { topic, n: size, items: [], focus: null };
      app.run = run;
      for (let i = 0; i < size; i++) {
        const P = ST.effectivePolicy(S);
        app.policy = narrowPolicy(P, { skills: SKILL_IDS.includes(topic) ? [topic] : null, types: null });
        const ids = DG.activePatterns(S, 3).map((p) => p.id);
        const counts = {}; run.items.forEach((it) => { counts[it.type] = (counts[it.type] || 0) + 1; });
        app.mix = { n: size, counts };
        if (app.forcedNoun && (counts.fill || 0) + 1 > maxOf("fill", size)) app.forcedNoun = null;
        const t0 = performance.now();
        let t;
        if (app.forcedNoun) t = nextTask(app);
        else t = DG.pickTargeted(() => nextTask(app), ids, { p: 0.4, tries: 5 });
        ms += performance.now() - t0;
        app.mix = null;
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
        const xp = ok ? PR.computeXp({ base: t.base || 8, lvl, ease, run: S.run, streak: 0 }) : 0;
        ST.record(S, app.sess, { skill: t.skill, cell: t.cell, word: t.word, ok, xp, counts: judged });
        DF.bumpDiff(app.sess, S, t.skill, ok);
        if (!ok && t.type === "fill" && !t.noRepeat) app.forcedNoun = t.n;
        // diagnosis: pick one tested pattern as the miss
        const ch = DG.chancesIn(t);
        const findings = !ok && ch.length ? [{ p: ch[Math.floor(rnd() * ch.length)] }] : [];
        if (judged) DG.noteDiagnosis(S, t, findings, ok, ST.todayKey());
        run.items.push({ type: t.typeId || t.type });
        log.push({ d, r, i, type: t.typeId || t.type, skill: t.skill, lvl, ok, sig: sig(t), sent: sentOf(t), cell: t.cell || null, word: t.word || null, targeted: !!t.targeted, diff: DF.diffOf(app.sess, t.skill), p });
      }
    }
    dayXp.push(S.xp - xp0);
    lvlByDay.push(PR.overallLevel(S.xp).level);
  }
  return { log, S, dayXp, lvlByDay, nulls, msPerQ: ms / Math.max(1, log.length) };
}
export { SKILLS, SKILL_IDS, TASKS };
