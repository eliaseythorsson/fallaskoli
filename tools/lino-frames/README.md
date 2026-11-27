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
