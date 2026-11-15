/* Error reports (v6.8).

   Every question carries a 🚩 button. The child says in their own words what
   looks wrong; everything else is captured automatically — the question as the
   program built it (sentence, analysis, expected answer), what was answered
   and the verdict, as text and as data — so the administrator can judge the
   report without having to reproduce it. Nothing is changed automatically:
   a report is a note for a person.

   Where reports go:
   - on a server, to `POST /reports`; administrators review them under
     Stillingar og námsefni → Umsjón → Villutilkynningar;
   - opened from a file or a plain web host, to this browser's storage, and the
     adult reviews them under Stillingar og námsefni → Villutilkynningar, with
     a download of everything as JSON.                                       */

import { $, esc, openSheet } from "./dom.js";
import { skillName } from "../core/skills.js";

/* global __APP_VERSION__ */
const VERSION = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";
const LOCAL_KEY = "fallaskoli.reports";

export const REPORT_KINDS = [
  { id: "villa",   nm: "Rangt svar",        ds: "Rétta svarið sem forritið gefur er rangt" },
  { id: "setning", nm: "Undarleg setning",  ds: "Setningin eða orðið hljómar ekki eins og íslenska" },
  { id: "skyring", nm: "Villa í skýringu",  ds: "Skýring, merking eða lesefni er rangt eða ruglingslegt" },
  { id: "annad",   nm: "Annað",             ds: "Eitthvað annað virkar ekki eins og það á að gera" },
];
const KIND_NM = Object.fromEntries(REPORT_KINDS.map((k) => [k.id, k.nm]));
export const REPORT_STATUS = [
  { id: "ny",        nm: "Ný" },
  { id: "villa",     nm: "Staðfest villa" },
  { id: "ekkivilla", nm: "Ekki villa" },
  { id: "lagad",     nm: "Lagað" },
];
const STATUS_NM = Object.fromEntries(REPORT_STATUS.map((k) => [k.id, k.nm]));

/* ---------- the snapshot ------------------------------------------------- */

/** A JSON-safe copy of a task: no functions, no DOM, bounded in size. */
export function safeCopy(x, depth = 0, seen = new WeakSet()) {
  if (x == null || typeof x === "number" || typeof x === "boolean") return x;
  if (typeof x === "string") return x.length > 600 ? x.slice(0, 600) + "…" : x;
  if (typeof x === "function" || typeof x === "symbol" || typeof x === "bigint") return undefined;
  if (typeof Node !== "undefined" && x instanceof Node) return undefined;
  if (typeof x !== "object") return undefined;
  if (seen.has(x)) return "[sama og ofar]";
  if (depth > 6) return "[…]";
  seen.add(x);
  if (x instanceof Set) x = [...x];
  if (x instanceof Map) x = Object.fromEntries(x);
  if (Array.isArray(x)) {
    const out = x.slice(0, 80).map((v) => safeCopy(v, depth + 1, seen));
    if (x.length > 80) out.push(`[… ${x.length - 80} í viðbót]`);
    return out;
  }
  const out = {};
  for (const [k, v] of Object.entries(x)) {
    if (k.startsWith("_")) continue;
    const c = safeCopy(v, depth + 1, seen);
    if (c !== undefined) out[k] = c;
  }
  return out;
}

