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

Athugasemdir í síðasta hlutanum, „Utan síðunnar“, eiga við texta sem er ekki
á yfirlitssíðunni (texta í viðmótinu, persónuverndartilkynninguna) og standa
þar aðeins sem listi.

## Hreyfing eða kyrrstaða: er þágufall líka rétt?
Leita: `keyrðum inn í ___` · `hengdi myndina á ___`
Úr: data/5-exercise-fixes (atriði 6)

Æfingin tekur aðeins þolfallið gilt: *Við keyrðum inn í bæinn*, *Ég hengdi
myndina á vegginn*. Gæti þágufallið (*inn í bænum*, *á veggnum*) líka talist
rétt í þessum setningum? Ef svo er á að breyta setningunni eða taka hana út.

## „hvort“ sem rangur kostur á móti „hvort sem“
Leita: `gönguferð ___ það rignir`
Úr: data/5-exercise-fixes (atriði 25)

Í *Við förum í gönguferð ___ það rignir eða ekki* er *hvort sem* rétt og
*hvort* boðið sem rangur kostur. Er *hvort* nógu greinilega rangt þar?

## „eftir að“ sem rangur kostur
Leita: `burstaði tennurnar ___`
Úr: data/5-exercise-fixes (atriði 25)

*Ég burstaði tennurnar ___ ég fór að sofa*: rétt er *áður en*, og *eftir að*
er rangur kostur. Er *eftir að* örugglega rangt, eða bara ólíklegt?

## „enda“ og „til þess að“: ræður setningafræðin en ekki merkingin?
Leita: `svöng, ___ hafði` · `snemma ___ ná strætó`
Úr: data/5-exercise-fixes (atriði 25)

Í þessum tveimur er rétti kosturinn sá eini sem passar við orðaröðina eða
nafnháttinn sem fylgir, ekki endilega sá eini sem passar við merkinguna.
Eru skýringarnar sanngjarnar og eðlilegar?

## Villuveiðar: vandað mál eða villa?
Leita: `þori [því]` · `spáð í [það]` · `gaman [af]` · `[réð]` · `[hurðir]` · `[eitthvert] hljóð` · `[Mig] syfjar` · `[Hvor] ykkar tveggja`
Úr: feat/26-real-errors (atriði 26)

Þessi atriði í Villuveiðum eru á mörkum þess sem kalla má villu. Er rétta
myndin örugglega sú eina sem kennari myndi telja rétta, og er skýringin
sanngjörn við þann sem segir hitt?

## Villuveiðar: nýja þolmyndin
Leita: `nýja þolmyndin`
Úr: feat/26-real-errors (atriði 26)

Fimm atriði um nýju þolmyndina (*Það var skammað hana*). Eru setningarnar
eðlilegar og er rétt að kalla hina gerðina talmál sem ekki er notað í
vönduðu ritmáli?

## Þyngd 6–7: viðtengingarháttur og þolmynd í löngum setningum
Leita: `grasið sprytti` · `byggju í öðru landi` · `Ef við ynnum keppnina` · `þegar hún var lítil hefði` · `skólinn hefði ekki byrjað` · `jökul`
Úr: data/14-levels-6-7 (atriði 14)

Eru þessar myndir eðlilegar í máli nemenda í 9. og 10. bekk (*sprytti*,
*byggju*, *ynnum*), og er framsöguhátturinn inni í óbeinni ræðu (*að þegar
hún var lítil hefði …*) í lagi? Jökulsetningin var líka nefnd sérstaklega.

## Þyngd 6–7: „honum/henni hefði verið“ (ekki „sér“)
Leita: `að honum hefði verið` · `að henni hefði verið` · `ef honum hefði verið`
Úr: data/14-levels-6-7 (atriði 14)

Í óbeinni ræðu stendur hér *honum/henni* þar sem sumir myndu nota
afturbeygt fornafn (*sér*). Er það eðlilegt í þessum setningum?

## Nýir rammar í setningabankanum
Leita: `Hvað kostar bókin` · `Fjölskyldan skiptir mig miklu máli` · `komumst ekki af án` · `gerðist allt vegna` · `man ekki lengur lit` · `Ég safna steinum`
Úr: feat/13-bands-and-frames (atriði 13, 24)

Í þessar setningar er öðrum nafnorðum skipt inn (rammar). Eru þær eðlilegar,
og verða þær það líka með öðrum nafnorðum úr sama flokki?

## Lýsingarorða- og töluorðarammar
Leita: `Ég man vel eftir ___` · `Hún passaði hunda ___` · `hrósaði verkefnum ___` · `tafðist vegna`
Úr: feat/23a-pools (atriði 23)

Dæmi um það sem rammarnir búa til: *Ég man vel eftir raka teppinu*, *Hún
passaði hunda eins vinar*, *Kennarinn hrósaði verkefnum eins stráks*, og
*Ferðin tafðist vegna sumarbústaðarins* (próf sem nú hleypir þessu í gegn).
Hljóma þær eðlilega?

## „kvíða“ sem gildra
Leita: `___ {V} fyrir prófinu` · `___ {V} fyrir keppninni` · `[Hún] kvíðir`
Úr: feat/23b-pools (atriði 23)

*Kvíða* er haft sem gildra: rétt er *ég kvíði fyrir*, ekki *mig kvíðir*. Er
rétt að kenna þetta svona, þó að *mig kvíðir* sé gamalt og þekkist?

