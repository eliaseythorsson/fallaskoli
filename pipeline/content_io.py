"""Reading the hand-written content: content/**/*.tsv.

Every sentence, exercise item and frame a person wrote for Fallaskóli lives in
a plain text file under content/, one file per list, so that a teacher or a
native reader can read and edit it in any text editor or spreadsheet without
reading Python. sentences.py and exercises.py read those files through this
module and hand the build exactly the values it always had: the tuples,
lists and dicts the build scripts unpack. Nothing else in the build changed
when the content moved out of Python (critique item 82), and the build
output was byte for byte the same before and after.

The format, kept deliberately small so that a stdlib reader is enough and a
diff shows one item per line:

  * UTF-8, one item per line, the fields separated by a TAB.
  * A line that starts with # is a comment. Blank lines are ignored.
  * The first line that is not a comment names the columns. The reader
    checks the names against what the list expects, so a column moved or
    renamed in a spreadsheet stops the build instead of shifting every field.
  * A missing field at the end of a line is empty (editors drop trailing tabs).
  * Nothing is quoted or escaped. A field can therefore never hold a TAB or a
    line break, and the reader refuses a line with too many fields.

Field types (what a column's cells are turned into):

  int     a whole number
  text    text that may not be empty
  str     text, may be empty
  opt     text, or None when the field is empty
  bool    "já" or "nei"
  flag    "já", or empty for no
  word    lemma|class|mark — a tuple of the parts between the bars;
          "word:3" also checks that there are exactly three parts
  words   several of those, separated by commas: a list of tuples
          ("words:2": each of exactly two parts)
  list    words or phrases separated by commas: a list of strings;
          "(ekkert)" stands for an empty phrase ("nothing follows the blank")
  ints    whole numbers separated by commas
  wordopt lemma|column, or a bare lemma: a pair whose second half is None

Errors name the file and the line, in Icelandic and English, because the
person who meets one has most likely just edited that file.

Texts (issue #30) are not lists and not TSV: one plain-text file per text in
content/textar/, read by `texts()` at the bottom of this module, where the
format is described and every check on it lives.
"""

import itertools
import os
import re

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "content")
EMPTY = "(ekkert)"


class ContentError(ValueError):
    pass


class Row(dict):
    """One item: column name -> typed value, plus where it was read from."""
    __slots__ = ("file", "line")

    def __getattr__(self, k):
        try:
            return self[k]
        except KeyError:
            raise AttributeError(k)


def split_list(cell):
    """"a, b, c" -> ["a", "b", "c"]; an empty cell is an empty list."""
    return [x.strip() for x in cell.split(",")] if cell.strip() else []


_split = split_list


def _parse(kind, cell, where):
    def bad(why):
        raise ContentError("%s: %s (%r)" % (where, why, cell))
    if ":" in kind:                                   # word:3, words:2
        kind, n = kind.split(":")
        v = _parse(kind, cell, where)
        for t in ([v] if kind == "word" else v):
            if len(t) != int(n):
                bad("á að vera %s hlutar aðskildir með | / expected %s parts separated by |" % (n, n))
        return v
    if kind == "int":
        try:
            return int(cell)
        except ValueError:
            bad("á að vera heil tala / expected a whole number")
    if kind == "text":
        if not cell:
            bad("má ekki vera autt / may not be empty")
        return cell
    if kind == "str":
        return cell
    if kind == "opt":
        return cell or None
    if kind == "bool":
        if cell not in ("já", "nei"):
            bad("á að vera „já“ eða „nei“ / expected já or nei")
        return cell == "já"
    if kind == "flag":
        if cell not in ("já", ""):
            bad("á að vera „já“ eða autt / expected já or nothing")
        return cell == "já"
    if kind == "word":
        if not cell:
            bad("má ekki vera autt / may not be empty")
        return tuple(cell.split("|"))
    if kind == "words":
        return [tuple(x.split("|")) for x in _split(cell)]
    if kind == "list":
        return ["" if x == EMPTY else x for x in _split(cell)]
    if kind == "ints":
        try:
            return [int(x) for x in _split(cell)]
        except ValueError:
            bad("á að vera heilar tölur með kommum / expected whole numbers")
    if kind == "wordopt":
        parts = cell.split("|")
        if len(parts) == 1:
            return (parts[0], None)
        if len(parts) == 2:
            return tuple(parts)
        bad("á að vera orð eða orð|dálkur / expected word or word|column")
    raise ContentError("%s: unknown column type %r" % (where, kind))


