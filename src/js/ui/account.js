/* The login gate, "my account" and the admin page — the parts of the program
 * that are about PEOPLE rather than grammar: who may come in, who agreed to
 * it, who sees whom, and how somebody leaves. */

import { $, esc } from "./dom.js";
import { passwordProblem } from "../core/profile.js";
import { renderPolicyEditor } from "./policyui.js";
import { renderReportsPanel } from "./reports.js";
import { sanitisePolicy, blankPolicy } from "../core/policy.js";

const verdict = (text, kind = "bad") =>
  (text ? `<div class="verdict ${kind}"><p>${esc(text)}</p></div>` : "");
const day = (iso) => String(iso || "").slice(0, 10);

/** Offer a JSON object as a file. A link with `download`, not a navigation,
    so the page (and an unsaved answer) stays where it is. */
function saveFile(name, obj) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(obj)], { type: "application/json" }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* ---------- the gate ---------------------------------------------------- */

/**
 * Shown instead of a task when a server exists but nobody is logged in. Two
 * faces: logging in, and joining with an invitation.
 *
 * Joining is where consent happens, and the form is built around one question
 * — sixteen or older? — because the answer decides WHO has to agree. Under
 * sixteen, a parent or guardian types their own name; that name is what the
 * server keeps as the record of consent (docs/PRIVACY.md).
 */
export function renderLogin(app, { onDone, googleUrl, pending = false, config = null } = {}) {
  const age = (config && config.consentAge) || 16;
  const needInvite = !config || config.invite !== "optional";
  const privacy = app.server.privacyUrl();
  let mode = "login";

  const draw = (msg = "") => {
    $("task").innerHTML = mode === "login" ? `
  <div class="card">
    <p class="eyebrow"><span>Innskráning</span></p>
    ${pending ? `<p class="gloss">Beiðnin þín er komin til skila. Umsjónarmaður
       þarf að hleypa þér inn — reyndu aftur á eftir.</p>` : ""}
    <div class="loginbox">
      <label class="lbl" for="lg-user">Notandanafn</label>
      <input type="text" id="lg-user" autocomplete="username" autocapitalize="off" spellcheck="false">
      <label class="lbl" for="lg-pass">Lykilorð</label>
      <input type="password" id="lg-pass" autocomplete="current-password">
      <div class="answer" style="margin-top:12px">
        <button class="go" id="lg-in">Skrá inn</button>
        <button class="ghost" id="lg-new">${needInvite ? "Ég er með boðskóða" : "Búa til aðgang"}</button>
      </div>
      ${googleUrl ? `<p class="helpnote" style="margin-top:10px">
        eða <a href="${esc(googleUrl)}">skrá inn með Google</a></p>` : ""}
      <p class="helpnote">Gleymt lykilorð? Umsjónarmaður getur búið til nýtt.</p>
      <p class="helpnote"><a href="${esc(privacy)}" data-privacy target="_blank" rel="noopener">Persónuvernd:
        hvað er geymt og hver sér það</a></p>
      <div id="lg-note">${msg}</div>
    </div>
  </div>` : `
  <div class="card">
    <p class="eyebrow"><span>Nýr aðgangur</span></p>
    <div class="loginbox">
      <label class="lbl" for="rg-code">Boðskóði${needInvite ? "" : " (ef þú ert með hann)"}</label>
      <input type="text" id="rg-code" autocapitalize="off" spellcheck="false" autocomplete="off"
        placeholder="orð-orð-orð-123">
      <label class="lbl" for="rg-user">Notandanafn — til að skrá þig inn</label>
      <input type="text" id="rg-user" autocomplete="username" autocapitalize="off" spellcheck="false">
      <label class="lbl" for="rg-name">Gælunafn — það sem aðrir sjá ef þú vilt vera á stigatöflunni.
        Ekki nota fullt nafn.</label>
      <input type="text" id="rg-name" autocomplete="off" maxlength="24">
      <label class="lbl" for="rg-pass">Lykilorð — að minnsta kosti tíu stafir</label>
      <input type="password" id="rg-pass" autocomplete="new-password">

      <div class="consentbox">
        <label><input type="radio" name="rg-age" id="rg-over" value="over"> Ég er ${age} ára eða eldri</label>
        <label><input type="radio" name="rg-age" id="rg-under" value="under"> Ég er yngri en ${age} ára</label>
        <div id="rg-self" hidden>
          <label><input type="checkbox" id="rg-agree-self"> Ég hef lesið
            <a href="${esc(privacy)}" target="_blank" rel="noopener">persónuverndaryfirlýsinguna</a>
            og samþykki að Fallaskóli geymi það sem þar er lýst.</label>
        </div>
        <div id="rg-guardian" hidden>
          <p class="sub"><b>Foreldri eða forsjáraðili fyllir þetta út.</b></p>
          <label class="lbl" for="rg-gname">Nafn foreldris eða forsjáraðila</label>
          <input type="text" id="rg-gname" autocomplete="off" maxlength="80">
          <label><input type="checkbox" id="rg-agree-guardian"> Ég er foreldri eða forsjáraðili
            barnsins. Ég hef lesið
            <a href="${esc(privacy)}" target="_blank" rel="noopener">persónuverndaryfirlýsinguna</a>
            og samþykki að barnið noti Fallaskóla og að það sem þar er lýst sé geymt.</label>
        </div>
      </div>

      <div class="answer" style="margin-top:12px">
        <button class="go" id="rg-go">Búa til aðgang</button>
        <button class="ghost" id="rg-back">Til baka</button>
      </div>
      <p class="helpnote">Samþykkið má draga til baka hvenær sem er með því að eyða aðganginum.</p>
      <div id="lg-note">${msg}</div>
    </div>
  </div>`;
    mode === "login" ? wireLogin() : wireJoin();
  };

  const note = (text, bad = true) => { $("lg-note").innerHTML = verdict(text, bad ? "bad" : "neutral"); };

  const logIn = async (username, password) => {
    const r = await app.server.login(username, password);
    onDone?.(r.profile);
  };

  function wireLogin() {
    $("lg-in").onclick = async () => {
      const username = $("lg-user").value.trim(), password = $("lg-pass").value;
      if (!username || !password) return note("Fylltu út bæði reitina.");
      $("lg-in").disabled = true;
      try { await logIn(username, password); }
      catch (e) { note(e.message || "Innskráning tókst ekki."); }
      finally { if ($("lg-in")) $("lg-in").disabled = false; }
    };
    $("lg-new").onclick = () => { mode = "join"; draw(); };
    /* Enter submits the form once, whether the key is held or not. */
    ["lg-user", "lg-pass"].forEach((id) => {
      $(id).addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        if (!e.repeat) $("lg-in").click();
      });
    });
    $("lg-user").focus();
  }

  function wireJoin() {
    const pick = () => {
      $("rg-self").hidden = !$("rg-over").checked;
      $("rg-guardian").hidden = !$("rg-under").checked;
    };
    $("rg-over").onchange = pick; $("rg-under").onchange = pick;
    $("rg-back").onclick = () => { mode = "login"; draw(); };
    $("rg-go").onclick = async () => {
      const over16 = $("rg-over").checked, under = $("rg-under").checked;
      const form = {
        invite: $("rg-code").value.trim(),
        username: $("rg-user").value.trim(),
        name: $("rg-name").value.trim(),
        password: $("rg-pass").value,
        over16,
        guardian: under ? $("rg-gname").value.trim() : "",
        consent: over16 ? $("rg-agree-self").checked : under ? $("rg-agree-guardian").checked : false,
      };
      if (needInvite && !form.invite) return note("Það vantar boðskóðann. Umsjónarmaður lætur þig fá hann.");
      if (!form.username) return note("Veldu notandanafn.");
      const weak = passwordProblem(form.password);
      if (weak) return note(weak);
      if (!over16 && !under) return note(`Merktu við hvort þú ert ${age} ára eða eldri.`);
      if (under && form.guardian.length < 3) return note("Foreldri eða forsjáraðili þarf að skrifa nafnið sitt.");
      if (!form.consent) return note("Það þarf að haka við samþykkið.");
      $("rg-go").disabled = true;
      try {
        const r = await app.server.register(form);
        if (r && r.status === "active") return await logIn(form.username, form.password);
        mode = "login";
        draw(verdict((r && r.message) || "Beiðnin er komin. Umsjónarmaður hleypir þér inn.", "neutral"));
      } catch (e) {
        note(e.message || "Tókst ekki að búa til aðgang.");
        if ($("rg-go")) $("rg-go").disabled = false;
      }
    };
    $("rg-code").focus();
  }

  draw();
}

