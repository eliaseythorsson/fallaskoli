# -*- coding: utf-8 -*-
"""Filtering the vocabulary that comes out of the corpus.

1. JUNK — lemma errors and fragments that produce broken exercises ("pú",
   "eð"). A quality filter, always on.

2. BLOCK — coarse words kept away from a child. Not a build-time decision:
   one build serves every user, so the list travels with the data
   (`DATA.blocked`, written by build_bundle.py) and the filtering happens in
   the browser, per user, from the administrator's `safeVocab` switch
   (core/policy.js, `buildLexicon` in core/lexicon.js). The switch is ON
   unless an administrator has explicitly turned it off (v6.13, item 9). FALLASKOLI_SAFE_VOCAB=1
   removes them at build time as well. Note that this is a different thing
   from `EXCLUDE` in noun_classes.py, which only keeps a word out of GENERATED
   sentences and is always on.

3. UNFIT — words for acts of violence and for the sex trade. Never drilled;
   always removed. See the list.

No filter may remove one reading of a homograph: filtering is on lemma AND
word class together, never on the lemma alone. That is what JUNK_PAIRS is for:
"ver" as a noun is a lemma error, but the verb "vera" and the preposition are
perfectly legitimate.
"""
import os

SAFE_MODE = os.environ.get("FALLASKOLI_SAFE_VOCAB", "") == "1"

# 1. Lemma errors, abbreviations and fragments. Always removed.
JUNK = set("""
pú pat eð los byr eng engi beta tía börur húnn
""".split())

# Words that are junk only in a particular word class: BÍN entries that are
# correct as look-ups but not a teenager's vocabulary — obsolete adjectives
# (*armur* = wretched, *bær* = permissible) and lemma errors (*formaður*,
# *litur*, *þráður* as adjectives). Short, hand-written and verified.
JUNK_PAIRS = {
    ("ver", "kk"), ("far", "hk"), ("not", "hk"), ("sinni", "hk"),
    ("gerð", "kvk"), ("átt", "kvk"), ("man", "hk"),
    # v5.5 — from the homograph additions after the cap was lifted
    ("armur", "lo"), ("bær", "lo"), ("formaður", "lo"), ("leikur", "lo"),
    ("litur", "lo"), ("lúður", "lo"), ("staður", "lo"), ("þráður", "lo"),
    ("augljós", "hk"), ("rót", "hk"), ("falur", "kk"), ("slægur", "kk"),
    # v6.4 — nouns that rank high only because one of their forms is a very
    # common verb, numeral or particle (*geta*, *koma*, *vera*, *fimm*), and
    # nouns met only inside a fixed phrase (*á kreik*, *á róli*, *í kaf*). As
    # table drills they were "fimm · eintala" and "geta · fleirtala".
    ("eiga", "kvk"), ("geta", "kvk"), ("koma", "kvk"), ("taka", "kvk"),
    ("vera", "kvk"), ("fimm", "hk"), ("ver", "hk"), ("átta", "kvk"),
    ("draga", "kvk"), ("horfa", "kvk"), ("baka", "kvk"), ("fár", "hk"),
    ("ári", "kk"), ("kyrra", "kvk"), ("bugur", "kk"), ("ból", "hk"),
    ("deli", "kk"), ("ess", "hk"), ("hark", "hk"), ("hel", "kvk"),
    ("iður", "hk"), ("jón", "kvk"), ("kaf", "hk"), ("krakk", "hk"),
    ("kreik", "hk"), ("leg", "hk"), ("mall", "hk"), ("mas", "hk"),
    ("pakk", "hk"), ("pass", "hk"), ("raf", "hk"), ("ról", "hk"),
    ("ræsi", "hk"), ("set", "hk"), ("sog", "hk"), ("sori", "kk"),
    ("star", "hk"), ("súr", "kk"), ("sær", "kk"), ("tog", "hk"),
    ("tott", "hk"), ("túli", "kk"), ("vik", "hk"), ("áni", "kk"),
    ("arða", "kvk"), ("for", "kvk"),
    # v6.5 — verbs. The same fault as the nouns above: a verb nobody uses
    # ranks among the commonest because one of its forms is a common word
    # (*kyrra* from *kyrr*, *anna* from *annað*, *manna* and *orða* from the
    # genitive plurals, *rússa* from *Rússa*), and the conjugation drill then
    # asked "ég ___ (að kyrra)" before it asked *að lesa*. With them go the
    # archaic doublets of common verbs (*eta*, *gjöra*; *hlægja* beside
    # *hlæja*) and verbs that live only in the middle voice or the imperative
    # (*rætast*, *fíflast*, *hunskastu*, *snautaðu*), whose active forms BÍN
    # lists and nobody says: "ég ræti", "við hunskum".
    ("kyrra", "so"), ("anna", "so"), ("rússa", "so"), ("kássa", "so"),
    ("tomma", "so"), ("mora", "so"), ("kraka", "so"), ("lana", "so"),
    ("hausa", "so"), ("hunska", "so"), ("eta", "so"), ("gjöra", "so"),
    ("hlægja", "so"), ("yggla", "so"), ("snáfa", "so"), ("snauta", "so"),
    ("hypja", "so"), ("ræta", "so"), ("manna", "so"), ("liða", "so"),
    ("hópa", "so"), ("óla", "so"), ("niðra", "so"), ("helta", "so"),
    ("fífla", "so"), ("djöfla", "so"), ("æxla", "so"), ("riðla", "so"),
    ("remba", "so"), ("sturla", "so"), ("mistaka", "so"),
    # v6.5 — words BÍN files as adjectives and the schoolbook does not. *ýmis*,
    # *þvílíkur* and *hvílíkur* are pronouns in every grammar a child is
    # taught from (óákveðið fornafn, spurnarfornafn), and *fyrstur* is the
    # ordinal *fyrsti*, a töluorð. As adjectives they produced an analysis
    # question whose "right" answer the teacher would mark wrong.
    ("ýmis", "lo"), ("þvílíkur", "lo"), ("hvílíkur", "lo"), ("fyrstur", "lo"),
    # *samur* is in the corpus only as *saman* and *samt* (adverbs), and
    # "samur maður" is not something a child has heard; *sami* is kept.
    ("samur", "fn"),
}

