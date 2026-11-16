/* The badge cabinet, the classroom, the settings and the folded data notes. */

import { BADGES, ACTIVE_BADGES, META_IDS } from "../core/badges.js";
import { rarityOf, wordRarity, shareText, measurable, tierMove, TIERS,
         MIN_USERS, MIN_DAYS } from "../core/rarity.js";
import { METRICS } from "../core/leaderboard.js";
import { overallLevel, overallRank, levelBand } from "../core/progress.js";
import { showcaseOf, togglePin, titleOf, titlesOf, titleText, medalOf, medalByTier,
         holders, windowed, compare, feed, weekXp, weekKey, SHOWCASE_MAX } from "../core/social.js";
import { weekGains, MEND_POINTS, MEND_RUN, REVIEWS_PER_DAY } from "../core/mending.js";
import { crestOf } from "../core/profile.js";
import { renderClassGoal } from "./classgoal.js";
import { ALL_CLASSES } from "../core/marks.js";
import { collectionByClass } from "../core/collection.js";
import { vocabScore, weakWords, HEALTH, DRILL, STATUS_LABEL } from "../core/wordhealth.js";
import { $, esc, keypadOn, keypadEnv } from "./dom.js";
import { renderPolicyEditor } from "./policyui.js";
import { holidayName } from "../core/calendar.js";
import { weekGoalOf } from "../core/state.js";
import { LICENSES } from "../../../data/licenses.js";

/* ---------- dates on badges --------------------------------------------- */

const MONTHS = ["jan.", "feb.", "mars", "apríl", "maí", "júní", "júlí",
                "ágúst", "sept.", "okt.", "nóv.", "des."];

/** "3. apríl 2026" — Icelandic format, independent of the browser locale. */
function isDate(key) {
  const [y, m, d] = String(key).split("-").map(Number);
  if (!y || !m || !d) return key;
  return `${d}. ${MONTHS[m - 1]} ${y}`;
}

/* The calendar already exists (core/calendar.js computes Easter and the
   movable feasts), so a badge won on a red-letter day can say so. That is
   exactly the occasion a child remembers. */
function dayLabel(key) {
  const [y, m, d] = String(key).split("-").map(Number);
  const nm = holidayName(new Date(y, m - 1, d));
  return isDate(key) + (nm ? ` · ${nm}` : "");
}

/** Every date, newest first, as hover text. */
function datesTitle(rec) {
  const dates = [...new Set(rec.dates || [])].sort().reverse();
  if (!dates.length) return "";
  const head = dates.length === 1
    ? "Unnið " + dayLabel(dates[0])
    : `Unnið ${rec.n}× — síðast ${dayLabel(dates[0])}`;
  const rest = dates.slice(0, 24).map((d) => "  • " + dayLabel(d)).join("\n");
  const more = dates.length > 24 ? `\n  … og ${dates.length - 24} fleiri` : "";
  const first = rec.first && rec.first !== dates[0]
    ? `\nFyrst unnið ${dayLabel(rec.first)}` : "";
  return `${head}${first}\n\nAllar dagsetningar:\n${rest}${more}`;
}

/* ---------- badges ------------------------------------------------------ */

const GROUPS = [
  /* The two meta badges come first on purpose: they are not hidden and should
     be visible from day one so the child knows they exist. */
  ["yfir", "Það sem allt endar í"],
  ["fyrst", "Fyrstu skrefin"],
  /* Item 56: what pays for getting better, high on the page on purpose. */
  ["framfarir", "Framfarir"],
  ["röð", "Réttar í röð"],
  ["dagar", "Dagar og þrautseigja"],
  ["safn", "Samtals"],
  ["safnari", "Orðasafnarinn"],
  ["heilsa", "Orðaheilsa"],
  ["björgun", "Björgun orða"],
  ["lesefni", "Lesefni"],
  ["einvígi", "Einvígi"],
  ["þemu", "Orðasett og þemu"],
  ["spakmæli", "Spakmæli í safninu"],
  ["stig", "Stig"],
  ["atvik", "Sérstök afrek"],
  ["lota", "Heimsóknir"],
  ["fjölvirkni", "Fjölvirkni"],
  ["saman", "Með öðrum"],
  ["jól", "Jólasveinarnir þrettán"],
  ["leyni", "Leynimerki"],
];

/* ---------- rarity -------------------------------------------------------
   Measured rarity arrives from the server (`app.badgeStats`); estimated rarity
   is computed from the badge itself (core/rarity.js) and exists from day one.
   An estimate is marked with `~` and "áætlað" in the hover text. The chip is
   filled with the tier's colour and names the tier and the share. */

