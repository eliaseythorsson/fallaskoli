/* The server AND the program together, in real Chrome.
 *
 * The unit tests (tests/server.test.js) prove the endpoints answer correctly.
 * They do not prove that the child gets in. This does: a real server on a real
 * port, a real browser fetching the file from it, text typed into inputs and
 * buttons clicked.
 *
 * Run with:  node tools/server-test.mjs
 */

import puppeteer from "puppeteer-core";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { htmlPath } from "./version.mjs";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

import { createApp } from "../server/server.mjs";
import { hashPassword, newId } from "../server/auth.mjs";

/* v6.10: practice comes in sessions picked on the Æfa tab. The program now
   opens on the picker, with no question; the checks below drive one long
   mixed session, started the way the picker starts one. */
async function startPractice(page, timeout) {
  await page.waitForFunction("window.FALLASKOLI && window.FALLASKOLI.sess && document.querySelector('#task .card')", { timeout });
  await page.evaluate(() => {
    const A = window.FALLASKOLI;
    if (!A.run && !A.duelRun) A.startRun("blandad", 100000);
  });
  await page.waitForFunction("window.FALLASKOLI.cur", { timeout: 5000 });
}


const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const HTML = process.argv[2] ? path.join(ROOT, process.argv[2]) : htmlPath();
const CHROME = process.env.CHROME_PATH ||
  "/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome";

if (!existsSync(CHROME)) { console.error("Finn ekki Chrome:", CHROME); process.exit(2); }

const problems = [];
let checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) problems.push(msg); };

const dir = await fs.mkdtemp(path.join(os.tmpdir(), "fallaskoli-e2e-"));
const app = createApp({ dataDir: dir, htmlFile: HTML, secureCookies: false, env: {} });
await app.store.init();

/* two accounts: an administrator and a child */
async function mkUser(username, role, status = "active") {
  const { salt, hash } = await hashPassword("lykilordid-mitt");
  let user;
  await app.store.updateUsers((users) => {
    /* On the board and consented: what these checks look at is the board and
       the admin page with people on them. The defaults (invitation, consent,
       nobody shown) are driven further down, and in tests/accounts.test.js. */
    user = { id: newId(), username, name: username, role, status, salt, hash,
      group: "default", share: { board: true, minutes: true },
      consent: { by: "self", over16: true, at: new Date().toISOString(), how: "admin" } };
    users.push(user);
    return users;
  });
  return user;
}
const admin = await mkUser("umsjon", "admin");
const child = await mkUser("barn", "learner");

await new Promise((r) => app.server.listen(0, r));
const BASE = "http://127.0.0.1:" + app.server.address().port;

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

async function fresh() {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1100, height: 900 });
  page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !/favicon|fonts\.g|Failed to load resource/.test(m.text()))
      problems.push("console.error: " + m.text());
  });
  return { ctx, page };
}

async function login(page, username) {
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#lg-user", { timeout: 15000 });
  await page.type("#lg-user", username);
  await page.type("#lg-pass", "lykilordid-mitt");
  await page.click("#lg-in");
  await startPractice(page, 20000);
}

/* v6.13 (item 47): while a session runs the header and tabs give way to one
   slim line (body.insession), and login() above starts a long one. A child
   gets to the tabs by leaving the session with the × (and answering the
   question it asks), so the checks do the same, with real clicks, and then
   click the tab for real. Where no session runs, the tab is clicked at once —
   which is what proves the tabs are reachable when nothing is going on. */
async function openTab(page, view) {
  if (await page.evaluate(() => document.body.classList.contains("insession"))) {
    await page.click("#runstop");
    await page.waitForSelector("#runquit-yes", { timeout: 5000 });
    await page.click("#runquit-yes");
    await page.waitForFunction("!document.body.classList.contains('insession')", { timeout: 5000 });
  }
  await page.click(`nav.tabs button[data-view="${view}"]`);
}

/* ---------- 1. The gate holds against anyone not logged in ---------- */
{
  const { ctx, page } = await fresh();
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#lg-user", { timeout: 15000 });
  ok(await page.$("#lg-in") !== null, "no login screen appeared on the server");
  ok(await page.evaluate(() => !window.FALLASKOLI.cur),
    "a task appeared BEFORE anybody logged in");

  /* A wrong password should say so, not let anybody in. */
  await page.type("#lg-user", "barn");
  await page.type("#lg-pass", "vitlaustlykilord");
  await page.click("#lg-in");
  await page.waitForSelector("#lg-note .verdict", { timeout: 10000 });
  ok(await page.evaluate(() => !window.FALLASKOLI.cur), "a wrong password let somebody in");
  await ctx.close();
}

