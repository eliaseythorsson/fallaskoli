/* v6.13, critique item 29: the odd rewrites, and four more kinds of Umritun.

   *Í gær mundi ég vel eftir ferðinni í fyrra* came from a sentence that
   already said when; the opener kinds now read the parsed tokens for a time
   adverbial. The four new kinds — a passive back to the active, a statement
   to a yes/no question, two sentences joined with a given conjunction,
   direct speech to indirect — are built only where the answer is certain.
   Every expected output written out below was read by hand. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { normalise, stripAccents } from "../src/js/core/grading.js";
import { seeded } from "../src/js/core/duel.js";
import { blankState, newSession } from "../src/js/core/state.js";
import { SKILL_IDS } from "../src/js/core/skills.js";
import { createPolicy } from "../src/js/core/policy.js";
import { tagsOf, diagnose } from "../src/js/core/diagnosis.js";
import { gradeTransform, transformNote, transformFeedback, judge } from "../src/js/core/answer.js";
import { TRANSFORMS, timeAdverbial, transformOpener, transformActive, transformQuestion,
  transformJoin, transformIndirect, taskTransform } from "../src/js/tasks/malbeiting.js";
import { show } from "./helpers.js";

const lex = buildLexicon(DATA);
const bank = (text) => {
  const s = lex.sentences.find((x) => x.t === text);
  assert.ok(s, `"${text}" is not in the sentence bank`);
  return s;
};
const ALL_FORMS = new Set();
lex.all.forEach((w) => Object.values(w.forms).forEach((fs) => fs.forEach((f) => ALL_FORMS.add(normalise(f)))));

/* ---------------------------------------------------------- time clash */

test("Í gær / Á morgun: never from a sentence that already says when or how often", () => {
  /* The sentence of the critique, and one sentence for each kind of time
     adverbial the item names. */
  const clash = [
    "Ég man vel eftir ferðinni í fyrra.",                       // í fyrra (left unanalysed by Greynir)
    "Hann keypti nýjan bíl í fyrra.",
  ];
  for (const re of [/ í dag\b/, / í gær\b/, / á morgun\b/, /\bnúna\b/, /\balltaf\b/, /\boft\b/,
    /á hverjum degi/, /um helgina/, / í kvöld\b/, /\bdaglega\b/, /á laugardaginn/]) {
    const s = lex.sentences.find((x) => re.test(x.t) && /\.$/.test(x.t));
    assert.ok(s, `no sentence with ${re}`);
    clash.push(s.t);
  }
  for (const t of clash) {
    const s = bank(t);
    assert.ok(timeAdverbial(lex, s), `"${t}" has a time adverbial`);
    assert.equal(transformOpener(lex, s, "Í gær"), null, `Í gær … from "${t}"`);
    assert.equal(transformOpener(lex, s, "Á morgun"), null, `Á morgun … from "${t}"`);
  }
  assert.equal(TRANSFORMS.igaer.build(lex, bank("Ég man vel eftir ferðinni í fyrra.")), null);
});

test("the time test reads tokens: *þá* the pronoun is not *þá* the adverb", () => {
  /* Greynir gives *í gær* as one token; the test reads its lemma. *Þá*
     ("them") has the lemma *hann*. */
  const pron = (t) => t.c === "fornafn" && String(t.w).toLowerCase() === "þá";
  const withThem = lex.sentences.filter((x) => x.tok.some(pron));
  for (const s of withThem)
    assert.equal(timeAdverbial(lex, s), timeAdverbial(lex, { ...s, tok: s.tok.filter((t) => !pron(t)) }), s.t);
  /* A made-up *þá* with no class is the adverb. */
  assert.ok(timeAdverbial(lex, { tok: [{ w: "þá", l: "þá", c: "atviksorð" }] }));
  for (const s of lex.sentences) {
    for (const opener of ["Í gær", "Á morgun"]) {
      const r = transformOpener(lex, s, opener);
      if (!r) continue;
      /* The rewrite says when exactly once. */
      const n = normalise(r.answers[0]);
      for (const w of ["í gær", "á morgun", "í dag", "í fyrra", "núna", "í kvöld", "um helgina", "alltaf"])
        assert.ok(n.split(w).length - 1 <= (normalise(opener) === w ? 1 : 0), `"${r.answers[0]}" says ${w} twice`);
    }
  }
});

