# -*- coding: utf-8 -*-
"""What an adjective is shown WITH, and whether it is compared.

BÍN gives every adjective 120 forms and says nothing about what it is said
of. The adjective table shows a helper noun beside every cell so that the
pupil sees an agreement and not a list of endings (*svört kona*, *svarta
konan*) — and until v6.13 that noun was *maður / kona / barn* for every
adjective there is: "ferskustu börnin", "augljós kona", "hálf börn",
"auðveldasta konan". BÍN also lists a comparative and a superlative for
adjectives nobody compares: "velkomnastir menn", "dauðari", "breskustu".

This file is the answer to both (critique item 30). Like noun_classes.py it
is knowledge about MEANING, written by hand, and it is only ever used to
leave something out: a helper noun that does not suit is not shown, a degree
nobody uses is not asked.

HELPER NOUNS
------------
Every adjective of the vocabulary was read and given one of:

  a helper set   three nouns, one per gender, that the adjective can be said
                 of in every degree and both numbers (`SETS`)
  its own nouns  where no set fits all three genders: *fullur bolli, full
                 flaska, fullt glas*; `-` for a gender it is not said of
                 (*ólétt kona* only) — the table is then not asked in that
                 gender
  nothing        the table is shown without a helper noun, as it was before
                 v6.2. This is where an adjective goes when in doubt, and
                 where an adjective not listed here goes: quantity words
                 (*margur, hálfur, einn*), and everything said mostly of
                 ideas, events or behaviour where no three nouns are natural,
                 and adjectives that need a complement to mean anything
                 (*líkur e-m*, *vanur e-u*, *viss um e-ð*)

The sets (what the adjective says something about):

  being    maður / kona / barn         people: feelings, character, states
  thing    bíll / bók / hús            colour, age, price, looks
  soft     koddi / peysa / teppi       clean, wet, soft, thick
  hot      drykkur / súpa / bað        temperature
  fruit    ávöxtur / appelsína / epli  taste and freshness
  idea     kostur / leið / svar        right, likely, simple, obvious
  time     dagur / ferð / kvöld        how something was: fun, long, awful
  place    staður / borg / land        safe, distant, peaceful
  room     gangur / stofa / herbergi   dark, bright, narrow, tidy
  animal   hundur / kisa / dýr         fierce, tame, furry, fat
  vehicle  bíll / lest / skip          fast, slow

Every helper noun must be in the vocabulary with all sixteen forms;
build_bundle.py stops if one is not.

NO COMPARISON
-------------
`NO_COMPARE` lists the adjectives whose miðstig and efsta stig are taken out
of the paradigm (build_lexicon.py), so that no table, analysis question or
cloze can show them. The rule, and the list was made by reading every
adjective against it:

  1. nationality and origin: *íslenskur, breskur, evrópskur, kaþólskur*
  2. a state one is in or is not: *dauður, óléttur, ófrískur, velkominn,
     tilbúinn, ómeiddur, nakinn, aleinn, ólæs, syndur*
  3. a meaning that is already absolute: *eilífur, endalaus, ódauðlegur,
     ósýnilegur, ómetanlegur, mögulegur, einstakur, heill, einn*; the -laus
     words that mean "has none" (*nafnlaus, atvinnulaus*); and compounds that
     already say "very" (*ískaldur, sjóðheitur, moldríkur, kolvitlaus*)
  4. adjectives that sort rather than describe: *daglegur, árlegur,
     opinber, stafrænn, skriflegur, líkamlegur, löglegur, læknisfræðilegur*
  5. colour compounds: *appelsínugulur, fjólublár* (the simple colour words
     are compared: *rauðari, svartastur*)
  6. four that are compared only in a figurative sense the helper noun does
     not have ("opnustu gluggarnir", "auðustu göturnar"): *opinn, auður,
     ómögulegur, sköllóttur*

Some of these can be compared in play or for emphasis ("íslenskari en allt
íslenskt"); a drill is not the place for that. An adjective is left OUT of
this list when in doubt — *rangur, fullkominn, sekur* are compared in real
use and stay.
"""


