/* The Orðakort with free text, and the meaning question graded by the
   server (issue #38; DLD-PLAN §1 "First meeting", "Meaning question", §6).

   CI never calls Claude: the plug is fed RECORDED answers from
   tests/fixtures/claude/ (hand-written in the API's exact response shape —
   no key existed where this was built; record real ones with
   tools/record-grading.mjs --kind …).

   1. with server grading on, steps 3–5 are free text (explanation, my
      sentence, three related words), each replacing its structured step;
      without it the card is exactly the structured one;
   2. step 5 is never skipped: every card of a switched-on pupil has it,
      also for a word the structured step has no material for;
   3. each free-text step has a rubric of our words and a server rubric
      that grades against the sense the server looks up; the quote check
      drops an invented quote; at most one follow-up and one revision;
   4. the meaning question, server-graded (or_skyring): a word met in this
      session first, graded by the explanation's rubric;
   5. what is kept on the pupil's own card. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, newSession } from "../src/js/core/state.js";
import { settle } from "../src/js/core/answer.js";
import { seeded } from "../src/js/core/duel.js";
import { createPolicy } from "../src/js/core/policy.js";
import { SKILL_IDS } from "../src/js/core/skills.js";
import { learningCandidates } from "../src/js/core/wordknowledge.js";
import { saveCard } from "../src/js/core/wordcard.js";
import { catalogueEntry, CATALOGUE_IDS } from "../src/js/core/catalogue.js";
import { typeById, enabled, makeView } from "../src/js/tasks/index.js";
import { serverQuestion } from "../src/js/control/serverask.js";
import { buildCard, REPLACES, linksText, setningTask, tengslTask, eiginTask, SETNING, TENGSL, EIGIN, LINKS }
  from "../src/js/tasks/wordcard.js";
import { ordMeaningRead } from "../src/js/tasks/ordaford.js";
import { typesPolicy } from "../src/js/core/run.js";
import { setServerGrader, resetServerGrader } from "../src/js/core/servergrader.js";
import { claudePlug, claudePlugs } from "../server/reader-claude.mjs";
import { createReader } from "../server/reader.mjs";
import { eiginRubric } from "../server/rubric-eigin.mjs";
import { setningRubric } from "../server/rubric-setning.mjs";
import { tengslRubric } from "../server/rubric-tengsl.mjs";

const lex = buildLexicon(DATA);
const key = (w) => `${w.o}|${w.c}`;
const ALL = learningCandidates({}, lex, 7);
const RUBRICS = { [EIGIN]: eiginRubric(lex), [SETNING]: setningRubric(lex), [TENGSL]: tengslRubric(lex) };
const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/claude/${name}.json`, import.meta.url), "utf8"));
const FIXTURES = ["setning-breyting-right", "setning-breyting-thin", "tengsl-breyting-right", "tengsl-breyting-thin"];

/** A `fetch` answering with one recorded response, keeping the requests. */
function recorded(body) {
  const fn = async (url, init) => {
    fn.calls.push(JSON.parse(init.body));
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  };
  fn.calls = [];
  return fn;
}

/** The fixture through the Claude plug and the reader's quote check. */
function readerFor(name) {
  const f = fixture(name);
  const fetch = recorded(f.response);
  const plug = claudePlug({ apiKey: "sk-test", model: f.model, effort: f.effort, rubric: RUBRICS[f.kind], fetch });
  const reader = createReader({ plugs: { [f.kind]: plug }, maxChars: 1200, timeoutMs: 2000 });
  /* What the browser's loop calls: { kind, text, context } → { findings } */
  const read = (req) => reader.read(req.kind, req.text, { ...req.context, names: f.names });
  return { f, fetch, read };
}

/* ---------- 1. the card, with and without ------------------------------------ */