/** `#1E7A57` -> `rgba(30,122,87,.13)`. The wash behind a tile of that tier. */
function wash(hex, alpha) {
  const h = String(hex).replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** The three custom properties a tier paints an element with. */
function tierVars(tier, alpha = 0.13) {
  return `--rar:${tier.col};--rar-ink:${tier.ink};--rar-wash:${wash(tier.col, alpha)}`;
}

function rarityChip(stats, b) {
  const r = rarityOf(stats, b.id, b);
  if (!r) return "";
  const move = tierMove(stats && stats.previous, stats, b.id, b);
  const title = r.estimated
    ? `Áætluð sjaldgæfni — ${shareText(r.share)} notenda er búist við að vinni þetta merki. `
      + `Mælingin tekur við þegar ${MIN_USERS} notendur hafa notað vefinn í ${MIN_DAYS} daga hver.`
    /* The raw count first, because it is the fact; the blended figure second,
       because it is the estimate built on it. Nothing is hidden behind the
       arithmetic — see the note above `rarityOf` in core/rarity.js. */
    : `${r.holders} af ${r.users} notendum hafa þetta merki. Sýnd tala (${shareText(r.share)}) `
      + `blandar þeirri mælingu við upphaflegu ágiskunina, því ${r.users} notendur duga `
      + `ekki til að greina á milli sjaldgæfs og mjög sjaldgæfs. Eftir því sem notendum `
      + `fjölgar víkur ágiskunin: mælingin vegur nú ${Math.round(100 * r.weight)}%.`
      + (move ? ` ${move.rarer ? "Varð sjaldgæfara" : "Varð algengara"} síðan í `
                + `${monthName(stats.previous.month)}: ${move.from.nm} → ${move.to.nm}.` : "");
  /* An arrow only when the badge has moved from one category to another since
     last month's snapshot. A share drifting inside its own tier is noise, and an
     arrow on every badge every month would mean nothing. */
  const arrow = move ? `<i class="rarmove">${move.rarer ? "↑" : "↓"}</i>` : "";
  return `<span class="rar${r.estimated ? " est" : ""}" title="${esc(title)}">${
    r.tier.ico} ${esc(r.tier.nm)} · ${r.estimated ? "~" : ""}${shareText(r.share)}${arrow}</span>`;
}

const MONTHNAMES = ["janúar", "febrúar", "mars", "apríl", "maí", "júní", "júlí",
                    "ágúst", "september", "október", "nóvember", "desember"];
const monthName = (key) => {
  const [y, m] = String(key || "").split("-").map(Number);
  return m ? `${MONTHNAMES[m - 1]} ${y}` : "síðasta mánuði";
};

/** The rarity of one badge as a sortable number. Rarest = smallest. */
const shareOf = (stats, b) => {
  const r = rarityOf(stats, b.id, b);
  return r ? r.share : 1;
};

/** One badge tile. Used by both views and by the "other" grid in the roster. */
function badgeTile(S, stats, b, { compact = false } = {}) {
  const rec = S.badges[b.id];
  const dates = rec ? [...new Set(rec.dates || [])].sort().reverse() : [];
  const last = rec ? (rec.last || dates[0]) : null;
  const r = rarityOf(stats, b.id, b);
  return `<div class="badge ${rec ? "earned" : "locked"}${
    META_IDS.includes(b.id) ? " meta" : ""}${compact ? " compact" : ""}"${
    r ? ` style="${tierVars(r.tier, rec ? 0.13 : 0.05)}"` : ""}${
    rec && dates.length ? ` title="${esc(datesTitle(rec))}" tabindex="0"` : ""}>
    <div class="ico">${rec ? b.ico : "🔒"}</div>
    <div class="nm">${esc(b.nm)}</div>
    <div class="ds">${esc(b.ds)}</div>
    ${last ? `<div class="bdate">${esc(isDate(last))}</div>` : ""}
    ${rarityChip(stats, b)}
    ${rec && rec.n > 1 ? timesChip(rec.n) : ""}
    ${rec ? pinButton(S, b) : ""}
  </div>`;
}

/* A badge won many times wears a medal: bronze at 3, silver at 10, gold at 25
   (core/social.js `MEDALS`). The count stays beside it. */
function timesChip(n) {
  const m = medalOf(n);
  return `<span class="times${m ? " medal m" + m.tier : ""}"${
    m ? ` title="Unnið ${n} sinnum — ${m.nm}"` : ""}>${m ? m.ico + " " : ""}×${n}</span>`;
}

/* The pin puts a badge on the shelf other people see beside the name. */
function pinButton(S, b) {
  const sc = showcaseOf(S);
  const on = !sc.auto && sc.ids.includes(b.id);
  return `<button type="button" class="pin" data-pin="${esc(b.id)}" aria-pressed="${on}"
    title="${on ? "Taka af sýningarhillunni" : "Setja á sýningarhilluna — þetta sjá aðrir við nafnið þitt"}"
    aria-label="${on ? "Taka af sýningarhillunni" : "Setja á sýningarhilluna"}: ${esc(b.nm)}">📌</button>`;
}

/* ---------- "Merkin þín": two views of the same shelf --------------------
 * "Eftir flokkum" answers "what is there and what have I still to get", so it
 * shows locked badges too. "Eftir sjaldgæfni" is the trophy shelf: only what
 * has been won, rarest tier first, with how many of each tier exist. The
 * choice is remembered in the settings. */
const VIEWS = [["rarity", "Eftir sjaldgæfni"], ["group", "Eftir flokkum"]];

export function renderBadges(app) {
  const S = app.S;
  /* Counted against the badges that can still be won; a retired badge the
     child already owns stays on the shelf but is not part of "af N". */
  const owned = ACTIVE_BADGES.filter((b) => S.badges[b.id]).length;
  const secretsFound = ACTIVE_BADGES.filter((b) => b.group === "leyni" && S.badges[b.id]).length;
  const secretsTotal = ACTIVE_BADGES.filter((b) => b.group === "leyni").length;
  const stats = app.badgeStats || null;
  const view = S.settings.badgeView === "group" ? "group" : "rarity";

  $("badgesub").innerHTML =
    `${owned} af ${ACTIVE_BADGES.length} merkjum unnin. Flest merki eru falin þar til þau vinnast — ` +
    `stig, dagaraðir, fjölvirkni og yfirmerkin tvö sjást fyrirfram svo þú vitir að hverju er stefnt. ` +
    `Merki sem þú vinnur oft fær verðlaunapening: 🥉 við 3, 🥈 við 10 og 🥇 við 25. ` +
    `<b>Leynimerki fundin: ${secretsFound} af ${secretsTotal}.</b>` +
    (measurable(stats)
      ? ` Sjaldgæfni er <b>mæld</b> úr ${stats.qualified} notendum sem hafa notað vefinn í ${MIN_DAYS} daga eða lengur.`
        + refreshLine(stats)
      : ` <span class="faint">Sjaldgæfnin sem sést er <b>áætluð</b> (merkt með ~) og byggir á því hve erfitt`
        + ` skilyrðið er. Hún víkur fyrir mældri tölu þegar ${MIN_USERS} notendur hafa notað vefinn`
        + ` í ${MIN_DAYS} daga hver`
        + (stats && stats.users ? ` — þeir eru ${stats.qualified ?? 0} af ${stats.users} núna` : "")
        + `.</span>`);

  $("badgeviews").innerHTML = VIEWS.map(([id, nm]) =>
    `<button type="button" data-bview="${id}" aria-pressed="${id === view}">${esc(nm)}</button>`).join("");
  $("badgeviews").onclick = (e) => {
    const b = e.target.closest("button[data-bview]");
    if (!b) return;
    S.settings.badgeView = b.dataset.bview;
    app.save(true);
    renderBadges(app);
  };

  $("badgegrid").innerHTML =
    view === "rarity" ? rarityViewHTML(S, stats) : groupViewHTML(S, stats);

  $("badgegrid").onclick = (e) => {
    const pin = e.target.closest("button[data-pin]");
    if (!pin) return;
    if (!togglePin(S, pin.dataset.pin)) {
      pin.classList.add("full");
      pin.title = `Hillan er full — taktu eitt af þremur merkjum niður fyrst.`;
      return;
    }
    app.save(true);
    renderBadges(app);
  };
  renderMyCard(app);
  renderCollection(app);
}

/** Skólastofan: the board and the people. Drawn when that tab is opened and
    again when the server's picture arrives (app.js `redrawOpenView`). */
export function renderClass(app) {
  renderClassGoal(app);               // item 59: ui/classgoal.js
  renderLeaderboard(app);
  renderRoster(app);
}

/** When the measured picture last moved, and when it will next be recorded. */
function refreshLine(stats) {
  if (!stats || !stats.month) return "";
  const next = stats.nextRefresh ? new Date(stats.nextRefresh) : null;
  return ` <span class="faint">Talan er reiknuð upp á nýtt í hvert sinn sem þú opnar`
    + ` forritið, líka fyrir merki sem þú átt þegar. Staðan er skráð einu sinni í mánuði`
    + (stats.previous ? ` — síðast í ${monthName(stats.previous.month)}, og ör við merki`
        + ` sýnir hvort það hefur færst milli flokka síðan` : "")
    + (next ? `. Næsta skráning ${next.getDate()}. ${MONTHNAMES[next.getMonth()]}` : "")
    + `.</span>`;
}

function groupViewHTML(S, stats) {
  return GROUPS.map(([g, title]) => {
    /* A retired badge appears only on the shelf of someone who won it. */
    const list = BADGES.filter((b) => b.group === g && (!b.retired || S.badges[b.id]));
    if (!list.length) return "";
    const live = list.filter((b) => !b.retired);
    const got = live.filter((b) => S.badges[b.id]);
    const shown = list.filter((b) => S.badges[b.id] || !b.hidden);
    const mystery = list.length - shown.length;
    return `<h3 class="bgroup">${esc(title)} <i>${got.length}/${live.length}</i></h3>
      <div class="badgegrid inner">` + shown.map((b) => badgeTile(S, stats, b)).join("") +
      (mystery ? `<div class="badge mystery">
        <div class="ico">❔</div><div class="nm">${mystery} ${mystery === 1 ? "falið merki" : "falin merki"}</div>
        <div class="ds">${g === "leyni"
          ? "Þessi koma óvænt. Haltu áfram að æfa þig á ólíkum tímum."
          : "Þau birtast þegar þú vinnur þau."}</div></div>` : "") + `</div>`;
  }).join("");
}

function rarityViewHTML(S, stats) {
  const mine = BADGES.filter((b) => S.badges[b.id]);
  /* An empty shelf is not worth looking at, and this is the very first thing a
     new child opens. Show the catalogue instead until there is something to be
     proud of; the switch above still says which view is selected. */
  if (!mine.length) {
    return `<p class="sub faint">Þú átt ekkert merki enn, svo hér stendur listinn á meðan.
      Um leið og fyrsta merkið kemur stendur það efst — og eftir því sem sjaldgæfari merki
      bætast við færast þau fremst í röðina.</p>` + groupViewHTML(S, stats);
  }
  /* Rarest tier first, and inside a tier the rarest badge first, so the single
     thing the child is proudest of sits in the top left corner. */
  const order = [...TIERS].reverse();
  return order.map((tier) => {
    const inTier = mine
      .filter((b) => (rarityOf(stats, b.id, b) || {}).tier?.id === tier.id)
      .sort((a, b) => shareOf(stats, a) - shareOf(stats, b));
    if (!inTier.length) return "";
    const total = ACTIVE_BADGES.filter((b) => (rarityOf(stats, b.id, b) || {}).tier?.id === tier.id).length;
    return `<h3 class="bgroup tiergroup" style="${tierVars(tier, 0.13)}">
        <span class="tierdot">${tier.ico}</span>${esc(tier.nm)}
        <i>${inTier.length} af ${total}</i></h3>
      <div class="badgegrid inner">${inTier.map((b) => badgeTile(S, stats, b)).join("")}</div>`;
  }).join("") + `<p class="sub faint">Aðeins unnin merki sjást hér — þetta er hillan, ekki
    listinn. Skiptu yfir í <b>Eftir flokkum</b> til að sjá hvað er eftir.</p>`;
}

/* ---------- who you are to other people ---------------------------------
 *
 * One function draws a name everywhere a name appears — the card at the top of
 * the tab, the leaderboard, the roster, the comparison — so the frame, the
 * title and the shelf cannot differ between two places on one screen.
 *
 * `u` is a roster or leaderboard row: { name, level, crest, crown, title,
 * showcase }. Everything in it is an id or a number; the words come from this
 * program (core/social.js `titleText`). */

const knows = (S, b) => !b.secret || !!S.badges[b.id];

/** What a badge says on somebody else's shelf. A badge that is still hidden
    from you keeps its condition to itself: you see that it exists, what it is
    called and how many people here have it — not how it is won. */
function whisper(S, b, held, people) {
  if (knows(S, b)) return `${b.nm} — ${b.ds}`;
  const n = held && held[b.id];
  return `${b.nm} — ??? Þetta er leynimerki sem þú hefur ekki fundið. ` +
    `Skilyrðið birtist þegar þú vinnur það.` +
    (n && people ? ` ${n} af ${people} hér ${n === 1 ? "hefur" : "hafa"} fundið það.` : "");
}

function shelfHTML(S, ids, held, people) {
  const list = (ids || []).map((id) => BADGES.find((b) => b.id === id)).filter(Boolean);
  if (!list.length) return "";
  return `<span class="shelf">${list.map((b) =>
    `<span class="shelfico${knows(S, b) ? "" : " rumour"}" title="${esc(whisper(S, b, held, people))}">${b.ico}</span>`
  ).join("")}</span>`;
}

function whoHTML(u, { tag = "" } = {}) {
  const band = levelBand(u.level || 1);
  const title = titleText(u.title) || overallRank(u.level || 1);
  return `<span class="who ${band.id}${u.crest ? " legendary" : ""}" title="Rammi: ${esc(band.nm)} (stig ${u.level ?? 1})">${
    u.crown ? "👑 " : ""}${esc(u.name || "Nafnlaus")}</span>${tag}
    <span class="whotitle">${esc(title)}</span>`;
}

/** The row this state would be on the roster — the same shape the server sends,
    built locally so the card works from a file with no server at all. */
function selfRow(app) {
  const S = app.S, cr = crestOf(S);
  return {
    profile: app.profile ? app.profile.id : "local",
    name: (app.profile && app.profile.name) || S.profile.name || "Þú",
    level: Math.max(S.bestLevel || 1, overallLevel(S.xp).level),
    crest: cr.crest, crown: cr.crown,
    title: titleOf(S), showcase: showcaseOf(S).ids,
    badgeIds: Object.keys(S.badges),
  };
}

/* ---------- "Spjaldið þitt": the card other people see ------------------- */

export function renderMyCard(app) {
  const box = $("mycard");
  if (!box) return;
  const S = app.S, me = selfRow(app), sc = showcaseOf(S);
  const titles = titlesOf(S), cur = titleOf(S);
  const slots = Array.from({ length: SHOWCASE_MAX }, (_, i) => {
    const b = BADGES.find((x) => x.id === sc.ids[i]);
    return b
      ? `<div class="slot filled" title="${esc(b.nm + " — " + b.ds)}"><span class="ico">${b.ico}</span><span class="nm">${esc(b.nm)}</span></div>`
      : `<div class="slot"><span class="ico">＋</span><span class="nm">laust pláss</span></div>`;
  }).join("");
  const next = levelBand(me.level);
  box.innerHTML = `<div class="mycard ${next.id}">
    <div class="mystrip"><b>Fallaskóli</b><span>nemendaskírteini</span></div>
    <div class="myhead">
      <div class="myname">${whoHTML(me)}</div>
      <div class="mymeta">Stig ${me.level} · rammi: ${esc(next.nm)} · ${weekXp(S).toLocaleString("is-IS")} XP í þessari viku</div>
    </div>
    <div class="slots">${slots}</div>
    <div class="myrow">
      <label for="titlepick">Titill</label>
      <select id="titlepick" class="poluser">${titles.map((t) =>
        `<option value="${esc(t.id)}"${t.id === cur ? " selected" : ""}>${esc(t.nm)}</option>`).join("")}</select>
      <span class="sub">${sc.auto
        ? (sc.ids.length ? "Hillan sýnir þrjú sjaldgæfustu merkin þín. Ýttu á 📌 á merki til að velja sjálf(ur)."
                         : "Hillan fyllist þegar fyrstu merkin koma.")
        : `Þú valdir ${sc.ids.length} af ${SHOWCASE_MAX}. Ýttu aftur á 📌 til að taka merki niður.`}</span>
    </div>
    <p class="sub faint">Svona sjá aðrir þig í skólastofunni: nafn, titill og þrjú merki.
      Nýir titlar opnast með hverju stigi — og með leynimerkjum, sem lána nafnið sitt.</p>
  </div>`;
  $("titlepick").onchange = (e) => {
    S.title = e.target.value;
    app.save(true);
    renderBadges(app);
  };
}

/* ---------- other people's badges -----------------------------------------
 * Rarest first, ten shown and the rest behind a door, as before. New in v6.1:
 * a hidden badge is a RUMOUR here (name and icon, no condition), each person
 * has their shelf and title in the head, "Bera saman" lays two cabinets side
 * by side, and the top of the section says what was found this week. */
const ROSTER_SHOWN = 10;

export function renderRoster(app) {
  const box = $("roster");
  if (!box) return;
  const rows = app.roster || [];
  if (!rows.length) {
    box.innerHTML = `<div class="emptyroom"><b>Hér situr enginn nema þú.</b>
      <p class="sub">Þegar fleiri eru komnir á þjóninn sérðu hér hvaða merki þeir hafa
      unnið — líka þau sem eru enn hulin fyrir þér. Sjaldgæfustu merkin standa fremst.</p></div>`;
    return;
  }
  const S = app.S;
  const stats = app.badgeStats || null;
  const me = app.profile ? app.profile.id : null;
  const held = holders(rows), people = rows.length;
  const mine = Object.keys(S.badges);
  const ctx = { S, stats, held, people };

  box.innerHTML = feedHTML(app, rows, ctx) + rows.map((u, ui) => {
    const ids = u.badgeIds || [];
    /* Rarest first — the scarce thing is what is worth seeing. */
    const all = ids.map((id) => BADGES.find((b) => b.id === id)).filter(Boolean)
      .sort((a, b) => shareOf(stats, a) - shareOf(stats, b));
    const shown = all.length > ROSTER_SHOWN ? all.slice(0, ROSTER_SHOWN) : all;
    const rest = all.slice(shown.length);
    const common = rest.filter((b) => {
      const t = (rarityOf(stats, b.id, b) || {}).tier;
      return t && (t.id === "algengt" || t.id === "oalgengt");
    }).length;
    const rumours = all.filter((b) => !knows(S, b)).length;
    const isMe = u.profile === me;
    return `<div class="rosteruser${isMe ? " me" : ""}">
      <div class="rosterhead">
        <span class="rosterwho">${whoHTML(u, { tag: isMe ? ' <i class="youtag">þú</i>' : "" })}
          ${shelfHTML(S, u.showcase, held, people)}</span>
        <span class="collcount">${all.length} merki · stig ${u.level ?? "—"}${
          rumours ? ` · <b class="rumourcount" title="Leynimerki sem þú hefur ekki fundið enn">${rumours} leyndarmál</b>` : ""}</span>
      </div>
      <div class="chips rosterchips">${shown.map((b) => rosterChip(ctx, b, u)).join("")}
        ${rest.length ? otherChip(ctx, rest, common, ui, u) : ""}</div>
      ${isMe ? "" : `<button type="button" class="ghost cmpbtn" data-cmp="${ui}"
        aria-expanded="false">Bera saman við mig</button>
        <div class="cmp" id="cmp-${ui}" hidden></div>`}
    </div>`;
  }).join("");

  box.querySelectorAll(".otherbadges").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.closest(".othergrid")) return;
      const open = el.classList.contains("open");
      box.querySelectorAll(".otherbadges.open").forEach((x) => x.classList.remove("open"));
      if (!open) el.classList.add("open");
    });
  });
  box.querySelectorAll("button[data-cmp]").forEach((btn) => {
    btn.onclick = () => {
      const u = rows[+btn.dataset.cmp];
      const pane = $("cmp-" + btn.dataset.cmp);
      const open = pane.hidden;
      pane.hidden = !open;
      btn.setAttribute("aria-expanded", String(open));
      if (open) pane.innerHTML = compareHTML(ctx, mine, u);
    };
  });
}

