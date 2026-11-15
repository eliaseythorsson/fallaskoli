# -*- coding: utf-8 -*-
"""Semantic classes for every noun in the vocabulary.

BÍN knows how a noun inflects; it knows nothing about what a noun *means*, and
a sentence frame needs the second thing: "Ég drekk ___" wants a drink, "Við
fórum í ___" wants a place that Icelandic puts *í* rather than *á*. This table
is the one hand-built piece of knowledge in the pipeline, and it is only ever
used to *restrict* substitution — a word in the wrong class is left out of a
frame, never put into one.

CLASSES
-------
  person     a human being, incl. roles and relatives
  job        an occupation one can have or become (kennari, læknir, smiður):
             "Ég ætla að verða ___". Every `person` frame takes these too.
  group      a collective of people (fjölskylda, bekkur, lið, þjóð)
  animal     land animals and birds: what runs, sleeps, waits and is fed
  critter    insects, worms and sea creatures: seen and talked about only
  plant      trees, flowers, grass, berries
  body       parts of the body
  food       things eaten
  drink      things drunk
  clothing   things worn
  vehicle    things one travels in or on
  furniture  large household objects one puts things on or in
  object     a portable, visible thing (bók, lykill, sími, bolti)
  substance  mass nouns: materials, liquids, weather stuff (sandur, snjór, gull)
  nature     the land and the water: somewhere one can walk to or look at
             (fjall, á, sjór, fjara, hraun, foss)
  sky        the sky and what is in it (sól, tungl, stjarna, ský)
  place      an area or a spot one can be at or go to (garður, gata, völlur)
  building   a building: it stands somewhere, has a roof, one waits outside it
  room       a room inside a building (eldhús, stofa, kjallari)
  settlement a place people live in (bær, borg, þorp, land) — a place too
  money
  struct     a fixed part of a building or structure (veggur, gluggi, brú, turn)
  text       something read or told: the content (saga, frétt, ljóð, brandari)
  book       a text one can hold, lose or put on a table (bók, bréf, dagblað)
  film       something watched (mynd, bíómynd, leikrit, þáttur)
  music      something listened to (lag, tónlist, söngur)
  weather    weather and light: not an object but a condition (rigning, frost, myrkur)
  time       dagur, vika, sumar, morgunn …
  event      something that happens or is held (afmæli, veisla, próf, ferð)
  abstract   everything else — ideas, feelings, states, qualities

PREPOSITION CONVENTION (places and events only)
-----------------------------------------------
Whether a noun takes *í* or *á* is learned one noun at a time: *í skólanum* but
*á ströndinni*, *í afmæli* but *á tónleikum*. `PREP` records it for the nouns
where the convention is strong and unambiguous in the sense a child would use
("fara í/á X", "vera í/á X"). A place or event with no entry is not
substituted under *í* or *á* at all.

NO PLURAL
---------
BÍN gives every noun a plural, and for many it is a form nobody says:
*mjólkurnar*, *hamingjurnar*, *fólkin*, *veðrin*. `no_plural` marks the nouns
that are not put into a PLURAL slot of a generated sentence: every substance,
every abstract, weather, drink and music noun that is not listed in
`PLURAL_OK`, and the mass and collective nouns of the other classes listed in
`NO_PLURAL`. The paradigm is untouched; the word is simply shown in the
singular.

EXCLUDED
--------
`EXCLUDE` lists words that are in the vocabulary (it came from film subtitles)
but have no business in a generated example sentence for a thirteen-year-old.
They keep their paradigm and can still be declined in a table; they are simply
never put into a frame.
"""

def _s(text):
    return set(text.split())