/* ---------- who sees me: the card at the top of Skólastofan --------------
 *
 * Nobody is on the board until they choose to be (server.mjs
 * `visibleStates`). This card is where the choice is offered, in the one
 * place it means something: looking at the board you are not on. */
export function renderShareCard(app) {
  const box = $("sharecard");
  if (!box) return;
  const p = app.profile;
  if (!app.server || !p) { box.innerHTML = ""; return; }
  if (p.review) {
    box.innerHTML = `<div class="notice">Staðan þín bíður yfirferðar umsjónarmanns og sést
      ekki á töflunni á meðan. Framvindan þín er óbreytt.</div>`;
    return;
  }
  if (p.share && p.share.board) { box.innerHTML = ""; return; }
  box.innerHTML = `<div class="sharecard">
    <b>Þú ert ekki á stigatöflunni.</b>
    <p class="sub">Enginn í hópnum sér gælunafnið þitt eða merkin þín fyrr en þú ákveður það.
      Ef þú ert með sjá hinir gælunafn, stig, XP og merki — ekkert annað. Þú getur hætt
      hvenær sem er undir <b>Stillingar → Aðgangurinn minn</b>.</p>
    <div class="answer"><button type="button" class="go" id="share-on">Vera með á töflunni</button></div>
    <div id="share-note"></div></div>`;
  $("share-on").onclick = async () => {
    $("share-on").disabled = true;
    try {
      const r = await app.server.setShare({ board: true, minutes: false });
      p.share = r.share;
      await app.save(true);          // so there is a state on the server to show
      box.innerHTML = "";
      await app.reloadSocial?.();
    } catch (e) {
      $("share-note").innerHTML = verdict(e.message);
      $("share-on").disabled = false;
    }
  };
}

/* ---------- my own account ------------------------------------------------
 *
 * The rights in the privacy notice, as controls: see it all, correct the
 * name, choose who sees what, change the password, leave. None of them goes
 * through the administrator. */
