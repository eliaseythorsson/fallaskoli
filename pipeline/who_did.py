# -*- coding: utf-8 -*-
"""„Hver gerði hvað?“ — who did what to whom, read out of the parse (issue 27).

The items are in content/setningafraedi/hver-gerdi-hvad.tsv: a sentence, a
verb in it, and the answer key a person wrote — who did it (*gerandi*) and who
it was done to (*þolandi*). This module does not take that key on trust. It
works the same two answers out of Greynir's parse of the sentence, by the
rules below, and `check` refuses the item unless the two agree. A parse that
says something else, or a shape these rules do not cover, stops the build
(pipeline/build_exercises.py) with the file and the line.

WHAT IS ASKED IS MEANING, NOT GRAMMAR
-------------------------------------
The gerandi is the one who does what the verb says; the þolandi is the one it
is done to. In the active voice they are the frumlag and the andlag. In the
passive (þolmynd) they are NOT: the grammatical frumlag is the þolandi, and
the gerandi is either after *af* or not said at all.

    Kötturinn beit hundinn.             frumlag = gerandi, andlag = þolandi
    Hundurinn var bitinn af kettinum.   frumlag = ÞOLANDI, *af* + þgf = gerandi
    Þjófurinn var handtekinn í gær.     frumlag = ÞOLANDI, gerandi not said

So the key is never compared with the roles the sentence bank carries (`r`:
frumlag, andlag). It is compared with what the rules below make of the tree.

THE RULES (one clause = one IP of the tree)
-------------------------------------------
  the subject   the clause's NP-SUBJ. A relative clause (CP-REL) that has
                none takes the noun it stands with — its antecedent, the
                head of the noun phrase the CP-REL sits in:
                *Strákurinn [sem elti hundinn]* — strákurinn elti.
  active        the finite verb with no auxiliary.
                gerandi = the subject; þolandi = the clause's NP-OBJ.
                A relative clause WITH a subject and WITHOUT an object
                (*Strákurinn [sem hundurinn elti]*): the parser leaves the
                gap unfilled, so the þolandi is the antecedent — but only if
                the parser's own verb lexicon knows the verb with an
                accusative object (`takes_acc`). No object and no gap: the
                verb has no þolandi (*datt*).
  passive       the auxiliary *vera* and a past participle (lhþt).
                þolandi = the subject, which must be nominative and agree
                with the participle in gender and number (so a dative
                passive, *Stráknum var hjálpað*, is not taken for this);
                gerandi = the noun of the one *af* phrase in the verb phrase,
                in the dative — or nobody, when there is no *af* phrase.

Every noun the rules name must stand alone in its noun phrase (*hundurinn*,
*afa*; not yet *litli hundurinn* or *afa sínum*), in the singular, in the case
the rule expects (the mark BÍN confirmed), and the verb must be in the past
tense. Anything else — another auxiliary, an indirect object, two *af*
phrases, a clause that is not a main or a relative clause — is refused as
"not covered yet" rather than guessed at.

What the parse cannot know is left to the person who wrote the key, and a
disagreement refuses the item: *Myndin var tekin af stráknum* has an *af*
phrase that is not a gerandi. The key says "(ekki sagt)", the rule says
*stráknum*, and the item does not get in — which is right, because a pupil
could read it either way.

The rules need nothing but the standard library: `clauses` and `check` take
the tree as plain tuples (`plain` makes them from a Greynir tree), so
tests/hver.test.js can hand them a tree written out by hand. Only `analyse`
and `takes_acc` at the bottom touch Greynir, and import it when called.
"""

NOT_SAID = "(ekki sagt)"      # gerandi of a passive without an *af* phrase
NO_ONE = "(enginn)"           # þolandi of a verb that has none (*datt*)
KINDS = ("þolmynd", "tilvísun")

NOUN = ("no",)
GENDERS = ("kk", "kvk", "hk")


class Refused(ValueError):
    """The parse does not give the answer the key gives, or the sentence has a
    shape the rules do not cover."""


def plain(node):
    """A Greynir tree as plain data: (tag, [children]) for a phrase, the
    token index for a word. Punctuation and untagged nodes are flattened."""
    if node is None:
        return None
    if node.is_terminal:
        return getattr(node, "index", None)
    kids = [k for k in (plain(c) for c in node.children) if k is not None]
    tag = getattr(node, "tag", None)
    if not tag:
        # an untagged node: its children stand where it stood
        return ("", kids)
    return (tag, kids)


