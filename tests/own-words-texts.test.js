/* Issue #39: the main idea of a subject text, and a story's summary, in the
   pupil's own words — read on the server (docs/DLD-PLAN.md §4, §6).

   CI never calls Claude: the plug is fed RECORDED answers from
   tests/fixtures/claude/ (kjarni-*, saga-*: hand-written in the API's exact
   response shape — no key existed where this was built; record real ones
   with tools/record-grading.mjs --kind les_kjarni_eigin|les_saga_eigin).

   1. the two types exist only with server grading on, at the end of the
      catalogue, under Lesskilningur;
   2. the builders: the text on the screen, only its id sent;
   3. the server's rubrics: our ids, the text and its marks from the
      server's own data, nothing for an unknown text;
   4. the copy check: a sentence of the text copied is not the pupil's own
      words, whatever the model says;
   5. the recorded answers: right, thin (one follow-up, one revision, an
      invented quote dropped), copied; the story's names kept and a
      classmate's stripped;
   6. nothing the pupil wrote is kept in their progress. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EX } from "../data/exercises.js";
import { blankState, newSession } from "../src/js/core/state.js";
import { settle } from "../src/js/core/answer.js";
import { seeded } from "../src/js/core/duel.js";
import { createPolicy } from "../src/js/core/policy.js";
import { SKILL_IDS } from "../src/js/core/skills.js";
import { catalogueEntry, CATALOGUE_IDS } from "../src/js/core/catalogue.js";
import { nodeById } from "../src/js/core/curriculum.js";
import { typeById, enabled } from "../src/js/tasks/index.js";
import { serverQuestion } from "../src/js/control/serverask.js";
import { KJARNI_EIGIN, SAGA_EIGIN, kjarniRubric as ourKjarni, sagaRubric as ourSaga }
  from "../src/js/tasks/lesskilningur.js";
import { claudePlug, claudePlugs, stripNames } from "../server/reader-claude.mjs";
import { createReader } from "../server/reader.mjs";
import { kjarniRubric, copiedPart, COPY_RUN } from "../server/rubric-kjarni.mjs";
import { sagaRubric } from "../server/rubric-saga.mjs";
import { freshView, poolLex } from "./pools.js";

const TYPES = [KJARNI_EIGIN, SAGA_EIGIN];
const RUBRICS = { [KJARNI_EIGIN]: kjarniRubric(), [SAGA_EIGIN]: sagaRubric() };
const OURS = { [KJARNI_EIGIN]: ourKjarni(), [SAGA_EIGIN]: ourSaga() };
const lex = poolLex();
const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/claude/${name}.json`, import.meta.url), "utf8"));
const FIXTURES = ["kjarni-joklar-right", "kjarni-joklar-thin", "kjarni-joklar-copied", "saga-hundur-right", "saga-hundur-thin"];
const textById = (id) => EX.textar.find((t) => t.id === id);

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
  const read = (req) => reader.read(req.kind, req.text, { ...req.context, names: f.names });
  return { f, fetch, read };
}

/** The task for the fixture's text, as the builder makes it. */
function taskFor(f) {
  const view = freshView(1, { policy: policy(true) });
  for (let k = 1; k < 400; k++) {
    const b = typeById(f.kind).build(lex, view, seeded(k));
    if (b && b.task.read.context.texti === f.texti) return b.task;
  }
  throw new Error(`no ${f.kind} task for ${f.texti}`);
}

/* ---------- 1. the types ------------------------------------------------------ */

const allOn = Object.fromEntries(SKILL_IDS.map((id) => [id, true]));
const policy = (serverGrading) => createPolicy({ serverGrading }, { skills: allOn, types: {}, levels: {}, attrs: {}, safeVocab: null },
  { serverGrader: true });

