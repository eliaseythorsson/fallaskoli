/* The guided first run (critique item 84), in a real browser, on the built
   file — at 390 px (a phone, touch) and at 1280 px (a desktop).

   What is held here, because only a browser can say it:

     * a pupil with nothing answered is met by the welcome, once; the whole
       first run can be completed with real clicks and real typing — the
       year, the placement round, what it found, the four pointers — and
       ends with the pupil in their first Lota dagsins;
     * the placement round moves up after a right answer and down after a
       wrong one, offers no second try and no "Þrjár í röð", opens no badge
       window, and writes every level with the source "placement";
     * every pointer points at an element that is on the screen, the ring is
       round that element, and the small board beside it is inside the
       viewport and not on top of it;
     * "Sleppa kynningunni" works on every screen, Escape does the same, and
       skipped or done it does not come back after a reload;
     * a pupil with progress from before it existed is not met by it, and
       can start it from Stillingar;
     * the keyboard stays inside the dialog, the page behind is inert, and
       nothing is animated for a pupil who asked for no motion;
     * nothing scrolls sideways on any of its screens;
     * on a server: a new account is met by it, a teacher is not, and the
       record comes back from the server after a login on another device.

   Run with:  CHROME_PATH=/usr/bin/google-chrome node tools/tour-test.mjs
   `BT_TRACE=1` prints every check. `TOUR_SHOTS=/some/folder` saves a picture
   of every screen at both sizes, to be looked at by a person: whether it is
   clear and good to look at is not something a check can say.
   Exit code 2: no Chromium (skipped).                                         */

import puppeteer from "puppeteer-core";
import path from "node:path";
import { htmlPath } from "./version.mjs";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import { createApp } from "../server/server.mjs";
import { hashPassword, newId } from "../server/auth.mjs";
import { PLACEMENT_SKIP, MIN_QUESTIONS, MAX_QUESTIONS, TOUR_STEPS } from "../src/js/core/placement.js";
import { TASKS } from "../src/js/tasks/index.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FILE = "file://" + (process.argv[2] ? path.join(root, process.argv[2]) : htmlPath());
const CHROME = process.env.CHROME_PATH ||
  "/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome";
if (!existsSync(CHROME)) { console.error("Chrome not found:", CHROME); process.exit(2); }

const problems = [];
let checks = 0;
const TRACE = process.env.BT_TRACE === "1";
const ok = (cond, msg) => {
  checks++;
  if (TRACE) console.error(`  [${String(checks).padStart(3)}] ${cond ? "ok  " : "FAIL"} ${msg}`);
  if (!cond) problems.push(msg);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOTS = process.env.TOUR_SHOTS || null;
const shot = async (page, vp, name) => {
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${vp.name}-${name}.png`) });
};

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: "new",
  protocolTimeout: Number(process.env.BT_PROTOCOL_MS || 180000),
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--allow-file-access-from-files"],
});

const PHONE = { name: "390", width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 };
const DESK = { name: "1280", width: 1280, height: 900, isMobile: false, hasTouch: false, deviceScaleFactor: 1 };
/* The pointers once more where there is least room: a small phone, and a
   phone on its side. */
const SMALL = { name: "360", width: 360, height: 640, isMobile: true, hasTouch: true, deviceScaleFactor: 1 };
const SIDE = { name: "740x360", width: 740, height: 360, isMobile: true, hasTouch: true, deviceScaleFactor: 1 };

/* The same fixed seed as tools/browser-test.mjs, for the same reason: the
   same questions on every run, so a failure can be met again. */
const SEED = Number(process.env.SEED || 20250818);

/** A browser of its own (its own storage): a pupil nobody has seen before —
    or one with the saved state given. */
async function pupil(vp, { state = null, reducedMotion = false } = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`[${vp.name}] pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/favicon|fonts\.g|Failed to load resource/.test(m.text()))
      problems.push(`[${vp.name}] console.error: ${m.text()}`);
  });
  const { name, ...viewport } = vp;
  await page.setViewport(viewport);
  if (reducedMotion) await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await page.evaluateOnNewDocument((seed) => {
    let s = seed >>> 0;
    Math.random = () => {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }, SEED);
  await page.goto(FILE, { waitUntil: "domcontentloaded" });
  if (state) {
    await page.evaluate((s) => localStorage.setItem("fallaskoli.v5.local", JSON.stringify(s)), state);
    await page.reload({ waitUntil: "domcontentloaded" });
  }
  await ready(page);
  return { ctx, page, vp };
}

const ready = (page) => page.waitForFunction(
  "window.FALLASKOLI && window.FALLASKOLI.sess && window.FALLASKOLI.tour && document.querySelector('#task .card')",
  { timeout: 20000 });

/** A real click, at the real place: the element is scrolled to and the mouse
    is pressed on its middle. (Not `page.click`: see tools/browser-test.mjs.) */
async function clickHandle(page, h, what) {
  const at = await h.evaluate((el) => {
    if (!el) return null;
    el.scrollIntoView({ block: "center", inline: "center" });
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    /* What is really under that point? A click that would land on something
       else (a board lying over the button) is the bug this test is for. */
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return { x, y, hit: !!top && (top === el || el.contains(top) || top.contains(el)) };
  });
  if (!at) throw new Error("nothing to click: " + what);
  if (!at.hit) throw new Error("something lies over " + what);
  await page.mouse.click(at.x, at.y);
}
const click = async (page, sel) => clickHandle(page, await page.$(sel), sel);
const clickWhere = async (page, fn, ...args) =>
  clickHandle(page, await page.evaluateHandle(fn, ...args), String(fn).slice(0, 60));

/** Does the page scroll sideways, or does anything of the tour hang out of
    the window? */
async function noSideways(page, where) {
  const m = await page.evaluate(() => {
    const W = document.documentElement.clientWidth;
    const out = [...document.querySelectorAll("#tour .tourcard, #tour .tourtip, #tour .tourring")]
      .map((e) => e.getBoundingClientRect()).filter((r) => r.left < -0.5 || r.right > W + 0.5).length;
    return { sw: document.documentElement.scrollWidth, cw: W, iw: window.innerWidth, out };
  });
  ok(m.sw <= m.cw && m.iw <= m.cw + 20, `${where}: the page scrolls sideways (${m.sw} > ${m.cw})`);
  ok(m.out === 0, `${where}: part of the first run is outside the window`);
}

