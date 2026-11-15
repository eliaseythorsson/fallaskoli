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
node tools/build.mjs           # → dist/fallaskoli-v<version>.html
```

The full `./build.sh` also regenerates all data with Python (Greynir/BÍN; needs
Python 3.10+, and the grammar libraries only ship x86_64 Linux and macOS wheels).
Run it whenever you touch a `*.py` file, `sentences.py`, `exercises.py` or anything
under `data/`.

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
  `data/manifest.json`, `lexicon.json`, `sentences.json`, `freq_lemmas.json`).
  Take main's version and re-run `./build.sh`.

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

Deploying the server (`fly deploy`, see `docs/HOSTING.md`) is done from a tag,
so what runs online is always a version that exists in git.
