"""Hand-written exercise items for the question types added in v6.11.

Nothing here is an inflected form. Every word a question ASKS about — the
answer, the options, the cue in brackets — is written as a BÍN lemma, a word
class and a BÍN mark, and `build_exercises.py` looks the form up in BÍN. The
sentences around the blank are checked word by word against BÍN too; the
build stops if one of them is not there.

    ___                  the blank
    {lemma|cls|MARK}     a word in the sentence, inflected by BÍN
    a=(lemma, cls, MARK) the answer

The classes are BÍN's: kk kvk hk lo so pfn afn fn to rt ao fs st uh.
Personal pronouns are plural forms of the singular lemma in BÍN:
við = ég FT, þið = þú FT, þeir/þær/þau = hann/hún/það FT.
"""

# ---------------------------------------------------------------- Fornöfn

# A personal pronoun in the case the verb or preposition asks for.
# The cue shown in brackets is the nominative of the same number.
PRONOUN_GAP = [
    ("Ég gaf ___ bókina.", ("hún", "pfn", "ÞGFET"), "gefa e-m e-ð: sá sem fær stendur í þágufalli."),
    ("Kennarinn hrósaði ___ fyrir verkefnið.", ("ég", "pfn", "ÞGFET"), "hrósa stýrir þágufalli."),
    ("Viltu hjálpa ___ með heimavinnuna?", ("ég", "pfn", "ÞGFET"), "hjálpa stýrir þágufalli."),
    ("Amma bakaði köku handa ___.", ("ég", "pfn", "ÞGFFT"), "handa stýrir þágufalli."),
    ("Ég hlakka til að hitta ___ á morgun.", ("þú", "pfn", "ÞFET"), "hitta stýrir þolfalli."),
    ("Strákarnir biðu eftir ___ í hálftíma.", ("hún", "pfn", "ÞGFET"), "bíða eftir e-m: eftir stýrir hér þágufalli."),
    ("Hefur þú séð ___ í dag?", ("hann", "pfn", "ÞFFT"), "sjá stýrir þolfalli."),
    ("Ég sakna ___ mikið.", ("þú", "pfn", "EFET"), "sakna stýrir eignarfalli."),
    ("Við töluðum um ___ í gær.", ("hún", "pfn", "ÞFET"), "um stýrir þolfalli."),
    ("Mamma keypti nýja skó handa ___.", ("þú", "pfn", "ÞGFFT"), "handa stýrir þágufalli."),
    ("Hundurinn hljóp á eftir ___.", ("ég", "pfn", "ÞGFFT"), "á eftir stýrir þágufalli."),
    ("Ég sendi ___ bréf.", ("hann", "pfn", "ÞGFFT"), "senda e-m e-ð: sá sem fær stendur í þágufalli."),
    ("Hún saknaði ___ allan daginn.", ("það", "pfn", "EFFT"), "sakna stýrir eignarfalli."),
    ("Ég fékk bréf frá ___.", ("hann", "pfn", "ÞGFET"), "frá stýrir þágufalli."),
    ("Komdu með ___ í bíó!", ("ég", "pfn", "ÞGFET"), "með e-m (ásamt e-m) stýrir þágufalli."),
    ("Pabbi spurði ___ um prófið.", ("ég", "pfn", "ÞFFT"), "spyrja stýrir þolfalli."),
    ("Kötturinn svaf hjá ___ í nótt.", ("þú", "pfn", "ÞGFET"), "hjá stýrir þágufalli."),
    ("Ég þekki ___ vel.", ("hún", "pfn", "ÞFET"), "þekkja stýrir þolfalli."),
    ("Ég fór til ___ í gær.", ("hann", "pfn", "EFET"), "til stýrir eignarfalli."),
    ("Ég treysti ___ alveg.", ("þú", "pfn", "ÞGFET"), "treysta stýrir þágufalli."),
    ("Við heimsóttum ___ um jólin.", ("hann", "pfn", "ÞFFT"), "heimsækja stýrir þolfalli."),
    ("Þjálfarinn óskaði ___ til hamingju.", ("þú", "pfn", "ÞGFFT"), "óska e-m til hamingju: þágufall."),
    ("Hún hringdi í ___ í morgun.", ("ég", "pfn", "ÞFET"), "hringja í e-n: í stýrir hér þolfalli."),
    ("Ég lánaði ___ hjólið mitt.", ("hún", "pfn", "ÞGFET"), "lána e-m e-ð: þágufall."),
    ("Strákurinn leitaði ___ um allan bæ.", ("hún", "pfn", "EFET"), "leita stýrir eignarfalli."),
    ("Við gleymdum ___ á stöðinni.", ("þú", "pfn", "ÞGFET"), "gleyma stýrir þágufalli."),
    ("Ég heyrði í ___ í útvarpinu.", ("hann", "pfn", "ÞGFFT"), "heyra í e-m: í stýrir hér þágufalli."),
    ("Þau fóru í bíó án ___.", ("ég", "pfn", "EFFT"), "án stýrir eignarfalli."),
    ("Hver sagði ___ þetta?", ("þú", "pfn", "ÞGFET"), "segja e-m e-ð: þágufall."),
    ("Ég sá ___ í búðinni.", ("hún", "pfn", "ÞFFT"), "sjá stýrir þolfalli."),
    ("Afi gaf ___ nammi.", ("það", "pfn", "ÞGFFT"), "gefa e-m e-ð: þágufall."),
    ("Mér þykir vænt um ___.", ("þú", "pfn", "ÞFFT"), "um stýrir þolfalli."),
]

