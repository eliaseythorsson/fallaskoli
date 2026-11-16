// @ts-check
/* The skill map (critique item 83): where a pupil stands, node by node.
 *
 * Framvinda showed four separate views — Styrkleikar eftir efni, Villumynstur,
 * Hvar liggja mistökin and Orð sem þarf að æfa. None was tied to the
 * curriculum, and the finest thing a pupil could act on was a whole category.
 * The map is one view in their place: every node of the curriculum map
 * (core/curriculum.js) with three facts on it —
 *
 *   HOW WELL    the mastery mark of item 44 (core/mastery.js): accuracy on
 *               recent answers at the pupil's level, and reviews kept
 *   WHEN LAST   when a question of the node was last answered
 *   NEEDS WORK  an error pattern of the node is active (core/diagnosis.js),
 *               or entries of the node are due in the review queue
 *               (core/review.js)
 *
 * — and, opened, its rule, its worst cells and words, its Lesefni page and a
 * session on exactly its question types.
 *
 * This file is the arithmetic. It draws nothing (ui/skillmap.js does) and it
 * runs on the server too, which sends a teacher the same map of one pupil
 * (`teacherMap`), with less in it.
 *
 * ---- which answers belong to a node ----------------------------------------
 *
 * A node is a set of question types, and `S.byType` (item 44) keeps the last
 * twenty answers of every type, so for most nodes the mark is
 * `masteryOfTypes(S, node.types)` and nothing new is saved.
 *
 * Seven nodes are NOT their types. Persóna og tala, Nútíð og þátíð,
 * Viðtengingarháttur and Miðmynd are all asked by the same three verb types;
 * what tells them apart is the feature asked (`attrs`: the past tense, the
 * subjunctive …). Boðháttur and Fallhættir share the reverse analysis with
 * every noun and adjective. Read from the types alone, a pupil who is sure of
 * the present tense and lost in the subjunctive would see the same mark on
 * both. So for the nodes with `attrs` — and only for them — one more record
 * is kept, of the same shape as a type's:
 *
 *   S.byNode[nodeId] = { n, c, h, at }      (core/mastery.js has the shape)
 *
 * written by `noteNodeAnswer` on the one path every answer takes
 * (core/answer.js `settle`): an answer counts for such a node when its type is
 * one of the node's and the cell it was about carries the node's features
 * (`policy.js featuresOf`, the same reading a session on the node is narrowed
 * by). A table counts once, right if every cell of it that belongs to the
 * node was right. Until a pupil has answered such a question after this
 * record came in, these nodes say "Of fá svör": honest, and it fills within a
 * session.
 *
 * The review queue needs nothing new: an entry carries its type and its cell,
 * so the same test says which entries are a node's.
 *
 * ---- which error patterns belong to a node ---------------------------------
 *
 * `NODE_PATTERNS`, written by hand and held by tests/skillmap.test.js to two
 * rules: every pattern is on exactly one node or in `LOOSE_PATTERNS`, and a
 * pattern on a node shares a question type with it — so "needs work" on a
 * node is always something the node's own button practises. The first
 * pattern of a node is where its rule is taken from.
 *
 * One node per pattern, although a few patterns are fed by several nodes
 * (*Samræmi í kyni* is read from numerals too): the pattern's record is one
 * count, and flagging three nodes for it would be right for one of them.
 *
 * `LOOSE_PATTERNS` are the ones that belong to no single place: accents, a
 * slip of spelling, a wrong ending, a vowel change — read from every form a
 * pupil types. The map lists them under itself.
 *
 * Pure: no DOM, no storage, and the clock is an argument.                   */

import { NODES, nodeById, PLANNED_CATEGORIES, YEARS } from "./curriculum.js";
import { SKILLS } from "./skills.js";
import { featuresOf } from "./policy.js";
import { describeMark, NOUN_MARKS } from "./marks.js";
import { patternById, standingOf } from "./diagnosis.js";
import { dayOf, daysBetween, STALE_DAYS, ON_TIME_DAYS, openingSize } from "./review.js";
import {
  masteryOfTypes, masteryOf, markFrom, readChar, answerChar, cleanByType, mergeByType,
  HIST, WINDOW, NEAR,
} from "./mastery.js";
import { storedLevel, MIN, MAX } from "./difficulty.js";
import { skillSummary } from "./progress.js";
import { statusOf } from "./wordhealth.js";
import { lessonById } from "./lessons.js";

