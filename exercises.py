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

# A personal pronoun in the case the verb or preposition asks for, and
# reflexive or not: hand-written items (content/fornofn/eyda.tsv,
# afturbeygt.tsv), then the frames build_exercises.py fills in from BÍN
# (v6.13, critique item 23): subjects × verbs and prepositions of
# government.py (eyda-*.tsv), subjects × reflexive verbs and possessed
# things (afturbeygt-*.tsv). Each file says how its items are levelled.
#   PRONOUN_GAP        (level, sentence, answer, why)
#   REFLEXIVE          (level, sentence, who is meant, answer, the other option)
#   PRONOUN_VERBS      (verb, tense, what follows the blank — one frame each, who)
#   PRONOUN_PREPS      (preposition, verb, tense, words between, what follows, who)
#   REFLEX_OBJECT      (verb, case of the object, what follows the blank, plural subjects too?)
#   REFLEX_POSSESSIVE  (verb, case of the thing owned, the things)
PRONOUN_GAP = _table("fornofn/eyda.tsv", [
    ("þyngd", "int"), ("setning", "text"), ("svar", "word:3"), ("skýring", "text")])
REFLEXIVE = _table("fornofn/afturbeygt.tsv", [
    ("þyngd", "int"), ("setning", "text"), ("merking", "text"), ("svar", "word:3"), ("rangt", "word:3")])
PRONOUN_SUBJECTS = _column("fornofn/eyda-frumlog.tsv", ("frumlag", "word:3"))
PRONOUN_VERBS = _table("fornofn/eyda-sagnir.tsv", [
    ("sögn", "text"), ("tíð", "text"), ("framhald", "list"), ("hver", "text")])
PRONOUN_PREPS = _table("fornofn/eyda-forsetningar.tsv", [
    ("forsetning", "text"), ("sögn", "text"), ("tíð", "text"), ("milli", "str"), ("framhald", "list"),
    ("hver", "text")])
REFLEX_SUBJECTS = _column("fornofn/afturbeygt-frumlog.tsv", ("frumlag", "word:3"))
# Somebody else of the subject's gender and number: *annar strákur* …
REFLEX_OTHER = {"kk": ("strákur", "annar"), "kvk": ("stelpa", "annar")}

REFLEX_OBJECT = _table("fornofn/afturbeygt-sagnir.tsv", [
    ("sögn", "text"), ("fall", "text"), ("framhald", "text"), ("fleirtala", "bool")])
REFLEX_POSSESSIVE = _table("fornofn/afturbeygt-eign.tsv", [
    ("sögn", "text"), ("fall", "text"), ("hlutir", "list")])

# ---------------------------------------------------------------- Töluorð

# A cardinal 1-4 agreeing with its noun, hand-written (content/toluord/
# samraemi.tsv), and frames × nouns by meaning (rammar.tsv, v6.13, critique
# item 23). Each file says how its items are levelled.
#   (level, frame, case, which numbers, nouns)          NUMERAL_AGREE
#   (level, frame, case, which numbers, nouns or classes[, nouns left out])
#                                                       NUMERAL_FRAMES
NUMERAL_AGREE = _table("toluord/samraemi.tsv", [
    ("þyngd", "int"), ("rammi", "text"), ("fall", "text"), ("tölur", "ints"), ("nafnorð", "list")])

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

def _numeral_frames():
    out = []
    for r in _C.rows("toluord/rammar.tsv", [
            ("þyngd", "int"), ("rammi", "text"), ("fall", "text"), ("tölur", "ints"), ("nafnorð", "list"),
            ("flokkar", "str"), ("sleppa", "list")]):
        if bool(r["nafnorð"]) == bool(r["flokkar"]):
            _bad(r, "fylltu út annaðhvort „nafnorð“ eða „flokkar“ / nouns or classes, one of the two")
        e = (r["þyngd"], r["rammi"], r["fall"], r["tölur"], r["nafnorð"] or r["flokkar"])
        out.append(e + ((r["sleppa"],) if r["sleppa"] else ()))
    return out


NUMERAL_FRAMES = _numeral_frames()

# Plural-only nouns: einir, tvennir, þrennir, fernir.
PLURAL_ONLY_NOUNS = ["buxur", "skæri", "gleraugu", "tónleikar", "dyr", "jól", "hjón"]
PLURAL_NUMERALS = {1: ("einn", "fn"), 2: ("tvennur", "lo"), 3: ("þrennur", "lo"), 4: ("fern", "lo")}

# The plural-only nouns with einir, tvennir, þrennir, fernir: hand-written
# (content/toluord/fleirtoluord.tsv) and frames × groups of such nouns
# (fleirtoluord-hopar.tsv, fleirtoluord-rammar.tsv; v6.13, critique item 23).
NUMERAL_PLURAL_ONLY = _table("toluord/fleirtoluord.tsv", [
    ("þyngd", "int"), ("rammi", "text"), ("fall", "text"), ("tölur", "ints"), ("nafnorð", "list")])
