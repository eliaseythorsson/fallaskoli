/* The skill map (critique item 83), drawn: Merki og framvinda → Framvinda.
 *
 * One board, chalk on green like the board in Æfa. Every category is a trail
 * down it and every curriculum node a ring on the trail, in the order of the
 * school years. A ring says three things without being opened:
 *
 *   how well    the ring fills in quarters with the mastery mark (item 44):
 *               dashed and empty for "Of fá svör", then a quarter, a half,
 *               three quarters and whole. Shape first, colour second — it
 *               reads the same without colour.
 *   when last   "í gær", "fyrir 3 vikum", under the name
 *   waiting     a yellow disc at the end of the row: the number of reviews
 *               due there, or "!" when one of its error patterns is active
 *
 * A node no question asks yet is a padlock. Every ring is a real button:
 * Tab reaches it, its label says all three facts in a sentence, and it opens
 * the node — its rule, its error patterns, the cells and words that are
 * waiting, its Lesefni page and a session on exactly its question types.
 *
 * The map is drawn from the plain data of core/skillmap.js `mapOf`, never
 * from the state: the same function draws a teacher the map of one pupil
 * from what the server sent (`teacherMap` — less: no dates, no words).
 *
 * It replaces four panels of the old Framvinda. Styrkleikar eftir efni is the
 * head of each trail (stig, rank, XP, accuracy, the category's mastery mark);
 * Villumynstur is on the nodes, and the handful of patterns that belong to no
 * node are listed under the board; Hvar liggja mistökin is the table inside
 * "Föllin fjögur"; Orð sem þarf að æfa are the words inside each node (and
 * Orðasafn keeps its "Orð í hættu").                                        */

import { $, esc, fmt, openSheet } from "./dom.js";
import { CASES, COLS, mark } from "../core/marks.js";
import { abbr } from "../core/glossary.js";
import { nodeById } from "../core/curriculum.js";
import { lessonById } from "../core/lessons.js";
import { patternById } from "../core/diagnosis.js";
import { LABELS, masteryLine } from "../core/mastery.js";
import { effectivePolicy } from "../core/state.js";
import { weakWords } from "../core/wordhealth.js";
import {
  mapOf, nodeDetail, lastText, needsText, nodeSentence, NODE_RUN,
} from "../core/skillmap.js";

/* ---------- the ring ---------------------------------------------------------- */

/* A ring of radius 11 in a 32-box. The filled part is a wedge from twelve
   o'clock clockwise: a quarter per mark, the whole disc at mark 4. */
const WEDGE = {
  1: "M16 16 L16 5 A11 11 0 0 1 27 16 Z",
  2: "M16 16 L16 5 A11 11 0 0 1 16 27 Z",
  3: "M16 16 L16 5 A11 11 0 1 1 5 16 Z",
};

/** The ring of one node. `level`: 0–4, or "locked". Decorative: the words
    are beside it and in the button's label. */
export function ringSVG(level, size = 32) {
  /* The stylesheet sizes every svg to its box (`svg{width:100%}`), so the
     size is said in the style, not in the attributes. */
  const dim = `width="${size}" height="${size}" style="width:${size}px;height:${size}px"`;
  if (level === "locked") {
    return `<svg class="smring locked" viewBox="0 0 32 32" ${dim} aria-hidden="true" focusable="false">
      <path d="M11.5 15 V11.5 A4.5 4.5 0 0 1 20.5 11.5 V15" fill="none"/>
      <rect x="9" y="15" width="14" height="10" rx="1.5"/></svg>`;
  }
  const k = Math.max(0, Math.min(4, Number(level) || 0));
  return `<svg class="smring r${k}" viewBox="0 0 32 32" ${dim} aria-hidden="true" focusable="false">
    ${k === 4 ? `<circle class="fill" cx="16" cy="16" r="11"/>` : k ? `<path class="fill" d="${WEDGE[k]}"/>` : ""}
    <circle class="rim" cx="16" cy="16" r="11" fill="none"/>
    ${k === 4 ? `<path class="tick" d="M11 16.5 L14.6 20 L21.5 12.5" fill="none"/>` : ""}</svg>`;
}

/* ---------- the mastery mark of a category (item 44) --------------------------- */