PERSON = _s("""
kóngur persóna
afbrotamaður afi afkomandi afstyrmi amma andskoti andstæðingur arftaki
arkitekt asni atvinnumaður auli aumingi aðalfulltrúi aðalsmaður aðdáandi
aðili aðmíráll aðstoðarkona aðstoðarmaður bandamaður bankamaður bankaræningi
bardagamaður barn barnabarn barnapía barnfóstra barón barþjónn bassaleikari
betlari biskup bjargvættur bjálfi bjáni blaðamaður bleyða blóraböggull
blóðsuga blökkumaður bogaskytta borgarbúi borgari borgarstjóri boxari
boðflenna brjálæðingur bryti bráðaliði bréfberi bróðir brúðarmær brúðgumi
brúður busi byrjandi byssumaður bæjarbúi bæjarstjóri bílstjóri bítill bófi
bókhaldari bóndi bósi böðull dama dansari demókrati draugur draumaprins
draumóramaður drengur drjóli drottning drullusokkur drusla dræsa dvergur
dyravörður dánardómstjóri dáti dís dólgur dómari dópsali dóttir dótturdóttir
dóttursonur dúlla dýralæknir eftirherma eftirlifandi eftirlitsmaður eigandi
eiginkona eiginmaður einfari einkasonur einkaspæjari einstaklingur ekill
ekkja elskandi elskhugi embættismaður endurskoðandi engill erfingi erkibiskup
fagmaður fangelsisstjóri fangi fantur farþegi fasteignasali fatafella faðir
ferðalangur ferðamaður fiskimaður fjandi fjárfestir fjárhaldsmaður
fjárhættuspilari fjári fjölskyldumaður fjölskyldumeðlimur flakkari flugfreyja
flugmaður flugstjóri flækingur flón flóttamaður foreldri forfaðir foringi
formaður forseti forstjóri forsætisráðherra frambjóðandi framkvæmdastjóri
framleiðandi frændi frænka fræðimaður fréttamaður fuglaáhugamaður fulltrúi
fursti furðufugl fylgdarmaður fylgjandi fylkisstjóri fyllibytta fyrirliði
fyrirsæta fábjáni fáviti félagi fés fíkill fógeti fórnarlamb fóstra
föðurbróðir föðurlandsvinur fúskari gagnrýnandi galdrakarl galdramaður
gamlingi garðyrkjumaður gaur geimvera gella gengilbeina gerandi gerpi
gestgjafi gestur geðklofi geðlæknir geðsjúklingur glaumgosi glæpamaður goð
greifi greifynja grey grænmetisæta grínisti gunga guðfaðir gyðja gáfnaljós
gála gæi gísl hafmær handhafi harðjaxl harðstjóri hausaveiðari heimamaður
heimildarmaður heimskingi heimsmeistari heiðingi heiðursgestur heiðursmaður
herbergisfélagi herforingi hermaður herra herramaður hershöfðingi hertogi
hestamaður hetja hippi hjákona hjúkrunarfræðingur hjúkrunarkona hlaupari
hlustandi hluthafi hommi hryðjuverkamaður hræsnari hró hugleysingi hugsuður
hundspott hálfviti hæstráðandi höfundur höfuðsmaður höfðingi hönnuður
hörkutól húsbóndi húsmóðir húsvörður indíáni innbrotsþjófur innflytjandi
jafningi jafnoki jarl jarðarbúi jógi jólasveinn jóna kafari kappi kapteinn
karl karlmaður kaupandi kaupmaður kaupsýslumaður kauði keisari kelling
kennari keppandi keppinautur kerling kjaftaskur kjáni klappstýra klaufi
klerkur knapi kokkur kollegi kommi kommúnisti kona konungur krakki krossfari
krútt kunningi kvenmaður kvikmyndastjarna kærasta kærasti kínverji könnuður
kúnni kúreki lafði landgönguliði landstjóri launmorðingi leigjandi
leigubílstjóri leigumorðingi leikari leikkona leikmaður leikstjóri
leikstjórnandi leiðsögumaður leiðtogi lesandi lesbía leyniþjónustumaður
listamaður liðhlaupi liðsforingi liðsfélagi liðþjálfi ljósmyndari ljúfur
loddari lygalaupur lygamörður lygari lávarður læknir lærimeistari lífvörður
lögfræðingur lögg löggæslumaður lögmaður lögreglufulltrúi lögreglumaður
lögreglustjóri lögregluþjónn lúði mafíósi maki mamma manneskja mannvera
mannæta maður meistari mella melludólgur meðeigandi meðleigjandi meðlimur
milljónamæringur miðill miðlari monthani morðingi munaðarleysingi munkur
mágkona málaliði málari mær móðir nauðgari nemandi nemi neytandi njósnari
norn norðanmaður notandi nunna nágranni náungi næstráðandi nýliði ofurhetja
ofurmenni ofursti pabbi patti piltur plötusnúður predikari prestur prins
prinsessa páfi pápi pílagrímur pípari pólitíkus póstmaður púki rabbíni
raðmorðingi riddari risi ritari rithöfundur ritstjóri rokkstjarna rugludallur
rumur ráðgjafi ráðherra ráðskona ráðsmaður ræfill ræningi ræðismaður
ríkisborgari ríkisstjóri róni safnari sakborningur saksóknari samlandi
samningamaður samstarfsmaður seljandi sendiboði sendiherra sendill
sigurvegari sjeik sjálfboðaliði sjóari sjóliði sjóliðsforingi sjómaður
sjóræningi sjúklingur sjúkraliði skapari skemmtikraftur skipherra skipstjóri
skjólstæðingur skratti skræfa skrímsli skurðlæknir skvísa skytta skáld skáti
skæruliði skíthæll skítseiði skólastjóri skósmiður skúrkur slátrari
slökkviliðsmaður smiður smábarn smákrakki smástelpa snillingur soldán
sonarsonur sonur spæjari starfsfélagi starfsmaður staðgengill stelpa stjóri
stjórnandi stjórnarformaður stjórnmálamaður stjúpfaðir stjúpi stofnandi
strippari strokufangi stráklingur stráksi strákur stríðsherra stríðshetja
stríðsmaður stuðningsmaður stórlax stöðvarstjóri stúlka svaramaður sveinki
sveitalubbi svertingi svikahrappur svikari svindlari syndari systa systir
systkini sálfræðingur sálufélagi sæfari sérfræðingur sérsveitarmaður
sökudólgur sölumaður söngkona söngvari tannlæknir telpa tengdafaðir
tengdasonur tengiliður tittur tröll trúður tvíburabróðir tvíburi táningur
tæknimaður tónlistarmaður töfralæknir töframaður túlkur túristi tútta
umbjóðandi umboðsmaður umrenningur umsjónarmaður undirforingi undirmaður
unglingur unnusta unnusti uppljóstrari uppreisnarmaður uppvakningur
varaforseti varamaður varðmaður varðstjóri varúlfur veitandi veiðimaður
verjandi verkamaður verkfræðingur verktaki verndari vesalingur veslingur
veðmangari villimaður vina vinkona vinnufélagi vinnukona vinnuveitandi vinur
vitfirringur vitleysingur vitni vitorðsmaður viðrini viðskiptafélagi
viðskiptavinur viðvaningur vofa vottur vændiskona vélmenni vélstjóri víkingur
vísindamaður vörður yfirmaður áhangandi áheyrandi áhorfandi áhugamaður
álfkona álfur árásarmaður áskrifandi ástkona ástvinur ættingi íbúi
íþróttamaður ódámur ófreskja óvinur óþokki öfgamaður ökumaður ökuþór öldungur
öryggisvörður öskubuska úrþvætti útgefandi útlagi útlendingur útsendari þegn
þerna þingmaður þjálfari þjófur þjónn þjónustustúlka þorpari þorpsbúi þrjótur
þræll þátttakandi
""")