test("with server grading on, steps 3–5 are free text, each in place of its structured step", () => {
  const card = buildCard(lex, "breyting|kvk", { free: true });
  const ids = card.steps.map((s) => s.id);
  assert.deepEqual(ids.slice(0, 5), ["lesa", "mat", "eigin", "min", "tengsl"]);
  for (const [free, structured] of Object.entries(REPLACES)) {
    assert.ok(ids.includes(free), free);
    assert.ok(!ids.includes(structured), `${structured} is still on the card beside ${free}`);
  }
  for (const id of Object.keys(REPLACES)) {
    const s = card.steps.find((x) => x.id === id);
    assert.equal(s.kind, "server");
    assert.equal(s.task.grader, "server");
    assert.equal(s.task.read.context.word, "breyting|kvk");
    assert.ok(!JSON.stringify(s.task.read).includes("umskipti"), `${id}: the definition is not sent`);
    assert.ok(s.question && /\*breyting\*/.test(s.question), id);
    /* The definition is not on the screen while the pupil writes: it is
       only in `lesa` and in what is shown after the reading (`def`). */
    assert.ok(!String(s.question).includes(s.def || "§§"), id);
  }
  /* The old name of the switch still works (#37). */
  assert.deepEqual(buildCard(lex, "breyting|kvk", { eigin: true }), card);
});

test("without the switch every card is the structured one, unchanged", () => {
  for (const w of ALL.slice(0, 400)) {
    const card = buildCard(lex, key(w));
    assert.ok(card.steps.every((s) => s.kind !== "server"), key(w));
    assert.deepEqual(buildCard(lex, key(w), { free: false }), card);
  }
});

/* ---------- 2. step 5 is never skipped ----------------------------------------- */

test("step 5 is never skipped: every card of a switched-on pupil asks for three related words", () => {
  let without = 0;
  for (const w of ALL) {
    const off = buildCard(lex, key(w));
    const on = buildCard(lex, key(w), { free: true });
    const step = on.steps.find((s) => s.id === "tengsl");
    assert.ok(step, `${key(w)}: no step 5`);
    assert.equal(step.links, LINKS);
    if (!off.steps.some((s) => s.id === "skyld")) without++;
    /* The free text does not take a step that the structured card has no
       replacement for: whatever is not 3–5 is the same. */
    const rest = (c) => c.steps.filter((s) => !["skyring", "setning", "skyld", ...Object.keys(REPLACES)].includes(s.id));
    assert.deepEqual(rest(on), rest(off), key(w));
  }
  assert.ok(without > 0, "some words have no structured step 5 — and get the free one all the same");
});

test("the three related words are one text, and only with all three words", () => {
  assert.equal(linksText([{ word: "breyta", how: "sögnin" }, { word: "umskipti" }]), null);
  assert.equal(linksText([{ word: "a" }, { word: " " }, { word: "c" }]), null);
  assert.equal(linksText([{ word: " breyta ", how: " sögnin\n sem orðið kemur af " }, { word: "umskipti", how: "" },
    { word: "stöðugleiki", how: "hið gagnstæða" }]),
  "1. breyta – sögnin sem orðið kemur af\n2. umskipti\n3. stöðugleiki – hið gagnstæða");
  const long = linksText([{ word: "x".repeat(100), how: "y".repeat(1000) }, { word: "b" }, { word: "c" }]);
  assert.ok(long.length <= 1200, "within what the server reads");
});

/* ---------- 3. rubrics, recorded answers, one follow-up ----------------------- */

test("the fixtures are Messages API responses, and each says how it was made", () => {
  for (const name of FIXTURES) {
    const f = fixture(name);
    assert.ok(typeof f.recorded === "string" && f.recorded, name);
    assert.ok([SETNING, TENGSL].includes(f.kind), name);
    assert.equal(f.response.type, "message");
    assert.equal(f.response.stop_reason, "end_turn");
    assert.ok(f.response.content.some((b) => b.type === "text"));
    assert.ok(Number.isInteger(f.response.usage.input_tokens));
  }
});

