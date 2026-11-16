/* v6.13, items 2, 47, 48 and 53: the question gets the screen on a phone.

   The layout itself is measured in real Chrome (tools/browser-test.mjs, "the
   question gets the screen"). What can be decided without a browser is
   decided here: when the slim session line replaces the header, and when the
   á ð é í … pad is shown. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { keypadDefault, keypadOn } from "../src/js/ui/dom.js";
import { sessionLayoutOn } from "../src/js/ui/session.js";

test("the letter pad is off at first only on a touch device set to Icelandic", () => {
  assert.equal(keypadDefault({ coarse: true, lang: "is" }), false);
  assert.equal(keypadDefault({ coarse: true, lang: "is-IS" }), false);
  assert.equal(keypadDefault({ coarse: true, lang: "IS-is" }), false);
  assert.equal(keypadDefault({ coarse: true, lang: "is_IS" }), false);
  /* a laptop set to Icelandic: often an English keyboard, and a mouse */
  assert.equal(keypadDefault({ coarse: false, lang: "is-IS" }), true);
  /* a tablet set to English: þ and ð are hard to reach */
  assert.equal(keypadDefault({ coarse: true, lang: "en-GB" }), true);
  /* a language that merely starts with the letters i and s is not Icelandic */
  assert.equal(keypadDefault({ coarse: true, lang: "isv" }), true);
  assert.equal(keypadDefault({}), true);
  assert.equal(keypadDefault(), true);
});

test("once the child has switched the pad, the switch decides", () => {
  const icelandicPhone = { coarse: true, lang: "is-IS" };
  const laptop = { coarse: false, lang: "en-US" };
  assert.equal(keypadOn({}, icelandicPhone), false);
  assert.equal(keypadOn({ keypad: true }, icelandicPhone), true);
  assert.equal(keypadOn({}, laptop), true);
  assert.equal(keypadOn({ keypad: false }, laptop), false);
  assert.equal(keypadOn(undefined, laptop), true);
  /* only true and false are a choice; anything else is the guess */
  assert.equal(keypadOn({ keypad: "no" }, laptop), true);
});

test("the slim session line replaces the header only for a session, on the board", () => {
  const run = { topic: "blandad", n: 10, i: 2 };
  assert.equal(sessionLayoutOn({ run }, true), true);
  /* no session: the picker and the summary show the header (XP earned …) */
  assert.equal(sessionLayoutOn({ run: null }, true), false);
  /* a 📖 link opened Lesefni mid-session: the tabs are the way back */
  assert.equal(sessionLayoutOn({ run }, false), false);
  /* a drill or a duel draws its own strip */
  assert.equal(sessionLayoutOn({ run, drill: {} }, true), false);
  assert.equal(sessionLayoutOn({ run, duelRun: {} }, true), false);
  assert.equal(sessionLayoutOn(null, true), false);
});
