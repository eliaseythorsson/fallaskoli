/* The pupil's own sentences, read over by GreynirCorrect (v6.13, item 46).
 *
 * What the task is, its limits and topics: src/js/core/writing.js. This file
 * is the server's half — who may have a text checked, the checker itself and
 * what (if anything) is kept — apart from server.mjs, which lends it the
 * helpers (as classgoal.mjs and calibrate.mjs).
 *
 *   GET  /writing                     anybody logged in: is the check on for my
 *                                     group, is a text kept, is the checker up
 *   POST /writing/check  { text }     have one text read over → { annotations }
 *   GET  /teacher/writing?group=g     the group's switches, and the kept texts
 *                                     (only while keeping is on)
 *   POST /teacher/writing             { group, check, keep } — set them
 *
 * ---- the privacy decision ---------------------------------------------------
 * This is the first place the server receives what a child WROTE, in their
 * own words, so (docs/PRIVACY.md §1f, server/privacy.mjs):
 *   - OFF by default, for every group. The group's teacher switches the
 *     check on (`groups[g].writing.check`); until then POST /writing/check
 *     answers 403 and the app offers the task without checking.
 *   - The text is checked and FORGOTTEN: it is held in memory for the length
 *     of one request and handed to the worker over a pipe; it is written to
 *     no file and no log (an error is logged by its kind, never its text).
 *   - Only if the teacher ALSO switches on keeping (`writing.keep`) is the
 *     text stored, so that the teacher can read it: `writing.json`, with the
 *     pupil's id, the week and the topic; at most WRITING.keepPerPupil per
 *     pupil, none older than WRITING.keepDays, gone with the account, in the
 *     pupil's export, and ALL of the group's deleted the moment keeping (or
 *     the check) is switched off. The form says before sending whether the
 *     text will be kept.
 *
 * ---- the checker --------------------------------------------------------------
 * The text is read by the server's text reader (server/reader.mjs, #47) with
 * its GreynirCorrect plug (server/reader-greynir.mjs): ONE long-lived Python
 * worker (server/greynir_worker.py). The reader holds the limits for every
 * plug: a strict timeout per text (WRITING.timeoutMs; past it 504, and the
 * worker is killed and the next text starts a fresh one), at most `maxQueue`
 * texts in flight (past that 503 "busy"), the text's size, and that a remark
 * points at the pupil's own text. The body's size (WRITING.maxBody) and the
 * text's (WRITING.maxChars) are also checked here first, with Ritun's words.
 * A worker that cannot start leaves the check unavailable, and the app
 * offers the task without it.
 *
 * Configured by FALLASKOLI_WRITING_PYTHON (default `python3`),
 * FALLASKOLI_WRITING_WORKER (default this folder's greynir_worker.py),
 * FALLASKOLI_WRITING_TIMEOUT_MS, and FALLASKOLI_WRITING=off to switch the
 * whole feature off on this server (docs/SERVER.md). */

import crypto from "node:crypto";
import { WRITING, cleanText, cleanAnnotations, topicFor } from "../src/js/core/writing.js";
import { weekKey } from "../src/js/core/social.js";
import { createReader, fault } from "./reader.mjs";
import { greynirPlug } from "./reader-greynir.mjs";

/**
 * Ritun's checker: the text reader with the GreynirCorrect plug.
 * `read(text)` → { sentences, findings } | { fault } (server/reader.mjs);
 * `check(text)` is the same throwing: → { sentences, annotations }, or an
 * Error whose `code` is "off", "unavailable", "busy", "timeout" or "failed".
 */
export function createChecker({
  command, args, timeoutMs = WRITING.timeoutMs, startMs, maxQueue = 4, off = false,
} = {}) {
  const greynir = greynirPlug({ command, args, startMs, off });
  const reader = createReader({ plugs: { greynir }, maxChars: WRITING.maxChars, maxQueue, timeoutMs });
  const read = (text) => reader.read("greynir", text);
  return {
    /** "off" | "idle" | "starting" | "ready" | "failed" */
    get state() { return greynir.state; },
    warm: greynir.warm,
    available: greynir.available,
    stop: greynir.stop,
    read,
    async check(text) {
      const out = await read(text);
      if (out.fault) throw fault(out.fault);
      return { sentences: out.sentences, annotations: out.findings };
    },
  };
}

