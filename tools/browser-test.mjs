/* Browser test against the built file.

   This is the only test that proves the file a child actually opens works: it
   launches real Chrome on a file:// URL, answers a hundred questions through
   real input fields and real clicks, and fails on any error in the bundled
   script. Run with:  node tools/browser-test.mjs                          */

import puppeteer from "puppeteer-core";
import path from "node:path";
import { htmlPath } from "./version.mjs";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { QUESTION_TYPES } from "../src/js/core/policy.js";
import { lessonPractice } from "../src/js/core/lessons.js";
import { EXAMPLES } from "../src/js/content/examples.js";
import { NODES } from "../src/js/core/curriculum.js";
const EXAMPLE_TYPES = new Set(Object.keys(EXAMPLES));
/* A server-graded type (#37) has its switch only where server grading is on
   for the pupil (ui/policyui.js); this browser has no server. */
const QT_COUNT = QUESTION_TYPES.filter((t) => t.grader !== "server").length;

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


const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FILE = "file://" + (process.argv[2] ? path.join(root, process.argv[2]) : htmlPath());
const CHROME = process.env.CHROME_PATH ||
  "/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome";

if (!existsSync(CHROME)) {
  console.error("Chrome not found:", CHROME);
  process.exit(2);
}

const problems = [];
let checks = 0;
/* `BT_TRACE=1 node tools/browser-test.mjs` prints every check as it happens.
   The test is a hundred-odd browser round trips with no output until the end,
   so when one of them hangs there is nothing at all to say where. This costs a
   line of code and saves an afternoon. */
const TRACE = process.env.BT_TRACE === "1";
const ok = (cond, msg) => {
  checks++;
  if (TRACE) console.error(`  [${String(checks).padStart(3)}] ${cond ? "ok  " : "FAIL"} ${msg}`);
  if (!cond) problems.push(msg);
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  protocolTimeout: Number(process.env.BT_PROTOCOL_MS || 180000),
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--allow-file-access-from-files"],
});
/* Item 84: a pupil with nothing answered is met by the guided first run, and
   nearly every section below starts from such a pupil to check something
   else. Every page of this file says so before the program loads; the first
   run has a test of its own (tools/tour-test.mjs), which does not. */
{
  const newPage = browser.newPage.bind(browser);
  browser.newPage = async (...a) => {
    const p = await newPage(...a);
    await p.evaluateOnNewDocument(() => { window.FALLASKOLI_NO_TOUR = true; });
    return p;
  };
}
const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 900 });

/* ---------- clicking, without an IntersectionObserver in the way -----------
 *
 * `page.click(selector)` is puppeteer's own helper and it hangs. Not
 * occasionally — reproducibly, from the moment this test grew long enough:
 * before dispatching the mouse event it calls `isIntersectingViewport`, which
 * is implemented with an **IntersectionObserver**, and an IntersectionObserver
 * never fires while `document.visibilityState` is "hidden". Headless Chrome
 * reports the page as hidden once it stops producing frames, which it does
 * when the test spends a few minutes doing nothing but `evaluate`. The symptom
 * is `ProtocolError: Runtime.callFunctionOn timed out` after three minutes,
 * with a stack that names puppeteer's internals and nothing of ours — the
 * least informative failure this test has ever produced.
 *
 * `tap` scrolls the element into view itself and clicks the real mouse at the
 * real coordinates. It is the same trusted `Input.dispatchMouseEvent` the
 * helper would have sent; what is gone is the wait that could not finish. */
async function tap(selector) {
  /* v6.13: during a session the tabs are hidden (body.insession, items 2 and
     47) and the only way off the board is the × and its summary. Most of the
     sections below visit a tab with the long test session still running; for
     them, a hidden tab is opened the way the program itself opens one. The
     session layout has its own section, which taps nothing of the sort. */
  const tab = /^nav\.tabs button\[data-view="(\w+)"\]$/.exec(selector);
  if (tab && await page.evaluate(() => document.body.classList.contains("insession"))) {
    await page.evaluate((v) => window.FALLASKOLI.openView(v), tab[1]);
    return;
  }
  const at = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    el.scrollIntoView({ block: "center", inline: "center" });
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, selector);
  if (!at) throw new Error("nothing to click: " + selector);
  await page.mouse.click(at.x, at.y);
}

/* ---------- a fixed random seed --------------------------------------------
 *
 * The program uses Math.random everywhere, so every run of this test is a new
 * session. That is good for most of what happens here — it means the test meets
 * different questions each time — but it is useless for one assertion: the
 * badge ceiling. That figure swung between 40 and 49 in v5.5 (40-43 in v5.4)
 * and the ceiling is 52. A test that fails one run in eight teaches people to
 * ignore it, and then it is worse than nothing.
 *
 * The seed is therefore fixed. The test is still real — real Chrome, real
 * typing, real clicks — but it is the same session every time, so the badge
 * count is a number rather than a distribution. Change SEED to check that the
 * program survives more than one session; the figure should be well under the
 * ceiling for any seed.                                                       */
const SEED = Number(process.env.SEED || 20250818);
/* Every page opened below with `browser.newPage()` draws from the real
   Math.random unless it is seeded too — which is how "item 45" came to fail
   on one run in thirty: its page met a different question every run. A page
   whose checks depend on which questions come is seeded with this. */