/** The dialog on the screen: is it one, is the page behind it inert, and is
    the keyboard inside it? */
async function dialogOK(page, where) {
  const d = await page.evaluate(() => {
    const dlg = document.querySelector("#tour [role=dialog]");
    const wrap = document.querySelector(".wrap");
    const lab = dlg && document.getElementById(dlg.getAttribute("aria-labelledby"));
    const desc = dlg && document.getElementById(dlg.getAttribute("aria-describedby"));
    return {
      dlg: !!dlg, modal: dlg && dlg.getAttribute("aria-modal"),
      label: lab ? lab.textContent.trim() : "", desc: desc ? desc.textContent.trim().length : 0,
      inert: !!wrap.inert, hidden: wrap.getAttribute("aria-hidden"),
      focusIn: !!dlg && dlg.contains(document.activeElement),
      lang: document.documentElement.lang,
    };
  });
  ok(d.dlg && d.modal === "true", `${where}: no modal dialog`);
  ok(d.label.length > 3 && d.desc > 20, `${where}: the dialog has no label or no description`);
  ok(d.inert && d.hidden === "true", `${where}: the page behind the dialog is not inert`);
  ok(d.focusIn, `${where}: the keyboard focus is not inside the dialog`);
}

const tourGone = (page) => page.evaluate(() => {
  const wrap = document.querySelector(".wrap");
  return !document.getElementById("tour") && !wrap.inert && !wrap.hasAttribute("aria-hidden");
});
const tourRec = (page) => page.evaluate(() => window.FALLASKOLI.S.tour);
const waitCard = (page, title) => page.waitForFunction(
  (t) => (document.querySelector("#tour .tourcard h2")?.textContent || "").includes(t), { timeout: 8000 }, title);
const waitStep = (page, id) => page.waitForFunction(
  (id) => document.getElementById("tour")?.dataset.step === id && !!document.querySelector("#tour .tourtip"),
  { timeout: 8000 }, id);

/* ---------- answering a question of the round, for real --------------------- */

const PLACEMENT_RENDERERS = new Set(TASKS.filter((t) => !PLACEMENT_SKIP.has(t.renderer) && !t.anyOf).map((t) => t.renderer));

/** Answer the question on the board, right or wrong, with the mouse and the
    keyboard, and stop at the verdict. Returns the question's type. */
async function answer(page, correct) {
  const t = await page.evaluate(() => {
    const c = window.FALLASKOLI.cur;
    return {
      type: c.type, typeId: c.typeId, skill: c.skill,
      answers: c.answers || null, rows: c.rows ? c.rows.map((r) => ({ key: r.key, answer: r.answer })) : null,
      fall: c.fall || null, answer: c.answer || null,
      options: c.options || null, targets: c.targets || null,
      second: c.second ? { options: c.second.options, answer: c.second.answer } : null,
      items: c.items ? c.items.map((x) => x.cls) : null,
      good: c.s && c.askRole ? c.s.tok.map((x, j) => (x.r === c.askRole ? j : -1)).filter((j) => j >= 0) : [],
      askGen: !!c.askGen, gen: c.gen || null,
      slots: c.slots ? c.slots.map((s) => s.accepted[0]) : null,
    };
  });
  const type = async (sel, text) => { await click(page, sel); await page.keyboard.type(text); };
  const pickIn = (box, value, right) => clickWhere(page, (box, value, right) => {
    const btns = [...document.querySelectorAll(box + " button")];
    const hit = btns.find((b) => b.dataset.v === value);
    return right ? hit : btns.find((b) => b !== hit) || hit;
  }, box, value, right);
  const pickNth = (boxIndex, k, right) => clickWhere(page, (boxIndex, k, right) => {
    const btns = [...document.querySelectorAll("#task .opts")[boxIndex].querySelectorAll("button")];
    return right ? btns[k] : btns.find((_, j) => j !== k);
  }, boxIndex, k, right);

  if (["fill", "verb", "verbslot", "gap"].includes(t.type)) {
    await type("#ans", correct ? t.answers[0] : "xxrangt");
  } else if (t.type === "smidja" || t.type === "umritun") {
    await type("#ans", correct ? t.answers[0] : "xxrangt orð hér");
  } else if (t.type === "parse") {
    await pickIn('.opts[data-q="fl"]', t.rows[0].answer, correct);
    await click(page, "#check");
    for (let k = 1; k < t.rows.length; k++) {
      await page.waitForSelector(`.opts[data-q="${t.rows[k].key}"]`, { timeout: 3000 });
      await pickIn(`.opts[data-q="${t.rows[k].key}"]`, t.rows[k].answer, true);
    }
    if (await page.evaluate(() => !window.FALLASKOLI.cur.parseDone)) await click(page, "#check");
    await page.waitForSelector("#verdict .verdict", { timeout: 4000 });
    return t;
  } else if (t.type === "govern" || t.type === "indecl" || t.type === "clause") {
    await pickIn("#task .opts", t.type === "govern" ? t.fall : t.answer, correct);
  } else if (t.type === "syntax") {
    await clickWhere(page, (good, right) => {
      const words = [...document.querySelectorAll(".pickw")];
      const hit = words.find((w) => good.includes(+w.dataset.j));
      return right ? hit : words.find((w) => w !== hit) || hit;
    }, t.good, correct);
  } else if (t.type === "choice") {
    const halves = t.second ? [t, t.second] : [t];
    for (let n = 0; n < halves.length; n++)
      await pickNth(n, halves[n].options.indexOf(halves[n].answer), correct || n > 0);
  } else if (t.type === "kenni") {
    if (t.askGen) await type("#ans", correct ? t.gen[0] : "xxrangt");
    await pickNth(0, t.options.indexOf(t.answer), correct);
  } else if (t.type === "slots") {
    const n = await page.$$eval("table.slotbox input", (els) => els.length);
    for (let k = 0; k < n; k++) {
      await clickWhere(page, (k) => document.querySelectorAll("table.slotbox input")[k], k);
      await page.keyboard.type(correct || t.options || k ? t.slots[k] : "xxrangt");
    }
    if (t.options) await clickWhere(page, (k, right) => {
      const btns = [...document.querySelectorAll("#task .opts button")];
      return right ? btns[k] : btns.find((_, j) => j !== k);
    }, t.options.indexOf(t.answer), correct);
  } else if (t.type === "tap") {
    const picks = correct ? t.targets : [await page.evaluate((targets) =>
      [...document.querySelectorAll(".pickw")].map((w) => +w.dataset.j).find((j) => !targets.includes(j)), t.targets)];
    for (const j of picks) await clickWhere(page, (j) => document.querySelector(`.pickw[data-j="${j}"]`), j);
  } else if (t.type === "sort") {
    for (let k = 0; k < t.items.length; k++) await clickWhere(page, (k, v, right) => {
      const btns = [...document.querySelectorAll(".sortrow .opts")[k].querySelectorAll("button")];
      const hit = btns.find((b) => b.dataset.v === v);
      return right ? hit : btns.find((b) => b !== hit) || hit;
    }, k, t.items[k], correct);
  } else {
    throw new Error("the round asked a shape it should leave out: " + t.type + "/" + t.typeId);
  }
  await click(page, "#check");
  await page.waitForSelector("#verdict .verdict", { timeout: 4000 });
  return t;
}

