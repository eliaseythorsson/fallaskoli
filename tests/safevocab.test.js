/* The coarse-word filter (critique item 9, v6.13).

   The vocabulary comes from film subtitles, where *tík* was the 54th
   commonest noun, *kynlíf* the 55th and *píka* the 185th, and a declension
   table of *píka* came up in an ordinary session. The filter that removes such
   words was off unless an administrator found it and switched it on. Now it is
   on unless an administrator switches it off, and these tests hold that:

   1. the default — a pupil with no administrator, or an administrator who
      never touched the switch — gets the filtered vocabulary, and a saved
      setting of `false` is kept;
   2. no builder, at any band, ever puts a form of a known coarse word in front
      of that pupil — not in a table, a cloze, an option, a definition or an
      explanation;
   3. the same for the material that does not come from the lexicon at all:
      the sentence bank and the hand-written exercises.

   KNOWN is written here, not read from pipeline/vocab_filter.py, on purpose: a word
   taken off the block list by mistake must fail a test, not quietly pass it. */

import test from "node:test";
import assert from "node:assert/strict";
import { DATA } from "../data/data_bundle.js";
import { EX } from "../data/exercises.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, newSession, migrate, effectivePolicy, chosenPolicy } from "../src/js/core/state.js";
import { createPolicy, sanitisePolicy, blankPolicy } from "../src/js/core/policy.js";
import { SKILL_IDS } from "../src/js/core/skills.js";
import { seeded } from "../src/js/core/duel.js";
import { TASKS, makeView } from "../src/js/tasks/index.js";
import { normalise } from "../src/js/core/grading.js";

/* Coarse words that must never reach a pupil under the default policy. A bare
   lemma means every word class; "lemma|class" one reading of a homograph. */
const KNOWN = [
  // the four the critique names as still passing, and its examples
  "standpína", "fullnæging", "dræsa", "kelling", "tík", "kynlíf", "fáviti", "píka",
  // sexual and anatomical slang
  "typpi", "skaufi", "pungur", "rassgat", "kunta", "snípur", "smokkur", "sæði", "tittlingur",
  // insults for women, slurs, insults built on disability
  "drusla", "tæfa", "gála", "hóra", "mella", "negri", "svertingi", "blökkumaður", "hommi",
  "hálfviti", "fábjáni", "skíthæll", "drullusokkur", "skítseiði", "viðrini",
  // oaths
  "helvíti", "andskoti", "fjandi", "djöfull", "skratti", "skrambi", "skolli",
  // drugs
  "eiturlyf", "dópsali", "hass", "dópa",
  // violence (UNFIT, removed at build time; listed so that stays true)
  "nauðgun", "nauðga", "morð", "myrða", "fjöldamorð", "fyrirfara",
  // homographs: the verb (*drulla sér*), not the noun (mud); the nouns whose
  // ÍNO definition is the sexual sense, not the verb *skutla* (give a lift)
  "drulla|so", "skutla|kvk", "bomba|kvk",
];

const words = (s) => String(s).toLowerCase().match(/[a-záðéíóúýþæö]+/g) || [];

/* Every surface form of every KNOWN entry, read from the UNFILTERED lexicon,
   minus any form that a word the pupil does see also has — *drullu* is the
   mud as well, *sæði* is also a form of *sá* (to sow). A word the corpus does
   not contain at all (UNFIT, or not attested) is checked by its lemma alone. */
const open = buildLexicon(DATA);
const isKnown = (w) => KNOWN.includes(w.o) || KNOWN.includes(`${w.o}|${w.c}`);
function formsOf(list) {
  const out = new Set();
  for (const w of list) {
    out.add(normalise(w.o));
    for (const fs of Object.values(w.forms)) for (const f of fs) for (const t of words(f)) out.add(t);
  }
  return out;
}

/** The lexicon the app builds for a pupil under this ceiling (app.js, start-up). */
function appLexicon(allowed) {
  const S = blankState();
  S.allowed = allowed;
  return effectivePolicy(S).safeVocab ? buildLexicon(DATA, { hide: new Set(DATA.blocked) }) : open;
}

