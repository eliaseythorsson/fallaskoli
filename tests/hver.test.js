/* Issue 27: „Hver gerði hvað?“ — who did what to whom, on passives and
   relative clauses (tasks/setningafraedi.js `whoDid`, ui/hver.js,
   pipeline/who_did.py).

   What is held here.

   - The data: every item the build let in says the same thing three ways —
     the key (`who`, `whom`), the options, and the plain sentence — and in a
     passive the answer to "who did it" is NOT the word the sentence bank's
     roles call frumlag. That is the whole point of the type, so it is
     asserted on the data, not assumed.
   - The check: pipeline/who_did.py works the gerandi and the þolandi out of a
     parse and refuses a key that says otherwise. Its rules are run here on
     trees written out by hand (Python's standard library only, as CI's unit
     job has no Greynir), and — where Greynir is installed — on real parses.
   - The builder: one structure at a time by þyngd, the structure hint by the
     rule of every Setningafræði question (core/hint.js), a review asking for
     the structure that was missed.
   - The judge and the renderer's sentence. */

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DATA } from "../data/data_bundle.js";
import { EX } from "../data/exercises.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, newSession } from "../src/js/core/state.js";
import { SKILL_IDS } from "../src/js/core/skills.js";
import { createPolicy } from "../src/js/core/policy.js";
import { seeded } from "../src/js/core/duel.js";
import { judge, settle } from "../src/js/core/answer.js";
import { sentenceStructure } from "../src/js/core/structure.js";
import { hintStep, hintMarks } from "../src/js/core/hint.js";
import { CATALOGUE_IDS } from "../src/js/core/catalogue.js";
import { exampleFor } from "../src/js/core/examples.js";
import { typeById, makeView, reviewTask } from "../src/js/tasks/index.js";
import { whoDid, WHO_NOT_SAID } from "../src/js/tasks/setningafraedi.js";
import { RENDER } from "../src/js/ui/render.js";
import { hverSentenceHTML } from "../src/js/ui/hver.js";
import { parseTsv } from "../tools/review.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const lex = buildLexicon(DATA);
const D0 = "2026-11-16";
const allOn = {};
SKILL_IDS.forEach((id) => { allOn[id] = true; });
const POLICY = createPolicy(null, { skills: allOn, types: {}, levels: {}, attrs: {}, safeVocab: null });

function pupil(band) {
  const S = blankState();
  SKILL_IDS.forEach((id) => { S.enabled[id] = true; });
  const sess = newSession(S);
  Object.keys(sess.diff).forEach((k) => { sess.diff[k] = band; });
  return { S, sess };
}
const viewAt = (band, extra = {}) => makeView({ ...pupil(band), policy: POLICY, today: D0, ...extra });
const builds = (band, n = 400, extra = {}) => {
  const out = [];
  for (let k = 0; k < n; k++) out.push(whoDid(lex, viewAt(band, extra), seeded(7000 + k)).task);
  return out;
};

/* ========================================================================
 * The data
 * ====================================================================== */

test("the type is the last of the catalogue, in Setningafræði, drawn by its own renderer", () => {
  /* Appended, never inserted: the order is the duel order. (Other types may
     be appended after it; it must stay after everything that was there.) */
  assert.ok(CATALOGUE_IDS.indexOf("hver_gerdi") > CATALOGUE_IDS.indexOf("raeda"));
  assert.ok(CATALOGUE_IDS.indexOf("hver_gerdi") > CATALOGUE_IDS.indexOf("ob_skilja"));
  const t = typeById("hver_gerdi");
  assert.equal(t.skill, "setningafraedi");
  assert.equal(t.renderer, "hver");
  assert.equal(typeof RENDER.hver, "function");
  assert.deepEqual(t.bands, [1, 3, 5, 6]);
  assert.equal(t.grader, "app");
  assert.equal(t.recall, false);
});

