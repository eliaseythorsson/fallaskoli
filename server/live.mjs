/* A live class round (critique item 64), on the server.
 *
 * The rules — the questions, the score, the error tally, what each screen is
 * sent — are in src/js/core/live.js, shared with the browser. This file holds
 * the rounds that are running and moves them on: who may start one, who may
 * join, the clock, the answers, and the event streams the screens listen to.
 *
 * IN MEMORY, AND ONLY THERE. A round lasts a lesson. Nothing of it is written
 * to disk: not the answers (graded and dropped, as a duel's), not the board.
 * A restart ends every round — the teacher starts a new one — and a finished
 * round is forgotten `LIVE.keepMs` after its end. What a pupil keeps is in
 * their own state, written by their own browser as any practice question is.
 *
 * SERVER-SENT EVENTS. Each screen opens one `EventSource` (GET …/events) and
 * is sent the whole picture it may see — `boardView` or `pupilView` — every
 * time anything changes. A whole picture, never a difference, so a screen
 * that reconnects (a tablet waking up, a reload, a pupil who joins late, a
 * proxy that dropped the line) is right again with the first message. SSE is
 * plain HTTP on this origin: the strict CSP (`connect-src 'self'`) allows it,
 * and no package is needed (rule 1 of server.mjs).
 *
 * THE CLOCK IS THE SERVER'S. A question opens at `opened` and takes answers
 * until `closes` + `LIVE.grace` (the network between a tablet and the
 * server). The screens draw a countdown from `left`; what counts is here.
 * Every change of phase that time causes happens in `tick`, which a timer
 * calls — and a test calls with a clock of its own.
 *
 * BOUNDED. At most `maxRounds` rounds, `maxPupils` pupils in one, `maxStreams`
 * open streams in all and `perUser` per pupil per round; a round nobody
 * starts, one the teacher has left and one that has lasted a double lesson
 * are ended; a finished one is dropped. Questions are ~2 KB each.
 */

import crypto from "node:crypto";
import { LIVE, validSize, validSecs, roundScope, roundLevel, roundTasks, pointsFor, notePatterns,
         boardView, pupilView } from "../src/js/core/live.js";
import { cleanTarget } from "../src/js/core/assignment.js";
import { cleanResponse, ANSWER_LIMITS } from "../src/js/core/duel.js";

/**
 * @param o.store      server/store.mjs
 * @param o.lexFor     () → the lexicon duels are built from (the filtered one)
 * @param o.deps       the builders, as core/duel.js `duelTasks` takes them
 * @param o.judge      core/answer.js `judge`
 * @param o.groupOf    user → group id
 * @param o.shownOf    async user → may this user's nickname be shown to the
 *                     class (on the leaderboard, not hidden, not held)?
 * @param o.ceiling    async () → the server's default curriculum ceiling
 * @param o.audit      (by, act, target, note) → the audit trail
 * @param o.clock      { now() } — for the tests; Date.now otherwise
 * @param o.limits     overrides of LIVE — for the tests
 */