def rows(rel, columns):
    """The items of content/<rel>, each a Row of typed values.

    `columns` is a list of (name, type), in the order of the file's header
    line. Columns the caller does not need (a free comment column, say) are
    still listed, so that the header is checked in full."""
    path = os.path.join(ROOT, rel)
    names = [n for n, _ in columns]
    out, header = [], None
    with open(path, encoding="utf-8") as f:
        for no, raw in enumerate(f, 1):
            line = raw.rstrip("\n").rstrip("\r")
            where = "content/%s:%d" % (rel, no)
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            cells = line.split("\t")
            if header is None:
                header = [c.strip() for c in cells]
                if header != names:
                    raise ContentError(
                        "%s: dálkarnir eiga að vera / the columns must be: %s\n  en eru / but are: %s"
                        % (where, " | ".join(names), " | ".join(header)))
                continue
            if len(cells) > len(names):
                raise ContentError("%s: of margir dálkar (%d, en %d eiga að vera) / too many fields — "
                                   "is there a TAB inside a field?" % (where, len(cells), len(names)))
            cells += [""] * (len(names) - len(cells))
            r = Row()
            r.file, r.line = "content/" + rel, no
            for (name, kind), cell in zip(columns, cells):
                if cell != cell.strip():
                    raise ContentError("%s: bil fremst eða aftast í dálkinum „%s“ / stray space in %s"
                                       % (where, name, name))
                r[name] = _parse(kind, cell, "%s [%s]" % (where, name))
            out.append(r)
    if header is None:
        raise ContentError("content/%s: no header line" % rel)
    return out


def groups(rel, key_col, columns):
    """Rows grouped by `key_col`, in the order each key first appears."""
    out = {}
    for r in rows(rel, columns):
        out.setdefault(r[key_col], []).append(r)
    return out


# ---------------------------------------------------------------- texts
#
# content/textar/<name>.txt — one short story (saga) or subject text
# (fræðitexti) per file, written for comprehension questions (issue #30,
# docs/DLD-PLAN.md §4). Plain text that a person reads and edits in any
# editor; README.md, "Efnið", has the same description for the writer.
#
#     # Sara missir af strætó            <- a comment (any line starting with #)
#     # þyngd: 1                         <- the header: three comment lines
#     # tegund: saga                        of the form "# name: value"
#     # orð: áhrif, heili                <- the LÍNO-2 words the text carries
#     [vandi] Sara vaknaði of seint og missti af strætó.
#     [tilraun] Hún{Sara} hljóp alla leið í skólann.
#     ? [aðalatriði] Um hvað er sagan? | rétta svarið | rangt | rangt
#     ! Skýringin sem nemandinn les á eftir.
#
#   a sentence     "[mark] The sentence." — ONE sentence per line, with the
#                  mark that says what the sentence is in the text:
#                    saga         the six parts of the story map (CONTEXT.md):
#                                 aðstæður · vandi (or kveikja) · markmið ·
#                                 tilraun · útkoma · viðbrögð (or tilfinning)
#                    fræðitexti   aðalatriði (exactly one) · smáatriði
#                    both         annað — a sentence that is none of these
#   a pronoun      "Hann{Jón}": straight after a personal pronoun, in braces,
#                  the word it refers to, as it stands EARLIER in the text (or
#                  another form of the same noun: "Hún{kona}" finds "konan").
#                  Two or three joined by "og" for a plural: "Þau{Jón og Sara}".
#   a question     "? [mark] Question? | right | wrong | wrong" — the right
#                  answer FIRST (the app shuffles), then two or three wrong.
#                  The mark says what the question asks for; today that is
#                  only aðalatriði (the main idea of the whole text).
#   an explanation "! …" on the line after a question: what the pupil reads
#                  once the answer is in.
#   a question     (issue #31) the same, with its answers on the lines below
#   in a block     instead of after bars — for answers too long for one line:
#                      ? [samantekt] Hvaða samantekt passar við söguna?
#                      + the right answer (first, and only one)
#                      - [útkoma] a wrong one, with the part of the story map
#                      - [röð] it breaks: here the útkoma, there the order
#                      ! the explanation
#                  A summary question (samantekt) is always a block, in a
#                  story, and each wrong summary names what it breaks: a part
#                  the story has, or röð (the order of events is changed).
#   an episode     (issue #31) "= 1. þáttur", "= 2. þáttur": a longer story
#                  has two or three episodes, each with its own vandi,
#                  tilraun and útkoma. The line stands before the episode's
#                  first sentence; a story without one is one episode.
#
# `texts()` is the ONE reader, and every check on a text is here; the build
# (pipeline/build_exercises.py) only consumes what it returns, and adds what
# needs the parser: every sentence through Greynir, BÍN and parse_guard.py.
#
#   * the header: þyngd 1–5, tegund saga | fræðitexti, orð (may be empty);
#   * the length the þyngd allows (TEXT_LENGTH): 2–3 sentences at þyngd 1, a
#     paragraph at 2–3, 150–300 words at 4–5 (docs/DLD-PLAN.md §4);
#   * the marks: known ones, of the text's kind; a story has every story-map
#     part its þyngd requires (STORY_NEEDS); a subject text has exactly one
#     aðalatriði and the smáatriði its þyngd requires;
#   * a pronoun's referent: the marked word is a personal pronoun of the
#     third person, the referent stands earlier in the text, and BÍN gives
#     the two the same grammatical gender and number (*steinninn … hann*;
#     "Jón og Sara" is *þau*, "Jón og Páll" *þeir*);
#   * every word of `# orð:` is on LÍNO-2 (sources/lino2.csv, when the file
#     is there) and is in the text, in some form BÍN knows;
#   * a question has exactly one right answer: the first, with two or three
#     wrong ones beside it, no two the same, and an explanation;
#   * the story-map marks point at the story's sentences (issue #31): a
#     story's episodes are numbered 1, 2, 3 in order, only from þyngd
#     EPISODES_FROM, each has the parts EPISODE_NEEDS; a wrong summary names a
#     part the story has (or röð).
#
# BÍN is asked through `lookup(word) -> [(lemma, class, mark), …]`, so that a
# test can hand in a few words written out by hand. Left out, it is BÍN
# itself (the `islenska` package); where that is not installed the two BÍN
# checks are skipped and `texts.bin_checked` says so — the build always has
# it, so a build never skips them.