PLURAL_ONLY_GROUPS = _dict("toluord/fleirtoluord-hopar.tsv", [("hópur", "text"), ("nafnorð", "list")])
PLURAL_ONLY_FRAMES = _table("toluord/fleirtoluord-rammar.tsv", [
    ("þyngd", "int"), ("rammi", "text"), ("fall", "text"), ("tölur", "ints"), ("hópar", "text")])

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

# The case the date stands in, and why: content/toluord/dagsetningar.tsv.
#   (level, frame, case, why)
DATE_FRAMES = _table("toluord/dagsetningar.tsv", [
    ("þyngd", "int"), ("rammi", "text"), ("fall", "text"), ("skýring", "text")])

# ---------------------------------------------------------------- Fallstjórn

# Motion (þolfall) or rest (þágufall) after í / á / undir / yfir: hand-written
# pairs (content/fallstjorn/hreyfing.tsv) and sets of motion sentences, rest
# sentences and nouns (hreyfing-sett.tsv, critique item 23). Every item must
# have ONE right answer; the files say how.
#   MOTION_REST  (level, sentence, noun, column, motion?)
#   MOTION_SETS  (preposition, column, [motion], [rest], [nouns])
MOTION_REST = _table("fallstjorn/hreyfing.tsv", [
    ("þyngd", "int"), ("setning", "text"), ("nafnorð", "text"), ("dálkur", "text"), ("hreyfing", "bool")])


def _motion_sets():
    out = []
    for rs in _C.groups("fallstjorn/hreyfing-sett.tsv", "sett", [
            ("sett", "int"), ("forsetning", "text"), ("dálkur", "text"), ("gerð", "text"),
            ("texti", "text")]).values():
        goes, stays, nouns = [], [], None
        for r in rs:
            if (r["forsetning"], r["dálkur"]) != (rs[0]["forsetning"], rs[0]["dálkur"]):
                _bad(r, "sama sett, önnur forsetning eða dálkur / one set, one preposition and column")
            if r["gerð"] == "hreyfing":
                goes.append(r["texti"])
            elif r["gerð"] == "kyrrstaða":
                stays.append(r["texti"])
            elif r["gerð"] == "nafnorð" and nouns is None:
                nouns = _C.split_list(r["texti"])
            else:
                _bad(r, "„gerð“ á að vera hreyfing, kyrrstaða eða (einu sinni) nafnorð")
        if not (goes and stays and nouns):
            _bad(rs[0], "sett þarf hreyfingu, kyrrstöðu og nafnorð / a set needs all three")
        out.append((rs[0]["forsetning"], rs[0]["dálkur"], goes, stays, nouns))
    return out


MOTION_SETS = _motion_sets()

# A verb that governs a case: hand-written (content/fallstjorn/sagnir.tsv) and
# frames × noun groups (sagnir-rammar.tsv × sagnir-hopar.tsv, critique item
# 23). Only items where the VERB governs the case.
#   VERB_CASE    (level, sentence, verb, case, column, nouns)
#   VERB_FRAMES  (bonus, sentence, verb, case, [(noun, column)])
VERB_CASE = _table("fallstjorn/sagnir.tsv", [
    ("þyngd", "int"), ("setning", "text"), ("sögn", "text"), ("fall", "text"), ("dálkur", "text"),
    ("nafnorð", "list")])
_VC = _dict("fallstjorn/sagnir-hopar.tsv", [("hópur", "text"), ("nafnorð", "words:2")])


def _vc(name):
    if name not in _VC:
        raise _C.ContentError("content/fallstjorn/sagnir-hopar.tsv: enginn hópur heitir „%s“ / no group %r"
                              % (name, name))
    return _VC[name]


# The groups by the names the builders and older notes know them by.
VC_FAMILY, VC_OTHERS, VC_PEOPLE = _vc("fjölskylda"), _vc("aðrir"), _vc("fólk")
VC_ANIMALS, VC_PETS, VC_VISITED = _vc("dýr"), _vc("gæludýr"), _vc("heimsótt")
VC_THINGS, VC_STOLEN, VC_THROWN = _vc("hlutir"), _vc("stolið"), _vc("kastað")
VC_SHUT, VC_RUBBISH, VC_PUSHED = _vc("lokað"), _vc("rusl"), _vc("ýtt")
VC_AWAITED, VC_FETCHED = _vc("beðið"), _vc("sótt")


def _verb_frames():
    out = []
    for r in _C.rows("fallstjorn/sagnir-rammar.tsv", [
            ("bónus", "int"), ("setning", "text"), ("sögn", "text"), ("fall", "text"), ("hópur", "text")]):
        names = [x.strip() for x in r["hópur"].split("+")]
        nouns = _vc(names[0]) if len(names) == 1 else [n for x in names for n in _vc(x)]
        out.append((r["bónus"], r["setning"], r["sögn"], r["fall"], nouns))
    return out


VERB_FRAMES = _verb_frames()

