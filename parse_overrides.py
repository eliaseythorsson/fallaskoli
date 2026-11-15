# -*- coding: utf-8 -*-
"""Declared decisions about parses that contradict BÍN or the table.

The guard stops the build when it finds a disagreement. Sometimes the
disagreement is real and the parse is wrong — Greynir parses *úti* as a dative
noun in "þegar það rignir úti", for instance. In that case we want neither to
assert the right mark by hand (that breaks design rule 1) nor to let the wrong
mark through (that breaks rule 2, that a wrong question is worse than none).

The third route is this file: we record that the analysis of this token is *not
used*. The token stays in the sentence as text, but it carries no mark and the
program never asks about it.

Two conditions make this safe rather than an exemption:

  1. Every entry has to match a token that is genuinely in disagreement. An
     entry that no longer matches stops the build — so an old exemption cannot
     hide a new error when the parser changes.

  2. A disagreement that is *not* here stops the build. Nothing is silenced
     unless it is written down here, with a date and a reason.

Format: (sentence, token index, surface form, reason)
"""

REJECT = [
    # (none at present — the lemma check in parse_guard.py now withdraws the
    #  readings this list used to cover: *úti* as a noun, *taugaóstyrkur* as a noun)
]

# Lemma readings the frequency test would reject but which are right here:
# (surface form, lemma). *sofna* is both the infinitive of *sofna* and a
# participle of *sofa*, and "búinn að sofna" wants the first.
ACCEPT_LEMMA = {
    ("sofna", "sofna"),
    # "Ég mætti barni á leiðinni": *mæta* with a dative object. The form is
    # far commoner as the subjunctive of *mega*, which takes no object.
    ("mætti", "mæta"),
    ("mættum", "mæta"),
}


def lemma_accepted(form, lemma):
    return (form, lemma) in ACCEPT_LEMMA


# Lemma readings that are wrong wherever they occur in this bank: (surface
# form, lemma). *hefur* in "Hún hefur áhuga á tónlist" is *hafa*; the parse
# said *hefja*, and the cloze then asked the child to inflect "að hefja".
REJECT_LEMMA = {
    ("hefur", "hefja"),
    # "klæddust hlýjum fötum": *föt*, not *fata* (a bucket)
    ("fötum", "fata"),
    # "stelpum sem hún þekkti": the pronoun, not *húnn* (a doorknob)
    ("hún", "húnn"),
    # "höfðum beðið lengi": *bíða* and *biðja* share this supine, and the
    # parse cannot know which is meant
    ("beðið", "biðja"),
}


def lemma_rejected(form, lemma):
    return (form.lower(), lemma) in REJECT_LEMMA


# ---------------------------------------------------------------------------
# Word-class readings that are not used (v6.4)
# ---------------------------------------------------------------------------
# The mark check cannot see a wrong word class: *saman* IS a form of the
# pronoun *samur*, *og* can be an adverb, *þreyttur* IS a participle of
# *þreyta*. A teacher marking "Við borðum matinn saman" would still call
# *saman* an adverb and *þreyttur* an adjective. Where the parser's class is
# not the one the schoolbook gives — or where two schoolbooks would differ —
# the token is withdrawn: it stays in the sentence, carries no analysis, and
# is never asked about. Nothing is corrected by hand.
#
# (form, class the parser gave) -> why it is not used
CLASS_VETO = {
    ("saman", "fornafn"): "atviksorð, ekki fornafnið *samur*",
    # adverbs read as the accusative of a noun: *háttur*, *heimur*
    ("hátt", "nafnorð"): "atviksorð, ekki nafnorðið *háttur*",
    ("heim", "nafnorð"): "atviksorð, ekki nafnorðið *heimur*",
    # *miklu betri*: dative of measure or adverb, by the book
    ("miklu", "atviksorð"): "þágufall af *mikill* (mælifall); ýmist talið lýsingarorð eða atviksorð",
    ("og", "atviksorð"): "samtenging",
    ("allra", "atviksorð"): "eignarfall fleirtölu af *allur*",
    ("um", "atviksorð"): "forsetning",
    ("út", "forsetning"): "atviksorð",
    ("efst", "lýsingarorð"): "atviksorð í efsta stigi",
    ("fyrst", "lýsingarorð"): "atviksorð",
    ("svona", "lýsingarorð"): "atviksorð",
    ("seint", "lýsingarorð"): "atviksorð",
    ("eins", "lýsingarorð"): "óbeygjanlegt; ýmist talið lýsingarorð eða atviksorð",
    ("fyrra", "lýsingarorð"): "hluti af föstu orðasambandi, *í fyrra*",
    ("leyst", "lýsingarorð"): "sagnbót af *leysa*",
    # participles that are everyday adjectives
    ("þreyttur", "sagnorð"): "lýsingarorð í daglegu máli",
    ("þreyttir", "sagnorð"): "lýsingarorð í daglegu máli",
    ("hræddur", "sagnorð"): "lýsingarorð í daglegu máli",
    ("sléttir", "sagnorð"): "lýsingarorðið *sléttur*",
    ("farin", "lýsingarorð"): "lýsingarháttur þátíðar af *fara*",
    # ordinals: töluorð in school grammar, adjectives in the parser
    ("fyrsti", "lýsingarorð"): "raðtala",
    ("þriðja", "lýsingarorð"): "raðtala",
    ("tíunda", "lýsingarorð"): "raðtala",
    # *einn* before a noun: numeral or indefinite pronoun, by the book
    ("einu", "fornafn"): "töluorð eða óákveðið fornafn",
    ("einum", "fornafn"): "töluorð eða óákveðið fornafn",
}

