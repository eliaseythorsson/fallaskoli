"""Hand-written exercise items for the question types added in v6.11.

Nothing here is an inflected form. Every word a question ASKS about — the
answer, the options, the cue in brackets — is written as a BÍN lemma, a word
class and a BÍN mark, and `build_exercises.py` looks the form up in BÍN. The
sentences around the blank are checked word by word against BÍN too; the
build stops if one of them is not there.

    ___                  the blank
    {lemma|cls|MARK}     a word in the sentence, inflected by BÍN
    a=(lemma, cls, MARK) the answer

One table is written the other way round: HUNT, at the end, the bank of real
errors for Villuveiðar. There the corrected word stands in the sentence as it
is read, with its lemma, class and mark beside it, and the build refuses the
item unless BÍN gives exactly that form — so a person can read the bank as
Icelandic, and nothing in it is taken on trust either.

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
#
# Each item must have ONE right answer. A verb of moving (fljúga, skríða,
# rúlla, ganga, stökkva) can also mean moving about IN a place, and then the
# þágufall is right too: "Hundurinn skreið undir borðinu" (crawled about
# under it) is as good as "undir borðið". So every motion item carries a word
# that fixes the direction: a directional adverb before the preposition (inn,
# út, upp), a verb of placing (leggja, setja, hengja, stinga, hella), or a
# goal in the rest of the sentence (til mín, og settist þar). Six motion
# items were rewritten for this in v6.13 (critique item 6).
MOTION_REST = [
    ("Ég lagði bókina á ___.", "borð", "ETgr", True),
    ("Bókin liggur á ___.", "borð", "ETgr", False),
    ("Kötturinn stökk upp í ___ til mín.", "rúm", "ETgr", True),
    ("Kötturinn sefur í ___.", "rúm", "ETgr", False),
    ("Við fórum í ___ eftir skóla.", "búð", "ETgr", True),
    ("Við hittumst í ___ eftir skóla.", "búð", "ETgr", False),
    ("Hún setti mjólkina inn í ___.", "ísskápur", "ETgr", True),
    ("Mjólkin er í ___.", "ísskápur", "ETgr", False),
    ("Strákurinn hljóp út á ___.", "gata", "ETgr", True),
    ("Strákurinn lék sér á ___.", "gata", "ETgr", False),
    ("Fuglinn flaug upp á ___ og settist þar.", "þak", "ETgr", True),
    ("Fuglinn situr á ___.", "þak", "ETgr", False),
    ("Ég hengdi myndina á ___.", "veggur", "ETgr", True),
    ("Myndin hangir á ___.", "veggur", "ETgr", False),
    ("Við keyrðum inn í ___.", "bær", "ETgr", True),
    ("Við búum í ___.", "bær", "ETgr", False),
    ("Hann stakk símanum í ___.", "vasi", "ETgr", True),
    ("Síminn er í ___.", "vasi", "ETgr", False),
    ("Boltinn rúllaði inn undir ___.", "sófi", "ETgr", True),
    ("Boltinn liggur undir ___.", "sófi", "ETgr", False),
    ("Hesturinn stökk yfir ___.", "girðing", "ETgr", True),
    ("Skýið hangir yfir ___.", "fjall", "ETgr", False),
    ("Krakkarnir hlupu út á ___.", "völlur", "ETgr", True),
    ("Krakkarnir spila fótbolta á ___.", "völlur", "ETgr", False),
    ("Hún hellti vatni í ___.", "glas", "ETgr", True),
    ("Vatnið er í ___.", "glas", "ETgr", False),
    ("Hundurinn skreið inn undir ___.", "borð", "ETgr", True),
    ("Hundurinn sefur undir ___.", "borð", "ETgr", False),
    ("Ég setti diskana í ___.", "skápur", "ETgr", True),
    ("Diskarnir eru í ___.", "skápur", "ETgr", False),
    ("Við gengum alla leið upp á ___.", "hæð", "ETgr", True),
    ("Við stóðum á ___.", "hæð", "ETgr", False),
]

# A verb that governs a case. {V} is not used: the verb is written out. The
# noun is asked in the column given (ETgr: singular with the article); the
# cue is the noun's nominative in that column.
#
# Only items where the VERB governs the case. The app explains each one as
# "Sögnin X stýrir …falli. Prófaðu: X mér/mín", so a case set by a
# preposition (hlakka TIL e-s: til stýrir eignarfalli) or by a fixed phrase
# does not belong here; the build stops on a preposition right before the
# blank. "Ég hlakka til ___" was here until v6.13 (critique item 5); the
# preposition cloze already asks it from the sentence bank (Ég hlakka til
# sumarsins / afmælisins / ferðanna), where the lead says "Forsetningin til
# ræður fallinu".
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

# Choose the conjunction. (sentence, right, [wrong, wrong, wrong], why)
#
# The options are contrast sets: every wrong option is a conjunction a pupil
# could really reach for in that place, and is wrong for a reason the
# explanation can name — the meaning (ef / þegar / þótt / nema), the order
# of words after it (enda takes the verb first: *enda hafði hún*), what
# follows it (til þess að takes the infinitive), or the pair it belongs to
# (hvorki … né, annaðhvort … eða, bæði … og). No distractor may be learned
# as "always wrong": none stands in more than a third of the items
# (tests/more.test.js). Each item has exactly one right answer: a word that
# would also do (*þegar* for *ef* in "Þú mátt fá köku ___ þú klárar") is
# never offered.
CONJUNCTION = [
    # hvort / hvort sem / ef: the indirect question
    ("Ég veit ekki ___ hún kemur á morgun.", "hvort", ["ef", "hvort sem", "þegar"],
     "Óbein spurning hefst á *hvort*: *Ég veit ekki hvort …* — *ef* táknar skilyrði og *þegar* tíma."),
    ("Hún spurði ___ ég vildi koma með.", "hvort", ["ef", "að", "hvort sem"],
     "Óbein já- eða nei-spurning hefst á *hvort*: *Hún spurði hvort …*, ekki *ef*."),
    ("Við förum í gönguferð ___ það rignir eða ekki.", "hvort sem", ["hvort", "ef", "þótt"],
     "*Hvort sem … eða ekki*: það skiptir ekki máli hvort það rignir, við förum samt."),
    # ef / þegar / þótt / nema: condition, time, concession, exception
    ("___ ég væri fugl myndi ég fljúga til Spánar.", "ef", ["þegar", "nema", "hvort"],
     "*Ef* táknar skilyrði, hér skilyrði sem er ekki satt: *ef ég væri fugl*."),
    ("Ég var sex ára ___ ég lærði að synda.", "þegar", ["ef", "nema", "þótt"],
     "*Þegar* segir hvenær eitthvað gerðist."),
    ("Hann fór út í stuttbuxum í morgun ___ það væri frost.", "þótt", ["ef", "þegar", "nema"],
     "*Þótt* táknar andstæðu: það var frost en hann fór samt út í stuttbuxum."),
    ("Við spilum úti á morgun ___ það rigni, því þá spilum við inni.", "nema", ["ef", "þótt", "þegar"],
     "*Nema* merkir *ef ekki*: við spilum úti ef það rignir ekki."),
    # af því að / enda / svo að / til þess að: cause, result, purpose
    ("Ég fór snemma að sofa ___ ég var mjög þreyttur.", "af því að", ["svo að", "þótt", "til þess að"],
     "*Af því að* segir hvers vegna: ég fór að sofa vegna þess að ég var þreyttur."),
    ("Hún var svöng, ___ hafði hún ekkert borðað síðan í morgun.", "enda", ["af því að", "svo að", "til þess að"],
     "*Enda* bætir við skýringu, og á eftir því kemur sögnin á undan frumlaginu: *enda hafði hún*. "
     "Á eftir *af því að* kæmi frumlagið fyrst: *af því að hún hafði*."),
    ("Það var mikil hálka ___ margir duttu á leiðinni í skólann.", "svo að", ["af því að", "til þess að", "þótt"],
     "*Svo að* segir hvað leiddi af: hálkan varð til þess að margir duttu."),
    ("Ég vaknaði snemma ___ ná strætó.", "til þess að", ["svo að", "af því að", "enda"],
     "*Til þess að* segir til hvers, og á eftir því kemur nafnháttur: *til þess að ná strætó*."),
    # hvorki … né, annaðhvort … eða, bæði … og
    ("Hvorki ég ___ bróðir minn fórum á ballið.", "né", ["eða", "og", "en"], "*Hvorki … né*."),
    ("Annaðhvort förum við í bíó ___ í sund.", "eða", ["né", "og", "en"], "*Annaðhvort … eða*."),
    ("Bæði Siggi ___ Gunna komu í veisluna.", "og", ["né", "eða", "en"], "*Bæði … og*."),
    # sem / að / en
    ("Bókin ___ ég las var spennandi.", "sem", ["að", "hvort", "þegar"],
     "*Sem* tengir tilvísunarsetningu við nafnorð: *bókin sem ég las*."),
    ("Hún sagði ___ hún væri svöng.", "að", ["sem", "hvort", "nema"],
     "*Að* tengir það sem sagt er við sögnina: *Hún sagði að …*."),
    ("Hún er eldri ___ ég.", "en", ["sem", "og", "eða"], "Á eftir miðstigi kemur *en*: *eldri en ég*."),
    ("Ég ætlaði að fara út ___ það var of kalt.", "en", ["af því að", "svo að", "hvort"],
     "*En* tengir saman andstæður: ég ætlaði út, en það var of kalt."),
    ("Ég burstaði tennurnar ___ ég fór að sofa.", "áður en", ["eftir að", "nema", "hvort"],
     "*Áður en* segir hvað gerðist fyrst: fyrst burstaði ég tennurnar, svo fór ég að sofa."),
    ("Hún var svo þreytt ___ hún sofnaði strax.", "að", ["sem", "nema", "þótt"],
     "*Svo … að*: *svo þreytt að hún sofnaði strax*."),
]
# Conjunctions of more than one word. BÍN lists words, not phrases, so the
# build checks that every word of each is in BÍN and that its last word is
# a conjunction there; an option with a space must be one of these.
CONJ_PHRASES = {"af því að", "til þess að", "svo að", "hvort sem", "áður en", "eftir að"}

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


# ---------------------------------------------------------------- Villuveiðar
#
# HUNT: the errors Icelandic teenagers actually make (critique item 26).
#
# The generated error hunt breaks a case or an agreement at random, and much
# of what it makes no native speaker would say (*Stelpan hlaupa*, *Ég borðum*).
# This bank is the other kind: one sentence, natural and correct apart from ONE
# well-known slip, with the correction and a short explanation a 13-year-old
# can read. tasks/malbeiting.js serves it from þyngd 3; the generated kind is
# kept for þyngd 1–2 and for pupils with Icelandic as a second language.
#
#     H(band, sentence, wrong, spec, why, patterns, **checks)
#
#   band      3, 4 or 5 — the þyngd from which the item is asked
#   sentence  the CORRECT sentence, with the word (or two) that is made wrong
#             in [square brackets]
#   wrong     what the pupil is shown in its place. A leading * says the form
#             is not standard Icelandic at all (*læknirar, *talva): the build
#             then requires that BÍN does NOT list it as a standard form of
#             the word. Without the star every word of it must be a standard
#             BÍN form — the right word in the wrong cell (mér, drottningu),
#             or another word altogether (tíndi for týndi, af for að).
#   spec      (lemma, class, mark) for each word inside the brackets, in order.
#             The build looks the form up in BÍN and stops unless it is
#             exactly the word written in the sentence. For a word that does
#             not inflect the mark is "" and only the class is checked.
#   why       the explanation, in Icelandic. Several of these are matters of
#             the written norm rather than "wrong Icelandic"; those say
#             "í vönduðu máli" and do not call the other form an error.
#   patterns  ids from core/diagnosis.js PATTERNS, comma-separated; "" where
#             none fits (a miss is then counted as unread, which is honest).
#   checks    op=(verb, "ÞF")   BÍN lists the verb as impersonal with a subject
#                               in that case, and not in the dative
#             nf="hlakka"       BÍN does NOT list the verb with an oblique subject
#             gov=(word, "ef")  government.py: the verb or preposition governs
#                               that case and no other
#             also=["ennþá"]    other single words that put the sentence right
#             parse=False       Greynir is known not to parse this (correct)
#                               sentence: it does not read a verb with -tu
#                               merged into it (*viltu, máttu, komstu*) nor
#                               *hvor öðrum*. Every other corrected sentence
#                               must parse.
#
# One error per sentence, and one way to mend it. Items whose natural
# correction would change two separate words are left out; where the
# correction moves a word (*við hvorn* → *hvor við*) the two words are one
# unit in the brackets.

def H(band, t, wrong, spec, why, patterns="", **checks):
    return dict(band=band, t=t, wrong=wrong, spec=[spec] if isinstance(spec, tuple) else spec,
                why=why, p=[x for x in patterns.split(",") if x], **checks)

_LANGA = "Sögnin *langa* tekur frumlag í **þolfalli**, ekki þágufalli: *mig langar*, *þig langar*, *hana langar*."
_VANTA = "Sögnin *vanta* tekur frumlag í **þolfalli**, ekki þágufalli: *mig vantar*, *þig vantar*, *hann vantar*."
_DREYMA = "Sögnin *dreyma* tekur frumlag í **þolfalli**: *mig dreymdi*, *hana dreymdi*."
_HLAKKA = ("*Hlakka til* tekur frumlag í **nefnifalli** og sögnin lagar sig að því: "
           "*ég hlakka til*, *hann hlakkar til*, *við hlökkum til*.")
_VIL = "Með *ég* er sögnin *vil*, ekki *vill*: *ég vil*, *þú vilt*, *hann vill*."
_ING = "Kvenkynsorð sem enda á *-ing* fá *-ar* í eignarfalli eintölu"
def _ef(example):
    return ("Á eftir *ef* er notaður **framsöguháttur** þegar talað er um það sem getur vel gerst: "
            f"*{example}*. Viðtengingarháttur þátíðar á við um það sem er ekki raunverulegt: "
            "*ef veðrið væri gott*.")
_THOTT = "Á eftir *þótt* og *þó að* stendur **viðtengingarháttur**: *þótt það væri rigning*, *þó að hún sé lasin*."
_HVOR = ("Í vönduðu máli beygjast *hvor* og *annar* ekki saman. *Hvor* stendur í sama falli og frumlagið "
         "(hér nefnifalli) en *annar* tekur fallið sem sögnin stýrir")
_HVOR_FS = ("Í vönduðu máli stendur *hvor* á undan forsetningunni, í sama falli og frumlagið, "
            "en *annar* tekur fallið sem forsetningin stýrir")
_NY = ("Þessi orðaröð er kölluð nýja þolmyndin. Hún heyrist oft í talmáli en er ekki notuð í vönduðu ritmáli.")
_FLT = ("Með fleirtöluorðum eru notuð töluorðin *einir, tvennir, þrennir, fernir* "
        "í stað *einn, tveir, þrír, fjórir*")
_LAEKNIR = "*-ir* í *læknir* er ending nefnifallsins, ekki hluti af stofninum, og dettur út í beygingu"
_FOTUR = "*Fótur* er karlkynsorð: *fæturnir* (nefnifall) og *fæturna* (þolfall). Endingin *-nar* er kvenkyn (*hendurnar*)."
_TOLVA = ("Orðið er alltaf með *ö*: *tölva – tölvu – tölvan – tölvur*. "
          "Það er búið til úr orðunum *tala* og *völva*.")
_HOND = "*Hönd* beygist: *hönd – hönd – hendi – handar*. *Hendi* er aðeins þágufall eintölu: *í hendinni*."
_FRAENDSEMI = "er aðeins nefnifall. Í hinum föllunum þremur er"
_HVORT = ("Óbein spurning hefst á *hvort*, ekki *ef*: *ég veit ekki hvort hún kemur*. "
          "*Ef* táknar skilyrði: *ég kem ef ég get*.")
_FYRST = ("*Fyrst* þýðir hér „úr því að“. *Víst* þýðir „áreiðanlega“ eða „jú“: *hann kemur víst á morgun*.")
_HVORKI = "*Hvorki* og *né* fylgjast að: *hvorki … né*. *Eða* fylgir *annaðhvort*: *annaðhvort … eða*."
_INN_KK = "Lýsingarorð sem enda á *-inn* hafa **tvö n** í karlkyni og **eitt n** í kvenkyni"
_BLANDAD = ("Þegar talað er um karl og konu saman er notað **hvorugkyn fleirtölu**: *þau eru")
_EINHVER = ("Fornafnið er *einhver*: *einhver – einhvern – einhverjum – einhverjir*. "
            "*Eitt-* er aðeins í hvorugkyni eintölu: *eitthvað, eitthvert*.")

HUNT = [
    # ---- þágufallssýki: frumlag ópersónulegra sagna (og nefnifall með hlakka, kvíða)
    H(3, "[Mig] langar í nýjan síma.", "Mér", ("ég", "pfn", "ÞFET"), _LANGA, "opersonuleg", op=("langa", "ÞF")),
    H(3, "[Mig] vantar blýant og strokleður.", "Mér", ("ég", "pfn", "ÞFET"), _VANTA, "opersonuleg", op=("vanta", "ÞF")),
    H(3, "[Hana] langar að fara í sund eftir skóla.", "Henni", ("hún", "pfn", "ÞFET"), _LANGA, "opersonuleg", op=("langa", "ÞF")),
    H(3, "[Hann] vantar nýja fótboltaskó.", "Honum", ("hann", "pfn", "ÞFET"), _VANTA, "opersonuleg", op=("vanta", "ÞF")),
    H(3, "[Þig] vantar bara meiri æfingu.", "Þér", ("þú", "pfn", "ÞFET"), _VANTA, "opersonuleg", op=("vanta", "ÞF")),
    H(4, "[Mig] dreymdi skrýtinn draum í nótt.", "Mér", ("ég", "pfn", "ÞFET"), _DREYMA, "opersonuleg", op=("dreyma", "ÞF")),
    H(4, "[Mig] minnir að prófið sé á föstudaginn.", "Mér", ("ég", "pfn", "ÞFET"),
      "*Mig minnir* (ég held að ég muni það rétt): frumlagið er í **þolfalli**, ekki þágufalli.",
      "opersonuleg", op=("minna", "ÞF")),
    H(4, "[Mig] grunar að hann hafi gleymt þessu.", "Mér", ("ég", "pfn", "ÞFET"),
      "Sögnin *gruna* tekur frumlag í **þolfalli**: *mig grunar*, *hana grunar*.", "opersonuleg", op=("gruna", "ÞF")),
    H(4, "[Mig] klæjar í nefið.", "Mér", ("ég", "pfn", "ÞFET"),
      "Sögnin *klæja* tekur frumlag í **þolfalli**: *mig klæjar*, *hann klæjar*.", "opersonuleg", op=("klæja", "ÞF")),
    H(4, "[Strákana] langar að spila fótbolta í frímínútunum.", "Strákunum", ("strákur", "kk", "ÞFFTgr"),
      _LANGA + " Það á líka við um nafnorð: *strákana langar*.", "opersonuleg", op=("langa", "ÞF")),
    H(4, "[Krakkana] vantar fleiri bolta.", "Krökkunum", ("krakki", "kk", "ÞFFTgr"),
      _VANTA + " Það á líka við um nafnorð: *krakkana vantar*.", "opersonuleg", op=("vanta", "ÞF")),
    H(4, "[Stelpuna] langaði mest í ís.", "Stelpunni", ("stelpa", "kvk", "ÞFETgr"),
      _LANGA + " Það á líka við um nafnorð: *stelpuna langaði*.", "opersonuleg", op=("langa", "ÞF")),
    H(4, "[Hann] hlakkar mikið til jólanna.", "Honum", ("hann", "pfn", "NFET"), _HLAKKA, "opersonuleg", nf="hlakka"),
    H(4, "[Hún] kvíðir fyrir prófinu á morgun.", "Henni", ("hún", "pfn", "NFET"),
      "*Kvíða fyrir* tekur frumlag í **nefnifalli**: *ég kvíði fyrir*, *hún kvíðir fyrir*.", "opersonuleg", nf="kvíða"),
    H(4, "[Ég hlakka] til sumarsins.", "Mér hlakkar", [("ég", "pfn", "NFET"), ("hlakka", "so", "GM-FH-NT-1P-ET")],
      _HLAKKA, "opersonuleg", nf="hlakka"),
    H(4, "[Ég hlakka] svo til að fara í ferðalagið.", "Mig hlakkar", [("ég", "pfn", "NFET"), ("hlakka", "so", "GM-FH-NT-1P-ET")],
      _HLAKKA, "opersonuleg", nf="hlakka"),
    H(5, "[Mig] syfjar alltaf eftir matinn.", "Mér", ("ég", "pfn", "ÞFET"),
      "Sögnin *syfja* tekur frumlag í **þolfalli**: *mig syfjar*, *hana syfjar*.", "opersonuleg", op=("syfja", "ÞF")),
    H(5, "[Hana] dreymdi að hún gæti flogið.", "Henni", ("hún", "pfn", "ÞFET"), _DREYMA, "opersonuleg", op=("dreyma", "ÞF")),

    # ---- ég vill
    H(3, "Ég [vil] fá að vita svarið.", "vill", ("vilja", "so", "GM-FH-NT-1P-ET"), _VIL, "sogn_frumlag"),
    H(3, "Ég [vil] ekki fara heim strax.", "vill", ("vilja", "so", "GM-FH-NT-1P-ET"), _VIL, "sogn_frumlag"),
    H(4, "Mamma veit að ég [vil] frekar vera heima.", "vill", ("vilja", "so", "GM-FH-NT-1P-ET"), _VIL, "sogn_frumlag"),

    # ---- eignarfall á eftir forsetningum og sögnum
    H(4, "Kóngurinn sendi bréf til [drottningar] Danmerkur.", "drottningu", ("drottning", "kvk", "EFET"),
      "*Til* stýrir **eignarfalli**. " + _ING + ": *drottning – til drottningar*.", "ef,fallstjorn_fs", gov=("til", "ef")),
    H(4, "Gatan var breikkuð vegna [aukningar] á umferð.", "aukningu", ("aukning", "kvk", "EFET"),
      "*Vegna* stýrir **eignarfalli**. " + _ING + ": *aukning – vegna aukningar*.", "ef,fallstjorn_fs", gov=("vegna", "ef")),
    H(4, "Leiknum var frestað vegna [rigningar].", "rigningu", ("rigning", "kvk", "EFET"),
      "*Vegna* stýrir **eignarfalli**. " + _ING + ": *rigning – vegna rigningar*.", "ef,fallstjorn_fs", gov=("vegna", "ef")),
    H(4, "Ég missti af myndinni vegna [æfingarinnar].", "*æfingunnar", ("æfing", "kvk", "EFETgr"),
      "*Vegna* stýrir **eignarfalli**: *æfing – æfingar – æfingarinnar*. *Æfingunnar* er ekki rétt beygingarmynd.",
      "ef,fallstjorn_fs", gov=("vegna", "ef")),
    H(4, "Skólinn þarf fleiri stofur vegna [fjölgunar] nemenda.", "fjölgun", ("fjölgun", "kvk", "EFET"),
      "*Vegna* stýrir **eignarfalli**. Orð sem enda á *-un* fá *-unar* í eignarfalli: *fjölgun – vegna fjölgunar*.",
      "ef,fallstjorn_fs", gov=("vegna", "ef")),
    H(4, "Skólanum var lokað vegna [bilunar] í hitakerfinu.", "bilun", ("bilun", "kvk", "EFET"),
      "*Vegna* stýrir **eignarfalli**. Orð sem enda á *-un* fá *-unar* í eignarfalli: *bilun – vegna bilunar*.",
      "ef,fallstjorn_fs", gov=("vegna", "ef")),
    H(4, "Við komumst ekki til [Akureyrar] vegna veðurs.", "Akureyri", ("Akureyri", "kvk", "EFET"),
      "*Til* stýrir **eignarfalli**: *Akureyri – til Akureyrar*.", "ef,fallstjorn_fs", gov=("til", "ef")),
    H(4, "Hún gerði þetta allt án [hjálpar].", "hjálp", ("hjálp", "kvk", "EFET"),
      "*Án* stýrir **eignarfalli**: *hjálp – án hjálpar*.", "ef,fallstjorn_fs", gov=("án", "ef")),
    H(5, "Hún fór til [læknis] í morgun.", "*læknirs", ("læknir", "kk", "EFET"),
      "*Til* stýrir eignarfalli. " + _LAEKNIR + ": *læknir – lækni – lækni – læknis*.", "ending,ef", gov=("til", "ef")),
    H(4, "Ég sakna [þín] mjög mikið.", "þig", ("þú", "pfn", "EFET"),
      "Sögnin *sakna* stýrir **eignarfalli**: *ég sakna þín*, *hún saknar hans*.", "ef,fallstjorn_so", gov=("sakna", "ef")),
    H(4, "Hún saknar [hans] á hverjum degi.", "hann", ("hann", "pfn", "EFET"),
      "Sögnin *sakna* stýrir **eignarfalli**: *ég sakna þín*, *hún saknar hans*.", "ef,fallstjorn_so", gov=("sakna", "ef")),

    # ---- háttur: ef + framsöguháttur; þótt, vona að, halda að, vilja að + viðtengingarháttur
    H(4, "Ég kem á morgun ef ég [hef] tíma.", "hafi", ("hafa", "so", "GM-FH-NT-1P-ET"), _ef("ef ég hef tíma"), "hattur"),
    H(4, "Við förum í fjallgöngu ef veðrið [er] gott.", "sé", ("vera", "so", "GM-FH-NT-3P-ET"), _ef("ef veðrið er gott"), "hattur"),
    H(4, "Láttu mig vita ef hann [kemur] ekki.", "komi", ("koma", "so", "GM-FH-NT-3P-ET"), _ef("ef hann kemur ekki"), "hattur"),
    H(5, "Ef þú [vilt] get ég hjálpað þér.", "viljir", ("vilja", "so", "GM-FH-NT-2P-ET"), _ef("ef þú vilt"), "hattur"),
    H(4, "Hann fór út að hjóla þótt það [væri] rigning.", "var", ("vera", "so", "GM-VH-ÞT-3P-ET"), _THOTT, "hattur"),
    H(4, "Hún mætti í skólann þó að hún [væri] lasin.", "var", ("vera", "so", "GM-VH-ÞT-3P-ET"), _THOTT, "hattur"),
    H(4, "Ég vona að þú [komir] í afmælið mitt.", "kemur", ("koma", "so", "GM-VH-NT-2P-ET"),
      "Á eftir *vona að* stendur **viðtengingarháttur**, því að þetta er ósk en ekki staðreynd: *ég vona að þú komir*.",
      "hattur"),
    H(4, "Ég held að hann [sé] heima.", "er", ("vera", "so", "GM-VH-NT-3P-ET"),
      "Á eftir *halda að* stendur **viðtengingarháttur**, því að þetta er skoðun en ekki vissa: "
      "*ég held að hann sé heima*. En: *ég veit að hann er heima*.", "hattur"),
    H(5, "Mamma vill að ég [taki] til í herberginu.", "tek", ("taka", "so", "GM-VH-NT-1P-ET"),
      "Á eftir *vilja að* stendur **viðtengingarháttur**: *hún vill að ég taki til*.", "hattur"),

    # ---- hvor annar, hvor og hvorugur
    H(5, "Jón og Gunnar hjálpuðu [hvor] öðrum með verkefnið.", "hvorum", ("hvor", "fn", "KK-NFET"),
      _HVOR + ": *þeir hjálpuðu hvor öðrum*.", "hvor", parse=False),
    H(5, "Anna og Sigga sakna [hvor] annarrar.", "hvorrar", ("hvor", "fn", "KVK-NFET"),
      _HVOR + ": *þær sakna hvor annarrar*.", "hvor", parse=False),
    H(5, "Vinirnir tveir treysta [hvor] öðrum.", "hvorum", ("hvor", "fn", "KK-NFET"),
      _HVOR + ": *þeir treysta hvor öðrum*.", "hvor", parse=False),
    H(5, "Tvíburarnir töluðu [hvor við] annan allt kvöldið.", "við hvorn", [("hvor", "fn", "KK-NFET"), ("við", "fs", "")],
      _HVOR_FS + ": *þeir töluðu hvor við annan*.", "hvor"),
    H(5, "Systurnar tvær horfðu [hvor á] aðra og hlógu.", "á hvora", [("hvor", "fn", "KVK-NFET"), ("á", "fs", "")],
      _HVOR_FS + ": *þær horfðu hvor á aðra*.", "hvor"),
    H(5, "[Hvor] ykkar tveggja á þessa úlpu?", "Hver", ("hvor", "fn", "KK-NFET"),
      "Þegar valið er á milli **tveggja** er í vönduðu máli notað *hvor*; *hver* er notað um þrjá eða fleiri.", "hvor"),
    H(5, "[Hvorugur] strákanna mundi eftir lyklunum.", "Hvorugt", ("hvorugur", "fn", "KK-NFET"),
      "*Hvorugur* lagar sig að kyni þeirra sem talað er um: *hvorugur strákanna*, *hvorug stelpnanna*, *hvorugt barnanna*.",
      "hvor,kyn_samraemi"),
    H(5, "Hvorugur þeirra [vildi] byrja.", "vildu", ("vilja", "so", "GM-FH-ÞT-3P-ET"),
      "*Hvorugur* er eintala þótt talað sé um tvo, og sögnin lagar sig að því: *hvorugur þeirra vildi*.",
      "hvor,sogn_frumlag"),
    H(5, "Hvorugt liðið [skoraði] í fyrri hálfleik.", "skoruðu", ("skora", "so", "GM-FH-ÞT-3P-ET"),
      "*Hvorugt liðið* er eintala þótt talað sé um tvö lið, og sögnin lagar sig að því: *hvorugt liðið skoraði*.",
      "hvor,sogn_frumlag"),

    # ---- nýja þolmyndin
    H(5, "Í gær var [henni strítt] í skólanum.", "strítt henni", [("hún", "pfn", "ÞGFET"), ("stríða", "so", "GM-SAGNB")],
      "Í vönduðu máli stendur fornafnið á undan lýsingarhættinum: *Í gær var henni strítt* eða *Henni var strítt í gær*. " + _NY,
      "tholmynd"),
    H(5, "Um kvöldið var [mér boðið] í mat hjá ömmu.", "boðið mér", [("ég", "pfn", "ÞGFET"), ("bjóða", "so", "LHÞT-SB-HK-NFET")],
      "Í vönduðu máli stendur fornafnið á undan lýsingarhættinum: *Um kvöldið var mér boðið* eða *Mér var boðið*. " + _NY,
      "tholmynd"),
    H(5, "Svo var [okkur sagt] að bíða fyrir utan.", "sagt okkur", [("ég", "pfn", "ÞGFFT"), ("segja", "so", "LHÞT-SB-HK-NFET")],
      "Í vönduðu máli stendur fornafnið á undan lýsingarhættinum: *Svo var okkur sagt* eða *Okkur var sagt*. " + _NY,
      "tholmynd"),
    H(5, "Eftir leikinn var [honum hrósað] fyrir markið.", "hrósað honum", [("hann", "pfn", "ÞGFET"), ("hrósa", "so", "GM-SAGNB")],
      "Í vönduðu máli stendur fornafnið á undan lýsingarhættinum: *Eftir leikinn var honum hrósað* eða *Honum var hrósað*. " + _NY,
      "tholmynd"),
    H(5, "Í morgun var [hún skömmuð] fyrir að koma of seint.", "skammað hana", [("hún", "pfn", "NFET"), ("skamma", "so", "LHÞT-SB-KVK-NFET")],
      "Í þolmynd verður andlagið (*hana*) að frumlagi í nefnifalli og lýsingarhátturinn lagar sig að því: "
      "*hún var skömmuð*. *Það var skammað hana* er kallað nýja þolmyndin; hún heyrist oft í talmáli "
      "en er ekki notuð í vönduðu ritmáli.", "tholmynd"),

    # ---- töluorð með fleirtöluorðum
    H(4, "Ég keypti [tvennar] buxur á útsölunni.", "tvær", ("tvennur", "lo", "FSB-KVK-ÞFFT"),
      "*Buxur* er fleirtöluorð: það er aðeins til í fleirtölu. " + _FLT + ": *tvennar buxur*.", "fleirtoluord"),
    H(4, "Á ganginum eru [þrennar] dyr.", "þrjár", ("þrennur", "lo", "FSB-KVK-NFFT"),
      "*Dyr* er fleirtöluorð: það er aðeins til í fleirtölu. " + _FLT + ": *þrennar dyr*.", "fleirtoluord"),
    H(4, "Amma á [tvenn] gleraugu.", "tvö", ("tvennur", "lo", "FSB-HK-ÞFFT"),
      "*Gleraugu* er fleirtöluorð: það er aðeins til í fleirtölu. " + _FLT + ": *tvenn gleraugu*.", "fleirtoluord"),
    H(4, "Í skúffunni eru [tvenn] skæri.", "tvö", ("tvennur", "lo", "FSB-HK-NFFT"),
      "*Skæri* er fleirtöluorð: það er aðeins til í fleirtölu. " + _FLT + ": *tvenn skæri*.", "fleirtoluord"),
    H(5, "Hljómsveitin hélt [tvenna] tónleika um helgina.", "tvo", ("tvennur", "lo", "FSB-KK-ÞFFT"),
      "*Tónleikar* er fleirtöluorð: það er aðeins til í fleirtölu. " + _FLT + ": *tvennir tónleikar*, *tvenna tónleika*.",
      "fleirtoluord"),
    H(5, "Liðið vann [þrenn] verðlaun á mótinu.", "þrjú", ("þrennur", "lo", "FSB-HK-ÞFFT"),
      "*Verðlaun* er fleirtöluorð: það er aðeins til í fleirtölu. " + _FLT + ": *þrenn verðlaun*.", "fleirtoluord"),
    H(5, "Við höfum haldið [fern] jól í þessu húsi.", "fjögur", ("fern", "lo", "FSB-HK-ÞFFT"),
      "*Jól* er fleirtöluorð: það er aðeins til í fleirtölu. " + _FLT + ": *fern jól*.", "fleirtoluord"),

    # ---- beygingarmyndir: -ir-orð, fætur og fingur, kýr, tölva, hönd, frændsemisorð, sagnir
    H(3, "Tveir [læknar] vinna á heilsugæslunni.", "*læknirar", ("læknir", "kk", "NFFT"),
      _LAEKNIR + ": *læknir – læknar*, eins og *hellir – hellar*.", "ending"),
    H(4, "Ég á tíma hjá [lækninum] á morgun.", "*læknirnum", ("læknir", "kk", "ÞGFETgr"),
      _LAEKNIR + ": *læknirinn – lækninn – lækninum – læknisins*.", "ending"),
    H(4, "Við gengum inn í [hellinn] með vasaljós.", "hellirinn", ("hellir", "kk", "ÞFETgr"),
      "*Hellirinn* er nefnifall. *-ir* er ending nefnifallsins og dettur út í þolfalli: *inn í hellinn*.",
      "ending,nf_aukafall"),
    H(4, "Það eru margir [hellar] á Íslandi.", "*hellirar", ("hellir", "kk", "NFFT"),
      "*-ir* í *hellir* er ending nefnifallsins og dettur út í fleirtölu: *hellir – hellar*, eins og *læknir – læknar*.",
      "ending"),
    H(3, "[Fæturnir] á mér eru ískaldir.", "*Fæturnar", ("fótur", "kk", "NFFTgr"), _FOTUR, "ending"),
    H(4, "Ég þvoði mér um [fæturna] eftir leikinn.", "*fæturnar", ("fótur", "kk", "ÞFFTgr"), _FOTUR, "ending"),
    H(4, "[Fingurnir] voru alveg frosnir eftir snjókastið.", "*Fingurnar", ("fingur", "kk", "NFFTgr"),
      "*Fingur* er karlkynsorð: *fingurnir* (nefnifall) og *fingurna* (þolfall). Endingin *-nar* er kvenkyn (*hendurnar*).",
      "ending"),
    H(5, "[Veturnir] á Íslandi eru langir og dimmir.", "*Veturnar", ("vetur", "kk", "NFFTgr"),
      "*Vetur* er karlkynsorð: *veturnir* (nefnifall) og *veturna* (þolfall, *á veturna*). Endingin *-nar* er kvenkyn.",
      "ending"),
    H(3, "[Kýrin] stóð úti á túni.", "*Kúin", ("kýr", "kvk", "NFETgr"),
      "*Kýr* beygist óreglulega: *kýr – kú – kú – kýr*. Í nefnifalli er því *kýrin*; *kúna* er þolfall.", "ending"),
    H(4, "Þetta er stærsta [kýr] sem ég hef séð.", "kú", ("kýr", "kvk", "NFET"),
      "*Kýr* beygist óreglulega: *kýr – kú – kú – kýr*. Hér á að vera nefnifall: *þetta er kýr*.", "ending"),
    H(3, "[Tölvan] mín er orðin mjög hæg.", "*Talvan", ("tölva", "kvk", "NFETgr"), _TOLVA, "hljodvarp"),
    H(3, "Það er ný [tölva] í stofunni okkar.", "*talva", ("tölva", "kvk", "NFET"), _TOLVA, "hljodvarp"),
    H(3, "Viltu rétta mér [höndina]?", "*hendina", ("hönd", "kvk", "ÞFETgr"), _HOND + " Í þolfalli er *höndina*.", "hljodvarp", parse=False),
    H(4, "[Höndin] á mér er bólgin.", "*Hendin", ("hönd", "kvk", "NFETgr"), _HOND + " Í nefnifalli er *höndin*.", "hljodvarp"),
    H(3, "Hann [dró] sleðann upp brekkuna.", "*dróg", ("draga", "so", "GM-FH-ÞT-3P-ET"),
      "Þátíðin af *draga* er *dró*, án *g*: *ég dró, hann dró* — en *við drógum*.", "ending"),
    H(3, "Hún [hló] að brandaranum.", "*hlóg", ("hlæja", "so", "GM-FH-ÞT-3P-ET"),
      "Þátíðin af *hlæja* er *hló*, án *g*: *ég hló, hún hló* — en *við hlógum*.", "ending"),
    H(5, "Þjálfarinn [réð] því hverjir fengu að byrja.", "réði", ("ráða", "so", "GM-FH-ÞT-3P-ET"),
      "Þátíðin af *ráða* er í vönduðu máli *réð*: *ég réð, hann réð*. *Réði* er viðtengingarháttur: *þótt hann réði*.",
      "ending"),
    H(4, "Ég [kveið] mikið fyrir prófinu.", "*kvíddi", ("kvíða", "so", "GM-FH-ÞT-1P-ET"),
      "*Kvíða* er sterk sögn og fær enga endingu í þátíð: *kvíða – kveið – kviðum – kviðið*.", "sterk_veik_sogn"),
    H(3, "[Kauptu] mjólk á leiðinni heim.", "Keyptu", ("kaupa", "so", "GM-BH-ET"),
      "Boðhátturinn er myndaður af nafnhættinum *kaupa*: *kauptu!* *Keyptu* er þátíð: *þau keyptu mjólk*.", ""),
    H(4, "Ég fór í bíó með [systur] minni.", "systir", ("systir", "kvk", "ÞGFET"),
      "*Systir* " + _FRAENDSEMI + " *systur*: *systir – systur – systur – systur*.", "nf_aukafall"),
    H(4, "Hann hitti [bróður] sinn í bænum.", "bróðir", ("bróðir", "kk", "ÞFET"),
      "*Bróðir* " + _FRAENDSEMI + " *bróður*: *bróðir – bróður – bróður – bróður*.", "nf_aukafall"),
    H(4, "Hún líkist [móður] sinni mjög mikið.", "móðir", ("móðir", "kvk", "ÞGFET"),
      "*Móðir* " + _FRAENDSEMI + " *móður*: *móðir – móður – móður – móður*.", "nf_aukafall"),
    H(4, "Þau fóru í heimsókn til [dóttur] sinnar.", "dóttir", ("dóttir", "kvk", "EFET"),
      "*Dóttir* " + _FRAENDSEMI + " *dóttur*: *dóttir – dóttur – dóttur – dóttur*.", "nf_aukafall", gov=("til", "ef")),
    H(5, "Þetta er bíll [föður] míns.", "*föðurs", ("faðir", "kk", "EFET"),
      "*Faðir* beygist: *faðir – föður – föður – föður*. Eignarfallið fær ekkert *-s*.", "ending,ef"),
    H(4, "Hún fékk góðar [einkunnir] í vor.", "*einkannir", ("einkunn", "kvk", "ÞFFT"),
      "Fleirtalan af *einkunn* er *einkunnir*, með *u*: *einkunn – einkunnir*.", "ending"),
    H(5, "Það eru þrjár [hurðir] á bílskúrnum.", "hurðar", ("hurð", "kvk", "NFFT"),
      "Fleirtalan af *hurð* er í vönduðu máli *hurðir*. *Hurðar* er eignarfall eintölu.", "ending"),

    # ---- að eða af
    H(4, "Ég leitaði [að] símanum mínum í allan dag.", "af", ("að", "fs", ""), "Maður *leitar að* einhverju — með *að*, ekki *af*.", "ad_af"),
    H(4, "Krakkarnir hlógu [að] brandaranum.", "af", ("að", "fs", ""), "Maður *hlær að* einhverju — með *að*, ekki *af*.", "ad_af"),
    H(4, "Ekki gera grín [að] litla bróður þínum.", "af", ("að", "fs", ""), "Orðasambandið er *gera grín að* einhverjum — með *að*.", "ad_af"),
    H(4, "Ég er mjög stolt [af] systur minni.", "að", ("af", "fs", ""), "Maður er *stoltur af* einhverju — með *af*.", "ad_af"),
    H(5, "Hún hefur mjög gaman [af] tónlist.", "að", ("af", "fs", ""),
      "Í vönduðu máli er sagt *hafa gaman af* einhverju — en *það er gaman að* einhverju.", "ad_af"),
    H(4, "Við komumst [að] því að búðin var lokuð.", "af", ("að", "fs", ""),
      "*Komast að* einhverju þýðir að uppgötva það. *Komast af* þýðir að bjarga sér.", "ad_af"),
    H(5, "Hann móðgaðist [að] ástæðulausu.", "af", ("að", "fs", ""), "Orðasambandið er *að ástæðulausu* — með *að*.", "ad_af"),
    H(5, "[Að] mínu mati er þetta besta bókin.", "Af", ("að", "fs", ""), "Orðasambandið er *að mínu mati* — með *að*.", "ad_af"),
    H(4, "Það er nóg [af] mat handa öllum.", "að", ("af", "fs", ""), "*Nóg af*, *mikið af*, *fullt af* einhverju — með *af*.", "ad_af"),
    H(4, "Kennarinn spurði mig [að] þessu í gær.", "af", ("að", "fs", ""), "Maður *spyr að* einhverju — með *að*, ekki *af*.", "ad_af"),
    H(5, "Þetta er [að] mörgu leyti góð hugmynd.", "af", ("að", "fs", ""), "Orðasambandið er *að mörgu leyti*, *að öllu leyti* — með *að*.", "ad_af"),
    H(5, "Margir urðu vitni [að] atvikinu.", "af", ("að", "fs", ""), "Orðasambandið er *verða vitni að* einhverju — með *að*.", "ad_af"),
    H(4, "[Að] sjálfsögðu máttu koma með.", "Af", ("að", "fs", ""), "Orðasambandið er *að sjálfsögðu* — með *að*.", "ad_af", parse=False),
    H(5, "Ég dáist [að] henni fyrir þetta.", "af", ("að", "fs", ""), "Maður *dáist að* einhverjum — með *að*, ekki *af*.", "ad_af"),

    # ---- samtengingar: hvort/ef, en/enn, fyrst/víst, hvorki … né, sem (að)
    H(4, "Ég veit ekki [hvort] hún kemur í kvöld.", "ef", ("hvort", "st", ""), _HVORT, "samtengingar"),
    H(4, "Spurðu kennarann [hvort] við megum fara út.", "ef", ("hvort", "st", ""), _HVORT, "samtengingar"),
    H(4, "Hann er stærri [en] ég.", "enn", ("en", "st", ""),
      "Samtengingin *en* (með einu n) kemur á eftir miðstigi: *stærri en ég*. *Enn* (með tveimur n) þýðir „ennþá“.",
      "samtengingar"),
    H(4, "Ertu [enn] að bíða eftir strætó?", "en", ("enn", "ao", ""),
      "*Enn* (með tveimur n) þýðir „ennþá“. *En* (með einu n) er samtenging: *stærri en ég*, *ég kom en hún fór*.",
      "samtengingar", also=["ennþá"]),
    H(3, "[Fyrst] þú ert búinn að læra máttu fara út.", "Víst", ("fyrst", "st", ""), _FYRST, "samtengingar", parse=False),
    H(3, "Við skulum fara heim [fyrst] það er farið að rigna.", "víst", ("fyrst", "st", ""), _FYRST, "samtengingar"),
    H(4, "Ég á hvorki hund [né] kött.", "eða", ("né", "st", ""), _HVORKI, "samtengingar"),
    H(4, "Hún borðar hvorki fisk [né] kjöt.", "eða", ("né", "st", ""), _HVORKI, "samtengingar"),
    H(5, "Þetta er strákurinn [sem] ég sagði þér frá.", "sem að", ("sem", "st", ""),
      "Í vönduðu máli stendur *sem* eitt, án *að*: *strákurinn sem ég sagði þér frá*.", "samtengingar"),
    H(5, "Láttu mig vita [þegar] þú ert komin heim.", "þegar að", ("þegar", "st", ""),
      "Í vönduðu máli stendur *þegar* eitt, án *að*: *þegar þú ert komin heim*.", "samtengingar"),

    # ---- stafsetning: y/ý/ey og n/nn
    H(3, "Ég [týndi] símanum mínum í gær.", "tíndi", ("týna", "so", "GM-FH-ÞT-1P-ET"),
      "*Týna* (missa eitthvað) er með *ý*: *ég týndi símanum*. *Tína* (tína ber eða blóm) er með *í*.", "y_i"),
    H(3, "Mamma [leyfði] mér að vaka lengur.", "leifði", ("leyfa", "so", "GM-FH-ÞT-3P-ET"),
      "*Leyfa* (gefa leyfi) er með *ey*: *mamma leyfði mér*. *Leifa* (skilja eftir mat á diskinum) er með *ei*.", "y_i"),
    H(3, "Viltu [sýna] mér myndirnar?", "sína", ("sýna", "so", "GM-NH"),
      "*Sýna* (láta sjá) er með *ý*, skylt orðinu *sjón*. *Sína* er mynd af fornafninu *sinn*: *hún tók bókina sína*.", "y_i", parse=False),
    H(3, "Ég á þrjú [systkini].", "*systkyni", ("systkini", "hk", "ÞFFT"),
      "*Systkini* er skrifað með *i* í endingunni, eins og *feðgin* og *mæðgin*.", "y_i"),
    H(3, "Leikurinn [byrjar] klukkan átta.", "*birjar", ("byrja", "so", "GM-FH-NT-3P-ET"),
      "*Byrja* er skrifað með *y*: *byrja – byrjar – byrjun*.", "y_i"),
    H(4, "Hann [skildi] ekki spurninguna.", "skyldi", ("skilja", "so", "GM-FH-ÞT-3P-ET"),
      "*Skildi* er þátíð af *skilja*, með *i*. *Skyldi* er af sögninni *skulu*: *hann skyldi gera það*.", "y_i"),
    H(3, "[Bókin] sem ég las var mjög spennandi.", "*Bókinn", ("bók", "kvk", "NFETgr"),
      "Greinirinn er með **einu n** í kvenkyni: *bókin, konan, stelpan*. Tvö n eru í karlkyni: *hesturinn*.", "n_nn"),
    H(3, "Systir mín er mjög [fyndin].", "fyndinn", ("fyndinn", "lo", "FSB-KVK-NFET"),
      _INN_KK + ": *hann er fyndinn* en *hún er fyndin*.", "n_nn"),
    H(3, "Bróðir minn er dálítið [feiminn].", "feimin", ("feiminn", "lo", "FSB-KK-NFET"),
      _INN_KK + ": *hann er feiminn* en *hún er feimin*.", "n_nn"),
    H(3, "Hún er [komin] heim úr skólanum.", "kominn", ("koma", "so", "LHÞT-SB-KVK-NFET"),
      "Lýsingarháttur sem endar á *-inn* hefur **tvö n** í karlkyni og **eitt n** í kvenkyni: "
      "*hann er kominn* en *hún er komin*.", "n_nn"),
    H(4, "[Morgunninn] var kaldur og bjartur.", "Morguninn", ("morgunn", "kk", "NFETgr"),
      "Orðið er *morgunn* í nefnifalli, með tveimur n, og greinirinn bætist við: *morgunninn*. "
      "*Morguninn* er þolfall: *ég svaf allan morguninn*.", "n_nn"),
    H(4, "[Engin] stelpa í bekknum æfir handbolta.", "Enginn", ("enginn", "fn", "KVK-NFET"),
      "*Enginn* (tvö n) er karlkyn: *enginn strákur*. *Engin* (eitt n) er kvenkyn: *engin stelpa*.", "n_nn"),

    # ---- samræmi, fornöfn, fallstjórn sagna, eitt orð eða tvö
    H(4, "Jón og Anna eru bæði mjög [þreytt] eftir ferðina.", "þreyttir", ("þreyttur", "lo", "FSB-HK-NFFT"),
      _BLANDAD + " þreytt*. *Þreyttir* á aðeins við um karla.", "kyn_samraemi"),
    H(4, "Strákurinn og stelpan voru [glöð] að sjá okkur.", "glaðir", ("glaður", "lo", "FSB-HK-NFFT"),
      _BLANDAD + " glöð*. *Glaðir* á aðeins við um karla.", "kyn_samraemi"),
    H(5, "Ég heyrði [eitthvert] hljóð úti í garði.", "eitthvað", ("einhver", "fn", ""),
      "Í vönduðu máli er *eitthvert* notað með nafnorði (*eitthvert hljóð*) en *eitthvað* stendur eitt og sér: "
      "*ég heyrði eitthvað*.", ""),
    H(4, "Ég sá [einhvern] mann fyrir utan húsið.", "*eitthvern", ("einhver", "fn", "KK-ÞFET"), _EINHVER, ""),
    H(4, "Það komu [einhverjir] krakkar í heimsókn.", "*eitthverjir", ("einhver", "fn", "KK-NFFT"), _EINHVER, ""),
    H(4, "Ég þori [því] ekki.", "það", ("það", "pfn", "ÞGFET"),
      "Sögnin *þora* stýrir **þágufalli**: *ég þori því ekki*.", "fallstjorn_so,thf_thgf"),
    H(4, "Ég nenni [því] ekki núna.", "það", ("það", "pfn", "ÞGFET"),
      "Sögnin *nenna* stýrir **þágufalli**: *ég nenni því ekki*.", "fallstjorn_so,thf_thgf", gov=("nenna", "þgf")),
    H(5, "Ég hef ekkert spáð í [það].", "því", ("það", "pfn", "ÞFET"),
      "Í vönduðu máli er sagt *spá í eitthvað*, með þolfalli: *ég hef ekkert spáð í það*.", "thf_thgf"),
    H(3, "[Af hverju] komstu ekki í gær?", "*Afhverju", [("af", "fs", ""), ("hver", "fn", "HK-ÞGFET")],
      "*Af hverju* er skrifað í tveimur orðum.", "", parse=False),
    H(4, "Leiknum var frestað [út af] veðrinu.", "*útaf", [("út", "ao", ""), ("af", "fs", "")],
      "*Út af* er skrifað í tveimur orðum.", ""),
]
