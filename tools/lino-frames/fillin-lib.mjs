/* New sentences for the LÍNO-2 words the bank barely has: the pure part of
 * the fill-in (issue #23, docs/DLD-PLAN.md §2 step 4). tools/lino-frames/
 * fillin.mjs does the reading, the writing and the calls, and
 * fillin-accept.mjs the owner's verdicts; everything here is a function of
 * its arguments, so tests/lino-fillin.test.js can hold it without a network,
 * without Greynir and without a model.
 *
 * Outside the build, like run.mjs (#21) and check.mjs (#22). The build reads
 * content/setningar/setningar.tsv and nothing else; fillin-accept.mjs
 * appends to that file only the sentences the owner said yes to, and from
 * there on each is parsed and checked by the build like one written by hand.
 *
 *   1. targets()      every LÍNO-2 word with fewer than TARGET sentences: the
 *                     bank sentences written with it, and for a noun the
 *                     frames that take it (by class or by a pair in
 *                     lino-rammar.tsv), i.e. every sentence the app can show
 *                     it in. Verbs, adjectives, adverbs and the rest included.
 *   2. prefixText()   the cached system prompt: the instructions, then the
 *                     repository's own rules for writing a sentence, VERBATIM
 *                     (rulesFromRepo: pipeline/sentences.py, the header of
 *                     setningar.tsv, README "Efnið", the plan), then example
 *                     sentences from the bank. request() is one word's call to
 *                     Fable 5.2; answer() checks what came back.
 *   3. precheck(), judge()
 *                     a candidate is dropped, with the reason, unless it is
 *                     new, parses (Greynir and parse_guard, through the
 *                     build's own annotate: parse_check.py), fits its level's
 *                     length, and has the word in it exactly once as the app
 *                     reads it (lexicon.js entryForToken). Everything that
 *                     survives goes to the owner: Fable wrote it, so no
 *                     second model's yes stands in for a person's (plan §2.5:
 *                     the owner reviews "every new Fable sentence").
 *   4. decide(), bankLines(), report()
 *                     the verdicts, the lines for setningar.tsv, and the
 *                     counts per word before and after.
 *
 * The files: tools/lino-frames/README.md, "The fill-in".
 */

import { createHash } from "node:crypto";
import { substitutable, slotFrame, acceptsNoun, repeatsNoun, frameIndex } from "../../src/js/tasks/frames.js";
import { recallGaps, gapForms } from "../../src/js/tasks/recall.js";
import { API_VERSION, cost, addCosts } from "./lib.mjs";
import { REDO_THRESHOLD, readRows } from "./check-lib.mjs";

export { API_VERSION, cost, addCosts, REDO_THRESHOLD, readRows };
export const MODEL = "claude-fable-5-2";
/* Writing is harder than judging: the same effort as the second opinion of
   #22, not the "low" of #21's yes/no on frames. */
export const EFFORT = "medium";
/* Bump when INSTRUCTIONS or userText change: a recorded answer belongs to
   the prompt it answered, and fillin.mjs will not reuse one across versions.
   (A change to the rules in the repository changes the prefix hash, which
   is part of the run id, so it needs no bump.) */
export const PROMPT_VERSION = 1;

/* A word with fewer sentences than this is filled in (plan §2 step 4). */
export const TARGET = 5;
/* ... with at least this many new ones, and up to TARGET in all. */
export const MIN_NEW = 2;

/* USD per million tokens, claude-fable-5-2, standard (not Batch) API, from
   https://platform.claude.com/docs/en/about-claude/pricing on 27.11.2026:
   input $8, 5-minute cache write $10, 1-hour $16, cache read $0.20, output
   $40 (thinking included). The Batch API halves input and output. Check the
   page before a real run; the report prints the numbers used. */
export const PRICES = { input: 8, cacheWrite5m: 10, cacheWrite1h: 16, cacheRead: 0.2, output: 40 };

const NOUN = new Set(["kk", "kvk", "hk"]);
const clean = (s) => String(s ?? "").replace(/[\t\r\n]+/g, " ").trim();
export const wordId = (w) => `${w.o}|${w.c}`;

/* ---------- 1. which words ------------------------------------------------- */

/**
 * Every sentence of the bank the app can show `w` in, by text: the ones
 * written with it (a token the lexicon resolves to it: lexicon.js
 * entryForToken, as #21's fill-in.tsv counts), and for a noun the frames
 * whose slot takes it (tasks/frames.js acceptsNoun: by class, or by a pair
 * in lino-rammar.tsv). -> Set of sentence texts.
 */
export function sentencesOf(lex, w, index = tokenIndex(lex)) {
  const out = new Set(index.get(wordId(w)) || []);
  if (NOUN.has(w.c)) {
    for (const [m, frames] of frameIndex(lex).noun) {
      if (!w.forms[m]) continue;
      for (const f of frames) {
        if (!repeatsNoun(f.s, f.i, w) && acceptsNoun(f, w, m)) out.add(f.s.t);
      }
    }
  }
  return out;
}

