"""exercises.py -> data/exercises.js, every form out of BÍN.

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
            m = re.sub(r'\d', '', e.mark)
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
for lvl, t, case, why in X.DATE_FRAMES:
    level(lvl, f"DATE_FRAMES {t}")
    check_words(t.replace("{M}", "maí").replace("___", ORD[3][case][0]), f"DATE_FRAMES {t}")
    frames.append({"t": t, "case": case, "why": why, "lvl": lvl})
out["dates"] = {"ord": ORD, "months": X.MONTHS, "days": X.DAYS_IN, "frames": frames}

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

CASEW = {"NF": "nefnifall", "ÞF": "þolfall", "ÞGF": "þágufall", "EF": "eignarfall"}
items = []
def verb_in(text, verb):
    """True when some word of `text` is a BÍN form of the verb `verb`."""
    for w in WORD.findall(text):
        _, ms = b.lookup(w)
        if any(e.ofl == "so" and e.ord == verb for e in ms): return True
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
        check_words(t.replace("___", a[0]), where)
        keep(noun, g)
        items.append({"t": t, "verb": verb, "case": case, "noun": noun.split(":")[0], "g": g,
                      "m": case + col, "a": a, "cue": cue, "lvl": lvl})
out["verbCase"] = items

items = []
for lvl, t, (l, c, m), verb, why in X.IMPERSONAL:
    where = f"IMPERSONAL {t}"
    level(lvl, where)
    a = form(l, c, m, where)
    check_words(t.replace("___", a[0]), where)
    if "so" not in classes_of(verb): fail(f"{where}: '{verb}' is not a verb")
    keep(l, c)
    items.append({"t": t, "l": l, "c": c, "m": m, "a": a, "cue": nf_cue(l, c, m),
                  "verb": verb, "why": why, "lvl": lvl})
out["impersonal"] = items

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
out["conjunction"] = items

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
_freq = json.load(open("freq_lemmas.json"))
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

items = []
for lvl, t, mark, right, wrong in X.WORD_IN_CONTEXT:
    where = f"WORD_IN_CONTEXT {t}"
    level(lvl, where)
    opts = []
    for lemma in [right] + wrong:
        g = noun_gender(lemma, where)
        if not g: continue
        opts.append({"o": lemma.split(":")[0], "c": g, "f": form(lemma, g, mark, where)[0]})
    if len({o["f"] for o in opts}) != len(opts): fail(f"{where}: two options with the same form")
    if opts: check_words(t.replace("___", opts[0]["f"]), where)
    items.append({"t": t, "m": mark, "a": opts[0] if opts else None, "w": opts[1:], "lvl": lvl})
out["wordInContext"] = items

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
def _std(e):
    return (e.birting == 'K' and e.einkunn == 1 and e.beinkunn == 1
            and not e.malsnid and not e.bmalsnid)

_hcache = {}
def hunt_paradigm(lemma, ofl):
    """{mark: [forms]}, core standard forms only — as `paradigm`, but the
    person stays in the mark (GM-FH-NT-1P-ET): `paradigm` strips every digit,
    which is right for the numbered variants (NFET2) and folds *vil* and
    *vill* into one cell. Only a digit that is not a person is a variant."""
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

# ---------------------------------------------------------------- word lists
# Words that are ONE word class whatever BÍN entry they are read as, for
# sorting by word class without a sentence around them.
GROUP = {"kk": "nafnorð", "kvk": "nafnorð", "hk": "nafnorð", "lo": "lýsingarorð",
         "so": "sagnorð", "fn": "fornafn", "pfn": "fornafn", "afn": "fornafn",
         "to": "töluorð", "rt": "töluorð", "ao": "atviksorð", "fs": "forsetning",
         "st": "samtenging", "uh": "upphrópun"}
lexicon = json.load(open("lexicon.json"))
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
    print(f"build_exercises: {len(ERR)} problem(s); nothing written.", file=sys.stderr)
    sys.exit(1)

js = ("/* Built by build_exercises.py from exercises.py and BÍN. Do not edit. */\n"
      "export const EX=" + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
open("data/exercises.js", "w", encoding="utf8").write(js)
n = {k: (len(v) if isinstance(v, list) else "") for k, v in out.items()}
print("data/exercises.js —", ", ".join(f"{k} {v}" for k, v in n.items() if v != ""),
      "· sortable", {k: len(v) for k, v in sortable.items()})