/* ---------- 2. The child gets in and progress lands on the SERVER ---------- */
{
  const { ctx, page } = await fresh();
  await login(page, "barn");
  ok(await page.$("#task .card") !== null, "no task after logging in");
  ok(await page.evaluate(() => window.FALLASKOLI.profile.username) === "barn",
    "the wrong user is logged in");

  await page.evaluate(() => { window.FALLASKOLI.S.xp = 777; return window.FALLASKOLI.save(true); });
  await new Promise((r) => setTimeout(r, 400));
  const stored = await app.store.state(child.id);
  ok(stored && stored.xp === 777, "the progress did not reach the server");

  /* A reload should fetch it from THERE, not from browser storage. */
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  await startPractice(page, 20000);
  ok(await page.evaluate(() => window.FALLASKOLI.S.xp) === 777,
    "the progress did not come back from the server after browser storage was emptied");
  await ctx.close();
}

/* ---------- 3. Old local progress is not lost ---------- */
{
  const lifted = await mkUser("flutt", "learner");
  const { ctx, page } = await fresh();
  /* A child who has practised for a month in the `file:` version: the progress
     is in localStorage under 'local' and the server has nothing. */
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.setItem("fallaskoli.v5.local",
    JSON.stringify({ v: 5, xp: 4242, badges: { fyrsta: { n: 1 } }, skills: {}, days: {}, words: {} })));
  await login(page, "flutt");
  ok(await page.evaluate(() => window.FALLASKOLI.S.xp) === 4242,
    "progress from browser storage was lost on the first login");
  const up = await app.store.state(lifted.id);
  ok(up && up.xp === 4242, "the progress was not lifted onto the server");
  ok(await page.evaluate(() => !!localStorage.getItem("fallaskoli.v5.local")),
    "the local copy was deleted — it should be left behind as a backup");
  await ctx.close();
}

/* ---------- 4. The admin page ---------- */
{
  const bidur = await mkUser("bidur", "learner", "pending");
  const { ctx, page } = await fresh();
  await login(page, "umsjon");
  await openTab(page, "settings");
  await page.waitForSelector("#admin-users table.admintable", { timeout: 10000 });

  const text = await page.$eval("#admin", (e) => e.innerText);
  ok(/bidur/.test(text), "a pending user is not visible in the admin page");
  ok(/Gagnasafn/.test(text), "the data-set section is missing from the admin page");

  /* Admit somebody with a button, and check on the SERVER that it happened. */
  await page.click(`#admin-users button[data-act="open"][data-id="${bidur.id}"]`);
  await page.waitForFunction(
    (id) => !document.querySelector(`#admin-users button[data-act="open"][data-id="${id}"]`),
    { timeout: 10000 }, bidur.id);
  const after = (await app.store.users()).find((u) => u.id === bidur.id);
  ok(after.status === "active", "the button did not actually admit anybody");

  /* The data set: one file, one button, a status afterwards. */
  const file = path.join(dir, "ino.json");
  await fs.writeFile(file, JSON.stringify({
    name: "prófsafn", source: "ÍNO",
    entries: { 9999: { def: "tími dagsins eftir sólsetur", lemma: "kvöld" } },
  }));
  const input = await page.$("#ds-file");
  await input.uploadFile(file);
  await page.waitForFunction(
    () => /1 skýring|Uppsett/.test(document.getElementById("admin-dataset").innerText),
    { timeout: 10000 });
  const status = await app.store.datasetStatus();
  ok(status.uploaded === true && status.count === 1, "the data set did not go in through the button");
  await ctx.close();
}

/* ---------- 5. A child cannot reach the admin page ---------- */
{
  const { ctx, page } = await fresh();
  await login(page, "barn");
  await openTab(page, "settings");
  await new Promise((r) => setTimeout(r, 500));
  ok(await page.$eval("#admin", (e) => e.innerText.trim().length) === 0,
    "a child can see the admin page");
  const direct = await page.evaluate(async (b) => {
    const r = await fetch(b + "/admin/users", { credentials: "include" });
    return r.status;
  }, BASE);
  ok(direct === 403, `a child got ${direct} from /admin/users — should have been 403`);
  await ctx.close();
}