/** The checker as this server's environment configures it. */
export function checkerFromEnv(env = process.env) {
  const off = String(env.FALLASKOLI_WRITING || "").toLowerCase() === "off";
  const t = Number(env.FALLASKOLI_WRITING_TIMEOUT_MS);
  return createChecker({
    off,
    command: env.FALLASKOLI_WRITING_PYTHON || "python3",
    ...(env.FALLASKOLI_WRITING_WORKER ? { args: [env.FALLASKOLI_WRITING_WORKER] } : {}),
    timeoutMs: t > 0 ? Math.min(t, 60_000) : WRITING.timeoutMs,
  });
}

/* ---------- the switches and the kept texts ------------------------------------- */

/** A group's switches: both off unless set; keeping implies checking. */
export function switchesOf(rec) {
  const w = (rec && rec.writing) || {};
  const check = w.check === true;
  return { check, keep: check && w.keep === true };
}

/** The kept texts that may still be kept: younger than keepDays, the newest
    keepPerPupil per pupil. */
export function pruneKept(list, now = Date.now()) {
  const cut = now - WRITING.keepDays * 86400000;
  const fresh = (Array.isArray(list) ? list : []).filter((x) => x && Date.parse(x.at) >= cut);
  fresh.sort((a, b) => (a.at < b.at ? 1 : -1));
  const per = new Map();
  return fresh.filter((x) => {
    const n = (per.get(x.user) || 0) + 1;
    per.set(x.user, n);
    return n <= WRITING.keepPerPupil;
  });
}