/** What the card on screen shows and what has been chosen or typed on it. */
export function captureCard(root = typeof document !== "undefined" ? document.getElementById("task") : null) {
  if (!root) return null;
  const txt = (el) => (el ? (el.innerText || el.textContent || "").replace(/\s+\n/g, "\n").trim() : "");
  const fields = [...root.querySelectorAll("input, textarea, select")]
    .filter((el) => el.type !== "file" && el.type !== "hidden")
    .map((el) => ({ id: el.id || el.name || null, value: String(el.value || "").slice(0, 300),
      ...(el.dataset.k ? { slot: el.dataset.k } : {}) }))
    .filter((f) => f.value);
  const chosen = [...root.querySelectorAll('button[aria-pressed="true"], button.wrongpick, button.right, button.picked, .pickw.on, .pickw.picked')]
    .map((b) => ({
      text: txt(b).slice(0, 80), value: b.dataset.v ?? null,
      row: (b.closest("[data-q]") || {}).dataset?.q ?? null,
      mark: b.classList.contains("right") ? "rétt" : b.classList.contains("wrongpick") ? "valið, rangt"
        : b.getAttribute("aria-pressed") === "true" ? "valið" : "merkt",
    }));
  const verdictEl = root.querySelector("#verdict");
  return {
    text: txt(root.querySelector(".card") || root).slice(0, 5000),
    fields, chosen,
    answered: !!(verdictEl && verdictEl.querySelector(".verdict:not(.neutral)")),
    verdict: txt(verdictEl).slice(0, 2000) || null,
  };
}

/** Everything a report carries besides the child's own words. */
export function snapshot(app, which = "cur") {
  const prev = which === "prev";
  const t = prev ? app.prevTask?.task : app.cur;
  const card = prev ? app.prevTask?.card : captureCard();
  const sent = t && t.s ? { text: t.s.t || t.s.tok?.map((x) => x.w).join(" "), lvl: t.s.lvl,
    tok: (t.s.tok || []).map((x) => ({ w: x.w, l: x.l, c: x.c, m: x.m, r: x.r, k: x.k, g: x.g, u: x.u })) } : null;
  const token = t && t.t ? { w: t.t.w, l: t.t.l, c: t.t.c, m: t.t.m, r: t.t.r, k: t.t.k, g: t.t.g, u: t.t.u, index: t.i } : null;
  let view = null;
  try { view = (document.querySelector("nav.tabs [aria-selected='true']") || {}).textContent || null; } catch { /* */ }
  return {
    version: VERSION,
    when: new Date().toISOString(),
    which: prev ? "fyrri spurning" : "þessi spurning",
    view,
    task: t ? {
      type: t.type, typeId: t.typeId || null, skill: t.skill, skillName: skillName(t.skill),
      lvl: t.lvl ?? null, word: t.word || null, cell: t.cell || null,
      drill: !!t.drill, duel: !!t.duel,
      sentence: sent, token,
      expected: t.rows ? t.rows.map((r) => ({ row: r.key, label: r.label, answer: r.answer })) : undefined,
      picks: t.picks ? { ...t.picks } : undefined,
    } : null,
    card,
    raw: t ? safeCopy(t) : null,
    level: app.sess ? safeCopy(app.sess.diff) : null,
  };
}

/* ---------- where reports are kept without a server --------------------- */

function localList() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]"); } catch { return []; }
}
function localSave(list) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(list.slice(-500))); return true; } catch { return false; }
}

const store = (app) => app.server ? {
  list: () => app.server.reports(),
  set: (id, patch) => app.server.setReport(id, patch),
  remove: (id) => app.server.removeReport(id),
  send: (r) => app.server.sendReport(r),
} : {
  list: async () => localList().slice().sort((a, b) => b.at - a.at),
  set: async (id, patch) => {
    const l = localList(); const r = l.find((x) => x.id === id);
    if (r) Object.assign(r, patch, { reviewedAt: Date.now() });
    localSave(l); return { ok: true };
  },
  remove: async (id) => { localSave(localList().filter((x) => x.id !== id)); return { ok: true }; },
  send: async (r) => {
    const l = localList();
    const made = { id: Math.random().toString(36).slice(2, 12), at: Date.now(), by: "local",
      ...r, status: "ny", adminNote: "", reviewedAt: null };
    l.push(made);
    if (!localSave(l)) throw new Error("Vafrinn leyfði ekki að vista tilkynninguna.");
    return { ok: true, id: made.id };
  },
};

/* ---------- the button and the form ------------------------------------- */

export const reportButtonHTML = () =>
  `<button type="button" class="reportflag" data-report="1" title="Tilkynna villu eða undarlega setningu"
    aria-label="Tilkynna villu">🚩</button>`;

