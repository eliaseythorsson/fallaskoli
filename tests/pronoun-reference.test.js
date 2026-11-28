/* Issue #33: pronoun reference across sentences — "Til hvers vísar
   fornafnið?" (docs/DLD-PLAN.md §4).

   These tests hold:
   - the build (pipeline/pronoun_options.py) finds the other words a pronoun
     could point at: the text's characters of its gender and number (`same`),
     nouns of another (`other`) — never the referent, another mention of it,
     the noun the pronoun belongs to (*eiganda hans*), nor a noun that is no
     character (*hópum*);
   - les_visun takes its answer from the mark of the file, and its other
     options by the text's þyngd: from SAME_FROM only words that agree with
     the pronoun, below it only words that do not;
   - a reference with no option of the kind its þyngd asks for is not asked;
   - only the options can be tapped; the pronoun is marked;
   - it is declared at the end of the catalogue, with its node, pattern,
     lesson and worked example, and a review brings back the item it names. */

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { EX } from "../data/exercises.js";
import { judge } from "../src/js/core/answer.js";
import { catalogueEntry, CATALOGUE_IDS } from "../src/js/core/catalogue.js";
import { nodeById } from "../src/js/core/curriculum.js";
import { patternById } from "../src/js/core/diagnosis.js";
import { typeById } from "../src/js/tasks/index.js";
import { SAME_FROM } from "../src/js/tasks/lesskilningur.js";
import { freshView, poolLex, buildFresh } from "./pools.js";
import { EXAMPLES } from "../src/js/content/examples.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const lex = poolLex();
const spanWords = (tx, [k, a, b]) => tx.s[k].tok.slice(a, b + 1).map((t) => t.w).join(" ");

/* ---------- the build: the other words ------------------------------------- */

const py = ["python3", "python"].find((p) => spawnSync(p, ["-c", "import sys; sys.exit(sys.version_info < (3, 8))"],
  { cwd: root }).status === 0);
const runPy = (code) => spawnSync(py, ["-c", "import sys; sys.path.insert(0, 'pipeline')\n" + code], { cwd: root, encoding: "utf8",
  env: { ...process.env, PYTHONHASHSEED: "0", PYTHONDONTWRITEBYTECODE: "1" } });

