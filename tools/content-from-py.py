#!/usr/bin/env python3
"""The one-off move of the hand-written content out of Python (critique item 82).

    python3 tools/content-from-py.py OLD_DIR [KIND ...]

OLD_DIR holds sentences.py and exercises.py as they were before the move
(when every list was a Python literal), e.g. a `git show <rev>:exercises.py`.
For each KIND (setningar, villuveidar, lysingarord, fornofn, toluord,
fallstjorn, obeygjanleg, ordafordi; all when none is named) the lists are
written to content/<kind>/*.tsv, with every comment kept: the comments above
a list become the file's notes for developers, a comment inside a list stays
above the item it stood above, and a comment at the end of a sentence's line
goes to its `athugasemd` column.

It is kept in the repository for one case: a branch made before the move that
still edits exercises.py or sentences.py. Take that branch's two files, run
this on them, and the TSV files it writes are that branch's content in the
new place; then run ./build.sh, which says whether anything else changed.

Every file is read back with content_io.rows as it is written, and the run
stops unless each cell comes back as the value it was written from.
"""

import ast, io, os, re, sys, tokenize, importlib.util

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
import content_io as C

OLD = sys.argv[1] if len(sys.argv) > 1 else None
KINDS = sys.argv[2:]
if not OLD:
    sys.exit(__doc__)


