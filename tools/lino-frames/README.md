# LÍNO-2 nouns in the noun frames (issue #21)

The authoring pass of `docs/DLD-PLAN.md` §2, steps 1–2. **Outside the build**:
nothing in `build.sh`, `tools/build.mjs`, `pipeline/` or the app imports or runs
this directory (`tests/lino-frames.test.js` holds that). It reads the built data
and writes *candidates* to `dist/lino-frames/` (not committed). No candidate
reaches a pupil until it is a line of `content/setningar/lino-rammar.tsv`, which
only the self-check (#22) and a person put there.

```
node tools/lino-frames/run.mjs --dry-run                     # no calls: the filter, the prompt, an estimate
node tools/lino-frames/run.mjs --fake tools/lino-frames/fixtures/dry-run --limit 20   # recorded answers
ANTHROPIC_API_KEY=… node tools/lino-frames/run.mjs --count-tokens   # exact prompt size (free endpoint)
ANTHROPIC_API_KEY=… node tools/lino-frames/run.mjs --limit 20       # the first real run
ANTHROPIC_API_KEY=… node tools/lino-frames/run.mjs                  # every noun
```

Options: `--out DIR`, `--limit N` (best LÍNO rank first), `--words a,b|kk`,
`--concurrency N` (default 4, after a first call alone that writes the cache).
A run that stops can be started again with the same `--out`: answers already in
`responses/` for the same prefix and prompt version are reused, failed nouns are
asked again. It exits 1 if any noun failed (`run.json` says why).

## What it does

1. **Mechanical filter (no cost).** The LÍNO-2 list is read by the build's own
   reader (`pipeline/lino.py`), the frames and nouns from `data/data_bundle.js`
   through the app's lexicon. A *noun frame* is a sentence whose slot holds a
   noun other nouns may replace (`tasks/frames.js` `substitutable`). A LÍNO-2
   noun is tried in a frame when the app would show it there *if the pair were
   written* — `acceptsNoun` with the word named in `al`, and not `repeatsNoun`:
   gender pinned by the frame (`rk`), í/á (`ps`), plural, article, the word
   already in the sentence — and the frame does not take it already (by its
   class or an existing pair). Nouns on `noun_classes.EXCLUDE` are not tried; a
   pair cannot override it. Every other word on the list goes to `fill-in.tsv`.
2. **One call per noun** to `claude-opus-5-5`, effort `low`, over `fetch`
   (Messages API, `anthropic-version: 2026-10-21`). The system prompt is the
   instructions and the whole numbered frame list, marked
   `cache_control: {type: "ephemeral"}`; it is byte-identical for every noun, so
   it is written once and read from the cache after. The user turn names the
   noun, its ÍNO definition and the frames its grammar allows (as ranges). The
   answer is structured output: `{"frames": [{"n": 17, "why": "…"}]}`. The model
   judges meaning only; forms are BÍN's.
3. **Output and cost.** A frame number not asked about is dropped and reported;
   a response that is not that JSON (or stopped at `max_tokens`, or refused)
   keeps nothing. The cost is computed from each response's `usage`
   (`input_tokens`, `cache_creation_input_tokens` with its 5m/1h split,
   `cache_read_input_tokens`, `output_tokens`, thinking included) at the prices
   in `lib.mjs` `PRICES` — an assumption copied from
   <https://platform.claude.com/docs/en/about-claude/pricing> on 27.11.2026
   (input $4, cache write $5, cache read $0.20, output $20 per million tokens);
   check that page before a real run.

## The files in `--out` (what #22 reads)

| file | what |
|---|---|
| `candidates.tsv` | one accepted pair a line (below) |
| `run.json` | the run: `id`, `mode` (`api`/`fake`), `model`, `effort`, `promptVersion`, `prefixHash`, `frames`, `prices`, `total`; and per noun `key`, `o`, `c`, `lino`, `asked` (frame numbers), `already` (how many frames take it already), `accepted`, `dropped`, `error`, `cost` |
| `cost.md` | the cost report: tokens of each kind and dollars, per noun and in total, and the estimate for this selection and for every noun |
| `fill-in.tsv` | the LÍNO-2 words that go to the fill-in (#23): `orð`, `flokkur` (BÍN class), `LÍNO-sæti`, `ástæða`, `setningar` (bank sentences it stands in now) |
| `prefix.txt` | the cached prefix exactly as sent; its frame numbers are the `nr` of the candidates |
| `responses/<orð>.<kyn>.json` | (real runs only) each raw API response with the prompt it answered; reused on a restart, and usable as `--fake` fixtures |
| `requests/<orð>.<kyn>.json` | (`--dry-run` only) the request body that would be sent |

`candidates.tsv` is tab-separated, UTF-8, with `#` comment lines and one header
line, like the files under `content/`. Columns:

| column | |
|---|---|
| `orð` | the word **exactly as `lino-rammar.tsv` writes it**: the lemma, or `lemma\|kyn` when the vocabulary has it in two genders |
| `kyn` | kk / kvk / hk |
| `rammi` | the frame: the sentence **exactly as in `content/setningar/setningar.tsv`** (the frame's id there and in `lino-rammar.tsv`) |
| `nr` | the frame's number in this run's prefix (only meaningful with `prefixHash`) |
| `mynd` | the slot's BÍN mark (e.g. `ÞFETgr`): the cell of the word's paradigm the sentence needs |
| `í eyðunni` | the word in the slot now |
| `rök` | the model's reason, in English, at most a few words |
| `líkan` | the model id |
| `keyrsla` | the run id: `<prefixHash>-v<promptVersion>` |

`lib.mjs` `readTsv` reads it (and `lino-rammar.tsv`) into objects keyed by
column name. A candidate becomes a line of `lino-rammar.tsv` by keeping `orð`
and `rammi` and adding `yfirfarið af`. The self-check fills the word in with
`tasks/frames.js` `fillFrame` under `mynd`.

## The self-check, the second opinion and the review queue (issue #22)

`docs/DLD-PLAN.md` §2 steps 3 and 5. Also **outside the build**: `check.mjs`
writes a batch folder for the owner, `accept.mjs` turns the owner's verdicts
into lines of `content/setningar/lino-rammar.tsv`, and only that file is read
by the build, which checks each pair like one written by hand
(`pipeline/frame_allow.py`). No model is called by the build, by a test or by CI.

```
node tools/lino-frames/check.mjs --no-second        # fill + parse only: free, no key
ANTHROPIC_API_KEY=… node tools/lino-frames/check.mjs # fill, parse, ask Fable 5.2, write the queue
node tools/review.mjs                               # dist/review.html: the queue comes first
#   … the owner writes já / nei in review/lino-rammar/<keyrsla>/yfirferd.tsv …
node tools/lino-frames/accept.mjs --by "eigandi, 28.11.2026" --dry-run   # what would happen
node tools/lino-frames/accept.mjs --by "eigandi, 28.11.2026"             # append to lino-rammar.tsv
./build.sh                                          # the pairs become data; explain the manifest diff in the PR
```

`check.mjs` reads `dist/lino-frames/candidates.tsv` (`--candidates FILE`) and
writes `review/lino-rammar/<keyrsla>/` (`--out DIR`), a folder that is meant to
be committed with the batch's `data/…` PR. It can be run again at any time:
answers in `responses/` are reused when the sentences and the prompt version
are the same, and verdicts already written in `yfirferd.tsv` are kept.

1. **Fill.** Each pair is made into the sentence a pupil would read by the
   app's own `tasks/frames.js` `fillFrame`: the frame's slot, the word's form
   under the slot's BÍN mark, from the built data. Where BÍN has two forms in
   the cell, both sentences are made and both must pass everything below. A
   pair the app would refuse even if it were written (the frame was reworded,
   the mark moved, a pinned gender, í/á, plural, article) stops here.
2. **Parse** (`parse_check.py`). The sentence goes through what every bank
   sentence goes through in the build, `pipeline/build_sentences.py`
   `annotate` (Greynir, then `pipeline/parse_guard.py` on every token), and is
   compared with the frame as built. It passes when it parses, the guard
   raises no hard error, the slot is read as that noun in the frame's mark
   with the frame word's role, and every other word keeps its class, mark,
   role and clause. A refusal means the program cannot vouch for the sentence,
   not that it is wrong: *Ég sá brúna á myndinni* is refused because *brúna* is
   also a verb. Of 592 random pairs the app already shows by class, 34 (5.7%)
   were refused this way; all 15 pairs then in `lino-rammar.tsv` passed. Refused pairs go no
   further (`staða` *vél hafnar* in `checked.tsv`, with the reason).
3. **Second opinion.** `claude-fable-5-2`, effort `medium`, one call per noun
   over `fetch`, structured output
   `{"sentences": [{"n": 1, "ok": true, "why": "…"}]}`. It gets the noun, its
   definition and the finished sentences, each with the form and what form it
   is meant to be, and judges each sentence exactly as written: the form, what
   it stands with, and the meaning. It is not told what Opus said. Every
   sentence must be answered once; otherwise the noun's pairs stay *óathugað*,
   `check.mjs` exits 1 and the batch cannot be accepted until it is run again.
4. **The queue.** Opus accepted every candidate, so a Fable *no* is a
   disagreement: all of those go to the owner. Of the pairs both accepted, a
   sample goes too: `SAMPLE_RATE` 5%, but never fewer than `MIN_SAMPLE` 20 (or
   all of them), drawn by a hash of `SAMPLE_SEED`, the run id and the pair, so
   the same batch gives the same sample everywhere. The review page
   (`node tools/review.mjs`) shows the queue first, under *LÍNO-2: pör til
   yfirferðar*, each sentence with the two models' reasons and its file and
   line, marked *þarf að athuga* until it has a verdict.
5. **Verdicts.** The owner writes `já` or `nei` in the first column (`dómur`)
   of `yfirferd.tsv`; its header says the same in Icelandic. The marks on the
   review page itself stay in the browser and are not verdicts. `accept.mjs`
   refuses to go on until every line has one. Then:
   - the **error rate** is the share of *nei* in the sample (the
     disagreements do not count: they were picked because a model objected);
   - if it is **over `REDO_THRESHOLD` (5%)**, the batch is **marked for redo**:
     `batch.json` gets `"status": "redo"`, the command exits 3, and none of the
     pairs nobody read is written. Tighten `INSTRUCTIONS` in `lib.mjs`, bump
     `PROMPT_VERSION` and run both passes again. Why 5%, and why the sample is
     at least 20: the comments on the constants in `check-lib.mjs`;
   - otherwise the pairs both models accepted are appended to
     `lino-rammar.tsv` with `yfirfarið af` = *Opus 5.5 og Fable 5.2; úrtak
     lesið: …*;
   - in both cases every pair the owner said *já* to is appended with the
     `--by` text: a person has read that sentence.

   A batch whose second opinion came from `--fake` is never written into
   `content/` (`--dry-run` shows what would be).

### The batch folder

| file | what |
|---|---|
| `candidates.tsv` | the first pass's output, as it was when checked |
| `parse.json` | each filled sentence and what the parse said (`--parsed FILE` reads this shape instead of running Greynir) |
| `checked.tsv` | every pair: the sentence, `vél` and `Fable` (já/nei and why), `staða` (*samþykkt*, *úrtak*, *ósammála*, *vél hafnar*, *óathugað*) |
| `yfirferd.tsv` | **the file the owner edits**: `dómur`, `setning`, `orð`, `rammi`, `ástæða`, `Opus`, `Fable`, `athugasemd` |
| `batch.json` | `status` (`parsed`, `incomplete`, `review`, `accepted`, `redo`), the counts, the sample constants, the second model's token usage as the API reported it, and after `accept.mjs` the verdicts' summary |
| `responses/<orð>.<kyn>.json` | (real runs only) each raw answer with the prompt it answered |

No dollar figure is computed for the second pass: `batch.json` has the token
counts from `usage`; the pricing page has the price.

## The fill-in: new sentences for the words the bank barely has (issue #23)

`docs/DLD-PLAN.md` §2 step 4. Also **outside the build**: `fillin.mjs` writes a
batch folder for the owner, `fillin-accept.mjs` appends the sentences the owner
said yes to to `content/setningar/setningar.tsv`, and only that file is read by
the build, which parses and checks each like one written by hand.

```
node tools/lino-frames/fillin.mjs --dry-run                        # free: the words, the prompt, the requests, an estimate
ANTHROPIC_API_KEY=… node tools/lino-frames/fillin.mjs --count-tokens   # exact prompt size (free endpoint)
ANTHROPIC_API_KEY=… node tools/lino-frames/fillin.mjs --limit 20       # the first real batch
node tools/review.mjs                                               # dist/review.html: the queue comes first
#   … the owner writes já / nei in review/lino-setningar/<keyrsla>/yfirferd.tsv …
node tools/lino-frames/fillin-accept.mjs --by "eigandi, 28.11.2026" --dry-run
node tools/lino-frames/fillin-accept.mjs --by "eigandi, 28.11.2026"
./build.sh                                                          # the sentences become data; explain the manifest diff
```

Options of `fillin.mjs`: `--out DIR` (default `review/lino-setningar/<keyrsla>`,
meant to be committed with the batch's `data/…` PR; `--dry-run` writes to
`dist/lino-fillin/`), `--limit N` (best LÍNO rank first), `--words a,b|so`,
`--concurrency N` (default 4, after a first call alone that writes the cache),
`--fake DIR`, `--parsed FILE`. Run it again with the same `--out` at any time:
answers in `responses/` for the same prefix, prompt version and word are reused
(a stopped run resumes; a word whose answer failed is asked again), and verdicts
already in `yfirferd.tsv` are kept. It exits 1 if any word failed.

1. **Which words (no cost).** Every LÍNO-2 word in the vocabulary (as
   `pipeline/lino.py` reads the list; a lemma listed in two classes is two
   words) that the app can show in fewer than `TARGET` (5) sentences: the bank
   sentences written with it (a token `lexicon.js` `entryForToken` resolves to
   it, as `fill-in.tsv` counts), and for a noun the frames that take it, by its
   class or by a pair in `lino-rammar.tsv`. So run it **after** a batch of
   pairs (#21/#22) has been accepted and built: a noun that got its frames
   drops out. Today that is **1,718 words** (459 have 5 or more; 119 LÍNO-2
   lemmas are not in the vocabulary and cannot be asked). Each is asked for
   `max(MIN_NEW, TARGET − sentences)` new ones, so at least 2.
2. **One call per word** to `claude-fable-5-2`, effort `medium`, the shape of
   the calls of #21 and #22. The system prompt, marked
   `cache_control: {type: "ephemeral"}` and byte-identical for every word, is
   `INSTRUCTIONS` and then **the repository's own rules for writing a sentence,
   verbatim**, read from the files at run time (`RULE_SOURCES` in
   `fillin-lib.mjs`): the docstring of `pipeline/sentences.py` (the format, the
   length table, *What a slot needs*, the three rules learned the hard way,
   *Writing for levels 6 and 7*), the header of `setningar.tsv`, the README's
   *Adding sentences*, and the plan's step 4; then the first four bank
   sentences of each level as examples. A change to any of those files changes
   the prefix hash and so the run id. The user turn names the word, its class,
   its ÍNO definition (told that it is the dictionary's first sense, not
   necessarily the one to write about), up to four of the bank sentences it
   stands in, and how many to write. The answer is structured output:
   `{"sentences": [{"level", "text", "form", "why"}], "note"}`. Fixed sentences
   only: a noun's sentence names it as its own slot with `þörf` *none* (the
   cloze asks for the word itself), any other word's has no slot, and no noun
   class is added.
3. **The checks.** A candidate is dropped, with its reason in `checked.tsv`,
   when it is not one sentence (capital, final stop), the bank or the run has it
   already (the build stops on the same text twice), or it fails what every bank
   sentence goes through: `parse_check.py` (kind `written`) runs the build's
   `annotate` (Greynir, then `parse_guard` on every token), then the build's own
   `check_lengths` and `check_numeral_predicative` on it. Then `judge()`: the
   word must stand in it **exactly once** as the app resolves tokens
   (`entryForToken`), with a reading the guard did not withdraw, and a noun as
   the sentence's slot. Whether the sentence gives a usable recall gap
   (`tasks/recall.js` `gapForms`) is reported, not required.
4. **The queue.** Every sentence that passes goes to the owner: Fable wrote
   them, so there is no second model whose yes could stand in for a reader, and
   the plan asks for every new Fable sentence to be reviewed. `yfirferd.tsv`
   has `dómur`, `setning`, `þyngd`, `orð`, `flokkur`, `eyða`, `Fable`,
   `athugasemd`; the review page lists them first, under *LÍNO-2: nýjar
   setningar til yfirferðar*, marked *þarf að athuga* until judged.
5. **Verdicts.** `fillin-accept.mjs` refuses to go on until every line has `já`
   or `nei` and every sentence is as it was written (correct a sentence by
   saying *nei* with a comment, or later in `setningar.tsv` itself). It appends
   the *já* sentences at the end of `setningar.tsv` under a comment naming the
   run, each line's `athugasemd` saying *LÍNO-2: <orð> (Fable 5.2, keyrsla …;
   lesið: <--by>)*, skipping any the file has. If more than `REDO_THRESHOLD`
   (5%) got *nei*, `batch.json` gets `"status": "redo"` and it exits 3: tighten
   `INSTRUCTIONS`, bump `PROMPT_VERSION` and run the remaining words again. The
   sentences that got a yes go in either way (each was read). A batch from
   `--fake` is never written into `content/`.

### The fill-in's batch folder

| file | what |
|---|---|
| `prefix.txt` | the cached prefix exactly as sent |
| `candidates.tsv` | every sentence the model wrote: `orð`, `flokkur`, `þyngd`, `setning`, `mynd`, `rök`, `líkan`, `keyrsla` |
| `parse.json` | each sentence's parse verdict and `annotate` record (`--parsed FILE` reads this shape instead of running Greynir) |
| `checked.tsv` | every sentence: `vél` (já/nei) and why, `eyða`, `staða` (*til yfirferðar* / *vél hafnar*) |
| `yfirferd.tsv` | **the file the owner edits** |
| `report.tsv`, `report.md` | **the counts per word, before and after**: sentences before, recall gaps before, asked, written, dropped, to review, accepted, after; and the totals (words reaching 5, words with none, words with a recall gap). Before the review "after" assumes every queued sentence is accepted; `fillin-accept.mjs` rewrites both with the real numbers. `report.md` also has the cost from `usage` and the estimates |
| `batch.json` | `status` (`review`, `incomplete`, `accepted`, `redo`), the run, the prices, the cost, per word what came back, and after acceptance the verdicts |
| `responses/<orð>.<flokkur>.json` | (real runs only) each raw answer with the prompt it answered |

The cost is computed from each response's `usage` at `PRICES` in
`fillin-lib.mjs`: Fable 5.2 at $8 input, $10 cache write, $0.20 cache read and
$40 output per million tokens, from the pricing page on 27.11.2026; check it
before a real run.

## Tests

`tests/lino-frames.test.js` uses a stand-in lexicon and recorded answers only;
the command line is run with `--fake` and `--dry-run`, with
`ANTHROPIC_API_KEY` removed. CI never calls Claude.

`fixtures/dry-run/` holds 20 answers for the 20 best-ranked nouns. **They are
fakes**, written by hand by the agent that built this (each says so in `_fake`),
with `usage` numbers made up from the prompt length to show the report's shape.
They are not judgements anyone should use; a frame number in them that a later
build no longer allows for that word is dropped like any other.

`tests/lino-selfcheck.test.js` holds the self-check the same way.
`fixtures/check/` has the 14 fake candidates of the dry run, a **real**
recording of what Greynir says about their sentences (`parse.json`; one test
re-runs the parse where the build's Python packages are installed and fails if
the recording is stale), and `second/`: nine answers **written by hand, not by
Claude** (each says so in `_fake`).

`tests/lino-fillin.test.js` holds the fill-in the same way. `fixtures/fillin/`
has `answers/`, eleven sentences for six words **written by hand by the agent
that built this, not by Claude** (each file says so in `_fake`; one is too long
for its level on purpose), and a **real** recording of what the build's checks
say about them (`parse.json`; one test re-runs the parse where Greynir is
installed and fails if the recording is stale).
