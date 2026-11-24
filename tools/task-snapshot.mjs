#!/usr/bin/env node
/* What the question builders build from fixed seeds, as fingerprints — to
   compare two versions of the code.

     node tools/task-snapshot.mjs take [--root <checkout>] [--api v612] > a.json
     node tools/task-snapshot.mjs compare a.json b.json

   Every builder draws from the `rng` it is handed (tasks/view.js), so a seed
   pins a question, and two trees that build the same thing agree line for
   line. Use it before and after a change that is meant to move nothing — or
   to see exactly which types a change to one category moved:

     git worktree add /tmp/before integration/v6.13
     node tools/task-snapshot.mjs take --root /tmp/before > /tmp/before.json
     node tools/task-snapshot.mjs take > /tmp/after.json
     node tools/task-snapshot.mjs compare /tmp/before.json /tmp/after.json

   This is how the v6.13 rewrite (one file per category, pure builders, the
   random source passed in) was checked against v6.12: 13,740 cases, all the
   same. `--api v612` reads a tree from before that rewrite, where the builders
   took the app as their context and drew from Math.random (swapped for a
   seeded generator here, as duels did then).

   The cases:
     A  every type on its own: eight difficulties × 25 seeds, a new pupil and
        one with a history
     B  duels: every topic × 30 seeds × three levels, 20 questions each
     C  practice sessions of 15 as tasks/next.js chooses them, mixed and per
        category, with a noun waiting for another cloze now and then
     D  rescue drills: four words of every class, ten turns
   Each line is [fingerprint of the task(s), a readable hint, fingerprint of
   the state afterwards] — the state too, because what showing a question
   changes (tasks/effects.js) is part of what a builder means.

   Run both sides on the same day: vocabulary spacing reads the date. */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const argv = process.argv.slice(2);
const opt = (name, dflt) => { const k = argv.indexOf(name); return k >= 0 ? argv[k + 1] : dflt; };

if (argv[0] === "compare") compare(argv[1], argv[2]);
else if (argv[0] === "take") await take();
else { console.error("usage: task-snapshot.mjs take [--root <checkout>] [--api v612]  |  compare a.json b.json"); process.exit(2); }

function compare(fa, fb) {
  const [a, b] = [fa, fb].map((f) => JSON.parse(readFileSync(f, "utf8")));
  let same = 0;
  const taskDiff = [], stateDiff = [];
  const missing = Object.keys(a).filter((k) => !(k in b));
  const extra = Object.keys(b).filter((k) => !(k in a));
  for (const k of Object.keys(a)) {
    if (!(k in b)) continue;
    const x = a[k], y = b[k];
    if (x[0] !== y[0] || x[1] !== y[1]) taskDiff.push([k, x[1], y[1]]);
    else if (x[2] !== y[2]) stateDiff.push([k, x[1]]);
    else same++;
  }
  const by = (list) => {
    const m = {};
    list.forEach(([k]) => { const p = k.split("|").slice(0, 2).join("|"); m[p] = (m[p] || 0) + 1; });
    return m;
  };
  console.log(`same ${same} · task differs ${taskDiff.length} · only the state differs ${stateDiff.length}` +
    ` · missing ${missing.length} · extra ${extra.length}`);
  if (taskDiff.length) {
    console.log("\ntask differs, by case and type:", by(taskDiff));
    taskDiff.slice(0, 30).forEach(([k, x, y]) => console.log(`  ${k}\n      ${x}\n      ${y}`));
  }
  if (stateDiff.length) {
    console.log("\nonly the state afterwards differs:", by(stateDiff));
    stateDiff.slice(0, 15).forEach(([k, x]) => console.log(`  ${k}  ${x}`));
  }
  process.exit(taskDiff.length || stateDiff.length || missing.length || extra.length ? 1 : 0);
}

