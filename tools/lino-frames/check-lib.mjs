/* The self-check, the second opinion and the review queue: the pure part
 * (issue #22, docs/DLD-PLAN.md §2 steps 3 and 5). tools/lino-frames/check.mjs
 * and accept.mjs do the reading, the writing and the calls; everything here
 * is a function of its arguments, so tests/lino-selfcheck.test.js can hold it
 * without a network, without Greynir and without a model.
 *
 * Still outside the build. What the build reads is
 * content/setningar/lino-rammar.tsv and nothing else; accept.mjs appends
 * lines to that file after the owner's verdicts, and from there on the pair
 * is checked by pipeline/frame_allow.py like one written by hand.
 *
 *   1. fill()        each candidate pair (run.mjs's candidates.tsv) as the
 *                    sentence a pupil would read: the app's own fillFrame,
 *                    the word's BÍN form under the frame's mark. The parse
 *                    of that sentence is parse_check.py's.
 *   2. secondRequest()/secondAnswer()
 *                    Fable 5.2 reads every sentence that parsed, one call a
 *                    noun, and says yes or no to each as written.
 *   3. classify()    where the two models disagree, and a seeded sample of
 *                    where they agree, go to the owner (yfirferd.tsv, shown
 *                    on dist/review.html).
 *   4. decide()      the owner's verdicts: the sample's error rate, and
 *                    whether the batch is to be redone. allowlistLines() is
 *                    what goes into lino-rammar.tsv.
 */

import { createHash } from "node:crypto";
import { substitutable, slotFrame, acceptsNoun, repeatsNoun, fillFrame } from "../../src/js/tasks/frames.js";
import { markGloss, API_VERSION } from "./lib.mjs";

export { API_VERSION };
export const SECOND_MODEL = "claude-fable-5-2";
/* The first pass (Opus) runs at "low": it reads 200 frames a noun. This one
   reads a handful of finished sentences and is the last reader most of them
   get, so it is given more room to think. */
export const SECOND_EFFORT = "medium";
/* Bump when SECOND_INSTRUCTIONS changes: a recorded answer belongs to the
   prompt it answered, and check.mjs will not reuse one across versions. */
export const SECOND_PROMPT_VERSION = 1;

/* ---- the sample and the threshold ----------------------------------------
   The plan: the owner reads every pair the two models disagree on and "a
   random 5% sample of the rest". */
export const SAMPLE_RATE = 0.05;
/* ... but never fewer than 20 pairs (or all of them, when the batch has
   fewer). REDO_THRESHOLD below is 5%, and one wrong sentence among fewer than
   20 is already more than 5%: a smaller sample could only say "none wrong" or
   "redo", so its error rate would mean nothing. The first real run is 20
   words; 5% of its pairs would be one or two sentences. */
export const MIN_SAMPLE = 20;
/* The sample is drawn by a hash of this seed, the batch and the pair, so the
   same batch always gives the same sample, on any machine, and no clock or
   Math.random is involved. */
export const SAMPLE_SEED = "fallaskoli-lino-22";
/* If MORE than this share of the sample is wrong, the batch is redone (plan
   §2.5: "if the sample shows too many errors, the batch is redone with a
   stricter prompt"). The sample stands for the pairs nobody reads; its error
   rate is, as far as anyone knows, theirs. 5%: of the sentences a pupil meets
   from this batch, at most about one in twenty may be one a native speaker
   would hesitate at. The hand-written bank is held to none at all, so this is
   the loosest the program should accept, not a target; it is also the
   smallest rate a sample of 20 can tell from zero (one wrong in 20 is exactly
   5% and passes; two do not). Lower it when batches are large enough for a
   lower rate to be measured (a 2% threshold needs a sample of 50). */
export const REDO_THRESHOLD = 0.05;

const GENDERS = ["kk", "kvk", "hk"];
const clean = (s) => String(s ?? "").replace(/[\t\r\n]+/g, " ").trim();
const keyOf = (word, frame) => `${word}\t${frame}`;

/* ---------- 1. the pair as a sentence ------------------------------------- */

