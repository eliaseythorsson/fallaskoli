/* Item 22 (reviews due instead of XP decay), item 55 (settings.audio gone).
   More small items of v6.13 are added below as they land. */
import test from "node:test";
import assert from "node:assert/strict";
import { blankState, migrate } from "../src/js/core/state.js";
import { applyDecay } from "../src/js/core/progress.js";
import { dueLine } from "../src/js/core/review.js";

/* ---------- 22 ---------------------------------------------------------- */

test("22: XP decay is off in a new state and does nothing without being asked", () => {
  const S = blankState();
  assert.equal(S.settings.decay, false);
  S.xp = 4000; S.bestLevel = 4; S.lastActive = "2026-01-01";
  assert.equal(applyDecay(S, "2026-03-01"), null);
  assert.equal(S.xp, 4000);
  delete S.settings.decay;     // a missing value is "off" too, not "on"
  assert.equal(applyDecay(S, "2026-03-01"), null);
});

test("22: a state saved with the old default (decay on) is switched off once", () => {
  const old = { xp: 500, settings: { decay: true, audio: true, glossary: true } };
  const S = migrate(old);
  assert.equal(S.settings.decay, false);
  /* …and a choice made afterwards is kept. */
  S.settings.decay = true;
  const again = migrate(JSON.parse(JSON.stringify(S)));
  assert.equal(again.settings.decay, true);
});

test("22: 'N atriði bíða upprifjunar' agrees in number", () => {
  assert.equal(dueLine(0), "");
  assert.equal(dueLine(1), "1 atriði bíður upprifjunar");
  assert.equal(dueLine(2), "2 atriði bíða upprifjunar");
  assert.equal(dueLine(11), "11 atriði bíða upprifjunar");
  assert.equal(dueLine(12), "12 atriði bíða upprifjunar");
  assert.equal(dueLine(21), "21 atriði bíður upprifjunar");
  assert.equal(dueLine(111), "111 atriði bíða upprifjunar");
});

/* ---------- 55 ---------------------------------------------------------- */

test("55: settings.audio is gone from new and migrated states", () => {
  assert.ok(!("audio" in blankState().settings));
  const S = migrate({ settings: { audio: true, decay: false, settingsRev: 1 } });
  assert.ok(!("audio" in S.settings));
});

/* ---------- 51 ---------------------------------------------------------- */

import { readFileSync } from "node:fs";
const HEAD = readFileSync(new URL("../src/head.html", import.meta.url), "utf8");

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (c) => {
  const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const mix = (fg, bg, a) => fg.map((v, i) => Math.round(v * a + bg[i] * (1 - a)));
/** WCAG 2 contrast ratio of two [r,g,b] colours. */
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const cssVar = (name) => {
  const m = HEAD.match(new RegExp(`${name}:(#[0-9A-Fa-f]{6})`));
  assert.ok(m, `${name} not found in head.html`);
  return rgb(m[1]);
};

test("51: grey text on the green board reaches 4.5:1, on the plain board and on the lightest smear", () => {
  const board = cssVar("--board"), dim = cssVar("--chalk-dim");
  /* The sponge smears lighten the board by at most 5.5 % white. */
  const smear = mix([255, 255, 255], board, 0.055);
  assert.ok(ratio(dim, board) >= 4.5, "gloss on board " + ratio(dim, board));
  assert.ok(ratio(dim, smear) >= 4.5, "gloss on smear " + ratio(dim, smear));
});

test("51: `.faint` and the placeholder on the board stay above 4.5:1", () => {
  const board = cssVar("--board"), dim = cssVar("--chalk-dim"), chalk = cssVar("--chalk");
  const smear = mix([255, 255, 255], board, 0.055);
  const faint = Number(HEAD.match(/\.blackboard \.faint\{opacity:([.\d]+)\}/)?.[1]);
  assert.ok(faint > 0, "a `.blackboard .faint` rule is needed: .faint is .7 and falls to 3.8:1");
  assert.ok(ratio(mix(dim, smear, faint), smear) >= 4.5);
  const ph = Number(HEAD.match(/\.blackboard input::placeholder[^{]*\{color:rgba\(243,241,231,([.\d]+)\)\}/)?.[1]);
  assert.ok(ph > 0);
  const field = mix([255, 255, 255], board, 0.08);     // --sheet inside the board
  assert.ok(ratio(mix(chalk, field, ph), field) >= 4.5, "placeholder " + ratio(mix(chalk, field, ph), field));
});

test("51: the verdict and the session line are live regions", () => {
  const render = readFileSync(new URL("../src/js/ui/render.js", import.meta.url), "utf8");
  assert.match(render, /vd\.setAttribute\("role", "status"\)/);
  const session = readFileSync(new URL("../src/js/ui/session.js", import.meta.url), "utf8");
  assert.match(session, /class="runline" role="status"/);
  assert.match(session, /class="sr-only">\$\{esc\(said\)\}/, "its text must be readable, not aria-hidden");
});

/* ---------- 52 ---------------------------------------------------------- */

test("52: the comfort setting is a switch, off by default, with a class that head.html styles", () => {
  assert.ok(!blankState().settings.comfort, "off until somebody asks");
  assert.equal(migrate({ settings: { comfort: true, settingsRev: 1 } }).settings.comfort, true);
  const body = readFileSync(new URL("../src/body.html", import.meta.url), "utf8");
  assert.match(body, /id="set-comfort"/);
  const rule = HEAD.match(/body\.comfort\{([^}]*)\}/)?.[1] || "";
  assert.match(rule, /--mono:var\(--body\)/, "the proportional face replaces mono");
  assert.match(rule, /letter-spacing:\.0\d+em/, "wider letter spacing");
  assert.match(HEAD, /body\.comfort \.wrap\{zoom:1\.\d+\}/, "larger type");
});

test("52: the server keeps the setting (settings values of boolean type pass the guard)", async () => {
  const { cleanState } = await import("../server/guard.mjs");
  const S = cleanState({ settings: { comfort: true } });
  assert.equal(S.settings.comfort, true);
});

/* ---------- 50 ---------------------------------------------------------- */

test("50: the pupil's editor folds types, levels and features; the administrator's does not", () => {
  const src = readFileSync(new URL("../src/js/ui/policyui.js", import.meta.url), "utf8");
  assert.match(src, /<details class="teacherfold"/);
  assert.match(src, /Fyrir kennara og foreldra/);
  const panels = readFileSync(new URL("../src/js/ui/panels.js", import.meta.url), "utf8");
  assert.match(panels, /teacherFold: true/, "renderSettings asks for the fold");
  const account = readFileSync(new URL("../src/js/ui/account.js", import.meta.url), "utf8");
  assert.doesNotMatch(account, /teacherFold/, "the administrator's editor is unchanged");
});