/** The whole round, answered `pattern(i)` right or wrong. Checks every
    question on the way. Returns what was asked. */
async function playRound(page, vp, pattern) {
  const W = `[${vp.name}] the round`;
  const asked = [];
  for (let i = 0; i < 20; i++) {
    const st = await page.evaluate(() => {
      const A = window.FALLASKOLI, r = A.run;
      return r && r.placement ? { i: r.i, n: r.n, level: r.placement.st.level, type: A.cur && A.cur.type,
        skill: A.cur && A.cur.skill, live: A.cur ? A.sess.diff[A.cur.skill] : null,
        line: document.querySelector("#runbar .runline")?.textContent.replace(/\s+/g, " ").trim(),
        insession: document.body.classList.contains("insession") } : null;
    });
    if (!st) break;
    if (i === 0) {
      ok(st.n >= MIN_QUESTIONS && st.n <= MAX_QUESTIONS, `${W} has ${st.n} questions, not ${MIN_QUESTIONS}–${MAX_QUESTIONS}`);
      ok(/Byrjunarstaður/.test(st.line || "") && new RegExp(`1\\s*/\\s*${st.n}`).test(st.line || ""),
        `${W}: the slim line does not name the round and its length: ${st.line}`);
      ok(st.insession, `${W} does not have the screen to itself (body.insession)`);
      await noSideways(page, W + ", first question");
      await shot(page, vp, "3-round-first-question");
    }
    ok(PLACEMENT_RENDERERS.has(st.type), `${W} asked a ${st.type} question`);
    const right = pattern(i);
    let t;
    try { t = await answer(page, right); }
    catch (e) { problems.push(`${W}: question ${i + 1} (${st.type}) could not be answered: ${e.message}`); break; }
    asked.push({ ...st, right, typeId: t.typeId });
    const after = await page.evaluate(() => {
      const A = window.FALLASKOLI, r = A.run;
      return {
        level: r.placement.st.level, i: r.i, n: r.n, hist: r.placement.st.hist.length,
        lo: r.placement.st.lo, hi: r.placement.st.hi,
        retry: !!document.querySelector("#reveal, #verdict .retry"),
        streak: !!document.querySelector(".streakoffer"),
        scrim: !!document.querySelector(".scrim"),
        btn: document.getElementById("check")?.textContent || "",
        verdict: document.querySelector("#verdict .verdict")?.className || "",
      };
    });
    ok(after.hist === i + 1, `${W}: answer ${i + 1} did not reach the staircase`);
    ok(new RegExp(right ? "\\bok\\b" : "\\bno\\b").test(after.verdict) || /slip/.test(after.verdict),
      `${W}: question ${i + 1} (${t.typeId}) was meant ${right ? "right" : "wrong"} and the verdict is "${after.verdict}"`);
    if (right) ok(after.level > st.level || st.level >= after.hi, `${W}: a right answer did not raise the level (${st.level} → ${after.level})`);
    else ok(after.level < st.level || st.level <= after.lo, `${W}: a wrong answer did not lower the level (${st.level} → ${after.level})`);
    ok(!after.retry, `${W}: a wrong answer was offered a second try (${t.typeId})`);
    ok(!after.streak, `${W}: "Þrjár í röð" was offered`);
    ok(!after.scrim, `${W}: a window opened over question ${i + 1}`);
    if (after.i >= after.n) ok(/Sjá byrjunarstaðinn/.test(after.btn), `${W}: the last button says "${after.btn}"`);
    if (i === 2) await shot(page, vp, "3-round-wrong-answer");
    if (after.i >= after.n) await shot(page, vp, "3-round-last-answer");
    await click(page, "#check");
    await page.waitForFunction((i) => {
      const A = window.FALLASKOLI;
      return !A.run || (A.run.i === i + 1 && A.cur && !A.cur.closed);
    }, { timeout: 6000 }, i);
  }
  return asked;
}