/**
 * Each candidate (a row of candidates.tsv, lib.mjs readTsv) filled in.
 * -> [{ key (orð as lino-rammar.tsv writes it), o, c, d, frame (the text),
 *       mark, slot, opus (the first model's reason), run,
 *       sentences: [{ text, form }]   one per form BÍN has under the mark,
 *       error: string|null }]         why it cannot be filled at all
 *
 * The filling is the app's (tasks/frames.js fillFrame), and so are the
 * tests: a pair the app would not show even if it were written is refused
 * here, in the words the owner reads. BÍN sometimes has two forms in one
 * cell (*hendi* and *hönd*); the app may show either, so both are made and
 * both must pass.
 */
export function fill(candidates, lex) {
  const byText = new Map(lex.sentences.map((s) => [s.t, s]));
  return candidates.map((cand) => {
    const [o, g] = String(cand["orð"]).split("|");
    const c = g || cand["kyn"];
    const row = { key: cand["orð"], o, c, d: "", frame: cand["rammi"], mark: cand["mynd"], slot: null,
      opus: cand["rök"] || "", run: cand["keyrsla"] || "", sentences: [], error: null };
    const stop = (why) => ({ ...row, error: why });
    if (!GENDERS.includes(c)) return stop(`kynið „${c}“ er ekki kk, kvk eða hk`);
    const w = lex.nouns.find((x) => x.o === o && x.c === c);
    if (!w) return stop(`„${o}“ (${c}) er ekki nafnorð í orðaforðanum`);
    row.d = w.d || "";
    const s = byText.get(row.frame);
    if (!s) return stop("ramminn er ekki (lengur) setning í setningabankanum, staf fyrir staf");
    if (!substitutable(s)) return stop("ramminn tekur engin önnur orð");
    const mark = s.tok[s.slot].m;
    row.slot = s.slot;
    if (row.mark && row.mark !== mark) return stop(`eyðan er nú ${mark} en var ${row.mark} þegar líkanið las rammann`);
    row.mark = mark;
    if (repeatsNoun(s, s.slot, w)) return stop(`„${o}“ stendur þegar í setningunni`);
    const frame = slotFrame(s);
    if (!acceptsNoun({ ...frame, al: [...(frame.al || []), `${o}|${c}`] }, w, mark)) {
      return stop("málfræðin leyfir orðið ekki í rammann (kyn, í/á, fleirtala, greinir eða engin mynd í BÍN)");
    }
    row.sentences = w.forms[mark].map((form) => ({ form, text: fillFrame({ s, i: s.slot }, w, form).t }));
    return row;
  });
}

/** What parse_check.py reads: one item per sentence, `id` = "pair.variant". */
export function parseItems(rows) {
  return rows.flatMap((r, i) => r.sentences.map((x, k) => ({ id: `${i}.${k}`, text: x.text, frame: r.frame,
    lemma: r.o, gender: r.c, mark: r.mark, slot: r.slot })));
}

/**
 * The parse's verdicts put on the rows: `machine` { ok, why } per row. A pair
 * passes only if every one of its sentences does; a sentence with no verdict
 * (the parse did not run for it) fails, and says so.
 * `verdict(row, sentence, id)` -> { ok, why } | undefined.
 */
export function withParse(rows, verdict) {
  return rows.map((r, i) => {
    if (r.error) return { ...r, machine: { ok: false, why: r.error } };
    for (const [k, x] of r.sentences.entries()) {
      const v = verdict(r, x, `${i}.${k}`);
      if (!v) return { ...r, machine: { ok: false, why: `engin þáttun til fyrir „${x.text}“` } };
      if (!v.ok) return { ...r, machine: { ok: false, why: clean(v.why) || "þáttunin hafnar setningunni" } };
    }
    return { ...r, machine: { ok: true, why: "" } };
  });
}

/* ---------- 2. the second opinion ------------------------------------------ */

