// @ts-check
/* A server-graded question, from the first answer to the one settle
 * (issue #48; docs/adr/0002; core/answer.js "server-graded questions").
 *
 * `judge` stays pure: it says when the answer must be read on the server
 * (`pending: "server"`) and judges once the reading is back. This module is
 * the waiting in between, and nothing else — no DOM, no state written:
 *
 *   const q = serverQuestion(task, { read, pupil });
 *   await q.send({ text })     → the judgement to show:
 *        pending "revise"      the checklist and one follow-up question; the
 *                              pupil may send ONE revision, or `keep()`
 *        pending (other)       empty, or a revision that is the first answer
 *                              again: nothing used up, the pupil tries again
 *        not pending           FINAL. Settle it (core/answer.js `settle`):
 *                              `send` and `keep` give a final judgement once
 *                              and only once per question.
 *        null                  ignored: a reading is under way, or the
 *                              question is over (a double click, a late key)
 *   q.keep()                   in "revise": settle on the first reading
 *
 * ---- when the grader does not answer (owner's decision 4) ----------------
 * Every reading is tried twice: one automatic retry. If the second try fails
 * too, `judge` is handed the fault and the question ends as "not judged".
 * The caller then leaves server-graded types out for the rest of the visit
 * (core/servergrader.js `serverGraderLost`). The browser's own patience is
 * `READ_PATIENCE_MS` per try (`serverReader`), so the pupil waits at most
 * twice that, and is never stuck.
 *
 * `read(req)` is the transport: `{ kind, text, context }` → a Promise of
 * `{ findings }` or `{ fault }`. In the app it is `serverReader(app.server)`
 * (POST /grader/read); in tests the server's own reader with its fake plug
 * (server/reader.mjs, server/reader-fake.mjs). It may throw: that is a fault. */

import { judge } from "../core/answer.js";

/** @typedef {import("../types").Task} Task */
/** @typedef {import("../types").Judgement} Judgement */
/** @typedef {{ kind: string, text: string, context: any }} ReadRequest */
/** @typedef {{ findings?: any[], fault?: string }} Reading */
/** @typedef {(req: ReadRequest) => Promise<Reading>} Read */

/** How many times a text is sent before the question ends "not judged". */
export const READ_TRIES = 2;

/** How long the browser waits for one try. The server's reader has its own,
    shorter timeout (server/grading.mjs); this one is for a network that does
    not answer at all. */
export const READ_PATIENCE_MS = 20000;

/** One try, never throwing: anything but findings is a fault.
    @param {Read} read @param {ReadRequest} req @returns {Promise<Reading>} */
async function tryOnce(read, req) {
  try {
    const out = await read(req);
    if (out && typeof out === "object" && Array.isArray(out.findings)) return { findings: out.findings };
    return { fault: String((out && out.fault) || "failed") };
  } catch (e) {
    return { fault: String((e && /** @type {any} */ (e).fault) || "failed") };
  }
}

/**
 * Read a text, with one automatic retry. "off" (no such reader, or server
 * grading switched off for this pupil) is not retried: it will not change.
 * @param {Read} read @param {ReadRequest} req @returns {Promise<Reading>}
 */
export async function readWithRetry(read, req) {
  /** @type {Reading} */ let out = { fault: "failed" };
  for (let k = 0; k < READ_TRIES; k++) {
    out = await tryOnce(read, req);
    if (!out.fault || out.fault === "off") return out;
  }
  return out;
}

/**
 * The transport of the app: POST /grader/read through core/server.js, with
 * the browser's patience. A refusal carries its fault in the body.
 * @param {{ graderRead: (kind: string, text: string, context: any) => Promise<any> }} server
 * @returns {Read}
 */
export function serverReader(server, { patienceMs = READ_PATIENCE_MS } = {}) {
  return (req) => new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ fault: "timeout" }), patienceMs);
    server.graderRead(req.kind, req.text, req.context).then(
      (data) => resolve(data && Array.isArray(data.findings) ? { findings: data.findings } : { fault: "failed" }),
      (e) => resolve({ fault: String((e && e.data && e.data.fault) || "unavailable") }),
    ).finally(() => clearTimeout(timer));
  });
}

/** A transport for a program without a server: nothing can be read. */
export const noReader = /** @type {Read} */ (async () => ({ fault: "off" }));

/**
 * @param {Task} task  a server-graded task (core/answer.js `serverGraded`)
 * @param {{ read?: Read, pupil?: any, judgeFn?: typeof judge }} [opts]
 */
export function serverQuestion(task, { read = noReader, pupil = null, judgeFn = judge } = {}) {
  /** "answer" → "reading" → ("revise" → "reading" →) "done" */
  let phase = "answer";
  /** @type {?string} */ let first = null;
  /** @type {?Reading} */ let firstReading = null;

  return {
    get phase() { return phase; },

    /** The pupil sent an answer, or the revision.
        @param {Record<string, any>} response @returns {Promise<?Judgement>} */
    async send(response) {
      if (phase === "reading" || phase === "done") return null;
      const was = phase;
      const resp = { ...(response || {}) };
      delete resp.reading; delete resp.keep; delete resp.first;
      if (first != null) resp.first = first;
      const asked = judgeFn(task, resp, pupil);
      if (asked.pending !== "server") return asked.pending ? asked : end(asked);
      phase = "reading";
      const reading = await readWithRetry(read, asked.detail.read);
      const j = judgeFn(task, { ...resp, reading }, pupil);
      if (j.pending === "revise") {
        phase = "revise";
        first = String(resp.text ?? "");
        firstReading = reading;
        return j;
      }
      if (j.pending) { phase = was; return j; }
      return end(j);
    },

    /** The pupil keeps the first answer as it is. @returns {?Judgement} */
    keep() {
      if (phase !== "revise") return null;
      return end(judgeFn(task, { text: first, reading: firstReading, keep: true }, pupil));
    },
  };

  /** @param {Judgement} j */
  function end(j) { phase = "done"; return j; }
}