export async function renderAccount(app) {
  const box = $("account");
  if (!box) return;
  const p = app.profile;
  if (!app.server || !p) { box.innerHTML = ""; return; }

  let info = null;
  try { info = await app.server.account(); } catch { /* drawn without the extras */ }
  /* Item 17: is this account's practice counted in the anonymous tally, and
     has the group's teacher switched on the sample of wrong answers? */
  let cal = null;
  try { cal = await app.server.calibration(); } catch { /* an older server: no switch */ }
  const counting = cal && cal.on && cal.canCount;
  const counted = counting ? (cal.choice ?? cal.byDefault) : false;
  const share = p.share || { board: false, minutes: false };
  const byPassword = p.provider !== "google";
  const months = info && info.retention ? info.retention.inactiveMonths : 18;
  const consent = info && info.consent
    ? (info.consent.by === "self" ? "Þú samþykktir aðganginn sjálf(ur)"
      : `Samþykkt af: ${esc(info.consent.by)}`) + ` · ${esc(day(info.consent.at))}`
    : "";

  box.innerHTML = `<h2 class="sec">Aðgangurinn minn</h2>
    <p class="sub">Innskráð(ur) sem <b>${esc(p.username)}</b>${p.groupName ? ` · hópur: ${esc(p.groupName)}` : ""}.
      ${consent ? consent + ". " : ""}<a href="${esc(app.server.privacyUrl())}" data-privacy target="_blank"
      rel="noopener">Persónuvernd: hvað er geymt og hver sér það</a></p>
    ${info && info.teachers && info.teachers.length ? `<p class="sub">${info.teachers.length === 1
      ? `<b>${esc(info.teachers[0])}</b> er kennari eða forsjáraðili hópsins þíns og sér`
      : `<b>${info.teachers.map(esc).join(", ")}</b> eru kennarar eða forsjáraðilar hópsins þíns og sjá`}
      hvernig þér gengur í villumynstrum og verkefnum, til að geta hjálpað þér. Ekkert sem þú skrifar
      í svörin sést, því það er aldrei geymt.</p>` : ""}

    <div class="setrow">
      <label for="ac-name">Gælunafn — það sem aðrir sjá. Ekki nota fullt nafn.</label>
      <div class="answer">
        <input type="text" id="ac-name" maxlength="24" value="${esc(p.name || "")}" style="flex:0 1 260px;font-size:16px">
        <button class="ghost" id="ac-name-save">Vista gælunafn</button>
      </div>
    </div>

    <div class="filters">
      <label><input type="checkbox" id="ac-board"${share.board ? " checked" : ""}> Sýna mig á stigatöflunni og hjá
        bekkjarfélögum í hópnum mínum (gælunafn, stig, XP, merki og titill)</label>
      <label><input type="checkbox" id="ac-minutes"${share.minutes ? " checked" : ""}${share.board ? "" : " disabled"}>
        Sýna líka hve margar mínútur ég hef æft mig</label>
    </div>

    ${counting ? `<div class="filters">
      <label><input type="checkbox" id="ac-stats"${counted ? " checked" : ""}> Telja svörin mín með í
        nafnlausri talningu</label>
      <p class="helpnote">Fallaskóli telur hve oft hverri gerð spurninga er svarað rétt og rangt og notar
        tölurnar til að stilla þyngd spurninganna sjálfkrafa. Aðeins er talið hvort svarið var rétt eða
        rangt — ekki hvað þú skrifaðir og ekki hver svaraði.</p>
      ${cal.samples ? `<p class="helpnote" id="ac-samples"><b>Kennari hópsins þíns hefur kveikt á sýni af röngum
        svörum.</b> Þegar þú skrifar ranga beygingarmynd getur orðið sem þú skrifaðir verið geymt — án
        nafns, svo enginn sér hver skrifaði það. Sýnið er aðeins notað til að prófa hvort villugreiningin
        flokkar villur rétt. Ef þú tekur hakið af hér að ofan er ekkert geymt frá þér.</p>` : ""}
    </div>` : ""}

    ${byPassword ? `<div class="setrow">
      <label for="ac-pw-old">Skipta um lykilorð</label>
      <div class="answer">
        <input type="password" id="ac-pw-old" autocomplete="current-password" placeholder="Núverandi lykilorð" class="pwin">
        <input type="password" id="ac-pw-new" autocomplete="new-password" placeholder="Nýtt lykilorð, minnst 10 stafir" class="pwin">
        <button class="ghost" id="ac-pw-save">Vista lykilorð</button>
      </div>
    </div>` : ""}

    <div class="answer">
      <a class="ghost filelabel" href="${esc(app.server.exportUrl())}" download>Sækja gögnin mín</a>
      <button class="ghost" id="ac-logout">Skrá út</button>
    </div>
    <p class="helpnote">Skráin inniheldur allt sem Fallaskóli geymir um þig. Aðgangi sem enginn skráir sig
      inn á í ${months} mánuði er eytt sjálfkrafa.</p>

    ${info && info.canDelete === false ? "" : `<div class="setrow">
      <label for="ac-del-proof">Eyða aðganginum</label>
      <p class="sub">Eyðir aðganginum, framvindunni, merkjunum og öllu öðru sem er geymt um þig.
        Þetta er ekki hægt að taka til baka.</p>
      <div class="answer">
        <input type="${byPassword ? "password" : "text"}" id="ac-del-proof" class="pwin" autocomplete="off"
          placeholder="${byPassword ? "Lykilorðið þitt" : "Notandanafnið þitt"}">
        <button class="ghost danger" id="ac-del">Eyða aðganginum mínum</button>
      </div>
    </div>`}
    <div id="ac-note"></div>`;

  const note = (text, kind = "bad") => { $("ac-note").innerHTML = verdict(text, kind); };

  $("ac-name-save").onclick = async () => {
    try {
      const r = await app.server.setName($("ac-name").value.trim());
      p.name = r.profile.name;
      app.S.profile.name = p.name;
      note("Gælunafnið er vistað.", "good");
      app.refresh();
      app.reloadSocial?.();
    } catch (e) { note(e.message); }
  };

  const saveShare = async () => {
    const board = $("ac-board").checked;
    $("ac-minutes").disabled = !board;
    if (!board) $("ac-minutes").checked = false;
    try {
      const r = await app.server.setShare({ board, minutes: $("ac-minutes").checked });
      p.share = r.share;
      if (board) await app.save(true);
      note(board ? "Þú sést núna á stigatöflunni í hópnum þínum."
        : "Þú sést ekki lengur á stigatöflunni.", "good");
      app.reloadSocial?.();
    } catch (e) { note(e.message); }
  };
  $("ac-board").onchange = saveShare;
  $("ac-minutes").onchange = saveShare;

  const stats = $("ac-stats");
  if (stats) stats.onchange = async () => {
    try {
      const r = await app.server.setStats(stats.checked);
      /* Takes effect at once: nothing more is sent this visit if it is off. */
      if (app.calInfo) app.calInfo.collect = !!r.collect;
      if (!r.collect) { app.calQueue.length = 0; app.calSamples.length = 0; }
      note(stats.checked ? "Svörin þín eru talin með, án nafns." : "Svörin þín eru ekki lengur talin með.", "good");
    } catch (e) { stats.checked = !stats.checked; note(e.message); }
  };

  if (byPassword) {
    $("ac-pw-save").onclick = async () => {
      const weak = passwordProblem($("ac-pw-new").value);
      if (weak) return note(weak);
      try {
        await app.server.setPassword($("ac-pw-old").value, $("ac-pw-new").value);
        $("ac-pw-old").value = ""; $("ac-pw-new").value = "";
        note("Lykilorðinu er breytt. Önnur tæki þurfa að skrá sig inn aftur.", "good");
      } catch (e) { note(e.message); }
    };
  }

  $("ac-logout").onclick = async () => {
    await app.save(true);
    await app.server.logout().catch(() => {});
    location.reload();
  };

  /* No `confirm()` (it is ignored in a frame); the button asks twice. */
  const del = $("ac-del");
  if (del) {
    let armed = null;
    del.onclick = async () => {
      const proof = $("ac-del-proof").value;
      if (!proof) return note(byPassword ? "Skrifaðu lykilorðið þitt til að staðfesta."
        : "Skrifaðu notandanafnið þitt til að staðfesta.");
      if (!armed) {
        del.textContent = "Ertu viss? Smelltu aftur til að eyða öllu";
        armed = setTimeout(() => { armed = null; del.textContent = "Eyða aðganginum mínum"; }, 6000);
        return;
      }
      clearTimeout(armed); armed = null;
      try {
        await app.server.deleteAccount(byPassword ? { password: proof } : { username: proof });
        location.reload();
      } catch (e) {
        del.textContent = "Eyða aðganginum mínum";
        note(e.message);
      }
    };
  }
}

/* ---------- administration ---------------------------------------------- */

const STATUS_TEXT = { active: "opinn", pending: "bíður", blocked: "lokaður" };
const ROLE_TEXT = { learner: "nemandi", guardian: "forsjáraðili", admin: "umsjón" };