# 3. Words that are not drilled at all, in any table or as a bare form: words
# for acts of violence against people and for the sex trade, and the people
# named after those acts. The owner's decision (v6.5): a declension table of
# *nauðgun* or *fjöldamorð* teaches a child nothing that *ferð* and *borð* do
# not. Anatomical terms are NOT here — *typpi* and *píka* are just words, and
# stay (out of generated sentences, see noun_classes.EXCLUDE, and under the
# BLOCK filter below, which is on by default since v6.13). Nor are the words of war and history (*stríð*,
# *orrusta*, *her*, *bylting*) or of theft (*rán*, *þjófur*): a pupil meets
# those in a history book. Always removed, like JUNK; one line to extend.
UNFIT = set("""
aftaka blóðbað böðull dauðadómur dauðarefsing dráp fjöldamorð fjöldamorðingi
henging hryðjuverk hryðjuverkamaður launmorðingi leigumorðingi leyniskytta
mannrán mannæta morð morðingi morðmál nauðgari nauðgun raðmorðingi sjálfsmorð
skotbardagi skothríð skotárás tortíming útrýming ofbeldi mannfall árás
árásarmaður byssumaður
klám klámmynd nektarmynd vændi vændiskona mella melludólgur hóruhús fatafella
strippari
nauðga myrða kyrkja pynta lífláta kála misþyrma lúberja hálsbrjóta nefbrjóta
runka fróa totta hóra káfa
morðóður graður þroskaheftur hommalegur
""".split())