# Occupations. A subset of the people above: listed there too, and this class
# wins (see _TABLE below), so "Pabbi minn er ___" offers *kennari* and never
# *krakki* or *afi*.
JOB = _s("""
arkitekt bankamaður blaðamaður bréfberi bílstjóri bóndi dansari dómari
dýralæknir flugfreyja flugmaður flugstjóri forstjóri fréttamaður
garðyrkjumaður hjúkrunarfræðingur hönnuður kafari kennari kokkur
leigubílstjóri leikari leikkona leikstjóri listamaður ljósmyndari læknir
lögfræðingur lögreglumaður lögregluþjónn málari pípari prestur ritari
rithöfundur ritstjóri sálfræðingur sjómaður skipstjóri skólastjóri
slökkviliðsmaður smiður söngkona söngvari tannlæknir tæknimaður
tónlistarmaður verkfræðingur vísindamaður þjálfari þjónn
""")

GROUP = _s("""
almenningur andspyrnuhreyfing bandalag björgunarlið bræðralag deild draumalið
fjölskylda flokkur floti flugher frændfólk fylgdarlið fylking félag fólk
fótboltalið fótgöngulið her herafli herdeild herflokkur herforingjaráð
herfylki herlið hersveit hirð hjörð hljómsveit hópur klíka kvartett kvenfólk
kviðdómur kynslóð kór landgöngulið leynilögregla lið liðsauki lögregla mafía
mannfjöldi mannfólk mannkyn mannskapur múgur nefnd riddaralið ráðuneyti
ríkislögregla ríkisstjórn samfélag samsteypa sjóher slökkvilið starfsfólk
starfslið stjórn strandgæsla stórskotalið sérsveit söfnuður teymi varalið
áhöfn ætt ættbálkur öryggissveit þjónustufólk þjóð þjóðfélag
""")

ANIMAL = _s("""
apaköttur api bambi belja björn dreki dádýr dúfa dýr einhyrningur
elgur eðla foli froskur fugl fálki fíll geit
grís gæludýr gæs gíraffi górilla hamstur hani haukur
hestur hjörtur hlébarði hrafn hreindýr hreinn hross hundur
hvolpur hvutti hvítingi hæna héri jarfi jór kalkúni
kettlingur kind kisa kisi kisulóra kjúklingur klár
kráka kvikindi kálfur köttur kýr lamb leðurblaka
ljón lukkudýr meri moldvarpa mörgæs mörður múlasni
múldýr mús naggrís naut nautgripur naðra prímati páfagaukur
rakki refur risaeðla rostungur rotta rándýr sauður selur
skarfur skepna skjaldbaka skolli skröltormur sléttuúlfur smáhestur
snákur svanur svín turtildúfa tígrisdýr tígur tík
ugla ungi valur vampíra vísundur íkorni ísbjörn önd örn úlfaldi úlfur
þvottabjörn
""")

# Small creatures and the ones that live in the sea (v6.5). They are animals,
# and nothing an animal does in the sentence bank suits them: "Fiðrildi biðu
# úti", "Höfrungurinn faldi sig undir stólnum", "Hópur laxa stóð á túninu",
# "Ég gaf maurnum vatn". They are seen, drawn, talked about and feared — the
# frames that take anything visible — and stand in no sentence where an
# animal runs, waits, sleeps on the sofa or is given water.
CRITTER = _s("""
býfluga fiðrildi fluga fló geitungur krybba kónguló könguló lirfa lús marglytta maur maðkur ormur padda snigill sníkjudýr fiskur gullfiskur hákarl hvalur höfrungur humar kolkrabbi krabbi lax ostra rækja silungur skelfiskur túnfiskur
""")

PLANT = _s("""
barr blóm eik fjóla fræ fura gras grasker greni jurt jólatré kjarr korn kál
lauf lilja planta pálmatré runni rós rót sproti sveppur tré þörungur
""")

BODY = _s("""
afturendi andlit armur auga augabrún bak bakhluti bein bossi bringa brjóst
bumba böllur búkur eista enni eyra fingrafar fingur fótleggur fótur geirvarta
goggur gómur haka hali handleggur hauskúpa heili hjarta hnakki hnefi hné
hnéskel hnúi hold hryggur háls hár hæll höfuð höfuðkúpa hönd húð jaxl kinn
kjaftur kjálki kló kok kroppur kviður kynfæri leggur lifur limur loppa lunga
líffæri líkami lófi löpp magi milta mitti mjöðm munnur munnvatn nef nögl nös
nýra olnbogi pungur putti píka rass rassgat rif rifbein roð rófa sin
skalli skaufi skegg skinn skrokkur snípur sporður stél sviti sæði tagl taug
tittlingur tunga typpi tár tönn uggi vangi vængur vígtönn vör vöðvi
yfirvaraskegg ökkli öxl úlnliður þumalfingur þumall
vömb kálfi
""")

FOOD = _s("""
appelsína banani baun ber brauð eftirréttur eggjakaka epli ferskja
formkaka grænmeti gulrót hneta hnetusmjör hrísgrjón hunang
hádegismatur hádegisverður kaka kex kexkaka kjöt kjöthleifur kleinuhringur
kvöldmatur kvöldverður kássa kókoshneta laukur matur morgunkorn
morgunmatur morgunverður máltíð nesti ostborgari ostur pylsa pönnukaka
rjómi rúnstykki samloka slátur smjör smákaka sneið steik sulta
sykurpúði sælgæti súpa tómatsósa vaffla ávöxtur ólífa
pera
""")

DRINK = _s("""
appelsínusafi bjór drykkur gosdrykkur kaffi kakó kampavín mjólk mjöður
rauðvín safi vatn vodka vodki vín
""")