test("the past tense still takes *alltaf* and *oft*, and still refuses *í fyrra*", () => {
  assert.ok(TRANSFORMS.past.build(lex, bank("Ég borða epli daglega.")));
  assert.ok(TRANSFORMS.past.build(lex, bank("Ég hugsa oft um krakkana.")));
  assert.equal(TRANSFORMS.past.build(lex, bank("Ég man vel eftir ferðinni í fyrra.")), null);
});

/* ------------------------------------------------- 200 seeded builds */

/** One build of a kind from a seed: the bank in a seeded order, the first
    sentence the kind can use. */
function buildKind(kind, seed) {
  const rng = seeded(seed);
  const order = lex.sentences.map((s) => [rng(), s]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  for (const s of order) {
    const r = TRANSFORMS[kind].build(lex, s);
    if (r) return r;
  }
  return null;
}

const NEW_KINDS = ["active", "question", "join", "indirect"];

for (const kind of NEW_KINDS) {
  test(`${kind}: 200 seeded builds, each with right, distinct answers made of known words`, () => {
    const seen = new Set();
    for (let seed = 1; seed <= 200; seed++) {
      const r = buildKind(kind, seed);
      assert.ok(r, `${kind}: nothing built from seed ${seed}`);
      seen.add(r.s.t);
      assert.equal(new Set(r.answers.map(normalise)).size, r.answers.length, `${kind}: an answer twice for "${r.s.t}"`);
      const model = r.model || r.answers[0];
      assert.ok(r.answers.includes(model), `${kind}: the model is not an answer`);
      for (const a of r.answers) {
        assert.ok(!/undefined|null/.test(a), a);
        assert.equal(gradeTransform(a, r), "correct", `${kind}: "${a}" is not graded right`);
        /* Every word stood in what was shown or in the bank sentence, or
           BÍN has it. */
        const known = new Set(normalise(`${r.from || ""} ${r.s.t}`).split(" "));
        for (const w of normalise(a).split(" "))
          assert.ok(known.has(w) || ALL_FORMS.has(w) || w === "að", `${kind}: "${w}" in "${a}"`);
      }
      assert.equal(gradeTransform(r.from || r.s.t, r), "wrong", `${kind}: copying what was shown passes`);
      assert.ok(r.instruction && r.why && Array.isArray(r.checks) && r.checks.length);
      /* The answers are what the kind says they are — no more. */
      if (kind === "active") assert.equal(r.model, r.s.t);
      if (kind === "join") {
        assert.equal(r.model, r.s.t);
        assert.equal(r.lines.length, 2);
        assert.ok(r.answers.length <= 2);
      }
      if (kind === "question") {
        assert.equal(r.answers.length, 1);
        assert.match(r.answers[0], /\?$/);
      }
      if (kind === "indirect") {
        /* With *að* and without, and nothing else unless BÍN gives a verb
           two forms. */
        assert.equal(r.answers.filter((a) => normalise(a).split(" ")[2] === "að").length * 2, r.answers.length);
        assert.match(r.from, /^(Hann|Hún) (sagði|segir): „.+“$/);
      }
    }
    assert.ok(seen.size >= { active: 8, question: 60, join: 15, indirect: 40 }[kind],
      `${kind}: only ${seen.size} different sentences in 200 builds`);
  });
}

/* --------------------------------------------- expected, read by hand */

const ACTIVE = [
  ["Amma bakar köku handa mér.", "Kaka er bökuð handa mér af ömmu."],
  ["Pabbi keyrir bílinn heim.", "Bíllinn er keyrður heim af pabba."],
  ["Stelpan las söguna upphátt.", "Sagan var lesin upphátt af stelpunni."],
  ["Gamla konan les bók.", "Bók er lesin af gömlu konunni."],
  ["Kennarinn safnaði verkefnum nemenda í möppu.", "Verkefnum nemenda var safnað í möppu af kennaranum."],
  ["Kennarinn skrifaði nafnið mitt á töfluna.", "Nafnið mitt var skrifað á töfluna af kennaranum."],
];
const QUESTION = [
  ["Hesturinn borðar gras.", "Borðar hesturinn gras?"],
  ["Hann keypti nýjan bíl í fyrra.", "Keypti hann nýjan bíl í fyrra?"],
  ["Pabbi minn er kennari.", "Er pabbi minn kennari?"],
  ["Mamma talaði við kennarann.", "Talaði mamma við kennarann?"],
  ["Nöfn kennaranna standa á blaðinu.", "Standa nöfn kennaranna á blaðinu?"],
];
const JOIN = [
  ["Þegar ég kom heim var maturinn tilbúinn.", "þegar", ["Ég kom heim.", "Maturinn var tilbúinn."]],
  ["Ég las bókina áður en ég fór að sofa.", "áður en", ["Ég las bókina.", "Ég fór að sofa."]],
  ["Ef veðrið verður gott förum við í útilegu.", "ef", ["Veðrið verður gott.", "Við förum í útilegu."]],
  ["Við biðum þangað til rútan kom loksins.", "þangað til", ["Við biðum.", "Rútan kom loksins."]],
  ["Þegar amma kom í heimsókn bakaði hún pönnukökur handa öllum krökkunum.", "þegar",
    ["Amma kom í heimsókn.", "Hún bakaði pönnukökur handa öllum krökkunum."]],
  ["Þegar ég kom heim í gær voru nöfn allra barnanna komin á listann.", "þegar",
    ["Ég kom heim í gær.", "Nöfn allra barnanna voru komin á listann."]],
];
const INDIRECT = [
  ["Bíllinn er rauður.", "Hann sagði: „Bíllinn er rauður.“", "Hann sagði að bíllinn væri rauður."],
  ["Blómið er fallegt.", "Hún segir: „Blómið er fallegt.“", "Hún segir að blómið sé fallegt."],
  ["Kötturinn sefur í sófanum.", "Hann sagði: „Kötturinn sefur í sófanum.“", "Hann sagði að kötturinn svæfi í sófanum."],
  ["Ég á rauðan bíl.", "Hún segir: „Ég á rauðan bíl.“", "Hún segir að hún eigi rauðan bíl."],
  ["Ég man ekki nöfn kennaranna.", "Hún sagði: „Ég man ekki nöfn kennaranna.“", "Hún sagði að hún myndi ekki nöfn kennaranna."],
  ["Ég ætla að læra heima.", "Hún sagði: „Ég ætla að læra heima.“", "Hún sagði að hún ætlaði að læra heima."],
  ["Hann er sterkastur í hópnum.", "Hún segir: „Hann er sterkastur í hópnum.“", "Hún segir að hann sé sterkastur í hópnum."],
  ["Krakkarnir hlaupa út í garð.", "Hann sagði: „Krakkarnir hlaupa út í garð.“", "Hann sagði að krakkarnir hlypu út í garð."],
];

test("germynd: the passive with its agent, back to the bank sentence", () => {
  for (const [text, from] of ACTIVE) {
    const r = transformActive(lex, bank(text));
    assert.ok(r, text);
    assert.equal(r.from, from);
    assert.deepEqual(r.answers, [text]);
  }
  /* A pronoun agent (*af mér*) and a time adverbial are left out. */
  assert.equal(transformActive(lex, bank("Ég opna gluggann.")), null);
  assert.equal(transformActive(lex, bank("Ég les bókina núna.")), null);
});

test("spurning: the verb first, nothing else moved", () => {
  for (const [text, q] of QUESTION) {
    const r = transformQuestion(lex, bank(text));
    assert.ok(r, text);
    assert.deepEqual(r.answers, [q]);
  }
  for (const no of ["Sjálfur kennarinn gat ekki leyst dæmið.", "Þú mátt koma núna."]) {
    const s = lex.sentences.find((x) => x.t === no);
    if (s) assert.equal(transformQuestion(lex, s), null, no);
  }
  /* Not from a sentence that does not begin with its subject, nor with
     *ég* or an empty *það*. */
  for (const s of lex.sentences) {
    const r = transformQuestion(lex, s);
    if (!r) continue;
    assert.equal(s.tok[0].r, "frumlag", s.t);
    assert.ok(!/^(ég|það|þú) /i.test(s.t), s.t);
  }
});

test("tenging: the bank's own sentence, split in two", () => {
  for (const [text, conj, lines] of JOIN) {
    const r = transformJoin(lex, bank(text));
    assert.ok(r, text);
    assert.equal(r.conj, conj);
    assert.deepEqual(r.lines, lines);
    assert.equal(r.model, text);
  }
  /* What cannot be split: a clause the verb needs (*Ég man.*), a clause that
     belongs to a noun, a subjunctive, a comparison. */
  for (const no of ["Ég man þegar við bjuggum í gamla húsinu.",
    "Ég man vel eftir deginum þegar við fluttum í nýja húsið okkar.",
    "Þótt ég væri þreyttur kláraði ég heimanámið.",
    "Mamma bað mig að þvo bílinn áður en gestirnir kæmu.",
    "Húsið er minna en ég hélt.", "Bókin mín er þyngri en þín."])
    assert.equal(transformJoin(lex, bank(no)), null, no);
});

test("óbein ræða: the subjunctive from BÍN, the speaker for *ég*", () => {
  for (const [text, from, model] of INDIRECT) {
    const r = transformIndirect(lex, bank(text));
    assert.ok(r, text);
    assert.equal(r.from, from);
    assert.equal(r.model, model);
    assert.ok(r.answers.includes(model.replace(/ að /, " ")), "without *að*");
  }
  /* No quote with *þú*, *við*, *mér*, a time or a place that would shift. */
  for (const s of lex.sentences) {
    const r = transformIndirect(lex, s);
    if (!r) continue;
    /* Whole words: JavaScript's \b takes *í* for a word boundary. */
    const words = normalise(s.t).split(" ");
    for (const w of ["þú", "þig", "þér", "við", "okkur", "mig", "mér", "minn", "mín", "mitt", "hér", "hérna",
      "þetta", "núna"]) assert.ok(!words.includes(w), `${w} in "${s.t}"`);
    assert.ok(!/ í dag | á morgun /.test(` ${normalise(s.t)} `), s.t);
    assert.ok(!/\bég\b/.test(normalise(r.model)), r.model);
  }
});

test("óbein ræða: what agrees with *ég* decides the speaker", () => {
  const vera = { w: "er", l: "vera", c: "sagnorð", m: "GM-FH-NT-1P-ET", r: "umsögn", k: "aðalsetning", x: "so" };
  const eg = { w: "Ég", l: "ég", c: "fornafn", m: "NFET", r: "frumlag", k: "aðalsetning", x: "pfn" };
  const dot = { w: ".", l: ".", c: null, m: null, r: null, k: "aðalsetning", x: "" };
  const make = (w, l, c, m) => ({ t: `Ég er ${w}.`, lvl: 1,
    tok: [eg, vera, { w, l, c, m, r: "sagnfylling", k: "aðalsetning", x: c === "nafnorð" ? "no" : "lo" }, dot] });
  const kk = transformIndirect(lex, make("þreyttur", "þreyttur", "lýsingarorð", "FSB-KK-NFET"));
  const kvk = transformIndirect(lex, make("þreytt", "þreyttur", "lýsingarorð", "FSB-KVK-NFET"));
  assert.ok(kk && kvk, "þreyttur is in the lexicon");
  assert.match(kk.model, /^Hann (sagði að hann væri|segir að hann sé) þreyttur\.$/);
  assert.match(kvk.model, /^Hún (sagði að hún væri|segir að hún sé) þreytt\.$/);
  assert.equal(transformIndirect(lex, make("kennari", "kennari", "nafnorð", "NFET")), null);
});

/* ------------------------------------------------------------- grading */

test("the graders accept every right variant", () => {
  const ind = transformIndirect(lex, bank("Bíllinn er rauður."));
  for (const a of ["Hann sagði að bíllinn væri rauður.", "hann sagði að bíllinn væri rauður",
    "Hann sagði, að bíllinn væri rauður.", "Hann sagði bíllinn væri rauður."])
    assert.equal(gradeTransform(a, ind), "correct", a);
  assert.match(transformFeedback("Hann sagði bíllinn væri rauður.", ind, "correct"), /að.*má sleppa/);
  assert.equal(transformFeedback("Hann sagði að bíllinn væri rauður.", ind, "correct"), null);
  /* *að* further on is not the *að* of indirect speech. */
  const leit = transformIndirect(lex, bank("Ég er að leita að lykli."));
  assert.match(transformFeedback(leit.model.replace(/ sagði að /, " sagði "), leit, "correct") || "", /má sleppa/);

  const q = transformQuestion(lex, bank("Hesturinn borðar gras."));
  assert.equal(gradeTransform("Borðar hesturinn gras?", q), "correct");
  assert.equal(gradeTransform("borðar hesturinn gras", q), "correct");
  assert.match(transformFeedback("Borðar hesturinn gras.", q, "correct"), /spurningarmerki/);
  assert.equal(transformFeedback("Borðar hesturinn gras?", q, "correct"), null);

  const j = transformJoin(lex, bank("Ég ætlaði að hringja í ömmu í gærkvöldi en ég gleymdi því alveg."));
  for (const a of ["Ég ætlaði að hringja í ömmu í gærkvöldi en ég gleymdi því alveg.",
    "Ég ætlaði að hringja í ömmu í gærkvöldi, en ég gleymdi því alveg.",
    "Ég ætlaði að hringja í ömmu í gærkvöldi en gleymdi því alveg."])
    assert.equal(gradeTransform(a, j), "correct", a);
  const j2 = transformJoin(lex, bank("Þegar ég kom heim var maturinn tilbúinn."));
  assert.equal(gradeTransform("Þegar ég kom heim, var maturinn tilbúinn.", j2), "correct");

  const act = transformActive(lex, bank("Amma bakar köku handa mér."));
  assert.equal(gradeTransform("Amma bakar köku handa mér", act), "correct");
  /* A missing accent is a slip, as everywhere. */
  assert.equal(gradeTransform(stripAccents("Hann sagði að bíllinn væri rauður."), ind), "slip");
});

test("the graders refuse the common wrong answers, and say why", () => {
  const wrong = (task, a, note) => {
    assert.equal(gradeTransform(a, task), "wrong", a);
    const n = transformNote(a, task);
    assert.ok(n && note.test(n), `"${a}": the note is ${JSON.stringify(n)}`);
  };
  /* Indirect speech: the indicative kept; the subjunctive of the wrong
     tense; *ég* kept. */
  const ind = transformIndirect(lex, bank("Bíllinn er rauður."));
  wrong(ind, "Hann sagði að bíllinn er rauður.", /viðtengingarhátt\*\*: \*væri\*, ekki \*er\*/);
  wrong(ind, "Hann sagði að bíllinn sé rauður.", /þátíðar\*\*: \*væri\*, ekki \*sé\*/);
  const ind2 = transformIndirect(lex, bank("Blómið er fallegt."));
  wrong(ind2, "Hún segir að blómið væri fallegt.", /nútíðar\*\*: \*sé\*, ekki \*væri\*/);
  const ind3 = transformIndirect(lex, bank("Ég á rauðan bíl."));
  wrong(ind3, "Hún segir að ég eigi rauðan bíl.", /\*ég\* verður \*hún\*/);
  wrong(ind3, "Hún segir að hún á rauðan bíl.", /viðtengingarhátt/);

  /* The question: the subject left first; *hvort*; the subject not next. */
  const q = transformQuestion(lex, bank("Hesturinn borðar gras."));
  wrong(q, "Hesturinn borðar gras?", /fremst/);
  wrong(q, "Hvort borðar hesturinn gras?", /Hvort/);
  wrong(q, "Borðar gras hesturinn?", /strax á eftir sögninni/);

  /* The join: no inversion after a clause that opens the sentence; an
     inversion after the conjunction; the halves the wrong way round. */
  const j = transformJoin(lex, bank("Þegar ég kom heim var maturinn tilbúinn."));
  wrong(j, "Þegar ég kom heim maturinn var tilbúinn.", /sögnin í aðalsetningunni kemur strax á eftir/);
  wrong(j, "Maturinn var tilbúinn þegar ég kom heim.", /Byrjaðu á \*Þegar\*/);
  const j2 = transformJoin(lex, bank("Ég las bókina áður en ég fór að sofa."));
  wrong(j2, "Ég las bókina áður en fór ég að sofa.", /frumlagið á undan sögninni/);
  wrong(j2, "Áður en ég fór að sofa las ég bókina.", /fyrri setningunni/);
  /* A join with half of it is not finished, even where the rest of the
     sentence "stood as it was". */
  assert.equal(gradeTransform("Ég las bókina áður en", j2), "wrong");

  /* The active: the passive kept; *af* kept; the old subject in the
     nominative. */
  const a = transformActive(lex, bank("Amma bakar köku handa mér."));
  wrong(a, "Amma er bökuð köku handa mér.", /hvorki \*er\* né lýsingarháttur/);
  wrong(a, "Af ömmu bakar köku handa mér.", /\*af\* fellur burt/);
  wrong(a, "Amma bakar kaka handa mér.", /þolfall: \*köku\*/);
  assert.equal(gradeTransform("Amma bakar", a), "wrong", "half a sentence is not an answer");
});

test("judge: the note travels with the verdict; the diagnosis knows the new kinds", () => {
  const S = blankState();
  const q = transformQuestion(lex, bank("Hesturinn borðar gras."));
  const tq = { type: "umritun", skill: "malbeiting", kind: "question", base: 11, cell: "umritun:question", ...q };
  const right = judge(tq, { text: "Borðar hesturinn gras" }, { S });
  assert.equal(right.ok, true);
  assert.match(right.detail.note, /spurningarmerki/);
  const bad = judge(tq, { text: "Hesturinn borðar gras?" }, { S });
  assert.equal(bad.ok, false);
  assert.match(bad.detail.note, /fremst/);
  assert.ok(bad.findings.some((f) => f.p === "v2"), JSON.stringify(bad.findings));
  assert.ok(tagsOf(tq).has("v2"));

  const i = transformIndirect(lex, bank("Bíllinn er rauður."));
  const ti = { type: "umritun", skill: "malbeiting", kind: "indirect", base: 16, cell: "umritun:indirect", ...i };
  assert.ok(tagsOf(ti).has("verb:vh"));
  const d = diagnose(ti, { kind: "transform", typed: "Hann sagði að bíllinn er rauður.", ok: false });
  assert.ok(d.some((f) => f.p === "hattur"), JSON.stringify(d));

  const a = transformActive(lex, bank("Amma bakar köku handa mér."));
  assert.ok(tagsOf({ type: "umritun", kind: "active", ...a }).has("passive"));
});

/* ------------------------------------------------ in the question type */

function ctxAt(diff) {
  const S = blankState();
  SKILL_IDS.forEach((id) => { S.enabled[id] = true; });
  const sess = newSession(S);
  Object.keys(sess.diff).forEach((k) => { sess.diff[k] = diff; });
  const all = {};
  SKILL_IDS.forEach((id) => { all[id] = true; });
  return { lex, S, sess, run: {}, forcedNoun: null,
    policy: createPolicy(null, { skills: all, types: {}, levels: {}, attrs: {}, safeVocab: null }) };
}

/* Which kinds a þyngd can ask depends on its sentences as well: þyngd 5 and
   6 have no sentence for the passive (nor had they before v6.13). */
test("Umritun asks every kind, and only from its þyngd", () => {
  const kinds = (diff, n) => {
    const ctx = ctxAt(diff);
    const seen = new Map();
    for (let seed = 1; seed <= n; seed++) {
      const t = show(ctx, taskTransform, seeded(seed));
      if (!t) continue;
      seen.set(t.kind, (seen.get(t.kind) || 0) + 1);
      assert.equal(gradeTransform(t.model || t.answers[0], t), "correct", `${t.kind}: ${t.s.t}`);
    }
    return seen;
  };
  const mid = kinds(3, 300);
  for (const k of Object.keys(TRANSFORMS)) assert.ok(mid.get(k) > 0, `${k} never asked at þyngd 3: ${[...mid]}`);
  const low = kinds(1, 200);
  for (const k of ["active", "join", "indirect", "passive"]) assert.ok(!low.has(k), `${k} at þyngd 1`);
  assert.ok(low.get("question") > 0);
});