TEXT_DIR = "textar"
TEXT_KINDS = ("saga", "fræðitexti")

# The marks a person may write -> the name the build and the app know the
# part by. Two story-map parts have two names in the plan (kveikja/vandi,
# viðbrögð/tilfinning): either may be written, and they are one part.
STORY_PARTS = ("aðstæður", "vandi", "markmið", "tilraun", "útkoma", "viðbrögð")
STORY_MARKS = dict([(p, p) for p in STORY_PARTS] + [("kveikja", "vandi"), ("tilfinning", "viðbrögð")])
IDEA_MARKS = {"aðalatriði": "aðalatriði", "smáatriði": "smáatriði"}
OTHER_MARK = "annað"
QUESTION_MARKS = ("aðalatriði", "samantekt")
# What a wrong summary may say it breaks: a part of the story map, or the
# order of events.
ORDER_MARK = "röð"

# Episodes (issue #31): two or three, from this þyngd, each with these parts.
EPISODES_FROM = 3
EPISODES_MAX = 3
EPISODE_NEEDS = ("vandi", "tilraun", "útkoma")

# What a þyngd asks of a text: how long it is, and which parts it must have.
#   TEXT_LENGTH   þyngd -> (unit, fewest, most)
#   STORY_NEEDS   þyngd -> the story-map parts a story must have
#   DETAILS_MIN   þyngd -> the fewest smáatriði beside the one aðalatriði
TEXT_LENGTH = {1: ("setningar", 2, 3), 2: ("setningar", 4, 9), 3: ("setningar", 4, 9),
               4: ("orð", 150, 300), 5: ("orð", 150, 300)}
STORY_NEEDS = {1: ("vandi", "útkoma"),
               2: ("aðstæður", "vandi", "tilraun", "útkoma"),
               3: ("aðstæður", "vandi", "tilraun", "útkoma"),
               4: STORY_PARTS, 5: STORY_PARTS}
DETAILS_MIN = {1: 1, 2: 2, 3: 2, 4: 3, 5: 3}

_PRONOUN_GENDER = {"hann": "kk", "hún": "kvk", "það": "hk"}
_GENDERS = ("kk", "kvk", "hk")
_EDGE = ".,;:!?…„“\"'()«»–—"
_END = (".", "!", "?")


def _bin_lookup():
    """BÍN as `lookup(word)`, or None where the islenska package is not
    installed (the quick check on a teacher's computer)."""
    try:
        from islenska import Bin
    except ImportError:
        return None
    b = Bin()

    def lookup(word):
        return [(e.ord, e.ofl, e.mark) for e in b.lookup(word)[1]]
    return lookup


def _readings(lookup, word):
    """Every BÍN reading of a word as it stands and in lower case (the first
    word of a sentence has a capital that is not its own)."""
    out = list(lookup(word))
    if word.lower() != word:
        out += [r for r in lookup(word.lower()) if r not in out]
    return out


