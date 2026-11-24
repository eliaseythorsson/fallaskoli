/* Word knowledge: one history per word (issue #8, core/wordknowledge.js).
 *
 * Every answered question about a word adds one word entry through `settle`
 * (core/answer.js) — and only there. What is held here:
 *
 *   1. one entry per question per word: a table is one entry, judged whole;
 *   2. several words in one question (Villuveiðar): an entry each, by its own
 *      records, still once per word;
 *   3. duels and live rounds count; a second try and the bonus sentence do not;
 *      the meaning question is "seen, not judged";
 *   4. the type id is stored, recall is looked up in the catalogue;
 *   5. migrate: an older copy starts word knowledge empty and `S.words`
 *      without its short history; XP, badges and levels are kept;
 *   6. merge (two devices answer about the same word) and the server's check;
 *   7. the pupil's export holds it and erasing the account removes it.
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, newSession, migrate, todayKey } from "../src/js/core/state.js";
import { mergeStates } from "../src/js/core/merge.js";
import { STATE_VERSION } from "../src/js/core/slices.js";
import { createPolicy } from "../src/js/core/policy.js";
import { SKILL_IDS } from "../src/js/core/skills.js";
import { CATALOGUE } from "../src/js/core/catalogue.js";
import { judge, judgeBonus, judgeRetry, retryAllowed, settle } from "../src/js/core/answer.js";
import { TASKS, buildTask, nextTask, makeView, applyEffects } from "../src/js/tasks/index.js";
import { duelTasks } from "../src/js/core/duel.js";
import {
  noteWords, entriesFor, entriesOf, totalsOf, wordsWithHistory, isRecallEntry, isJudged,
  sanitiseWordKnowledge, mergeWordKnowledge, cleanWordKnowledge, wordKnowledgeSlice,
  RIGHT, WRONG, SEEN, ENTRIES_MAX, RESET_BEFORE,
} from "../src/js/core/wordknowledge.js";
import { cleanState } from "../server/guard.mjs";
import { createApp } from "../server/server.mjs";
import { hashPassword, newId } from "../server/auth.mjs";
import { show, rightResponse, wrongResponse } from "./helpers.js";

const lex = buildLexicon(DATA);
const TODAY = todayKey();

function pupil(diff = 3) {
  const S = blankState();
  SKILL_IDS.forEach((id) => { S.enabled[id] = true; });
  const sess = newSession(S);
  Object.keys(sess.diff).forEach((k) => { sess.diff[k] = diff; });
  const all = {};
  SKILL_IDS.forEach((id) => { all[id] = true; });
  return { lex, S, sess, forcedNoun: null, run: {},
    policy: createPolicy(null, { skills: all, types: {}, levels: {}, attrs: {}, safeVocab: null }) };
}

/** A question of this type, shown, with its type id as the app stamps it. */
function taskOf(ctx, id, ok = (t) => true, tries = 60) {
  const spec = TASKS.find((t) => t.id === id);
  for (let k = 0; k < tries; k++) {
    const t = show(ctx, spec.build);
    if (t && ok(t)) { t.typeId = id; return t; }
  }
  throw new Error("could not build " + id);
}

const answer = (ctx, t, response) => {
  const j = judge(t, response, ctx);
  return { j, extra: settle(ctx.S, ctx.sess, t, j, { ms: 1500 }) };
};

/* ========================================================================
 * 1. One entry per question per word
 * ====================================================================== */

test("a written form: one entry, with the day, the type id and the verdict", () => {
  const ctx = pupil();
  const t = taskOf(ctx, "fill");
  answer(ctx, t, rightResponse(t));
  assert.deepEqual(entriesOf(ctx.S, t.word), [{ day: TODAY, type: "fill", outcome: RIGHT }]);
  const t2 = taskOf(ctx, "fill");
  answer(ctx, t2, { text: "xq" });
  assert.deepEqual(entriesOf(ctx.S, t2.word).at(-1), { day: TODAY, type: "fill", outcome: WRONG });
  /* Nothing the pupil typed is kept. */
  assert.equal(JSON.stringify(ctx.S.wordKnowledge).includes("xq"), false);
});

