/* The switches themselves — one widget, used by two people: the child sets
 * `chosen` in the Stillingar og námsefni tab, the administrator sets `allowed`
 * under Umsjón on the same tab. A switch the administrator has turned off is drawn off and disabled,
 * with the reason beside it — not hidden, which would look like a bug. */

import { esc } from "./dom.js";
import { abbr } from "../core/glossary.js";
import { SKILLS } from "../core/skills.js";
import {
  QUESTION_TYPES, ATTRIBUTES, LEVELS, policyProblem, blankPolicy,
  PRESETS, applyPreset, presetOf, setPolicyFlag,
} from "../core/policy.js";

/** A switch is on unless somebody wrote `false`. */
const on = (map, key) => !map || map[key] !== false;

/* The rule for one switch lives in core/policy.js, where it can be tested
   without a page (and where the reason skills are written out is told). */
const setFlag = setPolicyFlag;
const setAttr = (policy, group, key, value) => {
  const attrs = (policy.attrs ||= {});
  const bag = (attrs[group] ||= {});
  if (value) delete bag[key]; else bag[key] = false;
  if (!Object.keys(bag).length) delete attrs[group];
};

const CEILING_NOTE = "Umsjónarmaður hefur slökkt á þessu.";
const PRESET_CAP_NOTE = "Umsjónarmaður leyfir ekki efni þessa bekkjar.";

const copyOf = (x) => JSON.parse(JSON.stringify(x));

/** The line under the year buttons: what the chosen year covers. */
function presetLine(year) {
  const p = PRESETS.find((x) => x.year === year);
  return p ? `<b>${esc(p.nm)}:</b> ${esc(p.ds)}`
    : "Enginn bekkur er valinn. Rofarnir hér fyrir neðan ráða.";
}

/** Put `saved` back into `policy` without replacing the objects inside it:
    the child's view shares them with the saved state. */
function restore(policy, saved) {
  for (const dim of ["skills", "types", "levels", "attrs"]) {
    const bag = (policy[dim] ||= {});
    for (const k of Object.keys(bag)) delete bag[k];
    Object.assign(bag, saved[dim] || {});
  }
}

/**
 * Draw the whole editor into `el`.
 *
 * @param el        the container
 * @param policy    the layer being edited — mutated in place
 * @param opts.ceiling  the layer above (null when there is none)
 * @param opts.onChange called after every accepted change
 * @param opts.intro    a line of prose at the top
 */
