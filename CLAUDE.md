# Working on Fallaskóli

Read `README.md` first: what the program is, how it is built, where things are.
This file is the rules for changing it — for people and for agents alike.

## One change, one branch

`main` is always releasable: it builds, its tests pass, and a tag on it could be
deployed. Nobody commits to `main` directly; everything arrives by pull request.

1. Start from the newest main: `git switch main && git pull`.
2. Make a branch for exactly one item: `git switch -c fix/78-git-setup`
   (`fix/…` for bugs, `feat/…` for new things, `data/…` for sentence/lexicon work,
   `docs/…`, `chore/…`). Put the item number from the improvement list in the name.
3. Commit small, with messages that say why.
4. Before opening the PR: `git fetch && git rebase origin/main`, then run the checks below.
5. Open a pull request. CI must be green before it is merged. Prefer *squash merge*.

Several agents on one computer: give each its own worktree, so they never share
a working folder — `git worktree add ../fallaskoli-78 -b fix/78-git-setup`.

## Checks before every PR

```
npm ci                         # once per clone/worktree
node --test tests/*.test.js    # 500+ tests, ~30 s
npm run typecheck              # tsc over the // @ts-check modules (docs/TYPES.md)
node tools/build.mjs           # → dist/fallaskoli-v<version>.html
```

The full `./build.sh` also regenerates all data with Python (Greynir/BÍN; needs
Python 3.10+, and the grammar libraries only ship x86_64 Linux and macOS wheels).
Run it whenever you touch a `*.py` file, anything under `content/` or anything
under `data/`. `python3 pipeline/content_io.py` is the one-second check of `content/`
on its own (every file read, or the file and line that is wrong). On a Mac, or
anywhere the result must match CI byte for byte, run `./build-in-container.sh`
instead (same arguments; needs Docker): CI's `reproducible` job rebuilds the
data in that container and fails on any difference.

## Do not

- **Do not commit personal data.** `server/data/` and `_prufa/` hold accounts,
  password hashes and children's progress. They are git-ignored; keep it that way.
  Secrets on the hosted server are set with `fly secrets set`, never in a file.
- **Do not commit built files.** `dist/` is ignored. Releases are tags.
- **Do not change `version` in package.json or create tags.** The owner does that
  at release time (the HTML file name and the GitHub release come from it).
  Write your change under `## Unreleased` at the top of `CHANGES.md` instead.
- **Do not run `./build.sh --accept` to make a failing manifest pass.** The
  manifest stopping is the point: a data change must be explained in the PR,
  with the parse-diff it printed.
- **Do not resolve conflicts in generated files by hand** (`data/*.js`,
  `data/manifest.json`, `data/lexicon.json`, `data/sentences.json`, `data/freq_lemmas.json`).
  Take main's version and re-run `./build.sh`.

## Question types: one category, one file

A question type is **one entry in `src/js/core/catalogue.js` plus one builder**
in its category's file, `src/js/tasks/<skill>.js` (exported as `BUILDERS.<id>`),
plus a renderer in `ui/` only if no existing one draws its shape. The catalogue
entry says what the type is — `skill`, `nm`/`ds`, `renderer`, `tags`, `bands`,
`weight`, `recall`, `grader` — and its header explains every field.
`tasks/registry.js` joins the two and refuses to start if a declaration has no
builder or a builder has no declaration.

- New types go at the END of `core/catalogue.js`: its order is the duel order,
  part of what a duel's seed means. `tests/registry.test.js` pins it.
- A builder is `build(lex, view, rng)` → `{ task, effects }` or `null`. It does
  not write to the state (it returns an effect, `tasks/effects.js`), does not
  read the clock (`view.today`) and never calls `Math.random` (it draws from
  `rng`). `tests/purity.test.js` holds all three.
- What a type declares — `renderer`, `tags`, `bands` — is checked against what
  it builds by `tests/registry.test.js`. When you change a builder on purpose,
  the failing test names the catalogue line to update.
- `grader: "server"` types exist only for a pupil whose administrator switched
  server grading on, on a server whose grader is up (`core/policy.js`,
  `docs/adr/0004`); they need no other code to stay hidden.
- A new skill is an entry in `core/skills.js`; `tests/skills-checklist.test.js`
  then names each file still to fill in (lesson page, curriculum nodes, error
  patterns, skill-map nodes, builders file).
- To see exactly what a change moved, type by type:
  `node tools/task-snapshot.mjs take` before and after, then `compare`.

## Content: plain files, not code

Every hand-written sentence, exercise item, frame and Villuveiðar item is in
`content/<category>/*.tsv` (critique item 82), one item per line, so that a
teacher or a native reader can read and correct it. README.md, "Efnið",
describes the format; each file's header describes its columns in Icelandic.

- Add or change content in the `.tsv` file, never as a literal in Python.
  `pipeline/sentences.py` and `pipeline/exercises.py` only read the files (through
  `pipeline/content_io.py`) and give the build the lists it has always had, under the
  same names; a new column or a new list means a line there too.
- Keep a file's comments: they hold the rules its items were written by.
  Write Icelandic for anything a teacher reads in a header.
- Moving content must not change the build: the lists and `data/*.js` stay
  byte-identical, and the manifest's only difference is the input files.
- A branch made before the move that edits `pipeline/sentences.py` or `pipeline/exercises.py`:
  run `tools/content-from-py.py` on that branch's two files to get its content
  as `.tsv`, then `./build.sh`.
- Lesefni and the worked examples stay in `src/js/content/` (the app imports
  them); edit them there.
- When you are unsure whether an item is natural Icelandic, leave it out; when
  you keep one that a native reader should still look at, add a note to
  `content/REVIEW-NOTES.md` with `Leita:` phrases from the item. The review page
  (`node tools/review.mjs` → `dist/review.html`) shows the note beside the item,
  and `tests/review-page.test.js` fails if a phrase stops finding one.

## Files many branches touch

`server/server.mjs`, `src/head.html`, `CHANGES.md` and `data/manifest.json` are
where parallel branches collide. Keep edits there small, rebase often, and say in
the PR if you had to restructure one of them.

## Releasing (owner)

```
# on main, with everything for the release merged
# 1. set "version" in package.json, rename "## Unreleased" in CHANGES.md
git commit -am "Release v6.13.0"
git tag -a v6.13.0 -m "v6.13.0"
git push && git push --tags      # → GitHub builds it and attaches the HTML
```

The website deploys itself: every change to `main` is tested and, if the tests
pass, sent to Fly.io by `.github/workflows/deploy.yml` (`WEBSITE.md`). So
merging a PR into `main` puts it online — another reason `main` must always be
releasable. What runs online is always a commit that exists in git.

The owner works from `~/Projects/fallaskoli` and syncs it with GitHub by
double-clicking `Update website.command` (pull, then commit and push to `main`).
That is the one exception to "nobody commits to `main` directly"; agents still
use branches and pull requests.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues on eliaseythorsson/fallaskoli (the `gh` CLI); the issue number is the item number in branch names. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the root, created when first needed. See `docs/agents/domain.md`.
