/* LÍNO-2 nouns in the noun frames: the pure part of the authoring pass
 * (issue #21, docs/DLD-PLAN.md §2 steps 1–2). tools/lino-frames/run.mjs does
 * the reading, the writing and the calls; everything here is a function of
 * its arguments, so tests/lino-frames.test.js can hold it without a network.
 *
 * Nothing in the build imports this directory. The build never calls a model
 * (CI rebuilds the data byte for byte); this pass writes CANDIDATES, which a
 * person and the self-check (#22) turn into lines of
 * content/setningar/lino-rammar.tsv.
 *
 *   1. filter()      which LÍNO-2 noun may stand in which frame, by the
 *                    grammar alone: the app's own tests (tasks/frames.js
 *                    acceptsNoun, repeatsNoun) asked as if the pair were
 *                    already written. No cost. Everything else on the list
 *                    (verbs, adjectives, adverbs, conjunctions, and the nouns
 *                    that cannot be tried) goes to the fill-in list (#23).
 *   2. request()     one Messages API request per noun: the frame list is the
 *                    system prompt, cached; the user turn names the word and
 *                    the frames its grammar allows. The model judges meaning
 *                    only.
 *   3. answer()      the frames the model accepted, checked against what was
 *                    asked. cost() turns the API's usage fields into dollars.
 *
 * The output format is in tools/lino-frames/README.md.
 */

import { createHash } from "node:crypto";
import { substitutable, slotFrame, acceptsNoun, repeatsNoun } from "../../src/js/tasks/frames.js";

export const MODEL = "claude-opus-5-5";
export const EFFORT = "low";
export const API_VERSION = "2026-10-21";
/* Bump when the wording of the prompt changes: a recorded answer belongs to
   the prompt it answered, and run.mjs will not reuse one across versions. */
export const PROMPT_VERSION = 1;

/* USD per million tokens, claude-opus-5-5, standard (not Batch) API.
   An ASSUMPTION copied from https://platform.claude.com/docs/en/about-claude/pricing
   on 27.11.2026: input $4, 5-minute cache write $5 (1.25×), cache read $0.20
   (0.05×), output $20 (thinking included). Check that page before a real run
   and change the numbers here if they moved; the report prints them. */
export const PRICES = { input: 4, cacheWrite5m: 5, cacheWrite1h: 8, cacheRead: 0.2, output: 20 };

export const GENDERS = ["kk", "kvk", "hk"];

/* ---------- 1. the mechanical filter ------------------------------------ */

/** The noun frames, in bank order, numbered from 1: every sentence whose slot
    holds a noun that other nouns may replace (tasks/frames.js substitutable). */
export function nounFrames(sentences) {
  return sentences
    .filter((s) => substitutable(s) && s.tok[s.slot].c === "nafnorð")
    .map((s, k) => ({ n: k + 1, s, mark: s.tok[s.slot].m, word: s.tok[s.slot].w }));
}

/** How a pair names a word in lino-rammar.tsv: the lemma, or lemma|kyn when
    the vocabulary has the lemma as a noun in more than one gender. */
export function pairWord(w, nouns) {
  const genders = new Set(nouns.filter((x) => x.o === w.o).map((x) => x.c));
  return genders.size > 1 ? `${w.o}|${w.c}` : w.o;
}

/**
 * The mechanical filter.
 *   lino     [[lemma, [BÍN classes] | null, rank], …] (python3 pipeline/lino.py --json)
 *   lex      the app's lexicon (core/lexicon.js buildLexicon)
 *   exclude  Set of noun_classes.EXCLUDE: unfit in any generated sentence; a
 *            pair does not override it (pipeline/frame_allow.py), so such a
 *            noun is not tried
 * -> { frames, nouns: [{ key, o, c, lino, d, eligible:[n], already:[n] }],
 *      fillIn: [{ o, c, lino, why, sentences }] }
 *
 * A noun is tried in a frame when the app would show it there if the pair
 * were written (acceptsNoun with the word named in `al`) and does not show it
 * there already (by its class, or by a pair that is written). A noun with no
 * such frame is not tried.
 */
