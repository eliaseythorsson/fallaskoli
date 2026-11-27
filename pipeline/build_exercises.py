"""content/*/*.tsv, read by exercises.py -> data/exercises.js, every form out of BÍN.

(The header comment of data/exercises.js still says "from exercises.py": it
is part of the output, which did not change by a byte when the items moved
to content/ in critique item 82.)

What this build guarantees, item by item:
  * every answer, option and cue is a BÍN form of the lemma, class and mark
    written in exercises.py (core vocabulary, standard form — the same filter
    as build_lexicon.py), with BÍN's double forms kept as alternatives;
  * every other word in every sentence is a word BÍN knows;
  * the claims the items make about word classes (an adverb, a preposition,
    a conjunction) are classes BÍN gives that word;
  * every item carries a level, þyngd 1-5 (exercises.py LEVELS), passed
    on as `lvl` for the builders to choose by;
  * an item that fails any of this stops the build, and says why.
Nothing in data/exercises.js is typed by hand except the sentences around
the blanks and the short explanations.
"""
import json, re, sys, itertools, collections
from islenska import Bin
import exercises as X
import government as GOV
import noun_classes as NC

b = Bin()
ERR = []
def fail(msg): ERR.append(msg)

def _entries(lemma):
    """Every BÍN entry whose lemma is `lemma`: lookup_lemmas misses lemmas
    whose dictionary form is not a singular (tveir, buxur), so the form is
    looked up too and filtered on the lemma."""
    _, a = b.lookup_lemmas(lemma)
    _, c = b.lookup(lemma)
    return [e for e in list(a) + list(c) if e.ord == lemma]

_cache = {}
def paradigm(lemma, ofl):
    """{mark: [forms]} for one lemma, core standard forms only."""
    key = (lemma, ofl)
    if key in _cache: return _cache[key]
    ids = sorted({e.bin_id for e in _entries(lemma) if e.ofl == ofl and e.ord == lemma})
    best = {}
    for bid in ids:
        ent = [e for e in b.lookup_id(bid) if e.birting == 'K' and e.einkunn == 1
               and e.beinkunn == 1 and not e.malsnid and not e.bmalsnid]
        ent.sort(key=lambda e: (e.mark, e.bmynd))
        forms = collections.defaultdict(list)
        for e in ent:
            # BÍN numbers a second form of a cell (NFET2); a verb's person is a
            # digit too (GM-FH-ÞT-3P-ET), and must stay.
            m = re.sub(r'\d+$', '', e.mark)
            if e.bmynd not in forms[m]: forms[m].append(e.bmynd)
        if len(forms) > len(best): best = dict(forms)
    _cache[key] = best
    if not best: fail(f"BÍN has no {ofl} '{lemma}' in the core vocabulary")
    return best

def form(lemma, ofl, mark, where=""):
    lemma = lemma.split(":")[0]
    p = paradigm(lemma, ofl)
    f = p.get(mark)
    if not f:
        fail(f"{where}: BÍN has no {mark} of {ofl} '{lemma}'")
        return ["?"]
    return f

def noun_gender(lemma, where=""):
    """`lemma` or `lemma:gender` where BÍN has the word in two genders."""
    if ":" in lemma:
        return lemma.split(":")[1]
    g = sorted({e.ofl for e in _entries(lemma) if e.ofl in ('kk', 'kvk', 'hk')})
    if len(g) != 1:
        fail(f"{where}: noun '{lemma}' has gender {g or 'none'} in BÍN — need exactly one")
        return None
    return g[0]

def classes_of(word):
    _, ms = b.lookup(word)
    out = {e.ofl for e in ms}
    if not out:
        _, ms = b.lookup(word.lower())
        out = {e.ofl for e in ms}
    return out

WORD = re.compile(r"[A-Za-zÁÉÍÓÚÝÞÆÖÐáéíóúýþæöð]+")
def check_words(text, where):
    for w in WORD.findall(text):
        if not classes_of(w):
            fail(f"{where}: '{w}' is not a word BÍN knows ({text})")

PH = re.compile(r"\{([^|{}]+)\|([^|{}]+)\|([^|{}]+)\}")
def resolve(text, where):
    def sub(m):
        return form(m.group(1), m.group(2), m.group(3), where)[0]
    return PH.sub(sub, text)

def nf_cue(lemma, ofl, mark):
    num = 'FT' if mark.endswith('FT') else 'ET'
    return form(lemma, ofl, 'NF' + num, "cue")[0]

def level(lvl, where):
    """Every hand-written item carries its level, þyngd 1-5 (exercises.py,
    LEVELS): the builders choose by it, so a missing or odd one is an error."""
    if not (isinstance(lvl, int) and 1 <= lvl <= 5):
        fail(f"{where}: level must be a whole number 1-5, not {lvl!r}")

PARA = {}
def keep(lemma, ofl):
    lemma = lemma.split(":")[0]
    PARA[f"{lemma}|{ofl}"] = paradigm(lemma, ofl)

out = {"v": 1}

# ---------------------------------------------------------------- Fornöfn
items = []
for lvl, t, (l, c, m), why in X.PRONOUN_GAP:
    where = f"PRONOUN_GAP {t}"
    level(lvl, where)
    t2 = resolve(t, where)
    a = form(l, c, m, where)
    check_words(t2.replace("___", a[0]), where)
    keep(l, c)
    items.append({"t": t2, "l": l, "c": c, "m": m, "a": a, "cue": nf_cue(l, c, m), "why": why, "lvl": lvl})
out["pronounGap"] = items

items = []
for lvl, t, gloss, (l1, c1, m1), (l2, c2, m2) in X.REFLEXIVE:
    where = f"REFLEXIVE {t} / {gloss}"
    level(lvl, where)
    a = form(l1, c1, m1, where); w = form(l2, c2, m2, where)
    if set(a) & set(w): fail(f"{where}: the two options share a form")
    check_words(t.replace("___", a[0]) + " " + gloss, where)
    items.append({"t": t, "gloss": gloss, "a": a[0], "w": w[0],
                  "reflexive": c1 in ("afn",) or l1 == "sinn", "lvl": lvl})
out["reflexive"] = items

# ---------------------------------------------------------------- generated
# v6.13 (critique item 23): frames × BÍN. Every word of every sentence below
# is a BÍN form looked up here, and every sentence is checked word by word.

def sentence_level(text):
    """exercises.py LEVELS and sentences.py's table: the words of the
    sentence, the blank ___ one word and a verb slot {V} one word; 1–5.

    Until the review of v6.13 (S11) this was two functions: 23a's
    `length_level` split on spaces and 23b's `frame_level` counted words with
    WORD, kept apart so that neither half of item 23 moved the other's levels.
    On every sentence the build gives them (992 calls) the two counts gave the
    same level, and data/exercises.js was byte-identical with one function.
    WORD is kept: a dash or a lone comma between spaces is not a word."""
    n = len(WORD.findall(text.replace("___", "X").replace("{V}", "X")))
    return 1 if n <= 5 else 2 if n <= 7 else 3 if n <= 9 else 4 if n <= 11 else 5

def cap1(w):
    return w[:1].upper() + w[1:]

CASE_UP = {"nf": "NF", "þf": "ÞF", "þgf": "ÞGF", "ef": "EF"}
CASE_WORD = {"ÞF": "þolfalli", "ÞGF": "þágufalli", "EF": "eignarfalli"}

def one_case(table, lemma, where):
    """The one case government.py gives this word — or a failure: a verb or
    preposition with two cases cannot be asked about without its meaning."""
    cases = table.get(lemma)
    if not cases or len(cases) != 1:
        fail(f"{where}: government.py gives '{lemma}' {sorted(cases) if cases else 'no case'}; one is needed")
        return None
    return CASE_UP[next(iter(cases))]

def sentence(*words):
    t = " ".join(w for w in words if w)
    return t[:1].upper() + t[1:] + "."

# fn_eyda: grouped by frame, one sentence per subject
PRONOUN_LEMMAS = ["ég", "þú", "hann", "hún", "það"]
for l in PRONOUN_LEMMAS: keep(l, "pfn")
def pronoun_subject(l, c, m, where):
    f = form(l, c, m, where)[0]
    num = "FT" if "FT" in m else "ET"
    person = (1 if l == "ég" else 2 if l == "þú" else 3) if c == "pfn" else 3
    return f, person, num, (l if c == "pfn" else "")

frames = []
def pronoun_frame(gov, case, who, why, parts, where):
    """parts(subject form, person, number) -> the words of the sentence."""
    group = None
    for sl, sc, sm in X.PRONOUN_SUBJECTS:
        sf, p, n, pl = pronoun_subject(sl, sc, sm, where)
        t = sentence(*parts(sf, p, n))
        check_words(t.replace("___", ""), where)
        if group is None:
            group = {"g": gov, "case": case, "who": who, "why": why, "lvl": sentence_level(t), "s": []}
        group["s"].append([t, p, n, pl])
    frames.append(group)

for verb, tense, tails, who in X.PRONOUN_VERBS:
    where = f"PRONOUN_VERBS {verb}"
    case = one_case(GOV.VERB_CASES, verb, where)
    if not case: continue
    for tail in tails:
        pronoun_frame(verb, case, who, f"*{verb}* stýrir {CASE_WORD[case]}.",
                      lambda sf, p, n: [sf, form(verb, "so", f"GM-FH-{tense}-{p}P-{n}", where)[0], "___", tail],
                      f"{where} {tail}")
for prep, verb, tense, between, tails, who in X.PRONOUN_PREPS:
    where = f"PRONOUN_PREPS {prep} {verb}"
    case = one_case(GOV.PREP_CASES, prep, where)
    if not case: continue
    for tail in tails:
        pronoun_frame(prep, case, who, f"*{prep}* stýrir {CASE_WORD[case]}.",
                      lambda sf, p, n: [sf, form(verb, "so", f"GM-FH-{tense}-{p}P-{n}", where)[0],
                                        between, prep, "___", tail],
                      f"{where} {tail}")
out["pronounFrames"] = frames

# fn_aftur: pairs. Somebody else of the subject's gender and number, and the
# subject's own personal pronoun (hann, hún; þeir, þær).
GENDER_OF = {"hann": "kk", "hún": "kvk"}
PRONOUN_OF_GENDER = {"kk": "hann", "kvk": "hún"}
KYN = {"kk": "KK", "kvk": "KVK", "hk": "HK"}
keep("sinn", "fn")
def reflex_subject(l, c, m, where):
    f = form(l, c, m, where)[0]
    g = GENDER_OF[l] if c == "pfn" else c
    return f, g, ("FT" if "FT" in m else "ET")
