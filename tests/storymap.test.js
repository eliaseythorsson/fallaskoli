/* Issue #31: MAIN's story map (docs/DLD-PLAN.md §4).

   - the six parts and their icons are defined once (core/storymap.js,
     ui/storyicons.js), with the same ids as the text format's marks
     (pipeline/content_io.py STORY_PARTS);
   - the text format's episodes (= 1. þáttur) and summary questions
     (? [samantekt] with + / - [brot] lines) are read, and every mark that
     does not point at the story stops the build with the FILE AND THE LINE;
   - the three question types — which sentence is the vandi / markmið, fill
     the story map, the summary that follows the map — are declared at the
     end of the catalogue, built from the texts, and judged. */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EX } from "../data/exercises.js";
import { judge } from "../src/js/core/answer.js";
import { tagsOf, patternById } from "../src/js/core/diagnosis.js";
import { CATALOGUE_IDS, catalogueEntry } from "../src/js/core/catalogue.js";
import { nodeById, presetContent } from "../src/js/core/curriculum.js";
import { STORY_PARTS, STORY_PART_IDS, breakNote, storyPart } from "../src/js/core/storymap.js";
import { storyIconHTML, storyPartHTML, storyMapHTML, ICON_PARTS } from "../src/js/ui/storyicons.js";
import { lessonFor } from "../src/js/core/lessons.js";
import { typeById } from "../src/js/tasks/index.js";
import { freshView, poolLex, buildFresh } from "./pools.js";
import { collect } from "../tools/review.mjs";
import { EXAMPLES } from "../src/js/content/examples.js";
import { LESSONS } from "../src/js/content/lessons.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const lex = poolLex();
const TYPES = ["les_hluti", "les_kort", "les_samantekt"];
const STORIES = EX.textar.filter((t) => t.k === "saga");

/* ---------- the six parts, defined once ----------------------------------------- */

test("the six parts are the text format's marks, in the same order", () => {
  const py = readFileSync(path.join(root, "pipeline/content_io.py"), "utf8");
  const m = /^STORY_PARTS = \(([^)]*)\)/m.exec(py);
  assert.ok(m, "STORY_PARTS in pipeline/content_io.py");
  assert.deepEqual(STORY_PART_IDS, [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]));
  assert.deepEqual(STORY_PARTS.map((p) => p.also).filter(Boolean), ["kveikja", "tilfinning"]);
  for (const p of STORY_PARTS) assert.ok(p.nm && p.acc && p.ask.endsWith("?"), p.id);
});

test("six icons, one per part, each its own drawing, labelled when alone and hidden beside its name", () => {
  assert.deepEqual([...ICON_PARTS], [...STORY_PART_IDS]);
  const bodies = new Set();
  for (const p of STORY_PARTS) {
    const alone = storyIconHTML(p.id, { label: true });
    assert.match(alone, /^<svg [^>]*role="img" aria-label="[^"]+"/);
    assert.ok(alone.includes(`aria-label="${p.nm}"`) && alone.includes(`<title>${p.nm}</title>`));
    const beside = storyIconHTML(p.id);
    assert.match(beside, /aria-hidden="true"/);
    assert.ok(!beside.includes("<title>"));
    assert.ok(beside.includes('stroke="currentColor"'), "drawn in the colour of the text");
    bodies.add(beside.replace(/^<svg[^>]*>/, ""));
    assert.ok(storyPartHTML(p.id).includes(p.nm.toLowerCase()));
  }
  assert.equal(bodies.size, 6, "six different drawings");
  assert.equal(storyIconHTML("ekki-til"), "");
  const map = storyMapHTML();
  for (const p of STORY_PARTS) assert.ok(map.includes(p.nm) && map.includes(p.ask), p.id);
  /* the Lesefni page shows the map */
  assert.ok(LESSONS.find((l) => l.id === "lesskilningur").blocks.some((b) => b.storymap));
});

test("why a wrong summary is wrong, from what it breaks", () => {
  assert.equal(breakNote("útkoma"), "Þessi samantekt passar ekki við **útkomuna** í sögunni.");
  assert.match(breakNote("röð"), /annarri röð/);
  assert.equal(storyPart("vandi").acc, "vandann");
});

/* ---------- the format: episodes and summaries ---------------------------------- */

const py = ["python3", "python"].find((p) => spawnSync(p, ["-c", "import sys; sys.exit(sys.version_info < (3, 8))"],
  { cwd: root }).status === 0);
