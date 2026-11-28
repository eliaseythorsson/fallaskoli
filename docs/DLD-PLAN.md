# Vocabulary, comprehension and stories: the plan

*Decided with the owner on 2026-11-23, after a grilling session. The evidence these
decisions rest on is in `docs/DLD-RESEARCH.md`; section letters (B, C, D …) below
refer to it.*

## Why

Fallaskóli should help teenagers with developmental language disorder
(málþroskaröskun, DLD) to

1. build functional and academic vocabulary,
2. understand and summarise complex or ambiguous sentences, paragraphs and short stories,
3. tell structured stories that make sense,

and do it in a way every pupil benefits from, so that nobody is singled out.

The evidence in short: pupils with DLD learn what they are taught explicitly,
especially few words taught deeply, visual coding of sentence structure, and story
grammar with fading support. They rarely transfer it to untaught material, and no
self-paced app has been trialled with DLD teenagers (DLD-RESEARCH §E). Icelandic DLD
seems to show less in inflection and more in vocabulary, syntax and discourse
(Thordardottir 2008, §F), so these new skills should get real time.

## Principles (owner decisions)

- **For everyone, in the core.** New skills and question types are open to every
  pupil. There is no support mode, no flag and no different pacing: the existing
  difficulty mechanism (`core/difficulty.js`, þyngd) slows a pupil who gets more
  wrong. **No label is ever shown**: "DLD" and "málþroskaröskun" never appear on a
  pupil's screen.
- **Self-paced.** Designed for the pupil working alone. An adult may use it, but no
  feature depends on one.
- **Text and on-device TTS only.** No recorded or generated audio for now.
- **Graded by the app where possible; by Claude where not**, and only for pupils
  the administrator has switched on (see *LLM grading*). Other pupils never see
  those question types.
- **Content is AI-drafted, checked by BÍN and Greynir, and reviewed by the owner.**
  There is no speech-language therapist reviewer for now.
- **No effectiveness probes.** Held-back test items were considered and dropped.
- "A wrong question is worse than no question" still holds everywhere.

## 1. Word track (LÍNO-2)