CLOTHING = _s("""
blússa bolur brjóstahaldari brók brúðarkjóll búningur einkennisbúningur
fatnaður flík frakki jakki kjóll kápa lífstykki peysa pils skikkja skyrta
skór sloppur sokkur stígvél treyja vesti yfirhöfn úlpa
""")

VEHICLE = _s("""
bifreið björgunarbátur blæjubíll bátur bíll dráttarbíll eldflaug farartæki
ferja flaug fleki flugvél geimfar geimflaug geimskip hestvagn hjól hjólhýsi
hraðlest húsbíll jeppi kafbátur kerra leigubíll lest loftfar lögreglubíll
mótorhjól neðanjarðarlest rúta sendibíll sendiferðabíll sjúkrabíll skip
skriðdreki sleði snekkja strætisvagn strætó vagn vélhjól vörubíll ökutæki
þota þyrla
""")

FURNITURE = _s("""
baðkar baðker bekkur borð dýna eldavél eldhúsborð fataskápur frystir hilla
kista koddi koja motta náttborð ofn rúm skrifborð skápur spegill stóll sæng
sæti sófi teppi vagga ísskápur örbylgjuofn þvottavél
þurrkari
""")

OBJECT = _s("""
hljóðfæri útvarp hreiður steinn aur króna peningur pund skildingur smáaur smápeningur
afmælisgjöf afrit aftursæti agn akkeri alur app armband askja askur aspirín
baggi bakki bakpoki bali band bangsi bassi baukur beisli beita belti
bensíngjöf bikar bindi bjalla björgunarvesti blað blaðra bleia blek bleyja
blys blýantur bogi bolla bolli bolti bomba bor borði box bremsa bretti
brimbretti brynja brúsi byssa byssukúla bíllykill bóluefni búr dagatal dekk
demantur diskur djásn dyrabjalla dæla dós dót dúkka dúkur dýrgripur
eftirlíking eftirmynd eiginhandaráritun eintak eiturlyf eldspýta ermi
eyrnalokkur fallbyssa fallhlíf farmiði farsími fartölva farði fat fata feldur
ferðataska filma fiðla fjarstýring fjársjóður fjöður flagg flak flaska flauta
flugeldur flugmiði flugskeyti flís framsæti frumgerð frímerki fuglahræða
fáni gaffall geisladiskur gemsi gereyðingarvopn gervihnöttur
getnaðarvörn geymir gifs giftingarhringur gildra gimsteinn gjöf glas glerbrot
gluggatjald greiðslukort grill gripur græja gríma gálgi gámur gæra gír
gírkassi gítar haglabyssa hamar handklæði handsprengja handtaska hanskahólf
hanski harpa hattur hemill hermir hetta heyrnartól hjálmur hjólaskauti
hjólastóll hlekkur hljóðnemi hlíf hnakkur hnappur hnífur hnútur hreyfill
hringur hylki hálsfesti hálsmen hárkolla hátalari hækja hólf hönk höttur húfa
húsgagn húðflúr ilmvatn innsigli jarðsprengja jólagjöf kaffibolli kaggi kanna
kapall kar karfa kassetta kassi kastari kaðall keila ker kerti keðja
kjarnorkusprengja kjarnorkuvopn kjölur klemma klukka klútur kort kragi krani
kreditkort krem kringla kristall krukka krókur krúna kubbur kuti kveikjari
kylfa kyndill kíkir kóróna kúbein kúla kústur kútur lak lampi leikfang
leynivopn linsa listaverk ljár ljós ljósmynd ljósrit loftnet lyf lykill
lykkja lás læsing líkan líkkista límband límmiði lína lóð lúður meistaraverk
men merki minjagripur miði myndavél mynt málverk mælir móðurtölva nafnspjald
naglalakk nagli net nisti nál nærmynd pakki panna peli peningaskápur penni
perla pilla pinni piparúði planki plata poki pottur prik prjónn pípa
póstkassi póstur púði púður rafall rafhlaða raftæki rammi ratsjá regnhlíf
reikningur rennilás riffill rimill ritvél rofi rokkur ryksuga röntgenmynd rör
rýtingur saumur segl segulband segull sekkur sending servíetta seðill sigti
sjampó sjálfsali sjónauki sjónvarp sjúkrakassi skammbyssa skartgripur skauti
skel skilti skiptiborð skjal skjalataska skjaldarmerki skjár skjöldur
skotfæri skothylki skotvopn skraut skreyting skrá skrúfa skynjari skál
skírteini skófla skúffa slaufa smokkur snara snúra spaði spiladós spjald
spjót spotti sprauta sprengiefni sprengja spóla spöng spýta stafur staup
stika stimpill stjórnborð strengur strokkur stubbur stundaglas stykki stytta
stöng stýri svampur svefntafla sverð svipa sviðsljós sápa sætisbelti sía
sígaretta sími símsvari sírena sópur sög sönnunargagn sýnishorn tafla takki
talstöð tankur tannbursti tappi taska taumur teikning teinn teningur teygja
tjald trefill tundurskeyti tunna tuska tálbeita tæki tímavél tól tökuvél
tölva tölvuleikur umbúð umslag undirfat undirskrift uppdráttur upptökutæki upptökuvél
varahlutur varalitur vasaklútur vasaljós vasi vatnsglas vegabréf verkfæri
verkjalyf verkjatafla veski vifta vigt vindill viðvörunarkerfi vopn vél
vélbyssa vír vöndur áritun áttaviti ávísun ökuskírteini öngull örk
öryggisbelti öryggishólf öryggiskerfi öryggismyndavél öxi öxull útbúnaður
þilja þráður þríforkur þurrka
slanga snælda brúða lokkur bútur belgur farangur sendir
spil tafl
""")

