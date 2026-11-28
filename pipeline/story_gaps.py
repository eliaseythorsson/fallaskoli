"""Gaps in a story: a connective or an inner-state word for the pupil to
choose (issue #36, Frásögn step 3; docs/DLD-PLAN.md §5).

A sentence of a story in content/textar/ may carry ONE gap: the words the
pupil chooses, between underscores, with the gap's block on the lines right
under the sentence. README.md, "Efnið", has the same description for the
writer:

    [vandi] En _þegar_ hún{Elísa} opnaði skápinn var ekkert hveiti til.
    ~ [tengiorð] *Þegar* segir hvenær: …            <- kind, and why it fits
    ~ af því að | *Af því að* segir hvers vegna. …   <- a wrong option | why not
    ~ þess vegna | Á eftir *þess vegna* kemur …      <- two or three of them

  the gap       "_word_" or "_af því að_": whole words, once in the sentence,
                no pronoun mark inside it. The words between the underscores
                are the right answer, as they stand there.
  the kind      [tengiorð]     a connective of cause, time or contrast (the
                               five of issue #28: af því að, þess vegna,
                               þegar, síðan, en)
                [hugarástand]  a word for what someone wants, thinks or
                               feels (vildi, hélt, ákvað, varð hrædd …)
                followed by the explanation the pupil reads once answered.
  a wrong one   "wrong | why not": the option, written as it would stand in
                the gap (a capital where the gap opens the sentence), and the
                reason it does not fit, which the pupil who picks it reads.
                Two or three, no two the same and none the right answer.

Only ONE option may fit. That cannot be checked by a program; the reasons
make the writer say why each wrong one fails, and the review page shows them
beside the item. What can be checked is checked: here the shape, with the
file and the line; in pipeline/build_exercises.py what needs BÍN and Greynir
(the five connectives and their word order, every option of an inner-state
gap a word for an inner state, and every inner-state option parsed in place).

This is its own module so that the text reader (content_io.read_text) needs
only three calls: `take` on a sentence, `line` on a "~" line, `check` at the
end.
"""

import re

# The kinds a gap may be: the mark as written -> the name the app knows.
GAP_KINDS = {"tengiorð": "tengi", "hugarástand": "innra"}
GAP_WRONG = (2, 3)
BLANK = "___"


def take(body, bad):
    """'En _þegar_ hún{Elísa} …' -> ('En þegar hún{Elísa} …', gap) where gap
    is None or {a, before, after}: the right answer and the sentence (still
    with its pronoun marks) on either side of it."""
    if "_" not in body:
        return body, None
    m = re.fullmatch(r"([^_]*)_([^_]*)_([^_]*)", body)
    if not m:
        bad("eyða er skrifuð _orð_ og ein í setningu / a gap is _words_, once in a sentence")
    before, a, after = m.groups()
    if not a.strip() or a != a.strip() or "  " in a:
        bad("eyðan _…_ á að vera heil orð, án bils fremst eða aftast / a gap holds whole words")
    if "{" in a or "}" in a:
        bad("fornafn með vísun má ekki standa í eyðu / no pronoun mark inside a gap")
    if not (before == "" or before.endswith(" ")) or not (after == "" or after[0] in " .,;:!?"):
        bad("eyðan _…_ á að vera heil orð / a gap holds whole words")
    if re.search(r"[.,;:!?]$", a):
        bad("greinarmerki á að standa utan eyðunnar / punctuation stands outside the gap")
    return before + a + after, {"a": a, "before": before, "after": after}


def _plain(s):
    return re.sub(r"\{[^{}]*\}", "", s)


def line(sentences, no, text, bad):
    """A "~" line: the first of a block names the kind and gives the
    explanation; each after it is a wrong option and why it fails. The block
    stands right under its sentence, with no other line between."""
    s = sentences[-1] if sentences else None
    g = s and s.get("gap")
    if not g or g["last"] != no - 1:
        bad("lína sem byrjar á ~ á að standa beint undir setningu með eyðu (_…_) eða undir annarri ~ línu / "
            "a ~ line stands right under a sentence with a gap, or under another ~ line")
    body = text[1:].strip()
    if not body:
        bad("tóm ~ lína / an empty ~ line")
    m = re.fullmatch(r"\[([^\]]*)\]\s*(.*)", body)
    if "k" not in g:
        if not m:
            bad("fyrsta ~ línan segir hvers konar eyða þetta er: ~ [tengiorð] … eða ~ [hugarástand] … / "
                "the first ~ line names the kind of gap")
        kind = m.group(1).strip()
        if kind not in GAP_KINDS:
            bad("óþekkt tegund eyðu [%s]; þekktar: %s / unknown kind of gap" % (kind, ", ".join(GAP_KINDS)))
        if not m.group(2).strip():
            bad("skýringuna vantar á eftir [%s] / the explanation is missing" % kind)
        g.update({"k": GAP_KINDS[kind], "why": m.group(2).strip(), "w": [], "no": {}, "line": no})
    else:
        if m:
            bad("tegund eyðunnar stendur bara í fyrstu ~ línunni / only the first ~ line names the kind")
        cells = [c.strip() for c in body.split("|")]
        if len(cells) != 2 or not all(cells):
            bad("rangur kostur er skrifaður „~ rangt | af hverju ekki“ / a wrong option is \"~ option | why not\"")
        w, why = cells
        if w.lower() in [x.lower() for x in [g["a"]] + g["w"]]:
            bad("„%s“ stendur tvisvar í eyðunni, eða er rétta svarið / an option twice, or the right one" % w)
        if w[0].isupper() != g["a"][0].isupper():
            bad("„%s“ á að vera skrifað eins og það stæði í eyðunni, með %s staf fremst eins og „%s“ / "
                "write the option as it would stand in the gap"
                % (w, "stórum" if g["a"][0].isupper() else "litlum", g["a"]))
        g["w"].append(w)
        g["no"][w] = why
    g["last"] = no


def check(sentences, kind, stop):
    """At the end of the text: every gap has its block, whole, and only a
    story has gaps. Leaves on each sentence `gap`: None, or {k, a, t (the
    sentence with ___ for the gap), why, w, no, line}."""
    for s in sentences:
        g = s.get("gap")
        if not g:
            s["gap"] = None
            continue
        if kind != "saga":
            stop(s["line"], "bara saga hefur eyður / only a story has gaps")
        if "k" not in g:
            stop(s["line"], "eyðuna vantar ~ línurnar undir setningunni (~ [tengiorð] …, ~ rangt | af hverju ekki) / "
                            "the gap has no ~ lines under it")
        lo, hi = GAP_WRONG
        if not lo <= len(g["w"]) <= hi:
            stop(g["line"], "eyða á að hafa tvo eða þrjá ranga kosti, en hér eru %d / two or three wrong options"
                 % len(g["w"]))
        t = " ".join(_plain(g["before"] + BLANK + g["after"]).split(" "))
        s["gap"] = {"k": g["k"], "a": g["a"], "t": t, "why": g["why"], "w": g["w"], "no": g["no"],
                    "line": g["line"]}