export function createLive(o) {
  const { store, lexFor, deps, judge, groupOf, shownOf, ceiling, audit } = o;
  const now = () => (o.clock ? o.clock.now() : Date.now());
  const L = { ...LIVE, ...(o.limits || {}) };
  const rounds = new Map();         // id → round
  let open = 0;                     // event streams, over every round

  /* ---------- the streams ---------- */

  const write = (res, event, data) => {
    try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch { /* gone */ }
  };
  const viewFor = (s, r) => (s.role === "board" ? boardView(r, now()) : pupilView(r, s.uid, now()));
  const push = (s, r) => write(s.res, "state", viewFor(s, r));

  /** Everybody sees the change, and the timer follows the phase. */
  function changed(r) {
    for (const s of r.streams) push(s, r);
    schedule(r);
  }

  function schedule(r) {
    clearTimeout(r.timer);
    r.timer = null;
    if (r.phase !== "open") return;
    r.timer = setTimeout(tick, Math.max(0, r.closes + L.grace - now()) + 20);
    if (r.timer.unref) r.timer.unref();
  }

  /* ---------- the phases ---------- */

  function openQuestion(r, q) {
    r.phase = "open";
    r.q = q;
    r.opened = now();
    r.closes = r.opened + r.secs * 1000;
    r.perQ[q] = { right: 0, wrong: 0 };
    changed(r);
  }

  function closeQuestion(r) {
    if (r.phase !== "open") return;
    /* Nobody answers it after this: no answer is a wrong answer, and null
       says it was not answered (`undefined` while it was open). */
    for (const p of r.players.values()) if (p.marks[r.q] === undefined) p.marks[r.q] = null;
    r.phase = "shown";
    changed(r);
  }

  function endRound(r, why = "") {
    if (r.phase === "done") return;
    if (r.phase === "open") closeQuestion(r);
    /* A question the teacher did not open was not asked: the end shows the
       questions there were. */
    r.phase = "done";
    r.why = why;
    r.ended = now();
    changed(r);
  }

  function drop(r) {
    clearTimeout(r.timer);
    for (const s of r.streams) { write(s.res, "end", { id: r.id }); try { s.res.end(); } catch { /* gone */ } }
    rounds.delete(r.id);
  }

  /** Move every round on by the clock: close a question whose time is up,
      end a round nobody started, one the teacher left and one that has
      lasted too long, and forget one that ended a while ago. */
  function tick() {
    const t = now();
    for (const r of [...rounds.values()]) {
      if (r.phase === "open" && t >= r.closes + L.grace) closeQuestion(r);
      if (r.phase === "lobby" && t - r.created > L.lobbyMs) endRound(r, "lobby");
      else if (r.phase !== "done" && t - r.touched > L.idleMs) endRound(r, "idle");
      else if (r.phase !== "done" && t - r.created > L.maxMs) endRound(r, "max");
      if (r.phase === "done" && t - r.ended > L.keepMs) drop(r);
    }
  }
  const sweeper = setInterval(tick, 15000);
  if (sweeper.unref) sweeper.unref();

  /** When every pupil who is still connected has answered, the question
      closes: nobody waits for a clock that has nothing left to wait for. A
      pupil who closed the tab is not waited for either. */
  function allIn(r) {
    if (r.phase !== "open") return;
    const here = new Set([...r.streams].filter((s) => s.role === "pupil").map((s) => s.uid));
    const ps = [...r.players.values()];
    if (!ps.some((p) => p.marks[r.q] !== undefined)) return;
    if (ps.every((p) => p.marks[r.q] !== undefined || !here.has(p.id))) closeQuestion(r);
  }

  /** The round of a group that is running or has just ended, or null. */
  const roundOfGroup = (group) => [...rounds.values()].find((r) => r.group === group) || null;

  /* ---------- the routes ---------- */

  function routes({ on, json, readBody, needUser, needTeacher, securityHeaders }) {

    /** An event stream on this request, for `role` ("board" | "pupil"). */
    function stream(req, res, r, role, uid) {
      if (open >= L.maxStreams) return json(res, 503, { error: "Of margir tengdir í augnablikinu. Reyndu aftur eftir smástund." });
      if (role === "pupil" && [...r.streams].filter((s) => s.uid === uid).length >= L.perUser)
        return json(res, 429, { error: "Umferðin er þegar opin í of mörgum gluggum hjá þér." });
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store",
        /* nginx would otherwise hold the events back to fill a buffer. */
        "X-Accel-Buffering": "no",
        ...securityHeaders(req),
      });
      /* How long a browser waits before it reconnects. */
      res.write("retry: 2000\n\n");
      const s = { res, role, uid };
      r.streams.add(s); open++;
      push(s, r);
      /* A comment line now and then keeps proxies from closing a quiet line. */
      const ping = setInterval(() => { try { res.write(": \n\n"); } catch { /* gone */ } }, 20000);
      if (ping.unref) ping.unref();
      req.on("close", () => {
        clearInterval(ping);
        if (r.streams.delete(s)) open--;
        if (role === "pupil") allIn(r);
      });
    }

    /** The round `id`, after the one check on who may run it: a teacher of
        the round's group. Answers the request itself if not. */
    async function teacherRound(req, res, id) {
      const r = rounds.get(id);
      const t = await needTeacher(req, res, r ? r.group : null);
      if (!t) return null;
      if (!r) { json(res, 404, { error: "Umferðin er ekki til lengur." }); return null; }
      return { t, r };
    }

    /** The round `id` for a pupil: a learner of its group. */
    async function pupilRound(req, res, id) {
      const u = await needUser(req, res);
      if (!u) return null;
      const r = rounds.get(id);
      if (!r || u.role !== "learner" || groupOf(u) !== r.group) {
        json(res, 404, { error: "Umferðin er ekki til." }); return null;
      }
      return { u, r };
    }

    /* --- the teacher --- */

    on("GET", "/teacher/live", async (req, res, { url }) => {
      const t = await needTeacher(req, res, url.searchParams.get("group"));
      if (!t) return;
      tick();
      const r = roundOfGroup(t.group);
      return json(res, 200, { round: r ? boardView(r, now()) : null,
        limits: { sizes: L.sizes, n: L.n, secs: L.secs, defSecs: L.defSecs } });
    });

    on("POST", "/teacher/live", async (req, res) => {
      const body = await readBody(req, 4096);
      const t = await needTeacher(req, res, body?.group);
      if (!t) return;
      const target = cleanTarget(body?.target);
      if (!target) return json(res, 400, { error: "Veldu efni umferðarinnar." });
      const n = Number(body?.n ?? L.n), secs = Number(body?.secs ?? L.defSecs);
      if (!validSize(n)) return json(res, 400, { error: `Fjöldi spurninga: ${L.sizes.join(", ")}.` });
      if (!validSecs(secs)) return json(res, 400, { error: `Tími á spurningu: ${L.secs.join(", ")} sekúndur.` });
      tick();
      const old = roundOfGroup(t.group);
      if (old && old.phase !== "done" && body?.replace !== true) {
        return json(res, 409, { error: "Hópurinn er þegar með umferð í gangi.", running: old.id });
      }
      if (!old && rounds.size >= L.maxRounds) {
        return json(res, 503, { error: "Of margar umferðir eru í gangi á þjóninum. Reyndu aftur eftir smástund." });
      }
      /* The questions, built now: a material with nothing to ask is said at
         once, not after the class has joined. At the class's level — the
         mean of every pupil of the group — and within the server's default
         ceiling. Everybody gets the same questions (core/live.js). */
      const scope = roundScope(target);
      const learners = (await store.users()).filter((u) =>
        u.role === "learner" && u.status === "active" && groupOf(u) === t.group);
      const states = [];
      for (const u of learners) { const rec = await store.stateRec(u.id); states.push(rec ? rec.state : null); }
      const level = roundLevel(states, scope.skills);
      const seed = crypto.randomBytes(4).readUInt32BE(0);
      const allowed = await ceiling();
      const tasks = roundTasks(lexFor(), { seed, n, level, skills: scope.skills, types: scope.types, allowed }, deps);
      if (!tasks.length) return json(res, 400, { error: "Það tókst ekki að búa til spurningar úr þessu efni. Veldu annað." });
      if (old) drop(old);
      const r = {
        id: crypto.randomBytes(9).toString("base64url"), group: t.group, by: t.me.id,
        target, n: tasks.length, secs, seed, level, tasks,
        phase: "lobby", q: -1, opened: 0, closes: 0,
        players: new Map(), k: 0, perQ: [], tally: {},
        created: now(), touched: now(), ended: 0, why: "",
        streams: new Set(), timer: null,
      };
      rounds.set(r.id, r);
      await audit(t.me.id, "hóf lifandi umferð", null, `${t.group}: ${target.kind} ${target.id}`);
      return json(res, 200, { ok: true, round: boardView(r, now()) });
    });

    /* The next question: the first from the lobby, the next after a result.
       After the last, the round ends. */
    on("POST", /^\/teacher\/live\/([A-Za-z0-9_-]{6,40})\/next$/, async (req, res, { params }) => {
      const x = await teacherRound(req, res, params[0]);
      if (!x) return;
      const { r } = x;
      r.touched = now();
      if (r.phase === "open") return json(res, 409, { error: "Spurningin er enn opin." });
      if (r.phase === "done") return json(res, 409, { error: "Umferðinni er lokið." });
      const q = r.phase === "lobby" ? 0 : r.q + 1;
      if (q >= r.n) endRound(r);
      else openQuestion(r, q);
      return json(res, 200, { ok: true, round: boardView(r, now()) });
    });

    /* Close the question now, before the clock runs out. */
    on("POST", /^\/teacher\/live\/([A-Za-z0-9_-]{6,40})\/close$/, async (req, res, { params }) => {
      const x = await teacherRound(req, res, params[0]);
      if (!x) return;
      x.r.touched = now();
      if (x.r.phase !== "open") return json(res, 409, { error: "Engin spurning er opin." });
      closeQuestion(x.r);
      return json(res, 200, { ok: true, round: boardView(x.r, now()) });
    });

    on("POST", /^\/teacher\/live\/([A-Za-z0-9_-]{6,40})\/end$/, async (req, res, { params }) => {
      const x = await teacherRound(req, res, params[0]);
      if (!x) return;
      x.r.touched = now();
      endRound(x.r, x.r.phase === "lobby" ? "lobby" : "");
      return json(res, 200, { ok: true, round: boardView(x.r, now()) });
    });

    on("GET", /^\/teacher\/live\/([A-Za-z0-9_-]{6,40})\/events$/, async (req, res, { params }) => {
      const x = await teacherRound(req, res, params[0]);
      if (!x) return;
      x.r.touched = now();
      stream(req, res, x.r, "board", x.t.me.id);
    });

    /* --- the pupil --- */

    /** The round of my group, if there is one. Only a learner plays. */
    on("GET", "/live", async (req, res) => {
      const u = await needUser(req, res);
      if (!u) return;
      tick();
      const r = u.role === "learner" ? roundOfGroup(groupOf(u)) : null;
      return json(res, 200, { round: r ? pupilView(r, u.id, now()) : null });
    });

    on("POST", /^\/live\/([A-Za-z0-9_-]{6,40})\/join$/, async (req, res, { params }) => {
      const x = await pupilRound(req, res, params[0]);
      if (!x) return;
      const { u, r } = x;
      if (r.phase === "done") return json(res, 409, { error: "Umferðinni er lokið." });
      if (!r.players.has(u.id)) {
        if (r.players.size >= L.maxPupils) return json(res, 409, { error: "Umferðin er full." });
        /* A pupil who joins late starts with nothing for the questions they
           missed, and plays the rest. */
        r.players.set(u.id, { id: u.id, name: u.name || u.username, shown: !!(await shownOf(u)),
          k: ++r.k, right: 0, points: 0, marks: [] });
        changed(r);
      }
      return json(res, 200, { ok: true, round: pupilView(r, u.id, now()) });
    });

    on("GET", /^\/live\/([A-Za-z0-9_-]{6,40})\/events$/, async (req, res, { params }) => {
      const x = await pupilRound(req, res, params[0]);
      if (!x) return;
      stream(req, res, x.r, "pupil", x.u.id);
    });

    /* One answer: `{ q, response }`. Graded here with the same `judge` the
       browser uses, against the question the server built; the response is
       dropped once graded. Once per question, and only while it is open. */
    on("POST", /^\/live\/([A-Za-z0-9_-]{6,40})\/answer$/, async (req, res, { params }) => {
      const body = await readBody(req, ANSWER_LIMITS.bytes + 1024);
      const x = await pupilRound(req, res, params[0]);
      if (!x) return;
      const { u, r } = x;
      const p = r.players.get(u.id);
      if (!p) return json(res, 403, { error: "Þú ert ekki með í umferðinni." });
      const t = now();
      if (r.phase !== "open" || Number(body?.q) !== r.q || t > r.closes + L.grace)
        return json(res, 409, { error: "Tíminn fyrir þessa spurningu er liðinn." });
      if (p.marks[r.q] !== undefined) return json(res, 409, { error: "Þú hefur þegar svarað þessari spurningu." });
      const task = r.tasks[r.q];
      const resp = cleanResponse(body?.response);
      let ok = false, findings = [];
      if (resp) {
        try {
          const j = judge(task, resp);
          ok = !!j && !j.pending && j.ok === true;
          if (!ok && j && !j.pending) findings = j.findings || [];
        } catch { ok = false; }
      }
      const points = pointsFor(ok, t - r.opened, r.secs, !!(resp && resp.hinted === true));
      p.marks[r.q] = { ok, points };
      if (ok) p.right++;
      p.points += points;
      r.perQ[r.q][ok ? "right" : "wrong"]++;
      if (!ok) notePatterns(r.tally, u.id, findings);
      changed(r);
      allIn(r);
      /* Not whether it was right: that is for when the question closes, on
         every screen at once. */
      return json(res, 200, { ok: true });
    });
  }

  /** Close every stream and timer (the server is stopping). */
  function stop() {
    clearInterval(sweeper);
    for (const r of [...rounds.values()]) drop(r);
  }

  return { routes, tick, stop, rounds, streams: () => open };
}
