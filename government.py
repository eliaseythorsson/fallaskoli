# -*- coding: utf-8 -*-
"""A case-government table — used only to *verify* a parse, never to assert
grammar.

Design rule 1 says: never assert a grammatical rule by hand. This table does not
break it, because it never produces an answer. It can only do two things:

  * reject a parse that contradicts it (the build then stops), and
  * mark a token as uncertain (the program then does not ask about it).

The table is therefore a brake, not a source. If Greynir and the table agree we
use Greynir's mark; if they disagree, no question is built. This is exactly §3.4
of the roadmap: use the table to confirm the parse instead of trusting it.
"""

# ---------------------------------------------------------------------------
# 1. Prepositions
# ---------------------------------------------------------------------------
# Each preposition gets the set of cases it *can* govern. A preposition that
# governs two cases (motion/rest) has both here — the table exists to reject
# obvious errors, not to pretend it can resolve ambiguity.
#
# NOTE: a preposition that takes more than one case cannot be used to
# disambiguate a surface form. See AMBIGUOUS_GOVERNORS below.

PREP_CASES = {
    # --- accusative only ---
    "um": {"þf"}, "umfram": {"þf"}, "gegnum": {"þf"}, "kringum": {"þf"},
    "umhverfis": {"þf"},

    # --- dative only ---
    "að": {"þgf"}, "af": {"þgf"}, "frá": {"þgf"}, "gegn": {"þgf"},
    "gegnt": {"þgf"}, "handa": {"þgf"}, "hjá": {"þgf"}, "mót": {"þgf"},
    "móti": {"þgf"}, "undan": {"þgf"}, "úr": {"þgf"}, "andspænis": {"þgf"},
    "ásamt": {"þgf"}, "nálægt": {"þgf"}, "samkvæmt": {"þgf"},

    # --- genitive only ---
    "til": {"ef"}, "án": {"ef"}, "vegna": {"ef"}, "milli": {"ef"},
    "meðal": {"ef"}, "innan": {"ef"}, "utan": {"ef"}, "sökum": {"ef"},
    "ofan": {"ef"}, "neðan": {"ef"}, "sakir": {"ef"},

    # --- compound prepositions, as the parser tokenises them ---
    "fyrir utan": {"þf"}, "fyrir aftan": {"þf"}, "fyrir framan": {"þf"},
    "fyrir ofan": {"þf"}, "fyrir neðan": {"þf"}, "fyrir innan": {"þf"},
    "fyrir handan": {"þf"}, "meðfram": {"þgf"},

    # --- two cases: motion (þf) or rest (þgf), or by meaning ---
    "í": {"þf", "þgf"}, "á": {"þf", "þgf"}, "eftir": {"þf", "þgf"},
    "fyrir": {"þf", "þgf"}, "með": {"þf", "þgf"}, "undir": {"þf", "þgf"},
    "yfir": {"þf", "þgf"},
    # *við* is accusative by place and with most verbs (*við húsið*, *tala við
    # kennarann*) but dative with some (*taka við bréfinu*, *bregðast við
    # fréttunum*). Listed as accusative only until v6.13, so the build threw
    # out every correct *taka við* + dative sentence (critique item 7a).
    "við": {"þf", "þgf"},
}

# Prepositions that cannot disambiguate a surface form, because they govern more
# than one case. Derived directly from the table above — not typed out twice.
AMBIGUOUS_GOVERNORS = {p for p, c in PREP_CASES.items() if len(c) > 1}


# ---------------------------------------------------------------------------
# 2. Verbs
# ---------------------------------------------------------------------------
# Only verbs we are sure about. A verb that is not here is *not* verified —
# which is far better than typing in the wrong government. Verbs that take two
# objects (segja einhverjum eitthvað) have both cases in the set.