STRUCT = _s("""
altari arinn brú girðing gluggi gosbrunnur gátt handfang handrið hleri hurð
hvelfing hásæti klósett kross legsteinn loka lyfta lúga minnisvarði múr
pallur róla rússíbani rúða skráargat skúr staur stigi sturta stólpi súla turn
vaskur veggur viti þak
brunastigi trappa
""")

SUBSTANCE = _s("""
reykur neisti logi glóð eldur bál aska bensín blásýra blóð drasl drulla duft efni eitur eiturefni eldiviður
froða gas gler grjót hass hland hor hveiti jarðvegur klaki kol kúkur leðja
leður loft mold málmur málning múrsteinn olía pappír piss plast rafmagn reyfi
rusl ryk sag sandur skítur slím sorp steypa stál svell sýra tau tóbak vax
viður úrgangur
vökvi
fita krydd pipar sykur vanilla vítamín fæða matvara
""")

NATURE = _s("""
alheimur auðn brekka dalur eldfjall eyðimörk fen fjall fjara
fljót flói foss frumskógur gil gljúfur haf halastjarna
himinn hlíð hnöttur hraun hæð hóll jökull klettur lind
loftsteinn lækur lón máni mýri pláneta pollur sjóndeildarhringur sjór ský slétta smástirni stjarna
svarthol sól sólkerfi tindur tjörn tungl uppspretta vetrarbraut árbakki
óbyggð
gjá
""")

WEATHER = _s("""
skuggi skin geisli alda andvari birta blær brim bylgja dagsljós dögun elding fellibylur flóð
flóðbylgja frost fárviðri garri gola gufa hitastig hiti hlýja hríð
hvirfilbylur jarðskjálfti kaldi kuldi loftslag myrkur regn regnbogi rigning
rok skýstrókur snjór stormur sólarlag sólarljós sólarupprás sólsetur sólskin
tunglskin veður vindur ylur óveður þoka þruma þrumuveður
""")

PLACE = _s("""
akur athvarf austurströnd bakgarður bar borg braut brautarpallur brunnur
bryggja bás bækistöð bær bílastæði búgarður býli dansgólf dvalarstaður
dýragarður eyja felustaður flugbraut flugvöllur flöt fundarstaður fylki
föðurland gangstétt garður gata geimur gettó grafreitur grasflöt grennd grund
gröf gullnáma gólf heimabær heimaland heimsveldi heimur hellir helvíti herbúð
herstöð hestbak himnaríki hlið hljóðver hola horn hraðbraut hverfi hvíla
hérað hólmur höfn höfuðborg höfuðstöð höfði húsasund inngangur
innkeyrsla járnbraut kirkjugarður klúbbur konungsríki kró kví lager land
landareign laug leikvangur leikvöllur lýðveldi markaður meginland melur
miðborg miðbær miðstöð myndver mótsstaður norðurpóll nágrenni náma nýlenda
paradís plantekra port ríki rúst setur sirkus skemmtigarður skotgröf skotlína
skurður skutur skógur smábær stafn staður stjórnstöð stræti strönd
stæði stígur stórborg stöð stúka sundlaug sveit svæði svínastía síki sýsla
torg tökustaður tún umdæmi undankomuleið undirheimur verndarsvæði veröld
verönd vesturland vinnustaður vitnastúka víglína vígvöllur víti völlur
áfangastaður ákvörðunarstaður ættjörð útgangur útgönguleið úthverfi útland
þilfar þjóðgarður þjóðvegur þorp
""")

BUILDING = _s("""
apótek bakarí banki bensínstöð bygging byrgi bílageymsla bílskúr bíó bókabúð
bókasafn bústaður búð elliheimili fangelsi fasteign flugskýli framhaldsskóli
félagsmiðstöð gagnfræðaskóli gallerí geðsjúkrahús gistiheimili gistihús
grafhýsi grunnskóli heimavist heimili herskóli hesthús hlaða hof háskóli hæli
hótel höll hús kaffihús kapella kastali kirkja klaustur kofi krá kvikmyndahús
leikhús lestarstöð listasafn listaskóli líkhús lögreglustöð matsölustaður
menntaskóli miðskóli munaðarleysingjahæli musteri mótel næturklúbbur orkuver
pósthús rannsóknarstöð ráðhús sendiráð sjúkrahús skáli skóli skýli snjóhús
spilavíti spítali sumarbústaður sumarhús sumarskóli veitingahús
veitingastaður verksmiðja verkstæði verslun verslunarmiðstöð virki vopnabúr
vörugeymsla þinghús þvottahús
""")

ROOM = _s("""
anddyri aðalsalur bakherbergi barnaherbergi bað baðherbergi biðstofa
borðstofa búningsherbergi búningsklefi dýflissa eldhús fangaklefi
fundarherbergi gangur gestaherbergi geymsla herbergi háaloft hótelherbergi
kaffistofa kamar kjallari klefi káeta læknastofa matsalur mötuneyti
rannsóknarstofa rannsóknastofa réttarsalur salerni salur setustofa
sjúkrastofa skrifstofa skurðstofa stofa svefnherbergi svíta vinnustofa
vistarvera vélarrúm íbúð þakíbúð
""")

# Sums and funds. A coin or a note is an object and is listed there.
MONEY = _s("""
fjármagn fúlga gjaldmiðill milljarður milljón reiðufé sjóður verðlaunafé
""")

TEXT = _s("""
auglýsing blaðsíða blogg brandari erfðaskrá ferilskrá formúla forsíða frétt
fyrirlestur goðsögn grein gáta heimasíða jafna kafli kveðja listi ljóð orð
orðatiltæki rit ritgerð ráðgáta ræða rím saga setning skýrsla slagorð
spádómur stjórnarskrá síða sögn sögusögn texti tilkynning tilvitnun
tölvupóstur umsókn uppskrift vefsíða vers viðtal véfrétt
yfirlýsing ástarkveðja þjóðsaga
verkefni
fyrirsögn dálkur
""")