test("a table of ten boxes is ONE entry, right only when the whole table is", () => {
  for (const id of ["tbl_no", "tbl_so"]) {
    const ctx = pupil();
    const t = taskOf(ctx, id);
    const r = rightResponse(t);
    answer(ctx, t, r);
    assert.deepEqual(entriesOf(ctx.S, t.word).map((e) => e.outcome), [RIGHT], id);

    /* All but the last box right: the pupil sees a wrong table, so one wrong entry. */
    const ctx2 = pupil();
    const t2 = taskOf(ctx2, id);
    const cells = rightResponse(t2).cells.slice();
    cells[cells.length - 1] = "xq";
    const { j } = answer(ctx2, t2, { cells });
    assert.equal(j.ok, false);
    assert.ok(j.effects.filter((e) => e.do === "record").length > 1, "a table records every box");
    assert.deepEqual(entriesOf(ctx2.S, t2.word), [{ day: TODAY, type: id, outcome: WRONG }]);
    assert.deepEqual(totalsOf(ctx2.S, t2.word), { c: 0, w: 1 });
  }
});

test("Villuveiðar: every word the pupil answered about gets its own entry, once", () => {
  const ctx = pupil(4);
  /* A generated hunt (two errors from þyngd 3) names a word per error; the
     bank's items are slips of usage with no word of their own. A pupil with
     Icelandic as a second language gets the generated hunt at every þyngd. */
  ctx.S.settings.secondLanguage = true;
  const t = taskOf(ctx, "villur", (x) => {
    const words = new Set(x.hunt.lines.flatMap((ln) => ln.toks.filter((tk) => tk.err && tk.err.word).map((tk) => tk.err.word)));
    return words.size >= 2;
  }, 200);
  const errs = t.hunt.lines.flatMap((ln, li) => ln.toks.map((tk, ti) => ({ tk, key: `${li}:${ti}` }))).filter((x) => x.tk.err);
  /* Put the first error right and leave the rest. */
  const first = errs[0];
  const edits = { [first.key]: first.tk.err.answers[0] };
  const { j } = answer(ctx, t, { edits });
  const want = new Map();
  for (const e of j.effects.filter((x) => x.do === "record" && x.word)) {
    want.set(e.word, (want.get(e.word) ?? true) && e.ok);
  }
  assert.ok(want.size >= 2);
  for (const [word, ok] of want)
    assert.deepEqual(entriesOf(ctx.S, word), [{ day: TODAY, type: "villur", outcome: ok ? RIGHT : WRONG }], word);
  assert.equal(entriesOf(ctx.S, first.tk.err.word)[0].outcome,
    errs.filter((x) => x.tk.err.word === first.tk.err.word).length === 1 ? RIGHT : WRONG);
  assert.equal(wordsWithHistory(ctx.S).length, want.size);
});

test("a question about no word makes no entry (a sentence part, a clause)", () => {
  const ctx = pupil();
  const t = taskOf(ctx, "syntax");
  answer(ctx, t, rightResponse(t));
  assert.deepEqual(ctx.S.wordKnowledge, {});
});

/* ========================================================================
 * 2. What counts
 * ====================================================================== */

test("the meaning question is 'seen, not judged': in the history, in neither total", () => {
  const ctx = pupil();
  const t = taskOf(ctx, "meaning");
  const { j } = answer(ctx, t, { text: "þetta er orð sem ég þekki vel" });
  assert.equal(j.ok, null);
  const [e] = entriesOf(ctx.S, t.word);
  assert.deepEqual(e, { day: TODAY, type: "meaning", outcome: SEEN });
  assert.equal(isJudged(e), false);
  assert.deepEqual(totalsOf(ctx.S, t.word), { c: 0, w: 0 });

  /* The bonus sentence under it is not a question: no entry. */
  t.bonus = t.bonus || { o: t.word.split("|")[0] };
  const b = judgeBonus(t, `Ég sá ${t.word.split("|")[0]} í gær og það var gaman`, ctx);
  if (!b.pending) settle(ctx.S, ctx.sess, t, b);
  assert.equal(entriesOf(ctx.S, t.word).length, 1, "the bonus sentence made an entry");
});