/* ---------- 6. Rarity does not claim 100% off a single user ---------- */
{
  const { ctx, page } = await fresh();
  await login(page, "barn");
  await new Promise((r) => setTimeout(r, 600));
  ok(await page.evaluate(() => window.FALLASKOLI.badgeStats) === null,
    "rarity was computed even though there are too few users");
  await ctx.close();
}

/* ---------- 7. The leaderboard, on the screen ---------------------------
 *
 * `/leaderboard` has answered since v5.4. `rank()` and `METRICS` are
 * unit-tested. The administrator has had a screen for hiding people from it.
 * And until v5.7 **nothing in the program ever called it** — design rule 6,
 * *"an endpoint that works is not a feature that works"*, for the second time.
 *
 * So this check goes through the screen: log in, open the tab, read the table,
 * press a different metric and require the ordering to change.             */
{
  /* Give three children different amounts of progress so an ordering exists. */
  const a = await mkUser("stiga", "learner");
  const b = await mkUser("stigb", "learner");
  const seed = (xp, badges, words) => {
    const S = { v: 9, xp, badges: {}, words: {}, days: {}, skills: {},
                profile: { id: "x", name: "" }, counters: {}, enabled: {}, settings: {} };
    for (let i = 0; i < badges; i++) S.badges["b" + i] = { n: 1, dates: [] };
    for (let i = 0; i < words; i++) S.words["w" + i + "|kk"] = { c: 1, w: 0 };
    /* Spread over ordinary days of 300 XP. One day of 9,000 is not practice,
       and since v6.3 the server says so: it holds the account off the board
       for the administrator to look at (server/guard.mjs). */
    for (let left = xp, i = 0; left > 0; left -= 300, i++) {
      const d = new Date(Date.UTC(2026, 2, 1 + i)).toISOString().slice(0, 10);
      S.days[d] = { a: 5, c: 5, xp: Math.min(300, left), ms: 600000, nw: i ? 0 : words, sk: {} };
    }
    return S;
  };
  await app.store.putState(a.id, seed(9000, 40, 12));
  await app.store.putState(b.id, seed(300, 3, 90));

  const { ctx, page } = await fresh();
  await login(page, "stiga");
  await openTab(page, "class");
  await page.waitForSelector("#board table.board tr", { timeout: 10000 });

  /* v6.1: the board opens on the week. Both seeds earned their XP in March,
     so this week is level at nought — press XP to get the all-time order. */
  ok(await page.$eval('[data-metric="week"]', (b) => b.getAttribute("aria-pressed")) === "true",
    "the board does not open on the week");
  ok(await page.$(".weekline") !== null, "the weekly board says nothing about the week");
  await page.evaluate(() => document.querySelector('[data-metric="xp"]').click());
  await page.waitForFunction(
    () => document.querySelector('[data-metric="xp"]')?.getAttribute("aria-pressed") === "true",
    { timeout: 8000 });
  await new Promise((r) => setTimeout(r, 400));

  const byXp = await page.$$eval("#board table.board tr td:nth-child(2)",
    (tds) => tds.map((t) => t.innerText.trim().split("\n")[0]));
  ok(byXp[0].includes("stiga"), `the XP table is led by ${byXp[0]}, not stiga`);
  ok(byXp.some((n) => n.includes("stigb")), "stigb is missing from the table");
  ok(await page.$(".meRow") !== null, "the logged-in child is not marked in the table");

  /* A different metric really does re-rank — the child with 90 words but 300 XP
     goes to the top when the table is sorted by words. */
  await page.evaluate(() => document.querySelector('[data-metric="words"]').click());
  await page.waitForFunction(
    () => document.querySelector('[data-metric="words"]')?.getAttribute("aria-pressed") === "true",
    { timeout: 8000 });
  await new Promise((r) => setTimeout(r, 400));
  const byWords = await page.$$eval("#board table.board tr td:nth-child(2)",
    (tds) => tds.map((t) => t.innerText.trim().split("\n")[0]));
  ok(byWords[0].includes("stigb"),
    `sorting by words is led by ${byWords[0]}, not stigb — the metric button did nothing`);
  await ctx.close();
}

