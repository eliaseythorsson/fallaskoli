/* The Claude plug (issue #37; server/reader-claude.mjs, server/rubric-eigin.mjs).

   CI never calls Claude. The plug is fed RECORDED answers from
   tests/fixtures/claude/ through a `fetch` of the test's own, which also
   keeps the request the plug made, so the test can read what would have
   left the server. (The first fixtures are hand-written in the API's exact
   response shape — no key existed where this was built; record real ones
   with tools/record-grading.mjs.)

   - the request: the model setting, low effort, the JSON schema, the API
     key in a header, the definition looked up on the server;
   - names are stripped before sending and given back to the quotes;
   - the reader's quote check drops a tick whose quote is not the pupil's;
   - the cost of each call is logged, and the log line names nobody;
   - the whole way: a pupil switched on, POST /grader/read over HTTP, the
     browser's loop and `judge`, the Orðakort's free-text step. */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { claudePlug, claudePlugs, claudeConfig, stripNames, costOf, MODELS, API_URL } from "../server/reader-claude.mjs";
import { eiginRubric } from "../server/rubric-eigin.mjs";
import { createReader } from "../server/reader.mjs";
import { createApp } from "../server/server.mjs";
import { hashPassword, newId } from "../server/auth.mjs";
import { createServer } from "../src/js/core/server.js";
import { serverQuestion, serverReader } from "../src/js/control/serverask.js";
import { blankState, newSession } from "../src/js/core/state.js";
import { settle, judge } from "../src/js/core/answer.js";
import { buildCard, eiginTask, EIGIN } from "../src/js/tasks/wordcard.js";
import { sanitiseCards, saveCard } from "../src/js/core/wordcard.js";

