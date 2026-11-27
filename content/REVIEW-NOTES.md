# Til yfirlestrar: það sem móðurmálshafi ætti að skoða

Þessar athugasemdir skrifuðu þeir sem bjuggu efnið til, um atriði sem þeir
voru ekki vissir um. Yfirlitssíðan (`node tools/review.mjs` → `dist/review.html`)
sýnir hverja athugasemd við atriðin sem hún á við og merkir þau „þarf að
athuga“. Þannig er hægt að fara yfir allt efnið á einum stað og byrja á
þessum atriðum.

Snið hverrar athugasemdar (síðan les það, og próf gætir þess að hver
athugasemd finni atriði):

- `## Fyrirsögn`
- `Leita:` textabútar innan \` \`; athugasemdin fylgir hverju atriði sem
  inniheldur einhvern þeirra (setningu, svar, skýringu …)
- `Skrá:` heil skrá innan \` \`; athugasemdin fylgir öllum atriðum hennar
- `Úr:` hvaðan athugasemdin kemur (grein og atriði gagnrýninnar)
- svo textinn sjálfur

LÍNO-2-pör sem bíða dóms (`review/lino-rammar/<keyrsla>/yfirferd.tsv`, sjá
`tools/lino-frames/README.md`) eru ekki skráð hér. Síðan sýnir þau fremst og
merkir þau sjálf „þarf að athuga“ þar til já eða nei stendur við þau í
skránni. Sama gildir um nýjar setningar fyrir LÍNO-2-orð sem bíða dóms
(`review/lino-setningar/<keyrsla>/yfirferd.tsv`).

Athugasemdir í síðasta hlutanum, „Utan síðunnar“, eiga við texta sem er ekki
á yfirlitssíðunni (texta í viðmótinu, persónuverndartilkynninguna) og standa
þar aðeins sem listi.

**24. nóvember 2026:** eigandinn, sem er móðurmálshafi, las öll atriðin sem voru
merkt „þarf að athuga“ á yfirlitssíðunni. Athugasemdir hans eru komnar inn í
efnið (greinin `data/owner-review-1`) og hin atriðin samþykkti hann. Þess vegna
eru athugasemdirnar sem áttu við atriði á síðunni teknar út úr þessari skrá.
Nýjar athugasemdir um atriði á síðunni eru skrifaðar hér, á undan hlutanum
„Utan síðunnar“. Sá hluti hefur EKKI verið lesinn og stendur áfram.

## Merking orðs í setningu: nýjar setningar (#11)
Skrá: `content/ordafordi/merking.tsv`
Úr: feat/11-meaning-question (verk #11)

Ný spurningagerð: „Í hvaða setningu er orðið notað rétt?“ Þrjár setningar með sama
orðinu, ein rétt og tvær þar sem orðið stendur þar sem annað orð á heima.

Línur með `samhengi` í dálkinum „uppruni“ eru settar saman úr setningum sem þegar
voru í „Orð í samhengi“ og þarf ekki að lesa aftur. Línur með `ný` (48 orð af LÍNO-2)
voru skrifaðar fyrir þessa skrá og enginn móðurmálshafi hefur lesið þær. Þrennt þarf
að athuga við hverja línu:

1. Er rétta setningin eðlileg íslenska, og sýnir hún hvað orðið merkir?
2. Er hvor ranga setningin örugglega merkingarlaus, í öllum merkingum orðsins?
   Ef hægt er að lesa hana sem grín eða líkingamál á hún að fara út.
3. Er skýringin úr orðabókinni (dálkurinn „merking“) sú sem á við réttu setninguna?

## Merking orðs í setningu: sagnorð og lýsingarorð (#11)
Leita: `Hann verndaði heim eftir skóla.` `Snjórinn hvatti í sólinni.` `Barnið flokkaði vært í rúminu sínu.` `Ég staðfesti yfir girðinguna.` `Ég safnaði yfir götuna á grænu ljósi.` `Súpan var of sjaldgæf svo ég blés á hana.` `Hnífurinn var svo daglegur að hann skar ekki brauðið.`
Úr: feat/11-meaning-question (verk #11)

Í röngu setningunum við sagnorðin stendur sögnin þar sem önnur sögn á heima (*verndaði
heim* fyrir *gekk heim*), svo að setningin er líka röng að byggingu, ekki bara að
merkingu. Við lýsingarorðin er lýsingarorðið sett þar sem annað á heima (*sjaldgæf*
fyrir *heit*). Þetta eru þær línur sem höfundurinn var síst viss um að ættu heima í
spurningunni. Ef þær virka illa má eyða öllum línum með `so` og `lo`; nafnorðin standa
ein og sér.

## Fyrstu þrír textarnir í Lesskilningi
Skrá: `content/textar/saga-straeto.txt`, `content/textar/fraedi-svefn.txt`, `content/textar/saga-tyndur-hundur.txt`
Leita: `Að finna aðalatriðið í texta`, `Um hvað er sagan?`
Úr: feat/30-texts-lesskilningur (atriði 30)

Textarnir, spurningarnar og skýringarnar eru samin af gervigreind og hafa ekki
verið lesin af móðurmálshafa. Greynir greinir hverja setningu og BÍN þekkir
hvert orð, en það segir ekkert um hvort málið er eðlilegt. Þetta ætti að
skoða sérstaklega:

- *Sara kom samt of seint í fyrsta tímann*: er *í fyrsta tímann* eðlilegt hér,
  eða ætti að standa *í fyrsta tíma*?
- *Þess vegna á þreyttur nemandi erfiðara með að læra og muna*: er orðaröðin
  eðlileg, og er *eiga erfiðara með* rétt notað?
- *Birtan frá símum og tölvum hefur slæm áhrif á svefninn. Hún getur haldið
  fólki vakandi langt fram á nótt*: *Hún* vísar til *birtan*. Er það skýrt?
- *skalf af kulda*, *tók hundinn í fangið*, *fór næstum því að gráta*: eðlilegt
  mál fyrir unglinga?
- Í sögunni um hundinn vísar *Hún* í síðustu setningunni til *gömul kona*, þó
  að *Sara* standi líka framar. Það er með vilja (fornafnavísanir, atriði 33),
  en sagan á samt að vera ótvíræð fyrir lesanda.
- Röngu svörin við hverri spurningu: er eitthvert þeirra líka rétt aðalatriði
  að mati lesanda? Þá þarf að skipta því út.
- Dæmin á Lesefnissíðunni og í sýnidæminu eru önnur en textarnir þrír (svo að
  dæmi gefi ekki upp svar): sagan um Kára og nestið og textinn um hvali.
  *Þeir fæða lifandi afkvæmi og gefa þeim mjólk* — er það eðlilega orðað?
- Fræðitextinn: *Flestir unglingar þurfa að sofa í átta til tíu tíma á hverri
  nóttu* er almenn ráðlegging um svefn unglinga. Tölurnar ætti að bera saman
  við ráðleggingar embættis landlæknis.

## Sögukortið: nýjar sögur, samantektir og dæmi (Lesskilningur)
Skrá: `content/textar/saga-bolti-a-thaki.txt`, `content/textar/saga-afmaeliskakan.txt`
Leita: `Hvaða samantekt passar við söguna?`, `Lína var úti að leika sér.`, `Óli ætlaði að hjóla í skólann`, `Sögukortið: Aðstæður`, `Hverjir eru sex hlutar sögukortsins?`
Úr: feat/31-story-map (atriði 31)

Sögurnar tvær, samantektirnar (rétt og röng) við þær og söguna um hundinn,
skýringarnar, dæmin á Lesefnissíðunni og sýnidæmin eru samin af gervigreind
og hafa ekki verið lesin af móðurmálshafa. Þetta ætti að skoða sérstaklega:

- *Bjarki sparkaði of fast og boltinn fór upp á þak* og *lofaði að sparka ekki
  svona fast aftur*: eðlilegt mál?
- *Mamma Elísu átti afmæli á laugardaginn*, *En þegar hún opnaði skápinn var
  ekkert hveiti til*, *Elísa skar brunna hlutann af og setti krem yfir
  kökuna*, *Enginn sá að kakan hafði brunnið*: eðlilegt?
- Hver röng samantekt á að brjóta sögukortið á einum stað (hlutinn stendur í
  hornklofa í skránni, t.d. `[útkoma]`). Er einhver röng samantekt samt hægt
  að lesa sem rétta? Er rétta samantektin alltaf sú eina sem passar?
- *Þáttur* sem heiti á hluta lengri sögu (á ensku *episode* í MAIN): er það
  orðið sem kennarar nota, eða ætti að standa *kafli* eða *atburðarás*?
- Heiti hlutanna sex og spurningin sem hver svarar (Lesefnissíðan,
  *Sögukortið*): *Aðstæður — Hver? Hvar? Hvenær?*, *Vandi (kveikja) — Hvað
  gerist? Hvaða vandi kemur upp?*, *Markmið — Hvað vill persónan?*,
  *Tilraun — Hvað gerir persónan?*, *Útkoma — Hvernig fer?*, *Viðbrögð
  (tilfinning) — Hvernig líður persónunni á eftir?* Eru þetta heitin í
  íslensku gerð MAIN (Hrafnhildur Ragnarsdóttir 2020)? Þau voru ekki borin
  saman við hana.
- Í *Lína var úti að leika sér … Hún slapp við að blotna* er síðasta setningin
  útkoman: er það skýrt?

## Frásögn: tvær nýjar sögur, Lesefnissíðan og sýnidæmin
Skrá: `content/textar/saga-lykillinn.txt`, `content/textar/saga-snjokarlinn.txt`
Leita: `Dísa átti að passa litla bróður sinn`, `Gummi vaknaði of seint`, `Af hverju getur setning sem byrjar á`
Úr: feat/35-frasogn (atriði 35)

Sögurnar tvær (Ari og lykillinn, Katla og snjókarlinn), samantektirnar við
þær, Lesefnissíðan *Að byggja upp sögu* og sýnidæmin þrjú eru samin af
gervigreind og hafa ekki verið lesin af móðurmálshafa. Í Frásögn er sögunum
ruglað og setning tekin úr þeim, svo hver setning þarf að segja eitt skref
og röðin að sjást af efninu. Þetta ætti að skoða sérstaklega:

- *Ari kom fyrstur heim úr skólanum á föstudaginn*: segir *fyrstur* nógu
  skýrt að enginn var heima?
- *Hann var svangur og vildi komast inn*, *Ari var feginn og
  ákvað að geyma lykilinn alltaf í töskunni*: eðlilegt?
- *Katla vildi búa til stærsta snjókarlinn í götunni*, *En snjórinn var of
  þurr og hélst ekki saman*, *Þá hélst snjórinn saman og snjókarlinn varð
  næstum jafn hár og hún*: eðlilegt, og rétt um snjó?
- *Allt í einu var hann horfinn*, *Dísa bað konu á kassanum um hjálp*,
  *Þær fundu hann hjá sælgætinu* (Lesefnissíðan).
- Í *Hvaða setning vantar?* eru röngu svörin setningar úr öðrum sögum, af
  sama hluta sögukortsins ef hægt er. Setning sem byrjar á fornafni er
  aldrei notuð þannig. Getur einhver slík setning samt passað í eyðuna?

## Fræðitextar: aðalatriði, smáatriði og samantekt
Skrá: `content/textar/fraedi-lundinn.txt`, `content/textar/fraedi-joklar.txt`, `content/textar/fraedi-hreyfing.txt`
Leita: `Góð samantekt`, `Hvalir eru því spendýr en ekki fiskar.`, `Sumir fara í hvalaskoðun`, `Mörg dýr lifa í sjónum`
Úr: feat/32-subject-texts (atriði 32)

Þrír nýir fræðitextar, spurningarnar um bestu samantektina, röngu svörin og
skýringarnar, nýi kaflinn á Lesefnissíðunni og sýnidæmin eru samin af
gervigreind og hafa ekki verið lesin af móðurmálshafa. Þetta ætti að skoða
sérstaklega:

- Í hverjum texta er ein setning merkt `[annað]`: hún fjallar um sama efni en
  styður ekki aðalatriðið (*Margir ferðamenn koma til landsins til að taka
  myndir af lundum*, *Margir fara í gönguferðir á jökla með leiðsögumanni*,
  *Flestir vita að hreyfing styrkir vöðvana og hjartað*). Er það nógu skýrt að
  hún styðji ekki aðalatriðið? Sú síðasta er erfiðust: hún er um hreyfingu, en
  aðalatriðið er hugurinn.
- Hvert rangt svar við „Hvaða setning segir best …“ á að vera **eitt** af þrennu:
  of þröngt (eitt smáatriði), of vítt (á við hvaða texta sem er) eða rangt.
  Getur eitthvert þeirra líka talist góð samantekt? Er *Náttúran breytist með
  tímanum* nógu greinilega „of vítt“?
- Orðalag sem Greynir réð ekki við var einfaldað: *Jöklarnir á Íslandi hafa
  minnkað mikið síðustu hundrað ár* (frekar en *árin*), *holur í grónar
  brekkur* (frekar en *grasi grónar*), *Fólk sem hreyfir sig reglulega á oft
  auðveldara með að einbeita sér*. Er það eðlilegt?
- *Á vorin koma þeir í stórum hópum til Íslands* og *Lundar eru úti á opnu hafi
  allan veturinn*: rétt um lundann? *Lundinn er því sjófugl sem kemur aðeins í
  land til að verpa*: er *því* eðlilegt í lokasetningu?
- *Jöklarnir á Íslandi hafa minnkað mikið síðustu hundrað ár* og *Sumir litlir
  jöklar eru alveg horfnir*: staðreyndir sem ætti að bera saman við heimild
  (t.d. Veðurstofu Íslands).
- Skýringarnar sem forritið sýnir við röngu svörin (*Þetta er bara eitt
  smáatriði …*, *Þetta er of almennt …*, *Þetta segir textinn ekki …*) og
  spurningarnar *Hvar er aðalatriðið?*, *Hvað styður aðalatriðið?* og *Besta
  samantektin* (í `src/js/tasks/lesskilningur.js` og `src/js/core/catalogue.js`).

# Utan síðunnar

Texti sem er ekki á yfirlitssíðunni. Skráin er nefnd við hvert atriði.

## Heiti í námskrárkortinu
Úr: docs/39-curriculum-map (atriði 39)

Heiti hnútanna í src/js/core/curriculum.js. Orðalag aðalnámskrár barst í
gegnum samantekt og ætti að bera saman við síðuna sjálfa.

## Reglutextar villugreiningar
Úr: fix/31-diagnosis (atriði 7, 8, 31–35)

Nýju reglutextarnir í src/js/core/diagnosis.js.

## Skýringar sagnaspurninga
Úr: feat/27b-verb-types (atriði 27)

Skýringarnar í src/js/tasks/explain.js um sterkar og veikar sagnir,
kennimyndir, myndir og boðhátt; og hvort *þú beiðst* og *þú dast* séu
sanngjörn dæmi.

## Umritun
Úr: feat/29-umritun (atriði 29)

Sumar þolmyndir sem sýndar eru til að umrita eru stirðar af-þolmyndir
(*Bók er lesin af gömlu konunni*). *Hann sagði að bíllinn sé rauður* er
dæmt rangt; óbein ræða án *að* er tekin gild.

## „Sá sem selur er ___“
Úr: feat/23b-pools (atriði 23)

Orðmyndunarspurningin tekur aðeins *seljandi* gilt.

## Texti í viðmótinu
Úr: fix/1, fix/47, fix/51, feat/18, feat/21, feat/42, feat/57, fix/server-test-tabs

Strengir í src/js/ui/ og src/js/core/ (leitaðu að þeim þar):
„Haltu áfram með greininguna.“ · „Sýna hnappa með íslensku stöfunum … undir
svarreitnum“ · „Fyrir kennara og foreldra“ · „Báðar þurfa að vera réttar“ ·
„Veldu eitt svar í hvorri setningu“ · „Upprifjun tókst. Þetta kemur aftur
eftir 3 daga / 21 dag.“ · „Upprifjun lokið — þetta kanntu núna.“ · „Orðið
kemur aftur seinna í lotunni.“ · „Eða veldu efni og fjölda spurninga“ ·
„Þær teljast ekki með í lotunni“ · „Allar þrjár réttar — vel gert!“ ·
„Þetta er snúið, en það lagast með æfingu“ · „Ekki alveg — reyndu aftur“ ·
„Lestu regluna og skrifaðu svarið aftur“ · „Rétt í annarri tilraun!“ ·
„Fyrra svarið telst samt villa…“ · „Sýna svarið“ · „Þitt svar / Þín svör“ ·
„vikur í röð“ · „Svör N vikur“ · „Heimsóknir N vikur“ · „N af M dögum í
þessari viku“ · leiðbeiningin í Villuveiðum („…Finndu orðið sem er rangt,
smelltu á það og skrifaðu það rétt.“) og reglan um sögn í öðru sæti.

## Kennari, einvígi, lifandi umferð og persónuvernd
Úr: feat/17, feat/37, feat/56, feat/62, feat/64, feat/83

Texti kennarans, markmið bekkjarins, einvígi og forgjöf, lifandi umferð,
færnikortið og nýju efnisgreinarnar í persónuverndartilkynningunni.

## „Hvert á ekki heima í hópnum?“: skýringin og hóparnir
Úr: fix/review-content (rýni M2)

Skýringin er nú „*hundur*, *köttur* og *hestur*: þetta eru allt dýr. *Stóll*
er ekki dýr.“ (og „þetta er allt matur“). Störf heita þar *starfsheiti*.
Hóparnir voru lesnir og hreinsaðir (src/js/tasks/ordaford.js, `ODD_SKIP`):
heimilistæki, rúmföt og baðkar eru ekki húsgögn, skór og stígvél ekki föt,
tár, hár og roð ekki líkamshlutar, sveppur og lauf ekki plöntur, myrkur, alda
og jarðskjálfti ekki veðurfyrirbæri. Lestu listann og nokkrar spurningar; er
*kál* planta, *rjómi* matur og *kaldi* (vindur) veðurfyrirbæri í huga barns?

## Miðmynd sagna: hvaða sagnir eru spurðar í öllum persónum
Úr: fix/review-content (rýni S1)

`PERSONAL_MM` í src/js/tasks/sagnord.js telur 116 sagnir sem eru notaðar í
miðmynd um persónu (*ég sest, þú sest*, *ég kynnist*). Aðrar fá hvorki
miðmyndartöflu né miðmynd í 1. og 2. persónu. Lestu listann: vantar algengar
sagnir eða eru einhverjar þar sem *ég …st* hljómar ekki eðlilega
(*ég læst*, *ég heyrist*, *ég sést*)? Skýringarnar undir töflunum eru nýjar,
ein fyrir hverja tíð (`tableNote`): „Í nútíð fleirtölu endar 1. persóna á
*-um* …“, „Viðtengingarháttur þátíðar er myndaður af þátíð fleirtölu í
framsöguhætti: við *tókum* – þótt ég *tæki*.“, „Miðmynd endar á *-st* …“.

## Boðháttur: sagnir sem eru ekki spurðar
Úr: fix/review-content (rýni S2)

`BH_SKIP` í src/js/tasks/sagnord.js var lengdur (*kúga*, *kvelja*, *svindla*,
*heita*, *líða* …) og á þyngd 5 er aldrei farið út fyrir algengustu 60%
sagnanna. Lestu 100 boðháttarspurningar og athugaðu hvort eitthvað sé enn
óeðlilegt að skipa barni að gera.

## Hugtakaskýringar fyrir sterk og veik nafnorð og sagnir
Úr: fix/review-content (rýni S4)

Nýjar skýringar í src/js/core/glossary.js: *Sterkt nafnorð*, *Veikt nafnorð*,
*Beyging nafnorða*, *Beyging sagna*. Á spurningum og síðum um nafnorð og
sagnir vísa *sterk*, *veik* og *beyging* á þær.

## „Á morgun skiptir fjölskyldan mig miklu máli“
Úr: fix/review-content (sást við yfirferð, ekki lagað)

Umritun *Á morgun …* tekur líka setningar um ástand sem á ekki heima á
morgun. Er rétt að sleppa *Á morgun* við setningar með *skipta máli*, *vera*
o.þ.h.?

## Sameina og skipta: ábending við rétt en óvenjulegt svar
Úr: data/owner-review-1 (yfirlestur eiganda, 24.11.2026)

`src/js/tasks/malbeiting.js` (`ODD_JOINED`, `ODD_APART`). Tveir nýir textar sem
nemandinn sér þegar svarið er rétt en óvenjulegt í daglegu máli; fyrirmyndin
kemur á eftir tvípunktinum: *Rétt — en oftast er þetta sagt í þessari röð: Ég
fór í úlpu af því að það var kalt úti.* (þegar sameinaða setningin byrjar á
*af því að*) og *Rétt — en þetta hljómar eðlilegra í þessari röð: Hurðin var
opin. Ég sá það.* (þegar skýringarsetningu er skipt í öfugri röð). Eru þeir
vinsamlegir og auðskildir?

## Orðakortið: rangar skýringar og atkvæðaskipting
Úr: feat/15-ordakort (#15)

`src/js/content/wordcards.js` (hvaða ÍNO-skýringar eru rangir valkostir) og
`src/js/content/syllables.js` (samskeyti í atkvæðaskiptingu). Listarnir voru
lesnir við gerð þeirra, en ekki af móðurmálshafa. `node tools/wordcards.mjs 330`
prentar kortin. Gæti einhver röng skýring átt við orðið? Er einhver
skipting röng?

## Lesefnissíðan og reglan um aðalatriði (Lesskilningur)
Úr: feat/30-texts-lesskilningur (atriði 30)

Lesefnissíðan *Að finna aðalatriðið í texta* (src/js/content/lessons.js,
`lesskilningur`) er á yfirlitssíðunni. Þetta er það ekki: reglan
*Aðalatriði texta* í src/js/core/diagnosis.js (`adalatridi`), heiti hnútsins
*Aðalatriði texta* í src/js/core/curriculum.js, lýsing flokksins í
src/js/core/skills.js (*Að finna aðalatriðið í stuttum sögum og fræðitextum*)
og fyrirsagnirnar *Um hvað er textinn?* og *Um hvað er sagan?* í
src/js/tasks/lesskilningur.js.

## Sögukortið: textar í spurningunum sjálfum
Úr: feat/31-story-map (atriði 31)

Texti sem forritið býr til í spurningum um sögukortið
(src/js/tasks/lesskilningur.js, src/js/core/storymap.js) og er því ekki á
yfirlitssíðunni: fyrirsagnirnar *Hvar er vandinn?*, *Hvar er markmiðið?*,
*Sögukortið* og *Samantekt sögunnar*; spurningarnar *Í hvaða setningu kemur
vandinn fram?*, *Í hvaða setningu í 2. þætti kemur markmiðið fram?*, *Hér er
2. þáttur sögunnar. Á hvaða stað í sögukortinu er hver setning?*; skýringarnar
*Vandinn er það sem gerist og kemur sögunni af stað, oft eitthvað sem fer
úrskeiðis*, *Markmiðið er það sem persónan vill eða ætlar sér*, *Í sögukortinu
er þessi setning tilraun: Hvað gerir persónan?*, *Þessi setning er ekki einn af
hlutum sögukortsins*; við ranga samantekt *Þessi samantekt passar ekki við
útkomuna í sögunni* (með *aðstæðurnar, vandann, markmiðið, tilraunina,
útkomuna, viðbrögðin*) og *Í þessari samantekt gerast hlutirnir í annarri röð
en í sögunni*. Einnig reglan *Sögukortið* í src/js/core/diagnosis.js, heiti
hnútsins *Sögukort: hlutar sögu* og lýsingar spurningategundanna þriggja í
src/js/core/catalogue.js.

## Frásögn: textar í spurningunum sjálfum
Úr: feat/35-frasogn (atriði 35)

Texti sem forritið býr til í spurningum Frásagnar (src/js/tasks/frasogn.js)
og er því ekki á yfirlitssíðunni: fyrirsagnirnar *Raðaðu sögunni*, *Hvað
vantar í söguna?* og *Hvaða setning vantar?*; spurningarnar *Setningarnar eru
í rangri röð. Í hvaða röð gerist sagan? Gefðu hverri setningu sitt númer.*,
*Einn hluta sögukortsins vantar í söguna. Hvaða hluta vantar?*, *Eina setningu
vantar í söguna. Hún er markmið í sögukortinu. Hvaða setning á heima þar?*;
skýringarnar *Setningin sem vantaði er markmið: Hvað vill persónan? Allir hinir
hlutarnir eru í sögunni.*, *Rétta setningin passar við það sem kemur á undan og
á eftir: sömu persónur, sami vandi.*, *Þessi setning er úr annarri sögu. Hún
passar ekki við persónurnar og það sem gerist hér.*; merkið *Hér vantar
setningu* í eyðunni, *sagan í heild* undir svarinu og *Sagan sem þú vannst
með* í yfirliti lotunnar (src/js/ui/storyicons.js, src/js/ui/session.js).
Einnig reglan *Bygging sögu* í src/js/core/diagnosis.js, heiti flokksins
*Frásögn* og lýsing hans (*Að byggja upp sögu: röð atburða og hlutar
sögukortsins*) í src/js/core/skills.js, heiti hnútsins *Bygging sögu: röð og
hlutar* og lýsingar spurningategundanna þriggja í src/js/core/catalogue.js.
