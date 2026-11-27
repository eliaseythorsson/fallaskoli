/* The server's grader: a pupil's answer to a server-graded question, read
 * (issue #48; docs/adr/0002, 0003, 0004).
 *
 *   GET  /grader                          anybody logged in: { up } — is a
 *                                         grader here AND server grading on
 *                                         for me? The app asks once when it
 *                                         opens (core/servergrader.js).
 *   POST /grader/read { kind, text, context }
 *                                         → { findings }  or, refused,
 *                                         { fault, error } with a status
 *
 * The server READS; it does not judge. What comes back is the reader's
 * checked findings (server/reader.mjs: every quote is the pupil's own words)
 * and nothing else — no verdict, no XP. The browser judges them with the same
 * `judge` → `settle` as every other answer (core/answer.js).
 *
 * ---- who ----------------------------------------------------------------------
 * Only a pupil whose OWN ceiling has `serverGrading: true` — the
 * administrator's per-pupil switch, missing means off (docs/adr/0004;
 * server.mjs `ceilingFor` never lends it from the default). Everybody else is
 * refused with "off" before the text is looked at.
 *
 * ---- the pupil's own text (docs/adr/0003) --------------------------------------
 * The text is the pupil's own words, sent because they asked for it to be
 * read (they answered the question). It is handed to the reader and
 * FORGOTTEN: held for one request, written to no file and no log, kept
 * nowhere (the reader's own rule, and this file's). Nothing here reads or
 * writes anybody's progress. tests/grading-server.test.js holds both.
 *
 * ---- the readers ----------------------------------------------------------------
 * `plugs` are the text reader's plugs by kind (server/reader.mjs). On a real
 * server that is Claude (server/reader-claude.mjs, #37) for `or_eigin`, `or_setning`
 * and `or_tengsl` (#38; `or_skyring` is read as `or_eigin`), and
 * only when ANTHROPIC_API_KEY is set; without it `up` is false everywhere and
 * server-graded questions stay hidden. Tests hand in the fake plug
 * (server/reader-fake.mjs) or the Claude plug with recorded answers.
 * `namesFor(user)`: the names of the people the server knows around this
 * pupil, which a plug strips before sending (`context.names`). */

import { createReader } from "./reader.mjs";
import { serverGradingOn } from "../src/js/core/policy.js";

/** The limits of one read. */
export const GRADER = Object.freeze({
  maxChars: 1200,        // an answer is a sentence or a short paragraph
  maxBody: 8 * 1024,     // the text and the question's context
  perHour: 120,          // reads per account per hour (a retry is a read)
  timeoutMs: 15000,      // the reader's; the browser waits a little longer
  maxQueue: 4,
});

const HTTP = { off: 403, busy: 503, unavailable: 503, timeout: 504, failed: 502 };
const SAY = {
  off: "Þjónninn les ekki svör fyrir þig.",
  busy: "Margir eru að láta lesa yfir núna.",
  unavailable: "Yfirlestur er ekki í boði núna.",
  timeout: "Yfirlesturinn tók of langan tíma.",
  failed: "Ekki tókst að lesa svarið yfir.",
};

export function createGrading({ plugs = {}, ceilingFor, namesFor = async () => [], timeoutMs = GRADER.timeoutMs }) {
  const reader = createReader({ plugs, maxChars: GRADER.maxChars, maxQueue: GRADER.maxQueue, timeoutMs });
  const kinds = Object.keys(plugs);
  /* Per account, the reads of the last hour (in memory: a restart forgives). */
  const recent = new Map();
  const allowed = (id, now = Date.now()) => {
    const list = (recent.get(id) || []).filter((t) => now - t < 3600_000);
    if (list.length >= GRADER.perHour) { recent.set(id, list); return false; }
    list.push(now); recent.set(id, list);
    return true;
  };
  const onFor = async (u) => kinds.length > 0 && serverGradingOn(await ceilingFor(u.id), true);
  const refuse = (json, res, fault) => json(res, HTTP[fault] || 502, { fault, error: SAY[fault] || SAY.failed });

  function routes({ on, json, readBody, needUser }) {
    on("GET", "/grader", async (req, res) => {
      const u = await needUser(req, res);
      if (!u) return;
      return json(res, 200, { up: await onFor(u) });
    });

    on("POST", "/grader/read", async (req, res) => {
      const body = await readBody(req, GRADER.maxBody);
      const u = await needUser(req, res);
      if (!u) return;
      if (!(await onFor(u))) return refuse(json, res, "off");
      const kind = body && typeof body.kind === "string" ? body.kind : "";
      const text = body && typeof body.text === "string" ? body.text.trim() : "";
      const context = body && body.context && typeof body.context === "object" && !Array.isArray(body.context)
        ? body.context : null;
      if (!kinds.includes(kind)) return refuse(json, res, "off");
      if (!text || text.length > GRADER.maxChars) return refuse(json, res, "failed");
      if (!allowed(u.id)) return refuse(json, res, "busy");
      /* The names a plug strips before the text leaves the server (#37): the
         server's own list, never one the page sent. */
      const out = await reader.read(kind, text, { ...(context || {}), names: await namesFor(u) });
      /* A fault is answered by its code; nothing is logged, least of all the text. */
      if (out.fault) return refuse(json, res, out.fault);
      return json(res, 200, { findings: out.findings });
    });
  }

  return { routes, kinds };
}