**Source.** LÍNO-2, the Icelandic academic word list: 2,294 Tier-2 lemmas
(Ólafsdóttir & Pálsdóttir 2023, CLARIN-IS handle 20.500.12537/307, **CC BY 4.0**;
add it to `data/licenses.js` and the README's licence list). Put the CSV in
`sources/` with its checksum, like `sources/freq_raw.txt`.

**Everywhere.** `pipeline/build_freq.py` ranks LÍNO-2 lemmas up, just as it ranks up
words from the program's own sentences, so they show up in inflection, analysis,
case government, synonym and context questions wherever a frame takes them. The
sentences for abstract words come from §2.

**Six words in learning.** There are always six LÍNO-2 words in an intensive phase,
taken in LÍNO frequency order within the pupil's þyngd. The pupil only sees this as
*Orðin mín* (words in learning, words I know).
In ordinary practice (Lota dagsins, a session the pupil chose) about one in three
of the questions that could be about a word in learning are about one, in every
category (#13: `LEARNING_SHARE` in `src/js/tasks/view.js`). A word in learning may
be asked though it is rarer than the question's frequency pool, when it fits the
frame. Duels, live rounds, rescue drills and reviews have no preference.

**First meeting: Orðakort (required card).** Builds on Word Discovery (Lowe 2019, §B).
1. Read: the ÍNO definition, 2–3 sentences, syllables, and an abbreviated inflection table.
2. Self-rating: *aldrei heyrt / heyrt það / get notað það*.
3. In my own words: what does it mean? The definition is hidden while the pupil writes.
4. My sentence: use the word in a sentence about my own life.
5. Three related words, and how each one connects.
6. Word class and category, and an opposite if there is one.

With the LLM on, steps 3–5 are free text, graded under *LLM grading*. A thin
answer gets **one** follow-up question and one go at revising. Step 5 is never
skipped. With the LLM off, steps 3–5 are structured choices: the right
explanation, the sentence that uses the word correctly, and related words from a
list (`content/ordafordi/samheiti.tsv`, noun classes). The pupil's answers are
**kept in their own progress**, like a notebook. On review they sometimes see their
own card again and add to it. PRIVACY.md gets a line on this; the cards go out with
the pupil's data on export and are erased with it.

*The structured version as built (#15).* A word enters the six only when its card
is done; the card comes before a session the pupil chose, one at a time, and cannot
be closed (*Orðin mín* also offers the next one). Its steps: read · self-rating ·
the right explanation of three (the definition is off the screen) · the sentence
that uses the word correctly · the words that mean nearly the same · word class ·
a noun's gender. **Every option comes from BÍN, ÍNO or a hand-written list, and a
step without enough checked material is dropped for that word** rather than filled
in; the rule for each step is at the top of `src/js/tasks/wordcard.js`. In short:
the wrong explanations are ÍNO definitions of two other words, proposed by the
program and then read by a person (`src/js/content/wordcards.js`); the sentence
step exists for words with a line in `content/ordafordi/merking.tsv` (#11); the
related words are the synonym groups of `samheiti.tsv`; the syllables are shown for
words whose joints are written down (`src/js/content/syllables.js`); a card is
about one sense, so only sentences tied to that sense are shown.
`node tools/wordcards.mjs` prints the cards for review. The answers are kept in
`S.wordCards` (`src/js/core/wordcard.js`), a slice marked as the pupil's own text.

*The free-text version as built (#37, #38).* For a pupil with server grading
on, steps 3–5 are free text, each in place of its structured step: `eigin`
(the explanation, graded against the card's sense), `min` (a sentence about my
own life that uses the word) and `tengsl` (three related words, a row each
with how it connects, sent as one numbered text). Each is a question type of
its own (`or_eigin`, `or_setning`, `or_tengsl`), with a rubric of our words
and a server rubric beside it (`server/rubric-*.mjs`). **Step 5 never
skipped** is read as: the structured step 5 is dropped for a word with no
synonym group, but `tengsl` needs no material, so it is on every card of a
switched-on pupil, and "Senda" waits for all three words. A thin answer gets
one follow-up question and one revision (`core/answer.js`).

*The card back in a review, as built (#18).* One review in three of a learned word
(`REVISIT_RATE`, drawn from a generator seeded by the review entry, `tasks/review.js`) is
followed, after its answer, by the pupil's own card: the definition, what they
chose (with the right answer where theirs was not), what they wrote on a free-text
card (`eigin`, `min`, `tengsl`), and the sentences they added before. They may add a newer self-rating
and a sentence of their own that holds the word; both are optional and kept on the
card with the day (`x`), the first rating and answers untouched.

**The intensive phase.** The word comes up in many question types, mixed together,
grammar included: recall in a sentence gap (first-letter hint, then none), choosing
the meaning, a synonym or antonym, choosing the sentence that fits, inflection,
analysis, and the pupil's own sentence (LLM). `tasks/next.js` favours words in
learning in every category where they fit. Recall comes before recognition
(retrieval with feedback, §B).

**Learned.** A word leaves the intensive phase and joins the existing review queue
(`core/review.js`, 1 → 3 → 7 → 21) when it has been answered correctly in ≥4
different question types, including ≥1 recall, on ≥2 different days, with the last
3 answers correct. A new word then takes its place.

**Hard words.** A word counts as hard after 3 wrong answers about it across
question types within 14 days; this applies to every word, not only LÍNO-2. First
time: a "Þrjár í röð" on the word (`core/streak.js`). If it happens again: back to
the intensive phase, Orðakort included. The guardian's view gets a list of hard
words; the pupil sees nothing different.

**Spacing.** The "never the same day" rule (the GATE of core/spacing.js) is **dropped**; #10 deleted that file and `S.vocab`.
The one rule is never the same word in the same question type twice in a row. The
same word in a different type, or in a different inflection question, may come
straight after.

**Meaning question.** "Hvað þýðir orðið?" comes up several times more often for
all words and counts toward the session (today: `weightInRun: 0`, an ungraded
bonus). With the LLM on, the explanation is graded against the ÍNO definition;
with it off, the pupil picks which of three sentences uses the word correctly.
*As built (#38):* with the LLM on, `or_skyring` asks "Hvað þýðir orðið?" about
a word met in the session first and has it read with the explanation's rubric;
it counts. `or_merking` (#11) stays as it is, for everybody.

## 2. Sentences for the LÍNO-2 words (authoring pass, outside the build)

The build never calls a model, because CI rebuilds data byte for byte. This is a
one-off authoring pass whose output is committed content.

1. **Mechanical filter (no cost).** Only LÍNO-2 nouns are tried in the 956 noun
   frames of `setningar.tsv` (1,131 sentences in all). BÍN and the frame machinery
   handle agreement (case, `rk`, í/á `ps`), so the model judges *meaning only*.
2. **Opus 5.5, one call per noun.** The frame list is a cached prefix (~24k tokens).
   The model returns the frame numbers where the word makes sense. About $0.025 per
   word.
3. **Self-check.** Every accepted pair is filled in with the right BÍN form and
   judged as a whole sentence (yes/no + reason).
4. **Fable 5.2 fill-in.** Every word with fewer than 5 sentences (including all
   verbs, adjectives and adverbs) gets at least 2 new sentences written by the rules
   at the top of `pipeline/sentences.py`. Fixed sentences only, with no new noun
   classes in the first batch.
5. **Second opinion and review.** Fable 5.2 rechecks every pair Opus accepted. The
   owner reviews on the review page every pair where the two disagree, a random 5%
   sample of the rest, and **every** new Fable sentence. If the sample shows too
   many errors, the batch is redone with a stricter prompt.

Storage: accepted pairs go in a new `content/setningar/lino-rammar.tsv` (lemma,
frame id, checked by), read by the build as an allowlist on top of the noun
classes. New sentences go into `setningar.tsv`. Everything still passes Greynir
and `pipeline/parse_guard.py`. Each batch is its own `data/…` PR with the manifest diff.
Estimated cost of the whole pass: roughly $100–150, about half with the Batch API.

## 3. Sentence comprehension

- **Colour coding of structure**, made from the Greynir parse that every sentence
  already has: phrases by role, subordinate clauses boxed, connectives marked.
  It is our own scheme on the Shape Coding principle (Ebbels 2007/2014, §C); don't
  use that name or its shapes. The colours fade as þyngd rises. They are used in
  the new tasks and as an optional hint in the existing Setningafræði tasks.
- **New question types, in the existing categories:**
  - *Hver gerði hvað?* on passives, relative clauses, *hvorki…né*, *ekki aðeins…heldur
    einnig*, and sentences that can be read two ways → **Setningafræði**.
  - Connectives for cause and time (*af því að, þess vegna, þegar, síðan, en*) and
    understanding *hvorki…né* → **Óbeygjanleg orð** (samtengingar).
  - Combining two short sentences into one complex sentence, and splitting one
    into two (SKILL's vertical structuring, Balthazar & Scott) → **Málbeiting**
    (umritun).
- Teach one structure at a time, in order: adverbial → complement → relative clauses.

## 4. Texts

- **Format:** one file per text in `content/textar/`, with fields for þyngd, kind
  (saga / fræðitexti), the LÍNO-2 target words, the story-map or main-idea marks,
  pronoun references and hand-written questions. The build parses every sentence
  with Greynir, so it can be colour-coded and its words checked against BÍN. Texts
  go on the review page.
- **Length grows with þyngd:** 2–3 sentences, then a paragraph, then 150–300 words.
- **Two kinds:** stories (also the models for Frásögn) and short subject texts on
  science, history and society, each carrying 2–3 LÍNO-2 words in learning.
- **Start with about 20 texts**, AI-drafted and owner-reviewed, then more.
- **New skill Lesskilningur** on the Færnikort, in the curriculum presets for all
  years.

**Story comprehension: MAIN's story map.** MAIN is the narrative assessment adapted
to Icelandic by Hrafnhildur Ragnarsdóttir (2020), built on Stein & Glenn's story
grammar, the model also taught in Joffe 2019. Each episode has **aðstæður** (who,
where, when), **kveikja/vandi**, **markmið**, **tilraun**, **útkoma** and
**viðbrögð/tilfinning**, with six icons used throughout the program. Tasks: which
sentence is the vandi, what was the markmið; fill the story map; choose the summary
that follows the map; at higher þyngd, stories of 2–3 episodes.

**Subject texts: main idea and gist** (Stevens 2019, §C; summarising rules after
Brown & Day 1983, to be added to DLD-RESEARCH): which sentence is the main idea →
which 2–3 details support it → the best gist sentence of four → write a gist of at
most about 15 words (LLM).

**Pronoun reference.** Tap the word that *hann / hún / það / þeir* refers to. In
Icelandic the pronoun follows grammatical gender (*steinninn… hann*). The referent
is marked in the content, because Greynir doesn't resolve reference. At higher
þyngd there are same-gender distractors (*Jón hitti Pál. Hann var þreyttur.*), and
possibly genuinely ambiguous items ("það er ekki hægt að vita", then make the
sentence clear). The owner will try those out before deciding.

## 5. Frásögn (telling stories)

New skill **Frásögn**, with the same six MAIN icons. Every Frásögn session holds one
complete short story, however small the pupil's part (Favot 2021, §D). The path,
unlocked by þyngd:

1. Order a scrambled short story. *(graded by the app)*
2. Find the missing story part. *(app)*
3. Choose the right connective. *(app)*
4. Fill one story part in a model story. *(LLM)*
5. Write a parallel story with the icon frame. *(LLM)*
6. Write your own story with the icons as a checklist. *(LLM)*

Connectives for cause and time and words for inner states (*hélt, vildi, varð
hræddur*) are taught directly, because work on story structure doesn't improve them
by itself (§D). Pupils without the LLM get steps 1–3 only.

**Share of Lota dagsins:** the three new skills (Námsorð, Lesskilningur, Frásögn)
together take about 3 of its 10 questions. Built in #19: `NEW_SKILLS` and
`NEW_SKILLS_SHARE` in `src/js/core/today.js`. The share is set aside first and
the rest of the session is shared out by the old rule; only a new skill that is
switched on and has a question type that may be asked counts, so with none the
plan is exactly the old one. Adding a skill is one id in `NEW_SKILLS`.

## 6. LLM grading

- **Where it runs:** the website calls Claude **through the server** (`server/`),
  never from the browser, because a key can't sit in a page anyone can open. On a
  file or plain host the LLM question types don't exist.
- **Who gets it:** the **administrator** switches it on per pupil. Pupils without
  it never see the LLM question types. Guardians can't switch it (maybe later).
- **Model:** Opus 5.5 at low effort by default, with Fable 5.2 as a server setting
  to compare. Test both on about 30 real texts before deciding. Cost is roughly
  2–9 US cents per grading, or about $0.25–1 a week for an active pupil.
- **Rubric only**, as evidence-based as possible: summary (main point, key points,
  nothing invented, own words); story (the MAIN parts present, sensible order,
  connectives, inner-state words); word card (meaning right, sentence uses the
  word correctly, links real). There is never a mark out of 10 or a free opinion.
- **Quote check:** for every tick or cross, the model must quote the pupil's text it
  relies on. The server checks that the quote really is in the text and discards
  any claim whose quote isn't there.
- **Feedback:** a checklist plus *one* question that prompts a revision. It never
  rewrites the pupil's text. Spelling and grammar stay with GreynirCorrect. XP is
  for finishing and revising, not for the verdict.
- **Privacy:** a new PRIVACY.md section. Names are stripped. Claude is used under
  a no-training, no-retention arrangement. Story and summary texts are not stored
  after grading. Word cards are kept in the pupil's own progress (§1).

*As built (#37).* The Claude plug of the server's text reader
(`server/reader-claude.mjs`, plain `fetch` to the Messages API, JSON schema
output) with the explanation rubric in `server/rubric-eigin.mjs`: two points,
`merking` (main) and `eigin`; the definition is looked up on the server by the
word key. The first type is `or_eigin` (Orðaforði), which is also the
Orðakort's free-text step in place of the choice of explanation. Settings:
`ANTHROPIC_API_KEY` (a Fly secret), `FALLASKOLI_CLAUDE_MODEL` (`opus`/`fable`),
`FALLASKOLI_CLAUDE_EFFORT` (`low`). Zero data retention is an organisation-level
arrangement with Anthropic, and Fable 5.2 cannot run under it (PRIVACY.md §1h).

## Build order

Each step is one or more PRs and can be released on its own, following CLAUDE.md
(one item per branch; content in `.tsv`; new types at the end of `ORDER`).

1. Word track without the LLM: LÍNO-2 in the build, six in learning, structured
   Orðakort, the learned and hard-word rules, the new spacing rule, the meaning
   question more often.
2. First sentence batch (§2).
3. Colour coding, *Hver gerði hvað?*, connectives, combining and splitting
   sentences.
4. Texts: format, 20 texts, story map, main idea and gist, pronoun reference.
5. Frásögn steps 1–3.
6. LLM grading on the server: per-pupil switch, rubric, quote check, PRIVACY.md.
   This unlocks Orðakort free text, gists and summaries, and Frásögn steps 4–6.

## Open

- Genuinely ambiguous pronoun items: the owner will try them out.
- The exact share of LÍNO-2 nouns, and the real cost of §2, will be known after
  the mechanical filter.
- Brown & Day (1983) still to be added to DLD-RESEARCH.md with a citation.
