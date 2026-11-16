/* Calibration from real answers, and the sample of wrong answers
 * (critique items 17 and 38) — the server's part.
 *
 * The arithmetic is in src/js/core/calibration.js and the classifier check in
 * src/js/core/classifiercheck.js; both explain themselves. This file holds
 * what only a server has: who may contribute, how much, where it is kept,
 * and when the table is worked out again.
 *
 * THE OWNER'S CONDITION: "I am not going to check anything by hand." So
 * there is no step here that waits for a person. Counting, estimating,
 * publishing and logging all happen by themselves, and the limits below are
 * what make that safe to leave alone.
 *
 * ---- what is kept, and what is not -------------------------------------
 *
 *   calibration.json   counts of right and wrong per (question type, level,
 *                      cell, irregularity score), the published table and
 *                      the log of each run. No account, no group, no time
 *                      of an answer, nothing anybody typed.
 *   samples.json       ONLY for a group whose teacher switched it on: at
 *                      most SAMPLE.keep wrong word forms with the word, the
 *                      cell asked for and what the classifier said. No
 *                      account, no group; the month, so it can expire.
 *   calibration-quota.json
 *                      for ONE DAY, per account: how many answers have been
 *                      counted today, in all and towards each number. This
 *                      is the only place an account stands beside its
 *                      answers, it exists so that the caps can be held
 *                      across a restart, and it is replaced when the day
 *                      changes.
 *
 * ---- whose answers count ("with consent") --------------------------------
 *
 * `counted(u)`, and nobody else's:
 *   - a learner (an adult trying the program out is not a pupil),
 *   - active, with a consent record (server.mjs `consentOk`),
 *   - who has not switched it off (*Aðgangurinn minn*; `u.stats === false`),
 *   - and is not held for a look at implausible numbers (`u.review`).
 * The privacy notice describes the counting from version CALIBRATION_NOTICE
 * on. With FALLASKOLI_CALIBRATION=strict an account is counted only if its
 * consent was given to that version or a later one, or if its owner switched
 * the counting on themselves. docs/PRIVACY.md §1b says which to choose.
 *
 * ---- what stops a flood ----------------------------------------------------
 *
 *   per request   CAL.perPost questions; anything not a known type, level
 *                 and cell is dropped (`cleanEvents`)
 *   per account   CAL.postsPerDay requests and CAL.perDay questions a day —
 *                 and towards any ONE number only CAL.unitType / unitCell /
 *                 unitIrr a day, so one account supplies a small, bounded
 *                 share of what any adjustment rests on
 *   per number    nothing is adjusted on fewer than CAL.minPupils different
 *                 accounts in one day, fewer than MIN_N answers, or a
 *                 difference that could be chance
 *   per run       a value moves a quarter, at most once a week, and never
 *                 further than one level or one point from the built-in
 *
 * ---- the kill switch ---------------------------------------------------------
 *
 *   FALLASKOLI_CALIBRATION=0   nothing is counted, no table is published
 *                              (every browser runs on the built-in values
 *                              from its next load), no sample is taken.
 *                              What is already stored is left alone.
 *   FALLASKOLI_SAMPLES=0       no wrong answers are sampled, whatever a
 *                              group's teacher has chosen.
 */

import { CAL, cleanEvents, estimate, decayCounts } from "../src/js/core/calibration.js";
import { SAMPLE, cleanSample, agreement } from "../src/js/core/classifiercheck.js";
import { TASKS } from "../src/js/tasks/registry.js";
import { CALIBRATION_NOTICE } from "./privacy.mjs";

const OFF = new Set(["0", "off", "false", "nei", "no"]);

export function calibrationConfig(env = process.env) {
  const v = String(env.FALLASKOLI_CALIBRATION ?? "").trim().toLowerCase();
  const on = !OFF.has(v);
  const s = String(env.FALLASKOLI_SAMPLES ?? "").trim().toLowerCase();
  return { on, strict: on && v === "strict", samples: on && !OFF.has(s) };
}

const dayOf = (d) => new Date(d).toISOString().slice(0, 10);
const monthOf = (d) => new Date(d).toISOString().slice(0, 7);
const LOG_KEEP = 60, LOG_CHANGES = 200;

/** The stored record in its full shape, whatever was on disk. */
function shape(c) {
  const o = c && typeof c === "object" ? c : {};
  const counts = o.counts && typeof o.counts === "object" ? o.counts : {};
  return {
    v: 1,
    counts: { types: counts.types || {}, cells: counts.cells || {}, distinct: counts.distinct || {} },
    table: o.table || null,
    lastRun: o.lastRun || null,
    runs: o.runs || 0,
    since: o.since || { questions: 0, records: 0 },
    log: Array.isArray(o.log) ? o.log : [],
  };
}