/* ---------- 7b. What users see of each other (v6.1), on the screen --------
 *
 * The same rule as §7: an endpoint that works is not a feature that works.
 * Three children with a week, a shelf, a secret and a first find between them;
 * then one of them logs in and the SCREEN has to show the weekly order, the
 * title and shelf beside a name, the secret as a rumour with no condition, the
 * week's finds, and the comparison — and hand out "Framúrakstur" when the
 * child passes somebody. */
{
  const { weekKey, prevWeekKey } = await import("../src/js/core/social.js");
  const { blankState } = await import("../src/js/core/state.js");
  const week = weekKey(new Date()), last = prevWeekKey(week);
  const won = (date, n = 1) => ({ n, dates: [date], first: date, last: date });
  const mk = async (name, thisWeek, lastWeek, badges, extra = {}) => {
    const u = await mkUser(name, "learner");
    await app.store.putState(u.id, {
      ...blankState(), xp: 2000 + thisWeek, bestLevel: 6, badges,
      days: { [week]: { a: 3, c: 3, xp: thisWeek, sk: {} }, [last]: { a: 3, c: 3, xp: lastWeek, sk: {} } },
      ...extra,
    });
    return u;
  };
  const anna = await mk("anna", 400, 50, {
    s_palindrome: won(week), run5: won("2026-01-05", 12), tot50: won("2026-01-06"),
  }, { showcase: ["s_palindrome"], title: "badge:s_palindrome" });
  const bui = await mk("bui", 120, 900, { run5: won("2026-02-01"), s_42: won("2026-02-02") });
  const ceci = await mk("ceci", 60, 300, { run5: won("2026-03-01") },
    /* the last time ceci looked, bui was ahead of her this week */
    { social: { week, ahead: [] } });
  /* ceci will be given 200 XP this week further down; first she is behind bui. */
  await app.store.putState(ceci.id, {
    ...(await app.store.state(ceci.id)),
    social: { week, ahead: [bui.id, anna.id] },
    days: { [week]: { a: 3, c: 3, xp: 200, sk: {} }, [last]: { a: 3, c: 3, xp: 300, sk: {} } },
  });

  const { ctx, page } = await fresh();
  await login(page, "ceci");
  /* The overtaking badge opens its window over the page as soon as the roster
     arrives — that window is the first thing to check, and it has to be out of
     the way before a tab can be pressed. */
  await page.waitForSelector(".scrim .modal", { timeout: 10000 }).catch(() => {});
  const modal = await page.evaluate(() => document.querySelector(".scrim .modal")?.textContent || "");
  ok(/Framúrakstur/.test(modal), "no window announced Framúrakstur");
  await page.evaluate(() => document.querySelector(".scrim .modal button")?.click());
  await new Promise((r) => setTimeout(r, 300));
  /* The child's own card is on Merki og framvinda, the others in Skólastofan. */
  await page.evaluate(() => document.querySelector('nav.tabs button[data-view="progress"]').click());
  await page.evaluate(() => document.querySelector('nav.tabs button[data-view="class"]').click());
  await page.waitForSelector("#board table.board tr.meRow", { timeout: 10000 });
  await page.waitForSelector("#roster .rosteruser", { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 500));

  const seen = await page.evaluate(() => {
    const names = [...document.querySelectorAll("#board table.board tr td:nth-child(2) .who")]
      .map((e) => e.textContent.trim());
    const three = names.filter((n) => ["anna", "bui", "ceci"].includes(n));
    const annaRow = [...document.querySelectorAll("#board table.board tr")]
      .find((tr) => tr.querySelector(".who")?.textContent.trim() === "anna");
    const annaCard = [...document.querySelectorAll("#roster .rosteruser")]
      .find((d) => d.querySelector(".who")?.textContent.trim() === "anna");
    const rumour = annaCard && annaCard.querySelector(".rarchip.rumour");
    return {
      three,
      title: annaRow ? annaRow.querySelector(".whotitle").textContent.trim() : null,
      shelf: annaRow ? annaRow.querySelectorAll(".shelfico").length : 0,
      weekline: document.querySelector(".weekline")?.textContent || "",
      rumourText: rumour ? rumour.textContent : null,
      rumourTitle: rumour ? rumour.getAttribute("title") : null,
      medal: annaCard ? !!annaCard.querySelector(".medalmark") : false,
      first: annaCard ? !!annaCard.querySelector(".firstmark") : false,
      feed: document.querySelector("#roster .feed")?.textContent || "",
      mine: Object.keys(window.FALLASKOLI.S.badges),
      mycard: document.querySelector("#mycard .mycard")?.textContent || "",
    };
  });
  ok(seen.three.join() === "anna,ceci,bui",
    `the weekly order is ${seen.three.join()}, not anna,ceci,bui`);
  ok(seen.title === "Spegilorð", `anna's chosen title shows as "${seen.title}"`);
  ok(seen.shelf === 1, `anna's shelf shows ${seen.shelf} badges, not the one she pinned`);
  ok(/XP.*fram úr anna/.test(seen.weekline), "the week line does not say how far it is to the next person");
  ok(/bui/.test(seen.weekline) && /Vikumeistari/.test(seen.weekline),
    "last week's champion (bui) is not announced");
  ok(seen.rumourText && seen.rumourText.includes("Spegilorð") && seen.rumourText.includes("???"),
    "a secret badge on somebody else's shelf is not shown as a rumour");
  ok(seen.rumourTitle && !seen.rumourTitle.includes("fram og aftur"),
    "the rumour gives away how the secret badge is won");
  ok(seen.rumourTitle && /1 af \d+ hér/.test(seen.rumourTitle),
    "the rumour does not say how many here have found it");
  ok(seen.medal, "a badge anna won twelve times wears no medal on her shelf");
  ok(seen.first, "anna found Spegilorð first and nothing marks it");
  ok(/anna/.test(seen.feed) && /Spegilorð/.test(seen.feed), "this week's find is missing from the feed");
  ok(seen.mine.includes("soc_overtake"),
    "ceci passed bui on the weekly board and was not given Framúrakstur");
  ok(/XP í þessari viku/.test(seen.mycard), "the child's own card is missing");

  /* The comparison: what anna has that ceci has not comes first. */
  const cmp = await page.evaluate(() => {
    const card = [...document.querySelectorAll("#roster .rosteruser")]
      .find((d) => d.querySelector(".who")?.textContent.trim() === "anna");
    card.querySelector("button[data-cmp]").click();
    const cols = [...card.querySelectorAll(".cmpcol")];
    return cols.map((c) => ({ h: c.querySelector("h4").textContent, n: c.querySelectorAll(".rarchip").length }));
  });
  ok(cmp.length === 3 && /anna á, ekki þú/.test(cmp[0].h) && cmp[0].n === 2,
    `the comparison's first column is ${JSON.stringify(cmp[0])}`);
  ok(cmp.length === 3 && cmp[2].n === 1, "the shared badge (run5) is not in the third column");

  /* The server holds the badge too — it was saved, not just drawn. */
  await new Promise((r) => setTimeout(r, 1200));
  const saved = await app.store.state(ceci.id);
  ok(saved.badges && saved.badges.soc_overtake, "Framúrakstur did not reach the server");
  await ctx.close();
}