def _s(text):
    return set(text.split())


SETS = {
    "being": ("maður", "kona", "barn"),
    "thing": ("bíll", "bók", "hús"),
    "soft": ("koddi", "peysa", "teppi"),
    "hot": ("drykkur", "súpa", "bað"),
    "fruit": ("ávöxtur", "appelsína", "epli"),
    "idea": ("kostur", "leið", "svar"),
    "time": ("dagur", "ferð", "kvöld"),
    "place": ("staður", "borg", "land"),
    "room": ("gangur", "stofa", "herbergi"),
    "animal": ("hundur", "kisa", "dýr"),
    "vehicle": ("bíll", "lest", "skip"),
}

OF_SET = {
    "being": _s("""
afbrýðisamur afrískur afslappaður aleinn allsgáður almennilegur alsæll
alvarlegur amerískur asnalegur asískur atvinnulaus auðmjúkur auðugur
bandarískur banhungraður barnalegur berfættur bitur bjartsýnn bjánalegur
blankur blindur blíður brasilískur breskur bráðfyndinn bálreiður dapur
dauðhræddur dauðþreyttur djarfur duglegur dularfullur dyggur dónalegur
dökkhærður efnilegur egypskur eigingjarn einhleypur einkennilegur einlægur
einsamall elskulegur enskur erlendur evrópskur fatlaður feginn feiminn
fertugur fimmtugur fimur fjandsamlegur fjörugur flinkur fljótur forvitinn
frakkur framsýnn franskur frekur frjáls frjálslyndur frumlegur fráskilinn
frægur frískur fríður fróður fullorðinn furðulegur fyndinn fárveikur fátækur
fær fölur fúll gagnkynhneigður gamall glaðlegur glaður gleyminn glorhungraður
glorsoltinn glöggur grafkyrr grannur greindur grunsamlegur gráðugur
grímuklæddur grískur gáfaður gætinn góðhjartaður góður göfugur haltur
hamingjusamur heilbrigður heimilislaus heimskur heiðarlegur heiðvirður heppinn
hittinn hjálparlaus hjálplegur hjátrúarfullur hljóðlátur hljóður hlutlaus
hlýðinn hollenskur hraustlegur hraustur hreinlegur hreinskilinn hreykinn
hrifinn hrokafullur hryggur hræddur huglaus hugrakkur hugulsamur hundleiður
hungraður háttsettur hávaxinn hávær hæfileikaríkur hæfur hólpinn illgjarn
illkvittinn illur indverskur indæll innfæddur innilokaður japanskur jákvæður
kaldhæðinn kanadískur kaþólskur kjarkaður kjánalegur klár klókur kraftmikill
kristinn kröftugur kurteis kvefaður kvíðinn kátur kínverskur kóreskur laginn
laglegur lasinn latur laumulegur leiður lipur listrænn liðugur ljóshærður
ljúfur lofthræddur lyginn lágvaxinn lánsamur líflegur lítill mexíkóskur
miskunnarlaus miskunnsamur moldríkur montinn myndarlegur neikvæður
niðurbrotinn niðurdreginn nákvæmur næmur nærgætinn nýfluttur nýkominn opinskár
penn pólskur raunsær rausnarlegur rauðhærður reiðubúinn reyndur ringlaður
ruddalegur ráðríkur ráðvilltur réttlátur ríkur rólegur rór röskur rússneskur
saklaus samkynhneigður samvinnuþýður sanngjarn seinn sekur sjálfselskur
sjálfstæður sjálfsöruggur sjálfumglaður sjúkur skilningsríkur skondinn skoskur
skrítinn skrýtinn skynsamur skíthræddur slappur slægur smeykur sniðugur snjall
snöggur sorgmæddur spenntur spænskur staðfastur staðráðinn sterkur stjórnsamur
stoltur strangur stundvís stór stórhrifinn svangur sveittur svikull
svissneskur syfjaður syndur sár sáttur sæll sænskur sóðalegur taugaspenntur
taugaveiklaður taugaóstyrkur tilbúinn tilfinningalaus tortrygginn traustur
tregur tryggur trúaður trúr trúverðugur tvítugur umburðarlyndur undarlegur
unglegur ungur uppgefinn upptekinn valdamikill vandlátur vandræðalegur vansæll
vanþakklátur varkár varnarlaus veiklyndur veikur vinalegur vingjarnlegur
vinsamlegur virkur virtur virðulegur vitlaus vitur viðbúinn viðkunnanlegur
viðkvæmur vongóður vonsvikinn vænn ábyrgur ágengur áhrifamikill áhugasamur
áhyggjufullur ákafur ákveðinn ánægður áreiðanlegur ástfanginn ástralskur
ástríkur ástríðufullur áttavilltur ærlegur írskur íslenskur ítalskur ógiftur
óhamingjusamur óheiðarlegur óheppinn óhræddur óhultur óhæfur ókunnugur
ókurteis ólæs ómeiddur ónærgætinn óreyndur órólegur ósanngjarn óstyrkur
ósvífinn ósáttur óttalaus óttasleginn óábyrgur óánægður óöruggur
óútreiknanlegur óþekkur óþolinmóður óþroskaður öflugur öfundsjúkur örlátur
örvæntingarfullur öskureiður ýtinn þakklátur þolinmóður þreytulegur þrjóskur
þrár þrítugur þunglyndur þyrstur þægur þögull þýskur
"""),
    "thing": _s("""
appelsínugulur bleikur blár brúnn dökkur dýr fallegur fjólublár flottur fínn
glænýr glæsilegur grár grænn gullfallegur gulur hvítur ljós ljótur nútímalegur
nýlegur nýr pínulítill rauður rándýr svartur ódýr ónýtur
"""),
    "soft": _s("""
blautur hlýr hreinn mjúkur rakur rennblautur skítugur tandurhreinn óhreinn
þunnur þurr þykkur
"""),
    "hot": _s("""
heitur kaldur sjóðheitur volgur ískaldur
"""),
    "fruit": _s("""
ferskur girnilegur gómsætur hollur ljúffengur rotinn safaríkur sætur súr
"""),
    "idea": _s("""
algengur athyglisverður augljós auðveldur einfaldur eðlilegur fljótlegur
flókinn fáránlegur gagnlegur greinilegur heimskulegur hentugur heppilegur
hugsanlegur hárréttur líklegur mikilvægur mögulegur pottþéttur rangur réttur
rökréttur sennilegur sjálfsagður skiljanlegur skynsamlegur skýr tilvalinn
vafasamur áhrifaríkur áhugaverður óheppilegur óljós ólíklegur ómögulegur óskýr
"""),
    "time": _s("""
dásamlegur dæmigerður einstakur erfiður frábær fullkominn gleðilegur
hræðilegur langur leiðinlegur merkilegur notalegur rómantískur skelfilegur
skemmtilegur slæmur sorglegur stuttur stórkostlegur sérstakur venjulegur
vondur yndislegur ágætur ánægjulegur æðislegur ótrúlegur óvenjulegur ömurlegur
"""),
    "place": _s("""
afskekktur fagur fjarlægur friðsæll hættulegur nálægur öruggur
"""),
    "room": _s("""
bjartur dimmur huggulegur myrkur snyrtilegur þröngur
"""),
    "animal": _s("""
feitur grimmur horaður krúttlegur loðinn meinlaus tamur villtur árásargjarn
"""),
    "vehicle": _s("""
hraðskreiður hraður hægur
"""),
}