const add = (map, key, ok) => {
  const p = (map[key] ||= [0, 0]);
  p[0] += ok ? 1 : 0; p[1] += 1;
};

/**
 * @param {object} o
 *   store      server/store.mjs
 *   env        the environment (the two switches)
 *   lex        the server's lexicon — built WITHOUT a calibration table, so
 *              `cellHardness` is the build's own score: the prior
 *   cellMarks  every BÍN mark the bundle knows (`DATA.lex.orders`): the
 *              only cells an event may name
 *   audit      (by, act, target, note) → the audit trail
 *   groupOf    (user) → group id
 *   consentOk  (user) → has the consent the account needs
 *   random     for the sample; a test passes its own
 */
export function createCalibration({ store, env = process.env, lex, cellMarks, audit, groupOf, consentOk,
  random = Math.random }) {
  const cfg = calibrationConfig(env);
  const typeIds = new Set(TASKS.map((t) => t.id));
  const marks = new Set(cellMarks);
  const known = { types: typeIds, marks };

  /** Is this account's practice counted? See the top of the file. */
  function counted(u) {
    if (!cfg.on || !u || u.role !== "learner" || u.status !== "active") return false;
    if (!consentOk(u) || u.review || u.stats === false) return false;
    if (cfg.strict && u.stats !== true)
      return !!(u.consent && typeof u.consent.notice === "string" && u.consent.notice >= CALIBRATION_NOTICE);
    return true;
  }

  /** Has the teacher of this account's group switched the answer sample on? */
  async function sampled(u) {
    if (!cfg.samples || !counted(u)) return false;
    const g = (await store.groups())[groupOf(u)];
    return !!(g && g.samples === true);
  }

  /**
   * Count what one request brings. Returns how much of it was counted.
   * Two steps: the account's allowance for today is settled first (the only
   * place the account is named), and what it allows is then added to counts
   * that do not know whose it was.
   */
  async function accept(u, body, now = Date.now()) {
    if (!counted(u)) return { counted: 0, records: 0, samples: 0, collect: false };
    const events = cleanEvents(body && body.events, known);
    const wantSamples = (await sampled(u))
      ? (Array.isArray(body && body.samples) ? body.samples.slice(0, SAMPLE.perPost) : [])
        .map((s) => cleanSample(lex, s, typeIds)).filter(Boolean)
      : [];
    const day = dayOf(now);
    let grant = null;

    await store.updateCalibrationQuota((q0) => {
      const q = q0 && q0.day === day ? q0 : { day, by: {}, distinct: {} };
      const me = (q.by[u.id] ||= { posts: 0, q: 0, recs: 0, s: 0, u: {} });
      if (me.posts >= CAL.postsPerDay) { grant = "limit"; return q0 && q0.day === day ? null : q; }
      me.posts += 1;
      grant = { types: [], cells: [], distinct: {}, samples: [] };
      /* One more towards `unit`, if today's allowance for it has room. */
      const room = (unit, cap) => (me.u[unit] || 0) < cap;
      const take = (unit) => {
        if (!me.u[unit]) q.distinct[unit] = (q.distinct[unit] || 0) + 1;
        me.u[unit] = (me.u[unit] || 0) + 1;
        grant.distinct[unit] = q.distinct[unit];
      };
      for (const e of events) {
        if (me.q >= CAL.perDay) break;
        me.q += 1;
        const tKey = e.t + "|" + e.l;
        if (room("T:" + tKey, CAL.unitType)) { take("T:" + tKey); grant.types.push([tKey, e.ok]); }
        for (const [c, i, ok] of e.recs) {
          if (me.recs >= CAL.recsPerDay) break;
          if ((c && !room("C:" + c, CAL.unitCell)) || (i && !room("I:" + i, CAL.unitIrr))) continue;
          if (c) take("C:" + c);
          if (i) take("I:" + i);
          me.recs += 1;
          grant.cells.push([`${tKey}|${c}|${i}`, !!ok]);
        }
      }
      for (const s of wantSamples) {
        if (me.s >= SAMPLE.perDay) break;
        me.s += 1;
        grant.samples.push(s);
      }
      return q;
    });
    if (grant === "limit") return { limit: true };

    let records = 0;
    if (grant.types.length || grant.cells.length) {
      await store.updateCalibration((c0) => {
        const c = shape(c0);
        for (const [key, ok] of grant.types) add(c.counts.types, key, ok);
        let keys = Object.keys(c.counts.cells).length;
        for (const [key, ok] of grant.cells) {
          if (!(key in c.counts.cells)) { if (keys >= CAL.maxKeys) continue; keys += 1; }
          add(c.counts.cells, key, ok);
          records += 1;
        }
        for (const [unit, n] of Object.entries(grant.distinct))
          c.counts.distinct[unit] = Math.max(c.counts.distinct[unit] || 0, n);
        c.since.questions += grant.types.length;
        c.since.records += records;
        return c;
      });
    }
    if (grant.samples.length) await keepSamples(grant.samples, now);
    return { counted: grant.types.length, records, samples: grant.samples.length, collect: true };
  }

  /* The sample is a reservoir: once it is full, each new answer replaces a
     random old one with the probability that keeps every answer ever offered
     equally likely to be in it. A new entry goes in at a random place, so
     the file does not record the order answers arrived in — two answers
     side by side say nothing about having come from one pupil. */
  function keepSamples(list, now) {
    const mo = monthOf(now);
    const cut = new Date(now);
    cut.setUTCMonth(cut.getUTCMonth() - SAMPLE.months);
    const oldest = monthOf(cut);
    return store.updateSamples((s0) => {
      const s = { list: Array.isArray(s0 && s0.list) ? s0.list.filter((x) => x.mo >= oldest) : [],
        seen: (s0 && s0.seen) || 0 };
      for (const x of list) {
        s.seen += 1;
        const entry = { ...x, mo };
        if (s.list.length < SAMPLE.keep) s.list.splice(Math.floor(random() * (s.list.length + 1)), 0, entry);
        else if (random() < SAMPLE.keep / s.seen) s.list[Math.floor(random() * s.list.length)] = entry;
      }
      return s;
    });
  }

  /**
   * Work the table out again, if a period has passed since the last time
   * (or `force`). Returns the log entry of the run, or null when it was not
   * due. Safe to call often: it is what `GET /calibration` does first.
   */
  async function run(now = Date.now(), { force = false } = {}) {
    if (!cfg.on) return null;
    const cur = shape(await store.calibration());
    const period = CAL.periodDays * 86400000;
    if (!force && cur.lastRun && now - Date.parse(cur.lastRun) < period) return null;

    /* How many pupils the counts can have come from lately. Below
       CAL.minPupils nothing is adjusted: one child's results are not a
       measurement of the questions, and a published number would be theirs. */
    const since = dayOf(now - 2 * period);
    const pupils = (await store.users()).filter((u) => counted(u) && (u.lastSeen || "") >= since).length;

    let entry = null;
    await store.updateCalibration((c0) => {
      const c = shape(c0);
      if (!force && c.lastRun && now - Date.parse(c.lastRun) < period) return null;   // another request got there
      const at = new Date(now).toISOString();
      entry = { at, run: c.runs + 1, pupils, questions: c.since.questions, records: c.since.records, changes: [] };
      if (pupils >= CAL.minPupils) {
        const est = estimate(c.counts, { prev: c.table, cellHard: lex.cellHardness, typeIds, now });
        c.table = est.table;
        entry.changes = est.changes.slice(0, LOG_CHANGES);
        entry.slope = est.slope;
        /* A type whose place moved is measured afresh: what is built for it
           from now on is not what these answers were given to. */
        for (const key of est.reset) { delete c.counts.types[key]; delete c.counts.distinct["T:" + key]; }
      } else entry.note = "of fáir nemendur";
      c.counts.types = decayCounts(c.counts.types);
      c.counts.cells = decayCounts(c.counts.cells);
      c.lastRun = at;
      c.runs += 1;
      c.since = { questions: 0, records: 0 };
      c.log = [...c.log, entry].slice(-LOG_KEEP);
      return c;
    });
    if (entry && entry.changes.length)
      await audit("kerfi", "kvörðun", null, `${entry.changes.length} gildi breyttust`);
    return entry;
  }

  /** The table browsers apply, or null (none yet, or switched off). */
  async function table() {
    if (!cfg.on) return null;
    return shape(await store.calibration()).table;
  }

  /** Everything the administrator's page shows. Counts and patterns; nobody's name. */
  async function report(now = Date.now()) {
    const c = shape(await store.calibration());
    const s = await store.samples();
    const list = Array.isArray(s && s.list) ? s.list : [];
    const groups = await store.groups();
    const sum = (map) => Object.values(map).reduce((n, v) => n + (Array.isArray(v) ? v[1] : 0), 0);
    const next = c.lastRun ? new Date(Date.parse(c.lastRun) + CAL.periodDays * 86400000).toISOString() : null;
    return {
      on: cfg.on, strict: cfg.strict, samplesOn: cfg.samples,
      periodDays: CAL.periodDays, minPupils: CAL.minPupils,
      lastRun: c.lastRun, nextRun: next, due: !!next && Date.parse(next) <= now, runs: c.runs,
      table: c.table,
      totals: { questions: Math.round(sum(c.counts.types)), records: Math.round(sum(c.counts.cells)),
        keys: Object.keys(c.counts.cells).length, maxKeys: CAL.maxKeys },
      log: c.log.slice(-30).reverse(),
      classifier: {
        kept: list.length, cap: SAMPLE.keep, offered: (s && s.seen) || 0,
        groupsOn: Object.values(groups).filter((g) => g && g.samples === true).length,
        ...agreement(lex, list),
      },
    };
  }

  /** The sample in the format of tests/fixtures/wrong-answers.json. */
  async function fixture() {
    const s = await store.samples();
    return {
      v: 1,
      about: "Röng svör úr Fallaskóla, nafnlaus. Snið: src/js/core/classifiercheck.js. "
        + "Vistaðu sem tests/fixtures/wrong-answers.json til að prófa villugreininguna á þeim.",
      samples: (Array.isArray(s && s.list) ? s.list : []).map(({ mo, ...x }) => x),
    };
  }

  /**
   * The routes. Registered from server.mjs with its own helpers, so the
   * rules about who is logged in and who teaches which group stay there.
   */
  function routes({ on, json, readBody, needUser, needAdmin, needTeacher, sendFile }) {
    /* What the browser asks once per load: the table, and whether this
       account's answers are counted (it sends nothing if not). */
    on("GET", "/calibration", async (req, res) => {
      const u = await needUser(req, res);
      if (!u) return;
      await run().catch((e) => console.error("kvörðun:", e.message));
      return json(res, 200, {
        on: cfg.on, table: await table(),
        collect: counted(u), samples: await sampled(u),
        /* For *Aðgangurinn minn*: whether the switch is shown at all, the
           account's own choice (null: never made), and what applies while
           it is null. */
        canCount: cfg.on && u.role === "learner" && consentOk(u),
        choice: typeof u.stats === "boolean" ? u.stats : null,
        byDefault: counted({ ...u, stats: undefined, review: null }),
      });
    });

    on("POST", "/calibration/answers", async (req, res) => {
      const u = await needUser(req, res);
      if (!u) return;
      const body = await readBody(req, 64 * 1024);
      const out = await accept(u, body);
      if (out.limit) return json(res, 429, { error: "Nóg komið í dag." });
      return json(res, 200, { ok: true, ...out });
    });

    /* The account's own switch. Theirs to turn off, and on again. */
    on("POST", "/account/stats", async (req, res) => {
      const me = await needUser(req, res);
      if (!me) return;
      const want = (await readBody(req))?.on === true;
      let after = null;
      await store.updateUsers((users) => {
        const u = users.find((x) => x.id === me.id);
        if (!u) return null;
        u.stats = want; after = u;
        return users;
      });
      return json(res, 200, { ok: true, choice: want, collect: counted(after) });
    });

    /* Item 38: the sample of wrong answers is the teacher's decision, per
       group, and off until they make it. Audited: it is the one switch on
       this server that lets something a child typed be kept. */
    on("GET", "/teacher/samples", async (req, res, { url }) => {
      const t = await needTeacher(req, res, url.searchParams.get("group"));
      if (!t) return;
      const g = (await store.groups())[t.group];
      return json(res, 200, { group: { id: t.group, name: t.name },
        on: !!(g && g.samples === true), available: cfg.samples });
    });

    on("POST", "/teacher/samples", async (req, res) => {
      const body = await readBody(req);
      const t = await needTeacher(req, res, body && body.group);
      if (!t) return;
      if (!cfg.samples) return json(res, 409, { error: "Slökkt er á svarasýni á þessum þjóni." });
      const want = body.on === true;
      await store.updateGroups((g) => {
        g[t.group] = { ...(g[t.group] || { name: t.name }), samples: want };
        return g;
      });
      await audit(t.me.id, want ? "kveikti á svarasýni" : "slökkti á svarasýni", null, t.group);
      return json(res, 200, { ok: true, on: want });
    });

    on("GET", "/admin/calibration", async (req, res) => {
      if (!(await needAdmin(req, res, "canAdminUsers"))) return;
      return json(res, 200, await report());
    });

    on("GET", "/admin/classifier/samples.json", async (req, res) => {
      if (!(await needAdmin(req, res, "canAdminUsers"))) return;
      return sendFile(res, "wrong-answers.json", await fixture());
    });

    on("DELETE", "/admin/classifier/samples", async (req, res) => {
      const me = await needAdmin(req, res, "canAdminUsers");
      if (!me) return;
      await store.updateSamples(() => ({ list: [], seen: 0 }));
      await audit(me.id, "eyddi svarasýni");
      return json(res, 200, { ok: true });
    });
  }

  return { config: cfg, counted, sampled, accept, run, table, report, fixture, routes };
}
