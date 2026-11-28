/* Issue #36: Frásögn step 3 (docs/DLD-PLAN.md §5) — a connective, and a
   word for an inner state, chosen in a gap inside a story.

   - the gap is marked in the story's own file (_words_, then ~ lines: the
     kind and why the right word fits, each wrong option with why it does
     not); pipeline/story_gaps.py reads it, and a block that does not fit
     its sentence stops the build with the FILE AND THE LINE;
   - the two types, fr_tengiord and fr_innra, are declared at the end of the
     catalogue, build nothing below þyngd 3 (STEP3_FROM: unlocked after
     steps 1 and 2) and the same questions from 3 up;
   - each question holds the whole story, its gap shown as ___, and the
     reason for every wrong option (`whyNot`), as #28's ob_tengiord. */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EX } from "../data/exercises.js";
import { judge } from "../src/js/core/answer.js";
import { tagsOf, patternById } from "../src/js/core/diagnosis.js";
import { CATALOGUE_IDS, catalogueEntry } from "../src/js/core/catalogue.js";
import { nodeById, presetContent } from "../src/js/core/curriculum.js";
import { NODE_PATTERNS } from "../src/js/core/skillmap.js";
import { lessonFor } from "../src/js/core/lessons.js";
import { levelRanges } from "../src/js/core/difficulty.js";
import { createPolicy, presetPolicy } from "../src/js/core/policy.js";
import { storyLinesHTML } from "../src/js/ui/storyicons.js";
import { TASKS } from "../src/js/tasks/index.js";
import { FRASOGN_ITEMS, STEP3_FROM } from "../src/js/tasks/frasogn.js";
import { buildFresh, freshView, poolLex } from "./pools.js";
import { seeded } from "../src/js/core/duel.js";
import { collect } from "../tools/review.mjs";
import { EXAMPLES } from "../src/js/content/examples.js";
import { LESSONS } from "../src/js/content/lessons.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const TYPES = ["fr_tengiord", "fr_innra"];
const KIND = { fr_tengiord: "tengi", fr_innra: "innra" };
/* issue #28's five (pipeline/exercises.py CONNECTIVES) */
const CONNECTIVES = ["af því að", "þess vegna", "þegar", "síðan", "en"];
const STORIES = EX.textar.filter((t) => t.k === "saga");
const GAPS = STORIES.flatMap((tx) => tx.s.filter((s) => s.g).map((s) => ({ tx, s, g: s.g })));

/* ---------- the format ------------------------------------------------------------ */

const py = ["python3", "python"].find((p) => spawnSync(p, ["-c", "import sys; sys.exit(sys.version_info < (3, 8))"],
  { cwd: root }).status === 0);