const lex = buildLexicon(DATA);
const RUBRIC = eiginRubric(lex);
const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/claude/${name}.json`, import.meta.url), "utf8"));
const FIXTURES = ["breyting-right", "breyting-thin", "breyting-invented", "adferd-right-fable"];

/** A `fetch` that answers with a recorded response and keeps every request. */
function recorded(responses, { status = 200 } = {}) {
  const list = [].concat(responses);
  const fn = async (url, init) => {
    fn.calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    const body = list[Math.min(fn.calls.length - 1, list.length - 1)];
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  };
  fn.calls = [];
  return fn;
}

function plugFor(name, extra = {}) {
  const f = fixture(name);
  const fetch = recorded(f.response);
  const lines = [];
  const plug = claudePlug({ apiKey: "sk-test", model: f.model, effort: f.effort, rubric: RUBRIC, fetch,
    log: (l) => lines.push(l), today: () => "2026-11-27", ...extra });
  const reader = createReader({ plugs: { [EIGIN]: plug }, maxChars: 1200, timeoutMs: 2000 });
  return { f, fetch, lines, read: (text = f.text) => reader.read(EIGIN, text, { word: f.word, names: f.names }) };
}

test("the fixtures are Messages API responses, and each says how it was made", () => {
  for (const name of FIXTURES) {
    const f = fixture(name);
    assert.ok(typeof f.recorded === "string" && f.recorded, name);
    assert.equal(f.response.type, "message");
    assert.equal(f.response.role, "assistant");
    assert.equal(f.response.model, MODELS[f.model].id, name);
    assert.ok(f.response.content.some((b) => b.type === "text"));
    assert.ok(Number.isInteger(f.response.usage.input_tokens) && Number.isInteger(f.response.usage.output_tokens));
    assert.ok(eiginTask(lex.lookup(...f.word.split("|"))), `${name}: a word the server can grade`);
  }
});

test("the settings: no key, no plug; Opus 5.5 at low effort unless set otherwise", () => {
  assert.equal(claudeConfig({}), null);
  assert.equal(claudeConfig({ ANTHROPIC_API_KEY: "  " }), null);
  assert.deepEqual(claudeConfig({ ANTHROPIC_API_KEY: "k" }), { apiKey: "k", model: "opus", effort: "low" });
  assert.deepEqual(claudeConfig({ ANTHROPIC_API_KEY: "k", FALLASKOLI_CLAUDE_MODEL: "fable", FALLASKOLI_CLAUDE_EFFORT: "medium" }),
    { apiKey: "k", model: "fable", effort: "medium" });
  assert.equal(claudeConfig({ ANTHROPIC_API_KEY: "k", FALLASKOLI_CLAUDE_MODEL: "gpt" }).model, "opus");
  assert.equal(MODELS.opus.id, "claude-opus-5-5");
  assert.equal(MODELS.fable.id, "claude-fable-5-2");
  assert.deepEqual(claudePlugs({}, [RUBRIC]), {});
  assert.deepEqual(Object.keys(claudePlugs({ ANTHROPIC_API_KEY: "k" }, [RUBRIC])), [EIGIN]);
});

test("names: the group's names in any ending and capitals inside a sentence go; quotes get them back", () => {
  const s = stripNames("Jóni fannst gaman. Hann fór til Akureyrar með jonna og sá Gunnu.", ["Jón Jónsson", "jonni"]);
  assert.equal(s.text, "[nafn1] fannst gaman. Hann fór til [nafn2] með [nafn3] og sá [nafn4].");
  assert.equal(s.back("til [nafn2] með [nafn3]"), "til Akureyrar með jonna");
  assert.equal(stripNames("Breyting er þegar eitthvað breytist.").text, "Breyting er þegar eitthvað breytist.");
  assert.equal(stripNames("ég á ást", ["Ás"]).text, "ég á ást", "a name shorter than three letters is not looked for");
});

test("the request: model, effort, schema, key; the definition is the server's; no name leaves", async () => {
  const { f, fetch, read } = plugFor("breyting-right");
  await read();
  assert.equal(fetch.calls.length, 1);
  const { url, headers, body } = fetch.calls[0];
  assert.equal(url, API_URL);
  assert.equal(headers["x-api-key"], "sk-test");
  assert.ok(headers["anthropic-version"]);
  assert.equal(body.model, "claude-opus-5-5");
  assert.deepEqual(body.output_config.effort, "low");
  assert.equal(body.output_config.format.type, "json_schema");
  assert.deepEqual(body.output_config.format.schema.properties.findings.items.properties.point.enum, ["merking", "eigin"]);
  const sent = JSON.stringify(body);
  assert.ok(!sent.includes("Jón"), "the name was sent");
  assert.ok(body.messages[0].content.includes("[nafn1] breytti"));
  assert.ok(body.messages[0].content.includes("það að e-ð breytist, umskipti"), "graded against ÍNO");
  /* What the page sends is the word, and only the word counts. */
  const plug = claudePlug({ apiKey: "k", rubric: RUBRIC, fetch });
  await plug.read("texti", { context: { word: f.word, def: "HUNDUR" } });
  assert.ok(!fetch.calls[1].body.messages[0].content.includes("HUNDUR"));
});

test("recorded answers through the reader: ticks quote the pupil, an invented quote is dropped", async () => {
  const right = await plugFor("breyting-right").read();
  assert.deepEqual(right.findings.map((x) => [x.point, x.met, x.quote]), [
    ["merking", true, "þegar eitthvað verður öðruvísi en það var áður"],
    ["eigin", true, "Jón breytti herberginu sínu"],
  ]);
  const { f } = plugFor("breyting-right");
  for (const x of right.findings) assert.equal(f.text.slice(x.start, x.end), x.quote);

  const thin = await plugFor("breyting-thin").read();
  assert.deepEqual(thin.findings.map((x) => [x.point, x.met]), [["merking", false], ["eigin", false]]);

  const invented = await plugFor("breyting-invented").read();
  assert.deepEqual(invented.findings.map((x) => [x.point, x.met]), [["eigin", true]],
    "the claim whose quote is not in the text is gone");

  const fable = plugFor("adferd-right-fable");
  assert.equal((await fable.read()).findings.length, 2);
  assert.equal(fable.fetch.calls[0].body.model, "claude-fable-5-2");
});

test("the cost of every call is logged, and the line names nobody", async () => {
  const p = plugFor("breyting-right");
  await p.read();
  assert.deepEqual(p.lines, [{ day: "2026-11-27", model: "claude-opus-5-5", effort: "low", in: 742, out: 186,
    usd: costOf("opus", { input_tokens: 742, output_tokens: 186 }).usd }]);
  assert.equal(costOf("opus", { input_tokens: 1e6, output_tokens: 1e6 }).usd, 24);
  assert.equal(costOf("fable", { input_tokens: 1e6, output_tokens: 0 }).usd, 8);
  const line = JSON.stringify(p.lines);
  for (const bit of ["Jón", "breyti", "breyting", "nafn"]) assert.ok(!line.includes(bit), bit);
});

test("what goes wrong is a fault, never a verdict", async () => {
  const ok = fixture("breyting-right");
  const read = async (fetch, word = ok.word) => {
    const reader = createReader({ plugs: { [EIGIN]: claudePlug({ apiKey: "k", rubric: RUBRIC, fetch }) }, maxChars: 1200, timeoutMs: 2000 });
    return reader.read(EIGIN, ok.text, { word });
  };
  assert.deepEqual(await read(recorded({ type: "error" }, { status: 429 })), { fault: "busy" });
  assert.deepEqual(await read(recorded({ type: "error" }, { status: 529 })), { fault: "busy" });
  assert.deepEqual(await read(recorded({ type: "error" }, { status: 500 })), { fault: "unavailable" });
  assert.deepEqual(await read(recorded({ type: "error" }, { status: 401 })), { fault: "unavailable" });
  assert.deepEqual(await read(recorded({ type: "error" }, { status: 400 })), { fault: "failed" });
  assert.deepEqual(await read(async () => { throw new TypeError("network"); }), { fault: "unavailable" });
  assert.deepEqual(await read(recorded({ ...ok.response, stop_reason: "max_tokens" })), { fault: "failed" });
  assert.deepEqual(await read(recorded({ ...ok.response, stop_reason: "refusal" })), { fault: "failed" });
  assert.deepEqual(await read(recorded({ ...ok.response, content: [{ type: "text", text: "Rétt hjá þér!" }] })), { fault: "failed" });
  const never = recorded(ok.response);
  assert.deepEqual(await read(never, "ekkiorð|kk"), { fault: "failed" });
  assert.equal(never.calls.length, 0, "a word the server cannot grade is not sent");
  /* A tick without a quote is not a tick. */
  const bare = { ...ok.response, content: [{ type: "text", text: JSON.stringify({ findings: [{ point: "merking", met: true, quote: "" }] }) }] };
  assert.deepEqual((await read(recorded(bare))).findings, []);
});

test("judged in the browser: a right explanation is right; a thin one gets one question of ours", async () => {
  const w = lex.lookup("breyting", "kvk");
  const task = eiginTask(w);
  const S = blankState(); const sess = newSession(S);
  const right = plugFor("breyting-right");
  const j = await serverQuestion(task, { read: (req) => right.read(req.text), pupil: { S, sess } }).send({ text: right.f.text });
  assert.equal(j.verdict, "right");
  assert.equal(j.xp, task.base);
  assert.ok(settle(S, sess, task, j) !== undefined);
  assert.equal(S.xp, task.base);

  const thin = plugFor("breyting-thin");
  const q = serverQuestion(task, { read: (req) => thin.read(req.text), pupil: { S, sess } });
  const r = await q.send({ text: thin.f.text });
  assert.equal(r.pending, "revise");
  assert.equal(r.detail.ask, task.rubric.points[0].ask, "the follow-up is the rubric's own words");
  const kept = q.keep();
  assert.equal(kept.verdict, "wrong");
  assert.equal(kept.xp, task.base, "XP for finishing, whatever the verdict");
});

test("the Orðakort: the free-text step only with server grading on, in place of the choice", () => {
  const off = buildCard(lex, "breyting|kvk");
  const on = buildCard(lex, "breyting|kvk", { eigin: true });
  assert.ok(off.steps.some((s) => s.id === "skyring") || !on.steps.some((s) => s.id === "skyring"));
  assert.ok(!off.steps.some((s) => s.id === "eigin"));
  const step = on.steps.find((s) => s.id === "eigin");
  assert.ok(step);
  assert.equal(step.kind, "server");
  assert.ok(!on.steps.some((s) => s.id === "skyring"));
  assert.deepEqual(on.steps.slice(0, 3).map((s) => s.id), ["lesa", "mat", "eigin"]);
  assert.equal(step.task.read.context.word, "breyting|kvk");
  assert.ok(!JSON.stringify(step.task.read).includes(step.def), "the definition is not sent");
  /* What the pupil wrote is kept in their own card. */
  const S = { wordCards: {} };
  assert.ok(saveCard(S, "breyting|kvk", { rating: 1, answers: { eigin: { c: [], ok: true, t: "  Þegar eitthvað verður öðruvísi. " } } }, "2026-11-27"));
  assert.deepEqual(S.wordCards["breyting|kvk"].a.eigin, { c: [], ok: true, t: "Þegar eitthvað verður öðruvísi." });
  assert.equal(sanitiseCards({ "a|kk": { d: "2026-11-27", r: 0, a: { eigin: { c: [], ok: false, t: "x".repeat(5000) } } } })["a|kk"].a.eigin.t.length, 1200);
});

/* ---------- the whole way, over HTTP --------------------------------------- */

let base, dir, app, costFile;
const PW = "lykilordid-mitt";
const right = fixture("breyting-right");
const apiFetch = recorded(right.response);

before(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "fallaskoli-claude-"));
  const html = path.join(dir, "app.html");
  await fs.writeFile(html, "<!DOCTYPE html><title>x</title>");
  costFile = path.join(dir, "cost.jsonl");
  app = createApp({ dataDir: path.join(dir, "data"), htmlFile: html, secureCookies: false, env: {},
    graderPlugs: claudePlugs({ ANTHROPIC_API_KEY: "sk-test" }, [RUBRIC], { logFile: costFile, fetch: apiFetch }) });
  await app.store.init();
  await new Promise((r) => app.server.listen(0, r));
  base = "http://127.0.0.1:" + app.server.address().port;
  const { salt, hash } = await hashPassword(PW);
  let jon;
  await app.store.updateUsers((users) => {
    for (const [username, name] of [["sol", "Sól"], ["jonni", "Jón Jónsson"]]) {
      const u = { id: newId(), username, name, role: "learner", status: "active", group: "default", salt, hash,
        created: new Date().toISOString(), share: { board: true, minutes: true },
        consent: { by: "self", over16: true, at: new Date().toISOString(), how: "admin" } };
      if (username === "sol") jon = u;
      users.push(u);
    }
    return users;
  });
  await app.store.updatePolicies((p) => ({ ...p, [jon.id]: { serverGrading: true } }));
});

after(async () => {
  await new Promise((r) => app.server.close(r));
  await fs.rm(dir, { recursive: true, force: true });
});

function client() {
  let cookie = null;
  const fetchImpl = async (url, opts = {}) => {
    const r = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), ...(cookie ? { Cookie: cookie } : {}) } });
    const set = r.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    return r;
  };
  return createServer(base, { fetchImpl });
}

test("over HTTP: a classmate's name never leaves the server, findings come back, the cost is logged", async () => {
  const sol = client(); await sol.login("sol", PW);
  assert.deepEqual(await sol.grader(), { up: true });
  const task = eiginTask(lex.lookup("breyting", "kvk"));
  const S = blankState(); const sess = newSession(S);
  const j = await serverQuestion(task, { read: serverReader(sol), pupil: { S, sess } }).send({ text: right.text });
  assert.equal(j.verdict, "right");
  assert.ok(j.detail.checklist.every((p) => p.met));
  const sent = JSON.stringify(apiFetch.calls.at(-1).body);
  assert.ok(!sent.includes("Jón"), "the classmate's name was sent to Claude");
  assert.ok(!sent.includes("sk-test"));
  /* The log is written after the answer; wait for it. */
  let lines = [];
  for (let k = 0; k < 50 && !lines.length; k++) {
    lines = (await fs.readFile(costFile, "utf8").catch(() => "")).split("\n").filter(Boolean);
    if (!lines.length) await new Promise((r) => setTimeout(r, 20));
  }
  assert.equal(lines.length, 1);
  assert.deepEqual(Object.keys(JSON.parse(lines[0])), ["day", "model", "effort", "in", "out", "usd"]);
  assert.ok(!lines[0].includes("sol") && !lines[0].includes("Jón"));
  assert.equal(judge(task, { text: "" }).verdict, "empty");
});
