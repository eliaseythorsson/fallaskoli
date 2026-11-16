"""Hand-written exercise items for the question types added in v6.11.

WHERE THE ITEMS ARE (critique item 82)
--------------------------------------
The items themselves are in content/<category>/*.tsv, one item per line,
so that a teacher or a native reader can read and edit them in a text
editor or a spreadsheet; each file's header explains its columns in
Icelandic. This module reads those files (content_io.py) and gives
build_exercises.py exactly the lists it always had, under the same names.
What stays here is the format, the rules below, and what is not content.

Nothing in the items is an inflected form. Every word a question ASKS about — the
answer, the options, the cue in brackets — is written as a BÍN lemma, a word
class and a BÍN mark, and `build_exercises.py` looks the form up in BÍN. The
sentences around the blank are checked word by word against BÍN too; the
build stops if one of them is not there.

    ___                  the blank
    {lemma|cls|MARK}     a word in the sentence, inflected by BÍN
    lemma|cls|MARK       in a file's column: a word asked about (the answer,
                         an option), the (lemma, cls, MARK) of the lists

One table is written the other way round: HUNT (villuveidar/villur.tsv), the bank of real
errors for Villuveiðar. There the corrected word stands in the sentence as it
is read, with its lemma, class and mark beside it, and the build refuses the
item unless BÍN gives exactly that form — so a person can read the bank as
Icelandic, and nothing in it is taken on trust either.

The classes are BÍN's: kk kvk hk lo so pfn afn fn to rt ao fs st uh.
Personal pronouns are plural forms of the singular lemma in BÍN:
við = ég FT, þið = þú FT, þeir/þær/þau = hann/hún/það FT.

LEVELS (v6.13, critique item 13)
--------------------------------
Every item in the files opens with its level, þyngd 1-5, and the
builders ask the items near the pupil's difficulty first (tasks/shared.js
`nearBand`: the band and the level below it, widening a step at a time when
too few are left). Until v6.13 these question types built the same questions
at every difficulty. One rule for every list, so a 3 here is a 3 there:

  length        the words of the sentence, the blank counted as one, by the
                table sentences.py uses for the bank:
                    up to 5 words -> 1     6-7 -> 2     8-9 -> 3
                    10-11 -> 4             12 and more -> 5
  the list      plus the base of the list's own grammar point, written above
                each list ("level = length + 1"): an impersonal subject is
                harder than a pronoun after a preposition however short the
                sentence
  +1 rare word  a word the pupil must know to answer that is not an everyday
                word for a 13-year-old (þarfnast, kyrrð, tvinni, sjónauki,
                sárna, til þerris)
  +1 harder     what is harder than the plain case of the list, as each list
     construction says: the genitive, a plural personal pronoun (okkur,
                ykkur, þeim), a trap (hlakka and kvíða take the nominative),
                something in the sentence that pulls the other way
  capped at 5.

HUNT has its own `band` (the þyngd from which an item is asked) and is not
part of this. SYNONYMS and ANTONYMS are words, not items: their difficulty is
how rare the words are, and the build reads that from the frequency list
(`r`, tasks/shared.js `pickVocab`) rather than from a hand-written number.
"""

# ---------------------------------------------------------------- reading content/
#
# The lists below are read from content/**/*.tsv (critique item 82), where a
# teacher or a native reader can read and edit them without reading Python;
# each file's header says, in Icelandic, what its columns hold. What stays
# here is what is not content: the closed grammatical tables (ordinals,
# months, the plural-only numerals, multi-word conjunctions) and the few
# switches the builders read.
import content_io as _C


def _table(rel, cols):
    """content/<rel>: one tuple per line, its columns in order."""
    return [tuple(r[n] for n, _ in cols) for r in _C.rows(rel, cols)]


def _column(rel, col):
    """content/<rel> with a single column: the list of its values."""
    return [r[col[0]] for r in _C.rows(rel, [col])]


def _dict(rel, cols):
    """content/<rel> as {first column: second column}, in the file's order."""
    out = {}
    for r in _C.rows(rel, cols):
        k = r[cols[0][0]]
        if k in out:
            raise _C.ContentError("%s:%d: „%s“ kemur tvisvar fyrir / appears twice" % (r.file, r.line, k))
        out[k] = r[cols[1][0]]
    return out


def _bad(r, why):
    raise _C.ContentError("%s:%d: %s" % (r.file, r.line, why))

# ---------------------------------------------------------------- Lýsingarorð

# v6.13 (critique item 23): frames for lo_beyging, lo_stig and lo_samr, and the
# helper nouns they are said of (adj_classes.py). The rules for writing a frame
# are at the top of content/lysingarord/rammar.tsv.
#   (level, frame, the noun's BÍN mark, the adjective's degree, noun groups)
ADJ_NOUN_GROUPS = _dict("lysingarord/nafnordahopar.tsv", [("hópur", "text"), ("nafnorð", "list")])
ADJ_FRAMES = _table("lysingarord/rammar.tsv", [
    ("þyngd", "int"), ("rammi", "text"), ("mark", "text"), ("beyging", "text"), ("hópar", "text")])

# ---------------------------------------------------------------- Fornöfn

# A personal pronoun in the case the verb or preposition asks for.
# The cue shown in brackets is the nominative of the same number.
# Level = length; +1 for a plural pronoun (okkur, ykkur, þeim), +1 for the
# genitive (mín, hans, okkar).
PRONOUN_GAP = [
    (1, "Ég gaf ___ bókina.", ("hún", "pfn", "ÞGFET"), "gefa e-m e-ð: sá sem fær stendur í þágufalli."),
    (1, "Kennarinn hrósaði ___ fyrir verkefnið.", ("ég", "pfn", "ÞGFET"), "hrósa stýrir þágufalli."),
    (1, "Viltu hjálpa ___ með heimavinnuna?", ("ég", "pfn", "ÞGFET"), "hjálpa stýrir þágufalli."),
    (2, "Amma bakaði köku handa ___.", ("ég", "pfn", "ÞGFFT"), "handa stýrir þágufalli."),
    (3, "Ég hlakka til að hitta ___ á morgun.", ("þú", "pfn", "ÞFET"), "hitta stýrir þolfalli."),
    (2, "Strákarnir biðu eftir ___ í hálftíma.", ("hún", "pfn", "ÞGFET"), "bíða eftir e-m: eftir stýrir hér þágufalli."),
    (3, "Hefur þú séð ___ í dag?", ("hann", "pfn", "ÞFFT"), "sjá stýrir þolfalli."),
    (2, "Ég sakna ___ mikið.", ("þú", "pfn", "EFET"), "sakna stýrir eignarfalli."),
    (2, "Við töluðum um ___ í gær.", ("hún", "pfn", "ÞFET"), "um stýrir þolfalli."),
    (3, "Mamma keypti nýja skó handa ___.", ("þú", "pfn", "ÞGFFT"), "handa stýrir þágufalli."),
    (2, "Hundurinn hljóp á eftir ___.", ("ég", "pfn", "ÞGFFT"), "á eftir stýrir þágufalli."),
    (2, "Ég sendi ___ bréf.", ("hann", "pfn", "ÞGFFT"), "senda e-m e-ð: sá sem fær stendur í þágufalli."),
    (3, "Hún saknaði ___ allan daginn.", ("það", "pfn", "EFFT"), "sakna stýrir eignarfalli."),
    (1, "Ég fékk bréf frá ___.", ("hann", "pfn", "ÞGFET"), "frá stýrir þágufalli."),
    (1, "Komdu með ___ í bíó!", ("ég", "pfn", "ÞGFET"), "með e-m (ásamt e-m) stýrir þágufalli."),
    (2, "Pabbi spurði ___ um prófið.", ("ég", "pfn", "ÞFFT"), "spyrja stýrir þolfalli."),
    (2, "Kötturinn svaf hjá ___ í nótt.", ("þú", "pfn", "ÞGFET"), "hjá stýrir þágufalli."),
    (1, "Ég þekki ___ vel.", ("hún", "pfn", "ÞFET"), "þekkja stýrir þolfalli."),
    (3, "Ég fór til ___ í gær.", ("hann", "pfn", "EFET"), "til stýrir eignarfalli."),
    (1, "Ég treysti ___ alveg.", ("þú", "pfn", "ÞGFET"), "treysta stýrir þágufalli."),
    (2, "Við heimsóttum ___ um jólin.", ("hann", "pfn", "ÞFFT"), "heimsækja stýrir þolfalli."),
    (2, "Þjálfarinn óskaði ___ til hamingju.", ("þú", "pfn", "ÞGFFT"), "óska e-m til hamingju: þágufall."),
    (2, "Hún hringdi í ___ í morgun.", ("ég", "pfn", "ÞFET"), "hringja í e-n: í stýrir hér þolfalli."),
    (1, "Ég lánaði ___ hjólið mitt.", ("hún", "pfn", "ÞGFET"), "lána e-m e-ð: þágufall."),
    (3, "Strákurinn leitaði ___ um allan bæ.", ("hún", "pfn", "EFET"), "leita stýrir eignarfalli."),
    (1, "Við gleymdum ___ á stöðinni.", ("þú", "pfn", "ÞGFET"), "gleyma stýrir þágufalli."),
    (3, "Ég heyrði í ___ í útvarpinu.", ("hann", "pfn", "ÞGFFT"), "heyra í e-m: í stýrir hér þágufalli."),
    (4, "Þau fóru í bíó án ___.", ("ég", "pfn", "EFFT"), "án stýrir eignarfalli."),
    (1, "Hver sagði ___ þetta?", ("þú", "pfn", "ÞGFET"), "segja e-m e-ð: þágufall."),
    (2, "Ég sá ___ í búðinni.", ("hún", "pfn", "ÞFFT"), "sjá stýrir þolfalli."),
    (2, "Afi gaf ___ nammi.", ("það", "pfn", "ÞGFFT"), "gefa e-m e-ð: þágufall."),
    (2, "Mér þykir vænt um ___.", ("þú", "pfn", "ÞFFT"), "um stýrir þolfalli."),
]

# Reflexive or not. The same sentence twice, with a line that says who is
# meant; the line decides. Options are the two forms, both from BÍN.
# Level = length + 1; +1 for sinn against hans/hennar (the possessive), +1
# for a plural subject, +1 for the dative (sér, sinni), +1 where the
# reflexive sits inside a noun phrase (sögu af sér).
REFLEXIVE = [
    (3, "Jón þvoði ___ um hendurnar.", "Jón þvoði sjálfum sér.",
     ("sig", "afn", "ÞGF"), ("hann", "pfn", "ÞGFET")),
    (3, "Jón þvoði ___ um hendurnar.", "Jón þvoði litla bróður sínum.",
     ("hann", "pfn", "ÞGFET"), ("sig", "afn", "ÞGF")),
    (3, "Anna tók töskuna ___.", "Anna á töskuna sjálf.",
     ("sinn", "fn", "KVK-ÞFET"), ("hún", "pfn", "EFET")),
    (3, "Anna tók töskuna ___.", "Vinkona Önnu á töskuna.",
     ("hún", "pfn", "EFET"), ("sinn", "fn", "KVK-ÞFET")),
    (4, "Strákarnir sóttu hjólin ___.", "Strákarnir eiga hjólin sjálfir.",
     ("sinn", "fn", "HK-ÞFFT"), ("hann", "pfn", "EFFT")),
    (4, "Strákarnir sóttu hjólin ___.", "Aðrir strákar eiga hjólin.",
     ("hann", "pfn", "EFFT"), ("sinn", "fn", "HK-ÞFFT")),
    (3, "María keypti ___ nýja peysu.", "Peysan er handa Maríu sjálfri.",
     ("sig", "afn", "ÞGF"), ("hún", "pfn", "ÞGFET")),
    (3, "María keypti ___ nýja peysu.", "Peysan er handa systur Maríu.",
     ("hún", "pfn", "ÞGFET"), ("sig", "afn", "ÞGF")),
    (2, "Pétur sá ___ í speglinum.", "Pétur sá sjálfan sig.",
     ("sig", "afn", "ÞF"), ("hann", "pfn", "ÞFET")),
    (2, "Pétur sá ___ í speglinum.", "Pétur sá vin sinn í speglinum.",
     ("hann", "pfn", "ÞFET"), ("sig", "afn", "ÞF")),
    (3, "Hún hringdi í mömmu ___.", "Hún hringdi í sína eigin mömmu.",
     ("sinn", "fn", "KVK-ÞFET"), ("hún", "pfn", "EFET")),
    (3, "Hún hringdi í mömmu ___.", "Hún hringdi í mömmu vinkonu sinnar.",
     ("hún", "pfn", "EFET"), ("sinn", "fn", "KVK-ÞFET")),
    (3, "Kennarinn talaði við nemendurna ___.", "Þetta eru nemendur kennarans sjálfs.",
     ("sinn", "fn", "KK-ÞFFT"), ("hann", "pfn", "EFET")),
    (3, "Kennarinn talaði við nemendurna ___.", "Þetta eru nemendur annars kennara.",
     ("hann", "pfn", "EFET"), ("sinn", "fn", "KK-ÞFFT")),
    (3, "Stelpurnar klæddu ___ í úlpurnar.", "Stelpurnar klæddu sjálfar sig.",
     ("sig", "afn", "ÞF"), ("hún", "pfn", "ÞFFT")),
    (3, "Stelpurnar klæddu ___ í úlpurnar.", "Stelpurnar klæddu litlu systur sínar.",
     ("hún", "pfn", "ÞFFT"), ("sig", "afn", "ÞF")),
    (4, "Lóa gleymdi húfunni ___.", "Lóa á húfuna sjálf.",
     ("sinn", "fn", "KVK-ÞGFET"), ("hún", "pfn", "EFET")),
    (4, "Lóa gleymdi húfunni ___.", "Systir Lóu á húfuna.",
     ("hún", "pfn", "EFET"), ("sinn", "fn", "KVK-ÞGFET")),
    (4, "Afi sagði sögu af ___.", "Sagan var um afa sjálfan.",
     ("sig", "afn", "ÞGF"), ("hann", "pfn", "ÞGFET")),
    (4, "Afi sagði sögu af ___.", "Sagan var um langafa.",
     ("hann", "pfn", "ÞGFET"), ("sig", "afn", "ÞGF")),
    (2, "Siggi meiddi ___ á fætinum.", "Siggi meiddist sjálfur.",
     ("sig", "afn", "ÞF"), ("hann", "pfn", "ÞFET")),
    (2, "Siggi meiddi ___ á fætinum.", "Siggi meiddi annan strák í fótbolta.",
     ("hann", "pfn", "ÞFET"), ("sig", "afn", "ÞF")),
]