# Adjectives with nouns of their own: (masculine, feminine, neuter); None
# where the adjective is not said of anything of that gender.
OWN = {
    "nauðsynlegur": ("hlutur", "regla", "tæki"),
    "risastór": ("turn", "bygging", "hús"),
    "risavaxinn": ("turn", "bygging", "hús"),
    "auður": ("salur", "gata", "hús"),
    "beinn": ("vegur", "lína", "strik"),
    "brattur": ("stígur", "brekka", "fjall"),
    "dauður": ("fiskur", "fluga", "dýr"),
    "djúpur": ("brunnur", "tjörn", "vatn"),
    "dýrmætur": ("hringur", "gjöf", "málverk"),
    "forn": ("siður", "borg", "hús"),
    "fullur": ("bolli", "flaska", "glas"),
    "fágætur": ("fugl", "jurt", "dýr"),
    "gullinn": ("hringur", "keðja", "hálsmen"),
    "harður": ("steinn", "skel", "gólf"),
    "háll": ("stígur", "gata", "gólf"),
    "hár": ("turn", "bygging", "hús"),
    "kær": ("vinur", "vinkona", "barn"),
    "leynilegur": ("fundur", "leið", "bréf"),
    "lágur": ("veggur", "brú", "hús"),
    "lélegur": ("leikur", "mynd", "lag"),
    "léttur": ("kassi", "taska", "borð"),
    "merkur": ("maður", "kona", None),
    "mjór": ("vegur", "gata", "strik"),
    "náinn": ("vinur", "vinkona", "samband"),
    "nýfæddur": ("drengur", "stúlka", "barn"),
    "opinn": ("gluggi", "hurð", "hús"),
    "persónulegur": ("sigur", "skoðun", "bréf"),
    "sannur": ("vinur", "saga", "svar"),
    "sjaldgæfur": ("fugl", "jurt", "dýr"),
    "skakkur": ("turn", "mynd", "hús"),
    "skær": ("litur", "stjarna", "ljós"),
    "sköllóttur": ("maður", None, None),
    "tómur": ("kassi", "flaska", "glas"),
    "velkominn": ("gestur", None, None),
    "verðmætur": ("hringur", "gjöf", "málverk"),
    "vinsæll": ("leikur", "bók", "lag"),
    "ófrískur": (None, "kona", None),
    "óléttur": (None, "kona", None),
    "óvæntur": ("gestur", "heimsókn", "símtal"),
    "óþægilegur": ("stóll", "dýna", "rúm"),
    "þungur": ("kassi", "taska", "borð"),
    "þægilegur": ("stóll", "dýna", "rúm"),
}