def _flat(kids):
    """Children with untagged nodes dissolved into their parent."""
    out = []
    for k in kids:
        if isinstance(k, tuple) and k[0] == "":
            out += _flat(k[1])
        else:
            out.append(k)
    return out


def _indices(node):
    if isinstance(node, int):
        return [node]
    out = []
    for k in node[1]:
        out += _indices(k)
    return out


def _span(node):
    idx = _indices(node)
    return [min(idx), max(idx)]


def _head(np, terms, what):
    """The one noun a noun phrase consists of (a relative clause may hang on
    it), or Refused."""
    words = [k for k in _flat(np[1]) if isinstance(k, int)]
    other = [k[0] for k in _flat(np[1]) if not isinstance(k, int) and k[0] != "CP-REL"]
    if other or len(words) != 1 or terms[words[0]]["cat"] not in NOUN:
        raise Refused("%s er ekki eitt nafnorð (%s) / %s is not a single noun"
                      % (what, " ".join(terms[i]["w"] for i in _indices(np)), what))
    return words[0]


def clauses(tree, terms, takes_acc):
    """What each clause of the sentence says, by the rules above.

    tree       the parse as `plain` gives it
    terms      one dict per token: w (the word), l (lemma), cat (the parser's
               category), v (its variants, a set), m (the guarded BÍN mark)
    takes_acc  lemma -> does the parser's verb lexicon know it with an
               accusative object

    Returns a list of dicts, one per clause that has a verb:
      verb     index of the verb the clause is about (the participle in a
               passive)
      aux      index of *var* in a passive, else None
      passive  True / False
      who      index of the gerandi, or None (a passive that names none)
      whom     index of the þolandi, or None (a verb without one)
      rel      [first, last] of the relative clause this is, or None
      error    instead of who/whom: why this clause is not covered
    """
    out = []

    def walk(node, parents):
        if isinstance(node, int):
            return
        tag, kids = node[0], _flat(node[1])
        if tag == "IP":
            out.append(_clause(node, parents, terms, takes_acc))
        for k in kids:
            walk(k, parents + [node])

    walk(tree, [])
    return [c for c in out if c is not None]


