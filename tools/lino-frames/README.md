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

## Tests

`tests/lino-frames.test.js` uses a stand-in lexicon and recorded answers only;
the command line is run with `--fake` and `--dry-run`, with
`ANTHROPIC_API_KEY` removed. CI never calls Claude.

`fixtures/dry-run/` holds 20 answers for the 20 best-ranked nouns. **They are
fakes**, written by hand by the agent that built this (each says so in `_fake`),
with `usage` numbers made up from the prompt length to show the report's shape.
They are not judgements anyone should use; a frame number in them that a later
build no longer allows for that word is dropped like any other.
