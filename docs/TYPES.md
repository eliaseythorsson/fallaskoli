# Type checking

Critique item 74. The app is still plain ES modules. Nothing is compiled,
there are no `.ts` files, and the build (`tools/build.mjs`) is unchanged.
TypeScript reads the JSDoc comments in some of the modules and checks the code
against them. That is all it does.

```
npm run typecheck        # tsc -p tsconfig.json  (writes nothing)
```

It runs in `./build.sh` (step 5, after the unit tests) and in CI as a
workflow of its own (`.github/workflows/typecheck.yml`). `typescript` is a
pinned devDependency. It is not in the built file or in the server image.

## How it works

- **`tsconfig.json`** lists the checked modules under `files`, with
  `allowJs`, `noEmit` and **`checkJs: false`**.
- **`// @ts-check`** on the first line of a module is what switches checking
  on for it. With `checkJs: true`, every file the listed modules import would
  be checked too, the renderers included, and the per-file switch would mean
  nothing. With it off, an imported module that is not checked is still
  *read*: its exports get types inferred from its code, so a checked module
  that calls it is checked against the real signature.
- **`src/js/types.d.ts`** describes the shapes everything shares: `State`
  (the saved state, in the order of `blankState`), `Session`, `Task`,
  `CatalogueEntry`/`TaskType`/`Builder`, `View`, `Built`/`BuildEffect`, `Judgement`/`Effect`/`Finding`,
  `ReviewEntry`/`ReviewState`, `LevelRecord`, `AnswerRecord`, `DiagRecord`,
  `Node`, `PolicyChoice` and `Policy`. `Policy` and `Lexicon` are taken from
  the code itself (`ReturnType<typeof createPolicy>`, `… buildLexicon`), so
  they cannot drift. Nothing imports the file at run time. A module names the
  types in comments:

  ```js
  /** @typedef {import("../types").State} State */
  /** @param {State} S @param {import("../types").When} now */
  ```

- **`tests/typecheck.test.js`** fails if a listed module loses its
  `// @ts-check`, if one of the thirteen modules below leaves the list, if a
  module carries the pragma without being listed, if a checked module uses
  `@ts-nocheck` or `@ts-ignore`, if a type tag sits in a plain `/* */`
  comment (where tsc ignores it), if any code imports `types` at run time,
  or if this page stops naming a checked module.
- **`tests/packaging.test.js`** follows the server's imports to check the
  Dockerfile. It skips `/** */` blocks, so `import("../types")` in a type
  comment is not taken for a file the image needs.

The check is not strict (`strict` is off; `noImplicitReturns` and
`noFallthroughCasesInSwitch` are on). A parameter without a type is
`any`, and `null` fits any type. That is deliberate for a first step: it
catches wrong field names, wrong argument shapes and wrong JSDoc. It does not
make every caller prove a value is not null. See "Stricter, later" below.

## What is checked

The pure modules, where the shared shapes matter most:

| module | what it holds |
|---|---|
| `core/state.js` | the saved state and the session: `blankState`, `migrate`, `newSession`, `record` |
| `core/slices.js` | the list of the saved state's slices (`Slice`, `SliceEntry`, `CleanContext`) and the walks over it |
| `core/slicerules.js` | the merge and server-check rules the slices share (`add`, `choice`, `pairs`, `dayStr` …) |
| `core/days.js` | the slices `days`, `goal`, `weekGoal`, `lastActive`; `cleanWeekGoal` |
| `core/runlog.js` | the `runs` slice, the log of practice sessions |
| `core/frametally.js` | the `frames` slice, `cleanFrames` |
| `core/answer.js` | `judge`, `judgeRetry`, `judgeBonus`, `settle`, and the effects |
| `core/review.js` | the review queue: `ReviewEntry`, `noteReview`, `dueEntries`, `dayOf` |
| `core/difficulty.js` | saved levels (`LevelRecord`), `bumpDiff`, `levelRanges` (JSDoc only) |
| `core/mastery.js` | `S.byType`, the mark (`Mark`), `markFrom` |
| `core/skillmap.js` | the curriculum nodes' standing (`Standing`), `S.byNode`, the teacher's copy |
| `core/curriculum.js` | `NODES` as `Node[]`, the presets |
| `core/today.js` | today's session plan |
| `core/run.js` | a practice session without its screen: the record (`Run`), its policy, counting an answer, the summary |
| `core/structure.js` | what of a sentence is marked (item 25): `Structure`, `Part`, `Clause` (JSDoc only) |
| `core/diagnosis.js` | findings, `S.diag`, the pattern standings |
| `core/merge.js` | the three-way merge, typed at its edges (`State` in and out) |
| `core/catalogue.js` | every question type, declared once (`CatalogueEntry`), in duel order |
| `tasks/registry.js` | the catalogue joined with each category's `BUILDERS` (`Builder`): every type must fit `TaskType` |
| `tasks/shared.js` | the builders' helpers: `View`, `Rng`, `Lexicon` |