async function take() {
  const here = decodeURIComponent(new URL("..", import.meta.url).pathname);
  const R = (opt("--root", here)).replace(/\/$/, "");
  const old = opt("--api", "") === "v612";
  const { DATA } = await import(R + "/data/data_bundle.js");
  const { EX } = await import(R + "/data/exercises.js");
  const { buildLexicon } = await import(R + "/src/js/core/lexicon.js");
  const ST = await import(R + "/src/js/core/state.js");
  const { SKILL_IDS } = await import(R + "/src/js/core/skills.js");
  const { createPolicy, narrowPolicy } = await import(R + "/src/js/core/policy.js");
  const { skillNeed } = await import(R + "/src/js/core/progress.js");
  const DU = await import(R + "/src/js/core/duel.js");
  const T = await import(R + "/src/js/tasks/index.js");
  const { seeded, duelTasks, DUEL_TOPICS } = DU;
  const lex = buildLexicon(DATA);
  const dlex = buildLexicon(DATA, { hide: new Set(DATA.blocked || []) });
  const today = ST.todayKey();

  /* a task as canonical data: keys sorted, functions dropped */
  const canon = (v, seen = new Set()) => {
    if (v === null || typeof v !== "object") return typeof v === "function" ? undefined : v;
    if (seen.has(v)) return "<cycle>";
    seen.add(v);
    let r;
    if (Array.isArray(v)) r = v.map((x) => canon(x, seen) ?? null);
    else if (v instanceof Set) r = { $set: [...v].map((x) => canon(x, seen)) };
    else { r = {}; for (const k of Object.keys(v).sort()) { const c = canon(v[k], seen); if (c !== undefined) r[k] = c; } }
    seen.delete(v);
    return r;
  };
  const h = (v) => createHash("sha1").update(JSON.stringify(canon(v)) ?? "null").digest("hex").slice(0, 16);
  const hint = (t) => (t ? `${t.type}/${t.typeId || ""}/${t.skill}/${t.word || ""}/${t.m || t.cell || ""}/` +
    (t.answers || [t.answer]).slice(0, 2).join("~") : "null");

  const allOn = () => { const a = {}; SKILL_IDS.forEach((id) => { a[id] = true; }); return a; };
  const fullPolicy = () => createPolicy(null, { skills: allOn(), types: {}, levels: {}, attrs: {}, safeVocab: null });
  const dayBack = (n) => {
    const d = new Date(); d.setDate(d.getDate() - n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  /** A pupil: new, or (`worn`) with words met, cells missed, vocabulary asked. */
  function host(seed, diff, worn) {
    const g = seeded(900000 + seed);
    const ri = (n) => Math.floor(g() * n);
    const S = ST.blankState();
    SKILL_IDS.forEach((id) => { S.enabled[id] = true; });
    if (worn) {
      SKILL_IDS.forEach((id) => { S.skills[id].xp = skillNeed(1 + ri(7)); });
      for (let k = 0; k < 400; k++) { const w = lex.all[ri(lex.all.length)]; S.words[ST.wordKey(w.o, w.c)] = { c: ri(7), w: ri(5) }; }
      const marks = [];
      for (let k = 0; k < 60; k++) marks.push(...Object.keys(lex.all[ri(lex.all.length)].forms || {}));
      marks.forEach((m) => { if (g() < 0.5) S.cells[m] = { c: ri(6), w: ri(6) }; });
      S.vocab = {};
      const defined = lex.all.filter((x) => x.d);
      for (let k = 0; k < 300; k++) {
        const w = defined[ri(defined.length)]; const n = 1 + ri(3); const last = dayBack([0, 3, 10, 40][ri(4)]);
        S.vocab[ST.wordKey(w.o, w.c)] = { n, dates: Array(n).fill(last), first: last, last };
      }
      for (const kind of ["samhengi", "myndun"]) for (const x of [...EX.wordInContext, ...EX.numeralAgree, ...EX.pluralOnly]) {
        if (g() < 0.4) { const last = dayBack([0, 3, 10, 40][ri(4)]); S.vocab[`${kind}:${x.t}`] = { n: 1, dates: [last], first: last, last }; }
      }
    }
    const sess = ST.newSession(S);
    Object.keys(sess.diff).forEach((k) => { sess.diff[k] = diff; });
    if (worn) {
      for (let k = 0; k < 12; k++) sess.seen.push(lex.all[ri(lex.all.length)].o);
      sess.exSeen = [];
      for (const list of [EX.pronounGap, EX.reflexive, EX.conjunction, EX.motionRest, EX.verbCase, EX.impersonal.frames ?? EX.impersonal, EX.advPrep])
        /* EX.impersonal became { frames, subjects } (critique item 23); a tree
           from before that has the plain list. */
        for (const x of list) if (g() < 0.3) sess.exSeen.push(x.t, x.t + (x.gloss ?? x.w ?? x.noun ?? ""));
      sess.sinceTable = ri(7); sess.sinceMeaning = ri(4);
    }
    return { lex, S, sess, forcedNoun: null, policy: fullPolicy() };
  }
  const stateOf = (c) => h({ vocab: c.S.vocab || {}, ex: c.sess.exSeen || [], seen: c.sess.seen,
    st: c.sess.sinceTable, sm: c.sess.sinceMeaning, fn: c.forcedNoun ? c.forcedNoun.o : null });

  /* ---- the two ways of asking ---- */
  const withSeed = (rng, f) => { const real = Math.random; Math.random = rng; try { return f(); } finally { Math.random = real; } };
  const viewOf = (c) => T.makeView({ S: c.S, sess: c.sess, policy: c.policy, today,
    forcedNoun: c.forcedNoun, mix: c.mix || null, inRun: !!c.run, huntPrefer: c.huntPrefer || null });
  const land = (c, b) => { if (!b) return null; T.applyEffects(c, b.effects); return b.task; };
  const api = old ? {
    type: (spec, c, rng) => withSeed(rng, () => spec.gen(c)),
    next: (c, rng) => withSeed(rng, () => T.nextTask(c)),
    drill: (c, w, turn, rng) => withSeed(rng, () => T.drillTask(c, w, turn)),
    duel: (d) => duelTasks(dlex, d, { nextTask: T.nextTask, blankState: ST.blankState, newSession: ST.newSession, createPolicy }),
  } : {
    type: (spec, c, rng) => land(c, spec.build(lex, viewOf(c), rng)),
    next: (c, rng) => land(c, T.nextTask(lex, viewOf(c), rng)),
    drill: (c, w, turn, rng) => {
      const b = T.drillTask(lex, viewOf(c), rng, w, turn);
      c.forcedNoun = null;                       // as app.next does around a drill
      return land(c, b);
    },
    duel: (d) => duelTasks(dlex, d, { nextTask: T.nextTask, makeView: T.makeView, applyEffects: T.applyEffects,
      blankState: ST.blankState, newSession: ST.newSession, createPolicy }),
  };

  const snap = {};
  const put = (key, t, c) => { snap[key] = [h(t), hint(t), c ? stateOf(c) : ""]; };

  /* A. every type on its own */
  for (const spec of T.TASKS) for (const d of [1, 2, 2.5, 3, 3.5, 4, 5, 6]) for (let seed = 0; seed < 25; seed++) {
    const c = host(seed, d, seed % 2 === 1);
    if (seed % 5 === 4) c.huntPrefer = ["fall"];
    put(`A|${spec.id}|${d}|${seed}`, api.type(spec, c, seeded(7000 + seed * 31 + Math.round(d * 10))), c);
  }
  /* B. duels */
  for (const tp of DUEL_TOPICS) for (let seed = 1; seed <= 30; seed++) for (const level of [1, 4, 8]) {
    const ts = api.duel({ topic: tp.id, n: 20, seed: seed * 7919, level });
    snap[`B|${tp.id}|${seed}|${level}`] = [DU.signature(ts), `${ts.length} questions ${h(ts)}`, ""];
  }
  /* C. sessions */
  for (const topic of [null, ...SKILL_IDS]) for (let seed = 0; seed < 12; seed++) {
    const c = host(seed + 50, [1, 2.5, 4][seed % 3], seed % 2 === 0);
    c.run = {};
    if (topic) c.policy = narrowPolicy(c.policy, { skills: [topic] });
    const rng = seeded(31337 + seed);
    const counts = {};
    for (let i = 0; i < 15; i++) {
      c.mix = { n: 15, counts: { ...counts } };
      if (i % 5 === 3) c.forcedNoun = lex.nouns[(seed * 13 + i) % 200];
      const t = api.next(c, rng);
      put(`C|${topic || "blandad"}|${seed}|${i}`, t, c);
      if (!t) break;
      const id = t.typeId || t.type;
      counts[id] = (counts[id] || 0) + 1;
    }
  }
  /* D. drills */
  for (const cls of Object.keys(T.DRILL_PLAN)) {
    const words = (lex.byClass[cls] || []).slice().sort((a, b) => a.r - b.r);
    for (const w of [words[0], words[3], words[11], words[40]].filter(Boolean)) for (let turn = 0; turn < 10; turn++) for (const seed of [1, 2]) {
      const c = host(seed + 80, 3, seed === 2);
      c.policy = old ? undefined : ST.effectivePolicy(c.S);     // a drill runs under the child's own policy
      if (turn === 6) c.forcedNoun = lex.nouns[5];
      put(`D|${cls}|${w.o}|${turn}|${seed}`, api.drill(c, w, turn, seeded(555 + turn * 3 + seed)), c);
    }
  }
  process.stdout.write(JSON.stringify(snap));
  console.error(`${Object.keys(snap).length} cases (${Object.values(snap).filter((x) => x[1] === "null").length} built nothing)`);
}