def other_np(g, n, case, where):
    noun, adj = X.REFLEX_OTHER[g]
    return (form(adj, "fn", f"{KYN[g]}-{case}{n}", where)[0] + " " +
            form(noun, g, f"{case}{n}", where)[0])
def sjalf(g, n, case, where):
    return form("sjálfur", "fn", f"{KYN[g]}-{case}{n}", where)[0]

# REFLEXIVE's own items stop at 4, and so do these: the few that would be 5
# (a plural subject AND a dative possessive) are too few to make þyngd 5 a
# step of its own.
REFLEX_TOP = 4
pairs = []
def add_pair(t, r, nr, gs, go, lvl, where):
    if r == nr: fail(f"{where}: both readings have the same form '{r}'")
    for x in (t.replace("___", r), gs, go): check_words(x, where)
    level(lvl, where)
    pairs.append({"t": t, "r": r, "nr": nr, "gs": gs, "go": go, "lvl": lvl})

for verb, case, tail, plural_ok in X.REFLEX_OBJECT:
    for sl, sc, sm in X.REFLEX_SUBJECTS:
        where = f"REFLEX_OBJECT {verb} {tail} / {sl} {sm}"
        sf, g, n = reflex_subject(sl, sc, sm, where)
        if n == "FT" and not plural_ok: continue
        vf = form(verb, "so", f"GM-FH-ÞT-3P-{n}", where)[0]
        r = form("sig", "afn", case, where)[0]
        nr = form(PRONOUN_OF_GENDER[g], "pfn", f"{case}{n}", where)[0]
        t = sentence(sf, vf, "___", tail)
        gs = sentence(sf, vf, sjalf(g, n, case, where), r, tail)
        go = sentence(sf, vf, other_np(g, n, case, where), tail)
        lvl = min(REFLEX_TOP, sentence_level(t) + 1 + (n == "FT") + (case == "ÞGF"))
        add_pair(t, r, nr, gs, go, lvl, where)

k = 0
for verb, case, things in X.REFLEX_POSSESSIVE:
    for thing in things:
        tg = noun_gender(thing, f"REFLEX_POSSESSIVE {thing}")
        for j in range(3):
            sl, sc, sm = X.REFLEX_SUBJECTS[(3 * k + j) % len(X.REFLEX_SUBJECTS)]
            where = f"REFLEX_POSSESSIVE {verb} {thing} / {sl} {sm}"
            sf, g, n = reflex_subject(sl, sc, sm, where)
            vf = form(verb, "so", f"GM-FH-ÞT-3P-{n}", where)[0]
            owns = form("eiga", "so", f"GM-FH-NT-3P-{n}", where)[0]
            the = form(thing, tg, f"{case}{n}gr", where)[0]
            the_acc = form(thing, tg, f"ÞF{n}gr", where)[0]
            r = form("sinn", "fn", f"{KYN[tg]}-{case}{n}", where)[0]
            nr = form(PRONOUN_OF_GENDER[g], "pfn", f"EF{n}", where)[0]
            t = sentence(sf, vf, the, "___")
            gs = sentence(sf, owns, the_acc, sjalf(g, n, "NF", where))
            go = sentence(other_np(g, n, "NF", where), owns, the_acc)
            lvl = min(REFLEX_TOP, sentence_level(t) + 2 + (n == "FT") + (case == "ÞGF"))
            add_pair(t, r, nr, gs, go, lvl, where)
        k += 1
out["reflexivePairs"] = pairs

# ---------------------------------------------------------------- Töluorð
CARD = {1: ("einn", "to"), 2: ("tveir", "to"), 3: ("þrír", "to"), 4: ("fjórir", "to")}
KYN = {"kk": "KK", "kvk": "KVK", "hk": "HK"}
items = []
for lvl, t, case, ns, nouns in X.NUMERAL_AGREE:
    level(lvl, f"NUMERAL_AGREE {t}")
    for noun in nouns:
        g = noun_gender(noun, f"NUMERAL_AGREE {t}")
        if not g: continue
        for n in ns:
            num = "ET" if n == 1 else "FT"
            where = f"NUMERAL_AGREE {t} {n} {noun}"
            nf = form(noun, g, case + num, where)[0]
            l, c = CARD[n]
            a = form(l, c, f"{KYN[g]}-{case}{num}", where)
            keep(l, c)
            t2 = t.replace("{N}", nf)
            check_words(t2.replace("___", a[0]), where)
            items.append({"t": t2, "n": n, "noun": noun.split(":")[0], "g": g, "case": case,
                          "l": l, "c": c, "m": f"{KYN[g]}-{case}{num}", "a": a, "lvl": lvl})
out["numeralAgree"] = items

items = []
for noun in X.PLURAL_ONLY_NOUNS:
    g = noun_gender(noun, "PLURAL_ONLY_NOUNS")
    p = paradigm(noun, g) if g else {}
    if any(k.startswith(("NFET", "ÞFET", "ÞGFET", "EFET")) for k in p):
        fail(f"PLURAL_ONLY_NOUNS: '{noun}' has singular forms in BÍN")
for lvl, t, case, ns, nouns in X.NUMERAL_PLURAL_ONLY:
    level(lvl, f"NUMERAL_PLURAL_ONLY {t}")
    for noun in nouns:
        g = noun_gender(noun, t)
        if not g: continue
        for n in ns:
            where = f"NUMERAL_PLURAL_ONLY {t} {n} {noun}"
            nf = form(noun, g, case + "FT", where)[0]
            l, c = X.PLURAL_NUMERALS[n]
            m = (f"FSB-{KYN[g]}-{case}FT" if c == "lo" else f"{KYN[g]}-{case}FT")
            a = form(l, c, m, where)
            # what a child is likely to write instead: the ordinary cardinal
            if n > 1:
                cl, cc = CARD[n]
                plain = form(cl, cc, f"{KYN[g]}-{case}FT", where)
            else:
                plain = []
            t2 = t.replace("{N}", nf)
            check_words(t2.replace("___", a[0]), where)
            items.append({"t": t2, "n": n, "noun": noun.split(":")[0], "g": g, "case": case,
                          "a": a, "plain": plain, "lvl": lvl})
out["pluralOnly"] = items

# to_samr / to_val: frames × nouns by meaning (exercises.py NUMERAL_FRAMES).
LEXICON_NOUNS = sorted((w for w in json.load(open("data/lexicon.json"))["w"] if w["c"] in ("kk", "kvk", "hk")),
                       key=lambda w: w.get("r", 1e9))
LEXICON_NOUN_SET = {w["o"] for w in LEXICON_NOUNS}
def nouns_of(spec, where):
    if isinstance(spec, list):
        for n in spec:
            if n.split(":")[0] not in LEXICON_NOUN_SET: fail(f"{where}: '{n}' is not a noun of the lexicon")
        return spec
    classes = set(spec.split())
    for c in classes:
        if c not in NC.CLASSES: fail(f"{where}: no noun class '{c}'")
    got = [w["o"] for w in LEXICON_NOUNS
           if NC.klass(w["o"]) in classes and NC.reviewed(w["o"]) and not NC.excluded(w["o"])
           and w["o"] not in X._NUMERAL_SKIP]
    return got[:X.NUMERAL_TAKE]

frames = []
for lvl, t, case, ns, spec, *skip in X.NUMERAL_FRAMES:
    where = f"NUMERAL_FRAMES {t}"
    level(lvl, where)
    nouns = []
    skip = set(skip[0] if skip else []) | X._NUMERAL_SKIP
    for noun in nouns_of(spec, where):
        if noun in skip: continue
        g = noun_gender(noun, where)
        if not g: continue
        p = paradigm(noun, g)
        sg = (p.get(case + "ET") or [""])[0]
        pl = "" if NC.no_plural(noun.split(":")[0]) else (p.get(case + "FT") or [""])[0]
        if not sg: continue                       # plural-only: to_flt's business
        if not pl and not any(n == 1 for n in ns): continue
        for f in (sg, pl):
            if f: check_words(t.replace("___", "").replace("{N}", f), where)
        nouns.append([noun.split(":")[0], g, sg if 1 in ns else "", pl])
    if len(nouns) < 3: fail(f"{where}: only {len(nouns)} nouns")
    frames.append({"t": t, "case": case, "ns": ns, "lvl": lvl, "nouns": nouns})
out["numeralFrames"] = frames

# to_flt: frames × the plural-only nouns of a group.
PLURAL_FORMS = {}
for n, (l, c) in X.PLURAL_NUMERALS.items():
    for g in ("kk", "kvk", "hk"):
        for case in ("NF", "ÞF", "ÞGF", "EF"):
            m = f"FSB-{KYN[g]}-{case}FT" if c == "lo" else f"{KYN[g]}-{case}FT"
            PLURAL_FORMS[f"{n}|{KYN[g]}-{case}"] = form(l, c, m, f"PLURAL_NUMERALS {n}")
            if n > 1:
                cl, cc = CARD[n]
                PLURAL_FORMS[f"{n}|{KYN[g]}-{case}|plain"] = form(cl, cc, f"{KYN[g]}-{case}FT", "CARD")
out["pluralNumerals"] = PLURAL_FORMS
frames = []
for lvl, t, case, ns, groups in X.PLURAL_ONLY_FRAMES:
    where = f"PLURAL_ONLY_FRAMES {t}"
    level(lvl, where)
    nouns = []
    for grp in groups.split():
        for noun in X.PLURAL_ONLY_GROUPS[grp]:
            g = noun_gender(noun, where)
            p = paradigm(noun, g) if g else {}
            if any(k.startswith(("NFET", "ÞFET", "ÞGFET", "EFET")) for k in p):
                fail(f"{where}: '{noun}' has singular forms in BÍN"); continue
            f = (p.get(case + "FT") or [""])[0]
            if not f: fail(f"{where}: BÍN has no {case}FT of '{noun}'"); continue
            check_words(t.replace("___", "").replace("{N}", f), where)
            nouns.append([noun, g, f])
    frames.append({"t": t, "case": case, "ns": ns, "lvl": lvl, "nouns": nouns})
out["pluralFrames"] = frames

