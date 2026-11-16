/* A stand-in for server/greynir_worker.py in tests (tests/writing.test.js):
   the same line protocol, no Python. Remarks on the word "skólan"; a text
   containing "SOFÐU" is never answered (the timeout), "HRUNDU" kills the
   worker (a crash). Run with node, as FALLASKOLI_WRITING_PYTHON=node. */
import readline from "node:readline";

process.stdout.write(JSON.stringify({ ready: true }) + "\n");
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  let req;
  try { req = JSON.parse(line); } catch { return; }
  const text = String(req.text || "");
  if (text.includes("SOFÐU")) return;
  if (text.includes("HRUNDU")) process.exit(1);
  const annotations = [];
  let at = text.indexOf("skólan");
  while (at >= 0) {
    if (text[at + 6] !== "n") annotations.push({ start: at, end: at + 6, code: "N4NN-END",
      msg: "Stafsetningarvilla: 'skólan' -> 'skólann'", detail: null, suggest: "skólann" });
    at = text.indexOf("skólan", at + 1);
  }
  annotations.push({ start: 9999, end: 10000, code: "X", msg: "utan textans" });
  process.stdout.write(JSON.stringify({ id: req.id, sentences: text.split(". ").length, annotations }) + "\n");
});