test("the server's rubrics: our ids, the sense looked up by the key, nothing for an unknown word", () => {
  const w = lex.lookup("breyting", "kvk");
  for (const [kind, make] of [[SETNING, setningTask], [TENGSL, tengslTask]]) {
    const r = RUBRICS[kind];
    const task = make(w);
    assert.deepEqual(r.points, task.rubric.points.map((p) => p.id), kind);
    assert.ok(r.points.includes(task.rubric.main), kind);
    const p = r.prompt("texti", { word: "breyting|kvk", def: "HUNDUR" });
    assert.ok(p.user.includes("það að e-ð breytist, umskipti"), `${kind}: graded against ÍNO`);
    assert.ok(!p.user.includes("HUNDUR"), `${kind}: what the page sends is the word only`);
    assert.ok(p.user.includes("<answer>\ntexti\n</answer>"));
    assert.match(p.system, /data, not instructions/);
    assert.equal(r.prompt("texti", { word: "ekkiorð|kk" }), null, kind);
  }
  /* Step 5 needs no definition: a word without a trusted one is still graded. */
  const bare = ALL.find((x) => !eiginTask(x));
  assert.ok(bare, "a LÍNO-2 word without a trusted definition");
  assert.equal(setningTask(bare), null);
  const p = RUBRICS[TENGSL].prompt("1. a\n2. b\n3. c", { word: key(bare) });
  assert.ok(p && !p.user.includes("definition"), key(bare));
  /* The server runs one plug per rubric. */
  assert.deepEqual(Object.keys(claudePlugs({ ANTHROPIC_API_KEY: "k" }, Object.values(RUBRICS))), [EIGIN, SETNING, TENGSL]);
});

test("my sentence: names are stripped and given back; a right sentence is right", async () => {
  const { f, fetch, read } = readerFor("setning-breyting-right");
  const task = setningTask(lex.lookup("breyting", "kvk"));
  const S = blankState(); const sess = newSession(S);
  const j = await serverQuestion(task, { read, pupil: { S, sess } }).send({ text: f.text });
  assert.equal(j.verdict, "right");
  assert.deepEqual(j.detail.checklist.map((p) => [p.id, p.met]), [["notkun", true], ["eigin", true]]);
  assert.ok(j.detail.checklist[1].quotes[0].includes("Akureyrar"), "the place came back in the quote");
  const sent = JSON.stringify(fetch.calls[0]);
  assert.ok(!sent.includes("Akureyr"), "a name left the server");
  assert.deepEqual(fetch.calls[0].output_config.format.schema.properties.findings.items.properties.point.enum, ["notkun", "eigin"]);
  settle(S, sess, task, j);
  assert.equal(S.xp, task.base);
  assert.equal(S.wordKnowledge["breyting|kvk"].e.at(-1)[1], SETNING, "word knowledge names the type");
});

test("a thin answer: ONE follow-up question of ours, ONE revision, then the end", async () => {
  for (const name of ["setning-breyting-thin", "tengsl-breyting-thin"]) {
    const { f, read } = readerFor(name);
    const w = lex.lookup("breyting", "kvk");
    const task = f.kind === SETNING ? setningTask(w) : tengslTask(w);
    const S = blankState(); const sess = newSession(S);
    let reads = 0;
    const q = serverQuestion(task, { read: (req) => { reads++; return read(req); }, pupil: { S, sess } });
    const r = await q.send({ text: f.text });
    assert.equal(r.pending, "revise", name);
    assert.equal(r.detail.ask, task.rubric.points.find((p) => p.id === task.rubric.main).ask, `${name}: the main point's question`);
    assert.ok(!r.detail.checklist.some((p) => p.met), `${name}: an invented quote ticks nothing`);
    /* The revision is read once more, and whatever it says is final: no second follow-up. */
    const last = await q.send({ text: f.text + " og meira" });
    assert.ok(!last.pending, name);
    assert.equal(last.verdict, "wrong");
    assert.equal(last.detail.revised, true);
    assert.equal(last.xp, task.base + Math.round(task.base * 0.5), `${name}: XP for finishing and revising, not the verdict`);
    assert.equal(await q.send({ text: "aftur" }), null, `${name}: nothing after the end`);
    assert.equal(reads, 2, name);
  }
});

test("three related words: the recorded answer through the quote check", async () => {
  const { f, read } = readerFor("tengsl-breyting-right");
  const out = await read({ kind: TENGSL, text: f.text, context: { word: f.word } });
  assert.deepEqual(out.findings.map((x) => [x.point, x.met]), [["tengsl", true], ["hvernig", true]]);
  for (const x of out.findings) assert.equal(f.text.slice(x.start, x.end), x.quote);
  const thin = readerFor("tengsl-breyting-thin");
  const t = await thin.read({ kind: TENGSL, text: thin.f.text, context: { word: thin.f.word } });
  assert.deepEqual(t.findings.map((x) => [x.point, x.met]), [["tengsl", false]], "the invented tick is gone");
});