const seedRandom = (p, seed) => p.evaluateOnNewDocument((seed) => {
  let s = seed >>> 0;
  Math.random = () => {
    /* mulberry32 — short, evenly distributed and good enough for a test. */
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}, seed);
await seedRandom(page, SEED);

/* ---------- pretending to be Safari 16.3 --------------------------------
 *
 * There is no Safari in this environment and there never will be — the build
 * runs on Linux. What CAN be done is to take away, inside a real browser, the
 * one piece of syntax whose absence kills the whole program rather than one
 * feature: regular-expression lookbehind, which Safari did not have until 16.4
 * and which every iPad that stopped at iPadOS 15 therefore does not have.
 *
 * `new RegExp("(?<!x)y")` on such a device does not fail to match. It THROWS,
 * at construction, and core/glossary.js built two of them while the module was
 * being evaluated — so the bundle died on its first statement and the child got
 * a white page. This shim reproduces exactly that, and the checks after
 * `page.goto` require the program to start anyway.
 *
 * It is not Safari. It is one specific way of being Safari, and it is the way
 * that mattered.                                                            */
await page.evaluateOnNewDocument(() => {
  const Real = RegExp;
  const guard = (p) => {
    if (typeof p === "string" && /\(\?<[=!]/.test(p))
      throw new SyntaxError("Invalid regular expression: invalid group specifier name");
    return p;
  };
  const Shim = function (pattern, flags) {
    return new Real(guard(pattern instanceof Real ? pattern.source : pattern), flags);
  };
  Shim.prototype = Real.prototype;
  Object.getOwnPropertyNames(Real).forEach((k) => {
    if (!["length", "name", "prototype"].includes(k)) {
      try { Shim[k] = Real[k]; } catch { /* read-only, never mind */ }
    }
  });
  window.RegExp = Shim;
  window.__SAFARI163 = true;
});

page.on("console", (m) => {
  if (m.type() === "error" && !/favicon|fonts\.g|Failed to load resource/.test(m.text()))
    problems.push("console.error: " + m.text());
});
page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
page.on("requestfailed", (r) => {
  if (!/fonts\.g/.test(r.url())) problems.push("request failed: " + r.url());
});

await page.goto(FILE, { waitUntil: "domcontentloaded" });
try {
  await startPractice(page, 15000);
} catch {
  /* Say what happened rather than throwing a stack trace at whoever runs this.
     With the Safari-16.3 shim above in force, a program that builds a
     lookbehind while loading never gets this far — and neither does the child
     on an iPad, which is the whole point. */
  const errs = problems.filter((p) => /pageerror|console\.error/.test(p));
  console.log("\nThe program never started.");
  errs.slice(0, 5).forEach((e) => console.log("  " + e));
  console.log("\n1 check, 1 problem");
  console.log("  \u2717 the program did not start at all (see above). If the errors mention");
  console.log("    'invalid group specifier name', something is building a regular-expression");
  console.log("    lookbehind, which Safari below 16.4 rejects while parsing.");
  await browser.close();
  process.exit(1);
}

/* ---------- 1. Start-up ---------- */
ok(await page.$("#task .card") !== null, "no task appeared at start-up");
/* Item 54: installing is for a served program only. Opened by a double
   click, the file links no manifest and registers no worker — it is the
   same single file as before (tools/server-test.mjs checks the served case). */
ok(await page.evaluate(async () => !document.querySelector('link[rel="manifest"], link[rel="apple-touch-icon"]')
    && !(navigator.serviceWorker && navigator.serviceWorker.controller)
    && !(navigator.serviceWorker && (await navigator.serviceWorker.getRegistrations().catch(() => [])).length)),
  "opened from a file, the program linked a manifest or registered a service worker");
ok((await page.$eval("#lvlname", (e) => e.textContent)).includes("Stig"), "the level label is missing");
/* The Safari-16.3 shim really was installed — otherwise the check above proves
   nothing about old iPads. Any lookbehind built during start-up would have
   thrown before this line and `pageerror` would already hold it. */
ok(await page.evaluate(() => window.__SAFARI163 === true),
  "the old-Safari shim was not installed, so start-up was not tested without lookbehind");
/* And the glossary — the module that used to build them — still works. */
ok(await page.evaluate(() => document.querySelectorAll(".gl").length) >= 0,
  "the glossary module did not survive without lookbehind");

/* ---------- 2. Answer a hundred questions ---------- */
const seenTypes = new Set();

/* How many windows the longest single answer opened. v5.9 puts a ceiling on
   this (core/rarity.js `badgeWindows`); before it, one answer could open nine
   and the child pressed Enter nine times to reach the next question. Counted
   here rather than asserted inside the program, because the claim is about what
   is on the screen. */
let worstQueue = 0;

/** Issue #15: a session the pupil starts themselves (the picker, Lota
    dagsins, "again" on the summary) opens with the Orðakort of the next word
    while fewer than six words are in learning. The checks that start a
    session that way are about the session: walk the card to its end, as a
    pupil would, and go on. True if a card was open. The card itself is
    checked in the last section of this file. */
async function finishCard(pg = page) {
  return pg.evaluate(() => {
    const card = () => document.querySelector(".okort");
    const was = !!card();
    for (let guard = 0; guard < 30 && card(); guard++) {
      const body = card().querySelector(".wcbody");
      const opts = [...body.querySelectorAll(".wcopts button")];
      if (opts.length) opts[0].click();
      const check = body.querySelector("[data-wc=check]");
      if (check) check.click();
      const next = body.querySelector("[data-wc=next]");
      if (next) next.click();
    }
    return was;
  });
}

/** A badge window can lie over the screen and swallow clicks. Close it first. */
async function dismissModals() {
  /* The queue can be long: one answer can win a dozen badges at once, and with
     the multi-skill and oddity badges added in v5.3 it grew past what the old
     limit (8) could take — the tab test then failed on a screen hidden behind a
     window. */
  let closed = 0;
  for (let i = 0; i < 80; i++) {
    if (!(await page.$(".scrim"))) {
      worstQueue = Math.max(worstQueue, closed);
      return;
    }
    await page.evaluate(() => {
      const b = document.getElementById("badgeok");
      if (b) b.click();
    });
    closed += 1;
    await new Promise((r) => setTimeout(r, 30));
  }
  problems.push("the badge window will not close — the queue never drains");
}

/* v6.11: answer, and stay on the verdict (to try the bonus box). */
let stayAfter = false;
/* Item 42: answer wrong and stay in the second try, not revealing. */
let keepRetry = false;
async function answerOneNoNext(correct) {
  stayAfter = true;
  try { await answerOne(correct); } finally { stayAfter = false; }
}

/* v6.13 (items 1, 49): Greindu orðið is answered in turns. The class first,
   committed with the button; then the rows of the right class, one open at
   a time, each answered by a tap; then the button again. A wrong answer is
   a wrong class, with every row after it right. */
async function answerParse(correct) {
  await page.evaluate((correct) => {
    const c = window.FALLASKOLI.cur;
    const fl = [...document.querySelectorAll('.opts[data-q="fl"] button')];
    (correct ? fl.find((b) => b.dataset.v === c.rows[0].answer) : fl.find((b) => b.dataset.v !== c.rows[0].answer)).click();
    document.getElementById("check").click();
  }, correct);
  const n = await page.evaluate(() => window.FALLASKOLI.cur.rows.length);
  for (let k = 1; k < n; k++) {
    await page.evaluate((k) => {
      const r = window.FALLASKOLI.cur.rows[k];
      const box = document.querySelector(`.opts[data-q="${r.key}"]`);
      if (!box) throw new Error("Greining: row " + r.key + " did not open in its turn");
      [...box.querySelectorAll("button")].find((b) => b.dataset.v === r.answer).click();
    }, k);
  }
  if (await page.evaluate(() => !window.FALLASKOLI.cur.parseDone)) await tap("#check");
}
async function answerOne(correct) {
  await dismissModals();
  const t = await page.evaluate(() => {
    const c = window.FALLASKOLI.cur;
    return {
      type: c.type, skill: c.skill,
      answers: c.answers || null,
      cells: c.cells && c.w ? c.cells.map((x) => ({ m: x.m, f: c.w.forms[x.m] })) : null,
      /* v6.9: the hunt's errors, as "line:token" -> the fix */
      fixes: c.hunt ? Object.fromEntries(c.hunt.lines.flatMap((ln, li) => ln.toks
        .map((tk, ti) => (tk.err ? [`${li}:${ti}`, tk.err.answers[0]] : null)).filter(Boolean))) : null,
      rows: c.rows ? c.rows.map((r) => ({ key: r.key, answer: r.answer })) : null,
      fall: c.fall || null, answer: c.answer || null,
      askRole: c.askRole || null,
      /* v6.11 shapes */
      options: c.options || null, targets: c.targets || null,
      second: c.second ? { options: c.second.options, answer: c.second.answer } : null,
      items: c.items ? c.items.map((x) => x.cls) : null,
      good: c.s ? c.s.tok.map((x, j) => (x.r === c.askRole ? j : -1)).filter((j) => j >= 0) : [],
    };
  });
  seenTypes.add(t.type);

  if (t.type === "fill" || t.type === "verb" || t.type === "verbslot") {
    const val = correct ? t.answers[0] : "xxrangt";
    await page.type("#ans", val);
    await tap("#check");
  } else if (t.type === "table") {
    const inputs = await page.$$("table.decl input");
    for (let i = 0; i < inputs.length; i++) {
      const forms = await page.evaluate((idx) => {
        const el = document.querySelectorAll("table.decl input")[idx];
        return el.disabled || el.readOnly ? null : window.FALLASKOLI.cur.w.forms[el.dataset.m];
      }, i);
      /* v6.10.1: a cell the table gives (the nominative) has no input to fill. */
      if (!forms) continue;
      await inputs[i].type(correct ? forms[0] : "xx");
    }
    await tap("#check");
  } else if (t.type === "parse") {
    await answerParse(correct);
  } else if (t.type === "govern" || t.type === "indecl") {
    const want = t.type === "govern" ? t.fall : t.answer;
    await page.evaluate((v, correct) => {
      const btns = [...document.querySelectorAll(".opts button")];
      const right = btns.find((b) => b.dataset.v === v);
      (correct ? right : btns.find((b) => b !== right) || right).click();
    }, want, correct);
    await tap("#check");
  } else if (t.type === "syntax") {
    await page.evaluate((good, correct) => {
      const words = [...document.querySelectorAll(".pickw")];
      const right = words.find((w) => good.includes(+w.dataset.j));
      (correct ? right : words.find((w) => w !== right) || right).click();
    }, t.good, correct);
    await tap("#check");
  } else if (t.type === "meaning") {
    await page.type("#freetext", "Þetta orð þýðir eitthvað sem ég þekki.");
    await tap("#check");
  } else if (t.type === "gap") {
    /* v6.11: a sentence with a blank, typed like the cloze. */
    await page.type("#ans", correct ? t.answers[0] : "xxrangt");
    await tap("#check");
  } else if (t.type === "choice" || t.type === "hver") {
    /* A pair (item 43) has two `.opts` boxes, one per sentence; a wrong answer
       gets the first half wrong and the second right. */
    await page.evaluate((halves, correct) => {
      const boxes = [...document.querySelectorAll(".opts")];
      halves.forEach((h, n) => {
        const btns = [...boxes[n].querySelectorAll("button")];
        const k = h.options.indexOf(h.answer);
        (correct || n ? btns[k] : btns.find((_, j) => j !== k)).click();
      });
    }, (t.second ? [t, t.second] : [t]).map((h) => ({ options: h.options, answer: h.answer })), correct);
    await tap("#check");
  } else if (t.type === "kenni") {
    /* item 27: sterk / veik, and from þyngd 5 the genitive written first. */
    await page.evaluate((opts, ans, correct) => {
      const c = window.FALLASKOLI.cur;
      if (c.askGen) document.getElementById("ans").value = correct ? c.gen[0] : "xxrangt";
      const btns = [...document.querySelectorAll(".opts button")];
      const k = opts.indexOf(ans);
      (correct ? btns[k] : btns.find((_, j) => j !== k)).click();
    }, t.options, t.answer, correct);
    await tap("#check");
  } else if (t.type === "slots") {
    /* item 27: the boxes typed into for real, then sterk / veik if asked.
       Wrong: the pick when there is one, else the first box. */
    const forms = await page.evaluate(() => window.FALLASKOLI.cur.slots.map((s) => s.accepted[0]));
    const boxes = await page.$$("table.slotbox input");
    for (let k = 0; k < boxes.length; k++)
      await boxes[k].type(correct || t.options || k ? forms[k] : "xxrangt");
    if (t.options) {
      await page.evaluate((opts, ans, correct) => {
        const btns = [...document.querySelectorAll("#task .opts button")];
        const k = opts.indexOf(ans);
        (correct ? btns[k] : btns.find((_, j) => j !== k)).click();
      }, t.options, t.answer, correct);
    }
    await tap("#check");
  } else if (t.type === "tap") {
    await page.evaluate((targets, correct) => {
      const words = [...document.querySelectorAll(".pickw")];
      const pick = correct ? words.filter((w) => targets.includes(+w.dataset.j))
        : [words.find((w) => !targets.includes(+w.dataset.j)) || words[0]];
      pick.forEach((w) => w.click());
    }, t.targets, correct);
    await tap("#check");
  } else if (t.type === "sort") {
    await page.evaluate((items, correct) => {
      document.querySelectorAll(".sortrow .opts").forEach((box, k) => {
        const btns = [...box.querySelectorAll("button")];
        const right = btns.find((b) => b.dataset.v === items[k]);
        (correct ? right : btns.find((b) => b !== right) || right).click();
      });
    }, t.items, correct);
    await tap("#check");
  } else if (t.type === "smidja" || t.type === "umritun") {
    /* v6.9: typed whole, like the cloze. */
    await page.type("#ans", correct ? t.answers[0] : "xxrangt orð hér");
    await tap("#check");
  } else if (t.type === "villur") {
    /* v6.9: click each wrong word, type the fix into the box that opens. */
    const keys = Object.keys(t.fixes);
    for (const k of (correct ? keys : keys.slice(0, 1))) {
      await tap(`.huntw[data-k="${k}"]`);
      const inp = `#huntedits input[data-k="${k}"]`;
      await page.waitForSelector(inp, { timeout: 2000 });
      await page.$eval(inp, (el) => { el.value = ""; });
      await page.type(inp, correct ? t.fixes[k] : "xxrangt");
    }
    await tap("#check");
  } else {
    problems.push("unknown task type: " + t.type);
    return;
  }

  /* the verdict should appear, and "Áfram" should be armed */
  await page.waitForSelector("#verdict .verdict", { timeout: 4000 });

  /* Item 42: a wrong written answer is offered a second try first. These
     checks want the answer: give up, which reveals it (the retry itself is
     tested in its own section below). */
  if (!correct && !keepRetry && await page.$("#reveal")) {
    await tap("#reveal");
    await page.waitForFunction("!document.querySelector('#reveal') && !document.querySelector('#verdict .retry')", { timeout: 4000 });
  }

  /* Item 61: NO badge window opens between questions, right answer or wrong.
     Whatever was won waits in the cabinet and on the summary (section 2d). */
  await new Promise((r) => setTimeout(r, 40));
  if (await page.$(".scrim #badgeok") && await page.evaluate(() => !!window.FALLASKOLI.run))
    problems.push(`a badge window opened between questions (${t.type}, ${correct ? "right" : "wrong"}): ${
      await page.evaluate(() => document.querySelector(".scrim h3")?.textContent + " | run.i=" + (window.FALLASKOLI.run && window.FALLASKOLI.run.i) + " " + (window.FALLASKOLI.run && window.FALLASKOLI.run.label))}`);

  await dismissModals();
  if (stayAfter) return;

  await page.evaluate(() => window.FALLASKOLI.next());
  await page.waitForFunction("document.querySelector('#task .card')", { timeout: 4000 });
}

for (let i = 0; i < 100; i++) {
  try {
    await answerOne(i % 4 !== 3);        // three right for every one wrong
  } catch (e) {
    problems.push(`answer ${i} threw: ${e.message} (${await page.evaluate(() => window.FALLASKOLI.cur && window.FALLASKOLI.cur.type + "/" + window.FALLASKOLI.cur.typeId)}) ${e.stack.split("\n")[1]}`);
    break;
  }
}

ok(seenTypes.size >= 6, `only ${seenTypes.size} task types appeared: ${[...seenTypes]}`);

const after = await page.evaluate(() => {
  const S = window.FALLASKOLI.S;
  return {
    xp: S.xp, answers: S.totalAnswers, correct: S.totalCorrect,
    skillXp: Object.fromEntries(Object.entries(S.skills).map(([k, v]) => [k, v.xp])),
    badges: Object.keys(S.badges).length,
  };
});
ok(after.xp > 0, "no XP after a hundred answers");
ok(after.answers >= 80, `only ${after.answers} answers recorded`);
ok(Object.values(after.skillXp).filter((x) => x > 0).length >= 4,
  "XP is not spreading across skills: " + JSON.stringify(after.skillXp));
ok(after.badges > 0, "no badges won");
/* The ceiling on badge inflation. The figure went from 45 to 52 in v5.3
   because the multi-skill badges arrived (and *only* because of that: two steps
   were removed where they fired on the same answer as another badge). This test
   is here to hold the line — if the number starts climbing again the answer is
   fewer badges, not a higher ceiling. */
ok(after.badges < 52, `${after.badges} badges in 100 answers — too many`);
/* The v5.9 ceiling, measured on the screen rather than in the module that
   implements it. The owner: *"only four or rarely up to five badges should be
   able to trigger for a single question."* Six is allowed and means three
   blue-or-rarer badges landed together; more than six means the ceiling is not
   being applied. The seed is fixed (see the note at the top of this file), so a
   failure here is reproducible.
   NOTE what this does NOT say: nothing is lost. `after.badges` above counts the
   badges in the CABINET, and it is unchanged by the ceiling — which is the
   whole design. */
ok(worstQueue <= 6, `${worstQueue} badge windows opened for one answer`);   // always 0 here since v6.13 (item 61)

/* ---------- 2a2. Answers that are right enough (v5.9) -------------------
 *
 * The owner asked for three near misses to be accepted with a deduction and a
 * yellow box. The unit tests (tests/leniency.test.js) prove the decision; these
 * prove the SCREEN, which is a different claim and the one that was wrong in
 * v5.8 — `submitFill` computed an `ok` that included an accent slip, never used
 * it, and printed "Næstum því" over a score of zero.
 *
 * Design rule 6: follow the value to the screen, not to the endpoint.
 */

/* The three checks below need a particular KIND of word — one with an accent in
 * it, and one that has both article forms — and waiting for the engine to draw
 * one is how a test comes to fail on one seed in three. (It did: seed 1 went
 * ninety questions without an accented noun cloze.) So the word is chosen and
 * the engine is asked for it: `app.forcedNoun` is the mechanism the program
 * already uses to bring a missed word back in a different sentence.
 *
 * *bíll* carries an í in every one of its sixteen forms and has all four cases
 * in both articles, so one word serves all three checks and the checks say the
 * same thing on every seed. Design rule 7. */
const TEST_NOUN = "bíll";

async function forceNounCloze() {
  for (let i = 0; i < 80; i++) {
    const hit = await page.evaluate((lemma) => {
      const app = window.FALLASKOLI;
      app.forcedNoun = app.lex.lookup(lemma, "kk");
      /* At the top noun level the cloze draws from the rarer words and never
         takes *bíll* (0 in 30 at level 6, 18 in 30 at level 2). Where the
         long session above leaves that level depends on the seed — it moved
         when Greining began to be answered in turns (v6.13) — so the word
         is drawn at a moderate level, and the level is put back. */
      const was = app.sess.diff.nafnord;
      app.sess.diff.nafnord = Math.min(was, 2);
      try { app.next(); } finally { app.sess.diff.nafnord = was; }
      const c = app.cur;
      return !!(c && c.type === "fill" && c.n && c.n.o === lemma && !c.extra);
    }, TEST_NOUN);
    if (hit) return true;
    await dismissModals();
  }
  return false;
}

/* --- the accent slip: yellow, praised, and scored --- */
{
  await dismissModals();
  if (!(await forceNounCloze())) {
    problems.push(`could not draw a noun cloze on ${TEST_NOUN} — cannot test the slips`);
  } else {
    const plan = await page.evaluate(() => {
      const SLIP = { "á": "a", "é": "e", "í": "i", "ó": "o", "ú": "u", "ý": "y" };
      const right = window.FALLASKOLI.cur.answers[0];
      return { right, flat: right.replace(/[áéíóúý]/g, (ch) => SLIP[ch]) };
    });
    ok(plan.flat !== plan.right, `${plan.right} has no accent to drop`);
    await page.type("#ans", plan.flat);
    await tap("#check");
    await page.waitForSelector("#verdict .verdict", { timeout: 4000 });
    const got = await page.evaluate(() => {
      const v = document.querySelector("#verdict .verdict");
      return { cls: v.className, head: v.querySelector("h3")?.textContent || "",
               xp: v.querySelector(".xpop")?.textContent || "",
               run: window.FALLASKOLI.S.run };
    });
    ok(/\bnear\b/.test(got.cls),
      `an accent slip drew "${got.cls}" instead of the yellow box`);
    ok(/stafsetningu/.test(got.head),
      `the heading after an accent slip was "${got.head}"`);
    ok(/\+[1-9]/.test(got.xp),
      `an accent slip scored "${got.xp}" — it should count, at 95%`);
    ok(got.run > 0, "an accent slip broke the run — it was supposed to count as correct");
    await dismissModals();
  }
}

/* --- the article slip: the same case and number, the other article --- */
{
  const other = `(function (c) {
    const m = c.m.endsWith("gr") ? c.m.slice(0, -2) : c.m + "gr";
    const ff = c.n.forms[m];
    return ff && ff.length ? ff[0] : null;
  })`;
  let ready = false;
  for (let i = 0; i < 12 && !ready; i++) {
    if (!(await forceNounCloze())) break;
    ready = await page.evaluate(`!!${other}(window.FALLASKOLI.cur)`);
  }
  if (!ready) {
    problems.push("no noun cloze with both article forms — cannot test the greinir slip");
  } else {
    const wrong = await page.evaluate(`${other}(window.FALLASKOLI.cur)`);
    await page.type("#ans", wrong);
    await tap("#check");
    await page.waitForSelector("#verdict .verdict", { timeout: 4000 });
    const got = await page.evaluate(() => {
      const v = document.querySelector("#verdict .verdict");
      return { cls: v.className, note: v.textContent || "",
               xp: v.querySelector(".xpop")?.textContent || "" };
    });
    /* v6.10.1: the wrong article is WRONG, told kindly with a note that
       names the one feature that was off (core/leniency.js NEAR_NOTE). */
    ok(/\bno\b/.test(got.cls),
      `"${wrong}" is the same cell with the other article and drew "${got.cls}"`);
    ok(/greini/.test(got.note),
      `no note naming the article after "${wrong}"`);
    ok(!/\+[1-9]/.test(got.xp),
      `the wrong article scored "${got.xp}" — since v6.10.1 it does not count`);
    await dismissModals();
  }
}

/* --- and the wrong CASE is still red, which is the point of the exercise ---
 *
 * Choosing the form for this is fiddlier than it looks, and the first attempt
 * was wrong in an instructive way: it took any form under a different case, and
 * Icelandic syncretism meant the string it chose was often ALSO the
 * article-slip form of the case that WAS asked for (*bíl* is two cells). The
 * program forgave it, correctly, and the test failed.
 *
 * So the form is chosen by the rule the leniency cannot forgive under ANY
 * reading: every cell that form belongs to has a different case-and-number from
 * the one asked for. That is worked out here rather than imported, so the test
 * does not check the implementation against itself.
 */
{
  const pick = `(function (c) {
    const cn = function (m) {
      const k = (m.match(/^(ÞGF|NF|ÞF|EF)/) || [])[1];
      if (!k) return m;
      return k + (m.slice(k.length).startsWith("FT") ? "FT" : "ET");
    };
    const want = cn(c.m);
    for (const m of Object.keys(c.n.forms)) {
      const ff = c.n.forms[m];
      if (!ff || !ff.length) continue;
      const f = ff[0];
      if (c.answers.includes(f)) continue;
      const cells = Object.keys(c.n.forms).filter((k) => (c.n.forms[k] || []).includes(f));
      if (cells.every((k) => cn(k) !== want)) return f;
    }
    return null;
  })`;
  let ready = false;
  for (let i = 0; i < 12 && !ready; i++) {
    if (!(await forceNounCloze())) break;
    ready = await page.evaluate(`!!${pick}(window.FALLASKOLI.cur)`);
  }
  if (!ready) {
    problems.push("no unambiguously wrong form to check against — the red box is untested");
  } else {
    const wrong = await page.evaluate(`${pick}(window.FALLASKOLI.cur)`);
    await page.type("#ans", wrong);
    await tap("#check");
    await page.waitForSelector("#verdict .verdict", { timeout: 4000 });
    const cls = await page.evaluate(() =>
      document.querySelector("#verdict .verdict").className);
    ok(/\bno\b/.test(cls),
      `"${wrong}" is another case entirely and drew "${cls}" — it must stay red`);
    await dismissModals();
  }
}

/* Leave the screen on a FRESH question. The three checks above end on an
   answered one, and the input of an answered question is disabled — the Enter
   checks below look for `#ans`, would find that disabled field, and type into
   it to no effect. That failed on every seed the first time and the message
   ("Enter recorded 0 answers") named the wrong thing entirely, which is worth
   remembering the next time one of these reads as a bug in the program. */
await page.evaluate(() => window.FALLASKOLI.next());
await page.waitForFunction("document.querySelector('#task .card')", { timeout: 4000 });

/* ---------- 2b. Enter grades, it does not skip ----------

   The bug this pins down: the child typed an answer, pressed Enter and went
   straight to the next question without seeing the verdict. Tested with real
   keystrokes, because the bug lived in the event's journey — it does not appear
   if `submit` is called from javascript.                                    */
{
  await dismissModals();
  /* Find a task with a text input. */
  for (let i = 0; i < 40 && !(await page.$("#ans")); i++) {
    await answerOne(true);
  }
  if (await page.$("#ans")) {
    const before = await page.evaluate(() => window.FALLASKOLI.S.totalAnswers);
    await tap("#ans");
    await page.type("#ans", "þettaerekkirétt");
    await page.keyboard.press("Enter");
    await new Promise((r) => setTimeout(r, 250));
    const after = await page.evaluate(() => ({
      answers: window.FALLASKOLI.S.totalAnswers,
      verdict: !!document.querySelector("#verdict .verdict"),
      /* the verdict should still own the screen: the input disabled */
      locked: !!document.querySelector("#ans")?.disabled,
    }));
    ok(after.verdict, "Enter produced no verdict — the answer was not graded");
    ok(after.answers === before + 1,
      `Enter recorded ${after.answers - before} answers instead of one — it skipped the verdict`);
    /* Item 42: a wrong written answer may be tried once more. The box is
       open for it; a second wrong try, also by Enter, ends the question —
       and is not a second answer. */
    if (await page.$("#verdict .retry")) {
      ok(!after.locked, "a second try was offered but the input is closed");
      await page.$eval("#ans", (el) => { el.value = ""; });
      await page.type("#ans", "þettaerheldurekkirétt");
      await page.keyboard.press("Enter");
      await new Promise((r) => setTimeout(r, 250));
      const second = await page.evaluate(() => ({
        answers: window.FALLASKOLI.S.totalAnswers,
        retry: !!document.querySelector("#verdict .retry"),
        locked: !!document.querySelector("#ans")?.disabled,
      }));
      ok(!second.retry, "Enter on the second try did not end the question");
      ok(second.answers === before + 1, `the second try was recorded as another answer (${second.answers - before})`);
      ok(second.locked, "the input is still open after the second try — the verdict was not binding");
    } else {
      ok(after.locked, "the input is still open after Enter — the verdict was not binding");
    }
    /* And a *second* Enter, once the verdict has had time to stand, should
       move on — the button holds the focus, so it is one keystroke. */
    await new Promise((r) => setTimeout(r, 500));
    await page.keyboard.press("Enter");
    await new Promise((r) => setTimeout(r, 250));
    await dismissModals();
    ok(await page.$("#task .card") !== null, "the second Enter drew no new task");
  } else {
    problems.push("found no task with a text input to test Enter against");
  }
}

/* ---------- 2c. Enter HELD down ---------------------------------------
 *
 * This is the bug that survived v5.3, and the test that would have found it.
 * `page.keyboard.press` never sends a repeat, so the old test could not see the
 * difference. Here the key is dispatched straight through CDP with
 * `autoRepeat: true`, exactly as the operating system does when a child leans
 * on Enter.
 *
 * The requirement is the owner's: Enter does what "Athuga" does, and nothing
 * else — however long it is held.                                          */
{
  await dismissModals();
  for (let i = 0; i < 40 && !(await page.$("#ans")); i++) await answerOne(true);
  if (await page.$("#ans")) {
    const cdp = await page.target().createCDPSession();
    const key = (type, autoRepeat) => cdp.send("Input.dispatchKeyEvent", {
      type, key: "Enter", code: "Enter", windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13, text: "\r", unmodifiedText: "\r", autoRepeat,
    });
    const before = await page.evaluate(() => window.FALLASKOLI.S.totalAnswers);
    await tap("#ans");
    await page.type("#ans", "þettaerekkirétt");
    await key("rawKeyDown", false);
    await new Promise((r) => setTimeout(r, 120));
    for (let i = 0; i < 6; i++) {           // ~half a second of repeats
      await key("rawKeyDown", true);
      await new Promise((r) => setTimeout(r, 40));
    }
    await key("keyUp", false);
    await new Promise((r) => setTimeout(r, 300));
    const held = await page.evaluate(() => ({
      answers: window.FALLASKOLI.S.totalAnswers,
      verdict: !!document.querySelector("#verdict .verdict"),
      scrim: !!document.querySelector(".scrim"),
    }));
    ok(held.verdict || held.scrim,
      "a held Enter skipped the verdict — the child never saw what was right");
    ok(held.answers === before + 1,
      `a held Enter recorded ${held.answers - before} answers instead of one`);
    /* Item 42: the held Enter's repeats must not have used up the second try. */
    if (await page.$("#verdict .retry")) {
      ok(!(await page.$eval("#ans", (el) => el.disabled)), "a held Enter used up the second try");
      await tap("#reveal");
    }
    await cdp.detach();
  } else {
    problems.push("found no task with a text input to test a held Enter against");
  }
}

/* ---------- 2e. A second try, then the answer (critique item 42) ---------
 *
 * A noun cloze answered with another form of the word, on a 390 px phone:
 * the verdict says "reyndu aftur" without the right form, keeps the box open
 * and in view with the focus in it, names the error pattern, and has
 * recorded ONE answer. The right form typed and Enter: right in the second
 * try, half XP, still one answer; the pupil's form and the right one side by
 * side, both cells highlighted on the filled-in beygingarkort; Áfram armed. */
{
  await dismissModals();
  /* A change of `isMobile` reloads the page: a new session is started. */
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await page.waitForFunction("window.FALLASKOLI && window.FALLASKOLI.sess", { timeout: 20000 });
  await dismissModals();
  await page.evaluate(() => {
    const A = window.FALLASKOLI;
    A.run = null; A.runDone = null; A.drill = null; A.drillDone = null; A.drillOffer = null;
    A.openView("practice");
    A.startRun("blandad", 40);
  });
  await page.waitForFunction("window.FALLASKOLI.cur", { timeout: 4000 });
  if (!(await forceNounCloze())) {
    problems.push(`could not draw a noun cloze on ${TEST_NOUN} — the second try is untested`);
  } else {
    const plan = await page.evaluate(() => {
      const A = window.FALLASKOLI, c = A.cur;
      /* Another case and number entirely, so the miss is not a near one. */
      const cn = (m) => m.replace(/gr$/, "");
      const wrongM = Object.keys(c.n.forms).find((m) => {
        const f = (c.n.forms[m] || [])[0];
        return f && !c.answers.includes(f) && cn(m) !== cn(c.m) &&
          Object.keys(c.n.forms).filter((k) => c.n.forms[k].includes(f)).every((k) => cn(k) !== cn(c.m));
      });
      return { right: c.answers[0], wrong: c.n.forms[wrongM][0], wrongM, m: c.m,
        xp: A.S.xp, answers: A.S.totalAnswers, correct: A.S.totalCorrect,
        review: A.S.review.items.length, fixed: A.S.counters.retryFixed || 0,
        /* The same noun in the same cell may have been missed earlier in this
           test (which cell the cloze draws depends on the seed; #10 moved it):
           then the miss renews its entry instead of adding one. */
        had: A.S.review.items.some((x) => x.t === "fill" && x.c === c.m && x.w === `${c.n.o}|${c.n.c}`) };
    });
    await tap("#ans");
    await page.type("#ans", plan.wrong);
    await tap("#check");
    await page.waitForSelector("#verdict .verdict.retry", { timeout: 4000 });
    const first = await page.evaluate((right) => {
      const A = window.FALLASKOLI;
      const v = document.querySelector("#verdict .verdict");
      const inp = document.getElementById("ans");
      const r = inp.getBoundingClientRect();
      const words = v.textContent.toLowerCase().split(/[^\p{L}]+/u);
      return {
        head: v.querySelector("h3").textContent,
        role: document.getElementById("verdict").getAttribute("role"),
        live: document.getElementById("verdict").getAttribute("aria-live"),
        open: !inp.disabled, focused: document.activeElement === inp,
        described: inp.getAttribute("aria-describedby"),
        noteText: (document.getElementById("retrynote") || {}).textContent || "",
        tellsAnswer: words.includes(right.toLowerCase()),
        why: !!v.querySelector(".why"), diag: !!v.querySelector(".diagline"),
        reveal: !!document.getElementById("reveal"),
        check: document.getElementById("check").textContent,
        answers: A.S.totalAnswers, review: A.S.review.items.length,
        queued: A.S.review.items.some((x) => x.t === "fill" && x.c === A.cur.m && x.w === `${A.cur.n.o}|${A.cur.n.c}` && x.s === 0),
        inView: r.width > 0 && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight,
        /* the prompt's first lines, under the box, are on the screen too */
        promptInView: (() => { const p = document.getElementById("retrynote").getBoundingClientRect();
          return p.top >= 0 && p.bottom <= innerHeight; })(),
        overflow: document.documentElement.scrollWidth - innerWidth,
      };
    }, plan.right);
    await page.screenshot({ path: "/tmp/fallaskoli-retry-390.png" }).catch(() => {});
    ok(/reyndu aftur/.test(first.head), `the first miss did not ask for a second try: "${first.head}"`);
    ok(first.role === "status" && first.live === "polite", "the verdict holding the retry prompt is not a live region");
    ok(first.described === "retrynote" && /skrifaðu svarið aftur/.test(first.noteText),
      "the open box does not point the screen reader at the retry prompt");
    ok(first.open && first.focused, "the box is not open with the focus in it for the second try");
    ok(first.inView, "at 390 px the retry input is not in view");
    ok(first.promptInView, "at 390 px the retry prompt is below the screen");
    ok(first.overflow <= 0, `at 390 px the retry prompt is ${first.overflow}px wider than the screen`);
    ok(!first.tellsAnswer, `the retry prompt gives the answer (${plan.right}) away`);
    ok(first.why, "no af hverju line under the first miss");
    ok(first.diag, "the error pattern is not named under the first miss");
    ok(first.reveal && first.check === "Athuga", `the buttons during the second try: reveal ${first.reveal}, "${first.check}"`);
    ok(first.answers === plan.answers + 1, `the first miss recorded ${first.answers - plan.answers} answers`);
    ok(first.queued && first.review === plan.review + (plan.had ? 0 : 1), "the first miss is not in the review queue");

    await page.$eval("#ans", (el) => { el.value = ""; });
    await page.type("#ans", plan.right);
    await page.keyboard.press("Enter");
    await page.waitForFunction("!document.querySelector('#verdict .retry')", { timeout: 4000 });
    await new Promise((r) => setTimeout(r, 450));
    const done = await page.evaluate((plan) => {
      const A = window.FALLASKOLI;
      const v = document.querySelector("#verdict .verdict");
      const td = (cls) => [...document.querySelectorAll(`#verdict table.map.filled td.${cls}`)].map((x) => x.textContent);
      return {
        cls: v.className, head: v.querySelector("h3").textContent,
        xp: +((v.querySelector(".xpop") || {}).textContent || "").replace(/[^0-9]/g, ""),
        gained: A.S.xp - plan.xp, answers: A.S.totalAnswers, correct: A.S.totalCorrect,
        fixed: A.S.counters.retryFixed,
        yours: (v.querySelector(".compare .yours .forms") || {}).textContent || "",
        right: (v.querySelector(".compare .right .forms") || {}).textContent || "",
        on: td("on"), mine: td("yours"),
        mapShown: (() => { const m = document.querySelector("#verdict table.map.filled");
          return !!m && m.getBoundingClientRect().width > 0; })(),
        locked: document.getElementById("ans").disabled,
        reveal: !!document.getElementById("reveal"),
        check: document.getElementById("check").textContent,
        focus: document.activeElement && document.activeElement.id,
        diag: !!v.querySelector(".diagline"),
        overflow: document.documentElement.scrollWidth - innerWidth,
      };
    }, plan);
    await page.screenshot({ path: "/tmp/fallaskoli-retry-390-done.png", fullPage: true }).catch(() => {});
    ok(/\bok\b/.test(done.cls) && /annarri tilraun/.test(done.head), `a right second try drew "${done.cls}" / "${done.head}"`);
    ok(done.xp > 0 && done.gained === done.xp, `a right second try showed +${done.xp} XP and gave ${done.gained}`);
    ok(done.answers === plan.answers + 1 && done.correct === plan.correct,
      "the second try was counted as an answer of its own, or as a right one");
    ok(done.fixed === plan.fixed + 1, "the right second try was not counted");
    ok(done.yours === plan.wrong && done.right.split(" / ").includes(plan.right),
      `the two forms are not side by side: "${done.yours}" | "${done.right}"`);
    ok(done.mapShown, "at 390 px the filled-in paradigm is not shown");
    ok(done.on.length === 1 && done.on[0] === plan.right, `the right cell is not highlighted in the paradigm: ${done.on}`);
    ok(done.mine.includes(plan.wrong), `the pupil's cell is not highlighted in the paradigm: ${done.mine}`);
    ok(done.locked && !done.reveal, "the box is still open after the second try");
    ok(/^(Áfram|Sjá samantekt)/.test(done.check) && done.focus === "check", `Áfram is not armed: "${done.check}", focus ${done.focus}`);
    ok(done.diag, "the error pattern of the miss is gone from the final verdict");
    ok(done.overflow <= 0, `at 390 px the filled-in paradigm is ${done.overflow}px wider than the screen`);
    await page.keyboard.press("Enter");
    await page.waitForFunction((was) => window.FALLASKOLI.cur && !window.FALLASKOLI.cur.retried, { timeout: 4000 }).catch(() => {});
    ok(await page.evaluate(() => !!window.FALLASKOLI.cur && !window.FALLASKOLI.cur.retried),
      "Enter after the second try did not go on");
  }
  await page.setViewport({ width: 1100, height: 900 });
  await page.waitForFunction("window.FALLASKOLI && window.FALLASKOLI.sess", { timeout: 20000 });
  await dismissModals();
  await page.evaluate(() => {
    const A = window.FALLASKOLI;
    A.run = null; A.runDone = null;
    A.openView("practice");
    A.startRun("blandad", 100000);
  });
  await page.waitForFunction("window.FALLASKOLI.cur", { timeout: 4000 });
}

/* ---------- 2e'. Setningasmiðja's second try (review of v6.13, S7) -------
 *
 * One card's word left in its dictionary form: the retry marks that card red
 * and no other, says how many were right, keeps the box open with the focus
 * in it — and gives neither the model sentence nor the right form away.
 * "Sýna svarið" then shows them. */
{
  await dismissModals();
  await page.evaluate(() => {
    const A = window.FALLASKOLI;
    A.run = null; A.runDone = null; A.cur = null;
    A.openView("practice");
    A.startRun("malbeiting", 5, null, { types: ["smidja"], skills: ["malbeiting"], label: "Setningasmiðja" });
  });
  await page.waitForFunction("window.FALLASKOLI.cur", { timeout: 4000 });
  const plan = await page.evaluate(() => {
    const t = window.FALLASKOLI.cur;
    if (!t || t.type !== "smidja") return null;
    const words = t.answers[0].split(" ");
    const k = t.cards.findIndex((c) => !c.fixed && c.answers[0] !== c.text && words.includes(c.answers[0]));
    if (k < 0) return null;
    const c = t.cards[k];
    return { k, form: c.answers[0], model: t.answers[0],
      first: words.map((w) => (w === c.answers[0] ? c.text : w)).join(" ") };
  });
  if (!plan) problems.push("could not draw a Setningasmiðja with a card to get wrong — its second try is untested");
  else {
    await page.type("#ans", plan.first);
    await tap("#check");
    await page.waitForSelector("#verdict .verdict.retry", { timeout: 4000 });
    const got = await page.evaluate((plan) => {
      const v = document.querySelector("#verdict .verdict");
      const cards = [...document.querySelectorAll("#task .wcards .wcard")];
      const inp = document.getElementById("ans");
      return { text: v.textContent, red: cards.map((c, k) => c.classList.contains("wrongpick") ? k : -1).filter((k) => k >= 0),
        green: cards.filter((c) => c.classList.contains("right")).length,
        open: !inp.disabled, focused: document.activeElement === inp, reveal: !!document.getElementById("reveal"),
        note: (document.getElementById("retrynote") || {}).textContent || "" };
    }, plan);
    ok(got.red.length === 1 && got.red[0] === plan.k && got.green === 0,
      `the retry should mark card ${plan.k} red and nothing green: red ${got.red}, green ${got.green}`);
    ok(got.open && got.focused && got.reveal, "the Setningasmiðja retry: box not open and focused, or no Sýna svarið");
    ok(/rauðu spjöldunum/.test(got.note) && /orðum rétt beygð/.test(got.text), `the retry prompt: "${got.note}"`);
    ok(!got.text.includes(plan.model) && !got.text.toLowerCase().split(/[^\p{L}]+/u).includes(plan.form.toLowerCase()),
      "the Setningasmiðja retry gives the answer away");
    await tap("#reveal");
    await page.waitForFunction("!document.querySelector('#reveal') && !document.querySelector('#verdict .retry')", { timeout: 4000 });
    const end = await page.evaluate(() => ({ text: document.querySelector("#verdict .verdict").textContent,
      locked: document.getElementById("ans").disabled }));
    ok(end.text.includes(plan.model) && end.locked, "Sýna svarið did not show the model sentence and close the box");
  }
  await page.evaluate(() => {
    const A = window.FALLASKOLI;
    A.run = null; A.runDone = null; A.cur = null;
    A.openView("practice");
    A.startRun("blandad", 100000);
  });
  await page.waitForFunction("window.FALLASKOLI.cur", { timeout: 4000 });
}

/* ---------- 2d. The one celebration, at the summary (item 61) -----------
 *
 * Badge windows used to open between questions. They now wait: the hundred
 * answers above won badges (the cabinet has them, and no window opened while
 * the session ran, checked in `answerOne`), and ending the session opens them
 * once, over the summary, which lists every one.
 *
 * This is also where the v5.6 keyboard rule lives now. The owner, on v5.5:
 * *"Enter does correctly work as 'Athuga' but if a badge is won, enter will
 * cycle through and acknowledge the badges but will not trigger 'Áfram', so
 * the user is forced to use the mouse."* The cause was focus: closing a window
 * drops it on <body>, where nothing listens. The windows are dismissed here with
 * real Enter presses, and then the focus must be on the summary's first button
 * and one more Enter must do what that button says.                         */
{
  await dismissModals();
  /* A fresh session, and one badge to win in it: the cheap `once` badge for
     fifty right answers is taken off the shelf, so the next right answer wins
     it again. It must come with NO window, and wait for the summary. */
  await page.evaluate(() => {
    const A = window.FALLASKOLI;
    A.run = null; A.runDone = null; A.cur = null;
    delete A.S.badges.tot50;
    A.openView("practice");
    A.startRun("blandad", 100000);
  });
  await page.waitForFunction("window.FALLASKOLI.cur", { timeout: 4000 });
  for (let i = 0; i < 6; i++) await answerOne(true);
  const before = await page.evaluate(() => {
    const A = window.FALLASKOLI;
    return { won: A.run.badges.length, run: !!A.run, shelf: !!A.S.badges.tot50 };
  });
  ok(before.run && before.shelf && before.won > 0,
    `the session won ${before.won} badges (tot50 on the shelf: ${before.shelf}), no window opened`);
  await page.evaluate(() => window.FALLASKOLI.endRun(true));
  await new Promise((r) => setTimeout(r, 300));
  const sum = await page.evaluate(() => ({
    summary: !!document.querySelector("#task .summary"),
    listed: document.querySelectorAll("#task .summary .sumbadges .runchip").length,
    windows: !!document.querySelector(".scrim #badgeok"),
    run: !!window.FALLASKOLI.run,
  }));
  ok(sum.summary && !sum.run, "ending the session did not draw the summary");
  ok(sum.listed === before.won, `the summary lists ${sum.listed} badges, the session won ${before.won}`);
  ok(sum.windows, "the session's badges were not celebrated at the summary");

  /* One celebration: the ceiling of core/rarity.js holds for the whole session. */
  let windows = 0;
  for (let i = 0; i < 80 && (await page.$(".scrim")); i++) {
    await page.keyboard.press("Enter");
    await new Promise((r) => setTimeout(r, 140));
    windows++;
  }
  ok(!(await page.$(".scrim")), "Enter did not close the badge windows");
  ok(windows > 0, "no badge window was open, so nothing was proved");
  worstQueue = Math.max(worstQueue, windows);
  ok(worstQueue <= 6, `${worstQueue} badge windows opened at the summary`);

  const focused = await page.evaluate(() => {
    const e = document.activeElement;
    return e && e.closest && e.closest(".nextrow") ? "nextrow" : (e && (e.id || e.tagName));
  });
  ok(focused === "nextrow", `focus went to "${focused}" after the last badge window, not to the summary's buttons`);

  /* The next Enter does what the focused button says. Which button is first
     depends on what this pupil's long session left behind (ui/session.js
     `renderSummary`): a pattern to practise, a weak word to rescue
     (🛟 Bjarga orðinu …), then "↻ Önnur lota". So the check reads the
     button first. A session the pupil chooses — "again", or practising the
     pattern — opens with the Orðakort that is due (#15); a rescue drill is
     about one word the pupil already has and has none. Until #82 (a new
     question type, so the seeded session met other questions) the session
     left no weak word and the first button was a session; since then it
     leaves one (*mynda*), and the old check, which expected a card from
     whatever button was first, failed on a correct program. */
  await new Promise((r) => setTimeout(r, 600));
  const first = await page.evaluate(() => {
    const e = document.activeElement;
    return { next: e && e.dataset ? e.dataset.next || (e.dataset.lesson ? "lesson" : null) : null,
      due: window.FALLASKOLI.cardDue() };
  });
  await page.keyboard.press("Enter");
  await new Promise((r) => setTimeout(r, 600));
  if (first.next === "again" || first.next === "focus") {
    /* #15: this pupil has no word in learning yet, so the session they asked
       for opens with a card — the Enter worked — and starts when it is done. */
    ok(!!first.due && await finishCard(), `Enter on the summary's first button (${first.next}) did not bring the Orðakort that is due (${first.due})`);
  } else if (first.next === "drill") {
    const drill = await page.evaluate(() => ({ drill: !!window.FALLASKOLI.drill, card: !!document.querySelector(".okort") }));
    ok(drill.drill && !drill.card, `Enter on "Bjarga orðinu" did not start its drill (or brought an Orðakort): ${JSON.stringify(drill)}`);
  } else {
    ok(false, `the summary's first button is "${first.next}", which this check does not know`);
  }
  await dismissModals();
  ok(await page.evaluate(() => !!window.FALLASKOLI.run || !!window.FALLASKOLI.cur),
    "Enter on the summary's first button did nothing — the mouse was still required");

  /* Back to one long session for what follows. */
  await page.evaluate(() => {
    const A = window.FALLASKOLI;
    A.run = null; A.runDone = null; A.cur = null;
    A.openView("practice");
    A.startRun("blandad", 100000);
  });
  await page.waitForFunction("window.FALLASKOLI.cur", { timeout: 4000 });
  ok(await page.$("#task .card") !== null, "no task on screen after the new session");
}

/* ---------- 3. The glossary tooltip ---------- */
const glossCount = await page.$$eval(".gl", (els) => els.length).catch(() => 0);
await page.evaluate(() => {
  const el = document.querySelector(".gl");
  if (el) el.click();
});
await new Promise((r) => setTimeout(r, 200));
const tip = await page.evaluate(() => {
  const t = document.querySelector(".tip");
  if (!t || t.hidden) return null;
  return { text: t.textContent.slice(0, 60), links: [...t.querySelectorAll("a")].map((a) => a.href) };
});
if (glossCount > 0) {
  ok(tip !== null, "the glossary tooltip did not open");
  ok(tip && tip.links.length === 3, "links missing from the glossary tooltip");
  ok(tip && tip.links.every((h) => /^https:/.test(h)), "invalid link");

  /* An open explanation must not swallow the click underneath it (v5.8).
   *
   * It did. The window is absolutely positioned with z-index 80 and took the
   * pointer, so one opened near the top of the page lay over the tab bar and
   * every press on "Merkin þín" went into the tooltip. The tab tests below
   * found it — they run with this very window still open — but only as "DIV
   * .tiplinks is lying over the button", which reads like a layout accident
   * rather than the rule it is. So it is a rule here.
   *
   * `pointer-events` is the fix and this is the assertion that keeps it: the
   * body of the window lets the pointer through, its links do not. */
  const passes = await page.evaluate(() => {
    const t = document.querySelector(".tip");
    const a = t.querySelector("a");
    return {
      body: getComputedStyle(t).pointerEvents,
      link: a ? getComputedStyle(a).pointerEvents : "none",
    };
  });
  ok(passes.body === "none", "the explanation window still swallows clicks under it");
  ok(passes.link === "auto", "the links inside the explanation are not clickable");
}

/* ---------- 3b. The definition must not answer the question --------------
 *
 * The owner: *"In the question type 'Greindu orðið sem er merkt' … the hover
 * function for the meaning of the word defeats the point, because the user can
 * hover and get the definition of the word, including what type of word it
 * is."* And the same for "Í hvaða orðflokki er orðið".
 *
 * Three things are asserted, and the third is the one that would be forgotten:
 * the trigger is gone, hovering really does open nothing, and the definition
 * comes BACK once the answer is in.                                        */
/* v6.13 (item 1): Greindu orðið goes further. Even the short text gave the
   class away ("vera í láréttri stellingu" is a verb), so until the class is
   answered there is no definition on the page at all — and no feature row,
   since Mynd, Háttur and Tíð name a verb as surely. Once the class is
   committed the definition comes back, open. Drawn until a word with a
   definition comes up, so the last check cannot pass by having nothing to
   look at. */
{
  await dismissModals();
  await tap(`nav.tabs button[data-view="practice"]`);
  let seen = 0, before = null, after = null;
  for (let draw = 0; draw < 40 && !after; draw++) {
    const found = await page.evaluate(() => {
      for (let i = 0; i < 400; i++) { window.FALLASKOLI.next(); if (window.FALLASKOLI.cur.type === "parse") return true; }
      return false;
    });
    if (!found) break;
    seen++;
    before = await page.evaluate(() => ({
      def: !!document.querySelector("#task .defline, #task #defbox"),
      rows: [...document.querySelectorAll("#task .opts")].map((b) => b.dataset.q),
    }));
    ok(!before.def, "parse: a definition is on the page before the class is answered");
    ok(before.rows.length === 1 && before.rows[0] === "fl",
      `parse: rows on the page before the class is answered: ${before.rows.join(", ")}`);
    await page.evaluate(() => {
      const c = window.FALLASKOLI.cur;
      [...document.querySelectorAll('.opts[data-q="fl"] button')].find((b) => b.dataset.v === c.rows[0].answer).click();
      document.getElementById("check").click();
    });
    after = await page.evaluate(() => {
      const b = document.querySelector("#task .defline");
      return b ? { open: !!b.querySelector(".dfn"), locked: !!b.querySelector(".dfnlocked") } : null;
    });
  }
  ok(seen > 0, "parse: no Greindu orðið question could be drawn");
  ok(after !== null, "parse: no word in 40 draws had a definition after its class — nothing was proved");
  if (after) ok(after.open && !after.locked, "parse: the definition did not come back open after the class");
  await dismissModals();
}

for (const want of ["indecl"]) {
  await dismissModals();
  await tap(`nav.tabs button[data-view="practice"]`);
  /* Draw this type until one of them actually has a definition box. Not every
     word has a lexicon entry, and `continue`-ing past the ones that do not
     would turn this into a check that cannot fail — which is worse than no
     check (design rule 4). If none of 40 has one, say so and fail. */
  let box = null;
  for (let draw = 0; draw < 40 && !box; draw++) {
    let found = false;
    for (let i = 0; i < 400 && !found; i++) {
      found = await page.evaluate((w) => {
        window.FALLASKOLI.next();
        return window.FALLASKOLI.cur.type === w;
      }, want);
    }
    if (!found) break;
    box = await page.evaluate(() => {
      /* `.defline` and not `#defbox`: the class is what v5.6 rendered too, so
         this check reads the OLD build as well and fails on it for the right
         reason — "the definition is still openable" — rather than for a missing
         id. */
      const b = document.querySelector("#task .defline");
      return b ? { locked: !!b.querySelector(".dfnlocked"),
                   open: !!b.querySelector(".dfn"),
                   links: b.querySelectorAll("a").length,
                   text: b.innerText.trim().length } : null;
    });
  }
  ok(box !== null,
    `${want}: no question in 40 draws had a definition box at all — nothing was proved`);
  if (!box) continue;
  ok(box.locked && !box.open,
    `${want}: the definition is still openable — hovering gives away the word class`);
  ok(box.text > 0, `${want}: the short definition disappeared; it was meant to stay`);
  ok(box.links === 0,
    `${want}: dictionary links are still offered, and every dictionary prints the word class`);

  /* Hover it for longer than any delay in ui/dom.js, then click it. No
     DEFINITION may open: a definition's tip is keyed "dfn:<word>" (ui/dom.js
     `keyOf`). A grammar term's tip ("eintala") is not one: the real pointer
     rests where the last tap left it, and a term the question happens to draw
     there opens its own tip, which #9's lexicon made happen here. Any open
     tip is closed first. */
  await page.evaluate(() => document.querySelectorAll(".tip").forEach((t) => { t.hidden = true; }));
  await page.evaluate(() => {
    /* Whatever the definition is wrapped in — the point is that pointing at it
       must do nothing, not that it carries a particular class. */
    const el = document.querySelector("#task .defline span");
    if (!el) return;
    el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 1700));
  const opened = await page.evaluate(() => {
    const t = document.querySelector(".tip");
    return t && !t.hidden ? t.dataset.for || "?" : null;
  });
  ok(!opened || !(opened === "?" || opened.startsWith("dfn:")),
    `${want}: a window opened over the locked definition (${opened})`);

  /* Answer it — correctly, it does not matter — and the definition comes back. */
  await answerOne(true);
  /* answerOne() moves on to the next question, so check the unlock on a fresh
     one instead: draw the type again, answer without advancing. */
  let again = false;
  for (let i = 0; i < 400 && !again; i++) {
    again = await page.evaluate((w) => {
      window.FALLASKOLI.next();
      return window.FALLASKOLI.cur.type === w &&
             !!document.querySelector("#task .defline");
    }, want);
  }
  if (!again) continue;
  await page.evaluate(() => {
    const c = window.FALLASKOLI.cur;
    [...document.querySelectorAll(".opts button")]
      .find((x) => x.dataset.v === c.answer)?.click();
    document.getElementById("check").click();
  });
  await new Promise((r) => setTimeout(r, 250));
  const afterAnswer = await page.evaluate(() => {
    const b = document.querySelector("#task .defline");
    return b ? { open: !!b.querySelector(".dfn"), locked: !!b.querySelector(".dfnlocked") } : null;
  });
  if (afterAnswer) {
    ok(afterAnswer.open && !afterAnswer.locked,
      `${want}: the definition did not come back after the answer`);
  }
  await dismissModals();
}

/* ---------- 4. Tabs ---------- */
async function openTab(view) {
  await dismissModals();
  await tap(`nav.tabs button[data-view="${view}"]`);
  try {
    await page.waitForFunction(
      (v) => !document.getElementById("view-" + v).hidden, { timeout: 4000 }, view);
  } catch {
    /* Do not crash — say *what* was lying over the button. A silent crash
       here was exactly the bug that made the browser test useless in v5.2. */
    const cover = await page.evaluate((v) => {
      const b = document.querySelector(`nav.tabs button[data-view="${v}"]`);
      const r = b.getBoundingClientRect();
      const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { at: el ? el.tagName + "." + (el.className || "") : "nothing", scrim: !!document.querySelector(".scrim") };
    }, view);
    problems.push(`tab ${view} did not open — ${cover.at} is lying over the button` +
      (cover.scrim ? " (a badge window is still open)" : ""));
    return;
  }
  await new Promise((r) => setTimeout(r, 150));
}

for (const view of ["progress", "class", "settings"]) {
  await openTab(view);
  const filled = await page.$eval(`#view-${view}`, (el) => el.innerText.length);
  ok(filled > 120, `tab ${view} is empty (${filled} characters)`);
}

/* The skill cards are on Færnikort (the heads of the skill map's
   trails) and the switches on Stillingar; both are drawn when
   their tab is opened. */
await openTab("map");
await openTab("settings");
/* The count is read from SKILLS, not written here. A new skill should appear
   in both lists by itself — that is the whole of the claim that years 9 and 10
   cost one entry each. Hard-coding it here would mean editing the test every
   time, and then the claim would be false. */
const skillCount = await page.evaluate(
  () => document.querySelectorAll('#policyeditor input[data-dim="skills"]').length);
/* Since item 83 a skill's card is the head of its trail on the skill map. */
const skillCards = await page.$$eval("#skillmap .smlane:not(.planned)", (e) => e.length);
ok(skillCards === skillCount, `${skillCards} skill cards but ${skillCount} skills`);
ok(skillCount === 15, `${skillCount} skills — 12 before Námsorð (#19), Lesskilningur (#30) and Frásögn (#35)`);

/* v5.8: the same editor also carries the question types, the difficulty levels
   and the inflectional features. Counted from the catalogue rather than written
   down here, for the same reason as the skills: a switch that exists in
   core/policy.js and not on the screen is a switch the adult was promised and
   does not have. */
const switchCounts = await page.evaluate(() => ({
  types: document.querySelectorAll('#policyeditor input[data-dim="types"]').length,
  levels: document.querySelectorAll('#policyeditor input[data-dim="levels"]').length,
  attrs: document.querySelectorAll('#policyeditor input[data-dim="attrs"]').length,
}));
ok(switchCounts.types === QT_COUNT, `${switchCounts.types} question-type switches, expected ${QT_COUNT} (v6.11: one per entry in QUESTION_TYPES the app grades)`);
ok(switchCounts.levels === 7, `${switchCounts.levels} difficulty switches, expected 7`);
ok(switchCounts.attrs === 30, `${switchCounts.attrs} attribute switches, expected 30`);

/* v6.13 (item 39): three year presets above the switches. A press sets the
   switches to what the curriculum map says the year covers, the editor says
   which year is chosen, and one switch changed by hand unchooses it. The
   state is put back afterwards so the checks below start where they did. */
{
  const before = await page.evaluate(() => JSON.stringify({
    enabled: window.FALLASKOLI.S.enabled, policy: window.FALLASKOLI.S.policy }));
  const read = () => page.evaluate(() => ({
    buttons: [...document.querySelectorAll("#policyeditor button[data-preset]")]
      .map((b) => b.textContent.trim()),
    pressed: [...document.querySelectorAll('#policyeditor button[aria-pressed="true"]')]
      .map((b) => b.dataset.preset),
    setn: document.querySelector('#policyeditor input[data-dim="skills"][data-key="setningafraedi"]').checked,
    obst: document.querySelector('#policyeditor input[data-dim="types"][data-key="ob_st"]').checked,
    lvl6: document.querySelector('#policyeditor input[data-dim="levels"][data-key="6"]').checked,
    saved: window.FALLASKOLI.S.enabled.setningafraedi,
    line: document.querySelector("#polpresetnow").textContent,
  }));
  const press = (y) => page.evaluate((year) =>
    document.querySelector(`#policyeditor button[data-preset="${year}"]`).click(), y);

  let v = await read();
  ok(v.buttons.join("|") === "8. bekkur|9. bekkur|10. bekkur", `preset buttons: ${v.buttons.join("|")}`);
  ok(v.pressed.length === 0, `a new pupil is on no preset, but ${v.pressed} is pressed`);

  await press(10);
  v = await read();
  ok(v.pressed.join() === "10" && v.setn && v.obst && v.lvl6 && v.saved === true,
    `10. bekkur: ${JSON.stringify(v)}`);

  await press(8);
  v = await read();
  ok(v.pressed.join() === "8" && !v.setn && !v.obst && !v.lvl6 && v.saved === false,
    `8. bekkur: ${JSON.stringify(v)}`);
  ok(v.line.startsWith("8. bekkur"), `the line under the buttons says "${v.line}"`);

  await page.evaluate(() =>
    document.querySelector('#policyeditor input[data-dim="types"][data-key="ob_st"]').click());
  v = await read();
  ok(v.pressed.length === 0 && v.line.startsWith("Enginn bekkur"),
    `one switch changed by hand should unchoose the year: ${JSON.stringify(v)}`);

  await page.evaluate((raw) => {
    const A = window.FALLASKOLI, was = JSON.parse(raw);
    for (const k of Object.keys(A.S.enabled)) delete A.S.enabled[k];
    Object.assign(A.S.enabled, was.enabled);
    A.S.policy = was.policy;
    A.reloadPolicy(); A.save();
  }, before);
  await openTab("progress");
  await openTab("settings");
}

/* ---------- 4b. The collection and hidden badges ---------- */
await openTab("progress");
/* Hidden badges live in the CATALOGUE view. The cabinet opens on the rarity
   view by default (v5.7) and that one is the trophy shelf — it shows what has
   been won and nothing else, deliberately. */
await page.evaluate(() => document.querySelector('[data-bview="group"]')?.click());
await new Promise((r) => setTimeout(r, 150));
const coll = await page.evaluate(() => ({
  groups: document.querySelectorAll(".collgroup").length,
  words: document.querySelectorAll(".chip.word").length,
  mystery: document.querySelectorAll(".badge.mystery").length,
  sub: document.getElementById("collsub").innerText,
}));
ok(coll.groups > 0, "the collection did not render");
ok(coll.words > 0, "no words in the collection after a hundred answers");
ok(coll.mystery > 0, "no hidden badges — everything is visible in advance");
ok(/%/.test(coll.sub), "the collected-words percentage is missing");

/* Issue #12: "Orðin mín" shows the words in learning, and says nothing more.
   Issue #15: a word enters only when its Orðakort is done. Most of this
   page's sessions were started by the test (`startRun`); the one the pupil
   started from the summary (Enter, above) opened with one card. So exactly
   the words whose cards are done are in, fewer than six, and the pane offers
   the next card. The cards themselves, and six words after six cards, are
   section #15 at the end of this file. */
const mine = await page.evaluate(() => ({
  shown: [...document.querySelectorAll("#mywords .chip.myword")].map((e) => e.textContent.trim()),
  saved: Object.values(window.FALLASKOLI.S.learning || {}).filter((r) => r.s === "l").length,
  cards: Object.keys(window.FALLASKOLI.S.wordCards || {}).length,
  offer: (document.getElementById("mywordnew") || {}).textContent || "",
  text: document.getElementById("pane-words").innerText,
}));
ok(mine.saved === mine.cards && mine.saved < 6, `${mine.saved} words in learning, ${mine.cards} cards done`);
ok(mine.shown.length === mine.saved, `Orðin mín shows ${mine.shown.length} words, ${mine.saved} are in learning`);
ok(mine.offer === "Kynnast nýju orði", `Orðin mín does not offer the next word's card: "${mine.offer}"`);
ok(!/DLD|málþroska/i.test(mine.text), "the word pane names DLD");

const shownWords = await page.$$eval(".chip.word", (els) => els.map((e) => e.textContent.trim()));
const knownWords = await page.evaluate(() => Object.keys(window.FALLASKOLI.S.words).length);
ok(shownWords.length <= knownWords,
  `${shownWords.length} words shown but only ${knownWords} met — unseen words are leaking out`);

/* ---------- 4c. The badge cabinet has two views -------------------------
 *
 * The owner: *"the user can both view which of the badges in a certain category
 * he has already achieved … and by rarity … first all of the users
 * goðsagnakennt, then mjög sjaldgæft and so on."*                          */
await openTab("progress");
{
  const pick = await page.$$eval("#badgeviews button", (b) => b.map((x) => x.dataset.bview));
  ok(pick.join(",") === "rarity,group", `the view switch is ${pick.join(",")}`);

  /* Rarity view: tier headings, rarest first, and ONLY badges that were won. */
  await page.evaluate(() => document.querySelector('[data-bview="rarity"]').click());
  await new Promise((r) => setTimeout(r, 150));
  const rar = await page.evaluate(() => ({
    tiers: [...document.querySelectorAll("#badgegrid h3.tiergroup")]
      .map((h) => h.textContent.trim().split("\n")[0].trim()),
    locked: document.querySelectorAll("#badgegrid .badge.locked").length,
    earned: document.querySelectorAll("#badgegrid .badge.earned").length,
    owned: Object.keys(window.FALLASKOLI.S.badges).length,
  }));
  ok(rar.tiers.length > 0, "the rarity view drew no tier headings");
  ok(rar.locked === 0, `${rar.locked} locked badges on the trophy shelf`);
  ok(rar.earned === rar.owned,
    `${rar.earned} badges shown but ${rar.owned} won`);
  /* Rarest first: the headings must appear in the tier order, reversed. */
  const ORDER = ["Goðsagnakennt", "Sögulegt", "Mjög sjaldgæft", "Sjaldgæft", "Óalgengt", "Algengt"];
  const idx = rar.tiers.map((t) => ORDER.findIndex((o) => t.includes(o)));
  ok(idx.every((v, i) => v >= 0 && (i === 0 || v > idx[i - 1])),
    "the rarity view is not ordered rarest first: " + rar.tiers.join(" | "));

  /* Group view: the old one, with locked badges and the group headings. */
  await page.evaluate(() => document.querySelector('[data-bview="group"]').click());
  await new Promise((r) => setTimeout(r, 150));
  const grp = await page.evaluate(() => ({
    locked: document.querySelectorAll("#badgegrid .badge.locked").length,
    tiers: document.querySelectorAll("#badgegrid h3.tiergroup").length,
    saved: window.FALLASKOLI.S.settings.badgeView,
  }));
  ok(grp.locked > 0, "the group view is hiding what is still to be won");
  ok(grp.tiers === 0, "tier headings leaked into the group view");
  ok(grp.saved === "group", "the chosen view is not remembered");
}

/* ---------- 4d. Somebody else's badges, by rarity ------------------------
 *
 * The owner: *"I would like the badges to be colored by rarity and displayed by
 * rarity, so that the rarest badges are shown first … If the number of badges
 * exceed 10 then show the 10 rarest badges, and a badge-shaped 'other' category
 * with a counter … and displays all the badges in a grid on hover."*
 *
 * There is no server behind a `file:` URL, so the roster is fed in directly.
 * What is being tested is the drawing, and the drawing is the part that was
 * asked for.                                                               */
{
  const many = await page.evaluate(() => {
    const A = window.FALLASKOLI;
    /* Every badge in the catalogue, so the list is well past ten. */
    const ids = [...document.querySelectorAll("#badgegrid .badge")].length;
    A.roster = [
      { profile: "a", name: "Halla", level: 7, crest: "legendary", crown: false,
        badgeIds: A.__ALLIDS || [] },
      { profile: "b", name: "Jón", level: 2, badgeIds: (A.__ALLIDS || []).slice(0, 4) },
    ];
    return ids;
  });
  /* The catalogue ids are not exposed on purpose, so take them from the state
     the hundred answers produced plus every id the grid rendered. */
  await page.evaluate(() => {
    const A = window.FALLASKOLI;
    const owned = Object.keys(A.S.badges);
    A.roster[0].badgeIds = owned;
    A.roster[1].badgeIds = owned.slice(0, 4);
  });
  /* Skólastofan is drawn when its tab is opened — with the roster in place. */
  await page.evaluate(() => window.FALLASKOLI && document
    .querySelector('nav.tabs button[data-view="class"]').click());
  await new Promise((r) => setTimeout(r, 200));

  const roster = await page.evaluate(() => {
    const users = [...document.querySelectorAll(".rosteruser")];
    return users.map((u) => ({
      chips: u.querySelectorAll(".rosterchips > .rarchip").length,
      other: !!u.querySelector(".otherbadges"),
      otherCount: u.querySelector(".othergrid")
        ? u.querySelectorAll(".othergrid .rarchip").length : 0,
      shares: [...u.querySelectorAll(".rosterchips > .rarchip")]
        .map((c) => c.getAttribute("style")),
    }));
  });
  const owned = await page.evaluate(() => Object.keys(window.FALLASKOLI.S.badges).length);
  ok(roster.length === 2, `${roster.length} users in the roster`);
  if (roster.length === 2) {
    const big = roster[0];
    if (owned > 10) {
      ok(big.chips === 10, `${big.chips} badges shown, not the ten rarest`);
      ok(big.other, "no 'other' door for the badges past the tenth");
      ok(big.otherCount === owned - 10,
        `${big.otherCount} badges behind the door, expected ${owned - 10}`);
    }
    ok(roster[1].chips === 4 && !roster[1].other,
      "a short list should be shown whole, with no door");
    ok(big.shares.every((s) => s && s.includes("--rar:")),
      "somebody else's badges are not coloured by rarity");
  }

  /* The door opens on a tap as well as on hover — there is no hover on an
     iPad, and the iPad is the case that would otherwise be silently broken. */
  if (roster[0] && roster[0].other) {
    const opened = await page.evaluate(() => {
      const el = document.querySelector(".otherbadges");
      el.click();
      return el.classList.contains("open") &&
        getComputedStyle(el.querySelector(".othergrid")).display !== "none";
    });
    ok(opened, "the 'other' door does not open on a tap");
  }
}

/* ---------- 4e. The leaderboard ----------------------------------------
 *
 * It says plainly that there is nothing to compare when the file is opened by
 * double click. The version with a real server behind it is in
 * tools/server-test.mjs — that is where it can actually be proved.        */
{
  const board = await page.$eval("#board", (e) => e.innerText.trim());
  ok(board.length > 20, "the leaderboard section is empty even of an explanation");
}

/* ---------- 4f. The card, the shelf, medals and rumours (v6.1) -----------
 *
 * The parts of the social side that work from a file: the child's own card
 * with its three slots, pinning a badge onto it, the medal on a badge won many
 * times — and, with a roster fed in as in 4d, a secret badge on somebody
 * else's shelf showing its name but not its condition.                     */
{
  await page.evaluate(() => document.querySelector('[data-bview="group"]').click());
  await new Promise((r) => setTimeout(r, 150));
  const card = await page.evaluate(() => ({
    slots: document.querySelectorAll("#mycard .slot").length,
    titles: document.querySelectorAll("#titlepick option").length,
    pins: document.querySelectorAll("#badgegrid .badge.earned .pin").length,
    earned: document.querySelectorAll("#badgegrid .badge.earned").length,
    lockedPins: document.querySelectorAll("#badgegrid .badge.locked .pin").length,
  }));
  ok(card.slots === 3, `the card has ${card.slots} slots, not three`);
  ok(card.titles >= 1, "the title picker is empty");
  ok(card.pins === card.earned && card.pins > 0, "not every earned badge can be pinned");
  ok(card.lockedPins === 0, "a badge that has not been won can be pinned");

  const pinned = await page.evaluate(() => {
    const A = window.FALLASKOLI;
    const pin = document.querySelector("#badgegrid .badge.earned .pin");
    const id = pin.dataset.pin;
    pin.click();
    const after = document.querySelector(`#badgegrid .pin[data-pin="${id}"]`);
    return {
      state: A.S.showcase.join(), id,
      pressed: after.getAttribute("aria-pressed"),
      filled: document.querySelectorAll("#mycard .slot.filled").length,
    };
  });
  ok(pinned.state === pinned.id && pinned.pressed === "true",
    "pressing the pin did not put the badge on the shelf");
  ok(pinned.filled === 1, `after pinning one badge the card shows ${pinned.filled}`);
  const unpinned = await page.evaluate((id) => {
    document.querySelector(`#badgegrid .pin[data-pin="${id}"]`).click();
    return window.FALLASKOLI.S.showcase.length;
  }, pinned.id);
  ok(unpinned === 0, "pressing the pin again did not take the badge down");

  /* A badge won twelve times wears the silver medal. */
  const medal = await page.evaluate(() => {
    const A = window.FALLASKOLI;
    const id = Object.keys(A.S.badges)[0];
    A.S.badges[id].n = 12;
    document.querySelector('[data-bview="rarity"]').click();
    return !!document.querySelector("#badgegrid .times.medal.m2");
  });
  ok(medal, "a badge won twelve times shows no silver medal");

  /* A secret the child has not found, on somebody else's shelf. */
  const rumour = await page.evaluate(() => {
    const A = window.FALLASKOLI;
    delete A.S.badges.s_leapday;
    A.roster = [{ profile: "a", name: "Halla", level: 7, title: "badge:s_leapday",
                  showcase: ["s_leapday"], badgeIds: ["s_leapday", "lvl2"],
                  firstIds: ["s_leapday"], tiers: {} }];
    /* opening the tab is what draws the roster */
    document.querySelector('nav.tabs button[data-view="class"]').click();
    const chips = [...document.querySelectorAll("#roster .rosterchips > .rarchip")];
    const secret = chips.find((c) => c.textContent.includes("Hlaupár"));
    const plain = chips.find((c) => c.textContent.includes("Stig 2"));
    return {
      secretClass: secret ? secret.className : "", secretTitle: secret ? secret.title : "",
      secretText: secret ? secret.textContent : "",
      plainClass: plain ? plain.className : "", plainTitle: plain ? plain.title : "",
      title: document.querySelector("#roster .whotitle")?.textContent,
      shelf: document.querySelector("#roster .shelfico")?.title || "",
    };
  });
  ok(rumour.secretClass.includes("rumour") && rumour.secretText.includes("???"),
    "a secret badge the child has not found is not drawn as a rumour");
  ok(!rumour.secretTitle.includes("29. febrúar") && !rumour.shelf.includes("29. febrúar"),
    "the rumour gives away the condition of the secret badge");
  ok(!rumour.plainClass.includes("rumour") && rumour.plainTitle.includes("heildarstigi"),
    "an ordinary badge lost its description on somebody else's shelf");
  ok(rumour.title === "Hlaupár", `a badge title shows as "${rumour.title}"`);
}

/* ---------- 5. A switch really does turn material off ---------- */
await page.evaluate(() => {
  document.querySelectorAll('#policyeditor input[data-dim="skills"]').forEach((el) => {
    if (el.dataset.key !== "nafnord" && el.checked) el.click();
  });
});
await openTab("practice");
await page.evaluate(() => window.FALLASKOLI.next());
const onlyNoun = await page.evaluate(() => {
  const out = [];
  for (let i = 0; i < 25; i++) { window.FALLASKOLI.next(); out.push(window.FALLASKOLI.cur.skill); }
  return [...new Set(out)];
});
ok(onlyNoun.length === 1 && onlyNoun[0] === "nafnord",
  "disabled material appeared anyway: " + onlyNoun.join(", "));

/* ---------- 6. Progress survives a reload ----------
   The figure is read HERE, immediately before the save, rather than reused from
   the snapshot taken after the hundred answers: everything between the two adds
   XP, so the old comparison drifted further out of range with every check
   added to this file, and in v5.9 it finally failed on a program that was
   saving perfectly. A test whose tolerance depends on how many other tests run
   before it is measuring the test suite, not the program. */
const beforeReload = await page.evaluate(() => window.FALLASKOLI.S.xp);
await page.evaluate(() => window.FALLASKOLI.save(true));
await new Promise((r) => setTimeout(r, 300));
await page.reload({ waitUntil: "domcontentloaded" });
await startPractice(page, 15000);
const reloaded = await page.evaluate(() => window.FALLASKOLI.S.xp);
ok(reloaded > 0 && reloaded === beforeReload,
  `XP was lost on reload: ${beforeReload} -> ${reloaded}`);


/* ---------- 8. The badge that had to wait for midnight ------------------
 *
 * The owner: *"the user sees the badge when they next log in after it has
 * triggered at 00:00 the day the condition was met, but the date of achievement
 * remains on the day the badge was triggered."*
 *
 * Everything about this is unit-tested, but the thing the owner will actually
 * look at is a window appearing at start-up with yesterday's date on it, so
 * that is what is checked here: write a finished yesterday into the saved
 * state, reload, and require the window.                                    */
{
  await page.setViewport({ width: 1100, height: 900 });
  await page.evaluate(async () => {
    const A = window.FALLASKOLI;
    const pad = (n) => String(n).padStart(2, "0");
    const key = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
    const y = new Date(); y.setDate(y.getDate() - 1);
    const before = new Date(); before.setDate(before.getDate() - 2);
    A.S.goal = 10;
    /* Yesterday stopped exactly on the goal and had nothing wrong: "Upp á hár"
       and, at twenty answers, nothing else — ten is below Flekklaus dagur. */
    A.S.days[key(y)] = { a: 10, c: 10, xp: 40, ms: 0, nw: 0, sk: {}, g: 10 };
    A.S.settled = key(before);
    delete A.S.badges.s_exactgoal;
    window.__YKEY = key(y);
    await A.save(true);
  });
  const ykey = await page.evaluate(() => window.__YKEY);

  await page.reload({ waitUntil: "domcontentloaded" });
  await startPractice(page, 15000);
  await page.waitForSelector(".scrim", { timeout: 8000 }).catch(() => {});

  const won = await page.evaluate(() => {
    const m = document.querySelector(".scrim .modal");
    return m ? { text: m.innerText, kicker: m.querySelector(".kicker")?.textContent || "" } : null;
  });
  ok(won !== null, "no badge window at start-up for a day that finished on the goal");
  if (won) {
    ok(/Upp á hár/.test(won.text), "the wrong badge was settled: " + won.text.slice(0, 80));
    ok(/gærdagsins/.test(won.kicker),
      "the window does not say the badge is from a finished day");
    ok(/Unnið/.test(won.text), "the window does not say WHEN it was won");
  }
  await dismissModals();

  const rec = await page.evaluate(() => window.FALLASKOLI.S.badges.s_exactgoal);
  ok(rec && rec.last === ykey,
    `the badge is dated ${rec && rec.last} — it should carry the day it was earned (${ykey})`);
  ok(await page.evaluate(() => window.FALLASKOLI.S.settled) === ykey,
    "the day was not marked as settled, so it will be judged again tomorrow");

  /* And a second start-up must not hand it out twice. */
  await page.evaluate(() => window.FALLASKOLI.save(true));
  await new Promise((r) => setTimeout(r, 250));
  await page.reload({ waitUntil: "domcontentloaded" });
  await startPractice(page, 15000);
  await new Promise((r) => setTimeout(r, 500));
  const again = await page.evaluate(() =>
    (window.FALLASKOLI.S.badges.s_exactgoal || {}).n);
  ok(again === 1, `the settled badge was awarded ${again} times — a settled day must stay settled`);
  await dismissModals();
}

/* ---------- 9. Laptops, iPads and phones -------------------------------
 *
 * The owner: *"I want to make sure this displays correctly in different
 * browsers, on laptops, ipads and phones."*
 *
 * The engine is the same one every time — there is no Safari and no Firefox in
 * this environment, and pretending otherwise would be worse than saying so. What this checks is the other
 * half, which is the half that actually breaks: the layout at every width the
 * owner named, both orientations of the iPad included.
 *
 * Three things per size, and all three are things that have gone wrong before:
 * nothing runs off the side, every tap target is at least 44px, and every text
 * input is at least 16px — below that iOS Safari zooms the page in the instant
 * a child starts typing and does not zoom back out.
 */
const DEVICES = [
  { nm: "laptop 1440",       w: 1440, h: 900,  touch: false },
  { nm: "laptop 1280",       w: 1280, h: 800,  touch: false },
  { nm: "iPad landscape",    w: 1080, h: 810,  touch: true  },
  { nm: "iPad portrait",     w: 810,  h: 1080, touch: true  },
  { nm: "iPad mini portrait", w: 744, h: 1133, touch: true  },
  { nm: "iPhone 14",         w: 390,  h: 844,  touch: true  },
  { nm: "iPhone SE",         w: 375,  h: 667,  touch: true  },
  { nm: "small Android",     w: 360,  h: 740,  touch: true  },
];

for (const d of DEVICES) {
  await page.setViewport({ width: d.w, height: d.h, isMobile: d.touch,
                           hasTouch: d.touch, deviceScaleFactor: d.touch ? 2 : 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await startPractice(page, 15000);

  for (const view of ["practice", "progress", "class", "settings"]) {
    await tap(`nav.tabs button[data-view="${view}"]`);
    await new Promise((r) => setTimeout(r, 140));

    const overflow = await page.evaluate(() => {
      const w = document.documentElement.clientWidth;
      const bad = [];
      document.querySelectorAll("body *").forEach((el) => {
        if (el.offsetParent === null) return;
        const r = el.getBoundingClientRect();
        if (r.width === 0) return;
        /* Charts scroll inside .chartbox — that is intended. Skip them and
           everything inside them (the svg draws on its own axis). The badge
           drawer in the roster is absolutely positioned and only exists while
           it is open, which it is not. */
        if (el.closest(".chartbox") || el.closest(".othergrid")) return;
        if (r.right > w + 1) bad.push(el.tagName + "." + (el.className || "") +
          " " + Math.round(r.right) + ">" + w);
      });
      return bad.slice(0, 4);
    });
    ok(overflow.length === 0,
      `${d.nm} / ${view}: runs off the right edge: ${overflow.join(" | ")}`);
  }

  if (d.touch) {
    /* Only on touch: a 36px button is fine with a mouse and wrong with a
       thumb. Checked on every tab, because the admin buttons and the new view
       switches live on tabs the old check never opened. */
    for (const view of ["practice", "lessons", "progress", "class", "settings"]) {
      await tap(`nav.tabs button[data-view="${view}"]`);
      await new Promise((r) => setTimeout(r, 120));
      const small = await page.evaluate(() => {
        const out = [];
        document.querySelectorAll("button, input[type=text], textarea, [role=button]")
          .forEach((el) => {
            if (el.offsetParent === null) return;
            const r = el.getBoundingClientRect();
            /* An inline hover trigger inside a sentence is text, not a control —
               making it 44px tall would break the line height of the sentence
               it sits in. It is never the only way to reach anything. */
            if (el.classList.contains("gl") || el.classList.contains("dfn")) return;
            if (r.height > 0 && r.height < 40)
              out.push((el.id || el.className || el.tagName) + " " + Math.round(r.height) + "px");
          });
        return [...new Set(out)].slice(0, 5);
      });
      ok(small.length === 0, `${d.nm} / ${view}: tap targets too small: ${small.join(", ")}`);
    }

    const fontSizes = await page.evaluate(() => {
      const bad = [];
      document.querySelectorAll("input[type=text], textarea").forEach((el) => {
        if (el.offsetParent === null) return;
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (fs < 16) bad.push((el.id || el.tagName) + " " + fs + "px");
      });
      return bad;
    });
    ok(fontSizes.length === 0,
      `${d.nm}: input under 16px, so iOS will zoom in: ${fontSizes.join(", ")}`);
  }
}

/* ---------- the rescue drill (v6.6) ------------------------------------
 *
 * A word answered seven times and right once is in trouble. It must show up
 * in the collection as a button, the button must start a drill on THAT word,
 * ten right answers must end it as a rescue — with XP, the badge and the
 * ledger — and twenty wrong ones on another word must end it as an endured
 * drill, not run forever. Real clicks, real typing, the same `answerOne`. */
await page.setViewport({ width: 1100, height: 900 });
{
  const seeded = await page.evaluate(() => {
    const A = window.FALLASKOLI;
    A.drill = null; A.drillOffer = null; A.drillDone = null;
    A.S.words["hestur|kk"] = { c: 1, w: 6, h: "0001000" };
    A.S.words["kona|kvk"] = { c: 0, w: 8, h: "00000000" };
    delete (A.S.drills || {})["hestur|kk"];
    return { xp: A.S.xp };
  });
  await tap('nav.tabs button[data-view="progress"]');
  await tap('#panepick button[data-pane="words"]');
  const risk = await page.evaluate(() => ({
    box: !!document.querySelector("#collhealth .atrisk"),
    keys: [...document.querySelectorAll("#collhealth button[data-drill]")].map((b) => b.dataset.drill),
    score: document.querySelector("#collhealth .tile b")?.textContent || "",
    small: [...document.querySelectorAll("#collhealth button")]
      .filter((b) => b.getBoundingClientRect().height < 40).length,
  }));
  ok(risk.box, "the collection does not show the words in trouble");
  ok(risk.keys.includes("hestur|kk") && risk.keys.includes("kona|kvk"),
    "a word in trouble is not offered for a drill: " + risk.keys.join(","));
  ok(risk.score !== "", "the collection does not show the Orðaforði score");
  ok(risk.small === 0, `${risk.small} drill buttons in the collection are under 40px`);

  await tap('#collhealth button[data-drill="hestur|kk"]');
  const started = await page.evaluate(() => ({
    view: !document.getElementById("view-practice").hidden,
    drill: window.FALLASKOLI.drill && window.FALLASKOLI.drill.key,
    word: window.FALLASKOLI.cur && window.FALLASKOLI.cur.word,
    bar: document.querySelector("#drillbar .drillstrip.active")?.innerText || "",
  }));
  ok(started.view, "starting a drill did not go to the practice tab");
  ok(started.drill === "hestur|kk", "the drill is not on the word that was clicked");
  ok(started.word === "hestur|kk", "the first drill question is about " + started.word);
  ok(/hestur/.test(started.bar), "the drill strip does not name the word");

  /* v6.7: the fifth question is the meaning question, which has no wrong
     answer and does not count — so ten counted answers take eleven. */
  const words = new Set(), kinds = [];
  for (let i = 0; i < 12; i++) {
    const now = await page.evaluate(() => window.FALLASKOLI.drill
      ? { word: window.FALLASKOLI.cur.word, type: window.FALLASKOLI.cur.type } : null);
    if (!now) break;
    words.add(now.word); kinds.push(now.type);
    try { await answerOne(true); } catch (e) { problems.push(`drill answer ${i} threw: ${e.message}`); break; }
  }
  ok(kinds[4] === "meaning", "the fifth drill question is not Orðaforði: " + kinds.join(","));
  const won = await page.evaluate(() => {
    const A = window.FALLASKOLI;
    return { drill: A.drill, done: A.drillDone, ledger: (A.S.drills || {})["hestur|kk"],
             badge: !!A.S.badges.rescue1, perfect: !!A.S.badges.drill_perfect, xp: A.S.xp,
             bar: document.querySelector("#drillbar .drillstrip.win")?.innerText || "" };
  });
  ok(words.size === 1 && words.has("hestur|kk"), "a drill question was about another word: " + [...words]);
  ok(won.drill === null, "ten right answers did not end the drill");
  ok(won.done && won.done.passed && won.done.c === 10, "the drill did not end as a rescue");
  ok(won.ledger && won.ledger.p === 1, "the rescue is not in the ledger");
  ok(won.badge && won.perfect, "the rescue badges were not awarded");
  ok(won.xp - seeded.xp >= 50 + 5 * 10, `the rescue paid ${won.xp - seeded.xp} XP`);
  ok(/bjargað/i.test(won.bar), "the drill strip does not say the word was rescued");

  await page.evaluate(() => window.FALLASKOLI.startDrill("kona|kvk"));
  for (let i = 0; i < 22; i++) {
    if (!(await page.evaluate(() => !!window.FALLASKOLI.drill))) break;
    try { await answerOne(false); } catch (e) { problems.push(`endure answer ${i} threw: ${e.message}`); break; }
  }
  const endured = await page.evaluate(() => ({
    drill: window.FALLASKOLI.drill, done: window.FALLASKOLI.drillDone,
    badge: !!window.FALLASKOLI.S.badges.drill_endure,
    ledger: (window.FALLASKOLI.S.drills || {})["kona|kvk"],
  }));
  ok(endured.drill === null, "twenty answers did not end the drill");
  ok(endured.done && !endured.done.passed && endured.done.n === 20, "the endured drill was not settled");
  ok(endured.badge, "Seigla was not awarded for sticking it out");
  ok(endured.ledger && endured.ledger.f === 1 && endured.ledger.p === 0, "the endured drill is not in the ledger");
}

/* ---------- Lesefni (v6.7) ----------------------------------------------
 * The 📖 link on a question opens the page that teaches it, the page has its
 * BÍN tables, and the page is remembered as read. */
await page.setViewport({ width: 1100, height: 900 });
await tap('nav.tabs button[data-view="practice"]');
await startPractice(page, 5000);      // the drill above reset the state; v6.10 opens on the picker
{
  const link = await page.evaluate(() => {
    const b = document.querySelector("#task .eyebrow .lessonlink");
    return b ? b.dataset.lesson : null;
  });
  ok(!!link, "the question has no 📖 link to Lesefni");
  if (link) {
    await tap("#task .eyebrow .lessonlink");
    /* v6.8: opening a page does not mark it read; reaching its end and
       staying eight seconds does. This test had not caught up (it failed on
       v6.8 too); it now reads the page the way a child would. */
    const early = await page.evaluate(() => Object.keys(window.FALLASKOLI.S.read || {}));
    ok(!early.includes(link), "the page was marked read the moment it opened");
    /* Let the watcher see the page as it opened (its end below the fold)
       before scrolling, as a reader does; then read to the end. */
    await new Promise((r) => setTimeout(r, 1200));
    for (let k = 0; k < 14; k++) {
      await page.evaluate(() => document.querySelector("#lsnbody .lsnend")?.scrollIntoView({ block: "center" }));
      await new Promise((r) => setTimeout(r, 1000));
      if (await page.evaluate((id) => !!(window.FALLASKOLI.S.read || {})[id], link)) break;
    }
    await dismissModals();
    const seen = await page.evaluate(() => ({
      open: !document.getElementById("view-lessons").hidden,
      title: document.getElementById("lsn-title")?.innerText || "",
      tables: document.querySelectorAll("#lsnbody table.decl").length,
      blanks: [...document.querySelectorAll("#lsnbody table.decl td")].filter((td) => td.innerText.trim() === "—").length,
      index: document.querySelectorAll("#lsnindex .lsnitem").length,
      read: Object.keys(window.FALLASKOLI.S.read || {}),
      badge: !!window.FALLASKOLI.S.badges.read1,
    }));
    ok(seen.open, "the 📖 link did not open Lesefni");
    ok(seen.read.includes(link), "the page was not remembered as read");
    ok(seen.index >= 15, `the Lesefni index lists ${seen.index} pages`);
    ok(seen.badge, "Fyrsta blaðsíðan was not awarded");
    ok(seen.title.length > 3, "the page has no title");
  }
  await page.evaluate(() => window.FALLASKOLI.openView("lessons", "foll"));
  const foll = await page.evaluate(() => ({
    tables: document.querySelectorAll("#lsnbody table.decl").length,
    hestsins: /hestsins/.test(document.getElementById("lsnbody").innerText),
  }));
  ok(foll.tables >= 1 && foll.hestsins, "the page on föll does not show hestur's paradigm from BÍN");
  await tap('nav.tabs button[data-view="practice"]');
}

/* ---------- practice sessions (v6.10) ----------------------------------
 * The Æfa tab opens on the picker; a ten-question session on one category
 * asks only about that category, ends in a summary with its four parts, is
 * written down, and the error diagnosis has kept something. Real clicks. */
await page.setViewport({ width: 1100, height: 900 });
{
  await tap('nav.tabs button[data-view="practice"]');
  await page.evaluate(() => {
    const A = window.FALLASKOLI;
    A.run = null; A.runDone = null; A.drill = null; A.drillDone = null; A.next();
  });
  ok(await page.$("#task .runpick") !== null, "the Æfa tab does not open on the session picker");
  const topics = await page.$$eval(".topic", (els) => els.map((e) => e.dataset.topic));
  /* Whatever the checks above left switched on: Sagnorð if it is there. */
  const pickTopic = topics.includes("sagnord") ? "sagnord" : topics.find((x) => !["blandad", "villur", "ordaford"].includes(x));
  ok(!!pickTopic, "the picker lists no categories: " + topics.join(","));
  await tap(`.topic[data-topic="${pickTopic}"]`);
  await tap('.sizeb[data-size="10"]');
  await tap("#runstart");
  await finishCard();          // #15
  await page.waitForFunction("window.FALLASKOLI.cur", { timeout: 4000 });
  ok(await page.$("#runbar .runline") !== null, "no line above a session in progress");
  const skills = new Set();
  for (let i = 0; i < 10; i++) {
    skills.add(await page.evaluate(() => window.FALLASKOLI.cur && window.FALLASKOLI.cur.skill));
    await answerOne(i % 3 !== 0);
  }
  ok([...skills].every((x) => x === pickTopic), `a ${pickTopic} session asked about ` + [...skills].join(","));
  const sum = await page.evaluate(() => ({
    summary: !!document.querySelector("#task .summary"),
    sections: document.querySelectorAll("#task .sumsec").length,
    remember: !!document.querySelector("#task .sumsec.remember"),
    run: window.FALLASKOLI.run, last: (window.FALLASKOLI.S.runs || []).slice(-1)[0],
    diag: Object.keys(window.FALLASKOLI.S.diag || {}).length,
  }));
  ok(sum.summary && sum.sections === 4 && sum.remember, "ten questions did not end in a summary with its four parts");
  ok(sum.run === null && sum.last && sum.last.topic === pickTopic && sum.last.n === 10,
    "the session was not written down: " + JSON.stringify(sum.last));
  ok(sum.diag > 0, "the error diagnosis kept nothing");
  await dismissModals();      // item 61: the session's badges are celebrated over its summary
  await tap('#task [data-next="pick"]');
  ok(await page.$("#task .runpick") !== null, "„Velja annað efni“ does not go back to the picker");
  await startPractice(page, 5000);
}

/* ---------- v6.13: the question gets the screen (items 2, 47, 48, 53) ----
 * On a 390 × 844 phone the question used to start 590 px down, under the
 * title, four stat tiles, the level bar, the tabs, the date and the session
 * strip, and the á ð é í … pad was stuck to the bottom of the screen — on top
 * of the answer box and of a table's first row. Now, during a session:
 * nothing of the header shows, the question starts near the top, the pad is
 * in the flow below the input, and Hætta is a small × that still asks. Checked
 * on a phone and a laptop, for a typed question, a table and a choice. The
 * device keyboard is not there in headless Chrome; on a phone it takes about
 * the lower 40 % of the screen, so the answer box must end above that line. */
{
  const KEYBOARD = 0.4;
  const drawOf = async (types) => page.evaluate((types) => {
    const A = window.FALLASKOLI;
    for (let i = 0; i < 600; i++) { A.next(); if (types.includes(A.cur && A.cur.type)) return A.cur.type; }
    return null;
  }, types);
  for (const vp of [{ nm: "phone 390", w: 390, h: 844, touch: true }, { nm: "laptop 1280", w: 1280, h: 800, touch: false }]) {
    await page.setViewport({ width: vp.w, height: vp.h, isMobile: vp.touch, hasTouch: vp.touch,
                             deviceScaleFactor: 1 });
    await dismissModals();
    await page.evaluate(() => {
      const A = window.FALLASKOLI;
      A.run = null; A.runDone = null; A.drill = null; A.drillDone = null; A.drillOffer = null;
      A.S.enabled.toluord = true; A.S.enabled.greining = true;
      /* A settled pad setting from elsewhere would hide what is measured. */
      A.S.settings.keypad = true;
      A.reloadPolicy();
      A.openView("practice");
      A.startRun("blandad", 10);
    });
    await page.waitForFunction("window.FALLASKOLI.cur", { timeout: 4000 });
    const chrome = await page.evaluate(() => {
      const shown = (sel) => { const e = document.querySelector(sel); return !!e && e.getClientRects().length > 0; };
      const x = document.getElementById("runstop");
      const r = x ? x.getBoundingClientRect() : null;
      return {
        insession: document.body.classList.contains("insession"),
        visible: [".topbar", ".stats", ".levelbar", ".levelmeta", "nav.tabs", ".boardhead"].filter(shown),
        line: shown("#runbar .runline"), count: document.querySelector("#runbar .runcount")?.textContent || "",
        x: r && { w: Math.round(r.width), h: Math.round(r.height), text: x.textContent.trim(),
                  label: x.getAttribute("aria-label") || "" },
        lineH: Math.round(document.querySelector("#runbar .runline")?.getBoundingClientRect().height || 0),
      };
    });
    ok(chrome.insession, `${vp.nm}: the session layout is not on during a session`);
    ok(chrome.visible.length === 0, `${vp.nm}: still shown during a session: ${chrome.visible.join(", ")}`);
    ok(chrome.line && /^1\/10/.test(chrome.count), `${vp.nm}: the session line does not say 1/10: "${chrome.count}"`);
    ok(chrome.lineH > 0 && chrome.lineH <= 52, `${vp.nm}: the session line is ${chrome.lineH}px tall — it should be one slim line`);
    ok(chrome.x && chrome.x.text === "×" && chrome.x.w <= 48 && chrome.x.h <= 48 && /Hætta/.test(chrome.x.label),
      `${vp.nm}: Hætta is not a small × in the line: ${JSON.stringify(chrome.x)}`);

    for (const [kind, types] of [["typed", ["fill", "verb", "verbslot"]], ["table", ["table"]],
                                 ["choice", ["choice", "parse", "govern", "clause", "indecl"]]]) {
      const got = await drawOf(types);
      ok(!!got, `${vp.nm}: could not draw a ${kind} question in a mixed session`);
      if (!got) continue;
      await page.evaluate(() => window.scrollTo(0, 0));
      await new Promise((r) => setTimeout(r, 60));
      const m = await page.evaluate(() => {
        const box = (e) => { if (!e) return null; const r = e.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, h: r.height }; };
        const keys = document.getElementById("keys");
        const inp = document.querySelector("#ans, table.decl input:not([disabled]), #task textarea");
        const row = document.querySelector("table.decl tr");
        /* What is drawn on top of the middle of each cell of the first row:
           it must be the row itself, not the pad or anything else. */
        const cover = row ? [...row.cells].map((c) => {
          const r = c.getBoundingClientRect();
          const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return el && row.contains(el) ? null : (el ? el.tagName + "." + el.className : "nothing");
        }).filter(Boolean) : [];
        return {
          q: box(document.querySelector("#task .card")), input: box(inp),
          keys: keys && keys.getClientRects().length ? box(keys) : null,
          keysPos: keys ? getComputedStyle(keys).position : null,
          cover, vh: window.innerHeight,
        };
      });
      ok(m.q && m.q.top <= 120, `${vp.nm} / ${kind} (${got}): the question starts ${m.q && Math.round(m.q.top)}px down`);
      if (m.input) {
        ok(m.keys && m.keys.h > 0, `${vp.nm} / ${kind}: no letter pad under a typed answer with the pad switched on`);
        if (m.keys) {
          const meet = m.input.left < m.keys.right && m.keys.left < m.input.right &&
                       m.input.top < m.keys.bottom && m.keys.top < m.input.bottom;
          ok(!meet, `${vp.nm} / ${kind}: the answer box and the letter pad overlap`);
          ok(m.keys.top >= m.input.bottom, `${vp.nm} / ${kind}: the letter pad is not below the answer box`);
          ok(m.keysPos === "static", `${vp.nm} / ${kind}: the letter pad is ${m.keysPos}, not in the flow`);
        }
        if (vp.touch && kind === "typed")
          ok(m.input.bottom <= m.vh * (1 - KEYBOARD),
            `${vp.nm} / ${kind}: the answer box ends at ${Math.round(m.input.bottom)}px, under the device keyboard`);
      }
      if (kind === "table") ok(m.cover.length === 0, `${vp.nm}: the first table row is covered by ${m.cover.join(", ")}`);
      if (vp.touch) await page.screenshot({ path: `/tmp/fallaskoli-session-${vp.w}-${kind}.png` }).catch(() => {});
    }

    /* The × asks; "Halda áfram" keeps the session; "Já, hætta" ends it, and
       the summary shows the header again. */
    await tap("#runstop");
    ok(await page.$("#runquit-no") !== null, `${vp.nm}: the × did not ask before stopping the session`);
    if (await page.$("#runquit-no")) await tap("#runquit-no");
    ok(await page.evaluate(() => !!window.FALLASKOLI.run), `${vp.nm}: "Halda áfram" ended the session`);
    await answerOneNoNext(true);
    await tap("#runstop");
    if (await page.$("#runquit-yes")) await tap("#runquit-yes");
    await dismissModals();
    const after = await page.evaluate(() => ({
      run: !!window.FALLASKOLI.run, summary: !!document.querySelector("#task .summary"),
      insession: document.body.classList.contains("insession"),
      header: document.querySelector(".topbar").getClientRects().length > 0,
      tabs: document.querySelector("nav.tabs").getClientRects().length > 0,
    }));
    ok(!after.run && after.summary, `${vp.nm}: "Já, hætta" did not end in a summary`);
    ok(!after.insession && after.header && after.tabs, `${vp.nm}: the header and tabs did not come back for the summary`);
    /* The regression that server-test.mjs hit after item 47: no session runs
       now, so every tab must take a real mouse click (not just be "visible"),
       and the class must not linger on any other view. */
    for (const v of ["settings", "progress", "practice"]) {
      await tap(`nav.tabs button[data-view="${v}"]`);
      ok(await page.evaluate((v) => !document.body.classList.contains("insession") &&
        document.querySelector(`nav.tabs button[data-view="${v}"]`).getAttribute("aria-selected") === "true" &&
        !document.getElementById("view-" + v).hidden, v),
        `${vp.nm}: with no session running, a click on the ${v} tab did not open it`);
    }

    /* A 📖 link mid-session opens Lesefni with the tabs back (the way out);
       Æfa returns to the slim line. */
    await page.evaluate(() => { const A = window.FALLASKOLI; A.runDone = null; A.startRun("blandad", 10); });
    await page.waitForFunction("window.FALLASKOLI.cur", { timeout: 4000 });
    await page.evaluate(() => window.FALLASKOLI.openView("lessons", "foll"));
    ok(await page.evaluate(() => !document.body.classList.contains("insession") &&
      document.querySelector("nav.tabs").getClientRects().length > 0),
      `${vp.nm}: Lesefni opened mid-session has no tabs to come back by`);
    await page.evaluate(() => document.querySelector('nav.tabs button[data-view="practice"]').click());
    ok(await page.evaluate(() => document.body.classList.contains("insession")),
      `${vp.nm}: back on Æfa mid-session, the slim line did not return`);
    await page.evaluate(() => { const A = window.FALLASKOLI; A.run = null; A.runDone = null; A.next(); });
  }
  await page.setViewport({ width: 1100, height: 900 });
}

/* ---------- v6.13: Greindu orðið on a phone, in turns (items 1, 49) -------
 * The analysis question used to show every row at once — and only the rows
 * of the right class, so a verb arrived with Mynd, Háttur, Tíð and Persóna
 * above the class chips — and on a 390 × 844 phone the eleven class chips
 * and up to six rows took more than two screens, with Athuga at the bottom.
 * Now: before the class is answered, no feature row and no definition is in
 * the page; after it, one row is open at a time, and that row and the button
 * are on the screen at every step. Three questions: a right class, a wrong
 * class, and a verb with four rows or more. Screenshots in /tmp. */
{
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await dismissModals();
  await page.evaluate(() => {
    const A = window.FALLASKOLI;
    A.run = null; A.runDone = null; A.drill = null; A.drillDone = null; A.drillOffer = null;
    A.S.enabled.greining = true;
    A.reloadPolicy();
    A.openView("practice");
    A.startRun("blandad", 10);
  });
  await page.waitForFunction("window.FALLASKOLI.cur", { timeout: 4000 });
  const where = () => page.evaluate(() => {
    const box = (e) => { if (!e || !e.getClientRects().length) return null;
      const r = e.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom) }; };
    const row = document.querySelector("#parserows .qopen");
    return {
      vh: window.innerHeight, row: box(row), key: row ? row.dataset.row : null,
      go: box(document.getElementById("check")),
      opts: [...document.querySelectorAll("#task .opts")].map((b) => b.dataset.q),
      def: !!document.querySelector("#task .defline, #task #defbox"),
    };
  });
  const seen = (b, vh) => !!b && b.top >= 0 && b.bottom <= vh;
  for (const kind of ["right", "wrong", "verb"]) {
    const got = await page.evaluate((kind) => {
      const A = window.FALLASKOLI;
      for (let i = 0; i < 3000; i++) {
        A.next();
        const c = A.cur;
        if (!c || c.type !== "parse") continue;
        if (kind === "verb" ? c.t.c === "sagnorð" && c.rows.length >= 4 : c.rows.length >= 3)
          return { cls: c.rows[0].answer, rows: c.rows.map((r) => ({ key: r.key, answer: r.answer })) };
      }
      return null;
    }, kind);
    ok(!!got, `phone / Greining (${kind}): no such question could be drawn`);
    if (!got) continue;
    await page.evaluate(() => window.scrollTo(0, 0));
    await new Promise((r) => setTimeout(r, 60));
    let m = await where();
    ok(!m.def, `phone / Greining (${kind}): a definition is on the page before the class`);
    ok(m.opts.length === 1 && m.opts[0] === "fl",
      `phone / Greining (${kind}): rows on the page before the class: ${m.opts.join(", ")}`);
    ok(seen(m.row, m.vh) && seen(m.go, m.vh),
      `phone / Greining (${kind}): the class row or its button is off the screen: ${JSON.stringify(m)}`);
    await page.screenshot({ path: `/tmp/fallaskoli-parse-390-${kind}-0.png` }).catch(() => {});
    const said = kind === "wrong"
      ? await page.evaluate((cls) => [...document.querySelectorAll('.opts[data-q="fl"] button')]
          .map((b) => b.dataset.v).find((v) => v !== cls), got.cls)
      : got.cls;
    await tap(`.opts[data-q="fl"] button[data-v="${said}"]`);
    m = await where();
    ok(m.opts.length === 1, `phone / Greining (${kind}): a tap on a class chip opened rows without the button`);
    await tap("#check");
    for (let k = 1; k < got.rows.length; k++) {
      m = await where();
      const r = got.rows[k];
      ok(m.key === r.key, `phone / Greining (${kind}): row ${k} should be ${r.key}, is ${m.key}`);
      ok(m.opts.length === 1, `phone / Greining (${kind}): ${m.opts.length} rows open at once: ${m.opts.join(", ")}`);
      ok(seen(m.row, m.vh), `phone / Greining (${kind}): the open row ${r.key} is off the screen: ${JSON.stringify(m.row)}`);
      ok(seen(m.go, m.vh), `phone / Greining (${kind}): the button is off the screen at row ${r.key}: ${JSON.stringify(m.go)}`);
      if (k === 1) {
        const mark = await page.evaluate(() => ({
          wrong: !!document.querySelector("#parserows .qcls .qpick.wrongpick"),
          right: document.querySelector("#parserows .qcls .qpick.right")?.textContent.trim() || null,
        }));
        ok(mark.right === got.cls, `phone / Greining (${kind}): the right class is not shown after the class step`);
        ok(mark.wrong === (kind === "wrong"), `phone / Greining (${kind}): the class mark is wrong: ${JSON.stringify(mark)}`);
        await page.screenshot({ path: `/tmp/fallaskoli-parse-390-${kind}-1.png` }).catch(() => {});
      }
      if (k === got.rows.length - 1)
        await page.screenshot({ path: `/tmp/fallaskoli-parse-390-${kind}-last.png` }).catch(() => {});
      await tap(`.opts[data-q="${r.key}"] button[data-v="${r.answer}"]`);
    }
    m = await where();
    ok(m.opts.length === 0 && seen(m.go, m.vh),
      `phone / Greining (${kind}): after the last row the button is not on the screen: ${JSON.stringify(m)}`);
    await tap("#check");
    const v = await page.evaluate(() => ({
      verdict: !!document.querySelector("#verdict .verdict.ok, #verdict .verdict.no"),
      ok: !!document.querySelector("#verdict .verdict.ok"),
    }));
    ok(v.verdict, `phone / Greining (${kind}): no verdict after the last button`);
    ok(v.ok === (kind !== "wrong"), `phone / Greining (${kind}): the verdict is ${v.ok ? "right" : "wrong"}`);
    await page.screenshot({ path: `/tmp/fallaskoli-parse-390-${kind}-verdict.png`, fullPage: true }).catch(() => {});
    await dismissModals();
  }
  await page.evaluate(() => { const A = window.FALLASKOLI; A.run = null; A.runDone = null; A.next(); });
  await page.setViewport({ width: 1100, height: 900 });
}

/* Item 53: on a touch device set to Icelandic the pad is off until the child
   switches it on; the switch in Stillingar shows what is in force and brings
   the pad back at once. A page of its own, so the language stays there. */
{
  const p2 = await browser.newPage();
  await p2.evaluateOnNewDocument(() => {
    Object.defineProperty(Navigator.prototype, "language", { get: () => "is-IS" });
  });
  await p2.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await p2.goto(FILE, { waitUntil: "domcontentloaded" });
  await p2.waitForFunction("window.FALLASKOLI && window.FALLASKOLI.sess && document.querySelector('#task .card')", { timeout: 20000 });
  const pad = await p2.evaluate(() => {
    const A = window.FALLASKOLI;
    document.querySelectorAll(".scrim").forEach((s) => s.remove());
    delete A.S.settings.keypad;
    A.startRun("blandad", 10);
    for (let i = 0; i < 600 && !(A.cur && ["fill", "verb", "verbslot"].includes(A.cur.type)); i++) A.next();
    const k = () => { const e = document.getElementById("keys"); return !!e && e.getClientRects().length > 0; };
    const before = { lang: navigator.language, coarse: matchMedia("(pointer: coarse)").matches, shown: k() };
    A.openView("settings");
    const box = document.getElementById("set-keys").checked;
    document.getElementById("set-keys").click();
    A.openView("practice");
    return { ...before, box, saved: A.S.settings.keypad, after: k() };
  });
  ok(pad.lang === "is-IS" && pad.coarse, "could not pose as a touch device set to Icelandic: " + JSON.stringify(pad));
  ok(!pad.shown, "the letter pad shows on a touch device set to Icelandic, where the keyboard has the letters");
  ok(pad.box === false, "the pad setting does not show that the pad is off");
  ok(pad.saved === true && pad.after, "switching the pad on in Stillingar did not bring it back: " + JSON.stringify(pad));
  await p2.close();
}

/* ---------- v6.13 (item 29): the new kinds of Umritun ------------------
 * A Málbeiting session with only Umritun on, at þyngd 4. A join shows its
 * two sentences on two lines, indirect speech its quotation, and a right
 * answer that could be better — a question without its question mark,
 * indirect speech without *að* — gets its note under the verdict. The
 * types switched off are switched on again at the end. */
{
  await page.evaluate(() => {
    const A = window.FALLASKOLI;
    A.S.enabled.malbeiting = true;
    A.S.policy = A.S.policy || {};
    A.S.policy.types = { ...(A.S.policy.types || {}), smidja: false, villur: false };
    A.reloadPolicy(); A.save();
    A.run = null; A.runDone = null; A.drill = null; A.drillDone = null; A.drillOffer = null;
    Object.keys(A.sess.diff).forEach((k) => { A.sess.diff[k] = 4; });
    /* Pinning the level must also drop the warm-up the visit owes: the
       first right answer would give it back (core/difficulty.js nextLevel)
       and the case's second question come from a higher þyngd. */
    A.sess.warm = {};
    /* 80 questions, not 40 (#28). About one question in eleven is a join and
       one in twelve a question (tests/pools.js at þyngd 4: 202 and 181 of
       1,500 Umritun, which is two questions in three here), so one run of 40
       in twenty lacked one of them — and the seed's run did, once the
       connectives' words had changed the order of the lexicon. The loop
       stops as soon as all three have come. */
    A.startRun("malbeiting", 80, null, { review: false });
  });
  await page.waitForFunction("window.FALLASKOLI.cur", { timeout: 4000 });
  const seenKinds = new Set();
  for (let i = 0; i < 80; i++) {
    const t = await page.evaluate(() => {
      const c = window.FALLASKOLI.cur;
      return c && { type: c.type, kind: c.kind, lines: c.lines || null, from: c.from || null,
        answers: c.answers || null, model: c.model || null };
    });
    if (!t) break;
    if (t.type === "umritun" && ["question", "join", "indirect"].includes(t.kind)) {
      seenKinds.add(t.kind);
      const shown = await page.$eval("#task .sentence", (el) => ({ html: el.innerHTML, text: el.textContent }));
      let typed = t.answers[0], note = null;
      if (t.kind === "join") {
        ok(/<br>/.test(shown.html) && t.lines.every((l) => shown.text.includes(l)),
          `a join does not show its two sentences on two lines: ${shown.html}`);
      } else if (t.kind === "indirect") {
        ok(shown.text === t.from && /„.+“/.test(shown.text), `indirect speech does not show its quotation: ${shown.text}`);
        typed = t.model.replace(/ að /, " ");
        note = /má sleppa/;
      } else {
        typed = t.answers[0].replace(/\?$/, "");
        note = /spurningarmerki/;
      }
      await page.type("#ans", typed);
      await tap("#check");
      await page.waitForSelector("#verdict .verdict", { timeout: 4000 });
      const v = await page.$eval("#verdict .verdict", (el) => ({ cls: el.className, text: el.textContent }));
      ok(/\bok\b/.test(v.cls), `umritun/${t.kind}: "${typed}" was not taken as right: ${v.text.slice(0, 160)}`);
      if (note) ok(note.test(v.text), `umritun/${t.kind}: no note under the verdict: ${v.text.slice(0, 200)}`);
      await dismissModals();
    } else {
      await answerOneNoNext(true);
    }
    await page.evaluate(() => window.FALLASKOLI.next());
    await page.waitForFunction("document.querySelector('#task .card')", { timeout: 4000 });
    if (seenKinds.size === 3) break;
  }
  ok(seenKinds.size === 3, `the new kinds of Umritun did not all come up in 80 questions: ${[...seenKinds]}`);
  await page.evaluate(() => {
    const A = window.FALLASKOLI;
    delete A.S.policy.types.smidja; delete A.S.policy.types.villur;
    A.run = null; A.runDone = null;
    A.reloadPolicy(); A.save();
  });
}

/* ---------- v6.11: every category mixes its questions ------------------
 * A ten-question session on each category the request was about: at least
 * three kinds of question, none over its share, every question drawn and
 * answered by real clicks, a summary at the end. Orðaforði: the free-text
 * sentence is an optional bonus under a graded question, never a question
 * of its own, and the summary has no "Rétt:" line with nothing after it. */
{
  await page.evaluate(() => {
    const A = window.FALLASKOLI;
    ["fornofn", "toluord", "obeygjanleg", "fallstjorn", "ordaford", "lysingarord", "greining"]
      .forEach((id) => { A.S.enabled[id] = true; });
    A.reloadPolicy(); A.save();
  });
  for (const topic of ["fornofn", "toluord", "obeygjanleg", "fallstjorn", "ordaford", "lysingarord", "greining"]) {
    await page.evaluate((topic) => {
      const A = window.FALLASKOLI;
      A.run = null; A.runDone = null; A.drill = null; A.drillDone = null; A.drillOffer = null;
      A.startRun(topic, 10);
    }, topic);
    await page.waitForFunction("window.FALLASKOLI.cur", { timeout: 4000 });
    const types = [];
    let bonus = false;
    for (let i = 0; i < 10; i++) {
      const cur = await page.evaluate(() => ({ id: window.FALLASKOLI.cur.typeId, skill: window.FALLASKOLI.cur.skill }));
      types.push(cur.id);
      ok(cur.skill === topic, `${topic}: a question about ${cur.skill}`);
      ok(cur.id !== "meaning", `${topic}: the free-text question came as a question of its own`);
      await answerOneNoNext(i % 3 !== 2);
      if (topic === "ordaford") bonus = bonus || (await page.$("#bonus")) !== null;
      await page.evaluate(() => window.FALLASKOLI.next());
      await page.waitForFunction("document.querySelector('#task .card')", { timeout: 4000 });
    }
    const counts = {};
    types.forEach((x) => { counts[x] = (counts[x] || 0) + 1; });
    const kinds = Object.keys(counts).length;
    ok(kinds >= 3, `${topic}: only ${kinds} kinds in ten questions: ${JSON.stringify(counts)}`);
    for (const [id, c] of Object.entries(counts)) {
      const cap = id.startsWith("tbl_") ? 3 : ["parse", "revform"].includes(id) ? 3 : 4;
      ok(c <= cap, `${topic}: ${id} ${c} times in ten (cap ${cap})`);
    }
    const sum = await page.evaluate(() => ({
      summary: !!document.querySelector("#task .summary"),
      bare: [...document.querySelectorAll("#task .exlist li")].some((li) => /^\s*Rétt:\s*$/.test(li.textContent)),
      text: (document.querySelector("#task .sumsec.remember") || {}).textContent || "",
    }));
    ok(sum.summary, `${topic}: no summary after ten questions`);
    ok(!sum.bare, `${topic}: an empty "Rétt:" line in the summary`);
    if (topic === "ordaford") {
      ok(bonus, "Orðaforði: no bonus sentence offered under a graded question");
      /* The word-formation rule (Orðmyndun, core/diagnosis.js) is Orðaforði's
         own and says "-ing/-un gera nafnorð úr sögn"; that phrase is not a
         verb tip. Nor is "sögn" inside a word (*frásögn* in a sentence the
         pupil was shown, #17). */
      ok(!/(?<![a-záðéíóúýþæö])sögn|Sögnin|þátíð|nútíð/i.test(sum.text.replace(/nafnorð úr sögn/g, "")),
        "Orðaforði: a verb tip in the summary: " + sum.text.slice(0, 120));
    }
  }
  /* The bonus pays only when the word is in the sentence. */
  await page.evaluate(() => {
    const A = window.FALLASKOLI;
    A.run = null; A.runDone = null;
    A.startRun("ordaford", 10);
  });
  await page.waitForFunction("window.FALLASKOLI.cur", { timeout: 4000 });
  await answerOneNoNext(true);
  /* A question whose word the lexicon lacks (*skæri* in "Orð í samhengi")
     has no word to write a sentence with and offers no bonus; which comes
     first depends on the seed, so the next ones are tried (#10 moved it). */
  for (let k = 0; k < 5 && !(await page.$("#bonus")) && !(await page.evaluate(() => !!window.FALLASKOLI.cur.bonus)); k++) {
    await page.evaluate(() => window.FALLASKOLI.next());
    await page.waitForFunction("document.querySelector('#task .card')", { timeout: 4000 });
    await answerOneNoNext(true);
  }
  if (await page.$("#bonus")) {
    const xp0 = await page.evaluate(() => window.FALLASKOLI.S.xp);
    await page.type("#bonustext", "Þetta er ágætis setning um daginn");
    await tap("#bonusgo");
    const xp1 = await page.evaluate(() => window.FALLASKOLI.S.xp);
    ok(xp1 === xp0, "the bonus paid for a sentence without the word");
    const w = await page.evaluate(() => window.FALLASKOLI.cur.bonus.o);
    await page.$eval("#bonustext", (el) => { el.value = ""; });
    await page.type("#bonustext", `Mér finnst orðið ${w} skemmtilegt`);
    await tap("#bonusgo");
    const xp2 = await page.evaluate(() => window.FALLASKOLI.S.xp);
    ok(xp2 > xp1, "the bonus did not pay for a sentence with the word");
  } else problems.push("no bonus box under an Orðaforði question");
  await page.evaluate(() => { const A = window.FALLASKOLI; A.run = null; A.runDone = null; A.next(); });
}

/* v6.13 — the review queue, on the screen (core/review.js, critique items 18
   and 19). The unit tests (tests/review.test.js) prove the schedule; these
   prove that a pupil SEES it: a session opens with what is due and says so, a
   passed review says when it comes next, and a missed cloze noun is not the
   next question but comes back a few questions on. */
{
  await dismissModals();
  const first = await page.evaluate((lemma) => {
    const A = window.FALLASKOLI;
    const key = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    const today = key(new Date());
    const y = new Date(); y.setDate(y.getDate() - 1);
    A.run = null; A.runDone = null;
    /* yesterday's miss: the dative plural of the test noun, in a cloze */
    A.S.review = { items: [{ k: `f:mynd|ÞGFFT|${lemma}|kk`, t: "fill", sk: "nafnord", p: null,
      c: "ÞGFFT", w: `${lemma}|kk`, i: null, s: 0, due: today, add: key(y), last: key(y), l: 1, ok: 0 }], stats: {} };
    A.startRun("blandad", 20);
    const c = A.cur;
    return { review: c.review || null, type: c.type, word: c.word, cell: c.cell, extra: !!c.extra,
      tag: (document.querySelector("#task .eyebrow .reviewtag") || {}).textContent || "" };
  }, TEST_NOUN);
  ok(first.review === `f:mynd|ÞGFFT|${TEST_NOUN}|kk` && first.type === "fill" && first.word === `${TEST_NOUN}|kk`
    && first.cell === "ÞGFFT" && !first.extra,
    "the session did not open with the due review: " + JSON.stringify(first));
  ok(first.tag === "upprifjun", `a review question is not marked as one ("${first.tag}")`);
  await answerOneNoNext(true);
  const passed = await page.evaluate(() => ({
    line: (document.querySelector("#verdict .reviewline") || {}).textContent || "",
    e: window.FALLASKOLI.S.review.items[0] || null,
  }));
  ok(/Upprifjun tókst\. Þetta kemur aftur eftir 3 daga\./.test(passed.line), `no line under a passed review: "${passed.line}"`);
  ok(passed.e && passed.e.s === 1, "a passed review did not move out: " + JSON.stringify(passed.e));
  await page.evaluate(() => window.FALLASKOLI.next());
  const second = await page.evaluate(() => ({ review: window.FALLASKOLI.cur.review || null,
    tag: !!document.querySelector("#task .eyebrow .reviewtag") }));
  ok(!second.review && !second.tag, "a question that is not a review is marked as one");

  /* item 19: miss a cloze — the noun is not the next question, and it is back
     three to five questions on, in the cell that was missed */
  if (!(await forceNounCloze())) problems.push(`could not draw a noun cloze on ${TEST_NOUN} — cannot test the repeat`);
  else {
    const missed = await page.evaluate(() => { const A = window.FALLASKOLI; return { i: A.run.i, cell: A.cur.cell, s: A.cur.s.t }; });
    await answerOneNoNext(false);
    const said = await page.evaluate(() => ({
      text: document.querySelector("#verdict .verdict").textContent,
      reask: window.FALLASKOLI.run.reask.map((x) => ({ at: x.at, w: x.w })),
      forced: !!window.FALLASKOLI.forcedNoun,
      queued: window.FALLASKOLI.S.review.items.some((e) => e.w === "bíll|kk" && e.s === 0),
    }));
    ok(!/Næst kemur sama orð/.test(said.text), "the verdict still promises the same word next");
    ok(/Orðið kemur aftur seinna í lotunni\./.test(said.text), "the verdict does not say the word comes back later");
    ok(!said.forced, "the missed noun is still set to be the very next question");
    ok(said.reask.length === 1 && said.reask[0].at - missed.i >= 3 && said.reask[0].at - missed.i <= 5,
      "the missed noun is not planned 3–5 questions on: " + JSON.stringify(said.reask) + " after " + missed.i);
    ok(said.queued, "the missed cloze is not in the review queue");
    await page.evaluate(() => window.FALLASKOLI.next());
    let back = null;
    for (let k = 1; k <= 5 && !back; k++) {
      const c = await page.evaluate(() => { const A = window.FALLASKOLI; const c = A.cur;
        return { i: A.run.i, reask: !!c.reask, word: c.word, type: c.type, cell: c.cell, s: c.s ? c.s.t : null }; });
      if (k === 1) ok(!(c.type === "fill" && c.word === `${TEST_NOUN}|kk`), "the missed noun was the very next question");
      if (c.reask) back = c;
      else await answerOne(true);
    }
    ok(back && back.word === `${TEST_NOUN}|kk` && back.i - missed.i >= 3 && back.i - missed.i <= 5,
      "the missed noun did not come back 3–5 questions on: " + JSON.stringify(back));
    ok(back && back.cell === missed.cell && back.s !== missed.s,
      "it did not come back in the missed cell and another sentence: " + JSON.stringify([missed, back]));
  }
  await page.evaluate(() => { const A = window.FALLASKOLI; A.run = null; A.runDone = null; A.S.review = { items: [], stats: {} }; A.next(); });
}

/* v6.13 — "Lota dagsins" (critique item 21, core/today.js). The picker has
   one primary button above the categories; it starts a session of ten that
   opens with the due reviews, goes on to the pupil's active error pattern and
   ends with new material, and is written down as today's session. */
{
  await dismissModals();
  const setup = await page.evaluate((lemma) => {
    const A = window.FALLASKOLI;
    const key = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    const today = key(new Date());
    const y = new Date(); y.setDate(y.getDate() - 1);
    A.run = null; A.runDone = null; A.drill = null; A.drillDone = null; A.drillOffer = null;
    /* three of yesterday's misses on the test noun, and one active pattern */
    A.S.review = { items: ["ÞGFFT", "EFET", "ÞGFETgr"].map((c) => ({ k: `f:mynd|${c}|${lemma}|kk`, t: "fill",
      sk: "nafnord", p: "thf_thgf", c, w: `${lemma}|kk`, i: null, s: 0, due: today, add: key(y), last: key(y), l: 1, ok: 0 })),
      stats: {} };
    A.S.diag = { ...(A.S.diag || {}), thf_thgf: { n: 12, w: 6, h: "010101010101", last: today, ex: [] } };
    A.S.enabled.nafnord = true;
    A.reloadPolicy();
    A.next();
    const go = document.getElementById("todaystart");
    const own = document.getElementById("runstart");
    const topics = document.querySelector("#task .topics");
    return {
      go: !!go, goCls: go ? go.className : "", goText: go ? go.textContent : "",
      ownCls: own ? own.className : "",
      above: !!(go && topics && (go.compareDocumentPosition(topics) & Node.DOCUMENT_POSITION_FOLLOWING)),
      focused: document.activeElement === go,
      line: (document.querySelector("#task .todayline") || {}).textContent || "",
    };
  }, TEST_NOUN);
  ok(setup.go && /\bgo\b/.test(setup.goCls) && /Lota dagsins/.test(setup.goText),
    "no primary „Lota dagsins“ button on the picker: " + JSON.stringify(setup));
  ok(setup.above && /\bghost\b/.test(setup.ownCls), "the categories are not below it, or their button is not the secondary one");
  ok(setup.focused, "„Lota dagsins“ does not have the focus");
  ok(/^3 upprifjanir, \d spurningar um villurnar þínar og \d nýjar spurningar\.$/.test(setup.line),
    `the line under the button does not say what the session holds: "${setup.line}"`);
  const graded0 = await page.evaluate(() => Object.values(window.FALLASKOLI.S.byType || {}).reduce((a, x) => a + x.n, 0));
  await tap("#todaystart");
  await finishCard();          // #15
  await page.waitForFunction("window.FALLASKOLI.cur", { timeout: 4000 });
  const kinds = [];
  for (let i = 0; i < 10; i++) {
    const c = await page.evaluate(() => { const A = window.FALLASKOLI;
      return { topic: A.run && A.run.topic, n: A.run && A.run.n, review: A.cur.review || null, today: A.cur.today || null,
        tag: !!document.querySelector("#task .eyebrow .reviewtag"), bar: (document.querySelector("#runbar .runtopic") || {}).textContent || "" }; });
    if (i === 0) {
      ok(c.topic === "dagsins" && c.n === 10, "the button did not start a session of ten: " + JSON.stringify(c));
      ok(/Lota dagsins/.test(c.bar), `the line above the session does not name it: "${c.bar}"`);
    }
    if (i < 3) ok(c.review && c.tag, `question ${i + 1} of today's session is not a due review: ` + JSON.stringify(c));
    kinds.push(c.today);
    await answerOne(true);
  }
  ok(kinds.slice(0, 3).every((k) => k === "review") && kinds.slice(3).filter((k) => k === "pattern").length >= 3
    && kinds.slice(-2).every((k) => k === "new"),
    "today's session is not reviews, then the pattern, then new material: " + kinds.join(","));
  const end = await page.evaluate(() => ({ summary: !!document.querySelector("#task .summary"),
    last: (window.FALLASKOLI.S.runs || []).slice(-1)[0], runTopic: window.FALLASKOLI.S.settings.runTopic,
    due: window.FALLASKOLI.S.review.items.filter((e) => e.s === 0).length }));
  ok(end.summary && end.last && end.last.topic === "dagsins" && end.last.n === 10,
    "today's session did not end in its summary: " + JSON.stringify(end.last));
  ok(end.runTopic !== "dagsins", "today's session took the place of the category the picker remembers");
  /* Item 44: today's answers count toward the mastery mark like any others. */
  const graded1 = await page.evaluate(() => Object.values(window.FALLASKOLI.S.byType || {}).reduce((a, x) => a + x.n, 0));
  ok(end.last.j > 0 && graded1 - graded0 === end.last.j,
    `the mastery record counted ${graded1 - graded0} of today's ${end.last.j} graded answers`);
  ok(end.due === 0, `${end.due} of the reviews it opened with are still at the first step`);
  await page.evaluate(() => { const A = window.FALLASKOLI; A.run = null; A.runDone = null;
    A.S.review = { items: [], stats: {} }; delete A.S.diag.thf_thgf; A.next(); });
}

/* v6.13 — "Þrjár í röð" (critique item 36, core/streak.js). A diagnosed wrong
   answer offers three questions on its pattern; the rule comes first, with
   its Lesefni page; the three are each on the pattern, the session's count
   does not move, and the pattern is in the review queue afterwards. */
{
  await dismissModals();
  await page.evaluate(() => { const A = window.FALLASKOLI; A.run = null; A.runDone = null;
    A.startRun("nafnord", 10, null, { review: false }); });
  if (!(await forceNounCloze())) problems.push(`could not draw a noun cloze on ${TEST_NOUN} — cannot test "Þrjár í röð"`);
  else {
    /* the wrong case: a form of the same noun in another case, same number and article */
    const miss = await page.evaluate(() => {
      const A = window.FALLASKOLI, c = A.cur;
      const m = /^(NF|ÞF|ÞGF|EF)(.*)$/.exec(c.cell);
      const right = new Set(c.answers.map((x) => x.toLowerCase()));
      const other = ["ÞF", "ÞGF", "EF", "NF"].filter((f) => f !== m[1])
        .map((f) => (c.n.forms[f + m[2]] || [])[0]).find((w) => w && !right.has(w.toLowerCase()));
      return { other, i: A.run.i, cell: c.cell };
    });
    await page.type("#ans", miss.other);
    await tap("#check");
    await page.waitForSelector("#verdict .verdict", { timeout: 4000 });
    await dismissModals();
    const offer = await page.evaluate(() => ({
      diag: (document.querySelector("#verdict .diagline") || {}).textContent || "",
      go: !!document.getElementById("streakgo"),
      text: (document.querySelector("#verdict .streakoffer") || {}).textContent || "",
      focus: document.activeElement && document.activeElement.id,
      retrying: !!(window.FALLASKOLI.cur && window.FALLASKOLI.cur.retrying),
      p: window.FALLASKOLI.streakOffer && window.FALLASKOLI.streakOffer.p,
    }));
    ok(/Villugreining/.test(offer.diag) && offer.go && offer.p,
      `no „Þrjár í röð“ under a diagnosed miss (${miss.other} for ${miss.cell}): ` + JSON.stringify(offer));
    ok(/teljast ekki með í lotunni/.test(offer.text), "the offer does not say the three are outside the session's count");
    /* The offer never takes the focus. Where it goes is the verdict's own
       business: Áfram, or — on a first miss that item 42 lets the pupil try
       again — the answer box, where Enter sends the second try. */
    const wantFocus = offer.retrying ? "ans" : "check";
    ok(offer.focus === wantFocus,
      `the offer took the focus (on #${offer.focus}, wanted #${wantFocus}) — Enter must still do what the verdict says`);
    if (offer.go) {
      await tap("#streakgo");
      const intro = await page.evaluate(() => ({
        card: !!document.querySelector("#task .streakintro"),
        rule: (document.querySelector("#task .streakintro .rule") || {}).textContent || "",
        lesson: !!document.querySelector("#task .streakintro .lessonlink[data-lesson]"),
        bar: (document.querySelector("#runbar .streakrun .runtopic") || {}).textContent || "",
        i: window.FALLASKOLI.run.i,
      }));
      ok(intro.card && intro.rule.length > 20, "the rule is not shown before the first of the three");
      ok(intro.lesson, "the rule has no link to its Lesefni page");
      ok(/^Þrjár í röð: /.test(intro.bar), `the session's line did not give way to the three's own: "${intro.bar}"`);
      /* Items 36 + 41: the first of the three may be the first question of
         its type the pupil meets (the three are drawn from all the
         pattern's types). It then opens with its worked example, like any
         first meeting: once, on the streak's own card, and the type is met
         afterwards. The rule card before it does not count as a meeting. */
      const exType = await page.evaluate(() => { const A = window.FALLASKOLI;
        const id = A.streak.queue[0].task.typeId; if (A.S.seenTypes) delete A.S.seenTypes[id]; return id; });
      await tap("#streakbegin");
      const ex = await page.evaluate(() => { const A = window.FALLASKOLI;
        return { n: document.querySelectorAll("#task .workedex").length, streak: !!A.cur.streak,
          typeId: A.cur.typeId, met: !!(A.S.seenTypes && A.S.seenTypes[A.cur.typeId]),
          bar: (document.querySelector("#runbar .streakrun .runcount") || {}).textContent || "" }; });
      ok(ex.typeId === exType && ex.streak && ex.n === (EXAMPLE_TYPES.has(exType) ? 1 : 0) && ex.met === EXAMPLE_TYPES.has(exType)
        && ex.bar.trim() === "1/3",
        "the first of the three, of a type not met before, did not open with its one worked example: " + JSON.stringify({ exType, ...ex }));
      const answered = () => page.evaluate(() => Object.values(window.FALLASKOLI.S.byType || {})
        .reduce((a, x) => a + x.n, 0));
      const byType0 = await answered();
      const seen = [];
      for (let k = 0; k < 3; k++) {
        const q = await page.evaluate(() => { const A = window.FALLASKOLI;
          return { streak: A.cur.streak || null, targeted: !!A.cur.targeted, inRun: !!A.cur.inRun, i: A.run.i,
            count: (document.querySelector("#runbar .runcount") || {}).textContent || "" }; });
        seen.push(q);
        await answerOneNoNext(k !== 1);
        if (k < 2) await page.evaluate(() => window.FALLASKOLI.next());
      }
      ok(seen.every((q) => q.streak === offer.p && q.targeted && !q.inRun),
        "the three are not all questions on the pattern: " + JSON.stringify(seen));
      ok(seen.map((q) => q.count.trim()).join(",") === "1/3,2/3,3/3", "the three do not count 1/3, 2/3, 3/3: " + seen.map((q) => q.count).join(","));
      ok(seen.every((q) => q.i === miss.i + 1), "the session's count moved during the three: " + JSON.stringify(seen.map((q) => q.i)));
      /* Item 44: the three are answers like any other for the mastery mark. */
      const byType1 = await answered();
      ok(byType1 - byType0 === 3, `the mastery record counted ${byType1 - byType0} of the three answers`);
      const done = await page.evaluate((p) => ({
        line: (document.querySelector("#verdict .streakend") || {}).textContent || "",
        button: document.getElementById("check").textContent,
        queued: window.FALLASKOLI.S.review.items.some((e) => e.p === p && e.k.startsWith("p:")),
      }), offer.p);
      ok(/2 af 3 rétt\. Þetta kemur aftur í upprifjun á morgun\./.test(done.line), `no line under the last of the three: "${done.line}"`);
      ok(/Aftur í lotuna/.test(done.button), `the button after the three does not go back to the session: "${done.button}"`);
      ok(done.queued, "the pattern is not in the review queue after the three");
      await page.evaluate(() => window.FALLASKOLI.next());
      const back = await page.evaluate(() => ({ streak: window.FALLASKOLI.streak, i: window.FALLASKOLI.run.i,
        line: !!document.querySelector("#runbar .runline:not(.streakrun)"), inRun: !!window.FALLASKOLI.cur.inRun }));
      ok(!back.streak && back.line && back.inRun && back.i === miss.i + 1,
        "the session did not pick up where it was after the three: " + JSON.stringify(back));
    }
  }
  await page.evaluate(() => { const A = window.FALLASKOLI; A.run = null; A.runDone = null; A.streak = null;
    A.S.review = { items: [], stats: {} }; A.next(); });
}

/* ---------- item 27: the two new types, drawn, shown and answered ---------
 * A short session aimed at each new type's error pattern (which narrows the
 * session to that type), at a low and a high þyngd: the question must come,
 * look like what it is, take a right answer and a wrong one through real
 * clicks and typing, and explain itself under both. */
{
  const CASES = [
    { focus: "fn_flokkar", topic: "fornofn", band: 1, type: "choice", options: 3 },
    { focus: "fn_flokkar", topic: "fornofn", band: 5, type: "choice", options: 6 },
    { focus: "beyging_no", topic: "nafnord", band: 1, type: "kenni", gen: false },
    { focus: "beyging_no", topic: "nafnord", band: 5, type: "kenni", gen: true },
  ];
  for (const c of CASES) {
    await dismissModals();
    await page.evaluate((c) => {
      const A = window.FALLASKOLI;
      A.S.enabled[c.topic] = true;
      A.reloadPolicy();
      A.run = null; A.runDone = null; A.drill = null; A.drillDone = null; A.drillOffer = null;
      Object.keys(A.sess.diff).forEach((k) => { A.sess.diff[k] = c.band; });
      /* Pinning the level must also drop the warm-up the visit owes: the
         first right answer would give it back (core/difficulty.js nextLevel)
         and the case's second question come from a higher þyngd. */
      A.sess.warm = {};
      A.startRun(c.topic, 10, [c.focus], { review: false });
    }, c);
    await page.waitForFunction("window.FALLASKOLI.cur", { timeout: 4000 });
    const at = `${c.focus} at þyngd ${c.band}`;
    for (const correct of [true, false]) {
      const q = await page.evaluate(() => {
        const t = window.FALLASKOLI.cur;
        return { type: t.type, typeId: t.typeId, title: t.title, n: (t.options || []).length,
          buttons: document.querySelectorAll("#task .opts button").length,
          target: document.querySelector("#task .sentence .target")?.textContent || null,
          word: t.s && t.i >= 0 ? t.s.tok[t.i].w : null,
          input: !!document.querySelector("#task #ans"), askGen: !!t.askGen,
          gloss: document.querySelector("#task .gloss")?.textContent || "" };
      });
      ok(q.type === c.type && q.typeId === (c.focus === "beyging_no" ? "no_beyging" : "fn_flokkar"),
        `${at}: drew ${q.typeId} (${q.type})`);
      ok(q.buttons === (c.options || 2) && q.n === q.buttons, `${at}: ${q.buttons} option buttons`);
      if (c.type === "choice") {
        ok(q.target && q.target === q.word, `${at}: the pronoun is not marked in the sentence (${q.target})`);
        ok(/Hvers konar fornafn er/.test(q.gloss), `${at}: no instruction line: ${q.gloss}`);
      } else {
        ok(q.input === c.gen && q.askGen === c.gen, `${at}: the genitive box is ${q.input ? "there" : "missing"}`);
        ok(/sterk eða veik/.test(q.gloss), `${at}: no instruction line: ${q.gloss}`);
      }
      await answerOneNoNext(correct);
      await page.waitForSelector("#verdict .verdict", { timeout: 4000 });
      const v = await page.$eval("#verdict .verdict", (el) => ({ cls: el.className,
        why: el.querySelector(".why")?.textContent || "" }));
      ok(correct ? /\bok\b/.test(v.cls) : /\bno\b/.test(v.cls), `${at}: a ${correct ? "right" : "wrong"} answer drew "${v.cls}"`);
      ok(v.why.length > 30, `${at}: no explanation under the answer`);
      await dismissModals();
      await page.evaluate(() => window.FALLASKOLI.next());
      await page.waitForFunction("window.FALLASKOLI.cur && document.querySelector('#task .card')", { timeout: 4000 });
    }
  }
  await page.evaluate(() => { const A = window.FALLASKOLI; A.run = null; A.runDone = null; A.next(); });
}

/* ---------- item 27, second half: three verb types, at two widths ---------
 * Each drawn by a short session aimed at its error pattern, at a low and a
 * high þyngd, on a phone (390 px) and a desktop (1280 px): it must come, look
 * like what it is, fit the screen, take a right answer and a wrong one
 * through real typing and clicks, and explain itself under both. */
{
  const CASES = [
    { focus: "beyging_so", type: "so_beyging", r: "slots", band: 1, boxes: 0, options: 2 },
    { focus: "beyging_so", type: "so_beyging", r: "slots", band: 5, boxes: 3, options: 2 },
    { focus: "mynd_greina", type: "so_mynd", r: "choice", band: 1, boxes: 0, options: 3 },
    { focus: "mynd_greina", type: "so_mynd", r: "choice", band: 5, boxes: 0, options: 3 },
    { focus: "bodhattur", type: "so_bodhattur", r: "slots", band: 1, boxes: 1, options: 0 },
    { focus: "bodhattur", type: "so_bodhattur", r: "slots", band: 5, boxes: 2, options: 0 },
  ];
  for (const vp of [{ w: 390, h: 844, touch: true }, { w: 1280, h: 900, touch: false }]) {
    await page.setViewport({ width: vp.w, height: vp.h, isMobile: vp.touch, hasTouch: vp.touch });
    for (const c of CASES) {
      await dismissModals();
      await page.evaluate((c) => {
        const A = window.FALLASKOLI;
        A.S.enabled.sagnord = true;
        A.reloadPolicy();
        A.run = null; A.runDone = null; A.drill = null; A.drillDone = null; A.drillOffer = null;
        Object.keys(A.sess.diff).forEach((k) => { A.sess.diff[k] = c.band; });
        /* Pinning the level must also drop the warm-up the visit owes: the
           first right answer would give it back (core/difficulty.js nextLevel)
           and the case's second question come from a higher þyngd. */
        A.sess.warm = {};
        A.startRun("sagnord", 10, [c.focus], { review: false });
      }, c);
      await page.waitForFunction("window.FALLASKOLI.cur && document.querySelector('#task .card')", { timeout: 4000 });
      const at = `${c.type} at þyngd ${c.band}, ${vp.w} px`;
      for (const correct of [true, false]) {
        const q = await page.evaluate(() => {
          const t = window.FALLASKOLI.cur;
          const inView = (el) => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.width > 0; };
          const boxes = [...document.querySelectorAll("#task table.slotbox input")];
          const btns = [...document.querySelectorAll("#task .opts button")];
          return { type: t.type, typeId: t.typeId, boxes: boxes.length, buttons: btns.length,
            fits: document.documentElement.scrollWidth <= innerWidth + 1,
            visible: [...boxes, ...btns, document.getElementById("check")].every(inView),
            /* A box a child can see what they type in (a class name shared
               with another rule once squeezed these to 18 px on a phone). */
            narrow: boxes.filter((b) => b.getBoundingClientRect().width < 120).length,
            targets: [...document.querySelectorAll("#task .sentence .target")].map((x) => x.textContent),
            marked: t.marks ? t.marks.map((k) => t.s.tok[k].w) : null,
            gloss: document.querySelector("#task .gloss")?.textContent || "" };
        });
        ok(q.type === c.r && q.typeId === c.type, `${at}: drew ${q.typeId} (${q.type})`);
        ok(q.boxes === c.boxes, `${at}: ${q.boxes} boxes, wanted ${c.boxes}`);
        ok(q.buttons === c.options, `${at}: ${q.buttons} option buttons, wanted ${c.options}`);
        ok(q.fits, `${at}: the page scrolls sideways`);
        ok(q.visible, `${at}: a box or a button is off the screen`);
        ok(!q.narrow, `${at}: ${q.narrow} answer boxes narrower than 120 px`);
        /* "Í hvaða mynd er sá?" is 19 characters: the length is the word's, not a sign of a missing line. */
        ok(q.gloss.length > 12, `${at}: no instruction line: "${q.gloss}"`);
        if (c.type === "so_mynd") ok(q.marked && q.targets.join(" ") === q.marked.join(" "),
          `${at}: the verb phrase is not marked (${q.targets.join(" ")})`);
        await answerOneNoNext(correct);
        await page.waitForSelector("#verdict .verdict:not(.neutral)", { timeout: 4000 });
        const v = await page.$eval("#verdict .verdict", (el) => ({ cls: el.className,
          why: el.querySelector(".why")?.textContent || "",
          fits: document.documentElement.scrollWidth <= innerWidth + 1,
          typed: [...document.querySelectorAll("#task table.slotbox input")].map((x) => x.value).join(", "),
          want: (window.FALLASKOLI.cur.slots || []).map((x) => x.accepted.join("/")).join(", ") }));
        ok(correct ? /\bok\b/.test(v.cls) : /\bno\b/.test(v.cls),
          `${at}: a ${correct ? "right" : "wrong"} answer drew "${v.cls}" (typed ${v.typed}; BÍN ${v.want})`);
        ok(v.why.length > 30, `${at}: no explanation under the answer`);
        ok(v.fits, `${at}: the verdict makes the page scroll sideways`);
        await dismissModals();
        await page.evaluate(() => window.FALLASKOLI.next());
        await page.waitForFunction("window.FALLASKOLI.cur && document.querySelector('#task .card')", { timeout: 4000 });
      }
    }
  }
  await page.setViewport({ width: 1100, height: 900 });
  await page.evaluate(() => { const A = window.FALLASKOLI; A.run = null; A.runDone = null; A.next(); });
}

