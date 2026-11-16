/* Granular control over what a child meets.
 *
 * The owner: *"For each category, I want to be able to enable and disable
 * difficulty (þyngd) levels, question types, categories … and specific word
 * attributes (nefnifall, þolfall, þágufall, eignarfall, þátíð, nútíð, germynd,
 * miðmynd, efsta stig etc). The admin and local admin decide what is possible,
 * within what is allowed, the user can choose."*
 *
 * Two things are tested, and the second is the one that matters. The first is
 * that the policy object says the right thing. The second is that **no question
 * escapes it** — a switch that the interface honours and one builder does not is
 * worse than no switch at all, because the adult has been told the material is
 * off and it is not.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, newSession, effectivePolicy } from "../src/js/core/state.js";
import { ask } from "./helpers.js";
import {
  createPolicy, featuresOf, sanitisePolicy, policyProblem, blankPolicy,
  ATTRIBUTES, QUESTION_TYPES, TYPE_IDS, LEVELS,
} from "../src/js/core/policy.js";
import { SKILLS } from "../src/js/core/skills.js";

const lex = buildLexicon(DATA);

function run(mutate, n = 900) {
  const S = blankState();
  /* Every skill on, so that only what the test switches off is off. */
  SKILLS.forEach((s) => { S.enabled[s.id] = true; });
  mutate(S);
  const ctx = { lex, S, sess: newSession(S), forcedNoun: null };
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = ask(ctx);
    if (t) out.push(t);
  }
  return out;
}

/* ================= 1. the policy object ================================= */

test("a blank policy allows everything", () => {
  const p = createPolicy(null, null);
  assert.equal(p.skill("nafnord"), true);
  assert.equal(p.type("fill"), true);
  assert.equal(p.level(7), true);
  assert.equal(p.mark("ÞGFETgr"), true);
  assert.equal(p.attr("fall", "EF"), true);
});

test("the child cannot switch on what the administrator switched off", () => {
  const allowed = { attrs: { fall: { EF: false } } };
  const chosen = { attrs: { fall: { EF: true } } };
  const p = createPolicy(allowed, chosen);
  assert.equal(p.attr("fall", "EF"), false);
  assert.equal(p.mark("EFETgr"), false);
});

test("the administrator's ceiling does not overwrite the child's choices", () => {
  /* The point of keeping the two layers apart: tighten the ceiling in October,
     loosen it in November, and the child gets back what THEY had chosen. */
  const chosen = { attrs: { fall: { ÞGF: false } } };
  const tight = createPolicy({ attrs: { fall: { EF: false } } }, chosen);
  assert.equal(tight.attr("fall", "EF"), false);
  assert.equal(tight.attr("fall", "ÞGF"), false);
  const loose = createPolicy(null, chosen);
  assert.equal(loose.attr("fall", "EF"), true);
  assert.equal(loose.attr("fall", "ÞGF"), false, "the child's own choice was lost");
});

test("a mark is decomposed into exactly the features it carries", () => {
  assert.deepEqual(featuresOf("ÞGFETgr"),
    { fall: "ÞGF", tala: "ET", greinir: "MEÐ" });
  assert.deepEqual(featuresOf("NFFT"),
    { fall: "NF", tala: "FT", greinir: "ÁN" });
  assert.deepEqual(featuresOf("GM-FH-ÞT-3P-ET"),
    { tala: "ET", mynd: "GM", hattur: "FH", tid: "ÞT", persona: "3P" });
  assert.deepEqual(featuresOf("ESB-KVK-ÞGFET"),
    { fall: "ÞGF", tala: "ET", greinir: "ÁN", kyn: "KVK", stig: "EFST", beyging: "SB" });
  /* A verb has no article, so definiteness is not one of its features — a
     policy that switched off "án greinis" must not silently switch off every
     verb in the program. */
  assert.equal(featuresOf("GM-NH").greinir, undefined);
  /* Cells that are not inflection at all carry nothing to filter on. */
  assert.deepEqual(featuresOf("setn:frumlag"), {});
  assert.deepEqual(featuresOf("ofl:atviksorð"), {});
  assert.deepEqual(featuresOf(null), {});
});

