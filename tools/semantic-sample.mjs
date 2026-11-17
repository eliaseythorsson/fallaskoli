#!/usr/bin/env node
/* What the generated questions SAY, as text a person can read — and a test
   can search (tests/semantic.test.js).

     node tools/semantic-sample.mjs [N=300] [seed=1]

   The app writes most of its sentences itself: a noun is put into a frame of
   the sentence bank (tasks/frames.js), an adjective is shown beside a helper
   noun in a table (tasks/lysingarord.js). Agreement comes out of BÍN and is
   never wrong; SENSE is the part nothing checks — "Ferðin tafðist vegna
   ævinnar", "ferskustu börnin". The only check there is, is reading. This
   prints N questions of the three kinds that are generated, each as the
   finished sentence or phrase the pupil ends up looking at:

     cloze     the noun cloze and its two relatives (fill, no_val, fs_fsno)
     table     the adjective table with its helper noun (tbl_lo)
     analysis  a word put into a frame to be analysed or inflected
               (revform, lo_beyging, lo_stig, lo_samr)

   A question that is a bank sentence exactly as it was written is skipped:
   a person wrote that one. Everything is drawn from a seeded generator, so a
   seed names the same questions every time (on the same data). */

import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, newSession } from "../src/js/core/state.js";
import { SKILL_IDS } from "../src/js/core/skills.js";
import { typeById, makeView, applyEffects } from "../src/js/tasks/index.js";
import { sentenceText } from "../src/js/tasks/frames.js";

/** A small seeded generator (mulberry32). */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const KINDS = {
  cloze: ["fill", "no_val", "fs_fsno"],
  table: ["tbl_lo"],
  analysis: ["revform", "lo_beyging", "lo_stig", "lo_samr"],
};

let LEX = null;
export const lexicon = () => (LEX ||= buildLexicon(DATA));

/* The sentence with the answer written in. */
function filled(s, i, answer) {
  const a = i === 0 ? answer.charAt(0).toUpperCase() + answer.slice(1) : answer;
  const tok = s.tok.map((t, j) => (j === i ? { ...t, w: a } : t));
  return sentenceText(tok);
}

/** One built task as the text the pupil ends up reading, or null when the
    task is a bank sentence as written (nothing was generated). */
export function asText(task) {
  const t = task;
  if (t.type === "fill") {
    const own = t.s.tok[t.i].l === t.n.o && !t.extra;
    if (own) return null;
    return filled(t.s, t.i, t.answers[0]);
  }
  if (t.type === "choice") {
    if (t.s.tok[t.i].l === t.cue) return null;
    return filled(t.s, t.i, t.answer);
  }
  if (t.type === "table") {
    return t.cells.map((c) => `${t.w.forms[c.m][0]}${c.helper ? " " + c.helper : ""}`).join(", ");
  }
  if (t.type === "parse") {
    if (!t.framed) return null;
    return sentenceText(t.s.tok);
  }
  if (t.type === "gap") {
    if (!t.s.derived) return null;
    return filled(t.s, t.i, t.answers[0]);
  }
  return null;
}

/**
 * `n` generated questions: [{ kind, id, text }]. The mix is half cloze, a
 * quarter tables, a quarter analysis; the difficulty runs over 1–6 so that
 * the comparison forms and the harder frames are in it.
 */
export function sample(n = 300, seed = 1, { kinds = ["cloze", "cloze", "table", "analysis"] } = {}) {
  const lex = lexicon();
  const rng = seeded(seed);
  const out = [];
  const S = blankState();
  SKILL_IDS.forEach((id) => { S.enabled[id] = true; });
  for (let k = 0, guard = 0; out.length < n && guard < n * 400; guard++) {
    const kind = kinds[k % kinds.length];
    const ids = KINDS[kind];
    const id = ids[Math.floor(rng() * ids.length)];
    const sess = newSession(S);
    const d = 1 + Math.floor(rng() * 6);
    SKILL_IDS.forEach((x) => { sess.diff[x] = d; });
    const host = { S, sess, forcedNoun: null };
    const b = typeById(id).build(lex, makeView(host), rng);
    if (!b) continue;
    const text = asText(b.task);
    if (!text) continue;
    applyEffects(host, b.effects);
    out.push({ kind, id, text });
    k++;
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const N = +(process.argv[2] || 300), seed = +(process.argv[3] || 1);
  sample(N, seed).forEach((q, k) => console.log(`${String(k + 1).padStart(3)} ${q.id.padEnd(10)} ${q.text}`));
}
