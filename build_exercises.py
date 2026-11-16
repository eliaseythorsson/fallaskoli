"""exercises.py -> data/exercises.js, every form out of BÍN.

What this build guarantees, item by item:
  * every answer, option and cue is a BÍN form of the lemma, class and mark
    written in exercises.py (core vocabulary, standard form — the same filter
    as build_lexicon.py), with BÍN's double forms kept as alternatives;
  * every other word in every sentence is a word BÍN knows;
  * the claims the items make about word classes (an adverb, a preposition,
    a conjunction) are classes BÍN gives that word;
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

PARA = {}
def keep(lemma, ofl):
    lemma = lemma.split(":")[0]
    PARA[f"{lemma}|{ofl}"] = paradigm(lemma, ofl)

out = {"v": 1}

# ---------------------------------------------------------------- Fornöfn
items = []
for t, (l, c, m), why in X.PRONOUN_GAP:
    where = f"PRONOUN_GAP {t}"
    t2 = resolve(t, where)
    a = form(l, c, m, where)
    check_words(t2.replace("___", a[0]), where)
    keep(l, c)
    items.append({"t": t2, "l": l, "c": c, "m": m, "a": a, "cue": nf_cue(l, c, m), "why": why})
out["pronounGap"] = items

items = []
for t, gloss, (l1, c1, m1), (l2, c2, m2) in X.REFLEXIVE:
    where = f"REFLEXIVE {t} / {gloss}"
    a = form(l1, c1, m1, where); w = form(l2, c2, m2, where)
    if set(a) & set(w): fail(f"{where}: the two options share a form")
    check_words(t.replace("___", a[0]) + " " + gloss, where)
    items.append({"t": t, "gloss": gloss, "a": a[0], "w": w[0],
                  "reflexive": c1 in ("afn",) or l1 == "sinn"})
out["reflexive"] = items

# ---------------------------------------------------------------- Töluorð
CARD = {1: ("einn", "to"), 2: ("tveir", "to"), 3: ("þrír", "to"), 4: ("fjórir", "to")}
KYN = {"kk": "KK", "kvk": "KVK", "hk": "HK"}
items = []
for t, case, ns, nouns in X.NUMERAL_AGREE:
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
                          "l": l, "c": c, "m": f"{KYN[g]}-{case}{num}", "a": a})
out["numeralAgree"] = items

items = []
for noun in X.PLURAL_ONLY_NOUNS:
    g = noun_gender(noun, "PLURAL_ONLY_NOUNS")
    p = paradigm(noun, g) if g else {}
    if any(k.startswith(("NFET", "ÞFET", "ÞGFET", "EFET")) for k in p):
        fail(f"PLURAL_ONLY_NOUNS: '{noun}' has singular forms in BÍN")
for t, case, ns, nouns in X.NUMERAL_PLURAL_ONLY:
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
                          "a": a, "plain": plain})
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
for t, case, why in X.DATE_FRAMES:
    check_words(t.replace("{M}", "maí").replace("___", ORD[3][case][0]), f"DATE_FRAMES {t}")
    frames.append({"t": t, "case": case, "why": why})
out["dates"] = {"ord": ORD, "months": X.MONTHS, "days": X.DAYS_IN, "frames": frames}

# ---------------------------------------------------------------- Fallstjórn
items = []
for t, noun, col, motion in X.MOTION_REST:
    where = f"MOTION_REST {t}"
    g = noun_gender(noun, where)
    if not g: continue
    thf = form(noun, g, "ÞF" + col, where); thgf = form(noun, g, "ÞGF" + col, where)
    if set(thf) & set(thgf): fail(f"{where}: þolfall and þágufall are the same form")
    check_words(t.replace("___", (thf if motion else thgf)[0]), where)
    prep = re.search(r"\b(í|á|undir|yfir)\s+___", t)
    if not prep: fail(f"{where}: no í/á/undir/yfir before the blank")
    keep(noun, g)
    items.append({"t": t, "noun": noun, "g": g, "col": col, "motion": motion,
                  "thf": thf, "thgf": thgf, "prep": prep.group(1) if prep else ""})
out["motionRest"] = items

CASEW = {"NF": "nefnifall", "ÞF": "þolfall", "ÞGF": "þágufall", "EF": "eignarfall"}
items = []
def verb_in(text, verb):
    """True when some word of `text` is a BÍN form of the verb `verb`."""
    for w in WORD.findall(text):
        _, ms = b.lookup(w)
        if any(e.ofl == "so" and e.ord == verb for e in ms): return True
    return False
for t, verb, case, col, nouns in X.VERB_CASE:
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
                      "m": case + col, "a": a, "cue": cue})
out["verbCase"] = items

items = []
for t, (l, c, m), verb, why in X.IMPERSONAL:
    where = f"IMPERSONAL {t}"
    a = form(l, c, m, where)
    check_words(t.replace("___", a[0]), where)
    if "so" not in classes_of(verb): fail(f"{where}: '{verb}' is not a verb")
    keep(l, c)
    items.append({"t": t, "l": l, "c": c, "m": m, "a": a, "cue": nf_cue(l, c, m),
                  "verb": verb, "why": why})
out["impersonal"] = items

# ---------------------------------------------------------------- Óbeygjanleg
items = []
for t, w, cls in X.ADV_OR_PREP:
    where = f"ADV_OR_PREP {t}"
    check_words(t, where)
    words = WORD.findall(t)
    if w not in [x.lower() for x in words]: fail(f"{where}: '{w}' is not in the sentence")
    if cls not in classes_of(w): fail(f"{where}: BÍN does not list '{w}' as {cls}")
    other = "ao" if cls == "fs" else "fs"
    if other not in classes_of(w): fail(f"{where}: BÍN does not list '{w}' as {other} — no contrast")
    items.append({"t": t, "w": w, "c": cls})
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
for t, right, wrong, why in X.CONJUNCTION:
    where = f"CONJUNCTION {t}"
    check_words(t.replace("___", right), where)
    if t.count("___") != 1: fail(f"{where}: exactly one blank")
    opts = [right] + wrong
    if len(set(opts)) != len(opts): fail(f"{where}: an option twice")
    if len(wrong) != 3: fail(f"{where}: three wrong options")
    for o in opts:
        if not is_conjunction(o): fail(f"{where}: BÍN does not list '{o}' as a conjunction")
    items.append({"t": t, "a": right, "w": wrong, "why": why})
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
for t, mark, right, wrong in X.WORD_IN_CONTEXT:
    where = f"WORD_IN_CONTEXT {t}"
    opts = []
    for lemma in [right] + wrong:
        g = noun_gender(lemma, where)
        if not g: continue
        opts.append({"o": lemma.split(":")[0], "c": g, "f": form(lemma, g, mark, where)[0]})
    if len({o["f"] for o in opts}) != len(opts): fail(f"{where}: two options with the same form")
    if opts: check_words(t.replace("___", opts[0]["f"]), where)
    items.append({"t": t, "m": mark, "a": opts[0] if opts else None, "w": opts[1:]})
out["wordInContext"] = items

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