test("what arrives from outside is filtered down to what the program knows", () => {
  const clean = sanitisePolicy({
    skills: { nafnord: false, gervi: false },
    types: { fill: false, ekkitil: true },
    levels: { 3: false, 99: false },
    attrs: { fall: { EF: false, XX: false }, ekkert: { A: false } },
    safeVocab: "yes",
    junk: 1,
  });
  assert.deepEqual(clean.skills, { nafnord: false });
  assert.deepEqual(clean.types, { fill: false });
  assert.deepEqual(clean.levels, { 3: false });
  assert.deepEqual(clean.attrs, { fall: { EF: false } });
  assert.equal(clean.safeVocab, null, "a non-boolean must not become a setting");
  assert.equal(clean.junk, undefined);
});

test("a policy that leaves nothing to ask is refused, not obeyed", () => {
  assert.equal(policyProblem(null, null), null);
  const noSkills = blankPolicy();
  SKILLS.forEach((s) => { noSkills.skills[s.id] = false; });
  assert.match(policyProblem(noSkills, null), /flokkur/);
  const noCases = blankPolicy();
  noCases.attrs.fall = { NF: false, "ÞF": false, "ÞGF": false, EF: false };
  assert.match(policyProblem(noCases, null), /Föll/);
});

test("every question type and skill in the catalogue is switchable", () => {
  /* A type nobody can switch is a type the adult was promised control of and
     does not have. */
  const ids = new Set(TYPE_IDS);
  assert.equal(ids.size, QUESTION_TYPES.length);
  QUESTION_TYPES.forEach((t) => {
    assert.ok(SKILLS.some((s) => s.id === t.skill), `${t.id} names no skill`);
  });
});

/* ================= 2. no question escapes the policy ==================== */

const cellsOf = (tasks) => {
  const out = [];
  tasks.forEach((t) => {
    if (t.cell) out.push(t.cell);
    if (t.cells) t.cells.forEach((c) => out.push(c.m));
    if (t.m) out.push(t.m);
  });
  return out;
};

test("switching off a case removes it from every question type", () => {
  const tasks = run((S) => { S.policy.attrs = { fall: { EF: false } }; });
  assert.ok(tasks.length > 300, `only ${tasks.length} questions built`);
  const bad = cellsOf(tasks).filter((m) => featuresOf(m).fall === "EF");
  assert.deepEqual(bad.slice(0, 10), []);
  /* And the rest still works — switching one case off must not empty the
     program. */
  assert.ok(cellsOf(tasks).some((m) => featuresOf(m).fall === "NF"));
});

test("switching off the plural removes it from every question type", () => {
  const tasks = run((S) => { S.policy.attrs = { tala: { FT: false } }; });
  const bad = cellsOf(tasks).filter((m) => featuresOf(m).tala === "FT");
  assert.deepEqual(bad.slice(0, 10), []);
});

test("switching off the past tense and the middle voice removes them", () => {
  const tasks = run((S) => {
    S.policy.attrs = { tid: { "ÞT": false }, mynd: { MM: false } };
  });
  const cells = cellsOf(tasks);
  assert.deepEqual(cells.filter((m) => featuresOf(m).tid === "ÞT").slice(0, 10), []);
  assert.deepEqual(cells.filter((m) => featuresOf(m).mynd === "MM").slice(0, 10), []);
  assert.ok(cells.some((m) => featuresOf(m).tid === "NT"), "no present tense either");
});

test("switching off the superlative removes it", () => {
  const tasks = run((S) => { S.policy.attrs = { stig: { EFST: false } }; });
  const bad = cellsOf(tasks).filter((m) => featuresOf(m).stig === "EFST");
  assert.deepEqual(bad.slice(0, 10), []);
});

test("switching off a question type removes that type and nothing else", () => {
  const tasks = run((S) => { S.policy.types = { fill: false, tbl_no: false }; });
  const ids = new Set(tasks.map((t) => t.typeId));
  assert.ok(!ids.has("fill"), "the cloze appeared anyway");
  assert.ok(!ids.has("tbl_no"), "the noun table appeared anyway");
  assert.ok(ids.size >= 4, `only ${ids.size} other types appeared`);
});

test("switching off difficulty levels caps how hard a sentence can be", () => {
  const tasks = run((S) => {
    S.policy.levels = { 3: false, 4: false, 5: false, 6: false, 7: false };
  });
  const tooHard = tasks.filter((t) => t.s && t.s.lvl > 2);
  assert.deepEqual(tooHard.map((t) => t.s.t).slice(0, 5), []);
  assert.ok(tasks.some((t) => t.s), "no sentence questions at all");
});