/** One pointer: at the right element, on the screen, with its board beside it. */
async function pointerOK(page, vp, id) {
  const W = `[${vp.name}] pointer "${id}"`;
  await sleep(350);                     // the ring glides to its place
  const m = await page.evaluate((id) => {
    const A = window.FALLASKOLI;
    const target = {
      today: () => document.getElementById("todaystart"),
      lessons: () => document.querySelector('nav.tabs button[data-view="lessons"]'),
      map: () => document.querySelector("#skillmap .smnode:not(.locked)"),
      line: () => document.querySelector("#runbar .runline"),
    }[id]();
    const view = { today: "practice", lessons: "lessons", map: "progress", line: "practice" }[id];
    const rect = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
    const ring = document.querySelector("#tour .tourring"), tip = document.querySelector("#tour .tourtip");
    const css = target ? getComputedStyle(target) : null;
    return {
      has: !!target, T: target && rect(target), R: ring && rect(ring), P: tip && rect(tip),
      shown: !!target && css.visibility !== "hidden" && css.display !== "none" && target.offsetParent !== null,
      viewOpen: !document.getElementById("view-" + view).hidden,
      mapPane: id !== "map" || !document.getElementById("pane-stats").hidden,
      vw: document.documentElement.clientWidth, vh: window.innerHeight,
      count: document.querySelector("#tour .toureyebrow b")?.textContent || "",
      run: A.run ? A.run.topic : null,
      arrow: getComputedStyle(document.querySelector("#tour .tourarrow")).display,
    };
  }, id);
  ok(m.has && m.shown && m.T.w > 0 && m.T.h > 0, `${W}: its element is not on the page`);
  if (!m.has || !m.R || !m.P) return;
  ok(m.viewOpen && m.mapPane, `${W}: the part of the app it is about is not open`);
  ok(m.T.t >= 0 && m.T.b <= m.vh && m.T.l >= 0 && m.T.r <= m.vw,
    `${W}: its element is outside the window (${JSON.stringify(m.T)}, window ${m.vw}×${m.vh})`);
  ok(Math.abs(m.R.l - m.T.l) <= 10 && Math.abs(m.R.t - m.T.t) <= 10 && Math.abs(m.R.r - m.T.r) <= 10 && Math.abs(m.R.b - m.T.b) <= 10,
    `${W}: the ring is not round its element (ring ${JSON.stringify(m.R)}, element ${JSON.stringify(m.T)})`);
  ok(m.P.l >= 0 && m.P.r <= m.vw && m.P.t >= 0 && m.P.b <= m.vh, `${W}: its board is outside the window (${JSON.stringify(m.P)})`);
  const overlap = !(m.P.r <= m.T.l || m.P.l >= m.T.r || m.P.b <= m.T.t || m.P.t >= m.T.b);
  ok(!overlap, `${W}: its board lies over the element it points at`);
  ok(m.arrow !== "none", `${W}: the board has no arrow towards its element`);
  ok(m.count === `${TOUR_STEPS.indexOf(id) + 1} af ${TOUR_STEPS.length}`, `${W}: says "${m.count}"`);
  if (id === "line") ok(m.run === "dagsins", `${W}: no Lota dagsins is running under it`);
  await dialogOK(page, W);
  await noSideways(page, W);
  await shot(page, vp, `5-pointer-${TOUR_STEPS.indexOf(id) + 1}-${id}`);
}

/* ============ 1. the whole first run, at both sizes ========================== */