/* The tabs must stay reachable at the narrowest width — they scroll sideways
   there, or (since v6.2) wrap their long names onto two lines so that all of them
   fit; a tab that has been pushed off the screen is the same as a tab that is
   gone. */
await page.setViewport({ width: 360, height: 740, isMobile: true, hasTouch: true });
await page.reload({ waitUntil: "domcontentloaded" });
await startPractice(page, 15000);
{
  const tabs = await page.evaluate(() => {
    const nav = document.querySelector("nav.tabs");
    return { scrollable: nav.scrollWidth > nav.clientWidth,
             count: nav.querySelectorAll("button").length,
             overflowX: getComputedStyle(nav).overflowX };
  });
  ok(tabs.count === 6, `${tabs.count} tabs at 360px`);
  /* Owner feedback 6.14: Færnikort is the sixth tab, the first. */
  ok(!tabs.scrollable || tabs.overflowX === "auto" || tabs.overflowX === "scroll",
    "the tabs are wider than the screen and cannot be scrolled to");
}

/* ---------- item 28: years 9 and 10, drawn, shown and answered -------------
 * The four new types (kinds of subordinate clause, kinds of phrase, find the
 * forsetningarliður, indirect speech) at a phone's width and a desktop's, at
 * a low and a high þyngd. As for item 27, a short session aimed at the
 * type's own error pattern narrows the session to it. Each question must
 * come, fit the screen without sideways scrolling, underline what it asks
 * about, take a right answer and a wrong one through real clicks and typing,
 * and explain itself under both. */
{
  const CASES = [
    { focus: "aukasetn_tegund", topic: "setningagerd", band: 1, types: ["gerd_tegund"], options: 3 },
    { focus: "aukasetn_tegund", topic: "setningagerd", band: 4, types: ["gerd_tegund"], options: 7 },
    { focus: "aukasetn_tegund", topic: "setningagerd", band: 6, types: ["gerd_tegund"], options: 9 },
    { focus: "lidir", topic: "setningafraedi", band: 1, types: ["setn_lidir", "lid_finna"], options: 3 },
    { focus: "lidir", topic: "setningafraedi", band: 5, types: ["setn_lidir", "lid_finna"], options: 4 },
    { focus: "obein_raeda", topic: "malbeiting", band: 1, types: ["raeda"] },
    { focus: "obein_raeda", topic: "malbeiting", band: 5, types: ["raeda", "umritun"] },
  ];
  const SCREENS = [
    { w: 390, h: 844, touch: true },
    { w: 1280, h: 900, touch: false },
  ];
  for (const vp of SCREENS) {
    await page.setViewport({ width: vp.w, height: vp.h, isMobile: vp.touch, hasTouch: vp.touch, deviceScaleFactor: 1 });
    for (const c of CASES) {
      await dismissModals();
      await page.evaluate((c) => {
        const A = window.FALLASKOLI;
        A.S.enabled[c.topic] = true;
        A.reloadPolicy();
        A.run = null; A.runDone = null; A.drill = null; A.drillDone = null; A.drillOffer = null;
        Object.keys(A.sess.diff).forEach((k) => { A.sess.diff[k] = c.band; });
        /* Pinning the level must also drop the warm-up the visit owes: the
           first right answer would give it back (core/difficulty.js nextLevel)
           and the case's second question come from a higher þyngd. */
        A.sess.warm = {};
        A.startRun(c.topic, 10, [c.focus], { review: false });
      }, c);
      await page.waitForFunction("window.FALLASKOLI.cur", { timeout: 4000 });
      const at = `${c.focus} at þyngd ${c.band}, ${vp.w} px`;
      const seen = new Set();
      /* Two questions for a single type; up to eight where two types share
         the pattern, until both have come (right and wrong by turns). */
      const rounds = c.focus === "lidir" ? 8 : 2;
      for (let k = 0; k < rounds; k++) {
        const correct = k % 2 === 0;
        /* A session aimed at a pattern still asks something else now and
           then (about one question in seven), of the pattern's types: here
           another kind of Umritun. Those are passed over. */
        for (let skip = 0; skip < 12; skip++) {
          const other = await page.evaluate(() => {
            const t = window.FALLASKOLI.cur;
            return t.type === "umritun" && t.kind !== "indirect";
          });
          if (!other) break;
          await page.evaluate(() => window.FALLASKOLI.next());
          await page.waitForFunction("window.FALLASKOLI.cur && document.querySelector('#task .card')", { timeout: 4000 });
        }
        const q = await page.evaluate(() => {
          const t = window.FALLASKOLI.cur;
          const marks = [...document.querySelectorAll("#task .sentence .clausemark")]
            .map((el) => el.textContent).filter((x) => x.trim());
          const card = document.querySelector("#task .card").getBoundingClientRect();
          return { type: t.type, typeId: t.typeId, kind: t.kind || null, n: (t.options || []).length,
            buttons: document.querySelectorAll("#task .opts button").length,
            marks, span: t.span ? t.s.tok.slice(t.span.from, t.span.to + 1).map((x) => x.w) : null,
            picks: document.querySelectorAll("#task .pickw").length,
            words: t.s ? t.s.tok.filter((x) => !/^[.,!?;:]$/.test(x.w)).length : 0,
            input: !!document.querySelector("#task #ans"),
            shown: document.querySelector("#task .sentence")?.textContent || "",
            from: t.from || null, eyebrow: document.querySelector("#task .eyebrow")?.textContent || "",
            gloss: [...document.querySelectorAll("#task .gloss")].map((el) => el.textContent).join(" "),
            wide: document.documentElement.scrollWidth - window.innerWidth,
            cardRight: Math.round(card.right), inner: window.innerWidth,
            checkSeen: (() => { const r = document.getElementById("check").getBoundingClientRect(); return r.width > 40 && r.height > 20; })() };
        });
        ok(c.types.includes(q.typeId), `${at}: drew ${q.typeId}`);
        seen.add(q.typeId);
        ok(q.wide <= 1, `${at}: the page scrolls sideways by ${q.wide} px (${q.typeId})`);
        ok(q.cardRight <= q.inner + 1, `${at}: the card runs off the screen (${q.cardRight} > ${q.inner})`);
        ok(q.checkSeen, `${at}: no Athuga button`);
        if (q.typeId === "gerd_tegund" || q.typeId === "setn_lidir") {
          ok(q.type === "choice", `${at}: ${q.typeId} is drawn as ${q.type}`);
          ok(q.buttons === q.n && (q.typeId === "gerd_tegund" ? q.n === c.options : q.n >= 3 && q.n <= 4),
            `${at}: ${q.buttons} option buttons for ${q.n} options`);
          ok(q.span && q.marks.join(" ") === q.span.join(" "),
            `${at}: underlined "${q.marks.join(" ")}", asked about "${(q.span || []).join(" ")}"`);
          ok(/undirstrikaði/.test(q.gloss), `${at}: no instruction line: ${q.gloss}`);
        } else if (q.typeId === "lid_finna") {
          ok(q.type === "tap" && q.picks === q.words, `${at}: ${q.picks} words to click of ${q.words}`);
          ok(/forsetningarlið/.test(q.gloss), `${at}: no instruction line: ${q.gloss}`);
        } else {
          ok(q.type === "umritun" && q.kind === "indirect" && q.input, `${at}: ${q.type}/${q.kind}`);
          ok(q.from && q.shown === q.from && /: „.+“$/.test(q.shown), `${at}: the quote is not shown: ${q.shown}`);
          ok(/óbeina ræðu/.test(q.gloss), `${at}: no instruction line: ${q.gloss}`);
          if (q.typeId === "raeda") ok(/Bein og óbein ræða/.test(q.eyebrow), `${at}: heading "${q.eyebrow}"`);
        }
        await answerOneNoNext(correct);
        await page.waitForSelector("#verdict .verdict", { timeout: 4000 });
        const v = await page.$eval("#verdict .verdict", (el) => ({ cls: el.className,
          why: el.querySelector(".why")?.textContent || "",
          wide: document.documentElement.scrollWidth - window.innerWidth }));
        ok(correct ? /\bok\b/.test(v.cls) : /\bno\b/.test(v.cls), `${at}: a ${correct ? "right" : "wrong"} answer to ${q.typeId} drew "${v.cls}"`);
        ok(v.why.length > 30, `${at}: no explanation under the answer (${q.typeId})`);
        ok(v.wide <= 1, `${at}: the verdict makes the page scroll sideways by ${v.wide} px`);
        await dismissModals();
        await page.evaluate(() => window.FALLASKOLI.next());
        await page.waitForFunction("window.FALLASKOLI.cur && document.querySelector('#task .card')", { timeout: 4000 });
        if (k >= 1 && c.focus === "lidir" && seen.size === 2 && k % 2 === 1) break;
      }
      if (c.focus === "lidir") ok(seen.size === 2, `${at}: only ${[...seen]} came in eight questions`);
    }
  }
  await page.setViewport({ width: 1100, height: 900 });
  await page.evaluate(() => { const A = window.FALLASKOLI; A.run = null; A.runDone = null; A.next(); });
}

