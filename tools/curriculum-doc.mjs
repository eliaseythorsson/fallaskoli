/* Writes the tables in docs/CURRICULUM.md from the data in
 * src/js/core/curriculum.js, between marker comments, so the document a
 * teacher reads and the map the program uses are the same list.
 *
 *     node tools/curriculum-doc.mjs          rewrite the tables in place
 *     node tools/curriculum-doc.mjs --check  exit 1 if they are out of date
 *
 * The prose around the tables is written by hand and is never touched.
 * tests/curriculum-map.test.js runs the same check on every test run. */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  CRITERIA, NODES, YEARS, PLANNED_CATEGORIES, backlog, presetContent,
} from "../src/js/core/curriculum.js";
import { SKILLS } from "../src/js/core/skills.js";
import { QUESTION_TYPES } from "../src/js/core/policy.js";
import { LESSONS } from "../src/js/content/lessons.js";

const DOC = fileURLToPath(new URL("../docs/CURRICULUM.md", import.meta.url));

const catName = (id) =>
  (SKILLS.find((s) => s.id === id) || PLANNED_CATEGORIES.find((c) => c.id === id) || {}).nm || id;
const typeName = (id) => (QUESTION_TYPES.find((t) => t.id === id) || {}).nm || id;
const lessonName = (id) => (LESSONS.find((l) => l.id === id) || {}).nm || id;
const hvName = (id) => (CRITERIA.find((c) => c.id === id) || {}).nm || id;

const COVER = { full: "yes", part: "in part", none: "**no**" };
const SCOPE = {
  core: "yes: the app's main subject",
  part: "partly",
  outside: "no: outside what a drill program does",
};

const cell = (s) => String(s).replace(/\|/g, "\\|");
const row = (cells) => `| ${cells.map(cell).join(" | ")} |`;
const table = (head, rows) =>
  [row(head), row(head.map(() => "---")), ...rows.map(row)].join("\n");

const typesCell = (n) => (n.types.length
  ? n.types.map((t) => `${typeName(t)} (\`${t}\`)`).join("; ")
  : "none yet");
const lessonCell = (n) => (n.lesson ? `${lessonName(n.lesson)} (\`${n.lesson}\`)` : "none yet");

/** Criterion → what serves it. One row per official hæfniviðmið. */
export function criteriaTable() {
  return table(
    ["Hæfniviðmið (heading in the aðalnámskrá)", "Section", "Within reach of a drill app?",
      "Nodes", "With questions", "Fully covered"],
    CRITERIA.map((c) => {
      const mine = NODES.filter((n) => n.hv === c.id);
      return [c.nm, c.flokkur, SCOPE[c.scope], mine.length,
        mine.filter((n) => n.types.length).length,
        mine.filter((n) => n.cover === "full").length];
    }));
}

/** The map itself: criterion → category → node → types → page, by year. */
export function nodeTable() {
  const order = (n) => YEARS.indexOf(n.year) * 1000 + NODES.indexOf(n);
  return YEARS.map((y) => {
    const rows = NODES.filter((n) => n.year === y).sort((a, b) => order(a) - order(b));
    return `### ${y}. bekkur\n\n` + table(
      ["Node", "Efni", "Hæfniviðmið", "Skill (flokkur)", "Question types", "Lesefni", "Covered"],
      rows.map((n) => [`\`${n.id}\``, n.nm, hvName(n.hv), catName(n.cat),
        typesCell(n), lessonCell(n), COVER[n.cover]]));
  }).join("\n\n");
}

/** What is missing, split by the item that would close it. */
export function backlogTable() {
  const part = (item, title) => {
    const rows = backlog(item);
    return `### ${title}\n\n` + table(
      ["Node", "Efni", "Year", "Question type", "Lesefni page"],
      rows.map((n) => [`\`${n.id}\``, n.nm, n.year,
        n.types.length ? "only inside " + n.types.map((t) => `\`${t}\``).join(", ") : "**missing**",
        n.lesson ? `\`${n.lesson}\`` : "**missing**"]));
  };
  return [
    part(27, "Item 27: Lesefni teaches it, practice does not ask it (or only in passing)"),
    part(28, "Item 28: new material"),
  ].join("\n\n");
}

/** What each preset switches on. */
export function presetTable() {
  let before = { skills: [], types: [] };
  const rows = YEARS.map((y) => {
    const c = presetContent(y);
    const addS = c.skills.filter((s) => !before.skills.includes(s));
    const addT = c.types.filter((t) => !before.types.includes(t));
    before = c;
    return [`${y}. bekkur`, `${c.skills.length} of ${SKILLS.length}`,
      `${c.types.length} of ${QUESTION_TYPES.length}`, `1–${c.topLevel}`,
      (addS.length ? addS.map(catName).join(", ") : "no new category")
        + (y > YEARS[0] ? "; types " + addT.map((t) => `\`${t}\``).join(", ") : "")];
  });
  return table(["Preset", "Categories on", "Question types on", "Levels", "What it adds"], rows);
}

export const MARKERS = {
  criteria: { start: "<!-- curriculum:criteria:start -->", end: "<!-- curriculum:criteria:end -->", make: criteriaTable },
  nodes: { start: "<!-- curriculum:nodes:start -->", end: "<!-- curriculum:nodes:end -->", make: nodeTable },
  backlog: { start: "<!-- curriculum:backlog:start -->", end: "<!-- curriculum:backlog:end -->", make: backlogTable },
  presets: { start: "<!-- curriculum:presets:start -->", end: "<!-- curriculum:presets:end -->", make: presetTable },
};

/** The document with every generated block brought up to date. */
export function fill(doc) {
  let out = doc;
  for (const m of Object.values(MARKERS)) {
    const a = out.indexOf(m.start), b = out.indexOf(m.end);
    if (a < 0 || b < a) throw new Error("marker missing in docs/CURRICULUM.md: " + m.start);
    out = out.slice(0, a + m.start.length) + "\n" + m.make() + "\n" + out.slice(b);
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const doc = readFileSync(DOC, "utf8");
  const next = fill(doc);
  if (process.argv.includes("--check")) {
    if (next !== doc) { console.error("docs/CURRICULUM.md is out of date: run node tools/curriculum-doc.mjs"); process.exit(1); }
    console.log("docs/CURRICULUM.md is up to date");
  } else {
    writeFileSync(DOC, next);
    console.log("docs/CURRICULUM.md: tables rewritten");
  }
}