for (const [vp, year] of [[PHONE, 8], [DESK, null]]) {
  const W = `[${vp.name}]`;
  const { ctx, page } = await pupil(vp);

  /* -- the welcome -- */
  await page.waitForSelector("#tour .tourcard", { timeout: 8000 }).catch(() => {});
  ok(await page.$("#tour .tourcard") !== null, `${W} a new pupil is not met by the welcome`);
  ok(/Velkomin/.test(await page.$eval("#tour h2", (e) => e.textContent).catch(() => "")), `${W} the welcome does not say so`);
  ok((await tourRec(page))?.st === "open", `${W} the first run is not written down as begun`);
  await sleep(350);
  await dialogOK(page, `${W} welcome`);
  await noSideways(page, `${W} welcome`);
  await shot(page, vp, "1-welcome");
  const years = await page.$$eval("#tour .touryear", (els) => els.map((e) => e.textContent.replace(/\s+/g, " ").trim()));
  ok(years.length === 4 && /8\./.test(years[0]) && /10\./.test(years[2]) && /veit/.test(years[3]),
    `${W} the welcome does not offer three years and "Ég veit það ekki": ${years}`);
  ok(await page.$("#tour [data-skip]") !== null, `${W} the welcome cannot be skipped`);
  /* No badge window over it, though the first login has won one or more. */
  ok(await page.$(".scrim") === null, `${W} a badge window opened over the welcome`);

  if (!vp.isMobile) {
    /* The keyboard alone: Tab stays inside the dialog, round and round … */
    const seen = new Set();
    for (let k = 0; k < 9; k++) {
      await page.keyboard.press("Tab");
      const where = await page.evaluate(() => {
        const a = document.activeElement;
        return { inside: !!a.closest("#tour"), what: (a.textContent || "").replace(/\s+/g, " ").trim().slice(0, 24) };
      });
      ok(where.inside, `${W} Tab left the welcome (${where.what})`);
      seen.add(where.what);
    }
    ok(seen.size === 5, `${W} Tab does not reach the five controls of the welcome: ${[...seen]}`);
    await page.keyboard.down("Shift"); await page.keyboard.press("Tab"); await page.keyboard.up("Shift");
    ok(await page.evaluate(() => !!document.activeElement.closest("#tour")), `${W} Shift+Tab left the welcome`);
    /* … and "Ég veit það ekki" is chosen with it. */
    await page.evaluate(() => document.querySelector("#tour .tourcard").focus());
    for (let k = 0; k < 4; k++) await page.keyboard.press("Tab");
    ok(/veit/.test(await page.evaluate(() => document.activeElement.textContent)), `${W} the fourth Tab stop is not "Ég veit það ekki"`);
    await page.keyboard.press("Enter");
  } else {
    await click(page, `#tour .touryear[data-year="${year}"]`);
  }

  /* -- the round's introduction -- */
  await waitCard(page, "Finnum réttan byrjunarstað");
  await sleep(350);
  await dialogOK(page, `${W} introduction`);
  await noSideways(page, `${W} introduction`);
  await shot(page, vp, "2-introduction");
  const intro = await page.$eval("#tour .tourtext", (e) => e.textContent);
  ok(/ekki próf/.test(intro) && /réttan byrjunarstað/.test(intro) && /\d+ stuttar spurningar/.test(intro),
    `${W} the introduction does not frame the round gently: ${intro.slice(0, 120)}`);
  ok(!/XP/.test(intro), `${W} the introduction talks about XP`);
  const preset = await page.evaluate(() => {
    const S = window.FALLASKOLI.S;
    return { l6: (S.policy.levels || {})["6"], l5: (S.policy.levels || {})["5"], setn: S.enabled.setningafraedi, year: S.tour && S.tour.year };
  });
  if (year === 8) ok(preset.l6 === false && preset.l5 !== false && preset.setn === false,
    `${W} choosing 8. bekkur did not set the year-8 preset: ${JSON.stringify(preset)}`);
  else ok(preset.l6 !== false, `${W} "Ég veit það ekki" changed the curriculum: ${JSON.stringify(preset)}`);

  /* -- the round -- */
  if (!vp.isMobile) await page.keyboard.press("Enter");       // "Byrja →" has the focus
  else await click(page, "#tour-go");
  await page.waitForFunction("window.FALLASKOLI.run && window.FALLASKOLI.run.placement && window.FALLASKOLI.cur", { timeout: 8000 });
  ok(await tourGone(page), `${W} the board is not free for the round's questions`);
  if (!vp.isMobile) ok(await page.evaluate(() => !!document.activeElement.closest("#task")),
    `${W} the keyboard is not at the first question`);
  const xp0 = await page.evaluate(() => window.FALLASKOLI.S.xp);
  /* Two right for every one wrong. */
  const asked = await playRound(page, vp, (i) => i % 3 !== 2);
  ok(asked.length >= MIN_QUESTIONS, `${W} only ${asked.length} questions were answered`);
  ok(new Set(asked.map((a) => a.skill)).size >= 8, `${W} the round asked about ${new Set(asked.map((a) => a.skill)).size} skills only`);

  /* -- what it found -- */
  await waitCard(page, "Byrjunarstaðurinn er fundinn");
  await sleep(350);
  await dialogOK(page, `${W} result`);
  await noSideways(page, `${W} result`);
  await shot(page, vp, "4-result");
  const res = await page.evaluate(() => {
    const A = window.FALLASKOLI, S = A.S;
    const on = Object.keys(S.enabled).filter((k) => S.enabled[k]);
    return {
      on, rows: document.querySelectorAll("#tour .tourlevels li").length,
      src: on.map((k) => (S.difficulty[k] || {}).src), levels: on.map((k) => (S.difficulty[k] || {}).d),
      live: on.map((k) => A.sess.diff[k]), runs: (S.runs || []).length, run: !!A.run, xp: S.xp,
      scrim: !!document.querySelector(".scrim"), tour: S.tour,
      yearButtons: document.querySelectorAll("#tour .touryear").length,
      pressed: document.querySelector('#tour .touryear[aria-pressed="true"]')?.dataset.year || null,
      tagged: [...document.querySelectorAll("#tour .touryear")].filter((b) => b.querySelector("em")).map((b) => b.dataset.year),
      picker: !!document.querySelector("#task .runpick"),
    };
  });
  ok(res.rows === res.on.length, `${W} the result shows ${res.rows} levels for ${res.on.length} categories`);
  ok(res.src.every((s) => s === "placement"), `${W} not every level was written by the round: ${res.src}`);
  ok(res.levels.some((d) => d > 1) && new Set(res.levels).size > 1, `${W} the round placed every skill alike: ${res.levels}`);
  ok(JSON.stringify(res.live) === JSON.stringify(res.levels), `${W} the levels do not take effect at once: ${res.live} / ${res.levels}`);
  ok(res.runs === 0 && !res.run && res.picker, `${W} the round was saved as a session, or its board was not cleared`);
  ok(res.xp > xp0, `${W} the round's right answers earned nothing`);
  ok(!res.scrim, `${W} a badge window opened over the result`);
  ok(res.tour && res.tour.st === "open" && res.tour.placed === 1, `${W} the record does not say a placement was made: ${JSON.stringify(res.tour)}`);
  if (year) ok(res.yearButtons === 0 || res.pressed === String(year), `${W} the year the pupil said is not the one pressed`);
  else {
    ok(res.yearButtons === 3 && res.tagged.length === 1 && res.pressed === res.tagged[0],
      `${W} no year is suggested to a pupil who did not say one: ${JSON.stringify(res)}`);
    /* The pupil may take another: press 9. bekkur, then go on. */
    await click(page, '#tour .touryear[data-year="9"]');
    ok(await page.$eval('#tour .touryear[data-year="9"]', (b) => b.getAttribute("aria-pressed")) === "true",
      `${W} another year cannot be pressed on the result`);
  }
  await click(page, "#tour-go");

  /* -- the four pointers -- */
  for (const id of TOUR_STEPS) {
    await waitStep(page, id).catch(() => {});
    ok(await page.evaluate((id) => document.getElementById("tour")?.dataset.step === id, id), `${W} pointer "${id}" did not come`);
    await pointerOK(page, vp, id);
    if (id === "lessons") {
      /* Back and forth: "Til baka" goes to the pointer before. */
      await click(page, "#tour-prev");
      await waitStep(page, "today");
      await pointerOK(page, vp, "today");
      await click(page, "#tour-next");
      await waitStep(page, "lessons");
    }
    if (id !== "line") await click(page, "#tour-next");
  }
  if (!year) ok(await page.evaluate(() => (window.FALLASKOLI.S.policy.levels || {})["7"] === false && (window.FALLASKOLI.S.policy.levels || {})["6"] !== false),
    `${W} the year pressed on the result (9. bekkur) was not set`);

  /* -- the end: the pupil's first Lota dagsins -- */
  await click(page, "#tour-next");                     // "Byrja að æfa →"
  await sleep(200);
  ok(await tourGone(page), `${W} the first run did not go away at its end`);
  const end = await page.evaluate(() => {
    const A = window.FALLASKOLI;
    return { tour: A.S.tour, run: A.run && { topic: A.run.topic, i: A.run.i, badges: A.run.badges.length },
      won: Object.keys(A.S.badges).length, scrim: !!document.querySelector(".scrim"),
      focus: !!document.activeElement.closest("#task"), cur: !!A.cur };
  });
  ok(end.tour && end.tour.st === "done" && end.tour.placed === 1, `${W} the first run is not written down as done: ${JSON.stringify(end.tour)}`);
  ok(end.run && end.run.topic === "dagsins" && end.run.i === 0 && end.cur, `${W} the pupil is not at the first question of Lota dagsins`);
  ok(!end.scrim, `${W} a badge window opened over the first question`);
  ok(end.won === 0 || end.run.badges >= 1, `${W} the badges won during the first run are not kept for the session's summary`);
  if (!vp.isMobile) ok(end.focus, `${W} the keyboard is not at the question when the first run ends`);
  await noSideways(page, `${W} after the first run`);
  await shot(page, vp, "6-after");
  /* The session is a real one: its first question can be answered. */
  try { await answer(page, true); ok(true, ""); }
  catch (e) { if (!/shape it should leave out/.test(e.message)) problems.push(`${W} the first question after the tour could not be answered: ${e.message}`); }

  /* -- and never again -- */
  await page.evaluate(() => window.FALLASKOLI.save(true));
  await page.reload({ waitUntil: "domcontentloaded" });
  await ready(page);
  await sleep(300);
  ok(await page.$("#tour") === null, `${W} the first run opened a second time after a reload`);
  ok((await tourRec(page))?.st === "done", `${W} the record did not survive a reload`);
  ok(await page.evaluate(() => window.FALLASKOLI.S.difficulty.nafnord.src === "placement" || window.FALLASKOLI.S.difficulty.nafnord.src === "play"),
    `${W} the placed levels did not survive a reload`);
  await ctx.close();
}