export function createWriting({ store, groupOf, groupsNow, audit, env = process.env, checker = null }) {
  const ck = checker || checkerFromEnv(env);
  /* Per account, the checks of the last hour (in memory: a restart forgives). */
  const recent = new Map();
  const allowed = (id, now = Date.now()) => {
    const list = (recent.get(id) || []).filter((t) => now - t < 3600_000);
    if (list.length >= WRITING.perHour) { recent.set(id, list); return false; }
    list.push(now); recent.set(id, list);
    return true;
  };

  const switchesFor = async (group) => switchesOf((await groupsNow())[group]);

  async function keptOf(group, now = Date.now()) {
    const list = await store.updateWriting((cur) => {
      const kept = pruneKept(cur, now);
      return kept.length !== (cur || []).length ? kept : null;
    }) || pruneKept(await store.writing(), now);
    return list.filter((x) => x.group === group);
  }

  /** Delete every kept text of a group (keeping or checking switched off). */
  const dropGroup = (group) => store.updateWriting((cur) => {
    const rest = (cur || []).filter((x) => x.group !== group);
    return rest.length !== (cur || []).length ? rest : null;
  });

  function routes({ on, json, readBody, needUser, needTeacher }) {
    on("GET", "/writing", async (req, res) => {
      const u = await needUser(req, res);
      if (!u) return;
      const sw = await switchesFor(groupOf(u));
      /* Start the worker now, so the pupil's first check does not wait for it. */
      if (sw.check) ck.warm();
      return json(res, 200, { ...sw, available: sw.check ? ck.available() : false,
        week: weekKey(new Date()), limits: { maxChars: WRITING.maxChars, sentences: WRITING.sentences } });
    });

    on("POST", "/writing/check", async (req, res) => {
      /* The body first, and small: a text that is too long is refused before
         anything else is read or decided. */
      const body = await readBody(req, WRITING.maxBody);
      const u = await needUser(req, res);
      if (!u) return;
      const group = groupOf(u);
      const sw = await switchesFor(group);
      if (!sw.check) return json(res, 403, { off: true, error: "Kennari hópsins hefur ekki kveikt á yfirlestri." });
      const text = cleanText(body && body.text);
      if (!text) return json(res, 400, { error: "Það vantar textann." });
      if (text.length > WRITING.maxChars)
        return json(res, 413, { error: `Textinn má vera mest ${WRITING.maxChars} stafir.` });
      if (!allowed(u.id)) return json(res, 429, { error: "Of margir yfirlestrar í bili. Reyndu aftur eftir smástund." });
      const out = await ck.read(text);
      if (out.fault) {
        const code = out.fault;
        if (code === "timeout") return json(res, 504, { error: "Yfirlesturinn tók of langan tíma. Reyndu aftur, eða styttu textann." });
        if (code === "busy") return json(res, 503, { busy: true, error: "Margir eru að láta lesa yfir núna. Reyndu aftur eftir smástund." });
        /* Logged by its kind only: never the text. */
        console.error("yfirlestur:", code || "villa");
        return json(res, 503, { unavailable: true, error: "Yfirlestur er ekki í boði á þessum þjóni núna." });
      }
      const annotations = cleanAnnotations(out.findings, text);
      let kept = false;
      if (sw.keep) {
        const week = weekKey(new Date());
        await store.updateWriting((cur) => pruneKept([...(cur || []), {
          id: crypto.randomBytes(9).toString("base64url"), user: u.id, group, week,
          topic: topicFor(week), text, n: annotations.length, at: new Date().toISOString(),
        }]));
        kept = true;
      }
      return json(res, 200, { sentences: out.sentences, annotations, kept });
    });

    on("GET", "/teacher/writing", async (req, res, { url }) => {
      const t = await needTeacher(req, res, url.searchParams.get("group"));
      if (!t) return;
      const sw = await switchesFor(t.group);
      if (sw.check) ck.warm();
      let texts = [];
      if (sw.keep) {
        /* Only pupils who are in the group NOW: a pupil moved to another
           class is not read by the old one's teacher. */
        const names = new Map((await store.users()).filter((x) => groupOf(x) === t.group)
          .map((x) => [x.id, x.name || x.username]));
        /* The week and the topic, never the time it was sent (`at` is kept
           only to prune by age): the notice promises the teacher does not
           see when a pupil practises, and the week is all the card shows. */
        texts = (await keptOf(t.group)).filter((x) => names.has(x.user))
          .map((x) => ({ id: x.id, name: names.get(x.user),
            week: x.week, topic: x.topic, text: x.text, n: x.n }));
      }
      return json(res, 200, { group: { id: t.group, name: t.name }, ...sw,
        available: sw.check ? ck.available() : (ck.state === "off" ? false : null), texts,
        limits: { keepDays: WRITING.keepDays, keepPerPupil: WRITING.keepPerPupil } });
    });

    on("POST", "/teacher/writing", async (req, res) => {
      const body = await readBody(req, 1024);
      const t = await needTeacher(req, res, body && body.group);
      if (!t) return;
      if (typeof (body && body.check) !== "boolean" || (body.keep !== undefined && typeof body.keep !== "boolean"))
        return json(res, 400, { error: "Segðu hvort á að kveikja eða slökkva." });
      const next = { check: body.check, keep: body.check && body.keep === true };
      await store.updateGroups((g) => {
        const rec = g[t.group] || { name: t.name };
        if (next.check) rec.writing = next; else delete rec.writing;
        g[t.group] = rec;
        return g;
      });
      /* Keeping off means gone: nothing kept stays behind the switch. */
      if (!next.keep) await dropGroup(t.group);
      await audit(t.me.id, "stillti yfirlestur texta", null,
        `${t.group}: yfirlestur ${next.check ? "á" : "af"}, geymt ${next.keep ? "já" : "nei"}`);
      if (next.check) ck.warm();
      return json(res, 200, { ok: true, ...next });
    });
  }

  /** The retention sweep's call (server.mjs `sweep`): kept texts past their days. */
  const prune = (now = Date.now()) => store.updateWriting((cur) => {
    const kept = pruneKept(cur, now);
    return kept.length !== (cur || []).length ? kept : null;
  });

  return { routes, checker: ck, dropGroup, prune };
}