# 2. The vocabulary filter (item 9, v6.13). ON by default since v6.13: the
# administrator's `safeVocab` switch is read as "on unless an administrator has
# explicitly switched it off" (core/policy.js). It is applied in the browser,
# per user, from `DATA.blocked`; FALLASKOLI_SAFE_VOCAB=1 removes the words at
# build time as well.
#
# Why it had to grow. The frequency list is film subtitles, and in subtitles
# *tík* was the 54th commonest noun, *kynlíf* the 55th, *fáviti* the 145th and
# *píka* the 185th; a declension table of *píka* came up in an ordinary
# session. Every word in the lexicon can be served (the tail is only weighted
# down, never cut), so the list below was made by reading ALL of it in rank
# order — 3,698 nouns, 1,013 verbs, 970 adjectives, 732 adverbs and 19
# interjections (v6.13) — and checked against the usage labels of Íslensk
# nútímamálsorðabók (*gróft*, *niðrandi*).
#
# The measure: is this word worth a declension table for a 13–15-year-old,
# shown without context? Not "is it ever rude". So *rass*, *skítur*, *kúkur*,
# *piss*, *fífl*, *bjáni*, *asni* and *kjáni* stay — they are in children's
# books, and a filter that removes ordinary words teaches a child that the
# program is broken rather than that the words are rude. The words kept on
# purpose, with the reason, are listed after the groups (KEPT_ON_PURPOSE).
#
# Filtering is by lemma, in every word class it has (*helvíti* the noun and
# the adverb go together). A homograph that has an innocent reading in another
# class goes in BLOCK_PAIRS instead, with its class.
BLOCK = set("""
"""
# -- Sexual words and anatomical slang. Some are standard Icelandic
#    (*kynlíf*, *eista*, *sæði*), but none is drill vocabulary: a table of
#    *typpi* teaches nothing that *tré* does not, and makes the lesson about
#    something else. *limur* and *tittlingur* have older innocent senses
#    (limb, small bird); in this corpus they are the slang. *óspjallaður* is
#    here for its definition (ÍNO: "sem hefur ekki haft kynmök").
"""
kynlíf píka typpi pungur skaufi eista limur tittlingur tittur böllur drjóli
geirvarta snípur kynfæri sæði stinning standpína fullnæging smokkur
getnaðarvörn kynsjúkdómur lekandi kunta rassgat
kynþokkafullur kynferðislegur óspjallaður
"""
# -- Words for women and girls used as insults. *tík* is also the word for a
#    female dog; in this corpus it is overwhelmingly the insult, and *hundur*,
#    *hvolpur* and *kisa* cover the animal vocabulary. *drusla* also means a
#    rag, *herfa* a harrow — the same reasoning. *kerling* is NOT here: it is
#    "karl og kerling" in every folk tale.
"""
tík tæfa dræsa drusla kelling gála herfa hóra mella öfuguggi
"""
# -- Slurs: for people of colour, and *hvítingi*. *hommi* has been on this list
#    since v6.5 (the owner's decision: in the corpus it is mostly an insult).
#    *þeldökkur*, *samkynhneigður* and the other neutral, respectful terms stay.
"""
negri svertingi blökkumaður hvítingi hommi
"""
# -- Insults built on disability and mental illness, and the harsh ones.
#    The mild insults of children's books stay (fífl, bjáni, kjáni, asni,
#    auli, flón, heimskingi).
"""
fáviti hálfviti fábjáni geðsjúklingur skíthæll skítseiði drullusokkur
úrþvætti gerpi viðrini
"""
# -- Oaths. Their use in modern speech is the curse, not the meaning; in the
#    subtitles *fjandi* was the 10th commonest noun. *djöfullegur*
#    ("diabolical") is a literary adjective and stays. *skrambi* is the mildest
#    of them, but ÍNO defines it as "blótsyrði, andskoti, fjandi", and that
#    definition is what a vocabulary question would show. *skolli* likewise
#    ("vægt blótsyrði, fjári"; the older sense, fox, is not the one ÍNO gives),
#    and *bannsettur* (ÍNO: "blótsyrði"). *ansi* has the same label in ÍNO and
#    stays: it is the everyday "rather" of school prose. The adverb *ári*
#    ("vægt blótsyrði") is only ranked down: its one form is also *ári*, the
#    dative of *ár* (year), and blocking it would take that with it.
"""
andskoti andskotans djöfull djöfulli djöfullega fjandi fjári helvíti helvískur
skratti skrambi skolli bannsettur fokk
"""
# -- Drugs. The slang (*dópa*, *hass*, *jóna* = a joint) and the trade. The
#    neutral health-education words (*lyf*, *fíkill*, *áfengi*, *tóbak*) stay.
"""
eiturlyf fíkniefni hass jóna víma dópsali dópsala eiturlyfjasali
eiturlyfjasala dópa
"""
# -- Violence beyond what UNFIT already removes always. *fyrirfara* is in the
#    language only as *fyrirfara sér* (to kill oneself), which is not a drill
#    for this age group. *ofbeldisfullur* goes with *ofbeldi* (UNFIT).
#    The words of war and history stay (*stríð*, *hermaður*, *byssa* — see
#    KEPT_ON_PURPOSE).
"""
fyrirfara ofbeldisfullur
""".split())

