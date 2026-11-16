/* Definitions for the grammatical terms themselves.

   The explanations the program generates are written in grammatical language:
   "with the article the adjective takes the weak inflection". For a pupil with a
   language disorder that sentence is as opaque as the exercise. Every term is
   therefore explained here in ordinary language, with an example, and linked to
   the same three sources every time.

   No network connection is needed for an explanation to appear — it is in the
   document. The links only open if they are clicked.                      */

export const RESOURCES = [
  { id: "bin", nm: "BÍN", ds: "Beygingarlýsing íslensks nútímamáls",
    url: (q) => `https://bin.arnastofnun.is/leit/?q=${encodeURIComponent(q)}` },
  { id: "malid", nm: "Málið.is", ds: "Vefgátt Árnastofnunar",
    url: (q) => `https://malid.is/leit/${encodeURIComponent(q)}` },
  { id: "ino", nm: "Íslensk nútímamálsorðabók", ds: "Orðabók með ~50.000 flettum",
    url: (q) => `https://islenskordabok.arnastofnun.is/leit/${encodeURIComponent(q)}` },
];

/* keys: every surface form that should turn into a link in explanation text.
   q: the search term handed to the external sources.                     */
export const TERMS = [
  { id: "nefnifall", nm: "Nefnifall", q: "nefnifall",
    keys: ["nefnifall", "nefnifalli", "nefnifalls", "NF"],
    ds: "Fallið sem orðið stendur í þegar það er frumlag — sá sem gerir eitthvað. Spurt er *hver?* eða *hvað?*: **hesturinn** hleypur." },
  { id: "tholfall", nm: "Þolfall", q: "þolfall",
    keys: ["þolfall", "þolfalli", "þolfalls", "ÞF"],
    ds: "Algengasta fall andlagsins — þess sem verknaðurinn lendir á. Spurt er *um hvern?* eða *um hvað?*: ég sé **hestinn**." },
  { id: "thagufall", nm: "Þágufall", q: "þágufall",
    keys: ["þágufall", "þágufalli", "þágufalls", "ÞGF", "ÞG"],
    ds: "Fall sem margar sagnir og forsetningar stýra, oft um þann sem eitthvað er gert fyrir. Spurt er *frá hverjum?*: ég hjálpa **hestinum**." },
  { id: "eignarfall", nm: "Eignarfall", q: "eignarfall",
    keys: ["eignarfall", "eignarfalli", "eignarfalls", "EF"],
    ds: "Fall eignar og margra forsetninga. Spurt er *til hvers?*: hófur **hestsins**." },
  { id: "fall", nm: "Fall", q: "fall",
    keys: ["fall", "falli", "falls", "föll", "föllum", "fallanna"],
    ds: "Íslensk nafnorð, lýsingarorð, fornöfn, töluorð og greinir beygjast í fjórum föllum: nefnifalli, þolfalli, þágufalli og eignarfalli. Fallið sýnir hlutverk orðsins í setningunni." },
  { id: "eintala", nm: "Eintala", q: "eintala",
    keys: ["eintala", "eintölu", "ET"],
    ds: "Eitt af einhverju: **hestur**, **bókin**. Andstæðan er fleirtala." },
  { id: "fleirtala", nm: "Fleirtala", q: "fleirtala",
    keys: ["fleirtala", "fleirtölu", "FT"],
    ds: "Fleiri en eitt: **hestar**, **bækurnar**." },
  { id: "greinir", nm: "Greinir", q: "greinir",
    keys: ["greinir", "greini", "greinis", "með greini", "án greinis", "viðskeyttur greinir", "laus greinir"],
    ds: "Greinirinn segir að átt sé við eitthvað ákveðið. Í íslensku hengist hann oftast aftan á orðið — **hestur → hesturinn** — og kallast þá viðskeyttur greinir. Lausi greinirinn *hinn* sést nær eingöngu í hátíðlegu máli." },
  { id: "sterkbeyging", nm: "Sterk beyging lýsingarorðs", q: "sterk beyging",
    keys: ["sterk beyging", "sterka beygingu", "sterkri beygingu", "sterkrar beygingar", "sterkbeygt", "sterk", "SB",
      "sterk beyging lýsingarorðs", "sterk beyging lýsingarorða", "sterka beygingu lýsingarorða"],
    ds: "Lýsingarorð sem stendur með nafnorði **án greinis** tekur sterka beygingu, og endingin fer eftir kyni: *grænn hestur*, *græn kona*, *grænt barn*. Sterkbeygð mynd endar oft á samhljóði." },
  { id: "veikbeyging", nm: "Veik beyging lýsingarorðs", q: "veik beyging",
    keys: ["veik beyging", "veika beygingu", "veikri beygingu", "veikrar beygingar", "veikbeygt", "veik", "VB",
      "veik beyging lýsingarorðs", "veik beyging lýsingarorða", "veika beygingu lýsingarorða"],
    ds: "Lýsingarorð sem er veikbeygt endar á sérhljóði í öllum föllum, bæði í eintölu og fleirtölu, og stendur oftast með nafnorði **með ákveðnum greini**: *græni hesturinn*, *grænu konunni*. Lýsingarorð með nafnorðum án greinis hafa hins vegar oftast sterka beygingu." },
  /* "stig" on its own is deliberately *not* a key here. The program uses that
     word for the child's overall level ("Stig 7") and for difficulty, and every
     such number used to pick up an explanation about adjectives. The
     inflectional feature therefore goes by its full name — **stigbreyting** —
     everywhere it is mentioned, and the renderer attaches the link directly
     with `abbr()` where it belongs. */
  { id: "stigbreyting", nm: "Stigbreyting", q: "stigbreyting",
    keys: ["stigbreyting", "stigbreytingu", "stigbreytingar", "stigbreytingin"],
    ds: "Lýsingarorð breytast eftir samanburði. Það kallast stigbreyting og hefur þrjú stig: **frumstig** *stór*, **miðstig** *stærri*, **efsta stig** *stærstur*. Sum lýsingarorð stigbreytast ekki — *dauður* er ekki *dauðari*." },
  { id: "frumstig", nm: "Frumstig", q: "frumstig", keys: ["frumstig", "frumstigi", "FSB", "FVB"],
    ds: "Grunnmyndin, án samanburðar: *stór*, *góður*." },
  { id: "midstig", nm: "Miðstig", q: "miðstig", keys: ["miðstig", "miðstigi", "MST"],
    ds: "Samanburður milli tveggja: *stærri*, *betri*. Miðstig er alltaf veikbeygt." },
  { id: "efstastig", nm: "Efsta stig", q: "efsta stig", keys: ["efsta stig", "efsta stigi", "ESB", "EVB"],
    ds: "Hæsta stig samanburðar: *stærstur*, *bestur*." },
  { id: "germynd", nm: "Germynd", q: "germynd", keys: ["germynd", "germynd:", "í germynd", "GM"],
    ds: "Venjuleg mynd sagnar, þar sem frumlagið gerir verknaðinn: *hann **klæðir** sig*." },
  { id: "midmynd", nm: "Miðmynd", q: "miðmynd", keys: ["miðmynd", "í miðmynd", "MM"],
    ds: "Sögn með **-st** aftast: *klæðast*, *sjást*, *finnast*. Miðmynd getur merkt að verknaðurinn beinist að geranda sjálfum eða sé gagnkvæmur." },
  { id: "framsoguhattur", nm: "Framsöguháttur", q: "framsöguháttur",
    keys: ["framsöguháttur", "framsöguhætti", "FH"],
    ds: "Sögnin segir frá einhverju sem er eða var: *ég **les** bókina*." },
  { id: "vidtengingarhattur", nm: "Viðtengingarháttur", q: "viðtengingarháttur",
    keys: ["viðtengingarháttur", "viðtengingarhætti", "VH"],
    ds: "Notaður um óvissu, ósk eða skilyrði, oft á eftir *að*, *ef* eða *þótt*: *ef ég **læsi** bókina*." },
  { id: "bodhattur", nm: "Boðháttur", q: "boðháttur", keys: ["boðháttur", "boðhætti", "BH"],
    ds: "Skipun eða beiðni: **lestu** bókina!" },
  /* Never asked about — `isStyfdur` in core/marks.js keeps it out of every
     question — but named wherever BÍN puts it on the screen, so a child who
     meets *ræt* is told what it is rather than left to guess. */
  { id: "styfdurbh", nm: "Stýfður boðháttur", q: "stýfður boðháttur",
    keys: ["stýfður boðháttur", "stýfðum boðhætti", "stýfður", "BH-ST"],
    ds: "Stutt, fornleg mynd boðháttar án endingar: **kom** í stað *komdu*, **far** í stað *farðu*. Hún sést nánast eingöngu í ljóðum og föstum orðasamböndum (*kom þú sæll*) — í nútímamáli er fornafnið *þú* skeytt aftan við: *komdu*, *farðu*." },
  { id: "nafnhattur", nm: "Nafnháttur", q: "nafnháttur", keys: ["nafnháttur", "nafnhætti", "NH"],
    ds: "Óbeygða myndin sem stendur með *að*: *að **lesa***. Þetta er sú mynd sem flett er upp í orðabók." },
  { id: "lhnt", nm: "Lýsingarháttur nútíðar", q: "lýsingarháttur nútíðar",
    keys: ["lýsingarháttur nútíðar", "lýsingarhætti nútíðar", "LHNT"],
    ds: "Sagnmynd sem endar á **-andi**: *hlaupandi*, *lesandi*." },
  { id: "lhtht", nm: "Lýsingarháttur þátíðar", q: "lýsingarháttur þátíðar",
    keys: ["lýsingarháttur þátíðar", "lýsingarhætti þátíðar", "LHÞT"],
    ds: "Sagnmynd sem stendur oftast með *vera* eða *verða* og beygist eins og lýsingarorð, í kyni, tölu og falli: *bókin er **lesin***, *bréfin voru **skrifuð***. Með *hafa* stendur hins vegar sagnbót, sem beygist ekki: *ég hef lesið*." },
  { id: "sagnbot", nm: "Sagnbót", q: "sagnbót", keys: ["sagnbót", "sagnbótar", "SAGNB"],
    ds: "Óbeygjanleg sagnmynd sem stendur með **hafa**: *ég hef **lesið***, *hann hefur **farið***. Hún breytist ekki eftir kyni eða tölu — það greinir hana frá lýsingarhætti þátíðar." },
  { id: "nutid", nm: "Nútíð", q: "nútíð", keys: ["nútíð", "nútíðar", "NT"],
    ds: "Það sem er að gerast núna eða gerist alltaf: *ég **les***." },
  { id: "thatid", nm: "Þátíð", q: "þátíð", keys: ["þátíð", "þátíðar", "ÞT"],
    ds: "Það sem var: *ég **las***. Þátíðin sýnir líka hvort sögnin er sterk eða veik." },
  { id: "sterksogn", nm: "Sterk sögn", q: "sterk sögn",
    keys: ["sterk sögn", "sterkri sögn", "sterk beyging sagnar", "sterkar sagnir", "sterkra sagna"],
    ds: "Sterk sögn myndar þátíð með því að **breyta sérhljóði stofnsins** og fær enga -ði/-di/-ti endingu: *taka → **tók***, *bíta → **beit***." },
  { id: "veiksogn", nm: "Veik sögn", q: "veik sögn",
    keys: ["veik sögn", "veikri sögn", "veik beyging sagnar", "veikar sagnir", "veikra sagna"],
    ds: "Veik sögn myndar þátíð með **endingu**, *-aði*, *-ði*, *-di* eða *-ti*: *kalla → **kallaði***, *heyra → **heyrði***, *kenna → **kenndi***, *kaupa → **keypti***." },
  /* v6.13 review (S4): nouns and verbs have a strong and a weak declension
     too. Until then "sterk" in "Er beygingin sterk eða veik?" (Sterkt eða
     veikt nafnorð?) opened "Sterk beyging lýsingarorðs". The phrases that
     name the word class resolve here everywhere; the bare words (*sterk*,
     *veik*, *beygingin*) by the subject being shown (`setGlossContext`). */
  { id: "sterknafnord", nm: "Sterkt nafnorð", q: "sterk beyging nafnorða",
    keys: ["sterkt nafnorð", "sterk nafnorð", "sterkra nafnorða", "sterk beyging nafnorða",
      "sterka beygingu nafnorða", "sterkbeygt nafnorð"],
    ds: "Nafnorð beygist sterkt ef eignarfall eintölu endar á **samhljóði**, oftast *-s* eða *-ar*: til *hests*, til *vinar*, til *bókar*, til *húss*." },
  { id: "veiknafnord", nm: "Veikt nafnorð", q: "veik beyging nafnorða",
    keys: ["veikt nafnorð", "veik nafnorð", "veikra nafnorða", "veik beyging nafnorða",
      "veika beygingu nafnorða", "veikbeygt nafnorð"],
    ds: "Nafnorð beygist veikt ef það endar á **sérhljóði** í öllum föllum eintölu: *pabbi*, um *pabba*, frá *pabba*, til *pabba*." },
  { id: "beyging_no", nm: "Beyging nafnorða", q: "beyging nafnorða",
    keys: ["beyging nafnorða", "beygingu nafnorða"],
    ds: "Nafnorð beygjast annaðhvort **sterkt** eða **veikt**. Skoðaðu eignarfall eintölu: endar það á samhljóði (til *hests*) er beygingin sterk, en endar orðið á sérhljóði í öllum föllum eintölu (til *pabba*) er hún veik." },
  { id: "beyging_so", nm: "Beyging sagna", q: "beyging sagna",
    keys: ["beyging sagna", "beygingu sagna"],
    ds: "Sagnir skiptast í **sterkar** og **veikar** eftir því hvernig þær mynda þátíð. Veik sögn fær endingu, *-aði*, *-ði*, *-di* eða *-ti* (*kalla – kallaði*); sterk sögn breytir sérhljóði stofnsins (*taka – tók*)." },
  { id: "opersonuleg", nm: "Ópersónuleg sögn", q: "ópersónuleg sögn",
    keys: ["ópersónuleg", "ópersónuleg sögn", "ópersónulegar sagnir"],
    ds: "Sögn sem hefur ekkert frumlag í nefnifalli. Frumlagið stendur þá í þolfalli eða þágufalli: **mig** langar, **mér** finnst." },
  { id: "personuleg", nm: "Persónuleg sögn", q: "persónuleg sögn",
    keys: ["persónuleg sögn", "persónulegar sagnir"],
    ds: "Venjuleg sögn með frumlag í nefnifalli: **ég** les, **hann** hleypur." },
  { id: "persona", nm: "Persóna", q: "persóna",
    keys: ["persóna", "persónu", "1. persóna", "2. persóna", "3. persóna"],
    ds: "Sögnin beygist eftir því hver talar: 1. persóna *ég/við*, 2. persóna *þú/þið*, 3. persóna *hann, hún, það, þeir*." },
  { id: "frumlag", nm: "Frumlag", q: "frumlag", keys: ["frumlag", "frumlagi", "frumlags"],
    ds: "Sá eða það sem sögnin á við — oftast sá sem gerir eitthvað. Stendur venjulega í nefnifalli: **Strákurinn** gleymdi töskunni." },
  { id: "umsogn", nm: "Umsögn", q: "umsögn", keys: ["umsögn", "umsögnin", "umsagnar"],
    ds: "Sögnin sjálf, sá hluti setningarinnar sem segir hvað gerist: Strákurinn **gleymdi** töskunni." },
  { id: "andlag", nm: "Andlag", q: "andlag", keys: ["andlag", "andlagi", "andlagið", "beina andlagið", "óbeina andlagið"],
    ds: "Það sem verknaðurinn lendir á. Sögnin ræður fallinu: Strákurinn gleymdi **töskunni**. Sumar sagnir taka tvö andlög — *gefa **honum** **bókina***." },
  { id: "sagnfylling", nm: "Sagnfylling", q: "sagnfylling", keys: ["sagnfylling", "sagnfyllingu"],
    ds: "Orð sem fyllir upp í merkingu sagnarinnar *vera* eða *verða* og stendur í nefnifalli: hann er **kennari**." },
  { id: "adalsetning", nm: "Aðalsetning", q: "aðalsetning", keys: ["aðalsetning", "aðalsetningu", "aðalsetningar"],
    ds: "Setning sem getur staðið ein og sér: *Ég las bókina.*" },
  { id: "aukasetning", nm: "Aukasetning", q: "aukasetning", keys: ["aukasetning", "aukasetningu", "aukasetningar"],
    ds: "Setning sem stendur ekki ein heldur hangir á aðalsetningu, oft með *að*, *sem*, *þegar*: Ég las bókina **þegar ég kom heim**." },
  { id: "stjorn", nm: "Fallstjórn", q: "fallstjórn",
    keys: ["stýrir", "stýra", "fallstjórn", "stjórnar falli"],
    ds: "Sumar sagnir og allar forsetningar **ákveða** í hvaða falli næsta orð stendur. Það kallast að stýra falli: *hjálpa* stýrir þágufalli, svo það heitir *hjálpa **vininum***, ekki *hjálpa vininn*." },
  { id: "ordflokkur", nm: "Orðflokkur", q: "orðflokkur",
    keys: ["orðflokkur", "orðflokki", "orðflokkar", "orðflokkana", "orðflokkanna"],
    ds: "Öll íslensk orð skiptast í ellefu orðflokka. Fimm þeirra eru **fallorð** (nafnorð, lýsingarorð, greinir, töluorð, fornöfn), sagnorð eru sér, og fimm flokkar eru **óbeygjanlegir**." },
  { id: "fallord", nm: "Fallorð", q: "fallorð", keys: ["fallorð", "fallorðum"],
    ds: "Orðflokkarnir sem beygjast í föllum: nafnorð, lýsingarorð, greinir, töluorð og fornöfn." },
  { id: "obeygjanleg", nm: "Óbeygjanleg orð", q: "óbeygjanleg orð",
    keys: ["óbeygjanleg orð", "óbeygjanlegt", "óbeygjanlegur"],
    ds: "Orð sem beygjast ekki: atviksorð, forsetningar, samtengingar, upphrópanir og nafnháttarmerkið *að*. Sum atviksorð stigbreytast þó: *oft – oftar – oftast*." },
  { id: "kennifoll", nm: "Kenniföll", q: "kenniföll", keys: ["kenniföll", "kennifall", "kennifalla"],
    ds: "Þrjár myndir sem duga til að þekkja beygingu nafnorðs: nefnifall eintölu, eignarfall eintölu og nefnifall fleirtölu — *hestur, hests, hestar*." },
  { id: "stofn", nm: "Stofn", q: "stofn", keys: ["stofn", "stofni", "stofninn"],
    ds: "Sá hluti orðsins sem stendur eftir þegar beygingarendingin er tekin af. Stofn sterkra nafnorða sést í þolfalli eintölu: *hestur* → um **hest**. Stofn sagna sést í nafnhætti þegar *-a* er tekið aftan af: *kalla* → **kall-**." },
  { id: "nafnord", nm: "Nafnorð", q: "nafnorð", keys: ["nafnorð", "nafnorði", "nafnorðið", "nafnorðinu"],
    ds: "Orð yfir hluti, fólk, dýr og hugtök. Hafa fast kyn og beygjast í föllum, tölu og með eða án greinis." },
  { id: "lysingarord", nm: "Lýsingarorð", q: "lýsingarorð", keys: ["lýsingarorð", "lýsingarorði", "lýsingarorðið", "lýsingarorðinu"],
    ds: "Orð sem lýsir nafnorði og **samræmist** því í kyni, tölu og falli: *stór hestur*, *stóra konan*." },
  { id: "sagnord", nm: "Sagnorð", q: "sagnorð", keys: ["sagnorð", "sagnorði", "sögnin", "sögnina", "sagnir"],
    ds: "Orð sem segir hvað gerist. Beygist í persónu, tölu, tíð, hætti og mynd." },
  { id: "fornafn", nm: "Fornafn", q: "fornafn", keys: ["fornafn", "fornafni", "fornöfn", "ábendingarfornafn", "ábendingarfornafnið"],
    ds: "Orð sem stendur í stað nafnorðs: *ég, þú, hann, þessi, minn, hver*. Fornöfn skiptast í undirflokka eftir hlutverki." },
  { id: "toluord", nm: "Töluorð", q: "töluorð", keys: ["töluorð", "töluorði", "frumtala", "raðtala", "frumtölur", "raðtölur"],
    ds: "Orð um fjölda eða röð. **Frumtölur** eru *einn, tveir, þrír*; **raðtölur** eru *fyrsti, annar, þriðji*. Fjórar fyrstu frumtölurnar beygjast." },
  { id: "atviksord", nm: "Atviksorð", q: "atviksorð", keys: ["atviksorð", "atviksorði"],
    ds: "Óbeygjanlegt orð sem segir nánar til um sögn, lýsingarorð eða annað atviksorð — hvar, hvenær eða hvernig: *hér*, *mjög*, *aldrei*, *heima*." },
  { id: "forsetning", nm: "Forsetning", q: "forsetning", keys: ["forsetning", "forsetningin", "forsetningar", "forsetningin"],
    ds: "Lítið óbeygjanlegt orð sem stendur á undan fallorði og **stýrir falli** þess: *í skólann*, *frá skólanum*." },
  { id: "samtenging", nm: "Samtenging", q: "samtenging", keys: ["samtenging", "samtengingin", "samtengingar"],
    ds: "Orð sem tengir saman orð eða setningar: *og*, *en*, *að*, *þegar*, *af því að*." },
  { id: "upphropun", nm: "Upphrópun", q: "upphrópun", keys: ["upphrópun", "upphrópanir"],
    ds: "Orð sem stendur eitt og lýsir viðbrögðum: *ó!*, *já*, *nei*, *takk*." },
  { id: "nhm", nm: "Nafnháttarmerki", q: "nafnháttarmerki", keys: ["nafnháttarmerki", "nafnháttarmerkið"],
    ds: "Orðið **að** þegar það stendur beint á undan sögn í nafnhætti: *að lesa*. Það er sér orðflokkur." },
  { id: "karlkyn", nm: "Karlkyn", q: "karlkyn", keys: ["karlkyn", "karlkyns", "karlkyni"],
    ds: "Eitt af þremur kynjum nafnorða. Karlkynsorð taka *hann*: **hesturinn** — hann." },
  { id: "kvenkyn", nm: "Kvenkyn", q: "kvenkyn", keys: ["kvenkyn", "kvenkyns", "kvenkyni"],
    ds: "Kvenkynsorð taka *hún*: **bókin** — hún." },
  { id: "hvorugkyn", nm: "Hvorugkyn", q: "hvorugkyn", keys: ["hvorugkyn", "hvorugkyns", "hvorugkyni"],
    ds: "Hvorugkynsorð taka *það*: **barnið** — það." },
  { id: "kyn", nm: "Kyn", q: "kyn", keys: ["kyn", "kyni", "kynið"],
    ds: "Hvert nafnorð hefur fast kyn — karlkyn, kvenkyn eða hvorugkyn — og lýsingarorð og fornöfn taka sama kyn og nafnorðið sem þau standa með." },
  /* The row labels in "analyse the inflected form" were the only text in the
     program without an explanation: the child was asked about "Beygingu" and
     "Hátt" with nothing saying what those were. Each of them has a term here,
     and the renderer links the row label directly. */
  { id: "tala", nm: "Tala", q: "tala (málfræði)", keys: ["tala", "tölu", "talan"],
    ds: "Hvort orðið á við eitt eða fleira: **eintala** *hestur*, **fleirtala** *hestar*. Nafnorð, lýsingarorð, fornöfn, greinir og sagnir beygjast öll í tölu." },
  { id: "beyging", nm: "Beyging", q: "beyging",
    keys: ["beyging", "beygingu", "beygingin", "beygingar", "beygingarmynd", "beygð mynd", "beygðu myndina"],
    ds: "Þegar orð breytir um form eftir hlutverki sínu í setningunni. Í þessari spurningu er spurt hvort lýsingarorðið sé **sterkbeygt** (*grænn hestur*, án greinis) eða **veikbeygt** (*græni hesturinn*, með greini)." },
  { id: "hattur", nm: "Háttur", q: "háttur sagna", keys: ["háttur", "hætti", "háttar", "hættir"],
    ds: "Háttur sagnar segir *hvernig* verknaðurinn er settur fram: **framsöguháttur** um það sem er (*ég les*), **viðtengingarháttur** um óvissu eða ósk (*ef ég læsi*), **boðháttur** um skipun (*lestu!*) og **nafnháttur** grunnmyndin (*að lesa*)." },
  { id: "mynd", nm: "Mynd", q: "mynd sagna", keys: ["mynd sagnar", "myndin"],
    ds: "Sagnir hafa þrjár myndir. **Germynd** er venjulega myndin (*hann klæðir barnið*) og **miðmynd** endar á -st (*hann klæðist*). Þriðja myndin, **þolmynd**, er mynduð með hjálparsögn og lýsingarhætti þátíðar (*barnið var klætt*); hér er aðeins spurt um hinar tvær." },
  { id: "tid", nm: "Tíð", q: "tíð sagna", keys: ["tíð", "tíðin", "tíðar"],
    ds: "Hvort sögnin á við það sem er eða það sem var: **nútíð** *ég les*, **þátíð** *ég las*. Íslenska hefur aðeins þessar tvær einföldu tíðir; framtíð er sögð með hjálparsögn eða nútíð." },
  { id: "samraemi", nm: "Samræmi", q: "samræmi", keys: ["samræmist", "samræmi", "samræmast"],
    ds: "Lýsingarorð, greinir og fornöfn taka sama kyn, tölu og fall og nafnorðið sem þau standa með." },
];

