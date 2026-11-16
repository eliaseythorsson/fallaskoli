/* Critique item 23 for Lýsingarorð, Fornöfn and Töluorð: at least 150
   different questions at every band a type declares, from frames × BÍN
   rather than from longer hand lists — and every one of them right.

   The count is tests/pools.js (fresh pupils, one per build, what each SEES).
   Before v6.13 a pupil doing thirty sessions of ten met the same question
   again in about half of them: lo_stig had 12-16 different questions at any
   band, fn_aftur 11 sentences, to_flt 11, tbl_to twelve tables at þyngd 1.

   The rest holds the generated questions to what the hand-written ones were
   held to: every form is BÍN's (here: the lexicon's, or data/exercises.js,
   which build_exercises.py looked up in BÍN), there is one right answer, and
   a review gets the cell it asks for. */

import test from "node:test";
import assert from "node:assert/strict";
import { EX } from "../data/exercises.js";
import { CATEGORIES, typeById } from "../src/js/tasks/registry.js";
import { seeded } from "../src/js/core/duel.js";
import { adjectiveHelperLemma, MORE_HELPER_NOUNS, helperChoices } from "../src/js/core/helpers.js";
import { framedAdjective, frameMark } from "../src/js/tasks/lysingarord.js";
import { pronounItems, fnGap, fnReflex } from "../src/js/tasks/fornofn.js";
import { numeralItems, pluralItems } from "../src/js/tasks/toluord.js";
import { poolFaults, buildFresh, freshView, poolLex, questionKey, distinctAt, POOL_MIN } from "./pools.js";

const lex = poolLex();
const MINE = ["lysingarord", "fornofn", "toluord"].flatMap((c) => CATEGORIES[c].map((t) => t.id));

/* ---------- the count ---------------------------------------------------- */

/* Two tables of closed word classes cannot reach the count by any honest
   means, and are held instead to every table their bands allow. There are
   four cardinals that decline, so twelve tables of *einn … fjórir* at
   þyngd 1, and the ordinals after them all decline alike; the pronoun
   tables are the pronouns, genders and numbers there are, opened band by
   band (item 13). v6.13 shows an everyday noun beside the cells (*tvo
   hesta*, *hver köttur*) — a help, and a better-looking table, but the
   same forms to write, so not counted as another question (pools.js).
   The numbers are what each builds now: a change that loses tables fails. */
const CLOSED = {
  tbl_to: { 1: 12, 2: 23, 3: 47 },
  tbl_fn: { 1: 32, 2: 64, 3: 106, 4: 139 },
};

test(`item 23: every Lýsingarorð, Fornöfn and Töluorð type builds ${POOL_MIN}+ different questions at every band it declares`, () => {
  assert.deepEqual(poolFaults(MINE.filter((id) => !CLOSED[id])), []);
});

test("item 23: the closed tables (tbl_to, tbl_fn) still show every table their bands allow", () => {
  for (const [id, floor] of Object.entries(CLOSED)) {
    assert.deepEqual(Object.keys(floor).map(Number), typeById(id).bands, `${id}: a band without a floor`);
    for (const band of typeById(id).bands) {
      const k = distinctAt(id, band);
      assert.ok(k >= floor[band], `${id} at þyngd ${band}: ${k} tables (was ${floor[band]})`);
    }
  }
});

test("the pool helper: a reshuffled pair is the same question, another sentence is not", () => {
  const half = (t, a) => ({ s: { t }, i: 2, gloss: t + "!", question: "Hvort?", answer: a });
  const A = half("Pétur sá ___ í speglinum.", "sig"), B = half("Pétur sá ___ í speglinum.", "hann");
  const pair = (x, y) => ({ type: "choice", ...x, options: ["sig", "hann"], second: y });
  assert.equal(questionKey(pair(A, B)), questionKey(pair(B, A)));
  assert.notEqual(questionKey(pair(A, B)), questionKey(pair(A, half("Jón sá ___ í speglinum.", "sig"))));
});