# lo_beyging / lo_stig / lo_samr: adjective frames × the helper nouns of
# adj_classes.py. The adjective is put in by the builder.
frames = []
for lvl, t, nm, deg, groups in X.ADJ_FRAMES:
    where = f"ADJ_FRAMES {t} {nm}"
    level(lvl, where)
    seen = set()
    for grp in groups.split():
        for noun in X.ADJ_NOUN_GROUPS[grp]:
            if noun in seen: continue
            seen.add(noun)
            g = noun_gender(noun, where)
            p = paradigm(noun, g) if g else {}
            f = (p.get(nm) or [""])[0]
            if not f: fail(f"{where}: BÍN has no {nm} of '{noun}'"); continue
            # The noun's form must say its number and its definiteness: *hús*
            # is singular and plural, and the adjective would be both.
            read = [m for m, ff in p.items() if f in ff]
            if len({("FT" in m, m.endswith("gr")) for m in read}) > 1: continue
            t2 = t.replace("{N}", f)
            if t2.startswith(f): t2 = cap1(t2)
            check_words(t2.replace("___", ""), where)
            item = {"t": t2, "n": noun, "g": g, "nm": nm, "deg": deg, "lvl": lvl}
            if t.index("___") > t.index("{N}"): item["p"] = 1      # predicative
            frames.append(item)
out["adjFrames"] = frames

ORD = {}
def ord_forms(n, case):
    l, c = X.ORDINAL_LEMMAS[n]
    m = f"FVB-KK-{case}ET" if c == "lo" else f"KK-{case}ET"
    return form(l, c, m, f"ordinal {n}")
for d in range(1, 32):
    ORD[d] = {}
    for case in ("NF", "ÞF", "ÞGF", "EF"):
        if d in X.ORDINAL_LEMMAS:
            ORD[d][case] = ord_forms(d, case)
        else:
            tens, unit = (20, d - 20) if d < 30 else (30, d - 30)
            ORD[d][case] = [f"{x} og {y}" for x, y in itertools.product(ord_forms(tens, case), ord_forms(unit, case))]
for mth in X.MONTHS:
    check_words(mth, "MONTHS")
frames = []
for lvl, t, case, why, days in X.DATE_FRAMES:
    level(lvl, f"DATE_FRAMES {t}")
    check_words(t.replace("{M}", "maí").replace("___", ORD[3][case][0]), f"DATE_FRAMES {t}")
    f = {"t": t, "case": case, "why": why, "lvl": lvl}
    # the days of the year the sentence can be true on (v6.13 review, S2):
    # [[month index, first day, last day], ...]
    if days:
        f["when"] = []
        for part in [x.strip() for x in days.split(",")]:
            m = re.fullmatch(r"(\S+) (\d+)-(\d+)", part)
            if not m or m.group(1) not in X.MONTHS:
                fail(f"DATE_FRAMES {t}: '{part}' is not 'mánuður N-M'"); continue
            mi, a, z = X.MONTHS.index(m.group(1)), int(m.group(2)), int(m.group(3))
            if not 1 <= a <= z <= X.DAYS_IN[mi]: fail(f"DATE_FRAMES {t}: no such days '{part}'"); continue
            f["when"].append([mi, a, z])
    frames.append(f)
out["dates"] = {"ord": ORD, "months": X.MONTHS, "days": X.DAYS_IN, "frames": frames}

def _std(e):
    return (e.birting == 'K' and e.einkunn == 1 and e.beinkunn == 1
            and not e.malsnid and not e.bmalsnid)

def subject_cases(verb):
    """The cases BÍN lists for the subject of `verb` used impersonally."""
    out = set()
    for bid in {e.bin_id for e in _entries(verb) if e.ofl == "so"}:
        for e in b.lookup_id(bid):
            if e.mark.startswith("OP-") and _std(e): out.add(e.mark.split("-")[1])
    return out

_greynir = None
def parses(text):
    global _greynir
    if _greynir is None:
        from reynir import Greynir
        _greynir = Greynir()
    s = _greynir.parse_single(text)
    return bool(s and s.tree is not None)

# Helpers of the generated lists (critique item 23).
import vocab_filter as VF
def blocked_words(text):
    """The words of `text` the coarse-word filter keeps from a pupil
    (vocab_filter.py BLOCK), by any of their lemmas — every generated item
    passes this (critique item 9)."""
    out = []
    for w in WORD.findall(text):
        _, ms = b.lookup(w.lower())
        if any(e.ord in VF.BLOCK or (e.ord, e.ofl) in VF.BLOCK_PAIRS for e in ms) and \
           not any(e.ord not in VF.BLOCK and (e.ord, e.ofl) not in VF.BLOCK_PAIRS for e in ms):
            out.append(w)
    return out

def built_on_blocked(word):
    """A word made from a blocked one (*djöfullegur* from *djöfull*): the
    block list holds lemmas, and a derived word is a lemma of its own."""
    return any(len(x) >= 5 and x in word for x in VF.BLOCK)

def verb_ids(verb):
    """BÍN's entries for `verb`. A middle-voice verb (*finnast*, *takast*)
    is filed under its active lemma (*finna*): found by its infinitive."""
    ids = {e.bin_id for e in _entries(verb) if e.ofl == "so"}
    if not ids:
        _, ms = b.lookup(verb)
        ids = {e.bin_id for e in ms if e.ofl == "so" and e.mark == "MM-NH"}
    return sorted(ids)

def verb_forms(verb, mark):
    """The standard BÍN forms of `verb` with exactly this mark (the person
    kept: `paradigm` folds 1P/2P/3P into one cell)."""
    out = []
    for bid in verb_ids(verb):
        for e in b.lookup_id(bid):
            if e.mark == mark and e.birting == 'K' and e.einkunn == 1 and not e.malsnid \
               and e.bmynd not in out:
                out.append(e.bmynd)
    return out

def op_case(verb):
    """The one oblique case BÍN gives the impersonal subject of `verb`, and
    the voice (a verb in -st is middle voice: *líða* has *mér líður* and
    *mér líðst*, two things), or (None, None)."""
    voice = "MM" if verb.endswith("st") else "GM"
    found = set()
    for bid in verb_ids(verb):
        for e in b.lookup_id(bid):
            mm = re.match(r"OP-(ÞF|ÞGF)-" + voice + r"-FH-NT-3P-ET$", e.mark)
            if mm and e.einkunn == 1: found.add(mm.group(1))
    return (found.pop(), voice) if len(found) == 1 else (None, None)

_parsed = {}
def parses_once(text):
    if text not in _parsed: _parsed[text] = parses(text)
    return _parsed[text]

# ---------------------------------------------------------------- Fallstjórn
items = []
for lvl, t, noun, col, motion in X.MOTION_REST:
    where = f"MOTION_REST {t}"
    level(lvl, where)
    g = noun_gender(noun, where)
    if not g: continue
    thf = form(noun, g, "ÞF" + col, where); thgf = form(noun, g, "ÞGF" + col, where)
    if set(thf) & set(thgf): fail(f"{where}: þolfall and þágufall are the same form")
    check_words(t.replace("___", (thf if motion else thgf)[0]), where)
    prep = re.search(r"\b(í|á|undir|yfir)\s+___", t)
    if not prep: fail(f"{where}: no í/á/undir/yfir before the blank")
    keep(noun, g)
    items.append({"t": t, "noun": noun, "g": g, "col": col, "motion": motion,
                  "thf": thf, "thgf": thgf, "prep": prep.group(1) if prep else "", "lvl": lvl})
out["motionRest"] = items

# The sets (critique item 23): every sentence × every noun checked here,
# the pairs put together by the builder (tasks/fallstjorn.js).
sets = []
for prep, col, goes, stays, nouns in X.MOTION_SETS:
    where = f"MOTION_SETS {prep} {nouns[0]}…"
    ns = []
    for noun in nouns:
        g = noun_gender(noun, where)
        if not g: continue
        thf = form(noun, g, "ÞF" + col, where); thgf = form(noun, g, "ÞGF" + col, where)
        if set(thf) & set(thgf): fail(f"{where} {noun}: þolfall and þágufall are the same form")
        keep(noun, g)
        ns.append({"noun": noun, "g": g, "thf": thf, "thgf": thgf})
    def frame(t, motion):
        w = f"{where}: {t}"
        if t.count("___") != 1: fail(f"{w}: exactly one blank")
        m = re.search(r"\b(\w+)\s+___", t)
        if not m or m.group(1) != prep: fail(f"{w}: '{prep}' must stand right before the blank")
        if prep == "yfir": fail(f"{w}: yfir takes both cases in motion (item 6)")
        if prep == "undir" and motion and not re.search(r"\binn undir ___", t):
            fail(f"{w}: undir in motion only as *inn undir* (item 6)")
        for n in ns:
            text = t.replace("___", (n["thf"] if motion else n["thgf"])[0])
            check_words(text, w)
            if blocked_words(text): fail(f"{w}: {blocked_words(text)} is on the block list")
        if ns and not parses_once(t.replace("___", (ns[0]["thf"] if motion else ns[0]["thgf"])[0])):
            fail(f"{w}: Greynir cannot parse it")
        return {"t": t, "lvl": sentence_level(t)}
    sets.append({"prep": prep, "col": col, "go": [frame(t, True) for t in goes],
                 "stay": [frame(t, False) for t in stays], "nouns": ns})
out["motionSets"] = sets

CASEW = {"NF": "nefnifall", "ÞF": "þolfall", "ÞGF": "þágufall", "EF": "eignarfall"}
items = []
def verb_in(text, verb):
    """True when some word of `text` is a BÍN form of the verb `verb` (a
    middle-voice verb, *kynnast*, by its entry: BÍN files it under *kynna*)."""
    ids = set(verb_ids(verb))
    for w in WORD.findall(text):
        _, ms = b.lookup(w)
        if any(e.ofl == "so" and (e.ord == verb or (e.bin_id in ids and "MM" in e.mark and
               verb.endswith("st"))) for e in ms): return True
    return False
for lvl, t, verb, case, col, nouns in X.VERB_CASE:
    level(lvl, f"VERB_CASE {t}")
    if "so" not in classes_of(verb) and not paradigm(verb, "so"):
        fail(f"VERB_CASE: '{verb}' is not a verb in BÍN")
    # The app says "Sögnin X stýrir …falli": the verb must be in the sentence,
    # and the case must not be set by a preposition right before the blank
    # (*hlakka til ___*: til stýrir eignarfalli, not hlakka).
    if not verb_in(t, verb):
        fail(f"VERB_CASE {t}: no form of '{verb}' in the sentence")
    before = re.search(r"(\w+)\s+___", t)
    if before and "fs" in classes_of(before.group(1).lower()):
        fail(f"VERB_CASE {t}: '{before.group(1)}' before the blank is a preposition — "
             "the preposition governs the case, not the verb; ask it as a preposition item")
    for noun in nouns:
        where = f"VERB_CASE {t} {noun}"
        g = noun_gender(noun, where)
        if not g: continue
        a = form(noun, g, case + col, where)
        cue = form(noun, g, "NF" + col, where)[0]
        # the answer is the cue (*óttaðist myrkrið*): copying is not knowing
        # the case, as VERB_FRAMES below (critique item 23)
        if cue in a: continue
        check_words(t.replace("___", a[0]), where)
        keep(noun, g)
        items.append({"t": t, "verb": verb, "case": case, "noun": noun.split(":")[0], "g": g,
                      "m": case + col, "a": a, "cue": cue, "lvl": lvl})
