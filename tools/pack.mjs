/* One zip with everything: code, data, tests, tools, documents and the built
 * HTML file. Never `server/data` (users, password hashes, progress).
 *
 *   node tools/pack.mjs
 */
import { mkdir, rm, cp, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const p = (...x) => path.join(root, ...x);
const pkg = JSON.parse(await readFile(p("package.json"), "utf8"));
const name = `fallaskoli-v${pkg.version.split(".").slice(0, 2).join(".")}`;

/* Not node_modules (npm ci fetches those) and not .git. */
const INCLUDE = [
  "build.sh", "requirements.txt", "package.json", "package-lock.json",
  "README.md", "CHANGES.md", "docs", "src", "tests", "tools", "server",
  "Dockerfile", ".dockerignore", "fly.toml",
  "sentences.py", "noun_classes.py", "definitions.py", "government.py",
  "parse_guard.py", "parse_overrides.py", "vocab_filter.py",
  "build_freq.py", "build_lexicon.py", "build_sentences.py", "build_bundle.py",
  "exercises.py", "build_exercises.py",
  "freq_raw.txt", "freq_raw.sha256", "freq_lemmas.json",
  "lexicon.json", "sentences.json", "data",
  `dist/${name}.html`,
];

const stage = p("dist", name);
/* Only our own staging folder and an older zip of the same name: dist/ also
   holds the built HTML file, which must survive. */
await rm(stage, { recursive: true, force: true });
await rm(p("dist", `${name}-src.zip`), { force: true });
await mkdir(stage, { recursive: true });

const missing = [];
for (const f of INCLUDE) {
  if (!existsSync(p(f))) { missing.push(f); continue; }
  await cp(p(f), path.join(stage, f), { recursive: true });
}
await rm(path.join(stage, "server", "data"), { recursive: true, force: true });
if (missing.length) {
  console.error("MISSING from the zip: " + missing.join(", ") +
    "\nRun ./build.sh first — a zip with no artefact cannot be tried.");
  process.exit(3);
}

const zip = `${name}-src.zip`;
execSync(`cd ${JSON.stringify(p("dist"))} && zip -qr ${JSON.stringify(zip)} ${JSON.stringify(name)}`);
await rm(stage, { recursive: true, force: true });

const size = execSync(`du -h ${JSON.stringify(p("dist", zip))} | cut -f1`).toString().trim();
console.log(`dist/${zip} — ${size}`);
console.log(`  inside: code, data, ${INCLUDE.includes(`dist/${name}.html`) ? "the built HTML file, " : ""}tests, manifest, README.md`);
