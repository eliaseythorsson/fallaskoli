#!/usr/bin/env node
/* One word's whole history, and why the app thinks what it thinks about it
   (#43). Reads a pupil's exported progress, so a problem a pupil reports can
   be looked at without the server.

     node tools/word-history.mjs <progress.json> <word> [--json]

   <progress.json>  the account export ("Sækja gögnin mín", GET /account/export:
                    the progress is under `progress`), or the bare progress a
                    device shows under "Flytja framvindu"
   <word>           a word key, "hestur|kk", or a lemma, "hestur" — then every
                    word class it is saved under
   --json           the same as JSON, for a script or an agent

   The file is read as the app reads it (core/state.js `migrate`), so what is
   printed is what the app sees. Progress saved before Word knowledge existed
   (`v` below core/wordknowledge.js RESET_BEFORE) has no entries: the app
   starts them empty, and so does this.

   Pure reading: it changes nothing and needs nothing but the file.        */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { migrate } from "../src/js/core/state.js";
import { entriesOf, totalsOf, wordRecord, drillRecord, wordsWithHistory, wordKeysMet,
  isRecallEntry, RESET_BEFORE, RIGHT, WRONG } from "../src/js/core/wordknowledge.js";
import { statusOf, STATUS_LABEL } from "../src/js/core/wordhealth.js";
import { catalogueEntry } from "../src/js/core/catalogue.js";

/** The saved progress inside a file: an account export or bare progress. */
export function progressOf(file) {
  if (!file || typeof file !== "object") throw new Error("not a progress file (no JSON object)");
  if ("progress" in file && ("account" in file || "exportedAt" in file)) {
    if (!file.progress || typeof file.progress !== "object")
      throw new Error("this export holds no progress (the pupil never saved any)");
    return file.progress;
  }
  return file;
}

/** The word keys a word argument names: itself if it is a key, else every key
    with that lemma. */
function keysFor(S, word) {
  const all = new Set([...wordsWithHistory(S), ...wordKeysMet(S), ...Object.keys(S.drills || {})]);
  if (word.includes("|")) return all.has(word) ? [word] : [];
  return [...all].filter((k) => k.split("|")[0] === word).sort();
}

/**
 * Everything about one word or lemma in a saved progress.
 * @param {any} file   the parsed JSON file
 * @param {string} word
 */
export function wordHistory(file, word) {
  const raw = progressOf(file);
  const S = migrate(raw);
  const saved = Number(raw.v) || 0;
  const words = keysFor(S, String(word)).map((key) => {
    const rec = wordRecord(S, key);
    return {
      key,
      health: { ...statusOf(rec), label: STATUS_LABEL[statusOf(rec).status] },
      record: rec ? { right: rec.c || 0, wrong: rec.w || 0, recent: rec.h || "" } : null,
      totals: totalsOf(S, key),
      rescue: drillRecord(S, key) || null,
      entries: entriesOf(S, key).map((e) => ({
        day: e.day, type: e.type, name: (catalogueEntry(e.type) || {}).nm || null,
        outcome: e.outcome === RIGHT ? "right" : e.outcome === WRONG ? "wrong" : "seen",
        recall: isRecallEntry(e),
      })),
    };
  });
  return {
    word: String(word), savedVersion: saved,
    reset: saved < RESET_BEFORE, words,
  };
}

/** The history as text for a person. */
export function formatHistory(h) {
  const out = [];
  if (h.reset)
    out.push(`Note: this progress was saved at v${h.savedVersion}, before word knowledge (v${RESET_BEFORE}); ` +
      "the app starts its entries empty.", "");
  if (!h.words.length) {
    out.push(`No word "${h.word}" in this progress.`);
    return out.join("\n");
  }
  for (const w of h.words) {
    out.push(w.key);
    out.push(`  health   ${w.health.status} (${w.health.label}): ${w.health.why}`);
    out.push(w.record
      ? `  record   ${w.record.right} right, ${w.record.wrong} wrong, recent "${w.record.recent}" (oldest first; 1 right, 0 wrong)`
      : "  record   none");
    out.push(`  entries  ${w.entries.length}: ${w.totals.c} right, ${w.totals.w} wrong, ` +
      `${w.entries.filter((e) => e.outcome === "seen").length} seen`);
    if (w.rescue)
      out.push(`  rescue   ${w.rescue.p} passed, ${w.rescue.f} endured, last ${w.rescue.last || "-"}`);
    if (w.entries.length) {
      out.push("");
      const typeW = Math.max(4, ...w.entries.map((e) => e.type.length));
      out.push(`  ${"day".padEnd(10)}  ${"type".padEnd(typeW)}  ${"answer".padEnd(6)}  ${"recall".padEnd(6)}  name`);
      for (const e of w.entries)
        out.push(`  ${e.day}  ${e.type.padEnd(typeW)}  ${e.outcome.padEnd(6)}  ${(e.recall ? "yes" : "no").padEnd(6)}  ${e.name || "(not in the catalogue)"}`);
    }
    out.push("");
  }
  return out.join("\n").trimEnd();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const [path, word] = args.filter((a) => a !== "--json");
  if (!path || !word) {
    console.error("usage: node tools/word-history.mjs <progress.json> <word|lemma> [--json]");
    process.exit(2);
  }
  let h;
  try {
    h = wordHistory(JSON.parse(readFileSync(path, "utf8")), word);
  } catch (e) {
    console.error(`word-history: ${e.message}`);
    process.exit(2);
  }
  console.log(asJson ? JSON.stringify(h, null, 2) : formatHistory(h));
  if (!h.words.length) process.exit(1);
}