# VERB_FRAMES (critique item 23): frames × noun groups, checked as VERB_CASE
# is, and with the level worked out by the rule rather than written.
_old = {(x["t"], x["noun"]) for x in items}
for bonus, t, verb, case, group in X.VERB_FRAMES:
    where = f"VERB_FRAMES {t}"
    if not verb_in(t, verb): fail(f"{where}: no form of '{verb}' in the sentence")
    before = re.search(r"(\w+)\s+___", t)
    if before and "fs" in classes_of(before.group(1).lower()):
        fail(f"{where}: '{before.group(1)}' before the blank is a preposition")
    lvl = sentence_level(t) + 1 + (case == "EF") + bonus
    if lvl > 4: fail(f"{where}: level {lvl} — VERB_CASE stops at 4")
    first = True
    for noun, col in group:
        g = noun_gender(noun, where)
        if not g: continue
        a = form(noun, g, case + col, where)
        cue = form(noun, g, "NF" + col, where)[0]
        if cue in a or (t, noun) in _old: continue
        text = t.replace("___", a[0])
        check_words(text, where)
        if blocked_words(text): fail(f"{where}: {blocked_words(text)} is on the block list")
        if first and not parses_once(text): fail(f"{where}: Greynir cannot parse '{text}'")
        first = False
        keep(noun, g)
        items.append({"t": t, "verb": verb, "case": case, "noun": noun, "g": g,
                      "m": case + col, "a": a, "cue": cue, "lvl": lvl})
out["verbCase"] = items

# Impersonal verbs (critique item 23): frames × subjects × tense, every form
# out of BÍN. Written out as frames and subjects; the builder
# (tasks/fallstjorn.js) puts them together, and everything it can put
# together is checked here.
PERSON = {"ég": "1", "þú": "2", "hann": "3", "hún": "3", "það": "3"}
subjects = []
for l, c, col, add in X.IMPERSONAL_SUBJECTS:
    where = f"IMPERSONAL_SUBJECTS {l} {col}"
    num = "FT" if col.startswith("FT") else "ET"
    p = (PERSON[l] if c == "pfn" else "3") + num
    f = {k: form(l, c, k + col, where) for k in ("NF", "ÞF", "ÞGF")}
    keep(l, c)
    subjects.append({"l": l, "c": c, "col": col, "p": p, "add": add, "f": f})
frames = []
for bonus, verb, kind, present, past in X.IMPERSONAL_FRAMES:
    for tense, t in (("NT", present), ("ÞT", past)):
        if t is None: continue
        where = f"IMPERSONAL_FRAMES {t} ({tense})"
        if t.count("___") != 1 or not t.startswith("___ {V} "):
            fail(f"{where}: the frame opens with the subject and the verb"); continue
        if kind == "op":
            case, voice = op_case(verb)
            if not case:
                fail(f"{where}: BÍN gives '{verb}' no single impersonal subject case"); continue
            v = {"*": verb_forms(verb, f"OP-{case}-{voice}-FH-{tense}-3P-ET")}
        elif kind == "NF":
            case = "NF"
            if subject_cases(verb) & {"ÞF", "ÞGF"}:
                fail(f"{where}: BÍN lists '{verb}' with an oblique subject — not a trap")
            v = {s["p"]: verb_forms(verb, f"GM-FH-{tense}-{s['p'][0]}P-{s['p'][1:]}") for s in subjects}
        else:
            case = kind
            v = {"*": verb_forms(verb, f"GM-FH-{tense}-3P-ET")}
        if any(not fs for fs in v.values()):
            fail(f"{where}: BÍN has no {tense} form of '{verb}' for every subject"); continue
        v = {k: fs[0] for k, fs in v.items()}
        # every subject, every word: in BÍN, not blocked, and the frame parses
        for s in subjects:
            vf = v.get("*") or v[s["p"]]
            a = s["f"][case][0]
            text = t.replace("{V}", vf).replace("___", a[:1].upper() + a[1:])
            check_words(text, where)
            if blocked_words(text): fail(f"{where}: {blocked_words(text)} is on the block list")
        sample = t.replace("{V}", v.get("*") or v["1ET"]).replace("___", "Ég" if case == "NF" else
                                                                   {"ÞF": "Mig", "ÞGF": "Mér"}[case])
        if not parses_once(sample): fail(f"{where}: Greynir cannot parse '{sample}'")
        fr = {"t": t, "verb": verb, "case": case, "tense": tense, "v": v,
              "lvl": min(5, sentence_level(t) + 1 + bonus)}
        # *mér er kalt*: the explanation shows the word that makes it impersonal
        if kind not in ("op", "NF"): fr["x"] = WORD.findall(t.split("{V}", 1)[1])[0]
        frames.append(fr)
out["impersonal"] = {"frames": frames, "subjects": subjects}

# ---------------------------------------------------------------- Óbeygjanleg
items = []
for lvl, t, w, cls in X.ADV_OR_PREP:
    where = f"ADV_OR_PREP {t}"
    level(lvl, where)
    check_words(t, where)
    words = WORD.findall(t)
    if w not in [x.lower() for x in words]: fail(f"{where}: '{w}' is not in the sentence")
    if cls not in classes_of(w): fail(f"{where}: BÍN does not list '{w}' as {cls}")
    other = "ao" if cls == "fs" else "fs"
    if other not in classes_of(w): fail(f"{where}: BÍN does not list '{w}' as {other} — no contrast")
    items.append({"t": t, "w": w, "c": cls, "lvl": lvl})
# ADV_PREP_FRAMES (critique item 23): the sentences, generated; the builder
# makes the pairs.
_old_adv = {x["t"] for x in items}
for w, preps, advs in X.ADV_PREP_FRAMES:
    where = f"ADV_PREP_FRAMES {w}"
    if not {"fs", "ao"} <= classes_of(w): fail(f"{where}: BÍN does not list '{w}' as both fs and ao")
    for frame, case, nouns in preps:
        if not re.search(r"\b" + w + r" ___", frame): fail(f"{where}: {frame}: '{w}' must stand right before the blank")
        first = True
        for noun, col in nouns:
            g = noun_gender(noun, where)
            if not g: continue
            t = frame.replace("___", form(noun, g, case + col, where)[0])
            keep(noun, g)
            check_words(t, where)
            if blocked_words(t): fail(f"{where}: {t}: a word on the block list")
            if first and not parses_once(t): fail(f"{where}: Greynir cannot parse '{t}'")
            first = False
            if t not in _old_adv:
                items.append({"t": t, "w": w, "c": "fs", "lvl": min(5, sentence_level(t) + 1)})
    for t in advs:
        check_words(t, where)
        if w not in [x.lower() for x in WORD.findall(t)]: fail(f"{where}: '{w}' is not in '{t}'")
        if not parses_once(t): fail(f"{where}: Greynir cannot parse '{t}'")
        if t not in _old_adv:
            items.append({"t": t, "w": w, "c": "ao", "lvl": min(5, sentence_level(t) + 1)})
out["advPrep"] = items

items = []
def is_conjunction(o):
    """One word that BÍN lists as a conjunction, or a declared phrase
    (exercises.CONJ_PHRASES) whose words are all in BÍN and whose last word
    is a conjunction there (af því AÐ, áður EN)."""
    if " " not in o:
        return "st" in classes_of(o)
    words = o.split()
    return (o in X.CONJ_PHRASES and all(classes_of(w) for w in words)
            and "st" in classes_of(words[-1]))
for lvl, t, right, wrong, why in X.CONJUNCTION:
    where = f"CONJUNCTION {t}"
    level(lvl, where)
    check_words(t.replace("___", right), where)
    if t.count("___") != 1: fail(f"{where}: exactly one blank")
    opts = [right] + wrong
    if len(set(opts)) != len(opts): fail(f"{where}: an option twice")
    if len(wrong) != 3: fail(f"{where}: three wrong options")
    for o in opts:
        if not is_conjunction(o): fail(f"{where}: BÍN does not list '{o}' as a conjunction")
    items.append({"t": t, "a": right, "w": wrong, "why": why, "lvl": lvl})
# The generated contrast sets (critique item 23, exercises.py CONJ_*). Every
# word checked in BÍN, the comparative taken from it; the wrong options of a
# set rotated (item 25: none in more than a third of all items).
_cap = lambda t: t[:1].upper() + t[1:]
def nf(lemma, col):
    """A noun's nominative in the column, or a pronoun / phrase as written."""
    if col is None: return lemma
    g = noun_gender(lemma, "CONJ")
    return form(lemma, g, "NF" + col, "CONJ")[0] if g else "?"
def gender_of(lemma, col):
    return {"kk": "KK", "kvk": "KVK", "hk": "HK"}.get(noun_gender(lemma, "CONJ")) if col else "KK"
def conj_item(t, right, wrong, why, bonus=0):
    where = f"CONJ {t}"
    t = _cap(t)
    check_words(t.replace("___", right), where)
    if blocked_words(t): fail(f"{where}: a word on the block list")
    if not parses_once(t.replace("___", right)): fail(f"{where}: Greynir cannot parse it")
    for o in [right] + wrong:
        if not is_conjunction(o): fail(f"{where}: BÍN does not list '{o}' as a conjunction")
    if len(set([right] + wrong)) != 4: fail(f"{where}: four different options")
    items.append({"t": t, "a": right, "w": wrong, "why": why, "lvl": min(5, sentence_level(t) + bonus)})
def rotate(pool, k):
    """Three of `pool`, a different three each time (the pools are chosen so
    that no conjunction passes a third of all items — the test holds it)."""
    return [pool[(k + j) % len(pool)] for j in range(3)]

