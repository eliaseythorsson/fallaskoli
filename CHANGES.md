# Changes

## Unreleased

### Orðaþekking: ein saga fyrir hvert orð (#8)
- **Hvert svar um orð er skráð með degi og spurningagerð** (rétt, rangt eða séð), ein færsla á
  spurningu, í nýrri einingu (`core/wordknowledge.js`) sem lærðu orðin og erfiðu orðin byggja á.
  Engin breyting sést. Prófnemendur byrja með tóma orðasögu (útgáfa 12): XP, merki og stig haldast.

### Skemmd framvinda hrynur ekki lengur
- **Skemmd eða fölsuð vistuð framvinda** þar sem dagsfærsla er `null` (eða ekki hlutur) felldi hleðsluna og
  athugun þjónsins. Nú er sú færsla sleppt og aðrir dagar haldast; próf setur rusl inn í hverja færsluskrá
  framvindunnar. Auk þess var `lastLogin` skrifað en aldrei lesið (og alltaf hent við hleðslu): skrifið er fjarlægt.

### Framvindan: hver sneið á sínum stað (#50)
- **Engin breyting sést**: hver sneið framvindunnar (dagar, merki, upprifjun, stillingar …) er
  skilgreind í einingunni sem á hana, og hleðsla, sameining tækja og athugun þjónsins fara aðeins
  yfir listann. Vistuð framvinda hermds nemanda á tveimur tækjum kemur bæti fyrir bæti eins út og áður.

### Framvindan, sneið fyrir sneið (#49)
- **Öryggisnet undir framvindunni**: hver hluti hennar (sneið) er á einum lista
  (`core/slices.js`), og próf sendir framvindu með öllum sneiðum fylltum gegnum hleðslu,
  sameiningu tækja og athugun þjónsins og stöðvast ef sneið týnist. Engin breyting sést.
  Eigin texti nemandans (orðakortin sem koma) verður aðeins nemandans (`docs/PRIVACY.md` §1g).