/* ---------- 8. The guess gives way to the measurement, on the screen ------
 *
 * The owner: *"I really worry about the rarity function on the badges … Can you
 * verify that this procedure, the transition from our guessed levels of rarity
 * to true levels of rarity, actually works?"*
 *
 * tests/server.test.js proves the endpoint crosses the threshold. This proves
 * the CHILD sees it cross: the chip stops being dashed and stops saying "~".
 * And it checks the thing that turned out to matter more — that crossing the
 * threshold does not turn the whole cabinet legendary.                     */
{
  const { ctx, page } = await fresh();
  await login(page, "barn");
  await openTab(page, "progress");
  await page.evaluate(() => document.querySelector('[data-bview="group"]')?.click());
  await new Promise((r) => setTimeout(r, 400));

  const before = await page.evaluate(() => ({
    stats: window.FALLASKOLI.badgeStats,
    est: document.querySelectorAll("#badgegrid .rar.est").length,
    solid: document.querySelectorAll("#badgegrid .rar:not(.est)").length,
  }));
  ok(before.stats === null, "rarity was measured with three users");
  ok(before.est > 0 && before.solid === 0,
    "every chip should be a dashed estimate before the threshold");

  /* Now seed ten users with twelve active days each. */
  for (let i = 0; i < 10; i++) {
    const u = await mkUser("maelir" + i, "learner");
    const S = { v: 9, xp: 100, badges: {}, words: {}, days: {}, skills: {},
                profile: { id: u.id, name: "" }, counters: {}, enabled: {}, settings: {} };
    for (let d = 1; d <= 12; d++)
      S.days[`2026-04-${String(d).padStart(2, "0")}`] = { a: 6, c: 5, xp: 8, ms: 0, nw: 0, sk: {} };
    /* Four of them have run5, so the badge has a real share to show. */
    if (i < 4) S.badges.run5 = { n: 1, dates: ["2026-04-01"] };
    await app.store.putState(u.id, S);
  }

  await page.reload({ waitUntil: "domcontentloaded" });
  await startPractice(page, 20000);
  await page.waitForFunction("window.FALLASKOLI.badgeStats !== null", { timeout: 15000 });
  await openTab(page, "progress");
  await page.evaluate(() => document.querySelector('[data-bview="group"]')?.click());
  await new Promise((r) => setTimeout(r, 400));

  const after = await page.evaluate(() => {
    const chips = [...document.querySelectorAll("#badgegrid .rar")];
    const tiers = {};
    chips.forEach((c) => {
      const nm = c.textContent.trim().split("·")[0].trim().replace(/^\S+\s/, "");
      tiers[nm] = (tiers[nm] || 0) + 1;
    });
    return {
      qualified: window.FALLASKOLI.badgeStats.qualified,
      measurable: window.FALLASKOLI.badgeStats.measurable,
      month: window.FALLASKOLI.badgeStats.month,
      est: document.querySelectorAll("#badgegrid .rar.est").length,
      solid: chips.length - document.querySelectorAll("#badgegrid .rar.est").length,
      total: chips.length,
      tiers,
    };
  });
  ok(after.qualified >= 10, `${after.qualified} qualified users after seeding ten`);
  ok(after.measurable === true, "the server still says the rarity is not measurable");
  ok(after.est === 0 && after.solid === after.total,
    `${after.est} chips are still marked as guesses after the threshold was crossed`);
  ok(/^\d{4}-\d{2}$/.test(after.month || ""), "no month came back with the statistics");

  /* THE ONE THAT MATTERS. With ten qualified users the raw share can only be
     0, 1/10, 2/10 … so `holders / qualified` puts every badge nobody holds at
     0% — below every threshold there is — and the whole cabinet turns
     Goðsagnakennt. This fails on v5.6 with every visible badge legendary. */
  const legendary = after.tiers["Goðsagnakennt"] || 0;
  ok(legendary / after.total < 0.25,
    `${legendary} of ${after.total} visible badges went Goðsagnakennt the moment ` +
    `the tenth user qualified — the measurement destroyed the tiers`);
  ok(Object.keys(after.tiers).length >= 3,
    "the measured badges all landed in one tier: " + JSON.stringify(after.tiers));

  /* The monthly record was written the first time the measurement existed. */
  const hist = await app.store.rarityHistory();
  ok(hist.length === 1 && hist[0].qualified >= 10,
    "the monthly rarity snapshot was not written: " + JSON.stringify(hist));
  await ctx.close();
}