const isObj = (x) => x && typeof x === "object" && !Array.isArray(x);

/* ---------- patterns on nodes ----------------------------------------------- */

/** Node id → the error patterns filed under it; the first gives the rule. */
export const NODE_PATTERNS = {
  "no-foll": ["thf_thgf", "ef", "nf_aukafall", "fall_annad", "greinir"],
  "no-kyn-tala": ["kyn", "tala"],
  "no-beyging": ["beyging_no", "beyging_no_nf"],
  "lo-beyging": ["beyging_lo"],
  "lo-stig": ["stig"],
  "lo-samraemi": ["kyn_samraemi"],
  "fn-flokkar": ["fn_flokkar", "eignarfall_pfn"],
  "fn-afturbeygt": ["afturbeyging"],
  "to-fleirtolu": ["fleirtoluord"],
  "so-persona-tala": ["sogn_frumlag", "sogn_obeygd"],
  "so-tid": ["tid"],
  "so-vidtengingarhattur": ["hattur"],
  "so-bodhattur": ["bodhattur", "bodh_styfdur", "bodh_nh"],
  "so-midmynd": ["mynd"],
  "so-tholmynd": ["mynd_greina", "mynd_st", "tholmynd"],
  "so-sterkar-veikar": ["beyging_so", "beyging_so_hljod", "sterk_veik_sogn"],
  "ob-fs-ao": ["ao_fs"],
  "ob-samtengingar": ["samtengingar"],
  "gr-ordflokkar": ["ordflokkur"],
  "fs-forsetningar": ["fallstjorn_fs"],
  "fs-hreyfing": ["hreyfing"],
  "fs-sagnir": ["fallstjorn_so"],
  "fs-operson": ["opersonuleg"],
  "or-merking": ["merking"],
  "or-myndun": ["ordmyndun"],
  "mb-villur": ["ofleidretting", "hvor", "ad_af"],
  "mb-raeda": ["obein_raeda"],
  "setn-hlutar": ["setningalidir"],
  "setn-ordarod": ["v2"],
  "setn-lidir": ["lidir", "lidir_fl"],
  "gerd-adal-auka": ["setningagerd"],
  "gerd-tegundir": ["aukasetn_tegund", "svo_ad"],
};

/** Patterns of no single node: read from every written form. "Ógreint" (a
    count of what the diagnosis could not read) rides last, as it always has. */
export const LOOSE_PATTERNS = ["hljodvarp", "ending", "broddar", "stafsetning", "y_i", "n_nn", "dh_d",
  "ogreint"];

export const patternsOfNode = (node) => (node && NODE_PATTERNS[node.id]) || [];

/* ---------- the nodes that are not their types ------------------------------ */

/** The nodes that keep a record of their own (`S.byNode`): see the top. */
export const ATTR_NODES = NODES.filter((n) => n.types.length && n.attrs && Object.keys(n.attrs).length);
export const ATTR_NODE_IDS = ATTR_NODES.map((n) => n.id);

/** Does this cell (a BÍN mark) carry the features the node is about? A node
    without `attrs` takes every cell; a cell that is not a mark ("setn:frumlag")
    carries no features and belongs to no node with `attrs`. */
export function cellOfNode(node, cell) {
  const want = node && node.attrs ? Object.entries(node.attrs) : [];
  if (!want.length) return true;
  const f = featuresOf(cell);
  return want.every(([g, keys]) => keys.includes(f[g]));
}

/**
 * One answered question, written into the record of every node with `attrs`
 * it belongs to. `parts` is what the answer was about: [{ cell, ok }] — one
 * for most questions, one per cell for a table. `band` is the step of
 * difficulty it was asked at, as for `noteTypeAnswer`. Returns the ids written.
 */
