/* The text reader's fake plug (server/reader.mjs), for tests: it returns
 * prepared findings and never looks at a model or a worker.
 *
 *   fakePlug({ findings })            the same findings for every text
 *   fakePlug({ answer })              answer(text, { context, signal }) →
 *                                     { findings, ... } (or a Promise of it;
 *                                     one that never settles is a timeout)
 *   fakePlug({ unavailable: true })   its start fails: "unavailable"
 *
 * Like every plug it keeps nothing: no text is stored, written or logged. */

import { fault } from "./reader.mjs";

export function fakePlug({ findings = [], answer = null, unavailable = false } = {}) {
  return {
    async start() { if (unavailable) throw fault("unavailable"); },
    async read(text, opts = {}) {
      if (answer) return answer(text, opts);
      return { findings: findings.map((f) => (f && typeof f === "object" ? { ...f } : f)) };
    },
  };
}
