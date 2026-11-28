#!/usr/bin/env node
/* Record a real Claude answer for the grading tests (issues #37, #38, #39).
/* Record a real Claude answer for the grading tests (issues #37, #38, #40).
 *
 * The tests never call Claude (CI has no key, and must not spend money):
 * they feed the Claude plug (server/reader-claude.mjs) answers recorded
 * here, saved in tests/fixtures/claude/. Run by hand, with a real key:
 *
 *   ANTHROPIC_API_KEY=sk-… node tools/record-grading.mjs \
 *     [--kind or_eigin|or_setning|or_tengsl] \
 *     --word "breyting|kvk" --text "Breyting er þegar …" \
 *     [--names "Jón Jónsson"] [--model opus|fable] [--effort low] \
 *     --out tests/fixtures/claude/breyting-right.json
 *
 * `--kind` is the rubric (default or_eigin, the explanation; or_skyring is
 * graded by the same one): or_setning reads the pupil's own sentence,
 * or_tengsl the three related words — give those as the browser sends them,
 * one numbered line each: --text $'1. breyta – …\n2. umskipti – …\n3. …'
 *
 * #39: a text's main idea or a story's summary is about a TEXT, not a word:
 *
 *   ANTHROPIC_API_KEY=sk-… node tools/record-grading.mjs \
 *     --kind les_kjarni_eigin|les_saga_eigin --texti fraedi-joklar \
 *     --text "Jöklarnir á Íslandi …" --out tests/fixtures/claude/kjarni-joklar-right.json
 *
 * (the id is a file name of content/textar/, as the browser sends it).
 * #40: a story the pupil wrote (Frásögn steps 4–6) is about a story of
 * content/textar/, or nothing: give the context the browser sends as JSON,
 * and no --word:
 *
 *   ANTHROPIC_API_KEY=sk-… node tools/record-grading.mjs --kind fr_hluti \
 *     --context '{"texti":"saga-lykillinn","setning":2}' --text "Ari vildi …" \
 *     --out tests/fixtures/claude/fr-hluti-lykillinn-right.json
 *   … --kind fr_hlidstaed --context '{"texti":"saga-lykillinn"}' …
 *   … --kind fr_eigin --context '{}' …
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
import { setningRubric } from "../server/rubric-setning.mjs";
import { tengslRubric } from "../server/rubric-tengsl.mjs";
import { kjarniRubric } from "../server/rubric-kjarni.mjs";
import { sagaRubric } from "../server/rubric-saga.mjs";
import { hlutiRubric, hlidstaedRubric, eiginSagaRubric } from "../server/rubric-frasogn.mjs";

const RUBRICS = { or_eigin: eiginRubric, or_setning: setningRubric, or_tengsl: tengslRubric,
  les_kjarni_eigin: () => kjarniRubric(), les_saga_eigin: () => sagaRubric() };
/** The kinds that are about a text (--texti), not a word (--word). */
const ABOUT_TEXT = ["les_kjarni_eigin", "les_saga_eigin"];
/* #40: the story rubrics, by the context the browser sends (--context). */
const STORY_RUBRICS = { fr_hluti: () => hlutiRubric(), fr_hlidstaed: () => hlidstaedRubric(),
  fr_eigin: () => eiginSagaRubric() };

const { values: a } = parseArgs({ options: {
  kind: { type: "string", default: "or_eigin" },
  word: { type: "string" }, texti: { type: "string" }, text: { type: "string" }, names: { type: "string", default: "" },
  model: { type: "string", default: "opus" }, effort: { type: "string", default: "low" },
  out: { type: "string" }, context: { type: "string" },
} });
if (Object.hasOwn(STORY_RUBRICS, a.kind)) await recordStory();
const aboutText = ABOUT_TEXT.includes(a.kind);
if (!(aboutText ? a.texti : a.word) || !a.text || !a.out || !Object.hasOwn(RUBRICS, a.kind)) {
  console.error(`Usage: node tools/record-grading.mjs [--kind ${Object.keys(RUBRICS).join("|")}] (--word 'lemma|cls' | --texti id) --text '…' --out tests/fixtures/claude/x.json`);
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
const plug = claudePlug({ ...cfg, rubric: RUBRICS[a.kind](buildLexicon(DATA)), fetch: recording,
  log: (line) => console.error("cost:", JSON.stringify(line)) });
try {
  const context = aboutText ? { texti: a.texti, names } : { word: a.word, names };
  const out = await plug.read(a.text, { context });
  console.log(JSON.stringify(out.findings, null, 2));
} catch (e) {
  console.error("The plug refused the answer:", e.code || e.message);
}
if (!response) process.exit(1);
await writeFile(a.out, JSON.stringify({
  recorded: `Recorded ${new Date().toISOString().slice(0, 10)} with tools/record-grading.mjs`,
  model: cfg.model, effort: cfg.effort, kind: a.kind, ...(aboutText ? { texti: a.texti } : { word: a.word }),
  names, text: a.text, response,
}, null, 2) + "\n");
console.error("Saved", a.out);

/** #40: a story kind — the context as JSON, no word. Records and exits. */
async function recordStory() {
  let context;
  try { context = JSON.parse(a.context || ""); } catch { context = null; }
  if (!context || typeof context !== "object" || !a.text || !a.out) {
    console.error(`Usage: node tools/record-grading.mjs --kind ${Object.keys(STORY_RUBRICS).join("|")} --context '{"texti":"…"}' --text '…' --out tests/fixtures/claude/x.json`);
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
  const plug = claudePlug({ ...cfg, rubric: STORY_RUBRICS[a.kind](), fetch: recording,
    log: (line) => console.error("cost:", JSON.stringify(line)) });
  try {
    const out = await plug.read(a.text, { context: { ...context, names } });
    console.log(JSON.stringify(out.findings, null, 2));
  } catch (e) {
    console.error("The plug refused the answer:", e.code || e.message);
  }
  if (!response) process.exit(1);
  await writeFile(a.out, JSON.stringify({
    recorded: `Recorded ${new Date().toISOString().slice(0, 10)} with tools/record-grading.mjs`,
    model: cfg.model, effort: cfg.effort, kind: a.kind, context, names, text: a.text, response,
  }, null, 2) + "\n");
  console.error("Saved", a.out);
  process.exit(0);
}