# Reflexive or not. The same sentence twice, with a line that says who is
# meant; the line decides. Options are the two forms, both from BÍN.
REFLEXIVE = [
    ("Jón þvoði ___ um hendurnar.", "Jón þvoði sjálfum sér.",
     ("sig", "afn", "ÞGF"), ("hann", "pfn", "ÞGFET")),
    ("Jón þvoði ___ um hendurnar.", "Jón þvoði litla bróður sínum.",
     ("hann", "pfn", "ÞGFET"), ("sig", "afn", "ÞGF")),
    ("Anna tók töskuna ___.", "Anna á töskuna sjálf.",
     ("sinn", "fn", "KVK-ÞFET"), ("hún", "pfn", "EFET")),
    ("Anna tók töskuna ___.", "Vinkona Önnu á töskuna.",
     ("hún", "pfn", "EFET"), ("sinn", "fn", "KVK-ÞFET")),
    ("Strákarnir sóttu hjólin ___.", "Strákarnir eiga hjólin sjálfir.",
     ("sinn", "fn", "HK-ÞFFT"), ("hann", "pfn", "EFFT")),
    ("Strákarnir sóttu hjólin ___.", "Aðrir strákar eiga hjólin.",
     ("hann", "pfn", "EFFT"), ("sinn", "fn", "HK-ÞFFT")),
    ("María keypti ___ nýja peysu.", "Peysan er handa Maríu sjálfri.",
     ("sig", "afn", "ÞGF"), ("hún", "pfn", "ÞGFET")),
    ("María keypti ___ nýja peysu.", "Peysan er handa systur Maríu.",
     ("hún", "pfn", "ÞGFET"), ("sig", "afn", "ÞGF")),
    ("Pétur sá ___ í speglinum.", "Pétur sá sjálfan sig.",
     ("sig", "afn", "ÞF"), ("hann", "pfn", "ÞFET")),
    ("Pétur sá ___ í speglinum.", "Pétur sá vin sinn í speglinum.",
     ("hann", "pfn", "ÞFET"), ("sig", "afn", "ÞF")),
    ("Hún hringdi í mömmu ___.", "Hún hringdi í sína eigin mömmu.",
     ("sinn", "fn", "KVK-ÞFET"), ("hún", "pfn", "EFET")),
    ("Hún hringdi í mömmu ___.", "Hún hringdi í mömmu vinkonu sinnar.",
     ("hún", "pfn", "EFET"), ("sinn", "fn", "KVK-ÞFET")),
    ("Kennarinn talaði við nemendurna ___.", "Þetta eru nemendur kennarans sjálfs.",
     ("sinn", "fn", "KK-ÞFFT"), ("hann", "pfn", "EFET")),
    ("Kennarinn talaði við nemendurna ___.", "Þetta eru nemendur annars kennara.",
     ("hann", "pfn", "EFET"), ("sinn", "fn", "KK-ÞFFT")),
    ("Stelpurnar klæddu ___ í úlpurnar.", "Stelpurnar klæddu sjálfar sig.",
     ("sig", "afn", "ÞF"), ("hún", "pfn", "ÞFFT")),
    ("Stelpurnar klæddu ___ í úlpurnar.", "Stelpurnar klæddu litlu systur sínar.",
     ("hún", "pfn", "ÞFFT"), ("sig", "afn", "ÞF")),
    ("Lóa gleymdi húfunni ___.", "Lóa á húfuna sjálf.",
     ("sinn", "fn", "KVK-ÞGFET"), ("hún", "pfn", "EFET")),
    ("Lóa gleymdi húfunni ___.", "Systir Lóu á húfuna.",
     ("hún", "pfn", "EFET"), ("sinn", "fn", "KVK-ÞGFET")),
    ("Afi sagði sögu af ___.", "Sagan var um afa sjálfan.",
     ("sig", "afn", "ÞGF"), ("hann", "pfn", "ÞGFET")),
    ("Afi sagði sögu af ___.", "Sagan var um langafa.",
     ("hann", "pfn", "ÞGFET"), ("sig", "afn", "ÞGF")),
    ("Siggi meiddi ___ á fætinum.", "Siggi meiddist sjálfur.",
     ("sig", "afn", "ÞF"), ("hann", "pfn", "ÞFET")),
    ("Siggi meiddi ___ á fætinum.", "Siggi meiddi annan strák í fótbolta.",
     ("hann", "pfn", "ÞFET"), ("sig", "afn", "ÞF")),
]

# ---------------------------------------------------------------- Töluorð

# A cardinal 1-4 agreeing with its noun. {N} is the noun, put in the case
# and number the slot needs by BÍN; the numeral takes the noun's gender.
# n: which numbers may be asked (1 takes the singular).
NUMERAL_AGREE = [
    ("Ég á ___ {N}.", "ÞF", [1, 2, 3, 4], ["systir", "bróðir", "köttur", "hundur", "frænka", "frændi"]),
    ("___ {N} komu í heimsókn.", "NF", [2, 3, 4], ["stelpa", "strákur", "barn", "kennari", "vinkona"]),
    ("Við töluðum við ___ {N}.", "ÞGF", [1, 2, 3, 4], ["stelpa", "strákur", "kennari", "barn", "vinkona"]),
    ("Hún keypti ___ {N} í búðinni.", "ÞF", [1, 2, 3, 4], ["bók", "penni", "epli", "peysa", "blýantur", "banani"]),
    ("Ég beið í ___ {N}.", "ÞF", [1, 2, 3, 4], ["dagur", "vika", "mínúta", "klukkutími"]),
    ("Á bænum eru ___ {N}.", "NF", [2, 3, 4], ["kýr", "hestur", "kind", "hæna", "svín"]),
    ("Þetta er hús ___ {N}.", "EF", [2, 3, 4], ["bróðir", "systir", "vinur"]),
    ("Hann kom heim með ___ {N}.", "ÞGF", [1, 2, 3, 4], ["fiskur", "poki", "taska", "bréf"]),
    ("Í bekknum eru ___ {N} með gleraugu.", "NF", [2, 3, 4], ["stelpa", "strákur", "nemandi"]),
    ("Ég fékk ___ {N} í afmælisgjöf.", "ÞF", [1, 2, 3, 4], ["bók", "leikur", "spil", "peysa"]),
]