/** Four pips and a word, with what it rests on in the title. */
export function masteryHTML(m) {
  const line = masteryLine(m);
  const pips = [1, 2, 3, 4].map((k) => `<i class="${k <= m.level ? "on" : ""}"></i>`).join("");
  return `<span class="mastery m${m.level}" title="${esc(line)}" aria-label="${esc(`Vald: ${m.label}. ${line}`)}">
    <span class="mpips" aria-hidden="true">${pips}</span><b>${esc(m.label)}</b></span>`;
}

/* ---------- one node on the trail ---------------------------------------------- */

const one = (k) => k % 10 === 1 && k % 100 !== 11;
const num = (x) => Number(x || 0).toLocaleString("is-IS");

function flagHTML(st) {
  if (st.locked || !st.needsWork) return "";
  const text = needsText(st);
  /* The number of reviews due; "!" when it is an error pattern alone. */
  return `<span class="smflag" title="${esc("Bíður þín: " + text)}"><i aria-hidden="true">${st.due ? (st.due > 9 ? "9+" : st.due) : "!"}</i></span>`;
}

function nodeHTML(n, { teacher }) {
  const sentence = nodeSentence(n, n, { teacher });
  if (n.locked) {
    return `<li><button type="button" class="smnode locked" data-node="${esc(n.id)}" aria-label="${esc(sentence)}">
      <span class="smglyph">${ringSVG("locked")}</span>
      <span class="smtext"><b>${esc(n.nm)}</b><small>engar spurningar enn</small></span></button></li>`;
  }
  const lvl = n.mastery.level;
  /* Never answered: one thing to say, not "too few answers · never". */
  const facts = teacher ? esc(n.mastery.label)
    : n.last == null ? "ekki æft enn"
    : `${esc(n.mastery.label)} · <span class="smlast">${esc(lastText(n.lastDays))}</span>`;
  return `<li><button type="button" class="smnode m${lvl}${n.needsWork ? " needs" : ""}${n.on ? "" : " off"}"
      data-node="${esc(n.id)}" data-level="${lvl}" aria-label="${esc(sentence + (n.on ? "" : " Slökkt í námsefninu."))}">
    <span class="smglyph">${ringSVG(lvl)}</span>
    <span class="smtext"><b>${esc(n.nm)}</b><small>${facts}${n.on ? "" : " · slökkt"}</small></span>
    ${flagHTML(n)}</button></li>`;
}

/* ---------- one category: the head (Styrkleikar eftir efni) and its trail ------- */

function laneHTML(c, opts) {
  const s = c.skill, m = c.mastery;
  const pct = s ? Math.round(100 * s.into / Math.max(1, s.need)) : 0;
  /* The way to the next stig: the bar, and in words for whoever asks it. */
  const toNext = s ? `${num(s.need - s.into)} XP í stig ${s.level + 1}` : "";
  const head = c.planned
    ? `<p class="smmeta">Ekki komið í forritið enn.</p>`
    : `${s ? `<div class="skbar" role="img" aria-label="${esc(toNext)}" title="${esc(toNext)}"><i style="width:${pct}%"></i></div>
        <p class="smmeta">${esc(s.rank)} · ${s.answers
          ? `${num(s.xp)} XP · ${Math.round(100 * s.acc)}% rétt af ${num(s.answers)}` : "ekkert svarað enn"}</p>` : ""}
      ${m ? `<p class="smmark">${masteryHTML(m)}${s && s.strong ? `<i class="tagstrong">sterkasta</i>` : ""}
        <span class="mline">${esc(masteryLine(m))}</span></p>` : ""}`;
  const trail = c.groups.map((g) => `<li class="smyear" aria-hidden="true"><span>${g.year}. bekkur</span></li>` +
    g.nodes.map((n) => nodeHTML(n, opts)).join("")).join("");
  return `<section class="smlane${c.on || c.planned ? "" : " off"}${c.planned ? " planned" : ""}" data-skill="${esc(c.id)}"
      ${m ? `data-mastery="${m.level}"` : ""} aria-labelledby="sml-${esc(c.id)}${opts.teacher ? "-t" : ""}">
    <header class="smhead">
      <h3 id="sml-${esc(c.id)}${opts.teacher ? "-t" : ""}"><span class="skico" aria-hidden="true">${c.ico}</span>
        <span class="smname">${esc(c.nm)}</span>
        ${s ? `<span class="smstig" title="${esc(toNext)}">Stig ${s.level}</span>` : ""}
        ${c.on || c.planned ? "" : `<span class="smoff">slökkt</span>`}</h3>
      ${head}
    </header>
    <ol class="smtrail">${trail}</ol>
  </section>`;
}

