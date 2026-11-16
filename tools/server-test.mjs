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
  /* Item 84: a new account is met by the guided first run; these checks are
     about other things (tools/tour-test.mjs is the first run's own). */
  await page.evaluateOnNewDocument(() => { window.FALLASKOLI_NO_TOUR = true; });
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
    /* Right after login the first card may still be drawn again (a worked
       example, the social picture arriving) and swallow the click: try the ×
       again rather than fail on a race. */
    for (let k = 0; ; k++) {
      await page.click("#runstop");
      try { await page.waitForSelector("#runquit-yes", { timeout: 4000 }); break; }
      catch (e) { if (k >= 2) throw e; }
    }
    await page.click("#runquit-yes");
    await page.waitForFunction("!document.body.classList.contains('insession')", { timeout: 5000 });
    /* Item 61: the badge windows held during the session open on its
       summary, and their backdrop lies over the tabs. A child closes them
       first; so does this. */
    await page.waitForSelector(".scrim .modal", { timeout: 1500 }).catch(() => {});
  }
  await closeWindows(page);
  await page.click(`nav.tabs button[data-view="${view}"]`);
}

/** Close every badge window that is open, one after another. */
async function closeWindows(page) {
  for (let k = 0; k < 15 && await page.$(".scrim .modal button"); k++) {
    await page.evaluate(() => document.querySelector(".scrim .modal button")?.click());
    await new Promise((r) => setTimeout(r, 250));
  }
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

  /* v6.13 (item 58): the board opens on Framfarir, and says what it counts.
     Both seeds earned their XP in March and mended nothing, so this week is
     level at nought — press XP to get the all-time order. */
  ok(await page.$eval('[data-metric="framfarir"]', (b) => b.getAttribute("aria-pressed")) === "true",
    "the board does not open on Framfarir");
  ok((await page.$eval(".weekline", (p) => p.textContent)).includes("villumynstur"),
    "the Framfarir board does not say what it counts");
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
  /* The overtaking badge is judged as soon as the roster arrives. Since
     item 61 its window does NOT open over the question — login() has started
     a session, and windows wait for its summary; the badge itself is in the
     cabinet at once (checked below, `seen.mine`). */
  await page.waitForFunction(() => !!window.FALLASKOLI.S.badges.soc_overtake, { timeout: 10000 }).catch(() => {});
  const modal = await page.evaluate(() => document.querySelector(".scrim .modal")?.textContent || "");
  ok(!/Framúrakstur/.test(modal), "the Framúrakstur window opened over a question in a session (item 61)");
  await closeWindows(page);
  /* The child's own card is on Merki og framvinda, the others in Skólastofan. */
  await page.evaluate(() => document.querySelector('nav.tabs button[data-view="progress"]').click());
  await page.evaluate(() => document.querySelector('nav.tabs button[data-view="class"]').click());
  await page.waitForSelector("#board table.board tr.meRow", { timeout: 10000 });
  await page.waitForSelector("#roster .rosteruser", { timeout: 10000 });
  /* Since item 58 the board opens on Framfarir; the week is one press away. */
  await page.evaluate(() => document.querySelector('[data-metric="week"]').click());
  await page.waitForFunction(
    () => document.querySelector('[data-metric="week"]')?.getAttribute("aria-pressed") === "true",
    { timeout: 10000 });
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

/* ---------- 9. A duel, end to end (v6.7; graded by the server, v6.13) -------
 * One child challenges another from Skólastofan; the challenge appears on the
 * other's blackboard. Each presses play, gets their OWN questions (the same
 * types in the same order, other words) and answers; the browser sends the
 * answers and the SERVER counts them (critique items 62 and 63). The one on
 * the lower level is given a right answer in advance (item 66). The result,
 * the badge and the ⚔️ on the board follow.
 *
 * This test builds both players' questions here in Node from the seeds the
 * server holds, exactly as the server does when it grades — so "the browser
 * built the same questions as the server" is checked between a real browser
 * running the bundled file and Node running the modules. */
{
  const ua = await mkUser("einvigia", "learner"), ub = await mkUser("einvigib", "learner");
  /* On the board means having progress on the server, as for the board. */
  const { blankState: blank, newSession } = await import("../src/js/core/state.js");
  const { skillNeed } = await import("../src/js/core/progress.js");
  const { createPolicy } = await import("../src/js/core/policy.js");
  const { nextTask, buildTask, makeView, applyEffects } = await import("../src/js/tasks/index.js");
  const { duelTasks, signature } = await import("../src/js/core/duel.js");
  const { buildLexicon } = await import("../src/js/core/lexicon.js");
  const { DATA } = await import("../data/data_bundle.js");
  const { rightResponse, wrongResponse } = await import("../tests/helpers.js");
  /* A is two levels above B in nouns: B is given one right answer of ten. */
  const strong = blank();
  strong.skills.nafnord.xp = skillNeed(3);
  await app.store.putState(ua.id, strong);
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
  const duel = stored[0];
  ok(duel.lv && duel.lv.a === 3 && duel.lv.b === 1, "the duel does not know the two levels: " + JSON.stringify(duel.lv));

  await login(B.page, "einvigib");
  await B.page.waitForSelector("#duelbar [data-duelgo]", { timeout: 15000 });
  const offer = await B.page.$eval("#duelbar", (el) => el.innerText);
  ok(/skorar á þig/.test(offer) && /einvigia/.test(offer), "the challenge is not on the blackboard: " + offer);
  ok(/Þú færð 1 rétt svar í forgjöf/.test(offer), "the offer does not say that B starts one answer ahead: " + offer);

  /* Item 62. Before play, the browser holds no seed … */
  const held = await B.page.evaluate(() => JSON.stringify([window.FALLASKOLI.duelList, window.FALLASKOLI.duelInfo]));
  ok(![duel.seed, duel.keys.a, duel.keys.b].some((x) => held.includes(String(x))) && !/"seed"|"key"/.test(held),
    "the list of duels carries a seed before the pupil has pressed play");
  /* … and what the developer tools could post until now is refused. */
  const forged = await B.page.evaluate(async (id) => {
    const post = (body) => fetch(`/duels/${id}/result`, { method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.status);
    return [await post({ c: 10, n: 10, sig: "s" }), await post({ answers: Array(10).fill({ text: "a" }), sig: "s" })];
  }, duel.id);
  ok(forged[0] === 400 && forged[1] === 409, "a forged result was not refused: " + forged.join());
  ok(!(await app.store.duels())[0].res.b, "a forged result was stored");

  /* The questions as the server will build them, and the answers to give:
     the first `right` right, the rest wrong. */
  const lex = buildLexicon(DATA, { hide: new Set(DATA.blocked || []) });
  const deps = { nextTask, buildTask, makeView, applyEffects, blankState: blank, newSession, createPolicy };
  const questions = (side) => duelTasks(lex, { ...duel, side, key: duel.keys[side] }, deps);
  const qa = questions("a"), qb = questions("b");
  const answersFor = (tasks, right) => tasks.map((t, i) => (i < right ? rightResponse(t) : wrongResponse(t)));

  /* Play. A question with one text box is answered through the box and the
     button, as a pupil does — that is the path that keeps the answer for the
     server (ui/render.js `conclude`). The other kinds are answered through
     the same two calls `conclude` makes. */
  const play = (page, answers, right) => page.evaluate(async (answers, right) => {
    const app = window.FALLASKOLI;
    await app.startDuel(app.duelList[0].id);
    const run = app.duelRun;
    if (!run) return { started: false, bar: document.getElementById("duelbar").innerText };
    const sig = run.sig, n = run.tasks.length, types = run.tasks.map((t) => t.typeId);
    const strip = document.getElementById("duelbar").innerText;
    let typed = 0;
    for (let i = 0; i < n; i++) {
      const box = document.getElementById("ans"), check = document.getElementById("check");
      if (["fill", "gap", "verb", "verbslot"].includes(app.cur.type) && box && check && answers[i].text) {
        box.value = answers[i].text;
        check.click();
        typed++;
      }
      /* Every other kind — and a box that did not take the answer. */
      if (run.i === i) {
        app.duelAnswer(app.cur, answers[i]);
        app.finish({ correct: i < right });
      }
      if (app.duelRun) app.next();
    }
    await new Promise((r) => setTimeout(r, 1500));
    return { started: true, sig, n, types, strip, typed, left: !!app.duelRun,
      sent: app.duelSent && { c: app.duelSent.c, n: app.duelSent.n, error: app.duelSent.error || null } };
  }, answers, right);
  await openTab(A.page, "practice");
  const pa = await play(A.page, answersFor(qa, 8), 8);
  const pb = await play(B.page, answersFor(qb, 5), 5);
  ok(pa.started && pb.started, "a duel did not start: " + (pa.bar || pb.bar || ""));
  ok(pa.n === 10 && pb.n === 10, `the duel has ${pa.n} and ${pb.n} questions, not 10`);
  ok(pa.sig === signature(qa) && pb.sig === signature(qb),
    "the browser did not build the questions the server grades");
  ok(pa.sig !== pb.sig, "item 63: the two children got the same questions");
  ok(pa.types.join() === pb.types.join(), "item 63: the two children's questions are not of the same types, line by line");
  ok(/ekki þær sömu/.test(pa.strip), "the strip does not say that the questions are not the same: " + pa.strip);
  ok(/einvigib er á lægra stigi en þú í þessu efni og fær því 1 rétt svar í forgjöf/.test(pa.strip),
    "the strip does not tell A about B's handicap: " + pa.strip);
  ok(pa.typed + pb.typed > 0, "no question was answered through its text box — the path that keeps the answer was not run");
  ok(!pa.left && !pb.left, "the duel did not end after the last question");
  ok(pa.sent && !pa.sent.error && pa.sent.c === 8, "A is not shown the server's score: " + JSON.stringify(pa.sent));

  /* The scores are the SERVER's count of the answers it was sent. */
  const done = await app.store.duels();
  ok(done[0].res.a && done[0].res.a.c === 8 && done[0].res.b && done[0].res.b.c === 5,
    "the server did not grade both sets of answers: " + JSON.stringify(done[0].res));
  ok(done[0].res.a.n === 10 && !("answers" in done[0].res.a) && !/xq/.test(JSON.stringify(done[0])),
    "the server kept the answers, not only the score");

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
  /* Item 66: the result says what was given, to whom, and the sum. */
  ok(/fékk því 1 rétt svar\s+í forgjöf \(5 \+ 1 = 6\)/.test(ra.bar) && /jafnara/.test(ra.bar),
    "the winner is not told about the handicap: " + ra.bar);
  const rb = await B.page.evaluate(async () => { await window.FALLASKOLI.loadDuels();
    return { book: Object.values(window.FALLASKOLI.S.duels || {}), bar: document.getElementById("duelbar").innerText }; });
  ok(rb.book.join() === "l", "the loser's state does not record the loss: " + rb.book.join());
  ok(/Þú fékkst 1 rétt svar í forgjöf \(5 \+ 1 = 6\)/.test(rb.bar), "B is not shown the sum with the handicap: " + rb.bar);

  await A.page.evaluate(() => window.FALLASKOLI.save(true));
  await new Promise((r) => setTimeout(r, 600));
  await openTab(A.page, "class");
  /* The window announcing the duel badges may lie over the tabs, so the view
     is opened by the call the tab makes. */
  await A.page.evaluate(() => window.FALLASKOLI.openView("class"));
  await A.page.waitForFunction(() => /Sigur/.test(document.getElementById("duelroom")?.innerText || ""),
    { timeout: 10000 }).catch(() => {});
  const room = await A.page.$eval("#duelroom", (el) => el.innerText);
  ok(/forgjöf hins: \+1/.test(room), "the duel room does not show the handicap beside the scores: " + room);
  await A.page.evaluate(() => document.querySelector('[data-metric="duels"]').click());
  await A.page.waitForFunction(() => document.querySelector('[data-metric="duels"]')?.getAttribute("aria-pressed") === "true",
    { timeout: 8000 });
  await new Promise((r) => setTimeout(r, 500));
  const board = await A.page.$eval("#board", (el) => el.innerText);
  ok(/⚔️ 1/.test(board), "the board does not show the duel won");
  await A.ctx.close(); await B.ctx.close();
}

/* ---------- 10. The teacher: an assignment and the class's patterns ------
 * Items 37 and 65, through the screen. A guardian sets an assignment in
 * Skólastofan; a pupil of the group finds it at the top of Æfa, above
 * today's session, and does it with one tap; the result reaches the server
 * and the teacher's screen, beside the class's pattern table and its CSV.
 * A pupil gets none of the teacher's part, on the screen or from the routes. */
{
  await app.store.updateGroups((g) => ({ ...g, h8a: { name: "8. A" } }));
  const inGroup = async (u) => {
    await app.store.updateUsers((list) => { list.find((x) => x.id === u.id).group = "h8a"; return list; });
    return u;
  };
  const kenn = await inGroup(await mkUser("kennari", "guardian"));
  const nemi = await inGroup(await mkUser("nemi", "learner"));
  const onnur = await inGroup(await mkUser("onnur", "learner"));
  /* onnur has practised before: þolfall and þágufall often wrong lately */
  const { blankState: blank } = await import("../src/js/core/state.js");
  await app.store.putState(onnur.id, { ...blank(), diag: {
    thf_thgf: { n: 14, w: 7, h: "0101100110", last: "2026-11-10", ex: [{ w: "hestur|kk", m: "ÞGFET", o: "ÞFET" }] },
    ef: { n: 6, w: 1, h: "111011", last: null, ex: [] },
  } });

  /* The teacher sets five questions on nouns, with a note. */
  const T = await fresh();
  await login(T.page, "kennari");
  await openTab(T.page, "class");
  await T.page.waitForSelector('#teacher #tc-what option[value="skill:nafnord"]', { timeout: 15000 });
  await T.page.waitForSelector("#tc-table table.classpat", { timeout: 15000 });
  const table = await T.page.evaluate(() => ({
    heads: [...document.querySelectorAll("#tc-table th.cphead")].map((h) => h.textContent.trim()),
    rows: [...document.querySelectorAll("#tc-table th.cpname")].map((h) => h.textContent.trim()),
    active: document.querySelectorAll("#tc-table td.cpcell.active").length,
    csv: document.getElementById("tc-csv")?.getAttribute("href") || "",
  }));
  ok(table.heads[0] === "Þolfall og þágufall ruglast",
    "the class's worst pattern is not the first column: " + table.heads.join(" | "));
  ok(table.heads[table.heads.length - 1] === "Ógreint", "Ógreint is not the last column");
  ok(table.rows.includes("onnur") && table.rows.includes("nemi") && !table.rows.includes("barn"),
    "the table does not hold exactly the group's pupils: " + table.rows.join(", "));
  ok(table.active === 1, `${table.active} cells marked "algengt núna", not 1`);
  const csv = await T.page.evaluate((href) => fetch(href).then((r) => r.text()), table.csv);
  /* (fetch drops the byte-order mark; tests/teacher.test.js checks it) */
  ok(/^\uFEFF?Nemandi;Þolfall og þágufall ruglast/.test(csv) && /\r\nonnur;50;/.test(csv),
    "the CSV download is not the table: " + csv.slice(0, 120));

  await T.page.select("#tc-what", "skill:nafnord");
  await T.page.select("#tc-n", "5");
  await T.page.type("#tc-note", "Fyrir föstudag");
  await T.page.click("#tc-set");
  await T.page.waitForFunction(() => /komið til nemendanna/.test(document.getElementById("tc-list")?.innerText || ""),
    { timeout: 10000 });
  const set = (await app.store.assignments()).filter((a) => a.group === "h8a");
  ok(set.length === 1 && set[0].n === 5 && set[0].target.id === "nafnord" && set[0].by === kenn.id,
    "the assignment did not reach the server as set: " + JSON.stringify(set));

  /* The pupil: at the top of Æfa, above today's session; one tap starts it. */
  const P = await fresh();
  await P.page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await P.page.waitForSelector("#lg-user", { timeout: 15000 });
  await P.page.type("#lg-user", "nemi");
  await P.page.type("#lg-pass", "lykilordid-mitt");
  await P.page.click("#lg-in");
  await P.page.waitForSelector("#task .assignbox [data-assign]", { timeout: 20000 });
  const card = await P.page.evaluate(() => {
    const box = document.querySelector("#task .assignbox");
    const today = document.querySelector("#task .todaybox");
    return { text: box.innerText,
      first: !today || !!(box.compareDocumentPosition(today) & Node.DOCUMENT_POSITION_FOLLOWING),
      focused: document.activeElement?.dataset?.assign || null };
  });
  ok(/Nafnorð/.test(card.text) && /5 spurningar/.test(card.text) && /Fyrir föstudag/.test(card.text),
    "the assignment card does not say what it is: " + card.text);
  ok(card.first, "the assignment is not above today's session");
  ok(card.focused === set[0].id, "the assignment's button does not have the focus");
  await P.page.click("#task .assignbox [data-assign]");
  await P.page.waitForFunction("window.FALLASKOLI.run && window.FALLASKOLI.cur", { timeout: 10000 });
  const run = await P.page.evaluate(() => {
    const A = window.FALLASKOLI;
    return { n: A.run.n, topic: A.run.topic, line: document.querySelector("#runbar .runtopic")?.textContent || "",
      skill: A.cur.skill };
  });
  ok(run.n === 5 && run.topic === "verkefni", `the session is ${run.topic}/${run.n}, not the assignment's 5`);
  ok(/Verkefni: Nafnorð/.test(run.line), "the session line does not name the assignment: " + run.line);
  /* Four right and one wrong, through the session's own path; every
     question must be about nouns. */
  const skills = await P.page.evaluate(async () => {
    const A = window.FALLASKOLI;
    const seen = [];
    for (let i = 0; i < 5 && A.run; i++) {
      seen.push(A.cur.skill);
      A.finish({ correct: i !== 2 });
      A.next();
    }
    return seen;
  });
  ok(skills.length === 5 && skills.every((s) => s === "nafnord"),
    "the assignment asked about something other than nouns: " + skills.join(","));
  await P.page.waitForFunction(() => /Niðurstaðan er skráð/.test(document.querySelector("#task .summary")?.innerText || ""),
    { timeout: 10000 });
  const res = (await app.store.assignments()).find((a) => a.id === set[0].id).res[nemi.id];
  /* A first session wins badges, and their windows cover the tabs: close them. */
  for (let k = 0; k < 10 && await P.page.$(".scrim .modal button"); k++) {
    await P.page.evaluate(() => document.querySelector(".scrim .modal button")?.click());
    await new Promise((r) => setTimeout(r, 250));
  }
  ok(res && res.done && res.i === 5 && res.c === 4, "the result on the server is " + JSON.stringify(res));

  /* The pupil sees nothing of the teacher's part, and the routes refuse. */
  await openTab(P.page, "class");
  await new Promise((r) => setTimeout(r, 500));
  ok(await P.page.$eval("#teacher", (e) => e.innerText.trim().length) === 0, "a pupil can see the teacher's part");
  const refused = await P.page.evaluate(() => Promise.all(["/teacher/patterns", "/teacher/assignments",
    "/teacher/patterns.csv"].map((p) => fetch(p).then((r) => r.status))));
  ok(refused.every((s) => s === 403), "a pupil got " + refused.join(",") + " from the teacher's routes");
  /* …and the page names who can see their patterns. */
  await openTab(P.page, "settings");
  await P.page.waitForSelector("#ac-del", { timeout: 8000 });
  ok(/kennari er kennari eða forsjáraðili hópsins þíns/.test(await P.page.$eval("#account", (e) => e.innerText)),
    "the pupil's account page does not say who sees their patterns");

  /* The teacher: who finished, the score, and the patterns on nouns.
     The card from before the pupil answered is still on the page until the
     tab's asynchronous redraw replaces it: mark it, and wait for a fresh
     one, or the check reads the old figures (a race that went either way
     by a few milliseconds). */
  await T.page.evaluate(() => document.querySelectorAll("#tc-list .assigncard")
    .forEach((e) => { e.dataset.stale = "1"; }));
  await openTab(T.page, "practice");
  await openTab(T.page, "class");
  await T.page.waitForSelector("#tc-list .assigncard:not([data-stale])", { timeout: 10000 });
  await T.page.evaluate(() => { document.querySelector("#tc-list .assigncard details").open = true; });
  const seen = await T.page.$eval("#tc-list .assigncard", (e) => e.innerText);
  ok(/1 af 2/.test(seen) && /hafa lokið/.test(seen), "the teacher does not see who finished: " + seen);
  ok(/4 af 5 \(80%\)/.test(seen), "the teacher does not see the score");
  ok(/ekki byrjað/.test(seen), "the pupil who has not started is not shown as such");
  ok(/Þolfall og þágufall ruglast/.test(seen), "the class's patterns on the material are missing");

  /* Item 83 (d): the teacher opens one pupil's skill map — the pupil's own
     map, without "last trained", the words and the button. */
  await T.page.waitForSelector(`#tc-pupil option[value="${onnur.id}"]`, { timeout: 10000 });
  await T.page.select("#tc-pupil", onnur.id);
  await T.page.waitForSelector("#tc-map .skillboard.teacher .smnode", { timeout: 10000 });
  const tmap = await T.page.evaluate(() => ({
    title: document.querySelector("#tc-map .smtitle")?.innerText || "",
    nodes: document.querySelectorAll("#tc-map .smtrail .smnode").length,
    flag: document.querySelector('#tc-map .smtrail .smnode[data-node="no-foll"] .smflag')?.innerText.trim() || "",
    label: document.querySelector('#tc-map .smtrail .smnode[data-node="no-foll"]')?.getAttribute("aria-label") || "",
    dates: document.querySelectorAll("#tc-map .smlast").length,
    /* The nodes and the heads of the trails — not the legend, which says
       what the number on a yellow disc counts ("upprifjanir í dag"). */
    text: [...document.querySelectorAll("#tc-map .smnode, #tc-map .smhead, #tc-map .smnext")].map((e) => e.innerText).join(" | "),
    legend: document.querySelector("#tc-map .smlegend")?.innerText || "",
    overflow: document.documentElement.scrollWidth - innerWidth,
  }));
  ok(/Færnikort · onnur/.test(tmap.title) && tmap.nodes >= 40, `the teacher's map of the pupil did not draw: ${tmap.title}, ${tmap.nodes} nodes`);
  ok(tmap.flag === "!" && /Bíður nemandans: 1 villumynstur algengt núna/.test(tmap.label), `the pupil's active pattern is not on its node: ${tmap.flag} / ${tmap.label}`);
  ok(tmap.dates === 0 && !/í gær|í dag|fyrir \d+ (dögum|vikum)|ekki æft enn|XP/.test(tmap.text), "the teacher's map says when the pupil practised, or their XP");
  ok(/nemandinn nær/.test(tmap.legend) && !/þú nærð|bíður þín/.test(tmap.legend), "the teacher's legend speaks to the pupil: " + tmap.legend.slice(0, 160));
  ok(tmap.overflow <= 1, `the teacher's map scrolls sideways by ${tmap.overflow}px`);
  if (process.env.BT_SHOT) await T.page.screenshot({ path: process.env.BT_SHOT + "-map.png", fullPage: true });
  await T.page.evaluate(() => document.querySelector('#tc-map .smtrail .smnode[data-node="no-foll"]').click());
  await T.page.waitForSelector('.smpanel[data-panel="no-foll"]', { timeout: 5000 });
  const tnode = await T.page.evaluate(() => { const p = document.querySelector(".smpanel"); return {
    text: p.innerText.replace(/\s+/g, " "), go: !!p.querySelector("[data-nodego]"), facts: p.querySelectorAll(".smfact").length }; });
  ok(/Þolfall og þágufall ruglast/.test(tnode.text) && /Bíður nemandans/.test(tnode.text) && tnode.facts === 2 && !tnode.go,
    `the node the teacher opened should show the pattern and no session button: ${tnode.text.slice(0, 200)}`);
  ok(!/hestur|Síðast æft/.test(tnode.text) && /ekki hvenær nemandinn æfði sig/.test(tnode.text), "the teacher's node shows a word or a date, or does not say what is left out");
  if (process.env.BT_SHOT) await T.page.screenshot({ path: process.env.BT_SHOT + "-node.png" });
  await T.page.keyboard.press("Escape");
  /* A pupil is refused the route, for a classmate and for themselves. */
  const tref = await P.page.evaluate((ids) => Promise.all(ids.map((id) => fetch("/teacher/skillmap?pupil=" + id).then((r) => r.status))), [onnur.id, nemi.id]);
  ok(tref.every((x) => x === 403), "a pupil got " + tref.join(",") + " from the skill map route");
  await T.ctx.close(); await P.ctx.close();
}

/* ---------- 11. A live class round (v6.13, item 64): a teacher and two pupils ----
   Three browsers. The teacher opens a round of five questions on the
   projector; two pupils join from the strip above their question, answer
   through the ordinary input and button against the shared clock, one of
   them reloads in the middle, and the round ends on the board. */
{
  await app.store.updateGroups((g) => ({ ...g, h9l: { name: "9. L" } }));
  const inG = async (u, extra = {}) => {
    await app.store.updateUsers((list) => { Object.assign(list.find((x) => x.id === u.id), { group: "h9l" }, extra); return list; });
    return u;
  };
  await inG(await mkUser("kennari9", "guardian"));
  await inG(await mkUser("lifa", "learner"));
  /* lifb has not chosen to be on the leaderboard: never named on the wall. */
  await inG(await mkUser("lifb", "learner"), { share: { board: false, minutes: false } });

  const T = await fresh();
  await login(T.page, "kennari9");
  await openTab(T.page, "class");
  await T.page.waitForSelector('#tc-live-what option[value="node:lo-samraemi"]', { timeout: 15000 });
  await T.page.select("#tc-live-what", "node:lo-samraemi");
  await T.page.select("#tc-live-n", "5");
  await T.page.select("#tc-live-secs", "20");
  await T.page.click("#tc-live-start");
  const boardText = () => T.page.evaluate(() => document.querySelector(".liveboard")?.innerText || "");
  await T.page.waitForFunction(() => /Vertu með/.test(document.querySelector(".liveboard")?.innerText || ""), { timeout: 15000 });

  const pupil = async (name) => {
    const P = await fresh();
    await login(P.page, name);
    await P.page.waitForSelector("#livejoin", { timeout: 20000 });
    await P.page.click("#livejoin");
    await P.page.waitForFunction(() => window.FALLASKOLI.liveRun && /Bíddu eftir að kennarinn byrji/.test(
      document.getElementById("livebar")?.innerText || ""), { timeout: 10000 });
    return P;
  };
  const P1 = await pupil("lifa");
  const P2 = await pupil("lifb");
  ok(/Leikmaður 2/.test(await P2.page.$eval("#livebar", (e) => e.innerText)),
    "a pupil off the leaderboard is not told the alias the wall shows");
  await T.page.waitForFunction(() => /2 nemendur eru með/.test(document.querySelector(".liveboard")?.innerText || ""), { timeout: 10000 });
  await T.page.click(".liveboard [data-lb=next]");

  const onQuestion = (P, q) => P.page.waitForFunction((q) => {
    const A = window.FALLASKOLI;
    return A.cur && A.cur.live && A.cur.liveQ === q && document.querySelector("#task #ans") &&
      !document.getElementById("task").classList.contains("livewait");
  }, { timeout: 15000 }, q);
  const answer = async (P, right) => {
    const text = await P.page.evaluate((right) => {
      const t = window.FALLASKOLI.cur;
      /* Wrong: the dictionary form, as a pupil who forgot to inflect would. */
      const lemma = String(t.cue || "").split(" · ")[0];
      return right ? t.answers[0] : (lemma && !t.answers.includes(lemma) ? lemma : "rangt");
    }, right);
    await P.page.click("#ans", { clickCount: 3 });
    await P.page.type("#ans", text);
    await P.page.click("#check");
    /* Covered until the question closes — or already closed, if this was
       the last answer the round was waiting for. */
    await P.page.waitForFunction(() => /livewait|livedone/.test(document.getElementById("task").className), { timeout: 5000 });
  };

  for (let q = 0; q < 5; q++) {
    await T.page.waitForFunction((q) => new RegExp(`Spurning ${q + 1} af 5`).test(document.querySelector(".liveboard")?.innerText || "")
      && document.querySelector(".liveboard .livecard .card"), { timeout: 15000 }, q);
    if (q === 0) {
      const wall = await T.page.evaluate(() => {
        const c = document.querySelector(".liveboard .livecard");
        const go = c.querySelector("button.go");
        return { inert: c.inert, ids: c.querySelectorAll("[id]").length, go: go ? getComputedStyle(go).display : "none",
          dup: document.querySelectorAll("#task").length };
      });
      ok(wall.inert && wall.ids === 0 && wall.go === "none" && wall.dup <= 1,
        "the question on the wall is not a read-only copy: " + JSON.stringify(wall));
    }
    await onQuestion(P1, q);
    if (q === 2) {
      /* lifb reloads in the middle of a question: back in the round, the
         same question, by itself. */
      await P2.page.reload({ waitUntil: "domcontentloaded" });
    }
    await onQuestion(P2, q);
    const same = await Promise.all([P1, P2].map((P) => P.page.evaluate(() => JSON.stringify(window.FALLASKOLI.cur.s || window.FALLASKOLI.cur.w || ""))));
    ok(same[0] === same[1], `question ${q + 1} differs between the two pupils`);
    await answer(P1, true);
    /* Answered: the verdict is drawn but hidden until the question closes. */
    const hidden = await P1.page.evaluate(() => {
      const v = document.querySelector("#task #verdict .verdict");
      return { drawn: !!v, shown: v ? v.getClientRects().length > 0 : false,
        bar: document.getElementById("livebar").innerText };
    });
    ok(hidden.drawn && !hidden.shown, `question ${q + 1}: the verdict shows before the question closes`);
    ok(/Bíddu eftir hinum/.test(hidden.bar), "the strip does not say to wait for the others");
    await answer(P2, false);
    await T.page.waitForFunction((q) => {
      const t = document.querySelector(".liveboard")?.innerText || "";
      return new RegExp(`Spurning ${q + 1} af 5`).test(t) && /Rétt: 1/.test(t) && /Rangt: 1/.test(t);
    }, { timeout: 15000 }, q);
    for (const [P, word] of [[P1, "Rétt!"], [P2, "Ekki rétt"]]) {
      await P.page.waitForFunction((word) => {
        const v = document.querySelector("#task #verdict .verdict");
        return v && v.getClientRects().length > 0 && document.getElementById("livebar").innerText.includes(word);
      }, { timeout: 10000 }, word);
    }
    await T.page.click(".liveboard [data-lb=next]");
  }

  await T.page.waitForFunction(() => /Úrslit/.test(document.querySelector(".liveboard")?.innerText || ""), { timeout: 15000 });
  const end = await boardText();
  ok(/1\.\s*lifa/.test(end) && /Leikmaður 2/.test(end), "the podium is not lifa then Leikmaður 2: " + end.slice(0, 300));
  ok(!/lifb/.test(end), "a pupil off the leaderboard was named on the wall");
  ok(/50% spurninganna rétt/.test(end), "the class's share is not 50%: " + end.slice(0, 400));
  ok(await T.page.$(".liveboard .lbrule") !== null, "the end does not show the commonest error (or say there was none)");
  await P1.page.waitForFunction(() => /1\. sæti með 5 rétt af 5/.test(document.getElementById("livebar")?.innerText || ""), { timeout: 10000 });
  await P2.page.waitForFunction(() => /2\. sæti með 0 rétt af 5/.test(document.getElementById("livebar")?.innerText || ""), { timeout: 10000 });
  /* The answers were practice: they are in the pupil's own progress. */
  const n = await P1.page.evaluate(() => Object.values(window.FALLASKOLI.S.skills).reduce((a, s) => a + (s.c || 0) + (s.w || 0), 0));
  ok(n >= 5, "the round's answers are not in the pupil's own progress: " + n);
  /* The pupil closes the round and is back at practice. */
  await P1.page.click("#liveleave");
  await P1.page.waitForFunction(() => !window.FALLASKOLI.liveRun && !document.getElementById("livebar").innerText.trim(), { timeout: 5000 });
  /* The teacher closes the wall and has the form again. */
  await T.page.click(".liveboard [data-lb=close]");
  await T.page.waitForSelector("#tc-live-start", { timeout: 10000 });
  ok(!(await T.page.$(".liveboard")), "the projector layer did not close");

  /* Item 67: a team duel. Two more pupils, and the class is split in two
     from the teacher's section; lifa plays from the duel strip, through
     the real input, and the server grades what it built itself. */
  await inG(await mkUser("lifc", "learner"));
  await inG(await mkUser("lifd", "learner"));
  await openTab(T.page, "practice");
  await openTab(T.page, "class");
  /* The section from before the two new pupils may still be on the page
     while the tab redraws; "split" is offered only by the fresh one. */
  await T.page.waitForSelector('#tc-team-vs option[value="split"]', { timeout: 15000 });
  await T.page.waitForSelector('#tc-team-what option[value="node:lo-samraemi"]', { timeout: 15000 });
  await T.page.select("#tc-team-what", "node:lo-samraemi");
  await T.page.select("#tc-team-vs", "split");
  await T.page.select("#tc-team-n", "10");
  await T.page.click("#tc-team-set");
  await T.page.waitForFunction(() => /Einvígið er hafið/.test(document.getElementById("tc-team")?.innerText || ""), { timeout: 10000 });
  const td = (await app.store.teamDuels()).find((d) => d.groups.a === "h9l");
  ok(td && td.teams.a.length === 2 && td.teams.b.length === 2, "the class was not split in two: " + JSON.stringify(td && td.teams));
  await P1.page.evaluate(() => window.FALLASKOLI.loadDuels());
  await P1.page.waitForFunction(() => /Bekkjareinvígi/.test(document.getElementById("duelbar")?.innerText || ""), { timeout: 10000 });
  await P1.page.click("#duelbar [data-duelgo]");
  await P1.page.waitForFunction(() => window.FALLASKOLI.duelRun && document.querySelector("#task #ans"), { timeout: 20000 });
  ok(/Bekkjareinvígi/.test(await P1.page.$eval("#duelbar", (e) => e.innerText)), "the run's strip does not name the team duel");
  for (let k = 0; k < 10; k++) {
    await P1.page.waitForFunction(() => { const a = document.querySelector("#task #ans"); return a && !a.disabled; }, { timeout: 10000 });
    await P1.page.evaluate(() => {
      const A = window.FALLASKOLI;
      document.getElementById("ans").value = A.cur.answers[0];
      document.getElementById("check").click();
      A.next();
    });
  }
  await P1.page.waitForFunction(() => /Þú fékkst 10 af 10/.test(document.getElementById("duelbar")?.innerText || ""), { timeout: 15000 });
  const graded = (await app.store.teamDuels()).find((d) => d.id === td.id).res;
  const lifaId = (await app.store.users()).find((u) => u.username === "lifa").id;
  ok(graded[lifaId] && graded[lifaId].c === 10 && graded[lifaId].n === 10,
    "the server did not grade the team duel as played: " + JSON.stringify(graded));
  await T.page.evaluate(() => document.getElementById("tc-team").dataset.stale = "1");
  await openTab(T.page, "practice");
  await openTab(T.page, "class");
  await T.page.waitForFunction(() => /1 af 2 hefur spilað · 10 rétt að meðaltali/.test(document.getElementById("tc-team")?.innerText || ""), { timeout: 10000 });
  for (const X of [T, P1, P2]) await X.ctx.close();
}

/* ---------- Calibration, end to end (items 17 and 38) -------------------
 * A table published by the server reaches the browser and the lexicon; real
 * answers, typed and checked on the screen, reach the server's counts with
 * nobody's name on them; the pupil's own switch stops it; the teacher's
 * switch for the sample of wrong answers is off until clicked and is then
 * said on the pupil's page; and the administrator's record draws. */
{
  await app.store.updateGroups((g) => { g.hkv = { name: "Kvörðunarhópur" }; return g; });
  const setGroup = (u, group) => app.store.updateUsers((users) => {
    Object.assign(users.find((x) => x.id === u.id), { group, lastSeen: new Date().toISOString().slice(0, 10) });
    return users;
  });
  const telja = await mkUser("telja", "learner");
  const kvkenn = await mkUser("kvkennari", "guardian");
  await setGroup(telja, "hkv"); await setGroup(kvkenn, "hkv");
  const built = app.lex.cellHardness("EFFT");
  const moved = built >= 4.5 ? built - 0.5 : built + 0.5;
  /* A table as a weekly run would have left it, and not due again for a week. */
  await app.store.updateCalibration(() => ({ v: 1, lastRun: new Date().toISOString(), runs: 1,
    counts: { types: {}, cells: {}, distinct: {} }, since: { questions: 0, records: 0 }, log: [],
    table: { v: 1, at: new Date().toISOString(), types: { fill: { 1: -0.25 } }, cells: { EFFT: moved }, irr: {} } }));

  const P = await fresh();
  await login(P.page, "telja");
  const got = await P.page.evaluate(() => {
    const A = window.FALLASKOLI;
    return { shift: A.cal && A.cal.types.fill && A.cal.types.fill[1], cell: A.lex.cellHardness("EFFT"),
      duelCell: A.lexForDuels().cellHardness("EFFT"), collect: A.calInfo && A.calInfo.collect,
      samples: A.calInfo && A.calInfo.samples };
  });
  ok(got.shift === -0.25, "the table's type shift did not reach the browser: " + JSON.stringify(got));
  ok(got.cell === moved, `the lexicon scores EFFT ${got.cell}, not the table's ${moved}`);
  ok(got.duelCell === built, `a duel would be built with EFFT at ${got.duelCell}: duels must use the built-in ${built}`);
  ok(got.collect === true && got.samples === false, "a consenting learner is not counted, or is sampled by default");

  /* Clozes answered on the screen: the right form typed, Athuga clicked. */
  const answered = await P.page.evaluate(async () => {
    const A = window.FALLASKOLI;
    let n = 0;
    for (let k = 0; k < 400 && n < 9; k++) {
      document.querySelector(".scrim .modal button")?.click();
      const t = A.cur;
      if (!t) break;
      const box = document.getElementById("ans"), go = document.getElementById("check");
      if (t.typeId === "fill" && t.calBand && box && go && !box.disabled) {
        box.value = t.answers[0];
        go.click();
        n++;
      } else A.finish({ correct: true });
      A.next();
    }
    A.flushAnswers();
    return n;
  });
  ok(answered === 9, `only ${answered} clozes could be answered on the screen`);
  let counts = null;
  for (let k = 0; k < 40; k++) {
    counts = (await app.store.calibration()).counts;
    if (Object.keys(counts.types).length) break;
    await new Promise((r) => setTimeout(r, 150));
  }
  const fills = Object.entries(counts.types).filter(([key]) => key.startsWith("fill|"));
  const total = fills.reduce((n, [, v]) => n + v[1], 0), right = fills.reduce((n, [, v]) => n + v[0], 0);
  ok(total >= 8 && right === total, `the server counted ${right} right of ${total} clozes, after ${answered} right answers`);
  ok(Object.keys(counts.cells).length > 0 && Object.keys(counts.cells).every((key) => /^fill\|[1-7]\|[^|]*\|[0-5]$/.test(key)),
    "the cell counts are not keyed by type, level, cell and score: " + Object.keys(counts.cells).slice(0, 3));
  const stored = JSON.stringify(await app.store.calibration());
  ok(!stored.includes(telja.id) && !stored.includes("telja") && !stored.includes("hkv"),
    "the counts name the pupil or the group");

  /* The teacher switches the sample on; the pupil's page then says so. */
  const T = await fresh();
  await login(T.page, "kvkennari");
  await openTab(T.page, "class");
  await T.page.waitForSelector("#tc-samples-on", { timeout: 10000 });
  ok(await T.page.$eval("#tc-samples-on", (e) => e.checked) === false, "the sample of wrong answers is on by default");
  ok(!(await app.store.groups()).hkv.samples, "the group has the sample on before anybody chose it");
  await T.page.click("#tc-samples-on");
  await T.page.waitForFunction(() => /Kveikt/.test(document.getElementById("tc-samples-note")?.innerText || ""), { timeout: 8000 });
  ok((await app.store.groups()).hkv.samples === true, "the teacher's switch did not reach the server");
  ok((await app.store.audit()).some((a) => a.by === kvkenn.id && a.act === "kveikti á svarasýni"),
    "switching the sample on is not in the audit trail");
  await T.ctx.close();

  await openTab(P.page, "settings");
  await P.page.waitForSelector("#ac-stats", { timeout: 8000 });
  ok(await P.page.$eval("#ac-stats", (e) => e.checked) === true, "the pupil's switch does not show that they are counted");
  ok(/kveikt á sýni af röngum\s+svörum/.test(await P.page.$eval("#account", (e) => e.innerText)),
    "the pupil's page does not say that the teacher switched the sample on");
  /* …and their own switch takes them out of both. */
  await P.page.click("#ac-stats");
  await P.page.waitForFunction(() => /ekki lengur talin/.test(document.getElementById("ac-note")?.innerText || ""), { timeout: 8000 });
  const after = (await app.store.users()).find((u) => u.id === telja.id);
  ok(after.stats === false, "the pupil's switch did not reach the server");
  ok(await P.page.evaluate(() => window.FALLASKOLI.calInfo.collect) === false, "the browser still sends answers after the switch");
  const refusedStats = await P.page.evaluate(() => fetch("/calibration/answers", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ events: [{ t: "fill", l: 1, ok: true, recs: [] }] }) }).then((r) => r.json()));
  ok(refusedStats.counted === 0, "an answer was counted after the pupil switched it off");
  await P.ctx.close();

  /* The administrator's record. */
  const A = await fresh();
  await login(A.page, "umsjon");
  await openTab(A.page, "settings");
  await A.page.waitForSelector("#ad-cal", { timeout: 10000 });
  await A.page.evaluate(() => { document.getElementById("ad-cal").open = true; });
  await A.page.waitForFunction(() => /Síðasta keyrsla/.test(document.getElementById("ad-cal-body")?.innerText || ""), { timeout: 8000 });
  const rec = await A.page.$eval("#ad-cal-body", (e) => e.innerText);
  ok(/Hér þarf ekkert að gera/.test(rec), "the record does not say that nothing needs doing");
  ok(/1 spurningagerð/.test(rec) && /1 reit/.test(rec), "the record does not describe the table in force: " + rec.slice(0, 300));
  ok(/kveikt í 1 hóp/.test(rec), "the record does not say how many groups sample answers");
  await A.ctx.close();
}

