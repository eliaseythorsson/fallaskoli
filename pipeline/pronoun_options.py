"""The other words a pronoun could point at (issue #33, docs/DLD-PLAN.md §4).

A pronoun's referent is marked by hand in the text file (`Hann{Jón}`), and
pipeline/content_io.py has checked that it stands earlier in the text and
agrees with the pronoun in gender and number. For the question "til hvers
vísar fornafnið?" the app also needs the WRONG answers: the other nouns the
pupil has read before the pronoun. This module finds them in the parsed
text, and BÍN says which of them agree with the pronoun:

  same    the text's CHARACTERS in the pronoun's gender and number:
          agreement does not rule them out, the meaning does (*Jón hitti
          Pál. Hann …*). A character is a name (the parse's `person`) or a
          noun some mark of the text points at (*húsvörðinn*, *pabba*) —
          not any noun: *Þar grafa þeir{Lundar} sér holur* must not offer
          *hópum*, which a reader could fairly argue for, nor *nóttu* for
          *Hún{Birtan}*, which nobody would.
  other   nouns of any kind in another gender or number: the pronoun's form
          rules them out (*steinninn … hann*, not *bókin*)

Both are lists of [sentence, first token, last token], the nearest first.

What counts as a candidate, and why:
  * a noun of the parse (`c == "nafnorð"`), or two joined by *og*
    (*Jón og Sara* is one candidate, plural: *þau*);
  * wholly before the pronoun;
  * not the referent itself, nor another mention of it (a noun of the same
    lemma: *hund … hundinn*), nor a pair that holds it;
  * not the noun right before the pronoun: that is the word the pronoun
    belongs to (*eiganda hans*, *Pabbi hans*), never what it points at;
  * one per lemma: the nearest mention.

A noun's gender is BÍN's for the lemma the parse gave it; its number the
parse's own (`m`), else BÍN's. A pair of nouns is plural, in their gender if
they share one and in the neuter if not — the rule content_io.py's check uses.
"""

import itertools

GENDERS = ("kk", "kvk", "hk")
_PRONOUN = {"hann": "kk", "hún": "kvk", "það": "hk"}
_MARK = {"KK": "kk", "KVK": "kvk", "HK": "hk"}


def _num(mark):
    return "FT" if "FT" in (mark or "") else "ET"


def _readings(lookup, word):
    out = list(lookup(word))
    if word.lower() != word:
        out += [r for r in lookup(word.lower()) if r not in out]
    return out


def noun_features(lookup, tok):
    """{(gender, number)} of one noun token of the parse."""
    lemma = tok.get("l") or ""
    # the form as written first: *Jón* is the name, *jón* something else
    for rs in ([r for r in lookup(tok["w"]) if r[1] in GENDERS],
               [r for r in _readings(lookup, tok["w"]) if r[1] in GENDERS]):
        mine = [r for r in rs if r[0] == lemma] or [r for r in rs if r[0].lower() == lemma.lower()]
        if mine:
            rs = mine
            break
    if tok.get("m"):
        return {(c, _num(tok["m"])) for _l, c, _m in rs}
    return {(c, _num(m)) for _l, c, m in rs}


def pronoun_features(lookup, tok):
    """{(gender, number)} of a third-person pronoun token: the parse's
    reading (*hans* KK-EFET), else every BÍN reading of the form."""
    m = tok.get("m") or ""
    g = _MARK.get(m.split("-")[0]) if "-" in m else None
    if g and tok.get("l") in _PRONOUN:
        return {(g, _num(m))}
    return {(_PRONOUN[l], _num(mk)) for l, c, mk in _readings(lookup, tok["w"])
            if c == "pfn" and l in _PRONOUN}


def mentions(lookup, sents):
    """Every candidate of a text: {span, lemmas, f}, in reading order."""
    out = []
    for si, toks in enumerate(sents):
        for j, t in enumerate(toks):
            if t.get("c") != "nafnorð":
                continue
            out.append({"span": (si, j, j), "lemmas": {(t.get("l") or t["w"]).lower()},
                        "f": noun_features(lookup, t)})
            # N og N: one plural candidate
            if j + 2 < len(toks) and toks[j + 1]["w"] == "og" and toks[j + 2].get("c") == "nafnorð":
                u = toks[j + 2]
                a, b = noun_features(lookup, t), noun_features(lookup, u)
                f = {(g1 if g1 == g2 else "hk", "FT") for (g1, _n1), (g2, _n2) in itertools.product(a, b)}
                out.append({"span": (si, j, j + 2),
                            "lemmas": {(t.get("l") or t["w"]).lower(), (u.get("l") or u["w"]).lower()},
                            "f": f})
    return out


def _before(span, si, i):
    s, _a, b = span
    return s < si or (s == si and b < i)


def _lemmas(sents, span):
    s, a, b = span
    return {(sents[s][k].get("l") or sents[s][k]["w"]).lower()
            for k in range(a, b + 1) if sents[s][k].get("c") == "nafnorð"}


def options(lookup, sents, si, ref, marked=()):
    """(same, other) for the pronoun `ref` = {"i", "to": [sentence, a, b]}
    of sentence `si`; `sents` are the token lists of the whole text and
    `marked` the referents of every mark in it (their `to`), which make the
    characters."""
    pro = pronoun_features(lookup, sents[si][ref["i"]])
    ts, ta, tb = ref["to"]
    answer = _lemmas(sents, ref["to"])
    cast = set().union(answer, *[_lemmas(sents, to) for to in marked])

    def character(m):
        s, a, b = m["span"]
        return all(sents[s][k].get("x") == "person" or (sents[s][k].get("l") or "").lower() in cast
                   for k in range(a, b + 1) if sents[s][k].get("c") == "nafnorð")
    same, other, seen = [], [], set()
    for m in reversed(mentions(lookup, sents)):
        span = m["span"]
        if not _before(span, si, ref["i"]) or span == (ts, ta, tb):
            continue
        if span[0] == si and span[2] == ref["i"] - 1:
            continue                       # eiganda hans: the word it belongs to
        if m["lemmas"] & answer or not m["f"]:
            continue
        key = frozenset(m["lemmas"])
        if key in seen:
            continue
        seen.add(key)
        if m["f"] & pro:
            if character(m):
                same.append(list(span))
        else:
            other.append(list(span))
    return same, other
