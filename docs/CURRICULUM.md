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
   covered by 52 question types and 21 Lesefni pages.
4. **The gaps** are (a) things Lesefni teaches and no question asks:
   compound tenses;
   (b) year 9–10 material that is not in the app at all: kinds of subordinate
   clause, phrases (nafnliður and the rest), word parts and compounds, sound
   changes, direct and indirect speech, register, idioms and proverbs;
   covered by 49 question types and 21 Lesefni pages.
4. **The gaps** are (a) things Lesefni teaches and no question asks: strong
   and weak verbs with kennimyndir,
   the boðháttur, the þolmynd as something to recognise, compound tenses;
   (b) year 9–10 material that is not in the app at all: word parts and
   compounds, sound changes, register, idioms and proverbs, kinds of adverb
   (kinds of subordinate clause, phrases and direct and indirect speech were
   on this list until item 28 built them: see "What item 28 built");
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

**Lesskilningur** (issue #30) is the one criterion on the map from another
section, *Lestur og bókmenntir*: the texts of the skill Lesskilningur fall
under it. Its heading was read in a school plan for 2025–2026 (Víkurskóli),
which gives the year-10 wording as *skilið og fjallað um fjölbreytta texta,
greint þá og borið saman á margvíslegan hátt og lagt rökstutt og gagnrýnið
mat á inntak þeirra og eiginleika*. **Neither the heading nor the wording was
read on the official page**; compare both before relying on them. The other
criteria of that section (lesfimi, lestraraðferðir, bókmenntir …) are not on
the map: the app does nothing about them.

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
| Orðflokkar | Mál og málnotkun | yes: the app's main subject | 32 | 30 | 27 |
| Einkenni málsins | Mál og málnotkun | yes: the app's main subject | 12 | 10 | 9 |
| Fjölbreytt málnotkun | Mál og málnotkun | partly | 3 | 1 | 1 |
| Sköpunarkraftur | Mál og málnotkun | partly | 1 | 1 | 1 |
| Orðtök og málshættir | Mál og málnotkun | partly | 1 | 0 | 0 |
| Gögn og hjálpartæki | Mál og málnotkun | no: outside what a drill program does | 0 | 0 | 0 |
| Stafsetning og greinarmerkjasetning | Ritun | partly | 4 | 0 | 0 |
| Lesskilningur | Lestur og bókmenntir | partly | 1 | 1 | 1 |
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
| `ob-tengiord` | Tengiorð: orsök, tími og andstæða | Orðflokkar | Óbeygjanleg orð | Veldu tengiorðið (`ob_tengiord`); Hvað segir setningin? (`ob_skilja`) | Óbeygjanleg orð (`obeygjanleg`) | yes |
| `gr-ordflokkar` | Orðflokkagreining | Orðflokkar | Orðflokkagreining | Greindu orðið sem er merkt (`parse`); Smelltu á orðflokkinn (`gr_smella`); Flokkaðu orðin (`gr_flokka`) | Orðflokkarnir ellefu (`ordflokkar`) | yes |
| `fs-forsetningar` | Fallstjórn forsetninga | Orðflokkar | Fallstjórn | Hvaða falli stýrir orðið? (`govern`); Forsetning + nafnorð (`fs_fsno`) | Fallstjórn (`fallstjorn`) | yes |
| `fs-hreyfing` | Hreyfing eða kyrrstaða | Orðflokkar | Fallstjórn | Hreyfing eða kyrrstaða (`fs_hreyf`) | Fallstjórn (`fallstjorn`) | yes |
| `fs-sagnir` | Fallstjórn sagna | Orðflokkar | Fallstjórn | Hvaða falli stýrir orðið? (`govern`); Sögn stýrir falli (`fs_sogn`) | Fallstjórn (`fallstjorn`) | yes |
| `or-merking` | Merking orða, samheiti og andheiti | Fjölbreytt málnotkun | Orðaforði | Hvað þýðir orðið? (`meaning`); Samheiti og andheiti (`or_heiti`); Orð í samhengi (`or_samhengi`); Hvert á ekki heima? (`or_utundan`); Hvaða orð vantar? (`or_eyda`); Merking orðs í setningu (`or_merking`) | Að útskýra orð með eigin orðum (`ordafordi`) | yes |
| `or-myndun` | Orðmyndun með forskeytum og viðskeytum | Sköpunarkraftur | Orðaforði | Orðmyndun (`or_myndun`) | Að útskýra orð með eigin orðum (`ordafordi`) | yes |
| `or-ordtok` | Orðtök, málshættir og föst orðasambönd | Orðtök og málshættir | Orðaforði | none yet | none yet | **no** |
| `nams-ordin` | Orðin sem ég er að læra | Fjölbreytt málnotkun | Námsorð | none yet | Orðin sem þú ert að læra (`namsord`) | **no** |
| `mb-villur` | Villuveiðar | Einkenni málsins | Málbeiting | Villuveiðar (`villur`) | Málfræðin í notkun (`malbeiting`) | yes |
| `mb-smidja` | Setningasmiðja | Einkenni málsins | Málbeiting | Setningasmiðja (`smidja`) | Málfræðin í notkun (`malbeiting`) | yes |
| `mb-umritun` | Umritun | Einkenni málsins | Málbeiting | Umritun (`umritun`) | Málfræðin í notkun (`malbeiting`) | yes |
| `mb-sameina` | Að sameina og skipta setningum | Einkenni málsins | Málbeiting | Sameina og skipta setningum (`sameina`) | Málfræðin í notkun (`malbeiting`) | yes |
| `les-adalatridi` | Aðalatriði texta | Lesskilningur | Lesskilningur | Um hvað er textinn? (`les_adal`) | Að finna aðalatriðið í texta (`lesskilningur`) | yes |
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
| `so-bodhattur` | Boðháttur | Orðflokkar | Sagnorð | Greindu beygðu myndina (`revform`); Boðháttur (`so_bodhattur`) | Hættir sagna (`hattur`) | yes |
| `so-fallhaettir` | Fallhættir: nafnháttur, lýsingarhættir og sagnbót | Orðflokkar | Sagnorð | Greindu beygðu myndina (`revform`); Greindu orðið sem er merkt (`parse`) | Hættir sagna (`hattur`) | in part |
| `so-midmynd` | Germynd og miðmynd | Orðflokkar | Sagnorð | Beygðu sögnina (`verb`); Sögn í setningu (`verbslot`); Beygingartafla — sagnorð (`tbl_so`) | Myndir sagna (`mynd`) | yes |
| `so-tholmynd` | Þolmynd | Orðflokkar | Sagnorð | Umritun (`umritun`); Germynd, miðmynd eða þolmynd? (`so_mynd`) | Myndir sagna (`mynd`) | yes |
| `so-sterkar-veikar` | Sterkar og veikar sagnir og kennimyndir | Orðflokkar | Sagnorð | Sterk eða veik sögn? (`so_beyging`) | Sterkar og veikar sagnir (`sterkar-veikar`) | yes |
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
| `setn-hlutar` | Frumlag, umsögn, andlag og sagnfylling | Einkenni málsins | Setningafræði | Smelltu á rétta orðið (`syntax`); Hvaða setningarhluti? (`setn_hlut`); Flokkaðu setningarhluta (`setn_flokka`); Hver gerði hvað? (`hver_gerdi`) | Setningarhlutar (`setningarhlutar`) | yes |
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
| `so-fallhaettir` | Fallhættir: nafnháttur, lýsingarhættir og sagnbót | 9 | only inside `revform`, `parse` | `hattur` |

### Item 28: new material

| Node | Efni | Year | Question type | Lesefni page |
| --- | --- | --- | --- | --- |
| `ob-atviksord` | Flokkar atviksorða og stigbreyting þeirra | 9 | **missing** | **missing** |
| `or-ordtok` | Orðtök, málshættir og föst orðasambönd | 8 | **missing** | **missing** |
| `or-ordhlutar` | Orðhlutar og samsett orð | 10 | **missing** | **missing** |
| `or-hljodbreytingar` | Hljóðbreytingar og skyldleiki orða | 10 | **missing** | **missing** |
| `nams-ordin` | Orðin sem ég er að læra | 8 | **missing** | `namsord` |
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
  but the right answer of only one; more questions in the sentence bank (`content/setningar/`) would
  fix that.
- **Done (item 27, second half):** strong and weak verbs with their
  kennimyndir (`so_beyging`), the three myndir with the þolmynd to recognise
  (`so_mynd`) and the boðháttur written (`so_bodhattur`) have question types
  of their own, in the 9. bekkur preset. The three types that make a pupil
  produce a verb form in a sentence or a table (`verb`, `verbslot`,
  `tbl_so`) still never ask the boðháttur; `so_bodhattur` does, outside a
  sentence, because the bank has no imperative sentence. Most þolmynd
  sentences are at level 6–7, so at þyngd 1–2 `so_mynd` asks the eight
  shortest of them; more short þolmynd sentences in the bank (`content/setningar/`) would
  widen that.
- **Item 28's candidates are all confirmed** as material that textbooks or
  plans for years 9–10 cover: kinds of subordinate clause, phrases, word parts
  and compounds, direct and indirect speech, spelling, punctuation. The check
  adds four the critique did not list: `or-hljodbreytingar` (one year-10
  plan, Málvísir), `ob-atviksord` (Neistar ch. 2), `mb-malsnid` and
  `or-ordtok` (each an official criterion in its own right).
- **Built (item 28):** `gerd-tegundir`, `setn-lidir` and `mb-raeda`. What was
  built, what was left out of each and why is under "What item 28 built"
  below. The other candidates were not built, for the reasons given there.
- **Root and stem** are in the critique's list. Málvísir has rót, stofn,
  forskeyti, viðskeyti and beygingarending; they are one node,
  `or-ordhlutar`, to be split when the questions are designed.
- **Spelling** needs a decision before it needs questions: it is a category
  the app does not have (`stafsetning` in `PLANNED_CATEGORIES`).

## What item 28 built

Three nodes of the year-10 map went from "no questions, no page" to covered.
Each has a Lesefni page, a diagnosis pattern for the mistake the page warns
of, and a place in the year-10 preset.

| Node | Question type | Steps of difficulty | Different questions per step | Lesefni |
| --- | --- | --- | --- | --- |
| `gerd-tegundir` | Hvers konar aukasetning? (`gerd_tegund`) | 1–3 the three classes of Málvísir (fall-, tilvísunar-, atvikssetning); 4–5 seven kinds by name; 6–7 also tilgangs- and afleiðingarsetning, and clauses with a clause inside | 236 / 324 / 507 | `aukasetningar` |
| `setn-lidir` | Hvers konar liður? (`setn_lidir`) | 1–2 nafnliður, sagnliður, forsetningarliður in short sentences; 3–4 atviksliður too, a pronoun alone, and the nafnliður inside a forsetningarliður; 5–7 the same in sentences of level 4 and up | about 650 / 920 / 780 | `lidir` |
| `setn-lidir` | Finndu forsetningarliðinn (`lid_finna`) | 1–3 one phrase, sentences up to level 4; 4–7 two phrases, or a long sentence | 166 / 188 | `lidir` |
| `mb-raeda` | Bein og óbein ræða (`raeda`) | 1–3 the quote is in the present tense, after *sagði* and after *segir*; 4–7 the quote is in the past tense (*hefði farið*, *hafi farið*) | 196 / about 430 | `raeda` |

### Where the answers come from

Nothing in these four types is decided in the browser. The kind of a clause
and the extent of a phrase are written on the sentence by the build
(`pipeline/phrases.py`: `cl` and `ph` in `data/sentences.json`), and only where two things
that do not depend on each other agree: the parser's own node over exactly
those words, and a closed table of what such a clause or phrase looks like.
`tools/try-sentences.py` prints both for a candidate sentence. The indirect
speech is the rewrite Umritun already had (`transformIndirect`), with every
form taken from BÍN.

### What is left out on purpose, and why

Each of these is a place where school grammars differ, or where the parse is
not reliable enough to hang a right-or-wrong answer on. None is ever asked.

*Kinds of clause*

- ***þar sem***: cause (*þar sem snjórinn var mikill*) or place (*svæði þar
  sem engir vegir eru*). The parser calls both a cause.
- ***því að***, ***enda***, ***úr því að***, ***fyrst***, ***síðan***: each has
  a second reading, as an adverb or as a conjunction between main clauses.
- ***svo*** without ***að***, and ***svo að*** where the verb does not show its
  mood (*heyrði*, *gleymdi*): purpose and result differ only in the mood, so
  a verb whose indicative and subjunctive look alike decides nothing.
- ***að*** after *því*, *þess*, *það* other than *af því að*, *vegna þess að*
  and *til þess að* (*trúði því að …*), and *svo … að* (*svo löng að fáir
  náðu að klára hana*): books name these differently.
- ***til þess að*** after a word that takes *til* (*hlakka til þess að …*).
- **Samanburðarsetningar** (*en*, *eins og*): nearly all in the bank are
  phrases without a verb (*stærri en hinn*). The page names them and says
  they are not asked.
- *þegar* after a noun of time or after *muna* (*deginum þegar við fluttum*).
- Any clause whose end the parse leaves open: a clause followed by another
  clause that may belong inside it.

*Phrases*

- **The wide sagnliður.** Málvísir defines the sagnliður as "sögn ásamt
  andlagi eða fyllilið" and gives no example with an adverbial in it. So only
  the verb with its objects or predicative, to the end of a one-clause
  sentence, is asked (*Stelpan [las bókina]*, *Húsið [er stórt]*): 92 of them.
  The build records another 390 that run on through an adverbial (*[sá gamla
  hesta á vellinum í morgun]*); they are in the data and are not asked.
- **Lýsingarliður** and **tengiliður**: the first is not in Málvísir, the
  second is one conjunction and teaches nothing.
- A preposition with an adverb before it (*út í garð*, *úti á túni*), a time
  expression the parser gives as one word (*í gær*, *á morgun*), and a phrase
  with a clause or another phrase inside it: whether these are one phrase,
  and of which kind, is where the books differ.
- A noun phrase used as an adverbial (*alla nóttina*): a nafnliður by form, an
  atviksliður by function.
- The adverbs *ekki*, the question words and the particles of verbs (*stóð
  upp*, *hélt áfram*) as atviksliðir.
- In "Finndu forsetningarliðinn": every sentence in which some preposition
  does not open a phrase the build vouches for, since that preposition would
  be a second candidate.

*Indirect speech*

- Quotes with *þú*, *við*, *minn*, *hér*, *þetta* or a word of time (*í gær*
  would become *daginn áður*): what they turn into is not settled by the
  sentence. Only *ég* as the subject is changed.
- Questions and commands (*spurði hvort …*, *bað mig að …*): the page shows
  two examples and says that only statements are practised.
- A past-tense quote with something that would have to stand between *hefði*
  and the supine (*fór ekki* → *hefði ekki farið*), or with a supine already
  (*hafði lesið*).
- The other direction (indirect to direct): the answer would need quotation
  marks, which the keyboard helper does not have.

### What was not built

- **Orðhlutar and compounds** (`or-ordhlutar`). BÍN gives the forms of a word
  and not its parts, so every split (*skóla-taska*, *bóka-búð*) would have to
  be typed by hand, and the questions the textbooks ask (what is the stem,
  is this a stofnsamsetning or an eignarfallssamsetning) have answers on which
  the books differ for common words: the stem of *skóli* is *skól-* in one
  and *skóla* in another. It needs a hand-checked word list from a teacher
  before it needs code. `or_myndun` already asks prefixes and suffixes.
- **Spelling and punctuation** (the four `st-` nodes). Not a question of
  code first: spelling has no category in the app, and adding a thirteenth
  category changes the presets, the skill map and every saved policy. Decision
  3 below is still open. When it is taken, *n eða nn* in the article and in
  adjectives (*hesturinn*, *bókin*; *fyndinn*, *fyndin*) can be generated
  from BÍN with certainty and is the place to start; the diagnosis already
  has the patterns `n_nn` and `y_i` from the error hunt. No comma rule
  was found that could be drilled as right or wrong: as far as could be
  told without reading the official ritreglur, a comma before a subordinate
  clause is mostly left out or optional in current usage. A teacher should
  say which punctuation rules are worth a question.
- **Sound changes, register, idioms, kinds of adverb**: not attempted.

### For a native reader

- The three pages in `src/js/content/lessons.js` (`lidir`, `aukasetningar`,
  `raeda`), every sentence. In particular: *Við förum heim þá* as the test
  for an atvikssetning; *þar sem* listed among the orsakartengingar; the
  warning that *þótt* takes the subjunctive; the two indirect questions on
  the *raeda* page.
- The 91 sentences added to the bank (`content/setningar/setningar.tsv`) for the clause kinds (the block
  "KINDS OF SUBORDINATE CLAUSE"). They are short on purpose. Whether each
  *svo að* sentence reads as purpose or result to a native ear, as its mood
  says: *Pabbi hélt á mér svo að ég sæi yfir girðinguna* (purpose), *Það
  snjóaði mikið í nótt svo að jörðin er hvít* (result).
- The rule the app now teaches for a past-tense quote: *„Ég fór heim.“* →
  *að hún hefði farið heim* after *sagði*, *hafi farið* after *segir*.
- The explanations under the answers (`SUB_KINDS` in
  `src/js/tasks/setningagerd.js`, `phraseWhy` in
  `src/js/tasks/setningafraedi.js`) and the five new rules in
  `src/js/core/diagnosis.js` (`aukasetn_tegund`, `svo_ad`, `lidir`,
  `lidir_fl`, `obein_raeda`).
- Idioms asked as phrases: *kemur [í ljós]* is offered as a
  forsetningarliður, *skiptir [mestu máli]* as part of a sagnliður.

## The three presets (generated table)

*8., 9.* and *10. bekkur* in the policy editor, for the teacher's ceiling and
for the pupil's own settings alike. A preset is not written anywhere: it is
computed from the nodes. A year covers every node of that year and of the
years below that has questions; the categories and question types of those
nodes are switched on and everything else off.

<!-- curriculum:presets:start -->
| Preset | Categories on | Question types on | Levels | What it adds |
| --- | --- | --- | --- | --- |
| 8. bekkur | 12 of 14 | 45 of 63 | 1–5 | Nafnorð, Lýsingarorð, Fornöfn og greinir, Töluorð, Sagnorð, Óbeygjanleg orð, Orðflokkagreining, Fallstjórn, Orðaforði, Námsorð, Málbeiting, Lesskilningur |
| 9. bekkur | 12 of 14 | 52 of 63 | 1–6 | no new category; types `fn_aftur`, `so_bodhattur`, `so_mynd`, `so_beyging`, `ob_fsao`, `ob_st`, `fs_operson` |
| 10. bekkur | 14 of 14 | 63 of 63 | 1–7 | Setningafræði, Setningagerðir; types `raeda`, `syntax`, `setn_hlut`, `setn_flokka`, `hver_gerdi`, `setn_lidir`, `lid_finna`, `clause`, `gerd_finna`, `gerd_upphaf`, `gerd_tegund` |
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
  óbein ræða, longer noun phrases (`pipeline/sentences.py` says what earns a level).
  So the year-9 and year-10 presets now give harder sentences in the cloze,
  the analysis and Setningagerðir as the pupil's difficulty rises. They are
  the same question types asked about harder sentences. Of the constructions
  themselves, óbein ræða and the kinds of subordinate clause have question
  types of their own since item 28; the þolmynd (`so-tholmynd`) is still in
  the backlog above.
  A pupil on no preset has every level switched on, 6 and 7 included.
- **Year 9 adds only four question types.** That is an honest picture of the
  app: it was built for year 8, and most year-9 material is in the backlog
  above. Year 10 adds ten: the six on setningarhlutar and setningagerðir, and
  the four of item 28.
- **A new pupil is not on a preset.** A fresh account has the year-8
  categories with every question type on, as before; the editor then says
  that no year is chosen. Items 50 and 84 decide what a new pupil starts on.
- **The switches stay.** A preset is a starting point. Change one switch and
  the editor says that no year is chosen.

## The skill map (item 83)

Under *Merki og framvinda → Framvinda* the pupil sees this map: one ring per
node in the table above, on a trail per category, in the order of the years.
A node without question types is drawn as a padlock. The arithmetic is
`src/js/core/skillmap.js` (pure; the server runs the same code for a teacher),
the drawing `src/js/ui/skillmap.js`.

A ring says three things, and `standingOfNode(node, S, now)` is where they
come from:

| On the ring | What it is | Read from |
|---|---|---|
| How full it is (a quarter per step; *Of fá svör* is a dashed, empty ring) | The mastery mark of item 44, of **exactly the node's question types**: accuracy on recent answers at the pupil's level, and reviews kept | `S.byType` (`core/mastery.js masteryOfTypes`) |
| "í gær", "fyrir 3 vikum" | When a question of the node was last answered | the latest `at` of the node's types |
| A yellow disc: a number, or "!" | Reviews of the node due today (the number), or one of its error patterns "algengt núna" (!) | `S.review` (item 18), `S.diag` |

Three things about the data are worth knowing before changing a node.

**Nodes that share their question types.** Persóna og tala, Nútíð og þátíð,
Viðtengingarháttur and Miðmynd are all asked by `verb`, `verbslot` and
`tbl_so`; what tells them apart is the feature asked (`attrs`). So a node with
`attrs` keeps one small record of its own, `S.byNode[id] = { n, c, h, at }`
(the shape of a type's record), written on the one path every answer takes
when the cell asked carries the node's features. It is the only thing the map
added to the saved state. These nodes say *Of fá svör* until the pupil has
answered such a question after v6.13; a node **without** `attrs` among shared
types (Persóna og tala) reads the types whole. Give a new node `attrs` when a
type of its own does not exist and a feature singles it out; the record then
appears by itself.

**Error patterns sit on one node each** (`NODE_PATTERNS` in
`core/skillmap.js`), and a test insists that every pattern is on exactly one
node or in `LOOSE_PATTERNS`, and that a pattern shares a question type with
its node — so that the node's own button practises what its yellow disc is
about. A new pattern must be filed there or the tests fail. The loose ones
(accents, spelling slips, a wrong ending, a vowel change) belong to every
written form and are listed under the map, with *Ógreint*.

**The node's button** starts ten questions of exactly the node's `types`
(narrowed to its `attrs`), opening with the node's own reviews that are due.
The pupil's own switches give way to it, as for "Æfa þetta" on a Lesefni page;
the administrator's ceiling does not, and a node it leaves nothing of says so
in place of the button.

The map replaced four panels of Framvinda. *Styrkleikar eftir efni* is the
head of each trail (stig, rank, XP, accuracy, the category's mastery mark);
*Villumynstur* is inside the nodes and, for the loose patterns, under the map;
*Hvar liggja mistökin* is the table inside *Föllin fjögur*; *Orð sem þarf að
æfa* are the words waiting for review inside each node (Orðasafn keeps its
*Orð í hættu*).

A teacher opens the same map for one pupil of their group from Skólastofan
(`GET /teacher/skillmap`). That copy leaves out when anything was practised
and which words were missed; `docs/PRIVACY.md` §1a says why.

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
- The node names in `src/js/core/curriculum.js` (the *Efni* column). They are
  what pupils read on the skill map (item 83).
- **Setningarhlutar.** The Lesefni page on frumlag, umsögn, andlag and
  sagnfylling was titled *Setningarliðir*. Málvísir uses *setningarliðir* for
  nafnliður, sagnliður, forsetningarliður, atviksliður and tengiliður, and
  treats frumlag, andlag, sagnfylling and umsögn as roles; one school plan
  calls them *setningarhlutar*. Phrases have a page of their own
  (*Nafnliður, sagnliður og forsetningarliður*, `lidir`), so since the v6.13
  review (S12) the roles page is *Setningarhlutar* (`setningarhlutar`; the
  old id still opens it and a pupil's read mark moves with it). The
  diagnosis pattern keeps its internal id `setningalidir`. A teacher may
  still check that *setningarhlutar* is the school's word.
- Whether *fallsetningar, tilvísunarsetningar* and *atvikssetningar* (Málvísir)
  or *skýringar-, tilvísunar-, tíðar-, skilyrðis-* and *orsakarsetningar* (the
  critique) is the division your school's book uses for `gerd-tegundir`. The
  question asks both: the three classes up to þyngd 3, the kinds by name
  from þyngd 4.
- Everything under "For a native reader" in "What item 28 built".

## Keeping this up to date

- A node is one entry in `NODES` in `src/js/core/curriculum.js`. After any
  change run `node tools/curriculum-doc.mjs` and commit the document with it.
- Node ids are permanent: saved progress is keyed by them (`S.byNode`, item 83). Add
  and retire; never rename. A test pins the list.
- When a question type is added for a backlog node, put its id in the node's
  `types`, set `cover`, and remove `item`. The tests then insist that the type
  and the page exist, and the node unlocks on the skill map.
- `tests/curriculum-map.test.js` checks that every question type and every
  Lesefni page is on some node, so new material cannot be added off the map.