def _number(mark):
    return "FT" if "FT" in mark else "ET"


def _noun_readings(lookup, word):
    """{(gender, number)} of a word read as a noun, and its noun lemmas."""
    rs = [(l, c, m) for l, c, m in _readings(lookup, word) if c in _GENDERS]
    return {(c, _number(m)) for _l, c, m in rs}, {l for l, _c, _m in rs}


def _pronoun_readings(lookup, word):
    """{(gender, number)} of a word read as hann, hún or það (þeir, þær, þau)."""
    return {(_PRONOUN_GENDER[l], _number(m)) for l, c, m in _readings(lookup, word)
            if c == "pfn" and l in _PRONOUN_GENDER}


def _strip(token):
    return token.strip(_EDGE)


def _sentence(body, where, bad):
    """"Hún{Sara} hljóp." -> ("Hún hljóp.", ["Hún", "hljóp"], [(0, "Sara")]):
    the sentence without its marks, its words, and for each marked pronoun
    its place among the words and the referent as written."""
    refs, words, clean = [], [], []
    # a referent may hold spaces ("Jón og Sara"): take the braces out first
    held = []

    def hold(m):
        held.append(m.group(1).strip())
        return "\x00%d\x00" % (len(held) - 1)
    marked = re.sub(r"\{([^{}]*)\}", hold, body)
    if "{" in marked or "}" in marked:
        bad("slaufusvigi án maka / a brace without its pair")
    for tok in marked.split(" "):
        if not tok:
            bad("tvö bil í röð / two spaces in a row")
        m = re.fullmatch(r"([^\x00]*)\x00(\d+)\x00([^\x00]*)", tok)
        if m:
            word, ref, tail = m.group(1), held[int(m.group(2))], m.group(3)
            if not _strip(word):
                bad("slaufusvigi á að standa beint á eftir fornafni: Hann{Jón} / "
                    "a brace must follow its pronoun directly")
            if not ref:
                bad("tómur slaufusvigi / empty braces")
            tok = word + tail
            refs.append((len(words), ref))
        elif "\x00" in tok:
            bad("slaufusvigi á að standa beint á eftir fornafni: Hann{Jón} / "
                "a brace must follow its pronoun directly")
        clean.append(tok)
        if _strip(tok):
            words.append(_strip(tok))
    text = " ".join(clean)
    if not text.endswith(_END):
        bad("setning á að enda á punkti, spurningarmerki eða upphrópunarmerki / "
            "a sentence ends in . ? or !")
    if re.search(r"[.!?] [A-ZÁÉÍÓÚÝÞÆÖÐ]", text):
        bad("ein setning í hverri línu / one sentence per line")
    return text, words, refs


def _referent(lookup, ref, before):
    """Where the referent stands: (sentence, first word, number of words) of
    its LAST occurrence among `before` — [(sentence index, [words])], the
    words of the pronoun's own sentence cut off at the pronoun — or None.
    By the form as written; a single word also by another form of the same
    noun, when BÍN is there to say so."""
    want = [w.lower() for w in ref.split(" ")]
    lemmas = _noun_readings(lookup, ref)[1] if lookup and len(want) == 1 else set()
    for si, words in reversed(before):
        low = [w.lower() for w in words]
        for at in range(len(low) - len(want), -1, -1):
            if low[at:at + len(want)] == want:
                return (si, at, len(want))
    if lemmas:
        for si, words in reversed(before):
            for at in range(len(words) - 1, -1, -1):
                if _noun_readings(lookup, words[at])[1] & lemmas:
                    return (si, at, 1)
    return None


def _agrees(lookup, pronoun, ref):
    """None if BÍN gives the pronoun and its referent the same gender and
    number, else why not (Icelandic / English)."""
    pro = _pronoun_readings(lookup, pronoun)
    if not pro:
        return ("„%s“ er ekki persónufornafn í 3. persónu (hann, hún, það, þeir, þær, þau) / "
                "not a third-person personal pronoun" % pronoun)
    parts = [p for p in ref.split(" ") if p != "og"]
    nouns = [_noun_readings(lookup, p)[0] for p in parts]
    for p, n in zip(parts, nouns):
        if not n:
            return "BÍN þekkir „%s“ ekki sem nafnorð / BÍN has no noun %r" % (p, p)
    if len(parts) == 1:
        can = nouns[0]
    else:
        # several joined by og: plural; one gender if all share it, else neuter
        can = set()
        for combo in itertools.product(*[{g for g, _n in n} for n in nouns]):
            can.add((combo[0] if len(set(combo)) == 1 else "hk", "FT"))
    if pro & can:
        return None
    say = lambda rs: ", ".join(sorted("%s %s" % r for r in rs))
    return ("„%s“ (%s) og „%s“ (%s) eru ekki í sama kyni og tölu / "
            "the pronoun and its referent differ in gender or number"
            % (pronoun, say(pro), ref, say(can)))