test("pronoun_options: characters of the pronoun's gender and number, nouns of another", { skip: py ? false : "no Python 3" }, () => {
  const r = runPy(`
import json, pronoun_options as PO
BIN = {
  "Jón": [("Jón", "kk", "NFET")], "Páll": [("Páll", "kk", "NFET")], "Pál": [("Páll", "kk", "ÞFET")],
  "Sara": [("Sara", "kvk", "NFET")], "hund": [("hundur", "kk", "ÞFET")], "hundinn": [("hundur", "kk", "ÞFETgr")],
  "eiganda": [("eigandi", "kk", "ÞGFET")], "búðina": [("búð", "kvk", "ÞFETgr")], "kulda": [("kuldi", "kk", "ÞGFET")],
  "hópum": [("hópur", "kk", "ÞGFFT")],
}
lookup = lambda w: BIN.get(w, [])
N = lambda w, l, m=None, x="no": {"w": w, "l": l, "c": "nafnorð", "m": m, "x": x}
P = lambda w, l, m: {"w": w, "l": l, "c": "fornafn", "m": m}
W = lambda w: {"w": w, "l": w, "c": "x", "m": None}
sents = [
  [N("Jón", "Jón", None, "person"), W("og"), N("Sara", "Sara", None, "person"), W("sáu"), N("hund", "hundur", "ÞFET"),
   W("við"), N("búðina", "búð", "ÞFETgr"), W("í"), N("kulda", "kuldi", "ÞGFET"), W(".")],
  [W("Páll"), W("kom")],
  [P("Þau", "það", "HK-NFFT"), W("hittu"), N("Pál", "Páll", "ÞFET", "person"), W("og"), W("vildu"), W("finna"),
   N("eiganda", "eigandi", "ÞGFET"), P("hans", "hann", "KK-EFET"), W(".")],
  [W("Þeir"), W("komu"), W("í"), N("hópum", "hópur", "ÞGFFT"), P("þeir", "hann", "KK-NFFT")],
  [N("hundinn", "hundur", "ÞFETgr"), P("hann", "hann", "KK-NFET")],
]
marked = [[0, 0, 2], [0, 4, 4], [0, 0, 0]]
w = lambda sp: " ".join(t["w"] for t in sents[sp[0]][sp[1]:sp[2] + 1])
out = {}
for name, si, ref in [("þau", 2, {"i": 0, "to": [0, 0, 2]}), ("hans", 2, {"i": 7, "to": [0, 4, 4]}),
                      ("hann", 4, {"i": 1, "to": [0, 0, 0]})]:
    same, other = PO.options(lookup, sents, si, ref, marked)
    out[name] = [[w(x) for x in same], [w(x) for x in other]]
print(json.dumps(out, ensure_ascii=False))`);
  assert.equal(r.status, 0, r.stderr);
  const got = JSON.parse(r.stdout);
  /* þau{Jón og Sara}: no other plural; Jón, Sara alone are the referent's own words */
  assert.deepEqual(got["þau"], [[], ["kulda", "búðina", "hund"]]);
  /* hans{hund}: Pál and Jón are characters of its gender (Pál a name);
     eiganda is the word hans belongs to; kulda agrees but is no character */
  assert.deepEqual(got.hans, [["Pál", "Jón"], ["búðina", "Sara", "Jón og Sara"]]);
  /* hann{Jón}: hundinn is the word right before it, so the other mention
     of the dog (hund) stands; hópum is plural; eiganda and kulda agree
     but are no characters */
  assert.deepEqual(got.hann, [["Pál", "hund"], ["hópum", "búðina", "Sara"]]);
});

test("EX.textar: every reference's other words stand before the pronoun, the same ones agree, none is the referent", () => {
  let same = 0;
  for (const tx of EX.textar) tx.s.forEach((s, si) => (s.ref || []).forEach((r) => {
    const pro = s.tok[r.i];
    for (const sp of [...(r.same || []), ...(r.other || [])]) {
      const [k, a, b] = sp;
      assert.ok(k < si || (k === si && b < r.i - 1), `${tx.id}: ${spanWords(tx, sp)} is not before ${pro.w}`);
      assert.notDeepEqual(sp, r.to);
      assert.ok(tx.s[k].tok.slice(a, b + 1).some((t) => t.c === "nafnorð"), `${tx.id}: ${spanWords(tx, sp)}`);
    }
    same += (r.same || []).length;
  }));
  assert.ok(same >= 12, "the texts give the pupil characters to choose between: " + same);
  const swim = EX.textar.find((t) => t.id === "saga-sundferdin");
  const honum = swim.s[2].ref.find((r) => swim.s[2].tok[r.i].w === "honum");
  assert.equal(spanWords(swim, honum.to), "Gunnar");
  assert.deepEqual(honum.same.map((sp) => spanWords(swim, sp)), ["Pétur"]);
});

/* ---------- the type ------------------------------------------------------- */

const built = buildFresh("les_visun", 1, 600);

