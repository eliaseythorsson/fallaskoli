# The curriculum map

What Fallaskóli teaches, set against what the Icelandic national curriculum asks
for in grammar at the end of compulsory school, and against what the textbooks
and school plans for years 8, 9 and 10 actually cover.

This is item 39 of the improvement list: the check of the app against the
current aðalnámskrá that had not been done. It was done in November 2026.

The same map exists as data in `src/js/core/curriculum.js`. The four tables
marked *generated* below are written from that file by
`node tools/curriculum-doc.mjs`, and a test fails if they differ, so this
document and the program cannot disagree. Everything else here is prose.

## The short version

1. **The aðalnámskrá does not say what to teach in year 8, 9 or 10.** It sets
   hæfniviðmið for the end of years 4, 7 and 10 only. In grammar there are six
   for year 10, under the heading *Mál og málnotkun*, plus one on spelling and
   punctuation under *Ritun*. Only one of the seven names grammar content: the
   pupil is to understand the inflectional and semantic features of the word
   classes and their role in text. The 2024 revision removed the lists of
   concepts that used to stand under the criteria.
2. So "the hæfniviðmið for year 8" does not exist as a national text, and the
   table this item asked for cannot be built from the aðalnámskrá alone. The
   year in which something is taught is decided by each school and, in
   practice, by the textbooks. The years in this map come from those, and
   schools differ.
3. **Against the one criterion that is about grammar proper, the app is in good
   shape**: all eleven word classes, their inflection and their role are
   covered by 49 question types and 21 Lesefni pages.
4. **The gaps** are (a) things Lesefni teaches and no question asks: strong
   and weak verbs with kennimyndir,
   the boðháttur, the þolmynd as something to recognise, compound tenses;
   (b) year 9–10 material that is not in the app at all: kinds of subordinate
   clause, phrases (nafnliður and the rest), word parts and compounds, sound
   changes, direct and indirect speech, register, idioms and proverbs;
   (c) spelling and punctuation, which has an official criterion of its own
   and no category in the app.
5. **Two labels were wrong.** Setningafræði and Setningagerðir said `9.b`. The
   year-10 plans and the year-10 textbook that could be read put both in
   year 10. They now say `10.b`. This is a judgement on thin evidence; see
   "Decisions for the owner".

## What was read, and how far to trust it

Honesty about method matters more here than anywhere else in the repository,
because a teacher may rely on this page.

**How the sources were read.** The pages were opened in November 2026 through
a tool that fetches a page and reports on it. It does not hand over the raw
text, it shortens long quotations, and it sees only the first part of a long
page. The official wording below was put together from several such reports.
Three of the seven criteria were assembled from two answers each. **Compare
the Icelandic wording with the official page before quoting it anywhere a
pupil or parent will read it.** The findings that do not depend on exact
wording (how many criteria, at which years, what they name) were confirmed in
more than one report and by an independent official summary.

