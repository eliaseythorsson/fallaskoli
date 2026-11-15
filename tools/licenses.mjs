/* Licences and attribution — generated, not written.
 *
 * The owner: *"I am not going to sell this, but I am going to let people sign
 * up, and then I want to show every licence and thank other people's work by
 * name."*
 *
 * This list is therefore *derived* from requirements.txt and package.json. A
 * hand-written list goes wrong the moment a package is added — and then the
 * silence about it is not forgetfulness but a breach. If a package is in the
 * build but not in the table here, this tool stops and says what is missing.
 *
 *   node tools/licenses.mjs      -> data/licenses.js
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const p = (...x) => path.join(root, ...x);

/* What is known about each package. The licences are copied from the publisher
   itself. */
const KNOWN = {
  islenska: { nm: "BinPackage (islenska)", who: "Miðeind ehf.", lic: "MIT",
    url: "https://github.com/mideind/BinPackage",
    what: "Aðgangur að Beygingarlýsingu íslensks nútímamáls úr Python." },
  reynir: { nm: "GreynirEngine (reynir)", who: "Miðeind ehf.", lic: "MIT",
    url: "https://github.com/mideind/GreynirEngine",
    what: "Þáttun íslenskra setninga: orðflokkar, beygingarmörk, setningarhlutar, fallstjórn." },
  tokenizer: { nm: "Tokenizer", who: "Miðeind ehf.", lic: "MIT",
    url: "https://github.com/mideind/Tokenizer",
    what: "Tákngreining íslensks texta." },
  esbuild: { nm: "esbuild", who: "Evan Wallace", lic: "MIT",
    url: "https://github.com/evanw/esbuild", what: "Þýðing ES-eininga í eina skrá." },
  "puppeteer-core": { nm: "puppeteer-core", who: "Google LLC", lic: "Apache-2.0",
    url: "https://github.com/puppeteer/puppeteer",
    what: "Stýring á Chrome í vafraprófunum. Fylgir ekki afurðinni." },
};

/* Data sets and other things that are not packages. */
const DATA_SOURCES = [
  { nm: "Beygingarlýsing íslensks nútímamáls (BÍN)",
    who: "Stofnun Árna Magnússonar í íslenskum fræðum", lic: "CC BY-SA 4.0",
    url: "https://bin.arnastofnun.is/",
    what: "Öll beygingarmynstur í forritinu. Aðeins BÍN-kjarninn (birting=K) er notaður." },
  { nm: "Íslensk nútímamálsorðabók (ÍNO)",
    who: "Stofnun Árna Magnússonar í íslenskum fræðum", lic: "CC BY-SA 4.0",
    url: "https://islenskordabok.arnastofnun.is/",
    what: "Orðskýringar og dæmi, þegar útdrátturinn hefur verið settur inn (sjá docs/DEFINITIONS.md)." },
  { nm: "Málið.is", who: "Stofnun Árna Magnússonar í íslenskum fræðum", lic: "—",
    url: "https://malid.is/", what: "Uppflettitenglar úr hugtakaskýringum. Engin gögn afrituð." },
  { nm: "OpenSubtitles-tíðnilisti (hermitdave/FrequencyWords)",
    who: "Hermit Dave, byggt á OpenSubtitles", lic: "MIT / CC BY-SA 4.0",
    url: "https://github.com/hermitdave/FrequencyWords",
    what: "Tíðniröðun orða — hvaða orð barnið sér fyrst. Afritið er í zip-inu með sha256." },
  /* The three typefaces are inside the built file since v6.3 (src/fonts/,
     tools/build.mjs). The OFL asks that its notice travels with them: it is
     in src/fonts/OFL.txt, and named here. */
  { nm: "Bricolage Grotesque", who: "Mathieu Triay og The Bricolage Grotesque Project Authors",
    lic: "SIL OFL 1.1", url: "https://github.com/ateliertriay/bricolage",
    what: "Fyrirsagnaletur viðmótsins. Innbyggt í skrána (latneskt hlutmengi frá Fontsource)." },
  { nm: "Public Sans", who: "The Public Sans Project Authors (USWDS)", lic: "SIL OFL 1.1",
    url: "https://github.com/uswds/public-sans",
    what: "Meginmálsletur viðmótsins. Innbyggt í skrána (latneskt hlutmengi frá Fontsource)." },
  { nm: "IBM Plex Mono", who: "IBM", lic: "SIL OFL 1.1",
    url: "https://github.com/IBM/plex",
    what: "Jafnbreitt letur í svarreitum og töflum. Innbyggt í skrána (latneskt hlutmengi frá Fontsource)." },
];

const req = await readFile(p("requirements.txt"), "utf8");
const pkg = JSON.parse(await readFile(p("package.json"), "utf8"));

const used = [];
req.split("\n").forEach((l) => {
  const m = /^([a-z0-9_-]+)==(.+)$/i.exec(l.trim());
  if (m) used.push({ id: m[1], ver: m[2], kind: "python" });
});
Object.entries({ ...pkg.devDependencies, ...pkg.dependencies })
  .forEach(([id, ver]) => used.push({ id, ver, kind: "node" }));

const missing = used.filter((u) => !KNOWN[u.id]);
if (missing.length) {
  console.error("Leyfi vantar fyrir: " + missing.map((m) => m.id).join(", ") +
    "\nBættu þeim í KNOWN í tools/licenses.mjs. Pakki má ekki fara ónefndur inn.");
  process.exit(3);
}

const packages = used.map((u) => ({ ...KNOWN[u.id], id: u.id, ver: u.ver, kind: u.kind }));
const out = {
  built: new Date().toISOString().slice(0, 10),
  app: { nm: "Fallaskóli", lic: "engin markaðssetning, engin gjaldtaka" },
  packages,
  data: DATA_SOURCES,
};
await writeFile(p("data/licenses.js"),
  "export const LICENSES=" + JSON.stringify(out, null, 1) + ";\nexport default LICENSES;\n", "utf8");
console.log(`licences: ${packages.length} packages, ${DATA_SOURCES.length} data sources -> data/licenses.js`);
