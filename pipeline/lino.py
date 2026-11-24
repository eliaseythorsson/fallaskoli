# -*- coding: utf-8 -*-
"""LÍNO-2, the Icelandic academic word list, read for the build (issue #9).

    Listi yfir íslenskan námsorðaforða (LÍNO), v. 1.0: 2,294 Tier-2 lemmas
    chosen from the 5,000 commonest words of MÍNO, a corpus of school texts.
    Auður Pálsdóttir & Sigríður Ólafsdóttir 2023. CLARIN-IS,
    http://hdl.handle.net/20.500.12537/307, CC BY 4.0.

The file is committed as it was downloaded, like the frequency list:
`sources/lino2.csv` with its checksum `sources/lino2.sha256`, checked by
build.sh before anything reads it. How to get it is in `MISSING` below.
Until it is there the build warns and goes on as if the list were empty:
the data is then exactly what it was before LÍNO-2.

What the build does with it:
  build_freq.py     ranks every LÍNO-2 word up (LINO_FACTOR), as it ranks up
                    the words of the program's own content, and reports the
                    LÍNO-2 lemmas BÍN does not have.
  build_lexicon.py  gives every lexicon word on the list its LÍNO rank (`lino`,
                    1 = the commonest), adds the LÍNO-2 words the subtitle
                    list never saw (as it adds the sentence bank's nouns), and
                    reports every LÍNO-2 word that still did not get in.

The reader is strict on purpose. It finds its columns by their names in the
header, and stops, naming the file, the line and what it found, on a header
it does not know, a word class it does not know, or a rank that is not a
number. It never guesses which column is which: a wrong word on the list is
worse than a missing one. If the real file names a column or a class in a way
not listed below, add that name to COLUMNS or CLASSES; nothing else changes.

Standard library only, so tests can run it without BÍN (tests/lino.test.js).
"""
import csv, io, os, sys

LINO_CSV = 'sources/lino2.csv'
LINO_SHA = 'sources/lino2.sha256'

MISSING = f"""{LINO_CSV} is missing. The build needs LÍNO-2, the Icelandic academic word list
(CC BY 4.0). To add it, once:

  1. Download LÍNO_1_0.zip from CLARIN-IS:
       http://hdl.handle.net/20.500.12537/307
       (repository.clarin.is → "Listi yfir íslenskan námsorðaforða - LÍNO (v.1.0)")
  2. Unzip it. Copy the CSV that holds the word list, unchanged, to {LINO_CSV}
     (not the LibreOffice lock file .~lock…#, and not the README).
  3. Record its checksum, from the repository root:
       (cd sources && sha256sum lino2.csv > lino2.sha256)
     (on a Mac: shasum -a 256 lino2.csv > lino2.sha256)
  4. Run ./build.sh. If the reader does not know a column or word-class name
     in the file it stops and says which; add it to COLUMNS or CLASSES in
     pipeline/lino.py.
"""

# Column names the reader knows, lower-cased. The first header cell that is
# one of these names is that column.
COLUMNS = {
    'lemma': {'lemma', 'lemmur', 'orð', 'flettiorð', 'uppflettiorð', 'word', 'lemma/orð'},
    'cls':   {'orðflokkur', 'orðfl.', 'orðfl', 'ofl', 'pos', 'word class', 'wordclass', 'part of speech'},
    'rank':  {'röð', 'rank', 'sæti', 'nr', 'nr.', 'númer', '#'},
    'freq':  {'tíðni', 'freq', 'frequency', 'fjöldi', 'count'},
}