/* ---------- Lýsingarorð: ADJ_FRAMES × the adjectives said of the noun ---- */

const compares = (a) => Object.keys(a.forms).some((k) => k.startsWith("MST-"));

test("adjective frames: the noun is BÍN's, in its mark, and its form says number and definiteness", () => {
  assert.ok(EX.adjFrames.length > 300, `${EX.adjFrames.length} frames`);
  for (const f of EX.adjFrames) {
    const noun = lex.lookup(f.n, f.g);
    assert.ok(noun, `${f.n} is not in the lexicon`);
    const form = noun.forms[f.nm][0];
    assert.ok(f.t.toLowerCase().split(/[ .?]/).includes(form.toLowerCase()), `${f.t}: no ${form}`);
    const readings = Object.keys(noun.forms).filter((m) => noun.forms[m].includes(form));
    assert.equal(new Set(readings.map((m) => /FT/.test(m) + "" + /gr$/.test(m))).size, 1,
      `${f.t}: *${form}* is ${readings.join(", ")}`);
    /* some compared adjective is said of it, so the frame is ever asked */
    assert.ok(lex.adjectives.some((a) => compares(a) && adjectiveHelperLemma(a, f.g) === f.n
      && a.forms[frameMark(f)]), `${f.t}: no adjective for ${frameMark(f)}`);
  }
});

test("adjective frames: what is built is the adjective's own BÍN form, of an adjective that is compared", () => {
  const seen = new Set();
  for (const id of ["lo_beyging", "lo_stig", "lo_samr"]) {
    for (const band of [1, 3, 5]) {
      for (const t of buildFresh(id, band, 400, 50)) {
        if (t.s.tok.some((x) => x.m)) continue;             // a bank sentence or a substituted frame
        assert.ok(t.paradigm && t.paradigm[t.m], `${id}: ${t.s.t} has no cell ${t.m}`);
        assert.deepEqual(t.answers, t.paradigm[t.m], `${id}: ${t.s.t}`);
        assert.ok(Object.keys(t.paradigm).some((k) => k.startsWith("MST-")), `${id}: ${t.cue} is not compared`);
        const deg = { FSB: "frumstig", FVB: "frumstig", MST: "miðstig", ESB: "efsta stig", EVB: "efsta stig" }[t.m.split("-")[0]];
        assert.ok(t.cue.endsWith(" · " + deg), `${id}: cue ${t.cue} for ${t.m}`);
        if (id === "lo_stig") assert.match(t.m, /^(MST|ESB|EVB)-/);
        else assert.match(t.m, /^(FSB|FVB)-/);
        if (id === "lo_samr") assert.match(t.m, /^FSB-/);
        seen.add(t.s.t);
      }
    }
  }
  assert.ok(seen.size > 200, `only ${seen.size} framed sentences`);
});

test("adjective frames: no state, no nationality, no comparison nobody makes (adj_classes.py NO_COMPARE)", () => {
  /* item 23 added the first seven to NO_COMPARE; the lexicon has no
     comparison forms for any of them, so no frame can show one */
  for (const o of ["fatlaður", "blindur", "haltur", "þunglyndur", "lasinn", "kvefaður", "ágætur",
    "dauður", "tilbúinn", "íslenskur"]) {
    const a = lex.lookup(o, "lo");
    if (a) assert.ok(!compares(a), `${o} still has a comparative in the lexicon`);
  }
  for (let k = 0; k < 300; k++) {
    const got = framedAdjective(lex, freshView(1 + (k % 5)), seeded(k), /^(FSB|FVB|MST|EVB)-/);
    assert.ok(got && compares(got.w), got && got.w.o);
  }
});

