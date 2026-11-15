# -*- coding: utf-8 -*-
"""Filtering the vocabulary that comes out of the corpus.

1. JUNK — lemma errors and fragments that produce broken exercises ("pú",
   "eð"). A quality filter, always on.

2. BLOCK — words somebody might want kept away from a child. Not a build-time
   decision: one build serves every user, so the list travels with the data
   (`DATA.blocked`, written by build_bundle.py) and the filtering happens in
   the browser, per user, from the administrator's `safeVocab` switch
   (core/policy.js, `buildLexicon` in core/lexicon.js). FALLASKOLI_SAFE_VOCAB=1
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
# optional BLOCK switch below). Nor are the words of war and history (*stríð*,
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

# 2. The optional filter. Off at build time by default; the app applies it per
# user. Kept short and specific on purpose: a long list of "possibly rude words"
# starts removing ordinary Icelandic (*rass* and *skítur* are in every children's
# book), and a filter that removes ordinary words teaches a child that the
# program is broken rather than that the words are rude.
BLOCK = set("""
negri hommi hóra píka typpi mella drusla kunta rassgat helvíti fokk
""".split())


def keep(lemma, ofl):
    if lemma in JUNK:
        return False
    if (lemma, ofl) in JUNK_PAIRS:
        return False
    if lemma in UNFIT and ofl in ("kk", "kvk", "hk", "so", "lo"):
        return False
    if SAFE_MODE and lemma in BLOCK:
        return False
    return True