test("les_visun: the answer is the marked referent; the other options follow the text's þyngd", () => {
  assert.ok(built.length > 100);
  const items = new Set();
  for (const t of built) {
    items.add(t.item);
    const [, id, si, i] = t.item.match(/^les:(.+)\/vis\/(\d+)\.(\d+)$/);
    const tx = EX.textar.find((x) => x.id === id);
    const r = tx.s[+si].ref.find((y) => y.i === +i);
    assert.equal(t.type, "tap");
    assert.deepEqual(t.tags, ["visun"]);
    const tappable = t.s.tok.map((tok, j) => (tok.plain || tok.still ? -1 : j)).filter((j) => j >= 0);
    assert.equal(t.targets.length, 1);
    assert.ok(tappable.includes(t.targets[0]));
    assert.equal(t.s.tok[t.targets[0]].w, spanWords(tx, r.to));
    const marked = t.s.tok.filter((tok) => tok.still);
    assert.deepEqual(marked.map((tok) => tok.w), [tx.s[+si].tok[+i].w], "the pronoun, marked");
    const others = tappable.filter((j) => j !== t.targets[0]).map((j) => t.s.tok[j].w);
    assert.ok(others.length >= 1 && others.length <= 3);
    const pool = (tx.lvl >= SAME_FROM ? r.same : r.other).map((sp) => spanWords(tx, sp));
    for (const o of others) assert.ok(pool.includes(o), `${t.item}: ${o} is not of the ${tx.lvl >= SAME_FROM ? "same" : "other"} kind`);
    /* the text up to the pronoun's sentence, word for word */
    assert.equal(t.s.tok.map((tok) => tok.w).join(" "),
      tx.s.slice(0, +si + 1).map((s) => s.tok.map((x) => x.w).join(" ")).join(" "));
    assert.equal(judge(t, { sel: t.targets }).ok, true);
    for (const j of tappable.filter((j) => j !== t.targets[0])) assert.equal(judge(t, { sel: [j] }).ok, false);
    assert.ok(t.why.includes(spanWords(tx, r.to)));
  }
  /* agreement at þyngd 1, meaning above it */
  assert.ok(items.has("les:saga-straeto/vis/1.0"));
  assert.ok(items.has("les:saga-sundferdin/vis/2.7"), [...items].join(" "));
  assert.ok(items.has("les:saga-nyi-skolinn/vis/5.8"));
  /* Hann{Ari} while Ari is the only boy so far: nothing to choose between */
  assert.ok(!items.has("les:saga-lykillinn/vis/1.0"));
  /* Hún … að hún{kona}: one question per referent and sentence */
  assert.ok(!items.has("les:saga-tyndur-hundur/vis/6.5"));
  /* every item that can be asked is asked */
  let n = 0;
  for (const tx of EX.textar) tx.s.forEach((s) => {
    const seen = new Set();
    for (const r of s.ref || []) {
      if (seen.has(r.to.join("."))) continue;
      seen.add(r.to.join("."));
      if ((tx.lvl >= SAME_FROM ? r.same : r.other)?.length) n++;
    }
  });
  assert.equal(items.size, n);
});

test("les_visun is declared at the end of the catalogue, with its node, pattern, lesson and example", () => {
  /* in merge order: after #36's fr_tengiord, fr_innra and #39's les_kjarni_eigin, les_saga_eigin */
  assert.equal(CATALOGUE_IDS.indexOf("les_visun"), CATALOGUE_IDS.indexOf("les_saga_eigin") + 1);
  const c = catalogueEntry("les_visun");
  assert.deepEqual([c.skill, c.renderer, c.grader, c.recall, c.tags, c.bands],
    ["lesskilningur", "tap", "app", false, ["visun"], [1]]);
  assert.deepEqual(nodeById("les-visun").types, ["les_visun"]);
  assert.deepEqual(patternById("visun").types, ["les_visun"]);
  assert.ok(EXAMPLES.les_visun);
});

test("les_visun remembers its item, and a review brings back the one it names", () => {
  const spec = typeById("les_visun");
  const item = built[0].item;
  for (let k = 0; k < 4; k++) assert.equal(spec.build(lex, freshView(1, { force: { item } }), () => k / 4).task.item, item);
  assert.equal(spec.build(lex, freshView(1, { force: { item: "les:ekki-til/vis/0.0" } }), () => 0.5), null);
  assert.equal(spec.build(lex, freshView(1, { force: { cell: "kjarni" } }), () => 0.5), null);
});