const byId = new Map(TERMS.map((t) => [t.id, t]));
export const term = (id) => byId.get(id) || null;

/* ---------- skammstafanir ------------------------------------------------

   Skammstafanir eru meðhöndlaðar sér, af tveimur ástæðum.

   Sú fyrri: þær má ekki leita að án tillits til stafstærðar. "ef" er íslenskt
   samtengingarorð og kemur fyrir í næstum hverri skýringu; ef það yrði tengt
   við eignarfall myndi hver "ef" í textanum fá ranga skýringu. Stórar
   skammstafanir (NF, ÞGF, GM, LHÞT) eru hins vegar ótvíræðar í lesmáli.

   Sú síðari: litlu skammstafanirnar (kk, so, lo) birtast aðeins á stöðum sem
   birtirinn ræður sjálfur — merkingin við hvert lemma, raðheiti í hitakorti,
   valmöguleikar í greiningu. Þar er réttara að setja tengilinn beint með
   `abbr()` en að reyna að finna textann eftir á.                          */

export const ABBR = {
  NF: "nefnifall", ÞF: "tholfall", ÞGF: "thagufall", ÞG: "thagufall", EF: "eignarfall",
  nf: "nefnifall", þf: "tholfall", þgf: "thagufall", ef: "eignarfall",
  ET: "eintala", FT: "fleirtala", et: "eintala", ft: "fleirtala",
  KK: "karlkyn", KVK: "kvenkyn", HK: "hvorugkyn",
  kk: "karlkyn", kvk: "kvenkyn", hk: "hvorugkyn",
  GM: "germynd", MM: "midmynd",
  FH: "framsoguhattur", VH: "vidtengingarhattur", BH: "bodhattur", NH: "nafnhattur",
  NT: "nutid", ÞT: "thatid",
  LHNT: "lhnt", LHÞT: "lhtht", SAGNB: "sagnbot",
  FSB: "frumstig", FVB: "frumstig", MST: "midstig", MSTSB: "midstig",
  ESB: "efstastig", EVB: "efstastig",
  SB: "sterkbeyging", VB: "veikbeyging",
  sterk: "sterkbeyging", veik: "veikbeyging",
  no: "nafnord", lo: "lysingarord", so: "sagnord", fn: "fornafn", pfn: "fornafn",
  gr: "greinir", to: "toluord", rt: "toluord", ao: "atviksord", fs: "forsetning",
  st: "samtenging", uh: "upphropun", nhm: "nhm",
  "1P": "persona", "2P": "persona", "3P": "persona",
};