function rosterChip(ctx, b, u = null) {
  const { S, stats, held, people } = ctx;
  const r = rarityOf(stats, b.id, b);
  const known = knows(S, b);
  const medal = u && u.tiers ? medalByTier(u.tiers[b.id]) : null;
  const first = !!u && (u.firstIds || []).includes(b.id);
  const title = whisper(S, b, held, people) +
    (r ? `\n${r.tier.nm} · ${r.estimated ? "~" : ""}${shareText(r.share)}${r.estimated ? " (áætlað)" : ""}` : "") +
    (first ? `\n★ Fyrst(ur) hér til að finna þetta merki` : "") +
    (medal ? `\n${medal.ico} Unnið oft — ${medal.nm}` : "");
  return `<span class="chip badgechip rarchip${r && r.estimated ? " est" : ""}${known ? "" : " rumour"}"${
    r ? ` style="${tierVars(r.tier, 0.22)}"` : ""} title="${esc(title)}">${b.ico} ${esc(b.nm)}${
    known ? "" : ' <i class="q">???</i>'}${first ? ' <i class="firstmark">★</i>' : ""}${
    medal ? ` <i class="medalmark">${medal.ico}</i>` : ""}</span>`;
}

/** The eleventh "badge": a door onto all the others. */
function otherChip(ctx, rest, common, ui, u) {
  const breakdown = common === rest.length
    ? `${common} algeng og óalgeng merki`
    : `${rest.length} merki til viðbótar — þar af ${common} algeng eða óalgeng`;
  return `<span class="chip badgechip otherbadges" tabindex="0" role="button"
      aria-label="${esc(breakdown)}" title="${esc(breakdown)}">
    ▦ og ${rest.length} í viðbót<i>${common}</i>
    <span class="othergrid" id="othergrid-${ui}">
      <span class="otherhead">${esc(breakdown)}</span>
      <span class="othergridin">${rest.map((b) => rosterChip(ctx, b, u)).join("")}</span>
    </span>
  </span>`;
}