/* ---------- v6.3: an invitation, consent, and choosing to be seen ----------
 * Through the screen, with the server's defaults: nobody registers without a
 * code, nobody under sixteen without a guardian's name, and nobody is on the
 * board until they press the button. */
{
  const inviteId = newId();
  await app.store.updateInvites((list) => [...list, {
    id: inviteId, code: "hestur-fjall-alda-123", group: "default", max: 1, uses: 0, usedBy: [],
    created: new Date().toISOString(), exp: new Date(Date.now() + 86400000).toISOString() }]);

  const { ctx, page } = await fresh();
  const outside = [];
  page.on("request", (r) => {
    const u = r.url();
    if (!u.startsWith(BASE) && !u.startsWith("data:") && !u.startsWith("blob:")) outside.push(u);
  });
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#lg-new", { timeout: 15000 });
  ok(await page.$('a[href$="/personuvernd"]') !== null, "the login card does not link to the privacy notice");
  await page.click("#lg-new");
  await page.waitForSelector("#rg-code");
  await page.type("#rg-code", "hestur-fjall-alda-123");
  await page.type("#rg-user", "bodsbarn");
  await page.type("#rg-name", "Boðsbarn");
  await page.type("#rg-pass", "langtlykilord-1");
  await page.click("#rg-under");
  await page.click("#rg-go");
  await new Promise((r) => setTimeout(r, 300));
  ok((await app.store.users()).every((u) => u.username !== "bodsbarn"),
    "an account under sixteen was created with no guardian named");
  await page.type("#rg-gname", "Foreldri Foreldrisson");
  await page.click("#rg-agree-guardian");
  await page.click("#rg-go");
  await startPractice(page, 20000);
  const made = (await app.store.users()).find((u) => u.username === "bodsbarn");
  ok(made && made.status === "active" && made.consent && made.consent.by === "Foreldri Foreldrisson",
    "the invited child is not in, or the guardian's consent was not recorded");

  await openTab(page, "class");
  await page.waitForSelector("#share-on", { timeout: 8000 });
  const seenBefore = await page.evaluate(() => fetch("/roster").then((r) => r.json()));
  ok(!seenBefore.some((r) => r.name === "Boðsbarn"), "a new user is on the roster without having chosen it");
  await page.click("#share-on");
  await page.waitForFunction(() => !document.querySelector("#share-on"), { timeout: 8000 });
  const seenAfter = await page.evaluate(() => fetch("/roster").then((r) => r.json()));
  ok(seenAfter.some((r) => r.name === "Boðsbarn"), "pressing 'Vera með' did not put the user on the roster");

  await openTab(page, "settings");
  await page.waitForSelector("#ac-del", { timeout: 8000 });
  ok(await page.$('#account a[href$="/account/export"]') !== null, "no way to fetch one's own data");
  ok(outside.length === 0, "the page asked somebody else for something: " + outside.join(", "));
  await ctx.close();
}