function readOne(body) {
  const dir = mkdtempSync(path.join(tmpdir(), "eyda-"));
  const f = path.join(dir, "prufa.txt");
  writeFileSync(f, body, "utf8");
  const r = spawnSync(py, ["-c", `import sys; sys.path.insert(0, 'pipeline')
import content_io, json
try:
    t = content_io.read_text(${JSON.stringify(f)}, "content/textar/prufa.txt", None, None)
    print("OK", json.dumps(t, ensure_ascii=False))
except content_io.ContentError as e:
    print("ERR", e)
`], { cwd: root, encoding: "utf8", env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.startsWith("OK ") ? { text: JSON.parse(r.stdout.slice(3)) } : { err: r.stdout.trim() };
}

const H = "# þyngd: 2\n# tegund: saga\n# orð:\n";
const S1 = "[aðstæður] Jón var heima.\n";
const GAP = "[vandi] Jón var svangur _af því að_ hann{Jón} borðaði ekki.\n" +
  "~ [tengiorð] Af því að segir hvers vegna.\n" +
  "~ þess vegna | Á eftir þess vegna kemur sögnin strax.\n" +
  "~ en | Hér er engin andstæða.\n";
const REST = "[tilraun] Jón fékk sér brauð.\n[útkoma] Jón var saddur.\n" +
  "? [aðalatriði] Um hvað? | Um Jón. | Um hund. | Um kött.\n! Skýring.\n";

test("a gap and its block are read: the right answer, the sentence with ___, every wrong one with its reason",
  { skip: py ? false : "no Python 3" }, () => {
    const { text, err } = readOne(H + S1 + GAP + REST);
    assert.equal(err, undefined);
    const s = text.setningar[1];
    assert.equal(s.t, "Jón var svangur af því að hann borðaði ekki.", "the sentence whole, without its marks");
    assert.deepEqual(s.gap, {
      k: "tengi", a: "af því að", t: "Jón var svangur ___ hann borðaði ekki.", why: "Af því að segir hvers vegna.",
      w: ["þess vegna", "en"], no: { "þess vegna": "Á eftir þess vegna kemur sögnin strax.", en: "Hér er engin andstæða." },
      line: 6 });
    assert.equal(s.refs.length, 1, "the pronoun after the gap keeps its referent");
    assert.equal(text.setningar[0].gap, null);
  });

test("a gap that does not fit its block stops with the file and the line", { skip: py ? false : "no Python 3" }, () => {
  const at = (body, line, re) => {
    const { err } = readOne(body);
    assert.ok(err, "read without complaint:\n" + body);
    assert.match(err, new RegExp(`^ERR content/textar/prufa\\.txt:${line}: `), err);
    assert.match(err, re, err);
  };
  const story = (gap) => H + S1 + gap + REST;
  /* the block: right under its sentence, the kind first, two or three wrong ones */
  at(story(GAP.replace(/~[^\n]*\n/g, "")), 5, /vantar ~ línurnar/);
  at(story(GAP.replace("[tengiorð]", "[annað]")), 6, /óþekkt tegund eyðu \[annað\]/);
  at(story(GAP.replace("~ en | Hér er engin andstæða.\n", "")), 6, /tvo eða þrjá ranga kosti, en hér eru 1/);
  at(story(GAP.replace("~ en | Hér", "~ en Hér")), 8, /~ rangt \| af hverju ekki/);
  at(story(GAP.replace("~ en |", "~ þess vegna |")), 8, /stendur tvisvar/);
  at(story(GAP.replace("~ en |", "~ af því að |")), 8, /stendur tvisvar/);
  at(story(GAP.replace("~ en |", "~ En |")), 8, /litlum staf fremst/);
  at(story(GAP.replace("~ [tengiorð] Af því að segir hvers vegna.\n", "")), 6, /fyrsta ~ línan segir hvers konar/);
  at(story(GAP.replace("~ en |", "~ [tengiorð] en |")), 8, /bara í fyrstu ~ línunni/);
  at(H + S1 + "~ [tengiorð] Skýring.\n" + REST, 5, /beint undir setningu með eyðu/);
  at(story(GAP) + "~ en | Seint.\n", 13, /á undan spurningunum/);
  /* the gap itself: whole words, once, no pronoun mark in it */
  at(story(GAP.replace("_af því að_", "_af því að_ _x_")), 5, /eyða er skrifuð _orð_ og ein/);
  at(story(GAP.replace("_af því að_ hann{Jón}", "_af því að hann{Jón}_")), 5, /fornafn með vísun/);
  at(story(GAP.replace("svangur _af", "svangur_af")), 5, /heil orð/);
  at(story(GAP.replace("_af því að_", "_ af því að_")), 5, /heil orð/);
  /* only a story */
  const fact = "# þyngd: 1\n# tegund: fræðitexti\n# orð:\n[aðalatriði] Jón _sá_ hund.\n~ [hugarástand] Já.\n" +
    "~ heyrði | Nei.\n~ fann | Nei.\n[smáatriði] Jón tók hundinn.\n? [aðalatriði] Um hvað? | Hund. | Kött. | Hest.\n! Skýring.\n";
  at(fact, 4, /bara saga hefur eyður/);
});

/* ---------- the items -------------------------------------------------------------- */

test("the gaps in content/textar/: issue #28's connectives, and inner-state words that keep the sentence whole", () => {
  const tengi = GAPS.filter((x) => x.g.k === "tengi"), innra = GAPS.filter((x) => x.g.k === "innra");
  assert.ok(tengi.length >= 7 && innra.length >= 7, `${tengi.length} connectives, ${innra.length} inner states`);
  for (const { tx, s, g } of GAPS) {
    const where = `${tx.id}: ${s.t}`;
    assert.equal(g.t.split("___").length, 2, where);
    assert.equal(g.t.replace("___", g.a), s.t, `${where}: the gap gives back the sentence`);
    assert.ok(g.w.length >= 2 && g.w.length <= 3, where);
    assert.deepEqual(Object.keys(g.no).sort(), [...g.w].sort(), `${where}: a reason for every wrong option`);
    assert.ok(g.why && g.w.every((w) => g.no[w].length > 10), where);
    if (g.k === "tengi") for (const o of [g.a, ...g.w]) assert.ok(CONNECTIVES.includes(o.toLowerCase()), `${where}: ${o}`);
  }
  /* #28's rules for what is never offered beside what (content/obeygjanleg/tengiord.tsv) */
  for (const { s, g } of tengi) {
    const a = g.a.toLowerCase(), w = g.w.map((x) => x.toLowerCase());
    if (a === "af því að" || a === "en") assert.ok(!w.includes("þegar"), `${s.t}: þegar could also stand`);
    if (a === "síðan") assert.ok(!w.includes("þess vegna") && !w.includes("þegar"), s.t);
    if (a === "þess vegna") assert.ok(!w.includes("síðan"), s.t);
  }
  /* every one of the five is a right answer somewhere */
  assert.deepEqual([...new Set(tengi.map((x) => x.g.a.toLowerCase()))].sort(), [...CONNECTIVES].sort());
});

/* ---------- the two types ------------------------------------------------------------ */

test("the two types are declared in merge order at the end of the catalogue, on their node, with their pattern, lesson and examples", () => {
  /* in merge order: right after #32's les_kjarni; #39's types and #33's les_visun came after them */
  const at = CATALOGUE_IDS.indexOf("les_kjarni") + 1;
  assert.deepEqual(CATALOGUE_IDS.slice(at, at + 2), TYPES);
  for (const id of TYPES) {
    const c = catalogueEntry(id);
    assert.deepEqual([c.skill, c.grader, c.recall, c.renderer, c.tags, c.bands],
      ["frasogn", "app", false, "choice", ["sogumal"], [1, STEP3_FROM]], id);
    assert.ok(EXAMPLES[id], `${id}: a worked example`);
    for (const y of [8, 9, 10]) assert.ok(presetContent(y).types.includes(id), `${y}: ${id}`);
  }
  assert.deepEqual(nodeById("fras-tengsl").types, TYPES);
  assert.deepEqual(NODE_PATTERNS["fras-tengsl"], ["sogumal"]);
  assert.deepEqual(patternById("sogumal").types, TYPES);
  /* taught directly: the Lesefni page has both sections */
  const page = JSON.stringify(LESSONS.find((l) => l.id === "frasogn"));
  for (const h of ["Orð sem tengja atburði", "Orð um hugsanir og tilfinningar"]) assert.ok(page.includes(h), h);
  /* the taught stories are not the stories asked about */
  const taught = JSON.stringify(TYPES.map((id) => EXAMPLES[id])) + page;
  for (const { s } of GAPS) assert.ok(!taught.includes(s.t), s.t);
});

test("unlocked by þyngd: nothing below 3, and Frásögn's level may now reach it", () => {
  for (const id of TYPES) {
    for (let band = 1; band < STEP3_FROM; band++) assert.deepEqual(buildFresh(id, band, 40), [], `${id} at þyngd ${band}`);
    assert.ok(buildFresh(id, STEP3_FROM, 40).length > 0, `${id} at þyngd ${STEP3_FROM}`);
  }
  /* no door where there is no path: a session that may ask only step 3 (a
     teacher's assignment of node fras-tengsl) builds it at any þyngd */
  const only = createPolicy(null, { ...presetPolicy(8), types: Object.fromEntries(TASKS.filter((t) => t.skill === "frasogn")
    .map((t) => [t.id, TYPES.includes(t.id)])) });
  const lex = poolLex();
  for (const id of TYPES) {
    const spec = TASKS.find((t) => t.id === id);
    assert.equal(spec.build(lex, freshView(1), seeded(1)), null, `${id} at þyngd 1`);
    assert.ok(spec.build(lex, freshView(1, { policy: only }), seeded(1)), `${id} alone at þyngd 1`);
  }
  const ranges = levelRanges(createPolicy(null, presetPolicy(8)), TASKS, []);
  assert.ok(ranges.frasogn[1] >= STEP3_FROM, `Frásögn's range ${ranges.frasogn}`);
});

test("every gap is asked, the story whole, the reason for each wrong option, graded from the file", () => {
  for (const id of TYPES) {
    const seen = new Set();
    for (const t of buildFresh(id, STEP3_FROM, 400)) {
      seen.add(t.item);
      const [, sid, k, j] = /^fr:([^/]+)\/([^/]+)\/(\d+)$/.exec(t.item);
      assert.equal(k, KIND[id]);
      const tx = STORIES.find((x) => x.id === sid), g = tx.s[+j].g;
      assert.equal(t.type, "choice");
      assert.deepEqual(t.lines, tx.s.map((s, n) => (n === +j ? { t: g.t, blank: true } : { t: s.t })));
      assert.deepEqual([...t.options].sort(), [g.a, ...g.w].sort());
      assert.equal(t.answer, g.a);
      assert.deepEqual(t.whyNot, g.no);
      assert.deepEqual(t.story, tx.s.map((s) => ({ t: s.t, p: s.p })), "the whole story");
      assert.deepEqual([...tagsOf(t)], ["sogumal"]);
      assert.equal(lessonFor(t), "frasogn");
      assert.ok(judge(t, { picked: g.a }).ok);
      const j2 = judge(t, { picked: g.w[0] });
      assert.equal(j2.ok, false);
      assert.deepEqual(j2.findings.map((f) => f.p), ["sogumal"]);
    }
    assert.equal(seen.size, FRASOGN_ITEMS[id].length, `${id}: every gap is asked`);
  }
});

test("the gap is drawn inside its sentence", () => {
  const html = storyLinesHTML([{ t: "Fyrst." }, { t: "Hún fór ___ hún var þreytt.", blank: true }]);
  assert.match(html, /<li class="storyblank">Hún fór <span class="blank">\?<\/span> hún var þreytt\.<\/li>/);
});

test("the review page shows each gap's reasons beside its story", async () => {
  const { items } = await collect();
  for (const tx of STORIES.filter((x) => x.s.some((s) => s.g))) {
    const card = items.find((it) => it.file === `content/textar/${tx.id}.txt`);
    assert.equal(card.text, tx.s.map((s) => s.t).join(" "), `${tx.id}: the text as the pupil reads it`);
    const body = JSON.stringify(card.body);
    for (const s of tx.s.filter((x) => x.g)) for (const w of s.g.w) assert.ok(body.includes(s.g.no[w]), `${tx.id}: ${w}`);
  }
});
