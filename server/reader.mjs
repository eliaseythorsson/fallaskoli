/* The text reader: the server reading a pupil's own text (issue #47).
 *
 * The server reads what a pupil wrote with more than one reader — today
 * GreynirCorrect for Ritun vikunnar (server/writing.mjs), later Claude (#37).
 * Every reader answers the same way: FINDINGS, each pointing at a piece of
 * the pupil's text. And every reader needs the same safety. So there is one
 * socket, this file, and the readers are plugs in it:
 *
 *   const reader = createReader({ plugs: { greynir }, maxChars, maxQueue, timeoutMs });
 *   await reader.read(kind, text, context)
 *     → { findings, ...what the plug adds (Greynir: sentences) }
 *     | { fault }   "off" | "unavailable" | "busy" | "timeout" | "failed"
 *
 * Never throws: a fault is an answer, and the caller says it to the pupil.
 * Who may have a text read at all (Ritun: the group's teacher switches) is
 * the caller's business, not the reader's.
 *
 * ---- written once here, for every plug --------------------------------------
 *   - the size limit: a text that is empty, not a string or longer than
 *     `maxChars` is not handed to any plug ("failed"; the caller refuses
 *     such a text itself first, with its own words);
 *   - the queue limit: at most `maxQueue` texts per plug at once, counted from
 *     the moment a text arrives; past that "busy", never a queue for ever;
 *   - the timeout: `timeoutMs` per text, counted once the plug is up (its
 *     start, e.g. loading GreynirCorrect, is the plug's own affair). Past it
 *     the answer is "timeout" and the plug's `signal` is aborted, so the plug
 *     can drop the work (Greynir kills its worker);
 *   - FORGET THE TEXT: the text lives in memory for one call and is handed to
 *     the plug; this file writes it to no file and no log, keeps no
 *     reference to it, and logs nothing at all (a caller logs a fault by its
 *     code). A plug must do the same;
 *   - the QUOTE CHECK: a finding names its piece of the text by `quote` (the
 *     words themselves) and/or `start`, `end` ([start, end) in the text).
 *       · a `quote` that is not in the text is invented: the finding is
 *         DROPPED. One that is in the text, at another place than its range
 *         says, is given the range where it is;
 *       · a range without a quote that does not lie inside the text points at
 *         nothing: the finding is kept as a remark on the whole text
 *         (start = end = null), as Ritun has always shown GreynirCorrect's.
 *     So every finding that reaches a pupil points at their own words.
 *
 * ---- a plug -----------------------------------------------------------------------
 * An object with
 *   read(text, { context, signal }) → Promise<{ findings: object[], ... }>
 *   start()?  → Promise   getting ready (not counted in the timeout)
 * that throws (rejects with) an Error whose `code` is one of the faults;
 * anything else counts as "failed". What else a plug offers its caller
 * (Greynir: state, warm, available, stop) is between the two of them.
 *   server/reader-greynir.mjs   GreynirCorrect, the long-lived Python worker
 *   server/reader-fake.mjs      prepared findings, for tests
 *
 * ---- deliberately small (owner's decision 4, #47) ---------------------------------
 * No framework for many providers, no registry, no settings nobody asked for.
 * Few pupils will ever have Claude reading their text, so this must stay easy
 * to read and easy to delete: removing a plug is removing its one file (and
 * the line that hands it in). */

export const FAULTS = Object.freeze(["off", "unavailable", "busy", "timeout", "failed"]);

/** An Error carrying a fault's code: what a plug throws. */
export const fault = (code) => Object.assign(new Error(code), { code });

const codeOf = (e, otherwise) => (e && FAULTS.includes(e.code) ? e.code : otherwise);

/**
 * @param {{ plugs: Record<string, object>, maxChars: number, maxQueue?: number, timeoutMs: number }} opts
 */
export function createReader({ plugs, maxChars, maxQueue = 4, timeoutMs }) {
  const inflight = new Map();     // kind -> texts being read now

  async function read(kind, text, context = null) {
    const plug = Object.hasOwn(plugs, kind) ? plugs[kind] : null;
    if (!plug) return { fault: "off" };
    if (typeof text !== "string" || !text || text.length > maxChars) return { fault: "failed" };
    const n = inflight.get(kind) || 0;
    if (n >= maxQueue) return { fault: "busy" };
    inflight.set(kind, n + 1);
    try { return await readOne(plug, text, context); }
    finally { inflight.set(kind, inflight.get(kind) - 1); }
  }

  async function readOne(plug, text, context) {
    if (plug.start) {
      try { await plug.start(); } catch (e) { return { fault: codeOf(e, "unavailable") }; }
    }
    const ac = new AbortController();
    let timer;
    const late = new Promise((resolve) => {
      timer = setTimeout(() => { resolve(null); ac.abort(); }, timeoutMs);
      timer.unref?.();
    });
    let out;
    try {
      out = await Promise.race([(async () => plug.read(text, { context, signal: ac.signal }))(), late]);
    } catch (e) {
      return { fault: codeOf(e, "failed") };
    } finally { clearTimeout(timer); }
    if (out === null) return { fault: "timeout" };
    if (!out || typeof out !== "object" || !Array.isArray(out.findings)) return { fault: "failed" };
    return { ...out, findings: checkQuotes(out.findings, text) };
  }

  return { read };
}

/** The quote check (see the header): every finding kept points at the text. */
export function checkQuotes(findings, text) {
  const out = [];
  for (const f of findings) {
    if (!f || typeof f !== "object") continue;
    const ranged = Number.isInteger(f.start) && Number.isInteger(f.end)
      && f.start >= 0 && f.end <= text.length && f.end > f.start;
    if (f.quote !== undefined) {
      if (typeof f.quote !== "string" || !f.quote) continue;
      if (ranged && text.slice(f.start, f.end) === f.quote) { out.push(f); continue; }
      const at = text.indexOf(f.quote);
      if (at < 0) continue;                       // invented: dropped
      out.push({ ...f, start: at, end: at + f.quote.length });
    } else if (ranged || (f.start == null && f.end == null)) {
      out.push(f);
    } else {
      out.push({ ...f, start: null, end: null });
    }
  }
  return out;
}