k = 0
for adj, pairs in X.CONJ_COMPARE:
    for (x, xc), (y, yc) in pairs:
        comp = form(adj, "lo", f"MST-{gender_of(x, xc)}-NFET", f"CONJ_COMPARE {adj}")[0]
        conj_item(f"{nf(x, xc)} er {comp} ___ {nf(y, yc)}.", "en",
                  rotate(["og", "né", "eða", "ef", "hvort sem"], k),
                  f"Á eftir miðstigi kemur *en*: *{comp} en {nf(y, yc)}*."); k += 1
for frames, right, pool, why in (
        (X.CONJ_BOTH, "og", ["né", "eða", "en", "sem"], "*Bæði* og *og* fylgjast að: *bæði … og*."),
        (X.CONJ_NEITHER, "né", ["eða", "og", "en", "sem"], "*Hvorki* og *né* fylgjast að: *hvorki … né*."),
        (X.CONJ_EITHER, "eða", ["né", "og", "en", "sem"], "*Annaðhvort* og *eða* fylgjast að: *annaðhvort … eða*.")):
    for f in frames:
        for a, b_ in X.CONJ_PAIRS:
            conj_item(f.replace("{A}", a).replace("{B}", b_), right, rotate(pool, k), why); k += 1
frames, clauses = X.CONJ_WHETHER
for f in frames:
    for c in clauses:
        # not *nema*: *ég veit ekki nema hún komi* is an idiom of its own;
        # and not *þegar* after *man*: *ég man þegar ég var lítill* is good
        # Icelandic, so *ég man ekki þegar …* is not plainly wrong
        remember = " man " in f
        conj_item(f.replace("{C}", c), "hvort", ["ef", "hvort sem", "þótt" if remember else "þegar"],
                  "Óbein spurning hefst á *hvort*: *" + f.split(" ___")[0].lower() + " hvort …* — "
                  + ("*ef* táknar skilyrði." if remember else "*ef* táknar skilyrði og *þegar* tíma.")); k += 1
for t in X.CONJ_RELATIVE:
    noun = t.split(" ___")[0]
    conj_item(t, "sem", rotate(["að", "hvort", "þegar", "nema"], k),
              f"*Sem* tengir tilvísunarsetningu við nafnorð: *{noun.lower()} sem …*."); k += 1
for t in X.CONJ_SAID:
    # not *þegar*: *pabbi sagði þegar maturinn væri tilbúinn* is near enough
    # to *sagði til þegar* to be argued over
    conj_item(t, "að", rotate(["sem", "hvort", "nema", "en"], k),
              "*Að* tengir það sem er sagt, haldið eða vonað við sögnina: *sagði að …*, *vona að …*."); k += 1
for cause, result in X.CONJ_CAUSE:
    conj_item(f"{result} ___ {cause}.", "af því að", rotate(["svo að", "nema", "hvort sem", "til þess að"], k),
              f"*Af því að* segir hvers vegna: {cause} — þess vegna {result}.", 1); k += 1
    conj_item(f"{cause} ___ {result}.", "svo að", rotate(["af því að", "nema", "hvort", "til þess að"], k),
              f"*Svo að* segir hvað leiddi af: {cause}, og því {result}.", 1); k += 1
for first, then, then2, first2 in X.CONJ_ORDER:
    conj_item(f"{first} ___ {then}.", "áður en", rotate(["eftir að", "nema", "hvort", "þótt"], k),
              f"*Áður en* segir hvað gerðist fyrst: fyrst {first}, svo {then}.", 1); k += 1
    conj_item(f"{then2} ___ {first2}.", "eftir að", rotate(["áður en", "nema", "hvort", "þótt"], k),
              f"*Eftir að* segir hvað gerðist á undan: fyrst {first2}, svo {then2}.", 1); k += 1
out["conjunction"] = items

# Connectives of cause, time and contrast (issue #28). What can be checked is
# checked: the five words, four different options, every word in BÍN, every
# completed sentence parsed, and the verb straight after *þess vegna* and
# *síðan*. That each wrong option really fails is the reader's part: the
# reason beside it is on the review page.
def reasons(wrong, where):
    opts = [o for o, _ in wrong]
    if len(wrong) != 3: fail(f"{where}: three wrong options")
    for o, why_not in wrong:
        check_words(re.sub(r"[*…]", " ", why_not), where)
    return opts
items = []
for t, right, why, wrong in X.CONNECTIVE:
    where = f"CONNECTIVE {t}"
    if t.count("___") != 1: fail(f"{where}: exactly one blank")
    opts = [right] + reasons(wrong, where)
    if len(set(opts)) != len(opts): fail(f"{where}: an option twice")
    for o in opts:
        if o not in X.CONNECTIVES: fail(f"{where}: '{o}' is not one of the five connectives")
    start = t.startswith("___") or bool(re.search(r"[.!?] ___", t))
    full = t.replace("___", cap1(right) if start else right)
    check_words(full + " " + re.sub(r"[*…]", " ", why), where)
    for part in re.findall(r"[^.!?]+[.!?]", full):
        if not parses_once(part.strip()): fail(f"{where}: Greynir cannot parse '{part.strip()}'")
    # the verb straight after an adverb in first place, never after a conjunction
    after = re.search(r"___ ([^\s.,!?]+)", t)
    nxt = classes_of(after.group(1)) if after else set()
    if X.CONNECTIVES.get(right) and "so" not in nxt:
        fail(f"{where}: after '{right}' the verb comes first, and '{after and after.group(1)}' is not a verb in BÍN")
    if X.CONNECTIVES.get(right) is False and nxt == {"so"}:
        fail(f"{where}: after '{right}' the subject comes first, and '{after.group(1)}' is only a verb in BÍN")
    items.append({"t": t, "a": right, "w": [o for o, _ in wrong], "why": why,
                  "no": {o: n for o, n in wrong}, "lvl": sentence_level(t)})
if len({x["t"] for x in items}) != len(items): fail("CONNECTIVE: a sentence twice")
out["connective"] = items

# Understanding hvorki … né and ekki aðeins … heldur einnig (issue #28): the
# whole sentence, a question, and the same four answers every time — only the
# first, only the second, both, neither.
items = []
for t, question, right, why, wrong in X.CONNECTIVE_SENSE:
    where = f"CONNECTIVE_SENSE {t}"
    opts = [right] + reasons(wrong, where)
    if len(set(opts)) != len(opts): fail(f"{where}: an option twice")
    if "___" in t: fail(f"{where}: the sentence is shown whole, without a blank")
    if not question.endswith("?"): fail(f"{where}: the question must end with ?")
    kinds = sorted("bara" if o.startswith("bara ") else o for o in opts)
    if kinds != ["bara", "bara", "bæði", "hvorugt"]:
        fail(f"{where}: the options must be bara …, bara …, bæði, hvorugt")
    for o in opts:
        if o.startswith("bara ") and o[5:] not in t: fail(f"{where}: '{o[5:]}' is not in the sentence")
    check_words(" ".join([t, question, re.sub(r"[*…]", " ", why)] + opts), where)
    if not parses_once(t): fail(f"{where}: Greynir cannot parse '{t}'")
    if not parses_once(question): fail(f"{where}: Greynir cannot parse '{question}'")
    # what the pair of connectives in the sentence means decides the answer
    want = ("hvorugt" if re.search(r"\bhvorki\b.*\bné\b", t) else
            "bæði" if re.search(r"\bekki aðeins\b.*\bheldur einnig\b", t) else
            "bara" if re.search(r"\bekki\b.*\bheldur\b|\ben ekki\b", t) else None)
    if want is None: fail(f"{where}: none of hvorki … né, ekki aðeins … heldur einnig, ekki … heldur, … en ekki …")
    elif not (right == want or (want == "bara" and right.startswith("bara "))):
        fail(f"{where}: the sentence says '{want}', the answer says '{right}'")
    items.append({"t": t, "q": question, "a": right, "w": [o for o, _ in wrong], "why": why,
                  "no": {o: n for o, n in wrong}, "lvl": sentence_level(t)})
if len({x["t"] for x in items}) != len(items): fail("CONNECTIVE_SENSE: a sentence twice")
out["connectiveSense"] = items

# ---------------------------------------------------------------- Orðaforði
def pos_of(lemma, pos, where):
    if pos == "no":
        return noun_gender(lemma, where)
    if pos not in classes_of(lemma) or not paradigm(lemma, pos):
        fail(f"{where}: '{lemma}' is not {pos} in BÍN")
    return pos
# r: the word's rank in the frequency list (freq_lemmas.json, 1 = most
# common), so the app can start with common words and move to rarer ones as
# the child's level rises. A word the list does not have gets 99999.
_freq = json.load(open("data/freq_lemmas.json"))
_rank = {}
for _i, (_l, _c, _n, _k) in enumerate(sorted(_freq.values(), key=lambda x: -x[3])):   # by rank key (build_freq.py)
    _rank.setdefault((_l, _c), _i + 1)
def vocab_word(w, pos, where):
    c = pos_of(w, pos, where)
    o = w.split(":")[0]
    return {"o": o, "c": c, "r": _rank.get((o, c), 99999)}
syn = {}
_in_group = {}
for pos, groups in X.SYNONYMS.items():
    syn[pos] = []
    for g in groups:
        if len(g) < 2 or len(set(g)) != len(g): fail(f"SYNONYMS {g}: a group needs two different words")
        for w in g:
            w = w.split(":")[0]
            if (w, pos) in _in_group: fail(f"SYNONYMS {g}: '{w}' is already in {_in_group[(w, pos)]}")
            _in_group[(w, pos)] = g
        syn[pos].append([vocab_word(w, pos, f"SYNONYMS {g}") for w in g])
ant = {}
for pos, pairs in X.ANTONYMS.items():
    for p in pairs:
        a_, b_ = (x.split(":")[0] for x in p)
        if (a_, pos) in _in_group and _in_group[(a_, pos)] is _in_group.get((b_, pos)):
            fail(f"ANTONYMS {p}: both words are in the same synonym group")
    ant[pos] = [[vocab_word(w, pos, f"ANTONYMS {p}") for w in p] for p in pairs]
out["synonyms"] = syn
out["antonyms"] = ant