/* "Nýtt í þessari viku": what people found since Monday, rarest first. The
   server sends ids for the week and nothing finer — which day, and what time,
   is the finder's own business. */
function feedHTML(app, rows, ctx) {
  const me = app.profile ? app.profile.id : null;
  const items = feed(rows, me).slice(0, 12);
  if (!items.length) {
    return `<div class="feed empty"><b>Nýtt í þessari viku</b>
      <span class="sub">Enginn hefur fundið nýtt merki síðan á mánudag. Sá fyrsti stendur hér.</span></div>`;
  }
  return `<div class="feed"><b>Nýtt í þessari viku</b>
    <ul>${items.map((it) => {
      const b = BADGES.find((x) => x.id === it.id);
      const known = knows(ctx.S, b);
      return `<li${it.mine ? ' class="mine"' : ""} title="${esc(whisper(ctx.S, b, ctx.held, ctx.people))}">
        <span class="feedwho">${esc(it.mine ? "Þú" : (it.name || "Nafnlaus"))}</span>
        ${it.mine ? "fannst" : "fann"} <span class="feedbadge${known ? "" : " rumour"}">${b.ico} ${esc(b.nm)}</span>${
        known ? "" : ' <i class="q">???</i>'}${it.first ? ' <i class="firstmark" title="Fyrst(ur) hér til að finna það">★ fyrst(ur)</i>' : ""}</li>`;
    }).join("")}</ul></div>`;
}