## Þrjár nýjar síður í Lesefni
Leita: `Nafnliður, sagnliður og forsetningarliður` · `Tegundir aukasetninga` · `Bein og óbein ræða`
Úr: feat/28-years-9-10 (atriði 28)

Þrjár nýjar síður fyrir 10. bekk. Sérstaklega reglan um *hefði farið* í
óbeinni ræðu. Sama grein bætti 91 setningu um tegundir aukasetninga í
setningabankann (kaflinn „KINDS OF SUBORDINATE CLAUSE“ í
content/setningar/setningar.tsv): lestu hvort hver *svo að*-setning er um
tilgang eða afleiðingu eins og hátturinn segir. Nánar í docs/CURRICULUM.md,
„What item 28 built“.

## „Setningarhlutar“: heiti síðunnar
Leita: `Setningarhlutar`
Úr: docs/39-curriculum-map, feat/28-years-9-10, fix/review-content (atriði 28, 39; rýni S12)

Síðan um frumlag, umsögn, andlag og sagnfyllingu hét *Setningarliðir* og
rakst á síðuna um nafnlið, sagnlið og forsetningarlið. Hún heitir nú
*Setningarhlutar*. Er það orðið sem skólinn notar?

## Aðalsetning og aukasetning
Leita: `Aukasetning getur ekki staðið ein`
Úr: fix/31-diagnosis (atriði 31)

Áður var bent á orðalag um aðalsetningu og „alltaf“ á þessari síðu
(lessons.js, þá um línu 1057) og í einum spurningasmiðnum. Orðið „alltaf“
finnst þar ekki lengur við aðalsetningu, en lestu málsgreinarnar um
aðalsetningu og aukasetningu.

## Sýnidæmin
Skrá: `src/js/content/examples.js`
Úr: feat/44-mastery (atriði 41)

Sýnidæmið sem birtist við fyrstu spurningu hverrar tegundar. Öll þarf að lesa:
spurninguna, svarið og leiðina að því.

## Orð í samhengi: hvaða merking orðabókarinnar
Skrá: `content/ordafordi/samhengi.tsv` · `content/ordafordi/samhengi-rammar.tsv`
Úr: fix/review-content (rýni M1)

Skýringin eftir rétt svar er nú sú merking ÍNO sem setningin á við (dálkurinn
`merking`, eða `lag=2` í römmunum), ekki fyrsta merkingin. Lestu hvort valið
passar, sérstaklega: *fiskur* sem matur („vatna- og sjávardýr“), *blóm* sem
er vökvað („(skrautlegur) hluti plöntu eða trés“), *vatn* sem synt er í
(„vökvi gerður úr …“) og *leikur* í sjónvarpinu („keppni tveggja liða“). Þar
sem engin merking ÍNO á við er engin skýring sýnd (`-`): *kort* sent ömmu,
*hjól* (reiðhjól), *diskur* í uppþvottavél, *búð*, *olía* á bílinn og
*peningum*. Er til betri merking fyrir eitthvert þeirra?

## Börn og nemendur í römmum setningabankans
Leita: `hjálpaði ég þremur strákum með heimalærdóminn` · `Allir krakkarnir fóru út í frímínútum` · `Kennarinn hjálpaði þremur nemendum` · `Gamli maðurinn sefur` · `Eldri bróðir minn er í tíunda bekk`
Úr: fix/review-content (rýni S2)

Nýr merkingarflokkur, `child` (barn, krakki, strákur, stelpa, drengur,
piltur, stúlka, telpa, unglingur, táningur, smábarn, smákrakki, smástelpa,
stráklingur, stráksi, nemandi, nemi, busi), er notaður í römmum um skóla og
lítil börn. Rammar með *gamall* taka fullorðna, og rammar með skyldmenni og
*minn* (*Eldri bróðir minn …*) halda sínu orði. Er listinn réttur, og eru
fleiri rammar sem ættu aðeins að taka börn?

## Ný setning: „Bókin fjallar um eldfjall.“
Leita: `Bókin fjallar um eldfjall`
Úr: fix/review-content (rýni S2)

Bætt við svo að þolfall eintölu án greinis af veðri, himingeimnum, peningum
og myndum eigi sér ramma eftir að *Þetta er saga um ___* var þrengt (sagan
fjallar nú um einhvern, hugmynd eða atburð). Lestu hvort *Bókin fjallar um
storm / loftstein / gjaldmiðil / sjónvarpsþátt* hljómar eðlilega.

## Dagsetningar á skóladagatalinu
Leita: `Skólinn byrjar ___ {M}` · `Frá ___ {M} er sumarfrí`
Úr: fix/review-content (rýni S2)

Skólinn byrjar nú aðeins 18.–31. ágúst eða 3.–6. janúar og sumarfríið hefst
28. maí–15. júní (dálkurinn `dagar`). Passa þau bil við skóladagatal
grunnskóla?

## Sýnidæmi umritunar, eitt fyrir hverja gerð
Leita: `Hún las bókina og fór svo að sofa` · `Strákarnir eru glaðir` · `Húsið var byggt` · `Pabbi lagaði hjólið` · `Bjargaði hún kettinum` · `Þegar ég kom heim var mamma að elda` · `Í gær fór ég í sund`
Úr: fix/review-content (rýni S3)

Níu ný sýnidæmi, eitt fyrir hverja gerð umritunar. Lestu orðalagið í *Svona:*
línunum, sérstaklega skýringuna á þolmynd („Það má bæta við *af smiðunum*“)
og á tengingu með *þegar*.

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