const lex = appLexicon(null);
/* Forms a coarse word shares with an innocent word the lexicon lacks. */
const INNOCENT_FORMS = {
  fyrirferð: "the noun (bulk); also 'þú fyrirferð', 2nd person of fyrirfara",
};
const innocent = new Set([...formsOf(lex.all), ...Object.keys(INNOCENT_FORMS)]);
const FORBIDDEN = new Set([...formsOf(open.all.filter(isKnown))].filter((f) => !innocent.has(f)));
for (const k of KNOWN) { const l = k.split("|")[0]; if (!innocent.has(l)) FORBIDDEN.add(l); }

const hits = (text) => words(text).filter((t) => FORBIDDEN.has(t));

/* ÍNO's definitions, which a question can show, use two of the words in
   their literal sense. Allowed by name, with the reason; anything new fails. */
const DEF_ALLOWED = {
  "hún": "… kvenkyns vera, t.d. stelpa eða tík: the dog",
  "púki": "lítill djöfull með horn og hala: a little devil, literally",
  "pinni": "mjór tittur, mjótt prik: a peg",
};
const allowedDefs = new Set(lex.all.filter((w) => DEF_ALLOWED[w.o] && w.d).map((w) => w.d));
const taskText = (task) => JSON.stringify(task, (k, v) => (k === "d" && allowedDefs.has(v) ? "" : v));

/* ---------- 1. on by default ----------------------------------------------- */

test("the filter is on by default and the pupil cannot switch it off", () => {
  assert.equal(createPolicy(null, null).safeVocab, true, "no ceiling at all: on");
  assert.equal(createPolicy(blankPolicy(), null).safeVocab, true, "a ceiling that never touched it: on");
  assert.equal(effectivePolicy(blankState()).safeVocab, true, "a new pupil: on");
  /* The child's own layer has no say, either way. */
  assert.equal(createPolicy(null, { safeVocab: false }).safeVocab, true);
  assert.equal(chosenPolicy(blankState()).safeVocab, null);
  /* An administrator's explicit choice is kept, both ways. */
  assert.equal(createPolicy({ safeVocab: false }, null).safeVocab, false);
  assert.equal(createPolicy({ safeVocab: true }, { safeVocab: false }).safeVocab, true);
});

test("saved settings: a ceiling saved before v6.13 turns the filter on, an explicit off stays off", () => {
  /* A ceiling the server stored before v6.13 carries `safeVocab: null` unless
     somebody clicked the box — the editor wrote it only on a change. Such a
     ceiling now means on. One that says `false` was a deliberate untick. */
  const saved = (allowed) => effectivePolicy(migrate({ ...blankState(), allowed }));
  assert.equal(saved(null).safeVocab, true);
  assert.equal(saved({ skills: {}, types: {}, levels: {}, attrs: {}, safeVocab: null }).safeVocab, true);
  assert.equal(saved({ skills: { nafnord: true } }).safeVocab, true, "a ceiling with no safeVocab key at all");
  assert.equal(saved({ safeVocab: false }).safeVocab, false);
  assert.equal(saved({ safeVocab: true }).safeVocab, true);
  /* What the server sends goes through sanitisePolicy: junk is not `false`. */
  assert.equal(createPolicy(sanitisePolicy({ safeVocab: "false" }), null).safeVocab, true);
  assert.equal(createPolicy(sanitisePolicy({ safeVocab: 0 }), null).safeVocab, true);
});

/* ---------- 2. the list ---------------------------------------------------- */

test("every known coarse word the corpus contains is on the block list", () => {
  const listed = new Set(DATA.blocked);
  const inCorpus = KNOWN.filter((k) => {
    const [l, c] = k.split("|");
    return open.all.some((w) => w.o === l && (!c || w.c === c));
  });
  assert.ok(inCorpus.length >= 35, `only ${inCorpus.length} of the known words are in the corpus — has the data changed?`);
  for (const k of inCorpus) {
    const l = k.split("|")[0];
    assert.ok(listed.has(k) || listed.has(l), `${k} is in the corpus and not on the block list`);
  }
  /* None of them is left in the pupil's lexicon. */
  assert.deepEqual(lex.all.filter(isKnown).map((w) => `${w.o}|${w.c}`), []);
});