/* Two cabinets side by side. What they have and you do not is the column that
   matters, so it comes first — and its hidden badges stay rumours. */
function compareHTML(ctx, mine, u) {
  const c = compare(mine, u.badgeIds || []);
  const col = (ids, title, empty) => {
    const list = ids.map((id) => BADGES.find((b) => b.id === id)).filter(Boolean)
      .sort((a, b) => shareOf(ctx.stats, a) - shareOf(ctx.stats, b));
    return `<div class="cmpcol"><h4>${esc(title)} <i>${list.length}</i></h4>
      ${list.length ? `<div class="chips">${list.slice(0, 40).map((b) => rosterChip(ctx, b)).join("")}${
        list.length > 40 ? `<span class="chip">… og ${list.length - 40} í viðbót</span>` : ""}</div>`
        : `<p class="sub faint">${esc(empty)}</p>`}</div>`;
  };
  const name = u.name || "Nafnlaus";
  return `<div class="cmpgrid">
    ${col(c.onlyTheirs, `${name} á, ekki þú`, "Ekkert — þú átt allt sem er á þessari hillu.")}
    ${col(c.onlyMine, `Þú átt, ekki ${name}`, "Ekkert enn.")}
    ${col(c.both, "Þið eigið bæði", "Ekkert sameiginlegt enn.")}
  </div>`;
}

/* ---------- the leaderboard ------------------------------------------------
 * `rank` and `METRICS` (core/leaderboard.js) were tested from the start and
 * the server has answered `/leaderboard` since v5.4. Without a server there is
 * no one to compare against, and the section says so instead of showing an
 * empty table.
 *
 * v6.1: the board opens on THE WEEK — XP earned since Monday — because that is
 * the race a newcomer can win. A long board is cut to the top three and the
 * rows around you (core/social.js `windowed`): being 14th of 30 is a fact,
 * being two places behind a friend is a reason to do one more question. */