# Which sense of the answer the sentence means (v6.13 review M1). The app
# printed the word's dictionary definition after the answer, and that is
# ÍNO's FIRST sense: *Ég hlustaði á lagið í útvarpinu* → "*lag*: partur af
# stafla …", *póstur* who brings the letters → "flutningskerfi
# póstþjónustunnar". Each item now names its sense (samhengi.tsv `merking`,
# samhengi-rammar.tsv `lag=2`), or "-" where none of ÍNO's fits (*hjól*:
# "hringur sem snýst um miðpunkt sinn" for a bicycle). An answer whose word
# has several senses and names none stops the build. The item carries the
# chosen definition as `d` (null: none is printed). The senses are read
# from data/ino.json the way build_bundle.py attaches them: by bin_id, and
# only where ÍNO's word class is the lexicon's.
_LEX_BY = {(w["o"], w["c"]): w for w in json.load(open("data/lexicon.json"))["w"]}
try:
    _ino = json.load(open("data/ino.json", encoding="utf-8"))
    _INO = _ino["entries"] if isinstance(_ino.get("entries"), dict) else _ino
except FileNotFoundError:
    _INO = {}
import definitions as _DEFS

def senses_of(o, c):
    """ÍNO's senses of the lexicon's word (o, c): a list of definitions."""
    w = _LEX_BY.get((o, c))
    e = _INO.get(str(w.get("i"))) if w else None
    if not isinstance(e, dict) or not e.get("def") or e.get("cls") not in (None, c):
        return []
    return [x["def"] for x in (e.get("senses") or [{"def": e["def"]}]) if x.get("def")]

def context_def(o, c, sense, where):
    """The definition to print after the answer *o*: sense number `sense`
    (a string, "1" …), "-" for none, "" for the word's only sense."""
    if sense == "-":
        return None
    ss = senses_of(o, c)
    if sense:
        if not sense.isdigit() or not 1 <= int(sense) <= len(ss):
            fail(f"{where}: '{o}' has {len(ss)} sense(s) in ÍNO, not '{sense}'")
            return None
        return ss[int(sense) - 1]
    if len(ss) > 1:
        fail(f"{where}: '{o}' has {len(ss)} senses in ÍNO — name the one the sentence means "
             f"(merking, or {o}=N / {o}=- in samhengi-rammar.tsv): "
             + " | ".join(f"{k}. {d[:50]}" for k, d in enumerate(ss, 1)))
        return None
    if ss:
        return ss[0]
    w = _LEX_BY.get((o, c))
    hand = _DEFS.D.get(o) if w else None
    return hand[0] if hand else None

items = []
for lvl, t, mark, right, wrong, sense in X.WORD_IN_CONTEXT:
    where = f"WORD_IN_CONTEXT {t}"
    level(lvl, where)
    opts = []
    for lemma in [right] + wrong:
        g = noun_gender(lemma, where)
        if not g: continue
        opts.append({"o": lemma.split(":")[0], "c": g, "f": form(lemma, g, mark, where)[0]})
    if len({o["f"] for o in opts}) != len(opts): fail(f"{where}: two options with the same form")
    if opts: check_words(t.replace("___", opts[0]["f"]), where)
    d = context_def(opts[0]["o"], opts[0]["c"], sense, where) if opts else None
    items.append({"t": t, "m": mark, "a": opts[0] if opts else None, "w": opts[1:], "lvl": lvl, "d": d})
# WORD_IN_CONTEXT_FRAMES (critique item 23): one item per noun that fits,
# the nouns that cannot fit as the pool of its wrong options.
for bonus, t, mark, fits, cannot in X.WORD_IN_CONTEXT_FRAMES:
    where = f"WORD_IN_CONTEXT_FRAMES {t}"
    def opt(lemma):
        g = noun_gender(lemma, where)
        return {"o": lemma.split(":")[0], "c": g, "f": form(lemma, g, mark, where)[0]} if g else None
    bad = [o for o in map(opt, cannot) if o]
    if len(bad) < 3: fail(f"{where}: fewer than three nouns that cannot fit")
    if {f.partition("=")[0] for f in fits} & set(cannot): fail(f"{where}: a noun both fits and cannot")
    first = True
    for fit in fits:
        lemma, _, sense = fit.partition("=")
        a = opt(lemma)
        if not a: continue
        d = context_def(a["o"], a["c"], sense, where)
        pool = [o for o in bad if o["f"] != a["f"]]
        text = t.replace("___", a["f"])
        check_words(text, where)
        if blocked_words(text + " " + " ".join(o["f"] for o in pool)):
            fail(f"{where}: a word on the block list")
        if first and not parses_once(text[:1].upper() + text[1:]): fail(f"{where}: Greynir cannot parse '{text}'")
        first = False
        rare = _rank.get((a["o"], a["c"]), 99999) > 3000
        items.append({"t": t, "m": mark, "a": a, "w": pool, "gen": True,
                      "lvl": min(5, sentence_level(t) + bonus + rare), "d": d})
out["wordInContext"] = items

# The graded meaning question (issue #11, or_merking): which of three
# sentences uses the word with the right meaning. What is checked here is
# what a machine can check; that a wrong sentence is nonsense in every sense
# of the word is the author's claim (content/ordafordi/merking.tsv).
#   - the word is the lexicon's (the app files the answer under it);
#   - every sentence holds a BÍN form of the word, only words BÍN knows, and
#     nothing on the block list;
#   - origin "samhengi": the right sentence is a word-in-context item with
#     this word as its answer, each wrong one an item that lists the word as
#     impossible there — so the row holds no new Icelandic;
#   - origin "ný": every sentence parses — the wrong ones too, because
#     what is wrong with them must be the meaning and nothing else.
def _in_sentence(text, o, c):
    return any(e.ord == o and e.ofl == c for w in WORD.findall(text) for e in b.lookup(w.lower())[1])
_filled = lambda t, f: cap1(f) + t[3:] if t.startswith("___") else t.replace("___", f)
_ctx_right = {(x["a"]["o"], x["a"]["c"], _filled(x["t"], x["a"]["f"])) for x in items if x["a"]}
_ctx_wrong = {(w["o"], w["c"], _filled(x["t"], w["f"])) for x in items for w in x["w"]}
meaning = []
_meaning_words = set()
for lvl, o, c, sense, origin, right, wrong in X.MEANING_CHOICE:
    where = f"MEANING_CHOICE {o}"
    level(lvl, where)
    if (o, c) not in _LEX_BY:
        fail(f"{where}: '{o}' ({c}) is not a word of the lexicon"); continue
    if (o, c) in _meaning_words: fail(f"{where}: the word has two lines")
    _meaning_words.add((o, c))
    texts = [right] + wrong
    if len(set(texts)) != len(texts): fail(f"{where}: the same sentence twice")
    if len(wrong) < 2: fail(f"{where}: fewer than two wrong sentences")
    for t in texts:
        check_words(t, where)
        if blocked_words(t): fail(f"{where}: a word on the block list ({t})")
        if not _in_sentence(t, o, c): fail(f"{where}: no form of '{o}' ({c}) in '{t}'")
    if origin == "samhengi":
        if (o, c, right) not in _ctx_right:
            fail(f"{where}: '{right}' is not a word-in-context sentence with '{o}' as its answer")
        for t in wrong:
            if (o, c, t) not in _ctx_wrong:
                fail(f"{where}: '{t}' is not a word-in-context sentence that lists '{o}' as wrong")
    elif origin == "ný":
        for t in texts:
            if not parses_once(t): fail(f"{where}: Greynir cannot parse '{t}'")
    else:
        fail(f"{where}: uppruni must be 'samhengi' or 'ný', not '{origin}'")
    meaning.append({"o": o, "c": c, "lvl": lvl, "r": right, "w": wrong,
                    "d": context_def(o, c, sense, where)})
out["meaningChoice"] = meaning

# Word formation that the app's lexicon cannot see (critique item 23): the
# lexicon holds the adverbs a text has used, not the adverb every adjective
# in *-legur* makes. For or_myndun: *rólegur – rólega*, the adjective one
# the lexicon has (so a pupil has met it), the adverb one BÍN lists as an
# adverb, in the standard form. Nothing else is claimed, so the answer is
# certain.
_lexw = json.load(open("data/lexicon.json"))["w"]
lega = []
for w in sorted((w for w in _lexw if w["c"] == "lo" and w["o"].endswith("legur")), key=lambda w: w["r"]):
    adv = w["o"][:-2] + "a"
    _, ms = b.lookup_ksnid(adv)
    if not any(e.ofl == "ao" and e.ord == adv and _std(e) for e in ms): continue
    if blocked_words(w["o"] + " " + adv) or built_on_blocked(w["o"]): continue
    lega.append({"from": w["o"], "to": adv, "r": w["r"]})
if len(lega) < 100: fail(f"formation: only {len(lega)} adjectives in -legur with an adverb in -lega")
out["formation"] = {"lega": lega}

# ---------------------------------------------------------------- Villuveiðar
# HUNT (critique item 26): one sentence, one error a native teenager makes,
# its correction and why. What is checked, item by item:
#   * the word(s) in the brackets ARE the BÍN form of the lemma, class and
#     mark written beside them — the correction is never taken on trust;
#   * every other word of the corrected sentence is a word BÍN knows, and
#     Greynir parses the corrected sentence;
#   * the wrong form is really wrong: it is not one of the right forms; with a
#     star it is not a standard BÍN form of the word at all (*læknirar);
#     without one every word of it is a standard BÍN form (the right word in
#     the wrong cell, or another word);
#   * what the explanation claims about the verb or preposition (an oblique
#     subject, the case governed) is what BÍN and government.py say.
_hcache = {}
def hunt_paradigm(lemma, ofl):
    """{mark: [forms]}, core standard forms only — as `paradigm`, but the
    person stays in the mark (GM-FH-NT-1P-ET), as in `paradigm`, and a digit
    that is not a person is a variant (NFET2) wherever it stands."""
    key = (lemma, ofl)
    if key in _hcache: return _hcache[key]
    ids = sorted({e.bin_id for e in _entries(lemma) if e.ofl == ofl})
    best = {}
    for bid in ids:
        ent = [e for e in b.lookup_id(bid) if _std(e)]
        ent.sort(key=lambda e: (e.mark, e.bmynd))
        forms = collections.defaultdict(list)
        for e in ent:
            m = re.sub(r'\d(?!P)', '', e.mark)
            if e.bmynd not in forms[m]: forms[m].append(e.bmynd)
        if len(forms) > len(best): best = dict(forms)
    _hcache[key] = best
    return best

def standard_word(w):
    """Is `w` a standard form of some word in BÍN's core vocabulary?"""
    for x in dict.fromkeys([w, w.lower()]):
        _, ks = b.lookup_ksnid(x)
        if any(_std(k) for k in ks): return True
    return False