### Námsorð (LÍNO-2)
- **Orð leyfð í einstaka ramma** (#20): ný skrá, `content/setningar/lino-rammar.tsv`, þar sem
  skráð er að tiltekið orð megi standa í tiltekinni setningu bankans þótt merkingarflokkur þess
  geri það ekki („Kennarinn útskýrði *hugtakið* fyrir bekknum“, „Ég man *ástæðuna* vel“).
  Beygingarmyndin kemur áfram úr BÍN. Fyrstu 15 pörin eru komin inn og sjást útfyllt á
  yfirlitssíðunni; móðurmálshafi á eftir að lesa þau.
- **Námsorðaforðalistinn LÍNO-2 í smíðinni** (#9): orð á listanum koma oftar fyrir í æfingum
  (×3 í tíðniröðun), orð sem textalistinn þekkir ekki koma inn úr BÍN, og hvert orð ber
  sæti sitt á listanum (`lino`). LÍNO-2 (CC BY 4.0) er komið í leyfalistann. Skráin sjálf,
  `sources/lino2.csv`, bætist við einu sinni (`python3 pipeline/lino.py` segir hvernig);
  þangað til varar smíðin við og gögnin eru óbreytt.
### Setningafræði
- **Vísbending sýnir byggingu málsgreinarinnar** í „Smelltu á rétta orðið“: frumlag, umsögn,
  andlag, sagnfylling, forsetningarliðir og samtengingar fá hvert sinn lit, sína línu og
  heitið sitt undir, og aukasetningar ramma — allt nema það sem spurt er um, og aðeins það
  sem greiningin er viss um. Sést jafnt á töflu og blaði og án lita (#25).
- **Byggingin í öllum spurningum Setningafræði, og hún dofnar með þyngd**: á þyngd 1–2 er
  hún sýnd frá byrjun, á þyngd 3–5 fæst hún með „Vísbending“ (helmingi minna XP), frá
  þyngd 6 er hún ekki í boði. Hún merkir aldrei það sem spurt er um né skilur svarið eitt
  eftir ómerkt; eftir svarið er það merkt líka (#26).

### Plan: vocabulary, comprehension and stories
- **`docs/DLD-RESEARCH.md`**: the evidence on interventions for teenagers with
  developmental language disorder (vocabulary, complex sentences and texts, narrative),
  and what it means for a self-paced trainer.
- **`docs/DLD-PLAN.md`**: the owner's decisions — LÍNO-2 word track, colour-coded
  sentence structure, texts with MAIN's story map, Frásögn, LLM grading per pupil.
- **`docs/agents/`** and an *Agent skills* section in `CLAUDE.md`: issues live in
  GitHub Issues, the default triage labels, single-context domain docs.
### Docs
- **`CONTEXT.md`**: the project's glossary (pupil, skill, question type, þyngd, word,
  word entry, word knowledge, word in learning, learned and hard words, the pupil's own
  text …), from the architecture review of 2026-11-24. Agents use these words.
- **`docs/adr/`**: the first four decisions: word knowledge keeps every entry; the server
  returns findings and the browser judges; the pupil's own text is only the pupil's;
  server grading is off unless switched on.

### Textalesari á þjóninum (#47)
- **Ritun vikunnar er óbreytt**: yfirlestur GreynirCorrect fer nú um einn lítinn textalesara
  (`server/reader.mjs`) sem heldur tímamörkum, „margir í einu“, stærð textans, því að textinn
  gleymist, og því að hver athugasemd vísi í texta nemandans. GreynirCorrect er fyrsta tengið
  (`server/reader-greynir.mjs`); Claude (#37) verður annað.
### Tegundir spurninga
- **Ein skrá lýsir öllum tegundum spurninga** (`src/js/core/catalogue.js`, #46): heiti, lýsing, flokkur, þyngdarþrep, `recall` og `grader` á einum stað, í röð einvíganna; ný tegund er ein færsla þar og einn smiður í skrá flokksins. Umsjónarmaður getur nú leyft „spurningar sem þjónninn les“ fyrir einn nemanda í einu (slökkt nema kveikt sé á því); engin slík tegund er til enn. Sömu spurningar koma úr sama fræi og áður.
- **Tengiorð í Óbeygjanlegum orðum** (#28): tvær nýjar tegundir spurninga, skrifaðar fyrir nemendur með málþroskaröskun. Í *Veldu tengiorðið* er valið á milli *af því að, þess vegna, þegar, síðan* og *en* í stuttum setningum úr daglegu lífi; í *Hvað segir setningin?* er spurt hvað setning með *hvorki … né* eða *ekki aðeins … heldur einnig* segir. Sá sem velur rangt sér hvers vegna einmitt sá kostur gengur ekki. Atriðin eru handskrifuð (`content/obeygjanleg/tengiord.tsv`, `tengiord-skilningur.tsv`) og Lesefni um óbeygjanleg orð hefur fengið kafla um tengiorð.

### Færnikort
- **Langt heiti flokks fer ekki út fyrir rammann**: „Orðflokkagreining“, „Setningafræði“
  og „Setningagerð“ ýttu „Stig“ og „þyngd“ út fyrir kassann sinn. Nú færast þau í næstu
  línu þegar ekki er pláss (`.smhead h3` brotnar, `.smname` getur minnkað).

### The website updates itself
- **`WEBSITE.md`**: the owner's whole guide to hosting, without Terminal — a Fly.io
  account, one key pasted into GitHub, one button.
- **Set up website (once)** (`.github/workflows/setup-website.yml`): creates the Fly app
  and its disk, builds and deploys, and creates the administrator account (password
  printed once). Safe to run again.
- **Deploy website** (`.github/workflows/deploy.yml`): every change to `main` is tested,
  built and deployed with `--ha=false`; a failing test leaves the website on the previous
  version. Does nothing (and stays green) until the website is set up.
- **`Update website.command`**: double-click on the Mac to pull GitHub's changes and push
  the folder's own; the website follows.
- `fly.toml`: app name `fallaskoli-elias`.

## v6.14.1

### Færnikort: nýtt stig sést
- **Talan í hringnum** er þyngdin sem hringurinn mælir, og þyngdin í haus hvers flokks.
  Hringur mælir nú hæstu þyngd sem kortið hefur sýnt (`S.mapBand`), svo talan lækkar
  aldrei og hringur tæmist ekki lengur þó að ný heimsókn byrji hálfu stigi neðar.
- **Þegar þyngd hækkar** sýnir kortið það einu sinni: lína yfir kortinu nefnir flokkana
  (hver hnappur skrunar að sínum), hringir flokksins sem lækka renna út, þyngdin í hausnum
  telur upp (2 → 3 → 4) og hringirnir koma aftur með nýju tölunni. Lína undir hausnum segir
  hvað gerðist.
- **Margar hækkanir í einu**: flokkur hreyfist þegar hann sést á skjánum, einn í einu,
  mest þrír í hvert sinn; hinir eru sýndir strax eins og þeir eru nú, með sömu línu.
  Flokkur sem aldrei sást bíður næstu heimsóknar. Engin hreyfing ef tækið biður um minni
  hreyfingu. Kennari sér tölurnar en enga hreyfingu.

### The owner's second pass (6.14 in use)
- **Færnikort er fyrsti flipinn**: Færnikort · Æfa · Lesefni · Merki og framvinda ·
  Skólastofan · Stillingar. „Stillingar og námsefni“ heitir nú **Stillingar**.
- **Villugreining lýsingarorða**: *gömlu* fyrir *gamalli* (*hjálpaði gamalli konu*) er
  nú „Sterk og veik beyging“ (greininum bætt við), ekki „Samræmi í kyni“. Reglan í
  „Sterk og veik beyging“ byrjar á greininum og nefnir að lýsingarorð á eftir *er* sé
  sterkt (*hann er sterkastur*); skýringin við efsta stig í setningu segir af hverju.
- **Beygingartafla lýsingarorða**: fyrirsögnin er „frumstig, veik beyging · karlkyn,
  eintala, með greini“ — það sem á við nafnorðið stendur saman og greinirinn síðast.
  Taflan velur lýsingarorð sem eiga hjálparnafnorð, og reitirnir enda allir í sömu línu
  (nafnorðið fær breidd þess lengsta).
- **Sterkt efsta stig stendur ekki með nafnorði**: tafla í sterku efsta stigi (*stærstur,
  stærstan …*) sýnir ekkert nafnorð heldur skýringu (*hann er stærstur*, en *stærsti
  maðurinn*), og setningar í „Stigbreyting í setningu“ nota það aðeins á eftir *er/var*.
- **Aldrei sama spurningin tvisvar í röð** í lotu (sama tegund, orð, reitur og setning).
- **Merki um rétt svör í röð** („5 í röð“, „20 í röð“, „Engar vísbendingar“ o.fl.) eru
  aðeins prófuð á svarinu sem lengdi röðina; spurning sem er hvorki rétt né röng gat
  áður veitt sama merkið aftur. Merki sem unnust utan lotu (einvígi, umferð) og opnast
  yfir samantektinni eru nú nefnd sér í samantektinni.

## v6.14 — November 2026 (the 84-item critique of v6.12)

Developed under the working name 6.13 (the integration branch, the project notes and the
code comments still say "v6.13"); released as 6.14. There is no v6.13 release.

Everything below implements the v6.12 critique ("Fallaskóli v6.12 — critique
and improvement list", 84 items); the item numbers refer to it. Item 10 (the
duel data fingerprint) was left out by the owner's decision; item 40 is part
of item 84. A v6.12 state opens and is migrated; nothing a pupil earned is
taken away.

### The owner's first pass over the 6.13 test build
- „Dagsins lota“ heitir nú **„Lota dagsins“**.
- **Færnikortið** er grind: hver flokkur í kassa, kassarnir í hverri röð jafnháir
  og slóðirnar byrja í sömu hæð; einn dálkur á síma, tveir á spjaldtölvu, þrír á borðtölvu.
- **Ritun vikunnar**: reiturinn var hvítur með hvítu letri á töflunni; nú krít á töflu.
- **Lotur úr færnikortinu og af Lesefnissíðu halda sig við efnið.** „Kyn og tala
  nafnorða“ greinir nú aðeins nafnorð (var öll orð). Viðtengingarháttur, miðmynd og
  fallhættir koma á hvaða þyngd sem er þegar beðið er um þá með nafni — áður gaf
  lota á þyngd 1–2 engar spurningar og endaði strax.
- **Fallhættirnir í „Greindu orðið“.** Nafnháttur, sagnbót og lýsingarháttur þátíðar
  voru aldrei spurðir (orðmyndin er eins og mynd með tölu, *koma*, *komið*); setningin
  sker úr og þeir eru nú spurðir. Fallhættir á færnikortinu fá „Greindu orðið“ á sagnir.
- **Þyngd:** „Greindu orðið“ á lýsingarorð og „Forsetning eða atviksorð?“ sóttu
  stundum setningar á þyngd 6–7 handa nemanda á þyngd 1; nú fyrst setningar nærri þyngdinni.
- **Prófun á eigin tölvu:** `./test-together.sh` opnar nú fjóra prufunemendur hlið við
  hlið á einni síðu, hvern innskráðan, á stigatöflunni og tilbúna í einvígi
  (`tools/quad.mjs`). Prófun með öðrum: `./test-together.sh --lan` / `--internet`.

### Learning
- **Review queue (18–20).** Every wrong answer comes back the next day, then
  after 3, 7 and 21 days; a session opens with up to three due reviews; a
  missed cloze noun returns 3–5 questions later in the same session.
- **Lota dagsins (21) and Þrjár í röð (36).** One main button: due reviews,
  then the pupil's error patterns, then new material. A diagnosed miss can be
  followed at once by three questions on its pattern, rule first.
- **Difficulty follows the pupil (11, 12, 13, 16, 17).** Each skill's level is
  stored and driven by recent accuracy (two right raise half a level, one
  wrong lowers half); every question type follows the level or says it does
  not; a second axis for how irregular a word and how hard a form is; the
  server calibrates difficulty automatically from anonymous counts, in small
  capped steps, with no manual review.
- **Guided first run (84, 40).** Year choice, a short placement round that sets
  each skill's starting level, and a tour of the main parts of the app.
- **One more try (42).** A wrong typed answer may be tried once more with the
  rule in view, at half XP, before the answer is shown.
- **Mastery, lessons and the skill map (44, 41, 83).** A mastery mark per skill;
  "Æfa þetta" on every Lesefni page; a worked example on the first question of
  each type; one skill map of every curriculum topic replaces four overviews.
- **Curriculum (39).** `docs/CURRICULUM.md` maps the aðalnámskrá to skills,
  question types and lessons; three year presets (8., 9., 10. bekkur).
- **Second language (45).** Glosses for content words, a gentler ramp, and
  read-aloud with the device's Icelandic voice.

### Questions
- **New types (27, 28).** Kind of pronoun; strong or weak noun; strong or weak
  verb and kennimyndir; germynd, miðmynd or þolmynd; boðháttur; kinds of
  subordinate clause; phrases; direct and indirect speech — with three new
  Lesefni pages for year 10.
- **Variety (23, 24, 3, 15).** At least 150 distinct questions at every level
  for every type (except two closed-class tables); 40 new frames, and no
  handful of sentences carries a type; Setningasmiðja works at þyngd 4–5;
  noun fill-ins ask the dative and genitive more.
- **Levels 6 and 7 (14).** 139 and 78 new sentences.
- **Rewrites (29).** No double time phrases; four new kinds: passive to active,
  statement to question, joining with a conjunction, indirect speech.
- **Real errors (26).** Villuveiðar uses 134 real teenage errors from þyngd 3.
- **Analysis (1, 49).** Greindu orðið asks the word class first and gives
  nothing away; one row at a time, fits a phone.
- **Content fixes (5, 6, 7, 25, 30, 43).** *hlakka til* explained by the
  preposition; motion/rest items with one right answer; corrected rule texts;
  conjunction choices that are all real candidates; a semantic clean-up of
  generated sentences; two-option questions asked in pairs.
- **Safe vocabulary (9).** The coarse-word filter is on by default and covers
  76 words; vocabulary ranked closer to school reading than subtitles.

### Error diagnosis (8, 31–35)
New patterns (y/ý/ey, n/nn, ð/d, Sögnin ekki beygð, Ógreint); weak plural
past endings recognised; nominative/accusative ties filed by what was asked;
a pattern is "active" only with enough evidence.

### Screen and accessibility (2, 47, 48, 50–53, 55)
During a session one slim line replaces the header; the letter pad sits under
the input and can be hidden; teacher settings behind "Fyrir kennara og
foreldra"; verdicts announced to screen readers; a reading-comfort setting.

### Rewards (22, 56–61)
"N atriði bíða upprifjunar" instead of XP decay; badges and a "Framfarir"
board for mending, not volume; streaks count weeks (4 days of 7); a weekly
class goal; the level curve fits one session a day; badges wait for the
session summary.

### Classroom (37, 62–67, 46)
Teachers see the group's error patterns (with CSV) and set assignments; duels
are graded on the server, each side gets its own questions of equal weight,
and a lower-level player gets a handicap; a live class round on the projector;
team duels; Ritun vikunnar (three sentences of the pupil's own, read by
GreynirCorrect; off unless the teacher turns it on). The privacy notice
(version 2026-11-16) describes every new data flow.

### Code and build (69–80, 82)
Grading is a pure module (`core/answer.js`); task builders are pure, one file
per category, with the random source passed in; `app.js` is split into
controllers; type checking of the pure modules; simulation and property tests
in CI; installable as an app with offline use; a measured server limit and a
load test; a pinned build container and CI that checks the data rebuilds byte
for byte; hand-written content in `content/*.tsv` with a review page
(`dist/review.html`); the root sorted into `pipeline/`, `sources/`, `data/`;
test accounts kept outside the project; docs brought up to date.

### Earlier in Unreleased

- **The project is a git repository.** Built files go to `dist/` (ignored);
  every release is a tag (`v6.12.0` onward), and pushing a tag attaches the
  built HTML to a GitHub release. `_backup/`, `_to_delete/` and the row of
  old `fallaskoli-v6.*.html` files are gone from the project. CI runs the
  tests on every pull request. See `CLAUDE.md` for how work is split into
  branches.

## v6.12 — November 2026 (feedback after 200 answers)

A v6.11 state opens unchanged; `fallaskoli-v6.11.html` is untouched. No new
fields in the state (Orðaforði now also writes to `S.vocab`, under keys of
its own: `samheiti:`, `andheiti:`, `myndun:`, `samhengi:`).

### Orðaforði
- **Word formation no longer gives the answer away.** *Sá sem verndar er ___
  (nafnorð)*, *Skrifaðu andheiti orðsins kurteis*, *Myndaðu nafnorð af
  sögninni miða*: the affix (*-ari*, *ó-*, *-ing/-un*) is behind the
  Vísbending button (costs XP like every hint). The antonym accepts every
  right answer: *ókurteis* and *dónalegur* (its synonyms and the word's
  listed antonyms).
- **Many more words.** Synonym groups 37 → 162, antonym pairs 50 → 134,
  word-in-context sentences 24 → 60, all checked against BÍN by the build
  (which now also refuses a word in two synonym groups, or an antonym pair
  inside one group).
- **The same word does not keep coming back.** Synonyms, antonyms, word
  formation and word in context use the vocabulary question's gate
  (`core/spacing.js`): never twice in a day, never within a week, new words
  first. A synonym group counts as one (*fimur → liðugur* and *liðugur →
  fimur* are the same question).
- **Words get rarer as the level rises.** Each word carries its rank in the
  frequency list (`r`, from `freq_lemmas.json`); the band picks a window of
  ranks (`RANK_CAP` in `tasks/more.js`) and widens it only when nothing in
  it may be asked. Wrong options are picked near the right one in rarity.

### Málbeiting
- **Passive:** a genitive after the object goes with it. *Kennarinn safnaði
  verkefnum nemenda í möppu* gave *Verkefnum var safnað nemenda í möppu*;
  now *Verkefnum nemenda var safnað í möppu*. A noun phrase left outside a
  prepositional phrase now stops the builder. The agent (*af …*) is
  accepted before any prepositional phrase, not only right after the
  participle or at the end.
- **A rewrite may stop where the sentence stops changing.** *Á morgun gef
  ég gamla manninum* for *… gamla manninum bókina mína* is right, with a
  line saying the rest may be left out (`tailLeftOut`).
- **Villuveiðar accepts other right fixes** (`alsoRight`): the other tense
  when nothing in the sentence says when (*Þrjú börn bíða/biðu úti*), and
  the noun with or without the article when nothing beside it decides
  (*frá hestum/hestunum*).

### Villugreining
- New pattern **Stafsetning**: one consonant wrong, missing, extra or
  doubled inside the word, with the last letter right (*viltuð* for
  *villtuð*, *færi* for *fæði*). These were reported as *Röng ending*. Like
  *Broddar*, it is shown as "the one thing to remember" only when nothing
  else went wrong.

### Greining
- *án greinis* comes before *með greini*.

## v6.11 — November 2026 (every category mixes its questions)

A v6.10 state opens unchanged; `fallaskoli-v6.10.html` is untouched. No new
fields in the state.

### The mix rule (`core/mix.js`, new)
- A session of one category used to be whatever the weights gave — and
  Fornöfn, Töluorð, Óbeygjanleg orð, Fallstjórn, Orðaforði, Greining and the
  two sentence categories had a single kind of question each (ten tables in a
  row for Fornöfn). Now every session has **at least three kinds of
  question**, **none over ~40%** (4 of 10, 6 of 15, 8 of 20), **a
  beygingartafla no more than 30%** and **analysis (greining) no more than
  35%**. `mixGate` reads what the session has had; `nextTask` draws only from
  what the rule allows and falls back to everything rather than end a session
  early. Tested for every category at 10, 15 and 20 (tests/more.test.js) and
  in Chromium (seven category sessions, tools/browser-test.mjs).

### 29 new question types (`tasks/more.js`, four renderers in `ui/render-more.js`)
- **Fornöfn**: personal pronoun in the right case (*Ég gaf ___ (hún) bókina* →
  henni); replace the underlined noun with a pronoun (from the sentence bank:
  only definite nouns with nothing stranded, no predicatives, no time
  phrases); reflexive or not (*sér/honum, sína/hans*), the same sentence twice
  with a line that says who is meant.
- **Töluorð**: 1–4 agreeing with the noun (*Ég á ___ (2) systur* → tvær), also
  as a choice between forms; ordinals in dates in all four cases (*___ (3.)
  maí* → þriðja; *annar* strong; 21.–31. compounded); plural-only nouns
  (*tvennar buxur*, *þrenn skæri*), with a note when the child writes *tvær*.
- **Óbeygjanleg orð**: tap every adverb / preposition / conjunction in a
  sentence; preposition or adverb by context (*hljóp upp stigann* / *leit
  upp*; hand-written pairs and bank words that occur as both); choose the
  conjunction (every wrong option makes the sentence wrong: *hvort/ef*,
  *hvorki … né*); sort the underlined words of a sentence into classes.
- **Fallstjórn**: preposition + noun (the cloze, only right after a
  preposition whose case the build confirmed); motion or rest after í/á/undir/
  yfir (*á borðið / á borðinu*); verbs that govern a case (*hjálpa, sakna,
  bíða, leita, gleyma, njóta …*); impersonal subjects (*Mig langar, Mér finnst*)
  with two traps that take the nominative (*Ég hlakka til, Hún kvíðir fyrir*).
- **Orðaforði**: synonym / antonym (curated groups; a wrong option is never
  from the word's own group or its opposite), word in context (hand-written
  sentences where exactly one of four nouns makes sense, all four in the same
  BÍN form so grammar never gives it away — generating them from bank frames
  and noun classes was tried and dropped after reading the output:
  *Grunnskólarnir eru gamlir* and *Ég sá sófa úti* are good Icelandic), word
  formation (*ó-*, *-ari*, *-ing/-un*: both words in BÍN, and the pair checked
  against ÍNO's own definition), odd one out.
- **Lýsingarorð**: strong or weak, comparison and agreement as fill-ins in a
  sentence (bank tokens and frames; never before a noun whose form is the
  same in both numbers — *Ég sá ___ (hár) tré* has two right answers); the reverse analysis of an adjective is
  now always a word underlined in a sentence, never a bare form.
- Also: Nafnorð — choose the case form; Greining — tap every word of a class,
  sort dictionary forms (only words that are one class whichever BÍN entry
  they are read as); Setningafræði — name the part, sort the parts (heads
  only: not *miklu* in *miklu máli*); Setningagerð — tap the whole
  subordinate clause, the word it starts on.
- Every type is a switch under Stillingar og námsefni (`QUESTION_TYPES`).

### Every form out of BÍN
- `exercises.py` (new, hand-written) holds sentences and lemma + class + BÍN
  mark; `build_exercises.py` (new) looks every answer, option and cue up in
  BÍN (same core-vocabulary filter as build_lexicon.py), checks every other
  word of every sentence against BÍN and every word-class claim (an adverb, a
  preposition, a conjunction) against the classes BÍN gives the word, and
  stops the build on anything it cannot confirm → `data/exercises.js`. Run
  with the pinned islenska 1.3.2: byte-identical to 2.1.0. Added to build.sh
  and to the manifest (accepted).

### Orðaforði
- The free-text sentence is no longer a question of its own in a session. It
  is an **optional bonus** under every graded Orðaforði question: XP only if
  the word is in the sentence (any of its BÍN forms), it has three words or
  more, it is not one already written and not the dictionary's own example.
  Skipping costs nothing. The rescue drill keeps its meaning question.
- **Summary**: the "one thing to remember" from earlier sessions is taken
  only from patterns this session's category can test — no verb tip after an
  Orðaforði session — and an example with nothing to show no longer prints a
  bare "Rétt:".

### Error diagnosis
- Seven new patterns: afturbeygð fornöfn, töluorð með fleirtöluorðum,
  hreyfing/kyrrstaða, ópersónulegar sagnir, samtengingar, merking orða,
  orðmyndun; the existing patterns now also draw on the new types for
  "Villurnar mínar".

### Lesefni
- Töluorð: plural-only nouns (*tvennar buxur*) and dates. Orðaforði: word
  formation.

### Tests
- `tests/more.test.js` (12): every new type builds and every task is intact;
  the mix rule in every category; Lýsingarorð never bare; the bonus rule;
  diagnosis; the summary filter. 505 in all. `tools/browser-test.mjs`
  answers the four new shapes and runs a session in seven categories (399
  checks); its v6.10 expectations for the article slip, the adjective table
  and the number of type switches are brought up to date.
  `_grammar-audit/sample-new.mjs` prints what the new types generate.

## v6.10.1 — November 2026 (fixes from the four-pupil test)

- **Hold for review**: the day XP limit is now in step with the answers limit
  (3000 × 12 XP, was 4000). A hold now shows at once in Skólastofan, and the
  duel room says why instead of "Enginn annar í hópnum…". Pupils already held
  must be released under Umsjón.
- **A table, a hunt and a Setningasmiðja sentence count as ONE answer**
  (`record(…, {tally:false})` + `tallyAnswer`). Fixes "10 í röð" from a 3/10
  table and "Dagsmarkmið 10" after one table.
- **Badges**: "í lotu" renamed "í heimsókn" (they always meant the visit).
- **Setningasmiðja**: a missing accent is a slip ("Gáðu að broddunum"); another
  form of the card's word is "rangt beygt", no longer "átti ekki heima".
- **Wrong article / wrong tense are now WRONG** (with a note naming the
  feature), in practice and duels. Only the accent is forgiven.
- Orðaforði: no XP for the same text again or under three words; an ungraded
  session no longer gets an old error tip or an empty "Rétt:" line.
- Names are never declined: duel texts reworded ("Sigur · Dísa", "Áskorun send · Bjarni").
- Answer sentence capitalised when the blank is the first word; Umritun model
  shown without the agent; bare-word analysis no longer says "Farðu eftir
  setningunni"; með/eftir/fyrir no longer get the motion/rest rule.
- No *vor* or *mestallur* pronoun tables; Lýsingarorð table gives the
  nominative instead of asking for it again.
- Phones: a text line says the case/number/article when the chart is hidden;
  the topic picker is two compact columns with a sticky start button.
- `.why` labels only for the first `<b>`; bold in the text stays inline.
- "Næstum því!" removed from wrong-answer phrases; clause verdict has the
  Enter line; recent sessions read "7/8 rétt · 10 spurn."; strong/weak
  adjective pattern no longer given to verbs.
- Duels: 10/15/20 questions like practice; only skills BOTH players have on
  (ceiling and choice) — no Year-9 topics for 8th graders.
- Dictionary line in Óbeygjanleg orð hides "(með þolfalli)" until answered.
- Tabs and stats hidden behind the login screen.

## v6.10 — November 2026 (practice sessions and error diagnosis)

A v6.9 state opens unchanged; `fallaskoli-v6.9.html` is untouched. Two new
fields in the state (`diag`, `runs`), both merged between devices
(core/merge.js) and both cleaned by the server (server/guard.mjs).

### Practice comes in sessions
- The Æfa tab no longer starts an endless stream of questions. It opens on a
  **picker** (`ui/session.js`): every category switched on under Stillingar
  og námsefni, **Blandað** (all of them mixed) and — once something keeps
  going wrong — **Villurnar mínar**. Then 10, 15 or 20 questions.
- A session is narrowed to its category by `narrowPolicy` (core/policy.js);
  the builders are unchanged. A strip above the board shows the question
  number, a dot per answer and **Hætta** (what is answered is summed up).
- At the end, a **summary**: the score, the XP gained, the badges won in the
  session, *Það sem gekk vel*, *Eitt atriði til að muna* (the rule for the
  worst error pattern of the session, with the child's own answers beside the
  right ones), *Hvað næst?* (a session aimed at that pattern, the Lesefni page,
  a rescue drill if a word is in trouble, the same session again) and the
  diagnosis table. Finished sessions are kept in `S.runs` (the last 40).
- The rescue-drill offer no longer interrupts; the summary offers it. Duels
  and drills started from elsewhere run as before and the session resumes.

### Error diagnosis (`core/diagnosis.js`, new)
- Every wrong answer is read against its question and sorted into one of 27
  patterns: þolfall/þágufall swapped, the genitive avoided, the nominative left
  standing, government of prepositions and of verbs, number, the article,
  gender of nouns, gender agreement, strong/weak adjectives, degree, person
  and number of verbs, tense, mood, voice, a strong verb given a weak past
  (*hlaupaði*), a vowel change missed (*bókur*), a wrong ending, accents, word
  classes, adverb or preposition, sentence parts, clause types, the verb in
  second place (*Í gær ég fór*), the passive, and changing correct words in
  Villuveiðar. Another cell of the same word is read feature by feature off
  the BÍN marks (`gradeForm`'s `otherMarks`); a form that is no form at all is
  read for a weak past, a vowel change or an ending.
- Per pattern the state keeps the CHANCES (questions that tested it) as well
  as the misses, and the last 16 as a string of 1s and 0s, so the diagnosis is
  a rate with a direction (▲ betra / ▼ verra), not a tally. A pattern missed
  twice lately and at least one time in five is *active*.
- Nothing the child typed is stored: the examples kept are a word key and two
  BÍN marks. The typed words appear in the summary and are then forgotten.
- A wrong answer now gets a line under the verdict: *🔎 Villugreining: …*.
- **Merki og framvinda → Framvinda → Villumynstur**: every pattern met, its
  recent rate and trend, the rule, the Lesefni page, and **Æfa**.
- **Questions that target the child's patterns come more often.** In a
  session, with chance 0.4 (0.85 in Villurnar mínar), up to five (eight)
  candidates are built and the first that tests an active pattern is kept
  (`pickTargeted`); a session aimed at patterns is drawn only from the
  question types that test them (`focusTypes`); Villuveiðar prefers the error
  kinds the child misses (`huntPrefer`).

### Villuveiðar
- **Two sentences, one above the other.** The chat thread, news snippet and
  game log are gone. One error below þyngd 3, two from there, never two in one
  sentence.
- **Fewer *er*.** *vera* is in most sentences, so verb errors were mostly
  *er/eru*. A *vera* error is now made a fifth as often, and a hunt has at
  most one verb error. Measured: under 30% of verb errors are *vera* (test).
- **An agreement error may be mended at either end.** *Kennarinn sögðu* is
  right as *Kennarinn sagði* and as *Kennararnir sögðu*; *Ég hjálpaði gömlum
  konu* as *gamalli konu* and as *gömlum konum*. The builder works out the
  other end's fix (`subjectAlt`, `nounAlt`) and the grader accepts it
  (`gradeHunt` → `viaAlt`), but only when changing that ONE word leaves a
  correct sentence: nothing else may agree with it — a word beside it, a
  predicative, a second verb, *sinn*, a relative clause (*gömlu manninum sem
  bjó*), or a word the build could not analyse. Otherwise there is one fix
  and the error count promises it. The feedback names both fixes.

### Tests
- `tests/diagnosis.test.js` (14), three new in `tests/production.test.js`;
  490 in all. `tools/browser-test.mjs` and `tools/server-test.mjs` start a
  session the way the picker does, and the browser test drives a whole
  ten-question session to its summary (204 checks; server 70).

## v6.9 — November 2026 (writing the grammar, and four fixes)

A v6.8 state opens unchanged; `fallaskoli-v6.8.html` is untouched. A new
skill, **Málbeiting**, is on by default for 8.b and carries three new question
types. Builders in `src/js/tasks/production.js`, renderers at the end of
`ui/render.js`, a Lesefni page (*Málfræðin í notkun*), and
`tests/production.test.js` (14 tests, all against the real data).

### New question types
- **Villuveiðar** (`villur`). A short chat thread, news snippet or game-chat
  log of two or three sentences from the bank, with one error in each: a
  noun in the wrong case after a one-case preposition or as the object of a
  verb whose government the build confirmed (the slips people actually make:
  þf↔þgf), an adjective in the wrong gender beside its noun, or a verb in the
  wrong number for its subject. The child clicks a word, types the fix, and
  is told how many errors there are. Graded per error; changing a correct word
  is a false alarm. Every wrong form is a real BÍN form of the same word and
  is never a form of the right cell under another reading (*bók* nf/þf). Not
  made: errors after two-case prepositions, on a noun with an agreeing word
  beside it, on the subject's case, or with collective subjects (*fjöldi
  bíla sást/sáust*).
- **Setningasmiðja** (`smidja`). Word cards in dictionary form — *stór –
  hestur (ft., með greini) – sofa (nútíð)* — and the child writes the
  sentence. The cards say only what the sentence cannot (tense, mood, number,
  the article, degree); case and agreement are the child's. Graded card by
  card, in any order. Sentences with two-case prepositions, participles, a
  verb with no nominative subject, or a pronoun standing alone (*Þetta er …*,
  *stærri en þennan*) are not used, because the answer would be a guess.
- **Umritun** (`umritun`). Rewrite a sentence: **þátíð**, **fleirtala** (the
  subject and everything that agrees with it), **þolmynd** (from þyngd 2;
  *Kaka var bökuð (af ömmu)*, *Kennaranum var hjálpað*), or start it with
  **Í gær …** / **Á morgun …** (verb second, subject after, tense follows).
  Every accepted answer is generated from BÍN; variants (the agent with or
  without *af*, BÍN's double forms) are all accepted. A missing accent is a
  slip — unless the accent is the whole change (*bíðum* → *biðum*).
  Idioms, states and demonstrative subjects are left out (*Máli er skipt*,
  *Mömmur lesa blaðið*, *Í gær var þetta saga bæjanna*).
- Weights: the three together (26) now outweigh the analysis question; parse
  14 → 11, revform 9 → 7, indecl 6 → 5.

### Fixes
- **Celebrations on wrong answers.** A badge earned on a wrong answer (a first
  word met, the time of day, a collection threshold crossed by the word just
  missed) is still awarded at once, but its window and confetti wait for the
  next right answer (`celebrate()` in core/badges.js). Confetti stops when the
  next question appears. The browser test now fails if a badge window opens on
  a wrong answer — it did on v6.8.
- **373 badges → 197.** Ladders thinned to their landmark rungs (per skill:
  ×100, level 5, ten in a row; no "first correct" badge per skill), and the
  trivia secrets retired (11:11, 13:37, the XP-number badges, palindromes,
  *Gullfiskaminni* — a badge for a wrong answer — and others). Retired badges
  are listed in `RETIRED_IDS`; they are never awarded again and not counted
  in "af N merkjum" or "Öll merkin", but a child who owns one keeps it and the
  server still accepts it.
- **The motion/location hint on a time phrase.** "Sólin skín í dag" asked
  which case *í* governs and the explanation offered motion = þolfall,
  location = þágufall, which does not apply to time and points at the wrong
  case (*í síðustu viku* is dative). A preposition heading a time phrase is
  no longer a fallstjórn question (`headsTimePhrase`); a time phrase in the
  cloze gets its own explanation (`explainTimePhrase`); the Fallstjórn page
  has a section *Tímaliðir fylgja ekki reglunni*. The fallstjórn card no
  longer shows a preposition's dictionary line before the answer — ÍNO
  defines *í* and *á* by their government, so it gave the rule away.
- **The wrong dictionary sense.** `tools/ino.mjs` took a definition nested in
  a collocation or idiom as the word's own: *dagur* was "virkur dagur: …",
  *strákur* "sitja á strák sínum: …", *mamma* "það þýðir ekkert elsku
  mamma: …". A phrase's definition is now used only when the entry has
  nothing else. 35 words changed, all of them this fault; nothing else in the
  bundle changed (manifest accepted).
- `tools/browser-test.mjs` reads a Lesefni page the way v6.8 counts it (to the
  end, eight seconds); it had failed on v6.8 since that change.

## v6.8 — November 2026 (fixes, and error reports)

A v6.7 state opens unchanged; `fallaskoli-v6.7.html` is untouched.

### Error reports (`ui/reports.js`, new; `POST /reports`, `/admin/reports`)
- Every question has a 🚩 in its header. The child chooses what kind of
  problem it is (rangt svar, undarleg setning, villa í skýringu, annað), may
  write a note, and can report either this question or the one before it
  (mistakes are often noticed after pressing Áfram).
- Captured automatically: the task as built (type, skill, level, word, BÍN
  mark, the sentence with every token's analysis, the expected answer per row,
  the picks), the card as it was on screen (text, what was typed, which
  buttons were chosen and marked right/wrong, the verdict), the version and a
  JSON-safe copy of the whole task object.
- On a server: stored in `reports.json`, at most 40 per person a day and 3,000
  in all. Administrators review them under **Umsjón → Villutilkynningar**:
  filter by status (Ný / Staðfest villa / Ekki villa / Lagað), read the
  details, add a note, delete, or download everything as JSON. They are part
  of the user's own export, of erasure and of the backup. The privacy notice
  says so (version 2026-11-11).
- Without a server they are kept in this browser and reviewed under
  **Stillingar og námsefni → Villutilkynningar**.

### Fixes
- **Words with no meaning: 500 → 54.** `data/ino.json` dated from 20 August,
  before the vocabulary gained *líf, sonur, vegur, hlæja, kaffi* and the rest,
  so those were never joined; it is now rebuilt (6,510 of 6,564 words, was
  6,071). `tools/ino.mjs` also lost shapes the real XML uses, now handled:
  two-class labels (*preposition/adverb*, *adjective/adverb* — attached to the
  vocabulary word of each class named, `shared` in the entry); phrase labels
  (*ordinal numeral*); plural-only headwords (*bókmenntir* → *bókmennt*);
  synonym pointers (`<Definition>bleia</Definition>` on *bleyja*) and
  reference pointers (`<feat att="reference" val="isord_8914"/>` on *dyggð*),
  both followed to the target's definition. A pointer is only used where the
  entry has no definition of its own, so no existing meaning changed. A
  leading class label is skipped when a real sense follows, so the pronouns
  (*allur, enginn, hver* …) get a meaning; `isGrammarGloss` now recognises
  "spurnarfornafn / óákveðið fornafn". The report ends with `unmatched`:
  every word still without a definition, and why — mostly compounds ÍNO
  does not have (*föstudagskvöld, liðsfélagi*).
- **Lesefni badges.** Opening a page no longer marks it read. It counts once
  the reader has scrolled to its end and had it open for 8 seconds; a page too
  short to scroll counts after it has been open for about the time it takes to
  read (250 words a minute, 20 s – 2 min). Time only runs while the page is
  on screen. A line at the end of the page says which.
- **Stigatafla.** The chosen metric is the highlighted first column, and the
  two context columns never repeat it (Stig and Merki, with Vikan in place of
  whichever is chosen). Choosing Stig used to show Stig twice. Switching
  metrics marks the button at once, dims the old table while loading and fades
  the new one in.
- **Orðflokkagreining gave the answer away.** An analysis question drawn for
  Lýsingarorð, Sagnorð or Nafnorð said so in its header, above the row asking
  for the word class, and its 📖 link named the class's page. Until answered
  it now says *Orðflokkagreining* and links to *Orðflokkar*; the real topic
  and page appear with the verdict.
- **Orðaforði** was 2–3 % of mixed practice (one question type, weight 4, and
  held back for eight questions after each). Its weight is now 1.3 × the
  average weight of the other enabled skills, with a two-question gap: about
  11 % with the default skills, about the same as an average skill.
- **"Persónuvernd" link did nothing** where new windows are not allowed (an
  app's built-in browser). The notice now opens inside the program; the link is
  still a real link for "open in new tab".
- **"Hætta" in a duel did nothing**: it used `confirm()`, which such browsers
  ignore (answering "no"). It now asks in the program's own window.

## v6.7 — November 2026 (teaching, and duels)

Fallaskóli used to drill without ever teaching. It now has a reading section,
and children on the same server can challenge each other. A v6.6 state opens
unchanged; `fallaskoli-v6.6.html` is untouched.

### Björgun
- **The fifth question is always Orðaforði** (`DRILL_MEANING_TURN` in
  `tasks/index.js`): "say in your own words what *X* means", followed by the
  dictionary's meaning. It has no wrong answer, so it does not count toward the
  drill's ten to twenty questions, and the rotation of the other kinds of
  question steps around it. A word with no dictionary meaning (or only a
  grammatical gloss) gets an ordinary question in that place instead. It is
  asked even when the Orðaforði skill is switched off for ordinary practice.

### Lesefni (`core/lessons.js`, `ui/lessons.js`, `content/lessons.js`, new)

- A new tab, **Lesefni**: twenty one-page lessons, at least one per skill —
  föll, kyn og tala, greinir, sterk/veik beyging nafnorða and lýsingarorða,
  stigbreyting, samræmi, persóna og tala, tíð, háttur, mynd, sterkar og veikar
  sagnir, fornöfn, töluorð, óbeygjanleg orð, orðflokkar, fallstjórn, að útskýra
  orð, setningarliðir and setningagerðir. Each has examples, a memory rule,
  common mistakes, "Prófaðu þig" questions with hidden answers, and links to
  related pages.
- The prose is hand-written; **the tables are not**. A table block names a
  word and the forms are read out of BÍN through the lexicon, as the questions
  read them, so a page cannot show a form a question would mark wrong.
  `brokenTables()` and a test make sure every table fills.
- Every question carries a 📖 link to the page that teaches it, chosen from
  its skill and the marks it is about (a comparative → *Stigbreyting*, a
  subjunctive → *Háttur*). A wrong answer adds one line under the verdict:
  "Lestu: …" (or "Rifjaðu upp: …" once the page has been read). The glossary
  pop-ups link to the full page.
- `S.read` remembers which pages have been read; three badges (*Fyrsta
  blaðsíðan*, *Lestrarhestur*, *Allt lesið*).
- The pages were drafted by an AI model and should be read by a teacher.
  The points it was least sure of are listed in `docs/LESEFNI.md`.

### Duels (`core/duel.js`, `ui/duel.js`, new; `GET/POST /duels`)

- In **Skólastofan → Einvígi** a child challenges somebody in their group to
  10, 20 or 30 questions on one skill, or *Blandað*. Both must be on the
  leaderboard — the same rule as the board itself (`visibleStates`).
- Both get **the same questions**: the server stores a random seed, and each
  browser builds the questions from it against a blank history, with no
  curriculum switches and always the filtered vocabulary. A signature of the
  questions travels with each result. The difficulty is the mean of the two
  players' levels in the topic, never below the middle of the easy range.
- A challenge appears on the Æfa blackboard the way a rescue drill offer does.
  Each player answers whenever they like within **24 hours of the challenge**;
  whoever has not answered by then loses. The other player's score is hidden
  until you have answered.
- More right answers wins; equal is a tie. Both players get the XP of their
  answers, plus 20 for finishing, 30 more for a win and 15 for a tie.
- A duel nobody answered is deleted the next time anybody looks; finished
  duels are kept 30 days so every device can collect the result, then
  deleted. No scheduled job. At most **10 open duels** per person.
- Seven badges in a new group *Einvígi*; a leaderboard metric **Einvígi**
  (duels won), and ⚔️ with the number of wins beside every name that has one.
  `S.duels` holds each settled result as one letter, so XP and badges are
  given once, on whichever device sees the result first.
- Erasing a user erases their duels; their own export includes them.

## v6.6 — November 2026 (the word collection grows teeth)

The collection under **Merki og framvinda → Orðasafn** used to say which words
had been met. It now also says how each of them is doing, rewards keeping them
well, and offers a way to save the ones that are not. A v6.5 state opens
unchanged; `fallaskoli-v6.5.html` is untouched.

### Word health (`core/wordhealth.js`, new)

- Every word now remembers its last twelve outcomes (`h` on the word record,
  ones and zeros). A word is judged on its **recent** answers — the last ten,
  with older counts filling the window for words from before v6.6 — so a word
  that went badly in September and well since is not held against anybody.
- Five states: *nýtt*, *í lagi*, *óstöðugt* (under half right), *á valdi þínu*
  (80% or more) and **í hættu**: answered six times or more and right in fewer
  than one in five of the recent answers. Every threshold is in `HEALTH`.
- The collection shows four tiles above the words — **Orðaforði**, **Orðaheilsa**,
  words held well, words rescued — and a red box of the words in trouble, each
  one a button. Words in trouble are marked ⚠ in the collection and in
  *Orð sem þarf að æfa*; rescued words carry 🛟.

### The rescue drill

- Clicking a word in trouble — or accepting the offer that appears on the
  blackboard after missing such a word (at most three offers a session, and
  every fifteen questions for the worst word there is) — starts a drill on that
  ONE word. The questions rotate through what its class allows: cloze, table,
  analysis of a form, analysis in a sentence, government, word class
  (`tasks/index.js` `drillTask`, `DRILL_PLAN`), always inside the curriculum
  switches.
- At least ten questions. From the tenth on, the drill is passed the moment
  more than half are right; at twenty it ends whatever the score. A strip on the
  blackboard shows the word, the score and twenty dots; *Hætta* leaves without
  penalty and without reward.
- **Reward:** a rescue pays 50 XP + 5 per right answer (half for a word
  rescued before, so letting a word slide to rescue it again is not a business);
  sticking out twenty questions without passing pays 30 XP. The drill's answers
  are ordinary answers too, and a word in trouble is worth more XP per answer
  anyway (`easeMult`). Rescues are kept per word in `S.drills`.

### The leaderboard: Orðaforði

- New metric **Orðaforði** (`vocab`): 1 point per word found (2 for a rare word),
  +2 for a word held well, +1 for a word that was rescued and has not slid back —
  and **0 for a word in trouble** until it is rescued. Finding words always pays;
  keeping them pays three times over; letting them slide costs. With *Orð í
  safni* or *Orðaforði* chosen, the board shows each person's **Heilsa** (the
  share of their judged words not in trouble, from twenty judged words up).
- The scorecard gains `vocab`, `health` and `rescued` — numbers only
  (`tests/guarded.test.js` records the decision).

### 65 new badges (363 in all)

- **Björgun orða** (visible): Fyrsta björgunin, Bjargvættur (5), Björgunarsveitin
  (10), Landhelgisgæslan (25); Seigla (twenty questions, not passed), Tíu af tíu,
  Viðsnúningur (first three wrong, rescued anyway), Gamall draugur kveðinn niður
  (a word answered 15+ times before), Hreinsunarátak (three rescues in a day),
  Haldið á floti / Traustur grunnur (rescued words that stayed good).
- **Orðaheilsa** (visible): 25 / 100 / 250 / 500 words held well; Orðaforði
  250 / 1.000 / 2.500; Heilbrigt safn (100 judged words, none in trouble);
  Stálminni (300, none in trouble, 90% healthy).
- **Orðasett og þemu** (hidden until won): the whole family, the four seasons,
  the four elements, the rainbow, the sky, the farm, the compass, the fairy-tale
  world, the breakfast table, cat-and-mouse; 25 animals, 20 foods, 25 body
  words, 15 jobs, 15 weather words, 100 people, 25 places; five and twelve pairs
  of opposite adjectives.
- **Spakmæli í safninu** (secret, a set): every word of a saying in the
  collection — *Æfingin skapar meistarann*, *Snemma beygist krókurinn*, *Hver er
  sinnar gæfu smiður*, *Að vera eða vera ekki*, *Ég kom, ég sá, ég sigraði*,
  *Sjaldan fellur eplið langt frá eikinni* and ten more; **Spakmælabókin** for
  all sixteen. Sayings can be worn as titles.
- **Oddities** (secret): two and six anagram pairs (*fugl/flug*), three
  palindromes (*amma, inni, rör*), ten homographs, an 18-letter word, fifteen
  one- and two-letter words, and exactly as many masculine, feminine and neuter
  nouns (20+ each).
- Collection steps at 2.500 and 4.000 words.
- Every word a set names is checked against the vocabulary
  (`tests/wordbank.test.js`), so every one of these can be won.

### Build

- 425 unit tests (29 new, `tests/wordbank.test.js`); `browser-test.mjs` 181
  checks (19 new: the at-risk list, starting a drill from it, ten right answers
  ending in a rescue with XP and badges, twenty wrong ending as *Seigla*).
  `server-test.mjs` 59 checks; its data-set upload check is flaky in headless
  Chrome on Linux — about one run in five, the same on v6.5.
- `STATE_VERSION` 11 (`drills`, `drillDays`); merge adds drill counts from two
  devices; the server keeps `h` only if it is ones and zeros.
- `_backup/v6.5-before-wordbank.tgz` holds every source file as it was.

## v6.5 — November 2026 (grammar audit, part two)

The audit v6.4 began, finished for the three things a child meets: the
sentences, the words that are drilled, and the questions. Every sentence and
its annotation was read again; every question type was read as the child sees
it; and the generated sentences were read frame by frame — about 4,000 of
them, in two passes — with the scripts now in `_grammar-audit/`. A v6.4 state
opens unchanged. `fallaskoli-v6.4.html` is untouched.

### Words that are not drilled any more

- **Acts of violence and the sex trade** (the owner's decision): 43 nouns —
  *nauðgari, nauðgun, morð, fjöldamorð, sjálfsmorð, morðingi, hryðjuverk,
  aftaka, ofbeldi, árás, klám, vændi, mella* … — with the 15 verbs for the
  same acts (*nauðga, myrða, pynta, kyrkja* …) and 4 adjectives. They are out
  of the vocabulary: no table, no bare form, no collection entry
  (`vocab_filter.UNFIT`, one list). Anatomical terms stay — *typpi* and *píka*
  are just words — and so do the words of war and history (*stríð, orrusta,
  her*) and of theft (*rán, þjófur*); all of those remain out of generated
  sentences, as before.
- **Verbs nobody conjugates**: 31 verbs that ranked among the commonest
  because one of their forms is a common word (*kyrra* was the 73rd commonest
  verb, from *kyrr*; *anna* from *annað*; *manna*, *rússa*), archaic doublets
  (*eta, gjöra, hlægja*) and verbs that live only in the middle voice
  (*ræta*: "ég ræti").
- ***ýmis, þvílíkur, hvílíkur*** as adjectives and ***fyrstur***: pronouns and
  an ordinal in every schoolbook, adjectives in BÍN. The analysis question
  would have marked the schoolbook's answer wrong. *samur* as a pronoun.
- **Frequency.** A word's rank no longer counts forms it shares with other
  words for more than three times what is its own. *viður* was the fourth
  commonest noun in the language (every *við*), *bar* the 23rd (*bara*),
  *hani* the 42nd (*hana*), *för*, *verð*, *tal*; they are where they belong.

### Questions that were wrong

- **Middle voice.** "við ___ (að hlakka, miðmynd)" → *hlökkumst*. BÍN gives
  nearly every verb -st forms. The middle voice is now asked only of the 267
  verbs whose middle voice the corpus attests (`mm`): *hittast, gerast,
  komast, klæðast*.
- **Weather verbs.** "ég ___ (að snjóa)" → *snjóa*. 27 verbs that are said of
  the weather or have no nominative subject (*snjóa, hlýna, batna, linna*) are
  asked only as "það ___", and never as a six-cell table (`t3`).
- **Two verbs, one name.** *brenna* (brann) and *brenna* (brenndi) — and
  *sleppa, skella, sökkva, smella* — were two entries; the drill accepted one
  past tense or the other by the throw of a die. One entry, both accepted.
- **Numerals.** *einn* was only ever asked in the plural (*einir*) and every
  ordinal as four identical cells (*þriðju* × 4): the loop tried the plural
  first. Singular where there is one. No table whose cells are all the same
  (*hvaða*, *hundrað*).
- **Pronoun tables.** The helper noun now stands as Icelandic puts it: *hinn
  maðurinn* (was "hinn maður"), *hvorugur maðurinn*, *sjálfur maðurinn*;
  *allir menn* but *allur* alone (was "allur maður"), *sumir menn*; *einn
  maður* but *einir* alone. The free article is declined without a noun and is
  labelled *greinir*, not *fornafn*. *sérhver* is not asked in the plural.
- **The reflexive pronoun** was asked its number: "Þeir léku *sér*" → "tala:
  eintala". *sig, sér, sín* have no number of their own; it is not asked.
- **Subjunctive.** The bare drill showed "ég ___" for the subjunctive; it
  shows "þótt ég ___", in the drill and in the table.
- **Explanations.** "Sögnin lagar sig að frumlaginu *minn*" (in "Bróðir minn
  kemur") → *bróðir*. A pronoun's mark is no longer described as "án greinis".
  "Í 2 reit" → "Í 2 reitum". A weak verb's past "hefst á -ð, -d eða -t
  (*-aði* …)" → "með endingu, *-aði*, *-ði*, *-di* eða *-ti*".
- **Glossary.** *Ég hef lesið* was the example of both *sagnbót* and
  *lýsingarháttur þátíðar*; the stem of a noun was said to be found in the
  genitive (the schoolbook rule is the accusative singular); *mynd* now
  mentions *þolmynd*; *stýfður boðháttur* had an example nobody knows (*ræt*).
- **Word class** withdrawn for *á* in *á óvart* and *á eftir*, *nóg* after
  *borða*, and *ónýtt* (parsed as *ónýttur*, "unused").

### Sentences

- Rewritten: "Hún var í mestri hættu" → *í mikilli hættu*; "Þetta eru þeirra
  bækur" → *bækurnar þeirra*; "Hann beið eftir barni" → *Ég mætti barni á
  leiðinni*; "Ég sagði frá kennurum í skólanum" → *Við mættum kennurum á
  ganginum*; "Ég fór heim án kennaranna" → *Krakkarnir fóru í ferðina án
  kennaranna*; "Það barn er í sama bekk og ég" → *Sá strákur …*, with *Það hús
  er til sölu* for the neuter.
- New, taking any noun: *Ferðin tafðist vegna bílsins / bílanna*. The nine
  "… um mikilvægi …" sentences are no longer templates.

### Generated sentences

- **A new class, `critter`**: insects and sea creatures. They are seen, drawn
  and feared, and no longer wait outside, hide under the chair or get given
  water ("Sníkjudýr biðu úti", "Höfrungurinn faldi sig undir stólnum", "Hópur
  laxa stóð á túninu").
- About 70 slots narrowed: verbs of lying and standing ("Kýrin liggur á
  borðinu", "Hnetusmjör lá í fjörunni"), groups doing what people do
  ("Stjórnirnar hlaupa út í garð"), *event* reduced to what is held and looked
  forward to ("Ég hlakka til verkfallsins"), ingredients out of *food* ("Við
  borðum pipar í kvöld"), and more of the same.
- A generated sentence never repeats a noun it already has ("milli kirkju og
  kirkju"). No adjective is swapped in for *næsti* ("í stærsta húsi") or put
  beside a mass noun ("stórt grasið").
- Out of generated sentences: *guð, drottinn, herra, þræll, viður* ("Þetta er
  saga um við"), *á*, *himnaríki, brjóst* and about 30 more.

### Not changed, on purpose

- `herra, guð, fjandi, byssa` are still among the commonest nouns: that is the
  film corpus, and only a school frequency list would change it.
- Insults (*drusla, dræsa, tík, fáviti*), drugs, weapons and war stay in the
  tables; the instruction was acts of violence and lewd acts. Each is one word
  in `vocab_filter.UNFIT` away.

## v6.4 — November 2026 (grammar audit, part one)

Every sentence, every annotation and every question type was read against
Icelandic school grammar. This release holds the fixes that were finished and
tested; `_grammar-audit/HANDOVER.md` lists what is still to do. A v6.3 state
opens unchanged.

### Questions that were wrong and are not asked any more

- **Verb government.** Asked only for a verb the table (`government.py`) lists
  with a single case, in the active voice, with its object standing in that
  case in the same clause. Gone: *halda*, *segja*, *vita* "governing" a case
  before an *að*-clause, *tala* governing *hátt*, *standa* governing *auð*,
  *hjóla* governing *alla leið*, *klæðast* shown as *klæða*, and every verb
  with two objects. The question now reads "í hvaða falli stendur andlagið
  hennar?".
- **Sentence parts.** A role belongs only to a nominal standing directly in the
  role phrase, in the case the role has, and an object only to a verb the table
  knows. A predicative needs a copula. A word whose role could not be verified
  (`rn`) is neither right nor wrong when clicked: the app says it is not judged.
  An infinitive or participle clicked as the predicate is accepted (`ra`).
- **Word class.** 75 tokens withdrawn by declared decision
  (`parse_overrides.py`): *saman*, *heim* and *hátt* read as a pronoun and as
  nouns, ordinals read as adjectives, the first words of *áður en*, *þangað
  til*, *eftir að*, *eins og*, *um leið og*, and others. Three wrong lemmas
  (*fötum* → *fata*, *hún* → *húnn*, *beðið* → *biðja*).
- **Marks.** Gender and strong/weak declension are now asked only where the
  sentence settles them ("nýja skó" was "veik beyging"). A subject or
  predicative noun takes the number of its verb ("Þetta eru bara orð" was
  singular). `number_of` never read a verb's number; it does now.
- **Cloze.** Never on a slot whose case is a guess ("eftir vinnu"). The verb
  cloze skips forms whose tense or person is unsettled and shows the middle
  voice infinitive (*að hittast*).
- **Agreement.** A blank is pinned to its gender whenever a word of the
  sentence was withdrawn or is a participle: "Stelpan er þreyttur" and "Súpan
  er tilbúinn" were possible. The slot's gender was read from the wrong lemma
  for *krakki*.
- **Clauses.** Not asked where the build cannot vouch for the boundaries
  (`ku`), nor about a span without a verb; "en sú" is no longer part of the
  relative clause after it.

### Sentences

- 60-odd sentences rewritten: misparses ("Ég sé há tré"), agreement
  ("heimalærdóminn sinn", "krakkarnir … þau"), and sentences nobody says
  ("Byrjun daganna var köld", "Þetta er litur handar", "Hús barna standa auð").
- Six frames that take nearly any noun, for the indefinite dative and genitive.

### Generated sentences

- Nouns: new classes `job`, `sky`, `book`, `building`, `room`; about 140 slots
  narrowed to what an Icelander would put there; no plural for mass nouns
  (`np`), no article for *mamma, pabbi, amma, afi* (`na`); about 110 more words
  kept out of generated sentences.
- Adjectives: an added adjective, and an adjective shown inside a sentence, is
  one of a short list that suits the kind of noun ("óléttir lyklar", "svangasta
  hjólið"). Nothing is added beside a numeral, a pronoun or another adjective
  ("Tveir þessir hestar").
- 46 nouns that existed only as forms of common verbs and particles (*geta*,
  *koma*, *fimm*, *ver*) are out of the vocabulary.

### Explanations

- Rewritten (`tasks/explain.js`): a genitive after a noun is an
  eignarfallseinkunn, not governed by a preposition further back; the subject
  named is the verb's own; the subjunctive is explained by the conjunction of
  the verb's own clause; strong/weak/preterite-present is said only where safe.
- "Setningin hefur aðalsetning og aukasetning" → "Í málsgreininni eru
  aðalsetning og aukasetning."

## v6.3 — November 2026

Ready to be run for other people's children: who gets in, who agreed to it, who
sees whom, how they leave — and a server that can be put on the internet
without a machine to look after. No change to questions, grading or badges. A
v6.2 state opens unchanged; three things are different on first start (below).

### Getting in

- **Invitations.** Nobody registers without a code. The administrator makes one
  (*Umsjón → Boðskóðar*) for a group, a number of accounts and a number of
  days, and gives it to the parent. `FALLASKOLI_OPEN_REGISTRATION=1` restores
  the old ask-and-wait.
- **Consent is recorded.** Under 16 a parent or guardian types their name and
  ticks the box; from 16 the user does. The account keeps who, when, how and
  which version of the notice. A learner with no record cannot be admitted.
  16 covers Icelandic law today (13), the bill before Alþingi (15) and GDPR's
  default; it is one constant in `server/privacy.mjs`.
- **Accounts from the admin page**, with a generated password shown once; a new
  password for somebody who forgot theirs is one button, and logs them out
  everywhere. `admin.mjs` is now only needed for the first account.
- **Groups.** A group is who can see whom. The board, the roster and last
  week's result stop at its edge; badge rarity (an anonymous count) does not.

### Who sees whom

- **Nobody, by default.** A user is on the board and roster only after
  switching it on (*Skólastofan*, or *Aðgangurinn minn*), minutes are a second
  switch, and the administrator can take somebody off but not put them on.
- The scorecard no longer carries `updated` — it was the day somebody last
  practised, and `docs/API.md` said no date is sent.
- A guardian can set the ceiling only for learners in their own group. Before,
  a guardian could change the default for the whole server.

### The rights in the notice, as buttons

- **`/personuvernd`** — the privacy notice, in Icelandic, written for a
  teenager, linked from the login card. Its retention figures are the settings
  the server acts on.
- ***Aðgangurinn minn*** (new, in Stillingar og námsefni): change nickname and
  password, choose visibility, download everything held about you, delete the
  account.
- **One erasure.** The user's delete, the administrator's *Eyða alveg* and the
  retention sweep all remove the account, progress, ceiling, sessions,
  hidden-list entry and invitation trace. A test reads every file afterwards.
- **Retention.** Requests unanswered for 30 days and accounts unused for 18
  months are erased automatically (administrators excepted). The user list
  shows who is within 60 days of it.
- **An audit trail** of administrative actions, by id — never names.
- **Encrypted backups** from the admin page (AES-256-GCM, your passphrase);
  `server/backup.mjs` reads one back in.

### Two devices

- **They merge.** A state has a revision; a write based on an old one is
  refused (409) and the program merges three ways — `src/js/core/merge.js` —
  instead of overwriting. Counters add, bests take the larger, a badge won on
  both is one badge, settings follow the device that changed them. This
  replaces the rule "no attempt is ever made to merge two states" **on
  purpose**: that rule was about a file with no common past (still not merged,
  `liftLocalState`), and it left two devices on one account erasing each other.

### What the server stores and believes

- `server/guard.mjs` rebuilds every uploaded state field by field (unknown keys
  dropped, badge ids must exist, 2 MB at most; was 8 MB of anything).
- Numbers practice does not produce — 4,000 XP in a day, XP rising with no day
  to account for it, an old day growing — are stored, and the account is held
  off the board until the administrator presses *Ljúka yfirferð*. Honest limit:
  a plausible edit is not caught.
- States, users and sessions are cached in memory; a scorecard is computed once
  per saved revision. Every leaderboard request used to read every file.

### Security

- Session tokens are stored hashed. **Everybody logs in again once.**
- The login limit is per address (read from the proxy only when
  `FALLASKOLI_TRUST_PROXY=1`), never per name: eight bad guesses from anywhere
  used to lock a child out. Registration is limited too. An unknown username
  now costs the same time as a wrong password.
- Every response carries a content-security policy and the usual headers; a
  writing request from another origin is refused.
- The server gives up root at start (`FALLASKOLI_UID`); so do the tools.
- Google login asks for an identifier only (was email and real name, and the
  name went onto the board), and its return address is built from the proxy's
  scheme (it said `http://`, which Google refuses). Still off unless configured.

### Hosting

- **`Dockerfile`, `fly.toml`, `docs/HOSTING.md`** — Fly.io, one small machine
  that sleeps when unused and a 1 GB disk. Nothing is built in the container.
- **The fonts are in the file** (`src/fonts/`, inlined by `tools/build.mjs`).
  The page asked Google for them on every visit; it now asks nobody for
  anything, and the build fails if that changes. Fixes the "Open" item from
  v6.2: Bricolage Grotesque and Public Sans are now credited.
- The program is sent brotli-compressed (4.8 MB → 0.9 MB) with an `ETag`.
- `FALLASKOLI_DATA` is honoured by the server (only `admin.mjs` read it).
- `docs/SERVER.md` Part 2: a dedicated user instead of root, data outside the
  program folder, upgrade without the `cp -r` that must not be forgotten.

### On first start after v6.2

1. Everybody logs in again.
2. The leaderboard is empty until people switch themselves on.
3. Existing accounts are marked *samþykki vantar*. They keep working; record
   who consented under *Notendur → Meira*.

### Open

- The privacy notice was drafted with this version and should be proofread by
  a second Icelandic reader before anybody is invited.
- The `fly` commands in `docs/HOSTING.md` follow Fly's documentation and were
  not run against a live account; the container's contents were run and tested
  exactly as the Dockerfile assembles them.
- No two-factor login for the administrator.
- The guardian's consent is a typed name, not a verified identity.
- JSON files are right for about a hundred users; past that, `server/store.mjs`
  should move to `node:sqlite`.
- `tests/browsers.test.js` "no syntax that only Chrome has" still fails on
  `navigator.clipboard`, as in v6.0–v6.2.

## v6.2 — November 2026

The interface, rebuilt around a classroom. No change to questions, grading,
badges, the state or the server; a v6.1 state opens unchanged.

### Four tabs

- **Æfa** — the work, on a green school board: the date in the corner as a
  teacher writes it, today's answers as tally marks against the daily goal,
  the verdict as a note stuck to the board.
- **Merki og framvinda** — the pupil's card and four figures on top, then
  *Merki*, *Framvinda* and *Orðasafn* as three panes of one tab.
- **Skólastofan** — the leaderboard and everybody else's badges
  (*Bekkjarfélagar*), which used to sit at the bottom of the badge tab.
- **Stillingar og námsefni** — the curriculum switches first, then the daily
  goal, moving progress between devices, *Umsjón* for an administrator, and
  the reset on its own at the end.
- **Gögn is no longer a tab.** It is a folded section, *Um forritið: gögn,
  heimildir og leyfi*, at the bottom of the last tab, drawn the first time it
  is opened. The licences are still one press from the footer's pointer.

### Look

- Three surfaces: squared paper behind everything, white sheets for cards and
  charts, the board for the question. The tabs are binder dividers, one colour
  each. Fonts are unchanged.
- The colour names (`--lupine`, `--moss`, `--rust`, `--sulphur`) are kept
  because the charts write them; `.blackboard` re-declares them as chalk, so
  every question type turned into chalk without a rule of its own.
- Small labels are sentence case at 11px or more, not tracked capitals at 9px.
- On a phone all four tabs are always visible (long names wrap onto two
  lines) instead of scrolling sideways.
- A card that says nothing can be asked ("Ekkert efni valið") carries a button
  to the switches.

### Code

- View ids are `practice`, `progress`, `class`, `settings` (`app.js` `VIEWS`);
  `renderBadges` no longer draws the roster and the board — `renderClass`
  does. `tools/browser-test.mjs` and `tools/server-test.mjs` follow.
- `ui/progress.js` gained `boardDate` and `tallyHTML`.

### Open

- The footer and `data/licenses.js` credit "IBM Plex" for the typefaces; the
  page has loaded Bricolage Grotesque and Public Sans beside IBM Plex Mono
  since before this version. Both are OFL and neither is named.
- No dark theme; the board is the only dark surface.

## v6.1 — November 2026

The social side: what users see of each other, and what they can win from each
other. `src/js/core/social.js` is new and holds all of it as pure functions;
the server and the browser both import it.

### Between users

- **The board opens on the week.** *Vikan* is XP earned since Monday and starts
  from nothing every week, so a newcomer can lead it. The all-time metrics are
  still one press away. A long board shows the top three and the rows around
  you, and a line above it says how many XP it is to the next person and who
  won last week.
- **A name carries a title, a shelf and a frame** everywhere it appears. The
  title is a rank already reached or the name of a secret badge (*Náttugla*);
  the shelf is up to three pinned badges (📌 on any badge you own; the three
  rarest until you choose); the frame is the level band — Leir, Brons, Silfur,
  Gull, Hrafntinna, Norðurljós. *Spjaldið þitt* at the top of the badge tab
  shows the card as others see it, and works from a file too.
- **Secrets are rumours.** A secret badge on somebody else's shelf shows its
  icon and name, `???` for the condition, and how many people here have found
  it. Ordinary badges still show their descriptions.
- **Nýtt í þessari viku** lists what people found since Monday, rarest first,
  with ★ on a badge its owner found before anyone else on the server.
- **Bera saman við mig** lays two cabinets side by side: theirs-not-yours
  first.
- **The level shown to others is the best ever reached**, so XP fading over a
  break never demotes anyone in public.
- **Medals** on badges won many times: 🥉 at 3, 🥈 at 10, 🥇 at 25.

### Levels

- **The curve is gentler: 150·(L−1)^2.2, was 250·(L−1)^2.5.** Level 3 is about
  three days after level 2 (was six), level 5 about day 16 (was day 40). Every
  threshold is lower than the one it replaced, so stored progress can gain
  levels on first load and never lose one; `tests/progress.test.js` pins both
  the new timing targets and that promise. **This replaces the v5 timing
  targets on purpose** — to go back, restore the one line in
  `core/progress.js` and the level family in `core/rarity.js`.
- Twenty titles instead of fourteen (*Orðsnillingur* … *Höfuðskáld*,
  *Þjóðskáld* still last), and level badges at 15 and 20.

### Badges (298, was 259)

- **With other people** (`when: "social"`, judged when the roster arrives):
  *Vikumeistari*, *Á palli*, *Framúrakstur* (visible in advance) and
  *Frumherji*, *Einstakt eintak*, *Hnífjafnt*, *Samferða* (secret). These are
  left out of *Öll merkin*, which must stay winnable from a file.
- **Sets:** the thirteen *jólasveinar*, one per day 12–24 December, closed by
  *Allir þrettán*; *Hálft stafrófið* and *Frá a til ö* for words beginning
  with every letter the vocabulary has.
- **Calendar:** *Dagur íslenskrar tungu*, *Bóndadagur*, *Konudagur*,
  *Skammdegi*, *Bjartar nætur*, *Pí-dagur*.
- **Accidents:** XP standing at exactly 874, 930, 1918 or 1944; three answers
  in a row accepted with a slip; changing a multiple-choice pick three times
  and still being right; the first miss on a word you had right five times;
  one word in all four cases in a session.

### Server

- `GET /social` (how last week ended), and `/roster` rows gained `title`,
  `showcase`, `tiers`, `newIds`, `firstIds`; scorecards gained `week`. See
  `docs/API.md`. **No date and nothing a child wrote leaves a state**: "new
  this week" and "found it first" are worked out on the server and sent as id
  lists. A user hidden from the board is hidden from all of it.
- `/leaderboard` defaults to `metric=week`.

### Open

- The weekly board uses the dates in each child's own day records and the
  server's clock for "this week"; a server in another time zone than its users
  would roll the week over a few hours early or late.
- Medals and the shelf are not part of rarity; a badge is as rare as it was.
- `tests/browsers.test.js` "no syntax that only Chrome has" fails on
  `navigator.clipboard` in `app.js` (the copy button under *Færa milli tækja*).
  It failed the same way in v6.0 and is untouched here.

## v6.0 — October 2026

### Icelandic

- **Every noun has a semantic class** (`noun_classes.py`: person, group,
  animal, plant, body, food, drink, clothing, vehicle, furniture, object,
  struct, substance, nature, weather, place, settlement, money, text, film,
  music, time, event, abstract) and every blank in the sentence bank says
  exactly which classes it accepts. *Í horninu liggur hamingja* and *Ég drekk
  bílinn* cannot be generated any more.
- **í / á.** Place and event nouns carry the preposition Icelandic puts them
  under (*í búðina*, *á ströndina*; 214 nouns). A blank under *í* or *á* now
  takes only nouns with the matching convention, instead of being closed.
- **með.** A blank directly under *með* is never asked as a cloze (*koma með
  hundinn* / *koma með hundinum* are both right), while the sentence still
  serves the analysis questions, where the case is read off the written form.
- **The sentence bank was re-read line by line** and rewritten: 724 sentences
  (was 663). Three-word captions were lengthened to real sentences; sentences
  that were grammatical but not Icelandic were replaced (*Hann kom með steinum
  úr fjörunni*, *Þetta er hús hests*, *Þeir léku sér með boltann* …); 300
  subtitle-corpus words (weapons, drugs, slurs, adult vocabulary) are kept in
  the vocabulary but never put into a generated sentence.
- **The adjective table says what it wants**: *án greinis, sterk beyging* or
  *með greini, veik beyging*, with the helper noun in the right form beside
  every cell (*svört kona* / *svarta konan*).
- **203 core words were missing from the vocabulary** — *líf, hönd, sonur,
  köttur, sól, jörð, fiskur, vegur, langur, hlæja* … — because the lexicon
  builder rejected any BÍN lemma carrying a variant note. Fixed; the
  vocabulary is 6,713 words (was 6,518). Ten more nouns the bank uses
  (*nesti, kaffi, mínúta* …) are pulled from BÍN directly.
- **Forms BÍN grades as incorrect** (*stóli*, *nóttu*, *friðs*) were being
  accepted as right answers through an `(x or 1)` expression. Fixed.
- **The guard now checks the lemma.** Greynir sometimes picks a rare lemma
  that happens to have the form (*sáum* → *sá* "to sow", *höfðum* → *höfða*,
  *nöfnum* → *nafni*, *búinn* → the noun *búi*). Such a token's analysis is
  withdrawn and the build prints it; nine were found in the shipped bank.
- Subject–verb agreement now settles a noun's number (*Þetta eru bara orð*),
  and 36 more verbs with certain government are in the table, so fewer tokens
  are left "uncertain" and more frames are usable.

### Hosting

- Served from any plain web host, the app runs as it does from a file (local
  storage) instead of showing a login gate for a server that is not there. It
  probes the origin once; only a real Fallaskóli server gets the login.

### Code

- Comments cut to what explains the code (the source went from 11,400 to
  8,100 lines with the same behaviour); the version history, the session
  rituals (`handover.mjs`, `worklist.mjs`) and the 2,300-line handover
  document are gone, replaced by `README.md` and this file.
- `semantics.py` replaced by `noun_classes.py`; `tools/try-sentences.py`
  rewritten for the new `need` format; `build.sh` shortened.

### Open

- Progress on a hosted page is per device; the server route is the only one
  that follows a child across devices automatically.
- Adjective frames cover the forms the analysis can ask about; a child still
  meets a bare form for a few strong neuter datives.
- Levels 6–7 (years 9–10) have one skill (clause types) and no sentences of
  their own yet.