export function renderLeaderboard(app) {
  const box = $("board");
  if (!box) return;
  if (!app.server) {
    box.innerHTML = `<div class="emptyroom"><b>Stofan er tóm í bili.</b>
      <p class="sub">Stigatafla birtist þegar forritið er á vefþjóni og fleiri en einn
      eru skráðir. Þegar skráin er opnuð beint af tölvunni þinni er enginn til að
      bera sig saman við — þú ert efst(ur) í bekknum, en líka neðst(ur).</p></div>`;
    return;
  }
  const rows = app.board || [];
  const metric = METRICS.find((m) => m.id === app.boardMetric) || METRICS[0];
  const me = app.profile ? app.profile.id : null;
  const S = app.S;
  const held = holders(app.roster || []), people = (app.roster || []).length;
  /* Beside the two word metrics, the share of each collection in good
     health (v6.6) — a large collection let slide shows here. */
  const wordy = metric.id === "vocab" || metric.id === "words";
  /* Two context columns beside the chosen one, never repeating it: level and
     badges, and this week's XP in place of whichever of them is the metric.
     (Until v6.7 the board always added Merki and Stig, so choosing Stig showed
     Stig twice.) */
  const CTX = [
    { id: "level",  nm: "Stig",  cell: (v) => String(v) },
    { id: "badges", nm: "Merki", cell: (v) => String(v) },
    { id: "week",   nm: "Vikan", cell: (v) => v.toLocaleString("is-IS") },
  ];
  const ctxCols = CTX.filter((c) => c.id !== metric.id).slice(0, 2);
  const healthCell = (r) => wordy
    ? `<td class="right mono health">${r.health == null ? "—" : r.health + "%"}</td>` : "";
  if (!rows.length) {
    box.innerHTML = `<div class="boardpick" id="boardpick"></div>
      <p class="sub faint">Enginn á töflunni enn.</p>`;
  } else {
    const shown = app.boardAll ? rows : windowed(rows, me);
    const cut = shown.length !== rows.length;
    box.innerHTML = `<div class="boardpick" id="boardpick"></div>
      ${metric.id === "week" ? weekLine(app, rows, me) : ""}
      ${metric.id === "framfarir" ? gainsLine(app) : ""}
      ${metric.id === "vocab" ? `<p class="weekline">Orðaforði: 1 stig fyrir hvert orð í safninu (2 fyrir
        sjaldgæft orð), 2 í viðbót fyrir orð á valdi þínu og 1 fyrir orð sem þú hefur bjargað. Orð í
        hættu telur ekkert fyrr en því er bjargað — svo það borgar sig að halda öllu safninu við.</p>` : ""}
      <table class="board boardIn"><tr>
        <th class="th">Sæti</th><th class="th">Nafn</th>
        <th class="th right primary" aria-sort="descending">${esc(metric.nm)} <span class="sortmark" aria-hidden="true">▾</span></th>
        ${wordy ? `<th class="th right sec" title="Hlutfall metinna orða í safninu sem eru í góðu lagi">Heilsa</th>` : ""}
        ${ctxCols.map((m) => `<th class="th right sec">${esc(m.short || m.nm)}</th>`).join("")}</tr>` +
      shown.map((r) => r.gap
        ? `<tr class="gaprow"><td colspan="${3 + (wordy ? 1 : 0) + ctxCols.length}">⋯ ${r.skipped} sæti á milli</td></tr>`
        : `<tr class="${r.profile === me ? "meRow" : ""}">
        <td class="place">${r.place <= 3 && (r.value ?? 0) > 0 ? ["🥇", "🥈", "🥉"][r.place - 1] : r.place}</td>
        <td>${whoHTML(r, { tag: (r.profile === me ? ' <i class="youtag">þú</i>' : "")
          + (r.duels ? ` <i class="dueltag" title="${r.duels} ${r.duels === 1 ? "einvígi unnið" : "einvígi unnin"}">⚔️ ${r.duels}</i>` : "") })}
          ${shelfHTML(S, r.showcase, held, people)}</td>
        <td class="right mono primary">${esc(metric.fmt(r.value ?? 0))}</td>
        ${healthCell(r)}
        ${ctxCols.map((m) => `<td class="right mono sec">${r[m.id] == null ? "—" : esc(m.cell(r[m.id]))}</td>`).join("")}</tr>`).join("") + `</table>
      ${cut || app.boardAll && rows.length > 8 ? `<button type="button" class="ghost" id="boardall">${
        app.boardAll ? "Sýna bara mitt nágrenni" : `Sýna alla ${rows.length}`}</button>` : ""}`;
    const all = $("boardall");
    if (all) all.onclick = () => { app.boardAll = !app.boardAll; renderLeaderboard(app); };
  }
  const pick = $("boardpick");
  pick.innerHTML = METRICS.map((m) =>
    `<button type="button" data-metric="${m.id}" aria-pressed="${m.id === metric.id}">${esc(m.nm)}</button>`).join("");
  pick.onclick = async (e) => {
    const b = e.target.closest("button[data-metric]");
    if (!b) return;
    if (b.dataset.metric === app.boardMetric) return;
    app.boardMetric = b.dataset.metric;
    pick.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b));
    const tbl = box.querySelector("table.board");
    if (tbl) tbl.classList.add("loading");
    await app.loadBoard();
    renderLeaderboard(app);
  };
}

/* The sentence above "Framfarir" (item 58): what it counts, and this pupil's
   own week in words — so a zero says where the points are, not that the
   pupil is last. Read from the pupil's own state, the same function the
   board's number comes from (core/mending.js `weekGains`). */
function gainsLine(app) {
  const g = weekGains(app.S, weekKey(new Date()));
  const mine = g.mended || g.reviews
    ? `Þín vika: ${g.mended ? `${g.mended} ${g.mended === 1 ? "villumynstur lagað" : "villumynstur löguð"}` : ""}${
      g.mended && g.reviews ? " og " : ""}${g.reviews ? `${g.reviews} ${
        g.reviews % 10 === 1 && g.reviews % 100 !== 11 ? "upprifjun tókst" : "upprifjanir tókust"}` : ""}.`
    : "Ekkert komið enn í þessari viku — upprifjanirnar fremst í Dagsins lotu eru fljótlegasta leiðin.";
  return `<p class="weekline">Framfarir telja það sem lagast í vikunni, ekki hve mikið er æft:
    ${MEND_POINTS} stig fyrir hvert villumynstur sem þú lagar (${MEND_RUN} rétt í röð eftir að það var
    algengt hjá þér) og 1 fyrir hverja upprifjun sem tekst, mest ${REVIEWS_PER_DAY} á dag. Talan byrjar
    á núlli hjá öllum á mánudegi. ${esc(mine)}</p>`;
}

/* The sentence above the weekly board: how far it is to the next person, and
   who won last week. A gap you can close today is the whole point of it. */