/* ============ 2. skipping, on every screen ==================================== */

/* How to reach each screen from the welcome, as a pupil would. */
const toIntro = async (page) => { await click(page, '#tour .touryear[data-year="9"]'); await waitCard(page, "Finnum réttan"); };
const toSteps = async (page, n) => {
  await toIntro(page);
  await click(page, "#tour-pass");                    // "Sleppa spurningunum"
  await waitStep(page, TOUR_STEPS[0]);
  for (let k = 1; k <= n; k++) { await click(page, "#tour-next"); await waitStep(page, TOUR_STEPS[k]); }
};
const toResult = async (page) => {
  await toIntro(page);
  await click(page, "#tour-go");
  await page.waitForFunction("window.FALLASKOLI.run && window.FALLASKOLI.run.placement && window.FALLASKOLI.cur", { timeout: 8000 });
  await answer(page, true);
  await click(page, "#check");
  await page.waitForFunction("window.FALLASKOLI.run && window.FALLASKOLI.run.i === 1 && window.FALLASKOLI.cur && !window.FALLASKOLI.cur.closed", { timeout: 6000 });
  /* The × of the round's line: its own question, not the session's. */
  await click(page, "#runstop");
  await page.waitForSelector("#tourquit-yes", { timeout: 4000 });
  const said = await page.$eval(".sheetbody", (e) => e.textContent);
  ok(/svarað 1 af \d+ spurningum/.test(said) && /of lítið/.test(said), `the × of the round does not say what leaving means: ${said.slice(0, 100)}`);
  await shot(page, PHONE, "7-round-quit");
  await click(page, "#tourquit-yes");
  await waitCard(page, "Þá byrjum við á byrjuninni");
};

const SKIPS = [
  { at: "the welcome", go: async () => {}, how: "click" },
  { at: "the welcome (Escape)", go: async () => {}, how: "esc", vp: DESK },
  { at: "the introduction", go: toIntro, how: "click" },
  { at: "the result", go: toResult, how: "click", result: true },
  ...TOUR_STEPS.map((id, k) => ({ at: `pointer "${id}"`, go: (page) => toSteps(page, k), how: id === "line" ? "later" : "click", step: id })),
  { at: 'pointer "map" (Escape)', go: (page) => toSteps(page, 2), how: "esc", vp: DESK },
  { at: 'pointer "line" (Escape)', go: (page) => toSteps(page, 3), how: "esc", step: "line" },
];

for (const s of SKIPS) {
  const vp = s.vp || PHONE;
  const W = `[${vp.name}] skipping at ${s.at}`;
  const { ctx, page } = await pupil(vp);
  try {
    await page.waitForSelector("#tour .tourcard", { timeout: 8000 });
    await sleep(300);
    await s.go(page);
    await sleep(300);
    if (s.result) {
      /* Left after one answer: nothing is placed, and the levels are as they were. */
      const r = await page.evaluate(() => ({ d: window.FALLASKOLI.S.difficulty, rows: document.querySelectorAll("#tour .tourlevels li").length,
        live: window.FALLASKOLI.sess.diff.nafnord }));
      ok(Object.keys(r.d).length === 0 && r.rows === 0 && r.live === 1, `${W}: one answer placed something: ${JSON.stringify(r)}`);
      await noSideways(page, W);
      await shot(page, vp, "7-result-nothing-placed");
    }
    if (s.step) await pointerOK(page, vp, s.step);
    if (s.how === "esc") await page.keyboard.press("Escape");
    else if (s.how === "later") await click(page, "#tour-later");
    else {
      ok(await page.$("#tour [data-skip]") !== null, `${W}: no "Sleppa kynningunni" on this screen`);
      await click(page, "#tour [data-skip]");
    }
    await sleep(250);
    ok(await tourGone(page), `${W}: the first run is still on the screen`);
    const a = await page.evaluate(() => {
      const A = window.FALLASKOLI;
      return { tour: A.S.tour, run: !!A.run, picker: !!document.querySelector("#task .runpick"),
        practice: !document.getElementById("view-practice").hidden, insession: document.body.classList.contains("insession"),
        notice: document.getElementById("notice").textContent, seen: Object.keys(A.S.seenTypes || {}).length,
        focus: document.activeElement && document.activeElement.id };
    });
    const want = s.how === "later" ? "done" : "skipped";
    ok(a.tour && a.tour.st === want, `${W}: the record says ${JSON.stringify(a.tour)}, not ${want}`);
    ok(!a.run && a.picker && a.practice && !a.insession, `${W}: the pupil is not left at the picker: ${JSON.stringify(a)}`);
    if (want === "skipped") ok(/Sýna kynninguna aftur/.test(a.notice), `${W}: nothing says where the first run can be found again`);
    if (s.step === "line") ok(a.seen === 0, `${W}: the question shown behind the pointer counts as a type the pupil has met`);
    await noSideways(page, W + " (after)");
    if (s.at === "the introduction") await shot(page, vp, "8-skipped");
    await page.evaluate(() => window.FALLASKOLI.save(true));
    await page.reload({ waitUntil: "domcontentloaded" });
    await ready(page);
    await sleep(300);
    ok(await page.$("#tour") === null, `${W}: it came back after a reload`);
  } catch (e) {
    problems.push(`${W}: ${e.message}`);
  }
  await ctx.close();
}

