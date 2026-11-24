# Fallaskóli

An Icelandic grammar trainer for a teenager: noun, adjective, pronoun, numeral
and verb inflection, word-class analysis, case government, sentence parts and
clause types, and the grammar used — finding and fixing errors, building
sentences from dictionary forms, and rewriting sentences — with XP, levels, badges and a word collection on top.

Everything grammatical in the program is read out of two sources and never
written by hand: **BÍN** (Beygingarlýsing íslensks nútímamáls, via the
`islenska` package) for every inflected form, and **Greynir** for the
analysis of every sentence. Two tables are built by hand, and both are only
ever used to leave something out: `pipeline/noun_classes.py` says what nouns *mean* (a
person, a place, a drink …) so that sentences can be generated without
nonsense, and `pipeline/adj_classes.py` says what an adjective is said of (*ferskt
epli*, not *ferskt barn*) and which adjectives are not compared (*dauður*,
*velkominn*, *breskur*).

## Running it

The app is one HTML file, `dist/fallaskoli-v<version>.html` (built by `./build.sh`; not
committed — every release is a git tag and its file is attached to the release).
The version is in `package.json` and nowhere else: `tools/version.mjs` reads it
for every tool that needs the file name, and this README deliberately names no
version or test count, which would only go stale. It works three ways, with
nothing configured — the program looks at where it was loaded from:

| how it is opened | where progress lives |
|---|---|
| double-clicked from a folder (`file:`) | this browser, `localStorage` |
| served by any plain web host — a hosted page, GitHub Pages, Netlify, a folder on a school server | this browser, `localStorage` |
| served by `server/server.mjs` | on the server, behind a login (see `docs/SERVER.md`) |

**Trying it as four pupils on your own computer:** `./test-together.sh` (or
double-click `Start test server.command`) starts the server with four test pupils
and a teacher, and opens one page with all four side by side, each already logged
in (`tools/quad.mjs`): answer in each, watch the leaderboard, challenge one another
to duels. `--reset` starts again with four fresh pupils.

**Testing with several people:** `./test-together.sh --lan`
runs the server for everyone on the same Wi-Fi; `./test-together.sh --internet`
gives a temporary https address that works from anywhere (needs
`brew install cloudflared`, no account). Test accounts, passwords and progress live
in a temporary folder outside the project (made with `mktemp -d`; the script prints
where, and reuses it next time), never in the repository, the image or the zip.
`./test-together.sh demo 3` makes demo1–demo3 for trying several accounts yourself; open each on its own
address (`http://demo1.localhost:8080`, `http://demo2.localhost:8080` …) to stay
logged in as all of them at once.