function weekLine(app, rows, me) {
  const at = rows.findIndex((r) => r.profile === me);
  const mine = at >= 0 ? rows[at] : null;
  const above = at > 0 ? rows.slice(0, at).reverse().find((r) => r.value > mine.value) : null;
  let chase = "";
  if (mine && above) {
    chase = `<b>${(above.value - mine.value + 1).toLocaleString("is-IS")} XP</b> í að fara fram úr ${esc(above.name || "Nafnlaus")}.`;
  } else if (mine && (mine.value || 0) > 0) {
    chase = "Þú leiðir vikuna — haltu forskotinu til sunnudagskvölds.";
  } else if (mine) {
    chase = "Vikan er nýbyrjuð hjá þér. Eitt rétt svar kemur þér á blað.";
  }
  const last = app.social && app.social.lastWeek;
  const champs = last ? (last.champions || []).map((id) => {
    const r = rows.find((x) => x.profile === id);
    return r ? (id === me ? "þú" : (r.name || "Nafnlaus")) : null;
  }).filter(Boolean) : [];
  return `<p class="weekline">Vikan byrjar á núlli hjá öllum á mánudegi. ${chase}${
    champs.length ? ` <span class="champ">🥇 Vikumeistari síðustu viku: <b>${champs.map(esc).join(" og ")}</b>.</span>` : ""}</p>`;
}

function renderCollection(app) {
  const groups = collectionByClass(app.S, app.lex);
  const stats = app.badgeStats || null;
  const sum = groups.reduce((a, g) => a + g.seen, 0);
  const tot = groups.reduce((a, g) => a + g.total, 0);
  $("collsub").innerHTML =
    `Þú hefur hitt á <b>${sum}</b> ólík orð af ${tot} í safninu — ${(100 * sum / tot).toFixed(1)}%. ` +
    `Orð sem þú hefur ekki séð eru ekki sýnd. Hlutfallið aftan við hvert orð er hve oft þú hafðir ` +
    `rétt fyrir þér, og liturinn á tíglinum segir hve sjaldgæft orðið er í íslensku máli.`;

  renderCollHealth(app);

  $("collection").innerHTML = groups.map((g) => {
    if (!g.seen) {
      return `<div class="collgroup empty">
        <div class="collhead"><b>${esc(g.label)}</b>
          <span class="collcount">0 / ${g.total}</span></div>
        <p class="collnone">Ekkert fundið enn.</p></div>`;
    }
    const pct = (100 * g.pct).toFixed(g.pct < 0.1 ? 1 : 0);
    return `<div class="collgroup">
      <div class="collhead"><b>${esc(g.label)}</b>
        <span class="collcount">${g.seen} / ${g.total} · ${pct}%</span></div>
      <div class="collbar"><i style="width:${Math.max(1, Math.min(100, 100 * g.pct))}%"></i></div>
      <div class="chips">${g.words.map((w) => wordChip(w, stats)).join("")}</div>
      ${g.strong || g.weak ? `<p class="collnote">${[
        g.strong ? `${g.strong} á valdi þínu (80%+ nýlegra svara)` : "",
        g.weak ? `${g.weak} í hættu` : ""].filter(Boolean).join(" · ")}.</p>` : ""}
    </div>`;
  }).join("");
}

/**
 * v6.6: the collection's health above the collection itself — the score the
 * leaderboard sorts by, its parts, and the words in trouble, each one a button
 * that starts a rescue drill.
 */
function renderCollHealth(app) {
  const el = $("collhealth");
  if (!el) return;
  const v = vocabScore(app.S, app.lex);
  const weak = weakWords(app.S, app.lex);
  el.innerHTML = `<div class="healthcard">
      <div class="tile"><span>Orðaforði</span><b>${v.score.toLocaleString("is-IS")}</b>
        <small>talan á stigatöflunni</small></div>
      <div class="tile"><span>Orðaheilsa</span><b>${v.health == null ? "—" : v.health + "%"}</b>
        <small>${v.health == null
          ? `kemur þegar ${HEALTH.healthMinWords} orð hafa verið metin (${v.judged} núna)`
          : `${v.judged} metin orð`}</small></div>
      <div class="tile"><span>Á valdi þínu</span><b>${v.strong}</b><small>80%+ nýlegra svara</small></div>
      <div class="tile"><span>Bjargað</span><b>${v.rescued}</b>
        <small>${v.kept ? `${v.kept} haldist á floti síðan` : "með björgunaræfingu"}</small></div>
    </div>` + (weak.length ? `<div class="atrisk">
      <h3>⚠️ Orð í hættu (${weak.length})</h3>
      <p>Orð sem þú hefur svarað ${HEALTH.weakMinSeen} sinnum eða oftar og haft rétt í færri en
        ${Math.round(100 * HEALTH.weakMaxAcc)}% nýlegra svara. Þau telja ekkert í Orðaforða.
        Smelltu á orð til að taka björgunaræfingu: ${DRILL.min}–${DRILL.max} spurningar um það eina
        orð, þangað til meira en helmingur er réttur.</p>
      <div class="chips">${weak.slice(0, 40).map((w) => w.drillable
        ? `<button type="button" class="chip drillme" data-drill="${esc(w.key)}"
            title="Byrja björgunaræfingu á ${esc(w.lemma)}">${esc(w.lemma)}<i>${Math.round(100 * w.acc)}% · ${w.seen}</i></button>`
        : `<span class="chip word weak" title="Ekki hægt að æfa þetta orð sérstaklega með því námsefni sem er kveikt á">${
            esc(w.lemma)}<i>${Math.round(100 * w.acc)}%</i></span>`).join("")}</div></div>` : "");
  el.onclick = (e) => {
    const b = e.target.closest("button[data-drill]");
    if (b && app.startDrill) app.startDrill(b.dataset.drill);
  };
}

function wordChip(w, stats) {
  const tone = w.status === "weak" ? "weak"
    : w.n < 2 ? "new" : w.pct >= 80 ? "good" : w.pct >= 50 ? "mid" : "poor";
  /* The hover text carries the two rarities apart from each other: how ordinary
     the word is in Icelandic, and — only when the server can actually measure
     it — how many other children have run into it here. */
  const met = wordRarity(stats, w.key);
  const title = [
    `${w.lemma} — ${w.correct} rétt af ${w.n}`,
    STATUS_LABEL[w.status] || null,
    w.rescued ? "bjargað með björgunaræfingu" : null,
    w.tier ? `${w.tier.nm} orð` : null,
    met ? `${met.holders} af ${met.users} notendum hafa hitt á það` : null,
    w.def || null,
  ].filter(Boolean).join(" · ");
  return `<span class="chip word ${tone}${w.tier ? " rar-" + w.tier.id : ""}${
    w.rare ? " rare" : ""}"${w.tier ? ` style="${tierVars(w.tier, 0.3)}"` : ""} title="${
    esc(title)}">${esc(w.lemma)}<i>${w.pct}%</i>${w.rescued ? `<span class="saved" aria-label="bjargað">🛟</span>` : ""}</span>`;
}

