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
  ob_tengiord: {
    q: "Það var kalt. ___ fór ég í úlpu. Veldu: *af því að · þess vegna · en*",
    a: "þess vegna",
    how: "*Þess vegna* bendir á afleiðinguna, og á eftir því kemur sögnin strax: *þess vegna fór ég*. Á eftir *af því að* og *en* kæmi *ég fór*.",
    forms: [],
  },
  ob_skilja: {
    q: "Óli á hvorki bróður né systur. Hvort á Óli bróður eða systur?",
    a: "hvorugt",
    how: "*Hvorki … né* þýðir: ekki þetta og ekki hitt. Óli á ekki bróður og hann á ekki systur.",
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
  /* The word is not one a pupil can have in learning (*hestur* is not on
     LÍNO-2), so the example never gives a real question away. */
  or_eyda: {
    q: "Á túninu stendur ___. Hvaða orð vantar? Það er eitt af orðunum sem þú ert að læra. Það byrjar á **h**.",
    a: "hestur",
    how: "Hugsaðu um orðin sem þú ert að læra: hvert þeirra passar í eyðuna og byrjar á *h*? Skrifaðu orðið eins og það á að vera í setningunni.",
    forms: ["hestur|kk|NFET=hestur"],
  },
  or_utundan: {
    q: "Hvert á ekki heima í hópnum? *hamar · sög · skrúfjárn · epli*",
    a: "epli",
    how: "Finndu það sem þrjú orðanna eiga sameiginlegt: *hamar, sög* og *skrúfjárn* eru verkfæri. *epli* er ávöxtur.",
    forms: [],
  },
  or_merking: {
    q: "Í hvaða setningu er orðið *hugmynd* notað rétt? *Hugmyndin gelti alla nóttina. · Hún fékk góða hugmynd að afmælisgjöf. · Ég burstaði tennurnar með hugmynd.*",
    a: "Hún fékk góða hugmynd að afmælisgjöf.",
    how: "*Hugmynd* er það sem manni dettur í hug. Hugmynd geltir ekki og enginn burstar tennurnar með henni, svo að í hinum setningunum passar orðið ekki.",
    forms: ["hugmynd|kvk|ÞFET=hugmynd"],
  },
  /* #37: shown only to a pupil whose answers the server reads. *hamar* is
     not on LÍNO-2, so the example gives no real question away. */
  or_eigin: {
    q: "Hvað merkir orðið *hamar*? Segðu það með þínum eigin orðum.",
    a: "Hamar er verkfæri sem maður notar til að negla nagla.",
    how: "Segðu aðalatriðið í merkingunni með þínum orðum, ekki bara orðið sjálft aftur. Þú færð gátlista og eina spurningu og mátt bæta svarið einu sinni.",
    forms: [],
  },
  /* #38: the same, for the graded meaning question and the Orðakort's two
     other free-text steps. Words that are not on LÍNO-2. */
  or_skyring: {
    q: "Hvað þýðir orðið *sög*?",
    a: "Sög er verkfæri með tönnum sem maður notar til að skera spýtur í sundur.",
    how: "Segðu aðalatriðið í merkingunni með þínum orðum. Þú færð gátlista og eina spurningu og mátt bæta svarið einu sinni.",
    forms: [],
  },
  or_setning: {
    q: "Skrifaðu setningu um þitt eigið líf þar sem þú notar orðið *hamar*.",
    a: "Ég notaði hamar þegar ég hjálpaði pabba að smíða fuglahús.",
    how: "Notaðu orðið þannig að merkingin sjáist, og segðu frá einhverju sem þú hefur sjálf eða sjálfur gert eða séð.",
    forms: [],
  },
  or_tengsl: {
    q: "Skrifaðu þrjú orð sem tengjast orðinu *hamar* og segðu hvernig hvert þeirra tengist því.",
    a: "nagli – maður neglir nagla með hamri · sög – annað verkfæri · smiður – sá sem notar hamar í vinnunni",
    how: "Veldu orð sem tengjast merkingu orðsins og segðu við hvert orð hvernig það tengist.",
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
  /* Umritun asks nine kinds of rewrite, and an example of another kind
     than the question confused more than it helped (v6.13 review, S3: the
     first question was indirect speech, the example "Á morgun …"). The
     example is chosen by the question's `kind` (core/examples.js
     `exampleFor`); the one at the top is for any kind not listed. */
  umritun: {
    q: "Ég fer í sund. Byrjaðu setninguna á *Á morgun …*",
    a: "Á morgun fer ég í sund.",
    how: "Sögnin sem beygist stendur í öðru sæti. Þegar *á morgun* er komið fremst fer frumlagið aftur fyrir sögnina: *fer ég*.",
    forms: ["fara|so|GM-FH-NT-1P-ET=fer"],
    byKind: {
      amorgun: {
        q: "Ég fer í sund. Byrjaðu setninguna á *Á morgun …*",
        a: "Á morgun fer ég í sund.",
        how: "Sögnin sem beygist stendur í öðru sæti. Þegar *á morgun* er komið fremst fer frumlagið aftur fyrir sögnina: *fer ég*.",
        forms: ["fara|so|GM-FH-NT-1P-ET=fer"],
      },
      igaer: {
        q: "Ég fer í sund. Byrjaðu setninguna á *Í gær …*",
        a: "Í gær fór ég í sund.",
        how: "Sögnin stendur í öðru sæti, svo frumlagið fer aftur fyrir hana. *Í gær* er liðinn tími og sögnin fer í þátíð: *fór ég*.",
        forms: ["fara|so|GM-FH-NT-1P-ET=fer", "fara|so|GM-FH-ÞT-1P-ET=fór"],
      },
      past: {
        q: "Settu setninguna í **þátíð**: *Hún les bókina og fer svo að sofa.*",
        a: "Hún las bókina og fór svo að sofa.",
        how: "Finndu sagnirnar sem beygjast í persónu, *les* og *fer*, og settu þær í þátíð: *las* og *fór*. *Sofa* er í nafnhætti og breytist ekki.",
        forms: ["lesa|so|GM-FH-NT-3P-ET=les", "lesa|so|GM-FH-ÞT-3P-ET=las", "fara|so|GM-FH-NT-3P-ET=fer",
          "fara|so|GM-FH-ÞT-3P-ET=fór"],
      },
      plural: {
        q: "Settu frumlagið *Strákurinn* í **fleirtölu**: *Strákurinn er glaður.*",
        a: "Strákarnir eru glaðir.",
        how: "*Strákurinn* verður *strákarnir*. Sögnin lagar sig að frumlaginu, *er* verður *eru*, og lýsingarorðið líka: *glaður* verður *glaðir*.",
        forms: ["strákur|kk|NFETgr=strákurinn", "strákur|kk|NFFTgr=strákarnir", "vera|so|GM-FH-NT-3P-ET=er",
          "vera|so|GM-FH-NT-3P-FT=eru", "glaður|lo|FSB-KK-NFET=glaður", "glaður|lo|FSB-KK-NFFT=glaðir"],
      },
      passive: {
        q: "Settu setninguna í **þolmynd**: *Smiðirnir byggðu húsið.*",
        a: "Húsið var byggt.",
        how: "Andlagið *húsið* fer fremst og verður frumlag. Svo kemur *vera* í sömu tíð og sögnin, *var*, og lýsingarháttur þátíðar: *byggt*. Það má bæta við *af smiðunum*.",
        forms: ["hús|hk|NFETgr=húsið", "vera|so|GM-FH-ÞT-3P-ET=var", "byggja|so|LHÞT-SB-HK-NFET=byggt",
          "smiður|kk|ÞGFFTgr=smiðunum"],
      },
      active: {
        q: "Settu setninguna í **germynd**: *Hjólið var lagað af pabba.*",
        a: "Pabbi lagaði hjólið.",
        how: "Sá sem stendur á eftir *af*, *pabba*, gerði það. Hann verður frumlag í nefnifalli, *pabbi*, og sögnin beygist sjálf í sömu tíð og *var*: *lagaði*.",
        forms: ["pabbi|kk|ÞGFET=pabba", "pabbi|kk|NFET=pabbi", "laga|so|GM-FH-ÞT-3P-ET=lagaði"],
      },
      question: {
        q: "Breyttu fullyrðingunni í **já/nei-spurningu**: *Hún bjargaði kettinum.*",
        a: "Bjargaði hún kettinum?",
        how: "Sögnin sem beygist fer fremst og frumlagið kemur strax á eftir henni: *Bjargaði hún*. Annað stendur óbreytt.",
        forms: ["bjarga|so|GM-FH-ÞT-3P-ET=bjargaði", "köttur|kk|ÞGFETgr=kettinum"],
      },
      join: {
        q: "Tengdu með **þegar** og byrjaðu á *Þegar*: *Ég kom heim. Mamma var að elda.*",
        a: "Þegar ég kom heim var mamma að elda.",
        how: "Aukasetningin *þegar ég kom heim* er fyrsti liðurinn. Sögnin í aðalsetningunni kemur strax á eftir henni, á undan frumlaginu: *var mamma*.",
        forms: ["koma|so|GM-FH-ÞT-1P-ET=kom", "vera|so|GM-FH-ÞT-3P-ET=var"],
      },
      indirect: {
        q: "Settu í óbeina ræðu: *Hann sagði: „Kötturinn liggur á gólfinu.“*",
        a: "Hann sagði að kötturinn lægi á gólfinu.",
        how: "Gæsalappirnar hverfa og setningin byrjar á *að*. Af því að *sagði* er í þátíð fer sögnin í viðtengingarhátt þátíðar: *liggur* verður *lægi*.",
        forms: ["liggja|so|GM-FH-NT-3P-ET=liggur", "liggja|so|GM-VH-ÞT-3P-ET=lægi"],
      },
    },
  },
  raeda: {
    q: "Settu í óbeina ræðu: *Hann sagði: „Kötturinn liggur á gólfinu.“*",
    a: "Hann sagði að kötturinn lægi á gólfinu.",
    how: "Gæsalappirnar hverfa og setningin byrjar á *að*. Af því að *sagði* er í þátíð fer sögnin í viðtengingarhátt þátíðar: *liggur* verður *lægi*.",
    forms: ["liggja|so|GM-FH-NT-3P-ET=liggur", "liggja|so|GM-VH-ÞT-3P-ET=lægi"],
  },
  /* Issue #29: the example goes the way the question goes (`kind`). */
  sameina: {
    q: "Gerðu **eina setningu** úr þessum tveimur og notaðu *þegar*: *Við fórum inn. Bjallan hringdi.*",
    a: "Við fórum inn þegar bjallan hringdi.",
    how: "*Þegar* segir hvenær. Það fer fremst í setninguna sem segir hvenær: *þegar bjallan hringdi*. Hin setningin stendur óbreytt.",
    forms: ["hringja|so|GM-FH-ÞT-3P-ET=hringdi"],
    byKind: {
      combine: {
        q: "Gerðu **eina setningu** úr þessum tveimur og notaðu *þegar*: *Við fórum inn. Bjallan hringdi.*",
        a: "Við fórum inn þegar bjallan hringdi.",
        how: "*Þegar* segir hvenær. Það fer fremst í setninguna sem segir hvenær: *þegar bjallan hringdi*. Hin setningin stendur óbreytt.",
        forms: ["hringja|so|GM-FH-ÞT-3P-ET=hringdi"],
      },
      split: {
        q: "Skiptu setningunni í **tvær stuttar setningar**: *Við fórum inn þegar bjallan hringdi.*",
        a: "Við fórum inn. Bjallan hringdi.",
        how: "Finndu tenginguna: *þegar*. Öðrum megin við hana er ein setning og hinum megin önnur. Tengingunni er sleppt og hvor setning fær punkt.",
        forms: ["hringja|so|GM-FH-ÞT-3P-ET=hringdi"],
      },
    },
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
  /* issue 27: who did it is a question about meaning, and in a passive the
     answer is not the frumlag */
  hver_gerdi: {
    q: "*Hundurinn var bitinn af kettinum.* Hver beit?",
    a: "Kötturinn",
    how: "*var bitinn* er þolmynd. Þá er frumlagið, *Hundurinn*, sá sem varð fyrir því. Sá sem gerði það stendur á eftir *af*: *af kettinum*. Í germynd: *Kötturinn beit hundinn.*",
    forms: ["hundur|kk|NFETgr=hundurinn", "hundur|kk|ÞFETgr=hundinn", "köttur|kk|NFETgr=kötturinn",
      "köttur|kk|ÞGFETgr=kettinum", "bíta|so|GM-FH-ÞT-3P-ET=beit"],
    byKind: {
      tilvísun: {
        q: "*Strákurinn sem hundurinn elti datt.* Hver datt?",
        a: "Strákurinn",
        how: "*sem hundurinn elti* er tilvísunarsetning, innskot um orðið *Strákurinn*. Taktu hana út og þá stendur eftir: *Strákurinn datt.* Hundurinn elti, en strákurinn datt.",
        forms: ["strákur|kk|NFETgr=strákurinn", "hundur|kk|NFETgr=hundurinn", "elta|so|GM-FH-ÞT-3P-ET=elti",
          "detta|so|GM-FH-ÞT-3P-ET=datt"],
      },
    },
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
  /* issue #30: the main idea is what the whole text is about. The story is
     NOT one of content/textar/: an example that is also a question would
     hand the pupil its answer. */
  les_adal: {
    q: "*Kári gleymdi nestinu sínu heima. Vinur hans gaf honum helminginn af samlokunni sinni.* Um hvað er sagan?",
    a: "Kári gleymir nestinu en vinur hans hjálpar honum.",
    how: "Aðalatriðið nær yfir alla söguna: vandann og hvernig fór. *Vinur Kára á samloku* er bara smáatriði.",
    forms: [],
  },
  /* issue #31: the story map. The stories are not in content/textar/
     either (tests/storymap.test.js). */
  les_hluti: {
    q: "*Óli ætlaði að hjóla í skólann. En dekkið á hjólinu var sprungið. Hann gekk því í skólann.* Í hvaða setningu kemur vandinn fram?",
    a: "En dekkið á hjólinu var sprungið.",
    how: "Vandinn er það sem fer úrskeiðis og kemur sögunni af stað. *Óli ætlaði að hjóla* er markmiðið, það sem hann vildi. *Hann gekk* er það sem hann gerði í staðinn.",
    forms: [],
  },
  les_kort: {
    q: "Settu setningarnar á sögukortið: *Lína var úti að leika sér. Allt í einu byrjaði að rigna. Hún hljóp inn í húsið. Hún slapp við að blotna.*",
    a: "aðstæður · vandi · tilraun · útkoma",
    how: "Spyrðu um hverja setningu: hvaða spurningu svarar hún? Hver og hvar? Það eru aðstæður. Hvað gerist? Það er vandinn. Hvað gerir hún? Það er tilraun. Hvernig fer? Það er útkoman.",
    forms: [],
  },
  les_samantekt: {
    q: "*Óli ætlaði að hjóla í skólann en dekkið var sprungið. Hann gekk og kom of seint.* Hvaða samantekt passar við söguna?",
    a: "Óli gat ekki hjólað af því að dekkið var sprungið, svo hann gekk og kom of seint.",
    how: "Samantektin fylgir sögukortinu: vandinn (sprungið dekk), tilraunin (hann gekk) og útkoman (of seint). Samantekt sem breytir einhverjum hluta, eða röðinni, er röng.",
    forms: [],
  },
  /* issue #35: Frásögn. The stories are not in content/textar/ either
     (tests/frasogn.test.js). */
  fr_rod: {
    q: "Raðaðu: *Hann kom samt of seint.* · *Gummi vaknaði of seint.* · *Hann hljóp alla leiðina.*",
    a: "1. Gummi vaknaði of seint. 2. Hann hljóp alla leiðina. 3. Hann kom samt of seint.",
    how: "Setning sem byrjar á *Hann* getur ekki verið fyrst: fyrst þarf að segja hver hann er. Svo spyrðu: hvað hlýtur að gerast á undan hverju?",
    forms: [],
  },
  fr_vantar: {
    q: "*Lína var úti að leika sér. Allt í einu byrjaði að rigna. ……… Hún slapp við að blotna.* Hvaða hluta sögukortsins vantar?",
    a: "tilraun",
    how: "Farðu yfir hlutana: aðstæður (Lína úti), vandi (rigning), útkoma (slapp við að blotna). Það sem Lína **gerði** stendur hvergi: tilraunina vantar.",
    forms: [],
  },
  fr_setning: {
    q: "*Lína var úti að leika sér. Allt í einu byrjaði að rigna. ……… Hún slapp við að blotna.* Hvaða setning á heima í eyðunni?",
    a: "Hún hljóp inn í húsið.",
    how: "Setningin í eyðunni verður að passa við setninguna á undan (rigningin) og á eftir (hún slapp við að blotna). Lestu söguna með setningunni og gáðu hvort hún hangir saman.",
    forms: [],
  },
  /* issue #32: subject texts. The hvalir text of the Lesefni page, not one
     of content/textar/. */
  les_setning: {
    q: "*Hvalir anda með lungum. Þeir gefa afkvæmum sínum mjólk. Hvalir eru því spendýr en ekki fiskar.* Hvaða setning er aðalatriðið?",
    a: "Hvalir eru því spendýr en ekki fiskar.",
    how: "Hinar tvær setningarnar segja hvers vegna hvalir eru spendýr. Aðalatriðið stendur hér aftast og dregur textann saman.",
    forms: [],
  },
  les_smaatridi: {
    q: "*Hvalir eru spendýr. Þeir anda með lungum. Sumir fara í hvalaskoðun. Þeir gefa afkvæmum mjólk.* Hvaða setningar styðja aðalatriðið?",
    a: "Þeir anda með lungum. Þeir gefa afkvæmum mjólk.",
    how: "Þær sýna að hvalir eru spendýr. *Sumir fara í hvalaskoðun* segir frá öðru og styður það ekki.",
    forms: [],
  },
  les_kjarni: {
    q: "Texti segir að hvalir anda með lungum og gefa afkvæmum mjólk, og séu því spendýr. Hvaða samantekt er best?",
    a: "Hvalir eru spendýr af því að þeir anda með lungum og gefa afkvæmum mjólk.",
    how: "*Hvalir anda með lungum* er of þröngt, *Mörg dýr lifa í sjónum* of vítt og *Hvalir eru fiskar* rangt.",
  /* issue #36: step 3, a gap inside a story sentence */
  fr_tengiord: {
    q: "*Gummi svaf yfir sig. ___ missti hann af strætó.* Af því að, þess vegna eða en?",
    a: "Þess vegna",
    how: "Á eftir *þess vegna* kemur sögnin strax (*missti*), og merkingin passar: hann svaf yfir sig og af þeirri ástæðu missti hann af strætó. Á eftir *af því að* og *en* kæmi frumlagið fyrst.",
    forms: [],
  },
  fr_innra: {
    q: "*Lína vann keppnina. Hún var mjög ___ og sýndi mömmu sinni verðlaunin.* Stolt, reið eða hrædd?",
    a: "stolt",
    how: "Lestu það sem kemur á undan (Lína vann) og á eftir (hún sýndi verðlaunin). Sá sem vinnur og sýnir verðlaunin sín er stoltur. Ekkert í sögunni gerir hana reiða eða hrædda.",
    forms: [],
  },
};