# Plural-only nouns: einir, tvennir, þrennir, fernir.
PLURAL_ONLY_NOUNS = ["buxur", "skæri", "gleraugu", "tónleikar", "dyr", "jól", "hjón"]
PLURAL_NUMERALS = {1: ("einn", "fn"), 2: ("tvennur", "lo"), 3: ("þrennur", "lo"), 4: ("fern", "lo")}
NUMERAL_PLURAL_ONLY = [
    ("Ég keypti ___ {N} í gær.", "ÞF", [1, 2, 3], ["buxur", "skæri", "gleraugu"]),
    ("Hann á ___ {N}.", "ÞF", [1, 2, 3, 4], ["buxur", "gleraugu", "skæri"]),
    ("Í ganginum eru ___ {N}.", "NF", [2, 3, 4], ["dyr"]),
    ("Við fórum á ___ {N} í sumar.", "ÞF", [1, 2, 3, 4], ["tónleikar"]),
    ("Hún hefur haldið ___ {N} hjá ömmu.", "ÞF", [2, 3, 4], ["jól"]),
    ("Í brúðkaupinu dönsuðu ___ {N} saman.", "NF", [2, 3, 4], ["hjón"]),
    ("Það er gat á ___ {N}.", "ÞGF", [1, 2, 3], ["buxur"]),
]

# Dates. Ordinals are written lemma by lemma (21. = tuttugasti og fyrsti).
ORDINAL_LEMMAS = {
    1: ("fyrstur", "lo"), 2: ("annar", "rt"), 3: ("þriðji", "rt"), 4: ("fjórði", "rt"),
    5: ("fimmti", "rt"), 6: ("sjötti", "rt"), 7: ("sjöundi", "rt"), 8: ("áttundi", "rt"),
    9: ("níundi", "rt"), 10: ("tíundi", "rt"), 11: ("ellefti", "rt"), 12: ("tólfti", "rt"),
    13: ("þrettándi", "rt"), 14: ("fjórtándi", "rt"), 15: ("fimmtándi", "rt"),
    16: ("sextándi", "rt"), 17: ("sautjándi", "rt"), 18: ("átjándi", "rt"),
    19: ("nítjándi", "rt"), 20: ("tuttugasti", "rt"), 30: ("þrítugasti", "rt"),
}
MONTHS = ["janúar", "febrúar", "mars", "apríl", "maí", "júní", "júlí", "ágúst",
          "september", "október", "nóvember", "desember"]
DAYS_IN = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
# The case the date stands in, and why.
DATE_FRAMES = [
    ("Í dag er ___ {M}.", "NF", "Dagsetningin er frumlag eða sagnfylling: nefnifall (*dagurinn*)."),
    ("Ég á afmæli ___ {M}.", "ÞF", "Dagsetning sem svarar *hvenær?* stendur í þolfalli (*þann þriðja maí*)."),
    ("Skólinn byrjar ___ {M}.", "ÞF", "Dagsetning sem svarar *hvenær?* stendur í þolfalli."),
    ("Frá ___ {M} er sumarfrí.", "ÞGF", "*Frá* stýrir þágufalli."),
    ("Fríið stendur til ___ {M}.", "EF", "*Til* stýrir eignarfalli."),
    ("Við förum til útlanda ___ {M}.", "ÞF", "Dagsetning sem svarar *hvenær?* stendur í þolfalli."),
]

# ---------------------------------------------------------------- Fallstjórn

# Motion (þolfall) or rest (þágufall) after í / á / undir / yfir.
# (sentence, noun, column, motion?)
MOTION_REST = [
    ("Ég lagði bókina á ___.", "borð", "ETgr", True),
    ("Bókin liggur á ___.", "borð", "ETgr", False),
    ("Kötturinn stökk upp í ___.", "rúm", "ETgr", True),
    ("Kötturinn sefur í ___.", "rúm", "ETgr", False),
    ("Við fórum í ___ eftir skóla.", "búð", "ETgr", True),
    ("Við hittumst í ___ eftir skóla.", "búð", "ETgr", False),
    ("Hún setti mjólkina inn í ___.", "ísskápur", "ETgr", True),
    ("Mjólkin er í ___.", "ísskápur", "ETgr", False),
    ("Strákurinn hljóp út á ___.", "gata", "ETgr", True),
    ("Strákurinn lék sér á ___.", "gata", "ETgr", False),
    ("Fuglinn flaug upp á ___.", "þak", "ETgr", True),
    ("Fuglinn situr á ___.", "þak", "ETgr", False),
    ("Ég hengdi myndina á ___.", "veggur", "ETgr", True),
    ("Myndin hangir á ___.", "veggur", "ETgr", False),
    ("Við keyrðum inn í ___.", "bær", "ETgr", True),
    ("Við búum í ___.", "bær", "ETgr", False),
    ("Hann stakk símanum í ___.", "vasi", "ETgr", True),
    ("Síminn er í ___.", "vasi", "ETgr", False),
    ("Boltinn rúllaði undir ___.", "sófi", "ETgr", True),
    ("Boltinn liggur undir ___.", "sófi", "ETgr", False),
    ("Flugvélin flaug yfir ___.", "fjall", "ETgr", True),
    ("Skýið hangir yfir ___.", "fjall", "ETgr", False),
    ("Krakkarnir hlupu út á ___.", "völlur", "ETgr", True),
    ("Krakkarnir spila fótbolta á ___.", "völlur", "ETgr", False),
    ("Hún hellti vatni í ___.", "glas", "ETgr", True),
    ("Vatnið er í ___.", "glas", "ETgr", False),
    ("Hundurinn skreið undir ___.", "borð", "ETgr", True),
    ("Hundurinn sefur undir ___.", "borð", "ETgr", False),
    ("Ég setti diskana í ___.", "skápur", "ETgr", True),
    ("Diskarnir eru í ___.", "skápur", "ETgr", False),
    ("Við gengum upp á ___.", "hæð", "ETgr", True),
    ("Við stóðum á ___.", "hæð", "ETgr", False),
]