/* ---------- issue #28: connectives ------------------------------------------
 *
 * Veldu tengiorðið and Hvað segir setningin?, on a phone and on a desktop:
 * each comes in a session aimed at its error pattern, shows four options,
 * and under a wrong answer says why the option that was picked does not
 * fit — that option's own reason, above the rule. */
{
  for (const vp of [{ w: 390, h: 844, touch: true }, { w: 1280, h: 900, touch: false }]) {
    await page.setViewport({ width: vp.w, height: vp.h, isMobile: vp.touch, hasTouch: vp.touch, deviceScaleFactor: 1 });
    await dismissModals();
    await page.evaluate(() => {
      const A = window.FALLASKOLI;
      A.S.enabled.obeygjanleg = true;
      A.reloadPolicy();
      A.run = null; A.runDone = null; A.drill = null; A.drillDone = null; A.drillOffer = null;
      A.sess.warm = {};
      A.startRun("obeygjanleg", 10, ["tengiord"], { review: false });
    });
    await page.waitForFunction("window.FALLASKOLI.cur", { timeout: 4000 });
    const seen = new Map();
    for (let k = 0; k < 10; k++) {
      const q = await page.evaluate(() => {
        const t = window.FALLASKOLI.cur;
        return { typeId: t.typeId, type: t.type, options: t.options || [], answer: t.answer,
          buttons: [...document.querySelectorAll("#task .opts button")].map((b) => b.textContent),
          blank: !!document.querySelector("#task .sentence .blank"),
          shown: document.querySelector("#task .sentence")?.textContent || "",
          whyNot: t.whyNot || null,
          wide: document.documentElement.scrollWidth - window.innerWidth };
      });
      const at = `#28 ${q.typeId}, ${vp.w} px`;
      if (!["ob_tengiord", "ob_skilja"].includes(q.typeId)) {
        /* a session aimed at a pattern asks something else about one time in seven */
        await page.evaluate(() => window.FALLASKOLI.next());
        await page.waitForFunction("window.FALLASKOLI.cur && document.querySelector('#task .card')", { timeout: 4000 });
        continue;
      }
      /* each type once right and once wrong */
      const n = seen.get(q.typeId) || 0;
      seen.set(q.typeId, n + 1);
      const correct = n % 2 === 1;
      ok(q.type === "choice" && q.buttons.length === 4 && q.buttons.join("|") === q.options.join("|"),
        `${at}: buttons "${q.buttons.join(" · ")}" for options "${q.options.join(" · ")}"`);
      ok(q.wide <= 1, `${at}: the page scrolls sideways by ${q.wide} px`);
      ok(q.whyNot && q.options.filter((o) => o !== q.answer).every((o) => q.whyNot[o]), `${at}: a wrong option without its reason`);
      if (q.typeId === "ob_tengiord") ok(q.blank, `${at}: no blank in "${q.shown}"`);
      else ok(!q.blank && /[.]$/.test(q.shown) && q.buttons.slice(2).join("|") === "bæði|hvorugt",
        `${at}: "${q.shown}" with ${q.buttons.join(" · ")}`);
      await answerOneNoNext(correct);
      await page.waitForSelector("#verdict .verdict", { timeout: 4000 });
      const v = await page.evaluate(() => {
        const t = window.FALLASKOLI.cur, el = document.querySelector("#verdict .verdict");
        const box = el.querySelector(".whynot");
        return { cls: el.className, picked: t.picked, answer: t.answer,
          whynot: box ? box.textContent : "", want: t.whyNot[t.picked] || "",
          whys: [...el.querySelectorAll(".why")].map((x) => x.className),
          wide: document.documentElement.scrollWidth - window.innerWidth };
      });
      ok(correct ? /\bok\b/.test(v.cls) : /\bno\b/.test(v.cls), `${at}: a ${correct ? "right" : "wrong"} answer drew "${v.cls}"`);
      if (correct) ok(!v.whynot && v.whys.length === 1, `${at}: a right answer is told why not: ${v.whynot}`);
      else {
        ok(v.picked !== v.answer && v.want.length > 20, `${at}: picked ${v.picked}`);
        /* the reason for the option that was picked, named, and above the rule */
        ok(v.whynot.includes(v.picked) && v.whynot.replace(/[*]/g, "").includes(v.want.replace(/[*]/g, "").slice(0, 25)),
          `${at}: under "${v.picked}" the pupil reads "${v.whynot}", the item says "${v.want}"`);
        ok(v.whys.length === 2 && /whynot/.test(v.whys[0]), `${at}: boxes ${v.whys.join(", ")}`);
      }
      ok(v.wide <= 1, `${at}: the verdict makes the page scroll sideways by ${v.wide} px`);
      await dismissModals();
      await page.evaluate(() => window.FALLASKOLI.next());
      await page.waitForFunction("window.FALLASKOLI.cur && document.querySelector('#task .card')", { timeout: 4000 });
      if ((seen.get("ob_tengiord") || 0) >= 2 && (seen.get("ob_skilja") || 0) >= 2) break;
    }
    ok((seen.get("ob_tengiord") || 0) >= 2 && (seen.get("ob_skilja") || 0) >= 2,
      `#28 at ${vp.w} px: ten questions brought ${JSON.stringify([...seen])}`);
  }
  await page.setViewport({ width: 1100, height: 900 });
  await page.evaluate(() => { const A = window.FALLASKOLI; A.run = null; A.runDone = null; A.next(); });
}