/* ---------- 11. The class goal (item 59) ------------------------------------
 * A guardian sets a weekly goal in Skólastofan; every pupil of the group sees
 * one shared bar above the boards — the total, never who put in what — the
 * pupils who are not on the board included. When the bar is full each of them
 * gets "Saman í mark". A pupil cannot reach the teacher's route. */
{
  await app.store.updateGroups((g) => ({ ...g, h9b: { name: "9. B" } }));
  const inB = async (u, share = true) => {
    await app.store.updateUsers((list) => {
      const x = list.find((y) => y.id === u.id);
      x.group = "h9b"; x.share = { board: share, minutes: false };
      return list;
    });
    return u;
  };
  await inB(await mkUser("mkennari", "guardian"));
  const ma = await inB(await mkUser("mnemi1", "learner"));
  const mb = await inB(await mkUser("mnemi2", "learner"));
  await inB(await mkUser("mnemi3", "learner"), false);          // off the board, has not practised
  await inB(await mkUser("mnemi4", "learner"), false);          // five: the least a goal needs
  await inB(await mkUser("mnemi5", "learner"), false);
  const { blankState: blank } = await import("../src/js/core/state.js");
  const { weekKey } = await import("../src/js/core/social.js");
  const monday = weekKey(new Date());
  await app.store.putState(ma.id, { ...blank(), days: { [monday]: { a: 160, c: 150, xp: 0 } } });
  await app.store.putState(mb.id, { ...blank(), days: { [monday]: { a: 70, c: 60, xp: 0 } } });

  /* The teacher sets 500 right answers together. */
  const T = await fresh();
  await login(T.page, "mkennari");
  await openTab(T.page, "class");
  await T.page.waitForSelector('#tc-goal-what option[value="rett:500"]', { timeout: 15000 });
  await T.page.select("#tc-goal-what", "rett:500");
  await T.page.click("#tc-goal-set");
  await T.page.waitForFunction(() => /komið til nemendanna/.test(document.getElementById("tc-goal-msg")?.innerText || ""),
    { timeout: 10000 });
  const rec = (await app.store.groups()).h9b;
  ok(rec && Array.isArray(rec.goals) && rec.goals.length === 1 && rec.goals[0].kind === "rett" &&
    rec.goals[0].n === 500 && !JSON.stringify(rec).includes("mkennari"),
    "the goal did not reach the group's record as set: " + JSON.stringify(rec));
  /* The teacher's own bar above the boards follows at once. */
  await T.page.waitForFunction(() => /210 af 500/.test(document.getElementById("classgoal")?.innerText || ""),
    { timeout: 10000 });

  /* A pupil who is not on the board: the bar, the total, nobody's name. */
  const P = await fresh();
  await login(P.page, "mnemi3");
  await openTab(P.page, "class");
  await P.page.waitForSelector("#classgoal .goalbar", { timeout: 15000 });
  const bar = await P.page.evaluate(() => {
    const box = document.getElementById("classgoal");
    const b = box.querySelector(".goalbar");
    const board = [...document.querySelectorAll("#view-class h2.sec")].find((h) => /Stigatafla/.test(h.textContent));
    return { text: box.innerText, now: b.getAttribute("aria-valuenow"), max: b.getAttribute("aria-valuemax"),
      width: b.querySelector("i").style.width,
      above: !!(box.compareDocumentPosition(board) & Node.DOCUMENT_POSITION_FOLLOWING),
      gap: getComputedStyle(board).marginTop, barH: b.getBoundingClientRect().height };
  });
  ok(/500 rétt svör saman/.test(bar.text) && /Rétt svör hópsins í vikunni: 210 af 500\./.test(bar.text),
    "the pupil's bar does not say the goal and the total: " + bar.text);
  ok(bar.now === "210" && bar.max === "500" && bar.width === "42%", `the bar is ${bar.now}/${bar.max} at ${bar.width}`);
  ok(!/mnemi|150|60\b/.test(bar.text), "the bar shows who put in what: " + bar.text);
  ok(bar.above, "the class goal is not above the leaderboard");
  ok(bar.gap === "34px" && bar.barH >= 10, `the board's heading sits ${bar.gap} under the goal; bar ${bar.barH}px`);
  ok(!(await P.page.evaluate(() => !!window.FALLASKOLI.S.badges.soc_classgoal)), "the badge came before the goal was met");
  const refused = await P.page.evaluate(() => Promise.all([
    fetch("/teacher/classgoal").then((r) => r.status),
    fetch("/teacher/classgoal", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "rett", n: 200 }) }).then((r) => r.status)]));
  ok(refused.every((x) => x === 403), "a pupil got " + refused.join(",") + " from the teacher's goal route");

  /* The teacher lowers it to 200: met. The pupil, next time they open the
     program, has the bar full and the badge — without being on the board. */
  await T.page.select("#tc-goal-what", "rett:200");
  await T.page.click("#tc-goal-set");
  await T.page.waitForFunction(() => /210 af 200/.test(document.getElementById("classgoal")?.innerText || ""),
    { timeout: 10000 });
  await P.ctx.close();
  const Q = await fresh();
  await login(Q.page, "mnemi3");
  await Q.page.waitForFunction(() => !!window.FALLASKOLI.S.badges.soc_classgoal, { timeout: 15000 });
  await openTab(Q.page, "class");
  await Q.page.waitForSelector("#classgoal .goalcard.met", { timeout: 10000 });
  ok(/náð!/.test(await Q.page.$eval("#classgoal", (e) => e.innerText)), "the full bar does not say it was met");
  await T.ctx.close(); await Q.ctx.close();
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