export function noteNodeAnswer(S, typeId, parts, band, now = Date.now()) {
  if (!S || !Array.isArray(parts)) return [];
  const out = [];
  for (const node of ATTR_NODES) {
    if (!node.types.includes(typeId)) continue;
    const mine = parts.filter((p) => p && typeof p.ok === "boolean" && cellOfNode(node, p.cell));
    if (!mine.length) continue;
    const ok = mine.every((p) => p.ok);
    const all = isObj(S.byNode) ? S.byNode : (S.byNode = {});
    const r = isObj(all[node.id]) ? all[node.id] : { n: 0, c: 0, h: "", at: 0 };
    all[node.id] = {
      n: (r.n || 0) + 1, c: (r.c || 0) + (ok ? 1 : 0),
      h: (String(r.h || "") + answerChar(band, ok)).slice(-HIST), at: now,
    };
    out.push(node.id);
  }
  return out;
}

/**
 * What one judged answer was about, for `noteNodeAnswer`: a table's cells
 * each with its own right or wrong, anything else its one cell with the
 * question's. Reads the task and the judgement (core/answer.js `judge`), as
 * core/review.js `readAnswer` does.
 */
export function partsOf(task, j) {
  if (!task || !j) return [];
  if (task.type === "table")
    return (j.effects || []).filter((e) => e.do === "record" && e.counts !== false && e.cell)
      .map((e) => ({ cell: e.cell, ok: !!e.ok }));
  return task.cell && typeof j.ok === "boolean" ? [{ cell: task.cell, ok: j.ok }] : [];
}

/** `S.byNode` as it may be trusted (state.js `migrate`, server/guard.mjs). */
export const cleanByNode = (raw) => cleanByType(raw, ATTR_NODE_IDS);
/** Two devices: counts add, the history answered last wins (as `S.byType`). */
export const mergeByNode = (base, local, remote) => mergeByType(base, local, remote, ATTR_NODE_IDS);

/* ---------- the review queue, by node --------------------------------------- */

/** The entries of the queue that are this node's, stale ones left out. */
export function entriesOfNode(node, S, now = Date.now()) {
  if (!node || !node.types.length) return [];
  const today = dayOf(now);
  const types = new Set(node.types);
  const items = S && S.review && Array.isArray(S.review.items) ? S.review.items : [];
  return items.filter((e) => e && types.has(e.t) && typeof e.due === "string" &&
    daysBetween(e.due, today) <= STALE_DAYS && (!node.attrs || cellOfNode(node, e.c)));
}

/* ---------- the standing of one node ---------------------------------------- */

const bandNow = (S, skill) => Math.min(MAX, Math.max(MIN, Math.round(storedLevel(S, skill))));

/* The mark of a node with a record of its own: the same reading as a type's
   (core/mastery.js recentAtLevel), of the one record. Review tallies are not
   kept per node, so "Fullt vald" asks only that nothing of the node is
   overdue in the queue. */
function markOfRecord(S, node, entries, now) {
  const rec = isObj(S && S.byNode) ? S.byNode[node.id] : null;
  const cur = bandNow(S, node.cat);
  const recent = rec && typeof rec.h === "string"
    ? [...rec.h].reverse().map(readChar).filter((x) => Math.abs(x.band - cur) <= NEAR).slice(0, WINDOW) : [];
  const today = dayOf(now);
  const overdue = entries.filter((e) => daysBetween(e.due, today) > ON_TIME_DAYS).length;
  return { ...markFrom(recent, { overdue }), band: cur, at: rec ? rec.at || 0 : 0, total: rec ? rec.n || 0 : 0 };
}

function markOfTypes(S, node, now) {
  const by = isObj(S && S.byType) ? S.byType : {};
  let at = 0, total = 0;
  for (const t of node.types) {
    const r = by[t];
    if (!isObj(r)) continue;
    at = Math.max(at, r.at || 0); total += r.n || 0;
  }
  const known = SKILLS.some((s) => s.id === node.cat);
  return { ...masteryOfTypes(S, node.types, now), band: known ? bandNow(S, node.cat) : null, at, total };
}

