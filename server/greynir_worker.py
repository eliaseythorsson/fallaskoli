"""GreynirCorrect for the server's writing check (v6.13, critique item 46).

A long-lived worker that server/writing.mjs starts on demand and talks to over
stdin/stdout, one JSON object per line:

    in:   {"id": 7, "text": "Mér langar að fara í sund."}
    out:  {"id": 7, "sentences": 1,
           "annotations": [{"start": 0, "end": 3, "code": "P_WRONG_CASE_þgf_þf",
                            "msg": "Á líklega að vera 'Mig'", "detail": "...",
                            "suggest": "Mig"}]}

The first line it writes is {"ready": true} once GreynirCorrect is loaded
and warmed up (loading takes a few seconds and ~400 MB; that is why it is one
process kept running rather than one per text), or {"ready": false} and an
exit if the package is not installed.

`start`/`end` are CHARACTER offsets into the text as sent, [start, end), worked
out from the tokens' original text; a remark that cannot be placed gets null
for both and is still returned.

Nothing is written anywhere: no file, no log, and nothing on stderr about a
text (the Node side discards stderr in any case). The Node side enforces the
size limit and the timeout and kills this process if it hangs; the size
check here is a second fence.

Pinned in server/requirements-writing.txt; see docs/SERVER.md.
"""

import json
import sys

MAX_CHARS = 2000  # the server's own limit is lower (core/writing.js WRITING.maxChars)


def place(text, sentences):
    """(start, end) of every token of every sentence, in order, or None."""
    spans = []
    pos = 0
    for s in sentences:
        row = []
        for tok in s.tokens:
            core = (getattr(tok, "original", None) or tok.txt or "").strip()
            if not core:
                row.append(None)
                continue
            at = text.find(core, pos)
            if at < 0:
                row.append(None)
                continue
            row.append((at, at + len(core)))
            pos = at + len(core)
        spans.append(row)
    return spans


def short(x, n):
    return x[:n] if isinstance(x, str) else None


def check(check_with_stats, text):
    result = check_with_stats(text)
    sentences = result["sentences"]
    spans = place(text, sentences)
    notes = []
    for s, row in zip(sentences, spans):
        for a in s.annotations:
            first = row[a.start] if 0 <= a.start < len(row) else None
            last = row[a.end] if 0 <= a.end < len(row) else None
            start = first[0] if first else None
            end = last[1] if last else None
            if start is None or end is None or end <= start:
                start = end = None
            notes.append({
                "start": start, "end": end,
                "code": short(a.code, 40),
                "msg": short(a.text, 300),
                "detail": short(a.detail, 400),
                "suggest": short(a.suggest, 120),
            })
    return {"sentences": len(sentences), "annotations": notes}


def say(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def main():
    try:
        from reynir_correct import check_with_stats
        check_with_stats("Ég er hér.")  # load and warm up before saying ready
    except Exception as e:  # not installed, or broken: say so and stop
        say({"ready": False, "error": type(e).__name__})
        return 3
    say({"ready": True})
    for line in sys.stdin:
        try:
            req = json.loads(line)
        except ValueError:
            continue
        rid = req.get("id") if isinstance(req, dict) else None
        text = req.get("text") if isinstance(req, dict) else None
        if not isinstance(text, str) or not text or len(text) > MAX_CHARS:
            say({"id": rid, "error": "bad-text"})
            continue
        try:
            say({"id": rid, **check(check_with_stats, text)})
        except Exception as e:  # one odd text must not stop the worker
            say({"id": rid, "error": type(e).__name__})
    return 0


if __name__ == "__main__":
    sys.exit(main())
