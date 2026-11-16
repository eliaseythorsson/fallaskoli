/* The build's fingerprint file.
 *
 * The guard in parse_guard.py rejects a parse that is *provably* wrong. This
 * tool addresses the other problem: a parse that is merely *different* from last
 * time. A newer Greynir changed two analyses in v5 and nothing noticed, because
 * all 87 tests passed in both cases — they test structure, not content.
 *
 * The manifest holds:
 *   - sha256 of the fixed inputs (frequency list, sentence bank, generating code)
 *   - sha256 of every derived file
 *   - the versions of every package the data is derived from
 *   - a fingerprint of the analysis of *each individual sentence*
 *   - counts that are meant to be stable
 *
 * If any of that changes, the build stops and says what changed, down to
 * individual tokens. It is not possible to rebuild the app with different
 * grammar without seeing it.
 *
 *   node tools/manifest.mjs --verify    (the default in build.sh)
 *   node tools/manifest.mjs --accept    (after a reviewed change)
 */

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const p = (...x) => path.join(root, ...x);
const MANIFEST = p("data", "manifest.json");

const sha = (buf) => createHash("sha256").update(buf).digest("hex");
const sha12 = (s) => sha(s).slice(0, 12);

/* Inputs: what the build *reads*. A change here is an intention. */
const INPUTS = [
  "freq_raw.txt", "sentences.py", "noun_classes.py", "definitions.py",
  "vocab_filter.py", "government.py", "parse_guard.py", "parse_overrides.py",
  "build_freq.py", "build_lexicon.py", "build_sentences.py", "build_bundle.py",
  /* v6.13: the irregularity and cell scores written into the lexicon (item 16) */
  "irregularity.py",
  /* v6.11: the hand-written exercise items and the build that resolves them in BÍN */
  "exercises.py", "build_exercises.py",
  /* v6.13: what an adjective is shown with, and which adjectives are not compared */
  "adj_classes.py",
];

/* Artefacts: what the build *writes*. A change here is a consequence. */
const ARTIFACTS = [
  "freq_lemmas.json", "lexicon.json", "sentences.json", "data/data_bundle.js",
  "data/exercises.js",
];

async function hashFile(rel) {
  const f = p(rel);
  if (!existsSync(f)) return null;
  return sha(await readFile(f));
}

/** A fingerprint of one sentence's analysis — the text plus every token with
    everything the program builds questions on. The format is deliberately
    readable, so that a difference is comprehensible when it arrives. */
export function sentenceFingerprint(s) {
  const toks = s.tok.map((t) => [
    t.w, t.m ?? "", t.c ?? "", t.r ?? "", t.k ?? "",
    (t.g || []).join("+"), (t.u || []).join("+"), t.pg ?? "", t.rj ? "rj" : "",
  ].join("|"));
  return sha12([s.t, s.lvl, s.slot ?? "", s.fixed ? 1 : 0, s.need ?? "",
    s.rk ?? "", ...toks].join("\n"));
}

async function depVersions() {
  const out = {};
  const req = await readFile(p("requirements.txt"), "utf8");
  req.split("\n").forEach((l) => {
    const m = /^([a-z0-9_-]+)==(.+)$/i.exec(l.trim());
    if (m) out[m[1]] = m[2];
  });
  const pkg = JSON.parse(await readFile(p("package.json"), "utf8"));
  Object.assign(out, pkg.devDependencies, pkg.dependencies);
  return out;
}

export async function compute() {
  const inputs = {}, artifacts = {};
  for (const f of INPUTS) inputs[f] = await hashFile(f);
  for (const f of ARTIFACTS) artifacts[f] = await hashFile(f);

  const sents = JSON.parse(await readFile(p("sentences.json"), "utf8"));
  /* The bundle rather than lexicon.json: definitions and the corpus frequency
     score are attached on the way out by build_bundle.py and never written back,
     so `definitions` counted from lexicon.json was always 0. */
  const lex = await (async () => {
    const js = await readFile(p("data/data_bundle.js"), "utf8");
    const a = js.indexOf("{"), b = js.lastIndexOf("};");
    return JSON.parse(js.slice(a, b + 1)).lex;
  })();

  const fingerprints = {};
  sents.forEach((s) => { fingerprints[s.t] = sentenceFingerprint(s); });

  let report = {};
  if (existsSync(p("data/parse_report.json")))
    report = JSON.parse(await readFile(p("data/parse_report.json"), "utf8"));

  return {
    version: JSON.parse(await readFile(p("package.json"), "utf8")).version,
    deps: await depVersions(),
    inputs,
    artifacts,
    counts: {
      words: lex.w.length,
      sentences: sents.length,
      uncertain_tokens: sents.reduce(
        (a, s) => a + s.tok.filter((t) => t.u && t.u.length).length, 0),
      rejected_tokens: sents.reduce(
        (a, s) => a + s.tok.filter((t) => t.rj).length, 0),
      clause_unsure: sents.filter((s) => s.ku).length,
      definitions: lex.w.filter((w) => w.d).length,
      /* Words rare enough to earn the rare-find badges. A build that quietly
         changes this has quietly changed how hard those badges are. */
      rare_words: lex.w.filter((w) => (w.q ?? 0) < 12).length,
      guard: report.guard ?? null,
    },
    sentence_fingerprints: fingerprints,
  };
}