test("a second try is not a new entry: the first answer's miss stands", () => {
  const ctx = pupil();
  const t = taskOf(ctx, "fill");
  const first = { text: t.answers[0] + "xq" };
  const j1 = judge(t, first, ctx);
  settle(ctx.S, ctx.sess, t, j1);
  assert.equal(retryAllowed(t, j1), true);
  t.retried = true;
  const j2 = judgeRetry(t, { text: t.answers[0] }, first, ctx);
  assert.equal(j2.ok, true);
  settle(ctx.S, ctx.sess, t, j2);
  assert.deepEqual(entriesOf(ctx.S, t.word), [{ day: TODAY, type: "fill", outcome: WRONG }]);
  /* And a pending answer (an empty box) is nothing. */
  settle(ctx.S, ctx.sess, t, judge(t, { text: "" }, ctx));
  assert.equal(entriesOf(ctx.S, t.word).length, 1);
});

test("a duel's answers count, each word once per question", () => {
  const dlex = buildLexicon(DATA, { hide: new Set(DATA.blocked || []) });
  const deps = { nextTask, buildTask, makeView, applyEffects, blankState, newSession, createPolicy };
  const tasks = duelTasks(dlex, { id: "d1", a: "A", b: "B", topic: "nafnord", n: 10, seed: 7, level: 3,
    side: "a", key: 1111 }, deps);
  assert.ok(tasks.length >= 5 && tasks.every((t) => t.duel));
  const ctx = pupil();
  let expected = 0;
  tasks.forEach((t, i) => {
    const { j } = answer(ctx, t, i % 2 ? wrongResponse(t) : rightResponse(t));
    expected += new Set(j.effects.filter((e) => e.do === "record" && e.word).map((e) => e.word)).size;
    if (j.ok !== null) assert.equal(retryAllowed(t, j), false, "no second try in a duel");
  });
  const all = wordsWithHistory(ctx.S).flatMap((w) => entriesOf(ctx.S, w));
  assert.ok(expected > 0);
  assert.equal(all.length, expected);
  for (const e of all) assert.ok(CATALOGUE.some((c) => c.id === e.type), e.type);
});

test("a live round's answer counts like any other", () => {
  const ctx = pupil();
  const t = { ...taskOf(ctx, "fill"), live: true, duel: true };
  answer(ctx, t, rightResponse(t));
  assert.equal(entriesOf(ctx.S, t.word).length, 1);
});

test("every question type that records a word makes exactly one entry per word", () => {
  for (const spec of TASKS) {
    const ctx = pupil(4);
    let t = null;
    for (let k = 0; k < 30 && !t; k++) t = show(ctx, spec.build);
    if (!t) continue;
    t.typeId = spec.id;
    let resp;
    try { resp = rightResponse(t); } catch { resp = t.type === "meaning" ? { text: "orð sem ég þekki vel" } : null; }
    if (!resp) continue;
    const j = judge(t, resp, ctx);
    if (j.pending) continue;
    settle(ctx.S, ctx.sess, t, j);
    const words = new Set(j.effects.filter((e) => e.do === "record" && e.word).map((e) => e.word));
    assert.equal(wordsWithHistory(ctx.S).length, words.size, spec.id);
    for (const w of words) {
      const es = entriesOf(ctx.S, w);
      assert.equal(es.length, 1, `${spec.id}: ${w}`);
      assert.equal(es[0].type, spec.id);
    }
  }
});

test("recall is looked up in the catalogue, never stored", () => {
  const recall = CATALOGUE.find((c) => c.recall);
  const not = CATALOGUE.find((c) => !c.recall);
  assert.equal(isRecallEntry({ day: TODAY, type: not.id, outcome: RIGHT }), false);
  if (recall) assert.equal(isRecallEntry({ day: TODAY, type: recall.id, outcome: RIGHT }), true);
  assert.equal(isRecallEntry({ day: TODAY, type: "no_such_type", outcome: RIGHT }), false);
});

test("entriesFor and noteWords are pure about everything but S.wordKnowledge", () => {
  const S = blankState();
  const task = { type: "fill", typeId: "fill", word: "hestur|kk" };
  const j = { ok: true, finish: { correct: true }, effects: [{ do: "record", word: "hestur|kk", ok: true }] };
  const before = JSON.stringify({ ...S, wordKnowledge: undefined });
  noteWords(S, task, j, "2026-11-24");
  assert.equal(JSON.stringify({ ...S, wordKnowledge: undefined }), before);
  assert.deepEqual(S.wordKnowledge, { "hestur|kk": { c: 1, w: 0, e: [["2026-11-24", "fill", "r"]] } });
  assert.deepEqual(entriesFor(task, { ...j, finish: null }), [], "no finish: not a question");
  assert.deepEqual(entriesFor(task, { ...j, retry: true }), [], "a second try");
  assert.deepEqual(noteWords(S, task, j, "not a day"), []);
  /* What entriesOf hands out is a copy. */
  entriesOf(S, "hestur|kk")[0].outcome = WRONG;
  assert.equal(S.wordKnowledge["hestur|kk"].e[0][2], RIGHT);
});