/* ---------- v6.3: two devices, one child -------------------------------------
 * Both open, both answer, both save. Before v6.3 the second save erased the
 * first. `window.FALLASKOLI` is the program's own state; `record()` is what an
 * answer calls, so this is two devices each answering, not two edited files. */
{
  const twin = await mkUser("tviburi", "learner");
  const A = await fresh(), B = await fresh();
  await login(A.page, "tviburi");
  await login(B.page, "tviburi");
  const answer = (page, xp) => page.evaluate(async (xp) => {
    const app = window.FALLASKOLI;
    const key = new Date(); const k = key.getFullYear() + "-" + String(key.getMonth() + 1).padStart(2, "0")
      + "-" + String(key.getDate()).padStart(2, "0");
    const d = (app.S.days[k] ||= { a: 0, c: 0, xp: 0, ms: 0, nw: 0, sk: {}, g: 10, lg: 1 });
    d.a += 1; d.c += 1; d.xp += xp; app.S.xp += xp; app.S.totalAnswers += 1; app.S.totalCorrect += 1;
    await app.save(true);
    return app.S.xp;
  }, xp);
  await answer(A.page, 40);
  await answer(B.page, 25);          // B still holds the state from before A's answer
  await new Promise((r) => setTimeout(r, 1200));
  const held = await app.store.state(twin.id);
  ok(held.xp === 65, `two devices answered for 40 and 25 XP and the server holds ${held.xp}, not 65`);
  ok(held.totalAnswers === 2, `the server counts ${held.totalAnswers} answers, not 2`);
  const onB = await B.page.evaluate(() => window.FALLASKOLI.S.xp);
  ok(onB === 65, `the second device shows ${onB} XP after the merge, not 65`);
  await A.ctx.close(); await B.ctx.close();
}