/* ---------- the board ----------------------------------------------------------- */

const LEGEND_MARKS = [0, 1, 2, 3, 4];

/* Open where there is room for it (a desk), folded to one line on a phone,
   where it would push the map itself off the first screen. */
function legendHTML({ teacher, wide = true }) {
  return `<details class="smlegendbox"${wide ? " open" : ""}>
    <summary><span class="smlegrings" aria-hidden="true">${[1, 2, 3, 4].map((k) => ringSVG(k, 16)).join("")}</span>Hvað merkja táknin?</summary>
    <ul class="smlegend">
    <li class="smlegmarks"><span class="smlegrings" aria-hidden="true">${LEGEND_MARKS.map((k) => ringSVG(k, 20)).join("")}</span>
      <span><b>Hringurinn</b> fyllist eftir því sem þú nærð betra valdi á efninu:
        ${LEGEND_MARKS.map((k) => LABELS[k].toLowerCase()).join(" → ")}</span></li>
    ${teacher ? "" : `<li><span class="smlegword" aria-hidden="true">í gær</span>
      <span><b>Undir nafninu</b> stendur hvenær þú æfðir efnið síðast</span></li>`}
    <li><span class="smflag" aria-hidden="true"><i>2</i></span>
      <span><b>Guli depillinn</b>: ${teacher ? "eitthvað bíður nemandans þar" : "eitthvað bíður þín þar"} —
        talan er upprifjanir í dag, „!“ er villa sem kemur oft fyrir núna</span></li>
    <li><span aria-hidden="true">${ringSVG("locked", 20)}</span>
      <span><b>Lás</b>: engar spurningar eru um þetta enn</span></li>
  </ul></details>`;
}

/**
 * The whole board, from the data of `mapOf` / `teacherMap`.
 * @param view  the map
 * @param opts  { teacher: boolean, title: string }
 */
export function mapHTML(view, { teacher = false, title = "Færnikort", wide = true } = {}) {
  const t = view.totals;
  const names = new Map(view.cats.flatMap((c) => c.groups.flatMap((g) => g.nodes.map((n) => [n.id, n]))));
  const next = (view.next || []).map((id) => names.get(id)).filter(Boolean);
  return `<div class="skillboard blackboard${teacher ? " teacher" : ""}" data-nodes="${t.nodes}">
    <div class="boardhead smboardhead">
      <span class="smtitle">${esc(title)}</span>
      <span class="smtotals">
        <span>Gott vald<b>${t.secure}</b></span>
        <span>Í vinnslu<b>${t.learning}</b></span>
        <span>Lítið æft<b>${t.unknown}</b></span>
        <span class="${t.needs ? "warn" : ""}">Gulur depill<b>${t.needs}</b></span>
        <span>Læst<b>${t.locked}</b></span>
      </span>
    </div>
    ${legendHTML({ teacher, wide })}
    ${next.length ? `<div class="smnext"><span class="smnextlbl">${teacher ? "Mest bíður hér:" : "Byrjaðu hér:"}</span>
      ${next.map((n) => `<button type="button" class="smnextbtn" data-node="${esc(n.id)}">${
        ringSVG(n.mastery.level, 18)}<span>${esc(n.nm)}</span>${flagHTML(n)}</button>`).join("")}</div>` : ""}
    <div class="smlanes">${view.cats.map((c) => laneHTML(c, { teacher })).join("")}</div>
  </div>`;
}

/* ---------- patterns of no node, under the board -------------------------------- */

const trendHTML = (t) => (t === "betra" ? `<span class="trend up" title="á uppleið">▲ betra</span>`
  : t === "verra" ? `<span class="trend down" title="á niðurleið">▼ verra</span>`
  : t === "jafnt" ? `<span class="trend">● svipað</span>` : `<span class="trend faint">nýtt</span>`);

const rateHTML = (p) => `<span class="ratebar" aria-hidden="true"><i style="width:${Math.round(100 * p.rate)}%"></i></span>
  ${p.misses} af ${p.seen} ${trendHTML(p.trend)}`;