test("adjective frames: a review gets exactly its cell, and its adjective when it names one", () => {
  const v = freshView(3);
  for (const fc of ["MST-KVK-ÞFET", "EVB-HK-NFET", "FSB-KK-ÞGFFT", "FVB-KVK-NFFT"]) {
    for (let k = 0; k < 20; k++) {
      const got = framedAdjective(lex, v, seeded(k), /./, { fc });
      assert.ok(got, `nothing for ${fc}`);
      assert.equal(got.m, fc);
    }
  }
  const stor = lex.lookup("stór", "lo");
  const got = framedAdjective(lex, v, seeded(1), /^MST-/, { fw: stor });
  assert.equal(got.w.o, "stór");
});

/* ---------- Fornöfn ------------------------------------------------------ */

const SUBJECT_PERSON = { Ég: "ég", Við: "ég" };
const SUBJECT_SAME = { Hann: ["hann", "ET"], Hún: ["hún", "ET"], Þau: ["það", "FT"] };

test("fn_eyda frames: the pronoun is BÍN's, never the subject's own person, never *það* where a person is meant", () => {
  const made = pronounItems().filter((x) => x.framed);
  assert.ok(made.length > 3000, `${made.length} items`);
  for (const x of made) {
    assert.deepEqual(x.a, EX.para[`${x.l}|pfn`][x.m], x.t);
    const first = x.t.split(" ")[0];
    if (SUBJECT_PERSON[first]) assert.notEqual(x.l, "ég", `${x.t} (${x.cue})`);
    const same = SUBJECT_SAME[first];
    if (same) assert.ok(!(x.l === same[0] && x.m.endsWith(same[1])), `${x.t} (${x.cue})`);
    /* the explanation names the governor, and the case is the one asked */
    assert.ok(/stýrir (þolfalli|þágufalli|eignarfalli)\.$/.test(x.why), x.why);
    assert.equal({ þolfalli: "ÞF", þágufalli: "ÞGF", eignarfalli: "EF" }[/stýrir (\S+)\./.exec(x.why)[1]],
      x.m.slice(0, -2), `${x.t}: ${x.why} but ${x.m}`);
  }
  for (const f of EX.pronounFrames.filter((y) => y.who === "p")) {
    for (const [t] of f.s) {
      assert.ok(!made.some((x) => x.t === t && x.l === "það" && x.m.endsWith("ET")), `${t}: *það* of a person`);
    }
  }
});

test("fn_eyda: a review gets its cell, in another sentence than the one missed", () => {
  for (const cell of ["ÞFET", "ÞGFFT", "EFFT"]) {
    for (let k = 0; k < 30; k++) {
      const v = freshView(2, { force: { cell: "fn:" + cell, avoid: "Ég sá ___." } });
      const t = fnGap(lex, v, seeded(k)).task;
      assert.equal(t.m, cell);
      assert.notEqual(t.s.t, "Ég sá ___.");
    }
  }
});

test("fn_aftur frames: two different forms, and each line says what its answer says", () => {
  assert.ok(EX.reflexivePairs.length > 300);
  const REFL = new Set(["sig", "sér", "sín", ...Object.values(EX.para["sinn|fn"]).flat()]);
  const PRON = new Set(["hann", "hún"].flatMap((l) => Object.values(EX.para[`${l}|pfn`]).flat()));
  for (const x of EX.reflexivePairs) {
    assert.notEqual(x.r, x.nr, x.t);
    assert.ok(REFL.has(x.r), `${x.t}: ${x.r}`);
    assert.ok(PRON.has(x.nr), `${x.t}: ${x.nr}`);
    assert.match(x.gs, /(^| )sjálf/, x.gs);
    assert.match(x.go, /(^| )(annan|annar|aðra|aðrar|aðrir|öðrum|annarri|önnur) (strák|stelp)/i, x.go);
    assert.ok(x.lvl >= 2 && x.lvl <= 4, `${x.t}: level ${x.lvl}`);
  }
  for (let k = 0; k < 20; k++) {
    assert.equal(fnReflex(lex, freshView(1, { force: { cell: "fn:ÞFET" } }), seeded(k)), null);
    assert.equal(fnReflex(lex, freshView(1, { force: { cell: "fn:afturbeyging" } }), seeded(k)).task.cell,
      "fn:afturbeyging");
  }
});