# A word class on the list -> the BÍN classes (`ofl`) it can be. A noun on the
# list is a noun of any gender; BÍN says which.
_NOUN = frozenset({'kk', 'kvk', 'hk'})
CLASSES = {}
for names, ofl in [
    (('no', 'nafnorð', 'noun'), _NOUN),
    (('kk',), {'kk'}), (('kvk',), {'kvk'}), (('hk',), {'hk'}),
    (('so', 'sagnorð', 'sögn', 'verb'), {'so'}),
    (('lo', 'lýsingarorð', 'adjective', 'adj'), {'lo'}),
    (('ao', 'atviksorð', 'adverb', 'adv'), {'ao'}),
    (('fs', 'forsetning', 'preposition'), {'fs'}),
    (('st', 'samtenging', 'conjunction'), {'st'}),
    (('to', 'töluorð', 'numeral'), {'to'}),
    (('fn', 'fornafn', 'pronoun'), {'fn', 'pfn', 'afn', 'abfn'}),
]:
    for n in names: CLASSES[n] = frozenset(ofl)


class LinoError(SystemExit):
    """The file is not what the reader expects. The message says where."""


def _num(s):
    """'1.234', '1,234', '1 234' or '1234' -> 1234; anything else -> None."""
    t = s.replace(' ', '').replace(' ', '').replace('.', '').replace(',', '')
    return int(t) if t.isdigit() else None


def parse(text, name=LINO_CSV):
    """The list as [(lemma, BÍN classes or None, LÍNO rank)], best rank first.

    rank: the file's own rank column if it has one; otherwise its frequency
    column, highest first (ties keep the file's order); otherwise the order of
    the lines, with a note on stderr. A lemma and class listed twice keeps its
    better rank, and is reported."""
    if text.startswith('﻿'): text = text[1:]
    lines = [l for l in text.splitlines() if l.strip()]
    if not lines: raise LinoError(f'{name}: the file is empty')
    try:
        dialect = csv.Sniffer().sniff(lines[0], delimiters=',;\t')
    except csv.Error:
        raise LinoError(f'{name}:1: no delimiter (comma, semicolon or tab) in the header: {lines[0]!r}')
    rows = list(csv.reader(io.StringIO('\n'.join(lines)), dialect))
    head = [h.strip().lower() for h in rows[0]]
    col = {}
    for key, names in COLUMNS.items():
        hit = [i for i, h in enumerate(head) if h in names]
        if hit: col[key] = hit[0]
    if 'lemma' not in col:
        raise LinoError(f'{name}:1: no lemma column in the header {rows[0]!r}. '
                        f'Add its name to COLUMNS["lemma"] in pipeline/lino.py.')
    out, seen, dupes, unknown = [], {}, [], set()
    for ln, r in enumerate(rows[1:], start=2):
        cell = lambda k: r[col[k]].strip() if k in col and col[k] < len(r) else ''
        lemma = cell('lemma')
        if not lemma: raise LinoError(f'{name}:{ln}: no lemma: {r!r}')
        cls = None
        if 'cls' in col:
            c = cell('cls').lower()
            if c not in CLASSES: unknown.add(c); continue
            cls = CLASSES[c]
        key = None
        if 'rank' in col:
            key = _num(cell('rank'))
            if key is None: raise LinoError(f'{name}:{ln}: the rank {cell("rank")!r} is not a whole number')
        elif 'freq' in col:
            f = _num(cell('freq'))
            if f is None: raise LinoError(f'{name}:{ln}: the frequency {cell("freq")!r} is not a whole number')
            key = -f
        out.append((key if key is not None else 0, ln, lemma, cls))
    if unknown:
        raise LinoError(f'{name}: word classes the reader does not know: '
                        + ', '.join(repr(u) for u in sorted(unknown))
                        + '. Add them to CLASSES in pipeline/lino.py.')
    if 'rank' not in col and 'freq' not in col:
        print(f'  LÍNO-2: {name} has no rank or frequency column; the rank is the order of the lines',
              file=sys.stderr)
    out.sort(key=lambda x: (x[0], x[1]))
    words = []
    for _k, ln, lemma, cls in out:
        k = (lemma, cls)
        if k in seen: dupes.append(f'{lemma} (line {ln}, already line {seen[k]})'); continue
        seen[k] = ln
        words.append((lemma, cls, len(words) + 1))
    if dupes: print('  LÍNO-2: listed twice, the better rank kept:', '; '.join(dupes), file=sys.stderr)
    return words