/* Upper-case abbreviations are safe to find in running text — case matters. */
const CASE_SENSITIVE_ABBR = [
  "LHÞT", "LHNT", "SAGNB", "MSTSB", "ÞGF", "FSB", "FVB", "MST", "ESB", "EVB",
  "NF", "ÞF", "ÞG", "EF", "ET", "FT", "KVK", "KK", "HK", "GM", "MM",
  "FH", "VH", "BH", "NH", "NT", "ÞT", "SB", "VB",
];

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* ---------- the subject being shown (v6.13 review, S4) ------------------

   *sterk*, *veik* and *beyging* mean one thing beside an adjective, another
   beside a noun and a third beside a verb. On a page or a question of
   nafnorð or sagnorð these bare words open that word class's entry; with
   no subject (or any other) they open the adjective's, as before. A phrase
   that names the class itself ("sterk beyging lýsingarorðs", "sterk sögn")
   is longer and wins wherever it stands. The task and Lesefni renderers set
   the subject (ui/render.js `renderTask`, ui/live.js, ui/lessons.js). */
const BEYGING_FORMS = ["beyging", "beygingu", "beygingin", "beygingar", "beyginguna", "beygingunni"];
export const GLOSS_CONTEXT = {
  nafnord: {
    sterk: "sterknafnord", veik: "veiknafnord", sterkt: "sterknafnord", veikt: "veiknafnord",
    "sterk beyging": "sterknafnord", "veik beyging": "veiknafnord",
    "sterka beygingu": "sterknafnord", "veika beygingu": "veiknafnord",
    "sterkri beygingu": "sterknafnord", "veikri beygingu": "veiknafnord",
    "sterkrar beygingar": "sterknafnord", "veikrar beygingar": "veiknafnord",
    sterkbeygt: "sterknafnord", veikbeygt: "veiknafnord",
    ...Object.fromEntries(BEYGING_FORMS.map((k) => [k, "beyging_no"])),
  },
  sagnord: {
    sterk: "sterksogn", veik: "veiksogn", sterkar: "sterksogn", veikar: "veiksogn",
    "sterk beyging": "sterksogn", "veik beyging": "veiksogn",
    "sterka beygingu": "sterksogn", "veika beygingu": "veiksogn",
    ...Object.fromEntries(BEYGING_FORMS.map((k) => [k, "beyging_so"])),
  },
};
let CONTEXT = null;
/** The subject (a skill id) whose meaning the bare words take; null: none. */
export function setGlossContext(skill) {
  CONTEXT = GLOSS_CONTEXT[skill] ? skill : null;
}