def _lino_words():
    """The lemmas of LÍNO-2, or None where sources/lino2.csv is not there
    (pipeline/lino.py: the build then goes on as if the list were empty)."""
    path = os.path.join(os.path.dirname(ROOT), "sources", "lino2.csv")
    if not os.path.exists(path):
        return None
    import lino
    return {lemma for lemma, _cls, _rank in lino.load(path)}


def _answers_ok(q, stop):
    """One right answer first and two or three wrong ones, no two the same —
    the same for a question on one line and one with its answers below."""
    options = ([q["a"]] if q["a"] else []) + q["w"]
    if not 3 <= len(options) <= 4:
        stop(q["line"], "spurning á að hafa eitt rétt svar (fremst) og tvö eða þrjú röng, en hér eru %d svör / "
                        "one right answer first, then two or three wrong ones" % len(options))
    if len({o.lower().rstrip(".") for o in options}) != len(options):
        stop(q["line"], "sama svarið stendur tvisvar, svo rétta svarið er ekki eitt / "
                        "the same answer twice: there must be exactly one right answer")


def read_text(path, rel, lookup=None, lino=None):
    """One text file -> a Row (see `texts`). `rel` is the name errors use;
    `lino` the lemmas of LÍNO-2, or None for "not checked"."""

    def stop(no, why):
        raise ContentError("%s:%d: %s" % (rel, no, why))

    head, head_line = {}, {}
    sentences, questions, episodes = [], [], []
    last = 0
    with open(path, encoding="utf-8") as f:
        raw_lines = f.read().split("\n")
    for no, raw in enumerate(raw_lines, 1):
        line = raw.rstrip("\r")
        bad = lambda why, no=no: stop(no, why)
        if not line.strip():
            continue
        last = no
        if "\t" in line:
            bad("TAB í línunni / a TAB in the line")
        if line != line.strip():
            bad("bil fremst eða aftast í línunni / stray space at the edge of the line")
        if line.startswith("#"):
            m = re.fullmatch(r"#\s*(þyngd|tegund|orð)\s*:\s*(.*)", line)
            if m:
                if sentences or questions:
                    bad("hausinn (# %s:) á að standa á undan textanum / the header comes before the text" % m.group(1))
                if m.group(1) in head:
                    bad("„# %s:“ stendur tvisvar / twice" % m.group(1))
                head[m.group(1)], head_line[m.group(1)] = m.group(2).strip(), no
            continue
        for k in ("þyngd", "tegund", "orð"):
            if k not in head:
                bad("hausinn vantar „# %s:“ á undan textanum / the header line is missing" % k)
        if line.startswith("!"):
            if not questions or questions[-1]["last"] != no - 1 or questions[-1]["why"]:
                bad("skýring (!) á að standa í línunni á eftir spurningu / an explanation follows its question")
            why = line[1:].strip()
            if not why:
                bad("tóm skýring / an empty explanation")
            questions[-1]["why"] = why
            _answers_ok(questions[-1], stop)
            continue
        if line.startswith("?"):
            m = re.fullmatch(r"\?\s*\[([^\]]*)\]\s*(.*)", line)
            if not m:
                bad("spurning á að vera „? [merki] Spurning? | rétt | rangt | rangt“ / a question needs its mark")
            mark = m.group(1).strip()
            if mark not in QUESTION_MARKS:
                bad("óþekkt merki á spurningu: [%s]; þekkt: %s / unknown question mark"
                    % (mark, ", ".join(QUESTION_MARKS)))
            cells = [c.strip() for c in m.group(2).split("|")]
            if any(not c for c in cells):
                bad("tómur reitur í spurningu / an empty field in the question")
            q, options = cells[0], cells[1:]
            if not q.endswith("?"):
                bad("spurningin á að enda á spurningarmerki / the question ends in ?")
            block = not options
            if mark == "samantekt" and not block:
                bad("samantekt er skrifuð með svörin í línunum fyrir neðan (+ rétt, - [brot] rangt) / "
                    "a summary question has its answers on the lines below")
            questions.append({"line": no, "last": no, "mark": mark, "q": q, "block": block,
                              "a": options[0] if options else "", "w": options[1:], "br": [], "why": ""})
            if not block:
                _answers_ok(questions[-1], stop)
            continue
        if line[0] in "+-" and line[1:2] == " ":
            q = questions[-1] if questions else None
            if not q or not q["block"] or q["last"] != no - 1 or q["why"]:
                bad("svar (+ eða -) á að standa beint undir spurningu sem hefur ekki svör eftir strikum / "
                    "an answer line follows its question or the answer before it")
            body = line[2:].strip()
            if line[0] == "+":
                if q["a"] or q["w"]:
                    bad("rétta svarið (+) stendur fremst og bara eitt / the right answer comes first, and only one")
                q["a"] = body
            else:
                if not q["a"]:
                    bad("rétta svarið (+) stendur fremst, á undan þeim röngu / the right answer comes first")
                bm = re.fullmatch(r"\[([^\]]*)\] (.+)", body)
                if q["mark"] == "samantekt":
                    if not bm:
                        bad("röng samantekt segir fremst hvað hún brýtur: - [útkoma] …, - [röð] … / "
                            "a wrong summary names what it breaks")
                    brot = bm.group(1).strip()
                    if brot != ORDER_MARK and brot not in STORY_MARKS:
                        bad("óþekkt brot [%s]; þekkt: %s, %s / unknown break"
                            % (brot, ", ".join(STORY_MARKS), ORDER_MARK))
                    q["br"].append((STORY_MARKS.get(brot, brot), no))
                    body = bm.group(2).strip()
                elif bm:
                    bad("merki á röngu svari er bara notað í samantekt / only a wrong summary carries a mark")
                q["w"].append(body)
            if not body:
                bad("tómt svar / an empty answer")
            q["last"] = no
            continue
        m = re.fullmatch(r"=\s*(\d+)\.\s*þáttur", line)
        if m or line.startswith("="):
            if not m:
                bad("þáttur er skrifaður „= 1. þáttur“ / an episode line is \"= 1. þáttur\"")
            if questions:
                bad("setningar textans eiga að standa á undan spurningunum / the sentences come before the questions")
            n = int(m.group(1))
            if n != len(episodes) + 1:
                bad("þættirnir eru tölusettir 1, 2, 3 í röð; hér átti að standa „= %d. þáttur“ / "
                    "episodes are numbered 1, 2, 3 in order" % (len(episodes) + 1))
            if n == 1 and sentences:
                bad("„= 1. þáttur“ stendur á undan fyrstu setningunni / the first episode line comes before the first sentence")
            if n > 1 and (not sentences or sentences[-1]["e"] != n - 1):
                bad("þáttur %d hefur enga setningu / episode %d has no sentence" % (n - 1, n - 1))
            episodes.append(no)
            continue
        m = re.fullmatch(r"\[([^\]]*)\] (.+)", line)
        if not m:
            bad("lína á að vera setning með merki fremst ([vandi] …), spurning (? …), skýring (! …), "
                "þáttur (= 1. þáttur) eða athugasemd (# …) / not a sentence with its mark, a question, "
                "an explanation, an episode or a comment")
        if questions:
            bad("setningar textans eiga að standa á undan spurningunum / the sentences come before the questions")
        text, words, refs = _sentence(m.group(2), rel, bad)
        sentences.append({"line": no, "mark": m.group(1).strip(), "t": text, "words": words, "refs": refs,
                          "e": len(episodes)})

    for k in ("þyngd", "tegund", "orð"):
        if k not in head:
            stop(last, "hausinn vantar „# %s:“ / the header line is missing" % k)
    try:
        lvl = int(head["þyngd"])
    except ValueError:
        lvl = 0
    if lvl not in TEXT_LENGTH:
        stop(head_line["þyngd"], "þyngd á að vera heil tala frá 1 til 5 / expected a whole number 1-5 (%r)" % head["þyngd"])
    kind = head["tegund"]
    if kind not in TEXT_KINDS:
        stop(head_line["tegund"], "tegund á að vera „saga“ eða „fræðitexti“ / expected saga or fræðitexti (%r)" % kind)
    targets = split_list(head["orð"])
    if any(not w for w in targets) or len(set(targets)) != len(targets):
        stop(head_line["orð"], "„# orð:“ á að vera orð aðskilin með kommum, hvert einu sinni / "
                              "words separated by commas, each once")
    if not sentences:
        stop(last, "engin setning í textanum / the text has no sentence")

    # the length the þyngd allows
    unit, lo, hi = TEXT_LENGTH[lvl]
    n = len(sentences) if unit == "setningar" else sum(len(s["words"]) for s in sentences)
    if not lo <= n <= hi:
        stop(head_line["þyngd"], "texti á þyngd %d á að vera %d–%d %s, en þessi er %d / "
                                 "the text is too short or too long for its þyngd" % (lvl, lo, hi, unit, n))

    # the marks
    marks = dict(STORY_MARKS if kind == "saga" else IDEA_MARKS)
    marks[OTHER_MARK] = OTHER_MARK
    for s in sentences:
        if s["mark"] not in marks:
            stop(s["line"], "óþekkt merki [%s] í texta af tegundinni %s; þekkt: %s / unknown mark for this kind of text"
                 % (s["mark"], kind, ", ".join(marks)))
        s["part"] = marks[s["mark"]]
    have = [s["part"] for s in sentences]
    if kind == "saga":
        missing = [p for p in STORY_NEEDS[lvl] if p not in have]
        if missing:
            stop(head_line["þyngd"], "saga á þyngd %d á að hafa þessa hluta sögukortsins: %s — hér vantar: %s / "
                                     "the story lacks a story-map part its þyngd requires"
                 % (lvl, ", ".join(STORY_NEEDS[lvl]), ", ".join(missing)))
    else:
        main = [s for s in sentences if s["part"] == "aðalatriði"]
        if len(main) != 1:
            stop(main[1]["line"] if len(main) > 1 else head_line["tegund"],
                 "fræðitexti á að hafa nákvæmlega eitt [aðalatriði], en hér eru %d / "
                 "a subject text has exactly one main idea" % len(main))
        if have.count("smáatriði") < DETAILS_MIN[lvl]:
            stop(head_line["þyngd"], "fræðitexti á þyngd %d á að hafa að minnsta kosti %d [smáatriði] / "
                                     "too few details for its þyngd" % (lvl, DETAILS_MIN[lvl]))

    # the episodes (issue #31): numbered in order, only in a longer story,
    # each with the parts an episode has
    if episodes:
        if kind != "saga":
            stop(episodes[0], "bara saga skiptist í þætti / only a story has episodes")
        if lvl < EPISODES_FROM:
            stop(episodes[0], "saga skiptist fyrst í þætti á þyngd %d / episodes start at þyngd %d"
                 % (EPISODES_FROM, EPISODES_FROM))
        if not 2 <= len(episodes) <= EPISODES_MAX:
            stop(episodes[-1], "saga með þáttum hefur 2 eða %d þætti, en hér eru %d / "
                               "a story with episodes has two or three" % (EPISODES_MAX, len(episodes)))
        for n, at in enumerate(episodes, 1):
            mine = [s["part"] for s in sentences if s["e"] == n]
            if not mine:
                stop(at, "þáttur %d hefur enga setningu / episode %d has no sentence" % (n, n))
            missing = [p for p in EPISODE_NEEDS if p not in mine]
            if missing:
                stop(at, "hver þáttur hefur %s — í þætti %d vantar: %s / an episode lacks a part"
                     % (", ".join(EPISODE_NEEDS), n, ", ".join(missing)))

    # the pronouns: the referent stands earlier, in the same gender and number
    for si, s in enumerate(sentences):
        out = []
        for at, ref in s["refs"]:
            shape = ref.split(" ")
            if not (len(shape) == 1 or (len(shape) in (3, 5) and all(x == "og" for x in shape[1::2])
                                        and "og" not in shape[0::2])):
                stop(s["line"], "vísun á að vera eitt orð eða orð tengd með „og“: {Jón}, {Jón og Sara} / "
                                "a referent is one word, or words joined by og (%r)" % ref)
            before = [(k, sentences[k]["words"]) for k in range(si)] + [(si, s["words"][:at])]
            to = _referent(lookup, ref, before)
            if to is None:
                stop(s["line"], "„%s{%s}“: „%s“ stendur hvergi framar í textanum / "
                                "the referent is not a word earlier in the text" % (s["words"][at], ref, ref))
            if lookup:
                why = _agrees(lookup, s["words"][at], ref)
                if why:
                    stop(s["line"], "„%s{%s}“: %s" % (s["words"][at], ref, why))
            out.append({"at": at, "ref": ref, "to": to})
        s["refs"] = out

    # the target words are LÍNO-2 words, and are in the text
    if lino is not None:
        for w in targets:
            if w not in lino:
                stop(head_line["orð"], "orðið „%s“ (# orð:) er ekki á LÍNO-2 / the target word is not on LÍNO-2" % w)
    if lookup:
        for w in targets:
            if not any(w in {l for l, _c, _m in _readings(lookup, x)} for s in sentences for x in s["words"]):
                stop(head_line["orð"], "orðið „%s“ (# orð:) kemur ekki fyrir í textanum / "
                                      "the target word is not in the text" % w)

    # the questions
    if not questions:
        stop(last, "textann vantar spurningu (? [aðalatriði] …) / the text has no question")
    for q in questions:
        if not q["why"]:
            stop(q["line"], "spurninguna vantar skýringu í næstu línu (! …) / the question has no explanation")
        if q["mark"] == "samantekt":
            if kind != "saga":
                stop(q["line"], "samantekt eftir sögukorti er bara spurð um sögu / a summary question is for a story")
            for brot, no in q["br"]:
                if brot != ORDER_MARK and brot not in have:
                    stop(no, "röng samantekt brýtur [%s], en sagan hefur engan þann hluta / "
                             "the wrong summary breaks a part the story does not have" % brot)
        q["br"] = [b for b, _no in q["br"]]
        del q["block"], q["last"]

    r = Row()
    r.file, r.line = rel, 1
    r.update({"id": os.path.splitext(os.path.basename(rel))[0], "þyngd": lvl, "tegund": kind, "orð": targets,
              "setningar": sentences, "spurningar": questions})
    return r