/** word id -> texts of the bank sentences written with it. Built once. */
export function tokenIndex(lex) {
  const idx = new Map();
  for (const s of lex.sentences || []) {
    for (const t of s.tok) {
      const e = lex.entryForToken(t);
      if (!e) continue;
      const k = wordId(e);
      if (!idx.has(k)) idx.set(k, new Set());
      idx.get(k).add(s.t);
    }
  }
  return idx;
}

/**
 * The words to fill in.
 *   lino  [[lemma, [BÍN classes] | null, rank], …] (python3 pipeline/lino.py)
 *   lex   the app's lexicon
 * -> { words: [{ o, c, d, lino, before, gaps, want, bank: [text] }]   fewer than TARGET
 *      full:  [{ o, c, lino, before, gaps }]                          TARGET or more: not asked
 *      missing: [{ o, c, lino, why }] }                               not in the vocabulary
 *
 * `before` is sentencesOf's size; `gaps` how many recall gaps the word has
 * now (tasks/recall.js recallGaps: #14 found 504 of 2,162 words with one);
 * `want` the new sentences asked for: enough to reach TARGET, never fewer
 * than MIN_NEW. A lemma on the list in two classes is two words.
 */
export function targets(lino, lex) {
  const index = tokenIndex(lex);
  const words = [], full = [], missing = [], seen = new Set();
  for (const [lemma, classes, rank] of lino) {
    const cls = classes || [];
    const entries = lex.lemma(lemma).filter((x) => !cls.length || cls.includes(x.c));
    if (!entries.length) {
      missing.push({ o: lemma, c: cls.join("/"), lino: rank, why: "ekki í orðaforðanum (BÍN hefur orðið ekki, eða smíðin tók það ekki inn)" });
      continue;
    }
    for (const w of entries) {
      if (seen.has(wordId(w))) continue;
      seen.add(wordId(w));
      const bank = [...sentencesOf(lex, w, index)];
      const row = { o: w.o, c: w.c, d: w.d || "", lino: w.lino || rank, before: bank.length, gaps: recallGaps(lex, w).length };
      if (bank.length >= TARGET) { full.push(row); continue; }
      words.push({ ...row, want: Math.max(MIN_NEW, TARGET - bank.length), bank });
    }
  }
  return { words, full, missing };
}

/* ---------- 2. the prompt ---------------------------------------------------- */

/* The repository's rules for writing a sentence, verbatim, each with the file
   it comes from. Read from the files at run time, so the prompt is always
   what the repository says now (and the prefix hash, part of the run id,
   changes when they do). Each piece is found by markers that a test holds;
   a marker that moved stops the run rather than send half the rules. */
export const RULE_SOURCES = [
  { file: "pipeline/sentences.py", what: "the format of the sentence bank and the rules for writing a sentence (the module's docstring)",
    cut: (t) => between(t, '"""', '"""') },
  { file: "content/setningar/setningar.tsv", what: "the header of the sentence bank, in Icelandic",
    cut: (t) => t.split("\n").filter((l, i, a) => a.slice(0, i + 1).every((x) => x.startsWith("#"))).join("\n") },
  { file: "README.md", what: 'the README, section "Efnið", on adding sentences',
    cut: (t) => between(t, "**Adding sentences.**", "**A word for one frame.**", true) },
  { file: "docs/DLD-PLAN.md", what: "the plan for this pass (§2 step 4)",
    cut: (t) => between(t, "4. **Fable 5.2 fill-in.**", "5. **Second opinion", true) },
];

function between(text, a, b, keepStart = false) {
  const i = text.indexOf(a);
  const j = i < 0 ? -1 : text.indexOf(b, i + a.length);
  if (i < 0 || j < 0) return null;
  return text.slice(keepStart ? i : i + a.length, j).trim();
}

/** files: { "pipeline/sentences.py": text, … } -> [{ file, what, text }];
    throws, naming the file, when a piece cannot be found. */
export function rulesFromRepo(files) {
  return RULE_SOURCES.map((r) => {
    const src = files[r.file];
    const text = src == null ? null : r.cut(src);
    if (!text) throw new Error(`the rules for writing a sentence were not found in ${r.file} (fillin-lib.mjs RULE_SOURCES)`);
    return { file: r.file, what: r.what, text };
  });
}

