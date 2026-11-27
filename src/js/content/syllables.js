/* Atkvæðaskipting orða á orðakortinu (#15).
 *
 * Hér eru orðin sem orðakortið sýnir skipt í atkvæði. Aðeins SAMSKEYTIN eru
 * skráð, með plúsmerki: á+hrif, mikil+vægur, sér+stak+lega. Forritið skiptir
 * hverjum orðhluta sjálft eftir reglunni að hvert atkvæði á eftir því fyrsta
 * hefjist á sérhljóði (hest-ur, breyt-ing, mik-il-væg-ur), sjá
 * core/syllables.js. Orð án samskeyta er skrifað eins og það er.
 *
 * Reglur við skráningu (ritreglur Íslenskrar málnefndar, 33. kafli):
 *   - plús á milli liða í samsettu orði og á eftir forskeyti: hug+mynd, á+hrif,
 *     til+laga, ó+vissa;
 *   - plús á undan viðskeyti sem hefst á samhljóði og er skynjað sem sérstök
 *     eining: -legur, -lega, -lingur, -leiki, -rænn, -semi, -semd;
 *   - plús í löngu tökuorði þar sem það skiptist eins og samsett orð: per+sóna;
 *   - ekkert plús á undan viðskeyti sem hefst á sérhljóði (-ing, -un, -andi,
 *     -ugur): reglan sér um það.
 * Orð sem ekki er augljóst hvernig á að skipta er SLEPPT (þá sýnir kortið
 * enga atkvæðaskiptingu): hversu, notkun, skráning, tíðni, tækni, virkni.
 *
 * Orðin eru í röð LÍNO-2-listans (algengustu fyrst). Listinn nær yfir fyrstu
 * 330 orðin sem nemandi getur fengið; bæta má við hann hvenær sem er.
 * tests/syllables.test.js les hverja línu.
 */
export const SYLLABLE_LIST = `
einnig hluti á+hrif breyting mikil+vægur ein+stak+lingur starf síðan auka með+ferð
sér+stak+lega heimild greina jafn+vel tengja hug+mynd bæta al+mennur hlut+verk þjóð
aðili raun nýta svið mat til+laga hefja mæla jafn+framt fram+kvæmd
samningur stundum kostur einkum eigin stjórn þróun ein+kenni gildi sam+ræmi
að+ferð svæði til+tekinn upp+haf hljóta ár+angur grund+völlur til+vik starf+semi er+lendur
skil+yrði at+riði ein+ungis til+felli á+byrgð mis+munandi greining skilningur virðu+legur stefna
mark sam+hengi þátt+takandi yfir+leitt merking skýr víða utan ofan tafla
skil+greina já+kvæður for+senda í+búi vanda+mál kjöl+far rit fé+lags+legur um+fjöllun ein+faldur
reyndar afar við+horf menntun heild gæta móðir brot sjónar+mið stofna
semja sam+bæri+legur leysa af+leiðing mögu+legur faðir hefð+bundinn frá+sögn ein+göngu sjálf+sagður
af+staða flókinn vandi at+huga+semd virkur menning þegar mál+efni grípa gjarnan
vissu+lega þýðing styrkur fjölga styrkja hve hvetja eftir+farandi lesandi móta
mikil+vægi skil+greining per+sóna ein+fald+lega heiti á+ætlun safna til+skipun lýsing er+lendis
sjálf+stæður nei+kvæður fram+kvæma úr+ræði að+stoð hugsun gildandi upp+bygging stað+festa sam+vinna
verja við+bragð óska ein+kenna merkja fjöl+miðill á+huga+verður vett+vangur til+efni ör+yggi
or+sök merki við+fangs+efni grunnur raun+veru+legur upp+runi veru+lega forn stúlka ná+kvæm+lega
vernd rita hæð stað+reynd til+heyra aðal+lega rúm+lega öflugur á+lyktun skyldur
mæling hugsan+lega við+bót raunar yfir+borð breyttur háður dag+legur frjáls skipu+lag
heilsa fyrir+bæri leið+beining endur+spegla sam+þykki á+hætta ráð+stöfun eigin+leiki rót ferli
raf+rænn magn skortur við+mið tak+mörkun senni+lega skipti frelsi flokka skáld
undan líkam+legur við+mælandi túlka tak+marka hér+lendis fjöl+breyttur upp+lifa veru+leiki sam+komu+lag
tak+markaður fram+leiðsla stjórna hegðun inni+halda hefð fram+hald eining hækkun sömu+leiðis
þaðan sögu+legur kyn+slóð á+lag marg+vís+legur út+skýra að+gengi lengd vís+bending gagn+rýni
aldraður huga á+bending vaxandi á+berandi aug+ljós skuld+binding væntan+lega manneskja ný+legur
meiri+hluti byrjun fagna sýn fræðsla nám+skeið orða+lag heili inn+leiða at+vik
hafna varpa tengdur áðan á+hættu+þáttur til+tölu+lega stafa fag+legur festa bú+seta
inn+leiðing varð+veita starfs+hópur fyrir+mynd vega list ætt hand+rit dreifa hlið+sjón
skrif smár varla við+eigandi yfir+vald svo+lítið tæp+lega að+gengi+legur nú+tími frægur
sam+eina ná+kvæmur við+halda snemma drengur stöðugur kjarni megin+regla sannar+lega líkja
per+sónu+legur ítar+legur á+vallt nýting gríðar+lega fatlaður ung+menni á+horfandi megin sí+fellt
sjald+gæfur rými virka nálgun for+eldri mála+flokkur tals+verður reisa víð+tækur skýrt
hús+næði framan+greindur vinnsla tíma+rit ný+lega sér+hæfður stofn les+efni ný+sköpun djúpur
ó+vissa heimilis+læknir gagn+rýna hraði
`;
