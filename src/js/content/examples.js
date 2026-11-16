/* Worked examples — one per question type (critique item 41).

   The first time a pupil meets a type of question, its card opens with one
   example done for them: what the question looks like, the answer, and how
   to get there. After that the type comes without it (core/examples.js
   keeps which types a pupil has met).

   Each example:
     q      the question, as short as the card puts it (*italic*, **bold**)
     a      the answer
     how    how to find it, in one or two sentences — the method, not only
            the rule
     forms  every inflected form the example states, as
            "lemma|class|BÍN mark=form". tests/examples.test.js looks each up
            in the lexicon (BÍN), so an example cannot show a form the
            questions would mark wrong. Closed-class words that the lexicon
            does not carry (sig, the conjunctions) are not listed.

   Wherever possible the sentences are the ones the Lesefni pages already use
   (content/lessons.js), so the example and the page say the same thing. */

export const EXAMPLES = {
  /* ---- Nafnorð ---- */
  fill: {
    q: "Ég klappa ___. Orðið er *hestur*. Beygingarmynd: þágufall, eintala, með greini.",
    a: "hestinum",
    how: "Hjálparorðið fyrir þágufall er *frá*: frá *hesti*. Með greini verður það *hestinum*.",
    forms: ["hestur|kk|ÞGFET=hesti", "hestur|kk|ÞGFETgr=hestinum"],
  },
  no_val: {
    q: "Strákurinn gleymdi ___. Veldu: *taskan · töskuna · töskunni · töskunnar*",
    a: "töskunni",
    how: "Spyrðu: Strákurinn gleymdi **hverju**? *Hverju* er þágufall, því sögnin *gleyma* stýrir þágufalli.",
    forms: ["taska|kvk|NFETgr=taskan", "taska|kvk|ÞFETgr=töskuna", "taska|kvk|ÞGFETgr=töskunni",
      "taska|kvk|EFETgr=töskunnar"],
  },
  tbl_no: {
    q: "Beygðu *hestur* í eintölu án greinis.",
    a: "hestur · hest · hesti · hests",
    how: "Settu hjálparorðin fyrir framan: hér er *hestur*, um *hest*, frá *hesti*, til *hests*.",
    forms: ["hestur|kk|NFET=hestur", "hestur|kk|ÞFET=hest", "hestur|kk|ÞGFET=hesti", "hestur|kk|EFET=hests"],
  },
  no_beyging: {
    q: "Er *hestur* sterkt eða veikt nafnorð? Eignarfall eintölu er *til hests*.",
    a: "sterkt",
    how: "Eignarfall eintölu endar á samhljóði (*-s*), og þá er beygingin sterk. Endi það á sérhljóði, eins og *til pabba*, er hún veik.",
    forms: ["hestur|kk|EFET=hests", "pabbi|kk|EFET=pabba"],
  },

  /* ---- Lýsingarorð ---- */
  revform: {
    q: "Greindu myndina *hestum* (af *hestur*).",
    a: "þágufall, fleirtala, án greinis",
    how: "Þágufall fleirtölu endar á *-um*: frá *hestum*. Með greini væri það *hestunum*.",
    forms: ["hestur|kk|ÞGFFT=hestum", "hestur|kk|ÞGFFTgr=hestunum"],
  },
  tbl_lo: {
    q: "Beygðu *stór* með *hestur*: karlkyn, eintala, sterk beyging.",
    a: "stór hestur · stóran hest · stórum hesti · stórs hests",
    how: "Lýsingarorðið fer í sama fall og nafnorðið. Notaðu hjálparorðin: hér er *stór hestur*, um *stóran hest*, frá *stórum hesti*, til *stórs hests*.",
    forms: ["stór|lo|FSB-KK-NFET=stór", "stór|lo|FSB-KK-ÞFET=stóran", "stór|lo|FSB-KK-ÞGFET=stórum",
      "stór|lo|FSB-KK-EFET=stórs"],
  },
  lo_beyging: {
    q: "___ bókin er á borðinu. (*stór*, frumstig)",
    a: "Stóra",
    how: "Nafnorðið *bókin* hefur greini. Þá fær lýsingarorðið veika beygingu: *stóra bókin*. Án greinis væri það sterkt: *stór bók*.",
    forms: ["stór|lo|FVB-KVK-NFET=stóra", "stór|lo|FSB-KVK-NFET=stór"],
  },
  lo_stig: {
    q: "Anna er ___ en bróðir hennar. (*gamall*, miðstig)",
    a: "eldri",
    how: "*en* ber saman tvo, og þá er notað miðstig. *gamall* stigbreytist óreglulega: *gamall, eldri, elstur*.",
    forms: ["gamall|lo|MST-KVK-NFET=eldri", "gamall|lo|ESB-KK-NFET=elstur"],
  },
  lo_samr: {
    q: "Hún býr í ___ húsi. (*rauður*)",
    a: "rauðu",
    how: "Lýsingarorðið lagar sig að *húsi*: hvorugkyn, eintala, þágufall. Þess vegna *í rauðu húsi*.",
    forms: ["rauður|lo|FSB-HK-ÞGFET=rauðu", "hús|hk|ÞGFET=húsi"],
  },

  /* ---- Fornöfn ---- */
  tbl_fn: {
    q: "Beygðu *hún* í öllum föllum.",
    a: "hún · hana · henni · hennar",
    how: "Hjálparorðin duga hér líka: hér er *hún*, um *hana*, frá *henni*, til *hennar*.",
    forms: ["hún|pfn|NFET=hún", "hún|pfn|ÞFET=hana", "hún|pfn|ÞGFET=henni", "hún|pfn|EFET=hennar"],
  },
  fn_eyda: {
    q: "Ég gaf ___ bókina. (*hún*)",
    a: "henni",
    how: "*Að gefa einhverjum eitthvað*: sá sem fær stendur í þágufalli. Þágufall af *hún* er *henni*.",
    forms: ["hún|pfn|ÞGFET=henni"],
  },
  fn_stad: {
    q: "Ég klappa **hestinum**. Settu persónufornafn í stað nafnorðsins.",
    a: "honum",
    how: "*hestinum* er karlkyn, eintala, þágufall. Fornafnið fær sama kyn, tölu og fall: *Ég klappa honum*.",
    forms: ["hestur|kk|ÞGFETgr=hestinum", "hann|pfn|ÞGFET=honum"],
  },
  fn_aftur: {
    q: "Hann meiddi ___. Veldu: *sig* eða *hann*",
    a: "sig",
    how: "Sá sem meiddist er sá sami og frumlagið. Þá er notað afturbeygt fornafn: *Hann meiddi sig*. Með *hann* væri átt við einhvern annan.",
    forms: [],
  },
  fn_flokkar: {
    q: "Hvers konar fornafn er *mín* í *bókin mín*?",
    a: "eignarfornafn",
    how: "*mín* er mynd af *minn* og sýnir hver á bókina. Eignarfornöfnin eru *minn, þinn, sinn*, og þau samræmast nafnorðinu.",
    forms: ["minn|fn|KVK-NFET=mín"],
  },

  /* ---- Töluorð ---- */
  tbl_to: {
    q: "Beygðu *tveir* í karlkyni.",
    a: "tveir · tvo · tveimur · tveggja",
    how: "Hugsaðu þér nafnorð með: hér eru *tveir* hestar, um *tvo* hesta, frá *tveimur* hestum, til *tveggja* hesta.",
    forms: ["tveir|to|KK-NFFT=tveir", "tveir|to|KK-ÞFFT=tvo", "tveir|to|KK-ÞGFFT=tveimur",
      "tveir|to|KK-EFFT=tveggja", "hestur|kk|NFFT=hestar", "hestur|kk|ÞFFT=hesta", "hestur|kk|ÞGFFT=hestum",
      "hestur|kk|EFFT=hesta"],
  },
  to_samr: {
    q: "Ég á ___ systur. (2)",
    a: "tvær",
    how: "*systur* er hér kvenkyn, fleirtala, þolfall (ég á hvað?). Töluorðið fær sama kyn, tölu og fall: *tvær*.",
    forms: ["tveir|to|KVK-ÞFFT=tvær", "systir|kvk|ÞFFT=systur"],
  },
  to_val: {
    q: "Ég á ___ bræður. Veldu: *tveir · tvo · tveimur · tveggja*",
    a: "tvo",
    how: "*bræður* er hér karlkyn, fleirtala, þolfall: *tvo bræður*.",
    forms: ["tveir|to|KK-ÞFFT=tvo", "bróðir|kk|ÞFFT=bræður"],
  },
  to_dags: {
    q: "Ég á afmæli ___ maí. (3.)",
    a: "þriðja",
    how: "Dagsetning sem svarar spurningunni *hvenær?* stendur í þolfalli. Raðtalan er í karlkyni, eins og *dagurinn*: *þriðja maí*.",
    forms: ["þriðji|rt|KK-ÞFET=þriðja"],
  },
  to_flt: {
    q: "Ég keypti ___ buxur. (2)",
    a: "tvennar",
    how: "*buxur* er aðeins til í fleirtölu. Með slíkum orðum eru notuð *einir, tvennir, þrennir, fernir*: *tvennar buxur*, ekki *tvær buxur*.",
    forms: [],
  },

  /* ---- Sagnorð ---- */
  verb: {
    q: "við ___ · nútíð, framsöguháttur, germynd · 1. persóna fleirtala. Sögnin er *lesa*.",
    a: "lesum",
    how: "Segðu það í heilli setningu: *Við lesum bók.* Í 1. persónu fleirtölu endar sögnin á *-um*.",
    forms: ["lesa|so|GM-FH-NT-1P-FT=lesum"],
  },
  verbslot: {
    q: "Í gær ___ hún seint. Sögnin er *koma*.",
    a: "kom",
    how: "*Í gær* segir að þetta sé liðið, svo sögnin er í þátíð. Frumlagið *hún* er 3. persóna eintala: *Í gær kom hún seint.*",
    forms: ["koma|so|GM-FH-ÞT-3P-ET=kom"],
  },
  tbl_so: {
    q: "Beygðu *lesa* í nútíð framsöguháttar.",
    a: "ég les · þú lest · hann les · við lesum · þið lesið · þeir lesa",
    how: "Segðu hverja persónu upphátt með fornafninu: *ég les, þú lest, hann les, við lesum, þið lesið, þeir lesa*.",
    forms: ["lesa|so|GM-FH-NT-1P-ET=les", "lesa|so|GM-FH-NT-2P-ET=lest", "lesa|so|GM-FH-NT-3P-ET=les",
      "lesa|so|GM-FH-NT-1P-FT=lesum", "lesa|so|GM-FH-NT-2P-FT=lesið", "lesa|so|GM-FH-NT-3P-FT=lesa"],
  },
  so_beyging: {
    q: "Er *kalla* sterk eða veik sögn? *Í gær kallaði ég.*",
    a: "veik",
    how: "Þátíðin fær endingu: *kall-aði*. Þá er sögnin veik. Sterk sögn fær enga endingu, en sérhljóðið breytist: *taka, tók*.",
    forms: ["kalla|so|GM-FH-ÞT-1P-ET=kallaði", "taka|so|GM-FH-ÞT-1P-ET=tók"],
  },
  so_mynd: {
    q: "Í hvaða mynd er *var byggt* í *Húsið var byggt árið 1950*?",
    a: "þolmynd",
    how: "*vera* með lýsingarhætti þátíðar (*byggt*) er þolmynd. Í germynd er sagt hver gerði það: *Smiðirnir byggðu húsið.*",
    forms: ["byggja|so|LHÞT-SB-HK-NFET=byggt", "byggja|so|GM-FH-ÞT-3P-FT=byggðu"],
  },
  so_bodhattur: {
    q: "Skrifaðu boðhátt, skipun við einn: *koma* (*kom* + *þú* → ?)",
    a: "komdu",
    how: "Fornafnið *þú* festist aftan á sögnina: *kom* + *þú* verður *komdu*. Við fleiri en einn er sagt *komið*.",
    forms: ["koma|so|GM-BH-ET=komdu", "koma|so|GM-BH-FT=komið", "koma|so|GM-BH-ST=kom"],
  },

  /* ---- Óbeygjanleg orð ---- */
  indecl: {
    q: "Ég er **mjög** þreyttur. Í hvaða orðflokki er *mjög*?",
    a: "atviksorð",
    how: "*mjög* segir hversu þreyttur ég er. Það stendur með lýsingarorði og beygist ekki: það er atviksorð.",
    forms: [],
  },
  ob_smella: {
    q: "Smelltu á allar forsetningarnar: *Bókin liggur á borðinu.*",
    a: "á",
    how: "Forsetning stendur með fallorði og ræður falli þess: *á borðinu* (þágufall).",
    forms: ["borð|hk|ÞGFETgr=borðinu"],
  },
  ob_fsao: {
    q: "Flugvélin flaug **yfir**. Er *yfir* forsetning eða atviksorð?",
    a: "atviksorð",
    how: "Ekkert fallorð fylgir *yfir* hér. Í *Fuglinn flaug yfir húsið* væri það forsetning, því þar stýrir það falli á *húsið*.",
    forms: [],
  },
  ob_st: {
    q: "Ég veit ekki ___ hann kemur. Veldu: *ef · hvort · þegar*",
    a: "hvort",
    how: "Þetta er óbein spurning (*Kemur hann?*), og hún hefst á *hvort*. *ef* táknar skilyrði og *þegar* tíma.",
    forms: ["koma|so|GM-FH-NT-3P-ET=kemur"],
  },
  ob_flokka: {
    q: "Flokkaðu undirstrikuðu orðin: Ég er **mjög** þreyttur **og** fer **að** sofa.",
    a: "mjög: atviksorð · og: samtenging · að: nafnháttarmerki",
    how: "*mjög* segir hversu, *og* tengir saman tvo hluta setningarinnar, og *að* á undan nafnhætti (*að sofa*) er nafnháttarmerki.",
    forms: [],
  },

  /* ---- Orðflokkagreining ---- */
  parse: {
    q: "Ég sé **hestinn**. Greindu orðið *hestinn*.",
    a: "nafnorð · karlkyn · eintala · þolfall · með greini",
    how: "Spyrðu: Ég sé **hvern**? *Hvern* er þolfall. *-inn* aftast er viðskeyttur greinir.",
    forms: ["hestur|kk|ÞFETgr=hestinn"],
  },
  gr_smella: {
    q: "Smelltu á öll nafnorðin: *Strákurinn gleymdi töskunni.*",
    a: "Strákurinn, töskunni",
    how: "Nafnorð eru heiti á fólki, dýrum, hlutum og hugtökum. Bæði hafa þau hér viðskeyttan greini.",
    forms: ["strákur|kk|NFETgr=strákurinn", "taska|kvk|ÞGFETgr=töskunni"],
  },
  gr_flokka: {
    q: "Flokkaðu orðin: *hestur · stór · lesa*",
    a: "hestur: nafnorð · stór: lýsingarorð · lesa: sagnorð",
    how: "Prófaðu hvert orð í ramma: *hér er hestur* (nafnorð), *stór hestur* (lýsingarorð lýsir nafnorði), *að lesa* (sögn stendur á eftir *að*).",
    forms: [],
  },

  /* ---- Fallstjórn ---- */
  govern: {
    q: "Kötturinn situr á **borðinu**. Hvaða falli stýrir *á* hér?",
    a: "þágufalli",
    how: "Kötturinn er kyrr á stað: hvar? Þá stýrir *á* þágufalli: *á borðinu*. Ef hann stykki *upp á borðið* væri það hreyfing og þolfall.",
    forms: ["borð|hk|ÞGFETgr=borðinu", "borð|hk|ÞFETgr=borðið"],
  },
  fs_fsno: {
    q: "Ég fékk bréf frá ___. (*amma*)",
    a: "ömmu",
    how: "Forsetningin *frá* stýrir alltaf þágufalli: *frá ömmu*.",
    forms: ["amma|kvk|ÞGFET=ömmu"],
  },
  fs_hreyf: {
    q: "Ég fer í ___. Veldu: *skólann* eða *skólanum*",
    a: "skólann",
    how: "*Ég fer* er hreyfing: hvert? Þá stýrir *í* þolfalli: *í skólann*. Í *Ég er í skólanum* er dvöl og þágufall.",
    forms: ["skóli|kk|ÞFETgr=skólann", "skóli|kk|ÞGFETgr=skólanum"],
  },
  fs_sogn: {
    q: "Ég hjálpa ___. (*kennarinn*)",
    a: "kennaranum",
    how: "Sögnin *hjálpa* stýrir þágufalli. Prófaðu með fornafni: *hjálpa mér*. Þá er það *Ég hjálpa kennaranum.*",
    forms: ["kennari|kk|ÞGFETgr=kennaranum", "ég|pfn|ÞGFET=mér"],
  },
  fs_operson: {
    q: "___ langar í ís. (*ég*)",
    a: "Mig",
    how: "*langa* er ópersónuleg sögn: frumlagið stendur í þolfalli. Rétt er *mig langar*, ekki *mér langar*.",
    forms: ["ég|pfn|ÞFET=mig"],
  },

  /* ---- Orðaforði ---- */
  meaning: {
    q: "Hvað þýðir orðið *hamar*?",
    a: "Hamar er verkfæri sem er notað til að negla nagla.",
    how: "Segðu fyrst hvers konar hlutur þetta er (verkfæri) og svo hvað greinir hann frá öðrum (til að negla nagla). Skrifaðu heila setningu.",
    forms: [],
  },
  or_heiti: {
    q: "Hvaða orð merkir hið gagnstæða við *glaður*? Veldu: *dapur · kátur · stór*",
    a: "dapur",
    how: "Orð með gagnstæða merkingu kallast andheiti. *kátur* er samheiti: það merkir það sama og *glaður*.",
    forms: [],
  },
  or_samhengi: {
    q: "Afi les ___ á morgnana. Veldu: *blaðið · skóinn · stólinn*",
    a: "blaðið",
    how: "Hvað er hægt að lesa? Aðeins *blaðið* passar við sögnina *les*.",
    forms: ["blað|hk|ÞFETgr=blaðið", "skór|kk|ÞFETgr=skóinn", "stóll|kk|ÞFETgr=stólinn"],
  },
  or_myndun: {
    q: "Skrifaðu andheiti orðsins *heppinn*.",
    a: "óheppinn",
    how: "Forskeytið *ó-* snýr merkingunni við: *heppinn, óheppinn*.",
    forms: ["heppinn|lo|FSB-KK-NFET=heppinn", "óheppinn|lo|FSB-KK-NFET=óheppinn"],
  },
  or_utundan: {
    q: "Hvert á ekki heima í hópnum? *hamar · sög · skrúfjárn · epli*",
    a: "epli",
    how: "Finndu það sem þrjú orðanna eiga sameiginlegt: *hamar, sög* og *skrúfjárn* eru verkfæri. *epli* er ávöxtur.",
    forms: [],
  },

  /* ---- Málbeiting ---- */
  villur: {
    q: "Finndu villuna og lagaðu hana: *Ég vill fara heim.*",
    a: "Ég vil fara heim.",
    how: "Með *ég* er sögnin *vil*, með einu *l*. *vill* á við *hann*, *hún* og *það*.",
    forms: ["vilja|so|GM-FH-NT-1P-ET=vil", "vilja|so|GM-FH-NT-3P-ET=vill"],
  },
  smidja: {
    q: "Búðu til setningu úr orðunum: *hundur · fylgja · strákur*",
    a: "Hundurinn fylgir stráknum.",
    how: "Hér er fyrsta orðið frumlag og stendur í nefnifalli. Sögnin lagar sig að því: *fylgir*. Sögnin *fylgja* stýrir þágufalli: *stráknum*.",
    forms: ["hundur|kk|NFETgr=hundurinn", "fylgja|so|GM-FH-NT-3P-ET=fylgir", "strákur|kk|ÞGFETgr=stráknum"],
  },
  umritun: {
    q: "Ég fer í sund. Byrjaðu setninguna á *Á morgun …*",
    a: "Á morgun fer ég í sund.",
    how: "Sögnin sem beygist stendur í öðru sæti. Þegar *á morgun* er komið fremst fer frumlagið aftur fyrir sögnina: *fer ég*.",
    forms: ["fara|so|GM-FH-NT-1P-ET=fer"],
  },
  raeda: {
    q: "Settu í óbeina ræðu: *Hann sagði: „Kötturinn liggur á gólfinu.“*",
    a: "Hann sagði að kötturinn lægi á gólfinu.",
    how: "Gæsalappirnar hverfa og setningin byrjar á *að*. Af því að *sagði* er í þátíð fer sögnin í viðtengingarhátt þátíðar: *liggur* verður *lægi*.",
    forms: ["liggja|so|GM-FH-NT-3P-ET=liggur", "liggja|so|GM-VH-ÞT-3P-ET=lægi"],
  },

  /* ---- Setningafræði ---- */
  syntax: {
    q: "Strákurinn gleymdi töskunni. Smelltu á frumlagið.",
    a: "Strákurinn",
    how: "Finndu sögnina fyrst: *gleymdi*. Spyrðu svo: **hver** gleymdi? *Strákurinn*.",
    forms: ["strákur|kk|NFETgr=strákurinn"],
  },
  setn_hlut: {
    q: "Anna las **bókina**. Hvert er hlutverk orðsins *bókina*?",
    a: "andlag",
    how: "Spyrðu: Anna las **hvað**? *bókina*. Það sem sögnin beinist að er andlag.",
    forms: ["bók|kvk|ÞFETgr=bókina"],
  },
  setn_flokka: {
    q: "Flokkaðu: **Hún** **er** **læknir**.",
    a: "Hún: frumlag · er: umsögn · læknir: sagnfylling",
    how: "*er* er sögnin, umsögnin. Hver er læknir? *Hún*, frumlagið. *vera* tengir frumlagið við orð sem segir hvað það er: *læknir* er sagnfylling og stendur í nefnifalli.",
    forms: [],
  },
  setn_lidir: {
    q: "Bókin liggur **á borðinu**. Hvers konar liður er undirstrikaði hlutinn?",
    a: "forsetningarliður",
    how: "Liðurinn byrjar á forsetningunni *á*, og hún ræður falli orðsins *borðinu*.",
    forms: ["borð|hk|ÞGFETgr=borðinu"],
  },
  lid_finna: {
    q: "Smelltu á öll orðin í forsetningarliðnum: *Taskan er undir stóra borðinu.*",
    a: "undir stóra borðinu",
    how: "Forsetningarliður hefst á forsetningu og nær yfir fallorðin sem hún stýrir: *undir* + *stóra borðinu*.",
    forms: ["stór|lo|FVB-HK-ÞGFET=stóra", "borð|hk|ÞGFETgr=borðinu"],
  },

  /* ---- Setningagerðir ---- */
  clause: {
    q: "Ég veit **að þú kemur**. Hvers konar setning er undirstrikaði hlutinn?",
    a: "aukasetning",
    how: "Hún byrjar á samtengingunni *að* og getur ekki staðið ein. Hún er hluti af aðalsetningunni *Ég veit …*",
    forms: ["koma|so|GM-FH-NT-2P-ET=kemur"],
  },
  gerd_finna: {
    q: "Smelltu á öll orðin í aukasetningunni: *Við förum heim þegar æfingin er búin.*",
    a: "þegar æfingin er búin",
    how: "Aukasetningin hefst á samtengingunni *þegar* og nær til enda: hún segir hvenær við förum heim.",
    forms: [],
  },
  gerd_upphaf: {
    q: "Á hvaða orði hefst aukasetningin? *Stelpan sem býr hér er vinkona mín.*",
    a: "sem",
    how: "Aukasetningar hefjast oftast á samtengingu. Hér stendur *sem býr hér* inni í aðalsetningunni *Stelpan er vinkona mín*.",
    forms: [],
  },
  gerd_tegund: {
    q: "Kakan **sem amma bakaði** var mjög góð. Hvers konar aukasetning er undirstrikaði hlutinn?",
    a: "tilvísunarsetning",
    how: "Hún hefst á *sem* og segir nánar frá nafnorðinu á undan, *kakan*. Það gerir tilvísunarsetning.",
    forms: [],
  },
};