def texts(lookup=None, folder=None):
    """Every text of content/textar/, checked, in the order of the file names.

    Each is a Row (`.file` for messages):
      id          the file name without .txt — the text's stable name
      þyngd       1–5
      tegund      "saga" | "fræðitexti"
      orð         the target words, as written
      setningar   [{line, mark (as written), part (the story-map or main-idea
                    part it names), t (the sentence without its marks),
                    words, refs: [{at, ref, to}]}]
                  — a ref: the pronoun is word `at` of the sentence; `ref` is
                    the referent as written; `to` = (sentence, first word,
                    number of words) of where it stands. Words are counted
                    without punctuation.
                  e: the episode the sentence is in, 1–3, or 0 in a story
                    without episodes (and in a subject text) (#31)
      spurningar  [{line, mark, q, a (the right answer), w (the wrong ones), why,
                    br (a summary question: what each wrong one breaks — a
                    story-map part or "röð", in the order of w; else [])}]

    `lookup` is BÍN (see the head of this section); `texts.bin_checked` says
    afterwards whether the two BÍN checks ran."""
    if lookup is None:
        lookup = _bin_lookup()
    texts.bin_checked = lookup is not None
    folder = folder or os.path.join(ROOT, TEXT_DIR)
    lino = _lino_words()
    out, seen = [], set()
    for name in sorted(os.listdir(folder)) if os.path.isdir(folder) else []:
        if not name.endswith(".txt"):
            continue
        rel = "content/%s/%s" % (TEXT_DIR, name)
        if not re.fullmatch(r"[a-z0-9-]+\.txt", name):
            raise ContentError("%s: skráarheiti texta á að vera úr a–z, 0–9 og bandstriki / "
                               "a text's file name is made of a-z, 0-9 and hyphens" % rel)
        r = read_text(os.path.join(folder, name), rel, lookup, lino)
        for s in r["setningar"]:
            if s["t"] in seen:
                raise ContentError("%s:%d: setningin stendur líka í öðrum texta / the sentence is in two texts"
                                   % (rel, s["line"]))
            seen.add(s["t"])
        out.append(r)
    return out