# Impersonal verbs (fs_operson, critique item 23): every frame of
# content/fallstjorn/opersonulegar.tsv with every subject of
# opersonulegar-frumlog.tsv, in each tense it is written for. The file says
# what the case column means ("op", "ÞGF", "NF" for the traps) and the rules.
#   IMPERSONAL_FRAMES    (bonus, verb, case, present, past)
#   IMPERSONAL_SUBJECTS  (lemma, class, column, level bonus)
IMPERSONAL_FRAMES = _table("fallstjorn/opersonulegar.tsv", [
    ("bónus", "int"), ("sögn", "text"), ("fall", "text"), ("nútíð", "opt"), ("þátíð", "opt")])
IMPERSONAL_SUBJECTS = [r["frumlag"] + (r["bónus"],) for r in _C.rows(
    "fallstjorn/opersonulegar-frumlog.tsv", [("frumlag", "word:3"), ("bónus", "int")])]

# ---------------------------------------------------------------- Óbeygjanleg

# Preposition or adverb: hand-written (content/obeygjanleg/fs-ao.tsv) and
# generated pairs (fs-ao-rammar.tsv, critique item 23).
#   ADV_OR_PREP      (level, sentence, the word, "fs" | "ao")
#   ADV_PREP_FRAMES  (word, [(preposition frame, case, [(noun, column)])], [adverb sentences])
ADV_OR_PREP = _table("obeygjanleg/fs-ao.tsv", [
    ("þyngd", "int"), ("setning", "text"), ("orð", "text"), ("flokkur", "text")])


def _adv_prep_frames():
    out = []
    for w, rs in _C.groups("obeygjanleg/fs-ao-rammar.tsv", "orð", [
            ("orð", "text"), ("gerð", "text"), ("setning", "text"), ("fall", "str"),
            ("nafnorð", "words:2")]).items():
        preps, advs = [], []
        for r in rs:
            if r["gerð"] == "forsetning" and r["fall"] and r["nafnorð"]:
                preps.append((r["setning"], r["fall"], r["nafnorð"]))
            elif r["gerð"] == "atviksorð" and not r["fall"] and not r["nafnorð"]:
                advs.append(r["setning"])
            else:
                _bad(r, "forsetning: fall og nafnorð; atviksorð: hvorugt / a preposition takes a case "
                        "and nouns, an adverb neither")
        out.append((w, preps, advs))
    return out


ADV_PREP_FRAMES = _adv_prep_frames()

# Choose the conjunction: hand-written contrast sets (content/obeygjanleg/
# samtengingar.tsv; the meaning-only choices stay there) and the generated
# ones, where the grammar or plain fact leaves exactly one option
# (samtengingar-*.tsv, critique item 23). The files say the rules.
#   CONJUNCTION   (level, sentence, right, [wrong, wrong, wrong], why)
#   CONJ_COMPARE  (adjective, [((subject, column | None), (the other, column | None))])
#   CONJ_WHETHER  ([frames], [clauses])
CONJUNCTION = _table("obeygjanleg/samtengingar.tsv", [
    ("þyngd", "int"), ("setning", "text"), ("svar", "text"), ("rangt", "list"), ("skýring", "text")])
CONJ_COMPARE = [(adj, [(r["fyrra"], r["seinna"]) for r in rs]) for adj, rs in _C.groups(
    "obeygjanleg/samtengingar-samanburdur.tsv", "lýsingarorð",
    [("lýsingarorð", "text"), ("fyrra", "wordopt"), ("seinna", "wordopt")]).items()]
CONJ_PAIRS = _table("obeygjanleg/samtengingar-por.tsv", [("fyrra", "text"), ("seinna", "text")])
_CF = _C.groups("obeygjanleg/samtengingar-rammar.tsv", "listi", [("listi", "text"), ("texti", "text")])
_CF_KNOWN = ("bæði", "hvorki", "annaðhvort", "hvort-rammi", "hvort-setning", "sem", "að")
for _k, _rs in _CF.items():
    if _k not in _CF_KNOWN:
        _bad(_rs[0], "„listi“ á að vera eitt af / must be one of: " + ", ".join(_CF_KNOWN))
_cf = lambda k: [r["texti"] for r in _CF.get(k, [])]
CONJ_BOTH, CONJ_NEITHER, CONJ_EITHER = _cf("bæði"), _cf("hvorki"), _cf("annaðhvort")
CONJ_WHETHER = (_cf("hvort-rammi"), _cf("hvort-setning"))
CONJ_RELATIVE, CONJ_SAID = _cf("sem"), _cf("að")
#   CONJ_CAUSE  (cause, result): "{result} af því að {cause}", "{cause} svo að {result}"
#   CONJ_ORDER  (first, then, then', first'): "{first} áður en {then}", "{then'} eftir að {first'}"
CONJ_CAUSE = _table("obeygjanleg/samtengingar-orsok.tsv", [("orsök", "text"), ("afleiðing", "text")])
CONJ_ORDER = _table("obeygjanleg/samtengingar-rod.tsv", [
    ("fyrst", "text"), ("svo", "text"), ("svo 2", "text"), ("fyrst 2", "text")])

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