def load(name):
    path = os.path.join(OLD, name + ".py")
    spec = importlib.util.spec_from_file_location("old_" + name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    src = open(path, encoding="utf-8").read()
    return m, src


class Source:
    """Comments of a module, and where each top-level list and element is."""

    def __init__(self, src):
        self.tree = ast.parse(src)
        self.lines = src.split("\n")
        self.comments = {}                    # line -> comment text (without #)
        self.trailing = set()                 # lines where the comment follows code
        for tok in tokenize.generate_tokens(io.StringIO(src).readline):
            if tok.type == tokenize.COMMENT:
                ln = tok.start[0]
                t = tok.string
                self.comments[ln] = (t[2:] if t.startswith("# ") else t[1:]).rstrip()
                if self.lines[ln - 1][:tok.start[1]].strip():
                    self.trailing.add(ln)
        self.top = [n for n in self.tree.body]
        self.used = set()                     # comment lines placed somewhere

    def take(self, lines):
        self.used.update(lines)
        return [self.comments[ln] for ln in lines]

    def node(self, name):
        for i, n in enumerate(self.top):
            if isinstance(n, ast.Assign) and any(getattr(t, "id", None) == name for t in n.targets):
                return i, n
            if isinstance(n, ast.FunctionDef) and n.name == name:
                return i, n
        raise KeyError(name)

    def notes(self, name):
        """The comment lines between the statement before NAME and NAME."""
        i, n = self.node(name)
        start = self.top[i - 1].end_lineno + 1 if i else 1
        out = []
        for ln in range(start, n.lineno):
            if ln in self.comments and ln not in self.trailing:
                out += self.take([ln])
            elif not self.lines[ln - 1].strip() and out:
                out.append("")
        # banners ("------ Fornöfn") are the old file's sections, not notes
        out = [x for x in out if not re.match(r"^-{3,}", x.strip()) and not re.match(r"^=+$", x.strip())]
        while out and not out[0].strip():
            out.pop(0)
        while out and not out[-1].strip():
            out.pop()
        return out

    def elements(self, name):
        """(first line, last line) of each element of the list/dict/tuple NAME."""
        _, n = self.node(name)
        v = n.value
        if isinstance(v, (ast.List, ast.Tuple, ast.Set)):
            return [(e.lineno, e.end_lineno) for e in v.elts], v
        if isinstance(v, ast.Dict):
            return [(k.lineno, val.end_lineno) for k, val in zip(v.keys, v.values)], v
        raise TypeError(name)

    def inner(self, name):
        """Per element: the comment lines above it inside the literal, and the
        comment at the end of its own line."""
        spans, v = self.elements(name)
        prev = v.lineno
        out = []
        for a, b in spans:
            # above the element, and on its own lines inside a multi-line element
            above = self.take([ln for ln in range(prev + 1, b + 1)
                               if ln in self.comments and ln not in self.trailing])
            trail = self.take([ln for ln in range(a, b + 1) if ln in self.trailing])
            out.append((above, trail))
            prev = b
        after = self.take([ln for ln in range(prev + 1, v.end_lineno + 1)
                           if ln in self.comments and ln not in self.trailing])
        return out, after

    def unused(self):
        return [(ln, self.comments[ln]) for ln in sorted(self.comments) if ln not in self.used]


# ---------------------------------------------------------------- cells

def cell(kind, v):
    def ok(s):
        s = str(s)
        assert "\t" not in s and "\n" not in s, s
        assert s == s.strip(), repr(s)
        return s
    if kind == "int":
        assert isinstance(v, int) and not isinstance(v, bool), v
        return str(v)
    if kind in ("text", "str"):
        assert isinstance(v, str), v
        assert kind == "str" or v, v
        return ok(v)
    if kind == "opt":
        assert v is None or (isinstance(v, str) and v), v
        return "" if v is None else ok(v)
    if kind == "bool":
        assert isinstance(v, bool), v
        return "já" if v else "nei"
    if kind == "flag":
        assert isinstance(v, bool), v
        return "já" if v else ""
    if kind == "word":
        assert isinstance(v, tuple) and all(isinstance(x, str) and "|" not in x and "," not in x for x in v), v
        return ok("|".join(v))
    if kind == "words":
        assert isinstance(v, list), v
        return ", ".join(cell("word", x) for x in v)
    if kind == "list":
        assert isinstance(v, list) and all(isinstance(x, str) and "," not in x and x != C.EMPTY for x in v), v
        return ", ".join(C.EMPTY if x == "" else ok(x) for x in v)
    if kind == "ints":
        assert isinstance(v, list) and all(type(x) is int for x in v), v
        return ", ".join(map(str, v))
    if kind == "wordopt":
        assert isinstance(v, tuple) and len(v) == 2, v
        return ok(v[0] if v[1] is None else "%s|%s" % v)
    raise ValueError(kind)


def write(rel, title, fields, columns, items, notes, after=()):
    """items: (above-comments, cells-by-column-name). Written, then read back."""
    path = os.path.join(C.ROOT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    w = max(len(n) for n, _ in columns)
    out = ["# " + title, "#"]
    out += ["# " + x if x else "#" for x in fields]
    out += ["#", "# Dálkar:"]
    out += ["#   %-*s  %s" % (w, n, d) for (n, _), d in zip(columns, [f for f in COLDOC[rel]])]
    out += ["#", "# Línur sem byrja á # eru athugasemdir; forritið les þær ekki. Dálkarnir eru",
            "# aðskildir með TAB-staf. Í README.md, kaflanum „Efnið“, stendur hvernig",
            "# breyting á skránni er prófuð og skoðuð.", "#"]
    if notes:
        out += ["# ---- Athugasemdir forritara (á ensku) / notes for developers ----", "#"]
        out += ["# " + x if x else "#" for x in notes]
        out += ["#"]
    out += ["", "\t".join(n for n, _ in columns)]
    want = []
    for above, cells in items:
        out += ["# " + x if x else "#" for x in above]
        line = "\t".join(cells[n] for n, _ in columns).rstrip("\t")
        out.append(line)
        want.append(cells)
    if after:
        out += ["# " + x if x else "#" for x in after]
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(out) + "\n")
    got = C.rows(rel, columns)
    assert len(got) == len(want), (rel, len(got), len(want))
    for g, cells in zip(got, want):
        for n, k in columns:
            assert cell(k, g[n]) == cells[n] if k != "str" or cells[n] else g[n] == "", (rel, g.line, n)
    print("  %-44s %4d" % ("content/" + rel, len(want)))


def simple(src, name, rel, title, fields, columns, to_cells, notes_from=()):
    """One element of NAME -> one line."""
    value = getattr(MOD[src][0], name)
    S = MOD[src][1]
    inner, after = S.inner(name)
    items = []
    for (above, trail), el in zip(inner, value.items() if isinstance(value, dict) else value):
        cells = to_cells(el)
        if trail:
            if "athugasemd" in cells:
                cells["athugasemd"] = " / ".join(trail)
            else:
                above = above + trail
        items.append((above, {n: cell(k, cells[n]) for n, k in columns}))
    notes = []
    for nm in tuple(notes_from) + (name,):
        n = S.notes(nm)
        if n:
            notes += ([""] if notes else []) + n
    write(rel, title, fields, columns, items, notes, after)


# ---------------------------------------------------------------- the lists

COLDOC = {}      # rel -> the Icelandic line for each column, in order

def doc(rel, *lines):
    COLDOC[rel] = lines


MOD = {}


def kind_setningar():
    MOD["s"] = (lambda m, s: (m, Source(s)))(*load("sentences"))
    rel = "setningar/setningar.tsv"
    doc(rel,
        "1–7. Þyngd 1–5 eru 8. bekkur og ráðast af lengd setningarinnar; 6 og 7 eru 9. og 10. bekkur",
        "setningin sjálf, heil og eðlileg",
        "nafnorðið (uppflettimynd) sem má skipta út fyrir annað nafnorð; autt ef ekkert",
        "hvaða nafnorð mega koma í staðinn: merkingarflokkar (noun_classes.py) aðskildir með |, eða „none“",
        "já: setningin er aldrei notuð sem eyðuverkefni (fallið fer eftir merkingu); annars autt",
        "frjáls athugasemd, forritið les hana ekki")
    simple("s", "S", rel, "Setningabankinn",
           ["Hver lína er ein setning. Greynir greinir hana þegar forritið er smíðað (./build.sh)",
            "og allar spurningar um setninguna eru lesnar úr þeirri greiningu. Ekkert málfræðilegt",
            "er skrifað hér í höndunum. Setningu sem greinist ekki, eða er of stutt fyrir þyngdina,",
            "er hafnað þegar forritið er smíðað. Reglurnar um þyngd og „þörf“ eru í sentences.py",
            "(á ensku)."],
           [("þyngd", "int"), ("setning", "text"), ("orð", "opt"), ("þörf", "opt"), ("ekki eyða", "flag"),
            ("athugasemd", "str")], nofill_cells)


def nofill_cells(e):
    assert len(e) == 4 or (len(e) == 5 and e[4] == {"nofill": True}), e
    return {"þyngd": e[0], "setning": e[1], "orð": e[2], "þörf": e[3], "ekki eyða": len(e) == 5,
            "athugasemd": ""}


def kind_villuveidar():
    rel = "villuveidar/villur.tsv"
    doc(rel,
        "3, 4 eða 5: frá hvaða þyngd spurningin er spurð",
        "RÉTTA setningin; orðið (eða orðin) sem nemandinn á að laga eru innan [hornklofa]",
        "það sem nemandinn sér í staðinn. * fremst: myndin er ekki til í BÍN (*læknirar)",
        "fyrir hvert orð innan hornklofanna: uppflettimynd|orðflokkur|BÍN-mark (flett upp í BÍN)",
        "skýringin sem nemandinn les",
        "villumynstur úr core/diagnosis.js, aðskilin með kommu; autt ef ekkert á við",
        "sögn|fall: BÍN skráir sögnina ópersónulega með frumlagi í þessu falli",
        "sögn sem BÍN má EKKI skrá með frumlagi í aukafalli (hlakka, kvíða)",
        "orð|fall: government.py segir að orðið stýri þessu falli og engu öðru",
        "önnur orð sem laga setninguna líka, aðskilin með kommu",
        "„nei“ ef Greynir getur ekki greint þessa (réttu) setningu; annars autt")
    cols = [("þyngd", "int"), ("setning", "text"), ("villa", "text"), ("orð", "words"), ("skýring", "text"),
            ("mynstur", "str"), ("ópersónuleg", "str"), ("nefnifall", "str"), ("fallstjórn", "str"),
            ("líka rétt", "list"), ("greinist", "str")]

    def to(h):
        extra = [k for k in h if k not in ("band", "t", "wrong", "spec", "why", "p")]
        assert set(extra) <= {"op", "nf", "gov", "also", "parse"}, extra
        return {"þyngd": h["band"], "setning": h["t"], "villa": h["wrong"], "orð": h["spec"],
                "skýring": h["why"], "mynstur": ",".join(h["p"]),
                "ópersónuleg": "|".join(h["op"]) if "op" in h else "",
                "nefnifall": h.get("nf", ""),
                "fallstjórn": "|".join(h["gov"]) if "gov" in h else "",
                "líka rétt": h.get("also", []),
                "greinist": {None: "", False: "nei"}[h.get("parse")]}
    simple("x", "HUNT", rel, "Villuveiðar: raunverulegar villur unglinga",
           ["Hver lína er ein setning með EINNI algengri villu. Nemandinn finnur orðið sem er",
            "rangt og skrifar það rétt. Setningin er skrifuð rétt hér. Þegar forritið er smíðað",
            "er hverju orði innan hornklofanna flett upp í BÍN, og forritið er ekki smíðað ef",
            "myndin er önnur en sú sem stendur í setningunni. Sumt er spurning um vandað mál",
            "fremur en villu; þá segir skýringin „í vönduðu máli“."],
           cols, to, notes_from=("H",))


def kind_lysingarord():
    rel = "lysingarord/nafnordahopar.tsv"
    doc(rel, "nafn hópsins (rammarnir vísa í það)", "nafnorðin í hópnum, aðskilin með kommu")
    simple("x", "ADJ_NOUN_GROUPS", rel, "Lýsingarorð: nafnorðahópar rammanna",
           ["Hópar nafnorða sem lýsingarorðarammarnir (rammar.tsv) setja lýsingarorðið með.",
            "Hvert nafnorð er eitt af hjálparnafnorðum adj_classes.py."],
           [("hópur", "text"), ("nafnorð", "list")],
           lambda kv: {"hópur": kv[0], "nafnorð": kv[1]})
    rel = "lysingarord/rammar.tsv"
    doc(rel, "1–5", "setningin; ___ er lýsingarorðið, {N} nafnorðið",
        "BÍN-mark nafnorðsins (fall, tala, greinir)",
        "stig og beyging lýsingarorðsins: FSB/FVB frumstig sterk/veik, MST miðstig, EVB efsta stig veik",
        "nafnorðahópar (nafnordahopar.tsv), aðskildir með bili")
    simple("x", "ADJ_FRAMES", rel, "Lýsingarorð: rammar",
           ["Rammar fyrir lo_beyging, lo_stig og lo_samr. Forritið setur nafnorð úr hópunum í",
            "{N} og lýsingarorð sem á við það í eyðuna; allar myndir koma úr BÍN."],
           [("þyngd", "int"), ("rammi", "text"), ("mark", "text"), ("beyging", "text"), ("hópar", "text")],
           lambda e: dict(zip(["þyngd", "rammi", "mark", "beyging", "hópar"], e)),
           notes_from=("_ANY", "_ANY_DEF", "_SEEN", "_HERE"))


def kind_fornofn():
    W = ("þyngd", "int")
    rel = "fornofn/eyda.tsv"
    doc(rel, "1–5", "setningin; ___ er eyðan", "svarið: uppflettimynd|orðflokkur|BÍN-mark",
        "skýringin sem nemandinn les")
    simple("x", "PRONOUN_GAP", rel, "Fornöfn: persónufornafn í eyðu",
           ["Persónufornafn í því falli sem sögnin eða forsetningin stýrir. Vísbendingin í",
            "svigum er nefnifall sömu tölu."],
           [W, ("setning", "text"), ("svar", "word"), ("skýring", "text")],
           lambda e: dict(zip(["þyngd", "setning", "svar", "skýring"], e)))
    rel = "fornofn/afturbeygt.tsv"
    doc(rel, "1–5", "setningin; ___ er eyðan", "línan sem segir við hvern er átt; hún ræður svarinu",
        "rétta svarið: uppflettimynd|orðflokkur|BÍN-mark", "hinn kosturinn, sem er rangur hér")
    simple("x", "REFLEXIVE", rel, "Fornöfn: afturbeygt eða ekki",
           ["Sama setningin tvisvar, með línu sem segir við hvern er átt. Línan ræður því",
            "hvort afturbeygða fornafnið (sig, sinn) eða persónufornafnið er rétt."],
           [W, ("setning", "text"), ("merking", "text"), ("svar", "word"), ("rangt", "word")],
           lambda e: dict(zip(["þyngd", "setning", "merking", "svar", "rangt"], e)))
    rel = "fornofn/eyda-frumlog.tsv"
    doc(rel, "uppflettimynd|orðflokkur|BÍN-mark frumlagsins")
    simple("x", "PRONOUN_SUBJECTS", rel, "Fornöfn: frumlög rammanna",
           ["Frumlögin sem rammarnir í eyda-sagnir.tsv og eyda-forsetningar.tsv eru sagðir með."],
           [("frumlag", "word")], lambda e: {"frumlag": e})
    rel = "fornofn/eyda-sagnir.tsv"
    doc(rel, "sögnin (nafnháttur)", "NT nútíð eða ÞT þátíð",
        "það sem kemur á eftir eyðunni, ein útgáfa fyrir hvert, aðskilið með kommu; (ekkert) = ekkert",
        "p: aðeins manneskja passar í eyðuna; pt: manneskja eða hlutur")
    simple("x", "PRONOUN_VERBS", rel, "Fornöfn: sagnir sem stýra falli fornafnsins",
           ["Hver lína verður að römmum: frumlag + sögn + ___ + framhald. Fallið er lesið úr",
            "government.py, ekki skrifað hér."],
           [("sögn", "text"), ("tíð", "text"), ("framhald", "list"), ("hver", "text")],
           lambda e: dict(zip(["sögn", "tíð", "framhald", "hver"], e)))
    rel = "fornofn/eyda-forsetningar.tsv"
    doc(rel, "forsetningin", "sögnin (nafnháttur)", "NT nútíð eða ÞT þátíð",
        "orð milli sagnar og forsetningar; autt ef ekkert",
        "það sem kemur á eftir eyðunni, aðskilið með kommu; (ekkert) = ekkert",
        "p: aðeins manneskja passar í eyðuna; pt: manneskja eða hlutur")
    simple("x", "PRONOUN_PREPS", rel, "Fornöfn: forsetningar sem stýra falli fornafnsins",
           ["Hver lína verður að römmum: frumlag + sögn + (orð) + forsetning + ___ + framhald."],
           [("forsetning", "text"), ("sögn", "text"), ("tíð", "text"), ("milli", "str"),
            ("framhald", "list"), ("hver", "text")],
           lambda e: dict(zip(["forsetning", "sögn", "tíð", "milli", "framhald", "hver"], e)))
    rel = "fornofn/afturbeygt-frumlog.tsv"
    doc(rel, "uppflettimynd|orðflokkur|BÍN-mark frumlagsins")
    simple("x", "REFLEX_SUBJECTS", rel, "Fornöfn: frumlög afturbeygðu rammanna",
           ["Frumlögin sem rammarnir í afturbeygt-sagnir.tsv og afturbeygt-eign.tsv eru sagðir með."],
           [("frumlag", "word")], lambda e: {"frumlag": e})
    rel = "fornofn/afturbeygt-sagnir.tsv"
    doc(rel, "sögnin (nafnháttur)", "fall andlagsins: ÞF eða ÞGF", "það sem kemur á eftir eyðunni",
        "já: ramminn er líka sagður með frumlagi í fleirtölu")
    simple("x", "REFLEX_OBJECT", rel, "Fornöfn: afturbeygt andlag (sig, sér)",
           ["{frumlag} {sögn} ___ {framhald}. Annað spjaldið segir að átt sé við frumlagið sjálft,",
            "hitt að átt sé við einhvern annan."],
           [("sögn", "text"), ("fall", "text"), ("framhald", "text"), ("fleirtala", "bool")],
           lambda e: dict(zip(["sögn", "fall", "framhald", "fleirtala"], e)))
    rel = "fornofn/afturbeygt-eign.tsv"
    doc(rel, "sögnin (nafnháttur)", "fall hlutarins: ÞF eða ÞGF", "hlutirnir, aðskildir með kommu")
    simple("x", "REFLEX_POSSESSIVE", rel, "Fornöfn: eignarfornafn, sinn eða hans/hennar",
           ["{frumlag} {sögn} {hluturinn} ___. Línan segir hver á hlutinn."],
           [("sögn", "text"), ("fall", "text"), ("hlutir", "list")],
           lambda e: dict(zip(["sögn", "fall", "hlutir"], e)))


def kind_toluord():
    rel = "toluord/samraemi.tsv"
    doc(rel, "1–5", "setningin; ___ er töluorðið, {N} nafnorðið", "fall nafnorðsins: NF, ÞF, ÞGF eða EF",
        "hvaða tölur má spyrja um (1 tekur eintölu)", "nafnorðin, aðskilin með kommu")
    simple("x", "NUMERAL_AGREE", rel, "Töluorð: einn til fjórir með nafnorði",
           ["Frumtala 1–4 sem samræmist nafnorðinu. Nafnorðið fer í fallið og töluna úr BÍN;",
            "töluorðið tekur kyn nafnorðsins."],
           [("þyngd", "int"), ("rammi", "text"), ("fall", "text"), ("tölur", "ints"), ("nafnorð", "list")],
           lambda e: dict(zip(["þyngd", "rammi", "fall", "tölur", "nafnorð"], e)))
    rel = "toluord/rammar.tsv"
    doc(rel, "1–5", "setningin; ___ er töluorðið, {N} nafnorðið", "fall nafnorðsins",
        "hvaða tölur má spyrja um", "nafnorðin, aðskilin með kommu — EÐA autt og þá:",
        "merkingarflokkar (noun_classes.py), aðskildir með bili; algengustu nafnorð flokkanna eru tekin",
        "nafnorð úr flokkunum sem ramminn tekur ekki")

    def to(e):
        lvl, t, case, ns, spec, *skip = e
        return {"þyngd": lvl, "rammi": t, "fall": case, "tölur": ns,
                "nafnorð": spec if isinstance(spec, list) else [],
                "flokkar": spec if isinstance(spec, str) else "",
                "sleppa": skip[0] if skip else []}
    simple("x", "NUMERAL_FRAMES", rel, "Töluorð: rammar með nafnorðum eftir merkingu",
           ["Eins og samraemi.tsv, en nafnorðin má velja eftir merkingarflokki."],
           [("þyngd", "int"), ("rammi", "text"), ("fall", "text"), ("tölur", "ints"), ("nafnorð", "list"),
            ("flokkar", "str"), ("sleppa", "list")], to,
           notes_from=("NUMERAL_TAKE", "_NUMERAL_SKIP", "_CLOSE", "_CHILDREN"))
    rel = "toluord/fleirtoluord.tsv"
    doc(rel, *COLDOC["toluord/samraemi.tsv"])
    simple("x", "NUMERAL_PLURAL_ONLY", rel, "Töluorð: einir, tvennir, þrennir, fernir",
           ["Fleirtöluorð (buxur, skæri, jól) taka töluorðin einir, tvennir, þrennir, fernir."],
           [("þyngd", "int"), ("rammi", "text"), ("fall", "text"), ("tölur", "ints"), ("nafnorð", "list")],
           lambda e: dict(zip(["þyngd", "rammi", "fall", "tölur", "nafnorð"], e)),
           notes_from=("PLURAL_ONLY_NOUNS",))
    rel = "toluord/fleirtoluord-hopar.tsv"
    doc(rel, "nafn hópsins (fleirtoluord-rammar.tsv vísar í það)", "fleirtöluorðin, aðskilin með kommu")
    simple("x", "PLURAL_ONLY_GROUPS", rel, "Töluorð: hópar fleirtöluorða",
           ["Hvert orð hér er aðeins til í fleirtölu í BÍN (annars er forritið ekki smíðað)."],
           [("hópur", "text"), ("nafnorð", "list")], lambda kv: {"hópur": kv[0], "nafnorð": kv[1]})
    rel = "toluord/fleirtoluord-rammar.tsv"
    doc(rel, "1–5", "setningin; ___ er töluorðið, {N} nafnorðið", "fall nafnorðsins",
        "hvaða tölur má spyrja um", "hópar úr fleirtoluord-hopar.tsv, aðskildir með bili")
    simple("x", "PLURAL_ONLY_FRAMES", rel, "Töluorð: rammar fyrir fleirtöluorð",
           ["Rammar skrifaðir fyrir það sem fleirtöluorðin merkja."],
           [("þyngd", "int"), ("rammi", "text"), ("fall", "text"), ("tölur", "ints"), ("hópar", "text")],
           lambda e: dict(zip(["þyngd", "rammi", "fall", "tölur", "hópar"], e)))
    rel = "toluord/dagsetningar.tsv"
    doc(rel, "1–5", "setningin; ___ er raðtalan, {M} mánuðurinn", "fall dagsetningarinnar",
        "skýringin sem nemandinn les")
    simple("x", "DATE_FRAMES", rel, "Töluorð: dagsetningar",
           ["Í hvaða falli dagsetningin stendur, og af hverju."],
           [("þyngd", "int"), ("rammi", "text"), ("fall", "text"), ("skýring", "text")],
           lambda e: dict(zip(["þyngd", "rammi", "fall", "skýring"], e)))


VC_NAMES = {"VC_FAMILY": "fjölskylda", "VC_OTHERS": "aðrir", "VC_PEOPLE": "fólk", "VC_ANIMALS": "dýr",
            "VC_PETS": "gæludýr", "VC_VISITED": "heimsótt", "VC_THINGS": "hlutir", "VC_STOLEN": "stolið",
            "VC_THROWN": "kastað", "VC_SHUT": "lokað", "VC_RUBBISH": "rusl", "VC_PUSHED": "ýtt",
            "VC_AWAITED": "beðið", "VC_FETCHED": "sótt"}


def kind_fallstjorn():
    X, S = MOD["x"]
    rel = "fallstjorn/hreyfing.tsv"
    doc(rel, "1–5", "setningin; ___ er nafnorðið", "nafnorðið (uppflettimynd)",
        "tala og greinir nafnorðsins (ETgr: eintala með greini)",
        "já: hreyfing (þolfall); nei: kyrrstaða (þágufall)")
    simple("x", "MOTION_REST", rel, "Fallstjórn: hreyfing eða kyrrstaða",
           ["Þolfall (hreyfing) eða þágufall (kyrrstaða) á eftir í, á, undir, yfir. Hver setning",
            "verður að hafa EITT rétt svar."],
           [("þyngd", "int"), ("setning", "text"), ("nafnorð", "text"), ("dálkur", "text"), ("hreyfing", "bool")],
           lambda e: dict(zip(["þyngd", "setning", "nafnorð", "dálkur", "hreyfing"], e)))

    rel = "fallstjorn/hreyfing-sett.tsv"
    doc(rel, "númer settsins; línur með sama númeri eiga saman", "forsetningin", "tala og greinir nafnorðsins",
        "hreyfing, kyrrstaða eða nafnorð",
        "setning (___ er nafnorðið), eða nafnorð settsins aðskilin með kommu")
    cols = [("sett", "int"), ("forsetning", "text"), ("dálkur", "text"), ("gerð", "text"), ("texti", "text")]
    inner, after = S.inner("MOTION_SETS")
    items = []
    for k, ((above, trail), (prep, col, goes, stays, nouns)) in enumerate(zip(inner, X.MOTION_SETS), 1):
        rows_ = [("hreyfing", t) for t in goes] + [("kyrrstaða", t) for t in stays] + \
                [("nafnorð", cell("list", nouns))]
        for j, (g, t) in enumerate(rows_):
            items.append((above + trail if j == 0 else [],
                          {"sett": str(k), "forsetning": prep, "dálkur": col, "gerð": g, "texti": t}))
    write(rel, "Fallstjórn: hreyfing og kyrrstaða í settum",
          ["Ein forsetning, setningar um hreyfingu, setningar um kyrrstöðu og nafnorð sem passa",
           "í þær allar. Hver hreyfingarsetning × hver kyrrstöðusetning × hvert nafnorð er eitt par."],
          cols, items, S.notes("MOTION_SETS"), after)

    rel = "fallstjorn/sagnir.tsv"
    doc(rel, "1–5", "setningin; ___ er nafnorðið", "sögnin (nafnháttur)", "fallið sem sögnin stýrir",
        "tala og greinir nafnorðsins", "nafnorðin, aðskilin með kommu")
    simple("x", "VERB_CASE", rel, "Fallstjórn: sögn sem stýrir falli",
           ["Aðeins setningar þar sem SÖGNIN ræður fallinu, ekki forsetning."],
           [("þyngd", "int"), ("setning", "text"), ("sögn", "text"), ("fall", "text"), ("dálkur", "text"),
            ("nafnorð", "list")],
           lambda e: dict(zip(["þyngd", "setning", "sögn", "fall", "dálkur", "nafnorð"], e)))

    rel = "fallstjorn/sagnir-hopar.tsv"
    doc(rel, "nafn hópsins (sagnir-rammar.tsv vísar í það)",
        "nafnorðin: uppflettimynd|tala og greinir, aðskilin með kommu")
    items = []
    for name, ice in VC_NAMES.items():
        _, node = S.node(name)
        i = S.top.index(node)
        above = S.notes(name) if name != "VC_FAMILY" else []   # VC_FAMILY's notes are VERB_FRAMES'
        items.append((above, {"hópur": ice, "nafnorð": cell("words", getattr(X, name))}))
    write(rel, "Fallstjórn: nafnorðahópar sagnarammanna",
          ["Hópar nafnorða sem rammarnir í sagnir-rammar.tsv eru spurðir með. Hópur er valinn",
           "svo að hvert nafnorð passi við sögnina (*Ég kvaddi ömmu*, ekki *Ég vakti lögreglumanninn*)."],
          [("hópur", "text"), ("nafnorð", "words")], items, [])

    rel = "fallstjorn/sagnir-rammar.tsv"
    doc(rel, "0 eða 1: einu stigi þyngra (sögn sem er ekki hversdagsleg eða villir á sér heimildir)",
        "setningin; ___ er nafnorðið", "sögnin (nafnháttur)", "fallið sem sögnin stýrir",
        "nafnorðahópur úr sagnir-hopar.tsv; fleiri tengdir með +")
    _, node = S.node("VERB_FRAMES")

    def gname(n):
        if isinstance(n, ast.Name):
            return VC_NAMES[n.id]
        assert isinstance(n, ast.BinOp) and isinstance(n.op, ast.Add)
        return gname(n.left) + " + " + gname(n.right)
    groups = [gname(e.elts[4]) for e in node.value.elts]
    it = iter(groups)
    simple("x", "VERB_FRAMES", rel, "Fallstjórn: sagnarammar",
           ["Sama spurning og í sagnir.tsv, en hver rammi er spurður með hverju nafnorði hópsins."],
           [("bónus", "int"), ("setning", "text"), ("sögn", "text"), ("fall", "text"), ("hópur", "text")],
           lambda e: {"bónus": e[0], "setning": e[1], "sögn": e[2], "fall": e[3], "hópur": next(it)},
           notes_from=("VC_FAMILY",))

    rel = "fallstjorn/opersonulegar.tsv"
    doc(rel, "0 eða 1: einu stigi þyngra", "sögnin (nafnháttur)",
        "op: fallið sem BÍN gefur; ÞGF: skrifað hér (mér er kalt); NF: gildra, sögnin er persónuleg",
        "setningin í nútíð; ___ er frumlagið og {V} sögnin; autt ef nútíð er ekki eðlileg",
        "sama í þátíð; autt ef þátíð er ekki eðlileg")
    simple("x", "IMPERSONAL_FRAMES", rel, "Fallstjórn: ópersónulegar sagnir",
           ["Hver rammi er spurður með hverju frumlagi í opersonulegar-frumlog.tsv, í hverri tíð",
            "sem hann er skrifaður fyrir. Ramminn verður að vera réttur með HVAÐA frumlagi sem er."],
           [("bónus", "int"), ("sögn", "text"), ("fall", "text"), ("nútíð", "opt"), ("þátíð", "opt")],
           lambda e: dict(zip(["bónus", "sögn", "fall", "nútíð", "þátíð"], e)))

    rel = "fallstjorn/opersonulegar-frumlog.tsv"
    doc(rel, "uppflettimynd|orðflokkur|tala og greinir", "0, 1 eða 2: hversu miklu þyngra frumlagið gerir spurninguna")
    simple("x", "IMPERSONAL_SUBJECTS", rel, "Fallstjórn: frumlög ópersónulegra sagna",
           ["Persónufornöfn eins og BÍN skráir þau (við = ég í fleirtölu …)."],
           [("frumlag", "word"), ("bónus", "int")],
           lambda e: {"frumlag": e[:3], "bónus": e[3]})


def kind_obeygjanleg():
    X, S = MOD["x"]
    rel = "obeygjanleg/fs-ao.tsv"
    doc(rel, "1–5", "setningin", "orðið sem spurt er um", "fs: forsetning; ao: atviksorð")
    simple("x", "ADV_OR_PREP", rel, "Óbeygjanleg orð: forsetning eða atviksorð",
           ["Sama orðið með og án orðs sem það stýrir."],
           [("þyngd", "int"), ("setning", "text"), ("orð", "text"), ("flokkur", "text")],
           lambda e: dict(zip(["þyngd", "setning", "orð", "flokkur"], e)))

    rel = "obeygjanleg/fs-ao-rammar.tsv"
    doc(rel, "orðið; línur með sama orði eiga saman", "forsetning eða atviksorð",
        "setningin (forsetning: ___ er nafnorðið sem orðið stýrir)", "fallið sem forsetningin stýrir; autt fyrir atviksorð",
        "nafnorðin: uppflettimynd|tala og greinir, aðskilin með kommu; autt fyrir atviksorð")
    cols = [("orð", "text"), ("gerð", "text"), ("setning", "text"), ("fall", "str"), ("nafnorð", "words")]
    inner, after = S.inner("ADV_PREP_FRAMES")
    items = []
    for (above, trail), (w, preps, advs) in zip(inner, X.ADV_PREP_FRAMES):
        rs = [{"orð": w, "gerð": "forsetning", "setning": t, "fall": case, "nafnorð": cell("words", nouns)}
              for t, case, nouns in preps]
        rs += [{"orð": w, "gerð": "atviksorð", "setning": t, "fall": "", "nafnorð": ""} for t in advs]
        for j, r in enumerate(rs):
            items.append((above + trail if j == 0 else [], r))
    write(rel, "Óbeygjanleg orð: forsetning eða atviksorð, rammar",
          ["Hver forsetningarsetning orðsins er pöruð við hverja atviksorðssetningu þess."],
          cols, items, S.notes("ADV_PREP_FRAMES"), after)

    rel = "obeygjanleg/samtengingar.tsv"
    doc(rel, "1–5", "setningin; ___ er samtengingin", "rétta samtengingin",
        "röngu kostirnir þrír, aðskildir með kommu", "skýringin sem nemandinn les")
    simple("x", "CONJUNCTION", rel, "Óbeygjanleg orð: veldu samtenginguna",
           ["Hver rangur kostur er samtenging sem nemandi gæti í alvöru gripið til, og er rangur",
            "af ástæðu sem skýringin getur nefnt. Hver setning hefur EITT rétt svar."],
           [("þyngd", "int"), ("setning", "text"), ("svar", "text"), ("rangt", "list"), ("skýring", "text")],
           lambda e: dict(zip(["þyngd", "setning", "svar", "rangt", "skýring"], e)))

    rel = "obeygjanleg/samtengingar-samanburdur.tsv"
    doc(rel, "lýsingarorðið (í frumstigi); línur með sama orði eiga saman",
        "það sem er t.d. eldra: uppflettimynd|tala og greinir, eða persónufornafn eitt sér",
        "það sem borið er saman við, eins")
    cols = [("lýsingarorð", "text"), ("fyrra", "wordopt"), ("seinna", "wordopt")]
    inner, after = S.inner("CONJ_COMPARE")
    items = []
    for (above, trail), (adj, pairs) in zip(inner, X.CONJ_COMPARE):
        for j, (a, b) in enumerate(pairs):
            items.append((above + trail if j == 0 else [],
                          {"lýsingarorð": adj, "fyrra": cell("wordopt", a), "seinna": cell("wordopt", b)}))
    write(rel, "Óbeygjanleg orð: en á eftir miðstigi",
          ["Raunverulegur samanburður: aðeins *en* getur fylgt miðstiginu."],
          cols, items, S.notes("CONJ_COMPARE"), after)

    rel = "obeygjanleg/samtengingar-por.tsv"
    doc(rel, "fyrra nafnið", "seinna nafnið")
    simple("x", "CONJ_PAIRS", rel, "Óbeygjanleg orð: pör í bæði … og, hvorki … né, annaðhvort … eða",
           ["Pörin sem sett eru í {A} og {B} í samtengingar-rammar.tsv."],
           [("fyrra", "text"), ("seinna", "text")], lambda e: {"fyrra": e[0], "seinna": e[1]})

    rel = "obeygjanleg/samtengingar-rammar.tsv"
    doc(rel, "bæði, hvorki, annaðhvort, sem, að, hvort-rammi eða hvort-setning",
        "ramminn (___ er samtengingin, {A} og {B} parið, {C} hvort-setning) eða hvort-setningin sjálf")
    cols = [("listi", "text"), ("texti", "text")]
    items = []
    parts = [("CONJ_BOTH", "bæði", X.CONJ_BOTH), ("CONJ_NEITHER", "hvorki", X.CONJ_NEITHER),
             ("CONJ_EITHER", "annaðhvort", X.CONJ_EITHER), ("CONJ_WHETHER", "hvort-rammi", X.CONJ_WHETHER[0]),
             ("", "hvort-setning", X.CONJ_WHETHER[1]), ("CONJ_RELATIVE", "sem", X.CONJ_RELATIVE),
             ("CONJ_SAID", "að", X.CONJ_SAID)]
    notes = []
    for nm, key, seq in parts:
        n = S.notes(nm) if nm else []
        for j, t in enumerate(seq):
            items.append((n if j == 0 else [], {"listi": key, "texti": t}))
    write(rel, "Óbeygjanleg orð: rammar samtenginga",
          ["Rammar þar sem málfræðin skilur aðeins eftir einn kost."], cols, items, notes)

    rel = "obeygjanleg/samtengingar-orsok.tsv"
    doc(rel, "orsökin", "afleiðingin")
    simple("x", "CONJ_CAUSE", rel, "Óbeygjanleg orð: af því að og svo að",
           ["„{afleiðing} af því að {orsök}“ og „{orsök} svo að {afleiðing}“. Aðeins pör þar sem",
            "hið öfuga er fráleitt."],
           [("orsök", "text"), ("afleiðing", "text")], lambda e: {"orsök": e[0], "afleiðing": e[1]})

    rel = "obeygjanleg/samtengingar-rod.tsv"
    doc(rel, "það sem gerðist fyrst (í „… áður en …“)", "það sem gerðist svo (í „… áður en …“)",
        "það sem gerðist svo (í „… eftir að …“)", "það sem gerðist fyrst (í „… eftir að …“)")
    simple("x", "CONJ_ORDER", rel, "Óbeygjanleg orð: áður en og eftir að",
           ["„{fyrst} áður en {svo}“ og „{svo 2} eftir að {fyrst 2}“: skrifað tvisvar svo að",
            "fornafn komi aldrei á undan nafnorðinu sínu."],
           [("fyrst", "text"), ("svo", "text"), ("svo 2", "text"), ("fyrst 2", "text")],
           lambda e: dict(zip(["fyrst", "svo", "svo 2", "fyrst 2"], e)))


def kind_ordafordi():
    X, S = MOD["x"]
    rel = "ordafordi/samheiti.tsv"
    doc(rel, "lo, no, so eða ao", "orð sem merkja það sama, aðskilin með kommu")
    cols = [("orðflokkur", "text"), ("orð", "list")]
    items = []
    inner, _ = S.inner("SYNONYMS")
    for ((above, trail), (k, v)) in zip(inner, X.SYNONYMS.items()):
        for j, g in enumerate(v):
            items.append((above + trail if j == 0 else [], {"orðflokkur": k, "orð": cell("list", g)}))
    write(rel, "Orðaforði: samheiti",
          ["Hópar, ekki pör: öll orð í hópi merkja það sama. Rangur kostur er aldrei tekinn úr",
           "sama hópi."], cols, items, S.notes("SYNONYMS"))

    rel = "ordafordi/andheiti.tsv"
    doc(rel, "lo, no, so eða ao", "orðið", "andheiti þess")
    cols = [("orðflokkur", "text"), ("orð", "text"), ("andheiti", "text")]
    inner, _ = S.inner("ANTONYMS")
    items = [(above + trail if j == 0 else [], {"orðflokkur": k, "orð": a, "andheiti": b})
             for (above, trail), (k, v) in zip(inner, X.ANTONYMS.items()) for j, (a, b) in enumerate(v)]
    write(rel, "Orðaforði: andheiti",
          ["Orð getur átt fleiri en eitt andheiti (gamall: ungur, nýr); þau eru öll höfð utan",
           "við röngu kostina."], cols, items, S.notes("ANTONYMS"))

    rel = "ordafordi/samhengi.tsv"
    doc(rel, "1–5", "setningin; ___ er nafnorðið", "BÍN-mark allra kostanna", "rétta nafnorðið",
        "röngu nafnorðin þrjú, aðskilin með kommu")
    simple("x", "WORD_IN_CONTEXT", rel, "Orðaforði: orð í samhengi",
           ["Aðeins einn kosturinn passar við merkingu setningarinnar. Allir kostirnir eru",
            "nafnorð í sama BÍN-marki svo að málfræðin gefi svarið ekki upp."],
           [("þyngd", "int"), ("setning", "text"), ("mark", "text"), ("svar", "text"), ("rangt", "list")],
           lambda e: dict(zip(["þyngd", "setning", "mark", "svar", "rangt"], e)))

    rel = "ordafordi/samhengi-rammar.tsv"
    doc(rel, "0 eða 1: einu stigi þyngra (vísbending sem er ekki hversdagslegt orð)",
        "setningin; ___ er nafnorðið", "BÍN-mark nafnorðanna",
        "nafnorð sem passa, aðskilin með kommu", "nafnorð sem geta ALDREI passað, aðskilin með kommu")
    simple("x", "WORD_IN_CONTEXT_FRAMES", rel, "Orðaforði: orð í samhengi, rammar",
           ["Hvert nafnorð sem passar verður að spurningu, með þremur sem passa ekki sem röngum",
            "kostum. Prófið á röngu orði er „ómögulegt“, ekki „óvenjulegt“."],
           [("bónus", "int"), ("setning", "text"), ("mark", "text"), ("passar", "list"), ("passar ekki", "list")],
           lambda e: dict(zip(["bónus", "setning", "mark", "passar", "passar ekki"], e)))


KINDS_ALL = ["setningar", "villuveidar", "lysingarord", "fornofn", "toluord", "fallstjorn",
             "obeygjanleg", "ordafordi"]
MOD["x"] = (lambda m, s: (m, Source(s)))(*load("exercises"))
for k in KINDS or KINDS_ALL:
    print(k)
    globals()["kind_" + k]()
# Every comment of the old files should have found a place; list those that
# did not (the lists kept in Python keep their comments there).
for key, (_, S) in MOD.items():
    left = S.unused()
    if left:
        print("comments not carried over from", "sentences.py" if key == "s" else "exercises.py")
        for ln, c in left:
            print("  %5d  %s" % (ln, c[:90]))