# Read, and shown without a helper noun. Listed so that "nobody has looked at
# this adjective" and "somebody decided it gets none" are different things:
# `python3 adj_classes.py` prints the adjectives of the vocabulary that are
# in no list.
BARE = _s("""
afbrigðilegur afdráttarlaus afleitur agalegur alger algjör allmargur almennur
almáttugur alræmdur alslæmur alþjóðlegur andfúll andlegur andsetinn
andstyggilegur andstæður andvígur aumkunarverður aumur aðdáunarverður
bannsettur banvænn bensínlaus ber berskjaldaður blindfullur blákaldur blóðugur
borgaralegur brjálæðislegur brothættur brynvarinn bráður brýnn bærilegur
bókstaflegur bólginn daglegur dapurlegur daufur dauðadæmdur dauðlegur
djöfullegur dofinn dramatískur dulrænn dágóður dálítill dýrlegur eftirlýstur
eigin eilífur eineygður einmanalegur einn einstæður eintómur eiðsvarinn
endalaus endanlegur erfðafræðilegur faglegur fagmannlegur fallinn falskur
falur fanginn farsæll fastur feigur ferlegur fern fjárhagslegur fjölmargur
flatur forljótur formlegur friðsamlegur frumstæður frábrugðinn frágenginn
frátalinn frátekinn frækinn fræðilegur frír fullvaxinn fullviss
fyrirsjáanlegur fábrotinn fáliðaður fár færanlegur félagslegur fús gagnkvæmur
gagnslaus galinn gallalaus galopinn geggjaður gegnsær geislavirkur geðsjúkur
geðveikur gildur glæpsamlegur glæstur grimmilegur grunnur gríðarlegur grófur
guðdómlegur gáfulegur gífurlegur hagur hallærislegur harkalegur harðskeyttur
hefðbundinn heilagur heill heilmikill heimill heitinn heiður helgur helvískur
herfilegur hetjulegur himneskur hlægilegur hrikalegur hrottalegur hroðalegur
hryllilegur hrár hvass hálfgerður hálfnaður hálfur hæfilegur hörmulegur hýr
innantómur innilegur innlendur innrauður jafn jafngóður jafnmikill kafinn
karlmannlegur klassískur kleifur klikkaður kolvitlaus konunglegur kristilegur
krökkur kuldalegur kunnuglegur kunnugur kunnur kvenlegur kynferðislegur
kynþokkafullur lagalegur laus linur ljóðrænn látinn látlaus læknisfræðilegur
líffræðilegur lífrænn líkamlegur líkur löglegur mannlaus mannlegur margbrotinn
margur mattur megnugur mennskur merkingarlaus meðfæddur meðtalinn meðvitaður
mikilfenglegur mikill mildur miður mjallhvítur máttugur mátulegur móttekinn
móðursjúkur nafnlaus nakinn naumur nothæfur nákominn náttúrulegur náðugur
nægilegur nægur nógur nýbyrjaður nýbúinn ofbeldisfullur opinber persneskur
prýðilegur pólitískur rafmagnaður rafmagnslaus rammur raunverulegur reglulegur
rosalegur réttlætanlegur réttmætur rómanskur rómverskur róttækur rúmur
samankominn sameiginlegur samfelldur samsekur samþykkur sannkallaður sestur
siðferðislegur siðlaus siðmenntaður sjáanlegur sjálfbær sjálfvirkur sjónrænn
sjúklegur skammarlegur skammur skarpur skilvirkur skjótur skotheldur
skriflegur skuggalegur skyldur skyndilegur slakur smekklegur smár snar
snarklikkaður snaróður snilldarlegur snotur sovéskur spar staddur stafrænn
stakur steindauður stjarfur stjórnlaus styrkur stífur stórfenglegur stórfínn
stórhættulegur stökkur stöðugur svakalegur svalur svipaður svokallaður
svolítill syndugur sálfræðilegur sæmilegur sífelldur sígildur síðastliðinn
síðbúinn síður sögulegur sýnilegur tilfinningalegur tilgangslaus tilkomumikill
tiltækur trúarlegur trúlegur tvennur tvíkynhneigður tvöfaldur táknrænn
tæknilegur tækur tæpur tær tímabundinn umdeildur unaðslegur undanfarinn
undraverður undursamlegur uppfullur upphaflegur upplagður upprunalegur
uppréttur upptækur valdur valtur vanur varanlegur vaskur verulegur verðugur
vestrænn vesæll viss vitskertur viturlegur viðbjóðslegur viðriðinn viðstaddur
voldugur vonlaus voðalegur vægur vægðarlaus væminn væntanlegur vélráður vís
vísindalegur víður yfirfullur yfirnáttúrulegur yfirstaðinn áhættusamur árlegur
ástkær ástæðulaus ægilegur æsilegur ævilangur ítarlegur óaðfinnanlegur óbeinn
óboðinn óbreyttur óbærilegur ódauðlegur óendanlegur óeðlilegur óformlegur
ógeðfelldur ógeðslegur ógildur ógurlegur óheflaður óhefðbundinn óhjákvæmilegur
óhugnanlegur óháður ókominn ókunnur ólmur ólæstur ólíkur ólöglegur ólýsanlegur
ómerkilegur ómetanlegur ómótstæðilegur ónæmur óraunverulegur órjúfanlegur
ósjálfráður óspjallaður óstöðugur ósvikinn ósæmilegur óséður ósýnilegur
ótakmarkaður ótrúr óumflýjanlegur óvanur óvar óvirkur óviss óviðjafnanlegur
óviðráðanlegur óásættanlegur óður óþarfur óþekktur öfugur ölvaður örfár
örlítill útdauður útlægur útvalinn þarfur þeldökkur þokkafullur þokkalegur
þrefaldur þrennur þrunginn þver þybbinn
""")