BOOK = _s("""
biblía boðskort bréf bæklingur bók dagblað dagbók eyðublað handbók handrit
kvittun matseðill minnisblað minnisbók skeyti skáldsaga símaskrá
teiknimyndasaga tímarit tölublað árbók ástarsaga ævisaga
""")

FILM = _s("""
ballett bíómynd hryllingsmynd kvikmynd leikrit mynd myndband sjónvarpsþáttur
söngleikur teiknimynd útsending þáttur
""")

MUSIC = _s("""
hljómur lag nóta söngur tónlist tónn óður """)

TIME = _s("""
afmælisdagur andartak augnablik dagur eftirmiðdagur frídagur frítími
föstudagskvöld gærdagur gærkvöld haust helgi hádegi hádegishlé hálftími
háttatími klukkustund klukkutími kvöld laugardagskvöld leiktíð lokaár
matartími miðnætti morgundagur morgunn mánuður mínúta nótt pása sekúnda
skóladagur stund sumar sunnudagskvöld síðdegi sólarhringur tímabil tími vetur
vika vinnudagur vinnutími vor áratugur árstíð æska öld önn þjóðhátíðardagur
""")

EVENT = _s("""
afmæli afmælisveisla athöfn ball bankarán bardagi blak
blaðamannafundur brúðkaup brúðkaupsafmæli brúðkaupsferð
brúðkaupsnótt bylting dans danskeppni dansleikur eldsvoði
feluleikur ferð ferðalag fjárhættuspil flug
flótti forleikur frumsýning frí fundur fótboltaleikur fótbolti ganga
gifting gleðskapur glíma gönguferð hafnabolti
heimsmeistarakeppni heimsstyrjöld heimsókn hlaup
hlaðborð hnefaleikur hrekkjavaka hálfleikur hátíð hæfileikakeppni
innbrot innrás jarðarför kappakstur kapphlaup kennslustund keppni
kjötkveðjuhátíð kosning kvöldverðarboð köfun
lautarferð leikur leiðangur lokapróf lottó messa
minningarathöfn námskeið orrusta próf rán
ráðstefna réttarhald rúntur samkoma samkvæmi sendiför sigling
skrúðganga skólaball slagur slys sprenging
stefnumót stríð sumarfrí sund sýning teiti trúlofun túr uppboð
uppreisn uppþot veisla veðmál yfirheyrsla
áheyrnarprufa æfing óeirð úrslitakeppni úrslitaleikur útför
útilega útsala
""")

# The sky and what is in it. Not somewhere one walks to, and not a thing that
# lies on a beach: "Sól lá í fjörunni" is why these are no longer `nature`.
SKY = _s("""
alheimur halastjarna himinn hnöttur loftsteinn máni pláneta sjóndeildarhringur
ský smástirni stjarna svarthol sól sólkerfi tungl vetrarbraut
jörð
""")

SETTLEMENT = _s("""
bær borg þorp hverfi land eyja sveit ríki hérað heimur veröld smábær stórborg
höfuðborg miðbær miðborg úthverfi heimabær heimaland föðurland nýlenda
konungsríki heimsveldi lýðveldi fylki sýsla umdæmi meginland útland ættjörð
vesturland austurströnd
""")

CLASSES = ("person", "job", "group", "animal", "critter", "plant", "body", "food", "drink",
           "clothing", "vehicle", "furniture", "object", "struct", "substance",
           "nature", "sky", "weather", "place", "building", "room", "settlement",
           "money", "text", "book", "film", "music", "time", "event", "abstract")

_TABLE = {}
for _name in CLASSES[:-1]:
    for _w in globals()[_name.upper()]:
        _TABLE[_w] = _name

# ---------------------------------------------------------------------------
# í or á — the convention for places and events, in the sense "fara í/á X" and
# "vera í/á X". Only the nouns where one of the two is clearly the usual choice.
# Nouns with no entry are never substituted under í or á.
PREP_I = _s("""
afmæli apótek auðn bakarí bakherbergi banki bardagi barnaherbergi baðherbergi
borg borðstofa brúðkaup byrgi bær bíll bílskúr bíó bókabúð búningsherbergi
bústaður búð dalur dans dýflissa eldhús eyðimörk fangaklefi fangelsi ferð
ferðalag flug flugvél framhaldsskóli frumskógur frí fundarherbergi fótbolti
gagnfræðaskóli garður gestaherbergi grunnskóli gönguferð heimsókn hellir
helvíti herbergi hesthús himnaríki hlaða hverfi hádegismatur háskóli hólmur
höll hús jarðarför kapphlaup kastali keppni kirkja kjallari klaustur kofi
kvikmyndahús kvöldmatur land leikhús leit lest menntaskóli messa miðskóli
morgunmatur mötuneyti mýri paradís próf rúta setustofa skáli skógur skóli
skúr snjóhús stofa strætó stríð sumarbústaður sumarfrí sumarhús sund sundlaug
svefnherbergi sveit veisla verslun verslunarmiðstöð vinna vinnustofa virki
íbúð útför útilega útland þorp þvottahús
""")

PREP_A = _s("""
akur ball bar bensínstöð biðstofa blaðamannafundur braut brautarpallur brekka
bryggja bás bílastæði bókasafn dansgólf dansleikur dýragarður elliheimili
eyja fjall fjara flugbraut flugvöllur flöt frumsýning fundur fyrirlestur
gangstétt gata geðsjúkrahús gistiheimili gistihús grasflöt gólf haf heimavist
herstöð hlíð hraðbraut háaloft hátíð hæli hæð hóll hótel hótelherbergi höfn
jökull kaffihús kaffistofa klettur klósett kosning krá lager leikvangur
leikvöllur lestarstöð listasafn læknastofa lögreglustöð matsalur mótel
norðurpóll námskeið næturklúbbur næturvakt pallur pósthús rannsóknarstofa
rannsóknastofa ráðstefna réttarhald réttarsalur safn samkoma sjór sjúkrahús
sjúkrastofa skemmtigarður skrifstofa skurðstofa skólaball spítali stefnumót
stræti strönd stöð stúka svæði sýning tindur torg tún uppboð vakt vatn
veitingahús veitingastaður verksmiðja verkstæði verönd vitnastúka völlur
æfing útsala þak þilfar
""")

