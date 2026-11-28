/* The text reader's Claude plug (issue #37; server/reader.mjs).
 *
 * Claude reads a pupil's answer against a RUBRIC and says, point by point,
 * whether the point is there, quoting the pupil's words. That is all it is
 * asked for: no mark, no opinion, no rewrite, no text for the pupil. The
 * checklist and the one follow-up question the pupil sees are our own words
 * (the task's rubric, core/answer.js); right/wrong and XP are decided in the
 * browser by `judge` (docs/adr/0002).
 *
 * What is the reader's, and NOT done here (server/reader.mjs): the size and
 * queue limits, the timeout (its `signal` aborts the request), the quote
 * check, and forgetting the text. This file only adds what is Claude's:
 *
 *   - NAMES ARE STRIPPED before anything is sent (`stripNames`): every name
 *     of an account the server knows in the pupil's group, and every word
 *     with a capital letter that does not begin a sentence, becomes
 *     [nafn1], [nafn2] … A quote that holds a placeholder is given its name
 *     back on the way in, so the quote check still finds it in the text.
 *   - THE ARRANGEMENT: no training, no retention. The API's commercial terms
 *     do not train on what is sent; zero data retention is an arrangement
 *     the owner makes with Anthropic for the organisation the key belongs to
 *     (docs/PRIVACY.md §1h says how). Nothing in a request can ask for it.
 *     Claude Fable 5.2 is a model that needs 30-day retention and cannot be
 *     used under zero retention at all: it is a setting for comparing, not
 *     for pupils, unless the owner accepts that.
 *   - THE COST of every call, anonymously (`log`): the day, the model, the
 *     tokens and the price in dollars. No account, no group, no text.
 *   - THE MODEL: Opus 5.5 at low effort by default; Fable 5.2 as a setting
 *     (issue #41 chooses). `claudeConfig(env)`.
 *
 * The API key is a server secret (`fly secrets set ANTHROPIC_API_KEY=…`).
 * Nothing calls Claude from the browser, and nothing here runs in CI: the
 * tests hand in a `fetch` that answers with RECORDED responses
 * (tests/fixtures/claude/, tools/record-grading.mjs).
 *
 * The Messages API is called with plain `fetch` (no SDK: one request, one
 * shape). The answer is asked for as JSON in a fixed schema (structured
 * outputs, `output_config.format`). */

import { appendFile } from "node:fs/promises";
import { fault } from "./reader.mjs";

export const API_URL = "https://api.anthropic.com/v1/messages";
export const API_VERSION = "2026-10-21";

/** The models the owner can choose, and their price in US dollars per
    million tokens (input, output), for the cost log. */
export const MODELS = Object.freeze({
  opus: { id: "claude-opus-5-5", in: 4, out: 20 },
  fable: { id: "claude-fable-5-2", in: 8, out: 40 },
});
const EFFORTS = ["low", "medium", "high"];

/**
 * The plug's settings from the environment, or null when no key is set
 * (then no question type is server-graded on this server).
 *   ANTHROPIC_API_KEY           the key (a secret)
 *   FALLASKOLI_CLAUDE_MODEL     "opus" (default) or "fable"
 *   FALLASKOLI_CLAUDE_EFFORT    "low" (default), "medium" or "high"
 */
export function claudeConfig(env) {
  const apiKey = env && typeof env.ANTHROPIC_API_KEY === "string" ? env.ANTHROPIC_API_KEY.trim() : "";
  if (!apiKey) return null;
  const model = Object.hasOwn(MODELS, env.FALLASKOLI_CLAUDE_MODEL) ? env.FALLASKOLI_CLAUDE_MODEL : "opus";
  const effort = EFFORTS.includes(env.FALLASKOLI_CLAUDE_EFFORT) ? env.FALLASKOLI_CLAUDE_EFFORT : "low";
  return { apiKey, model, effort };
}

/* ---------- names ---------------------------------------------------------- */

const WORD = /\p{L}+/gu;

/**
 * The text with every name in it replaced: the words of `names` (any case,
 * with up to three letters of ending: *Jón*, *Jóni*, *Jóns*) and every word
 * with a capital letter that does not begin a sentence — except the words
 * of `keep` (and their endings). `back(s)` gives a quote its names again.
 * @param {string} text @param {string[]} [names] @param {string[]} [keep]
 */
export function stripNames(text, names = [], keep = []) {
  /* A name and its stem without the last letter (*jonni*, *jonn-a*); an
     ending that changes a vowel inside (*Anna*, *Önnu*) is not followed. */
  const stems = (list) => {
    const set = new Set();
    for (const n of list || []) for (const w of String(n).toLowerCase().match(WORD) || []) {
      if (w.length >= 3) set.add(w);
      if (w.length >= 4) set.add(w.slice(0, -1));
    }
    return (w) => {
      const l = w.toLowerCase();
      for (let k = 0; k <= 3 && k < l.length; k++) if (set.has(l.slice(0, l.length - k))) return true;
      return false;
    };
  };
  const isKnown = stems(names);
  /* `keep` (#39): the names of a text everybody reads — the story's
     characters, *Jón og Sara* — are not the pupil's, and the model needs
     them to see whether a summary follows the story. */
  const isKept = stems(keep);
  const place = new Map();      // the word as written -> its placeholder
  let out = "", at = 0;
  for (const m of text.matchAll(WORD)) {
    const w = m[0];
    const before = text.slice(0, m.index).trimEnd();
    const starts = !before || /[.!?:;"“„]$/.test(before);
    const capital = w[0] !== w[0].toLowerCase();
    if (isKept(w) || (!isKnown(w) && !(capital && !starts))) continue;
    if (!place.has(w)) place.set(w, `[nafn${place.size + 1}]`);
    out += text.slice(at, m.index) + place.get(w);
    at = m.index + w.length;
  }
  out += text.slice(at);
  const names2 = new Map([...place].map(([w, p]) => [p, w]));
  return {
    text: out,
    count: place.size,
    back: (s) => String(s).replace(/\[nafn\d+\]/g, (p) => names2.get(p) ?? p),
  };
}

/* ---------- the answer ------------------------------------------------------ */

/** The JSON Claude must answer in: one finding per rubric point. */
export function findingsSchema(points) {
  return {
    type: "object",
    properties: {
      findings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            point: { type: "string", enum: points },
            met: { type: "boolean" },
            quote: { type: "string" },
          },
          required: ["point", "met", "quote"],
          additionalProperties: false,
        },
      },
    },
    required: ["findings"],
    additionalProperties: false,
  };
}

