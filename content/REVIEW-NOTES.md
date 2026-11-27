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
skránni.

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