test("the file: an Icelandic header, and every line of it is a fact of an item in the data", () => {
  const text = readFileSync(root + "content/setningafraedi/hver-gerdi-hvad.tsv", "utf8");
  assert.match(text, /^# Setningafræði: Hver gerði hvað\?/);
  assert.match(text, /^# Dálkar:/m);
  assert.match(text, /er HAFNAÐ ef greiningin segir annað/);
  const { header, rows } = parseTsv(text);
  assert.deepEqual(header, ["þyngd", "gerð", "setning", "sögn", "gerandi", "þolandi", "athugasemd"]);
  const facts = EX.hver.flatMap((it) => it.f.map((f) => [it, f]));
  assert.equal(rows.length, facts.length);
  for (const r of rows) {
    const [lvl, kind, sentence, verb, who, whom] = header.map((h) => r.cells[h]);
    const hit = facts.find(([it, f]) => it.s.t === sentence && f.l === verb);
    assert.ok(hit, `${sentence} / ${verb} is not in the data`);
    const [it, f] = hit;
    assert.equal(it.lvl, +lvl);
    assert.equal(it.k, kind);
    assert.equal(f.who == null ? "(ekki sagt)" : it.s.tok[f.who].w, who, sentence);
    assert.equal(f.whom == null ? "(enginn)" : it.s.tok[f.whom].w, whom, sentence);
  }
});

test("one structure at a time: passives at 1, relative clauses at 3 and 5", () => {
  assert.ok(EX.hver.length >= 30, EX.hver.length);
  for (const it of EX.hver) {
    assert.ok(["þolmynd", "tilvísun"].includes(it.k), it.s.t);
    assert.ok(it.k === "þolmynd" ? it.lvl === 1 : [3, 5].includes(it.lvl), it.s.t);
    if (it.k === "þolmynd") assert.ok(it.f.length === 1 && it.f[0].pas && !it.f[0].rel, it.s.t);
    else assert.ok(it.f.some((f) => f.rel), it.s.t);
    /* short: these are for reading closely, not for length */
    assert.ok(it.s.t.split(" ").length <= 8, it.s.t);
  }
  const n = (lvl) => EX.hver.filter((it) => it.lvl === lvl).length;
  assert.ok(n(1) >= 15 && n(3) >= 6 && n(5) >= 6, [n(1), n(3), n(5)].join(" "));
  /* both kinds of passive: the gerandi after af, and not said */
  const passives = EX.hver.filter((it) => it.k === "þolmynd");
  assert.ok(passives.filter((it) => it.f[0].who != null).length >= 8);
  assert.ok(passives.filter((it) => it.f[0].who == null).length >= 8);
});

test("IN A PASSIVE THE GERANDI IS NOT THE FRUMLAG: the key is semantic, the roles grammatical", () => {
  let passives = 0;
  for (const it of EX.hver) {
    for (const f of it.f.filter((x) => x.pas)) {
      passives++;
      const tok = it.s.tok;
      assert.equal(tok[f.aux].l, "vera", it.s.t);
      assert.equal(tok[f.v].m, "LHÞT", it.s.t);
      /* who it was done to is the grammatical subject … */
      if (!f.rel) assert.equal(tok[f.whom].r, "frumlag", it.s.t);
      assert.ok(tok[f.whom].m.startsWith("NF"), it.s.t);
      /* … and who did it is not: it stands after *af*, in the dative, or is not said */
      if (f.who != null) {
        assert.notEqual(tok[f.who].r, "frumlag", it.s.t);
        assert.equal(tok[f.who - 1].w, "af", it.s.t);
        assert.ok(tok[f.who].m.startsWith("ÞGF"), it.s.t);
        assert.notEqual(f.who, f.whom);
      } else {
        assert.ok(!tok.some((t) => t.w === "af"), `${it.s.t}: an af phrase and no gerandi`);
        assert.match(f.p, /^Einhver /, it.s.t);
      }
    }
  }
  assert.ok(passives >= 20, passives);
  /* the example every reviewer will try first */
  const dog = EX.hver.find((it) => it.s.t === "Hundurinn var bitinn af kettinum.");
  const f = dog.f[0];
  assert.equal(dog.s.tok[f.who].w, "kettinum");
  assert.equal(dog.s.tok[f.whom].w, "Hundurinn");
  assert.deepEqual([f.qa, f.qp, f.p], ["Hver beit?", "Hver var bitinn?", "Kötturinn beit hundinn."]);
  assert.deepEqual(dog.n.map((x) => x.nf), ["Hundurinn", "Kötturinn"]);
});

test("in the active the gerandi is a nominative and the þolandi an accusative or the gap of the relative clause", () => {
  for (const it of EX.hver) {
    for (const f of it.f.filter((x) => !x.pas)) {
      const tok = it.s.tok;
      assert.ok(f.who != null, it.s.t);
      const inClause = (j) => f.rel && j >= f.rel[0] && j <= f.rel[1];
      /* a gerandi inside its own clause is that clause's nominative subject;
         outside it, it is the noun the relative clause stands with */
      if (!f.rel || inClause(f.who)) assert.ok(tok[f.who].m.startsWith("NF"), it.s.t);
      else assert.equal(f.who, f.rel[0] - 1, it.s.t);
      if (f.whom == null) { assert.equal(f.qp, undefined); continue; }
      if (!f.rel || inClause(f.whom)) assert.ok(tok[f.whom].m.startsWith("ÞF"), it.s.t);
      else {
        /* *Strákurinn [sem hundurinn elti]*: the clause has its own subject */
        assert.equal(f.whom, f.rel[0] - 1, it.s.t);
        assert.ok(inClause(f.who), it.s.t);
      }
      assert.notEqual(f.who, f.whom);
    }
    for (const f of it.f.filter((x) => x.rel)) assert.equal(it.s.tok[f.rel[0]].w, "sem", it.s.t);
  }
});

test("the questions and the plain sentence are made of the sentence's own words", () => {
  for (const it of EX.hver) {
    const names = it.n.map((x) => x.nf);
    assert.equal(new Set(names).size, names.length, it.s.t);
    for (const x of it.n) assert.match(x.nf, /^\p{Lu}/u);
    for (const f of it.f) {
      assert.match(f.qa, /^Hver \p{Ll}+\?$/u, it.s.t);
      if (f.qp) assert.match(f.qp, /^Hver var \p{Ll}+\?$/u, it.s.t);
      /* an active verb is asked about in the form it has in the sentence */
      if (!f.pas) assert.equal(f.qa, `Hver ${it.s.tok[f.v].w}?`, it.s.t);
      /* the plain sentence: gerandi (or Einhver), the verb of the question, þolandi */
      const who = f.who == null ? "Einhver" : it.n.find((x) => x.j === f.who).nf;
      const verb = f.qa.slice(5, -1);
      assert.ok(f.p.startsWith(`${who} ${verb}`), `${it.s.t}: ${f.p}`);
      assert.ok(f.p.endsWith("."), f.p);
      assert.equal(f.p.split(" ").length, f.whom == null ? 2 : 3, f.p);
      for (const j of [f.who, f.whom]) if (j != null) assert.ok(it.n.some((x) => x.j === j), it.s.t);
    }
  }
});

test("every sentence can be drawn with its structure, and a relative clause gets its box", () => {
  for (const it of EX.hver) {
    const st = sentenceStructure(it.s);
    assert.ok(st.parts.length > 0, it.s.t);
    assert.ok(st.parts.some((p) => p.role === "frumlag"), it.s.t);
    assert.ok(st.parts.some((p) => p.role === "umsögn"), it.s.t);
    for (const f of it.f.filter((x) => x.rel)) {
      assert.ok(st.clauses.some((c) => c.kind === "tilvísunarsetning" && c.a === f.rel[0] && c.b === f.rel[1]),
        `${it.s.t}: no box round the relative clause`);
    }
    for (const f of it.f.filter((x) => x.pas && x.who != null)) {
      assert.ok(st.parts.some((p) => p.role === "forsetningarliður" && p.a === f.who - 1 && p.b === f.who), it.s.t);
    }
  }
});

/* ========================================================================
 * The check, on trees written out by hand (no Greynir)
 * ====================================================================== */

const py = ["python3", "python"].find((p) => spawnSync(p, ["-c", "import sys; sys.exit(sys.version_info < (3, 8))"],
  { cwd: root }).status === 0);
const runPy = (code) => spawnSync(py, ["-c", "import sys; sys.path.insert(0, 'pipeline')\n" + code],
  { cwd: root, encoding: "utf8", env: { ...process.env, PYTHONHASHSEED: "0", PYTHONDONTWRITEBYTECODE: "1" } });

/* The trees are the ones Greynir gives these sentences (recorded while the
   items were written), as who_did.plain turns them into tuples. */
const HAND = `
import json, who_did as W
def T(w, l, cat, v, m): return {"w": w, "l": l, "cat": cat, "v": set(v.split()), "m": m}
acc = lambda lemma: lemma in ("bíta", "elta", "handtaka", "taka")
out = {}
def run(name, tree, terms, verb, who, whom):
    try:
        c = W.check(tree, terms, acc, verb, who, whom)
        out[name] = {"ok": True, "who": c["who"], "whom": c["whom"], "passive": c["passive"], "rel": c["rel"]}
    except W.Refused as e:
        out[name] = {"ok": False, "why": str(e)}

# Hundurinn var bitinn af kettinum .
passive = ("S0", [("S-MAIN", [("IP", [("NP-SUBJ", [0]), ("VP", [("VP-AUX", [1]), ("VP", [2]),
           ("PP", [("P", [3]), ("NP", [4])])])])]), 5])
pt = [T("Hundurinn", "hundur", "no", "et nf kk gr", "NFETgr"), T("var", "vera", "so", "et p3", "GM-FH-ÞT-3P-ET"),
      T("bitinn", "bíta", "so", "lhþt sb nf et kk", "LHÞT"), T("af", "af", "fs", "þgf", None),
      T("kettinum", "köttur", "no", "et þgf kk gr", "ÞGFETgr"), T(".", ".", "", "", None)]
run("passive", passive, pt, "bíta", "kettinum", "Hundurinn")
# the mistake the type is about: the frumlag written down as the gerandi
run("passive, frumlag as gerandi", passive, pt, "bíta", "Hundurinn", "kettinum")
run("passive, af phrase but key says not said", passive, pt, "bíta", W.NOT_SAID, "Hundurinn")
run("passive, no þolandi", passive, pt, "bíta", "kettinum", W.NO_ONE)
run("a verb that is not there", passive, pt, "elta", "kettinum", "Hundurinn")
run("a word that is not there", passive, pt, "bíta", "kötturinn", "Hundurinn")

# Þjófurinn var handtekinn í gær .
agentless = ("S0", [("S-MAIN", [("IP", [("NP-SUBJ", [0]), ("VP", [("VP-AUX", [1]), ("VP", [2]),
             ("ADVP-DATE-REL", [3])])])]), 4])
at = [T("Þjófurinn", "þjófur", "no", "et nf kk gr", "NFETgr"), T("var", "vera", "so", "et p3", "GM-FH-ÞT-3P-ET"),
      T("handtekinn", "handtaka", "so", "lhþt sb nf et kk", "LHÞT"), T("í gær", "í gær", "ao", "", None),
      T(".", ".", "", "", None)]
run("agentless", agentless, at, "handtaka", W.NOT_SAID, "Þjófurinn")
run("agentless, frumlag as gerandi", agentless, at, "handtaka", "Þjófurinn", W.NO_ONE)

# Myndin var tekin af stráknum .  — an af phrase that is no gerandi: the key
# says "not said", the rule says stráknum, and the item is refused either way
photo = passive
ph = [T("Myndin", "mynd", "no", "et nf kvk gr", "NFETgr"), T("var", "vera", "so", "et p3", "GM-FH-ÞT-3P-ET"),
      T("tekin", "taka", "so", "lhþt sb nf et kvk", "LHÞT"), T("af", "af", "fs", "þgf", None),
      T("stráknum", "strákur", "no", "et þgf kk gr", "ÞGFETgr"), T(".", ".", "", "", None)]
run("ambiguous af", photo, ph, "taka", W.NOT_SAID, "Myndin")

# Stráknum var hjálpað af kennaranum .  — a dative passive is not this passive
dt = [T("Stráknum", "strákur", "no", "et þgf kk gr", "ÞGFETgr"), T("var", "vera", "so", "et p3", "GM-FH-ÞT-3P-ET"),
      T("hjálpað", "hjálpa", "so", "lhþt sb nf et hk", "LHÞT"), T("af", "af", "fs", "þgf", None),
      T("kennaranum", "kennari", "no", "et þgf kk gr", "ÞGFETgr"), T(".", ".", "", "", None)]
run("dative passive", passive, dt, "hjálpa", "kennaranum", "Stráknum")

# Strákurinn sem elti hundinn datt .   (sem = the doer)
sr = ("S0", [("S-MAIN", [("IP", [("NP-SUBJ", [0, ("CP-REL", [("C", [1]), ("IP", [("VP", [("VP", [2]),
      ("NP-OBJ", [3])])])])]), ("VP", [4])])]), 5])
st = [T("Strákurinn", "strákur", "no", "et nf kk gr", "NFETgr"), T("sem", "sem", "stt", "", None),
      T("elti", "elta", "so", "1 þf et p3", "GM-FH-ÞT-3P-ET"), T("hundinn", "hundur", "no", "et þf kk gr", "ÞFETgr"),
      T("datt", "detta", "so", "0 et p3", "GM-FH-ÞT-3P-ET"), T(".", ".", "", "", None)]
run("sem is the doer", sr, st, "elta", "Strákurinn", "hundinn")
run("sem is the doer, swapped", sr, st, "elta", "hundinn", "Strákurinn")
run("main verb", sr, st, "detta", "Strákurinn", W.NO_ONE)
# the nearest noun is not the one that fell
run("main verb, nearest noun", sr, st, "detta", "hundinn", W.NO_ONE)

# Strákurinn sem hundurinn elti datt .   (sem = the one it is done to)
orel = ("S0", [("S-MAIN", [("IP", [("NP-SUBJ", [0, ("CP-REL", [("C", [1]), ("IP", [("NP-SUBJ", [2]),
        ("VP", [3])])])]), ("VP", [4])])]), 5])
ot = [T("Strákurinn", "strákur", "no", "et nf kk gr", "NFETgr"), T("sem", "sem", "stt", "", None),
      T("hundurinn", "hundur", "no", "et nf kk gr", "NFETgr"), T("elti", "elta", "so", "0 et p3", "GM-FH-ÞT-3P-ET"),
      T("datt", "detta", "so", "0 et p3", "GM-FH-ÞT-3P-ET"), T(".", ".", "", "", None)]
run("sem is the þolandi", orel, ot, "elta", "hundurinn", "Strákurinn")
run("sem is the þolandi, swapped", orel, ot, "elta", "Strákurinn", "hundurinn")
run("sem is the þolandi, main verb", orel, ot, "detta", "Strákurinn", W.NO_ONE)
# the same tree with a verb the parser does not know with an accusative: the
# gap may be anything (*dagurinn sem strákurinn datt*), so nothing is claimed
ot2 = [dict(t) for t in ot]; ot2[3] = T("svaf", "sofa", "so", "0 et p3", "GM-FH-ÞT-3P-ET")
run("gap of an intransitive verb", orel, ot2, "sofa", "hundurinn", "Strákurinn")
run("gap of an intransitive verb, no þolandi", orel, ot2, "sofa", "hundurinn", W.NO_ONE)

# present tense, a plural, an adjective in the noun phrase: not covered yet
pres = [dict(t) for t in pt]; pres[1] = T("er", "vera", "so", "et p3", "GM-FH-NT-3P-ET")
run("present tense", passive, pres, "bíta", "kettinum", "Hundurinn")
plur = [dict(t) for t in pt]; plur[4] = T("köttunum", "köttur", "no", "ft þgf kk gr", "ÞGFFTgr")
run("plural gerandi", passive, plur, "bíta", "köttunum", "Hundurinn")
adj = ("S0", [("S-MAIN", [("IP", [("NP-SUBJ", [0, 1]), ("VP", [("VP-AUX", [2]), ("VP", [3])])])]), 4])
aj = [T("Litli", "lítill", "lo", "et nf kk vb", "FVB-KK-NFET"), T("hundurinn", "hundur", "no", "et nf kk gr", "NFETgr"),
      T("var", "vera", "so", "et p3", "GM-FH-ÞT-3P-ET"), T("bitinn", "bíta", "so", "lhþt sb nf et kk", "LHÞT"),
      T(".", ".", "", "", None)]
run("two words in the noun phrase", adj, aj, "bíta", W.NOT_SAID, "hundurinn")
print(json.dumps(out, ensure_ascii=False))
`;

test("who_did.py: the gerandi and the þolandi out of the parse; a key that says otherwise is refused",
  { skip: py ? false : "no Python 3" }, () => {
    const r = runPy(HAND);
    assert.equal(r.status, 0, r.stderr);
    const got = JSON.parse(r.stdout);
    const ok = (name, who, whom, extra = {}) => {
      assert.ok(got[name].ok, `${name}: ${got[name].why}`);
      assert.deepEqual([got[name].who, got[name].whom], [who, whom], name);
      for (const [k, v] of Object.entries(extra)) assert.deepEqual(got[name][k], v, `${name}.${k}`);
    };
    const refused = (name, why) => {
      assert.equal(got[name].ok, false, `${name} was let in`);
      assert.match(got[name].why, why, name);
    };
    /* the passive: the gerandi is the noun after af (4), the þolandi the subject (0) */
    ok("passive", 4, 0, { passive: true, rel: null });
    refused("passive, frumlag as gerandi", /gerandinn er „kettinum“ samkvæmt greiningunni, en „Hundurinn“ í skránni/);
    refused("passive, af phrase but key says not said", /gerandinn er „kettinum“ samkvæmt greiningunni, en \(ekki sagt\) í skránni/);
    refused("passive, no þolandi", /\(enginn\) á ekki við um þolmynd/);
    refused("a verb that is not there", /sögnin „elta“ er ekki umsögn neinnar setningar/);
    refused("a word that is not there", /gerandinn „kötturinn“ stendur ekki í setningunni/);
    ok("agentless", null, 0, { passive: true });
    refused("agentless, frumlag as gerandi", /\(enginn\) á ekki við um þolmynd/);
    refused("ambiguous af", /gerandinn er „stráknum“ samkvæmt greiningunni, en \(ekki sagt\) í skránni/);
    refused("dative passive", /ekki í nefnifalli/);
    /* relative clauses */
    ok("sem is the doer", 0, 3, { passive: false, rel: [1, 3] });
    refused("sem is the doer, swapped", /gerandinn er „Strákurinn“ samkvæmt greiningunni, en „hundinn“ í skránni/);
    ok("main verb", 0, null, { rel: null });
    refused("main verb, nearest noun", /gerandinn er „Strákurinn“ samkvæmt greiningunni, en „hundinn“ í skránni/);
    ok("sem is the þolandi", 2, 0, { rel: [1, 3] });
    refused("sem is the þolandi, swapped", /gerandinn er „hundurinn“ samkvæmt greiningunni, en „Strákurinn“ í skránni/);
    ok("sem is the þolandi, main verb", 0, null);
    refused("gap of an intransitive verb", /þáttarinn þekkir ekki „sofa“ með andlagi í þolfalli/);
    refused("gap of an intransitive verb, no þolandi", /þáttarinn þekkir ekki „sofa“/);
    /* shapes that are not covered are refused, not guessed at */
    refused("present tense", /ekki í þátíð/);
    refused("plural gerandi", /ekki þágufall eintölu/);
    refused("two words in the noun phrase", /er ekki eitt nafnorð/);
  });

/* Where the grammar libraries are installed (a full ./build.sh; not CI's
   unit job): the same on real parses, the sentences of the file among them. */
const hasGreynir = py && runPy("import reynir, islenska").status === 0;

test("who_did.py on Greynir's own parse: the file's key passes, the naive key is refused",
  { skip: hasGreynir ? false : "Greynir is not installed here (./build.sh runs this check on every item)" }, () => {
    const r = runPy(`
import json, who_did as W
out = {}
def run(name, text, verb, who, whom):
    rec, tree, terms = W.analyse(text)
    try:
        c = W.check(tree, terms, W.takes_acc, verb, who, whom)
        out[name] = [True, None if c["who"] is None else terms[c["who"]]["w"], None if c["whom"] is None else terms[c["whom"]]["w"]]
    except W.Refused as e:
        out[name] = [False, str(e)]
run("key", "Hundurinn var bitinn af kettinum.", "bíta", "kettinum", "Hundurinn")
run("naive", "Hundurinn var bitinn af kettinum.", "bíta", "Hundurinn", "kettinum")
run("agentless", "Þjófurinn var handtekinn í gær.", "handtaka", W.NOT_SAID, "Þjófurinn")
run("agentless naive", "Þjófurinn var handtekinn í gær.", "handtaka", "Þjófurinn", W.NO_ONE)
run("object gap", "Strákurinn sem hundurinn elti datt.", "elta", "hundurinn", "Strákurinn")
run("object gap naive", "Strákurinn sem hundurinn elti datt.", "elta", "Strákurinn", "hundurinn")
run("subject gap", "Strákurinn sem elti hundinn datt.", "elta", "Strákurinn", "hundinn")
run("main", "Strákurinn sem hundurinn elti datt.", "detta", "Strákurinn", W.NO_ONE)
run("main naive", "Strákurinn sem hundurinn elti datt.", "detta", "hundurinn", W.NO_ONE)
run("dative passive", "Stráknum var hjálpað af kennaranum.", "hjálpa", "kennaranum", "Stráknum")
print(json.dumps(out, ensure_ascii=False))`);
    assert.equal(r.status, 0, r.stderr);
    const got = JSON.parse(r.stdout.trim().split("\n").pop());
    assert.deepEqual(got.key, [true, "kettinum", "Hundurinn"]);
    assert.equal(got.naive[0], false);
    assert.deepEqual(got.agentless, [true, null, "Þjófurinn"]);
    assert.equal(got["agentless naive"][0], false);
    assert.deepEqual(got["object gap"], [true, "hundurinn", "Strákurinn"]);
    assert.equal(got["object gap naive"][0], false);
    assert.deepEqual(got["subject gap"], [true, "Strákurinn", "hundinn"]);
    assert.deepEqual(got.main, [true, "Strákurinn", null]);
    assert.equal(got["main naive"][0], false);
    assert.equal(got["dative passive"][0], false);
  });

/* ========================================================================
 * The builder
 * ====================================================================== */

test("builder: the answer is an option, „Það kemur ekki fram“ is always the last one, and the key is the data's", () => {
  for (const band of [1, 2, 3, 4, 5, 6, 7]) {
    for (const t of builds(band, 250)) {
      assert.equal(t.type, "hver");
      assert.equal(t.skill, "setningafraedi");
      assert.ok(t.options.includes(t.answer), t.s.t);
      assert.equal(t.options[t.options.length - 1], WHO_NOT_SAID);
      assert.ok(t.options.length >= 2 && t.options.length <= 4, t.s.t);
      const it = EX.hver.find((x) => x.s === t.s);
      const f = it.f.find((x) => (x.pas ? x.aux : x.v) === t.verb[0]);
      assert.equal(t.question, t.ask === "who" ? f.qa : f.qp);
      const j = t.ask === "who" ? f.who : f.whom;
      assert.equal(t.answer, j == null ? WHO_NOT_SAID : it.n.find((x) => x.j === j).nf, t.s.t);
      assert.equal(t.cell, "hver:" + it.k);
      assert.equal(t.lvl, it.lvl);
      /* the explanation ends in a plain sentence: the fact, or the main clause on its own */
      assert.ok(t.why.includes(f.p) || /stendur aðalsetningin eftir: \*[^*]+\.\*$/.test(t.why), t.why);
    }
  }
});

test("builder: one structure at a time — passives, then sem as the doer, then sem as the one it is done to", () => {
  const levels = (band) => new Set(builds(band, 300).map((t) => t.lvl));
  assert.deepEqual([...levels(1)].sort(), [1]);
  assert.deepEqual([...levels(2)].sort(), [1]);
  assert.deepEqual([...levels(3)].sort(), [1, 3]);
  assert.deepEqual([...levels(4)].sort(), [1, 3]);
  assert.deepEqual([...levels(5)].sort(), [1, 3, 5]);
  assert.deepEqual([...levels(7)].sort(), [1, 3, 5]);
  /* the newest structure is asked most */
  const share = (band, lvl) => builds(band, 600).filter((t) => t.lvl === lvl).length / 600;
  assert.ok(share(3, 3) > 0.5, share(3, 3));
  assert.ok(share(5, 5) > 0.4, share(5, 5));
  /* at þyngd 1 both questions of a passive come, and "not said" is sometimes right */
  const one = builds(1, 400);
  assert.ok(one.some((t) => t.ask === "who") && one.some((t) => t.ask === "whom"));
  assert.ok(one.some((t) => t.answer === WHO_NOT_SAID));
  assert.ok(new Set(one.map((t) => t.s.t + t.question)).size >= 40);
});

test("builder: the structure hint fades by the rule of every Setningafræði question, and hides nothing", () => {
  /* The registered builder is the one wrapped in `withHint` (issue 26). */
  const spec = typeById("hver_gerdi");
  for (const band of [1, 2, 3, 4, 5, 6, 7]) {
    for (let k = 0; k < 120; k++) {
      const t = spec.build(lex, viewAt(band), seeded(7000 + k)).task;
      const step = hintStep(band);
      assert.equal(t.coding ? t.coding.step : null, step, `þyngd ${band}: ${t.s.t}`);
      if (!t.coding) continue;
      /* Nothing is hidden: the marks are grammar and the question is meaning.
         In a passive the frumlag IS marked — and is not the answer to "who did it". */
      assert.deepEqual(t.coding.hide, []);
      const st = hintMarks(t.s, t.coding);
      assert.ok(st.parts.some((p) => p.role === "frumlag"), t.s.t);
    }
  }
  assert.deepEqual([1, 2, 3, 5, 6, 7].map(hintStep), ["shown", "shown", "offered", "offered", null, null]);
});

test("builder: a review asks for the structure that was missed; another cell is not its business", () => {
  for (const cell of ["hver:þolmynd", "hver:tilvísun"]) {
    for (const band of [1, 3, 5]) {
      for (let i = 0; i < 10; i++) {
        const b = whoDid(lex, viewAt(band, { force: { cell } }), seeded(i));
        assert.ok(b, `${cell} at þyngd ${band}`);
        assert.equal(b.task.cell, cell);
      }
    }
  }
  assert.equal(whoDid(lex, viewAt(3, { force: { cell: "setn:frumlag" } }), seeded(1)), null);
  /* and the whole path: a miss is queued and comes back as the same structure */
  const p = pupil(4);
  const v = makeView({ S: p.S, sess: p.sess, policy: POLICY, today: D0 });
  const t = typeById("hver_gerdi").build(lex, v, seeded(3)).task;
  t.typeId = "hver_gerdi";
  const j = judge(t, { picked: t.options.find((o) => o !== t.answer) }, p);
  assert.equal(j.ok, false);
  settle(p.S, p.sess, t, j);
  const e = p.S.review.items.find((x) => x.t === "hver_gerdi");
  assert.ok(e, "nothing queued");
  const later = makeView({ S: p.S, sess: newSession(p.S), policy: POLICY, today: "2026-11-17" });
  const r = reviewTask(lex, later, seeded(9), e);
  assert.ok(r, "the review could not be built");
  assert.equal(r.task.cell, t.cell);
});

test("builder: an item just asked is not asked again straight away", () => {
  const p = pupil(1);
  const seen = [];
  for (let k = 0; k < 30; k++) {
    const b = whoDid(lex, makeView({ ...p, policy: POLICY, today: D0 }), seeded(100 + k));
    const key = b.effects.find((e) => e.op === "exSeen").key;
    assert.ok(!seen.includes(key), `${key} twice in thirty`);
    seen.push(key);
    (p.sess.exSeen ||= []).push(key);
  }
});

test("the explanation: þolmynd names the þolandi and the af phrase; a relative clause is taken out", () => {
  const all = [1, 3, 5].flatMap((b) => builds(b, 500));
  const of = (sentence, question) => all.find((t) => t.s.t === sentence && t.question === question);
  const a = of("Hundurinn var bitinn af kettinum.", "Hver beit?");
  assert.equal(a.answer, "Kötturinn");
  assert.equal(a.why, "*var bitinn* er **þolmynd**. Í þolmynd er frumlagið ekki gerandinn heldur **þolandinn**: "
    + "hundurinn varð fyrir því. Gerandinn stendur á eftir *af*: *af kettinum*. Í germynd: *Kötturinn beit hundinn.*");
  const b = of("Þjófurinn var handtekinn í gær.", "Hver handtók?");
  assert.equal(b.answer, WHO_NOT_SAID);
  assert.match(b.why, /Enginn gerandi er nefndur, svo setningin segir ekki hver gerði það\. Í germynd: \*Einhver handtók þjófinn\.\*$/);
  assert.equal(of("Þjófurinn var handtekinn í gær.", "Hver var handtekinn?").answer, "Þjófurinn");
  const c = of("Strákurinn sem hundurinn elti datt.", "Hver elti?");
  assert.equal(c.answer, "Hundurinn");
  assert.equal(c.why, "*sem hundurinn elti* er **tilvísunarsetning**: hún segir meira um orðið *Strákurinn*, "
    + "og *sem* vísar til þess. Hún segir því: *Hundurinn elti strákinn.*");
  assert.equal(of("Strákurinn sem hundurinn elti datt.", "Hver var eltur?").answer, "Strákurinn");
  const d = of("Strákurinn sem hundurinn elti datt.", "Hver datt?");
  assert.equal(d.answer, "Strákurinn");
  assert.equal(d.why, "*sem hundurinn elti* er **tilvísunarsetning** um orðið *Strákurinn*. "
    + "Taktu hana út og þá stendur aðalsetningin eftir: *Strákurinn datt.*");
  assert.match(of("Kötturinn sem hundurinn beit hljóp burt.", "Hver hljóp?").why, /eftir: \*Kötturinn hljóp burt\.\*$/);
  assert.match(of("Konan sótti strákinn sem datt.", "Hver sótti?").why,
    /^\*sem datt\* er \*\*tilvísunarsetning\*\* um orðið \*strákinn\*.*eftir: \*Konan sótti strákinn\.\*$/);
  const e = of("Hundurinn sem var bitinn af kettinum hljóp burt.", "Hver beit?");
  assert.equal(e.answer, "Kötturinn");
  assert.match(e.why, /^\*sem var bitinn af kettinum\* er \*\*tilvísunarsetning\*\*.*\*var bitinn\* er \*\*þolmynd\*\*/);
  const g = of("Konan sótti strákinn sem datt.", "Hver datt?");
  assert.equal(g.answer, "Strákurinn");
  assert.match(g.why, /segir meira um orðið \*strákinn\*/);
});

/* ========================================================================
 * The judge and the sentence on the card
 * ====================================================================== */

test("judge: one pick; nothing picked is not an answer; the hint halves the XP and is no error", () => {
  const t = builds(4, 1)[0];
  assert.equal(judge(t, {}).pending, true);
  const right = judge(t, { picked: t.answer });
  assert.equal(right.ok, true);
  const wrong = judge(t, { picked: t.options.find((o) => o !== t.answer) });
  assert.equal(wrong.ok, false);
  assert.equal(wrong.xp, 0);
  assert.deepEqual(wrong.findings, []);
  const hinted = judge(t, { picked: t.answer, hinted: true });
  assert.equal(hinted.ok, true);
  assert.ok(hinted.xp > 0 && hinted.xp < right.xp, `${hinted.xp} against ${right.xp}`);
  /* recorded under the structure, in Setningafræði */
  const p = pupil(1);
  const j = judge(t, { picked: t.answer }, p);
  settle(p.S, p.sess, t, j);
  assert.ok(p.S.skills.setningafraedi.xp > 0);
});

test("the card: the verb asked about in bold; the structure only when it is shown", () => {
  const at = (band, sentence) => {
    for (let k = 0; k < 900; k++) {
      const t = typeById("hver_gerdi").build(lex, viewAt(band), seeded(7000 + k)).task;
      if (t.s.t === sentence) return t;
    }
    return null;
  };
  const dog = "Hundurinn var bitinn af kettinum.";
  /* þyngd 6: no hint, the sentence plain */
  const bare = at(6, dog);
  assert.deepEqual(hverSentenceHTML(bare), { coded: false, html: "Hundurinn <b>var</b> <b>bitinn</b> af kettinum." });
  /* þyngd 4: plain until the hint is taken */
  const offered = at(4, dog);
  assert.equal(hverSentenceHTML(offered).coded, false);
  assert.equal(hverSentenceHTML({ ...offered, hinted: true }).coded, true);
  /* after the answer the structure is drawn at every þyngd */
  assert.equal(hverSentenceHTML({ ...bare, done: true }).coded, true);
  /* þyngd 1: shown from the start */
  const t = at(1, dog);
  const shown = hverSentenceHTML(t);
  assert.equal(shown.coded, true);
  const coded = shown.html;
  assert.match(coded, /class="sc sc-frumlag"><span class="sc-w">Hundurinn<\/span><span class="sc-name">frumlag</);
  assert.match(coded, /class="sc sc-forsetningarlidur"><span class="sc-w">af kettinum</);
  assert.match(coded, /<b>bitinn<\/b>/);
  /* the same words in the same order, marks or no marks */
  const words = (html) => html.replace(/<span class="sc-c?name">[^<]*<\/span>/g, "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
  assert.equal(words(coded), "Hundurinn var bitinn af kettinum.");
  const rel = at(5, "Strákurinn sem hundurinn elti datt.");
  assert.match(hverSentenceHTML({ ...rel, hinted: true }).html, /class="sc-clause"><span class="sc-cname">tilvísunarsetning</);
});

test("the worked example on the first card: the passive, and a relative clause for a pupil who meets that first", () => {
  assert.equal(exampleFor("hver_gerdi").a, "Kötturinn");
  assert.match(exampleFor("hver_gerdi").how, /þolmynd/);
  assert.equal(exampleFor("hver_gerdi", "þolmynd").a, "Kötturinn");
  assert.equal(exampleFor("hver_gerdi", "tilvísun").a, "Strákurinn");
});