PREP = {}
for _w in PREP_I:
    PREP[_w] = "í"
for _w in PREP_A:
    PREP[_w] = "á"

# ---------------------------------------------------------------------------
# Never put into a generated sentence. The word stays in the vocabulary.
EXCLUDE = _s("""
afstyrmi aftaka afturendi andskoti asni auli aumingi aðmíráll bakhluti
bankarán bankaræningi bardagamaður bjáni bjór bleyða blásýra blóðbað blóðsuga
blökkumaður bomba bossi brjálæði brjálæðingur brjóstahaldari brúðkaupsnótt
byssa byssukúla bytta bófi böllur böðull dauðadómur dauðarefsing djöfull
drjóli drulla drullusokkur drusla drykkja dráp dræsa dáti dólgur dópsala
dópsali einkaspæjari eista eitur eiturefni eiturlyf eiturlyfjasala
eiturlyfjasali elskandi elskhugi fallbyssa fantur fatafella fjandi fjári
fjöldamorð fjöldamorðingi flugskeyti flón framhjáhald fullnæging fyllibytta
fábjáni fáviti fífl fíkill fíkniefni fórnarlamb geirvarta gella
gereyðingarvopn gerpi getnaðarvörn geðklofi geðsjúklingur geðsjúkrahús gikkur
glæpamaður glæpur grey gunga gála gálgi haglabyssa handjárn handsprengja hass
heigull heilablóðfall heimskingi helvíti henging her herafli herdeild
herflokkur herforingi herfylki herlið hermaður hernaður herréttur
hershöfðingi herskóli herstöð hersveit hjartaslag hjartaáfall hjákona hland
hommi hor hryðjuverk hryðjuverkamaður hræ hró hugleysingi hundaskítur
hálfviti hóruhús illmenni indíáni innbrot innbrotsþjófur innrás jarðsprengja
kafbátur kampavín kauði kelling kerling kjaftaskur kjaftur kjarnakljúfur
kjarnorkusprengja kjarnorkuvopn kjáni klám klámmynd kommi kommúnismi
kommúnisti krabbamein krufning kuti kvíðakast kynfæri kynlíf kynsjúkdómur
kúkur launmorðingi leigumorðingi lekandi lesbía leyniskytta leyniþjónusta
leyniþjónustumaður limur liðsforingi liðþjálfi ljóska lygalaupur lygamörður
lygari lásbogi lífstykki lík líkhús líkkista lúði mafía mafíósi mannfjandi
mannrán mannæta mella melludólgur mjöður monthani morð morðingi nasisti
nauðgari nauðgun nektarmynd njósnari ofursti orrusta piss pungur píka púður
púðurskot rass rassgat rauðvín raðmorðingi reyking riffill rugludallur rumur
rán ræfill ræningi róni rýtingur sjálfsmorð sjóliði skammbyssa skaufi
skotbardagi skotfæri skotgröf skothríð skothylki skotlína skotsár skotvopn
skotárás skrambi skratti skriðdreki skræfa skvísa skæruliði skíthæll
skítseiði skítur smokkur snípur sprengiefni sprengja sprengur spæjari
standpína staup stinning strippari stríðsherra stríðsmaður stuldur styrjöld
svertingi svikahrappur svikari svindl svindlari sæði sérsveit sérsveitarmaður
sígaretta tittlingur tundurskeyti typpi tík tóbak tútta uppljóstrari uppreisn
uppþot vampíra villimaður vindill vitfirringur vitleysingur viðrini vopn
vopnabúr vændi vændiskona vélbyssa víglína vígvöllur víma vín vínflaska
vínglas yfirheyrsla áfengi árás árásarmaður ástkona ódámur óféti óþokki
öfgamaður úrhrak úrþvætti útsendari þjófnaður þjófur þrjótur þrælahald
þrælkunarvinna þunglyndi
""")


# ---------------------------------------------------------------------------
# Nouns that are in the vocabulary because one of their forms is also a very
# common verb, numeral or particle (*geta*, *vera*, *koma*, *fimm*, *ver*), or
# that a teenager meets only inside a fixed phrase (*á kreik*, *á róli*). They
# keep their paradigm; they are not written into a sentence.
EXCLUDE |= _s("""
billjón bora brenna eyða hella hræða hundrað kippa klippa núll orða renna ræna
skella skora vaka verja þúsund
""")

# Words a film says and a schoolbook does not: rude, crude or merely odd in a
# sentence written for a child. (v6.4, from reading the unclassified nouns and
# the `person` list.)
EXCLUDE |= _s("""
bobbingur bósi fretur glaumgosi hausaveiðari hlunkur hundspott jóna kjaftæði
klof larfur lögg niðurgangur ógeð óþverri skítverk smetti strokufangi
sveitalubbi tittur trantur tæfa veðmangari viðbjóður viðundur véfrétt
vodka vodki klósett salerni kamar fangelsi fangaklefi dýflissa grafhýsi
kirkjugarður grafreitur gröf spilavíti næturklúbbur krá bar
slys eldsvoði sprenging stríð heimsstyrjöld jarðarför útför minningarathöfn
bardagi slagur bylting flótti óeirð réttarhald forleikur veðmál lottó
öfuguggi hátign fjárhættuspilari fjárhættuspil harðstjóri dauði dauðsfall
dauðdagi andlát mannfall morðmál ofbeldi útrýming slátrun tortíming aftaka
""")