test("every entry is kept: the cap is one constant, Infinity (ADR 0001)", () => {
  assert.equal(ENTRIES_MAX, Infinity);
  const S = blankState();
  const task = { type: "fill", typeId: "fill" };
  const j = { ok: false, finish: {}, effects: [{ do: "record", word: "hestur|kk", ok: false }] };
  for (let k = 0; k < 2000; k++) noteWords(S, task, j, "2026-11-24");
  assert.equal(entriesOf(S, "hestur|kk").length, 2000);
  assert.equal(migrate(structuredClone(S)).wordKnowledge["hestur|kk"].e.length, 2000);
});

/* ========================================================================
 * 3. Migrate: word records reset, everything else kept (decision 6)
 * ====================================================================== */

test("STATE_VERSION was bumped for word knowledge", () => {
  assert.ok(STATE_VERSION >= RESET_BEFORE);
  assert.equal(RESET_BEFORE, 12);
  assert.equal(blankState().v, STATE_VERSION);
  assert.deepEqual(blankState().wordKnowledge, {});
});

test("an older copy: word records reset; XP, badges, levels and the rest kept", () => {
  const old = {
    v: 11, xp: 4200, bestLevel: 7,
    skills: { nafnord: { xp: 900, c: 80, w: 20, bestRun: 9 } },
    badges: { run5: { n: 2, dates: ["2026-11-01", "2026-11-02"], first: "2026-11-01", last: "2026-11-02" } },
    words: { "hestur|kk": { c: 5, w: 2, h: "1101011" }, "fara|so": { c: 1, w: 0, h: "1" } },
    vocab: { "hestur|kk": { n: 1, dates: ["2026-11-02"], first: "2026-11-02", last: "2026-11-02" } },
    review: { items: [], stats: { "s:nafnord": { a: 3, l: 1, p: 2, t: 2, g: 0, x: 0 } } },
    /* Whatever an older copy carried under the new name is not word knowledge. */
    wordKnowledge: { "hestur|kk": { c: 9, w: 9, e: [["2026-11-01", "fill", "w"]] } },
  };
  const S = migrate(structuredClone(old));
  assert.equal(S.v, STATE_VERSION);
  assert.deepEqual(S.wordKnowledge, {}, "word knowledge starts empty");
  assert.deepEqual(S.words, { "hestur|kk": { c: 5, w: 2 }, "fara|so": { c: 1, w: 0 } },
    "the short history `h` is dropped, the counts are kept");
  assert.equal(S.xp, 4200);
  assert.equal(S.bestLevel, 7);
  assert.deepEqual(S.skills.nafnord, old.skills.nafnord);
  assert.deepEqual(S.badges, old.badges);
  assert.equal("vocab" in S, false, "S.vocab is gone since #10");
  assert.deepEqual(S.review.stats, old.review.stats);

  /* Loaded again — now a current copy — nothing more is reset. */
  const ctx = { ...pupil(), S };
  const t = taskOf(ctx, "fill");
  answer(ctx, t, rightResponse(t));
  const again = migrate(structuredClone(S));
  assert.deepEqual(again.wordKnowledge, S.wordKnowledge);
  assert.deepEqual(again.words, S.words);
  assert.ok(again.words[t.word].h, "a new answer's short history is kept on the next load");
});

test("a copy with no version at all is an old copy", () => {
  const S = migrate({ xp: 10, words: { "hestur|kk": { c: 1, w: 0, h: "1" } },
    wordKnowledge: { "hestur|kk": { c: 1, w: 0, e: [["2026-11-01", "fill", "r"]] } } });
  assert.deepEqual(S.wordKnowledge, {});
  assert.deepEqual(S.words, { "hestur|kk": { c: 1, w: 0 } });
});