| Source | What it is | What was established from it | Confidence |
| --- | --- | --- | --- |
| [Aðalnámskrá grunnskóla, kafli 19 Íslenska (2024)](https://www.adalnamskra.is/grunnskoli/kafli-19-islenska-2024) | The current official text | Five sections; six criteria under *Mál og málnotkun* at years 4, 7, 10; one on spelling under *Ritun*; none for years 8 or 9; matsviðmið A–C | Structure: high. Exact wording: medium, see above |
| [Kynningarefni, endurskoðun greinasviða, kafli 19](https://vefir.mms.is/adalnamskra_kynningarefni_17-26/8-9/) (Miðstöð menntunar og skólaþjónustu, 2025) | Official summary of the revision | Criteria in Icelandic went from 32–33 to 25; *Málfræði* was renamed *Mál og málnotkun*; lists of concepts under the criteria were removed | High |
| [Spurningar og svör, endurskoðun aðalnámskrár](https://island.is/s/midstod-menntunar-og-skolathjonustu/spurningar-og-svoer-vardandi-adalnamskra) | Official Q&A | The change was confirmed 17 October 2024 and took effect on publication, 25 October 2024; schools work to it from the school year 2025–2026 | High |
| [Matsviðmið í íslensku við lok 10. bekkjar (2013)](https://vefir.mms.is/namsmat/pdf/matsvidmid/10_bekkur/islenska.pdf) | The previous version's assessment criteria | The older wording many school plans still quote ("málfræðihugtökum í umræðu um notkun málsins og þróun þess") | High that it is the old version |
| [Kveikjur](https://vefir.mms.is/flettibaekur/namsefni/kveikjur/) (Menntamálastofnun 2019) | Year-8 textbook, table of contents | Grammar boxes on nafnorð and kenniföll, fornöfn, lýsingarorð, atviksorð, sagnorð, orðmyndun, greinarmerki, bein og óbein ræða, orðhlutar; a spelling box on y | Contents page only; chapters not read |
| [Neistar, kennsluleiðbeiningar](https://vefir.mms.is/klb/neistar_klb.pdf) (Námsgagnastofnun 2014) | Teacher's guide to the year-9 textbook | Ch. 2: óbeygjanleg orð, kinds of atviksorð and their comparison, aðaltengingar and aukatengingar, talmál and ritmál. Ch. 7: persónulegar and ópersónulegar sagnir, the moods, viðtengingarháttur, þágufallssýki | First 45 pages of the guide; the guide does not itself name the school year |
| [Málvísir](https://vefir.mms.is/flettibaekur/namsefni/malvisir-handbok_um_malfraedi/files/assets/common/downloads/publication.pdf) (2014) | Grammar handbook for the upper years | The full list of concepts used as the checklist for the nodes: kinds of pronoun, kennimyndir, the three kinds of aukasetning, the five setningarliðir, orðhlutar, hljóðbreytingar | High for what it lists; it is not tied to a year |
| School plans 2020–2026: Ölduselsskóli [8](https://olduselsskoli.reykjavik.is/sites/default/files/2025-09/namsaaetlun2025_isl.-8.-bekkur.pdf), [9](https://olduselsskoli.reykjavik.is/sites/default/files/2025-09/namsaaetlun2025_isl.-9.-bekkur.pdf), [10](https://olduselsskoli.reykjavik.is/sites/default/files/2025-09/namsaaetlun2025_isl.-10.-bekkur.pdf); Grunnskólinn í Þorlákshöfn [8](https://www.olfus.is/static/files/kennsluaaetlun-islenska-8.b.-2025-2026.pdf), [9](https://www.olfus.is/static/files/9.bekkur-islenska-kennsluaaetlun-haust-2025-.pdf), [10](https://www.olfus.is/static/files/kennsluaaetlun-i-islensku-10.b.-2020-2021.pdf); Foldaskóli [10](https://foldaskoli.reykjavik.is/sites/default/files/2025-12/10.-bekkur_0.pdf); Ingunnarskóli [8](https://ingunnarskoli.reykjavik.is/sites/default/files/2025-03/kennsluskipulag_8b_islenska_24_25.pdf); Öxarfjarðarskóli [9](https://oxarfjardarskoli.nordurthing.is/static/files/2023-2024/Kennsluaetlanir/Eldrideild/9_bekkur_isl.pdf) | What five schools say they teach in which year | The year column of the map | Five schools is a sample, not a survey |

**What could not be read.**

- *Logar*, the year-10 textbook, and its teacher's guide: the publisher's pages
  refuse automated readers. What Logar covers is known only second-hand, from
  two school plans (aðal- og aukasetningar, bein og óbein ræða, málsnið,
  orðtök og málshættir).
- *Málið í mark* (Fallorð, Sagnorð, Óbeygjanleg orð), the grammar workbooks
  every plan above uses. Only their titles and page ranges were seen.
- *Finnbjörg*, *Skerpa* and *Gullvör* (spelling and grammar): not readable.
- The 2013 hæfniviðmið themselves (only the 2013 matsviðmið were read).
- The *stuðningsefni* that the revision promised in place of the removed
  concept lists. If the curriculum site now lists grammar concepts by stage,
  that list should replace the textbook-derived years below.
- The matsviðmið for grade D, and the last quarter of the chapter page.

**What was not checked at all.** Whether the app's explanations agree with
these textbooks term by term. One difference was noticed in passing and is
listed under "For a teacher to check".

## The official criteria

*Við lok 10. bekkjar getur nemandi …* (aðalnámskrá grunnskóla, greinasvið 2024,
kafli 19). Wording as retrieved; see the caution above.

| Heading | Section | Wording |
| --- | --- | --- |
| Einkenni málsins | Mál og málnotkun | beitt málfræðiþekkingu sinni í umræðu um tungumálið, þróun og einkenni þess og nýtt hana í eigin málnotkun |
| Fjölbreytt málnotkun | Mál og málnotkun | áttað sig á fjölbreyttum tilbrigðum í orðaforða og málnotkun og beitt mismunandi málsniði eftir efni og tilefni í ræðu og riti |
| Sköpunarkraftur | Mál og málnotkun | áttað sig á og beitt sköpunarmætti tungumálsins og nýtt það m.a. við ritun, tal, nýyrðasmíð, í orðaleikjum og skáldskap |
| Orðflokkar | Mál og málnotkun | áttað sig á beygingarlegum og merkingarlegum einkennum orðflokka og gert sér grein fyrir hlutverki þeirra í eigin texta og annarra |
| Orðtök og málshættir | Mál og málnotkun | beitt fleygum orðum, algengum orðtökum, málsháttum og föstum orðasamböndum í máli sínu |
| Gögn og hjálpartæki | Mál og málnotkun | nýtt fjölbreytt hjálpartæki til að afla sér upplýsinga um tungumálið og styðja við notkun þess |
| Stafsetning og greinarmerkjasetning | Ritun | beitt helstu atriðum stafsetningar og greinarmerkjasetningar og notað til þess reglur um réttritun og önnur hjálpartæki |

For comparison, the year-7 criterion *Orðflokkar* expects the pupil to see how
the vocabulary divides into sagnorð, fallorð and óbeygjanleg orð and to
describe their role and main features. A pupil entering year 8 is therefore
expected to know the word classes already; years 8–10 deepen them.

There are **no interim criteria for years 8 and 9**. Each school writes its
own, and the plans read for this map simply repeat the year-10 criteria in
every year.

### Criterion → how much of it the app covers (generated)

<!-- curriculum:criteria:start -->
| Hæfniviðmið (heading in the aðalnámskrá) | Section | Within reach of a drill app? | Nodes | With questions | Fully covered |
| --- | --- | --- | --- | --- | --- |
| Orðflokkar | Mál og málnotkun | yes: the app's main subject | 31 | 28 | 23 |
| Einkenni málsins | Mál og málnotkun | yes: the app's main subject | 11 | 9 | 8 |
| Fjölbreytt málnotkun | Mál og málnotkun | partly | 2 | 1 | 1 |
| Sköpunarkraftur | Mál og málnotkun | partly | 1 | 1 | 1 |
| Orðtök og málshættir | Mál og málnotkun | partly | 1 | 0 | 0 |
| Gögn og hjálpartæki | Mál og málnotkun | no: outside what a drill program does | 0 | 0 | 0 |
| Stafsetning og greinarmerkjasetning | Ritun | partly | 4 | 0 | 0 |
<!-- curriculum:criteria:end -->

Reading the table: *Orðflokkar* is the app's home ground. *Einkenni málsins*
is the criterion that syntax, word structure and applied grammar fall under,
since no criterion names them. *Gögn og hjálpartæki* (using dictionaries and
BÍN) is not something a drill program can test and has no node. The app does
link every word to its paradigm, which serves it indirectly.

## The map (generated)

One row per **node**: a single thing a pupil learns. Each node belongs to one
official criterion, one skill (the app's categories), the question types that
test it, and the Lesefni page that teaches it. *Covered* is **yes** when a
question type is about exactly this node, **in part** when it is asked only
inside broader questions, and **no** when nothing asks it.

The year is the year in which the material is usually first taught, by the
evidence above. Later years keep practising it.

<!-- curriculum:nodes:start -->
### 8. bekkur

| Node | Efni | Hæfniviðmið | Skill (flokkur) | Question types | Lesefni | Covered |
| --- | --- | --- | --- | --- | --- | --- |
| `no-foll` | Föllin fjögur | Orðflokkar | Nafnorð | Settu orðið í rétt horf (`fill`); Veldu rétt fall (`no_val`); Beygingartafla — nafnorð (`tbl_no`) | Föllin fjögur (`foll`) | yes |
| `no-kyn-tala` | Kyn og tala nafnorða | Orðflokkar | Nafnorð | Greindu orðið sem er merkt (`parse`) | Kyn og tala nafnorða (`kyn-tala`) | in part |
| `no-beyging` | Sterk og veik beyging nafnorða og kenniföll | Orðflokkar | Nafnorð | Sterkt eða veikt nafnorð (`no_beyging`) | Sterk og veik beyging nafnorða (`nafnord-beyging`) | yes |
| `lo-beyging` | Sterk og veik beyging lýsingarorða | Orðflokkar | Lýsingarorð | Sterk eða veik beyging (`lo_beyging`); Beygingartafla — lýsingarorð (`tbl_lo`); Greindu beygðu myndina (`revform`) | Sterk og veik beyging lýsingarorða (`lo-beyging`) | yes |
| `lo-stig` | Stigbreyting | Orðflokkar | Lýsingarorð | Stigbreyting í setningu (`lo_stig`); Beygingartafla — lýsingarorð (`tbl_lo`) | Stigbreyting (`stigbreyting`) | yes |
| `lo-samraemi` | Samræmi lýsingarorðs og nafnorðs | Orðflokkar | Lýsingarorð | Samræmi lýsingarorðs (`lo_samr`) | Samræmi (`samraemi`) | yes |
| `fn-personu` | Persónufornöfn í öllum föllum | Orðflokkar | Fornöfn og greinir | Fornafn í eyðu (`fn_eyda`); Fornafn í stað nafnorðs (`fn_stad`); Beygingartafla — fornöfn (`tbl_fn`) | Fornöfn (`fornofn`) | yes |
| `fn-greinir` | Laus og viðskeyttur greinir | Orðflokkar | Fornöfn og greinir | Beygingartafla — fornöfn (`tbl_fn`) | Greinir (`greinir`) | in part |
| `fn-flokkar` | Flokkar fornafna | Orðflokkar | Fornöfn og greinir | Hvers konar fornafn? (`fn_flokkar`) | Fornöfn (`fornofn`) | yes |
| `to-frumtolur` | Frumtölur og beyging þeirra | Orðflokkar | Töluorð | Töluorð í eyðu (`to_samr`); Veldu mynd töluorðs (`to_val`); Beygingartafla — töluorð (`tbl_to`) | Töluorð (`toluord`) | yes |
| `to-radtolur` | Raðtölur og dagsetningar | Orðflokkar | Töluorð | Dagsetningar (`to_dags`); Beygingartafla — töluorð (`tbl_to`) | Töluorð (`toluord`) | yes |
| `to-fleirtolu` | Töluorð með fleirtöluorðum | Orðflokkar | Töluorð | Töluorð með fleirtöluorðum (`to_flt`) | Töluorð (`toluord`) | yes |
| `so-persona-tala` | Persóna og tala sagna | Orðflokkar | Sagnorð | Beygðu sögnina (`verb`); Sögn í setningu (`verbslot`); Beygingartafla — sagnorð (`tbl_so`) | Persóna og tala sagna (`persona-tala`) | yes |
| `so-tid` | Nútíð og þátíð | Orðflokkar | Sagnorð | Beygðu sögnina (`verb`); Sögn í setningu (`verbslot`); Beygingartafla — sagnorð (`tbl_so`) | Tíð sagna (`tid`) | yes |
| `ob-flokkar` | Að þekkja óbeygjanleg orð | Orðflokkar | Óbeygjanleg orð | Í hvaða orðflokki er orðið? (`indecl`); Smelltu á orðin (`ob_smella`); Flokkaðu óbeygjanleg orð (`ob_flokka`) | Óbeygjanleg orð (`obeygjanleg`) | yes |
| `gr-ordflokkar` | Orðflokkagreining | Orðflokkar | Orðflokkagreining | Greindu orðið sem er merkt (`parse`); Smelltu á orðflokkinn (`gr_smella`); Flokkaðu orðin (`gr_flokka`) | Orðflokkarnir ellefu (`ordflokkar`) | yes |
| `fs-forsetningar` | Fallstjórn forsetninga | Orðflokkar | Fallstjórn | Hvaða falli stýrir orðið? (`govern`); Forsetning + nafnorð (`fs_fsno`) | Fallstjórn (`fallstjorn`) | yes |
| `fs-hreyfing` | Hreyfing eða kyrrstaða | Orðflokkar | Fallstjórn | Hreyfing eða kyrrstaða (`fs_hreyf`) | Fallstjórn (`fallstjorn`) | yes |
| `fs-sagnir` | Fallstjórn sagna | Orðflokkar | Fallstjórn | Hvaða falli stýrir orðið? (`govern`); Sögn stýrir falli (`fs_sogn`) | Fallstjórn (`fallstjorn`) | yes |
| `or-merking` | Merking orða, samheiti og andheiti | Fjölbreytt málnotkun | Orðaforði | Hvað þýðir orðið? (`meaning`); Samheiti og andheiti (`or_heiti`); Orð í samhengi (`or_samhengi`); Hvert á ekki heima? (`or_utundan`) | Að útskýra orð með eigin orðum (`ordafordi`) | yes |
| `or-myndun` | Orðmyndun með forskeytum og viðskeytum | Sköpunarkraftur | Orðaforði | Orðmyndun (`or_myndun`) | Að útskýra orð með eigin orðum (`ordafordi`) | yes |
| `or-ordtok` | Orðtök, málshættir og föst orðasambönd | Orðtök og málshættir | Orðaforði | none yet | none yet | **no** |
| `mb-villur` | Villuveiðar | Einkenni málsins | Málbeiting | Villuveiðar (`villur`) | Málfræðin í notkun (`malbeiting`) | yes |
| `mb-smidja` | Setningasmiðja | Einkenni málsins | Málbeiting | Setningasmiðja (`smidja`) | Málfræðin í notkun (`malbeiting`) | yes |
| `mb-umritun` | Umritun | Einkenni málsins | Málbeiting | Umritun (`umritun`) | Málfræðin í notkun (`malbeiting`) | yes |
| `st-n-nn` | n eða nn | Stafsetning og greinarmerkjasetning | Stafsetning og greinarmerki | none yet | none yet | **no** |
| `st-y` | y, ý og ey | Stafsetning og greinarmerkjasetning | Stafsetning og greinarmerki | none yet | none yet | **no** |
| `st-stor-stafur` | Stór og lítill stafur | Stafsetning og greinarmerkjasetning | Stafsetning og greinarmerki | none yet | none yet | **no** |
| `st-greinarmerki` | Greinarmerki | Stafsetning og greinarmerkjasetning | Stafsetning og greinarmerki | none yet | none yet | **no** |

### 9. bekkur

| Node | Efni | Hæfniviðmið | Skill (flokkur) | Question types | Lesefni | Covered |
| --- | --- | --- | --- | --- | --- | --- |
| `fn-afturbeygt` | Afturbeygt fornafn: sér eða honum, sinn eða hans | Orðflokkar | Fornöfn og greinir | Afturbeygt eða ekki (`fn_aftur`) | Fornöfn (`fornofn`) | yes |
| `so-samsettar-tidir` | Samsettar tíðir | Orðflokkar | Sagnorð | none yet | Tíð sagna (`tid`) | **no** |
| `so-vidtengingarhattur` | Framsöguháttur og viðtengingarháttur | Orðflokkar | Sagnorð | Beygðu sögnina (`verb`); Sögn í setningu (`verbslot`); Beygingartafla — sagnorð (`tbl_so`) | Hættir sagna (`hattur`) | yes |
| `so-bodhattur` | Boðháttur | Orðflokkar | Sagnorð | Greindu beygðu myndina (`revform`) | Hættir sagna (`hattur`) | in part |
| `so-fallhaettir` | Fallhættir: nafnháttur, lýsingarhættir og sagnbót | Orðflokkar | Sagnorð | Greindu beygðu myndina (`revform`) | Hættir sagna (`hattur`) | in part |
| `so-midmynd` | Germynd og miðmynd | Orðflokkar | Sagnorð | Beygðu sögnina (`verb`); Sögn í setningu (`verbslot`); Beygingartafla — sagnorð (`tbl_so`) | Myndir sagna (`mynd`) | yes |
| `so-tholmynd` | Þolmynd | Orðflokkar | Sagnorð | Umritun (`umritun`) | Myndir sagna (`mynd`) | in part |
| `so-sterkar-veikar` | Sterkar og veikar sagnir og kennimyndir | Orðflokkar | Sagnorð | none yet | Sterkar og veikar sagnir (`sterkar-veikar`) | **no** |
| `ob-fs-ao` | Forsetning eða atviksorð | Orðflokkar | Óbeygjanleg orð | Forsetning eða atviksorð (`ob_fsao`) | Óbeygjanleg orð (`obeygjanleg`) | yes |
| `ob-samtengingar` | Samtengingar | Orðflokkar | Óbeygjanleg orð | Veldu samtenginguna (`ob_st`) | Óbeygjanleg orð (`obeygjanleg`) | yes |
| `ob-atviksord` | Flokkar atviksorða og stigbreyting þeirra | Orðflokkar | Óbeygjanleg orð | none yet | none yet | **no** |
| `fs-operson` | Ópersónulegar sagnir | Orðflokkar | Fallstjórn | Ópersónulegar sagnir (`fs_operson`) | Fallstjórn (`fallstjorn`) | yes |
| `mb-malsnid` | Málsnið: talmál og ritmál | Fjölbreytt málnotkun | Málbeiting | none yet | none yet | **no** |

### 10. bekkur

| Node | Efni | Hæfniviðmið | Skill (flokkur) | Question types | Lesefni | Covered |
| --- | --- | --- | --- | --- | --- | --- |
| `or-ordhlutar` | Orðhlutar og samsett orð | Einkenni málsins | Orðaforði | none yet | none yet | **no** |
| `or-hljodbreytingar` | Hljóðbreytingar og skyldleiki orða | Einkenni málsins | Orðaforði | none yet | none yet | **no** |
| `mb-raeda` | Bein og óbein ræða | Einkenni málsins | Málbeiting | Bein og óbein ræða (`raeda`) | Bein og óbein ræða (`raeda`) | yes |
| `setn-hlutar` | Frumlag, umsögn, andlag og sagnfylling | Einkenni málsins | Setningafræði | Smelltu á rétta orðið (`syntax`); Hvaða setningarhluti? (`setn_hlut`); Flokkaðu setningarhluta (`setn_flokka`) | Setningarliðir (`setningalidir`) | yes |
| `setn-ordarod` | Orðaröð | Einkenni málsins | Setningafræði | Umritun (`umritun`) | Málfræðin í notkun (`malbeiting`) | in part |
| `setn-lidir` | Nafnliður, sagnliður og forsetningarliður | Einkenni málsins | Setningafræði | Hvers konar liður? (`setn_lidir`); Finndu forsetningarliðinn (`lid_finna`) | Nafnliður, sagnliður og forsetningarliður (`lidir`) | yes |
| `gerd-adal-auka` | Aðalsetning, aukasetning og nafnháttarsetning | Einkenni málsins | Setningagerðir | Hvers konar setning er þetta? (`clause`); Finndu aukasetninguna (`gerd_finna`); Hvar hefst setningin? (`gerd_upphaf`) | Setningagerðir (`setningagerdir`) | yes |
| `gerd-tegundir` | Tegundir aukasetninga | Einkenni málsins | Setningagerðir | Hvers konar aukasetning? (`gerd_tegund`) | Tegundir aukasetninga (`aukasetningar`) | yes |
<!-- curriculum:nodes:end -->

### Why each year is what it is

- **Year 8: fallorð, the basics of verbs, recognising the word classes.**
  All three year-8 plans teach fallorð from *Málið í mark – Fallorð*
  (nafnorð and greinir, lýsingarorð; fornöfn and töluorð belong to the same
  book). Kveikjur has grammar boxes on nafnorð and kenniföll, fornöfn,
  lýsingarorð, atviksorð and sagnorð. Orðflokkagreining is a named year-8
  topic in Þorlákshöfn.
- **Year 9: more about verbs and the small words.** All three year-9 plans
  teach óbeygjanleg orð and two of them sagnorð; Neistar's two grammar chapters
  are exactly those (moods, impersonal verbs and þágufallssýki; kinds of
  atviksorð, aðal- and aukatengingar). Hence viðtengingarháttur, miðmynd,
  ópersónulegar sagnir, samtengingar and forsetning-or-atviksorð sit here.
  One school (Ölduselsskóli) teaches moods and voices at the end of year 8.
- **Year 10: syntax, word structure, revision.** Foldaskóli's year-10 plan
  lists setningarhlutar, word order and aðal- og aukasetningar; Þorlákshöfn's
  has aðal- og aukasetningar; Ölduselsskóli's has setningafræði without
  detail. None of the year-9 plans read has syntax as a topic (one mentions
  setningaskipan). Word structure is year 10 at Foldaskóli (orðhlutafræði,
  hljóðbreytingar) and Ölduselsskóli (orðmyndunarfræði, where year 9 ends
  with a few days of it as "preparation for year 10").
- **Judgement, not evidence:** `fn-afturbeygt` in year 9 (harder than the
  personal pronouns, and Þorlákshöfn returns to fornöfn in year 9);
  `so-sterkar-veikar` in year 9 (the Sagnorð workbook is used in year 8, 9
  and 10 by different schools); `or-ordtok` in year 8 and `mb-malsnid` in
  year 9 (one plan each); all four spelling nodes in year 8 (spelling is
  taught every year; Kveikjur has y and punctuation).
- **Bein og óbein ræða** is introduced in Kveikjur (year 8) and taught again
  with Logar (year 10). The node sits in year 10 because the app would test
  the shift to viðtengingarháttur, which needs the year-9 verb material.

## The backlog for items 27 and 28 (generated)

Every node that is not fully covered. "Only inside" means the material is
asked, but only as one feature among others in a broader question, so a pupil
cannot practise it on its own and the skill map cannot measure it.

<!-- curriculum:backlog:start -->
### Item 27: Lesefni teaches it, practice does not ask it (or only in passing)

| Node | Efni | Year | Question type | Lesefni page |
| --- | --- | --- | --- | --- |
| `no-kyn-tala` | Kyn og tala nafnorða | 8 | only inside `parse` | `kyn-tala` |
| `fn-greinir` | Laus og viðskeyttur greinir | 8 | only inside `tbl_fn` | `greinir` |
| `so-samsettar-tidir` | Samsettar tíðir | 9 | **missing** | `tid` |
| `so-bodhattur` | Boðháttur | 9 | only inside `revform` | `hattur` |
| `so-fallhaettir` | Fallhættir: nafnháttur, lýsingarhættir og sagnbót | 9 | only inside `revform` | `hattur` |
| `so-tholmynd` | Þolmynd | 9 | only inside `umritun` | `mynd` |
| `so-sterkar-veikar` | Sterkar og veikar sagnir og kennimyndir | 9 | **missing** | `sterkar-veikar` |

### Item 28: new material

| Node | Efni | Year | Question type | Lesefni page |
| --- | --- | --- | --- | --- |
| `ob-atviksord` | Flokkar atviksorða og stigbreyting þeirra | 9 | **missing** | **missing** |
| `or-ordtok` | Orðtök, málshættir og föst orðasambönd | 8 | **missing** | **missing** |
| `or-ordhlutar` | Orðhlutar og samsett orð | 10 | **missing** | **missing** |
| `or-hljodbreytingar` | Hljóðbreytingar og skyldleiki orða | 10 | **missing** | **missing** |
| `mb-malsnid` | Málsnið: talmál og ritmál | 9 | **missing** | **missing** |
| `setn-ordarod` | Orðaröð | 10 | only inside `umritun` | `malbeiting` |
| `st-n-nn` | n eða nn | 8 | **missing** | **missing** |
| `st-y` | y, ý og ey | 8 | **missing** | **missing** |
| `st-stor-stafur` | Stór og lítill stafur | 8 | **missing** | **missing** |
| `st-greinarmerki` | Greinarmerki | 8 | **missing** | **missing** |
<!-- curriculum:backlog:end -->

Notes for whoever takes these on:

- **Item 27's list in the critique is confirmed**, with three additions the
  check found: `no-kyn-tala`, `fn-greinir` and `so-fallhaettir` are taught on
  their own Lesefni pages and are asked only inside the word-class analysis,
  a paradigm table and the reverse analysis; `so-samsettar-tidir` is taught on
  the *Tíð sagna* page and never asked.
- **Done (item 27, first half):** kinds of pronoun (`fn_flokkar`) and strong
  and weak nouns (`no_beyging`) now have question types of their own. The
  sentence bank has a single direct question (*Hvaða bók ætlar þú að lesa í
  kvöld?*), so *spurnarfornafn* is an option in every question from þyngd 3
  but the right answer of only one; more questions in `sentences.py` would
  fix that.
- **The boðháttur**: measured over 1,350 questions, the three types that make
  a pupil produce a verb form (`verb`, `verbslot`, `tbl_so`) ask
  framsöguháttur and viðtengingarháttur, germynd and miðmynd, and never the
  boðháttur. It turns up only as a form to recognise in `revform`. A test
  pins this, and will fail (asking for the node to be upgraded) when a builder
  starts asking it.
- **The þolmynd** is produced in `umritun` (about one question in sixteen) and
  never recognised.
- **Item 28's candidates are all confirmed** as material that textbooks or
  plans for years 9–10 cover: kinds of subordinate clause, phrases, word parts
  and compounds, direct and indirect speech, spelling, punctuation. The check
  adds four the critique did not list: `or-hljodbreytingar` (one year-10
  plan, Málvísir), `ob-atviksord` (Neistar ch. 2), `mb-malsnid` and
  `or-ordtok` (each an official criterion in its own right).
- **Root and stem** are in the critique's list. Málvísir has rót, stofn,
  forskeyti, viðskeyti and beygingarending; they are one node,
  `or-ordhlutar`, to be split when the questions are designed.
- **Spelling** needs a decision before it needs questions: it is a category
  the app does not have (`stafsetning` in `PLANNED_CATEGORIES`).

## The three presets (generated table)

*8., 9.* and *10. bekkur* in the policy editor, for the teacher's ceiling and
for the pupil's own settings alike. A preset is not written anywhere: it is
computed from the nodes. A year covers every node of that year and of the
years below that has questions; the categories and question types of those
nodes are switched on and everything else off.

<!-- curriculum:presets:start -->
| Preset | Categories on | Question types on | Levels | What it adds |
| --- | --- | --- | --- | --- |
| 8. bekkur | 10 of 12 | 39 of 53 | 1–5 | Nafnorð, Lýsingarorð, Fornöfn og greinir, Töluorð, Sagnorð, Óbeygjanleg orð, Orðflokkagreining, Fallstjórn, Orðaforði, Málbeiting |
| 9. bekkur | 10 of 12 | 43 of 53 | 1–6 | no new category; types `fn_aftur`, `ob_fsao`, `ob_st`, `fs_operson` |
| 10. bekkur | 12 of 12 | 53 of 53 | 1–7 | Setningafræði, Setningagerðir; types `raeda`, `syntax`, `setn_hlut`, `setn_flokka`, `setn_lidir`, `lid_finna`, `clause`, `gerd_finna`, `gerd_upphaf`, `gerd_tegund` |
<!-- curriculum:presets:end -->

What a preset does not do, so nobody is surprised:

- **It does not touch the inflection switches** (föll, hættir, myndir …). So
  in the year-8 preset the verb questions still reach viðtengingarháttur and
  miðmynd at the higher levels, as they did before this change, although the
  map places those in year 9. An adult who wants year 8 without them switches
  them off under *Beygingaratriði*. Making the presets set those switches too
  is possible (the nodes carry the features in `attrs`), and was left out
  because it would overwrite an adult's own choices there.
- **Levels 6 and 7 are sentence levels, not new material.** The levels follow
  the convention in `core/difficulty.js` (1–5 is year 8, 6 is year 9, 7 is
  year 10). Since v6.13 the bank has 139 sentences at level 6 and 78 at
  level 7: two subordinate clauses, þolmynd, viðtengingarháttur þátíðar,
  óbein ræða, longer noun phrases (`sentences.py` says what earns a level).
  So the year-9 and year-10 presets now give harder sentences in the cloze,
  the analysis and Setningagerðir as the pupil's difficulty rises. They are
  the same question types asked about harder sentences: the constructions
  themselves (`so-tholmynd`, `mb-raeda` …) are still in the backlog above.
  A pupil on no preset has every level switched on, 6 and 7 included.
- **Year 9 adds only four question types.** That is an honest picture of the
  app: it was built for year 8, and most year-9 and year-10 material is in the
  backlog above.
- **A new pupil is not on a preset.** A fresh account has the year-8
  categories with every question type on, as before; the editor then says
  that no year is chosen. Items 50 and 84 decide what a new pupil starts on.
- **The switches stay.** A preset is a starting point. Change one switch and
  the editor says that no year is chosen.

## Decisions for the owner

1. **Setningafræði and Setningagerðir are now year 10** (they were `9.b`).
   Nothing changes for an existing pupil: both were off by default and still
   are, and saved choices are kept. But the year-9 preset does not include
   them. If your son's school teaches frumlag, umsögn and andlag in year 9,
   change `year` on `setn-hlutar` (and `gerd-adal-auka`) in
   `src/js/core/curriculum.js`; the presets, the labels and this document
   follow, and one test tells you which sentence to reword.
2. **Ask the school for its own plan.** The national curriculum leaves the
   order to the school, so the plan of the school your son attends is a better
   authority than this map. Its teaching plan for íslenska in his year would
   settle most of the judgement calls above.
3. **Spelling** has an official criterion and is in every school plan read.
   Whether Fallaskóli should teach it is a question of scope, not of code.

## For a teacher to check

- The Icelandic wording of the seven criteria against the official page.
- The node names in `src/js/core/curriculum.js` (the *Efni* column). They will
  be shown to pupils on the skill map of item 83.
- **Setningarliðir or setningarhlutar?** The Lesefni page on frumlag, umsögn,
  andlag and sagnfylling is titled *Setningarliðir*. Málvísir uses
  *setningarliðir* for nafnliður, sagnliður, forsetningarliður, atviksliður
  and tengiliður, and treats frumlag, andlag, sagnfylling and umsögn as roles;
  one school plan calls them *setningarhlutar*. If phrases are added
  (`setn-lidir`), the page title will clash with them. The page was not
  changed here.
- Whether *fallsetningar, tilvísunarsetningar* and *atvikssetningar* (Málvísir)
  or *skýringar-, tilvísunar-, tíðar-, skilyrðis-* and *orsakarsetningar* (the
  critique) is the division your school's book uses for `gerd-tegundir`.

## Keeping this up to date

- A node is one entry in `NODES` in `src/js/core/curriculum.js`. After any
  change run `node tools/curriculum-doc.mjs` and commit the document with it.
- Node ids are permanent: saved progress will be keyed by them (item 83). Add
  and retire; never rename. A test pins the list.
- When a question type is added for a backlog node, put its id in the node's
  `types`, set `cover`, and remove `item`. The tests then insist that the type
  and the page exist, and the node unlocks on the skill map.
- `tests/curriculum-map.test.js` checks that every question type and every
  Lesefni page is on some node, so new material cannot be added off the map.