/* ---------- items 50, 51, 52, 43 (v6.13 small UX) -------------------------- */
{
  await page.setViewport({ width: 900, height: 900 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await startPractice(page, 15000);

  /* 51: the verdict is a live region before anything is put in it, and the
     session line has text a screen reader can read. */
  const live = await page.evaluate(() => {
    const v = document.getElementById("verdict");
    const line = document.querySelector("#runbar .runline");
    return { verdict: v && v.getAttribute("role"), line: line && line.getAttribute("role"),
             lineText: line ? [...line.querySelectorAll(".sr-only")].map((e) => e.textContent).join("") : "" };
  });
  ok(live.verdict === "status", `#verdict has role=status (got ${live.verdict})`);
  ok(live.line === "status" && /Spurning \d+ af/.test(live.lineText), `the session line is a status with readable text ("${live.lineText}")`);

  /* 51: the contrast of grey text on the board, as the browser computes it. */
  const contrast = await page.evaluate(() => {
    const board = document.querySelector(".blackboard");
    const p = document.createElement("p");
    p.className = "gloss"; p.textContent = "gloss"; board.appendChild(p);
    const f = document.createElement("span");
    f.className = "faint"; f.textContent = "faint"; board.appendChild(f);
    const rgb = (c) => c.match(/[\d.]+/g).map(Number);
    const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
      .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
    const bg = rgb(getComputedStyle(board).backgroundColor);
    const ratio = (el) => {
      const cs = getComputedStyle(el), c = rgb(cs.color), o = parseFloat(cs.opacity);
      const mixed = c.slice(0, 3).map((v, i) => v * o + bg[i] * (1 - o));
      const [a, b] = [lum(mixed), lum(bg)].sort((x, y) => y - x);
      return (a + 0.05) / (b + 0.05);
    };
    const out = { gloss: ratio(p), faint: ratio(f) };
    p.remove(); f.remove();
    return out;
  });
  ok(contrast.gloss >= 4.5, `gloss on the board is ${contrast.gloss.toFixed(2)}:1`);
  ok(contrast.faint >= 4.5, `faint text on the board is ${contrast.faint.toFixed(2)}:1`);

  /* 43: a two-option type is asked as a pair: two sentences, two sets of
     options, and a click on only one of them does not submit. */
  const pair = await page.evaluate(async () => {
    const A = window.FALLASKOLI;
    A.run = null; A.runDone = null;
    A.startRun("fornofn", 10, ["afturbeyging"]);   // the pattern fn_aftur tests: every question is one
    for (let k = 0; k < 40; k++) {
      if (A.cur && A.cur.typeId === "fn_aftur") break;
      A.next();
    }
    const t = A.cur;
    return t && t.typeId === "fn_aftur"
      ? { boxes: document.querySelectorAll(".opts").length, second: !!t.second } : null;
  });
  ok(!!pair && pair.boxes === 2 && pair.second, `a two-option question is a pair on screen: ${JSON.stringify(pair)}`);
  if (pair) {
    await page.evaluate(() => document.querySelector(".opts button").click());
    await tap("#check");
    const msg = await page.evaluate(() => document.querySelector("#verdict").textContent);
    ok(/hvorri setningu/.test(msg), `one answer of two does not submit: "${msg}"`);
  }

  /* 50: types, levels and features are behind "Fyrir kennara og foreldra". */
  await page.reload({ waitUntil: "domcontentloaded" });
  await startPractice(page, 15000);
  await page.evaluate(() => window.FALLASKOLI.openView("settings"));
  const fold = await page.evaluate(() => {
    const ed = document.getElementById("policyeditor");
    const d = ed.querySelector("details.teacherfold");
    const vis = (el) => !!el && el.checkVisibility();
    const presets = ed.querySelectorAll("button[data-preset]");
    const typeBox = ed.querySelector('input[data-dim="types"]');
    const skillBox = ed.querySelector('input[data-dim="skills"]');
    return { hasFold: !!d, summary: d && d.querySelector("summary").textContent,
             open: d && d.open, presets: presets.length,
             typeInside: !!(d && typeBox && d.contains(typeBox)), skillOutside: !!(skillBox && !(d && d.contains(skillBox))),
             typeVisible: vis(typeBox), skillVisible: vis(skillBox),
             levelInside: !!(d && ed.querySelector('input[data-dim="levels"]') && d.contains(ed.querySelector('input[data-dim="levels"]'))),
             attrInside: !!(d && ed.querySelector('input[data-dim="attrs"]') && d.contains(ed.querySelector('input[data-dim="attrs"]'))) };
  });
  ok(fold.hasFold && /Fyrir kennara og foreldra/.test(fold.summary), "Stillingar has the 'Fyrir kennara og foreldra' disclosure");
  ok(fold.open === false, "the disclosure starts closed");
  ok(fold.presets === 3 && fold.skillOutside && fold.skillVisible, "the year buttons and the categories stay in the open");
  ok(fold.typeInside && fold.levelInside && fold.attrInside && !fold.typeVisible, `types, levels and features are inside it and hidden: ${JSON.stringify(fold)}`);
  await page.evaluate(() => document.querySelector("details.teacherfold > summary").click());
  const opened = await page.evaluate(() => {
    const b = document.querySelector('details.teacherfold input[data-dim="types"]');
    return !!b && b.checkVisibility();
  });
  ok(opened, "opening it shows the question types");
  /* A year press redraws the editor; it must stay open. */
  await page.evaluate(() => document.querySelector("button[data-preset]").click());
  ok(await page.evaluate(() => document.querySelector("details.teacherfold").open), "the disclosure stays open after choosing a year");

  /* 52: reading comfort. */
  const before = await page.evaluate(() => {
    const cs = getComputedStyle(document.body);
    return { ls: cs.letterSpacing, mono: getComputedStyle(document.querySelector(".stat b")).fontFamily };
  });
  await page.evaluate(() => document.getElementById("set-comfort").click());
  const after = await page.evaluate(() => {
    const cs = getComputedStyle(document.body);
    const wrap = getComputedStyle(document.querySelector(".wrap"));
    return { on: document.body.classList.contains("comfort"), ls: cs.letterSpacing,
             mono: getComputedStyle(document.querySelector(".stat b")).fontFamily,
             zoom: wrap.zoom, saved: window.FALLASKOLI.S.settings.comfort };
  });
  ok(after.on && after.saved === true, "the reading-comfort switch sets body.comfort and is saved");
  ok(parseFloat(after.ls) > 0 && before.ls !== after.ls, `letter spacing widens (${before.ls} → ${after.ls})`);
  ok(/Public Sans/.test(after.mono) && /Plex Mono/.test(before.mono), `word forms use the proportional face (${before.mono} → ${after.mono})`);
  ok(Number(after.zoom) > 1, `type is larger (zoom ${after.zoom})`);
  await page.reload({ waitUntil: "domcontentloaded" });
  await startPractice(page, 15000);
  ok(await page.evaluate(() => document.body.classList.contains("comfort")), "the setting survives a reload");
  await page.evaluate(() => { document.getElementById("set-comfort").click(); });
  ok(await page.evaluate(() => !document.body.classList.contains("comfort")), "and switches off again");
}

/* ---------- items 41 and 44: "Æfa þetta", the worked example, the mastery mark
 * A Lesefni page's button starts five questions of exactly that page's types;
 * the first card of a type not met before opens with a worked example, and
 * that type never shows it again; "Önnur lota" repeats the page's session;
 * and every category in Framvinda carries a mastery mark beside its stig. */
await page.setViewport({ width: 1100, height: 900 });
{
  await tap('nav.tabs button[data-view="practice"]');
  await page.evaluate(() => {
    const A = window.FALLASKOLI;
    A.run = null; A.runDone = null; A.drill = null; A.drillDone = null;
    A.S.seenTypes = {};            // a pupil who has met no type yet
    A.openView("lessons", "foll");
  });
  const want = lessonPractice("foll").types;
  const btns = await page.evaluate(() => [...document.querySelectorAll("#lsnbody [data-practice]")]
    .map((b) => ({ id: b.dataset.practice, text: b.innerText })));
  ok(btns.length === 2 && btns.every((b) => b.id === "foll" && /Æfa þetta/.test(b.text)),
    `the Föll page has no "Æfa þetta" button: ${JSON.stringify(btns)}`);
  await tap("#lsnbody section.lsnpractice [data-practice]");
  await page.waitForFunction("window.FALLASKOLI.cur && window.FALLASKOLI.run", { timeout: 5000 });
  const run = await page.evaluate(() => {
    const r = window.FALLASKOLI.run;
    return { n: r.n, types: r.types, label: r.label,
      practice: !document.getElementById("view-practice").hidden,
      bar: document.querySelector("#runbar .runtopic")?.textContent || "" };
  });
  ok(run.n === 5 && run.practice, `"Æfa þetta" did not start a five-question session: ${JSON.stringify(run)}`);
  ok(JSON.stringify([...run.types].sort()) === JSON.stringify([...want].sort()), `the session's types are not the page's: ${run.types}`);
  ok(/Lesefni: Föllin fjögur/.test(run.bar), `the session bar does not name the page: "${run.bar}"`);
  const cards = [];
  for (let i = 0; i < 5; i++) {
    await dismissModals();
    cards.push(await page.evaluate(() => {
      const ex = document.querySelector("#task .card .workedex");
      return { type: window.FALLASKOLI.cur.typeId, example: !!ex,
        first: !!ex && ex.previousElementSibling && ex.previousElementSibling.classList.contains("eyebrow"),
        text: ex ? ex.innerText : "" };
    }));
    await answerOne(true);
  }
  ok(cards.every((c) => want.includes(c.type)), `the page's session asked other types: ${cards.map((c) => c.type)}`);
  ok(cards[0].example && cards[0].first && /Svar:/.test(cards[0].text),
    `the first card of a type not met before has no worked example under its heading: ${JSON.stringify(cards[0])}`);
  const met = new Set();
  for (const c of cards) {
    ok(c.example === !met.has(c.type), `${c.type}: worked example ${c.example ? "shown again" : "missing on the first meeting"}`);
    met.add(c.type);
  }
  const seen = await page.evaluate(() => window.FALLASKOLI.S.seenTypes);
  ok([...met].every((t) => /^\d{4}-\d{2}-\d{2}$/.test(seen[t] || "")), `the types met were not written down: ${JSON.stringify(seen)}`);
  const sum = await page.evaluate(() => ({
    head: document.querySelector("#task .summary .eyebrow")?.innerText || "",
    again: document.querySelector('#task [data-next="again"]')?.innerText || "",
  }));
  ok(/Föllin fjögur/.test(sum.head) && /Föllin fjögur · 5/.test(sum.again), `the summary does not name the page: ${JSON.stringify(sum)}`);
  /* "Önnur lota": the same page, the same five, and no example for a type met. */
  await dismissModals();      // item 61
  await tap('#task [data-next="again"]');
  await page.waitForFunction("window.FALLASKOLI.cur && window.FALLASKOLI.run", { timeout: 5000 });
  const again = await page.evaluate(() => ({ n: window.FALLASKOLI.run.n, types: window.FALLASKOLI.run.types,
    type: window.FALLASKOLI.cur.typeId, example: !!document.querySelector("#task .workedex") }));
  ok(again.n === 5 && JSON.stringify([...again.types].sort()) === JSON.stringify([...want].sort()),
    `"Önnur lota" did not repeat the page's session: ${JSON.stringify(again)}`);
  ok(!(met.has(again.type) && again.example), `${again.type}: the worked example came back a second session`);
  /* The picker remembers what was picked there, not the page's five. */
  ok(await page.evaluate(() => window.FALLASKOLI.S.settings.runSize !== 5), "the page's session size leaked into the picker");
  await page.evaluate(() => { const A = window.FALLASKOLI; A.run = null; A.runDone = null; A.next(); });

  /* 44: the mastery mark beside every category's stig. */
  /* Since item 83 the category's card is the head of its trail on the skill
     map, which has its own tab since owner feedback 6.14. */
  await page.evaluate(() => window.FALLASKOLI.openView("map"));
  const marks = await page.evaluate(() => [...document.querySelectorAll("#skillmap .smlane:not(.planned)")].map((c) => ({
    skill: c.dataset.skill, level: Number(c.dataset.mastery),
    mark: c.querySelector(".smmark .mastery b")?.innerText || "", line: c.querySelector(".mline")?.innerText || "",
    pips: c.querySelectorAll(".mastery .mpips i").length, stig: c.querySelector(".smstig")?.innerText || "",
  })));
  ok(marks.length === 15 && marks.every((m) => m.mark && m.line && m.pips === 4 && m.level >= 0 && m.level <= 4 && /^Stig \d+$/.test(m.stig)),
    `every category should carry a mastery mark beside its stig: ${JSON.stringify(marks.slice(0, 3))}`);
  const no = marks.find((m) => m.skill === "nafnord");
  ok(no && /rétt á þyngd|svör á þyngd|vantar/.test(no.line), `Nafnorð's mark does not say what it rests on: ${JSON.stringify(no)}`);
  await tap('nav.tabs button[data-view="practice"]');
}

/* ---------- item 45: the second-language mode ---------------------------------
 * Off: the sentence is plain text and there is no speak button. On (the box
 * under Stillingar): every content word of the sentence is a tap target, and a
 * real tap opens the window with the word's dictionary form; without an
 * Icelandic voice on the device there is still no button. With a voice that
 * runs on the device (stubbed in a page of its own) the button is there and
 * reads the sentence — the blank as a pause — and a network voice is not used. */
{
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  /* Seeded: which questions come decides what is checked (see seedRandom).
     The SEED of the run, so `SEED=n` replays a failure here too. */
  await seedRandom(page, SEED + 45);
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await page.goto(FILE, { waitUntil: "domcontentloaded" });
  await startPractice(page, 15000);
  const realTap = async (sel) => {
    const at = await page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return null;
      el.scrollIntoView({ block: "center" });
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, sel);
    if (!at) { ok(false, "item 45: nothing to tap at " + sel); return; }
    await page.mouse.click(at.x, at.y);
  };
  /* The tokens the question's text is written from, as the card glosses
     them: a passive or two lines to join (Umritun germynd, tenging) carry
     their own (`fromTok`, `linesTok`, tasks/malbeiting.js); a quotation shown
     as plain text carries none; every other card shows the bank sentence
     without the word it asks about. Item 45 and 29: until v6.13 the first two
     got no glosses while this check counted the bank sentence's words, which
     is why it failed on one run in ten. */
  const SHOWN = `(A) => {
    const c = A.cur;
    if (c.type === "umritun" && (c.fromTok || c.linesTok)) return c.fromTok || c.linesTok.flat();
    if (c.type === "umritun" && (c.from || c.lines)) return [];
    /* A sort question is about every word it asks to sort, a verb-phrase
       question (Germynd, miðmynd eða þolmynd?) about every word it marks:
       none is glossed. */
    const about = new Set([c.i, ...(c.type === "sort" && c.items ? c.items.map((x) => x.j) : []), ...(c.marks || [])]);
    const own = c.s ? c.s.tok.filter((t, j) => !about.has(j)) : [];
    /* Two sentences with the same word (Forsetning eða atviksorð?): the
       second is glossed as the first is. */
    const two = c.second && c.second.s ? c.second.s.tok.filter((t, j) => j !== c.second.i) : [];
    return own.concat(two);
  }`;
  /* Answer until a question shows a sentence with a content word in it. */
  const toSentence = () => page.evaluate((SHOWN) => {
    const A = window.FALLASKOLI;
    const shown = eval(SHOWN);
    for (let k = 0; k < 60; k++) {
      const s = document.querySelector("#task .card .sentence");
      if (s && A.cur && A.cur.s && shown(A).some((t) => t.l && ["nafnorð", "sagnorð", "lýsingarorð", "atviksorð"].includes(t.c))
        && !document.querySelector("#task #picker") && A.cur.type !== "hunt") return A.cur.type;
      A.finish({ correct: true }); A.next();
    }
    return null;
  }, SHOWN);
  const off = await page.evaluate(() => ({
    voices: (window.speechSynthesis ? speechSynthesis.getVoices() : []).filter((v) => /^is/i.test(v.lang)).length,
    on: window.FALLASKOLI.S.settings.secondLanguage === true,
  }));
  ok(!off.on, "item 45: the second-language mode is on before anybody switched it on");
  const t0 = await toSentence();
  ok(!!t0, "item 45: no question with a sentence in sixty");
  const plain = await page.evaluate(() => ({ l2w: document.querySelectorAll("#task .l2w").length, btn: !!document.getElementById("l2speak") }));
  ok(plain.l2w === 0 && !plain.btn, `item 45: with the mode off the sentence has glosses or a speak button: ${JSON.stringify(plain)}`);

  /* The box under Stillingar, as a pupil ticks it. */
  await page.evaluate(() => { const b = document.getElementById("set-l2"); b.checked = true; b.dispatchEvent(new Event("change")); });
  const saved = await page.evaluate(() => window.FALLASKOLI.S.settings.secondLanguage);
  ok(saved === true, "item 45: ticking the box did not switch the mode on");
  await page.evaluate(() => { const A = window.FALLASKOLI; A.finish({ correct: true }); A.next(); });
  const t1 = await toSentence();
  const on = await page.evaluate((SHOWN) => {
    const A = window.FALLASKOLI;
    const words = [...document.querySelectorAll("#task .card .sentence .l2w")];
    const content = eval(SHOWN)(A).filter((t) => t.l && ["nafnorð", "sagnorð", "lýsingarorð", "atviksorð"].includes(t.c)).length;
    return { type: A.cur.type, n: words.length, content, texts: words.map((w) => w.textContent),
      btn: !!document.getElementById("l2speak"),
      voices: (window.speechSynthesis ? speechSynthesis.getVoices() : []).filter((v) => /^is/i.test(v.lang) && v.localService).length };
  }, SHOWN);
  ok(on.n > 0 && on.n === on.content, `item 45: ${on.type}: ${on.n} glossed words, ${on.content} content words in the sentence (${on.texts.join(" ")})`);
  ok(on.btn === (on.voices > 0), `item 45: the speak button is ${on.btn ? "shown" : "hidden"} with ${on.voices} local Icelandic voices`);
  if (on.n) {
    await realTap("#task .card .sentence .l2w");
    await page.waitForFunction(() => { const t = document.querySelector(".tip"); return t && !t.hidden; }, { timeout: 3000 })
      .catch(() => ok(false, "item 45: tapping a word did not open its gloss"));
    const tip = await page.evaluate(() => {
      const t = document.querySelector(".tip");
      const w = JSON.parse(document.querySelector("#task .card .sentence .l2w").dataset.dfn);
      const r = t.getBoundingClientRect();
      return { head: t.querySelector("h4") && t.querySelector("h4").textContent, nm: w.nm, def: w.def,
        text: t.innerText, fits: r.left >= 0 && r.right <= innerWidth };
    });
    ok(tip.head && tip.head.startsWith(tip.nm), `item 45: the gloss should be headed by the dictionary form ${tip.nm}: ${tip.head}`);
    ok(tip.def ? tip.text.includes(tip.def.slice(0, 30)) : /Engin skýring/.test(tip.text), `item 45: the gloss does not show the definition: ${tip.text.slice(0, 120)}`);
    ok(tip.fits, "item 45: the gloss does not fit a 390 px phone");
    await realTap("#task .card .sentence .l2w");
    const closed = await page.evaluate(() => { const t = document.querySelector(".tip"); return !t || t.hidden; });
    ok(closed, "item 45: a second tap on the word did not close its gloss");
  }
  /* The two kinds of Umritun that show something other than the bank
     sentence (item 29): a passive to turn back (germynd) and two sentences
     to join (tenging). Asked for by name, as the item-29 check above does,
     until each has come: every content word of what is shown is glossed, a
     second tap on a gloss opens it, and the words are the ones shown.
     NOT SEED-LUCKY (#38): the session is seeded (#89), so every new question
     type moved which questions these 60 were, and a run could lack one kind.
     Now Umritun is the only type on (Ræða and Sameina off too), and the loop
     draws until both kinds have come, up to 200 questions: a join is about
     one Umritun in eleven, so missing one in 200 is less likely than one in
     a million. It stops as soon as both are there. */
  await page.evaluate(() => {
    const A = window.FALLASKOLI;
    A.S.enabled.malbeiting = true;
    A.S.policy = A.S.policy || {};
    A.S.policy.types = { ...(A.S.policy.types || {}), smidja: false, villur: false, raeda: false, sameina: false };
    A.reloadPolicy(); A.save();
    A.run = null; A.runDone = null; A.drill = null; A.drillDone = null; A.drillOffer = null;
    Object.keys(A.sess.diff).forEach((k) => { A.sess.diff[k] = 4; });
    A.sess.warm = {};
    A.startRun("malbeiting", 200, null, { review: false });
  });
  await page.waitForFunction("window.FALLASKOLI.cur", { timeout: 4000 });
  const l2kinds = new Set();
  let l2asked = 0;
  for (; l2asked < 200 && l2kinds.size < 2; l2asked++) {
    const r = await page.evaluate((SHOWN) => {
      const A = window.FALLASKOLI;
      const c = A.cur;
      if (!c || c.type !== "umritun" || !(c.kind === "active" || c.kind === "join")) return null;
      const want = eval(SHOWN)(A).filter((t) => t.l && ["nafnorð", "sagnorð", "lýsingarorð", "atviksorð"].includes(t.c)).map((t) => t.w.toLowerCase());
      const got = [...document.querySelectorAll("#task .card .sentence .l2w")].map((e) => e.textContent.toLowerCase());
      return { kind: c.kind, want, got, text: document.querySelector("#task .card .sentence").textContent };
    }, SHOWN);
    if (r) {
      l2kinds.add(r.kind);
      ok(r.want.length > 0 && JSON.stringify(r.want) === JSON.stringify(r.got),
        `item 45: umritun/${r.kind}: glossed [${r.got.join(" ")}], content words shown [${r.want.join(" ")}] in "${r.text}"`);
    }
    await page.evaluate(() => { const A = window.FALLASKOLI; A.finish({ correct: true }); A.next(); });
    await page.waitForFunction("document.querySelector('#task .card')", { timeout: 4000 });
  }
  ok(l2kinds.size === 2, `item 45: germynd and tenging did not both come up in ${l2asked} questions: ${[...l2kinds]}`);
  await page.evaluate(() => {
    const A = window.FALLASKOLI;
    delete A.S.policy.types.smidja; delete A.S.policy.types.villur;
    delete A.S.policy.types.raeda; delete A.S.policy.types.sameina;
    A.run = null; A.runDone = null;
    A.reloadPolicy(); A.save();
  });
  ok(errors.length === 0, `item 45: errors with the mode on: ${errors.join(" | ")}`);
  await page.close();

  /* A device with an Icelandic voice of its own (stubbed), and a network one. */
  const p2 = await browser.newPage();
  const errors2 = [];
  p2.on("pageerror", (e) => errors2.push(e.message));
  await p2.evaluateOnNewDocument(() => {
    const voices = [
      { name: "Netrödd", lang: "is-IS", localService: false, default: false, voiceURI: "net" },
      { name: "Guðrún", lang: "is-IS", localService: true, default: false, voiceURI: "local" },
    ];
    window.__spoken = [];
    const fake = {
      getVoices: () => voices, cancel() {}, speak(u) { window.__spoken.push({ text: u.text, voice: u.voice && u.voice.name, lang: u.lang }); },
      addEventListener() {}, removeEventListener() {},
    };
    Object.defineProperty(window, "speechSynthesis", { value: fake, configurable: true });
    /* The real utterance accepts only a real voice object. */
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  });
  await p2.goto(FILE, { waitUntil: "domcontentloaded" });
  await p2.waitForFunction("window.FALLASKOLI && window.FALLASKOLI.sess", { timeout: 15000 });
  await p2.evaluate(() => { const A = window.FALLASKOLI; A.S.settings.secondLanguage = true; A.save(true); });
  await p2.reload({ waitUntil: "domcontentloaded" });
  await startPractice(p2, 15000);
  const found = await p2.evaluate(() => {
    const A = window.FALLASKOLI;
    for (let k = 0; k < 80; k++) {
      /* A sentence of a few words: a conjugation slot ("ég ___") has a blank
         too, but too little to read aloud for the check below. Which comes
         first depends on the seeded stream (#31's types moved it there). */
      const sent = document.querySelector("#task .card .sentence");
      if (sent && sent.querySelector(".blank") && sent.textContent.trim().length > 8 && document.getElementById("l2speak")) return true;
      A.finish({ correct: true }); A.next();
    }
    return !!document.getElementById("l2speak");
  });
  ok(found, "item 45: with a local Icelandic voice the speak button should be there");
  if (found) {
    await p2.evaluate(() => document.getElementById("l2speak").click());
    const said = await p2.evaluate(() => ({ spoken: window.__spoken, shown: document.querySelector("#task .card .sentence").textContent }));
    const last = said.spoken[said.spoken.length - 1] || {};
    ok(last.voice === "Guðrún" && /^is/i.test(last.lang || ""), `item 45: read with ${last.voice}, not the device's own Icelandic voice`);
    ok(last.text && !/\?/.test(last.text.replace(/\?\s*$/, "")) && last.text.length > 5,
      `item 45: what was read: "${last.text}" for "${said.shown}"`);
  }
  ok(errors2.length === 0, `item 45: errors with a voice: ${errors2.join(" | ")}`);
  await p2.close();
}

/* ---------- item 46: Ritun vikunnar ----------------------------------------------
 * Offline (this file has no server): the picker offers the week's three
 * sentences; the card says the text is sent nowhere and offers no check;
 * fewer than three sentences cannot be finished; three can, and the picker
 * then says it is done — with the week, and not a word of the text, in the
 * saved progress. Then the remarks, with a stand-in for the server's answer:
 * shown one at a time, marked in their sentence; "Laga í textanum" selects
 * the stretch; typing the fix moves to the next; "Sleppa" passes one; and a
 * redraw of the picker (an assignment arriving) does not wipe the text. */
{
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await page.goto(FILE, { waitUntil: "domcontentloaded" });
  await page.waitForFunction("window.FALLASKOLI && window.FALLASKOLI.sess && document.querySelector('#task .card')", { timeout: 15000 });
  const tapIn = async (sel) => {
    const at = await page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return null;
      el.scrollIntoView({ block: "center" });
      const r = el.getBoundingClientRect();
      return r.width && r.height ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
    }, sel);
    if (!at) { ok(false, "item 46: nothing to tap at " + sel); return false; }
    await page.mouse.click(at.x, at.y);
    return true;
  };
  await page.evaluate(() => { const A = window.FALLASKOLI; delete A.S.settings.writingDone; A.save(true); A.openView("practice"); A.next(); });
  const offer = await page.evaluate(() => { const b = document.querySelector(".writebox"); return b ? b.innerText : null; });
  ok(offer && /Skrifaðu þrjár setningar um/.test(offer) && /Skrifa →/.test(offer), `item 46: the picker should offer the week's writing: ${offer}`);
  ok(/Hér er enginn yfirlestur\. Þú lest textann sjálf\(ur\) yfir\./.test(offer || ""),
    `review S14: offline the offer must say nothing reads the text over: ${offer}`);
  await tapIn("#writego");
  await page.waitForSelector("#wr-text", { timeout: 3000 }).catch(() => ok(false, "item 46: the writing card did not open"));
  const card = await page.evaluate(() => ({
    mode: document.getElementById("wr-mode").innerText,
    check: !document.getElementById("wr-check").hidden,
    fits: document.querySelector(".writecard").getBoundingClientRect().right <= innerWidth + 1,
    wide: document.getElementById("wr-text").getBoundingClientRect().width,
  }));
  ok(/ekki sendur neitt og ekki geymdur/.test(card.mode), `item 46: offline the card must say the text goes nowhere: ${card.mode}`);
  ok(!card.check, "item 46: offline there is no 'Lesa yfir'");
  ok(card.fits && card.wide > 250, `item 46: the card does not fit a 390 px phone (${card.wide}px box)`);
  await page.focus("#wr-text");
  await page.keyboard.type("Ég á hund sem heitir Snati. Hann er brúnn.");
  await tapIn("#wr-done");
  const early = await page.evaluate(() => ({ msg: document.getElementById("wr-notes").innerText, open: !!document.getElementById("wr-text"),
    count: document.getElementById("wr-count").innerText }));
  ok(early.open && /Tvær setningar eru komnar/.test(early.msg), `item 46: two sentences should not finish the task: ${early.msg}`);
  ok(/^2 af 3 setningum/.test(early.count), `item 46: the count says ${early.count}`);
  /* An assignment arriving redraws the picker — not over the text. */
  await page.evaluate(() => { const A = window.FALLASKOLI; A.assignments = [{ id: "x", open: true, target: { kind: "skill", id: "nafnord" }, n: 5, due: "2099-01-01" }]; });
  await page.evaluate(() => window.FALLASKOLI.next());      // no run: draws the picker again
  const kept = await page.evaluate(() => { const b = document.getElementById("wr-text"); return b && b.value; });
  ok(kept && kept.includes("Snati"), "item 46: the text was wiped");
  await page.evaluate(() => { const b = document.getElementById("wr-text"); b.focus(); b.setSelectionRange(b.value.length, b.value.length); });
  await page.keyboard.type(" Hann leikur sér úti.");
  await tapIn("#wr-done");
  await page.waitForSelector(".writebox", { timeout: 3000 }).catch(() => ok(false, "item 46: finishing did not go back to the picker"));
  const done = await page.evaluate(() => ({
    offer: document.querySelector(".writebox").innerText,
    week: window.FALLASKOLI.S.settings.writingDone,
    stored: JSON.stringify(localStorage).includes("Snati") || JSON.stringify(window.FALLASKOLI.S).includes("Snati"),
  }));
  ok(/lokið í þessari viku/.test(done.offer) && /^\d{4}-\d{2}-\d{2}$/.test(done.week || ""), `item 46: done is not shown or not saved: ${done.week}`);
  ok(!done.stored, "item 46: the text the pupil wrote was saved on the device");

  /* The remarks, with a stand-in for the server's answer. */
  await page.evaluate(() => {
    const A = window.FALLASKOLI;
    window.__sent = [];
    A.server = {
      writingStatus: async () => ({ check: true, keep: false, available: true }),
      checkWriting: async (text) => {
        window.__sent.push(text);
        const at = (w) => text.indexOf(w);
        const notes = [];
        if (at("Mér") >= 0) notes.push({ start: at("Mér"), end: at("Mér") + 3, code: "P_WRONG_CASE_þgf_þf", msg: "Á líklega að vera 'Mig'", detail: "Sögnin 'að langa' er ópersónuleg.", suggest: "Mig" });
        if (at("skólan ") >= 0) notes.push({ start: at("skólan "), end: at("skólan ") + 6, code: "N4NN-END", msg: "Stafsetningarvilla: 'skólan' -> 'skólann'", suggest: "skólann" });
        if (at("vill") >= 0) notes.push({ start: at("vill"), end: at("vill") + 4, code: "S005", msg: "Rita á 'vill' sem 'vil'", suggest: "vil" });
        return { sentences: 3, annotations: notes, kept: false };
      },
    };
  });
  await tapIn("#writego");
  await page.waitForFunction(() => { const b = document.getElementById("wr-check"); return b && !b.hidden; }, { timeout: 3000 })
    .catch(() => ok(false, "item 46: with the check on, 'Lesa yfir' did not appear"));
  const mode2 = await page.evaluate(() => document.getElementById("wr-mode").innerText);
  ok(/sendur á netþjóninn/.test(mode2) && /ekki geymdur/.test(mode2), `item 46: the card must say where the text goes before sending: ${mode2}`);
  await page.focus("#wr-text");
  await page.keyboard.type("Mér langar að fara í sund.\nÉg fór í skólan í gær.\nÉg vill fara heim.");
  await tapIn("#wr-check");
  await page.waitForSelector(".wrnote", { timeout: 3000 }).catch(() => ok(false, "item 46: no remark was shown"));
  const n1 = await page.evaluate(() => ({ head: document.querySelector(".wrnote .eyebrow").innerText,
    mark: (document.querySelector(".wrnote mark") || {}).textContent, sent: window.__sent[0],
    box: document.getElementById("wr-text").value }));
  ok(/Athugasemd 1 af 3/.test(n1.head) && n1.mark === "Mér", `item 46: first remark ${n1.head} / ${n1.mark}`);
  ok(n1.sent === n1.box && !/\n/.test(n1.sent), "item 46: the text sent is not the tidied text in the box");
  await tapIn("#wr-fix");
  const sel = await page.evaluate(() => { const b = document.getElementById("wr-text"); return b.value.slice(b.selectionStart, b.selectionEnd); });
  ok(sel === "Mér", `item 46: 'Laga í textanum' should select the stretch: "${sel}"`);
  await page.keyboard.type("Mig");
  const n2 = await page.evaluate(() => ({ head: document.querySelector(".wrnote .eyebrow").innerText, mark: (document.querySelector(".wrnote mark") || {}).textContent }));
  ok(/Athugasemd 2 af 3/.test(n2.head) && n2.mark === "skólan", `item 46: after the fix the next remark: ${n2.head} / ${n2.mark}`);
  await tapIn("#wr-skip");
  const n3 = await page.evaluate(() => (document.querySelector(".wrnote mark") || {}).textContent);
  ok(n3 === "vill", `item 46: 'Sleppa' should go to the third: ${n3}`);
  await tapIn("#wr-fix");
  await page.keyboard.type("vil");
  const fin = await page.evaluate(() => ({ notes: document.getElementById("wr-notes").innerText, box: document.getElementById("wr-text").value }));
  ok(/lagaðir 2 og slepptir 1/.test(fin.notes), `item 46: the summary after the remarks: ${fin.notes}`);
  ok(fin.box === "Mig langar að fara í sund. Ég fór í skólan í gær. Ég vil fara heim.", `item 46: the text after fixing: ${fin.box}`);
  await tapIn("#wr-check");
  await page.waitForFunction(() => /Athugasemd 1 af 1/.test((document.querySelector(".wrnote .eyebrow") || {}).innerText || ""), { timeout: 3000 })
    .catch(() => ok(false, "item 46: reading over again did not show the one remark left"));
  ok(errors.length === 0, `item 46: errors: ${errors.join(" | ")}`);
  await page.close();
}