## What is not checked (yet)

- **`app.js`** and everything under **`ui/`** (the renderers, panels,
  session, duel, account, teacher, skill-map screens). These are held back
  until the UI work in progress (the guided tour, L2 mode, the layout items)
  has merged, so that type annotations do not become merge conflicts.
- **The category files** under `tasks/` (`nafnord.js` … `setningagerd.js`,
  `cloze.js`, `tap.js`, `frames.js`, `drill.js`, `review.js`, `next.js`,
  `view.js`, `effects.js`, `explain.js`, `index.js`). The registry already
  holds their `BUILDERS` to `Builder`. Their `build` functions are the
  next step: each returns a `Built`.
- **The other `core/` modules**: `badges.js`, `calendar.js`, `definitions.js`,
  `duel.js`, `grading.js`, `leniency.js`, `lexicon.js`, `policy.js`,
  `progress.js`, `spacing.js`, `marks.js`, `mending.js`, `examples.js` and the
  rest. They are read for inferred types, not checked.
- **`server/`**, **`tools/`**, **`tests/`**, and the generated `data/`.

A one-off run with `--checkJs` over everything (left out of the gate) found
about 450 complaints in these files. Almost all of them are inferred types
(`{}` for an object built up field by field, `() => true` defaults read as
taking no arguments) and JSDoc written as prose (`@param {{ class: weight }}`,
`{ [nodeId]: object }`). None of the ones I followed up was a run-time bug.
They are the work list for each file as it is brought under the check.

## Adding a module

1. Put `// @ts-check` as its **first** line.
2. Add its path to `files` in `tsconfig.json` and a row to the table above.
   The test will tell you if you forget either.
3. `npm run typecheck`, and fix what it reports **in comments**:
   - name the shared shapes with `@typedef {import("../types").X} X` and
     `@param`/`@returns`;
   - give a value whose type tsc infers too narrowly a type where it is made:
     `/** @type {Effect[]} */ const effects = [];`,
     `/** @type {Record<string, any>} */ let resp = …`;
   - narrow a `filter` with a type guard:
     ``.filter(/** @returns {e is RecordEffect} */ (e) => e.do === "record")``;
   - cast in place only where a module that is not checked yet returns a
     looser type: `/** @type {BuildEffect} */ (FX.asked(…))`. The brackets
     are part of the cast.
4. Change behaviour only for a real bug, and say so in the commit.
5. A field added to the saved state is a new slice: see "Adding a slice"
   below.

## Adding a slice

A slice is one top-level key of the saved state (`S.review`, `S.days` …).
`src/js/core/slices.js` explains the description and the trap it guards
against; in short:

1. In the module that owns the slice, export a `Slice`
   (`/** @type {import("../types").Slice<T>} */`): `key`, `blank()`,
   `migrate(raw, whole)`, `merge(base, local, remote)`, `clean(value, ctx)`
   (the server's check) and `ownText` (true only for text the pupil wrote
   in their own words). `core/review.js` `reviewSlice` is the example. That
   module must not import `core/state.js` or `core/merge.js`.
2. Add it to `SLICES` in `core/slices.js`, and its shape to `State` in
   `types.d.ts`.
3. Give it realistic data in `tests/fixtures/full-progress.js`.
   `tests/slices.test.js` fails until you do, and fails if migrate, merge or
   the server's check would lose it.

`blankState`, `migrate`, `mergeStates` and `cleanState` need no change: they
walk the list. A slice that is still `notYet(…)` in the list (until #50) keeps
its code in those four places.

A few things that trip up TypeScript 7 in JSDoc:

- A nullable function type must be written `((x: T) => U)|null`.
  `?(x: T) => U` is a syntax error.
- `0..4`, `{ [key]: T }` with an undeclared `key`, and bare field lists such
  as `{added, passed}` are prose, not types. Use `number`,
  `Record<string, T>` and `{added: number, passed: number}`.
- `@param opts.x` needs an `@param {object} opts` line before it.
- A `@type` tag inside a plain `/* … */` comment is ignored. It must be in a
  `/** … */` block directly above the declaration. The test catches this.

## Stricter, later

Each of these flags, run once over the checked modules, gives:

| flag | errors | |
|---|---|---|
| `--noImplicitReturns`, `--noFallthroughCasesInSwitch` | 0 | **on** in tsconfig.json |
| `--noUnusedLocals` | 0 | could be switched on; left off so that work in progress on these files is not failed for a leftover variable |
| `--noUnusedParameters` | 4 | unused callback and API parameters, kept on purpose |
| `--strictNullChecks` | about 110 | nearly all `let x = null` read as type `null`, and values already guarded before use |
| `--noImplicitAny` | about 700 | the untyped inner helpers |

`strictNullChecks` is the useful next step. Do it one module at a time, by
typing the `let x = null` variables and the `|| {}` fallbacks.

The critique also asked for a linter (eslint). That is not part of this
change.