export async function renderAdmin(app) {
  const box = $("admin");
  if (!box) return;
  if (!app.server || !app.rights?.canAdminUsers) { box.innerHTML = ""; return; }

  box.innerHTML = `<h2 class="sec">Umsjón</h2>
    <p class="sub">Aðeins umsjónarmaður sér þennan hluta.</p>
    <div id="admin-warn"></div>
    <div id="admin-users" class="adminbox"></div>
    <div id="admin-invites" class="adminbox"></div>
    <div id="admin-groups" class="adminbox"></div>
    <div id="admin-policy" class="adminbox"></div>
    <div id="admin-dataset" class="adminbox"></div>
    <div id="admin-backup" class="adminbox"></div>
    <div id="admin-reports" class="adminbox"></div>
    <div id="admin-calibration" class="adminbox"></div>
    <div id="admin-audit" class="adminbox"></div>`;

  app.server.config().then((c) => {
    if (c && !c.privacyReady && $("admin-warn")) {
      $("admin-warn").innerHTML = verdict("Persónuverndaryfirlýsingin er ómerkt. Settu "
        + "FALLASKOLI_CONTROLLER og FALLASKOLI_CONTACT á þjóninum áður en nokkrum er hleypt inn "
        + "(sjá docs/HOSTING.md).");
    }
  });

  await Promise.all([usersPanel(app), invitesPanel(app), groupsPanel(app),
    policyPanel(app), datasetPanel(app), backupPanel(app), auditPanel(app),
    calibrationPanel(app), renderReportsPanel(app, $("admin-reports"))]);
}

/* --- what each child is allowed to meet ---------------------------------
 * The same widget as the child's own switches (ui/policyui.js), editing two
 * levels: the default ceiling for everybody, and a ceiling for one child that
 * replaces the default ("Nota sjálfgefið" hands them back). The child's own
 * choices are never edited from here (core/policy.js). */
async function policyPanel(app) {
  const el = $("admin-policy");
  if (!el) return;
  let users = [];
  try { users = await app.server.users(); } catch { /* the list is optional */ }

  let target = "";            // "" = the default for everybody
  let policy = blankPolicy();
  let dirty = false;

  const load = async () => {
    const got = target
      ? await app.server.userPolicy(target)
      : await app.server.defaultPolicy();
    policy = sanitisePolicy(got && got.policy);
    dirty = false;
    return got;
  };

  const draw = (meta, msg = "") => {
    const who = users.find((u) => u.id === target);
    el.innerHTML = `<h3 class="sec2">Hvað má hver sjá</h3>
      <p class="sub">Þetta er þakið. Innan þess velur notandinn sjálfur í
        flipanum Stillingar — hann getur slökkt á fleiru en aldrei kveikt á
        því sem er slökkt hér.</p>
      <div class="polactions">
        <select class="poluser" id="pol-who">
          <option value="">Sjálfgefið fyrir alla</option>
          ${users.filter((u) => u.status === "active").map((u) =>
            `<option value="${esc(u.id)}"${u.id === target ? " selected" : ""}>${
              esc(u.name || u.username)}</option>`).join("")}
        </select>
        <button class="go" id="pol-save" disabled>Vista</button>
        ${target ? `<button class="ghost" id="pol-clear">Nota sjálfgefið</button>` : ""}
        <span class="sub">${who
          ? (meta && meta.own ? "Eigin þak" : "Notar sjálfgefna þakið")
          : "Gildir um alla sem hafa ekki eigið þak"}</span>
      </div>
      <div id="pol-editor"></div>
      <div id="pol-note">${msg}</div>`;

    renderPolicyEditor($("pol-editor"), policy, {
      ceiling: null,
      showSafeVocab: true,
      onChange: () => { dirty = true; $("pol-save").disabled = false; },
    });

    $("pol-who").onchange = async (e) => {
      /* Unsaved changes are saved first rather than asked about: a hosted
         page may not open a dialog. */
      if (dirty) await $("pol-save").onclick();
      target = e.target.value;
      draw(await load());
    };
    $("pol-save").onclick = async () => {
      $("pol-save").disabled = true;
      try {
        if (target) await app.server.setUserPolicy(target, policy);
        else await app.server.setDefaultPolicy(policy);
        dirty = false;
        $("pol-note").innerHTML = `<div class="verdict good"><p>Vistað. Þakið tekur
          gildi hjá notandanum næst þegar hann opnar forritið.</p></div>`;
      } catch (err) {
        $("pol-save").disabled = false;
        $("pol-note").innerHTML = `<div class="verdict bad"><p>${esc(err.message)}</p></div>`;
      }
    };
    const clear = $("pol-clear");
    if (clear) clear.onclick = async () => {
      await app.server.setUserPolicy(target, null);
      draw(await load(), `<div class="verdict good"><p>Notandinn fer aftur á
        sjálfgefna þakið.</p></div>`);
    };
  };

  try { draw(await load()); }
  catch { el.innerHTML = `<p class="sub">Náði ekki í stillingarnar.</p>`; }
}

/* --- the data set: one button, one status ---
 * Reports what is actually answering definitions: an uploaded file if there
 * is one, otherwise the dictionary bundled into the built file, and "ekkert
 * gagnasafn er uppsett" only when there is neither. */

async function datasetPanel(app) {
  const el = $("admin-dataset");

  /* What the built file itself carries. Read through the same object the
     renderer reads, not out of the bundle directly, so a future source appears
     here without this file being told about it. */
  const built = (() => {
    try {
      const c = app.defs && app.defs.coverage ? app.defs.coverage(app.lex) : null;
      return c && c.have > 0 ? c : null;
    } catch { return null; }
  })();

  const builtLine = built
    ? `Innbyggt í forritið: <b>${built.have.toLocaleString("is-IS")}</b> skýringar
       af ${built.total.toLocaleString("is-IS")} orðum
       (${(100 * built.pct).toFixed(1).replace(".", ",")}%), settar inn með
       <code>./build.sh</code>. Ekki þarf að hlaða neinu upp.`
    : "Ekkert gagnasafn er uppsett. Forritið notar handskrifaðar skýringar á meðan.";

  const draw = (status, msg = "") => {
    const done = status?.uploaded;
    el.innerHTML = `<h3 class="sec2">Gagnasafn (orðskýringar)</h3>
      <p class="sub">${done
        ? `Uppsett hér á þjóninum: <b>${esc(status.name || "gagnasafn")}</b> —
           ${status.count.toLocaleString("is-IS")} skýringar,
           ${esc(String(status.at || "").slice(0, 10))}, heimild ${esc(status.source || "?")}.
           ${built ? "Það gengur framar innbyggða safninu." : ""}`
        : builtLine}</p>
      <div class="answer">
        <label class="go filelabel" for="ds-file">${done ? "Skipta um skrá"
          : built ? "Hlaða upp skrá samt" : "Hlaða upp skrá"}</label>
        <input type="file" id="ds-file" accept="application/json,.json" hidden>
      </div>
      <p class="helpnote">Ein skrá, einu sinni. Forritið sendir aldrei beiðni á
        hvert orð — skýringarnar koma héðan eftir það. Skrá sem er hlaðið upp
        hér gildir fyrir alla notendur þjónsins og gengur framar því safni sem
        fylgir forritinu; það er leiðin til að uppfæra orðabókina án þess að
        byggja forritið upp á nýtt.</p>
      <div id="ds-note">${msg}</div>`;

    $("ds-file").onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      $("ds-note").innerHTML = `<p class="sub">Les skrána…</p>`;
      try {
        const parsed = JSON.parse(await file.text());
        const payload = parsed.entries ? parsed : { entries: parsed };
        payload.name = payload.name || file.name;
        const next = await app.server.putDataset(payload);
        draw(next, `<div class="verdict good"><p>Komið inn:
          ${next.count.toLocaleString("is-IS")} skýringar.</p></div>`);
        /* Any explanations already on screen are stale the moment this happens. */
        app.refreshDefinitions?.();
      } catch (err) {
        $("ds-note").innerHTML =
          `<div class="verdict bad"><p>${esc(err.message || "Tókst ekki að lesa skrána.")}</p></div>`;
      }
    };
  };

  try { draw(await app.server.datasetStatus()); }
  catch { el.innerHTML = `<p class="sub">Náði ekki í stöðu gagnasafnsins.</p>`; }
}