/**
 * A Messages API response → findings `{ point, met, quote? }`, with the
 * pupil's names given back to the quotes. A point that is MET must quote the
 * text: a tick without a quote is dropped. Unknown points are dropped.
 * Anything that is not a whole answer throws "failed".
 */
export function findingsOf(response, points, back = (s) => s) {
  if (!response || response.stop_reason !== "end_turn" || !Array.isArray(response.content)) throw fault("failed");
  const block = response.content.find((b) => b && b.type === "text");
  let data;
  try { data = JSON.parse(block ? block.text : ""); } catch { throw fault("failed"); }
  if (!data || !Array.isArray(data.findings)) throw fault("failed");
  const out = [];
  for (const f of data.findings) {
    if (!f || !points.includes(f.point) || typeof f.met !== "boolean") continue;
    const quote = typeof f.quote === "string" ? back(f.quote.trim()) : "";
    if (f.met && !quote) continue;
    out.push(quote ? { point: f.point, met: f.met, quote } : { point: f.point, met: f.met });
  }
  return out;
}

/** What one call cost, in US dollars. */
export function costOf(model, usage) {
  const m = MODELS[model] || MODELS.opus;
  const i = (usage && usage.input_tokens) || 0, o = (usage && usage.output_tokens) || 0;
  return { in: i, out: o, usd: Math.round(((i * m.in + o * m.out) / 1e6) * 1e6) / 1e6 };
}

/* ---------- the plug ---------------------------------------------------------- */

/**
 * @param {{
 *   apiKey: string, model?: "opus"|"fable", effort?: string,
 *   rubric: { points: string[], prompt: (text: string, context: any) => ({system: string, user: string} | null),
 *             keep?: (context: any) => string[],
 *             check?: (findings: object[], text: string, context: any) => object[] },
 *   fetch?: typeof fetch, log?: (line: object) => void, today?: () => string, maxTokens?: number,
 * }} opts
 *   `rubric`: what to ask (server/rubric-eigin.mjs) — `prompt` returns null
 *   for a context it cannot grade (an unknown word): "failed". Optional
 *   (#39, server/rubric-kjarni.mjs): `keep`, words not to strip as names
 *   (a story's characters); `check`, the rubric's own finding on the text
 *   as the pupil wrote it, after the model's (the copy check).
 *   `log`: where the cost of each call goes (server.mjs: a file of its own).
 */
export function claudePlug({ apiKey, model = "opus", effort = "low", rubric, fetch: fetchFn = globalThis.fetch,
  log = () => {}, today = () => new Date().toISOString().slice(0, 10), maxTokens = 2048 }) {
  const m = MODELS[model] || MODELS.opus;
  return {
    async read(text, { context = null, signal } = {}) {
      const names = context && Array.isArray(context.names) ? context.names : [];
      const clean = stripNames(text, names, rubric.keep ? rubric.keep(context) : []);
      const p = rubric.prompt(clean.text, context);
      if (!p) throw fault("failed");
      let res;
      try {
        res = await fetchFn(API_URL, {
          method: "POST",
          signal,
          headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": API_VERSION },
          body: JSON.stringify({
            model: m.id, max_tokens: maxTokens,
            system: p.system,
            messages: [{ role: "user", content: p.user }],
            output_config: { effort, format: { type: "json_schema", schema: findingsSchema(rubric.points) } },
          }),
        });
      } catch {
        throw fault("unavailable");
      }
      if (res.status === 429 || res.status === 529) throw fault("busy");
      if (!res.ok) throw fault(res.status >= 500 || res.status === 401 || res.status === 403 ? "unavailable" : "failed");
      let body;
      try { body = await res.json(); } catch { throw fault("failed"); }
      /* Paid for whether or not it can be used: logged first. */
      log({ day: today(), model: m.id, effort, ...costOf(model, body && body.usage) });
      const findings = findingsOf(body, rubric.points, clean.back);
      /* A rubric's own check on the pupil's text as written (#39: a
         sentence copied from the text is not the pupil's own words). */
      return { findings: rubric.check ? rubric.check(findings, text, context) : findings };
    },
  };
}

/**
 * The plugs a server runs, by kind: one Claude plug per rubric when the key
 * is set (`claudeConfig`), none otherwise. The cost of every call is
 * appended to `logFile`, one JSON line each, anonymous (see the header).
 * @param {any} env @param {{kind: string}[]} rubrics @param {{logFile?: string|null, fetch?: typeof fetch}} [o]
 */
export function claudePlugs(env, rubrics, { logFile = null, fetch: fetchFn = globalThis.fetch } = {}) {
  const cfg = claudeConfig(env);
  if (!cfg) return {};
  const log = (line) => {
    if (!logFile) return;
    appendFile(logFile, JSON.stringify(line) + "\n").catch(() => {});
  };
  return Object.fromEntries(rubrics.map((r) => [r.kind, claudePlug({ ...cfg, rubric: r, fetch: fetchFn, log })]));
}