import government as GOV
HUNT_TOKEN = re.compile(r"[A-Za-zÁÉÍÓÚÝÞÆÖÐáéíóúýþæöð]+(?:-[A-Za-zÁÉÍÓÚÝÞÆÖÐáéíóúýþæöð]+)*|[.,!?;:]")
low1 = lambda s: s[:1].lower() + s[1:]
cap1 = lambda s: s[:1].upper() + s[1:]
items = []
_seen_hunt = set()
for it in X.HUNT:
    t, where = it["t"], f"HUNT {it['t']}"
    mm = re.fullmatch(r"([^\[\]]*)\[([^\[\]]+)\]([^\[\]]*)", t)
    if not mm:
        fail(f"{where}: exactly one [target]"); continue
    pre, right, post = mm.groups()
    correct = pre + right + post
    if correct in _seen_hunt: fail(f"{where}: the sentence is in the bank twice")
    _seen_hunt.add(correct)
    if it["band"] not in (3, 4, 5): fail(f"{where}: band must be 3, 4 or 5")
    if not it["why"].strip(): fail(f"{where}: no explanation")
    first = not pre.strip()
    words, spec = right.split(), it["spec"]
    if len(words) != len(spec):
        fail(f"{where}: {len(words)} word(s) in the brackets, {len(spec)} in the spec"); continue
    # the correction, word by word, out of BÍN
    choices, marks, ok = [], [], True
    for k, (w, (lemma, ofl, mark)) in enumerate(zip(words, spec)):
        plain = low1(w) if (first and k == 0 and not lemma[:1].isupper()) else w
        if mark:
            fs = hunt_paradigm(lemma, ofl).get(mark)
            if not fs:
                fail(f"{where}: BÍN has no {mark} of {ofl} '{lemma}'"); ok = False; continue
            if plain not in fs:
                fail(f"{where}: '{w}' is not BÍN's {mark} of '{lemma}' ({', '.join(fs)})"); ok = False; continue
            choices.append([plain] + [f for f in fs if f != plain])
            marks.append(mark)
        else:
            if ofl not in classes_of(plain):
                fail(f"{where}: BÍN does not list '{plain}' as {ofl}"); ok = False; continue
            if not standard_word(plain):
                fail(f"{where}: '{plain}' is not a standard word in BÍN"); ok = False; continue
            choices.append([plain])
    if not ok: continue
    answers = [" ".join(c) for c in itertools.product(*choices)]
    for extra in it.get("also", []):
        if not all(classes_of(w) for w in extra.split()):
            fail(f"{where}: the other answer '{extra}' is not a word BÍN knows")
        answers.append(extra)
    if first: answers = [cap1(a) for a in answers]
    # the rest of the sentence
    check_words(correct, where)
    if it.get("parse", True):
        if not parses(correct): fail(f"{where}: Greynir cannot parse the corrected sentence")
    elif parses(correct): fail(f"{where}: Greynir parses the sentence — drop parse=False")
    # the wrong form
    star = it["wrong"].startswith("*")
    wrong = it["wrong"].lstrip("*")
    if wrong.lower() in [a.lower() for a in answers]:
        fail(f"{where}: the wrong form '{wrong}' is one of the right ones")
    if star:
        for w in wrong.split():
            for lemma, ofl, mark in spec:
                if not mark: continue
                every = {f.lower() for fs in hunt_paradigm(lemma, ofl).values() for f in fs}
                if w.lower() in every:
                    fail(f"{where}: '*{w}' is a standard BÍN form of '{lemma}' — it needs no star")
        if all(standard_word(w) for w in wrong.split()) and len(wrong.split()) == 1 \
           and any(k.ofl == spec[0][1] for k in b.lookup_ksnid(wrong.lower())[1] if _std(k)):
            fail(f"{where}: '*{wrong}' is a standard BÍN word of the same class — it needs no star")
    else:
        for w in wrong.split():
            if not standard_word(w):
                fail(f"{where}: '{w}' is not a standard BÍN form — mark it with * if that is meant")
    # what the explanation claims
    if "op" in it:
        verb, case = it["op"]
        cases = subject_cases(verb)
        if case not in cases: fail(f"{where}: BÍN does not list '{verb}' with a subject in {case}")
        if cases & {"ÞF", "ÞGF"} != {case}: fail(f"{where}: BÍN lists '{verb}' with subjects in {sorted(cases)}")
        if not verb_in(correct, verb): fail(f"{where}: no form of '{verb}' in the sentence")
    if "nf" in it:
        if subject_cases(it["nf"]) & {"ÞF", "ÞGF"}:
            fail(f"{where}: BÍN lists '{it['nf']}' with an oblique subject")
        if not verb_in(correct, it["nf"]): fail(f"{where}: no form of '{it['nf']}' in the sentence")
    if "gov" in it:
        g, case = it["gov"]
        table = GOV.PREP_CASES.get(g) or GOV.VERB_CASES.get(g)
        if table != {case}: fail(f"{where}: government.py has '{g}' governing {table}, not only {case}")
        if g in GOV.PREP_CASES:
            if g not in [w.lower() for w in WORD.findall(correct)]: fail(f"{where}: '{g}' is not in the sentence")
        elif not verb_in(correct, g): fail(f"{where}: no form of '{g}' in the sentence")
    toks = HUNT_TOKEN.findall(pre) + [right] + HUNT_TOKEN.findall(post)
    i = len(HUNT_TOKEN.findall(pre))
    if "".join(HUNT_TOKEN.findall(pre + post)) != re.sub(r"\s", "", pre + post):
        fail(f"{where}: a character the tokeniser does not know")
    if toks[-1] not in (".", "?", "!"): fail(f"{where}: no full stop")
    items.append({"b": it["band"], "t": correct, "toks": toks, "i": i, "w": wrong, "a": answers,
                  "why": it["why"], "p": it["p"], "ms": marks, "nw": star,
                  "l": [list(x) for x in spec]})
if len(items) < 80 and not ERR: fail(f"HUNT: {len(items)} items; the bank must hold at least 80")
out["hunt"] = items

# ---------------------------------------------------------------- Hver gerði hvað? (issue 27)
# A sentence, a verb, and who did what to whom. The key in the file is NOT
# taken on trust: each sentence is parsed and guarded exactly as a sentence
# of the bank is (build_sentences.annotate), who_did.py works the gerandi and
# the þolandi out of the tree, and an item whose parse says otherwise is
# refused. What is asked is meaning: in a passive the answer is not the
# frumlag (who_did.py, at the top).
#
# Everything the pupil reads beyond the sentence is put together here from
# BÍN: the options in the nominative (*kötturinn* for *kettinum*), the two
# questions (*Hver beit?*, *Hver var bitinn?*) and the plain active sentence
# the explanation ends in (*Kötturinn beit hundinn.*). That plain sentence is
# parsed too, and must give the same gerandi and þolandi.
import who_did as WD

ANIMATE = {"animal", "child", "critter", "job", "person", "group"}
WHO_LEVELS = {"þolmynd": (1,), "tilvísun": (3, 5)}

def who_did_items():
    import build_sentences as BS
    _g, _b, guard = BS.engines()
    takes_acc, parsed = WD.takes_acc, WD.analyse

    def noun_form(term, case, where):
        """The same noun in another case: same number, same definiteness."""
        m = term["m"] or ""
        tail = re.sub(r"^(NF|ÞF|ÞGF|EF)", "", m)
        gender = WD._gender(term)
        if not gender or tail not in ("ET", "ETgr"):
            fail(f"{where}: '{term['w']}' is not a singular noun whose form BÍN confirmed ({m})")
            return "?"
        return form(term["l"], gender, case + tail, where)[0]

    by_sentence = collections.OrderedDict()
    for lvl, kind, text, verb, who, whom, at in X._WHO_DID:
        by_sentence.setdefault(text, []).append((lvl, kind, verb, who, whom, at))
    items = []
    for text, lines in by_sentence.items():
        at = lines[0][5]
        where = f"{at} ({text})"
        lvl, kind = lines[0][0], lines[0][1]
        if kind not in WHO_LEVELS: fail(f"{where}: gerð á að vera „þolmynd“ eða „tilvísun“, ekki {kind!r}"); continue
        if lvl not in WHO_LEVELS[kind]:
            fail(f"{where}: þyngd {lvl} á ekki við gerðina {kind} (þolmynd 1; tilvísun 3 eða 5)"); continue
        if any((l[0], l[1]) != (lvl, kind) for l in lines):
            fail(f"{where}: línur sömu setningar hafa ekki sömu þyngd og gerð / the lines of one sentence differ in level or kind"); continue
        if len({l[2] for l in lines}) != len(lines):
            fail(f"{where}: sama sögnin tvisvar í sömu setningu / the same verb twice"); continue
        check_words(text, where)
        if blocked_words(text): fail(f"{where}: blocked word {blocked_words(text)}"); continue
        hard_before = len(guard.hard)
        got = parsed(text)
        if got is None: fail(f"{where}: setningin greinist ekki / the sentence does not parse"); continue
        if len(guard.hard) != hard_before:
            fail(f"{where}: the parse guard refused the analysis: {guard.hard[-1]}"); continue
        rec, tree, terms = got
        facts, people, bad = [], [], False
        for _lvl, _kind, verb, who, whom, line_at in lines:
            w = f"{line_at} ({text})"
            try:
                c = WD.check(tree, terms, takes_acc, verb, who, whom)
            except WD.Refused as e:
                fail(f"{w}: HAFNAÐ — {e}"); bad = True; continue
            for j in (c["who"], c["whom"]):
                if j is None: continue
                if terms[j].get("rj"): fail(f"{w}: the analysis of '{terms[j]['w']}' was withdrawn"); bad = True
                if NC.klass(terms[j]["l"]) not in ANIMATE:
                    fail(f"{w}: „{terms[j]['w']}“ er ekki skráð sem lifandi vera (noun_classes.py), og spurt er „Hver …?“ / "
                         "not listed as a living being"); bad = True
                if j not in people: people.append(j)
            v = terms[c["verb"]]
            past = terms[c["verb"]]["w"].lower() if not c["passive"] else form(verb, "so", "GM-FH-ÞT-3P-ET", w)[0]
            f = {"v": c["verb"], "l": verb, "who": c["who"], "whom": c["whom"], "qa": f"Hver {past}?"}
            if c["passive"]: f["pas"] = 1; f["aux"] = c["aux"]
            if c["rel"]: f["rel"] = c["rel"]
            who_nf = cap1(noun_form(terms[c["who"]], "NF", w)) if c["who"] is not None else "Einhver"
            if c["whom"] is not None:
                f["qp"] = "Hver var %s?" % form(verb, "so", "LHÞT-SB-KK-NFET", w)[0]
                f["p"] = "%s %s %s." % (who_nf, past, noun_form(terms[c["whom"]], "ÞF", w))
            else:
                f["p"] = "%s %s." % (who_nf, past)
            # the plain sentence says the same thing, by the same rules
            if not ERR or not bad:
                again = parsed(f["p"])
                if again is None: fail(f"{w}: einfalda setningin „{f['p']}“ greinist ekki"); bad = True
                elif c["who"] is not None:
                    _r2, tree2, terms2 = again
                    cs = [x for x in WD.clauses(tree2, terms2, takes_acc) if terms2[x["verb"]]["l"] == verb]
                    lem = lambda ts, j: None if j is None else ts[j]["l"]
                    if len(cs) != 1 or cs[0].get("error") or cs[0]["passive"] \
                            or lem(terms2, cs[0]["who"]) != lem(terms, c["who"]) \
                            or lem(terms2, cs[0]["whom"]) != lem(terms, c["whom"]):
                        fail(f"{w}: einfalda setningin „{f['p']}“ greinist ekki með sama geranda og þolanda / "
                             "the plain sentence does not parse to the same answer"); bad = True
            facts.append(f)
        if bad: continue
        if kind == "þolmynd" and not all(f.get("pas") and not f.get("rel") for f in facts):
            fail(f"{where}: gerðin er þolmynd en sögnin stendur ekki í þolmynd í aðalsetningu"); continue
        if kind == "tilvísun" and not any(f.get("rel") for f in facts):
            fail(f"{where}: gerðin er tilvísun en engin sögnin stendur í tilvísunarsetningu"); continue
        people.sort()
        s = {k: rec[k] for k in ("t", "tok", "cl", "ph", "ku") if k in rec}
        s["lvl"] = lvl
        items.append({"lvl": lvl, "k": kind, "s": s, "f": facts,
                      "n": [{"j": j, "nf": cap1(noun_form(terms[j], "NF", where))} for j in people]})
    if guard.hard: fail(f"_WHO_DID: the parse guard has {len(guard.hard)} hard error(s)")
    return items