# Homographs: blocked in one word class only. The verb *drulla* is *drulla
# sér* (gróft, ÍNO); the noun *drulla* is mud, and stays. The nouns *skutla*
# and *bomba* are here for their definition: ÍNO gives them as "kynþokkafull
# stúlka" and "kynþokkafull kona, kynbomba", and that is what a meaning
# question shows; the verb *skutla* (give a lift) stays.
BLOCK_PAIRS = {
    ("drulla", "so"),
    ("skutla", "kvk"), ("bomba", "kvk"),
}

# Borderline words read and deliberately KEPT, for the owner to overrule. Not
# used by the code; here so the decision is written down next to the list.
KEPT_ON_PURPOSE = {
    "byssa": "veiðar og saga (Íslendingar veiða rjúpu með byssu); down-ranked, not blocked",
    "ríða": "að ríða hesti — in every schoolbook; the slang sense is not the drill",
    "kerling": "karl og kerling í þjóðsögum",
    "aumingi": "aumingja barnið = poor child: the genitive is a neutral idiom",
    "kjaftæði": "common, mild; down-ranked",
    "lesbía": "the standard, neutral term (owner to decide; hommi is blocked)",
    "samkynhneigður": "neutral, respectful term",
    "indíáni": "the ordinary Icelandic word, not a slur in Icelandic",
    "kínverji": "lower case: a firecracker",
    "skíta, skítur, kúkur, piss, pissa, míga": "children's-book words (v6.5 note)",
    "rass": "children's books; rassgat is blocked",
    "drepa, skjóta, berja, lemja": "sagas and ordinary speech (drepa á dyr)",
    "bjór, vín, áfengi, sígaretta": "neutral; bjór down-ranked",
}

# Not coarse, but inflated by film dialogue: forms of address and titles of
# dubbed films (*herra* was the 3rd commonest noun), the ranks of film armies
# and police forces, guns, crime-drama words, mild insults, alcohol. They stay
# in the vocabulary and in every table; build_freq.py only multiplies their
# rank score by SUBTITLE_FACTOR, so they come up as often as a word of their
# real standing in school reading would, not as often as in action films.
SUBTITLE_REGISTER = set("""
"""
# address and titles
"""
herra hátign dama lafði lávarður vina stjóri gaur
"""
# ranks and offices of film armies and police
"""
ofursti liðþjálfi höfuðsmaður hershöfðingi kapteinn liðsforingi undirforingi
sjóliðsforingi aðmíráll fógeti lögreglufulltrúi varðstjóri alríkislögregla
saksóknari kviðdómur dánardómstjóri landgöngulið landgönguliði sérsveit
sérsveitarmaður skipherra
"""
# guns and explosives
"""
byssa skammbyssa vélbyssa haglabyssa riffill byssukúla skotfæri skothylki
skotvopn handsprengja sprengiefni piparúði skotsár skothvellur skotmark
"""
# crime drama
"""
mafía mafíósi uppljóstrari lausnargjald
"""
# mild insults and oaths, kept but not to be served as often as in films
"""
kjaftæði fífl bjáni auli aumingi ræfill vitleysingur afstyrmi ári
skíthræddur kvikindi skræfa rugludallur fyllibytta
"""
# alcohol and dating slang
"""
bjór vodki vodka kampavín gella skvísa bósi
""".split())
SUBTITLE_FACTOR = 0.1


def keep(lemma, ofl):
    if lemma in JUNK:
        return False
    if (lemma, ofl) in JUNK_PAIRS:
        return False
    if lemma in UNFIT and ofl in ("kk", "kvk", "hk", "so", "lo"):
        return False
    if SAFE_MODE and (lemma in BLOCK or (lemma, ofl) in BLOCK_PAIRS):
        return False
    return True