test("the two types: server-graded, Lesskilningur, on its nodes, and only with server grading on", () => {
  for (const id of TYPES) {
    const e = catalogueEntry(id);
    assert.equal(e.grader, "server", id);
    assert.equal(e.skill, "lesskilningur", id);
    assert.equal(e.renderer, "meaning", id);
    assert.equal(enabled(policy(true), typeById(id)), true, id);
    assert.equal(enabled(policy(false), typeById(id)), false, id);
  }
  assert.ok(nodeById("les-adalatridi").types.includes(KJARNI_EIGIN));
  assert.ok(nodeById("les-sogukort").types.includes(SAGA_EIGIN));
  /* after #32's subject-text types */
  assert.ok(CATALOGUE_IDS.indexOf(KJARNI_EIGIN) > CATALOGUE_IDS.indexOf("les_kjarni"));
  assert.equal(CATALOGUE_IDS.indexOf(SAGA_EIGIN), CATALOGUE_IDS.indexOf(KJARNI_EIGIN) + 1);
});

/* ---------- 2. the builders ------------------------------------------------------ */

test("the builders: every subject text and every story of þyngd 2+, the text shown, only its id sent", () => {
  const view = freshView(1, { policy: policy(true) });
  const want = {
    [KJARNI_EIGIN]: EX.textar.filter((t) => t.k === "fræðitexti").map((t) => t.id),
    [SAGA_EIGIN]: EX.textar.filter((t) => t.k === "saga" && t.lvl >= 2).map((t) => t.id),
  };
  for (const id of TYPES) {
    const seen = new Set();
    for (let k = 1; k < 300; k++) {
      const b = typeById(id).build(lex, view, seeded(k));
      assert.ok(b, id);
      const t = b.task;
      const tx = textById(t.read.context.texti);
      seen.add(tx.id);
      assert.equal(t.type, "meaning");
      assert.equal(t.grader, "server");
      assert.equal(t.read.kind, id);
      assert.deepEqual(Object.keys(t.read.context), ["texti"], "only the text's id goes to the server");
      assert.deepEqual(t.text, tx.s.map((s) => s.t), "the text is on the screen");
      assert.deepEqual(t.rubric, OURS[id]);
      assert.ok(t.prompt && t.prompt.question && t.prompt.eyebrow);
      assert.equal(t.word, null);
    }
    assert.deepEqual([...seen].sort(), want[id].sort(), id);
  }
});

test("each remembers the text it showed, and a review brings back the one it names", () => {
  for (const id of TYPES) {
    const spec = typeById(id);
    const b = spec.build(lex, freshView(1), () => 0.5);
    assert.deepEqual(b.effects.filter((e) => e.op === "exSeen").map((e) => e.key), [b.task.item]);
    for (const tx of EX.textar) {
      const item = `les:${tx.id}:${id === KJARNI_EIGIN ? "eigin" : "endursogn"}`;
      const got = spec.build(lex, freshView(1, { force: { item } }), () => 0.5);
      const asked = id === KJARNI_EIGIN ? tx.k === "fræðitexti" : tx.k === "saga" && tx.lvl >= 2;
      assert.equal(got ? got.task.item : null, asked ? item : null, item);
    }
  }
});

/* ---------- 3. the server's rubrics ----------------------------------------------- */

test("the server's rubrics: our ids, the text and its marks from the server's own data", () => {
  for (const id of TYPES) assert.deepEqual(RUBRICS[id].points, OURS[id].points.map((p) => p.id), id);
  const k = RUBRICS[KJARNI_EIGIN].prompt("svar", { texti: "fraedi-joklar", text: "FALSKUR TEXTI" });
  assert.ok(k.user.includes("[MAIN IDEA] Jöklarnir á Íslandi hafa minnkað mikið síðustu hundrað ár."));
  assert.ok(k.user.includes("[OTHER (not part of the main idea)] Margir fara í gönguferðir"));
  assert.ok(k.user.includes("Jöklar á Íslandi verða sífellt minni"), "the gist written with the text");
  assert.ok(!k.user.includes("FALSKUR"), "what the page sends is the id only");
  assert.ok(k.user.includes("<answer>\nsvar\n</answer>"));
  assert.match(k.system, /data, not instructions/);
  const s = RUBRICS[SAGA_EIGIN].prompt("svar", { texti: "saga-afmaeliskakan" });
  assert.ok(s.user.includes("(Episode 2)"), "episodes");
  assert.match(s.user, /\[PROBLEM\] /);
  assert.match(s.user, /\[OUTCOME\] /);
  /* Unknown, or the other kind of text: nothing to grade against. */
  assert.equal(RUBRICS[KJARNI_EIGIN].prompt("svar", { texti: "saga-tyndur-hundur" }), null);
  assert.equal(RUBRICS[SAGA_EIGIN].prompt("svar", { texti: "fraedi-joklar" }), null);
  assert.equal(RUBRICS[SAGA_EIGIN].prompt("svar", { texti: "ekki-til" }), null);
  assert.equal(RUBRICS[SAGA_EIGIN].prompt("svar", {}), null);
  /* The server runs one plug per rubric. */
  assert.deepEqual(Object.keys(claudePlugs({ ANTHROPIC_API_KEY: "k" }, Object.values(RUBRICS))), TYPES);
});