test("migrate rebuilds a current copy entry by entry, and never throws", () => {
  const raw = { v: STATE_VERSION, wordKnowledge: {
    "hestur|kk": { c: 1, w: "x", e: [["2026-11-01", "fill", "r"], ["bad", "fill", "r"], ["2026-11-02", "fill", "?"],
      ["2026-11-03", "BAD TYPE", "w"], "junk", null, ["2026-11-04", "tbl_no", "w"]] },
    "": { c: 1, w: 1, e: [] },
    ["x".repeat(81)]: { c: 1, w: 1, e: [] },
    "fara|so": "junk",
  } };
  const S = migrate(raw);
  assert.deepEqual(S.wordKnowledge, {
    "hestur|kk": { c: 1, w: 1, e: [["2026-11-01", "fill", "r"], ["2026-11-04", "tbl_no", "w"]] },
  });
  for (const junk of [null, 7, "x", [], { a: [1] }]) {
    assert.doesNotThrow(() => wordKnowledgeSlice.migrate(junk, { v: STATE_VERSION }));
    assert.deepEqual(sanitiseWordKnowledge(junk), {});
  }
});

/* ========================================================================
 * 4. Two devices, and the server's check
 * ====================================================================== */

const E = (d, t, o) => [d, t, o];

test("merge: two devices answer about the same word — every entry once, totals added", () => {
  const base = { "hestur|kk": { c: 1, w: 0, e: [E("2026-11-17", "fill", "r")] } };
  const phone = { "hestur|kk": { c: 1, w: 1, e: [E("2026-11-17", "fill", "r"), E("2026-11-18", "tbl_no", "w")] },
    "fara|so": { c: 1, w: 0, e: [E("2026-11-18", "verbslot", "r")] } };
  const laptop = { "hestur|kk": { c: 2, w: 0, e: [E("2026-11-17", "fill", "r"), E("2026-11-17", "fill", "r"),
    E("2026-11-19", "meaning", "s")] } };
  const out = mergeWordKnowledge(base, phone, laptop);
  assert.deepEqual(out["hestur|kk"], { c: 2, w: 1, e: [
    E("2026-11-17", "fill", "r"), E("2026-11-17", "fill", "r"), E("2026-11-18", "tbl_no", "w"),
    E("2026-11-19", "meaning", "s")] }, "the phone's entry goes in by its day; the same entry twice is two answers");
  assert.deepEqual(out["fara|so"], phone["fara|so"]);
  /* Both directions hold the same entries. */
  const back = mergeWordKnowledge(base, laptop, phone);
  const sorted = (h) => h.e.map((x) => x.join(" ")).sort();
  assert.deepEqual(sorted(back["hestur|kk"]), sorted(out["hestur|kk"]));
  assert.deepEqual({ c: back["hestur|kk"].c, w: back["hestur|kk"].w }, { c: 2, w: 1 });
  /* Nothing changed since base: nothing moves. Merging the result again adds nothing. */
  assert.deepEqual(mergeWordKnowledge(out, out, out), out);
  assert.deepEqual(mergeWordKnowledge(laptop, out, laptop), out);
  /* Pure. */
  assert.deepEqual(base["hestur|kk"].e.length, 1);
});

test("merge with no common past does not count twice what both hold", () => {
  const a = { "hestur|kk": { c: 1, w: 1, e: [E("2026-11-17", "fill", "r"), E("2026-11-18", "fill", "w")] } };
  const b = { "hestur|kk": { c: 2, w: 0, e: [E("2026-11-17", "fill", "r"), E("2026-11-18", "fill", "r")] } };
  const out = mergeWordKnowledge(undefined, a, b);
  assert.deepEqual(out["hestur|kk"].e, [E("2026-11-17", "fill", "r"), E("2026-11-18", "fill", "r"), E("2026-11-18", "fill", "w")]);
  assert.deepEqual([out["hestur|kk"].c, out["hestur|kk"].w], [2, 1]);
  assert.deepEqual(mergeWordKnowledge(undefined, a, a), a);
});

test("mergeStates carries word knowledge through, both ways", () => {
  const base = migrate({ v: STATE_VERSION });
  const L = structuredClone(base), R = structuredClone(base);
  L.wordKnowledge = { "hestur|kk": { c: 1, w: 0, e: [E("2026-11-18", "fill", "r")] } };
  R.wordKnowledge = { "hestur|kk": { c: 0, w: 1, e: [E("2026-11-18", "tbl_no", "w")] } };
  const out = mergeStates(base, L, R);
  assert.deepEqual(out.wordKnowledge["hestur|kk"], { c: 1, w: 1,
    e: [E("2026-11-18", "tbl_no", "w"), E("2026-11-18", "fill", "r")] });
});