function readOne(body) {
  const dir = mkdtempSync(path.join(tmpdir(), "texti-"));
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

const H3 = "# þyngd: 3\n# tegund: saga\n# orð:\n";
const EP1 = "= 1. þáttur\n[aðstæður] Jón var heima.\n[vandi] Jón sá hund.\n[tilraun] Jón kallaði á hund.\n[útkoma] Jón tók hundinn.\n";
const EP2 = "= 2. þáttur\n[vandi] Páll sá kött.\n[tilraun] Páll kallaði á kött.\n[útkoma] Páll tók köttinn.\n";
const SUM = "? [samantekt] Hvaða samantekt passar?\n+ Jón og Páll tóku dýr.\n- [útkoma] Jón og Páll misstu dýr.\n- [röð] Páll tók kött á undan Jóni.\n! Skýring.\n";

test("a story in two episodes, with a summary question in a block", { skip: py ? false : "no Python 3" }, () => {
  const { text, err } = readOne(H3 + EP1 + EP2 + SUM);
  assert.equal(err, undefined);
  assert.deepEqual(text.setningar.map((s) => s.e), [1, 1, 1, 1, 2, 2, 2]);
  assert.deepEqual(text.spurningar.map((q) => [q.mark, q.q, q.a, q.w, q.br, q.why]),
    [["samantekt", "Hvaða samantekt passar?", "Jón og Páll tóku dýr.", ["Jón og Páll misstu dýr.", "Páll tók kött á undan Jóni."],
      ["útkoma", "röð"], "Skýring."]]);
  /* a story without episodes is episode 0; a main-idea question may be a block too */
  const one = readOne(H3 + EP1.replace("= 1. þáttur\n", "") +
    "? [aðalatriði] Um hvað?\n+ Um hund.\n- Um kött.\n- Um hest.\n! Skýring.\n");
  assert.equal(one.err, undefined);
  assert.deepEqual(one.text.setningar.map((s) => s.e), [0, 0, 0, 0]);
  assert.deepEqual([one.text.spurningar[0].a, one.text.spurningar[0].w, one.text.spurningar[0].br], ["Um hund.", ["Um kött.", "Um hest."], []]);
});

test("marks that do not point at the story stop with the file and the line", { skip: py ? false : "no Python 3" }, () => {
  const at = (body, line, re) => {
    const { err } = readOne(body);
    assert.ok(err, "read without complaint:\n" + body);
    assert.match(err, new RegExp(`^ERR content/textar/prufa\\.txt:${line}: `), err);
    assert.match(err, re, err);
  };
  /* episodes: numbered in order, before their sentences, each with vandi, tilraun, útkoma */
  at(H3 + EP1 + EP2.replace("= 2.", "= 3.") + SUM, 9, /tölusettir 1, 2, 3 í röð/);
  at(H3 + EP1.replace("= 1. þáttur\n", "") + EP2 + SUM, 8, /tölusettir 1, 2, 3 í röð/);
  at(H3 + "[aðstæður] Jón var úti.\n" + EP1 + EP2 + SUM, 5, /stendur á undan fyrstu setningunni/);
  at(H3 + "= 1. þáttur\n= 2. þáttur\n" + EP1.slice(12) + SUM, 5, /þáttur 1 hefur enga setningu/);
  at(H3 + EP1 + EP2.replace("[tilraun] Páll kallaði á kött.\n", "[annað] Páll kallaði á kött.\n") + SUM, 9, /í þætti 2 vantar: tilraun/);
  at(H3 + EP1 + SUM, 4, /hefur 2 eða 3 þætti, en hér eru 1/);
  at(H3.replace("3", "2") + EP1 + EP2 + SUM, 4, /saga skiptist fyrst í þætti á þyngd 3/);
  at(H3 + EP1 + "= annar þáttur\n" + SUM, 9, /= 1\. þáttur/);
  at(H3 + EP1 + EP2 + SUM + "= 3. þáttur\n", 18, /á undan spurningunum/);
  /* a summary: in a block, each wrong one naming a part the story has, or röð */
  const story = H3 + EP1 + EP2;
  at(story + SUM.replace("[útkoma]", "[markmið]"), 15, /brýtur \[markmið\], en sagan hefur engan þann hluta/);
  at(story + SUM.replace("[útkoma]", "[endir]"), 15, /óþekkt brot \[endir\]/);
  at(story + SUM.replace("- [útkoma] ", "- "), 15, /segir fremst hvað hún brýtur/);
  at(story + "? [samantekt] Hvaða? | A. | B. | C.\n! Skýring.\n", 13, /svörin í línunum fyrir neðan/);
  at(story + SUM.replace("+ Jón og Páll tóku dýr.\n", ""), 14, /rétta svarið \(\+\) stendur fremst/);
  at(story + SUM.replace("- [röð] Páll tók kött á undan Jóni.\n", ""), 13, /eitt rétt svar \(fremst\) og tvö eða þrjú röng, en hér eru 2/);
  at(story + SUM.replace("misstu dýr", "tóku dýr"), 13, /sama svarið stendur tvisvar/);
  at(story + SUM.replace("+ Jón og Páll tóku dýr.\n", "+ Jón og Páll tóku dýr.\n+ Annað.\n"), 15, /bara eitt/);
  at(story + "+ Laust svar.\n" + SUM, 13, /beint undir spurningu/);
  at(story + "? [aðalatriði] Um hvað?\n+ Um dýr.\n- [vandi] Um hund.\n- Um kött.\n! Skýring.\n", 15, /bara notað í samantekt/);
  const fact = "# þyngd: 1\n# tegund: fræðitexti\n# orð:\n[aðalatriði] Jón sá hund.\n[smáatriði] Jón tók hundinn.\n";
  at(fact + SUM.replace(/\[útkoma\]|\[röð\]/g, "[röð]"), 6, /bara spurð um sögu/);
});

test("EX.textar: the episodes and what each wrong summary breaks reach the app", () => {
  const cake = EX.textar.find((t) => t.id === "saga-afmaeliskakan");
  assert.deepEqual(cake.s.map((s) => s.e), [1, 1, 1, 1, 1, 2, 2, 2, 2]);
  assert.ok(EX.textar.filter((t) => t.id !== cake.id).every((t) => t.s.every((s) => !("e" in s))));
  let n = 0;
  for (const tx of STORIES) for (const q of tx.q.filter((x) => x.k === "samantekt")) {
    n++;
    assert.equal(q.br.length, q.w.length, tx.id);
    const have = new Set(tx.s.map((s) => s.p));
    q.br.forEach((b) => assert.ok(b === "röð" || have.has(b), `${tx.id}: ${b}`));
  }
  assert.ok(n >= 3, "summary questions on at least three stories");
  assert.ok(STORIES.length >= 4, "at least two stories more than #30's");
});

/* ---------- the three types ------------------------------------------------------- */

test("the three types are declared in merge order at the end of the catalogue, on their node, with their pattern", () => {
  /* in merge order: right after #37's or_eigin; #38's types came after them */
  const at = CATALOGUE_IDS.indexOf("or_eigin") + 1;
  assert.deepEqual(CATALOGUE_IDS.slice(at, at + 3), TYPES);
  for (const id of TYPES) {
    const c = catalogueEntry(id);
    assert.deepEqual([c.skill, c.grader, c.recall, c.tags], ["lesskilningur", "app", false, ["sogukort"]], id);
    assert.ok(EXAMPLES[id], `${id}: a worked example`);
  }
  assert.equal(catalogueEntry("les_kort").renderer, "sort");
  /* #39 added the story summary in the pupil's own words to the node */
  assert.deepEqual(nodeById("les-sogukort").types, [...TYPES, "les_saga_eigin"]);
  assert.deepEqual(patternById("sogukort").types, TYPES);
  for (const y of [8, 9, 10]) for (const id of TYPES) assert.ok(presetContent(y).types.includes(id), `${y}: ${id}`);
});

const wrongIs = (t, picked) => {
  const j = judge(t, picked);
  assert.equal(j.ok, false);
  assert.deepEqual(j.findings.map((f) => f.p), ["sogukort"]);
};

test("les_hluti: the sentences of the story (or episode) in order, the one that is the vandi or markmið right", () => {
  const seen = new Set();
  for (const t of buildFresh("les_hluti", 1, 300)) {
    seen.add(t.item);
    const [, id, part, ep] = /^les:([^/]+)\/([^/]+)(?:\/(\d))?$/.exec(t.item);
    const tx = EX.textar.find((x) => x.id === id);
    const mine = tx.s.filter((s) => (s.e || 0) === (ep ? +ep : 0));
    assert.equal(t.type, "choice");
    assert.equal(t.part, part);
    assert.deepEqual(t.options, mine.map((s) => s.t), "the options are the story, in its order");
    assert.equal(t.answer, mine.find((s) => s.p === part).t);
    assert.deepEqual(t.text, ep > 1 ? tx.s.filter((s) => (s.e || 0) < +ep).map((s) => s.t) : []);
    if (ep) assert.match(t.question, new RegExp(`í ${ep}\\. þætti`));
    assert.deepEqual(Object.keys(t.whyNot).sort(), t.options.filter((o) => o !== t.answer).sort());
    assert.deepEqual([...tagsOf(t)], ["sogukort"]);
    assert.equal(lessonFor(t), "lesskilningur");
    assert.equal(judge(t, { picked: t.answer }).ok, true);
    for (const o of t.options.filter((y) => y !== t.answer)) wrongIs(t, { picked: o });
  }
  /* every story, the cake story's two episodes each */
  for (const id of ["saga-straeto", "saga-tyndur-hundur", "saga-bolti-a-thaki"]) assert.ok(seen.has(`les:${id}/vandi`), id);
  assert.ok(seen.has("les:saga-bolti-a-thaki/markmið") && seen.has("les:saga-afmaeliskakan/markmið/1"));
  assert.ok(seen.has("les:saga-afmaeliskakan/vandi/1") && seen.has("les:saga-afmaeliskakan/vandi/2"));
});

test("les_kort: each sentence of the map to its part, the six parts with their icons as the buckets", () => {
  const seen = new Set();
  for (const t of buildFresh("les_kort", 1, 300)) {
    seen.add(t.item);
    assert.equal(t.type, "sort");
    assert.deepEqual(t.buckets, [...STORY_PART_IDS]);
    assert.ok(t.icons && t.long);
    assert.ok(t.items.length >= 2 && t.items.every((it) => STORY_PART_IDS.includes(it.cls)));
    const right = Object.fromEntries(t.items.map((it, k) => [k, it.cls]));
    assert.equal(judge(t, { picks: right }).ok, true);
    assert.ok(judge(t, { picks: { 0: right[0] } }).pending, "every sentence placed first");
    const other = STORY_PART_IDS.find((p) => p !== right[0]);
    wrongIs(t, { picks: { ...right, 0: other } });
  }
  assert.ok(seen.has("les:saga-afmaeliskakan/kort/1") && seen.has("les:saga-afmaeliskakan/kort/2"));
  /* nine stories, one of them in two episodes (#35 added two, #36 two more, #33 two) */
  assert.equal(seen.size, 11, [...seen].join(", "));
});

test("les_samantekt: the whole story, the summaries as written, why each wrong one breaks the map", () => {
  const seen = new Set(), first = new Set();
  for (const t of buildFresh("les_samantekt", 1, 300)) {
    const tx = EX.textar.find((x) => t.item.startsWith(`les:${x.id}#`));
    const q = tx.q[+t.item.split("#")[1]];
    seen.add(tx.id);
    assert.equal(q.k, "samantekt");
    assert.deepEqual(t.text, tx.s.map((s) => s.t));
    assert.equal(t.answer, q.a);
    assert.deepEqual([...t.options].sort(), [q.a, ...q.w].sort());
    first.add(t.options[0] === t.answer);
    q.w.forEach((w, k) => assert.equal(t.whyNot[w], breakNote(q.br[k])));
    assert.equal(judge(t, { picked: t.answer }).ok, true);
    for (const o of q.w) wrongIs(t, { picked: o });
  }
  assert.equal(seen.size, STORIES.filter((x) => x.q.some((q) => q.k === "samantekt")).length);
  assert.equal(first.size, 2, "the right summary is not always first");
});

test("each type remembers what it showed, and a review brings back the item it names", () => {
  for (const id of TYPES) {
    const spec = typeById(id);
    const b = spec.build(lex, freshView(1), () => 0.5);
    assert.deepEqual(b.effects.filter((e) => e.op === "exSeen").map((e) => e.key), [b.task.item]);
    const items = new Set(buildFresh(id, 1, 200).map((t) => t.item));
    for (const item of items)
      assert.equal(spec.build(lex, freshView(1, { force: { item } }), () => 0.9).task.item, item);
    assert.equal(spec.build(lex, freshView(1, { force: { item: "les:ekki-til/vandi" } }), () => 0.5), null);
    assert.equal(spec.build(lex, freshView(1, { force: { cell: "tengi:en" } }), () => 0.5), null);
  }
});

test("the worked examples and the Lesefni page do not use a story the pupil is asked about", () => {
  const taught = JSON.stringify(TYPES.map((id) => EXAMPLES[id])) + JSON.stringify(LESSONS.find((l) => l.id === "lesskilningur"));
  for (const tx of STORIES) {
    for (const s of tx.s) assert.ok(!taught.includes(s.t), `${tx.id}: "${s.t}"`);
    for (const q of tx.q) assert.ok(!taught.includes(q.a), `${tx.id}: "${q.a}"`);
  }
});

test("the review page shows a story's episodes and every summary", async () => {
  const { items } = await collect();
  const cake = items.find((it) => it.file === "content/textar/saga-afmaeliskakan.txt");
  assert.deepEqual(cake.body.filter(([k, v]) => k === "q" && /þáttur$/.test(v)).map(([, v]) => v), ["1. þáttur", "2. þáttur"]);
  const tx = EX.textar.find((x) => x.id === "saga-afmaeliskakan");
  assert.equal(cake.text, tx.s.map((s) => s.t).join(" "));
  assert.equal(cake.answer, tx.q[0].a);
  for (const w of tx.q[0].w) assert.ok(Object.fromEntries(cake.fields)["röng svör"].includes(w));
  const dog = items.find((it) => it.file === "content/textar/saga-tyndur-hundur.txt");
  const summary = EX.textar.find((x) => x.id === "saga-tyndur-hundur").q[1];
  assert.ok(dog.body.some(([k, v]) => k === "q" && v.includes(summary.a) && summary.w.every((w) => v.includes(w))));
});