export const SECOND_INSTRUCTIONS = `You are checking example sentences for an Icelandic vocabulary program for 10–16-year-olds, many of whom have a developmental language disorder. A native-speaking teacher must be able to show every sentence to a child without hesitating.

Each sentence was made by a program: an existing, hand-written sentence had one noun taken out and another noun put in its place, in the form the Icelandic inflection database (BÍN) gives for that case, number and definiteness. Nobody has read the result.

In each request you get ONE noun, its dictionary definition, and numbered sentences with that noun in them. After each sentence: the noun's form as it stands there, and which form it is meant to be.

For each sentence, decide whether it is, EXACTLY AS WRITTEN, correct, natural, meaningful Icelandic. Read the whole sentence, not the noun alone:
- the form: is this the right form of the word in this place, and does everything that should agree with it agree?
- the company it keeps: the verb or preposition it stands with (í or á, the case the verb takes, fixed collocations), the number and the article (a word that is not normally counted, or not normally said with the article, in a plural or definite slot);
- the meaning, with the word in its everyday sense (the definition): would someone actually say this?

Answer no when a native speaker would hesitate: the sentence is wrong, odd, forced, figurative, comic, ambiguous, or only possible in a context the sentence does not give. Be strict. A wrong sentence is worse than a missing one, and it is fine to say no to all of them. Judge each sentence on its own.

Answer with JSON only: {"sentences": [{"n": <number>, "ok": true or false, "why": "<at most 12 English words>"}]}, one entry for every numbered sentence.`;

const GENDER_NAME = { kk: "masculine", kvk: "feminine", hk: "neuter" };

/** The sentences of one noun, numbered from 1 in the order they are asked. */
export function nounGroups(rows) {
  const groups = new Map();
  for (const r of rows) {
    if (!r.machine?.ok) continue;
    const id = `${r.o}|${r.c}`;
    if (!groups.has(id)) groups.set(id, { o: r.o, c: r.c, d: r.d, items: [] });
    const g = groups.get(id);
    for (const x of r.sentences) g.items.push({ n: g.items.length + 1, row: r, text: x.text, form: x.form });
  }
  return [...groups.values()];
}

export function secondUserText(group) {
  return [
    `Noun: ${group.o} (${GENDER_NAME[group.c] || group.c})`,
    `Definition: ${group.d || "(none given)"}`,
    `Sentences (${group.items.length}):`,
    ...group.items.map((x) => `${x.n}. ${x.text} (${x.form}: ${markGloss(x.row.mark)})`),
  ].join("\n");
}

export const SECOND_SCHEMA = {
  type: "object",
  properties: {
    sentences: {
      type: "array",
      items: {
        type: "object",
        properties: { n: { type: "integer" }, ok: { type: "boolean" }, why: { type: "string" } },
        required: ["n", "ok", "why"],
        additionalProperties: false,
      },
    },
  },
  required: ["sentences"],
  additionalProperties: false,
};

/** The body of POST /v1/messages for one noun: the same shape as the first
    pass's (lib.mjs request), another model. The instructions are too short
    to be worth caching. */
export function secondRequest(group, { maxTokens = 8000 } = {}) {
  return {
    model: SECOND_MODEL,
    max_tokens: maxTokens,
    system: [{ type: "text", text: SECOND_INSTRUCTIONS }],
    messages: [{ role: "user", content: secondUserText(group) }],
    output_config: { effort: SECOND_EFFORT, format: { type: "json_schema", schema: SECOND_SCHEMA } },
  };
}

/**
 * One response's verdicts. -> { verdicts: Map(n -> { ok, why }), error }
 * Every numbered sentence must be answered, once, with a boolean; anything
 * less is an error for the whole noun and none of its sentences is judged
 * (they stay "óathugað": neither accepted nor in the queue).
 */