/* Lengri lyklar fyrst svo "veika beygingu" vinni yfir "beygingu". The words
   only a subject gives a meaning (*sterkt*, *sterkar*) are found too, and
   left alone where no subject claims them. */
const ALL_KEYS = [
  ...TERMS.flatMap((t) => t.keys.map((k) => ({ k, id: t.id }))),
  ...Object.values(GLOSS_CONTEXT).flatMap((m) => Object.keys(m).map((k) => ({ k, id: null }))),
]
  .filter((x) => !CASE_SENSITIVE_ABBR.includes(x.k))
  .filter((x, i, a) => a.findIndex((y) => y.k.toLowerCase() === x.k.toLowerCase()) === i || x.id)
  .sort((a, b) => b.k.length - a.k.length);

/* No lookbehind: `(?<![\\p{L}])` throws at construction on Safari before
 * 16.4 (iPadOS 15 and earlier) and the whole script died on line one. The
 * preceding character is consumed instead and `collect()` adds its length
 * back to the offset; the trailing guard stays a lookahead, so two terms
 * separated by one space still both match. `tests/browsers.test.js` asserts
 * no lookbehind exists under src/. */
const NOT_LETTER_BEFORE = "(^|[^\\p{L}])";

const KEY_RE = new RegExp(
  NOT_LETTER_BEFORE + "(" + ALL_KEYS.map((x) => escRe(x.k)).join("|") + ")(?![\\p{L}])",
  "giu"
);
const KEY_LOOKUP = new Map(ALL_KEYS.filter((x) => x.id).map((x) => [x.k.toLowerCase(), x.id]));