/* --- users ----------------------------------------------------------------
 * One row per person, and behind "Meira" everything that can be done to an
 * account: record who consented, move it to another group, change its role,
 * hand out a new password, fetch everything held about it, erase it. */

async function usersPanel(app) {
  const el = $("admin-users");
  let hidden = [], groups = [], open = null, flash = "";
  const soon = (() => { const d = new Date(); d.setDate(d.getDate() + 60); return d.toISOString().slice(0, 10); })();

  const groupName = (id) => (groups.find((g) => g.id === id) || {}).name || id;
  const groupOptions = (sel) => groups.map((g) =>
    `<option value="${esc(g.id)}"${g.id === sel ? " selected" : ""}>${esc(g.name)}</option>`).join("");

  const detail = (u, isMe, hid) => `<tr class="adminmore"><td colspan="4">
    <div class="morerow"><b>Samþykki</b>
      ${u.role !== "learner" ? `<span class="sub">Á ekki við um þetta hlutverk.</span>`
        : u.consent ? `<span class="sub">${u.consent.by === "self" ? "Notandinn sjálfur (16 ára eða eldri)"
            : "Forsjáraðili: " + esc(u.consent.by)} · ${esc(day(u.consent.at))}</span>`
        : `<span class="sub">Ekkert skráð. Aðgangurinn opnast ekki fyrr en þetta er skráð.</span>`}
      ${u.role === "learner" ? `<span class="moreform">
        <label><input type="checkbox" data-f="over16"> 16 ára eða eldri</label>
        <input type="text" data-f="guardian" placeholder="eða nafn foreldris/forsjáraðila" maxlength="80">
        <button class="ghost" data-act="consent" data-id="${esc(u.id)}">Skrá samþykki</button></span>` : ""}
    </div>
    <div class="morerow"><b>Hópur</b>
      <select data-act="group" data-id="${esc(u.id)}">${groupOptions(u.group)}</select>
      <b>Hlutverk</b>
      <select data-act="role" data-id="${esc(u.id)}"${isMe ? " disabled" : ""}>${
        Object.entries(ROLE_TEXT).map(([id, nm]) =>
          `<option value="${id}"${u.role === id ? " selected" : ""}>${nm}</option>`).join("")}</select>
    </div>
    <div class="morerow adminacts">
      <button class="ghost" data-act="board" data-id="${esc(u.id)}">${hid ? "Leyfa á stigatöflu" : "Taka af stigatöflu"}</button>
      ${u.provider === "password" ? `<button class="ghost" data-act="password" data-id="${esc(u.id)}">Nýtt lykilorð</button>` : ""}
      <a class="ghost filelabel" href="${esc(app.server.userExportUrl(u.id))}" download>Sækja gögn</a>
      ${u.review ? `<button class="ghost" data-act="review" data-id="${esc(u.id)}">Ljúka yfirferð</button>` : ""}
      ${isMe ? "" : `<button class="ghost danger" data-act="erase" data-id="${esc(u.id)}">Eyða alveg</button>`}
    </div>
    <p class="helpnote">${u.share && u.share.board ? "Notandinn hefur valið að sjást á stigatöflunni."
      : "Notandinn hefur ekki valið að sjást á stigatöflunni — og það getur enginn valið fyrir hann."}
      ${u.lastSeen ? ` Síðast inni ${esc(u.lastSeen)}.` : ""}${u.expires ? ` Ónotaður aðgangur eyðist ${esc(u.expires)}.` : ""}</p>
  </td></tr>`;

  const draw = (users) => {
    const rows = users.map((u) => {
      const isMe = u.id === app.profile?.id;
      const hid = hidden.includes(u.id);
      const flags = [
        u.needsConsent ? `<span class="pill pill-pending">samþykki vantar</span>` : "",
        u.review ? `<span class="pill pill-pending" title="${esc(u.review.why)}">í yfirferð</span>` : "",
        u.expires && u.expires <= soon ? `<span class="pill">eyðist ${esc(u.expires)}</span>` : "",
        hid ? `<span class="pill">tekinn af töflu</span>` : "",
      ].join(" ");
      return `<tr>
        <td><b>${esc(u.name || u.username)}</b>${isMe ? " <span class=\"sub\">(þú)</span>" : ""}
            <div class="sub">${esc(u.username)} · ${esc(groupName(u.group))}</div>
            ${flags ? `<div class="pillrow">${flags}</div>` : ""}
            ${u.review && open === u.id ? `<div class="sub">Ástæða: ${esc(u.review.why)}</div>` : ""}</td>
        <td><span class="pill pill-${esc(u.status)}">${esc(STATUS_TEXT[u.status] || u.status)}</span></td>
        <td>${esc(ROLE_TEXT[u.role] || u.role)}</td>
        <td class="adminacts">
          ${u.status !== "active" ? `<button class="ghost" data-act="open" data-id="${esc(u.id)}">Hleypa inn</button>` : ""}
          ${u.status === "active" && !isMe ? `<button class="ghost" data-act="block" data-id="${esc(u.id)}">Útiloka</button>` : ""}
          <button class="ghost" data-act="more" data-id="${esc(u.id)}">${open === u.id ? "Loka" : "Meira"}</button>
        </td></tr>${open === u.id ? detail(u, isMe, hid) : ""}`;
    }).join("");

    el.innerHTML = `<h3 class="sec2">Notendur</h3>
      <p class="sub">Nýir notendur koma inn með boðskóða (hér fyrir neðan) eða þú býrð þá til.
        Að útiloka tekur ekkert af framvindunni; að eyða tekur allt.</p>
      <div style="overflow-x:auto"><table class="admintable">
        <tr><th>Nafn</th><th>Staða</th><th>Hlutverk</th><th></th></tr>${rows}</table></div>
      <div id="au-note">${flash}</div>
      <details class="adminnew" id="au-new"><summary>Nýr notandi</summary>
        <div class="loginbox">
          <label class="lbl" for="nu-user">Notandanafn</label>
          <input type="text" id="nu-user" autocapitalize="off" spellcheck="false" autocomplete="off">
          <label class="lbl" for="nu-name">Gælunafn (ekki fullt nafn)</label>
          <input type="text" id="nu-name" maxlength="24" autocomplete="off">
          <label class="lbl" for="nu-group">Hópur</label>
          <select id="nu-group">${groupOptions("default")}</select>
          <label class="lbl" for="nu-role">Hlutverk</label>
          <select id="nu-role"><option value="learner">nemandi</option>
            <option value="guardian">forsjáraðili eða kennari (stillir námsefni, sér villumynstur og setur verkefni í sínum hópi)</option></select>
          <div class="consentbox" id="nu-consent">
            <label><input type="checkbox" id="nu-over"> Notandinn er 16 ára eða eldri og samþykkir sjálfur</label>
            <label class="lbl" for="nu-guardian">Annars: nafn foreldris eða forsjáraðila sem samþykkti</label>
            <input type="text" id="nu-guardian" maxlength="80" autocomplete="off">
          </div>
          <div class="answer" style="margin-top:12px"><button class="go" id="nu-go">Búa til aðgang</button></div>
          <p class="helpnote">Lykilorðið er búið til sjálfkrafa og birtist einu sinni.</p>
          <div id="nu-note"></div>
        </div></details>`;
    flash = "";

    const say = (html) => { $("au-note").innerHTML = html; };
    const reload = async () => draw(await app.server.users());

    el.querySelectorAll("select[data-act]").forEach((sel) => {
      sel.onchange = async () => {
        try { await app.server.setUser(sel.dataset.id, { [sel.dataset.act]: sel.value }); await reload(); }
        catch (e) { say(verdict(e.message)); }
      };
    });

    el.querySelectorAll("button[data-act]").forEach((b) => {
      let armed = null;
      b.onclick = async () => {
        const id = b.dataset.id, act = b.dataset.act;
        if (act === "more") { open = open === id ? null : id; return draw(users); }
        if (act === "erase" && !armed) {
          b.textContent = "Ertu viss? Smelltu aftur";
          armed = setTimeout(() => { armed = null; b.textContent = "Eyða alveg"; }, 6000);
          return;
        }
        b.disabled = true;
        try {
          if (act === "board") {
            hidden = hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id];
            await app.server.setHiddenBoard(hidden);
          } else if (act === "open" || act === "block") {
            await app.server.setUser(id, { status: act === "open" ? "active" : "blocked" });
          } else if (act === "consent") {
            const row = b.closest(".moreform");
            await app.server.setUser(id, { consent: {
              over16: row.querySelector("[data-f=over16]").checked,
              guardian: row.querySelector("[data-f=guardian]").value.trim(),
            } });
            flash = verdict("Samþykkið er skráð.", "good");
          } else if (act === "review") {
            await app.server.setUser(id, { review: false });
          } else if (act === "password") {
            const r = await app.server.resetPassword(id);
            flash = `<div class="verdict good"><p>Nýtt lykilorð: <code class="secret">${esc(r.password)}</code>
              — skrifaðu það niður, það birtist ekki aftur. Notandinn var skráður út alls staðar.</p></div>`;
          } else if (act === "erase") {
            clearTimeout(armed);
            await app.server.removeUser(id);
            open = null;
            flash = verdict("Aðganginum og öllu sem honum fylgdi er eytt.", "good");
          }
          await reload();
        } catch (e) {
          if (act === "open") open = id;
          flash = verdict(e.message);
          await reload().catch(() => say(flash));
        }
      };
    });

    const role = $("nu-role");
    role.onchange = () => { $("nu-consent").hidden = role.value !== "learner"; };
    $("nu-go").onclick = async () => {
      try {
        const r = await app.server.createUser({
          username: $("nu-user").value.trim(), name: $("nu-name").value.trim(),
          group: $("nu-group").value, role: role.value,
          over16: $("nu-over").checked, guardian: $("nu-guardian").value.trim(),
        });
        flash = `<div class="verdict good"><p>Aðgangur til: <b>${esc(r.user.username)}</b>.
          Lykilorð: <code class="secret">${esc(r.password)}</code> — skrifaðu það niður, það birtist
          ekki aftur.</p></div>`;
        await reload();
      } catch (e) { $("nu-note").innerHTML = verdict(e.message); }
    };
  };

  try {
    [hidden, groups] = await Promise.all([
      app.server.hiddenBoard().then((r) => r.hidden || []).catch(() => []),
      app.server.groups().catch(() => []),
    ]);
    draw(await app.server.users());
  } catch { el.innerHTML = `<p class="sub">Náði ekki í notendalistann.</p>`; }
}

