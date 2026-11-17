/* No handful of sentences carries the reverse analysis (v6.13, critique
   item 24).

   Ten frames made 60% of the reverse-analysis questions; *Þetta gengur ekki
   án ___* and *Ferðin tafðist vegna ___* a quarter. Now a bank sentence
   carries at most one such question a session, the sentences this pupil has
   met least are preferred, and 40 more frames that take nearly any noun
   stand in pipeline/sentences.py. Both rules are effects (tasks/effects.js `frame`),
   so the builder stays pure. */

import test from "node:test";
import assert from "node:assert/strict";
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, newSession, migrate, FRAMES_MAX } from "../src/js/core/state.js";
import { mergeStates } from "../src/js/core/merge.js";
import { cleanState } from "../server/guard.mjs";
import { SKILL_IDS } from "../src/js/core/skills.js";
import { seeded } from "../src/js/core/duel.js";
import { typeById, makeView, applyEffects, FX } from "../src/js/tasks/index.js";
import { frameKey, substitutable, nounFrames, frameIndex } from "../src/js/tasks/frames.js";

const lex = buildLexicon(DATA);
const T = typeById("revform");

function pupil() {
  const S = blankState();
  SKILL_IDS.forEach((k) => { S.enabled[k] = true; });
  return S;
}
const sessionAt = (S, band) => {
  const sess = newSession(S);
  SKILL_IDS.forEach((k) => { sess.diff[k] = band; });
  return sess;
};
const day = (d) => "2026-02-" + String(1 + (d % 28)).padStart(2, "0");

/** The bank sentence a question stands on, or null for a bare form. */
const sentenceOf = (b) => (b.effects.find((e) => e.op === "frame") || {}).key || null;

/* ---------- the effect ------------------------------------------------------ */

test("the frame effect: used this session, and one more in the pupil's tally", () => {
  const S = blankState(), sess = newSession(S);
  applyEffects({ S, sess }, [FX.frame("fabc"), FX.frame("fabc"), FX.frame("fxyz")]);
  assert.deepEqual(sess.frames, ["fabc", "fabc", "fxyz"]);
  assert.deepEqual(S.frames, { fabc: 2, fxyz: 1 });
});

test("frameKey: short, stable, and different for different sentences", () => {
  const keys = new Set(lex.sentences.map(frameKey));
  assert.equal(keys.size, new Set(lex.sentences.map((s) => s.t)).size, "two sentences share a key");
  for (const k of keys) assert.match(k, /^f[0-9a-z]{1,7}$/);
  assert.equal(frameKey({ t: "Ferðin tafðist vegna bílsins." }), frameKey({ t: "Ferðin tafðist vegna bílsins." }));
});

/* ---------- the builder ----------------------------------------------------- */

test("every reverse-analysis question in a sentence says which sentence, and changes nothing", () => {
  const S = pupil(), sess = sessionAt(S, 3);
  const before = JSON.stringify({ S, sess });
  let framed = 0;
  for (let k = 0; k < 80; k++) {
    const b = T.build(lex, makeView({ S, sess, today: day(0) }), seeded(10 + k));
    assert.ok(b);
    if (b.task.s) { framed++; assert.ok(sentenceOf(b), "a question in a sentence with no frame effect"); }
    else assert.equal(sentenceOf(b), null);
  }
  assert.ok(framed > 40);
  assert.equal(JSON.stringify({ S, sess }), before, "building wrote to the state");
});

test("a sentence carries at most one reverse-analysis question a session", () => {
  for (const band of [1, 3, 5]) {
    const S = pupil(), sess = sessionAt(S, band), rng = seeded(400 + band);
    const seen = new Set();
    for (let q = 0; q < 40; q++) {
      sess.seen = [];
      const b = T.build(lex, makeView({ S, sess, today: day(0) }), rng);
      assert.ok(b, `nothing built at question ${q + 1}`);
      applyEffects({ S, sess }, b.effects);
      const key = sentenceOf(b);
      if (!key) continue;
      assert.ok(!seen.has(key), `þyngd ${band}: "${b.task.s.t}" twice in one session`);
      seen.add(key);
    }
  }
});

test("the sentences this pupil has met least are preferred", () => {
  /* The two that carried a quarter of the questions, met fifty times each. */
  const tired = lex.sentences.filter((s) => /^(Ferðin tafðist vegna|Þetta gengur ekki án)/.test(s.t)).map(frameKey);
  assert.ok(tired.length >= 4);
  const share = (S) => {
    let hit = 0, n = 0;
    for (let k = 0; k < 300; k++) {
      const b = T.build(lex, makeView({ S, sess: sessionAt(S, 2), today: day(0) }), seeded(700 + k));
      const key = sentenceOf(b);
      if (!key) continue;
      n++; if (tired.includes(key)) hit++;
    }
    return hit / n;
  };
  const fresh = pupil(), worn = pupil();
  tired.forEach((k) => { worn.frames[k] = 50; });
  const a = share(fresh), b = share(worn);
  assert.ok(a > 0.03, `the two frames were seldom used to begin with (${a})`);
  assert.ok(b < a / 4, `seen fifty times, still ${(100 * b).toFixed(1)}% (was ${(100 * a).toFixed(1)}%)`);
});