NO_COMPARE = _s("""
bandarískur íslenskur enskur franskur breskur rússneskur kínverskur þýskur
ítalskur amerískur spænskur japanskur grískur írskur sænskur kanadískur
sovéskur skoskur asískur evrópskur rómverskur indverskur pólskur ástralskur
brasilískur hollenskur afrískur egypskur persneskur kóreskur svissneskur
rómanskur mexíkóskur kaþólskur helvískur

dauður velkominn tilbúinn viðbúinn reiðubúinn ómeiddur óhultur óléttur
ófrískur nakinn aleinn uppgefinn hólpinn feigur syndur allsgáður andsetinn
útvalinn meðfæddur ólæs einstæður

eilífur endalaus óendanlegur ódauðlegur dauðlegur ósýnilegur sjáanlegur
ómetanlegur óbreyttur ótakmarkaður órjúfanlegur ólýsanlegur óhjákvæmilegur
mögulegur hugsanlegur tilvalinn einstakur heill einn stakur nægilegur
endanlegur væntanlegur tiltækur tækur kleifur öfugur andstæður frír ónýtur
ástæðulaus nafnlaus rafmagnslaus atvinnulaus mannlaus
ískaldur sjóðheitur moldríkur snaróður kolvitlaus

daglegur árlegur opinber sameiginlegur gagnkvæmur tímabundinn upphaflegur
stafrænn lífrænn sjálfvirkur skotheldur innrauður skriflegur bókstaflegur
líkamlegur andlegur löglegur ólöglegur lagalegur trúarlegur kynferðislegur
líffræðilegur læknisfræðilegur sálfræðilegur sjónrænn fjárhagslegur
færanlegur ósjálfráður óbeinn óvirkur yfirnáttúrulegur sígildur samfelldur

opinn auður ómögulegur sköllóttur

appelsínugulur fjólublár
""")