export function openReport(app) {
  const snapCur = snapshot(app, "cur");
  const hasPrev = !!(app.prevTask && app.prevTask.task);
  const preview = (s) => {
    const t = s.task;
    if (!t) return "";
    const q = t.sentence ? t.sentence.text : (s.card?.text || "").split("\n").slice(0, 3).join(" ");
    return `${esc(t.skillName || "")}${t.token ? ` · orðið <b>${esc(t.token.w)}</b>` : ""}<br>
      <span class="rpq">${esc(String(q || "").slice(0, 220))}</span>`;
  };
  const prevSnap = hasPrev ? snapshot(app, "prev") : null;
  const sheet = openSheet("Tilkynna villu", `
    <p>Takk fyrir að láta vita! Segðu með þínum eigin orðum hvað er skrítið.
      Spurningin, svarið þitt og rétta svarið fylgja sjálfkrafa með, svo umsjónarmaður geti skoðað það.</p>
    ${hasPrev ? `<div class="rpwhich" role="radiogroup" aria-label="Hvaða spurning?">
      <label><input type="radio" name="rpwhich" value="cur" checked> <span><b>Þessi spurning</b><br>${preview(snapCur)}</span></label>
      <label><input type="radio" name="rpwhich" value="prev"> <span><b>Spurningin á undan</b><br>${preview(prevSnap)}</span></label>
    </div>` : `<div class="rpwhich single"><span>${preview(snapCur)}</span></div>`}
    <div class="rpkinds" role="radiogroup" aria-label="Hvers konar villa?">
      ${REPORT_KINDS.map((k, i) => `<label class="rpkind"><input type="radio" name="rpkind" value="${k.id}" ${i === 0 ? "checked" : ""}>
        <span><b>${esc(k.nm)}</b><small>${esc(k.ds)}</small></span></label>`).join("")}
    </div>
    <label class="rplabel" for="rpnote">Hvað er að? <small>(valfrjálst en hjálpar mikið)</small></label>
    <textarea id="rpnote" rows="4" maxlength="2000" placeholder="T.d. „Mér finnst þetta eiga að vera þágufall af því að …“"></textarea>
    <div class="answer"><button type="button" class="go" id="rpsend">Senda</button>
      <button type="button" class="ghost" id="rpcancel">Hætta við</button></div>
    <p class="sub" id="rpmsg" role="status"></p>`);
  const el = sheet.el;
  el.querySelector("#rpnote").focus();
  el.querySelector("#rpcancel").onclick = () => sheet.close();
  el.querySelector("#rpsend").onclick = async () => {
    const btn = el.querySelector("#rpsend"), msg = el.querySelector("#rpmsg");
    const which = (el.querySelector('input[name="rpwhich"]:checked') || {}).value || "cur";
    const kind = (el.querySelector('input[name="rpkind"]:checked') || {}).value || "annad";
    const note = el.querySelector("#rpnote").value.trim();
    btn.disabled = true; msg.textContent = "Sendi…";
    try {
      await store(app).send({ kind, note, ctx: which === "prev" ? prevSnap : snapCur });
      el.innerHTML = `<p><b>Takk! Tilkynningin er komin til skila.</b></p>
        <p class="sub">${app.server ? "Umsjónarmaður fer yfir hana." : "Hún er geymd í þessum vafra þar til fullorðinn fer yfir hana undir Stillingar og námsefni."}</p>
        <div class="answer"><button type="button" class="go" id="rpok">Loka</button></div>`;
      el.querySelector("#rpok").onclick = () => sheet.close();
      el.querySelector("#rpok").focus();
    } catch (err) {
      btn.disabled = false;
      msg.textContent = (err && err.message) || "Tókst ekki að senda. Reyndu aftur.";
    }
  };
}

/** One click handler for every 🚩 in the document. */
export function wireReports(app) {
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-report]");
    if (!b) return;
    e.preventDefault();
    openReport(app);
  });
}

/* ---------- review --------------------------------------------------------
   The same panel for both stores: on a server it sits inside Umsjón; without
   one, in Stillingar og námsefni for whoever looks after this browser. */

