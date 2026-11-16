# Fallaskóli

An Icelandic grammar trainer for a teenager: noun, adjective, pronoun, numeral
and verb inflection, word-class analysis, case government, sentence parts and
clause types, and the grammar used — finding and fixing errors, building
sentences from dictionary forms, and rewriting sentences — with XP, levels, badges and a word collection on top.

Everything grammatical in the program is read out of two sources and never
written by hand: **BÍN** (Beygingarlýsing íslensks nútímamáls, via the
`islenska` package) for every inflected form, and **Greynir** for the
analysis of every sentence. The one hand-built table is `noun_classes.py`,
which says what nouns *mean* (a person, a place, a drink …) so that sentences
can be generated without nonsense.

## Running it

The app is one HTML file, `dist/fallaskoli-v6.12.html` (built by `./build.sh`; not
committed — every release is a git tag). It works three ways, with
nothing configured — the program looks at where it was loaded from:

| how it is opened | where progress lives |
|---|---|
| double-clicked from a folder (`file:`) | this browser, `localStorage` |
| served by any plain web host — a hosted page, GitHub Pages, Netlify, a folder on a school server | this browser, `localStorage` |
| served by `server/server.mjs` | on the server, behind a login (see `docs/SERVER.md`) |

**Testing with several people from your own computer:** `./test-together.sh`
runs the server for everyone on the same Wi-Fi; `./test-together.sh --internet`
gives a temporary https address that works from anywhere (needs
`brew install cloudflared`, no account). Test accounts and progress live in
`_prufa/`, apart from `server/data`, and never go into the image or the zip. `./test-together.sh demo 3`
makes demo1–demo3 for trying several accounts yourself; open each on its own
address (`http://demo1.localhost:8080`, `http://demo2.localhost:8080` …) to stay
logged in as all of them at once.

For one child on several devices the second row is the simplest: put the file
anywhere on the web and open the same link everywhere. Progress is then kept
per device; **Stillingar og námsefni → Færa milli tækja** moves it between devices as
a small JSON file. The server route adds accounts, a leaderboard within a group
and progress that follows the child automatically and merges between devices.
`docs/HOSTING.md` puts it on Fly.io for a few dollars a month;
`docs/PRIVACY.md` is what running it for other people's children asks of you.

## Building

```
./build.sh              # everything: data, tests, bundle, browser checks
./build.sh --accept     # after a deliberate change to the data
```

Needs Python 3.10+ with `pip`, Node 18+, and for the browser checks a Chromium
(`CHROME_PATH=/path/to/chrome`; they are skipped otherwise). Debian/Ubuntu:
`apt install -y nodejs npm python3 python3-pip`. The grammar libraries ship
Linux wheels for x86_64 only.

What the build does, in order:

