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
"""
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


def main():
    items = json.load(sys.stdin)
    os.chdir(ROOT)                       # build_sentences opens data/ by relative path
    import build_sentences
    frames = {s["t"]: s for s in json.load(open("data/sentences.json", encoding="utf-8"))}
    _g, _b, guard = build_sentences.engines()
    out = []
    for it in items:
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