/**
 * How one node stands. Pure.
 *
 * @param {object} node  an entry of core/curriculum.js NODES
 * @param {object} S     the saved state
 * @param {number} now   ms
 * @returns {{
 *   id: string,
 *   locked: boolean,          no question asks this yet — nothing below is set
 *   mastery: { level: 0..4, label, accuracy, n, right, band, reviewsOnTime, overdue, … },
 *   answers: number,          answers ever given to the node
 *   last: ?number,            ms of the last answer, null if never
 *   lastDays: ?number,        whole days since, by the calendar (0 = today)
 *   due: number,              entries of the node due for review today
 *   waiting: number,          entries of the node in the queue at all
 *   active: string[],         ids of the node's error patterns that are active
 *   needsWork: boolean        due > 0 or an active pattern
 * }}
 */
export function standingOfNode(node, S, now = Date.now()) {
  if (!node) return null;
  if (!node.types.length) {
    return { id: node.id, locked: true, mastery: null, answers: 0, last: null, lastDays: null,
      due: 0, waiting: 0, active: [], needsWork: false };
  }
  const entries = entriesOfNode(node, S, now);
  const today = dayOf(now);
  const m = node.attrs && ATTR_NODE_IDS.includes(node.id)
    ? markOfRecord(S, node, entries, now) : markOfTypes(S, node, now);
  const { at, total, ...mastery } = m;
  const due = entries.filter((e) => e.due <= today).length;
  const diag = (S && S.diag) || {};
  const active = patternsOfNode(node).filter((id) => {
    const p = patternById(id);
    return p && !p.meta && diag[id] && standingOf(diag[id]).active;
  });
  /* A clock set back, or a record merged from a device ahead of this one:
     "last" is never in the future. */
  const last = at > 0 ? Math.min(at, now) : null;
  return {
    id: node.id, locked: false, mastery, answers: total,
    last, lastDays: last == null ? null : Math.max(0, daysBetween(dayOf(last), today)),
    due, waiting: entries.length, active, needsWork: due > 0 || active.length > 0,
  };
}

/* ---------- words for the three facts --------------------------------------- */

/** "í dag", "í gær", "fyrir 4 dögum", "fyrir 3 vikum", "fyrir 2 mánuðum" —
    how long ago, in whole days by the calendar. null: never. */
export function lastText(days) {
  if (days == null) return "ekki æft enn";
  const d = Math.max(0, Math.floor(days));
  if (d === 0) return "í dag";
  if (d === 1) return "í gær";
  if (d < 7) return `fyrir ${d} dögum`;
  if (d < 14) return "fyrir viku";
  if (d < 30) return `fyrir ${Math.floor(d / 7)} vikum`;
  if (d < 60) return "fyrir mánuði";
  if (d < 365) return `fyrir ${Math.floor(d / 30)} mánuðum`;
  return "fyrir meira en ári";
}

/** Singular after a number ending in 1 but not 11, as Icelandic counts. */
const one = (k) => k % 10 === 1 && k % 100 !== 11;

/** What needs work, in words: "2 atriði bíða upprifjunar · 1 villumynstur
    algengt núna". "" when nothing does. */
export function needsText(st) {
  if (!st || st.locked) return "";
  const bits = [];
  if (st.due) bits.push(`${st.due} atriði ${one(st.due) ? "bíður" : "bíða"} upprifjunar`);
  if (st.active.length) bits.push(`${st.active.length} villumynstur algengt núna`);
  return bits.join(" · ");
}

/** The whole node in one sentence, for a screen reader and a title. */
export function nodeSentence(node, st, { teacher = false } = {}) {
  if (st.locked) return `${node.nm}. Læst: engar spurningar eru um þetta enn.`;
  const bits = [`${node.nm}. Vald: ${st.mastery.label}.`];
  if (!teacher) bits.push(st.last == null ? "Ekki æft enn." : `Síðast æft ${lastText(st.lastDays)}.`);
  const needs = needsText(st);
  if (needs) bits.push(`${teacher ? "Bíður nemandans" : "Bíður þín"}: ${needs}.`);
  return bits.join(" ");
}