# A verb that governs a case. {V} is not used: the verb is written out. The
# noun is asked in the column given (ETgr: singular with the article); the
# cue is the noun's nominative in that column.
VERB_CASE = [
    ("Ég hjálpaði ___ að bera pokana.", "hjálpa", "ÞGF", "ETgr", ["kennari", "nágranni", "stelpa", "strákur"]),
    ("Ég sakna ___ mjög mikið.", "sakna", "EF", "ETgr", ["hundur", "köttur", "vinur", "kennari"]),
    ("Við þökkuðum ___ fyrir matinn.", "þakka", "ÞGF", "ETgr", ["kokkur", "kona", "maður"]),
    ("Á leiðinni heim mætti ég ___.", "mæta", "ÞGF", "ET", ["maður", "kona", "hundur", "lögreglumaður"]),
    ("Við biðum ___ í hálftíma.", "bíða", "EF", "ETgr", ["strætisvagn", "lest", "læknir"]),
    ("Hún leitaði ___ um allt hús.", "leita", "EF", "ETgr", ["lykill", "sími", "köttur", "taska"]),
    ("Ég gleymdi ___ heima.", "gleyma", "ÞGF", "ETgr", ["sími", "nesti", "taska", "lykill"]),
    ("Strákurinn týndi ___ í gær.", "týna", "ÞGF", "ETgr", ["lykill", "húfa", "vettlingur", "bolti"]),
    ("Ég treysti ___ fullkomlega.", "treysta", "ÞGF", "ETgr", ["læknir", "þjálfari", "kennari"]),
    ("Við nutum ___ í sveitinni.", "njóta", "EF", "ETgr", ["útsýni", "sól:kvk", "kyrrð"]),
    ("Hún kastaði ___ yfir girðinguna.", "kasta", "ÞGF", "ETgr", ["bolti", "steinn", "spýta"]),
    ("Ég henti ___ í ruslið.", "henda", "ÞGF", "ETgr", ["blað", "flaska", "dós"]),
    ("Þjófurinn stal ___.", "stela", "ÞGF", "ETgr", ["hjól", "veski", "bíll"]),
    ("Ég heilsaði ___ á ganginum.", "heilsa", "ÞGF", "ETgr", ["kennari", "skólastjóri", "húsvörður"]),
    ("Hundurinn fylgdi ___ heim.", "fylgja", "ÞGF", "ETgr", ["strákur", "stelpa", "maður"]),
    ("Ég aðstoðaði ___ í eldhúsinu.", "aðstoða", "ÞF", "ETgr", ["kokkur", "bakari", "smiður"]),
    ("Ég spurði ___ til vegar.", "spyrja", "ÞF", "ETgr", ["lögreglumaður", "kona", "maður"]),
    ("Litla stelpan óttaðist ___.", "óttast", "ÞF", "ETgr", ["hundur", "myrkur", "þruma"]),
    ("Ég hlakka til ___.", "hlakka", "EF", "ETgr", ["sumar", "ferð", "veisla", "afmæli"]),
    ("Garðurinn þarfnast ___.", "þarfnast", "EF", "ET", ["vatn", "umhirða", "áburður"]),
    ("Hún bjargaði ___ úr ánni.", "bjarga", "ÞGF", "ETgr", ["hundur", "kettlingur", "strákur"]),
    ("Við fögnuðum ___ með köku.", "fagna", "ÞGF", "ETgr", ["sigur", "afmæli", "vor"]),
    ("Ég lofaði ___ að koma.", "lofa", "ÞGF", "ETgr", ["þjálfari", "kennari", "nágranni"]),
    ("Hann gætti ___ allan daginn.", "gæta", "EF", "ETgr", ["barn", "hundur", "búð"]),
]

# Impersonal verbs: the "subject" is in an oblique case — and two traps that
# take the nominative (hlakka, kvíða). The blank opens the sentence.
IMPERSONAL = [
    ("___ langar í ís.", ("ég", "pfn", "ÞFET"), "langa", "þolfall: *mig langar*."),
    ("___ finnst gaman í skólanum.", ("ég", "pfn", "ÞGFET"), "finnast", "þágufall: *mér finnst*."),
    ("___ vantar nýja skó.", ("hún", "pfn", "ÞFET"), "vanta", "þolfall: *hana vantar*."),
    ("___ líður vel í dag.", ("hann", "pfn", "ÞGFET"), "líða", "þágufall: *honum líður vel*."),
    ("___ hlakka til jólanna.", ("ég", "pfn", "NFET"), "hlakka", "nefnifall: *ég hlakka til* — ekki *mér hlakkar*."),
    ("___ kvíðir fyrir prófinu.", ("hún", "pfn", "NFET"), "kvíða", "nefnifall: *hún kvíðir fyrir* — ekki *henni kvíðir*."),
    ("___ dreymdi skrýtinn draum.", ("ég", "pfn", "ÞFET"), "dreyma", "þolfall: *mig dreymdi*."),
    ("___ leiðist í rigningunni.", ("ég", "pfn", "ÞGFFT"), "leiðast", "þágufall: *okkur leiðist*."),
    ("___ þykir vænt um hundinn.", ("það", "pfn", "ÞGFFT"), "þykja", "þágufall: *þeim þykir vænt um*."),
    ("___ er kalt.", ("ég", "pfn", "ÞGFET"), "vera", "þágufall: *mér er kalt*."),
    ("___ batnaði kvefið fljótt.", ("hann", "pfn", "ÞGFET"), "batna", "þágufall: *honum batnaði*."),
    ("___ syfjar á kvöldin.", ("hún", "pfn", "ÞFET"), "syfja", "þolfall: *hana syfjar*."),
    ("___ klæjar í nefið.", ("ég", "pfn", "ÞFET"), "klæja", "þolfall: *mig klæjar*."),
    ("___ langaði að fara heim.", ("ég", "pfn", "ÞFFT"), "langa", "þolfall: *okkur langaði*."),
    ("___ vantaði blýant.", ("þú", "pfn", "ÞFET"), "vanta", "þolfall: *þig vantaði*."),
    ("___ líkar vel við nýja kennarann.", ("hún", "pfn", "ÞGFET"), "líka", "þágufall: *henni líkar*."),
    ("___ gengur vel í stærðfræði.", ("þú", "pfn", "ÞGFFT"), "ganga", "þágufall: *ykkur gengur vel*."),
    ("___ hlakkar til sumarsins.", ("hún", "pfn", "NFET"), "hlakka", "nefnifall: *hún hlakkar til* — ekki *henni hlakkar*."),
    ("___ verður kalt úti.", ("þú", "pfn", "ÞGFET"), "verða", "þágufall: *þér verður kalt*."),
    ("___ sárnaði þetta.", ("hann", "pfn", "ÞGFET"), "sárna", "þágufall: *honum sárnaði*."),
]

# ---------------------------------------------------------------- Óbeygjanleg