const ABBR_RE = new RegExp(
  NOT_LETTER_BEFORE + "(" + CASE_SENSITIVE_ABBR.map(escRe).join("|") + ")(?![\\p{L}])",
  "gu"
);

const trigger = (id, text) =>
  `<span class="gl" data-gl="${id}" tabindex="0" role="button">${text}</span>`;

/**
 * Wrap a known abbreviation in a hover trigger explicitly. Used where the
 * renderer already knows the term — class tags, table headings, option labels —
 * so no text guessing is involved.
 */
export function abbr(text, id = null) {
  const termId = id || ABBR[text];
  if (!termId || !byId.has(termId)) return text;
  return trigger(termId, text);
}

/**
 * Wrap every known grammatical term in already-escaped HTML with a hover
 * trigger. One pass, so inserted markup is never rescanned.
 */
export function glossify(html) {
  if (!html) return html;
  const src = String(html);
  const hits = [];

  /* `m[1]` is the character before the term (empty at the start of the string)
     and `m[2]` is the term itself — see the note on NOT_LETTER_BEFORE above.
     The offset has to skip that leading character, or every trigger would be
     wrapped one character too early and eat the space in front of it. */
  const collect = (re, resolve) => {
    for (const m of src.matchAll(re)) {
      const text = m[2];
      const at = m.index + m[1].length;
      const id = resolve(text);
      if (!id || !byId.has(id)) continue;
      /* not inside an html tag */
      const before = src.slice(0, at);
      if (before.lastIndexOf("<") > before.lastIndexOf(">")) continue;
      hits.push({ at, len: text.length, text, id });
    }
  };
  const ctx = CONTEXT ? GLOSS_CONTEXT[CONTEXT] : null;
  collect(KEY_RE, (t) => (ctx && ctx[t.toLowerCase()]) || KEY_LOOKUP.get(t.toLowerCase()));
  collect(ABBR_RE, (t) => ABBR[t]);

  /* The longest match wins when two overlap. */
  hits.sort((a, b) => a.at - b.at || b.len - a.len);
  let out = "", last = 0;
  for (const h of hits) {
    if (h.at < last) continue;
    out += src.slice(last, h.at) + trigger(h.id, h.text);
    last = h.at + h.len;
  }
  return out + src.slice(last);
}

/**
 * Render a raw BÍN mark ("ÞGFETgr", "GM-FH-ÞT-3P-ET") with every component
 * separately explained. The mark is what BÍN actually says, so it stays
 * visible verbatim; the hover is what makes it readable for the child.
 */
export function markHTML(mark) {
  if (!mark) return "";
  return String(mark).split("-").map((part) => {
    const m = /^(NF|ÞGF|ÞF|EF)(ET|FT)(gr)?$/.exec(part);
    if (m) {
      return [abbr(m[1]), abbr(m[2]), m[3] ? abbr("gr", "greinir") : ""]
        .filter(Boolean).join("");
    }
    return abbr(part);
  }).join("<span class=\"mkdash\">-</span>");
}
