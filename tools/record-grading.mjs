#!/usr/bin/env node
/* Record a real Claude answer for the grading tests (issue #37).
 *
 * The tests never call Claude (CI has no key, and must not spend money):
 * they feed the Claude plug (server/reader-claude.mjs) answers recorded
 * here, saved in tests/fixtures/claude/. Run by hand, with a real key:
 *
 *   ANTHROPIC_API_KEY=sk-… node tools/record-grading.mjs \
 *     --word "breyting|kvk" --text "Breyting er þegar …" \
 *     [--names "Jón Jónsson"] [--model opus|fable] [--effort low] \
 *     --out tests/fixtures/claude/breyting-right.json
 *
 * It sends exactly what the server sends (the same rubric, the same name
 * stripping, the same request) and writes the fixture: what was asked
 * (`word`, `text`, `names`, `model`, `effort`) and the API's response body
 * as it came. Then say in the test what you expect of it. Use made-up
 * texts, never a pupil's. The cost of the call is printed, not logged. */

import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { claudePlug, claudeConfig } from "../server/reader-claude.mjs";
import { eiginRubric } from "../server/rubric-eigin.mjs";

const { values: a } = parseArgs({ options: {
  word: { type: "string" }, text: { type: "string" }, names: { type: "string", default: "" },
  model: { type: "string", default: "opus" }, effort: { type: "string", default: "low" },
  out: { type: "string" },
} });
if (!a.word || !a.text || !a.out) {
  console.error("Usage: node tools/record-grading.mjs --word 'lemma|cls' --text '…' --out tests/fixtures/claude/x.json");
  process.exit(2);
}
const cfg = claudeConfig({ ...process.env, FALLASKOLI_CLAUDE_MODEL: a.model, FALLASKOLI_CLAUDE_EFFORT: a.effort });
if (!cfg) { console.error("ANTHROPIC_API_KEY is not set."); process.exit(2); }

let response = null;
const recording = async (url, init) => {
  const res = await fetch(url, init);
  response = await res.clone().json().catch(() => null);
  if (!res.ok) console.error(`HTTP ${res.status}:`, JSON.stringify(response));
  return res;
};
const names = a.names ? a.names.split(",").map((s) => s.trim()).filter(Boolean) : [];
const plug = claudePlug({ ...cfg, rubric: eiginRubric(buildLexicon(DATA)), fetch: recording,
  log: (line) => console.error("cost:", JSON.stringify(line)) });
try {
  const out = await plug.read(a.text, { context: { word: a.word, names } });
  console.log(JSON.stringify(out.findings, null, 2));
} catch (e) {
  console.error("The plug refused the answer:", e.code || e.message);
}
if (!response) process.exit(1);
await writeFile(a.out, JSON.stringify({
  recorded: `Recorded ${new Date().toISOString().slice(0, 10)} with tools/record-grading.mjs`,
  model: cfg.model, effort: cfg.effort, word: a.word, names, text: a.text, response,
}, null, 2) + "\n");
console.error("Saved", a.out);