/* ---------- 9. A duel, end to end (v6.7) ---------------------------------
 * One child challenges another from Skólastofan; the challenge appears on the
 * other's blackboard; both get the same questions; the one with more right
 * wins, and the result, the badge and the ⚔️ on the board follow. */
{
  const ua = await mkUser("einvigia", "learner"), ub = await mkUser("einvigib", "learner");
  /* On the board means having progress on the server, as for the board. */
  const { blankState: blank } = await import("../src/js/core/state.js");
  await app.store.putState(ua.id, blank());
  await app.store.putState(ub.id, blank());
  const A = await fresh(), B = await fresh();
  await login(A.page, "einvigia");
  await openTab(A.page, "class");
  await A.page.waitForSelector("#duelroom .duelform #duelwho", { timeout: 15000 });
  await A.page.select("#duelwho", ub.id);
  await A.page.select("#dueltopic", "nafnord");
  await A.page.click('#duelroom [data-size="10"]');
  await A.page.click("#duelsend");
  await A.page.waitForFunction(() => /Spila/.test(document.getElementById("duelmsg")?.innerText || ""),
    { timeout: 10000 });
  const stored = await app.store.duels();
  ok(stored.length === 1 && stored[0].a === ua.id && stored[0].b === ub.id && stored[0].n === 10,
    "the challenge did not reach the server as made");

  await login(B.page, "einvigib");
  await B.page.waitForSelector("#duelbar [data-duelgo]", { timeout: 15000 });
  const offer = await B.page.$eval("#duelbar", (el) => el.innerText);
  ok(/skorar á þig/.test(offer) && /einvigia/.test(offer), "the challenge is not on the blackboard: " + offer);

  /* Both start; the questions must be the same. Answers go through finish()
     and next() — the duel's own path — A eight right, B five. */
  const play = (page, right) => page.evaluate(async (right) => {
    const app = window.FALLASKOLI;
    app.startDuel(app.duelList[0].id);
    const run = app.duelRun;
    const sig = run.tasks.map((t) => t.typeId + ":" + (t.word || "") + ":" + (t.m || t.cell || "")).join("|");
    const n = run.tasks.length;
    for (let i = 0; i < n; i++) { app.finish({ correct: i < right }); if (app.duelRun) app.next(); }
    await new Promise((r) => setTimeout(r, 800));
    return { sig, n, left: !!app.duelRun };
  }, right);
  await openTab(A.page, "practice");
  const pa = await play(A.page, 8);
  const pb = await play(B.page, 5);
  ok(pa.n === 10 && pb.n === 10, `the duel has ${pa.n} and ${pb.n} questions, not 10`);
  ok(pa.sig === pb.sig, "the two children did not get the same questions");
  ok(!pa.left && !pb.left, "the duel did not end after the last question");

  const done = await app.store.duels();
  ok(done[0].res.a && done[0].res.a.c === 8 && done[0].res.b && done[0].res.b.c === 5,
    "the server does not hold both scores: " + JSON.stringify(done[0].res));

  await A.page.evaluate(() => window.FALLASKOLI.loadDuels());
  await A.page.waitForFunction(() => (window.FALLASKOLI.S.duels || {})[window.FALLASKOLI.duelList[0]?.id] === "w",
    { timeout: 10000 }).catch(() => {});
  const ra = await A.page.evaluate(() => ({
    book: Object.values(window.FALLASKOLI.S.duels || {}), win: !!window.FALLASKOLI.S.badges.duel_win1,
    first: !!window.FALLASKOLI.S.badges.duel_first,
    bar: document.getElementById("duelbar").innerText }));
  ok(ra.book.join() === "w", "the winner's state does not record the win: " + ra.book.join());
  ok(ra.win && ra.first, "the duel badges were not awarded");
  ok(/Sigur/.test(ra.bar) && /8\/10/.test(ra.bar), "the blackboard does not announce the win: " + ra.bar);
  const rb = await B.page.evaluate(async () => { await window.FALLASKOLI.loadDuels();
    return Object.values(window.FALLASKOLI.S.duels || {}); });
  ok(rb.join() === "l", "the loser's state does not record the loss: " + rb.join());

  await A.page.evaluate(() => window.FALLASKOLI.save(true));
  await new Promise((r) => setTimeout(r, 600));
  await openTab(A.page, "class");
  await A.page.evaluate(() => document.querySelector('[data-metric="duels"]').click());
  await A.page.waitForFunction(() => document.querySelector('[data-metric="duels"]')?.getAttribute("aria-pressed") === "true",
    { timeout: 8000 });
  await new Promise((r) => setTimeout(r, 500));
  const board = await A.page.$eval("#board", (el) => el.innerText);
  ok(/⚔️ 1/.test(board), "the board does not show the duel won");
  await A.ctx.close(); await B.ctx.close();
}

await browser.close();
await new Promise((r) => app.server.close(r));
await fs.rm(dir, { recursive: true, force: true });

console.log(`\n${checks} checks, ${problems.length} problems`);
if (problems.length) {
  problems.forEach((p) => console.log("  ✗ " + p));
  process.exit(1);
}
console.log("server and app work together");