texts.bin_checked = False


if __name__ == "__main__":
    # A quick check for whoever just edited a file: read everything the way
    # the build does, without BÍN or Greynir, and say what was read or what
    # is wrong (file and line). ./build.sh still has to run for the real check.
    import sys
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    try:
        import sentences, exercises, frame_allow
        allow = frame_allow.read(sentences.S)
        read = texts()
    except ContentError as e:
        print("Villa / error:", e, file=sys.stderr)
        sys.exit(1)
    n_ex = sum(len(v) for k, v in vars(exercises).items()
               if k.isupper() and isinstance(v, (list, dict)) and not k.startswith("VC_"))
    print("Allt lesið / all read: %d setningar, %d orð leyfð í einstaka ramma, %d atriði í Villuveiðum, "
          "%d færslur í öðrum listum."
          % (len(sentences.S), len(allow), len(exercises.HUNT), n_ex - len(exercises.HUNT)))
    print("%d textar (content/textar/)%s." % (len(read), "" if texts.bin_checked else
          " — án BÍN: kyn fornafna og „# orð:“ eru ekki athuguð hér / without BÍN: pronoun gender and # orð: not checked here"))
    print("Keyrðu ./build.sh: þá er efnið borið saman við BÍN og greint með Greyni / "
          "run ./build.sh for the full check.")