/* ---------- settings ----------------------------------------------------- */

/**
 * The child's own switches: categories, question types, levels and features —
 * the SAME widget the administrator uses (ui/policyui.js), with `S.allowed`
 * as its ceiling. `S.enabled` still holds the skills; the editor is handed a
 * view stitching the two together and writes back into both.
 */
export function renderSettings(app) {
  const S = app.S;
  $("goalin").value = S.goal;
  $("weekin").value = String(weekGoalOf(S));
  $("set-decay").checked = S.settings.decay === true;
  $("set-gloss").checked = S.settings.glossary !== false;
  $("set-comfort").checked = S.settings.comfort === true;
  /* Item 53: the box shows what is in force, the guess included, so ticking
     it always does what it looks like it will. */
  $("set-keys").checked = keypadOn(S.settings, keypadEnv());

  S.policy ||= { skills: {}, types: {}, levels: {}, attrs: {}, safeVocab: null };
  const view = {
    skills: S.enabled,
    types: S.policy.types ||= {},
    levels: S.policy.levels ||= {},
    attrs: S.policy.attrs ||= {},
  };
  renderPolicyEditor($("policyeditor"), view, {
    ceiling: S.allowed || null,
    teacherFold: true,        // item 50: types, levels and features behind a disclosure
    /* The policy app.js keeps for the builders is now stale — say so, or the next
       question is drawn from the material that was just switched off. */
    onChange: () => { app.reloadPolicy(); app.save(); },
  });
}

/* ---------- data --------------------------------------------------------- */

export function renderData(app) {
  const lex = app.lex;
  const byClass = {};
  lex.all.forEach((w) => (byClass[w.fl] ||= []).push(w));
  const homographs = lex.all
    .map((w) => w.o)
    .filter((o, i, arr) => arr.indexOf(o) !== i);
  const uniqueHom = [...new Set(homographs)];

  $("datanote").innerHTML = `Öll beygingargögn eru sótt beint í <b>BÍN</b> með BinPackage — engar töflur eru
    slegnar inn í höndunum. Aðeins myndir úr <b>BÍN-kjarnanum</b> (<code>birting=K</code>, einkunn 1, engin
    málsniðs- eða málfræðimerking) eru notaðar, svo forritið kennir málstaðal.
    Hver setning er þáttuð með <b>Greynir</b>, sem gefur orðflokk, beygingarmark, setningarhluta og fallstjórn
    sagna — þess vegna eru skýringarnar lesnar úr þáttuninni en ekki skrifaðar í höndunum.`;
  $("vocabsub").textContent =
    `${lex.all.length} orð úr BÍN, ${lex.all.filter((x) => x.d).length} með orðskýringu, ` +
    `${uniqueHom.length} lemmur til í fleiri en einum orðflokki.`;
  $("classchips").innerHTML = ALL_CLASSES.map((c) => {
    const n = (byClass[c] || []).length;
    return `<span class="chip ${n ? "" : "locked"}">${esc(c)}<i>${n}</i></span>`;
  }).join("");
  $("homchips").innerHTML = uniqueHom.slice(0, 30).map((o) => {
    const classes = lex.homographClasses(o).join(" / ");
    return `<span class="chip">${esc(o)}<i>${esc(classes)}</i></span>`;
  }).join("");
  $("sentsub").textContent =
    `${lex.sentences.length} setningar, allar fullþáttaðar. ` +
    `${lex.sentences.filter((s) => s.fixed).length} þeirra eru merktar þannig að ekki má skipta um nafnorð.`;
  const rows = lex.sentences.slice(0, 8).map((s) => `<tr>
    <td style="padding:4px 8px;font-size:13px">${esc(s.t)}</td>
    <td style="padding:4px 8px;font-family:var(--mono);font-size:11px;color:var(--slate)">${s.lvl}</td>
    <td style="padding:4px 8px;font-family:var(--mono);font-size:11px;color:var(--slate)">${esc(s.tok.filter((t) => t.r).map((t) => t.w + "·" + t.r).join("  "))}</td></tr>`).join("");
  $("senttable").innerHTML = `<table style="border-collapse:collapse;width:100%"><tr>
    <th class="th">Setning</th><th class="th">Þyngd</th><th class="th">Setningarhlutar úr þáttun</th></tr>${rows}</table>`;
  renderLicenses();
}

/* ---------- licences and acknowledgements ---------------------------------

   The list is generated from requirements.txt and package.json
   (tools/licenses.mjs), not written here. A package that joins the build and is
   not named stops the tool — silence about an author must not be able to arise
   from forgetfulness.                                                      */
function renderLicenses() {
  const box = $("licenses");
  if (!box) return;
  const card = (x) => `<div class="liccard">
    <div class="lichead"><b>${esc(x.nm)}</b><span class="licl">${esc(x.lic)}</span></div>
    <div class="licwho">${esc(x.who)}${x.ver ? ` · útgáfa ${esc(x.ver)}` : ""}</div>
    <div class="licwhat">${esc(x.what)}</div>
    ${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.url)}</a>` : ""}
  </div>`;
  box.innerHTML = `
    <p class="note">Þetta forrit er ekki markaðssett og engin gjaldtaka er af því.
      Það stendur samt á vinnu annarra, og hér er hún nefnd með nafni. Beygingar,
      þáttun, tíðniröðun, leturgerðir og orðskýringar eru allt verk annarra;
      forritið sjálft bætir aðeins spurningunum við.</p>
    <h3 class="bgroup">Gagnasöfn og orðabækur</h3>
    <div class="licgrid">${LICENSES.data.map(card).join("")}</div>
    <h3 class="bgroup">Hugbúnaður sem smíðin notar</h3>
    <div class="licgrid">${LICENSES.packages.map(card).join("")}</div>
    <p class="sub faint">Listinn var smíðaður ${esc(LICENSES.built)} úr
      requirements.txt og package.json.</p>`;
}