test("a policy narrow enough for a young child still produces questions", () => {
  /* The owner's stated purpose: *"fallaskóli could be used for kids [who] are
     currently learning specific attributes as they go, and could therefore be
     extended for use in younger children than currently supported."* Nouns
     only, nominative and accusative, singular, þyngd 1. */
  const tasks = run((S) => {
    SKILLS.forEach((s) => { S.enabled[s.id] = s.id === "nafnord"; });
    S.policy.levels = { 2: false, 3: false, 4: false, 5: false, 6: false, 7: false };
    S.policy.attrs = {
      fall: { "ÞGF": false, EF: false },
      tala: { FT: false },
    };
  }, 300);
  assert.ok(tasks.length > 150, `only ${tasks.length} questions built`);
  for (const t of tasks) {
    const f = featuresOf(t.cell || "");
    if (f.fall) assert.ok(["NF", "ÞF"].includes(f.fall), `${t.cell} in ${t.typeId}`);
    if (f.tala) assert.equal(f.tala, "ET", `${t.cell} in ${t.typeId}`);
    if (t.s) assert.equal(t.s.lvl, 1, t.s.t);
  }
});

test("the ceiling wins over the child's switches, in real questions", () => {
  const tasks = run((S) => {
    S.allowed = { attrs: { fall: { "ÞGF": false } } };
    S.policy = { attrs: { fall: { "ÞGF": true } } };   // the child says yes
  });
  const bad = cellsOf(tasks).filter((m) => featuresOf(m).fall === "ÞGF");
  assert.deepEqual(bad.slice(0, 10), []);
});

test("an impossible policy produces no question rather than a wrong one", () => {
  const S = blankState();
  SKILLS.forEach((s) => { S.enabled[s.id] = false; });
  const ctx = { lex, S, sess: newSession(S), forcedNoun: null };
  assert.equal(ask(ctx), null);
});

test("the effective policy is read off the state the same way everywhere", () => {
  const S = blankState();
  S.enabled.nafnord = false;
  S.policy.types = { verb: false };
  S.allowed = { levels: { 5: false, 6: false, 7: false } };
  const p = effectivePolicy(S);
  assert.equal(p.skill("nafnord"), false);
  assert.equal(p.type("verb"), false);
  assert.equal(p.maxLevel, 4);
  assert.deepEqual(p.levels, LEVELS.filter((n) => n <= 4));
});

test("every attribute group has a name and a glossary term", () => {
  ATTRIBUTES.forEach((g) => {
    assert.ok(g.nm && g.term, g.id);
    assert.ok(g.keys.length >= 2, g.id);
    g.keys.forEach((k) => assert.ok(k.k && k.nm, `${g.id}.${k.k}`));
  });
});

/* ================= 3. the optional vocabulary filter ==================== */

test("the vocabulary filter is the administrator's switch, not the child's", () => {
  /* The owner asked for it back *"as a setting that I the admin and the local
     admins/superusers can set"*. A child who could switch it off would make it
     decorative. */
  assert.equal(createPolicy({ safeVocab: true }, { safeVocab: false }).safeVocab, true);
  assert.equal(createPolicy(null, { safeVocab: true }).safeVocab, false);
  assert.equal(createPolicy(null, null).safeVocab, false);
});

test("the list of words the filter removes travels with the data", () => {
  /* Not applied at build time: one build serves every user, so a build-time
     filter cannot be on for one class and off for another. */
  assert.ok(Array.isArray(DATA.blocked), "DATA.blocked is missing from the bundle");
  assert.ok(DATA.blocked.length > 0);
  /* Every lemma listed is actually in the corpus — a list of words that are not
     there is a list nobody can check. */
  const have = new Set(DATA.lex.w.map((w) => w.o));
  assert.deepEqual(DATA.blocked.filter((l) => !have.has(l)), []);
});

test("switching the filter on takes the words out of the whole corpus", () => {
  const open = buildLexicon(DATA);
  const safe = buildLexicon(DATA, { hide: new Set(DATA.blocked) });
  /* Counted from the entries, not from the list: a blocked LEMMA can have more
     than one entry (one per word class), and filtering is by lemma. */
  const removed = open.all.filter((w) => DATA.blocked.includes(w.o)).length;
  assert.ok(removed >= DATA.blocked.length);
  assert.equal(safe.all.length, open.all.length - removed);
  const gone = new Set(DATA.blocked);
  assert.deepEqual(safe.all.filter((w) => gone.has(w.o)), []);
  /* Out of the collection totals too, not merely hidden in the exercises. */
  assert.ok(safe.nouns.length <= open.nouns.length);
  assert.deepEqual(safe.hidden.sort(), [...DATA.blocked].sort());
});