/* --- invitations: how a family gets in --- */

async function invitesPanel(app) {
  const el = $("admin-invites");
  const draw = async (msg = "") => {
    const [list, groups] = await Promise.all([app.server.invites(), app.server.groups()]);
    const gname = (id) => (groups.find((g) => g.id === id) || {}).name || id;
    const live = list.filter((i) => i.live);
    el.innerHTML = `<h3 class="sec2">Boðskóðar</h3>
      <p class="sub">Svona kemst fjölskylda inn: þú býrð til kóða og lætur <b>foreldrið</b> fá hann.
        Á innskráningarsíðunni er valið „Ég er með boðskóða“. Sá sem er yngri en 16 ára kemst ekki
        lengra nema foreldri eða forsjáraðili skrifi nafnið sitt og samþykki — það nafn er geymt sem
        staðfesting á samþykkinu.</p>
      ${live.length ? `<div style="overflow-x:auto"><table class="admintable">
        <tr><th>Kóði</th><th>Hópur</th><th>Fyrir</th><th>Notað</th><th>Gildir til</th><th></th></tr>
        ${live.map((i) => `<tr><td><code class="secret">${esc(i.code)}</code></td><td>${esc(gname(i.group))}</td>
          <td>${esc(i.note)}</td><td>${i.uses} af ${i.max}</td><td>${esc(day(i.exp))}</td>
          <td><button class="ghost" data-id="${esc(i.id)}">Afturkalla</button></td></tr>`).join("")}
        </table></div>` : `<p class="sub faint">Enginn virkur boðskóði.</p>`}
      <div class="polactions">
        <select id="iv-group" aria-label="Hópur">${groups.map((g) =>
          `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join("")}</select>
        <input type="text" id="iv-note" placeholder="Fyrir hvern? (t.d. fjölskyldan á nr. 12)" maxlength="60" class="pwin">
        <label class="sub">aðgangar <input type="text" id="iv-max" value="2" inputmode="numeric" class="numin"></label>
        <label class="sub">dagar <input type="text" id="iv-days" value="14" inputmode="numeric" class="numin"></label>
        <button class="go" id="iv-go">Búa til boðskóða</button>
      </div>
      <div id="iv-note2">${msg}</div>`;
    el.querySelectorAll("button[data-id]").forEach((b) => {
      b.onclick = async () => { await app.server.removeInvite(b.dataset.id).catch(() => {}); draw(); };
    });
    $("iv-go").onclick = async () => {
      try {
        const r = await app.server.createInvite({
          group: $("iv-group").value, note: $("iv-note").value.trim(),
          max: $("iv-max").value, days: $("iv-days").value,
        });
        draw(`<div class="verdict good"><p>Nýr boðskóði: <code class="secret">${esc(r.invite.code)}</code></p></div>`);
      } catch (e) { $("iv-note2").innerHTML = verdict(e.message); }
    };
  };
  try { await draw(); } catch { el.innerHTML = `<p class="sub">Náði ekki í boðskóðana.</p>`; }
}

/* --- groups: who can see whom --- */

async function groupsPanel(app) {
  const el = $("admin-groups");
  const draw = async (msg = "") => {
    const groups = await app.server.groups();
    el.innerHTML = `<h3 class="sec2">Hópar</h3>
      <p class="sub">Hópur er þeir sem sjá hver annan: fjölskylda, bekkur, vinahópur. Stigataflan og
        bekkjarfélagarnir ná aldrei út fyrir hópinn. Notandi er færður milli hópa undir „Meira“ hér að ofan.</p>
      <div class="chips">${groups.map((g) => `<span class="groupchip"><b>${esc(g.name)}</b>
        <i>${g.users}</i>${g.id !== "default" && !g.users
          ? ` <button class="ghost" data-id="${esc(g.id)}">Eyða</button>` : ""}</span>`).join("")}</div>
      <div class="polactions">
        <input type="text" id="gr-name" placeholder="Heiti á nýjum hópi" maxlength="40" class="pwin">
        <button class="go" id="gr-go">Búa til hóp</button>
      </div>
      <div id="gr-note">${msg}</div>`;
    el.querySelectorAll("button[data-id]").forEach((b) => {
      b.onclick = async () => {
        try { await app.server.removeGroup(b.dataset.id); draw(); }
        catch (e) { $("gr-note").innerHTML = verdict(e.message); }
      };
    });
    $("gr-go").onclick = async () => {
      try {
        await app.server.createGroup($("gr-name").value.trim());
        await draw(verdict("Hópurinn er til.", "good"));
        usersPanel(app); invitesPanel(app);
      } catch (e) { $("gr-note").innerHTML = verdict(e.message); }
    };
  };
  try { await draw(); } catch { el.innerHTML = `<p class="sub">Náði ekki í hópana.</p>`; }
}

/* --- the backup: one encrypted file --- */

async function backupPanel(app) {
  const el = $("admin-backup");
  el.innerHTML = `<h3 class="sec2">Öryggisafrit</h3>
    <p class="sub">Ein skrá með öllu: notendum, framvindu og stillingum. Hún er dulkóðuð með
      lykilsetningu sem þú velur hér og er hvergi geymd — án hennar er ekki hægt að opna skrána,
      og það er ekki hægt að endurheimta hana ef hún gleymist. Geymdu skrána annars staðar en á þjóninum.</p>
    <div class="polactions">
      <input type="password" id="bk-pass" placeholder="Lykilsetning, minnst 12 stafir" autocomplete="new-password" class="pwin">
      <button class="go" id="bk-go">Sækja dulkóðað afrit</button>
    </div>
    <p class="helpnote">Afritið er lesið inn aftur með <code>node server/backup.mjs lesa</code> (sjá docs/HOSTING.md).
      Eyddu afritum sem eru eldri en 30 daga: þau innihalda líka þá sem hafa látið eyða aðganginum sínum.</p>
    <div id="bk-note"></div>`;
  $("bk-go").onclick = async () => {
    $("bk-go").disabled = true;
    try {
      const envelope = await app.server.backup($("bk-pass").value);
      saveFile(`fallaskoli-afrit-${day(envelope.at)}.json`, envelope);
      $("bk-pass").value = "";
      $("bk-note").innerHTML = verdict("Afritið er komið. Geymdu lykilsetninguna á öðrum stað en skrána.", "good");
    } catch (e) { $("bk-note").innerHTML = verdict(e.message); }
    $("bk-go").disabled = false;
  };
}

/* --- calibration and the classifier check (items 17 and 38) -------------
 * A record, not a task: the server counts, adjusts and checks by itself
 * (server/calibrate.mjs). This panel shows what it did and when, for whoever
 * wants to know — nothing on it waits for a decision. */

const num = (x) => String(x).replace(".", ",").replace("-", "−");
const CAL_KIND = { type: "spurningagerð", cell: "reitur", irr: "óreglustig" };

/** One change of a run, as a line: what moved, from what to what. */
export function calChangeText(c) {
  const what = c.k === "type" ? `${c.id}, þyngd ${c.band}` : c.id;
  return `${CAL_KIND[c.k] || c.k} ${what}: ${num(c.from)} → ${num(c.to)}`;
}

/** The panel's HTML from the server's report (GET /admin/calibration). */
export function calibrationHTML(r, samplesUrl = "") {
  if (!r.on) {
    return `<p class="sub">Slökkt er á sjálfvirkri kvörðun á þessum þjóni (FALLASKOLI_CALIBRATION=0).
      Ekkert er talið og allir nota innbyggðu gildin.</p>`;
  }
  const t = r.table || { types: {}, cells: {}, irr: {} };
  const moved = Object.values(t.types || {}).reduce((n, b) => n + Object.keys(b).length, 0);
  const c = r.classifier || { kept: 0, byPattern: [] };
  const pct = (x) => num(Math.round(x * 1000) / 10) + " %";
  return `<p class="sub">Þjónninn telur nafnlaust hve oft spurningum er svarað rétt og rangt, reiknar
      einu sinni á ${r.periodDays} daga fresti hve erfiðar þær reynast og stillir þyngdina eftir því —
      lítið í einu og aldrei langt frá innbyggðu gildunum. <b>Hér þarf ekkert að gera</b>; þetta er skrá
      yfir það sem gerðist.</p>
    <p class="sub">Síðasta keyrsla: <b>${r.lastRun ? esc(day(r.lastRun)) : "engin enn"}</b>${
      r.nextRun ? ` · næsta: ${esc(day(r.nextRun))}` : ""} · talin svör núna: ${r.totals.questions}
      spurningar og ${r.totals.records} reitir.<br>
      Taflan sem er í gildi færir ${moved} spurningagerð(ir), ${Object.keys(t.cells || {}).length} reit(i)
      og ${Object.keys(t.irr || {}).length} óreglustig frá innbyggðu gildunum.
      Ekkert breytist fyrr en minnst ${r.minPupils} nemendur hafa lagt til svör.${
      r.strict ? " Aðeins þeir sem samþykktu nýjustu persónuverndaryfirlýsinguna eru taldir með." : ""}</p>
    ${r.log.length ? `<div style="overflow-x:auto"><table class="admintable">
      <tr><th>Keyrsla</th><th>Virkir nemendur</th><th>Ný svör</th><th>Hvað breyttist</th></tr>
      ${r.log.map((e) => `<tr><td class="mono">${esc(day(e.at))}</td><td>${e.pupils}</td><td>${e.questions}</td>
        <td>${e.changes.length ? e.changes.map((x) => esc(calChangeText(x))).join("<br>")
          : `<span class="faint">${e.note ? esc(e.note) : "ekkert"}</span>`}</td></tr>`).join("")}
      </table></div>` : `<p class="sub faint">Engin keyrsla enn.</p>`}

    <h3 class="sec2">Villugreiningin borin saman við raunveruleg svör</h3>
    <p class="sub">Kennari hóps getur kveikt á nafnlausu sýni af röngum beygingarmyndum (sjálfgefið slökkt;
      kveikt í ${c.groupsOn || 0} hóp(um)${r.samplesOn ? "" : " — en slökkt á þjóninum með FALLASKOLI_SAMPLES=0"}).
      Hvert svar í sýninu er borið saman við allar beygingarmyndir orðsins og kannað hvort flokkun
      villugreiningarinnar stenst. Í sýninu eru <b>${c.kept}</b> svör (mest ${c.cap}).</p>
    ${c.kept ? `<div style="overflow-x:auto"><table class="admintable">
      <tr><th>Villumynstur</th><th>Svör</th><th>Ósammála</th><th>Hlutfall</th><th>Tvíræð</th></tr>
      ${c.byPattern.map((x) => `<tr><td>${esc(x.name)}</td><td>${x.n}</td><td>${x.disagree}</td>
        <td>${pct(x.rate)}</td><td>${x.ambiguous}</td></tr>`).join("")}
      <tr><th>Alls</th><th>${c.n}</th><th>${c.disagree}</th><th>${pct(c.rate)}</th><th>${c.ambiguous}</th></tr>
      </table></div>
      <p class="helpnote"><b>Ósammála</b>: villugreiningin nefndi mynstur sem samanburðurinn við
        beygingarmyndir orðsins styður ekki — oftast af því að svarið er næstum því önnur beygingarmynd
        orðsins en var lesið sem röng ending. <b>Tvíræð</b>: myndin sem var skrifuð getur átt við fleiri en
        einn reit, svo flokkunin var ein af fleiri mögulegum. <b>Ógreint</b>: villugreiningin kunni ekki
        að flokka svarið.</p>
      <div class="answer">
        <a class="ghost filelabel" href="${esc(samplesUrl)}" download>Sækja sýnið (fyrir prófanir)</a>
        <button class="ghost danger" id="cal-clear">Eyða sýninu</button>
      </div>` : ""}
    <div id="cal-note"></div>`;
}

async function calibrationPanel(app) {
  const el = $("admin-calibration");
  el.innerHTML = `<details id="ad-cal"><summary>Sjálfvirk kvörðun og villugreining</summary>
    <div id="ad-cal-body"></div></details>`;
  const draw = async () => {
    try {
      const r = await app.server.calibrationReport();
      $("ad-cal-body").innerHTML = calibrationHTML(r, app.server.samplesUrl());
    } catch { $("ad-cal-body").innerHTML = `<p class="sub">Náði ekki í skrána.</p>`; return; }
    const clear = $("cal-clear");
    if (!clear) return;
    /* No `confirm()` (ignored in a frame): the button asks twice. */
    let armed = null;
    clear.onclick = async () => {
      if (!armed) {
        clear.textContent = "Ertu viss? Smelltu aftur";
        armed = setTimeout(() => { armed = null; clear.textContent = "Eyða sýninu"; }, 6000);
        return;
      }
      clearTimeout(armed);
      try { await app.server.clearSamples(); await draw(); }
      catch (e) { $("cal-note").innerHTML = verdict(e.message); }
    };
  };
  $("ad-cal").addEventListener("toggle", () => { if ($("ad-cal").open) draw(); });
}

/* --- the trail: who did what --- */

async function auditPanel(app) {
  const el = $("admin-audit");
  el.innerHTML = `<details id="ad-trail"><summary>Atburðaskrá</summary><div id="ad-list"></div></details>`;
  $("ad-trail").addEventListener("toggle", async () => {
    if (!$("ad-trail").open) return;
    try {
      const [list, users] = await Promise.all([app.server.audit(), app.server.users()]);
      const who = (id) => (id === "kerfi" ? "kerfið"
        : (users.find((u) => u.id === id) || {}).username || "(eyddur aðgangur)");
      $("ad-list").innerHTML = list.length ? `<div style="overflow-x:auto"><table class="admintable">
        <tr><th>Hvenær</th><th>Hver</th><th>Hvað</th><th>Um hvern</th></tr>
        ${list.slice(0, 80).map((a) => `<tr><td class="mono">${esc(String(a.at).slice(0, 16).replace("T", " "))}</td>
          <td>${esc(who(a.by))}</td><td>${esc(a.act)}${a.note ? ` <span class="sub">— ${esc(a.note)}</span>` : ""}</td>
          <td>${a.target ? esc(who(a.target)) : ""}</td></tr>`).join("")}</table></div>
        <p class="helpnote">Skráin geymir auðkenni, ekki nöfn: þegar aðgangi er eytt hverfur nafnið líka héðan.</p>`
        : `<p class="sub faint">Ekkert skráð enn.</p>`;
    } catch { $("ad-list").innerHTML = `<p class="sub">Náði ekki í skrána.</p>`; }
  });
}
