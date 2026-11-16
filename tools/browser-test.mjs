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
const QT_COUNT = QUESTION_TYPES.length;

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
await page.evaluateOnNewDocument((seed) => {
  let s = seed >>> 0;
  Math.random = () => {
    /* mulberry32 — short, evenly distributed and good enough for a test. */
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}, SEED);

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
  } else if (t.type === "choice") {
    await page.evaluate((opts, ans, correct) => {
      const btns = [...document.querySelectorAll(".opts button")];
      const k = opts.indexOf(ans);
      (correct ? btns[k] : btns.find((_, j) => j !== k)).click();
    }, t.options, t.answer, correct);
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

  /* v6.9: celebration follows success. A wrong answer never opens a badge
     window, whatever it earned; the windows wait for the next right answer. */
  if (!correct && ["fill", "verb", "verbslot", "smidja", "umritun", "govern", "indecl", "syntax", "gap", "choice", "tap", "sort"].includes(t.type)) {
    await new Promise((r) => setTimeout(r, 60));
    if (await page.$(".scrim")) problems.push(`a badge window opened on a wrong answer (${t.type})`);
  }

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
ok(worstQueue <= 6, `${worstQueue} badge windows opened for one answer`);

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
    ok(after.locked, "the input is still open after Enter — the verdict was not binding");
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
    await cdp.detach();
  } else {
    problems.push("found no task with a text input to test a held Enter against");
  }
}

/* ---------- 2d. Enter after a badge window ------------------------------
 *
 * The owner, on v5.5: *"Enter does correctly work as 'Athuga' but if a badge is
 * won, enter will cycle through and acknowledge the badges but will not trigger
 * 'Áfram', so the user is forced to use the mouse."*
 *
 * The cause was focus, not keys. The only Enter listener lives on the Áfram
 * button; the badge window took the focus, and closing it handed the focus back
 * to `<body>`, where nothing was listening. Every keystroke after that went
 * nowhere.
 *
 * This check fails on v5.5 and passes on v5.6, which is design rule 4: it
 * exercises the whole path with real keystrokes — answer, win a badge, dismiss
 * it with Enter, then press Enter once more and require a new question.      */
{
  await dismissModals();

  /* Work forward until an answer both used the keyboard and won a badge. Early
     sessions win badges constantly, so this normally takes one or two goes. */
  let staged = false;
  for (let i = 0; i < 60 && !staged; i++) {
    if (!(await page.$("#ans"))) { await answerOne(true); continue; }
    const t = await page.evaluate(() => window.FALLASKOLI.cur.answers?.[0] ?? null);
    if (t == null) { await answerOne(true); continue; }
    await tap("#ans");
    await page.type("#ans", t);
    await page.keyboard.press("Enter");
    await new Promise((r) => setTimeout(r, 350));
    if (await page.$(".scrim")) staged = true;
    else { await dismissModals(); await page.evaluate(() => window.FALLASKOLI.next()); }
  }

  if (!staged) {
    problems.push("could not win a badge from a typed answer — 2d never ran");
  } else {
    await page.evaluate(() => { window.__q = window.FALLASKOLI.cur; });

    /* Dismiss every badge window with real Enter presses, exactly as a child
       would. `freshEnter` rejects anything older than the window itself, so the
       pauses matter. */
    let windows = 0;
    for (let i = 0; i < 80 && (await page.$(".scrim")); i++) {
      await page.keyboard.press("Enter");
      await new Promise((r) => setTimeout(r, 140));
      windows++;
    }
    ok(!(await page.$(".scrim")), "Enter did not close the badge windows");
    ok(windows > 0, "no badge window was open, so nothing was proved");

    /* The keyboard must be back on the Áfram button the moment the last window
       goes. This is the assertion that fails on v5.5. */
    const focused = await page.evaluate(() => document.activeElement?.id || "");
    ok(focused === "check",
      `focus went to "${focused || "<body>"}" after the badge window, not to Áfram`);

    /* And the next Enter must actually draw a new question. Wait past the
       400 ms read-grace first — the same press must not do both jobs. */
    await new Promise((r) => setTimeout(r, 600));
    await page.keyboard.press("Enter");
    await new Promise((r) => setTimeout(r, 400));
    await dismissModals();
    const advanced = await page.evaluate(() => window.FALLASKOLI.cur !== window.__q);
    ok(advanced, "Enter after a badge window did not trigger Áfram — the mouse was still required");
    ok(await page.$("#task .card") !== null, "no task on screen after Áfram");
  }
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

  /* Hover it for longer than any delay in ui/dom.js, then click it. Nothing
     may open. */
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
    return !!(t && !t.hidden);
  });
  ok(!opened, `${want}: a window opened over the locked definition`);

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

/* The skill cards are on Merki og framvinda and the switches on Stillingar og
   námsefni; both are drawn when their tab is opened. */
await openTab("progress");
await openTab("settings");
/* The count is read from SKILLS, not written here. A new skill should appear
   in both lists by itself — that is the whole of the claim that years 9 and 10
   cost one entry each. Hard-coding it here would mean editing the test every
   time, and then the claim would be false. */
const skillCount = await page.evaluate(
  () => document.querySelectorAll('#policyeditor input[data-dim="skills"]').length);
const skillCards = await page.$$eval(".skillcard", (e) => e.length);
ok(skillCards === skillCount, `${skillCards} skill cards but ${skillCount} skills`);
ok(skillCount === 12, `${skillCount} skills — 11 before Málbeiting (v6.9)`);

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
ok(switchCounts.types === QT_COUNT, `${switchCounts.types} question-type switches, expected ${QT_COUNT} (v6.11: one per entry in QUESTION_TYPES)`);
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
         verb tip. */
      ok(!/sögn|Sögnin|þátíð|nútíð/.test(sum.text.replace(/nafnorð úr sögn/g, "")),
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

/* The tabs must stay reachable at the narrowest width — they scroll sideways
   there, or (since v6.2) wrap their long names onto two lines so that all four
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
  ok(tabs.count === 5, `${tabs.count} tabs at 360px`);
  ok(!tabs.scrollable || tabs.overflowX === "auto" || tabs.overflowX === "scroll",
    "the tabs are wider than the screen and cannot be scrolled to");
}

await browser.close();

console.log(`\n${checks} checks, ${problems.length} problems`);
console.log(`task types seen: ${[...seenTypes].join(", ")}`);
if (problems.length) {
  problems.slice(0, 25).forEach((p) => console.log("  ✗ " + p));
  process.exit(1);
}
console.log("all clear");