test("an unknown text is refused as failed, and Claude is not called", async () => {
  const fetch = recorded({});
  const plug = claudePlug({ apiKey: "k", rubric: RUBRICS[SAGA_EIGIN], fetch });
  await assert.rejects(plug.read("Sagan.", { context: { texti: "ekki-til" } }), (e) => e.code === "failed");
  assert.equal(fetch.calls.length, 0);
});

/* ---------- 4. the copy check ----------------------------------------------------- */

test("copiedPart: a whole sentence, or a long run of words, copied word for word", () => {
  const text = ["Jöklarnir á Íslandi hafa minnkað mikið síðustu hundrað ár.", "Sumir litlir jöklar eru alveg horfnir.", "Hann fór."];
  assert.equal(copiedPart("Ég held: sumir litlir jöklar eru ALVEG horfnir!", text), "sumir litlir jöklar eru ALVEG horfnir",
    "a whole sentence, case and punctuation aside, given back as written");
  assert.equal(copiedPart("Jöklarnir á Íslandi hafa minnkað mikið síðustu hundrað árin", text),
    "Jöklarnir á Íslandi hafa minnkað mikið síðustu hundrað", `${COPY_RUN} words in a row`);
  assert.equal(copiedPart("Jöklarnir á Íslandi hafa minnkað mikið.", text), null, "six words of a long sentence are fine");
  assert.equal(copiedPart("Jöklar minnka af því að það hlýnar.", text), null);
  assert.equal(copiedPart("Hann fór heim.", text), null, "a sentence of a word or two is no copy");
});

/* ---------- 5. the recorded answers ------------------------------------------------- */

test("the fixtures are Messages API responses, and each says how it was made", () => {
  for (const name of FIXTURES) {
    const f = fixture(name);
    assert.ok(typeof f.recorded === "string" && f.recorded, name);
    assert.ok(TYPES.includes(f.kind), name);
    assert.ok(textById(f.texti), name);
    assert.equal(f.response.type, "message");
    assert.equal(f.response.stop_reason, "end_turn");
    assert.ok(f.response.content.some((b) => b.type === "text"));
    assert.ok(Number.isInteger(f.response.usage.input_tokens));
  }
});

test("a right main idea is right, and every quote is the pupil's own words", async () => {
  const { f, fetch, read } = readerFor("kjarni-joklar-right");
  const task = taskFor(f);
  const S = blankState(); const sess = newSession(S);
  const j = await serverQuestion(task, { read, pupil: { S, sess } }).send({ text: f.text });
  assert.equal(j.verdict, "right");
  assert.deepEqual(j.detail.checklist.map((p) => [p.id, p.met]), [["adal", true], ["rett", true], ["eigin", true]]);
  for (const p of j.detail.checklist) for (const q of p.quotes) assert.ok(f.text.includes(q));
  const sent = fetch.calls[0];
  assert.deepEqual(sent.output_config.format.schema.properties.findings.items.properties.point.enum, ["adal", "rett", "eigin"]);
  assert.ok(sent.messages[0].content.includes("[MAIN IDEA]"), "graded against the marks");
  settle(S, sess, task, j);
  assert.equal(S.xp, task.base);
  /* Nothing the pupil wrote is kept in their progress (DLD-PLAN §6). */
  assert.ok(!JSON.stringify({ S, sess }).includes("minni og minni"), "the answer is in the progress");
});