export function secondAnswer(response, group) {
  const out = { verdicts: new Map(), error: null };
  if (!response || response.type === "error") {
    out.error = `API error: ${response?.error?.message || "no response"}`;
    return out;
  }
  if (response.stop_reason === "max_tokens") { out.error = "stopped at max_tokens"; return out; }
  if (response.stop_reason === "refusal") { out.error = "refused"; return out; }
  const text = (response.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  let parsed;
  try { parsed = JSON.parse(text); } catch { out.error = `not JSON: ${text.slice(0, 80)}`; return out; }
  if (!parsed || !Array.isArray(parsed.sentences)) { out.error = "no sentences array"; return out; }
  const asked = new Set(group.items.map((x) => x.n));
  for (const v of parsed.sentences) {
    if (!v || !asked.has(v.n) || typeof v.ok !== "boolean") continue;   // not asked about: ignored
    if (out.verdicts.has(v.n)) { out.error = `sentence ${v.n} answered twice`; out.verdicts.clear(); return out; }
    out.verdicts.set(v.n, { ok: v.ok, why: clean(v.why) });
  }
  const missing = [...asked].filter((n) => !out.verdicts.has(n));
  if (missing.length) { out.error = `no verdict for sentence ${missing.join(", ")}`; out.verdicts.clear(); }
  return out;
}

/** The second model's verdicts put on the rows: `second` { ok, why } | null
    (null: not asked, or its noun's answer was an error). A pair is a yes
    only when every one of its sentences is. */
export function withSecond(rows, groups, answers) {
  const by = new Map();
  groups.forEach((g, i) => {
    const a = answers[i];
    if (!a || a.error) return;
    for (const x of g.items) {
      const v = a.verdicts.get(x.n);
      const cur = by.get(x.row) || { ok: true, yes: [], no: [] };
      cur.ok = cur.ok && v.ok;
      if (v.why) (v.ok ? cur.yes : cur.no).push(v.why);
      by.set(x.row, cur);
    }
  });
  return rows.map((r) => {
    const v = by.get(r);
    /* a no is explained by the sentences that got the no */
    return { ...r, second: v ? { ok: v.ok, why: (v.ok ? v.yes : v.no).join(" / ") } : null };
  });
}

/** Token counts of many responses' `usage`, summed (no prices: the report
    gives what the API measured, and the pricing page says what it costs). */
export function addUsage(list) {
  const t = { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 };
  for (const u of list) {
    if (!u) continue;
    t.input += u.input_tokens || 0;
    t.cacheWrite += u.cache_creation_input_tokens || 0;
    t.cacheRead += u.cache_read_input_tokens || 0;
    t.output += u.output_tokens || 0;
  }
  return t;
}

/* ---------- 3. the review queue --------------------------------------------- */

export const STATUS = {
  rejected: "vél hafnar",      // cannot be filled, or the parse refuses the sentence
  unchecked: "óathugað",       // the second model's answer for this noun was an error
  disagree: "ósammála",        // Opus yes, Fable no -> the owner
  sample: "úrtak",             // both yes, drawn into the sample -> the owner
  agreed: "samþykkt",          // both yes, not drawn: nobody reads it
};

const sampleHash = (batch, r) =>
  createHash("sha256").update(`${SAMPLE_SEED}\n${batch}\n${r.key}\n${r.frame}`).digest("hex");

/** How many of `n` agreed pairs the owner reads. */
export const sampleSize = (n) => Math.min(n, Math.max(Math.ceil(n * SAMPLE_RATE), MIN_SAMPLE));

/**
 * Every row gets its `status`. `kept` is the queue as it stands on disk
 * (readQueue) when the check is run again on a batch that has grown: a pair
 * the owner has already judged as part of the sample stays in the sample, so
 * no verdict is thrown away and none changes what it counted toward.
 */
export function classify(rows, batch, kept = new Map()) {
  const out = rows.map((r) => ({ ...r, status:
    !r.machine?.ok ? STATUS.rejected : !r.second ? STATUS.unchecked : !r.second.ok ? STATUS.disagree : null }));
  const agreed = out.filter((r) => r.status === null);
  const judged = (r) => {
    const q = kept.get(keyOf(r.key, r.frame));
    return !!q && q.reason === STATUS.sample && !!q.verdict;
  };
  const order = agreed.map((r) => ({ r, first: judged(r) ? 0 : 1, h: sampleHash(batch, r) }))
    .sort((a, b) => a.first - b.first || (a.h < b.h ? -1 : a.h > b.h ? 1 : 0));
  const k = Math.max(sampleSize(agreed.length), order.filter((x) => !x.first).length);
  order.forEach((x, i) => { x.r.status = i < k ? STATUS.sample : STATUS.agreed; });
  return out;
}

const sentenceOf = (r) => r.sentences.map((x) => x.text).join(" / ");
const yesNo = (v) => (v == null ? "" : v.ok ? "já" : "nei");

export const CHECKED_COLUMNS = ["orð", "kyn", "rammi", "mynd", "setning", "vél", "vél: rök", "Fable", "Fable: rök",
  "staða", "Opus: rök", "keyrsla"];

/** checked.tsv: every candidate of the batch and what became of it. */
export function checkedTsv(rows, batch) {
  const head = `# Sjálfsprófun á LÍNO-2-pörum: keyrsla ${batch} (tools/lino-frames/check.mjs, mál #22)
#
# Hvert par úr candidates.tsv, útfyllt með mynd orðsins úr BÍN, og hvað varð um það.
# Enginn á að breyta þessari skrá; dómar eigandans fara í yfirferd.tsv.
#
# Dálkar: orð, kyn, rammi, mynd (BÍN-mark eyðunnar), setning (útfyllt), vél (já / nei:
# þáttar Greynir setninguna eins og rammann, án athugasemda frá parse_guard?), vél: rök,
# Fable (já / nei; autt = ekki spurt), Fable: rök (á ensku), staða, Opus: rök (á ensku), keyrsla
#
# staða:  ${STATUS.agreed} = bæði líkönin sögðu já og enginn les parið
#         ${STATUS.sample} = bæði sögðu já; parið er í úrtakinu sem eigandinn les
#         ${STATUS.disagree} = Opus sagði já en Fable nei; eigandinn sker úr
#         ${STATUS.rejected} = setningin stenst ekki þáttunina; parið fer ekki lengra
#         ${STATUS.unchecked} = svar Fable vantar eða er gallað; keyrðu check.mjs aftur
#
`;
  const lines = rows.map((r) => [r.key, r.c, r.frame, r.mark, sentenceOf(r), yesNo(r.machine), r.machine?.why,
    yesNo(r.second), r.second?.why, r.status, r.opus, r.run].map(clean).join("\t"));
  return head + CHECKED_COLUMNS.join("\t") + "\n" + lines.join("\n") + (lines.length ? "\n" : "");
}

export const QUEUE_FILE = "yfirferd.tsv";
export const QUEUE_COLUMNS = ["dómur", "setning", "orð", "rammi", "ástæða", "Opus", "Fable", "athugasemd"];
export const YES = "já", NO = "nei";

/** yfirferd.tsv: the pairs the owner judges. `kept` (readQueue of the file
    as it stands) carries verdicts and comments already written over. */
export function queueTsv(rows, batch, kept = new Map()) {
  const head = `# LÍNO-2-pör til yfirferðar: keyrsla ${batch} (tools/lino-frames/check.mjs, mál #22)
#
# Hver lína er setning sem forritið bjó til: LÍNO-2-nafnorð sett í ramma úr
# setningabankanum, í þeirri mynd sem BÍN gefur. Opus 5.5 taldi að merkingin gengi
# upp og Greynir þáttar setninguna eins og rammann. Línan er hér af annarri af
# tveimur ástæðum:
#   ${STATUS.disagree}  Fable 5.2 las setninguna og hafnaði henni (rökin eru í dálkinum „Fable“)
#   ${STATUS.sample}     bæði líkönin samþykktu setninguna og hún lenti í slembiúrtaki
#             (${Math.round(SAMPLE_RATE * 100)}% af samþykktu pörunum, þó aldrei færri en ${MIN_SAMPLE}). Úrtakið sýnir hve mikið
#             er af villum í pörunum sem enginn les.
#
# SVONA ER DÆMT: lestu setninguna og skrifaðu já eða nei í dálkinn „dómur“, fremst
# í línunni. Yfirlitssíðan (node tools/review.mjs, dist/review.html) sýnir allar
# setningarnar undir „LÍNO-2: pör til yfirferðar“, með skrá og línunúmeri.
#   já   setningin er rétt og eðlileg íslenska sem má sýna barni
#   nei  Íslendingur myndi hika við hana
# Í dálkinn „athugasemd“ má skrifa hvað sem er. Breyttu engu öðru í línunni.
# Þegar allar línur hafa fengið dóm:
#   node tools/lino-frames/accept.mjs --by "eigandi, <dagsetning>"
# Ef meira en ${Math.round(REDO_THRESHOLD * 100)}% úrtaksins fær nei er keyrslan merkt til endurgerðar og pörin sem
# enginn las fara ekki inn í content/setningar/lino-rammar.tsv.
#
# Dálkar: dómur (já / nei; autt = ekki búið að dæma), setning (eins og nemandinn sæi
# hana), orð, rammi (setningin úr setningar.tsv), ástæða (${STATUS.disagree} / ${STATUS.sample}), Opus (rök
# líkansins, á ensku), Fable (já eða nei og rök, á ensku), athugasemd
#
`;
  const queue = rows.filter((r) => r.status === STATUS.disagree || r.status === STATUS.sample)
    .sort((a, b) => (a.status === b.status ? 0 : a.status === STATUS.disagree ? -1 : 1));
  const lines = queue.map((r) => {
    const old = kept.get(keyOf(r.key, r.frame)) || {};
    /* a verdict given for another reason (the pair was in the sample, and is
       now a disagreement, or the reverse) still says what the owner thinks of
       the sentence, as long as the sentence is the same */
    const same = old.sentence === sentenceOf(r);
    return [same ? old.verdict : "", sentenceOf(r), r.key, r.frame, r.status, r.opus,
      `${yesNo(r.second)}: ${r.second.why}`, same ? old.comment : ""].map(clean).join("\t");
  });
  return head + QUEUE_COLUMNS.join("\t") + "\n" + lines.join("\n") + (lines.length ? "\n" : "");
}

/** A TSV with # comments and one header line -> objects keyed by column
    name, each with its `line` number. Missing trailing cells are empty (an
    editor may strip the tabs at the end of a line). */
export function readRows(text) {
  let head = null;
  const out = [];
  text.split("\n").forEach((raw, i) => {
    const l = raw.replace(/\r$/, "");
    if (!l.trim() || l.startsWith("#")) return;
    const cells = l.split("\t");
    if (!head) { head = cells.map((c) => c.trim()); return; }
    out.push({ line: i + 1, ...Object.fromEntries(head.map((h, k) => [h, (cells[k] ?? "").trim()])) });
  });
  return out;
}

/** yfirferd.tsv as written (and edited) -> Map("orð\trammi" -> { verdict,
    comment, reason, sentence, line }). A verdict is lower-cased; whether it
    is one of já/nei is decide()'s business. */
export function readQueue(text) {
  const out = new Map();
  for (const r of readRows(text)) {
    out.set(keyOf(r["orð"], r["rammi"]), { verdict: (r["dómur"] || "").toLowerCase(), comment: r["athugasemd"] || "",
      reason: r["ástæða"], sentence: r["setning"], word: r["orð"], frame: r["rammi"], line: r.line });
  }
  return out;
}

/* ---------- 4. the owner's verdicts ------------------------------------------ */

/**
 * What the owner's verdicts mean for the batch.
 *   checked  rows of checked.tsv (readRows)
 *   queue    readQueue(yfirferd.tsv)
 * -> { problems: [string]   (a row without a verdict, a verdict that is not
 *                            já/nei, a queue that does not match the batch);
 *                            when there are any, nothing else is decided
 *      sample: { n, wrong, rate }, redo: boolean,
 *      disagreements: { n, yes },
 *      read:   [{ word, frame }]   pairs the owner said yes to
 *      unread: [{ word, frame }]   pairs both models accepted and nobody read;
 *                                  empty when the batch is to be redone }
 *
 * Only the sample counts toward the error rate: it was drawn at random from
 * the pairs both models accepted, so it says how often the two are wrong
 * together. The disagreements were chosen BECAUSE one model objected, and say
 * nothing about the rest.
 *
 * A pair the owner read and said yes to is kept even when the batch is redone:
 * a person has read that sentence, which is all any line of lino-rammar.tsv
 * claims.
 */
export function decide(checked, queue) {
  const problems = [];
  const sample = { n: 0, wrong: 0, rate: 0 }, disagreements = { n: 0, yes: 0 };
  const read = [], unread = [];
  const unchecked = checked.filter((r) => r["staða"] === STATUS.unchecked).length;
  if (unchecked) problems.push(`${unchecked} pör eru „${STATUS.unchecked}“ (svar Fable vantar): keyrðu check.mjs aftur áður en dæmt er`);
  const expected = new Set();
  for (const r of checked) {
    const st = r["staða"], k = keyOf(r["orð"], r["rammi"]);
    if (st === STATUS.agreed) { unread.push({ word: r["orð"], frame: r["rammi"] }); continue; }
    if (st !== STATUS.sample && st !== STATUS.disagree) continue;
    expected.add(k);
    const q = queue.get(k);
    if (!q) { problems.push(`vantar í ${QUEUE_FILE}: ${r["orð"]} — ${r["rammi"]}`); continue; }
    if (q.verdict !== YES && q.verdict !== NO) {
      problems.push(`${QUEUE_FILE}:${q.line}: ${q.verdict ? `dómurinn „${q.verdict}“ er hvorki já né nei` : "enginn dómur"} (${r["orð"]})`);
      continue;
    }
    const yes = q.verdict === YES;
    if (st === STATUS.sample) { sample.n++; if (!yes) sample.wrong++; }
    else { disagreements.n++; if (yes) disagreements.yes++; }
    if (yes) read.push({ word: r["orð"], frame: r["rammi"] });
  }
  for (const [k, q] of queue) {
    if (!expected.has(k)) problems.push(`${QUEUE_FILE}:${q.line}: parið er ekki í röðinni samkvæmt checked.tsv (${q.word})`);
  }
  if (problems.length) return { problems, sample, redo: false, disagreements, read: [], unread: [] };
  sample.rate = sample.n ? sample.wrong / sample.n : 0;
  const redo = sample.rate > REDO_THRESHOLD;
  return { problems, sample, redo, disagreements, read, unread: redo ? [] : unread };
}

const pct = (x) => `${(Math.round(x * 1000) / 10).toString().replace(".", ",")}%`;

/** What decide() found, in the owner's language, for the terminal and batch.json. */
export function verdictSummary(d) {
  const L = [`úrtak: ${d.sample.n} pör lesin, nei: ${d.sample.wrong} (${pct(d.sample.rate)}; mörkin eru ${pct(REDO_THRESHOLD)})`,
    `ósammála: ${d.disagreements.n} pör lesin, já: ${d.disagreements.yes}`];
  L.push(d.redo
    ? "KEYRSLAN ER MERKT TIL ENDURGERÐAR: of margar villur í úrtakinu. Pörin sem enginn las fara ekki inn."
    : `keyrslan stenst: ${d.unread.length} pör sem enginn las fara inn ásamt þeim sem fengu já`);
  return L;
}

/**
 * The lines to append to content/setningar/lino-rammar.tsv (columns orð,
 * rammi, yfirfarið af, athugasemd), without the pairs the file already has.
 *   existing  the file's rows now (readRows)
 *   by        who read the pairs in the queue, as the column is written
 *             ("eigandi, 28.11.2026")
 * -> { lines: [string], added: number, skipped: number }
 */
export function allowlistLines(d, existing, { by, batch }) {
  const have = new Set(existing.map((r) => keyOf(r["orð"], r["rammi"])));
  const fresh = (list) => list.filter((p) => !have.has(keyOf(p.word, p.frame)) && have.add(keyOf(p.word, p.frame)));
  const read = fresh(d.read), unread = fresh(d.unread);
  const lines = [];
  if (read.length) {
    lines.push(`# ---- LÍNO-2, keyrsla ${batch}: pör sem voru lesin og samþykkt ----`);
    for (const p of read) lines.push([p.word, p.frame, clean(by)].join("\t"));
  }
  if (unread.length) {
    lines.push(`# ---- LÍNO-2, keyrsla ${batch}: pör sem Opus 5.5 og Fable 5.2 samþykktu bæði og enginn las. ----`,
      `# ---- Úrtak úr þeim var lesið: ${d.sample.n} pör, nei: ${d.sample.wrong}. ----`);
    const who = `Opus 5.5 og Fable 5.2; úrtak lesið: ${clean(by)}`;
    for (const p of unread) lines.push([p.word, p.frame, who].join("\t"));
  }
  return { lines, added: read.length + unread.length, skipped: d.read.length + d.unread.length - read.length - unread.length };
}