def _clause(ip, parents, terms, takes_acc):
    kids = _flat(ip[1])
    subj = [k for k in kids if not isinstance(k, int) and k[0] == "NP-SUBJ"]
    vps = [k for k in kids if not isinstance(k, int) and k[0] == "VP"]
    verbs, aux, objs, pps, odd = [], [], [], [], []

    def into(vp):
        for k in _flat(vp[1]):
            if isinstance(k, int):
                if terms[k]["cat"] == "so":
                    verbs.append(k)
            elif k[0] == "VP":
                into(k)
            elif k[0] == "VP-AUX":
                aux.extend(i for i in _indices(k) if terms[i]["cat"] == "so")
            elif k[0] == "NP-OBJ":
                objs.append(k)
            elif k[0] == "PP":
                pps.append(k)
            elif k[0].startswith("NP-") or k[0].startswith("IP") or k[0].startswith("CP-") \
                    or k[0].startswith("S-"):
                odd.append(k[0])            # an indirect object, a predicative, a clause
    for vp in vps:
        into(vp)
    if not verbs:
        return None
    rel = None
    antecedent = None
    if parents and parents[-1][0] == "CP-REL":
        rel = _span(parents[-1])
        if len(parents) >= 2 and parents[-2][0].startswith("NP"):
            antecedent = parents[-2]
    c = {"verb": verbs[0], "aux": None, "passive": False, "who": None, "whom": None, "rel": rel}

    def no(why):
        c["error"] = why
        return c

    if len(vps) != 1 or len(verbs) != 1 or len(subj) > 1 or len(aux) > 1 or odd:
        return no("setningin hefur gerð sem er ekki studd enn / a shape that is not covered yet"
                  + (" (%s)" % ", ".join(odd) if odd else ""))
    verb = terms[verbs[0]]
    try:
        if subj:
            subject = _head(subj[0], terms, "frumlagið")
        elif antecedent is not None:
            subject = _head(antecedent, terms, "orðið sem tilvísunarsetningin stendur með")
        else:
            return no("ekkert frumlag fannst / no subject found")
        finite = terms[aux[0]] if aux else verb
        if "ÞT" not in (finite.get("m") or "").split("-"):
            return no("sögnin „%s“ er ekki í þátíð / the verb is not in the past tense" % finite["w"])

        if aux:
            # ---- passive: var + past participle ------------------------------
            if terms[aux[0]]["l"] != "vera" or "lhþt" not in verb["v"]:
                return no("hjálparsögn sem er ekki „vera“ + lýsingarháttur þátíðar / "
                          "an auxiliary other than vera + past participle")
            c["aux"], c["passive"] = aux[0], True
            if objs:
                return no("andlag í þolmyndarsetningu / an object in a passive clause")
            whom = terms[subject]
            if subj and _case(whom) != "NF":
                return no("frumlag þolmyndarinnar „%s“ er ekki í nefnifalli / the subject of "
                          "the passive is not nominative" % whom["w"])
            if "nf" not in verb["v"] or "et" not in verb["v"] or _number(whom) != "ET" \
                    or _gender(verb) is None or _gender(verb) != _gender(whom):
                return no("lýsingarhátturinn „%s“ samræmist ekki „%s“ í kyni, tölu og nefnifalli / "
                          "the participle does not agree with the subject" % (verb["w"], whom["w"]))
            if not takes_acc(verb["l"]):
                return no("þáttarinn þekkir ekki „%s“ með andlagi í þolfalli / the parser does not "
                          "know the verb with an accusative object" % verb["l"])
            c["whom"] = subject
            af = [p for p in pps if _prep(p, terms) == "af"]
            if len(af) > 1:
                return no("tveir af-liðir / two af phrases")
            if af:
                nps = [k for k in _flat(af[0][1]) if not isinstance(k, int) and k[0] == "NP"]
                if len(nps) != 1:
                    return no("af-liðurinn er ekki forsetning og eitt nafnorð / the af phrase is "
                              "not a preposition and one noun")
                who = _head(nps[0], terms, "orðið á eftir „af“")
                if _case(terms[who]) != "ÞGF" or _number(terms[who]) != "ET":
                    return no("„%s“ á eftir „af“ er ekki þágufall eintölu / the noun after af is "
                              "not dative singular" % terms[who]["w"])
                c["who"] = who
            return c

        # ---- active ----------------------------------------------------------
        if "lhþt" in verb["v"] or "nh" in verb["v"] or "sagnb" in verb["v"]:
            return no("sögnin „%s“ er ekki í persónuhætti / the verb is not finite" % verb["w"])
        who = terms[subject]
        if (subj and _case(who) != "NF") or _number(who) != "ET":
            return no("frumlagið „%s“ er ekki nefnifall eintölu / the subject is not nominative "
                      "singular" % who["w"])
        c["who"] = subject
        if len(objs) > 1:
            return no("tvö andlög / two objects")
        if objs:
            whom = _head(objs[0], terms, "andlagið")
            if _case(terms[whom]) != "ÞF" or _number(terms[whom]) != "ET":
                return no("andlagið „%s“ er ekki þolfall eintölu / the object is not accusative "
                          "singular" % terms[whom]["w"])
            c["whom"] = whom
        elif rel and subj:
            # *Strákurinn [sem hundurinn elti]*: the gap is the object
            if antecedent is None:
                return no("tilvísunarsetningin stendur ekki með nafnorði / the relative clause "
                          "does not stand with a noun")
            if not takes_acc(verb["l"]):
                return no("tilvísunarsetning með frumlagi og án andlags, og þáttarinn þekkir ekki „%s“ "
                          "með andlagi í þolfalli / a relative clause with a subject and no object, "
                          "and the parser does not know the verb with an accusative object" % verb["l"])
            whom = _head(antecedent, terms, "orðið sem tilvísunarsetningin stendur með")
            if _number(terms[whom]) != "ET":
                return no("„%s“ er ekki í eintölu / not singular" % terms[whom]["w"])
            c["whom"] = whom
        return c
    except Refused as e:
        return no(str(e))


def _prep(pp, terms):
    ps = [k for k in _flat(pp[1]) if not isinstance(k, int) and k[0] == "P"]
    if len(ps) != 1:
        return None
    idx = _indices(ps[0])
    return terms[idx[0]]["l"].lower() if len(idx) == 1 else None