**Installing it (v6.14).** Served over http(s), the program can sit on the
home screen of a phone or a Chromebook and opens without a network. The build
writes `dist/web/` for this: the same program as `index.html`, with a manifest,
icons (the board's tally mark in chalk, drawn by `tools/pwa.mjs`) and a service
worker (`src/sw.js`). Put that folder's contents on any web host;
`server/server.mjs` serves the same files by itself. The worker caches the
program and nothing else — never an answer from the server — and when a new
version is published it says *Ný útgáfa er tilbúin — endurhlaða* instead of
swapping it under the pupil. On a server the progress lives on the server, so
offline the program says it has no connection rather than starting a second
progress in the browser. Opened from a file, none of this happens: no worker,
no manifest, the same single file.

**What the server adds.** Accounts and groups, a leaderboard inside a group (its
default metric counts what got *better* this week, not how long the child sat
there), duels that the server grades, and a teacher's part of Skólastofan for
the guardian of a group: the class's error patterns, one pupil's skill map,
homework (*Verkefni*), a weekly class goal, a live round on the projector and
team duels. The server also counts answers anonymously and, once enough have
come in, adjusts the difficulty of question types and cells by itself
(`docs/SERVER.md` §4.3). Every route is in `docs/API.md`, and what each of
these lets a teacher see is in `docs/PRIVACY.md` §1a–1d.

For one child on several devices the second row is the simplest: put the file
anywhere on the web and open the same link everywhere. Progress is then kept
per device; **Stillingar og námsefni → Færa milli tækja** moves it between devices as
a small JSON file. The server route adds accounts, a leaderboard within a group
and progress that follows the child automatically and merges between devices.
`WEBSITE.md` puts it on Fly.io for a few dollars a month and keeps it updated from
`main` by itself (`docs/HOSTING.md` is the manual way);
`docs/PRIVACY.md` is what running it for other people's children asks of you.

## Building

```
./build.sh              # everything: data, tests, bundle, browser checks
./build.sh --accept     # after a deliberate change to the data
```

Needs Python 3.10+ with `pip`, Node 20+ (CI and the container use 22), and for the browser checks a Chromium
(`CHROME_PATH=/path/to/chrome`; they are skipped otherwise). Debian/Ubuntu:
`apt install -y nodejs npm python3 python3-pip`. The grammar libraries ship
Linux wheels for x86_64 only.

**The same bytes on any computer (v6.14).** `./build.sh` on your own machine
uses whatever Python and processor it finds — and with the very same library
versions, an ARM Linux VM (which compiles the parser from source) parsed one
token differently from an x86_64 one. The committed data is the x86_64 build.
To build exactly that anywhere, Mac included, with Docker:

```
./build-in-container.sh             # = ./build.sh, in the build container
./build-in-container.sh --accept    # = ./build.sh --accept
```

`Dockerfile.build` pins the platform (linux/amd64; emulated on an
Apple-silicon Mac, so slower), Python 3.13.18, Node 22.23.4, and every Python
package by its hash (`requirements-build.txt` — change it together with
`requirements.txt`). Your source folder is mounted, so the results land where
`./build.sh` puts them; your own `node_modules` is not touched. The licence
list keeps its date while it is unchanged, so a rebuild changes no byte. CI
(`.github/workflows/ci.yml`, job `reproducible`) runs this on every push and
fails if the rebuilt data differs from what is committed. Two things the
container could not check where it was written (no access to Docker Hub): it
was never built, only read and linted (hadolint), and the image tags carry no
digest yet — `docker buildx imagetools inspect python:3.13.18-slim-bookworm`
(and the same for `node:22.23.4-bookworm-slim`) prints the digest to add after
the tag in `Dockerfile.build`, which makes the pin final.

What the build does, in order:

1. `pipeline/build_freq.py` — the committed frequency list (`sources/freq_raw.txt`, OpenSubtitles)
   → `data/freq_lemmas.json`, ranked towards school reading: words the hand-written
   sentences, exercises and definitions use ×3, words on LÍNO-2, the academic word
   list (`sources/lino2.csv`, read by `pipeline/lino.py`), ×3 (not both), film register
   (pipeline/vocab_filter.py `SUBTITLE_REGISTER`, and ÍNO's *niðrandi*/*gróft*) ×0.1.
   It lists the LÍNO-2 lemmas BÍN does not have. Until `sources/lino2.csv` is added the
   build warns and goes on as if the list were empty (the data is then what it was before).
2. `pipeline/build_lexicon.py` — every attested lemma's paradigm out of BÍN → `data/lexicon.json`
   (and, by `pipeline/irregularity.py`, how irregular each paradigm is, `irr` 1–5, and
   how hard each cell is, `cellh` — the second axis of difficulty)
   (minus the comparison forms of the adjectives `pipeline/adj_classes.py` lists as not compared).
   LÍNO-2 words the subtitles never saw come in out of BÍN; every LÍNO-2 word carries
   its LÍNO rank, `lino` (1 = commonest), and the build lists the entries that did not get in.
3. `pipeline/build_sentences.py` — every sentence of the bank
   (`content/setningar/setningar.tsv`, read by `pipeline/sentences.py`) parsed by
   Greynir and checked by `pipeline/parse_guard.py` → `data/sentences.json`
4. `pipeline/build_bundle.py` — lexicon + sentences + semantic classes + definitions
   → `data/data_bundle.js`; `pipeline/build_exercises.py` — the hand-written items in
   `content/*/*.tsv` (read by `pipeline/exercises.py`), every answer, option and cue
   looked up in BÍN → `data/exercises.js`. The sentences of „Hver gerði hvað?“
   (`content/setningafraedi/hver-gerdi-hvad.tsv`) are parsed and guarded here as
   bank sentences are, and `pipeline/who_did.py` refuses any whose parse does not
   give the gerandi and the þolandi the file gives
5. `tools/manifest.mjs` — a fingerprint of all of the above. If anything
   changed since the last accepted build the build stops and lists the change;
   `--accept` records it. This is what stops a parser upgrade from quietly
   changing a grammatical analysis.
6. `node --test tests/*.test.js` and `npm run typecheck` (tsc over the modules
   that start with `// @ts-check`; see `docs/TYPES.md`), then `tools/build.mjs` bundles `src/` into
   the HTML file (and `dist/web/`, the same program as a folder for a web
   host — see *Installing it* above) and `tools/review.mjs` writes the review
   page (`dist/review.html`, see "Efnið" below), then `tools/browser-test.mjs`,
   `tools/tour-test.mjs` (the guided first run) and `tools/server-test.mjs`
   drive it in a real Chromium.

`node tools/pack.mjs` writes `dist/fallaskoli-v<version>-src.zip` with everything
the build needs. CI (`.github/workflows/ci.yml`) also runs the unit tests, the
bundle and the data manifest on every push, and refuses a commit that contains
personal data or a built file; `.github/workflows/typecheck.yml` runs the type
check on its own, so a type error is reported as one;
`.github/workflows/release.yml` builds a tag and
attaches the HTML, the zip and the web folder to a release.

## Where things are

```
content/              ALL HAND-WRITTEN CONTENT, one TAB-separated file per list,
                      readable and editable without reading code (see "Efnið"):
                      setningar/ (the sentence bank), villuveidar/ (the real
                      errors), malbeiting/ (pairs to combine and split),
                      lysingarord/ fornofn/ toluord/ fallstjorn/
                      obeygjanleg/ ordafordi/ setningafraedi/ (exercise items
                      and frames);
                      REVIEW-NOTES.md, what a native reader should check
pipeline/             the Python half of the build (critique item 79), run from the
                      repository root by ./build.sh; the modules import one another
                      as siblings:
  content_io.py       the reader of content/*.tsv (stdlib only);
                      `python3 pipeline/content_io.py` checks every file in a second
  sentences.py        reads the sentence bank: (level, text, slot, need[,
                      options]); the rules for writing a sentence, and GROUPS
  irregularity.py     how irregular a paradigm is (stems counted on BÍN's forms:
                      umlaut, syncope, -j-/-v-, consonant change, strong verbs)
                      and the table of how hard each cell is; the app lets the
                      level choose on both (core/difficulty.js hardnessWeight).
                      On a server both, and each question type's place on the
                      level scale, are adjusted from anonymous counts of right
                      and wrong answers (core/calibration.js; docs/SERVER.md §4.3)
  frame_allow.py      words allowed into one frame each, on top of its noun
                      classes (content/setningar/lino-rammar.tsv): reads the
                      pairs and checks each against the frame and the paradigm
  noun_classes.py     semantic class of every noun; í/á convention; exclusions;
                      which nouns nobody has read (not used in a frame); the
                      needs of a few frames narrowed (NEED_FIX)
  adj_classes.py      the helper nouns an adjective is shown with in its
                      table, and the adjectives that are not compared
  government.py       which cases prepositions and verbs govern — used only to
                      REJECT a parse that contradicts it, never to assert one
  parse_guard.py      the checks every token passes: the lemma is plausible, the
                      mark exists in BÍN, government agrees with the table,
                      features the form cannot settle are marked uncertain
  parse_overrides.py  declared decisions about readings the guard accepts
  phrases.py          kinds of subordinate clause and phrase, written into a
                      sentence only when the parse and a closed table of what
                      such a clause looks like agree (years 9–10)
  who_did.py          „Hver gerði hvað?“ (issue 27): who did what to whom, worked
                      out of the parse — in a passive the gerandi is not the
                      frumlag — and compared with the hand-written key of
                      content/setningafraedi/hver-gerdi-hvad.tsv; an item whose
                      parse says otherwise is refused by build_exercises.py
  clause_shape.py     what Greynir says about the clauses of a sentence: the
                      check every pair of Sameina og skipta passes (issue #29)
  definitions.py      a handful of hand-written definitions; the rest are ÍNO
  exercises.py        reads the hand-written items for the v6.11 question types
                      (pronouns, numerals, dates, government, synonyms …) and
                      the frames build_exercises.py fills in from BÍN (v6.14)
                      out of content/, under the names the build has always
                      used; keeps the rules for levels and the closed tables
                      (ordinals, months, multi-word conjunctions). Items are
                      sentences and lemma + class + BÍN mark only;
                      build_exercises.py resolves every form in BÍN and
                      checks every word
  vocab_filter.py     lemma errors and words for acts of violence (always
                      removed), the coarse-word block list (on by default,
                      the administrator can switch it off), and the words
                      build_freq.py ranks down as film-subtitle register

sources/              what the build starts from and cannot make: the frequency list
                      (freq_raw.txt, with its checksum), LÍNO-2 (lino2.csv, with its
                      checksum; `python3 pipeline/lino.py` says how to add it) and the
                      ÍNO dictionary XML
data/                 GENERATED, committed, never edited by hand: lexicon.json,
                      sentences.json, freq_lemmas.json (the build's own stages),
                      data_bundle.js, exercises.js, manifest.json …

src/js/app.js         start-up and wiring; the only holder of state, and
                      where the controllers meet: every question is drawn
                      by its `next` and ends in its `finish`
src/js/control/       one controller per part of practice, mixed into app
                      (critique item 76): session.js (sessions, today's,
                      assignments, Lesefni and skill-map sessions), drill.js
                      (the rescue drill and "Þrjár í röð"), duel.js (duels
                      and team duels), live.js (a live class round)
src/js/core/run.js    a session without its screen: the record it keeps,
                      the policy its questions are asked under, counting an
                      answer, the summary
src/js/core/          pure modules, no DOM: marks, lexicon, grading, leniency,
                      state, progress, badges, rarity, policy, definitions,
                      diagnosis (the error patterns) …
src/js/core/answer.js judging an answer, for every question type:
                      judge(task, response, pupil) → { ok, verdict, findings,
                      xp, … } decides and changes nothing; settle() writes
                      the result into the state. The renderers only collect
                      the response and draw the verdict
src/js/core/review.js the review queue: every wrong answer goes in with a
                      due date; a right answer on a due entry moves it out
                      1 → 3 → 7 → 21 days, a wrong one starts it again; a
                      session opens with up to three due entries
                      (tasks/review.js asks them, with the cell or the word
                      forced). Also what is one entry, the cap, the expiry
                      and the merge between devices — each choice explained
                      at the top of the file
src/js/core/today.js  "Lota dagsins", the picker's main button: plans ten
                      questions — the due reviews, then the active error
                      patterns, then new material spread over several skills
                      (least practised first; for a new pupil the core
                      inflection skills first), about 3 / 4 / 3 — inside the
                      curriculum policy
src/js/core/streak.js "Þrjár í röð": after a diagnosed miss, three questions
                      on its pattern with the rule first (tasks/drill.js
                      builds them), outside the session's count; the
                      pattern then goes into the review queue
src/js/core/mastery.js  the mastery mark (item 44): per question type the
                      last twenty answers with the step each was asked at
                      (`S.byType`), and `masteryOf(S, skill)` /
                      `masteryOfTypes(S, types)` → 0 "Of fá svör" … 4
                      "Fullt vald", from recent accuracy at the pupil's
                      level and reviews passed on time; thresholds at the
                      top of the file
src/js/core/mending.js  getting better, counted (items 56, 58): an error
                      pattern is *mended* when it was active and has since
                      been right ten times in a row, the last on a later day;
                      reviews passed per day; this week's "Framfarir" (the
                      leaderboard figure, capped per day so volume cannot
                      raise it) — `S.mend`, its sanitiser and its merge
src/js/core/classgoal.js  the class goal (item 59): a weekly target the
                      group's teacher sets ("2.000 rétt svör saman", "Allir
                      ljúka þremur lotum"), the group's total (never who put
                      in what; nothing below three pupils) and the week whose
                      badge a pupil is owed; routes in server/classgoal.mjs,
                      the bar in ui/classgoal.js
src/js/core/examples.js  the worked example on the first card of a type a
                      pupil has not met (item 41; the texts are in
                      src/js/content/examples.js, every form checked against BÍN
                      by tests/examples.test.js), and `S.seenTypes`
src/js/core/placement.js  the guided first run's rules (item 84): the
                      placement round — 12–15 questions, one skill after
                      another, one level that goes up after a right answer
                      and down after a wrong one — the level it then writes
                      for each skill (`setSkillLevel`, source "placement"),
                      the year preset it suggests, and `S.tour`, the record
                      that the first run is done or skipped. ui/tour.js
                      draws it: the welcome and the year, the round (an
                      ordinary session on the board), what it found, and
                      four pointers at Lota dagsins, Lesefni, the skill map
                      and the slim session line. A pupil with no answers
                      meets it once; Stillingar has "Sýna kynninguna aftur"
src/js/core/mix.js    the mix rule for a session: ≥3 kinds of question, none
                      over ~40%, tables ≤30%, analysis ≤35%
src/js/core/curriculum.js  the curriculum map as data: the official
                      criteria, the nodes (one thing a pupil learns, with its
                      year, question types and Lesefni page) and what the
                      8., 9. and 10. bekkur presets switch on
src/js/core/structure.js  the structure of a sentence for SHOWING it (item 25):
                      `sentenceStructure(s)` → the setningarhlutar, the
                      forsetningarliðir, the samtengingar and the boxed
                      aukasetningar, read out of the parse and only where the
                      build vouches for them; an unmarked word is "not
                      shown", never "has no role". Pure, no DOM.
                      ui/structure.js draws it (`structureHTML`): every mark
                      has a colour, a kind of line and its name under it, on
                      paper and on the board.
src/js/core/hint.js   the structure as a hint on every Setningafræði question
                      (item 26): shown from the start at þyngd 1–2, behind
                      „Vísbending“ (half XP) at 3–5, gone at 6–7 (`hintStep`);
                      `planHint` hides what the question asks and anything
                      that would leave only the answer unmarked. The builders
                      plan it (`task.coding`), ui/hint.js draws it
src/js/core/skillmap.js  the skill map (item 83): every node with how well
                      (the mastery mark), when it was last trained and
                      whether it needs work (an active pattern, reviews due);
                      `standingOfNode(node, S)`, and `teacherMap` for the same
                      map of one pupil on the teacher's screen
src/js/core/difficulty.js  difficulty kept per skill and saved with the
                      progress (`S.difficulty`): half a step up after two
                      right in a row, down after a miss, held back while
                      recent accuracy is low; the hardness of a word and a
                      cell (`hardnessWeight`)
src/js/core/duel.js, teamduel.js, live.js, assignment.js, classview.js
                      the rules of duels (the same seed gives both pupils
                      the same plan; the server grades the answers), team
                      duels, a live class round, a teacher's assignments and
                      the class's error-pattern table — each shared by the
                      server and the browser so both read the same numbers
src/js/core/calibration.js, classifiercheck.js  difficulty set from anonymous
                      counts of answers, and the check of the error
                      classifier against a sample of real wrong answers
                      (server/calibrate.mjs holds what only a server has)
src/js/core/slices.js the saved state as one list of slices, each with its
                      blank, migrate, merge and server check, and which hold
                      the pupil's own text (`ownText`); blankState, migrate,
                      mergeStates and cleanState walk it. The top of the file
                      explains the trap it guards against and how to add a
                      slice; tests/slices.test.js is the safety net. Each
                      slice is described in the module that owns it; the
                      rules most share are slicerules.js, and the ones
                      state.js used to own are days.js, settings.js,
                      runlog.js and frametally.js
src/js/core/merge.js, server.js, social.js, leaderboard.js  progress from two
                      devices put together, the program's one view of the
                      server, and what pupils see of each other
src/js/tasks/         the question builders, one file per category:
                      nafnord.js, lysingarord.js, sagnord.js, fornofn.js,
                      toluord.js, obeygjanleg.js, greining.js, fallstjorn.js,
                      ordaford.js, setningafraedi.js, malbeiting.js,
                      setningagerd.js, each exporting its BUILDERS by type
                      id. What a question type is — skill, name, renderer,
                      diagnosis tags, steps of difficulty, recall, grader —
                      is declared once in src/js/core/catalogue.js, whose
                      order is the duel order; registry.js joins the two.
                      A builder is
                      pure — build(lex, view, rng) → { task, effects }
                      (view.js, effects.js): it changes nothing and never
                      draws a random number of its own. next.js chooses the
                      next question, drill.js runs the rescue drill,
                      review.js turns an entry of the review queue back
                      into a question; shared.js,
                      cloze.js and tap.js are what the categories share;
                      frames.js the sentence frames, explain.js the
                      explanations
src/js/ui/            rendering: render.js (one renderer per task type;
                      render-more.js for gap, choice, tap, sort and the
                      Orðaforði bonus),
                      session.js (the Æfa picker, a session, its summary),
                      skillmap.js (Merki og framvinda), teacher.js, live.js,
                      teamduel.js, duel.js, classgoal.js (Skólastofan),
                      lessons.js (Lesefni), drill.js, reports.js, pwa.js,
                      dom.js, panels.js, progress.js, account.js, policyui.js,
                      secondlang.js (item 45: the second-language mode — a
                      gloss on every content word, reading aloud with an
                      on-device Icelandic voice; the switch is core/profile.js),
                      writing.js (item 46: Ritun vikunnar, the pupil's own
                      three sentences; rules in core/writing.js, the
                      GreynirCorrect check in server/writing.mjs and
                      server/greynir_worker.py)
src/js/content/       hand-written texts in the program: the worked examples
                      and the Lesefni pages
src/head.html         the stylesheet
src/sw.js             the service worker: caches the program, never an answer
src/fonts/            the three typefaces, inlined into the built file
server/               the optional multi-user server (Node, JSON files on disk):
                      server.mjs (routes), store.mjs (files, cache, erasure),
                      auth.mjs, guard.mjs (what is stored and believed),
                      privacy.mjs (the notice), backup.mjs, admin.mjs (CLI),
                      calibrate.mjs (anonymous counts of answers → a weekly
                      table of adjustments; the opt-in sample of wrong answers),
                      classgoal.mjs, live.mjs (in memory, server-sent events),
                      teamduel.mjs, privs.mjs (give up root), writing.mjs
                      (Ritun vikunnar), reader.mjs (the text reader: limits,
                      timeout, forgetting, the quote check, for every plug;
                      plugs reader-greynir.mjs and reader-fake.mjs)
Dockerfile, fly.toml  the server as a container, and where it runs
Dockerfile.build, build-in-container.sh   the pinned build (see above)
test-together.sh      four test pupils on your own computer, or the server for several testers
.github/workflows/    ci.yml (tests, bundle, manifest, the reproducible build),
                      typecheck.yml (tsc, docs/TYPES.md)
                      and release.yml (a tag → a release)
tools/                build, version (the file name), manifest, coverage, pack,
                      pwa (manifest and icons), ÍNO converter, tests in
                      Chromium (browser-test, server-test), load-test,
                      try-sentences.py, task-snapshot.mjs (what the builders
                      build from fixed seeds — to compare two versions) and
                      sim/ (simulated pupils; see its README), review.mjs (the review
                      page), content-from-py.py (moved the content out of
                      Python; for branches made before)
tests/                node --test tests/*.test.js
_grammar-audit/       the audit's notes, and three scripts that print what the
                      app generates so a person can read it (see below)
docs/                 HOSTING.md (Fly.io), PRIVACY.md (GDPR: the record, consent,
                      requests, a breach), SERVER.md (your own machine), API.md,
                      DEFINITIONS.md, LESEFNI.md, CURRICULUM.md (the app against the
                      aðalnámskrá and the textbooks; its tables are written by
                      tools/curriculum-doc.mjs)
```

## The data model, briefly

Every word carries its BÍN forms in a fixed slot order (`lexicon.orders`), its
frequency rank `r` and score `q`, and — for nouns — a semantic class `s`, an
optional í/á convention `p` and an exclusion flag `nx`.

Every sentence carries its tokens, each with word class `c`, BÍN mark `m`,
syntactic role `r`, clause type `k`, verb government `g`, and `u` — the
features the surface form could not settle, which are never asked about.
A sentence with a `slot` is a *frame*: the noun in the slot can be swapped
for any noun whose class is in `need` (and whose convention matches `ps` if
the slot stands under *í* or *á*, and whose gender matches `rk` if something
in the sentence agrees with it). `fixed` means an adjective or pronoun sits
beside the slot and no swap is allowed; `nf` means the sentence is never used
as a cloze, because the case after *með* depends on what is meant.

That one mechanism — frames × BÍN — is how the frames of the sentence bank show
every noun in every one of its 16 forms inside a real sentence (all cells but
the plural of mass nouns, excluded on purpose; `node tools/coverage.mjs` prints
the current figures).

## Efnið — the hand-written content

Every sentence, exercise item, frame and Villuveiðar item a person wrote is in
`content/`, one plain text file per list, so that a teacher or a native reader
can read it, correct it and add to it without reading Python:

```
content/setningar/setningar.tsv     the sentence bank (1,130 sentences)
content/setningar/lino-rammar.tsv   words allowed into one frame each (word, frame, checked by)
content/villuveidar/villur.tsv      the real errors of Villuveiðar
content/malbeiting/sameina.tsv      pairs for Sameina og skipta: two short sentences and one joined
content/lysingarord/ …/ordafordi/   exercise items and frames, by category
content/setningafraedi/             „Hver gerði hvað?“: sentences with who did what to whom
content/REVIEW-NOTES.md             what a native reader should check first
```

**The format.** UTF-8, one item per line, the fields separated by a TAB. A line
that starts with `#` is a comment. The first other line names the columns, and
the comment block at the top of each file says in Icelandic what each column
holds (`þyngd`, `setning`, `svar`, `skýring` …). A word asked about is written
`lemma|class|BÍN mark` (`hún|pfn|ÞGFET`); a list is comma-separated. Nothing is
quoted, so a field cannot hold a TAB. `pipeline/content_io.py` explains every column type.

**Editing.** Any text editor that keeps TABs works, and so does a spreadsheet
(LibreOffice, Excel, Google Sheets): open the file as tab-separated, keep the
header row and the column order, and save it again as *tab-separated text,
UTF-8*. Then:

```
python3 pipeline/content_io.py      # a second: every file read, or the file and line that is wrong
./build.sh                 # the real check: every form against BÍN, every sentence through Greynir
git diff content/          # one changed line per changed item
```

The build stops on a column moved or renamed, a field that is not what its
column holds, a word BÍN does not have, a sentence Greynir cannot parse, a
claim the government table contradicts or — in „Hver gerði hvað?“ — a gerandi
or þolandi the parse does not give, and names the file and line or the
sentence. The manifest then stops once more on purpose: read what it lists and
accept it (`./build.sh --accept`).

**Adding sentences.** Add a line to `content/setningar/setningar.tsv`. The build
refuses a sentence that does not parse, that is longer than its level allows,
whose analysis contradicts BÍN or the government table, or whose blank is fixed
by a numeral. To try a candidate first:

```
python3 tools/try-sentences.py "Ég sá hestana í gær." hestur concrete
python3 tools/try-sentences.py --gloppur     # what the bank still lacks
```

Then read what the new sentence generates — the build cannot tell
"Kýrin liggur á borðinu" from Icelandic, and a reader can:

```
node _grammar-audit/sample.mjs 6          # every open frame with six nouns in it
node _grammar-audit/sample-adj.mjs        # every adjective frame with every adjective
node _grammar-audit/sample-tasks.mjs 8 5  # eight questions of every type, as text
node _grammar-audit/sample-new.mjs 8      # the v6.11 types, eight of each
```

Three things to know when writing one: use the past tense for a transitive
verb with *ég* (*Ég sé hestana* parses as the subjunctive of *vera*); keep
the subject *ég* or *við* where the gender should stay free; and say exactly
which nouns the blank accepts — `drink` for *Ég drekk ___*, not `thing`. The
full rules are at the top of `pipeline/sentences.py`, and the rules for each exercise
list at the top of its file.

**A word for one frame.** A frame takes the nouns of the classes its `þörf`
names, and that is sometimes too coarse: *hugtak* is not a text, yet
"Kennarinn útskýrði hugtakið fyrir bekknum" is a good sentence. Rather than
widen the frame for every abstract noun, write the pair down, one per line, in
`content/setningar/lino-rammar.tsv`: the word, the frame (the sentence exactly
as it stands in `setningar.tsv`; that is the frame's id) and who read the
two together. The build lets that word into that frame and changes nothing
else. The form is never written: it is BÍN's, under the frame's own mark, and
a pair the frame or BÍN contradicts (a pinned gender, í/á, a plural nobody
says, a word already in the sentence) stops the build with the file and line,
as an unknown frame or word does. The word need not be on LÍNO-2; the build
reports which are. The review page shows each pair as the sentence it makes.
`pipeline/frame_allow.py` has the rules.

**The review page.** `node tools/review.mjs` (also run by `./build.sh`) writes
`dist/review.html`: one self-contained page with every hand-written item —
the files above, the 24 Lesefni pages and the worked examples — each with its
answer, explanation, level and file:line. It filters by kind, level, text and
by *þarf að athuga*: the items a note in `content/REVIEW-NOTES.md` is about,
with the note beside them. A reader marks items *Í lagi* or *Athuga*, writes a
comment, and *Sækja athugasemdir* downloads the marks as a text file; nothing
leaves the browser. To flag something new for a native reader, add a note to
`content/REVIEW-NOTES.md` with `Leita:` phrases from the items (the tests fail if a
phrase stops finding one).

**What is still in code.** The Lesefni pages and the worked examples
(`src/js/content/lessons.js`, `examples.js`) are plain data in JavaScript that
the app imports as it is; they are on the review page, and are edited where
they are. The closed grammatical tables (ordinals, months, multi-word
conjunctions, `sentences.GROUPS`), the clause and phrase rules of `pipeline/phrases.py`
and the short list of adjectives that fit a kind of noun in
`src/js/tasks/frames.js` stay in code too.

## The guard, briefly

Greynir is a good parser and still wrong a few times in a hundred sentences,
usually by choosing a rarer lemma that happens to have the form (*sáum* as
the present tense of *sá* "to sow" rather than the past of *sjá*). The guard
withdraws such a token's analysis — the build prints each one — and the
program never asks about it. Everything else a question is built on has been
checked against BÍN. The design rule behind all of it: **a wrong question is
worse than no question**, so every builder returns nothing rather than guess.

## Licences

BÍN (CC BY-SA 4.0, Stofnun Árna Magnússonar), Greynir (MIT, Miðeind), the
OpenSubtitles frequency list (hermitdave/FrequencyWords), Bricolage Grotesque,
Public Sans and IBM Plex Mono (OFL; bundled, notice in `src/fonts/OFL.txt`), and
Íslensk nútímamálsorðabók (CC BY-SA 4.0) for the definitions, and LÍNO-2, the
Icelandic academic word list (Auður Pálsdóttir & Sigríður Ólafsdóttir 2023,
CLARIN-IS http://hdl.handle.net/20.500.12537/307, CC BY 4.0). The full list
is at the bottom of the Stillingar og námsefni tab and in `data/licenses.js`. ShareAlike applies to the built
file: it contains ÍNO's definitions.