def load(path=LINO_CSV, required=False):
    """parse() of the file at `path`.

    Missing file: with `required` a build error that says how to get it;
    without (the build, until the owner has added the file) a one-line note
    and an empty list (build.sh gives the loud warning), so the build goes on exactly as before LÍNO-2: no
    word lifted, no `lino` rank, the data byte for byte what it was. A file
    that IS there is read as strictly as ever (and build.sh then requires
    its checksum)."""
    if not os.path.exists(path):
        if required: raise LinoError(MISSING)
        # build.sh has already said it loudly, with the instructions
        print(f'  LÍNO-2: {path} not found; taken as an empty list '
              f'(python3 pipeline/lino.py says how to add it)', file=sys.stderr)
        return []
    raw = open(path, 'rb').read()
    try:
        text = raw.decode('utf-8')
    except UnicodeDecodeError:
        raise LinoError(f'{path} is not UTF-8. Save it again as UTF-8 text '
                        f'(do not re-type it), then update {LINO_SHA}.')
    return parse(text, path)


FACTOR = 3   # the lift in build_freq.py; the same as its SCHOOL_FACTOR


def boost(pairs, words, already=frozenset()):
    """(lemma, BÍN class) -> FACTOR, for the pairs in `pairs` that are on the
    list (in the class it gives) and not in `already` (the school material,
    lifted by the same factor: a word that is both is lifted once)."""
    on = ranks(words, {c for _o, c in pairs})
    return {p: FACTOR for p in pairs if p in on and p not in already}


def tag(W, words, say=print):
    """Give every lexicon entry in W that is on the list its LÍNO rank, `lino`.
    Only the class(es) the list gives; a list with no word-class column tags
    the lemma in every class BÍN gives it here, and says so. -> how many."""
    rank = ranks(words, {x['c'] for x in W})
    n = 0
    for x in W:
        r = rank.get((x['o'], x['c']))
        if r: x['lino'] = r; n += 1
    if any(cls is None for _l, cls, _r in words):
        say('LÍNO-2: the list gives no word class; every class of a listed lemma is tagged')
    return n


def ranks(words, classes):
    """(lemma, BÍN class) -> LÍNO rank, for the BÍN classes in `classes`.
    A list entry with no class stands for the lemma in every one of them."""
    out = {}
    for lemma, cls, rank in words:
        for c in sorted(cls if cls is not None else classes):
            if c in classes: out.setdefault((lemma, c), rank)
    return out


def core(b, lemma):
    """BÍN's core entries (birting K, the general vocabulary) whose lemma is
    `lemma`. The lemma is looked up as a form: it is its own first form."""
    _, ms = b.lookup_ksnid(lemma)
    return [m for m in ms if m.ord == lemma and m.hluti == 'alm' and m.birting == 'K' and m.bin_id]


def not_in_bin(words, b):
    """The list's entries BÍN's core (birting K, the general vocabulary) does
    not have in the class the list gives: [(rank, lemma, class names)]."""
    out = []
    for lemma, cls, rank in words:
        have = {m.ofl for m in core(b, lemma)}
        if not (have & cls if cls is not None else have):
            out.append((rank, lemma, '/'.join(sorted(cls)) if cls else '—'))
    return out


if __name__ == '__main__':
    # python3 pipeline/lino.py [file]         -> how the reader reads it (no BÍN needed)
    # python3 pipeline/lino.py --json [file]  -> [[lemma, [classes] or null, rank], …]
    import json
    args = [a for a in sys.argv[1:] if a != '--json']
    w = load(args[0] if args else LINO_CSV, required=True)
    if '--json' in sys.argv:
        json.dump([[l, sorted(c) if c else None, r] for l, c, r in w], sys.stdout, ensure_ascii=False)
    else:
        print(f'LÍNO-2: {len(w)} entries; first: ' + ' '.join(l for l, _c, _r in w[:12]))
