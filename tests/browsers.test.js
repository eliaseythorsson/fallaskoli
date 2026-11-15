/* What the file may and may not contain if it is to open on the owner's own
 * machines.
 *
 * Design rule 5, from v5.6: *"The owner's environment is part of the program.
 * The build ran on Linux with Chrome; the owner runs macOS with Safari."* This
 * file is that rule turned into something that fails.
 *
 * It cannot replace running the thing in Safari — nothing can — but it catches
 * the class of mistake that is invisible in Chrome and fatal everywhere else:
 * syntax the other engines reject **while parsing**, which takes the whole
 * program down rather than one feature. There is no test to be written on the
 * day that happens, because nothing runs.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(js|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
}

/* Comments are stripped first. This file is about what the ENGINE has to parse,
   and a paragraph explaining why lookbehind is forbidden must not itself trip
   the test that forbids it. The stripper is crude — it does not understand
   strings containing "/*" — which is fine: it can only ever hide a hit, and a
   hidden hit is caught by the same patterns run against the built bundle in
   tools/browser-test.mjs, where there are no comments left at all. */
const strip = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/^\s*\/\/.*$/gm, " ");

const SRC = walk(path.join(ROOT, "src"))
  .map((p) => ({ p: path.relative(ROOT, p), s: strip(fs.readFileSync(p, "utf8")) }));

test("no regular-expression lookbehind anywhere in the front end", () => {
  /* Lookbehind reached Safari in 16.4 (March 2023). Before that `new
     RegExp("(?<!x)y")` THROWS — not "fails to match", throws, at construction —
     and core/glossary.js builds two of them while the module is being
     evaluated. Every iPad that stopped at iPadOS 15, and every Mac on Safari
     16.3 or older, showed the child a white page and nothing else.

     If a lookbehind is ever genuinely needed, the answer is to consume the
     preceding character and adjust the offset, as `glossify` does. */
  const bad = SRC.filter((f) => /\(\?<[=!]/.test(f.s)).map((f) => f.p);
  assert.deepEqual(bad, [],
    "lookbehind found — this throws at parse time on Safari below 16.4");
});

test("no syntax that only Chrome has", () => {
  /* Each of these is a whole-script or whole-feature failure on an engine the
     owner's family may well be using, and none of them is needed here. */
  const forbidden = [
    [/\.replaceAll\(/, "String.replaceAll — Safari 13.1"],
    [/\bstructuredClone\(/, "structuredClone — Safari 15.4"],
    [/Object\.hasOwn\(/, "Object.hasOwn — Safari 15.4"],
    [/\.findLast(Index)?\(/, "Array.findLast — Safari 15.4"],
    [/Object\.groupBy|\.group\(\s*\(/, "Object.groupBy — Safari 17.4"],
    [/Intl\.Segmenter/, "Intl.Segmenter — Firefox 125"],
    [/navigator\.clipboard/, "the clipboard API needs permission handling"],
    [/showOpenFilePicker|showSaveFilePicker/, "the file-system API is Chrome only"],
    [/\.showModal\(/, "<dialog>.showModal — Safari 15.4"],
    [/requestIdleCallback/, "requestIdleCallback — Safari 18"],
  ];
  const found = [];
  for (const f of SRC) {
    for (const [re, why] of forbidden) {
      if (re.test(f.s)) found.push(`${f.p}: ${why}`);
    }
  }
  assert.deepEqual(found, []);
});

test("the stylesheet does not rely on anything younger than Safari 14.1", () => {
  const css = fs.readFileSync(path.join(ROOT, "src/head.html"), "utf8");
  const forbidden = [
    [/:has\(/, ":has() — Safari 15.4, Firefox 121"],
    [/color-mix\(/, "color-mix() — Safari 16.2"],
    [/\boklch\(|\blch\(/, "oklch() — Safari 15.4"],
    [/^\s*&[ .:>]/m, "CSS nesting — Safari 16.5"],
    [/@container/, "container queries — Safari 16"],
    [/text-wrap:\s*balance/, "text-wrap: balance — Safari 17.5"],
  ];
  const found = forbidden.filter(([re]) => re.test(css)).map(([, why]) => why);
  assert.deepEqual(found, []);
});

test("`inset` always has the four long-hand properties beside it", () => {
  /* `inset` is Safari 14.1. The scrim behind a badge window and the confetti
     canvas both use it, and on Safari 14.0 an ignored `inset` means the scrim
     has no size: the badge window floats over a page that is still clickable,
     and the confetti canvas collapses. The long-hand is understood
     everywhere, costs one line, and cannot be got wrong. */
  const css = fs.readFileSync(path.join(ROOT, "src/head.html"), "utf8");
  for (const m of css.matchAll(/\{([^}]*\binset:[^}]*)\}/g)) {
    const rule = m[1];
    assert.match(rule, /\btop:\s*0/, `an \`inset\` rule with no top: ${rule.trim()}`);
    assert.match(rule, /\bleft:\s*0/, `an \`inset\` rule with no left: ${rule.trim()}`);
  }
});

test("every text input is at least 16px, or iOS zooms on every keystroke", () => {
  /* This one IS checked in a real browser as well (tools/browser-test.mjs at
     phone width). It is here too because the browser check only sees the inputs
     that happen to be on the screen when it looks. */
  const css = fs.readFileSync(path.join(ROOT, "src/head.html"), "utf8");
  const inputRules = [...css.matchAll(/([^{}]*input[^{}]*)\{([^}]*)\}/g)];
  const small = [];
  for (const [, sel, body] of inputRules) {
    const fs_ = /font-size:\s*([\d.]+)px/.exec(body);
    if (fs_ && Number(fs_[1]) < 16 && !/table\.decl|\.keys/.test(sel)) {
      small.push(sel.trim() + " -> " + fs_[1] + "px");
    }
  }
  assert.deepEqual(small, [],
    "a text input under 16px makes iOS Safari zoom the page in as soon as the child types");
});