/* ============ 2b. the cards and the pointers where there is least room ======== */
for (const vp of [SMALL, SIDE]) {
  const W = `[${vp.name}]`;
  const { ctx, page } = await pupil(vp);
  try {
    await page.waitForSelector("#tour .tourcard", { timeout: 8000 });
    await sleep(350);
    await noSideways(page, `${W} welcome`);
    await shot(page, vp, "1-welcome");
    /* Every control of the welcome can be reached: the card scrolls if it
       is taller than the window (`clickHandle` scrolls to each, and fails
       if something lies over it). */
    ok(await page.evaluate(() => {
      const sc = document.querySelector("#tour .tourscrim");
      return sc.scrollHeight <= sc.clientHeight || getComputedStyle(sc).overflowY === "auto";
    }), `${W} a welcome taller than the window cannot be scrolled`);
    await click(page, "#tour .touryear.wide");                 // "Ég veit það ekki"
    await waitCard(page, "Finnum réttan");
    await sleep(350);
    await noSideways(page, `${W} introduction`);
    await click(page, "#tour-pass");
    for (const id of TOUR_STEPS) {
      await waitStep(page, id);
      await pointerOK(page, vp, id);
      if (id !== "line") await click(page, "#tour-next");
    }
    await click(page, "#tour-next");
    await sleep(200);
    ok(await tourGone(page) && (await tourRec(page))?.st === "done", `${W} the first run cannot be finished at this size`);
  } catch (e) {
    problems.push(`${W} ${e.message}`);
  }
  await ctx.close();
}

/* ============ 3. a reload in the middle offers it again ======================= */
{
  const { ctx, page } = await pupil(PHONE);
  await page.waitForSelector("#tour .tourcard", { timeout: 8000 });
  await toIntro(page);
  await page.evaluate(() => window.FALLASKOLI.save(true));
  await page.reload({ waitUntil: "domcontentloaded" });
  await ready(page);
  await page.waitForSelector("#tour .tourcard", { timeout: 8000 }).catch(() => {});
  ok(/Velkomin/.test(await page.$eval("#tour h2", (e) => e.textContent).catch(() => "")),
    "a first run that was begun and not ended is not offered again after a reload");
  await ctx.close();
}

/* ============ 4. a pupil from before it existed ================================ */
{
  /* Forty answers, some XP, a level set by playing — and no record of any
     first run, as every state saved before this version. */
  const old = {
    v: 11, xp: 420, totalAnswers: 40, totalCorrect: 31, bestLevel: 3,
    skills: { nafnord: { xp: 300, c: 25, w: 6, bestRun: 7 }, sagnord: { xp: 120, c: 6, w: 3, bestRun: 3 } },
    days: { "2026-10-01": { a: 40, c: 31, xp: 420, ms: 900000, nw: 12, sk: { nafnord: 31, sagnord: 9 } } },
    difficulty: { nafnord: { d: 3, r: 0, h: "110111", at: 1790000000000, src: "play" } },
    lastActive: "2026-10-01",
  };
  const { ctx, page, vp } = await pupil(DESK, { state: old });
  const W = "[1280] a pupil with progress";
  await sleep(500);
  ok(await page.$("#tour") === null, `${W} is walked through the first run`);
  ok((await tourRec(page)) === null, `${W} has a first-run record nobody made`);
  /* A badge of the day may be on the screen; close it as a pupil would. */
  for (let k = 0; k < 12 && await page.$("#badgeok"); k++) { await click(page, "#badgeok"); await sleep(120); }

  /* Stillingar → "Sýna kynninguna aftur", with a real click. */
  await click(page, 'nav.tabs button[data-view="settings"]');
  ok(await page.$("#tour-again") !== null, `${W}: Stillingar has no "Sýna kynninguna aftur"`);
  ok(/Sýna kynninguna aftur/.test(await page.$eval("#tour-again", (e) => e.textContent)), `${W}: the button is not named "Sýna kynninguna aftur"`);
  await click(page, "#tour-again");
  await waitCard(page, "Kynning á Fallaskóla");
  await sleep(300);
  await dialogOK(page, `${W}, the replay`);
  await noSideways(page, `${W}, the replay`);
  await shot(page, vp, "9-replay");
  ok(await page.$("#tour .touryear") === null, `${W}: a replay asks for the year again`);
  await click(page, "#tour-go");
  await waitStep(page, "today");
  await pointerOK(page, vp, "today");
  await page.keyboard.press("Escape");
  await sleep(200);
  ok(await tourGone(page), `${W}: Escape does not close a replay`);
  ok((await tourRec(page)) === null, `${W}: leaving a replay wrote a record`);
  ok(await page.evaluate(() => window.FALLASKOLI.S.difficulty.nafnord.d === 3 && window.FALLASKOLI.S.difficulty.nafnord.src === "play"),
    `${W}: a replay changed the levels without being asked`);

  /* The round again, because the pupil asks: it is offered, it starts, and
     leaving it early puts the levels back exactly as they were. */
  await click(page, 'nav.tabs button[data-view="settings"]');
  await click(page, "#tour-again");
  await waitCard(page, "Kynning á Fallaskóla");
  await click(page, "#tour-again2");                   // "Finna byrjunarstaðinn aftur"
  await waitCard(page, "Finnum réttan");
  ok(await page.$("#tour-back") === null, `${W}: the replay's round offers to go back to a welcome it does not have`);
  await click(page, "#tour-go");
  await page.waitForFunction("window.FALLASKOLI.run && window.FALLASKOLI.run.placement && window.FALLASKOLI.cur", { timeout: 8000 });
  await answer(page, false);
  await click(page, "#check");
  await page.waitForFunction("window.FALLASKOLI.run && window.FALLASKOLI.run.i === 1 && window.FALLASKOLI.cur && !window.FALLASKOLI.cur.closed", { timeout: 6000 });
  /* While the round runs, the button under Stillingar says to finish first. */
  await page.evaluate(() => window.FALLASKOLI.openView("settings"));
  await click(page, "#tour-again");
  ok(/Ljúktu fyrst/.test(await page.$eval("#tour-note", (e) => e.textContent)) && await page.$("#tour") === null,
    `${W}: "Sýna kynninguna aftur" during a session neither starts nor says why not`);
  await click(page, 'nav.tabs button[data-view="practice"]');
  await click(page, "#runstop");
  await page.waitForSelector("#tourquit-yes", { timeout: 4000 });
  ok(/eins og hún var/.test(await page.$eval(".sheetbody", (e) => e.textContent)), `${W}: the × of a replayed round says the levels go back to 1`);
  await click(page, "#tourquit-yes");
  await waitCard(page, "Þyngdin er óbreytt");
  ok(await page.$("#tour .touryear") === null, `${W}: a replayed round suggests a year`);
  ok(await page.evaluate(() => { const d = window.FALLASKOLI.S.difficulty; return d.nafnord.d === 3 && d.nafnord.src === "play" && Object.keys(d).length === 1; }),
    `${W}: a round left after one answer changed the levels: ${JSON.stringify(await page.evaluate(() => window.FALLASKOLI.S.difficulty))}`);
  await click(page, "#tour [data-skip]");
  await sleep(200);
  ok(await tourGone(page), `${W}: the replay did not close`);
  await ctx.close();
}