/* ---------- item 17: with no server there is no calibration at all ----------
 * Opened from a file the program must run on exactly what it was built with:
 * no table, the build's own scores in the lexicon, no question marked for
 * counting and nothing queued to be sent anywhere. */
{
  const page = await browser.newPage();
  await page.goto(FILE, { waitUntil: "domcontentloaded" });
  await startPractice(page, 15000);
  const st = await page.evaluate(() => {
    const A = window.FALLASKOLI;
    const marked = [];
    for (let k = 0; k < 12 && A.run; k++) { marked.push(A.cur && A.cur.calBand); A.finish({ correct: true }); A.next(); }
    A.flushAnswers();
    return { server: !!A.server, cal: A.cal, info: A.calInfo, viewCal: A.viewCal(), marked,
      queued: A.calQueue.length + A.calSamples.length,
      adjusted: (A.lex.nouns || []).filter((w) => w.irrBuilt !== undefined).length };
  });
  ok(st.server === false && st.cal === null && st.info === null && st.viewCal === null,
    "a program with no server has a calibration table: " + JSON.stringify({ cal: st.cal, info: st.info }));
  ok(st.marked.every((b) => b == null), "a question was marked for counting with no server: " + st.marked);
  ok(st.queued === 0, "answers were queued for a server that does not exist");
  ok(st.adjusted === 0, `${st.adjusted} words carry a calibrated score with no server`);
  await page.close();
}