test("the server's check: no day after tomorrow, no type the catalogue lacks, bounded, never refused", () => {
  const ctx = { today: new Date("2026-11-20T12:00:00Z"), limit: "2026-11-21" };
  const out = cleanWordKnowledge({
    "hestur|kk": { c: 3, w: 1, e: [E("2026-11-19", "fill", "r"), E("2026-11-21", "fill", "r"),
      E("2026-11-22", "fill", "r"), E("2026-11-19", "made_up", "w"), E("2026-11-19", "<script>", "w")] },
    "x|y": { c: -5, w: 1e12, e: [] },
  }, ctx);
  assert.deepEqual(out["hestur|kk"], { c: 3, w: 1, e: [E("2026-11-19", "fill", "r"), E("2026-11-21", "fill", "r")] });
  assert.deepEqual(out["x|y"], { c: 0, w: 1e9, e: [] });
  /* Through the whole server check. */
  const S = { ...blankState(), wordKnowledge: { "hestur|kk": { c: 1, w: 0, e: [E("2026-11-19", "fill", "r")] } } };
  assert.deepEqual(cleanState(S, ctx).wordKnowledge, S.wordKnowledge);
  assert.deepEqual(cleanState({ ...S, wordKnowledge: "junk" }, ctx).wordKnowledge, {});
});

/* ========================================================================
 * 5. The pupil's export and erasure (decision 10)
 * ====================================================================== */

let dir, app, base;
const PW = "lykilordid-mitt";
before(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "fallaskoli-wk-"));
  const html = path.join(dir, "app.html");
  await fs.writeFile(html, "<!DOCTYPE html><title>x</title>");
  app = createApp({ dataDir: path.join(dir, "data"), htmlFile: html, secureCookies: false,
    env: { FALLASKOLI_TRUST_PROXY: "1", FALLASKOLI_CONTROLLER: "Prófari", FALLASKOLI_CONTACT: "p@example.is" } });
  await app.store.init();
  await new Promise((r) => app.server.listen(0, r));
  base = "http://127.0.0.1:" + app.server.address().port;
});
after(async () => {
  await new Promise((r) => app.server.close(r));
  await fs.rm(dir, { recursive: true, force: true });
});

function client(ip = "10.0.8.1") {
  let cookie = null;
  const call = async (method, p, body) => {
    const r = await fetch(base + p, { method, redirect: "manual", headers: { "Fly-Client-IP": ip,
      ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined });
    const set = r.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const text = await r.text();
    let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: r.status, data };
  };
  call.login = (username, password = PW) => call("POST", "/auth/login", { username, password });
  return call;
}

test("the pupil's export holds word knowledge, and erasing the account removes it", async () => {
  const { salt, hash } = await hashPassword(PW);
  const id = newId();
  await app.store.updateUsers((users) => {
    users.push({ id, username: "ordanemi", name: "Orðanemi", role: "learner", status: "active",
      group: "default", salt, hash, created: new Date().toISOString(), lastSeen: TODAY,
      consent: { by: "self", over16: true, at: new Date().toISOString(), how: "admin" } });
    return users;
  });
  const c = client();
  assert.equal((await c.login("ordanemi")).status, 200);
  const word = "sérkennilegtorð|hk";
  const S = { ...blankState(), wordKnowledge: { [word]: { c: 1, w: 0, e: [E(TODAY, "fill", "r")] } } };
  assert.equal((await c("PUT", `/state/${id}`, S)).status, 200);

  const exp = await c("GET", "/account/export");
  assert.equal(exp.status, 200);
  assert.deepEqual(exp.data.progress.wordKnowledge, S.wordKnowledge);

  assert.equal((await c("POST", "/account/delete", { password: PW })).status, 204);
  const files = await fs.readdir(path.join(dir, "data"), { recursive: true });
  for (const f of files) {
    const full = path.join(dir, "data", f);
    if ((await fs.stat(full)).isDirectory()) continue;
    assert.equal((await fs.readFile(full, "utf8")).includes("sérkennilegtorð"), false, "word knowledge survives in " + f);
  }
  assert.equal(await app.store.state(id), null);
});