out["hver"] = who_did_items()
print("hver gerði hvað: %d setningar, %d spurningar" % (
    len(out["hver"]), sum(1 + ("qp" in f) for it in out["hver"] for f in it["f"])))
for it in out["hver"]:
    for f in it["f"]:
        print("   þ%d %-9s %-52s %s %s → %s" % (it["lvl"], it["k"], it["s"]["t"], f["qa"], f.get("qp", ""), f["p"]))
# ---------------------------------------------------------------- Sameina og skipta
# Issue #29: two short sentences <-> one sentence with a subordinate clause
# (content/malbeiting/sameina.tsv, exercises.py COMBINE). The browser has no
# parser, so the parse is asked HERE, of every sentence a pupil's answer can
# be matched against (clause_shape.py says what is asked and why): each short
# sentence one main clause, each joined sentence exactly one subordinate
# clause of the pair's kind, opened by the pair's conjunction. And every
# word in BÍN and off the block list, as everywhere.
import clause_shape as CS
items = []
seen_pairs = set()
# "odd" (the column „óvenjulegt“): joined sentences that are right but unusual
# in everyday speech. The app accepts them and points to the model; they are
# parsed and checked here exactly as the other joined sentences are.
for lvl, kind, conj, first, second, joined, apart, line, odd in X.COMBINE:
    where = f"COMBINE content/malbeiting/sameina.tsv:{line} {first} {second}"
    if lvl not in (1, 2, 3): fail(f"{where}: þyngd must be 1, 2 or 3")
    if (first, second) in seen_pairs: fail(f"{where}: the pair twice")
    seen_pairs.add((first, second))
    for t in joined + odd + [t for pair in apart for t in pair]:
        check_words(t, where)
        if blocked_words(t): fail(f"{where}: a word on the block list ({t})")
    for why in CS.problems({"kind": kind, "conj": conj, "joined": joined + odd, "apart": apart}): fail(f"{where}: {why}")
    items.append({"lvl": lvl, "kind": kind, "conj": conj, "a": first, "b": second,
                  "joined": joined, "apart": apart, **({"odd": odd} if odd else {})})
out["combine"] = items

# ---------------------------------------------------------------- Textar (issue #30)
# content/textar/*.txt: short stories and subject texts for Lesskilningur.
# content_io.texts() is the one reader and holds every check on the format
# and its marks (the header, the length, the story-map parts, the pronoun
# referents against BÍN, the questions). What is added HERE is only what
# needs the parser: every sentence of every text is parsed and guarded
# exactly as a sentence of the bank is (build_sentences.annotate, with
# parse_guard.py), every word of it and of its questions is a word BÍN knows
# and none is on the block list. A sentence that does not parse stops the
# build with its file and line.
#
# The reader counts words without punctuation; the app draws tokens. A
# pronoun's place and its referent's are therefore turned into token indices
# here (`ref`), against the tokens the parse gave.
#
# The texts are read straight from content_io and not through exercises.py:
# build_freq.py lifts every string of that module as school material, and a
# new text must add a text and nothing else (the same reason _WHO_DID has
# its underscore).
import content_io as CIO

def text_items():
    import build_sentences as BS
    _g, _b, guard = BS.engines()
    try:
        read = CIO.texts(lambda w: [(e.ord, e.ofl, e.mark) for e in b.lookup(w)[1]])
    except CIO.ContentError as e:
        fail(str(e)); return []
    items = []
    for tx in read:
        sents, bad = [], False
        for s in tx["setningar"]:
            where = f"{tx.file}:{s['line']} ({s['t']})"
            check_words(s["t"], where)
            if blocked_words(s["t"]): fail(f"{where}: blocked word {blocked_words(s['t'])}"); bad = True; continue
            hard_before = len(guard.hard)
            rec = BS.annotate(tx["þyngd"], s["t"], None, "none")
            if rec is None: fail(f"{where}: setningin greinist ekki / the sentence does not parse"); bad = True; continue
            if len(guard.hard) != hard_before:
                fail(f"{where}: the parse guard refused the analysis: {guard.hard[-1]}"); bad = True; continue
            # word index (the reader's) -> token index (the parse's)
            at, covered = [], []
            for j, tk in enumerate(rec["tok"]):
                for part in tk["w"].split(" "):
                    if part.strip(CIO._EDGE):
                        at.append(j); covered.append(part.strip(CIO._EDGE))
            if covered != s["words"]:
                fail(f"{where}: orðin og tókarnir standast ekki á / the words and the parse's tokens differ: "
                     f"{s['words']} / {covered}"); bad = True; continue
            out = {k: rec[k] for k in ("t", "tok", "cl", "ph", "ku") if k in rec}
            out["p"] = s["part"]
            sents.append((out, at, s))
        if bad: continue
        for (out, at, s) in sents:
            refs = []
            for r in s["refs"]:
                where = f"{tx.file}:{s['line']} ({s['t']})"
                j = at[r["at"]]
                if out["tok"][j].get("c") != "fornafn":
                    fail(f"{where}: Greynir greinir „{out['tok'][j]['w']}“ ekki sem fornafn / "
                         "the parse does not read the marked word as a pronoun"); bad = True
                si, first, n = r["to"]
                to_at = sents[si][1]
                refs.append({"i": j, "to": [si, to_at[first], to_at[first + n - 1]]})
            if refs: out["ref"] = refs
        for q in tx["spurningar"]:
            where = f"{tx.file}:{q['line']} ({q['q']})"
            for t in [q["q"], q["a"], q["why"]] + q["w"]:
                check_words(t, where)
                if blocked_words(t): fail(f"{where}: blocked word {blocked_words(t)}"); bad = True
        if bad: continue
        items.append({"id": tx["id"], "lvl": tx["þyngd"], "k": tx["tegund"], "orð": tx["orð"],
                      "s": [o for o, _a, _s in sents],
                      "q": [{"k": q["mark"], "q": q["q"], "a": q["a"], "w": q["w"], "why": q["why"]}
                            for q in tx["spurningar"]]})
        print("   texti þ%d %-10s %-22s %d setningar, %d spurning(ar), %d vísanir fornafna; orð: %s"
              % (tx["þyngd"], tx["tegund"], tx["id"], len(sents), len(tx["spurningar"]),
                 sum(len(o.get("ref", [])) for o, _a, _s in sents),
                 ", ".join(tx["orð"]) or "—"))
    return items

out["textar"] = text_items()
print("textar: %d" % len(out["textar"]))

# ---------------------------------------------------------------- word lists
# Words that are ONE word class whatever BÍN entry they are read as, for
# sorting by word class without a sentence around them.
GROUP = {"kk": "nafnorð", "kvk": "nafnorð", "hk": "nafnorð", "lo": "lýsingarorð",
         "so": "sagnorð", "fn": "fornafn", "pfn": "fornafn", "afn": "fornafn",
         "to": "töluorð", "rt": "töluorð", "ao": "atviksorð", "fs": "forsetning",
         "st": "samtenging", "uh": "upphrópun"}
lexicon = json.load(open("data/lexicon.json"))
sortable = collections.defaultdict(list)
for w in sorted(lexicon["w"], key=lambda w: w.get("r", 1e9)):
    g = GROUP.get(w["c"])
    if not g or len(sortable[g]) >= 60: continue
    o = w["o"]
    if o in X.SORT_SKIP: continue
    if not re.fullmatch(r"[a-záéíóúýþæöð]{2,}", o): continue
    gs = {GROUP.get(c) for c in classes_of(o)}
    if gs != {g}: continue
    sortable[g].append(o)
out["sortable"] = dict(sortable)
out["para"] = PARA

if ERR:
    print("\n".join("  ✗ " + e for e in ERR), file=sys.stderr)
    print("  Atriðin eru í content/*/*.tsv: leitaðu að setningunni hér að ofan. / "
          "The items are in content/*/*.tsv: search for the sentence quoted above.", file=sys.stderr)
    print(f"build_exercises: {len(ERR)} problem(s); nothing written.", file=sys.stderr)
    sys.exit(1)

js = ("/* Built by build_exercises.py from exercises.py and BÍN. Do not edit. */\n"
      "export const EX=" + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
open("data/exercises.js", "w", encoding="utf8").write(js)
n = {k: (len(v) if isinstance(v, list) else "") for k, v in out.items()}
print("data/exercises.js —", ", ".join(f"{k} {v}" for k, v in n.items() if v != ""),
      "· sortable", {k: len(v) for k, v in sortable.items()})