test("a thin answer: ONE follow-up question of ours, ONE revision, an invented quote ticks nothing", async () => {
  const { f, read } = readerFor("kjarni-joklar-thin");
  const task = taskFor(f);
  const S = blankState(); const sess = newSession(S);
  let reads = 0;
  const q = serverQuestion(task, { read: (req) => { reads++; return read(req); }, pupil: { S, sess } });
  const r = await q.send({ text: f.text });
  assert.equal(r.pending, "revise");
  assert.equal(r.detail.ask, OURS[KJARNI_EIGIN].points[0].ask, "the main point's question");
  assert.ok(!r.detail.checklist.some((p) => p.met), "'jöklar hverfa' is not in the text: dropped");
  const last = await q.send({ text: f.text + " Það hlýnar." });
  assert.ok(!last.pending);
  assert.equal(last.verdict, "wrong");
  assert.equal(last.xp, task.base + Math.round(task.base * 0.5), "XP for finishing and revising, not the verdict");
  assert.equal(await q.send({ text: "aftur" }), null, "nothing after the end");
  assert.equal(reads, 2);
});

test("a sentence of the text copied is not the pupil's own words, whatever the model says", async () => {
  const { f, read } = readerFor("kjarni-joklar-copied");
  const model = JSON.parse(f.response.content[0].text).findings.find((x) => x.point === "eigin");
  assert.equal(model.met, true, "the recorded model ticked it");
  const out = await read({ kind: f.kind, text: f.text, context: { texti: f.texti } });
  const eigin = out.findings.filter((x) => x.point === "eigin");
  assert.equal(eigin.length, 1);
  assert.equal(eigin[0].met, false);
  assert.equal(f.text.slice(eigin[0].start, eigin[0].end), eigin[0].quote, "the copy is quoted from the pupil's text");
  /* The main idea is there: right, but the revision asks for own words. */
  const task = taskFor(f);
  const S = blankState(); const sess = newSession(S);
  const r = await serverQuestion(task, { read, pupil: { S, sess } }).send({ text: f.text });
  assert.equal(r.pending, "revise");
  assert.equal(r.detail.ask, OURS[KJARNI_EIGIN].points.find((p) => p.id === "eigin").ask);
});

test("a story's summary: its characters' names stay, a classmate's is stripped and given back", async () => {
  const right = readerFor("saga-hundur-right");
  const task = taskFor(right.f);
  const S = blankState(); const sess = newSession(S);
  const j = await serverQuestion(task, { read: right.read, pupil: { S, sess } }).send({ text: right.f.text });
  assert.equal(j.verdict, "right");
  assert.deepEqual(j.detail.checklist.map((p) => [p.id, p.met]), [["adal", true], ["hlutar", true], ["rett", true], ["eigin", true]]);
  const sent = right.fetch.calls[0].messages[0].content;
  assert.ok(sent.includes("<answer>\nJón og Sara fundu"), "the story's Jón and Sara are not stripped, though a classmate is a Sara");
  assert.ok(!sent.includes("Sigurðardóttir") && !sent.includes("Guðmundur"), "the classmates' names are not sent");

  const thin = readerFor("saga-hundur-thin");
  const out = await thin.read({ kind: SAGA_EIGIN, text: thin.f.text, context: { texti: thin.f.texti } });
  const asked = thin.fetch.calls[0].messages[0].content;
  assert.ok(asked.includes("heim til [nafn1]") && !asked.includes("Gumma"), "a name not in the story is stripped");
  const adal = out.findings.find((x) => x.point === "adal");
  assert.equal(adal.quote, "fóru með hann heim til Gumma", "and given back in the quote");
  const eigin = out.findings.filter((x) => x.point === "eigin");
  assert.deepEqual(eigin.map((x) => [x.met, x.quote]), [[false, "Jón og Sara gengu heim úr skólanum"]],
    "the first sentence of the story, copied whole");
});

test("stripNames keeps the words it is told to keep, with their endings", () => {
  const s = stripNames("Við hittum Söru og Jóni hjá Gumma.", ["Gummi Jónsson"], ["Jón", "Sara"]);
  assert.equal(s.text, "Við hittum [nafn1] og Jóni hjá [nafn2].", "Jóni is the story's; Söru changes its vowel");
  assert.equal(stripNames("Hann sá Jón.", ["Jón"]).text, "Hann sá [nafn1].", "without keep, as before");
});
