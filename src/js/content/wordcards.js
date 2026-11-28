/* Rangar skýringar á orðakortinu (#15): skrefið „Hvað merkir orðið?“
 *
 * Á orðakortinu velur nemandinn rétta skýringu orðsins af þremur. Rétta
 * skýringin er skýring orðsins í Íslenskri nútímamálsorðabók (ÍNO). Röngu
 * skýringarnar tvær eru ÍNO-skýringar TVEGGJA ANNARRA ORÐA, og hér er skráð
 * hvaða orð það eru. Hver lína:
 *
 *     orð|orðflokkur   orð með ranga skýringu   annað orð með ranga skýringu
 *
 * Skýringarnar sjálfar standa ekki hér: forritið sækir þær í orðabókargögnin,
 * svo að þær breytast með þeim. `node tools/wordcards.mjs` prentar hvert kort
 * eins og nemandinn sér það, með skýringunum.
 *
 * Reglur við skráningu:
 *   - Röng skýring má ekki með neinu móti geta átt við orðið. Ef nemandi gæti
 *     fært rök fyrir henni, veldu annað orð. (Hafnað við yfirlestur: skýring
 *     orðsins „bjartsýnn“ við „jákvæður“, „tún“ við „svæði“, „undirstaða“ við
 *     „rót“, „fræða“ við „endurspegla“.)
 *   - Orðin þrjú eru í sama orðflokki og öll á LÍNO-2-listanum.
 *   - Orði er SLEPPT (þá er skrefið ekki á kortinu) ef fyrsta skýring ÍNO er
 *     ekki sú merking sem nemandinn þekkir eða þarf: „vandi“ (venja),
 *     „þýðing“ (mikilvægi), „hefja“ (lyfta upp), „heimild“ (leyfi), „raun“,
 *     „mark“, „lýsing“, „verja“, „hafna“, „persóna“, „einfaldur“, „greina“,
 *     „viðbragð“, „utan“, „undan“, „megin“, „líkja“, „hugsanlega“.
 *
 * Forritið stakk upp á pörunum (tasks/wordcard.js `proposeFar`) og þau voru
 * síðan lesin eitt og eitt. Listinn nær yfir fyrstu 330 orðin sem nemandi
 * getur fengið; orð sem er ekki hér fær kort án þessa skrefs.
 * tests/wordcard.test.js les hverja línu.
 */
