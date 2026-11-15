/* Every attributive adjective frame with every adjective that may be shown in it. */
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { frameIndex, fillFrame } from "../src/js/tasks/frames.js";
const lex = buildLexicon(DATA);
const idx = frameIndex(lex);
for (const [m, frames] of idx.adj) for (const f of frames) {
  const outs = f.fits.map((o) => lex.lookup(o, "lo")).filter((w) => w && w.forms[m])
    .map((w) => fillFrame(f, w, w.forms[m][0]).tok[f.i].w);
  console.log(`${m}  ${f.s.t} → ${outs.join(", ")}`);
}
