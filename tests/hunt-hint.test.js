/* The instruction under Villuveiðar: a hand-banked item may hold any kind of
   error, so it must not say "í falli eða samræmi"; generated ones still do. */
import test from "node:test";
import assert from "node:assert/strict";
import { huntHint } from "../src/js/ui/render.js";

test("bank items get a general instruction", () => {
  const h = huntHint({ hunt: { source: "bank" } }, 2);
  assert.ok(!/falli|samræmi/.test(h));
  assert.match(h, /Finndu orðið sem er rangt/);
});

test("generated items keep the case/agreement instruction", () => {
  assert.match(huntHint({ hunt: {} }, 1), /í falli eða samræmi/);
});
