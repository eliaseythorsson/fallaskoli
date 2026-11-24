# -*- coding: utf-8 -*-
"""Words allowed into one frame each: content/setningar/lino-rammar.tsv (issue #20).

A frame (a sentence of the bank with a slot) takes the nouns of the classes its
`need` names, and a noun nobody has read (noun_classes.reviewed) is in no frame
at all. That is too coarse for the academic words (LÍNO-2, docs/DLD-PLAN.md §2):
*hugtak* is an idea, and ideas are not what one reads through or lends, so no
`text` frame takes it — yet "Kennarinn útskýrði hugtakið fyrir bekknum" is as
good a sentence as the one about *dæmið*. Widening the frame's `need` to
`abstract` would let in 790 other nouns. So a pair is written down instead:

    orð      rammi                                                  yfirfarið af
    hugtak   Kennarinn útskýrði dæmið fyrir bekknum í rólegheitum.   …

and the build lets THAT word into THAT frame, on top of the classes. Nothing
else about the frame changes for any other noun.

What a pair decides is meaning only. Everything grammatical still comes from
where it always came from, and the build stops (file and line) when a pair
contradicts it:

  the form      the frame's own BÍN mark, looked up in the word's paradigm
                (app: tasks/frames.js fillFrame). Never written in the file.
  gender        a frame that pins a gender (`rk`: an adjective, numeral or
                pronoun in the sentence agrees with the slot) takes a word of
                that gender only.
  í / á         a frame whose slot stands under í or á (`ps`) takes a word
                whose convention in noun_classes.PREP is that preposition.
  plural        a word that is not shown in the plural (noun_classes.no_plural)
                is not allowed into a plural frame; add it to PLURAL_OK first
                if people do say the plural.
  article       likewise noun_classes.no_article and a slot with the article.

What a pair overrides, for its one frame: the class test (`need`), and "nobody
has read this noun" / "out of place" (noun_classes: in no list, or NO_FRAME).
Somebody HAS now read the word, in this sentence. It does not override
`EXCLUDE` (unfit in any generated sentence) or the vocabulary filter.

The frame id is the frame's sentence, exactly as it stands in
content/setningar/setningar.tsv. The bank has no other id: the manifest and
noun_classes.NEED_FIX key a sentence by its text too, and the build refuses
two sentences with the same text. It also means a pair lapses, loudly, when
its sentence is reworded — which is right, since the judgement was about the
sentence as it stood.

The word must be a noun of the vocabulary. One that the frequency list never
saw is taken out of BÍN's core by build_lexicon.py, the way the bank's own
nouns are, so the file does not depend on LÍNO-2 (sources/lino2.csv) being in
the build; whether each word is on that list is reported, not required.

The pairs are deliberately NOT a list in sentences.py: build_freq.py lifts the
rank of every word it finds in that module's lists (the school material), and
it would lift the column names and the reviewer's name with them. A pair says
where a word may stand; it does not make the word more common.

Standard library only (and noun_classes, which is too), so the reading and
every check can be tested without BÍN or Greynir: tests/frame-allowlist.test.js.
"""
import content_io
from content_io import ContentError

FILE = "setningar/lino-rammar.tsv"
COLUMNS = [("orð", "wordopt"), ("rammi", "text"), ("yfirfarið af", "text"), ("athugasemd", "str")]
GENDERS = ("kk", "kvk", "hk")


def _stop(r, is_, en):
    raise ContentError("%s:%d: %s / %s" % (r.file, r.line, is_, en))