/* ============ 5. no motion for a pupil who asked for none ===================== */
{
  const { ctx, page } = await pupil(PHONE, { reducedMotion: true });
  await page.waitForSelector("#tour .tourcard", { timeout: 8000 });
  const card = await page.$eval("#tour .tourcard", (e) => getComputedStyle(e).animationName);
  ok(card === "none", `prefers-reduced-motion: the welcome is animated (${card})`);
  await toSteps(page, 0);
  const m = await page.evaluate(() => {
    const ring = document.querySelector("#tour .tourring");
    return { pulse: getComputedStyle(ring, "::after").animationName,
      glide: getComputedStyle(ring).transitionDuration, behavior: getComputedStyle(document.documentElement).scrollBehavior };
  });
  ok(m.pulse === "none", `prefers-reduced-motion: the ring pulses (${m.pulse})`);
  ok(/^0s(, 0s)*$/.test(m.glide), `prefers-reduced-motion: the ring glides (${m.glide})`);
  ok(m.behavior !== "smooth", "prefers-reduced-motion: the page scrolls smoothly");
  await ctx.close();
}
{
  /* … and with motion allowed there is some, so the check above is not empty. */
  const { ctx, page } = await pupil(PHONE);
  await page.waitForSelector("#tour .tourcard", { timeout: 8000 });
  await toSteps(page, 0);
  const pulse = await page.evaluate(() => getComputedStyle(document.querySelector("#tour .tourring"), "::after").animationName);
  ok(pulse === "tourpulse", `with motion allowed the ring does not pulse (${pulse})`);
  await ctx.close();
}

/* ============ 6. on a server ==================================================== */
/* The same file served by server/server.mjs, behind a login: the first run
   meets a new pupil's account and not a teacher's; what it wrote is stored
   by the server (server/guard.mjs keeps the record and the levels), so a
   second device that logs in is not walked through it again. */
{
  const HTML = process.argv[2] ? path.join(root, process.argv[2]) : htmlPath();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "fallaskoli-tour-"));
  const app = createApp({ dataDir: dir, htmlFile: HTML, secureCookies: false, env: {} });
  await app.store.init();
  const mkUser = async (username, role) => {
    const { salt, hash } = await hashPassword("lykilordid-mitt");
    await app.store.updateUsers((users) => {
      users.push({ id: newId(), username, name: username, role, status: "active", salt, hash,
        group: "default", share: { board: false, minutes: false },
        consent: { by: "self", over16: true, at: new Date().toISOString(), how: "admin" } });
      return users;
    });
  };
  await mkUser("nyr", "learner");
  await mkUser("kennari", "teacher");
  await new Promise((r) => app.server.listen(0, r));
  const BASE = "http://127.0.0.1:" + app.server.address().port;
  const device = async (username, vp = DESK) => {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    page.on("pageerror", (e) => problems.push(`[server] pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error" && !/favicon|fonts\.g|Failed to load resource/.test(m.text()))
        problems.push(`[server] console.error: ${m.text()}`);
    });
    const { name, ...viewport } = vp;
    await page.setViewport(viewport);
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#lg-user", { timeout: 15000 });
    await page.type("#lg-user", username);
    await page.type("#lg-pass", "lykilordid-mitt");
    await click(page, "#lg-in");
    await ready(page);
    return { ctx, page };
  };
  try {
    const A = await device("nyr", PHONE);
    await A.page.waitForSelector("#tour .tourcard", { timeout: 8000 }).catch(() => {});
    ok(/Velkomin/.test(await A.page.$eval("#tour h2", (e) => e.textContent).catch(() => "")),
      "[server] a new pupil's account is not met by the welcome");
    await sleep(600);                         // the server's picture has arrived by now
    ok(await A.page.$(".scrim") === null, "[server] a window opened over the welcome");
    await dialogOK(A.page, "[server] welcome");
    await noSideways(A.page, "[server] welcome");
    /* The card is drawn under the server's content policy: it has its
       colours and its frame (no style was refused). */
    const look = await A.page.$eval("#tour .tourcard", (e) => {
      const c = getComputedStyle(e); return { bg: c.backgroundColor, border: c.borderTopWidth };
    });
    ok(look.bg !== "rgba(0, 0, 0, 0)" && look.border === "7px", `[server] the welcome is not styled: ${JSON.stringify(look)}`);
    /* Year 9, no questions, through the pointers to the end. */
    await toSteps(A.page, 3);
    await pointerOK(A.page, PHONE, "line");
    await click(A.page, "#tour-later");
    await sleep(200);
    ok(await tourGone(A.page), "[server] the first run did not end");
    await A.page.evaluate(() => window.FALLASKOLI.save(true));
    await sleep(300);
    await A.ctx.close();

    /* Another device, the same account. */
    const B = await device("nyr");
    await sleep(500);
    ok(await B.page.$("#tour") === null, "[server] the first run opened again on a second device");
    const rec = await tourRec(B.page);
    ok(rec && rec.st === "done" && rec.year === 9, `[server] the server did not keep the record: ${JSON.stringify(rec)}`);
    ok(await B.page.evaluate(() => (window.FALLASKOLI.S.policy.levels || {})["7"] === false),
      "[server] the year chosen in the first run did not reach the second device");
    await B.ctx.close();

    /* A teacher is not a pupil to be placed. */
    const T = await device("kennari");
    await sleep(500);
    ok(await T.page.$("#tour") === null, "[server] a teacher is walked through the pupils' first run");
    ok(await tourRec(T.page) === null, "[server] a teacher has a first-run record");
    await T.ctx.close();
  } catch (e) {
    problems.push("[server] " + e.message);
  }
  await new Promise((r) => app.server.close(r));
  await fs.rm(dir, { recursive: true, force: true });
}

await browser.close();

console.log(`\n${checks} checks, ${problems.length} problem${problems.length === 1 ? "" : "s"} (the guided first run)`);
problems.forEach((p) => console.log("  ✗ " + p));
process.exit(problems.length ? 1 : 0);