/**
 * The error patterns that belong to no single node (accents, a slip of
 * spelling, an ending, a vowel change): the old Villumynstur table, of these
 * alone. `usable(id)`: may the pupil start a session on it (null: no buttons —
 * the teacher's view).
 */
export function loosePatternsHTML(list, { usable = null } = {}) {
  if (!list || !list.length) return "";
  return `<table class="diagtable wide"><thead><tr><th>Villumynstur</th><th>Undanfarið</th>
    <th>Alls</th>${usable ? "<th></th>" : ""}</tr></thead><tbody>${list.map((p) => {
      const meta = patternById(p.id) || p;
      return `<tr class="${p.active ? "activep" : ""}">
    <td><b>${esc(p.nm)}</b>${p.active ? ` <span class="topicflag">⚠ algengt núna</span>` : ""}
      ${meta.rule ? `<details><summary>Regla</summary><p>${fmt(meta.rule)}</p>${meta.lesson && lessonById(meta.lesson)
        ? `<button type="button" class="lessonlink" data-lesson="${esc(meta.lesson)}">📖 ${esc(lessonById(meta.lesson).nm)}</button>` : ""}</details>` : ""}</td>
    <td>${rateHTML(p)}</td>
    <td>${p.w} af ${p.n}</td>
    ${usable ? `<td>${p.active && usable(p.id) ? `<button type="button" class="ghost small" data-practise="${esc(p.id)}">Æfa</button>` : ""}</td>` : ""}
    </tr>`; }).join("")}</tbody></table>`;
}

/* ---------- a node, opened ------------------------------------------------------- */

/* The noun table's sixteen cells (the old "Hvar liggja mistökin?"). */
function gridHTML(grid) {
  let h = `<table class="heat"><caption class="sr-only">Hlutfall réttra svara í hverjum reit beygingartöflu nafnorða</caption><tr><th></th>` +
    COLS.map((c) => `<th scope="col">${abbr(c.label)}</th>`).join("") + "</tr>";
  CASES.forEach((cs) => {
    h += `<tr><th class="row" scope="row">${abbr(cs.name, cs.term)}</th>`;
    COLS.forEach((c) => {
      const s = grid[mark(cs.k, c.k)], n = s ? s.c + s.w : 0;
      if (!n) { h += `<td class="h0">–</td>`; return; }
      const p = s.c / n;
      h += `<td class="${p >= 0.9 ? "h4" : p >= 0.7 ? "h3" : p >= 0.5 ? "h2" : "h1"}"><b>${Math.round(p * 100)}%</b><br><span>${n}</span></td>`;
    });
    h += "</tr>";
  });
  return h + "</table>";
}

const svor = (k) => `${num(k)} ${one(k) ? "svar" : "svör"}`;

/**
 * The inside of an opened node.
 * @param node    the curriculum node
 * @param d       `nodeDetail(node, S)` — or, for a teacher, the node's standing
 *                merged with what the server sent of it
 * @param opts    { teacher, cat: {nm, ico}, canPractise, drillable: Set }
 */