def read(bank, rel=FILE):
    """The pairs as written, each a content_io.Row with `lemma`, `gender` (or
    None), `text` (the frame) and `by`. `bank` is sentences.S.

    Checked here, with nothing but the two files: the frame is a sentence of
    the bank, word for word, and one that names a slot; a gender, if given, is
    one of kk/kvk/hk; no pair is written twice."""
    slot_of = {e[1]: e[2] for e in bank}
    out, seen = [], {}
    for r in content_io.rows(rel, COLUMNS):
        r["lemma"], r["gender"] = r["orð"]
        r["text"], r["by"] = r["rammi"], r["yfirfarið af"]
        if not r["lemma"]:
            _stop(r, "dálkurinn „orð“ má ekki vera auður", "no word")
        if r["gender"] is not None and r["gender"] not in GENDERS:
            _stop(r, "kynið á eftir | á að vera kk, kvk eða hk, ekki „%s“" % r["gender"],
                  "the gender after | must be kk, kvk or hk")
        if r["text"] not in slot_of:
            _stop(r, "ramminn er ekki setning í content/setningar/setningar.tsv, staf fyrir staf: „%s“"
                  % r["text"], "unknown frame: not a sentence of the bank, letter for letter")
        if not slot_of[r["text"]]:
            _stop(r, "setningin hefur ekkert orð sem má skipta út (dálkurinn „orð“ í setningar.tsv er auður)",
                  "that sentence names no slot")
        key = (r["lemma"], r["gender"], r["text"])
        if key in seen:
            _stop(r, "sama par og í línu %d" % seen[key], "the same pair as on line %d" % seen[key])
        seen[key] = r.line
        out.append(r)
    return out


def _cells(word, order):
    """BÍN mark -> the forms of one lexicon entry (data/lexicon.json)."""
    return {m: [f for f in c.split("|") if f] for m, c in zip(order, str(word["f"]).split(";"))}


def _shares_stem(a, b):
    """tasks/frames.js sharesStem: a compound repeats the word it is made of."""
    short, long_ = (a, b) if len(a) <= len(b) else (b, a)
    return len(short) >= 4 and short in long_


def settled(tok):
    """tasks/frames.js `settled`: the slot's analysis is firm enough to build on."""
    return bool(tok.get("m")) and not tok.get("rj") and all(f == "tala" for f in tok.get("u") or [])