VERB_CASES = {
    # accusative
    "sjá": {"þf"}, "lesa": {"þf"}, "skrifa": {"þf"}, "borða": {"þf"},
    "kaupa": {"þf"}, "taka": {"þf"}, "fá": {"þf"}, "skoða": {"þf"},
    "spyrja": {"þf", "ef"}, "muna": {"þf"}, "heimsækja": {"þf"}, "keyra": {"þf"},
    "elska": {"þf"}, "hitta": {"þf"}, "finna": {"þf"}, "opna": {"þf"}, "biðja": {"þf", "ef"},
    "loka": {"þgf"},                      # loka governs the dative
    "langa": {"þf"}, "vanta": {"þf"}, "þekkja": {"þf"}, "kalla": {"þf"},
    "byggja": {"þf"}, "brjóta": {"þf"}, "bera": {"þf"}, "drekka": {"þf"},

    # dative
    "hjálpa": {"þgf"}, "gleyma": {"þgf"}, "svara": {"þgf"}, "trúa": {"þgf"},
    "þakka": {"þgf"}, "fylgja": {"þgf"}, "mæta": {"þgf"}, "ná": {"þgf"},
    "breyta": {"þgf"}, "lofa": {"þgf"}, "kasta": {"þgf"}, "stela": {"þgf"},
    "bjarga": {"þgf"}, "eyða": {"þgf"}, "líka": {"þgf"}, "finnast": {"þgf"},
    "henta": {"þgf"}, "nægja": {"þgf"}, "líða": {"þgf"}, "leyfa": {"þgf"},

    # eignarfall
    "sakna": {"ef"}, "bíða": {"ef"}, "krefjast": {"ef"}, "njóta": {"ef"},
    "gæta": {"ef"}, "leita": {"ef"},

    # more verbs whose government is beyond doubt
    "heyra": {"þf"}, "læra": {"þf"}, "teikna": {"þf"}, "baka": {"þf"},
    "prjóna": {"þf"}, "setja": {"þf"}, "laga": {"þf"},
    "þvo": {"þf"}, "tína": {"þf"}, "klára": {"þf"}, "ræða": {"þf"},
    "nefna": {"þf"}, "skilja": {"þf"}, "velja": {"þf"}, "passa": {"þf"},
    "selja": {"þf"}, "vinna": {"þf"}, "fella": {"þf"},
    "smíða": {"þf"}, "mála": {"þf"}, "hugsa": {"þf"}, "spila": {"þf"},
    "æfa": {"þf"}, "syngja": {"þf"}, "ná": {"þgf"},
    "henda": {"þgf"}, "týna": {"þgf"}, "skila": {"þgf"}, "safna": {"þgf"},
    "treysta": {"þgf"}, "hrósa": {"þgf"}, "aka": {"þgf"}, "stýra": {"þgf"},
    "nenna": {"þgf"}, "unna": {"þgf"}, "gleðja": {"þf"}, "vitja": {"ef"},
    "afla": {"ef"},
    # v6.4 — verbs of the sentence bank whose objects were otherwise unverified
    "eiga": {"þf"}, "hafa": {"þf"}, "fela": {"þf"}, "kunna": {"þf"},
    "vita": {"þf"}, "meiða": {"þf"}, "spara": {"þf"}, "leysa": {"þf"},
    "ljúka": {"þgf"}, "skipta": {"þgf"},
    # two objects: indirect (þgf) + direct (þf)
    "gefa": {"þgf", "þf"}, "segja": {"þgf", "þf"}, "sýna": {"þgf", "þf"},
    "senda": {"þgf", "þf"}, "lána": {"þgf", "þf"}, "kenna": {"þgf", "þf"},
    "útskýra": {"þgf", "þf"}, "bjóða": {"þgf", "þf"}, "rétta": {"þgf", "þf"},
}


def prep_allows(lemma, case):
    """True if this preposition can govern this case. An unknown preposition is
    not verified — we assert nothing about what we do not know."""
    allowed = PREP_CASES.get(lemma)
    return True if allowed is None else case in allowed


def verb_allows(lemma, case):
    """Sama fyrir sagnir."""
    allowed = VERB_CASES.get(lemma)
    return True if allowed is None else case in allowed


def prep_is_decisive(lemma):
    """Can this preposition disambiguate a surface form? Only if it governs a
    single case and we know it."""
    allowed = PREP_CASES.get(lemma)
    return allowed is not None and len(allowed) == 1


def prep_case(lemma):
    """The case this preposition governs, if there is only one."""
    allowed = PREP_CASES.get(lemma)
    if allowed and len(allowed) == 1:
        return next(iter(allowed))
    return None


KNOWN_PREPS = set(PREP_CASES)
KNOWN_VERBS = set(VERB_CASES)