test("tbl_fn: the noun beside the pronoun is an everyday noun of the lexicon, the possessives keep maður / kona / barn", () => {
  for (const [g, list] of Object.entries(MORE_HELPER_NOUNS)) {
    for (const o of list) {
      const w = lex.lookup(o, g);
      assert.ok(w, `${o} (${g}) is not in the lexicon`);
      assert.equal(Object.keys(w.forms).length, 16, `${o}: ${Object.keys(w.forms).length} forms`);
    }
  }
  assert.deepEqual(helperChoices(lex.lookup("minn", "fn"), "KVK"), ["kona"]);
  for (const t of buildFresh("tbl_fn", 1, 300)) {
    if (!t.helperLemma) continue;
    assert.ok(helperChoices(t.w, t.cells[0].m.split("-")[0]).includes(t.helperLemma), t.title);
  }
});

/* ---------- Töluorð ------------------------------------------------------ */

test("to_samr / to_val: every numeral is BÍN's for its noun, and *tala við* takes the accusative", () => {
  const items = numeralItems();
  assert.ok(items.length > 900, `${items.length} items`);
  const plOnly = new Set(EX.pluralFrames.flatMap((f) => f.nouns.map((n) => n[0])));
  for (const x of items) {
    assert.deepEqual(x.a, EX.para[`${x.l}|${x.c}`][x.m], x.t);
    assert.ok(!plOnly.has(x.noun), `${x.t}: a plural-only noun takes *tvennir*`);
    assert.equal(x.m, `${{ kk: "KK", kvk: "KVK", hk: "HK" }[x.g]}-${x.case}${x.n === 1 ? "ET" : "FT"}`, x.t);
    if (/töluðum við/.test(x.t)) assert.equal(x.case, "ÞF", x.t);
  }
  /* *koma heim með* has two right cases with people (in company: dative;
     brought home: accusative) and is the accusative with things: no
     numeral frame asks it any more; *mæta* is the dative and only that. */
  assert.ok(!items.some((y) => /kom heim með/.test(y.t)), "a frame with *kom heim með*");
  assert.ok(items.some((y) => /mætti .* á leiðinni heim/.test(y.t) && y.case === "ÞGF"));
});

test("to_flt: only nouns with no singular, and the numerals of the plural-only nouns", () => {
  const items = pluralItems();
  assert.ok(items.length > 400, `${items.length} items`);
  const OK = { 1: /^ein/, 2: /^tvenn/, 3: /^þrenn/, 4: /^fern/ };
  for (const x of items) {
    assert.match(x.a[0], OK[x.n], `${x.t}: ${x.a}`);
    const w = lex.lookup(x.noun, x.g);
    assert.ok(!w || !w.forms.NFET, `${x.noun} has a singular`);
    if (x.n > 1) assert.ok(x.plain.length && !x.plain.includes(x.a[0]), `${x.t}: ${x.plain}`);
  }
});

test("tbl_to: the noun beside each cell agrees with it, from the lexicon", () => {
  for (const band of typeById("tbl_to").bands) {
    for (const t of buildFresh("tbl_to", band, 200)) {
      const g = t.cells[0].m.split("-")[0].toLowerCase();
      for (const c of t.cells) {
        assert.ok(c.helper, `${t.title}: no noun beside ${c.m}`);
        const caseNum = c.m.replace(/^(KK|KVK|HK)-/, "") + (t.w.c === "rt" ? "gr" : "");
        assert.ok(lex.nouns.some((w) => w.c === g && (w.forms[caseNum] || []).includes(c.helper)),
          `${t.title}: ${c.helper} is not a ${caseNum} of a ${g} noun`);
      }
    }
  }
});
