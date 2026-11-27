# -*- coding: utf-8 -*-
"""The self-check's parse: a filled frame, judged as a whole sentence (issue #22).

OUTSIDE THE BUILD. tools/lino-frames/check.mjs runs this; nothing in build.sh
does. It makes no data: it reads a list of sentences and says yes or no.

    python3 tools/lino-frames/parse_check.py < filled.json > parsed.json

A candidate pair (a LÍNO-2 noun and a frame) has been filled in by the app's
own tasks/frames.js fillFrame: the frame's slot, the word's BÍN form under the
slot's mark. The sentence that makes is put through exactly what every bank
sentence goes through in the build (pipeline/build_sentences.py `annotate`:
the Greynir parse, then pipeline/parse_guard.py over every token), and then
compared with the frame it came from. It passes when

  1. Greynir parses it;
  2. the guard raises no hard error (a mark BÍN does not have for the form, a
     preposition governing a case the table does not allow);
  3. the word in the slot is read as THAT noun, in THE FRAME'S mark, with the
     role the frame's own word had, and its reading was not withdrawn
     (parse_guard.check_lemma: *nöfnum* read as a form of *nafni*);
  4. nothing else moved: every other word has the class, the mark, the role
     and the clause it has in the frame as built (data/sentences.json), and
     the clause structure is no less certain than it was.

Point 4 is what "as a whole sentence" means here. The frame's analysis was
checked by the build; if putting the new word in changes how the REST of the
sentence is read (the verb now agrees with something else, a preposition
attaches elsewhere), the sentence is ambiguous at best, and it is refused. A
refusal is not a claim that the sentence is wrong Icelandic, only that the
program cannot vouch for it; a wrong sentence is worse than a missing one.

Input: [{"id", "text", "frame", "lemma", "gender", "mark", "slot"}] on stdin.
Output: [{"id", "ok", "why"}] on stdout; `why` is Icelandic, for the owner.

A NEW SENTENCE (issue #23, tools/lino-frames/fillin.mjs) is an item with
"kind": "written" and no frame: {"id", "kind", "text", "level", "lemma",
"slot"}. It has nothing to be compared with, so it goes through the build's
own checks instead, the ones every bank sentence meets on ./build.sh: the
parse and the guard (annotate), the length its level allows
(build_sentences.check_lengths) and the numeral predicative
(check_numeral_predicative). Whether the word stands in it, once, as the app
reads it, is fillin-lib.mjs `judge`'s business: it gets the record (`rec`).
"""
import contextlib
import io
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "pipeline"))

# What must be the same, word for word, outside the slot.
SAME = (("x", "orðflokkurinn"), ("m", "markið"), ("r", "setningarhlutverkið"),
        ("k", "setningin sem orðið stendur í"))


def compare(item, rec, frame, hard):
    """The verdict on one annotated sentence. Pure: no parser, so
    tests/lino-selfcheck.test.js can hold it with records written by hand.
    `rec` is annotate()'s record of the filled sentence (or None), `frame` the
    built record of the frame, `hard` the guard's hard errors for it."""
    if rec is None:
        return False, "Greynir þáttar ekki setninguna"
    if hard:
        return False, "vörðurinn (parse_guard): " + "; ".join(hard)
    a, b, si = rec["tok"], frame["tok"], item["slot"]
    if len(a) != len(b):
        return False, "setningin skiptist í %d tákn en ramminn í %d" % (len(a), len(b))
    t = a[si]
    if t.get("rj"):
        return False, "greining orðsins „%s“ var tekin úr umferð (ólíklegt lemma)" % t["w"]
    if t.get("c") != "nafnorð" or t.get("l") != item["lemma"]:
        return False, "„%s“ er lesið sem „%s“ (%s), ekki sem nafnorðið „%s“" % (
            t["w"], t.get("l"), t.get("c") or "óþekkt", item["lemma"])
    if t.get("m") != item["mark"]:
        return False, "„%s“ er lesið sem %s en ramminn biður um %s" % (t["w"], t.get("m"), item["mark"])
    if t.get("r") != b[si].get("r"):
        return False, "„%s“ fær hlutverkið %s en orð rammans hafði %s" % (
            t["w"], t.get("r") or "ekkert", b[si].get("r") or "ekkert")
    for j, (new, old) in enumerate(zip(a, b)):
        if j == si:
            continue
        if new["w"] != old["w"]:
            return False, "tákn %d er „%s“ en „%s“ í rammanum" % (j, new["w"], old["w"])
        # A word whose analysis a declared decision withdrew in the frame
        # (parse_overrides, keyed by the frame's own text) says nothing to
        # compare with.
        if old.get("rj") or (old.get("c") is None and old.get("x")):
            continue
        for key, name in SAME:
            if new.get(key) != old.get(key):
                return False, "%s á „%s“ breyttist: %s í rammanum, %s nú" % (
                    name, new["w"], old.get(key) or "ekkert", new.get(key) or "ekkert")
    if rec.get("ku") and not frame.get("ku"):
        return False, "setningaskipanin er ekki lengur staðfest"
    return True, ""


def check_written(item, rec, hard, build_sentences):
    """The verdict on a new sentence, by the build's own checks. The two
    whole-bank checks print and raise SystemExit; here they get one record,
    say nothing on stdout, and their message is the reason."""
    if rec is None:
        return False, "Greynir þáttar ekki setninguna"
    if hard:
        return False, "vörðurinn (parse_guard): " + "; ".join(hard)
    for check in (build_sentences.check_lengths, build_sentences.check_numeral_predicative):
        printed = io.StringIO()
        try:
            with contextlib.redirect_stdout(printed):
                check([rec])
        except SystemExit as e:
            detail = [l.strip() for l in printed.getvalue().splitlines() if l.startswith("   ")]
            return False, "smíðin myndi stoppa: %s" % (detail[0] if detail else e)
    return True, ""


def main():
    items = json.load(sys.stdin)
    os.chdir(ROOT)                       # build_sentences opens data/ by relative path
    import build_sentences
    frames = {s["t"]: s for s in json.load(open("data/sentences.json", encoding="utf-8"))}
    _g, _b, guard = build_sentences.engines()
    out = []
    for it in items:
        if it.get("kind") == "written":
            before = len(guard.hard)
            try:
                rec = build_sentences.annotate(it["level"], it["text"], it.get("slot"),
                                               "none" if it.get("slot") else None)
            except SystemExit as e:
                out.append({"id": it["id"], "ok": False, "why": "smíðin myndi stoppa: %s" % e, "rec": None})
                continue
            ok, why = check_written(it, rec, guard.hard[before:], build_sentences)
            out.append({"id": it["id"], "ok": ok, "why": why, "rec": rec})
            continue
        frame = frames.get(it["frame"])
        if frame is None:
            out.append({"id": it["id"], "ok": False, "why": "ramminn er ekki í data/sentences.json"})
            continue
        before = len(guard.hard)
        try:
            # need "none": the record's own slot fields are not used here
            rec = build_sentences.annotate(frame["lvl"], it["text"], it["lemma"], "none")
        except SystemExit as e:          # the build's way of stopping; here one sentence's verdict
            out.append({"id": it["id"], "ok": False, "why": "smíðin myndi stoppa: %s" % e})
            continue
        ok, why = compare(it, rec, frame, guard.hard[before:])
        out.append({"id": it["id"], "ok": ok, "why": why})
    json.dump(out, sys.stdout, ensure_ascii=False, indent=1)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