1. `build_freq.py` — the committed frequency list (`freq_raw.txt`, OpenSubtitles)
   → `freq_lemmas.json`, ranked towards school reading: words the hand-written
   sentences, exercises and definitions use ×3, film register (vocab_filter.py
   `SUBTITLE_REGISTER`, and ÍNO's *niðrandi*/*gróft*) ×0.1
2. `build_lexicon.py` — every attested lemma's paradigm out of BÍN → `lexicon.json`
3. `build_sentences.py` — every sentence in `sentences.py` parsed by Greynir
   and checked by `parse_guard.py` → `sentences.json`
4. `build_bundle.py` — lexicon + sentences + semantic classes + definitions
   → `data/data_bundle.js`; `build_exercises.py` — the hand-written items in
   `exercises.py`, every answer, option and cue looked up in BÍN →
   `data/exercises.js`
5. `tools/manifest.mjs` — a fingerprint of all of the above. If anything
   changed since the last accepted build the build stops and lists the change;
   `--accept` records it. This is what stops a parser upgrade from quietly
   changing a grammatical analysis.
6. `node --test tests/*.test.js`, then `tools/build.mjs` bundles `src/` into
   the HTML file, then `tools/browser-test.mjs` and `tools/server-test.mjs`
   drive it in a real Chromium.

`node tools/pack.mjs` writes `dist/fallaskoli-v6.12-src.zip` with everything.

## Where things are

```
sentences.py          the sentence bank: (level, text, slot, need[, options])
noun_classes.py       semantic class of every noun; í/á convention; exclusions
government.py         which cases prepositions and verbs govern — used only to
                      REJECT a parse that contradicts it, never to assert one
parse_guard.py        the checks every token passes: the lemma is plausible, the
                      mark exists in BÍN, government agrees with the table,
                      features the form cannot settle are marked uncertain
parse_overrides.py    declared decisions about readings the guard accepts
definitions.py        a handful of hand-written definitions; the rest are ÍNO
exercises.py          hand-written items for the v6.11 question types (pronouns,
                      numerals, dates, government, synonyms …): sentences and
                      lemma + class + BÍN mark only; build_exercises.py
                      resolves every form in BÍN and checks every word
vocab_filter.py       lemma errors and words for acts of violence (always
                      removed), the coarse-word block list (on by default,
                      the administrator can switch it off), and the words
                      build_freq.py ranks down as film-subtitle register

src/js/app.js         start-up and wiring; the only holder of state
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
src/js/core/mix.js    the mix rule for a session: ≥3 kinds of question, none
                      over ~40%, tables ≤30%, analysis ≤35%
src/js/core/curriculum.js  the curriculum map as data: the official
                      criteria, the nodes (one thing a pupil learns, with its
                      year, question types and Lesefni page) and what the
                      8., 9. and 10. bekkur presets switch on
src/js/tasks/         the question builders, one file per category:
                      nafnord.js, lysingarord.js, sagnord.js, fornofn.js,
                      toluord.js, obeygjanleg.js, greining.js, fallstjorn.js,
                      ordaford.js, setningafraedi.js, malbeiting.js,
                      setningagerd.js. registry.js is the catalogue: every
                      question type declares its skill, renderer, diagnosis
                      tags and the steps of difficulty it knows. A builder is
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
                      dom.js, panels.js, progress.js, account.js, policyui.js
src/head.html         the stylesheet
src/fonts/            the three typefaces, inlined into the built file
server/               the optional multi-user server (Node, JSON files on disk):
                      server.mjs (routes), store.mjs (files, cache, erasure),
                      auth.mjs, guard.mjs (what is stored and believed),
                      privacy.mjs (the notice), backup.mjs, admin.mjs (CLI)
Dockerfile, fly.toml  the server as a container, and where it runs
tools/                build, manifest, coverage, pack, ÍNO converter, tests in
                      Chromium, try-sentences.py, task-snapshot.mjs (what the
                      builders build from fixed seeds — to compare two versions)
tests/                node --test; 505 tests
_grammar-audit/       the audit's notes, and three scripts that print what the
                      app generates so a person can read it (see below)
docs/                 HOSTING.md (Fly.io), PRIVACY.md (GDPR: the record, consent,
                      requests, a breach), SERVER.md (your own machine), API.md,
                      DEFINITIONS.md, CURRICULUM.md (the app against the
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

That one mechanism — frames × BÍN — is how 733 sentences show 3,700 nouns in
every one of their 16 forms inside a real sentence (99.7% of all cells; the
rest are mass nouns in the plural, excluded on purpose).

## Adding sentences

Add a line to `sentences.py` and run `./build.sh`. The build refuses a
sentence that does not parse, that is longer than its level allows, whose
analysis contradicts BÍN or the government table, or whose blank is fixed by a
numeral. To try a candidate first:

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
which nouns the blank accepts — `drink` for *Ég drekk ___*, not `thing`.

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
Íslensk nútímamálsorðabók (CC BY-SA 4.0) for the definitions. The full list
is at the bottom of the Stillingar og námsefni tab and in `data/licenses.js`. ShareAlike applies to the built
file: it contains 6,000 of ÍNO's definitions.
