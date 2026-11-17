# Grammar audit of Fallaskóli — handover 3 (11 Nov 2026)

The audit is finished for what it was asked to cover: the sentences, the words
that are drilled, and the question types. The result is **v6.5.0**,
`fallaskoli-v6.5.html`. What was done is in `CHANGES.md` under v6.5; this note
is the state of the build and what is still open. `fallaskoli-v6.4.html` and
`backup-v6.4-before-session3.tgz` (every source file as it was) are the way
back.

## State of the build

- Data built in a Linux VM (Python 3.10, reynir 3.8.0, islenska 1.3.2), in the
  order `build.sh` uses; manifest accepted after the token-level difference
  from v6.4 was read: 11 tokens changed, all intended (six reflexives lost
  `tala`, four tokens withdrawn, nothing else), 6 sentences replaced, 3 added.
- 396/396 unit tests (16 new, `tests/audit.test.js`).
- **The browser tests were run this time**, in headless Chrome on Linux, on the
  built file: `browser-test.mjs` 162 checks, 0 problems; `server-test.mjs` 59
  checks, 0 problems.
- `node_modules` in this folder is the Mac's (esbuild for darwin-arm64). The
  HTML was therefore bundled on Linux from a copy of this folder and written
  back. On the Mac, `./build.sh` should reproduce it; if the manifest
  complains about one of the three coin-toss tokens (*þeirra*, *okkur* in
  "útskýrði fyrir okkur", *um bók*), read the difference and `--accept`.
- `_grammar-audit/_to_delete/` holds two files I could not delete (the session
  may not delete in this folder): throw it away.

## How to read what the app generates

    node _grammar-audit/sample.mjs 6 [seed]      every open frame × 6 nouns
    node _grammar-audit/sample-adj.mjs           every adjective frame × every fit
    node _grammar-audit/sample-tasks.mjs 8 5     8 questions of every type, as text
    python3 _grammar-audit/dump.py               every sentence with its annotation

Two passes of `sample.mjs` (386 frames × 6, then 380 × 5) were read in full
and everything found was fixed. A third pass with another seed will still find
a few sentences that make one smile ("Blaðran er þung", "Ég á þrjú geimskip")
— see "soft spots".

## Decisions made for the owner — reverse any with one line

1. **What "acts of violence and lewd acts" covers** (`vocab_filter.UNFIT`).
   Removed: killing, sexual violence, terror, torture, execution, kidnapping,
   shooting, *ofbeldi* and *árás*; pornography and prostitution; the verbs for
   the same acts; *morðóður, graður, þroskaheftur, hommalegur*.
   Kept in the tables (and out of generated sentences): anatomy; war and
   history (*stríð, orrusta, her, innrás, bylting, þrælahald*); theft (*rán,
   innbrot, þjófur*); weapons; drugs and drink; insults (*drusla, dræsa, tík,
   fáviti, kelling*); *kynlíf, kynfæri, standpína, fullnæging*; the verbs
   *drepa, slátra, hengja, skjóta, berja*; the crude everyday verbs (*skíta,
   míga, æla*). *ofbeldi* is the one I would put back if a school asked: it is
   a word the curriculum itself uses.
2. **Frequency cap** (`build_freq.py`): shared forms count for at most three
   times a word's own. This reorders the vocabulary (rarity tiers move for a
   few hundred words). Remove the `min(...)` to go back.
3. **`fyrstur` is gone** from the adjectives. The ordinals *annar … tuttugasti*
   are drilled as töluorð; *fyrsti* is not drilled at all, because BÍN has it
   only as the adjective *fyrstur*. Putting it among the ordinals needs a
   special case in `build_lexicon.py`.

## Still open

> **v6.13 (critique item 30):** points 1 and 2 below were taken up. Every
> unclassified noun was read (`noun_classes.py`: `ABSTRACT`, `NO_FRAME`, and
> "in no list = not used in a frame"), every adjective has the nouns it is
> shown with or none, and the adjectives that are not compared have lost
> their comparison forms (`adj_classes.py`). `node tools/semantic-sample.mjs
> 300 <seed>` prints generated questions as text for reading, and
> `tests/semantic.test.js` keeps a list of outputs that must not come back.
> What is still soft: `group` in frames where people act ("Mamma gaf
> stjórninni mjólk"), `object` on the beach ("Fjöldi gaffla lá í fjörunni"),
> and the abstract nouns after *án*.

1. **Soft spots in generated sentences** (grammatical, sometimes odd):
   - the 1,380 unclassified nouns are `abstract` and meet only the frames that
     take anything; ~15 obviously concrete ones were classified, the rest
     (*toppur, botn, blettur, hrúga, klessa*) were left;
   - `object` is broad (*sending, reikningur, húsgagn, fallhlíf*): "Fallhlífin
     stendur á borðinu";
   - `person` still holds film vocabulary (*fógeti, lávarður, sjeik,
     dánardómstjóri*); rank weighting keeps them rare;
   - `vehicle` includes *geimskip* and *þyrla*: "Ég á þrjár þyrlur".
2. **Adjective tables** use *maður / kona / barn* as the helper noun for every
   adjective: "rangari börn", "breskustu mennirnir". BÍN lists a comparative
   for adjectives that have none in use (*dauðari*, *breskari*). A list of
   adjectives that are not compared would fix the second; a helper noun chosen
   by the adjective's meaning the first.
3. **ÍNO definitions** (6,071) were not read. One seen in passing looks
   garbled by the conversion: *léttur* — "sem er vegur ekki þungt".
4. **Never looked at** (outside the brief): badge names and descriptions, the
   panels and settings, `docs/PRIVACY.md` and the Icelandic privacy notice.
5. **JS without a test** (unchanged from handover 2): `judgeSyntax` and
   `structureNote` in `ui/render.js`, the "crowded" rule in `taskFill`,
   `firm()` in `taskVerbSlot`.
6. **Parser limits** (unchanged): "… hvað X heitir" has no subordinate clause
   in the parse; *í* + time word gets its case by guess and is never asked.
7. **A child who already collected a removed word** keeps it in the
   collection (shown without a rarity tier). Nothing breaks; it is not asked
   again.

## Things worth knowing before touching the code again

- `noun_classes.py` has a new class, `critter`. A frame takes it only through
  `any`, `concrete`, `sight`, or by naming it.
- `need` may name a class the sentence's own noun does not belong to ("Við
  keyrðum fram hjá vitanum" takes `building`; *viti* is a `struct`). The own
  noun is shown wherever the sentence is used as written.
- `lexicon.json` verbs carry `mm` (middle voice attested) and `t3` (third
  person only). Both are read in `tasks/index.js` only.
- `government.VERB_CASES` is still load-bearing: a transitive verb new to the
  bank has to be added there (*mæta* was already in it).
- `parse_overrides.ACCEPT_LEMMA` now holds *mætti/mættum → mæta*: the
  frequency check prefers *mega*, which takes no object.