export function nodePanelHTML(node, d, { teacher = false, cat = null, canPractise = true, drillable = null } = {}) {
  const page = node.lesson ? lessonById(node.lesson) : null;
  const eyebrow = `<p class="eyebrow smeyebrow"><span>${cat ? `${cat.ico} ${esc(cat.nm)} · ` : ""}${node.year}. bekkur</span></p>`;
  const lessonBtn = page ? `<button type="button" class="ghost" data-lesson="${esc(page.id)}">📖 Lesefni: ${esc(page.nm)}</button>` : "";
  const rule = d.rule ? `<h4 class="smh">Reglan</h4><div class="smrule"><p>${fmt(d.rule.text)}</p></div>` : "";

  if (d.locked) {
    return `<div class="smpanel locked" data-panel="${esc(node.id)}">${eyebrow}
      <div class="smfacts"><div class="smfact"><span>Staða</span>
        <b>${ringSVG("locked", 22)} Læst</b>
        <small>Engar spurningar eru um þetta í forritinu enn. ${page
          ? "Þú getur samt lesið um efnið í Lesefni." : "Það bætist við síðar."}</small></div></div>
      ${teacher ? "" : rule}
      ${!teacher && lessonBtn ? `<div class="answer smactions">${lessonBtn}</div>` : ""}</div>`;
  }

  const m = d.mastery;
  const needs = needsText(d);
  const facts = `<div class="smfacts">
    <div class="smfact m${m.level}"><span>Hve vel?</span>
      <b>${ringSVG(m.level, 22)} ${esc(m.label)}</b>
      <small>${esc(masteryLine(m))}</small></div>
    ${teacher ? "" : `<div class="smfact"><span>Síðast æft</span>
      <b>${esc(lastText(d.lastDays))}</b>
      <small>${d.answers ? `alls ${svor(d.answers)}` : "ekkert svar enn"}</small></div>`}
    <div class="smfact${d.needsWork ? " warn" : ""}"><span>${teacher ? "Bíður nemandans" : "Bíður þín"}</span>
      <b>${d.due ? `${d.due} í upprifjun` : d.active.length ? "Algeng villa" : "Ekkert"}</b>
      <small>${needs ? esc(needs) : "Ekkert bíður upprifjunar í dag og engin villa er algeng núna."}${
        d.waiting > d.due ? ` ${d.waiting - d.due} í viðbót ${one(d.waiting - d.due) ? "kemur" : "koma"} til upprifjunar síðar.` : ""}</small></div>
  </div>`;

  const patterns = (d.patterns || []).length
    ? `<h4 class="smh">Villumynstur</h4>
      <p class="smhint">Síðustu skiptin sem spurning prófaði mynstrið: hve oft svarið var rangt.</p>
      <ul class="smpatterns">${d.patterns.map((p) => {
        const meta = patternById(p.id) || p;
        /* The node's own rule is already above; a second pattern says its own. */
        const own = !teacher && meta.rule && (!d.rule || d.rule.from !== p.id);
        return `<li class="${p.active ? "activep" : ""}">
          <div class="smpname"><b>${esc(p.nm)}</b>${p.active ? ` <span class="topicflag">⚠ algengt núna</span>` : ""}</div>
          <div class="smprate">${p.seen ? rateHTML(p) : "–"} <span class="smpall">· alls ${p.w} af ${p.n}</span></div>
          ${own ? `<details><summary>Regla</summary><p>${fmt(meta.rule)}</p></details>` : ""}</li>`;
      }).join("")}</ul>` : "";

  const cells = (d.cells || []).length || d.grid
    ? `<h4 class="smh">Erfiðustu reitirnir</h4>
      ${(d.cells || []).length ? `<p class="smhint">Það sem fór úrskeiðis í þessum spurningum og bíður enn upprifjunar.</p>
      <ul class="smcells">${d.cells.map((c) => `<li><b>${esc(c.label)}</b>
        <span>rangt ${c.missed}×${c.right + c.wrong ? ` · alls rétt í ${c.right} af ${c.right + c.wrong}` : ""}</span>
        ${c.due ? `<i class="smdue">í upprifjun í dag</i>` : ""}</li>`).join("")}</ul>` : ""}
      ${d.grid ? `<p class="smhint">Hlutfall réttra svara í hverjum reit beygingartöflunnar — litla talan er fjöldi svara.</p>
        <div class="smgrid">${gridHTML(d.grid)}</div>` : ""}` : "";

  const words = !teacher && (d.words || []).length
    ? `<h4 class="smh">Orð sem bíða upprifjunar</h4>
      <div class="chips smwords">${d.words.map((w) => {
        const inner = `${esc(w.lemma)}${w.cls ? `<em class="cls">${esc(w.cls)}</em>` : ""}<i>rangt ${w.missed}×</i>`;
        return w.weak && drillable && drillable.has(w.key)
          ? `<button type="button" class="chip drillme" data-drill="${esc(w.key)}" title="Orð í hættu — smelltu til að taka björgunaræfingu">⚠ ${inner}</button>`
          : `<span class="chip">${inner}</span>`;
      }).join("")}</div>` : "";

  const actions = teacher
    ? `<p class="smhint smprivacy">Kennari sér tölurnar um efnið, ekki hvenær nemandinn æfði sig, hvaða orð fóru úrskeiðis né neitt sem hann skrifaði.</p>`
    : `<div class="answer smactions">
        ${canPractise
          ? `<button type="button" class="go" data-nodego="${esc(node.id)}">✎ Æfa þetta · ${NODE_RUN} spurningar</button>`
          : `<p class="smhint">Þetta efni er ekki opið í námsefninu þínu. Því er breytt undir <b>Stillingar og námsefni</b>.</p>`}
        ${lessonBtn}</div>`;

  return `<div class="smpanel" data-panel="${esc(node.id)}">${eyebrow}${facts}${teacher ? "" : rule}${patterns}${cells}${words}${actions}</div>`;
}

