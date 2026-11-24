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
#   (level, frame, case, why, days): days "ágúst 18-31, janúar 3-6" or ""
DATE_FRAMES = _table("toluord/dagsetningar.tsv", [
    ("þyngd", "int"), ("rammi", "text"), ("fall", "text"), ("skýring", "text"), ("dagar", "str")])

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

# Connectives of cause, time and contrast, and understanding the paired ones
# (issue #28, docs/DLD-PLAN.md §3; content/obeygjanleg/tengiord.tsv and
# tengiord-skilningur.tsv, whose headers hold the rules). Short sentences for
# pupils with developmental language disorder. Each wrong option carries the
# reason it fails, which the pupil who picks it reads.
#   CONNECTIVE        (sentence with ___, right, why, [(wrong, why not) × 3])
#   CONNECTIVE_SENSE  (sentence, question, right, why, [(wrong, why not) × 3])
_WRONG3 = [(c, "text") for k in "123" for c in ("rangt " + k, "af hverju ekki " + k)]
def _wrong3(r):
    return [(r["rangt " + k], r["af hverju ekki " + k]) for k in "123"]
CONNECTIVE = [(r["setning"], r["svar"], r["skýring"], _wrong3(r)) for r in _C.rows(
    "obeygjanleg/tengiord.tsv", [("setning", "text"), ("svar", "text"), ("skýring", "text")] + _WRONG3)]
CONNECTIVE_SENSE = [(r["setning"], r["spurning"], r["svar"], r["skýring"], _wrong3(r)) for r in _C.rows(
    "obeygjanleg/tengiord-skilningur.tsv",
    [("setning", "text"), ("spurning", "text"), ("svar", "text"), ("skýring", "text")] + _WRONG3)]
# The five connectives CONNECTIVE chooses among, and whether the verb comes
# straight after each (an adverb in first place: *Þess vegna fór ég*) or the
# subject first (a conjunction: *af því að ég fór*). The build holds every
# answer to it.
CONNECTIVES = {"af því að": False, "þess vegna": True, "þegar": False, "síðan": True, "en": False}

# Synonyms and antonyms (content/ordafordi/samheiti.tsv, andheiti.tsv): groups
# of words that mean the same, by word class; pairs of opposites. A
# distractor is never taken from the same group or from an antonym.
#   SYNONYMS  {class: [[word, word, ...], ...]}
#   ANTONYMS  {class: [(word, opposite), ...]}
def _by_class(rel, cols, item):
    out = {}
    for r in _C.rows(rel, cols):
        out.setdefault(r["orðflokkur"], []).append(item(r))
    return out


SYNONYMS = _by_class("ordafordi/samheiti.tsv", [("orðflokkur", "text"), ("orð", "list")], lambda r: r["orð"])
ANTONYMS = _by_class("ordafordi/andheiti.tsv", [("orðflokkur", "text"), ("orð", "text"), ("andheiti", "text")],
                     lambda r: (r["orð"], r["andheiti"]))

# Word in context: exactly one option makes sense, every option a noun in the
# same BÍN mark. Hand-written (content/ordafordi/samhengi.tsv) and generated
# from what fits and what cannot (samhengi-rammar.tsv, critique item 23).
#   WORD_IN_CONTEXT         (level, sentence, mark, right, [wrong, wrong, wrong], sense)
#   WORD_IN_CONTEXT_FRAMES  (bonus, sentence, mark, [fits], [cannot]); a fit
#                           may end in =N or =- (the ÍNO sense, review M1)
WORD_IN_CONTEXT = _table("ordafordi/samhengi.tsv", [
    ("þyngd", "int"), ("setning", "text"), ("mark", "text"), ("svar", "text"), ("rangt", "list"),
    ("merking", "str")])
WORD_IN_CONTEXT_FRAMES = _table("ordafordi/samhengi-rammar.tsv", [
    ("bónus", "int"), ("setning", "text"), ("mark", "text"), ("passar", "list"), ("passar ekki", "list")])

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

