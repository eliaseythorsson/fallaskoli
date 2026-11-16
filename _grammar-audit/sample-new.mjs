/* Prints what the v6.11 question types produce, as text, so a person can
   read it: node _grammar-audit/sample-new.mjs [per-type] [type-id …] */
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { blankState, newSession } from "../src/js/core/state.js";
import { TASKS, makeView } from "../src/js/tasks/index.js";
import { SKILL_IDS } from "../src/js/core/skills.js";

const lex = buildLexicon(DATA);
const per = +(process.argv[2] || 5);
const only = process.argv.slice(3);
const NEW = ["no_val", "lo_beyging", "lo_stig", "lo_samr", "fn_eyda", "fn_stad", "fn_aftur", "to_samr", "to_val",
  "to_dags", "to_flt", "ob_smella", "ob_fsao", "ob_st", "ob_flokka", "gr_smella", "gr_flokka", "fs_fsno",
  "fs_hreyf", "fs_sogn", "fs_operson", "or_heiti", "or_samhengi", "or_myndun", "or_utundan", "setn_hlut",
  "setn_flokka", "gerd_finna", "gerd_upphaf", "revform"];
const text = (t) => {
  if (!t.s) return "";
  return t.s.tok.map((x, j) => (j === t.i ? (t.mode === "replace" || t.mark ? `[${x.w}]` : `___${t.cue ? ` (${t.cue})` : ""}`) : x.w)).join(" ").replace(/ ([.,!?])/g, "$1");
};
for (const spec of TASKS.filter((x) => NEW.includes(x.id) && (!only.length || only.includes(x.id)))) {
  console.log(`\n=== ${spec.id} (${spec.skill})`);
  let nulls = 0;
  for (let k = 0; k < per; k++) {
    const S = blankState();
    SKILL_IDS.forEach((id) => { S.enabled[id] = true; });
    const sess = newSession(S);
    Object.keys(sess.diff).forEach((d) => { sess.diff[d] = 1 + (k % 5); });
    const b = spec.build(lex, makeView({ S, sess }), () => Math.random());
    const t = b ? b.task : null;
    if (!t) { nulls++; continue; }
    if (t.type === "gap") console.log(`  ${t.mode === "free" ? t.prompt : text(t)}  →  ${t.answers.join(" / ")}`);
    else if (t.type === "choice") console.log(`  ${text(t)} ${t.gloss ? "{" + t.gloss + "} " : ""}| ${t.question} [${t.options.join(" | ")}] → ${t.answer}`);
    else if (t.type === "tap") console.log(`  ${t.s.tok.map((x) => x.w).join(" ")} | ${t.cls}: ${t.targets.map((j) => t.s.tok[j].w).join(", ")}`);
    else if (t.type === "sort") console.log(`  ${t.s ? t.s.tok.map((x) => x.w).join(" ") + " | " : ""}${t.items.map((x) => `${x.w}=${x.cls}`).join(", ")} · [${t.buckets.join(", ")}]`);
    else console.log(`  (${t.type}) ${t.s ? t.s.tok.map((x, j) => (j === t.i ? `[${x.w}]` : x.w)).join(" ") : t.t && t.t.w} ${t.standalone ? "STANDALONE" : ""}`);
  }
  if (nulls) console.log(`  (${nulls} of ${per} returned null)`);
}