/* ---------- a cell, said in words ------------------------------------------- */

const NOUN_MARK = new Set(NOUN_MARKS);
const PLAIN = /^[a-záðéíóúýþæö]+$/;
const LIDIR = { nl: "nafnliður", sl: "sagnliður", fl: "forsetningarliður", al: "atviksliður" };

/**
 * What a cell is, for a pupil: "þágufall, fleirtala, án greinis", "fallstjórn:
 * á", "frumlag". The cells of the saved state come in a dozen shapes (a BÍN
 * mark, "stjórn:á", "setn:frumlag" …); only the shapes this function is sure
 * of get a label, and a cell without one is not listed — a wrong label on a
 * child's mistake is worse than none.
 */
export function cellLabel(cell) {
  if (!cell || typeof cell !== "string") return null;
  const k = cell.indexOf(":");
  if (k < 0) {
    return describeMark(cell, NOUN_MARK.has(cell) ? "nafnorð" : "x") || null;
  }
  const kind = cell.slice(0, k), rest = cell.slice(k + 1);
  if (!rest) return null;
  if (kind === "stjórn" && PLAIN.test(rest)) return `fallstjórn: ${rest}`;
  if ((kind === "setn" || kind === "tegund" || kind === "ofl") && PLAIN.test(rest)) return rest;
  if (kind === "lidur" && LIDIR[rest]) return LIDIR[rest];
  if (kind === "fn" && featuresOf(rest).fall) return `fornafn: ${describeMark(rest, "fn")}`;
  if (kind === "to" && featuresOf(rest).fall && featuresOf(rest).kyn) return `töluorð: ${describeMark(rest, "to")}`;
  return null;
}

/* ---------- one node, opened ------------------------------------------------- */

/** Which node carries the noun table's sixteen cells ("Hvar liggja mistökin"). */
export const NOUN_GRID_NODE = "no-foll";

const figuresOf = (id, rec) => {
  const p = patternById(id), s = standingOf(rec);
  return { id, nm: p.nm, rule: p.rule, lesson: p.lesson || null,
    n: s.n, w: s.w, seen: s.seen, misses: s.misses,
    rate: Math.round(s.rate * 1000) / 1000, trend: s.trend, active: !p.meta && s.active };
};

/**
 * Everything the opened node shows. Pure.
 *
 *   rule      { text, from } — the node's first pattern's rule, or its Lesefni
 *             page's opening lines; null when the node has neither
 *   patterns  the node's error patterns this pupil has met (a chance at
 *             least once), with the figures the pupil has always been shown
 *   cells     what was missed in the node's questions and is still waiting in
 *             the review queue, worst first: { cell, label, missed, due,
 *             right, wrong } — `right`/`wrong` are the cell's totals
 *   words     the words of those entries: { key, lemma, cls, missed, due,
 *             right, wrong, weak } — `weak`: in danger (core/wordhealth.js)
 *   grid      for the node of the four cases, the noun table's sixteen cells:
 *             { [mark]: { c, w } }; null elsewhere
 */