# Preposition or adverb: the same word with and without a governed word.
# (sentence, the word, its position among the words, "fs" | "ao")
ADV_OR_PREP = [
    ("Hún hljóp upp stigann.", "upp", "fs"),
    ("Hún leit upp.", "upp", "ao"),
    ("Við gengum yfir brúna.", "yfir", "fs"),
    ("Óveðrið gekk yfir.", "yfir", "ao"),
    ("Hún fór niður brekkuna.", "niður", "fs"),
    ("Hún datt niður.", "niður", "ao"),
    ("Ég fór með mömmu.", "með", "fs"),
    ("Má ég koma með?", "með", "ao"),
    ("Hún kom eftir matinn.", "eftir", "fs"),
    ("Kakan er búin og ekkert er eftir.", "eftir", "ao"),
    ("Kötturinn skreið undir rúmið.", "undir", "fs"),
    ("Báturinn sökk og fór undir.", "undir", "ao"),
    ("Barnið hljóp út.", "út", "ao"),
    ("Kötturinn stökk upp á borðið.", "upp", "ao"),
    ("Kötturinn stökk upp á borðið.", "á", "fs"),
    ("Hann gekk fram hjá húsinu.", "hjá", "fs"),
    ("Komdu inn!", "inn", "ao"),
    ("Ég beið fyrir utan.", "utan", "ao"),
    ("Hann bjó utan bæjarins.", "utan", "fs"),
    ("Sólin skein á okkur.", "á", "fs"),
]

# Choose the conjunction. Every wrong option makes the sentence wrong.
CONJUNCTION = [
    ("Ég veit ekki ___ hún kemur á morgun.", "hvort", ["ef", "sem", "né"], "*Hvort* spyr: *Ég veit ekki hvort …* — *ef* er skilyrði."),
    ("Hún spurði ___ ég vildi koma með.", "hvort", ["ef", "sem", "né"], "Óbein spurning hefst á *hvort*, ekki *ef*."),
    ("___ það rignir förum við ekki út.", "ef", ["hvort", "né", "sem"], "*Ef* táknar skilyrði."),
    ("Bókin ___ ég las var spennandi.", "sem", ["hvort", "ef", "né"], "*Sem* tengir tilvísunarsetningu við nafnorð."),
    ("Hún sagði ___ hún væri svöng.", "að", ["sem", "hvort", "né"], "*Að* tengir það sem sagt er við sögnina."),
    ("Hvorki ég ___ bróðir minn fórum á ballið.", "né", ["eða", "en", "sem"], "*Hvorki … né*."),
    ("Annaðhvort förum við í bíó ___ í sund.", "eða", ["né", "en", "sem"], "*Annaðhvort … eða*."),
    ("Bæði Siggi ___ Gunna komu í veisluna.", "og", ["né", "eða", "sem"], "*Bæði … og*."),
    ("Ég fer ekki út ___ það hætti að rigna.", "nema", ["hvort", "sem", "né"], "*Nema* = ef ekki."),
    ("Hann hló ___ hann væri leiður.", "þótt", ["hvort", "sem", "né"], "*Þótt* táknar andstæðu: það gerist samt."),
    ("Hún er eldri ___ ég.", "en", ["sem", "hvort", "né"], "Á eftir miðstigi kemur *en*."),
    ("Viltu te ___ kaffi?", "eða", ["né", "sem", "að"], "*Eða* býður upp á val."),
    ("Mig langaði út ___ það var rigning.", "en", ["hvort", "sem", "né"], "*En* tengir saman andstæður."),
    ("Ég kem ___ ég hef lokið við heimavinnuna.", "þegar", ["hvort", "sem", "né"], "*Þegar* segir hvenær."),
    ("Hún var svo þreytt ___ hún sofnaði strax.", "að", ["sem", "hvort", "né"], "*Svo … að*."),
    ("Við lékum okkur úti ___ sólin skein.", "meðan", ["hvort", "sem", "né"], "*Meðan* = á sama tíma og."),
]