# ---- generated from frames (v6.13, critique item 23) ----------------------
#
# PRONOUN_GAP and REFLEXIVE above are 32 and 11 sentences; a pupil met each
# again within a few sessions. The frames below are filled in by
# build_exercises.py, every word out of BÍN, and nothing in them is an
# inflected form written here.

# fn_eyda. A personal pronoun after a verb or a preposition that
# government.py lists with ONE case. The case is not written here: the build
# reads it from that table and stops on a verb or preposition it gives two.
# Each frame is said by every subject below, the verb in BÍN's form for that
# subject, and the pupil writes any personal pronoun but the subject's own
# person (tasks/fornofn.js: not *ég* after *ég* or *við*, not *hann* after
# *hann*).
#   who  "p": only a person reads naturally in the blank — so not *það* in
#        the singular ("Ég hrósaði því"); "pt": a person or a thing ("Ég
#        fann það").
# Level = length (the subject and the blank one word each), +1 for a plural
# pronoun, +1 for the genitive — PRONOUN_GAP's rule, applied by the builder.
PRONOUN_SUBJECTS = [
    ("ég", "pfn", "NFET"), ("ég", "pfn", "NFFT"), ("hann", "pfn", "NFET"), ("hún", "pfn", "NFET"),
    ("það", "pfn", "NFFT"),
    ("mamma", "kvk", "NFET"), ("pabbi", "kk", "NFET"), ("amma", "kvk", "NFET"), ("afi", "kk", "NFET"),
    ("kennari", "kk", "NFETgr"), ("stelpa", "kvk", "NFETgr"), ("strákur", "kk", "NFETgr"),
]
# (verb, tense, what follows the blank — one frame each, who)
PRONOUN_VERBS = [
    ("sjá", "ÞT", ["", "í gær", "í búðinni"], "pt"),
    ("hitta", "ÞT", ["í gær", "í bænum"], "p"),
    ("þekkja", "NT", ["", "vel"], "p"),
    ("heimsækja", "ÞT", ["í gær", "um helgina"], "p"),
    ("finna", "ÞT", ["", "loksins"], "pt"),
    ("passa", "ÞT", ["um helgina"], "p"),
    ("skilja", "NT", ["", "vel"], "pt"),
    ("hjálpa", "ÞT", ["", "með heimavinnuna"], "p"),
    ("gleyma", "ÞT", ["", "heima"], "pt"),
    ("svara", "ÞT", ["", "strax"], "pt"),
    ("trúa", "NT", ["", "alveg"], "pt"),
    ("þakka", "ÞT", ["fyrir hjálpina"], "p"),
    ("fylgja", "ÞT", ["heim"], "p"),
    ("mæta", "ÞT", ["í gær", "á leiðinni heim"], "p"),
    ("treysta", "NT", ["", "alveg"], "p"),
    ("hrósa", "ÞT", ["fyrir verkefnið"], "p"),
    ("bjarga", "ÞT", [""], "pt"),
    ("sakna", "NT", ["", "mikið"], "pt"),
    ("bíða", "ÞT", ["lengi"], "p"),
    ("leita", "ÞT", ["lengi", "um allan bæ"], "pt"),
    ("gæta", "ÞT", ["vel"], "p"),
]
# (preposition, verb, tense, words between the verb and the preposition,
#  what follows the blank, who)
PRONOUN_PREPS = [
    ("um", "tala", "ÞT", "", ["", "í gær"], "pt"),
    ("um", "hugsa", "ÞT", "", ["", "í allan dag"], "pt"),
    ("frá", "fá", "ÞT", "bréf", [""], "p"),
    ("frá", "heyra", "ÞT", "", ["í gær"], "p"),
    ("hjá", "gista", "ÞT", "", ["í nótt"], "p"),
    ("hjá", "sitja", "ÞT", "", ["", "í tímanum"], "p"),
    ("handa", "kaupa", "ÞT", "gjöf", [""], "p"),
    ("handa", "baka", "ÞT", "köku", [""], "p"),
    ("án", "fara", "ÞT", "", ["", "í gær"], "p"),
    ("til", "fara", "ÞT", "", ["í gær"], "p"),
    ("af", "taka", "ÞT", "mynd", [""], "pt"),
    ("nálægt", "sitja", "ÞT", "", [""], "pt"),
    ("gegn", "keppa", "ÞT", "", [""], "p"),
]

# fn_aftur. Each frame is two questions on one card (item 43): the sentence
# once with a line saying the subject is meant, once with a line saying
# somebody else is. Both lines are made from the sentence itself — the blank
# filled with *sjálfan sig* / *sjálfri sér* … or with *annan strák* / *aðra
# stelpu* … in the case the verb gives — so neither says more than the
# sentence does. A possessive frame says who owns the thing instead:
# "Anna á töskuna sjálf." / "Önnur stelpa á töskuna."
# Level = REFLEXIVE's rule: length + 1; +1 for the possessive, +1 for a
# plural subject, +1 for the dative.
#   (lemma, class, mark of the subject's form)
REFLEX_SUBJECTS = [
    ("Pétur", "kk", "NFET"), ("Jón", "kk", "NFET"), ("Davíð", "kk", "NFET"), ("Bjarni", "kk", "NFET"),
    ("Ari", "kk", "NFET"), ("strákur", "kk", "NFETgr"), ("hann", "pfn", "NFET"),
    ("Anna", "kvk", "NFET"), ("María", "kvk", "NFET"), ("Lóa", "kvk", "NFET"), ("Sara", "kvk", "NFET"),
    ("Edda", "kvk", "NFET"), ("stelpa", "kvk", "NFETgr"), ("hún", "pfn", "NFET"),
    ("strákur", "kk", "NFFTgr"), ("stelpa", "kvk", "NFFTgr"),
]
# Somebody else of the subject's gender and number: *annar strákur* …
REFLEX_OTHER = {"kk": ("strákur", "annar"), "kvk": ("stelpa", "annar")}
# (verb, case of the object, what follows the blank, plural subjects too?)
REFLEX_OBJECT = [
    ("sjá", "ÞF", "í speglinum", True),
    ("sjá", "ÞF", "á myndinni", True),
    ("sjá", "ÞF", "í sjónvarpinu", True),
    ("þekkja", "ÞF", "á myndinni", True),
    ("finna", "ÞF", "á myndinni", False),
    ("klæða", "ÞF", "í úlpuna", False),
    ("fela", "ÞF", "í skápnum", True),
    ("læsa", "ÞF", "inni", True),
    ("kynna", "ÞF", "fyrir bekknum", True),
    ("teikna", "ÞF", "á blaðið", False),
    ("mynda", "ÞF", "með símanum", True),
    ("meiða", "ÞF", "á fætinum", False),
    ("kaupa", "ÞGF", "nýja peysu", False),
    ("þvo", "ÞGF", "um hendurnar", True),
    ("klóra", "ÞGF", "á bakinu", False),
    ("velja", "ÞGF", "nýja húfu", False),
]
# (verb, case of the thing owned, the things) — the possessive frame,
# "{subject} {verb} {the thing} ___." Each pair of verb and thing is said by
# three of the subjects, in turn, so the list stays a list of frames and
# not of names.
REFLEX_POSSESSIVE = [
    ("taka", "ÞF", ["taska", "bók", "húfa", "peysa", "sími", "bolti", "úlpa", "hjól"]),
    ("sækja", "ÞF", ["taska", "hjól", "úlpa", "bolti"]),
    ("finna", "ÞF", ["taska", "bók", "húfa", "sími", "lykill"]),
    ("þvo", "ÞF", ["peysa", "húfa", "úlpa", "hjól"]),
    ("laga", "ÞF", ["hjól", "sími"]),
    ("týna", "ÞGF", ["taska", "bók", "húfa", "sími", "lykill", "bolti"]),
    ("gleyma", "ÞGF", ["taska", "bók", "húfa", "peysa", "úlpa"]),
]

# ---------------------------------------------------------------- Töluorð

# A cardinal 1-4 agreeing with its noun. {N} is the noun, put in the case
# and number the slot needs by BÍN; the numeral takes the noun's gender.
# n: which numbers may be asked (1 takes the singular).
# Level = length (the frame, the noun not counted); +1 for the dative
# (tveimur, þremur, fjórum), +1 for the genitive (tveggja, þriggja, fjögurra).
NUMERAL_AGREE = [
    (1, "Ég á ___ {N}.", "ÞF", [1, 2, 3, 4], ["systir", "bróðir", "köttur", "hundur", "frænka", "frændi"]),
    (1, "___ {N} komu í heimsókn.", "NF", [2, 3, 4], ["stelpa", "strákur", "barn", "kennari", "vinkona"]),
    # v6.13 (item 23): *tala við* takes the accusative — "Við töluðum við
    # tvær stelpur". Until now this frame asked for the dative (*tveimur
    # stelpum*) and marked the right answer wrong.
    (1, "Við töluðum við ___ {N}.", "ÞF", [1, 2, 3, 4], ["stelpa", "strákur", "kennari", "barn", "vinkona"]),
    (2, "Hún keypti ___ {N} í búðinni.", "ÞF", [1, 2, 3, 4], ["bók", "penni", "epli", "peysa", "blýantur", "banani"]),
    (1, "Ég beið í ___ {N}.", "ÞF", [1, 2, 3, 4], ["dagur", "vika", "mínúta", "klukkutími"]),
    (1, "Á bænum eru ___ {N}.", "NF", [2, 3, 4], ["kýr", "hestur", "kind", "hæna", "svín"]),
    (3, "Þetta er hús ___ {N}.", "EF", [2, 3, 4], ["bróðir", "systir", "vinur"]),
    # v6.13 (item 23): this was "Hann kom heim með ___ {N}." with things
    # carried, in the dative — but what is carried home is the accusative
    # ("kom heim með tvo fiska"). With people it has two right answers:
    # *með tveimur vinum* (in their company) and *með tvo vini* (brought them
    # home). *mæta* takes the dative and nothing else.
    (3, "Hún mætti ___ {N} á leiðinni heim.", "ÞGF", [1, 2, 3, 4], ["vinur", "vinkona", "strákur", "stelpa", "kennari"]),
    (2, "Í bekknum eru ___ {N} með gleraugu.", "NF", [2, 3, 4], ["stelpa", "strákur", "nemandi"]),
    (2, "Ég fékk ___ {N} í afmælisgjöf.", "ÞF", [1, 2, 3, 4], ["bók", "leikur", "spil", "peysa"]),
]