export function filter(lino, lex, exclude = new Set()) {
  const frames = nounFrames(lex.sentences);
  const nouns = [], fillIn = [];
  /* How many bank sentences each word stands in, as the app resolves the
     tokens (lexicon.js entryForToken): what the fill-in counts toward 5. */
  const inBank = new Map();
  for (const s of lex.sentences) {
    const keys = new Set(s.tok.map((t) => lex.entryForToken(t)).filter(Boolean).map((e) => `${e.o}|${e.c}`));
    for (const k of keys) inBank.set(k, (inBank.get(k) || 0) + 1);
  }
  const count = (o, c) => inBank.get(`${o}|${c}`) || 0;
  const seen = new Set();
  for (const w of lex.nouns.filter((x) => x.lino).sort((a, b) => a.lino - b.lino || a.c.localeCompare(b.c))) {
    seen.add(w.o);
    const key = pairWord(w, lex.nouns);
    const base = { o: w.o, c: w.c, lino: w.lino };
    if (exclude.has(w.o)) {
      fillIn.push({ ...base, why: "nafnorð á EXCLUDE (pipeline/noun_classes.py): fer ekki í ramma", sentences: count(w.o, w.c) });
      continue;
    }
    const eligible = [], already = [];
    for (const f of frames) {
      if (repeatsNoun(f.s, f.s.slot, w)) continue;
      const frame = slotFrame(f.s);
      if (acceptsNoun(frame, w, f.mark)) { already.push(f.n); continue; }
      if (acceptsNoun({ ...frame, al: [...(frame.al || []), `${w.o}|${w.c}`] }, w, f.mark)) eligible.push(f.n);
    }
    if (!eligible.length) {
      fillIn.push({ ...base, why: "nafnorð sem enginn rammi tekur við málfræðinnar vegna", sentences: count(w.o, w.c) });
      continue;
    }
    nouns.push({ key, ...base, d: w.d || "", eligible, already });
  }
  for (const [lemma, classes, rank] of lino) {
    const cls = classes || [];
    const isNoun = cls.some((c) => GENDERS.includes(c));
    if (isNoun && seen.has(lemma)) continue;
    const inLex = lex.lemma(lemma).filter((x) => !cls.length || cls.includes(x.c));
    if (isNoun) {
      fillIn.push({ o: lemma, c: cls.join("/"), lino: null, listRank: rank, why: "nafnorð sem er ekki í orðaforðanum", sentences: 0 });
      continue;
    }
    const c = inLex.length ? inLex[0].c : cls.join("/");
    fillIn.push({
      o: lemma, c, lino: inLex.length ? inLex[0].lino || null : null, listRank: rank,
      why: inLex.length ? "ekki nafnorð: fer ekki í nafnorðaramma" : "ekki nafnorð, og ekki í orðaforðanum",
      sentences: inLex.length ? count(lemma, c) : 0,
    });
  }
  fillIn.sort((a, b) => (a.listRank ?? a.lino ?? 1e9) - (b.listRank ?? b.lino ?? 1e9));
  return { frames, nouns, fillIn };
}

/* ---------- 2. the request ---------------------------------------------- */

const CASE = { NF: "nf.", ÞF: "þf.", ÞGF: "þgf.", EF: "ef." };

/** "ÞGFETgr" -> "þgf. et. með greini" */
export function markGloss(m) {
  const g = /^(NF|ÞF|ÞGF|EF)(ET|FT)(gr)?$/.exec(m || "");
  if (!g) return m || "?";
  return `${CASE[g[1]]} ${g[2] === "ET" ? "et." : "ft."}${g[3] ? " með greini" : " án greinis"}`;
}

/** The sentence with its slot word in brackets. */
export function bracketed(s) {
  return s.tok.map((t, j) => {
    const w = j === s.slot ? `[${t.w}]` : t.w;
    return [".", "?", "!", ","].includes(t.w) ? w : (j ? " " : "") + w;
  }).join("");
}

const INSTRUCTIONS = `You are helping an Icelandic teacher choose example sentences for a vocabulary program for 10–16-year-olds, many of whom have a developmental language disorder.

Below is a numbered list of FRAMES: Icelandic sentences in which one noun, shown in [brackets], may be replaced by another noun. After each frame: the grammatical form of the slot (case, number, with or without the article) and the meaning classes of noun it already takes.

In each request you get ONE Icelandic noun, its dictionary definition, and the numbers of the frames its grammar allows. Put the noun into each of those frames, in the slot's case, number and definiteness, and decide whether the resulting sentence MAKES SENSE: would a native speaker accept it as a natural, meaningful sentence that a teacher could show a child?

Judge MEANING ONLY. The inflected form will be taken from the Icelandic inflection database (BÍN) by a program; do not judge or write forms. The gender, the prepositions í/á and the plural have already been checked.

Be strict. Accept a frame only if the sentence is clearly natural with this word in its everyday sense (the definition you are given). Leave a frame out when the sentence would be odd, forced, ambiguous, figurative, comic, or only possible in a context the sentence does not give. A wrong sentence is worse than a missing one; it is fine to accept none.

Answer with JSON only: {"frames": [{"n": <frame number>, "why": "<at most 8 English words>"}]}. List only accepted frames, only from the numbers you were given.`;