/* ---------- item 83: the skill map ------------------------------------------
 * Framvinda is one map: a ring per curriculum node under its category and
 * year, locked where no question asks the material yet. It must fit a 390 px
 * phone and a desktop without sideways scrolling; a ring opens the node; and
 * the node's button starts a session of exactly the node's question types.
 * The four panels the map replaced are gone. */
{
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await page.goto(FILE, { waitUntil: "domcontentloaded" });
  /* A pupil who starts today: the pages before this one share its storage
     and left a pupil hundreds of answers in. Nothing after this needs them. */
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction("window.FALLASKOLI && window.FALLASKOLI.sess && window.FALLASKOLI.lex", { timeout: 15000 });
  const fresh = await page.evaluate(() => window.FALLASKOLI.S.totalAnswers);
  ok(fresh === 0, `the skill map's pupil should start with nothing answered: ${fresh}`);
  const REVIEW = "c:fill|ÞGFFT|hestur|kk";
  /* This block has a page of its own, so its own real click (see `tap`). */
  const tap = async (selector) => {
    const box = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      el.scrollIntoView({ block: "center" });
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, selector);
    if (!box) { ok(false, `nothing to click at ${selector}`); return; }
    await page.mouse.click(box.x, box.y);
  };
  const dismissModalsOn = async (pg) => {
    for (let i = 0; i < 80 && (await pg.$(".scrim")); i++) {
      await pg.evaluate(() => { const b = document.getElementById("badgeok"); if (b) b.click(); });
      await new Promise((r) => setTimeout(r, 30));
    }
  };
  /* A pupil with a little history: Föllin fjögur answered three days ago,
     þolfall/þágufall going wrong, one review due there; and a past-tense
     record for the node that is one feature of the verb types. */
  await page.evaluate((key) => {
    const A = window.FALLASKOLI, S = A.S;
    const day = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
    const today = day(Date.now()), at = Date.now() - 3 * 86400000;
    S.byType.fill = { n: 12, c: 7, h: "AAaAaAaAAaAa", at };
    S.byNode["so-tid"] = { n: 10, c: 10, h: "AAAAAAAAAA", at: Date.now() };
    S.diag.thf_thgf = { n: 14, w: 10, h: "0000000000", last: today, ex: [] };
    S.diag.broddar = { n: 9, w: 3, h: "110110111", last: today, ex: [] };
    S.cells["ÞGFFT"] = { c: 2, w: 5 }; S.cells.NFET = { c: 9, w: 0 };
    S.review.items.push({ k: key, t: "fill", sk: "nafnord", p: "thf_thgf", c: "ÞGFFT", w: "hestur|kk", i: null,
      s: 0, due: today, add: today, last: today, l: 2, ok: 0 });
    A.openView("map");
  }, REVIEW);
  await page.waitForSelector("#skillmap .smnode", { timeout: 5000 });

  const open = NODES.filter((n) => n.types.length), locked = NODES.filter((n) => !n.types.length);
  const readMap = () => page.evaluate(() => {
    const board = document.querySelector("#skillmap .skillboard");
    const nodes = [...document.querySelectorAll("#skillmap .smtrail .smnode")];
    const box = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), r: Math.round(r.right) }; };
    const foll = document.querySelector('#skillmap .smtrail .smnode[data-node="no-foll"]');
    return {
      overflow: document.documentElement.scrollWidth - innerWidth,
      board: box(board), ids: nodes.map((n) => n.dataset.node),
      locked: nodes.filter((n) => n.classList.contains("locked")).map((n) => n.dataset.node),
      unlabelled: nodes.filter((n) => !(n.getAttribute("aria-label") || "").includes(n.querySelector("b").innerText.trim())).length,
      rings: nodes.filter((n) => !n.querySelector("svg.smring")).length,
      small: nodes.map(box).filter((b) => b.h < 44).length,
      outside: nodes.map(box).filter((b) => b.x < 0 || b.r > innerWidth + 1).length,
      lanes: [...document.querySelectorAll("#skillmap .smlane")].map((l) => box(l).x),
      years: [...document.querySelectorAll("#skillmap .smyear")].map((y) => y.innerText.trim()),
      foll: foll && { text: foll.innerText.replace(/\s+/g, " ").trim(), label: foll.getAttribute("aria-label"),
        flag: foll.querySelector(".smflag")?.innerText.trim() || "", level: foll.dataset.level },
      tid: document.querySelector('#skillmap .smnode[data-node="so-tid"]')?.dataset.level,
      next: [...document.querySelectorAll("#skillmap .smnextbtn")].map((b) => b.dataset.node),
      loose: document.querySelector("#loosepatterns")?.innerText || "",
      old: ["skillgrid", "diaglist", "heat", "wordlist"].filter((id) => document.getElementById(id)),
      heads: [...document.querySelectorAll("#view-map h2, #pane-stats h2")].map((h) => h.innerText.trim()),
    };
  });
  const m = await readMap();
  ok(m.overflow <= 1, `the skill map scrolls sideways at 390 px by ${m.overflow}px`);
  ok(m.board.x >= 0 && m.board.r <= 391, `the board does not fit a 390 px phone: ${JSON.stringify(m.board)}`);
  ok(JSON.stringify([...m.ids].sort()) === JSON.stringify(NODES.map((n) => n.id).sort()),
    `the map should draw every curriculum node once: ${m.ids.length} of ${NODES.length}`);
  ok(JSON.stringify([...m.locked].sort()) === JSON.stringify(locked.map((n) => n.id).sort()),
    `the locked nodes should be exactly those without questions: ${m.locked}`);
  ok(m.unlabelled === 0 && m.rings === 0, `${m.unlabelled} nodes without a spoken label, ${m.rings} without a ring`);
  ok(m.small === 0 && m.outside === 0, `${m.small} nodes are smaller than a finger (44 px), ${m.outside} reach outside the screen`);
  ok(new Set(m.lanes).size === 1, `on a phone the categories should stack in one column: ${[...new Set(m.lanes)]}`);
  ok(["8. BEKKUR", "9. BEKKUR", "10. BEKKUR"].every((y) => m.years.some((x) => x.toUpperCase() === y)), `the years are not named on the trails: ${[...new Set(m.years)]}`);
  ok(m.foll && m.foll.level === "1" && m.foll.flag === "1" && /Þarf æfingu · fyrir 3 dögum/.test(m.foll.text),
    `Föllin fjögur should show its mark, when it was last trained and one review due: ${JSON.stringify(m.foll)}`);
  ok(m.foll && /Vald: Þarf æfingu\. Síðast æft fyrir 3 dögum\. Bíður þín: 1 atriði bíður upprifjunar · 1 villumynstur algengt núna\./.test(m.foll.label),
    `the node's label should say the three facts: ${m.foll && m.foll.label}`);
  ok(m.tid === "4" || m.tid === "3", `Nútíð og þátíð should read its own record: mark ${m.tid}`);
  ok(m.next[0] === "no-foll", `"Byrjaðu hér" should name the node with a review due: ${m.next}`);
  ok(/Broddar|brodd/i.test(m.loose) && !/Þolfall og þágufall/.test(m.loose), `the patterns of no node belong under the map, the others on their nodes: ${m.loose.slice(0, 120)}`);
  ok(m.old.length === 0 && !m.heads.some((h) => /Styrkleikar|Villumynstur|Hvar liggja|Orð sem þarf/.test(h)),
    `the panels the map replaced are still there: ${m.old} ${m.heads}`);

  /* A ring opens the node. */
  await tap('#skillmap .smtrail .smnode[data-node="no-foll"]');
  await page.waitForSelector('.smpanel[data-panel="no-foll"]', { timeout: 4000 });
  const panel = await page.evaluate(() => {
    const p = document.querySelector(".smpanel"), r = p.getBoundingClientRect();
    return { text: p.innerText.replace(/\s+/g, " "), fits: r.left >= 0 && r.right <= innerWidth + 1,
      overflow: document.documentElement.scrollWidth - innerWidth,
      facts: p.querySelectorAll(".smfact").length, rule: !!p.querySelector(".smrule"),
      patterns: [...p.querySelectorAll(".smpatterns li b")].map((b) => b.innerText),
      cells: [...p.querySelectorAll(".smcells li b")].map((b) => b.innerText),
      grid: p.querySelectorAll(".smgrid table.heat td").length,
      words: [...p.querySelectorAll(".smwords .chip")].map((c) => c.innerText.replace(/\s+/g, " ")),
      lesson: p.querySelector("[data-lesson]")?.dataset.lesson, go: p.querySelector("[data-nodego]")?.innerText || "",
      title: document.querySelector(".scrim .sheethead h3")?.innerText || "" };
  });
  ok(panel.fits && panel.overflow <= 1, "the opened node does not fit a 390 px phone");
  ok(/Föllin fjögur/.test(panel.title) && panel.facts === 3 && /Hve vel\?.*Síðast æft.*Bíður þín/.test(panel.text),
    `the opened node should say the three facts: ${panel.title} / ${panel.text.slice(0, 160)}`);
  ok(panel.rule && panel.patterns.includes("Þolfall og þágufall ruglast"), `the node should show its rule and its error pattern: ${panel.patterns}`);
  ok(panel.cells[0] === "þágufall, fleirtala, án greinis" && panel.grid === 16, `the worst cells and the noun table: ${panel.cells} / ${panel.grid} cells`);
  ok(panel.words.length === 1 && /hestur/.test(panel.words[0]), `the words waiting: ${panel.words}`);
  ok(panel.lesson === "foll" && /Æfa þetta · 10 spurningar/.test(panel.go), `a Lesefni link and the button: ${panel.lesson} / ${panel.go}`);

  /* Its button starts a session of exactly the node's question types,
     opening with the node's own review. */
  await tap(".smpanel [data-nodego]");
  await page.waitForFunction("window.FALLASKOLI.run && window.FALLASKOLI.cur && !document.querySelector('.smpanel')", { timeout: 5000 });
  const want = NODES.find((n) => n.id === "no-foll").types;
  const run = await page.evaluate(() => {
    const A = window.FALLASKOLI;
    const out = { n: A.run.n, types: [...A.run.types], label: document.querySelector("#runbar")?.innerText || "",
      view: !document.getElementById("view-practice").hidden, first: A.cur.review || null, firstWord: A.cur.word, asked: [] };
    for (let k = 0; k < 10 && A.run; k++) { out.asked.push(A.cur.typeId); A.finish({ correct: true }); A.next(); }
    out.done = !A.run || !!A.runDone;
    return out;
  });
  ok(run.view && run.n === 10 && JSON.stringify([...run.types].sort()) === JSON.stringify([...want].sort()),
    `the node's button should start ten questions of its types (${want}): ${JSON.stringify({ n: run.n, types: run.types })}`);
  ok(run.asked.length === 10 && run.asked.every((t) => want.includes(t)), `a question of another type was asked in the node's session: ${run.asked}`);
  ok(run.first === REVIEW && run.firstWord === "hestur|kk", `the session should open with the node's own review: ${run.first} ${run.firstWord}`);
  ok(/Föllin fjögur/.test(run.label), `the bar should name the node: ${run.label}`);
  await page.evaluate(() => { const A = window.FALLASKOLI; A.run = null; A.runDone = null; A.next(); });
  await dismissModalsOn(page);

  /* A node that is one feature of its types asks that feature only. */
  const tid = await page.evaluate(() => {
    const A = window.FALLASKOLI;
    A.practiseNode("so-tid");
    const out = { types: [...A.run.types], asked: [] };
    for (let k = 0; k < 10 && A.run; k++) { out.asked.push([A.cur.typeId, A.cur.type, A.cur.cell || ""]); A.finish({ correct: true }); A.next(); }
    A.run = null; A.runDone = null; A.next();
    return out;
  });
  const tidTypes = NODES.find((n) => n.id === "so-tid").types;
  ok(tid.asked.length === 10 && tid.asked.every(([t]) => tidTypes.includes(t)), `Nútíð og þátíð asked another type: ${JSON.stringify(tid.asked)}`);
  ok(tid.asked.filter(([, type]) => type !== "table").every(([, , cell]) => /ÞT/.test(cell)), `Nútíð og þátíð asked something that is not the past tense: ${JSON.stringify(tid.asked)}`);
  await dismissModalsOn(page);

  /* A locked node opens, says so, and starts nothing. */
  await page.evaluate(() => { window.FALLASKOLI.openView("map"); });
  await tap(`#skillmap .smtrail .smnode[data-node="${locked[0].id}"]`);
  await page.waitForSelector(".smpanel.locked", { timeout: 4000 });
  const lock = await page.evaluate(() => ({ text: document.querySelector(".smpanel").innerText, go: !!document.querySelector(".smpanel [data-nodego]") }));
  ok(/Læst/.test(lock.text) && /Engar spurningar/.test(lock.text) && !lock.go, `a locked node should say so and offer no session: ${lock.text.slice(0, 120)}`);
  await page.keyboard.press("Escape");
  await page.waitForFunction("!document.querySelector('.smpanel')", { timeout: 3000 }).catch(() => ok(false, "Escape did not close the node"));
  const back = await page.evaluate(() => document.activeElement && document.activeElement.dataset.node);
  ok(back === locked[0].id, `focus should return to the ring the node was opened from: ${back}`);

  /* The Lesefni link of a node opens the page. */
  await tap('#skillmap .smtrail .smnode[data-node="no-foll"]');
  await page.waitForSelector(".smpanel [data-lesson]", { timeout: 4000 });
  await tap(".smpanel [data-lesson]");
  await page.waitForFunction("!document.getElementById('view-lessons').hidden && !document.querySelector('.smpanel')", { timeout: 4000 })
    .catch(() => ok(false, "the node's Lesefni link did not open Lesefni"));

  /* A desktop: the same map in columns, and still no sideways scrolling. */
  await page.setViewport({ width: 1280, height: 900 });
  await page.evaluate(() => { window.FALLASKOLI.openView("map"); });
  await new Promise((r) => setTimeout(r, 200));
  const d = await readMap();
  ok(d.overflow <= 1 && d.outside === 0, `the skill map scrolls sideways at 1280 px by ${d.overflow}px`);
  ok(new Set(d.lanes).size >= 2, `on a desktop the categories should stand in columns: ${[...new Set(d.lanes)]}`);
  ok(d.ids.length === NODES.length && d.foll.flag === "1", "the desktop map lost nodes or the flag");
  await tap('#skillmap .smtrail .smnode[data-node="no-foll"]');
  await page.waitForSelector('.smpanel[data-panel="no-foll"]', { timeout: 4000 });
  ok(await page.evaluate(() => { const r = document.querySelector(".smpanel").getBoundingClientRect(); return r.width > 300 && r.right <= innerWidth; }),
    "the opened node does not fit the desktop");
  ok(open.length > 30 && errors.length === 0, `errors while the skill map was used: ${errors.join(" | ")}`);
  await page.close();
}

/* ---------- item 25: the structure hint on „Smelltu á rétta orðið“ ----------
 * "Vísbending" marks the sentence's structure in the picker — every part but
 * the one asked for — each with its own colour, kind of line and name. The
 * words stay clickable, nothing runs off a phone's screen, the colours are
 * chalk on the board and ink on paper, and after the answer the asked part
 * is marked as well. */
{
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await page.goto(FILE, { waitUntil: "domcontentloaded" });
  await startPractice(page, 15000);
  const got = await page.evaluate(() => {
    const A = window.FALLASKOLI;
    document.querySelectorAll(".tour, .scrim").forEach((x) => x.remove());
    A.S.enabled.setningafraedi = true; A.reloadPolicy();
    A.run = null; A.runDone = null; A.drill = null; A.drillDone = null;
    A.startRun("setningafraedi", 100000);
    /* item 26: at þyngd 3–5 the hint is offered (at 1–2 it is shown from the start) */
    A.sess.diff.setningafraedi = 4;
    /* a sentence with a clause in it, so that a box is on the screen too */
    for (let i = 0; i < 3000 && A.run; i++) {
      A.next();
      const c = A.cur;
      if (c && c.type === "syntax" && (c.s.cl || []).length && document.getElementById("hint")) break;
    }
    const c = A.cur;
    if (!c || c.type !== "syntax" || !document.getElementById("hint")) return null;
    return { role: c.askRole, words: c.s.tok.filter((t) => !/^[.,!?;:]$/.test(t.w)).length,
      marksBefore: document.querySelectorAll("#picker .sc, #picker .sc-clause").length };
  });
  ok(got, "no „Smelltu á rétta orðið“ question with a hint button appeared");
  if (got) {
    ok(got.marksBefore === 0, "the structure is marked before the hint is asked for");
    await page.evaluate(() => document.getElementById("hint").click());
    const h = await page.evaluate(() => {
      const names = [...document.querySelectorAll("#picker .sc-name")].map((x) => x.textContent);
      const pick = document.getElementById("picker").getBoundingClientRect();
      const out = [...document.querySelectorAll("#picker .sc, #picker .sc-clause, #picker .sc-name")]
        .filter((x) => { const r = x.getBoundingClientRect(); return r.right > innerWidth + 1 || r.left < -1; }).length;
      const line = (cls) => { const e = document.querySelector(`#picker .${cls} .sc-w`); if (!e) return null;
        const cs = getComputedStyle(e); return [cs.borderBottomStyle, cs.borderTopStyle, cs.borderBottomLeftRadius, cs.textDecorationStyle].join("/"); };
      const name = document.querySelector("#picker .sc-name");
      const onBoard = name ? getComputedStyle(name).color : null;
      /* the same mark on paper: inside the verdict, the note held to the board */
      let onPaper = null;
      const v = document.querySelector("#verdict .verdict");
      if (name && v) { const c = name.closest(".sc").cloneNode(true); v.appendChild(c); onPaper = getComputedStyle(c.querySelector(".sc-name")).color; c.remove(); }
      return { names, boxes: document.querySelectorAll("#picker .sc-clause").length,
        boxNames: [...document.querySelectorAll("#picker .sc-cname")].map((x) => x.textContent),
        words: document.querySelectorAll("#picker .pickw").length, out, wide: pick.width,
        scroll: document.documentElement.scrollWidth - innerWidth,
        verdict: (document.getElementById("verdict").textContent || "").replace(/\s+/g, " "),
        disabled: document.getElementById("hint").disabled, hinted: window.FALLASKOLI.cur.hinted === true,
        lines: ["sc-frumlag", "sc-umsogn", "sc-andlag", "sc-samtenging", "sc-forsetningarlidur"].map(line).filter(Boolean),
        onBoard, onPaper };
    });
    ok(h.names.length > 0 && h.boxes > 0, `the hint marked nothing: ${h.names.length} parts, ${h.boxes} boxes`);
    ok(!h.names.includes(got.role), `the hint marks the ${got.role}, which is what the question asks for`);
    ok(h.boxNames.length === h.boxes && h.boxNames.every((x) => /setning$/.test(x)), "a boxed clause has no name: " + h.boxNames);
    ok(h.words === got.words, `with the hint ${h.words} of ${got.words} words can be clicked`);
    ok(h.out === 0 && h.scroll <= 1, `the marked sentence runs off a 390 px screen (${h.out} marks, ${h.scroll}px)`);
    ok(new Set(h.lines).size === h.lines.length, "two marks are drawn with the same kind of line: " + h.lines.join(" | "));
    ok(h.onBoard && h.onPaper && h.onBoard !== h.onPaper, `the marks have one colour for board and paper: ${h.onBoard} / ${h.onPaper}`);
    ok(/Vísbending/.test(h.verdict) && /helmingi minna XP/.test(h.verdict) && h.disabled && h.hinted,
      "the hint did not say what it is and what it costs: " + h.verdict.slice(0, 120));
    /* answer right: half the XP, and the asked part is now marked too */
    const a = await page.evaluate(() => {
      const A = window.FALLASKOLI, c = A.cur;
      const j = c.s.tok.findIndex((x) => x.r === c.askRole);
      document.querySelector(`#picker .pickw[data-j="${j}"]`).click();
      const sel = document.querySelectorAll("#picker .pickw.sel").length;
      document.getElementById("check").click();
      return { sel, names: [...document.querySelectorAll("#picker .sc-name")].map((x) => x.textContent),
        right: document.querySelectorAll("#picker .pickw.right").length,
        ok: !!document.querySelector("#verdict .verdict.ok"),
        last: A.S.log && A.S.log.length ? A.S.log[A.S.log.length - 1] : null };
    });
    ok(a.sel === 1 && a.ok && a.right >= 1, "a word could not be chosen and answered with the hint open: " + JSON.stringify(a).slice(0, 160));
    ok(a.names.includes(got.role), `after the answer the ${got.role} is still not marked`);
  }
  ok(errors.length === 0, "errors with the structure hint: " + errors.join(" | "));
  await page.close();
}

/* ---------- item 26: the structure hint on every Setningafræði question ------
 * Fading with þyngd: at þyngd 1 the structure is drawn from the start (no
 * button), at 4 it is behind "Vísbending", at 6 it is not there. Checked on
 * the choice, tap and sort questions at a phone's and a desktop's width:
 * nothing asked is marked, the words stay clickable, nothing runs off the
 * screen, half the XP with the button, and after the answer everything is
 * marked. Screenshots go to $SHOTS when it is set. */