export function nodeDetail(node, S, now = Date.now()) {
  const st = standingOfNode(node, S, now);
  if (!node || !st) return null;
  const lesson = node.lesson && lessonById(node.lesson) ? node.lesson : null;
  const ids = patternsOfNode(node);
  const first = ids.map(patternById).find((p) => p && p.rule);
  const page = lesson ? lessonById(lesson) : null;
  const rule = first ? { text: first.rule, from: first.id }
    : page && page.lead ? { text: page.lead, from: "lesson" } : null;
  const out = { ...st, lesson, rule, patterns: [], cells: [], words: [], grid: null };
  if (st.locked) return out;

  const diag = (S && S.diag) || {};
  out.patterns = ids.filter((id) => patternById(id) && diag[id] && diag[id].n > 0)
    .map((id) => figuresOf(id, diag[id]))
    .sort((a, b) => (b.active ? 1 : 0) - (a.active ? 1 : 0) || b.rate - a.rate || b.w - a.w);

  const today = dayOf(now);
  const cells = new Map(), words = new Map();
  for (const e of entriesOfNode(node, S, now)) {
    const due = e.due <= today ? 1 : 0, missed = Math.max(1, e.l || 1);
    const label = cellLabel(e.c);
    if (label) {
      const c = cells.get(e.c) || { cell: e.c, label, missed: 0, due: 0 };
      c.missed += missed; c.due += due;
      cells.set(e.c, c);
    }
    if (typeof e.w === "string" && e.w) {
      const w = words.get(e.w) || { key: e.w, missed: 0, due: 0 };
      w.missed += missed; w.due += due;
      words.set(e.w, w);
    }
  }
  const worst = (a, b) => b.missed - a.missed || b.due - a.due;
  out.cells = [...cells.values()].sort(worst).slice(0, 6).map((c) => {
    const t = (S.cells || {})[c.cell] || {};
    return { ...c, right: t.c || 0, wrong: t.w || 0 };
  });
  out.words = [...words.values()].sort(worst).slice(0, 10).map((w) => {
    const [lemma, cls = ""] = w.key.split("|");
    const t = (S.words || {})[w.key] || {};
    return { ...w, lemma, cls, right: t.c || 0, wrong: t.w || 0, weak: statusOf(t) === "weak" };
  });
  if (node.id === NOUN_GRID_NODE) {
    const grid = {};
    for (const m of NOUN_MARKS) {
      const t = (S.cells || {})[m];
      if (t && (t.c || t.w)) grid[m] = { c: t.c || 0, w: t.w || 0 };
    }
    if (Object.keys(grid).length) out.grid = grid;
  }
  return out;
}

/* ---------- the whole map ---------------------------------------------------- */

/**
 * The map: every category with its nodes by year, each node with its
 * standing. Plain data — it is drawn from this and nothing else, and it is
 * what a teacher is sent (`teacherMap`).
 *
 * @param {object} S
 * @param {number} now
 * @param {?object} policy  the pupil's effective policy (core/state.js
 *        effectivePolicy), to say which nodes are switched on; null = by
 *        `S.enabled` alone
 * @returns {{ at, cats: Array, totals: object, loose: Array, next: string[] }}
 */
export function mapOf(S, now = Date.now(), policy = null) {
  const summary = new Map(skillSummary(S).map((r) => [r.id, r]));
  const best = Math.max(1, ...[...summary.values()].map((r) => r.level));
  const lanes = [...SKILLS.map((s) => ({ id: s.id, nm: s.nm, ico: s.ico, planned: false })),
    ...PLANNED_CATEGORIES.map((c) => ({ id: c.id, nm: c.nm, ico: "✏️", planned: true }))];
  const totals = { nodes: 0, open: 0, locked: 0, secure: 0, learning: 0, unknown: 0, needs: 0 };
  const flagged = [];

  const cats = lanes.map((lane) => {
    const r = summary.get(lane.id) || null;
    const groups = YEARS.map((year) => ({
      year,
      nodes: NODES.filter((n) => n.cat === lane.id && n.year === year).map((n) => {
        const st = standingOfNode(n, S, now);
        const on = !st.locked && (policy
          ? policy.skill(n.cat) && n.types.some((t) => policy.type(t))
          : !!(r && r.enabled));
        totals.nodes++;
        if (st.locked) totals.locked++;
        else {
          totals.open++;
          if (st.mastery.level >= 3) totals.secure++;
          else if (st.mastery.level >= 1) totals.learning++;
          else totals.unknown++;
          if (st.needsWork) { totals.needs++; flagged.push({ id: n.id, due: st.due, active: st.active.length, on }); }
        }
        return { ...st, nm: n.nm, year: n.year, cat: n.cat, lesson: n.lesson || null, on };
      }),
    })).filter((g) => g.nodes.length);
    return {
      ...lane,
      on: lane.planned ? false : (policy ? policy.skill(lane.id) : !!(r && r.enabled)),
      /* Styrkleikar eftir efni, carried: the category's stig, its rank, the
         way to the next stig, its XP and its accuracy over all time. */
      skill: r ? { level: r.level, rank: r.rank, xp: r.xp, into: r.into, need: r.need,
        answers: r.answers, acc: r.acc, strong: r.level === best && r.answers >= 10 } : null,
      mastery: r ? masteryOf(S, lane.id, now) : null,
      groups,
    };
  }).filter((c) => c.groups.length);

  /* What to do next: the switched-on nodes that need work, the most reviews
     due first, then the most active patterns. */
  const next = flagged.sort((a, b) => (b.on ? 1 : 0) - (a.on ? 1 : 0) || b.due - a.due || b.active - a.active)
    .slice(0, 4).map((f) => f.id);

  const diag = (S && S.diag) || {};
  const loose = LOOSE_PATTERNS.filter((id) => patternById(id) && diag[id] && diag[id].n > 0 && diag[id].w > 0)
    .map((id) => ({ ...figuresOf(id, diag[id]), meta: !!patternById(id).meta }));

  return { at: now, cats, totals, loose, next };
}