# Synonyms and antonyms. Groups, not pairs: every word in a group means the
# same. A distractor is never taken from the same group or from a group
# marked as an antonym of it.
SYNONYMS = {
    "lo": [["stór", "mikill"], ["lítill", "smár"], ["glaður", "kátur", "hamingjusamur"],
           ["dapur", "hryggur", "sorgmæddur"],
           ["fljótur", "hraður", "snöggur", "skjótur"], ["fallegur", "fagur", "fríður"],
           ["hræddur", "smeykur", "óttasleginn"],
           ["duglegur", "iðinn", "röskur"], ["þögull", "hljóður"], ["ríkur", "efnaður", "auðugur"],
           ["skrýtinn", "undarlegur", "furðulegur", "einkennilegur"], ["frægur", "þekktur", "kunnur"],
           ["hugrakkur", "djarfur", "kjarkaður"], ["þreyttur", "lúinn", "uppgefinn"],
           ["svangur", "soltinn", "hungraður"],
           ["reiður", "gramur"], ["veikur", "lasinn", "sjúkur"], ["auðveldur", "léttur"],
           ["gáfaður", "greindur"], ["öruggur", "óhultur"], ["hræðilegur", "skelfilegur"],
           ["frábær", "æðislegur", "stórkostlegur"], ["gómsætur", "ljúffengur"],
           ["stoltur", "hreykinn"], ["tryggur", "trúr", "dyggur"], ["eigingjarn", "sjálfselskur"],
           ["sjaldgæfur", "fágætur"], ["augljós", "greinilegur"], ["mögulegur", "hugsanlegur"],
           ["líklegur", "sennilegur"], ["áhugaverður", "athyglisverður"],
           ["heimskulegur", "bjánalegur", "kjánalegur"], ["dimmur", "myrkur"], ["tómur", "auður"],
           ["ógeðslegur", "viðbjóðslegur"], ["notalegur", "huggulegur"],
           ["vingjarnlegur", "vinsamlegur"], ["dýrmætur", "verðmætur"], ["hentugur", "heppilegur"],
           ["sanngjarn", "réttlátur"], ["varkár", "gætinn"], ["heppinn", "lánsamur"],
           ["fimur", "liðugur"], ["mátulegur", "hæfilegur"], ["þrjóskur", "þrár"],
           ["örlátur", "gjafmildur"], ["hrokafullur", "drambsamur"],
           ["dónalegur", "ókurteis", "ruddalegur"], ["huglaus", "ragur"], ["blautur", "votur"],
           ["fátækur", "snauður"], ["skítugur", "óhreinn"], ["mikilvægur", "þýðingarmikill"],
           ["algengur", "almennur"], ["fjörugur", "líflegur"], ["rangur", "vitlaus"],
           ["blíður", "ljúfur"], ["mjúkur", "linur"], ["stuttur", "skammur"],
           ["hættulegur", "háskalegur"], ["frekur", "ágengur", "ýtinn"],
           ["tilbúinn", "reiðubúinn"], ["ráðvilltur", "ringlaður"],
           ["eilífur", "endalaus", "óendanlegur"], ["fljótfær", "hvatvís"],
           ["hreinskilinn", "einlægur"], ["ánægður", "sáttur"], ["vitur", "spakur"],
           ["hávær", "hávaðasamur"], ["montinn", "grobbinn"], ["kvíðinn", "áhyggjufullur"],
           ["rólegur", "friðsæll"], ["nauðsynlegur", "ómissandi"], ["vondur", "illur", "slæmur"],
           ["risastór", "gríðarstór"], ["skynsamlegur", "viturlegur"], ["hlægilegur", "fáránlegur"],
           ["fyndinn", "skondinn"], ["sterkur", "öflugur", "kraftmikill"]],
    # nouns: the gender of each comes from BÍN
    "no": [["vinur", "félagi"], ["bíll", "bifreið"], ["ótti", "hræðsla"], ["strákur", "drengur", "piltur"],
           ["verkur", "sársauki"], ["stelpa", "stúlka", "telpa"], ["gleði", "kæti"], ["barn", "krakki"],
           ["starf", "vinna"], ["draugur", "vofa"], ["skrímsli", "ófreskja"], ["augnablik", "andartak"],
           ["regn", "rigning"], ["skoðun", "álit"], ["merki", "tákn"], ["veisla", "samkvæmi"],
           ["sorp", "rusl"], ["ferð", "ferðalag"], ["kjarkur", "hugrekki:hk"], ["hætta", "háski"],
           ["þakklæti", "þökk"], ["matur", "fæða"], ["saga", "frásögn"], ["bardagi", "orrusta"],
           ["stríð", "styrjöld"], ["vandi", "vandamál"], ["markmið", "takmark"], ["ástæða", "orsök"],
           ["hjálp", "aðstoð"], ["rifrildi", "deila"], ["sorg", "hryggð"], ["ljóð", "kvæði"],
           ["tónlist", "hljómlist"], ["köttur", "kisa"], ["heimska", "fávísi"], ["fjársjóður", "gersemi"], ["hrós", "lof"],
           ["mistök", "villa"], ["kraftur", "afl:hk"], ["heppni", "lán"]],
    "so": [["byrja", "hefja"], ["reyna", "prófa"], ["hjálpa", "aðstoða"], ["öskra", "æpa", "hrópa"],
           ["henda", "fleygja", "kasta"], ["gráta", "skæla"], ["ljúka", "klára"], ["hugsa", "íhuga"],
           ["ganga", "labba"], ["borða", "snæða"], ["flýta", "hraða"], ["eyðileggja", "skemma"],
           ["byggja", "reisa"], ["meiða", "særa"], ["velja", "kjósa"], ["týna", "glata"],
           ["geyma", "varðveita"], ["fela", "hylja"], ["stoppa", "stöðva"], ["skjálfa", "titra"],
           ["hræða", "skelfa"], ["útskýra", "skýra"], ["kvarta", "kveina"], ["mótmæla", "andmæla"],
           ["tala", "mæla"], ["laga", "lagfæra"], ["ráðleggja", "leiðbeina"],
           ["flakka", "ráfa"], ["stríða", "hrekkja"]],
    "ao": [["oft", "iðulega"], ["alltaf", "ávallt"], ["strax", "umsvifalaust"],
           ["sennilega", "líklega"], ["örugglega", "áreiðanlega"], ["einnig", "líka", "sömuleiðis"],
           ["mjög", "afar", "ákaflega"], ["bráðum", "senn"],
           ["skyndilega", "snögglega"], ["loksins", "loks"],
           ["vissulega", "sannarlega"], ["undarlega", "einkennilega"], ["kannski", "máski"],
           ["hratt", "fljótt"]],
}
# Antonyms: a word may have more than one (gamall: ungur, nýr); all of them
# are kept away from the wrong options.
ANTONYMS = {
    "lo": [("stór", "lítill"), ("heitur", "kaldur"), ("gamall", "ungur"), ("glaður", "dapur"),
           ("fljótur", "hægur"), ("langur", "stuttur"), ("hár", "lágur"), ("þungur", "léttur"),
           ("sterkur", "veikur"), ("ríkur", "fátækur"), ("dýr", "ódýr"), ("hreinn", "skítugur"),
           ("opinn", "lokaður"), ("harður", "mjúkur"), ("breiður", "mjór"), ("þykkur", "þunnur"),
           ("blautur", "þurr"), ("auðveldur", "erfiður"), ("fullur", "tómur"), ("góður", "vondur"),
           ("réttur", "rangur"), ("ljós", "dökkur"), ("nýr", "gamall"),
           ("kurteis", "dónalegur"), ("hugrakkur", "huglaus"), ("duglegur", "latur"),
           ("örlátur", "nískur"), ("hógvær", "hrokafullur"), ("hávær", "hljóður"),
           ("bjartur", "dimmur"), ("djúpur", "grunnur"), ("sætur", "súr"), ("fallegur", "ljótur"),
           ("feitur", "grannur"), ("gáfaður", "heimskur"), ("öruggur", "hættulegur"),
           ("lifandi", "dauður"), ("þröngur", "víður"), ("beinn", "boginn"), ("sléttur", "hrjúfur"),
           ("beittur", "bitlaus"), ("fjarlægur", "nálægur"), ("bjartsýnn", "svartsýnn"),
           ("jákvæður", "neikvæður"), ("einfaldur", "flókinn"), ("algengur", "sjaldgæfur"),
           ("varanlegur", "tímabundinn"), ("vingjarnlegur", "fjandsamlegur"),
           ("hrokafullur", "auðmjúkur"), ("kátur", "fúll"), ("rólegur", "æstur"),
           ("hægur", "hraður"), ("fyrirsjáanlegur", "óvæntur"), ("snyrtilegur", "subbulegur"),
           ("sýnilegur", "ósýnilegur"), ("sekur", "saklaus"),
           ("hlýðinn", "óþekkur"), ("hollur", "óhollur"), ("þolinmóður", "óþolinmóður"),
           ("sannur", "ósannur"), ("vinsæll", "óvinsæll"), ("ánægður", "óánægður")],
    "so": [("opna", "loka"), ("byrja", "hætta"), ("kaupa", "selja"), ("koma", "fara"),
           ("muna", "gleyma"), ("hlæja", "gráta"), ("vinna", "tapa"), ("sofna", "vakna"),
           ("finna", "týna"), ("hækka", "lækka"), ("kveikja", "slökkva"), ("spyrja", "svara"),
           ("gefa", "þiggja"), ("stækka", "minnka"), ("elska", "hata"),
           ("ýta", "toga"), ("hrósa", "skamma"), ("leyfa", "banna"), ("samþykkja", "hafna"),
           ("byggja", "rífa"), ("fylla", "tæma"), ("festa", "losa"), ("hita", "kæla"),
           ("sökkva", "fljóta"), ("þegja", "tala"), ("vaka", "sofa"), ("kenna", "læra"),
           ("spara", "eyða"), ("hefja", "ljúka"), ("sigra", "tapa"),],
    "no": [("dagur", "nótt"), ("vinur", "óvinur"), ("sigur", "ósigur"), ("hiti", "kuldi"),
           ("sumar", "vetur"), ("stríð", "friður"), ("upphaf", "endir"), ("ljós", "myrkur"),
           ("spurning", "svar"), ("gleði", "sorg"), ("sannleikur", "lygi"), ("ást", "hatur"),
           ("fortíð", "framtíð"), ("kostur", "galli"), ("gróði", "tap"), ("fátækt", "ríkidæmi"),
           ("heilsa", "veikindi"), ("morgunn", "kvöld"), ("himinn", "jörð"), ("hugrekki:hk", "hugleysi"),
           ("leyfi", "bann"), ("vor", "haust"), ("hrós", "last"), ("sólarupprás", "sólsetur"),
           ("hamingja", "óhamingja"), ("heppni", "óheppni"), ("frelsi", "ánauð"),
           ("inngangur", "útgangur"), ("vinátta", "óvinátta")],
    "ao": [("alltaf", "aldrei"), ("oft", "sjaldan"), ("snemma", "seint"), ("upp", "niður"),
           ("inn", "út"), ("hratt", "hægt"), ("hér", "þar"), ("úti", "inni"), ("uppi", "niðri"),
           ("áður", "síðar"), ("vel", "illa"), ("mikið", "lítið"),
           ("hátt", "lágt")],
}