# ---------------------------------------------------------------- Setningafræði

# „Hver gerði hvað?“ (issue 27): a sentence, a verb in it, and who did what to
# whom — the gerandi and the þolandi, which in a passive are NOT the frumlag
# and the andlag. One line per verb; a sentence with a relative clause has
# two. The key is checked against the parse (who_did.py, where the rules
# are); build_exercises.py refuses an item whose parse says otherwise.
#   (level, kind, sentence, verb lemma, gerandi, þolandi, file:line)
# Level = the structure, one at a time: 1 passive, 3 a relative clause whose
# *sem* is the doer (or that ends the sentence), 5 one whose *sem* is the one
# it is done to, or a passive inside a relative clause.
#
# The leading _ keeps these sentences out of build_freq.py's "school
# material" lift (as _NUMERAL_SKIP above): with it, adding an item here adds
# an item and nothing else; without it the new words (*geitungur*,
# *bólusetja*) would move in the frequency ranking, and with them the
# vocabulary and every data file.
_WHO_DID = [(r["þyngd"], r["gerð"], r["setning"], r["sögn"], r["gerandi"], r["þolandi"],
             "%s:%d" % (r.file, r.line))
            for r in _C.rows("setningafraedi/hver-gerdi-hvad.tsv", [
                ("þyngd", "int"), ("gerð", "text"), ("setning", "text"), ("sögn", "text"),
                ("gerandi", "text"), ("þolandi", "text"), ("athugasemd", "str")])]

# ---------------------------------------------------------------- Sameina og skipta

# COMBINE (issue #29): two short sentences and the same thing said in one
# sentence with a subordinate clause, one pair per line of
# content/malbeiting/sameina.tsv. Asked in both directions. The file's header
# says what each column holds and what the build checks: build_exercises.py
# has Greynir parse every sentence of a pair and refuses the pair unless each
# short sentence is one main clause and each joined sentence holds exactly one
# subordinate clause of the kind the pair names, opened by its conjunction
# (clause_shape.py).
#   COMBINE  (level, kind, conjunction, a, b, [joined, also …], [[a, b], also …], line)
#            kind: orsök | tíð | skýring | tilvísun; line: the line of the file
# (Tuples and a line NUMBER on purpose: build_freq.py reads every string in
# this module as school material, a dict's keys and a file path included.)
COMBINE_KINDS = ("orsök", "tíð", "skýring", "tilvísun")


def _two(text):
    """"A. B." -> ["A.", "B."]: the two sentences of one cell, or None."""
    parts = [x.strip() for x in text.replace(". ", ".\n").split("\n")]
    return parts if len(parts) == 2 and all(parts) else None


def _combine():
    out = []
    for r in _C.rows("malbeiting/sameina.tsv", [
            ("þyngd", "int"), ("gerð", "text"), ("tenging", "text"), ("fyrri", "text"), ("seinni", "text"),
            ("saman", "text"), ("líka saman", "str"), ("líka sundur", "str")]):
        if r["gerð"] not in COMBINE_KINDS:
            _bad(r, "„gerð“ á að vera %s / expected one of these" % ", ".join(COMBINE_KINDS))
        apart = [[r["fyrri"], r["seinni"]]]
        for alt in [x.strip() for x in r["líka sundur"].split(" / ") if x.strip()]:
            two = _two(alt)
            if not two:
                _bad(r, "„líka sundur“: hver leið á að vera tvær setningar / each way must be two sentences (%r)" % alt)
            apart.append(two)
        joined = [r["saman"]] + [x.strip() for x in r["líka saman"].split(" / ") if x.strip()]
        out.append((r["þyngd"], r["gerð"], r["tenging"], r["fyrri"], r["seinni"], joined, apart, r.line))
    return out


COMBINE = _combine()