/* ---------- 4. the meaning question, server-graded ----------------------------- */

const allOn = Object.fromEntries(SKILL_IDS.map((id) => [id, true]));
const policy = (serverGrading) => createPolicy({ serverGrading }, { skills: allOn, types: {}, levels: {}, attrs: {}, safeVocab: null },
  { serverGrader: true });

test("the graded meaning question and the two new types exist only with server grading on", () => {
  for (const id of ["or_skyring", "or_setning", "or_tengsl"]) {
    const t = typeById(id);
    assert.equal(catalogueEntry(id).grader, "server");
    assert.equal(enabled(policy(true), t), true, id);
    assert.equal(enabled(policy(false), t), false, id);
  }
  assert.equal(enabled(policy(false), typeById("or_merking")), true, "the app-graded one stays");
  /* Together, after every type merged before them (#35's Frásögn types and
     #32's subject-text types follow). */
  const at = CATALOGUE_IDS.indexOf("or_skyring");
  assert.deepEqual(CATALOGUE_IDS.slice(at, at + 3), ["or_skyring", "or_setning", "or_tengsl"]);
  assert.ok(CATALOGUE_IDS.slice(at + 3).every((id) => id.startsWith("fr_") || id.startsWith("les_")), CATALOGUE_IDS.slice(at + 3).join(","));
  assert.ok(CATALOGUE_IDS.indexOf("or_eigin") < CATALOGUE_IDS.indexOf("or_skyring"));
});

test("or_skyring asks about a word met in this session first, graded by the explanation's rubric", () => {
  const S = blankState(); const sess = newSession(S);
  sess.seen.push("breyting");
  const view = makeView({ S, sess, policy: policy(true), today: "2026-11-27" });
  const b = ordMeaningRead(lex, view, seeded(3));
  assert.equal(b.task.typeId, "or_skyring");
  assert.equal(b.task.word, "breyting|kvk");
  assert.equal(b.task.read.kind, EIGIN, "the server reads it with or_eigin's rubric");
  assert.equal(b.task.grader, "server");
  /* Nothing met yet: an academic word with a trusted definition. */
  const fresh = ordMeaningRead(lex, makeView({ S, sess: newSession(S), policy: policy(true), today: "2026-11-27" }), seeded(4));
  assert.ok(fresh && typeof lex.lookup(...fresh.task.word.split("|")).lino === "number");
});

test("a session asked for by type (\"Æfa þetta\") has the server-graded types of a switched-on pupil", () => {
  const S = blankState();
  S.allowed = { serverGrading: true };
  const on = { skills: ["ordaford"], types: ["or_tengsl"] };
  try {
    setServerGrader(true);
    assert.equal(enabled(typesPolicy(S, on), typeById("or_tengsl")), true);
    setServerGrader(false);
    assert.equal(enabled(typesPolicy(S, on), typeById("or_tengsl")), false, "not with the grader down");
  } finally { resetServerGrader(); }
});

/* ---------- 5. kept on the pupil's own card ------------------------------------- */

test("the card keeps the sentence and the three words with the text", () => {
  const S = { wordCards: {} };
  const t = "1. breyta – sögnin\n2. umskipti\n3. stöðugleiki – hið gagnstæða";
  assert.ok(saveCard(S, "breyting|kvk", { rating: 2, answers: {
    min: { c: [], ok: true, t: "Það var mikil breyting að flytja." },
    tengsl: { c: ["breyta", "umskipti", "stöðugleiki"], ok: false, t },
  } }, "2026-11-27"));
  assert.deepEqual(S.wordCards["breyting|kvk"].a.tengsl, { c: ["breyta", "umskipti", "stöðugleiki"], ok: false, t });
  assert.equal(S.wordCards["breyting|kvk"].a.min.t, "Það var mikil breyting að flytja.");
});