export const EXPLAIN_LIST = `
einnig|ao fyrrum|ao stundum|ao
hluti|kk kollur|kk blettur|kk
áhrif|hk innihald|hk framför|kvk
breyting|kvk óhapp|hk kynning|kvk
mikilvægur|lo ókunnugur|lo tvöfaldur|lo
einstaklingur|kk keppinautur|kk nágranni|kk
starf|hk svið|hk styrkur|kk
síðan|ao beinlínis|ao ríflega|ao
auka|so umlykja|so stara|so
meðferð|kvk skilyrði|hk framför|kvk
sérstaklega|ao nýlega|ao eingöngu|ao
tengja|so streyma|so rísa|so
hugmynd|kvk erfiðleiki|kk eyðing|kvk
bæta|so hefja|so frétta|so
almennur|lo undarlegur|lo næmur|lo
hlutverk|hk aðskilnaður|kk afl|hk
þjóð|kvk ávöxtur|kk framlenging|kvk
aðili|kk nágranni|kk varamaður|kk
nýta|so hægja|so greina|so
svið|hk aðskilnaður|kk aðalhlutverk|hk
tillaga|kvk flétta|kvk alvara|kvk
jafnframt|ao tiltölulega|ao örugglega|ao
framkvæmd|kvk sýn|kvk hluti|kk
samningur|kk sjálf|hk frestur|kk
stundum|ao gjarnan|ao samanlagt|ao
kostur|kk hvíld|kvk framleiðsla|kvk
einkum|ao rækilega|ao ella|ao
eigin|lo trúverðugur|lo líkur|lo
stjórn|kvk tól|hk kynslóð|kvk
hversu|ao næstum|ao gjarnan|ao
þróun|kvk jafnvægi|hk athugasemd|kvk
einkenni|hk hlutverk|hk meðferð|kvk
notkun|kvk blæðing|kvk blekking|kvk
aðferð|kvk hræðsla|kvk samruni|kk
svæði|hk byrjun|kvk laug|kvk
upphaf|hk furða|kvk hvatning|kvk
hljóta|so kólna|so ljúga|so
árangur|kk móttaka|kvk villa|kvk
grundvöllur|kk mynstur|hk aðferð|kvk
tilvik|hk vænting|kvk viðbót|kvk
starfsemi|kvk eiginleiki|kk ályktun|kvk
erlendur|lo skriflegur|lo öflugur|lo
skilyrði|hk aðskilnaður|kk afrakstur|kk
atriði|hk tíðni|kvk staðhæfing|kvk
einungis|ao ævinlega|ao tvímælalaust|ao
tilfelli|hk illska|kvk skjálfti|kk
ábyrgð|kvk fyrirmynd|kvk andstaða|kvk
greining|kvk skemmtun|kvk missir|kk
skilningur|kk lækning|kvk landslag|hk
virðulegur|lo óhefðbundinn|lo gildur|lo
stefna|kvk streita|kvk vinátta|kvk
samhengi|hk máttur|kk fall|hk
þátttakandi|kk vörður|kk hetja|kvk
yfirleitt|ao ella|ao eflaust|ao
merking|kvk dvöl|kvk útlit|hk
skýr|lo ferskur|lo þægilegur|lo
víða|ao einungis|ao tvímælalaust|ao
ofan|ao sjálfkrafa|ao undanfarið|ao
tafla|kvk perla|kvk aur|kk
skilgreina|so tilheyra|so gruna|so
jákvæður|lo öflugur|lo göfugur|lo
forsenda|kvk þjáning|kvk vitnisburður|kk
íbúi|kk heimildarmaður|kk sjálfboðaliði|kk
vandamál|hk játning|kvk þrýstingur|kk
kjölfar|hk skemmtun|kvk stoð|kvk
rit|hk seta|kvk síða|kvk
félagslegur|lo dýrmætur|lo óskýr|lo
reyndar|ao aðallega|ao undan|ao
afar|ao fljótlega|ao ofan|ao
viðhorf|hk blæðing|kvk undrun|kvk
menntun|kvk samningur|kk miðja|kvk
heild|kvk lækning|kvk svipur|kk
gæta|so hýsa|so dreifa|so
móðir|kvk útlendingur|kk seljandi|kk
brot|hk lokun|kvk kollur|kk
sjónarmið|hk jafnvægi|hk hótun|kvk
semja|so teygja|so endurgreiða|so
leysa|so efna|so sökkva|so
afleiðing|kvk hugsun|kvk staðreynd|kvk
mögulegur|lo viðstaddur|lo rökréttur|lo
faðir|kk óvinur|kk stuðningsmaður|kk
hefðbundinn|lo flatur|lo samfelldur|lo
frásögn|kvk vefsíða|kvk jafna|kvk
eingöngu|ao margfalt|ao framarlega|ao
sjálfsagður|lo daufur|lo forn|lo
afstaða|kvk missir|kk greining|kvk
flókinn|lo fullkominn|lo dramatískur|lo
athugasemd|kvk myndataka|kvk verknaður|kk
virkur|lo upprunalegur|lo tæknilegur|lo
menning|kvk miðja|kvk búnaður|kk
þegar|ao hérlendis|ao upprunalega|ao
tíðni|kvk smáatriði|hk verknaður|kk
málefni|hk svipur|kk varningur|kk
grípa|so hlýða|so álykta|so
gjarnan|ao tímabundið|ao sameiginlega|ao
vissulega|ao innanlands|ao innbyrðis|ao
styrkur|kk hefnd|kvk afrakstur|kk
fjölga|so fæla|so útrýma|so
styrkja|so skemma|so girða|so
hve|ao innanlands|ao tiltölulega|ao
hvetja|so tilheyra|so hirða|so
lesandi|kk náungi|kk gerandi|kk
móta|so halla|so dreifa|so
skilgreining|kvk hella|kvk myndataka|kvk
einfaldlega|ao kærlega|ao ofarlega|ao
áætlun|kvk álag|hk karlmennska|kvk
safna|so fordæma|so neyða|so
skráning|kvk fyrirbæri|hk tákn|hk
erlendis|ao réttilega|ao framvegis|ao
sjálfstæður|lo væntanlegur|lo eilífur|lo
neikvæður|lo skilvirkur|lo myndarlegur|lo
framkvæma|so heilla|so fullyrða|so
aðstoð|kvk auður|kk afhending|kvk
hugsun|kvk frammistaða|kvk skaði|kk
uppbygging|kvk hörmung|kvk boðskapur|kk
staðfesta|so kveikja|so forða|so
samvinna|kvk játning|kvk vandamál|hk
óska|so hóta|so flýja|so
einkenna|so gleypa|so halla|so
fjölmiðill|kk forgangur|kk afbrigði|hk
áhugaverður|lo ódýr|lo svolítill|lo
vettvangur|kk tóm|hk vinsæld|kvk
tilefni|hk grunnur|kk innsæi|hk
öryggi|hk frelsi|hk nýjung|kvk
orsök|kvk samruni|kk hræðsla|kvk
merki|hk kanna|kvk skjöldur|kk
viðfangsefni|hk galdur|kk seta|kvk
grunnur|kk kostur|kk dráttur|kk
raunverulegur|lo hæfur|lo óþekktur|lo
uppruni|kk hefð|kvk máti|kk
forn|lo lélegur|lo heppinn|lo
stúlka|kvk augnablik|hk skáldskapur|kk
nákvæmlega|ao einfaldlega|ao tæplega|ao
vernd|kvk vídd|kvk grundvöllur|kk
hæð|kvk blettur|kk vökvi|kk
staðreynd|kvk hugsun|kvk tækni|kvk
tilheyra|so ráðleggja|so ímynda|so
aðallega|ao fullkomlega|ao reyndar|ao
rúmlega|ao einfaldlega|ao kærlega|ao
öflugur|lo heiðarlegur|lo ömurlegur|lo
ályktun|kvk hráefni|hk ábyrgð|kvk
skyldur|lo fær|lo hraustur|lo
viðbót|kvk þjáning|kvk andrúmsloft|hk
yfirborð|hk áhætta|kvk brot|hk
daglegur|lo heilmikill|lo hræðilegur|lo
frjáls|lo merkilegur|lo ömurlegur|lo
skipulag|hk hörmung|kvk minni|hk
heilsa|kvk skráning|kvk yfirburður|kk
fyrirbæri|hk málefni|hk varningur|kk
leiðbeining|kvk andlát|hk framhald|hk
endurspegla|so dreifa|so móta|so
samþykki|hk áhyggjuefni|hk aðferð|kvk
áhætta|kvk brot|hk félagsskapur|kk
eiginleiki|kk seta|kvk meðvitund|kvk
rót|kvk vídd|kvk miðbær|kk
ferli|hk staðsetning|kvk lýsing|kvk
magn|hk töf|kvk galdur|kk
skortur|kk vinsæld|kvk afsláttur|kk
takmörkun|kvk sjálfstraust|hk dvöl|kvk
sennilega|ao einkar|ao loksins|ao
skipti|hk starfsemi|kvk andstaða|kvk
frelsi|hk söfnun|kvk aðstoð|kvk
flokka|so prenta|so uppgötva|so
tækni|kvk afleiðing|kvk frammistaða|kvk
skáld|hk fangi|kk óvinur|kk
líkamlegur|lo tiltækur|lo andstæður|lo
túlka|so hlýða|so stara|so
takmarka|so sameina|so stjórna|so
hérlendis|ao nýlega|ao árlega|ao
upplifa|so gæta|so tefja|so
veruleiki|kk sjálf|hk spilling|kvk
samkomulag|hk aðalhlutverk|hk galli|kk
framleiðsla|kvk grunnur|kk byrði|kvk
stjórna|so takmarka|so glata|so
innihalda|so lofa|so þrýsta|so
hefð|kvk sannleiki|kk dráttur|kk
framhald|hk blekking|kvk notkun|kvk
eining|kvk illska|kvk aðalatriði|hk
sömuleiðis|ao hvergi|ao ella|ao
þaðan|ao trúlega|ao sjálfkrafa|ao
sögulegur|lo myndarlegur|lo stífur|lo
kynslóð|kvk stjórn|kvk fyrirmynd|kvk
álag|hk sómi|kk bakgrunnur|kk
útskýra|so þjálfa|so efa|so
vísbending|kvk yfirburður|kk varningur|kk
gagnrýni|kvk tíðni|kvk staðhæfing|kvk
ábending|kvk útkoma|kvk sprunga|kvk
augljós|lo skelfilegur|lo dýrmætur|lo
skuldbinding|kvk rás|kvk sannfæring|kvk
manneskja|kvk gerandi|kk lesandi|kk
nýlegur|lo fróður|lo slakur|lo
meirihluti|kk alvara|kvk ógn|kvk
byrjun|kvk afgangur|kk viðbót|kvk
fagna|so leysa|so troða|so
sýn|kvk brún|kvk kollur|kk
námskeið|hk sigling|kvk innrás|kvk
orðalag|hk atvik|hk lýður|kk
heili|kk tafla|kvk neyðarástand|hk
atvik|hk byrjun|kvk trygging|kvk
áðan|ao beinlínis|ao ríflega|ao
tiltölulega|ao seint|ao augljóslega|ao
faglegur|lo fyrirsjáanlegur|lo meðtalinn|lo
festa|so etja|so næra|so
varðveita|so tefja|so einkenna|so
fyrirmynd|kvk töf|kvk andstaða|kvk
vega|so einblína|so fæla|so
list|kvk agi|kk miðja|kvk
ætt|kvk ávöxtur|kk heili|kk
handrit|hk hæfileiki|kk afleiðing|kvk
dreifa|so hindra|so springa|so
skrif|hk samkennd|kvk fortíð|kvk
varla|ao reglulega|ao aðallega|ao
yfirvald|hk kjölfar|hk greining|kvk
svolítið|ao reyndar|ao milli|ao
tæplega|ao einfaldlega|ao einkar|ao
nútími|kk forsenda|kvk byrjun|kvk
frægur|lo klár|lo vænn|lo
sameina|so giska|so þrýsta|so
nákvæmur|lo óhjákvæmilegur|lo einlægur|lo
snemma|ao svolítið|ao greinilega|ao
drengur|kk ferli|hk hetja|kvk
stöðugur|lo ólöglegur|lo listrænn|lo
kjarni|kk samkomulag|hk leiðsögn|kvk
sannarlega|ao mögulega|ao heiman|ao
persónulegur|lo ömurlegur|lo öflugur|lo
ítarlegur|lo afbrigðilegur|lo andstæður|lo
gríðarlega|ao ofan|ao hægt|ao
fatlaður|lo mikilvægur|lo formlegur|lo
áhorfandi|kk heimildarmaður|kk meistari|kk
sjaldgæfur|lo sjónrænn|lo sjálfvirkur|lo
rými|hk fall|hk ágæti|hk
virka|so aðlaga|so stjórna|so
foreldri|hk þátttakandi|kk kaupandi|kk
reisa|so batna|so hrynja|so
skýrt|ao gjarnan|ao einnig|ao
húsnæði|hk andlát|hk skjálfti|kk
tímarit|hk neyðarástand|hk tunna|kvk
nýlega|ao samtímis|ao hérlendis|ao
stofn|kk skemmtun|kvk traust|hk
djúpur|lo sjónrænn|lo skrýtinn|lo
óvissa|kvk afleiðing|kvk opnun|kvk
hraði|kk dráttur|kk áskorun|kvk
`;