export const INSTRUCTIONS = `You are writing example sentences for an Icelandic vocabulary program for 10–16-year-olds, many of whom have a developmental language disorder. A native-speaking teacher must be able to show every sentence to a child without hesitating.

The sentences go into the program's sentence bank. Below, VERBATIM from the program's repository, are the rules every sentence in that bank is written by: the format and the rules in pipeline/sentences.py, the header of the bank's file, the README's advice on adding a sentence, and the plan for this pass. Follow them. Then come examples from the bank at each level (þyngd).

In each request you get ONE Icelandic word from LÍNO-2, the list of academic words school texts use: its word class, its dictionary definition, the bank's sentences it already stands in, and how many new sentences to write.

Write that many NEW sentences. Every one must
- be complete, correct, natural Icelandic that a teacher would show a 13-year-old, about everyday life: school, home, friends, sport, nature, the news;
- contain the word EXACTLY ONCE, as a word of its own (not inside a compound, and no other form of it elsewhere in the sentence), used so that the sentence shows what it means;
- use the word in its commonest sense in school texts. The definition you are given is the dictionary's FIRST sense, which is not always that one: it tells you which word is meant, not which sense to write about;
- be a FIXED sentence: nothing in it is a blank or meant to be replaced. The parts of the rules about \`slot\` and \`need\` are for frames; the program fills those columns in itself;
- have a level from 1 to 7 that its length and its constructions give it by the rules (the length table, and the constructions of levels 6 and 7). Prefer levels 2–5. Give the sentences different levels, and where it is natural different forms of the word (case, number, tense, degree), but never force a form;
- keep to "the rules learned the hard way" and what the parser gets wrong (levels 6 and 7), since every sentence is parsed by Greynir and checked by the guard, and one the program cannot vouch for is thrown away;
- differ from each other and from the bank's sentences you are shown.
No real people's names, no brands, no violence, nothing a parent would object to.

A wrong sentence is worse than a missing one. If the word cannot be used naturally in a sentence a child would read, write fewer sentences, or none, and say why in "note".

Answer with JSON only: {"sentences": [{"level": <1-7>, "text": "<the sentence>", "form": "<the word exactly as it stands in the sentence>", "why": "<at most 12 English words: what the sentence shows the word means>"}], "note": "<empty, or why fewer were written>"}.`;

/* Examples from the bank: the first few sentences of each level, in bank
   order (deterministic). They show the length and the register; the rules
   say the rest. */
export const EXAMPLES_PER_LEVEL = 4;

export function examples(sentences, per = EXAMPLES_PER_LEVEL) {
  const by = new Map();
  for (const s of sentences) {
    if (!by.has(s.lvl)) by.set(s.lvl, []);
    if (by.get(s.lvl).length < per) by.get(s.lvl).push(s.t);
  }
  return [...by.keys()].sort((a, b) => a - b).map((lvl) => ({ lvl, texts: by.get(lvl) }));
}

/** The system prompt: identical for every word, so it is cached once. */
export function prefixText(rules, sentences) {
  const parts = [INSTRUCTIONS, ""];
  for (const r of rules) {
    parts.push(`===== From ${r.file}: ${r.what} =====`, r.text, "");
  }
  parts.push("===== Examples from the bank, by level =====");
  for (const e of examples(sentences)) parts.push(`Level ${e.lvl}:`, ...e.texts.map((t) => `  ${t}`));
  return parts.join("\n") + "\n";
}

export const prefixHash = (text) => createHash("sha256").update(text).digest("hex").slice(0, 16);

const CLASS_NAME = { kk: "noun, masculine", kvk: "noun, feminine", hk: "noun, neuter", so: "verb", lo: "adjective",
  ao: "adverb", st: "conjunction", fs: "preposition", fn: "pronoun", to: "numeral", rt: "ordinal" };

/** How many of the bank's sentences the user turn shows (the rest are
    counted): enough to avoid repeating them, never a long prompt. */
const SHOW_BANK = 4;

export function userText(w) {
  const bank = [...w.bank].sort();
  return [
    `Word: ${w.o} (${CLASS_NAME[w.c] || w.c})`,
    `Definition: ${w.d || "(none given)"}`,
    `Sentences in the bank with this word now (${bank.length}):`,
    ...(bank.length ? bank.slice(0, SHOW_BANK).map((t) => `- ${t}`) : ["(none)"]),
    ...(bank.length > SHOW_BANK ? [`- … and ${bank.length - SHOW_BANK} more`] : []),
    `Write ${w.want} new sentences.`,
  ].join("\n");
}

export const SCHEMA = {
  type: "object",
  properties: {
    sentences: {
      type: "array",
      items: {
        type: "object",
        properties: { level: { type: "integer" }, text: { type: "string" }, form: { type: "string" }, why: { type: "string" } },
        required: ["level", "text", "form", "why"],
        additionalProperties: false,
      },
    },
    note: { type: "string" },
  },
  required: ["sentences", "note"],
  additionalProperties: false,
};

/** The body of POST /v1/messages for one word, the shape of #21's and #22's. */
export function request(prefix, w, { maxTokens = 16000 } = {}) {
  return {
    model: MODEL,
    max_tokens: maxTokens,
    system: [{ type: "text", text: prefix, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userText(w) }],
    output_config: { effort: EFFORT, format: { type: "json_schema", schema: SCHEMA } },
  };
}