_HELPER = {}
for _name, _words in OF_SET.items():
    for _w in _words:
        if _w in _HELPER or _w in OWN or _w in BARE:
            raise SystemExit("adj_classes.py: %s is listed twice" % _w)
        _HELPER[_w] = SETS[_name]
for _w, _three in OWN.items():
    if _w in BARE:
        raise SystemExit("adj_classes.py: %s is listed twice" % _w)
    _HELPER[_w] = _three


def helpers(lemma):
    """(masculine, feminine, neuter) helper nouns of an adjective — None for
    a gender it has none in — or None when it is shown without one."""
    return _HELPER.get(lemma)


def reviewed(lemma):
    return lemma in _HELPER or lemma in BARE


def compares(lemma):
    """False for an adjective whose comparative and superlative are not
    shown (see NO COMPARISON at the top)."""
    return lemma not in NO_COMPARE


def helper_nouns():
    """Every noun used as a helper, with its gender."""
    out = set()
    for three in list(SETS.values()) + list(OWN.values()):
        for noun, g in zip(three, ("kk", "kvk", "hk")):
            if noun:
                out.add((noun, g))
    return out


if __name__ == "__main__":
    import collections, json
    L = json.load(open("lexicon.json"))
    adj = [w["o"] for w in L["w"] if w["c"] == "lo"]
    print("adjectives:", len(adj), "| with a helper:", sum(1 for a in adj if helpers(a)),
          "| read, shown bare:", sum(1 for a in adj if a in BARE),
          "| in no list:", sorted(a for a in adj if not reviewed(a)))
    print("by set:", dict(collections.Counter(
        next((n for n, ws in OF_SET.items() if a in ws), "own" if a in OWN else "bare")
        for a in adj)))
    print("not compared:", sum(1 for a in adj if not compares(a)))
    gone = sorted(w for w in list(_HELPER) + list(BARE) + list(NO_COMPARE) if w not in set(adj))
    print("listed but not in the vocabulary:", gone)
