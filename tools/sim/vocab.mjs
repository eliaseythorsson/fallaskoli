const R = decodeURIComponent(new URL("../..", import.meta.url).pathname).replace(/\/$/, "");
const { DATA } = await import(R + "/data/data_bundle.js");
const { buildLexicon } = await import(R + "/src/js/core/lexicon.js");
const lex = buildLexicon(DATA);
console.log("blocked list:", DATA.blocked);
const probe = ["píka", "typpi", "kynlíf", "standpína", "fullnæging", "drusla", "tík", "fáviti", "hóra", "rassgat", "skítur", "drepa", "kelling", "dræsa", "nauðgun", "morð", "byssa", "hass", "kókaín", "brjóst", "smokkur", "fyllerí", "tussa", "hommi", "negri"];
for (const w of probe) { const hits = ["kk", "kvk", "hk", "so", "lo"].map((c) => lex.lookup(w, c)).filter(Boolean); if (hits.length) console.log(w, hits.map((e) => `${e.c} rank ${e.r}`).join(", ")); }
console.log("nouns", lex.nouns?.length, "adjectives", lex.adjectives?.length, "verbs", lex.verbs?.length);