export function renderPolicyEditor(el, policy, {
  ceiling = null, onChange = () => {}, intro = "", showSafeVocab = false,
} = {}) {
  if (!el) return;
  const cap = ceiling || blankPolicy();

  const capOn = {
    skills: (id) => on(cap.skills, id),
    types: (id) => on(cap.types, id),
    levels: (n) => on(cap.levels, String(n)),
    attrs: (g, k) => on(cap.attrs && cap.attrs[g], k),
  };

  const row = (dim, key, label, extra, allowed) => {
    const mine = dim === "attrs" ? true : on(policy[dim], key);
    const checked = allowed && mine;
    return `<label class="polsw${allowed ? "" : " capped"}">
      <input type="checkbox" data-dim="${esc(dim)}" data-key="${esc(String(key))}"
        ${checked ? "checked" : ""} ${allowed ? "" : "disabled"}>
      <span><b>${label}</b>${extra ? `<br><small>${extra}</small>` : ""}
      ${allowed ? "" : `<br><small class="capnote">${CEILING_NOTE}</small>`}</span>
    </label>`;
  };

  const attrRow = (group, k) => {
    const allowed = capOn.attrs(group.id, k.k);
    const mine = on(policy.attrs && policy.attrs[group.id], k.k);
    const checked = allowed && mine;
    return `<label class="polsw small${allowed ? "" : " capped"}">
      <input type="checkbox" data-dim="attrs" data-group="${esc(group.id)}" data-key="${esc(k.k)}"
        ${checked ? "checked" : ""} ${allowed ? "" : "disabled"}>
      <span>${abbr(esc(k.nm), k.term)}${
        allowed ? "" : `<br><small class="capnote">${CEILING_NOTE}</small>`}</span>
    </label>`;
  };

  /* The three years (item 39). One press sets categories, types and levels
     to what the curriculum map says the year covers; the switches below show
     the result and can still be changed one by one. Under a ceiling that is
     itself a year, the years above it are drawn but cannot be chosen. */
  const now = presetOf(policy);
  const capYear = ceiling ? presetOf(cap) : null;
  const presetBtn = (p) => {
    const over = capYear != null && p.year > capYear;
    return `<button type="button" class="${p.year === now ? "go" : "ghost"}"
      data-preset="${p.year}" aria-pressed="${p.year === now}"
      title="${esc(over ? PRESET_CAP_NOTE : p.ds)}" ${over ? "disabled" : ""}>${esc(p.nm)}</button>`;
  };

  el.innerHTML = `
    ${intro ? `<p class="sub">${intro}</p>` : ""}

    <h3 class="sec2">Bekkur</h3>
    <p class="sub">Veldu bekk. Þá kviknar á því efni sem er yfirleitt kennt í þeim
      bekk og slokknar á öðru. Þú getur síðan breytt einstökum rofum hér fyrir
      neðan. Beygingaratriðin neðst breytast ekki.</p>
    <div class="polactions" id="polpresets">${PRESETS.map(presetBtn).join("")}</div>
    <p class="sub" id="polpresetnow">${presetLine(now)}</p>

    <h3 class="sec2">Flokkar</h3>
    <div class="curriculum">${SKILLS.map((s) => row("skills", s.id,
      `${s.ico} ${esc(s.nm)} <i class="curcode">${esc(s.cur)}</i>`,
      esc(s.ds), capOn.skills(s.id))).join("")}</div>

    <h3 class="sec2">Tegundir spurninga</h3>
    <div class="curriculum">${QUESTION_TYPES.map((t) => row("types", t.id,
      esc(t.nm), esc(t.ds), capOn.types(t.id))).join("")}</div>

    <h3 class="sec2">Þyngd</h3>
    <p class="sub">Þyngdin ræður lengd setninga og hversu flókin þau atriði eru sem
      spurt er um. Slökkt á þyngd 3 og upp úr heldur öllum setningum stuttum.</p>
    <div class="polgrid">${LEVELS.map((n) => row("levels", n,
      `Þyngd ${n}`, "", capOn.levels(n))).join("")}</div>

    <h3 class="sec2">Beygingaratriði</h3>
    <p class="sub">Slökktu á því sem barnið er ekki byrjað að læra. Spurning sem
      snýst um atriði sem er slökkt á birtist ekki — hvorki í eyðufyllingu,
      greiningu né beygingartöflu.</p>
    ${ATTRIBUTES.map((g) => `<div class="polgroup">
      <h4 class="polhead">${abbr(esc(g.nm), g.term)}</h4>
      <div class="polgrid">${g.keys.map((k) => attrRow(g, k)).join("")}</div>
    </div>`).join("")}

    ${showSafeVocab ? `
    <h3 class="sec2">Orðaforði</h3>
    <p class="sub">Beygingargögnin koma úr BÍN og BÍN er lýsing á íslensku eins og
      hún er — þar á meðal á orðum sem eiga ekki heima í kennslustund hjá öllum
      hópum. Þessi rofi tekur tilgreindan lista af grófum orðum, niðrandi orðum,
      fíkniefnaorðum og blótsyrðum úr umferð hjá þeim sem þakið gildir um.
      Notandinn sjálfur getur ekki slökkt á honum.</p>
    <label class="polsw">
      <input type="checkbox" id="pol-safevocab" ${policy.safeVocab !== false ? "checked" : ""}>
      <span><b>Sía út gróf orð, niðrandi orð og blótsyrði</b><br>
        <small>Sjálfgefið kveikt. Listinn er í <code>vocab_filter.py</code> og
          ferðast með gögnunum, svo hann er sýnilegur og hægt að ræða hann.</small></span>
    </label>` : ""}

    <p class="sub warn" id="polwarn"></p>`;

  const warn = el.querySelector("#polwarn");

  /* Everything is drawn again after a preset: up to sixty switches change at
     once, and one code path for drawing them is one fewer to get wrong. */
  const redraw = (message = "") => {
    renderPolicyEditor(el, policy, { ceiling, onChange, intro, showSafeVocab });
    const w = el.querySelector("#polwarn");
    if (w) w.textContent = message;
  };

  el.querySelectorAll("button[data-preset]").forEach((btn) => {
    btn.onclick = () => {
      const before = copyOf(policy);
      applyPreset(policy, Number(btn.dataset.preset));
      /* Under a ceiling a year can come out empty (the administrator allows
         only what this year switches off). Refused, like the last switch. */
      const problem = ceiling ? policyProblem(ceiling, policy) : policyProblem(policy, null);
      if (problem) { restore(policy, before); redraw(problem); return; }
      onChange();
      redraw();
    };
  });

  /* `[data-dim]` and not every checkbox: the vocabulary switch below is not one
     of the three dimensions and has no key to write. Selecting it here would
     call `setFlag(policy, undefined, undefined)` and quietly grow a policy with
     an `undefined` in it. */
  el.querySelectorAll("input[type=checkbox][data-dim]").forEach((box) => {
    box.onchange = () => {
      const { dim, key, group } = box.dataset;
      const before = copyOf(policy);
      if (dim === "attrs") setAttr(policy, group, key, box.checked);
      else setFlag(policy, dim, key, box.checked);

      /* Refuse the click that would leave nothing to ask about, rather than
         letting somebody lock a child out of their own homework and then
         wonder why the program says "ekkert efni valið". */
      const problem = ceiling
        ? policyProblem(ceiling, policy)      // the child's layer, under its cap
        : policyProblem(policy, null);        // the administrator's own layer
      if (problem) {
        /* Put back in place, not with Object.assign: in the child's settings
           `policy.skills` IS the saved `S.enabled`, and assigning a copy over
           it left the refused click standing in the state that gets saved. */
        restore(policy, before);
        box.checked = true;
        warn.textContent = problem;
        return;
      }
      warn.textContent = "";
      /* Which year the switches now add up to, if any. */
      const year = presetOf(policy);
      el.querySelectorAll("button[data-preset]").forEach((b) => {
        const mine = Number(b.dataset.preset) === year;
        b.className = mine ? "go" : "ghost";
        b.setAttribute("aria-pressed", String(mine));
      });
      const line = el.querySelector("#polpresetnow");
      if (line) line.innerHTML = presetLine(year);
      onChange();
    };
  });

  const safe = el.querySelector("#pol-safevocab");
  if (safe) safe.onchange = () => { policy.safeVocab = safe.checked; onChange(); };
}