# v6.5 — from reading generated sentences frame by frame. God and the devil
# ("Guðinn skiptir mestu máli"), forms of address (*herra*), the rest of the
# army and the courtroom, and a body part that is only a word in a table but
# a giggle in "Ég sá ___ á myndinni".
EXCLUDE |= _s("""
herra guð drottinn frelsari messías kynþáttur lýður blendingur svartigaldur
gísl málaliði liðhlaupi landgönguliði sjóliðsforingi undirforingi höfuðsmaður
stríðshetja afbrotamaður sakborningur betlari leynivopn brjóst krufning
verkfall þræll hundamatur sníkjudýr lús fló lirfa maðkur
himnaríki paradís hrísgrjón aðili
""")

# Nouns one of whose forms is a much commoner word: "Þetta er saga um við"
# (*viður*), "Þetta gengur ekki án ár" (*á*). Fine in a table, a riddle in a
# generated sentence.
EXCLUDE |= _s("""
viður á
""")

# ---------------------------------------------------------------------------
# Plural. See "NO PLURAL" at the top.
MASS_CLASSES = ("substance", "abstract", "weather", "drink", "music")

# Nouns of the mass classes that are counted in everyday speech.
PLURAL_OK = _s("""
skuggi geisli neisti logi
afleiðing afrek afsökun alda athugasemd atburður atkvæði atriði atvik aðferð
bros brot bylgja bæn beiðni breyting brella dómur draumur drykkur dæmi einkunn
elding erfiðleiki faðmlag fellibylur fjölmiðill flóð flóðbylgja fórn frásögn
fyrirmynd fyrirtæki gosdrykkur greiðsla handaband hefð hindrun hljóðfæri
hljómur hlutur hlutverk hótun hugmynd hugsun hvirfilbylur hæfileiki högg
jarðskjálfti kenning koss krafa kvörtun lag lausn leið lexía leyndarmál loforð
lygi lýsing mark markmið martröð minning misskilningur mál möguleiki nafn
niðurstaða nóta númer pöntun rannsókn refsing regla regnbogi ráð samningur
samtal símtal sjúkdómur skipun skoðun skot skref skuld skýring smáatriði spor
spurning staðreynd starf stormur svar sár sönnun söngur tala tegund tilboð
tilfelli tilfinning tillaga titill tákn tækifæri tónn uppfinning uppgötvun
valkostur vandamál veikleiki venja verk viðburður vísbending áætlun ábending
ákvörðun árekstur ásökun áskorun ástæða ósk útvarp þruma
""")

# Mass and collective nouns of the countable classes.
NO_PLURAL = _s("""
alheimur almenningur barr blak dót farði fatnaður fita fjármagn fjárhættuspil
flakk frítími frændfólk fæða fólk fótbolti geimur gifs glíma grennd grænmeti
gærdagur hafnabolti hafsbotn heimalærdómur heimanám heimavinna helvíti
himnaríki hnetusmjör hold hrísgrjón hunang hundamatur hádegi hádegismatur
hádegisverður háttatími húð ilmvatn kjarr kjöt korn krydd kvenfólk kvöldmatur
kvöldverður kál köfun landslag leynilögregla lottó límband lögregla mannfjöldi
mannfólk mannkyn mannskapur matartími matur matvara miðnætti morgundagur
morgunkorn morgunmatur morgunverður munnvatn máni múgur naglalakk nesti
norðurpóll nágrenni náttúra paradís pipar reiðufé reykur rjómi ríkislögregla
sjampó sjóndeildarhringur sjór skin slátur smjör starfsfólk strandgæsla sulta
sund sviti sykur sælgæti síðdegi tómatsósa undirheimur vanilla verðlaunafé
veröld yfirvinna æska útbúnaður útland þjónustufólk
farangur
gras greni kex
""")


# Kin terms that are used the way names are: *mamma*, never *mamman*, when a
# child means its own. In a generated sentence they are not given the article.
NO_ARTICLE = _s("""
mamma pabbi amma afi
""")


def no_article(lemma):
    return lemma in NO_ARTICLE


def no_plural(lemma):
    """True for a noun that is not shown in the plural in a generated sentence."""
    if lemma in NO_PLURAL:
        return True
    return klass(lemma) in MASS_CLASSES and lemma not in PLURAL_OK


for _w in "herra fés".split():
    _TABLE.pop(_w, None)
_TABLE["höfuðleður"] = "body"
EXCLUDE.add("fés")


def klass(lemma):
    """The semantic class of a noun. Unlisted nouns are `abstract`, which only
    the frames that accept anything will take — the safe direction."""
    return _TABLE.get(lemma, "abstract")


def prep(lemma):
    """`í`, `á`, or None when the convention is not recorded."""
    return PREP.get(lemma)


def excluded(lemma):
    return lemma in EXCLUDE


if __name__ == "__main__":
    import collections, json
    L = json.load(open("lexicon.json"))
    nouns = [w["o"] for w in L["w"] if w["c"] in ("kk", "kvk", "hk")]
    print(dict(collections.Counter(klass(n) for n in nouns)))
    print("excluded:", sum(1 for n in nouns if excluded(n)),
          "| with í/á:", sum(1 for n in nouns if prep(n)))
    print("not shown in the plural:", sum(1 for n in nouns if no_plural(n)))
    unknown = sorted(w for w in list(_TABLE) + list(PREP) + list(EXCLUDE)
                     + list(PLURAL_OK) + list(NO_PLURAL) if w not in set(nouns))
    print("listed but not in the vocabulary:", len(unknown), unknown[:40])
