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
"""

import os

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


if __name__ == "__main__":
    # A quick check for whoever just edited a file: read everything the way
    # the build does, without BÍN or Greynir, and say what was read or what
    # is wrong (file and line). ./build.sh still has to run for the real check.
    import sys
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    try:
        import sentences, exercises, frame_allow
        allow = frame_allow.read(sentences.S)
    except ContentError as e:
        print("Villa / error:", e, file=sys.stderr)
        sys.exit(1)
    n_ex = sum(len(v) for k, v in vars(exercises).items()
               if k.isupper() and isinstance(v, (list, dict)) and not k.startswith("VC_"))
    print("Allt lesið / all read: %d setningar, %d orð leyfð í einstaka ramma, %d atriði í Villuveiðum, "
          "%d færslur í öðrum listum."
          % (len(sentences.S), len(allow), len(exercises.HUNT), n_ex - len(exercises.HUNT)))
    print("Keyrðu ./build.sh: þá er efnið borið saman við BÍN og greint með Greyni / "
          "run ./build.sh for the full check.")