const dt = (ms) => { try { return new Date(ms).toLocaleString("is-IS", { dateStyle: "short", timeStyle: "short" }); } catch { return String(ms); } };

function detailHTML(r) {
  const c = r.ctx || {};
  const t = c.task || {};
  const tokRow = (x, i) => `<tr${t.token && t.token.index === i ? ' class="on"' : ""}><td>${esc(x.w)}</td><td>${esc(x.l || "")}</td>
    <td>${esc(x.c || "")}</td><td class="mono">${esc(x.m || "")}</td><td>${esc(x.r || "")}</td><td>${esc(x.k || "")}</td></tr>`;
  return `
    ${r.note ? `<p class="rpnote">„${esc(r.note)}“</p>` : `<p class="sub faint">Engin athugasemd skrifuð.</p>`}
    <dl class="rpdl">
      <dt>Efni</dt><dd>${esc(t.skillName || t.skill || "—")} · ${esc(t.type || "")}${t.typeId && t.typeId !== t.type ? ` (${esc(t.typeId)})` : ""}${t.lvl != null ? ` · þyngd ${esc(t.lvl)}` : ""}${t.drill ? " · björgun" : ""}${t.duel ? " · einvígi" : ""}</dd>
      ${t.word ? `<dt>Orð</dt><dd>${esc(t.word)}${t.cell ? ` · <span class="mono">${esc(t.cell)}</span>` : ""}</dd>` : ""}
      ${t.sentence ? `<dt>Setning</dt><dd>${esc(t.sentence.text)}</dd>` : ""}
      ${t.expected ? `<dt>Rétt greining</dt><dd>${t.expected.map((e) => `${esc(e.label || e.row)}: <b>${esc(e.answer)}</b>${t.picks && t.picks[e.row] != null && t.picks[e.row] !== e.answer ? ` <span class="rpwrong">(svarað: ${esc(t.picks[e.row])})</span>` : ""}`).join("<br>")}</dd>` : ""}
      ${c.card?.fields?.length ? `<dt>Skrifað</dt><dd>${c.card.fields.map((f) => `${f.slot ? esc(f.slot) + ": " : ""}<b>${esc(f.value)}</b>`).join(", ")}</dd>` : ""}
      ${c.card?.chosen?.length ? `<dt>Valið / merkt</dt><dd>${c.card.chosen.map((x) => `${x.row ? esc(x.row) + ": " : ""}${esc(x.text)} <small>(${esc(x.mark)})</small>`).join("<br>")}</dd>` : ""}
      <dt>Svarað?</dt><dd>${c.card ? (c.card.answered ? "já" : "nei, tilkynnt áður en svarað var") : "—"}</dd>
      <dt>Útgáfa</dt><dd>${esc(c.version || "—")} · ${esc(c.which || "")}</dd>
    </dl>
    ${c.card?.text ? `<details><summary>Spjaldið eins og það birtist</summary><pre class="rppre">${esc(c.card.text)}</pre></details>` : ""}
    ${t.sentence?.tok?.length ? `<details><summary>Greining setningarinnar</summary><div style="overflow-x:auto"><table class="admintable rptok">
      <tr><th>Orð</th><th>Lemma</th><th>Flokkur</th><th>Mark</th><th>Hlutverk</th><th>Setning</th></tr>
      ${t.sentence.tok.map(tokRow).join("")}</table></div></details>` : ""}
    <details><summary>Öll gögn (JSON)</summary><pre class="rppre">${esc(JSON.stringify(r, null, 2))}</pre></details>`;
}