# v6.13 (critique item 23): frames × nouns, for to_samr and to_val. The list
# above held 164 items; a pupil met each one again within a few sessions.
# These frames take nouns by MEANING (noun_classes.py) instead of a short
# hand list: build_exercises.py takes the commonest nouns of the classes
# named (the `NUMERAL_TAKE` most frequent, by the lexicon's rank) that may
# stand in a generated sentence at all (noun_classes.reviewed, not excluded),
# have a singular (a plural-only noun takes *tvennir*: to_flt, below) and,
# for 2-4, a plural people say (no_plural). A list of lemmas instead of
# classes is taken as it is; a sixth element lists nouns the frame does not
# take. Every frame was read with each noun it takes.
# Same levels as above; ÞF/NF frames are level 1 when short.
NUMERAL_TAKE = 25
# Nouns of those classes that are not counted one, two, three: a pair (*tveir
# skór* and *tvennir skór* are both right), a mass (*dót*, *peningur* =
# money), the few a class takes that a child does not count like this, and
# the family roles one has one of: "Ég hitti þrjá afa", "tvær dætur". (A
# leading _: build_freq.py ranks up the words of exercises.py, and words
# left OUT are not words the school material uses.)
_NUMERAL_SKIP = {"skór", "dót", "peningur", "hnífur", "band", "steinn", "óvinur", "náungi",
                "mamma", "pabbi", "faðir", "móðir", "amma", "afi", "dóttir", "sonur"}
# the people one lives with or misses, and the children who own bicycles
_CLOSE = ["vinur", "vinkona", "frænka", "frændi", "bróðir", "systir", "félagi", "nágranni",
          "strákur", "stelpa"]
_CHILDREN = ["strákur", "stelpa", "krakki", "barn", "drengur", "vinur", "vinkona", "bróðir",
             "systir", "nemandi"]
NUMERAL_FRAMES = [
    (1, "Ég á ___ {N}.", "ÞF", [1, 2, 3, 4], ["köttur", "hundur", "hestur", "fiskur",
     "páfagaukur", "systir", "bróðir", "frænka", "frændi", "vinur", "vinkona"]),
    (1, "Ég á ___ {N}.", "ÞF", [1, 2, 3, 4], "object book clothing"),
    (1, "Hér eru ___ {N}.", "NF", [2, 3, 4], "object book clothing"),
    (1, "___ {N} komu í heimsókn.", "NF", [2, 3, 4], "person job"),
    (1, "Ég hitti ___ {N} í gær.", "ÞF", [1, 2, 3, 4], "person job"),
    (1, "Á bænum eru ___ {N}.", "NF", [2, 3, 4], ["kýr", "hestur", "kind", "hæna", "svín", "hundur",
     "köttur", "geit", "hani", "kálfur", "lamb", "gæs", "önd"]),
    (1, "Ég beið í ___ {N}.", "ÞF", [1, 2, 3, 4], ["dagur", "vika", "mínúta", "klukkutími",
     "mánuður", "sekúnda"]),
    (2, "Hún keypti ___ {N} í búðinni.", "ÞF", [1, 2, 3, 4], "object book clothing", ["bréf"]),
    (2, "Í garðinum eru ___ {N}.", "NF", [2, 3, 4], ["tré", "blóm", "runni", "fugl", "köttur", "bekkur"]),
    (2, "Ég las ___ {N} í sumar.", "ÞF", [1, 2, 3, 4], ["bók", "saga", "blað", "teiknimyndasaga", "ljóð"]),
    (2, "Við hjálpuðum ___ {N}.", "ÞGF", [1, 2, 3, 4], "person job"),
    (2, "Ég gaf ___ {N} mat.", "ÞGF", [1, 2, 3, 4], ["köttur", "hundur", "hestur", "kind", "hæna",
     "fugl", "fiskur", "kýr", "geit", "önd", "gæs"]),
    (3, "Hún bjó hjá ___ {N} í sumar.", "ÞGF", [1, 2, 3, 4], _CLOSE),
    (3, "Þetta eru hjól ___ {N}.", "EF", [2, 3, 4], _CHILDREN),
    (3, "Hún saknaði ___ {N}.", "EF", [1, 2, 3, 4], _CLOSE),
    (4, "Kennarinn talaði lengi við foreldra ___ {N}.", "EF", [2, 3, 4], ["stelpa", "strákur",
     "barn", "nemandi"]),
    (4, "Hún passaði hunda ___ {N} um helgina.", "EF", [1, 2, 3, 4], _CLOSE),
    (4, "Kennarinn hrósaði verkefnum ___ {N} í dag.", "EF", [1, 2, 3, 4], _CHILDREN),
]

# Plural-only nouns: einir, tvennir, þrennir, fernir.
PLURAL_ONLY_NOUNS = ["buxur", "skæri", "gleraugu", "tónleikar", "dyr", "jól", "hjón"]
PLURAL_NUMERALS = {1: ("einn", "fn"), 2: ("tvennur", "lo"), 3: ("þrennur", "lo"), 4: ("fern", "lo")}
# Level = length + 1; +1 for the dative, +1 for a noun whose plural-only
# meaning is itself a puzzle (hjón, jól) or a perfect tense around it.
NUMERAL_PLURAL_ONLY = [
    (3, "Ég keypti ___ {N} í gær.", "ÞF", [1, 2, 3], ["buxur", "skæri", "gleraugu"]),
    (2, "Hann á ___ {N}.", "ÞF", [1, 2, 3, 4], ["buxur", "gleraugu", "skæri"]),
    (2, "Í ganginum eru ___ {N}.", "NF", [2, 3, 4], ["dyr"]),
    (3, "Við fórum á ___ {N} í sumar.", "ÞF", [1, 2, 3, 4], ["tónleikar"]),
    (4, "Hún hefur haldið ___ {N} hjá ömmu.", "ÞF", [2, 3, 4], ["jól"]),
    (4, "Í brúðkaupinu dönsuðu ___ {N} saman.", "NF", [2, 3, 4], ["hjón"]),
    (4, "Það er gat á ___ {N}.", "ÞGF", [1, 2, 3], ["buxur"]),
]