/* A frame that takes (almost) every class says so in two words, not thirty. */
const ANY_FROM = 25;
const takes = (need) => (need.length >= ANY_FROM ? "any noun" : need.join(", "));

/** The system prompt: the instructions and the frame list. Identical for
    every noun, so it is cached once and read back for every later call. */
export function prefixText(frames) {
  const lines = frames.map((f) =>
    `${f.n}. ${bracketed(f.s)} (${markGloss(f.mark)}; takes: ${takes(f.s.need)})`);
  return `${INSTRUCTIONS}\n\nFRAMES (${frames.length})\n${lines.join("\n")}\n`;
}

export const prefixHash = (text) => createHash("sha256").update(text).digest("hex").slice(0, 16);

/** [1,2,3,5,7,8] -> "1-3, 5, 7-8": the frames allowed, compactly. */
export function ranges(ns) {
  const out = [];
  for (let i = 0; i < ns.length; i++) {
    let j = i;
    while (j + 1 < ns.length && ns[j + 1] === ns[j] + 1) j++;
    out.push(i === j ? `${ns[i]}` : `${ns[i]}-${ns[j]}`);
    i = j;
  }
  return out.join(", ");
}

const GENDER_NAME = { kk: "masculine", kvk: "feminine", hk: "neuter" };

export function userText(noun) {
  return [
    `Noun: ${noun.o} (${GENDER_NAME[noun.c] || noun.c})`,
    `Definition: ${noun.d || "(none given)"}`,
    `Frames its grammar allows (${noun.eligible.length}): ${ranges(noun.eligible)}`,
  ].join("\n");
}

/* The answer's shape, enforced by the API (structured outputs). */
export const SCHEMA = {
  type: "object",
  properties: {
    frames: {
      type: "array",
      items: {
        type: "object",
        properties: { n: { type: "integer" }, why: { type: "string" } },
        required: ["n", "why"],
        additionalProperties: false,
      },
    },
  },
  required: ["frames"],
  additionalProperties: false,
};

/** The body of POST /v1/messages for one noun. The prefix carries the cache
    breakpoint; model, effort and format are the same on every call, since a
    change to any of them would invalidate the cache. */
export function request(prefix, noun, { maxTokens = 8000 } = {}) {
  return {
    model: MODEL,
    max_tokens: maxTokens,
    system: [{ type: "text", text: prefix, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userText(noun) }],
    output_config: { effort: EFFORT, format: { type: "json_schema", schema: SCHEMA } },
  };
}

/* ---------- 3. the answer and its cost ----------------------------------- */

/**
 * The frames accepted in one API response.
 * -> { accepted: [{ n, why }], dropped: [{ n, why: reason }], error: string|null }
 * A frame number that was not asked about is dropped (and reported), never
 * kept: the grammar did not allow it. A response that is not the JSON asked
 * for is an error for that noun; nothing from it is kept.
 */