export async function renderReportsPanel(app, el) {
  if (!el) return;
  const st = store(app);
  let filter = "ny";
  let list = [];
  const draw = (msg = "") => {
    const counts = Object.fromEntries(REPORT_STATUS.map((s) => [s.id, list.filter((r) => (r.status || "ny") === s.id).length]));
    const shown = filter === "all" ? list : list.filter((r) => (r.status || "ny") === filter);
    el.innerHTML = `<h3 class="sec2">Villutilkynningar</h3>
      <p class="sub">Það sem notendur hafa merkt með 🚩. Hver tilkynning geymir spurninguna eins og forritið bjó hana til,
        svarið og athugasemdina. Ekkert breytist sjálfkrafa — þú metur hvort þetta er villa.</p>
      <div class="boardpick rpfilter">${[...REPORT_STATUS.map((s) => [s.id, `${s.nm} (${counts[s.id]})`]), ["all", `Allar (${list.length})`]]
        .map(([id, nm]) => `<button type="button" data-rpfilter="${id}" aria-pressed="${id === filter}">${esc(nm)}</button>`).join("")}
        <button type="button" class="ghost small" id="rpdownload" ${list.length ? "" : "disabled"}>Sækja allt sem JSON</button></div>
      ${msg ? `<p class="sub">${esc(msg)}</p>` : ""}
      ${shown.length ? shown.map((r) => `<details class="rpitem" data-rpid="${esc(r.id)}">
        <summary><span class="rpst st-${esc(r.status || "ny")}">${esc(STATUS_NM[r.status || "ny"] || r.status)}</span>
          <b>${esc(KIND_NM[r.kind] || r.kind)}</b>
          <span class="rpsum">${esc(((r.ctx?.task?.sentence?.text) || r.ctx?.task?.word || r.note || "").slice(0, 90))}</span>
          <span class="rpmeta">${esc(r.byName || (r.by === "local" ? "" : r.by || ""))} · ${esc(dt(r.at))}</span></summary>
        <div class="rpbody">${detailHTML(r)}
          <div class="rpactions">
            <label>Staða <select data-rpstatus>${REPORT_STATUS.map((s) =>
              `<option value="${s.id}" ${s.id === (r.status || "ny") ? "selected" : ""}>${esc(s.nm)}</option>`).join("")}</select></label>
            <input type="text" data-rpnote placeholder="Athugasemd umsjónarmanns" value="${esc(r.adminNote || "")}" maxlength="2000">
            <button type="button" class="ghost small" data-rpsave>Vista</button>
            <button type="button" class="ghost small danger" data-rpdel>Eyða</button>
          </div>
          ${r.reviewedAt ? `<p class="helpnote">Síðast metið ${esc(dt(r.reviewedAt))}${r.reviewedByName ? ` af ${esc(r.reviewedByName)}` : ""}.</p>` : ""}
        </div></details>`).join("")
        : `<p class="sub faint">${list.length ? "Engar tilkynningar í þessum flokki." : "Engar tilkynningar enn."}</p>`}`;
  };
  const load = async (msg) => {
    try { list = await st.list(); draw(msg); }
    catch (err) { el.innerHTML = `<h3 class="sec2">Villutilkynningar</h3><p class="sub">Náði ekki í tilkynningarnar${err?.message ? ": " + esc(err.message) : ""}.</p>`; }
  };
  el.onclick = async (e) => {
    const f = e.target.closest("[data-rpfilter]");
    if (f) { filter = f.dataset.rpfilter; draw(); return; }
    if (e.target.closest("#rpdownload")) {
      const blob = new Blob([JSON.stringify(list, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `fallaskoli-villutilkynningar-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      return;
    }
    const item = e.target.closest("[data-rpid]");
    if (!item) return;
    const id = item.dataset.rpid;
    if (e.target.closest("[data-rpsave]")) {
      const status = item.querySelector("[data-rpstatus]").value;
      const adminNote = item.querySelector("[data-rpnote]").value;
      try { await st.set(id, { status, adminNote }); await load("Vistað."); } catch (err) { draw(err.message || "Tókst ekki."); }
      return;
    }
    const del = e.target.closest("[data-rpdel]");
    if (del) {
      /* No confirm(): it is ignored in a frame. Ask twice on the button. */
      if (!del.dataset.armed) { del.dataset.armed = "1"; del.textContent = "Smelltu aftur til að eyða"; return; }
      try { await st.remove(id); await load("Eytt."); } catch (err) { draw(err.message || "Tókst ekki."); }
    }
  };
  await load();
}