test("over 30 sessions no sentence carries more than 5% of a pupil's reverse-analysis questions", () => {
  for (const seed of [1, 2, 3]) {
    const S = pupil();
    const count = {};
    let n = 0;
    for (let d = 0; d < 30; d++) {
      const sess = sessionAt(S, 1 + ((d + seed) % 5));
      const rng = seeded(seed * 1000 + d);
      for (let q = 0; q < 12; q++) {
        sess.seen = [];
        const b = T.build(lex, makeView({ S, sess, today: day(d) }), rng);
        if (!b) continue;
        applyEffects({ S, sess }, b.effects);
        n++;
        const key = sentenceOf(b);
        if (key) count[key] = (count[key] || 0) + 1;
      }
    }
    const [key, most] = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
    const text = lex.sentences.find((s) => frameKey(s) === key).t;
    assert.ok(most / n <= 0.05, `seed ${seed}: "${text}" carried ${most} of ${n} (${(100 * most / n).toFixed(1)}%)`);
    const top10 = Object.values(count).sort((a, b) => b - a).slice(0, 10).reduce((a, x) => a + x, 0);
    assert.ok(top10 / n < 0.4, `seed ${seed}: the ten commonest sentences carried ${(100 * top10 / n).toFixed(0)}%`);
  }
});

test("a rescue drill may come back to a sentence: one word, asked again and again", () => {
  const S = pupil(), sess = sessionAt(S, 3);
  const word = lex.lookup("hestur", "kk");
  let built = 0;
  for (let q = 0; q < 25; q++) {
    const b = T.build(lex, makeView({ S, sess, today: day(0), drillWord: word }), seeded(50 + q));
    if (!b) continue;
    built++;
    applyEffects({ S, sess }, b.effects);
  }
  assert.equal(built, 25);
});

/* ---------- the new frames -------------------------------------------------- */

const NEW_FRAMES = [
  "Þarna er hestur.", "Á myndinni eru hestar.", "Hvar er síminn?", "Hvar eru lyklarnir?",
  "Bækurnar voru út um allt.", "Hvað kostar bókin?", "Hvað kosta bækurnar?",
  "Í búðinni voru bækur á tilboði.", "Bókin kom mér á óvart.", "Hestarnir komu mér á óvart.",
  "Fjölskyldan skiptir mig miklu máli.", "Mig vantar blýant.", "Ég fékk hund í jólagjöf.",
  "Við lærðum um eldfjöll í skólanum.", "Bókin fjallar um drauga.", "Ég veit ekkert um hesta.",
  "Ég veit ekkert um hestana.", "Mamma spurði mig um hestana.", "Við ræddum hugmyndirnar í tímanum.",
  "Við fórum að skoða hestana.", "Ég teiknaði mynd af hesti.", "Ég teiknaði mynd af hestum.",
  "Ég teiknaði mynd af hestinum.", "Ég hef heyrt margar sögur af draugum.", "Ég hef gaman af hestum.",
  "Ég safna steinum.", "Ég sagði mömmu frá hestunum.", "Kennarinn sagði okkur frá ferðinni.",
  "Ég gleymdi alveg bókinni.", "Ég gleymdi alveg bókunum.", "Ég kom heim án lykils.",
  "Við komumst ekki af án vatns.", "Við komumst ekki af án bíla.", "Ég gæti ekki verið án tónlistar.",
  "Ég gæti ekki verið án vina.", "Leiknum var frestað vegna veðurs.", "Þetta gerðist allt vegna bílsins.",
  "Þetta gerðist allt vegna bílanna.", "Kötturinn faldi sig á milli bílanna.", "Ég man ekki lengur lit bílsins.",
];

test("forty new frames: in the bank, open to other nouns, pinning no gender", () => {
  assert.equal(new Set(NEW_FRAMES).size, 40);
  for (const t of NEW_FRAMES) {
    const s = lex.sentences.find((x) => x.t === t);
    assert.ok(s, `${t} is not in the bank`);
    assert.ok(substitutable(s), `${t}: no slot other nouns may stand in`);
    assert.ok(!s.rk, `${t}: pins the gender ${s.rk}`);
    /* many nouns, of all three genders, really do fit it */
    const m = s.tok[s.slot].m;
    const f = frameIndex(lex).noun.get(m).find((x) => x.s === s);
    const fits = lex.nouns.filter((w) => nounFrames(lex, w, m).includes(f));
    assert.ok(fits.length >= 50, `${t}: only ${fits.length} nouns fit`);
    assert.deepEqual([...new Set(fits.map((w) => w.c))].sort(), ["hk", "kk", "kvk"], `${t}: not every gender fits`);
  }
});

/* ---------- the saved state ------------------------------------------------- */

test("the tally is kept, cleaned, merged and held to a size", () => {
  const S = blankState();
  assert.deepEqual(S.frames, {});
  const raw = { ...S, frames: { fabc: 3, fq: 1.7, "not a key": 4, fneg: -1, fstr: "9", fbig: 1e9 } };
  assert.deepEqual(migrate(raw).frames, { fabc: 3, fq: 1, fbig: 100000 });
  assert.deepEqual(migrate({ xp: 1 }).frames, {}, "a state saved before the tally existed");
  /* two devices each met sentences since they last agreed: the counts add */
  const base = { ...blankState(), frames: { fa: 2 } };
  const local = { ...base, frames: { fa: 3, fb: 1 } };
  const remote = { ...base, frames: { fa: 4, fc: 2 } };
  assert.deepEqual(mergeStates(base, local, remote).frames, { fa: 5, fb: 1, fc: 2 });
  /* the server keeps what the browser keeps, and no more than FRAMES_MAX keys */
  const many = {};
  for (let k = 0; k < FRAMES_MAX + 50; k++) many["f" + k.toString(36)] = 1;
  const clean = cleanState({ ...blankState(), frames: { ...many, "<script>": 1 } });
  assert.equal(Object.keys(clean.frames).length, FRAMES_MAX);
  assert.ok(!("<script>" in clean.frames));
});