/* ---------- comparison -------------------------------------------------- */

function diffMaps(was, now, label, out) {
  const keys = [...new Set([...Object.keys(was || {}), ...Object.keys(now || {})])].sort();
  for (const k of keys) {
    const a = (was || {})[k], b = (now || {})[k];
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    if (a === undefined) out.push(`  + ${label}: ${k} = ${fmt(b)} (new)`);
    else if (b === undefined) out.push(`  − ${label}: ${k} gone (was ${fmt(a)})`);
    else out.push(`  ~ ${label}: ${k}\n      was: ${fmt(a)}\n      now: ${fmt(b)}`);
  }
}

const fmt = (v) => (typeof v === "string" && /^[0-9a-f]{40,}$/.test(v) ? v.slice(0, 12) + "…"
  : typeof v === "object" ? JSON.stringify(v) : String(v));

export async function compare() {
  const now = await compute();
  if (!existsSync(MANIFEST)) return { first: true, now, problems: [] };
  const was = JSON.parse(await readFile(MANIFEST, "utf8"));

  const problems = [];
  diffMaps(was.deps, now.deps, "package", problems);
  diffMaps(was.inputs, now.inputs, "input", problems);
  diffMaps(was.artifacts, now.artifacts, "artefact", problems);
  diffMaps(was.counts, now.counts, "count", problems);

  /* Sentence analyses: which sentences changed. */
  const changed = [], added = [], removed = [];
  const A = was.sentence_fingerprints || {}, B = now.sentence_fingerprints || {};
  for (const t of Object.keys(B)) {
    if (!(t in A)) added.push(t);
    else if (A[t] !== B[t]) changed.push(t);
  }
  for (const t of Object.keys(A)) if (!(t in B)) removed.push(t);

  return { first: false, now, was, problems, changed, added, removed };
}

/** A token-by-token diff of a sentence that changed, so it is clear what the
    parser did differently. */
async function showSentence(text) {
  const sents = JSON.parse(await readFile(p("sentences.json"), "utf8"));
  const s = sents.find((x) => x.t === text);
  if (!s) return;
  console.log(`\n    ${text}`);
  s.tok.forEach((t, i) => {
    const bits = [t.m || "—", t.c || "", t.r || "", t.k || ""];
    if (t.g) bits.push("stýrir " + t.g.join("+"));
    if (t.u) bits.push("ÓVÍST " + t.u.join("+"));
    if (t.pg) bits.push("fs→" + t.pg);
    console.log(`      ${String(i).padStart(2)} ${t.w.padEnd(14)} ${bits.filter(Boolean).join(" · ")}`);
  });
}

/* ---------- CLI --------------------------------------------------------- */

const mode = process.argv.includes("--accept") ? "accept" : "verify";
const r = await compare();

if (mode === "accept" || r.first) {
  await writeFile(MANIFEST, JSON.stringify(r.now, null, 1) + "\n", "utf8");
  console.log(r.first
    ? `manifest created: data/manifest.json (${r.now.counts.sentences} sentences)`
    : "manifest updated: data/manifest.json");
  process.exit(0);
}

const drift = r.problems.length + r.changed.length + r.added.length + r.removed.length;
if (!drift) {
  console.log(`manifest agrees — ${r.now.counts.sentences} sentences, ` +
    `${r.now.counts.words} words, ${r.now.counts.uncertain_tokens} uncertain tokens`);
  process.exit(0);
}

console.log("\n" + "=".repeat(72));
console.log("THE BUILD PRODUCES DIFFERENT DATA THAN LAST TIME. The build stops.");
console.log("=".repeat(72));
if (r.problems.length) {
  console.log("\nChanges to inputs, packages or counts:");
  r.problems.forEach((x) => console.log(x));
}
if (r.changed.length) {
  console.log(`\nSentences that got a different analysis: ${r.changed.length}`);
  for (const t of r.changed.slice(0, 12)) await showSentence(t);
  if (r.changed.length > 12) console.log(`\n    … and ${r.changed.length - 12} more.`);
}
if (r.added.length) console.log(`\nNew sentences: ${r.added.length}`);
if (r.removed.length) {
  console.log(`\nSentences that have gone: ${r.removed.length}`);
  r.removed.slice(0, 10).forEach((t) => console.log("    − " + t));
}
console.log(`
This is not a failure — it is a notification. If the change is intended (you
edited the sentence bank, added words, or upgraded a package on purpose), read
the list above and accept it with:

    ./build.sh --accept

If the change is *not* intended, the parser has changed its mind. Pin the package
version in requirements.txt again, or record a decision in parse_overrides.py. Do
not accept the manifest just to make this stop.
`);
process.exit(1);
