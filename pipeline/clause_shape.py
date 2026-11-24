"""What Greynir says about the clauses of a sentence — the check behind
"Sameina og skipta" (issue #29; content/malbeiting/sameina.tsv).

The browser has no parser, so the parse is asked at build time, of every
sentence a pupil's answer can be matched against. In the app an answer is
right only if it is one of those sentences, and a sentence is only in the
data if Greynir gave it the structure its pair names. Anything else a pupil
writes is shown the model and counted neither right nor wrong
(src/js/core/answer.js, JUDGES.umritun).

    a short sentence   one main clause: one S-MAIN and no CP-* (no
                       subordinate clause)
    a joined sentence  one S-MAIN and exactly one CP-*, of the pair's kind
                       (KIND_TAG), opened by the pair's conjunction

*af því að* (orsök). Greynir has no steady label for it: now and then
CP-ADV-CAUSE, mostly the literal reading — the preposition *af*, *því*, and
an að-clause (CP-THT) hanging on *því*. build_sentences.py (the clause
repairs, step d) reads that second shape as one causal clause that begins at
*af*, and so does this module: a CP-THT opened by *að* with *af því* right
before it is an orsök clause opened by *af því að*. Its other readings of
such a sentence (two main clauses joined by *því að*; *að* as a preposition
before a dative) are misparses, and a sentence that gets one is refused like
any other: reword it or leave it out.
"""

import re

KIND_TAG = {"orsök": "CP-ADV-CAUSE", "tíð": "CP-ADV-TEMP", "skýring": "CP-THT", "tilvísun": "CP-REL"}
ONE_SENTENCE = re.compile(r"[A-ZÁÉÍÓÚÝÞÆÖÐ][^.?!]*\.")

_greynir = None


def shape(text):
    """(number of S-MAIN, [(tag, conjunction) of every CP-*]) as Greynir
    parses `text` as ONE sentence, or None if it does not parse as one. The
    conjunction is the text under the clause's C — for a CP-THT that follows
    *af því*, "af því að", and the tag then CP-ADV-CAUSE (see above)."""
    global _greynir
    if _greynir is None:
        from reynir import Greynir
        _greynir = Greynir()
    sents = list(_greynir.submit(text, parse=True))
    if len(sents) != 1 or sents[0].tree is None:
        return None
    mains, cps, words = [0], [], []

    def walk(node):
        if node.is_terminal:                 # (a terminal's .tag is its word class)
            words.extend(node.text.lower().split())
            return
        tag = node.tag
        if tag == "S-MAIN":
            mains[0] += 1
        if tag.startswith("CP-"):
            c = next((ch for ch in node.children if not ch.is_terminal and ch.tag == "C"), None)
            conj = " ".join(c.text.lower().split()) if c is not None else ""
            if tag == "CP-THT" and conj == "að" and words[-2:] == ["af", "því"]:
                tag, conj = "CP-ADV-CAUSE", "af því að"
            cps.append((tag, conj))
        for ch in node.children:
            walk(ch)

    walk(sents[0].tree)
    return mains[0], cps


def problems(pair):
    """What is wrong with one pair, as sentences; empty when nothing is.
    `pair`: kind, conj, joined [sentence, …], apart [[a, b], …]."""
    out = []
    want = KIND_TAG.get(pair["kind"])
    if not want:
        return ["unknown kind %r" % pair["kind"]]
    if len({tuple(p) for p in pair["apart"]}) != len(pair["apart"]):
        out.append("a way to split is listed twice")
    if len(set(pair["joined"])) != len(pair["joined"]):
        out.append("a way to combine is listed twice")
    for t in [t for p in pair["apart"] for t in p]:
        if not ONE_SENTENCE.fullmatch(t):
            out.append("'%s' must be one sentence: a capital first, one full stop last" % t)
            continue
        got = shape(t)
        if got is None:
            out.append("Greynir cannot parse '%s' as one sentence" % t)
        elif got != (1, []):
            out.append("'%s' must be one main clause without a subordinate clause; Greynir finds "
                       "%d main clause(s) and %s" % (t, got[0], [c[0] for c in got[1]]))
    for t in pair["joined"]:
        if not ONE_SENTENCE.fullmatch(t):
            out.append("'%s' must be one sentence: a capital first, one full stop last" % t)
            continue
        got = shape(t)
        if got is None:
            out.append("Greynir cannot parse '%s' as one sentence" % t)
            continue
        mains, cps = got
        if mains != 1 or len(cps) != 1:
            out.append("'%s' must be one main clause with exactly one subordinate clause; Greynir finds "
                       "%d main clause(s) and %s" % (t, mains, [c[0] for c in cps]))
        elif not (cps[0][0] == want or cps[0][0].startswith(want + "-")):
            out.append("'%s' must hold a %s clause (%s); Greynir finds %s" % (t, want, pair["kind"], cps[0][0]))
        elif cps[0][1] != pair["conj"]:
            out.append("the clause in '%s' must open with '%s'; Greynir finds '%s'" % (t, pair["conj"], cps[0][1]))
    return out