/* ---------- the teacher's copy ------------------------------------------------ */

/**
 * The map of one pupil as their teacher gets it (item 83 d; the route is
 * server/server.mjs GET /teacher/skillmap, authorised as item 37's).
 *
 * LESS than the pupil sees, on purpose, and in keeping with what the privacy
 * notice already promises of the teacher's view (core/classview.js):
 *
 *   sent       per node the mastery mark and what it rests on (answers in the
 *              window, right ones, the step of difficulty), how many reviews
 *              are due and waiting, which error patterns are active; opened,
 *              the patterns' figures and the cells missed — grammar, as
 *              labels and counts
 *   NOT sent   when anything was last practised (no date and no "days ago":
 *              the notice says a teacher does not see when or how long a
 *              pupil practises), the words a pupil missed, the examples a
 *              pattern keeps, the raw histories, XP and stig, and nothing a
 *              pupil typed (the state does not hold it)
 *
 * @returns {{ teacher: true, cats, totals, loose, next, details: { [nodeId]: object } }}
 */
export function teacherMap(S, now = Date.now(), policy = null) {
  const m = mapOf(S, now, policy);
  const strip = (st) => { const { last, lastDays, answers, ...rest } = st; return rest; };
  const details = {};
  const cats = m.cats.map((c) => ({
    id: c.id, nm: c.nm, ico: c.ico, planned: c.planned, on: c.on, skill: null,
    mastery: c.mastery ? { level: c.mastery.level, label: c.mastery.label, n: c.mastery.n,
      right: c.mastery.right, band: c.mastery.band, reviewsOnTime: c.mastery.reviewsOnTime,
      overdue: c.mastery.overdue } : null,
    groups: c.groups.map((g) => ({ year: g.year, nodes: g.nodes.map((n) => {
      if (!n.locked) {
        const d = nodeDetail(nodeById(n.id), S, now);
        details[n.id] = { patterns: d.patterns.map(({ rule, lesson, ...f }) => f),
          cells: d.cells, grid: d.grid };
      }
      return strip(n);
    }) })),
  }));
  return { teacher: true, cats, totals: m.totals, next: m.next,
    loose: m.loose.map(({ rule, lesson, ...f }) => f), details };
}

/* ---------- a session on a node ---------------------------------------------- */

/** How many questions a node's button asks. */
export const NODE_RUN = 10;

/**
 * What the node's session is: exactly its question types, narrowed to its
 * features, opening with the node's own reviews that are due (most urgent
 * first, as every session's opening — core/review.js). null for a locked node.
 */
export function nodeSession(node, S, now = Date.now(), n = NODE_RUN) {
  if (!node || !node.types.length) return null;
  const today = dayOf(now);
  const due = entriesOfNode(node, S, now).filter((e) => e.due <= today)
    .sort((a, b) => (a.s || 0) - (b.s || 0) || (a.due < b.due ? 1 : a.due > b.due ? -1 : 0));
  return { id: node.id, n, types: [...node.types], cats: [node.cat], attrs: node.attrs || null,
    review: due.slice(0, openingSize(n)).map((e) => e.k),
    label: "Færnikort: " + node.nm, lesson: node.lesson || null };
}