# Word in context: exactly one option makes sense. Every option is a noun in
# the same mark (BÍN), so grammar never gives the answer away; where a word
# beside the blank agrees with it, all four have the same gender.
# (sentence, mark, right, [wrong, wrong, wrong])
WORD_IN_CONTEXT = [
    ("Ég drakk glas af ___ með matnum.", "ÞGFET", "mjólk", ["stóll", "skór", "bíll"]),
    ("Hún burstaði ___ fyrir svefninn.", "ÞFFTgr", "tönn", ["gluggi", "stjarna", "eldavél"]),
    ("Við fórum með ___ til dýralæknisins.", "ÞFETgr", "hundur", ["sófi", "snjór", "blýantur"]),
    ("Ég klippti blaðið með ___.", "ÞGFFT", "skæri", ["sokkur", "ský", "egg:hk"]),
    ("Fiskurinn synti í ___.", "ÞGFETgr", "sjór", ["eyðimörk", "bókahilla", "sófi"]),
    ("Ég þurrkaði mér með ___ eftir sundið.", "ÞGFET", "handklæði", ["gaffall", "lykill", "steinn"]),
    ("Ég skrifaði bréfið með ___.", "ÞGFET", "penni", ["hamar", "skór", "diskur"]),
    ("Bóndinn mjólkaði ___ á hverjum morgni.", "ÞFFTgr", "kýr", ["stóll", "bíll", "blóm"]),
    ("Á veturna fellur ___ af himni.", "NFET", "snjór", ["gras", "stóll", "brauð"]),
    ("Ég saumaði gatið með nál og ___.", "ÞGFET", "tvinni", ["hamar", "skeið:kvk", "sápa"]),
    ("Læknirinn hlustaði á ___ í sjúklingnum.", "ÞFETgr", "hjarta", ["gluggi", "eldhús", "gaffall"]),
    ("Hún vökvaði ___ í garðinum.", "ÞFFTgr", "blóm", ["bók", "bíll", "skór"]),
    ("Kokkurinn skar laukinn með ___.", "ÞGFET", "hnífur", ["blýantur", "bók", "sokkur"]),
    ("Fuglinn byggði sér ___ í trénu.", "ÞFET", "hreiður", ["bíll", "sundlaug", "kirkja"]),
    ("Ég fékk ___ í hálsinn og fór til læknis.", "ÞFET", "verkur", ["gluggi", "bók", "ský"]),
    ("Bíllinn var tómur svo við keyptum ___ á bensínstöðinni.", "ÞFET", "bensín", ["gras", "ský", "hunang"]),
    ("Ég þvoði mér um hendurnar með ___.", "ÞGFET", "sápa", ["mjólk", "blek", "hunang"]),
    ("Á haustin falla ___ af trjánum.", "NFFTgr", "lauf", ["bók", "skór", "diskur"]),
    ("Hundurinn gelti að ___ sem kom með bréfin.", "ÞGFETgr", "póstur", ["stóll", "ský", "brauð"]),
    ("Mig klæjaði eftir að ___ stakk mig.", "NFETgr", "fluga", ["skeið:kvk", "sól:kvk", "bók"]),
    ("Ég setti frímerki á ___ og sendi það.", "ÞFETgr", "bréf", ["epli", "rúm", "fjall"]),
    ("Við kveiktum á ___ þegar dimmt var orðið.", "ÞGFFTgr", "kerti", ["epli", "skæri", "egg:hk"]),
    ("Hún hengdi ___ upp á snúru til þerris.", "ÞFETgr", "þvottur", ["sófi", "bíll", "snjór"]),
    ("Ég bauð vinum mínum í ___ á laugardaginn.", "ÞFET", "afmæli", ["ský", "egg:hk", "gras"]),
    ("Ég setti mjólkina inn í ___ svo hún skemmdist ekki.", "ÞFETgr", "ísskápur", ["sófi", "gluggi", "hattur"]),
    ("Hann las ___ áður en hann fór að sofa.", "ÞFET", "bók", ["mjólk", "eldavél", "skeið:kvk"]),
    ("Hún opnaði ___ með lyklinum.", "ÞFETgr", "hurð", ["ský", "mjólk", "sól:kvk"]),
    ("Við fórum með ___ yfir hafið til Danmerkur.", "ÞGFETgr", "ferja", ["skeið:kvk", "sápa", "kaka"]),
    ("Ég setti á mig ___ því það var kalt úti.", "ÞFET", "húfa", ["kaka", "gata", "eldavél"]),
    ("Ég borðaði ___ í morgunmat.", "ÞFET", "hafragrautur", ["stóll", "sófi", "hamar"]),
    ("Ég þvoði fötin í ___.", "ÞGFETgr", "þvottavél", ["eldavél", "bókahilla", "klukka"]),
    ("Hann negldi naglann með ___.", "ÞGFET", "hamar", ["penni", "sokkur", "diskur"]),
    ("Kýrin gefur okkur ___.", "ÞFET", "mjólk", ["bensín", "sápa", "blek"]),
    ("Ég burstaði tennurnar með nýjum ___.", "ÞGFET", "tannbursti", ["hamar", "penni", "stóll"]),
    ("Ég borga fyrir matinn með ___.", "ÞGFFT", "peningur", ["sokkur", "steinn", "bátur"]),
    ("Í ___ eru margar bækur sem má fá lánaðar.", "ÞGFETgr", "bókasafn", ["sundlaug", "bakarí", "fjós:hk"]),
    ("Ég keypti brauð í ___.", "ÞGFETgr", "bakarí", ["bókasafn", "fjós:hk", "kirkja"]),
    ("Ég synti tíu ferðir í ___.", "ÞGFETgr", "sundlaug", ["bókasafn", "ísskápur", "bakarí"]),
    ("Flugvélin lenti á ___.", "ÞGFETgr", "flugvöllur", ["ísskápur", "sokkur", "diskur"]),
    ("Hún skar brauðið með ___.", "ÞGFETgr", "hnífur", ["sokkur", "penni", "koddi"]),
    ("Ég lagði höfuðið á ___ og sofnaði.", "ÞFETgr", "koddi", ["hnífur", "gaffall", "ofn"]),
    ("Ég drakk ___ úr bolla.", "ÞFET", "kaffi", ["sandur", "stóll", "grjót"]),
    ("Ég vaknaði þegar ___ hringdi.", "NFETgr", "vekjaraklukka", ["sófi", "koddi", "teppi"]),
    ("Við grilluðum ___ í kvöldmat.", "ÞFFT", "pylsa", ["sokkur", "blýantur", "steinn"]),
    ("Það rigndi svo ég tók með mér ___.", "ÞFET", "regnhlíf", ["eldavél", "koddi", "diskur"]),
    ("Kötturinn veiddi ___ í garðinum.", "ÞFET", "mús", ["sófi", "bók", "klukka"]),
    ("Ég hringdi í mömmu úr ___ mínum.", "ÞGFET", "sími", ["sokkur", "koddi", "gaffall"]),
    ("Bóndinn rak ___ inn í fjárhúsið.", "ÞFFTgr", "kind", ["bók", "skeið:kvk", "klukka"]),
    ("Skipið sigldi út á ___.", "ÞFETgr", "haf", ["eldhús", "rúm", "bókasafn"]),
    ("Ég mældi hitann með ___.", "ÞGFET", "hitamælir", ["sokkur", "koddi", "diskur"]),
    ("Við horfðum á tunglið í ___.", "ÞGFET", "sjónauki", ["sokkur", "koddi", "hamar"]),
    ("Mamma bakaði ___ í ofninum.", "ÞFFT", "smákaka", ["sokkur", "steinn", "penni"]),
    ("Ég sópaði gólfið með ___.", "ÞGFET", "kústur", ["ostur", "sími", "diskur"]),
    ("Hún skrifaði á töfluna með ___.", "ÞGFET", "krít", ["mjólk", "sápa", "kaka"]),
    ("Ég setti bréfið í ___.", "ÞFETgr", "umslag", ["ský", "tungl", "fjall"]),
    ("Hesturinn borðaði ___ í hesthúsinu.", "ÞFET", "hey", ["blek", "gler", "járn"]),
    ("Við gistum á ___ í fríinu.", "ÞGFET", "hótel", ["ský", "egg:hk", "blóm"]),
    ("Ég setti plásturinn á ___.", "ÞFETgr", "sár:hk", ["ský", "tungl", "haf"]),
    ("Hann tók mynd af fjallinu með ___ sinni.", "ÞGFET", "myndavél", ["eldavél", "þvottavél", "skeið:kvk"]),
    ("Ég hengdi úlpuna á ___.", "ÞFETgr", "snagi", ["himinn", "snjór", "sandur"]),
]

# Words never offered for sorting without a sentence: the vocabulary filter
# (vocab_filter.py) is about lemmas in exercises; these are fine words that
# only occur in fixed phrases (í gær, alls konar) or are odd for 8th grade.
SORT_SKIP = {"ríða", "byssa", "guð", "almáttugur", "gær", "konar", "öllsömul", "sitthvað",
             "mestallur", "eður", "uns", "áhyggja", "neðanjarðar", "snemmt", "brott",
             "lítt", "senn", "beinlínis", "aldeilis", "vitaskuld", "bandarískur", "eilífur",
             "fremja", "deyja", "eyðileggja", "náungi", "sundur", "frammi", "mis", "margur",
             "hve", "samstundis", "sömuleiðis", "skulu", "hljóta"}