/**
 * The sentences in one response.
 * -> { sentences: [{ lvl, text, form, why }], dropped: [{ text, why }], note, error }
 * An entry that is not a sentence with a level 1–7 is dropped with the
 * reason; so is anything past the number asked for. A response that is not
 * the JSON asked for is an error for the word, and nothing of it is kept.
 */
export function answer(response, w) {
  const out = { sentences: [], dropped: [], note: "", error: null };
  if (!response || response.type === "error") { out.error = `API error: ${response?.error?.message || "no response"}`; return out; }
  if (response.stop_reason === "max_tokens") { out.error = "stopped at max_tokens"; return out; }
  if (response.stop_reason === "refusal") { out.error = "refused"; return out; }
  const text = (response.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  let parsed;
  try { parsed = JSON.parse(text); } catch { out.error = `not JSON: ${text.slice(0, 80)}`; return out; }
  if (!parsed || !Array.isArray(parsed.sentences)) { out.error = "no sentences array"; return out; }
  out.note = clean(parsed.note);
  for (const x of parsed.sentences) {
    const t = clean(x?.text);
    if (!t) { out.dropped.push({ text: "", why: "engin setning" }); continue; }
    if (!Number.isInteger(x.level) || x.level < 1 || x.level > 7) { out.dropped.push({ text: t, why: `þyngdin „${x?.level}“ er ekki 1–7` }); continue; }
    if (out.sentences.length >= w.want) { out.dropped.push({ text: t, why: `fleiri en beðið var um (${w.want})` }); continue; }
    out.sentences.push({ lvl: x.level, text: t, form: clean(x.form), why: clean(x.why) });
  }
  return out;
}

/**
 * Estimated cost before any call, from the prompt as built (no tokenizer
 * offline; `fillin.mjs --count-tokens` asks the API's free endpoint). Output
 * per sentence is an assumption, thinking at medium effort included.
 */
export function estimate(prefix, words, { charsPerToken = [3.5, 2.5], outputPerSentence = [300, 1200], prices = PRICES, batch = false } = {}) {
  const est = (cpt, outPer) => {
    const prefixTokens = Math.ceil(prefix.length / cpt);
    const userTokens = words.reduce((a, w) => a + Math.ceil(userText(w).length / cpt), 0);
    const outputTokens = words.reduce((a, w) => a + outPer * w.want + 100, 0);
    const half = batch ? 0.5 : 1;
    const usd = !words.length ? 0 : (prefixTokens * prices.cacheWrite5m
      + prefixTokens * (words.length - 1) * prices.cacheRead
      + (userTokens * prices.input + outputTokens * prices.output) * half) / 1e6;
    return { prefixTokens, userTokens, outputTokens, usd, perWord: words.length ? usd / words.length : 0 };
  };
  return { low: est(charsPerToken[0], outputPerSentence[0]), high: est(charsPerToken[1], outputPerSentence[1]) };
}

/* ---------- 3. the checks ------------------------------------------------------ */

export const STATUS = {
  rejected: "vél hafnar",     // dropped before the owner: the reason is beside it
  review: "til yfirferðar",   // the owner reads it
};

/**
 * The checks that need no parser, over every candidate of the run, in order.
 *   rows  [{ word, lvl, text, form, why }]
 *   bank  Set of the bank's sentence texts
 * -> the rows, each with `error` (string) or null. A sentence the bank has
 * already would stop the build (build_sentences.py: the same text twice);
 * one written twice in the run is kept once.
 */
export function precheck(rows, bank) {
  const seen = new Set();
  return rows.map((r) => {
    let error = null;
    if (!/^[A-ZÁÐÉÍÓÚÝÞÆÖ0-9„]/.test(r.text)) error = "setningin byrjar ekki á hástaf";
    else if (!/[.?!]$/.test(r.text)) error = "setningin endar ekki á punkti, spurningarmerki eða upphrópunarmerki";
    else if (bank.has(r.text)) error = "setningin er þegar í setningabankanum";
    else if (seen.has(r.text)) error = "sama setningin kom tvisvar í keyrslunni";
    seen.add(r.text);
    return { ...r, error };
  });
}

/** What parse_check.py reads for a written sentence. A noun gets its slot
    (need "none": the cloze asks for the word itself); other words none. */
export function parseItems(rows) {
  return rows.flatMap((r, i) => (r.error ? [] : [{ id: String(i), kind: "written", text: r.text, level: r.lvl,
    lemma: r.word.o, slot: NOUN.has(r.word.c) ? r.word.o : null }]));
}

/**
 * The verdict on one parsed sentence. `parsed` is parse_check.py's
 * { ok, why, rec }: rec is annotate()'s record (what data/sentences.json
 * holds for a bank sentence). It passes when the parse did, and the word
 * stands in it exactly once as the app resolves tokens, with a reading the
 * guard did not withdraw, and (a noun) as the sentence's slot.
 * -> { ok, why, i (the word's token), gap (a usable recall gap there) }
 */
export function judge(lex, w, parsed) {
  if (!parsed) return { ok: false, why: "engin þáttun til fyrir setninguna", i: null, gap: false };
  if (!parsed.ok) return { ok: false, why: clean(parsed.why) || "þáttunin hafnar setningunni", i: null, gap: false };
  const rec = parsed.rec;
  const word = lex.lookup(w.o, w.c) && lex.lemma(w.o).find((x) => x.c === w.c);
  const hits = [];
  rec.tok.forEach((t, i) => { if (lex.entryForToken(t) === word) hits.push(i); });
  const same = rec.tok.filter((t) => t.l === w.o).length;
  if (!hits.length) {
    const t = rec.tok.find((x) => x.l === w.o);
    return { ok: false, i: null, gap: false, why: t
      ? `„${t.w}“ er lesið sem ${t.c || t.x || "óþekkt"} (${t.m || "án marks"}), ekki sem orðið „${w.o}“ (${w.c})`
      : `orðið „${w.o}“ finnst ekki í setningunni eins og Greynir les hana` };
  }
  if (hits.length > 1 || same > 1) return { ok: false, why: `orðið „${w.o}“ stendur oftar en einu sinni í setningunni`, i: null, gap: false };
  const i = hits[0];
  if (rec.tok[i].rj) return { ok: false, why: `greining orðsins „${rec.tok[i].w}“ var tekin úr umferð`, i, gap: false };
  if (NOUN.has(w.c) && rec.slot !== i) return { ok: false, why: `nafnorðið „${rec.tok[i].w}“ fannst ekki sem eyða setningarinnar`, i, gap: false };
  return { ok: true, why: "", i, gap: !!gapForms(lex, rec, i, word) };
}

/* ---------- the files ------------------------------------------------------------ */

const yesNo = (b) => (b == null ? "" : b ? "já" : "nei");

export const CANDIDATE_COLUMNS = ["orð", "flokkur", "þyngd", "setning", "mynd", "rök", "líkan", "keyrsla"];

export function candidatesTsv(rows, run) {
  const head = `# Nýjar setningar fyrir LÍNO-2-orð: keyrsla ${run.id} (tools/lino-frames/fillin.mjs, mál #23)
#
# EKKI yfirfarið. ${run.mode === "api" ? "Fable 5.2 skrifaði setningarnar" : "FÖLSUÐ KEYRSLA: setningarnar eru upptökur til prófunar, ekki frá Claude"}.
# Hvað varð um hverja þeirra stendur í checked.tsv; eigandinn dæmir í yfirferd.tsv.
#
# Dálkar: orð, flokkur (BÍN), þyngd, setning, mynd (orðið eins og það stendur í
# setningunni, að sögn líkansins), rök (líkansins, á ensku), líkan, keyrsla
#
`;
  const lines = rows.map((r) => [r.word.o, r.word.c, r.lvl, r.text, r.form, r.why, run.model, run.id].map(clean).join("\t"));
  return head + CANDIDATE_COLUMNS.join("\t") + "\n" + lines.join("\n") + (lines.length ? "\n" : "");
}

export const CHECKED_COLUMNS = ["orð", "flokkur", "þyngd", "setning", "vél", "vél: rök", "eyða", "staða", "Fable: rök", "keyrsla"];

export function checkedTsv(rows, run) {
  const head = `# Nýjar setningar fyrir LÍNO-2-orð, prófaðar: keyrsla ${run.id} (tools/lino-frames/fillin.mjs, mál #23)
#
# Hver setning sem líkanið skrifaði og hvað varð um hana. Enginn á að breyta þessari
# skrá; dómar eigandans fara í yfirferd.tsv.
#
# Dálkar: orð, flokkur, þyngd, setning, vél (já / nei: setningin er ný, Greynir þáttar
# hana, parse_guard gerir enga athugasemd, lengdin hæfir þyngdinni og orðið stendur í
# henni einu sinni eins og forritið les hana), vél: rök, eyða (já: setningin nýtist í
# „Hvaða orð vantar?“), staða, Fable: rök (á ensku), keyrsla
#
# staða:  ${STATUS.review} = eigandinn les setninguna (allar sem standast vélina)
#         ${STATUS.rejected} = setningin fer ekki lengra; ástæðan er í „vél: rök“
#
`;
  const lines = rows.map((r) => [r.word.o, r.word.c, r.lvl, r.text, yesNo(r.machine?.ok), r.machine?.why,
    yesNo(r.machine?.ok ? r.machine.gap : null), r.status, r.why, run.id].map(clean).join("\t"));
  return head + CHECKED_COLUMNS.join("\t") + "\n" + lines.join("\n") + (lines.length ? "\n" : "");
}

export const QUEUE_FILE = "yfirferd.tsv";
export const QUEUE_COLUMNS = ["dómur", "setning", "þyngd", "orð", "flokkur", "eyða", "Fable", "athugasemd"];
export const YES = "já", NO = "nei";
const keyOf = (word, text) => `${word}\t${text}`;

/** yfirferd.tsv: every sentence that passed the machine. `kept` (readQueue
    of the file as it stands) carries verdicts and comments over a re-run. */
export function queueTsv(rows, run, kept = new Map()) {
  const head = `# Nýjar setningar fyrir LÍNO-2-orð, til yfirferðar: keyrsla ${run.id} (tools/lino-frames/fillin.mjs, mál #23)
#
# Hver lína er ný setning sem Fable 5.2 skrifaði fyrir orð sem var í færri en ${TARGET}
# setningum í setningabankanum. Greynir þáttar hana, parse_guard gerir enga athugasemd,
# lengdin hæfir þyngdinni og orðið stendur í henni einu sinni. Enginn hefur lesið hana.
# ALLAR setningarnar eru hér: engin þeirra fer í setningabankann nema eigandinn segi já.
#
# SVONA ER DÆMT: lestu setninguna og skrifaðu já eða nei í dálkinn „dómur“, fremst
# í línunni. Yfirlitssíðan (node tools/review.mjs, dist/review.html) sýnir allar
# setningarnar undir „LÍNO-2: nýjar setningar til yfirferðar“, með skrá og línunúmeri.
#   já   setningin er rétt og eðlileg íslenska sem má sýna barni, og þyngdin passar
#   nei  Íslendingur myndi hika við hana
# Í dálkinn „athugasemd“ má skrifa hvað sem er. Breyttu engu öðru í línunni; setningu
# sem þarf að laga má skrifa í athugasemdina og segja nei, eða laga síðar í setningar.tsv.
# Þegar allar línur hafa fengið dóm:
#   node tools/lino-frames/fillin-accept.mjs --by "eigandi, <dagsetning>"
# Setningarnar sem fá já bætast aftast í content/setningar/setningar.tsv. Ef meira en
# ${Math.round(REDO_THRESHOLD * 100)}% fá nei er mælt með því að herða fyrirmælin áður en næsta keyrsla er gerð.
#
# Dálkar: dómur (já / nei; autt = ekki búið að dæma), setning, þyngd, orð (LÍNO-2-orðið
# sem setningin var skrifuð fyrir), flokkur, eyða (já: setningin nýtist í „Hvaða orð
# vantar?“), Fable (rök líkansins, á ensku), athugasemd
#
`;
  const lines = rows.filter((r) => r.status === STATUS.review).map((r) => {
    const old = kept.get(keyOf(r.word.o, r.text)) || {};
    return [old.verdict || "", r.text, r.lvl, r.word.o, r.word.c, yesNo(r.machine.gap), r.why, old.comment || ""].map(clean).join("\t");
  });
  return head + QUEUE_COLUMNS.join("\t") + "\n" + lines.join("\n") + (lines.length ? "\n" : "");
}

/** yfirferd.tsv as written (and edited) -> Map("orð\tsetning" -> { verdict, comment, line, … }). */
export function readQueue(text) {
  const out = new Map();
  for (const r of readRows(text)) {
    out.set(keyOf(r["orð"], r["setning"]), { verdict: (r["dómur"] || "").toLowerCase(), comment: r["athugasemd"] || "",
      word: r["orð"], cls: r["flokkur"], text: r["setning"], lvl: r["þyngd"], line: r.line });
  }
  return out;
}

/* ---------- 4. the verdicts and the counts ------------------------------------------ */

/**
 * What the owner's verdicts mean.
 *   checked  rows of checked.tsv (readRows)
 *   queue    readQueue(yfirferd.tsv)
 * -> { problems: [string]   (a line without a verdict, a verdict that is not
 *                            já/nei, a queue that does not match checked.tsv);
 *                            when there are any, nothing else is decided
 *      accepted: [{ word, cls, lvl, text, comment }], rejected: n,
 *      rate (share of nei), redo (rate over REDO_THRESHOLD) }
 *
 * Every sentence in the queue was read, so a redo writes nothing less: the
 * sentences the owner said yes to go in either way. A high rate says the
 * PROMPT is not good enough for the words still to come.
 */
export function decide(checked, queue) {
  const problems = [], accepted = [];
  let n = 0, no = 0;
  const expected = new Set();
  for (const r of checked) {
    if (r["staða"] !== STATUS.review) continue;
    const k = keyOf(r["orð"], r["setning"]);
    expected.add(k);
    const q = queue.get(k);
    if (!q) { problems.push(`vantar í ${QUEUE_FILE}: ${r["orð"]} — ${r["setning"]}`); continue; }
    if (q.verdict !== YES && q.verdict !== NO) {
      problems.push(`${QUEUE_FILE}:${q.line}: ${q.verdict ? `dómurinn „${q.verdict}“ er hvorki já né nei` : "enginn dómur"} (${r["orð"]})`);
      continue;
    }
    n++;
    if (q.verdict === NO) { no++; continue; }
    accepted.push({ word: r["orð"], cls: r["flokkur"], lvl: Number(r["þyngd"]), text: r["setning"], comment: q.comment });
  }
  for (const [k, q] of queue) {
    if (!expected.has(k)) problems.push(`${QUEUE_FILE}:${q.line}: setningin er ekki til yfirferðar samkvæmt checked.tsv (${q.word}); breyttu ekki setningunum sjálfum`);
  }
  if (problems.length) return { problems, accepted: [], read: 0, rejected: 0, rate: 0, redo: false };
  const rate = n ? no / n : 0;
  return { problems, accepted, read: n, rejected: no, rate, redo: rate > REDO_THRESHOLD };
}

/**
 * The lines to append to content/setningar/setningar.tsv (columns þyngd,
 * setning, orð, þörf, ekki eyða, athugasemd), without the sentences the file
 * already has. A noun's sentence names it in `orð` with `þörf` "none": the
 * cloze then asks for the word itself and nothing is substituted into it
 * (plan: "fixed sentences only, with no new noun classes").
 *   existing  Set of the texts the bank has now
 * -> { lines: [string], added, skipped }
 */
export function bankLines(d, existing, { by, batch }) {
  const fresh = d.accepted.filter((a) => !existing.has(a.text) && existing.add(a.text));
  const lines = [];
  if (fresh.length) {
    lines.push("# =============================================================================",
      `# LÍNO-2: NÝJAR SETNINGAR (mál #23), keyrsla ${batch}`,
      `# Fable 5.2 skrifaði þær fyrir LÍNO-2-orð sem stóðu í færri en ${TARGET} setningum; Greynir og`,
      `# parse_guard stóðust þær (tools/lino-frames/fillin.mjs) og ${clean(by)} las hverja og eina.`,
      "# =============================================================================");
    for (const a of fresh) {
      const noun = NOUN.has(a.cls);
      const note = `LÍNO-2: ${a.word} (Fable 5.2, keyrsla ${batch}; lesið: ${clean(by)})${a.comment ? `; ${clean(a.comment)}` : ""}`;
      lines.push([a.lvl, a.text, noun ? a.word : "", noun ? "none" : "", "", note].map(clean).join("\t"));
    }
  }
  return { lines, added: fresh.length, skipped: d.accepted.length - fresh.length };
}

/**
 * The counts per word, before and after.
 *   words     targets().words (with before, gaps, want)
 *   rows      every candidate with machine and status
 *   accepted  the sentences the owner said yes to (texts), or null before the review
 *   tokensOf  text -> the word ids the sentence's tokens resolve to (from the parse),
 *             so a sentence written for one word counts for every target word in it
 * -> [{ o, c, lino, before, gaps, asked, written, rejected, review, accepted, after, gapsNew }]
 */
export function report(words, rows, accepted, tokensOf) {
  const byWord = new Map(words.map((w) => [wordId(w), { o: w.o, c: w.c, lino: w.lino, before: w.before, gaps: w.gaps,
    asked: w.want, written: 0, rejected: 0, review: 0, accepted: accepted ? 0 : null, after: null, gapsNew: 0 }]));
  for (const r of rows) {
    const x = byWord.get(wordId(r.word));
    if (!x) continue;
    x.written++;
    if (r.status === STATUS.review) x.review++; else x.rejected++;
    if (r.status === STATUS.review && r.machine.gap && (!accepted || accepted.has(r.text))) x.gapsNew++;
  }
  const extra = new Map();
  for (const r of rows) {
    if (r.status !== STATUS.review || (accepted && !accepted.has(r.text))) continue;
    for (const id of tokensOf(r.text)) extra.set(id, (extra.get(id) || 0) + 1);
  }
  for (const [id, x] of byWord) {
    const add = extra.get(id) || 0;
    if (accepted) x.accepted = add;
    x.after = x.before + add;
  }
  return [...byWord.values()];
}

export const REPORT_COLUMNS = ["orð", "flokkur", "LÍNO-sæti", "fyrir", "eyður fyrir", "beðið um", "skrifaðar",
  "vél hafnaði", "til yfirferðar", "samþykktar", "eftir", "nýjar eyður"];

export function reportTsv(rep, run, reviewed) {
  const head = `# Setningar á LÍNO-2-orð fyrir og eftir viðbótina: keyrsla ${run.id} (mál #23)
#
# fyrir        setningar sem forritið getur sýnt orðið í núna: skrifaðar með því, og fyrir
#              nafnorð rammarnir sem taka við því (eftir flokki eða pari í lino-rammar.tsv)
# eyður fyrir  þar af nothæfar í „Hvaða orð vantar?“ (tasks/recall.js recallGaps)
# samþykktar   nýjar setningar sem eigandinn samþykkti og orðið stendur í (líka setningar
#              skrifaðar fyrir annað orð); ${reviewed ? "" : "AUTT: yfirferðinni er ekki lokið"}
# eftir        fyrir + ${reviewed ? "samþykktar" : "allar sem bíða yfirferðar (ef allar fá já)"}
# nýjar eyður  nýjar setningar skrifaðar fyrir orðið sem nýtast í „Hvaða orð vantar?“
#
`;
  const lines = rep.map((x) => [x.o, x.c, x.lino ?? "", x.before, x.gaps, x.asked, x.written, x.rejected, x.review,
    x.accepted ?? "", x.after, x.gapsNew].join("\t"));
  return head + REPORT_COLUMNS.join("\t") + "\n" + lines.join("\n") + (lines.length ? "\n" : "");
}

/** The summary: how many words, how many reach TARGET, how many have a recall gap. */
export function summary(rep, { full = 0, missing = 0, reviewed = false } = {}) {
  const n = rep.length;
  const count = (f) => rep.filter(f).length;
  return {
    words: n, full, missing,
    zeroBefore: count((x) => x.before === 0),
    reachBefore: count((x) => x.before >= TARGET),
    reachAfter: count((x) => x.after >= TARGET),
    zeroAfter: count((x) => x.after === 0),
    gapBefore: count((x) => x.gaps > 0),
    gapAfter: count((x) => x.gaps > 0 || x.gapsNew > 0),
    written: rep.reduce((a, x) => a + x.written, 0),
    rejected: rep.reduce((a, x) => a + x.rejected, 0),
    review: rep.reduce((a, x) => a + x.review, 0),
    accepted: reviewed ? rep.reduce((a, x) => a + (x.accepted || 0), 0) : null,
    reviewed,
  };
}

const usd = (x) => `$${x.toFixed(x < 1 ? 4 : 2)}`;

export function reportMd(sum, rep, run, { estimates = [], total = null, prices = PRICES } = {}) {
  const L = [`# LÍNO-2: nýjar setningar, keyrsla ${run.id} (${run.mode})`, ""];
  if (run.mode !== "api") {
    L.push(`**${run.mode === "fake" ? "FAKE RUN: the sentences are recorded fixtures, written by hand, not by Claude" : "DRY RUN: no sentence was written"}.** No call was made to Claude.`, "");
  }
  L.push(`- model \`${run.model}\`, effort \`${run.effort}\`, prompt v${run.promptVersion}, prefix ${run.prefixHash} (${run.prefixChars} characters)`,
    `- LÍNO-2 words in the vocabulary with ${TARGET} sentences or more (not asked): ${sum.full}; not in the vocabulary (cannot be asked): ${sum.missing}`,
    `- words with fewer than ${TARGET} sentences in this selection: **${sum.words}** (none at all: ${sum.zeroBefore})`,
    `- sentences written: ${sum.written}; dropped by the machine: ${sum.rejected}; to the owner: ${sum.review}` +
      (sum.reviewed ? `; accepted: ${sum.accepted}` : " (the review is not done)"),
    `- words with at least ${TARGET} sentences: before ${sum.reachBefore}, after ${sum.reachAfter}${sum.reviewed ? "" : " if every sentence in the queue is accepted"}`,
    `- words with no sentence: before ${sum.zeroBefore}, after ${sum.zeroAfter}`,
    `- words with a usable recall gap ("Hvaða orð vantar?", #14): before ${sum.gapBefore}, after ${sum.gapAfter}`, "");
  if (total) {
    L.push(`Cost of this run from the API's usage (prices assumed: input ${prices.input}, cache write ${prices.cacheWrite5m}, ` +
      `cache read ${prices.cacheRead}, output ${prices.output} USD per million tokens): **${usd(total.usd)}** ` +
      `(input ${total.tokens.input}, cache write ${total.tokens.cacheWrite}, cache read ${total.tokens.cacheRead}, output ${total.tokens.output} tokens).`, "");
  }
  for (const e of estimates) {
    L.push(`## Estimate for ${e.count} words (${e.label})`, "",
      "Prompt tokens estimated at 3.5 (low) and 2.5 (high) characters per token; output assumed 300 (low) to 1,200 (high) " +
      "tokens per sentence asked, thinking included. `fillin.mjs --count-tokens` gives the exact prompt size (free).", "",
      "| | prefix tokens | user tokens (all) | output tokens (all) | USD | per word | USD, Batch API |", "|---|---:|---:|---:|---:|---:|---:|");
    for (const k of ["low", "high"]) {
      const x = e[k], b = e.batch[k];
      L.push(`| ${k} | ${x.prefixTokens} | ${x.userTokens} | ${x.outputTokens} | ${usd(x.usd)} | ${usd(x.perWord)} | ${usd(b.usd)} |`);
    }
    L.push("");
  }
  L.push("## Per word", "", "| word | class | LÍNO | before | gaps before | asked | written | dropped | to review | accepted | after |",
    "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const x of rep) {
    L.push(`| ${x.o} | ${x.c} | ${x.lino ?? ""} | ${x.before} | ${x.gaps} | ${x.asked} | ${x.written} | ${x.rejected} | ${x.review} | ${x.accepted ?? ""} | ${x.after} |`);
  }
  return L.join("\n") + "\n";
}