for (const [w, h] of [[390, 844], [1100, 900]]) {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewport({ width: w, height: h, isMobile: w < 600, hasTouch: w < 600, deviceScaleFactor: 1 });
  await page.goto(FILE, { waitUntil: "domcontentloaded" });
  await startPractice(page, 15000);
  const shot = async (name) => { if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/26-${w}-${name}.png`, fullPage: true }); };
  /* the next question of one type at one þyngd, with or without a hint */
  const find = (type, band, want) => page.evaluate((type, band, want) => {
    const A = window.FALLASKOLI;
    document.querySelectorAll(".tour, .scrim").forEach((x) => x.remove());
    A.S.enabled.setningafraedi = true; A.reloadPolicy();
    A.run = null; A.runDone = null; A.drill = null; A.drillDone = null;
    A.startRun("setningafraedi", 100000);
    for (let i = 0; i < 3000 && A.run; i++) {
      A.sess.diff.setningafraedi = band;
      A.next();
      const c = A.cur;
      if (c && c.typeId === type && (want === "none" ? !c.coding : c.coding && c.coding.step === want)) break;
    }
    const c = A.cur;
    if (!c || c.typeId !== type) return null;
    const names = [...document.querySelectorAll("#task .sentence .sc-name")].map((x) => x.textContent);
    const out = [...document.querySelectorAll("#task .sentence .sc, #task .sentence .sc-clause")]
      .filter((x) => { const r = x.getBoundingClientRect(); return r.right > innerWidth + 1 || r.left < -1; }).length;
    return { type: c.typeId, step: c.coding ? c.coding.step : null, hide: c.coding ? c.coding.hide : [], names,
      boxes: document.querySelectorAll("#task .sentence .sc-clause").length,
      button: !!document.getElementById("hint"), note: !!document.querySelector("#task .codednote"),
      targets: document.querySelectorAll("#task .sentence .target, #task .sentence .clausemark").length,
      out, scroll: document.documentElement.scrollWidth - innerWidth };
  }, type, band, want);
  const fits = (g, what) => ok(g.out === 0 && g.scroll <= 1, `${what} runs off a ${w} px screen (${g.out} marks, ${g.scroll}px)`);

  /* þyngd 1: setn_hlut, the structure drawn from the start, no roles in it */
  const a = await find("setn_hlut", 1, "shown");
  ok(a, `${w}px: no „Hvaða setningarhluti?“ with the structure shown at þyngd 1`);
  if (a) {
    ok(!a.button && a.note && a.names.length + a.boxes > 0 && a.targets === 1, `${w}px: þyngd 1 does not show the structure plainly: ` + JSON.stringify(a));
    ok(!a.names.some((n) => ["frumlag", "umsögn", "andlag", "óbeint andlag", "sagnfylling"].includes(n)), `${w}px: a setningarhluti is marked on „Hvaða setningarhluti?“: ${a.names}`);
    fits(a, "setn_hlut");
    await shot("setn_hlut-shown");
    const r = await page.evaluate(() => {
      const c = window.FALLASKOLI.cur;
      [...document.querySelectorAll(".opts button")].find((b) => b.textContent === c.answer).click();
      document.getElementById("check").click();
      const rec = window.FALLASKOLI.S.log ? window.FALLASKOLI.S.log[window.FALLASKOLI.S.log.length - 1] : null;
      return { ok: !!document.querySelector("#verdict .verdict.ok"), answer: c.answer, hinted: !!c.hinted,
        names: [...document.querySelectorAll("#task .sentence .sc-name")].map((x) => x.textContent),
        target: document.querySelectorAll("#task .sentence .target").length };
    });
    ok(r.ok && !r.hinted && r.target === 1, `${w}px: answering with the structure shown went wrong: ` + JSON.stringify(r));
    await shot("setn_hlut-after");
  }

  /* þyngd 4: lid_finna behind the button; the words stay clickable */
  const b = await find("lid_finna", 4, "offered");
  ok(b, `${w}px: no „Finndu forsetningarliðinn“ with the hint offered at þyngd 4`);
  if (b) {
    ok(b.button && !b.note && b.names.length === 0 && b.boxes === 0, `${w}px: the hint is drawn before it is asked for: ` + JSON.stringify(b));
    const words = await page.evaluate(() => document.querySelectorAll("#picker .pickw").length);
    const g = await page.evaluate(() => {
      document.getElementById("hint").click();
      const out = [...document.querySelectorAll("#picker .sc, #picker .sc-clause")]
        .filter((x) => { const r = x.getBoundingClientRect(); return r.right > innerWidth + 1 || r.left < -1; }).length;
      return { names: [...document.querySelectorAll("#picker .sc-name")].map((x) => x.textContent),
        words: document.querySelectorAll("#picker .pickw").length, out, scroll: document.documentElement.scrollWidth - innerWidth,
        verdict: document.getElementById("verdict").textContent.replace(/\s+/g, " "), disabled: document.getElementById("hint").disabled };
    });
    ok(g.names.length > 0 && !g.names.includes("forsetningarliður"), `${w}px: the lid_finna hint shows ${g.names}`);
    ok(g.words === words && g.disabled && /helmingi minna XP/.test(g.verdict), `${w}px: the lid_finna hint broke the question: ` + JSON.stringify(g).slice(0, 200));
    fits(g, "lid_finna with the hint");
    await shot("lid_finna-hint");
    const r = await page.evaluate(() => {
      const c = window.FALLASKOLI.cur;
      for (const j of c.targets) document.querySelector(`#picker .pickw[data-j="${j}"]`).click();
      const sel = document.querySelectorAll("#picker .pickw.sel").length;
      document.getElementById("check").click();
      return { sel, n: c.targets.length, ok: !!document.querySelector("#verdict .verdict.ok"),
        names: [...document.querySelectorAll("#picker .sc-name")].map((x) => x.textContent),
        right: document.querySelectorAll("#picker .pickw.right").length };
    });
    ok(r.sel === r.n && r.ok && r.right === r.n, `${w}px: lid_finna could not be answered with the hint open: ` + JSON.stringify(r));
    ok(r.names.includes("forsetningarliður"), `${w}px: after the answer the forsetningarliður is not marked`);
    await shot("lid_finna-after");
  }

  /* þyngd 4: setn_flokka behind the button */
  const c = await find("setn_flokka", 4, "offered");
  ok(c, `${w}px: no „Flokkaðu setningarhlutana“ with the hint offered at þyngd 4`);
  if (c) {
    const g = await page.evaluate(() => {
      document.getElementById("hint").click();
      return { names: [...document.querySelectorAll("#task .sentence .sc-name")].map((x) => x.textContent),
        boxes: document.querySelectorAll("#task .sentence .sc-clause").length,
        targets: document.querySelectorAll("#task .sentence .target").length, n: window.FALLASKOLI.cur.items.length };
    });
    ok(g.names.length + g.boxes > 0 && g.targets === g.n, `${w}px: the setn_flokka hint: ` + JSON.stringify(g));
    ok(!g.names.some((n) => ["frumlag", "umsögn", "andlag", "óbeint andlag", "sagnfylling"].includes(n)), `${w}px: a setningarhluti is marked on setn_flokka: ${g.names}`);
    await shot("setn_flokka-hint");
  }

  /* þyngd 6: no hint at all */
  const d = await find("syntax", 6, "none");
  ok(d && d.step === null && !d.button && !d.note && d.names.length === 0, `${w}px: a hint at þyngd 6: ` + JSON.stringify(d));
  ok(errors.length === 0, `${w}px: errors with the Setningafræði hint: ` + errors.join(" | "));
  await page.close();
}

/* ---------- issue 27: „Hver gerði hvað?“ ---------------------------------
 * A sentence, a question and the nouns to choose from. The structure hint
 * follows item 26's rule: drawn from the start at þyngd 1, behind
 * "Vísbending" at 4, absent at 7. After the answer the structure and the
 * explanation are shown at every þyngd. */
{
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await page.goto(FILE, { waitUntil: "domcontentloaded" });
  await startPractice(page, 15000);
  const find = (band, wantHint) => page.evaluate((band, wantHint) => {
    const A = window.FALLASKOLI;
    document.querySelectorAll(".tour, .scrim").forEach((x) => x.remove());
    A.S.enabled.setningafraedi = true; A.reloadPolicy();
    A.run = null; A.runDone = null; A.drill = null; A.drillDone = null;
    A.startRun("setningafraedi", 100000);
    for (let i = 0; i < 3000 && A.run; i++) {
      A.sess.diff.setningafraedi = band;
      A.next();
      const c = A.cur;
      if (c && c.type === "hver" && !!document.getElementById("hint") === wantHint) break;
    }
    const c = A.cur;
    if (!c || c.type !== "hver") return null;
    const sent = document.getElementById("hversent");
    return { coded: !!c.coding && c.coding.step === "shown", step: c.coding ? c.coding.step : null, kind: c.kind, answer: c.answer, options: c.options,
      buttons: [...document.querySelectorAll("#hveropts button")].map((b) => b.textContent),
      marks: sent.querySelectorAll(".sc, .sc-clause").length, bold: sent.querySelectorAll("b").length,
      hint: !!document.getElementById("hint"),
      question: (document.getElementById("hverq").textContent || "").trim(),
      scroll: document.documentElement.scrollWidth - innerWidth };
  }, band, wantHint);

  const first = await find(1, false);
  ok(first, "no „Hver gerði hvað?“ question appeared at þyngd 1");
  if (first) {
    ok(first.kind === "þolmynd", `at þyngd 1 the question is about ${first.kind}, not the passive`);
    ok(first.coded && first.marks > 0 && !first.hint, `at þyngd 1 the structure is not shown from the start (${first.marks} marks, hint ${first.hint})`);
    ok(first.bold >= 2, "the verb asked about is not in bold");
    ok(/^Hver .+\?$/.test(first.question), "no question on the card: " + first.question);
    ok(first.buttons.join("|") === first.options.join("|") && first.buttons[first.buttons.length - 1] === "Það kemur ekki fram",
      "the options are not the nouns and „Það kemur ekki fram“: " + first.buttons.join(" | "));
    ok(first.scroll <= 1, `the card runs off a 390 px screen (${first.scroll}px)`);
    const a = await page.evaluate(() => {
      const A = window.FALLASKOLI, c = A.cur;
      document.getElementById("check").click();
      const pending = /Veldu eitt svar/.test(document.getElementById("verdict").textContent);
      [...document.querySelectorAll("#hveropts button")].find((b) => b.textContent === c.answer).click();
      document.getElementById("check").click();
      return { pending, ok: !!document.querySelector("#verdict .verdict.ok"),
        right: document.querySelectorAll("#hveropts button.right").length,
        why: (document.querySelector("#verdict .why") || {}).textContent || "" };
    });
    ok(a.pending, "„Athuga“ with nothing chosen did not ask for a choice");
    ok(a.ok && a.right === 1, "the right option was not accepted: " + JSON.stringify(a).slice(0, 160));
    ok(/þolmynd/.test(a.why) && /germynd/.test(a.why), "the explanation does not name the passive: " + a.why.slice(0, 160));
  }

  const later = await find(4, true);
  ok(later, "no „Hver gerði hvað?“ question with a hint button appeared at þyngd 4");
  if (later) {
    ok(later.step === "offered" && later.marks === 0, `at þyngd 4 the structure is shown before the hint is asked for (${later.marks} marks)`);
    const h = await page.evaluate(() => {
      document.getElementById("hint").click();
      const sent = document.getElementById("hversent");
      const out = [...sent.querySelectorAll(".sc, .sc-clause, .sc-name")]
        .filter((x) => { const r = x.getBoundingClientRect(); return r.right > innerWidth + 1 || r.left < -1; }).length;
      return { marks: sent.querySelectorAll(".sc, .sc-clause").length, out,
        verdict: (document.getElementById("verdict").textContent || "").replace(/\s+/g, " "),
        disabled: document.getElementById("hint").disabled };
    });
    ok(h.marks > 0 && h.out === 0, `the hint marked nothing or ran off the screen: ${h.marks} marks, ${h.out} outside`);
    ok(/Vísbending/.test(h.verdict) && /helmingi minna XP/.test(h.verdict) && h.disabled, "the hint did not say what it costs: " + h.verdict.slice(0, 120));
    const w = await page.evaluate(() => {
      const A = window.FALLASKOLI, c = A.cur;
      [...document.querySelectorAll("#hveropts button")].find((b) => b.textContent !== c.answer).click();
      document.getElementById("check").click();
      return { no: !!document.querySelector("#verdict .verdict.no"),
        wrong: document.querySelectorAll("#hveropts button.wrongpick").length,
        right: document.querySelectorAll("#hveropts button.right").length,
        marks: document.querySelectorAll("#hversent .sc, #hversent .sc-clause").length,
        text: (document.getElementById("verdict").textContent || "").includes(c.answer) };
    });
    ok(w.no && w.wrong === 1 && w.right === 1 && w.text, "a wrong pick was not shown as wrong beside the right one: " + JSON.stringify(w));
    ok(w.marks > 0, "after the answer the structure is not shown");
  }

  const last = await find(7, false);
  ok(last, "no „Hver gerði hvað?“ question appeared at þyngd 7");
  if (last) {
    ok(last.step === null && last.marks === 0 && !last.hint, `a structure hint at þyngd 7: ${JSON.stringify(last).slice(0, 160)}`);
    const z = await page.evaluate(() => {
      const A = window.FALLASKOLI, c = A.cur;
      [...document.querySelectorAll("#hveropts button")].find((b) => b.textContent === c.answer).click();
      document.getElementById("check").click();
      return { ok: !!document.querySelector("#verdict .verdict.ok"),
        marks: document.querySelectorAll("#hversent .sc, #hversent .sc-clause").length };
    });
    ok(z.ok && z.marks > 0, "at þyngd 7 the structure is not shown with the explanation: " + JSON.stringify(z));
  }
  ok(errors.length === 0, "errors in „Hver gerði hvað?“: " + errors.join(" | "));
  await page.close();
}

/* ---------- #48: a server-graded answer waits for the server, once ----------
 * No real type is server-graded yet: a meaning question is turned into a
 * made-up one in the page, and `app.serverRead` is a fake reader. Checked:
 * the reading state, the checklist and its one question, one revision, ONE
 * `app.finish`, a second click ignored while reading, and "not judged". */
{
  const p = await browser.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(FILE);
  await p.waitForFunction("window.FALLASKOLI && window.FALLASKOLI.sess", { timeout: 60000 });
  const toMeaning = () => p.evaluate(() => {
    const A = window.FALLASKOLI;
    /* The fifth question of a rescue drill is the meaning question. */
    A.startDrill("hestur|kk");
    if (A.drill) { A.drill.turn = 4; A.next(); }
    const t = A.cur;
    if (!t || t.type !== "meaning" || t.grader) return false;
    Object.assign(t, { grader: "server", typeId: "fixture_server", read: { kind: "fixture", context: null },
      rubric: { main: "meaning", points: [
        { id: "meaning", label: "Merkingin er rétt", ask: "Hvað þýðir orðið?" },
        { id: "own", label: "Með þínum eigin orðum", ask: "Segðu það með þínum orðum." }] } });
    window.__finishes = 0;
    if (!A.__wrapped) {
      const f = A.finish.bind(A);
      A.finish = (x) => { window.__finishes++; return f(x); };
      A.__wrapped = true;
    }
    return true;
  });
  const send = (text, twice = false) => p.evaluate((text, twice) => {
    document.getElementById("freetext").value = text;
    document.getElementById("check").click();
    if (twice) document.getElementById("check").click();
    return document.querySelector("#verdict").textContent;
  }, text, twice);
  if (!(await toMeaning())) ok(false, "#48: no meaning question to stand in for a server-graded one");
  else {
    await p.evaluate(() => {
      window.__reads = 0;
      window.FALLASKOLI.serverRead = (req) => new Promise((ok) => setTimeout(() => {
        window.__reads++;
        ok({ findings: [{ point: "meaning", met: /dýr/.test(req.text) }, { point: "own", met: req.text.split(" ").length > 3 }] });
      }, 150));
    });
    const reading = await send("Hann hleypur", true);
    ok(/Les svarið yfir/.test(reading), "#48: no 'reading' state while the server reads: " + reading);
    await p.waitForSelector("#verdict .revise", { timeout: 5000 });
    const rev = await p.evaluate(() => ({
      items: document.querySelectorAll("#verdict .checklist li").length,
      ask: document.querySelector("#verdict .ask")?.textContent, box: !document.getElementById("freetext").disabled,
      reads: window.__reads, fin: window.__finishes }));
    ok(rev.items === 2 && rev.ask === "Hvað þýðir orðið?" && rev.box && rev.reads === 1 && rev.fin === 0,
      "#48: the first reading did not offer one revision: " + JSON.stringify(rev));
    await send("Hestur er stórt dýr á bæ");
    await p.waitForFunction("window.__finishes > 0", { timeout: 5000 });
    await new Promise((r) => setTimeout(r, 300));
    const end = await p.evaluate(() => {
      const A = window.FALLASKOLI;
      const h = (A.S.wordKnowledge || {})[A.cur.word];
      return { fin: window.__finishes, reads: window.__reads, ok: !!document.querySelector("#verdict .verdict.ok"),
        next: document.getElementById("check").textContent, locked: document.getElementById("freetext").disabled,
        last: h && h.e[h.e.length - 1] };
    });
    ok(end.fin === 1 && end.reads === 2 && end.ok && /Áfram/.test(end.next) && end.locked,
      "#48: the revision did not end the question once: " + JSON.stringify(end));
    ok(end.last && end.last[1] === "fixture_server" && end.last[2] === "r", "#48: no right word entry: " + JSON.stringify(end.last));

    /* The grader down: "not judged", after one retry. */
    await p.evaluate(() => { window.FALLASKOLI.stopDrill(); });
    if (await toMeaning()) {
      await p.evaluate(() => { window.__reads = 0;
        window.FALLASKOLI.serverRead = async () => { window.__reads++; return { fault: "unavailable" }; }; });
      await send("Hestur er dýr");
      await p.waitForFunction("window.__finishes > 0", { timeout: 5000 });
      const nj = await p.evaluate(() => ({ fin: window.__finishes, reads: window.__reads,
        text: document.querySelector("#verdict").textContent }));
      ok(nj.fin === 1 && nj.reads === 2 && /Ekki tókst að lesa svarið yfir/.test(nj.text),
        "#48: the grader down did not end as 'not judged': " + JSON.stringify(nj));
    } else ok(false, "#48: no second meaning question");
  }
  ok(errors.length === 0, "#48: errors on the server-graded path: " + errors.join(" | "));
  await p.close();
}

/* ---------- Issue #15: the Orðakort --------------------------------------
 *
 * A new pupil starts Lota dagsins from the picker: the card of the first
 * word comes first and cannot be left; the definition is off the screen
 * while the explanation is chosen; when the card is finished it is saved,
 * the word is in learning and the session starts. "Orðin mín" then offers
 * the next cards until six words are in. */
{
  const p = await browser.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.setViewport({ width: 1100, height: 900 });
  await p.goto(FILE, { waitUntil: "domcontentloaded" });
  await p.waitForFunction("window.FALLASKOLI && window.FALLASKOLI.sess && document.querySelector('#task .card')", { timeout: 20000 });

  const opened = await p.evaluate(() => {
    const A = window.FALLASKOLI;
    document.querySelectorAll(".scrim").forEach((s) => s.remove());
    const before = { learning: Object.keys(A.S.learning).length, due: A.cardDue() };
    (document.getElementById("todaystart") || document.getElementById("runstart")).click();
    const card = document.querySelector(".okort");
    const out = { before, card: !!card, run: !!A.run, x: !!document.querySelector(".okort .sheetx, .okort [aria-label=Loka]"),
      word: card ? card.querySelector(".wcword").textContent : "", step: card ? card.querySelector(".wcstep").textContent : "",
      def: card && card.querySelector(".wcdef") ? card.querySelector(".wcdef").textContent : "",
      heads: card ? [...card.querySelectorAll(".wcsec h4")].map((h) => h.textContent) : [],
      syllables: card && card.querySelector(".wcsyl") ? card.querySelector(".wcsyl").textContent.replace(/\s+/g, " ").trim() : "",
      focus: document.activeElement && document.activeElement.textContent };
    /* No way out: Escape, and a click beside the card. */
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    const scrim = document.querySelector(".wcscrim");
    if (scrim) scrim.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    out.still = !!document.querySelector(".okort");
    return out;
  });
  ok(opened.before.learning === 0 && opened.before.due === "einnig|ao", "#15: a new pupil's first card is not einnig: " + JSON.stringify(opened.before));
  ok(opened.card && !opened.run, "#15: starting Lota dagsins did not show the card first: " + JSON.stringify(opened));
  ok(!opened.x && opened.still, "#15: the card can be closed (a ✕, Escape or a click beside it)");
  ok(opened.word === "einnig" && /^Skref 1 af \d$/.test(opened.step), "#15: the card's head: " + JSON.stringify(opened));
  ok(opened.def === "auk þess, líka, jafnframt" && opened.heads.join("|") === "Skýring|Dæmi|Atkvæði|Beyging",
    "#15: the read step does not show definition, sentence, syllables and inflection: " + JSON.stringify(opened));
  ok(opened.syllables === "einn · ig 2 atkvæði", `#15: the syllables: "${opened.syllables}"`);
  ok(/Áfram/.test(opened.focus || ""), "#15: the keyboard is not on the card's button");

  /* Walk a card to its end, in the page. `pick`: which option to tap in a
     single-choice step (0 = the first, "right" = the right one is not known
     to the page, so the first is tapped and the marks are read). */
  const walk = () => p.evaluate(() => {
    const log = [];
    const card = () => document.querySelector(".okort");
    for (let guard = 0; guard < 30 && card(); guard++) {
      const body = card().querySelector(".wcbody"), id = body.dataset.step;
      const opts = [...body.querySelectorAll(".wcopts button")];
      const next = body.querySelector("[data-wc=next]");
      const entry = { id, text: card().innerText, defOnScreen: !!body.querySelector(".wcdef"), options: opts.map((b) => b.textContent) };
      if (id === "lesa") { log.push(entry); next.click(); continue; }
      if (id === "mat") { log.push(entry); opts[1].click(); continue; }
      const multi = !!body.querySelector(".wcopts.multi");
      opts[0].click();
      if (multi) body.querySelector("[data-wc=check]").click();
      entry.right = body.querySelectorAll(".wcopts .right").length;
      entry.locked = opts.every((b) => b.disabled);
      entry.why = (body.querySelector(".wcwhy") || {}).textContent || "";
      entry.button = body.querySelector("[data-wc=next]").textContent;
      log.push(entry);
      body.querySelector("[data-wc=next]").click();
    }
    const A = window.FALLASKOLI;
    return { log, open: !!card(), run: !!A.run, cur: !!A.cur, cards: A.S.wordCards,
      learning: Object.entries(A.S.learning).filter(([, r]) => r.s === "l").map(([k]) => k),
      stored: (JSON.parse(localStorage.getItem("fallaskoli.v5." + A.S.profile.id) || "{}").wordCards) || null };
  });

  const first = await walk();
  const ids = first.log.map((x) => x.id);
  ok(ids.join(",") === "lesa,mat,skyring,skyld,flokkur", "#15: the steps of einnig's card: " + ids.join(","));
  const explain = first.log.find((x) => x.id === "skyring");
  ok(explain && !explain.defOnScreen && explain.options.length === 3
    && explain.options.filter((o) => o === opened.def).length === 1
    && explain.text.split(opened.def).length === 2,
    "#15: the definition is on the screen while the explanation is chosen: " + JSON.stringify(explain));
  ok(first.log.filter((x) => x.right != null).every((x) => x.right >= 1 && x.locked && x.why.length > 10),
    "#15: a choice was not marked, locked and explained: " + JSON.stringify(first.log.filter((x) => x.right != null).map((x) => [x.id, x.right, x.locked, x.why])));
  ok(/^(Rétt!|Ekki alveg\.)\*?einnig/.test((explain || {}).why || ""), "#15: the feedback gives the definition back: " + (explain || {}).why);
  ok(/Ljúka orðakorti/.test(first.log[first.log.length - 1].button) && /Áfram/.test(explain.button), "#15: the last step's button");
  const saved = first.cards["einnig|ao"];
  ok(!first.open && saved && saved.r === 1 && saved.n === 1 && /^\d{4}-\d\d-\d\d$/.test(saved.d)
    && Object.keys(saved.a).join(",") === "skyring,skyld,flokkur" && saved.a.flokkur.c[0] === "no" && saved.a.flokkur.ok === false,
    "#15: the card was not kept with its rating and answers: " + JSON.stringify(saved));
  ok(first.learning.join() === "einnig|ao", "#15: the word did not enter the words in learning: " + first.learning.join());
  ok(first.run && first.cur, "#15: the session did not start after the card");
  ok(first.stored && first.stored["einnig|ao"], "#15: the card is not in the saved progress");

  /* "Orðin mín" offers the next card; six cards, six words, and then none. */
  const six = await p.evaluate(() => {
    const A = window.FALLASKOLI;
    A.openView("progress");
    const words = [];
    for (let n = 0; n < 8; n++) {
      const add = document.getElementById("mywordnew");
      if (!add) break;
      add.click();
      const card = () => document.querySelector(".okort");
      if (!card()) break;
      words.push(card().querySelector(".wcword").textContent);
      for (let guard = 0; guard < 30 && card(); guard++) {
        const body = card().querySelector(".wcbody");
        const opts = [...body.querySelectorAll(".wcopts button")];
        if (body.dataset.step === "lesa") { body.querySelector("[data-wc=next]").click(); continue; }
        opts[opts.length - 1].click();
        const check = body.querySelector("[data-wc=check]");
        if (check) check.click();
        const next = body.querySelector("[data-wc=next]");
        if (next) next.click();
      }
    }
    return { words, chips: [...document.querySelectorAll("#mywords .chip.myword")].map((e) => e.textContent.trim()),
      offer: !!document.getElementById("mywordnew"), due: A.cardDue(), cards: Object.keys(A.S.wordCards).length,
      learning: Object.values(A.S.learning).filter((r) => r.s === "l").length,
      text: document.getElementById("pane-words").innerText };
  });
  ok(six.words.length === 5 && six.learning === 6 && six.cards === 6 && six.chips.length === 6,
    "#15: six cards did not make six words in learning: " + JSON.stringify(six));
  ok(!six.offer && six.due === null, "#15: a seventh card is offered while six words are in learning");
  ok(!/DLD|málþroska/i.test(six.text), "#15: the word pane names DLD");

  /* With six in learning a session starts at once. */
  const direct = await p.evaluate(() => {
    const A = window.FALLASKOLI;
    A.run = null; A.runDone = null; A.cur = null;
    A.startChosen("blandad", 5);
    return { card: !!document.querySelector(".okort"), run: !!A.run };
  });
  ok(!direct.card && direct.run, "#15: a card came though six words are in learning: " + JSON.stringify(direct));
  ok(errors.length === 0, "#15: errors on the Orðakort: " + errors.join(" | "));
  await p.close();
}

/* ---------- Issue #18: the Orðakort back in a review ---------------------
 *
 * A pupil who did útskýra's card and learned the word has its review due.
 * Some reviews (one in REVISIT_RATE, decided by the review entry) are
 * marked to bring the card back: the entry's day is moved until it is one. Answered and "Áfram": the pupil's own card
 * opens, with what they chose; a sentence without the word is refused; a
 * new rating and a sentence are kept, the card's own answers are not
 * touched, and the session goes on. A second Áfram does not open it again. */
{
  const p = await browser.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.setViewport({ width: 1100, height: 900 });
  /* A new pupil: the sections above left their pupils in this file's storage. */
  await p.evaluateOnNewDocument(() => { localStorage.clear(); });
  await p.goto(FILE, { waitUntil: "domcontentloaded" });
  await p.waitForFunction("window.FALLASKOLI && window.FALLASKOLI.sess && document.querySelector('#task .card')", { timeout: 20000 });
  const WORD = "útskýra|so";
  const set = await p.evaluate((WORD) => {
    const A = window.FALLASKOLI;
    document.querySelectorAll(".scrim").forEach((s) => s.remove());
    const d = new Date(), pad = (x) => String(x).padStart(2, "0");
    const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    /* A card with a choice, and two free-text steps (#38) as a pupil with
       server grading on keeps them. */
    A.S.wordCards[WORD] = { d: today, n: 1, r: 1, a: { flokkur: { c: ["no"], ok: false },
      min: { c: [], ok: true, t: "Ég útskýrði leikinn fyrir bróður mínum." },
      tengsl: { c: ["skýra", "útskýring", "flækja"], ok: true, t: "1. skýra – svipað\n2. útskýring – sami stofn\n3. flækja" } } };
    A.S.learning[WORD] = { s: "k", d: today, n: 1 };
    const k = "w:or_eyda|" + WORD;
    /* Only this review is due, so it is the one the session opens with. */
    A.S.review.items = [];
    A.S.review.items.push({ k, t: "or_eyda", sk: "ordaford", p: null, c: null, w: WORD, i: null, s: 0,
      due: today, add: today, last: today, l: 0, ok: 0 });
    let tries = 0, marked = 0, reviews = 0;
    /* Whether a review brings the card back is decided by the entry itself
       (its day due and stage, tasks/review.js): the same review is moved a
       day earlier until it is one that does. */
    const item = A.S.review.items[0];
    for (; tries < 40; tries++) {
      const day = new Date(d.getFullYear(), d.getMonth(), d.getDate() - tries);
      item.due = `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
      A.run = null; A.runDone = null; A.cur = null;
      A.startRun("blandad", 5);
      if (A.cur && A.cur.review === k) reviews++;
      if (A.cur && A.cur.review === k && A.cur.revisit === WORD) { marked++; break; }
    }
    return { tries, reviews, marked, type: A.cur && A.cur.typeId, answer: A.cur && A.cur.answers && A.cur.answers[0] };
  }, WORD);
  ok(set.marked === 1 && set.type === "or_eyda", "#18: no review of the learned word brought its card back on 40 days: " + JSON.stringify(set));
  if (set.marked) {
    await p.type("#ans", set.answer);
    await p.click("#check");
    const opened = await p.evaluate(() => {
      const A = window.FALLASKOLI;
      const before = { cur: A.cur, i: A.run && A.run.i };
      document.getElementById("check").click();          // Áfram
      const card = document.querySelector(".okrevisit");
      return { open: !!card, same: A.cur === before.cur, word: card && card.querySelector(".wcword").textContent,
        eyebrow: card && card.querySelector(".eyebrow").textContent,
        def: card && card.querySelector(".wcdef") ? card.querySelector(".wcdef").textContent : "",
        picks: card ? [...card.querySelectorAll(".wcpick")].map((x) => x.textContent.replace(/\s+/g, " ").trim()) : [],
        pressed: card ? [...card.querySelectorAll(".wcopts button[aria-pressed=true]")].map((b) => b.textContent) : [],
        own: card ? [...card.querySelectorAll("[data-own]")].map((x) => x.dataset.own + ":" + x.querySelectorAll(".wcown").length + ":" + x.querySelector("h4").textContent) : [],
        text: card ? card.innerText : "" };
    });
    ok(opened.open && opened.same && opened.word === "útskýra" && /Orðakortið þitt/.test(opened.eyebrow),
      "#18: Áfram after the review did not open the pupil's own card: " + JSON.stringify(opened));
    ok(opened.def.length > 5, "#18: the card has no definition: " + opened.def);
    ok(opened.picks.length === 1 && /^Nafnorð ✗ Rétt: Sagnorð$/.test(opened.picks[0]),
      "#18: what the pupil chose is not shown with the right answer: " + JSON.stringify(opened.picks));
    ok(opened.own.join() === "min:1:Mín setning,tengsl:3:Skyld orð", "#18: the free-text answers are not shown: " + opened.own.join());
    ok(opened.pressed.join() === "Ég hef heyrt það", "#18: the rating that stands is not marked: " + opened.pressed.join());
    ok(!/DLD|málþroska/i.test(opened.text), "#18: the card names DLD");

    const refused = await p.evaluate(() => {
      const card = document.querySelector(".okrevisit");
      card.querySelector("textarea").value = "Ég fór út í dag.";
      card.querySelector("[data-wc=next]").click();
      return { still: !!document.querySelector(".okrevisit"), msg: card.querySelector(".wcmsg").textContent };
    });
    ok(refused.still && /þarf að vera í setningunni/.test(refused.msg), "#18: a sentence without the word was taken: " + JSON.stringify(refused));

    const kept = await p.evaluate((WORD) => {
      const A = window.FALLASKOLI;
      const card = document.querySelector(".okrevisit");
      card.querySelectorAll(".wcopts button")[2].click();
      card.querySelector("textarea").value = "Kennarinn  útskýrði dæmið.";
      const cur = A.cur;
      card.querySelector("[data-wc=next]").click();
      const stored = (JSON.parse(localStorage.getItem("fallaskoli.v5." + A.S.profile.id) || "{}").wordCards || {})[WORD];
      return { open: !!document.querySelector(".okrevisit"), moved: A.cur !== cur, card: A.S.wordCards[WORD], stored };
    }, WORD);
    const x = (kept.card && kept.card.x) || [];
    ok(!kept.open && kept.moved, "#18: the session did not go on after the card: " + JSON.stringify({ open: kept.open, moved: kept.moved }));
    ok(x.length === 1 && x[0].r === 2 && x[0].s === "Kennarinn útskýrði dæmið." && kept.card.r === 1 && kept.card.n === 1
      && kept.card.a.flokkur.c[0] === "no" && kept.card.a.tengsl.c.length === 3, "#18: the additions were not kept beside the card: " + JSON.stringify(kept.card));
    ok(kept.stored && kept.stored.x && kept.stored.x.length === 1, "#18: the additions are not in the saved progress");

    /* Shown once: the next question's Áfram does not bring it back. */
    const again = await p.evaluate(() => {
      const A = window.FALLASKOLI;
      A.cur.closed = true;
      document.getElementById("check").click();
      return !!document.querySelector(".okrevisit");
    });
    ok(!again, "#18: the card came back on the next question");
  }
  ok(errors.length === 0, "#18: errors on the card back in a review: " + errors.join(" | "));
  await p.close();
}

await browser.close();

console.log(`\n${checks} checks, ${problems.length} problems`);
console.log(`task types seen: ${[...seenTypes].join(", ")}`);
if (problems.length) {
  problems.slice(0, 25).forEach((p) => console.log("  ✗ " + p));
  process.exit(1);
}
console.log("all clear");