def resolve(pairs, records, lexicon, classes):
    """Check every pair against the built data. -> (text -> ["lemma|kyn", …]
    sorted, a list of report lines).

    `records` are the annotated sentences (data/sentences.json), `lexicon` is
    data/lexicon.json as loaded, `classes` is the noun_classes module. Stops
    with the file and line of the first pair that could never be shown."""
    order = lexicon["orders"]["no"]
    nouns = {}
    for w in lexicon["w"]:
        if w["c"] in GENDERS:
            nouns.setdefault(w["o"], []).append(w)
    by_text = {s["t"]: s for s in records}
    allow, added, already = {}, 0, []
    for r in pairs:
        lemma, text = r["lemma"], r["text"]
        # ---- the word ---------------------------------------------------
        have = [w for w in nouns.get(lemma, []) if r["gender"] in (None, w["c"])]
        if not have:
            _stop(r, "„%s“ er ekki nafnorð í orðaforðanum%s" % (
                lemma, " í kyninu %s" % r["gender"] if r["gender"] else ""),
                "unknown word: not a noun of the vocabulary (data/lexicon.json)")
        if len(have) > 1:
            _stop(r, "„%s“ er til í fleiri en einu kyni (%s); skrifaðu orð|kyn, t.d. %s|%s" % (
                lemma, ", ".join(w["c"] for w in have), lemma, have[0]["c"]),
                "the word has more than one gender here; write word|gender")
        w = have[0]
        if lemma in classes.EXCLUDE:
            _stop(r, "„%s“ er á listanum EXCLUDE í noun_classes.py og fer aldrei í tilbúna setningu" % lemma,
                  "the word is in noun_classes.EXCLUDE: never put into a generated sentence")
        # ---- the frame --------------------------------------------------
        s = by_text.get(text)
        if s is None:                      # read() has checked the bank; this is the built data
            _stop(r, "ramminn er ekki í greindu setningunum", "the frame is not among the built sentences")
        si = s.get("slot")
        if si is None or s.get("fixed") or not s.get("need") or not settled(s["tok"][si]):
            why = ("eyðan fannst ekki í greiningunni" if si is None else
                   "lýsingarorð, fornafn eða greinir stendur við eyðuna" if s.get("fixed") else
                   "þörfin er „none“: setningin heldur sínu eigin orði" if not s.get("need") else
                   "fall eyðunnar er óvíst í greiningunni")
            _stop(r, "ramminn tekur engin önnur orð (%s)" % why,
                  "the frame is not open to other nouns (fixed, need none, or its case is unsettled)")
        mark = s["tok"][si]["m"]
        # ---- what the frame and BÍN say about the two together ------------
        if s.get("rk") and s["rk"] != w["c"]:
            _stop(r, "ramminn bindur kynið við %s (orð í setningunni beygist með eyðunni) en „%s“ er %s"
                  % (s["rk"], lemma, w["c"]), "the frame pins another gender than the word has")
        if s.get("ps") and classes.prep(lemma) != s["ps"]:
            _stop(r, "eyðan stendur á eftir „%s“ en „%s“ er %s í noun_classes.py (PREP_I / PREP_A)" % (
                s["ps"], lemma, "skráð með „%s“" % classes.prep(lemma) if classes.prep(lemma)
                else "hvorki skráð með í né á"),
                "the slot stands under í/á and the word's recorded convention is not that preposition")
        forms = _cells(w, order).get(mark) or []
        if not forms:
            _stop(r, "„%s“ á enga beygingarmynd í BÍN fyrir %s, myndina sem ramminn biður um" % (lemma, mark),
                  "the word has no form for the frame's mark")
        if "FT" in mark and classes.no_plural(lemma):
            _stop(r, "eyðan er í fleirtölu en „%s“ er ekki sýnt í fleirtölu (noun_classes.py: bættu því "
                  "í PLURAL_OK ef fleirtalan er notuð)" % lemma,
                  "a plural slot, and the word is not shown in the plural")
        if mark.endswith("gr") and classes.no_article(lemma):
            _stop(r, "eyðan er með greini en „%s“ fær ekki greini (noun_classes.NO_ARTICLE)" % lemma,
                  "a slot with the article, and the word takes none")
        for j, t in enumerate(s["tok"]):
            if j != si and t.get("c") == "nafnorð" and t.get("l") and (
                    t["l"] == lemma or _shares_stem(t["l"], lemma)):
                _stop(r, "„%s“ stendur þegar í setningunni („%s“)" % (lemma, t["w"]),
                      "the sentence already has that noun, or a compound of it")
        if classes.klass(lemma) in s["need"] and not classes.excluded(lemma):
            already.append("%s:%d %s" % (r.file, r.line, lemma))
        key = "%s|%s" % (lemma, w["c"])
        if key not in allow.setdefault(text, []):
            allow[text].append(key)
            added += 1
    for keys in allow.values():
        keys.sort()
    report = ["orð leyfð í einstaka ramma (content/%s): %d pör, %d orð, %d rammar"
              % (FILE, added, len({k for v in allow.values() for k in v}), len(allow))]
    if already:
        report.append("  þar af %d sem flokkur rammans tók þegar við: %s"
                      % (len(already), "; ".join(already)))
    return allow, report


def lino_report(allow, lino_words):
    """One line: how many of the allowed words are on LÍNO-2 (lino.load()).
    Reported, never required: without sources/lino2.csv the list is empty."""
    keys = sorted({k for v in allow.values() for k in v})
    if not lino_words:
        return "  LÍNO-2 er ekki í smíðinni (sources/lino2.csv vantar): ekki vitað hver orðanna eru á listanum"
    import lino
    rank = lino.ranks(lino_words, set(GENDERS))
    on = [k for k in keys if tuple(k.split("|")) in rank]
    off = [k.split("|")[0] for k in keys if k not in on]
    return "  á LÍNO-2: %d af %d%s" % (len(on), len(keys), "; ekki á listanum: " + " ".join(off) if off else "")