def _case(t):
    m = t.get("m") or ""
    for c in ("ÞGF", "NF", "ÞF", "EF"):
        if m.startswith(c):
            return c
    return None


def _number(t):
    m = t.get("m") or ""
    return "ET" if "ET" in m else "FT" if "FT" in m else None


def _gender(t):
    return next((g for g in GENDERS if g in t["v"]), None)


def _find(word, terms, what):
    hits = [i for i, t in enumerate(terms) if t["w"] == word]
    if len(hits) != 1:
        raise Refused("%s „%s“ stendur %s í setningunni; skrifaðu orðið eins og það stendur þar / "
                      "%s must be one word of the sentence, written as it stands there"
                      % (what, word, "ekki" if not hits else "oftar en einu sinni", what))
    return hits[0]


def check(tree, terms, takes_acc, verb, who, whom):
    """The clause about `verb` (a lemma), if the parse gives the key's answer.

    `who` and `whom` are the key: a word of the sentence as it stands there,
    or NOT_SAID / NO_ONE. Raises Refused with the reason otherwise."""
    found = [c for c in clauses(tree, terms, takes_acc) if terms[c["verb"]]["l"] == verb]
    if len(found) != 1:
        raise Refused("sögnin „%s“ er %s í greiningunni / the verb must be the verb of exactly "
                      "one clause of the parse" % (verb, "ekki umsögn neinnar setningar" if not found
                                                   else "umsögn fleiri en einnar setningar"))
    c = found[0]
    if c.get("error"):
        raise Refused(c["error"])
    name = lambda i, none: none if i is None else "„%s“" % terms[i]["w"]
    if who == NOT_SAID:
        if not c["passive"]:
            raise Refused("%s á aðeins við um þolmynd án af-liðar, en setningin er í germynd / "
                          "%s is for a passive only" % (NOT_SAID, NOT_SAID))
        want_who = None
    else:
        want_who = _find(who, terms, "gerandinn")
    if whom == NO_ONE:
        if c["passive"]:
            raise Refused("%s á ekki við um þolmynd: frumlag hennar er þolandinn / %s is not for "
                          "a passive" % (NO_ONE, NO_ONE))
        want_whom = None
    else:
        want_whom = _find(whom, terms, "þolandinn")
    if c["who"] != want_who:
        raise Refused("gerandinn er %s samkvæmt greiningunni, en %s í skránni / the parse gives "
                      "another gerandi than the file"
                      % (name(c["who"], "ekki nefndur"), name(want_who, NOT_SAID)))
    if c["whom"] != want_whom:
        raise Refused("þolandinn er %s samkvæmt greiningunni, en %s í skránni / the parse gives "
                      "another þolandi than the file"
                      % (name(c["whom"], "enginn"), name(want_whom, NO_ONE)))
    return c


# ---------------------------------------------------------------- Greynir
# The two places this module meets the parser. Imported on first use, so the
# rules above can be read and tested without it.

def analyse(text):
    """(record, tree, terms) of one sentence, or None if it does not parse.

    `record` is the sentence exactly as the bank would hold it — parsed and
    put through the parse guard by build_sentences.annotate — so the app can
    draw its structure like any bank sentence. `tree` and `terms` are what
    `clauses` reads: the same parse as plain data, and per token the
    parser's lemma, category and variants with the BÍN mark the guard
    confirmed."""
    import build_sentences as BS
    g, _b, _guard = BS.engines()
    rec = BS.annotate(1, text, None, "none")
    sent = g.parse_single(text)
    if rec is None or sent is None or sent.tree is None:
        return None
    terminals = list(sent.terminals)
    if len(terminals) != len(rec["tok"]):
        return None
    terms = [{"w": t.text, "l": t.lemma, "cat": t.category, "v": set(t.variants),
              "m": tk.get("m"), "rj": tk.get("rj")}
             for t, tk in zip(terminals, rec["tok"])]
    return rec, plain(sent.tree), terms


def takes_acc(lemma):
    """Does the parser's own verb lexicon know `lemma` with one accusative
    object (*elta_þf*)? It is the lexicon the parse was made with, so this
    asks the parse, not a table of ours."""
    from reynir.verbframe import VerbFrame
    return bool(VerbFrame.matches_arguments(lemma + "_þf"))