test("a homograph keeps its innocent reading: drulla the noun stays, the verb goes", () => {
  assert.ok(lex.lookup("drulla", "kvk"), "drulla (mud) must stay");
  assert.equal(lex.lookup("drulla", "so"), null);
  assert.ok(lex.lookup("ríða", "so"), "ríða (to ride a horse) is kept on purpose");
  assert.ok(lex.lookup("kerling", "kvk"), "kerling (karl og kerling) is kept on purpose");
});

test("the scan can see a coarse word when the filter is off", () => {
  /* Without this the test below could pass by looking at nothing. */
  assert.ok(FORBIDDEN.has("píku") && FORBIDDEN.has("tíkin") && FORBIDDEN.has("helvítis"));
  assert.ok(!FORBIDDEN.has("drullu"), "a form the mud shares is not forbidden");
  const pika = open.lookup("píka", "kvk");
  assert.ok(pika, "píka is in the unfiltered corpus");
  const tbl = TASKS.find((t) => t.id === "tbl_no");
  const S = blankState();
  const view = makeView({ S, sess: newSession(S), today: "2026-01-15", drillWord: pika,
    policy: createPolicy({ safeVocab: false }, allSkills()) });
  const got = tbl.build(open, view, seeded(1));
  assert.ok(got && hits(JSON.stringify(got.task)).length, "a table of píka was not caught");
});

/* ---------- 3. every builder ------------------------------------------------ */

function allSkills() {
  const skills = {};
  SKILL_IDS.forEach((id) => { skills[id] = true; });
  return { skills, types: {}, levels: {}, attrs: {}, safeVocab: null };
}

test("no builder serves a coarse word under the default policy, at any band", () => {
  /* The default ceiling (none), every category switched on by the pupil so
     that every builder is reached. */
  const policy = createPolicy(null, allSkills());
  assert.equal(policy.safeVocab, true);
  const SEEDS = 30, BANDS = [1, 2, 3, 4, 5, 6, 7];
  const found = [];
  let built = 0;
  for (const spec of TASKS) {
    for (const band of BANDS) {
      for (let seed = 0; seed < SEEDS; seed++) {
        const S = blankState();
        const sess = newSession(S);
        Object.keys(sess.diff).forEach((k) => { sess.diff[k] = band; });
        const view = makeView({ S, sess, policy, today: "2026-01-15" });
        const b = spec.build(lex, view, seeded(7000 + seed * 13 + band));
        if (!b) continue;
        built++;
        const h = hits(taskText(b.task));
        if (h.length) found.push(`${spec.id} band ${band} seed ${seed}: ${h.join(", ")}`);
      }
    }
  }
  assert.ok(built > TASKS.length * 50, `only ${built} questions were built`);
  assert.deepEqual(found, []);
});

test("nothing outside the lexicon carries one either: sentences, exercises, definitions", () => {
  const sent = [];
  for (const s of DATA.sent) {
    const h = hits(s.t);
    if (h.length) sent.push(`${s.t} (${h.join(", ")})`);
    for (const t of s.tok) {
      if (DATA.blocked.includes(t.l) || DATA.blocked.includes(`${t.l}|${t.x}`)) sent.push(`${s.t}: ${t.l}`);
    }
  }
  assert.deepEqual(sent, [], "the sentence bank");
  assert.deepEqual(hits(JSON.stringify(EX)), [], "the hand-written exercises");
  const defs = lex.all.filter((w) => w.d && hits(w.d).length && !DEF_ALLOWED[w.o]).map((w) => `${w.o}: ${w.d}`);
  assert.deepEqual(defs, [], "a definition of a word the pupil does see");
  /* A dictionary example is not needed for the meaning, and pipeline/build_bundle.py
     drops one that uses a blocked word: none may be left. */
  const ex = lex.all.filter((w) => w.x && hits(w.x).length).map((w) => `${w.o}: ${w.x}`);
  assert.deepEqual(ex, [], "a dictionary example");
  /* The two allowed definitions are still the ones they were. */
  for (const l of Object.keys(DEF_ALLOWED)) assert.ok(lex.lookup(l) && lex.lookup(l).d, `${l} lost its definition`);
});