/* ---------- wiring ---------------------------------------------------------------- */

const catOf = (view, id) => view.cats.find((c) => c.groups.some((g) => g.nodes.some((n) => n.id === id))) || null;
const standingIn = (view, id) => view.cats.flatMap((c) => c.groups.flatMap((g) => g.nodes)).find((n) => n.id === id) || null;

/**
 * Open one node in a sheet. `ctx` says whose map it is:
 *   { app }                    the pupil's own, from the state
 *   { view }                   a teacher's, from what the server sent
 * Focus returns to the ring it was opened from (ui/dom.js openSheet).
 */
export function openNode(ctx, id) {
  const node = nodeById(id);
  if (!node) return null;
  const { app = null, view = null } = ctx;
  const teacher = !app;
  let d, cat, canPractise = false, drill = null;
  if (teacher) {
    const st = standingIn(view, id);
    if (!st) return null;
    d = { ...st, rule: null, ...((view.details || {})[id] || {}) };
    cat = catOf(view, id);
  } else {
    const now = Date.now();
    d = nodeDetail(node, app.S, now);
    cat = catOf(mapOf(app.S, now), id);
    canPractise = !!(app.canPractiseNode && app.canPractiseNode(id));
    drill = new Set(weakWords(app.S, app.lex).filter((w) => w.drillable).map((w) => w.key));
  }
  const sheet = openSheet(node.nm, nodePanelHTML(node, d, { teacher, cat, canPractise, drillable: drill }));
  sheet.el.addEventListener("click", (e) => {
    const go = e.target.closest("[data-nodego]");
    if (go) { sheet.close(); app.practiseNode(go.dataset.nodego); return; }
    const dr = e.target.closest("[data-drill]");
    if (dr) { sheet.close(); if (app && app.startDrill) app.startDrill(dr.dataset.drill); return; }
    /* A Lesefni link: the document's own handler opens the page (ui/lessons.js);
       the sheet only gets out of its way. */
    if (e.target.closest("[data-lesson]")) sheet.close();
  });
  return sheet;
}

const isWide = () => typeof window === "undefined" || !window.matchMedia || window.matchMedia("(min-width: 601px)").matches;

/** Clicks on the rings of a drawn map. */
function wireMap(el, ctx) {
  el.onclick = (e) => {
    const b = e.target.closest("button[data-node]");
    if (b) openNode(ctx, b.dataset.node);
  };
}

/** Framvinda: the pupil's own map, and under it the patterns of no node. */
export function renderSkillMap(app) {
  const el = $("skillmap");
  if (!el) return;
  const view = mapOf(app.S, Date.now(), effectivePolicy(app.S));
  el.innerHTML = mapHTML(view, { wide: isWide() });
  wireMap(el, { app });
  const loose = $("loosepatterns");
  if (!loose) return;
  const usable = (id) => !!(app.patternUsable && app.patternUsable(id));
  loose.innerHTML = view.loose.length
    ? `<h3 class="sec2">Villur sem eiga ekki einn stað á kortinu</h3>
      <p class="sub">Broddar, stafsetning, endingar og sérhljóð í stofni eru lesin úr öllu sem þú skrifar,
        hvert sem efnið er. <b>Undanfarið</b> eru síðustu 16 skiptin sem spurning prófaði mynstrið.
        <b>Ógreint</b> er hve mörg röng svör villugreiningin kunni ekki að flokka.</p>
      <div class="chartbox">${loosePatternsHTML(view.loose, { usable })}</div>`
    : "";
  loose.onclick = (e) => {
    const b = e.target.closest("[data-practise]");
    if (b && app.practisePattern) app.practisePattern(b.dataset.practise);
  };
}

/** Skólastofan: the map of one pupil, from the server's `teacherMap`. */
export function drawTeacherMap(el, data) {
  if (!el) return;
  const view = data.map;
  el.innerHTML = mapHTML(view, { teacher: true, title: "Færnikort · " + data.pupil.name, wide: isWide() }) +
    (view.loose.length ? `<div class="chartbox">${loosePatternsHTML(view.loose)}</div>` : "");
  wireMap(el, { view });
}
