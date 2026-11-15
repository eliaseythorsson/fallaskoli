/* The switches themselves — one widget, used by two people: the child sets
 * `chosen` in the Stillingar og námsefni tab, the administrator sets `allowed`
 * under Umsjón on the same tab. A switch the administrator has turned off is drawn off and disabled,
 * with the reason beside it — not hidden, which would look like a bug. */

import { esc } from "./dom.js";
import { abbr } from "../core/glossary.js";
import { SKILLS } from "../core/skills.js";
import {
  QUESTION_TYPES, ATTRIBUTES, LEVELS, policyProblem, blankPolicy,
} from "../core/policy.js";

/** A switch is on unless somebody wrote `false`. */
const on = (map, key) => !map || map[key] !== false;

const setFlag = (policy, dim, key, value) => {
  const bag = (policy[dim] ||= {});
  if (value) delete bag[key]; else bag[key] = false;
};
const setAttr = (policy, group, key, value) => {
  const attrs = (policy.attrs ||= {});
  const bag = (attrs[group] ||= {});
  if (value) delete bag[key]; else bag[key] = false;
  if (!Object.keys(bag).length) delete attrs[group];
};

const CEILING_NOTE = "Umsjónarmaður hefur slökkt á þessu.";

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

  el.innerHTML = `
    ${intro ? `<p class="sub">${intro}</p>` : ""}

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
      hópum. Þessi rofi tekur stuttan, tilgreindan lista af niðrandi orðum og
      blótsyrðum úr umferð hjá þeim sem þakið gildir um. Notandinn sjálfur getur
      ekki slökkt á honum.</p>
    <label class="polsw">
      <input type="checkbox" id="pol-safevocab" ${policy.safeVocab === true ? "checked" : ""}>
      <span><b>Sía út niðrandi orð og blótsyrði</b><br>
        <small>Sjálfgefið slökkt. Listinn er í <code>vocab_filter.py</code> og
          ferðast með gögnunum, svo hann er sýnilegur og hægt að ræða hann.</small></span>
    </label>` : ""}

    <p class="sub warn" id="polwarn"></p>`;

  const warn = el.querySelector("#polwarn");

  /* `[data-dim]` and not every checkbox: the vocabulary switch below is not one
     of the three dimensions and has no key to write. Selecting it here would
     call `setFlag(policy, undefined, undefined)` and quietly grow a policy with
     an `undefined` in it. */
  el.querySelectorAll("input[type=checkbox][data-dim]").forEach((box) => {
    box.onchange = () => {
      const { dim, key, group } = box.dataset;
      const before = JSON.parse(JSON.stringify(policy));
      if (dim === "attrs") setAttr(policy, group, key, box.checked);
      else setFlag(policy, dim, key, box.checked);

      /* Refuse the click that would leave nothing to ask about, rather than
         letting somebody lock a child out of their own homework and then
         wonder why the program says "ekkert efni valið". */
      const problem = ceiling
        ? policyProblem(ceiling, policy)      // the child's layer, under its cap
        : policyProblem(policy, null);        // the administrator's own layer
      if (problem) {
        Object.assign(policy, before);
        box.checked = true;
        warn.textContent = problem;
        return;
      }
      warn.textContent = "";
      onChange();
    };
  });

  const safe = el.querySelector("#pol-safevocab");
  if (safe) safe.onchange = () => { policy.safeVocab = safe.checked; onChange(); };
}