# v6.13 (critique item 23): more plural-only nouns, in frames written for
# what they mean. NUMERAL_PLURAL_ONLY held seven nouns in eleven sentences.
# Every noun here is checked against BÍN to have no singular at all (the
# build stops otherwise), so *tvennar* is the only right answer; and *skór*,
# *sokkar*, *vettlingar* are left out on purpose: they have a singular, and
# with them *tveir* (two shoes) and *tvennir* (two pairs) are both right.
# Same levels as above (length + 1; +1 dative; +1 for the people and the
# feasts, whose plural-only meaning is itself a puzzle).
PLURAL_ONLY_GROUPS = {
    "trousers": ["buxur", "stuttbuxur", "gallabuxur", "náttbuxur", "íþróttabuxur", "sokkabuxur",
                 "regnbuxur", "nærbuxur"],
    "glasses": ["gleraugu", "sólgleraugu", "sundgleraugu", "skíðagleraugu"],
    "tool": ["skæri", "naglaskæri"],
    "door": ["dyr", "útidyr", "bakdyr", "svaladyr"],
    "people": ["hjón", "feðgar", "mæðgur", "feðgin", "mæðgin"],
    "feast": ["jól", "páskar", "áramót"],
    "prize": ["verðlaun"],
}
PLURAL_ONLY_FRAMES = [
    (2, "Ég á ___ {N}.", "ÞF", [1, 2, 3, 4], "trousers glasses tool"),
    (2, "Hún keypti ___ {N}.", "ÞF", [1, 2, 3, 4], "trousers glasses tool"),
    (2, "Hér eru ___ {N}.", "NF", [1, 2, 3, 4], "trousers glasses tool"),
    (2, "Mig vantar ___ {N}.", "ÞF", [1, 2, 3, 4], "trousers glasses tool"),
    (3, "Ég fann ___ {N} í skúffunni.", "ÞF", [1, 2, 3, 4], "trousers glasses tool"),
    (3, "Hann kom heim með ___ {N}.", "ÞF", [1, 2, 3, 4], "trousers glasses tool"),
    (4, "Það er gat á ___ {N}.", "ÞGF", [1, 2, 3], "trousers"),
    (3, "Á húsinu eru ___ {N}.", "NF", [1, 2, 3, 4], "door"),
    (4, "Á bænum búa ___ {N}.", "NF", [1, 2, 3, 4], "people"),
    (4, "Í veislunni voru ___ {N}.", "NF", [1, 2, 3, 4], "people"),
    (4, "Liðið fékk ___ {N} á mótinu.", "ÞF", [1, 2, 3, 4], "prize"),
    (4, "Hún hefur unnið ___ {N}.", "ÞF", [1, 2, 3, 4], "prize"),
    (4, "Við höfum haldið ___ {N} saman.", "ÞF", [1, 2, 3, 4], "feast"),
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
# Level = length; +1 for a case other than the nominative, +1 for the
# genitive or a frame where nothing but the date says "when". The builder
# adds one more for a compound ordinal (21. = tuttugasti og fyrsti).
DATE_FRAMES = [
    (1, "Í dag er ___ {M}.", "NF", "Dagsetningin er frumlag eða sagnfylling: nefnifall (*dagurinn*)."),
    (2, "Ég á afmæli ___ {M}.", "ÞF", "Dagsetning sem svarar *hvenær?* stendur í þolfalli (*þann þriðja maí*)."),
    (2, "Skólinn byrjar ___ {M}.", "ÞF", "Dagsetning sem svarar *hvenær?* stendur í þolfalli."),
    (2, "Frá ___ {M} er sumarfrí.", "ÞGF", "*Frá* stýrir þágufalli."),
    (3, "Fríið stendur til ___ {M}.", "EF", "*Til* stýrir eignarfalli."),
    (3, "Við förum til útlanda ___ {M}.", "ÞF", "Dagsetning sem svarar *hvenær?* stendur í þolfalli."),
]

# ---------------------------------------------------------------- Fallstjórn

# Motion (þolfall) or rest (þágufall) after í / á / undir / yfir.
# (level, sentence, noun, column, motion?)
#
# Each item must have ONE right answer. A verb of moving (fljúga, skríða,
# rúlla, ganga, stökkva) can also mean moving about IN a place, and then the
# þágufall is right too: "Hundurinn skreið undir borðinu" (crawled about
# under it) is as good as "undir borðið". So every motion item carries a word
# that fixes the direction: a directional adverb before the preposition (inn,
# út, upp), a verb of placing (leggja, setja, hengja, stinga, hella), or a
# goal in the rest of the sentence (til mín, og settist þar). Six motion
# items were rewritten for this in v6.13 (critique item 6).
# Level = length; +1 for undir/yfir (less drilled than í/á), +1 where
# something else in the sentence pulls the other way: a dative object before
# the preposition (stakk símanum í ___), or an activity at rest (lék sér á ___).
MOTION_REST = [
    (1, "Ég lagði bókina á ___.", "borð", "ETgr", True),
    (1, "Bókin liggur á ___.", "borð", "ETgr", False),
    (2, "Kötturinn stökk upp í ___ til mín.", "rúm", "ETgr", True),
    (1, "Kötturinn sefur í ___.", "rúm", "ETgr", False),
    (2, "Við fórum í ___ eftir skóla.", "búð", "ETgr", True),
    (2, "Við hittumst í ___ eftir skóla.", "búð", "ETgr", False),
    (2, "Hún setti mjólkina inn í ___.", "ísskápur", "ETgr", True),
    (1, "Mjólkin er í ___.", "ísskápur", "ETgr", False),
    (1, "Strákurinn hljóp út á ___.", "gata", "ETgr", True),
    (2, "Strákurinn lék sér á ___.", "gata", "ETgr", False),
    (3, "Fuglinn flaug upp á ___ og settist þar.", "þak", "ETgr", True),
    (1, "Fuglinn situr á ___.", "þak", "ETgr", False),
    (1, "Ég hengdi myndina á ___.", "veggur", "ETgr", True),
    (1, "Myndin hangir á ___.", "veggur", "ETgr", False),
    (1, "Við keyrðum inn í ___.", "bær", "ETgr", True),
    (1, "Við búum í ___.", "bær", "ETgr", False),
    (2, "Hann stakk símanum í ___.", "vasi", "ETgr", True),
    (1, "Síminn er í ___.", "vasi", "ETgr", False),
    (2, "Boltinn rúllaði inn undir ___.", "sófi", "ETgr", True),
    (2, "Boltinn liggur undir ___.", "sófi", "ETgr", False),
    (2, "Hesturinn stökk yfir ___.", "girðing", "ETgr", True),
    (2, "Skýið hangir yfir ___.", "fjall", "ETgr", False),
    (1, "Krakkarnir hlupu út á ___.", "völlur", "ETgr", True),
    (2, "Krakkarnir spila fótbolta á ___.", "völlur", "ETgr", False),
    (2, "Hún hellti vatni í ___.", "glas", "ETgr", True),
    (1, "Vatnið er í ___.", "glas", "ETgr", False),
    (2, "Hundurinn skreið inn undir ___.", "borð", "ETgr", True),
    (2, "Hundurinn sefur undir ___.", "borð", "ETgr", False),
    (1, "Ég setti diskana í ___.", "skápur", "ETgr", True),
    (1, "Diskarnir eru í ___.", "skápur", "ETgr", False),
    (2, "Við gengum alla leið upp á ___.", "hæð", "ETgr", True),
    (1, "Við stóðum á ___.", "hæð", "ETgr", False),
]

# Motion and rest as SETS (critique item 23): one preposition, sentences of
# motion, sentences of rest, and nouns that fit every one of them. Every
# motion sentence × every rest sentence × every noun is a pair (item 43: both
# halves on one card), so a set of 3 + 3 sentences and 8 nouns makes 72.
#
# Each half must have exactly one right answer (item 6 found *flaug yfir
# fjallið / fjallinu* and *skreið undir borðið / borðinu*, both good). So:
#   motion  a verb that needs a goal — leggja, setja, stinga, henda,
#           fara, ganga/hlaupa/koma INN Í, stökkva UPP Á, rúlla INN UNDIR;
#   rest    a verb of being somewhere — vera, liggja, sitja, bíða, sofa,
#           geyma, hittast, INNI Í;
#   never   yfir, and never undir without *inn* (both cases are right there);
#           no verb that takes either (fela, finna, leika sér, hoppa).
# Each noun must take the set's preposition in both senses (*á völlinn* /
# *á vellinum*), and none may be a time word (*í dag*).
#
# Level = length (sentences.py's table), the pair as hard as its harder half.
MOTION_SETS = [
    ("á", "ETgr",
     ["Ég lagði bókina á ___.", "Hún setti töskuna á ___.",
      "Strákurinn henti úlpunni sinni á ___.", "Mamma lagði hreinu fötin varlega á ___."],
     ["Bókin liggur á ___.", "Taskan er á ___.",
      "Hreinu fötin liggja enn þá á ___.", "Úlpan hans hefur legið á ___ í allan dag."],
     ["borð", "stóll", "sófi", "rúm", "gólf", "hilla", "bekkur", "skrifborð"]),
    ("í", "ETgr",
     ["Ég setti lykilinn í ___.", "Hún stakk símanum í ___.",
      "Pabbi setti peningana sína í ___.", "Ég stakk bréfunum varlega í ___."],
     ["Lykillinn er í ___.", "Síminn liggur í ___.",
      "Peningarnir hans eru alltaf geymdir í ___.", "Bréfin hafa legið lengi í ___."],
     ["skúffa", "taska", "poki", "kassi", "skápur", "vasi", "bakpoki"]),
    ("í", "ETgr",
     ["Við fórum í ___.", "Hann gekk inn í ___.",
      "Hún flýtti sér inn í ___.", "Krakkarnir hlupu beint inn í ___ eftir skóla."],
     ["Við vorum í ___.", "Hann beið í ___.",
      "Hún stóð lengi í ___.", "Krakkarnir voru lengi inni í ___ í gær."],
     ["eldhús", "stofa", "herbergi", "búð", "kirkja", "bakarí", "íþróttahús", "bókabúð"]),
    ("á", "ETgr",
     ["Við fórum á ___.", "Pabbi keyrði okkur á ___.",
      "Við fórum saman á ___ í morgun.", "Afi fór með okkur á ___ um helgina."],
     ["Við vorum á ___.", "Hann beið á ___.",
      "Við hittumst á ___ í morgun.", "Við biðum lengi á ___ í gær."],
     ["völlur", "strönd", "bryggja", "torg", "flugvöllur", "bensínstöð", "pósthús", "sjúkrahús"]),
    ("á", "ETgr",
     ["Kötturinn stökk upp á ___.", "Fuglinn flaug upp á ___."],
     ["Kötturinn situr á ___.", "Fuglinn situr á ___.", "Kötturinn hefur legið á ___ í allan dag."],
     ["borð", "stóll", "þak", "sófi", "bekkur", "kassi", "girðing", "skápur", "steinn"]),
    ("undir", "ETgr",
     ["Boltinn rúllaði inn undir ___.", "Kötturinn skreið inn undir ___."],
     ["Boltinn liggur undir ___.", "Kötturinn sefur undir ___."],
     ["sófi", "rúm", "borð", "stóll", "bekkur", "skápur"]),
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
# Level = length + 1; +1 for the genitive, +1 for a verb that is not
# everyday (þarfnast, gæta, njóta) or that takes another case than the verb
# it resembles (aðstoða þolfall, hjálpa þágufall; óttast þolfall).
VERB_CASE = [
    (3, "Ég hjálpaði ___ að bera pokana.", "hjálpa", "ÞGF", "ETgr", ["kennari", "nágranni", "stelpa", "strákur"]),
    (3, "Ég sakna ___ mjög mikið.", "sakna", "EF", "ETgr", ["hundur", "köttur", "vinur", "kennari"]),
    (2, "Við þökkuðum ___ fyrir matinn.", "þakka", "ÞGF", "ETgr", ["kokkur", "kona", "maður"]),
    (3, "Á leiðinni heim mætti ég ___.", "mæta", "ÞGF", "ET", ["maður", "kona", "hundur", "lögreglumaður"]),
    (4, "Við biðum ___ í hálftíma.", "bíða", "EF", "ETgr", ["strætisvagn", "lest", "læknir"]),
    (4, "Hún leitaði ___ um allt hús.", "leita", "EF", "ETgr", ["lykill", "sími", "köttur", "taska"]),
    (2, "Ég gleymdi ___ heima.", "gleyma", "ÞGF", "ETgr", ["sími", "nesti", "taska", "lykill"]),
    (2, "Strákurinn týndi ___ í gær.", "týna", "ÞGF", "ETgr", ["lykill", "húfa", "vettlingur", "bolti"]),
    (2, "Ég treysti ___ fullkomlega.", "treysta", "ÞGF", "ETgr", ["læknir", "þjálfari", "kennari"]),
    (4, "Við nutum ___ í sveitinni.", "njóta", "EF", "ETgr", ["útsýni", "sól:kvk", "kyrrð"]),
    (2, "Hún kastaði ___ yfir girðinguna.", "kasta", "ÞGF", "ETgr", ["bolti", "steinn", "spýta"]),
    (2, "Ég henti ___ í ruslið.", "henda", "ÞGF", "ETgr", ["blað", "flaska", "dós"]),
    (2, "Þjófurinn stal ___.", "stela", "ÞGF", "ETgr", ["hjól", "veski", "bíll"]),
    (2, "Ég heilsaði ___ á ganginum.", "heilsa", "ÞGF", "ETgr", ["kennari", "skólastjóri", "húsvörður"]),
    (2, "Hundurinn fylgdi ___ heim.", "fylgja", "ÞGF", "ETgr", ["strákur", "stelpa", "maður"]),
    (3, "Ég aðstoðaði ___ í eldhúsinu.", "aðstoða", "ÞF", "ETgr", ["kokkur", "bakari", "smiður"]),
    (3, "Ég spurði ___ til vegar.", "spyrja", "ÞF", "ETgr", ["lögreglumaður", "kona", "maður"]),
    (3, "Litla stelpan óttaðist ___.", "óttast", "ÞF", "ETgr", ["hundur", "myrkur", "þruma"]),
    (4, "Garðurinn þarfnast ___.", "þarfnast", "EF", "ET", ["vatn", "umhirða", "áburður"]),
    (2, "Hún bjargaði ___ úr ánni.", "bjarga", "ÞGF", "ETgr", ["hundur", "kettlingur", "strákur"]),
    (2, "Við fögnuðum ___ með köku.", "fagna", "ÞGF", "ETgr", ["sigur", "afmæli", "vor"]),
    (2, "Ég lofaði ___ að koma.", "lofa", "ÞGF", "ETgr", ["þjálfari", "kennari", "nágranni"]),
    (4, "Hann gætti ___ allan daginn.", "gæta", "EF", "ETgr", ["barn", "hundur", "búð"]),
]

# Verb frames × noun groups (critique item 23): the same question as
# VERB_CASE, generated. Every frame is asked with every noun of its group,
# each form out of BÍN. A group is chosen so that every noun makes sense
# with the verb (*Ég kvaddi ömmu*, not *Ég vakti lögreglumanninn*), and a
# noun whose form in the asked case is its nominative (*Ég opnaði veskið*) is
# left out by the build: copying the cue is not knowing the case.
#   (bonus, sentence, verb, case, group)
# Level = length + 1, as VERB_CASE; +1 for the genitive; +1 (bonus) for a
# verb that is not everyday or takes another case than the verb it
# resembles (aðstoða, óttast, gæta). Kept at 4 and under, as VERB_CASE.
VC_FAMILY = [("mamma", "ET"), ("pabbi", "ET"), ("amma", "ET"), ("afi", "ET"),
             ("vinur", "ETgr"), ("vinkona", "ETgr"), ("strákur", "ETgr"), ("stelpa", "ETgr")]
VC_OTHERS = [("strákur", "ETgr"), ("stelpa", "ETgr"), ("kennari", "ETgr"), ("nágranni", "ETgr"),
             ("þjálfari", "ETgr"), ("skólastjóri", "ETgr"), ("læknir", "ETgr"), ("bílstjóri", "ETgr")]
VC_PEOPLE = VC_FAMILY + VC_OTHERS[2:]
VC_ANIMALS = [("hundur", "ETgr"), ("köttur", "ETgr"), ("hestur", "ETgr"), ("kanína", "ETgr"),
              ("kettlingur", "ETgr"), ("hvolpur", "ETgr"), ("kind", "ETgr"), ("fugl", "ETgr")]
VC_PETS = [("hundur", "ETgr"), ("köttur", "ETgr"), ("kanína", "ETgr"), ("kettlingur", "ETgr"),
           ("hvolpur", "ETgr"), ("hestur", "ETgr")]
VC_VISITED = VC_FAMILY + [("nágranni", "ETgr"), ("læknir", "ETgr")]
VC_THINGS = [("sími", "ETgr"), ("lykill", "ETgr"), ("taska", "ETgr"), ("bolti", "ETgr"),
             ("húfa", "ETgr"), ("vettlingur", "ETgr"), ("blýantur", "ETgr"), ("veski", "ETgr"),
             ("nesti", "ETgr"), ("úlpa", "ETgr"), ("trefill", "ETgr"), ("bók", "ETgr")]
# What a thief takes in the night: something worth stealing (not a pencil).
VC_STOLEN = [("sími", "ETgr"), ("lykill", "ETgr"), ("taska", "ETgr"), ("veski", "ETgr"),
             ("úlpa", "ETgr"), ("bók", "ETgr")]
VC_THROWN = [("bolti", "ETgr"), ("húfa", "ETgr"), ("lykill", "ETgr"), ("vettlingur", "ETgr"),
             ("blýantur", "ETgr"), ("trefill", "ETgr")]
VC_SHUT = [("hurð", "ETgr"), ("gluggi", "ETgr"), ("skápur", "ETgr"), ("taska", "ETgr"),
           ("kassi", "ETgr"), ("skúffa", "ETgr")]
VC_RUBBISH = [("blað", "ETgr"), ("flaska", "ETgr"), ("dós", "ETgr"), ("bréf", "ETgr"),
              ("poki", "ETgr"), ("kassi", "ETgr")]
VC_PUSHED = [("taska", "ETgr"), ("kassi", "ETgr"), ("stóll", "ETgr"), ("borð", "ETgr"), ("poki", "ETgr")]
VC_AWAITED = [("strætisvagn", "ETgr"), ("lest", "ETgr"), ("flugvél", "ETgr"), ("mamma", "ET"),
              ("pabbi", "ET"), ("læknir", "ETgr"), ("kennari", "ETgr")]
VC_FETCHED = [("strákur", "ETgr"), ("stelpa", "ETgr"), ("vinur", "ETgr"), ("vinkona", "ETgr")]
VERB_FRAMES = [
    # þágufall
    (0, "Ég hjálpaði ___.", "hjálpa", "ÞGF", VC_PEOPLE),
    (0, "Ég hjálpaði ___ að bera þunga pokana heim.", "hjálpa", "ÞGF", VC_PEOPLE),
    (0, "Ég heilsaði ___.", "heilsa", "ÞGF", VC_PEOPLE),
    (0, "Í hádeginu heilsaði ég ___ á ganginum.", "heilsa", "ÞGF", VC_OTHERS),
    (0, "Ég treysti ___.", "treysta", "ÞGF", VC_PEOPLE),
    (0, "Ég svaraði ___ strax.", "svara", "ÞGF", VC_PEOPLE),
    (0, "Ég þakkaði ___ kærlega fyrir alla hjálpina.", "þakka", "ÞGF", VC_PEOPLE),
    (0, "Ég lofaði ___ að koma aftur á morgun.", "lofa", "ÞGF", VC_PEOPLE),
    (0, "Ég sýndi ___ myndina.", "sýna", "ÞGF", VC_PEOPLE),
    (0, "Ég sagði ___ frá ferðinni til Spánar.", "segja", "ÞGF", VC_PEOPLE),
    (0, "Ég kynntist ___ í sumar.", "kynnast", "ÞGF", VC_OTHERS),
    (0, "Ég mætti ___ á leiðinni heim.", "mæta", "ÞGF", VC_OTHERS + VC_ANIMALS),
    (0, "Ég klappaði ___.", "klappa", "ÞGF", VC_ANIMALS),
    (0, "Ég klappaði ___ áður en ég fór.", "klappa", "ÞGF", VC_ANIMALS),
    (0, "Ég gaf ___ að borða.", "gefa", "ÞGF", VC_ANIMALS),
    (0, "Ég gaf ___ að borða í morgun.", "gefa", "ÞGF", VC_ANIMALS),
    (0, "Slökkviliðið bjargaði ___.", "bjarga", "ÞGF", VC_ANIMALS),
    (0, "Ég gleymdi ___ í skólanum.", "gleyma", "ÞGF", VC_THINGS),
    (0, "Litla systir mín gleymdi ___ heima í morgun.", "gleyma", "ÞGF", VC_THINGS),
    (0, "Ég týndi ___ í gær.", "týna", "ÞGF", VC_THINGS),
    (0, "Strákurinn í næsta húsi týndi ___ í gær.", "týna", "ÞGF", VC_THINGS),
    (0, "Þjófurinn stal ___ í nótt.", "stela", "ÞGF", VC_STOLEN),
    (0, "Þjófurinn stal ___ úr bílnum í nótt.", "stela", "ÞGF", VC_STOLEN),
    (0, "Hún kastaði ___ til mín.", "kasta", "ÞGF", VC_THROWN),
    (0, "Strákurinn kastaði ___ langt út í garð.", "kasta", "ÞGF", VC_THROWN),
    (0, "Ég lokaði ___.", "loka", "ÞGF", VC_SHUT),
    (0, "Ég lokaði ___ vandlega áður en ég fór.", "loka", "ÞGF", VC_SHUT),
    (0, "Hún henti ___ í ruslið.", "henda", "ÞGF", VC_RUBBISH),
    (0, "Ég ýtti ___ til hliðar.", "ýta", "ÞGF", VC_PUSHED),
    # þolfall
    (0, "Ég opnaði ___.", "opna", "ÞF", VC_SHUT),
    (0, "Mamma opnaði ___ varlega.", "opna", "ÞF", VC_SHUT),
    (0, "Ég heimsótti ___ í gær.", "heimsækja", "ÞF", VC_VISITED),
    (0, "Í gær heimsótti ég ___ eftir skóla.", "heimsækja", "ÞF", VC_VISITED),
    (0, "Ég kvaddi ___ í gær.", "kveðja", "ÞF", VC_FAMILY),
    (0, "Ég kvaddi ___ þegar ég fór heim.", "kveðja", "ÞF", VC_FAMILY),
    (0, "Ég vakti ___ í morgun.", "vekja", "ÞF", VC_FAMILY),
    (0, "Ég vakti ___ klukkan sjö í morgun.", "vekja", "ÞF", VC_FAMILY),
    (0, "Ég sótti ___ í skólann.", "sækja", "ÞF", VC_FETCHED),
    (0, "Ég þekki ___ vel.", "þekkja", "ÞF", VC_PEOPLE),
    (0, "Ég spurði ___ um leiðina.", "spyrja", "ÞF", VC_OTHERS),
    (1, "Ég aðstoðaði ___ í gær.", "aðstoða", "ÞF", VC_OTHERS),
    (1, "Litli bróðir minn óttast ___.", "óttast", "ÞF", VC_PETS),
    # eignarfall
    (0, "Ég sakna ___ mikið.", "sakna", "EF", VC_FAMILY + VC_PETS),
    (0, "Ég sakna ___ alveg ótrúlega mikið.", "sakna", "EF", VC_FAMILY + VC_PETS),
    (0, "Við leituðum ___ lengi.", "leita", "EF", VC_THINGS),
    (0, "Við leituðum ___ úti um allt.", "leita", "EF", VC_THINGS),
    (0, "Við biðum ___ lengi.", "bíða", "EF", VC_AWAITED),
    (0, "Í allan morgun hef ég beðið ___.", "bíða", "EF", VC_AWAITED),
    (1, "Ég gætti ___ um helgina.", "gæta", "EF", VC_PETS),
]

# Impersonal verbs (fs_operson, critique item 23): generated, not listed.
# Every frame below is asked with every subject of IMPERSONAL_SUBJECTS, in
# each tense it is written for: about forty frames make over a thousand
# questions, and build_exercises.py takes every form from BÍN — the verb
# (BÍN's impersonal forms, OP-ÞF / OP-ÞGF, whose mark also says the case of
# the subject: the build stops if the case written here is not that one),
# and the subject in each case. Two traps take the nominative and agree with
# it (hlakka, kvíða): BÍN must have no impersonal form of them.
#
#   (bonus, verb, case, present, past)
#     case     "op" — the case BÍN gives the impersonal verb's subject;
#              "ÞGF" — written by hand where BÍN has no impersonal form
#              (*mér er kalt*: the verb is the ordinary 3rd person);
#              "NF" — a trap: the verb is personal, in the subject's person
#     present  the sentence in the present tense, ___ the subject and {V}
#     past     the same in the past; None where one tense is not natural
#
# Every frame must be right with ANY subject of the list, and with the
# nominative cue it must be wrong: "___ gengur vel" alone is not (*hann
# gengur vel* is walking), so it is "gengur vel í stærðfræði". No person
# or pronoun in the frame, so no subject clashes with it.
#
# Level = length + 1 (sentences.py's table); +1 for a verb that is not
# everyday (syfja, klæja, verkja, batna, sárna) or a trap (hlakka, kvíða);
# and by the subject: +1 for a plural pronoun or a noun, +2 for a plural
# noun (IMPERSONAL_SUBJECTS). Capped at 5.
IMPERSONAL_FRAMES = [
    # þolfall
    (0, "langa", "op", "___ {V} í ís.", "___ {V} í ís."),
    (0, "langa", "op", "___ {V} að fara heim.", "___ {V} að fara heim."),
    (0, "langa", "op", "___ {V} að læra á gítar.", "___ {V} að læra á gítar."),
    (0, "vanta", "op", "___ {V} nýja skó.", "___ {V} nýja skó."),
    (0, "vanta", "op", "___ {V} blýant.", "___ {V} blýant."),
    (0, "vanta", "op", "___ {V} hjálp við heimanámið.", "___ {V} hjálp við heimanámið."),
    (0, "dreyma", "op", "___ {V} oft skrýtna drauma.", "___ {V} illa í nótt."),
    (0, "minna", "op", "___ {V} að búðin sé lokuð.", "___ {V} að búðin væri lokuð."),
    (0, "gruna", "op", "___ {V} að eitthvað sé að.", "___ {V} að eitthvað væri að."),
    (1, "syfja", "op", "___ {V} á kvöldin.", "___ {V} eftir matinn."),
    (1, "klæja", "op", "___ {V} í nefið.", "___ {V} í nefið."),
    (1, "verkja", "op", "___ {V} í fótinn.", "___ {V} í fótinn."),
    # þágufall
    (0, "finnast", "op", "___ {V} gaman að synda.", "___ {V} gaman að synda."),
    (0, "finnast", "op", "___ {V} skemmtilegt í skólanum.", "___ {V} skemmtilegt í skólanum."),
    (0, "finnast", "op", "___ {V} pítsa góð.", "___ {V} pítsan góð."),
    (0, "finnast", "op", "___ {V} myndin skemmtileg.", "___ {V} myndin skemmtileg."),
    (0, "þykja", "op", "___ {V} vænt um hundinn.", "___ {V} vænt um hundinn."),
    (0, "þykja", "op", "___ {V} gott að sofa lengi.", "___ {V} gott að sofa lengi."),
    (0, "líða", "op", "___ {V} vel.", "___ {V} vel."),
    (0, "líða", "op", "___ {V} illa í maganum.", "___ {V} illa í maganum."),
    (0, "leiðast", "op", "___ {V} í rigningunni.", "___ {V} í rigningunni."),
    (0, "leiðast", "op", "___ {V} heima.", "___ {V} heima."),
    (0, "líka", "op", "___ {V} vel í skólanum.", "___ {V} vel í skólanum."),
    (0, "líka", "op", "___ {V} maturinn.", "___ {V} maturinn."),
    (0, "ganga", "op", "___ {V} vel í stærðfræði.", "___ {V} vel í stærðfræði."),
    (0, "ganga", "op", None, "___ {V} vel í prófinu."),
    (0, "takast", "op", "___ {V} alltaf að vinna.", "___ {V} að laga hjólið."),
    (0, "bregða", "op", None, "___ {V} svo mikið."),
    (0, "detta", "op", "___ {V} ekkert í hug.", "___ {V} ekkert í hug."),
    (0, "heyrast", "op", None, "___ {V} einhver banka."),
    (0, "sýnast", "op", "___ {V} vera að rigna.", "___ {V} vera að rigna."),
    (0, "lítast", "op", "___ {V} vel á þetta.", "___ {V} vel á þetta."),
    (1, "batna", "op", "___ {V} vonandi fljótt.", "___ {V} kvefið fljótt."),
    (1, "sárna", "op", None, "___ {V} þetta."),
    (0, "vera", "ÞGF", "___ {V} kalt.", "___ {V} kalt."),
    (0, "vera", "ÞGF", "___ {V} heitt.", "___ {V} heitt."),
    (0, "vera", "ÞGF", "___ {V} illt í maganum.", "___ {V} illt í maganum."),
    (0, "vera", "ÞGF", "___ {V} sama.", "___ {V} sama."),
    (0, "verða", "ÞGF", "___ {V} kalt úti.", "___ {V} kalt úti."),
    # the traps: nominative, and the verb agrees with it
    (1, "hlakka", "NF", "___ {V} til jólanna.", "___ {V} til jólanna."),
    (1, "hlakka", "NF", "___ {V} til sumarfrísins.", "___ {V} til sumarfrísins."),
    (1, "kvíða", "NF", "___ {V} fyrir prófinu.", "___ {V} fyrir prófinu."),
    (1, "kvíða", "NF", "___ {V} fyrir keppninni.", "___ {V} fyrir keppninni."),
]
# (lemma, class, column, level bonus). Personal pronouns as BÍN has them
# (við = ég FT …); *það* only in the plural (*þau*): *því langar* is no one.
# People a child talks about; with the article where Icelandic uses it.
IMPERSONAL_SUBJECTS = [
    ("ég", "pfn", "ET", 0), ("þú", "pfn", "ET", 0), ("hann", "pfn", "ET", 0), ("hún", "pfn", "ET", 0),
    ("ég", "pfn", "FT", 1), ("þú", "pfn", "FT", 1), ("hann", "pfn", "FT", 1), ("hún", "pfn", "FT", 1),
    ("það", "pfn", "FT", 1),
    ("mamma", "kvk", "ET", 1), ("pabbi", "kk", "ET", 1), ("amma", "kvk", "ET", 1), ("afi", "kk", "ET", 1),
    ("strákur", "kk", "ETgr", 1), ("stelpa", "kvk", "ETgr", 1), ("kennari", "kk", "ETgr", 1),
    ("þjálfari", "kk", "ETgr", 1), ("nágranni", "kk", "ETgr", 1), ("barn", "hk", "ETgr", 1),
    ("strákur", "kk", "FTgr", 2), ("stelpa", "kvk", "FTgr", 2), ("krakki", "kk", "FTgr", 2),
    ("barn", "hk", "FTgr", 2), ("kennari", "kk", "FTgr", 2),
]

# ---------------------------------------------------------------- Óbeygjanleg

# Preposition or adverb: the same word with and without a governed word.
# (level, sentence, the word, "fs" | "ao")
# Level = length + 1; +1 where the word is part of a fixed phrase (fram hjá,
# fyrir utan, ganga yfir, fara undir) or stands right before a preposition
# (upp á) — the hardest contrast.
ADV_OR_PREP = [
    (2, "Hún hljóp upp stigann.", "upp", "fs"),
    (2, "Hún leit upp.", "upp", "ao"),
    (2, "Við gengum yfir brúna.", "yfir", "fs"),
    (3, "Óveðrið gekk yfir.", "yfir", "ao"),
    (2, "Hún fór niður brekkuna.", "niður", "fs"),
    (2, "Hún datt niður.", "niður", "ao"),
    (2, "Ég fór með mömmu.", "með", "fs"),
    (2, "Má ég koma með?", "með", "ao"),
    (2, "Hún kom eftir matinn.", "eftir", "fs"),
    (3, "Kakan er búin og ekkert er eftir.", "eftir", "ao"),
    (2, "Kötturinn skreið undir rúmið.", "undir", "fs"),
    (2, "Barnið hljóp út.", "út", "ao"),
    (3, "Kötturinn stökk upp á borðið.", "upp", "ao"),
    (3, "Kötturinn stökk upp á borðið.", "á", "fs"),
    (3, "Hann gekk fram hjá húsinu.", "hjá", "fs"),
    (2, "Komdu inn!", "inn", "ao"),
    (3, "Ég beið fyrir utan.", "utan", "ao"),
    (3, "Hann bjó utan bæjarins.", "utan", "fs"),
    (2, "Sólin skein á okkur.", "á", "fs"),
]

# Preposition or adverb, generated (critique item 23). The builder pairs
# every preposition sentence of a word with every adverb sentence of it
# (item 43), so a word with a few frames × a few nouns and a few adverb
# sentences makes dozens of pairs. Each noun in the case the word governs,
# out of BÍN.
#   preposition  the word right before the noun phrase it governs
#   adverb       the word alone: at the end, or before another phrase
#                (*kom við í búðinni*), never before a noun it could govern
# No word that only lives in a phrase here (*á eftir*, *í gegnum*, *upp á*):
# ADV_OR_PREP above has those, with their own level.
#   (word, [(preposition frame, case, [(noun, column)])], [adverb sentences])
# Level = length + 1, as ADV_OR_PREP.
ADV_PREP_FRAMES = [
    ("upp",
     [("Hún hljóp upp ___.", "ÞF", [("brekka", "ETgr"), ("stigi", "ETgr"), ("hæð", "ETgr"), ("trappa", "FTgr")]),
      ("Við gengum upp ___.", "ÞF", [("brekka", "ETgr"), ("fjall", "ETgr"), ("hæð", "ETgr"), ("stigi", "ETgr"),
                                     ("gata", "ETgr"), ("trappa", "FTgr")]),
      ("Kötturinn klifraði upp ___.", "ÞF", [("tré", "ETgr"), ("veggur", "ETgr"), ("gardína", "ETgr")])],
     ["Hún leit upp.", "Sólin kom upp.", "Hann stóð upp.", "Komdu upp!"]),
    ("niður",
     [("Hún hljóp niður ___.", "ÞF", [("brekka", "ETgr"), ("stigi", "ETgr"), ("trappa", "FTgr"), ("gata", "ETgr")]),
      ("Boltinn rúllaði niður ___.", "ÞF", [("brekka", "ETgr"), ("stigi", "ETgr"), ("hæð", "ETgr"), ("gata", "ETgr"),
                                          ("trappa", "FTgr")])],
     ["Hún datt niður.", "Sestu niður.", "Hann lagðist niður.", "Ég beygði mig niður."]),
    ("yfir",
     [("Við gengum yfir ___.", "ÞF", [("brú", "ETgr"), ("gata", "ETgr"), ("tún", "ETgr"), ("á:kvk", "ETgr"),
                                      ("völlur", "ETgr"), ("bílastæði", "ETgr")]),
      ("Hesturinn stökk yfir ___.", "ÞF", [("girðing", "ETgr"), ("lækur", "ETgr"), ("steinn", "ETgr")])],
     ["Óveðrið gekk yfir."]),
    ("undir",
     [("Kötturinn skreið undir ___.", "ÞF", [("rúm", "ETgr"), ("borð", "ETgr"), ("sófi", "ETgr")]),
      ("Boltinn lá undir ___.", "ÞGF", [("rúm", "ETgr"), ("borð", "ETgr"), ("bekkur", "ETgr")])],
     ["Liðið okkar var undir í hálfleik."]),
    ("með",
     [("Ég fór í bíó með ___.", "ÞGF", [("vinur", "ETgr"), ("vinkona", "ETgr"), ("amma", "ET"), ("afi", "ET"),
                                        ("mamma", "ET"), ("pabbi", "ET")]),
      ("Hún kom með ___ í skólann.", "ÞF", [("nesti", "ETgr"), ("bolti", "ETgr"), ("hundur", "ETgr")])],
     ["Má ég koma með?", "Ég tók nestið með."]),
    ("eftir",
     [("Við fórum út eftir ___.", "ÞF", [("matur", "ETgr"), ("leikur", "ETgr"), ("tími", "ETgr")])],
     ["Ekkert er eftir.", "Hann varð eftir heima.", "Kakan er búin og ekkert er eftir."]),
    ("framhjá",
     [("Hann gekk framhjá ___.", "ÞGF", [("hús", "ETgr"), ("búð", "ETgr"), ("skóli", "ETgr"), ("kirkja", "ETgr"),
                                         ("bakarí", "ETgr"), ("sundlaug", "ETgr"), ("bókasafn", "ETgr")])],
     ["Bíllinn keyrði framhjá.", "Strákurinn hljóp framhjá."]),
    ("frá",
     [("Ég fékk bréf frá ___.", "ÞGF", [("amma", "ET"), ("afi", "ET"), ("vinur", "ETgr"), ("kennari", "ETgr"),
                                        ("mamma", "ET"), ("pabbi", "ET"), ("vinkona", "ETgr")])],
     ["Farðu frá!"]),
    ("við",
     [("Hún talaði lengi við ___.", "ÞF", [("kennari", "ETgr"), ("amma", "ET"), ("nágranni", "ETgr"), ("vinkona", "ETgr"),
                                           ("mamma", "ET"), ("pabbi", "ET"), ("þjálfari", "ETgr")])],
     ["Ég kom við í búðinni.", "Pabbi kom við hjá ömmu."]),
]

# Choose the conjunction. (level, sentence, right, [wrong, wrong, wrong], why)
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
# Level = length; +1 where the choice is between conjunctions that all fit
# the grammar and only the meaning decides (hvort sem, þótt, nema, enda), or
# the clause after it is in the subjunctive.
CONJUNCTION = [
    # hvort / hvort sem / ef: the indirect question
    (3, "Ég veit ekki ___ hún kemur á morgun.", "hvort", ["ef", "hvort sem", "þegar"],
     "Óbein spurning hefst á *hvort*: *Ég veit ekki hvort …* — *ef* táknar skilyrði og *þegar* tíma."),
    (2, "Hún spurði ___ ég vildi koma með.", "hvort", ["ef", "að", "hvort sem"],
     "Óbein já- eða nei-spurning hefst á *hvort*: *Hún spurði hvort …*, ekki *ef*."),
    (4, "Við förum í gönguferð ___ það rignir eða ekki.", "hvort sem", ["hvort", "ef", "þótt"],
     "*Hvort sem … eða ekki*: það skiptir ekki máli hvort það rignir, við förum samt."),
    # ef / þegar / þótt / nema: condition, time, concession, exception
    (4, "___ ég væri fugl myndi ég fljúga til Spánar.", "ef", ["þegar", "nema", "hvort"],
     "*Ef* táknar skilyrði, hér skilyrði sem er ekki satt: *ef ég væri fugl*."),
    (3, "Ég var sex ára ___ ég lærði að synda.", "þegar", ["ef", "nema", "þótt"],
     "*Þegar* segir hvenær eitthvað gerðist."),
    (5, "Hann fór út í stuttbuxum í morgun ___ það væri frost.", "þótt", ["ef", "þegar", "nema"],
     "*Þótt* táknar andstæðu: það var frost en hann fór samt út í stuttbuxum."),
    (5, "Við spilum úti á morgun ___ það rigni, því þá spilum við inni.", "nema", ["ef", "þótt", "þegar"],
     "*Nema* merkir *ef ekki*: við spilum úti ef það rignir ekki."),
    # af því að / enda / svo að / til þess að: cause, result, purpose
    (4, "Ég fór snemma að sofa ___ ég var mjög þreyttur.", "af því að", ["svo að", "þótt", "til þess að"],
     "*Af því að* segir hvers vegna: ég fór að sofa vegna þess að ég var þreyttur."),
    (5, "Hún var svöng, ___ hafði hún ekkert borðað síðan í morgun.", "enda", ["af því að", "svo að", "til þess að"],
     "*Enda* bætir við skýringu, og á eftir því kemur sögnin á undan frumlaginu: *enda hafði hún*. "
     "Á eftir *af því að* kæmi frumlagið fyrst: *af því að hún hafði*."),
    (4, "Það var mikil hálka ___ margir duttu á leiðinni í skólann.", "svo að", ["af því að", "til þess að", "þótt"],
     "*Svo að* segir hvað leiddi af: hálkan varð til þess að margir duttu."),
    (3, "Ég vaknaði snemma ___ ná strætó.", "til þess að", ["svo að", "af því að", "enda"],
     "*Til þess að* segir til hvers, og á eftir því kemur nafnháttur: *til þess að ná strætó*."),
    # hvorki … né, annaðhvort … eða, bæði … og
    (3, "Hvorki ég ___ bróðir minn fórum á ballið.", "né", ["eða", "og", "en"], "*Hvorki … né*."),
    (3, "Annaðhvort förum við í bíó ___ í sund.", "eða", ["né", "og", "en"], "*Annaðhvort … eða*."),
    (2, "Bæði Siggi ___ Gunna komu í veisluna.", "og", ["né", "eða", "en"], "*Bæði … og*."),
    # sem / að / en
    (2, "Bókin ___ ég las var spennandi.", "sem", ["að", "hvort", "þegar"],
     "*Sem* tengir tilvísunarsetningu við nafnorð: *bókin sem ég las*."),
    (2, "Hún sagði ___ hún væri svöng.", "að", ["sem", "hvort", "nema"],
     "*Að* tengir það sem sagt er við sögnina: *Hún sagði að …*."),
    (1, "Hún er eldri ___ ég.", "en", ["sem", "og", "eða"], "Á eftir miðstigi kemur *en*: *eldri en ég*."),
    (4, "Ég ætlaði að fara út ___ það var of kalt.", "en", ["af því að", "svo að", "hvort"],
     "*En* tengir saman andstæður: ég ætlaði út, en það var of kalt."),
    (3, "Ég burstaði tennurnar ___ ég fór að sofa.", "áður en", ["eftir að", "nema", "hvort"],
     "*Áður en* segir hvað gerðist fyrst: fyrst burstaði ég tennurnar, svo fór ég að sofa."),
    (3, "Hún var svo þreytt ___ hún sofnaði strax.", "að", ["sem", "nema", "þótt"],
     "*Svo … að*: *svo þreytt að hún sofnaði strax*."),
]
# Choose the conjunction, generated (critique item 23). Contrast sets in
# which the GRAMMAR or plain fact leaves exactly one option, so they can be
# multiplied without a person weighing each sentence's shades:
#   en       after a comparative (from BÍN, in the subject's gender): only
#            *en* can follow *eldri*. Only true comparisons.
#   og/né/eða  *bæði … og*, *hvorki … né*, *annaðhvort … eða*: the first
#            word fixes the second. *Annaðhvort* takes a singular verb, so
#            only one person on each side.
#   hvort    an indirect yes/no question after *veit ekki*, *man ekki*
#   sem      a relative clause on a noun
#   að       what was said or thought
#   af því að / svo að   cause and result, both ways round, only where the
#            reverse is absurd (*Það rigndi af því að við vorum inni*)
#   áður en / eftir að   two events that can only come in one order
# The meaning-only choices (ef / þegar / þótt / nema, enda) stay hand-written
# in CONJUNCTION above. The wrong options of each set are rotated so that no
# conjunction is a wrong option in more than a third of all items (item 25).
# Level = length, as CONJUNCTION; +1 for the sets where the meaning decides
# (cause and result, before and after).
CONJ_COMPARE = [
    # (adjective, [(subject, column | None for a pronoun), (the other, column | None)])
    ("gamall", [(("afi", "ET"), ("pabbi", "ET")), (("amma", "ET"), ("mamma", "ET")),
                (("pabbi", "ET"), ("ég", None)), (("mamma", "ET"), ("ég", None))]),
    ("ungur", [(("pabbi", "ET"), ("afi", "ET")), (("mamma", "ET"), ("amma", "ET")),
               (("ég", None), ("pabbi", "ET")), (("ég", None), ("mamma", "ET"))]),
    ("stór", [(("fíll", "ETgr"), ("mús", "ETgr")), (("hestur", "ETgr"), ("hundur", "ETgr")),
              (("hvalur", "ETgr"), ("fiskur", "ETgr")), (("kýr", "ETgr"), ("köttur", "ETgr")),
              (("björn", "ETgr"), ("refur", "ETgr")), (("hús", "ETgr"), ("kofi", "ETgr"))]),
    ("lítill", [(("mús", "ETgr"), ("fíll", "ETgr")), (("hundur", "ETgr"), ("hestur", "ETgr")),
                (("köttur", "ETgr"), ("kýr", "ETgr")), (("refur", "ETgr"), ("björn", "ETgr")),
                (("fiskur", "ETgr"), ("hvalur", "ETgr"))]),
    ("hár", [(("fjall", "ETgr"), ("hús", "ETgr")), (("tré", "ETgr"), ("blóm", "ETgr")),
             (("gíraffi", "ETgr"), ("hestur", "ETgr"))]),
    ("þungur", [(("steinn", "ETgr"), ("fjöður", "ETgr")), (("bíll", "ETgr"), ("hjól", "ETgr")),
                (("fíll", "ETgr"), ("hestur", "ETgr"))]),
    ("léttur", [(("fjöður", "ETgr"), ("steinn", "ETgr")), (("hjól", "ETgr"), ("bíll", "ETgr"))]),
    ("fljótur", [(("bíll", "ETgr"), ("hjól", "ETgr")), (("flugvél", "ETgr"), ("bíll", "ETgr"))]),
    ("hlýr", [(("sumar", "ETgr"), ("vetur", "ETgr")), (("júlí", "ET"), ("janúar", "ET"))]),
    ("kaldur", [(("vetur", "ETgr"), ("sumar", "ETgr")), (("janúar", "ET"), ("júlí", "ET"))]),
    ("langur", [(("vika", "ETgr"), ("dagur", "ETgr")), (("mánuður", "ETgr"), ("vika", "ETgr")),
                (("ár:hk", "ETgr"), ("mánuður", "ETgr"))]),
    ("stuttur", [(("dagur", "ETgr"), ("vika", "ETgr")), (("vika", "ETgr"), ("mánuður", "ETgr")),
                 (("mánuður", "ETgr"), ("ár:hk", "ETgr"))]),
]
# *bæði … og*, *hvorki … né* with a plural verb; *annaðhvort … eða* singular.
CONJ_PAIRS = [("amma", "afi"), ("mamma", "pabbi"), ("bróðir minn", "systir mín"),
              ("kennarinn", "skólastjórinn"), ("vinur minn", "vinkona mín"),
              ("frændi minn", "frænka mín")]
CONJ_BOTH = ["Bæði {A} ___ {B} komu í veisluna.", "Bæði {A} ___ {B} fóru í sund.",
             "Bæði {A} ___ {B} voru heima í gær.",
             "Bæði {A} ___ {B} ætla að koma í afmælið mitt á laugardaginn."]
CONJ_NEITHER = ["Hvorki {A} ___ {B} komu í veisluna.", "Hvorki {A} ___ {B} vissu svarið.",
                "Hvorki {A} ___ {B} voru heima í gær.",
                "Hvorki {A} ___ {B} höfðu heyrt um nýja kennarann.",
                "Hvorki {A} ___ {B} vissu hvað hafði gerst í skólanum í gær."]
CONJ_EITHER = ["Annaðhvort {A} ___ {B} sækir mig í dag.", "Annaðhvort {A} ___ {B} eldar matinn í kvöld.",
               "Annaðhvort {A} ___ {B} hringir í mig á morgun.",
               "Annaðhvort {A} ___ {B} ætlar að sækja mig á æfinguna í kvöld."]
CONJ_WHETHER = (["Ég veit ekki ___ {C}.", "Ég man ekki ___ {C}.", "Við vitum ekki ___ {C}."],
                ["hún kemur á morgun", "búðin er opin í dag", "skólinn byrjar á mánudaginn",
                 "amma er heima", "strætó er farinn", "við eigum að mæta klukkan átta",
                 "sundlaugin er opin á sunnudögum",
                 "búðin á horninu er opin lengur á föstudögum",
                 "við eigum að skila verkefninu á morgun",
                 "nýi kennarinn byrjar að kenna okkur í næstu viku"])
CONJ_RELATIVE = ["Bókin ___ ég las var spennandi.", "Myndin ___ við sáum var löng.",
                 "Kakan ___ mamma bakaði var góð.", "Hundurinn ___ ég fann var svangur.",
                 "Lagið ___ hún söng var fallegt.", "Peysan ___ amma prjónaði er hlý.",
                 "Rútan ___ við tókum var full.", "Leikurinn ___ við spiluðum var skemmtilegur."]
CONJ_SAID = ["Hún sagði ___ hún væri svöng.", "Pabbi sagði ___ maturinn væri tilbúinn.",
             "Kennarinn sagði ___ prófið yrði á morgun.", "Amma sagði ___ hún kæmi í heimsókn.",
             "Hann hélt ___ búðin væri lokuð.", "Ég vona ___ veðrið verði gott á morgun."]
# (cause, result): "{result} af því að {cause}", "{cause} svo að {result}"
CONJ_CAUSE = [("það rigndi", "við vorum inni"), ("ég var svangur", "ég fékk mér samloku"),
              ("bíllinn bilaði", "við komum of seint"), ("það var hálka", "ég datt"),
              ("ég gleymdi lyklinum", "ég komst ekki inn"), ("hún var veik", "hún fór ekki í skólann"),
              ("það var kalt", "ég fór í úlpu"), ("ég var þyrstur", "ég fékk mér vatn"), ("sólin skein", "við fórum á ströndina"),
              ("það rigndi mikið allan daginn", "við vorum inni og spiluðum á spil"),
              ("bíllinn bilaði á leiðinni upp í sveit", "við komum of seint í afmælið hjá ömmu"),
              ("það var mikil hálka á götunum", "margir duttu á leiðinni í skólann í morgun"),
              ("ég hafði æft mig á hverjum degi í allan vetur", "ég vann keppnina í vor")]
# (first, then, then', first'): "{first} áður en {then}", "{then'} eftir að
# {first'}" — written twice, so that a pronoun never comes before its noun
# (*Ég sendi bréfið eftir að ég skrifaði það*).
CONJ_ORDER = [("ég vaknaði", "ég fór á fætur", "ég fór á fætur", "ég vaknaði"),
              ("ég skrifaði bréfið", "ég sendi það", "ég sendi bréfið", "ég skrifaði það"),
              ("mamma bakaði kökuna", "við borðuðum hana", "við borðuðum kökuna", "mamma bakaði hana"),
              ("ég lærði að synda", "ég synti yfir ána", "ég synti yfir ána", "ég lærði að synda"),
              ("við keyptum okkur miða í miðasölunni", "við fórum inn í bíósalinn",
               "við fórum inn í bíósalinn", "við keyptum okkur miða í miðasölunni"),
              ("mamma setti kökuna inn í heitan ofninn", "við borðuðum hana með rjóma",
               "við borðuðum kökuna með rjóma", "mamma setti hana inn í heitan ofninn")]

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
# (level, sentence, mark, right, [wrong, wrong, wrong])
# Level = length; +1 for an answer or a clue that is not an everyday word
# (tvinni, sjónauki, hitamælir, snagi, til þerris).
WORD_IN_CONTEXT = [
    (2, "Ég drakk glas af ___ með matnum.", "ÞGFET", "mjólk", ["stóll", "skór", "bíll"]),
    (1, "Hún burstaði ___ fyrir svefninn.", "ÞFFTgr", "tönn", ["gluggi", "stjarna", "eldavél"]),
    (2, "Við fórum með ___ til dýralæknisins.", "ÞFETgr", "hundur", ["sófi", "snjór", "blýantur"]),
    (1, "Ég klippti blaðið með ___.", "ÞGFFT", "skæri", ["sokkur", "ský", "egg:hk"]),
    (1, "Fiskurinn synti í ___.", "ÞGFETgr", "sjór", ["eyðimörk", "bókahilla", "sófi"]),
    (2, "Ég þurrkaði mér með ___ eftir sundið.", "ÞGFET", "handklæði", ["gaffall", "lykill", "steinn"]),
    (1, "Ég skrifaði bréfið með ___.", "ÞGFET", "penni", ["hamar", "skór", "diskur"]),
    (2, "Bóndinn mjólkaði ___ á hverjum morgni.", "ÞFFTgr", "kýr", ["stóll", "bíll", "blóm"]),
    (2, "Á veturna fellur ___ af himni.", "NFET", "snjór", ["gras", "stóll", "brauð"]),
    (3, "Ég saumaði gatið með nál og ___.", "ÞGFET", "tvinni", ["hamar", "skeið:kvk", "sápa"]),
    (2, "Læknirinn hlustaði á ___ í sjúklingnum.", "ÞFETgr", "hjarta", ["gluggi", "eldhús", "gaffall"]),
    (1, "Hún vökvaði ___ í garðinum.", "ÞFFTgr", "blóm", ["bók", "bíll", "skór"]),
    (1, "Kokkurinn skar laukinn með ___.", "ÞGFET", "hnífur", ["blýantur", "bók", "sokkur"]),
    (2, "Fuglinn byggði sér ___ í trénu.", "ÞFET", "hreiður", ["bíll", "sundlaug", "kirkja"]),
    (3, "Ég fékk ___ í hálsinn og fór til læknis.", "ÞFET", "verkur", ["gluggi", "bók", "ský"]),
    (3, "Bíllinn var tómur svo við keyptum ___ á bensínstöðinni.", "ÞFET", "bensín", ["gras", "ský", "hunang"]),
    (2, "Ég þvoði mér um hendurnar með ___.", "ÞGFET", "sápa", ["mjólk", "blek", "hunang"]),
    (2, "Á haustin falla ___ af trjánum.", "NFFTgr", "lauf", ["bók", "skór", "diskur"]),
    (3, "Hundurinn gelti að ___ sem kom með bréfin.", "ÞGFETgr", "póstur", ["stóll", "ský", "brauð"]),
    (2, "Mig klæjaði eftir að ___ stakk mig.", "NFETgr", "fluga", ["skeið:kvk", "sól:kvk", "bók"]),
    (3, "Ég setti frímerki á ___ og sendi það.", "ÞFETgr", "bréf", ["epli", "rúm", "fjall"]),
    (3, "Við kveiktum á ___ þegar dimmt var orðið.", "ÞGFFTgr", "kerti", ["epli", "skæri", "egg:hk"]),
    (4, "Hún hengdi ___ upp á snúru til þerris.", "ÞFETgr", "þvottur", ["sófi", "bíll", "snjór"]),
    (3, "Ég bauð vinum mínum í ___ á laugardaginn.", "ÞFET", "afmæli", ["ský", "egg:hk", "gras"]),
    (4, "Ég setti mjólkina inn í ___ svo hún skemmdist ekki.", "ÞFETgr", "ísskápur", ["sófi", "gluggi", "hattur"]),
    (3, "Hann las ___ áður en hann fór að sofa.", "ÞFET", "bók", ["mjólk", "eldavél", "skeið:kvk"]),
    (1, "Hún opnaði ___ með lyklinum.", "ÞFETgr", "hurð", ["ský", "mjólk", "sól:kvk"]),
    (3, "Við fórum með ___ yfir hafið til Danmerkur.", "ÞGFETgr", "ferja", ["skeið:kvk", "sápa", "kaka"]),
    (4, "Ég setti á mig ___ því það var kalt úti.", "ÞFET", "húfa", ["kaka", "gata", "eldavél"]),
    (1, "Ég borðaði ___ í morgunmat.", "ÞFET", "hafragrautur", ["stóll", "sófi", "hamar"]),
    (1, "Ég þvoði fötin í ___.", "ÞGFETgr", "þvottavél", ["eldavél", "bókahilla", "klukka"]),
    (1, "Hann negldi naglann með ___.", "ÞGFET", "hamar", ["penni", "sokkur", "diskur"]),
    (1, "Kýrin gefur okkur ___.", "ÞFET", "mjólk", ["bensín", "sápa", "blek"]),
    (2, "Ég burstaði tennurnar með nýjum ___.", "ÞGFET", "tannbursti", ["hamar", "penni", "stóll"]),
    (2, "Ég borga fyrir matinn með ___.", "ÞGFFT", "peningur", ["sokkur", "steinn", "bátur"]),
    (3, "Í ___ eru margar bækur sem má fá lánaðar.", "ÞGFETgr", "bókasafn", ["sundlaug", "bakarí", "fjós:hk"]),
    (1, "Ég keypti brauð í ___.", "ÞGFETgr", "bakarí", ["bókasafn", "fjós:hk", "kirkja"]),
    (2, "Ég synti tíu ferðir í ___.", "ÞGFETgr", "sundlaug", ["bókasafn", "ísskápur", "bakarí"]),
    (1, "Flugvélin lenti á ___.", "ÞGFETgr", "flugvöllur", ["ísskápur", "sokkur", "diskur"]),
    (1, "Hún skar brauðið með ___.", "ÞGFETgr", "hnífur", ["sokkur", "penni", "koddi"]),
    (2, "Ég lagði höfuðið á ___ og sofnaði.", "ÞFETgr", "koddi", ["hnífur", "gaffall", "ofn"]),
    (1, "Ég drakk ___ úr bolla.", "ÞFET", "kaffi", ["sandur", "stóll", "grjót"]),
    (1, "Ég vaknaði þegar ___ hringdi.", "NFETgr", "vekjaraklukka", ["sófi", "koddi", "teppi"]),
    (1, "Við grilluðum ___ í kvöldmat.", "ÞFFT", "pylsa", ["sokkur", "blýantur", "steinn"]),
    (3, "Það rigndi svo ég tók með mér ___.", "ÞFET", "regnhlíf", ["eldavél", "koddi", "diskur"]),
    (1, "Kötturinn veiddi ___ í garðinum.", "ÞFET", "mús", ["sófi", "bók", "klukka"]),
    (2, "Ég hringdi í mömmu úr ___ mínum.", "ÞGFET", "sími", ["sokkur", "koddi", "gaffall"]),
    (2, "Bóndinn rak ___ inn í fjárhúsið.", "ÞFFTgr", "kind", ["bók", "skeið:kvk", "klukka"]),
    (1, "Skipið sigldi út á ___.", "ÞFETgr", "haf", ["eldhús", "rúm", "bókasafn"]),
    (2, "Ég mældi hitann með ___.", "ÞGFET", "hitamælir", ["sokkur", "koddi", "diskur"]),
    (3, "Við horfðum á tunglið í ___.", "ÞGFET", "sjónauki", ["sokkur", "koddi", "hamar"]),
    (1, "Mamma bakaði ___ í ofninum.", "ÞFFT", "smákaka", ["sokkur", "steinn", "penni"]),
    (1, "Ég sópaði gólfið með ___.", "ÞGFET", "kústur", ["ostur", "sími", "diskur"]),
    (2, "Hún skrifaði á töfluna með ___.", "ÞGFET", "krít", ["mjólk", "sápa", "kaka"]),
    (1, "Ég setti bréfið í ___.", "ÞFETgr", "umslag", ["ský", "tungl", "fjall"]),
    (1, "Hesturinn borðaði ___ í hesthúsinu.", "ÞFET", "hey", ["blek", "gler", "járn"]),
    (2, "Við gistum á ___ í fríinu.", "ÞGFET", "hótel", ["ský", "egg:hk", "blóm"]),
    (1, "Ég setti plásturinn á ___.", "ÞFETgr", "sár:hk", ["ský", "tungl", "haf"]),
    (3, "Hann tók mynd af fjallinu með ___ sinni.", "ÞGFET", "myndavél", ["eldavél", "þvottavél", "skeið:kvk"]),
    (2, "Ég hengdi úlpuna á ___.", "ÞFETgr", "snagi", ["himinn", "snjór", "sandur"]),
]

# Word in context, generated (critique item 23): a sentence that asks for
# one kind of thing, the nouns that are that kind, and nouns that cannot be
# it in any reading. Each noun that fits makes an item, with three of the
# nouns that do not as its wrong options (the builder draws them), all in
# the sentence's BÍN mark. The test of a wrong noun is not "unusual" but
# "impossible": *Ég þvoði eplin í þvottavélinni* is nonsense; *sápa* is not
# a wrong option for a car (it is washed), nor *eldavél* for a zoo.
# (bonus, sentence, mark, [fits], [cannot])
# Level = length (sentences.py's table); +1 (bonus) for a clue that is not
# an everyday word; +1 for an answer the frequency list ranks below 3,000.
WORD_IN_CONTEXT_FRAMES = [
    (0, "Ég keypti ___ í bakaríinu.", "ÞFET",
     ["brauð", "kaka", "snúður", "kleina", "rúnstykki", "vínarbrauð"],
     ["hamar", "sokkur", "stóll", "hestur", "bíll", "skrúfjárn"]),
    (0, "Við borðuðum ___ í kvöldmat.", "ÞFET",
     ["fiskur", "súpa", "kjúklingur", "hamborgari", "lambakjöt"],
     ["stóll", "sófi", "hamar", "sokkur", "gluggi", "blýantur"]),
    (0, "Það var kalt svo ég fór í ___.", "ÞFET",
     ["úlpa", "peysa", "jakki", "kápa"],
     ["kaka", "eldavél", "gaffall", "sófi", "súpa", "kartafla"]),
    (0, "Kötturinn elti ___ úti í garði.", "ÞFET",
     ["mús", "fugl", "fiðrildi", "fluga"],
     ["sófi", "ísskápur", "klukka", "eldavél", "þvottavél", "kirkja"]),
    (1, "Ég hengdi úlpuna á ___ í forstofunni.", "ÞFETgr",
     ["snagi", "krókur"],
     ["himinn", "snjór", "sandur", "súpa", "mjólk", "regnbogi"]),
    (0, "Hundurinn nagaði ___ úti í garði.", "ÞFET",
     ["bein", "spýta", "skór"],
     ["ský", "tungl", "himinn", "regnbogi", "vindur", "rigning"]),
    (0, "Ég skrifaði nafnið mitt með ___.", "ÞGFET",
     ["penni", "blýantur", "krít", "tússpenni"],
     ["ostur", "sokkur", "kartafla", "koddi", "teppi"]),
    (0, "Ég fékk mér ___ úr ísskápnum.", "ÞFET",
     ["mjólk", "jógúrt:hk", "skyr", "ostur", "epli", "safi"],
     ["sófi", "gluggi", "rúm", "klukka", "teppi", "hurð"]),
    (0, "Mamma vökvaði ___ í garðinum.", "ÞFFTgr",
     ["blóm", "tré", "rós", "planta"],
     ["bók", "bíll", "skór", "stóll", "klukka", "sími"]),
    (0, "Ég fór með ___ í viðgerð.", "ÞFETgr",
     ["bíll", "hjól", "sími", "tölva", "úr:hk"],
     ["mjólk", "súpa", "ský", "brauð", "epli", "snjór"]),
    (0, "Ég las ___ fyrir litlu systur mína.", "ÞFET",
     ["saga", "ævintýri", "bók", "ljóð"],
     ["gaffall", "sokkur", "stóll", "mjólk", "steinn", "hamar"]),
    (0, "Í dýragarðinum gáfum við ___ að borða.", "ÞGFETgr",
     ["ljón", "fíll", "gíraffi", "api", "selur"],
     ["eldavél", "ísskápur", "sófi", "gaffall", "stóll", "klukka"]),
    (0, "Ég fer í ___ til að synda.", "ÞFETgr",
     ["sundlaug", "sjór", "vatn"],
     ["bókasafn", "bakarí", "ísskápur", "kirkja", "skápur"]),
    (0, "Pabbi lagaði ___ með skrúfjárni.", "ÞFETgr",
     ["hurð", "hjól", "stóll", "skápur", "leikfang"],
     ["mjólk", "súpa", "ský", "snjór", "rigning", "hunang"]),
    (0, "Mamma eldaði ___ handa okkur.", "ÞFET",
     ["súpa", "grautur", "fiskur", "kjúklingur", "pasta"],
     ["sófi", "gluggi", "skór", "hamar", "blýantur", "bíll"]),
    (0, "Ég tók ___ með í skólann.", "ÞFETgr",
     ["taska", "nesti", "bók", "blýantur", "reiknivél"],
     ["eldhús", "hús", "fjall", "ský", "sjór", "kirkja"]),
    (0, "Við horfðum á ___ í sjónvarpinu.", "ÞFETgr",
     ["mynd", "þáttur", "leikur"],
     ["ísskápur", "eldavél", "sófi", "stóll", "gluggi", "teppi"]),
    (0, "Ég hlustaði á ___ í útvarpinu.", "ÞFETgr",
     ["lag", "þáttur", "viðtal"],
     ["ísskápur", "eldavél", "sófi", "steinn", "skór", "gaffall"]),
    (0, "Ég sendi ___ til ömmu.", "ÞFET",
     ["bréf", "kort", "pakki", "mynd"],
     ["hús", "fjall", "sjór", "ský", "vegur", "tungl"]),
    (0, "Ég keypti ___ í blómabúðinni.", "ÞFFT",
     ["rós", "túlípani", "blóm", "planta"],
     ["hamar", "sokkur", "bíll", "hjól", "fiskur", "sími"]),
    (0, "Ég þvoði ___ í þvottavélinni.", "ÞFFTgr",
     ["sokkur", "handklæði", "buxur", "peysa", "bolur"],
     ["bók", "sími", "kaka", "egg:hk", "epli", "stóll"]),
    (1, "Ég þvoði ___ í uppþvottavélinni.", "ÞFFTgr",
     ["diskur", "glas", "gaffall", "pottur", "skál", "bolli"],
     ["peysa", "sokkur", "bók", "sími", "buxur", "skór"]),
    (0, "Á veturna rennum við okkur á ___.", "ÞGFFT",
     ["sleði", "skíði", "snjóbretti"],
     ["sófi", "gluggi", "súpa", "rúm", "klukka", "eldavél"]),
    (0, "Ég setti ___ í frystinn.", "ÞFET",
     ["ís", "fiskur", "kjöt", "brauð"],
     ["sófi", "hús", "fjall", "sjónvarp", "rúm", "bíll"]),
    (0, "Hún spilaði á ___ á tónleikunum.", "ÞFET",
     ["gítar", "píanó", "fiðla", "flauta", "selló"],
     ["eldavél", "ísskápur", "sófi", "kartafla", "skór", "brauð"]),
    (0, "Ég fékk ___ í afmælisgjöf.", "ÞFET",
     ["hjól", "bók", "sími", "úr:hk", "peysa", "bolti", "leikfang"],
     ["ský", "tungl", "himinn", "haf", "rigning", "eldfjall"]),
    (0, "Ég stakk ___ í samband.", "ÞGFETgr",
     ["sími", "hleðslutæki", "tölva", "lampi", "brauðrist"],
     ["epli", "ostur", "sokkur", "kaka", "hestur", "steinn"]),
    (0, "Við fórum yfir ___ á brúnni.", "ÞFETgr",
     ["á:kvk", "fljót", "lækur"],
     ["stóll", "ísskápur", "súpa", "sófi", "koddi", "gaffall"]),
    (0, "Ég fór í ___ til að kaupa mjólk.", "ÞFETgr",
     ["búð", "verslun", "matvöruverslun"],
     ["sundlaug", "kirkja", "bókasafn", "sjór", "fjall"]),
    (0, "Ég sá ___ á himninum í nótt.", "ÞFFT",
     ["stjarna", "norðurljós"],
     ["stóll", "sokkur", "gaffall", "skór", "diskur", "koddi"]),
    (0, "Við settum ___ á bílinn á bensínstöðinni.", "ÞFET",
     ["bensín", "olía"],
     ["mjólk", "hunang", "sykur:kk", "súpa", "kakó"]),
    (0, "Ég drakk ___ úr glasi.", "ÞFET",
     ["vatn", "mjólk", "safi", "gos"],
     ["sandur", "stóll", "steinn", "brauð", "hamar", "sokkur"]),
    (0, "Við fórum með hundinn í ___ í skóginum.", "ÞFET",
     ["gönguferð", "göngutúr"],
     ["sundlaug", "ísskápur", "bakarí", "þvottavél", "eldhús"]),
    (0, "Smiðurinn negldi ___ saman.", "ÞFFTgr",
     ["fjöl", "spýta", "planki"],
     ["súpa", "ský", "epli", "egg:hk", "kaka", "bolli"]),
    (1, "Bóndinn rak ___ af fjallinu.", "ÞFFTgr",
     ["kind", "kýr", "hestur", "geit"],
     ["bók", "stóll", "sími", "skeið:kvk", "klukka", "diskur"]),
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

# HUNT: the errors Icelandic teenagers actually make (critique item 26), one
# sentence per line of content/villuveidar/villur.tsv. The file's header says
# what each column holds and what the build checks; build_exercises.py looks
# every word inside the [brackets] up in BÍN. H() makes the item of one line
# (and is what tests/hunt-bank.test.js builds its bad items with).
def H(band, t, wrong, spec, why, patterns="", **checks):
    return dict(band=band, t=t, wrong=wrong, spec=[spec] if isinstance(spec, tuple) else spec,
                why=why, p=[x for x in patterns.split(",") if x], **checks)


def _hunt():
    out = []
    for r in _C.rows("villuveidar/villur.tsv", [
            ("þyngd", "int"), ("setning", "text"), ("villa", "text"), ("orð", "words:3"),
            ("skýring", "text"), ("mynstur", "str"), ("ópersónuleg", "str"), ("nefnifall", "str"),
            ("fallstjórn", "str"), ("líka rétt", "list"), ("greinist", "str")]):
        checks = {}
        for col, key in (("ópersónuleg", "op"), ("fallstjórn", "gov")):
            if r[col]:
                pair = tuple(r[col].split("|"))
                if len(pair) != 2:
                    _bad(r, "„%s“ á að vera orð|fall / expected word|case" % col)
                checks[key] = pair
        if r["nefnifall"]:
            checks["nf"] = r["nefnifall"]
        if r["líka rétt"]:
            checks["also"] = r["líka rétt"]
        if r["greinist"] not in ("", "nei"):
            _bad(r, "„greinist“ á að vera „nei“ eða autt / expected nei or nothing")
        if r["greinist"] == "nei":
            checks["parse"] = False
        out.append(H(r["þyngd"], r["setning"], r["villa"], r["orð"], r["skýring"], r["mynstur"], **checks))
    return out


HUNT = _hunt()