export function answer(response, noun) {
  const out = { accepted: [], dropped: [], error: null };
  if (!response || response.type === "error") {
    out.error = `API error: ${response?.error?.message || "no response"}`;
    return out;
  }
  if (response.stop_reason === "max_tokens") { out.error = "stopped at max_tokens"; return out; }
  if (response.stop_reason === "refusal") { out.error = "refused"; return out; }
  const text = (response.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  let parsed;
  try { parsed = JSON.parse(text); } catch { out.error = `not JSON: ${text.slice(0, 80)}`; return out; }
  if (!parsed || !Array.isArray(parsed.frames)) { out.error = "no frames array"; return out; }
  const allowed = new Set(noun.eligible), taken = new Set();
  for (const f of parsed.frames) {
    if (!f || !Number.isInteger(f.n)) { out.dropped.push({ n: f?.n, why: "not a frame number" }); continue; }
    if (!allowed.has(f.n)) { out.dropped.push({ n: f.n, why: "not among the frames asked about" }); continue; }
    if (taken.has(f.n)) continue;
    taken.add(f.n);
    out.accepted.push({ n: f.n, why: String(f.why || "").replace(/[\t\r\n]+/g, " ").trim() });
  }
  out.accepted.sort((a, b) => a.n - b.n);
  return out;
}

/** The four token counts of a response's `usage`, and what they cost. */
export function cost(usage, prices = PRICES) {
  const u = usage || {};
  const cc = u.cache_creation || null;
  const w1h = cc ? cc.ephemeral_1h_input_tokens || 0 : 0;
  const tokens = {
    input: u.input_tokens || 0,
    cacheWrite: u.cache_creation_input_tokens || 0,
    cacheRead: u.cache_read_input_tokens || 0,
    output: u.output_tokens || 0,
  };
  const usd = (tokens.input * prices.input
    + (tokens.cacheWrite - w1h) * prices.cacheWrite5m + w1h * prices.cacheWrite1h
    + tokens.cacheRead * prices.cacheRead
    + tokens.output * prices.output) / 1e6;
  return { tokens, usd: Math.round(usd * 1e6) / 1e6 };
}

/** Sum of cost() over many. */
export function addCosts(list) {
  const t = { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 };
  let usd = 0;
  for (const c of list) {
    for (const k of Object.keys(t)) t[k] += c.tokens[k];
    usd += c.usd;
  }
  return { tokens: t, usd: Math.round(usd * 1e6) / 1e6 };
}

/**
 * Estimated cost of asking `nouns`, before any call, from the prompt as built.
 * Tokens are not counted here (no tokenizer offline): `charsPerToken` brackets
 * them, and `run.mjs --count-tokens` asks the API's free count endpoint for
 * the exact numbers. Output per noun is an assumption (thinking at low effort
 * plus the JSON), stated in the report.
 * -> { low, high } each { prefixTokens, userTokens, outputTokens, usd, perNoun }
 */
export function estimate(prefix, nouns, { charsPerToken = [3.5, 2.5], outputPerNoun = [400, 2000], prices = PRICES } = {}) {
  const est = (cpt, out) => {
    const prefixTokens = Math.ceil(prefix.length / cpt);
    const userTokens = nouns.reduce((a, n) => a + Math.ceil(userText(n).length / cpt), 0);
    const outputTokens = out * nouns.length;
    const usd = !nouns.length ? 0 : (prefixTokens * prices.cacheWrite5m
      + prefixTokens * (nouns.length - 1) * prices.cacheRead
      + userTokens * prices.input + outputTokens * prices.output) / 1e6;
    return { prefixTokens, userTokens, outputTokens, usd, perNoun: nouns.length ? usd / nouns.length : 0 };
  };
  return { low: est(charsPerToken[0], outputPerNoun[0]), high: est(charsPerToken[1], outputPerNoun[1]) };
}

/* ---------- the files ------------------------------------------------------ */

const clean = (s) => String(s ?? "").replace(/[\t\r\n]+/g, " ");

export const CANDIDATES_HEAD = `# Tillögur: LÍNO-2-nafnorð í nafnorðarömmum (tools/lino-frames/run.mjs, mál #21)
#
# EKKI yfirfarið. Líkanið taldi að MERKINGIN gengi upp; enginn maður hefur lesið
# setningarnar. Sjálfsprófunin (#22) og eigandinn ákveða hvað fer í
# content/setningar/lino-rammar.tsv. Dálkarnir orð og rammi eru skrifaðir
# nákvæmlega eins og þar.
#
# Dálkar: orð, kyn, rammi (setningin úr setningar.tsv), nr (númer rammans í
# þessari keyrslu), mynd (BÍN-mark eyðunnar), í eyðunni (orðið sem stendur þar
# núna), rök (líkansins, á ensku), líkan, keyrsla (forskeyti + útgáfa fyrirmæla)
#
`;
export const CANDIDATE_COLUMNS = ["orð", "kyn", "rammi", "nr", "mynd", "í eyðunni", "rök", "líkan", "keyrsla"];

/** candidates.tsv: one accepted pair a line. */
export function candidatesTsv(rows, run) {
  const lines = rows.map((r) => [r.key, r.c, r.frame.s.t, r.frame.n, r.frame.mark, r.frame.word,
    r.why, run.model, run.id].map(clean).join("\t"));
  return CANDIDATES_HEAD + CANDIDATE_COLUMNS.join("\t") + "\n" + lines.join("\n") + (lines.length ? "\n" : "");
}

export const FILLIN_HEAD = `# LÍNO-2-orð sem fara ekki í nafnorðaramma (tools/lino-frames/run.mjs, mál #21)
#
# Fyrir viðbótina (#23): sagnir, lýsingarorð, atviksorð og samtengingar, og
# nafnorðin sem ekki var hægt að reyna. „setningar“ er fjöldi setninga í
# setningabankanum þar sem orðið stendur nú (staðfest greining).
#
# Dálkar: orð, flokkur (BÍN), LÍNO-sæti, ástæða, setningar
#
`;

export function fillInTsv(rows) {
  const lines = rows.map((r) => [r.o, r.c, r.lino ?? r.listRank ?? "", r.why, r.sentences].map(clean).join("\t"));
  return FILLIN_HEAD + ["orð", "flokkur", "LÍNO-sæti", "ástæða", "setningar"].join("\t") + "\n" + lines.join("\n") + "\n";
}

/** Read a TSV this tool wrote (or lino-rammar.tsv): comments and the header
    skipped, each row an object keyed by the header's column names. */
export function readTsv(text) {
  const lines = text.split("\n").filter((l) => l && !l.startsWith("#"));
  const head = lines.shift().split("\t");
  return lines.map((l) => Object.fromEntries(l.split("\t").map((v, i) => [head[i], v])));
}

const usd = (x) => `$${x.toFixed(x < 1 ? 4 : 2)}`;

/** cost.md: the report. */
export function costReport({ run, perNoun, total, estimates = [], prices = PRICES }) {
  const L = [];
  L.push(`# Kostnaður: LÍNO-2-nafnorð í römmum (${run.mode})`, "");
  if (run.mode !== "api") {
    L.push(`**${run.mode === "fake" ? "FAKE RUN" : "DRY RUN"}: no call was made to Claude.** ` +
      (run.mode === "fake"
        ? "The answers and their `usage` numbers are recorded fixtures, so the token counts below show the shape of the report, not a measurement."
        : "Nothing below was measured."), "");
  }
  L.push(`- model: \`${run.model}\`, effort \`${run.effort}\`, prompt v${run.promptVersion}, prefix ${run.prefixHash} (${run.frames} frames, ${run.prefixChars} characters)`);
  L.push(`- nouns asked: ${perNoun.length}${run.reused ? ` (${run.reused} answers reused from an earlier run, cost counted again here)` : ""}`);
  L.push(`- prices (USD / million tokens, assumed — check https://platform.claude.com/docs/en/about-claude/pricing): ` +
    `input ${prices.input}, cache write ${prices.cacheWrite5m}, cache read ${prices.cacheRead}, output ${prices.output}`, "");
  if (perNoun.length) {
    L.push("| | input | cache write | cache read | output | USD |", "|---|---:|---:|---:|---:|---:|");
    const row = (name, c) => `| ${name} | ${c.tokens.input} | ${c.tokens.cacheWrite} | ${c.tokens.cacheRead} | ${c.tokens.output} | ${usd(c.usd)} |`;
    L.push(row("**total**", total));
    for (const p of perNoun) L.push(row(`${p.key} (${p.accepted}/${p.asked})`, p.cost));
    L.push("", `Per noun: ${usd(total.usd / perNoun.length)}.`, "");
  }
  for (const e of estimates) {
    L.push(`## Estimate for ${e.count} nouns (${e.label})`, "",
      "Token counts estimated from the prompt as built, at 3.5 (low) and 2.5 (high) characters per token; " +
      "output assumed 400 (low) to 2,000 (high) tokens per noun, thinking included. " +
      "`node tools/lino-frames/run.mjs --count-tokens` gets the exact prompt counts from the API (free).", "",
      "| | prefix tokens | user tokens (all) | output tokens (all) | USD | per noun |", "|---|---:|---:|---:|---:|---:|");
    for (const k of ["low", "high"]) {
      const x = e[k];
      L.push(`| ${k} | ${x.prefixTokens} | ${x.userTokens} | ${x.outputTokens} | ${usd(x.usd)} | ${usd(x.perNoun)} |`);
    }
    L.push("");
  }
  return L.join("\n");
}