# One token in one sentence: (sentence, surface form) -> why. The form must
# occur exactly once in the sentence with an analysis, so the entry cannot
# drift onto another word.
TOKEN_VETO = {
    ("Við sáum þá koma inn í stofuna.", "þá"):
        "persónufornafn (þeir, þolfall), þáttað sem atviksorð",
    ("Ég vissi ekki að hægt væri að læra svona mikið á einum vetri.", "hægt"):
        "lýsingarorð í hvorugkyni, þáttað sem atviksorð",
    ("Ég vissi ekki að hægt væri að læra svona mikið á einum vetri.", "mikið"):
        "andlag í þolfalli, þáttað sem sagnfylling í nefnifalli",
    ("Þegar ég kom heim úr skólanum sá ég að einhver hafði skilið dyrnar eftir opnar.", "eftir"):
        "ögn með sögninni *skilja eftir*, stýrir engu falli",
    ("Ég talaði við ykkur báða.", "báða"):
        "stendur með *ykkur* í forsetningarliðnum, þáttað sem andlag",
    # v6.5 — the first word of a fixed adverbial: a preposition by origin, an
    # adverb to the parser, and a schoolbook would not ask
    ("Verð bókanna kom mér á óvart.", "á"):
        "hluti af orðasambandinu *á óvart*",
    ("Ef þú hjálpar mér að taka til í herberginu getum við farið út að leika á eftir.", "á"):
        "hluti af orðasambandinu *á eftir*",
    # *nóg* after *borða*: an adverb, or the neuter of *nógur* as an object
    # *ónýtt* is the neuter of *ónýtur* (broken) and of *ónýttur* (unused);
    # the parse chose the second, and the dictionary box showed that word
    ("Mamma sagði að gamla hjólið mitt væri alveg ónýtt núna.", "ónýtt"):
        "hvorugkyn af *ónýtur*, þáttað sem *ónýttur*",
    ("Ég hef borðað nóg.", "nóg"):
        "atviksorð eða hvorugkyn af *nógur*; ýmist greint",
}

# Conjunctions written as two or three words. A schoolbook lists *áður en*,
# *þangað til*, *eftir að*, *eins og*, *fyrr en* and *um leið og* as
# conjunctions; the parser gives each word a class of its own (*áður* an
# adverb, *um* a preposition governing *leið*). The last word is a conjunction
# either way and keeps its analysis; the words before it are withdrawn.
MULTIWORD_CONJUNCTIONS = (
    ("áður", "en"), ("fyrr", "en"), ("þangað", "til"), ("eftir", "að"),
    ("eins", "og"), ("um", "leið", "og"), ("svo", "að"), ("þó", "að"),
    ("til", "þess", "að"),
)


def _in_multiword_conjunction(index, toks):
    """Is token `index` a non-final word of one of the conjunctions above —
    and does the final word stand there as a conjunction?"""
    low = [t["w"].lower() for t in toks]
    for conj in MULTIWORD_CONJUNCTIONS:
        for k in range(len(conj) - 1):
            start = index - k
            if start < 0 or low[start:start + len(conj)] != list(conj):
                continue
            last = toks[start + len(conj) - 1]
            if last.get("c") == "samtenging":
                return " ".join(conj)
    return None

_used = set()


def withdrawn(sentence, index, toks):
    """Why this token's analysis is not used, or None."""
    tk = toks[index]
    if tk.get("rj") or not tk.get("c"):
        return None
    form = tk["w"].lower()
    key = (form, tk["c"])
    if key in CLASS_VETO:
        _used.add(key)
        return CLASS_VETO[key]
    # *á eftir* is one preposition; *á* alone in it has no class of its own
    if form == "á" and tk["c"] == "atviksorð" and index + 1 < len(toks) \
            and toks[index + 1]["w"].lower() == "eftir" \
            and toks[index + 1].get("c") == "forsetning":
        return "hluti af forsetningunni *á eftir*"
    conj = _in_multiword_conjunction(index, toks)
    if conj:
        return "hluti af samtengingunni *%s*" % conj
    key = (sentence, tk["w"])
    if key in TOKEN_VETO:
        same = [t for t in toks if t["w"] == tk["w"]]
        if len(same) != 1:
            raise SystemExit("parse_overrides.TOKEN_VETO: %r kemur %d sinnum fyrir í %r"
                             % (tk["w"], len(same), sentence))
        _used.add(key)
        return TOKEN_VETO[key]
    return None


def unused_vetoes():
    """Entries that matched nothing in this build — stale, and stopped on."""
    return [k for k in list(CLASS_VETO) + list(TOKEN_VETO) if k not in _used]


# Lookup: (sentence, index, surface form) -> reason
BY_KEY = {(s, i, w): why for (s, i, w, why) in REJECT}


def reason_for(sentence, index, form):
    return BY_KEY.get((sentence, index, form))


def unused(seen_keys):
    """Entries that matched no disagreement in this build."""
    return [k for k in BY_KEY if k not in seen_keys]
